// ============================================================================
// 084 - ROUNDS I'M RUNNING ON THE GPS APP'S HOME (home.html, simpleFlow), real Chrome at phone size
// (journey harness: stub db, every write recorded in window.__WRITES).
//   A  signed in, 4 rounds on the account (one 40 days old): today first, then upcoming, then past -
//      3 rows and no See all; Edit setup -> admin.html?game=CODE; Home wrote nothing; no token
//   B  signed in with 5 rounds: 3 rows + "See all 4"; a tap shows the 4
//   C  signed out (guest), a round held by organizer link: "Sign in to edit" + the how-to, no Edit setup
//   D  the round IN PROGRESS on Home is not repeated in the list (an unfinished round shows ONCE)
// Pictures (SHOTS_084): ~/Desktop/claude-code-reports/084/built/gps-*.png at 393x852 and 375x667.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'simple-flow.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const SHOTS = process.env.SHOTS_084 || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const mid = (o) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + o).getTime(); };
const R = (name, course, day) => ({ at: day, name, course, day });
const ROUNDS4 = { TQ7M4K: R('Tuesday Skins', 'Desert Palms GC', mid(0)), R8HZ2W: R('Saturday Nassau', 'Coyote Ridge', mid(4)), MJ3QX9: R('Tuesday Skins', 'Desert Palms GC', mid(-6)), OLD999: R('Too old', 'Papago', mid(-40)) };
const ROUNDS5 = Object.assign({ YDAY01: R('Sunday Game', 'Papago Golf Club', mid(-1)) }, ROUNDS4);
function events(rounds) { const e = {}; Object.keys(rounds).forEach((c) => { e[c] = { ownerUid: 'acct', eventName: rounds[c].name, courseName: rounds[c].course, organizerToken: 'tok_084_never_shown' }; }); return e; }
const DB = (rounds, extra) => ({ events: Object.assign(events(rounds), extra || {}), global_courses: {}, trips: {}, tournaments: {}, organizers: { acct: { rounds } } });
const MEASURE = `JSON.stringify((function () {
    var box = document.getElementById('hs-mine');
    var shown = !!(box && box.getClientRects().length && getComputedStyle(box).display !== 'none');
    return { shown: shown,
        rows: box ? Array.prototype.map.call(box.querySelectorAll('[data-mr-code]'), function (r) { return r.getAttribute('data-mr-code'); }) : [],
        edit: box ? Array.prototype.map.call(box.querySelectorAll('[data-mr-edit]'), function (a) { return a.getAttribute('href'); }) : [],
        signin: box ? box.querySelectorAll('[data-mr-signin]').length : 0,
        text: box ? box.innerText.replace(/\\s+/g, ' ').trim() : '', html: box ? box.innerHTML : '',
        writes: (window.__WRITES || []).map(function (w) { return w.path; }) };
})())`;
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) {} } });
async function open(db, auth, pre, vp) {
    const j = await openJourney({ db, auth, viewport: vp || { width: 393, height: 852 }, webgl: true,
        preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + (pre || '') });
    journeys.push(j);
    await j.goto(fileUrl('home.html'), 2500);
    return j;
}
async function measure(j, want) {
    const t0 = Date.now(); let m = null;
    while (Date.now() - t0 < 10000) { m = JSON.parse(await j.evaluate(MEASURE)); if (want(m)) return m; await sleep(200); }
    return m;
}
const scrollTo = (j) => j.evaluate("(function(){ var b=document.getElementById('hs-mine'); if (b) window.scrollTo(0, Math.max(0, b.getBoundingClientRect().top + window.scrollY - 220)); return 1; })()");

