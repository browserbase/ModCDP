// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/launcher/RemoteBrowserLauncher.ts
// - ./python/modcdp/launcher/RemoteBrowserLauncher.py
package launcher

import "fmt"

type RemoteBrowserLauncher struct {
	BrowserLauncher
}

func NewRemoteBrowserLauncher(options LaunchOptions) *RemoteBrowserLauncher {
	return &RemoteBrowserLauncher{BrowserLauncher: NewBrowserLauncher(options)}
}

func (l *RemoteBrowserLauncher) Launch(options LaunchOptions) (*LaunchedBrowser, error) {
	cdpURL := firstString(options.LauncherRemoteCDPURL, l.Config.LauncherRemoteCDPURL)
	if cdpURL == "" {
		return nil, fmt.Errorf("launcher.launcher_mode=remote requires launcher_remote_cdp_url")
	}
	resolvedCDPURL, err := websocketURLFor(cdpURL)
	if err != nil {
		return nil, err
	}
	// CDPURL is resolved here so downstream transports can dial it directly.
	launched := &LaunchedBrowser{CDPURL: resolvedCDPURL, Close: func() {}}
	l.Launched = launched
	return launched, nil
}
