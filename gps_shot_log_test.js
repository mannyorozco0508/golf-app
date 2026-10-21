// ============================================================================
// HARDPAN GPS - THE SHOT LOG + WHAT IT TEACHES MY BAG (URGENT-049 part 3)
//
// gps-shot-log.js HardPanShotLog, gps-wind-learn.js HardPanWindLearn (049 part 2) and
// gps-shot-bag.js HardPanShotBag in a sandbox (the phone's storage only):
//   the angle convention as stored (47/47 -> 0, 47/137 -> 270), the decomposition
//   (88 deg at 10 mph = 9.99 from the right + 0.35 head), the four coefficients recovered
//   within 10% from a synthetic log (random angles incl. 88), qualification (8 windy shots),
//   a Skip (no club) never counts, delete, the filters, handedness, My bag's numbers
//   (learned still-air carry, a typed number wins, Reset back to the old number), the
//   plays-like wind swap, the (i) text - and THE GUARD: no position is ever stored, nothing
//   is sent.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'gps-shot-log.js'));
const skip = ON ? false : 'Consumer tree: no GPS';
function sandbox() {
    const store = {};
    const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const sb = { localStorage, JSON, Object, Math, Number, String, Date, isFinite, Array };
    sb.window = sb;
    vm.createContext(sb);
    ['gps-shots.js', 'gps-shot-log.js', 'gps-wind-learn.js', 'gps-shot-bag.js'].forEach((f) => vm.runInContext(read(f), sb));
    return { L: sb.HardPanShotLog, WL: sb.HardPanWindLearn, SB: sb.HardPanShotBag, B: sb.HardPanGpsBag, store };
}
const plain = (x) => JSON.parse(JSON.stringify(x));
function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
// A synthetic club: carry = still + K . components + noise, at random angles (the first at 88 deg).
function seed(L, WL, o) {
    const r = rng(o.seed || 11), K = o.K;
    for (let i = 0; i < o.n; i++) {
        const rel = i === 0 ? 88 : r() * 360, mph = o.mph ? o.mph(i, r) : 6 + r() * 14, c = WL.components(mph, rel);
        const carry = o.still + K.head * c.head + K.tail * c.tail + K.left * c.fromLeft + K.right * c.fromRight + (r() - 0.5) * (o.noise || 2);
        assert.ok(L.add({ golfer: o.golfer || 'Manny', club: o.club, carry, windMph: mph, relAngle: rel, course: 'Papago', hole: 1 + (i % 18), date: Date.UTC(2026, 9, 1) + i * 3600e3 }));
    }
}

test('the angle as stored: wind from 47 on a 47 line = 0 (headwind); on a 137 line = 270 (from the left)', { skip }, () => {
    const { L } = sandbox();
    L.add({ club: '7i', carry: 150, windMph: 10, windFromDeg: 47, bearingDeg: 47 });
    L.add({ club: '7i', carry: 150, windMph: 10, windFromDeg: 47, bearingDeg: 137, date: Date.now() + 1 });
    const [b, a] = L.list({ club: '7i' });
    assert.equal(a.relAngle, 0); assert.equal(a.along, 10); assert.equal(a.across, 0);
    assert.equal(b.relAngle, 270); assert.equal(b.along, 0); assert.equal(b.across, -10, 'across - = from the left');
    assert.equal(L.dirOf(a.relAngle, 10), 'head'); assert.equal(L.dirOf(b.relAngle, 10), 'left');
    assert.equal(L.dirOf(180, 10), 'tail'); assert.equal(L.dirOf(90, 10), 'right'); assert.equal(L.dirOf(90, 0), null, 'calm has no side');
    // exact angles kept (never a bucket)
    L.add({ club: '7i', carry: 150, windMph: 10, relAngle: 88.37 });
    assert.ok(L.list({ club: '7i' }).some((s) => s.relAngle === 88.4));
});

test('the decomposition: 88 deg at 10 mph = 9.99 from the right + 0.35 head', { skip }, () => {
    const { L } = sandbox();
    L.add({ club: '7i', carry: 160, windMph: 10, relAngle: 88 });
    const s = L.list()[0];
    assert.equal(s.along, 0.35); assert.equal(s.across, 9.99);
});

test('the four coefficients come back within 10% from a synthetic log (random angles incl. 88)', { skip }, () => {
    const { L, WL, SB } = sandbox();
    const K = { head: -1.4, tail: 0.9, left: -0.6, right: -0.3 };
    seed(L, WL, { club: '7i', still: 163, K, n: 80 });
    const f = SB.clubFit('Manny', '7i');
    assert.ok(f.qualified);
    ['head', 'tail', 'left', 'right'].forEach((k) => assert.ok(Math.abs(f[k] - K[k]) <= Math.abs(K[k]) * 0.1, k + ' ' + f[k] + ' vs ' + K[k]));
    assert.ok(Math.abs(f.stillAir - 163) <= 2, 'still-air carry ' + f.stillAir);
    assert.match(SB.windLine(f).text, /^wind: head −1\.\d · tail \+0\.9 · from left −0\.\d · from right −0\.\d yd\/mph$/);
});

