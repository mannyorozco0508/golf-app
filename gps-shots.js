// ============================================================================
// HARDPAN GPS - SHOT BY SHOT (gps-features, 2026-10-11)
//
// "Mark shots" on the GPS screen: each tap on the map (or "Here") marks where a
// shot finished, on this hole; "Replay round" shows them hole by hole - numbered,
// with the yards each shot went (the first from the tee). Kept ON THIS PHONE
// ONLY (localStorage hardpan_shots_v1_<round>); nothing here writes to Firebase or
// sends a position anywhere. Pure storage + math; gps-view.js draws it.
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : {};
    var KEY = 'hardpan_shots_v1_';
    var MAX_PER_HOLE = 15;
    function lsGet(k) { try { var v = W.localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
    function lsSet(k, v) { try { W.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
    function r6(x) { return Math.round(Number(x) * 1e6) / 1e6; }
    function load(code) { var r = lsGet(KEY + code); return r && r.v === 1 ? r : { v: 1, code: code, holes: {} }; }
    function shots(code, hole) { return (load(code).holes[String(hole)] || []).slice(); }
    // extra (gps-features, one-tap Mark shot): { club, yd, plays, elevFt, wind: { mph, fromDeg,
    // head, cross, kind } } - worked out by gps-view.js at the moment of the tap.
    var CLUBS = ['Dr', '3W', '5W', 'Hy', '3i', '4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'LW', 'Putter'];
    function add(code, hole, pt, how, extra) {
        if (!code || !pt || !isFinite(pt[0]) || !isFinite(pt[1])) return null;
        var r = load(code), k = String(hole);
        r.holes[k] = r.holes[k] || [];
        if (r.holes[k].length >= MAX_PER_HOLE) return null;
        var shot = { p: [r6(pt[0]), r6(pt[1])], at: Date.now(), how: how === 'here' ? 'here' : 'tap' };
        if (extra) Object.keys(extra).forEach(function (f) { if (extra[f] != null) shot[f] = extra[f]; });
        r.holes[k].push(shot);
        r.at = Date.now();
        lsSet(KEY + code, r);
        return r.holes[k].length;
    }
    // The last shot on a hole: its club picked, or its spot moved (and its numbers redone).
    function setLast(code, hole, patch) {
        var r = load(code), k = String(hole), list = r.holes[k];
        if (!list || !list.length) return null;
        var s = list[list.length - 1];
        Object.keys(patch || {}).forEach(function (f) {
            if (f === 'club' && patch.club != null && CLUBS.indexOf(patch.club) === -1) return;
            if (f === 'p' && patch.p) { s.p = [r6(patch.p[0]), r6(patch.p[1])]; return; }
            if (patch[f] == null) delete s[f]; else s[f] = patch[f];
        });
        lsSet(KEY + code, r);
        return s;
    }
    function undo(code, hole) {
        var r = load(code), k = String(hole);
        if (!r.holes[k] || !r.holes[k].length) return 0;
        r.holes[k].pop();
        if (!r.holes[k].length) delete r.holes[k];
        lsSet(KEY + code, r);
        return (r.holes[k] || []).length;
    }
    // Each shot's yards: the first from the tee (when the hole has one), then each
    // from the one before. dist(a, b) in meters (gps-geo.haversineMeters).
    function legs(list, tee, dist) {
        var M_PER_YD = 0.9144, out = [], prev = tee || null;
        list.forEach(function (s) { out.push(prev ? Math.round(dist(prev, s.p) / M_PER_YD) : null); prev = s.p; });
        return out;
    }
    function holesWithShots(code) {
        return Object.keys(load(code).holes).filter(function (k) { return (load(code).holes[k] || []).length; }).map(Number).sort(function (a, b) { return a - b; });
    }
    // ---- MY BAG (008, switch clubs) --------------------------------------------------
    // After a measured shot (Mark shot, the second tap) the golfer may say which club it
    // was. Per golfer (the GPS screen's golfer, by name - the same golfer from round to
    // round), the last 10 yardages per club are kept ON THIS PHONE (hardpan_bag_v1 -
    // yards only, never a position). A club's number = the MEDIAN of those, outliers
    // dropped (outside 1.5 x the interquartile range, once there are 4 or more); a number
    // the golfer typed in My bag wins over it until reset. Nothing here leaves the phone.
    var BAG_KEY = 'hardpan_bag_v1', BAG_LAST = 10;
    var BAG = ['Dr', '3w', '5w', 'Hy', '4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'LW'];
    var BAG_NAMES = { Dr: 'Driver', '3w': '3-wood', '5w': '5-wood', Hy: 'Hybrid', '4i': '4-iron', '5i': '5-iron', '6i': '6-iron', '7i': '7-iron',
        '8i': '8-iron', '9i': '9-iron', PW: 'Pitching wedge', GW: 'Gap wedge', SW: 'Sand wedge', LW: 'Lob wedge' };
    function quantile(sorted, q) {
        var pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
        return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
    }
    // The last 10, outliers dropped, the median: { yd, n (used), of (kept) } or null. Pure.
    function clubAverage(list) {
        var v = (list || []).map(Number).filter(function (x) { return isFinite(x) && x > 0; }).slice(-BAG_LAST);
        if (!v.length) return null;
        var s = v.slice().sort(function (a, b) { return a - b; });
        if (s.length >= 4) {
            var q1 = quantile(s, 0.25), q3 = quantile(s, 0.75), k = 1.5 * (q3 - q1);
            s = s.filter(function (x) { return x >= q1 - k && x <= q3 + k; });
        }
        return { yd: Math.round(quantile(s, 0.5)), n: s.length, of: v.length };
    }
    // THE SUGGESTION: the club whose number is the shortest one that still gets there (>=
    // the distance); none gets there - the longest (the closest). bag: { club: { yd } }. Pure.
    function suggestClub(bag, yards) {
        if (!bag || !isFinite(yards) || yards <= 0) return null;
        var ks = BAG.filter(function (c) { return bag[c] && isFinite(bag[c].yd) && bag[c].yd > 0; });
        if (!ks.length) return null;
        var reach = ks.filter(function (c) { return bag[c].yd >= yards; }).sort(function (a, b) { return bag[a].yd - bag[b].yd; });
        var c = reach.length ? reach[0] : ks.sort(function (a, b) { return bag[b].yd - bag[a].yd; })[0];
        return { club: c, name: BAG_NAMES[c], yd: bag[c].yd };
    }
    function golferKey(name) { var n = String(name || '').trim().toLowerCase().replace(/\s+/g, ' '); return n ? 'n:' + n : 'me'; }
    function bagRec() { var r = lsGet(BAG_KEY); return r && r.v === 1 && r.golfers ? r : { v: 1, golfers: {} }; }
    function bagOf(rec, g) { return rec.golfers[g] || (rec.golfers[g] = { shots: {}, set: {} }); }
    function addClubShot(golfer, club, yd) {
        yd = Math.round(Number(yd));
        if (BAG.indexOf(club) === -1 || !(yd > 0 && yd < 450)) return false;
        var r = bagRec(), b = bagOf(r, golferKey(golfer));
        b.shots[club] = (b.shots[club] || []).concat([yd]).slice(-BAG_LAST);
        return lsSet(BAG_KEY, r);
    }
    // My bag: a number typed in (or null to go back to the shots' median).
    function setClub(golfer, club, yd) {
        if (BAG.indexOf(club) === -1) return false;
        var r = bagRec(), b = bagOf(r, golferKey(golfer));
        yd = Math.round(Number(yd));
        if (yd > 0 && yd < 450) b.set[club] = yd; else delete b.set[club];
        return lsSet(BAG_KEY, r);
    }
    function resetClub(golfer, club) {
        var r = bagRec(), b = bagOf(r, golferKey(golfer));
        delete b.set[club]; delete b.shots[club];
        return lsSet(BAG_KEY, r);
    }
    function resetBag(golfer) { var r = bagRec(); delete r.golfers[golferKey(golfer)]; return lsSet(BAG_KEY, r); }
    // { club: { yd, n, set } } for every club with a number.
    function bag(golfer) {
        var b = bagRec().golfers[golferKey(golfer)] || { shots: {}, set: {} }, out = {};
        BAG.forEach(function (c) {
            var a = clubAverage((b.shots || {})[c]), set = (b.set || {})[c];
            if (set) out[c] = { yd: set, n: a ? a.of : 0, set: true };
            else if (a) out[c] = { yd: a.yd, n: a.of, set: false };
        });
        return out;
    }
    W.HardPanGpsBag = { BAG: BAG, NAMES: BAG_NAMES, clubAverage: clubAverage, suggestClub: suggestClub, golferKey: golferKey,
        add: addClubShot, set: setClub, reset: resetClub, resetAll: resetBag, bag: bag, KEY: BAG_KEY };
    W.HardPanGpsShots = { load: load, shots: shots, add: add, setLast: setLast, undo: undo, legs: legs, holesWithShots: holesWithShots, MAX_PER_HOLE: MAX_PER_HOLE, CLUBS: CLUBS };
})();
