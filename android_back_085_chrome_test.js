// ============================================================================
// ANDROID BACK OVER 085's "RESUME OR NEW ROUND?" ASK, IN REAL CHROME (android-2.0, the add-on port)
//   085: with a round IN PROGRESS, Home's Start round asks once - "Resume your round at <course>, or start a
//   new round?" [Resume] [New round] - in its own sheet (#hs-ask85), not the app's ui-sheet. Before this
//   port's fix no Back probe saw it: Back on Home Main minimised the app with the ask still up.
//   Now one Back press is a tap outside: the ask closes, Home stays, nothing is resumed or started, and
//   Start round asks again (Back is never "New round").
//   Reached the way a user does: Home, tap Start round, then the hardware key - fired through the App
//   plugin's backButton listener that front-door.js arms in the Android shell. Capacitor says "android";
//   nothing else native is faked. Stub database only (tools/lib/journey.js).
//   WHAT THIS CANNOT PROVE: a real WebView's key routing. That is the emulator pass.
//   COUNTS (final file, on android-2.0-addons 80d6cd56 + this fix): 2 tests, 2 pass.
//   Control, restored by sha from a saved copy: front-door.js without the 'start-ask' row -> 1 pass / 1 fail.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-round.js'))) { console.log('Consumer tree: no GPS Home - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
const { makeCourseData } = require('./helpers/fixtures.js');

// The 085 test's synthetic Arizona CC and its in-progress round (urgent085_start_round_chrome_test.js).
const CD = makeCourseData(18);
const AZ_ID = '012141520640060450343', AZ_KEY = 'gapi_' + AZ_ID, AZ_NAME = 'The Arizona Country Club (The Arizona)';
const AZ_REC = { name: AZ_NAME, data: CD, location: { city: 'Phoenix', state: 'AZ', latitude: 33.4806, longitude: -111.9599 }, source: { provider: 'golfapi', providerCourseId: AZ_ID } };
const hole = (i) => ({ t: { b: [33.4814 + i * 0.0004, -111.9580 + i * 0.0003] }, g: { c: [33.4836 + i * 0.0004, -111.9537 + i * 0.0003] } });
const AZ_GPS = { id: AZ_ID, club: 'The Arizona Country Club', course: 'The Arizona', city: 'Phoenix', state: 'AZ', lat: 33.4806, lng: -111.9599, holes: 18, h: {} };
for (let i = 1; i <= 18; i++) AZ_GPS.h[i] = hole(i - 1);
const AT_AZ = [33.4814, -111.9580];
const OLD = 'T85AZC';
const DB = { events: { [OLD]: { courseName: AZ_NAME, activeCourseKey: AZ_KEY, courseData: CD, players: [{ id: 1, name: 'Test Golfer', hcp: '' }] } },
    global_courses: { [AZ_KEY]: AZ_REC }, gps_courses: { [AZ_ID]: AZ_GPS }, gps_links: {}, trips: {}, tournaments: {}, organizers: {} };
const SEED = { hardpan_last_round: { code: OLD, at: Date.now(), course: AZ_NAME } };
function platform(p) {
    return 'window.__BACK = []; window.__MIN = 0; window.Capacitor = { getPlatform: function () { return ' + JSON.stringify(p) + '; }, isNativePlatform: function () { return true; }, '
        + 'Plugins: { App: { addListener: function (n, fn) { if (n === "backButton") window.__BACK.push(fn); return Promise.resolve({ remove: function () {} }); }, '
        + 'minimizeApp: function () { window.__MIN++; }, getLaunchUrl: function () { return Promise.resolve(undefined); } } } };';
}
const PRE = (p) => platform(p) + 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true })
    + "try{ if (!sessionStorage.getItem('b85_seeded')) { sessionStorage.setItem('b85_seeded','1'); var s=" + JSON.stringify(SEED) + "; Object.keys(s).forEach(function(k){ localStorage.setItem(k, JSON.stringify(s[k])); }); } }catch(e){}";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) { } } });
async function home(p) {
    const j = await openJourney({ db: JSON.parse(JSON.stringify(DB)), viewport: { width: 393, height: 852 }, preScript: PRE(p) });
    journeys.push(j);
    await j.cdp('Emulation.setGeolocationOverride', { latitude: AT_AZ[0], longitude: AT_AZ[1], accuracy: 10 });
    await j.cdp('Browser.grantPermissions', { permissions: ['geolocation'] });
    await j.goto(fileUrl('home.html'), 2000);
    return j;
}
async function until(j, expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 10000)) { try { if (await j.evaluate(expr)) return true; } catch (e) { } await sleep(150); } return false; }
const ASK_UP = "(function(){ var a=document.getElementById('hs-ask85'); return !!a && a.style.display !== 'none'; })()";
const press = (j) => j.evaluate('(function(){ window.__BACK.forEach(function (f) { f({ canGoBack: false }); }); return window.__BACK.length; })()');
const STATE = "JSON.stringify({ page: location.pathname.split('/').pop(), q: location.search, min: window.__MIN, ask: " + ASK_UP + ","
    + " sf: !!document.getElementById('sf') && getComputedStyle(document.getElementById('sf')).display !== 'none', from: sessionStorage.getItem('hardpan_change_from') })";
const state = async (j) => JSON.parse(await j.evaluate(STATE));

test('ANDROID 085: Back on "Resume or new round?" closes it like a tap outside - Home stays, nothing resumed or started; Start round asks again', { timeout: 150000 }, async () => {
    const j = await home('android');
    assert.ok(await until(j, "document.querySelectorAll('#hs-progress .hs-prog').length === 1", 15000), 'IN PROGRESS is on Home');
    assert.ok(await j.tap('#hs-gps [data-hp-act="sgpsdoor"]'), 'Start round');
    assert.ok(await until(j, ASK_UP, 6000), 'the Resume-or-new ask is up');
    assert.match(await j.evaluate("document.getElementById('hs-ask85').innerText"), /Resume your round at The Arizona Country Club/);
    assert.ok(await press(j) >= 1, 'front-door.js armed the hardware Back listener');
    await sleep(1500);
    const s = await state(j);
    assert.equal(s.ask, false, 'one Back closes the ask: ' + JSON.stringify(s));
    assert.equal(s.page, 'home.html', 'still on Home (not the round, not the course screen)');
    assert.equal(s.sf, false, 'no new-round screen');
    assert.equal(s.from, null, '"New round" was not chosen (it sets hardpan_change_from)');
    assert.equal(s.min, 0, 'the app was not minimised with the ask up');
    assert.ok(await j.tap('#hs-gps [data-hp-act="sgpsdoor"]'), 'Start round again');
    assert.ok(await until(j, ASK_UP, 6000), 'it asks again: Back answered nothing');
});

test('Android only: off Android there is no hardware Back - the ask works as 085 shipped it (a tap outside closes it)', { timeout: 150000 }, async () => {
    const j = await home('ios');
    assert.ok(await until(j, "document.querySelectorAll('#hs-progress .hs-prog').length === 1", 15000), 'IN PROGRESS is on Home');
    assert.ok(await j.tap('#hs-gps [data-hp-act="sgpsdoor"]'), 'Start round');
    assert.ok(await until(j, ASK_UP, 6000), 'the ask is up on iOS too (positive control)');
    assert.equal(await j.evaluate('window.__BACK.length'), 0, 'no Back listener armed off Android');
    assert.ok(await j.tap('#hs-ask85'), 'tap outside the sheet');
    await sleep(800);
    const s = await state(j);
    assert.equal(s.ask, false); assert.equal(s.page, 'home.html'); assert.equal(s.from, null);
});
