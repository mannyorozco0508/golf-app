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
    W.HardPanGpsShots = { load: load, shots: shots, add: add, setLast: setLast, undo: undo, legs: legs, holesWithShots: holesWithShots, MAX_PER_HOLE: MAX_PER_HOLE, CLUBS: CLUBS };
})();
