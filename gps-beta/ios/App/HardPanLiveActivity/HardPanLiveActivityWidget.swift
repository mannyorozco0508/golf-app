// HardPanLiveActivityWidget.swift - the HardPan GPS Live Activity (mailbox 022 feature 1).
// Lock Screen: course · Hole N · Par; F / big MIDDLE / B; plays-like; thru / score; money only with bets.
// Dynamic Island: compact = the middle number; expanded = F / M / B + hole; minimal = the middle number.

import SwiftUI
import WidgetKit
import ActivityKit

private let lime = Color(red: 0.83, green: 0.95, blue: 0.49)     // #d4f27c, the app's lime
private let dim = Color.white.opacity(0.65)

private func n(_ v: Int?) -> String { v.map { String($0) } ?? "–" }

@available(iOS 16.1, *)
struct HardPanLockScreen: View {
    let context: ActivityViewContext<HardPanRoundAttributes>
    var body: some View {
        let s = context.state
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("HOLE \(s.hole)").font(.system(size: 13, weight: .heavy)).foregroundColor(dim)
                if let p = s.par { Text("· PAR \(p)").font(.system(size: 13, weight: .heavy)).foregroundColor(dim) }
                Spacer()
                Text(context.attributes.course).font(.system(size: 13, weight: .semibold)).foregroundColor(dim).lineLimit(1)
            }
            HStack(alignment: .lastTextBaseline, spacing: 14) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("B \(n(s.back))").font(.system(size: 17, weight: .bold)).foregroundColor(.white)
                    Text("F \(n(s.front))").font(.system(size: 17, weight: .bold)).foregroundColor(.white)
                }
                VStack(alignment: .leading, spacing: 0) {
                    Text("MIDDLE").font(.system(size: 11, weight: .heavy)).foregroundColor(dim)
                    Text(n(s.mid)).font(.system(size: 52, weight: .heavy, design: .rounded)).foregroundColor(lime).minimumScaleFactor(0.6)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 3) {
                    if let p = s.plays { Text("Plays \(p)\(s.unit)").font(.system(size: 15, weight: .bold)).foregroundColor(.white) }
                    if let t = s.thru { Text(t).font(.system(size: 14, weight: .semibold)).foregroundColor(.white) }
                    if let m = s.money { Text(m).font(.system(size: 13, weight: .semibold)).foregroundColor(lime) }
                }
            }
            if s.fromTee { Text("Yards from the tee").font(.system(size: 11, weight: .semibold)).foregroundColor(dim) }
        }
        .padding(14)
        .activityBackgroundTint(Color(red: 0.04, green: 0.06, blue: 0.05))
        .activitySystemActionForegroundColor(lime)
    }
}

@available(iOS 16.1, *)
struct HardPanLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: HardPanRoundAttributes.self) { context in
            HardPanLockScreen(context: context)
        } dynamicIsland: { context in
            let s = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("HOLE \(s.hole)").font(.system(size: 12, weight: .heavy)).foregroundColor(dim)
                        if let p = s.par { Text("Par \(p)").font(.system(size: 14, weight: .bold)) }
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("B \(n(s.back))").font(.system(size: 15, weight: .bold))
                        Text("F \(n(s.front))").font(.system(size: 15, weight: .bold))
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(n(s.mid)).font(.system(size: 40, weight: .heavy, design: .rounded)).foregroundColor(lime)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        if let p = s.plays { Text("Plays \(p)\(s.unit)").font(.system(size: 13, weight: .semibold)) }
                        Spacer()
                        if let t = s.thru { Text(t).font(.system(size: 13, weight: .semibold)).foregroundColor(dim) }
                    }
                }
            } compactLeading: {
                Text("H\(s.hole)").font(.system(size: 14, weight: .heavy)).foregroundColor(dim)
            } compactTrailing: {
                Text(n(s.mid)).font(.system(size: 15, weight: .heavy, design: .rounded)).foregroundColor(lime)
            } minimal: {
                Text(n(s.mid)).font(.system(size: 13, weight: .heavy, design: .rounded)).foregroundColor(lime)
            }
        }
    }
}

@main
struct HardPanLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        if #available(iOS 16.1, *) { HardPanLiveActivityWidget() }
    }
}
