// ============================================================================
// FALSE "NO SIGNAL" ON A SLOW FIRST CONNECTION (fix-false-nosignal), in real Chrome at 393x852.
//
// Found in the Simulator on a FRESH install (internet on), about 1 run in 3-6: the GPS door's
// Course & Tees said "📴 No signal. A new round needs one bar ...", TEES stuck on "Loading the
// course card…", Start Round "Needs a moment of signal", and it never recovered. The first
// database connection took longer than the code check's 8 s timer; .info/connected reads false
// BEFORE the first connection, so the timeout was taken for no signal - and the only re-ask was
// the window 'online' event, which never fires when navigator.onLine was true all along.
//
//   1. slow first connection (every database read, the code check included, answers only after
//      12 s; .info/connected false until then): never "No signal"; it ends on the round's own
//      Course & Tees with the tees and Start Round live.
//   2. a dead bar (onLine true, no database for 40 s): "No signal" only after the grace, and it
//      carries on by itself when the database comes up - no event, no tap.
//   3. genuinely offline (navigator.onLine false): the offline line at once, as before.
// Stub db only (the journey harness), synthetic course data only.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'simple-flow.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const PAP = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: i === 0 ? 5 : 4, hcpIndex: i + 1 }));
const TEE = (name, y, r, sl) => ({ name, rating: r, slope: sl, parTotal: 73, totalYards: y, holes: PAP.map((h) => ({ par: h.par, yardage: Math.round(y / 18) })) });
const PAPAGO = { name: 'Papago Golf Club', data: PAP,
    tees: { male: [TEE('Black', 7419, 75.0, 130), TEE('Blue', 6884, 72.0, 125), TEE('White', 6475, 70.1, 120), TEE('Gold', 5435, 65.0, 111)] },
    location: { city: 'Phoenix', state: 'AZ', latitude: 33.4560, longitude: -111.9480 } };
// URGENT-060: the golfer ON Papago (its course point) - only within ~0.5 mi is a course auto-picked.
const HERE = { latitude: 33.4578, longitude: -111.9603, accuracy: 10 };
const GEO = "try{ navigator.geolocation.getCurrentPosition = function (ok) { setTimeout(function(){ ok({ coords: " + JSON.stringify(HERE) + " }); }, 50); }; }catch(e){}";
// A SLOW FIRST CONNECTION on the GPS door's code-minting page (admin.html?start=quick) only: every
// read waits until SLOW ms after the page started, and .info/connected says false until then (as the
// real SDK does before its first connection). navigator.onLine stays true throughout.
const slow = (ms, page) => "(function(){ if (!/admin\\.html$/.test(location.pathname) || !/" + (page || 'start=quick') + "/.test(location.search)) return;"
    + " var T0 = Date.now(), SLOW = " + ms + ", up = function () { return Date.now() - T0 >= SLOW; }, left = function () { return Math.max(0, SLOW - (Date.now() - T0)); };"
    + " window.__issues = 0; var realDb = firebase.database;"
    + " firebase.database = function () { var d = realDb.apply(this, arguments); return { ref: function (p) { var r = d.ref(p);"
    + "  if (String(p) === '.info/connected') return { on: function (ev, cb) { setTimeout(function () { cb({ val: function () { return up(); } }); }, 0); if (!up()) setTimeout(function () { cb({ val: function () { return true; } }); }, left()); return cb; }, off: function () {}, once: function () { return Promise.resolve({ val: function () { return up(); } }); } };"
    + "  var o = Object.create(r); o.once = function () { var a = arguments; if (/^events\\/[A-Z0-9]{6}$/.test(String(p))) window.__issues++; if (up()) return r.once.apply(r, a); return new Promise(function (res, rej) { setTimeout(function () { r.once.apply(r, a).then(res, rej); }, left()); }); }; return o; } }; };"
    + "})();";
const OFFLINE = "(function(){ if (!/admin\\.html$/.test(location.pathname)) return; try { Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: function () { return localStorage.getItem('nsoff') !== '1'; } }); } catch (e) {}"
    + " document.addEventListener('DOMContentLoaded', function () { var real = window.issueUniqueCode; if (typeof real !== 'function') return;"
    + "  window.issueUniqueCode = function (o) { if (localStorage.getItem('nsoff') === '1') return new Promise(function (_, no) { setTimeout(function () { var e = new Error('timed out'); e.code = 'timeout'; no(e); }, 300); }); return real(o); }; }); })();";

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) {} } });
async function open(pre) {
    const j = await openJourney({ db: { events: {}, global_courses: { az_papago: PAPAGO }, gps_links: { az_papago: '012141520636857668694' }, trips: {}, organizers: {}, tournaments: {} },
        viewport: { width: 393, height: 852 }, webgl: true, preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + GEO + pre });
    journeys.push(j);
    try { await j.cdp('Browser.grantPermissions', { permissions: ['geolocation'] }); await j.cdp('Emulation.setGeolocationOverride', HERE); } catch (e) {}
    return j;
}
const ev = (j, x) => j.evaluate(x);
const KEY = "document.getElementById('course-select').value";
const SCREEN = "JSON.stringify((function(){ var sf = document.getElementById('sf'), t = sf && sf.style.display !== 'none' ? sf.innerText : '';"
    + " var st = document.querySelector('#sf [data-sf=startgps]');"
    + " return { at: location.pathname.split('/').pop() + location.search, nosig: /No signal/.test(t), connecting: !!document.getElementById('sf-connecting'), offline: (document.getElementById('sf-offline') || {}).innerText || '',"
    + " tees: document.querySelectorAll('#sf [data-sf-tee]').length, cardLoading: /Loading the course card/.test(t), start: st ? st.innerText + (st.disabled ? ' [disabled]' : '') : '' }; })())";
