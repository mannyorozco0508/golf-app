// FLIGHTS START ALL-A (URGENT-009 / 013-3), IN REAL CHROME.
//
// Switching Flights (A/B) on over a roster with NO letters put every golfer in A. Now the
// Players step asks ONCE - "Split by handicap? A = up to [cutoff], B = above" - with the median
// handicap as the editable default (a plus handicap counts below scratch), applies it in one tap,
// and never moves a golfer whose A/B was tapped by hand. A roster that brings its own letters is
// never asked about: a paste, a typed "Glenn 12/B" row, a copied ("Same as last week") round.
// Every step a real tap or keystroke; stub db only.
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const R = require('./roster-paste.js');
// ?step=players opens an existing round's Players step through the HardPan front door
// (front-door.js, GPS only). A Consumer build (tools/gps-flag-tree.js) opens an existing round
// on the Review, and its organizer reaches Players by the Review's own "Edit" - a real tap too.
const TO_PLAYERS = require('fs').existsSync(require('path').join(__dirname, 'gps-view.js')) ? []
    : [{ tap: '.wizard-edit-link[onclick="goToWizardStep(5)"]' }, { sleep: 600 }];

const CD = makeCourseData(18);
const HCPS = ['+2', '3', '5', '8', '12', '15', '18', '22'];
const NAMES = ['Ann', 'Ben', 'Cal', 'Dee', 'Eve', 'Fay', 'Gus', 'Hal'];
const players = (flights) => NAMES.map((n, i) => Object.assign({ id: 101 + i, name: n, hcp: HCPS[i], team: 'Team 1', squad: i % 2 ? 'blue' : 'red', playingForMoney: true }, flights ? { flight: flights[i] } : {}));
const round = (extra) => Object.assign({ eventName: 'Mon', roundDay: 'Mon', courseName: 'Test Links', activeCourseKey: 'comm_links', gameFormat: 'stroke', courseData: CD,
    ownerUid: 'anon-cold', organizerToken: 'a'.repeat(32), scores: {}, settlementMode: 'whole-dollar', startingHole: 1, groupSizeOverrides: { 0: 4, 1: 4 }, players: players() }, extra || {});
const DB = (events) => ({ events, global_courses: { comm_links: { name: 'Test Links', data: CD } }, trips: {}, tournaments: {}, organizers: {} });
const READ = `JSON.stringify({
    ask: (function () { var b = document.getElementById('flights-split-ask'); return b ? getComputedStyle(b).display !== 'none' : null; })(),
    cutoff: (document.getElementById('flights-split-cutoff') || {}).value,
    preview: (document.getElementById('flights-split-preview') || {}).textContent,
    on: typeof flightsEnabledNow === 'function' ? flightsEnabledNow() : null,
    count: (document.getElementById('flights-count') || {}).textContent,
    rows: Array.prototype.map.call(document.querySelectorAll('#player-list .player-row'), function (r) { var f = r.querySelector('.p-flight-input'); return [(r.querySelector('.p-name-input') || {}).value, (r.querySelector('.p-hcp-input') || {}).value, f ? f.getAttribute('data-flight') : null]; }) })`;
