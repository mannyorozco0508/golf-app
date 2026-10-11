// ============================================================================
// HARDPAN GPS - THE WIRING (gps-v1, 2026-10-06)
//
// Source-level guards for what the device check (tools/gps-check.js) cannot
// see from inside one page: the shell lists, the tile terms, the privacy
// sinks, and how the GPS side is joined to the scorecard.
//
// HardPan trees only. In a Consumer tree (GPS_ENABLED=0 - the GPS files are
// not there) every test here SKIPS with that reason; gps_flag_test.js is the
// one that proves a Consumer tree has no GPS in it.
//
// Every slice below carries a POSITIVE assertion, per CLAUDE.md: a slice that
// truncates to nothing satisfies every "must not contain" for ever.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'gps-view.js'));
const skip = ON ? false : 'Consumer tree (GPS_ENABLED=0): no GPS files to wire';

const GPS_FILES = ['gps-geo.js', 'gps-view.js', 'gps-config.js', 'gps-courses.js', 'maplibre-gl.js', 'maplibre-gl.css',
    'gps-coverage-az.js', 'gps-coverage-wa.js', 'gps-coverage-or.js', 'gps-coverage-ct.js', 'gps-coverage-fl.js', 'gps-match.js', 'gps-live.js'];

test('the scorecard loads the small GPS files at boot, inside a GPS block, and NOT MapLibre or the course data', { skip }, () => {
    const html = read('index.html');
    const at = html.indexOf('<!-- GPS:BEGIN -->');
    const block = html.slice(at, html.indexOf('<!-- GPS:END -->', at));
    assert.ok(at > 0, 'the GPS block is there');
    ['gps-geo.js', 'gps-config.js', 'gps-view.js'].forEach((f) => assert.ok(block.includes(`<script src="${f}"></script>`), f));
    assert.ok(!/<script src="maplibre-gl\.js"/.test(html), 'MapLibre is loaded on first use, not at boot');
    assert.ok(!/<script src="gps-courses\.js"/.test(html), 'course data is loaded on first use, not at boot');
    assert.ok(!/maplibre-gl\.css/.test(html), 'no MapLibre stylesheet at boot');
    // Every GPS mention in index.html is inside a GPS block, so a Consumer build
    // cannot keep one by accident.
    const outside = require('./tools/gps-flag.js').applyFlag(html, false);
    assert.ok(!/gps|HardPanGps|HardPanGeo/i.test(outside), 'GPS outside a GPS block in index.html');
});

