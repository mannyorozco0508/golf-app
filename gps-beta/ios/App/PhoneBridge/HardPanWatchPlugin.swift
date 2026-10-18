// HardPanWatchPlugin.swift - the Capacitor plugin JS sees as window.Capacitor.Plugins.HardPanWatch.
//
// SCAFFOLD (feature 10, docs/WATCH-APP-PLAN.md). Not in the Xcode project and never compiled.
// A LOCAL plugin (in the App target, not an npm package): it is registered by
// HardPanBridgeViewController.capacitorDidLoad(), so capacitor.config.json's includePlugins and
// `cap sync` are not involved.
//
// JS API (gps-view.js uses it only when HardPanFeature('watch') is on):
//   sendHole({ hole, par, front, center, back, units, onGreen, entitled, tournament, score, round })
//   status() -> { supported, paired, installed, reachable, activated }
//   pending() -> { items: [ { kind: 'score', hole, strokes, round, id, at }, ... ] }
//   clear()   - no round open: the watch says "Open a round on iPhone"
//   events: 'watchScore' { hole, strokes, round, id, at }, 'watchHole' { hole, round }

import Foundation
import Capacitor

@objc(HardPanWatchPlugin)
public class HardPanWatchPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HardPanWatchPlugin"
    public let jsName = "HardPanWatch"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "sendHole", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        PhoneWatchSession.shared.onFromWatch = { [weak self] d in self?.fromWatch(d) }
        PhoneWatchSession.shared.activate()
    }

    @objc func sendHole(_ call: CAPPluginCall) {
        guard let hole = call.getInt("hole"), hole >= 1 else { call.reject("hole is required"); return }
        var d: [String: Any] = [WatchKey.kind: WatchKind.hole, WatchKey.v: watchProtocolVersion, WatchKey.hole: hole,
                                WatchKey.units: call.getString("units") == "m" ? "m" : "yd",
                                WatchKey.onGreen: call.getBool("onGreen") ?? false,
                                WatchKey.entitled: call.getBool("entitled") ?? false,
                                WatchKey.tournament: call.getBool("tournament") ?? false,
                                WatchKey.round: call.getString("round") ?? ""]
        // JS null = absent here (a property list has no nil). Numbers only - never a coordinate.
        for k in [WatchKey.par, WatchKey.front, WatchKey.center, WatchKey.back, WatchKey.score] {
            if let n = call.getInt(k) { d[k] = n }
        }
        if d[WatchKey.entitled] as? Bool != true {   // GPS Map (007): no numbers for an unentitled phone
            d[WatchKey.front] = nil; d[WatchKey.center] = nil; d[WatchKey.back] = nil
        }
        PhoneWatchSession.shared.sendHole(d)
        call.resolve()
    }

    @objc func status(_ call: CAPPluginCall) { call.resolve(PhoneWatchSession.shared.status) }

    @objc func pending(_ call: CAPPluginCall) { call.resolve(["items": PhoneWatchSession.shared.takePending()]) }

    @objc func clear(_ call: CAPPluginCall) { PhoneWatchSession.shared.clear(); call.resolve() }

    private func fromWatch(_ d: [String: Any]) {
        switch d[WatchKey.kind] as? String {
        case WatchKind.score?:
            guard let s = WatchScore(d) else { return }
            // retainUntilConsumed: a score that arrives before gps-view.js has added its listener waits.
            notifyListeners("watchScore", data: s.dictionary, retainUntilConsumed: true)
        case WatchKind.hole?:
            guard let h = d[WatchKey.hole] as? Int else { return }
            notifyListeners("watchHole", data: [WatchKey.hole: h, WatchKey.round: d[WatchKey.round] as? String ?? ""])
        default:
            return
        }
    }
}