async function run(url, db, steps) {
    const r = await arriveCold({ url, db, settleMs: 3000, viewport: { width: 393, height: 852 }, preScript: 'window.__hardpanDoors = true;', steps: [{ sleep: 1500 }].concat(TO_PLAYERS, steps) });
    assert.equal(r.ok, true, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
}

describe('the numbers (roster-paste.js)', () => {
    test('median default; a plus handicap is below scratch; ties never leave a flight empty; nothing to split -> null', () => {
        assert.deepEqual(R.flightSplitSuggestion(HCPS.map((h) => ({ hcp: h }))), { cutoff: 10, a: 4, b: 4, counted: 8 });
        assert.equal(R.flightHcpNumber('+2'), -2);
        assert.equal(R.flightSplitSuggestion([{ hcp: '+4' }, { hcp: '+1' }, { hcp: '6' }]).cutoff, -1);
        assert.equal(R.formatFlightCutoff(-1), '+1');
        assert.deepEqual(R.flightSplitSuggestion([{ hcp: '5' }, { hcp: '9' }, { hcp: '9' }, { hcp: '9' }]), { cutoff: 5, a: 1, b: 3, counted: 4 });
        assert.equal(R.flightSplitSuggestion([{ hcp: '9' }, { hcp: '9' }]), null);
        assert.equal(R.flightSplitSuggestion([{ hcp: '9' }, { hcp: '' }, { hcp: 'x' }]), null);
        assert.deepEqual(R.flightSplitAssign([{ hcp: '3' }, { hcp: '12' }, { hcp: '' }, { hcp: '20', flight: 'A' }], 10, (p) => p.flight === 'A'), ['A', 'B', 'A', 'A']);
    });
});

describe('Players step, Flights switched on over a roster with no letters', () => {
    test('asked once with the median; a hand-set golfer is kept; one tap splits; never asked again', { timeout: 120000 }, async () => {
        const out = await run(fileUrl('admin.html', 'game=FSPL01&step=players'), DB({ FSPL01: round() }), [
            { expression: READ },
            { tap: '#flights-label-on' }, { sleep: 400 }, { expression: READ },
            // Ann (+2) tapped to B by hand - the split must keep her there.
            { tap: '#player-list .player-row .p-flight-input' }, { sleep: 200 }, { expression: READ },
            { tap: '#flights-split-yes' }, { sleep: 400 }, { expression: READ },
            { tap: '#flights-label-off' }, { sleep: 300 }, { tap: '#flights-label-on' }, { sleep: 400 }, { expression: READ }]);
        const [before, asked, hand, split, again] = out;
        assert.equal(before.ask, false, 'not asked while flights are off');
        assert.equal(asked.on, true);
        assert.equal(asked.ask, true, 'asked when switched on');
        assert.equal(asked.cutoff, '10', 'default cutoff = median handicap');
        assert.match(asked.preview, /A 4 · B 4/);
        assert.ok(asked.rows.every((r) => r[2] === 'A'), 'nothing moved before the tap');
        assert.equal(hand.rows[0][2], 'B');
        assert.equal(split.ask, false, 'the question goes away');
        assert.deepEqual(split.rows.map((r) => r[2]), ['B', 'A', 'A', 'A', 'B', 'B', 'B', 'B'], 'A up to 10, B above; Ann kept on her hand-set B');
        assert.match(split.count, /A: 3 · B: 5/);
        assert.equal(again.ask, false, 'asked ONCE');
    });
    test('an edited cutoff is the one applied; "+1" reads as a plus handicap', { timeout: 120000 }, async () => {
        const out = await run(fileUrl('admin.html', 'game=FSPL02&step=players'), DB({ FSPL02: round() }), [
            { tap: '#flights-label-on' }, { sleep: 400 },
            { tap: '#flights-split-cutoff' }, { cdp: { method: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 4, commands: ['selectAll'] } } },
            { cdp: { method: 'Input.insertText', params: { text: '+1' } } }, { sleep: 200 }, { expression: READ },
            { tap: '#flights-split-yes' }, { sleep: 400 }, { expression: READ }]);
        const [typed, split] = out;
        assert.equal(typed.cutoff, '+1');
        assert.match(typed.preview, /A 1 · B 7/, 'only the +2 is at or under +1');
        assert.deepEqual(split.rows.map((r) => r[2]), ['A', 'B', 'B', 'B', 'B', 'B', 'B', 'B']);
    });
});

describe('a roster that brings its letters is never asked about', () => {
    test('a paste with letters: flights on, letters set, no question', { timeout: 120000 }, async () => {
        const text = 'Skeens 2.0/A\nManny +2.0/A\nGlenn 12.0/B\nMarty 9.0/B';
        const [post] = await run(fileUrl('admin.html', 'game=FSPL03&step=players'), DB({ FSPL03: round({ players: [{ id: 101, name: 'Me', hcp: '0', team: 'Team 1', squad: 'red', playingForMoney: true }] }) }), [
            { tap: 'button[onclick="openPastePlayersModal()"]' }, { sleep: 400 },
            { tap: '#paste-players-textarea' }, { cdp: { method: 'Input.insertText', params: { text } } }, { sleep: 500 },
            { tap: '#paste-players-commit-btn' }, { sleep: 700 }, { expression: READ }]);
        assert.equal(post.on, true);
        assert.equal(post.ask, false);
        assert.deepEqual(post.rows.filter((r) => r[0] !== 'Me').map((r) => [r[0], r[2]]), [['Skeens', 'A'], ['Manny', 'A'], ['Glenn', 'B'], ['Marty', 'B']]);
    });
    test('a TYPED row "Glenn 12/B": leaving the box splits it - name, handicap, flight B - and turns flights on', { timeout: 120000 }, async () => {
        const [post] = await run(fileUrl('admin.html', 'game=FSPL04&step=players'), DB({ FSPL04: round() }), [
            { tap: 'button[onclick="addNewPlayerAndRefresh()"]' }, { sleep: 300 },
            { tap: '#player-list .player-row .p-name-input', nth: 8 }, { cdp: { method: 'Input.insertText', params: { text: 'Glenn 12/B' } } },
            { tap: '#player-count' }, { sleep: 500 }, { expression: READ }]);
        assert.equal(post.rows.length, 9, JSON.stringify(post.rows));
        assert.equal(post.on, true, 'flights on from the typed letter');
        assert.deepEqual(post.rows[8], ['Glenn', '12', 'B']);
        assert.equal(post.ask, false, 'the roster brought a letter: not asked');
    });
    test('"Same as last week" (a copy of a round with flights): the letters come across and nothing is asked', { timeout: 120000 }, async () => {
        const fl = ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B'];
        const src = round({ players: players(fl), flights: { enabled: true, scopes: { skins: 'flight', birdies: 'flight' }, skinsSplit: 'even' }, scores: { p101_h1: 4 } });
        const [post] = await run(fileUrl('admin.html', 'game=FSPN05&eventType=quick&copyFrom=FSPL05&step=players'), DB({ FSPL05: src }), [{ sleep: 800 }, { expression: READ }]);
        assert.equal(post.on, true);
        assert.deepEqual(post.rows.map((r) => r[2]), fl);
        assert.equal(post.ask, false);
    });
});
