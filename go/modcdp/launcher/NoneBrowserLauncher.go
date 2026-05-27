// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/launcher/NoneBrowserLauncher.ts
// - ./python/modcdp/launcher/NoneBrowserLauncher.py
package launcher

type NoneBrowserLauncher struct {
	BrowserLauncher
}

func NewNoneBrowserLauncher(config LauncherConfig) *NoneBrowserLauncher {
	config.LauncherMode = "none"
	return &NoneBrowserLauncher{BrowserLauncher: NewBrowserLauncher(config)}
}

func (l *NoneBrowserLauncher) Launch(config LauncherConfig) (*LaunchedBrowser, error) {
	launched := &LaunchedBrowser{Close: func() {}}
	l.Launched = launched
	return launched, nil
}
