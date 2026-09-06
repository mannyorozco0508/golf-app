# Next session — start here

Read `HANDOFF.md` for the project, `CLAUDE.md` for the rules. This file is the
state of play after the session of **2026-09-06**, and the plan for October.

Branch `ryder-cup` and `main` are both at `d3ed1a0`. Live is **v61**
(`golfapp-v61-cup-arrival`), confirmed serving. Suite: **1098 suites / 5536 tests /
5535 pass / 0 fail / 1 todo**.

---

## What shipped today — seven waves

| | |
|---|---|
| `73fc3a3` | **D1** — the match-handicap line is readable in Hole View, cloned not rebuilt |
| `10e6004` | **D1a** — Auto with one wager names the handicaps instead of the pairing |
| `3cc873e` | Auto Press Amount says what a press costs, from one shared builder |
| `a249596` | Price the Auto Press option when the control appears, not only on edit |
| `b0fef0c` | Auto Press option says "bet", not "segment" |
| `e875074` | **Stable player ids** in the wizard |
| `e6583b6` | Ryder matches keep the format they were seeded with |
| `30dd29b` | A round can say which Cup session it is |
| `d3ed1a0` | Arriving to set up a Cup lands on the Cup |

(Plus SW bumps v53–v61. Every wave that touched a shell file got a bump and seven
`CACHE_VERSION` pin updates.)

---

## Six dead wires, and the pattern that connects them

All six were **complete, correct, tested code that nothing invoked**. Every one sat
under a green suite, some for months.

1. **The match-handicap line** rendered only inside `#full-card-container`, which is
   `display:none` in Hole View — the view golfers actually play from.
2. **The session pointer.** Phase 4 designed `ryderCupRef = { host, sessionId }`. Every
   occurrence in the codebase was a reader or a comment. **Nothing wrote one**, so every
   round resolved with a null session.
3. **The match format.** `buildRyderCupConfig` flattened every non-singles format to
   `fourball`, so a Classic Cup stored Foursomes sessions as Four-Ball. Phase 5 taught
   the `scoring:` line about Foursomes and missed the `format:` line directly above it.
4. **The alternate-shot entry card.** Phase 5 built the whole feature — WHS allowance,
   narrow-path writes, host-side locking, 590 lines of tests — and never called
   `renderFoursomesEntryHtml` from any render path.
5. **The Cup surface itself.** `rcRefresh()`, whose entire body is
   `renderRyderCupSetup()`, was never called. All ten render call sites sat inside `rc*`
   handlers fired by buttons that only exist inside the markup that render produces.
   Page loads → mount empty → no buttons → nothing can trigger it.
6. **Cross-round Cup identity.** Not a missing call — a design gap. See below.

**The pattern: the single-round path was exercised; the multi-round path never was.**
Concretely, `loadRyderHostCup()` only fires when `ref.host !== currentMode`. Nothing
wrote a ref until today, and today's write points at *self*. So `loadRyderHostCup`, the
`host-unavailable` branch, `__ryderHostCup`, every cross-round branch of
`resolveRyderCupForRound`, and `computeRyderCupTotals` across rounds **have never
executed in production, once.** Expect more dead wires in exactly that region.

**Why the tests missed all of it:** they constructed the thing they were meant to be
checking. Phase 5's suite hand-built match objects with `format:'foursomes'` and never
went through the writer that flattened it. Its two "wiring" tests asserted that a
*string* appeared in `index.html` — and the string lived inside the dead function's own
generated markup, so the feature satisfied them by quoting itself.

---

## The cold-arrival standard

**A device check may not call a function the page defines.** Replace the data source,
navigate to the URL a user lands on, and touch nothing. If the page does not do it on
its own, it does not happen.

`tools/lib/cold-arrival.js` is the shared harness: it blocks the Firebase vendor
bundles, injects a small stand-in via `Page.addScriptToEvaluateOnNewDocument` before any
page script, and lets the page run its own init, its own listener, its own render.

Three checks are built on it — `id-binding-check.js`, `foursomes-entry-check.js`,
`ryder-arrival-check.js`. `HANDOFF.md` documents each with run commands and exit codes.
**Exit 2 means nothing was proven and is not a pass.**

The standard paid for itself immediately: arriving cold found a real bug in that same
wave's own code. Chrome fires `toggle` for a `<details open>` **at parse time**, which
wrote `'true'` to `sessionStorage` before the arrival handler ran — so the handler read
its own noise as the organizer's remembered choice. Every mini-dom test passed;
mini-dom fires no toggle on parse.

### The honest note

**Four of today's shipped waves — D1, D1a, the priced Auto Press option, and stable
player ids — were only verified under invocation at the time they shipped.** Every
device check called the thing it was checking. They were re-verified cold afterward and
all four hold. But they pass cold because they were later tested cold, not because the
original verification was adequate. Three passed on the first cold attempt; the fourth
did not, and that failure is what produced the standard above.

---

