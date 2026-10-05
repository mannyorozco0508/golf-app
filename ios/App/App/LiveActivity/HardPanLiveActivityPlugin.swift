// ============================================================================
// HardPanLiveActivityPlugin.swift — THE APP'S HALF OF THE LOCK SCREEN
//
// A Capacitor plugin with three methods and no opinions: start, update, end.
// The WEB layer decides when a round begins, what the score is and when it is
// over, because that is where liveStandings() and buildLiveMatchStates() live
// and there must not be a second answer to "what is Manny's score" written in
// Swift.
//
// IN THE APP TARGET ONLY. HardPanRoundAttributes.swift is in BOTH targets; the
// widget views are in the extension alone.
//
// FAILS QUIET, ALWAYS. Live Activities are off by default for a new install,
// the golfer can refuse them in Settings, and the simulator and anything before
// iOS 16.1 do not have them at all. Every entry point resolves rather than
// rejecting: a lock screen card is a courtesy, and a round must never fail to
// open because a widget could not start.
// ============================================================================
import Foundation
import Capacitor
#if canImport(ActivityKit)
import ActivityKit
#endif

@objc(HardPanLiveActivityPlugin)
public class HardPanLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HardPanLiveActivityPlugin"
    public let jsName = "HardPanLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise)
    ]

    /// One at a time. A golfer is on one round; a second start ends the first,
    /// which is what switching rounds mid-morning must do.
    #if canImport(ActivityKit)
    @available(iOS 16.1, *)
    private static var current: Activity<HardPanRoundAttributes>?
    #endif

    @objc public func isSupported(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.1, *) {
            call.resolve(["supported": ActivityAuthorizationInfo().areActivitiesEnabled])
            return
        }
        #endif
        call.resolve(["supported": false])
    }

    @objc public func start(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.1, *) {
            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                call.resolve(["started": false, "reason": "disabled"]); return
            }
            let attrs = HardPanRoundAttributes(
                golferName: call.getString("golferName") ?? "You",
                courseName: call.getString("courseName") ?? "",
                roundCode: call.getString("roundCode") ?? "")
            let state = HardPanRoundAttributes.ContentState(
                toPar: call.getString("toPar") ?? "E",
                thru: call.getInt("thru") ?? 0,
                matchLine: call.getString("matchLine") ?? "",
                hole: call.getInt("hole") ?? 1)
            Task {
                // ENDING FIRST is not a no-op: a stale activity from this morning's
                // round would otherwise sit on the lock screen beside the new one.
                await Self.endAll()
                do {
                    let activity = try Activity.request(
                        attributes: attrs,
                        content: .init(state: state, staleDate: nil),
                        pushType: nil)              // PHASE 1 IS LOCAL. No push token.
                    Self.current = activity
                    call.resolve(["started": true])
                } catch {
                    call.resolve(["started": false, "reason": String(describing: error)])
                }
            }
            return
        }
        #endif
        call.resolve(["started": false, "reason": "unsupported"])
    }

    @objc public func update(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.1, *) {
            guard let activity = Self.current else { call.resolve(["updated": false]); return }
            let state = HardPanRoundAttributes.ContentState(
                toPar: call.getString("toPar") ?? "E",
                thru: call.getInt("thru") ?? 0,
                matchLine: call.getString("matchLine") ?? "",
                hole: call.getInt("hole") ?? 1)
            Task {
                await activity.update(.init(state: state, staleDate: nil))
                call.resolve(["updated": true])
            }
            return
        }
        #endif
        call.resolve(["updated": false])
    }

    @objc public func end(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.1, *) {
            Task { await Self.endAll(); call.resolve(["ended": true]) }
            return
        }
        #endif
        call.resolve(["ended": false])
    }

    #if canImport(ActivityKit)
    @available(iOS 16.1, *)
    private static func endAll() async {
        for activity in Activity<HardPanRoundAttributes>.activities {
            // .immediate, not .after: the round is over and the card is wrong from
            // this moment on. A dismissal policy that leaves it up for four hours
            // is how a lock screen ends up showing yesterday's score.
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        current = nil
    }
    #endif
}
