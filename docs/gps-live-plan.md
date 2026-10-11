# HardPan GPS LIVE: any US course, API-only (plan, 2026-10-10)

Branch `gps-live` (off gps-flow 2c4b8f8). Never merged to main. Builds 9 / 10 and the
"Myrtle trip" review are untouched: the new app build is **0.2 / 11, INTERNAL group only**.

## How it works

```
phone --(tap Search)--> gpsSearch  --(0.1 call, cached)--> GolfAPI /clubs
phone --(tap a course)-> gpsCourse --(2 calls, ONCE ever)--> GolfAPI /courses + /coordinates
                            |
                            +--> gps_courses/<id>   (stripCourse shape = window.HardPanGolfApi)
                            +--> global_courses/gapi_<id>  (the scorecard: pars, handicaps, tees)
                            +--> gps_links/<ourKey>  (so the next pick of that course is free)
phone <-- reads gps_courses/<id> directly (signed in, one course at a time; 0 calls)
```

- The key lives in **Secret Manager** (`GOLFAPI_KEY`). It is never in the app, the repo, or a log.
- `stripCourse()` moves to `firebase-functions/golfapi-strip.js`; the Mac puller
  (`tools/golfapi-pull.js`) requires it from there, so both write the same shape.
- **No location leaves the phone**: search sends the typed name only (results show
  city / state; the phone sorts them). The golfer's position is never sent.

## Cloud Functions (`firebase-functions/`, Node 20, 2nd gen, us-central1)

