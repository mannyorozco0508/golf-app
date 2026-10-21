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
// Pure (no DOM) except swipeDelete(); gps-view.js draws the chip row.
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : {};
    var M_PER_YD = 0.9144;
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

    // THE RECORD for a closed, counted shot. open: the shot as marked; carryYd; endElevFt.
    // Only distances, wind and labels - never open.pt / open.green.
    function buildRecord(open, carryYd, endElevFt) {
        var w = open.wind && !open.wind.none && num(open.wind.mph) != null ? open.wind : null;
        var L = learn(), mph = w ? w.mph : 0;
        var fromDeg = w && num(w.fromDeg) != null ? norm(w.fromDeg) : null;
        var brg = num(open.bearingDeg) != null ? norm(open.bearingDeg) : null;
        var rel = L && fromDeg != null && brg != null ? L.relAngle(fromDeg, brg) : null;
        var c = rel != null ? L.components(mph, rel) : null;
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
            src: srcOf(open.wind)
        };
        if (open.golfer) rec.golfer = open.golfer;
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
        // record, carry } or null (nothing open).
        function close(pt, endElevFt) {
            var o = open;
            open = null;
            if (!o) return null;
            var carry = pt && dist ? dist(o.pt, pt) / M_PER_YD : null;
            var out = { counted: false, id: null, record: null, carry: carry != null ? Math.round(carry) : null, club: o.club || null, hole: o.hole };
            if (!o.club || !(carry >= 1 && carry < 450)) return out;
            var rec = buildRecord(o, carry, endElevFt);
            var Lg = log(), id = Lg ? Lg.add(rec) : null;
            out.record = rec; out.id = id; out.counted = id != null; lastId = id;
            return out;
        }
        // A mark at pt. info: { hole, green (the hole's green CENTER), wind (the wind
        // source's reading now), elevFt (the height here, or null), course, golfer, club
        // (pre-selected, or null), noOpen (on the green / tournament: close only) }.
        // Returns { closed, open }.
        function mark(pt, info) {
            info = info || {};
            var closed = close(pt, info.elevFt);
            if (!info.noOpen && pt) {
                open = { pt: [pt[0], pt[1]], hole: info.hole, at: now(), club: info.club || null,
                    green: info.green ? [info.green[0], info.green[1]] : null,
                    bearingDeg: info.green && bearing ? bearing(pt, info.green) : null,
                    wind: info.wind ? Object.assign({}, info.wind) : null,
                    elevFt: num(info.elevFt), course: info.course || '', golfer: info.golfer || '' };
            }
            return { closed: closed, open: open ? view() : null };
        }
        function view() { return open ? { hole: open.hole, club: open.club, bearingDeg: open.bearingDeg, at: open.at } : null; }
        return {
            mark: mark,
            close: close,
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

    // DELETE A SHOT MARKED BY MISTAKE (the shot list is part 3's): remove(id) calls
    // HardPanShotLog.remove. swipeDelete(listEl, onDone) makes every row with data-shot-id
    // swipe-left-to-delete (past 80 px, or a fast flick past 40) - the hook part 3's list uses.
    function remove(id, golfer) { var L = log(); if (!L || !id || typeof L.remove !== 'function') return false; return L.remove(id, golfer) !== false; }
    function swipeDelete(listEl, onDone) {
        if (!listEl || listEl.__hpSwipe) return;
        listEl.__hpSwipe = true;
        var row = null, x0 = 0, y0 = 0, t0 = 0, dx = 0, horiz = null;
        listEl.addEventListener('pointerdown', function (e) {
            row = e.target && e.target.closest ? e.target.closest('[data-shot-id]') : null;
            if (!row) return;
            x0 = e.clientX; y0 = e.clientY; t0 = Date.now(); dx = 0; horiz = null;
        });
        listEl.addEventListener('pointermove', function (e) {
            if (!row) return;
            var mx = e.clientX - x0, my = e.clientY - y0;
            if (horiz === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) horiz = Math.abs(mx) > Math.abs(my);
            if (!horiz) return;
            dx = Math.min(0, mx);
            row.style.transform = 'translateX(' + dx + 'px)';
        });
        function end() {
            if (!row) return;
            var r = row, fast = Date.now() - t0 < 250 && dx < -40;
            row = null;
            if (horiz && (dx < -80 || fast)) {
                var id = r.getAttribute('data-shot-id');
                if (remove(id, r.getAttribute('data-shot-golfer') || undefined)) {
                    r.style.transition = 'transform .15s'; r.style.transform = 'translateX(-110%)';
                    setTimeout(function () { if (r.parentNode) r.parentNode.removeChild(r); if (onDone) onDone(id); }, 160);
                    return;
                }
            }
            r.style.transition = 'transform .15s'; r.style.transform = '';
            setTimeout(function () { r.style.transition = ''; }, 160);
        }
        listEl.addEventListener('pointerup', end);
        listEl.addEventListener('pointercancel', end);
    }

    var api = { create: create, buildRecord: buildRecord, likelyClub: likelyClub, wxHour: wxHour, srcOf: srcOf,
        remove: remove, swipeDelete: swipeDelete, M_PER_YD: M_PER_YD };
    W.HardPanMarkChips = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
