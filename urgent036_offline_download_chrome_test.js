// ============================================================================
// URGENT-036 #36 (POLISH 029 #36) - "⬇ DOWNLOAD FOR OFFLINE" ON THE GPS DOOR'S COURSE & TEES SCREEN,
// IN REAL CHROME (393x852, the HardPan app: Home > GPS > "Where are you playing?").
//
// The report: "⬇ Download for offline" (course data + satellite tiles) was offered only in Game Day
// setup (Round Setup's GPS line, admin.html gpsOfflineRow), never in the GPS flow. Now the GPS door's
// Course & Tees screen shows that same row for the picked course - Round Setup's own function, the
// same buttons, words and download (HardPanGpsOffline.download) - under the course's tees.
//   1  The course picked: "Not downloaded" + "⬇ Download for offline", styled exactly as Round Setup's.
//   2  A tap downloads THIS course once (the same download call: key, name, card); the progress
//      count survives a redraw of the screen (a tee tapped mid-download); then "✓ Downloaded for
//      offline · 18 holes · 120 map tiles" and Delete.
//   3  No signal: "No signal - download it where you have signal", nothing downloaded.
//   4  The search box is still never redrawn (URGENT-035) with the row on screen.
// The download itself stood in (no tiles fetched, no network); GolfAPI / gps-live stood in. Stub db only.
// Synthetic course data only.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'simple-flow.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const SHOTS = process.env.U036_SHOTS || path.join(process.env.HOME || '', 'Desktop', 'claude-code-reports', '036', 'offline');
const { makeCourseData } = require('./helpers/fixtures.js');
const CD = makeCourseData(18);
const TEE = (name, y, r, sl) => ({ name, rating: r, slope: sl, parTotal: 71, totalYards: y, holes: CD.map((h) => ({ par: h.par, yardage: Math.round(y / 18) })) });
const HERE = { latitude: 33.4560, longitude: -111.9480, accuracy: 10 };
// A made-up GolfAPI course right here (the app's GPS: ✓ GPS needs hole 1's green within 2 km, URGENT-022).
const ID = '990000000000003601', CK = 'gapi_' + ID;
const GC = { [CK]: { name: 'Test 036 Golf Club (Championship)', data: CD, tees: { male: [TEE('Black', 6800, 72.6, 129), TEE('Gold', 6400, 70.6, 124)] },
    location: { city: 'Phoenix', state: 'AZ', latitude: 33.4560, longitude: -111.9480 } } };
const GAPI = { v: 1, built: 'test', links: {}, courses: { [ID]: { id: ID, club: 'Test 036 Golf Club', course: 'Championship', city: 'Phoenix', state: 'AZ', lat: 33.4560, lng: -111.9480, holes: 18,
    h: { 1: { g: { f: [33.4575, -111.9470], c: [33.4574, -111.9471], b: [33.4573, -111.9472] }, t: { b: [33.4597, -111.9443], f: [33.4590, -111.9458] } } } } } };
// Phone GPS mode: GolfAPI is the GPS (gps-live on), as on the iOS build.
const PHONE = "Object.defineProperty(window, 'HardPanGpsLive', { configurable: true, get: function () { return { on: function () { return true; }, find: function (n) { return Promise.resolve({ status: 'none', tried: [n] }); }, search: function () { return Promise.resolve({ status: 'ok', results: [] }); }, course: function () { return Promise.resolve({ status: 'none' }); }, merge: function () {} }; }, set: function () {} });"
    + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';';
