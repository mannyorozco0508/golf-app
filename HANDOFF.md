# Rattle Golf — Project Handoff

I'm building a golf scoring and betting app. I'm not a coder — an AI assistant writes the code, I review and commit it. I need you to get oriented before suggesting anything.

## What it is

A mobile-first PWA for golf groups who play a lot of side action, now also shipping as a native iOS app. The core promise: **one app tracks every bet, so nobody needs notes, spreadsheets or arguments after the round.**

The defining user is my friend Marty and his Monday group. On any given Monday they might have a main Stroke Play game, a Nassau, multiple Match Play side bets, several presses at different amounts, two separate Skins games between different subsets of players, cross-group bets, and Birdie/KP/Dots — all at once.

The other audience is buddy trips: Myrtle Beach in October, and eventually Bandon, Streamsong, Sand Valley.

## Tech stack

- **Vanilla HTML/CSS/JS. No frameworks, no build step.**
- Firebase Realtime Database (compat 9.22.2), project `golfapp-9fb21`
- Cloudflare Pages at `golf-app-5a5.pages.dev`, auto-deploys from GitHub on commit
- Capacitor 8.5.1 wraps the web app for iOS. Bundle ID `com.rattlegolf.app`, webDir `www/app`
- Repo: `mannyorozco0508/golf-app` (public)
- Tests: Node's built-in runner (`npm test`), plus targaryen for the Firebase rules suite

## How I work — THIS CHANGED, don't trust older instructions

I used to edit only by pasting whole files into GitHub's web editor on an iPad, with no terminal and no way to run anything myself. **That is no longer true.** I now have a MacBook with:

- the repo cloned at `~/golf-app`, with working `git push`
- Node 24 / npm, so I can run `npm test` and paste you real results
- Xcode 16.5, for archiving and uploading to TestFlight
- the Firebase CLI via `npx firebase-tools`

So you can give me terminal commands and I'll run them. For edits, a small surgical patch is fine — I prefer a Python heredoc that asserts the old text exists before replacing it, so it fails safely instead of half-applying. For anything large, still give me a complete file.

I still can't read code well enough to catch a subtle mistake, so **verify your own work.** Pull a fresh tarball rather than trusting `raw.githubusercontent.com`, which serves stale copies:

```
curl -sL "https://codeload.github.com/mannyorozco0508/golf-app/tar.gz/refs/heads/main"
```

## Current state

```
1151 suites · 5858 tests · 5857 passing · 0 failing · 1 todo
```

15 HTML pages plus ~20 shared JS modules. The money math lives in three canonical files:

- `money-engine.js` — handicap allocation, match/stroke/wolf engines
- `settlement-engine.js` — the single source of truth for "what did each golfer win or lose"
- `action-model.js` — normalizes "what games are we playing" into one list

**Duplication is intentional.** Several pages carry their own copies of the engines because there's no module system. Parity tests guard them. Never "helpfully" consolidate them.

## iOS / App Store status

