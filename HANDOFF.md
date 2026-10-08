# Rattle Golf — Project Handoff

> **Web brand split (2026-09-23).** Consumer is **HardPan**. Tournaments are **Rattle Golf** again (Rattle Golf Tournaments), not HardPan Tournaments. The consumer mark is a dimpled ball on a firm ground line (bone, then forest green). The lobby header is that ball (`hardpan-icon.svg`) beside the HTML word HARDPAN, on `#0B0F0C`. The outlined lockup SVG is not the header: on a phone its counters filled. Consumer tab and PWA icons are the ball alone. The tournaments landing says Rattle Golf under the ball and Tournaments on the right. Tournament favicon and PWA icons are the prior Rattle Golf banner (cream field, green R, RATTLE GOLF / TOURNAMENTS), not the HardPan ball and not the word HARDPAN. `support@rattlegolf.com`, Rattle Golf LLC, bundle id `com.rattlegolf.app`, and `tournaments.rattlegolf.com` stay. The repo display name is HardPan. **Do not archive, upload, or sync a binary until 1.0.3 is approved and released.** Native icons, splash, and Xcode display name are HardPan on main (prep only). Shell cache `golfapp-v210-tee-autofill`. Course setup fills Slope and Course Rating from the tee the golfer picks; it does not ask for them by hand. A course with no rated tees keeps the Index as the Playing Handicap and hides that block. Consumer cache `consumer-v52-tee-autofill`. Tournament cache `tournament-v54-rattle-golf`. Setup writes on an owned round stay the owner's uid; the organizer link opens the screens and does not save by itself.



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
6799 tests · 6797 passing · 0 failing · 2 todo   (2026-09-13, npm test, twice)
```

15 HTML pages plus ~20 shared JS modules. The money math lives in three canonical files:

- `money-engine.js` — handicap allocation, match/stroke/wolf engines
- `settlement-engine.js` — the single source of truth for "what did each golfer win or lose"
- `action-model.js` — normalizes "what games are we playing" into one list

**Duplication is intentional.** Several pages carry their own copies of the engines because there's no module system. Parity tests guard them. Never "helpfully" consolidate them.

**The shell is at `CACHE_VERSION` v117** (Wave 2 flights, 2026-09-13 — v114 through v117 are one commit; v112/v113 are `7d24422`, skins wave 1; v106 was `47ee108`, 2026-09-12; v105 was `6d6b661` the same afternoon, v104 `048a302`). v105 and v106 are both the course picker — see "The API ceiling" under the proxy section. v104: `tournament.html` prints a pairings sheet — the one a starter holds at 6am — beside the results sheet, through one `printSheet(build)` trigger with two callers. Every team or group is a row, one golfer per line, sorted by starting hole on a shotgun with a blank hole first and `HOLE NOT SET` in the row, the missing-hole count at the top, a withdrawn golfer printed, flagged `WD` and left out of the golfer total, and an `UNASSIGNED` block in individual mode. `tournament_pairings_print_test.js` holds the multiset of printed names against the record; `tools/tournament-pairings-check.js` proves the print CSS on that sheet in Chrome. `sw.js`'s "Moved to v104" note is the record.

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

- **BEFORE THE NEXT TESTFLIGHT OR SUBMISSION - THE REVIEW NOTES ARE OUT OF DATE (2026-09-19).**
  The reply to the September Guideline 2.1 "Information Needed" described the iOS course
  directory as one golfers cannot add to or edit and named Firebase as the only external
  service. Both stopped being true on 2026-09-19: the online course search runs in the shell
  (the "Search online" row, `/api/course-search` and `/api/course/<id>` through the Cloudflare
  proxy to golfcourseapi, the import's `global_courses` write, and `gca_` reference cards
  listed in the native picker). This is a LOCAL build for Manny's phone only; nothing has
  been uploaded. Before any upload the Review Notes must (1) name **golfcourseapi** as a
  second external service, reached through the app's own Cloudflare proxy, and (2) describe
  **Search online as importing reference scorecards** from a course database - not golfers
  creating or editing courses. What is still native-only: the hidden panel (five taps), the
  publish of an EDITED card from Save & Start Round, and the `comm_` community list (the
  stranger-content claim - a separate decision). `native_review_surface_test.js`'s header
  records the inversion; recorded here, not acted on.
- **The native shell reaches the proxy since a3b748d (2026-09-19):** `functions/api/_lib.js`
  echoes `Access-Control-Allow-Origin` for exactly `capacitor://localhost`,
  `http://localhost` and `https://localhost` (+ `Vary: Origin`); a same-origin web request
  gets nothing added; an unknown origin gets nothing. `admin.html courseApiBase()` names the
  proxy by `GOLF_WEB_ORIGIN` inside the shell and is `''` on the web - the same proxy, no
  second path. Measured live after the deploy (a real GET each way; the headers are in
  `rattle-cors-deployed-20260919.txt`). Until then native search could not have worked
  even without the guards: a relative `/api/...` resolved against `capacitor://localhost`.

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

What they don't, as of 2026-09-23: `events/$eventCode` is still `.read: true`, so anyone with a game code can watch the round. Setup writes on a round that has `ownerUid` are the owner's uid. Scores and the other play paths stay open to a code-holder. A legacy round with no `ownerUid` is still writable by anyone who has the code. The rules file in the repo is not what the live database is running until it is pasted into the Firebase console — see "Owner-only consumer setup" below. Group-link read-only behavior for *which card you can type on* is still client-side only.

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
product. Consumer is narrower: `admin.html`'s `populateCourseDropdown` lists
keys starting with `comm_` (a hand-typed "+ Add as a new course") **or `gca_`**
(an online import, keyed on the provider's id) — corrected 2026-09-16. Until
then it listed `comm_` alone, and "a non-`comm_` stray does not reach the
Consumer picker" was recorded here as a safety property. It was also hiding
every legitimate import: `gca_bwcdmzcy` "Legacy Golf Resort" was written from
Manny's phone on 2026-09-14 08:13 and never offered again. The property that
replaced it: **the Consumer picker lists exactly the two prefixes the app itself
writes, and a key with any other prefix — a directory id filled in by hand, a
probe, a stray — reaches the picker only through the shipped directory or not at
all.** `course_picker_imports_test.js` holds both halves (a `zz_` key is asserted
NOT listed). The native picker lists neither prefix — see the next paragraph.

**Imported courses on iOS (open, 2026-09-16).** The native picker lists no
community course of either prefix: `comm_` was hidden for the App Store 2.1
reply ("user-generated content from strangers"), and this wave left `gca_`
under the same rule rather than draw a line the review reply did not draw.
Claude's view, for Manny to decide: an import is a course database's card
(name, address, tee sets, provider id, `importedAt`), chosen by a golfer and
confirmed by name and city — not a stranger's hand-typed grid — so showing
`gca_` natively is defensible and useful (Legacy and Dobson Ranch are Phoenix
courses the iOS golfer plays every week). Against it: the online search itself
is a native no-op (the review surface), so a native golfer could SEE imports
but never make one, and the community section would reappear on the surface
the reply promised was gone. If it is shown, `native_review_surface_test.js`
and `course_picker_imports_test.js`'s native case need re-pinning with the
reply in hand.

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

**The provider quota is accidentally a brake on all of this.** At 35 requests a
day, a runaway import cannot do much damage. This paragraph said "the account is
on Pro at 10,000 a day, so that brake is gone" from 2026-09-11 to 2026-10-03.
**It was never true — the account is the free tier.** The brake is still there,
and this clause is what backs it up.

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

### ownerUid and registrations — PUBLISHED (rules wave 2026-09-12; live since 2026-09-15; schema 2026-09-16)

**Live.** This block reached production on 2026-09-15 with the Wave 2 organizer
rules deploy (the whole file, read back JSON-equal). The heading above used to say
"COMMITTED, NOT YET PUBLISHED" and was stale for a day. On 2026-09-16 Manny
published the registration FIELD SCHEMA (below) to the Firebase console by hand
from the repo file — sha 40f2ae74 — and the live read-back was byte-equal after
the CLI's trailing newline, JSON-equal, three independent reads.

**The schema is CLOSED.** `registrations/$code/$entryId` ends in
`"$other": { ".validate": false }`: any key the rules do not name is refused. So
EVERY future registration field is a `database.rules.json` change published by
hand in the console, not a deploy — a form that starts sending a new key before
the rule names it is refused by the database, not by the page. What the rule says
(2a, 2026-09-16): a public create must carry `fullName`, `email`, `phone`,
`createdAt` and may NOT carry the desk's `paid`, `paidAt`, `approvedAt`,
`playerId`, `teamNum` (before this a golfer could sign up already paid and
approved — targaryen against the old file accepted it); the owner may create or
update with them; `ghinOrHandicap`, `shirtSize` (XS|S|M|L|XL|XXL|XXXL),
`dinnerCount` (whole, 0..20), `teamPreference`, `holeSponsorship` (boolean),
`sponsorName` are optional and typed. `security-rules.tests-data.json` holds 56
registrations rows; `tournament_registration_2a_test.js` knocks each boundary out
of a copy and shows the rows fire.

**This node holds the first personal data this app has ever stored** — email and
phone for every golfer in a field. Everything before it was scores and names.
Read is owner-only; the form says what it collects; nothing else reads it.

The 2026-09-12 diff (+13 / −1) added two things to `database.rules.json` and changed
nothing else — `tournaments/$tourneyCode`'s `.write` is untouched (the `$entryId`
`.validate` shown here is the Wave 1 shape, superseded by the schema above):

    "tournaments": { "$tourneyCode": {
        ".validate": "(newData.hasChildren() || newData.val() === null) && (!data.hasChild('ownerUid') || newData.hasChild('ownerUid'))",
        "ownerUid": { ".validate": "(!data.exists() && auth != null && newData.val() === auth.uid) || (data.exists() && newData.val() === data.val())" }
    } },
    "registrations": { "$code": {
        ".read": "auth != null && auth.uid === root.child('tournaments/' + $code + '/ownerUid').val()",
        "$entryId": {
            ".write": "root.child('tournaments/' + $code + '/ownerUid').exists() && ((!data.exists() && newData.exists()) || (auth != null && auth.uid === root.child('tournaments/' + $code + '/ownerUid').val() && newData.exists()))",
            ".validate": "newData.hasChildren(['name', 'createdAt']) && newData.child('name').isString() && newData.child('name').val().length > 0 && newData.child('name').val().length <= 120 && newData.child('createdAt').isNumber()"
        }
    } }

