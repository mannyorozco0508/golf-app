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
1290 suites · 6476 tests · 6474 passing · 0 failing · 2 todo
```

15 HTML pages plus ~20 shared JS modules. The money math lives in three canonical files:

- `money-engine.js` — handicap allocation, match/stroke/wolf engines
- `settlement-engine.js` — the single source of truth for "what did each golfer win or lose"
- `action-model.js` — normalizes "what games are we playing" into one list

**Duplication is intentional.** Several pages carry their own copies of the engines because there's no module system. Parity tests guard them. Never "helpfully" consolidate them.

**The shell is at `CACHE_VERSION` v106** (`47ee108`, 2026-09-12; v105 was `6d6b661` the same afternoon, v104 `048a302`). v105 and v106 are both the course picker — see "The API ceiling" under the proxy section. v104: `tournament.html` prints a pairings sheet — the one a starter holds at 6am — beside the results sheet, through one `printSheet(build)` trigger with two callers. Every team or group is a row, one golfer per line, sorted by starting hole on a shotgun with a blank hole first and `HOLE NOT SET` in the row, the missing-hole count at the top, a withdrawn golfer printed, flagged `WD` and left out of the golfer total, and an `UNASSIGNED` block in individual mode. `tournament_pairings_print_test.js` holds the multiset of printed names against the record; `tools/tournament-pairings-check.js` proves the print CSS on that sheet in Chrome. `sw.js`'s "Moved to v104" note is the record.

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

`database.rules.json` is live on `golfapp-9fb21-default-rtdb`.

**How the rules actually reach the database — read this before deploying.** The
Firebase CLI is **not installed** on this Mac: no `firebase` on the PATH, no
`firebase-tools` in `package.json`. Every rules change has been published through
the **Firebase console** (Realtime Database → Rules → paste → Publish), and the
console is therefore the source of truth for what is live. A CLI deploy would
overwrite the live ruleset wholesale from the repo file, which is only safe if the
two are already identical. The command, for the record, is

```
npx firebase-tools deploy --only database --project golfapp-9fb21
```

(`npx` fetches it on demand — a cached copy sits in `~/.npm/_npx`, which is how
the read-back on 2026-09-11 below worked — but nothing here depends on it.)

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

**The rules cannot be read back over REST *unauthenticated*.**
`/.settings/rules.json` answers `401 Permission denied` without an admin token,
so from a client's position "does deployed match the repo?" is answered
*behaviourally* — the live server refuses exactly the 16 shapes targaryen
refuses and accepts what it accepts — not by diffing JSON. That is the stronger
check anyway: it tests the deployment, not a file.

**With an admin token it CAN be read back**, and that turned out to matter:

    npx firebase-tools database:get "/.settings/rules" \
        --project golfapp-9fb21 --instance golfapp-9fb21-default-rtdb

You are already logged in if you can deploy. This answers a question the
behavioural check cannot: *is the thing running the exact file in the repo, or
something close to it?* Used on 2026-09-11 it returned a ruleset byte-identical
to `database.rules.json` — which is also what made it safe to fire a probe at
`global_courses` that had to be refused. See below.

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

### `gca_` provenance — DEPLOYED AND PROVEN ON THE LIVE DATABASE, 2026-09-11

Until this date `$courseId` appeared **nowhere** in `global_courses/$courseId`'s
validate. Any key at all could be created, as long as the record carried a name
and eighteen holes. With the course importer live, that meant a record could be
filed under `gca_abc12345` while the provider id inside it named a different
course — into a node no client can delete. The clause appended:

    (!$courseId.beginsWith('gca_') ||
     $courseId === 'gca_' + newData.child('source/providerCourseId').val())

The leading negation is the whole design: a key that does not begin `gca_`
short-circuits to true and is **completely unconstrained**, which is what makes
all 36 pre-existing keys safe by construction rather than by luck. All 36 were
tested individually, not sampled — including `zz_scratch_probe`, which has no
`source` node at all and still writes back cleanly.

**Timing was the point.** Zero of the 36 live keys began `gca_`, so the rule
landed at the only moment when a mistake in it could not break a course anyone
was using. A week of imports later, that is no longer true.

**What was PROVEN LIVE**, unauthenticated REST against
`golfapp-9fb21-default-rtdb`, the way any client reaches it:

- A `gca_probe001` record naming `providerCourseId: "wrongid99"` —
  **`HTTP 401 {"error":"Permission denied"}`**.
- A `gca_probe002` record with **no `source` node at all** — same refusal.
- Neither landed. Both keys read back `null`, and the key list is still **36**,
  none of them beginning `gca_`, identical to the committed snapshot plus
  `zz_scratch_probe`.
- The refusal is not a dead endpoint refusing everything: the same
  unauthenticated curl shape wrote to `events/`, read it back, deleted it, and
  confirmed `null`. `events/` was chosen for the control precisely because it is
  the one node whose rules permit deletion, so the control leaves nothing.

**What was NOT proven live, deliberately: the ACCEPT half.**

There is **no way to prove it without permanent debris**, and this records why
rather than leaving it to be re-discovered. Proving that a *matching* `gca_`
write is accepted requires the write to succeed, and `.write` is
`newData.exists()` — no client, script or test can then remove it. That is
exactly how `zz_scratch_probe` came to exist. An unproven accept half is the
better trade against a second undeletable row.

How far it was raised without writing anything: the ruleset was **read back
from the server** and `gca_provenance_rules_test.js` re-run against *that* text
rather than against the repo file — 46/46, including the accept case and the
merge case. So the expression proven by targaryen is known to be the expression
the database is running. The residual gap is narrow and stated plainly: whether
Firebase's own evaluator agrees with targaryen on the accept path. It agrees on
the refuse path — targaryen refuses those two shapes and so did the server.

**The debris-free confirmation arrives on its own.** The first genuine import
creates a real `gca_` row as ordinary use. At that moment the accept half is
proven for free, and so is the merge — check that a subsequent round publish
onto that record still works. Do it then; do not manufacture it before.

**The merge case was measured, not reasoned.** Firebase applies a multi-path
update as writes to the children, and whether the parent `.validate` sees the
merge was an open question, not an assumption. A `{name, data}` update onto an
existing `gca_` record is accepted, so the round publish after an import still
works.

**The first version of that test passed 46 of 46 and was worth nothing.** Its
verdict parser looked for a line shape targaryen does not print — targaryen
emits an ANSI box-drawing table, not `✗ path` lines — so it returned an empty
list every time and every assertion was true of nothing. It was caught by
forcing the rule to an impossible value and watching the suite stay green. That
impossible rule is now a permanent test in the file.

**The provider quota was accidentally a brake on all of this.** At 35 requests
a day, a runaway import could not do much damage. The account is on Pro at
10,000 a day, so that brake is gone and this clause is what remains.

**`global_courses` is enumerable by anyone.** `.read: true` sits on the parent
and has since the file was created, so `GET /global_courses.json?shallow=true`
returns the whole key list to an unauthenticated client. That is how the count
of 36 above was taken. It is not a leak — the node is a shared public course
list — but do not write anything here expecting it to be unlisted.

### tournaments delete rule — DEPLOYED AND PROVEN ON THE LIVE DATABASE, 2026-09-12

`tournaments/$tourneyCode` carried `".write": true` with a validate that admitted
`null`, so anyone holding a code could delete a whole tournament in one write.
Commit `279d9f8` changed the one line to

    ".write": "!data.exists() || newData.exists()"

— a write is allowed when the node does not yet exist (create) or when the new
value is not null (rename, child write, child delete). The only write refused is
the one that would leave the node absent. `.read` and `.validate` are untouched.

**Written test-first.** Five targaryen rows were added to
`security-rules.tests-data.json` before the rule moved: create `tournaments/NEWCODE`,
rename `QRST`, write and delete `QRST/rounds/r1` (all `canWrite`), and delete `QRST`
outright (`cannotWrite`). Run against the OLD rule the delete row was **red** —
`write was allowed` — and the other four green, which is what proves the row measures
something; against the new rule all 85 rows pass with no previously-green row
flipped. Two file-level pins moved with it and say why: the frozen sha256 in
`format_first_wizard_test.js` and the literal `.write` assertion in
`deployment_build_test.js:443`. Neither is what guards the rule; the five rows are.

**Published to the live database via the console on 2026-09-12** and verified by
reading the rules back after a hard refresh. Not deployed from the CLI — see the
note at the top of this section.

## Course data

`course-data.js` holds a searchable directory of 141 courses. Only 26 have local hole data; the rest rely on Firebase `global_courses`, which any golfer can extend by mapping a course once — it then works for everyone, forever.

**Unmapped courses now seed a BLANK grid**, not par 4 with stroke indexes 1–18. That old seed was a complete, well-formed, fictional card that passed every validation check, and saving it poisoned `global_courses` for all users. Blank makes the existing "Hole 1 is missing a Par" refusal reachable. Don't reintroduce a default.

A backfill script lives outside the repo at `~/rattle-backfill`, pulling par and handicap from GolfCourseAPI. Match rate on a 20-course sample was **50%** — good on name-brand clubs, thin on small municipals. **The account is on the PRO plan: 10,000 requests/day.** The free tier is 35 — this line said 50 until 2026-09-11, then 35, and the upgrade landed the same week. The proxy was designed against 35 and its numbers moved with the plan; the design notes below keep the free-tier reasoning because it explains the shape of the code, not because it still binds. Each course still costs two: search returns only a *count* of tee boxes, so the tee data needs a second request by id.

**Seeding the directory by region is not achievable, and no subscription tier changes that.** The open item used to read as an admin-SDK script to seed every course in WA, AZ and OR. The API cannot produce that list: `/v1/search` stops at 25 results with no way past (measured six times — see "The API ceiling" below), there is no list endpoint, no geographic query, and ids are opaque 8-character strings from a 32-character alphabet, so the directory cannot be enumerated by any means. The constraint is the API's shape, not quota. **What is achievable is seeding from a list of course names we supply** — two requests each, search then detail, comfortably inside 10,000 a day. The list has to come from us. And the seeder does **not** need the admin SDK: `global_courses` is writable under the normal rules, gated by the `gca_` provenance validate, so a seeder should be *subject* to that rule rather than exempt from it.

## The course API proxy — configuring it in Cloudflare

`functions/api/` holds a Pages Function that proxies GolfCourseAPI so the key is never in the browser. **The picker calls it** — `admin.html` fetches `/api/course-search` from the "Search online" row and `/api/course/<id>` from the confirm panel (`8dd55d5`, v99). This paragraph said "nothing in the app calls it yet" until 2026-09-12; that was stale by a wave.

### The API ceiling — SETTLED 2026-09-12, DO NOT RE-INVESTIGATE

Six live requests across two sessions, all through `tools/golfcourse-contract-check.js --live` (`adf5b91`, `48d2077`), established this and it is not worth a seventh:

- `/v1/search` returns **at most 25 courses** and carries **exactly one top-level key, `courses`**. No metadata, no `total_records`, nothing to say the list was cut. An unmodified "Streamsong" search returned four; "Golf Club" returned 25.
- **`page`, `current_page`, `page_size` and `offset` are all ignored.** All five request shapes — unmodified, `page=2`, `current_page=2`, `page_size=100`, `offset=25` — returned the **same 25 ids in the same order, compared whole**. A second page that begins with the first page's first course is not a second page.
- The spec's `Metadata` schema (`current_page`, `page_size`, `first_page`, `last_page`, `total_records`) describes a paging model the endpoint does not implement; it is referenced by no endpoint and honoured by no parameter name it implies.
- There is no list endpoint and no geographic query, and ids are opaque 8-character strings from a 32-character alphabet. **The directory cannot be enumerated by any means.**
- If the vendor has paging, it is undocumented. **The next step is asking them, not another request.**

What the app does about it (`47ee108`, v106): at 25 or more results the picker says *Only the first 25 are shown — the list stops there. If yours isn't here, try a narrower search: add the town, or the club's full name.* It deliberately does **not** claim how many matched, because the API never says; `course_import_test.js` refuses "N matched", "of N", "total" and "exactly" in that sentence. The add row is offered **below** that notice, with a narrower-search caveat, because adding creates a key no client can delete and the golfer's course may simply be the 26th match. Below 25 nothing changes: a list under the ceiling is complete. Held at 24, 25 and 26 — 26, which the API never returns, so a raised ceiling cannot be missed in silence.

**Found by the contract check on the way, and fixed in `6d6b661` (v105):** Gore Golf Club, `kjr804p4`, is a real record with **no `location.city`** and state `"Unknown"`. Two golfer-facing strings interpolated it raw and printed the word "undefined" — one of them the confirm button that writes to `global_courses`. The result row at `admin.html:3700` already handled the same record with `(L.city || '?')` and was not changed; the two strings now use that idiom, and `course_import_test.js` holds all three against a fixture shaped like the live record. That was the first run where the check's FAIL was a truth about the upstream rather than about the tool.

**Why a proxy at all, and why the key can only ever be an environment variable.** Cloudflare Pages serves this repository root *directly*, with no build command — measured on the live site, `/package.json` and `/CLAUDE.md` both return 200. So every file in this tree is a downloadable URL. A key in any file would be one too, and `sw.js` would precache it onto every installed device.

### The walkthrough. Do it in this order — the namespace must exist before it can be bound.

**1. Create the KV namespace**

1. dash.cloudflare.com, log in
2. Left sidebar → **Storage & Databases** → **KV** (older accounts: **Workers & Pages** → the **KV** tab)
3. **Create a namespace**
4. Name it `golfcourse-cache`
5. Create

Free plan gives 100,000 reads and 1,000 writes a day. This uses at most 35 writes.

**2. Bind it to the Pages project**

6. Left sidebar → **Workers & Pages**
7. Open the project serving `golf-app-5a5.pages.dev`
8. **Settings** tab
9. **Bindings** (older: **Functions** → **KV namespace bindings**)
10. **Add** → **KV namespace**
11. Variable name: **`GOLFCOURSE_KV`** — exactly that. The code reads `context.env.GOLFCOURSE_KV`; any other name means no cache and no counter
12. Namespace: `golfcourse-cache`
13. Save. If Production and Preview are offered separately, do **both**

**3. The API key**

14. Same Settings page → **Variables and Secrets** (older: **Environment variables**)
15. Under **Production**, **Add variable**
16. Name `GOLFCOURSE_API_KEY`, value = the key
17. **Click Encrypt before saving.** That makes it a secret you can replace but never read back
18. Save. Repeat under Preview if you use preview deployments

**Do NOT set `GOLFCOURSE_API_BASE` in production.** It defaults to `https://api.golfcourseapi.com` when unset and exists only so a local test can point the Function at a stub upstream. Setting it in production would silently redirect every course lookup away from the real API.

