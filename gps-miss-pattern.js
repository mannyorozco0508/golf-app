// ============================================================================
// HARDPAN GPS - MY MISS: THE MISS OVAL FROM YOUR AVERAGE CARRY (URGENT-063, 2026-10-22;
// replaces URGENT-052 B's "learn after 10 shots" - no fitted tilt, no shot-count wait, no
// "default shape" label).
//
// Pure functions + one per-golfer switch. No DOM, no network, no money, no scoring.
// window.HardPanMissPattern in the app; require('./gps-miss-pattern.js') in node.
// Tests: gps063_oval_test.js (and gps052b_oval_test.js for the switch / privacy guards).
//
// THE SOURCE: ONLY the club's average carry as My bag shows it today (a typed number, a Range
// "Update my bag", or the good marked shots My bag has learned - whatever My bag's number is).
// The left/right `offline` field on marked shots (gps-mark-chips.js) is still recorded; it never
// shapes the oval. It still feeds the 052 B extras, kept (URGENT-067 "only add"): his shots as dots on
// the club screen's picture and the "70% right, 9 yds avg" line (shotStats / statsLine).
// THE CLUBS: irons and wedges only - 4i-9i, PW, GW, SW, LW. Never Driver, woods or hybrids.
// WHEN IT SHOWS (shows()): an APPROACH into the green - never off the tee (the first shot), except
// on a PAR 3 (072: the tee shot is the approach; same clubs, same checks), and
// only when the green is in range of the club: the plays-like yards to the green's center
// within the club's carry +/- the margin below. A layup (green out of range) gets nothing.
// THE SHAPE (right-handed; mirrored for a left-hander - 049's I play setting):
//   centred on the average carry along the line to the target (where that carry lands today -
//   the plays-like's wind / slope / temperature - unless TUNE.PLAYS_CENTER is false);
//   depth (long / short)  = +/- DEPTH_PCT of the carry;
//   width (left / right)  = +/- WIDTH_PCT of the carry;
//   tilted TILT_DEG so the RIGHT side sits SHORT and the LEFT side sits LONG.
//   A 178 7-iron: +/- 8.0 deep, +/- 11.6 wide, 25 deg.
// tilt (the oval's `tilt`): the width axis's angle, degrees, from +x (right) toward +y (long).
//   Right-hander: -TILT_DEG (going right, it comes back short). Left-hander: +TILT_DEG.
// THE MY BAG LINE: "7-iron · 178 · miss right ≈ 5 short, miss left ≈ 5 long" - the long / short
//   at the oval's right and left tips (width x sin(tilt)).
// MY MISS SWITCH: off by default, remembered per golfer, on this phone
//   (localStorage hardpan_mymiss_v1 { golferKey: true }). Nothing else is stored here.
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : {};

    // ---- MANNY'S TUNING NUMBERS: THE ONE PLACE ---------------------------------------
    // Change a number here and the map oval, the My bag line and the (i) words all follow.
    var TUNE = {
        DEPTH_PCT: 0.045,     // long / short: +/- 4.5% of the club's average carry
        WIDTH_PCT: 0.065,     // left / right: +/- 6.5% of the club's average carry
        TILT_DEG: 25,         // degrees; right side short, left side long (right-handed)
        RANGE_PCT: 0.10,      // "green in range": plays-like to the green within carry +/- 10% ...
        RANGE_MIN_YD: 12,     // ... but never less than +/- 12 yds
        GREEN_AIM_YD: 30,     // a target ring within 30 yds of the green's center is aiming at the green
        PLAYS_CENTER: true,   // true: the centre sits where that carry lands TODAY (the carry x yards / plays-like,
                              // as the Distance arcs do); false: at the plain carry. The size is always from the carry.
        TEE_YD: 40,           // within 40 yds of the tee = the tee shot (as the tee plan's TEE_SHOT_YD)
        // 089 (Manny, Oct 27): the note "7-iron lands 8 yds long" and the club chips' "+8 long" say nothing
        // ("on target" on a chip) within this many yards of the aim; the stepped fade's 6 stacked ovals.
        NOTE_MIN_YD: 2,
        FADE: [1, 0.86, 0.72, 0.58, 0.44, 0.30],
        // 089b (Manny, Oct 27): the club chips cover the WHOLE green depth - every iron / wedge whose carry lands
        // between the front and the back (from the golfer's live spot), plus the nearest club short of the front
        // and long of the back when within EDGE_YD of that edge; at most MAX_CHIPS; "middle" with no number
        // within MIDDLE_YD of the middle.
        EDGE_YD: 5,
        MAX_CHIPS: 4,
        MIDDLE_YD: 3,
        // 089b (Manny, Oct 27): My miss's chips / oval / note keep the LAST fix while it is under 60 s old (no
        // flicker with the phone in a pocket). Nothing else changes: the app's own 10 s rule stays everywhere else.
        HOLD_FIX_MS: 60000
    };
    // Irons and wedges only (My bag's club keys).
    var CLUBS = ['4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'LW'];
    var MIN_SEMI = 1;                             // yards: never a dot
    var KEY = 'hardpan_mymiss_v1';

    function isNum(x) { return typeof x === 'number' && isFinite(x); }
    function toRad(d) { return d * Math.PI / 180; }
    function isClub(club) { return CLUBS.indexOf(club) !== -1; }

    // THE OVAL for a club with My bag's average carry, for a hand: { club, hand, carry (the
    // centre, yards along the line), avg (My bag's carry), cx, a (half width), b (half depth),
    // tilt } - or null (not an iron / wedge, no carry). along: where the centre sits (centreAt),
    // else the carry. The size always comes from My bag's carry.
    // 095: any (optional) - the par-3 club switcher steps through EVERY club in My bag, so its oval may be a
    // hybrid / wood / driver too (the same size rule from the carry). Without it: irons and wedges only, as before.
    function oval(club, carry, hand, along, any) {
        if ((!isClub(club) && !(any && club)) || !isNum(carry) || !(carry > 0)) return null;
        var h = hand === 'L' ? 'L' : 'R';
        return { club: club, hand: h, carry: isNum(along) && along > 0 ? along : carry, avg: carry, cx: 0,
            a: Math.max(MIN_SEMI, TUNE.WIDTH_PCT * carry), b: Math.max(MIN_SEMI, TUNE.DEPTH_PCT * carry),
            tilt: h === 'L' ? TUNE.TILT_DEG : -TUNE.TILT_DEG };
    }
    // WHERE THE CENTRE SITS along the line: the carry as it plays today (rawYd / playsYd - the
    // plays-like's wind, slope, temperature, altitude), within 15%; PLAYS_CENTER false or no
    // plays-like: the carry itself.
    function centreAt(carry, rawYd, playsYd) {
        if (!TUNE.PLAYS_CENTER || !isNum(carry) || !isNum(rawYd) || !isNum(playsYd) || !(rawYd > 0) || !(playsYd > 0)) return carry;
        return carry * Math.max(0.85, Math.min(1.15, rawYd / playsYd));
    }
    // The margin around the carry that counts as "the green in range".
    function margin(carry) { return Math.max(TUNE.RANGE_MIN_YD, TUNE.RANGE_PCT * carry); }
    function inRange(carry, greenYd) { return isNum(carry) && carry > 0 && isNum(greenYd) && Math.abs(greenYd - carry) <= margin(carry); }

    // DOES IT SHOW? q: { club, carry (My bag's), greenYd (plays-like yards to the green's
    // center), fromTee (the tee shot / first shot), layup (the target is off the green) }.
    // ctx (072, optional): { par } - the hole's par. On a PAR 3 the tee shot IS the approach, so
    // the tee shot shows it too, with the same clubs (4i-LW), range and layup checks below;
    // woods, hybrids and driver stay off. Par 4/5 (or no par): never off the tee, as before.
    // Returns { ok, why }.
    function shows(q, ctx) {
        q = q || {};
        var par3Tee = !!(q.fromTee && ctx && Number(ctx.par) === 3);
        if (q.fromTee && !par3Tee) return { ok: false, why: 'tee' };
        if (!isClub(q.club)) return { ok: false, why: 'club' };
        if (!isNum(q.carry) || !(q.carry > 0)) return { ok: false, why: 'carry' };
        if (q.layup) return { ok: false, why: 'layup' };
        if (!inRange(q.carry, q.greenYd)) return { ok: false, why: 'range' };
        return { ok: true, why: null };
    }

    // ---- HIS MARKED SHOTS (052 B, KEPT - URGENT-067 "only add"): the dots on the club screen and the
    // "70% right, 9 yds avg" line. Stats only - the oval above never uses them.
    // One shot -> { x (side, wind out), carry (still air) } or null (no real miss, or closed by
    // finishing the hole). The crosswind's push is added back (gps-geo windAim's generic drift);
    // the carry is the 049 still-air carry (the club's own wind numbers once it qualifies).
    var AIM_PER_MPH = 0.005;
    function mean(a) { if (!a.length) return null; var t = 0; a.forEach(function (v) { t += v; }); return t / a.length; }
    function WL() { return W.HardPanWindLearn && typeof W.HardPanWindLearn.windTerm === 'function' ? W.HardPanWindLearn : null; }
    function hasMiss(s) { return !!(s && s.endKind && s.endKind !== 'hole-close' && isNum(s.offline)); }
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
    // His marked shots' pattern: { n, carry (their average still-air carry), side, pct, avgSide,
    // sideLong, pts: [[x, y]] (y = long + / short - of that average) } or null with none.
    function shotStats(shots, coeffs, wl) {
        var pts = [];
        (shots || []).forEach(function (s) { var q = point(s, coeffs, wl); if (q) pts.push(q); });
        var n = pts.length; if (!n) return null;
        var avg = mean(pts.map(function (q) { return q.carry; }));
        var xs = pts.map(function (q) { return q.x; }), ys = pts.map(function (q) { return q.carry - avg; });
        var right = xs.filter(function (x) { return x > 0; }).length, left = xs.filter(function (x) { return x < 0; }).length;
        var side = right >= left ? 'right' : 'left', sideYs = ys.filter(function (y, j) { return side === 'right' ? xs[j] > 0 : xs[j] < 0; });
        return { n: n, carry: avg, side: side, pct: (side === 'right' ? right : left) / n,
            avgSide: mean(xs.map(function (x) { return Math.abs(x); })), sideLong: sideYs.length ? mean(sideYs) : 0,
            pts: xs.map(function (x, j) { return [x, ys[j]]; }) };
    }
    // "7-iron: 70% right, 9 yds avg · right misses 6 yds short" (the 052 B line, kept).
    function statsLine(st, name, unit) {
        if (!st) return '';
        var m = unit === 'm', k = m ? 0.9144 : 1, u = m ? ' m' : ' yds';
        var pct = Math.round(st.pct * 100), avg = Math.round(st.avgSide * k), lg = Math.round(st.sideLong * k);
        var tail = lg <= -1 ? ' · ' + st.side + ' misses ' + Math.abs(lg) + u + ' short'
            : lg >= 1 ? ' · ' + st.side + ' misses ' + lg + u + ' long' : ' · ' + st.side + ' misses pin-high';
        return String(name) + ': ' + pct + '% ' + st.side + ', ' + avg + u + ' avg' + tail;
    }

    // The long / short at the oval's right and left tips: { right, left } in yards, + = long.
    function tips(f) {
        if (!f) return null;
        var y = f.a * Math.sin(toRad(f.tilt));
        return { right: y, left: -y };
    }
    // THE MY BAG LINE: "7-iron · 178 · miss right ≈ 5 short, miss left ≈ 5 long".
    // unit: 'yd' | 'm'. A left-hander leads with his short side (left).
    function bagLine(name, carry, hand, unit, club) {
        var f = oval(club || '7i', carry, hand);
        if (!f) return '';
        var k = unit === 'm' ? 0.9144 : 1, t = tips(f);
        var w = function (side, y) { var n = Math.round(Math.abs(y) * k); return 'miss ' + side + ' ≈ ' + (n < 1 ? 'pin-high' : n + (y < 0 ? ' short' : ' long')); };
        var parts = f.hand === 'L' ? [w('left', t.left), w('right', t.right)] : [w('right', t.right), w('left', t.left)];
        return String(name || club) + ' · ' + Math.round(carry * k) + ' · ' + parts.join(', ');
    }
    // THE (i) WORDS: the formula in plain words (the numbers from TUNE).
    function infoText() {
        var pc = function (x) { return String(Math.round(x * 1000) / 10); };
        var ex = oval('7i', 178, 'R');
        return 'My miss draws an oval from your average carry with each iron and wedge - the number My bag shows (typed, Range or your good marked shots). '
            + 'It is centred on that carry along your line to the target' + (TUNE.PLAYS_CENTER ? ' (where it lands today, with the plays-like wind, slope and temperature)' : '') + ': ' + pc(TUNE.DEPTH_PCT) + '% of the carry long and short, '
            + pc(TUNE.WIDTH_PCT) + '% of the carry left and right, tilted ' + TUNE.TILT_DEG + '° so your right side sits short and your left side sits long (mirrored if you play left-handed). '
            + 'A 178 7-iron: ±' + (Math.round(ex.b * 10) / 10) + ' deep, ±' + (Math.round(ex.a * 10) / 10) + ' wide. '
            + 'It shows only on an approach into the green, or a par-3 tee shot, with a 4-iron to a lob wedge - never from the tee on a par 4 or 5, never for driver, woods or hybrids, and not when the green is out of the club’s range.';
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
    // Is (side, along) inside the oval? (tests)
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

    // ---- 089: THE NOTE AND THE CLUB CHIPS (pure) ------------------------------------------
    // THE TWO CLUBS AROUND THE PLAYS-LIKE: the app's pick (My bag's suggestClub - the shortest club that
    // gets there) and the next club down (the longest carry under the pick's). bag: { club: { yd } }.
    // Returns [pick] or [pick, down] (club keys; the caller keeps only those My miss would draw), [] with no pick.
    function chipPair(bag, pick) {
        if (!pick) return [];
        var pv = bag && bag[pick], py = pv && isNum(pv.yd) && pv.yd > 0 ? pv.yd : null;
        if (py == null) return [pick];
        var down = null;
        Object.keys(bag).forEach(function (c) {
            var v = bag[c];
            if (c !== pick && v && isNum(v.yd) && v.yd > 0 && v.yd < py && (!down || v.yd > bag[down].yd)) down = c;
        });
        return down ? [pick, down] : [pick];
    }
    function nearAim(d) { return !isNum(d) || Math.abs(d) <= TUNE.NOTE_MIN_YD; }
    function shown(d, unit) { return Math.round(Math.abs(d) * (unit === 'm' ? 0.9144 : 1)); }
    // A CHIP: "7i +8 long" / "8i \u22124 short" / "7i on target" (delta: the oval centre minus the yards to
    // the aim, + = long).
    function chipText(short, delta, unit) {
        var n = shown(delta, unit);
        return String(short) + ' ' + (nearAim(delta) || n < 1 ? 'on target' : (delta > 0 ? '+' + n + ' long' : '\u2212' + n + ' short'));
    }
    // THE NOTE under the My miss label: "7-iron lands 8 yds long" (and "... and 3 yds right" when the
    // centre sits off the line - side + = right). '' within NOTE_MIN_YD both ways.
    function landNote(name, delta, side, unit) {
        var u = unit === 'm' ? ' m' : ' yds', parts = [];
        if (!nearAim(delta) && shown(delta, unit) >= 1) parts.push(shown(delta, unit) + u + (delta > 0 ? ' long' : ' short'));
        if (!nearAim(side) && shown(side, unit) >= 1) parts.push(shown(side, unit) + u + (side > 0 ? ' right' : ' left'));
        return parts.length ? String(name) + ' lands ' + parts.join(' and ') : '';
    }
    // THE STEPPED FADE: the oval at each TUNE.FADE size (same centre, tilt, hand) - largest first.
    function fadeOvals(f) {
        if (!f) return [];
        return TUNE.FADE.map(function (k) { var g = {}; Object.keys(f).forEach(function (x) { g[x] = f[x]; }); g.a = Math.max(0.5, f.a * k); g.b = Math.max(0.5, f.b * k); return g; });
    }

    // ---- 089b: THE CLUB CHIPS ACROSS THE GREEN'S DEPTH (pure) --------------------------------
    // WHERE A CLUB LANDS on the green: the nearest of front / middle / back, and how far past it (+) or
    // short of it (-). Short of the front: 'front' with a minus; past the back: 'back' with a plus.
    // { zone: 'front' | 'middle' | 'back', off } (yards).
    function landSpot(along, f, m, b) {
        if (!isNum(along) || !isNum(f) || !isNum(b)) return null;
        if (along < f) return { zone: 'front', off: along - f };
        if (along > b) return { zone: 'back', off: along - b };
        var mid = isNum(m) ? m : (f + b) / 2, c = [['front', along - f], ['middle', along - mid], ['back', along - b]];
        c.sort(function (x, y) { return Math.abs(x[1]) - Math.abs(y[1]); });
        return { zone: c[0][0], off: c[0][1] };
    }
    // A DEPTH CHIP: "LW · front +5", "SW · middle", "GW · back −1" (metres with unit 'm'). "middle" says no
    // number within TUNE.MIDDLE_YD; front / back always do (none at 0).
    function depthText(short, spot, unit) {
        if (!spot) return String(short);
        var n = shown(spot.off, unit), quiet = n < 1 || (spot.zone === 'middle' && n <= TUNE.MIDDLE_YD);
        return String(short) + ' · ' + spot.zone + (quiet ? '' : ' ' + (spot.off > 0 ? '+' : '−') + n);
    }
    // THE CHIPS FOR THE GREEN'S DEPTH. q: { bag ({ club: { yd } }), front, middle, back (yards on the ground
    // from the golfer's LIVE spot), aimYd (to the target point; else the middle), rawYd + playsYd (the yards
    // and the plays-like to the aim - where each carry lands today, as the oval's centre: centreAt), app (the
    // app's pick, wins a tie), edgeYd, max }.
    // Irons and wedges only. Every club landing front..back; plus the nearest one short of the front and the
    // nearest one long of the back, each within edgeYd of that edge.
    // MORE THAN max: (1) the club closest to the target; (2) the shortest and the longest landing ON the green
    // (so the chips span the depth); (3) the other on-green clubs, closest to the target first; (4) the edge
    // clubs off the green, the one nearer its edge first (a tie: the short one).
    // Returns null (no front / back: the caller keeps 089's pair) or { list: [{ club, carry, along, delta,
    // spot, on }] longest first, def (the club closest to the target) }.
    function depthChips(q) {
        q = q || {};
        var f = q.front, b = q.back, bag = q.bag || {};
        if (!isNum(f) || !isNum(b) || !(b > f)) return null;
        var m = isNum(q.middle) ? q.middle : (f + b) / 2, aim = isNum(q.aimYd) ? q.aimYd : m;
        var edge = isNum(q.edgeYd) ? q.edgeYd : TUNE.EDGE_YD, max = isNum(q.max) && q.max > 0 ? q.max : TUNE.MAX_CHIPS;
        var all = [];
        CLUBS.forEach(function (c) {
            var v = bag[c], cy = v && isNum(v.yd) && v.yd > 0 ? v.yd : null;
            if (cy == null) return;
            if (all.some(function (x) { return x.carry === cy; })) return;   // two clubs at one number: the first (longer) one
            var al = centreAt(cy, q.rawYd, q.playsYd);
            all.push({ club: c, carry: cy, along: al, delta: al - aim, spot: landSpot(al, f, m, b), on: al >= f && al <= b });
        });
        var on = all.filter(function (x) { return x.on; });
        var shortOne = null, longOne = null;
        all.forEach(function (x) {
            if (x.along < f && f - x.along <= edge && (!shortOne || x.along > shortOne.along)) shortOne = x;
            if (x.along > b && x.along - b <= edge && (!longOne || x.along < longOne.along)) longOne = x;
        });
        var cand = on.concat([shortOne, longOne].filter(Boolean));
        if (!cand.length) return { list: [], def: null };
        var near = function (x, y) { var d = Math.abs(x.delta) - Math.abs(y.delta); if (Math.abs(d) > 1e-9) return d; if (x.club === q.app) return -1; if (y.club === q.app) return 1; return y.carry - x.carry; };
        var def = cand.slice().sort(near)[0], pick = [def];
        var add = function (x) { if (x && pick.length < max && pick.indexOf(x) === -1) pick.push(x); };
        if (on.length) { add(on.reduce(function (a, x) { return x.along < a.along ? x : a; })); add(on.reduce(function (a, x) { return x.along > a.along ? x : a; })); }
        on.slice().sort(near).forEach(add);
        [shortOne, longOne].filter(Boolean).sort(function (x, y) { return (x === shortOne ? f - x.along : x.along - b) - (y === shortOne ? f - y.along : y.along - b) || (x === shortOne ? -1 : 1); }).forEach(add);
        return { list: pick.sort(function (x, y) { return y.carry - x.carry; }), def: def.club };
    }

    // 095 (Manny, Oct 28): THE PAR-3 SWITCHER STEPS THROUGH EVERY CLUB IN MY BAG (not only the ones landing on the
    // green). q: as depthChips, plus order (My bag's club keys; default CLUBS). Every club with a carry, duplicates
    // kept (each is a club in the bag). def: the club closest to the target (a tie: the app's pick, then the longer).
    // Returns null (no front / back) or { list: [{ club, carry, along, delta, spot, on }] longest first, def }.
    function allClubs(q) {
        q = q || {};
        var f = q.front, b = q.back, bag = q.bag || {};
        if (!isNum(f) || !isNum(b) || !(b > f)) return null;
        var m = isNum(q.middle) ? q.middle : (f + b) / 2, aim = isNum(q.aimYd) ? q.aimYd : m;
        var order = q.order && q.order.length ? q.order : CLUBS, all = [];
        order.forEach(function (c) {
            var v = bag[c], cy = v && isNum(v.yd) && v.yd > 0 ? v.yd : null;
            if (cy == null) return;
            var al = centreAt(cy, q.rawYd, q.playsYd);
            all.push({ club: c, carry: cy, along: al, delta: al - aim, spot: landSpot(al, f, m, b), on: al >= f && al <= b });
        });
        if (!all.length) return { list: [], def: null };
        var near = function (x, y) { var d = Math.abs(x.delta) - Math.abs(y.delta); if (Math.abs(d) > 1e-9) return d; if (x.club === q.app) return -1; if (y.club === q.app) return 1; return y.carry - x.carry; };
        var def = all.slice().sort(near)[0];
        return { list: all.slice().sort(function (x, y) { return y.carry - x.carry; }), def: def.club };
    }
    // 095: THE SWITCHER'S TEXT - on the green as depthText ("SW · middle +10"); off the green, where it lands:
    // "9i · 12 past the back" / "LW · 18 short of the front" (metres with unit 'm'; on the edge: depthText).
    function switchText(short, spot, unit) {
        if (!spot) return String(short);
        var n = shown(spot.off, unit);
        if (n >= 1 && spot.zone === 'front' && spot.off < 0) return String(short) + ' · ' + n + ' short of the front';
        if (n >= 1 && spot.zone === 'back' && spot.off > 0) return String(short) + ' · ' + n + ' past the back';
        return depthText(short, spot, unit);
    }

    // 089b: THE HELD FIX. last: { pt, at } (the phone's last fix, memory only). Its point while it is under
    // TUNE.HOLD_FIX_MS old (59 s: yes; 60 s or more: no), else null.
    function heldFix(last, nowMs, maxMs) {
        var lim = isNum(maxMs) ? maxMs : TUNE.HOLD_FIX_MS;
        if (!last || !last.pt || !isNum(last.at) || !isNum(nowMs)) return null;
        var age = nowMs - last.at;
        return age >= 0 && age < lim ? last.pt : null;
    }
    // 089b: THE NOTE WITH THE GREEN DEPTH, one line, the target first:
    // "Lob wedge: 17 yds short of the target · 5 yds onto the front". delta: the centre minus the yards to
    // the target (+ = long); spot: landSpot. "on target" within NOTE_MIN_YD; the middle with no number
    // within MIDDLE_YD ("the middle").
    function depthNote(name, delta, spot, unit) {
        var m = unit === 'm', yds = function (n) { return n + (m ? ' m' : (n === 1 ? ' yd' : ' yds')); };
        var n = shown(delta, unit), tg = nearAim(delta) || n < 1 ? 'on target' : yds(n) + (delta > 0 ? ' past the target' : ' short of the target');
        var sp = '';
        if (spot) {
            var k = shown(spot.off, unit), z = spot.zone;
            if (z === 'middle') sp = k <= TUNE.MIDDLE_YD ? 'the middle' : yds(k) + (spot.off > 0 ? ' past the middle' : ' short of the middle');
            else if (k < 1) sp = 'on the ' + z + ' edge';
            else if (z === 'front') sp = yds(k) + (spot.off > 0 ? ' onto the front' : ' short of the front');
            else sp = yds(k) + (spot.off < 0 ? ' inside the back' : ' past the back');
        }
        return String(name) + ': ' + tg + (sp ? ' · ' + sp : '');
    }

    var api = { TUNE: TUNE, CLUBS: CLUBS, KEY: KEY,
        chipPair: chipPair, depthChips: depthChips, allClubs: allClubs, switchText: switchText, heldFix: heldFix, depthNote: depthNote, depthText: depthText, landSpot: landSpot, chipText: chipText, landNote: landNote, fadeOvals: fadeOvals,
        isClub: isClub, oval: oval, centreAt: centreAt, margin: margin, inRange: inRange, shows: shows, tips: tips, bagLine: bagLine, infoText: infoText,
        outline: outline, inside: inside, isOn: isOn, setOn: setOn,
        AIM_PER_MPH: AIM_PER_MPH, hasMiss: hasMiss, point: point, shotStats: shotStats, statsLine: statsLine };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.HardPanMissPattern = api;
})();
