// ============================================================================
// 084 - ROUNDS I'M RUNNING ON THE WEBSITE'S HOME (admin.html lobby), in real Chrome, arriving cold
// (tools/lib/cold-arrival.js: the page's own scripts, only the data source is a fixture).
//   A  signed in, 3 rounds on the account: ONE row (today's) + "See all 3", Edit setup ->
//      admin.html?game=CODE, the collapsed Home still ONE SCREEN at 390x844, Home wrote nothing,
//      no organizer link anywhere; a real tap on See all shows the 3, today first
//   B  signed out, this browser holds a round by organizer link: "Sign in to edit" + the how-to,
//      and NOT an Edit setup link
//   C  a golfer with no rounds: the card is not there (Home unchanged)
// Pictures: ~/Desktop/claude-code-reports/084/built/ (light + dark, 393x852 and 375x667) when
// SHOTS_084 is set.
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const SHOTS = process.env.SHOTS_084 || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const mid = (offset) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset).getTime(); };
const ROUNDS = {
    TQ7M4K: { at: mid(0), name: 'Tuesday Skins', course: 'Desert Palms GC', day: mid(0) },
    R8HZ2W: { at: mid(-1), name: 'Saturday Nassau', course: 'Coyote Ridge', day: mid(4) },
    MJ3QX9: { at: mid(-6), name: 'Tuesday Skins', course: 'Desert Palms GC', day: mid(-6) },
    OLD999: { at: mid(-40), name: 'Too old', day: mid(-40) }
};
const EVENTS = {};
Object.keys(ROUNDS).forEach((c) => { EVENTS[c] = { ownerUid: 'acct', eventName: ROUNDS[c].name, courseName: ROUNDS[c].course || '', organizerToken: 'tok_084_never_shown' }; });
EVENTS.LINK01 = { ownerUid: 'acct', eventName: 'Monday Game', courseName: 'Dobson Ranch', createdAt: mid(0), organizerToken: 'tok_084_never_shown' };
const DB = (withPointers) => ({ events: EVENTS, global_courses: {}, trips: {}, tournaments: {}, seasons: {}, organizers: withPointers ? { acct: { rounds: ROUNDS } } : {} });

const MEASURE = `JSON.stringify((function () {
    var box = document.getElementById('my-rounds'), lobby = document.getElementById('lobby-screen');
    var shown = !!(box && box.getClientRects().length && getComputedStyle(box).display !== 'none');
    return { exists: !!box, shown: shown,
        rows: box ? Array.prototype.map.call(box.querySelectorAll('[data-mr-code]'), function (r) { return r.getAttribute('data-mr-code'); }) : [],
        edit: box ? Array.prototype.map.call(box.querySelectorAll('[data-mr-edit]'), function (a) { return a.getAttribute('href'); }) : [],
        signin: box ? box.querySelectorAll('[data-mr-signin]').length : 0,
        text: box ? box.innerText.replace(/\\s+/g, ' ').trim() : '',
        html: box ? box.innerHTML : '',
        screenH: Math.round(lobby.getBoundingClientRect().height), vh: window.innerHeight,
        writes: (window.__coldWrites || []).map(function (w) { return w.path; }) };
})())`;
const parse = (r) => (r.value || []).filter((v) => typeof v === 'string' && v.charAt(0) === '{').map(JSON.parse);
const shot = (name) => (SHOTS ? [{ shot: path.join(SHOTS, name + '.png') }] : []);
const dark = "try { localStorage.setItem('golfapp-theme', 'dark'); } catch (e) {}";

