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
- **📍 Mark shot** (one tap, on the GPS screen, right side): marks the shot at the phone's
  GPS position - no map tap. Then a club picker: Dr 3W 5W Hy 3i-9i PW GW SW LW Putter,
  **Skip**, or **Move it on the map** (the next map tap moves that shot; its numbers are
  redone). Saved with each shot: club, position, yards from the shot before (or the tee),
  the wind at that moment relative to the shot (mph, from, head/cross, kind), the
  elevation change (ft, from the hole's stored heights) and the plays-like yards.
- Map labels and Replay show "2 · 7i · 152".
- PLAN ONLY (not built): **My clubs** - per club, from every round's shots on this phone:
  shots counted, average real yards and average plays-like yards (Putter left out;
  shots with no club skipped; maybe drop the shortest 10 % as mishits).
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

## 11. Bingo Bango Bongo + Vegas (branch gps-games)
- NEW engines, own files: `bbb-engine.js`, `vegas-engine.js`; screens in `extra-games-ui.js`.
  HardPan only (GPS blocks). money-engine, settlement-engine, payouts, match/pool/tournament
  engines, aloha, ryder, side-match lines, live skins, trip pots and action-model are
  byte-identical to main (extra_games_engine_test.js pins their hashes).
- Stored as `events/<round>/additionalGameInstances/<id>` with format `bbb` / `vegas` - the map
  the Action tab and Round Setup already write. The only new write: a BBB point,
  `.../<id>/points/h<n>/<bingo|bango|bongo>` = golfer id. No rule change.
- Set up: Round Setup -> Quick start "$1 Bingo Bango Bongo" / "$1 Vegas", or Money step ->
  Also Playing -> "+ Bingo Bango Bongo" / "+ Vegas": $ per point, golfers (BBB), Team A /
  Team B (Vegas, tap to cycle), Birdie flip. Paste the whole trip / round reads both names
  ("vegas $1 birdie flip", "$2 bbb", "bingo bango bongo").
- Scorecard: a card per game; BBB has the hole's 3 taps (Bingo first on / Bango closest /
  Bongo first in; tap again clears) for whoever may score one of its golfers.
- Settlement: a card per game with its own who-pays-whom. NOT in Final Money / Who Pays Who
  (that would need settlement-engine.js) - the card says to settle it separately. Trip
  totals do not include them either.
- BBB money: every golfer v every other, $ x point difference = $ x (N x mine - total).
  1) $1, 10/5/3 pts -> +12 / -3 / -9 (C pays A 9, B pays A 3).
  2) $2, 6/6/4/2 -> +12 / +12 / -4 / -20 (D pays A 12, D pays B 8, C pays B 4).
- Vegas money: low score first (10+ goes first: 4 & 10 = 104); birdie or better flips the
  OTHER team (both birdie: no flip); a hole counts with all 4 scores; gross; each golfer
  wins / pays points x $.
  1) $1: 45 v 56 -> A +11 points, A +$11 each, B -$11 each.
  2) $0.50, flip: 36 v 45->54 (A +18), then 56->65 v 47 (B +18) -> level, $0.
- Older apps (GPS beta build 12, the web app): getRoundGames skips the unknown format and
  Round Setup writes it back unchanged. `node tools/extra-games-backcompat.js <tree>...`
  opens the same round with / without the new games on scorecard, Action, leaderboard,
  skins and settlement: old trees read identically, no errors.
- Round Setup kept open during play keeps its copy of BBB points in step with the round,
  so Save never writes back stale points; a copied round starts with none.
- Vegas rules APPROVED by Manny 2026-10-11 (all five as built): 10+ first; birdie flips the
  other team, both birdie = no flip; gross; each golfer wins / pays points x $; 2 v 2 only.
- Payout card: "How it adds up" - the rule, one real hole from the round (a flipped one when
  there is one), and the round's points x $ per golfer; BBB shows the top golfer's sum.
- PLAN ONLY (not built): a NET Vegas option - `vegasScoring: 'net'`; each golfer's net score per
  hole (strokes off the course handicap by hole index, as the existing engines allocate them,
  read through handicap.js - no change to it), then the same number rule. The birdie flip
  stays on GROSS birdies (or a toggle). Shown as "Vegas · net" on the cards.

