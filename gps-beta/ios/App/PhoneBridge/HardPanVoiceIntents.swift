// HardPanVoiceIntents.swift - Siri / AirPods for voice scoring (URGENT-066 feature 4). App Intents
// in the App target (iOS 16+; no SiriKit, no Siri entitlement, no extension).
//
//   "Hey Siri, score in HardPan GPS"           -> "What should I put down?" -> "a 5, two putts"
//   "Hey Siri, put me down in HardPan GPS"     -> the same
//   "Hey Siri, what's my yardage in HardPan GPS"
//
// The round lives in the app's web page, so the intent sends the words there (VoiceIntentRelay) and
// the page parses them with the same grammar as the mic button (gps-voice-parse.js) and puts the
// score up on the normal score sheet for the golfer to Save. Siri never saves a score by itself.
// WHEN THE PAGE CAN'T ANSWER - the phone is locked or HardPan is in the background (iOS pauses the
// web view), HardPan isn't running, or no round is open - Siri says so; a score's words are held on
// the phone and come back on the score sheet the next time the round is open. A yardage comes from
// the Lock Screen yardages when they are running (numbers only, worked out on the phone).

import Foundation
import AppIntents

@available(iOS 16.0, *)
struct HardPanScoreIntent: AppIntent {
    static var title: LocalizedStringResource = "Put down a score"
    static var description = IntentDescription("Say your score for the hole you're on, like \"a 5, two putts\" or \"bogey for Mike\". HardPan puts it on the score sheet for you to save.")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Score", requestValueDialog: IntentDialog("What should I put down?"))
    var words: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let r = await VoiceIntentRelay.shared.ask(kind: "score", words: words)
        if r.reached {
            if r.status == "ask" { throw $words.needsValueError(IntentDialog(stringLiteral: r.say)) }
            return .result(dialog: IntentDialog(stringLiteral: r.say))
        }
        _ = VoiceIntentRelay.shared.hold(words: words)
        let why = r.why == "nopage"
            ? "HardPan isn't open on a round, so I can't reach your scorecard."
            : "Your scorecard is paused while the phone is locked or HardPan is in the background."
        return .result(dialog: IntentDialog(stringLiteral: why + " I've kept \"\(words)\" on your phone - open your round in HardPan and it'll be on the score sheet to save."))
    }
}

@available(iOS 16.0, *)
struct HardPanYardageIntent: AppIntent {
    static var title: LocalizedStringResource = "What's my yardage"
    static var description = IntentDescription("Hear the yardage to the green for the hole you're on.")
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let r = await VoiceIntentRelay.shared.ask(kind: "yardage")
        if r.reached { return .result(dialog: IntentDialog(stringLiteral: r.say)) }
        // The page is asleep: the Lock Screen yardages keep their own numbers (worked out on the phone).
        let la = HardPanLiveActivityPlugin.snapshot
        if let mid = la["mid"] as? Int {
            let unit = (la["unit"] as? String) == "m" ? "meters" : "yards"
            var s = "\(mid) \(unit) to the middle"
            if let f = la["front"] as? Int, let b = la["back"] as? Int { s += ", \(f) front, \(b) back" }
            if let h = la["hole"] as? Int { s = "Hole \(h): " + s }
            return .result(dialog: IntentDialog(stringLiteral: s + "."))
        }
        return .result(dialog: IntentDialog(stringLiteral: "I can't see your yardage right now. Open the GPS screen in HardPan - with Lock Screen yardages on, I can read them while the phone is locked."))
    }
}

@available(iOS 16.0, *)
struct HardPanShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: HardPanScoreIntent(), phrases: [
            "Score in \(.applicationName)",
            "Put me down in \(.applicationName)",
            "Put down a score in \(.applicationName)",
            "\(.applicationName) score"
        ])
        AppShortcut(intent: HardPanYardageIntent(), phrases: [
            "What's my yardage in \(.applicationName)",
            "\(.applicationName) yardage",
            "How far in \(.applicationName)"
        ])
    }
}
