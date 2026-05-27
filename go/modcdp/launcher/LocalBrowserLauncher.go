// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/launcher/LocalBrowserLauncher.ts
// - ./python/modcdp/launcher/LocalBrowserLauncher.py
package launcher

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type LocalBrowserLauncher struct {
	BrowserLauncher
}

func NewLocalBrowserLauncher(config LauncherConfig) *LocalBrowserLauncher {
	config.LauncherMode = "local"
	return &LocalBrowserLauncher{BrowserLauncher: NewBrowserLauncher(config)}
}

func (l *LocalBrowserLauncher) FindChromeBinary(explicit string) (string, error) {
	return findChromeBinary(explicit)
}

func (l *LocalBrowserLauncher) FreePort() (int, error) {
	return freePort()
}

func (l *LocalBrowserLauncher) Launch(config LauncherConfig) (*LaunchedBrowser, error) {
	config = mergeLaunchConfig(l.Config, config)

	executablePath, err := l.FindChromeBinary(config.LauncherLocalExecutablePath)
	if err != nil {
		return nil, err
	}
	chromeReadyTimeoutMS := config.LauncherLocalChromeReadyTimeoutMS
	if chromeReadyTimeoutMS == 0 {
		chromeReadyTimeoutMS = DefaultChromeReadyTimeoutMS
	}
	chromeReadyPollIntervalMS := config.LauncherLocalChromeReadyPollIntervalMS
	if chromeReadyPollIntervalMS == 0 {
		chromeReadyPollIntervalMS = DefaultChromeReadyPollIntervalMS
	}
	port := config.LauncherLocalCDPListenPort
	profileDir := config.LauncherLocalUserDataDir
	ownsProfileDir := false
	if profileDir == "" {
		profileDir, err = os.MkdirTemp("", "modcdp.")
		if err != nil {
			return nil, err
		}
		ownsProfileDir = true
	}
	cleanupProfileDir := ownsProfileDir
	if !ownsProfileDir && config.LauncherLocalCleanupUserDataDir != nil {
		cleanupProfileDir = *config.LauncherLocalCleanupUserDataDir
	}
	args := []string{
		"--enable-unsafe-extension-debugging",
		"--remote-allow-origins=*",
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-default-apps",
		"--disable-background-networking",
		"--disable-backgrounding-occluded-windows",
		"--disable-renderer-backgrounding",
		"--disable-background-timer-throttling",
		"--disable-dev-shm-usage",
		"--disable-sync",
		"--disable-features=DisableLoadExtensionCommandLineSwitch",
		"--password-store=basic",
		"--use-mock-keychain",
		"--disable-gpu",
		fmt.Sprintf("--user-data-dir=%s", profileDir),
	}
	args = append(args, "--remote-debugging-address=127.0.0.1", fmt.Sprintf("--remote-debugging-port=%d", port))
	defaultHeadless := runtime.GOOS == "linux" && os.Getenv("DISPLAY") == ""
	headless := defaultHeadless
	if config.LauncherLocalHeadless != nil {
		headless = *config.LauncherLocalHeadless
	}
	if headless {
		args = append(args, "--headless=new")
	}
	sandbox := !defaultHeadless
	if config.LauncherLocalSandbox != nil {
		sandbox = *config.LauncherLocalSandbox
	}
	if !sandbox {
		args = append(args, "--no-sandbox")
	}
	args = append(args, config.LauncherLocalArgs...)
	args = append(args, config.LauncherLocalExtraArgs...)
	args = append(args, "about:blank")
	cmd := exec.Command(executablePath, args...)
	if runtime.GOOS != "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	}
	if err := cmd.Start(); err != nil {
		if cleanupProfileDir {
			_ = os.RemoveAll(profileDir)
		}
		return nil, err
	}
	processDone := make(chan struct{})
	var processState *os.ProcessState
	var processWaitErr error
	go func() {
		processState, processWaitErr = cmd.Process.Wait()
		close(processDone)
	}()
	close := func() {
		if cmd.Process != nil {
			select {
			case <-processDone:
			default:
				if runtime.GOOS != "windows" {
					_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
				} else {
					_ = cmd.Process.Kill()
				}
				select {
				case <-processDone:
				case <-time.After(2 * time.Second):
					if runtime.GOOS != "windows" {
						_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
					} else {
						_ = cmd.Process.Kill()
					}
					<-processDone
				}
			}
		}
		if cleanupProfileDir {
			removeProfileDir(profileDir)
		}
	}
	processExitedError := func() error {
		select {
		case <-processDone:
			if processWaitErr != nil {
				return fmt.Errorf("Chrome exited before CDP became ready: %w", processWaitErr)
			}
			if processState != nil {
				return fmt.Errorf("Chrome exited before CDP became ready (exit=%d)", processState.ExitCode())
			}
			return fmt.Errorf("Chrome exited before CDP became ready")
		default:
			return nil
		}
	}
	deadline := time.Now().Add(time.Duration(chromeReadyTimeoutMS) * time.Millisecond)
	client := &http.Client{Timeout: 2 * time.Second}
	for time.Now().Before(deadline) {
		if err := processExitedError(); err != nil {
			close()
			return nil, err
		}
		cdpURL := ""
		if port == 0 {
			activePort, ready, err := readDevToolsActivePort(profileDir)
			if err != nil {
				close()
				return nil, err
			}
			if !ready {
				time.Sleep(time.Duration(chromeReadyPollIntervalMS) * time.Millisecond)
				continue
			}
			cdpURL = fmt.Sprintf("http://127.0.0.1:%d", activePort)
		} else {
			cdpURL = fmt.Sprintf("http://127.0.0.1:%d", port)
		}
		resp, err := client.Get(cdpURL + "/json/version")
		if err == nil {
			var version map[string]any
			_ = json.NewDecoder(resp.Body).Decode(&version)
			_ = resp.Body.Close()
			if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				resolvedCDPURL, _ := version["webSocketDebuggerUrl"].(string)
				if resolvedCDPURL == "" {
					resolvedCDPURL = cdpURL
				}
				cdpListenPort := port
				if port == 0 {
					activePort, _ := strconv.Atoi(strings.TrimPrefix(cdpURL, "http://127.0.0.1:"))
					cdpListenPort = activePort
				}
				// CDPURL is resolved from the HTTP discovery endpoint before returning.
				launched := &LaunchedBrowser{CDPURL: resolvedCDPURL, CDPListenPort: cdpListenPort, LoopbackCDPURL: resolvedCDPURL, Close: close, ProfileDir: profileDir}
				l.Launched = launched
				return launched, nil
			}
		}
		time.Sleep(time.Duration(chromeReadyPollIntervalMS) * time.Millisecond)
	}
	close()
	return nil, fmt.Errorf("Chrome did not become ready within %dms", chromeReadyTimeoutMS)
}

