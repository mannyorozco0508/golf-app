# HardPan GPS — Phase 2 plan (not built)

Phase 1 (branch `gps-v1`) gives every hole a GPS screen. Phase 2 ties it into
the games. Same guards apply: nothing touches the money engines or rules publish
without an explicit go, and no location leaves the phone except under the
group-locator opt-in below.

## 1. KP by GPS

- On a KP hole the GPS screen shows **"Mark my KP"** (only for golfers the
  device may score for — same `canSetKpLeader` gate as today).
- Golfer stands at the ball → tap → one reading. Wait for accuracy ≤ 5 yds
  (or take the best of ~5 s of fixes) and show "± N ft" with it.
- Distance = haversine(ball, **hole location**). Needs a pin position, not the
  green middle: either tap the flag on the map, or the marker stands at the cup
  and taps "Cup is here" once per hole per day. Without a cup point, KP by GPS
  is not offered (green-middle distance is not a KP measure).
- Result feeds the **existing KP flow** as the distance field
  (`kpLeaders/h<N>`); the existing "a later group beats the marker" logic stays
  the decider. GPS distance is evidence, not the judge.
- Organizer override: the existing KP edit path, unchanged.
- Privacy: the stored value is a **distance** (feet/inches), never the
  coordinates.
- Money: KP payouts read `kpWinners` exactly as now — **no money engine change**.
  If any engine change turns out to be needed, it stops for approval.

## 2. Long Drive side bet

- New side-bet type "Long Drive (hole N)". Golfer marks the ball on the fairway
  from the GPS screen; distance = haversine(tee, ball). Tee point = OSM tee for
  that hole, or the golfer marks "I'm on the tee" before hitting (stored as a
  distance later, not a point).
- "In the fairway" check against OSM `golf=fairway` polygons where mapped;
  otherwise the group confirms.
- Settlement is a new bet type → touches settlement → **STRICT lane**, recon
  first, needs Manny's go.

## 3. Organizer group-locator map (opt-in)

- The only feature that sends a location off the phone. **Off by default**, per
  round, per scorekeeper, with an explicit "Share my group's position with the
  organizer for this round" toggle and a visible "Sharing" badge while on.
- Scorekeeper device writes `events/<code>/locator/g<N> = { lat, lng, acc, at }`
  at most every 60 s while the scorecard is open (foreground only — no
  background location, same Info.plist key).
- Organizer sees one dot per group on the course map plus "last seen 2 min ago".
- Cleared automatically when the round finishes (write `null` on Finish Round
  and on toggle off). Needs a rules addition (read: organizer only) — rules
  publish is Manny's step.
- Privacy policy (`privacy.html`) must be updated before this ships; it is
  currently accurate for Phase 1 (nothing leaves the phone).

## 4. Pace of play

- Built on the locator: per group, hole they are on (nearest hole line to their
  dot) and minutes on that hole vs. a target (e.g. 14 min/hole, 4:15 round).
- Organizer view: groups behind pace in amber. Scorekeeper view: "You're 6 min
  behind the group ahead" only if the organizer turns that on.
- No locator opt-in → no pace for that group; it falls back to hole-of-last-score
  timing, which needs no location at all and could ship first.

## Prerequisites carried over from Phase 1

- Esri key created and referrer-tested on iOS (see `docs/gps-step0.md` §2).
- `course_gps` rule published, so greens set once serve every later round.
- Decision on tapped greens vs. Esri terms (`docs/gps-step0.md` §5).
- Capacitor Geolocation plugin + new iOS build if the in-app web view's
  location prompt proves unreliable (Phase 1 uses the web view's own
  `navigator.geolocation`).
