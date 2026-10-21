// ============================================================================
// URGENT-049 part 2 - THE WIND MATH (gps-wind-learn.js). Pure: known numbers only.
// Angle convention (Manny 8:44): where the wind comes FROM relative to the
// ball -> green-center line; 0 head, 90 from the right, 180 tail, 270 from the left.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const W = require('./gps-wind-learn.js');
const G = require('./gps-geo.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` got ${a}, want ${b} +/- ${tol}`);

// Seeded PRNG (mulberry32) + Box-Muller - the same set every run.
function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }

// ---- haversine / bearing against known points --------------------------------
test('haversine: known distances', () => {
    // 1 degree of latitude on the IUGG mean sphere = 111,195 m.
    near(G.haversineMeters([0, 0], [1, 0]), 111195, 2);
    // JFK -> LAX great circle ~ 3,974 km on a 6,371 km sphere.
    near(G.haversineMeters([40.6413, -73.7781], [33.9416, -118.4085]) / 1000, 3974, 6);
    // 150 yards due north on a golf hole: 137.16 m = 0.0012335 deg latitude.
    near(G.haversineYards([33.45, -111.9], [33.45 + 137.16 / 111195, -111.9]), 150, 0.05);
});

test('bearing: known points', () => {
    const tee = [33.45, -111.90];
    near(G.bearingDeg(tee, [33.46, -111.90]), 0, 1e-9, 'due north');
    near(G.bearingDeg(tee, [33.45, -111.89]), 90, 0.01, 'due east');
    near(G.bearingDeg(tee, [33.44, -111.90]), 180, 1e-9, 'due south');
    near(G.bearingDeg(tee, [33.45, -111.91]), 270, 0.01, 'due west');
    // Equator, 45 deg: equal small steps north and east.
    near(G.bearingDeg([0, 0], [0.001, 0.001]), 45, 0.01, 'northeast');
});

// ---- the angle -----------------------------------------------------------------
test('relAngle: Manny\'s unit tests - wind from 47, bearing 47 -> 0; bearing 137 -> 270', () => {
    assert.equal(W.relAngle(47, 47), 0);
    assert.equal(W.relAngle(47, 137), 270);
});

test('relAngle: the four sides, wrap-around, exact (never bucketed)', () => {
    assert.equal(W.relAngle(0, 0), 0);          // hole north, wind from north: head
    assert.equal(W.relAngle(90, 0), 90);        // hole north, wind from east: from the RIGHT
    assert.equal(W.relAngle(180, 0), 180);      // tail
    assert.equal(W.relAngle(270, 0), 270);      // from the LEFT
    assert.equal(W.relAngle(10, 350), 20);
    assert.equal(W.relAngle(350, 10), 340);
    assert.equal(W.relAngle(135, 47), 88);
    near(W.relAngle(47.3, 0), 47.3, 1e-12, 'exact');
    near(W.relAngle(-0.000001, 0), 359.999999, 1e-9, 'stays below 360');
    assert.ok(W.relAngle(-1e-15, 0) < 360);
    assert.equal(W.relAngle(null, 0), null);
});

test('relAngle from real points: the ball -> green-center line, recomputed per shot', () => {
    const ball = [33.45, -111.90], greenE = [33.45, -111.8957];   // green due east
    const b = G.bearingDeg(ball, greenE);
    near(W.relAngle(90, b), 0, 0.01, 'east wind into an eastward shot = head');
    near(W.relAngle(0, b), 270, 0.01, 'north wind on an eastward shot = from the LEFT');
    near(W.relAngle(180, b), 90, 0.01, 'south wind on an eastward shot = from the RIGHT');
});

// ---- components ------------------------------------------------------------------
test('components: 88 deg at 10 mph = 9.99 from the right + 0.35 head', () => {
    const c = W.components(10, 88);
    near(c.across, 9.99, 0.005); near(c.fromRight, 9.99, 0.005); assert.equal(c.fromLeft, 0);
    near(c.along, 0.35, 0.005); near(c.head, 0.35, 0.005); assert.equal(c.tail, 0);
});

