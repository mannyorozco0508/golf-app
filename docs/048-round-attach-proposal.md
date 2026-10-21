# URGENT-048: round attach when sign-in switches accounts (PROPOSAL ONLY: nothing deployed, nothing written)

## What happens today

- **First sign-in on a phone (the normal case).** The phone has been an anonymous Firebase user since launch (auth-boot.js), and every round it started has `ownerUid` = that uid.
  - oauth-signin.js links the Apple or Google credential onto that anonymous user (`linkWithCredential` on iOS, `linkWithPopup` on the web).
  - email-link-auth.js does the same with `linkWithCredential`.
  - So the uid does not change, and every round stays attached. Nothing needs re-stamping.
  - Tested with a stub Firebase in hp_auth_test.js and hp_auth_chrome_test.js.
- **"Identity already exists".** This happens when the Apple, Google or email identity is already on another HardPan account. Typical causes: the golfer signed in on another phone, or signed out on this one and played more rounds as a new guest. oauth-signin.js then switches the phone to that account (uid B). The rounds started as the guest (uid A) do this:
  - They stay in this phone's History (local snapshots `golfapp_snap_v1_<code>`).
  - Scores, KP, presses, dots and challenges still save: the live rules let any signed-in phone write those.
  - Organizer-only actions are refused (PERMISSION_DENIED) because `ownerUid` is still A. That covers editing round setup, the event-level writes (Venmo / Cash App / Mark paid on a round not in a trip, adding golfers) and deleting the round. The GPS organizer checks (`ownRound`, gps-view's owner test) also read "not mine".
  - The guest's trial or founder pass stays on A (oauth-signin.js already says so in its note).
  - hp-auth.js notes the move on the phone only (`hardpan_auth_moves`), and `HardPanAuth.movedRounds()` lists the affected codes. Nothing is written to the database.

`events/<code>/ownerUid` is immutable in the live rules (`data.exists() && newData.val() === data.val()`), so the client cannot re-stamp it.

## Proposed fix (needs Manny's typed OK before any deploy)

**Recommended: a callable Cloud Function `claimGuestRounds`. It uses the Admin SDK, so the database rules don't change.**

1. Client: oauth-signin.js's switch path, before it calls `signInWithCredential`. While the guest is still `auth.currentUser`, it gets `idTokenA = await user.getIdToken()` and keeps it in memory only.
2. After the switch: call `claimGuestRounds({ guestToken: idTokenA, codes: HardPanAuth.movedRounds().map(r => r.code) })` with B's own bearer token.
3. Server:
   - Verify both tokens. A must be `firebase.sign_in_provider === 'anonymous'` and must not be B.
   - For each code: only if `events/<code>/ownerUid === A`, set it to B. Do the same for `trips/<code>/ownerUid`.
   - First write `ownerMoves/<A>/<code> = { from: A, to: B, at }` (server-only path).
   - Cap the codes per call, e.g. 50.
4. Rollback:
   - Undeploy the function.
   - Run a one-off script that reads `ownerMoves/<A>` and sets each `ownerUid` back to `from`.
   - Delete `ownerMoves`.
   - No rules to roll back.

**Rejected alternative: rules only.** Allow an `ownerUid` change when `organizers/<old>/movedTo === auth.uid`, where `movedTo` is writable only by the old uid. The old (guest) session would have to learn B's uid before switching, which needs a second Firebase app instance and spends the Apple token twice (the build-7 "Duplicate credential" error). It also needs a rules change with its own rollback. Not recommended.

## Not done

No database writes, no rules change, no function, no deploy.
