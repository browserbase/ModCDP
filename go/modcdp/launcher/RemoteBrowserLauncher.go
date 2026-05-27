// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/launcher/RemoteBrowserLauncher.ts
// - ./python/modcdp/launcher/RemoteBrowserLauncher.py
package launcher

import "fmt"

type RemoteBrowserLauncher struct {
	BrowserLauncher
}

func NewRemoteBrowserLauncher(config LauncherConfig) *RemoteBrowserLauncher {
	config.LauncherMode = "remote"
	return &RemoteBrowserLauncher{BrowserLauncher: NewBrowserLauncher(config)}
}

func (l *RemoteBrowserLauncher) Launch(config LauncherConfig) (*LaunchedBrowser, error) {
	cdpURL := firstString(config.LauncherRemoteCDPURL, l.Config.LauncherRemoteCDPURL)
	if cdpURL == "" {
		return nil, fmt.Errorf("launcher_mode=remote requires launcher_remote_cdp_url.")
	}
	resolvedCDPURL, err := WebsocketURLFor(cdpURL)
	if err != nil {
		return nil, err
	}
	// CDPURL is resolved here so the websocket transport can dial it directly.
	launched := &LaunchedBrowser{CDPURL: resolvedCDPURL, Close: func() {}}
	l.Launched = launched
	return launched, nil
}
