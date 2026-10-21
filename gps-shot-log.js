// ============================================================================
// HARDPAN GPS - THE SHOT LOG (URGENT-049 part 3, 2026-10-21)
//
// Every COUNTED marked shot (a club was picked at the mark) is its own record, kept
// forever (never collapsed into averages - the learned numbers are derived from it and
// can be recomputed). Per golfer (by name, as My bag), ON THIS PHONE
// (localStorage hardpan_shotlog_v1). DISTANCES AND WIND ONLY: a record never holds a
// position - add() keeps only the fields below and drops everything else.
//
// THE RECORD (what add(record) takes; the chips helper builds it at the closing mark):
//   club        'Dr' '3w' '5w' 'Hy' '4i'..'9i' 'PW' 'GW' 'SW' 'LW' (HardPanGpsBag.BAG)
//   carry       yards, mark -> next mark (1-449)
//   windMph     WeatherKit 10 m model wind at the shot (NWS fallback); 0 = calm;
//               null = NO READING at the mark (int-049): relAngle / along / across are then
//               null too - the shot counts for still-air carry, never as a wind or calm point
//   relAngle    where the wind comes FROM, vs the line ball -> CENTER of the green,
//               0-359.9 exact: 0 head, 90 from the right, 180 tail, 270 from the left
//   along       windMph x cos(relAngle): + headwind, - tailwind (mph)
//   across      windMph x sin(relAngle): + from the right, - from the left (mph)
//   tempF       temperature at the shot (or null)
//   elevFt      height change ball -> where it finished, feet (or null)
//   course      course name (text, no position)
//   hole        hole number
//   date        when it was hit (ms since 1970)
//   wxHour      the weather reading's hourly timestamp (ISO text or ms; or null)
//   windFromDeg the raw compass direction the wind came from (0-359.9)
//   bearingDeg  the compass bearing of the reference line ball -> green center
//   golfer      (optional) the golfer's name - the log is per golfer, like My bag
//   src         (optional) 'weatherkit' | 'nws' | 'manual'
//   -- URGENT-052 B (optional; a record from before 052 has none of these and stays valid) --
//   offline     signed yards off the aim line where the ball finished: + = RIGHT of the line,
//               - = LEFT, as the golfer looks toward the aim (handedness is kept apart: hand());
//               null = no line / the end is not a real ball position (endKind 'hole-close')
//   aimKind     'target-ring' (the ring he moved) | 'green-center'
//   endKind     'marked' (the next Mark shot) | 'green' (his fix on the green) |
//               'hole-close' (finishing the hole - ball assumed at the green; leave out of misses)
// add() fills `id` (text) and returns it, or null when the record is not usable.
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : {};
    var KEY = 'hardpan_shotlog_v1';
    var MAX_PER_GOLFER = 6000;   // ~3 seasons of every counted shot; the oldest drop first past this
    var CLUBS = ['Dr', '3w', '5w', 'Hy', '4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'LW'];
    var HANDS = ['R', 'L'];
    var AIM_KINDS = ['target-ring', 'green-center'];
    var END_KINDS = ['marked', 'green', 'hole-close'];
    var OFFLINE_MAX = 150;       // yards either side; a bigger number is not a miss, it is a bad mark
    function lsGet(k) { try { var v = W.localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
    function lsSet(k, v) { try { W.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
    function golferKey(name) {
        try { if (W.HardPanGpsBag && typeof W.HardPanGpsBag.golferKey === 'function') return W.HardPanGpsBag.golferKey(name); } catch (e) {}
        var n = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
        return n ? 'n:' + n : 'me';
    }
    function rec() { var r = lsGet(KEY); return r && r.v === 1 && r.golfers && typeof r.golfers === 'object' ? r : { v: 1, golfers: {} }; }
    function gOf(r, g) { var x = r.golfers[g]; if (!x || typeof x !== 'object') x = r.golfers[g] = {}; if (!Array.isArray(x.shots)) x.shots = []; return x; }
    function num(x) { return typeof x === 'number' && isFinite(x) ? x : (typeof x === 'string' && x.trim() !== '' && isFinite(Number(x)) ? Number(x) : null); }
    function r1(x) { return Math.round(x * 10) / 10; }
    function r2(x) { return Math.round(x * 100) / 100; }
    function deg(x) { x = num(x); if (x === null) return null; x = ((x % 360) + 360) % 360; x = r1(x); return x >= 360 ? 0 : x; }
    function toRad(d) { return d * Math.PI / 180; }
    var seq = 0;
    function newId(t) { seq = (seq + 1) % 1296; return Number(t).toString(36) + '-' + seq.toString(36) + Math.floor(Math.random() * 1296).toString(36); }

    // THE ONLY FIELDS A RECORD KEEPS. Nothing else (no p, lat, lng, point, position).
    function clean(o) {
        o = o || {};
        var club = String(o.club || '');
        if (CLUBS.indexOf(club) === -1) return null;
        var carry = num(o.carry);
        if (carry === null || !(carry > 0 && carry < 450)) return null;
        // No reading (missing / null / negative) stays null - never turned into calm (int-049).
        var mph = num(o.windMph); mph = mph === null || mph < 0 ? null : r1(Math.min(mph, 80));
        var rel = null, along = null, across = null;
        if (mph !== null) {
            rel = deg(o.relAngle);
            if (rel === null && num(o.windFromDeg) !== null && num(o.bearingDeg) !== null) rel = deg(num(o.windFromDeg) - num(o.bearingDeg));
            if (rel === null) rel = 0;
            along = num(o.along); across = num(o.across);
            if (along === null) along = mph * Math.cos(toRad(rel));
            if (across === null) across = mph * Math.sin(toRad(rel));
        }
        var date = num(o.date); if (date === null && o.date) { var d = Date.parse(o.date); date = isFinite(d) ? d : null; }
        var wx = o.wxHour; if (typeof wx === 'number' && isFinite(wx)) wx = new Date(wx).toISOString(); else if (typeof wx === 'string') wx = wx.slice(0, 40); else wx = null;
        var out = {
            club: club, carry: r1(carry), windMph: mph, relAngle: rel, along: along === null ? null : r2(along), across: across === null ? null : r2(across),
            tempF: num(o.tempF) !== null ? r1(num(o.tempF)) : null,
            elevFt: num(o.elevFt) !== null ? r1(num(o.elevFt)) : null,
            course: String(o.course || '').slice(0, 80),
            hole: num(o.hole) !== null ? Math.round(num(o.hole)) : null,
            date: date !== null ? Math.round(date) : Date.now(),
            wxHour: wx,
            windFromDeg: mph === null ? null : deg(o.windFromDeg),
            bearingDeg: deg(o.bearingDeg)
        };
        if (mph !== null && o.src && /^(weatherkit|nws|hourly|manual)$/.test(String(o.src))) out.src = String(o.src);
        if (mph === null) out.src = null;
        // 052 B: the miss. Only when the record says how the shot ended (old records: absent).
        if (END_KINDS.indexOf(o.endKind) !== -1) {
            var offl = num(o.offline);
            out.offline = o.endKind === 'hole-close' || offl === null || Math.abs(offl) > OFFLINE_MAX ? null : r1(offl);
            if (out.offline === 0) out.offline = 0;   // never -0
            out.aimKind = AIM_KINDS.indexOf(o.aimKind) !== -1 ? o.aimKind : 'green-center';
            out.endKind = o.endKind;
        }
        return out;
    }
    function add(o) {
        var c = clean(o);
        if (!c) return null;
        var r = rec(), g = gOf(r, golferKey(o && o.golfer));
        c.id = newId(c.date);
        g.shots.push(c);
        if (g.shots.length > MAX_PER_GOLFER) g.shots.splice(0, g.shots.length - MAX_PER_GOLFER);
        if (!lsSet(KEY, r)) return null;
        syncSaveSoon(golferKey(o && o.golfer));
        return c.id;
    }
    // Swipe-to-delete: the shot with this id, whoever's it is (ids are unique on the phone).
    function remove(id, golfer) {
        if (!id) return false;
        var r = rec(), ks = golfer != null ? [golferKey(golfer)] : Object.keys(r.golfers), hit = false;
        ks.forEach(function (k) {
            var g = r.golfers[k]; if (!g || !Array.isArray(g.shots)) return;
            var n = g.shots.length;
            g.shots = g.shots.filter(function (s) { return s && s.id !== id; });
            if (g.shots.length !== n) hit = true;
        });
        return hit ? lsSet(KEY, r) : false;
    }
    // ---- THE FILTERS (Shot history) -----------------------------------------------
    // strength: calm (< 5 mph) | '5-10' | '10-15' | '15+' (mph, lower bound in).
    // No reading (null): no strength at all - never "calm" (int-049).
    function strengthOf(mph) { if (mph === null || mph === undefined || mph === '' || !isFinite(Number(mph))) return null; mph = Number(mph); return mph < 5 ? 'calm' : mph < 10 ? '5-10' : mph < 15 ? '10-15' : '15+'; }
    // dir: the nearest of head (0) / from the right (90) / tail (180) / from the left (270).
    // A calm shot (under 1 mph) has no direction.
    function dirOf(rel, mph) {
        if (!(Number(mph) >= 1)) return null;
        var a = ((Number(rel) % 360) + 360) % 360;
        return a <= 45 || a > 315 ? 'head' : a < 135 ? 'right' : a <= 225 ? 'tail' : 'left';
    }
    // f: { golfer, club, strength, dir }. Newest first.
    function list(f) {
        f = f || {};
        var g = rec().golfers[golferKey(f.golfer)], out = g && Array.isArray(g.shots) ? g.shots.slice() : [];
        out = out.filter(function (s) {
            if (!s) return false;
            if (f.club && s.club !== f.club) return false;
            if (f.strength && strengthOf(s.windMph) !== f.strength) return false;
            if (f.dir && dirOf(s.relAngle, s.windMph) !== f.dir) return false;
            return true;
        });
        return out.sort(function (a, b) { return (b.date || 0) - (a.date || 0); });
    }
    // { club: [shots, newest first] } for every club with shots.
    function byClub(golfer) {
        var out = {};
        list({ golfer: golfer }).forEach(function (s) { (out[s.club] = out[s.club] || []).push(s); });
        return out;
    }
    function reset(club, golfer) {
        var r = rec(), g = r.golfers[golferKey(golfer)];
        if (!g || !Array.isArray(g.shots)) return true;
        g.shots = club ? g.shots.filter(function (s) { return s && s.club !== club; }) : [];
        var ok = lsSet(KEY, r);
        syncSaveSoon(golferKey(golfer));
        return ok;
    }
    // ---- HANDEDNESS (My bag): 'R' (default) | 'L', stored with the golfer --------------
    function hand(golfer) { var g = rec().golfers[golferKey(golfer)]; return g && g.hand === 'L' ? 'L' : 'R'; }
    function setHand(golfer, h) {
        if (HANDS.indexOf(h) === -1) return false;
        var r = rec(), g = gOf(r, golferKey(golfer));
        g.hand = h;
        return lsSet(KEY, r);
    }
    // Bytes this golfer's log takes on the phone (JSON text, roughly what localStorage holds).
    function bytes(golfer) { var g = rec().golfers[golferKey(golfer)]; try { return g ? JSON.stringify(g).length : 0; } catch (e) { return 0; } }

    // ---- ACCOUNT STORAGE: NONE TODAY ------------------------------------------------
    // The live rules (read 2026-10-21, firebase database:get /.settings/rules) have no
    // path a golfer may write per-golfer data of their own (player_clubs is phase 2 and
    // not live; clubsSync ships false). So the log stays ON THIS PHONE. The proposed rule
    // and its rollback are in docs/049-shotlog-rules-proposal.md. This hook is a no-op
    // until a switch (HARDPAN_GPS_CONFIG.shotLogSync === true) AND that rule exist.
    function syncOn() { try { return !!(W.HARDPAN_GPS_CONFIG && W.HARDPAN_GPS_CONFIG.shotLogSync === true); } catch (e) { return false; } }
    function syncSaveSoon() { /* phone only (see above) */ }

    // 052 B: does this record carry a usable left/right miss? (stage 2 fits only these)
    function hasMiss(s) { return !!(s && s.endKind && s.endKind !== 'hole-close' && typeof s.offline === 'number' && isFinite(s.offline)); }

    W.HardPanShotLog = {
        KEY: KEY, CLUBS: CLUBS, MAX_PER_GOLFER: MAX_PER_GOLFER, AIM_KINDS: AIM_KINDS, END_KINDS: END_KINDS, hasMiss: hasMiss,
        add: add, remove: remove, list: list, byClub: byClub, reset: reset,
        hand: hand, setHand: setHand, strengthOf: strengthOf, dirOf: dirOf, clean: clean, bytes: bytes,
        golferKey: golferKey, syncOn: syncOn
    };
})();
