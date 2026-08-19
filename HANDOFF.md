# GolfApp — Project Handoff

I'm building a golf scoring and betting web app. I'm not a coder — an AI assistant writes the code, I review and commit it. I need you to get oriented before suggesting anything.

## What it is

A mobile-first PWA for golf groups who play a lot of side action. The core promise: **one app tracks every bet, so nobody needs notes, spreadsheets or arguments after the round.**

The defining user is my friend Marty and his Monday group. On any given Monday they might have a main Stroke Play game, a Nassau, multiple Match Play side bets, several presses at different amounts, two separate Skins games between different subsets of players, cross-group bets, and Birdie/KP/Dots — all at once.

## Tech stack and constraints

- **Vanilla HTML/CSS/JS. No frameworks, no build step.**
- Firebase Realtime Database (compat 9.22.2)
- Cloudflare Pages, auto-deploys from GitHub on commit
- Repo: `mannyorozco0508/golf-app` (public)
- Tests: Node's built-in test runner (`npm test`), zero extra dependencies
- **I edit code by pasting whole files into GitHub's web editor on an iPad.** No terminal, no local dev environment, no ability to run tests myself.

That last point matters a lot. Give me **complete file replacements**, never diffs or "find and replace this line." And assume I can't verify anything myself — you have to.

## Current state

```
252 suites · 1254 tests · 1253 passing · 0 failing · 1 todo
```

Roughly 25 pages/modules. The money math lives in three canonical files:

- `money-engine.js` — handicap allocation, match/stroke/wolf engines
- `settlement-engine.js` — the single source of truth for "what did each golfer win or lose"
- `action-model.js` — normalizes "what games are we playing" into one list

**Duplication is intentional.** Several pages carry their own copies of the engines because there's no module system. Parity tests guard them. Never "helpfully" consolidate them.

## What was just completed

A full product audit plus **100 simulated rounds** run against the real production settlement path — not unit tests, but complete rounds from setup through final payout, across 8 complexity bands (simple, heavy-action, cross-group, mid-round additions, score corrections, extreme presses, large fields).

**Results: 100/100 passed. Zero money bugs.** Zero-sum held, "Who Pays Who" reconciled and reconstructed every balance exactly, across 191 side matches, 69 Skins games, 309 presses and 48 score corrections.

Two display bugs were found and fixed (neither changed any payout):

1. A Nassau side bet started on hole 9 printed "Front 9 · Holes 1–9" on the receipt. Money was right; the label was wrong. Now shows the holes actually played.
2. Stacked games (Skins, Dots, Stableford) settled correctly into the final total but were **never itemised on the receipt** — you'd see "Marty Won $58" with no line explaining where the Skins money came from. Now each game gets its own card, built from the same function the ledger uses so the breakdown can't drift from the total.

## Recent feature work, for context

- **Participant-scoped Skins** — "me, Marty and James are playing $10 skins" inside a larger round. Multiple independent Skins games can run at once with their own stakes, scoring modes, carry rules, start holes and player lists.
- **Side match start holes** — a bet struck on the 6th tee no longer retroactively counts holes 1–5. For cross-group bets it starts after the furthest-along player, so neither side walks in already knowing they're ahead.
- **Scoring vs Action separation** — setup now asks "how are we scoring?" separately from "what's the money?"

## Known open items

- **Firebase has no security rules yet.** Accepted for private beta; a real prerequisite before any public release.
- `skins.html` (the Action tab) doesn't know about participant-scoped Skins games — it still shows only the legacy round-wide view. Money is unaffected, but the page is misleading.
- Four separate "Save as PDF" buttons exist across different pages; only the Round Receipt is canonical.
- **None of the recent work has been tested on an actual phone on an actual course.** That's the real next step.
- App Store path is mapped (Capacitor wrapper, no Mac needed) but deliberately not started.

## How I want you to work

- **Verify, don't assume.** Pastes silently fail sometimes. If you tell me something landed, check it.
- **Don't change betting math** without stopping and explaining first. Handicap allocation, the match/stroke/Nassau/Skins engines, and the whole-dollar settlement allocator are all off-limits by default.
- **Audit before you code.** Read the actual production path rather than inferring from function names.
- **Never weaken a test to make a change pass.** If behaviour genuinely changed, update the assertion to the new contract and explain why it's still as strong.
- Phone-first. Primary target is 360–430px.

## What I'm asking you

[Replace this line with your actual question.]
