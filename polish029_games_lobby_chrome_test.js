// POLISH #29 (OPTION B, Manny 2026-10-20): THE GAMES & BETS DOOR, AS HOME-STYLE DOOR CARDS, IN REAL CHROME.
//
// Home's Games & Bets door opens admin.html?start=lobby. In the HardPan app (the doors flag) that page
// is "‹ Home", "Games & Bets", Game Day (green) and Road Trip (navy) cards, "Same as last week" and
// "Have a game code?" tiles and one "▶ Resume <course> · thru N" line - instead of the old lobby
// (HARDPAN banner, moon, "Open something else", no way back). A LOOK CHANGE: every card runs the old
// lobby's own function, so each check below ends where the old control ended.
//   1  first visit: no Same tile, no Resume; the old lobby hidden; nothing sideways at 393 and 375
//   2  a round in progress: Same tile names it (course, golfers, Nassau $5); Resume · thru 5 -> its card
//   3  Same as last week -> Round Setup's copier (a NEW code, copyFrom, Players)
//   4  Have a game code? -> the lobby's own Open-a-round card, its refusal line included
//   5  Road Trip -> trip.html; ‹ Home -> home.html
//   6  a finished round: no Resume
//   7  without the doors flag (the web / the Consumer app's own lobby): the old lobby, unchanged
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'front-door.js'))) { console.log('Consumer tree: no HardPan doors - skipped.'); process.exit(0); }
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');

const CD = makeCourseData(18);
const NASSAU = { m1: { format: 'nassau', frontStake: 5, backStake: 5, overallStake: 10, players: [] } };
const ROUND = (code, thru) => wizardSavedRound({ code, golfers: 2, names: ['Test A', 'Test B'], ownerUid: 'anon-cold', thru, courseData: CD,
    overrides: { activeCourseKey: 'comm_links', courseName: 'Dobson Ranch Golf Course', sideMatches: NASSAU, moneyPool: { enabled: false } } });
const DB = (ev) => ({ events: ev || {}, global_courses: { comm_links: { name: 'Dobson Ranch Golf Course', data: CD } }, trips: {}, tournaments: {}, organizers: {} });
const PRE = (last, doors) => (doors === false ? '' : 'window.__hardpanDoors = true;') + ' window.__freshPhone = true;'
    + (last ? "try{localStorage.setItem('lastRoomCode','" + last + "');}catch(e){}" : '') + iapStub({ active: true });
const URL = fileUrl('admin.html', 'start=lobby');
const READ = "JSON.stringify({ view: (function(){ var v = document.getElementById('gl-view'); return v && getComputedStyle(v).display !== 'none' ? v.innerText : null; })(),"
    + " old: getComputedStyle(document.getElementById('lobby-screen')).display, oldLead: (function(){ var l = document.querySelector('.lobby-lead'); return !!l && l.getBoundingClientRect().height > 0; })(),"
    + " same: (function(){ var b = document.getElementById('gl-same'); return b && getComputedStyle(b).display !== 'none' ? b.innerText : null; })(),"
    + " resume: (function(){ var b = document.getElementById('gl-resume'); return b && getComputedStyle(b).display !== 'none' ? b.innerText : null; })(),"
    + " sw: document.documentElement.scrollWidth, w: innerWidth,"
    + " bottom: Math.round(document.getElementById('gl-view').getBoundingClientRect().bottom), h: innerHeight })";
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const SETTLE = { sleep: 1800 };

