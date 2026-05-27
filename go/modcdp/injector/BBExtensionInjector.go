// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/injector/BBExtensionInjector.ts
// - ./python/modcdp/injector/BBExtensionInjector.py
package injector

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

const DefaultBrowserbaseBaseURL = "https://api.browserbase.com"

type BBExtensionInjector struct {
	ExtensionInjector
	ZipPath     string
	CleanupPath string
}

func NewBBExtensionInjector(config InjectorConfig) BBExtensionInjector {
	config.InjectorMode = "bb"
	return BBExtensionInjector{ExtensionInjector: NewExtensionInjector(config)}
}

func (i *BBExtensionInjector) Prepare() error {
	if i.Config.InjectorBBExtensionID != "" {
		i.ExtensionID = i.Config.InjectorBBExtensionID
		return nil
	}
	if i.ExtensionID != "" {
		return nil
	}
	extensionPath := i.Config.InjectorBBExtensionPath
	if extensionPath == "" {
		return nil
	} else if strings.HasSuffix(extensionPath, ".zip") {
		i.ZipPath = extensionPath
	} else {
		zipPath, cleanupPath, err := zipExtensionDir(extensionPath)
		if err != nil {
			return err
		}
		i.ZipPath = zipPath
		i.CleanupPath = cleanupPath
	}
	extensionID, err := i.uploadExtension(i.ZipPath)
	if err != nil {
		_ = i.Close()
		return err
	}
	i.ExtensionID = extensionID
	i.Config.InjectorBBExtensionID = extensionID
	return nil
}

func (i *BBExtensionInjector) ConfigForLauncher() LauncherConfig {
	config := i.ExtensionInjector.ConfigForLauncher()
	if i.ExtensionID != "" {
		config.LauncherBBExtensionID = i.ExtensionID
	}
	return config
}

func (i *BBExtensionInjector) Inject() (*ExtensionInjectionResult, error) {
	discovered, err := i.waitForReadyServiceWorker(i.Config.InjectorServiceWorkerReadyTimeoutMS, i.Config.InjectorTrustServiceWorkerTarget)
	if err != nil || discovered == nil {
		return discovered, err
	}
	discovered.Source = "bb"
	return discovered, nil
}

func (i *BBExtensionInjector) Close() error {
	if i.CleanupPath != "" {
		_ = os.RemoveAll(i.CleanupPath)
		i.CleanupPath = ""
	}
	return nil
}

func (i *BBExtensionInjector) uploadExtension(zipPath string) (string, error) {
	browserbaseAPIKey := firstNonEmptyString(i.Config.InjectorBBAPIKey, os.Getenv("BROWSERBASE_API_KEY"))
	if browserbaseAPIKey == "" {
		return "", fmt.Errorf("BBExtensionInjector requires BROWSERBASE_API_KEY or injector.injector_bb_api_key.")
	}
	baseURL := i.Config.InjectorBBBaseURL
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	fileWriter, err := writer.CreateFormFile("file", filepath.Base(zipPath))
	if err != nil {
		return "", err
	}
	file, err := os.Open(zipPath)
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(fileWriter, file); err != nil {
		_ = file.Close()
		return "", err
	}
	if err := file.Close(); err != nil {
		return "", err
	}
	if err := writer.Close(); err != nil {
		return "", err
	}
	request, err := http.NewRequest("POST", strings.TrimRight(baseURL, "/")+"/v1/extensions", body)
	if err != nil {
		return "", err
	}
	request.Header.Set("X-BB-API-Key", browserbaseAPIKey)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	responseBody, _ := io.ReadAll(response.Body)
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", fmt.Errorf("Browserbase POST /v1/extensions -> %d%s", response.StatusCode, formatResponseBody(responseBody))
	}
	var payload map[string]any
	if err := json.Unmarshal(responseBody, &payload); err != nil {
		return "", err
	}
	extensionID, _ := payload["id"].(string)
	if extensionID == "" {
		return "", fmt.Errorf("Browserbase extension upload returned no id (got %s)", responseBody)
	}
	return extensionID, nil
}

func zipExtensionDir(extensionPath string) (string, string, error) {
	dir, err := os.MkdirTemp("", "modcdp-bb-extension-")
	if err != nil {
		return "", "", err
	}
	zipPath := filepath.Join(dir, "extension.zip")
	zipFile, err := os.Create(zipPath)
	if err != nil {
		_ = os.RemoveAll(dir)
		return "", "", err
	}
	archive := zip.NewWriter(zipFile)
	walkErr := filepath.WalkDir(extensionPath, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		relative, err := filepath.Rel(extensionPath, path)
		if err != nil {
			return err
		}
		writer, err := archive.Create(relative)
		if err != nil {
			return err
		}
		file, err := os.Open(path)
		if err != nil {
			return err
		}
		defer file.Close()
		_, err = io.Copy(writer, file)
		return err
	})
	closeArchiveErr := archive.Close()
	closeFileErr := zipFile.Close()
	if walkErr != nil || closeArchiveErr != nil || closeFileErr != nil {
		_ = os.RemoveAll(dir)
		if walkErr != nil {
			return "", "", walkErr
		}
		if closeArchiveErr != nil {
			return "", "", closeArchiveErr
		}
		return "", "", closeFileErr
	}
	return zipPath, dir, nil
}

func formatResponseBody(body []byte) string {
	if len(body) == 0 {
		return ""
	}
	return ": " + string(body)
}