test('every GPS file is in the sw shell and CONSUMER_SHELL, each inside a GPS block, and GPS_SHELL names exactly them', { skip }, () => {
    const flag = require('./tools/gps-flag.js');
    const names = (src) => [...src.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    const sw = read('sw.js');
    const sync = read('sync-mobile-web.js');
    const gpsShell = names(/const GPS_SHELL = \[([\s\S]*?)\];/.exec(sync)[1]);
    const consumer = /const CONSUMER_SHELL = \[([\s\S]*?)\];/.exec(sync)[1];
    const consumerOff = /const CONSUMER_SHELL = \[([\s\S]*?)\];/.exec(flag.applyFlag(sync, false))[1];
    const swOff = flag.applyFlag(sw, false);
    assert.deepStrictEqual(gpsShell, GPS_FILES, 'GPS_SHELL');
    // The marked entries in CONSUMER_SHELL are exactly GPS_SHELL - two lists, held equal.
    const marked = names(consumer).filter((f) => !names(consumerOff).includes(f));
    assert.deepStrictEqual(marked, GPS_FILES, 'the GPS block in CONSUMER_SHELL');
    GPS_FILES.forEach((f) => {
        assert.ok(sw.includes(`'./${f}'`) && !swOff.includes(`'./${f}'`), 'sw.js shell, inside a GPS block: ' + f);
        assert.ok(fs.existsSync(path.join(__dirname, f)), 'exists: ' + f);
    });
    assert.ok(/CACHE_VERSION = 'golfapp-v354-gps-livefix'/.test(sw));
});

test('Esri tiles never reach the service worker; the USGS course cache survives a shell update', { skip }, () => {
    const sw = read('sw.js');
    const at = sw.indexOf("self.addEventListener('fetch'");
    assert.ok(at > 0, 'fetch handler found');
    assert.ok(/url\.origin !== self\.location\.origin/.test(sw.slice(at, at + 1500)), 'cross-origin early return is present');
    assert.ok(!/arcgis/i.test(sw.replace(/\/\/.*$/gm, '')), 'no Esri URL in sw.js code');
    const act = sw.slice(sw.indexOf("self.addEventListener('activate'"), sw.indexOf("self.addEventListener('activate'") + 900);
    assert.ok(/key !== CACHE_VERSION && key\.indexOf\('hardpan-usgs-'\) !== 0/.test(act), 'activate keeps hardpan-usgs-*');
    assert.ok(/hardpan-usgs-v1/.test(read('gps-view.js')), 'and that is the cache gps-view.js writes');
});

test('imagery terms: keyed Esri only (never the keyless endpoint), USGS cached, Esri never cached', { skip }, () => {
    const v = read('gps-view.js');
    assert.ok(/ibasemaps-api\.arcgis\.com\/arcgis\/rest\/services\/World_Imagery\/MapServer\/tile\/\{z\}\/\{y\}\/\{x\}\?token=\{key\}/.test(v));
    assert.ok(!/server\.arcgisonline\.com/.test(v), 'the keyless endpoint is not licensed for this app');
    assert.ok(/basemap\.nationalmap\.gov\/arcgis\/rest\/services\/USGSImageryOnly\/MapServer\/tile\/\{z\}\/\{y\}\/\{x\}/.test(v));
    assert.ok(/maxNativeZoom: 16/.test(v), 'USGS is native to z16');
    // The only cache.put is in precacheCourse, on a USGS url.
    const puts = v.split('\n').filter((l) => /cache\.put\(/.test(l));
    assert.strictEqual(puts.length, 1, 'exactly one place stores tiles');
    const pre = v.slice(v.indexOf('function precacheCourse('), v.indexOf('// ---- THE HOLE VIEW'));
    assert.ok(/TILES\.usgs\.url\.replace/.test(pre) && /cache\.put\(url, r\)/.test(pre), 'it stores USGS urls');
    assert.ok(!/keyedUrl/.test(pre), 'and never an Esri url');
    // Attribution: all three, always on the map.
    assert.ok(/Powered by <a href="https:\/\/www\.esri\.com"/.test(v));
    assert.ok(/USDA, USGS The National Map: Orthoimagery/.test(v));
    assert.ok(/OpenStreetMap<\/a> contributors/.test(v));
});

test('the pre-cache is sized from the course, never from the golfer', { skip }, () => {
    const v = read('gps-view.js');
    const pre = v.slice(v.indexOf('function precacheCourse('), v.indexOf('// ---- THE HOLE VIEW'));
    assert.ok(/G\.courseBounds\(osm, extraPts/.test(pre), 'positive: the bounds call is there');
    assert.ok(!/\bfix\b|coords/.test(pre), 'precacheCourse reads no position');
});

test('privacy, by source: the position variable is never stored or sent', { skip }, () => {
    const v = read('gps-view.js');
    assert.ok(/watchPosition\(/.test(v) && /fix = \{ pt: \[pos\.coords\.latitude/.test(v), 'positive: the watch and the fix exist');
    const sinks = v.split('\n').filter((l) => /setItem\(|\.set\(|\.update\(|fetch\(|writeRoundPin\(|savePin\(|cache\.put\(/.test(l) && !/^\s*\/\//.test(l));
    assert.ok(sinks.length >= 6, 'positive: the sinks were found (' + sinks.length + ')');
    sinks.forEach((l) => assert.ok(!/\bfix\b|coords/.test(l), 'a sink touches the position: ' + l.trim()));
});

test('battery: 60 s after Bets, stop; background stops at once; foreground restarts only on GPS', { skip }, () => {
    const v = read('gps-view.js');
    assert.ok(/var IDLE_STOP_MS = 60000;/.test(v));
    const side = v.slice(v.indexOf('function showSide('), v.indexOf('function setHole('));
    assert.ok(/idleTimer = setTimeout\(function \(\) \{ idleTimer = null; stopWatch\(\); \}, IDLE_STOP_MS\)/.test(side));
    assert.ok(/startWatch\(\);/.test(side));
    const vis = v.slice(v.indexOf('function onVisibility('), v.indexOf('function onPageHide('));
    assert.ok(/=== 'hidden'\) stopWatch\(\)/.test(vis));
    assert.ok(/else if \(S\.side === 'gps'\) startWatch\(\)/.test(vis));
});

test('the scorecard owns the hole: every render hands it to GPS, GPS Prev/Next use the card\'s own', { skip }, () => {
    const html = read('index.html');
    const at = html.indexOf('function renderHoleView()');
    const body = html.slice(at, html.indexOf('\n    function ', at + 30));
    assert.ok(/\/\/ GPS:BEGIN\n\s*gpsFollowHoleView\(\);\n\s*\/\/ GPS:END/.test(body), 'renderHoleView hands every hole to GPS');
    const glue = html.slice(html.indexOf('function gpsStepHole('), html.indexOf('// GPS:END', html.indexOf('function gpsStepHole(')));
    assert.ok(/goToAdjacentHole\(dir\)/.test(glue), 'GPS Prev/Next are the card\'s Prev/Next');
    assert.ok(/g\.setHole\(currentViewedHole, par\)/.test(glue), 'a card hole change moves GPS');
    assert.ok(/durableWrite\(base \+ k, 'set', pin, base \+ k\)/.test(glue), 'pins go through the offline queue');
    assert.ok(/canFix: roundOwnerHere\(\)/.test(glue), 'fixing is the organizer');
    assert.ok(!/hv-gps-btn/.test(html), 'the old header button is gone - the toggle replaced it');
});

test('MapLibre is the published 5.24.0 build (BSD-3), with its licence', { skip }, () => {
    const l = read('maplibre-gl.js');
    assert.ok(/MapLibre GL JS/.test(l.slice(0, 200)) && /v5\.24\.0/.test(l.slice(0, 300)));
    assert.ok(/MapLibre contributors/.test(read('MAPLIBRE-LICENSE.txt')));
    const sha = require('crypto').createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'maplibre-gl.js'))).digest('hex');
    // Extracted from the npm tarball maplibre-gl-5.24.0.tgz, whose sha512 matched the
    // registry's published integrity (sha512-ALyFxgtd5R...6ia3A==), 2026-10-07. The
    // single-file UMD build (worker inlined); v6 ships only as ES modules.
    assert.strictEqual(sha, MAPLIBRE_SHA256);
    assert.ok(!fs.existsSync(path.join(__dirname, 'leaflet.js')), 'Leaflet is retired');
});
const MAPLIBRE_SHA256 = '45a9b07a9189ce56054c620a947ccf41e291e58c95e9b61533b740aaa65ee5cb';

// ---- WAVE 2 (2026-10-08): Esri live, plays like, the free / Pro check ----------
// The key itself is never written into a test, a log or a message: these
// assertions read its SHAPE and print nothing of it.
test('gps-config.js: an Esri key is set, the paywall is off, and nothing else rides along', { skip }, () => {
    const c = read('gps-config.js');
    const sbx = { window: {} };
    require('vm').runInNewContext(c, sbx);
    const cfg = sbx.window.HARDPAN_GPS_CONFIG;
    assert.ok(cfg && typeof cfg.esriKey === 'string' && /^[A-Za-z0-9_.-]{100,}$/.test(cfg.esriKey), 'an ArcGIS API key is configured (value not printed)');
    assert.strictEqual(cfg.paywall, false, 'paywall is off this wave: everyone in the GPS build is Pro');
    assert.deepStrictEqual(Object.keys(cfg).sort(), ['esriKey', 'golfapi', 'googleKey', 'imagery', 'imageryPro', 'live', 'liveBase', 'osm', 'paywall'], 'no stand-in (esriTileUrl / nwsBase / epqsUrl / googleBase / golfapiFile / liveTest) in the shipped config');
    // GPS LIVE (gps-live): OpenStreetMap off, live on, our functions' own origin.
    assert.strictEqual(cfg.osm, false); assert.strictEqual(cfg.live, true);
    assert.strictEqual(cfg.liveBase, 'https://us-central1-golfapp-9fb21.cloudfunctions.net', 'our Cloud Functions - never GolfAPI itself');
    assert.strictEqual(cfg.golfapi, true, 'the GolfAPI kill switch is a plain boolean, on');
    assert.strictEqual(cfg.imagery, 'esri', 'Esri stays the default');
    // GOOGLE STAYS OFF (2026-10-08): its terms forbid offline storage and use
    // with a non-Google map, and this app falls back to Esri / USGS.
    assert.strictEqual(cfg.googleKey, '', 'Google must stay off: no key in the shipped config');
    assert.notStrictEqual(cfg.imagery, 'google'); assert.notStrictEqual(cfg.imageryPro, 'google');
    assert.ok(/No Use\s*\/\/\s*With Non-Google Maps|No Use With Non-Google Maps/.test(c) && /NEVER ship a build that\s*\/\/\s*can show Google/.test(c), 'the reason is written next to the setting');
    // The key appears in this one file only.
    const k = cfg.esriKey;
    ['gps-view.js', 'gps-geo.js', 'index.html', 'sw.js', 'tools/gps-check.js', 'docs/gps-step0.md', 'docs/gps-builds.md'].forEach((f) => {
        if (fs.existsSync(path.join(__dirname, f))) assert.ok(read(f).indexOf(k) === -1, 'the Esri key is copied into ' + f);
    });
});

test('Esri: tiles never asked past z19, the map to z21, the exact credit, fallback on errors in a row', { skip }, () => {
    const v = read('gps-view.js');
    assert.ok(/maxNativeZoom: 19,/.test(v) && /maxZoom: 21,/.test(v));
    assert.ok(/maxzoom: TILES\.maxNativeZoom/.test(v), 'the Esri source max is the one constant');
    assert.ok(!/maxzoom: (19|2\d)/.test(v), 'no second, hard-coded Esri source max');
    assert.ok(v.includes(`poweredBy: 'Powered by <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>'`));
    assert.ok(v.includes(`credit: 'Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community'`));
    const err = v.slice(v.indexOf("map.on('error'"), v.indexOf("map.on('data'"));
    assert.ok(/S\.esriErrRun >= ESRI_ERRS_TO_FAIL\) dropEsri\('errors'\)/.test(err), 'consecutive errors drop Esri');
    assert.ok(!/esriLoads/.test(err), 'a tile that loaded once no longer blocks the fallback');
    assert.ok(/window\.addEventListener\('offline', onOffline\)/.test(v), 'losing the signal drops Esri at once');
    // No Esri prefetch: the only fetch() calls are USGS, NWS and EPQS.
    const fetches = v.split('\n').filter((l) => /\bfetch\(/.test(l) && !/^\s*\/\//.test(l)).map((l) => l.trim());
    fetches.forEach((l) => assert.ok(!/esri|keyedUrl/i.test(l), 'an Esri fetch outside the map: ' + l));
});

test('plays like: elevation from USGS EPQS for COURSE points, cached forever, one at a time', { skip }, () => {
    const v = read('gps-view.js');
    assert.ok(v.includes("var EPQS_URL = 'https://epqs.nationalmap.gov/v1/json?x={lng}&y={lat}&wkid=4326&units=Feet&includeDate=false';"));
    assert.ok(/var ELEV_PREFIX = 'hardpan_elev_v1_';/.test(v));
    const pts = v.slice(v.indexOf('function elevPoints('), v.indexOf('function fetchElevs('));
    assert.ok(/r\.tee/.test(pts) && /r\.mid/.test(pts), 'positive: the course points');
    assert.ok(!/\bfix\b|origin\(|coords/.test(pts), 'elevPoints reads no position');
    const fe = v.slice(v.indexOf('function fetchElevs('), v.indexOf('function originElev('));
    assert.ok(/S\.elevInFlight/.test(fe) && /lsGet\(elevKey\(q\)\) == null/.test(fe), 'one at a time, only what is not on the phone');
    assert.ok(/!S\.pro/.test(fe) && /S\.side !== 'gps'/.test(fe) && /onLine === false/.test(fe), 'only Pro, only on GPS, only online');
});

test('HardPan GPS (Pro): ONE check, exported; free never loads MapLibre', { skip }, () => {
    const v = read('gps-view.js');
    assert.strictEqual((v.match(/function hasGpsPro\(/g) || []).length, 1);
    assert.ok(/hasGpsPro: hasGpsPro/.test(v), 'exported on window.HardPanGps');
    const em = v.slice(v.indexOf('function ensureMap('), v.indexOf('function showSide('));
    assert.ok(em.indexOf('if (!S.pro) return;') !== -1 && em.indexOf('if (!S.pro) return;') < em.indexOf('loadMapLibre('), 'free returns before MapLibre loads');
    // No price anywhere in the code until Manny sets one (2026-10-08): the sheet
    // says "HardPan GPS — coming soon"; a price comes only from config.priceLine.
    assert.ok(!/\$\d/.test(v), 'a price is written into gps-view.js');
    assert.ok(/HardPan GPS — coming soon/.test(v) && /Not now/.test(v));
    assert.ok(/function openSheet\(\) \{\s*(\/\/.*\s*)?if \(!S \|\| S\.pro\) return;/.test(v), 'the sheet is never opened for a Pro user');
    assert.ok(!/Season Pass/i.test(v), 'HardPan GPS, never "Season Pass" (that is the organizer product)');
});

// EDIT PIN WAS REMOVED (2026-10-08): no code reads or writes today's pin; the
// old pinLocs records stay in the database untouched.
test('Edit Pin is gone: no pinLocs in the GPS code or the scorecard\'s GPS block', { skip }, () => {
    const code = (t) => t.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    const v = code(read('gps-view.js'));
    assert.ok(/aimAt\(r\)/.test(v), 'positive: CENTER still has its aim');
    ['pinLocs', 'editingPin', 'gps-edit-pin', 'gps-flag', 'writeHoleLoc'].forEach((w) => assert.ok(v.indexOf(w) === -1, 'gps-view.js still has ' + w));
    const html = read('index.html');
    const blocks = html.split('// GPS:BEGIN').slice(1).map((b) => b.split('// GPS:END')[0]).join('\n');
    assert.ok(/gpsFollowHoleView/.test(blocks), 'positive: the GPS block was found');
    assert.ok(!/pinLocs|writeHoleLoc/.test(blocks), 'index.html still writes today\'s pin');
    assert.ok(!/clampToGreen/.test(read('gps-geo.js')), 'the pin clamp is gone from gps-geo.js');
});

test('setting a green by GPS: Esri stays up; only the tap fallback is USGS; ±5 yds gate', { skip }, () => {
    const v = read('gps-view.js');
    assert.ok(/var GREEN_GPS_YD = 5;/.test(v));
    assert.ok(/function tapMode\(\) \{ return !!S && \['setMid', 'confirmMid', 'setFront', 'setBack', 'confirmAll'\]/.test(v), 'only the photo-tap modes are tap modes');
    assert.ok(/var pinning = tapMode\(\);/.test(v), 'syncImageryForMode hides Esri only for the tap fallback');
    assert.ok(/Set by tapping \(lower detail\)/.test(v), 'the fallback link is there');
    assert.ok(/if \(!S \|\| !canSetHere\(\)\) return;/.test(v), 'Set does nothing below ±5 yds or away from the green');
    assert.ok(/function canSetHere\(\) \{ var y = yardsFromGreen\(\); return gpsGoodEnough\(\) && \(y == null \|\| y <= GREEN_NEAR_YD\); \}/.test(v));
});

test('Google satellite: off without a key; never stored, never for greens, never with another map; logo shown', { skip }, () => {
    const v = read('gps-view.js');
    assert.ok(/return \(pick === 'google' && googleKey\(\)\) \? 'google' : 'esri';/.test(v), 'no key = Esri');
    assert.ok(/mapType: 'satellite', language: 'en-US', region: 'US'/.test(v), 'a satellite session');
    assert.ok(/\/v1\/2dtiles\/\{z\}\/\{x\}\/\{y\}\?session=/.test(v), 'the 2D tile URL with the session');
    // Never stored: the only Cache Storage write is still the USGS pre-cache.
    const pre = v.slice(v.indexOf('function precacheCourse('), v.indexOf('// ---- THE HOLE VIEW'));
    assert.ok(!/google|2dtiles/i.test(pre), 'the pre-cache never touches Google');
    // Never for greens, never with USGS under it.
    assert.ok(/var gWant = \(S\.mode === 'measure' && !S\.googleFailed && S\.map\.getLayer\('google'\)\) \? 'visible' : 'none';/.test(v));
    assert.ok(/var uWant = gWant === 'visible' \? 'none' : 'visible';/.test(v));
    // Google's own logo file, unmodified, alt "Google Maps".
    assert.ok(/class="gps-google-logo" alt="Google Maps"/.test(v) && /logo: 'data:image\/svg\+xml;base64,/.test(v));
});

test('build 3 look: no arcs, no center line, no green fill or outline, nothing yellow; two thin white lines', { skip }, () => {
    const v = read('gps-view.js');
    ['hole-line', 'green-fill', 'green-edge', 'arc-carry', 'arc-pin'].forEach((id) => assert.ok(v.indexOf("{ id: '" + id + "'") === -1, 'layer ' + id + ' is back'));
    assert.ok(/S\.arcs = \[\];/.test(v) && !/G\.yardageArcs\(/.test(v), 'no yardage arcs');
    assert.ok(/\{ id: 'line-to', [^\n]*'line-color': '#ffffff', 'line-width': 1\.6 \}/.test(v) && /\{ id: 'line-on', [^\n]*'line-color': '#ffffff', 'line-width': 1\.6 \}/.test(v), 'two thin white lines');
    const css = v.slice(v.indexOf('var CSS'));
    assert.ok(!/#facc15|#fde68a/i.test(v), 'nothing yellow on the map');
    assert.ok(!/\.gps-ring::before|\.gps-ring::after/.test(css), 'no crosshair');
    // Build 5 (Manny, 2026-10-09) brought "20 yd" back to the hole view, at the end of the width line.
    assert.ok(/lbl\.setAttribute\('data-end'/.test(v), '"20 yd" at one end of the width line');
    assert.ok(/#gps-overlay:not\(\.gps-basic-mode\) \.gps-sub,#gps-overlay \.gps-target-row\{display:none !important;\}/.test(v), 'no source bar, no "Tee -> target" pill');
    assert.ok(/class="gps-pop-info"/.test(v), 'the accuracy / source line is in the credits');
});

test('manual wind: on this phone only, THIS HOLE today only, and it drives plays ~', { skip }, () => {
    const v = read('gps-view.js');
    assert.ok(/var MANUAL_WIND = 'hardpan_wind_manual_v2';/.test(v));
    assert.ok(/if \(!m \|\| m\.day !== today\(\)/.test(v), 'gone the next day');
    assert.ok(/if \(!S \|\| m\.course !== S\.courseKey \|\| m\.hole !== S\.hole\) return null;/.test(v), 'this hole of this course only');
    assert.ok(/S\.mode = 'measure'; S\.draft = null;\s*\/\/[^\n]*\n\s*clearManualWind\(\); closeWindSheet\(\); S\.windKick = true;/.test(v), 'a new hole: back on live wind, asked right away');
    const sec = v.slice(v.indexOf('// ---- MANUAL WIND (build 3'), v.indexOf('function fetchWind('));
    assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|\.ref\(|db\./.test(sec), 'the manual wind is never sent anywhere');
    assert.ok(/var w = effectiveWind\(\), has = !!\(w && !w\.none\);/.test(v), 'plays ~ uses whatever wind is showing');
    assert.ok(/Use live wind/.test(v) && /txt\('\.gps-wind-tag', w\.manual \? 'manual' : ageText\(w\.at\)\)/.test(v));
});

test('build 7 wind dial: a sheet from the bottom, drag any angle in 5s, green at the top, mph 0-40, Done', { skip }, () => {
    const v = read('gps-view.js');
    assert.ok(/class="gps-wind-sheet gps-float"/.test(v) && /\.gps-wind-sheet\{position:absolute;z-index:46;left:0;right:0;bottom:0;/.test(v), 'a bottom sheet');
    assert.ok(!/gps-wind-pop|data-rel="' \+ k/.test(v), 'the 8-arrow grid is gone');
    assert.ok(/G\.dialDeg\(b\.left \+ b\.width \/ 2, b\.top \+ b\.height \/ 2, e\.clientX, e\.clientY, 5\)/.test(v), 'the finger\'s angle, 5-degree steps');
    assert.ok(/class="gps-dial-green"[^']*green<\/span>/.test(v), 'the green flag at the top of the dial');
    assert.ok(/class="gps-ws-slider" min="0" max="40"/.test(v) && /var WIND_MAX_MPH = 40;/.test(v), 'a 0-40 slider');
    assert.ok(/'From ' \+ G\.compassName\(fromDeg\) \+ ' (·|\\u00b7) ' \+ mph \+ ' mph'/.test(v), '"From W · 12 mph"');
    assert.ok(/function keepClearOfSheet\(\)/.test(v) && /if \(wsR\) safeBot = Math\.min\(safeBot, wsR\.t - M\);/.test(v), 'never over the target or the numbers');
});

test('build 7 live wind: the station\'s latest observation first, the hourly forecast as backup, every 10 minutes, course point only', { skip }, () => {
    const v = read('gps-view.js');
    const sec = v.slice(v.indexOf('// ---- WIND (Wave 1; LIVE, ALWAYS ON in build 7)'), v.indexOf('// ---- PLAYS LIKE (Wave 2)'));
    assert.ok(/var WIND_FRESH_MS = 10 \* 60 \* 1000, WIND_SHOW_MS = 60 \* 60 \* 1000/.test(sec), '10-minute refresh, shown up to an hour');
    assert.ok(/get\(id \+ '\/observations\/latest'\)/.test(sec) && /\.then\(null, function \(\) \{ return hourlyReading\(c\); \}\)/.test(sec), 'observation, then the forecast');
    assert.ok(/get\(nwsBase\(\) \+ '\/points\/' \+ pt\[0\] \+ ',' \+ pt\[1\]\)/.test(sec) && /var pt = coursePoint\(\);/.test(sec), 'the course point');
    assert.ok(!/\bfix\b|coords|watchPosition/.test(sec), 'never the golfer\'s position');
    assert.ok(/if \(e && e\.notFound\) lsSet\(ptKey, \{ at: Date\.now\(\), outside: true \}\);/.test(sec) && /if \(ew && ew\.outside\) \{ box\.style\.display = 'none';/.test(sec), 'outside the US: no box');
    assert.ok(/windTimer = setInterval\(/.test(sec) && /stopWindTick\(\);/.test(v.slice(v.indexOf('function unmount('))), 'the tick stops with the view');
    assert.ok(/if \(windTimer && typeof windTimer\.unref === 'function'\) windTimer\.unref\(\);/.test(sec), 'never keeps a test process alive');
    const show = v.slice(v.indexOf('function showSide('), v.indexOf('function showSide(') + 1500);
    assert.ok(/S\.windKick = true;\s*startWindTick\(\);/.test(show) && /closeWindSheet\(\);\s*stopWindTick\(\);/.test(show), 'only while GPS is showing');
    assert.ok(/w\.mph \+ \(w\.gustMph \? ' g ' \+ w\.gustMph : ''\) \+ ' mph'/.test(sec), '"12 g 20 mph"');
});

test('build 5 landing: the Card choice is remembered per round, so every new round opens on GPS', { skip }, () => {
    const v = read('gps-view.js');
    assert.ok(/localStorage\.setItem\(SIDE_KEY, S && S\.eventCode \? side \+ '\|' \+ S\.eventCode : side\)/.test(v), 'stored with the round code');
    assert.ok(/if \(r\.round != null && \(!S \|\| r\.round !== S\.eventCode\)\) return null;/.test(v), 'another round\'s choice is not this round\'s');
    // The landing still respects a choice made in THIS round, and denied location.
    assert.ok(/if \(storedSide\(\) === 'bets'\) return;/.test(v));
});

test('build 5, any course: the OpenStreetMap lookup asks from the COURSE point, keeps clean holes, shares best-effort', { skip }, () => {
    const v = read('gps-view.js'), g = read('gps-geo.js');
    const sec = v.slice(v.indexOf('// ---- ANY COURSE: AN OPENSTREETMAP LOOKUP'), v.indexOf('// ONE writer for a pin.'));
    const mt = read('gps-match.js');
    // 2026-10-10: the lookup itself lives in gps-match.js (shared with the setup page).
    assert.ok(/M\.match\(lookupWant\(\)\)/.test(sec) && /loc: S\.courseLoc/.test(sec) && !/\bfix\b/.test(sec.slice(sec.indexOf('function lookupWant'), sec.indexOf('function chooseHoleOne'))), 'the course point, never the golfer');
    assert.ok(!/\bfix\b|coords|watchPosition/.test(mt), 'gps-match.js never sees the golfer');
    assert.ok(/db\.ref\('global_courses\/' \+ key \+ '\/location'\)/.test(sec), 'the location comes from the course directory');
    assert.ok(/G\(\)\.golfCoursesQuery\(opts\.loc\)/.test(mt) && /G\(\)\.pickGolfCourse\(/.test(mt) && /G\(\)\.cleanLookupHoles\(/.test(mt) && /G\(\)\.pickHoleSet\(/.test(mt), 'the shared pure parts');
    assert.ok(/course_gps\/' \+ key \+ '\/osm'\)\.set\(rec\)/.test(mt) && /w\.then\(null, function \(\) \{\}\)/.test(mt), 'shared best-effort; a refusal is fine');
    assert.ok(/RETRY_NONE_MS = 7 \* 24 \* 3600 \* 1000/.test(mt), 'nothing found: not asked again for a week');
    assert.ok(/!pointInRing\(o\.end, o\.green\)/.test(g) && /delete o\.par;/.test(g), 'kept only when the hole line ends in its green; OSM par dropped');
});

test('build 5, no data = no GPS landing; never centred on the golfer off the course', { skip }, () => {
    const v = read('gps-view.js');
    assert.ok(/if \(!holeHasData\(S\.hole\)\) return;/.test(v), 'no green for this hole: the round stays on the Card');
    assert.ok(/if \(cc && G\.haversineMeters\(fix\.pt, cc\) <= 3000\)/.test(v), 'the dot framing only at the course');
    assert.ok(/No GPS map for this course yet/.test(v), 'no location: a note, not a map of the street');
    const blocks = read('index.html').split('// GPS:BEGIN').slice(1).map((b) => b.split('// GPS:END')[0]).join('\n');
    assert.ok(/window\.HardPanGps\.holeHasData\(currentViewedHole\)/.test(blocks), 'after Enter Score: back to GPS only with data');
});

test('build 5 target: two rings, one width line square to the shot, "20 yd" in both views; numbers in the safe area', { skip }, () => {
    const v = read('gps-view.js');
    assert.ok(/<span class="gps-ring"><\/span><span class="gps-ring-in"><\/span><span class="gps-ring-line"><\/span>(<span class="gps-ring-dot"><\/span>)?<span class="gps-ring-lbl"><\/span>/.test(v));
    assert.ok(/ang = Math\.atan2\(b\.y - a\.y, b\.x - a\.x\) \* 180 \/ Math\.PI \+ 90;/.test(v), 'square to the shot line');
    assert.ok(/line\.style\.width = d \+ 'px'/.test(v), 'the line is the circle\'s width - a true 20 yds');
    assert.ok(!/lbl\.style\.display = S\.view === 'green'/.test(v), 'the label is no longer Green-view only');
    assert.ok(/rc\.t < safeTop \|\| rc\.r > W - M \|\| rc\.b > safeBot/.test(v), 'numbers stay between the top panel and the bottom row');
});

test('build 5 target: the shot lines stop at the ring, so the width line never makes a crosshair', { skip }, () => {
    const v = read('gps-view.js');
    assert.ok(/return G\.destination\(to, G\.bearingDeg\(to, from\), ringM\);/.test(v));
    assert.ok(/feature\('to', 'LineString', \[ll\(o\.pt\), ll\(eTo\)\]\)/.test(v) && /feature\('on', 'LineString', \[ll\(eOn\), ll\(aim\)\]\)/.test(v));
});

test('build 6 smart default target, on the bundled holes: par 3 center; 260 along the line (doglegs); 60 short; 260 from the golfer or the center inside 280', { skip }, () => {
    const G = require('./gps-geo.js'), T = require('./gps-courses.js');
    const vm = require('vm'), sb = {};
    vm.runInNewContext(read('course-data.js') + ';this.p=coursePresets', sb);
    const yd = (m) => Math.round(m / 0.9144);
    const hole = (k, n) => G.osmCourse(T, k).holes[String(n)].osm;
    const def = (k, n, extra) => { const r = hole(k, n); return G.defaultTarget(Object.assign({ par: sb.p[k].data[n - 1].par, tee: r.tee, mid: r.mid, line: r.line, fairway: r.fairway, from: 'tee', pt: r.tee }, extra || {})); };
    assert.strictEqual(G.DEFAULT_SHOT_YD, 260, 'one constant (My Clubs will replace it)');
    // Par 3 (Caledonia #3): the green's center.
    assert.deepStrictEqual(def('caledonia', 3), hole('caledonia', 3).mid);
    // Par 4 (Caledonia #1): 260 from the tee, in the fairway.
    const t1 = def('caledonia', 1), h1 = hole('caledonia', 1);
    assert.ok(Math.abs(yd(G.haversineMeters(h1.tee, t1)) - 260) <= 3, 'Caledonia #1: ' + yd(G.haversineMeters(h1.tee, t1)));
    assert.ok(h1.fairway.some((r) => G.pointInRing(t1, r)), 'in the fairway');
    // Par 5 (Caledonia #2, "301 / 301" before): not halfway any more.
    const t2 = def('caledonia', 2), h2 = hole('caledonia', 2);
    assert.ok(yd(G.haversineMeters(t2, h2.mid)) > yd(G.haversineMeters(h2.tee, t2)) + 50, 'Caledonia #2 is no longer split 50/50');
    // Dogleg (Caledonia #13): 260 ALONG the line - the straight distance is shorter.
    const t13 = def('caledonia', 13), h13 = hole('caledonia', 13);
    const straight = yd(G.haversineMeters(h13.tee, t13));
    assert.ok(straight < 258 && straight > 230, 'Caledonia #13 follows the dogleg: ' + straight);
    // Short par 4: never inside 60 of the green (a line shorter than 320).
    const shortLine = [h1.tee, G.pointAlongHole(h1.line, h1.tee, 280 * 0.9144)];
    const ts = G.defaultTarget({ par: 4, tee: h1.tee, mid: shortLine[1], line: shortLine, from: 'tee' });
    assert.ok(yd(G.haversineMeters(ts, shortLine[1])) >= 59, 'short hole: ' + yd(G.haversineMeters(ts, shortLine[1])));
    // On the hole: the green's center inside 280, else 260 from the golfer.
    assert.deepStrictEqual(def('caledonia', 2, { from: 'me', pt: G.pointAlongHole(h2.line, h2.tee, 400 * 0.9144) }), h2.mid);
    const me = G.pointAlongHole(h2.line, h2.tee, 100 * 0.9144);
    const tm = def('caledonia', 2, { from: 'me', pt: me });
    assert.ok(Math.abs(yd(G.haversineMeters(me, tm)) - 260) <= 12, 'from the golfer: ' + yd(G.haversineMeters(me, tm)));
    // Par comes from the CARD: gps-view hands defaultTarget S.par.
    assert.ok(/G\.defaultTarget\(\{\s*par: S\.par,/.test(read('gps-view.js')));
    assert.ok(/'\.gps-recenter', function \(\) \{ if \(S\) \{ S\.targetMoved = false; S\.target = null; \}/.test(read('gps-view.js')), 'Recenter resets it');
});

test('build 7: the numbers ride their own lines (shrinking before sliding), a center dot, F / C / B 25% bigger', { skip }, () => {
    const v = read('gps-view.js');
    assert.ok(/var SIZES = \[44, 38, 32\], TS = \[0\.5,/.test(v), 'the middle first, 44 -> 38 -> 32 px');
    assert.ok(/for \(var i = 0; i < TS\.length; i\+\+\) \{\s*for \(var j = 0; j < SIZES\.length; j\+\+\)/.test(v), 'shrink at a spot before moving along the line');
    assert.ok(/put\(pOn, P\(eOn\), P\(aim\),/.test(v) && /put\(pTo, P\(o\.pt\), P\(eTo\),/.test(v), 'each number on its own line');
    assert.ok(/place\(rc2, SIZES\[SIZES\.length - 1\], 'line-crowded'\)/.test(v), 'with no clear spot it still stays on its line');
    assert.ok(/<span class="gps-ring-dot"><\/span>/.test(v) && /\.gps-target \.gps-ring-dot\{[^}]*width:14px;height:14px;/.test(v), 'the center dot');
    assert.ok(/\.gps-pin\{width:20px;height:20px;/.test(v) && /\.gps-green-lbl\{[^}]*font:800 15px/.test(v), 'F / C / B bigger');
});

test('build 7: F / B follow the golfer\'s live angle - 100 yds right of the green, pin high: front = right edge, back = left edge, on the golfer -> center line; they move with every fix', { skip }, () => {
    const G = require('./gps-geo.js'), T = require('./gps-courses.js');
    const h = G.osmCourse(T, 'caledonia').holes['1'].osm;
    const r = { mid: h.mid, green: h.green, useGreenForEdges: true, tee: h.tee };
    const axis = G.bearingDeg(h.tee, h.mid);                       // the line of play
    const me = G.destination(h.mid, axis + 90, 100 * G.M_PER_YD);  // 100 yds to the RIGHT, pin high
    const n = G.holeNumbers(me, r);
    assert.ok(n && n.front && n.back, 'front and back from the golfer');
    // Both on the golfer -> green-center line.
    const proj = (p) => { const k = Math.cos(h.mid[0] * Math.PI / 180); return [(p[1] - h.mid[1]) * k * 111320, (p[0] - h.mid[0]) * 110540]; };
    const onLine = (p) => { const a = proj(me), b = [0, 0], q = proj(p); const cross = Math.abs((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / Math.hypot(b[0] - a[0], b[1] - a[1]); return cross; };
    assert.ok(onLine(n.front) < 0.5 && onLine(n.back) < 0.5, 'front and back sit on the golfer -> center line: ' + [onLine(n.front), onLine(n.back)]);
    // Front is the near (RIGHT) edge, back the far (LEFT) edge - not the tee's front and back.
    assert.ok(n.frontM < n.middleM && n.middleM < n.backM, 'front < center < back from the golfer');
    const side = (p) => Math.sin((G.bearingDeg(h.mid, p) - axis) * Math.PI / 180);   // + = right of the line of play
    assert.ok(side(n.front) > 0.9 && side(n.back) < -0.9, 'front on the right edge, back on the left: ' + [side(n.front), side(n.back)]);
    const teeN = G.holeNumbers(h.tee, r);
    assert.ok(G.haversineMeters(teeN.front, n.front) > 5, 'not the tee\'s front');
    // A new fix (the golfer walks 30 yds toward the green): new front and back.
    const me2 = G.destination(me, G.bearingDeg(me, h.mid), 30 * G.M_PER_YD), n2 = G.holeNumbers(me2, r);
    assert.ok(Math.abs(n2.frontM - (n.frontM - 30 * G.M_PER_YD)) < 2, 'front moves with the golfer');
    // The screen asks with the LIVE origin on every fix (render on each position).
    const v = read('gps-view.js');
    assert.ok(/var nums = r \? G\.holeNumbers\(o \? o\.pt : null, r\) : null;\s*marker\('front', nums && nums\.front/.test(v), 'the F / B markers come from the live origin');
    assert.ok(/fix = \{ pt: \[pos\.coords\.latitude, pos\.coords\.longitude\], acc: pos\.coords\.accuracy \};\s*S\.geoError = null;\s*render\(\);/.test(v), 'every fix redraws them');
});

test('GPS badge on online course search results: bundled greens and course_gps first, never Overpass per result', { skip }, async () => {
    const vm = require('vm');
    const a = read('admin.html');
    const i = a.indexOf('    // THE GPS-MAPPED BADGE');
    const start = a.lastIndexOf('// GPS:BEGIN', i), end = a.indexOf('// GPS:END', i);
    assert.ok(i > 0 && start > 0 && end > i, 'the badge is one GPS-only block');
    const block = a.slice(start, end);
    assert.ok(!/overpass|interpreter|fetch\(/i.test(block.replace(/^\s*\/\/.*$/gm, '')), 'no live OpenStreetMap query, no network fetch per result');
    assert.ok(/\/\/ GPS:BEGIN\s*\n\s*addGpsBadge\(title, c\);\s*\n\s*\/\/ GPS:END/.test(a), 'its one call is GPS-only too');
    // Run the real block with the real bundle.
    const store = {}, reads = [];
    const records = { gca_partial: { pins: { h1: { mid: { lat: 1, lng: 2 } }, h2: { mid: { lat: 1, lng: 2 } }, h3: {} } } };
    const sb = {
        window: { HardPanGpsCourses: require('./gps-courses.js') }, document: {},
        localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
        globalCourses: {}, importedCourseKey: (c) => c.key,
        db: { ref: (p) => ({ once: () => { reads.push(p); const k = p.split('/')[1]; return Promise.resolve({ val: () => records[k] || null }); } }) },
    };
    vm.createContext(sb);
    vm.runInContext(block + '\nthis.addGpsBadge = addGpsBadge;', sb);
    const el = () => { const kids = []; return { kids, appendChild: (k) => kids.push(k) }; };
    sb.document.createElement = () => ({ style: {}, dataset: {}, textContent: '', className: '' });
    const badge = async (key) => { const t = el(); sb.addGpsBadge(t, { key }); await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0)); return t.kids[0]; };
    const full = await badge('caledonia');
    assert.equal(full.textContent, 'GPS ✓'); assert.equal(full.dataset.gps, 'full');
    const composed = await badge('thistle_27_cameron_stewart');
    assert.equal(composed.textContent, 'GPS ✓', 'a 27-hole pairing: two bundled nines make 18');
    const part = await badge('gca_partial');
    assert.equal(part.textContent, 'GPS partial (2/18)', 'greens fixed by GPS in course_gps (a pin with no center does not count)');
    const none = await badge('gca_nothing');
    assert.equal(none.textContent, 'No GPS yet');
    // This phone's own earlier OpenStreetMap lookup counts too.
    store.hardpan_osm_v1_gca_looked = JSON.stringify({ holes: { 1: { osm: { green: [[0, 0], [0, 1], [1, 1]] } }, 2: { osm: { mid: [0, 0] } } } });
    assert.equal((await badge('gca_looked')).textContent, 'GPS partial (2/18)');
    assert.ok(reads.every((p) => /^course_gps\/[\w-]+$/.test(p)), 'one course_gps read per result: ' + reads.join(' '));
    // 9-HOLE COURSES: out of the course's own hole count whenever it is known.
    const nineGreens = {}, fiveGreens = {};
    for (let n = 1; n <= 9; n++) nineGreens[n] = { osm: { mid: [0, 0] } };
    for (let n = 1; n <= 5; n++) fiveGreens[n] = { osm: { mid: [0, 0] } };
    const card9 = Array.from({ length: 9 }, (_, i) => ({ hole: i + 1, par: 4 }));
    Object.assign(sb.window.HardPanGpsCourses, { __nine_preset: { v: 1, holes: nineGreens }, __nine_half: { v: 1, holes: fiveGreens }, __nine_record: { v: 1, holes: nineGreens }, __nine_tees: { v: 1, holes: nineGreens } });
    sb.coursePresets = { __nine_preset: { name: 'Nine', data: card9 }, __nine_half: { name: 'Nine', data: card9 } };
    sb.globalCourses.__nine_record = { name: 'Nine', data: card9 };
    assert.equal((await badge('__nine_preset')).textContent, 'GPS \u2713', 'the directory says 9 holes, all 9 have greens');
    assert.equal((await badge('__nine_half')).textContent, 'GPS partial (5/9)', 'out of 9, not 18');
    assert.equal((await badge('__nine_record')).textContent, 'GPS \u2713', 'the course record (after an import) says 9');
    store.hardpan_osm_v1___nine_tees_x = JSON.stringify({ holes: nineGreens });
    const t2 = el(); sb.addGpsBadge(t2, { key: '__nine_tees_x', tees: { male: [{ tee_name: 'White', number_of_holes: 9, holes: card9 }] } });
    await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
    assert.equal(t2.kids[0].textContent, 'GPS \u2713', 'the GolfCourseAPI result\'s own tees say 9 holes');
    assert.equal((await badge('thistle_27_cameron')).textContent, 'GPS \u2713', 'a bundled nine on its own counts out of 9');
    store.hardpan_osm_v1___unknown = JSON.stringify({ holes: nineGreens });
    assert.equal((await badge('__unknown')).textContent, 'GPS partial (9/18)', 'unknown hole count: out of 18');
    assert.equal(store.hardpan_gps_course_v1_gca_partial !== undefined, true, 'the record is kept on the phone for next time (offline)');
});

test('GPS badge, coverage list: a mapped course that is not bundled never reads "No GPS yet"; only the searched state loads', { skip }, async () => {
    const vm = require('vm');
    const a = read('admin.html');
    const i = a.indexOf('    // THE GPS-MAPPED BADGE');
    const block = a.slice(a.lastIndexOf('// GPS:BEGIN', i), a.indexOf('// GPS:END', i));
    const cov = { AZ: require('./gps-coverage-az.js'), FL: require('./gps-coverage-fl.js'), WA: require('./gps-coverage-wa.js') };
    ['az', 'wa', 'or', 'ct', 'fl'].forEach((st) => {
        const f = 'gps-coverage-' + st + '.js', d = require('./' + f);
        assert.ok(Array.isArray(d.rows) && d.rows.length > 100, f + ' has rows');
        assert.ok(d.rows.every((r) => r.length === 9 && typeof r[0] === 'number' && r[3] <= r[5] && r[4] <= r[3] && Math.abs(r[7]) <= 90 && Math.abs(r[8]) <= 180), f + ': [id, name, city, greens, usable, holes, ready, lat, lon] - no outlines');
        assert.ok(fs.statSync(path.join(__dirname, f)).size < 300 * 1024, f + ' stays small');
    });
    const loaded = [];
    const sb = {
        window: { HardPanGpsCourses: require('./gps-courses.js'), HardPanGpsCoverage: {} },
        localStorage: { getItem: () => null, setItem: () => {} }, globalCourses: {}, importedCourseKey: (c) => 'gca_' + c.id,
        courseDisplayName: (c) => c.club_name + (c.course_name ? ' (' + c.course_name + ')' : ''),
        db: { ref: () => ({ once: () => Promise.resolve({ val: () => null }) }) },
    };
    sb.document = { head: { appendChild: (el) => { loaded.push(el.src); const st = el.src.match(/gps-coverage-(\w+)\.js/)[1].toUpperCase(); sb.window.HardPanGpsCoverage[st] = cov[st]; setTimeout(el.onload, 0); } },
        createElement: (t) => (t === 'script' ? {} : { style: {}, dataset: {}, textContent: '' }) };
    vm.createContext(sb);
    vm.runInContext(block + '\nthis.addGpsBadge = addGpsBadge; this.gpsCoverageRow = gpsCoverageRow;', sb);
    const badge = async (c) => { const kids = []; sb.addGpsBadge({ appendChild: (k) => kids.push(k) }, c); for (let k = 0; k < 6; k++) await new Promise((r) => setTimeout(r, 0)); return kids[0].textContent; };
    // Streamsong Black: bundle-ready in OSM, not bundled, no key of ours -> GPS ✓ from the list.
    assert.equal(await badge({ id: 'x1', club_name: 'Streamsong Resort', course_name: 'Black', location: { city: 'Bowling Green', state: 'FL' } }), 'GPS \u2713');
    // FireRock: 6 holes usable in OSM - partial from the list, not "No GPS yet".
    assert.equal(await badge({ id: 'x2', club_name: 'FireRock Country Club', location: { city: 'Fountain Hills', state: 'AZ' } }), 'GPS partial (6/18)');
    // We-Ko-Pa: 10 greens but no hole lines - nothing the phone's lookup can use, so honestly "No GPS yet".
    assert.equal(await badge({ id: 'x6', club_name: 'We-Ko-Pa Golf Club', location: { city: 'Fort McDowell', state: 'AZ' } }), 'No GPS yet');
    // Dobson Ranch, all 18 mapped (2026-10-10), under a key the bundle does not use: GPS ✓ from the list.
    assert.equal(await badge({ id: 'x5', club_name: 'Dobson Ranch Golf Course', location: { city: 'Mesa', state: 'AZ' } }), 'GPS \u2713');
    // Not in OSM at all, and a state the list does not cover: unchanged.
    assert.equal(await badge({ id: 'x3', club_name: 'Nowhere Links Of Make Believe', location: { city: 'Mesa', state: 'AZ' } }), 'No GPS yet');
    assert.equal(await badge({ id: 'x4', club_name: 'Pebble Beach Golf Links', location: { city: 'Pebble Beach', state: 'CA' } }), 'No GPS yet');
    assert.deepEqual(loaded.sort(), ['gps-coverage-az.js', 'gps-coverage-fl.js'], 'only the searched states loaded, once each');
    // Matching: the course's own words, the town breaks a tie, a tie is no match.
    const W = { rows: [[1, 'Legacy Golf Resort Phoenix', 'Phoenix', 18, 18, 18, 1, 33.4, -112.0], [2, 'Legacy Golf Club', 'Tucson', 0, 0, 18, 0, 32.2, -110.9]] };
    assert.equal(sb.gpsCoverageRow({ club_name: 'Legacy Golf Resort', location: { city: 'Phoenix' } }, W)[0], 1);
    const W2 = { rows: [[2, 'Legacy Golf Club', 'Tucson', 0, 0, 18, 0, 32.2, -110.9], [3, 'Legacy Golf Club', 'Sun City', 18, 18, 18, 1, 33.6, -112.3]] };
    assert.equal(sb.gpsCoverageRow({ club_name: 'Legacy Golf Club', location: { city: 'Mesa' } }, W2), null, 'two Legacy Golf Clubs and no town to tell them apart: no badge from the list');
    assert.equal(sb.gpsCoverageRow({ club_name: 'Legacy Golf Club', location: { city: 'Sun City' } }, W2)[0], 3, 'the town tells them apart');
    assert.equal(sb.gpsCoverageRow({ club_name: 'Golf Club', location: {} }, W), null, 'no naming words, no match');
});

test('a newer bundle beats an old OSM lookup cached on the phone (and only a strictly newer lookup beats the bundle)', { skip }, () => {
    const vm = require('vm');
    const v = read('gps-view.js');
    const src = v.slice(v.indexOf('    function osmRecord(key) {'), v.indexOf('    function holeKey(n)'));
    const sb = { window: { HardPanGpsCourses: { k: { v: 1, osmBase: '2026-10-10T10:30:00Z', holes: { 1: 'bundle' } } } }, G: { osmCourse: (t, k) => (k && t[k]) || null, bundleKeyFor: (t, k) => (t[k] ? k : null) }, lookup: null, S: null };
    vm.createContext(sb);
    vm.runInContext(src + '\nfunction lookedUp() { return lookup; }\nfunction golfapiFor() { return null; }\nfunction osmOn() { return true; }\nthis.osmRecord = osmRecord;', sb);
    sb.lookup = { osmBase: '2026-10-09T23:00:00Z', holes: { 1: 'old lookup' } };
    assert.equal(sb.osmRecord('k').holes[1], 'bundle', 'old lookup, newer bundle: the bundle');
    sb.lookup = { osmBase: null, holes: { 1: 'undated lookup' } };
    assert.equal(sb.osmRecord('k').holes[1], 'bundle', 'no date: the bundle');
    sb.lookup = { osmBase: '2026-10-12T00:00:00Z', holes: { 1: 'newer lookup' } };
    assert.equal(sb.osmRecord('k').holes[1], 'newer lookup', 'a lookup made after the bundle was built: the lookup');
    sb.lookup = { osmBase: '2026-10-09T23:00:00Z', holes: { 1: 'only a lookup' } };
    assert.equal(sb.osmRecord('none').holes[1], 'only a lookup', 'nothing bundled: the lookup');
});

test('gps-match: Talking Stick Piipaash and O\'odham, picked separately, each get only their own 18; an unsure club asks once and is answered from then on', { skip }, async () => {
    const vm = require('vm');
    const store = {};
    const fixture = (f) => JSON.parse(read('gps-osm/' + f + '.json'));
    let served = null, asked = 0;
    const sb = {
        localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
        HARDPAN_GPS_CONFIG: {}, HardPanGpsCourses: {},
        fetch: (url, o) => { asked++; const q = decodeURIComponent(String(o.body).slice(5)); const body = /leisure/.test(q) ? { elements: [served.course] } : fixture(served.file);
            return Promise.resolve({ ok: true, json: () => Promise.resolve(body) }); },
    };
    sb.window = sb; sb.module = undefined;
    vm.createContext(sb);
    vm.runInContext(read('gps-geo.js'), sb);
    vm.runInContext(read('gps-match.js'), sb);
    const M = sb.HardPanGpsMatch;
    const TS = { type: 'way', id: 61417793, tags: { leisure: 'golf_course', name: 'Talking Stick Golf Club' } };
    served = { course: TS, file: 'talking_stick' };
    const pi = await M.match({ key: 'k_pi', name: 'Talking Stick Golf Club (Piipaash)', loc: [33.53, -111.87], holes: 18 });
    const od = await M.match({ key: 'k_od', name: "Talking Stick Golf Club (O'odham)", loc: [33.53, -111.87], holes: 18 });
    assert.deepEqual([pi.status, pi.n, pi.step], ['ready', 18, 2], JSON.stringify(pi));
    assert.deepEqual([od.status, od.n, od.step], ['ready', 18, 2], JSON.stringify(od));
    const recPi = JSON.parse(store.hardpan_osm_v1_k_pi), recOd = JSON.parse(store.hardpan_osm_v1_k_od);
    const greensOf = (r) => Object.keys(r.holes).map((n) => JSON.stringify(r.holes[n].osm.mid));
    assert.equal(greensOf(recPi).filter((g) => greensOf(recOd).includes(g)).length, 0, 'no green in both courses');
    assert.equal(Object.keys(recPi.holes).length, 18); assert.equal(Object.keys(recOd.holes).length, 18);
    // Kept: the next match is instant and needs no network (GPS opens on it offline).
    const before = asked;
    assert.equal((await M.match({ key: 'k_pi', name: 'x', loc: null, holes: 18 })).status, 'ready');
    assert.equal(asked, before, 'no request for a course already matched');
    // We-Ko-Pa by its club name: two courses, no name settles it -> ask (step 5), then the tap answers.
    served = { course: { type: 'way', id: 262825784, tags: { leisure: 'golf_course', name: 'We-Ko-Pa Golf Club' } }, file: 'wekopa' };
    const wk = await M.match({ key: 'k_wk', name: 'We-Ko-Pa Golf Club', loc: [33.62, -111.68], holes: 18 });
    assert.equal(wk.status, 'ask'); assert.equal(wk.candidates.length, 2);
    assert.deepEqual(wk.candidates.map((c) => c.label).sort(), ['Cholla', 'Saguaro'], 'shown by their own names');
    const done = await M.choose('k_wk', wk.candidates.find((c) => c.label === 'Saguaro').id, {});
    assert.deepEqual([done.status, done.n, done.step], ['ready', 18, 5]);
    assert.ok(store.hardpan_holechoice_v1_k_wk, 'the tap is kept on the phone');
    // The kept lookup gone (cleared on this phone) but the tap kept: it answers without asking.
    delete store.hardpan_osm_v1_k_wk; delete store.hardpan_osm_v1_tried_k_wk;
    const again = await M.match({ key: 'k_wk', name: 'We-Ko-Pa Golf Club', loc: [33.62, -111.68], holes: 18 });
    assert.deepEqual([again.status, again.step], ['ready', 5]);
    // Reserve Vineyards: too few hole lines to tell its courses apart -> no GPS yet, never a wrong course.
    served = { course: { type: 'way', id: 136348508, tags: { leisure: 'golf_course', name: 'The Reserve' } }, file: 'reserve_vineyards' };
    const rv = await M.match({ key: 'k_rv', name: 'The Reserve Vineyards (North)', loc: [45.48, -122.9], holes: 18 });
    assert.equal(rv.status, 'none'); assert.match(rv.how, /too few to tell/);
});

test('setup step 2 links the course to OpenStreetMap at pick time, and says what it found under the name', { skip }, () => {
    const a = read('admin.html');
    assert.ok(/\/\/ GPS:BEGIN\s*\n\s*if \(typeof gpsSetupMatch === 'function'\) gpsSetupMatch\(courseKey\);\s*\n\s*\/\/ GPS:END\s*\n    \}/.test(a), 'every course pick (directory or import) runs the match - GPS-only');
    ['GPS \u2713 ready', "'GPS partial ('", 'Choose hole 1 on the map', 'No GPS yet: you can tap greens during the round'].forEach((t) => assert.ok(a.includes(t), t));
    assert.ok(/M\.match\(\{ key, name, loc, holes, pars: card\.map\(\(h\) => h\.par\), yards, db, recheck \}\)/.test(a), 'the one matcher, with our card');
    assert.ok(/localStorage\.setItem\(GPS_COURSE_LOC \+ key/.test(a), 'the point is kept for the GPS side');
    assert.ok(/window\.HardPanGpsMatch\.choose\(key, c\.id, \{ db \}\)/.test(a), 'the tap is saved through the matcher');
    const sec = a.slice(a.indexOf('// ---- LINKED TO OPENSTREETMAP AT PICK TIME'), a.indexOf('// ---- THE CONFIRMATION.'));
    assert.ok(!/geolocation|watchPosition|coords/.test(sec), 'setup never uses the golfer\'s position');
});

test('a FRESH PULL when a course is picked: the copy first, the pull only if newer and with at least as many holes; once an hour; not on the tee - Canyon Lakes hole 8', { skip }, async () => {
    const vm = require('vm');
    const store = {};
    const full = JSON.parse(read('gps-osm/canyon_lakes_kennewick.json'));
    // The bundle as build 8 shipped it: hole 8 missing, read from older OSM data.
    const bundle = JSON.parse(JSON.stringify(require('./gps-courses.js')));
    delete bundle.gca_f0s28j10.holes['8'];
    bundle.gca_f0s28j10.osmBase = '2026-10-09T18:29:31Z';
    let fetches = 0, serve = full, online = true, now = Date.now();
    const sb = {
        localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
        HARDPAN_GPS_CONFIG: {}, HardPanGpsCourses: bundle,
        navigator: { get onLine() { return online; } },
        fetch: (url, o) => { fetches++; const q = decodeURIComponent(String(o.body).slice(5));
            const body = /leisure/.test(q) ? { elements: [{ type: 'relation', id: 19187969, tags: { leisure: 'golf_course', name: 'Canyon Lakes Golf Course' } }] } : serve;
            return Promise.resolve({ ok: true, json: () => Promise.resolve(body) }); },
    };
    sb.window = sb;
    sb.Date = class extends Date { constructor(...a) { if (a.length) super(...a); else super(now); } static now() { return now; } };
    vm.createContext(sb);
    vm.runInContext(read('gps-geo.js'), sb);
    vm.runInContext(read('gps-match.js'), sb);
    const M = sb.HardPanGpsMatch;
    const pick = (x) => M.match(Object.assign({ key: 'gca_f0s28j10', name: 'Canyon Lakes Golf Course', loc: [46.1765, -119.1703], holes: 18, recheck: 'pick' }, x || {}));
    // The copy on the phone answers at once (the setup line shows it before any pull).
    assert.equal(M.known('gca_f0s28j10', 18, 'Canyon Lakes Golf Course').n, 17);
    // Picked: a fresh pull - newer and more holes -> taken.
    const r1 = await pick();
    assert.deepEqual([r1.status, r1.n, r1.rechecked, fetches], ['ready', 18, 'better', 2]);
    assert.equal(M.known('gca_f0s28j10', 18, 'Canyon Lakes Golf Course').n, 18, 'the newer copy now answers - the GPS view uses the same rule');
    // Tapped again within the hour: no pull.
    await pick();
    assert.equal(fetches, 2, 'repeat taps in the hour use the copy');
    // An hour later, OSM newer but WORSE (greens deleted): the copy stands.
    now += 61 * 60000;
    serve = { osm3s: { timestamp_osm_base: '2026-12-01T00:00:00Z' }, elements: full.elements.filter((e) => !(e.tags && e.tags.golf === 'green' && /^[0-9]$/.test(String(e.id).slice(-1)) && Number(String(e.id).slice(-1)) < 5)) };
    const r2 = await pick();
    assert.equal(fetches, 4);
    assert.deepEqual([r2.n, r2.rechecked], [18, 'kept the copy']);
    assert.match(r2.why, /fewer holes/);
    // Same OSM data as the copy (not newer): kept as it is.
    now += 61 * 60000;
    serve = full;
    const r3 = await pick();
    assert.deepEqual([r3.n, r3.rechecked], [18, 'kept the copy']);
    assert.match(r3.why, /not newer/);
    // No signal: the copy, silently, no request.
    now += 61 * 60000; online = false;
    const before = fetches;
    assert.equal((await pick()).n, 18); assert.equal(fetches, before);
    online = true;
    // The organizer's Refresh ignores the hour.
    const r4 = await pick({ recheck: true });
    assert.equal(fetches, before + 2); assert.equal(r4.n, 18);
});

test('pulls happen at pick time; GPS opening during the round does not pull; the organizer keeps a hidden Refresh', { skip }, () => {
    const v = read('gps-view.js'), a = read('admin.html');
    assert.ok(/if \(osmRecord\(key\)\) \{ fin\(true\); return; \}/.test(v) && !/recheckCourse\('daily'\)/.test(v), 'no pull on the tee');
    assert.ok(/class="gps-menu-item gps-refresh-gps"[^']*>Refresh GPS data</.test(v) && /show\('\.gps-refresh-gps', !!S\.canFix && S\.pro && !setting\)/.test(v), 'organizer only, in Tools');
    assert.ok(/on\(el, '\.gps-refresh-gps'[\s\S]{0,1400}recheckCourse\(true,/.test(v), 'Refresh pulls now (OpenStreetMap on)');
    assert.ok(/on\(el, '\.gps-refresh-gps'[\s\S]{0,400}if \(!osmOn\(\)\) \{[\s\S]{0,300}L\.ensure\(S\.courseKey\)/.test(v), 'OpenStreetMap off: Refresh re-reads the live course, never Overpass');
    assert.ok(/w\.loc = S\.courseLoc \|\| courseCenter\(\);/.test(v), 'from the course point, never the golfer');
    assert.ok(/if \(known\) gpsSetupRender\(key, known, name\);\s*\n\s*if \(!gpsOsmOn\(\)\) \{[\s\S]{0,500}return;\s*\n\s*\}\s*\n\s*const recheck = known \? 'pick' : undefined;/.test(a), 'setup: the copy at once, then a fresh pull on every pick (OpenStreetMap on); OpenStreetMap off: GolfAPI only, no pull');
    assert.ok(/\|\| M\.bundleCenter\(key, name\)/.test(a), 'a bundled course with no location in our records still pulls from its greens\' middle');
    assert.ok(!/gpsRecheckNext/.test(a), 'every pick pulls - Search online or the saved list alike');
});


// ---- GOLFAPI.IO (build 9) ------------------------------------------------------
// SYNTHETIC GolfAPI-shaped data only (built from the bundled OSM greens): real GolfAPI
// data may not be committed to this public repo.
function fakeGolfApi(key, id, club, course, holes) {
    const G = require('./gps-geo.js'), T = require('./gps-courses.js');
    const rec = G.osmCourse(T, key), h = {};
    Object.keys(rec.holes).forEach((n) => {
        const o = rec.holes[n].osm, gn = G.greenNumbers(o.tee, o.green, o.mid);
        h[n] = { g: { f: gn.front, c: o.mid, b: gn.back }, t: { b: o.tee, f: G.destination(o.tee, G.bearingDeg(o.tee, o.mid), 30) },
                 z: [['fb', 'R', ...G.destination(o.tee, G.bearingDeg(o.tee, o.mid), 230)], ['w', 'L', ...G.destination(o.tee, G.bearingDeg(o.tee, o.mid) - 5, 150)]] };
    });
    const m = rec.holes['1'].osm.mid;
    return { id, club, course, city: '', state: '', lat: m[0], lng: m[1], holes: holes || 18, pars: [], hcp: [], tees: [], fetched: '2026-10-10T12:00:00Z', h };
}

test('GolfAPI puller: the stripped file keeps only what GPS needs, the key never goes anywhere, and nothing reaches the web build or the repo', { skip }, () => {
    const P = require('./tools/golfapi-pull.js');
    // The API's own shapes (handoff 2026-10-10): /courses and /coordinates.
    const course = { courseID: '012141520639939791440', clubName: 'Talking Stick Golf Club', courseName: 'South - Piipaash', numHoles: 18, latitude: 33.54, longitude: -111.86,
        parsMen: Array(18).fill(4), indexesMen: Array.from({ length: 18 }, (_, i) => i + 1), tees: [{ teeName: 'Black', teeColor: '#000', length1: 412, length2: 380 }], address: '9998 E Indian Bend Rd' };
    const coords = { apiRequestsLeft: 20, coordinates: [
        { hole: 1, poi: 1, location: 3, latitude: 33.5423694, longitude: -111.8676706 }, { hole: 1, poi: 1, location: 2, latitude: 33.542474, longitude: -111.8675878 },
        { hole: 1, poi: 1, location: 1, latitude: 33.5425544, longitude: -111.8674728 }, { hole: 1, poi: 3, location: 2, sideFW: 3, latitude: 33.543, longitude: -111.866 },
        { hole: 1, poi: 11, location: 2, latitude: 33.5443283, longitude: -111.8654632 }, { hole: 1, poi: 12, location: 2, latitude: 33.5448876, longitude: -111.8650578 },
        { hole: 1, poi: 5, location: 2, latitude: 33.5, longitude: -111.8 }, { hole: 1, poi: 7, location: 2, latitude: 33.5, longitude: -111.8 } ] };
    const s = P.stripCourse(course, coords);
    assert.deepEqual(s.h['1'].g, { f: [33.542554, -111.867473], c: [33.542474, -111.867588], b: [33.542369, -111.867671] });
    assert.deepEqual(s.h['1'].t, { f: [33.544328, -111.865463], b: [33.544888, -111.865058] });
    assert.deepEqual(s.h['1'].z, [['fb', 'R', 33.543, -111.866]], 'bunkers / water kept; trees and yardage markers not shipped');
    assert.deepEqual(s.tees[0].yards.slice(0, 2), [412, 380]);
    assert.ok(!('address' in s), 'stripped to what GPS needs');
    const src = read('tools/golfapi-pull.js');
    assert.ok(/process\.env\.GOLFAPI_KEY/.test(src) && /'\.env'/.test(src), 'the key from the environment or .env');
    assert.ok(!/console\.(log|error|warn)\([^)]*\bkey\b/.test(src.replace(/linkCourse[\s\S]*$/, '')), 'the key is never printed');
    assert.ok(/ - not re-pulled \(use --refresh/.test(src) && /floor: /.test(src) && /calls\.log/.test(src) && /--dry-run/.test(src), 'no re-pull without --refresh, a floor, a call log, dry run');
    // Out of the repo and out of the web build.
    const gi = read('.gitignore');
    assert.ok(/^golfapi\/$/m.test(gi) && /^\.env$/m.test(gi), 'golfapi/ and .env are gitignored');
    const sync = read('sync-mobile-web.js'), sw = read('sw.js'), shell = read('build-shell.js');
    assert.ok(!/gps-golfapi/.test(sync) && !/gps-golfapi/.test(sw) && !/gps-golfapi/.test(shell), 'never in a shell list, the precache or the web build');
    assert.ok(/copyFileSync\(GOLFAPI, path\.join\(OUT, 'gps-golfapi\.js'\)\)/.test(read('tools/build-gps-app.js')), 'copied into the iOS app only');
});

test('GolfAPI matching: same-club courses kept apart, the club name alone is ambiguous, a 27-hole pairing from its nines, a puller link wins', { skip }, () => {
    const G = require('./gps-geo.js');
    const data = { courses: {}, links: {} };
    [fakeGolfApi('az_talking_piipaash', 'P', 'Talking Stick Golf Club', 'South - Piipaash'), fakeGolfApi('az_talking_oodham', 'O', 'Talking Stick Golf Club', 'North - O Odham'),
     fakeGolfApi('thistle_27_cameron', 'C9', 'Thistle Golf Club', 'Cameron', 9), fakeGolfApi('thistle_27_stewart', 'S9', 'Thistle Golf Club', 'Stewart', 9),
     fakeGolfApi('thistle_27_mackay', 'M9', 'Thistle Golf Club', 'McKay', 9)].forEach((c) => { data.courses[c.id] = c; });
    const ids = (m) => m && m.record.golfapiIds.join('+');
    const near = [33.546, -111.864];
    assert.equal(ids(G.golfapiMatch(data, 'az_talking_piipaash', 'Talking Stick Golf Club (Piipaash)', near, 18)), 'P');
    assert.equal(ids(G.golfapiMatch(data, 'az_talking_oodham', "Talking Stick Golf Club (O'odham)", near, 18)), 'O');
    assert.equal(G.golfapiMatch(data, 'x', 'Talking Stick Golf Club', near, 18), null, 'the club alone: no guess');
    assert.equal(G.golfapiMatch(data, 'az_talking_piipaash', 'Talking Stick Golf Club (Piipaash)', [45.5, -122.6], 18), null, 'not 5 km from the course: no match');
    const th = G.golfapiMatch(data, 'thistle_mackay_cameron', 'Thistle Golf Club (MacKay / Cameron)', null, 18);
    assert.equal(ids(th), 'M9+C9', 'MacKay (ours) = McKay (theirs), front + back');
    assert.equal(Object.keys(th.record.holes).length, 18);
    assert.deepEqual(th.record.holes['10'].osm.mid, data.courses.C9.h['1'].g.c, 'the back nine\'s hole 1 is hole 10');
    // A "Search online" pick (build 10, Prestwick): a gca_ key nobody linked, the
    // provider's own spelling of the name - "Country Club", "CC", "Golf Club" all
    // name GolfAPI's "Prestwick Golf Course / Prestwick".
    data.courses.PW = Object.assign(fakeGolfApi('caledonia', 'PW', 'Prestwick Golf Course', 'Prestwick'), { lat: 33.6431, lng: -78.9615 });
    ['Prestwick Country Club', 'Prestwick CC', 'Prestwick Golf Club', 'Prestwick Country Club - Prestwick'].forEach((n) => {
        assert.equal(ids(G.golfapiMatch(data, 'gca_987654', n, null, 18)), 'PW', n);
        assert.equal(ids(G.golfapiMatch(data, 'gca_987654', n, [33.644, -78.962], 18)), 'PW', n + ' (at the course)');
    });
    assert.equal(G.golfapiMatch(data, 'gca_987654', 'Prestwick Golf Club', [55.506, -4.62], 18), null, 'Prestwick, Scotland is not Prestwick, Myrtle Beach');
    assert.equal(G.golfapiMatch(data, 'gca_987654', 'CC', null, 18), null, 'an abbreviation alone names nothing');
    data.links.my_key = 'O';
    assert.equal(ids(G.golfapiMatch(data, 'my_key', 'Anything', null, 18)), 'O', 'an explicit link from the puller wins');
});

test('GolfAPI greens: an ellipse along front -> back, so Front / Back still follow the golfer\'s angle; Center is the GolfAPI point; hazards ride along', { skip }, () => {
    const G = require('./gps-geo.js');
    const c = fakeGolfApi('az_talking_piipaash', 'P', 'Talking Stick Golf Club', 'South - Piipaash');
    const rec = G.golfapiRecord([c]), h = rec.holes['1'], o = h.osm, g = c.h['1'].g;
    assert.equal(rec.src, 'golfapi');
    assert.deepEqual(o.mid, g.c, 'Center = the GolfAPI center point');
    const r = G.resolveHole(h, []);
    assert.ok(r.useGreenForEdges && r.green, 'front / back from the estimated green, by angle');
    // From the tee: front and back land on the GolfAPI front / back points (within 2 yds).
    const n = G.holeNumbers(o.tee, r);
    assert.ok(G.haversineMeters(n.front, g.f) < 2 && G.haversineMeters(n.back, g.b) < 2, 'on the line, the points: ' + [G.haversineMeters(n.front, g.f), G.haversineMeters(n.back, g.b)]);
    // From 100 yds right of the green: front and back move to that angle.
    const side = G.destination(o.mid, G.bearingDeg(o.tee, o.mid) + 90, 100 * G.M_PER_YD);
    const s = G.holeNumbers(side, r);
    assert.ok(G.haversineMeters(s.front, n.front) > 3, 'front moves with the golfer');
    assert.ok(s.frontM < s.middleM && s.middleM < s.backM);
    assert.equal(o.hazards.length, 2); assert.deepEqual(o.hazards.map((z) => z.type), ['fb', 'w']);
    assert.ok(o.line && o.line.length >= 2 && o.tee, 'a tee -> green line from the back tee');
});

test('GolfAPI in the app: one source per course, no OSM pull for it, the setup badge, hazard carries, and the kill switch', { skip }, async () => {
    const vm = require('vm');
    const store = {};
    let fetches = 0;
    const mk = (cfg) => {
        const sb = { localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
            HARDPAN_GPS_CONFIG: cfg, HardPanGpsCourses: require('./gps-courses.js'), fetch: () => { fetches++; return Promise.reject(new Error('no')); } };
        sb.window = sb;
        vm.createContext(sb);
        vm.runInContext(read('gps-geo.js'), sb);
        vm.runInContext(read('gps-match.js'), sb);
        sb.HardPanGolfApi = { courses: { P: fakeGolfApi('az_talking_piipaash', 'P', 'Talking Stick Golf Club', 'South - Piipaash'),
            PW: Object.assign(fakeGolfApi('caledonia', 'PW', 'Prestwick Golf Course', 'Prestwick'), { lat: 33.6431, lng: -78.9615 }) }, links: {} };
        return sb.HardPanGpsMatch;
    };
    const on = mk({});
    const k = on.known('az_talking_piipaash', 18, 'Talking Stick Golf Club (Piipaash)');
    assert.deepEqual([k.source, k.status, k.n], ['golfapi', 'ready', 18]);
    const r = await on.match({ key: 'az_talking_piipaash', name: 'Talking Stick Golf Club (Piipaash)', loc: [33.546, -111.864], holes: 18, recheck: 'pick' });
    assert.equal(r.source, 'golfapi'); assert.equal(fetches, 0, 'a GolfAPI course is never pulled from OpenStreetMap');
    // "Search online" -> Prestwick (build 10): the import's gca_ key, the provider's name.
    assert.deepEqual((({ source, status, n }) => [source, status, n])(on.known('gca_987654', 18, 'Prestwick CC')), ['golfapi', 'ready', 18], 'GPS \u2713 ready at pick time');
    const pw = await on.match({ key: 'gca_987654', name: 'Prestwick Country Club', loc: [33.644, -78.962], holes: 18, recheck: 'pick' });
    assert.equal(pw.source, 'golfapi'); assert.equal(fetches, 0, 'and never pulled from OpenStreetMap');
    // Kill switch: exactly build 8 - the bundle (OSM) answers.
    const off = mk({ golfapi: false });
    assert.equal(off.known('az_talking_piipaash', 18, 'Talking Stick Golf Club (Piipaash)').source, 'bundle');
    const v = read('gps-view.js'), a = read('admin.html'), c = read('gps-config.js');
    assert.ok(/function osmRecord\(key\) \{\s*\n\s*var ga = golfapiFor\(key\);\s*\n\s*if \(ga\) return ga;/.test(v), 'GolfAPI is the only source when there is one');
    assert.ok(/function golfapiOn\(\) \{ var c = cfg\(\); return c\.golfapi !== false && \(isNative\(\) \|\| !!c\.golfapiFile \|\| !!c\.liveTest\); \}/.test(v), 'in the app only; off with the switch');
    assert.ok(/golfapi: true,/.test(c), 'the switch, on');
    assert.ok(/function drawHazards\(\)/.test(v) && /'B ' : 'W '|\(z\.type === 'w' \? 'W ' : 'B '\)/.test(v), 'bunker / water carries');
    assert.ok(/if \(m\) \{ Object\.keys\(m\.record\.holes\)\.forEach\(\(n\) => out\.add\(Number\(n\)\)\); return out; \}/.test(a), 'the badge counts the GolfAPI holes only');
});

test('GolfAPI puller fixes (Grok, 2026-10-10): apiRequestsLeft arrives as a STRING, so it is read as a number and the floor works; golfapi/held/ is built', { skip }, async () => {
    const P = require('./tools/golfapi-pull.js');
    assert.equal(P.leftOf('22.8'), 22.8, 'the string GolfAPI sends');
    assert.equal(P.leftOf(8.3), 8.3);
    assert.equal(P.leftOf(null), null); assert.equal(P.leftOf(''), null); assert.equal(P.leftOf('n/a'), null);
    const src = read('tools/golfapi-pull.js');
    assert.ok(/apiRequestsLeft: body \? leftOf\(body\.apiRequestsLeft\) : null/.test(src), 'the log records the number');
    assert.ok(/const l = logLines\(\)\.map\(\(x\) => leftOf\(x\.apiRequestsLeft\)\)/.test(src), 'and the floor reads it back as a number (old logs with strings too)');
    assert.ok(/const dirs = \[RAW, HELD\]/.test(src) && /already stored\$\{held \? ' \(golfapi\/held\/\)' : ''\} - not re-pulled/.test(src), 'held courses are built and never re-pulled');
    // The floor actually stops a call: run the tool against a temp log that says 1.5 left.
    const os = require('os'), cp = require('child_process');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'golfapi-floor-'));
    fs.mkdirSync(path.join(tmp, 'tools'), { recursive: true });
    fs.copyFileSync(path.join(__dirname, 'tools/golfapi-pull.js'), path.join(tmp, 'tools/golfapi-pull.js'));
    fs.mkdirSync(path.join(tmp, 'firebase-functions'));
    fs.copyFileSync(path.join(__dirname, 'firebase-functions/golfapi-strip.js'), path.join(tmp, 'firebase-functions/golfapi-strip.js'));
    fs.mkdirSync(path.join(tmp, 'golfapi'));
    fs.writeFileSync(path.join(tmp, 'golfapi/calls.log'), JSON.stringify({ at: 'x', endpoint: '/x', cost: 1, status: 200, apiRequestsLeft: '1.5' }) + '\n');
    const r = cp.spawnSync(process.execPath, [path.join(tmp, 'tools/golfapi-pull.js'), '--pull', 'ABC123', '--floor', '2'], { encoding: 'utf8', env: Object.assign({}, process.env, { GOLFAPI_KEY: 'not-a-real-key' }) });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /floor: 1\.5 calls left/, 'stopped before calling: ' + r.stderr);
    assert.ok(!/not-a-real-key/.test(r.stdout + r.stderr), 'the key is never printed');
    fs.rmSync(tmp, { recursive: true, force: true });
});

test('GolfAPI links reach the trip rounds\' own keys (Thistle "thistle_cameron_stewart" -> the link under "thistle_27_cameron_stewart"); a pairing\'s order is never swapped', { skip }, () => {
    const G = require('./gps-geo.js'), T = require('./gps-courses.js');
    const cs = fakeGolfApi('thistle_27_cameron_stewart', 'CS', 'Thistle Golf Club', 'Cameron + Stewart');
    const data = { courses: { CS: cs }, links: { thistle_27_cameron_stewart: 'CS' } };
    const m = G.golfapiMatch(data, 'thistle_cameron_stewart', 'Thistle Golf Club (Cameron / Stewart)', null, 18, T);
    assert.ok(m && m.record.golfapiIds[0] === 'CS' && /as thistle_27_cameron_stewart/.test(m.how), m && m.how);
    // Without links: the name matches - but only in the same order.
    data.links = {};
    assert.equal(G.golfapiMatch(data, 'x', 'Thistle Golf Club (Cameron / Stewart)', null, 18, T).record.golfapiIds[0], 'CS');
    assert.equal(G.golfapiMatch(data, 'x', 'Thistle Golf Club (Stewart / Cameron)', null, 18, T), null, 'Stewart front, Cameron back is a different round');
});
