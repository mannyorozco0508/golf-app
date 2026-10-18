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
    // the golfer typed in My bag wins over it until reset. Nothing here leaves the phone -
    // except the account sync below (009), which ships switched OFF (clubsSync: false).
    var BAG_KEY = 'hardpan_bag_v1', BAG_LAST = 10;
    var BAG = ['Dr', '3w', '5w', 'Hy', '4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'LW'];
    var BAG_NAMES = { Dr: 'Driver', '3w': '3-wood', '5w': '5-wood', Hy: 'Hybrid', '4i': '4-iron', '5i': '5-iron', '6i': '6-iron', '7i': '7-iron',
        '8i': '8-iron', '9i': '9-iron', PW: 'Pitching wedge', GW: 'Gap wedge', SW: 'Sand wedge', LW: 'Lob wedge' };
    // 012: the short name a pill shows ("Plays like 249y · 3W").
    var BAG_SHORT = { Dr: 'Dr', '3w': '3W', '5w': '5W', Hy: 'Hy', '4i': '4i', '5i': '5i', '6i': '6i', '7i': '7i', '8i': '8i', '9i': '9i', PW: 'PW', GW: 'GW', SW: 'SW', LW: 'LW' };
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
        delete b.set[club]; delete b.shots[club]; if (b.base) delete b.base[club];
        return lsSet(BAG_KEY, r);
    }
    function resetBag(golfer) { var r = bagRec(); delete r.golfers[golferKey(golfer)]; return lsSet(BAG_KEY, r); }
    // ---- FIRST-TIME SETUP (009, switch bagSetup) ------------------------------------
    // "Enter your carry for each club": the golfer's handicap gives a starting carry per
    // club (this table, scratch / 10 / 20 / 30, straight-line in between; under 0 = scratch,
    // over 30 = 30), every one editable. They are a STARTING POINT ("entered"): once a club
    // has LEARN_MIN marked shots of its own, the shots' median ("learned") takes over. A
    // number typed in My bag later still wins over both (as in 008).
    var DEFAULT_HCPS = [0, 10, 20, 30];
    var DEFAULT_CARRY = {
        Dr: [260, 235, 210, 185], '3w': [235, 212, 190, 170], '5w': [220, 198, 178, 160], Hy: [210, 188, 170, 152],
        '4i': [200, 178, 160, 142], '5i': [190, 170, 152, 135], '6i': [180, 160, 143, 127], '7i': [170, 150, 134, 118],
        '8i': [160, 140, 125, 110], '9i': [148, 130, 115, 100], PW: [136, 120, 105, 90], GW: [122, 107, 94, 80],
        SW: [105, 92, 80, 68], LW: [85, 75, 65, 55] };
    var MID_HCP = 15, LEARN_MIN = 3;
    // { club: yards } for a handicap (a number, or anything else: the mid default). Pure.
    function defaultCarries(hcp) {
        var h = Number(hcp);
        if (hcp === null || hcp === undefined || hcp === '' || !isFinite(h)) h = MID_HCP;
        h = Math.max(DEFAULT_HCPS[0], Math.min(DEFAULT_HCPS[DEFAULT_HCPS.length - 1], h));
        var i = 1;
        while (i < DEFAULT_HCPS.length - 1 && h > DEFAULT_HCPS[i]) i++;
        var t = (h - DEFAULT_HCPS[i - 1]) / (DEFAULT_HCPS[i] - DEFAULT_HCPS[i - 1]), out = {};
        BAG.forEach(function (c) { var v = DEFAULT_CARRY[c]; out[c] = Math.round(v[i - 1] + (v[i] - v[i - 1]) * t); });
        return out;
    }
    function okYd(v) { v = Math.round(Number(v)); return v > 0 && v < 450 ? v : null; }
    // Setup done: the carries kept as the bag's starting point (base). carries: { club: yd }.
    function setup(golfer, carries) {
        var r = bagRec(), b = bagOf(r, golferKey(golfer)), base = {};
        BAG.forEach(function (c) { var v = okYd((carries || {})[c]); if (v) base[c] = v; });
        b.base = base; b.setupAt = Date.now();
        return lsSet(BAG_KEY, r);
    }
    // "Not now": not asked again on this phone (no carries kept).
    function skipSetup(golfer) { var r = bagRec(), b = bagOf(r, golferKey(golfer)); b.setupAt = b.setupAt || Date.now(); return lsSet(BAG_KEY, r); }
    // The first-time setup is due: nothing in this golfer's bag, and never done / skipped here.
    function needsSetup(golfer) {
        var b = bagRec().golfers[golferKey(golfer)];
        if (!b) return true;
        if (b.setupAt) return false;
        return !['shots', 'set', 'base'].some(function (f) { return b[f] && Object.keys(b[f]).length; });
    }
    // { club: { yd, n, set, base? } } for every club with a number. set: typed in My bag;
    // base: the setup's carry (fewer than LEARN_MIN shots of its own yet); neither: learned.
    function bag(golfer) {
        var b = bagRec().golfers[golferKey(golfer)] || { shots: {}, set: {} }, out = {};
        BAG.forEach(function (c) {
            var a = clubAverage((b.shots || {})[c]), set = (b.set || {})[c], base = (b.base || {})[c];
            if (set) out[c] = { yd: set, n: a ? a.of : 0, set: true };
            else if (a && (!base || a.of >= LEARN_MIN)) out[c] = { yd: a.yd, n: a.of, set: false };
            else if (base) out[c] = { yd: base, n: a ? a.of : 0, set: false, base: true };
        });
        return out;
    }
    // "entered" (typed, or the setup's carry) or "learned" (the marked shots' median).
    function source(v) { return !v ? '' : (v.set || v.base ? 'entered' : 'learned'); }

    // ---- "MY DISTANCES ARE FROM" (012 part 5, switch bagAltitude) ----------------------
    // Where this golfer's club numbers hold: 'sea' (sea level, 0 ft), 'course' (a course they
    // picked: its name and height in feet - null when it has no US height), or 'none' ("Don't
    // adjust" - the DEFAULT: plays-like exactly as before). tempF: the typical temperature
    // when they set them (blank = 70, as before). Kept per golfer ON THIS PHONE ONLY - it is
    // not in syncShape, so the account sync never carries it; no position is kept (a
    // course's name and height only).
    var ALT_MODES = ['sea', 'course', 'none'];
    function okFt(v) { v = Number(v); return v !== null && isFinite(v) && v > -1500 && v < 15000 ? Math.round(v) : null; }
    function okTemp(v) { if (v === null || v === undefined || v === '') return null; v = Number(v); return isFinite(v) && v >= -20 && v <= 130 ? Math.round(v) : null; }
    function baseline(golfer) {
        var b = bagRec().golfers[golferKey(golfer)], a = (b && b.alt) || {};
        var mode = ALT_MODES.indexOf(a.mode) !== -1 ? a.mode : 'none';
        return { mode: mode, name: mode === 'course' ? String(a.name || '').slice(0, 80) : '', ft: mode === 'sea' ? 0 : (mode === 'course' && a.ft !== null && a.ft !== undefined ? okFt(a.ft) : null),
            tempF: okTemp(a.tempF) };
    }
    // a: { mode, name, ft, tempF } - only those fields, checked; anything else is dropped.
    function setBaseline(golfer, a) {
        a = a || {};
        var mode = ALT_MODES.indexOf(a.mode) !== -1 ? a.mode : 'none';
        var r = bagRec(), b = bagOf(r, golferKey(golfer)), out = { mode: mode };
        if (mode === 'course') { out.name = String(a.name || '').slice(0, 80); out.ft = a.ft === null || a.ft === undefined || a.ft === '' ? null : okFt(a.ft); }
        var t = okTemp(a.tempF); if (t !== null) out.tempF = t;
        b.alt = out;
        return lsSet(BAG_KEY, r);
    }
    // The baseline's height for playsLike's altBaseFt: a number, null (a course with no height:
    // altitude not available), or undefined ("Don't adjust": no altitude at all). Pure.
    function baselineFt(a) { if (!a || a.mode === 'none') return undefined; return a.mode === 'sea' ? 0 : (typeof a.ft === 'number' && isFinite(a.ft) ? a.ft : null); }
    // ---- ACCOUNT SYNC (009) - BUILT, SWITCHED OFF (HARDPAN_GPS_CONFIG.clubsSync) -------
    // For a SIGNED-IN golfer's OWN bag only: player_clubs/<their uid>/me =
    //   { shots: { <club>: [yd, ... up to 10] }, set: { <club>: yd }, base: { <club>: yd } }
    // (clubs Dr 3w 5w Hy 4i-9i PW GW SW LW; yards whole numbers 1-449; Firebase keeps an
    // array as { 0: yd, 1: yd, ... }). Yards only - never a position, never another golfer.
    // The rule for it is phase 2 and NOT live, so the switch ships false: no read, no
    // write, the bag stays on the phone. On: load(db, uid, golfer) at sign-in (a phone
    // takes, per club, the account's numbers where it has none of its own), and
    // save(db, uid, golfer) after every change.
    var SYNC_ROOT = 'player_clubs/', SYNC_ME = 'me';
    function syncOn() { try { return !!(W.HARDPAN_GPS_CONFIG && W.HARDPAN_GPS_CONFIG.clubsSync === true); } catch (e) { return false; } }
    function syncPath(uid) { return SYNC_ROOT + String(uid) + '/' + SYNC_ME; }
    function okUid(uid) { return typeof uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(uid); }
    function clubMap(m, list) {
        var out = {};
        BAG.forEach(function (c) {
            var v = m && m[c];
            if (list) {
                var arr = Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.keys(v).sort(function (a, b) { return a - b; }).map(function (k) { return v[k]; }) : []);
                arr = arr.map(okYd).filter(Boolean).slice(-BAG_LAST);
                if (arr.length) out[c] = arr;
            } else { var y = okYd(v); if (y) out[c] = y; }
        });
        return out;
    }
    // The record written: exactly { shots, set, base } (empty ones left out).
    function syncShape(golfer) {
        var b = bagRec().golfers[golferKey(golfer)] || {}, out = {};
        var sh = clubMap(b.shots, true), st = clubMap(b.set, false), bs = clubMap(b.base, false);
        if (Object.keys(sh).length) out.shots = sh;
        if (Object.keys(st).length) out.set = st;
        if (Object.keys(bs).length) out.base = bs;
        return out;
    }
    function syncSave(db, uid, golfer) {
        if (!syncOn() || !okUid(uid) || !db || typeof db.ref !== 'function') return Promise.resolve(false);
        try { return Promise.resolve(db.ref(syncPath(uid)).set(syncShape(golfer))).then(function () { return true; }, function () { return false; }); } catch (e) { return Promise.resolve(false); }
    }
    function syncLoad(db, uid, golfer) {
        if (!syncOn() || !okUid(uid) || !db || typeof db.ref !== 'function') return Promise.resolve(false);
        try {
            return Promise.resolve(db.ref(syncPath(uid)).once('value')).then(function (snap) {
                var v = snap && typeof snap.val === 'function' ? snap.val() : null;
                if (!v || typeof v !== 'object') return false;
                var r = bagRec(), b = bagOf(r, golferKey(golfer)), got = false;
                [['shots', true], ['set', false], ['base', false]].forEach(function (f) {
                    var remote = clubMap(v[f[0]], f[1]);
                    b[f[0]] = b[f[0]] || {};
                    Object.keys(remote).forEach(function (c) { if (b[f[0]][c] == null) { b[f[0]][c] = remote[c]; got = true; } });
                });
                if (got && b.base && Object.keys(b.base).length && !b.setupAt) b.setupAt = Date.now();
                return got ? lsSet(BAG_KEY, r) : false;
            }, function () { return false; });
        } catch (e) { return Promise.resolve(false); }
    }
    W.HardPanGpsBag = { BAG: BAG, NAMES: BAG_NAMES, SHORT: BAG_SHORT, clubAverage: clubAverage, suggestClub: suggestClub, golferKey: golferKey,
        add: addClubShot, set: setClub, reset: resetClub, resetAll: resetBag, bag: bag, KEY: BAG_KEY,
        DEFAULT_HCPS: DEFAULT_HCPS, DEFAULT_CARRY: DEFAULT_CARRY, MID_HCP: MID_HCP, LEARN_MIN: LEARN_MIN, defaultCarries: defaultCarries,
        setup: setup, skipSetup: skipSetup, needsSetup: needsSetup, source: source,
        baseline: baseline, setBaseline: setBaseline, baselineFt: baselineFt, ALT_MODES: ALT_MODES,
        syncOn: syncOn, syncPath: syncPath, syncShape: syncShape, syncSave: syncSave, syncLoad: syncLoad };
    W.HardPanGpsShots = { load: load, shots: shots, add: add, setLast: setLast, undo: undo, legs: legs, holesWithShots: holesWithShots, MAX_PER_HOLE: MAX_PER_HOLE, CLUBS: CLUBS };
})();
