// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/launcher/NoneBrowserLauncher.ts
// - ./python/modcdp/launcher/NoneBrowserLauncher.py
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
