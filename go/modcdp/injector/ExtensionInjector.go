// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/injector/ExtensionInjector.ts
// - ./python/modcdp/injector/ExtensionInjector.py
package injector

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/browserbase/modcdp/go/modcdp/types"
)

const DefaultModCDPExtensionID = "mdedooklbnfejodmnhmkdpkaedafkehf"
const DefaultCDPSendTimeoutMS = 10_000
const DefaultExecutionContextTimeoutMS = 10_000
const DefaultServiceWorkerProbeTimeoutMS = 10_000
const DefaultServiceWorkerReadyTimeoutMS = 60_000
const DefaultServiceWorkerPollIntervalMS = 100
const DefaultTargetSessionPollIntervalMS = 20

var DefaultModCDPServiceWorkerURLSuffixes = []string{"/modcdp/service_worker.js"}
var extIDFromURL = regexp.MustCompile(`^chrome-extension://([a-z]+)/`)

const modcdpReadyExpression = `Boolean(globalThis.ModCDP?.handleCommand && globalThis.ModCDP?.addCustomEvent)`

type SendCDP = types.SendCDP
type LauncherConfig = types.LauncherConfig
type InjectorConfig = types.InjectorConfig
type ExtensionInjectionResult = types.ExtensionInjectionResult

func boolPtr(value bool) *bool {
	return &value
}

type ExtensionInjector struct {
	Config                   InjectorConfig
	Source                   string
	ExtensionID              string
	ServiceWorkerExtensionID string
	TargetID                 string
	URL                      string
	SessionID                string
	UnusableTargetIDs        map[string]bool
	ExtraArgs                []string
}

func NewExtensionInjector(config InjectorConfig) ExtensionInjector {
	if config.InjectorCDPSendTimeoutMS == 0 {
		config.InjectorCDPSendTimeoutMS = DefaultCDPSendTimeoutMS
	}
	if config.InjectorExecutionContextTimeoutMS == 0 {
		config.InjectorExecutionContextTimeoutMS = DefaultExecutionContextTimeoutMS
	}
	if config.InjectorServiceWorkerProbeTimeoutMS == 0 {
		config.InjectorServiceWorkerProbeTimeoutMS = DefaultServiceWorkerProbeTimeoutMS
	}
	if config.InjectorServiceWorkerReadyTimeoutMS == 0 {
		config.InjectorServiceWorkerReadyTimeoutMS = DefaultServiceWorkerReadyTimeoutMS
	}
	if config.InjectorServiceWorkerPollIntervalMS == 0 {
		config.InjectorServiceWorkerPollIntervalMS = DefaultServiceWorkerPollIntervalMS
	}
	if config.InjectorTargetSessionPollIntervalMS == 0 {
		config.InjectorTargetSessionPollIntervalMS = DefaultTargetSessionPollIntervalMS
	}
	if config.InjectorBBBaseURL == "" {
		config.InjectorBBBaseURL = DefaultBrowserbaseBaseURL
	}
	return ExtensionInjector{Config: config, UnusableTargetIDs: map[string]bool{}}
}

