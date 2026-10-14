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

## 13. "Paste the whole round" lands (branch gps-paste-fix, 2026-10-12)
- Muse's report: Read it parsed 32 golfers; Confirm said nothing; Review & Save had 1 golfer.
- Root cause: Confirm cleared the golfer list and handed the text to Paste Player List to
  READ AGAIN; that second read returned silently when it found nobody (and the one golfer
  already typed in was dropped either way). It also left a draft for a later "Fill it in",
  set the WHOLE round to Wolf because Group 2 played Wolf, and queued team Nassaus for
  Side Matches after Save. Read it returned silently on an empty box / a reader not loaded.
- Now Confirm (admin.html spRoundConfirm): writes every golfer row itself, in group order
  (a golfer already on the list keeps their row; others are kept as a last group), sets the
  groups, checks that every golfer landed (else a visible error), fills Games & Money now
  (1v1 Nassau card, skins, Vegas, BBB with their golfers/teams), keeps team Nassaus for this
  round's own Save (same update, scope/ownerGroup like the Action tab), and opens Review &
  Save with every golfer, the groups, every game and "Not set up". Every failure in Read it
  / Confirm is shown on screen and logged.
- "Name, 12" = "Name (12)". Near-duplicate names (Zach Corrano / Zach Carrano, Derrick /
  Derrick J Doncaster, Bill / Billy Saley) are warned on the review; both always kept.
- One scoring format a round: one format for every group is set; groups on different formats
  (Wolf, Best Ball, Scramble, Stableford) set none and are listed as "not set up".
- Trip builder: its one-round path needs DAY lines - this text reads 0 days there (no golfers
  lost, nothing written); it is a separate flow (makes a new trip), so Round Setup keeps its own.
- tools/paste-round-check.js: Muse's text on a new round, on a saved round with a golfer
  already typed, with "Name, 12", and a 1-group $5 Nassau; then build 12 / main open them.

## 14. Two front doors (branch gps-doors, 2026-10-12; Manny's mockups ~/Desktop/hardpan-mockups)
- App only (Capacitor; window.__hardpanDoors for the checks); the HardPan web pages are unchanged.
- home.html: Main (GPS green #0f4c3a / Games & Bets navy #1d3557, "Have a game code?", Sign in,
  "We'll remember your pick"), GPS-1 (search, Near you with miles, Recent, GPS READY / SET UP · 1 TAP,
  city/state), Games-1 (GPS | Games switch, + Start a round, game-code Join, your round, Trips & Cups,
  Build a trip from one paste). The pick is kept (hardpan_front_door); the next open goes straight there.
- GPS: a GPS READY course starts an ordinary round through Round Setup's own Save (you as the golfer)
  and opens it on GPS (GPS-2, unchanged + "Score", "+ Game", a "Games" chip). + Game = GPS-4: the
  round's golfers, quick start Nassau / Skins / Vegas / BBB (Round Setup's own templates, on Money),
  Paste the whole round, Full game setup, Not now. GPS-3: the card of a no-money round offers
  + Add a player / + Add a game / Save · back to map (typed score boxes unchanged).
