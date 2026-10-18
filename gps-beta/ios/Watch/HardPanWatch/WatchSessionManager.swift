// WatchSessionManager.swift - the watch's end of WatchConnectivity.
//
// SCAFFOLD (feature 10, docs/WATCH-APP-PLAN.md). Not in the Xcode project and never compiled.
//
// What it does:
//   - receives the phone's current hole (applicationContext, latest wins) and publishes it;
//   - hole +/- asks the PHONE to change hole (the phone owns the round: its card, its GPS);
//     until the phone answers, the watch shows the asked-for hole with no numbers;
//   - a score goes by sendMessage when the phone is reachable, else transferUserInfo (queued by
//     watchOS, delivered in order when the phone app next runs). Either way the PHONE writes it,
//     through the app's own saveScore - the offline queue, permissions and rules all apply.
// The watch has no GPS of its own in v1 (standalone watch GPS is a later phase).

import Foundation
import WatchConnectivity

@MainActor
final class WatchSessionManager: NSObject, ObservableObject {
    static let shared = WatchSessionManager()

    /// The last hole the phone sent. nil = nothing yet (no round open on the phone, or never paired).
    @Published private(set) var state: HoleState?
    /// The hole the golfer asked for with +/- that the phone has not confirmed yet.
    @Published private(set) var pendingHole: Int?
    @Published private(set) var reachable = false
    /// Scores handed to WatchConnectivity that the phone has not echoed back yet (hole -> strokes).
    @Published private(set) var unsent: [Int: Int] = [:]

    private override init() {
        super.init()
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    /// The hole on screen: the asked-for one while waiting, else the phone's.
    var shownHole: Int? { pendingHole ?? state?.hole }
    /// Numbers only for the hole the phone actually measured, and only for an entitled phone.
    var numbersShown: Bool { guard let s = state else { return false }; return s.entitled && pendingHole == nil }

    func step(_ delta: Int) {
        guard let cur = shownHole else { return }
        let next = min(max(cur + delta, 1), 18)   // 18: v1 cards; a 27/36-hole card is a later step
        guard next != cur else { return }
        pendingHole = next
        send([WatchKey.kind: WatchKind.hole, WatchKey.v: watchProtocolVersion,
              WatchKey.hole: next, WatchKey.round: state?.round ?? ""])
    }

    func saveScore(hole: Int, strokes: Int) {
        let s = WatchScore(hole: hole, strokes: strokes, round: state?.round ?? "")
        unsent[hole] = strokes
        send(s.dictionary)
    }

    private func send(_ msg: [String: Any]) {
        let wc = WCSession.default
        guard wc.activationState == .activated else { return }
        if wc.isReachable {
            wc.sendMessage(msg, replyHandler: nil) { _ in
                // Not delivered after all: queue it. The phone drops a duplicate by id.
                wc.transferUserInfo(msg)
            }
        } else {
            wc.transferUserInfo(msg)
        }
    }

    fileprivate func apply(_ d: [String: Any]) {
        if (d[WatchKey.kind] as? String) == WatchKind.clear { state = nil; pendingHole = nil; return }
        guard let s = HoleState(d) else { return }
        state = s
        if pendingHole == s.hole { pendingHole = nil }
        // The phone's saved score is the truth: the watch stops showing its own copy as "sending".
        if let saved = s.score, unsent[s.hole] == saved { unsent[s.hole] = nil }
    }
}

extension WatchSessionManager: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        let ctx = session.receivedApplicationContext
        let r = session.isReachable
        Task { @MainActor in
            self.reachable = r
            if !ctx.isEmpty { self.apply(ctx) }
        }
    }
    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        let r = session.isReachable
        Task { @MainActor in self.reachable = r }
    }
    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        Task { @MainActor in self.apply(applicationContext) }
    }
    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        Task { @MainActor in self.apply(message) }
    }
}
