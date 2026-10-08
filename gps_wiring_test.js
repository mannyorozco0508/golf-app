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

const GPS_FILES = ['gps-geo.js', 'gps-view.js', 'gps-config.js', 'gps-courses.js', 'maplibre-gl.js', 'maplibre-gl.css'];

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
    assert.ok(/CACHE_VERSION = 'golfapp-v320-gps-arcs'/.test(sw));
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
