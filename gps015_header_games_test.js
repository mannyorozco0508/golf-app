// THE SCORECARD HEADER NAMES THE ROUND'S GAMES, NOT "GPS round" (mailbox 015).
//
// A round started from the GPS door is saved as eventName "GPS round". Manny set up a Weekly
// Game on it and the header read "GPS round • STROKE PLAY (NET)". The placeholder now gives way
// to the games, named the way Home's YOUR ROUND card names them; a name the organizer gave the
// round is kept, and a GPS round with no games keeps "GPS round". Display only. HardPan only
// (the Consumer index.html is pinned byte for byte by gps_flag_test.js).
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-view.js'))) { console.log('Consumer tree (GPS_ENABLED=0): no GPS round - skipped.'); process.exit(0); }
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const IDX = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const src = (() => { const a = IDX.indexOf('function roundHeaderName('); const b = IDX.indexOf('// GPS:END', a); return IDX.slice(a, b); })();
const sb = vm.createContext({});
vm.runInContext(src, sb);
const name = (d) => sb.roundHeaderName(d);
const POOL = { enabled: true, buyIn: 40, kp: { amount: 100, holes: [3, 7] }, net: { amount: 100, places: [50, 30, 20] }, skins: { mode: 'remainder' } };

describe('roundHeaderName', () => {
    test('a GPS round with a Weekly Game is named "Weekly Game"', () => {
        assert.equal(name({ eventName: 'GPS round', moneyPool: POOL }), 'Weekly Game');
    });
    test('its other games follow, as Home lists them', () => {
        assert.equal(name({ eventName: 'GPS round', moneyPool: POOL, sideMatches: { a: { format: 'nassau' } },
            additionalGameInstances: { s1: { format: 'skins' }, s2: { format: 'skins' } } }), 'Weekly Game, Nassau, Skins');
    });
    test('a GPS round with no games keeps "GPS round"; a pool switched off is no game', () => {
        assert.equal(name({ eventName: 'GPS round' }), 'GPS round');
        assert.equal(name({ eventName: 'GPS round', moneyPool: Object.assign({}, POOL, { enabled: false }) }), 'GPS round');
    });
    test('the organizer\'s own name is never replaced', () => {
        assert.equal(name({ eventName: 'Monday Dogfight', moneyPool: POOL }), 'Monday Dogfight');
        assert.equal(name({}), 'Live Round');
    });
});

test('in Chrome: the scorecard header of a GPS round with a Weekly Game reads "Weekly Game • STROKE PLAY (NET)"', { timeout: 90000 }, async () => {
    const CD = makeCourseData(18);
    const r = {
        eventName: 'GPS round', roundDay: 'GPS round', courseName: 'Test Links', gameFormat: 'stroke', courseData: CD, scores: {},
        settlementMode: 'whole-dollar', ownerUid: 'anon-cold', organizerToken: 'c'.repeat(32), moneyPool: POOL,
        players: ['Ann', 'Ben', 'Cal', 'Dee'].map((n, i) => ({ id: 101 + i, name: n, hcp: String(i * 3), playingForMoney: true }))
    };
    const out = await arriveCold({ url: fileUrl('index.html', 'game=HDRWG1'), rounds: { HDRWG1: r }, settleMs: 3200, viewport: { width: 390, height: 844 },
        preScript: 'window.__hardpanDoors = true;',
        expression: "(document.getElementById('format-subtitle') || {}).textContent || ''" });
    assert.equal(out.ok, true, out.reason);
    assert.equal(String(out.value).trim(), 'Weekly Game • STROKE PLAY (NET)');
});
