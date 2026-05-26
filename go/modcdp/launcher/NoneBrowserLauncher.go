package launcher

type NoneBrowserLauncher struct {
	BrowserLauncher
}

func NewNoneBrowserLauncher(options LaunchOptions) *NoneBrowserLauncher {
	return &NoneBrowserLauncher{BrowserLauncher: NewBrowserLauncher(options)}
}

func (l *NoneBrowserLauncher) Launch(options LaunchOptions) (*LaunchedBrowser, error) {
	launched := &LaunchedBrowser{Close: func() {}}
	l.Launched = launched
	return launched, nil
}
