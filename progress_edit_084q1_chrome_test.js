// ============================================================================
// 084 Q1 (Manny, Oct 26): "Edit setup" INSIDE Home's IN PROGRESS card - for the round's OWNER only,
// to the same admin.html?game=CODE as Rounds I'm running; signed out with the round's organizer link on
// this phone: "Sign in to edit"; anyone else: nothing. Resume is untouched (only add).
// Real Chrome at phone size, journey harness (stub db; every write recorded in window.__WRITES).
//   A  signed in as the owner: Resume + "Edit setup" -> admin.html?game=CODE; Home wrote nothing
//   B  signed in as someone else: Resume, no Edit setup, no Sign in to edit
//   C  signed out, the organizer link on this phone: Resume + "Sign in to edit" (no Edit setup)
//   D  signed out, no organizer link: Resume only
// Negative control: before 084 Q1 (front-door.js at f91af1d5) A and C fail - no row in the card.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'simple-flow.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');

const CODE = 'EDQ1AB';
function db() {
    const r = wizardSavedRound({ code: CODE, golfers: 4, ownerUid: 'acct', thru: 5, flights: false,
        names: ['Ray Ortiz', 'Dan Kim', 'Luis Vega', 'Tom Reyes'], overrides: { courseName: 'Papago Golf Club', activeCourseKey: 'papago', groupSizeOverrides: { 0: 4 } } });
    return { events: { [CODE]: r }, global_courses: {}, trips: {}, tournaments: {}, organizers: {} };
}
const LAST = "try{localStorage.setItem('hardpan_last_round', JSON.stringify({ code: '" + CODE + "', at: Date.now() - 60000, course: 'Papago Golf Club' }));localStorage.setItem('lastRoomCode','" + CODE + "');}catch(e){}";
const TOKEN = "try{localStorage.setItem('golfapp_organizer_" + CODE + "','tok_q1_never_shown');}catch(e){}";
const MEASURE = `JSON.stringify((function () {
    var p = document.getElementById('hs-progress');
    return { resume: p ? Array.prototype.map.call(p.querySelectorAll('[data-hp-open]'), function (b) { return b.getAttribute('data-hp-open'); }) : [],
        edit: p ? Array.prototype.map.call(p.querySelectorAll('[data-hs-prog-edit]'), function (a) { return a.getAttribute('href') + '|' + a.textContent; }) : [],
        signin: p ? Array.prototype.map.call(p.querySelectorAll('[data-hs-prog-signin]'), function (b) { return b.textContent; }) : [],
        editH: (function () { var a = p && p.querySelector('.hs-prog-edit'); return a ? Math.round(a.getBoundingClientRect().height) : 0; })(),
        html: p ? p.innerHTML : '', writes: (window.__WRITES || []).map(function (w) { return w.path; }) };
})())`;
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) {} } });
async function open(auth, pre, vp) {
    const j = await openJourney({ db: db(), auth, viewport: vp || { width: 393, height: 852 }, webgl: true,
        preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + LAST + (pre || '') });
    journeys.push(j);
    await j.goto(fileUrl('home.html'), 2500);
    return j;
}
async function measure(j, want) {
    const t0 = Date.now(); let m = null;
    while (Date.now() - t0 < 12000) { m = JSON.parse(await j.evaluate(MEASURE)); if (want(m)) return m; await sleep(250); }
    return m;
}

test('A the owner, signed in: Resume + Edit setup -> admin.html?game=CODE (a 44px tap); Home wrote nothing', { timeout: 120000 }, async () => {
    for (const vp of [{ width: 393, height: 852 }, { width: 375, height: 667 }]) {
        const j = await open({ uid: 'acct', email: 'manny@example.com' }, '', vp);
        const m = await measure(j, (x) => x.resume.length && x.edit.length);
        assert.deepEqual(m.resume, [CODE], JSON.stringify(m));
        assert.deepEqual(m.edit, ['admin.html?game=' + CODE + '|Edit setup ›']);
        assert.deepEqual(m.signin, []);
        assert.ok(m.editH >= 44, 'tap target ' + m.editH);
        assert.doesNotMatch(m.html, /tok_q1|organizer=/);
        assert.deepEqual(m.writes, [], 'Home wrote nothing');
    }
});

test('B someone else, signed in: Resume only - no Edit setup, no Sign in to edit', { timeout: 120000 }, async () => {
    const j = await open({ uid: 'other', email: 'pal@example.com' }, TOKEN);
    const m = await measure(j, (x) => x.resume.length);
    await sleep(1500);
    const m2 = JSON.parse(await j.evaluate(MEASURE));
    assert.deepEqual(m.resume, [CODE]);
    assert.deepEqual(m2.edit, []); assert.deepEqual(m2.signin, []);
});

test('C signed out, the organizer link on this phone: Resume + Sign in to edit, no Edit setup', { timeout: 120000 }, async () => {
    const j = await open(undefined, TOKEN);
    const m = await measure(j, (x) => x.resume.length && x.signin.length);
    assert.deepEqual(m.resume, [CODE], JSON.stringify(m));
    assert.deepEqual(m.signin, ['Sign in to edit']);
    assert.deepEqual(m.edit, []);
    assert.doesNotMatch(m.html, /tok_q1|organizer=/);
    assert.deepEqual(m.writes, []);
});

test('D signed out, no organizer link: Resume only', { timeout: 120000 }, async () => {
    const j = await open(undefined, '');
    const m = await measure(j, (x) => x.resume.length);
    await sleep(1500);
    const m2 = JSON.parse(await j.evaluate(MEASURE));
    assert.deepEqual(m.resume, [CODE]);
    assert.deepEqual(m2.edit, []); assert.deepEqual(m2.signin, []);
});
