# One app: HardPan 2.0 on com.rattlegolf.app (the GPS web build in the live target)

Mailbox 004 (Manny, 2026-10-16): ship the merged GPS + games app as the NEXT VERSION of the live
listing com.rattlegolf.app, not a second app (App Store 4.3). Games free; GPS is the paid part.
**This is a plan. The live app's current release (1.0.8, build 19) is not changed.** Nothing here is
archived, uploaded or submitted; each step that touches App Store Connect or a release is Manny's.

## What stays (the live target, ios/)
The live target already has everything the App Store knows the app by, so it is the target we keep:

| | ios/ (com.rattlegolf.app) | gps-beta/ios (com.rattlegolf.gpsbeta) |
|---|---|---|
| Bundle id / team | com.rattlegolf.app / A2Z95T64UU | com.rattlegolf.gpsbeta / same team |
| Version | 1.0.8 (19) | 0.2 |
| Devices | iPhone + iPad (1,2) | iPhone only |
| GoogleService-Info.plist | for com.rattlegolf.app | for gpsbeta |
| Google URL scheme | ...-3baqkon7... (the live app's) | ...-hapolunh... |
| Entitlements | App / AppRelease (Sign in with Apple, push) | identical files |
| Location strings | none (Consumer) | NSLocationWhenInUse / AlwaysAndWhenInUse |
| Web content | www/app (sync-mobile-web.js, GPS off) | gps-beta/www (build-gps-app.js, GPS on) |

The GPS project's only reason to exist was a separate TestFlight app. It stays as the beta until
2.0 ships, then is retired (its bundle id is never submitted for review).

## The change (one branch, after Oct 17, with Manny's OK)
1. **Web content.** Build the GPS web build into the live target's webDir instead of gps-beta/www:
   `GPS_APP_DEST=www/app node tools/build-gps-app.js && npx cap sync ios`
   (build-gps-app.js already honours GPS_APP_DEST; it copies the Consumer shell + the GPS files with
   the GPS flag ON). sync-mobile-web.js (GPS off) is no longer the release path for iOS.
   build-gps-app.js's BUNDLE check (the GoogleService-Info.plist warning) gets a `--bundle
   com.rattlegolf.app` / reads ios/ when GPS_APP_DEST is www/app.
2. **Plugins.** capacitor.config.ts `ios.includePlugins` gains `@capacitor/geolocation` (GPS) and the
   purchase plugin (`@revenuecat/purchases-capacitor`, or `cordova-plugin-purchase`), deliberately,
   as the allowlist comment requires; native_plugin_allowlist_test.js updated with it. Then
   `npx cap sync ios` (writes ios/App/CapApp-SPM/Package.swift).
3. **Info.plist (ios/).** Add the two location strings from gps-beta (NSLocationWhenInUseUsageDescription
   - "HardPan uses your location only while the app is open, to show your yardages to the green. It is
   not sent anywhere unless you choose to set a green where you are standing." - and the
   AlwaysAndWhenInUse one, worded the same way; the app never asks for Always). CFBundleDisplayName
   stays HardPan. ITSAppUsesNonExemptEncryption = false (as gps-beta). Keep UIRequiresFullScreen and
   portrait-only on iPhone; iPad keeps its orientations. arm64 is done (mailbox 004).
   The test "Info.plist: the COMMITTED one is Consumer - no location permission" changes with it.
4. **Google sign-in.** Unchanged: the live target's GoogleService-Info.plist and URL scheme stay
   (they are com.rattlegolf.app's). Do NOT copy gps-beta's.
5. **Sign in with Apple / push.** Unchanged: same team, same entitlements, same bundle id, so the
   existing Apple sign-in identifiers and the APNs key keep working. Push: the gpsbeta FCM app is
   separate; 2.0 uses com.rattlegolf.app's FCM registration (already in its GoogleService plist).
6. **Privacy manifest.** Done (mailbox 004): ios/App/App/PrivacyInfo.xcprivacy, in the target's
   Resources, with Precise Location and Name. The purchase SDK ships its own manifest.
7. **Icon.** Done (mailbox 004): the HP ball + green pin, every iPhone and iPad slot.
8. **Version.** MARKETING_VERSION 2.0, CURRENT_PROJECT_VERSION 20 (build numbers only go up).
9. **App Store Connect (Manny).** The subscription group + yearly product with a 7-day introductory
   free trial; the Paid Apps agreement, tax and banking; the privacy label (answers in the 004
   report); the age rating answers; review notes (docs/APP-REVIEW-NOTES.md); new screenshots
   (USGS imagery - Esri is not used in the iOS app); What's New.

## GPS on iPad
The listing supports iPad, so 2.0 runs on iPad. A cellular iPad has GPS and works like a phone.
A Wi-Fi-only iPad has no GPS chip: iOS can place it from Wi-Fi to tens of metres, or not at all on a
course. The GPS screen must say so cleanly instead of showing wild yardages:
- The accuracy gate already exists (WEAK_GPS_YARDS; set-green refuses a weak fix). On an iPad
  (`navigator.platform`/`userAgent` iPad, or `maxTouchPoints > 1` on a "Macintosh" UA) with no fix
  better than that within the fix timeout, show one sentence: "GPS needs a phone (or a cellular
  iPad) with location - this iPad can't place you on the course. Scores, games and the card all
  work here." and keep the card one tap away. Games and scoring never depend on location.
- Done on this branch in gps-view.js (see the 004 report) once the paywall work there is merged.

## What is NOT done here, and why
- No change to ios/'s webDir, plugins or location strings yet: that IS the release switch, and the
  live 1.0.8 release must not change until Manny OKs 2.0.
- No archive, no TestFlight, no submission.
