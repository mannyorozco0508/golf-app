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
    /// 045: the last hole JS asked to send. A send before WCSession is activated / the watch app is
    /// installed / reachable is dropped, and gps-view.js only re-sends when a number changes - so the
    /// session re-sends this one itself as soon as it can (a golfer standing on the tee still gets numbers).
    private var lastHole: [String: Any]?
    private let lock = NSLock()

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
        lock.lock(); lastHole = d; lock.unlock()
        deliver(d)
    }

    /// 045: re-send the last hole once the session can deliver it (activation, watch app installed, reachable).
    private func resendLast() {
        lock.lock(); let d = lastHole; lock.unlock()
        if let d { deliver(d) }
    }

    private func deliver(_ d: [String: Any]) {
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
        // 066: the watch opened (or woke) with nothing on screen - it gets the last hole again at once,
        // from here: the web view may be busy or suspended, and the phone already knows the answer.
        if (d[WatchKey.kind] as? String) == WatchKind.sync { resendLast(); return }
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
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) { resendLast() }
    func sessionWatchStateDidChange(_ session: WCSession) { resendLast() }
    func sessionReachabilityDidChange(_ session: WCSession) { resendLast() }
    // iOS only: a golfer can swap watches mid-season - re-activate for the new one.
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { WCSession.default.activate() }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) { received(message) }
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) { received(userInfo) }
}
