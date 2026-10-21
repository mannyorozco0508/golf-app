// ============================================================================
// HARDPAN GPS - WIND, LEARNED FROM MARKED SHOTS (URGENT-049 part 2, 2026-10-21)
//
// Pure functions only: no DOM, no storage, no network, no money, no scoring.
// window.HardPanWindLearn in the app; require('./gps-wind-learn.js') in node.
// Tests: gps_wind_learn_test.js.
//
// THE ANGLE (Manny 8:44 AM - used everywhere: storage, display, filters, tests)
//   Reference line = ball's marked position -> CENTER of that hole's green,
//   recomputed for every shot. rel = where the wind comes FROM, measured from
//   that line, clockwise: 0 = straight headwind, 90 = from the RIGHT,
//   180 = straight tailwind, 270 = from the LEFT. Exact (0 <= rel < 360),
//   never bucketed.
//   NOTE: gps-geo.js windRelative's `cross` is + = blowing LEFT TO RIGHT (from
//   the left). Here `across` is + = FROM THE RIGHT. Different on purpose
//   (Manny's convention); do not mix the two.
//
// THE COMPONENTS (Manny 8:46 AM)
//   along  = mph x cos(rel)  (+ headwind, - tailwind)
//   across = mph x sin(rel)  (+ from the right, - from the left)
//   head / tail / fromRight / fromLeft = the sign-split magnitudes (>= 0).
//   88 deg at 10 mph = 9.99 from the right + 0.35 head.
//
// THE COEFFICIENTS: yards of CARRY per mph of that component, per club.
//   head -1.4 = loses 1.4 yd per mph of headwind; tail +0.9 = gains 0.9 yd per
//   mph of tailwind; left / right likewise (never folded together - Manny 8:45).
//   Model: carry = stillAir + head*headMph + tail*tailMph + left*leftMph + right*rightMph
//
// PLAYS LIKE (any angle): plays = D - effect, where
//   effect = speed x (|cos| x head-or-tail coef + |sin| x left-or-right coef).
//   A wind that costs 10 yd of carry makes the shot play 10 yd longer.
//   GENERIC model (= today's gps-geo.js playsLike wind term, exactly):
//     head coef = -0.01 x D, tail coef = +0.005 x D, left = right = 0
//     (today a crosswind is an aim-off only, no distance change - windAim).
//   The same "never silly" clamp as today: 0.5 x D .. 1.6 x D.
//
// QUALIFIED: >= 8 shots with wind > 5 mph for that club. Until then the
//   generic model is used for plays-like and to back out still-air carry.
//   A qualified club with too little data for one component (e.g. never hit
//   downwind) uses the generic number for that component only (coef null).
//
// LATER (not built): 30-degree angle bands once a club has 40+ shots
//   (BANDS_MIN_SHOTS); the raw shot log keeps every exact angle so it can be
//   refit then.
// ============================================================================
(function () {
    'use strict';

    var QUALIFY_WINDY_SHOTS = 8;     // shots with wind > WINDY_MPH needed before a club's own numbers are used
    var WINDY_MPH = 5;
    var COMPONENT_MIN_SHOTS = 3;     // shots with >= COMPONENT_MIN_MPH of a component to fit that coefficient
    var COMPONENT_MIN_MPH = 2;
    var BANDS_MIN_SHOTS = 40;        // door left open: 30-degree bands (not built)
    var GENERIC_HEAD_PCT = 0.01;     // gps-geo.js playsLike: 1% of D per mph into the wind
    var GENERIC_TAIL_PCT = 0.005;    //                       0.5% of D per mph helping
    var KEYS = ['head', 'tail', 'left', 'right'];

    function isNum(x) { return typeof x === 'number' && isFinite(x); }
    function toRad(d) { return d * Math.PI / 180; }
    function tidy(x) { return Math.abs(x) < 1e-9 ? 0 : x; }

    // Where the wind comes FROM relative to the ball -> green-center line.
    // windFromDeg: compass (weather services report FROM); bearingDeg: ball -> green center.
    function relAngle(windFromDeg, bearingDeg) {
        if (!isNum(windFromDeg) || !isNum(bearingDeg)) return null;
        var r = ((windFromDeg - bearingDeg) % 360 + 360) % 360;
        return r >= 360 ? 0 : r;
    }

    function components(mph, rel) {
        if (!isNum(mph) || !isNum(rel)) return null;
        var a = toRad(rel);
        var along = tidy(mph * Math.cos(a)), across = tidy(mph * Math.sin(a));
        return {
            along: along, across: across,
            head: along > 0 ? along : 0, tail: along < 0 ? -along : 0,
            fromRight: across > 0 ? across : 0, fromLeft: across < 0 ? -across : 0
        };
    }

    // The generic coefficients at distance D (yards of carry per mph). hand is
    // accepted for symmetry; today's generic crosswind changes no distance.
    function genericCoeffs(D) {
        return { head: -GENERIC_HEAD_PCT * D, tail: GENERIC_TAIL_PCT * D, left: 0, right: 0 };
    }

    // Carry change (yards, + = longer) for a wind, using coef where given, else generic.
    function effectOf(D, c, coeffs) {
        var g = genericCoeffs(D);
        var pick = function (k) { return coeffs && isNum(coeffs[k]) ? coeffs[k] : g[k]; };
        return pick('head') * c.head + pick('tail') * c.tail + pick('left') * c.fromLeft + pick('right') * c.fromRight;
    }

    function usable(coeffs) { return !!(coeffs && coeffs.qualified); }

    // THE WIND TERM: yards to ADD to D (+ = plays longer), unclamped - drop-in for
    // gps-geo playsLike's terms.wind. Generic: identical to today's terms.wind.
    function windTerm(D, mph, rel, coeffs, hand) {
        var c = components(mph, rel);
        if (!isNum(D) || !c) return null;
        var learned = usable(coeffs);
        var term;
        if (!learned) {
            // Today's formula, written the same way (gps-geo.js playsLike).
            var head = mph * Math.cos(toRad(rel));
            term = head > 0 ? D * GENERIC_HEAD_PCT * head : D * GENERIC_TAIL_PCT * head;
        } else {
            term = -effectOf(D, c, coeffs);
        }
        var used = {};
        KEYS.forEach(function (k) { used[k] = learned && isNum(coeffs[k]) ? 'learned' : 'generic'; });
        return { yards: term, model: learned ? 'learned' : 'generic', used: used, n: learned ? coeffs.n : 0, hand: hand === 'L' ? 'L' : 'R', parts: c };
    }

    // PLAYS LIKE (wind only): exact yards (unrounded; Math.round for display, as today).
    function playsLike(dist, mph, rel, coeffs, hand) {
        if (!isNum(dist)) return null;
        var t = windTerm(dist, mph, rel, coeffs, hand);
        if (!t) return dist;
        return Math.max(dist * 0.5, Math.min(dist * 1.6, dist + t.yards));
    }

    // Wording for a crosswind side, by handedness (generic, before data exists).
    // For a right-hander a wind from the LEFT (left-to-right) pushes the ball the
    // way a fade/slice already goes - the harder one; mirrored for a lefty.
    function crossWording(rel, hand) {
        if (!isNum(rel)) return null;
        var s = Math.sin(toRad(rel));
        if (Math.abs(s) < 1e-9) return null;
        var fromLeft = s < 0, h = hand === 'L' ? 'L' : 'R';
        return {
            side: fromLeft ? 'left' : 'right',
            label: fromLeft ? 'from the left (left to right)' : 'from the right (right to left)',
            harder: h === 'R' ? fromLeft : !fromLeft
        };
    }

    function median(a) {
        if (!a.length) return null;
        var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1;
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }

    // Least squares by normal equations + Gaussian elimination (partial pivot).
    function solve(A, b) {
        var n = b.length, M = A.map(function (r, i) { return r.slice().concat([b[i]]); });
        for (var c = 0; c < n; c++) {
            var p = c;
            for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
            if (Math.abs(M[p][c]) < 1e-9) return null;
            var t = M[c]; M[c] = M[p]; M[p] = t;
            for (r = 0; r < n; r++) {
                if (r === c) continue;
                var f = M[r][c] / M[c][c];
                for (var k = c; k <= n; k++) M[r][k] -= f * M[c][k];
            }
        }
        return M.map(function (row, i) { return row[n] / row[i]; });
    }

    // FIT one club's shots: [{ carry, windMph, relAngle, along?, across? }] (other
    // fields ignored; along / across are used only when relAngle is missing).
    // opts (optional): { hand: 'R'|'L', carry } - with opts.carry, a club that is
    // not qualified reports the GENERIC coefficients at that carry (model 'generic')
    // so My bag can show a number; otherwise they are null until qualified.
    // Shots with no carry are skipped (counted in `skipped`); shots with no wind reading
    // (counted in `noWind`) feed only n and the still-air median (int-049).
    // head / tail / left / right: SIGNED yards of carry per mph (head < 0, tail > 0).
    function shotComponents(s) {
        if (isNum(s.windMph) && s.windMph >= 0 && isNum(s.relAngle)) return { mph: s.windMph, c: components(s.windMph, s.relAngle) };
        if (isNum(s.along) && isNum(s.across)) {
            var mph = Math.sqrt(s.along * s.along + s.across * s.across);
            var a = tidy(s.along), x = tidy(s.across);
            return { mph: mph, c: { along: a, across: x, head: a > 0 ? a : 0, tail: a < 0 ? -a : 0, fromRight: x > 0 ? x : 0, fromLeft: x < 0 ? -x : 0 } };
        }
        return null;
    }
    function fit(shots, opts) {
        opts = opts || {};
        // int-049: a shot with a carry but NO wind reading (windMph null / missing) is not a wind
        // data point and not a calm one: it counts toward n and the still-air median only.
        var rows = [], skipped = 0, noWind = [];
        (shots || []).forEach(function (s) {
            if (!s || !isNum(s.carry) || !(s.carry > 0)) { skipped++; return; }
            var w = shotComponents(s);
            if (!w) { noWind.push(s.carry); return; }
            var c = w.c;
            rows.push({ carry: s.carry, mph: w.mph, c: c, x: [c.head, c.tail, c.fromLeft, c.fromRight] });
        });
        var n = rows.length + noWind.length;
        var windyN = rows.filter(function (r) { return r.mph > WINDY_MPH; }).length;
        var qualified = windyN >= QUALIFY_WINDY_SHOTS;
        var perN = KEYS.map(function (k, j) { return rows.filter(function (r) { return r.x[j] >= COMPONENT_MIN_MPH; }).length; });
        var out = { stillAir: null, head: null, tail: null, left: null, right: null, n: n, windyN: windyN, qualified: qualified,
            model: qualified ? 'learned' : 'generic', counts: { head: perN[0], tail: perN[1], left: perN[2], right: perN[3] },
            skipped: skipped, noWind: noWind.length, bandsEligible: n >= BANDS_MIN_SHOTS, hand: opts.hand === 'L' ? 'L' : 'R' };
        if (!qualified && isNum(opts.carry) && opts.carry > 0) {
            var gc = genericCoeffs(opts.carry);
            KEYS.forEach(function (k) { out[k] = gc[k]; });
        }
        if (!n) return out;
        if (qualified) {
            // Fit only the components with enough data; the rest stay null (generic).
            var cols = [];
            KEYS.forEach(function (k, j) { if (perN[j] >= COMPONENT_MIN_SHOTS) cols.push(j); });
            var dim = cols.length + 1;
            if (rows.length > dim) {
                var A = [], b = [], i, j, r;
                for (i = 0; i < dim; i++) { A.push(new Array(dim).fill(0)); b.push(0); }
                rows.forEach(function (row) {
                    // A component left out (too little data) is backed out with the generic number first.
                    var g = genericCoeffs(row.carry), y = row.carry;
                    KEYS.forEach(function (k, kj) { if (cols.indexOf(kj) < 0) y -= g[k] * row.x[kj]; });
                    var f = [1].concat(cols.map(function (cj) { return row.x[cj]; }));
                    for (i = 0; i < dim; i++) { b[i] += f[i] * y; for (j = 0; j < dim; j++) A[i][j] += f[i] * f[j]; }
                });
                r = solve(A, b);
                if (r) cols.forEach(function (cj, ci) { out[KEYS[cj]] = r[ci + 1]; });
            }
        }
        var coeffs = qualified ? out : null;
        out.stillAir = median(rows.map(function (row) { return row.carry - effectOf(row.carry, row.c, coeffs); }).concat(noWind));
        return out;
    }

    var api = {
        relAngle: relAngle, components: components, fit: fit, playsLike: playsLike,
        windTerm: windTerm, genericCoeffs: genericCoeffs, crossWording: crossWording,
        QUALIFY_WINDY_SHOTS: QUALIFY_WINDY_SHOTS, WINDY_MPH: WINDY_MPH, BANDS_MIN_SHOTS: BANDS_MIN_SHOTS,
        COMPONENT_MIN_SHOTS: COMPONENT_MIN_SHOTS, COMPONENT_MIN_MPH: COMPONENT_MIN_MPH
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.HardPanWindLearn = api;
})();