func (i *ExtensionInjector) Update(config InjectorConfig) *ExtensionInjector {
	if config.Send != nil {
		i.Config.Send = config.Send
	}
	if config.InjectorCLIExtensionPath != "" {
		i.Config.InjectorCLIExtensionPath = config.InjectorCLIExtensionPath
	}
	if config.InjectorCLIExtensionID != "" {
		i.Config.InjectorCLIExtensionID = config.InjectorCLIExtensionID
	}
	if config.InjectorCDPExtensionPath != "" {
		i.Config.InjectorCDPExtensionPath = config.InjectorCDPExtensionPath
	}
	if config.InjectorCDPExtensionID != "" {
		i.Config.InjectorCDPExtensionID = config.InjectorCDPExtensionID
	}
	if config.InjectorBBExtensionPath != "" {
		i.Config.InjectorBBExtensionPath = config.InjectorBBExtensionPath
	}
	if config.InjectorBBExtensionID != "" {
		i.Config.InjectorBBExtensionID = config.InjectorBBExtensionID
	}
	if config.InjectorDiscoverExtensionPath != "" {
		i.Config.InjectorDiscoverExtensionPath = config.InjectorDiscoverExtensionPath
	}
	if config.InjectorServiceWorkerExtensionID != "" {
		i.Config.InjectorServiceWorkerExtensionID = config.InjectorServiceWorkerExtensionID
	}
	if config.InjectorServiceWorkerURLIncludes != nil {
		i.Config.InjectorServiceWorkerURLIncludes = append([]string{}, config.InjectorServiceWorkerURLIncludes...)
	}
	if config.InjectorServiceWorkerURLSuffixes != nil {
		i.Config.InjectorServiceWorkerURLSuffixes = append([]string{}, config.InjectorServiceWorkerURLSuffixes...)
	}
	if config.InjectorTrustServiceWorkerTarget {
		i.Config.InjectorTrustServiceWorkerTarget = true
	}
	if config.InjectorRequireServiceWorkerTarget {
		i.Config.InjectorRequireServiceWorkerTarget = true
	}
	if config.InjectorServiceWorkerReadyExpression != "" {
		i.Config.InjectorServiceWorkerReadyExpression = config.InjectorServiceWorkerReadyExpression
	}
	if config.InjectorCDPSendTimeoutMS != 0 {
		i.Config.InjectorCDPSendTimeoutMS = config.InjectorCDPSendTimeoutMS
	}
	if config.InjectorExecutionContextTimeoutMS != 0 {
		i.Config.InjectorExecutionContextTimeoutMS = config.InjectorExecutionContextTimeoutMS
	}
	if config.InjectorServiceWorkerProbeTimeoutMS != 0 {
		i.Config.InjectorServiceWorkerProbeTimeoutMS = config.InjectorServiceWorkerProbeTimeoutMS
	}
	if config.InjectorServiceWorkerReadyTimeoutMS != 0 {
		i.Config.InjectorServiceWorkerReadyTimeoutMS = config.InjectorServiceWorkerReadyTimeoutMS
	}
	if config.InjectorServiceWorkerPollIntervalMS != 0 {
		i.Config.InjectorServiceWorkerPollIntervalMS = config.InjectorServiceWorkerPollIntervalMS
	}
	if config.InjectorTargetSessionPollIntervalMS != 0 {
		i.Config.InjectorTargetSessionPollIntervalMS = config.InjectorTargetSessionPollIntervalMS
	}
	if config.InjectorBBAPIKey != "" {
		i.Config.InjectorBBAPIKey = config.InjectorBBAPIKey
	}
	if config.InjectorBBBaseURL != "" {
		i.Config.InjectorBBBaseURL = config.InjectorBBBaseURL
	}
	return i
}

func (i *ExtensionInjector) RecordInjectionResult(result *ExtensionInjectionResult) *ExtensionInjector {
	i.Source = result.Source
	i.ExtensionID = result.ExtensionID
	if result.ExtensionID != "" {
		i.ServiceWorkerExtensionID = result.ExtensionID
	}
	i.TargetID = result.TargetID
	i.URL = result.URL
	i.SessionID = result.SessionID
	return i
}

func (i ExtensionInjector) ConfigForLauncher() LauncherConfig {
	return LauncherConfig{
		LauncherLocalExtraArgs: i.ExtraArgs,
		LauncherBBExtensionID:  i.Config.InjectorBBExtensionID,
	}
}

func (i ExtensionInjector) ConfigForUpstream() map[string]any {
	return map[string]any{}
}

func (i ExtensionInjector) ToJSON() map[string]any {
	config := i.Config
	config.Send = nil
	return types.ModCDPToJSON(i, types.ModCDPJSONConfig{Config: config})
}

func (i *ExtensionInjector) Prepare() error {
	return nil
}

func (i *ExtensionInjector) Close() error {
	return nil
}

func (i *ExtensionInjector) Inject() (*ExtensionInjectionResult, error) {
	return nil, fmt.Errorf("%T.Inject is not implemented", i)
}

func (i ExtensionInjector) readyExpression() string {
	if i.Config.InjectorServiceWorkerReadyExpression == "" || i.Config.InjectorServiceWorkerReadyExpression == modcdpReadyExpression {
		return modcdpReadyExpression
	}
	return fmt.Sprintf("(%s) && Boolean(%s)", modcdpReadyExpression, i.Config.InjectorServiceWorkerReadyExpression)
}

func (i ExtensionInjector) sendWithTimeout(method string, params map[string]any, sessionID string, timeoutMS int) (map[string]any, error) {
	if i.Config.Send == nil {
		return nil, fmt.Errorf("%T requires a CDP send function", i)
	}
	if params == nil {
		params = map[string]any{}
	}
	if timeoutMS == 0 {
		timeoutMS = i.Config.InjectorCDPSendTimeoutMS
	}
	if timeoutMS <= 0 {
		return i.Config.Send(method, params, sessionID)
	}
	type sendResult struct {
		result map[string]any
		err    error
	}
	done := make(chan sendResult, 1)
	go func() {
		result, err := i.Config.Send(method, params, sessionID)
		done <- sendResult{result: result, err: err}
	}()
	select {
	case result := <-done:
		return result.result, result.err
	case <-time.After(time.Duration(timeoutMS) * time.Millisecond):
		return nil, fmt.Errorf("%s timed out after %dms", method, timeoutMS)
	}
}

func (i ExtensionInjector) targetInfos() ([]map[string]any, error) {
	result, err := i.sendWithTimeout("Target.getTargets", map[string]any{}, "", i.Config.InjectorCDPSendTimeoutMS)
	if err != nil {
		return nil, err
	}
	rawTargets, _ := result["targetInfos"].([]any)
	targets := make([]map[string]any, 0, len(rawTargets))
	for _, rawTarget := range rawTargets {
		target, _ := rawTarget.(map[string]any)
		if target != nil {
			targets = append(targets, target)
		}
	}
	return targets, nil
}

