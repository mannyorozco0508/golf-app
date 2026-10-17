# For the iOS session — from android-gps (2026-10-17)

Written by the Android session. **Nothing below was fixed on android-gps.** These are
shared-code defects found during Android emulator QA. The code paths are platform-free,
so iOS should behave the same way. That is an inference from the code; none of these
were reproduced on an iPhone.

## Shared bugs, not fixed

1. **Talking Stick (South – Piipaash) is "GPS READY" but cannot start.**
   Tapping it shows "Could not start … No scorecard for Talking Stick Golf Club
   (South - Piipaash) yet."
   - `front-door.js` `startRound()`: `ready(key)` is true through the GolfAPI link, but
     the card comes only from `sharedCard()` (`global_courses/<key>`) or `presetCard()`
     (`coursePresets` / `nineHoleLoops`), and this course has neither.
   - The bundled GolfAPI record (`012141520639939791440`) does carry `pars` and `hcp`
     for all 18 holes.
   - Repro on the emulator: mock location 33.539874, -111.870432 → GPS → "You're at"
     Talking Stick → Start round.

2. **"No rated tees for this course" when the bundle has three.**
   - The quick-start sheet for the same course shows "No rated tees" (`front-door.js:581-585`,
     `loadTees(c.key)`).
   - The bundled GolfAPI record lists Black 71.5/125, Jade 69.8/120 and Gold 69.1/120.

3. **The trip builder drops "&" from course names.**
   - `trip-builder.js:100`: `.replace(/[,&]+/g, ' ')`, so "Caledonia Golf & Fish Club"
     becomes "Caledonia Golf Fish Club".
   - It is then "not a saved course".
   - The `&` strip is meant for golfer lists, not the DAY line's course.

4. **A cold start after spectating reopened the spectated round, not Main.**
   - Sequence: join 5RZ8GE (spectate) → Round Menu → Home → force-stop → launch.
     The app opened `index.html?game=5RZ8GE&spectate=1`.
   - Earlier cold starts opened Main (`home.html`) as designed.
   - Not root-caused.

5. **"Trial" wording on the Account sheet, with nothing to buy.**
   - `admin.html:1258` `#oauth-lead`: "One tap. Your rounds and your trial stay on this
     account."
   - `admin.html:1267` `#email-link-lead`: "… the free trial and a founder pass stay
     with …"
   - `admin.html` `oauthTap()` success line: "… your rounds and trial stay on this account."
   - Mailbox 005 removed trial / founder-pass wording "anywhere a golfer reads it". These
     three survived, and paywall and iap are both off.

6. **The Vegas row uses a dice icon.**
   - `front-door.js:1128` (`ALL_GAMES`): `{ id: 'vegas', ico: '🎲', … }`.
   - fa6e9d7 retired casino imagery (Vegas got 🔢). This list was missed, and 🎲 reads
     as gambling.

7. **The `auth-boot.js` start race. Fixed for Android only; check iOS.**
   - `auth-boot.js` starts on `setTimeout(0)`, on the assumption that this runs after the page's inline `firebase.initializeApp`.
   - Android's WebView ran it mid-parse, `fb.auth()` threw "no Firebase App", `authReady` rejected, and admin.html refused setup to the round's own creator.
   - Android now tries once more after `load` (job 003). iOS is unchanged.
   - If an iPhone ever shows "This round's setup belongs to its organizer" on a round it just made, this is why.

8. **The players-first hand-off doesn't continue (seen on Android; iOS not checked).**
   - Repro: Vegas from Add a game with one golfer → Players step → add 3 golfers → "Save golfers · set up Vegas ›".
   - The players save to the round (4 in RTDB), but the hand-off doesn't happen: `hardpan_ag_next` stays at `stage: 'players'`, so `showRoundReadyScreen` → `afterSave` never ran. `saveSettings()` stopped early with no visible message.
   - Not root-caused: the round created from the GPS door has no `courseKey`, only `courseName`, which may matter.
   - My tap automation was slow on this run, so treat it as unproven until reproduced by hand.

## Shared files android-gps changed (all Android-gated)

Every behaviour change asks `Capacitor.getPlatform() === 'android'`. iOS and the web take
the old path unchanged, and `android_gps_fixes_test.js` asserts the iOS half of each fix.

| File | What changed |
|---|---|
| `front-door.js` | `positionAndroid()`: Android asks once for precise location; Back closes front-door and GPS sheets, and Home's GPS/Games view (`armBack`) |
| `gps-view.js` | `backLayer()` / `back()` added to the API (called only by Android Back) |
| `pwa-boot.js` | `androidTopLevel()`: on Android, an empty press at a page's top level goes to Home |
| `auth-boot.js` | `retryAfterLoad()`: on Android only, "no Firebase App" waits for `load` and signs in once more (job 003) |
| `admin.html` | `isAndroidShell()`; no Apple/Google/Link buttons, email card shown; Notifications card hidden; Setup Coach back probe |
| `index.html` | Round Menu sheet back probe (Android only) |
| `capacitor.config.ts` | `plugins.SystemBars.insetsHandling = 'disable'` (Android reads it; Capacitor iOS has no such key) |
| `native_bundle_freshness_test.js` | GPS mode for the Android bundle, declared by `@capacitor/geolocation` in the Android allowlist; the iOS bundle is still held to Consumer |

**`sw.js` `CACHE_VERSION` was not bumped.** Native shells never register the service
worker (`pwa-boot.js` `registerServiceWorker` → `'skipped-native'`), and every change is
inert on the web. Bump it at merge time if the repo rule should apply anyway; bumping it
here would only have conflicted with the iOS branches' `sw.js`.