describe('Polish #29 (option B): Games & Bets as door cards', () => {
    test('first visit: back, title, Game Day / Road Trip cards, the code tile alone; no Same, no Resume; old lobby hidden; fits 393 and 375', { timeout: 120000 }, async () => {
        for (const vp of [{ width: 393, height: 852 }, { width: 375, height: 667 }]) {
            const r = await arriveCold({ url: URL, db: DB(), settleMs: 2000, viewport: vp, preScript: PRE(null), steps: [SETTLE, { expression: READ }] });
            assert.equal(r.ok, true, r.reason);
            const [s] = J(r);
            assert.equal(s.view, '‹\nHome\nGames\n🏌️\nGame Day\nOne round today · group, games and money\n🚐\nRoad Trip\nSeveral rounds · teams, money across days\n#️⃣ Have a game code?\nJoin with a code, link or QR');
            assert.equal(s.old, 'none');
            assert.equal(s.oldLead, false, 'no "What are you setting up?" on screen');
            assert.equal(s.same, null);
            assert.equal(s.resume, null);
            assert.equal(s.sw, s.w, 'nothing runs off the side at ' + vp.width);
        }
    });

    test('a round in progress: Same names it; Resume <course> · thru 5 opens its card (resumeGame)', { timeout: 120000 }, async () => {
        const r = await arriveCold({ url: URL, db: DB({ DBR5TH: ROUND('DBR5TH', 5) }), settleMs: 2000, viewport: { width: 375, height: 667 }, preScript: PRE('DBR5TH'), steps: [
            { waitFor: "!!document.getElementById('gl-resume') && getComputedStyle(document.getElementById('gl-resume')).display !== 'none'", timeout: 15000 }, SETTLE, { expression: READ },
            { tap: '#gl-resume' }, { waitFor: "/index\\.html/.test(location.pathname)", timeout: 15000 },
            { expression: "JSON.stringify({ at: location.href.split('/').pop() })" }] });
        assert.equal(r.ok, true, r.reason);
        const [s, at] = J(r);
        assert.equal(s.same, '↻ Same as last week\nDobson Ranch Golf Course · Test A, Test B · Nassau $5');
        assert.equal(s.resume, '▶︎ Resume Dobson Ranch Golf Course · thru 5');
        assert.ok(s.bottom <= s.h, 'all of it on one 375x667 screen: ' + s.bottom + ' > ' + s.h);
        assert.equal(at.at, 'index.html?game=DBR5TH');
    });

    test('Same as last week: Round Setup\'s own copier - a NEW code, copyFrom, Players', { timeout: 120000 }, async () => {
        const r = await arriveCold({ url: URL, db: DB({ DBR5TH: ROUND('DBR5TH', 5) }), settleMs: 2000, viewport: { width: 393, height: 852 }, preScript: PRE('DBR5TH'), steps: [
            SETTLE, { tap: '#gl-same' }, { tap: '#ui-sheet-yes' },   // 069: "Start a new round?" - Start
            { waitFor: "/copyFrom=DBR5TH/.test(location.search) && document.querySelectorAll('#player-list .player-row').length >= 2", timeout: 25000 }, { sleep: 1000 },
            { expression: "JSON.stringify({ url: document.URL, step: typeof currentWizardStep !== 'undefined' ? currentWizardStep : null })" }] });
        assert.equal(r.ok, true, r.reason);
        const [s] = J(r);
        const p = Object.fromEntries(new URLSearchParams(s.url.split('?')[1]));
        assert.match(p.game, /^[A-Z0-9]{6}$/);
        assert.notEqual(p.game, 'DBR5TH');
        assert.equal(p.copyFrom, 'DBR5TH');
        assert.equal(p.step, 'players');
        assert.equal(s.step, 5);
    });

    test('Have a game code?: the lobby\'s own Open-a-round card, with its refusal line', { timeout: 90000 }, async () => {
        const r = await arriveCold({ url: URL, db: DB(), settleMs: 2000, viewport: { width: 393, height: 852 }, preScript: PRE(null), steps: [
            SETTLE, { tap: '#gl-code' }, { sleep: 400 },
            { expression: "JSON.stringify({ inView: document.getElementById('gl-view').contains(document.getElementById('join-code-input')), shown: document.getElementById('join-code-input').getBoundingClientRect().height > 0, focus: document.activeElement && document.activeElement.id })" },
            { expression: "(function(){ var i = document.getElementById('join-code-input'); i.value = 'ZZZZZZ'; return 'typed'; })()" },
            { tap: '#open-round-card .join-code-btn' },
            { waitFor: "getComputedStyle(document.getElementById('join-code-refusal')).display !== 'none'", timeout: 15000 },
            { expression: "JSON.stringify({ refusal: document.getElementById('join-code-refusal').textContent, seen: document.getElementById('join-code-refusal').getBoundingClientRect().height > 0 })" }] });
        assert.equal(r.ok, true, r.reason);
        const [a, b] = J(r);
        assert.deepEqual(a, { inView: true, shown: true, focus: 'join-code-input' });
        assert.match(b.refusal, /No round with the code ZZZZZZ/);
        assert.equal(b.seen, true);
    });

    test('Road Trip -> trip.html (selectHomeWidget); ‹ Home -> home.html', { timeout: 90000 }, async () => {
        const r1 = await arriveCold({ url: URL, db: DB(), settleMs: 2000, viewport: { width: 393, height: 852 }, preScript: PRE(null), steps: [
            SETTLE, { tap: '#gl-trip' }, { waitFor: "/trip\\.html/.test(location.pathname)", timeout: 15000 }, { expression: "JSON.stringify({ at: location.pathname.split('/').pop() })" }] });
        assert.equal(r1.ok, true, r1.reason);
        assert.equal(J(r1)[0].at, 'trip.html');
        const r2 = await arriveCold({ url: URL, db: DB(), settleMs: 2000, viewport: { width: 393, height: 852 }, preScript: PRE(null), steps: [
            SETTLE, { tap: '#gl-back' }, { waitFor: "/home\\.html/.test(location.pathname)", timeout: 15000 }, { expression: "JSON.stringify({ at: location.pathname.split('/').pop() })" }] });
        assert.equal(r2.ok, true, r2.reason);
        assert.equal(J(r2)[0].at, 'home.html');
    });

    test('a finished round: Same is offered, Resume is not', { timeout: 90000 }, async () => {
        const r = await arriveCold({ url: URL, db: DB({ FIN018: ROUND('FIN018', 18) }), settleMs: 2000, viewport: { width: 393, height: 852 }, preScript: PRE('FIN018'), steps: [{ sleep: 3000 }, { expression: READ }] });
        assert.equal(r.ok, true, r.reason);
        const [s] = J(r);
        assert.match(s.same, /Same as last week/);
        assert.equal(s.resume, null);
    });

    test('without the doors flag: the old lobby, unchanged', { timeout: 90000 }, async () => {
        const r = await arriveCold({ url: URL, db: DB(), settleMs: 2000, viewport: { width: 393, height: 852 }, preScript: PRE(null, false), steps: [SETTLE, { expression: READ }] });
        assert.equal(r.ok, true, r.reason);
        const [s] = J(r);
        assert.equal(s.view, null);
        assert.equal(s.old, 'block');
        assert.equal(s.oldLead, true);
    });
});