func (i ExtensionInjector) probeTarget(target map[string]any, sessionTimeoutMS int, allowAttach bool) (*ExtensionInjectionResult, error) {
	targetID, _ := target["targetId"].(string)
	targetURL, _ := target["url"].(string)
	if targetID == "" || i.UnusableTargetIDs[targetID] {
		return nil, nil
	}
	attached, err := i.sendWithTimeout("Target.attachToTarget", map[string]any{"targetId": targetID, "flatten": true}, "", sessionTimeoutMS)
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
	if _, err := i.sendWithTimeout("Runtime.enable", map[string]any{}, sessionID, i.Config.InjectorCDPSendTimeoutMS); err != nil {
		detach()
		return nil, err
	}
	probe, err := i.sendWithTimeout("Runtime.evaluate", map[string]any{
		"expression":    i.readyExpression(),
		"returnByValue": true,
	}, sessionID, i.Config.InjectorCDPSendTimeoutMS)
	if err != nil {
		detach()
		return nil, err
	}
	result, _ := probe["result"].(map[string]any)
	if ready, _ := result["value"].(bool); !ready {
		detach()
		return nil, nil
	}
	extensionID := ""
	if m := extIDFromURL.FindStringSubmatch(targetURL); len(m) > 1 {
		extensionID = m[1]
	}
	return &ExtensionInjectionResult{
		Source:      "discover",
		ExtensionID: extensionID,
		TargetID:    targetID,
		URL:         targetURL,
		SessionID:   sessionID,
	}, nil
}

func (i ExtensionInjector) discoverReadyServiceWorker(matchedOnly bool) (*ExtensionInjectionResult, error) {
	targets, err := i.targetInfos()
	if err != nil {
		return nil, err
	}
	if i.Config.InjectorTrustServiceWorkerTarget {
		for _, target := range targets {
			if !i.serviceWorkerTargetMatches(target) {
				continue
			}
			probed, err := i.probeTarget(target, i.Config.InjectorServiceWorkerProbeTimeoutMS, true)
			if err != nil {
				return nil, err
			}
			if probed != nil {
				probed.Source = "trusted"
				return probed, nil
			}
		}
	}
	if i.Config.InjectorTrustServiceWorkerTarget || matchedOnly {
		return nil, nil
	}
	for _, target := range targets {
		targetType, _ := target["type"].(string)
		targetURL, _ := target["url"].(string)
		if targetType != "service_worker" || !strings.HasPrefix(targetURL, "chrome-extension://") {
			continue
		}
		probed, err := i.probeTarget(target, i.Config.InjectorServiceWorkerProbeTimeoutMS, false)
		if err == nil && probed != nil {
			return probed, nil
		}
	}
	return nil, nil
}

func (i ExtensionInjector) waitForReadyServiceWorker(timeoutMS int, matchedOnly bool) (*ExtensionInjectionResult, error) {
	deadline := time.Now().Add(time.Duration(timeoutMS) * time.Millisecond)
	for time.Now().Before(deadline) {
		discovered, err := i.discoverReadyServiceWorker(matchedOnly)
		if err != nil || discovered != nil {
			return discovered, err
		}
		time.Sleep(time.Duration(i.Config.InjectorServiceWorkerPollIntervalMS) * time.Millisecond)
	}
	return nil, nil
}

func (i ExtensionInjector) serviceWorkerTargetMatches(target map[string]any) bool {
	targetURL, _ := target["url"].(string)
	targetType, _ := target["type"].(string)
	if targetType != "service_worker" || !strings.HasPrefix(targetURL, "chrome-extension://") {
		return false
	}
	serviceWorkerExtensionID := i.Config.InjectorServiceWorkerExtensionID
	if serviceWorkerExtensionID == "" {
		serviceWorkerExtensionID = i.ServiceWorkerExtensionID
	}
	hasExtensionID := serviceWorkerExtensionID != ""
	if serviceWorkerExtensionID != "" && !strings.HasPrefix(targetURL, "chrome-extension://"+serviceWorkerExtensionID+"/") {
		return false
	}
	for _, part := range i.Config.InjectorServiceWorkerURLIncludes {
		if !strings.Contains(targetURL, part) {
			return false
		}
	}
	if len(i.Config.InjectorServiceWorkerURLSuffixes) > 0 {
		matched := false
		for _, suffix := range i.Config.InjectorServiceWorkerURLSuffixes {
			if strings.HasSuffix(targetURL, suffix) {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}
	return hasExtensionID || len(i.Config.InjectorServiceWorkerURLIncludes) > 0 || len(i.Config.InjectorServiceWorkerURLSuffixes) > 0
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
