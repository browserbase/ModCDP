// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/launcher/BrowserLauncher.ts
// - ./python/modcdp/launcher/BrowserLauncher.py
package launcher

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/browserbase/modcdp/go/modcdp/types"
)

type LauncherConfig = types.LauncherConfig
type InjectorConfig = types.InjectorConfig
type UpstreamTransportConfig = types.UpstreamTransportConfig

const DefaultChromeReadyTimeoutMS = 45_000
const DefaultChromeReadyPollIntervalMS = 100

var cdpHTTPClient = &http.Client{Timeout: 2 * time.Second}

func freePort() (int, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer listener.Close()
	return listener.Addr().(*net.TCPAddr).Port, nil
}

func WebsocketURLFor(endpoint string) (string, error) {
	if strings.HasPrefix(endpoint, "ws://") || strings.HasPrefix(endpoint, "wss://") {
		return endpoint, nil
	}
	httpEndpoint := endpoint
	if !strings.Contains(endpoint, "://") {
		httpEndpoint = "http://" + endpoint
	}
	resp, err := cdpHTTPClient.Get(httpEndpoint + "/json/version")
	if err != nil {
		return "", fmt.Errorf("GET /json/version: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("GET %s/json/version -> %d", httpEndpoint, resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	var version map[string]any
	if err := json.Unmarshal(body, &version); err != nil {
		return "", fmt.Errorf("parse /json/version: %w", err)
	}
	wsURL, _ := version["webSocketDebuggerUrl"].(string)
	if wsURL == "" {
		return "", fmt.Errorf("cdp_url HTTP discovery returned no webSocketDebuggerUrl")
	}
	return wsURL, nil
}

type LaunchedBrowser struct {
	CDPURL                string `json:"cdp_url,omitempty"`
	CDPListenPort         int    `json:"cdp_listen_port,omitempty"`
	LoopbackCDPURL        string `json:"loopback_cdp_url,omitempty"`
	Close                 func() `json:"-"`
	ProfileDir            string `json:"profile_dir,omitempty"`
	BrowserbaseSessionID  string `json:"browserbase_session_id,omitempty"`
	BrowserbaseSessionURL string `json:"browserbase_session_url,omitempty"`
	BrowserbaseDebugURL   string `json:"browserbase_debug_url,omitempty"`
}

type BrowserLauncher struct {
	Config   LauncherConfig
	Launched *LaunchedBrowser
}

func NewBrowserLauncher(config LauncherConfig) BrowserLauncher {
	if config.LauncherBBBaseURL == "" {
		config.LauncherBBBaseURL = DefaultBrowserbaseLauncherBaseURL
	}
	return BrowserLauncher{Config: config}
}

func (l *BrowserLauncher) Update(config LauncherConfig) *BrowserLauncher {
	l.Config = mergeLaunchConfig(l.Config, config)
	return l
}

func (l BrowserLauncher) ConfigForUpstream() map[string]any {
	config := map[string]any{}
	upstreamWSCDPURL := firstString(launchedCDPURL(l.Launched), l.Config.LauncherRemoteCDPURL)
	if upstreamWSCDPURL != "" {
		config["upstream_ws_cdp_url"] = upstreamWSCDPURL
	}
	return config
}

func (l BrowserLauncher) ConfigForServer(upstreamConfig UpstreamTransportConfig) map[string]any {
	launcherLocalLoopbackCDPURL := ""
	if l.Launched != nil && l.Launched.LoopbackCDPURL != "" {
		launcherLocalLoopbackCDPURL = l.Launched.LoopbackCDPURL
	} else if upstreamConfig.UpstreamMode == "ws" && upstreamConfig.UpstreamWSCDPURL != "" {
		launcherLocalLoopbackCDPURL = upstreamConfig.UpstreamWSCDPURL
	}
	if launcherLocalLoopbackCDPURL != "" {
		return map[string]any{"upstream": map[string]any{"upstream_mode": "ws", "upstream_ws_cdp_url": launcherLocalLoopbackCDPURL}}
	}
	return map[string]any{}
}

func (l BrowserLauncher) Launch(config LauncherConfig) (*LaunchedBrowser, error) {
	return nil, fmt.Errorf("%T.Launch is not implemented", l)
}

func (l *BrowserLauncher) Close() {
	launched := l.Launched
	l.Launched = nil
	if launched != nil && launched.Close != nil {
		launched.Close()
	}
}

func (l BrowserLauncher) ToJSON() map[string]any {
	state := map[string]any{"launched": l.Launched != nil}
	if l.Launched != nil {
		state["cdp_url"] = l.Launched.CDPURL
		state["loopback_cdp_url"] = l.Launched.LoopbackCDPURL
		state["cdp_listen_port"] = l.Launched.CDPListenPort
		state["profile_dir"] = l.Launched.ProfileDir
		state["browserbase_session_id"] = l.Launched.BrowserbaseSessionID
		state["browserbase_session_url"] = l.Launched.BrowserbaseSessionURL
		state["browserbase_debug_url"] = l.Launched.BrowserbaseDebugURL
	}
	return types.ModCDPToJSON(l, types.ModCDPJSONConfig{State: state})
}

func mergeLaunchConfig(existing LauncherConfig, incoming LauncherConfig) LauncherConfig {
	merged := existing
	if incoming.LauncherLocalExecutablePath != "" {
		merged.LauncherLocalExecutablePath = incoming.LauncherLocalExecutablePath
	}
	if incoming.LauncherLocalCDPListenPort != 0 {
		merged.LauncherLocalCDPListenPort = incoming.LauncherLocalCDPListenPort
	}
	if incoming.LauncherLocalLoopbackCDP != nil {
		merged.LauncherLocalLoopbackCDP = incoming.LauncherLocalLoopbackCDP
	}
	if incoming.LauncherLocalUserDataDir != "" {
		merged.LauncherLocalUserDataDir = incoming.LauncherLocalUserDataDir
	}
	if incoming.LauncherLocalCleanupUserDataDir != nil {
		merged.LauncherLocalCleanupUserDataDir = incoming.LauncherLocalCleanupUserDataDir
	}
	if incoming.LauncherLocalChromeReadyTimeoutMS != 0 {
		merged.LauncherLocalChromeReadyTimeoutMS = incoming.LauncherLocalChromeReadyTimeoutMS
	}
	if incoming.LauncherLocalChromeReadyPollIntervalMS != 0 {
		merged.LauncherLocalChromeReadyPollIntervalMS = incoming.LauncherLocalChromeReadyPollIntervalMS
	}
	if incoming.LauncherLocalHeadless != nil {
		merged.LauncherLocalHeadless = incoming.LauncherLocalHeadless
	}
	if incoming.LauncherLocalSandbox != nil {
		merged.LauncherLocalSandbox = incoming.LauncherLocalSandbox
	}
	if len(incoming.LauncherLocalArgs) > 0 {
		merged.LauncherLocalArgs = mergeChromeArgs(existing.LauncherLocalArgs, incoming.LauncherLocalArgs)
	}
	if len(incoming.LauncherLocalExtraArgs) > 0 {
		merged.LauncherLocalExtraArgs = mergeChromeArgs(existing.LauncherLocalExtraArgs, incoming.LauncherLocalExtraArgs)
	}
	if incoming.LauncherRemoteCDPURL != "" {
		merged.LauncherRemoteCDPURL = incoming.LauncherRemoteCDPURL
	}
	if incoming.LauncherBBAPIKey != "" {
		merged.LauncherBBAPIKey = incoming.LauncherBBAPIKey
	}
	if incoming.LauncherBBBaseURL != "" {
		merged.LauncherBBBaseURL = incoming.LauncherBBBaseURL
	}
	if incoming.LauncherBBSessionID != "" {
		merged.LauncherBBSessionID = incoming.LauncherBBSessionID
	}
	if incoming.LauncherBBKeepAlive != nil {
		merged.LauncherBBKeepAlive = incoming.LauncherBBKeepAlive
	}
	if incoming.LauncherBBCloseSessionOnClose != nil {
		merged.LauncherBBCloseSessionOnClose = incoming.LauncherBBCloseSessionOnClose
	}
	if incoming.LauncherBBRegion != "" {
		merged.LauncherBBRegion = incoming.LauncherBBRegion
	}
	if incoming.LauncherBBTimeout != 0 {
		merged.LauncherBBTimeout = incoming.LauncherBBTimeout
	}
	if incoming.LauncherBBExtensionID != "" {
		merged.LauncherBBExtensionID = incoming.LauncherBBExtensionID
	}
	if incoming.LauncherBBBrowserSettings != nil {
		merged.LauncherBBBrowserSettings = incoming.LauncherBBBrowserSettings
	}
	if incoming.LauncherBBUserMetadata != nil {
		merged.LauncherBBUserMetadata = incoming.LauncherBBUserMetadata
	}
	if incoming.LauncherBBSessionCreateParams != nil {
		merged.LauncherBBSessionCreateParams = incoming.LauncherBBSessionCreateParams
	}
	return merged
}

func mergeChromeArgs(existing []string, incoming []string) []string {
	args := append(append([]string{}, existing...), incoming...)
	loadExtensionPaths := []string{}
	merged := []string{}
	for _, arg := range args {
		if !strings.HasPrefix(arg, "--load-extension=") {
			merged = append(merged, arg)
			continue
		}
		for _, extensionPath := range strings.Split(strings.TrimPrefix(arg, "--load-extension="), ",") {
			if extensionPath != "" && !containsString(loadExtensionPaths, extensionPath) {
				loadExtensionPaths = append(loadExtensionPaths, extensionPath)
			}
		}
	}
	if len(loadExtensionPaths) > 0 {
		loadExtensionArg := "--load-extension=" + strings.Join(loadExtensionPaths, ",")
		firstURLIndex := -1
		for index, arg := range merged {
			if !strings.HasPrefix(arg, "-") {
				firstURLIndex = index
				break
			}
		}
		if firstURLIndex == -1 {
			merged = append(merged, loadExtensionArg)
		} else {
			merged = append(merged[:firstURLIndex], append([]string{loadExtensionArg}, merged[firstURLIndex:]...)...)
		}
	}
	return merged
}

func containsString(values []string, needle string) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
}

func firstString(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func launchedCDPURL(launched *LaunchedBrowser) string {
	if launched == nil {
		return ""
	}
	return launched.CDPURL
}

func launchedProfileDir(launched *LaunchedBrowser) string {
	if launched == nil {
		return ""
	}
	return launched.ProfileDir
}
