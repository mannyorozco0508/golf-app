# HardPan GPS on Apple Watch - plan (feature 10)

Status (2026-10-18, branch `gps-plus-watch`): **plan + scaffold only.** No Xcode target exists.
The Swift files below are on the branch but are **not in `project.pbxproj`**, have **never been
compiled** (no xcodebuild / simulator was allowed while the developer account moves to the LLC),
and the JS hook in `gps-view.js` does nothing until both the native plugin exists **and**
`gps-config.js features.watch` is set to `true` (it ships `false`).

**How Manny tests it on the course:** (after the migration, the clicks below, and `features.watch: true`
in a TestFlight build) open a round in HardPan GPS on the iPhone, go to GPS, open HardPan on the
watch - F / C / B should match the phone within a yard; tap > on the watch and the phone's hole
should follow; enter a score on the watch, Save, and check the phone's card shows it (then do the
same with the phone in airplane mode and confirm it lands when the signal comes back).

---

## List exactly what Manny will click (after the LLC migration is finished)

Do these in order. Nothing here can be done before the new LLC team is live.

**A. Developer portal (developer.apple.com > Certificates, IDs & Profiles), signed in as the LLC team**
1. Identifiers > + > App IDs > App > Description `HardPan GPS Watch (beta)`, Bundle ID (Explicit)
   `com.rattlegolf.gpsbeta.watchkitapp`. No capabilities ticked. Continue > Register.