func waitForCdpWebSocketURL(cdpURL string, timeout time.Duration, pollInterval time.Duration) (string, error) {
	deadline := time.Now().Add(timeout)
	var lastErr error
	for time.Now().Before(deadline) {
		loopbackCDPURL, err := WebsocketURLFor(cdpURL)
		if err == nil && loopbackCDPURL != "" {
			return loopbackCDPURL, nil
		}
		lastErr = err
		time.Sleep(pollInterval)
	}
	if lastErr != nil {
		return "", fmt.Errorf("Chrome at %s did not expose a WebSocket CDP URL within %s: %w", cdpURL, timeout, lastErr)
	}
	return "", fmt.Errorf("Chrome at %s did not expose a WebSocket CDP URL within %s", cdpURL, timeout)
}

func readDevToolsActivePort(profileDir string) (int, bool, error) {
	body, err := os.ReadFile(filepath.Join(profileDir, "DevToolsActivePort"))
	if err != nil {
		if os.IsNotExist(err) {
			return 0, false, nil
		}
		return 0, false, err
	}
	lines := strings.Split(strings.TrimSpace(string(body)), "\n")
	if len(lines) < 2 || strings.TrimSpace(lines[0]) == "" || strings.TrimSpace(lines[1]) == "" {
		return 0, false, nil
	}
	port, err := strconv.Atoi(strings.TrimSpace(lines[0]))
	if err != nil || port <= 0 {
		return 0, false, fmt.Errorf("invalid DevToolsActivePort port: %s", strings.TrimSpace(lines[0]))
	}
	return port, true, nil
}

func waitForBrowserSelectedCdpWebSocketURL(profileDir string, timeout time.Duration, pollInterval time.Duration) (string, int, error) {
	deadline := time.Now().Add(timeout)
	var lastErr error
	for time.Now().Before(deadline) {
		port, ready, err := readDevToolsActivePort(profileDir)
		if err != nil {
			return "", 0, err
		}
		if ready {
			cdpURL := fmt.Sprintf("http://127.0.0.1:%d", port)
			loopbackCDPURL, err := WebsocketURLFor(cdpURL)
			if err == nil && loopbackCDPURL != "" {
				return loopbackCDPURL, port, nil
			}
			lastErr = err
		}
		time.Sleep(pollInterval)
	}
	if lastErr != nil {
		return "", 0, fmt.Errorf("Chrome did not expose DevToolsActivePort from %s within %s: %w", profileDir, timeout, lastErr)
	}
	return "", 0, fmt.Errorf("Chrome did not expose DevToolsActivePort from %s within %s", profileDir, timeout)
}

func removeProfileDir(profileDir string) {
	for attempt := 0; attempt < 5; attempt++ {
		if err := os.RemoveAll(profileDir); err == nil {
			if _, statErr := os.Stat(profileDir); os.IsNotExist(statErr) {
				return
			}
		}
		time.Sleep(time.Duration(attempt+1) * 100 * time.Millisecond)
	}
	_ = os.RemoveAll(profileDir)
}

