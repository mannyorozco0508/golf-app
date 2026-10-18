// PhoneWatchSession.swift - the iPhone's end of WatchConnectivity.
//
// SCAFFOLD (feature 10, docs/WATCH-APP-PLAN.md). Not in the Xcode project and never compiled.
// Added to the App target (with ../../Watch/Shared/WatchProtocol.swift) after the LLC migration.
//
//   sendHole(_:)  - the JS GPS screen's numbers -> updateApplicationContext (latest wins; the watch
//                   gets it even if it was asleep), plus sendMessage when the watch is reachable so
//                   the screen updates at once.
//   from the watch - a score or a hole change. Handed to the plugin (-> JS) when the web view is
//                   live; otherwise KEPT (UserDefaults, a small list) until JS asks for them on the
//                   next launch, so a score typed while the phone app was not running is not lost.
//                   The phone app never writes the database from native code: JS does, through the
//                   app's own saveScore (offline queue, permissions, rules).

import Foundation
import WatchConnectivity

final class PhoneWatchSession: NSObject {
    static let shared = PhoneWatchSession()

    /// Set by HardPanWatchPlugin when the bridge loads. Called on the main queue.
    var onFromWatch: (([String: Any]) -> Void)?

    private let pendingKey = "hardpan_watch_pending"
    private let maxPending = 50
    private var seenIds: [String] = []

    private override init() { super.init() }

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    var status: [String: Any] {
        guard WCSession.isSupported() else { return ["supported": false] }
        let s = WCSession.default
        return ["supported": true, "paired": s.isPaired, "installed": s.isWatchAppInstalled,
                "reachable": s.isReachable, "activated": s.activationState == .activated]
    }

    /// Only for a paired watch with the app installed - otherwise nothing is sent anywhere.
    func sendHole(_ d: [String: Any]) {
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        guard s.activationState == .activated, s.isPaired, s.isWatchAppInstalled else { return }
        try? s.updateApplicationContext(d)
        if s.isReachable { s.sendMessage(d, replyHandler: nil, errorHandler: nil) }
    }

    func clear() {
        sendHole([WatchKey.kind: WatchKind.clear, WatchKey.v: watchProtocolVersion])
    }

    /// Everything the watch sent while JS was not listening; emptied by the read.
    func takePending() -> [[String: Any]] {
        let list = (UserDefaults.standard.array(forKey: pendingKey) as? [[String: Any]]) ?? []
        UserDefaults.standard.removeObject(forKey: pendingKey)
        return list
    }

    private func received(_ d: [String: Any]) {
        // A sendMessage that also fell back to transferUserInfo arrives twice: once is enough.
        if let id = d[WatchKey.id] as? String {
            if seenIds.contains(id) { return }
            seenIds.append(id); if seenIds.count > 200 { seenIds.removeFirst(100) }
        }
        DispatchQueue.main.async {
            if let deliver = self.onFromWatch { deliver(d) } else { self.keep(d) }
        }
    }

    private func keep(_ d: [String: Any]) {
        // Only scores are worth keeping: a hole change from an hour ago means nothing.
        guard (d[WatchKey.kind] as? String) == WatchKind.score else { return }
        var list = (UserDefaults.standard.array(forKey: pendingKey) as? [[String: Any]]) ?? []
        list.append(d)
        if list.count > maxPending { list.removeFirst(list.count - maxPending) }
        UserDefaults.standard.set(list, forKey: pendingKey)
    }
}

extension PhoneWatchSession: WCSessionDelegate {
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
    // iOS only: a golfer can swap watches mid-season - re-activate for the new one.
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { WCSession.default.activate() }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) { received(message) }
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) { received(userInfo) }
}
