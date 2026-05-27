// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/injector/BorrowExtensionInjector.ts
// - ./python/modcdp/injector/BorrowExtensionInjector.py
package injector

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type BorrowExtensionInjector struct {
	ExtensionInjector
	UnpackedExtensionPath           string
	CleanupPath                     string
	BootstrapModCDPServerExpression string
}

const borrowBootstrapStatusExpression = `(() => ({
  ok: Boolean(globalThis.ModCDP?.handleCommand && globalThis.ModCDP?.addCustomEvent),
  extension_id: globalThis.chrome?.runtime?.id ?? null,
  has_tabs: Boolean(globalThis.chrome?.tabs?.query),
  has_debugger: Boolean(globalThis.chrome?.debugger?.sendCommand && globalThis.chrome?.debugger?.getTargets),
}))()`

type borrowedExtensionCandidate struct {
	result      *ExtensionInjectionResult
	hasTabs     bool
	hasDebugger bool
}

func NewBorrowExtensionInjector(options InjectorOptions) BorrowExtensionInjector {
	return BorrowExtensionInjector{ExtensionInjector: NewExtensionInjector(options)}
}

func (i *BorrowExtensionInjector) Prepare() error {
	if i.BootstrapModCDPServerExpression != "" {
		return nil
	}
	unpackedPath, cleanupPath, err := prepareUnpackedExtension(i.Config.InjectorBorrowExtensionPath)
	if err != nil {
		return err
	}
	i.UnpackedExtensionPath = unpackedPath
	i.CleanupPath = cleanupPath
	body, err := os.ReadFile(filepath.Join(i.UnpackedExtensionPath, "modcdp", "service_worker.js"))
	if err != nil {
		_ = os.RemoveAll(i.CleanupPath)
		i.CleanupPath = ""
		i.UnpackedExtensionPath = ""
		return err
	}
	source := string(body)
	i.BootstrapModCDPServerExpression = fmt.Sprintf(`async function() {
if (!globalThis.ModCDP) {
%s
}
const ModCDP = globalThis.ModCDP;
return {
  ok: Boolean(ModCDP?.handleCommand && ModCDP?.addCustomEvent),
  extension_id: globalThis.chrome?.runtime?.id ?? null,
  has_tabs: Boolean(globalThis.chrome?.tabs?.query),
  has_debugger: Boolean(globalThis.chrome?.debugger?.sendCommand && globalThis.chrome?.debugger?.getTargets),
};
}`, source)
	return nil
}

func (i *BorrowExtensionInjector) Close() error {
	if i.CleanupPath != "" {
		_ = os.RemoveAll(i.CleanupPath)
		i.CleanupPath = ""
	}
	return nil
}

func (i *BorrowExtensionInjector) Inject() (*ExtensionInjectionResult, error) {
	deadline := time.Now().Add(time.Duration(i.Config.InjectorServiceWorkerReadyTimeoutMS) * time.Millisecond)
	for {
		borrowed, err := i.borrowVisibleServiceWorkers()
		if err != nil || borrowed != nil {
			return borrowed, err
		}
		if time.Now().After(deadline) {
			return nil, nil
		}
		time.Sleep(time.Duration(i.Config.InjectorServiceWorkerPollIntervalMS) * time.Millisecond)
	}
}

func (i *BorrowExtensionInjector) borrowVisibleServiceWorkers() (*ExtensionInjectionResult, error) {
	targets, err := i.targetInfos()
	if err != nil {
		return nil, err
	}
	hasConfiguredMatcher := i.Config.InjectorServiceWorkerExtensionID != "" || len(i.Config.InjectorServiceWorkerURLIncludes) > 0 || len(i.Config.InjectorServiceWorkerURLSuffixes) > 0
	candidates := []map[string]any{}
	for _, target := range targets {
		targetType, _ := target["type"].(string)
		targetURL, _ := target["url"].(string)
		if targetType != "service_worker" || !strings.HasPrefix(targetURL, "chrome-extension://") {
			continue
		}
		if hasConfiguredMatcher && !i.serviceWorkerTargetMatches(target) {
			continue
		}
		candidates = append(candidates, target)
	}
	var borrowed []borrowedExtensionCandidate
	for _, target := range candidates {
		bootstrapped, err := i.bootstrapTarget(target)
		if err == nil && bootstrapped != nil {
			borrowed = append(borrowed, *bootstrapped)
		}
	}
	sort.SliceStable(borrowed, func(left, right int) bool {
		if borrowed[left].hasDebugger != borrowed[right].hasDebugger {
			return borrowed[left].hasDebugger
		}
		return borrowed[left].hasTabs && !borrowed[right].hasTabs
	})
	if len(borrowed) == 0 {
		return nil, nil
	}
	return borrowed[0].result, nil
}

