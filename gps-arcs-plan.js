// ============================================================================
// HARDPAN GPS - DISTANCE ARCS + TEE SHOT PLANNER (URGENT-052 A, 2026-10-21)
//
// Pure functions only: no DOM, no storage, no network, no money, no scoring.
// window.HardPanArcsPlan in the app; require('./gps-arcs-plan.js') in node.
// Tests: gps052a_arcs_plan_test.js (math), urgent052a_arcs_chrome_test.js (the map).
//
// THE ARCS: thin lines at the golfer's own carries (My bag - typed, or learned from
//   marked shots - else the bag setup's carries for their handicap), drawn from the tee
//   (on the tee box, or off the hole) or from the golfer. Each sits where that club
//   LANDS in today's wind - its "plays like" carry - using HardPanWindLearn.windTerm with
//   the club's own head / tail / left / right numbers once it qualifies (8 shots in wind
//   over 5 mph), the generic model before that:
//       lands = carry - windTerm(carry, mph, rel, coeffs, hand).yards
//   (a wind that makes a shot play 10 longer takes 10 off where it lands), clamped like
//   playsLike (0.5 x carry .. 1.6 x carry). rel = where the wind comes FROM vs the line to
//   the CENTER of the green (049: 0 head, 90 from the right, 180 tail, 270 from the left).
// THE LABEL: the club and the yards ("Dr 249"); "generic" by the 049 (i) rule - a club
//   whose wind numbers are not its own yet (not qualified) says generic.
// THE PLANNER: from the tee, each tee club: where it lands, the yards left IN to the
//   green's center (walked along the hole's path, so a dogleg counts), and the hazards it
//   brings into play. Hazards are POINTS (GolfAPI's front / back edges, gps-geo.hazardRows:
//   reach = near edge, carry = far edge), so "in play" is a distance WINDOW: the club lands
//   from 10 short of the near edge to the far edge (one point only: 10 either side).
// Nothing here is stored or sent; the toggle lives in gps-view.js (this phone).
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : {};
    var M_PER_YD = 0.9144;
    var IN_PLAY_SHORT_YD = 10;   // in play from this far short of a hazard's near edge
    var ONE_POINT_YD = 10;       // a hazard with one point: this far either side of it
    var HALF_WIDTH_YD = 24;      // each arc spans this far either side of the line
    var MAX_ARCS = 3;
    var MIN_YD = 40;
    var TEE_CLUBS = ['Dr', '3w', '5w', 'Hy', '4i'];
    var ORDER = ['Dr', '3w', '5w', 'Hy', '4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'LW'];
    var NAMES = { Dr: 'Driver', '3w': '3-wood', '5w': '5-wood', Hy: 'Hybrid', '4i': '4-iron', '5i': '5-iron', '6i': '6-iron', '7i': '7-iron',
        '8i': '8-iron', '9i': '9-iron', PW: 'Pitching wedge', GW: 'Gap wedge', SW: 'Sand wedge', LW: 'Lob wedge' };
    var SHORT = { Dr: 'Dr', '3w': '3W', '5w': '5W', Hy: 'Hy', '4i': '4i', '5i': '5i', '6i': '6i', '7i': '7i', '8i': '8i', '9i': '9i', PW: 'PW', GW: 'GW', SW: 'SW', LW: 'LW' };

    function isNum(x) { return typeof x === 'number' && isFinite(x); }
    function geo() { return W.HardPanGeo || (typeof require === 'function' ? require('./gps-geo.js') : null); }
    function wl() { return W.HardPanWindLearn || (typeof require === 'function' ? require('./gps-wind-learn.js') : null); }
    function nameOf(c) { return NAMES[c] || String(c); }
    function shortOf(c) { return SHORT[c] || String(c); }

    // THE 049 (i) RULE: the club's own wind numbers only once it qualifies; else "generic".
    function isGeneric(fit) { return !(fit && fit.qualified); }

    // WHERE A CLUB LANDS IN THIS WIND. carry: still-air yards; wind: { mph, rel } (rel per 049)
    // or null; fit: HardPanWindLearn.fit for the club (or null); hand 'R' | 'L'.
    function lands(carry, wind, fit, hand) {
        var out = { carry: carry, yd: carry, term: 0, model: isGeneric(fit) ? 'generic' : 'learned', generic: isGeneric(fit), wind: false };
        if (!isNum(carry) || !(carry > 0)) return null;
        var api = wl();
        if (!wind || !api || !isNum(wind.mph) || !isNum(wind.rel) || wind.mph < 1) return out;
        var t = api.windTerm(carry, wind.mph, wind.rel, isGeneric(fit) ? null : fit, hand);
        if (!t || !isNum(t.yards)) return out;
        out.term = t.yards;
        out.yd = Math.max(carry * 0.5, Math.min(carry * 1.6, carry - t.yards));
        out.wind = true;
        return out;
    }

    // bag: { club: { yd } } -> [[club, yd]] in bag order, numbers only.
    function clubs(bag) {
        var out = [];
        ORDER.forEach(function (c) { var y = bag && bag[c] && Number(bag[c].yd); if (y > 0) out.push([c, y]); });
        Object.keys(bag || {}).forEach(function (c) { if (ORDER.indexOf(c) < 0) { var y = Number(bag[c] && bag[c].yd); if (y > 0) out.push([c, y]); } });
        return out;
    }
    // FROM THE TEE: the woods, hybrid and long iron in the bag that do not fly the hole
    // (longest first, MAX_ARCS). A par 3 (or a hole shorter than the driver): the clubs
    // around its length, as from the ball.
    function pickTee(bag, holeYd, par) {
        var all = clubs(bag);
        if (Number(par) === 3) return pickBall(bag, holeYd);
        var t = all.filter(function (x) { return TEE_CLUBS.indexOf(x[0]) >= 0 && (!isNum(holeYd) || x[1] <= holeYd + 20); });
        if (!t.length) return pickBall(bag, holeYd);
        return t.sort(function (a, b) { return b[1] - a[1]; }).slice(0, MAX_ARCS).map(function (x) { return x[0]; });
    }
    // FROM THE BALL: the club for the distance (the shortest that gets there, else the
    // longest), the next longer and the next shorter - never past the green by 30 or
    // under MIN_YD.
    function pickBall(bag, toYd) {
        var all = clubs(bag).sort(function (a, b) { return b[1] - a[1]; });
        if (!all.length || !isNum(toYd)) return [];
        var i = -1;
        for (var k = all.length - 1; k >= 0; k--) if (all[k][1] >= toYd) { i = k; break; }
        if (i < 0) i = 0;
        var pick = [all[i - 1], all[i], all[i + 1]].filter(function (x) { return x && x[1] >= MIN_YD && x[1] <= toYd + 30; });
        return pick.map(function (x) { return x[0]; });
    }

    // One arc: `yd` from `center`, `half` either side of `bearing`. [[lat, lng], ...]
    function arcPts(center, bearing, yd, halfYd) {
        var G = geo(); if (!G || !center || !isNum(yd) || !(yd > 0)) return [];
        var R = yd * M_PER_YD, half = (isNum(halfYd) ? halfYd : HALF_WIDTH_YD) * M_PER_YD;
        var a = Math.min(30, (half / R) * 180 / Math.PI), segs = 16, pts = [];
        for (var i = 0; i <= segs; i++) pts.push(G.destination(center, bearing - a + (2 * a * i / segs), R));
        return pts;
    }

    function relOf(wind, from, mid) {
        var G = geo(), api = wl();
        if (!wind || wind.none || !isNum(wind.mph) || !isNum(wind.fromDeg) || !G || !api || !from || !mid) return null;
        var rel = api.relAngle(wind.fromDeg, G.bearingDeg(from, mid));
        return rel == null ? null : { mph: wind.mph, rel: rel };
    }

    // THE ARCS. o: { bag, fits ({ club: fit }), hand, wind ({ mph, fromDeg } | null),
    //   from: { pt, kind: 'tee' | 'me' }, mid (green center), aim (the line's far point; default mid),
    //   par, holeYd (tee -> green, for the tee clubs) }
    // -> [{ club, short, carry, yd (lands), generic, wind, pts, stillPts (only when the wind moves it 3+), end }]
    function arcs(o) {
        var G = geo();
        if (!o || !o.from || !o.from.pt || !o.mid || !G) return [];
        var from = o.from.pt, aim = o.aim || o.mid;
        var toYd = G.haversineMeters(from, o.mid) / M_PER_YD;
        var list = o.from.kind === 'tee' ? pickTee(o.bag, isNum(o.holeYd) ? o.holeYd : toYd, o.par) : pickBall(o.bag, toYd);
        var w = relOf(o.wind, from, o.mid), brg = G.bearingDeg(from, aim);
        var out = [];
        list.forEach(function (c) {
            var carry = Number(o.bag[c].yd), fit = o.fits ? o.fits[c] || null : null;
            var L = lands(carry, w, fit, o.hand);
            if (!L || L.yd < MIN_YD) return;
            var pts = arcPts(from, brg, L.yd);
            out.push({ club: c, short: shortOf(c), carry: carry, yd: L.yd, generic: L.generic, wind: L.wind, n: fit ? fit.n || 0 : 0,
                pts: pts, stillPts: L.wind && Math.abs(L.yd - carry) >= 3 ? arcPts(from, brg, carry) : null, end: pts[pts.length - 1] });
        });
        return out;
    }

    // 094 (Manny, Oct 28: on the par-3 Green view the arcs moved and turned with the dragged target): THE LINE THE
    // ARCS LIE ACROSS (arcs' `aim`). A par 3 (the tee shot is the approach), the Green view, or from the golfer: the
    // fixed line to the green's CENTER. A par 4 / 5's tee shot (hole view): the hole's own line - the smart-default
    // target (the dogleg / the driver's spot, 052 A's aim), never the ring the golfer dragged (dragged: that default
    // when known, else the center). o: { par, green (the Green view), nearTee, target, targetDefault, moved, mid }.
    function arcAim(o) {
        if (!o || !o.mid) return null;
        if (Number(o.par) === 3 || o.green || !o.nearTee) return o.mid;
        if (o.moved) return o.targetDefault || o.mid;
        return o.target || o.mid;
    }

    // A HAZARD IN PLAY for a club landing `landsYd` from the tee: row is gps-geo.hazardRows'
    // (reachM near edge, carryM far edge or null for one point, behind).
    function inPlay(landsYd, row) {
        if (!row || row.behind || !isNum(row.reachM) || !isNum(landsYd)) return false;
        var reach = row.reachM / M_PER_YD, far = isNum(row.carryM) ? row.carryM / M_PER_YD : reach + ONE_POINT_YD;
        return landsYd >= reach - (isNum(row.carryM) ? IN_PLAY_SHORT_YD : ONE_POINT_YD) && landsYd <= far;
    }

    // THE TEE PLANNER. o: { bag, fits, hand, wind, tee, mid, path ([[lat,lng]...] tee -> green, or null),
    //   hazards (the hole's points), par }
    // -> { holeYd, wind ({ mph, rel } | null), hazardData, rows: [{ club, name, carry, lands, inYd, green (reaches it),
    //      generic, n, hazards: [{ name, type, reachYd, carryYd }] }], summary }
    function plan(o) {
        var G = geo();
        if (!o || !o.tee || !o.mid || !G) return null;
        var line = o.path && o.path.length >= 2 ? o.path : [o.tee, o.mid];
        var holeM = 0; for (var i = 1; i < line.length; i++) holeM += G.haversineMeters(line[i - 1], line[i]);
        var holeYd = holeM / M_PER_YD;
        var w = relOf(o.wind, o.tee, o.mid);
        var rowsH = G.hazardRows ? G.hazardRows(o.tee, o.hazards || [], o.mid) : [];
        var hazardData = !!(o.hazards && o.hazards.length);
        var list = pickTee(o.bag, holeYd, o.par);
        var rows = [];
        list.forEach(function (c) {
            var carry = Number(o.bag[c].yd), fit = o.fits ? o.fits[c] || null : null;
            var L = lands(carry, w, fit, o.hand);
            if (!L) return;
            var land = G.pointAlongHole(line, o.tee, L.yd * M_PER_YD) || o.mid;
            var inYd = G.haversineMeters(land, o.mid) / M_PER_YD;
            var green = L.yd >= holeYd - 10;
            rows.push({ club: c, name: nameOf(c), short: shortOf(c), carry: carry, lands: L.yd, wind: L.wind, inYd: green ? 0 : inYd, green: green,
                generic: L.generic, n: fit ? fit.n || 0 : 0,
                hazards: rowsH.filter(function (z) { return inPlay(L.yd, z); }).map(function (z) {
                    return { name: z.name, type: z.type, reachYd: z.reachM / M_PER_YD, carryYd: isNum(z.carryM) ? z.carryM / M_PER_YD : null };
                }) });
        });
        var summary = rows.map(function (r) { return r.name + ' → ' + (r.green ? 'on the green' : Math.round(r.inYd) + ' in'); }).join(' · ');
        return { holeYd: holeYd, wind: w, hazardData: hazardData, rows: rows, summary: summary };
    }

    var api = {
        lands: lands, isGeneric: isGeneric, pickTee: pickTee, pickBall: pickBall, arcPts: arcPts, arcs: arcs, arcAim: arcAim, inPlay: inPlay, plan: plan,
        nameOf: nameOf, shortOf: shortOf,
        IN_PLAY_SHORT_YD: IN_PLAY_SHORT_YD, ONE_POINT_YD: ONE_POINT_YD, HALF_WIDTH_YD: HALF_WIDTH_YD, MAX_ARCS: MAX_ARCS, TEE_CLUBS: TEE_CLUBS
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.HardPanArcsPlan = api;
})();