describe('084 Rounds I\'m running on the website Home (real Chrome, cold arrival)', () => {
    test('A signed in: 1 row + See all 3, Edit setup link, still one screen, Home wrote nothing, no organizer link', { timeout: 120000 }, async () => {
        const r = await arriveCold({ url: fileUrl('admin.html', ''), db: DB(true), auth: { uid: 'acct', email: 'manny@example.com' }, settleMs: 3000,
            viewport: { width: 390, height: 844 },
            steps: [{ expression: MEASURE }].concat(shot('web-home-in-light-390'), [{ tap: '[data-mr-more]' }, { sleep: 300 }, { expression: MEASURE }], shot('web-home-in-seeall-light-390')) });
        assert.equal(r.ok, true, r.reason);
        const [a, b] = parse(r);
        assert.ok(a.shown, 'the card is on Home: ' + JSON.stringify(a));
        assert.deepEqual(a.rows, ['TQ7M4K'], 'one row, today\'s');
        assert.deepEqual(a.edit, ['admin.html?game=TQ7M4K']);
        assert.match(a.text, /Rounds I.m running/i); assert.match(a.text, /Signed in as manny@example\.com/); assert.match(a.text, /See all 3/);
        assert.equal(a.signin, 0);
        assert.ok(a.screenH <= a.vh, 'the collapsed Home is ' + a.screenH + 'px in a ' + a.vh + 'px viewport');
        assert.deepEqual(a.writes, [], 'Home wrote nothing');
        assert.doesNotMatch(a.html, /tok_084|organizer=/, 'no organizer token or link');
        assert.deepEqual(b.rows, ['TQ7M4K', 'R8HZ2W', 'MJ3QX9'], 'See all: today, upcoming, past; 40 days ago is not listed');
    });

    test('A pictures: dark 393x852, light 375x667', { timeout: 120000, skip: !SHOTS && 'set SHOTS_084 for pictures' }, async () => {
        for (const [vp, pre, name] of [[{ width: 393, height: 852 }, dark, 'web-home-in-dark-393'], [{ width: 375, height: 667 }, '', 'web-home-in-light-375'], [{ width: 393, height: 852 }, '', 'web-home-in-light-393']]) {
            const r = await arriveCold({ url: fileUrl('admin.html', ''), db: DB(true), auth: { uid: 'acct', email: 'manny@example.com' }, settleMs: 3000, viewport: vp, preScript: pre, steps: shot(name).concat([{ expression: MEASURE }]) });
            assert.equal(r.ok, true, r.reason);
            assert.ok(parse(r)[0].shown);
        }
    });

    test('B signed out, a round held by organizer link: Sign in to edit + how-to, no Edit setup link', { timeout: 120000 }, async () => {
        const pre = "try { localStorage.setItem('golfapp_organizer_LINK01', 'tok_084_never_shown'); } catch (e) {}";
        for (const [vp, extra, name] of [[{ width: 393, height: 852 }, '', 'web-home-out-light-393'], [{ width: 393, height: 852 }, dark, 'web-home-out-dark-393'], [{ width: 375, height: 667 }, '', 'web-home-out-light-375']]) {
            const r = await arriveCold({ url: fileUrl('admin.html', ''), db: DB(false), settleMs: 3000, viewport: vp, preScript: pre + extra,
                steps: [{ tap: '#my-rounds .mr-how summary' }, { sleep: 250 }, { expression: MEASURE }].concat(shot(name)) });
            assert.equal(r.ok, true, r.reason);
            const [a] = parse(r);
            assert.ok(a.shown, JSON.stringify(a));
            assert.deepEqual(a.rows, ['LINK01']);
            assert.deepEqual(a.edit, [], 'no Edit setup link for a link-held round');
            assert.ok(a.signin >= 2, 'Sign in to edit on the row and under it');
            assert.match(a.text, /How to get the organizer link/); assert.match(a.text, /Group Links/); assert.match(a.text, /Saving changes still needs you signed in/);
            assert.doesNotMatch(a.html, /tok_084|organizer=/);
            assert.deepEqual(a.writes, []);
        }
    });

    test('C no rounds: no card, Home unchanged', { timeout: 120000 }, async () => {
        const r = await arriveCold({ url: fileUrl('admin.html', ''), db: DB(false), settleMs: 2600, viewport: { width: 390, height: 844 }, steps: [{ expression: MEASURE }] });
        assert.equal(r.ok, true, r.reason);
        const [a] = parse(r);
        assert.equal(a.exists, true, 'the slot is in the page');
        assert.equal(a.shown, false); assert.deepEqual(a.rows, []);
    });
});
