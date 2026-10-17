# HardPan Golf for Google Play: submission prep (job 001)

Prepared 2026-10-17 on `android-gps` for the build **0.2 (versionCode 6)**, package `com.rattlegolf.app`,
under the Rattle Golf LLC organization account (still in Google's verification).
Nothing here has been entered in Play Console. Paste from this file once the account is verified.

Ground rules for this first release (Manny, 2026-10-17):
- **GPS is described as included.** The listing never mentions a trial, a subscription, prices or "paid". Paid GPS goes in when Play Billing ships.
- **App access is email sign-in only.** Google and Apple sign-in are hidden on Android (since 0.2 (4)).

---

## 0. GAPS: fix or decide before submitting

| # | Gap | Why it matters | Who |
|---|---|---|---|
| G1 | **Live privacy policy is out of date.** golf-app-5a5.pages.dev/privacy.html says "Last updated 23 September 2026" and "HardPan has no accounts and asks for no email address". It never mentions GPS location, Esri/USGS, the weather service or account deletion. | Play checks the policy against the Data safety form (section 2). As it stands they contradict each other, which is a common rejection. The newer draft in the repo (`privacy.html`, 17 Oct) covers most of it but is iOS-worded (App Store purchases, RevenueCat, Sign in with Apple, iPhone push), has no Google Play wording, and is not deployed. | Manny: approve an Android-correct policy and deploy it |
| G2 | **No account-deletion web page.** golf-app-5a5.pages.dev/delete-account.html is a catch-all that serves the scorecard. rattlegolf.com has no website (mail records only). | Play requires a public URL where a user can ask for account and data deletion without installing the app. | Manny: approve the text in §5; then host it |
| G3 | ~~Organizer locked out of their own round's setup on Android~~. **Fixed in 0.2 (5)** (job 003): `auth-boot.js` tries again after `load` on Android. On the emulator, Vegas with one golfer now opens the Players step for the round's creator. | — | Done |
| G4 | **Server account deletion (`accountDelete`) is not deployed.** Live, it answers 404. | In-app Delete account still works: the client-side delete runs when the function is missing. Data left behind that way: anything the client may not remove (see §5). The Data safety "deletion" answer must match what really happens. | Manny: deploy or accept |
| G5 | **Screenshots.** The 10 in `~/Desktop/HardPan-screenshots-v2/final-10` are iPhone (1320×2868, 2.17:1). Play's limit is 2:1, and they show iOS. | They are rejected at upload. | Done: 8 Android shots on a clean 0.2 (5) install with the 5RZ8GE demo round, in `docs/play-assets/screenshots/` (1080×2160). No test data in any of the 8 (job 011). |
| G6 | **"Trial" and "founder pass" words inside the app.** | | **Mostly fixed in 0.2 (8)** (job 012): Android shows no trial / pass line, and the Account sheet names email only. Still on every platform: the four sign-in notes in `email-link-auth.js` (frozen file, waiting on Manny). iOS unchanged. |
| G7 | **Money-game wording and the gambling policy.** The app records friendly side games (Nassau, skins, Vegas, BBB) and shows who owes whom. It never takes, holds or moves money (confirmed in code, §3). The Vegas row uses a 🎲 icon. | Reviewers can read "bets / who pays who" as gambling. Keep the listing on "side games" and "settle up between yourselves", target 18+, and answer IARC as in §3. Swap the 🎲 icon (`docs/FOR-IOS-SESSION.md` #6). | Manny (icon via the iOS session) |
| G8 | **Shared bugs a reviewer could meet**: a GPS READY course that "cannot start" (Talking Stick South), "No rated tees" when tees exist, "&" dropped in the trip builder. | They look broken in review. The review path in §4 avoids them. | iOS session (`docs/FOR-IOS-SESSION.md`) |
| G9 | **Play App Signing SHA-1 is not known yet.** | Play re-signs with its own app-signing key. When native Google sign-in comes, Firebase needs that SHA-1 too, not only the upload key's. Nothing to do for this release. | Later |

Not gaps (checked): target API 36 meets Play's rule (§7). No ads SDK. No background location. No push on Android. No purchases on Android.

---

## 1. Store listing

**App name** (30 max): `HardPan Golf`

**Short description** (80 max):
`Golf GPS yardages, a live group scorecard, and your side games settled for you.`

**Full description** (4000 max):

```
HardPan is golf for your group: GPS yardages on the course, one live scorecard for everyone, and the side games you already play, worked out for you.

GPS ON THE COURSE
• Front, middle and back of the green from where you stand.
• Tap anywhere on the satellite map for a distance, and see carries to the bunkers.
• Live wind and a "plays like" number for the shot.
• Mark a shot and see how far it went.
• GPS is included. Pick a course near you or search for it, and the round opens on hole 1.

ONE SCORECARD FOR THE GROUP
• Start a round in seconds. Everyone joins with a six-letter game code or a QR code and scores on their own phone.
• Live leaderboard, net and gross, with handicaps.
• Start on the 1st or the 10th tee.
• No signal? Scores are saved on your phone and sent when you're back in range.

YOUR SIDE GAMES, DONE FOR YOU
• Nassau with presses, skins, Vegas, Bingo Bango Bongo, match play, stroke play and more.
• A Points game across one round or a whole trip, with standings.
• At the end, a clear summary of who owes whom from the games your group agreed on. HardPan never handles money; you settle up between yourselves.

TRIPS AND CUPS
• Paste your trip once (days, courses, teams, games) and HardPan sets up every round.
• A team Cup scoreboard across the whole trip.
• A recap image to drop in the group chat.

NO ACCOUNT NEEDED
Open the app and play. Sign in with an email link only if you want your rounds on another phone. Your location is used on your phone to measure yardages; it isn't tracked or sold.

Questions or ideas: support@rattlegolf.com
```

**App category:** Sports. **Tags:** golf, scorecard, GPS. **Contact email:** support@rattlegolf.com (its mail records exist; confirm it is monitored).
**Privacy policy URL:** see §5 (blocked by G1).

Character counts are checked by script; the results are under §8.

---

## 2. Data safety (answers must match the code; checked 2026-10-17 against `6c3f619`)

**Does your app collect or share any of the required user data types?** Yes.
**Is all user data encrypted in transit?** Yes. Firebase, Cloud Functions, Esri, USGS and NWS are all HTTPS.
**Do you provide a way for users to request that their data is deleted?** Yes: in the app (Account → Delete account) and by email (support@rattlegolf.com). The web URL is G2.

"Collected" below means it leaves the phone and reaches us (Firebase).

| Data type (Play category) | Collected? | Shared with third parties? | Required / optional | Purposes | What it really is, in the code |
|---|---|---|---|---|---|
| **Location → Precise location** | **Yes** | No | Optional | App functionality | GPS runs **in the foreground only**; no background permission is requested. The golfer's position stays on the phone (`gps-view.js` privacy contract): it becomes yardages and is never written to Firebase, storage or a URL, with **one exception**. "Set the green here" (Tools) saves the spot the golfer is standing on as that hole's green pin in RTDB. The pin carries no uid or name. Declared because a pin is a precise point the user chose to send. |
| Location → Approximate location | No | No | — | — | Near you is computed on the phone; the position is never sent. |
| **Personal info → Email address** | **Yes** | No | Optional | App functionality, Account management | Only if the user signs in with an email link. Firebase Authentication stores it, and Firebase (Google) sends the link email as our processor. |
| **Personal info → Name** | **Yes** | No | Optional | App functionality | Golfer names typed into rounds, trips and games (the user's own and other people's). Stored in RTDB with the round. |
| **Personal info → User IDs** | **Yes** | No | Required | App functionality, Account management, Fraud prevention | The **anonymous Firebase Auth user id**, created automatically at first launch. It owns the rounds the user creates (`ownerUid`) and counts course lookups (`gps_usage/<uid>`, the daily limit). It carries no name or email unless the user signs in. |
| **App activity → Other user-generated content** | **Yes** | No | Required (to keep score) | App functionality | **Round and score data in the Realtime Database**: course, scores, handicaps, games and their settings, trip and Cup data, game codes, scorekeeper-code hashes, green pins. |
| App activity → In-app search history | No (see note) | No | — | — | Course searches go to our Cloud Function (`gpsSearch`), which asks GolfAPI. The query is not stored with the account. The function counts lookups per uid (above). Flagged as uncertain below. |
| App activity → App interactions | No | — | — | — | No analytics SDK. |
| Device or other IDs | **No** | — | — | — | No push token on Android (no push plugin), no advertising ID, no analytics. |
| App info and performance (crash logs, diagnostics) | **No** | — | — | — | No crash or analytics SDK. |
| Financial info | No | — | — | — | No payments on Android. The app shows who owes whom; no money moves. |
| Photos and videos / Files and docs | No | — | — | — | The recap image and PDF are made on the phone and shared only through the user's own Share sheet. |
| Contacts, Messages, Health, Audio, Calendar, Web browsing | No | — | — | — | — |

**Services the app talks to, and what they receive** (list these on the policy page):
- **Google Firebase** (Authentication, Realtime Database, Cloud Functions): the account (anonymous uid; email if the user signs in), round data, and course searches. Google processes it as our service provider.
- **GolfAPI** (golfapi.io), through our Cloud Functions: the course search text and course ids. Never the golfer's position or name.
- **Esri ArcGIS (World Imagery) and USGS (The National Map)**: map tiles for the course area on the GPS screen, plus the phone's IP address. The map is framed on the hole, not the golfer. One edge case: a hole with no course data is framed on the golfer's dot so a green can be tapped, so those tile requests describe the area around the golfer. **USGS EPQS** (elevation) receives course points for plays-like heights.
- **US National Weather Service** (api.weather.gov): the course's point, to three decimals, for wind. Never the golfer's position. Also the IP address.
- Not used on Android: Apple WeatherKit (off), push notifications, Google/Apple sign-in, RevenueCat or any purchase service, Google satellite tiles (key empty), OpenStreetMap lookups (off).

**Shared?** Under Play's definitions, data sent to service providers that process it for us (Firebase, our functions, GolfAPI) is not "sharing". **Recommended:** answer "not shared" for every type. Esri, USGS and NWS receive only course-area requests and an IP address, which Play does not count as a collected data type. Name them in the privacy policy anyway (G1).

**Flagged as uncertain (decide, don't guess):**
1. **Green pins** are a precise point from the user, without identity. Declaring "Precise location: collected, optional, not linked" is the conservative answer, and the one above.
2. **Course search** text passes through our function to GolfAPI and is not stored. If you'd rather be conservative, add "In-app search history: collected, not stored long-term (ephemeral)".
3. **Edge-case tiles** around the golfer for a hole with no data: an IP plus a map area at a third party. Kept out of the form as above. Revisit if Play asks.

---

## 3. Content rating (IARC questionnaire)

Category: **Utility, productivity, communication or other**. (Sports/game categories ask about game content this app does not have.)

| Question | Answer | Basis |
|---|---|---|
| Violence, blood, fear | No | — |
| Sexuality, nudity | No | — |
| Profanity / crude humour | No | — |
| Controlled substances (drugs, alcohol, tobacco) | No | — |
| **Real-money gambling** (does the app let users wager or win real money?) | **No** | No payment code on Android (no billing library, no purchase plugin, `iap: false`). The app records the group's own friendly games and shows a summary of who owes whom; it never takes, holds, pays or moves money. Venmo appears only as words in trip help text; there is no payment link in this build. |
| **Simulated gambling** (casino-style games, chance-based rewards) | **No** | The games are scored from real golf shots. No chance mechanics, no chips or odds. (Swap the 🎲 icon, G7.) |
| Users can interact / exchange content | **Yes, limited** | Players in the same round see each other's names and scores via a game code. No chat, no public feed, no profiles. |
| Shares the user's location with other users | **No** | Position stays on the phone. Green pins carry no identity. |
| Digital purchases | No | Nothing for sale on Android. |
| Unrestricted internet access / web browser | No | The app opens its own pages. Privacy and Terms open as web pages. |

**Expected rating:** Everyone / PEGI 3. **Target audience** (App content): **18 and over**. This is a choice, not a requirement: the money-game theme reads adult, and it keeps the app out of the Families policy.
**Ads:** No. **News app:** No. **Government app:** No. **Financial features:** none. **Health:** none.

---

## 4. App access (for the reviewer)

**Answer: "All functionality is available without special access."** No login is needed. The app creates an anonymous account by itself, and email sign-in is optional (only to move rounds to another phone).

Paste into Play Console → App content → App access → "Instructions":

```
No login is needed. HardPan works without an account.

To see a round in progress: on Home tap "Have a game code?", enter 5RZ8GE and tap Join. This opens a sample round at Caledonia Golf & Fish Club (4 test golfers, 3 holes played) as a spectator: the scorecard, the leaderboard and its friendly games ($5 Nassau, skins, a closest-to-the-pin pool). Results shows who owes whom; the app never moves money.

To try GPS: on Home tap GPS, then pick any course marked GPS READY (or search "Caledonia"). The round opens on the GPS map. Away from the course, yardages are measured from your real position, so they are large numbers; that is expected. Tap anywhere on the map for a distance. GPS is included; there is nothing to buy.

Optional sign-in: Home → Sign in → enter an email address → "Email me a sign-in link", then paste the link from that email into the app and tap Finish sign-in. Google and Apple sign-in are not offered on Android.

Account deletion: Home → Sign in (Account) → Delete account (shown once signed in).
```

**Reviewer test account recipe** (only if Play asks for credentials):
1. Create a mailbox the reviewer can read, for example a dedicated Gmail address you control (name it something like a HardPan review account). Email-link sign-in needs inbox access, so a password alone is useless. The reviewer would need the mailbox password, which most teams avoid. Prefer the "no login needed" answer above.
2. If you do create one, sign in with it once on the emulator to make the account.
3. Put the address and the mailbox password **only** in Play Console → App access → "Add instructions / credentials". **Never** in this repo, the mailbox, or a commit.

(G3 fixed in 0.2 (5).)

---

## 5. URLs

| What | Status | URL / path |
|---|---|---|
| Privacy policy | **Exists but outdated (G1)** | https://golf-app-5a5.pages.dev/privacy.html, live and dated 23 Sep 2026. Deploy an Android-correct version before submitting. |
| Terms of use | Exists (live) | https://golf-app-5a5.pages.dev/terms.html. The repo version changed since; check before deploy. |
| Support | Exists | https://golf-app-5a5.pages.dev/support.html, with support@rattlegolf.com |
| **Account deletion (web)** | **Missing (G2)** | Proposed: `https://golf-app-5a5.pages.dev/delete-account.html`, or rattlegolf.com once it has a site (today: no website, mail records only). |
| In-app deletion | Exists | Home → Sign in (Account) → **Delete account**: two taps, with a warning. It works today through the client path; `accountDelete` (server) is not deployed (G4). |
| Developer website | Optional | None today. Play does not require one; the organization account may want it. |

**What the deletion page must say** (Play's rule; text for Manny to approve):
> **Delete your HardPan account (Rattle Golf LLC)**
>
> In the app: open HardPan → Sign in (Account) → Delete account, and confirm.
> No access to the app? Email support@rattlegolf.com from the address you signed in with, with the subject "Delete my HardPan account". We delete it within 30 days.
>
> We delete:
> - your account (sign-in email and user id)
> - your organizer record and saved groups
>
> We keep:
> - rounds other golfers are part of. They keep their scores under the round code, without your account.
> - rounds you started, which stay readable by their code. To erase one, use End & Wipe Round, or email us the round code.

Check G4 before publishing the "we delete" list. Without the server function, some records may stay behind until it is deployed.

---

## 6. Graphics checklist

| Asset | Play rule (checked 2026-10-17) | Status |
|---|---|---|
| App icon | 512×512, 32-bit PNG with alpha, ≤1 MB | **Ready**: `docs/play-assets/icon-512.png` (512×512, alpha, 11 KB; the launcher's Play icon) |
| Feature graphic | 1024×500, JPEG or 24-bit PNG, no alpha | **Ready (draft)**: `docs/play-assets/feature-graphic-1024x500.jpg`, made from `hardpan-lockup.svg` on brand green. Source: `docs/play-assets/feature-graphic.html`. |
| Phone screenshots | JPEG or 24-bit PNG, no alpha; sides 320–3840 px; long side ≤ 2× short side; at least 2, up to 8 | **8 drafts**: `docs/play-assets/screenshots/`, all 1080×2160 JPEG (2:1, no alpha), from the Android emulator, cropped below the status bar |
| iPhone set (`final-10`) | — | **Not usable**: 1320×2868 = 2.17:1, and iOS chrome |

Screenshots (0.2 (7) on the emulator): 01 Home, 02 Near you (Caledonia), 03 GPS hole 1 (145 to centre), 04 GPS hole 1 near the green (48), 05 scorecard (Mike / Jordan / Chris / Taylor), 06 full leaderboard, 07 Results (settle summary), 08 Share with QR (code LX83Z6).
03-08 come from one screenshot round, **LX83Z6** ("GPS round" at Caledonia: Mike, Jordan, Chris, Taylor; a $5 Nassau; 3 holes scored). Job 011 reshot 03, 04, 05 and 08, because they showed the App Review demo round 5RZ8GE ("Spectating", test golfers). LX83Z6 was **deleted** afterwards (in-app "Delete round for everyone"; the app now answers "No round with the code LX83Z6"). 01 and 02 show no round. The App Review round 5RZ8GE is untouched.

---

## 7. Release checklist: 0.2 (versionCode 6)

- [x] `app-release.aab` builds: `android/app/build/outputs/bundle/release/app-release.aab`, 5,768,350 bytes, sha256 `4db361f6…67a6` (job 006 commit).
- [x] versionName **0.2**, versionCode **6**, package **com.rattlegolf.app**.
- [x] Signed with the upload key, SHA-1 **92:A2:04:D8:21:67:16:18:E2:C7:0D:0A:5E:4D:00:A8:78:DD:A7:3B**. Enroll in Play App Signing at first upload.
- [x] **targetSdk 36**, minSdk 24. Play rule (developer.android.com, updated 2026-10-16): since **31 Aug 2026**, new apps and updates must target **Android 16 (API 36)** or higher. An extension to 1 Nov 2026 can be requested. **Met.**
- [x] Portrait only. No background location. No ads. No billing.
- [ ] Gaps G1, G2, G4 resolved (G3 done in 0.2 (5)). Drafts for G1/G2: `docs/legal/` (not deployed).
- [ ] Internal testing track first, then closed testing. New personal accounts need a 12-tester closed test; organization accounts don't. Confirm in Play Console once verified.

**Permissions in the AAB, with justification:**

| Permission | Why |
|---|---|
| `INTERNET` | Scores, the live leaderboard, course data, map tiles, wind. |
| `ACCESS_FINE_LOCATION` | Yardages to the green from where you stand. Foreground only, asked once (Precise). |
| `ACCESS_COARSE_LOCATION` | Requested with fine, as Android requires; covers a user who picks Approximate. |
| `ACCESS_NETWORK_STATE` | Added by the Capacitor Geolocation plugin, to know whether it can use network location. |
| `com.rattlegolf.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | Added by AndroidX; signature-level and internal to the app. Not user-facing. |
| *(none)* `ACCESS_BACKGROUND_LOCATION` | Not requested. No location declaration form is needed. |

---

## 7b. 0.2 (versionCode 8) (job 012)
- [x] Android Account words: no trial / founder-pass line, email-only wording (Android-gated; iOS and web unchanged, tested).
- [x] AAB 5,769,356 bytes, sha256 `78fc57d4bc22…`, signer SHA-1 **92:A2:04:D8:21:67:16:18:E2:C7:0D:0A:5E:4D:00:A8:78:DD:A7:3B**. Debug APK on rattle36 (versionCode 8).
- [x] Full suite: 11072 tests, 11066 pass, 0 fail, 0 cancelled, 4 skipped, 2 todo.

## 9. Post-launch: App Links (order approved by Manny, job 012; nothing deployed yet)
Tested on the emulator (URGENT-010): the link opens the app warm and cold, and a cold start signs in with no paste. Real phones send these links to the browser until step 2.
Steps 1 and 2 both wait for the app to exist in Play Console (the Play App Signing SHA-256).
1. **The job-009 split goes live on the website** (`email-link-auth.js`: `android` block only from the Android app). Merge to `main`, which Cloudflare Pages deploys. Needs Manny's OK.
2. **Deploy `/.well-known/assetlinks.json`** on golfapp-9fb21.firebaseapp.com (Firebase Hosting, option B), with the Play App Signing SHA-256 and the upload-key SHA-256. Needs Manny's OK.
3. **GATE: step 5 re-test.** Request a sign-in link **from the website** in Chrome on an Android phone with HardPan installed. It must open and finish in Chrome, not the app. If it opens the app (the `/__/auth/links` wrapper still comes back with only the iOS block), stop: the next fix is to send the `iOS` block from the iOS app only (web-visible, Manny's call).
4. **In the same release that turns verification on:** change the Android Account sheet sentence "In the app, don't tap the link in the email — it opens the website… Copy the link…". After step 2 it is false: tapping the link is the right thing to do. Until then it is true; leave it.
5. Check on a real phone: `adb shell pm get-app-links com.rattlegolf.app` shows `verified` for golfapp-9fb21.firebaseapp.com.

## 8. Checks run for this file
- Listing lengths, by script: see the job report (`outbox/001-play-listing-prep-REPORT.md`).
- Every asset dimension above was read from the files with `sips`.
