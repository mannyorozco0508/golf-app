// HardPanLiveActivityPlugin.swift - the Lock Screen / Dynamic Island yardages (mailbox 022 feature 1).
// JS (gps-live-activity.js) sees it as Capacitor.Plugins.HardPanLiveActivity:
//   available() -> { available }            ActivityKit is here and the golfer has not turned it off in iOS
//   start({ course, round, ...state, green }) / update({ ...state, green }) / end()
//   state: { hole, par, front, mid, back, unit 'y'|'m', playsDelta, fromTee, thru, money }
//   green: { f: [lat, lng], c: [lat, lng], b: [lat, lng] } - the hole's green, so the numbers keep up
//          while the phone is locked (the web view's JavaScript is asleep then).
// THE GOLFER'S POSITION NEVER LEAVES THE PHONE: this plugin's own CLLocationManager (only while a
// Live Activity runs) measures to the green and puts NUMBERS into the activity, nothing else.
// THROTTLE (battery): a push at most every 10 s, sooner when the middle number moves 5+ or the hole
// changes; Low Power Mode: every 30 s and a 10 m location filter.

import Foundation
import Capacitor
import CoreLocation
#if canImport(ActivityKit)
import ActivityKit
#endif

@objc(HardPanLiveActivityPlugin)
public class HardPanLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "HardPanLiveActivityPlugin"
    public let jsName = "HardPanLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise)
    ]

    private var activityRef: Any?                 // Activity<HardPanRoundAttributes> on iOS 16.1+
    private var state: [String: Any] = [:]
    private var green: [String: [Double]] = [:]
    private var lastPush = Date.distantPast
    private var lastMid: Int?
    private var lastHole: Int?
    private var pending = false
    private lazy var loc: CLLocationManager = {
        let m = CLLocationManager()
        m.delegate = self
        m.activityType = .fitness
        m.desiredAccuracy = kCLLocationAccuracyBest
        m.pausesLocationUpdatesAutomatically = true
        return m
    }()

    private var lowPower: Bool { ProcessInfo.processInfo.isLowPowerModeEnabled }
    private var minGap: TimeInterval { lowPower ? 30 : 10 }

    @objc func available(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) { call.resolve(["available": ActivityAuthorizationInfo().areActivitiesEnabled]); return }
        #endif
        call.resolve(["available": false])
    }

    @objc func start(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            take(call)
            let round = call.getString("round") ?? ""
            DispatchQueue.main.async {
                // One per round: an activity for this round already running (a reload) is kept.
                if let a = Activity<HardPanRoundAttributes>.activities.first(where: { $0.attributes.round == round }) {
                    self.activityRef = a
                } else {
                    Activity<HardPanRoundAttributes>.activities.forEach { a in Task { await a.end(nil, dismissalPolicy: .immediate) } }
                    do {
                        let a = try Activity<HardPanRoundAttributes>.request(attributes: HardPanRoundAttributes(course: call.getString("course") ?? "", round: round),
                                                                            content: .init(state: self.content(), staleDate: nil), pushType: nil)
                        self.activityRef = a
                    } catch {
                        call.resolve(["started": false, "why": error.localizedDescription]); return
                    }
                }
                self.lastPush = Date(); self.lastMid = self.state["mid"] as? Int; self.lastHole = self.state["hole"] as? Int
                self.startLocation()
                call.resolve(["started": true])
            }
            return
        }
        #endif
        call.resolve(["started": false, "why": "unavailable"])
    }

    @objc func update(_ call: CAPPluginCall) {
        take(call)
        push(force: false)
        call.resolve()
    }

    @objc func end(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.loc.stopUpdatingLocation()
            #if canImport(ActivityKit)
            if #available(iOS 16.2, *) {
                let all = Activity<HardPanRoundAttributes>.activities
                Task { for a in all { await a.end(nil, dismissalPolicy: .immediate) } }
            }
            #endif
            self.activityRef = nil; self.state = [:]; self.green = [:]
            call.resolve()
        }
    }

    // ---- state from JS -------------------------------------------------------------
    private func take(_ call: CAPPluginCall) {
        for k in ["hole", "par", "front", "mid", "back", "playsDelta"] { if let v = call.getInt(k) { state[k] = v } else if call.options[k] is NSNull { state[k] = nil } }
        for k in ["unit", "thru", "money"] { if let v = call.getString(k) { state[k] = v } else if call.options[k] is NSNull { state[k] = nil } }
        if let b = call.getBool("fromTee") { state["fromTee"] = b }
        if let g = call.getObject("green") {
            var out: [String: [Double]] = [:]
            for k in ["f", "c", "b"] { if let p = g[k] as? [Any], p.count == 2, let a = (p[0] as? NSNumber)?.doubleValue, let b = (p[1] as? NSNumber)?.doubleValue { out[k] = [a, b] } }
            green = out
        } else if call.options["green"] is NSNull { green = [:] }
    }

    // ---- the numbers while the phone is locked: this plugin's own location ------------
    private func startLocation() {
        let modes = (Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String]) ?? []
        if modes.contains("location") {
            loc.allowsBackgroundLocationUpdates = true
            loc.showsBackgroundLocationIndicator = true
        }
        loc.distanceFilter = lowPower ? 10 : 5
        loc.startUpdatingLocation()
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let here = locations.last, here.horizontalAccuracy >= 0, here.horizontalAccuracy < 50, activityRef != nil else { return }
        guard (state["fromTee"] as? Bool) != true, let c = green["c"] else { return }   // off the hole: the tee's numbers stand
        let toUnit: (Double) -> Int = { m in Int(((self.state["unit"] as? String) == "m" ? m : m / 0.9144).rounded()) }
        let d = { (p: [Double]) -> Double in here.distance(from: CLLocation(latitude: p[0], longitude: p[1])) }
        state["mid"] = toUnit(d(c))
        if let f = green["f"] { state["front"] = toUnit(d(f)) }
        if let b = green["b"] { state["back"] = toUnit(d(b)) }
        push(force: false)
    }

    private func push(force: Bool) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            guard let a = activityRef as? Activity<HardPanRoundAttributes> else { return }
            let mid = state["mid"] as? Int, hole = state["hole"] as? Int
            let holeChanged = hole != lastHole
            let moved = mid != nil && lastMid != nil ? abs(mid! - lastMid!) >= 5 : mid != lastMid
            let gap = Date().timeIntervalSince(lastPush)
            guard force || holeChanged || (moved && gap >= 2) || gap >= minGap else { return }
            lastPush = Date(); lastMid = mid; lastHole = hole
            let c = content()
            Task { await a.update(.init(state: c, staleDate: nil)) }
        }
        #endif
    }

    #if canImport(ActivityKit)
    @available(iOS 16.2, *)
    private func content() -> HardPanRoundAttributes.ContentState {
        let mid = state["mid"] as? Int
        let delta = state["playsDelta"] as? Int
        let plays: Int? = (mid != nil && delta != nil && delta != 0) ? mid! + delta! : nil
        return HardPanRoundAttributes.ContentState(hole: (state["hole"] as? Int) ?? 1, par: state["par"] as? Int, front: state["front"] as? Int, mid: mid,
                                                   back: state["back"] as? Int, unit: (state["unit"] as? String) == "m" ? "m" : "y", plays: plays,
                                                   fromTee: (state["fromTee"] as? Bool) ?? false, thru: state["thru"] as? String, money: state["money"] as? String)
    }
    #endif
}
