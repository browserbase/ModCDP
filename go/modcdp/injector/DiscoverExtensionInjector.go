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

func NewDiscoverExtensionInjector(options InjectorOptions) DiscoverExtensionInjector {
	return DiscoverExtensionInjector{ExtensionInjector: NewExtensionInjector(options)}
}

func (i *DiscoverExtensionInjector) Prepare() error {
	extensionPath := i.Options.InjectorDiscoverExtensionPath
	if i.Options.InjectorServiceWorkerExtensionID == "" && extensionPath != "" {
		manifestPath := extensionPath
		if strings.HasSuffix(extensionPath, ".zip") {
			unpackedPath, cleanupPath, err := prepareUnpackedExtension(extensionPath)
			if err != nil {
				return err
			}
			manifestPath = unpackedPath
			i.CleanupPath = cleanupPath
		}
		extensionID, err := extensionIDFromManifestKey(manifestPath)
		if err != nil {
			return err
		}
		i.Options.InjectorServiceWorkerExtensionID = extensionID
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
	if i.Options.InjectorTrustServiceWorkerTarget {
		waited, err := i.waitForReadyServiceWorker(i.Options.InjectorServiceWorkerProbeTimeoutMS, true)
		if err != nil || waited != nil {
			if waited != nil {
				waited.Source = "discover"
			}
			return waited, err
		}
	}
	if !i.Options.InjectorRequireServiceWorkerTarget {
		return nil, nil
	}
	waited, err := i.waitForReadyServiceWorker(i.Options.InjectorServiceWorkerReadyTimeoutMS, i.Options.InjectorTrustServiceWorkerTarget)
	if err != nil || waited != nil {
		if waited != nil {
			waited.Source = "discover"
		}
		return waited, err
	}
	matchers := append(append([]string{}, i.Options.InjectorServiceWorkerURLIncludes...), i.Options.InjectorServiceWorkerURLSuffixes...)
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