## Cross-round Cup identity — the sixth wire, and the Trip Mode finding

**The problem.** Player ids are per-round and positional — `101` means "first golfer on
*this* round's roster". The Cup stores only ids in `members` and `playersA/playersB`.
Read the same Cup against a second round's roster and it names different people:

```
Cup built on round 1, match says playersA=[101,102] playersB=[103,104]
  read against round 1 roster :  sideA [Marty, Manny]   sideB [Lance, Zach]
  read against round 2 roster :  sideA [Zach, Lance]    sideB [Manny, Marty]
```

Both sides swap. **Shipping cross-round discovery without fixing this is worse than
shipping nothing** — wrong teams, wrong points, and nothing looks broken.

**Trip Mode already solves the general problem.** `computeTripPointsRace`
(`trip.html:1527`) keys cross-round identity on `name.trim().toLowerCase()`. It computes
each round with that round's own ids and buckets the *outputs* by name; the id never
crosses a round boundary.

**And it's cheaper than first estimated.** `loadRyderHostCup` fetches
`db.ref('events/' + host)` — the **entire host round**, not just its `ryderCup`. So the
host's `players` array, names included, is already in memory and already handed to
`resolveRyderCupForRound` as `hostCupData`. So:

> cup member id → host round's player name → lowercased match → local round's id

**No schema change, no migration, works for Cups already saved.** And
`resolveRyderCupForRound` is a single choke point that returns `cup` — translate there
and every downstream consumer receives ids that are already local.

**Estimate: 1–2 waves.** The open question that decides which: a consumer audit of
`res.cup`. `computeRyderMatchResult` reads players from both its first argument and
`roundData`, and that has not been checked for uniformity. Roughly an hour, read-only,
and it should be the first thing done if identity is attempted.

**Was name matching considered and rejected?** No evidence. Zero mentions in
`ryder-cup.js`. The pointer-architecture comment explains why a pointer beats copying
the Cup and never addresses identity. Unconsidered, not rejected.

**The Cup must be stricter than Trip Mode.** Trip tolerates soft failure because it
aggregates points; the Cup assigns sides.

- **Duplicate names** ("two Mikes"): Trip silently merges them. The Cup must refuse
  loudly — a guess here is wrong teams.
- **Edited names** ("Manny" → "Manny O"): Trip silently splits the points. For the Cup
  that golfer is absent from the session, and it must be visible.
- **Absent from a round** (sitting out): legitimate. Resolve to "not playing this
  session", not an error.

---

## October — Myrtle Beach, four weeks out

**The plan is the fallback, and it stays the plan until identity is done *and*
dry-run.** Run the trip as five independent single-round Cups — a custom Cup per day's
round — and total points by hand across days. Zero work, already deployed, correct per
day. What's lost is live cumulative standings, which one person can track in the group
chat.

### Work order

**1. Native build.** Measured today:

```
www/app/index.html      last modified Sep 5
repo index.html         last commit   Sep 6
hv-match-hcp-note / playerIdOfRow / RYDER_MATCH_FORMATS / smApplyRyderArrival
                        in www/app: 0 files each
```

**None of today's six fixes exist in the native bundle.** Anyone opening the iOS app at
Myrtle gets none of them. Mechanical, and first.

**2. Offline.** Scores write straight to Firebase. `window.GolfNet.track()` wraps write
promises, so *some* pending/acknowledged tracking exists, but what happens to a score
typed with no signal has never been verified.

**3. Identity**, only if there's room.

### The two checkpoints — locked

**Checkpoint A — the definition of "offline tested".** Exactly this and nothing more:
type a score in airplane mode, observe what the golfer is told, restore signal, confirm
it lands **exactly once**. If it queues and lands, done. **If it is lost or silently
dropped, that becomes the highest-priority wave and everything else waits.**

**Checkpoint B — the fallback dry-run happens before the trip regardless of whether
identity ships.** Five single-round Cups, on real hardware, end to end. Nothing about
this feature has behaved as expected; confirm a custom Cup on a single round actually
banks points before relying on it at a first tee.

---

## Still open, not started

- Cross-round discovery (type the host code) — **blocked on identity**, and dangerous
  without it
- The `m.format` filter — **not required for a Classic Cup**; sessions are
  format-uniform because `rcSeedSession` stamps the session's format on every match.
  It is a prerequisite for the Teams step's per-pairing picker, nothing else
- The Teams step — **not required**; Phase 3B does teams and pairings, and as of v61 it
  renders. The decision already made for it: **no default format, each pairing gets its
  own picker**
- `rcSeedSession` stamps `s.format` on every match it creates — must change if formats
  ever vary per pairing
- `localStorage golfAppRoster` stores player ids and has no reader anywhere in the
  codebase. Left alone deliberately
- The one `todo` in the suite: `points_race_test.js:54` — a product question, not a
  defect. Should a lone finisher in an unfinished round be ranked against a "field of
  one"? Production says yes and awards 1 point; the test asserts nothing until decided
