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
    /// 066: putts sent with those scores (hole -> putts), until the phone echoes them.
    @Published private(set) var unsentPutts: [Int: Int] = [:]
    /// 066: when the last "send me the hole again" went (one at a time, not a stream).
    private var syncAskedAt: Date?

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

    func saveScore(hole: Int, strokes: Int, putts: Int? = nil) {
        // Putts only where the phone keeps them (its quick stats); otherwise the score alone.
        let p = (state?.stats ?? false) ? putts : nil
        let s = WatchScore(hole: hole, strokes: strokes, putts: p, round: state?.round ?? "")
        unsent[hole] = strokes
        if let sp = s.putts { unsentPutts[hole] = sp } else { unsentPutts[hole] = nil }
        send(s.dictionary)
    }

    /// 066: nothing on screen (a fresh launch, a wake, a pairing made after the phone last sent):
    /// ask the phone for its current hole. sendMessage only - a queued "sync" from an hour ago means
    /// nothing - and at most one every 5 seconds.
    func askForHole() {
        let wc = WCSession.default
        guard wc.activationState == .activated, wc.isReachable else { return }
        if let t = syncAskedAt, Date().timeIntervalSince(t) < 5 { return }
        syncAskedAt = Date()
        wc.sendMessage([WatchKey.kind: WatchKind.sync, WatchKey.v: watchProtocolVersion], replyHandler: nil, errorHandler: nil)
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

    #if DEBUG
    /// TESTS ONLY (Debug builds): `-hpAutoScore N` on the watch app's launch arguments saves N for the
    /// first hole the phone sends - the same saveScore as the Save button (simulators cannot tap the watch).
    private var autoScoreDone = false
    private var autoScore: Int? { launchInt("-hpAutoScore", 1...20) }
    /// 066: `-hpAutoPutts P` goes with -hpAutoScore (the same Save, with putts).
    private var autoPutts: Int? { launchInt("-hpAutoPutts", 0...9) }
    private func launchInt(_ flag: String, _ r: ClosedRange<Int>) -> Int? {
        let a = ProcessInfo.processInfo.arguments
        guard let i = a.firstIndex(of: flag), i + 1 < a.count, let n = Int(a[i + 1]), r.contains(n) else { return nil }
        return n
    }
    #endif

    fileprivate func apply(_ d: [String: Any]) {
        if (d[WatchKey.kind] as? String) == WatchKind.clear { state = nil; pendingHole = nil; unsent = [:]; unsentPutts = [:]; return }
        guard let s = HoleState(d) else { return }
        state = s
        #if DEBUG
        if !autoScoreDone, let n = autoScore, !s.round.isEmpty {
            autoScoreDone = true
            let p = autoPutts
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) { self.saveScore(hole: s.hole, strokes: n, putts: p) }
        }
        #endif
        if pendingHole == s.hole { pendingHole = nil }
        // The phone's saved score is the truth: the watch stops showing its own copy as "sending".
        if let saved = s.score, unsent[s.hole] == saved { unsent[s.hole] = nil }
        if let sp = unsentPutts[s.hole], s.putts == sp || !s.stats { unsentPutts[s.hole] = nil }
        // A score for another round never shows as "sending" on this one.
        if !s.round.isEmpty, s.round != lastRound { unsent = [:]; unsentPutts = [:]; lastRound = s.round }
    }
    private var lastRound = ""
}

extension WatchSessionManager: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        let ctx = session.receivedApplicationContext
        let r = session.isReachable
        Task { @MainActor in
            self.reachable = r
            if !ctx.isEmpty { self.apply(ctx) }
            // 066 ("Open a round..." while the phone was sending): the stored context can be empty or
            // old - a pairing made after the phone's last send, a watch app installed later. Ask.
            self.askForHole()
        }
    }
    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        let r = session.isReachable
        Task { @MainActor in
            self.reachable = r
            if r && self.state == nil { self.askForHole() }
        }
    }
    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        Task { @MainActor in self.apply(applicationContext) }
    }
    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        Task { @MainActor in self.apply(message) }
    }
}
