// ============================================================================
// HARDPAN GPS - MY MISS: THE MISS PATTERN PER CLUB (URGENT-052 B stage 2, 2026-10-21)
//
// Pure functions + one per-golfer switch. No DOM, no network, no money, no scoring.
// window.HardPanMissPattern in the app; require('./gps-miss-pattern.js') in node.
// Tests: gps052b_oval_test.js.
//
// THE POINTS (one per marked shot that has a real miss - stage 1's `offline`, endKind not
// 'hole-close'; HardPanShotLog.hasMiss):
//   x = SIDE, yards: + right of the aim line, - left (the golfer's view, never mirrored),
//       with the crosswind's push taken out: the generic drift gps-geo windAim uses
//       (AIM_PER_MPH x carry x crosswind mph). A wind from the right pushes the ball left,
//       so its drift is ADDED back: side = offline + carry x 0.005 x across.
//   y = LONG / SHORT, yards: the shot's still-air carry (049 windTerm - the club's own wind
//       numbers once it qualifies, else generic) minus the club's AVERAGE still-air carry.
//       "Short" = short of that average.
// THE OVAL holds about 2 of 3 shots: semi-axes = K x sqrt(eigenvalue) of the 2x2 spread,
//   K = sqrt(2 ln 3) = 1.48 (a 2-D normal puts 1 - exp(-K^2 / 2) = 2/3 inside).
//   >= MIN_SHOTS (10) points: his own mean side and spread, tilt from his data.
//   Fewer: the DEFAULT SHAPE ("default shape"): side spread 4.5% of carry, long/short
//   3%, tilted DEFAULT_TILT deg so that for a right-hander RIGHT misses are SHORTER and
//   LEFT misses LONGER (more / less spin); mirrored for a left-hander. Centred on the aim
//   line at the average carry.
// tilt: the major axis's angle, degrees, from +x (right) toward +y (long).
//   Right-hander default: -25 (going right, it comes back short). Left-hander: +25.
// MY MISS SWITCH: off by default, remembered per golfer, on this phone
//   (localStorage hardpan_mymiss_v1 { golferKey: true }). Nothing else is stored here.
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : {};
    var MIN_SHOTS = 10;
    var K = Math.sqrt(2 * Math.log(3));          // 1.482: about 2 of 3 shots inside
    var DEFAULT_SIDE_PCT = 0.045, DEFAULT_LONG_PCT = 0.03, DEFAULT_TILT = 25;
    var AIM_PER_MPH = 0.005;                      // gps-geo.js windAim (generic crosswind drift)
    var MIN_SEMI = 2;                             // yards: never a dot
    var KEY = 'hardpan_mymiss_v1';

    function isNum(x) { return typeof x === 'number' && isFinite(x); }
    function toRad(d) { return d * Math.PI / 180; }
    function mean(a) { if (!a.length) return null; var s = 0; a.forEach(function (v) { s += v; }); return s / a.length; }
    function WL() { return W.HardPanWindLearn && typeof W.HardPanWindLearn.windTerm === 'function' ? W.HardPanWindLearn : null; }
    function hasMiss(s) { return !!(s && s.endKind && s.endKind !== 'hole-close' && isNum(s.offline)); }

    // One shot -> { x (side, wind out), carry (still air) } or null (no real miss).
    // coeffs: the club's 049 fit (used only when qualified); wl: HardPanWindLearn (optional).
    function point(s, coeffs, wl) {
        if (!hasMiss(s) || !isNum(s.carry) || !(s.carry > 0)) return null;
        var api = wl || WL(), carry = s.carry, x = s.offline;
        if (isNum(s.windMph) && s.windMph > 0 && isNum(s.relAngle)) {
            if (api) { var wt = api.windTerm(s.carry, s.windMph, s.relAngle, coeffs && coeffs.qualified ? coeffs : null); if (wt && isNum(wt.yards)) carry = s.carry + wt.yards; }
            var across = isNum(s.across) ? s.across : s.windMph * Math.sin(toRad(s.relAngle));
            x = s.offline + s.carry * AIM_PER_MPH * across;
        }
        return { x: x, carry: carry };
    }

    // An oval from a mean side + a 2x2 spread (sxx, syy, sxy): { a, b, tilt }.
    function axes(sxx, syy, sxy) {
        var tr = (sxx + syy) / 2, d = Math.sqrt(Math.max(0, (sxx - syy) * (sxx - syy) / 4 + sxy * sxy));
        var l1 = tr + d, l2 = Math.max(0, tr - d);
        var th = 0.5 * Math.atan2(2 * sxy, sxx - syy);   // major axis angle
        return { a: Math.max(MIN_SEMI, K * Math.sqrt(l1)), b: Math.max(MIN_SEMI, K * Math.sqrt(l2)), tilt: th * 180 / Math.PI };
    }

    // THE DEFAULT SHAPE at carry D for a hand: { a, b, tilt } (a along the tilted side axis).
    function defaultShape(D, hand) {
        var sx = DEFAULT_SIDE_PCT * D, sy = DEFAULT_LONG_PCT * D;
        return { a: Math.max(MIN_SEMI, K * sx), b: Math.max(MIN_SEMI, K * sy), tilt: hand === 'L' ? DEFAULT_TILT : -DEFAULT_TILT };
    }

    // FIT one club. shots: its log records (any; only real misses are used). opts:
    // { club, hand 'R'|'L', coeffs (the club's 049 fit), carry (My bag's number, when no shot
    // has a carry yet), wl }. Returns null when there is no carry to centre on at all.
    function fit(shots, opts) {
        opts = opts || {};
        var hand = opts.hand === 'L' ? 'L' : 'R';
        var pts = [];
        (shots || []).forEach(function (s) { var p = point(s, opts.coeffs, opts.wl); if (p) pts.push(p); });
        var n = pts.length;
        var avg = n ? mean(pts.map(function (p) { return p.carry; })) : (isNum(opts.carry) && opts.carry > 0 ? opts.carry : null);
        if (avg == null) return null;
        var out = { club: opts.club || null, hand: hand, n: n, need: MIN_SHOTS, carry: avg, own: n >= MIN_SHOTS, cx: 0, a: 0, b: 0, tilt: 0, label: null, stats: null };
        var ys = pts.map(function (p) { return p.carry - avg; }), xs = pts.map(function (p) { return p.x; });
        if (out.own) {
            var mx = mean(xs), sxx = 0, syy = 0, sxy = 0;
            for (var i = 0; i < n; i++) { var dx = xs[i] - mx, dy = ys[i]; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
            sxx /= (n - 1); syy /= (n - 1); sxy /= (n - 1);
            var ax = axes(sxx, syy, sxy);
            out.cx = mx; out.a = ax.a; out.b = ax.b; out.tilt = ax.tilt;
        } else {
            var d = defaultShape(avg, hand);
            out.a = d.a; out.b = d.b; out.tilt = d.tilt; out.label = 'default shape';
        }
        if (n) {
            var right = xs.filter(function (x) { return x > 0; }).length, left = xs.filter(function (x) { return x < 0; }).length;
            var side = right >= left ? 'right' : 'left', sideYs = ys.filter(function (y, j) { return side === 'right' ? xs[j] > 0 : xs[j] < 0; });
            out.stats = { pctRight: right / n, pctLeft: left / n, side: side, pct: (side === 'right' ? right : left) / n,
                avgSide: mean(xs.map(function (x) { return Math.abs(x); })), sideLong: sideYs.length ? mean(sideYs) : 0 };
        }
        return out;
    }

    // THE SUMMARY LINE. f: fit(); name: '7-iron'; unit: 'yd' | 'm'.
    // "7-iron: 70% right, 9 yds avg · right misses 6 yds short"
    // "7-iron: default shape · 3 of 10 marked shots"
    function summary(f, name, unit) {
        if (!f) return '';
        var m = unit === 'm', k = m ? 0.9144 : 1, u = m ? ' m' : ' yds';
        var nm = String(name || f.club || 'This club');
        if (!f.own) return nm + ': default shape · ' + f.n + ' of ' + f.need + ' marked shots';
        var s = f.stats, pct = Math.round(s.pct * 100), avg = Math.round(s.avgSide * k), lg = Math.round(s.sideLong * k);
        var tail = lg <= -1 ? ' · ' + s.side + ' misses ' + Math.abs(lg) + u + ' short'
            : lg >= 1 ? ' · ' + s.side + ' misses ' + lg + u + ' long' : ' · ' + s.side + ' misses pin-high';
        return nm + ': ' + pct + '% ' + s.side + ', ' + avg + u + ' avg' + tail;
    }

    // THE OVAL'S OUTLINE, in yards: [[side, along]] - side + right of the aim line, along =
    // distance from the ball along it (centred at f.carry). steps points, closed.
    function outline(f, steps) {
        if (!f) return [];
        steps = steps || 48;
        var th = toRad(f.tilt), c = Math.cos(th), s = Math.sin(th), out = [];
        for (var i = 0; i <= steps; i++) {
            var t = 2 * Math.PI * i / steps, u = f.a * Math.cos(t), v = f.b * Math.sin(t);
            out.push([f.cx + u * c - v * s, f.carry + u * s + v * c]);
        }
        return out;
    }
    // Is (side, along) inside the oval? (tests; the 2-of-3 check)
    function inside(f, x, y) {
        var th = toRad(f.tilt), dx = x - f.cx, dy = y - f.carry;
        var u = dx * Math.cos(th) + dy * Math.sin(th), v = -dx * Math.sin(th) + dy * Math.cos(th);
        return (u * u) / (f.a * f.a) + (v * v) / (f.b * f.b) <= 1;
    }

    // ---- THE "MY MISS" SWITCH: per golfer, off by default -------------------------------
    function gk(golfer) {
        try { if (W.HardPanShotLog && typeof W.HardPanShotLog.golferKey === 'function') return W.HardPanShotLog.golferKey(golfer); } catch (e) {}
        var n = String(golfer || '').trim().toLowerCase().replace(/\s+/g, ' ');
        return n ? 'n:' + n : 'me';
    }
    function readAll() { try { var v = W.localStorage.getItem(KEY); var o = v ? JSON.parse(v) : null; return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
    function isOn(golfer) { return readAll()[gk(golfer)] === true; }
    function setOn(golfer, on) {
        var o = readAll(), k = gk(golfer);
        if (on) o[k] = true; else delete o[k];
        try { W.localStorage.setItem(KEY, JSON.stringify(o)); return true; } catch (e) { return false; }
    }

    var api = { MIN_SHOTS: MIN_SHOTS, K: K, DEFAULT_TILT: DEFAULT_TILT, DEFAULT_SIDE_PCT: DEFAULT_SIDE_PCT, DEFAULT_LONG_PCT: DEFAULT_LONG_PCT,
        AIM_PER_MPH: AIM_PER_MPH, KEY: KEY,
        point: point, fit: fit, defaultShape: defaultShape, axes: axes, summary: summary, outline: outline, inside: inside, hasMiss: hasMiss,
        isOn: isOn, setOn: setOn };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.HardPanMissPattern = api;
})();