test('qualification: 7 windy shots = generic; the 8th (> 5 mph) = learned; calm shots never count toward it', { skip }, () => {
    const { L, WL, SB } = sandbox();
    seed(L, WL, { club: '6i', still: 172, K: { head: -1.2, tail: 0.8, left: -0.5, right: -0.4 }, n: 6, mph: () => 3 });
    seed(L, WL, { club: '6i', still: 172, K: { head: -1.2, tail: 0.8, left: -0.5, right: -0.4 }, n: 7, seed: 5 });
    let f = SB.clubFit('Manny', '6i');
    assert.equal(f.windyN, 7); assert.equal(f.qualified, false);
    assert.equal(SB.windLine(f).text, 'wind: generic · 7 of 8 windy shots');
    const it = SB.infoText('Manny', '6i', null);
    assert.equal(it.learned, false); assert.equal(it.text, 'Generic wind model — 1 more windy 6-iron shot to learn yours');
    L.add({ golfer: 'Manny', club: '6i', carry: 165, windMph: 12, relAngle: 10 });
    f = SB.clubFit('Manny', '6i');
    assert.equal(f.windyN, 8); assert.equal(f.qualified, true);
    assert.match(SB.infoText('Manny', '6i', { mph: 9, rel: 2 }).text, /^From your 14 marked 6-iron shots: .* Wind now: 9 mph into you \(2°\)\.$/);
});

test('Skip = position only: a mark with no club is never a data point', { skip }, () => {
    const { L, store } = sandbox();
    assert.equal(L.add({ carry: 150, windMph: 10, relAngle: 0 }), null, 'no club');
    assert.equal(L.add({ club: '', carry: 150 }), null);
    assert.equal(L.add({ club: 'skip', carry: 150 }), null);
    assert.equal(L.add({ club: '7i' }), null, 'no carry (the carry is closed by the next mark)');
    assert.equal(L.add({ club: '7i', carry: 0 }), null);
    assert.equal(L.add({ club: '7i', carry: 600 }), null);
    assert.equal(L.list().length, 0);
    assert.ok(!store[L.KEY] || JSON.parse(store[L.KEY]).golfers.me === undefined);
});

test('delete (swipe) removes exactly that shot; reset clears a club; per golfer', { skip }, () => {
    const { L } = sandbox();
    const a = L.add({ club: '7i', carry: 150, date: 1 }), b = L.add({ club: '7i', carry: 160, date: 2 }), c = L.add({ club: '8i', carry: 140, date: 3 });
    L.add({ golfer: 'Ann', club: '7i', carry: 120 });
    assert.ok(a && b && c && a !== b);
    assert.equal(L.remove(a), true);
    assert.deepEqual(L.list({ club: '7i' }).map((s) => s.id), [b]);
    assert.equal(L.remove('nope'), false);
    assert.deepEqual(Object.keys(L.byClub()).sort(), ['7i', '8i']);
    L.reset('7i');
    assert.deepEqual(Object.keys(L.byClub()), ['8i']);
    assert.equal(L.list({ golfer: 'Ann' }).length, 1, 'another golfer untouched');
});

test('the filters: strength calm / 5-10 / 10-15 / 15+ and head / tail / from left / from right; newest first', { skip }, () => {
    const { L } = sandbox();
    [[0, 0], [4, 0], [5, 0], [9.9, 180], [10, 270], [14.9, 90], [15, 300], [22, 120]].forEach((w, i) => L.add({ club: '7i', carry: 150 + i, windMph: w[0], relAngle: w[1], date: i }));
    const yds = (f) => L.list(Object.assign({ club: '7i' }, f)).map((s) => s.carry);
    assert.deepEqual(yds({ strength: 'calm' }), [151, 150]);
    assert.deepEqual(yds({ strength: '5-10' }), [153, 152]);
    assert.deepEqual(yds({ strength: '10-15' }), [155, 154]);
    assert.deepEqual(yds({ strength: '15+' }), [157, 156]);
    assert.deepEqual(yds({ dir: 'head' }), [152, 151]);
    assert.deepEqual(yds({ dir: 'tail' }), [153]);
    assert.deepEqual(yds({ dir: 'left' }), [156, 154]);
    assert.deepEqual(yds({ dir: 'right' }), [157, 155]);
    assert.deepEqual(yds({ strength: '15+', dir: 'left' }), [156]);
});

