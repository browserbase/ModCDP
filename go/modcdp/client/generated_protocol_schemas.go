// Code generated from generated_domains.go. DO NOT EDIT BY HAND.
package client

import abxjsonschema "github.com/ArchiveBox/abxbus/abxbus-go/v2/jsonschema"

func (types *CDPTypes) hydrateNativeProtocolSchemas() {
	types.mu.Lock()
	defer types.mu.Unlock()
	types.commandSchemas["Accessibility.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[AccessibilityDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[AccessibilityDisableResult]()),
	}
	types.commandSchemas["Accessibility.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[AccessibilityEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[AccessibilityEnableResult]()),
	}
	types.commandSchemas["Accessibility.getPartialAXTree"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[AccessibilityGetPartialAXTreeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[AccessibilityGetPartialAXTreeResult]()),
	}
	types.commandSchemas["Accessibility.getFullAXTree"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[AccessibilityGetFullAXTreeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[AccessibilityGetFullAXTreeResult]()),
	}
	types.commandSchemas["Accessibility.getRootAXNode"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[AccessibilityGetRootAXNodeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[AccessibilityGetRootAXNodeResult]()),
	}
	types.commandSchemas["Accessibility.getAXNodeAndAncestors"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[AccessibilityGetAXNodeAndAncestorsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[AccessibilityGetAXNodeAndAncestorsResult]()),
	}
	types.commandSchemas["Accessibility.getChildAXNodes"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[AccessibilityGetChildAXNodesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[AccessibilityGetChildAXNodesResult]()),
	}
	types.commandSchemas["Accessibility.queryAXTree"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[AccessibilityQueryAXTreeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[AccessibilityQueryAXTreeResult]()),
	}
	types.commandSchemas["Animation.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[AnimationDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[AnimationDisableResult]()),
	}
	types.commandSchemas["Animation.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[AnimationEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[AnimationEnableResult]()),
	}
	types.commandSchemas["Animation.getCurrentTime"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[AnimationGetCurrentTimeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[AnimationGetCurrentTimeResult]()),
	}
	types.commandSchemas["Animation.getPlaybackRate"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[AnimationGetPlaybackRateParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[AnimationGetPlaybackRateResult]()),
	}
	types.commandSchemas["Animation.releaseAnimations"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[AnimationReleaseAnimationsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[AnimationReleaseAnimationsResult]()),
	}
	types.commandSchemas["Animation.resolveAnimation"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[AnimationResolveAnimationParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[AnimationResolveAnimationResult]()),
	}
	types.commandSchemas["Animation.seekAnimations"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[AnimationSeekAnimationsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[AnimationSeekAnimationsResult]()),
	}
	types.commandSchemas["Animation.setPaused"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[AnimationSetPausedParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[AnimationSetPausedResult]()),
	}
	types.commandSchemas["Animation.setPlaybackRate"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[AnimationSetPlaybackRateParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[AnimationSetPlaybackRateResult]()),
	}
	types.commandSchemas["Animation.setTiming"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[AnimationSetTimingParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[AnimationSetTimingResult]()),
	}
	types.commandSchemas["Audits.getEncodedResponse"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[AuditsGetEncodedResponseParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[AuditsGetEncodedResponseResult]()),
	}
	types.commandSchemas["Audits.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[AuditsDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[AuditsDisableResult]()),
	}
	types.commandSchemas["Audits.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[AuditsEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[AuditsEnableResult]()),
	}
	types.commandSchemas["Audits.checkFormsIssues"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[AuditsCheckFormsIssuesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[AuditsCheckFormsIssuesResult]()),
	}
	types.commandSchemas["Autofill.trigger"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[AutofillTriggerParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[AutofillTriggerResult]()),
	}
	types.commandSchemas["Autofill.setAddresses"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[AutofillSetAddressesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[AutofillSetAddressesResult]()),
	}
	types.commandSchemas["Autofill.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[AutofillDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[AutofillDisableResult]()),
	}
	types.commandSchemas["Autofill.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[AutofillEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[AutofillEnableResult]()),
	}
	types.commandSchemas["BackgroundService.startObserving"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BackgroundServiceStartObservingParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BackgroundServiceStartObservingResult]()),
	}
	types.commandSchemas["BackgroundService.stopObserving"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BackgroundServiceStopObservingParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BackgroundServiceStopObservingResult]()),
	}
	types.commandSchemas["BackgroundService.setRecording"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BackgroundServiceSetRecordingParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BackgroundServiceSetRecordingResult]()),
	}
	types.commandSchemas["BackgroundService.clearEvents"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BackgroundServiceClearEventsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BackgroundServiceClearEventsResult]()),
	}
	types.commandSchemas["BluetoothEmulation.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BluetoothEmulationEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BluetoothEmulationEnableResult]()),
	}
	types.commandSchemas["BluetoothEmulation.setSimulatedCentralState"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BluetoothEmulationSetSimulatedCentralStateParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BluetoothEmulationSetSimulatedCentralStateResult]()),
	}
	types.commandSchemas["BluetoothEmulation.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BluetoothEmulationDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BluetoothEmulationDisableResult]()),
	}
	types.commandSchemas["BluetoothEmulation.simulatePreconnectedPeripheral"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BluetoothEmulationSimulatePreconnectedPeripheralParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BluetoothEmulationSimulatePreconnectedPeripheralResult]()),
	}
	types.commandSchemas["BluetoothEmulation.simulateAdvertisement"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BluetoothEmulationSimulateAdvertisementParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BluetoothEmulationSimulateAdvertisementResult]()),
	}
	types.commandSchemas["BluetoothEmulation.simulateGATTOperationResponse"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BluetoothEmulationSimulateGATTOperationResponseParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BluetoothEmulationSimulateGATTOperationResponseResult]()),
	}
	types.commandSchemas["BluetoothEmulation.simulateCharacteristicOperationResponse"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BluetoothEmulationSimulateCharacteristicOperationResponseParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BluetoothEmulationSimulateCharacteristicOperationResponseResult]()),
	}
	types.commandSchemas["BluetoothEmulation.simulateDescriptorOperationResponse"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BluetoothEmulationSimulateDescriptorOperationResponseParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BluetoothEmulationSimulateDescriptorOperationResponseResult]()),
	}
	types.commandSchemas["BluetoothEmulation.addService"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BluetoothEmulationAddServiceParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BluetoothEmulationAddServiceResult]()),
	}
	types.commandSchemas["BluetoothEmulation.removeService"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BluetoothEmulationRemoveServiceParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BluetoothEmulationRemoveServiceResult]()),
	}
	types.commandSchemas["BluetoothEmulation.addCharacteristic"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BluetoothEmulationAddCharacteristicParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BluetoothEmulationAddCharacteristicResult]()),
	}
	types.commandSchemas["BluetoothEmulation.removeCharacteristic"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BluetoothEmulationRemoveCharacteristicParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BluetoothEmulationRemoveCharacteristicResult]()),
	}
	types.commandSchemas["BluetoothEmulation.addDescriptor"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BluetoothEmulationAddDescriptorParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BluetoothEmulationAddDescriptorResult]()),
	}
	types.commandSchemas["BluetoothEmulation.removeDescriptor"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BluetoothEmulationRemoveDescriptorParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BluetoothEmulationRemoveDescriptorResult]()),
	}
	types.commandSchemas["BluetoothEmulation.simulateGATTDisconnection"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BluetoothEmulationSimulateGATTDisconnectionParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BluetoothEmulationSimulateGATTDisconnectionResult]()),
	}
	types.commandSchemas["Browser.setPermission"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BrowserSetPermissionParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BrowserSetPermissionResult]()),
	}
	types.commandSchemas["Browser.grantPermissions"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BrowserGrantPermissionsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BrowserGrantPermissionsResult]()),
	}
	types.commandSchemas["Browser.resetPermissions"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BrowserResetPermissionsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BrowserResetPermissionsResult]()),
	}
	types.commandSchemas["Browser.setDownloadBehavior"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BrowserSetDownloadBehaviorParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BrowserSetDownloadBehaviorResult]()),
	}
	types.commandSchemas["Browser.cancelDownload"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BrowserCancelDownloadParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BrowserCancelDownloadResult]()),
	}
	types.commandSchemas["Browser.close"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BrowserCloseParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BrowserCloseResult]()),
	}
	types.commandSchemas["Browser.crash"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BrowserCrashParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BrowserCrashResult]()),
	}
	types.commandSchemas["Browser.crashGpuProcess"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BrowserCrashGPUProcessParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BrowserCrashGPUProcessResult]()),
	}
	types.commandSchemas["Browser.getVersion"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BrowserGetVersionParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BrowserGetVersionResult]()),
	}
	types.commandSchemas["Browser.getBrowserCommandLine"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BrowserGetBrowserCommandLineParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BrowserGetBrowserCommandLineResult]()),
	}
	types.commandSchemas["Browser.getHistograms"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BrowserGetHistogramsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BrowserGetHistogramsResult]()),
	}
	types.commandSchemas["Browser.getHistogram"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BrowserGetHistogramParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BrowserGetHistogramResult]()),
	}
	types.commandSchemas["Browser.getWindowBounds"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BrowserGetWindowBoundsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BrowserGetWindowBoundsResult]()),
	}
	types.commandSchemas["Browser.getWindowForTarget"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BrowserGetWindowForTargetParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BrowserGetWindowForTargetResult]()),
	}
	types.commandSchemas["Browser.setWindowBounds"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BrowserSetWindowBoundsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BrowserSetWindowBoundsResult]()),
	}
	types.commandSchemas["Browser.setContentsSize"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BrowserSetContentsSizeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BrowserSetContentsSizeResult]()),
	}
	types.commandSchemas["Browser.setDockTile"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BrowserSetDockTileParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BrowserSetDockTileResult]()),
	}
	types.commandSchemas["Browser.executeBrowserCommand"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BrowserExecuteBrowserCommandParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BrowserExecuteBrowserCommandResult]()),
	}
	types.commandSchemas["Browser.addPrivacySandboxEnrollmentOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BrowserAddPrivacySandboxEnrollmentOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BrowserAddPrivacySandboxEnrollmentOverrideResult]()),
	}
	types.commandSchemas["Browser.addPrivacySandboxCoordinatorKeyConfig"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[BrowserAddPrivacySandboxCoordinatorKeyConfigParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[BrowserAddPrivacySandboxCoordinatorKeyConfigResult]()),
	}
	types.commandSchemas["CSS.addRule"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSAddRuleParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSAddRuleResult]()),
	}
	types.commandSchemas["CSS.collectClassNames"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSCollectClassNamesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSCollectClassNamesResult]()),
	}
	types.commandSchemas["CSS.createStyleSheet"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSCreateStyleSheetParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSCreateStyleSheetResult]()),
	}
	types.commandSchemas["CSS.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSDisableResult]()),
	}
	types.commandSchemas["CSS.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSEnableResult]()),
	}
	types.commandSchemas["CSS.forcePseudoState"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSForcePseudoStateParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSForcePseudoStateResult]()),
	}
	types.commandSchemas["CSS.forceStartingStyle"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSForceStartingStyleParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSForceStartingStyleResult]()),
	}
	types.commandSchemas["CSS.getBackgroundColors"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSGetBackgroundColorsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSGetBackgroundColorsResult]()),
	}
	types.commandSchemas["CSS.getComputedStyleForNode"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSGetComputedStyleForNodeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSGetComputedStyleForNodeResult]()),
	}
	types.commandSchemas["CSS.resolveValues"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSResolveValuesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSResolveValuesResult]()),
	}
	types.commandSchemas["CSS.getLonghandProperties"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSGetLonghandPropertiesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSGetLonghandPropertiesResult]()),
	}
	types.commandSchemas["CSS.getInlineStylesForNode"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSGetInlineStylesForNodeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSGetInlineStylesForNodeResult]()),
	}
	types.commandSchemas["CSS.getAnimatedStylesForNode"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSGetAnimatedStylesForNodeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSGetAnimatedStylesForNodeResult]()),
	}
	types.commandSchemas["CSS.getMatchedStylesForNode"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSGetMatchedStylesForNodeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSGetMatchedStylesForNodeResult]()),
	}
	types.commandSchemas["CSS.getEnvironmentVariables"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSGetEnvironmentVariablesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSGetEnvironmentVariablesResult]()),
	}
	types.commandSchemas["CSS.getMediaQueries"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSGetMediaQueriesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSGetMediaQueriesResult]()),
	}
	types.commandSchemas["CSS.getPlatformFontsForNode"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSGetPlatformFontsForNodeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSGetPlatformFontsForNodeResult]()),
	}
	types.commandSchemas["CSS.getStyleSheetText"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSGetStyleSheetTextParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSGetStyleSheetTextResult]()),
	}
	types.commandSchemas["CSS.getLayersForNode"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSGetLayersForNodeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSGetLayersForNodeResult]()),
	}
	types.commandSchemas["CSS.getLocationForSelector"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSGetLocationForSelectorParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSGetLocationForSelectorResult]()),
	}
	types.commandSchemas["CSS.trackComputedStyleUpdatesForNode"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSTrackComputedStyleUpdatesForNodeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSTrackComputedStyleUpdatesForNodeResult]()),
	}
	types.commandSchemas["CSS.trackComputedStyleUpdates"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSTrackComputedStyleUpdatesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSTrackComputedStyleUpdatesResult]()),
	}
	types.commandSchemas["CSS.takeComputedStyleUpdates"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSTakeComputedStyleUpdatesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSTakeComputedStyleUpdatesResult]()),
	}
	types.commandSchemas["CSS.setEffectivePropertyValueForNode"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSSetEffectivePropertyValueForNodeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSSetEffectivePropertyValueForNodeResult]()),
	}
	types.commandSchemas["CSS.setPropertyRulePropertyName"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSSetPropertyRulePropertyNameParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSSetPropertyRulePropertyNameResult]()),
	}
	types.commandSchemas["CSS.setKeyframeKey"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSSetKeyframeKeyParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSSetKeyframeKeyResult]()),
	}
	types.commandSchemas["CSS.setMediaText"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSSetMediaTextParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSSetMediaTextResult]()),
	}
	types.commandSchemas["CSS.setContainerQueryText"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSSetContainerQueryTextParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSSetContainerQueryTextResult]()),
	}
	types.commandSchemas["CSS.setSupportsText"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSSetSupportsTextParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSSetSupportsTextResult]()),
	}
	types.commandSchemas["CSS.setNavigationText"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSSetNavigationTextParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSSetNavigationTextResult]()),
	}
	types.commandSchemas["CSS.setScopeText"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSSetScopeTextParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSSetScopeTextResult]()),
	}
	types.commandSchemas["CSS.setRuleSelector"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSSetRuleSelectorParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSSetRuleSelectorResult]()),
	}
	types.commandSchemas["CSS.setStyleSheetText"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSSetStyleSheetTextParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSSetStyleSheetTextResult]()),
	}
	types.commandSchemas["CSS.setStyleTexts"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSSetStyleTextsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSSetStyleTextsResult]()),
	}
	types.commandSchemas["CSS.startRuleUsageTracking"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSStartRuleUsageTrackingParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSStartRuleUsageTrackingResult]()),
	}
	types.commandSchemas["CSS.stopRuleUsageTracking"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSStopRuleUsageTrackingParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSStopRuleUsageTrackingResult]()),
	}
	types.commandSchemas["CSS.takeCoverageDelta"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSTakeCoverageDeltaParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSTakeCoverageDeltaResult]()),
	}
	types.commandSchemas["CSS.setLocalFontsEnabled"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CSSSetLocalFontsEnabledParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CSSSetLocalFontsEnabledResult]()),
	}
	types.commandSchemas["CacheStorage.deleteCache"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CacheStorageDeleteCacheParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CacheStorageDeleteCacheResult]()),
	}
	types.commandSchemas["CacheStorage.deleteEntry"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CacheStorageDeleteEntryParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CacheStorageDeleteEntryResult]()),
	}
	types.commandSchemas["CacheStorage.requestCacheNames"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CacheStorageRequestCacheNamesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CacheStorageRequestCacheNamesResult]()),
	}
	types.commandSchemas["CacheStorage.requestCachedResponse"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CacheStorageRequestCachedResponseParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CacheStorageRequestCachedResponseResult]()),
	}
	types.commandSchemas["CacheStorage.requestEntries"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CacheStorageRequestEntriesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CacheStorageRequestEntriesResult]()),
	}
	types.commandSchemas["Cast.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CastEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CastEnableResult]()),
	}
	types.commandSchemas["Cast.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CastDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CastDisableResult]()),
	}
	types.commandSchemas["Cast.setSinkToUse"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CastSetSinkToUseParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CastSetSinkToUseResult]()),
	}
	types.commandSchemas["Cast.startDesktopMirroring"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CastStartDesktopMirroringParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CastStartDesktopMirroringResult]()),
	}
	types.commandSchemas["Cast.startTabMirroring"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CastStartTabMirroringParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CastStartTabMirroringResult]()),
	}
	types.commandSchemas["Cast.stopCasting"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CastStopCastingParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CastStopCastingResult]()),
	}
	types.commandSchemas["Console.clearMessages"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ConsoleClearMessagesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ConsoleClearMessagesResult]()),
	}
	types.commandSchemas["Console.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ConsoleDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ConsoleDisableResult]()),
	}
	types.commandSchemas["Console.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ConsoleEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ConsoleEnableResult]()),
	}
	types.commandSchemas["DOM.collectClassNamesFromSubtree"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMCollectClassNamesFromSubtreeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMCollectClassNamesFromSubtreeResult]()),
	}
	types.commandSchemas["DOM.copyTo"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMCopyToParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMCopyToResult]()),
	}
	types.commandSchemas["DOM.describeNode"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMDescribeNodeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMDescribeNodeResult]()),
	}
	types.commandSchemas["DOM.scrollIntoViewIfNeeded"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMScrollIntoViewIfNeededParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMScrollIntoViewIfNeededResult]()),
	}
	types.commandSchemas["DOM.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMDisableResult]()),
	}
	types.commandSchemas["DOM.discardSearchResults"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMDiscardSearchResultsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMDiscardSearchResultsResult]()),
	}
	types.commandSchemas["DOM.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMEnableResult]()),
	}
	types.commandSchemas["DOM.focus"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMFocusParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMFocusResult]()),
	}
	types.commandSchemas["DOM.getAttributes"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMGetAttributesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMGetAttributesResult]()),
	}
	types.commandSchemas["DOM.getBoxModel"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMGetBoxModelParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMGetBoxModelResult]()),
	}
	types.commandSchemas["DOM.getContentQuads"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMGetContentQuadsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMGetContentQuadsResult]()),
	}
	types.commandSchemas["DOM.getDocument"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMGetDocumentParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMGetDocumentResult]()),
	}
	types.commandSchemas["DOM.getFlattenedDocument"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMGetFlattenedDocumentParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMGetFlattenedDocumentResult]()),
	}
	types.commandSchemas["DOM.getNodesForSubtreeByStyle"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMGetNodesForSubtreeByStyleParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMGetNodesForSubtreeByStyleResult]()),
	}
	types.commandSchemas["DOM.getNodeForLocation"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMGetNodeForLocationParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMGetNodeForLocationResult]()),
	}
	types.commandSchemas["DOM.getOuterHTML"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMGetOuterHTMLParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMGetOuterHTMLResult]()),
	}
	types.commandSchemas["DOM.getRelayoutBoundary"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMGetRelayoutBoundaryParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMGetRelayoutBoundaryResult]()),
	}
	types.commandSchemas["DOM.getSearchResults"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMGetSearchResultsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMGetSearchResultsResult]()),
	}
	types.commandSchemas["DOM.hideHighlight"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMHideHighlightParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMHideHighlightResult]()),
	}
	types.commandSchemas["DOM.highlightNode"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMHighlightNodeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMHighlightNodeResult]()),
	}
	types.commandSchemas["DOM.highlightRect"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMHighlightRectParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMHighlightRectResult]()),
	}
	types.commandSchemas["DOM.markUndoableState"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMMarkUndoableStateParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMMarkUndoableStateResult]()),
	}
	types.commandSchemas["DOM.moveTo"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMMoveToParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMMoveToResult]()),
	}
	types.commandSchemas["DOM.performSearch"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMPerformSearchParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMPerformSearchResult]()),
	}
	types.commandSchemas["DOM.pushNodeByPathToFrontend"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMPushNodeByPathToFrontendParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMPushNodeByPathToFrontendResult]()),
	}
	types.commandSchemas["DOM.pushNodesByBackendIdsToFrontend"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMPushNodesByBackendIdsToFrontendParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMPushNodesByBackendIdsToFrontendResult]()),
	}
	types.commandSchemas["DOM.querySelector"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMQuerySelectorParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMQuerySelectorResult]()),
	}
	types.commandSchemas["DOM.querySelectorAll"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMQuerySelectorAllParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMQuerySelectorAllResult]()),
	}
	types.commandSchemas["DOM.getTopLayerElements"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMGetTopLayerElementsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMGetTopLayerElementsResult]()),
	}
	types.commandSchemas["DOM.getElementByRelation"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMGetElementByRelationParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMGetElementByRelationResult]()),
	}
	types.commandSchemas["DOM.redo"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMRedoParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMRedoResult]()),
	}
	types.commandSchemas["DOM.removeAttribute"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMRemoveAttributeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMRemoveAttributeResult]()),
	}
	types.commandSchemas["DOM.removeNode"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMRemoveNodeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMRemoveNodeResult]()),
	}
	types.commandSchemas["DOM.requestChildNodes"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMRequestChildNodesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMRequestChildNodesResult]()),
	}
	types.commandSchemas["DOM.requestNode"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMRequestNodeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMRequestNodeResult]()),
	}
	types.commandSchemas["DOM.resolveNode"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMResolveNodeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMResolveNodeResult]()),
	}
	types.commandSchemas["DOM.setAttributeValue"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMSetAttributeValueParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMSetAttributeValueResult]()),
	}
	types.commandSchemas["DOM.setAttributesAsText"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMSetAttributesAsTextParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMSetAttributesAsTextResult]()),
	}
	types.commandSchemas["DOM.setFileInputFiles"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMSetFileInputFilesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMSetFileInputFilesResult]()),
	}
	types.commandSchemas["DOM.setNodeStackTracesEnabled"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMSetNodeStackTracesEnabledParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMSetNodeStackTracesEnabledResult]()),
	}
	types.commandSchemas["DOM.getNodeStackTraces"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMGetNodeStackTracesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMGetNodeStackTracesResult]()),
	}
	types.commandSchemas["DOM.getFileInfo"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMGetFileInfoParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMGetFileInfoResult]()),
	}
	types.commandSchemas["DOM.getDetachedDomNodes"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMGetDetachedDOMNodesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMGetDetachedDOMNodesResult]()),
	}
	types.commandSchemas["DOM.setInspectedNode"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMSetInspectedNodeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMSetInspectedNodeResult]()),
	}
	types.commandSchemas["DOM.setNodeName"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMSetNodeNameParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMSetNodeNameResult]()),
	}
	types.commandSchemas["DOM.setNodeValue"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMSetNodeValueParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMSetNodeValueResult]()),
	}
	types.commandSchemas["DOM.setOuterHTML"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMSetOuterHTMLParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMSetOuterHTMLResult]()),
	}
	types.commandSchemas["DOM.undo"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMUndoParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMUndoResult]()),
	}
	types.commandSchemas["DOM.getFrameOwner"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMGetFrameOwnerParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMGetFrameOwnerResult]()),
	}
	types.commandSchemas["DOM.getContainerForNode"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMGetContainerForNodeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMGetContainerForNodeResult]()),
	}
	types.commandSchemas["DOM.getQueryingDescendantsForContainer"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMGetQueryingDescendantsForContainerParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMGetQueryingDescendantsForContainerResult]()),
	}
	types.commandSchemas["DOM.getAnchorElement"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMGetAnchorElementParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMGetAnchorElementResult]()),
	}
	types.commandSchemas["DOM.forceShowPopover"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMForceShowPopoverParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMForceShowPopoverResult]()),
	}
	types.commandSchemas["DOMDebugger.getEventListeners"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMDebuggerGetEventListenersParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMDebuggerGetEventListenersResult]()),
	}
	types.commandSchemas["DOMDebugger.removeDOMBreakpoint"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMDebuggerRemoveDOMBreakpointParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMDebuggerRemoveDOMBreakpointResult]()),
	}
	types.commandSchemas["DOMDebugger.removeEventListenerBreakpoint"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMDebuggerRemoveEventListenerBreakpointParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMDebuggerRemoveEventListenerBreakpointResult]()),
	}
	types.commandSchemas["DOMDebugger.removeInstrumentationBreakpoint"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMDebuggerRemoveInstrumentationBreakpointParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMDebuggerRemoveInstrumentationBreakpointResult]()),
	}
	types.commandSchemas["DOMDebugger.removeXHRBreakpoint"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMDebuggerRemoveXHRBreakpointParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMDebuggerRemoveXHRBreakpointResult]()),
	}
	types.commandSchemas["DOMDebugger.setBreakOnCSPViolation"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMDebuggerSetBreakOnCSPViolationParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMDebuggerSetBreakOnCSPViolationResult]()),
	}
	types.commandSchemas["DOMDebugger.setDOMBreakpoint"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMDebuggerSetDOMBreakpointParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMDebuggerSetDOMBreakpointResult]()),
	}
	types.commandSchemas["DOMDebugger.setEventListenerBreakpoint"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMDebuggerSetEventListenerBreakpointParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMDebuggerSetEventListenerBreakpointResult]()),
	}
	types.commandSchemas["DOMDebugger.setInstrumentationBreakpoint"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMDebuggerSetInstrumentationBreakpointParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMDebuggerSetInstrumentationBreakpointResult]()),
	}
	types.commandSchemas["DOMDebugger.setXHRBreakpoint"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMDebuggerSetXHRBreakpointParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMDebuggerSetXHRBreakpointResult]()),
	}
	types.commandSchemas["DOMSnapshot.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMSnapshotDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMSnapshotDisableResult]()),
	}
	types.commandSchemas["DOMSnapshot.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMSnapshotEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMSnapshotEnableResult]()),
	}
	types.commandSchemas["DOMSnapshot.getSnapshot"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMSnapshotGetSnapshotParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMSnapshotGetSnapshotResult]()),
	}
	types.commandSchemas["DOMSnapshot.captureSnapshot"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMSnapshotCaptureSnapshotParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMSnapshotCaptureSnapshotResult]()),
	}
	types.commandSchemas["DOMStorage.clear"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMStorageClearParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMStorageClearResult]()),
	}
	types.commandSchemas["DOMStorage.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMStorageDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMStorageDisableResult]()),
	}
	types.commandSchemas["DOMStorage.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMStorageEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMStorageEnableResult]()),
	}
	types.commandSchemas["DOMStorage.getDOMStorageItems"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMStorageGetDOMStorageItemsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMStorageGetDOMStorageItemsResult]()),
	}
	types.commandSchemas["DOMStorage.removeDOMStorageItem"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMStorageRemoveDOMStorageItemParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMStorageRemoveDOMStorageItemResult]()),
	}
	types.commandSchemas["DOMStorage.setDOMStorageItem"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DOMStorageSetDOMStorageItemParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DOMStorageSetDOMStorageItemResult]()),
	}
	types.commandSchemas["Debugger.continueToLocation"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerContinueToLocationParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerContinueToLocationResult]()),
	}
	types.commandSchemas["Debugger.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerDisableResult]()),
	}
	types.commandSchemas["Debugger.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerEnableResult]()),
	}
	types.commandSchemas["Debugger.evaluateOnCallFrame"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerEvaluateOnCallFrameParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerEvaluateOnCallFrameResult]()),
	}
	types.commandSchemas["Debugger.getPossibleBreakpoints"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerGetPossibleBreakpointsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerGetPossibleBreakpointsResult]()),
	}
	types.commandSchemas["Debugger.getScriptSource"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerGetScriptSourceParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerGetScriptSourceResult]()),
	}
	types.commandSchemas["Debugger.disassembleWasmModule"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerDisassembleWasmModuleParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerDisassembleWasmModuleResult]()),
	}
	types.commandSchemas["Debugger.nextWasmDisassemblyChunk"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerNextWasmDisassemblyChunkParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerNextWasmDisassemblyChunkResult]()),
	}
	types.commandSchemas["Debugger.getWasmBytecode"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerGetWasmBytecodeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerGetWasmBytecodeResult]()),
	}
	types.commandSchemas["Debugger.getStackTrace"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerGetStackTraceParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerGetStackTraceResult]()),
	}
	types.commandSchemas["Debugger.pause"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerPauseParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerPauseResult]()),
	}
	types.commandSchemas["Debugger.pauseOnAsyncCall"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerPauseOnAsyncCallParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerPauseOnAsyncCallResult]()),
	}
	types.commandSchemas["Debugger.removeBreakpoint"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerRemoveBreakpointParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerRemoveBreakpointResult]()),
	}
	types.commandSchemas["Debugger.restartFrame"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerRestartFrameParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerRestartFrameResult]()),
	}
	types.commandSchemas["Debugger.resume"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerResumeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerResumeResult]()),
	}
	types.commandSchemas["Debugger.searchInContent"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerSearchInContentParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerSearchInContentResult]()),
	}
	types.commandSchemas["Debugger.setAsyncCallStackDepth"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerSetAsyncCallStackDepthParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerSetAsyncCallStackDepthResult]()),
	}
	types.commandSchemas["Debugger.setBlackboxExecutionContexts"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerSetBlackboxExecutionContextsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerSetBlackboxExecutionContextsResult]()),
	}
	types.commandSchemas["Debugger.setBlackboxPatterns"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerSetBlackboxPatternsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerSetBlackboxPatternsResult]()),
	}
	types.commandSchemas["Debugger.setBlackboxedRanges"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerSetBlackboxedRangesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerSetBlackboxedRangesResult]()),
	}
	types.commandSchemas["Debugger.setBreakpoint"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerSetBreakpointParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerSetBreakpointResult]()),
	}
	types.commandSchemas["Debugger.setInstrumentationBreakpoint"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerSetInstrumentationBreakpointParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerSetInstrumentationBreakpointResult]()),
	}
	types.commandSchemas["Debugger.setBreakpointByUrl"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerSetBreakpointByURLParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerSetBreakpointByURLResult]()),
	}
	types.commandSchemas["Debugger.setBreakpointOnFunctionCall"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerSetBreakpointOnFunctionCallParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerSetBreakpointOnFunctionCallResult]()),
	}
	types.commandSchemas["Debugger.setBreakpointsActive"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerSetBreakpointsActiveParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerSetBreakpointsActiveResult]()),
	}
	types.commandSchemas["Debugger.setPauseOnExceptions"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerSetPauseOnExceptionsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerSetPauseOnExceptionsResult]()),
	}
	types.commandSchemas["Debugger.setReturnValue"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerSetReturnValueParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerSetReturnValueResult]()),
	}
	types.commandSchemas["Debugger.setScriptSource"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerSetScriptSourceParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerSetScriptSourceResult]()),
	}
	types.commandSchemas["Debugger.setSkipAllPauses"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerSetSkipAllPausesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerSetSkipAllPausesResult]()),
	}
	types.commandSchemas["Debugger.setVariableValue"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerSetVariableValueParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerSetVariableValueResult]()),
	}
	types.commandSchemas["Debugger.stepInto"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerStepIntoParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerStepIntoResult]()),
	}
	types.commandSchemas["Debugger.stepOut"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerStepOutParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerStepOutResult]()),
	}
	types.commandSchemas["Debugger.stepOver"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DebuggerStepOverParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DebuggerStepOverResult]()),
	}
	types.commandSchemas["DeviceAccess.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DeviceAccessEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DeviceAccessEnableResult]()),
	}
	types.commandSchemas["DeviceAccess.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DeviceAccessDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DeviceAccessDisableResult]()),
	}
	types.commandSchemas["DeviceAccess.selectPrompt"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DeviceAccessSelectPromptParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DeviceAccessSelectPromptResult]()),
	}
	types.commandSchemas["DeviceAccess.cancelPrompt"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DeviceAccessCancelPromptParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DeviceAccessCancelPromptResult]()),
	}
	types.commandSchemas["DeviceOrientation.clearDeviceOrientationOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DeviceOrientationClearDeviceOrientationOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DeviceOrientationClearDeviceOrientationOverrideResult]()),
	}
	types.commandSchemas["DeviceOrientation.setDeviceOrientationOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[DeviceOrientationSetDeviceOrientationOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[DeviceOrientationSetDeviceOrientationOverrideResult]()),
	}
	types.commandSchemas["Emulation.canEmulate"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationCanEmulateParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationCanEmulateResult]()),
	}
	types.commandSchemas["Emulation.clearDeviceMetricsOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationClearDeviceMetricsOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationClearDeviceMetricsOverrideResult]()),
	}
	types.commandSchemas["Emulation.clearGeolocationOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationClearGeolocationOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationClearGeolocationOverrideResult]()),
	}
	types.commandSchemas["Emulation.resetPageScaleFactor"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationResetPageScaleFactorParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationResetPageScaleFactorResult]()),
	}
	types.commandSchemas["Emulation.setFocusEmulationEnabled"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetFocusEmulationEnabledParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetFocusEmulationEnabledResult]()),
	}
	types.commandSchemas["Emulation.setAutoDarkModeOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetAutoDarkModeOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetAutoDarkModeOverrideResult]()),
	}
	types.commandSchemas["Emulation.setCPUThrottlingRate"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetCPUThrottlingRateParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetCPUThrottlingRateResult]()),
	}
	types.commandSchemas["Emulation.setDefaultBackgroundColorOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetDefaultBackgroundColorOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetDefaultBackgroundColorOverrideResult]()),
	}
	types.commandSchemas["Emulation.setSafeAreaInsetsOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetSafeAreaInsetsOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetSafeAreaInsetsOverrideResult]()),
	}
	types.commandSchemas["Emulation.setDeviceMetricsOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetDeviceMetricsOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetDeviceMetricsOverrideResult]()),
	}
	types.commandSchemas["Emulation.setDevicePostureOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetDevicePostureOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetDevicePostureOverrideResult]()),
	}
	types.commandSchemas["Emulation.clearDevicePostureOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationClearDevicePostureOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationClearDevicePostureOverrideResult]()),
	}
	types.commandSchemas["Emulation.setDisplayFeaturesOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetDisplayFeaturesOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetDisplayFeaturesOverrideResult]()),
	}
	types.commandSchemas["Emulation.clearDisplayFeaturesOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationClearDisplayFeaturesOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationClearDisplayFeaturesOverrideResult]()),
	}
	types.commandSchemas["Emulation.setScrollbarsHidden"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetScrollbarsHiddenParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetScrollbarsHiddenResult]()),
	}
	types.commandSchemas["Emulation.setDocumentCookieDisabled"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetDocumentCookieDisabledParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetDocumentCookieDisabledResult]()),
	}
	types.commandSchemas["Emulation.setEmitTouchEventsForMouse"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetEmitTouchEventsForMouseParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetEmitTouchEventsForMouseResult]()),
	}
	types.commandSchemas["Emulation.setEmulatedMedia"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetEmulatedMediaParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetEmulatedMediaResult]()),
	}
	types.commandSchemas["Emulation.setEmulatedVisionDeficiency"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetEmulatedVisionDeficiencyParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetEmulatedVisionDeficiencyResult]()),
	}
	types.commandSchemas["Emulation.setEmulatedOSTextScale"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetEmulatedOSTextScaleParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetEmulatedOSTextScaleResult]()),
	}
	types.commandSchemas["Emulation.setGeolocationOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetGeolocationOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetGeolocationOverrideResult]()),
	}
	types.commandSchemas["Emulation.getOverriddenSensorInformation"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationGetOverriddenSensorInformationParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationGetOverriddenSensorInformationResult]()),
	}
	types.commandSchemas["Emulation.setSensorOverrideEnabled"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetSensorOverrideEnabledParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetSensorOverrideEnabledResult]()),
	}
	types.commandSchemas["Emulation.setSensorOverrideReadings"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetSensorOverrideReadingsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetSensorOverrideReadingsResult]()),
	}
	types.commandSchemas["Emulation.setPressureSourceOverrideEnabled"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetPressureSourceOverrideEnabledParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetPressureSourceOverrideEnabledResult]()),
	}
	types.commandSchemas["Emulation.setPressureStateOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetPressureStateOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetPressureStateOverrideResult]()),
	}
	types.commandSchemas["Emulation.setPressureDataOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetPressureDataOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetPressureDataOverrideResult]()),
	}
	types.commandSchemas["Emulation.setIdleOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetIdleOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetIdleOverrideResult]()),
	}
	types.commandSchemas["Emulation.clearIdleOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationClearIdleOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationClearIdleOverrideResult]()),
	}
	types.commandSchemas["Emulation.setNavigatorOverrides"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetNavigatorOverridesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetNavigatorOverridesResult]()),
	}
	types.commandSchemas["Emulation.setPageScaleFactor"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetPageScaleFactorParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetPageScaleFactorResult]()),
	}
	types.commandSchemas["Emulation.setScriptExecutionDisabled"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetScriptExecutionDisabledParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetScriptExecutionDisabledResult]()),
	}
	types.commandSchemas["Emulation.setTouchEmulationEnabled"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetTouchEmulationEnabledParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetTouchEmulationEnabledResult]()),
	}
	types.commandSchemas["Emulation.setVirtualTimePolicy"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetVirtualTimePolicyParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetVirtualTimePolicyResult]()),
	}
	types.commandSchemas["Emulation.setLocaleOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetLocaleOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetLocaleOverrideResult]()),
	}
	types.commandSchemas["Emulation.setTimezoneOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetTimezoneOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetTimezoneOverrideResult]()),
	}
	types.commandSchemas["Emulation.setVisibleSize"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetVisibleSizeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetVisibleSizeResult]()),
	}
	types.commandSchemas["Emulation.setDisabledImageTypes"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetDisabledImageTypesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetDisabledImageTypesResult]()),
	}
	types.commandSchemas["Emulation.setDataSaverOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetDataSaverOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetDataSaverOverrideResult]()),
	}
	types.commandSchemas["Emulation.setHardwareConcurrencyOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetHardwareConcurrencyOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetHardwareConcurrencyOverrideResult]()),
	}
	types.commandSchemas["Emulation.setUserAgentOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetUserAgentOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetUserAgentOverrideResult]()),
	}
	types.commandSchemas["Emulation.setAutomationOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetAutomationOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetAutomationOverrideResult]()),
	}
	types.commandSchemas["Emulation.setSmallViewportHeightDifferenceOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetSmallViewportHeightDifferenceOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetSmallViewportHeightDifferenceOverrideResult]()),
	}
	types.commandSchemas["Emulation.getScreenInfos"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationGetScreenInfosParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationGetScreenInfosResult]()),
	}
	types.commandSchemas["Emulation.addScreen"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationAddScreenParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationAddScreenResult]()),
	}
	types.commandSchemas["Emulation.updateScreen"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationUpdateScreenParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationUpdateScreenResult]()),
	}
	types.commandSchemas["Emulation.removeScreen"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationRemoveScreenParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationRemoveScreenResult]()),
	}
	types.commandSchemas["Emulation.setPrimaryScreen"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EmulationSetPrimaryScreenParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EmulationSetPrimaryScreenResult]()),
	}
	types.commandSchemas["EventBreakpoints.setInstrumentationBreakpoint"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EventBreakpointsSetInstrumentationBreakpointParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EventBreakpointsSetInstrumentationBreakpointResult]()),
	}
	types.commandSchemas["EventBreakpoints.removeInstrumentationBreakpoint"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EventBreakpointsRemoveInstrumentationBreakpointParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EventBreakpointsRemoveInstrumentationBreakpointResult]()),
	}
	types.commandSchemas["EventBreakpoints.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[EventBreakpointsDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[EventBreakpointsDisableResult]()),
	}
	types.commandSchemas["Extensions.triggerAction"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ExtensionsTriggerActionParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ExtensionsTriggerActionResult]()),
	}
	types.commandSchemas["Extensions.loadUnpacked"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[CDPParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[CDPResult]()),
	}
	types.commandSchemas["Extensions.getExtensions"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ExtensionsGetExtensionsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ExtensionsGetExtensionsResult]()),
	}
	types.commandSchemas["Extensions.uninstall"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ExtensionsUninstallParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ExtensionsUninstallResult]()),
	}
	types.commandSchemas["Extensions.getStorageItems"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ExtensionsGetStorageItemsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ExtensionsGetStorageItemsResult]()),
	}
	types.commandSchemas["Extensions.removeStorageItems"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ExtensionsRemoveStorageItemsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ExtensionsRemoveStorageItemsResult]()),
	}
	types.commandSchemas["Extensions.clearStorageItems"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ExtensionsClearStorageItemsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ExtensionsClearStorageItemsResult]()),
	}
	types.commandSchemas["Extensions.setStorageItems"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ExtensionsSetStorageItemsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ExtensionsSetStorageItemsResult]()),
	}
	types.commandSchemas["FedCm.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[FedCmEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[FedCmEnableResult]()),
	}
	types.commandSchemas["FedCm.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[FedCmDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[FedCmDisableResult]()),
	}
	types.commandSchemas["FedCm.selectAccount"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[FedCmSelectAccountParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[FedCmSelectAccountResult]()),
	}
	types.commandSchemas["FedCm.clickDialogButton"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[FedCmClickDialogButtonParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[FedCmClickDialogButtonResult]()),
	}
	types.commandSchemas["FedCm.openUrl"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[FedCmOpenURLParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[FedCmOpenURLResult]()),
	}
	types.commandSchemas["FedCm.dismissDialog"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[FedCmDismissDialogParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[FedCmDismissDialogResult]()),
	}
	types.commandSchemas["FedCm.resetCooldown"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[FedCmResetCooldownParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[FedCmResetCooldownResult]()),
	}
	types.commandSchemas["Fetch.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[FetchDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[FetchDisableResult]()),
	}
	types.commandSchemas["Fetch.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[FetchEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[FetchEnableResult]()),
	}
	types.commandSchemas["Fetch.failRequest"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[FetchFailRequestParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[FetchFailRequestResult]()),
	}
	types.commandSchemas["Fetch.fulfillRequest"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[FetchFulfillRequestParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[FetchFulfillRequestResult]()),
	}
	types.commandSchemas["Fetch.continueRequest"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[FetchContinueRequestParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[FetchContinueRequestResult]()),
	}
	types.commandSchemas["Fetch.continueWithAuth"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[FetchContinueWithAuthParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[FetchContinueWithAuthResult]()),
	}
	types.commandSchemas["Fetch.continueResponse"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[FetchContinueResponseParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[FetchContinueResponseResult]()),
	}
	types.commandSchemas["Fetch.getResponseBody"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[FetchGetResponseBodyParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[FetchGetResponseBodyResult]()),
	}
	types.commandSchemas["Fetch.takeResponseBodyAsStream"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[FetchTakeResponseBodyAsStreamParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[FetchTakeResponseBodyAsStreamResult]()),
	}
	types.commandSchemas["FileSystem.getDirectory"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[FileSystemGetDirectoryParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[FileSystemGetDirectoryResult]()),
	}
	types.commandSchemas["HeadlessExperimental.beginFrame"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[HeadlessExperimentalBeginFrameParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[HeadlessExperimentalBeginFrameResult]()),
	}
	types.commandSchemas["HeadlessExperimental.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[HeadlessExperimentalDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[HeadlessExperimentalDisableResult]()),
	}
	types.commandSchemas["HeadlessExperimental.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[HeadlessExperimentalEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[HeadlessExperimentalEnableResult]()),
	}
	types.commandSchemas["HeapProfiler.addInspectedHeapObject"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[HeapProfilerAddInspectedHeapObjectParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[HeapProfilerAddInspectedHeapObjectResult]()),
	}
	types.commandSchemas["HeapProfiler.collectGarbage"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[HeapProfilerCollectGarbageParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[HeapProfilerCollectGarbageResult]()),
	}
	types.commandSchemas["HeapProfiler.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[HeapProfilerDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[HeapProfilerDisableResult]()),
	}
	types.commandSchemas["HeapProfiler.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[HeapProfilerEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[HeapProfilerEnableResult]()),
	}
	types.commandSchemas["HeapProfiler.getHeapObjectId"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[HeapProfilerGetHeapObjectIDParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[HeapProfilerGetHeapObjectIDResult]()),
	}
	types.commandSchemas["HeapProfiler.getObjectByHeapObjectId"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[HeapProfilerGetObjectByHeapObjectIDParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[HeapProfilerGetObjectByHeapObjectIDResult]()),
	}
	types.commandSchemas["HeapProfiler.getSamplingProfile"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[HeapProfilerGetSamplingProfileParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[HeapProfilerGetSamplingProfileResult]()),
	}
	types.commandSchemas["HeapProfiler.startSampling"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[HeapProfilerStartSamplingParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[HeapProfilerStartSamplingResult]()),
	}
	types.commandSchemas["HeapProfiler.startTrackingHeapObjects"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[HeapProfilerStartTrackingHeapObjectsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[HeapProfilerStartTrackingHeapObjectsResult]()),
	}
	types.commandSchemas["HeapProfiler.stopSampling"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[HeapProfilerStopSamplingParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[HeapProfilerStopSamplingResult]()),
	}
	types.commandSchemas["HeapProfiler.stopTrackingHeapObjects"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[HeapProfilerStopTrackingHeapObjectsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[HeapProfilerStopTrackingHeapObjectsResult]()),
	}
	types.commandSchemas["HeapProfiler.takeHeapSnapshot"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[HeapProfilerTakeHeapSnapshotParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[HeapProfilerTakeHeapSnapshotResult]()),
	}
	types.commandSchemas["IO.close"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[IOCloseParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[IOCloseResult]()),
	}
	types.commandSchemas["IO.read"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[IOReadParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[IOReadResult]()),
	}
	types.commandSchemas["IO.resolveBlob"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[IOResolveBlobParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[IOResolveBlobResult]()),
	}
	types.commandSchemas["IndexedDB.clearObjectStore"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[IndexedDBClearObjectStoreParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[IndexedDBClearObjectStoreResult]()),
	}
	types.commandSchemas["IndexedDB.deleteDatabase"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[IndexedDBDeleteDatabaseParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[IndexedDBDeleteDatabaseResult]()),
	}
	types.commandSchemas["IndexedDB.deleteObjectStoreEntries"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[IndexedDBDeleteObjectStoreEntriesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[IndexedDBDeleteObjectStoreEntriesResult]()),
	}
	types.commandSchemas["IndexedDB.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[IndexedDBDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[IndexedDBDisableResult]()),
	}
	types.commandSchemas["IndexedDB.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[IndexedDBEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[IndexedDBEnableResult]()),
	}
	types.commandSchemas["IndexedDB.requestData"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[IndexedDBRequestDataParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[IndexedDBRequestDataResult]()),
	}
	types.commandSchemas["IndexedDB.getMetadata"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[IndexedDBGetMetadataParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[IndexedDBGetMetadataResult]()),
	}
	types.commandSchemas["IndexedDB.requestDatabase"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[IndexedDBRequestDatabaseParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[IndexedDBRequestDatabaseResult]()),
	}
	types.commandSchemas["IndexedDB.requestDatabaseNames"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[IndexedDBRequestDatabaseNamesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[IndexedDBRequestDatabaseNamesResult]()),
	}
	types.commandSchemas["Input.dispatchDragEvent"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[InputDispatchDragEventParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[InputDispatchDragEventResult]()),
	}
	types.commandSchemas["Input.dispatchKeyEvent"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[InputDispatchKeyEventParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[InputDispatchKeyEventResult]()),
	}
	types.commandSchemas["Input.insertText"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[InputInsertTextParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[InputInsertTextResult]()),
	}
	types.commandSchemas["Input.imeSetComposition"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[InputImeSetCompositionParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[InputImeSetCompositionResult]()),
	}
	types.commandSchemas["Input.dispatchMouseEvent"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[InputDispatchMouseEventParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[InputDispatchMouseEventResult]()),
	}
	types.commandSchemas["Input.dispatchTouchEvent"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[InputDispatchTouchEventParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[InputDispatchTouchEventResult]()),
	}
	types.commandSchemas["Input.cancelDragging"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[InputCancelDraggingParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[InputCancelDraggingResult]()),
	}
	types.commandSchemas["Input.emulateTouchFromMouseEvent"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[InputEmulateTouchFromMouseEventParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[InputEmulateTouchFromMouseEventResult]()),
	}
	types.commandSchemas["Input.setIgnoreInputEvents"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[InputSetIgnoreInputEventsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[InputSetIgnoreInputEventsResult]()),
	}
	types.commandSchemas["Input.setInterceptDrags"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[InputSetInterceptDragsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[InputSetInterceptDragsResult]()),
	}
	types.commandSchemas["Input.synthesizePinchGesture"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[InputSynthesizePinchGestureParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[InputSynthesizePinchGestureResult]()),
	}
	types.commandSchemas["Input.synthesizeScrollGesture"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[InputSynthesizeScrollGestureParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[InputSynthesizeScrollGestureResult]()),
	}
	types.commandSchemas["Input.synthesizeTapGesture"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[InputSynthesizeTapGestureParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[InputSynthesizeTapGestureResult]()),
	}
	types.commandSchemas["Inspector.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[InspectorDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[InspectorDisableResult]()),
	}
	types.commandSchemas["Inspector.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[InspectorEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[InspectorEnableResult]()),
	}
	types.commandSchemas["LayerTree.compositingReasons"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[LayerTreeCompositingReasonsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[LayerTreeCompositingReasonsResult]()),
	}
	types.commandSchemas["LayerTree.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[LayerTreeDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[LayerTreeDisableResult]()),
	}
	types.commandSchemas["LayerTree.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[LayerTreeEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[LayerTreeEnableResult]()),
	}
	types.commandSchemas["LayerTree.loadSnapshot"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[LayerTreeLoadSnapshotParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[LayerTreeLoadSnapshotResult]()),
	}
	types.commandSchemas["LayerTree.makeSnapshot"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[LayerTreeMakeSnapshotParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[LayerTreeMakeSnapshotResult]()),
	}
	types.commandSchemas["LayerTree.profileSnapshot"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[LayerTreeProfileSnapshotParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[LayerTreeProfileSnapshotResult]()),
	}
	types.commandSchemas["LayerTree.releaseSnapshot"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[LayerTreeReleaseSnapshotParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[LayerTreeReleaseSnapshotResult]()),
	}
	types.commandSchemas["LayerTree.replaySnapshot"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[LayerTreeReplaySnapshotParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[LayerTreeReplaySnapshotResult]()),
	}
	types.commandSchemas["LayerTree.snapshotCommandLog"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[LayerTreeSnapshotCommandLogParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[LayerTreeSnapshotCommandLogResult]()),
	}
	types.commandSchemas["Log.clear"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[LogClearParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[LogClearResult]()),
	}
	types.commandSchemas["Log.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[LogDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[LogDisableResult]()),
	}
	types.commandSchemas["Log.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[LogEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[LogEnableResult]()),
	}
	types.commandSchemas["Log.startViolationsReport"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[LogStartViolationsReportParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[LogStartViolationsReportResult]()),
	}
	types.commandSchemas["Log.stopViolationsReport"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[LogStopViolationsReportParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[LogStopViolationsReportResult]()),
	}
	types.commandSchemas["Media.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[MediaEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[MediaEnableResult]()),
	}
	types.commandSchemas["Media.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[MediaDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[MediaDisableResult]()),
	}
	types.commandSchemas["Memory.getDOMCounters"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[MemoryGetDOMCountersParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[MemoryGetDOMCountersResult]()),
	}
	types.commandSchemas["Memory.getDOMCountersForLeakDetection"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[MemoryGetDOMCountersForLeakDetectionParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[MemoryGetDOMCountersForLeakDetectionResult]()),
	}
	types.commandSchemas["Memory.prepareForLeakDetection"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[MemoryPrepareForLeakDetectionParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[MemoryPrepareForLeakDetectionResult]()),
	}
	types.commandSchemas["Memory.forciblyPurgeJavaScriptMemory"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[MemoryForciblyPurgeJavaScriptMemoryParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[MemoryForciblyPurgeJavaScriptMemoryResult]()),
	}
	types.commandSchemas["Memory.setPressureNotificationsSuppressed"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[MemorySetPressureNotificationsSuppressedParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[MemorySetPressureNotificationsSuppressedResult]()),
	}
	types.commandSchemas["Memory.simulatePressureNotification"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[MemorySimulatePressureNotificationParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[MemorySimulatePressureNotificationResult]()),
	}
	types.commandSchemas["Memory.startSampling"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[MemoryStartSamplingParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[MemoryStartSamplingResult]()),
	}
	types.commandSchemas["Memory.stopSampling"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[MemoryStopSamplingParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[MemoryStopSamplingResult]()),
	}
	types.commandSchemas["Memory.getAllTimeSamplingProfile"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[MemoryGetAllTimeSamplingProfileParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[MemoryGetAllTimeSamplingProfileResult]()),
	}
	types.commandSchemas["Memory.getBrowserSamplingProfile"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[MemoryGetBrowserSamplingProfileParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[MemoryGetBrowserSamplingProfileResult]()),
	}
	types.commandSchemas["Memory.getSamplingProfile"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[MemoryGetSamplingProfileParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[MemoryGetSamplingProfileResult]()),
	}
	types.commandSchemas["Network.setAcceptedEncodings"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkSetAcceptedEncodingsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkSetAcceptedEncodingsResult]()),
	}
	types.commandSchemas["Network.clearAcceptedEncodingsOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkClearAcceptedEncodingsOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkClearAcceptedEncodingsOverrideResult]()),
	}
	types.commandSchemas["Network.canClearBrowserCache"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkCanClearBrowserCacheParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkCanClearBrowserCacheResult]()),
	}
	types.commandSchemas["Network.canClearBrowserCookies"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkCanClearBrowserCookiesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkCanClearBrowserCookiesResult]()),
	}
	types.commandSchemas["Network.canEmulateNetworkConditions"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkCanEmulateNetworkConditionsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkCanEmulateNetworkConditionsResult]()),
	}
	types.commandSchemas["Network.clearBrowserCache"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkClearBrowserCacheParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkClearBrowserCacheResult]()),
	}
	types.commandSchemas["Network.clearBrowserCookies"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkClearBrowserCookiesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkClearBrowserCookiesResult]()),
	}
	types.commandSchemas["Network.continueInterceptedRequest"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkContinueInterceptedRequestParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkContinueInterceptedRequestResult]()),
	}
	types.commandSchemas["Network.deleteCookies"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkDeleteCookiesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkDeleteCookiesResult]()),
	}
	types.commandSchemas["Network.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkDisableResult]()),
	}
	types.commandSchemas["Network.emulateNetworkConditions"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkEmulateNetworkConditionsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkEmulateNetworkConditionsResult]()),
	}
	types.commandSchemas["Network.emulateNetworkConditionsByRule"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkEmulateNetworkConditionsByRuleParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkEmulateNetworkConditionsByRuleResult]()),
	}
	types.commandSchemas["Network.overrideNetworkState"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkOverrideNetworkStateParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkOverrideNetworkStateResult]()),
	}
	types.commandSchemas["Network.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkEnableResult]()),
	}
	types.commandSchemas["Network.configureDurableMessages"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkConfigureDurableMessagesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkConfigureDurableMessagesResult]()),
	}
	types.commandSchemas["Network.getAllCookies"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkGetAllCookiesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkGetAllCookiesResult]()),
	}
	types.commandSchemas["Network.getCertificate"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkGetCertificateParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkGetCertificateResult]()),
	}
	types.commandSchemas["Network.getCookies"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkGetCookiesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkGetCookiesResult]()),
	}
	types.commandSchemas["Network.getResponseBody"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkGetResponseBodyParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkGetResponseBodyResult]()),
	}
	types.commandSchemas["Network.getRequestPostData"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkGetRequestPostDataParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkGetRequestPostDataResult]()),
	}
	types.commandSchemas["Network.getResponseBodyForInterception"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkGetResponseBodyForInterceptionParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkGetResponseBodyForInterceptionResult]()),
	}
	types.commandSchemas["Network.takeResponseBodyForInterceptionAsStream"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkTakeResponseBodyForInterceptionAsStreamParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkTakeResponseBodyForInterceptionAsStreamResult]()),
	}
	types.commandSchemas["Network.replayXHR"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkReplayXHRParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkReplayXHRResult]()),
	}
	types.commandSchemas["Network.searchInResponseBody"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkSearchInResponseBodyParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkSearchInResponseBodyResult]()),
	}
	types.commandSchemas["Network.setBlockedURLs"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkSetBlockedURLsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkSetBlockedURLsResult]()),
	}
	types.commandSchemas["Network.setBypassServiceWorker"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkSetBypassServiceWorkerParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkSetBypassServiceWorkerResult]()),
	}
	types.commandSchemas["Network.setCacheDisabled"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkSetCacheDisabledParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkSetCacheDisabledResult]()),
	}
	types.commandSchemas["Network.setCookie"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkSetCookieParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkSetCookieResult]()),
	}
	types.commandSchemas["Network.setCookies"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkSetCookiesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkSetCookiesResult]()),
	}
	types.commandSchemas["Network.setExtraHTTPHeaders"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkSetExtraHTTPHeadersParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkSetExtraHTTPHeadersResult]()),
	}
	types.commandSchemas["Network.setAttachDebugStack"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkSetAttachDebugStackParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkSetAttachDebugStackResult]()),
	}
	types.commandSchemas["Network.setRequestInterception"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkSetRequestInterceptionParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkSetRequestInterceptionResult]()),
	}
	types.commandSchemas["Network.setUserAgentOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkSetUserAgentOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkSetUserAgentOverrideResult]()),
	}
	types.commandSchemas["Network.streamResourceContent"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkStreamResourceContentParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkStreamResourceContentResult]()),
	}
	types.commandSchemas["Network.getSecurityIsolationStatus"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkGetSecurityIsolationStatusParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkGetSecurityIsolationStatusResult]()),
	}
	types.commandSchemas["Network.enableReportingApi"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkEnableReportingAPIParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkEnableReportingAPIResult]()),
	}
	types.commandSchemas["Network.enableDeviceBoundSessions"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkEnableDeviceBoundSessionsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkEnableDeviceBoundSessionsResult]()),
	}
	types.commandSchemas["Network.fetchSchemefulSite"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkFetchSchemefulSiteParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkFetchSchemefulSiteResult]()),
	}
	types.commandSchemas["Network.loadNetworkResource"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkLoadNetworkResourceParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkLoadNetworkResourceResult]()),
	}
	types.commandSchemas["Network.setCookieControls"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[NetworkSetCookieControlsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[NetworkSetCookieControlsResult]()),
	}
	types.commandSchemas["Overlay.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlayDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlayDisableResult]()),
	}
	types.commandSchemas["Overlay.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlayEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlayEnableResult]()),
	}
	types.commandSchemas["Overlay.getHighlightObjectForTest"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlayGetHighlightObjectForTestParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlayGetHighlightObjectForTestResult]()),
	}
	types.commandSchemas["Overlay.getGridHighlightObjectsForTest"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlayGetGridHighlightObjectsForTestParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlayGetGridHighlightObjectsForTestResult]()),
	}
	types.commandSchemas["Overlay.getSourceOrderHighlightObjectForTest"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlayGetSourceOrderHighlightObjectForTestParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlayGetSourceOrderHighlightObjectForTestResult]()),
	}
	types.commandSchemas["Overlay.hideHighlight"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlayHideHighlightParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlayHideHighlightResult]()),
	}
	types.commandSchemas["Overlay.highlightFrame"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlayHighlightFrameParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlayHighlightFrameResult]()),
	}
	types.commandSchemas["Overlay.highlightNode"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlayHighlightNodeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlayHighlightNodeResult]()),
	}
	types.commandSchemas["Overlay.highlightQuad"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlayHighlightQuadParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlayHighlightQuadResult]()),
	}
	types.commandSchemas["Overlay.highlightRect"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlayHighlightRectParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlayHighlightRectResult]()),
	}
	types.commandSchemas["Overlay.highlightSourceOrder"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlayHighlightSourceOrderParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlayHighlightSourceOrderResult]()),
	}
	types.commandSchemas["Overlay.setInspectMode"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlaySetInspectModeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlaySetInspectModeResult]()),
	}
	types.commandSchemas["Overlay.setShowAdHighlights"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlaySetShowAdHighlightsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlaySetShowAdHighlightsResult]()),
	}
	types.commandSchemas["Overlay.setPausedInDebuggerMessage"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlaySetPausedInDebuggerMessageParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlaySetPausedInDebuggerMessageResult]()),
	}
	types.commandSchemas["Overlay.setShowDebugBorders"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlaySetShowDebugBordersParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlaySetShowDebugBordersResult]()),
	}
	types.commandSchemas["Overlay.setShowFPSCounter"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlaySetShowFPSCounterParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlaySetShowFPSCounterResult]()),
	}
	types.commandSchemas["Overlay.setShowGridOverlays"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlaySetShowGridOverlaysParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlaySetShowGridOverlaysResult]()),
	}
	types.commandSchemas["Overlay.setShowFlexOverlays"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlaySetShowFlexOverlaysParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlaySetShowFlexOverlaysResult]()),
	}
	types.commandSchemas["Overlay.setShowScrollSnapOverlays"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlaySetShowScrollSnapOverlaysParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlaySetShowScrollSnapOverlaysResult]()),
	}
	types.commandSchemas["Overlay.setShowContainerQueryOverlays"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlaySetShowContainerQueryOverlaysParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlaySetShowContainerQueryOverlaysResult]()),
	}
	types.commandSchemas["Overlay.setShowInspectedElementAnchor"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlaySetShowInspectedElementAnchorParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlaySetShowInspectedElementAnchorResult]()),
	}
	types.commandSchemas["Overlay.setShowPaintRects"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlaySetShowPaintRectsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlaySetShowPaintRectsResult]()),
	}
	types.commandSchemas["Overlay.setShowLayoutShiftRegions"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlaySetShowLayoutShiftRegionsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlaySetShowLayoutShiftRegionsResult]()),
	}
	types.commandSchemas["Overlay.setShowScrollBottleneckRects"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlaySetShowScrollBottleneckRectsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlaySetShowScrollBottleneckRectsResult]()),
	}
	types.commandSchemas["Overlay.setShowHitTestBorders"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlaySetShowHitTestBordersParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlaySetShowHitTestBordersResult]()),
	}
	types.commandSchemas["Overlay.setShowWebVitals"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlaySetShowWebVitalsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlaySetShowWebVitalsResult]()),
	}
	types.commandSchemas["Overlay.setShowViewportSizeOnResize"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlaySetShowViewportSizeOnResizeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlaySetShowViewportSizeOnResizeResult]()),
	}
	types.commandSchemas["Overlay.setShowHinge"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlaySetShowHingeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlaySetShowHingeResult]()),
	}
	types.commandSchemas["Overlay.setShowIsolatedElements"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlaySetShowIsolatedElementsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlaySetShowIsolatedElementsResult]()),
	}
	types.commandSchemas["Overlay.setShowWindowControlsOverlay"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[OverlaySetShowWindowControlsOverlayParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[OverlaySetShowWindowControlsOverlayResult]()),
	}
	types.commandSchemas["PWA.getOsAppState"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PWAGetOsAppStateParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PWAGetOsAppStateResult]()),
	}
	types.commandSchemas["PWA.install"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PWAInstallParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PWAInstallResult]()),
	}
	types.commandSchemas["PWA.uninstall"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PWAUninstallParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PWAUninstallResult]()),
	}
	types.commandSchemas["PWA.launch"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PWALaunchParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PWALaunchResult]()),
	}
	types.commandSchemas["PWA.launchFilesInApp"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PWALaunchFilesInAppParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PWALaunchFilesInAppResult]()),
	}
	types.commandSchemas["PWA.openCurrentPageInApp"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PWAOpenCurrentPageInAppParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PWAOpenCurrentPageInAppResult]()),
	}
	types.commandSchemas["PWA.changeAppUserSettings"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PWAChangeAppUserSettingsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PWAChangeAppUserSettingsResult]()),
	}
	types.commandSchemas["Page.addScriptToEvaluateOnLoad"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageAddScriptToEvaluateOnLoadParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageAddScriptToEvaluateOnLoadResult]()),
	}
	types.commandSchemas["Page.addScriptToEvaluateOnNewDocument"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageAddScriptToEvaluateOnNewDocumentParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageAddScriptToEvaluateOnNewDocumentResult]()),
	}
	types.commandSchemas["Page.bringToFront"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageBringToFrontParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageBringToFrontResult]()),
	}
	types.commandSchemas["Page.captureScreenshot"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageCaptureScreenshotParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageCaptureScreenshotResult]()),
	}
	types.commandSchemas["Page.captureSnapshot"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageCaptureSnapshotParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageCaptureSnapshotResult]()),
	}
	types.commandSchemas["Page.clearDeviceMetricsOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageClearDeviceMetricsOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageClearDeviceMetricsOverrideResult]()),
	}
	types.commandSchemas["Page.clearDeviceOrientationOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageClearDeviceOrientationOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageClearDeviceOrientationOverrideResult]()),
	}
	types.commandSchemas["Page.clearGeolocationOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageClearGeolocationOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageClearGeolocationOverrideResult]()),
	}
	types.commandSchemas["Page.createIsolatedWorld"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageCreateIsolatedWorldParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageCreateIsolatedWorldResult]()),
	}
	types.commandSchemas["Page.deleteCookie"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageDeleteCookieParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageDeleteCookieResult]()),
	}
	types.commandSchemas["Page.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageDisableResult]()),
	}
	types.commandSchemas["Page.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageEnableResult]()),
	}
	types.commandSchemas["Page.getAppManifest"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageGetAppManifestParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageGetAppManifestResult]()),
	}
	types.commandSchemas["Page.getInstallabilityErrors"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageGetInstallabilityErrorsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageGetInstallabilityErrorsResult]()),
	}
	types.commandSchemas["Page.getManifestIcons"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageGetManifestIconsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageGetManifestIconsResult]()),
	}
	types.commandSchemas["Page.getAppId"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageGetAppIDParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageGetAppIDResult]()),
	}
	types.commandSchemas["Page.getAdScriptAncestry"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageGetAdScriptAncestryParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageGetAdScriptAncestryResult]()),
	}
	types.commandSchemas["Page.getFrameTree"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageGetFrameTreeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageGetFrameTreeResult]()),
	}
	types.commandSchemas["Page.getLayoutMetrics"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageGetLayoutMetricsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageGetLayoutMetricsResult]()),
	}
	types.commandSchemas["Page.getNavigationHistory"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageGetNavigationHistoryParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageGetNavigationHistoryResult]()),
	}
	types.commandSchemas["Page.resetNavigationHistory"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageResetNavigationHistoryParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageResetNavigationHistoryResult]()),
	}
	types.commandSchemas["Page.getResourceContent"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageGetResourceContentParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageGetResourceContentResult]()),
	}
	types.commandSchemas["Page.getResourceTree"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageGetResourceTreeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageGetResourceTreeResult]()),
	}
	types.commandSchemas["Page.handleJavaScriptDialog"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageHandleJavaScriptDialogParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageHandleJavaScriptDialogResult]()),
	}
	types.commandSchemas["Page.navigate"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageNavigateParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageNavigateResult]()),
	}
	types.commandSchemas["Page.navigateToHistoryEntry"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageNavigateToHistoryEntryParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageNavigateToHistoryEntryResult]()),
	}
	types.commandSchemas["Page.printToPDF"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PagePrintToPDFParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PagePrintToPDFResult]()),
	}
	types.commandSchemas["Page.reload"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageReloadParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageReloadResult]()),
	}
	types.commandSchemas["Page.removeScriptToEvaluateOnLoad"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageRemoveScriptToEvaluateOnLoadParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageRemoveScriptToEvaluateOnLoadResult]()),
	}
	types.commandSchemas["Page.removeScriptToEvaluateOnNewDocument"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageRemoveScriptToEvaluateOnNewDocumentParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageRemoveScriptToEvaluateOnNewDocumentResult]()),
	}
	types.commandSchemas["Page.screencastFrameAck"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageScreencastFrameAckParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageScreencastFrameAckResult]()),
	}
	types.commandSchemas["Page.searchInResource"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageSearchInResourceParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageSearchInResourceResult]()),
	}
	types.commandSchemas["Page.setAdBlockingEnabled"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageSetAdBlockingEnabledParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageSetAdBlockingEnabledResult]()),
	}
	types.commandSchemas["Page.setBypassCSP"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageSetBypassCSPParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageSetBypassCSPResult]()),
	}
	types.commandSchemas["Page.getPermissionsPolicyState"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageGetPermissionsPolicyStateParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageGetPermissionsPolicyStateResult]()),
	}
	types.commandSchemas["Page.getOriginTrials"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageGetOriginTrialsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageGetOriginTrialsResult]()),
	}
	types.commandSchemas["Page.setDeviceMetricsOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageSetDeviceMetricsOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageSetDeviceMetricsOverrideResult]()),
	}
	types.commandSchemas["Page.setDeviceOrientationOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageSetDeviceOrientationOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageSetDeviceOrientationOverrideResult]()),
	}
	types.commandSchemas["Page.setFontFamilies"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageSetFontFamiliesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageSetFontFamiliesResult]()),
	}
	types.commandSchemas["Page.setFontSizes"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageSetFontSizesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageSetFontSizesResult]()),
	}
	types.commandSchemas["Page.setDocumentContent"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageSetDocumentContentParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageSetDocumentContentResult]()),
	}
	types.commandSchemas["Page.setDownloadBehavior"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageSetDownloadBehaviorParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageSetDownloadBehaviorResult]()),
	}
	types.commandSchemas["Page.setGeolocationOverride"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageSetGeolocationOverrideParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageSetGeolocationOverrideResult]()),
	}
	types.commandSchemas["Page.setLifecycleEventsEnabled"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageSetLifecycleEventsEnabledParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageSetLifecycleEventsEnabledResult]()),
	}
	types.commandSchemas["Page.setTouchEmulationEnabled"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageSetTouchEmulationEnabledParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageSetTouchEmulationEnabledResult]()),
	}
	types.commandSchemas["Page.startScreencast"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageStartScreencastParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageStartScreencastResult]()),
	}
	types.commandSchemas["Page.stopLoading"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageStopLoadingParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageStopLoadingResult]()),
	}
	types.commandSchemas["Page.crash"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageCrashParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageCrashResult]()),
	}
	types.commandSchemas["Page.close"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageCloseParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageCloseResult]()),
	}
	types.commandSchemas["Page.setWebLifecycleState"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageSetWebLifecycleStateParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageSetWebLifecycleStateResult]()),
	}
	types.commandSchemas["Page.stopScreencast"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageStopScreencastParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageStopScreencastResult]()),
	}
	types.commandSchemas["Page.produceCompilationCache"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageProduceCompilationCacheParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageProduceCompilationCacheResult]()),
	}
	types.commandSchemas["Page.addCompilationCache"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageAddCompilationCacheParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageAddCompilationCacheResult]()),
	}
	types.commandSchemas["Page.clearCompilationCache"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageClearCompilationCacheParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageClearCompilationCacheResult]()),
	}
	types.commandSchemas["Page.setSPCTransactionMode"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageSetSPCTransactionModeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageSetSPCTransactionModeResult]()),
	}
	types.commandSchemas["Page.setRPHRegistrationMode"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageSetRPHRegistrationModeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageSetRPHRegistrationModeResult]()),
	}
	types.commandSchemas["Page.generateTestReport"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageGenerateTestReportParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageGenerateTestReportResult]()),
	}
	types.commandSchemas["Page.waitForDebugger"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageWaitForDebuggerParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageWaitForDebuggerResult]()),
	}
	types.commandSchemas["Page.setInterceptFileChooserDialog"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageSetInterceptFileChooserDialogParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageSetInterceptFileChooserDialogResult]()),
	}
	types.commandSchemas["Page.setPrerenderingAllowed"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageSetPrerenderingAllowedParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageSetPrerenderingAllowedResult]()),
	}
	types.commandSchemas["Page.getAnnotatedPageContent"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PageGetAnnotatedPageContentParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PageGetAnnotatedPageContentResult]()),
	}
	types.commandSchemas["Performance.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PerformanceDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PerformanceDisableResult]()),
	}
	types.commandSchemas["Performance.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PerformanceEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PerformanceEnableResult]()),
	}
	types.commandSchemas["Performance.setTimeDomain"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PerformanceSetTimeDomainParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PerformanceSetTimeDomainResult]()),
	}
	types.commandSchemas["Performance.getMetrics"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PerformanceGetMetricsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PerformanceGetMetricsResult]()),
	}
	types.commandSchemas["PerformanceTimeline.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PerformanceTimelineEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PerformanceTimelineEnableResult]()),
	}
	types.commandSchemas["Preload.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PreloadEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PreloadEnableResult]()),
	}
	types.commandSchemas["Preload.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[PreloadDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[PreloadDisableResult]()),
	}
	types.commandSchemas["Profiler.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ProfilerDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ProfilerDisableResult]()),
	}
	types.commandSchemas["Profiler.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ProfilerEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ProfilerEnableResult]()),
	}
	types.commandSchemas["Profiler.getBestEffortCoverage"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ProfilerGetBestEffortCoverageParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ProfilerGetBestEffortCoverageResult]()),
	}
	types.commandSchemas["Profiler.setSamplingInterval"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ProfilerSetSamplingIntervalParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ProfilerSetSamplingIntervalResult]()),
	}
	types.commandSchemas["Profiler.start"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ProfilerStartParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ProfilerStartResult]()),
	}
	types.commandSchemas["Profiler.startPreciseCoverage"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ProfilerStartPreciseCoverageParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ProfilerStartPreciseCoverageResult]()),
	}
	types.commandSchemas["Profiler.stop"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ProfilerStopParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ProfilerStopResult]()),
	}
	types.commandSchemas["Profiler.stopPreciseCoverage"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ProfilerStopPreciseCoverageParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ProfilerStopPreciseCoverageResult]()),
	}
	types.commandSchemas["Profiler.takePreciseCoverage"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ProfilerTakePreciseCoverageParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ProfilerTakePreciseCoverageResult]()),
	}
	types.commandSchemas["Runtime.awaitPromise"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[RuntimeAwaitPromiseParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[RuntimeAwaitPromiseResult]()),
	}
	types.commandSchemas["Runtime.callFunctionOn"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[RuntimeCallFunctionOnParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[RuntimeCallFunctionOnResult]()),
	}
	types.commandSchemas["Runtime.compileScript"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[RuntimeCompileScriptParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[RuntimeCompileScriptResult]()),
	}
	types.commandSchemas["Runtime.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[RuntimeDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[RuntimeDisableResult]()),
	}
	types.commandSchemas["Runtime.discardConsoleEntries"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[RuntimeDiscardConsoleEntriesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[RuntimeDiscardConsoleEntriesResult]()),
	}
	types.commandSchemas["Runtime.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[RuntimeEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[RuntimeEnableResult]()),
	}
	types.commandSchemas["Runtime.evaluate"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[RuntimeEvaluateParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[RuntimeEvaluateResult]()),
	}
	types.commandSchemas["Runtime.getIsolateId"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[RuntimeGetIsolateIDParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[RuntimeGetIsolateIDResult]()),
	}
	types.commandSchemas["Runtime.getHeapUsage"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[RuntimeGetHeapUsageParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[RuntimeGetHeapUsageResult]()),
	}
	types.commandSchemas["Runtime.getProperties"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[RuntimeGetPropertiesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[RuntimeGetPropertiesResult]()),
	}
	types.commandSchemas["Runtime.globalLexicalScopeNames"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[RuntimeGlobalLexicalScopeNamesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[RuntimeGlobalLexicalScopeNamesResult]()),
	}
	types.commandSchemas["Runtime.queryObjects"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[RuntimeQueryObjectsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[RuntimeQueryObjectsResult]()),
	}
	types.commandSchemas["Runtime.releaseObject"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[RuntimeReleaseObjectParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[RuntimeReleaseObjectResult]()),
	}
	types.commandSchemas["Runtime.releaseObjectGroup"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[RuntimeReleaseObjectGroupParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[RuntimeReleaseObjectGroupResult]()),
	}
	types.commandSchemas["Runtime.runIfWaitingForDebugger"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[RuntimeRunIfWaitingForDebuggerParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[RuntimeRunIfWaitingForDebuggerResult]()),
	}
	types.commandSchemas["Runtime.runScript"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[RuntimeRunScriptParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[RuntimeRunScriptResult]()),
	}
	types.commandSchemas["Runtime.setAsyncCallStackDepth"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[RuntimeSetAsyncCallStackDepthParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[RuntimeSetAsyncCallStackDepthResult]()),
	}
	types.commandSchemas["Runtime.setCustomObjectFormatterEnabled"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[RuntimeSetCustomObjectFormatterEnabledParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[RuntimeSetCustomObjectFormatterEnabledResult]()),
	}
	types.commandSchemas["Runtime.setMaxCallStackSizeToCapture"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[RuntimeSetMaxCallStackSizeToCaptureParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[RuntimeSetMaxCallStackSizeToCaptureResult]()),
	}
	types.commandSchemas["Runtime.terminateExecution"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[RuntimeTerminateExecutionParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[RuntimeTerminateExecutionResult]()),
	}
	types.commandSchemas["Runtime.addBinding"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[RuntimeAddBindingParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[RuntimeAddBindingResult]()),
	}
	types.commandSchemas["Runtime.removeBinding"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[RuntimeRemoveBindingParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[RuntimeRemoveBindingResult]()),
	}
	types.commandSchemas["Runtime.getExceptionDetails"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[RuntimeGetExceptionDetailsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[RuntimeGetExceptionDetailsResult]()),
	}
	types.commandSchemas["Schema.getDomains"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[SchemaGetDomainsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[SchemaGetDomainsResult]()),
	}
	types.commandSchemas["Security.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[SecurityDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[SecurityDisableResult]()),
	}
	types.commandSchemas["Security.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[SecurityEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[SecurityEnableResult]()),
	}
	types.commandSchemas["Security.setIgnoreCertificateErrors"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[SecuritySetIgnoreCertificateErrorsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[SecuritySetIgnoreCertificateErrorsResult]()),
	}
	types.commandSchemas["Security.handleCertificateError"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[SecurityHandleCertificateErrorParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[SecurityHandleCertificateErrorResult]()),
	}
	types.commandSchemas["Security.setOverrideCertificateErrors"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[SecuritySetOverrideCertificateErrorsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[SecuritySetOverrideCertificateErrorsResult]()),
	}
	types.commandSchemas["ServiceWorker.deliverPushMessage"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ServiceWorkerDeliverPushMessageParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ServiceWorkerDeliverPushMessageResult]()),
	}
	types.commandSchemas["ServiceWorker.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ServiceWorkerDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ServiceWorkerDisableResult]()),
	}
	types.commandSchemas["ServiceWorker.dispatchSyncEvent"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ServiceWorkerDispatchSyncEventParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ServiceWorkerDispatchSyncEventResult]()),
	}
	types.commandSchemas["ServiceWorker.dispatchPeriodicSyncEvent"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ServiceWorkerDispatchPeriodicSyncEventParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ServiceWorkerDispatchPeriodicSyncEventResult]()),
	}
	types.commandSchemas["ServiceWorker.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ServiceWorkerEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ServiceWorkerEnableResult]()),
	}
	types.commandSchemas["ServiceWorker.setForceUpdateOnPageLoad"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ServiceWorkerSetForceUpdateOnPageLoadParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ServiceWorkerSetForceUpdateOnPageLoadResult]()),
	}
	types.commandSchemas["ServiceWorker.skipWaiting"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ServiceWorkerSkipWaitingParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ServiceWorkerSkipWaitingResult]()),
	}
	types.commandSchemas["ServiceWorker.startWorker"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ServiceWorkerStartWorkerParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ServiceWorkerStartWorkerResult]()),
	}
	types.commandSchemas["ServiceWorker.stopAllWorkers"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ServiceWorkerStopAllWorkersParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ServiceWorkerStopAllWorkersResult]()),
	}
	types.commandSchemas["ServiceWorker.stopWorker"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ServiceWorkerStopWorkerParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ServiceWorkerStopWorkerResult]()),
	}
	types.commandSchemas["ServiceWorker.unregister"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ServiceWorkerUnregisterParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ServiceWorkerUnregisterResult]()),
	}
	types.commandSchemas["ServiceWorker.updateRegistration"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[ServiceWorkerUpdateRegistrationParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[ServiceWorkerUpdateRegistrationResult]()),
	}
	types.commandSchemas["SmartCardEmulation.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[SmartCardEmulationEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[SmartCardEmulationEnableResult]()),
	}
	types.commandSchemas["SmartCardEmulation.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[SmartCardEmulationDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[SmartCardEmulationDisableResult]()),
	}
	types.commandSchemas["SmartCardEmulation.reportEstablishContextResult"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[SmartCardEmulationReportEstablishContextResultParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[SmartCardEmulationReportEstablishContextResultResult]()),
	}
	types.commandSchemas["SmartCardEmulation.reportReleaseContextResult"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[SmartCardEmulationReportReleaseContextResultParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[SmartCardEmulationReportReleaseContextResultResult]()),
	}
	types.commandSchemas["SmartCardEmulation.reportListReadersResult"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[SmartCardEmulationReportListReadersResultParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[SmartCardEmulationReportListReadersResultResult]()),
	}
	types.commandSchemas["SmartCardEmulation.reportGetStatusChangeResult"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[SmartCardEmulationReportGetStatusChangeResultParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[SmartCardEmulationReportGetStatusChangeResultResult]()),
	}
	types.commandSchemas["SmartCardEmulation.reportBeginTransactionResult"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[SmartCardEmulationReportBeginTransactionResultParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[SmartCardEmulationReportBeginTransactionResultResult]()),
	}
	types.commandSchemas["SmartCardEmulation.reportPlainResult"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[SmartCardEmulationReportPlainResultParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[SmartCardEmulationReportPlainResultResult]()),
	}
	types.commandSchemas["SmartCardEmulation.reportConnectResult"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[SmartCardEmulationReportConnectResultParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[SmartCardEmulationReportConnectResultResult]()),
	}
	types.commandSchemas["SmartCardEmulation.reportDataResult"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[SmartCardEmulationReportDataResultParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[SmartCardEmulationReportDataResultResult]()),
	}
	types.commandSchemas["SmartCardEmulation.reportStatusResult"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[SmartCardEmulationReportStatusResultParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[SmartCardEmulationReportStatusResultResult]()),
	}
	types.commandSchemas["SmartCardEmulation.reportError"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[SmartCardEmulationReportErrorParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[SmartCardEmulationReportErrorResult]()),
	}
	types.commandSchemas["Storage.getStorageKeyForFrame"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageGetStorageKeyForFrameParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageGetStorageKeyForFrameResult]()),
	}
	types.commandSchemas["Storage.getStorageKey"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageGetStorageKeyParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageGetStorageKeyResult]()),
	}
	types.commandSchemas["Storage.clearDataForOrigin"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageClearDataForOriginParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageClearDataForOriginResult]()),
	}
	types.commandSchemas["Storage.clearDataForStorageKey"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageClearDataForStorageKeyParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageClearDataForStorageKeyResult]()),
	}
	types.commandSchemas["Storage.getCookies"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageGetCookiesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageGetCookiesResult]()),
	}
	types.commandSchemas["Storage.setCookies"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageSetCookiesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageSetCookiesResult]()),
	}
	types.commandSchemas["Storage.clearCookies"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageClearCookiesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageClearCookiesResult]()),
	}
	types.commandSchemas["Storage.getUsageAndQuota"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageGetUsageAndQuotaParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageGetUsageAndQuotaResult]()),
	}
	types.commandSchemas["Storage.overrideQuotaForOrigin"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageOverrideQuotaForOriginParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageOverrideQuotaForOriginResult]()),
	}
	types.commandSchemas["Storage.trackCacheStorageForOrigin"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageTrackCacheStorageForOriginParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageTrackCacheStorageForOriginResult]()),
	}
	types.commandSchemas["Storage.trackCacheStorageForStorageKey"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageTrackCacheStorageForStorageKeyParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageTrackCacheStorageForStorageKeyResult]()),
	}
	types.commandSchemas["Storage.trackIndexedDBForOrigin"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageTrackIndexedDBForOriginParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageTrackIndexedDBForOriginResult]()),
	}
	types.commandSchemas["Storage.trackIndexedDBForStorageKey"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageTrackIndexedDBForStorageKeyParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageTrackIndexedDBForStorageKeyResult]()),
	}
	types.commandSchemas["Storage.untrackCacheStorageForOrigin"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageUntrackCacheStorageForOriginParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageUntrackCacheStorageForOriginResult]()),
	}
	types.commandSchemas["Storage.untrackCacheStorageForStorageKey"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageUntrackCacheStorageForStorageKeyParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageUntrackCacheStorageForStorageKeyResult]()),
	}
	types.commandSchemas["Storage.untrackIndexedDBForOrigin"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageUntrackIndexedDBForOriginParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageUntrackIndexedDBForOriginResult]()),
	}
	types.commandSchemas["Storage.untrackIndexedDBForStorageKey"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageUntrackIndexedDBForStorageKeyParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageUntrackIndexedDBForStorageKeyResult]()),
	}
	types.commandSchemas["Storage.getTrustTokens"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageGetTrustTokensParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageGetTrustTokensResult]()),
	}
	types.commandSchemas["Storage.clearTrustTokens"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageClearTrustTokensParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageClearTrustTokensResult]()),
	}
	types.commandSchemas["Storage.getInterestGroupDetails"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageGetInterestGroupDetailsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageGetInterestGroupDetailsResult]()),
	}
	types.commandSchemas["Storage.setInterestGroupTracking"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageSetInterestGroupTrackingParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageSetInterestGroupTrackingResult]()),
	}
	types.commandSchemas["Storage.setInterestGroupAuctionTracking"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageSetInterestGroupAuctionTrackingParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageSetInterestGroupAuctionTrackingResult]()),
	}
	types.commandSchemas["Storage.getSharedStorageMetadata"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageGetSharedStorageMetadataParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageGetSharedStorageMetadataResult]()),
	}
	types.commandSchemas["Storage.getSharedStorageEntries"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageGetSharedStorageEntriesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageGetSharedStorageEntriesResult]()),
	}
	types.commandSchemas["Storage.setSharedStorageEntry"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageSetSharedStorageEntryParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageSetSharedStorageEntryResult]()),
	}
	types.commandSchemas["Storage.deleteSharedStorageEntry"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageDeleteSharedStorageEntryParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageDeleteSharedStorageEntryResult]()),
	}
	types.commandSchemas["Storage.clearSharedStorageEntries"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageClearSharedStorageEntriesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageClearSharedStorageEntriesResult]()),
	}
	types.commandSchemas["Storage.resetSharedStorageBudget"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageResetSharedStorageBudgetParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageResetSharedStorageBudgetResult]()),
	}
	types.commandSchemas["Storage.setSharedStorageTracking"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageSetSharedStorageTrackingParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageSetSharedStorageTrackingResult]()),
	}
	types.commandSchemas["Storage.setStorageBucketTracking"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageSetStorageBucketTrackingParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageSetStorageBucketTrackingResult]()),
	}
	types.commandSchemas["Storage.deleteStorageBucket"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageDeleteStorageBucketParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageDeleteStorageBucketResult]()),
	}
	types.commandSchemas["Storage.runBounceTrackingMitigations"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageRunBounceTrackingMitigationsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageRunBounceTrackingMitigationsResult]()),
	}
	types.commandSchemas["Storage.setAttributionReportingLocalTestingMode"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageSetAttributionReportingLocalTestingModeParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageSetAttributionReportingLocalTestingModeResult]()),
	}
	types.commandSchemas["Storage.setAttributionReportingTracking"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageSetAttributionReportingTrackingParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageSetAttributionReportingTrackingResult]()),
	}
	types.commandSchemas["Storage.sendPendingAttributionReports"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageSendPendingAttributionReportsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageSendPendingAttributionReportsResult]()),
	}
	types.commandSchemas["Storage.getRelatedWebsiteSets"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageGetRelatedWebsiteSetsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageGetRelatedWebsiteSetsResult]()),
	}
	types.commandSchemas["Storage.getAffectedUrlsForThirdPartyCookieMetadata"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageGetAffectedUrlsForThirdPartyCookieMetadataParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageGetAffectedUrlsForThirdPartyCookieMetadataResult]()),
	}
	types.commandSchemas["Storage.setProtectedAudienceKAnonymity"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[StorageSetProtectedAudienceKAnonymityParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[StorageSetProtectedAudienceKAnonymityResult]()),
	}
	types.commandSchemas["SystemInfo.getInfo"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[SystemInfoGetInfoParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[SystemInfoGetInfoResult]()),
	}
	types.commandSchemas["SystemInfo.getFeatureState"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[SystemInfoGetFeatureStateParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[SystemInfoGetFeatureStateResult]()),
	}
	types.commandSchemas["SystemInfo.getProcessInfo"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[SystemInfoGetProcessInfoParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[SystemInfoGetProcessInfoResult]()),
	}
	types.commandSchemas["Target.activateTarget"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TargetActivateTargetParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TargetActivateTargetResult]()),
	}
	types.commandSchemas["Target.attachToTarget"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TargetAttachToTargetParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TargetAttachToTargetResult]()),
	}
	types.commandSchemas["Target.attachToBrowserTarget"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TargetAttachToBrowserTargetParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TargetAttachToBrowserTargetResult]()),
	}
	types.commandSchemas["Target.closeTarget"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TargetCloseTargetParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TargetCloseTargetResult]()),
	}
	types.commandSchemas["Target.exposeDevToolsProtocol"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TargetExposeDevToolsProtocolParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TargetExposeDevToolsProtocolResult]()),
	}
	types.commandSchemas["Target.createBrowserContext"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TargetCreateBrowserContextParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TargetCreateBrowserContextResult]()),
	}
	types.commandSchemas["Target.getBrowserContexts"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TargetGetBrowserContextsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TargetGetBrowserContextsResult]()),
	}
	types.commandSchemas["Target.createTarget"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TargetCreateTargetParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TargetCreateTargetResult]()),
	}
	types.commandSchemas["Target.detachFromTarget"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TargetDetachFromTargetParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TargetDetachFromTargetResult]()),
	}
	types.commandSchemas["Target.disposeBrowserContext"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TargetDisposeBrowserContextParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TargetDisposeBrowserContextResult]()),
	}
	types.commandSchemas["Target.getTargetInfo"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TargetGetTargetInfoParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TargetGetTargetInfoResult]()),
	}
	types.commandSchemas["Target.getTargets"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TargetGetTargetsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TargetGetTargetsResult]()),
	}
	types.commandSchemas["Target.sendMessageToTarget"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TargetSendMessageToTargetParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TargetSendMessageToTargetResult]()),
	}
	types.commandSchemas["Target.setAutoAttach"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TargetSetAutoAttachParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TargetSetAutoAttachResult]()),
	}
	types.commandSchemas["Target.autoAttachRelated"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TargetAutoAttachRelatedParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TargetAutoAttachRelatedResult]()),
	}
	types.commandSchemas["Target.setDiscoverTargets"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TargetSetDiscoverTargetsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TargetSetDiscoverTargetsResult]()),
	}
	types.commandSchemas["Target.setRemoteLocations"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TargetSetRemoteLocationsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TargetSetRemoteLocationsResult]()),
	}
	types.commandSchemas["Target.getDevToolsTarget"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TargetGetDevToolsTargetParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TargetGetDevToolsTargetResult]()),
	}
	types.commandSchemas["Target.openDevTools"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TargetOpenDevToolsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TargetOpenDevToolsResult]()),
	}
	types.commandSchemas["Tethering.bind"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TetheringBindParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TetheringBindResult]()),
	}
	types.commandSchemas["Tethering.unbind"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TetheringUnbindParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TetheringUnbindResult]()),
	}
	types.commandSchemas["Tracing.end"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TracingEndParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TracingEndResult]()),
	}
	types.commandSchemas["Tracing.getCategories"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TracingGetCategoriesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TracingGetCategoriesResult]()),
	}
	types.commandSchemas["Tracing.getTrackEventDescriptor"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TracingGetTrackEventDescriptorParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TracingGetTrackEventDescriptorResult]()),
	}
	types.commandSchemas["Tracing.recordClockSyncMarker"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TracingRecordClockSyncMarkerParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TracingRecordClockSyncMarkerResult]()),
	}
	types.commandSchemas["Tracing.requestMemoryDump"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TracingRequestMemoryDumpParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TracingRequestMemoryDumpResult]()),
	}
	types.commandSchemas["Tracing.start"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[TracingStartParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[TracingStartResult]()),
	}
	types.commandSchemas["WebAudio.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[WebAudioEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[WebAudioEnableResult]()),
	}
	types.commandSchemas["WebAudio.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[WebAudioDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[WebAudioDisableResult]()),
	}
	types.commandSchemas["WebAudio.getRealtimeData"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[WebAudioGetRealtimeDataParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[WebAudioGetRealtimeDataResult]()),
	}
	types.commandSchemas["WebAuthn.enable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[WebAuthnEnableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[WebAuthnEnableResult]()),
	}
	types.commandSchemas["WebAuthn.disable"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[WebAuthnDisableParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[WebAuthnDisableResult]()),
	}
	types.commandSchemas["WebAuthn.addVirtualAuthenticator"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[WebAuthnAddVirtualAuthenticatorParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[WebAuthnAddVirtualAuthenticatorResult]()),
	}
	types.commandSchemas["WebAuthn.setResponseOverrideBits"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[WebAuthnSetResponseOverrideBitsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[WebAuthnSetResponseOverrideBitsResult]()),
	}
	types.commandSchemas["WebAuthn.removeVirtualAuthenticator"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[WebAuthnRemoveVirtualAuthenticatorParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[WebAuthnRemoveVirtualAuthenticatorResult]()),
	}
	types.commandSchemas["WebAuthn.addCredential"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[WebAuthnAddCredentialParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[WebAuthnAddCredentialResult]()),
	}
	types.commandSchemas["WebAuthn.getCredential"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[WebAuthnGetCredentialParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[WebAuthnGetCredentialResult]()),
	}
	types.commandSchemas["WebAuthn.getCredentials"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[WebAuthnGetCredentialsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[WebAuthnGetCredentialsResult]()),
	}
	types.commandSchemas["WebAuthn.removeCredential"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[WebAuthnRemoveCredentialParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[WebAuthnRemoveCredentialResult]()),
	}
	types.commandSchemas["WebAuthn.clearCredentials"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[WebAuthnClearCredentialsParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[WebAuthnClearCredentialsResult]()),
	}
	types.commandSchemas["WebAuthn.setUserVerified"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[WebAuthnSetUserVerifiedParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[WebAuthnSetUserVerifiedResult]()),
	}
	types.commandSchemas["WebAuthn.setAutomaticPresenceSimulation"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[WebAuthnSetAutomaticPresenceSimulationParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[WebAuthnSetAutomaticPresenceSimulationResult]()),
	}
	types.commandSchemas["WebAuthn.setCredentialProperties"] = CDPCommandSchema{
		Params: abxjsonschema.SchemaFor[WebAuthnSetCredentialPropertiesParams](),
		Result: nativeResultSchema(abxjsonschema.SchemaFor[WebAuthnSetCredentialPropertiesResult]()),
	}
	types.eventSchemas["Accessibility.loadComplete"] = nativeResultSchema(abxjsonschema.SchemaFor[AccessibilityLoadCompleteEvent]())
	types.eventSchemas["Accessibility.nodesUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[AccessibilityNodesUpdatedEvent]())
	types.eventSchemas["Animation.animationCanceled"] = nativeResultSchema(abxjsonschema.SchemaFor[AnimationAnimationCanceledEvent]())
	types.eventSchemas["Animation.animationCreated"] = nativeResultSchema(abxjsonschema.SchemaFor[AnimationAnimationCreatedEvent]())
	types.eventSchemas["Animation.animationStarted"] = nativeResultSchema(abxjsonschema.SchemaFor[AnimationAnimationStartedEvent]())
	types.eventSchemas["Animation.animationUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[AnimationAnimationUpdatedEvent]())
	types.eventSchemas["Audits.issueAdded"] = nativeResultSchema(abxjsonschema.SchemaFor[AuditsIssueAddedEvent]())
	types.eventSchemas["Autofill.addressFormFilled"] = nativeResultSchema(abxjsonschema.SchemaFor[AutofillAddressFormFilledEvent]())
	types.eventSchemas["BackgroundService.recordingStateChanged"] = nativeResultSchema(abxjsonschema.SchemaFor[BackgroundServiceRecordingStateChangedEvent]())
	types.eventSchemas["BackgroundService.backgroundServiceEventReceived"] = nativeResultSchema(abxjsonschema.SchemaFor[BackgroundServiceBackgroundServiceEventReceivedEvent]())
	types.eventSchemas["BluetoothEmulation.gattOperationReceived"] = nativeResultSchema(abxjsonschema.SchemaFor[BluetoothEmulationGattOperationReceivedEvent]())
	types.eventSchemas["BluetoothEmulation.characteristicOperationReceived"] = nativeResultSchema(abxjsonschema.SchemaFor[BluetoothEmulationCharacteristicOperationReceivedEvent]())
	types.eventSchemas["BluetoothEmulation.descriptorOperationReceived"] = nativeResultSchema(abxjsonschema.SchemaFor[BluetoothEmulationDescriptorOperationReceivedEvent]())
	types.eventSchemas["Browser.downloadWillBegin"] = nativeResultSchema(abxjsonschema.SchemaFor[BrowserDownloadWillBeginEvent]())
	types.eventSchemas["Browser.downloadProgress"] = nativeResultSchema(abxjsonschema.SchemaFor[BrowserDownloadProgressEvent]())
	types.eventSchemas["CSS.fontsUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[CSSFontsUpdatedEvent]())
	types.eventSchemas["CSS.mediaQueryResultChanged"] = nativeResultSchema(abxjsonschema.SchemaFor[CSSMediaQueryResultChangedEvent]())
	types.eventSchemas["CSS.styleSheetAdded"] = nativeResultSchema(abxjsonschema.SchemaFor[CSSStyleSheetAddedEvent]())
	types.eventSchemas["CSS.styleSheetChanged"] = nativeResultSchema(abxjsonschema.SchemaFor[CSSStyleSheetChangedEvent]())
	types.eventSchemas["CSS.styleSheetRemoved"] = nativeResultSchema(abxjsonschema.SchemaFor[CSSStyleSheetRemovedEvent]())
	types.eventSchemas["CSS.computedStyleUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[CSSComputedStyleUpdatedEvent]())
	types.eventSchemas["Cast.sinksUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[CastSinksUpdatedEvent]())
	types.eventSchemas["Cast.issueUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[CastIssueUpdatedEvent]())
	types.eventSchemas["Console.messageAdded"] = nativeResultSchema(abxjsonschema.SchemaFor[ConsoleMessageAddedEvent]())
	types.eventSchemas["DOM.attributeModified"] = nativeResultSchema(abxjsonschema.SchemaFor[DOMAttributeModifiedEvent]())
	types.eventSchemas["DOM.adoptedStyleSheetsModified"] = nativeResultSchema(abxjsonschema.SchemaFor[DOMAdoptedStyleSheetsModifiedEvent]())
	types.eventSchemas["DOM.attributeRemoved"] = nativeResultSchema(abxjsonschema.SchemaFor[DOMAttributeRemovedEvent]())
	types.eventSchemas["DOM.characterDataModified"] = nativeResultSchema(abxjsonschema.SchemaFor[DOMCharacterDataModifiedEvent]())
	types.eventSchemas["DOM.childNodeCountUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[DOMChildNodeCountUpdatedEvent]())
	types.eventSchemas["DOM.childNodeInserted"] = nativeResultSchema(abxjsonschema.SchemaFor[DOMChildNodeInsertedEvent]())
	types.eventSchemas["DOM.childNodeRemoved"] = nativeResultSchema(abxjsonschema.SchemaFor[DOMChildNodeRemovedEvent]())
	types.eventSchemas["DOM.distributedNodesUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[DOMDistributedNodesUpdatedEvent]())
	types.eventSchemas["DOM.documentUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[DOMDocumentUpdatedEvent]())
	types.eventSchemas["DOM.inlineStyleInvalidated"] = nativeResultSchema(abxjsonschema.SchemaFor[DOMInlineStyleInvalidatedEvent]())
	types.eventSchemas["DOM.pseudoElementAdded"] = nativeResultSchema(abxjsonschema.SchemaFor[DOMPseudoElementAddedEvent]())
	types.eventSchemas["DOM.topLayerElementsUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[DOMTopLayerElementsUpdatedEvent]())
	types.eventSchemas["DOM.scrollableFlagUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[DOMScrollableFlagUpdatedEvent]())
	types.eventSchemas["DOM.adRelatedStateUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[DOMAdRelatedStateUpdatedEvent]())
	types.eventSchemas["DOM.affectedByStartingStylesFlagUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[DOMAffectedByStartingStylesFlagUpdatedEvent]())
	types.eventSchemas["DOM.pseudoElementRemoved"] = nativeResultSchema(abxjsonschema.SchemaFor[DOMPseudoElementRemovedEvent]())
	types.eventSchemas["DOM.setChildNodes"] = nativeResultSchema(abxjsonschema.SchemaFor[DOMSetChildNodesEvent]())
	types.eventSchemas["DOM.shadowRootPopped"] = nativeResultSchema(abxjsonschema.SchemaFor[DOMShadowRootPoppedEvent]())
	types.eventSchemas["DOM.shadowRootPushed"] = nativeResultSchema(abxjsonschema.SchemaFor[DOMShadowRootPushedEvent]())
	types.eventSchemas["DOMStorage.domStorageItemAdded"] = nativeResultSchema(abxjsonschema.SchemaFor[DOMStorageDOMStorageItemAddedEvent]())
	types.eventSchemas["DOMStorage.domStorageItemRemoved"] = nativeResultSchema(abxjsonschema.SchemaFor[DOMStorageDOMStorageItemRemovedEvent]())
	types.eventSchemas["DOMStorage.domStorageItemUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[DOMStorageDOMStorageItemUpdatedEvent]())
	types.eventSchemas["DOMStorage.domStorageItemsCleared"] = nativeResultSchema(abxjsonschema.SchemaFor[DOMStorageDOMStorageItemsClearedEvent]())
	types.eventSchemas["Debugger.breakpointResolved"] = nativeResultSchema(abxjsonschema.SchemaFor[DebuggerBreakpointResolvedEvent]())
	types.eventSchemas["Debugger.paused"] = nativeResultSchema(abxjsonschema.SchemaFor[DebuggerPausedEvent]())
	types.eventSchemas["Debugger.resumed"] = nativeResultSchema(abxjsonschema.SchemaFor[DebuggerResumedEvent]())
	types.eventSchemas["Debugger.scriptFailedToParse"] = nativeResultSchema(abxjsonschema.SchemaFor[DebuggerScriptFailedToParseEvent]())
	types.eventSchemas["Debugger.scriptParsed"] = nativeResultSchema(abxjsonschema.SchemaFor[DebuggerScriptParsedEvent]())
	types.eventSchemas["DeviceAccess.deviceRequestPrompted"] = nativeResultSchema(abxjsonschema.SchemaFor[DeviceAccessDeviceRequestPromptedEvent]())
	types.eventSchemas["Emulation.virtualTimeBudgetExpired"] = nativeResultSchema(abxjsonschema.SchemaFor[EmulationVirtualTimeBudgetExpiredEvent]())
	types.eventSchemas["Emulation.screenOrientationLockChanged"] = nativeResultSchema(abxjsonschema.SchemaFor[EmulationScreenOrientationLockChangedEvent]())
	types.eventSchemas["FedCm.dialogShown"] = nativeResultSchema(abxjsonschema.SchemaFor[FedCmDialogShownEvent]())
	types.eventSchemas["FedCm.dialogClosed"] = nativeResultSchema(abxjsonschema.SchemaFor[FedCmDialogClosedEvent]())
	types.eventSchemas["Fetch.requestPaused"] = nativeResultSchema(abxjsonschema.SchemaFor[FetchRequestPausedEvent]())
	types.eventSchemas["Fetch.authRequired"] = nativeResultSchema(abxjsonschema.SchemaFor[FetchAuthRequiredEvent]())
	types.eventSchemas["HeapProfiler.addHeapSnapshotChunk"] = nativeResultSchema(abxjsonschema.SchemaFor[HeapProfilerAddHeapSnapshotChunkEvent]())
	types.eventSchemas["HeapProfiler.heapStatsUpdate"] = nativeResultSchema(abxjsonschema.SchemaFor[HeapProfilerHeapStatsUpdateEvent]())
	types.eventSchemas["HeapProfiler.lastSeenObjectId"] = nativeResultSchema(abxjsonschema.SchemaFor[HeapProfilerLastSeenObjectIDEvent]())
	types.eventSchemas["HeapProfiler.reportHeapSnapshotProgress"] = nativeResultSchema(abxjsonschema.SchemaFor[HeapProfilerReportHeapSnapshotProgressEvent]())
	types.eventSchemas["HeapProfiler.resetProfiles"] = nativeResultSchema(abxjsonschema.SchemaFor[HeapProfilerResetProfilesEvent]())
	types.eventSchemas["Input.dragIntercepted"] = nativeResultSchema(abxjsonschema.SchemaFor[InputDragInterceptedEvent]())
	types.eventSchemas["Inspector.detached"] = nativeResultSchema(abxjsonschema.SchemaFor[InspectorDetachedEvent]())
	types.eventSchemas["Inspector.targetCrashed"] = nativeResultSchema(abxjsonschema.SchemaFor[InspectorTargetCrashedEvent]())
	types.eventSchemas["Inspector.targetReloadedAfterCrash"] = nativeResultSchema(abxjsonschema.SchemaFor[InspectorTargetReloadedAfterCrashEvent]())
	types.eventSchemas["Inspector.workerScriptLoaded"] = nativeResultSchema(abxjsonschema.SchemaFor[InspectorWorkerScriptLoadedEvent]())
	types.eventSchemas["LayerTree.layerPainted"] = nativeResultSchema(abxjsonschema.SchemaFor[LayerTreeLayerPaintedEvent]())
	types.eventSchemas["LayerTree.layerTreeDidChange"] = nativeResultSchema(abxjsonschema.SchemaFor[LayerTreeLayerTreeDidChangeEvent]())
	types.eventSchemas["Log.entryAdded"] = nativeResultSchema(abxjsonschema.SchemaFor[LogEntryAddedEvent]())
	types.eventSchemas["Media.playerPropertiesChanged"] = nativeResultSchema(abxjsonschema.SchemaFor[MediaPlayerPropertiesChangedEvent]())
	types.eventSchemas["Media.playerEventsAdded"] = nativeResultSchema(abxjsonschema.SchemaFor[MediaPlayerEventsAddedEvent]())
	types.eventSchemas["Media.playerMessagesLogged"] = nativeResultSchema(abxjsonschema.SchemaFor[MediaPlayerMessagesLoggedEvent]())
	types.eventSchemas["Media.playerErrorsRaised"] = nativeResultSchema(abxjsonschema.SchemaFor[MediaPlayerErrorsRaisedEvent]())
	types.eventSchemas["Media.playerCreated"] = nativeResultSchema(abxjsonschema.SchemaFor[MediaPlayerCreatedEvent]())
	types.eventSchemas["Network.dataReceived"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkDataReceivedEvent]())
	types.eventSchemas["Network.eventSourceMessageReceived"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkEventSourceMessageReceivedEvent]())
	types.eventSchemas["Network.loadingFailed"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkLoadingFailedEvent]())
	types.eventSchemas["Network.loadingFinished"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkLoadingFinishedEvent]())
	types.eventSchemas["Network.requestIntercepted"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkRequestInterceptedEvent]())
	types.eventSchemas["Network.requestServedFromCache"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkRequestServedFromCacheEvent]())
	types.eventSchemas["Network.requestWillBeSent"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkRequestWillBeSentEvent]())
	types.eventSchemas["Network.resourceChangedPriority"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkResourceChangedPriorityEvent]())
	types.eventSchemas["Network.signedExchangeReceived"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkSignedExchangeReceivedEvent]())
	types.eventSchemas["Network.responseReceived"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkResponseReceivedEvent]())
	types.eventSchemas["Network.webSocketClosed"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkWebSocketClosedEvent]())
	types.eventSchemas["Network.webSocketCreated"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkWebSocketCreatedEvent]())
	types.eventSchemas["Network.webSocketFrameError"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkWebSocketFrameErrorEvent]())
	types.eventSchemas["Network.webSocketFrameReceived"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkWebSocketFrameReceivedEvent]())
	types.eventSchemas["Network.webSocketFrameSent"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkWebSocketFrameSentEvent]())
	types.eventSchemas["Network.webSocketHandshakeResponseReceived"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkWebSocketHandshakeResponseReceivedEvent]())
	types.eventSchemas["Network.webSocketWillSendHandshakeRequest"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkWebSocketWillSendHandshakeRequestEvent]())
	types.eventSchemas["Network.webTransportCreated"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkWebTransportCreatedEvent]())
	types.eventSchemas["Network.webTransportConnectionEstablished"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkWebTransportConnectionEstablishedEvent]())
	types.eventSchemas["Network.webTransportClosed"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkWebTransportClosedEvent]())
	types.eventSchemas["Network.directTCPSocketCreated"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkDirectTCPSocketCreatedEvent]())
	types.eventSchemas["Network.directTCPSocketOpened"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkDirectTCPSocketOpenedEvent]())
	types.eventSchemas["Network.directTCPSocketAborted"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkDirectTCPSocketAbortedEvent]())
	types.eventSchemas["Network.directTCPSocketClosed"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkDirectTCPSocketClosedEvent]())
	types.eventSchemas["Network.directTCPSocketChunkSent"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkDirectTCPSocketChunkSentEvent]())
	types.eventSchemas["Network.directTCPSocketChunkReceived"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkDirectTCPSocketChunkReceivedEvent]())
	types.eventSchemas["Network.directUDPSocketJoinedMulticastGroup"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkDirectUDPSocketJoinedMulticastGroupEvent]())
	types.eventSchemas["Network.directUDPSocketLeftMulticastGroup"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkDirectUDPSocketLeftMulticastGroupEvent]())
	types.eventSchemas["Network.directUDPSocketCreated"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkDirectUDPSocketCreatedEvent]())
	types.eventSchemas["Network.directUDPSocketOpened"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkDirectUDPSocketOpenedEvent]())
	types.eventSchemas["Network.directUDPSocketAborted"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkDirectUDPSocketAbortedEvent]())
	types.eventSchemas["Network.directUDPSocketClosed"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkDirectUDPSocketClosedEvent]())
	types.eventSchemas["Network.directUDPSocketChunkSent"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkDirectUDPSocketChunkSentEvent]())
	types.eventSchemas["Network.directUDPSocketChunkReceived"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkDirectUDPSocketChunkReceivedEvent]())
	types.eventSchemas["Network.requestWillBeSentExtraInfo"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkRequestWillBeSentExtraInfoEvent]())
	types.eventSchemas["Network.responseReceivedExtraInfo"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkResponseReceivedExtraInfoEvent]())
	types.eventSchemas["Network.responseReceivedEarlyHints"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkResponseReceivedEarlyHintsEvent]())
	types.eventSchemas["Network.trustTokenOperationDone"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkTrustTokenOperationDoneEvent]())
	types.eventSchemas["Network.policyUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkPolicyUpdatedEvent]())
	types.eventSchemas["Network.reportingApiReportAdded"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkReportingAPIReportAddedEvent]())
	types.eventSchemas["Network.reportingApiReportUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkReportingAPIReportUpdatedEvent]())
	types.eventSchemas["Network.reportingApiEndpointsChangedForOrigin"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkReportingAPIEndpointsChangedForOriginEvent]())
	types.eventSchemas["Network.deviceBoundSessionsAdded"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkDeviceBoundSessionsAddedEvent]())
	types.eventSchemas["Network.deviceBoundSessionEventOccurred"] = nativeResultSchema(abxjsonschema.SchemaFor[NetworkDeviceBoundSessionEventOccurredEvent]())
	types.eventSchemas["Overlay.inspectNodeRequested"] = nativeResultSchema(abxjsonschema.SchemaFor[OverlayInspectNodeRequestedEvent]())
	types.eventSchemas["Overlay.nodeHighlightRequested"] = nativeResultSchema(abxjsonschema.SchemaFor[OverlayNodeHighlightRequestedEvent]())
	types.eventSchemas["Overlay.screenshotRequested"] = nativeResultSchema(abxjsonschema.SchemaFor[OverlayScreenshotRequestedEvent]())
	types.eventSchemas["Overlay.inspectPanelShowRequested"] = nativeResultSchema(abxjsonschema.SchemaFor[OverlayInspectPanelShowRequestedEvent]())
	types.eventSchemas["Overlay.inspectedElementWindowRestored"] = nativeResultSchema(abxjsonschema.SchemaFor[OverlayInspectedElementWindowRestoredEvent]())
	types.eventSchemas["Overlay.inspectModeCanceled"] = nativeResultSchema(abxjsonschema.SchemaFor[OverlayInspectModeCanceledEvent]())
	types.eventSchemas["Page.domContentEventFired"] = nativeResultSchema(abxjsonschema.SchemaFor[PageDOMContentEventFiredEvent]())
	types.eventSchemas["Page.fileChooserOpened"] = nativeResultSchema(abxjsonschema.SchemaFor[PageFileChooserOpenedEvent]())
	types.eventSchemas["Page.frameAttached"] = nativeResultSchema(abxjsonschema.SchemaFor[PageFrameAttachedEvent]())
	types.eventSchemas["Page.frameClearedScheduledNavigation"] = nativeResultSchema(abxjsonschema.SchemaFor[PageFrameClearedScheduledNavigationEvent]())
	types.eventSchemas["Page.frameDetached"] = nativeResultSchema(abxjsonschema.SchemaFor[PageFrameDetachedEvent]())
	types.eventSchemas["Page.frameSubtreeWillBeDetached"] = nativeResultSchema(abxjsonschema.SchemaFor[PageFrameSubtreeWillBeDetachedEvent]())
	types.eventSchemas["Page.frameNavigated"] = nativeResultSchema(abxjsonschema.SchemaFor[PageFrameNavigatedEvent]())
	types.eventSchemas["Page.documentOpened"] = nativeResultSchema(abxjsonschema.SchemaFor[PageDocumentOpenedEvent]())
	types.eventSchemas["Page.frameResized"] = nativeResultSchema(abxjsonschema.SchemaFor[PageFrameResizedEvent]())
	types.eventSchemas["Page.frameStartedNavigating"] = nativeResultSchema(abxjsonschema.SchemaFor[PageFrameStartedNavigatingEvent]())
	types.eventSchemas["Page.frameRequestedNavigation"] = nativeResultSchema(abxjsonschema.SchemaFor[PageFrameRequestedNavigationEvent]())
	types.eventSchemas["Page.frameScheduledNavigation"] = nativeResultSchema(abxjsonschema.SchemaFor[PageFrameScheduledNavigationEvent]())
	types.eventSchemas["Page.frameStartedLoading"] = nativeResultSchema(abxjsonschema.SchemaFor[PageFrameStartedLoadingEvent]())
	types.eventSchemas["Page.frameStoppedLoading"] = nativeResultSchema(abxjsonschema.SchemaFor[PageFrameStoppedLoadingEvent]())
	types.eventSchemas["Page.downloadWillBegin"] = nativeResultSchema(abxjsonschema.SchemaFor[PageDownloadWillBeginEvent]())
	types.eventSchemas["Page.downloadProgress"] = nativeResultSchema(abxjsonschema.SchemaFor[PageDownloadProgressEvent]())
	types.eventSchemas["Page.interstitialHidden"] = nativeResultSchema(abxjsonschema.SchemaFor[PageInterstitialHiddenEvent]())
	types.eventSchemas["Page.interstitialShown"] = nativeResultSchema(abxjsonschema.SchemaFor[PageInterstitialShownEvent]())
	types.eventSchemas["Page.javascriptDialogClosed"] = nativeResultSchema(abxjsonschema.SchemaFor[PageJavascriptDialogClosedEvent]())
	types.eventSchemas["Page.javascriptDialogOpening"] = nativeResultSchema(abxjsonschema.SchemaFor[PageJavascriptDialogOpeningEvent]())
	types.eventSchemas["Page.lifecycleEvent"] = nativeResultSchema(abxjsonschema.SchemaFor[PageLifecycleEventEvent]())
	types.eventSchemas["Page.backForwardCacheNotUsed"] = nativeResultSchema(abxjsonschema.SchemaFor[PageBackForwardCacheNotUsedEvent]())
	types.eventSchemas["Page.loadEventFired"] = nativeResultSchema(abxjsonschema.SchemaFor[PageLoadEventFiredEvent]())
	types.eventSchemas["Page.navigatedWithinDocument"] = nativeResultSchema(abxjsonschema.SchemaFor[PageNavigatedWithinDocumentEvent]())
	types.eventSchemas["Page.screencastFrame"] = nativeResultSchema(abxjsonschema.SchemaFor[PageScreencastFrameEvent]())
	types.eventSchemas["Page.screencastVisibilityChanged"] = nativeResultSchema(abxjsonschema.SchemaFor[PageScreencastVisibilityChangedEvent]())
	types.eventSchemas["Page.windowOpen"] = nativeResultSchema(abxjsonschema.SchemaFor[PageWindowOpenEvent]())
	types.eventSchemas["Page.compilationCacheProduced"] = nativeResultSchema(abxjsonschema.SchemaFor[PageCompilationCacheProducedEvent]())
	types.eventSchemas["Performance.metrics"] = nativeResultSchema(abxjsonschema.SchemaFor[PerformanceMetricsEvent]())
	types.eventSchemas["PerformanceTimeline.timelineEventAdded"] = nativeResultSchema(abxjsonschema.SchemaFor[PerformanceTimelineTimelineEventAddedEvent]())
	types.eventSchemas["Preload.ruleSetUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[PreloadRuleSetUpdatedEvent]())
	types.eventSchemas["Preload.ruleSetRemoved"] = nativeResultSchema(abxjsonschema.SchemaFor[PreloadRuleSetRemovedEvent]())
	types.eventSchemas["Preload.preloadEnabledStateUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[PreloadPreloadEnabledStateUpdatedEvent]())
	types.eventSchemas["Preload.prefetchStatusUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[PreloadPrefetchStatusUpdatedEvent]())
	types.eventSchemas["Preload.prerenderStatusUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[PreloadPrerenderStatusUpdatedEvent]())
	types.eventSchemas["Preload.preloadingAttemptSourcesUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[PreloadPreloadingAttemptSourcesUpdatedEvent]())
	types.eventSchemas["Profiler.consoleProfileFinished"] = nativeResultSchema(abxjsonschema.SchemaFor[ProfilerConsoleProfileFinishedEvent]())
	types.eventSchemas["Profiler.consoleProfileStarted"] = nativeResultSchema(abxjsonschema.SchemaFor[ProfilerConsoleProfileStartedEvent]())
	types.eventSchemas["Profiler.preciseCoverageDeltaUpdate"] = nativeResultSchema(abxjsonschema.SchemaFor[ProfilerPreciseCoverageDeltaUpdateEvent]())
	types.eventSchemas["Runtime.bindingCalled"] = nativeResultSchema(abxjsonschema.SchemaFor[RuntimeBindingCalledEvent]())
	types.eventSchemas["Runtime.consoleAPICalled"] = nativeResultSchema(abxjsonschema.SchemaFor[RuntimeConsoleAPICalledEvent]())
	types.eventSchemas["Runtime.exceptionRevoked"] = nativeResultSchema(abxjsonschema.SchemaFor[RuntimeExceptionRevokedEvent]())
	types.eventSchemas["Runtime.exceptionThrown"] = nativeResultSchema(abxjsonschema.SchemaFor[RuntimeExceptionThrownEvent]())
	types.eventSchemas["Runtime.executionContextCreated"] = nativeResultSchema(abxjsonschema.SchemaFor[RuntimeExecutionContextCreatedEvent]())
	types.eventSchemas["Runtime.executionContextDestroyed"] = nativeResultSchema(abxjsonschema.SchemaFor[RuntimeExecutionContextDestroyedEvent]())
	types.eventSchemas["Runtime.executionContextsCleared"] = nativeResultSchema(abxjsonschema.SchemaFor[RuntimeExecutionContextsClearedEvent]())
	types.eventSchemas["Runtime.inspectRequested"] = nativeResultSchema(abxjsonschema.SchemaFor[RuntimeInspectRequestedEvent]())
	types.eventSchemas["Security.certificateError"] = nativeResultSchema(abxjsonschema.SchemaFor[SecurityCertificateErrorEvent]())
	types.eventSchemas["Security.visibleSecurityStateChanged"] = nativeResultSchema(abxjsonschema.SchemaFor[SecurityVisibleSecurityStateChangedEvent]())
	types.eventSchemas["Security.securityStateChanged"] = nativeResultSchema(abxjsonschema.SchemaFor[SecuritySecurityStateChangedEvent]())
	types.eventSchemas["ServiceWorker.workerErrorReported"] = nativeResultSchema(abxjsonschema.SchemaFor[ServiceWorkerWorkerErrorReportedEvent]())
	types.eventSchemas["ServiceWorker.workerRegistrationUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[ServiceWorkerWorkerRegistrationUpdatedEvent]())
	types.eventSchemas["ServiceWorker.workerVersionUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[ServiceWorkerWorkerVersionUpdatedEvent]())
	types.eventSchemas["SmartCardEmulation.establishContextRequested"] = nativeResultSchema(abxjsonschema.SchemaFor[SmartCardEmulationEstablishContextRequestedEvent]())
	types.eventSchemas["SmartCardEmulation.releaseContextRequested"] = nativeResultSchema(abxjsonschema.SchemaFor[SmartCardEmulationReleaseContextRequestedEvent]())
	types.eventSchemas["SmartCardEmulation.listReadersRequested"] = nativeResultSchema(abxjsonschema.SchemaFor[SmartCardEmulationListReadersRequestedEvent]())
	types.eventSchemas["SmartCardEmulation.getStatusChangeRequested"] = nativeResultSchema(abxjsonschema.SchemaFor[SmartCardEmulationGetStatusChangeRequestedEvent]())
	types.eventSchemas["SmartCardEmulation.cancelRequested"] = nativeResultSchema(abxjsonschema.SchemaFor[SmartCardEmulationCancelRequestedEvent]())
	types.eventSchemas["SmartCardEmulation.connectRequested"] = nativeResultSchema(abxjsonschema.SchemaFor[SmartCardEmulationConnectRequestedEvent]())
	types.eventSchemas["SmartCardEmulation.disconnectRequested"] = nativeResultSchema(abxjsonschema.SchemaFor[SmartCardEmulationDisconnectRequestedEvent]())
	types.eventSchemas["SmartCardEmulation.transmitRequested"] = nativeResultSchema(abxjsonschema.SchemaFor[SmartCardEmulationTransmitRequestedEvent]())
	types.eventSchemas["SmartCardEmulation.controlRequested"] = nativeResultSchema(abxjsonschema.SchemaFor[SmartCardEmulationControlRequestedEvent]())
	types.eventSchemas["SmartCardEmulation.getAttribRequested"] = nativeResultSchema(abxjsonschema.SchemaFor[SmartCardEmulationGetAttribRequestedEvent]())
	types.eventSchemas["SmartCardEmulation.setAttribRequested"] = nativeResultSchema(abxjsonschema.SchemaFor[SmartCardEmulationSetAttribRequestedEvent]())
	types.eventSchemas["SmartCardEmulation.statusRequested"] = nativeResultSchema(abxjsonschema.SchemaFor[SmartCardEmulationStatusRequestedEvent]())
	types.eventSchemas["SmartCardEmulation.beginTransactionRequested"] = nativeResultSchema(abxjsonschema.SchemaFor[SmartCardEmulationBeginTransactionRequestedEvent]())
	types.eventSchemas["SmartCardEmulation.endTransactionRequested"] = nativeResultSchema(abxjsonschema.SchemaFor[SmartCardEmulationEndTransactionRequestedEvent]())
	types.eventSchemas["Storage.cacheStorageContentUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[StorageCacheStorageContentUpdatedEvent]())
	types.eventSchemas["Storage.cacheStorageListUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[StorageCacheStorageListUpdatedEvent]())
	types.eventSchemas["Storage.indexedDBContentUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[StorageIndexedDBContentUpdatedEvent]())
	types.eventSchemas["Storage.indexedDBListUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[StorageIndexedDBListUpdatedEvent]())
	types.eventSchemas["Storage.interestGroupAccessed"] = nativeResultSchema(abxjsonschema.SchemaFor[StorageInterestGroupAccessedEvent]())
	types.eventSchemas["Storage.interestGroupAuctionEventOccurred"] = nativeResultSchema(abxjsonschema.SchemaFor[StorageInterestGroupAuctionEventOccurredEvent]())
	types.eventSchemas["Storage.interestGroupAuctionNetworkRequestCreated"] = nativeResultSchema(abxjsonschema.SchemaFor[StorageInterestGroupAuctionNetworkRequestCreatedEvent]())
	types.eventSchemas["Storage.sharedStorageAccessed"] = nativeResultSchema(abxjsonschema.SchemaFor[StorageSharedStorageAccessedEvent]())
	types.eventSchemas["Storage.sharedStorageWorkletOperationExecutionFinished"] = nativeResultSchema(abxjsonschema.SchemaFor[StorageSharedStorageWorkletOperationExecutionFinishedEvent]())
	types.eventSchemas["Storage.storageBucketCreatedOrUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[StorageStorageBucketCreatedOrUpdatedEvent]())
	types.eventSchemas["Storage.storageBucketDeleted"] = nativeResultSchema(abxjsonschema.SchemaFor[StorageStorageBucketDeletedEvent]())
	types.eventSchemas["Storage.attributionReportingSourceRegistered"] = nativeResultSchema(abxjsonschema.SchemaFor[StorageAttributionReportingSourceRegisteredEvent]())
	types.eventSchemas["Storage.attributionReportingTriggerRegistered"] = nativeResultSchema(abxjsonschema.SchemaFor[StorageAttributionReportingTriggerRegisteredEvent]())
	types.eventSchemas["Storage.attributionReportingReportSent"] = nativeResultSchema(abxjsonschema.SchemaFor[StorageAttributionReportingReportSentEvent]())
	types.eventSchemas["Storage.attributionReportingVerboseDebugReportSent"] = nativeResultSchema(abxjsonschema.SchemaFor[StorageAttributionReportingVerboseDebugReportSentEvent]())
	types.eventSchemas["Target.attachedToTarget"] = nativeResultSchema(abxjsonschema.SchemaFor[TargetAttachedToTargetEvent]())
	types.eventSchemas["Target.detachedFromTarget"] = nativeResultSchema(abxjsonschema.SchemaFor[TargetDetachedFromTargetEvent]())
	types.eventSchemas["Target.receivedMessageFromTarget"] = nativeResultSchema(abxjsonschema.SchemaFor[TargetReceivedMessageFromTargetEvent]())
	types.eventSchemas["Target.targetCreated"] = nativeResultSchema(abxjsonschema.SchemaFor[TargetTargetCreatedEvent]())
	types.eventSchemas["Target.targetDestroyed"] = nativeResultSchema(abxjsonschema.SchemaFor[TargetTargetDestroyedEvent]())
	types.eventSchemas["Target.targetCrashed"] = nativeResultSchema(abxjsonschema.SchemaFor[TargetTargetCrashedEvent]())
	types.eventSchemas["Target.targetInfoChanged"] = nativeResultSchema(abxjsonschema.SchemaFor[TargetTargetInfoChangedEvent]())
	types.eventSchemas["Tethering.accepted"] = nativeResultSchema(abxjsonschema.SchemaFor[TetheringAcceptedEvent]())
	types.eventSchemas["Tracing.bufferUsage"] = nativeResultSchema(abxjsonschema.SchemaFor[TracingBufferUsageEvent]())
	types.eventSchemas["Tracing.dataCollected"] = nativeResultSchema(abxjsonschema.SchemaFor[TracingDataCollectedEvent]())
	types.eventSchemas["Tracing.tracingComplete"] = nativeResultSchema(abxjsonschema.SchemaFor[TracingTracingCompleteEvent]())
	types.eventSchemas["WebAudio.contextCreated"] = nativeResultSchema(abxjsonschema.SchemaFor[WebAudioContextCreatedEvent]())
	types.eventSchemas["WebAudio.contextWillBeDestroyed"] = nativeResultSchema(abxjsonschema.SchemaFor[WebAudioContextWillBeDestroyedEvent]())
	types.eventSchemas["WebAudio.contextChanged"] = nativeResultSchema(abxjsonschema.SchemaFor[WebAudioContextChangedEvent]())
	types.eventSchemas["WebAudio.audioListenerCreated"] = nativeResultSchema(abxjsonschema.SchemaFor[WebAudioAudioListenerCreatedEvent]())
	types.eventSchemas["WebAudio.audioListenerWillBeDestroyed"] = nativeResultSchema(abxjsonschema.SchemaFor[WebAudioAudioListenerWillBeDestroyedEvent]())
	types.eventSchemas["WebAudio.audioNodeCreated"] = nativeResultSchema(abxjsonschema.SchemaFor[WebAudioAudioNodeCreatedEvent]())
	types.eventSchemas["WebAudio.audioNodeWillBeDestroyed"] = nativeResultSchema(abxjsonschema.SchemaFor[WebAudioAudioNodeWillBeDestroyedEvent]())
	types.eventSchemas["WebAudio.audioParamCreated"] = nativeResultSchema(abxjsonschema.SchemaFor[WebAudioAudioParamCreatedEvent]())
	types.eventSchemas["WebAudio.audioParamWillBeDestroyed"] = nativeResultSchema(abxjsonschema.SchemaFor[WebAudioAudioParamWillBeDestroyedEvent]())
	types.eventSchemas["WebAudio.nodesConnected"] = nativeResultSchema(abxjsonschema.SchemaFor[WebAudioNodesConnectedEvent]())
	types.eventSchemas["WebAudio.nodesDisconnected"] = nativeResultSchema(abxjsonschema.SchemaFor[WebAudioNodesDisconnectedEvent]())
	types.eventSchemas["WebAudio.nodeParamConnected"] = nativeResultSchema(abxjsonschema.SchemaFor[WebAudioNodeParamConnectedEvent]())
	types.eventSchemas["WebAudio.nodeParamDisconnected"] = nativeResultSchema(abxjsonschema.SchemaFor[WebAudioNodeParamDisconnectedEvent]())
	types.eventSchemas["WebAuthn.credentialAdded"] = nativeResultSchema(abxjsonschema.SchemaFor[WebAuthnCredentialAddedEvent]())
	types.eventSchemas["WebAuthn.credentialDeleted"] = nativeResultSchema(abxjsonschema.SchemaFor[WebAuthnCredentialDeletedEvent]())
	types.eventSchemas["WebAuthn.credentialUpdated"] = nativeResultSchema(abxjsonschema.SchemaFor[WebAuthnCredentialUpdatedEvent]())
	types.eventSchemas["WebAuthn.credentialAsserted"] = nativeResultSchema(abxjsonschema.SchemaFor[WebAuthnCredentialAssertedEvent]())
}