func findChromeBinary(explicit string) (string, error) {
	candidates := append([]string{explicit, os.Getenv("CHROME_PATH")}, candidatePaths()...)
	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
	}
	tried := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		if candidate != "" {
			tried = append(tried, candidate)
		}
	}
	return "", fmt.Errorf("no Chrome/Chromium binary found. Tried: %s. Set CHROME_PATH or pass Launch.Config.LauncherLocalExecutablePath", strings.Join(tried, ", "))
}

func candidatePaths() []string {
	homeDir, _ := os.UserHomeDir()
	if homeDir == "" {
		homeDir = "."
	}
	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		localAppData = filepath.Join(homeDir, "AppData", "Local")
	}
	programFiles := compact([]string{os.Getenv("PROGRAMFILES"), os.Getenv("PROGRAMFILES(X86)")})

	var canary []string
	var stock []string
	var chromium []string
	switch runtime.GOOS {
	case "darwin":
		canary = []string{"/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"}
		stock = []string{"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
	case "windows":
		canary = append([]string{filepath.Join(localAppData, "Google", "Chrome SxS", "Application", "chrome.exe")}, joinAll(programFiles, "Google", "Chrome SxS", "Application", "chrome.exe")...)
		stock = append(joinAll(programFiles, "Google", "Chrome", "Application", "chrome.exe"), filepath.Join(localAppData, "Google", "Chrome", "Application", "chrome.exe"))
	default:
		chromium = []string{"/usr/bin/chromium", "/usr/bin/chromium-browser"}
		canary = []string{"/usr/bin/google-chrome-canary", "/usr/bin/google-chrome-unstable", "/opt/google/chrome-unstable/chrome"}
		stock = []string{"/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", "/opt/google/chrome/chrome"}
	}

	result := append([]string{}, chromium...)
	result = append(result, canary...)
	result = append(result, chromeForTestingCandidates()...)
	result = append(result, stock...)
	return result
}

func chromeForTestingCandidates() []string {
	homeDir, _ := os.UserHomeDir()
	if homeDir == "" {
		homeDir = "."
	}
	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		localAppData = filepath.Join(homeDir, "AppData", "Local")
	}

	var patterns []string
	switch runtime.GOOS {
	case "darwin":
		patterns = []string{
			filepath.Join(homeDir, "Library", "Caches", "ms-playwright", "chromium-*", "chrome-mac*", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
			filepath.Join(homeDir, "Library", "Caches", "ms-playwright", "chromium-*", "chrome-mac*", "Chromium.app", "Contents", "MacOS", "Chromium"),
			filepath.Join(homeDir, "Library", "Caches", "puppeteer", "chrome", "mac*-*", "chrome-mac*", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
		}
	case "windows":
		patterns = []string{
			filepath.Join(localAppData, "ms-playwright", "chromium-*", "chrome-win*", "chrome.exe"),
			filepath.Join(homeDir, ".cache", "puppeteer", "chrome", "win*-*", "chrome-win*", "chrome.exe"),
		}
	default:
		patterns = []string{
			filepath.Join(homeDir, ".cache", "ms-playwright", "chromium-*", "chrome-linux*", "chrome"),
			filepath.Join("/opt", "pw-browsers", "chromium-*", "chrome-linux*", "chrome"),
			filepath.Join(homeDir, ".cache", "puppeteer", "chrome", "linux-*", "chrome-linux*", "chrome"),
		}
	}

	var candidates []string
	for _, pattern := range patterns {
		matches, err := filepath.Glob(pattern)
		if err != nil {
			continue
		}
		candidates = append(candidates, matches...)
	}
	return newestFirst(candidates)
}

func newestFirst(candidates []string) []string {
	seen := map[string]bool{}
	deduped := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		if candidate == "" || seen[candidate] {
			continue
		}
		seen[candidate] = true
		deduped = append(deduped, candidate)
	}
	sort.SliceStable(deduped, func(i, j int) bool {
		leftVersion := maxNumber(deduped[i])
		rightVersion := maxNumber(deduped[j])
		if leftVersion != rightVersion {
			return leftVersion > rightVersion
		}
		leftStat, leftErr := os.Stat(deduped[i])
		rightStat, rightErr := os.Stat(deduped[j])
		var leftMtime, rightMtime time.Time
		if leftErr == nil {
			leftMtime = leftStat.ModTime()
		}
		if rightErr == nil {
			rightMtime = rightStat.ModTime()
		}
		if !leftMtime.Equal(rightMtime) {
			return leftMtime.After(rightMtime)
		}
		return deduped[i] < deduped[j]
	})
	return deduped
}

func maxNumber(value string) int {
	max := 0
	for _, raw := range regexp.MustCompile(`\d+`).FindAllString(value, -1) {
		number, err := strconv.Atoi(raw)
		if err == nil && number > max {
			max = number
		}
	}
	return max
}

func compact(values []string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value != "" {
			result = append(result, value)
		}
	}
	return result
}

func joinAll(bases []string, parts ...string) []string {
	result := make([]string, 0, len(bases))
	for _, base := range bases {
		result = append(result, filepath.Join(append([]string{base}, parts...)...))
	}
	return result
}
