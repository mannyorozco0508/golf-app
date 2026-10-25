// HardPanBridgeViewController.swift - registers HardPan's local Capacitor plugins.
//
// In the App target since mailbox 022 (the Live Activity plugin). SceneDelegate shows this
// controller instead of the stock CAPBridgeViewController.
//   HardPanLiveActivity  - Lock Screen / Dynamic Island yardages (022 feature 1), always.
//   HardPanStore         - the Golf GPS subscription through StoreKit 2 (URGENT-062), always. Asked only
//                          when the build's paywall is on (gps-config.js paywall).
//   HardPanWatch         - the Apple Watch (feature 10, docs/WATCH-APP-PLAN.md): registered when its
//                          files are in the target (looked up by name, so this file compiles either way).
//   HardPanDocScan       - the paper scorecard camera (066 scorecard-scan-ai, VisionKit), always; it opens
//                          only when the golfer taps Scan scorecard (gps-scan-client.js).
//   HardPanVoice         - voice scoring + the Siri intents' bridge to the page (066 feature 4), always.

import UIKit
import Capacitor

class HardPanBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(HardPanLiveActivityPlugin())
        bridge?.registerPluginInstance(HardPanStorePlugin())
        bridge?.registerPluginInstance(HardPanDocScanPlugin())
        bridge?.registerPluginInstance(HardPanVoicePlugin())
        if let watch = NSClassFromString("HardPanWatchPlugin") as? CAPPlugin.Type {
            bridge?.registerPluginInstance(watch.init())
        }
    }
}
