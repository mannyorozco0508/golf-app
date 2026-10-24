// ScoreEntryView.swift - the golfer's OWN score for one hole: - / + (or the Digital Crown), Save.
//
// SCAFFOLD (feature 10, docs/WATCH-APP-PLAN.md). Not in the Xcode project and never compiled.
// Starts at the saved score, else par. Save hands it to the phone (WatchSessionManager.saveScore),
// which writes it through the app's own saveScore - the watch never writes the database itself.
// Only the phone's own golfer: the watch has no golfer picker (other players stay on the phone).

import SwiftUI

struct ScoreEntryView: View {
    let hole: Int
    let par: Int
    let saved: Int?
    let puttsOn: Bool
    @EnvironmentObject var session: WatchSessionManager
    @Environment(\.dismiss) private var dismiss
    @State private var strokes: Int = 4
    @State private var crown: Double = 4
    /// 066: putts, as the phone's quick stats keep them (0, 1, 2, 3, 4 = "4+"). nil = not entered.
    @State private var putts: Int?

    init(hole: Int, par: Int, saved: Int?, savedPutts: Int? = nil, puttsOn: Bool = false) {
        self.hole = hole; self.par = par; self.saved = saved; self.puttsOn = puttsOn
        let start = saved ?? par
        _strokes = State(initialValue: start)
        _crown = State(initialValue: Double(start))
        _putts = State(initialValue: puttsOn ? savedPutts : nil)
    }

    var body: some View {
        ScrollView {   // 066: with putts it is taller than a 41 mm screen
        VStack(spacing: 6) {
            Text("Hole \(hole) · Par \(par)").font(.footnote).foregroundStyle(.secondary)
            HStack {
                Button { set(strokes - 1) } label: { Image(systemName: "minus") }
                    .accessibilityLabel("One fewer stroke")
                    .disabled(strokes <= 1)
                Text("\(strokes)")
                    .font(.system(size: 44, weight: .semibold, design: .rounded)).monospacedDigit()
                    .frame(minWidth: 56)
                    .accessibilityLabel("\(strokes) strokes")
                    .focusable()
                    .digitalCrownRotation($crown, from: 1, through: 20, by: 1, sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
                    .onChange(of: crown) { _, v in set(Int(v.rounded())) }
                Button { set(strokes + 1) } label: { Image(systemName: "plus") }
                    .accessibilityLabel("One more stroke")
                    .disabled(strokes >= 20)
            }
            if puttsOn {
                // 066: putts on the watch - the same 0-4+ the phone's putts chips offer.
                HStack {
                    Button { setPutts((putts ?? 1) - 1) } label: { Image(systemName: "minus") }
                        .accessibilityLabel("One fewer putt")
                        .disabled((putts ?? 1) <= 0)
                    VStack(spacing: 0) {
                        Text(putts.map { $0 >= 4 ? "4+" : "\($0)" } ?? "–")
                            .font(.title3.weight(.semibold)).monospacedDigit()
                        Text("Putts").font(.caption2).foregroundStyle(.secondary)
                    }
                    .frame(minWidth: 56)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(putts.map { $0 >= 4 ? "4 or more putts" : "\($0) putts" } ?? "Putts not entered")
                    Button { setPutts((putts ?? 1) + 1) } label: { Image(systemName: "plus") }
                        .accessibilityLabel("One more putt")
                        .disabled((putts ?? 0) >= min(4, strokes))
                }
            }
            Button("Save") {
                session.saveScore(hole: hole, strokes: strokes, putts: puttsOn ? putts : nil)
                dismiss()
            }
            .buttonStyle(.borderedProminent)
            .accessibilityHint("Sends your score for hole \(hole) to HardPan on your iPhone")
        }
        }
        .navigationTitle("Score")
    }

    private func set(_ v: Int) {
        let n = min(max(v, 1), 20)
        strokes = n
        if Int(crown.rounded()) != n { crown = Double(n) }
        if let p = putts, p > n { putts = n }   // never more putts than strokes
    }
    private func setPutts(_ v: Int) { putts = min(max(v, 0), min(4, strokes)) }
}