test('components: head, tail, left, right split by sign', () => {
    assert.deepEqual(W.components(10, 0), { along: 10, across: 0, head: 10, tail: 0, fromLeft: 0, fromRight: 0 });
    assert.deepEqual(W.components(10, 90), { along: 0, across: 10, head: 0, tail: 0, fromLeft: 0, fromRight: 10 });
    assert.deepEqual(W.components(10, 180), { along: -10, across: 0, head: 0, tail: 10, fromLeft: 0, fromRight: 0 });
    assert.deepEqual(W.components(10, 270), { along: 0, across: -10, head: 0, tail: 0, fromLeft: 10, fromRight: 0 });
    const c = W.components(12, 225);   // behind-left
    near(c.tail, 12 * Math.SQRT1_2, 1e-9); near(c.fromLeft, 12 * Math.SQRT1_2, 1e-9);
});

test('components agree with gps-geo windRelative (whose cross is + = FROM THE LEFT)', () => {
    for (const [from, brg, mph] of [[47, 137, 10], [135, 47, 10], [300, 20, 18], [0, 0, 5]]) {
        const c = W.components(mph, W.relAngle(from, brg)), g = G.windRelative(from, brg, mph);
        near(c.along, g.head, 0.05); near(-c.across, g.cross, 0.05);
    }
});

// ---- the fit ---------------------------------------------------------------------
const TRUE = { stillAir: 160, head: -1.4, tail: 0.9, left: -0.8, right: -0.5 };
function synth(n, sd, seed, extra) {
    const r = rng(seed), out = [];
    for (let i = 0; i < n; i++) {
        const mph = 2 + r() * 18, rel = r() * 360, c = W.components(mph, rel);
        const carry = TRUE.stillAir + TRUE.head * c.head + TRUE.tail * c.tail + TRUE.left * c.fromLeft + TRUE.right * c.fromRight + sd * gauss(r);
        out.push({ carry, windMph: mph, relAngle: rel, club: '7i' });
    }
    for (const [mph, rel] of (extra || [])) {
        const c = W.components(mph, rel);
        out.push({ carry: TRUE.stillAir + TRUE.head * c.head + TRUE.tail * c.tail + TRUE.left * c.fromLeft + TRUE.right * c.fromRight, windMph: mph, relAngle: rel });
    }
    return out;
}
const pct = (got, want) => Math.abs(got - want) / Math.abs(want);
function report(label, f) {
    const row = ['head', 'tail', 'left', 'right'].map(k => `${k} ${f[k].toFixed(3)} (true ${TRUE[k]}, ${(100 * pct(f[k], TRUE[k])).toFixed(1)}%)`).join(' | ');
    console.log(`# ${label}: n=${f.n} windyN=${f.windyN} stillAir ${f.stillAir.toFixed(1)} (true ${TRUE.stillAir}) | ${row}`);
}

test('fit: noiseless synthetic set at random angles (incl. 88 deg) recovers all four exactly', () => {
    const f = W.fit(synth(30, 0, 7, [[10, 88], [15, 88]]));
    assert.ok(f.qualified);
    for (const k of ['head', 'tail', 'left', 'right']) near(f[k], TRUE[k], 1e-6, k);
    near(f.stillAir, 160, 1e-6);
    report('noiseless', f);
});

test('fit: noisy synthetic set (sd 3 yd, 400 shots, incl. 88 deg) recovers all four within 10%', () => {
    const f = W.fit(synth(400, 3, 49, [[10, 88], [20, 88]]));
    assert.ok(f.qualified);
    for (const k of ['head', 'tail', 'left', 'right']) assert.ok(pct(f[k], TRUE[k]) <= 0.10, `${k}: ${f[k]} vs ${TRUE[k]}`);
    near(f.stillAir, 160, 1);
    report('sd 3, 400 shots', f);
});

test('fit: across 20 random seeds (sd 1.5 yd, 400 shots) every coefficient within 10%', () => {
    let worst = 0;
    for (let s = 1; s <= 20; s++) {
        const f = W.fit(synth(400, 1.5, 1000 + s, [[10, 88]]));
        for (const k of ['head', 'tail', 'left', 'right']) { const p = pct(f[k], TRUE[k]); worst = Math.max(worst, p); assert.ok(p <= 0.10, `seed ${s} ${k}: ${f[k]}`); }
    }
    console.log(`# 20 seeds, sd 1.5, 400 shots: worst coefficient error ${(100 * worst).toFixed(1)}%`);
});

test('fit: a realistic season (40 shots, sd 3 yd) - informational', () => {
    const f = W.fit(synth(40, 3, 2026, [[10, 88]]));
    assert.ok(f.qualified);
    report('season-size 41 shots sd 3 (info only)', f);
});

