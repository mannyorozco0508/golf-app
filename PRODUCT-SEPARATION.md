# PRODUCT SEPARATION MANIFEST

**Status:** Consumer separated at the Rattle Golf polish batch. The Club/Tournament app has not been started.

This is an engineering handoff, not marketing copy. Its job is to let the second app begin without rediscovering the architecture — and, more importantly, to stop someone deleting code that looks unused but is load-bearing for a product that does not exist yet.

---

## The boundary

| Product | Contains |
|---|---|
| **Rattle Golf Consumer** | **Game Day** (was Quick Round) · **Road Trip** (was Golf Trip) |
| **Club / Tournament** *(not built)* | **Club Round** · **Tournament Round** · tournament management |
| **Shared** | The round engine and everything under it |

---

## A. Consumer files

| File | Role |
|---|---|
| `admin.html` | Lobby + 7-step Game Day setup wizard. Owns both mode tiles. |
| `index.html` | Live scorecard. Native entry point (redirects to `admin.html` with no `?game=`). |
| `leaderboard.html` | Live leaderboard |
| `settlement.html` | Who Pays Who receipt |
| `skins.html` | Bets / Skins tracker |
| `sidematches.html` | Cross-group side matches |
| `stats.html` | Final scorecard |
| `trip.html` | **Road Trip** |
| `instructions.html`, `shared.html` | Support pages |
| `logo-mark.png`, `icon-{192,512,1024}.png` | Brand assets |

Consumer bundle: **31 files**, cache `consumer-v34-brand-mark`, `start_url: ./admin.html`.

## B. Club / Tournament files — **PRESERVED, DO NOT DELETE**

| File | Role |
|---|---|
| `tournament.html` | Organizer page — flights, teams, rounds, payouts |
| `tournament-scorecard.html` | Team scorecard, group links |
| `tournament-engine.js` | Tournament scoring and payout engine |

Tournament bundle: **17 files**, cache `tournament-v32-consumer-ready`, `start_url: ./tournament.html`. Built by the same `build-shell.js`. **Not shipped in the Consumer native bundle** and must never be.

## C. Shared

`money-engine.js` · `settlement-engine.js` · `action-model.js` · `bet-strip.js` · `hole-events.js` · `score-marks.js` · `handicap.js` · `grouping.js` · `payouts.js` · `pool-engine.js` · `course-data.js` · `text-safe.js` · `product-links.js` · `pwa-boot.js` · `sw.js` · Firebase SDK · `database.rules.json`

**These must stay product-neutral.** `rattle_consumer_separation_test.js` asserts no engine file mentions "Game Day" or "Road Trip".

The first six are on the protected list: no modification without explicit approval.

---

## What was removed from Consumer, and what was kept

| Removed from Consumer UI | Kept in the codebase |
|---|---|
| Club Round tile (`hw-club`) | The `club` **preset**: `?eventType=club`, `eventTypeFraming.club`, the Step 3 branch. A deep link still works. |
| Tournament promo card (`cross-product-exit`) | `openTournamentsApp()` in `admin.html`, `tournamentUrl()` in `product-links.js`, the `selectHomeWidget('tournament')` compatibility branch, and the `.cross-product-exit` CSS |
| "Tournaments in This Trip" list | `renderTournamentsList()` — retained, now self-guarding |
| "Manage in Tournaments ▶" button | `createTournamentForTrip()` — retained |

**Nothing was deleted. No schema migration was run.**

---

## ★ Retained for backward compatibility — the part most at risk

### `trips/<code>/tournaments`

A trip record can carry a `tournaments` node. The Tournament product writes it when an organizer attaches a tournament day to a trip; `trip.html` reads it at line ~982.

**Consumer no longer displays it. Consumer still carries it.** A trip saved before this batch loads identically after it.

This node is the relationship the Club/Tournament app will use to find its trip context. It is now unreachable from any Consumer screen, which is exactly why a future "remove dead code" pass would delete it without anything noticing.

`rattle_consumer_separation_test.js` pins the read path, both helpers, the outbound route, and asserts no destructive migration exists. **If that test fails while you are deleting unused code, the test is right and you are wrong.**

### Other compatibility identifiers — do not rename

| Identifier | Why |
|---|---|
| `'greenie'`, `greenieCarryover` | Persisted dot IDs. UI says KP; storage says greenie. |
| `golfapp-theme`, `golfapp_me_*`, `golfAppRoster` | On golfers' devices already |
| `golfapp-9fb21` | Real Firebase project ID |
| `golfapp-` cache prefix | Lets an installed PWA evict its old caches |
| `hw-quick`, `hw-trip`, `selectHomeWidget('quick')` | Internal IDs. Display names changed; identifiers did not. |

---

## Remaining coupling

| Coupling | Handling |
|---|---|
| `trips/<code>/tournaments` | Schema retained, Consumer UI removed |
| `product-links.js` | Shared by both products; resolves cross-origin links when the two deployments split |
| `build-shell.js` | Builds both products from one source tree |
| Firebase project | One project, one rules file, both products |
| Round engine | Club Round is a preset over the Consumer engine — genuinely shared, not duplicated |

---

## How the second app reuses this

1. `tournament.html`, `tournament-scorecard.html`, `tournament-engine.js` are intact and already build as a separate 17-file target.
2. Club Round needs no reimplementation — it is a framing preset over the shared round engine. Reuse `eventTypeFraming.club` and the `?eventType=club` deep link.
3. Read `trips/<code>/tournaments` for trip context. `renderTournamentsList()` in `trip.html` is a working reference implementation.
4. `tournamentUrl()` / `consumerUrl()` already handle both products sharing one origin or splitting to two.
5. Keep the Tournament cache key distinct. `build-shell.js` enforces this and tests pin it.

---

## Do not

- Delete `tournament*` files, or the `tournaments` node, or the retained helpers
- Rename the Tournament product to Rattle Golf
- Add Tournament pages to the Consumer native bundle
- Run a schema migration on the `tournaments` node
- Rename persisted identifiers for tidiness
- Change `com.rattlegolf.app`