`firebase-functions/` (not `functions/`, which is Cloudflare Pages' /api).

| function | input | what it does |
|---|---|---|
| `gpsSearch` | `{ name }` | signed-in only; 3-60 chars; cached by normalized name for 30 days (free on repeat); per-user 20 searches/day; returns club / course / city / state / holes / hasGPS / `cached` (already in Firebase) |
| `gpsCourse` | `{ courseId, ourKey? }` | signed-in only; cached course: returned, 0 calls; else the guards below, then 2 calls, cache forever, write the card + link |

### Guards
1. **Signed in.** Callable functions verify the Firebase ID token. Anonymous users may
   search and open cached courses; a **NEW pull needs a real account** (Apple / Google /
   email) - an anonymous uid is free to mint, so a per-user cap on it is no cap.
   Setting: `PULL_NEEDS_ACCOUNT` (default true).
2. **Search only on tap**; results cached per normalized name.
3. **Caps**: 5 NEW pulls per user per day; 25 NEW pulls per day across everyone (a
   ceiling if accounts are abused). **Floor**: no pull when apiRequestsLeft < 50 - the
   phone shows "GPS coming soon for this course", and Manny is alerted.
4. **Only** courses a search returned with `hasGPS = 1` and `numCoordinates > 0` (an
   ID nobody searched for is refused - no blind pulls).
5. **Log**: every call -> `gps_log` (who, action, course, cost, calls left, result).
6. **One pull per course** even if two phones tap at once (a lock in `gps_meta`).

### Alert ("tell Manny")
- `gps_alerts/<id>` + an ERROR log line `GOLFAPI_FLOOR`, and a push to every device
  in `pushTokens/<uid>` for the uids in `ALERT_UIDS` (Manny's).
- Optional (free, console): a Cloud Logging alert on `GOLFAPI_FLOOR` -> email.

## Firebase nodes (all written ONLY by the functions - admin SDK)

| node | client access |
|---|---|
| `gps_courses/<courseId>` | read: signed in, ONE course (no list read - no scraping) |
| `gps_links/<ourKey>` | read: signed in, one key |
| `gps_usage/<uid>/<yyyymmdd>` | read: that user only (shows "3 of 5 left today") |
| `gps_search`, `gps_log`, `gps_alerts`, `gps_meta` | none (the existing `$other` deny) |
| `global_courses/gapi_<id>` | existing rules, unchanged (the function only CREATES new `gapi_` cards, never overwrites) |

## Rules diff: ADDITIVE ONLY, NOT PUBLISHED

See `docs/gps-live-rules.diff` (3 new top-level blocks, nothing else changes).
`gps_live_rules_test.js` merges them into an in-memory copy of database.rules.json
and checks: signed-in read of one course works; anonymous-signed-in works; signed-out
refused; list read refused; every client write refused; every existing rule test still
passes unchanged.

## App (GPS blocks only; the Consumer tree stays identical)

- `gps-config.js`: `osm: false` (OpenStreetMap OFF, code kept), `live: true`,
  `liveBase: <functions URL>`. **Build 10 path = `osm: true, live: false`.**
- Setup step 2: tapping "Search online" also asks `gpsSearch`; GolfAPI courses show first
  with **GPS ✓** (or "GPS ✓ ready" if already cached), then the scorecard-only results.
  Same-club courses listed separately (O'odham / Piipaash).
- Picking a GPS course: `gpsCourse` -> card + GPS -> selected. Messages: daily limit,
  "GPS coming soon for this course" (floor / no GPS), offline.
- A saved course with no GPS: a "Find GPS for this course" tap (a search, on tap).
- GPS screen: GolfAPI only. Bundled 9 courses (offline) -> `gps_links` / `gps_courses`
  (kept on the phone after the first open, for offline) -> no data: "No green mapped
  for this hole yet - Tools > Set the green".
- 9-hole GolfAPI courses: GPS works; the card is typed (v1).

## What Muse / Manny do (once, ~45 min)

In `~/golf-app-gps-live` (branch gps-live; it has golfapi/ already). Nothing here
touches builds 9 / 10, `~/golf-app-gps-flow`, or the "Myrtle trip" review.

1. Firebase CLI: `npm install -g firebase-tools` (free), then `firebase login` with the
   Google account that owns golfapp-9fb21, then `firebase use golfapp-9fb21`.
2. The key, into Secret Manager (never a file):
   `firebase functions:secrets:set GOLFAPI_KEY` - paste the key at the prompt.
3. `cd firebase-functions && npm install && cd ..`
4. Deploy ONLY the two functions:
   `firebase deploy --only functions:gps-live:gpsSearch,functions:gps-live:gpsCourse`
   (firebase.json names the codebase "gps-live", so the names need that prefix.)
   - First time: the CLI asks to enable Cloud Functions / Cloud Build / Artifact
     Registry / Cloud Run / Eventarc / Secret Manager APIs - say yes.
   - It asks for `ALERT_UIDS`: Manny's Firebase uid (Authentication tab), or blank.
   - **Never a bare `firebase deploy`**: that would also publish database.rules.json.
5. Rules: Manny reads `docs/gps-live-rules.diff`. To publish, Firebase console ->
   Realtime Database -> Rules: paste the three blocks (`gps_courses`, `gps_links`,
   `gps_usage`) just above `"$other"`, Publish. Nothing else in the rules changes.
   DONE 2026-10-10 (Muse, from the LIVE rules + the 3 blocks; verified: the only change).
   WARNING: database.rules.json in this repo (every branch, main included) is NOT the
   live ruleset - 41 rules differ and it has no gps_* blocks. Never `firebase deploy
   --only database` from a branch: it would rewrite the live rules. Change rules from
   the live copy (Firebase console), and bring the repo file in line first (to-do).
6. Optional (free): Cloud Logging alert on `GOLFAPI_FLOOR` -> email Manny.
7. Archive build 11 from this folder (as builds 9/10: `node tools/golfapi-pull.js
   --build`, `node tools/build-gps-app.js`, `cd gps-beta && npm install && npx cap sync
   ios`, Xcode Version 0.2 Build 11) -> TestFlight **INTERNAL group only**.

Until steps 4-5 are done, build 11 still has the 9 bundled courses; a new search
says "GPS is not available right now".

## Cost

- GolfAPI: 2 calls per new course, once ever -> ~250 courses from the 506; searches 0.1
  and cached.
- Firebase (Blaze): Functions / RTDB / Secret Manager at this volume sit inside the free
  allowances -> about $0 a month.

## To-do (after the trip)

- **BEFORE OCT 30: move the functions off Node 20** (Google retires the Node 20 runtime
  for Cloud Functions on Oct 30). Plan: `firebase.json` runtime `nodejs22`, `package.json`
  engines `"node": "22"`, update `firebase-functions` (and `firebase-admin`) to current
  majors - read their release notes for breaking changes (params / `onCall` options /
  secrets) - run `gps_live_test.js`, load the functions locally (as on 2026-10-10:
  2 callables, us-central1, the secret bound), then redeploy with
  `firebase deploy --only functions:gps-live:gpsSearch,functions:gps-live:gpsCourse`
  and re-run one cached search on a phone (0 calls). Not done yet.
- **Rules file in the repo != live rules** (41 differences, no gps_* blocks, every branch).
  Bring `database.rules.json` on main in line with the live ruleset (from the console)
  before anyone deploys rules from the repo again.
- Saved course list: GPS badge + sort (deferred from build 9).