func (i *BorrowExtensionInjector) bootstrapTarget(target map[string]any) (*borrowedExtensionCandidate, error) {
	targetID, _ := target["targetId"].(string)
	targetURL, _ := target["url"].(string)
	attached, err := i.sendWithTimeout("Target.attachToTarget", map[string]any{"targetId": targetID, "flatten": true}, "", i.Config.InjectorServiceWorkerProbeTimeoutMS)
	if err != nil {
		return nil, err
	}
	sessionID, _ := attached["sessionId"].(string)
	if sessionID == "" {
		return nil, fmt.Errorf("Target.attachToTarget returned no sessionId for targetId=%s", targetID)
	}
	detach := func() {
		_, _ = i.sendWithTimeout("Target.detachFromTarget", map[string]any{"sessionId": sessionID}, "", i.Config.InjectorCDPSendTimeoutMS)
	}
	_, _ = i.sendWithTimeout("Runtime.enable", map[string]any{}, sessionID, i.Config.InjectorCDPSendTimeoutMS)
	status, err := i.sendWithTimeout("Runtime.evaluate", map[string]any{
		"expression":    borrowBootstrapStatusExpression,
		"returnByValue": true,
	}, sessionID, i.Config.InjectorCDPSendTimeoutMS)
	if err != nil {
		detach()
		return nil, err
	}
	result, _ := status["result"].(map[string]any)
	value, _ := result["value"].(map[string]any)
	if hasTabs, _ := value["has_tabs"].(bool); !hasTabs {
		detach()
		return nil, nil
	}
	if hasDebugger, _ := value["has_debugger"].(bool); !hasDebugger {
		detach()
		return nil, nil
	}
	if ok, _ := value["ok"].(bool); !ok {
		if i.BootstrapModCDPServerExpression == "" {
			detach()
			return nil, fmt.Errorf("BorrowExtensionInjector requires Prepare before Inject")
		}
		probe, err := i.sendWithTimeout("Runtime.evaluate", map[string]any{
			"expression":    fmt.Sprintf("(%s)()", i.BootstrapModCDPServerExpression),
			"awaitPromise":  true,
			"returnByValue": true,
		}, sessionID, i.Config.InjectorCDPSendTimeoutMS)
		if err != nil {
			detach()
			return nil, err
		}
		result, _ = probe["result"].(map[string]any)
		value, _ = result["value"].(map[string]any)
		if hasTabs, _ := value["has_tabs"].(bool); !hasTabs {
			detach()
			return nil, nil
		}
		if hasDebugger, _ := value["has_debugger"].(bool); !hasDebugger {
			detach()
			return nil, nil
		}
	}
	ready, _ := value["ok"].(bool)
	if ready && i.readyExpression() != modcdpReadyExpression {
		readyProbe, err := i.sendWithTimeout("Runtime.evaluate", map[string]any{
			"expression":    i.readyExpression(),
			"returnByValue": true,
		}, sessionID, i.Config.InjectorCDPSendTimeoutMS)
		if err != nil {
			detach()
			return nil, err
		}
		readyResult, _ := readyProbe["result"].(map[string]any)
		ready, _ = readyResult["value"].(bool)
	}
	if !ready {
		detach()
		return nil, nil
	}
	extensionID, _ := value["extension_id"].(string)
	if extensionID == "" {
		if match := extIDFromURL.FindStringSubmatch(targetURL); len(match) > 1 {
			extensionID = match[1]
		}
	}
	hasTabs, _ := value["has_tabs"].(bool)
	hasDebugger, _ := value["has_debugger"].(bool)
	return &borrowedExtensionCandidate{
		result: &ExtensionInjectionResult{
			Source:      "borrow",
			ExtensionID: extensionID,
			TargetID:    targetID,
			URL:         targetURL,
			SessionID:   sessionID,
		},
		hasTabs:     hasTabs,
		hasDebugger: hasDebugger,
	}, nil
}
