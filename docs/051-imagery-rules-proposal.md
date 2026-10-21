# URGENT-051 Map picture per course: database rules PROPOSAL (NOT PUBLISHED)

Status: **proposal only. Needs Manny's typed OK in Claude Code before anyone publishes it.** Nothing was deployed.

## Why
"Fix the green" saves per-course data at `course_gps/<courseKey>/pins/hN` and `.../lines/hN`. The organizer's
new **Map picture** switch would save at `course_gps/<courseKey>/imagery`. The live rules (`firebase database:get
/.settings/rules --project golfapp-9fb21`, read only, 2026-10-21) have no rule for that child, so every phone's
write is refused (`$other: .write false`).

Until this is published the switch works **on the organizer's phone only**: the pick is kept in
`localStorage hardpan_imagery_v1_<courseKey>` and used for every later round on that course on that phone.
The app does not even try the shared write: `gps-config.js` `imageryShare` is off (absent). After the rule is
live, set `imageryShare: true` and the pick is shared with every phone.

Reads need no change: `course_gps/$courseKey/.read` is already `auth != null`. That is how a record we set
(West Richland, see the report) reaches every phone.

## The change (additive: 1 new child, nothing else touched)
Full file: `docs/051-imagery-rules-PROPOSED.json` (= the live rules + this child). Rollback: the live rules,
`docs/051-imagery-rules-ROLLBACK-live-2026-10-21.json`. `gps_imagery_rules_test.js` proves removing the child
gives back the live rules exactly.

Under `course_gps/$courseKey`:
```json
"imagery": {
  ".write": "<the pins rule's round-on-this-course check> && root.child('events/' + newData.child('ev').val()).child('ownerUid').val() === auth.uid",
  ".validate": "newData.hasChildren(['src', 'at', 'ev']) && newData.child('at').val() <= now + 600000",
  "src": { ".validate": "newData.isString() && newData.val().matches(/^(esri|esri-closeup|usgs)$/)" },
  "at":  { ".validate": "newData.isNumber()" },
  "ev":  { ".validate": "newData.isString() && newData.val().length <= 12" },
  "$other": { ".validate": false }
}
```
- Who can write it: only the **organizer** (the round's `ownerUid`) of a round whose course is this course.
  This is the same course match as `pins`, and the same owner check `pins` uses to change a green.
- What can be written: one of the three words, a time and the round code. No position, no other field.

## Checked in memory (targaryen, nothing published)
- Live today: refused for everyone. Reads are allowed.
- Proposed: the organizer can write all three choices. These are refused: another golfer, signed out, a round
  on another course, "google", an extra field, a future date. `osm` and other children are still refused.

## Publishing (only with Manny's typed OK)
1. Save the live rules again as a rollback copy, and re-read them just before publishing. They must equal
   `docs/051-imagery-rules-ROLLBACK-live-2026-10-21.json`. If they don't, rebuild the proposal on the new
   live rules.
2. Publish `docs/051-imagery-rules-PROPOSED.json`. Read it back and confirm it matches.
3. Ship a build with `imageryShare: true`.
- Rollback: publish the rollback file again. That also needs Manny's typed OK.
