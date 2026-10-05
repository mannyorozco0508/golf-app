// ============================================================================
// HardPanLiveActivity.swift — THE LOCK SCREEN AND THE DYNAMIC ISLAND
//
// WIDGET EXTENSION TARGET ONLY. This file must NOT be a member of the app
// target: a WidgetBundle in the app is a build error on some Xcode versions and
// a silently dead widget on others.
//
// THREE PRESENTATIONS, and iOS picks:
//   LOCK SCREEN / BANNER   the full card: name, course, score, thru, match line.
//   DYNAMIC ISLAND EXPANDED  the same, in three regions.
//   COMPACT / MINIMAL      the score to par alone. A Dynamic Island pill is
//                          about 50 points wide; anything else is unreadable.
//
// NO COLOUR CODING OF MONEY, because there is no money here. Green is the
// app's brand green and says "HardPan", not "winning".
// ============================================================================
import ActivityKit
import SwiftUI
import WidgetKit

@available(iOS 16.1, *)
struct HardPanLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: HardPanRoundAttributes.self) { context in
            // THE LOCK SCREEN / BANNER PRESENTATION
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(context.attributes.golferName)
                        .font(.headline)
                    Spacer()
                    Text(context.state.toPar)
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .monospacedDigit()
                }
                HStack {
                    Text(context.attributes.courseName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Spacer()
                    Text("thru \(context.state.thru)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                if !context.state.matchLine.isEmpty {
                    Text(context.state.matchLine)
                        .font(.footnote)
                        .fontWeight(.semibold)
                        .lineLimit(1)
                }
            }
            .padding(14)
            .activityBackgroundTint(Color(red: 0.059, green: 0.298, blue: 0.227))   // --brand-green
            .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.attributes.golferName)
                        .font(.caption).fontWeight(.semibold).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.toPar)
                        .font(.title2).fontWeight(.bold).monospacedDigit()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Hole \(context.state.hole) · thru \(context.state.thru)")
                            .font(.caption2).foregroundStyle(.secondary)
                        if !context.state.matchLine.isEmpty {
                            Text(context.state.matchLine).font(.caption).lineLimit(1)
                        }
                    }
                }
            } compactLeading: {
                Text("⛳")
            } compactTrailing: {
                Text(context.state.toPar).monospacedDigit()
            } minimal: {
                Text(context.state.toPar).monospacedDigit()
            }
        }
    }
}

@main
struct HardPanWidgetBundle: WidgetBundle {
    var body: some Widget {
        if #available(iOS 16.1, *) {
            HardPanLiveActivity()
        }
    }
}