2. Same again for the release app: `HardPan Watch`, `com.rattlegolf.app.watchkitapp`.
   (Skip both if Xcode's "Automatically manage signing" registers them for you in step B6 - it usually does.)
3. Nothing else: no App Group, no new keys, no new entitlements for v1.

**B. Xcode (open `gps-beta/ios/App/App.xcodeproj`, on branch `gps-plus-watch`)**
1. File > New > Target... > **watchOS** tab > **App** > Next.
2. Product Name: `HardPanWatch`. Team: **the new LLC team**. Organization Identifier: `com.rattlegolf`.
   Bundle Identifier: Xcode shows `com.rattlegolf.gpsbeta.watchkitapp` - leave it.
   Watch App type: **Watch App for Existing iOS App**, Companion: **App**.
   Interface: SwiftUI. Language: Swift. Include Tests: off. Include Notification Scene: off. > Finish.
   If asked "Activate HardPanWatch Watch App scheme?" > Activate.
3. In the Project navigator, delete the two files Xcode generated in the new `HardPanWatch Watch App`
   group (`HardPanWatchApp.swift`, `ContentView.swift`) > Move to Trash.
4. Right-click the `HardPanWatch Watch App` group > Add Files to "App"... > select
   `gps-beta/ios/Watch/HardPanWatch/` (all four .swift files) and `gps-beta/ios/Watch/Shared/WatchProtocol.swift`.
   Uncheck "Copy items if needed". Targets: tick **HardPanWatch Watch App** only. > Add.
5. Right-click the `App` group > Add Files to "App"... > select the three files in
   `gps-beta/ios/App/PhoneBridge/` and `gps-beta/ios/Watch/Shared/WatchProtocol.swift` again.
   Targets: tick **App** only. > Add. (WatchProtocol.swift ends up in BOTH targets - check its
   File inspector > Target Membership shows App and HardPanWatch Watch App ticked.)
6. Select the project > target **HardPanWatch Watch App** > Signing & Capabilities:
   Automatically manage signing ON, Team = **LLC team**. Bundle Identifier `com.rattlegolf.gpsbeta.watchkitapp`.
   General > Minimum Deployments: watchOS 10.0. Add no capabilities (no App Group, no HealthKit in v1).
7. Target **App** > General > Frameworks, Libraries...: nothing to add (WatchConnectivity is a system
   framework, linked automatically). Build Phases: confirm **Embed Watch Content** lists
   `HardPanWatch Watch App.app` (Xcode added it in step 2). Signing: the App target's team must be the
   **same LLC team** as the watch target.
8. Open `App/SceneDelegate.swift`, change one line:
   `window?.rootViewController = CAPBridgeViewController()` -> `window?.rootViewController = HardPanBridgeViewController()`.
9. Open `App/AppDelegate.swift`, in `didFinishLaunchingWithOptions` before `return true` add:
   `PhoneWatchSession.shared.activate()` (so a score sent while the app was closed is kept).
10. Scheme **App** > any iPhone > Product > Build. Fix whatever the compiler says (this code has never
    been built - expect a few small errors, most likely Swift 6 concurrency warnings in the two
    session managers). Then scheme **HardPanWatch Watch App** > Build.
11. In `gps-config.js` set `features: { ..., watch: true }`, rebuild the web app
    (`node tools/build-gps-app.js && cd gps-beta && npx cap sync ios`), and also update
    `gps_wiring_test.js` / `gps_watch_test.js` (they pin `watch: false`).
12. Product > Archive (scheme App). The archive contains the watch app; Distribute > App Store Connect.

**C. App Store Connect**
1. Nothing new to create: a companion watch app ships **inside** the iPhone app's build and record.
2. On the app's version page, an **Apple Watch** section appears after the first build with the watch
   app is uploaded: add watch screenshots (required for review; 41/45/49 mm sizes as listed there).
3. TestFlight: the build installs on the watch from the Watch app on the iPhone (or automatically).
4. For the release app (`com.rattlegolf.app`): the same B steps in that project with bundle id
   `com.rattlegolf.app.watchkitapp`, when the beta has proven it.

---

## 1. What v1 is

A watchOS companion app (SwiftUI, watchOS 10+) with one screen:

- **Hole n, Par p**, with < and > (hole -/+).
- **F / C / B** for that hole - the same three numbers the phone's GPS screen shows, in the
  golfer's units (yd or m), "ON" for front when on the green, "—" when there is no number.
- **Enter score** -> a score screen: the golfer's **own** score, - / + (or the Digital Crown),
  starting at the saved score or par, **Save**.

The watch has **no GPS of its own in v1**: the phone measures, the watch displays. A standalone
watch-GPS mode is phase 2 (section 9).

## 2. Data flow

```
gps-view.js render()  --sendHole(payload)-->  HardPanWatchPlugin (Capacitor, Swift)
   (on every change)                              |
                                                  v
                                PhoneWatchSession.sendHole: WCSession.updateApplicationContext
                                (+ sendMessage when the watch is reachable)
                                                  |
                                                  v
                                WatchSessionManager (watch) -> ContentView shows F/C/B

watch Save  -> WatchSessionManager.saveScore -> sendMessage (reachable) / transferUserInfo (queued)
            -> PhoneWatchSession.received -> HardPanWatchPlugin.notifyListeners('watchScore')
            -> gps-view.js watchScore(ev) -> S.saveScore(myGolferId, hole, "n")
            -> index.html saveScore()  - THE APP'S ONE SCORE WRITE: permissions, the offline
               queue (offline-queue.js), and the database rules all apply exactly as for a tap.
watch < / > -> 'watchHole' -> gps-view.js -> S.gotoHole(n) (the card follows) -> render -> sendHole
```

- **The phone owns the round.** The watch never talks to Firebase, never holds a token, never writes.
- **Who the score is for:** the phone's own golfer (`scoreFor()` in gps-view.js - the golfer picked
  on the GPS screen, else the signed-in player). The watch has no golfer picker in v1.
- **Spectators:** a spectating phone (`HardPanDoors.spectating()`) writes nothing from the watch.
- **Not wired yet (deliberately):** `index.html` does not pass `saveScore` to `HardPanGps.mount` yet,
  so a watch score is ignored even with the switch on. Turning it on is one line in
  `gpsFollowHoleView()`'s mount options: `saveScore: (pid, h, v) => saveScore(pid, h, v),`
  (done with the switch, after the native build works - it touches the scorecard, so it waits).