**What is and is not a boundary** *(as of this wave; superseded on 2026-09-18 —
see "tournaments/$code is narrowed" below, where structure became owner-only and a
code-holder writes scores and nothing else).* Anyone holding a code could still write
a tournament's teams, players, rounds and scores signed out — the Setup gate on
`tournament.html` remained a guardrail. Two things became boundaries here: `ownerUid`
(set once, by a signed-in client, to its own uid; never taken, changed or dropped —
a whole-record PUT that omits it is refused, and so is a code collision onto another
organizer's tournament, which before this wave silently overwrote it) and
`registrations/$code` (owner-only read; create-only for anyone, but only under a
tournament that HAS an owner, so a submission never lands where nobody can read it;
owner may correct an entry; nobody deletes one). The rules do **not** require a
tournament to have an `ownerUid` — a stale bundle still creates a legacy record.
*(Both of those sentences stopped being true on 2026-09-18: a create now needs a
signed-in owner by rule, and a legacy record is frozen.)*

**Measured.** 31 rows added to `security-rules.tests-data.json` (116 total, 0
failures; 85/85 pre-existing unchanged). Every write shape `tournament.html` and
`tournament-scorecard.html` actually make was run against the real file through
targaryen's JS API, including the one multi-location `update()` at the tournament
node (`autoAssignShotgunHoles`): all allowed signed out on an owned record. The one
new failure an organizer can meet: creating with a stale `authUser` (signed out in
another tab) is refused with the SDK's `PERMISSION_DENIED` after the form is filled.
Wave 1 of the registration UI now writes `registrations/` from
`tournament.html?register=CODE` (create) and from the Setup tab (owner Paid /
approve). A form on a LEGACY tournament is refused in the page before the write —
the rules would refuse it too, and nobody could read it.

**The registrations rows were green before the block existed.** `$other` already
refused everything under `registrations/`, so seventeen negative rows proved nothing
about the block. `registrations_rules_isolation_test.js` stubs the block permissive
(`{".read": true, ".write": true}`) in a temp copy and requires all seventeen to go
red, the three positive rows to stay green, the 96 rows outside `registrations/` to
hold, and the clean file to be green. The count is read from the data file, not
typed. Two old wave guards (`code_length_test.js`, `firebase_vendor_test.js`) asserted
the rules never mention `auth`; both now assert `auth` appears in exactly the three
expressions above and nowhere else.

**Two clauses behaved differently from the plan under negative control, neither
changed:**

- Removing the child `ownerUid` `.validate` frees take-over and the two wrong-uid
  rows, but NOT "nobody clears it". Removing the parent `.validate` clause frees the
  PUT-dropping row AND the clear row. A child `.validate` is not evaluated when that
  child is written null, so **the parent clause alone is what refuses clearing
  ownerUid.**
- Removing `auth != null &&` from the ownerUid validate moved no row: in targaryen
  `newData.val() === auth.uid` evaluates false on a null auth by itself. The clause is
  stated intent, kept as written; a second control (uid comparison relaxed) proved the
  "nobody sets it" row is live.

**Two UNKNOWNs — settle in the Rules Playground BEFORE the console publish, not
after:**

1. Whether the real engine evaluates the PARENT `.validate` on a child write.
   targaryen does (that is what refuses "remove ownerUid"). If the real RTDB does
   not, `remove(tournaments/X/ownerUid)` would go through, and the clear row is
   guarded by nothing. Playground check: path `tournaments/<an owned code>/ownerUid`,
   write `null`, unauthenticated — must say denied. Then the same as the owner's uid —
   must also say denied.
2. Whether the real engine treats `auth.uid` on a null auth as false (as targaryen
   does) or as an evaluation error (also a refusal). Either way the write is refused;
   the question is only whether the `auth != null` clause is doing anything.
   Playground check: `tournaments/<a fresh code>/ownerUid`, write any string,
   unauthenticated — must say denied.

**Published (2026-09-15, then the schema on 2026-09-16).** The console is the deploy;
the commit is the record. The two Playground UNKNOWNs above were not run as
Playground checks; the deploy went out with the Wave 2 organizer rules and the live
behaviour was proved against the real database on 2026-09-15 (the Monday test,
the create gate, the claim refusals — see the organizer-gate notes).

## tournaments/$code is world-writable — the scorecard link is one door of several (Option A, 2026-09-16)

**The rule.** `database.rules.json` `tournaments/$tourneyCode` `.write` is
`"!data.exists() || newData.exists()"`: any write that does not DELETE the tournament
is accepted from anyone — signed out, no page — who knows the code. Scores, team names,
rosters, the course card, a round's status, a whole-record PUT that keeps `ownerUid`.
Refused: deleting the tournament, taking or changing `ownerUid`, and the
`registrations/` node. The `&team=N` / `&group=GID` scorecard link is the VISIBLE corner
of that: the team number is a URL parameter, nothing checks who holds it, and the page
renders another team's card editable when the parameter is changed
(`tools/tournament-team-link-check.js` measures 18 of 18 editable on team 7's link from
team 1's) — but the same writes go through with `curl` and no page at all. Restricting
the link would close one door on a house with no walls. The round app (`index.html`)
has the same shape: `canWritePlayer` checks the write against the URL's group, not the
URL against a person, and its organizer token is a bearer secret on a world-readable
record.

**What Option A did (this wave), and what it did not.** It stopped the app lying about
the walls and gave the organizer a correction path that is not "open the team's link":

- **"✏️ Correct a scorecard"** on the Setup tab — the one panel the page REMOVES from the
  DOM for anyone but the signed-in owner. It writes the SAME path the team's link writes,
  through `tournamentScorePath` and the three key builders in `tournament-engine.js`;
  `tournament_score_editor_test.js` holds them in parity with the card's own `scorePath`
  (which two suites pin by regex and which was left alone). It refuses SETUP and CLOSED
  rounds as the card does. It is a CORRECTION tool and its copy says the links are how
  scoring happens — an organizer keeping 140 players' cards from Setup would have a bad day.
- **The padlocks came off** the link sections and the scorecard says "Anyone with this
  link can score this card." A glyph is a claim too; `tournament_claims_test.js` now
  counts a padlock heading a links section as one.
  The rule also learned POLARITY: "Anyone who has a link can score that card" is a
  person plus a capability and the rule as first drawn flagged it. It promises no
  protection — it is the admission — so a claim now needs a restriction in the same
  sentence (only, cannot, nobody…). The organizer copy is two sentences for exactly that
  reason: joined by a dash, "only" and "anyone can" share a sentence and read as a
  promise, and the test asserts the dash version IS caught. `tools/tournament-team-link-check.js`
  carries the same three-part rule and is bound both ways now: an exclusivity claim over
  an editable link fails it, and so does the admission over a link that stopped being
  editable (measured this wave: team 7's link, 18 of 18 editable, PASS).
- **Nothing about the database changed.** A code-holder can still write every score,
  name and roster. Narrowing `tournaments/$code` so a code-holder may write scores and
  nothing else is a RULES WAVE with a blast radius across every organizer write on
  `tournament.html` (teams, rounds, flights, groups, course, payouts — all of them go
  through the same open rule today) and it needs its own recon before it is drafted.

**B and C were considered and not picked.** B — per-team keys in the link, checked by
the rules: the keys are readable while they live on the record (`.read: true`), so they
protect nothing until they move to an owner-only node the rule reads through `root`; and
it changes the score storage path, which re-pins every score reader — engine, board,
printed sheet, goldens. C — anonymous auth on the scorecard with a write-once team claim:
it crosses the consumer/tournament shell boundary four tests hold (`auth-boot.js` is a
consumer shell file), gives one uid two meanings on one origin (the consumer trial gate
trusts the same anonymous uid), and breaks "my phone died" until a release path exists.
Both leave names and rosters open anyway. Recorded so they are not re-derived.

**Filed for the consumer copy pass:** `instructions.html` :125 heads the ROUND app's
scorekeeper links with the same padlock — "🔒 Groups & Scorekeeper Links" — over links that
lock nothing (the round app's group lock is the same URL-parameter shape). Out of this
wave's tournament scope; the same category of claim; take it out with the next consumer
copy pass and let `user_facing_copy_test.js` hold the sentence that replaces it.

## Hosts and Firebase Authorized Domains (read-only recon, 2026-09-16)

**Two products share one Pages project; the custom host is Tournaments-only at `/`.**
`tournaments.rattlegolf.com` resolves to Cloudflare (172.67.176.70, 104.21.96.92) and
serves THIS Pages deploy. `/tournament` is the Tournaments landing. `functions/index.js`
is the Pages mapping for `/`: on that hostname (and `*.tournaments.rattlegolf.com`) it
**302s `/` to `/tournament`**. Other hosts — `golf-app-5a5.pages.dev`, `rattlegolf.com`,
localhost — call `next()` and still get `index.html` (Live Scorecard). The rest of the
tree is still the whole repo (a golfer who types `/admin` on the custom host would still
hit Consumer); the default document is what this Function changes. Cache keys were not
bumped: the Function is not shell HTML, and `sw.js` is network-first, so an online visit
reaches the 302 without a golfapp-v* bump. `tournament_host_root_test.js` drives
`onRequest`; `tools/tournament-host-check.js` measures the routing through
`wrangler pages dev`. The tournament hero band (polish wave) is designed to read as the
Tournaments PRODUCT — parent brand mark plus the word Tournaments — and not as the
site's identity.

**Authorized Domains, as read on 2026-09-16 (public `getProjectConfig`, key-only):**
`localhost, golfapp-9fb21.firebaseapp.com, golfapp-9fb21.web.app, golf-app-5a5.pages.dev,
tournaments.rattlegolf.com, rattlegolf.com`. The earlier recon that morning read a list
with `rattlegolf.app` on it and without the two rattlegolf.com hosts; Manny changed it by
hand in the console the same day. Re-read before trusting either list.

**The rattlegolf.app entry, framed correctly.** `rattlegolf.app` is UNREGISTERED — no A, no
MX, nobody owns it (dig, 2026-09-16). An Authorized Domains entry for an unregistered
domain is therefore not a live exposure; it is a BET that nobody registers it later and
gets a pre-authorised origin for OAuth redirect flows against this project. Removed for
that reason. (The first recon called it "an authorized domain a stranger owns"; that was
wrong — nobody owns it.) The `.app` domain is being dropped from the project entirely;
`support@rattlegolf.com` routes; `com.rattlegolf.app` is the iOS bundle id, a reverse-DNS
string that needs no domain and stays.

**Sign-in on the custom host works today, and why.** `tournament.html` signs in with
`signInWithEmailAndPassword` only. Authorized Domains gate OAuth popup/redirect, email-link
action URLs and reCAPTCHA — not the password REST call, which the API key alone gates.
Measured: `accounts:signInWithPassword` with `Referer/Origin: https://tournaments.rattlegolf.com`
and bogus credentials → `400 INVALID_LOGIN_CREDENTIALS` (the wrong-password answer, not a
referrer block). Adding Google sign-in, a password-reset continue URL or email-link sign-in
would have needed the domain listed first; it is listed now.

## The tournament landing (polish wave, 2026-09-16; mark lockup 2026-09-18) — PRESENTATION ONLY

`/tournament` opens on a hero band: `assets/tournament-hero.svg` (a brand-green
fairway, not a photograph) under a dark gradient. The lockup is **logo-mark.png**
(the ball on firm ground, no word on the file) on a near-black disc at left, the words **Rattle Golf**
directly under the mark, and **Tournaments** large on the right. One line under that: "Live scoring + registration for charity,
member-guest, and club events." Below it, in order: the organizer sign-in as a
compact class-styled card (`.signin-card`; same ids, same sentence, same button, same
`signInWithEmailAndPassword`), then the restyled name / course / entry-fee fields
(`.setup-field`, a `$` adornment on the fee) and the format picker as four weighted cards
(one column under 480px, two above; scoped to `#main-format-picker` so the shamble-count
cards and every other `.format-card` are untouched). Nothing the page DOES changed: every
id, every inline handler, the save payload and the gate are the same, and
`tournament_landing_polish_test.js` holds the setup screen's text to the pre-wave
baseline (`tournament_landing_prev.fixture.json`, sha-pinned) plus exactly three
deliberate substitutions. `tools/tournament-landing-check.js` measures the layout cold in
Chrome at 390 and 768px, signed out and signed in, and taps the page's own buttons.

**The band says Rattle Golf Tournaments.** Consumer stays HardPan. The two products share one Pages project;
`tournaments.rattlegolf.com/` lands on this product (302 to `/tournament`) and
that hostname stays. The band names which product this page is. `logo-mark.png`
stays in CONSUMER_SHELL; the hero references it from the combined origin.

**The hero image.** `assets/tournament-hero.svg` is local brand-green fairway art.
The overlay darkens whatever is there. The file is NOT in `TOURNAMENT_SHELL` and is
not precached: `.tourney-hero-art` paints `#0f4c3a` under it, so offline or before
the image arrives the band is a plain brand-green with the lockup on it. Precaching
it means adding a subdir to the shell copy in `build-shell.js`, which copies flat
names today.

**Two fixtures re-pinned, deliberately.** `tournament_anonymous_owner_prev.fixture.json`:
the sign-in panel's tag structure changed (class-styled card); every string collapsed on
`[\s|]+` is identical to the 6536216 capture — words, ids, display, alerts, sets. The
setup-screen baseline is new this wave. The claims test's glyph rule is scoped to a padlock
heading a LINKS section; a padlock in the hero would be caught only by the landing
baseline, not by the claims rule — measured with a control, and worth knowing.

## The scorecard rows live once — scorecard-rows.js (2026-09-16, wave 1 of tap-a-name)

`scorecard-rows.js` (repo root, beside `score-marks.js` and `live-skins.js` — the shell
lists and `build-shell.js` copy flat names, and every shared engine lives there) exports two
functions, as `window.ScorecardRows` in the browser and `module.exports` under Node:

- `scorecardCells({ courseData, scores, players, showNet, ringOf })` — the numbers and ring
  classes per hole, split front / back with OUT / IN / TOT on every row, one golfer or many.
  No markup. **The builder emits cells; the caller chooses the layout.**
- `scorecardRowsHtml(opts)` — the Receipt's layout: one line of 18 in the `receipt-table`
  classes (`rt-name`, `rt-sec`, `rt-net`).

The Receipt (`settlement.html buildReceiptScorecard`) is the first caller: it still decides
WHETHER net matters (handicaps + net pool + skins basis), keeps its chrome (the settle-card,
"📋 Full Scorecard", the scroll wrapper, the legend) and asks the builder for the rows with
`showNet: netMatters, ringOf: markOf` (the trimmed `scoreMarkClass` from score-marks.js).
It no longer draws a cell. `scorecard_rows_prev.fixture.json` holds `#receipt-scorecard`'s
innerHTML byte for byte for eleven rounds captured at 8d2eabf, before the file existed;
`scorecard_rows_test.js` renders each against today's page — identical — and the four
stripped-text baselines and the v151 PDF-lines fixture still pass. `helpers/scorecard-rounds.js`
is the shared round set so the capture and the test cannot drift.

What is deliberately NOT a caller: the Matches tab's mini scorecard (`sidematches.html
buildSideMatchMiniScorecard`). It draws its own rings (`.sm-pcircle1/2`, not score-marks.js)
and has no net row; converting it changes what it shows, which is its own decision. Net
strokes come from the `getStrokes`/`parseHcp` globals exactly as the Receipt read them —
money-engine.js exports nothing under Node, so a Node test that wants net installs the
globals (the way a page has them); with them absent a golfer gets 0 strokes, as before.

**Wave 2 — tap a name on the leaderboard, see their card (2026-09-16).** `leaderboard.html`
loads `score-marks.js` and `scorecard-rows.js`. Tapping a golfer's name cell opens their
scorecard beneath their row; tapping again closes it. The shape, and why:

- **A second `<tr class="board-card-row">` emitted BESIDE `boardRowHtml`** by the two table
  loops (flat board, and the section cards that By Group and By Flight share), never inside
  the row builder, with no `player-name` cell in it — `flights_leaderboard_test`'s one-builder
  rule stands. The card is `ScorecardRows.scorecardStackedHtml(...)` verbatim — two stacked
  nines (1–9 + OUT, then 10–18 + IN + TOT) as two `receipt-table` tables — the page draws no
  cell. A sideways scroller was rejected: a horizontal swipe inside a vertically scrolling
  board fights the page on iOS, and one golfer has no name column worth keeping sticky.
- **`data-player-id` on every golfer row**, and ONE delegated click listener on
  `#board-content` that walks up from the tapped name cell to the row and toggles that id.
  Never by row index — a row's position moves with every score. The two rendered-board
  goldens (`flights_absent_golden`, `leaderboard_positions_golden`) compare with that one
  attribute stripped; the fixture files are untouched, so only the attribute moved and every
  byte of text is still held. The match-play table has name cells on rows with no id, and
  nothing happens there.
- **Open ids in a `Set`, re-emitted at every render.** The board re-renders on every snapshot
  and every toggle, so a card inserted once would vanish when the next score landed. Several
  can be open at once — comparing two golfers' cards is what a board is for — and closing one
  never closes another. Nothing opens itself, so the stripped-text baselines
  (`board_stats_scope_prev`, `group_scope`) hold; a card open by default is asserted red.
- **Net rows on the Receipt's terms:** `ScorecardRows.netMattersOn(round)` — somebody has a
  handicap AND the money was decided on net (net pool, net skins, stableford). That rule was
  the Receipt's own inline block; it moved to the shared file and the Receipt calls it (the
  eleven-round byte-identity proof still holds). The board's Net/Gross toggle is about how
  the STANDINGS are shown and does not add a net row: the card is the round's record, the
  same card the Receipt prints, and a gross board with a net pool still shows net on the card.
- **Visible on every link, no group check** — a score is not a wager (v140's line).
- **Print:** leaderboard.html has no `@media print` at all, so an open card prints as it
  shows. That is right: a golfer who prints the board with a card open asked for that card.
- **Measured at 390 (`tools/board-card-check.js`, cold arrival, a real click on the name
  cell):** card cell 332px wide; front table 11 cells per row with 28px hole cells, back
  table 12 cells with 25px hole cells; 10.88px type; no number clipped; the label column is
  57px and carries the golfer's FIRST name ("Cal"; the full name is on the row above) — a
  first name longer than about nine characters ("Christopher", "Bartholomew") still
  ellipsises there, and widening the column past 57px would push the back nine's hole cells
  under 24px, so it stays; the card cell and the page do not scroll sideways; card height 241px with net rows;
  the card survives a delivered snapshot and shows the new score; By Group and By Flight
  through the page's own pills; a golfer with no scores opens a card of dashes.

## Send Results — the receipt's one button on the title row (2026-09-16)

`settlement.html`'s export control is a small pill, **📤 Send**, in `#receipt-actions` —
the right-hand cell of `.title-row`, level with `#main-title`. It was "📄 Print / Save Receipt",
a full-width `.btn-primary` as the second child of the summary. `setReceiptAction(show)` is the
only thing that renders it: cleared on entry to `renderCombinedSummary`, set at the end of the
settled branch — so a live round (v149), an empty round and the duplicate-name refusal all leave
the mount empty. Same `printReceipt()`, same five export roots, the pill outside every one of
them. 0.7rem against the title's 1.4rem (measured 11.2px / 22.4px). `receipt_send_button_test.js`
holds the screen to `receipt_send_prev.fixture.json` (54a15f2) plus exactly one substitution;
`tools/receipt-send-check.js` measures the rects in Chrome.

**The row on a phone: the pill drops under the title (option 3, 2026-09-16).** `.title-row` is
`1fr auto 1fr` and the title is centred beside the pill only while each side cell can hold the
pill: 282px of title + 2 × (67px pill + 8px gap) = 432px of content = a 488px viewport (56px of
body + container padding). So `@media (max-width: 487px)` makes the row one column: the title
alone, centred exactly where it always was (390: top 283, one line, offset 0), the pill beneath
it right-aligned (390: 67×25 at 296..362, top 319 — the row is 61px tall instead of 30).
`.receipt-actions:empty { display: none }` keeps a live round's empty mount from taking a row or
a gap (measured: without it the live row grows 6px). Measured on both sides of the edge: 488px
pill on the row, title centred; 487px pill below. The breakpoint is derived from the DEFAULT title
"🤝 Settle (Weekend Round)"; a longer event name at a width just above 487 slides off centre
rather than wraps (the pre-option-3 behaviour) — a container query would follow the real title
width, and is the next step if that ever shows on a device. History that led here: "📤 Send
Results" (110px) wrapped the title and shifted it 55px on a phone; "📤 Send" (67px) still wrapped
it, 33px; option 3 removes the shift entirely.

**The native hide rule is LIFTED (2026-09-16, part B) — and the share path has NOT yet run on a
real iPhone.** From 98b4fc7 (2026-09-04) `settlement.html` carried `html.is-native
[onclick*="printReceipt"] { display: none !important; }` — the Consumer 1.0 decision after four
TestFlight builds where `window.print()` did nothing in WKWebView. `native-export.js` has since
built a real PDF and handed it to the iOS share sheet (v151 readable lines, v152 the header once,
v153 the mark), so the App Store app was the one place a golfer could not send a receipt. The rule
is gone (the comment that replaced it says why); `native_print_hidden_test.js` now REFUSES its
return for the receipt and keeps the trip itinerary's rule, which still ends in `window.print()`.
Measured with the Capacitor stand-in in Chrome: the pill is `inline-block` and on screen under
`html.is-native`; `tools/native-pdf-mark-check.js` presses it on the native arm and gets the PDF
with the mark. EVERY proof is Chrome with a stand-in. The device test that decides whether this
is real is written in `~/Desktop/rattle-send-results-part-b-20260916.txt` (what to build, tap,
and see; what "does not work" looks like). Until Manny has run it on a device, treat the pill as
reachable natively but the share path as UNPROVEN, and do not ship a build that relies on it
without that run. Android: the same rule lift applies (pwa-boot sets `is-native` there too);
`native-export.js` uses the same Filesystem + Share plugins, which the Android build links; equally
unproven on a device.

**Pre-existing tool failures, not this wave (identical against HEAD's page with HEAD's tools):**
`tools/receipt-export-check.js` FAIL "no carry rule recorded: the receipt restates the money without
saying it chose the rule itself"; `tools/receipt-denial-check.js` FAIL poolSectionStillRenders /
sideGameRoundExports; `tools/native-pdf-lines-check.js` FAIL "143 vs 146" + "character stream
differs at 9" — probably the date line (the v151 fixture was captured on a Tuesday; today's
"Wednesday, September 16, 2026" is two characters longer), not proven. `tools/native-pdf-mark-check.js`
PASS. All four re-pinned to find the button by its `printReceipt` handler, not its label.

## Sign-in on tournament.html — A GUARDRAIL, NOT A BOUNDARY (auth wave, 2026-09-12)

Organizers sign in (Firebase Auth, email/password); golfers never do — a scoring
link is all a golfer gets, and `tournament-scorecard.html` loads no auth SDK and
calls no auth API (`tournament_signin_gate_test.js` §g pins it). On
`tournament.html`:

- A tournament created while signed in carries `ownerUid` in the same `.set()`
  that creates it. Signed out, `saveTournament` refuses before reading a field.
- An **owned** tournament renders the Setup & Links tab only for the signed-in
  user whose uid is its `ownerUid`. For everyone else the tab and its panel are
  **hidden** — `display:none`, in the tree (until 2026-09-18 they were REMOVED,
  and that froze every non-owner's leaderboard after its first snapshot; see
  "The non-owner's leaderboard froze" below). Signed in as somebody else is the
  same as signed out. The Leaderboard, both print buttons and the scoring links
  stay open to everyone (they moved out of the Setup panel for that reason).
- A **legacy** tournament (no `ownerUid`) is exactly as before: fully open, no
  claim path, nothing writes `ownerUid` onto it. `§d` of the test file is the
  grandfather promise.
- The gate runs on both the record's value handler and `onAuthStateChanged`,
  because a browser delivers them in either order; both orders are driven.

**THE HONEST LIMIT.** This gate decides what the page *renders*. It is a
guardrail against the casual case — a golfer who followed a link into the console
and tapped something — and **not a security boundary**: `database.rules.json`
still lets anyone holding the six-character code write every child the Setup tab
edits — the rules did not change in this wave, and the rules wave that followed
left the parent `.write` alone (it made `ownerUid` and `registrations/` boundaries;
see "ownerUid and registrations" above). No UI string may say
"protected", "secure" or "locked", and the tests refuse those words on the page.
The same sentence sits in a comment at the gate in `tournament.html`.

In **individual** mode the group scoring links moved too: they used to be one line
inside the scoring-group editor (Setup), and in a multi-round event showed only the
round being *edited*. They now render on the Leaderboard tab from the record alone
— every round's groups, labelled by round — while the editor stays in Setup and goes
with it. That is a deliberate difference from the editor, which shows one round at
a time.

`tools/tournament-signin-gate-check.js` measures the signed-out arm in Chrome
(rects, both records); the signed-in arms are mini-dom's, in both arrival orders.

## QR codes for team scorecard links — inline, on a tee sheet, and a library that is finally local (2026-09-18)

**The finding that outranked the ask.** `tournament.html` drew its share-modal QR with
qrcodejs 1.0.0 loaded **from cdnjs at runtime** — the one third-party script left in
the product after Consumer removed its own QR (`round_ready_share_test.js`). Measured in
Chrome with the CDN unreachable: a tap on a team's Share threw `QRCode is not defined`
**and the share modal never opened** — no QR, no link, no Copy button. Live for an
organizer on bad wifi, and no check had ever seen it because all fourteen tournament
Chrome tools passed `blockUrls: ['*qrcode.min.js']`. A tee sheet printed the morning of
an event with the CDN down would have been a page of blank squares. So the library came
local before either surface was built.

**Vendored.** `qrcode.min.js` at the repo root — qrcodejs 1.0.0 by davidshimjs,
**MIT licence** (https://github.com/davidshimjs/qrcodejs), 19,927 bytes, sha256
`c541ef06…`, byte-exact to cdnjs (`qrcode_vendor_test.js` pins bytes and hash the way
`firebase_vendor_test.js` does). Listed in **TOURNAMENT_SHELL, not SHARED**: Consumer
removed its QR deliberately and must not carry this natively. The places, re-derived
from the tree: the file; `tournament.html`'s `<script src="./qrcode.min.js">`;
`sync-mobile-web.js` TOURNAMENT_SHELL; `sw.js` SHELL_FILES (+ the four shell-count pins
42 → 43); `build-shell.js` reads the list (no edit); `round_ready_share_test.js:84-86`
inverted — it pinned the CDN by name "out of scope, deliberately"; the fourteen tools
**no longer block it**, so the QR is measured in Chrome for the first time
(`tools/tournament-tee-qr-check.js`).

**The guard (D).** One drawer for every QR on the page, `drawQrInto(el, url, size,
level)`: draws with the library when it is there and the draw succeeds; otherwise
leaves a sentence ("QR code unavailable — copy the link." in the modal, "QR unavailable"
on a row, "QR code unavailable — open the link." on the sheet) and never an exception.
`openShareModal` opens the modal and shows the link and Copy whatever the QR did. With
the library local this should never fire — which is why it exists. Chrome, library
blocked: the modal opens, the link is there, Copy has a rect (310×54), the box carries
the sentence; before this wave the same tap threw and the modal stayed closed.

**The tee sheet.** A THIRD builder through `printSheet`, not a second mechanism:
`printTournamentTeeSheet() { printSheet(buildTeeSheetPrintView); }`, a `🖨️ Print Tee
Sheet` button beside Print Pairings. One `.tee-cell` per team (42 mm wide, `page-break-
inside: avoid`): the team name, `Hole N` when the start is shotgun (`HOLE NOT SET` when
a shotgun team has none; no hole line on tee times), the QR at **error-correction M**
drawn 132 px = 35 mm, and the URL in small type under it so a dead scanner can still be
typed. Every cell reads its URL from the same builder the Share buttons use. Why M and
35 mm: an 83-character team link is a 37×37 code at M (~1 mm a module at 35 mm); at the
library's default H it is 49×49 and marginal on paper at small sizes. Measured under
print media in Chrome: the manage screen hidden, three cells 42 mm wide, each image
132 px, each cell its own team's URL and nobody else's, `window.print` reached once.
**That measurement was taken 800 ms after the tap and the paper was blank — see the
next section; the sheet's code is now a canvas the page paints itself.**

**The inline QR.** Each public row on the Leaderboard tab's Team Scorecard Links carries
a 64 px `.team-qr` beside its Share (drawn by `renderTeamLinks` through the same guarded
helper, at M, from a `data-url` on the box so the code and the button can never
disagree). The Setup tab's editable cards carry none.

**Groups are out of scope, and why.** An individual event's scoring links are
per GROUP and, on a multi-round event, per group per round (`groupScorecardUrl`,
`&group=<id>&round=<id>`, ~112 characters — a 41×41 code at L, larger at M). That is a
different grid: rows of groups under a round heading, a code per round, and a golfer
looking for the group they are in rather than the team they are on. It wants its own
wave with its own sheet layout; nothing here draws a group QR.

**Found while re-running the tournament tools, not fixed:** `tools/tournament-label-check.js`
exits 2 ("THE FORMAT-LABEL CONTROL IS INERT - the scramble fixture does not read
'Scramble' on the manage header") on HEAD before this wave as well as after it. It
predates the wave (UNKNOWN when it last passed; likely the landing hero, which replaced
the manage header's wording). Its own wave, the way the net-reachable check was.

**Tests.** `qrcode_vendor_test.js` (the file, the lists, no blocker);
`tournament_tee_qr_test.js` (the guard, the sheet's cells and URLs and holes, the inline
boxes, the seams — mini-dom has no canvas, so every code there is the fallback sentence
and the images are Chrome's); `tools/tournament-tee-qr-check.js` (above);
`tournament_pairings_print_test.js` re-pinned to three callers of `printSheet`. Both
caches: `build-shell.js` `tournament-v47-tee-qr`, `sw.js` `golfapp-v172-tee-qr`.

## Event details on the header — date, start time, venue, beneficiary (polish wave, 2026-09-18)

**The first edit-after-save on this record.** Nothing on a tournament could be changed
once created — not the name, the course or the fee — so a date field only on the create
form would have meant rebuilding FYT5K5 to give it one. The **Event details** block on
the Setup tab (`#event-details-block`, under the pool line) writes **per key, the
`startType` shape**: `setEventDetail(key, value)` → `tournaments/$code/<key>` set, or
set `null` when cleared. The four keys and their MACHINE shapes: `eventDate`
`"YYYY-MM-DD"` (`<input type="date">`), `startTime` `"HH:MM"` (`<input type="time">`),
`venue` and `beneficiary` (text, trimmed, ≤ 120). A value that is not the shape is
refused at the writer; a stored one that is not (hand-edited) renders nothing rather
than the raw string. **Never a display string**: `formatEventDate` builds
"Sun, Oct 4, 2026" from the parts (no UTC drift), `formatStartTime` "8:00 AM", at
render. The inputs are filled from every snapshot unless one of them has focus. The
next edit-after-save should copy this block, not invent a second mechanism.

**Where it shows, and where it deliberately does not.** `#manage-t-details` under the
organizer header and `#lb-t-details` under the public Leaderboard header — **new
elements, not a changed sub line**: `#manage-t-sub` / `#lb-t-sub` stay "course • format"
because three Chrome tools grep the format word out of them (`tools/tournament-label-
check.js`, `-net-label-check.js`, `-reachability-recon.js`). Up to three centred lines:
date • time, the venue, "Benefiting X" — hidden (`display:none`, empty) when all four
are unset, so a record from before this wave looks exactly as it did. NOT on the
signup page, the scorecard, or the three print headers — each is its own pin and none
is what a course looks at in a demo; a later wave adds them one at a time.

**Schema-free, proven.** `tournaments/$code` has no `$other` rule; the owner's `.write`
covers any child. `security-rules.tests-data.json` carries rows for
`tournaments/OWNED/eventDate` and `/venue` (organizer can, nobody / stranger / anonymous
cannot; a null write by the owner is allowed) and `tournaments_rules_isolation_test.js`
classes them as ownership negatives. No rules change, no publish.

**Tests.** `tournament_event_details_test.js` — the formatters, both headers through
the page's own value handler (signed in and out), the hidden-when-unset case, escaping,
the writer's shapes and the owner gate, the seams. Controls, restored by sha: the
details rendered INTO the sub line → red; `renderEventDetails()` not called → 10 red; a
display string stored → red.

## The payout calculator at zero — no hollow $0.00 rows (polish wave, 2026-09-18)

**Measured before.** With `entryFee` 0 and three scored teams the results list printed
three ledger rows, every one `$0.00` — a finished-looking payout table for a pool that
does not exist. With a pool the same for every rank past the paid spots, because
`allocatePlacePayouts` (`payouts.js`, **PROTECTED, shared with Trip Mode**) returns
every ranked entry with amount 0 past the paid spots and `renderPayoutResults` printed
them all. And **"No paid spots reached yet." had never rendered**: `payouts` was empty
only when no row had scores, and that case returned "No scores yet" three lines earlier.

**Now — a page filter; the allocator is untouched** (its sha is pinned in
`tournament_payout_zero_test.js` for exactly that reason): `computeTournamentPayouts(…)
.filter(p => p.amount > 0)`. Three sentences, each reachable: no row has scores → "No
scores yet — payouts will show once teams start posting."; every spot amount is 0 →
**"Enter spot amounts above to see payouts."**; amounts set but the only scored ranks
sit on $0 spots → "No paid spots reached yet." (live at last — e.g. four spots, money on
the 4th, three teams). The mismatch banner keeps its own rule (pool > 0 and amounts ≠
pool). "No pool" means exactly `entryFee` 0: the spot amounts live only in the DOM,
never on the record, and the "separate pool" sentence is true — an organizer types
amounts and the calculator allocates them by rank with the shared tie rule.

**Harness limits, stated.** mini-dom does not parse the spot `<input>`s out of
innerHTML, so every amount reads 0 there: `tournament_payout_zero_test.js` proves the
all-zero sentence branch and the banner; the FILTER is Chrome's —
`tools/tournament-pool-and-flight-check.js` **TEST 18** (new) arrives on a fee-0
scramble as the owner and types into the real inputs: untyped → the sentence, 0 rows;
$50 on 1st → one row "1st — Team 1 $50.00", no $0.00; $50 on 2nd only → one row, the
runner-up; four spots with money on the 4th → "No paid spots reached yet."; cleared →
the sentence; the $900 team control → three $300 rows and no $0.00. Control (the filter
removed): TEST 18 bails "typing $50 on 1st did not produce one $50.00 row: … 2nd — Team
2 $0.00 3rd — Team 3 $0.00, rows 3, zeros 2"; in mini-dom only the source test goes
red, which is the limit above, not a proof.

**The tool was exit 2 on HEAD before this wave — repaired, and it was not alone.** The
cause and the four other tools it silenced are harness fault #5 in the list under "The
tee sheet printed blank QR cells", where the pattern lives.

## Desk state badges — Unpaid / Paid / In the field / Needs a team (polish wave, 2026-09-18)

**RULE CHANGED 2026-10-06 (phone QA, event 8HF9WV).** "Needs a team" now means the
team the entry points at no longer exists (removed from the record - no Setup control removes a team today (Wave 2)). The rule below - one
golfer, default name /^Team \d+$/ - flagged every New-team approve, so the desk said
"Needs a team" beside a golfer who had one; measured identical on 732194e, so it was
the rule and not the Wave 1 approve write. The desk row now names the team
(`.reg-state-team`). `tournament_desk_team_after_approve_test.js`. What follows is
the 09-18 record.

**Before.** Paid was an unlabelled checkbox state; Approved was "In the field" in plain
muted text; and a golfer approved with no destination became a one-player team named
"Team N" (`approveRegistration`) that looked like a finished foursome on every surface
— a scorecard link, a tee-sheet cell, a leaderboard row — and the desk said nothing.

**Now.** Each row carries a **state badge** (`.reg-state`, 0.74 rem bold, four
backgrounds): `reg-state-paid` "Paid" / `reg-state-unpaid` "Unpaid" beside the name (the
checkbox stays the control, labelled Paid — the badge is the word that scans, the box
is the thing you tick); `reg-state-field` **"In the field"** — the pinned words, once,
became the badge (`tournament_desk_2c_test.js:298`, `tools/tournament-desk-check.js:135`
stand); `reg-state-needs` **"Needs a team"** beside it when `regNeedsTeam(e)` says so.
A sixth chip **"Needs a team N"** after the five, and a counts line "N needs a team"
only when N > 0 (the main line is pinned as it was).

**"Needs a team" — derived, nothing stored, narrowed.** `regNeedsTeam(e)`: in the field,
on a TEAM event, `teamNum` names a team with exactly one golfer, **and** that team's
name matches `/^Team \d+$/` (or is empty, which renders as "Team N" everywhere). A
one-golfer team the organizer NAMED — the Hawks in the fixture — is a team of one on
purpose and does not need one. No key on the signup (`registrations/$code/$entryId`
has `$other: false` — a publish), no marker on the team; 3-C and 3-D declined. The
desk says it; **Setup is where it is fixed** — no rename or move on the desk this wave
(3-E declined: neither hook exists anywhere on the page; if two screens is too many, a
real event will say so). **Individual events** have players, not teams: no Needs badge
and no sixth chip there — a badge that cannot be true is not rendered.

**Fixture.** `helpers/registration-desk-fixture.js` now has a real singleton-from-
approval record: `deskTeams()` (Eagles ×2, Hawks ×1 named, "Team 3" ×1 default) and
the 14 in-field entries point at them — 12 at team 1, e120 at the Hawks, e130 at
"Team 3"; `TOTALS.needsTeam: 1`. Before, all 14 pointed at one two-player team and
nothing could prove the badge positively.

**Measured at 390 px** (`tools/tournament-desk-check.js`, the OWNED2 arrival): no
sideways scroll (scrollWidth 390), widest row 326 px, every row a payment badge with a
rect (44×23 at 11.84 px), four backgrounds all different (`#fff3e0`, `#e6f4ea`,
`#e3eefc`, `#fdecea`), e130 "Paid · In the field · Needs a team", e120 no Needs badge,
the sixth chip "Needs a team 1" (117×28) tapped → one row, e130. `tournament_desk_
badges_test.js` drives the same fixture in mini-dom. Controls, restored by sha: the
narrowing dropped → the Hawks need a team (2 badges, "Needs a team 2") red in both;
two states sharing a background → red in both; the chip's test swapped for
`regInField` → red.

## The non-owner's leaderboard froze after the first snapshot — the gate hides now (2026-09-18)

**What broke, and since when.** 7d5866d (2026-09-12, the sign-in gate) made
`applyManageGate` REMOVE the Setup and Desk pills and panels for anyone who is not the
owner; `loadTournament`'s value callback already wrote `manage-room-badge` (:4094) —
inside the removed tab. The first snapshot painted (the gate runs last in the callback);
every later one threw at :4094 before `renderLeaderboard`, and the SDK kept delivering
snapshots to a callback that died at the same line each time. **Re-derived in Chrome
(a scratch copy, guard the throwing line, deliver again, repeat): 14 sites** in that
one callback — the seven direct writes at :4094–:4108, then `renderShotgunAssignments`
:1735, `renderRounds` :3039, `renderFlights` :3726, `renderPlayerField` :3352,
`renderScoringGroups` :3600 and `renderTripLinkStatus` :3855 **and** :3856 — before the
board renders "1 Eagles 1 E". The recon said thirteen; the trip-link renderer has two.
Measured across six arrivals × three snapshots: signed out, anonymous, another account
on an owned record, and — since the narrowing (dab91d8) made `canManage()` false without
an owner — the organizer and everyone on a legacy record: five of six froze after
exactly one snapshot; only the owner on an owned record was live. `currentData` still
updated, so a tap on the Leaderboard pill repainted the truth; a spectator who watched
saw the first paint, forever. A spectator's live leaderboard is the product's main
promise, and every check missed it (fault #6 above).

**The fix — Option B, hide, not remove.** `applyManageGate` sets `display:none` on the
two pills and parks the panels through `showTab('leaderboard')`; for the owner it clears
the inline style (the stylesheet shows the pills again) and lands on Setup only when
that call is the one that un-hid them (`gateHidden`), so a later snapshot never yanks
the owner off the Leaderboard. `showTab` refuses a gated tab for a non-owner
(`GATED_TABS.includes(tab) && !canManage()`) — the element being in the tree is not the
test, `canManage()` is. No stash, no re-insertion, no guard per write: every element the
callback writes stays in the tree, and the next renderer added to that callback cannot
reopen this. What removal bought was one dev-tools toggle, against rules that since
dab91d8 refuse every structural write from anyone but the owner; the gate's own
comment said it was "NOT a security boundary" — and its next sentence, that the rules
"still let anyone holding the code write every child", had been false since the
narrowing. Both sentences are rewritten. Option A (guard the fourteen writes) would
have left the fifteenth to whoever adds it; Option C (both) would have been a guard
that never fires.

**What it changes on screen.** Nothing for the owner. For a non-owner, nothing visible:
the hidden pills and panels have no rect (Chrome: 0×0), the Desk panel is empty (its
listener is never subscribed for a non-owner and the rules refuse the read), and the
board now moves. Re-pinned by name, with the reason in each file:
`tournament_signin_gate_test.js` (12 assertions, "must be removed" → hidden),
`tournament_narrowing_page_test.js` (6 tests), `tournament_desk_2c_test.js` (5),
`tournament_score_editor_test.js` (3), `helpers/tournament-auth-surface.js` (`setupTab`
/ `setupPanel` now read "shown", so `tournament_anonymous_owner_test.js`'s captured
fixture keeps its meaning — 15 tests, none re-captured; the recon's list missed these two),
`tools/tournament-signin-gate-check.js` (eight `.exists` arms → a `gated()` helper: in
the tree, no rect), `tools/tournament-desk-check.js` (the late sign-in arm proves the
UN-HIDING in order, not a re-insertion; the signed-out arm: in the tree, no rect).

**Tests.** `tournament_live_board_test.js` — the four losing arrivals in both orders and
the owner control: the board's markup changes on the second and third snapshot; the
gated four are in the tree with display none; showTab refuses; the late sign-in
un-hides and the next snapshot still lands; a record gaining an owner mid-watch; the
source (no `.remove()`, no `insertBefore`, no `gateStash`; the stale sentence gone);
the harness seams. **mini-dom cannot reproduce the throw** — its removed panel answers
null but the badge and the rest are registry elements off BODY, so on the broken page a
twice-fired handler did NOT throw there (the recon claimed it would; measured, it does
not). `tools/tournament-live-board-check.js` is the proof: six arrivals, a second and a
third snapshot through `{ deliver }`, the board must move, no `window.onerror`, the
delivery must reach a listener or the arm bails "proves nothing", the gate hidden not
removed, and the journey self-test. Controls, restored by sha: removal restored → 12 red
in mini-dom (the gate shape; section 1 stays green — the stated limit) and "THE BOARD DID
NOT MOVE" ×5 arms + "was REMOVED" in Chrome; the delivery sent to a path nobody listens
on → exit 2 "REACHED NO LISTENER - this arm proves nothing about the board"; journey's
swallow restored → "HARNESS: journey did not raise the thrown listener". Both caches:
`build-shell.js` `tournament-v50-live-board`, `sw.js` `golfapp-v175-live-board`.

## The copy messages say what they did (2026-09-20, v185)

**Seen on Manny's phone:** Copy Link on Round Ready's "📣 The whole round" block alerted
"Copied Group 0's scorekeeper link! Send this ONLY to that group." **Cause, mine:** the
group-picker wave (75033f1) built that headline by reusing the group rows' copier -
`copyGroupLink(url, 0)` with a placeholder for the number - and that function had one
message, which printed it. **Worse, found while here:** the same wave gave the headline
row the `group-link-row` class, and `tools/round-share-check.js` counts
`#rr-links-box .group-link-row` to prove the group links cover the field exactly once -
measured before the fix: FAIL on every roster size ("expected 2 group link(s), found 3",
"two links can write the same card"). The mini-dom test meant to guard that had sliced up
to the first 'group-link-row', which sat inside the headline's own class list, so its
negative was vacuous - re-pinned with a positive assertion first (CLAUDE.md's rule, met
again). Fixed: `copyRoundLink(url)` and `.rr-round-link-row` (the row's look, its own
class); the tool PASSES.

**The wording** (alerts still - three of the 213 in the Part 3 inventory, gone with the
rest when the toast exists): whole round → "Copied. Paste it into your group text —
everyone picks their own group when they open it." · a group → "Copied Group 3’s link —
Marty, Mike, Tanner, Glen." (`copyGroupLink(url, n, names)`; the names ride the onclick as
an HTML-escaped JSON string, so O'Ray survives) · the organizer link on the scorecard's
Group Links panel → "Copied your organizer link. It can correct any score in the round —
keep it to yourself." (`copyOrganizerLinkFromScorecard`; it had no message at all, only
the "✅ Copied" button, and it grants the whole-field override). The panel's GROUP rows
keep their silent "✅ Copied" button - no dialog was there and none is added. The old
"Send this ONLY to that group" is gone: it warned about a friend scoring the wrong
foursome, and the picker makes the whole-round link the normal path.

**Tests.** `copy_messages_test.js` (10: each copier invoked with the arguments its row's
own onclick carries; the messages; the headline's class; the URL still first in the
onclick, where the coverage tool reads it; the apostrophe; a foursome; the old sentence
gone; the organizer caution; the group rows silent; no organizer row without a token).
Five controls fire (the headline borrowing the group message, the names lost, the wrong
group's names, the counted class back, the caution dropped). `sw.js`
`golfapp-v185-copy-messages`.

## The founder pass, and a line that says where the trial stands (2026-09-20, v184)

> **SUPERSEDED 2026-09-30.** The uid this section names, `k8fY…`, was DELETED during
> the Wave 34 throwaway test, and its pass with it - see the incident at the top of
> "Where things stand". The pass now lives on `h8AxnefqnuZNKv6XwvFFIKRMHSS2`, written
> from the console with `grantedBy: "manny-console"`. Everything below is still the
> right description of what a pass IS and how the rule treats it; only the uid and
> the writing tool are historical.

**THE PASS - a production write, done by hand on 2026-09-20 11:34 UTC.**
`organizers/k8fYkL1hsPb6ZDL3wgQi8hywPi42/pass` = `{ expiresAt: 4102444800000
(2099-12-31), kind: "founder", grantedAt: 1789904076089, grantedBy: "manny-cli", note }`.
**Whose:** `k8fY…` is **Manny's iPhone** - it created FAUNX8 (the Streamsong Red import
of 2026-09-19) and WM26AE; first seen 2026-09-19 18:25 UTC. Written with
`firebase-tools@14 database:update … --force` (the CLI runs as the project owner and
bypasses `.write: false`; the first attempt without `--force` was aborted by the CLI's
confirmation prompt and wrote nothing - read back before and after). The rule reads
exactly one field, `pass/expiresAt > now` (`database.rules.json` :6); `kind` and the
rest are provenance, read by nothing but the standing line below. `wave2_rules_test.js`'s
`anon-passed` case proves a future `expiresAt` opens the create rule past the window.
**IT IS ATTACHED TO THAT DEVICE'S STORAGE, NOT TO MANNY.** The uid is Firebase
anonymous auth persisted in the app's WKWebView storage. Delete-and-reinstall, a new
phone, or anything that resets that storage signs in as a NEW uid, the next Save & Start
stamps a fresh `firstSeenAt` for it, and this pass sits orphaned on the old uid - no
refusal, no message, the wall 21 days later. The standing line is the tell.
**Unwritten, deliberately:** `TFM8Iu07r5QtUzCvrMK6RleS7583` (first seen 2026-09-17
07:38 UTC; four 4-golfer rounds at Camas Meadows / Three Rivers / Tri-Mountain / Lewis
River at 00:38 PDT) - either Manny's Mac browser or Marty's phone; stays as it is until
Manny says which. Its window closes 2026-10-08.

**THE STANDING LINE** (organizer-gate.js `standingOf` / `standingLine` / `readStanding`;
admin.html `loadOrganizerStanding` / `renderOrganizerStanding`, mounts `#rr-standing` on
Round Ready and `#wz-standing` right above Save & Start on the Review step). One read of
`organizers/<uid>` after `authReady`, raced against the gate's `READ_MS` like
`explainRefusal`; the record is kept and both mounts render from it. A live pass:
"Founder pass · setting up rounds is free" (another kind: "Season pass · rounds free to set
up until Mar 4, 2027"). Inside the window, EVERY day of it (`NOTICE_DAYS` is 21, the whole window - Manny's
call): "Free trial · 21 days left to set up new rounds" … "1 day left" - `Math.ceil` so a
partial day is a day, and the same `now < firstSeenAt + TRIAL_MS` comparison as the rule,
so the line and the wall change hands at the same millisecond. Otherwise NOTHING: ended
(the wall speaks), no record (not an organizer), no session, a failed or unanswered read -
say nothing rather than guess. **The tell:** a phone that said "Founder pass" yesterday and
says "Free trial · 21 days left" today has a new uid and an orphaned pass - a sentence
APPEARING, which is why the notice runs the whole window (at 7 days the fresh trial was
silent for two weeks and the signal was an absence nobody notices). **Three homes:** the
lobby (`#lobby-standing`, under the tiles and above Resume - the organizer who never
reaches Review is warned here, the moment the read answers), Round Ready (`#rr-standing`)
and the Review step (`#wz-standing`, above Save & Start). One read, three mounts.
No rules change. `sw.js` `golfapp-v184-trial-standing`.

## One link, one code, then the golfer picks their group (2026-09-20, v183)

**The ask.** A golfer with the app types a code and lands scoring their own four; the
organizer sends one link, not four. **The shape.** index.html: a golfer arriving on a
round with more than one group and no `?group=` in the URL is asked "Which group are you
keeping score for?" - the foursomes by first name ("Group 2 · Manny, Matt, Lance, Kopp"),
one button each, read from the boundaries the page just computed (a regrouped round
offers the groups as they are NOW). A tap navigates to `?game=CODE&group=N`, keeping the
other params; **the lock does not move** - it is the URL, read once at load, and
`hasGroupLock` / `lockedGroup` / the slice / `canWritePlayer` / the badge are untouched
(`pickGroup` sets nothing in place). "Just watching" dismisses it for this round in this
session (sessionStorage `groupPickDismissed:CODE`; a second snapshot must not re-ask) and
leaves the spectator view that was always underneath. Never on a group link, never on a
foursome, never before the roster has arrived. Markup `#group-pick-overlay`, functions
`renderGroupPicker` / `pickGroup` / `dismissGroupPick` beside the group-links panel.

**Two doors.** Round Ready (admin.html `renderRoundReadyLinks`) now leads with the
round's own link - "Send this link to everyone · 📣 The whole round · 12 golfers · 3
groups · Copy Link" and "One link for the whole round — each golfer picks their group when
they open it. Or tell them the code MNDY2A: in the app, tap Open and pick your group." -
in its own `.rr-round-link`, NOT a `.group-link-row` (tools/round-share-check.js counts
those to prove the group links cover the field exactly once; this link covers all of it);
the per-group rows follow under "Or send each group its own link". A foursome is unchanged.
And the lobby's join box (`openRoundByCode`) carries a group again: a typed bare code
lands on the picker; **the typed shortcut "MNDY2A 2"** - the code, a separator the
alphabet cannot produce (whitespace, `/` or `-`; a space is the documented form, it is what
a thumb types after hearing "you're group two"), one or two digits - skips it. The group
is read BEFORE `parseRoundCodeInput` strips punctuation, because codes contain 2-9 and
"MNDY2A2" is the code MNDY2A2. The old comment's reason for refusing a group ("hands
scorekeeper rights to anybody who knows the code") was replaced with what is true: the
lock is a courtesy that keeps four friends on their own card, not a wall - `.read: true`
and the write rule let any client write any child of an existing round, and anybody with
the code can type `&group=3` into Safari - so refusing it only made the app worse than
Safari for an honest golfer.

**Look before it leaps.** The join box reads `events/CODE` through `readWithTimeout` (the
issuer's timer, the read `startFromPreviousRound` already makes) before navigating, with
"⏳ Checking…" on the button, and says its refusals INLINE in `#join-code-refusal` under
the field, never in a dialog: "Enter the game code your organizer sent." / "That code has
a letter no round code uses (I, O, 0 or 1) — check it with your organizer." (before any
read; the alphabet has none of them) / "No round with the code ZZZZZZ — check it with your
organizer." / "Can't check that code right now — try again when you have signal."
(`navigator.onLine === false` before the read, or a timeout/error after). A shortcut
group the round does not have navigates bare - the picker shows the groups that exist.
The note under the field: "Type the code your organizer sent. On a round with more than
four golfers you pick your group next."

**Tests.** `group_picker_test.js` (24: the picker on arrival through the page's own
listener, absent on a foursome and on a group link, the tap's URL and the lock that URL
produces, "Just watching" and its session memory, a regrouped round, the lock's source
unmoved; the join box's read, the shortcut in four spellings, the longer-code ambiguity,
an out-of-range group, the four refusals inline with no read and no alert, a refusal
clearing; Round Ready's headline). Seven controls all fire (the picker on a foursome, a
tap off by one, the lock lost, the existence check skipped, the letter check dropped, the
separator swallowed, a stale roster). `tools/code-entry-check.js` types GAME44 (the old
CODE44 carried an O) on 4 and 9 golfers plus "GAME44 2" and a pasted link, measures the
picker on screen with 3 buttons on the bare 9-golfer arrival and 76/76 editable behind the
shortcut, and two refusals typed and clicked: on the lobby, the sentence on screen, no
dialog. Re-pins: home_code_entry / native_code_entry (async, seeded reads, codes without
I/O/0/1, the note), rattle_icon_system (`openRoundByCode(this)`). `sw.js`
`golfapp-v183-group-picker`.

## Recording a KP pays it (2026-09-19, v182)

**Why Wave B's confirmation went.** pool-engine.js withheld every KP dollar until an
organizer pressed "Confirm KP Winners" in Finish Round. In 102 production rounds that
button was never pressed once; the one round with recorded winners (FAUNX8, Streamsong
Red) sat at RESULTS — NOT FINAL with no Send chip. The ceremony existed to stop a real
defect - a blank KP hole refunding as $8/$9 lines on a receipt that called itself final -
but the distinction that was actually needed is **live vs finished**, not confirmed vs not.

**The rule now** (pool-engine.js, KP block; both engine edits approved per-file):
recorded by a pool participant → **paid**, the moment it is recorded; `kpNoWinner` (an
early call), a winner outside the pool, or a **blank hole on a finished round** →
**refunded** to the field through the branch that always paid an outsider's share back;
a blank hole on a **live** round → withheld ("not yet"). FINISHED is settlement-engine's
word - `computeRoundFinish(data, courseData, savedScores)`, the first half of
`computeRoundSettlement` extracted verbatim (every golfer who teed off has every hole, or
`scoresVerified.verified`), asked behind `typeof`, never re-derived; absent, the round is
treated as live (fail closed - withheld, never refunded; proven by blanking the predicate).
`kpConfirmed` is ignored wherever it still exists. `result.kp.confirmed` → `result.kp.finished`.
The invariant `prizes + refunds + kpUnresolvedCents === totalPoolCents` and the
reconciler's target are unchanged; `settled` is true the moment the cards are in.

**Production on the day it shipped** (read-only): 12 rounds with a KP pot; FAUNX8 starts
paying its two $25 KPs and settles; four finished rounds with every KP hole blank
(7WYT, 97WPZG, 9DVFAZ, RV64U5) start refunding $100 each to their field - intended, per
Manny: they are over and nobody recorded a KP; 7 others (never started / mid-round)
unchanged. No kpCancelled written by hand.

**The pages.** index.html: `saveKpLeader` writes kpLeaders + kpWinners only and shows NO
alert (the block under the nav row is the confirmation - Part 1); `frConfirmKp`, the
confirm button, the "Not confirmed" tags, the organizer-only line and the gate's
"KP winners confirmed" row are gone; the KP Results block names every refund's reason
("Nobody recorded it" / "Nobody won it" / "Not in the pool"); **the cancel button lives
at the foot of that block**, organizer-only, in every state except already-cancelled
(it used to exist only while money was unresolved); the "nobody won it" early-call buttons
stay per blank hole while live. settlement.html: no RESULTS — NOT FINAL branch, each
refunded hole says why ("Hole 7: nobody recorded it · $25 back to the field"), a live blank
reads "not recorded yet · $25 in the pot"; the Send chip appears the moment the cards are
in. trip.html: the "KP results are still unconfirmed in" sentence and the recap caveat's
KP clause are gone (a KP hold only ever accompanies "still in play" now).

**The refund wording a golfer sees** on a finished round where nothing was recorded, three
places: the KP section line above; the summary row "↩️ Refunded to the field (Unclaimed KP
money refunded to the field.) $100 ÷ 12" (the engine's existing reason text, unchanged);
and the per-golfer ledger line, which now says why (settlement-engine.js :1196-1225,
approved): "KP refund · nobody recorded it +$8" - or "· nobody won it" / "· not in the
pool" - one line per refund reason, the rest labelled "Pool refund · <reason>". No new
arithmetic: the golfer's figure is the engine's perPlayerCents; when KP and skins both
refund, that one figure is apportioned between the two lines by the buckets' share (to
the dollar on a whole-dollar round, remainder on the second line) and the lines always
sum to it exactly - kp_settlement_test.js asserts that for every golfer.

**Tests.** `kp_settlement_test.js` rewritten under a header that names why the
confirmation went (37: recorded pays live and finished; the blank hole held while live,
refunded when finished, by cards and by verification, both at once; cancelled unchanged;
the invariant on seven shapes; the reconciler's target; fail closed; Finish Round; the
Receipt settles and the Send chip; the trip drops its hold). Seven controls all fire.
Engine hash pins re-pinned ×20 (pool-engine d47a1e0a → 846f33e3, settlement-engine
42923121 → 9043e7fc) with the reason. `sw.js` `golfapp-v182-kp-pays`.

**Not built:** the dialog inventory (213 sites: 203 alert, 10 confirm) is a report -
`~/Desktop/rattle-kp-pays-plan.txt` §F - and the toast / decision sheet are their own wave.

## The KP picker is legible (2026-09-19, v181)

The "Who is closest?" select had no type size of its own - Chrome's UA default, measured
13.33 px, grey UA border, square corners - beside ft/in boxes at 15.2 px with 8 px
corners, on the control that names who gets the money, tapped on a green in sun.
`index.html` `.kp-select` is now **17 px** (= `.score-input`, the boxes a golfer already
reads on this screen; ≥ 16 px so iOS Safari does not zoom on focus), 48 px tall (the
Prev/Next height), with the block's own border/corners/card background; `.kp-dist-input`
takes the same 17 px / 48 px / border / corners / background (64 px wide) so the three
read as one control; `.kp-dist-label` 0.72 → 0.85 rem; `.kp-current` ("No leader yet" /
"Current: Ann Adams — 8' 4"") 0.82 → 0.95 rem, because that line carries the answer and
is the state most golfers look at. `.kp-btn` (Save KP) untouched:
solid brand green, bold, still the loudest thing in the block.

**Measured at 390** (`tools/kp-entry-position-check.js index.html picker` - a real tap
on Set KP Leader, computed font sizes and rects): select 13.33 → 17 px, 44 → 48 px tall;
ft/in 15.2 → 17 px, 44 → 48; label 11.52 → 13.6 px. The OPEN block 243 → 251 px (+8),
everything below it +8 while the picker is open; then the leader line 13.12 → 15.2 px
added 2 px more: OPEN block 253 px, CLOSED block 99 → 101 px (everything under it +2 on a
KP hole); a non-KP hole's page byte-for-byte the same rects; landing 12 / 12 unchanged.
The head (11.2 px) is a label and stays. `kp_picker_legibility_test.js` pins the rules against `.score-input`'s size;
five controls all fire. `sw.js` `golfapp-v181-kp-picker`.

## The KP entry sits under the Prev/Next row (2026-09-19)

**Seen on a phone**, hole 8, the "Set KP Leader" block was at the bottom of the Weekly
Game panel inside the Action Center - past the recap, the skins panel, the My Round tap,
the panel's label, summary, Net Finish and per-hole list. Nothing in the block needed
the panel: it reads page state and one participant list. Now `index.html` puts
`<div id="kp-entry-mount">` directly after `navRowHtml` and before the Dots block, and
`renderKpEntryMount()` fills it - the pool guard `buildMoneyPoolBanner` had (a pool,
`computeMoneyPool`, a valid result) then `buildPoolKpEntry(r)` with its three gates
intact (a KP pot, a KP hole, a link that may write). `renderCardWidgets` fills it with
the other widgets, so every path that rebuilds the hole card - arrival, Prev/Next, the
snapshot listener via `renderScorecard` - refills it; `toggleKpEntry` and `saveKpLeader`
re-render this one div instead of the Action Center (`renderHoleView` was the other
candidate; it does not re-land the scroll itself, but it rebuilds every score box, so a
half-typed score would die - the one div is the right size). The Weekly Game panel keeps
its label, summary, Net Finish and the per-hole list; nothing replaces the block there.

**The head reads "Hole N Weekly Game KP"**, not "Hole N KP", because on a round that
also plays Dots the Dots line `KP · $2 each` sits under the same nav row and the two are
different money. On a Weekly-Game-only round it reads the same - the head names the game
the pot belongs to.

**Measured at 390 px** (`tools/kp-entry-position-check.js`, cold arrival, the page's own
Next/Prev, HEAD's page as the A/B copy): the block is the element directly after the nav
row, 8 px below it, 99 px tall (`Hole 7 Weekly Game KP / No leader yet / Set KP Leader`);
on a KP hole everything from the who-am-I panel down moved +107 px (pool only) / +111 px
(with Dots: the `KP · $2 each` line and the Dots button move too, and sit under the block);
on a non-KP hole the mount is 0 px and every rect equals HEAD's. The landing is unchanged:
the heading's document top (930 / 1179 px) and its viewport top after a navigation (12 px,
`HOLE_LANDING_OFFSET`) are the same on both holes and on both pages. On a **cold** arrival
nothing scrolls (that is pre-existing): the heading is at 930 px, the block at 1459 px,
both below an 844 px fold; after any Prev/Next the block is at viewport 541-640 px.

**Tests.** `kp_entry_position_test.js` (10: source order, the guard and the hooks, the
gates on the new mount, the one-div re-render, the seams). `kp_leaders_test.js` and
`money_pool_test.js` re-pinned to the mount and the new head - the assertions travel
unchanged. Two more pins the full suite found: `card_scope_closed_prev.fixture.json`
(the 6ff9332 character-for-character capture) had the block's text inside
`action-center-mount` on `group-3` and `bare` - exactly those substrings were moved by
hand into a `kp-entry-mount` entry with the new head, a `repinned` entry says so, and the
sha pin in `card_scope_closed_test.js` moved a1b40a09 → 243e5840; `kp_terminology_test.js`
pins the head and now pins "Weekly Game KP". One control is source-only: the page's pool guard in `renderKpEntryMount` is
belt-and-braces, `computeMoneyPool` returns `null` for a disabled or absent pool on its
own, so dropping the guard is caught by the source pin and by nothing behavioural.
`sw.js` `golfapp-v180-kp-entry-nav`.

## The import names the club, prints its dash, and stops crying "not mapped" (2026-09-19)

**Seen on a phone**, the v177 Xcode build, importing Streamsong Red: the round started and
three things were wrong on screen. (1) The confirm button read `Use Red \\u2014 Streamsong,
FL` — admin.html's `importConfirmLabel` had a doubled backslash inside a template literal, six
characters that `textContent` printed as typed; `course_import_test` asserted the label's
words and never its separator. (2) "⚠️ COURSE NOT MAPPED! Please enter the Pars and
Handicaps…" rendered under the confirm panel: `openImportConfirm` borrows the unmapped path
(`courseHiddenSelect.value = ""` + `handleCourseChange()`) to open the grid before the write,
stamps the provider's 36 numbers into it, and inserts the panel above the container — so the
unmapped path's red line showed through beneath a panel that already said "Par and stroke
index below came from this course's … tees. Check them against the card before you save."
(3) The course was stored and shown as **"Red"**: the provider gives `course_name "Red"` and
`club_name "Streamsong Resort"`, and five copies of `course_name || club_name` on admin.html
plus four on tournament.html each took the tee course alone — next week's picker would have
offered Red, Blue and Black with no club.

**Fixed.** `courseDisplayName(c)` in `course-import-rules.js` — the app's own directory
convention, CLUB (COURSE): "Streamsong Resort (Red)", "Talking Stick Golf Club (O'odham)";
the bare name when club and course match (case-insensitively); whichever exists when one is
missing. Every name on the import path uses it on both pages — the result row, the typed
name, the panel title, the confirm label, the stored record — and `importedCourseKey`
compares the COMPOSED name to the directory and to `global_courses`, so a provider "Talking
Stick Golf Club" / "O'odham" lands on `az_talking_oodham` instead of writing a shadow `gca_`
beside it (the `gca_` key itself is the provider id and never the name). The label carries a
real em dash, and `course_import_name_test.js` asserts the separator as a character through
`helpers/decode-escapes.js`, plus a sweep of every shipped page and script for a doubled
`\\u` (build-shell.js is source-of-source and exempt: its `\\u26F3` becomes `\u26F3` in the
generated worker, which is correct). `handleCourseChange` keeps the red warning off while
`pendingImport` is set — the grid is open for CHECKING, and the panel says so — and the
refusal path clears `pendingImport` first, so a card the provider could not supply still
gets the warning it deserves. What the grid looks like now: the panel (name, address, par
and tee count, the source line, the match note, the button), then the 36 filled cells with
no red line under them; the panel's own sentence is the only "check these", which is
enough — it names the tee and asks for the card.

**`gca_4ad33747`, already stored as "Red".** Left alone by this wave (tests may not touch
production). The right repair is a RE-IMPORT of Streamsong Red from the phone once this ships:
`importedCourseKey` still lands on the same key (by provider id — the composed name no longer
matches "Red", the id does), the update rewrites `name` to "Streamsong Resort (Red)" — and it
doubles as the device check for the write below. The alternative is a one-key hand update
(`database:update /global_courses/gca_4ad33747 '{"name":"Streamsong Resort (Red)"}'` — the
rules allow it; the node keeps `data` and `source`), needed only if the phone's write still
does not land. Records with matching club and course (`gca_bwcdmzcy` Legacy Golf Resort) are
already right. A possible refinement, not done: when the course name repeats the club's words
("Talking Stick Golf Club (Talking Stick Piipaash)") the directory would say "(Piipaash)";
the rule as decided is club (course), verbatim.

**THE FOURTH FINDING — the phone's write never landed** (report only, not acted on). The
production record's `source.importedAt` is 2026-09-13 17:50 UTC, the web import; a confirm
on the phone on 2026-09-19 would have stamped that day's `Date.now()`. It did not. The round
started because `finalCourseData` is taken from the grid, not from the write. Whether the
write was REFUSED or NEVER SENT is unknown; either way "native import works end to end" was
true of the round and not of the shared record. How to tell: (a) Safari → Develop → the
iPhone → the page, Console, then import again — a red `PERMISSION_DENIED` line names a
refusal, a network error names a transport failure, no line at all means the write was never
issued; (b) without the inspector: import again and watch under the course box for the
publish-refused note (`renderCoursePublishNote`, admin.html:1697) — its presence is a refusal;
its absence with an unchanged `importedAt` afterwards is "never sent". Not chased here.

## The tee sheet printed blank QR cells — print is a snapshot, and Chrome pauses the page for it (2026-09-18)

**What Manny saw.** The tee sheet from the section above, printed from Chrome's real
dialog the same day it shipped: every QR cell blank, name and URL present. The check
had passed. It measured the sheet **800 ms after the tap**, under emulated print media,
and at 800 ms every cell had a drawn `<img>`. Print is a **snapshot at
`window.print()`**, and at that instant (measured with a stubbed `window.print` that
captures the cells as it is called): `img` src length 0, display none, naturalWidth 0;
the library's `<canvas>` 132 px wide and hidden by the wave's own screen CSS
(`.tee-qr canvas { display: none; }`, which applied in every medium). qrcodejs draws
its canvas synchronously and sets the `<img>` src **asynchronously**, after a probe
image's onload; `printSheet` printed in the same task.

**The fix that would not have worked, and why — the Chromium trail.** The first
chosen fix (C) built the PNG data URI synchronously in the builder and put
`<img src="data:…">` in the cell's markup. Measured in Chrome
(scratch `sync-img-probe.js`, 2026-09-18): an `<img>` given a data URI has
**naturalWidth 0 and complete false in the task that sets it**, whether by innerHTML,
`new Image()`, or the same URI a second time; 132 fifty ms later. And the paper would
not have had it either. Chromium main, read 2026-09-18:

- `third_party/blink/renderer/core/page/chrome_client.cc:277-282`,
  `ChromeClient::Print()`: *"Suspend pages in case the client method runs a new event
  loop that would otherwise cause the load to continue while we're in the middle of
  executing JavaScript."* — **`ScopedPagePauser pauser;`** around `PrintDelegate(frame)`.
- `third_party/blink/renderer/core/frame/local_frame.cc:3476-3484`
  `GetLoaderFreezeMode()`: paused → `LoaderFreezeMode::kStrict`;
  `SetContextPaused()`: `Fetcher()->SetDefersLoading(GetLoaderFreezeMode())`,
  `Loader().SetDefersLoading(...)`, `GetFrameScheduler()->SetPaused(is_paused)`.
- `third_party/blink/renderer/platform/loader/fetch/resource_loader.cc:1308-1315`
  `RequestAsynchronously()`: *"Handle DataURL in another task instead of using
  |loader_|."* — a data-URL image load is a **posted task**; `:1453-1459`
  `HandleDataUrl()`: `if (freeze_mode_ != LoaderFreezeMode::kNone) {
  defers_handling_data_url_ = true; return; }`.
- `components/printing/renderer/print_render_frame_helper.cc:2798-2811`, the
  scripted preview: *"SetupScriptedPrintPreview() blocks this call and JS by running a
  nested run loop"* — `base::RunLoop loop{kNestableTasksAllowed}; … loop.Run();` —
  **inside the pauser's scope**. The preview is rendered while the page is paused.

Read together: `window.print()` pauses the page before the data-URL task runs, the
fetcher is frozen, the load defers itself, and the preview lays out an `<img>` with no
image. That is also exactly why the shipped sheet was blank while the DOM was fine 3 ms
later — the probe's onload was frozen too. **Only pixels already painted at the call
reach the paper: a `<canvas>` bitmap.** The next person reaching for a data URI in a
print path needs this paragraph.

**The fix (C′).** `qrBitmap(url, size, level)` in `tournament.html`: draws with the
library into a scratch element it never attaches (the library keeps a reference to
*its* canvas and flips its display after the probe onload — that scratch element is
what it flips), then `drawImage` copies the pixels into a **canvas the page owns**, no
library reference, class `tee-qr-bitmap` (35 mm). `buildTeeSheetPrintView` paints every
bitmap before the markup, writes an empty `.tee-qr[data-team]` per cell (or the fallback
sentence and no canvas when `qrBitmap` returns null — no library, or a throw), sets
innerHTML, then **appends** each bitmap to its cell: a canvas serialised through
innerHTML or `cloneNode` comes back empty (measured: a moved canvas keeps 8,584 dark px
of 17,424; a clone has none). The sheet is print-only, so it carries one copy of the
pixels — no data-URI `<img>` beside the canvas. `printSheet` is unchanged and still
synchronous; the modal (180) and the inline rows (64) still use `drawQrInto` on the
async path, which is fine on screen. `.tee-qr canvas { display: none; }` is gone.

**The check, rewritten to measure the instant.** `tools/tournament-tee-qr-check.js`'s
stubbed `window.print` captures each cell **as it is called** — canvas presence, width,
own computed display up the ancestor chain to the view (exclusive: the view itself is
`display:none` under screen media and only print media shows it), the canvas's
`toDataURL`, img src length and naturalWidth — and asserts per cell at least one shown
element with pixels at that instant; the print-media pass proves the manage screen
hidden and the rects (canvas 132 px ≥ 35 mm) against that same snapshot, and each cell's
**bitmap** (`toDataURL`, not a src attribute) is byte-equal to one the probe draws
itself from the cell's printed URL; the sheet may not change between `print()` and the
probe. The same at-print capture runs on the pairings and results sheets (no images;
vacuous, and already there). Controls, each red by name, page restored by sha: the
canvas rule reintroduced → "NO VISIBLE PIXELS AT THE PRINT INSTANT" ×3 (canvasShown
false); HEAD's async img path restored as the only pixels → the same ×3 (imgSrcLen 0,
canvas hidden); cells 1 and 2 swapped bitmaps → "CELL 1'S/2'S BITMAP DOES NOT ENCODE ITS
OWN URL". Green on C′: at print, canvas 132 shown, bitmaps 3,822 / 3,806 / 3,746 chars,
`encodesOwnUrl` ×3. `tournament_tee_qr_test.js` pins the mechanism in source
(qrBitmap at M, drawImage into an own canvas, appended after innerHTML, no
`toDataURL`/`<img>`/`<canvas>` in the builder, the hiding rule absent) and drives the
no-bitmap fallback through `printTournamentTeeSheet` in mini-dom (no canvas there).
Both caches: `build-shell.js` `tournament-v48-tee-qr-canvas`, `sw.js`
`golfapp-v173-tee-qr-canvas`.

**Six harness faults in six waves — the pattern is the point.** Each one a green run
that was not, or a red run that was not:

1. **stdout to a pipe is asynchronous on macOS** (net-reachable wave): `console.log(report);
   process.exit()` handed the runner an empty stdout — exit 0, no JSON. A report lost
   between the log and the exit. Fix: write with a callback that exits after the bytes
   are out (`tools/tournament-net-reachable-check.js`; the tee-QR check now does the same).
2. **targaryen through a pipe truncates at 33,214 bytes** (narrowing wave): a
   zero-failure run read as three red suites, because the summary line the parser
   needs is at the end. Fix: `helpers/targaryen-run.js`, stdout to a file.
3. **A Chrome check measuring 800 ms after the tap when print is a snapshot** (tee-QR
   wave): the sheet it measured was one the user never sees. Fix: the stubbed
   `window.print` captures at the instant; nothing after it counts.
4. **A recon scoping an acceptance criterion its own recommended fix could not
   satisfy** (this wave): the recon wrote "an img with a data: src and naturalWidth > 0
   at the instant" as the bar and recommended the data-URI fix — a bar Chrome cannot
   reach in the same task, for a fix the print pause would have blanked anyway. Fix:
   measure the criterion against the candidate before recommending it; here that
   measurement (`sync-img-probe.js`) took four minutes and changed the fix.

5. **A rules change silently disarmed five checks** (found in the polish wave, three
   commits after the narrowing `dab91d8`): `canManage()` became false on a record with
   no `ownerUid`, and `tools/lib/tournament-fixtures.js` `eventRecord()` wrote none, so
   the Setup tab those tools measure never rendered — `tournament-destructive-check`,
   `-payer-link-check`, `-pending-handicap-check`, `-unnamed-entry-check`,
   `-withdraw-check` and `-pool-and-flight-check` all exit 2 ("reading 'innerText'" of
   an element that is not there), and nobody noticed because none of them is in
   `npm test`. Fix taken (2026-09-18): `eventRecord()` owns its records by `'u-org'`
   (pass `ownerUid: null` for a legacy record on purpose) and each of the six arrives
   as that owner (`auth: OWNER`) — the gate wants both. Measured after: pool-and-flight
   PASS (TESTS 16/17/18); the other five clear the gate and stop on a SECOND cause
   each, recorded and not chased: payer-link, pending-handicap, unnamed-entry and
   withdraw stall in their *journey* arms (`openJourney` opens anonymous and creates
   through the page; `tournaments[code]` comes back undefined / "setting 'value' of
   null" — most likely the same gate a third time, UNKNOWN until run);
   destructive-check hits the page defect below. `-label-check` (inert control) and
   `-reachability-recon` (its own stub) were already recorded; `-multiround-check`
   is exit 1 on HEAD too (TEST 23, its create-through-the-page arm; UNKNOWN cause,
   likely the same gate on the create form) — found in the same sweep, not chased.
   After the fixture edit: `-focus-check`, `-net-label-check`,
   `-snapshot-and-shamble-check`, `-stroke-dots-check` still pass.

6. **One snapshot proves the first paint, not the page** (found 2026-09-18, the
   spectator-freeze wave): `tools/lib/cold-arrival.js` fired each value listener
   ONCE and never again, and `set()` re-fired nothing, so all 27 tournament tools
   structurally measured the first paint; `tools/lib/journey.js` re-fired but
   SWALLOWED a listener that threw ("the page's problem"). A page whose value
   callback died on every snapshot after the first read as merely stale — for 78
   commits, under green checks that arrived signed out and passed. Fix taken:
   cold-arrival has an opt-in `{ deliver: { path, value } }` step (writes still
   re-fire nothing — a behaviour change on every write is 27 tools' business at
   once) that reports how many listeners it reached and whether one threw; journey
   records a thrown listener in `window.__listenerErrs` and `evaluate()` raises it
   as `page threw in a listener`, so every journey tool fails on it (it did, at
   once, on the page's own :4094). **THE RULE: a check on a live page delivers
   at least two snapshots on the listener whose render it measures and asserts
   the second landed — every arm, not only signed out — and bails, saying so,
   when the delivery reached no listener.** `tools/tournament-live-board-check.js` is the
   standing example and self-tests journey. mini-dom cannot reproduce this class
   (its registry elements survive a panel's removal), so its twice-fired handler
   proves the markup changes, not the throw; say so in any test that fires twice.

The common shape: the harness said what it was told to look for, and nobody had
checked that the thing it looked for was the thing the user gets. When a check is
written, ask what moment or byte the user actually receives, and measure that one.
Fault #5 adds the corollary: a check that is not in the suite is a check nobody runs,
and a gate that closes a page to a fixture closes every tool built on that fixture.
Fault #6 adds the last one: one snapshot proves the first paint, not the page.

## tournaments/$code is narrowed — a code-holder writes scores and nothing else (2026-09-18)

**The problem, established.** `tournaments/$tourneyCode .write` was
`"!data.exists() || newData.exists()"`: anyone holding the six-character code could
write any child — scores, team names, rosters, the course card, round status — with
curl, no page involved. The scorecard link was one door of several. The recon
(`~/Desktop/rattle-recon-tournaments-narrowing.txt`) counted 37 structural write sites
on `tournament.html`, 33 of them with no guard of their own (the gate REMOVING the
Setup and Desk panels was what kept a visitor off them), and 3 score writers on the
scorecard.

**The count, read in the console on 2026-09-18 by Manny:** two tournaments exist.
`PMZJLT` has an `ownerUid`. `FN68` has none — an old "Hope Foundation" test on
Chambers Bay, Manny's own, with no real field. One legacy record, a throwaway. **So:
no legacy branch.** A carve-out built to protect a test event would outlive its
reason and nobody later would know it was safe to remove.

**The rule, published by hand from the repo file (the registrations order):**

    "tournaments": { "$tourneyCode": {
        ".read": true,
        ".write": "(!data.exists() && auth != null && newData.child('ownerUid').val() === auth.uid) || (data.exists() && newData.exists() && auth != null && auth.uid === data.child('ownerUid').val())",
        ".validate": (unchanged), "ownerUid": { ".validate": (unchanged) },
        "scores":  { "$scoreKey": { ".write": "root.child('tournaments/' + $tourneyCode).exists()",
                                    ".validate": "$scoreKey.matches(/^(team[0-9]+(_p[0-9]+)?|p[a-z0-9]+)_h([1-9]|1[0-8])$/) && newData.isNumber() && newData.val() >= 1 && newData.val() <= 30 && newData.val() % 1 === 0" } },
        "rounds":  { "$roundId": { "scores": { "$scoreKey": { ".write": "root.child('tournaments/' + $tourneyCode + '/rounds/' + $roundId).exists()", ".validate": (the same) } } } }
    } }

- CREATE: only a signed-in client, only a record whose `ownerUid` is its own uid (the
  unchanged child validate still refuses an anonymous provider). A stale bundle's
  create — no `ownerUid` — is refused; it used to make a world-writable record.
- EXISTING: only the owner, never a delete (as before, for everyone). A record with no
  `ownerUid` matches nothing: **legacy is frozen for structure.**
- **The claim closes — a deliberate consequence, not a side effect.** Until this wave a
  signed-in user could write `ownerUid` onto a legacy record (the child validate allows
  it; measured in targaryen). The parent `.write` no longer reaches that child. The
  land-grab goes away and FN68 is console-only. No claim path exists or is planned.
- **The score grant is on `$scoreKey`, not on `scores/`.** A code-holder writes one
  hole per call and cannot replace or wipe a board in one write (rows pin both). The
  validate holds the key to the three shapes the scorecard writes and the value to a
  whole number 1..30; a `remove()` carries no newData and validate does not run on
  it, so clearing a hole still works. Both depths — single-round and
  `rounds/$roundId/scores` — because a multi-round event writes the deeper one; round
  identity stays in the path.
- **The score grant requires the record to exist — and at the multi-round depth, the
  round.** See "The squat" below for why this line is here and was not in the first
  publish.
- NOT expressible as a rule, stays page-side: the individual-mode group membership
  check (the group id is not in the path) and `roundLocked` (a closed round's scores
  are refused by the card).

**THE SQUAT — a finding of the live probe, its own paragraph.** Candidate 1, as first
published (live hash `ab32b849…`), had `scores/$scoreKey ".write": true`. That reads
as "a code-holder may write a score on an event"; what it says is "anyone may write a
score key under ANY `$tourneyCode`", because `.write` cascades down, a child grant is
unconditional, and a parent `.validate` does not run for a write below it. The step-5
probe hit it by accident: the admin create of the throwaway failed on a CLI flag, and
the unauthenticated `PUT tournaments/ZZPROOF/scores/team1_h2 = 5` returned **200 on a
record that did not exist** — an admin read afterwards showed the junk record. Repeated
deliberately on a second code: the same. **What that costs a real organizer:** once a
stranger writes one score key to an unused code, the record exists, and the
organizer's own create on that code is refused (`data.exists()` and they are not the
owner) — locked out of their own code by a single number. **targaryen could not see
it because every row wrote to a record that existed.** Candidate 2 (live hash
`66d26ee9…`) makes the grant conditional on the record existing, and on the round
existing at the deeper path; rows under `tournaments/NOPE/…` and `…/rounds/r9/…` hold
it, and a second isolation stub (the two grants set back to `true`) proves those rows
are refused by the grant's own condition and nothing else. Both throwaways were
removed and read back `null`. **Step 5 is not a formality.** It is the only check in
this repo that runs the rules the database actually runs, and it found what 118 rows
did not.

**A harness fault beside it — the targaryen pipe.** Three rules suites went red with
"Could not parse targaryen output" on a run that had 0 failures, because targaryen's
stdout read through a pipe stops at 33,214 bytes on macOS (the process exits before
the pipe drains); the 113 new rows pushed the verbose table past that and the summary
line the parser needs is at the end. `helpers/targaryen-run.js` runs it with stdout to
a file; `security-rules.test.js` and both isolation tests go through it. Same class as
the stdout drop the net-reachable wave found the day before: two harness faults in two
waves, each a green run reported as a failure or a failure reported as green.

**Hashes — three, in order.** (1) Live before the wave:
`a9015b86aa6528758933392f4c6b49ade1d3d38e75ad134dfd337e08fede79f1`, saved outside git at
`~/.golfapp-rules-backup/before-narrowing/live-rules.json` (equal to the previous repo
file plus the CLI's trailing newline). (2) Candidate 1, published 2026-09-18 and live for
about an hour: `ab32b84928fc30cebe7ba8529d570a7a3d095c300c9b8ff0df310025e50f940b` (repo
sha256 `045efdec…`), saved at `~/.golfapp-rules-backup/before-narrowing-2/live-rules.json`
— the squat version; do not republish it. (3) Candidate 2, live now:
`66d26ee96a33e1d3a6e2f28c162053992cdec804928535d81339ec9f984f19bd` (repo sha256
`2a7a4918…`), read back three times with `npx firebase-tools database:get
"/.settings/rules"` (three identical reads), JSON-equal to `database.rules.json`; the
live copy is the repo file plus one trailing newline. Rollback is (1).

**Rows.** 118 rows under `tournaments/` in `security-rules.tests-data.json` (254 total),
laid out so that no path+auth pair mixes a validate refusal with an ownership refusal
(the verdict table shows no data). `tournaments_rules_isolation_test.js` is the
isolation control: a temp copy with the parent `.write` stubbed `true` and every
validate left in place must turn EVERY ownership negative green and leave every named
validate negative red, hold the positives, and move nothing outside `tournaments/`.
It also pins, by name, that the legacy claim is refused by the boundary (red on the
clean file, green under the stub). `wave2_rules_test.js` and
`tournament_anonymous_owner_test.js` re-pinned to the new block; the latter's data
file lost its "a code holder renames" and legacy-create allowances.

**The pages.** `tournament-scorecard.html` `trackWrite`: a `PERMISSION_DENIED` now says
"⚠️ This event isn't accepting scores — ask the organizer." instead of blaming the
signal (the registration-2b lesson); every other failure keeps the signal sentence.
`tournament.html` `canManage()`: **no owner, no console** — the grandfather promise is
withdrawn. A record with no `ownerUid` has its Setup and Desk removed for everyone
(the rule would refuse all 33 writers) and the Leaderboard tab shows one line:
"This event has no organizer account, so its setup can't be changed. Scores still
save." `tournament_narrowing_page_test.js` holds both; `tournament_signin_gate_test.js`
d) and `tournament_anonymous_owner_test.js` (a deliberate substitution over the
captured legacy surface: `setupTab`/`setupPanel` false, fixture untouched) and
`tools/tournament-signin-gate-check.js` moved with it. Both caches: `build-shell.js`
`tournament-v46-narrowed-rules`, `sw.js` `golfapp-v171-tournament-narrowing` (the hero
PR that landed the same day had taken v45 / v170).

**Live proof against candidate 2 (2026-09-18, throwaway `ZZPROOF3` created as admin,
probed unauthenticated over REST, removed and read back `null`):** score on the existing
record → 200; multi-round score on an existing round → 200; remove a score → 200; score
under a code with nothing behind it → 401; multi-round score under a nonexistent code →
401; score under a round that does not exist → 401; rename, team handicap, wipe the
scores node, "five", 31, claim ownerUid → 401; read → 200. `ZZNOPE` never came into
being. Every line as targaryen said — after the squat taught us which rows to write.

## Tournament registration Wave 2b — SILENCE IS THE FAILURE, AND THE SWITCHES

Registration happens on phones at a golf course on one bar of cell data, and the
compat SDK does not reject a `set()` it cannot send — it queues it and the promise
never settles. A golfer tapped Sign up and saw nothing. Three things close that
(`tournament_registration_2b_test.js`, 2026-09-16):

- **`requireOnlineForSignup`** — the repo's six-line guard copied onto
  `tournament.html`, exactly as `connectivity_safety_test.js` demands (reads
  `navigator.onLine` directly, mentions no `GolfNet`; this page loads no
  `pwa-boot.js` at all). Airplane mode / radio off: the tap alerts "SIGN-UP NOT
  SENT … nothing was saved" and writes nothing. Its limit: one dead bar reads as
  online. Hence the next two.
- **The Firebase refusal is a sentence in `#reg-status`**, red and persistent, with
  the SDK code in small type beneath for the organizer — never the SDK string in an
  alert. Alerts stay for the golfer's own blanks, which retyping fixes.
- **The write races a 10-second timer** (`REG_SEND_TIMEOUT_MS`). Unsettled: the
  status says "Still sending… if this doesn't confirm in a moment, check your signal
  and tap Sign up again." and the button re-enables. The entry id is minted ONCE per
  form fill (`regPendingId`) and reused on every retry, so a queued write that lands
  later and a second tap write the SAME entry — one registration, never two; the id is
  released only on a confirmed success (the control that mints a fresh id per tap
  shows two entries). When the queued write finally settles, the status flips to the
  truth — confirmed, or the refusal. **The limit, named:** a page that was CLOSED
  cannot be flipped. A golfer who saw "Still sending", locked the phone and walked to
  the first tee may be registered without a screen that says so. The organizer's desk
  is the truth; it lists every entry that landed.

**The switches.** `tournaments/<code>/registrationFields` — five booleans, absent =
default: `ghinOrHandicap`, `shirtSize`, `dinnerCount`, `teamPreference` ON;
`holeSponsorship` (with `sponsorName`) OFF. Set from "Ask golfers for:" on the
Registration section of Setup, one key per tap. They govern the FORM only: a
switched-off box is hidden (set in code, on arrival), therefore not written,
therefore never required; the three requireds have no switch; team preference is
also gated by "is a team event". No rules change — the rules type every key
regardless. **The desk shows whatever an entry carries:** an answer given before a
switch went off stays listed. A field can end up half-answered; "N of M gave a shirt
size" is 2c's line. `tournaments/<code>` is open to any client by design (the
Setup gate is a guardrail, not a boundary — see the sign-in section), so the switch
write's boundary is the same as every other tournament field's.

**The switch write has NO online guard — deliberately, not missed.** `setRegistrationField`
writes a tournament setting, not money, and `connectivity_safety_test.js` treats the
guard as a MONEY-PAGE property so it cannot be diluted into a general habit that
eventually gets applied everywhere and read nowhere. An organizer at a desk is not a
golfer on a tee box: a switch tapped offline queues like every other Setup field on
that page and lands when the desk reconnects. Do not add the guard here later thinking
it was overlooked; if a setting ever needs it, the reasoning above is what has to change
first.

## Tournament registration Wave 2c — THE DESK IS ITS OWN TAB (2026-09-17)

Scoped to event day. Render-side only: **no rules change, no new key.** Recon
(`~/Desktop/rattle-recon-desk-20260917.txt`) measured 141 signups as a 21,240 px
list sitting above Starting Holes and every other Setup control, with no count,
no filter, no search and no duplicate handling. `tournament_desk_2c_test.js` is
the Node half; `tools/tournament-desk-check.js` is the Chrome half — it PRESSES
Paid and Approve on the 142-entry fixture (`helpers/registration-desk-fixture.js`)
by real CDP taps and reads the rows back, and it delivers a registrations
snapshot **mid-search** to prove the typed text survives.

**The Desk tab.** `📋 Desk` sits between Setup and Leaderboard. Setup keeps the
CONFIGURATION — the "Ask golfers for" switches, the signup URL, Share
(`#registration-section`). The Desk holds the OPERATION — `#registration-counts`,
`#registration-chips`, `#registration-search`, `#registration-list`. The manage
gate takes both tabs from anyone who is not the owner: `GATED_TABS = ['setup',
'desk']` in `applyManageGate`, one stash entry per tab, put back in reverse order
with each anchor checked against its parent (in this markup the anchor is the
whitespace text node between the pills, so forward order also works — measured;
the guard is for a nav without whitespace). `showTab` walks `MANAGE_TABS` and
lands on the leaderboard when a gated panel is absent. A legacy event (no
`ownerUid`) keeps every tab; its Desk says "This event is not taking signups".

**Counts** (`registrationCounts` / `registrationCountsHtml`, from
`registrationData` and nothing else): `142 signups · 70 paid · 14 in the field`,
then only for fields at least one entry carries: `Dinner guests N · A of M
answered`, `Shirts 28 S · 29 M · 29 L · 28 XL` in the rule's order with zero sizes
omitted, `A of M gave a shirt size`, and the fee line. **Fees on an individual
event:** `Fees collected $7,000 · 70 paid × $100` — the fee is per golfer and a
signup is a golfer. **Fees on a team event: NO total** — the fee is per TEAM
(`Entry Fee per Team`; `poolTotal` multiplies by teams) and a signup is a golfer,
so N paid × fee is wrong by the team size; the line reads `70 paid golfers ·
$400 per team · teams form at approval` so the organizer has the count, the fee
and the reason. `entryFee` 0 shows no fee line either way.

**Filters and search.** Five chips with live counts — All, Unpaid, Paid,
Approved, Not yet approved (`REG_FILTERS`, `setRegistrationFilter`) — and a
name/email search (case-insensitive substring). **Both live OUTSIDE
`#registration-list`.** The chips are rebuilt on every snapshot (their counts
move); the search box is STATIC MARKUP that `renderRegistrationDesk` only ever
reads — the rows and chips are rebuilt on every registrations snapshot, and a box
rebuilt with them would lose what the organizer typed the moment a signup landed.
The Chrome check types `g7@example`, delivers a snapshot with a new signup, and
reads the box back; the mutant that re-creates the box (`search.outerHTML =
search.outerHTML`) fails it with "MID-SEARCH SNAPSHOT WIPED THE BOX". Nothing
here is written anywhere: a filter is a way of looking.

**The duplicate flag.** Same email (case-insensitive, trimmed) or same full name
(case-insensitive, whitespace collapsed) as any other entry marks BOTH rows —
`⚠ Possible duplicate · same email as another signup`. Flag only: nothing merged,
hidden or written; two golfers really can share a name.

**NOT this wave, and why.** Withdrawal / no-show, paid amount and method,
per-entry notes, and export each need a NEW KEY under `registrations/$code/
$entryId`, whose schema is closed (`"$other": { ".validate": false }`) and whose
`.write` forbids delete — a `database.rules.json` change on a protected,
hand-published file. They wait until a real event tells us which are actually
needed. (Export could be render-side, but what it exports is the same open
question.)

**Known gaps, named.** (1) No two-way link with the field — it is ONE-WAY: an approved entry
records `playerId`/`teamNum`, but removing that golfer from the field later does
not touch the entry — it still reads "In the field" and cannot be approved again.
(2) No un-approve. (3) No walk-up entry from the desk: an unregistered golfer is
added through the existing Setup controls and has no registration row, so the
counts do not include them.

**Cache.** `tournament.html` is TOURNAMENT_SHELL: `build-shell.js` cacheName
`tournament-v42-registration-desk` (five pins), not `sw.js`.

**Two records from the build, not fixes.** (1) The counts-width discrepancy: at
390 px (326 px available inside body and container padding) a nowrap probe read
the widest counts line — the team fee line — at 330 px, while the block height
(101 px for 5 lines) says nothing wrapped. Unresolved. Cosmetic. (2)
`hilo_live_test.js` was KILLED BY SIGSEGV on one full-suite run of six
(2026-09-17, Node v24.20.0; the suite check reported "A FILE DIED WITHOUT RUNNING
ITS TESTS", 41 results missing). Standalone it is 42/42, and the other five runs
were green. Consumer-side, unrelated to this wave; named here so the next person
who sees a file die without running does not rediscover it cold.

## Tournament registration Wave 1 — HOW TO OPEN IT

Public signup (any golfer, no sign-in):

    tournament.html?register=CODE

Organizer list, Paid (cash/offline), approve into the field — signed in as the
owner whose uid is `ownerUid`:

    tournament.html?tourney=CODE

then the **Setup & Links** tab. The signup URL is on that section; Share hands
out a QR the way team scorecard links already do.

Create the tournament while signed in (email/password, not anonymous) so it has
an `ownerUid`. A legacy event without one cannot receive signups: the rules
refuse the write, and the page hides the form rather than looking like it takes
them.

This is **not** Consumer Season/Trip IAP and **not** Stripe. Paid is a checkbox
the organizer ticks when they have the cash. Approve copies the golfer into the
existing player field (individual) or a team (scramble / shamble / best ball)
using the same record shape `addPlayerToField` / `saveNewTeam` already write.
Scores are not touched.

`tournament_registration_test.js` is the Node half (write path, payload, gate).
`tools/tournament-register-check.js` is the Chrome half (the form has a rect on
cold arrival; the owner sees the list without calling a renderer).

**What v109 shipped broken, and why — two findings, not one.** The "Team
Scorecard Links" block that moved to the Leaderboard tab was also the Setup tab's
per-team card list: **one row was doing two jobs** — name, golfers, the shotgun
hole badge, the **editable Team Handicap input** and the Share button, all in the
same `team-link-row`. Moving the container did two things at once: (1) the Setup
tab lost its team cards — measured live on an owned tournament, nothing between
Flights and "Add Another Team"; (2) the public Leaderboard rows gained an editable
handicap input for every visitor, signed out included — the exact control the
gate exists to withhold, invisible to a signed-in owner. It shipped because the
gate tests pinned the Setup tab's *presence* and nothing pinned its *contents*.
The fix is **one builder with two callers**: `teamRowHtml(t, { editable })`,
written editable into `#team-cards-list` (Setup) by `renderTeamCards()` and
read-only into `#team-links-list` (Leaderboard) by `renderTeamLinks()`, so the
shape cannot recur without a second copy — and
`tournament_setup_inventory_test.js` refuses a second copy, counts every Setup
section's rows against the record, and refuses any `<input>` on the public rows;
`tools/tournament-signin-gate-check.js` counts them in Chrome and, run against the
v109 page, goes red on both halves. Individual mode was measured unaffected.

## Course data

`course-data.js` holds a searchable directory of 141 courses. Only 26 have local hole data; the rest rely on Firebase `global_courses`, which any golfer can extend by mapping a course once — it then works for everyone, forever.

**Unmapped courses now seed a BLANK grid**, not par 4 with stroke indexes 1–18. That old seed was a complete, well-formed, fictional card that passed every validation check, and saving it poisoned `global_courses` for all users. Blank makes the existing "Hole 1 is missing a Par" refusal reachable. Don't reintroduce a default.

A backfill script lives outside the repo at `~/rattle-backfill`, pulling par and handicap from GolfCourseAPI. Match rate on a 20-course sample was **50%** — good on name-brand clubs, thin on small municipals. **THE ACCOUNT IS ON THE FREE PLAN: "$0 per month / Up to 35 requests per day" — corrected 2026-10-03.** This line claimed the Pro plan (10,000/day) from 2026-09-11 until 2026-10-03, and the proxy's numbers were retuned on the strength of it: the daily ceiling went 30 → 9,000, the search cache 7 days → 1 hour, and zero results stopped being cached. **The upgrade never happened.** Pro is $9.99/month for 10,000/day and Enterprise $24.99 for 100,000/day (golfcourseapi.com), so upgrading is cheap and may well be the right answer before monetization — but nothing may assume it has been done.

**The ceiling is now an environment read: `GOLFCOURSE_DAILY_LIMIT` in the Pages project.** Default 35; set it to **9000** (`PRO_DAILY_CEILING` in `functions/api/_lib.js`) the day the plan changes, and no deploy is needed. `course_quota_free_tier_test.js` proves the variable is wired into the admission gate rather than merely exported, and that a malformed value falls back to 35 rather than to NaN (infinite ceiling) or 0 (every search refused). **A provider 429 now reports `daily_limit`,** the same reason as our own ceiling, so running out says "Course search is resting for today — pick a saved course instead" instead of "isn't answering right now".

Each course costs two requests: search returns only a *count* of tee boxes, so the tee data needs a second request by id. So 35 a day is roughly **17 new courses a day across every golfer using the site** — and not 17 rounds, since a course already in `global_courses` or in the KV cache costs nothing.

**Seeding the directory by region is not achievable, and no subscription tier changes that.** The open item used to read as an admin-SDK script to seed every course in WA, AZ and OR. The API cannot produce that list: `/v1/search` stops at 25 results with no way past (measured six times — see "The API ceiling" below), there is no list endpoint, no geographic query, and ids are opaque 8-character strings from a 32-character alphabet, so the directory cannot be enumerated by any means. The constraint is the API's shape, not quota. **What is achievable is seeding from a list of course names we supply** — two requests each, search then detail. On the free tier that is **17 courses a day**, so a 200-course seed is twelve days of patience or a month of Pro; on Pro (10,000/day) it is one sitting. The list has to come from us. And the seeder does **not** need the admin SDK: `global_courses` is writable under the normal rules, gated by the `gca_` provenance validate, so a seeder should be *subject* to that rule rather than exempt from it.

## Rattle Golf Tournaments Wave 1 — bugs and missing links (2026-10-06)

Branch `tournaments-wave1`, based on `rattle-registration-desk` (732194e). STRICT
lane: not merged until Manny says so. No rules publish of any kind; the live
rules already allow the owner to delete a registration (published 2026-10-06).
Cache `tournament-v56-missing-links`, and `sw.js` CACHE_VERSION
`golfapp-v305-tournaments` (v304 is held by spectator-polish; v305 was
free on main, every remote branch and the local worktrees on 2026-10-06),
bundle re-synced with `node sync-mobile-web.js`.

**Shipped**
- **A1 stored XSS.** Signup `fullName` / `teamPreference` reached `innerHTML`
  after Approve on the board, team rows, Setup cards, payouts, rounds, flights,
  groups, print and both scorecards. Both pages load `text-safe.js`; names reach
  the Share handler through escaped `data-share-*` attributes, never inside an
  onclick string. Storage is unchanged. `tournament_signup_xss_test.js`.
- **A2 round team links.** On a multi-round event every team gets one link and
  one tee-sheet QR per round (`teamScorecardUrl(t, rid)`), labeled by round.
  `tournament_round_team_links_test.js`, `tools/tournament-round-team-link-check.js`.
- **A3 the public board is for watching.** "📣 Share live leaderboard"
  (`openShareModal(..., 'leaderboard')`) for everyone. On an OWNED event the
  scoring links + QR codes, print buttons (`#lb-owner-tools`) and the payout
  calculator (`#payout-owner-controls`) are hidden for anyone but the owner, in
  the tree (f0fa56f rule), by `applyManageGate`. A LEGACY event (no ownerUid)
  keeps links, QR codes and print visible to everyone; its calculator stays
  hidden because nobody can save amounts on it. `tournament_watch_payouts_test.js`,
  `tournament_legacy_links_test.js`, `tools/tournament-spectator-check.js`.
- **A4 saved payouts.** The owner writes `tournaments/<code>/payoutSpots` (numbers,
  max 20) on each edit; everyone renders from it. No even-split default: blank
  boxes for the owner, "Payouts not set yet." for watchers, and the pool-mismatch
  banner waits until an amount is typed. `payouts.js` untouched.
- **A5 atomic approve.** One root multi-path `update()` per approve, an in-flight
  lock per entry, a reserved team number until the write settles.
  `tournament_approve_atomic_test.js` (targaryen rows read the rules, nothing
  published). Older suites read the write through `helpers/tournament-write-apply.js`
  `flatWrites`.
- **A6** name and entry fee editable on Setup (`setEventName`, `setEntryFee`).
- **A7** individual events: the team-links heading block and the team tee-sheet
  button hide; group link rows carry Share (QR + copy).
- **A9** trip pointers written in one update; `product-separation.md` corrected;
  drifted checks re-armed (multiround, multiround-views, payout-rank-seam,
  course-search); pairings, tee-qr, team-link and desk checks follow A3/A5.

**Deferred (Wave 2)**
- Course and format edits after save (they rescore the event).
- Removing, rather than hiding, the public scoring links.
- Closing signups / cap / deadline and a richer signup confirmation (A8).
- ~~Remove team from Setup~~ — SHIPPED in Wave 2, see the next section.
- Individual events on the CREATE form still show the Teams blocks. They are the
  golfer-name input surface there (saveTournament turns each name into a player),
  so hiding them would break creating an individual event; it needs its own
  golfer-entry surface. Setup's Teams block IS hidden on individual events
  (`#setup-teams-block`, `tournament_individual_setup_teams_test.js`).

**URL shapes**
- Create: `tournament.html` (sign-in required to Save)
- Console, public board, watch link: `tournament.html?tourney=CODE`
- Public signup: `tournament.html?register=CODE`
- Team card: `tournament-scorecard.html?tourney=CODE&team=N[&round=RID]`
- Group card: `tournament-scorecard.html?tourney=CODE&group=GID[&round=RID]`
- Trip context: `tournament.html?trip=TRIPCODE`

## Tournaments Wave 2 — Remove team on Setup (2026-10-06)

Branch `tournaments-remove-team` from main c62ab77. Draft PR to main; not merged
until Manny says so. No rules change: the owner's `.write` on `tournaments/$code`
already covers removing a child (targaryen rows in the test).

- **Where:** each editable Setup team row (`#team-cards-list`, built by
  `teamRowHtml(t, { editable: true })`) carries **Remove** (`.team-remove`,
  `removeTeam(num)`). Setup's Teams block is hidden on individual events, so the
  control is too.
- **Only with zero posted scores, in any round.** `teamHasScores` reads
  `scores` and every `rounds/*/scores` for `team<N>_h*` and `team<N>_p*_h*`. A team
  with a score is refused: "<name> has scores and can't be removed." Nothing written.
- **Otherwise one removal: `tournaments/<code>/teams/team<N>`.** The team's golfers,
  handicap, starting hole and flight live in that node; the tee sheet and the
  shotgun list are built from `teams`, so its hole and tee-sheet slot go with it.
  Registrations are untouched; the Desk derives "Needs a team" for entries that
  pointed at it (631b4ef rule). Board and payouts render with the gap closed.
- **Proof:** `tournament_remove_team_test.js` (UI-driven, both arms, render after
  removal, rules rows); `tools/tournament-remove-team-check.js` (Chrome Check B:
  live echo and cold reload both show 2 "Needs a team" and "2 need a team").
- Cache `tournament-v57-remove-team`, `sw.js` `golfapp-v306-remove-team`.

## Dark mode is gone from the Tournament product (Option B, 2026-09-18)

**What decided it: the shared key.** Both tournament pages read and wrote
`golfapp-theme`, the same `localStorage` key the nine Consumer pages use, on the
same origin (both products serve from one host). Hiding the toggle and keeping
the code (Option A) would have left every golfer who set dark on the round app
looking at dark tournament pages with no control on those pages to change them
— worse than today. So the FEATURE went, not the button: the four toggle buttons
(three on `tournament.html`, one on the scorecard), `toggleTheme()`, the
load-time read, the DOMContentLoaded relabel, both `html.dark-mode` palette
blocks, the two `.lb-row.leader` dark overrides and the two `.theme-toggle-btn`
rules. **The palette stays**: `:root` and every `var()` are the page's only
colours (238 uses on `tournament.html`, 103 of them in inline styles and JS
templates), not theming decoration. The hero band was never dark mode — it
carries a fixed dark palette on imagery and is untouched.

**The key is never touched.** No read, no write, no remove. Consumer is
mid-review and a tournament page that cleared the key would flip a golfer's
Consumer setting on the same device. `tournament_darkmode_gone_test.js` pins
that neither page so much as mentions `golfapp-theme`, that neither calls
`removeItem`/`clear`, that an arrival with the key seeded `dark` stays light
and leaves the key exactly as it was, and that `admin.html` still reads and
writes it — the boundary. `tools/tournament-landing-check.js` seeds the key in
Chrome before the page runs and reads it back after arrival.

**Same wave, not a dark-mode regression.** `--warn-text`, `--warn-bg` and
`--warn-border` were used on `tournament.html` (the net-refused warning
`#ind-net-warning`, the multi-round net line, the paste-flagged block) and
defined nowhere on that page, **in both themes, since before this wave**: the
warning inherited its parent's colour and the block rendered with no background
or border. They now carry the Consumer values (`admin.html` / `trip.html`:
`#fff4e5` / `#e08a00` / `#7a4a00`; contrast 6.9:1 on the panel, 7.5:1 on white).
`--card-bg` at the paste-players modal was a typo for `--bg-card` — no page ever
defined it; the one use is corrected and nothing is aliased, so the page keeps
one name for one colour. The test asserts every `var()` the page uses is
defined in `:root`, so a fifth cannot go unnoticed.

**Pins that moved.** `tournament_landing_polish_test.js`: the band slice now
asserts no toggle; the toggle-flip test became "toggleTheme is not defined"; the
"themed through variables" assertions stayed. The landing baseline fixture is
untouched — `DELIBERATE` gained a first entry `|🌙 Dark Mode| → |`, placed first
because the trophy substitution's `from` begins on the very next token.
`tournament_round_scoring_test.js`: the scorecard has 12 four-space functions
now, not 13 (the floor is 10). Both caches: `build-shell.js`
`tournament-v44-no-dark-mode`, `sw.js` `golfapp-v169-tournament-light`.

**Not honoured, before or after:** `prefers-color-scheme` appears nowhere in
the repo. A phone set to dark rendered these pages light before this wave
unless the key said otherwise; now it renders them light regardless.

**`tools/tournament-net-reachable-check.js` — repaired and wired into the suite
(2026-09-18).** It is the only check that can see "correct and unreachable":
`#individual-setup-note`, the one Gross/Net control in the product, once sat
`display:block` inside a hidden ancestor, and mini-dom has no layout. The tool
taps the format cards in Chrome and reads rects (TEST 18), builds a Net event
through the page's own controls — sign-in, save, handicaps on the Player Field,
a scoring group, the golfer's card, the organizer's board — and compares the
board to arithmetic done by hand (TEST 19: Bogey E / Cal +9 / Ace +18, gross all
+18, the two boards must differ), and checks the refusal on a card with no
usable index (TEST 20/20b). It rotted twice and nothing noticed: the organizer
sign-in gate (2026-09-12) refused its save because the journey was opened
without `auth`; course search (2026-09-17) made the picker rows nodes and it
matched an `onclick` attribute. Six days and one day, because no test ran it.
Three repairs: `auth: OWNER` on the journey, rows found by their text, and the
"no card" premise (Mint Valley fell through to a fabricated 1..18) replaced by a
`global_courses` fixture card with hcpIndex 1 on every hole — the refusal path
the product kept once the fallback went. **`tournament_net_reachable_test.js`
now spawns it on every `npm test`** (~55 s standalone, in parallel with the
rest) and turns its exit contract into assertions: exit 2 — "NOTHING WAS
PROVEN", the state it sat in for six days — is a failure quoting the bail,
never a pass. Controls measured: hide the panel on Individual → TEST 18 red and
19 skipped-as-failure; make the Net radio decorative → TEST 19 red (the one it
exists for); remove the refusal → TEST 20 red; drop the auth option → exit 2,
reported as `COULD NOT RUN: … saveTournament wrote no tournament`.
**Two load faults found by running it inside the suite, both fixed in the tool:**
on macOS `process.stdout` to a pipe is asynchronous, so `console.log(report);
process.exit()` once handed the runner an empty stdout (exit 0, no JSON) — the
report and the bail are now written with a callback that exits after the bytes
are out; and a fixed 2.6 s settle after `goto()` was once not enough with a
dozen Chromes sharing the CPU (`#course-search-input` null, the tool crashed) —
each navigation now waits for the element the next step needs (`settled()`, DOM
reads only, 20 s cap), the cold probes retry once at 9 s, and a crash before a
verdict is an exit-2 bail rather than a stack. After those: 4 of 4 full-suite
runs green; the wrapper adds ~56 s to a file that runs in parallel with the rest.

## Tournament course search — Option B (2026-09-17)

**Why this wave exists.** `courseDirectory` has 141 entries and `coursePresets`
holds a card for 26 of them: **115 of 141 directory courses had no card anywhere
in the repo**, and until this wave every one of them silently became a fabricated
card — eighteen par-4s indexed 1..18 — the moment an organizer picked it on
`tournament.html`'s setup screen (the old `resolveCourseCard` fallback): a
structurally valid card that `hasUsableStrokeIndex` could not tell from a real
one, flagged only for Net, scored on a leaderboard as fact. Online search plus removing the fallback turns
most of the directory from a silent wrong answer into a working path.

**The shape — Option B: search and import into the tournament record only.
There is no global_courses write from this page.** One bad card there serves 140
golfers on every page forever and no client can delete it; a card on an event
serves one event its owner can re-save. Option A (lifting the Consumer's whole
import into a shared module and writing from both pages) was ruled out: the
Consumer's import code is bound to `admin.html`'s DOM by name, and a copy is how
the Nassau duplicate shipped.

**What is shared, and what is not.** The four PURE pieces that decide what a
valid card is — `importCardOrRefuse`, `pickCanonicalTee`, `ONLINE_SEARCH_MESSAGES`
(with `courseImportMessage`), `ONLINE_SEARCH_CEILING`, plus `allTeeSets` for the
chooser — moved out of `admin.html` into **`course-import-rules.js`** (root,
SHARED_SHELL, plain `var`/`function` declarations; a page must not re-declare
them). `admin.html` calls them and keeps its own `onlineSearchMessage`, which
appends "— you can still type the card in below." to `daily_limit` because that
page has a grid; the shared sentence says nothing about typing.
`course_import_rules_test.js` holds the module; `course_import_test.js` still
reaches the same functions through `admin.html` by name, which is the proof the
page loads them. A side effect of the lift: two of admin's sentences carried a
double-escaped em dash (`\\u2014`, printed literally); the shared table prints
the dash. `importConfirmLabel` in `admin.html` still has the same defect on its
button label — **recorded, not fixed** (not this wave's file).

**On `tournament.html`.** The picker rows are nodes (provider strings go
through `textContent`, never `innerHTML`). From three typed characters the
online row is appended LAST and fires only on a tap; one tap is one request; a
second tap in flight spends nothing. Three outcome shapes, as on admin: could
not ask (the reason's sentence — and when the typed name is not in the 141, the
honest stuck sentence: *Couldn't check online just now, and "X" isn't in the
built-in list. Try again in a moment. To start the event now, pick a course from
the list — the event scores on that course's card.*), asked and none, found
(city and state on every row, nothing auto-selects, the 25-cut note). A result
tap spends the detail request; a refusal selects nothing and leaves the typed
text in the box. **The confirm panel** shows the whole card read-only (two rows
of nine), a **tee chooser** listing every tee set (canonical = longest men's,
re-validated on each pick; a refused tee disables the button and says why), the
source sentence, and a button naming the course and its city. Confirm inlines
the card: `activeCourseKey = gca_<id>`, `courseData` the validated 18,
`courseIndexSynthetic false`, and keeps the import on the event at
**`tournaments/<code>/importedCourses/gca_<id>`** = `{ name, data, source }` so
`allCourses()` offers it to a later round of a multi-round event (an organizer
who imported a course for round 1 and could not pick it for round 2 would think
the app lost it). **The silent fallback is gone**: `resolveCourseCard` returns
`null` for a course with no card; `pickCourse` does not select it and offers
`🌐 Get the card for "<name>" online`; `setRoundCourse` refuses with a sentence.
No placeholder row — fiction that announces itself is still fiction on a
leaderboard; if an offline clubhouse turns out to be real at a live event it
gets added with evidence behind it.

**Two defects the Chrome check found that mini-dom could not.** (1)
`host.children.find` — an `HTMLCollection` has no `find`; mini-dom hands out an
Array. `Array.from` now. (2) The document click handler closed the dropdown on
a tap of a card-less directory row: the row rebuilt the dropdown inside its own
onclick, so the handler saw a detached target and `closest()` found no wrapper.
It now leaves the dropdown alone for a target that is no longer connected.

**Tests.** `tournament_course_search_test.js` (mini-dom, the proxy as the
sandbox's `fetch`) and `tools/tournament-course-search-check.js` (Chrome: real
taps and keystrokes, `window.fetch` replaced for `/api` by a preScript that
answers on a later task — a synchronous stub ran the outcome render inside the
tap's own dispatch and reproduced a race no real fetch can). Two fixtures that
picked `cameron` (no preset) now hand the page a card through its own
`global_courses` listener. Both caches moved: `build-shell.js`
`tournament-v43-course-search` and `sw.js` `golfapp-v168-course-search`.

## The course API proxy — configuring it in Cloudflare

`functions/api/` holds a Pages Function that proxies GolfCourseAPI so the key is never in the browser. **The picker calls it** — `admin.html` fetches `/api/course-search` from the "Search online" row and `/api/course/<id>` from the confirm panel (`8dd55d5`, v99). This paragraph said "nothing in the app calls it yet" until 2026-09-12; that was stale by a wave.

**What an unmatched `/api` path returns — measured 2026-09-12 through `wrangler pages dev`, the same runtime the deployment compiles.** There is no `404.html`, so Pages is in SPA-fallback mode: a **GET** to any `/api` path with no Function — `/api/nope`, or `/api/course/<id>/extra` — answers **HTTP 200, `text/html`, `index.html`** (487934 bytes locally; 487230 live in the 2026-09-11 recon). To the picker that reads as reason `network`, because `res.json()` throws on HTML — a wrong diagnosis, a safe outcome. A **POST** to the same path does **not** get the SPA: the static layer refuses it with **405, empty body, no `Allow`**. A POST to a route that exists only for GET (`/api/course-search`, `/api/course/<id>`) also gets 405 with no `Allow`. `tools/api-404-check.js` measures all of this and is red at `39dd65e`; the `api-404` wave adds a `functions/api/[[path]].js` catch-all so an unmatched `/api` path answers 404 JSON and a method mismatch answers 405 with `Allow: GET`. Route precedence was measured before that was written: a `[[path]]` catch-all does **not** shadow the specific routes for the methods they export, and a method mismatch on a specific route falls through to it — so the catch-all is the one place a 405 with `Allow` can come from. A non-api unmatched path (`/no-such-page`) keeps the SPA; that is Consumer's routing and the catch-all lives under `functions/api/`, where it cannot see it.

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
| `/api/course-search?q=streamsong` | `{"status":"ok","courses":[…]}` — four Streamsong courses. **This spends one request** (of **35 a day** on the free tier — do not poke this idly) | See the reading below |
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

## Flights (A/B) — Wave 2, 2026-09-13

A round can split its field into two flights, A and B, so a skins wager and a
birdie game pay within the flight instead of across the field. **The engine
files are the only place that decides who plays whom; every page reads the
engine's per-flight view.** Skins wave 1 (`7d24422`, whole-dollar skins) came the
same day; the two are separate commits.

**The model.** `round.flights = { enabled: true, scopes: { skins: 'flight' |
'field', birdies: 'flight' | 'field' } }` and `player.flight = 'A' | 'B'`. An
untagged golfer is A. Off means `flights` is written `null` and no golfer carries
a `flight` key — an old round and a switched-off round are the same bytes.

**The resolver — `action-model.js`.** `flightScopeApplies(data, scope)`,
`playerFlight(p)`, and `flightSlices(data, scope)`, composed on
`fieldParticipants`: one `{ flight: null, players }` slice when a scope does not
apply, otherwise always `[A, B]`, an empty flight being an empty slice.
`flight_slices_test.js` pins its callers to `settlement-engine.js`,
`bet-strip.js` and `skins.html`; nothing else may slice.

**The engine — `settlement-engine.js`.** `computeSkinsPayoutLinesByFlight` is
the per-flight view (one entry per slice, every line carrying its `flight`);
`computeSkinsSettlementNet` pays each slice from those same lines through
`payFromSkinsLines` — the ONE place a golfer's whole-dollar skins number is
computed, so the ledger a golfer reads and the money they are paid cannot
disagree (`flights_engine_test.js` "4.0 LEDGER == SETTLEMENT per flight"). The
flat `computeSkinsPayoutLines` keeps today's shape; on a flighted round it is
the merge of both flights and can hold a hole twice, so no hole-keyed surface
reads it (pinned). Birdies run per slice with n = flight size. The Main Pool's
skins bucket is **flight-blind** by design (`pool-engine.js` has no notion of a
flight): one pot for the whole field, a cross-flight tie pays nobody. The wizard
says so on the bucket. A golfer who wants A-only and B-only skins pots uses a
Skins wager.

**The wizard — `admin.html`.** Step 5 (Players) gains a Flights (A/B) switch, a
live count read through the same capture the save uses, and Skins / Birdies
scope switches; each roster row gets a tap-to-flip A/B. On a plain row the
control sits in its own grid column with `gridRow = '1'` — without the row Chrome
auto-places the delete button into that column and drops the control to a
second line (measured: 82px row vs 40px). On a team / Ryder row it is a second
line spanning the row, by design.

**The surfaces.** `bet-strip.js` prices and lists skins per flight ("A: Ann 2 ·
Ben 1 / B: Eli 2"); `hole-events.js` announces one skin per flight per hole;
`skins.html`, `index.html`'s live widget and modal, `settlement.html`'s LIVE
RESULTS and SKINS WON, and `leaderboard.html`'s live skins board all read the
per-flight ledger. The leaderboard adds a By Flight view — the group cards
sliced by tag — behind a pill row that replaces the group toggle only when the
round has flights, and an A/B badge on All Players rows. The Receipt's Player
Payouts ledger reads "Skins (A)" / "Birdie Pool (B)" beside a line from a wager
scoped per flight — presentation in `settlement.html`, the engine's labels
untouched, nothing on the totals or Who Pays Who.

**The goldens.** `flights_absent_golden_test.js` + `.fixture.json` hold a round
with no `flights` key — every engine literal and four rendered leaderboard
boards by sha — and prove it renders byte-for-byte as before the wave;
`enabled: false` is asserted identical to absent. `skins_golden_test.js` is the
wave 1 golden. Neither file was touched in the wave; both must stay untouched.

**Checks.** `tools/flights-leaderboard-check.js` (the pill row, both flight
cards, the badges, the admin rows measured at 390px, reached through the page's
own Back buttons) and `tools/skins-carry-wizard-check.js` (below).

**Skins never carry by default — the READ sites are fixed; the stored data is
NOT (open item below).** Every `!== false` reader of a carry flag in
`admin.html` (eight) and `index.html` (one) now asks `skinsCarriesOver()`, the
resolver the money engines pay by. (This part was done in Step 7 without the
paste approving `admin.html` for it — the work stands, the process did not: a
deferred item is recorded, not implemented, until a paste says so.) Before: a fresh
"Also Playing → Skins", touched by nobody, saved `skinsCarryOver: true` and
painted Carry Over — the catalog default was `false` and the save overwrote it;
a legacy round with no flag reopened as Carry Over and re-saving would have
restated money the engine had already paid no-carry.
`skins_carry_wizard_default_test.js` drives the tick, the reopen and the Round
Ready screen; `tools/skins-carry-wizard-check.js` ticks the box in Chrome and
reads which button is filled. Two of the nine sites (the instance card's paint
and the instance capture) are held by the source scan only: after the restore
fix their input is always a boolean, so `!== false` there would be inert, not
wrong.

**Deferred from the wave, each its own paste:**

- **OPEN — rounds already converted by the old restore path.** Any round that
  was reopened in the wizard and re-saved before v117 with no stored carry flag
  was written `skinsCarryOver: true` (the round's own flag, a stacked
  `additionalGames.skins`, or an instance), and a stored `true` is exactly what a
  deliberate Carry Over choice writes — the two are **indistinguishable in the
  data**. Those rounds settle as carry rounds today and will keep doing so; the
  fix above stops new conversions and changes nothing stored. A remediation would
  need: (1) a READ-ONLY scan of live `events/*` for every `skinsCarryOver: true`
  (three shapes) with the round's date, whether it has scores, and whether it is
  already settled — `tools/orphan-match-check.js` is the pattern for a read-only
  scan; (2) since the data cannot tell a converted round from a chosen one, a
  per-round decision by Manny from the list, never an automated rewrite; (3) for
  a round that IS rewritten, the receipt changes — `skinsCarryRuleRecorded` exists
  so a receipt can say which rule it applied, and a rewrite of a settled round
  must be announced to the group, not silent. Nothing is scanned yet; nothing is
  rewritten. Needs a paste and `database.rules.json` is not involved (writes go
  through the existing round update path).

- **A golfer at exactly $0 is omitted from Final Results.** `addAmount` in
  `computeCombinedNetTotals` returns on a zero amount, so a golfer whose every
  game nets exactly 0 gets no `netByName` entry and no `contributions` entry, and
  `settlement.html` renders only what `netByName` holds (measured: a birdie game
  nobody won → `netByName {}` → the card renders nothing at all). A golfer who
  finished even cannot find their name. Decision taken: show them at $0 — in the
  engine's output, since the page must not invent a row. Not built;
  `settlement-engine.js` is protected.
- **The Chrome harness capacity flake.** `native_review_surface_test.js` fails
  under full-suite load and passes alone; it has gone 1 → 2 → 5 rows over three
  runs. Reported each time, not fixed; it is the harness, not the app.
- **Flight tags reset to A when the switch is turned off and on again.** The tags
  are read from the rows, and switching off removes the controls. Keep them in
  session memory if it is cheap; otherwise say so on the switch.
- **The wizard refuses Next at Step 1 on a round whose main format is the legacy
  `skins`** ("Please select a game format") because legacy wager formats have no
  format card. Pre-existing; the device check's plain-row fixture is a stroke
  round with skins stacked for that reason.
- **The Tournament product's `flights` / `flightId` are unrelated.** A tournament
  flight is a tee-time wave in `tournament.html`; a round flight is a payout
  scope. They share a word and nothing else. Do not "unify" them.

## The Board's header, trimmed — Wave v202, 2026-09-22

**614px sat above the first golfer** on a 390x844 phone, so a 23-golfer round
arrived showing four of them. Measured and itemised in the recon: the theme
button's own band (34+12), the nav (139+16), "← Back" (44+10), the title
(30+12), THREE toggle rows (3 x 34), the leader banner (82+16), the section
card's chrome, and a 55px header row.

**Part 1 — a field over TWELVE opens on All Players.** By Group was the default
for every multi-group round, so a 23-golfer board arrived as six bordered cards
with six header rows. `BIG_FIELD_ABOVE = 12` / `bigFieldDefault`. Nothing is
removed and no control moves; `groupViewChosen` still wins and still sticks for
the session — this only changes what "not chosen yet" means. A flighted big
field opens flat too; a small one still opens By Flight.

**Part 2 — one header line, one control row.** `.board-headline` carries "←
Back" (KEPT — it is the control people reach for; Home in the nav is a different
thing), the event name, and the theme control, which **moved** into the line
rather than being duplicated: it keeps `id="theme-toggle-btn"` because
`toggleTheme()` writes its label there. `.board-controls` carries Ranking
Net|Gross beside one segmented view control (All / Groups / Flights — Groups
only on a multi-group round, Flights only on a flighted one), which also fixes
the flighted round's three pills wrapping to 86px. The retired two-position
toggle's ids (`label-group-view`, `label-all-view`, `group-view-toggle-input`)
are kept hidden and kept IN STEP by `syncViewControl` — three suites drive the
page through them, and a dead wire is worse than a visible one. `syncRankControl`
does the same for Net/Gross on every render (their "on" state used to live only
in static markup and in the tap). The Stroke/Match switch shows only when
`boardHasMatches` — a format, or a side match. The leader banner is KEPT, folded
to one line (`.h2h-fold`, 82 -> 33px) and now on the FLAT view too, which never
had one: it names the FIELD leader, which the first row stops answering the
moment the list is scrolled. `<thead>` kept (v201 added it), and its cells came
off v195b's 12px padding, which v201 had only trimmed on the body cells (55 ->
43px). **The shared nav is untouched.**

**Measured, 390x844, cold** (`board_header_trim_test.js`, 23 tests):

| round | first row | rows in view |
|---|---|---|
| plain 23 | 614 -> **375** | 4 -> **9** |
| flighted 23 | 683 -> **375** | 3 -> **9** |
| grouped 23 | 614 -> **375** | 4 -> **9** |
| small 8 | 614 -> **432** | 4 -> **6** |

Every control measures 44px or more. **~265px is not reachable with the nav in
the flow**: 28 (container) + 139 + 16 = **183** before anything else, then two
44px rows with their margins (108), the folded banner (41) and the header row
(43) = 375, which the test asserts as an itemised sum so the claim cannot drift.
Going lower needs the nav out of the flow (measured 193 in the recon) or the
`<thead>` gone — neither is in this wave.

**Goldens moved by transform**: `helpers/board-header-trim-v202.js`
(`boardV202`, `foldedBannerHtml`) runs after v201's, and folds the banner /
prepends the flat board's new one; `flights_absent_golden`,
`leaderboard_positions` and `board_stats_scope` all pass with their fixtures
UNCHANGED by sha. Two goldens drove `groupViewMode` without `groupViewChosen`,
which Part 1 correctly read as a default and overrode — they now drive the view
the way a tap does, which is also what they meant.

## The Board, read at arm's length — Wave v201, 2026-09-22

**Six things a golfer reads** (`leaderboard.html`, plus one label in
`scorecard-rows.js`):
1. **A blank handicap says nothing.** "HCP: " with nothing after it read as a
   bug, and so did "Net 41" beside a gross 41 — with no handicap the net IS the
   gross. Both lines are omitted; with a handicap the row says "HCP 6" and the
   score cell keeps its net line. A whitespace handicap counts as blank; "0"
   does not (a scratch golfer has a handicap and it is 0).
2. **"F" when finished**, from the round's own hole count (a nine is finished at
   9), and a compact header on EVERY table — Pos · Golfer · Score · To par ·
   Thru. The section tables had none.
3. **The skins badge**: "🥩 2" beside a winner's name, from
   `L.countsByPlayerId` via `liveSkinsLedgerEntries` — the same ledger the LIVE
   SKINS card and the Receipt read, per wager's own basis. NO NEW MATH: the
   badge sums nothing. A golfer in two sections shows the total of both.
4. **Compact rows**: name and handicap on one line, left-aligned. MEASURED in
   Chrome at 390×844: **59px → 47px** per row (−20%). Not half, and it cannot
   be — the score cell still stacks gross over net for a golfer with a
   handicap, and that is the floor. Still a 44px tap target.
5. **The whole row opens the card.** It used to need the name cell, so a tap on
   the score, the to-par or the little ▾ did nothing. A tap inside an OPEN card
   does not close it.
6. **The card's header row says "SI"**, not HCP — it is the hole's stroke
   index, and it sat directly under a row that may show no handicap at all.
   `scorecardStackedHtml` only; the Receipt's own layout (`scorecardRowsHtml`)
   keeps its wording, and a test pins that.

**The goldens moved by transform, not by re-capture.**
`helpers/board-polish-v201.js` — `boardV201` (markup) and `boardTextV201`
(tag-stripped text) — names each edit and throws when one finds nothing, so
the frozen capture plus exactly these edits IS today's output:
`flights_absent_golden` (all four boards, with the badge counts taken from
`liveSkinsLedgerEntries` so the board and the strip cannot disagree),
`leaderboard_positions` (positions and totals asserted cell-for-cell as well),
`board_stats_scope` (text). Two lessons in the header: a capture has its
`data-player-id` stripped, so an edit anchored on it silently matches nothing;
and picking a basis for the badge counts (gross on a round whose skins are
net) produced four different winners than the page shows.
`board_polish_test.js` (24, incl. Chrome: a real tap on the SCORE cell of the
third row opens that golfer's card, 23 rows at 47px, ≥12 on screen).

## The organizer link, shared and claimed — Wave v200, 2026-09-22

**The problem.** `ownerUid` is an anonymous Firebase uid, and anonymous auth is
per browser ORIGIN: the App Store app, Safari, the home-screen PWA and a Mac are
four organizers on one person's desk. On 2026-09-21 Manny created X7Z8HM in the
app and Safari showed him his own round as a spectator. The cure already existed
— `?organizer=TOKEN`, remembered per device — and was rendered ONLY on the Group
Links panel, which only somebody the gate already calls the organizer can see.

**(a) Share.** `organizer-gate.js` owns the URL, the words and the paths:
`organizerShareUrl` = `shareBaseUrl() + 'index.html?game=CODE&organizer=TOKEN'`
(never `location` — inside the shell that is `capacitor://localhost`, the Build-9
failure); `organizerShareText` = "Organizer link for CODE — opens setup on any
device. Keep it to yourself."; `shareOrganizerLink` goes to @capacitor/share
through `Capacitor.Plugins` (the native injected bridge — the only runtime the
device has, see `native-export.js`), else `navigator.share`, else the clipboard,
else a prompt, resolving `shared | copied | shown | failed`. Three callers:
Round Ready (`admin.html` — "Your own devices"), the Game tab, and the
scorecard's Group Links panel (a Share beside the Copy). Organizer-only, at the
function as well as the button. `game.html` now loads `product-links.js`.

**(d) Paste-to-claim.** `claimOrganizerToken(code, data, text)` reads a pasted
URL **or** a bare token (`tokenFromPaste`), checks it against THIS round's
`organizerToken`, and stores `golfapp_organizer_<CODE>`. Nothing is written to
Firebase and no round is read — a claim is a device fact. Offered on
admin.html's refusal card, the scorecard and the Game tab, and only on a BARE
link whose doors are hidden: never on a group link (a scorekeeper is not a
locked-out organizer), never when the doors are already open, never on a round
with no token (nothing to check against). Wrong token: "That link isn't for this
round."; rubbish: "Paste the whole link, or the token from it."
`organizer_link_share_test.js` (34, incl. Chrome: a non-organizer device types
the pasted link into the real box, taps Unlock setup, and ✏️ + 👥 appear).

**The token is still a bearer secret for the screens.** Anyone who gets the
link is shown setup on their device. As of 2026-09-23 that is not a write:
setup saves need the email sign-in for the account that created the round.
See "Owner-only consumer setup" below.

## ROADMAP — recorded 2026-09-22

1. **(c) Email-link sign-in — Wave 1 is in the app (2026-09-23).** The lobby
   card on `admin.html` and `email-link-auth.js` send a Firebase email link and
   finish it with `linkWithCredential` on the anonymous user, so the uid does
   not change. `signInWithEmailLink` runs only when there is no anonymous user,
   the user is already linked, or the link reports the email is already on an
   account (the second device adopts the original uid). It does not ship until
   Manny enables it in the Firebase console — see the checklist below. Apple's
   Guideline 4.8 requires Sign in with Apple only once another third-party
   social login exists; email link alone does not trigger it.
2. **Security rules AFTER (c). In the repo as of 2026-09-23, not yet on the
   live database.** Setup keys owner-only, play paths open. The detail, the
   verify steps, and the holes that remain are in "Owner-only consumer setup"
   below. Do not treat this paragraph as the rules file.

## Email-link sign-in — Wave 1, 2026-09-23

**What shipped.** `email-link-auth.js` (Consumer shell only) and a lobby card
on `admin.html`. Send stores the email and the anonymous uid
(`golfapp_email_for_sign_in`, `golfapp_email_link_uid`) and calls
`sendSignInLinkToEmail`. Opening the link on `admin.html`, or pasting it into
the card, calls `linkWithCredential` while the current user is anonymous, and
`signInWithEmailLink` otherwise. `auth/email-already-in-use`,
`auth/credential-already-in-use` and `auth/provider-already-linked` fall back
to `signInWithEmailLink` so a second device can adopt the original uid.
`organizer-gate.js` `ensureOrganizer` stamps `ownerUid` from
`auth.currentUser` when one is present, so a save after that adoption writes
the account that holds the trial, not the anonymous uid from boot.

**Trial and founder pass — nothing is copied.** Both live at
`organizers/<uid>`. `firstSeenAt` is write-once by the uid that owns it.
`pass` is `.write: false`. Linking the anonymous user keeps that uid, so the
clock and the pass stay with the rounds (`ownerUid` still matches). A second
device that signs in becomes that same uid; the anonymous record it had
before is not merged, and rounds created on it are not moved. The card says
so. This client must not write a pass onto a new uid to "fix" that.

**Continue URL.** `shareBaseUrl() + 'admin.html'`. On the web that is the
page's own origin (a preview deploy stays on the preview). Inside Capacitor
it is `https://golf-app-5a5.pages.dev/admin.html`, never
`capacitor://localhost` (Build 9: that URL opens on nobody else's phone, and
it is not an authorized domain). `index.html` with no `?game=` redirects to
the lobby and would drop the code, so the continue URL is the lobby.
`handleCodeInApp: true`, iOS bundle and Android package `com.rattlegolf.app`.
Until an associated domain opens the mail link inside the app, paste the link
back into the app that sent it. Opening it in another browser first attaches
the email there.

**Manny must flip these in the Firebase console (project `golfapp-9fb21`)
before a link can be sent.** Until then `sendSignInLinkToEmail` fails with
`auth/operation-not-allowed` and the card says email sign-in is not turned on.
The code path is live; the provider is not.

1. Authentication → Sign-in method → Email/Password → Enable, and enable
   **Email link (passwordless sign-in)**. The password half can stay off.
2. Authentication → Settings → Authorized domains. Add
   `golf-app-5a5.pages.dev` and `localhost`. `golfapp-9fb21.firebaseapp.com`
   and `golfapp-9fb21.web.app` are defaults and must stay. Do **not** add
   `capacitor://localhost` — authorized domains are http(s) only, and the
   continue URL does not use it. A Cloudflare preview host is not covered by
   a wildcard; add that exact host or the link fails with
   `auth/unauthorized-domain`.
3. Optional: Authentication → Templates → Email address verification / magic
   link, so the message sounds like Rattle Golf. The default template works.
4. This checklist item was for the email-link wave only. Owner-only setup is
   now in `database.rules.json`. Publishing it is the console step in
   "Owner-only consumer setup" below, not part of turning email link on.

## Owner-only consumer setup — 2026-09-23

**Not live until the console publish.** Cloudflare Pages deploys the site from
`main`. It does not deploy Realtime Database rules. The file in the repo is
what to paste. The command, if the CLI is ever pointed at a database that
already matches this file except for this change, is
`npx firebase-tools deploy --only database --project golfapp-9fb21`. A CLI
deploy replaces the whole ruleset. Paste in the console
(Realtime Database → Rules → Publish) unless the live rules have been read
back and match the repo file first. This change was not published from here.

**What became owner-only.** On `events/$eventCode`, once the round has
`ownerUid`, the parent `.write` is `auth.uid === data.child('ownerUid').val()`,
and a delete still requires that the round have no `scores`. There is no child
grant on setup, so these writes are the owner's and nobody else's:

- `players`, `groupSizeOverrides`, `moneyPool`, `flights`, `additionalGames`,
  `courseData`, `settlementMode`, `supersededBy`, `organizerToken`
- every other key that is not in the open list below, including `eventName`,
  the stake fields (`skinsBuyIn`, `birdieUnitVal`, `matchStake`, and the rest),
  `skinsCarryOver`, and `kpCancelled`

The owner can still edit after the trial ends. The trial gates creation only.
`ownerUid` is still immutable, and a legacy round still cannot be claimed.
`organizers/$uid/pass` is still `.write: false`. `tournaments` was not edited.

**What stays open to anyone holding the code**, by a child `.write` of
`root.child('events/' + $eventCode).exists()` (the same shape as tournament
scores: the parent no longer grants it, so the child has to):

- `scores`, `kpLeaders`, `kpWinners`, `kpConfirmed`
- `sideMatches` (presses included), `matchPresses`, `strokePresses`, `dots`
- `auditLog`, `scoresVerified`, `wolfCalls`
- `ryderCup`, `ryderCupRef`, `ryderFoursomes`
- `additionalGameInstances` (not `additionalGames` — that one is setup)

`.read` on the round is still `true`. Spectators with the code still see the
board.

**Legacy rounds** (no `ownerUid`) keep the previous write: anyone with the
code, and a scored round still cannot be deleted in one write. That is every
round created before `ownerUid` was stamped.

**The organizer link.** `isRoundOrganizer` still treats a matching
`?organizer=` token as the organizer, and the claim is still a localStorage
write. The rules do not read the token. They cannot: `.read` is true, so
anyone with the code can read `organizerToken` and present it. The preserved
path for a second device is email-link sign-in (`email-link-auth.js`):
`linkWithCredential` keeps the uid, and `signInWithEmailLink` on another
device adopts it, so `ownerUid` matches and setup saves. The share text and
the Round Ready note say that. A token holder who has not signed in can open
the screens and will be refused by the server on a setup save.

**Verify, before publishing.** `node --test wave2_rules_test.js
round_delete_rules_test.js security-rules.test.js
tournaments_rules_isolation_test.js`. Then, on a throwaway round in a project
that is not production if one exists, or only after the console publish: the
creating device saves a roster change; a second browser that is only signed
in anonymously can post a score and cannot post `players`; that second
browser, after the email link, can post `players`. Read `events/<code>` back
and confirm the stranger's `players` write did not land.

**Holes that remain, on purpose.**

- Anyone with the code can still write and clear scores, KP markers, side
  matches, presses, dots, wolf calls, and Ryder hole scores. That is the
  product. It includes deleting the whole `scores` node, which is still the
  first step of the two-write wipe.
- After that wipe, deleting the round itself is the owner only, on an owned
  round. On a legacy round the second step is still open.
- A legacy round can still be overwritten, roster included.
- The organizer token is still readable. It opens screens. It does not save
  setup.
- `kpNoWinner` is not in the open list (it is an organizer call, written with
  a `kpWinners` clear). The owner can still make it. A token-only device
  cannot, until it signs in.
- Group links still do not exist in the rules. Which card a phone can type on
  is the page, not the server.
- Tournaments are a different block and were not part of this change. Their
  structure is already owner-only; their score keys are already open.

## Move a golfer to another group — Wave v199, 2026-09-22

**The control.** A `[G1 ▾]` selector on every row of the 👥 Players sheet
(`index.html` `.ps-grp`). Changing it moves the golfer to the END of the
target group; the row is marked `.ps-moved` and the sheet says "Group 5's
link now includes Jon" (a group's link opens that group's card, so who is
on it is the thing worth saying). The money line does not move — the pot
does not care which group a golfer walks in.

**What it writes.** A move is a WHOLE write, like an add: the reordered
`players` node plus `groupSizeOverrides` (source −1, target +1), in one
atomic update, under v195's re-read guard ("The roster changed on another
phone — reopen Players."). Moves, adds, renames, handicap/flight/Out
combine in one Save; each move is applied on the working copy with the
sizes kept in step, so a second move sees the first, and adds insert on
the post-move sizes. Scores, flight, handicap and KP leads are keyed by id
and never move.

**An emptied group.** Allowed only when it is the LAST group and no golfer
of it has a score: the size list is truncated. Refused with "Group N has
scores — mark golfers Out instead." when it has scores, and refused when it
is not the last group — `computeGroupSizes` has no empty group (a 0 is
"unset"), so the groups after it would renumber and their links would
change; the sentence says to move somebody in first.

**Nothing caches a group.** Every reader recomputes from `players` +
`groupSizeOverrides` on each render: `playerGroupMap` /
`computeGroupBoundaries` (`grouping.js`) for the scorecard's
`__scPlayerGroupMap`, the group filters, the Group Links panel, the Board's
group sections, the trip and stats pages; `score-gaps.js`
`findScoreGapsByGroup` re-derives each group's start hole from the new
membership (proven: a group that started on hole 10 goes back to hole 1
when a golfer scored from hole 1 joins it, and its four originals then show
holes 1-9 as gaps). What DOES survive a move: a scorekeeper's `?group=N`
lock and the session's "Just watching" dismissal are per-device and keyed
by number, so a phone locked to group 3 keeps showing group 3 — with the
new membership; the KP question's sessionStorage key is `kpAsked:CODE:hN`,
per hole, not per group. `players_sheet_test.js` (37).

## The Results page for the payer — Wave v196 (v198 cache), 2026-09-22

**The order** (settlement.html, top to bottom; `RESULTS_MOUNTS` is the one
list, and printReceipt's roots ARE it, so the PDF reads the same mounts in
the same order): `#results-gap-line` — "Not final — …" once, on every round
(it used to render inside the Weekly Game card, the live head and the
Receipt head); `#results-top` — settled only: the receipt header, then
**💰 PAY OUT**; `#money-pool-section` — one `.game-card` per game (KP, Net
Finish, Skins per flight as siblings) under a "🏆 Weekly Game" label, each
a coloured head band (title left, pot right — "$360 · 12 golfers"), the
winners by hole beneath; `#combined-settlement-summary` — live: the live
head; settled: Who Pays Who only when anybody pays anybody; `#settle-content`
— side games, as before; `#results-net` — settled only: **NET +/−**, every
golfer, a collapsed `<details>`; the scorecard last. Gone: the per-game
payouts block, the Skins Summary lists, the Player Payouts ledger, the
pool-off "🏁 Final Results" card (the NET view is that list, on every
round). Live rounds and Finish Round's Final Money: unchanged.

**Pay out.** One `<details class="po-row print-open">` per golfer with gross
winnings > 0, largest first, the amount big. The row's amount is the
canonical ledger's (`payoutLinesOf`: every positive contribution line but
the buy-in, the "Main Pool" aggregate and an explained side-match rollup —
Player Payouts' rule since v142). The reasons are a page-side join
(`poolReasonsFor`) of computeMoneyPool's own lines by golfer id — "KP · Hole
7 · $20", "Net Finish T1st · $34", "Skins B · Hole 4 · $52", "Pool refund ·
…" — plus every non-pool payout line as the ledger carries it, a wager's
name leading ("Zach vs Chris · Press 1"). If the joined reasons do not sum
to the row to the cent (a legacy cents round's tie: 33.34/33.33 vs the
ledger's 33.333), the row prints the ledger's lines instead — a row can
never show reasons that fail to add up to itself. Head right cell
`payoutHeadCell`: "$880 of $920 · $40 held" — "of the pot" only when rows +
held = pot (a refund is a row; a round with side games pays more than the
pot and the sum stands alone); the held part only when held. Under the
list: "No payout: <names>". No engine touched.

**Paper.** Closed on screen, every `details.print-open` is opened for the
export (`setPrintOpen`, restored after) and for Cmd+P (beforeprint /
afterprint — Chrome's Page.printToPDF fires them too, measured). Print
rules: `.payout-card, .game-card, .net-view, .po-row` never break; the band
keeps its colour (print-color-adjust); 14 / 11.5 / 9.5 pt.

**Tests.** `results_payout_test.js` (32, incl. Chrome cold: the mount order
on screen, rows closed, four coloured bands, one occurrence of the top
golfer's name+amount, printToPDF opened 12 details and closed them);
`receipt_payouts_test.js` rewritten for the list. Every text golden moved
through one documented transform, `helpers/results-payout-v196.js`
(`poolV196`, `splitOldSummary`, `assertV196Mounts`): the old capture, with
exactly these edits, is today's text — and the old Player Payouts totals
ARE today's Pay out rows, name for name and dollar for dollar.

## KP money never goes back to the field — Wave v195b Part 3 (v197 cache), 2026-09-22

**Manny's rule.** A KP share is paid to a recorded winner, moved to the skins pot
when the organizer says nobody won it, or HELD in the pot — never refunded.
`pool-engine.js` KP block (approved per-file): line states `paid | skins |
unresolved`, an unresolved line carries `reason: 'blank' | 'out' | 'nobody'`
(`nobody` only on a round with no skins bucket — nowhere for it to go, so held);
`result.kp.toSkinsCents` is added to the skins bucket BEFORE the flight split, so
both pots grow; `kpUnresolvedCents` is the held sum and `settled` is false while
it is > 0, finished or verified or not. The 2026-09-19 "recording pays" refund of
a blank on a finished round is reversed (that section below stands as history;
its production note — four finished rounds refunding $100 — no longer applies:
they hold). `settlement-engine.js` (approved wording only): the per-reason
"KP refund · …" ledger lines are gone; a golfer's pool refund is one line,
"Pool refund · <reasons>". Invariant unchanged:
`prizes + refunds + kpUnresolvedCents === totalPoolCents`.

**What a golfer sees.** The Not-final line (`score-gaps.js` `notFinalLine`
extras, `kpHoldPhrase`) on the live head, the Weekly Game card, the Receipt head
and Finish Round: "Not final — KP on hole 15 not recorded". On a LIVE round only
holes the field has played are named (`holePlayedByField`): thru 10 with 7/12/16
blank reads "KP on hole 7 not recorded". A finished round with a held KP has its
own Results head again — "🏆 RESULTS — NOT FINAL / Every card is in. A KP is not
recorded — its share stays in the pot…" (the v149 shape, back). Receipt lines:
"Hole 7: not recorded · $10 in the pot", "Hole 7: nobody · $10 to the skins pot",
"Hole 3: Jon is out of the round — re-record it · $10 in the pot". Finish Round:
"$X still in the pot — pays when recorded — record the winner to finish the
round". Hole View: "Current KP: Jon — out of the round, re-record it". Players
sheet: "Jon leads KP on 3 — re-record it after saving". The trip holds on such a
round ("Not Settled Yet"). `kp_never_refunds_test.js` (20, incl. Chrome: Finish
Round on a finished round with a blank shows the line; recording the winner
makes it final). The text goldens carry the change as one documented transform,
`helpers/kp-never-refunds.js`, layered on the old captures.

## The Players sheet — Wave v195, 2026-09-22

**What it is.** "👥 Players" beside "✏️ Edit round setup" on the organizer's
scorecard strip and under the Game tab's title: a sheet with one row per golfer
under group headers — name, HCP, A/B, Out — and "+ Add golfer" per group.
`index.html` `buildPlayersUpdate` (pure) / `commitPlayersDraft`. Rename, handicap,
flight and Out write ONE update of the changed keys only (`players/<i>/name`,
`/hcp`, `/flight`, `/playingForMoney` + `/out`); never the whole array. An added
golfer needs the whole `players` node + `groupSizeOverrides` in one atomic update,
guarded by a re-read of the record — refused ("The roster changed on another
phone — reopen Players.") when the ids/names differ from what the sheet showed.
New id = max(roster ids, score-key ids) + 1. Scores are keyed by id and never
touched. Out = `playingForMoney:false` + `out:true` — the engines already read
`playingForMoney`, so he is out of the pot and every field payout (a wager that
names him by `participantIds` still counts him by that wager's own rule); greyed
on the card, the Board (OUT tag) and the Receipt (`scorecard-rows.js` `out`).
`players_sheet_test.js`.

**Not in this wave.** Moving a golfer between groups; deleting a golfer outright.

## The missing hole — Wave v192, 2026-09-22

**What it is.** `score-gaps.js` (shared, not an engine): a GAP is a blank
hole before a golfer's last scored hole, walked in the order the group plays.
The course is circular: per group, the start hole is the one after the
longest run of holes nobody in the group has scored (ties, no scores, or no
blank hole → `courseData[0]`), and each golfer's walk starts there — a
shotgun start on 10 never flags 1-9. The scorecard outlines the box
(`score-gap` on the wrapper both views share) and shows "⚠ Marty: hole 1 has
no score" above the card (a tap jumps to the box); the Board shows "⚠ missing
N" beside the name; Results, the Weekly Game card, the Receipt head and Finish
Round say "Not final — Marty is missing hole 1". Totals, positions and money
are untouched — the engines' numbers, flagged. `score_gaps_test.js`.

**Known limit.** A group that skips a hole together (everyone blank on 1,
all scored 2-17) reads as having started on 2 and is not flagged. Finish
Round's "still missing" list (`findMissingScores`, every blank in the field)
is what catches that at the end.

## The retired round — Wave v191, 2026-09-22

**What it is.** On 2026-09-21 the Sunday-night round's links were already in
the group text when Monday's round was created under a new code; three groups
scored the whole way on the old one. Now, when a NEW round is saved,
`admin.html` (`offerRetire`, `supersedeCandidate`) looks for an unfinished
round this device saved in the last 7 days whose roster shares at least half
the new names, and Round Ready shows "Retire OLD — anyone who opens it is sent
here.", checked; the write is `events/OLD/supersededBy = NEW` (fires on
render, unticking clears it). `index.html` on a round with `supersededBy`:
`renderSupersededBanner` (full-width link to the new code, `&group=` carried),
every score box disabled (`isLocked`), `canWritePlayer` false, the group
picker replaced by the same link. `superseded_round_test.js`.

**Known limit.** Rounds carry no timestamp and the rules index nothing, so the
candidates are the codes THIS DEVICE remembered at its own saves
(`localStorage golfapp_saved_rounds`, seven days). A round created on another
device, or before v191, is never offered. The old round's scores are not
moved; ids differ between rounds.

## The organizer doors — Wave v189, 2026-09-21 (built; extended v200 and Waves 22, 25)

**BUILT, and not a plan.** Worth stating at the top because a brief once asked for
this feature to be built from scratch: the doors, the refusal card, the gate and the
remembered token all shipped in **v189** (2026-09-21), the paste-to-claim way back in
arrived in **v200**, **Wave 22** narrowed what counts as evidence on a group link, and
**Wave 25** (2026-09-28) added the one sentence that was genuinely missing — see "the
way back in" below. Anything proposing to build the gate itself is proposing a rewrite.
Held by `organizer_door_test.js` (30 tests), `organizer_link_share_test.js` (34),
`organizer_doors_after_picker_test.js` (8) and `organizer_wayback_test.js` (13).

**What it is.** Two doors into the round setup for the organizer — "✏️ Edit round
setup" on the scorecard's group strip (`index.html` `renderGroupFilters`) and under
the Game tab's title (`game.html` `renderSetupLink`) — and a refusal on
`admin.html?game=CODE` for anyone else on an EXISTING round (`organizerDoor`,
`showSetupRefused`: "This round's setup belongs to its organizer." with a way back
to the scorecard). A NEW round (no players) opens its wizard for anyone, as always.

**Who is the organizer.** `organizer-gate.js` `isRoundOrganizer(data, uid, token)`:
the round's `ownerUid` equals this session's anonymous uid (the browser that
created it), OR the organizer token is held — `?organizer=TOKEN` on the URL, or
remembered on this device for this round (`rememberOrganizerToken`, localStorage
`golfapp_organizer_<CODE>`, written only when a URL token matched the round; the
nav rewrite drops the param on the first tab tap, so without the memory the
organizer loses the setup the moment they change tabs). A legacy round with
neither field (before 2026-08-24) is open as it always was; a round with a token
and no `ownerUid` (2026-08-24 to 09-14) admits only the link.

**A group link no longer closes the scorecard's doors by itself (Wave 22,
2026-09-27).** The old rule was "never on a group link, whoever holds it", and it cost
Manny his own controls on round 4C6722: he opened his organizer link on his own phone,
answered the group picker a 25-golfer round shows over the card, and Edit round setup,
Group Links and Players all went away while the matching token was still on the URL.
A group lock now decides not WHO the organizer is but what counts as PROOF: on a group
link `index.html` asks the new `organizerEvidence(data, uid, token)` — a matching
`ownerUid` or a matching `organizerToken`, and **not** `isRoundOrganizer`'s legacy
open-round arm, which on a group link would promote whoever was sent that link for
their foursome. A bare link is unchanged. A locked card still gets no group switcher.
`game.html`'s own gate is not `canReachSetup()` and still shows nothing on any group
link; that divergence is pinned in `organizer_door_test.js` rather than fixed.

**The uid is per browser ORIGIN**: Safari, the home-screen
app and the App Store app on one phone are three different organizers — open the
organizer link once in each to make them all the organizer.

**THE WAY BACK IN, AND THAT IT LASTS (v200; the sentence in Wave 25).** The refusal
card is not a dead end. It carries a paste box — `renderSetupClaim` in `admin.html`,
prompt and words from `organizer-gate.js` — which takes the pasted organizer link (or
the bare token), checks it against THIS round's `organizerToken`, and stores it on the
device. No Firebase write and nothing read. Wave 25 added the fact the card never
stated: `CLAIM_REMEMBERED`, rendered under the Unlock button — *"You only need to do
this once on this device — the link is remembered for this round."* It is true of both
routes in, because `claimOrganizerToken` and `rememberOrganizerToken` write through the
same `tokenKey()` helper. **Never on a group link:** a scorekeeper is not a locked-out
organizer, and offering it there invites a golfer to hunt for a secret that is not
theirs. The card may not say protected, secure or locked, in the markup or on the
rendered screen — the guard refuses all three words.

**WHAT THIS IS NOT. The client hides the doors; it does not lock them — and as of
2026-09-29, AFTER the Stage 1 publish, that is still true of a round.** The previous
version of this paragraph said "As of 2026-09-23 the database does". That was false,
and it is the exact class of defect CLAUDE.md warns about: the rule was WRITTEN on
2026-09-23 and never published, so a confident sentence claimed an enforcement that
does not exist. **Stage 1 did not change it either** — Stage 1 deliberately left the
`events/$eventCode` parent byte-identical to `dab91d8`, so setup is still writable by
anyone holding the code. What Stage 1 locked is the NEW ground: `organizers/$uid/groups`
and `sharedGroups`. Read the next section before assuming anything about a round.

### STAGE 1 IS LIVE (published 2026-09-29, ~7:01 PM, console paste)

**WHAT IS LIVE IS `database.rules.stage1.json`, NOT `database.rules.json`.** That is
the one thing to take from this section. Manny pasted the Stage 1 file into the
Firebase console Rules tab; `database.rules.json` in the repo was never published and
still carries the owner-only parent, which is Stage 2 and is **not built**.

    live ruleset      database.rules.stage1.json   sha256 7fe9d73ef95f725da41cb3ca00459b46308e7d67068500a4c89c33769348fff8
    rollback          dab91d8:database.rules.json  sha256 66d26ee96a33e1d3…
                      (also on the Desktop as ROLLBACK-dab91d8-database.rules.json,
                       byte for byte — a one-paste undo)

**POST-PUBLISH CHECKS, run on the real app straight after:**

| check | result |
|---|---|
| post a score from a `?group=` link | **SAVED** |
| answer the forced KP (GFLBAM) | **SAVED** |

Those two are the whole risk surface of Stage 1 — everything else it added is new
ground nothing depended on. The other two checks on the list (add a side match, save
a My Group) are the ones Stage 1 was FOR; My Groups could not save at all before it.

**WHY THERE IS NO "live hash = repo file + newline" TRICK ANY MORE.** The loop below
reproduced the live sha from git because every previous publish went through
`firebase-tools`, which writes the repo file plus one trailing newline. Stage 1 went
in as a CONSOLE PASTE, and the console reformats what it stores, so the live bytes are
not guaranteed to equal any file in git. Two candidate hashes for the same content are
recorded here so a future reader can tell which they are looking at rather than guess:

    database.rules.stage1.json exactly            7fe9d73ef95f725da41cb3ca00459b46308e7d67068500a4c89c33769348fff8
    the same file plus one trailing newline       123c6f57cf2863dc7bbdbb76cd5770a60319d3740a2b533ef172dec136c55aa2

**If a read-back matches neither, read the live rules and diff them against
`database.rules.stage1.json` before trusting anything in this section.**

**STAGE 2 IS NOT BUILT.** The `ownerLock` grandfather design is approved in principle
and nothing has been written: no rule, no app change, no flag on any round. Until it
is, a code-holder can still rewrite a round's setup, exactly as before.

### THE HISTORY, AND WHY THE TABLE BELOW STOPS AT dab91d8

**MEASURED 2026-09-27 (Wave 22 item 3), superseded by the Stage 1 publish above.**
Before 2026-09-29 the last publish of `database.rules.json` was `dab91d8`
(2026-09-18), whose repo bytes plus one trailing newline hash to
`66d26ee96a33e1d3a6e2f28c162053992cdec804928535d81339ec9f984f19bd` — the sha read back
three times with `firebase-tools` and recorded above. It is now the ROLLBACK, not the
live ruleset. **Five** commits had changed the repo file since, and **none of them has
ever been live**:

| commit | date | repo bytes + `\n`, sha256 | what it added |
|---|---|---|---|
| `1fafd07` | 2026-09-28 | `966360897cf255ad` | Wave 23's `kpGroupAnswers` — **the current file**, and the one that MUST ship next (see below) |
| `1f189cf` | 2026-09-26 | `d4d56617ae1774ec` | Wave 13 |
| `6c2bd1b` | 2026-09-24 | `358391e176b396e3` | v222 season ledger |
| `ae22953` | 2026-09-24 | `5b0fac15f23d658a` | v217 confirm-or-mark-out |
| `4f4ec0a` | 2026-09-23 | `233246783e03183c` | Lock consumer round setup to the owner's uid (#13) — **the one this section used to claim was enforced** |
| `dab91d8` | 2026-09-18 | `66d26ee96a33e1d3` | **← THE ROLLBACK** (was live until 2026-09-29). A code-holder writes scores and nothing else |

**Check it rather than trust it.** The live hash is of the repo file plus one trailing
newline, which is what the Firebase CLI writes, so the whole table reproduces locally
with no console and no network:

```
LIVE=66d26ee96a33e1d3a6e2f28c162053992cdec804928535d81339ec9f984f19bd
git log --format='%h %ad' --date=short -- database.rules.json | while read h d; do
  S=$( { git show $h:database.rules.json; printf '\n'; } | shasum -a 256 | cut -d' ' -f1)
  [ "$S" = "$LIVE" ] && M='<== LIVE' || M=''
  echo "$h $d ${S:0:16} $M"
done
```

The current repo file plus a newline is `966360897cf255ad…`, which matches `1fafd07`
and is NOT what is live. **That loop now finds no `<== LIVE` marker at all, and that is
correct rather than alarming:** what is live is `database.rules.stage1.json`, which is
not a version of `database.rules.json`. The loop still answers a useful question —
which committed version of the repo file was ever published — and the answer is
`dab91d8` and nothing since. **So today every consumer gate on a round is STILL UI only, Stage 1
published and all.** Hiding "Edit round setup" is the whole of it; a client that skips
the page and writes the node directly is refused by nothing. The section below
describes what STAGE 2 would change.

**WHAT STAGE 2 WOULD CHANGE, and what it would not** (this is the owner-only parent
that `database.rules.json` already carries and that Stage 1 deliberately left out). This is the distinction a
future reader needs, so it is written out rather than summarised. `events/$eventCode`
`.read` is `true` and stays `true` — the round is readable by anyone with the code by
design, which is also why the rules **cannot** trust the organizer token: it travels
in a readable node, so anyone who can read the round can read the token. Only
`auth.uid` can be trusted.

- **SETUP would become owner-only.** The parent `.write` requires, for an existing
  round that has `ownerUid`, `auth.uid === data.child('ownerUid').val()`. That covers
  everything the wizard edits: the roster, the course, the wagers, group sizes, the
  format. A second device gets there by email-link sign-in, which adopts the uid that
  created the round.
- **FIFTEEN CHILDREN WOULD STAY WRITABLE BY ANYONE HOLDING THE SIX-CHARACTER CODE**,
  because each declares its own `.write: root.child('events/' + $eventCode).exists()`:
  `scores`, `scoresVerified`, `kpLeaders`, `kpWinners`, `kpConfirmed`, `sideMatches`,
  `matchPresses`, `strokePresses`, `dots`, `wolfCalls`, `ryderCup`, `ryderCupRef`,
  `ryderFoursomes`, `additionalGameInstances`, `auditLog`. That is deliberate — a
  scorekeeper on a group link is not signed in and must be able to post scores — but
  it means publishing buys **the setup, not the money**. Everything that decides who
  pays whom is in that list.
- **A LEGACY ROUND (no `ownerUid`) WOULD STAY FULLY OPEN**, by the third arm of the
  parent `.write`. Publishing changes nothing for any round created before 2026-08-24.

So "only the organizer can change things" is not true today and would still not be
true after a publish; what would become true is "only the organizer can change the
round's SETUP, on rounds that have an owner". Anything said to a golfer has to match
that, which is why no UI string may say protected, secure or locked.

### WHAT THE NEXT RULES PUBLISH MUST CARRY

**`kpGroupAnswers` MUST SHIP IN THE NEXT PUBLISH OF `database.rules.json`** (added
2026-09-28, Wave 23, `#eventCode` child, `.write` identical to `kpLeaders`,
`kpWinners` and `kpConfirmed`: `root.child('events/' + $eventCode).exists()`).

**CORRECTED 2026-09-29, measured against production.** kpGroupAnswers WORKS TODAY
via the open parent: the live `events/$eventCode` `.write` lets any code-holder write
an existing round, so the child inherits permission and the forced-KP gate has been
recording all along. GFLBAM holds three stored answers (h4, h7, h11, group 3) as the
field evidence, and `rules_stage1_test.js` asserts the same verdict against the live
file. The child rule BREAKS NOTHING by its absence and becomes ESSENTIAL only if the
parent tightens without it - which is Stage 2. The paragraph below was written on the
assumption that the repo file would be published whole; it is right about the
consequence and wrong about the timing.

If the parent is ever tightened, this is the one entry whose absence would break a
shipped feature rather than merely leave it unenforced:

- The forced KP decision writes the group's answer to
  `events/<CODE>/kpGroupAnswers/h<N>/g<G>`. The writer is a **group scorekeeper** on a
  `?group=` link — not signed in, no `auth.uid`, by design, exactly like the golfer
  posting scores.
- Children with no rule of their own inherit the **parent** `.write`, which for an
  owned round requires `auth.uid === data.child('ownerUid').val()`. So the moment the
  current repo file is published **without** this child, every one of those writes is
  refused, and a group that answers the modal has its answer silently dropped.
- The modal would still let them through — the answer is also kept in
  `sessionStorage` as a same-session fallback — so the failure is quiet: the question
  returns for the next phone, and for the same phone in a new session. A gate that
  re-asks forever is worse than the skip it replaced.
- It is already in the repo file (sha `62ea83f1…`) and frozen by
  `format_first_wizard_test.js` and `organizer_link_share_test.js`, so a publish of
  the repo file as it stands carries it. **The risk is publishing an older copy**, or
  hand-editing in the console from the last live version (`dab91d8`, which predates
  it by four commits). Publish the repo file; diff it against the live read-back
  before and after, the way the hash table above was built.

**`organizers/$uid/groups` MUST SHIP TOO** (added 2026-09-29, UI Wave 31, My
Groups). The READ rule for `organizers/$uid` already exists; the WRITE rule for
its `groups` child does not, so every save of a weekly roster is refused by the
server until this publishes.

- The exact block to add is written out in `my_groups_test.js`'s header, beside
  the reason for each `.validate`.
- Unlike `kpGroupAnswers`, this failure is LOUD: `saveRosterAsMyGroup` and
  `syncMyGroupFromRoster` both report the refusal through `uiFail`, nothing is
  written, and creating a round never depends on either. So shipping the feature
  ahead of the rule degrades to "My Groups cannot save yet", not to a silent loss.
- A test in `my_groups_test.js` asserts the rule is still ABSENT, so this note
  cannot go stale quietly: the day `groups` gains its rule, that test goes red and
  points back at this section.

Nothing else is pending for the rules. `kpNoWinner` and `kpCancelled` stay
undeclared **deliberately** — they are the organizer's whole-field calls and the
owner-only parent rule is exactly right for them.

**Left on the OLD predicate this wave** — `index.html` `isOrganizerView()` is still
`!hasGroupLock` ("no ?group= in the link"), which a "Just watching" spectator on
the bare link satisfies. On 2026-09-21 the string appeared 12 times in
`index.html`: the definition, four real gates, seven comment mentions. Two gates
moved onto `canReachSetup()` in this wave (the 🔗 Group Links button and panel,
which print the organizer link). What is left, to be moved or deliberately kept
in a later wave:

| where (`index.html`) | what it gates |
|---|---|
| `:3621` `canShowInlineActionPanel` (the quick "+ SIDE BETS" panel) | writing a wager with no participants named — single-group rounds only, so a spectator on a foursome's bare link can add a wager |
| `:3609`, `:4283`, `:4296`, `:4976`, `:6657`, `:6664` | comments that name the predicate — prose only |

**THE DELETE CONTROL CAME OFF THIS PREDICATE ON 2026-10-04**, and it came off
because Manny hit exactly what the paragraph above predicted: he opened the bare
link of round ULDM2A as a spectator and the scorecard offered him "🗑️ Delete
round for everyone". Both `renderEndRoundControl` and `endAndClearRound` now ask
`canDeleteRound()` — `organizerGate.organizerEvidence()`, a matching `ownerUid`
or a matching organizer token, which is STRICTER than `canReachSetup()` because
it refuses `isRoundOrganizer`'s legacy "no owner and no token is open" arm. On a
round that names no organizer the scorecard offers the delete to nobody; the
organizer still has it on `admin.html?game=CODE`. The control is also no longer
rendered before the first snapshot (it cannot be: the gate needs the record and
the uid, and `organizerTokenParam` is a `let` declared further down that script,
so calling it at init threw before initialization and took the round's own value
listener with it). `spectator_delete_test.js` holds all of it, both arms of the
handler included. **The DB-level lock is still Stage 2** — this hides a control
and refuses at the handler; it does not lock a write.

`organizer_door_test.js` pins the count of the string (7 now, comments
included — it was 10 until the delete control moved), so a gate moved later has
to move its comment too and update the table above. Also not on either predicate: the group switcher in
`renderGroupFilters` (`hasGroupLock` decides, harmless for a spectator) and the
score-override provenance `verifiedBy` (`hasOrganizerAuthority`, the token only).
`renderGroupFilters` does now ask `canReachSetup()` on its locked branch, because that
branch used to empty `#group-filter-container` — the container the doors are painted
into — so a true `canReachSetup()` still rendered nothing. The switcher itself remains
`hasGroupLock`'s decision alone.

Not moved tonight because the wipe is the destructive control and should get its
own decision rather than ride along, and the inline wager panel on a single group
is the case where "one group IS the field" was the deliberate design.

## Closed, and worth keeping closed

- **FIXED IN v194, GUARDED 2026-09-28 — the wizard's Weekly Game step showed no pot
  when an existing round was reopened.** Reported again as **item 4 of the 2026-09-27
  handoff**, by which time it was already fixed: the step opened on *"Add players in
  Step 5 to see the pot."* on a round that had eight players, and toggling Weekly Game
  off and on cleared it.
  - **The fix is one call, `admin.html:7935-7941`**, inside the existing-round
    loader's roster branch (`if (storedPlayersTemp.length > 0)`): `mpRecalc()` runs
    AFTER `handleFormatChange(true)` rebuilds the rows. The pot counts
    `querySelectorAll('.player-row')` — `mpRecalc` → `mpDraftData` →
    `collectWizardPlayers` → `captureCurrentPlayerInputs` — so anything that reads it
    before the rows exist multiplies a correct buy-in by zero golfers. **The toggle
    "fixed" nothing:** every pool control carries `oninput="mpRecalc()"`, so touching
    one simply asked the question again once the rows were there. That is also the
    tell for a recurrence — if touching any pool input clears it, it is ordering, not
    arithmetic.
  - **It was DISPLAY ONLY, on two independent grounds**, so no round was ever saved
    wrong: `captureMoneyPool()` writes only `buyIn` and the bucket amounts — no total
    and no participant count, the pot being derived at read time — and the save gate
    re-validates on the payload's own player list (`validateMoneyPool(payload,
    finalCourseData)`). What it cost was the organizer's confidence at the moment they
    set the buy-in.
  - **NOW GUARDED by `wizard_pot_on_edit_test.js`** (7 tests), which is the point of
    this entry: for four waves the fix was held by a comment and nothing else, and
    deleting that one call left the whole suite green. The guard arrives cold at
    `admin.html?game=CODE` as the owner, reaches the step by a real tap on the step
    dot, and **touches no pool input** — touching one is what used to hide the
    defect. Control: delete the `mpRecalc()` call and 4 of 7 go red with the screen
    reading *"Add players in Step 5 to see the pot."*
  - **Nine sibling surfaces read the roster the same way** and are NOT individually
    guarded: `renderWizardReview` (`admin.html:3036`, the one this guard also checks),
    `renderSkinsExtras`, `skinsChosenIds`, `addSkinsInstance`, `renderSkinsInstances`,
    `captureSkinsInstances`, `captureAdditionalGames`, `describeExistingNassau`,
    `renderSetupNassauPlayers`, `wizardSideMatchLine`. Same shape, same risk.

## Where things stand, 2026-10-03 (Wave 39 challenges, on a branch)

**STILL `ui-wave39-push`, STILL NOT MERGED.** Cache `golfapp-v281-challenges` /
consumer `v121`. Full suite 10,028 tests, 0 fail.

- **SIDE BET CHALLENGES.** `events/<code>/challenges/<id> = { from, to, terms,
  status, createdAt }` - a pending offer that holds no money. Any golfer in the
  round can tap **🤝 CHALLENGE SOMEBODY** on the Matches tab, which opens the
  SAME side-match form with one side fixed to them and Save replaced by Send.
  Pending offers list above the live matches as "Pending: Jimmy v Manny $20
  Nassau" with Accept / Decline.
- **THE SAFETY MODEL IS A DIFFERENT NODE, NOT A FILTER.** Every engine that counts
  money reads `sideMatches`; none has ever heard of `challenges` and none is being
  taught. `challenge_money_test.js` settles the same round twice - once with $1,745
  of pending offers sitting in the data - and the money is identical, the Receipt
  rows identical, and `money-engine`, `settlement-engine`, `pool-engine`,
  `action-model` and `handicap` are frozen by sha.
- **ACCEPT CREATES NOTHING NEW.** `saveSideMatch()` no longer builds its own
  payload: it calls `challenges.js sideMatchPayloadFromTerms()`, which is the same
  function an accepted challenge calls. Byte-identical is true BY CONSTRUCTION
  rather than asserted against a copy, and a test holds the two surfaces' FIELD
  LISTS against each other so a field added to one cannot be missed by the other.
  The accept is ONE atomic `db.ref().update()` - a crash between two writes would
  leave either a bet nobody agreed to or an accepted challenge with no bet.
  - **The start hole is where the ACCEPT happens**, not where the offer did:
    `max(offered, sideMatchStartHole(now))`, or one side walks in already knowing
    three holes of the result.
  - A second answer is not an answer - `challengeStatusAfter` returns null for
    anything not pending, so two taps cannot create two bets.
- **RULES: `challenges` ADDED TO `database.rules.push.json`** (Desktop updated, 20,774
  bytes, **not published**). **MEASURED, AND NOT WHAT I EXPECTED: under the file
  that is LIVE today, all eleven challenge writes are ALLOWED** - including a
  made-up status, a $100,001 stake and a stray key - because `.write` at
  `events/$eventCode` governs its whole subtree and an unknown child has no
  validate. **So this delta is a VALIDATION, not a grant**, and the test's `live`
  column says so on every row. 12 targaryen tests, 6 controls (3 new: the terms
  validate, the status vocabulary, the self-challenge check). `events/$eventCode`
  is asserted child by child now, since the parent legitimately gains one.
- **ALOHA BY THE PLAYER.** `respondAloha()` widens by exactly one case: a PLAYING
  golfer may answer an Aloha offered to the side they are ON. Not the offering
  side (the side that is down offers, the side that is up accepts), not another
  match, not a spectator. The scorekeeper keeps everything. **No rules change was
  needed** - the database already permits any write under an existing event, which
  is how a scorekeeper with no account posts a score; it was the client gate.
- **THREE MORE PINS RE-POINTED, and one was a real drift:**
  `ryder_cup_phase3b_test.js` sliced the Cup surface to `function
  renderSideMatches` - not the end of the Cup, just the next thing in the file - so
  my challenge functions landed inside it and its "no money field" claim went red
  for code that is not the Cup's. It now ends at the next section banner, with a
  positive assertion that the slice is not empty. `setup_nassau_test.js` and
  `hole_bet_scope_test.js` follow the payload chain instead of the old literal.

## Where things stand, 2026-10-03 (Wave 39 additions, on a branch)

**STILL `ui-wave39-push`, STILL NOT MERGED.** Cache `golfapp-v280-following-along`
/ consumer `v120`. Full suite 10,011 tests, 0 fail.

- **THE TEE-TIME REMINDER IS GONE**, on Manny's call, before it shipped. The tee-time
  FIELD stays everywhere it shows. Nothing is dormant:
  `@capacitor/local-notifications` came out of `package.json`, the iOS allowlist and
  `Package.swift`; `tee-time.js` lost `teeTimeReminderAt`/`teeTimeChanged`;
  `push-notify.js` is five kinds, not six. Eleven tests came out with it and four
  replaced them, asserting the removal left nothing behind.
- **THREE WAYS INTO A ROUND.** `round-role.js`: keep score for Group N / I'm playing
  (not keeping score) / Just watching. "I'm playing" is two steps - role, then name -
  reusing `setMe()` and `golfapp_me_<code>`. **Only a playing golfer is registered
  for notifications:** a spectator never is (the bare link is what gets forwarded to
  group chats) and neither is the scorekeeper (they are holding the card).
  - **THE RECON ANSWER Manny asked for first:** a spectator could ALREADY pick "Who
    am I?" - `index.html:5797` has no spectator gate, and `setMe()` at `:5681` is
    reachable - but it is rendered only inside the Action Center body
    (`index.html:6156`), which is **collapsed by default** and **empty on a round
    with no bets** (`:5954`, `:5955`). Measured: a spectator on a round with one side
    bet got 190 bytes, the toggle alone. The machinery was there; the entry point
    was not.
  - **THE SHEET IS MULTI-GROUP ONLY; A FOURSOME GETS A LINE.** Making it a sheet
    everywhere turned **39 guards red** - the byte-for-byte arrival pins, three
    Chrome layout checks and the modal-layering tests - because a foursome's bare
    link is how most of this app's checks and most of its golfers arrive. A
    multi-group round has asked on arrival since 2026-09-20, so two more rows change
    nothing there. **If Manny wants a foursome interrupted too, that is one line in
    `roundRoleShouldAsk`.**
  - **THE OWNER IS NOT EXCLUDED from the multi-group sheet** - caught by
    `organizer_doors_after_picker_test.js`: on a multi-group round the organizer is
    one of the golfers and picks their group like anybody else. The exclusion belongs
    on the single-group line, where they already hold the whole card.
- **ITEM 3's RECON CHANGES IT: there is exactly ONE accept/decline record in the app.**
  `sidematches.html:2685` `respondAloha()` writes
  `events/<code>/sideMatches/<id>/aloha {status, respondedAt}`. **A press has no
  offer and no answer** - `index.html:4823` `confirmSidePress()` writes it straight
  to `presses` when the golfer taps, because pressing is a thing you do, not a thing
  you ask - and a bet challenge has no record either. Inventing one would be a NEW
  money record, which is STRICT and not approved, so I did not. `?aloha=<matchId>`
  focuses the card with the EXISTING buttons; the write is `respondAloha()`, same
  path, same gate. **And money does not move from a URL** - `sidematches.html` has
  refused that since the `?press=` link was built.
  - **ONE THING FOR MANNY:** `respondAloha()` is gated on `canPressSideMatch()`,
    which a following player does not pass. Widening it is a money-write rule change
    and therefore STRICT. Default is to leave it: the notification tells the playing
    golfer, the scorekeeper taps - which is how a bet already works for golfers
    without the app.
- **ITEM 2 IS PROPOSED, NOT BUILT** (`docs/wave39-push-plan.md`):
  `organizers/<ownerUid>/groups/<groupId>/members/<memberKey>/devices/<uid> = true`,
  **written by the GOLFER**, so no sign-in is ever needed, the organizer never writes
  somebody else's uid, and there is no global name-to-uid index to leak. Needs a
  rules delta - STRICT. Already true with no new mechanism: `pushDecide` refuses with
  `no-device`, so a golfer the app has never seen is never sent anything.
- **FOUR MORE SELF-INFLICTED FAILURES, same class as the last four:** a name of mine
  colliding with a selector or a literal some guard already owns. The offer line
  borrowed `.whoami-line-btn` and became the first match for a tap `whoami_line_test.js`
  aims at the name picker; the sheet's two new outline rows made
  `.btn-outline` ambiguous for six Chrome checks (fixed by giving every row a
  `data-role`); a guide sentence used "read-only", which a guard bans because the app
  once wrongly called a group LINK that; and `baseline_arithmetic_test.js` had a
  latent `lineOf is not defined` - a branch that had never executed, so the first
  real fault it found crashed instead of reporting.
- **AND A REAL DEFECT CAUGHT BY A PIN:** `card_scope_closed_prev.fixture.json` showed
  the bare link saying "Just watching." underneath a sheet still asking how the golfer
  was joining. `roundRoleOf()` defaults to watching because a bare link grants
  nothing - right for permissions, wrong as a sentence. The note now speaks only for
  a role the golfer chose.

## Where things stand, 2026-10-03 (Wave 39, on a branch)

**WAVE 39 IS BUILT ON `ui-wave39-push` AND NOT MERGED** - awaiting Manny's Cmd+R.
Cache `golfapp-v279-teetime-notify` / consumer `v119`. Full suite green.

- **A ROUND CAN CARRY A TEE TIME, which it never could.** Optional date + time on
  the setup screen, editable later, and per round in the trip planner. Shown on the
  scorecard header, the Game tab's Course card, and the trip itinerary.
  - **STORED AS `teeTimeISO` + `teeTimeZone`**, and the two fields are not
    redundant: an instant answers "when do they tee off" (what a reminder is
    scheduled against) and the ZONE answers "what does the card say". A tee time is
    a fact about the golf course, not about the reader - a Road Trip round set in
    Oregon must read 8:40 AM to the organizer on the tee AND to his wife reading
    the link at home. `tee-time.js` is the only formatter and a test proves the
    display asks for the round's zone.
  - **The offset is captured, never re-derived.** A round set in March for August
    would land an hour out if the offset came from the zone name at save time.
  - Absent is first class: a pickup round nobody wrote down, and a round carrying a
    corrupt string, both render as nothing - never an empty row or "Invalid Date".
- **THE REMINDER IS A LOCAL NOTIFICATION**, scheduled on the device when a golfer
  opens a round with a tee time and rescheduled when the organizer moves it. No
  server, no token, no scheduler, no rules - and it fires with the phone in a
  pocket and no signal. The id is the round's, so a reschedule REPLACES; an
  unchanged time schedules nothing (this runs on every snapshot of the round).
- **`database.rules.push.json` IS PREPARED AND NOT PUBLISHED.** Two new top-level
  nodes, `pushTokens/$uid` and `pushPrefs/$uid`, owner-only read and write;
  **every pre-existing node is byte-identical** and a test asserts it.
  `database.rules.rollback-stage2delete.json` is the rollback. Both are on the
  Desktop as `PUBLISH-THIS-database.rules.push.json` and
  `ROLLBACK-database.rules.stage2delete.json`. `rules_push_tokens_test.js`: 9
  targaryen tests including 3 negative controls (world-readable tokens, a dropped
  uid check, a dropped record validate).
  - **NOTE: the repo's own `database.rules.json` is NOT what is live.** Live is
    `database.rules.stage2delete.json` (published 2026-09-30) and that is the base
    this delta is built on. A test pins it.
- **THE PUSH HALF IS WIRED AND INERT.** `@capacitor/push-notifications` and
  `@capacitor/local-notifications`, iOS allowlist only - Android deliberately
  untouched, because push there needs google-services.json and the gradle plugin.
  Token registration fires when a golfer answers "Who am I?" (the existing Wave 17
  `golfapp_me_<code>`), and with no APNs key `register()` fires
  `registrationError`, a reason is recorded and the app carries on. `POST
  /api/push-send` (FCM HTTP v1, `FCM_SERVICE_ACCOUNT`) answers `not_configured`
  until the secret exists. Settings (Essentials / Bets / Hype) are in the account
  panel, native shell only.
- **FOUR SELF-INFLICTED FAILURES WORTH RECORDING**, all the same class: a comment
  or a variable name of mine tripping a guard that searches for a literal. An
  apostrophe inside `SHARED_SHELL` (the list is parsed by matching single-quoted
  strings) swallowed two entries; the comment explaining it quoted the pattern and
  did it again; the same trap in `sw.js`; and a local named `payload` whose
  `.update` call sits above the round save, which
  `persistence_contract_test.js` finds by first occurrence. **No single quotes in
  comments inside those list blocks, and do not spell a banned literal out in the
  comment that explains the ban.**

## Where things stand, 2026-10-03 (later)

**WAVE 38 AND THE LIVE MATCHES FINAL TOTAL ARE ON MAIN.** `a9fbf8d`, cache
`golfapp-v278-courseindex` / consumer `v118`. Production verified from a fresh
codeload tarball and live.

- **Wave 38 - the setup pages stop downloading every course anybody ever added.**
  MEASURED: `global_courses` is 61,258 bytes for 42 courses and grows about 8 KB
  per import, and admin.html, tournament.html and trip.html each read ALL of it on
  every load (a live listener on the first two). `?shallow=true` answers the same
  node in **941 bytes** - but it is a REST parameter and **the Firebase JS SDK has
  no shallow read**, which is why the probe is a plain `fetch` and not a `ref`.
  `course-index.js` is the one builder for all three pages, every dependency
  injected. Steady state: **941 bytes a load instead of 61 KB**, plus one record
  for a course added since the last visit and one when a course is picked.
  **Cards are never cached, only names** - the probe cannot see a record CHANGE,
  and a stale stroke index pays the wrong golfer.
  - **No cache means no probe.** Found by `tools/tournament-net-reachable-check.js`,
    which passed standalone and went red inside the full suite because the probe
    had not answered when the row was clicked.
  - A hanging probe is a failed probe after 4s, and a failed probe KEEPS the cache:
    `null` means "could not ask", never "there are no courses".
- **The LIVE MATCHES & PRESSES card now says who won what.** One bold line at the
  bottom of a FINISHED match - "Reese +$80 (won 4 of 4 bets)", "Reese +$40 ·
  Manny +$40 — All square" - consuming `sideMatchDecidedNet`/`Tally` over the
  receipt settlement-engine already priced. Nothing recomputes money. And a
  finished segment now reads **the Receipt's wording**: a bet that closed on the
  16th is **3&2**, where money-engine's live reading says "3 UP" - true while a
  match runs, false once it is over. Mid-round there is no total.
- **WAVE 39 (push notifications) IS RECON + THE PURE HALF, ON `ui-wave39-push`,
  NOT MERGED.** `docs/wave39-push-plan.md` has the full plan, the proposed rules
  delta and Manny's numbered checklist (APNs key, Firebase Cloud Messaging, Xcode
  capability, Cloudflare secret).
  - **A ROUND HAS NO TEE TIME.** Measured: `teeTime` is in no page and in no rule.
    A round carries `roundDay` (a LABEL, "Single Round") and `createdAt`. So
    notifications 1 and 2 cannot exist until round setup asks for one -
    `pushDecide` refuses them with `reason: 'no-tee-time'` rather than inventing a
    time. **Manny's decision: add the field, or ship v1 with four of the six.**
  - **The roster→device mapping already exists**: `golfapp_me_<code>` +
    `resolvedMeId()` from Wave 17, plus the uid every golfer has from auth-boot.
    A registration is `{ uid, playerId, token }` and nobody is asked a new question.
  - **Tee-time reminders should be LOCAL notifications** scheduled on the device at
    join, not server-side: no scheduler, no token, no rules, and they fire offline.
    Pages Functions do not support scheduled handlers - a cron needs a separate
    Worker.

## Wave 39 is merged, and push works end to end (2026-10-04, MERGED `c143857`)

Cache `golfapp-v290-preflight` / consumer `v130`. Everything that waited on
Manny's setup is now live: side-bet challenges with their group scoping,
following along as a player, the Players-step tidy, My Groups released, the
tee-time field removed, and PUSH.

- **THREE FAULTS STOOD BETWEEN A GRANTED PERMISSION AND A NOTIFICATION, and each
  one hid the next.**
  1. **REGISTRATION ONLY RAN FOR A GOLFER WHO HAD PICKED A NAME IN A ROUND.**
     Manny granted the iOS permission the night before the rules were published,
     the write was refused, and **iOS never shows that prompt twice** - so the
     phone had permission and no token, for good. Every launch now re-registers
     silently when permission is already granted: no prompt, no round, no name,
     idempotent (the row key is the token's own fingerprint).
  2. **THE AppDelegate FORWARDED NOTHING.** iOS hands the device token to
     `didRegisterForRemoteNotificationsWithDeviceToken:`, and the Capacitor plugin
     sees it only through `NotificationCenter`. Neither method existed, so
     `register()` asked, iOS answered, nobody listened, and every caller timed out
     into `no-token` - with nothing on screen pointing at a Swift file.
  3. **AND THE TOKEN WOULD HAVE BEEN THE WRONG KIND.**
     `@capacitor/push-notifications` returns the APNs device token; the sender is
     FCM HTTP v1, where `message.token` must be an FCM **registration** token.
     `@capacitor-firebase/messaging` joins for one call, `getToken()`, with the
     APNs listener as the fallback. Verified in the database: 142 characters with
     a colon, which is the FCM shape.
- **AND THEN "Load failed", WHICH WAS A PREFLIGHT NOBODY ANSWERED.** A POST
  carrying `content-type: application/json` is not a simple request: the browser
  sends OPTIONS first and will not send the POST unless that answer allows the
  method and the header. Nothing exported `onRequestOptions`, the preflight fell
  to the catch-all and came back 405, and **fetch() gives a failed preflight no
  status and no body** - "Load failed" was all the app could honestly say.
  `/api/push-send` answers it now (204) and carries the CORS header on **every**
  answer including refusals, because `not_configured` and `no_device` are exactly
  the ones the app needs to read.
- **MEASURED IN PRODUCTION after the merge:** sw.js serves
  `golfapp-v290-preflight`; `OPTIONS /api/push-send` from `capacitor://localhost`
  answers **204** with allow-methods `POST, OPTIONS`; and a POST answers
  **`nothing_to_send`** - not `no_such_route`, so the route is deployed, and not
  `not_configured`, so **the Function can read FCM_SERVICE_ACCOUNT**. Nothing was
  sent to anybody: the probe's decision said `send: false`.
- **THE ENTITLEMENT PAIR:** Debug signs `aps-environment development`, Release
  signs **production** (`App/AppRelease.entitlements`). One file for both is how a
  TestFlight build registers on the development gateway and silently never
  receives.
- **THE TEST BUTTON** is Account -> Notifications, visible only to the account
  named in `app_settings/pushTestUid`, and it sends to that account's own tokens
  through the real route. When there is no token it offers **Register this phone**
  rather than reporting a dead end.

## THE SCORECARD IS THE HOLE (UX wave, 2026-10-05, MERGED `b5fbf18`)

Cache `golfapp-v295-scorecard` / consumer `v135`. Six commits on `ux-simplify`,
merged after Manny tested them.

- **IT WAS A RATIO, NOT A BUG, so it was measured first.** `tools/first-screen-check.js`
  arrives cold on a live round at 390x844 and reads what actually PAINTS in the first
  viewport. Before: **0 score boxes above the fold**, 0% of the first screen scores,
  the hole card 8.9%, and 525 of the 844 pixels taken by the theme row, the round
  header, two rows of nav pills, the Playing With card and the group-scores card - the
  hole card began at y=610 on a 2025px page. After: **all four boxes above the fold**,
  the hole card 45-52%, and the page one screen.
- **THE STATUS SHEET** holds what a golfer touches once a round: the theme, the game
  code, the nav, the Dots selector, the view toggle, the group strip, Save & exit,
  Delete. One handle, fixed at the bottom. **The blocks are MOVED, not rebuilt** - same
  ids, same handlers, same renderers - so a copy could never exist with one id.
- **AND THE READING CARDS CAME BACK ONTO THE PAGE the same week**, because a fresh
  round behind a handle said nothing about what the group had agreed to play for. The
  leaderboard and the live matches are compact lines directly under Prev/Next (measured
  y=455-521, above the fold on a four-golfer card); the full versions, Today's Games,
  the skins card and Playing With are on the page below them.
- **THE LEADERBOARD SHOWS BEFORE ANYONE TEES OFF**, every golfer at E, thru 0. It used
  to render nothing until a score existed. The old guard said "a leaderboard with
  nobody in it" was worse than none; a board with EVERYONE in it at E is not that board.
- **THE LANDING RULE IS MANNY'S:** if the hole card from its heading through Prev/Next
  FITS with the page at the top, `landOnHole` lands at **scrollY 0**; it scrolls only
  when the card would not fit (5-8 golfers), and then the heading goes to inset + 12.
  Nothing is ever placed under the safe-area top. He found this the hard way - after
  Next, the "Final results are in" banner sat under the clock - and it was not a bug in
  the landing, it was a landing built for a 2000px page running on a one-screen one.
- **TWO REAL DEFECTS FELL OUT OF THAT, neither a pin.** `box.focus()` scrolls the
  element into view on the browser's terms, which took the heading 35px under a 47px
  status bar - the exact thing Wave 19b fixed, by another door; it is
  `focus({preventScroll:true})` now. And `tools/lib/cold-arrival.js` measured a tap
  target in the SAME evaluation as the `scrollIntoView` that moves it, then clicked the
  stale point: harmless while pages were long, and on a one-screen card it tapped empty
  space and two checks reported a broken landing that was not broken. **Scroll, settle,
  then measure.**
- **NOTHING IN THE PANEL COMPUTES.** Every line is the builder's own words -
  `liveStandings()`, `buildLiveMatchStates()`, `kpLiveLineHtml()` reused whole,
  `buildSkinsLedgerRows()` over settlement-engine's ledger, `describeGame()` and
  `buildMoneyPoolBanner()` for Today's Games. The stake is the wager's own figure; **no
  mid-round total** is printed, and the skins carry is **units, never money**.
- **49 HELPER SENTENCES OVER 15 WORDS became 8**, all eight a single line of 16-21
  words. Where a guard pinned a sentence because a silent change would cost something,
  the short line KEEPS the pinned words rather than the guard being re-pointed.
  Before/after in `~/Desktop/ux/COPY-TRIM-BEFORE-AFTER.txt`.
- **GUARDS:** `ux_status_sheet_test.js`, `hole_landing_fits_test.js`,
  `hole_live_panel_test.js`, `fresh_round_page_test.js`, and
  `tools/first-screen-check.js` for the measurement. Roughly fifty re-pins across the
  wave, each with its reason in place; **no money code was touched at any point** -
  every money golden, `*_prev` fixture and engine file is byte-identical to `cdf6f53`.
- **AND MY OWN WORDS BROKE TWO GUARDS AGAIN:** a variable called
  `notifyTestCountdown` matched the trial-banner sweep, and a comment reading "The
  confirm() in front of it" became visible to the bare-dialog scanner once a trimmed
  sentence elsewhere moved the file's quote parity. Both were the guard being right.

## LIVE ACTIVITY on the lock screen - PLAN ONLY, nothing built (2026-10-04)

Asked for as a plan and recorded as one. A card on the iPhone lock screen and in
the Dynamic Island showing the golfer's score to par, holes thru, and match status.

1. **It is not a Capacitor plugin job, it is a WIDGET EXTENSION.** Live Activities
   are SwiftUI only: a new `Widget Extension` target in `ios/App`, an
   `ActivityAttributes` struct (static: round code, course, the golfer's name;
   dynamic: toPar, thru, matchLine), and a `WidgetBundle`. None of it can be
   written in JavaScript, and the web app cannot draw a pixel of it.
2. **The bridge is a small local plugin we would write** - about 120 lines of
   Swift plus a TS shim: `start(attrs)`, `update(state)`, `end()`. There is a
   community plugin (`capacitor-live-activity`-style) but the shape is simple
   enough that owning it beats depending on it, and this repo already keeps an
   explicit iOS `includePlugins` allowlist.
3. **LOCAL UPDATES ARE THE RIGHT DEFAULT HERE.** The scorekeeper's phone already
   has every score the moment it is typed, so `Activity.update()` from the app is
   free, instant and needs no server. ActivityKit allows roughly one update per
   second and the system throttles a chatty one; a round posts a score every few
   minutes, so we are nowhere near it.
4. **PUSH UPDATES ARE THE SECOND HALF, and the one that matters for the three
   golfers NOT keeping score.** Their phones learn nothing until they open the
   app. That needs the activity's own push token (different from the device
   token), posted to `pushTokens/<uid>/live/<activityId>`, and
   `apns-push-type: liveactivity` sends from `functions/api/_push.js` - which
   already holds the FCM/APNs credential and the routing. FCM v1 does NOT carry
   Live Activity payloads, so this is the first thing in the app that would need
   APNs directly.
5. **Effort, honestly:** 2-3 days for the local-only version (target, attributes,
   the plugin, start/stop at the right moments, the card design at two sizes),
   and 2-3 more for push updates, because the APNs-direct path is new ground and
   the token lifecycle (start, stale, ended, phone restarted) is where the bugs
   live.
6. **Apple review:** Live Activities must be user-started and user-endable, must
   not be ads, and must end when the thing they describe ends - a round that
   finishes has to call `end()` or the card sits on the lock screen for eight
   hours. The entitlement is `NSSupportsLiveActivities` in Info.plist; no new
   capability request, no new agreement. Low review risk, but the "ends when the
   round ends" rule is a real behaviour we would have to own.
7. **The one design question to settle first:** whose score does it show on a
   phone that is not keeping score? It has to be the GOLFER's own line, which
   means the activity can only start once "Who am I?" is answered - the same
   answer push notifications already depend on.
8. **Not recommended before the App Store build settles.** It adds a target, a
   plugin and an APNs path to a binary that is mid-review.

## THE 10th TEE: a round that plays 10-18, then 1-9 (2026-10-04, MERGED `0ebbf85`)

STRICT. Cache `golfapp-v294-playorder` / consumer `v134`. Three commits on
`tee-start-hole-10`, tested on the phone and approved: the module and the engine
(`3b436a8`), the per-file approved settlement half (`d49efe0`), and the copy
(`a5358fe`).

- **IT DID NOT EXIST, and the recon is most of the value.** No tee start anywhere:
  no wizard control, no field on `events/<code>`, and every surface took the play
  order to be the hole numbers ascending - `goToAdjacentHole` sorted by number and
  was "clamped, never wrapped", the hole view landed on `holeNumbers[0]` and called
  the highest number the last hole, and `match-engine.js` computed holes-left as
  `endHole - hNum`.
- **`startHole` WAS ALREADY TAKEN, AND IT MEANS SOMETHING ELSE.** Everywhere in this
  repo it is the hole a BET starts on - a skins game added "from H5", a press, a side
  match bought on the turn - and `events/<code>/startHole` is READ as the legacy Dots
  start by `index.html` `kpLiveState`. A round-level reuse of that key would have
  silently stopped paying dots and KPs on the first nine. The round's tee is
  **`startingHole`**, the same name the tournament shotgun sheet has always used.
- **THE FIX IS THAT THE ARRAY ORDER IS THE PLAY ORDER.** `play-order.js` rotates the
  card; `match-engine.js` reads the array it is given AS the sequence, so holes-left
  counts the segment's holes still ahead and a press starts on the next hole PLAYED,
  never "hole 19". A segment is still named by its hole NUMBERS - a Nassau Front 9 is
  holes 1-9 whichever tee the group went off - so only the Overall spans the sequence.
- **WHAT ACTUALLY MOVES MONEY, measured over 6,000 random cards: nothing, without a
  press.** A match segment's final status is the sum of its holes whichever order they
  are added in. The money case is the AUTO-PRESS: two down on the 18th green off the
  10th tee leaves NINE holes to play and the press fires, where in number order the
  18th is the last hole and no press can exist. Worked example in
  `tee_start_test.js`: Ann wins 1, 3, 6, 13, 16, 18 and Ben wins 2, 4, 5, 7, 14 - $10
  to Ann off the 1st tee, nobody pays off the 10th, because the press Ben wins only
  exists there. **A $20 swing was reported mid-wave and it was a MISMATCH** -
  play-order accumulation against number-order arithmetic - which is the state the
  wave removed rather than a difference between the two tees.
- **PER-FILE APPROVED, and only after the gap was named:** `settlement-engine.js` (the
  two internal `calculateMatchEngine` calls, the first-hole label, and the skins
  CARRY, which now rolls a tied hole onto the next hole PLAYED - off the 10th tee a
  birdie on the 1st collects TEN units) and `bet-strip.js` (the main chip's "Started
  Hole N"). Before that, the main game settled in play order and a side bet on the
  same round settled by number, so two wagers over the same holes disagreed.
- **THE SEGMENT LABELS CLAMP BY SEQUENCE, NOT BY NUMBER.** `Math.max`/`Math.min` were
  right on a card played 1..18 and wrong off the 10th in both directions: they clamped
  a press starting on the 1st UP to the 10th, and called the Overall's first hole the
  1st when the group teed off the 10th.
- **A FIRST-TEE ROUND IS BYTE-IDENTICAL BY CONSTRUCTION.** Both helpers early-return
  the CALLER'S OWN ARRAY by identity when the tee is the card's first hole, so nothing
  re-sorts. Every money golden and `*_prev` fixture is the same sha as pre-merge main,
  and the nine protected files this wave did not touch - `money-engine.js`,
  `payouts.js`, `pool-engine.js`, `handicap.js`, `action-model.js`, `hole-events.js`,
  `score-marks.js`, `ryder-cup.js`, `database.rules.json` - are byte-identical.
- **GUARDS:** `tee_start_test.js`, 22 tests, two declared baselines (11/3 for the
  engine half, 18/4 for the settlement half, with `BASELINE COUNT DELTA: +8` recorded
  beside the first). Three controls, each fired behaviourally and each restored by sha
  from a saved copy. Twenty-one re-pins, every one with its reason, including two
  slice windows that no longer reached the call they pin.
- **AND MY OWN APOSTROPHE EMPTIED THE SHELL LIST.** The first draft of the
  `play-order.js` comment in `sync-mobile-web.js` contained "the card's own order";
  `build-shell` reads that list by matching quoted strings, so one apostrophe swallowed
  every entry after it - exactly as the block warns in capitals two lines above. Caught
  because `build-shell` refused to build, not by a test.

## A notification you can see, and a tap that goes somewhere (2026-10-04)

Cache `golfapp-v291-foreground` / consumer `v131`. Push worked - **"Sent to 1
device"** - and no banner appeared, because the app was in the FOREGROUND.

- **IT WAS A CONFIG VALUE, NOT A DELIVERY FAILURE, and nothing could have said
  so.** `PushNotificationsHandler.willPresent` returns an **empty option set**
  when `presentationOptions` is absent - iOS being told, correctly, to present
  nothing. The notification arrived, was handed to the app, and the app said show
  nothing. `capacitor.config.ts` now names `['badge','sound','alert']`.
- **ON BOTH PLUGINS, DELIBERATELY.** `@capacitor/push-notifications` claims
  `bridge.notificationRouter.pushNotificationHandler` in its `load()`;
  `FirebaseMessaging` sets the same property in its init. **Whichever loads last
  owns `willPresent` and the tap events**, and their defaults disagree - messaging
  defaults to badge/sound/alert, push-notifications to nothing. Naming both is the
  only version of this that does not depend on plugin load order.
- **`pushActionHref` HAD EXISTED SINCE WAVE 39 AND NO PAGE CALLED IT.** The
  builder was correct and every tap on every notification opened whatever the app
  was last showing. `pushBindNotifications` binds both plugins' four events, both
  pages bind on arrival, and one tap navigates once (the dedupe key, or the
  notification's own id, makes a second delivery a no-op). A test notification
  lands on **Account** (`admin.html?account=1`, which the page now honours); the
  five real kinds land on their round, settlement or match card as the builder
  always said they should.
- **AND THE PHONE WAS NEVER TOLD WHAT IT HAD RECEIVED.** The FCM `data` block
  carried the dedupe key, the channel and the actions - never the kind or the
  round code - so there was nothing to route on even once something listened.
  `pushDecide` echoes both now and `_push.js` copies them; nothing above that line
  reads either field.
- **"Send in 10 seconds"** sits beside the test button so the foreground case and
  the **lock-screen** case can both be tested with one phone. It waits and then
  calls the one sender - a second, simpler send would prove something the real
  notifications do not do.
- **`tools/push-tap-check.js`** is the proof, and it is the only kind that could
  be: it arrives cold on `admin.html` and `index.html`, injects a stand-in
  `window.Capacitor` whose `addListener` **records** what the page asks to hear,
  then fires that callback the way iOS does. Nothing the page defines is called.
  Measured: both pages ask for all four events unprompted, the Account panel is
  closed on arrival and open after a tapped test notification, the card says the
  notification arrived while the app was open, and a tapped final-results
  notification makes the page request `settlement.html?game=COLD`. Control:
  deleting the one `bindPushTaps()` call from `admin.html` turned it into 8
  problems (restored by sha from a saved copy, not `git restore`).
- **MY OWN VARIABLE NAME BROKE AN EXISTING GUARD:** `notifyTestCountdown` matched
  `organizer_gate_test.js`'s "no page shows a trial banner or **countdown**". The
  guard was right; the name was mine, and is now `notifyTestWait`.
- **WHAT NO TEST HERE CAN PROVE:** that a banner appears on his phone. That is
  iOS drawing a notification from a config value. `push_foreground_test.js` says
  so in its header, and holds the value against the vendored plugin source so the
  file cannot end up guarding a fix for a bug that was fixed upstream.

## The trip's own money: a pot on the points race and a pot in every round (2026-10-04, MERGED `277a093`)

STRICT. Two optional pots, both OFF until an organizer switches them on. Cache
`golfapp-v284-trippots` / consumer `v124`.

**MERGED 2026-10-04 after Manny tested both waves via Cmd+R**: `trip-simplify`
(`11d9ba7`) and `trip-pots` on top of it (`277a093`). One cache key covers both -
v284 is later than v283 and sw.js carries BOTH waves' "Moved to" notes, so a
device on either older version is told what it would otherwise keep serving.
Production verified: sw.js serves `golfapp-v284-trippots`, trip.html, trip-pots.js
and roster-paste.js are byte-identical to the repo, and the course proxy Function
still answers 200. Suite 10,057 tests, 10,055 pass, 0 fail; the money engines,
payouts.js and the match-engine golden are unchanged by sha.

**`ui-wave39-push` (`4f5f6b4`) IS STILL UNMERGED** and stays that way: the push
setup (APNs key, Firebase Cloud Messaging, the Xcode capability, the Cloudflare
secret) and the challenge test are still outstanding.

- **THE TRIP POT** is the points race played for money: every golfer in the trip
  pays one buy-in, the pot is buy-in x field, and it pays the finishing order
  through **payouts.js allocatePlacePayouts** - the same place-and-tie rule the
  prize calculator and the Tournament desk use. It is the only money in this app
  that belongs to the TRIP rather than to a round, so it is added once, to BOTH
  trip totals (the daily one and the settle-once one), and the scope sentence
  gains "and the Trip Pot" **only while it is on**.
  - **IT BALANCES TO ZERO OR IT IS NOT APPLIED.** The places must add up to the
    buy-ins before Save will take them, and `tripPotLedger` refuses any pot whose
    entries do not sum to zero - which is the backstop that caught the real
    defect below.
- **THE DAILY POT** is not new money: it is each round's own Weekly Game
  (`data.moneyPool`), set once on the trip and copied into every round **with no
  scores**, through `trip-roster.js tripRosterPlan` - the same open/closed split
  every other trip-wide change uses. A round can still be edited afterwards.
  - **THE BUCKETS ARE SHARES, NOT DOLLARS, AND THAT WAS FORCED BY MEASUREMENT.** A
    round's pot is the buy-in times whoever is in THAT round, so a fixed "KP $40,
    net $60" written into a four-man $80 round is "$20 over budget" and
    pool-engine.js refuses the whole pool. A percentage is right at every
    headcount; skins takes the remainder so the last cent always lands.
- **THE POINTS SCALE CHANGED:** 1st is worth the whole trip's field size (24 in a
  24-man trip), not however many posted that day, and there is a Net/Gross switch.
  A thin Thursday used to be worth less than a full Monday for the same finish.
  **Money did not move:** the re-captured `trip_identity_prev.fixture.json` came
  back byte-identical on money, board and awards - only the points changed.
- **A REAL DEFECT, FOUND BY MY OWN CONTROL.** Forcing a pot on changed nothing,
  and the reason was that `computeTripPointsRace` keyed its totals by golfer and
  then `Object.values()` threw the key away - so no prize could ever be matched to
  a payer and the pot refused itself every single time. **Every unit rule can pass
  with a feature that never runs**; it took rendering the page with a pot switched
  on to see it, and that test is now in the file.
- **WITH BOTH OFF, THE TRIP SETTLES BYTE FOR BYTE AS IT DID** - money card, points
  race, leaderboard and prize calculator - against
  `helpers/trip-money-no-pots.golden.json`, captured from the page before any of
  this existed.
- **Five controls fired behaviourally**, one was inert and is reported as inert
  (forcing the apply branch while the pot is off changes nothing, because a
  refused pot carries no entries). Engines frozen by sha, payouts.js included.

## Road Trip, simplified - and a group header that was being paid as a golfer (2026-10-04, MERGED `11d9ba7`)

Manny pasted his real 24-golfer list on the live app. Five things were wrong, and
the first costs money. Cache `golfapp-v283-tripsimplify` / consumer `v123`.

- **"Group 4" WAS PARSED AS A GOLFER** - name "Group", handicap 4 - so a 24-man
  list reviewed as **30 golfers**, and six phantom players with handicaps would
  have gone into every round. A handicap is strokes and strokes are money. A group
  header, a bare tee time and a blank line are all group separators now. The
  header words are a closed list (group, grp, flight, foursome, team, tee, tee
  time) with an optional number or letter and an optional time; **"Group Captain
  Smith 8" is still a golfer**, because the rule must err toward the name.
- **THE WRITE LANDED AND THE SCREEN DID NOT CHANGE.** Player 1-4 stayed on the
  page after Yes: every round's players come from a ONE-SHOT `events/<code>` read,
  and the `trips/` listener that fires afterwards is for the trip node. All three
  roster writes re-read now. **The harness could not have caught this** - it
  recorded writes without applying them, so a page that never re-read looked
  identical to one that did; `tools/lib/cold-arrival.js` now lands every write in
  the fixture (and its root ref no longer resolves to a path called "undefined").
- **THE CONFIRM COUNTED WRITES, NOT PEOPLE:** "28 placeholders replaced, 147
  golfers added" for 24 golfers over seven rounds. The counts are people now, with
  the per-round figures kept for the rare trip where rounds differ.
- **THE ROUNDS LIST WAS IN MAP-KEY ORDER** with the Day label alone, so his week
  opened on "Day 2 PM". Each row reads **"Tue 10/13 · 8:24 AM · Caledonia"** with
  Open on the row and Edit tucked inside. **The TIME sorts, not the label:**
  sorting the finished label put 1:40 PM before 7:50 AM, because "1" is less than
  "7".
- **AND THE PLACEHOLDER WARNING WAS PRINTED PER GOLFER PER ROUND**, on three
  cards - seventy-odd paragraphs for 24 unnamed golfers. One quiet line now, which
  names the ROUNDS to open and counts the golfers rather than listing them. **A
  duplicate real name still gets the loud box and its own sentence, every time**:
  that is the dangerous case, two golfers one balance.
- **THE REDESIGN.** A new trip is four things on one screen - name, the rounds
  (paste the itinerary), the golfers (paste the list or give a headcount), Build -
  with the day planner behind one line that opens itself the moment it holds
  rounds. A pasted roster goes straight into every round the Build makes, groups
  and all. The trip page reads name, rounds, golfers, then the numbers, and the
  golfers are shown **in their groups**, because a group is who you play with and
  who can see your bets.
- **`tools/trip-simplify-check.js`** drives his exact list in Chrome at 390x844
  and writes three full-page screenshots to the Desktop (the harness gained a
  `{ shot: path }` step). It measured all five bugs and both screens.
  - **TWO MORE HARNESS TRAPS, worth knowing:** `window.name` does NOT survive a
    file:// navigation (opaque origin, Chrome clears it) but **localStorage
    does** - which is how the check reads what Build wrote before the page left;
    and the Build chain finishes in the SAME task as the click, so ten probes
    issued back to back after the tap all ran on the next document.

## The pasted trip roster, a trip that can be renamed, and a round picker that reads like a calendar (2026-10-03)

Cache `golfapp-v282-rosterpaste` / consumer `v122`. Four jobs; the first was
already done.

- **CHALLENGE GROUP SCOPING (Job 1) WAS ALREADY DONE** - `4f5f6b4` on
  `ui-wave39-push`, still unmerged, waiting on Manny's Cmd+R test.
- **A TRIP CAN BE RENAMED.** The name was typed once, at creation, and never
  again: Manny's Myrtle week went in as "Myrtle Beach 2006" and the only way to
  correct it was to build the whole trip a second time. It is on the recap card,
  the share text and the itinerary print, so a wrong one is wrong everywhere. The
  control is organizer-token only at render AND in the handler, refuses an empty
  name, and writes **`trips/<code>/name` alone** - a `set()` on the trip node
  would replace the rounds, the organizer token and the pool, and the rules allow
  that write, so nothing would have stopped it.
- **"ADD A ROUND TO THIS TRIP" IS ONE LINE NOW.** The itinerary paste builds every
  round, so Start From and the game-code link-in are the exception rather than the
  way a trip is made; both sit behind "+ Add another round". Collapsing is not
  permitting: the section is still inside the organizer-only wrapper.
- **AND "START FROM" READS LIKE A CALENDAR:** "Tue 10/13 AM · Caledonia", in date
  order. It listed rounds in the key order of the rounds map with the Day label
  alone, so a seven-round trip offered "Day 1 AM / Day 3 / Day 1 PM" and nothing
  said which course - which is how an organizer recognises the round he wants to
  copy. The date comes from the itinerary paste (stored on the round record now);
  a round linked by hand has none and keeps its `addedAt` order after the dated
  ones, because an invented date sorts a trip wrongly with confidence.
  `tripRoundWhen` reads yyyy-mm-dd as a LOCAL date: `new Date('2026-10-13')` is
  UTC midnight, which prints as the 12th anywhere west of Greenwich.
- **THE ROSTER CAN BE PASTED (STRICT).** A trip is built before anybody knows who
  is coming, so every round starts with "Player 1".."Player 12" - twelve is three
  groups - and the real list arrives later with handicaps and blank lines between
  groups.
  - **ONE PARSER FOR BOTH PAGES.** `parsePlayerPasteText` moved out of admin.html
    into **`roster-paste.js`** (new shell file, precached: trip.html calls it
    unguarded). The same list goes into a round and into the trip holding it, and
    two copies of those rules would be two different sets of strokes. The note
    stripper stays in my-groups.js, reached by the same typeof guard admin.html
    always used; trip.html loads both.
  - **PASTED GOLFERS TAKE THE PLACEHOLDER SEATS IN ORDER, AND THE SEAT KEEPS ITS
    ID**, so anything in an open round already pointing at a player id still
    points at the same seat. Then they are appended: twelve placeholders and
    thirty-two names is eight groups.
  - **ROUNDS WITH SCORES ARE NEVER TOUCHED**, and the guard is not "the field was
    not written" - it is the played round settling to the same cent before and
    after, with a $40 match on it, through the engines in one realm. The untouched
    rounds are NAMED on the review screen.
  - **GROUPS ONLY WHEN THEY TILE THE ROSTER EXACTLY.** Group sizes are positional
    and a group decides who sees which wagers, so a pasted run written over a
    roster holding leftover placeholders would put somebody in the wrong group.
    When they cannot tile it, nothing is written and the review says so.
- **`tools/trip-roster-paste-check.js`** is the user-path proof: a cold trip.html
  at 390x844 as the organizer, real CDP taps and keystrokes, one played round and
  two with twelve placeholders. It measured the rename writing one child, the
  date-ordered picker, the review reading "B Jimmy 11 (captain)" as Jimmy/11/B,
  and the apply writing only `events/RD2|RD3/players` with the seats keeping ids.
  - **TWO HARNESS TRAPS IT COST TO FIND, both worth knowing.** The Golfers section
    **ships open**, so tapping its summary CLOSED it - and every tap afterwards
    landed on the section underneath while the probes still read plausible rects
    out of the collapsed card. And `el.scrollIntoView({block:'center'})`, which
    the tap step uses, **moves nothing on this page**: measured, scrollY stays put
    with the element 1,110px below the fold, so the check scrolls with
    `window.scrollTo` before each tap. Neither is a page fault; a thumb scrolls
    the page itself.

## A pasted course nobody had saved went nowhere (2026-10-03, same day)

Manny's review read **"2026-10-14 14:06 - Myrtlewood PineHills - will look up
online"** and **"2 online lookups"**. After Use these 7 rounds, Day 2 PM's course
was blank - "Search / Select Course" - with no message. Cache
`golfapp-v281-itinlookup` / consumer `v121`.

- **THE EXPENSIVE FAULT FIRST: THAT COURSE WAS ALREADY SAVED.** The directory
  calls it "Myrtlewood - Pine Hills"; he wrote "Myrtlewood PineHills". Normalised,
  those are `myrtlewood pine hills` and `myrtlewood pinehills` - **one space
  apart** - so the matcher missed and a course he already had was sent to a search
  that costs two of the day's 35 requests. `tripItinTight` compares them
  space-free for the EXACT test only; containment still runs on the spaced form,
  where "pinehills" has to stay different from "pine lakes" (both are in the
  Myrtle group). **Measured on his line now: 0 lookups.**
- **AND NOTHING LOOKED ANYTHING UP.** The review priced a lookup the apply step
  never performed - it set `courseId` to `''` and moved on, so a round that said
  "will look up online" became a blank box **that looks exactly like a choice the
  golfer made**. Use these N rounds and Build both run the lookups now,
  sequentially (free tier, two requests per course).
- **THE IMPORT IS THE ONE THAT ALREADY EXISTED.** `course-import-rules.js` gained
  `buildImportRecord`, `importedCourseKeyFor` and `courseProxyBase`, and
  **admin.html no longer declares its own** - it calls the shared ones. So the
  record a pasted itinerary writes is the record a tap writes: same validator
  (`importCardOrRefuse`, BEFORE the write), same `global_courses/<key>`, same
  merge, same `source.siFrom`. `buildImportRecord` also lost its first parameter,
  which it never read.
- **AMBIGUITY IS A QUESTION.** A multi-course facility answers a search with its
  whole family - Myrtlewood is PineHills, Palmetto and Hummingbird - and three
  different eighteens carry three different stroke indexes, which is three
  different amounts of money. `tripItinPickOnline` picks only on an exact name or
  on every word the golfer typed; otherwise the round shows a pick list.
- **NEVER A SILENT BLANK.** A round with no course after all that says **"Needs a
  course: Myrtlewood PineHills"**, gives the reason in the shared sentence for
  that refusal ("Course search is resting for today..." on a 429), pre-fills the
  box with the pasted name, and offers one tap that searches again. An undecided
  Friday is NOT in that state - it is a deliberate blank, and pestering about it
  would make the honest state look like a fault. The planner's picker also lists
  imported courses now and carries its own online-search row.
- **A TRAP WORTH REMEMBERING: `renderRoundPlanner` REBUILDS THE CONFIG OBJECTS.**
  A `cfg` captured before a render is an orphan after it, so the first draft's
  async handlers wrote the lookup's answer into a dead object and the card read
  "Searching online..." forever with the answer in hand. Every handler addresses
  rounds by INDEX now, and `tools/trip-itinerary-lookup-check.js` is what caught
  it - no source scan would have.
- **THE CHECK** opens trip.html cold at 390x844 with the proxy replaced by canned
  payloads and his exact line typed in, in four arrivals: the saved course
  matching for free (0 API calls), the unsaved one imported and filled (2 calls,
  the record verified on `global_courses/gca_mw_pine`), a 429 showing "Needs a
  course" and writing nothing, and an ambiguous name producing a pick list that
  fills the round when tapped.

## The Build button ignored the itinerary it was shown (2026-10-03, same day)

Manny pasted seven Myrtle rounds on his phone, the review read all seven, and
"Build Trip & All Rounds" answered **"Set up at least one day above, or use Skip
planning below."** Cache `golfapp-v280-itinbuild` / consumer `v120`.

- **NOTHING WAS WRONG WITH THE PARSER OR THE REVIEW.** The planner rebuilds every
  round on screen from the "How Many Days" box; that box was empty, so
  `renderDayPlanner()` made zero days and `renderRoundPlanner()` threw all seven
  rounds away in the same tick `applyItinerary()` created them. **And its first
  act - reading the form back into the configs - was an ERASE, not a capture**,
  because the form on screen still belonged to the previous render. It now takes
  `skipCapture`, and the caller that has just set the configs authoritatively uses
  it.
- **AN ACCEPTED ITINERARY OUTLIVES THE FORM.** `itinApplied` holds the rows, the
  day-count box is written from them, and `buildTrip()` rebuilds from them when
  the planner is empty - so a cleared box or a collapsed paste card cannot delete
  a plan the golfer was shown. A line above the button says what Build is about to
  use, and it lives OUTSIDE the paste card, which collapses.
- **ONE DAY PER DATE, NOT ONE DAY PER LINE** (`tripItinDays`). Two lines on 10/12
  are one 36-hole day: seven lines over five dates is a **five**-day trip, which is
  the number every "Day N" label, the trip leaderboard and the round-count
  invariant read. A third line on one date starts another day slot rather than
  being dropped - wrong about the calendar, right about the money, and visible on
  the review first.
- **AND A SECOND DEFECT THE CHROME CHECK FOUND, which no source scan would have:**
  the nines in brackets. The app's own name for that course is "Thistle Golf Club
  (NC - 27 Hole)", so a golfer copying it writes the loops the same way - "...
  (NC - 27 Hole) (mackay/cameron)" - and the comma-segment rule never saw them.
  Dropped silently, **Thistle played Cameron/MacKay instead of MacKay/Cameron: two
  different nines, two different stroke indexes, different money.** A bracket with
  no slash in it is still left alone.
- **`tools/trip-itinerary-build-check.js`** is the guard that matters here: a cold
  `trip.html` at 390x844, seven lines typed with real CDP keystrokes, real taps on
  Read it / Use these 7 rounds / Build, and nothing the page defines called. It
  measured the refusal before the fix and, after it, seven rounds, five days, the
  day box reading 5, Thistle's nines in order, and the navigation to
  `?trip=...&organizer=...` that proves the trip was written.
  `trip_itinerary_build_test.js` holds the pure grouping and the wiring; it cannot
  drive `applyItinerary`, because trip.html's top-level `let` bindings are not
  mini-dom sandbox properties, and says so.
- **A NOTE ON THE SUITE'S OWN NUMBER:** this repo has **both** `*_test.js` and
  `*.test.js` files. `node --test *_test.js` is 9,862 registered and misses 92
  tests in nine dot-form files; the full suite is **`node --test *_test.js
  *.test.js` = 9,970**. A report that quotes the smaller number has silently not
  run the older integration files.

## Road Trip, 2026-10-03: a round with no course, a pasted itinerary, a changeable roster

Built for Manny's Myrtle Beach trip, **12-16 October**. Cache
`golfapp-v279-roadtrip` / consumer `v119`. FAST lane, merged.

- **A TRIP ROUND CAN BE SAVED WITH NO COURSE.** Friday is "Prestwick or Man O'
  War (not chosen)", and the planner used to refuse to build until every course
  was picked - so the choice was wait, or invent one. **An invented course is an
  invented par and stroke-index card, which is invented money.** A course-less
  round is saved with `activeCourseKey: null` and `courseData: null`, a state the
  app already handles, and the organizer picks the course when the group decides.
  `resolveCourseData()`'s eighteen-par-4s fallback is deliberately NOT used - that
  is the fictional card admin.html stopped seeding, because saving it poisoned
  `global_courses` for everyone.
- **PASTE AN ITINERARY.** `trip-itinerary.js` turns a booking email into one round
  per line - date, course, optional tee time - and a review screen shows what it
  made of each line before anything is written.
  - **Saved courses are matched first and cost nothing.** Only unmatched ones are
    searched, and the review says how many lookups that is **before** the golfer
    agrees: the provider is the FREE tier, 35 a day shared by everybody, two calls
    per course. Measured on Manny's own three lines: **zero lookups** - Caledonia
    and Thistle are already bundled and Friday is undecided.
  - **"X or Y (not chosen)" is no course at all**, and both options are kept so the
    review shows what he actually wrote.
  - **27-hole combos map to the right nines.** "Thistle, McKay/Cameron" ->
    `mackay` / `cameron`, in that order. **Manny writes "McKay", the data says
    "MacKay"** - matched by dropping vowels, applied ONLY to the three nines on one
    course, never to course names, where it would collide freely.
  - **A two-digit date carries no year and one is never invented** - inferring it
    from today is how a December booking for January lands eleven months early. The
    year is a box on the review screen.
- **ADD / REMOVE GOLFERS ON A TRIP** (`trip-roster.js`), organizer-token only.
  **A change applies to rounds with NO SCORES; a round with one posted score keeps
  the roster it was played with** - handicaps are read off it, side matches name its
  player ids, the pool charges per golfer, skins and dots are per hole per player.
  The untouched rounds are **named** in the note, because "some rounds were skipped"
  is not something an organizer can check. Guarded as money: the same played round
  settled before and after, to the cent, engines frozen by sha.
  - Ids are computed **per round** (a trip's rounds are separate events, so one
    shared counter would collide), a name already present is not added twice, and
    removing the last golfer from a round is refused - delete the round instead.
  - `tripRoundHasScores` counts any value **> 0**, so a cleared `0` or `null` is not
    a score and an untouched round stays editable.
- **A CROSS-BRANCH NOTE: the tee time parses but cannot be stored yet.** The
  tee-time field is Wave 39, which is unmerged, so a pasted time is carried on the
  planner's round configs and ignored here. The moment that wave lands it is what
  the planner's own date and time boxes read - no further change needed.
- **AND `baseline_arithmetic_test.js` HAD A LATENT BUG ON MAIN:** it called
  `lineOf()` without importing it, in a branch that had never executed, so the
  first real fault it found would have thrown instead of reporting. Now imported
  (the helper exported it all along), and `filesWithBaselines()` skips `docs/` -
  which is never staged, so it holds scratch notes that are not part of the record.

## Where things stand, 2026-10-03

**THE GOLFCOURSEAPI PLAN WAS WRONG EVERYWHERE, AND IT IS CORRECTED.** The account
is the **FREE tier - "$0 per month / Up to 35 requests per day"**. From 2026-09-11
to 2026-10-03 this file, `functions/api/_lib.js` and a scaling audit all said Pro,
10,000 a day. The upgrade never happened, and the proxy's numbers had been retuned
on the strength of it: the daily ceiling went 30 -> 9,000, which on a 35-a-day key
is not a runaway detector but no ceiling at all - the provider's whole day is spent
257 times before ours notices.

- **The ceiling is 35, read from `GOLFCOURSE_DAILY_LIMIT`** in the Pages
  environment. Set it to **9000** (`PRO_DAILY_CEILING`) the day the plan changes:
  one dashboard field, no deploy. A malformed value falls back to 35 in both
  directions - NaN would make the ceiling infinite, and a `0` typed to mean "off"
  would refuse every search on a fresh morning while looking exactly like a
  genuinely spent quota.
- **A provider 429 now reports `daily_limit`,** the same reason as our own ceiling,
  because to a golfer on the first tee they mean the same thing. A 401 deliberately
  still reports `upstream_error`: that is a wrong key, and "try again tomorrow"
  would hide a misconfigured deploy for ever.
- **Running out says what to do.** "Course search is resting for today - pick a
  saved course instead. It works again tomorrow." `admin.html` adds "You can still
  type the card in below." because it has a grid; `tournament.html` has none and
  does not promise one. **The brief asked for "add it with the scanner" and there
  is no scanner** - the scorecard-photo OCR was deleted from Consumer 1.0, partly so
  `privacy.html`'s "no photos or camera access" stayed true - so the sentence names
  the path that exists. `course_quota_free_tier_test.js` (19 tests) holds all of it.
- **What 35 a day actually buys:** two requests per course, so ~17 NEW courses a
  day across every golfer using the site. Not 17 rounds - a course already in
  `global_courses` or warm in KV costs nothing. Pro is $9.99/month and is the
  cheapest fix on the whole scaling list.
- **RECORDED, NOT BUILT: a 429 does not latch the day.** Once the provider starts
  refusing, every subsequent search still spends one upstream call and three KV
  writes to be refused again. A latch - write the daily counter up to the ceiling
  on the first 429 - is three lines and was deliberately not added without asking,
  because it changes behaviour nobody asked to change. Worth doing if a real 429
  ever shows up in a log.
- **Still open: the whole `global_courses` node is downloaded on every setup-page
  load** - `admin.html:3259` `.on('value')`, `tournament.html:836`, `trip.html:575`
  and `:875`. Measured 2026-10-03: 42 courses, 61,258 bytes, avg 1,440 B/course,
  API imports 7.1-8.6 KB each. `?shallow=true` is 941 bytes, 65x smaller. **The
  Firebase JS SDK has no shallow read** - it is a REST-only parameter - so a
  lightweight index is either a new database node (a `database.rules.json` delta,
  STRICT, needs approval) or a REST shallow probe plus a cached name index. That is
  Wave 38 and it is not started.

## Where things stand, 2026-10-02

**WAVES 35 AND 37 ARE ON MAIN, AND 1.0.6 BUILD 1 IS PREPPED.** `0b915e8` then
`8a83de3`, cache `golfapp-v276-coachgate-strokesmode` / consumer `v116`. Superseded by `golfapp-v277-freetierquota` / consumer `v117` (the free-tier quota sentence, 2026-10-03).

- **Wave 35 - the Setup Coach cannot hand over a hollow round.** "Help me set this
  up" used to reach Review & Save with Course "Not selected" and Players "0 added".
  The handoff now goes to the first MISSING thing on that field's own editor; Review
  names what is missing with a button per item; `saveSettings` refuses with the same
  sentence if the button is reached another way; and Skip is off the two required
  answers. ALL OF IT SCOPED TO `?coach=1`, because `saveSettings` deliberately allows
  a round with no players - a host sets up a whole trip in advance and fills rosters
  later - and the guard's control proves that still saves.
- **Wave 37 - a strokes round stops calling its numbers an Index.** The toggle and
  the strokes DEFAULT already existed (Wave 13, v212): `as-entered` carries
  `selected`, the save writes `hcp` = the typed number with no `handicapIndex` and no
  `courseHandicap`, and an absent `handicapBasis` still means GHIN so no legacy round
  moves. What was wrong was that three surfaces gave one box three names, including a
  hardcoded `placeholder="Index"` on the strokes default. One builder in
  handicap-labels.js names it now; the toggle reads "Strokes (use as typed)" / "GHIN
  Index (adjust by tee)"; moving it repaints the rows. **No money math changed and no
  protected file was touched** - `handicap_mode_money_test.js` pins handicap.js,
  money-engine.js and pool-engine.js by content sha, shows the mode moving real
  dollars ($16 between two golfers on one round), and freezes a legacy round's net
  standings and whole pool by sha256.
- **THE MERGE TOOK A NEW CACHE KEY, and that is the rule when two branches collide:**
  both were at a v275 of their own, so neither described a tree holding the coach
  gate, the finish popup and the strokes labels. Both waves' "Moved to vNN" notes are
  kept in full; the shell count is 62.
- **1.0.6 BUILD 1 is set on Debug AND Release** (`MARKETING_VERSION` 1.0.6,
  `CURRENT_PROJECT_VERSION` 1), and Sign in with Apple is confirmed in place for
  RELEASE: `CODE_SIGN_ENTITLEMENTS = App/App.entitlements` on that configuration,
  `com.apple.developer.applesignin = ["Default"]` in the file, Team A2Z95T64UU, and
  GoogleService-Info.plist still in the Resources build phase. **Nothing archived,
  nothing uploaded.**
- **WHAT ACTUALLY SHIPPED: 1.0.6 BUILD 3, uploaded and submitted for review on
  2026-10-02, with build 2 removed.** `CURRENT_PROJECT_VERSION` is 3 on Debug and
  Release. The build-1 prep above was superseded within the hour, and the reason is
  worth keeping: build 2 HAD been used, so build 1 could not be uploaded - it is
  lower. The rule for next time is the one that caught this: App Store Connect will
  not take a build number at or below one that version has already seen, so the next
  1.0.6 build is 4, and a fresh version starts at 1.
- **APP STORE CONNECT, as of 2026-10-02:** 1.0.5 is **Ready for Distribution**, and
  1.0.6 (3) is **Waiting for Review**. Read from the console by Manny - there is no
  App Store Connect key on this Mac, so nothing here checked it.
- Android is at 1.0.6 versionCode 2 and is unaffected by any of this.
- **1.0.6 BUILD 4 IS SET AND READY TO ARCHIVE (2026-10-04, `main`).**
  `MARKETING_VERSION` 1.0.6 was already on both configurations; `CURRENT_PROJECT_VERSION`
  moved 3 -> 4 on **Debug and Release**, which is the number the rule above demands -
  build 3 has been seen by App Store Connect, so 4 is the lowest it will take.
  **WHAT BUILD 4 CARRIES over build 3:** push notifications end to end (the launch-time
  registration, the AppDelegate forwarding, the FCM registration token, the answered CORS
  preflight, the foreground banner and the tap routing), side-bet challenges with their
  group scoping, following along as a player, the trip pots (points race + daily), the
  trip roster paste, the Players-step tidy, My Groups released to every signed-in
  organizer, and the tee-time field removed from the UI.
  **SIGNING, CONFIRMED BY FILE AND BY TEST:** Release is
  `CODE_SIGN_ENTITLEMENTS = App/AppRelease.entitlements`, which holds `aps-environment`
  **production** and `com.apple.developer.applesignin ["Default"]`; Debug is
  `App/App.entitlements` with **development**. `oauth_native_test.js` holds both files and
  both pbxproj configurations, so this is not a sentence to be trusted on its own.
  `npx cap sync ios` run after the bump; `native_bundle_freshness_test.js` green.
  **THE SPECTATOR-DELETE FIX IS IN IT (2026-10-04, later the same day).** When this
  was first written no such fix existed anywhere in the repo and that was said plainly;
  it was then built, merged to `main` and re-synced into this bundle BEFORE any archive,
  which is what Manny asked for. The build number did not move - 1.0.6 build 4 still -
  because nothing had been uploaded. Cache `golfapp-v292-deletegate` / consumer `v132`.
  See "THE DELETE CONTROL CAME OFF THIS PREDICATE" above for the fix itself.
  **ONE THING FOR MANNY, NOT FOR THIS FILE TO DECIDE:** 1.0.6 (3) was last read as
  *Waiting for Review*, so uploading 4 means choosing which build goes to review.
- **1.0.6 BUILD 5 IS SET AND READY TO ARCHIVE (2026-10-04, `main` `0ebbf85` merged).**
  `CURRENT_PROJECT_VERSION` 4 -> 5 on **Debug and Release**; `MARKETING_VERSION` stays
  1.0.6. Nothing was uploaded at build 4, so 5 is simply the next number the console
  will take. Cache `golfapp-v294-playorder` / consumer `v134`.
  **BUILD 5 = BUILD 4 + THE 10th-TEE START.** A round can go off the 10th tee, per
  round and per group for a two-tee start: the card still reads 1-18 and only the
  SEQUENCE moves - where the scorecard lands, what Next does on the 18th, which hole
  Finish Round waits on, what a match has left to play, which hole an auto-press
  starts on, and which hole a tied skin carries onto. The field is `startingHole`,
  never `startHole` - see "THE 10th TEE" below for why that distinction was the whole
  point of the recon.
  **SIGNING, UNCHANGED AND RE-CONFIRMED:** Release is
  `CODE_SIGN_ENTITLEMENTS = App/AppRelease.entitlements` with `aps-environment`
  **production** and `com.apple.developer.applesignin ["Default"]`; Debug is
  `App/App.entitlements` with **development**; Team A2Z95T64UU on both.
  `oauth_native_test.js` holds all of it. `build-shell` / `sync-mobile-web` /
  `npx cap sync ios` run after the bump, and the iOS bundle carries v294 and
  play-order.js. Full suite 10,232 tests / 10,230 pass / 0 fail / 2 todo; every money
  golden and all nine untouched protected files byte-identical to pre-merge main.
- **1.0.6 BUILD 6 WAS SET, THEN CANCELLED (2026-10-05, `main` `a488b2c`).**
  `CURRENT_PROJECT_VERSION` 5 -> 6 on Debug and Release. It was superseded the same
  day and **cancelled in App Store Connect** rather than reviewed; nothing about it
  shipped. Its contents are a subset of build 7's.
- **1.0.6 BUILD 8 IS LIVE ON THE STORE (approved and released 2026-10-07,
  ~6:16 PM PT, Ready for Distribution).** That closes the 1.0.6 train: the next
  upload cannot reuse it, which is why build 9 is now 1.0.7.

- **1.0.7 BUILD 9 IS SET AND READY TO ARCHIVE (2026-10-07, `main` `95fee23` or
  later).**
  `CURRENT_PROJECT_VERSION` 9 on Debug and Release, `MARKETING_VERSION` 1.0.6,
  Release signing with `App/AppRelease.entitlements` (aps-environment production
  + Sign in with Apple). `build-shell`, `sync-mobile-web` and `cap sync ios` all
  run; the bundle under `ios/App/App/public/` is byte-identical to the repo for
  index.html, admin.html, sw.js and offline-queue.js, and both pages in the
  bundle load the queue.

  ANSWERED 2026-10-07: 1.0.6 WAS approved and released (build 8), so the stamp
  moved. `MARKETING_VERSION` 1.0.7 and `CURRENT_PROJECT_VERSION` 9 on BOTH Debug
  and Release - verified two of each in the project file. The build number does
  not restart at 1 for a new marketing version and does not need to; 9 simply
  carries on. ANDROID IS UNTOUCHED and still ships 1.0.6 (`versionName` in
  android/app/build.gradle, pinned by android_release_test.js) - the two trains
  move separately.

  **1.0.7 BUILD 9 = 1.0.6 BUILD 8 (now live) + OFFLINE MODE.** Every score and KP answer is written to a
  durable queue on the phone (`offline-queue.js`) BEFORE it is sent, replayed in
  order when signal returns, and removed only when the server confirms it.
  Measured first: Firebase's own queue is an in-memory array, so before this a
  phone closed in a dead zone lost every unsent score, and a round would not even
  open with no signal. A round already opened on the phone now opens and is
  scoreable offline; Home offers it back by COURSE with the count of unsent
  edits; the leaderboard, bets, results and final card compute from local data
  under "May change when others sync."; the scorecard carries a badge saying
  what is waiting. Manual presses still need signal, by decision - the refusal
  says "Pressing needs signal - auto presses still work."
  PROVED ON THE PHONE (Manny, iPhone Safari, airplane mode, v311): scores
  queued, survived a tab close AND a phone restart, synced on reconnect with
  everything there. Caches `golfapp-v312-resumename` / `consumer-v148-resumename`.
  NOTE FOR THE NATIVE BUILD: the service worker is not involved in the app at all
  (`registerServiceWorker` returns `skipped-native` before `canRegister`), so the
  Safari redirect fix is web-only; the queue is localStorage and works the same
  in both.

- **1.0.6 BUILD 7 IS UPLOADED AND SUBMITTED (2026-10-05, ~11:03 AM PT).** Manual
  Release is HELD - it does not go to the store on approval; Manny presses it.
  `CURRENT_PROJECT_VERSION` 7 on Debug and Release, `MARKETING_VERSION` 1.0.6.
  The build number was stamped at `b2f89a2` and the archive was taken from `main` at
  **`24bff98`**, so the bundle carries the Games-first wave that landed after the
  stamp. VERIFIED IN THE TREE RATHER THAN ASSUMED: `ios/App/App/public/admin.html` is
  byte-identical to the repo's (`7b72eec6`) and carries `format-settings-head`, and
  the bundled `index.html` contains no `focusFirstEmptyScoreBox`.
  **BUILD 7 = BUILD 6 PLUS TWO WAVES:**
  the keypad no longer opens on a landing - no score box is focused after Next, Prev,
  the 1-18 jump or a KP answer, so it stops covering the leaderboard and live matches
  under Prev/Next, and it opens when a golfer taps a box (cache `v298`);
  and the setup order is **Game Day -> Games -> Course -> Players -> Money -> Review**,
  with a tap on a format card going straight to Course, Back on Course returning to
  the gallery with the card still selected, and that format's own settings at the top
  of Money under a heading naming it (cache `v299` / consumer `v139`).
  **AND BUILD 6 = BUILD 5 PLUS:** the new scorecard (the Round Menu pill, the hole on
  the first screen, the compact live panel, the leaderboard as a pop-up), setup in
  five screens with Same as last week, the copy trim, the delete fixes, and the owner
  delete - whose RULE published the same morning (`database.rules.ownerdelete.json`,
  live sha `db6cecca`).
  **SIGNING, UNCHANGED:** Release `App/AppRelease.entitlements` (`aps-environment`
  **production**, `com.apple.developer.applesignin ["Default"]`), Debug
  `App/App.entitlements`. Full suite at the archive point 10,336 / 10,334 pass /
  0 fail / 2 todo.

**A CLOUDFLARE DEPLOY CAN FAIL ON THE FUNCTION AND LEAVE PRODUCTION BEHIND. RETRY IT.**
First seen 2026-10-02 on the Wave 36 merge (`1b355dd`):

- **What happened.** The push landed, the assets uploaded, and then the deployment
  failed with **"Failed to publish your Function. Unknown internal error"** at 2:00 PM
  PT. Production kept serving the PREVIOUS shell - `golfapp-v271-signedinclosed` -
  for about forty minutes. Manny retried the deployment from the Pages dashboard at
  2:38 PM PT and it succeeded: deployment `0c4d176e-0f1e-43a0-a556-ef56fab3496a`.
- **THE FUNCTION IS THE COURSE PROXY**, `functions/api/` - the "Search online" row's
  `/api/course-search` and `/api/course/<id>`. So an asset-only wave still depends on
  that publish step succeeding, and a failure there takes the whole deployment with
  it: no new HTML, no new `sw.js`, nothing. The proxy answers again since the retry
  (`/api/course-search?q=pebble` -> 200 with real courses).
- **HOW TO TELL IT APART from a slow build, measured that day rather than guessed:**
  the BRANCH PREVIEW for the same commit was serving the new shell happily, which
  rules out Pages being broken; production's `index.html` had none of the new markup;
  and production's `/card-is-in.js` returned **200 with the HTML fallback** rather
  than the file - a 200 that is `index.html` is not evidence the file is there, and
  checking the first bytes is what tells the difference.
- **WHAT TO DO.** If production lags a merge by more than a few minutes: Cloudflare
  Pages -> golf-app-5a5 -> **Deployments**, newest first. A Failed production
  deployment retries from that page and nothing in the repo needs changing. Do not
  start debugging the wave; verify the branch preview first.

**WAVE 36 IS ON MAIN: FINISH ROUND IS ONE POPUP.** Merged at `10ee062`
(`golfapp-v274-finishpopup`, consumer `v114`), fast-forward. Manny tested it on his
iPhone through Xcode: GFLBAM group 3 -> Finish Round -> the popup with that group's
scores -> See Results -> the Results tab. Approved.

- **What a group gets.** Tapping Finish Round - or the MOMENT this group's last score
  posts - opens a popup holding only that group's card: name, gross, net, +/-, built
  by `computeNetToParStandings` in money-engine.js, the same builder the live board
  uses. Under it, when groups are still out, one line: "Waiting on Group 4 (thru 16),
  Group 6 (thru 14)." Then one button, **See Results**, to `settlement.html` for this
  round and group, and a small **Fix a score** link that closes it. Nothing is locked.
- **It opens on the TRANSITION, not the state** - a card that was not in becoming in,
  once, with a close remembered. The first version latched on the state and two
  things broke at once: a golfer returning to a finished round got a popup over the
  page they asked for, and the 1-18 picker could not be tapped underneath it.
- **It carries the same preamble `openFinishRoundModal` has:** `commitPendingScore()`
  so a score typed and not blurred is saved BEFORE the popup reads the round, and
  `kpGateBefore()` because on hole 18 that button replaces Next and is the only way
  off an unanswered KP hole. It did NOT at first; `finish_round_tap_test.js` caught it.
- **THE ORGANIZER'S TOOLS DID NOT MOVE, the door did.** All four are still in
  `#finish-round-modal-overlay`, reached by an "Organizer tools" link the popup shows
  only when `canReachSetup()` is true - a group scorekeeper never sees it:
  verification `frShowResults(true)` in `#fr-state-review`, the KP no-winner and KP
  cancel answers in `#fr-kp-block`, the per-golfer correction diff via `frOpenPlayer`
  into `#fr-detail-impact`, and the whole-field review in `#fr-player-list`.
- **Above the hole view there is ONE LINE** with a small button - the first version's
  full card was what Manny rejected. It is kept rather than dropped because the popup
  only appears on the tap or on that transition, and a SPECTATOR never gets the popup
  at all: that line is the only thing that ever tells a watcher who is still out. A
  spectator is never told a card is theirs.
- **The Results page carries the same state as one line** from the same builder -
  "Not final yet" with who is out, or "Final" - and passes `hasGroupLock: false` on
  purpose, so a `?group=` on the Receipt's URL can never turn it into a claim about
  one foursome.
- **Production confirmed 2026-10-02 after the retry above:**
  `golf-app-5a5.pages.dev/sw.js` serves `golfapp-v274-finishpopup`, `card-is-in.js`
  is real JavaScript (12,418 bytes, not the HTML fallback), and the served
  `index.html` sha matches the repo byte for byte with the popup markup in it.
- `card_is_in_test.js` owns it: 40 tests, of which 1 was green at `c086dca` before
  the wave (the organizer-tools test, which reads the untouched recap). The figure is
  in the guard's own header in the checked form; written shorthand here so this file
  does not read as a second baseline.
  Five suites were re-pointed because the Finish button's destination changed and not
  one because a claim did: `finish_round_tap_test.js`, `back_button_test.js`,
  `kp_forced_decision_test.js` (the gate census is 7 callers now, the sixth caller
  being the popup), `kp_never_refunds_test.js` and `hole_view_landing_test.js`.

**`ui-wave35-coach-gate` IS STILL UNMERGED**, waiting on Manny's test: the Setup Coach
cannot hand over a round with no course and nobody on it. Its own HANDOFF entry rides
with it.

**1.0.5 BUILD 1 IS UPLOADED AND RELEASED.** Manny archived from `main` at `416e7ae`
and uploaded on 2026-10-01, and reports the version released. `MARKETING_VERSION`
1.0.5 / `CURRENT_PROJECT_VERSION` 1 on both configurations. What is in it: Wave 33's
one-tap sign-in with Apple and Google, and Wave 34 - sign out, delete account, the
owner-only full delete under the published rules, the My Groups trash icon, and the
incident fixes. The web bundle inside the binary is `golfapp-v271-signedinclosed`,
regenerated from that tree before the archive.

- **App Review 5.1.1(v) is answered by this build:** sign out and delete account are
  both in the Account panel, signed-in only. If a reviewer asks where: Home ->
  Account -> "This account".
- **Status is as Manny reports it.** There is no App Store Connect API key on this
  Mac - `altool` refuses without one - so nothing here read the release state back.
  The archive and upload were his; this record is his report of them.
- **The next build starts at 1.0.6 build 1**, or 1.0.5 build 2 if 1.0.5 is still open
  when it is wanted.

**INCIDENT, 2026-09-30: MANNY'S REAL ORGANIZER WAS DELETED DURING THE WAVE 34 TEST.**

- **Gone:** the Auth user and `organizers/<uid>` for
  `k8fYkL1hsPb6ZDL3wgQi8hywPi42`, founder pass included. **Rounds were untouched**,
  which is what the delete was designed to do - `events/*` is never written.
- **The new real account is `h8AxnefqnuZNKv6XwvFFIKRMHSS2`** (Apple), and the founder
  pass has been RESTORED there from the console, `grantedBy: "manny-console"`. Manny
  confirmed the founder line shows. The old uid is dead, and uids are never reused.
- **THE PATH, AND NOT ONE STEP WAS A WRONG TAP.** He was signed in as the real
  account and tapped Continue with Google with what he believed was a throwaway.
  `planOauth` sees a NON-anonymous user, so it takes the sign-in branch - and
  Firebase, with one-account-per-email, **auto-links a verified Google credential to
  whichever account already holds that email**. So he was signed into the SAME uid,
  and the note said, correctly, "This is the same organizer account". Delete account
  then deleted exactly that account. **The screen offered that button while signed
  in**, under a lead that said tapping it again only moves the organizer to another
  device.
- **WHY THE FOUNDER-PASS WARNING DID NOT SHOUT** - the part that is a defect in this
  repo rather than in his tapping. The loud sentence needs a pass in `standing`, and
  `standing` came from `organizer-gate.js readStanding`: ONE read, at page load,
  through `window.authReady`, which is a **one-shot promise carrying the uid the page
  BOOTED with**. He had signed out first, so the boot uid was anonymous, its record
  was null, and the warning fell back to the hedged "If this account has a founder
  pass..." - which reads like reassurance.
- **FIXED ON `ui-wave34-account-exit`, unmerged, three changes and nine tests that
  all fail against `bb3cd18` (the code that deleted it):** (1) signed in, Continue
  with Apple and Continue with Google come OFF the screen and the panel says "Signed
  in as EMAIL (PROVIDERS)"; moving a device is the email link, which says so.
  (2) Both delete warnings NAME the account. (3) The pass is read at the moment of
  the delete, off `auth.currentUser`, and a founder pass has to be TYPED away - the
  word is DELETE - while an unreadable record gets its own sentence instead of the
  reassuring one.
- **STILL OPEN, and worth knowing before the next test:** the EMAIL LINK on a
  signed-in account is the same class of hazard and was left alone this round - its
  own lead says it is for moving an organizer to another device. And nothing in the
  app can restore a founder pass: that was a console write, and it is the only way.

**ONE-TAP SIGN-IN IS LIVE ON MAIN, AND IT WORKED ON A REAL iPHONE.** Wave 33,
merged at `e50c91f` (`golfapp-v266-signincode`, consumer `v107`). Apple and Google
are the front door in the Account panel; the email link is behind "Use email
instead", unchanged.

- **THE DEVICE RESULT, 2026-09-30, Xcode Cmd+R on Manny's iPhone.** Continue with
  Apple LINKED to the real account `k8fYkL1h...`: the screen said "same organizer
  account" and **the founder pass was kept**, which is the whole point of
  `skipNativeAuth` - the native SDK never takes the session, so the anonymous
  organizer is still there to link. My Groups (beta) was switched on from the
  Account panel and "Thursday game" saved and listed.
- **A THROWAWAY AUTH USER WAS DELETED BY MANNY:**
  `9nLXZOEp2JVJL1R6xp4MpfZj46p2`. It carried Apple AND Google and no `organizers`
  data - it was the uid the web preview created earlier that day, which is why the
  first native Apple tap hit the adopt branch. Deleting it is why the second tap
  could link cleanly instead. If a future Apple or Google tap ever reports "Signed
  in as that account" unexpectedly, this is the shape of the cause: the identity is
  already on another uid.
- **PRODUCTION, MEASURED AFTER THE MERGE.** `golf-app-5a5.pages.dev/sw.js` serves
  `golfapp-v266-signincode`; the served `index.html` sha matches the repo;
  `admin.html` serves both buttons and `oauth-signin.js` returns 200. Both providers
  are ON, read back rather than assumed - `accounts:createAuthUri` returns a real
  `authUri` at `accounts.google.com` and `appleid.apple.com` where it returned
  OPERATION_NOT_ALLOWED on 2026-09-29. Authorized domains now read: `localhost`,
  `golfapp-9fb21.firebaseapp.com`, `golfapp-9fb21.web.app`, `golf-app-5a5.pages.dev`,
  `tournaments.rattlegolf.com`, `rattlegolf.com`, `hardpangolf.com`,
  `ui-wave33-oauth-signin.golf-app-5a5.pages.dev`. **What that does NOT prove is a
  completed tap in a production browser** - nothing here drove one; Manny signed in
  with both on the preview host, and the native tap is the device result above.
- **THE NATIVE WIRING, so the next person does not rediscover it.**
  `@capacitor-firebase/authentication@8.5.2`, iOS-allowlisted in
  `capacitor.config.ts`, SPM with the **Google trait only** so the Facebook SDK is
  not linked (measured on the built dylib: `GIDSignIn` 34 against `FBSDK` 0, with
  Filesystem 24 / Share 6 as positive controls). Android gained its own allowlist
  naming the three it already had, because the Capacitor default would have linked
  this plugin into a gradle build with no `google-services.json`.
  `GoogleService-Info.plist` is **committed on purpose** - `ios/.gitignore` carries
  the reasoning - and `tools/ios-google-urlscheme.js` copies its REVERSED_CLIENT_ID
  into `Info.plist`. `oauth_native_test.js` (35 tests) holds all of it.
- **TWO DEVICE-ONLY FAILURES WERE HIT AND FIXED ON THE WAY, both worth knowing.**
  (1) The first Cmd+R failed to BUILD: the Mac had no development profile carrying
  the Sign in with Apple entitlement, so signing failed on a device while the
  simulator build passed. `xcodebuild -allowProvisioningUpdates` issued
  `7125b0ed-…` (created 2026-09-30, applesignin present) and it built.
  (2) The first native Apple tap failed with the generic sentence and no code.
  `messageFor` now ends an unrecognised error with its own code, the adopt path uses
  the credential Firebase attaches to the error rather than re-presenting the one a
  failed link consumed, and every failure is `console.error`'d once - code and
  message, never a token - which Capacitor forwards to the Xcode log.

**THE LIVE RULESET IS `database.rules.stage2delete.json`.** Published 2026-09-30
~4:40 AM Phoenix by console paste of the Desktop copy
(`PUBLISH-THIS-database.rules.stage2delete.json`), with no edits. **The rollback is
`database.rules.stage1.json`** - one paste, and `database.rules.rollback-stage1.json`
in the repo is a byte-identical copy of it for exactly that. `dab91d8` is the
two-step rollback behind that.

- **What it added is ONE key**, and nothing else changed (diffed structurally, not
  eyeballed): `organizers/$uid` gains
  `".write": "newData.val() === null && auth != null && auth.uid === $uid"`. It
  permits a write that EMPTIES the record and nothing else - so Delete account can
  now remove `organizers/<uid>` whole, taking `firstSeenAt` and any `pass` with it,
  while `pass` stays unwritable because setting one leaves a non-null record. A
  `.write` at a node governs everything under it, which is exactly why the
  `newData.val() === null` half is load-bearing.
- **Post-publish checks, on Manny's phone:** a score save PASSED, and My Groups still
  listed "Thursday game". PASSED.
- **Confirmed from the app side, 2026-09-30, against the real database over REST:**
  an unauthenticated `DELETE organizers/<uid>` returns **401**, an unauthenticated
  `PUT organizers/<uid>/pass` returns **401**, and an unauthenticated read of a
  record returns **401** - with a positive control that the endpoint and key work
  (`GET events/GFLBAM/eventName` -> 200 `"Single Round"`). The deny side of the new
  rule is live. The ALLOW side needs a signed-in owner, which is Manny's throwaway
  test; no real record was deleted to check it.
- **`database.rules.json` in the repo is STILL not what is running** - it carries the
  Stage 2 owner-only round parent and has never been published. Read this section
  before assuming anything about which file is live.
- `rules_stage2_delete_test.js` (12 tests, three negative controls) owns the live
  file; `rules_stage1_test.js` now describes the rollback and is re-run in full
  against the live file to prove the publish took nothing away.

**MY GROUPS IS SHIPPED AND DARK.** On main since `4aba38a`
(`golfapp-v261-mygroups`), and invisible: the button ships `display:none` and appears
only on a device switched on from the secret master panel - the golf-ball logo, five
taps - which writes a per-device `localStorage` flag. It ships rather than waiting on
a preview because a branch host is not an authorized sign-in domain, so a preview
CANNOT sign in, and My Groups needs a real account. `my_groups_hidden_test.js` holds
the dark state; `my_groups_test.js` holds the feature.

- **Hiding is not security, and the two must not be confused.** The panel refuses
  without a linked account, and `organizers/$uid/groups` is owner-or-co-organizer in
  the live ruleset. The flag is release management; the rules are the enforcement.

### THE QUEUE, most load-bearing first

| what | state |
|---|---|
| **Stage 2 rules** - the owner-only round parent, with the `ownerLock` grandfather | approved IN PRINCIPLE, **not built**: no rule, no app change, no flag on any round. NOTE the name collision: `database.rules.stage2delete.json`, published 2026-09-30, is the DELETE rule and has nothing to do with this row |
| **Wave 34** - sign out and delete account (App Review 5.1.1(v)) | built on `ui-wave34-account-exit`, unmerged, waiting on Manny's THROWAWAY-account test. The rules half is already live |
| **the `ownerUid` audit** - Step 0, and it gates Stage 2 | blocked: listing `events/` needs a read of the parent node, which no ruleset grants. See the item below |
| **authorized sign-in domains** - a preview cannot email a link | one console entry per branch host; Firebase takes no wildcards. A fixed custom subdomain CNAME'd to the Pages project, authorized once, is the durable answer and needs DNS |
| **My Groups for real users** - take the flag off | Manny switched it on in the Xcode build on 2026-09-30 and saved "Thursday game", so the feature is proven on a device; taking the flag off is still a decision, not a leftover |
| **the next App Store build** - it needs Sign in with Apple on the STORE profile | the distribution profile from 2026-09-03 has ZERO `applesignin` entries. Automatic signing regenerates it on the archive, but that is the thing to watch. Nothing archived or uploaded |
| **`ui-wave33-oauth-signin` in authorized domains** | the branch is merged, so that entry can come out of the Firebase console whenever - harmless, one row of clutter |
| **`kpGroupAnswers` in a future publish** | already live via the open parent; becomes essential only if the parent tightens |
| **PR #19** - a pot-only trip no longer invents who owes who | open, unmerged, untouched all session |
| **branch `ui-kpprobe-scroll`** - the KP scroll probe | unmerged on purpose; the diagnostic for the item below |
| **Chrome-on-iPhone "Change KP" jump** | logged below, not being chased |
| **`pwa-boot.js:335`** files `priority: 0` at NINE | logged, not fixed |
| **`game.html`'s gate is not `canReachSetup`** and shows nothing on any group link, owner included | logged, not fixed |
| **Full Card has no KP entry** | logged, not fixed |
| **`stats.html` defines its own `nassauStakeConfig`** (`:800`), a byte-copy of money-engine's | found in the Wave 29 recon; a duplicated builder, not a divergence - yet |

- **1.0.7 BUILD 10 IS SET AND READY TO ARCHIVE (2026-10-07, `main`).**
  `CURRENT_PROJECT_VERSION` 10 on Debug and Release, `MARKETING_VERSION` stays
  1.0.7, Release still signs with `App/AppRelease.entitlements`. Build 10 =
  build 9 plus the four defects Manny found setting up screenshots on an
  iPhone 17 Pro Max simulator. Cache `golfapp-v314-fourbugs` /
  `consumer-v149-fourbugs`.

  1. **A BUILT-IN MYRTLE COURSE SAVED A ROUND WITH NO HOLES.** Picking
     Caledonia, True Blue or Pine Lakes in Game Day setup produced "No course
     data for this round yet." `course-index.js` merges a NAME-ONLY stub into
     `globalCourses` for every course the picker lists, and `admin.html` took
     that stub over the built-in's 18 pars - and `courseCardInHand()` returned
     true for it, so the card never loaded. Both halves fixed: in-hand means
     HOLES in hand, and a built-in beats a name-only stub.
     `myrtle_course_card_test.js` (6 tests; 2 pass / 4 fail against build 8).
     THE LIVE MYRTLE TRIP WAS AUDITED and every round already had its full 18
     pars and handicap indexes - nothing was written.

  2. **THE TRIP LEDGER CHARGED AN UNPLAYED ROUND.** An unscored Day 3 took $5
     off every golfer and the pot settled before the trip was over. `trip.html`
     now skips a round `computeRoundSettlement` says nobody started and names
     it under "Not Settled Yet". NO ENGINE FILE WAS TOUCHED FOR THIS.
     `trip_unplayed_round_money_test.js` (14 tests; 13 pass / 1 fail against
     build 8's trip.html).

  3. **A FINISHED ROUND READ "ALL SQUARE - THRU 18" ON THE MATCHES TAB** for
     every match, including one Manny won 7&6. `bet-strip.js` (PROTECTED, see
     below) took the headline from the live chip, and `closed` is false for a
     level match at the 18th. It now reads the receipt settlement-engine
     already priced, gated on the card's own `sideMatchRangeComplete`.
     `matches_tab_finished_test.js` (6 tests; 3 pass / 3 fail against main).
     THE MONEY WAS NEVER WRONG - $120/$60/$60 were right on main; only the
     words and the tone lied, which reads as a bug in the money.

  4. **THE LIVE MATCHES BOX WAS WIDER THAN THE PHONE.** 462px in a 342px
     column, so the page scrolled sideways at 390px (scrollWidth 486) and all
     26 amounts on the card were off screen. A grid item is `min-width: auto`,
     which means min-content; the card simply was never allowed to shrink.
     `min-width: 0` plus the result text wrapping instead of being ellipsised,
     in index.html AND leaderboard.html. `tools/match-card-overflow-check.js`
     (Chrome at 390px: 28 faults against main, 0 after) and
     `match_card_width_test.js` (4 tests; 1 pass / 3 fail against main).

  **bet-strip.js IS PROTECTED AND WAS CHANGED,** approved per-file in this
  brief: `6a876155251e71a2` -> `3b2dd5fb785e16f3`. One site in
  `buildSideActionRows`. No arithmetic entered the file - the only numeric
  expression added is `Math.abs()` on a net the receipt had already computed,
  used to build a label. Re-pinned with the reason in
  `bets_matches_split_test.js`, `card_scope_closed_test.js`,
  `format_first_wizard_test.js` and `per_golfer_tees_test.js`; the other nine
  money files are byte-identical to build 8.

  **ALL THREE OF 1-3 WERE IN THE LIVE 1.0.6 APP AND ON THE LIVE WEB.** Measured
  by swapping build 8's own files in (`21f9c7f`) and running the guards: bug 1
  4 fail, bug 2 2 fail, bug 3 3 fail. trip.html and bet-strip.js are
  byte-identical between build 8 and main, so the web carried them too. Bug 4
  is the same CSS on main, so the web has it as well.

  **THAT DEFERRED ITEM IS NOW FIXED (2026-10-07, Manny said do it).** An
  unplayed round's own Results page shows $0 for everyone. Measured on the real
  Day 3 (3MKUCF, Pine Lakes, 0 scores, read from the live database and saved as
  `unstarted_round.fixture.json`): $20 a golfer in, "$60 / 4" refunded = $15
  back, and the $20 KP bucket held as "$5 in the pot" on four blank holes - so
  the page said every golfer was $5 down on a round nobody played.
  `settlement.html`'s pool section is now gated on settlement-engine's own
  `started`, read through the page's existing `receiptSettlement()`, and renders
  "Not played yet - it owes nobody anything." with $0 a golfer - the trip
  ledger's rule and its exact sentence, pinned together so they cannot drift
  apart.

  NO ENGINE FILE MOVED, and that is asserted rather than claimed: ten money
  files byte-identical by sha, and a test that deliberately pins the engine
  STILL answering -$5 for an unstarted round. pool-engine.js keeps Manny's
  2026-09-22 rule that KP money never goes back to the field; the page simply
  stops asking it before the round starts. Guards:
  `unstarted_round_results_test.js` (7 tests; 5 pass / 2 fail against the
  pre-fix page - one of the five is an inert don't-regress pin, said so in the
  header) and `tools/unstarted-results-check.js` (Chrome at 390px: 5 faults
  before, 0 after, with a positive control that a fully played round still
  renders the whole pool card). Cache `golfapp-v315-unplayedzero` /
  `consumer-v150-unplayedzero`. 1.0.7 build 10 is unchanged - still READY TO
  ARCHIVE, now with this fix in the bundle.

- **QR CODES ARE LIVE (Wave 1, 2026-10-07, `main`).** An organizer holds the
  phone up on the first tee and each scorekeeper scans their own group.

  WHERE: "Show QR code" in the Round Menu on the scorecard (every golfer, not
  just the organizer), on the Scorekeeper Links panel, and on Round Ready's
  share screen in admin.html. Full-screen sheet, one code per group, swipe or
  tap the arrows between them, plus a Watch code at the end.

  WHAT EACH CODE IS: `index.html?game=CODE&group=N` per group - the SAME string
  that group's Copy button hands out - and `leaderboard.html?game=CODE` for
  Watch. **The organizer link is never a QR**, and that is a property of the
  interface rather than a promise: `qr-codes.js` is handed the code, the roster
  and a base URL, never the round record that holds `organizerToken`.

  OFFLINE: `qr-encode.js` is qrcode-generator 2.0.4 (Kazuhiko Arase, MIT),
  vendored unmodified with its provenance in the header, audited for network
  and eval calls (none), and precached with `qr-codes.js` - so the code is
  drawn on the phone in a dead zone. 58 KB, 2,297 lines.

  GUARDS. `qr_targets_test.js` (12 tests; 0 pass / 12 fail against main, which
  proves nothing per assertion because the file was absent, then 11 / 1 with
  the builder present and the pages unwired). And
  `tools/qr-decode-check.js`, which is the one that matters: it opens the
  scorecard, swipes the Round Menu open with a real touch gesture, taps the
  button, photographs each code and decodes it with **Apple's Vision
  framework** - an independent decoder, not our own encoder read back. 9 faults
  against the pre-wave pages, 0 after. It also opens the DECODED URLs and
  counts inputs, so "read-only" is measured: Watch shows 0 score inputs,
  Group 2 shows 76 of 76 editable and exactly its own four golfers.

  **WHAT MANNY MUST SET UP for "opens the app if installed".** Today a scan
  opens the WEB link. There are no Universal Links or App Links in this repo at
  all - measured: no `associated-domains` entitlement, no
  `apple-app-site-association`, no `assetlinks.json`, no Android intent
  filters. Making a scan open the installed app needs, and none of it can be
  guessed: (1) Associated Domains enabled for the App ID in the Apple Developer
  portal and the entitlement added to both configurations - which changes
  signing, so it was NOT done unilaterally before an archive; (2)
  `/.well-known/apple-app-site-association` served from
  golf-app-5a5.pages.dev carrying `TEAMID.com.rattlegolf.app`; (3) the Android
  intent filter plus `/.well-known/assetlinks.json` carrying the SHA-256
  fingerprint of `~/rattle-keys/rattle-upload.jks`. Give me the Team ID and the
  keystore fingerprint and this is a small wave on its own.

  Cache `golfapp-v318-qrcodes` / `consumer-v153-qrcodes` - v317 is held by the
  gps-v1 branch. Shell count 74 -> 76. 1.0.7 build 10 unchanged.

  MY OWN FAULTS, LOGGED, all three the same shape - a comment tripping a guard
  that reads source: my sw.js note inside `SHELL_FILES` contained the word
  "app's", and `shell_declarations_test.js` reads filenames by extracting
  quoted strings, so the apostrophe opened a string that swallowed the next
  entry and reported a correct manifest as broken. The parser strips comments
  now (line comments first, then block - the order `bundle_manifest_test.js`
  learned the hard way). The vendoring header's "no fetch, no XMLHttpRequest"
  and qr-codes.js's note about never receiving `organizerToken` tripped their
  own guards the same way; those assertions read comment-stripped source now.

- **MYRTLE: FOURSOMES ON THE DAY, AND THE RECAP AS AN IMAGE (2026-10-08, `main`
  `12c13b0`).** Cache `golfapp-v320-recapimage` / `consumer-v155-recapimage`.
  1.0.7 build 10 unchanged. All ten money goldens byte-identical.

  **SET THE FOURSOMES FROM THE PHONE** (`golfapp-v319-foursomes`). The Players
  step could change group SIZES but not WHO was in which group - a golfer's
  foursome is their POSITION in the roster and the only control on a row was
  delete. Every row now has up/down arrows and a "Move to Group N" picker. The
  arithmetic is `rosterMove()` / `rosterMoveToGroup()` in grouping.js, pure, and
  IDS RIDE WITH THE GOLFERS (`captureCurrentPlayerInputs` reads rows in DOM
  order carrying each row's id). QR codes and group links follow because they
  read the same boundaries. `roster_order_test.js` 13 tests (1/12 red) and
  `tools/players-step-check.js`, which taps the arrows and reads back the order
  the SAVE would capture.

  **THE RECAP AS AN IMAGE** (`golfapp-v320-recapimage`). One tap draws the
  rendered recap card to a canvas and hands the PNG to the iOS share sheet -
  2160x2916, measured. It reads the CARD, not the engines, so it cannot tell a
  different story (native-export.js's rule). No library: Canvas 2D, long names
  measured and ellipsised, the amount never cut. `shareBytes()` is lifted out of
  native-export.js's PDF chain so there is ONE write-and-share path.
  `trip_recap_image_test.js` 9 tests (0/9 red) and
  `tools/trip-recap-image-check.js`, which taps the button and decodes the PNG.

  **THE PER-GOLFER TEE PICKER WAS NEVER MISSING - that was my error.** I
  reported it gone; it shipped 2026-10-05 (`2c251b3`) and is byte-for-byte
  present. What was missing was in MY harness: a stand-in database with
  `global_courses: {}` left `courseTeeChoices()` with no rated tees, so the
  round-level tee panel stayed hidden and `appendTeeControl()` had no options to
  copy. An empty fixture and a deleted feature look identical from outside.
  `tools/players-step-check.js` now loads a real course record and asserts the
  OPTION TEXTS on all 24 rows; deleting the one `appendTeeControl` call makes it
  fail with six faults.

  **AND THE ROUND-MENU SWIPE RED WAS A MODAL, FOR THREE WAVES.**
  `round_menu_swipe_test.js` reported "the swipe up did not open it" on main. Its
  fixture opened a BARE multi-group link, which raises "How are you joining this
  round?" - and that dialog correctly swallows gestures aimed at the page
  beneath it, so the test was dispatching touches into a dialog. Measured on a
  byte-identical index.html: bare link, sheet top 782 before AND after; with
  `&group=1`, 782 -> 208 and open. Two of its passing tests were vacuous while it
  lasted. The arrivals carry `&group=1` now and a new guard refuses to let the
  file mean anything while a modal is up.

  **MYRTLE TRIP VWNPW6 DATA, written with Manny's approval:** the phantom
  "Group" golfer (id 101, hcp 1) deleted from all 7 rounds -> 24 golfers and six
  clean foursomes; an organizer link added to each round; rated tee sets loaded
  for all 7 courses (53 sets - 6 courses from the provider Caledonia came from,
  and Man O' War's four from its published scorecard cross-checked against two
  sources, because the provider only carries the Maryland course of that name).
  Both Thistle rounds shared one course key and are different layouts, so each
  got its own record carrying ITS OWN existing card and was repointed - without
  it one Thistle round showed the other's tees.

- **1.0.7 BUILD 11 IS SET AND READY TO ARCHIVE (2026-10-08, `main` `b968691` or
  later).**
  `CURRENT_PROJECT_VERSION` 11 on Debug AND Release - verified two of each in the
  project file - and `MARKETING_VERSION` stays 1.0.7. Release signs with
  `App/AppRelease.entitlements` (aps-environment **production** + Sign in with
  Apple); Debug keeps **development**, which is the pair that matters because one
  file for both is how a TestFlight build registers on the wrong APNs gateway and
  silently never receives.

  **BUILD 11 = BUILD 10 PLUS:**
  - **Roster reorder** - up/down arrows and "Move to Group N" on every golfer on
    the Players step, so the foursomes can be set on the day from the phone. QR
    codes and group links follow. (`golfapp-v319-foursomes`)
  - **The trip recap as an image** - one tap draws the rendered recap card to a
    canvas and hands a 2160x2916 PNG to the iOS share sheet.
    (`golfapp-v320-recapimage`)
  - **The round-menu swipe test fixed** - a TEST fix, no app change: its fixture
    opened a bare multi-group link and was dispatching touches into the "How are
    you joining this round?" dialog.
  - **Man O' War tee data** - DATA ONLY, written to the live database, no code.

  `build-shell`, `sync-mobile-web` and `cap sync ios` all run; repo = www/app =
  `ios/App/App/public` verified by sha for sw.js, admin.html, index.html,
  trip.html, trip-recap-image.js, grouping.js, native-export.js, qr-codes.js and
  qr-encode.js, and native_bundle_freshness_test.js is green. Cache
  `golfapp-v320-recapimage` / `consumer-v155-recapimage`. ANDROID IS UNTOUCHED
  and still ships versionCode 2 - the two trains move separately.

- **1.0.7 BUILD 12 IS SET AND READY TO ARCHIVE (2026-10-08, `main`).**
  `CURRENT_PROJECT_VERSION` 12 on Debug AND Release, `MARKETING_VERSION` stays
  1.0.7, Release signs with `App/AppRelease.entitlements`. Cache
  `golfapp-v323-linkprovider` / `consumer-v158-linkprovider`. All ten money
  goldens byte-identical.

  **PORTRAIT ONLY, EVERYWHERE.** `UISupportedInterfaceOrientations` and
  `UISupportedInterfaceOrientations~ipad` are both a single portrait entry (the
  iPad list carried four, upside-down included), and Android's MainActivity is
  `screenOrientation="portrait"`. `portrait_only_test.js` holds both files and
  also refuses the word Landscape anywhere in Info.plist, because a new key
  with a landscape value would pass a list check and still rotate.

  **LINKING APPLE OR GOOGLE TO THE ACCOUNT YOU ARE ALREADY IN**, and this is the
  defect behind Manny's stray account. `planOauth` read `if (!user.isAnonymous)
  return 'sign-in'` with the reason "already-linked" - and that was an
  inference, not a fact: a golfer signed in with EMAIL has no Apple provider on
  him, so tapping Continue with Apple ran `signInWithCredential` and SWITCHED
  him to whatever account that Apple identity belonged to. Measured in the
  project's own auth: `h8Axnef...` carries exactly one provider (password) and a
  **founder pass**, owns **38 rounds**, and there are four apple.com accounts,
  three on privaterelay addresses. THE RULE IS ABOUT THE PROVIDER NOW: a user
  without it links, a user with it signs in. The Account sheet has deliberate
  **Link Apple / Link Google** buttons which pass `deliberateLink`, and on
  `credential-already-in-use` they REFUSE with their own message instead of
  adopting - adopting is the exact move that made the stray account.

  **THE STRAY RELAY ACCOUNT, `xujB3BjfOjdc61jJy5RVODZxv7c2`
  (`89gphwy4ch@privaterelay.appleid.com`, created and last used 2026-10-07) -
  PLANNED, NOT DELETED.** Audited read-only: `organizers/<uid>` is **null** (no
  trial, no pass), it owns **0 rounds** and **0 trips**, and carries **1 push
  token**. So there is nothing on it to lose, and it is the thing standing in
  the way: Manny's Apple identity is attached to it, so `linkWithCredential`
  from his email account will fail `credential-already-in-use` until it is
  removed. RECOMMENDATION: delete that one auth user (Firebase console ->
  Authentication -> that row -> Delete), then Link Apple succeeds. Manny's call;
  nothing was deleted.

  **SESSION PERSISTENCE** is the SDK default (`local`, IndexedDB with a
  localStorage fallback) - no `setPersistence` call anywhere - and auth-boot asks
  `onAuthStateChanged` FIRST, signing in anonymously only when no persisted user
  answers. That is the right shape, and whether a WKWebView on
  capacitor://localhost keeps it across a kill and a phone restart is MANNY'S
  TEST on the build: a harness cannot prove it.

  Also in build 12: the paste-wrapper fix (`de24141`) - Gmail's Copy Link
  redirect now yields the code, and a refusal scrolls into view instead of
  rendering 24px below the fold.

- **1.0.7 BUILD 13 IS SET AND READY TO ARCHIVE (2026-10-08, `main`). BUILD 12
  WAS REJECTED ON UPLOAD AND ITS NUMBER IS BURNED.**

  App Store Connect refused build 12 with **error 90474**: an iPad app that
  supports multitasking must declare all four orientations, because Slide Over
  and Split View can hand it any of them. My portrait-only change set
  `UISupportedInterfaceOrientations~ipad` to portrait **without opting out of
  multitasking**, so the upload was rejected - the archive exists, so 12 cannot
  be reused.

  THE FIX, and it keeps portrait-only everywhere:
  `<key>UIRequiresFullScreen</key><true/>` in `ios/App/App/Info.plist`. Both
  orientation lists stay a single portrait entry. `plutil -lint` passes on the
  hand-edited plist.

  `portrait_only_test.js` now asserts the KEY AND ITS VALUE alongside the lists
  (6 tests; the new one red first), because the two only make sense together: an
  edit that removed the opt-out while leaving the lists portrait-only would pass
  every other assertion in that file and fail at the only place that matters, an
  upload.

  `CURRENT_PROJECT_VERSION` 13 on Debug AND Release, `MARKETING_VERSION` stays
  1.0.7. THREE FILES CHANGED AND NOTHING ELSE: the plist, the project file and
  that test. sw.js, database.rules.json and every money engine are untouched -
  no cache bump, because no shell file moved - and the 1.0.7 review, Firebase
  and the engines were not touched.

## Known open items

- **OPEN 2026-09-30 — "CHANGE KP" JUMPS THE PAGE IN CHROME ON iPHONE, AND ONLY
  THERE.** Manny reported it on GFLBAM hole 4, group 3: tapping "Change KP" put
  LIVE LEADERBOARD, Skins Won and Live Matches & Presses at the top of the screen
  with Hole 4 below - and all three of those mounts sit BELOW the KP box inside
  `#hole-view-card` (`index.html:2991-2993`), so the page ended up FURTHER DOWN than
  the box. "Jumped up" is the content moving up the screen, not the scroll going to 0.
  - **MEASURED, AND IT IS NOT THE PRODUCT.** Six arms say the page does not move: a
    synthetic round; the real GFLBAM round with the second snapshot the write causes,
    delivered the way Firebase delivers it; three viewport-height arms emulating
    Chrome-on-iPhone toolbars (844/730/844); and **the installed iOS app on Manny's
    own phone, through a forced-on probe build** - it STAYS PUT there. The clamp
    theory is dead on arithmetic: the KP block grows 92 -> 268, so `maxScroll` RISES
    176px on that press and a toolbar is 60-90px.
  - **SO IT IS CHROME-ON-iPHONE ONLY**, which is WebKit under Chrome's own chrome,
    with toolbars that collapse and expand on scroll. `kp_change_stays_put_test.js`
    pins the property for every engine the suite can drive.
  - **NOT BEING CHASED (Manny's call, 2026-09-30).** The diagnostic lives on branch
    `ui-kpprobe-scroll` (`8322436`, UNMERGED): `?kpprobe=1` prints four numbered
    samples around the press - before, rendered, next frame, +800ms - with scrollY,
    innerHeight, visualViewport, document height, maxScroll and the box's top. To pick
    it up again: that branch, that link, on Chrome on an iPhone.
  - **AND THE HARNESS TRAP THAT COST AN HOUR, TWICE.** `cold-arrival.js:397` centres
    an element before every `{ tap }`. With a `{ tap }` this very press "moves" the
    page 119px - a perfect reproduction of the report, manufactured by the tool. Wave
    27 produced a phantom 39px shift the same way. Measure a scroll with a raw
    `Input.dispatchMouseEvent` or measure nothing.

- **OPEN 2026-09-28 — THE REAL LOCK WAVE: publishing the rules, and the audit that
  has to come first.** Every consumer gate today is UI only (see "What the next rules
  publish must carry" above). Making enforcement real is its own wave, and it has a
  **prerequisite that must be done before a single rule is published**:
  - **STEP 0 — THE ownerUid AUDIT. Read-only, and it gates the rest.** List the recent
    rounds under `events/` and report, per round: code, date, player count, `ownerUid`,
    and whether that uid is a browser Manny still has. Two uids are known to be his:
    the iPhone `k8fYkL1hsPb6ZDL3wgQi8hywPi42`, and `TFM8Iu07r5QtUzCvrMK6RleS7583`,
    which is **unidentified** — find out what it is before trusting it.
    **WHY IT COMES FIRST:** the parent `.write` keys setup to `auth.uid === ownerUid`.
    The uid is **per browser ORIGIN** (Safari, the home-screen app and the App Store
    app on one phone are three different organizers), so publishing locks every round
    whose `ownerUid` belongs to a browser nobody can reach any more — and the organizer
    is locked out of their own setup with no way back except the token. Publish first
    and find out afterwards and the fix is a data migration on live rounds.
  - **IT COULD NOT BE DONE ON 2026-09-28, and this is the blocker to solve.** Listing
    `events/` needs a read of the PARENT node, and neither the repo ruleset nor the
    live one grants it: `events/$eventCode` is `.read: true`, `events` has no `.read`
    at all. Confirmed rather than inferred — an unauthenticated
    `GET /events.json?shallow=true` returns `{"error":"Permission denied"}`, which is
    the rules working correctly. The authenticated route needs the Firebase CLI, and
    `firebase-tools@13` crashes on this machine's Node 24 (`Cannot find module
    './internal/streams/stream'`). **An older major is worth trying and was NOT
    verified here** — do not take `@12` on trust. So the audit wants either the CLI
    run by Manny (`database:get /events --shallow --project golfapp-9fb21`, on a
    version that starts), or the codes pasted from the Firebase console — after which
    each round reads individually under the existing `.read: true`.
  - **WHAT THE WAVE ITSELF THEN OWES.** A publish is not the whole job: the rules make
    SETUP owner-only and leave fifteen children writable by any code-holder (the list
    is above), so the wave has to say what it is and is not claiming, and no UI string
    may start saying protected, secure or locked. `kpGroupAnswers` must ride along or
    the forced KP decision breaks quietly — also above.
  - **Logged, not built.** No rules have been published.

- **OPEN 2026-09-28 — nothing in the suite catches an ORPHANED CSS RULE.**
  Wave 24 dropped the PROJECTED/FINAL word from the Net Finish head and left
  `.lnf-state` behind in `index.html` — a rule with no element in the page carrying
  that class. It was found by a verification step that happened to print the class
  count, **not by any test**, and it could not have been: no guard asserts the
  absence of an unused rule, and a rule with no element cannot fail one.
  - **Why it matters more than tidiness.** Dead CSS reads as a live surface. The next
    reader finds `.lnf-state` and a styled state word that no longer exists, and
    either "restores" something nobody asked for or spends the time proving it is
    dead. This repo has already paid for the mirror-image of that twice — copy that
    described behaviour it no longer had (the trip money card, the "read-only"
    spectator link), which is the subject of a whole CLAUDE.md section.
  - **The shape of the check, for whoever takes it.** Collect every class selector
    declared in a page's `<style>` blocks, collect every class the page can emit —
    static `class="..."` attributes AND the ones built inside template strings, which
    is the hard half — and report the declared-but-never-emitted set. The runtime half
    is what makes it real: a source scan alone cannot see a class a template builds,
    and `helpers/mini-dom.js` has no layout and parses no `innerHTML` children, so it
    cannot answer this either. It wants the same rendered/source PAIR that
    `tools/trip-awards-check.js` and `trip_awards_identity_test.js` form for escaped
    glyphs — neither half is optional.
  - **Expect a long allow-list, and budget for it.** State classes only added under a
    condition no fixture reaches, print-only rules, and classes shared with another
    page will all look orphaned. A check whose allow-list is longer than its findings
    is worse than none, so the first wave should MEASURE how many candidates the eight
    pages actually produce before deciding the check is worth having.
  - **Not built (Manny, 2026-09-28): logged, not fixed.**

- **OPEN 2026-09-28 — `registerBackProbe` files a priority-0 probe at NINE.**
  `pwa-boot.js:335` stores `priority: Number(probe.priority) || 9`. `Number(0)` is
  falsy, so a probe registered at priority 0 — the natural way to write "this one
  comes first" — is filed *last*, behind both generic probes (`modal` at 2,
  `popover` at 3). Hardware back then closes the very layer that probe existed to
  hold.
  - **Found the hard way in Wave 23.** The forced-KP modal registered at 0, and
    `kp_forced_decision_test.js`'s probe-order assertion caught it: Android back
    dismissed a modal whose whole purpose was to be undismissable. The modal now
    registers at **priority 1** and a comment at the registration says why.
  - **THE FIX IS `?? 9`, NOT `|| 9`** — `Number(probe.priority) ?? 9` keeps the
    default for `undefined` and stops coercing a legitimate 0. `Number()` of a
    non-numeric string gives `NaN`, which `??` does *not* catch, so the fix wants
    `Number.isFinite(n) ? n : 9` if that case matters; decide it in the wave.
  - **ITS OWN WAVE, with a test that a priority-0 probe runs first** (Manny,
    2026-09-28). `back_button_test.js` is where it goes: register two probes, one
    at 0 and one at 2, both reporting open, and assert `GolfBack.press()` returns
    the priority-0 one. That test fails today.
  - **Check the existing registrations before changing the default.** Nothing in
    the repo registers at 0 today (`index.html` uses 1 for both its probes,
    `pwa-boot.js` 2 and 3, `admin.html` and `sidematches.html` their own), so the
    fix cannot reorder anything that already works — but confirm that rather than
    trust this line.

- **OPEN 2026-09-28 — the Full Card view has no KP entry at all.**
  `#kp-entry-mount` is built inside `renderHoleView` (`index.html`, right after the
  nav row), which writes into `#hole-view-card`. In Full Card view that card is
  `display:none`, so a group working on the Full Card never sees the KP question,
  the current leader, or the picker.
  - **This was one of the three skip routes measured in the Wave 23 recon**, and it
    is the one that wave did NOT close. Wave 23 gated `setViewMode('full')` as an
    *exit* — a group cannot switch to the Full Card to escape an unanswered KP
    hole — which is not the same thing as giving the Full Card a KP entry. Manny's
    answer C said so explicitly: gate the exit, backlog the entry.
  - **What the fixing wave has to decide.** The Full Card shows all eighteen holes
    at once, so "the hole the group is standing on" has no meaning there; a KP
    entry on that screen needs a different anchor (per-row? a strip naming only the
    round's KP holes?). That is a design question, not a port.
  - **Do not simply move the mount.** The block reads `currentViewedHole` and the
    per-group write rule; both still apply, and `tools/kp-entry-position-check.js`
    measures where the block sits and what it pushed down — re-run it, and note
    that it only exercises Hole View today.

- **OPEN 2026-09-27 — `game.html`'s organizer gate still refuses every group link,
  the owner's own included.** Wave 22 moved the SCORECARD's rule: a group lock no
  longer closes the doors by itself, it only narrows what counts as evidence (see
  "Who is the organizer" above). `game.html` was not touched, because that wave was
  one change to one gate. Its gate is not `canReachSetup()` — it has its own
  predicate — so the two pages now disagree about the same device on the same link:
  `index.html?game=X&group=1` shows the organizer their doors, `game.html?game=X&group=1`
  shows them nothing.
  - **It is PINNED, not fixed.** `organizer_door_test.js` has the case "a group link:
    nothing, even for the owner (UNCHANGED by Wave 22 — the scorecard moved, this page
    did not)". A pin records a fact; it does not make the fact right, and **it should
    not stay pinned forever** (Manny, 2026-09-27).
  - **The wave that fixes it** should move `game.html` onto the same
    `organizerEvidence()` test and re-point that pinned case with the reason, the way
    Wave 22 re-pointed three suites. Check `game.html`'s own predicate first: if it is
    the older `isOrganizerView()`, the table above under "Left on the OLD predicate"
    is the other half of the same job.

- **OPEN 2026-09-27 — a transient `SIGSEGV` kills one file per full suite run, and it
  is UNEXPLAINED.** Not resolved, not diagnosed, recorded so that a recurrence is a
  pattern rather than a surprise.
  - **What was seen.** Four `npm test` runs on 2026-09-27: two clean green (9396
    tests, 9394 passed, 2 todo, ~157s), and two killed by a segfault in a **different
    file each time** — `players_sheet_test.js` after 325 ms, `board_header_trim_test.js`
    after 18462 ms. No assertion was involved. The runner counts a dead file as one
    test, so the runs reported 13 and 22 **dropped** results rather than failures.
  - **Both files are green standalone**, repeatedly: `players_sheet_test.js` 38/38 on
    five consecutive runs, `board_header_trim_test.js` 23/23. So it is runner-level,
    not a defect in either suite.
  - **The one correlation available.** 47 test files now drive headless Chrome (Wave 22
    added the 47th, `organizer_doors_after_picker_test.js`). Concurrent Chrome
    instances under the node test runner are the plausible pressure, and that is a
    hypothesis, not a finding — nothing has been measured to support it.
  - **Why the history is empty.** `test-runs/` keeps only `last.tap` and
    `last-green.json`, so there is no record of whether this predates Wave 22. It
    cannot be claimed either way. If it recurs, the cheap first step is keeping the
    TAP of a failing run before the next one overwrites it, and noting which file died.

- **OPEN 2026-09-23 — `calculateMatchEngine` exists in THREE copies, with drifting
  return shapes.** Found during the v215 recon, logged rather than fixed: it needs
  its own wave.
  - `money-engine.js:353` is the one every shared consumer calls.
  - `index.html:7625` and `stats.html:821` each define their own full copy at the
    top level of their inline script. An inline script parses after the external
    one, so **on those two pages the page's copy is the one that runs.**
  - Measured, normalised (comments and whitespace stripped): the three hash
    `e92b70df8753` / `5c9525dbe88b` / `cc31ec965a4b`. What differs is not the
    arithmetic — `escapeHtml(winnerName)` inside `finalResult` on the two pages,
    `pressesByHole` added to index.html's return, `t1Players`/`t2Players` dropped
    from stats.html's.
  - The blocks that matter for money ARE byte-identical in all three:
    `t1TotalMoney` accumulation `a00414309c7a`, the `holeWinner` assignment
    `31ee91750fd4`, the `holeLog` entry `2e937f5e21cb`. That is why v215's Aloha
    could safely read those two values from whichever copy runs.
  - **Why it is still a risk.** The return SHAPES have already drifted, silently,
    and nothing holds the three together. The next change to the engine has to be
    made three times or it is only made on some pages. A wave that deletes the two
    page copies needs to check what each page relies on in its own return first
    (`pressesByHole` has a consumer; the dropped fields may not).

- **CLOSED 2026-09-11 — a misspelled course is no longer cached as a genuine empty.**
The proxy cached successful searches for 7 days, and a zero-result search *is* a
success — the API answered, it just answered with nothing. So a golfer typing
"Quintaro" for "Quintero" spent a request to learn nothing, and then that empty
answer was served to everyone for a week, indistinguishable from "this course does
not exist".
  - **What closed it was believed to be a Pro upgrade. There was no upgrade**
    (corrected 2026-10-03), so the trade is still real: caching zeros is free
    protection against a repeated typo, and not caching them risks burning a
    35-request day on a common misspelling. **Zeros are still not cached anyway**,
    deliberately — the failure it prevents is telling a golfer a course does not
    exist when it does, which is the defect the whole proxy exists to prevent, and
    it already ended once with an offer to add a duplicate. A typo costing a
    second request is a worse day for the budget and a better day for the golfer.
    `functions/api/_lib.js` asserts it both ways — an empty result is fetched
    again, a non-empty one is still cached.
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
  - **Fuzzy course spelling — NOT solved upstream. Tested 2026-09-12, one live request:**
    `search_query` "chambrs bay" (one dropped letter from Chambers Bay) with
    `fuzzy_match` at its default returned **zero courses**. The API's fuzzy matching
    handles substrings of correctly-spelled text — "hurst" matches "Pinehurst" — but
    does not correct a misspelling. **Correction has to happen on our side, before the
    request**, as the Quintero item above assumed. Not established: whether
    `fuzzy_match=true` sent explicitly differs from the default, or whether a
    correctly-spelled fragment alone would match; neither changes the answer for a
    golfer who mistypes.
  - The loose legacy root keys in the live database — `activeCourseKey`,
    `active_event_mode`, `eventName`, `gameFormat`, `courseData` — orphaned, nothing
    reads them, blocked by the `$other` rule. Left in place deliberately.

- **DEFERRED 2026-09-15 (Wave B, v145) — three shared builders treat an EMPTY
scoped list as "everyone".** The Card tab now fails closed on a `?group=N` the
round does not have (`card_scope_closed_test.js`): the slice is `[]`, flagged as
`__scGroupMissing`, and `scopedPlayers()` in `index.html` tells "no lock" (the
whole field) from "a lock that matched nobody". But the same widening lives one
layer down, in protected files, untouched:
  - `hole-events.js :113` `buildHoleEvents` — `scopedPlayers.length > 0 ?
    scopedPlayers : data.players`.
  - `bet-strip.js :340` `buildActionRows` and `:1011` `buildSettledRows` — the
    same expression.
  - `money-engine.js :932` `buildLiveMatchStates` — an empty `visiblePlayerIds`
    becomes `null`, which means unfiltered.
  - **What holds it today.** `index.html` does not ask them when the link
    identifies nobody: `renderHoleRecap` and `renderActionCenter` return with an
    empty mount on `scopeMissing()`, and `renderLiveTicker` builds no match or
    stroke-bet cards. Every one of those guards is a negative control in
    `card_scope_closed_test.js` (each fires on its own).
  - **What breaks it.** Any NEW caller in `index.html` (or another page) that
    hands one of these builders an empty scoped list without a
    `scopeMissing()` guard shows the whole field again. The honest fix is in the
    builders: an empty array means nobody, and only `undefined` means "no scope
    given". Three protected files, each needing its own per-file approval;
    `card_scope_closed_test.js` pins their current text so the change is
    deliberate when it comes.

- **DEFERRED 2026-09-15 (trip money, "what is final") — the Receipt does not read
the settled predicate yet.** `settlement-engine.js computeRoundSettlement(data,
courseData, savedScores)` is now the ONE answer to "is this round's money
final": `finished` (every golfer who teed off has every hole scored, OR the
organizer verified the round — `scoresVerified.verified === true` — which is how
a picked-up ball or a golfer who left after nine is declared deliberate),
`kpSettled` (pool-engine's `settled`, read not re-derived), `unfinished`
(who is still out, with holes played), `started`, `thru`. `trip.html` reads it
(`trip_money_final_test.js`); a round scored thru 9 is named on the trip as
still in play, its money counted, the heading not "Final". **DONE the same
day — `settlement.html` reads it too** (`receiptSettlement()`,
`receipt_final_test.js`). The earlier version of this note said the Receipt
"decided Final from `computeMoneyPool().settled` alone, so a Receipt opened
thru 9 said Final" — that was FALSE, and measured false before the wave: the
Receipt already required every roster card complete AND the pool settled, and
short-circuited into LIVE RESULTS (a no-money golf summary,
`live_results_test.js`) otherwise. What actually differed: it never read
`scoresVerified` and waited for roster names that never played, so a round
with a DNF card had no route to a Final receipt. Now the live head names who
is out, a KP-only hold has its own head ("RESULTS — NOT FINAL"), the six
per-game headings drop "Final" while the round is not final, and the live
branch still carries no money — Manny's decision, kept.
  - **What "every golfer playing" means, measured.** A roster name with no score
    never teed off and is not waited for (`playing` counts `holesPlayed > 0`).
    A blank hole in the middle (`p104_h12` deleted) is `unfinished` 17/18 —
    the app cannot tell "picked up on 12" from "not there yet", so verification
    is the word for it. A round with no scores is `started:false`, held open as
    "not started". Verification is SUFFICIENT, never necessary: a round with
    every hole scored is finished without it.

- **DONE 2026-09-17 — trip identity, shape (b): ask on collision, show the roster.** A trip
still keys golfers by normalised name, but now through ONE function, `tripGolferKey(roundCode,
player)` in `trip.html`, which returns the mapping `trips/<code>/identity/<roundCode>/<playerId> =
"g<n>"` when the organizer has answered a question and the name key otherwise. All six keyed
surfaces — cumulative board, money ledger (both totals, who-pays-who), points race, awards, recap
card, share text — go through it; the per-round breakdown still prints each day's own names. The
rule is one node (`database.rules.json`: the round must be one of the trip's rounds, read through
root; numeric player id; value `g<n>`), proved by targaryen with `trip_identity.tests-data.json`.
**A trip with no identity node is byte-identical to before on all six surfaces**
(`trip_identity_prev.fixture.json`, five trips captured at 1ef9b27; `trip_identity_test.js`).
  - **The roster** ("👥 Golfers on This Trip", under the rounds list, its own mount `#trip-roster`)
    lists every golfer with "in N of M rounds" ("in 1 round" on a one-round trip): listed, scored or
    not, from the same counted-round set the money uses. It is the TELL for the case nothing can
    detect — two different people typed with one exact name on different days — a golfer who played
    once reading "in 2 of 2 rounds". The lines always come before the question cards.
  - **The question** is asked only on a collision the recon found reliable: two keys equal once
    punctuation is stripped ("matt b" / "matt b."), or a bare first name and a first+initial/surname
    sharing the first token ("mike" / "mike h") when the two spellings never sit in one round (if they
    do, they are two people by construction). Not handicap drift (Paul is 11/7/9/blank/14 in real
    rounds). Wording: *"Same golfer? Mike (Day 1) and Mike H (Day 2) — the trip adds up money and
    standings by name, so it needs to know whether that is one person typed two ways or two people.
    [One golfer] [Two people]. Nothing is merged or split until you answer. You can change this
    later."* A question, not an accusation. An answer writes one multi-path update to the identity
    node; the trip listener re-renders everything. Answered pairs collapse to "Mike and Mike H are one
    golfer. Change"; Change rewrites the same node the other way. Nothing merges or splits on its own.
  - **Two people with one spelling** (the invisible case, split by the organizer) are labelled by their
    rounds — "Mike (Day 1)", "Mike (Day 2)" — everywhere, because who-pays-who keys its names and a
    golfer could not tell them apart otherwise.
  - **The gate is untouched**: placeholders, within-round duplicates and impossible round counts still
    refuse on names, mapping or not.
  - **Why (b) and not (a)** (a roster on the trip with `rosterId` on every round's player): (b) changes
    no round, needs no planner names step — the planner writes "Player N" placeholders from a count
    and does not know the golfers — and a trip with no mapping is today's trip. (a) is where this ends
    up eventually; it is a bigger bite and it would block on a planner change we do not need yet.
  - Known: `nextTripGolferId` mints from the map the page currently holds; two answers before the
    listener echoes the first would reuse an id. The listener echoes in the same tick on a live
    connection; offline, GolfNet tracks the write and the second card is re-rendered from the echo.
  - Chrome: `tools/trip-identity-check.js` — cold arrival on the two-Mikes trip, a real press of "One
    golfer", the write captured, the record delivered back, the ledger going from two lines to one.
  - **PUBLISHED 2026-09-17** (`firebase deploy --only database`, the same discipline as Wave 2): live
    before = the 2026-09-16 registration-schema set (stripped sha8 40f2ae74, byte-equal to the pre-wave
    repo file); the diff to the repo file was exactly this node; the before-set is saved outside git
    at `~/.golfapp-rules-backup/before-identity/` with its own `firebase.json` — rollback:
    `cd ~/.golfapp-rules-backup/before-identity && npx -y firebase-tools@14 deploy --only database
    --project golfapp-9fb21 --non-interactive`. Read-back after: byte-equal to the repo file (171987db).
    Proved live on a throwaway trip, unauthenticated: `identity/R0/101 = "g1"` accepted; `R0/mike`,
    `R0/102 = 7`, `R9/101` (no such round) and `R0/103 = "mike"` each 401; a multi-path update with one
    bad entry refused whole. Throwaway removed with the admin CLI and confirmed gone. Monday test on a
    real old round (277Y, hole 1): an unauthenticated score write landed, was read back, and was put
    back exactly; every score key equals the morning's dump.

- **Recorded 2026-09-15, superseded above — cross-round identity on a trip was the
normalised name only.** `renderTripMoneySettlement` (and the two totals it now
shows) add up per-golfer nets keyed by `name.trim().toLowerCase()`
(`normalisePlayerName`, `action-model.js`). What was found in the recon: two
golfers with the same normalised name INSIDE one round block the whole trip
total (the identity gate, `trip_one_gate_test.js`); a different "Mike" on
another day merges silently into the first Mike's total, and "Mike D" on day 2
is a third golfer. `ryder-cup.js` is points only and does not share the problem.
Player ids are issued per round (`admin.html`), so there is no cross-round key
to use today. The honest shape is a trip-level roster that maps each day's
player id to one trip golfer, with the gate refusing a name that appears on
the trip roster twice — a wave of its own, not a fix inside the money card.

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
  in this bullet's title is correct and current: the account is the **free tier**,
  35 a day. A line here claimed Pro from 2026-09-11 to 2026-10-03; it was wrong.)

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
`kp-entry-position-check.js` (the Weekly Game KP entry is the element under the
Prev/Next row on a KP hole and 0 px on any other; the landing is unchanged; `[page] [arm]`
for the A/B against a copy of HEAD's page and the Dots arm) ·
`orphan-match-check.js` (READ-ONLY, against live data) ·
`receipt-identity-check.js` · `native-pdf-mark-check.js` (the share-sheet PDF
carries the brand mark as a JPEG image object flattened on white from the
page's own element - zero requests for the asset; PDFKit renders it and the
mark box's corners are white, the R its own green) ·
`native-pdf-lines-check.js` (the share-sheet PDF's
lines read like the page - one per ledger row, the money in the same order as
the v150 capture, no button text; the trip itinerary unchanged) ·
`receipt-logo-check.js` (the brand mark is on the
printed receipt, display:none and 0 x 0 on screen, and the native text PDF gets
nothing from it; `--baseline <file>` proves the screen did not move) ·
`round-setup-check.js` (the destructive control is
quieter than Save, the page has a way back, and **nothing that shares a round has
crept back onto the setup screen**) · `round-share-check.js` · `ryder-arrival-check.js` ·
`share-url-check.js` (every builder returns `https` from a non-web origin) ·
`trip-awards-check.js` (awards refuse a merged name; no page renders a literal escape) ·
`cup-join-check.js` ·
`trip-money-check.js` · `wizard-wager-check.js` ·
`tournament-pairings-check.js` (clicks the page's own Print Pairings button, then
emulates print media: everything outside the sheet has a zero rect, every golfer is on
it once, the HOLE NOT SET count matches) ·
`tournament-register-check.js` (cold arrival on `?register=CODE` paints the signup
form; the owner on `?tourney=CODE` sees the list without a renderer call) ·
`tournament-payout-rank-seam-check.js` (the team the board shows first is the team paid
`spotAmounts[0]`, and so on down the paid places — the seam no unit test covers) ·
`flights-leaderboard-check.js` (a flighted round on the leaderboard and the admin
rows at 390px, reached through the page's own Back buttons) ·
`skins-carry-wizard-check.js` (a fresh code, the wizard's own Next buttons, the
Also Playing Skins box ticked; reads which Ties button is filled by computed colour).

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
