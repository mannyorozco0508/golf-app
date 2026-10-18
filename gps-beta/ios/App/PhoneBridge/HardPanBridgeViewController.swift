// HardPanBridgeViewController.swift - registers the local HardPanWatch plugin with Capacitor.
//
// SCAFFOLD (feature 10, docs/WATCH-APP-PLAN.md). Not in the Xcode project and never compiled.
// After the LLC migration: add this file to the App target, then change ONE line in
// App/SceneDelegate.swift:  window?.rootViewController = CAPBridgeViewController()
//                       ->  window?.rootViewController = HardPanBridgeViewController()
// (The scene builds the bridge in code; Main.storyboard's CAPBridgeViewController is not the one
// shown.) Until then the app keeps the stock CAPBridgeViewController and no watch plugin exists.

import UIKit
import Capacitor

class HardPanBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(HardPanWatchPlugin())
    }
}
