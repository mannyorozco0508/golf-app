# Lifting the 21-day wall for everyone: the rules change, and what it would break (job 015)

**Proposal only. Nothing deployed. `database.rules.json` is untouched.** The diff is `lift-trial-wall.diff` beside this file.

## The change
`events/$eventCode` `.write`, the create branch, loses the window-or-pass condition:

    before: (!data.exists() && auth != null && newData.child('ownerUid').val() === auth.uid && (<firstSeenAt + 21 days > now> || <pass/expiresAt > now>)) || <existing-round branch>
    after:  (!data.exists() && auth != null && newData.child('ownerUid').val() === auth.uid) || <existing-round branch>

**Do NOT paste the repo file into the console.** The repo copy is behind the live rules (it lacks the newer live blocks, e.g. `gps_*`). Publishing it would wipe live subtrees. Make this one clause edit **inside the live rules text** in the console, and nothing else.

## Measured (targaryen, the repo's rules engine, 2026-10-17)
A scenario was run against the current rules and against a patched copy:
- a day-22 organizer creating a round
- a fresh organizer creating one
- a signed-out create
- a create stamped with someone else's uid
- a day-22 organizer, and a signed-out golfer, writing scores to and editing an existing round

| | current rules | lifted copy |
|---|---|---|
| Day-22 organizer creates a new round | refused | **allowed** |
| Fresh organizer (2 days in) creates | allowed | allowed |
| Signed-out create | refused | refused |
| Create under another uid | refused | refused |
| Day-22 organizer writes a score / edits an existing round | allowed | allowed |
| Signed-out golfer writes a score to an existing round | allowed | allowed |

Exactly one row changes. The wall today blocks **only new rounds**, for every platform. Scoring, joining and watching are not gated.

## What it would break or change
1. **`organizer_standing_test.js` goes red** (line 110 pins `+ 1814400000` in `database.rules.json`). That's deliberate: it ties the "Free trial · N days left" line to the rule. Update it in the same change.
2. **The iOS and web copy would lie.** The standing line keeps counting "Free trial · N days left" and then goes silent while creating still works. The wall sentence (prices, "Passes aren't on sale") becomes unreachable dead copy. Both should be hidden on every platform in the same release. Android already hides them (jobs 012/015).
3. **`database.rules.stage2-ownersetup.json`** (the unpublished Stage 2 proposal, built on the live file) carries the same clause. Change it there too, or a later Stage 2 publish brings the wall back.
4. **Monetization lever gone.** Nothing would limit creating rounds until a new rule ships. `firstSeenAt` keeps being written, so the data stays. But **re-adding the same rule later would wall every organizer older than 21 days at once.** A future rule needs a new start date, not `firstSeenAt`.
5. **Abuse:** any anonymous session could create rounds without limit. That's the same as days 1–21 today, with no new exposure class. Course-lookup quotas are separate and unchanged.
6. **Not affected:** trips (they create `events/` rounds through the same rule, so they're lifted too); tournaments (never gated by this clause); passes (still `.write: false`, still meaningless to creation once lifted).