const GEO = "try{ navigator.geolocation.getCurrentPosition = function (ok) { setTimeout(function(){ ok({ coords: " + JSON.stringify(HERE) + " }); }, 50); }; }catch(e){}";
// gps-offline.js stood in: download() counts its calls and reports tile progress (120 tiles, 20 every
// 400 ms), then keeps the pack exactly where the real one does (hardpan_offline_v1_<key>).
const OFF = "(function(){ window.__dl = []; var O = { status: function () { return null; }, list: function () { return []; },"
    + " prefetchElevations: function () { return Promise.resolve({}); },"
    + " remove: function (k) { localStorage.removeItem('hardpan_offline_v1_' + k); return Promise.resolve(true); },"
    + " download: function (k, o) { window.__dl.push({ key: k, name: o && o.name, card: !!(o && o.card && o.card.data && o.card.data.length) }); return new Promise(function (ok) { var n = 0, t = setInterval(function () { n += 20;"
    + "   if (o.progress) o.progress({ tiles: { tiles: 120, fetched: n, had: 0, failed: 0 } });"
    + "   if (n >= 120) { clearInterval(t); var p = { v: 1, key: k, holes: 18, tiles: new Array(120).fill('t'), tilesOk: true, elevOk: true }; localStorage.setItem('hardpan_offline_v1_' + k, JSON.stringify(p)); ok({ pack: p }); } }, 400); }); } };"
    + " Object.defineProperty(window, 'HardPanGpsOffline', { configurable: true, get: function () { return O; }, set: function () {} }); })();";

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) {} } });
async function open() {
    const j = await openJourney({ db: { events: {}, global_courses: GC, trips: {}, organizers: {}, tournaments: {} },
        viewport: { width: 393, height: 852 }, webgl: true, preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + PHONE + GEO + OFF });
    journeys.push(j);
    try { await j.cdp('Browser.grantPermissions', { permissions: ['geolocation'] }); await j.cdp('Emulation.setGeolocationOverride', HERE); } catch (e) {}
    await j.goto(fileUrl('home.html', ''), 2500);
    await click(j, '[data-hp-act="sgpsdoor"]');
    assert.ok(await until(j, "/admin\\.html/.test(location.pathname) && !!document.getElementById('sf-q')", 30000), 'Course & Tees');
    if (!(await until(j, KEY + " === '" + CK + "'", 8000))) await click(j, '#sf [data-sf-course="' + CK + '"]');
    assert.ok(await until(j, KEY + " === '" + CK + "' && !!document.querySelector('#sf [data-sf-tee]')", 15000), 'the course picked, its tees');
    return j;
}
const ev = (j, x) => j.evaluate(x);
async function until(j, expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 10000)) { try { if (await ev(j, expr)) return true; } catch (e) {} await sleep(150); } return false; }
async function click(j, sel) { assert.ok(await ev(j, '(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.click(); return true;})()'), 'no ' + sel); }
const KEY = "document.getElementById('course-select').value";
const ROW = "JSON.stringify((function(){ var r = document.querySelector('#sf #sf-offline-row'); if (!r) return null; var bs = Array.prototype.map.call(r.querySelectorAll('button'), function (b) { return { t: b.textContent, off: b.disabled, css: b.style.cssText }; });"
    + " var tees = document.querySelector('#sf [data-sf-tee]'), cta = document.querySelector('#sf [data-sf=startgps]');"
    + " return { text: r.innerText.replace(/\\s+/g, ' ').trim(), shown: getComputedStyle(r).display !== 'none' && r.getBoundingClientRect().height > 0, buttons: bs,"
    + "   belowTees: !!(tees && (tees.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING)), cta: cta ? cta.innerText : null, dl: window.__dl }; })())";
const DL = "(function(){ var b = Array.prototype.filter.call(document.querySelectorAll('#sf #sf-offline-row button'), function (x) { return /Download for offline/.test(x.textContent); })[0]; if (!b) return false; b.click(); return true; })()";

test('the GPS door\'s Course & Tees: "⬇ Download for offline" for the picked course, Round Setup\'s own row and style', { timeout: 120000 }, async () => {
    const j = await open();
    assert.ok(await until(j, "!!document.querySelector('#sf #sf-offline-row button')", 15000), 'the offline row');
    const r = JSON.parse(await ev(j, ROW));
    assert.equal(r.shown, true);
    assert.equal(r.text, 'Not downloaded⬇ Download for offline');
    assert.equal(r.belowTees, true, 'under the course\'s tees');
    assert.equal(r.cta, 'Start Round');
    // Round Setup's own button, drawn by its own function: the same style, letter for letter.
    const want = await ev(j, "(function(){ var h = document.createElement('div'); gpsOfflineRow('" + CK + "', { status: 'ready' }, 'x', h); var b = h.querySelector('button'); return b ? b.textContent + '|' + b.style.cssText : null; })()");
    assert.equal(r.buttons[0].t + '|' + r.buttons[0].css, want);
    assert.match(r.buttons[0].css, /border-radius: 999px/);
    try { fs.mkdirSync(SHOTS, { recursive: true }); await j.shot(path.join(SHOTS, 'course-tees-download-chrome.png')); } catch (e) {}
});

