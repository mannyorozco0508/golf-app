// ============================================================================
// HARDPAN - TWO FRONT DOORS (gps-doors, 2026-10-12; Manny's approved mockups)
//
// Source checks that keep the doors a FRONT-DOOR change: HardPan only, app only
// (Capacitor or window.__hardpanDoors), routing to screens that already exist,
// nothing written to Firebase. tools/front-door-check.js drives every screen in
// Chrome (Main, GPS-1..4, Games-1, Games-3, trip #build, the web unchanged).
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'front-door.js'));
const skip = ON ? false : 'Consumer tree: no front doors';

test('the doors show only in the app (or the check flag); the web pages are unchanged', { skip }, () => {
    const s = read('front-door.js');
    assert.match(s, /function on\(\) \{ return W\.__hardpanDoors === true \|\| gpsApp\(\); \}/);
    assert.match(s, /W\.Capacitor\.Plugins && W\.Capacitor\.Plugins\.Geolocation/, 'the HardPan GPS app, not any native app');
    assert.match(s, /if \(on\(\) && !p\.get\('game'\)/, 'Home -> home.html only in the app');
    assert.match(s, /if \(!code \|\| !on\(\)\) return;/, 'the scorecard GPS button only in the app');
    assert.match(read('gps-view.js'), /if \(doorsOn\(\)\) \{/, 'GPS-2 controls only in the app');
});

test('a front-door change: routes to existing screens, writes nothing itself', { skip }, () => {
    const s = read('front-door.js').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/ref\([^)]*\)\.(set|update|push|remove|transaction)\(/.test(s), 'no Firebase write');
    assert.ok((s.match(/\.ref\(/g) || []).every(() => true) && !/\.ref\([^)]*\)\.(?!once\()/.test(s), 'Firebase is only read (once)');
    assert.match(s, /W\.selectHomeWidget\('quick'\)/, 'Start a round = the lobby’s own new-round path');
    assert.match(s, /W\.saveSettings\(\)/, 'a GPS round is saved by Round Setup’s own Save');
    assert.match(s, /W\.gpsApplyTemplate\(tpl\)/, 'quick starts = Round Setup’s own templates');
    assert.match(s, /W\.spRoundOpen\(\)/, 'Paste the whole round = the existing paste');
    assert.match(read('admin.html'), /if \(window\.HardPanDoors && window\.HardPanDoors\.afterSave\(modeKey\)\) return;/);
});

test('the mockups: Main, GPS-1, Games-1 on home.html; the colors; the remembered pick', { skip }, () => {
    const h = read('home.html');
    ['What are we doing today?', 'Pick a course &rarr;', 'Start or join a game &rarr;', "We'll remember your pick. Switch anytime from the top bar.", 'Have a game code?', 'Sign in',
        'Where are you playing?', 'Course name or city', 'NEAR YOU', 'RECENT', 'No sign-in needed for courses that are GPS ready.',
        '+ Start a round', 'TRIPS &amp; CUPS', 'Build a trip from one paste', 'No location needed here. Tap GPS inside any round for yardages.'].forEach((t) => assert.ok(h.includes(t), t));
    assert.match(h, /--hp-green: #0f4c3a;/); assert.match(h, /--hp-navy: #1d3557;/);
    assert.match(read('front-door.js'), /var KEY = 'hardpan_front_door'/);
});

test('HardPan only: home.html and front-door.js are GPS files; every page loads them inside a GPS block', { skip }, () => {
    const flag = require('./tools/gps-flag.js');
    ['admin.html', 'index.html', 'trip.html'].forEach((f) => {
        const s = read(f);
        assert.ok(s.includes('<script src="front-door.js"></script>'), f);
        assert.ok(!/front-door|HardPanDoors/.test(flag.applyFlag(s, false)), f + ': all inside GPS blocks');
    });
    const sync = read('sync-mobile-web.js');
    const gps = /const GPS_SHELL = \[([\s\S]*?)\];/.exec(sync)[1];
    assert.ok(/'front-door\.js'/.test(gps) && /'home\.html'/.test(gps));
    assert.ok(!/\$\d/.test(read('gps-view.js')), 'no price in gps-view.js (the quick-start amounts are front-door.js’s)');
});
