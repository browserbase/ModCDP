// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/injector/CLIExtensionInjector.ts
// - ./python/modcdp/injector/CLIExtensionInjector.py
package injector

import (
	"os"
)

type CLIExtensionInjector struct {
	ExtensionInjector
	UnpackedExtensionPath string
	CleanupPath           string
}

func NewCLIExtensionInjector(config InjectorConfig) CLIExtensionInjector {
	config.InjectorMode = "cli"
	return CLIExtensionInjector{ExtensionInjector: NewExtensionInjector(config)}
}

func (i *CLIExtensionInjector) Prepare() error {
	extensionPath := i.Config.InjectorCLIExtensionPath
	if i.UnpackedExtensionPath != "" {
		return nil
	}
	prepared, err := PrepareUnpackedExtension(extensionPath)
	if err != nil {
		return err
	}
	i.UnpackedExtensionPath = prepared.UnpackedExtensionPath
	i.CleanupPath = prepared.CleanupPath
	_, err = i.resolveExtensionID()
	return err
}

func (i *CLIExtensionInjector) Inject() (*ExtensionInjectionResult, error) {
	discovered, err := i.waitForReadyServiceWorker(i.Config.InjectorServiceWorkerReadyTimeoutMS, i.Config.InjectorTrustServiceWorkerTarget)
	if err != nil || discovered == nil {
		return discovered, err
	}
	discovered.Source = "cli"
	return discovered, nil
}

func (i *CLIExtensionInjector) Close() error {
	if i.CleanupPath != "" {
		_ = os.RemoveAll(i.CleanupPath)
		i.CleanupPath = ""
	}
	return nil
}

func (i *CLIExtensionInjector) resolveExtensionID() (string, error) {
	if i.ExtensionID != "" {
		return i.ExtensionID, nil
	}
	if i.Config.InjectorCLIExtensionID != "" {
		i.ExtensionID = i.Config.InjectorCLIExtensionID
	} else if i.UnpackedExtensionPath != "" {
		extensionID, err := ExtensionIDFromManifestKey(i.UnpackedExtensionPath)
		if err != nil {
			return "", err
		}
		i.ExtensionID = extensionID
	}
	if i.ExtensionID != "" {
		i.ServiceWorkerExtensionID = i.ExtensionID
		i.Config.InjectorCLIExtensionID = i.ExtensionID
		i.Config.InjectorServiceWorkerExtensionID = i.ExtensionID
	}
	if i.UnpackedExtensionPath != "" {
		i.ExtraArgs = []string{"--load-extension=" + i.UnpackedExtensionPath}
	}
	return i.ExtensionID, nil
}
