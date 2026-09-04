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
920 suites · 4783 tests · 4782 passing · 0 failing · 1 todo
```

15 HTML pages plus ~20 shared JS modules. The money math lives in three canonical files:

- `money-engine.js` — handicap allocation, match/stroke/wolf engines
- `settlement-engine.js` — the single source of truth for "what did each golfer win or lose"
- `action-model.js` — normalizes "what games are we playing" into one list

**Duplication is intentional.** Several pages carry their own copies of the engines because there's no module system. Parity tests guard them. Never "helpfully" consolidate them.

## iOS / App Store status

- Apple Developer account active, team `A2Z95T64UU` (Manuel Orozco, individual)
- App Store Connect record exists: Rattle Golf, bundle `com.rattlegolf.app`, Apple ID 6808220335
- **Build 2 is live on TestFlight.** Internal group "Beta Testers" with automatic distribution on
- Signing works via automatic signing. The long-running failure was that my team had **zero registered devices**, so Apple would not issue a development profile. Plugging in my iPhone and enabling Developer Mode fixed it. Nothing in `project.pbxproj` was ever wrong — don't go looking there
- Export compliance answer is "None of the algorithms mentioned above" (HTTPS via the OS only)
- Privacy policy live at `golf-app-5a5.pages.dev/privacy.html`

**Not done yet:** external TestFlight testers, the EU trader declaration (required or the app is pulled from the EU store), and the Paid Apps Agreement (required for any in-app purchase; needs banking and tax info).

To ship a new build: `node sync-mobile-web.js && npx cap sync ios`, bump **Build** in Xcode (Version stays 1.0.0), Archive, Distribute → App Store Connect.

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

## Known open items

- `skins.html` (Action tab) doesn't know about participant-scoped Skins games — still shows only the legacy round-wide view. Money is unaffected; the page is misleading
- Four separate "Save as PDF" buttons exist; only the Round Receipt is canonical
- The Tesseract OCR scorecard scanner loads from a CDN at runtime, so it fails offline — exactly where it's most needed
- **Still not tested on an actual course during an actual round.** That remains the real next step
- No monetization built. Direction is freemium with a one-time or per-trip unlock, not a subscription. Real IAP needs native StoreKit work

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
