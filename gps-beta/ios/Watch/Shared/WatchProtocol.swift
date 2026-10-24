// WatchProtocol.swift - the message format between the HardPan GPS iPhone app and its watch.
//
// SCAFFOLD (feature 10, docs/WATCH-APP-PLAN.md). NOT in the Xcode project yet: after the
// developer account moves to the LLC, Manny adds this ONE file to BOTH targets (App and
// HardPanWatch Watch App). It has never been compiled - nothing here has been built.
//
// Phone -> watch: WCSession.updateApplicationContext([kind: "hole", ...HoleState]) - the latest
//   hole only (a newer context replaces an older one, so the watch never shows a stale queue).
// Watch -> phone: sendMessage when reachable, else transferUserInfo (queued, delivered in order):
//   [kind: "score", hole, strokes, putts?, round, id, at] and [kind: "hole", hole, round];
//   066: [kind: "sync"] (sendMessage only) - "send me the current hole again".
// Numbers only: no coordinate ever crosses (CLAUDE.md: no location data leaves the phone).

import Foundation

enum WatchKey {
    static let kind = "kind"
    static let hole = "hole", par = "par", front = "front", center = "center", back = "back"
    static let units = "units", onGreen = "onGreen", entitled = "entitled", tournament = "tournament"
    static let score = "score", round = "round", strokes = "strokes", id = "id", at = "at"
    static let plays = "plays"   // 022: plays-like to the center (wind / elevation), golfer's units
    // 066: the golfer's own card on the watch. putts = this hole's putts (the phone's quick stats);
    // stats = putts may be entered (GPS Map + quick stats on the phone); thru / total / toPar = the
    // holes scored so far, their strokes and the strokes against their pars; name = whose card it is.
    static let putts = "putts", stats = "stats", thru = "thru", total = "total", toPar = "toPar", name = "name"
    static let v = "v"   // protocol version
}

enum WatchKind {
    static let hole = "hole"     // phone -> watch: the current hole's numbers; watch -> phone: go to hole n
    static let score = "score"   // watch -> phone: the golfer's own score for a hole
    static let clear = "clear"   // phone -> watch: no round open (the watch shows "Open a round on iPhone")
    // 066: watch -> phone "send me the current hole again" (the watch opened, or woke, with nothing
    // on screen). The phone answers from its own last hole - natively, JS is not involved.
    static let sync = "sync"
}

let watchProtocolVersion = 1

/// The current hole, as the phone's GPS screen shows it. nil numbers = no number (never a guess).
struct HoleState: Equatable, Codable {
    var hole: Int
    var par: Int?
    var front: Int?
    var center: Int?
    var back: Int?
    var plays: Int?            // 022: plays-like to the center, when the phone has it
    var units: String          // "yd" | "m"
    var onGreen: Bool
    var entitled: Bool         // GPS Map (007): false = the watch shows no numbers
    var tournament: Bool       // distance only (Rules of Golf 4.3) - F/C/B are still allowed
    var score: Int?            // the golfer's own saved score for this hole, if any
    var putts: Int?            // 066: this hole's putts as the phone has them (4 = "4+")
    var stats: Bool            // 066: putts may be entered (the phone's GPS Map + quick stats)
    var thru: Int?             // 066: holes with a score on the phone
    var total: Int?            // 066: strokes on those holes
    var toPar: Int?            // 066: strokes against par on those holes
    var name: String           // 066: the golfer the phone scores ("" = not known)
    var round: String          // the round's code; a score is always tagged with it

    init?(_ d: [String: Any]) {
        guard let h = d[WatchKey.hole] as? Int, h >= 1 else { return nil }
        hole = h
        par = d[WatchKey.par] as? Int
        front = d[WatchKey.front] as? Int
        center = d[WatchKey.center] as? Int
        back = d[WatchKey.back] as? Int
        plays = d[WatchKey.plays] as? Int
        units = (d[WatchKey.units] as? String) == "m" ? "m" : "yd"
        onGreen = (d[WatchKey.onGreen] as? Bool) ?? false
        entitled = (d[WatchKey.entitled] as? Bool) ?? false
        tournament = (d[WatchKey.tournament] as? Bool) ?? false
        score = d[WatchKey.score] as? Int
        putts = d[WatchKey.putts] as? Int
        stats = (d[WatchKey.stats] as? Bool) ?? false
        thru = d[WatchKey.thru] as? Int
        total = d[WatchKey.total] as? Int
        toPar = d[WatchKey.toPar] as? Int
        name = String(((d[WatchKey.name] as? String) ?? "").prefix(24))
        round = (d[WatchKey.round] as? String) ?? ""
        if !entitled { front = nil; center = nil; back = nil; plays = nil }   // belt and braces: the phone already sends none
    }

    var dictionary: [String: Any] {
        var d: [String: Any] = [WatchKey.kind: WatchKind.hole, WatchKey.v: watchProtocolVersion,
                                WatchKey.hole: hole, WatchKey.units: units, WatchKey.onGreen: onGreen,
                                WatchKey.entitled: entitled, WatchKey.tournament: tournament, WatchKey.round: round,
                                WatchKey.stats: stats, WatchKey.name: name]
        // WatchConnectivity property lists cannot carry nil: an absent key means "no number".
        if let par { d[WatchKey.par] = par }
        if let front { d[WatchKey.front] = front }
        if let center { d[WatchKey.center] = center }
        if let back { d[WatchKey.back] = back }
        if let plays { d[WatchKey.plays] = plays }
        if let score { d[WatchKey.score] = score }
        if let putts { d[WatchKey.putts] = putts }
        if let thru { d[WatchKey.thru] = thru }
        if let total { d[WatchKey.total] = total }
        if let toPar { d[WatchKey.toPar] = toPar }
        return d
    }
}

/// A score typed on the watch. id lets the phone drop a duplicate (sendMessage that also fell back
/// to transferUserInfo); round lets it drop a score queued for a round that is no longer open.
struct WatchScore: Equatable {
    var hole: Int
    var strokes: Int
    var putts: Int?            // 066: nil = not entered on the watch (the phone's putts stay as they are)
    var round: String
    var id: String = UUID().uuidString
    var at: Date = Date()

    init(hole: Int, strokes: Int, putts: Int? = nil, round: String) {
        self.hole = hole; self.strokes = strokes; self.round = round
        if let p = putts, (0...strokes).contains(p) { self.putts = min(p, 9) }
    }

    init?(_ d: [String: Any]) {
        guard (d[WatchKey.kind] as? String) == WatchKind.score,
              let h = d[WatchKey.hole] as? Int, (1...36).contains(h),
              let n = d[WatchKey.strokes] as? Int, (1...20).contains(n) else { return nil }
        hole = h; strokes = n
        if let p = d[WatchKey.putts] as? Int, (0...min(n, 9)).contains(p) { putts = p }
        round = (d[WatchKey.round] as? String) ?? ""
        id = (d[WatchKey.id] as? String) ?? UUID().uuidString
        at = Date(timeIntervalSince1970: (d[WatchKey.at] as? Double) ?? Date().timeIntervalSince1970)
    }

    var dictionary: [String: Any] {
        var d: [String: Any] = [WatchKey.kind: WatchKind.score, WatchKey.v: watchProtocolVersion, WatchKey.hole: hole,
                                WatchKey.strokes: strokes, WatchKey.round: round, WatchKey.id: id, WatchKey.at: at.timeIntervalSince1970]
        if let putts { d[WatchKey.putts] = putts }
        return d
    }
}
