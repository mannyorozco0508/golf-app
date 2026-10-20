// HardPanRoundAttributes.swift - the Live Activity's data (mailbox 022 feature 1).
// Compiled into BOTH the App target (HardPanLiveActivityPlugin starts / updates / ends it) and the
// HardPanLiveActivity widget extension (draws it on the Lock Screen and in the Dynamic Island).
// Numbers only: never a coordinate - the golfer's position stays in the app (no location leaves the phone).

import Foundation
#if canImport(ActivityKit)
import ActivityKit

@available(iOS 16.1, *)
public struct HardPanRoundAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var hole: Int
        public var par: Int?
        public var front: Int?
        public var mid: Int?
        public var back: Int?
        public var unit: String          // "y" | "m"
        public var plays: Int?           // plays-like to the middle (nil when it is the same number)
        public var fromTee: Bool         // off the hole: the numbers are from the tee
        public var thru: String?         // "Thru 3 · +1"
        public var money: String?        // "You +$12 · 2 bets" - only when the round has bets

        public init(hole: Int, par: Int?, front: Int?, mid: Int?, back: Int?, unit: String, plays: Int?, fromTee: Bool, thru: String?, money: String?) {
            self.hole = hole; self.par = par; self.front = front; self.mid = mid; self.back = back
            self.unit = unit; self.plays = plays; self.fromTee = fromTee; self.thru = thru; self.money = money
        }
    }
    public var course: String
    public var round: String

    public init(course: String, round: String) { self.course = course; self.round = round }
}
#endif
