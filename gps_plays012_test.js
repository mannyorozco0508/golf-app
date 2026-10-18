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
    assert.ok(simple.length > 20 && /G\.playsText\(pl, units\(\)\)/.test(simple), 'the simple branch');
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
