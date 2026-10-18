// ============================================================================
// HARDPAN GPS - AUTO-ADVANCE HOLES (008, switch autoAdvance)
//
// gps-geo.js decides the two facts the jump rests on: WHICH hole is next (the
// round's play order - the hole picker's list) and WHETHER the golfer is on its tee
// (within 25 m, off the current green, a usable fix). gps-view.js waits ~10 s, moves
// the hole and shows "Hole 5 >" with Undo. tools/gps-autoadvance-check.js walks a
// golfer through it in headless Chrome.
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
// A point `m` metres north / east of `p`.
const north = (p, m) => [p[0] + (m / geo.EARTH_RADIUS_M) * 180 / Math.PI, p[1]];
const east = (p, m) => [p[0], p[1] + (m / (geo.EARTH_RADIUS_M * Math.cos(p[0] * Math.PI / 180))) * 180 / Math.PI];

test('next hole follows play order: 4 -> 5; start on 10: 18 -> 1; a shotgun start on 5: 18 -> 1; after the last hole played, nothing', () => {
    const one = Array.from({ length: 18 }, (_, i) => i + 1);
    const ten = one.slice(9).concat(one.slice(0, 9));
    const five = one.slice(4).concat(one.slice(0, 4));
    assert.equal(geo.nextInPlayOrder(one, 4), 5);
    assert.equal(geo.nextInPlayOrder(one, 18), null, 'start on 1: 18 is the last hole - no jump to 1');
    assert.equal(geo.nextInPlayOrder(ten, 18), 1);
    assert.equal(geo.nextInPlayOrder(ten, 9), null, 'start on 10: 9 is the last hole');
    assert.equal(geo.nextInPlayOrder(ten, 10), 11);
    assert.equal(geo.nextInPlayOrder(five, 18), 1);
    assert.equal(geo.nextInPlayOrder(five, 4), null);
    assert.equal(geo.nextInPlayOrder(one.slice(0, 9), 9), null, 'nine holes: none after 9');
    assert.equal(geo.nextInPlayOrder(one, 22), null, 'a hole not in the round');
    assert.equal(geo.nextInPlayOrder([], 4), null);
    assert.equal(geo.nextInPlayOrder(['4', '5'], '4'), 5, 'numbers or strings');
});

test('on the next tee: within 25 m, off the current green (20 m from its center, not inside it), a fix of +-30 m or better', () => {
    const tee = [33.6, -79.0];
    const green = east(tee, -60);   // the current green, 60 m west of the next tee
    const base = { tee, green, acc: 5, onGreen: false };
    assert.equal(geo.onNextTee(Object.assign({}, base, { me: tee })), true, 'on the tee point');
    assert.equal(geo.onNextTee(Object.assign({}, base, { me: north(tee, 24) })), true, '24 m away');
    assert.equal(geo.onNextTee(Object.assign({}, base, { me: north(tee, 27) })), false, '27 m away');
    assert.equal(geo.onNextTee(Object.assign({}, base, { me: tee, acc: 45 })), false, 'a weak fix');
    assert.equal(geo.onNextTee(Object.assign({}, base, { me: tee, onGreen: true })), false, 'inside the current green');
    // A tee 15 m from the current green's center: standing on that green is never "on the tee".
    const nearGreen = east(tee, -15);
    assert.equal(geo.onNextTee({ me: east(tee, -12), tee, green: nearGreen, acc: 5 }), false, 'on the green, 3 m from its center');
    assert.equal(geo.onNextTee({ me: tee, tee, green: nearGreen, acc: 5 }), false, 'the tee itself is 15 m from that center: still the green');
    assert.equal(geo.onNextTee({ me: east(tee, 10), tee, green: nearGreen, acc: 5 }), true, 'past the tee, 25 m from the green');
    assert.equal(geo.onNextTee({ me: tee, tee: null, green, acc: 5 }), false, 'no tee mapped: never');
    assert.equal(geo.onNextTee({ me: null, tee, green, acc: 5 }), false, 'no fix: never');
    assert.equal(geo.onNextTee({ me: tee, tee, green: null, acc: 5 }), true, 'no green on the current hole: the tee alone');
    assert.equal(geo.onNextTee({ me: { lat: tee[0], lng: tee[1] }, tee: { lat: tee[0], lng: tee[1] }, acc: 5 }), true, '{lat,lng} points too');
});

test('gps-view: behind its switch (removed, not hidden), a Tools toggle remembered on the phone, ~10 s on the tee, Undo, never over a sheet', () => {
    const v = read('gps-view.js');
    assert.ok(/HardPanFeature\('autoAdvance'\)/.test(v), 'reads its 008 switch');
    assert.ok(/data-feature="autoAdvance"[^\n]*gps-aa-toast|gps-aa-toast[^\n]*data-feature="autoAdvance"/.test(v), 'the toast is the switch\'s');
    assert.ok(/gps-aa-toggle" data-feature="autoAdvance"/.test(v), 'the Tools toggle is the switch\'s');
    assert.ok(/if \(!aaSwitch\(\)\) Array\.prototype\.forEach\.call\(el\.querySelectorAll\('\[data-feature="autoAdvance"\]'\), function \(n\) \{ n\.parentNode\.removeChild\(n\); \}\)/.test(v), 'switch off: the elements are removed');
    assert.ok(/AA_KEY = 'hardpan_gps_autoadvance', AA_DWELL_MS = 10000/.test(v), 'the phone key and the ~10 s wait');
    assert.ok(/localStorage\.setItem\(AA_KEY, '0'\)/.test(v), 'off is remembered; on is the default (no key)');
    assert.ok(/G\.nextInPlayOrder\(S\.holeList\(\) \|\| \[\], S\.hole\)/.test(v), 'next = the picker\'s play-order list');
    assert.ok(/S\.gotoHole\(nx\)/.test(v) && /S\.aaSkip = to;/.test(v), 'moves through the card\'s goToHole; Undo suppresses that tee visit');
    assert.ok(/aaBusy\(\)/.test(v) && /S\.side !== 'gps'/.test(v) && /querySelectorAll\('\[role="dialog"\],\[role="menu"\]'\)/.test(v), 'never with the card (score entry) or a sheet up');
    assert.ok(/'Hole ' \+ to \+ ' \\u203A'/.test(v), 'the toast reads "Hole 5 >"');
    // The position is compared, never stored: the only write is the On / Off choice.
    v.split('\n').filter((l) => /setItem\(AA_KEY/.test(l)).forEach((l) => assert.ok(!/\bfix\b|coords/.test(l), l));
});
