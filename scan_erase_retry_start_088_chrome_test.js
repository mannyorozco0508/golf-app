// ============================================================================
// 088 FOLLOW-UP: a Delete account that could not reach the scan server leaves a note
// (hp.scanErasePending). The app now retries it ON START (front-door.js), not only on
// admin.html: only when the note is there and inside its window, after the page has loaded,
// never blocking. Real Chrome, journey harness (stub db), the scan server faked in the page.
//   A  a fresh note on Home: ONE POST to /api/scan-erase with the note's token; the note is gone
//   B  no note: account-exit.js is not even loaded, nothing is sent
//   C  a note past its window: dropped, nothing sent
//   D  the server still unreachable: the note stays for the next start
// Negative control: front-door.js at f91af1d5 (before the follow-up) fails A, C and D - no POST, no drop.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'simple-flow.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

// a made-up token whose payload is not real; the fake server only checks it is sent
const TOK = 'eyJhbGciOiJub25lIn0.eyJleHAiOjk5OTk5OTk5OTl9.sig';
const NOTE = (until) => "try{localStorage.setItem('hp.scanErasePending', JSON.stringify({ token: '" + TOK + "', until: " + until + " }));}catch(e){}";
const FAKE = (reply) => "(function(){ window.__erase = []; var of = window.fetch; window.fetch = function (u, o) { if (/\\/api\\/scan-erase$/.test(String(u))) { window.__erase.push({ auth: o && o.headers && o.headers.Authorization, method: o && o.method });"
    + (reply === 'offline' ? " return Promise.reject(new TypeError('offline')); }" : " return Promise.resolve({ status: 200, json: function () { return Promise.resolve({ status: 'erased' }); } }); }")
    + " return of.apply(this, arguments); }; })();";
const MEASURE = "JSON.stringify({ erase: window.__erase || [], note: localStorage.getItem('hp.scanErasePending'), loaded: !!document.querySelector('script[src=\"account-exit.js\"]'), ax: !!window.accountExit })";
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) {} } });
async function home(pre) {
    const j = await openJourney({ db: { events: {}, global_courses: {}, trips: {}, tournaments: {}, organizers: {} }, viewport: { width: 393, height: 852 }, webgl: true,
        preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + pre });
    journeys.push(j);
    await j.goto(fileUrl('home.html'), 2500);
    return j;
}
async function settle(j, want) {
    const t0 = Date.now(); let m = null;
    while (Date.now() - t0 < 12000) { m = JSON.parse(await j.evaluate(MEASURE)); if (want(m)) return m; await sleep(250); }
    return m;
}

test('A a fresh note: ONE POST to /api/scan-erase with its token on Home; the note is gone', { timeout: 120000 }, async () => {
    const j = await home(NOTE('Date.now() + 30 * 60 * 1000') + FAKE('ok'));
    const m = await settle(j, (x) => x.erase.length && !x.note);
    assert.equal(m.erase.length, 1, JSON.stringify(m));
    assert.equal(m.erase[0].method, 'POST');
    assert.equal(m.erase[0].auth, 'Bearer ' + TOK);
    assert.equal(m.note, null, 'erased -> the note is dropped');
    assert.equal(m.ax, true, 'account-exit.js was loaded for it');
});

test('B no note: nothing loaded, nothing sent', { timeout: 120000 }, async () => {
    const j = await home(FAKE('ok'));
    await sleep(3000);
    const m = JSON.parse(await j.evaluate(MEASURE));
    assert.deepEqual(m.erase, []);
    assert.equal(m.loaded, false, 'account-exit.js is not fetched without a note');
});

test('C a note past its window: dropped, nothing sent', { timeout: 120000 }, async () => {
    const j = await home(NOTE('Date.now() - 1000') + FAKE('ok'));
    const m = await settle(j, (x) => !x.note);
    await sleep(1500);
    const m2 = JSON.parse(await j.evaluate(MEASURE));
    assert.equal(m.note, null);
    assert.deepEqual(m2.erase, []);
});

test('D still unreachable: one try, the note stays for the next start', { timeout: 120000 }, async () => {
    const j = await home(NOTE('Date.now() + 30 * 60 * 1000') + FAKE('offline'));
    const m = await settle(j, (x) => x.erase.length);
    await sleep(1000);
    const m2 = JSON.parse(await j.evaluate(MEASURE));
    assert.equal(m2.erase.length, 1, JSON.stringify(m2));
    assert.ok(m2.note, 'kept for the next start');
});
