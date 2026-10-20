// ContentView.swift - the watch's one screen: F / C / B for the current hole, hole +/-, Score.
//
// SCAFFOLD (feature 10, docs/WATCH-APP-PLAN.md). Not in the Xcode project and never compiled.
// Accessibility: every number has a spoken label ("Center, 243 yards"), the hole buttons say
// "Previous hole" / "Next hole", and the numbers use Dynamic Type (.title / .largeTitle) with
// .minimumScaleFactor so the largest sizes still fit a 41 mm screen.

import SwiftUI

struct ContentView: View {
    @EnvironmentObject var session: WatchSessionManager

    var body: some View {
        if let hole = session.shownHole {
            hole_(hole)
        } else {
            VStack(spacing: 8) {
                Image(systemName: "iphone")
                    .font(.title2)
                    .accessibilityHidden(true)
                Text("Open a round in HardPan GPS on your iPhone")
                    .multilineTextAlignment(.center)
                    .font(.footnote)
            }
            .padding()
        }
    }

    @ViewBuilder
    private func hole_(_ hole: Int) -> some View {
        let s = session.state
        let unit = (s?.units == "m") ? "m" : "yds"
        let spoken = (s?.units == "m") ? "meters" : "yards"
        VStack(spacing: 4) {
            HStack {
                Button { session.step(-1) } label: { Image(systemName: "chevron.left") }
                    .accessibilityLabel("Previous hole")
                    .disabled(hole <= 1)
                Spacer()
                VStack(spacing: 0) {
                    Text("Hole \(hole)").font(.headline)
                    if let par = s?.par, session.pendingHole == nil { Text("Par \(par)").font(.caption2).foregroundStyle(.secondary) }
                }
                .accessibilityElement(children: .combine)
                Spacer()
                Button { session.step(1) } label: { Image(systemName: "chevron.right") }
                    .accessibilityLabel("Next hole")
                    .disabled(hole >= 18)
            }
            .buttonStyle(.plain)

            if session.numbersShown, let s {
                // CENTER big, FRONT / BACK either side - the phone's own order.
                HStack(alignment: .lastTextBaseline) {
                    number("F", s.onGreen ? nil : s.front, label: "Front", spoken: spoken, size: .title3, onGreen: s.onGreen)
                    number("C", s.center, label: "Center", spoken: spoken, size: .largeTitle)
                    number("B", s.back, label: "Back", spoken: spoken, size: .title3)
                }
                // v1: the phone is the GPS. A locked / backgrounded phone stops measuring (gps-view.js
                // stops location when hidden), so the watch says these are the LAST numbers.
                // 022: plays-like to the center (the phone's own number - wind, elevation).
                if let p = s.plays, !s.onGreen, p != s.center {
                    Text("Plays \(p)").font(.footnote.weight(.semibold)).foregroundStyle(.yellow)
                        .accessibilityLabel("Plays like \(p) \(spoken)")
                }
                Text(session.reachable ? unit : "\(unit) · last from iPhone")
                    .font(.caption2).foregroundStyle(session.reachable ? AnyShapeStyle(.secondary) : AnyShapeStyle(Color.orange))
                    .accessibilityLabel(session.reachable ? "" : "These are the last yardages from your iPhone")
                if s.tournament {
                    Label("Tournament", systemImage: "trophy").font(.caption2).foregroundStyle(.secondary)
                        .accessibilityLabel("Tournament mode: distance only")
                }
            } else if let s, !s.entitled {
                // GPS Map (007): read from the phone. No purchase is offered on the watch.
                Text("Yardages need GPS Map on your iPhone").font(.footnote).multilineTextAlignment(.center)
            } else {
                Text(session.reachable ? "Getting yardages…" : "Open HardPan GPS on your iPhone")
                    .font(.footnote).multilineTextAlignment(.center).foregroundStyle(.secondary)
            }

            NavigationLink {
                ScoreEntryView(hole: hole, par: s?.par ?? 4, saved: s?.hole == hole ? s?.score : nil)
            } label: {
                Text(scoreLabel(hole)).frame(maxWidth: .infinity)
            }
            .accessibilityHint("Enter your score for hole \(hole)")
        }
        .padding(.horizontal, 4)
    }

    private func scoreLabel(_ hole: Int) -> String {
        if let n = session.unsent[hole] { return "Score \(n) · sending" }
        if let s = session.state, s.hole == hole, let n = s.score { return "Score \(n)" }
        return "Enter score"
    }

    private func number(_ letter: String, _ v: Int?, label: String, spoken: String, size: Font, onGreen: Bool = false) -> some View {
        VStack(spacing: 0) {
            Text(letter).font(.caption2).foregroundStyle(.secondary)
            Text(onGreen ? "ON" : (v.map(String.init) ?? "—"))
                .font(size).monospacedDigit().lineLimit(1).minimumScaleFactor(0.5)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(onGreen ? "\(label): on the green" : (v.map { "\(label), \($0) \(spoken)" } ?? "\(label): no number"))
    }
}
