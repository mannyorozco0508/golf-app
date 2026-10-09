// ============================================================================
// HARDPAN GPS BETA (com.rattlegolf.gpsbeta) - THE TRIP-SAFETY PROMISES, PINNED
// (2026-10-08, Myrtle trip Oct 12-16)
//
// A separate TestFlight app in gps-beta/, its own Capacitor project. What it
// promises, and what this file holds it to:
//   - YARDAGES ONLY: the page loads no Firebase and mounts the GPS screen with
//     no round and no database, so it cannot write a score, a green or a pin;
//     no Enter Score, no Card.
//   - ITS OWN APP: bundle com.rattlegolf.gpsbeta, "HardPan GPS Beta", team
//     A2Z95T64UU, 0.1 (2), When-In-Use location only, a privacy manifest, the
//     native Geolocation plugin and nothing else (no Firebase, no push).
//   - The Consumer app's ios/ is not touched (its own test files pin it).
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const BETA = path.join(ROOT, 'gps-beta');
const ON = fs.existsSync(BETA) && fs.existsSync(path.join(ROOT, 'gps-view.js'));
const skip = ON ? false : 'no gps-beta in this tree';
const read = (f) => fs.readFileSync(path.join(BETA, f), 'utf8');

test('the beta page loads no database client and mounts with no round and no database', { skip }, () => {
    const page = read('index.html');
    const scripts = (page.match(/<script[^>]+src="([^"]+)"/g) || []).map((s) => /src="([^"]+)"/.exec(s)[1]);
    assert.deepStrictEqual(scripts.sort(), ['course-data.js', 'gps-config.js', 'gps-geo.js', 'gps-view.js', 'trip-cards.js'], 'exactly the GPS scripts and the trip cards');
    assert.ok(!/firebase|durableWrite|offline-queue/i.test(page.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\/.*$/gm, '')), 'no database code in the page');
    assert.ok(/round: null, db: null, writeRoundPin: null, openScore: null/.test(page), 'mounted with nothing to write to');
    assert.ok(/#gps-side-toggle, #gps-overlay \.gps-side-bets \{ display: none !important; \}/.test(page), 'no Card, no GPS | Bets toggle');
});

test('the beta build copies the GPS files and nothing that writes', { skip }, () => {
    const b = fs.readFileSync(path.join(ROOT, 'tools', 'build-gps-beta.js'), 'utf8');
    assert.ok(/const FILES = \['gps-geo\.js', 'gps-view\.js', 'gps-config\.js', 'gps-courses\.js', 'maplibre-gl\.js', 'maplibre-gl\.css', 'course-data\.js'\];/.test(b));
    assert.ok(/FORBIDDEN = \/firebase\|durableWrite\|offline-queue\/i/.test(b));
});

test('its own app: bundle id, name, team, 0.1 (1), location When-In-Use only, privacy manifest', { skip }, () => {
    const cap = JSON.parse(read('capacitor.config.json'));
    assert.strictEqual(cap.appId, 'com.rattlegolf.gpsbeta');
    assert.strictEqual(cap.appName, 'HardPan GPS Beta');
    assert.deepStrictEqual(cap.ios.includePlugins, ['@capacitor/geolocation'], 'the native location plugin and nothing else');
    const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
    assert.strictEqual((pbx.match(/PRODUCT_BUNDLE_IDENTIFIER = com\.rattlegolf\.gpsbeta;/g) || []).length, 2);
    assert.strictEqual((pbx.match(/DEVELOPMENT_TEAM = A2Z95T64UU;/g) || []).length, 2);
    assert.strictEqual((pbx.match(/MARKETING_VERSION = 0\.1;/g) || []).length, 2);
    assert.strictEqual((pbx.match(/CURRENT_PROJECT_VERSION = 2;/g) || []).length, 2, 'build 2 (the seven trip rounds)');
    assert.ok(/PrivacyInfo\.xcprivacy in Resources/.test(pbx), 'the privacy manifest ships in the app');
    const plist = read('ios/App/App/Info.plist');
    assert.ok(/<key>NSLocationWhenInUseUsageDescription<\/key>\s*<string>[^<]{40,}<\/string>/.test(plist), 'a clear When-In-Use reason');
    assert.ok(!/NSLocationAlways/.test(plist), 'never Always');
    assert.ok(/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/.test(plist));
    assert.ok(/<string>HardPan GPS Beta<\/string>/.test(plist));
    const pm = read('ios/App/App/PrivacyInfo.xcprivacy');
    assert.ok(/<key>NSPrivacyTracking<\/key>\s*<false\/>/.test(pm) && /<key>NSPrivacyCollectedDataTypes<\/key>\s*<array\/>/.test(pm));
    const pkg = read('ios/App/CapApp-SPM/Package.swift');
    assert.ok(/CapacitorGeolocation/.test(pkg) && !/Firebase|Push/i.test(pkg), 'no Firebase or push in the beta binary');
});

test('the trip: seven rounds with their cards, every course in the GPS bundle, no round codes', { skip }, () => {
    const sbx = { window: {} };
    require('vm').runInNewContext(read('trip-cards.js'), sbx);
    const trip = sbx.window.TRIP_CARDS;
    assert.strictEqual(trip.length, 7);
    const gps = require('./gps-courses.js');
    const geo = require('./gps-geo.js');
    trip.forEach((r) => {
        assert.strictEqual(r.holes.length, 18, r.name);
        r.holes.forEach(([h, par, si]) => assert.ok(h >= 1 && h <= 18 && par >= 3 && par <= 5 && si >= 1 && si <= 18, r.name + ' #' + h));
        const o = geo.osmCourse(gps, r.gpsKey);
        assert.ok(o && o.holes && Object.keys(o.holes).length >= 9, 'GPS data for ' + r.name + ' (' + r.gpsKey + ')');
    });
    assert.strictEqual(JSON.stringify(trip.map((r) => r.gpsKey)), JSON.stringify(['caledonia', 'trueblue', 'pinelakes', 'pinehills', 'thistle_27_cameron_stewart', 'thistle_27_mackay_cameron', 'manofwar']));
    // Read read-only from the live trip; nothing that joins a round or the trip ships.
    const src = read('trip-cards.js');
    ['P7S2BE', 'NT9WTD', '5KKBX5', '58Y3FK', 'BZ5SFR', 'QV6SJM', 'HDZKEL', 'VWNPW6'].forEach((c) => assert.ok(src.indexOf(c) === -1, 'a code ships in the beta: ' + c));
    // Man O' War from OpenStreetMap: The Wizard's holes are not mixed in.
    assert.strictEqual(Object.keys(gps.manofwar.holes).length, 18);
});
