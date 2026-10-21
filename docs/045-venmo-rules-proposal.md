# URGENT-045 #3 Settle up with Venmo / Cash App: database rules PROPOSAL (NOT PUBLISHED)

Status: **proposal only. Needs Manny's typed OK before anyone publishes it.** Nothing was deployed.

## Why
2.1 part D said its paths were "writable under the LIVE rules". That check ran against the repo's
`database.rules.json`, which is out of date. The real live rules (`firebase database:get /.settings/rules
--project golfapp-9fb21`, read only, 2026-10-20) say:

| Write | Organizer's phone | Another golfer's phone (signed in, anonymous) | Signed out |
|---|---|---|---|
| events/<round>/venmo/<pid>, cashapp/<pid> | allowed | **refused** (round has an owner) | refused |
| events/<round>/settleUp/<key> (Mark paid) | allowed | **refused** | refused |
| trips/<trip>/venmo/<name>, cashapp/<name> | allowed | **refused** | refused |
| (old rounds with no ownerUid) | allowed | allowed | refused |

So today only the organizer's phone can share its usernames or tick "Mark paid". On other phones the card
still shows the payments and the Venmo / Cash App links (when the organizer saved them), a typed username is
kept on that phone, and the card says plainly that only the organizer's phone can save / mark for now.
Nothing breaks either way.

## The change (additive: 5 new child rules, nothing else touched)
Full file: `docs/045-venmo-rules-PROPOSED.json` (= the live rules + these children). A test proves that
removing these 5 children gives back the live rules exactly (`venmo_pay_test.js`).

Under `events/$eventCode`:
```json
"venmo":   { ".write": "auth != null && root.child('events/' + $eventCode).exists()",
             "$playerId": { ".validate": "$playerId.matches(/^[0-9A-Za-z_-]{1,24}$/) && newData.isString() && newData.val().matches(/^[A-Za-z0-9_-]{2,30}$/)" } },
"cashapp": { ".write": "auth != null && root.child('events/' + $eventCode).exists()",
             "$playerId": { ".validate": "$playerId.matches(/^[0-9A-Za-z_-]{1,24}$/) && newData.isString() && newData.val().matches(/^[A-Za-z0-9_-]{1,20}$/)" } },
"settleUp": { ".write": "auth != null && root.child('events/' + $eventCode).exists()",
             "$payKey": { ".validate": "$payKey.matches(/^((bbb|vegas|game)~)?[^~]{1,60}~[^~]{1,60}~[0-9]{1,8}$/) && newData.hasChildren(['by', 'at'])",
                          "by": { ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 24" },
                          "at": { ".validate": "newData.isNumber() && newData.val() <= now" },
                          "$other": { ".validate": false } } }
```
Under `trips/$tripCode`:
```json
"venmo":   { ".write": "auth != null && root.child('trips/' + $tripCode).exists()",
             "$nameKey": { ".validate": "$nameKey.matches(/^[^~]{1,60}$/) && newData.isString() && newData.val().matches(/^[A-Za-z0-9_-]{2,30}$/)" } },
"cashapp": { ".write": "auth != null && root.child('trips/' + $tripCode).exists()",
             "$nameKey": { ".validate": "$nameKey.matches(/^[^~]{1,60}$/) && newData.isString() && newData.val().matches(/^[A-Za-z0-9_-]{1,20}$/)" } }
```
Same shape as the existing `scores` / `kpLeaders` rules: any signed-in golfer, only on a round / trip that
exists. Mark paid can be written by anyone with the round open (Manny's default answer, question 3).

## Checked in memory (targaryen, nothing published)
- Signed-in golfer: every Settle up write allowed. Signed out: all refused.
- Still refused for a golfer: a round / trip that doesn't exist; a bad username; a too-long cashtag; an extra
  field in a tick; a tick dated in the future; a key that isn't a payment; round fields (courseName,
  ownerUid); trip fields (tripName).
- Scores still work exactly as before.

## Data / privacy
Only a Venmo username / Cash App $cashtag the golfer typed, and `{ by: <player id>, at: <time> }` per paid
tick. No amounts beyond the key, no location, no payment data. Round data is already public-read
(`events/$eventCode/.read: true`), so a username saved to a round is readable by anyone with the round code,
the same as the golfers' names. Privacy / App Review wording: `docs/2.1-venmo-privacy-review-DRAFT.md`.

## To publish (ONLY after Manny types OK)
```sh
firebase database:get /.settings/rules --project golfapp-9fb21 > /tmp/rules-before.json
diff <(jq -S . /tmp/rules-before.json) <(jq -S . docs/045-venmo-rules-ROLLBACK-live-2026-10-20.json)   # must be empty; if not, STOP and re-base the proposal
firebase database:set /.settings/rules docs/045-venmo-rules-PROPOSED.json --project golfapp-9fb21
```

## Rollback
```sh
firebase database:set /.settings/rules docs/045-venmo-rules-ROLLBACK-live-2026-10-20.json --project golfapp-9fb21
```
`docs/045-venmo-rules-ROLLBACK-live-2026-10-20.json` is the live rules exactly as read on 2026-10-20.
Rolling back leaves any saved usernames / ticks in place (harmless; the organizer's phone can still edit them).