**4. Redeploy — the step everyone misses**

19. **Deployments** tab → most recent → **Retry deployment**

Bindings and variables only reach deployments made *after* they are set. Without this the namespace exists, the key exists, and the Function sees neither.

### The verification ladder

Open these in any browser, in order. Each rung tells you something the one before it cannot.

| Request | Expected | If you get something else |
|---|---|---|
| `/api/course-search?q=ab` | `{"status":"unavailable","reason":"query_too_short"}` | Routing is broken. This rung needs no key and no KV, so it is the cheapest proof Cloudflare is serving the Function at all |
| `/api/course-search?q=streamsong` | `{"status":"ok","courses":[…]}` — four Streamsong courses. **This spends one request** (of 10,000 on Pro) | See the reading below |
| the same URL again | identical, instantly, **and no second request spent** | The cache is not working — check the binding *name* |

**The reading — this replaces an earlier version of these notes that was wrong:**

- `query_too_short` on `?q=ab` — routing works
- `not_configured` on a real query — a binding is missing. Check **both** `GOLFCOURSE_KV` and `GOLFCOURSE_API_KEY`, and remember a binding only reaches deployments made *after* it is set, so the answer is often step 19
- `upstream_error` on a real query — the key is present but **wrong**
- `courses` — everything is wired
- **HTTP 500 / "error code: 1101"** — should now be impossible. It meant the Function threw instead of returning a reason, which is what a missing KV binding used to do. If you ever see it again, that is a bug worth reporting

