// ============================================================================
// HardPanRoundAttributes.swift — WHAT THE LOCK SCREEN HOLDS
//
// SHARED BY TWO TARGETS. The app writes it (HardPanLiveActivityPlugin) and the
// widget extension reads it, so this file must be a member of BOTH in Xcode -
// the single commonest mistake with ActivityKit, and the one that produces
// "cannot find type in scope" in the extension rather than anything useful.
//
// PHASE 1 IS LOCAL. Everything here is set by the app on the phone that is
// keeping score; no push token is registered and no server updates it. Phase 2
// is the pushed version and is deliberately not started - a Live Activity that
// can be updated from a server needs the round to know which activities exist,
// which is a database shape and a sender, not a widget.
//
// NO MONEY, ON PURPOSE. The card shows a score to par, a thru count and one
// match status line. Mid-round totals are the one thing the Receipt's rule
// forbids everywhere else in this app, and a lock screen is the worst possible
// place to break it: the number is wrong the moment a press lands and nobody
// is looking at the app to see it corrected.
// ============================================================================
import ActivityKit
import Foundation

public struct HardPanRoundAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// "-2", "+1", "E" — already formatted by the page, which owns the words.
        public var toPar: String
        /// Holes completed. 0 before anyone tees off, which is a fact, not a blank.
        public var thru: Int
        /// One line, the top match: "Front AS · $20" or "2 UP thru 6". Empty when
        /// the golfer has no wager - the card then shows the score alone.
        public var matchLine: String
        /// The hole they are standing on, for the compact and minimal presentations.
        public var hole: Int

        public init(toPar: String, thru: Int, matchLine: String, hole: Int) {
            self.toPar = toPar
            self.thru = thru
            self.matchLine = matchLine
            self.hole = hole
        }
    }

    /// Fixed for the life of the round: who and where.
    public var golferName: String
    public var courseName: String
    public var roundCode: String

    public init(golferName: String, courseName: String, roundCode: String) {
        self.golferName = golferName
        self.courseName = courseName
        self.roundCode = roundCode
    }
}
