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
	ExtensionID           string
	CleanupPath           string
}

func NewCLIExtensionInjector(options InjectorOptions) CLIExtensionInjector {
	return CLIExtensionInjector{ExtensionInjector: NewExtensionInjector(options)}
}

func (i *CLIExtensionInjector) Prepare() error {
	extensionPath := i.Options.InjectorCLIExtensionPath
	if i.UnpackedExtensionPath != "" {
		return nil
	}
	unpackedPath, cleanupPath, err := prepareUnpackedExtension(extensionPath)
	if err != nil {
		return err
	}
	i.UnpackedExtensionPath = unpackedPath
	i.CleanupPath = cleanupPath
	_, err = i.resolveExtensionID()
	return err
}

func (i *CLIExtensionInjector) ConfigForLauncher() LaunchOptions {
	if i.UnpackedExtensionPath == "" {
		return LaunchOptions{}
	}
	return LaunchOptions{LauncherLocalExtraArgs: []string{"--load-extension=" + i.UnpackedExtensionPath}}
}

func (i *CLIExtensionInjector) Inject() (*ExtensionInjectionResult, error) {
	discovered, err := i.discoverReadyServiceWorker(i.Options.InjectorTrustServiceWorkerTarget)
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
	if i.Options.InjectorCLIExtensionID != "" {
		i.ExtensionID = i.Options.InjectorCLIExtensionID
	} else if i.UnpackedExtensionPath != "" {
		extensionID, err := extensionIDFromManifestKey(i.UnpackedExtensionPath)
		if err != nil {
			return "", err
		}
		i.ExtensionID = extensionID
	}
	if i.ExtensionID != "" {
		i.Options.InjectorCLIExtensionID = i.ExtensionID
		i.Options.InjectorServiceWorkerExtensionID = i.ExtensionID
	}
	return i.ExtensionID, nil
}
