# PLAN ONLY — database rules to ENFORCE spectators and scorekeepers (after Oct 17)

**Not deployed. Not for this branch.** HardPan's `gps-share` (2026-10-13) does this in the app only:
a round opened by game code or spectator link is view-only, and a group with a scorekeeper code
needs that code to enter scores. Anyone with a modified client can still write today, because
`database.rules.json` lets any signed-in session write to an existing round. This is the plan for
the main session to make the database itself refuse it, after the trip.

## What exists today (database.rules.json, `events/$eventCode`)

- `.read: true` — anyone reads a round (that stays: spectators must see it live).
- `.write`: create = signed-in owner; **update = anyone, as long as the round exists**
  (`data.exists() && (newData.exists() || …)`). A round is deleted only by its owner.
- Children with their own rules: `scores` and others listed in the file. There is no per-group rule.

## The model to enforce

| Who | How they are recognised in the database | May write |
|---|---|---|
| Organizer | `auth.uid === data.ownerUid` (and `organizers/<uid>`) | everything, as now |
| Scorekeeper of group N | holds a **grant**: `events/<code>/scorekeepers/<auth.uid> = N`, written when they present the right code | `scores/p<id>_h<hole>` for golfers in group N only |
| Playing golfer | (optional) `events/<code>/members/<auth.uid> = playerId` | their own notification / "who am I" rows only |
| Spectator | anyone else | nothing |

## The pieces

1. **Codes become grants.** Today the app stores `scoreKeys/<N>` = SHA-256 of the code and compares
   on the phone. Rules cannot hash, so the grant is made by a **Cloud Function** (`claimScorekeeper`,
   callable): it checks the code against the stored hash and writes
   `events/<code>/scorekeepers/<uid> = N`. Revoke = the organizer deletes the hash (and the grants
   for that group). Rule: `scorekeepers` writable only by the owner or the function (admin).
2. **Group membership in the rules.** A score key is `p<playerId>_h<hole>`. The rules need to know a
   player's group. Store it explicitly when the round is saved: `events/<code>/playerGroup/<playerId>
   = N` (Round Setup / the trip builder write it; old rounds without it keep today's behaviour).
3. **Score rule** (`events/$code/scores/$key`), roughly:
   ```
   ".write": "auth != null && (
       root.child('events/'+$code+'/ownerUid').val() === auth.uid
    || ( root.child('events/'+$code+'/scorekeepers/'+auth.uid).exists()
         && root.child('events/'+$code+'/playerGroup/'+ $key.replace(/^p(\\d+)_h\\d+$/, '$1') ) ... )"
   ```
   Firebase rules can't run a regex replace on `$key`, so the score shape changes to
   `scores/$playerId/$hole` **or** each score key gets its group written alongside
   (`scoreGroups/<key> = N`, validated against `playerGroup`). Pick one in the main session; the
   second keeps every existing reader working.
4. **Everything else in a round** (setup, players, side bets, money pools, `additionalGameInstances`,
   delete): owner only, plus the specific children that playing golfers legitimately write today
   (to be listed from the code: `sideMatches` challenges/accepts, `kpGroupAnswers`, `wolfCalls`,
   `dots`, presses — each needs its own rule, or it breaks a working feature).
5. **Spectators** then need nothing: no grant, no ownership = no write.

## Order and risk

- **Biggest risk: breaking scoring mid-round.** Every client that writes a score today must be on a
  build that claims a grant first. Builds 12-14 and the current web app do not. So: ship the claiming
  client (app + web) first, wait until no older client is in use, then deploy the rules.
- Trips: the trip builder creates rounds for the organizer; it must also write `playerGroup`.
- Legacy rounds (no `playerGroup`): keep today's rule for them (rounds created before the cut-over).
- Test in a separate Firebase project (the plan already noted after Oct 16) with the existing
  Chrome checks pointed at the emulator, before touching production.
- Rules are deployed by the main session only; HardPan never deploys rules.