test('a tap downloads THIS course once; the count survives a redraw; then "✓ Downloaded for offline" and Delete', { timeout: 120000 }, async () => {
    const j = await open();
    assert.ok(await until(j, "!!document.querySelector('#sf #sf-offline-row button')", 15000));
    assert.ok(await ev(j, DL), 'the Download button');
    assert.ok(await until(j, "/Downloading map/.test((document.getElementById('sf-offline-row')||{}).innerText||'')", 5000), 'the progress count');
    // Mid-download, the screen redraws (another tee tapped): the same row, its count still going.
    const el0 = await ev(j, "window.__row0 = document.getElementById('sf-offline-row'); 1");
    assert.equal(el0, 1);
    await click(j, '#sf [data-sf-tee]:not(.on)');
    await sleep(500);
    const mid = JSON.parse(await ev(j, ROW));
    assert.equal(await ev(j, "document.getElementById('sf-offline-row') === window.__row0"), true, 'the same row after the redraw');
    assert.match(mid.text, /Downloading map… \d+\/120/);
    assert.equal(mid.buttons[0].off, true, 'no second tap while it downloads');
    assert.ok(await until(j, "/Downloaded for offline/.test((document.getElementById('sf-offline-row')||{}).innerText||'')", 8000), 'done');
    const r = JSON.parse(await ev(j, ROW));
    assert.equal(r.text, '✓ Downloaded for offline · 18 holes · 120 map tilesDelete');
    assert.equal(r.dl.length, 1, 'one download');
    assert.equal(r.dl[0].key, CK, 'this course');
    assert.match(r.dl[0].name, /^Test 036 Golf Club/);
    assert.equal(r.dl[0].card, true, 'with its card');
    try { await j.shot(path.join(SHOTS, 'course-tees-downloaded-chrome.png')); } catch (e) {}
    // Delete: back to "Not downloaded".
    await click(j, '#sf #sf-offline-row button');
    assert.ok(await until(j, "/Not downloaded/.test((document.getElementById('sf-offline-row')||{}).innerText||'')", 5000), 'deleted');
    assert.equal(await ev(j, "localStorage.getItem('hardpan_offline_v1_" + CK + "')"), null);
});

test('no signal: "No signal - download it where you have signal", nothing downloaded', { timeout: 120000 }, async () => {
    const j = await open();
    assert.ok(await until(j, "!!document.querySelector('#sf #sf-offline-row button')", 15000));
    await ev(j, "Object.defineProperty(navigator, 'onLine', { configurable: true, get: function () { return false; } }); 1");
    assert.ok(await ev(j, DL));
    await sleep(400);
    const r = JSON.parse(await ev(j, ROW));
    assert.match(r.text, /^No signal - download it where you have signal/);
    assert.deepEqual(r.dl, []);
});

test('URGENT-035 kept: with the row on screen the search box is never redrawn while typing', { timeout: 120000 }, async () => {
    const j = await open();
    assert.ok(await until(j, "!!document.querySelector('#sf #sf-offline-row button')", 15000));
    await ev(j, "window.__q0 = document.getElementById('sf-q'); window.__q0.focus(); 1");
    for (const c of 'Pap') {
        await j.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: c, text: c, unmodifiedText: c });
        await j.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: c });
        await sleep(300);
    }
    await sleep(800);
    const s = JSON.parse(await ev(j, "JSON.stringify({ same: document.getElementById('sf-q') === window.__q0, v: window.__q0.value, focused: document.activeElement === window.__q0 })"));
    assert.deepEqual(s, { same: true, v: 'Pap', focused: true });
});
