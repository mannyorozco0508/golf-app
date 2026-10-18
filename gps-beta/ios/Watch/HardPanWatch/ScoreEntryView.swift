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
    @EnvironmentObject var session: WatchSessionManager
    @Environment(\.dismiss) private var dismiss
    @State private var strokes: Int = 4
    @State private var crown: Double = 4

    init(hole: Int, par: Int, saved: Int?) {
        self.hole = hole; self.par = par; self.saved = saved
        let start = saved ?? par
        _strokes = State(initialValue: start)
        _crown = State(initialValue: Double(start))
    }

    var body: some View {
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
            Button("Save") {
                session.saveScore(hole: hole, strokes: strokes)
                dismiss()
            }
            .buttonStyle(.borderedProminent)
            .accessibilityHint("Sends your score for hole \(hole) to HardPan on your iPhone")
        }
        .navigationTitle("Score")
    }

    private func set(_ v: Int) {
        let n = min(max(v, 1), 20)
        strokes = n
        if Int(crown.rounded()) != n { crown = Double(n) }
    }
}
