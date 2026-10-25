// ============================================================================
// HARDPAN GPS - MAILBOX 012 PARTS 3-5: THE SIMPLE PLAYS-LIKE LINE, ELEVATION PER LEG,
// AND "MY DISTANCES ARE FROM" (the altitude baseline in My bag)
//
// gps-geo.js (pure) and gps-shots.js (HardPanGpsBag, in a sandbox) hold the numbers;
// gps-view.js is read as source for the wiring (switches, tournament mode, what is sent).
// tools/gps-playslike-check.js plays it in headless Chrome.
// ============================================================================
'use strict';
const test0 = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ON = fs.existsSync(path.join(__dirname, 'gps-geo.js'));
const geo = ON ? require('./gps-geo.js') : null;
const test = (name, fn) => test0(name, { skip: ON ? false : 'Consumer tree (GPS_ENABLED=0): no gps-geo.js' }, fn);
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const fnSrc = (src, name) => { const i = src.indexOf('function ' + name + '('); assert.ok(i > 0, name); return src.slice(i, src.indexOf('\n    }\n', i)); };

// ---- PART 3: "Plays like 249y" ----------------------------------------------------
test('012-3 playsText: only "Plays like 249y" (meters "...m"); nothing without a plays-like', () => {
    const pl = geo.playsLike({ yards: 240, elevFromFt: 100, elevToFt: 118, windMph: 6, windFromDeg: 90, shotBearingDeg: 90, tempF: 80 });
    assert.strictEqual(geo.playsText(pl), 'Plays like ' + Math.round(pl.exact) + 'y');
    assert.strictEqual(geo.playsText(geo.playsLike({ yards: 249, tempF: 70 })), 'Plays like 249y');
    assert.strictEqual(geo.playsText(geo.playsLike({ yards: 249, tempF: 70 }), 'm'), 'Plays like ' + Math.round(249 * geo.M_PER_YD) + 'm');
    assert.strictEqual(geo.playsText(null), '');
    assert.ok(!/aim|wind|uphill|→|·/.test(geo.playsText(pl)), 'no club, no aim, no parts');
});
test('012-3 playsInfoRows: the (i) sheet\'s breakdown - the shot, slope, wind with speed, temperature vs its baseline, the aim-off', () => {
    const pl = geo.playsLike({ yards: 150, elevFromFt: 100, elevToFt: 118, windMph: 6, windFromDeg: 90, shotBearingDeg: 90, tempF: 80 });
    assert.deepStrictEqual(geo.playsInfoRows({ pl, yards: 150, windMph: 6, tempF: 80, aim: { yd: 4, side: 'left' }, label: 'You → green' }),
        ['You → green: 150 yds, plays like ' + Math.round(pl.exact), 'Uphill: +6', 'Into the wind (6 mph): +9', 'Warm (80°F vs 70°F): −1', 'Crosswind: aim 4 yds left']);
    const dn = geo.playsLike({ yards: 150, elevFromFt: 118, elevToFt: 100, windMph: 6, windFromDeg: 270, shotBearingDeg: 90, tempF: 50 });
    assert.deepStrictEqual(geo.playsInfoRows({ pl: dn, yards: 150, windMph: 6, tempF: 50 }).slice(1), ['Downhill: −6', 'Downwind (6 mph): −4', 'Cold (50°F vs 70°F): +3']);
    assert.deepStrictEqual(geo.playsInfoRows({ pl: null }), []);
    assert.strictEqual(geo.playsInfoRows({ pl, yards: 150, unit: 'm' })[0], 'This shot: 137 m, plays like ' + Math.round(pl.exact * geo.M_PER_YD));
});
test('012-3 gps-view: behind playsSimple the line is playsText only (no club, no aim); off = the 009 line; one API for every layout', () => {
    if (!fs.existsSync(path.join(__dirname, 'gps-view.js'))) return;
    const v = read('gps-view.js');
    assert.ok(/HardPanFeature\('playsSimple'\)/.test(v));
    const sb = fnSrc(v, 'syncBreakdown');
    const simple = sb.slice(sb.indexOf('if (pl && simpleSwitch()) {'), sb.indexOf('} else if (pl) {'));
    assert.ok(simple.length > 20 && /G\.playsText(Elev)?\(pl, units\(\)/.test(simple), 'the simple branch');   // 070 part 2: playsTextElev = playsText + " · elev ..."
    assert.ok(!/suggestClub|windAim|playsParts|plClub = true/.test(simple), 'no club, no aim-off, no parts on the simple line');
    assert.ok(/G\.playsParts\(pl, has \? w\.mph : null, units\(\)\)/.test(sb), 'off: the 009 line is still there');
    // The (i) sheet carries the breakdown.
    assert.ok(/<div class="gps-plinfo-now"/.test(v) && /G\.playsInfoRows\(/.test(fnSrc(v, 'playsInfoNow')));
    assert.ok(/if \(tournament\(\) \|\| !S \|\| !S\.pro/.test(fnSrc(v, 'playsInfoNow')), 'never in tournament mode');
    // The API layouts C and D read.
    assert.ok(/playsLine: function \(\) \{ try \{ return playsLineNow\(\); \}/.test(v) && /playsClub: function \(\) \{ try \{ return playsClubNow\(\); \}/.test(v) && /openPlaysInfo: function/.test(v));
    assert.ok(/if \(tournament\(\) \|\| !S \|\| !S\.pro \|\| S\.mode !== 'measure'\) return null;/.test(fnSrc(v, 'playsLineNow')), 'tournament mode: null');
    assert.ok(/p\.from !== 'me'/.test(fnSrc(v, 'playsClubNow')) && /tournament\(\)/.test(fnSrc(v, 'playsClubNow')), 'the club: from the golfer, never in tournament mode');
    ['playsLineNow', 'playsClubNow', 'playsInfoNow', 'fillPlaysInfo'].forEach((n) => assert.ok(!/fetch\(|\.ref\(/.test(fnSrc(v, n)), n + ' sends nothing'));
});
test('012-3 My bag: a short club name for the pill', () => {
    if (!fs.existsSync(path.join(__dirname, 'gps-shots.js'))) return;
    const vm = require('vm'), sb = { JSON, Object, Math, Number, String, Date, isFinite, localStorage: { getItem: () => null, setItem: () => {} } };
    sb.window = sb; vm.createContext(sb); vm.runInContext(read('gps-shots.js'), sb);
    const B = sb.HardPanGpsBag;
    assert.strictEqual(JSON.stringify(Object.keys(B.SHORT)), JSON.stringify(B.BAG));
    assert.strictEqual(B.SHORT['3w'], '3W'); assert.strictEqual(B.SHORT['7i'], '7i');
});

// ---- PART 4: ELEVATION PER LEG ------------------------------------------------------
const north = (p, m) => [p[0] + (m / geo.EARTH_RADIUS_M) * 180 / Math.PI, p[1]];
const east = (p, m) => [p[0], p[1] + (m / (geo.EARTH_RADIUS_M * Math.cos(p[0] * Math.PI / 180))) * 180 / Math.PI];
const YD = 0.9144;
test('012-4a playsLegs: two legs - you -> target, target -> green - each its own distance, bearing (its own wind) and heights', () => {
    const me = [33.6, -79.0], tgt = north(me, 200 * YD), green = east(tgt, 100 * YD);   // a dogleg right
    const air = { windMph: 10, windFromDeg: 0 };   // from the north: into leg 1, across leg 2
    const lg = geo.playsLegs({ from: me, target: tgt, green, fromFt: 100, targetFt: 130, greenFt: 115, minYd: 30, air });
    assert.strictEqual(lg.single, false);
    assert.ok(Math.abs(lg.toTarget.yards - 200) < 0.5 && Math.abs(lg.toGreen.yards - 100) < 0.5);
    assert.ok(Math.abs(lg.toTarget.bearing - 0) < 0.5 && Math.abs(lg.toGreen.bearing - 90) < 0.5, 'each leg its own bearing');
    // 4d: the target leg UPHILL (+30 ft = +10), the green leg DOWNHILL (-15 ft = -5).
    assert.ok(Math.abs(lg.toTarget.pl.terms.elev - 10) < 1e-9 && Math.abs(lg.toGreen.pl.terms.elev + 5) < 1e-9);
    // Into the wind on leg 1 (1% per mph), a crosswind on leg 2 (no distance).
    assert.ok(Math.abs(lg.toTarget.pl.terms.wind - 200 * 0.01 * 10) < 0.2 && Math.abs(lg.toGreen.pl.terms.wind) < 0.05);
    assert.strictEqual(lg.toTarget.plays, Math.round(lg.toTarget.pl.exact));
    assert.strictEqual(lg.toGreen.plays, 95, '100 - 5 downhill');
    assert.strictEqual(geo.legText(lg.toGreen), '100 · plays 95', 'the bubble: "60 · plays 63"');
    assert.strictEqual(geo.legText(lg.toGreen, 'm'), '91 · plays 87');
    assert.strictEqual(geo.legText({ yards: 20, pl: null }), '20', 'under 30: the yards alone');
    // Under minYd: no plays-like for that leg.
    const short = geo.playsLegs({ from: me, target: tgt, green: north(tgt, 20 * YD), fromFt: 1, targetFt: 1, greenFt: 1, minYd: 30, air });
    assert.strictEqual(short.toGreen.pl, null); assert.strictEqual(short.toGreen.plays, null);
});
test('012-4b par 3 (or no target, or a target on the green): ONE leg, you / the tee -> the green\'s middle', () => {
    const tee = [33.6, -79.0], green = north(tee, 165 * YD), off = east(north(tee, 120 * YD), 15);
    const p3 = geo.playsLegs({ from: tee, target: off, green, fromFt: 50, targetFt: 70, greenFt: 62, par3: true, minYd: 30, air: {} });
    assert.strictEqual(p3.single, true); assert.strictEqual(p3.toGreen, null);
    assert.ok(Math.abs(p3.toTarget.yards - 165) < 0.5);
    assert.ok(Math.abs(p3.toTarget.pl.terms.elev - 4) < 1e-9, 'the tee (50) -> the green (62): +4 - the target\'s height plays no part');
    assert.strictEqual(geo.playsLegs({ from: tee, target: null, green, fromFt: 1, greenFt: 1, air: {} }).single, true);
    assert.strictEqual(geo.playsLegs({ from: tee, target: north(green, 2), green, fromFt: 1, greenFt: 1, air: {} }).single, true, 'a target on the middle');
    assert.strictEqual(geo.playsLegs({ from: null, green }), null);
});
test('012-4c dogleg: the target\'s height is read AT the target (the course samples), not projected onto the straight tee -> green line', () => {
    // Tee -> 250 yds north (the corner) -> 150 yds east to the green. The corner is a hill.
    const tee = [33.6, -79.0], corner = north(tee, 250 * YD), green = east(corner, 150 * YD);
    const samples = [];
    for (let y = 0; y <= 250; y += 25) samples.push(north(tee, y * YD).concat([100 + (y >= 200 ? 30 : 0)]));
    for (let y = 25; y <= 150; y += 25) samples.push(east(corner, y * YD).concat([y <= 50 ? 130 : 105]));
    // The corner: 130 ft (the hill) from the samples at the very point.
    assert.strictEqual(geo.elevFromSamples(samples, corner), 130);
    // Projected onto the straight tee -> green line it would land ~2/3 of the way along, where
    // the samples nearest that projection say otherwise - which is why elevPerLeg never projects.
    const proj = geo.alongLine(corner, [tee, green]);
    assert.ok(proj.d > 60, 'the corner is far off the straight tee -> green line (' + Math.round(proj.d) + ' m)');
    const lg = geo.playsLegs({ from: tee, target: corner, green, fromFt: geo.elevFromSamples(samples, tee), targetFt: geo.elevFromSamples(samples, corner), greenFt: geo.elevFromSamples(samples, green), minYd: 30, air: {} });
    assert.ok(Math.abs(lg.toTarget.pl.terms.elev - 10) < 1e-9, 'uphill to the corner: +10');
    assert.ok(Math.abs(lg.toGreen.pl.terms.elev + 25 / 3) < 1e-9, 'downhill from the corner to the green');
});
test('012-4c the golfer off the line: > 30 yds -> their ~10 m CELL CENTER (never the spot); every point in a cell the same key; inside 30: nothing to ask', () => {
    assert.strictEqual(geo.OWN_SPOT_OFF_YD, 30); assert.strictEqual(geo.ELEV_CELL_M, 10);
    const tee = [33.45, -79.153], green = north(tee, 380 * YD), line = [tee, green];
    const near = east(north(tee, 200 * YD), 25 * YD), far = east(north(tee, 200 * YD), 45 * YD);
    assert.ok(geo.offLineYards(near, line) < 30 && geo.offLineYards(far, line) > 30);
    const c = geo.elevCell(far);
    const d = geo.haversineMeters(far, c.pt);
    assert.ok(d <= 10 * Math.SQRT1_2 + 0.2, 'the center is inside the cell: ' + d);
    assert.ok(c.pt[0] !== far[0] || c.pt[1] !== far[1], 'not the spot itself');
    // Walk around inside one cell: the same key and center; a step of 12 m: another cell.
    const base = geo.elevCell(c.pt);
    assert.strictEqual(base.key, c.key);
    [[3, 3], [-3, 4], [4, -4], [-4, -3]].forEach(([n, e]) => { const q = geo.elevCell(east(north(c.pt, n), e)); assert.strictEqual(q.key, c.key); assert.deepStrictEqual(q.pt, c.pt); });
    assert.notStrictEqual(geo.elevCell(north(c.pt, 12)).key, c.key);
    // The cell is ~10 m square at any latitude.
    [0, 33.45, 61].forEach((la) => { const a = geo.elevCell([la + 0.00001, 10.00001]); const b = geo.elevCell(east(a.pt, 10)); const n = geo.elevCell(north(a.pt, 10)); assert.ok(Math.abs(geo.haversineMeters(a.pt, b.pt) - 10) < 0.3 && Math.abs(geo.haversineMeters(a.pt, n.pt) - 10) < 0.3, 'square at ' + la); });
    assert.strictEqual(geo.elevCell(null), null);
});
test('012-4 the (i) sheet: the second leg and the heights used', () => {
    const me = [33.6, -79.0], tgt = north(me, 200 * YD), green = east(tgt, 100 * YD);
    const lg = geo.playsLegs({ from: me, target: tgt, green, fromFt: 100, targetFt: 130, greenFt: 115, minYd: 30, air: {} });
    const rows = geo.playsInfoRows({ pl: lg.toTarget.pl, yards: lg.toTarget.yards, label: 'You → target', toGreen: lg.toGreen, heights: { from: 100, target: 130, green: 115, ownCell: true } });
    assert.ok(rows.indexOf('Target → green: 100 yds, plays like 95 (downhill −5)') !== -1, JSON.stringify(rows));
    assert.ok(rows.indexOf('Heights: you 100 ft · target 130 ft · green 115 ft (your height: your ~10 m square)') !== -1, JSON.stringify(rows));
});
test('012-4 gps-view: behind elevPerLeg - no projection, the own-spot cell gated and documented, both legs exposed', () => {
    if (!fs.existsSync(path.join(__dirname, 'gps-view.js'))) return;
    const v = read('gps-view.js');
    assert.ok(/HardPanFeature\('elevPerLeg'\)/.test(v));
    assert.ok(/if \(perLegSwitch\(\)\) return null;\s*\n\s*return lineElev\(r, pt\);/.test(fnSrc(v, 'ptElev')), 'no tee -> green projection with the switch on');
    assert.ok(/if \(perLegSwitch\(\) && o\.from !== 'tee'\) \{ var own = ownSpotFt\(r, o\.pt\);/.test(fnSrc(v, 'originElev')));
    const fo = fnSrc(v, 'fetchOwnSpot');
    assert.ok(/^function fetchOwnSpot\(c\) \{\s*if \(tournament\(\)\) return;/.test(fo), 'tournament: never');
    assert.ok(/!perLegSwitch\(\)/.test(fo) && /!S\.pro/.test(fo) && /S\.side !== 'gps'/.test(fo) && /S\.cellInFlight/.test(fo) && /onLine === false/.test(fo) && /inUS\(c\.pt\)/.test(fo), 'switch, GPS Map, on screen, one at a time, online, US only');
    assert.ok(/lsGet\(CELL_PREFIX \+ c\.key\) != null\) return;/.test(fo), 'once per cell, ever');
    assert.ok(/fetch\(epqsUrl\(c\.pt\)/.test(fo) && !/fix|o\.pt|\bpt\b(?!\))/.test(fo.replace(/c\.pt/g, '')), 'the cell center only - never the golfer\'s point');
    assert.ok(/off > G\.OWN_SPOT_OFF_YD \? G\.elevCell\(pt\) : null/.test(fnSrc(v, 'ownSpotCell')), 'only more than 30 yds off the line');
    // Its own switch, OFF unless exactly true (the location rule); both the cell and the fetch ask it.
    assert.ok(/return f\.elevMyCell === true;/.test(fnSrc(v, 'myCellSwitch')));
    assert.ok(/!myCellSwitch\(\)/.test(fnSrc(v, 'ownSpotCell')) && /!myCellSwitch\(\)/.test(fo));
    const cfgSrc = read('gps-config.js');
    assert.ok(/elevMyCell: false/.test(cfgSrc) && /NEEDS MANNY'S OWN OK/.test(cfgSrc), 'ships off, and says why');
    // The (i) sheet's fixed words never mention the square; only fillPlaysInfo does, with both switches on.
    const a = v.indexOf('<div class="gps-plinfo'), sheet = v.slice(a, v.indexOf("+ '</div>'", a));
    assert.ok(!/10-meter|10 m/.test(sheet) && /<span class="gps-plinfo-pos">never your position<\/span>/.test(sheet));
    assert.ok(/perLegSwitch\(\) && myCellSwitch\(\) \? 'never your exact position; more than 30 yards/.test(fnSrc(v, 'fillPlaysInfo')));
    assert.ok(/PRIVACY - THE ONLY TIME A POINT DERIVED FROM THE GOLFER'S POSITION LEAVES THE PHONE/.test(v), 'documented in the code');
    assert.ok(/if \(isPar3\(\) \|\| !S\.target/.test(fnSrc(v, 'playsAim')), 'par 3: the green');
    assert.ok(/if \(tournament\(\) \|\| !S \|\| !S\.pro/.test(fnSrc(v, 'playsLegsNow')));
    assert.ok(/playsLegs: function \(\) \{ try \{ return playsLegsOut\(\); \}/.test(v), 'exported for layout D\'s bubble');
});

// ---- PART 5: "MY DISTANCES ARE FROM" - THE ALTITUDE BASELINE ---------------------------
test('012-5 / 070 altitude: ALT_PCT_PER_1000FT = 0.015 (Manny, Oct 24); f = 1 + p x (course - base) / 1000, plays like = D / f: 150 at sea level plays ~147 at 1,200 ft; same course = 0; a sea-level course vs a Scottsdale baseline plays longer', () => {
    assert.strictEqual(geo.ALT_PCT_PER_1000FT, 0.015);
    assert.ok(Math.abs(geo.altFactor(1200, 0) - 1.018) < 1e-12);
    const up = geo.playsLike({ yards: 150, altFt: 1200, altBaseFt: 0 });
    assert.strictEqual(up.yards, 147); assert.ok(Math.abs(up.terms.alt - (150 / 1.018 - 150)) < 1e-9);
    const same = geo.playsLike({ yards: 150, altFt: 1500, altBaseFt: 1500, tempF: 70 });
    assert.strictEqual(same.terms.alt, 0); assert.strictEqual(same.yards, 150);
    const scottsdale = geo.playsLike({ yards: 150, altFt: 10, altBaseFt: 1257 });
    assert.ok(scottsdale.exact > 150 && scottsdale.yards === 153, 'plays longer: ' + scottsdale.exact);
});
test('012-5 altitude is applied BEFORE wind and temperature (their % on the adjusted yards); slope unchanged; the temperature baseline; "Don\'t adjust" = identical to today', () => {
    const o = { yards: 150, elevFromFt: 100, elevToFt: 112, windMph: 10, windFromDeg: 0, shotBearingDeg: 0, tempF: 60 };
    const today = geo.playsLike(o);
    const alt = geo.playsLike(Object.assign({ altFt: 1200, altBaseFt: 0 }, o));
    const A = 150 / 1.018;
    assert.ok(Math.abs(alt.terms.wind - A * 0.01 * 10) < 1e-9, 'headwind 1% per mph of the ADJUSTED yards');
    assert.ok(Math.abs(alt.terms.temp - A * 0.001 * 10) < 1e-9, 'temperature on the adjusted yards');
    assert.strictEqual(alt.terms.elev, today.terms.elev, 'slope: 1 yd per 3 ft, either way');
    assert.ok(Math.abs(alt.exact - (A + 4 + A * 0.1 + A * 0.01)) < 1e-9);
    // The wind rule itself is untouched: 1% per mph into it, 0.5% per mph helping.
    assert.strictEqual(geo.playsLike({ yards: 150, windMph: 20, windFromDeg: 0, shotBearingDeg: 0 }).yards, 180);
    assert.strictEqual(geo.playsLike({ yards: 150, windMph: 20, windFromDeg: 180, shotBearingDeg: 0 }).yards, 135);
    // Don't adjust: no altitude inputs, no temperature baseline - exactly today's numbers.
    assert.deepStrictEqual(geo.playsLike(Object.assign({}, o)), today);
    assert.ok(!('alt' in today.terms));
    // A temperature baseline: T compares to it (50 F set, 70 F today: warmer, plays shorter).
    const tb = geo.playsLike({ yards: 150, tempF: 70, tempBaseF: 50 });
    assert.ok(Math.abs(tb.terms.temp + 3) < 1e-9);
    assert.deepStrictEqual(geo.playsLike({ yards: 150, tempF: 60 }), geo.playsLike({ yards: 150, tempF: 60, tempBaseF: null }), 'blank = 70 as before');
});
test('012-5 the (i) sheet (070 part 2 wording): "Course elevation 1,200 ft vs your sea-level numbers: −N"; a course baseline by name; no height: "Elevation: not available here"', () => {
    // 070 part 2: the row's words changed (plan 064-5 section 3); N is playsLike's own altitude term (1.5%).
    const pl = geo.playsLike({ yards: 250, altFt: 1200, altBaseFt: 0 });
    assert.strictEqual(geo.playsInfoRows({ pl, yards: 250, alt: { ft: 1200, baseFt: 0, baseName: '' } })[1], 'Course elevation 1,200 ft vs your sea-level numbers: −4');
    const pc = geo.playsLike({ yards: 150, altFt: 20, altBaseFt: 1500 });
    assert.strictEqual(geo.playsInfoRows({ pl: pc, yards: 150, alt: { ft: 20, baseFt: 1500, baseName: 'Grayhawk' } })[1], 'Course elevation 20 ft vs your numbers at Grayhawk (1,500 ft): +3');
    const same = geo.playsLike({ yards: 150, altFt: 300, altBaseFt: 300 });
    assert.strictEqual(geo.playsInfoRows({ pl: same, yards: 150, alt: { ft: 300, baseFt: 300, baseName: 'Home' } })[1], 'Course elevation 300 ft vs your numbers at Home (300 ft): 0');
    assert.strictEqual(geo.playsInfoRows({ pl: geo.playsLike({ yards: 150, tempF: 60 }), yards: 150, alt: { ft: null, baseFt: 0, na: true } })[1], 'Elevation: not available here');
    assert.strictEqual(geo.playsInfoRows({ pl: geo.playsLike({ yards: 150, tempF: 60, tempBaseF: 50 }), yards: 150, tempF: 60, tempBaseF: 50 })[1], 'Warm (60°F vs 50°F): −1', 'the temperature row names its baseline (warmer than it: shorter)');
});
function bagBox() {
    const vm = require('vm'), store = {};
    const sb = { JSON, Object, Math, Number, String, Date, isFinite, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } };
    sb.window = sb; vm.createContext(sb); vm.runInContext(read('gps-shots.js'), sb);
    return { B: sb.HardPanGpsBag, store };
}
test('012-5 My bag keeps the baseline per golfer, ON THIS PHONE ONLY (never in the account sync); 070: default Sea level for a golfer who never chose', () => {
    if (!fs.existsSync(path.join(__dirname, 'gps-shots.js'))) return;
    const { B, store } = bagBox();
    const j = (x) => JSON.parse(JSON.stringify(x));
    // 070 part 3 (Manny): never chosen = Sea level (was Don't adjust); Don't adjust is still a choice.
    assert.deepStrictEqual(j(B.baseline('Manny Orozco')), { mode: 'sea', name: '', ft: 0, tempF: null, chosen: false }, 'default (never chosen): Sea level');
    assert.strictEqual(B.baselineFt(B.baseline('Manny Orozco')), 0, 'Sea level default: altitude vs 0 ft');
    B.setBaseline('Manny Orozco', { mode: 'none' });
    assert.strictEqual(B.baselineFt(B.baseline('Manny Orozco')), undefined, 'Don\'t adjust: no altitude at all');
    B.setBaseline('Manny Orozco', { mode: 'sea', tempF: 65 });
    assert.deepStrictEqual(j(B.baseline('manny  orozco')), { mode: 'sea', name: '', ft: 0, tempF: 65, chosen: true });
    assert.strictEqual(B.baselineFt(B.baseline('Manny Orozco')), 0);
    B.setBaseline('Manny Orozco', { mode: 'course', name: 'Grayhawk Golf Club', ft: 1530.4, tempF: '' });
    assert.deepStrictEqual(j(B.baseline('Manny Orozco')), { mode: 'custom', name: 'Grayhawk Golf Club', ft: 1530, tempF: null, chosen: true }, 'blank temperature = keep 70; 070: a picked course is Custom with its feet');
    B.setBaseline('Joe Russo', { mode: 'course', name: 'Somewhere abroad', ft: null });
    assert.strictEqual(B.baselineFt(B.baseline('Joe Russo')), null, 'a course with no US height: altitude not available');
    B.setBaseline('X', { mode: 'moon', ft: 9 });
    assert.strictEqual(B.baseline('X').mode, 'none', 'anything else: Don\'t adjust');
    // Never in what the account sync would write; no position kept.
    B.setup('Manny Orozco', { '7i': 150 });
    assert.deepStrictEqual(Object.keys(j(B.syncShape('Manny Orozco'))), ['base']);
    assert.ok(!/lat|lng|"p"/.test(store.hardpan_bag_v1));
    B.resetAll('Manny Orozco');
    // 070 part 3: Reset all clears the clubs but keeps the elevation choice (a "Don't adjust" golfer keeps it).
    assert.strictEqual(B.baseline('Manny Orozco').mode, 'custom', 'Reset all keeps "measured at"');
    assert.deepStrictEqual(Object.keys(j(B.bag('Manny Orozco'))), [], 'Reset all still clears the clubs');
});
test('012-5 gps-view: behind bagAltitude, never in tournament mode; the club for the ADJUSTED plays-like; the lookup a course point only', () => {
    if (!fs.existsSync(path.join(__dirname, 'gps-view.js'))) return;
    const v = read('gps-view.js');
    assert.ok(/HardPanFeature\('bagAltitude'\)/.test(v));
    assert.ok(/if \(!altSwitch\(\) \|\| tournament\(\) \|\| !S\) return null;/.test(fnSrc(v, 'altNow')), 'tournament / switch off: no altitude');
    assert.ok(/if \(base === undefined\) return out;/.test(fnSrc(v, 'altNow')), 'Don\'t adjust: no altitude');
    assert.ok(/q\.altFt = al\.altFt; q\.altBaseFt = al\.altBaseFt;/.test(fnSrc(v, 'playsAir')));
    assert.ok(/var q = playsAir\(w, r\);/.test(fnSrc(v, 'playsTo')), 'every plays-like number (line, suggestion, pill) goes through it');
    assert.ok(/B\.suggestClub\((B\.bag\(bagGolfer\(\)\)|bagNow\(B\)), yd\)/.test(fnSrc(v, 'syncSuggest')) && /var yd = pl \? pl\.exact :/.test(fnSrc(v, 'syncSuggest')), 'the club for the adjusted plays-like');
    const fc = fnSrc(v, 'fetchCourseFt');
    assert.ok(/!inUS\(p\)/.test(fc) && /onLine === false/.test(fc) && /lsGet\(k\)/.test(fc) && !/\bfix\b|origin\(|o\.pt/.test(fc), 'US only, online, once; never the golfer');
    assert.ok(/altPickCourse\(\(S\.round && S\.round\.courseName\) \|\| 'This course', r && \(r\.mid \|\| r\.tee\), ft\)/.test(v), 'this course: its own green / tee point');
    // 070 part 3: "My distances are from: ... A course I pick" is now "My club yardages are measured at: Sea level (default) /
    // Custom elevation (Use this course / Find a course) / Don't adjust".
    ['My club yardages are measured at:', 'Sea level', '(default)', 'Custom elevation', 'Use this course', 'Find a course', "Don't adjust", 'Typical temperature when I set these'].forEach((w) => assert.ok(v.indexOf(w) !== -1, w));
    assert.ok(/about 1\.5% for every 1,000 feet above it/.test(v) && /var ALT_PCT_PER_1000FT = 0\.015;/.test(read('gps-geo.js')), 'the (i) sheet says the very number the formula uses');
    assert.ok(/data-feature="bagAltitude"/.test(v) && /if \(!altSwitch\(\)\) Array\.prototype\.forEach\.call\(el\.querySelectorAll\('\[data-feature="bagAltitude"\]'\)/.test(v), 'switch off: removed');
});
