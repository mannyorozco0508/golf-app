// ============================================================================
// HARDPAN GPS - MARK SHOT CLUB CHIPS (URGENT-049 part 1, 2026-10-21)
//
// "Mark shot" marks where the ball IS. Each mark:
//   1. closes the shot before it (its carry = this mark -> the one before, gps-geo
//      haversine), and
//   2. opens the next one, with a chip row in the bottom bar: "Hitting 7-iron? · 149
//      to the green" - the likely club pre-selected from My bag, one tap to change, Skip.
// A shot COUNTS only when a club was picked (the pre-selected one stands unless the
// golfer taps Skip). Skip = position only: the mark still closes the shot before it (the
// ball is here), but it is never a data point itself. Reaching the green or finishing
// the hole closes the last open shot.
//
// A counted shot, once closed, goes to HardPanShotLog.add() (gps-shot-log.js, part 3):
// club, carry, the wind AT THE MARK (WeatherKit, NWS fallback; its hourly timestamp),
// the bearing ball -> CENTER of the green (per shot), the wind's angle to that line
// (HardPanWindLearn.relAngle, part 2) with its along / across parts, temperature,
// elevation change, course, hole, date. NEVER a coordinate: the marks live in memory
// on this phone only while a shot is open and are not in the record.
// Pure (no DOM); gps-view.js draws the chip row.
//
// URGENT-052 B stage 1 - THE LEFT / RIGHT MISS (`offline`), worked out at the closing mark from
// the in-memory marks only, then the positions are dropped like before:
//   offline  signed yards off the AIM LINE where the ball finished: + = RIGHT of the line,
//            - = LEFT, as the golfer looks down the line toward the aim (the same for a right-
//            or a left-hander - handedness is kept separately, HardPanShotLog.hand).
//   aimKind  'target-ring'  - the golfer moved the target ring for this shot (moved while he
//                             stood within AIM_NEAR_YD of where he marked it), the line runs
//                             ball -> the ring;
//            'green-center' - otherwise, ball -> the CENTER of the green (as the wind angle).
//   endKind  'marked'      - closed by the next Mark shot (the ball really is there);
//            'green'       - closed by the golfer's own GPS fix on the green;
//            'hole-close'  - closed by finishing the hole (a score / auto-advance): the ball is
//                            only ASSUMED at the green's center, so offline is null and stage 2
//                            leaves these out (the carry still counts, as in 049).
// Old records (before 052) have none of the three and stay valid.
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : {};
    var M_PER_YD = 0.9144;
    var AIM_NEAR_YD = 40;        // a ring moved within this of the shot's mark is that shot's aim
    var AIM_MIN_YD = 5;          // an aim closer than this to the ball gives no line
    var END_KINDS = ['marked', 'green', 'hole-close'];
    function num(x) { return typeof x === 'number' && isFinite(x) ? x : null; }
    function norm(d) { d = ((d % 360) + 360) % 360; d = Math.round(d * 10) / 10; return d >= 360 ? 0 : d; }

    // ---- WIND MATH: part 2's HardPanWindLearn (gps-wind-learn.js). Convention: 0 = headwind,
    // 90 from the right, 180 tail, 270 from the left. Not loaded: the record still carries
    // windFromDeg / bearingDeg / windMph and HardPanShotLog.add() works the angle out itself.
    function learn() { var L = W.HardPanWindLearn; return L && typeof L.relAngle === 'function' && typeof L.components === 'function' ? L : null; }
    function log() { var L = W.HardPanShotLog; return L && typeof L.add === 'function' ? L : null; }

    // The reading's hourly timestamp: the observation's time (else when it was read), on the hour, ISO.
    function wxHour(w) {
        var t = w ? (num(w.obsAt) != null ? w.obsAt : num(w.at)) : null;
        if (t == null) return null;
        var d = new Date(t); d.setUTCMinutes(0, 0, 0);
        return d.toISOString();
    }
    // 'weatherkit' | 'nws' (station obs or the hourly forecast) | 'manual' (the golfer's dial).
    function srcOf(w) {
        if (!w || w.none) return null;
        if (w.manual) return 'manual';
        return w.src === 'weatherkit' ? 'weatherkit' : (w.src === 'obs' || w.src === 'hourly' || w.src === 'nws') ? 'nws' : null;
    }

    // THE LIKELY CLUB: My bag's carries vs the (plays-like) yards to the green - the shortest
    // club that still gets there, else the longest (HardPanGpsBag.suggestClub). null: no bag.
    function likelyClub(bagApi, golfer, yards) {
        try {
            if (!bagApi || !(yards >= 10)) return null;
            var s = bagApi.suggestClub(bagApi.bag(golfer), yards);
            return s ? s.club : null;
        } catch (e) { return null; }
    }

    // THE MISS OFF THE AIM LINE (052 B): signed yards, + = right of the line from `from`
    // toward `aim`, for the golfer looking down it. dist(a, b) -> meters, bearing(a, b) -> deg.
    // null when there is no line (no aim, aim on top of the ball) or no end.
    function offlineYd(from, aim, end, dist, bearing) {
        if (!from || !aim || !end || typeof dist !== 'function' || typeof bearing !== 'function') return null;
        var aimYd = dist(from, aim) / M_PER_YD, endYd = dist(from, end) / M_PER_YD;
        if (!(aimYd >= AIM_MIN_YD) || !isFinite(endYd)) return null;
        if (endYd < 0.5) return 0;
        var a = bearing(from, aim), b = bearing(from, end);
        if (num(a) == null || num(b) == null) return null;
        var v = endYd * Math.sin((b - a) * Math.PI / 180);
        v = Math.round(v * 10) / 10;
        return v === 0 ? 0 : v;   // never -0
    }

    // THE RECORD for a closed, counted shot. open: the shot as marked; carryYd; endElevFt;
    // miss (052 B): { offline, aimKind, endKind } or nothing (an old caller).
    // Only distances, wind and labels - never open.pt / open.green / open.aim.
    function buildRecord(open, carryYd, endElevFt, miss) {
        var w = open.wind && !open.wind.none && num(open.wind.mph) != null ? open.wind : null;
        // int-049: no reading at the mark = windMph null (and src null) - NOT 0 / calm. The shot
        // still counts for still-air carry; it is never a wind data point or a calm one.
        var L = learn(), mph = w ? w.mph : null;
        var fromDeg = w && num(w.fromDeg) != null ? norm(w.fromDeg) : null;
        var brg = num(open.bearingDeg) != null ? norm(open.bearingDeg) : null;
        var rel = L && fromDeg != null && brg != null ? L.relAngle(fromDeg, brg) : null;
        var c = rel != null && mph != null ? L.components(mph, rel) : null;
        var rec = {
            club: open.club,
            carry: Math.round(carryYd),
            windMph: mph,
            windFromDeg: fromDeg,
            bearingDeg: brg,
            relAngle: rel,
            along: c ? Math.round(c.along * 100) / 100 : null,
            across: c ? Math.round(c.across * 100) / 100 : null,
            tempF: w && num(w.tempF) != null ? w.tempF : (open.wind && num(open.wind.tempF) != null ? open.wind.tempF : null),
            elevFt: num(open.elevFt) != null && num(endElevFt) != null ? Math.round((endElevFt - open.elevFt) * 10) / 10 : null,
            course: String(open.course || ''),
            hole: open.hole,
            date: open.at,
            wxHour: wxHour(w),
            src: w ? srcOf(open.wind) : null
        };
        if (open.golfer) rec.golfer = open.golfer;
        if (miss && END_KINDS.indexOf(miss.endKind) !== -1) {
            rec.offline = miss.endKind === 'hole-close' || num(miss.offline) == null ? null : miss.offline;
            rec.aimKind = miss.aimKind === 'target-ring' ? 'target-ring' : 'green-center';
            rec.endKind = miss.endKind;
        }
        if (rec.relAngle == null) { delete rec.relAngle; delete rec.along; delete rec.across; }
        return rec;
    }

    // THE TRACKER - one per GPS screen. deps: { dist(a, b) -> meters, bearing(a, b) -> deg,
    // now() }. One shot open at a time.
    function create(deps) {
        deps = deps || {};
        var dist = deps.dist, bearing = deps.bearing, now = deps.now || function () { return Date.now(); };
        var open = null, lastId = null;
        // Close the open shot with the ball at pt (a mark, the green, the hole's end). A shot
        // with a club goes to the log; one without (Skip) is dropped. Returns { counted, id,
        // record, carry } or null (nothing open). endKind (052 B): 'marked' (default) |
        // 'green' | 'hole-close'.
        function close(pt, endElevFt, endKind) {
            var o = open;
            open = null;
            if (!o) return null;
            var carry = pt && dist ? dist(o.pt, pt) / M_PER_YD : null;
            var out = { counted: false, id: null, record: null, carry: carry != null ? Math.round(carry) : null, club: o.club || null, hole: o.hole };
            if (!o.club || !(carry >= 1 && carry < 450)) return out;
            var ek = END_KINDS.indexOf(endKind) !== -1 ? endKind : 'marked';
            var line = o.aim || o.green;
            var miss = { endKind: ek, aimKind: o.aim ? 'target-ring' : 'green-center',
                offline: ek === 'hole-close' ? null : offlineYd(o.pt, line, pt, dist, bearing) };
            var rec = buildRecord(o, carry, endElevFt, miss);
            var Lg = log(), id = Lg ? Lg.add(rec) : null;
            out.record = rec; out.id = id; out.counted = id != null; lastId = id;
            return out;
        }
        // A mark at pt. info: { hole, green (the hole's green CENTER), wind (the wind
        // source's reading now), elevFt (the height here, or null), course, golfer, club
        // (pre-selected, or null), noOpen (on the green / tournament: close only),
        // ring (052 B: { pt, from } - the moved target ring and where the golfer stood when he
        // moved it; null = not moved) }. Returns { closed, open }.
        function mark(pt, info) {
            info = info || {};
            var closed = close(pt, info.elevFt, 'marked');
            if (!info.noOpen && pt) {
                open = { pt: [pt[0], pt[1]], hole: info.hole, at: now(), club: info.club || null,
                    green: info.green ? [info.green[0], info.green[1]] : null,
                    bearingDeg: info.green && bearing ? bearing(pt, info.green) : null,
                    wind: info.wind ? Object.assign({}, info.wind) : null,
                    elevFt: num(info.elevFt), course: info.course || '', golfer: info.golfer || '', aim: null };
                aim(info.ring || null, pt);
            }
            return { closed: closed, open: open ? view() : null };
        }
        function view() { return open ? { hole: open.hole, club: open.club, bearingDeg: open.bearingDeg, at: open.at, aimKind: open.aim ? 'target-ring' : 'green-center' } : null; }
        // THE AIM of the open shot (052 B). ring: { pt, from } (the moved target ring and where
        // the golfer stood when he moved it) or null (not moved / put back). here: the golfer
        // now. Only while he is still at the ball (within AIM_NEAR_YD of the mark) - once he has
        // walked on, the ring is for his next shot. A ring moved from somewhere else (left over
        // from the shot before) is not this shot's aim. Returns the aim kind now.
        function near(a, b) { return !!(a && b && dist && dist(a, b) / M_PER_YD <= AIM_NEAR_YD); }
        function aim(ring, here) {
            if (!open) return null;
            if (here && !near(open.pt, here)) return open.aim ? 'target-ring' : 'green-center';
            if (!ring || !ring.pt) open.aim = null;
            else if (near(open.pt, ring.from)) open.aim = [ring.pt[0], ring.pt[1]];
            return open.aim ? 'target-ring' : 'green-center';
        }
        return {
            mark: mark,
            close: close,
            aim: aim,
            pick: function (club) { if (open) open.club = club || null; return view(); },
            skip: function () { if (open) open.club = null; return view(); },
            discard: function () { open = null; },
            open: view,
            // Where the open shot's ball is / its green (memory only; for the green check).
            openPt: function () { return open ? open.pt.slice() : null; },
            openGreen: function () { return open && open.green ? open.green.slice() : null; },
            lastId: function () { return lastId; }
        };
    }

    // DELETE A SHOT MARKED BY MISTAKE: ONE PATH (int-049). The Shot history sheet (gps-shot-bag.js,
    // part 3: swipe a row left, tap Delete) is the only list and the only swipe; it removes through
    // HardPanShotLog.remove once. remove(id) here is the same call for code that holds an id
    // (e.g. the last counted shot). The chips' own swipe handler (data-shot-id rows) is gone - no
    // list ever used it, and two swipe handlers on one row could delete twice.
    function remove(id, golfer) { var L = log(); if (!L || !id || typeof L.remove !== 'function') return false; return L.remove(id, golfer) !== false; }

    var api = { create: create, buildRecord: buildRecord, likelyClub: likelyClub, wxHour: wxHour, srcOf: srcOf,
        remove: remove, offlineYd: offlineYd, M_PER_YD: M_PER_YD, AIM_NEAR_YD: AIM_NEAR_YD, END_KINDS: END_KINDS };
    W.HardPanMarkChips = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
