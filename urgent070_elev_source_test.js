// 070 PART 1 - ELEVATION-ADJUSTED YARDAGES: THE FORMULA (1.5% per 1,000 ft), THE COURSE'S
// HEIGHT FROM EVERY SOURCE IN ORDER (course record -> USGS -> AWS terrain tile -> the phone's
// altitude inside the course area -> not available), THE WRONG-COURSE GUARD, PRIVACY.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

global.window = global.window || {};
require('./gps-geo.js');
const G = window.HardPanGeo;

function fnSrc(src, name) {
    const at = src.indexOf('function ' + name + '(');
    assert.ok(at !== -1, 'function ' + name + ' exists');
    const end = src.indexOf('\n    function ', at + 30);
    return src.slice(at, end === -1 ? undefined : end);
}

test('070 formula: ALT_PCT_PER_1000FT = 0.015, f = 1 + p x (course - base) / 1000; plays like = D / f; carry here = carry x f (1.5% examples)', () => {
    assert.strictEqual(G.ALT_PCT_PER_1000FT, 0.015);
    assert.ok(Math.abs(G.altFactor(1200, 0) - 1.018) < 1e-12);
    assert.strictEqual(G.altFactor(1200, 1200), 1, 'custom baseline at the same height: f = 1');
    // Manny's example at 1.5%: 151 yds at a 1,200 ft course vs sea-level numbers plays 148.
    const p151 = G.playsLike({ yards: 151, altFt: 1200, altBaseFt: 0 });
    assert.strictEqual(p151.yards, 148);
    assert.strictEqual(Math.round(p151.terms.alt), -3);
    // ...and the 8-iron 152 flies ~155 there (carry x f) - the number and the club agree.
    assert.strictEqual(Math.round(152 * G.altFactor(1200, 0)), 155);
    assert.ok(152 >= p151.exact && 152 * G.altFactor(1200, 0) >= 151, 'D / f <= carry  <=>  D <= carry x f');
    // 150 -> 147 at 1,200 ft; Denver (5,280 ft) 150 -> 139.
    assert.strictEqual(G.playsLike({ yards: 150, altFt: 1200, altBaseFt: 0 }).yards, 147);
    assert.strictEqual(G.playsLike({ yards: 150, altFt: 5280, altBaseFt: 0 }).yards, 139);
    // Custom baseline 1,200 ft at a 1,200 ft course: no change.
    const same = G.playsLike({ yards: 151, altFt: 1200, altBaseFt: 1200 });
    assert.strictEqual(same.terms.alt, 0); assert.strictEqual(same.yards, 151);
    // Below the baseline: plays LONGER (a sea-level course vs 1,500 ft numbers: 150 -> 153).
    const below = G.playsLike({ yards: 150, altFt: 0, altBaseFt: 1500 });
    assert.ok(below.exact > 150); assert.strictEqual(below.yards, 153);
    // Huge differences stay inside the 0.5 - 1.6 clamp and f stays positive.
    assert.ok(G.altFactor(15000, -1500) <= 1.6 && G.altFactor(-1500, 15000) >= 0.5);
    const big = G.playsLike({ yards: 150, altFt: 14000, altBaseFt: -1400 });
    assert.ok(big.exact >= 75 && big.exact <= 240);
    // Altitude first, then temperature on the adjusted yards.
    const at = G.playsLike({ yards: 150, altFt: 1200, altBaseFt: 0, tempF: 60 });
    assert.ok(Math.abs(at.terms.temp - (150 / 1.018) * 0.001 * 10) < 1e-9);
    // No altitude inputs ("Don't adjust"): exactly as before.
    assert.ok(!('alt' in G.playsLike({ yards: 150, tempF: 60 }).terms));
});

