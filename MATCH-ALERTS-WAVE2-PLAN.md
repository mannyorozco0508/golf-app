# Wave 2 — Big-moment match alerts

Branch `match-alerts-wave2`, cut from `main` `8cf3b90`. **Not for merge before
Oct 17** (Manny's instruction). Suite green on the branch: 10597 tests, 10595
pass, 0 fail, 2 todo. All ten money goldens byte-identical — no money file is
touched by this wave.

## The headline from recon: the plumbing already exists and works

Wave 39 (`c143857`) shipped push end to end and it is **live in production**:
`FCM_SERVICE_ACCOUNT` is readable by the Function, `/api/push-send` is deployed
and answers its preflight, the APNs→FCM token shape is verified in the
database, and the Debug/Release entitlement pair is correct. So **this wave
needs no new push infrastructure from Manny at all** — see "What Manny must set
up" at the bottom, which is shorter than expected for that reason.

The architecture it slots into: `push-notify.js` is a pure decision layer with
no DOM, no db handle, no credential and no network — it decides what to say, to
whom and how often, and the Cloudflare Function holds the key and sends. Every
rule below is therefore testable in plain node.

## Done on the branch (the pure half)

`push-notify.js`, with `match_alerts_test.js` — 19 tests, **3 pass / 16 fail
against the pre-wave file** (the three that pass are the untouched existing
channels).

- **Three kinds on their own `match` channel**: `match-swing` (status change),
  `match-press` (a press starting), `match-decided`. Their own channel rather
  than `bets`, because a golfer who does not want to be asked to accept wagers
  may still want to know his match went all square; one switch for both would
  make him choose.
- **On by default**, per Manny. `pushPrefsNormalise` gains `match: true`.
- **Never your own group's holes**, and it **fails closed**: an unknown or
  missing group on either side refuses with `group-unknown` rather than
  guessing. A one-group round therefore alerts nobody, which is correct — every
  hole is your own.
- **One per hole per MATCH** — `pushMatchThrottleKey(round, matchId, hole)`,
  deliberately not the existing per-golfer key: a golfer in two matches hears
  about both on one hole (two different pieces of news), but one match cannot
  speak twice about one hole while four cards come in.
- **No money mid-round, enforced not trusted.** The templates carry no amounts,
  and the composed line is then scrubbed of any `$N` unless
  `facts.roundFinished`. The facts come from a caller, and a caller can be
  wrong. A decided match quotes the *result* ("Ivy 6&5"), which is how golfers
  say it and is not money.
- **Quiet while viewing** — refuses on `facts.viewing`.
- **Organizer's round-level off switch** — `roundAlertsOff` refuses the match
  kinds only, and a test proves it cannot silence an essential ("you won $40").

## Remaining, in the order I would do it

1. **The trigger.** Nothing yet detects the event. The cheapest correct place
   is the scorecard that posts the hole: after a score write, ask
   `side-match-lines.js` for the match's state before and after, and POST a
   decision per recipient. Needs `playerGroupMap()` (grouping.js) for the
   two group numbers — both already exist, so this is wiring, not new maths.
2. **Recipients and tokens.** `pushTokensFor(uid)` already exists from Wave 39;
   the roster→uid join is `golfapp_me_<code>` → `resolvedMeId()`, also
   existing. Needs the per-match participant list, which `sideMatches` carries
   as `teamAIds`/`teamBIds`.
3. **State to persist**: `alreadySent` and `buzzedHoles` maps per round, so the
   dedupe and throttle survive a reload. Wave 39 established the shape; this
   adds the match-keyed rows and the `database.rules.json` entries for them.
4. **The two toggles in the UI**: "Match alerts" in Account → Notifications
   (beside Bets and Hype) and on the round; the organizer's round switch in
   Setup, writing `events/$code/matchAlertsOff`.
5. **The second half of "quiet while viewing"**, in `push-boot.js`: the only
   thing that truly knows which round is on screen is the screen. The decision
   layer catches a golfer who was there seconds ago; delivery must suppress for
   the one holding it now.
6. **A device check** that drives two browser profiles — one group posts a
   hole, the other golfer's decision is computed — because a unit test cannot
   prove the trigger fires.
7. **Cache bump on merge.** `push-notify.js` is in the offline shell, so
   merging needs the next free `golfapp-v*` and the usual eight re-pins.

## What Manny must set up

**Nothing for push itself** — it is configured and live. Two things only, and
both are optional polish rather than blockers:

- **Nothing required to test on your phone.** Account → Notifications has the
  test button already; once step 4 lands, the Match alerts switch appears there.
- **If you want the alerts to say a golfer's name rather than "Someone"** on a
  cross-group swing, nothing is needed — the roster has the names. Listed only
  so it is not mistaken for missing work.

## Manny's decision, 2026-10-07

**YES — alert for a match you are in even when your PARTNER made the swing.**
It is your match; a four-ball partner holing a putt changes your position as
much as you holing it. The throttle makes it one buzz either way.

**And the other half of that ruling stands unchanged: still never for holes
your own group played.** So the recipient set for a posted hole is every golfer
in the match whose OWN group is not the group that posted it — not just the
golfers on the other side, and not just the one who played the hole.

That is now `matchAlertRecipients()` below, with a test that a partner on the
same side as the scorer is included and that anyone in the scoring group is
excluded whichever side they are on.
