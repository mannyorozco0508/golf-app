# Rattle Golf — Project Handoff

> **Web brand: HardPan.** Consumer and tournaments. The mark is a dimpled ball on a firm ground line (bone, then forest green) beside HARDPAN. Lobby: `hardpan-lockup.svg` on `#0B0F0C`. Tab and PWA icons are the ball alone. Tournaments landing says HardPan Tournaments. `support@rattlegolf.com`, Rattle Golf LLC, bundle id `com.rattlegolf.app`, and `tournaments.rattlegolf.com` stay. The repo display name is HardPan. Do not archive or upload a new iOS binary while 1.0.3 is in review. `icon-1024.png`, the iOS AppIcon, and the Android mipmaps stay the Stroke R — do not sync Capacitor for icons. Shell cache `golfapp-v205-hardpan-logo`; consumer cache `consumer-v48-hardpan-logo`; tournament cache `tournament-v52-hardpan`.



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
(the ball on firm ground) on a near-black disc at left, the word **HardPan**
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

**The band says HardPan Tournaments.** The two products share one Pages project;
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

A backfill script lives outside the repo at `~/rattle-backfill`, pulling par and handicap from GolfCourseAPI. Match rate on a 20-course sample was **50%** — good on name-brand clubs, thin on small municipals. **The account is on the PRO plan: 10,000 requests/day.** The free tier is 35 — this line said 50 until 2026-09-11, then 35, and the upgrade landed the same week. The proxy was designed against 35 and its numbers moved with the plan; the design notes below keep the free-tier reasoning because it explains the shape of the code, not because it still binds. Each course still costs two: search returns only a *count* of tee boxes, so the tee data needs a second request by id.

**Seeding the directory by region is not achievable, and no subscription tier changes that.** The open item used to read as an admin-SDK script to seed every course in WA, AZ and OR. The API cannot produce that list: `/v1/search` stops at 25 results with no way past (measured six times — see "The API ceiling" below), there is no list endpoint, no geographic query, and ids are opaque 8-character strings from a 32-character alphabet, so the directory cannot be enumerated by any means. The constraint is the API's shape, not quota. **What is achievable is seeding from a list of course names we supply** — two requests each, search then detail, comfortably inside 10,000 a day. The list has to come from us. And the seeder does **not** need the admin SDK: `global_courses` is writable under the normal rules, gated by the `gca_` provenance validate, so a seeder should be *subject* to that rule rather than exempt from it.

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

**Still true, and still the sharp edge.** The token is a BEARER SECRET: anyone
who gets the link is that round's organizer on their device, forever. The doors
are hidden, not locked — `database.rules.json` still lets any client holding the
code write an existing round.

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
2. **Security rules AFTER (c), never before.** Setup keys owner-only
   (`players`, `groupSizeOverrides`, `moneyPool`, `flights`,
   `additionalGames`, `courseData`, `settlementMode`, `supersededBy`,
   `organizerToken`), scores and the KP/marker keys open to any scorekeeper
   holding the code. `auth.uid === data.child('ownerUid').val()` is the only
   check the rules can make cheaply and correctly — the shape
   `tournaments/$code` already uses, where the rules ALREADY demand a
   non-anonymous provider. A token or a PIN cannot be verified while
   `events/$code` is world-readable: every client can already read them.
   NO INTERIM RULES: owner-only writes before accounts exist would turn the
   2026-09-21 experience from "doors hidden" into "doors shut" on the
   organizer's own second device.

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
4. Do **not** publish owner-only Realtime Database rules in this wave. Existing
   rounds stay writable by anyone with the code. Owner-only setup keys come
   after organizers can sign in on a second device (roadmap item 2).

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

## The organizer doors — Wave v189, 2026-09-21

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
and no `ownerUid` (2026-08-24 to 09-14) admits only the link. Never on a group
link, whoever holds it. **The uid is per browser ORIGIN**: Safari, the home-screen
app and the App Store app on one phone are three different organizers — open the
organizer link once in each to make them all the organizer.

**WHAT THIS IS NOT. This hides the doors; it does not lock them.**
`database.rules.json` is untouched: `events/$code` `.write` still permits any
client holding the code to write an existing round's settings, and the organizer
token is `.read: true` like the rest of the round. Making setup owner-only is a
rules change with the per-origin identity problem above (a rule that trusts
`ownerUid` alone locks the organizer's own phone out of a round created on the
Mac; one that also trusts the token has to store it somewhere the rule can read
without every reader seeing it). It needs a rehearsal on a throwaway round, and is
its own wave after the 2026-09-22 round.

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
| `:6672` `renderEndRoundControl` | whether the "End & Wipe" control is drawn |
| `:6688` `endAndClearRound` | the wipe itself, checked again at the action |
| `:3609`, `:4283`, `:4296`, `:4976`, `:6657`, `:6664` | comments that name the predicate — prose only |

`organizer_door_test.js` pins the count of the string (10 now, comments
included), so a gate moved later has to move its comment too and update the
table above. Also not on either predicate: the group switcher in
`renderGroupFilters` (`hasGroupLock` decides, harmless for a spectator) and the
score-override provenance `verifiedBy` (`hasOrganizerAuthority`, the token only).

Not moved tonight because the wipe is the destructive control and should get its
own decision rather than ride along, and the inline wager panel on a single group
is the case where "one group IS the field" was the deliberate design.

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