// Watches the screen every 150 ms until done(s) or ms; returns every distinct state seen.
async function watch(j, done, ms) {
    const seen = [], t0 = Date.now(); let last = null, s = null;
    while (Date.now() - t0 < ms) {
        try { s = JSON.parse(await ev(j, SCREEN)); } catch (e) { s = null; }
        if (s) { s.t = Math.round((Date.now() - t0) / 1000); const k = JSON.stringify(Object.assign({}, s, { t: 0 })); if (k !== last) { seen.push(s); last = k; } if (done(s)) break; }
        await sleep(150);
    }
    return { seen, s };
}
const READY = (s) => /game=/.test(s.at) && s.tees > 0 && /^Start Round$/.test(s.start);
async function door(j, first) {
    // URGENT-065: these golfers stand ON Papago, where Home's Start round now starts the round in one tap
    // (no Course & Tees). Course & Tees - what this file is about - is reached by the plain GPS door
    // (home.html#gpsdoor, the round's Change course entry: simpleAct('sgpsdoor') with no Home button).
    await j.goto(fileUrl('home.html', ''), 2500);
    if (first) await ev(j, first);
    assert.ok(await ev(j, "(function(){ if (!document.querySelector('#hs-gps [data-hp-act=\"sgpsdoor\"]')) return false; location.hash = 'gpsdoor'; location.reload(); return true; })()"), 'the GPS door');
}

test('a slow first connection (12 s): never "No signal" - it ends on Course & Tees with tees and Start Round', { timeout: 90000 }, async () => {
    const j = await open(slow(12000));
    await door(j);
    const { seen, s } = await watch(j, READY, 45000);
    const trail = JSON.stringify(seen);
    assert.ok(seen.some((x) => /start=quick/.test(x.at) && x.connecting), 'the code check timed out first (the connecting line): ' + trail);
    assert.ok(!seen.some((x) => x.nosig), 'a "No signal" showed on a slow first connection: ' + trail);
    assert.ok(s && READY(s), 'the round\'s Course & Tees with tees and Start Round live: ' + trail);
    assert.equal(await ev(j, KEY), 'az_papago');
    assert.equal(s.cardLoading, false);
});

test('a dead bar (onLine true, no database for 40 s): "No signal" only after the grace, then it carries on by itself', { timeout: 120000 }, async () => {
    const j = await open(slow(40000));
    await door(j);
    const t0 = Date.now();
    const a = await watch(j, (x) => x.nosig, 35000);
    assert.ok(a.s && a.s.nosig, 'no "No signal" while the database never came up: ' + JSON.stringify(a.seen));
    assert.ok(Date.now() - t0 >= 15000, '"No signal" before the grace (' + (Date.now() - t0) + ' ms): ' + JSON.stringify(a.seen));
    assert.match(a.s.offline, /No signal\. A new round needs one bar/);
    // Nothing is tapped and no 'online' event comes: the database coming up is enough.
    const b = await watch(j, READY, 45000);
    assert.ok(b.s && READY(b.s), 'recovered by itself: ' + JSON.stringify(b.seen));
    assert.ok(!b.s.nosig);
});

test('genuinely offline (navigator.onLine false): the offline line at once, picks kept, and it carries on when back', { timeout: 90000 }, async () => {
    const j = await open(OFFLINE);
    await door(j, "localStorage.setItem('nsoff', '1'); 1");
    const a = await watch(j, (x) => x.nosig && x.tees > 0, 20000);
    assert.ok(a.s && a.s.nosig && a.s.tees > 0, 'the offline line with the tees: ' + JSON.stringify(a.seen));
    assert.match(a.s.offline, /No signal\. A new round needs one bar/);
    assert.equal(a.s.connecting, false);
    assert.equal(await ev(j, KEY), 'az_papago');
    await ev(j, "localStorage.setItem('nsoff', '0'); window.dispatchEvent(new Event('online')); 1");
    const b = await watch(j, READY, 30000);
    assert.ok(b.s && READY(b.s), 'back online: ' + JSON.stringify(b.seen));
    assert.equal(await ev(j, KEY), 'az_papago');
});

test('a slow first connection on the round\'s own page (9 s): the ✓ GPS links that timed out are asked again once it is up', { timeout: 90000 }, async () => {
    const j = await open(slow(9000, 'game='));
    await door(j);
    const { seen, s } = await watch(j, READY, 45000);
    assert.ok(s && READY(s), 'the round\'s Course & Tees: ' + JSON.stringify(seen));
    assert.ok(!seen.some((x) => x.nosig), JSON.stringify(seen));
    const t0 = Date.now(); let k = null;
    while (Date.now() - t0 < 30000) { k = JSON.parse(await ev(j, "JSON.stringify({ partial: HardPanDoors.gpsKeysPartial(), link: HardPanDoors.gpsLinks().az_papago || null, kept: !!localStorage.getItem('hardpan_gpskeys_v1') })")); if (!k.partial && k.link) break; await sleep(300); }
    assert.deepEqual(k, { partial: false, link: '012141520636857668694', kept: true }, 'the GPS links read again after the slow connection');
});