## 3. Message formats (`gps-beta/ios/Watch/Shared/WatchProtocol.swift`)

All messages are property-list dictionaries; `v` = protocol version (1). **No coordinate ever crosses** -
numbers only (CLAUDE.md: no location data leaves the phone; the watch is the golfer's own paired device,
and even so only yardages go).

Phone -> watch, `kind: "hole"` (applicationContext - latest wins):

| key | type | meaning |
|---|---|---|
| hole | Int | current hole |
| par | Int? | the card's par |
| front / center / back | Int? | in `units`; absent = no number (never a guess) |
| units | "yd" \| "m" | the golfer's GPS units |
| onGreen | Bool | front shows "ON" |
| entitled | Bool | GPS Map (007). false = front/center/back are absent |
| tournament | Bool | tournament mode is on (distance only) |
| score | Int? | the golfer's own saved score for this hole |
| round | String | the round's code |

Phone -> watch, `kind: "clear"`: no round open.

Watch -> phone:
- `kind: "score"`: `hole` (1-36), `strokes` (1-20), `round`, `id` (UUID, de-duplicates a message
  that was also queued), `at` (seconds since 1970).
- `kind: "hole"`: `hole`, `round` - "go to this hole".

The JS payload (`sendHole({...})`) is the same keys; `gps_watch_test.js` pins it exactly.
The phone rejects a score whose `round` is not the open round (a score queued yesterday is never written today).

## 4. Phone app backgrounded / not running

- **Phone in the golfer's hand / cart mount (app foreground, GPS side up):** live numbers.
- **Phone locked or app backgrounded:** gps-view.js stops location on `visibilitychange: hidden`
  (on purpose - battery, and Apple's "While Using" location). The watch keeps the **last** numbers and,
  once the phone is unreachable, says "· last from iPhone" in orange. v1 does **not** add background
  location to the phone (that would mean the `location` background mode in Info.plist, a new
  App Review conversation and a battery cost) - the watch's own GPS (phase 2) is the answer to a
  phone in the bag.
- **Score entered with the phone locked / app suspended / app not running:** the watch uses
  `transferUserInfo` (watchOS queues it and delivers it in order). On the phone,
  `PhoneWatchSession` (activated in AppDelegate) receives it; if the web view is not listening yet it is
  **kept** in UserDefaults (max 50) and gps-view.js reads `pending()` when the GPS screen next mounts,
  writing each through the same `saveScore`. Plugin events use `retainUntilConsumed`.
- **Phone offline (no signal):** irrelevant to the watch link (Bluetooth/Wi-Fi peer); the score goes to
  `saveScore`, which queues it in the offline queue like any other.
- **Watch app installed, no phone round open:** "Open a round in HardPan GPS on your iPhone".

## 5. Battery

- Phone: no new location work; one small context update per **changed** number (gps-view.js dedupes -
  render runs on every fix, a message goes only when a number, the hole, the score or the
  entitlement changes). `updateApplicationContext` coalesces; `sendMessage` only when reachable.
- Watch: no GPS, no background refresh, no complications in v1; the screen is plain text.
- Phase 2 (watch GPS) is the expensive one: an `HKWorkoutSession` (golf) keeps GPS alive; budget and
  test a full 18 on a Series 6 / SE before shipping it.

## 6. GPS Map gating (mailbox 007)

- The watch has **no store and no paywall**. It reads entitlement from the phone: `entitled` in the
  hole message, computed by the phone's one check (`hasGpsPro()`).
- Not entitled: the phone sends **no numbers** (and the plugin and the watch both drop any that arrive,
  belt and braces); the watch says "Yardages need GPS Map on your iPhone". Hole +/- and score entry still
  work (scoring is free on the phone too).
- An expired trial mid-round: the next render sends `entitled: false`, the numbers disappear.
- Phase 2 (watch GPS) must still be gated by the phone's entitlement (the phone sends the hole's
  green only when entitled).

