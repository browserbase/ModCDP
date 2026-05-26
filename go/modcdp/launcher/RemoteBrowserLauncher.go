package launcher

import "fmt"

type RemoteBrowserLauncher struct {
	BrowserLauncher
}

func NewRemoteBrowserLauncher(options LaunchOptions) *RemoteBrowserLauncher {
	return &RemoteBrowserLauncher{BrowserLauncher: NewBrowserLauncher(options)}
}

func (l *RemoteBrowserLauncher) Launch(options LaunchOptions) (*LaunchedBrowser, error) {
	cdpURL := firstString(options.LauncherRemoteCDPURL, l.Options.LauncherRemoteCDPURL)
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
