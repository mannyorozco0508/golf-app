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

test('routes to existing screens; the ONE write is a new GPS round, through the organizer gate (Manny: a course tap creates the round)', { skip }, () => {
    const s = read('front-door.js').replace(/^\s*\/\/.*$/gm, '');
    const writes = s.match(/ref\([^)]*\)\.(set|update|push|remove|transaction)\(/g) || [];
    assert.deepEqual(writes, ["ref('events/' + code).set("], 'one write: the new round');
    assert.match(s, /G\.ensureOrganizer\(H\.db\)/); assert.match(s, /G\.stamp\(roundPayload\(key, name, card\), uid\)/);
    assert.match(s, /W\.issueUniqueCode\(\{ db: H\.db, root: 'events' \}\)/);
    assert.match(s, /W\.selectHomeWidget\('quick'\)/, 'Start a round = the lobby\u2019s own new-round path');
    assert.match(s, /W\.gpsApplyTemplate\(tpl\)/, 'quick starts = Round Setup\u2019s own templates');
    assert.match(s, /W\.spRoundOpen\(\)/, 'Paste the whole round = the existing paste');
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

test('gps-doors-fix: a launch goes straight to the doors; Main every launch; light only; GPS READY = what GPS draws; a course tap never opens Round Setup', { skip }, () => {
    const s = read('front-door.js'), h = read('home.html');
    assert.match(s, /\(function launch\(\) \{/); assert.match(s, /W\.document\.documentElement\.style\.visibility = 'hidden';\n\s*W\.location\.replace\('home\.html'\);/);
    assert.match(s, /show\(h === 'gps' \|\| h === 'games' \? h : 'main'\);/, 'every launch opens Main');
    assert.ok(!/prefers-color-scheme/.test(h) && /<meta name="color-scheme" content="light only">/.test(h), 'home.html never follows dark mode');
    assert.match(s, /if \(live\(\)\) return !!golfapiLink\(key\)/, 'in the app, GPS READY = GolfAPI has it');
    const pick = s.slice(s.indexOf('function startRound('), s.indexOf('function pickCourse('));
    assert.ok(!/admin\.html\?start=quick/.test(pick.replace(/function playWithoutGps[\s\S]*$/, '')), 'a course tap writes the round itself (Round Setup only for Play without GPS with no card)');
    assert.match(s, /if \(busy\) return;/, 'a double tap makes one round');
});

test('gps-doors-black: never stuck - the launch hop has a watchdog, GPS-1 waits are limited, the app background is light', { skip }, () => {
    const s = read('front-door.js');
    const launch = s.slice(s.indexOf('(function launch() {'), s.indexOf('})();', s.indexOf('(function launch() {')));
    assert.match(launch, /visibility = 'hidden';\s*W\.location\.replace\('home\.html'\);[\s\S]*setTimeout\([\s\S]*stuck\(/, 'the hidden launch page comes back with Tap to retry if the hop to Home never happens');
    assert.match(s, /var LAUNCH_MS = 5000;/); assert.match(s, /var LOC_MS = 15000;/); assert.match(s, /var LOAD_MS = 8000;/);
    assert.match(s, /needs\.forEach\(function \(src\) \{ loadScriptTimed\(/, 'GPS-1 data files load with a time limit');
    assert.match(s, /function stuck\(msg\)[\s\S]*Tap to retry[\s\S]*location\.replace\('home\.html'\)/, 'the retry card reloads Home');
    assert.match(s, /catch \(e\) \{\s*try \{ console\.error\('\[front door\] ' \+ view, e\); \} catch \(x\) \{\}\s*stuck\(/, 'a failure opening a door shows the retry card');
    const cfg = JSON.parse(read('gps-beta/capacitor.config.json'));
    assert.equal(cfg.backgroundColor, '#f0f4f2', 'the WebView background is the light theme, never black in dark mode');
    assert.equal(cfg.ios.backgroundColor, '#f0f4f2');
});
