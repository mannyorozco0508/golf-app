// ============================================================================
// HARDPAN GPS - LAYUPS FROM YOU (014, switch layupFromYou)
//
// Manny's screenshot, hole 1 (par 5, 543): "Lay up to 150 = 393 from the tee" - nobody
// hits 393. gps-geo.layupFromYou counts each layup row as THE SHOT from the golfer's
// spot ("Lay up to 100 -> hit 135 · 9i"), plays-like'd, only shots from ~40 yds to the
// longest carry + 5%; from the target ring on the tee box or when nothing fits.
// tools/gps-hazards-check.js opens the sheet in headless Chrome.
// ============================================================================
'use strict';
const test0 = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ON = fs.existsSync(path.join(__dirname, 'gps-geo.js'));
const geo = ON ? require('./gps-geo.js') : null;
const test = (name, fn) => test0(name, { skip: ON ? false : 'Consumer tree (GPS_ENABLED=0): no gps-geo.js' }, fn);
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const YD = 0.9144;
const north = (p, m) => [p[0] + (m / geo.EARTH_RADIUS_M) * 180 / Math.PI, p[1]];
const east = (p, m) => [p[0], p[1] + (m / (geo.EARTH_RADIUS_M * Math.cos(p[0] * Math.PI / 180))) * 180 / Math.PI];
const yds = (rows) => rows.map((r) => Math.round(r.needYd));
const bagApi = () => {
    const store = {};
    const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const sb = { localStorage, JSON, Object, Math, Number, String, Date, isFinite };
    sb.window = sb; vm.createContext(sb); vm.runInContext(read('gps-shots.js'), sb);
    return sb.HardPanGpsBag;
};

// Hole 1: a par 5, 543 yds, straight north. The target ring 260 from the tee.
const TEE = [33.6, -79.0];
const GREEN = () => north(TEE, 543 * YD);
const at = (yd) => north(TEE, (543 - yd) * YD);           // a spot `yd` from the green
const base = (o) => Object.assign({ tee: TEE, green: GREEN(), unitM: YD, maxYd: 250 }, o);

test('par 5 from the tee: no "393 from the tee" - the rows count from the target ring (283 out), header distance = 260', () => {
    const p = geo.layupFromYou(base({ from: { pt: east(TEE, 3), kind: 'me' }, target: north(TEE, 260 * YD) }));
    assert.equal(p.from, 'target');
    assert.equal(geo.shownDistance(p.fromM, 'yd'), '260');
    assert.deepEqual(p.rows.map((r) => r.name), ['Lay up to 50', 'Lay up to 75', 'Lay up to 100', 'Lay up to 125', 'Lay up to 150']);
    assert.deepEqual(yds(p.rows), [233, 208, 183, 158, 133]);
    // Measured from the tee (no fix / off the hole): the same - from the target.
    assert.equal(geo.layupFromYou(base({ from: { pt: TEE, kind: 'tee' }, target: north(TEE, 260 * YD) })).from, 'target');
    // On the tee with no target ring: from the tee, and nothing fits (493 .. 393).
    const t = geo.layupFromYou(base({ from: { pt: TEE, kind: 'me' }, target: null }));
    assert.equal(t.from, 'tee'); assert.deepEqual(t.rows, []); assert.equal(t.near, false);
});

test('mid-fairway 260 out: the five rows, 210 .. 110, from you', () => {
    const p = geo.layupFromYou(base({ from: { pt: at(260), kind: 'me' }, target: north(at(260), 200 * YD) }));
    assert.equal(p.from, 'me');
    assert.deepEqual(yds(p.rows), [210, 185, 160, 135, 110]);
    assert.ok(p.rows.every((r) => r.kind === 'leave' && r.pl === null), 'no air: raw yards');
});

test('inside 140: only the reachable ones (no shot under 40); green inside ~90: close enough, no rows', () => {
    assert.deepEqual(geo.layupFromYou(base({ from: { pt: at(141), kind: 'me' } })).rows.map((r) => [r.leave, Math.round(r.needYd)]), [[50, 91], [75, 66], [100, 41]]);
    const n = geo.layupFromYou(base({ from: { pt: at(80), kind: 'me' } }));
    assert.deepEqual(n.rows, []); assert.equal(n.near, true);
});

test('the top limit: the longest carry + 5%; nothing fits and no target ring = empty ("Too far to lay up yet")', () => {
    // Longest carry 200 -> 210: from 300 out only 175 and 150 leave a shot short enough.
    assert.deepEqual(geo.layupFromYou(base({ from: { pt: at(300), kind: 'me' }, maxYd: 200 })).rows.map((r) => r.leave), [100, 125, 150]);
    const far = geo.layupFromYou(base({ from: { pt: at(450), kind: 'me' }, maxYd: 200 }));
    assert.equal(far.from, 'me'); assert.deepEqual(far.rows, []); assert.equal(far.near, false);
    // ... but with the target ring ahead: from it.
    const ring = geo.layupFromYou(base({ from: { pt: at(450), kind: 'me' }, maxYd: 200, target: at(250) }));
    assert.equal(ring.from, 'target'); assert.deepEqual(yds(ring.rows), [200, 175, 150, 125, 100]);
    // A ring behind the golfer never counts.
    assert.equal(geo.layupFromYou(base({ from: { pt: at(450), kind: 'me' }, maxYd: 200, target: at(480) })).from, 'me');
});

