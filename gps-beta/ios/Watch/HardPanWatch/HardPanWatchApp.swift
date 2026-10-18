// HardPanWatchApp.swift - the watchOS app's entry point (SwiftUI, watchOS 10+).
//
// SCAFFOLD (feature 10, docs/WATCH-APP-PLAN.md). Not in the Xcode project and never compiled.
// Created by Manny's File > New > Target > watchOS > App ("HardPanWatch") after the LLC migration;
// Xcode generates its own HardPanWatchApp.swift - replace it with this one.

import SwiftUI

@main
struct HardPanWatchApp: App {
    // One session for the app's life: WCSession must be activated early, before any view needs it.
    @StateObject private var session = WatchSessionManager.shared

    var body: some Scene {
        WindowGroup {
            NavigationStack {
                ContentView()
            }
            .environmentObject(session)
        }
    }
}
