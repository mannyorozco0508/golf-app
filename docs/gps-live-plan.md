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

1. `firebase login` (rattlegolf account with access to golfapp-9fb21).
2. Secret: `firebase functions:secrets:set GOLFAPI_KEY` (paste the key at the prompt; never in a file).
3. `cd firebase-functions && npm install`
4. Deploy ONLY the functions: `firebase deploy --only functions:gpsSearch,functions:gpsCourse`
   (**never a bare `firebase deploy`** - it would publish database.rules.json).
5. Manny reviews `docs/gps-live-rules.diff`, then publishes those 3 blocks (or says go).
6. Archive build 11 -> TestFlight INTERNAL only.

## Cost

- GolfAPI: 2 calls per new course, once ever -> ~250 courses from the 506; searches 0.1
  and cached.
- Firebase (Blaze): Functions / RTDB / Secret Manager at this volume sit inside the free
  allowances -> about $0 a month.
