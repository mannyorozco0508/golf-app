# HardPan GPS — features on `gps-features` (2026-10-11)

Branch `gps-features` (off gps-live acfe6c6). Nothing here ships, deploys, or writes
to Firebase. Tested with Xcode Cmd+R only. Rules and functions untouched.

## 1. Offline course packs (`gps-offline.js`)
- Setup → pick a course with GPS → **⬇ Download for offline** (under "GPS ✓ ready").
- Stores on the phone: the course's greens / tees / hazards (GolfAPI), its card, the
  USGS satellite tiles z13–16 over the course, and every hole's plays-like heights.
- Then: **✓ Downloaded for offline · 18 holes · N map tiles** + **Delete**, and
  **✓ Offline** next to the course in the saved list.
- No signal at setup: the card comes from the pack.
- Esri tiles are never stored (their terms), so offline the map is USGS imagery
  (softer: USGS stops at z16).
- iPhone check: imagery storage uses the Cache API; if a phone lacked it, the row says
  "(map needs signal)" and everything else still works offline.

## 2. Plays like with elevation
- Already existed: wind + temperature + slope (`gps-geo.playsLike`, "plays ~158").
- New: heights (USGS EPQS: tee, 25/50/75 %, green center; course points only) are
  fetched ONCE for the whole course — at setup pick, with a download, or when the
  round opens with signal. `elevOnTee: false`: nothing is asked hole by hole on the tee.
- Phone-side only; no function change.