An earlier draft of these notes said a wrong binding name shows as `daily_limit`. It does not and never did — it showed as a 1101, and now shows as `not_configured`.

### Reasons the Function can return

`query_too_short` · `not_configured` · `bad_course_id` · `rate_limited` · `daily_limit` · `upstream_error` · `network`

That vocabulary is closed and documented in `functions/api/_lib.js`; a test asserts every reason the code emits appears in that table and vice versa, so it cannot go stale in either direction.

**The three shapes never collapse.** `ok` with courses, `ok` with an empty array, and `unavailable` with a reason. An `unavailable` carries *no* `courses` key at all — absent, not empty — so a caller that forgets to check `status` cannot read an empty list out of a failure and tell a golfer the course does not exist.

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

- **CLOSED 2026-09-11 — a misspelled course is no longer cached as a genuine empty.**
The proxy cached successful searches for 7 days, and a zero-result search *is* a
success — the API answered, it just answered with nothing. So a golfer typing
"Quintaro" for "Quintero" spent a request to learn nothing, and then that empty
answer was served to everyone for a week, indistinguishable from "this course does
not exist".
  - **What closed it was the Pro upgrade, not a clever fix.** At 35 requests a day
    the trade was real: caching zeros was free protection against a repeated typo,
    and not caching them risked burning the budget on a common misspelling. At
    10,000 a day re-asking costs one request and the wrong answer costs a golfer
    their round, so zeros are simply not stored. `functions/api/_lib.js` asserts
    it both ways — an empty result is fetched again, a non-empty one is still
    cached.
  - **The spelling problem itself is still open and still its own wave.** The
    upstream's `fuzzy_match` is a whole-string substring test, so it fails on a
    misspelling exactly as it failed on "Legacy Golf Club" vs "Legacy Golf
    Resort". Correction has to happen on our side, before the request, against a
    local dictionary. What changed is only that a typo is no longer *persistent*.

