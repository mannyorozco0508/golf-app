// WatchProtocol.swift - the message format between the HardPan GPS iPhone app and its watch.
//
// SCAFFOLD (feature 10, docs/WATCH-APP-PLAN.md). NOT in the Xcode project yet: after the
// developer account moves to the LLC, Manny adds this ONE file to BOTH targets (App and
// HardPanWatch Watch App). It has never been compiled - nothing here has been built.
//
// Phone -> watch: WCSession.updateApplicationContext([kind: "hole", ...HoleState]) - the latest
//   hole only (a newer context replaces an older one, so the watch never shows a stale queue).
// Watch -> phone: sendMessage when reachable, else transferUserInfo (queued, delivered in order):
//   [kind: "score", hole, strokes, round, id, at] and [kind: "hole", hole, round].
// Numbers only: no coordinate ever crosses (CLAUDE.md: no location data leaves the phone).

import Foundation

enum WatchKey {
    static let kind = "kind"
    static let hole = "hole", par = "par", front = "front", center = "center", back = "back"
    static let units = "units", onGreen = "onGreen", entitled = "entitled", tournament = "tournament"
    static let score = "score", round = "round", strokes = "strokes", id = "id", at = "at"
    static let v = "v"   // protocol version
}

enum WatchKind {
    static let hole = "hole"     // phone -> watch: the current hole's numbers; watch -> phone: go to hole n
    static let score = "score"   // watch -> phone: the golfer's own score for a hole
    static let clear = "clear"   // phone -> watch: no round open (the watch shows "Open a round on iPhone")
}

let watchProtocolVersion = 1

/// The current hole, as the phone's GPS screen shows it. nil numbers = no number (never a guess).
struct HoleState: Equatable, Codable {
    var hole: Int
    var par: Int?
    var front: Int?
    var center: Int?
    var back: Int?
    var units: String          // "yd" | "m"
    var onGreen: Bool
    var entitled: Bool         // GPS Map (007): false = the watch shows no numbers
    var tournament: Bool       // distance only (Rules of Golf 4.3) - F/C/B are still allowed
    var score: Int?            // the golfer's own saved score for this hole, if any
    var round: String          // the round's code; a score is always tagged with it

    init?(_ d: [String: Any]) {
        guard let h = d[WatchKey.hole] as? Int, h >= 1 else { return nil }
        hole = h
        par = d[WatchKey.par] as? Int
        front = d[WatchKey.front] as? Int
        center = d[WatchKey.center] as? Int
        back = d[WatchKey.back] as? Int
        units = (d[WatchKey.units] as? String) == "m" ? "m" : "yd"
        onGreen = (d[WatchKey.onGreen] as? Bool) ?? false
        entitled = (d[WatchKey.entitled] as? Bool) ?? false
        tournament = (d[WatchKey.tournament] as? Bool) ?? false
        score = d[WatchKey.score] as? Int
        round = (d[WatchKey.round] as? String) ?? ""
        if !entitled { front = nil; center = nil; back = nil }   // belt and braces: the phone already sends none
    }

    var dictionary: [String: Any] {
        var d: [String: Any] = [WatchKey.kind: WatchKind.hole, WatchKey.v: watchProtocolVersion,
                                WatchKey.hole: hole, WatchKey.units: units, WatchKey.onGreen: onGreen,
                                WatchKey.entitled: entitled, WatchKey.tournament: tournament, WatchKey.round: round]
        // WatchConnectivity property lists cannot carry nil: an absent key means "no number".
        if let par { d[WatchKey.par] = par }
        if let front { d[WatchKey.front] = front }
        if let center { d[WatchKey.center] = center }
        if let back { d[WatchKey.back] = back }
        if let score { d[WatchKey.score] = score }
        return d
    }
}

/// A score typed on the watch. id lets the phone drop a duplicate (sendMessage that also fell back
/// to transferUserInfo); round lets it drop a score queued for a round that is no longer open.
struct WatchScore: Equatable {
    var hole: Int
    var strokes: Int
    var round: String
    var id: String = UUID().uuidString
    var at: Date = Date()

    init(hole: Int, strokes: Int, round: String) { self.hole = hole; self.strokes = strokes; self.round = round }

    init?(_ d: [String: Any]) {
        guard (d[WatchKey.kind] as? String) == WatchKind.score,
              let h = d[WatchKey.hole] as? Int, (1...36).contains(h),
              let n = d[WatchKey.strokes] as? Int, (1...20).contains(n) else { return nil }
        hole = h; strokes = n
        round = (d[WatchKey.round] as? String) ?? ""
        id = (d[WatchKey.id] as? String) ?? UUID().uuidString
        at = Date(timeIntervalSince1970: (d[WatchKey.at] as? Double) ?? Date().timeIntervalSince1970)
    }

    var dictionary: [String: Any] {
        [WatchKey.kind: WatchKind.score, WatchKey.v: watchProtocolVersion, WatchKey.hole: hole,
         WatchKey.strokes: strokes, WatchKey.round: round, WatchKey.id: id, WatchKey.at: at.timeIntervalSince1970]
    }
}