test('070 terrain tiles: the z13 tile number for a COURSE point, the pixel inside it, terrarium decode', () => {
    assert.strictEqual(G.TERRAIN_URL, 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png');
    assert.strictEqual(G.TERRAIN_Z, 13);
    const stAndrews = [56.3433, -2.8025];
    const t = G.terrainTile(stAndrews);
    assert.deepStrictEqual([t.z, t.x, t.y], [13, 4032, 2536]);
    assert.strictEqual(t.url, 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/13/4032/2536.png');
    const px = G.terrainPixel(stAndrews, t);
    assert.ok(px && px.px >= 0 && px.px < 256 && px.py >= 0 && px.py < 256);
    assert.strictEqual(G.terrainPixel([33.45, -111.95], t), null, 'a point in another tile: null');
    // meters = R*256 + G + B/256 - 32768
    assert.ok(Math.abs(G.terrariumFt(128, 0, 0) - 0) < 1e-9, 'sea level');
    assert.ok(Math.abs(G.terrariumFt(129, 109, 128) - 365.5 * 3.28084) < 1e-6, '365.5 m');
    assert.strictEqual(G.terrariumFt(0, 0, 0), null, 'no data / nonsense: null');
});

test('070 wrong course: a record is used only when its origin is within ~3 km of THIS course\'s points; the phone only inside the course area + 500 m', () => {
    assert.strictEqual(G.ELEV_ORIGIN_M, 3000);
    const papago = [[33.4560, -111.9480], [33.4602, -111.9440]];
    assert.ok(G.elevOriginOk([33.4580, -111.9500], papago), 'Papago\'s own record');
    assert.ok(!G.elevOriginOk([33.3753, -111.8793], papago), 'Dobson Ranch\'s record (about 11 km away) at Papago: rejected');
    assert.ok(!G.elevOriginOk(null, papago) && !G.elevOriginOk([33.45, -111.95], []), 'no origin or no course points: not used');
    const osm = { holes: { 1: { osm: { tee: [33.4560, -111.9480], end: [33.4590, -111.9460], green: [[33.4591, -111.9461]] } } } };
    const b = G.courseBounds(osm, [], 500);
    assert.ok(G.insideBounds([33.4570, -111.9470], b), 'on the course');
    assert.ok(G.insideBounds([33.4560 - 0.004, -111.9480], b), '~440 m off the course: inside the 500 m pad');
    assert.ok(!G.insideBounds([33.4560 - 0.01, -111.9480], b), '~1.1 km off: outside, the phone\'s altitude is not used');
});

test('070 gps-view: courseElevNow - course record, USGS, terrain tile, phone (inside the course area), none - and courseFtNow kept as a number', () => {
    const v = read('gps-view.js');
    const ce = fnSrc(v, 'courseElevNow');
    const order = ["src: 'course'", "src: 'usgs'", "src: 'tile'", "src: 'phone'", 'return none;'].map((w) => ce.lastIndexOf(w));
    order.forEach((i) => assert.ok(i !== -1));
    assert.deepStrictEqual(order.slice().sort((a, b) => a - b), order, 'in Manny\'s order');
    assert.ok(/if \(!S \|\| tournament\(\)\) return none;/.test(ce), 'tournament mode: none of it');
    assert.ok(/courseMeanFt\(key, true\)/.test(ce) && /tileFt\(key\)/.test(ce) && /phoneFt\(\)/.test(ce));
    // The old number-returning courseFtNow is kept for its callers (only add).
    assert.ok(/function courseFtNow\(r\) \{\s*var whole = courseMeanFt\(S && S\.courseKey, true\);/.test(v));
    // Plays-like reads every source (altNow), and says which.
    assert.ok(/var ce = courseElevNow\(r\), ft = ce\.ft;/.test(fnSrc(v, 'altNow')) && /src: ce\.src/.test(fnSrc(v, 'altNow')));
    // Outside the US: the altitude only (no slope / wind / temperature data there).
    assert.ok(/if \(!inUS\(aim\)\) \{[\s\S]*?G\.playsLike\(\{ yards: D, altFt: alo\.altFt, altBaseFt: alo\.altBaseFt \}\)/.test(fnSrc(v, 'playsTo')));
    // Stored records go through the guard; a failed one is discarded (looked up again).
    const ck = fnSrc(v, 'elevRecChecked');
    assert.ok(/G\.elevOriginOk\(rec\.o, pts\)/.test(ck) && /localStorage\.removeItem\(prefix \+ key\)/.test(ck));
    assert.ok(/var rec = celevChecked\(S\.courseKey\)/.test(fnSrc(v, 'holeSamples')) && /celevChecked\(key\)/.test(fnSrc(v, 'courseMeanFt')));
    // The phone's altitude: memory only, this course key only, only inside the course area.
    const pa = fnSrc(v, 'phoneAltSample');
    assert.ok(/S\.phoneAlt\.key !== key/.test(pa) && /G\.courseBounds\(osmRecord\(key\), \[\], PHONE_ALT_PAD_M\)/.test(pa) && /G\.insideBounds\(pt, b\)/.test(pa));
    assert.ok(!/lsSet|localStorage|fetch\(/.test(pa), 'never stored, never sent');
    assert.ok(/a\.key !== S\.courseKey \|\| !a\.inside/.test(fnSrc(v, 'phoneFt')));
    assert.ok(/var PHONE_ALT_PAD_M = 500/.test(v) || /PHONE_ALT_PAD_M = 500/.test(v));
});

test('070 PRIVACY (source): the terrain request carries ONLY the course point\'s tile number; the golfer\'s fix and coords.altitude never reach a request', () => {
    const v = read('gps-view.js');
    const ft = fnSrc(v, 'fetchCourseTile');
    assert.ok(/var o = r && \(r\.mid \|\| r\.tee\);/.test(ft), 'the course\'s own point (green, else tee)');
    assert.ok(/G\.terrainTile\(o\)/.test(ft) && /\.replace\('\{z\}', t\.z\)\.replace\('\{x\}', t\.x\)\.replace\('\{y\}', t\.y\)/.test(ft), 'only z / x / y go in the URL');
    assert.ok(!/\bfix\b|origin\(|o\.pt|coords|phoneAlt|altitude/.test(ft), 'nothing from the golfer');
    assert.ok(/credentials: 'omit'/.test(ft));
    assert.ok(/if \(tournament\(\) \|\| !altSwitch\(\) \|\| !S \|\| !S\.pro/.test(ft), 'never in tournament mode, never without GPS Map');
    // coords.altitude is read in exactly one place, and handed to phoneAltSample (memory only).
    const uses = v.split(/pos\.coords\.altitude\b/).length - 1;
    assert.strictEqual(uses, 1);
    assert.ok(/phoneAltSample\(\[pos\.coords\.latitude, pos\.coords\.longitude\], pos\.coords\.altitude, pos\.coords\.altitudeAccuracy\)/.test(v));
    // The shared elevMyCell switch stays OFF.
    assert.strictEqual(/elevMyCell: false/.test(read('gps-config.js')), true);
});

test('070 the credit line in Acknowledgements; Privacy says what is asked for', () => {
    const a = read('acknowledgements.html');
    assert.ok(a.indexOf('Elevation: USGS 3DEP/SRTM, and the sources listed by Tilezen') !== -1);
    const p = read('privacy.html');
    assert.ok(/one map square around the course/.test(p) && /never sent or saved with a position/.test(p));
});

// A VM run of gps-view's courseElevNow is in the Chrome test (urgent070_elev_source_chrome_test.js).