## 3. My stats (`gps-stats.js`, GPS → Tools → My stats)
- Per hole for "me" (the scorecard's "This is me", or tap your name): putts 0–4+,
  fairway Left / Hit / Right (not on par 3s), GIR from score + putts
  (score − putts ≤ par − 2) with Yes / No override.
- This round: holes, score, putts (/hole), fairways (L/R misses), GIR %.
- Season: every round on this phone — putts/round (full 18s), putts/hole, FIR %, GIR %.
- Stored: `localStorage hardpan_stats_v1_<round>` only.

### Firebase design (after the trip; NOT written now)
```
events/<round>/stats/<playerId>/h<n> = { putts: 0-9, fw: "L"|"hit"|"R", gir: true|false (override only), at }
player_stats/<uid>/rounds/<round>   = { course, at, holes, putts, fwHit, fwChances, gir, girHoles, toPar }
```
Rules that would need ADDING (additive; nothing existing changes):
- `events/$eventCode/stats/$playerId/$hole` — `.validate`: `$hole` matches `^h([1-9]|1[0-8])$`,
  putts number 0–9, fw one of L/hit/R, gir boolean, at ≤ now. Writes ride the round's
  existing code-holder write (like scores); a stricter version: only
  `auth.uid` linked to that player.
- `player_stats/$uid` — `.read` / `.write`: `auth != null && auth.uid === $uid`
  (a real account, like pushTokens), with `.validate` on the summary fields.
- Note: the repo's database.rules.json is out of date on every branch; these must be
  added to the LIVE rules, not deployed from a branch.

## 4. Shot by shot (`gps-shots.js`, Tools → Mark shots / Replay round)
- Mark shots: each map tap (or **Here**) marks where a shot finished — numbered, with
  yards (first from the tee, then from the shot before). **Undo**, **Done**.
- Replay round: shots hole by hole; ◀ / ▶ Play (3.5 s per hole) / Exit replay.
- Stored: `localStorage hardpan_shots_v1_<round>` only. Positions never leave the phone.
- After the trip (same pattern as stats): `player_stats/<uid>/shots/<round>/h<n>` =
  list of points — owner-only rule. It is location data: only with the golfer's opt-in.

## 5. Bet templates (Games step → "Quick start")
- Nassau, Skins, Wolf EXIST. Templates only pre-fill the existing setup:
  - **$5 Nassau**: Nassau card; on Money: front / back / overall $5 (pick golfers).
  - **$2 Skins**: Stroke Play; on Money: one Skins game, $2/skin, carry over, everyone in.
  - **$1 Wolf**: Wolf card, $1/point.
- No engine, settlement or side-bet change (tested: those files are byte-identical).
- **Vegas does not exist** as a game type → no Vegas template (it would need a new
  money engine — stopped, per instructions).

## 6. GHIN lookup — research only
- A licensed route exists but is not self-serve: USGA "Golfer Product Access" (GPA)
  program for golfer apps (Handicap Index lookup, ratings, score posting) — apply via
  USGA's tech-provider form; license agreement + approval; fees / timeline unpublished
  (likely months). The club-side "VASP" program needs ≥10 clubs / 1,400 golfers.
- Apps that do it are licensed partners (TheGrint, Arccos, Golfshot); 18Birdies does
  not sync yet.
- Recommendation: keep manual entry ("self-reported, as of <date>"), add a "Check my
  Index" button that opens the official GHIN app / ghin.com; apply to GPA in parallel
  if verified indexes matter. No scraping, no private API.
- Sources: forums.garmin.com (USGA reply on GPA/VASP), thegrint.com (WHS integration),
  support.arccosgolf.com, help.18birdies.com, usga.org GHIN privacy / trial terms.

## 7. Old saved courses find their GPS (Legacy fix)
- WHY "Find GPS" failed for "Legacy Golf Resort": GolfAPI calls it "The Legacy Golf
  Club" (Phoenix, AZ) and its name search is strict - the full saved name returns
  nothing (log: legacy_golf_resort -> 0 results). Same pattern as "Southern Dunes Golf
  and Country Club" (0) vs "Southern Dunes" (3). "Search online" only seemed to work:
  it showed the free scorecard results; its GPS list was empty too.
- Now (gps-live.js find): the name in up to 3 shorter forms (each search cached for
  everyone: 0.1 call the first time, then 0), matched on the saved card's CITY + STATE.
  One clear match: linked at once (gps_links/<saved key>: the next golfer goes
  straight to GPS ✓ ready). Several: you pick. None: said so, with Search online.
- Runs by itself ONCE when an old saved course with no GPS is picked; "Find GPS for
  this course" stays for a retry. The saved list is kept.

## 8. City, state under each course
- Saved list: name, then "Phoenix, AZ" on a small second line, from the saved card's
  location (one tiny read per row the first time, kept on the phone). No location
  stored: nothing extra. Search online rows already show city, state.

## 9. GolfAPI as the scorecard source
- Search online asks GolfAPI FIRST. GPS courses found: only those are shown, plus
  "Not listed? Search scorecards (no GPS)" - the free GolfCourseAPI search is NOT spent.
  GolfAPI has none: GolfCourseAPI as before.
- A GolfAPI pick fills pars, handicaps and rated tees from GolfAPI (the card our function
  writes). If its card has no rated tees: GolfCourseAPI backup - search + card, matched
  on city/state, ratings by tee name - on this phone for this setup only.
- GolfCourseAPI lookups per round setup (35 a day free):
  | path | before | after |
  |---|---|---|
  | saved course | 0 | 0 |
  | Search online -> course GolfAPI has | 1-3 (search always ran) | **0** |
  | ... and its card lacks ratings | 1-3 | 2 (backup) |
  | Search online -> course only GolfCourseAPI has | 2-4 (1-3 searches + 1 card) | 2-4 (same) |
  | "Not listed?" tapped, then a scorecard pick | - | 2-4 |

## 10. Paste the whole trip / round (branch gps-paste)
- TRIP page: "📋 Paste the whole trip (days, groups, games)" above the itinerary box.
  Read it -> REVIEW (questions first: no date, Nassau sides, "use Day 1's groups?";
  skipped games; lines it could not read) -> Confirm. Confirm fills the itinerary and
  golfers boxes (their own review / Apply as always) and keeps each day's groups + games
  ON THIS PHONE; Build Trip ties each to its round code.
- ROUND SETUP: a day's draft shows "📋 Pasted setup for this day — Fill it in": golfers in
  the pasted groups (a trip round keeps each golfer's row and id; handicaps fill in), the
  game card (Wolf $/pt, Best Ball ...), and on Money the one 1v1 Nassau Round Setup takes
  + the Skins game (its golfers). The organizer checks and taps Save.
  "📋 Paste the whole round" next to Paste Player List does the same for one round.
- SIDE MATCHES: team-vs-team and the other foursomes' Nassaus are listed ("From your
  paste — bets to add"); "Fill it in" opens the ordinary Add form with the group, sides
  and stakes chosen; the organizer taps Save. Remove drops one.
- Existing game types only; Vegas / Bingo Bango Bongo / Snake ... flagged and skipped.
  "Auto press" = Auto @ 2 Down, "presses" = Press Any Hole (both changeable).
- Drafts and queued bets: localStorage only. AFTER OCT 17 (post-trip list): move them into
  the trip record (trips/<code>/drafts - needs a rule) so other organizers' phones see them.
- No money engine, settlement, side-bet or game-type change; nothing writes until Save.