test('fit: crosswinds never folded together - opposite signs come back opposite', () => {
    const shots = [];
    for (let i = 0; i < 24; i++) {
        const rel = [0, 90, 180, 270][i % 4], mph = 6 + (i % 7), c = W.components(mph, rel);
        shots.push({ carry: 150 - 1 * c.head + 0.5 * c.tail - 1.0 * c.fromLeft + 0.3 * c.fromRight, windMph: mph, relAngle: rel });
    }
    shots.push({ carry: 150, windMph: 0, relAngle: 0 });
    const f = W.fit(shots);
    near(f.left, -1.0, 1e-6); near(f.right, 0.3, 1e-6); near(f.head, -1, 1e-6); near(f.tail, 0.5, 1e-6);
});

test('fit: takes part 3 shot-log records (along / across, extra fields ignored) and opts', () => {
    const recs = synth(60, 0, 3).map(s => { const c = W.components(s.windMph, s.relAngle); return { carry: s.carry, along: c.along, across: c.across, course: 'x', hole: 3 }; });
    const f = W.fit(recs, { hand: 'L', carry: 160 });
    for (const k of ['head', 'tail', 'left', 'right']) near(f[k], TRUE[k], 1e-6, k);
    assert.equal(f.hand, 'L');
});

// ---- qualification ---------------------------------------------------------------
test('qualified = >= 8 shots with wind > 5 mph (exactly 5 does not count)', () => {
    const mk = (mph, i) => ({ carry: 150 + i, windMph: mph, relAngle: (i * 45) % 360 });
    const calm = Array.from({ length: 20 }, (_, i) => mk(3, i));
    const seven = calm.concat(Array.from({ length: 7 }, (_, i) => mk(10, i)));
    let f = W.fit(seven);
    assert.equal(f.windyN, 7); assert.equal(f.qualified, false); assert.equal(f.model, 'generic');
    for (const k of ['head', 'tail', 'left', 'right']) assert.equal(f[k], null, 'no own numbers before qualifying');
    f = W.fit(seven.concat([mk(5, 1)]));
    assert.equal(f.windyN, 7, '5 mph is not > 5'); assert.equal(f.qualified, false);
    f = W.fit(seven.concat([mk(5.1, 1)]));
    assert.equal(f.windyN, 8); assert.equal(f.qualified, true); assert.equal(f.model, 'learned');
    assert.equal(W.fit([]).qualified, false);
    // int-049: a carry with no wind reading is not skipped - it feeds n and still air only (noWind).
    assert.equal(W.fit([{ carry: 150 }, null, { carry: -3, windMph: 4, relAngle: 0 }]).skipped, 2);
    assert.equal(W.fit([{ carry: 150 }, null, { carry: -3, windMph: 4, relAngle: 0 }]).noWind, 1);
});

test('not qualified: stillAir backs out the GENERIC model; opts.carry gives generic coefficients', () => {
    // 150 carried into a 10 mph headwind: generic says a 150 shot plays 165 into it -> a 165 still-air swing.
    const f = W.fit([{ carry: 150, windMph: 10, relAngle: 0 }, { carry: 150, windMph: 10, relAngle: 0 }, { carry: 150, windMph: 10, relAngle: 0 }]);
    near(f.stillAir, 165, 1e-9);
    const t = W.fit([{ carry: 200, windMph: 10, relAngle: 180 }]);
    near(t.stillAir, 190, 1e-9, 'tail 10 mph: 200 carried = 190 still air (0.5%/mph)');
    const g = W.fit([], { carry: 150 });
    near(g.head, -1.5, 1e-9); near(g.tail, 0.75, 1e-9); assert.equal(g.left, 0); assert.equal(g.right, 0);
    assert.equal(g.model, 'generic'); assert.equal(g.qualified, false);
});

test('qualified but never hit downwind: tail stays null and plays-like uses generic for tail only', () => {
    const shots = [];
    for (let i = 0; i < 12; i++) { const rel = [0, 90, 270][i % 3], mph = 8 + i % 5, c = W.components(mph, rel); shots.push({ carry: 160 - 1.4 * c.head - 0.8 * c.fromLeft - 0.5 * c.fromRight, windMph: mph, relAngle: rel }); }
    shots.push({ carry: 160, windMph: 0, relAngle: 0 });
    const f = W.fit(shots);
    assert.ok(f.qualified); assert.equal(f.tail, null); near(f.head, -1.4, 1e-6);
    const t = W.windTerm(160, 10, 180, f, 'R');
    assert.equal(t.used.tail, 'generic'); assert.equal(t.used.head, 'learned');
    near(W.playsLike(160, 10, 180, f, 'R'), 160 - 0.005 * 160 * 10, 1e-9);
});