## 7. Tournament mode

Rules of Golf 4.3 allows distance-only devices. The phone already strips wind / plays-like / slope /
clubs in tournament mode; the watch never had them. The watch shows F/C/B plus a "Tournament" label
(read from the phone's `tournament()`: the organizer's round setting, else the phone's switch).
Nothing on the watch can turn it off.

## 8. Accessibility

- Every number is one VoiceOver element: "Center, 243 yards", "Front: on the green", "Back: no number".
- Buttons: "Previous hole", "Next hole", "One more stroke", "One fewer stroke", Save with a hint.
- Dynamic Type fonts with `minimumScaleFactor` so the largest sizes fit a 41 mm screen; `monospacedDigit`
  so numbers do not jump.
- Digital Crown for the score (haptic per stroke) for golfers with gloves on.
- Never colour alone: the stale state is a word ("last from iPhone"), orange is extra.

## 9. Later: standalone (watch-only GPS)

Phase 2: the phone sends the current hole's **green points** (front / center / back - course data, not
the golfer's location) only when entitled; the watch measures from its own `CLLocationManager`
(While Using, inside a golf `HKWorkoutSession` for background GPS) with the same haversine as
gps-geo.js. Needs: `NSLocationWhenInUseUsageDescription` in the watch Info.plist, HealthKit capability +
workout background mode on the watch target, a privacy-policy line, App Review notes. Phase 3: the whole
course's greens cached on the watch (true phone-in-the-car play) and a complication with center yardage.

## 10. Testing plan

- **Now (on the branch):** `gps_watch_test.js` - with a stubbed `Capacitor.Plugins.HardPanWatch`:
  the exact payload; nothing sent with the switch false or no plugin; dedupe; meters; unentitled = no
  numbers; tournament flag; no coordinate in the payload; watch hole change; watch score through the
  host's `saveScore` for the phone's own golfer only; bad / other-round / spectator scores write nothing;
  kept scores drained on mount; the scaffold is not in `project.pbxproj`. `gps_wiring_test.js` pins
  `features.watch === false`.
- **After the migration, in Xcode:** both schemes build; run on a paired iPhone + watch (simulator pair
  first): numbers match the phone; units switch; hole +/- both ways; score while reachable; score with the
  phone locked (arrives on unlock); score with the phone app force-quit (kept, written on next GPS open);
  score in airplane mode (offline queue); a spectator phone; an unentitled phone; tournament round;
  VoiceOver pass on the watch; largest text size.
- **On the course:** one full 18 (see the line at the top); note battery % on both devices at the start
  and end.

## Files on the branch (scaffold, not in the Xcode project)

| file | target (later) | what |
|---|---|---|
| `gps-beta/ios/Watch/Shared/WatchProtocol.swift` | App **and** watch | keys, `HoleState`, `WatchScore` |
| `gps-beta/ios/Watch/HardPanWatch/HardPanWatchApp.swift` | watch | `@main` SwiftUI app |
| `gps-beta/ios/Watch/HardPanWatch/ContentView.swift` | watch | F/C/B, hole +/-, Enter score |
| `gps-beta/ios/Watch/HardPanWatch/ScoreEntryView.swift` | watch | - / + / Crown, Save |
| `gps-beta/ios/Watch/HardPanWatch/WatchSessionManager.swift` | watch | WCSession, send / receive |
| `gps-beta/ios/App/PhoneBridge/PhoneWatchSession.swift` | App | WCSession on the phone, kept scores |
| `gps-beta/ios/App/PhoneBridge/HardPanWatchPlugin.swift` | App | Capacitor plugin `HardPanWatch` |
| `gps-beta/ios/App/PhoneBridge/HardPanBridgeViewController.swift` | App | registers the plugin |
| `gps-view.js` (watch section), `gps-config.js` (`watch: false`) | web | sends the hole, takes scores |

No App Group is used: WatchConnectivity carries everything, and an App Group cannot share data
between a phone and a watch anyway.
