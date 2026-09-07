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
1125 suites · 5721 tests · 5720 passing · 0 failing · 1 todo
```

15 HTML pages plus ~20 shared JS modules. The money math lives in three canonical files:

- `money-engine.js` — handicap allocation, match/stroke/wolf engines
- `settlement-engine.js` — the single source of truth for "what did each golfer win or lose"
- `action-model.js` — normalizes "what games are we playing" into one list

**Duplication is intentional.** Several pages carry their own copies of the engines because there's no module system. Parity tests guard them. Never "helpfully" consolidate them.

## iOS / App Store status

- Apple Developer account active, team `A2Z95T64UU` (Manuel Orozco, individual)
- App Store Connect record exists: Rattle Golf, bundle `com.rattlegolf.app`, Apple ID 6808220335
- **Build 8 was archived on 2026-09-06.** `CURRENT_PROJECT_VERSION = 8` in the project. Internal group "Beta Testers" with automatic distribution on
- **Build 8 carries web v71, not v72.** The native bundle is synced by hand, so it is a snapshot of whenever `node sync-mobile-web.js && npx cap sync ios` last ran — never automatically whatever `main` holds. v72 (the setup page's link copy, the quiet End control, the back button on admin) is on the web and NOT in that build. Check `ios/App/App/public/sw.js` for what a build actually contains; do not infer it from the repo
- Signing works via automatic signing. The long-running failure was that my team had **zero registered devices**, so Apple would not issue a development profile. Plugging in my iPhone and enabling Developer Mode fixed it. Nothing in `project.pbxproj` was ever wrong — don't go looking there
- Export compliance answer is "None of the algorithms mentioned above" (HTTPS via the OS only)
- Privacy policy live at `golf-app-5a5.pages.dev/privacy.html`

**Not done yet:** external TestFlight testers, the EU trader declaration (required or the app is pulled from the EU store), and the Paid Apps Agreement (required for any in-app purchase; needs banking and tax info).

To ship a new build: `node sync-mobile-web.js && npx cap sync ios`, bump **Build** in Xcode (Version stays 1.0.0), Archive, Distribute → App Store Connect.

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

- `skins.html` (Action tab) doesn't know about participant-scoped Skins games — still shows only the legacy round-wide view. Money is unaffected; the page is misleading
- Four separate "Save as PDF" buttons exist; only the Round Receipt is canonical
- The Tesseract OCR scorecard scanner loads from a CDN at runtime, so it fails offline — exactly where it's most needed
- **Still not tested on an actual course during an actual round.** That remains the real next step. (Offline behaviour specifically *has* now been verified on hardware — see the section above.)
- No monetization built. Direction is freemium with a one-time or per-trip unlock, not a subscription. Real IAP needs native StoreKit work

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
