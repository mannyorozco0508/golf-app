// HardPanBridgeViewController.swift - registers HardPan's local Capacitor plugins.
//
// In the App target since mailbox 022 (the Live Activity plugin). SceneDelegate shows this
// controller instead of the stock CAPBridgeViewController.
//   HardPanLiveActivity  - Lock Screen / Dynamic Island yardages (022 feature 1), always.
//   HardPanWatch         - the Apple Watch (feature 10, docs/WATCH-APP-PLAN.md): registered when its
//                          files are in the target (looked up by name, so this file compiles either way).
//   HardPanVoice         - voice scoring + the Siri intents' bridge to the page (066 feature 4), always.

import UIKit
import Capacitor

class HardPanBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(HardPanLiveActivityPlugin())
        bridge?.registerPluginInstance(HardPanVoicePlugin())
        if let watch = NSClassFromString("HardPanWatchPlugin") as? CAPPlugin.Type {
            bridge?.registerPluginInstance(watch.init())
        }
    }
}
