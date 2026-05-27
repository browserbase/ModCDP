// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/injector/CDPExtensionInjector.ts
// - ./python/modcdp/injector/CDPExtensionInjector.py
package injector

import (
	"fmt"
	"os"
	"strings"
	"time"
)

type CDPExtensionInjector struct {
	ExtensionInjector
	UnpackedExtensionPath string
	CleanupPath           string
}

func NewCDPExtensionInjector(options InjectorOptions) CDPExtensionInjector {
	return CDPExtensionInjector{ExtensionInjector: NewExtensionInjector(options)}
}

func (i *CDPExtensionInjector) Prepare() error {
	extensionPath := i.Options.InjectorCDPExtensionPath
	if i.UnpackedExtensionPath != "" {
		return nil
	}
	unpackedPath, cleanupPath, err := prepareUnpackedExtension(extensionPath)
	if err != nil {
		return err
	}
	i.UnpackedExtensionPath = unpackedPath
	i.CleanupPath = cleanupPath
	return nil
}

func (i *CDPExtensionInjector) Inject() (*ExtensionInjectionResult, error) {
	if i.UnpackedExtensionPath == "" {
		return nil, nil
	}
	loadResult, err := i.sendWithTimeout("Extensions.loadUnpacked", map[string]any{"path": i.UnpackedExtensionPath}, "", i.Options.InjectorCDPSendTimeoutMS)
	if err != nil {
		if strings.Contains(err.Error(), "Method not available") || strings.Contains(err.Error(), "Method not found") || strings.Contains(err.Error(), "wasn't found") {
			i.LastError = err
			return nil, nil
		}
		return nil, fmt.Errorf("Extensions.loadUnpacked failed for %s: %w", i.UnpackedExtensionPath, err)
	}
	extensionID, _ := loadResult["id"].(string)
	if extensionID == "" {
		extensionID, _ = loadResult["extensionId"].(string)
	}
	if extensionID == "" {
		return nil, fmt.Errorf("Extensions.loadUnpacked returned no extension id")
	}
	i.Options.InjectorCDPExtensionID = extensionID
	i.Options.InjectorServiceWorkerExtensionID = extensionID
	swURLPrefix := "chrome-extension://" + extensionID + "/"
	deadline := time.Now().Add(time.Duration(i.Options.InjectorServiceWorkerReadyTimeoutMS) * time.Millisecond)
	for time.Now().Before(deadline) {
		targets, err := i.targetInfos()
		if err != nil {
			return nil, err
		}
		for _, target := range targets {
			targetType, _ := target["type"].(string)
			targetURL, _ := target["url"].(string)
			if targetType != "service_worker" || !strings.HasPrefix(targetURL, swURLPrefix) {
				continue
			}
			probed, err := i.probeTarget(target, i.Options.InjectorServiceWorkerProbeTimeoutMS, true)
			if err != nil {
				return nil, err
			}
			if probed != nil {
				probed.Source = "cdp"
				probed.ExtensionID = extensionID
				return probed, nil
			}
		}
		time.Sleep(time.Duration(i.Options.InjectorServiceWorkerPollIntervalMS) * time.Millisecond)
	}
	return nil, fmt.Errorf("timed out waiting for service worker target for extension %s", extensionID)
}

func (i *CDPExtensionInjector) Close() error {
	if i.CleanupPath != "" {
		_ = os.RemoveAll(i.CleanupPath)
		i.CleanupPath = ""
	}
	return nil
}