test('A signed in: today, upcoming, past (40 days ago left out) - 3 rows, no See all; Edit setup links; Home wrote nothing', { timeout: 120000 }, async () => {
    for (const vp of [{ width: 393, height: 852 }, { width: 375, height: 667 }]) {
        const j = await open(DB(ROUNDS4), { uid: 'acct', email: 'manny@example.com' }, '', vp);
        const m = await measure(j, (x) => x.rows.length === 3);
        assert.ok(m.shown, JSON.stringify(m));
        assert.deepEqual(m.rows, ['TQ7M4K', 'R8HZ2W', 'MJ3QX9']);
        assert.deepEqual(m.edit, ['admin.html?game=TQ7M4K', 'admin.html?game=R8HZ2W', 'admin.html?game=MJ3QX9']);
        assert.doesNotMatch(m.text, /See all/); assert.match(m.text, /manny@example\.com/);
        assert.equal(m.signin, 0);
        assert.doesNotMatch(m.html, /tok_084|organizer=/);
        assert.deepEqual(m.writes, [], 'Home wrote nothing');
        if (SHOTS) { await scrollTo(j); await sleep(300); await j.shot(path.join(SHOTS, 'gps-home-in-' + vp.width + '.png')); }
    }
});

test('B five rounds: 3 rows + See all 4; a tap shows all 4', { timeout: 120000 }, async () => {
    const j = await open(DB(ROUNDS5), { uid: 'acct', email: 'manny@example.com' });
    const m = await measure(j, (x) => x.rows.length === 3 && /See all/.test(x.text));
    assert.deepEqual(m.rows, ['TQ7M4K', 'R8HZ2W', 'YDAY01']);
    assert.match(m.text, /See all 4/);
    assert.ok(await j.tap('[data-mr-more]'), 'See all');
    const m2 = await measure(j, (x) => x.rows.length === 4);
    assert.deepEqual(m2.rows, ['TQ7M4K', 'R8HZ2W', 'YDAY01', 'MJ3QX9']);
});

test('C signed out (guest), a round held by organizer link: Sign in to edit + how-to; no Edit setup link', { timeout: 120000 }, async () => {
    const ev = { LINK01: { ownerUid: 'acct', eventName: 'Monday Game', courseName: 'Dobson Ranch', createdAt: mid(0), organizerToken: 'tok_084_never_shown' } };
    const db = { events: ev, global_courses: {}, trips: {}, tournaments: {}, organizers: {} };
    for (const vp of [{ width: 393, height: 852 }, { width: 375, height: 667 }]) {
        const j = await open(db, undefined, "try{localStorage.setItem('golfapp_organizer_LINK01','tok_084_never_shown');}catch(e){}", vp);
        const m = await measure(j, (x) => x.rows.length === 1);
        assert.deepEqual(m.rows, ['LINK01'], JSON.stringify(m));
        assert.deepEqual(m.edit, []);
        assert.ok(m.signin >= 2);
        assert.match(m.text, /How to get the organizer link/);
        assert.doesNotMatch(m.html, /tok_084|organizer=/);
        assert.deepEqual(m.writes, []);
        if (SHOTS) { await j.evaluate("(function(){ var d=document.querySelector('#hs-mine .mr-how'); if (d) d.open = true; return 1; })()"); await scrollTo(j); await sleep(300); await j.shot(path.join(SHOTS, 'gps-home-out-' + vp.width + '.png')); }
    }
});

test('D the round IN PROGRESS on Home is not listed again (an unfinished round shows once)', { timeout: 120000 }, async () => {
    const pre = "try{localStorage.setItem('hardpan_last_round', JSON.stringify({ code: 'TQ7M4K', at: Date.now() - 60000, course: 'Desert Palms GC' }));localStorage.setItem('lastRoomCode','TQ7M4K');}catch(e){}";
    const j = await open(DB(ROUNDS4), { uid: 'acct', email: 'manny@example.com' }, pre);
    const m = await measure(j, (x) => x.rows.length >= 2);
    const prog = await j.evaluate("Array.prototype.map.call(document.querySelectorAll('#hs-progress [data-hp-open]'), function (b) { return b.getAttribute('data-hp-open'); }).join(',')");
    if (/TQ7M4K/.test(prog)) assert.ok(!m.rows.includes('TQ7M4K'), 'shown in IN PROGRESS, not again: ' + JSON.stringify(m.rows));
    else assert.ok(m.rows.includes('TQ7M4K'), 'no IN PROGRESS card for it, so it is listed');
});
