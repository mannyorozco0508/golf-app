# URGENT-049 shot log: database rules PROPOSAL (NOT PUBLISHED)

Status: **proposal only. Needs Manny's typed OK before anyone publishes it.** Nothing was deployed.
The shot log ships PHONE ONLY (localStorage `hardpan_shotlog_v1`).

## Why
The brief: keep the log with the golfer's account when signed in, ONLY if a path the live rules already
allow exists. Live rules read 2026-10-21 (`firebase database:get /.settings/rules --project golfapp-9fb21`,
read only; identical to the 2026-10-20 snapshot in docs/045-venmo-rules-ROLLBACK-live-2026-10-20.json):
- top level is `events trips seasons tournaments registrations organizers global_courses app_settings
  sharedGroups pushTokens pushPrefs gps_courses gps_links gps_usage course_gps gps_meta` + `$other: false`;
- no `player_clubs` (phase 2, never published), no per-golfer stats path;
- `pushPrefs/<uid>` takes only `bets` / `hype` booleans; `organizers/<uid>` only firstSeenAt / pass / groups;
- `pushTokens/<uid>/<device>` is validated to token / playerId / at.
So there is NO live path a golfer can write their own shot log to. Phone only for now.

## The change (additive: ONE new top-level block, nothing else touched)
Full file: `docs/049-shotlog-rules-PROPOSED.json` (= the live rules + `player_shots`).
Rollback: `docs/049-shotlog-rules-ROLLBACK-live-2026-10-21.json` (the live rules as read today).

`player_shots/$uid` - read and write only by that signed-in user (`auth.uid === $uid`):
- `me/hand`: 'R' | 'L'
- `me/shots/$shotId`: exactly the record fields - club (bag keys), carry 1-449, windMph 0-80,
  relAngle 0-359.9, along / across -80..80, tempF, elevFt, course (<= 80 chars), hole, date (<= now),
  wxHour, windFromDeg, bearingDeg, src. Anything else (`$other`) is refused - so no lat / lng / point
  can ever be written. The record's id is the key ($shotId), not a field.

Turning it on later = publish this file, then flip `HARDPAN_GPS_CONFIG.shotLogSync` (not built to write
yet: gps-shot-log.js's sync hook is a no-op today).

## Size
One record is ~280 bytes of JSON (measured, every field filled). A season of ~40 rounds x ~25 counted shots = ~1,000 shots
= ~280 KB per golfer (phone or account). The phone keeps up to 6,000 shots per golfer (~1.7 MB),
oldest dropped first past that.