- **`window.currentData` in `tournament-scorecard.html` is `undefined`, and two
renderers depend on it not being reached.** A trap for whoever adds a third call site.
`currentData` is declared `let currentData = {}` at script scope (:226). A top-level
`let` does **not** become a property of `window`, so `window.currentData` has always
been `undefined` — measured cold, `typeof window.currentData === "undefined"` on a
rendered card, not inferred from reading.
  - That makes **both** of these effectively `roundScope || undefined`:
    `renderGroup:497` (long-standing) and `renderAll:616` (added in the round-scoring
    wave). Neither has ever fallen back to anything.
  - They work only because `roundScope = view` is assigned at **:274**, immediately
    before the **sole** call site at :276 — `if (group) renderGroup(group); else
    renderAll();` — and `view` is null-checked earlier, so `roundScope` is provably
    truthy at render time. Today this is unreachable, not merely unlikely.
  - **Why it was not fixed in place.** The obvious form, `const currentData =
    roundScope || currentData`, is a TDZ error — the shadowing declaration cannot read
    the outer binding it shadows. That is *why* `renderGroup` reached for
    `window.currentData` in the first place. Fixing one of two twin renderers would
    have recreated exactly the asymmetry the round-scoring wave existed to remove
    (`renderAll` was round-blind while `renderGroup` was not), so `renderAll` was
    written to match `renderGroup` deliberately.
  - **What breaks it.** Any new caller of `renderAll` or `renderGroup` that runs before
    :274, or any refactor that moves the assignment after the render dispatch. The page
    would throw on `currentData.teams` rather than degrade. `tournament_round_scoring_test.js`
    pins the assignment-before-render ordering, which is the part that keeps this safe.
  - Its own wave: hoist the resolution above both renderers under a distinct name and
    pass it in, so neither has a fallback to be wrong about.

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
- **CLOSED 2026-09-12 — `zz_scratch_probe` is no longer in the live database.** The
`global_courses` key the Tier-B probe left behind (see above) reads absent now. Nothing
to remove; the two mentions of it above are history, not a to-do.