## 12. Trip builder + Cup scoreboard (branch gps-builder)
- Trip page -> "Build the whole trip from one paste": TRIP name, the Cup line, TEAMS (captains),
  each DAY (date, course, tee times), "Format:", "Group N (time): A & B vs C & D - games",
  "Everyone:" games. Files: trip-builder.js (parse, questions, the writes; pure),
  trip-builder-ui.js (the ONE review screen + Confirm), cup-scoreboard.js (display only).
- Review: every value is editable in place (date, course, tee time, Cup format, each golfer
  slot, every $ amount, Vegas flip, remove a game, team swap, captains, "first to", golfer
  names, handicaps). Questions come first, each with the likely answer picked.
  Lines it can't read are kept as trip notes (never dropped).
- Confirm = ONE db.ref().update, the Build Trip way (code-issuer codes, organizerGate
  ensureOrganizer + stamp): trips/<T> (name, createdAt, organizerToken, rounds/<R> rows,
  builder: Cup rules, captains, notes) and events/<R> per day in Round Setup's payload shape:
  players (same ids every day), groupSizeOverrides, sideMatches (Nassau via
  sideMatchPayloadFromTerms -> buildNassauWagerPayload, scope/ownerGroup per group),
  additionalGameInstances (skins, Vegas, BBB), moneyPool (KP), ryderCup (host = Day 1, built
  with buildRyderCupConfig + one session per day) and ryderCupRef on every round.
  Each round stays an ordinary round: Round Setup and Action edit it as usual.
- The per-day "Paste the whole trip" (Fill it in) stays as the fallback.
- RYDER GAPS (ryder-cup.js unchanged): a match is always the round's 18 holes, so "2 points
  per match (front 9 + back 9)" can't be two 9-hole matches - it is counted 1 a match and
  the rule is shown on the trip. Captains, "first to X" and the running total across days
  are the display-only Cup scoreboard on the trip page (computeRyderCupTotals, called
  as-is, with each round's scores keyed by its session).
- AFTER OCT 17 (needs the Ryder engine): per-match points (2-point matches), per-nine
  matches (startHole/endHole on a match), a stored target/captains on the Cup, and the
  scorecard's Cup card adding the other days.

## 13. Pay with Venmo + Check my Index (branch gps-venmo)
- Results page (settlement.html): each "X → Y $N" in Who Pays Who and each "X pays Y" on the
  BBB / Vegas cards gets "Pay $N with Venmo" (+ a small "web" link and a phone-only "Mark paid"),
  shown ONLY to X (the scorecard's "This is me": golfapp_me_<round>, or ?me=) and only when Y
  has a username; else "Ask Y to add their Venmo in their profile."
- "Your Venmo" box under Who Pays Who ("Which one are you?" first, if this phone doesn't know).
  Saved (Manny's choice A/B, 2026-10-11): trips/<trip>/venmo/<golfer name, lower case> for a round in
  a trip (round.tripCode, or the trip last opened on this phone that lists the round);
  events/<round>/venmo/<playerId> for a round not in a trip. No rules change.
- Links (checked 2026-10-11): app https://venmo.com/u/<user>?txn=pay&amount=N&note=HardPan · <trip/round>
  (Venmo's app claims /u/*); web https://account.venmo.com/pay?txn=pay&recipients=<user>&amount=N&note=...
  Not venmo://paycharge (reported broken for usernames since 2024).
- No money through the app, no payment API, nothing about a payment stored. Money engines and
  settlement-engine.js untouched (hash-pinned).
- Check my Index: Round Setup → Players, every golfer row, and the trip builder's handicap box:
  https://www.ghin.com/overview/ (a path the GHIN app claims) - the app if installed, else ghin.com.
  Nothing fetched or stored; the golfer types the Index.
- Trip builder: rounds now carry tripCode; when the app's Cup has fewer points than the paste
  (2-point days), "first to" is pre-filled as half the app's total + ½ and flagged (Keep / type).