- Games: today's screens; a round stays on the card (no location) until the green 📍 GPS pill.
- tools/front-door-check.js drives every screen in Chrome.
- gps-doors-fix (2026-10-12, Manny's iPhone test): every launch opens Main (the last door
  highlighted, "Resume <course>" for a round in progress; back from >60 min in the background =
  Main again); a launch goes straight to home.html (no scorecard flash); these screens are always
  the light theme; a course tap writes the round itself (organizerGate + code-issuer + one set, Round
  Setup's saved shape) and opens GPS on hole 1 - never Round Setup. GPS READY in the app = GolfAPI
  has the course (the app's GPS draws GolfAPI only); a course set up before by anyone (gps_links)
  starts at once; any other is pulled ("Setting up GPS for ...", gps-live find + course); any failure
  says why, with "Play without GPS" and "Try another course".
  WHY THE PHONE WENT TO ROUND SETUP: the old path handed the course to Round Setup and auto-tapped
  its Save 1.2 s later; on a phone Round Setup's own load of the fresh round (real Firebase) landed
  after that and cleared the course, so Save stopped at "Pick a course first". The Chrome check's
  stand-in database answers instantly, so the race never showed there. Reproduced in the iOS
  Simulator (screenshots in ~/Desktop/claude-code-reports/sim-20261012/).
  Also on gps-doors-fix: NO AUTO-ADVANCE - the last score of a hole stays on that hole (totals and
  game cards showing); only "Next ▶" moves on, and in a GPS round it takes the map to that hole too.
  The green "📍 GPS" button sits in the hole's heading (the floating toggle is hidden in the app), so
  it never covers a game card or the keypad bar. THE 2v2 PICKER (paste review and Round Setup's
  Vegas): first two tapped = Team A, next two = Team B, a re-tap un-picks, "Team A: __ & __ / Team B:
  __ & __" and Swap teams; asked only when the paste doesn't name the sides ("GROUP 1 - $5 NASSAU
  (Manny & Joe vs Mike & Dave)", "A/B v C/D": matched to the group's golfers), pre-filled 1+2 v 3+4.
  ADD A GAME (front-door.js, one sheet from GPS +, Tools, the card and ≡ Round Menu): Quick start
  sets the $ and golfers / teams, then opens that game's own setup filled in (Side Bets' Add form for
  a Nassau via the paste-bets queue; Round Setup's Money for Skins / Vegas / BBB via &amt &ids
  &carry); All games lists every game, each to its normal setup (Side Bets add=1&fmt=, Round Setup
  tpl= / fmt= / step=money); Paste the whole round; Paste a multi-round match = trip.html#build with
  today as Day 1, this course, these golfers - Confirm makes every day a NEW round (Day 1 too); the
  round it came from keeps its scores. Nothing in the sheet writes to Firebase.
- gps-doors-black (2026-10-12, a one-time black screen on Manny's iPhone after tapping GPS on the
  doors, first launch after Cmd+R; no log). Not reproduced in the Simulator. Hardened so nothing can stay
  black: the WebView background is the light theme (#f0f4f2) instead of the system's black in dark mode;
  the launch hop to Home has a 5 s watchdog (the page comes back with "Tap to retry"); GPS-1's data files
  load with an 8 s limit; the location ask has a 15 s limit (iOS's first-launch prompt stops the plugin's
  own timeout) with "Couldn't get your location yet · Tap to retry", and a late answer is still used; a
  failure opening a door shows the light retry card, which reloads Home.
- gps-league (2026-10-13): POINTS LEAGUE, the week's individual points race on the trip page. New files only:
  league-engine.js (pure) and league-ui.js. Every round each group plays 2 v 2; points come from the group's
  own 2 v 2 Nassau in Side Bets, READ through the one match engine the same way Side Bets calls it (net or
  gross as set up; presses ignored): front 9 / back 9 / 18 = 1 pt each (editable) to each golfer on the
  winning side, a halve = half each. A segment counts once the engine closes it, or once all its holes are
  played level (halved). The organizer can set any segment by hand (A / B / half; Auto = back to the scores)
  or enter a match for a group with no Nassau (2v2 picker). Standings: points over every counted round;
  tiebreak most matches won (more of the match's points than the other side), then shared. Pot = buy-in
  ($20) x league golfers; places 50/30/20 % (editable, must add to 100; fewer golfers than places =
  re-scaled), ties split the places they cover, integer cents. Stored ONLY at trips/<code>/league
  ({ on, buyIn, players | null = everyone, pts, places, overrides, manual }) - the trips node's existing
  rules allow it, no rules change. Only the PICKED golfers are in the league (Manny, 2026-10-13: 10 of the trip):
  setup starts with nobody picked, "Select all", and a live "10 golfers · pot $200 · 1st $100 / 2nd $60 /
  3rd $40"; a league golfer scores when his side wins even with non-league partners or opponents; nobody
  else is ever in the standings, the pot or "who gets paid". (Live trips reads need a signed-in user - an
  anonymous session is refused.) Rounds are never written; a round played before the league was set up
  counts (results are read whenever drawn). "Who gets paid" is its own card under Trip Money Settlement,
  settled separately - Who Pays Who and every settlement are untouched. Checks: league_engine_test.js,
  tools/league-check.js (organizer + golfer + build 12 / web app).
- gps-points (2026-10-13): the league made a general POINTS GAME. Add a game > All games > "Points game"
  (points.html?game=<round>&setup=1) and the trip page card. One setup screen: rounds (this round only, or
  several - the trip's rounds incl. later ones when this phone has opened the round's trip, else rounds added
  by game code), format & points (every round: four-ball / foursomes / scramble / singles; Nassau-style
  front/back/18 or a plain 18-hole match with win/halve points; any round its own, editable later), teams
  (each round's own 2 v 2 / 1 v 1 bets, or the same 2 v 2 sides every round - scored from each round's scores
  by the match engine; a singles round splits each pairing into two 1 v 1s), golfers (none picked, Select
  all), money (the Weekly game's payout setup: % presets or exact $ per place adding up to the pot) and the
  live line. Results are read-only: four-ball / singles from the match engine, a Cup round's matches from the
  Ryder engine (front/back by the match engine for four-ball / singles), foursomes / scramble tapped in.
  Kept at events/<round>/pointsGame (this round, or rounds by code) or trips/<trip>/league (the trip's
  rounds) - no rules change. Results page: its own "who gets paid" card. Checks: league_engine_test.js,
  tools/league-check.js, tools/points-check.js.
  LEAGUE PAIRINGS (2026-10-13; the default when the game's golfers are fewer than the field): per round,
  the game's own matches from the league golfers only (2 v 2, or 1 v 1 singles worth the same points),
  whatever groups they are in - 👥 Pairings: "Make pairings" (odd counts: "2 left → singles", singles rotate,
  partners change), the 2v2 / 1v1 picker, Remove. Scored from each golfer's own hole scores by the match
  engine (a stand-in round; a golfer in another round code of the same day - by the trip's round dates - is
  read there). "Use each group's 2v2 Nassau" stays an option. LIVE: the trip page and points.html listen to
  each round's scores; each match shows "Manny & JP 2 UP thru 7". Each round gets events/<round>/
  pointsGameRef ({ trip } / { round }), so its scorecard and Action show "🏅 Points game" with that round's
  matches, live, and "Standings ›".
  START ON THE 10th (2026-10-13): every Points game match is handed the whole card (start = hole 1) and
  decided by the Points game from the engine's hole-by-hole winners (holeLog), in any order: won once the lead
  is bigger than the segment's unplayed holes, halved once all are played level. The engine's own close-out
  (which, on a start-on-10 card or a bet "from hole 10", can drop holes 1-9) is not used. Money engines untouched.
  ROUND-ROBIN BEST BALL (2026-10-13; the default when the league's pairs are an odd number - 10 golfers = 5
  pairs): per round the pairs (👥 Pairs & round-robin: "Make pairs" - the circle method, every golfer partners
  every other once over n-1 days - or tap two, + Add this pair); every pair plays an 18-hole best-ball match
  against every other pair, from the golfers' own hole scores, whatever groups; points a match win 1 / halve ½
  (or front / back / 18), each golfer his pair's points; each pair's record live ("Manny & JP: 3-1, 3 pts"),
  also on the round's scorecard card. "Two 2v2 + singles" stays an option. Stored at <game>/pairs/<round>, rrPts.
- gps-ui-fixes (2026-10-13, Manny's phone on 3421d6c): Mark shot = a distance measure for now (tap 1 "📍 0 yds",
  the yards live from that spot, tap 2 "Shot: N yds" and that spot is the new start; nothing saved - the shot /
  club code is kept as markShotWithClub); the yardage box BACK over FRONT; the score bar "‹ Hole N · … ›" and,
  once the signed-in golfer's score is in, "Hole 1 · 4" (resolvedMeId, or the only golfer); zoom on the LEFT
  edge, half way down; GPS from Games goes back to the round in progress on GPS (the last round, under 12 h, not
  finished) - the course picker only without one or from Tools › "Pick another course" (home.html#pick); the Add
  a game sheet scrolls over the GPS screen (blockPull lets #fd-addgame / .gps-scroll-ok through); Games home
  lists every trip this phone opened (hardpan_trips_v1, read after sign-in, one retry) + "Open a trip" by code,
  and the trip page remembers its organizer link (hardpan_trip_tokens_v1); the trip page's Points game card for
  the organizer link, a remembered one, or the signed-in owner of the trip or any of its rounds; Near you takes
  a course's city / state from the GolfAPI data when the shared record has none. Check: tools/ui-fixes-check.js.
- gps-zoom-right (2026-10-13): zoom on the RIGHT edge, half way down (right thumb); placeZoom keeps it under the
  right-hand stack (wind, Green, Mark shot) when that reaches the middle - never on top (checked 390x844, 375x667).
- gps-wind (2026-10-13): a MANUAL wind sticks for the whole round, every hole, until "Use live wind" (it was this
  hole only); the box reads "Manual" / "Live · 4 min ago"; the dial shows the source and time ("Live · NWS ·
  updated 4 min ago (as of 2:14 PM)"). APPLE WEATHERKIT, built and OFF: gpsWind (firebase-functions/weather-core.js)
  signs Apple's ES256 token on the server (WEATHERKIT_KEY secret + KEY_ID / TEAM_ID / SERVICE_ID params), asks
  currentWeather for the course point (3 decimals), returns mph / gusts / direction / °F / asOf, 10 min cache per
  point. App: gps-config weatherkit: true makes it the first source, NWS the fallback (a failure skips WeatherKit 10
  min); the dial shows the Apple Weather mark + "Other data sources" link with its data. Free: 500,000 calls/month
  with the developer membership; past that Apple refuses (paid tiers are opt-in). Not deployed.
- gps-share (2026-10-13): the Round Menu's "Share" (replaces "Show QR code", app only): the GAME CODE big + Copy
  ("Have the HardPan app? Games › Have a game code? › type this. You get the round + GPS for this course."),
  👀 Spectator (QR + Copy link + the iOS share sheet; the link is the view-only leaderboard, so build 12 / the web
  open it view-only), ✏️ Scorekeeper (organizer only): a group → "Make a scorekeeper code" → CODE-N-KEY + its link
  (index.html?game=&group=N&sk=KEY) + QR; Revoke makes a new code. The round stores only SHA-256 of the key at
  events/<code>/scoreKeys/<N>. The game code typed in the app opens ?spectate=1: view-only (canWritePlayer and
  canScoreBox say no), a "👀 Spectating" badge, no setup / delete / Add a game / Enter Score, GPS for the course
  kept; the round's organizer keeps full access. ?group=N with a code on that group needs the matching sk, else
  view-only + "scorekeeper code not valid"; a group with no code works as before. APP-SIDE ONLY: the database
  rules that would enforce it are a plan (docs/rules-plan-spectators.md), for the main session after Oct 17.
