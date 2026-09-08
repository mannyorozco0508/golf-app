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

## Tournament scoring surface — what the next person needs before touching it

`tournament-scorecard.html` is where a golfer actually enters strokes, and it
carries decisions that look like style until you change one.

### The card is not rebuilt for a score change

Both tournament pages hold exactly one listener, on `tournaments/<CODE>`. Every
write in the product lands under that path, so every device's callback re-runs on
every score anyone posts — measured at 25 groups, that is roughly 360 re-fires a
minute on each phone. The card used to answer each one by rewriting its hole list
from a string, which replaced all 72 inputs, dropped focus, and threw away any
digit typed but not yet blurred. `onchange` fires on blur, so that digit was never
saved anywhere else.

So the renderer now writes new numbers into the inputs already on screen, and only
rebuilds when the card is genuinely a different card. The one the golfer is
currently in is skipped entirely: a half-typed stroke outranks a stored number
they are in the middle of replacing.

### The shape key is DERIVED from the markup. Do not replace it with a field list.

The decision "is this the same card" is made by taking the HTML the renderer just
built, blanking the two parts that legitimately change on every score — the input
`value` attributes and the per-hole team result text — and comparing what is left
with the previous render. Anything that changes the markup changes the key.

**The obvious refactor here is the bug.** Replacing that with an explicit list of
fields to watch — roster, status, format, course — moves correctness from "the
markup decides" to "somebody remembered". The failure mode is silent and awful: a
field nobody adds to the list is a card that stops updating and gives no sign,
which is the same class of defect as a guard that cannot fire. If the derivation
ever needs to change, it should get harder to fool, not more explicit.

### `roundLocked` is the one thing not in the markup

A round's open/closed state does not appear in the HTML at all. It is applied
afterwards, by the caller, as a sweep that disables every input. That sweep only
ever sets `disabled` — it never clears it — so without help, closing a round and
reopening it would leave the card dead permanently: the in-place path would reuse
the disabled inputs and nothing would put them back.

It is therefore passed to the renderer separately as a salt on the shape key, so a
lock change always forces a full rebuild and the inputs come back enabled.
`tools/tournament-focus-check.js` proves this on a hand-written multi-round record,
in both Chrome and WebKit, and its control removes the salt and confirms the inputs
stay stuck disabled — so the salt is demonstrably what does the work rather than
something that merely sits alongside it.

### Fields that must force a rebuild

This list is **documentation of what the derived key already covers**, not an input
to it. Nothing reads it. It exists so a reviewer can check the key is still doing
its job, and so anyone adding a field knows what class it belongs to.

Rebuilds the hole inputs: round status; round format; the course data, name or
key; scoring mode; the round's handicap snapshot; the round being removed; a
scoring group's player list; the group being removed; a player added or removed;
a player's name; a player's handicap; a team's name, player list or starting hole;
and the single-round equivalents of format, scoring mode, course data and course
name.

Rebuilds something other than the inputs: the group's name, the group's or team's
starting hole, the round's name, the event name — and flights, which change only
the leaderboard tab.

Affects this page not at all: entry fee, start type, trip code, sort order,
closed-at and created-at timestamps.

**And the trap.** The Leaderboard tab on this same page is built from every score
in the event. Anything that suppresses re-rendering has to be scoped to the hole
inputs, never to the snapshot, or that tab freezes.

### Which score keys belong to a card

Four key shapes exist, and the branch between them is chosen from the record's
declared model marker — never guessed from the key itself:

- Individual events (`scoringModel: 'player-v1'`) key scores by opaque player id.
  Membership is decided by **testing the key against the ids the group actually
  holds**, not by taking the key apart. The ids are minted and opaque, and a parser
  for them would be a second definition of player identity.
- Legacy team events key by team number — one score per team per hole for Scramble,
  one per player index for Shamble and Best Ball. Those last two are byte-identical
  in storage and differ only in how they are read, so the key can never tell you
  which format produced it.

Seven ways a naive version of that predicate goes wrong, all of them cheap to
avoid and expensive to discover:

1. `team1` is a prefix of `team11`. The team number must be matched with its
   delimiter, not with a string prefix.
2. In a multi-round event the scores live under the round and membership must be
   read from **that round's** groups. Comparing against the event's own
   `scoringGroups` — empty on such a record — makes every key look foreign and
   nothing ever updates.
3. A cleared score arrives as an **absent** key, not a changed one. Walking only
   the new record's keys cannot see a deletion; the union of old and new is needed.
4. A golfer moved **into** the group must be read from the arriving snapshot. Held
   against a cached member list, their key reads as foreign, no rebuild happens,
   and their inputs never appear.
5. A golfer moved **out** correctly reads as foreign — but the group's membership
   changed, which is a rebuild trigger for a different reason, so the card must
   still redraw.
6. Shamble and Best Ball share one key shape. Format is a record field; inferring
   it from keys silently changes the arithmetic.
7. Player ids happen to contain no underscore today, which makes `{id}_h{n}` look
   safely splittable. That is a property of the id minter, not of the format.
   Membership testing does not depend on it. Parsing would.

### There are TWO cache versions, and `CLAUDE.md` names only one

`CLAUDE.md` says to bump `CACHE_VERSION` in `sw.js` when a cached shell file
changes. That instruction is written for Consumer, and `sw.js`'s `CACHE_VERSION` is
the **Consumer** cache.

The Tournament bundle has its own key, set in `build-shell.js`. A change to
`tournament.html`, `tournament-scorecard.html` or `tournament-engine.js` needs
**that** one moved. Bumping `sw.js` instead re-downloads the Consumer shell on
every installed phone for a change that is not in Consumer, and still leaves
Tournament devices serving the old file — the worst of both. Check which product
the changed file belongs to before bumping anything.

### The `#multi-round-toggle` trapdoor

The organizer page carries a checkbox reading "This event has more than one
round". It writes nothing. The flag it sets is read only by the save that creates
a tournament, and the checkbox lives on the screen that replaces the setup form —
so it can only be ticked after the only function that reads it can no longer run.
Multi-round events are therefore not creatable from the UI, and everything built
for them is correct and unreachable.

**Wiring that checkbox is a two-line change that ships three bugs.** Before doing
it, fix these, because each one is invisible today only because nothing can reach
it:

1. **Print / Send Results reads the event root.** A multi-round event has no
   scores there, so the printed sheet lists every golfer with no score at all,
   while the leaderboard above it — which reads the round — is correct.
2. **The golfer's own Leaderboard tab reads the event root** for the same reason
   and is likewise blank on a multi-round event.
3. **No control produces a round-scoped team link.** Team links are built without
   a round, and the scorecard correctly refuses them with a message telling the
   golfer to ask the organizer for today's link — a link the organizer has no way
   to generate. A multi-round team event would be unscoreable.

The refusal in (3) is right. The way out of it does not exist yet.

## Do not

- Delete `tournament*` files, or the `tournaments` node, or the retained helpers
- Rename the Tournament product to Rattle Golf
- Add Tournament pages to the Consumer native bundle
- Run a schema migration on the `tournaments` node
- Rename persisted identifiers for tidiness
- Change `com.rattlegolf.app`