test('handedness: right-handed by default, left-handed kept with the golfer', { skip }, () => {
    const { L } = sandbox();
    assert.equal(L.hand('Manny'), 'R');
    assert.equal(L.setHand('Manny', 'L'), true);
    assert.equal(L.hand('manny '), 'L', 'same golfer key as My bag');
    assert.equal(L.hand('Ann'), 'R');
    assert.equal(L.setHand('Manny', 'X'), false);
});

test("My bag: a club's learned still-air carry from 3+ logged shots; a typed number wins; Reset (log) goes back to the old number", { skip }, () => {
    const { L, B, SB } = sandbox();
    B.setup('Manny', { '7i': 150, '8i': 140 });
    assert.equal(SB.mergeBag(B.bag('Manny'), 'Manny')['7i'].yd, 150);
    [160, 162, 164].forEach((y) => L.add({ golfer: 'Manny', club: '7i', carry: y }));
    const m = SB.mergeBag(B.bag('Manny'), 'Manny');
    assert.deepEqual(plain(m['7i']), { yd: 162, n: 3, set: false, log: true, qualified: false });
    assert.equal(B.source(m['7i']), 'learned');
    assert.equal(B.suggestClub(m, 158).club, '7i', 'the suggestion uses it');
    B.set('Manny', '7i', 155);
    assert.equal(SB.mergeBag(B.bag('Manny'), 'Manny')['7i'].yd, 155, 'typed wins');
    B.set('Manny', '7i', null);
    L.reset('7i', 'Manny');
    assert.equal(SB.mergeBag(B.bag('Manny'), 'Manny')['7i'].yd, 150, 'back to the old number');
});

test("plays-like: a qualified club swaps in the golfer's own wind term; otherwise unchanged", { skip }, () => {
    const { L, WL, SB } = sandbox();
    const pl = { yards: 162, exact: 149 + 13.41, terms: { wind: 13.41 } };
    const o = { yards: 149, mph: 9, fromDeg: 47, bearingDeg: 47, golfer: 'Manny', club: '7i' };
    assert.equal(SB.adjust(pl, o), pl, 'no shots: generic, untouched');
    seed(L, WL, { club: '7i', still: 163, K: { head: -2, tail: 0.9, left: -0.6, right: -0.3 }, n: 40 });
    const p2 = SB.adjust(pl, o), f = SB.clubFit('Manny', '7i');
    assert.ok(p2.learned && p2.learned.n === 40);
    assert.ok(Math.abs(p2.terms.wind - (-f.head * 9)) < 1e-6, 'headwind 9 mph: -head x 9');
    assert.ok(Math.abs(p2.exact - (149 - f.head * 9)) < 1e-6);
    assert.ok(p2.exact > pl.exact, 'his 7-iron loses more into the wind than the generic 1%/mph');
});

test('THE GUARD: a record keeps distances and wind only - no position, nothing sent', { skip }, () => {
    const { L, store } = sandbox();
    L.add({ club: '7i', carry: 150, windMph: 8, relAngle: 30, p: [33.45, -111.95], lat: 33.45, lng: -111.95, pt: [1, 2], from: [33, -111], course: 'Papago', hole: 3 });
    const raw = store[L.KEY];
    assert.ok(raw);
    assert.ok(!/33\.45|111\.95|"p"|"lat"|"lng"|"pt"|"from"/.test(raw), raw);
    assert.deepEqual(Object.keys(L.list()[0]).sort(), ['across', 'along', 'bearingDeg', 'carry', 'club', 'course', 'date', 'elevFt', 'hole', 'id', 'relAngle', 'tempF', 'windFromDeg', 'windMph', 'wxHour']);
    ['gps-shot-log.js', 'gps-shot-bag.js'].forEach((f) => {
        const src = read(f).replace(/\/\/.*$/gm, '');
        assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|\.ref\(|firebase|\.set\(|\.push\(\{|navigator\.geolocation/.test(src.replace(/g\.shots\.push\(c\)/, '')), f + ' sends nothing');
    });
});

test('a season of shots: ~250 bytes a record; 1,000 shots well under a phone limit', { skip }, () => {
    const { L, WL } = sandbox();
    seed(L, WL, { club: '7i', still: 160, K: { head: -1, tail: 1, left: -0.5, right: -0.5 }, n: 1000 });
    const b = L.bytes('Manny');
    assert.ok(b > 150 * 1000 && b < 320 * 1000, b + ' bytes');
});

test('shell lists: the three 049 files are cached for offline and synced to the GPS app', { skip }, () => {
    ['gps-shot-log.js', 'gps-wind-learn.js', 'gps-shot-bag.js'].forEach((f) => {
        assert.ok(read('sw.js').includes("'./" + f + "'"), 'sw.js ' + f);
        assert.equal(read('sync-mobile-web.js').split("'" + f + "'").length - 1, 2, 'both lists ' + f);
    });
});