// ---- plays like ------------------------------------------------------------------
test('generic playsLike = today\'s gps-geo playsLike, any angle, both hands', () => {
    const r = rng(11);
    for (let i = 0; i < 2000; i++) {
        const D = 40 + r() * 260, mph = r() * 35, from = r() * 360, brg = r() * 360;
        const today = G.playsLike({ yards: D, windMph: mph, windFromDeg: from, shotBearingDeg: brg });
        const rel = W.relAngle(from, brg);
        for (const hand of ['R', 'L']) {
            const mine = W.playsLike(D, mph, rel, null, hand);
            near(mine, today.exact, 1e-9, `D ${D} mph ${mph} rel ${rel}`);
            assert.equal(Math.round(mine), today.yards, 'the number on screen is the same');
            near(W.windTerm(D, mph, rel, null, hand).yards, today.terms.wind, 1e-9);
        }
        // An unqualified fit is the generic model too.
        assert.equal(Math.round(W.playsLike(D, mph, rel, { qualified: false, head: -9, tail: 9, left: -9, right: -9 }, 'R')), today.yards);
    }
    // Same inputs as today's call: bit-for-bit identical.
    assert.equal(W.playsLike(150, 12, W.relAngle(30, 0), null, 'R'), G.playsLike({ yards: 150, windMph: 12, windFromDeg: 30, shotBearingDeg: 0 }).exact);
    // Extreme input: today's clamp (0.5 .. 1.6 x D) holds.
    assert.equal(W.playsLike(150, 200, 0, null, 'R'), G.playsLike({ yards: 150, windMph: 200, windFromDeg: 0, shotBearingDeg: 0 }).exact);
});

test('learned playsLike: speed x (along x head-or-tail + across x left-or-right)', () => {
    const k = { qualified: true, n: 14, head: -1.4, tail: 0.9, left: -0.8, right: -0.5 };
    near(W.playsLike(150, 10, 0, k, 'R'), 164, 1e-9, '10 head: costs 14 -> plays 164');
    near(W.playsLike(150, 10, 180, k, 'R'), 141, 1e-9, '10 tail: gains 9 -> plays 141');
    near(W.playsLike(150, 10, 270, k, 'R'), 158, 1e-9, '10 from the left: plays 158');
    near(W.playsLike(150, 10, 90, k, 'R'), 155, 1e-9, '10 from the right: plays 155');
    const c = W.components(10, 88);
    near(W.playsLike(150, 10, 88, k, 'R'), 150 + 1.4 * c.head + 0.5 * c.fromRight, 1e-9, '88 deg');
    near(W.playsLike(150, 10, 88, k, 'R'), 155.48, 0.01);
    assert.equal(W.playsLike(150, 0, 0, k, 'R'), 150, 'calm');
    assert.equal(W.windTerm(150, 10, 0, k).model, 'learned'); assert.equal(W.windTerm(150, 10, 0, k).n, 14);
});

test('hand changes only generic crosswind wording, never a generic number', () => {
    assert.equal(W.crossWording(270, 'R').side, 'left'); assert.equal(W.crossWording(270, 'R').harder, true);
    assert.equal(W.crossWording(90, 'R').harder, false);
    assert.equal(W.crossWording(270, 'L').harder, false); assert.equal(W.crossWording(90, 'L').harder, true);
    assert.equal(W.crossWording(0, 'R'), null);
    assert.equal(W.playsLike(150, 15, 270, null, 'R'), W.playsLike(150, 15, 270, null, 'L'));
});

// ---- pure ------------------------------------------------------------------------
test('pure: no DOM, storage, network, money or coordinates in gps-wind-learn.js', () => {
    const src = fs.readFileSync(path.join(__dirname, 'gps-wind-learn.js'), 'utf8').replace(/\/\/.*$/gm, '');
    for (const bad of [/document\./, /localStorage/, /sessionStorage/, /indexedDB/, /fetch\s*\(/, /XMLHttpRequest/, /firebase/i, /require\s*\(/, /money|settle|payout|score/i, /\blat\b|\blng\b|latitude|longitude/i]) {
        assert.ok(!bad.test(src), 'found ' + bad);
    }
    assert.equal(typeof W.relAngle, 'function');
});