- Apple Developer account active, team `A2Z95T64UU` (Manuel Orozco, individual)
- App Store Connect record exists: Rattle Golf, bundle `com.rattlegolf.app`, Apple ID 6808220335
- **Build 8 was archived on 2026-09-06** carrying web v71. `CURRENT_PROJECT_VERSION = 8` in the project. Internal group "Beta Testers" with automatic distribution on
- **DO NOT USE BUILD 9 — it cannot share a round.** Inside the iOS wrapper the page is served from `capacitor://localhost`, so every share URL built from the page's own location came out as `capacitor://localhost/index.html?game=CODE`, which nobody who receives it can open. That broke the invite link, the QR, every group scorekeeper link, the private organizer link, the follow link and the trip link at once. Fixed in v74; build 10 carries it
- **The bundle is synced to v82. `CURRENT_PROJECT_VERSION` is 20, and builds 18, 19 and 20 have been cut — bump to 21 before the next archive.** The bundle state is verified by `native_bundle_freshness_test.js`, which hashes every shipped file against its repo twin — not by reading this sentence, which is the point. **Builds 14, 15, 16 and 17 shipped the BUILD 13 BUNDLE**: the sync was last run on 2026-09-07, and the four builds after it were archived from those same web assets. Build 17 was still running the three-copy save-button restore, so over-allocating the Main Pool alerted once and left Save & Start Round dead — the round had to be wiped and started over. Do not trust builds 14–17 for anything below. Build 13 is the one Marty's Monday game is played on: skins that do not carry unless somebody said so, and a receipt PDF that contains the money. Build 12 was the first that could join a Cup from day 2, share a round from a code, and refuse a trip recap it cannot attribute. v75 is the one that matters for sharing: on v74 and earlier a foursome could create, save and start a round with **nothing to send anybody** — the only share surface was a card on the setup screen offering a link before the round existed, and the Round Ready panel behind it rendered a sentence telling the organizer to read the round code aloud. v75 also stops the wizard silently deleting a configured Nassau when you tap Back, and makes the Review say what will actually be saved.
- **v75 went into build 11, v74 into build 10.** It was previously synced to v73. v73 is the one that matters: before it, a Nassau set up as $10 front / $10 back / $20 overall settled every segment at $20, and because each auto-press inherits its segment's price the cascade multiplied it — $200 on a wager whose face value was $40. Any build before 9 overcharges every split-stake Nassau it settles
- **Build 8 carried web v71, not v72 — and it happened again, for four builds running.** The native bundle is synced by hand, so it is a snapshot of whenever `node sync-mobile-web.js && npx cap sync ios` last ran — never automatically whatever `main` holds. This paragraph was written after the first time and did not prevent the second, because the failure is an omitted command and prose does not fail. `native_bundle_freshness_test.js` now does: it runs in `npm test`, hashes every declared file in `ios/App/App/public/` against the repo root, and says which of the two hops was skipped. A tree that has never been synced at all SKIPS with the reason printed — a missing bundle cannot ship, a stale one can. v72 (the setup page's link copy, the quiet End control, the back button on admin) is on the web and NOT in that build. Check `ios/App/App/public/sw.js` for what a build actually contains; do not infer it from the repo
- Signing works via automatic signing. The long-running failure was that my team had **zero registered devices**, so Apple would not issue a development profile. Plugging in my iPhone and enabling Developer Mode fixed it. Nothing in `project.pbxproj` was ever wrong — don't go looking there
- Export compliance answer is "None of the algorithms mentioned above" (HTTPS via the OS only)
- **The support address is `support@rattlegolf.com`, live and verified.** Cloudflare Email Routing on `rattlegolf.com`, forwarding to Manny's Gmail, catch-all on. It went live 2026-09-09 and replaced the old `rattlegolf.app` address in `support.html`, `terms.html` and `privacy.html`
- **Manny owns `rattlegolf.com`. He does NOT own `rattlegolf.app`.** Mail to the old address bounced or reached a stranger. (This file deliberately does not spell that address out in full: `HANDOFF.md` is scanned by the same repo-wide rule, and writing it here would re-create the failure the rule exists to catch.) `support_contact_test.js` refuses any email at `rattlegolf.app` repo-wide, and refuses the string in any form at all on the three golfer-facing pages
- **`com.rattlegolf.app` is the permanent iOS bundle id and is NOT a domain reference.** A reverse-DNS bundle id requires no ownership, and it cannot change once the App Store Connect record exists. It appears in **8 files**: `capacitor.config.ts`, `ios/App/App.xcodeproj/project.pbxproj`, `native_packaging_test.js`, `rattle_identity_test.js`, `support_contact_test.js`, `native-ios-release-check.md`, `product-separation.md`, `HANDOFF.md`. Changing it would not rename the app — it would create a different one and orphan Apple ID 6808220335, the TestFlight builds and the reviews
- Privacy policy live at `golf-app-5a5.pages.dev/privacy.html`, support at `/support.html`, terms at `/terms.html`. **Cloudflare serves clean URLs**: `/privacy.html` answers 308 and redirects to `/privacy`, which is 200. Both forms work; use whichever App Store Connect accepts. Verified served 2026-09-09, byte-identical to commit `1eb5c90`

**Not done yet:** external TestFlight testers, the EU trader declaration (required or the app is pulled from the EU store), and the Paid Apps Agreement (required for any in-app purchase; needs banking and tax info).

To ship a new build: `node sync-mobile-web.js && npx cap sync ios`, **then `npm test` — `native_bundle_freshness_test.js` is what proves the sync actually landed**, bump **Build** in Xcode (Version stays 1.0.0), Archive, Distribute → App Store Connect. Running the test after the archive proves nothing about the archive; run it before.

## A test that reads `git ls-files` cannot see itself until it is committed

`support_contact_test.js` forbids any email address at `rattlegolf.app`. To explain
the defect it has to **write that address down**, and to name its own control it
writes a second invented address at the same domain. It scans `git ls-files`, which
lists **tracked** files — and while it was being written it was untracked, so it never
scanned itself. (Neither address is spelled out in this file, for the same reason:
`HANDOFF.md` is scanned by that rule too, and it caught two attempts to write them
into this very paragraph.)

It reported green on every run. Manny ran `npm test` green. Claude Code ran the full
suite green. **Both runs were honest and both were blind to the same thing**, because
the input set was defined by something neither of them changed until the commit. The
moment `git add` tracked the file, `main` went red on the test's own documentation.

**The rule.** When a check derives its input from repository state — `git ls-files`,
a glob, a directory walk, a declared list — ask what that input set looks like *after*
the commit, not just now. A test that is not yet in the set it scans has not been run.
The cheapest way to find out is `git add -N` before the final run, so the file is
listed without being staged for content.

**And the second half: a green suite is not proof the suite saw the change.** This was
caught by a tarball check *after* the push — refetching the branch and grepping the
extracted files, which has no notion of tracked or untracked and simply reads what is
there. That is why the deploy verification exists and why it is not redundant with
`npm test`: they take different inputs, and the difference between them is exactly
where this class of defect lives.

## A removed control is not always safe to restore as it was

**The home screen's game-code field went to the wrong screen for its whole life.**
`joinRoom()` navigated to `admin.html?game=CODE`. Measured cold at four golfers and
at nine, that lands on **wizard Step 7 — the organizer's Review — with "Save & Start
Round" on screen.** Anyone who ever typed a code got the organizer's setup screen,
holding the control that rewrites the round.

Nobody reported it, because almost nobody typed a code: golfers arrive on a link.
That is also why v68 could delete the field on good evidence without the defect ever
surfacing. Restoring the control **as it was** would have restored the bug with it.

v77 brings the field back under a new name, `openRoundByCode()`, pointing at
`index.html` — the scorecard. The rule this leaves behind: when a removed control
comes back, re-derive where it should go. The old destination is not evidence.

## Things in the live database that look alarming and are not

**`app_settings/beta_expiration` is dead data.** It currently reads
`2026-08-31T00:00:00` — a date in the past — sitting in the production database
where anyone poking around will find it and assume the app is about to stop
working, or already has.

**Nothing reads it.** Grepping the whole repo, the only other appearances are in
`security-rules.tests-data.json`, which is fixture data for the rules suite. No
page, engine or service worker consumes it. No beta expires, and moving the date
would change nothing. It was checked in full on 2026-09-06 rather than guessed at.

Leave it. It is recorded here so the next person spends no time on it.

## Firebase security rules — DEPLOYED

`database.rules.json` is live on `golfapp-9fb21-default-rtdb`. Deploy with:

```
npx firebase-tools deploy --only database --project golfapp-9fb21
```

What they do: a `$other` catch-all denies anything not explicitly listed, money fields must be numbers in [0, 100000], scores must be numbers 1–29 keyed `p{n}_h{n}`, `global_courses` entries can be created or updated but never deleted.

What they don't: `events/$eventCode` is still `.read: true, .write: true`, so anyone with a game code can edit that round. That's inherent to having no accounts. Group-link read-only behavior is client-side only.

**Deploying the rules immediately surfaced a latent bug** — `wolfLoneMult` and `wolfBlindMult` were written as strings while every other numeric field was `parseFloat`'d, so every round save was rejected with PERMISSION_DENIED. If a save starts failing after a rules change, look for a type mismatch first.

### `global_courses` Tier-B — DEPLOYED AND PROVEN ON THE LIVE DATABASE, 2026-09-09

Not "deployed and assumed working". Proven against
`golfapp-9fb21-default-rtdb` over REST, unauthenticated, the way any client
would reach it:

- **All 16 forbidden shapes were refused by the server**, `HTTP 401
  {"error":"Permission denied"}` — data as a string, data missing, name missing,
  name empty, a 5,000-character name, par 99, par 0, par `"4"`, hcpIndex 0 and
  99, hole 0 and 19, a one-hole card, a 40-hole card, a hole missing `par`, and
  a scalar overwrite. Nothing landed: the probe path read back `null` after all
  sixteen.
- **A valid 18-hole write was still accepted**, `HTTP 200`, echoed back with 18
  holes — including a real card (Caledonia's own par 3/4/5 data), so the rule is
  not simply refusing everything.

Both halves matter. Sixteen refusals alone would also be satisfied by rules that
reject every course, which would break the "push to global database" flow.

**The rules cannot be read back over REST.** `/.settings/rules.json` answers
`401 Permission denied` without an admin token, so "does deployed match the
repo?" is answered *behaviourally* — the live server refuses exactly the 16
shapes targaryen refuses and accepts what it accepts — not by diffing JSON. That
is the stronger check anyway: it tests the deployment, not a file.

### A course can be created but NEVER deleted by any client

`.write` is `newData.exists()`, so every client-side delete route fails:
`DELETE`, `PUT null`, and a parent `PATCH` with a null child all return
`401 Permission denied`. That is the intended design — it is what stops a
vandal wiping the shared course list — but it has a consequence worth knowing
before you write anything:

**Anything written to `global_courses` is permanent unless removed from the
Firebase console**, which bypasses rules. There is no undo from the app, from a
script, or from a test. Do not write probe or scratch data to this node.

`tournament.html:1509` renders **every** `global_courses` key as an `<option>`
in the round-course dropdown, so a stray key is visible in the Tournament
product. Consumer is narrower: `admin.html:3325` lists only keys starting with
`comm_`, so a non-`comm_` stray does not reach the Consumer picker.

**Tier-B, what it added.** `global_courses/$courseId` now requires `name` and
`data`, a non-empty `name` of at most 120 characters, exactly eighteen holes at
indices `0`–`17`, and every hole to carry `hole` 1–18, `par` 3–6 and `hcpIndex`
1–18. `.write` is unchanged at `newData.exists()`, so a course still cannot be
deleted. **The eighteen is deliberate**: the only publishing path is
`validateCourseGrid()` in `admin.html`, which builds exactly 18 rows, so a
nine-hole course could never be published anyway. Changing that is a decision,
not a patch.

**What Tier-B deliberately does NOT stop, measured rather than assumed.**
Replacing a real course with eighteen par-3s is *allowed*, and always will be —
every field in that payload is individually valid, and RTDB rules validate
fields, not truth. Uniqueness is not expressible either, so a duplicate
`hcpIndex` passes; `hollywood_beach` in the live database already carries
`hcpIndex` 9 on both hole 1 and hole 18, and today's `validateCourseGrid()`
would refuse to re-save it. The real exposure — an anonymous client writing a
well-formed lie — needs the Worker, not a rule.

**`newData.isNumber()` on `par` fires on nothing today, and is not one of the
ten guards.** Removing it changes the outcome in 0 of 4 cases: the string `"4"`,
boolean `true`, `null` and a nested object are *all* already refused by the
range comparison, because a type-mismatched comparison evaluates false in RTDB
rules. It is kept to state the intent and to become the only guard if the range
is ever loosened. Do not count it when counting what protects this node, and do
not "prove" it with a control — it is inert on purpose. The same sentence could
not be written into `database.rules.json` itself: seven test files `JSON.parse`
that file, and a `//` comment makes it throw.

## Course data

`course-data.js` holds a searchable directory of 141 courses. Only 26 have local hole data; the rest rely on Firebase `global_courses`, which any golfer can extend by mapping a course once — it then works for everyone, forever.

**Unmapped courses now seed a BLANK grid**, not par 4 with stroke indexes 1–18. That old seed was a complete, well-formed, fictional card that passed every validation check, and saving it poisoned `global_courses` for all users. Blank makes the existing "Hole 1 is missing a Par" refusal reachable. Don't reintroduce a default.

A backfill script lives outside the repo at `~/rattle-backfill`, pulling par and handicap from GolfCourseAPI. Match rate on a 20-course sample was **50%** — good on name-brand clubs, thin on small municipals. Free tier is 50 requests/day and each course costs two.

## Offline — VERIFIED ON REAL HARDWARE, 2026-09-06

Scores typed in **airplane mode** survived a **force-quit** and synced when signal
came back. Verified by Manny on a real device, not in a harness.

This was the last unrecoverable risk on the October list. A golf course is the one
place this app is guaranteed to lose signal, and losing a hole of scores mid-round
is the failure nobody forgives — it is the reason the group goes back to paper.

**Proven, in full, against the definition set before testing began:**

- a score entered with no connection is not lost
- it survives the app being **force-quit**
- it reaches the database when signal returns
- it lands **exactly once** — no duplicate row on reconnect

That is the whole bar, met. Nothing here is assumed.

### The golfer is told nothing while offline — a product gap, not a defect

Also confirmed on the same device: with no signal there is **no banner, no
spinner, and no indication whatsoever** that a score is queued rather than saved.
The screen looks identical to a normal save.

**The data is safe. The golfer just isn't told.** Those are different problems and
this file should not blur them. Nothing is lost, nothing duplicates, nothing needs
fixing to protect a round — so this is not on the October critical path.

What it costs is confidence, and confidence is why groups keep a paper card. A
golfer who suspects a score did not save will re-enter it, or stop trusting the
app and write the hole down. The absence of a message is doing real work against
the product even though the engineering underneath it is correct.

Worth building when there is room: a queued/synced indicator. Not urgent, and
explicitly **not** a reason to touch the sync path, which is now proven.

## Known open items

- **The trips rule is NOT "trips are protected now". Read this before assuming it.**
**DEPLOYED 2026-09-10** and proven against the live database, not only against targaryen.
`trips/$tripCode` carries `".write": "newData.exists() || !data.hasChild('rounds')"`
— the events idiom with one word changed — so a trip that has rounds cannot be deleted
in one write. `trip_delete_rules_test.js` pins all seventeen scenarios including the gaps.
  - **Live proof, both halves, on a scratch trip `ZZTRIP`.** Forbidden: `DELETE
    /trips/ZZTRIP.json` on a trip holding a round pointer returned **HTTP 401
    `{"error":"Permission denied"}`** and the trip survived it — refused by the server,
    not by the simulator. Permitted: creating the trip and writing
    `trips/ZZTRIP/rounds/ZZR1` both returned HTTP 200. Cleaned up via the documented
    two-write route (delete `rounds`, then delete the trip) and verified: every path
    under `trips/ZZTRIP` reads `null`.
  - **The escape route was proven BEFORE anything risky was created**, because
    `global_courses` left `zz_scratch_probe` behind by checking deletability after the
    write. A scratch trip was created with only `name`+`createdAt`, deleted, and confirmed
    gone — and only then was a version with rounds created. **A trip whose only child is
    `rounds` cannot be deleted by any client at all** (both clauses fail; that is X5), so
    a scratch node in that shape would have been permanent.
Three things about it a future reader must not inherit wrongly:
  - **It guards a whole-trip delete that NO CLIENT PERFORMS.** Every trips write path
    the app can emit was enumerated from source — `trip.html`, `admin.html:5415` and
    `tournament.html:2189` all write into trips/ — and none is a whole-trip delete. The
    only `.remove()` on trips/ anywhere is `trip.html:1132`, a round *pointer*. So this
    refuses a console or hostile write, not a mis-tap. **That is a weaker justification
    than Rule A on events**, where a button every golfer could see issued the destroying
    write and a playing partner actually deleted a live round with it. This closes a
    wide-open node on a public repo; it does not stop an accident anybody has had.
  - **It does NOT back up the wave-3 organizer gate.** Measured, not assumed: with
    `hasTripOrganizerAuthority` stubbed to always grant, a follower's two writes —
    `remove trips/<code>/rounds/<round>` and `set .../countsTowardTrip` — were put to
    this rule as "must refuse" and **both were allowed, 2 failures in 2 tests**. For any
    child write `newData` at `$tripCode` still exists, so the guard clause is never
    reached. The gate stops a follower removing a round pointer; the rule stops a
    whole-trip delete. **Different things, neither one the other's second layer.**
  - **X3, the overwrite, is the destruction path that actually matters for trips, and
    this rule does not touch it.** A PUT of `{name, createdAt}` over a trip with rounds
    erases every pointer as completely as a delete, passes `.validate`, and no rule keyed
    on `newData.exists()` can see it. That is the shape a **colliding trip code** takes;
    `code-issuer.js` is what made it unlikely, not this.

- **`setControlPending` is duplicated in `admin.html` and `trip.html`, knowingly.** Both
copies disable a control, show `⏳ …ing...`, and return a `restore()` the failure path
calls so a refused issue cannot leave a dead button. **They are the same shape, NOT the
same bytes** — 859 chars against 628, and the difference is real: admin's writes into the
tile's `.hw-desc` child so the icon and title survive (the tile reads "Game Day /
⏳ Starting..."), while trip's link has no child to write into and replaces its own text
outright. A shared version therefore has to take that target as an argument, which is
the one piece of design work the move needs. This entry first said "byte-identical";
that was wrong, no test asserted it, and it was caught by diffing the two before
committing a sentence that claimed it.
**It belongs in `code-issuer.js`, which both pages already load** — the same wave that
gave both controls a database round trip is the wave that made a pending state
necessary, so the helper and the cause are already in the same place. It was not moved
because `code-issuer.js` was not in that wave's approval, and moving a shared file to
carry a UI helper is not a change worth making on its own. **Move it the next time
`code-issuer.js` is open for another reason**, and delete both copies in the same edit —
this project has already paid for a hand-written copy in each of two pages, when a
per-press Nassau stake reached the engine but not the pages. `tools/tile-double-tap-check.js`
covers both surfaces, so a move that breaks one goes red.

- `skins.html` (Action tab) doesn't know about participant-scoped Skins games — still shows only the legacy round-wide view. Money is unaffected; the page is misleading
- Four separate "Save as PDF" buttons exist; only the Round Receipt is canonical
- The Tesseract OCR scorecard scanner loads from a CDN at runtime, so it fails offline — exactly where it's most needed
- **Still not tested on an actual course during an actual round.** That remains the real next step. (Offline behaviour specifically *has* now been verified on hardware — see the section above.)
- **No monetization built. v1.1 is specced in `MONETIZATION.md` — read that before touching any of it.** One round stays free forever; a trip is paid. The **Trip Pass is $19.99, trip-scoped and consumable** — bought per trip, so Apple will not restore it, which is fine because the entitlement lives at `trips/<code>/entitlement/paid` rather than on the buyer's device. That is also what makes it exploitable today: **`database.rules.json` is step one and blocks everything else**, because right now any client can write that node, the repo is public and a trip code is six characters. Nothing can be sold until the rules are right. `database.rules.json` is a protected file and needs explicit per-file approval. Note that `MONETIZATION.md` is a plan, not a record — nothing in it exists

## Checks that live outside `npm test`

**DEVICE CHECKS MUST ARRIVE COLD.** Navigate to the URL a user lands on, replace
only the data source, and touch nothing. A check that calls the function it is
checking proves that function works *when invoked* — never that a user can reach
it. That gap hid **five dead wires** in the Ryder feature alone: a render call, a
session pointer, a match format, a Cup surface nothing ever rendered, and a
`<details>` toggle that fired at parse time and poisoned its own stored state.
Every one passed a green suite and a passing device check. `tools/lib/cold-arrival.js`
is the shared harness: it blocks the Firebase bundles, injects a small stand-in
before any page script, and lets the page run its own init, its own listener and
its own render. If the page does not do something on its own, it does not happen.

These exist because the node suite **structurally cannot** assert two things:
**geometry** — `helpers/mini-dom.js` returns a hard-coded zero rect and implements
no layout, so an element can be `display:block` and 0x0 at once — and **DOM
identity**, because it stores `innerHTML` as a string and never builds child nodes,
so inputs inside rendered markup are not real elements. Anything **visual or
binding-related needs one of these tools.** Two of them is a pattern now, not a
one-off: when a change turns on what something looks like, or on which record a
control is bound to, write the browser check rather than a test that asserts the
assumption.

### `tools/home-screen-check.js` — the only check that can see a layout gap

```
node tools/home-screen-check.js
```

Arrives cold at `admin.html` with a resume pointer already in `localStorage`, the
way a returning golfer's phone does, and measures the rendered home screen.

It exists because of a bug **mini-dom structurally cannot see**. The resume control
rendered as `ResumeJLRL4H` with no space, while the markup was already correct:

```html
<a class="resume-link">▶️ Resume <span id="resume-room-badge"></span></a>
```

`.resume-link` is `display:inline-flex`, so the label and the badge are flex items
and **flex layout drops the anonymous whitespace between them**. With no layout
engine there is no way to tell `Resume ABC` from `ResumeABC`. The check measures
the real gap with a `Range` around the label's own text node, and also measures
that the brand mark leads the wordmark and that the lobby asks for nothing typed.

### `tools/orphan-match-check.js` — READ-ONLY scan of the live database

```
node tools/orphan-match-check.js ROUND1 ROUND2 ...
node tools/orphan-match-check.js --trip MYR1
node tools/orphan-match-check.js --self-test
```

Looks for Cup matches stranded under session `s1` by the pre-v65 adder. Two things
about it are deliberate and worth keeping:

- **It proves its own detector first**, against known-bad and known-good fixtures,
  and bails rather than reporting clean. A clean report from a detector that cannot
  detect is a false all-clear, which is worse than no report.
- **It checks the round exists before scanning it.** It once reported `CLEAN` for a
  code that is not in the database at all — every read returned `null`, so it gave a
  clean bill of health for a round it had never read. That is now exit 2.

The rules give `.read` on `events/$eventCode` but nothing on `/events`, so a single
round reads and a listing is denied. **The codes have to come from you**; the tool
cannot discover rounds, and that is the rule working as intended.

### `tools/id-binding-check.js` — the only check that can prove id-to-name binding

```
node tools/id-binding-check.js
```

| exit | meaning |
|------|---------|
| 0 | PASS — every surviving golfer kept the id they had |
| 1 | FAIL — a golfer was repointed; the JSON names who, and from what id to what |
| 2 | the check could not run (Chrome missing, page threw). **Nothing was proven — this is not a pass.** |

A player's id is the primary key for money. Scores live at `p{id}_h{hole}`, dots at
`dots/h{hole}/{id}`, and side-match rosters and Ryder Cup membership are lists of ids.
If a golfer's id changes, their scorecard changes hands, and nothing warns.

**`player_id_stability_test.js` proves the id SEQUENCE is stable** — that deleting the
second of four golfers leaves `[101,103,104]` rather than `[101,102,103]`. That is
necessary, but it is strictly weaker than the guarantee that matters: a sequence can be
perfectly correct while the wrong golfer holds each number.

**The node suite cannot do better, and this is a hard limit, not an oversight.**
`helpers/mini-dom.js` stores `innerHTML` as a string and never parses it into child
nodes. The name and handicap inputs are written into the row's `innerHTML`, so in that
harness they are not real elements — `row.querySelector('.p-name-input')` returns null,
and every name `captureCurrentPlayerInputs()` reads back comes out empty. After any
rebuild the harness has forgotten who is who. It can compare ids to ids and nothing more.

A real browser has real inputs. The tool types four names, clicks the real delete button
on the middle row, and compares the name-to-id map of the survivors against what it was
before. Against the positional-id bug it reported `Cal: 103 -> 102`, `Dee: 104 -> 103`,
and `Cal` inheriting the deleted golfer's id — the sentence the node suite could not say.

Run it by hand after any change to the player list, the wizard's roster handling, or the
id issuer in `admin.html`. It is deliberately outside `npm test`: it needs Chrome, and
this project keeps a zero-extra-test-dependency rule. It adds no npm package — it drives
the installed Chrome over CDP using Node's built-in WebSocket. Set `CHROME_PATH` if
Chrome is not at the standard macOS location.

### `tools/foursomes-entry-check.js` — proves the alternate-shot card is reachable and additive

```
node tools/foursomes-entry-check.js
```

| exit | meaning |
|------|---------|
| 0 | PASS |
| 1 | FAIL — the JSON lists which guarantee broke |
| 2 | could not run (Chrome missing, page threw). **Nothing was proven — this is not a pass.** |

Phase 5 built the entire Foursomes team-score entry — a box per side, WHS allowance,
narrow-path writes, host-side locking — and never wired it into a render path. It was
unreachable for the life of the feature while 590 lines of tests passed, because the two
wiring tests asserted that a string appeared in `index.html`, and that string lived inside
the dead function's own generated markup. The one test named for the feature being
reachable was satisfied by the feature quoting itself.

`ryder_foursomes_entry_test.js` now renders Hole View and proves the card appears. **Two
guarantees are beyond it**, and they are why this tool exists:

- **The card sits between the per-golfer boxes and Prev/Next.** mini-dom builds no
  `hv-player-row` at all (the Full Card `<tr>` has no child nodes there), so the node suite
  can only place the card between the hole heading and the nav row.
- **Individual entry survives.** This wave *adds* the card rather than replacing the
  per-golfer boxes. With no player rows in the harness, a control that deleted them was
  invisible and passed the whole suite.

It also asserts real geometry, so "present but 0x0" cannot pass. Verified to fail on all
three regressions that matter: the call site unwired, the card replacing individual entry,
and the card moved above the score boxes.

Run it by hand after any change to `renderHoleView`, the Foursomes entry functions, or the
Ryder session/format wiring.

### `tools/ryder-arrival-check.js` — proves an organizer lands on the Cup, not on side betting

```
node tools/ryder-arrival-check.js
```

Same exit codes. Arrives cold at `sidematches.html?setup=ryder` — the URL Game Day
redirects to — and at an ordinary `?game=` visit, and compares the two.

It asserts the Cup renders **without anyone invoking it** (the failure that made this
tool necessary), that it is not inside and not below the side-betting card, that it has
real geometry and is on the first screen, that side action collapses on arrival and the
choice is remembered, that the old handoff banner is gone, and that an ordinary visit is
completely unchanged.

Run it after any change to the Matches page layout, the arrival handler, or the Cup
setup surface.

### `tools/round-share-check.js` — no saved round may exist with no link to send

```
node tools/round-share-check.js
```

Same exit codes. Takes a couple of minutes: it opens 27 pages.

For each roster size — 1, 2, 4, 5, 8, 9, 12 — it arrives cold on `admin.html?game=`,
**presses the Save button** from a timer installed before any page script (a thumb,
scheduled: `saveSettings` is never named), and then reads the Round Ready screen the
page renders for itself. It fails if any size ends up with no copyable `https` link,
a link not scoped to a group, a link with no copy control on screen, or two groups
sharing one.

Then it **measures the copy instead of asserting it.** It opens the bare round link
and every group link and counts the score inputs each shows and how many are
editable. Every group link must be fully writable for the card it shows; the group
links together must cover the field *exactly once* — fewer and a golfer has nobody
able to enter their score, more and two scorekeepers can write the same card; at or
below four golfers the one link must cover everybody; above four each must cover
less. That last pair is the whole content of the sentence beside the links, and
measuring it is what caught the first draft of that sentence.

Run it after touching the Round Ready screen, `groupLinkNoteText`, the grouping
rules, or `index.html`'s `isMultiGroupRound` gate.

### `tools/wizard-wager-check.js` — a bet you set up is still there when you save

```
node tools/wizard-wager-check.js
```

Same exit codes. Ticks Nassau in the Games step, types the stakes, chooses the two
golfers, taps **◀ Back** and walks forward again — four times — and then walks to
the Review. Every line is a gesture on a control; no function `admin.html` defines
is named in it.

It exists because `helpers/mini-dom.js` **keeps** a `<select>`'s value when
`innerHTML` is rewritten and a real browser resets it, so the defect it guards is
structurally invisible to the node suite. It also runs the same drive with the two
golfers left unpicked, and fails if a Nassau that will *not* be written reviews as
though it were fine.

Run it after touching the wizard's step navigation, the Games step, or the Review.

### `tools/cup-join-check.js` — joining a Cup by code, end to end

```
node tools/cup-join-check.js
```

Same exit codes. Types a host round's code into the real field and presses the real
buttons; `rcJoinLookup`, `rcJoinConfirm` and `renderRyderCupSetup` are never named.

It proves four things: Day 2 joins Day 1's Cup by code and the Cup then appears on
Day 2's scorecard in Day 2's own player ids; a code that is not a round, and a round
with no Cup, write **no pointer at all** (every write the page makes is recorded, so
"nothing was written" is watched rather than inferred); a duplicate name on the
JOINING round sends the organizer *here* while one on the host names the host; and a
`ryderCupRef.sessionId` pointing at a session that no longer exists refuses instead
of rendering the whole Cup.

**Scoring is asserted unblocked in every failure case** — 76 of 76 inputs editable.
A Cup that will not load has never been a reason a golfer cannot post a score, and
that is the one thing here that must not change.

Run it after touching the Cup card, the pointer, `resolveRyderCupForRound` or
`ryderUnavailableReason`.

### The rest of them, one line each

`cross-round-identity-check.js` (the same golfer across rounds) ·
`foursomes-entry-check.js` · `home-screen-check.js` · `id-binding-check.js` ·
`nassau-stake-check.js` (a split-stake Nassau prices every segment) ·
`orphan-match-check.js` (READ-ONLY, against live data) ·
`receipt-identity-check.js` · `round-setup-check.js` (the destructive control is
quieter than Save, the page has a way back, and **nothing that shares a round has
crept back onto the setup screen**) · `round-share-check.js` · `ryder-arrival-check.js` ·
`share-url-check.js` (every builder returns `https` from a non-web origin) ·
`trip-awards-check.js` (awards refuse a merged name; no page renders a literal escape) ·
`cup-join-check.js` ·
`trip-money-check.js` · `wizard-wager-check.js`.

## How I want you to work

- **Verify, don't assume.** Check that a change actually landed, from a fresh tarball
- **Run the tests before you tell me something is done.** A change that breaks a test is not finished. I have `npm test` now, so there's no excuse for guessing
- **Don't change betting math** without stopping and explaining first. Handicap allocation, the match/stroke/Nassau/Skins engines, and the whole-dollar settlement allocator are off-limits by default
- **Audit before you code.** Read the actual production path rather than inferring from function names. Several times an assumption about how something worked turned out to be wrong in a way that mattered
- **Never weaken a test to make a change pass.** If behaviour genuinely changed, update the assertion to the new contract and explain why it's still as strong
- **One step at a time.** Give me one command or one action, let me report back, then continue. Don't hand me ten steps at once
- Phone-first. Primary target is 360–430px

## What I'm asking you

[Replace this line with your actual question.]