- **CLOSED 2026-09-12 — the prize calculator "pays 4th and 5th and nothing to the
winner": NOT REPRODUCED.** The sentence appears nowhere in this repo's history — not in
any revision of this file, not in a commit, not in a test. `payouts.js`
(`allocatePlacePayouts` indexes `amounts[pos-1]`), the `payout-spot-${i}` DOM loop in
`tournament.html` (zero-based), and `computeTournamentPayouts` (delegates to the
shared allocator) were all read and are correct. What every unit test skipped — that
the **rendered** board position is the row handed `spotAmounts[0]` — is now measured
by `tools/tournament-payout-rank-seam-check.js` (`5d15911`) and is green on a clean,
tie-free, single-round, unflighted team board. If the symptom ever resurfaces, the
cases that check does not exercise are the places to look: **ties, flights, a
round-filtered view, individual mode.**

- **CLOSED — Nassau in the main format list is already solved by design.**
`'nassau-modern'` is a wizard-only intent token: `normalizeGameFormatForSave` turns it
into `'stroke'` at save, and `wantsModernNassau()` → `syncSetupNassauAvailability()`
pre-arms the Step 6 wager builder. A saved round never carries the token. No action
needed; do not add a Nassau "format".

- **Traps worth not rediscovering, 2026-09-12.**
  - **macOS has no `timeout`.** A sweep runner written around it exited **127 on all
    57 checks in 0 s** — a run that looks like it happened and measured nothing. Use
    `gtimeout` (coreutils) or a Node-side timeout, and read the per-check exit codes,
    not the runner's.
  - **10,242 leftover `cold-arrival-*` Chrome profile directories in `$TMPDIR`, 593 MB**,
    oldest 2026-09-07. `tools/lib/cold-arrival.js` removes its profile in `finally`; these
    are from runs that never reached it (killed, timed out, or a path around the
    registry). Not cleaned up. Which path leaks them is unmeasured — measure before
    deleting.