test('plays-like: the same playsLike as the main number, per row (wind on its own line, the heights at both ends)', () => {
    const air = { windMph: 10, windFromDeg: 0, tempF: 70 };   // straight into the face
    const p = geo.layupFromYou(base({ from: { pt: at(260), kind: 'me' }, maxYd: 300, air, fromFt: 100, elevAt: () => 112 }));
    assert.deepEqual(p.rows.map((r) => Math.round(r.rawYd)), [210, 185, 160, 135, 110]);
    p.rows.forEach((r) => {
        const want = geo.playsLike({ yards: r.rawYd, windMph: 10, windFromDeg: 0, tempF: 70, shotBearingDeg: 0, elevFromFt: 100, elevToFt: 112 });
        assert.ok(Math.abs(r.needYd - want.exact) < 0.3, r.name + ' ' + r.needYd + ' vs ' + want.exact);
    });
    assert.equal(Math.round(p.rows[0].needYd), Math.round(210 * 1.1 + 4), '10 mph into: +10%, 12 ft up: +4');
    // The filter is on the shot needed: into this wind, 210 plays 235 - past a 220 carry + 5%.
    assert.deepEqual(geo.layupFromYou(base({ from: { pt: at(260), kind: 'me' }, maxYd: 220, air })).rows.map((r) => r.leave), [75, 100, 125, 150]);
});

test('lay up short of a hazard: 10 yds short of its near edge, on the line; never a greenside bunker or one behind', () => {
    const me = at(260);
    const hz = [{ type: 'w', side: 'L', pt: east(north(me, 180 * YD), -15) }, { type: 'w', side: 'L', pt: east(north(me, 200 * YD), -15) },
        { type: 'fb', side: 'R', pt: east(north(me, -30 * YD), 10) }, { type: 'gb', side: 'C', pt: north(me, 250 * YD) }];
    const p = geo.layupFromYou(base({ from: { pt: me, kind: 'me' }, hazards: hz }));
    assert.deepEqual(p.rows.map((r) => [r.name, Math.round(r.needYd)]), [['Lay up to 50', 210], ['Lay up to 75', 185], ['Lay up short of water left', 170], ['Lay up to 100', 160], ['Lay up to 125', 135], ['Lay up to 150', 110]]);
});

test('no bag: the bag setup\'s carries for the handicap; the club for each row is suggestClub\'s', () => {
    const B = bagApi();
    const d = B.defaultCarries(15), bag = {};
    Object.keys(d).forEach((c) => { bag[c] = { yd: d[c] }; });
    const maxYd = Math.max.apply(null, Object.values(d));
    assert.equal(maxYd, d.Dr);
    const p = geo.layupFromYou(base({ from: { pt: at(260), kind: 'me' }, maxYd }));
    assert.deepEqual(yds(p.rows), [210, 185, 160, 135, 110]);
    assert.deepEqual(p.rows.map((r) => B.SHORT[B.suggestClub(bag, r.needYd).club]), ['Dr', '5W', '5i', '7i', 'PW']);
    // A 30-handicap's driver (185 -> 194): only 185 and under.
    assert.deepEqual(geo.layupFromYou(base({ from: { pt: at(260), kind: 'me' }, maxYd: B.defaultCarries(30).Dr })).rows.map((r) => r.leave), [75, 100, 125, 150]);
});

test('meters: lay up to 50 / 75 / ... meters, the shot in meters', () => {
    const me = north(TEE, 100), green = north(TEE, 360);
    const p = geo.layupFromYou({ from: { pt: me, kind: 'me' }, tee: TEE, green, unitM: 1, maxYd: 260 });
    assert.deepEqual(p.rows.map((r) => [r.leave, Math.round(r.needYd * YD)]), [[50, 210], [75, 185], [100, 160], [125, 135], [150, 110]]);
});

test('gps-view: behind layupFromYou (off = the 008 rows), tournament mode = raw yards and no club, the headers and the empty line', () => {
    const v = read('gps-view.js');
    assert.ok(/HardPanFeature\('layupFromYou'\) !== false/.test(v));
    assert.ok(/if \(layupSwitch\(\) && G\.layupFromYou\) \{ fillLayups\(/.test(v), 'switch on: the new rows');
    assert.ok(/'Lay up to ' \+ l\.leave \+ sfx, '= ' \+ d\(l\.fromM\) \+ sfx \+ ' ' \+ who/.test(v), 'switch off: today\'s rows, untouched');
    const fn = v.slice(v.indexOf('function fillLayups'), v.indexOf('function drawHoleAsk'));
    assert.ok(/var tq = tournament\(\), clubs = !tq && bagSwitch\(\)/.test(fn) && /var pl = !tq && S\.pro/.test(fn) && /air: pl \? playsAir\(effectiveWind\(\), r\) : null/.test(fn), 'tournament: no club, no plays-like');
    assert.ok(/'From your target \(' \+ d\(plan\.fromM\) \+ sfx \+ '\)'/.test(fn) && /'Too far to lay up yet\. This updates after your next shot\.'/.test(fn));
    assert.ok(/B\.defaultCarries\(bagHcp\(\)\)/.test(v), 'no bag: the handicap defaults');
    assert.ok(!/fetch\(|\.ref\(|setItem\(/.test(fn), 'nothing fetched or stored');
    const cfg = { }; cfg.window = cfg; vm.createContext(cfg); vm.runInContext(read('gps-config.js'), cfg);
    assert.strictEqual(cfg.HARDPAN_GPS_CONFIG.features.layupFromYou, true, 'ships on');
});
