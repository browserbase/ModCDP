// MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
// Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
// - ./js/src/injector/DiscoverExtensionInjector.ts
// - ./python/modcdp/injector/DiscoverExtensionInjector.py
package injector

import (
	"fmt"
	"os"
	"strings"
)

type DiscoverExtensionInjector struct {
	ExtensionInjector
	CleanupPath string
}

func NewDiscoverExtensionInjector(config InjectorConfig) DiscoverExtensionInjector {
	config.InjectorMode = "discover"
	return DiscoverExtensionInjector{ExtensionInjector: NewExtensionInjector(config)}
}

func (i *DiscoverExtensionInjector) Prepare() error {
	extensionPath := i.Config.InjectorDiscoverExtensionPath
	if i.Config.InjectorServiceWorkerExtensionID == "" && extensionPath != "" {
		manifestPath := extensionPath
		if strings.HasSuffix(extensionPath, ".zip") {
			prepared, err := PrepareUnpackedExtension(extensionPath)
			if err != nil {
				return err
			}
			manifestPath = prepared.UnpackedExtensionPath
			i.CleanupPath = prepared.CleanupPath
		}
		extensionID, err := ExtensionIDFromManifestKey(manifestPath)
		if err != nil {
			return err
		}
		i.ServiceWorkerExtensionID = extensionID
	}
	return nil
}

func (i *DiscoverExtensionInjector) Inject() (*ExtensionInjectionResult, error) {
	discovered, err := i.discoverReadyServiceWorker(false)
	if err != nil || discovered != nil {
		if discovered != nil {
			discovered.Source = "discover"
		}
		return discovered, err
	}
	if i.Config.InjectorTrustServiceWorkerTarget {
		waited, err := i.waitForReadyServiceWorker(i.Config.InjectorServiceWorkerProbeTimeoutMS, true)
		if err != nil || waited != nil {
			if waited != nil {
				waited.Source = "discover"
			}
			return waited, err
		}
	}
	if !i.Config.InjectorRequireServiceWorkerTarget {
		return nil, nil
	}
	waited, err := i.waitForReadyServiceWorker(i.Config.InjectorServiceWorkerReadyTimeoutMS, i.Config.InjectorTrustServiceWorkerTarget)
	if err != nil || waited != nil {
		if waited != nil {
			waited.Source = "discover"
		}
		return waited, err
	}
	matchers := append(append([]string{}, i.Config.InjectorServiceWorkerURLIncludes...), i.Config.InjectorServiceWorkerURLSuffixes...)
	matcherText := strings.Join(matchers, ", ")
	if matcherText == "" {
		matcherText = "no matcher"
	}
	return nil, fmt.Errorf("required ModCDP service worker target was not visible (%s)", matcherText)
}

func (i *DiscoverExtensionInjector) Close() error {
	if i.CleanupPath != "" {
		_ = os.RemoveAll(i.CleanupPath)
		i.CleanupPath = ""
	}
	return nil
}
