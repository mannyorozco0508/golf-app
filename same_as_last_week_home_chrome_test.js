// "SAME AS LAST WEEK" ON HOME > GAMES (URGENT-009 / 013-2), IN REAL CHROME.
//
// Round Setup has had "Same as last week" since 2026-10-05 - it copies the organizer's last round
// (course, tees, games and money, roster with handicaps, groups and flights) into a NEW code and
// lands on Players; scores never come across - but it sat in the admin lobby, and in the app Home is
// home.html, so nobody ever saw it. Now the Games start offers it to a returning organizer (this
// phone saved a round that still has golfers) and the tap runs Round Setup's own copier. A phone with
// no last round is not offered it. Every step a real tap; stub db only; nothing is written.
'use strict';
if (!require('fs').existsSync(require('path').join(__dirname, 'front-door.js'))) { console.log('Consumer tree: no HardPan Home - skipped.'); process.exit(0); }
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');

const CD = makeCourseData(18);
const NAMES = ['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta', 'Eli Echo', 'Fay Foxtrot', 'Gus Golf', 'Hal Hotel'];
const SRC = wizardSavedRound({ code: 'SALW01', golfers: 8, names: NAMES, ownerUid: 'anon-cold', thru: 9, courseData: CD,
    overrides: { activeCourseKey: 'comm_links', courseName: 'Test Links', groupSizeOverrides: { 0: 4, 1: 4 } } });
const DB = (ev) => ({ events: ev || {}, global_courses: { comm_links: { name: 'Test Links', data: CD } }, trips: {}, tournaments: {}, organizers: {} });
const PRE = (last) => 'window.__hardpanDoors = true; window.__freshPhone = true;'
    + "try{localStorage.setItem('hardpan_front_door','games');" + (last ? "localStorage.setItem('lastRoomCode','" + last + "');" : '') + '}catch(e){}' + iapStub({ active: true });
const HOME = "JSON.stringify({ salw: (function () { var b = document.querySelector('#hp-salw [data-hp-act=\"same\"]'); var box = document.getElementById('hp-salw'); return b ? { shown: getComputedStyle(box).display !== 'none' && b.getBoundingClientRect().height > 0, text: box.textContent } : null; })() })";
const SETUP = `JSON.stringify({ url: document.URL, step: typeof currentWizardStep !== 'undefined' ? currentWizardStep : null,
    course: (document.getElementById('course-search-input') || {}).value,
    flights: typeof flightsEnabledNow === 'function' ? flightsEnabledNow() : null,
    pool: !!(document.getElementById('mp-enabled') || {}).checked,
    groups: typeof groupSizeOverrides !== 'undefined' ? groupSizeOverrides : null,
    existing: typeof loadedExistingRound !== 'undefined' ? loadedExistingRound : null,
    rows: Array.prototype.map.call(document.querySelectorAll('#player-list .player-row'), function (r) { var f = r.querySelector('.p-flight-input'); return [(r.querySelector('.p-name-input') || {}).value, (r.querySelector('.p-hcp-input') || {}).value, f ? f.getAttribute('data-flight') : null]; }),
    writes: (window.__coldWrites || []).map(function (w) { return w.path; }) })`;
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));

describe('Home > Games: Same as last week', () => {
    test('a returning organizer: offered on the Games start; one tap = a NEW round with last week\'s course, games, money, roster, groups and flights; no scores; the old round untouched', { timeout: 120000 }, async () => {
        const r = await arriveCold({ url: fileUrl('home.html', '') + '#games', db: DB({ SALW01: SRC }), settleMs: 2500, viewport: { width: 390, height: 844 }, preScript: PRE('SALW01'), steps: [
            { waitFor: "!!document.querySelector('#hp-salw [data-hp-act=\"same\"]')", timeout: 15000 }, { expression: HOME },
            { tap: '#hp-salw [data-hp-act="same"]' },
            { waitFor: "/copyFrom=SALW01/.test(location.search) && document.querySelectorAll('#player-list .player-row').length >= 8", timeout: 25000 }, { sleep: 1200 },
            { expression: SETUP }] });
        assert.equal(r.ok, true, r.reason);
        const [home, setup] = J(r);
        assert.ok(home.salw && home.salw.shown, 'offered: ' + JSON.stringify(home));
        assert.match(home.salw.text, /Same as last week/);
        assert.match(home.salw.text, /Test Links · 8 golfers/);
        const p = Object.fromEntries(new URLSearchParams(setup.url.split('?')[1]));
        assert.match(p.game, /^[A-Z0-9]{6}$/, 'a NEW code: ' + setup.url);
        assert.notEqual(p.game, 'SALW01');
        assert.equal(p.copyFrom, 'SALW01');
        assert.equal(p.step, 'players');
        assert.equal(setup.step, 5, 'lands on Players');
        assert.equal(setup.existing, false, 'a NEW round, not an edit of the old one');
        assert.match(setup.course, /Test Links/);
        assert.deepEqual(setup.rows.map((x) => x[0]), NAMES);
        assert.deepEqual(setup.rows.map((x) => x[1]), SRC.players.map((x) => x.hcp), 'handicaps come across (editable boxes)');
        assert.deepEqual(setup.rows.map((x) => x[2]), SRC.players.map((x) => x.flight), 'flights come across');
        assert.equal(setup.flights, true);
        assert.equal(setup.pool, true, 'the Weekly Game money comes across');
        assert.deepEqual(setup.groups, { 0: 4, 1: 4 });
        assert.deepEqual(setup.writes.filter((w) => /^events\//.test(w)), [], 'nothing written - not the old round, and the new one only on Save');
    });
    test('a first-time phone (no last round): not offered', { timeout: 60000 }, async () => {
        const r = await arriveCold({ url: fileUrl('home.html', '') + '#games', db: DB({}), settleMs: 2500, viewport: { width: 390, height: 844 }, preScript: PRE(null), steps: [{ sleep: 800 }, { expression: HOME }] });
        assert.equal(r.ok, true, r.reason);
        assert.equal(J(r)[0].salw, null);
    });
    test('a last round that no longer exists: not offered', { timeout: 60000 }, async () => {
        const r = await arriveCold({ url: fileUrl('home.html', '') + '#games', db: DB({}), settleMs: 2500, viewport: { width: 390, height: 844 }, preScript: PRE('GONE01'), steps: [{ sleep: 1500 }, { expression: HOME }] });
        assert.equal(r.ok, true, r.reason);
        assert.equal(J(r)[0].salw, null);
    });
});