- **Still open, named so they are not lost.**
  - **Course seeding — scope revised 2026-09-12.** Not "every course in WA, AZ and OR";
    the API cannot produce that list (see "Seeding the directory by region" under
    Course data and "The API ceiling" under the proxy). A seeder takes a list of names
    *we* supply, spends two requests per course, needs no admin SDK, and must satisfy
    the `gca_` provenance validate like any other client.
  - **Fuzzy course spelling — UNTESTED against the API's own matching.** The Quintero
    item above assumed correction has to happen on our side. But the upstream's
    `fuzzy_match` defaults to true and matches substrings server-side — "hurst" is
    documented to match "Pinehurst" — and nothing here has ever measured what it does
    with a misspelling. **One live request would establish whether this item is already
    solved upstream before anything is built.** Do that first.
  - The loose legacy root keys in the live database — `activeCourseKey`,
    `active_event_mode`, `eventName`, `gameFormat`, `courseData` — orphaned, nothing
    reads them, blocked by the `$other` rule. Left in place deliberately.

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

**TWO OF THESE ARE NOT COLD-ARRIVAL CHECKS, AND THE DIFFERENCE MATTERS.**
`tools/course-api-proxy-check.js` and `tools/golfcourse-contract-check.js` drive
HTTP, not a browser — there is no page to arrive at. Everything else in `tools/`
means "Chrome, cold, touch nothing"; those two do not, and are called out here so
nobody reads them as evidence about a rendered page.

- **`tools/course-api-proxy-check.js`** runs the real `wrangler pages dev` against
  a stub upstream and asserts over HTTP what the unit suite structurally cannot:
  that Pages routes `functions/api/course-search.js` to `/api/course-search`, that
  `context.env.GOLFCOURSE_KV` is a working namespace at runtime, that an encrypted
  variable actually arrives in `context.env`, and that a deploy with **no** KV
  binding returns `not_configured` rather than Cloudflare's `1101`. It takes about
  a minute because it starts wrangler twice — once configured, once not. Needs
  `npm install` first; wrangler is a devDependency.
- **`tools/golfcourse-contract-check.js` SPENDS FROM THE 35/DAY BUDGET and will
  not run without `--live`.** It asks the real API one question — has the success
  shape changed — which is the one thing no stub can ever prove. The gate exists
  because every sweep here globs `tools/*check*.js` and that filename matches; a
  header saying "manual only" cannot stop a glob. Without `--live` it exits 2
  having sent nothing. It reports what it spent, including when a request died
  in flight and may have been counted upstream anyway. Since `48d2077` it takes
  `--query <text>` (default Streamsong) and `--param <name>=<value>`, appended to
  the search URL only when given, and `observed` records every top-level key and
  every id returned — that is how the ceiling above was measured. (The "35/DAY"
  in this bullet's title is the free tier the check was written against; the
  account is Pro, 10,000 a day, and the gate stays regardless.)

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
`trip-money-check.js` · `wizard-wager-check.js` ·
`tournament-pairings-check.js` (clicks the page's own Print Pairings button, then
emulates print media: everything outside the sheet has a zero rect, every golfer is on
it once, the HOLE NOT SET count matches) ·
`tournament-payout-rank-seam-check.js` (the team the board shows first is the team paid
`spotAmounts[0]`, and so on down the paid places — the seam no unit test covers).

**`cold-arrival.js` gained an optional `steps` array** (`048a302`): `{ expression }` or
`{ media: 'print' }`, run in order after arrival, so a check can press the page's own
button and only then emulate print media. The `expression` path is unchanged for every
existing check — the full 57-check sweep was run on the day to prove it.

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
