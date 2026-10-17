# Privacy policy: draft (job 003) vs the live version (23 Sep 2026), in plain English

Live: https://golf-app-5a5.pages.dev/privacy.html ("Last updated: 23 September 2026").
Draft: `docs/legal/privacy-policy-DRAFT.html`. **Not deployed.** Publishing needs Manny's explicit OK.

## What the live policy says that is no longer true
| Live says | Today's apps actually | Draft says |
|---|---|---|
| "HardPan has no accounts and asks for no email address." "No account, password, email address or phone number." | Every device gets an anonymous Firebase account. Email-link sign-in is optional (plus Apple/Google on iPhone). | Anonymous account id, automatic; email only if you choose to sign in. |
| "No device location or GPS." | GPS yardages use precise location in the foreground. A green you set is saved, without identity. | A whole "Your location" section: foreground only, stays on the phone, the green-pin exception, works without it. |
| Talks about the App Store listing and version 1.0.3. | Out of date, and iPhone-only. | Platform-neutral; no store or version talk. |
| No deletion of an account (there were no accounts). | In-app Account → Delete account exists. | Deleting your data: account in-app, round via End & Wipe, anything else by email; links the new deletion page. |

## Services added to the list
- **Firebase Authentication and Cloud Functions** (live listed only the Realtime Database).
- **GolfAPI** (golfapi.io), for GPS course search through our server.
- **Esri ArcGIS and USGS**: map tiles of the course, plus USGS heights for "plays like".
- **US National Weather Service**: the course's point (never the golfer's) for wind.
- **Apple, iPhone only**: Sign in with Apple, push notifications if allowed.
- Kept from live: GolfCourseAPI via the Cloudflare Worker, for scorecard lookups.

## Kept from live (still true)
No ads, no analytics or tracking SDK, nothing sold. HardPan never handles money (the "who owes whom" summary is information). Rounds are shared by code. On-device preferences stay on the device. Children under 13. Firebase stores the round data as a service provider.

## Deliberately left out (not live today)
- No purchases, subscriptions, trials or founder-pass sale. "No purchases in the app today."
- No Google Play Billing, Apple IAP or RevenueCat.
- No WeatherKit (it's off).

Add these back when they ship.

## Open points for Manny
1. Publishing date and who signs off.
2. "Rounds are kept… until the organizer wipes the round or asks us to." Is there a retention limit you want to promise?
3. The draft says an important change "is shown in the app". Only keep that if you'll actually do it.
