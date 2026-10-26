// ============================================================================
// ANDROID BACK OVER THE 071b / 073 ADD-ONS, IN REAL CHROME (android-2.0, the add-on port)
//   The add-ons brought three new things that sit on top of a page:
//     073   End round - don't save: the app's own "Are you sure?" (ui-dialogs.js #ui-sheet)
//     071b  + Bet on a stand-in card: the pars sheet (#hp-pars), OVER the bet sheet
//     071b  Start Round on a stand-in card: the pars sheet (#sf-pars), inside the new-round flow
//   One Back press must close the top one the way its own cancel does - "Keep playing", "Not now" -
//   never the sheet under it, never yes. Before this port's fix, Back with the + Bet pars sheet up
//   stepped the bet sheet underneath (gps-bet.js's hp-bet probe is registered before front-door.js's),
//   and Back with the End round ask up was not seen by any probe at all.
//   Back is pressed the way the hardware key arrives: the App plugin's backButton listener, which
//   pwa-boot.js arms in the Android shell. Capacitor says "android"; nothing else native is faked.
//   Stub database only (tools/lib/journey.js): nothing leaves the machine.
//   WHAT THIS CANNOT PROVE: a real WebView's key routing. That is the emulator pass.
//   The End round case is reached with taps and Back only (Back on the round opens the Round Menu).
//   The + Bet case opens the bet sheet with HardPanBet.open(), as urgent071b_bet_pars_chrome_test.js
//   does - the + Bet button sits on the GPS map; the emulator pass taps it.
//   (#sf-pars is covered in android_back_sheets_test.js; its Chrome path needs an OSM stand-in pick.)
//   COUNTS (final file, android-2.0-addons = 45f853ed + merge of tfnew-071b 9176e88e): 3 tests, 3 pass.
//   Controls, each restored by sha from a saved copy: front-door.js without the 'confirm' row -> 2 pass /
//   1 fail (073); gps-bet.js without the hp-pars probe -> 2 / 1 (071b); hp-pars registered off Android
//   too -> 2 / 1 (iOS). First run, hp-pars at priority 0 (filed last by pwa-boot): 2 / 1 (071b).
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-round.js'))) { console.log('Consumer tree: no Round Menu - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAND_IN = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
function round(code, opts) {
    const r = wizardSavedRound(Object.assign({ code, ownerUid: 'anon-cold', flights: false }, opts));
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    return r;
}
function endRound() {
    const r = round('BACK73', { golfers: 2, thru: 3, names: ['Ray Ortiz', 'Dan Kim'], overrides: { activeCourseKey: 'papago', courseName: 'Papago Golf Club' } });
    delete r.sideMatches;
    return r;
}
function parsRound() {
    const r = round('BACK71', { golfers: 2, thru: 0, names: ['Glenn Green', 'Marty Moss'], hcps: [12, 4], courseData: JSON.parse(JSON.stringify(STAND_IN)),
        overrides: { activeCourseKey: 'osm_w1540940976', courseName: 'Shortys' } });
    delete r.sideMatches;
    return r;
}
// The platform before any page script: Android, and an App plugin whose backButton listeners the
// test can fire - exactly what the hardware key does in the shell.
function platform(p) {
    return 'window.__BACK = []; window.__MIN = 0; window.Capacitor = { getPlatform: function () { return ' + JSON.stringify(p) + '; }, isNativePlatform: function () { return true; }, '
        + 'Plugins: { App: { addListener: function (n, fn) { if (n === "backButton") window.__BACK.push(fn); return Promise.resolve({ remove: function () {} }); }, '
        + 'minimizeApp: function () { window.__MIN++; }, getLaunchUrl: function () { return Promise.resolve(undefined); } } } };';
}
const PRE = (p, code) => platform(p) + 'window.__hardpanDoors = true;' + iapStub({ active: true })
    + "try{localStorage.setItem('golfapp_me_" + code + "','101');sessionStorage.setItem('groupPickDismissed:" + code + "','1');}catch(e){}";
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) { } } });
async function open(p, code, ev0) {
    const j = await openJourney({ db: { events: { [code]: ev0 }, '.info': { connected: true }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} },
        viewport: { width: 393, height: 852 }, webgl: true, preScript: PRE(p, code) });
    journeys.push(j);
    return j;
}
const press = (j) => j.evaluate('(function(){ window.__BACK.forEach(function (f) { f({ canGoBack: false }); }); return window.__BACK.length; })()');
// What is on top, read from the DOM only.
const STATE = "JSON.stringify({ menu: !!(document.getElementById('hp-sheet') && document.getElementById('hp-sheet').classList.contains('open')),"
    + " ask: !!(document.getElementById('ui-sheet') && document.getElementById('ui-sheet').classList.contains('open')),"
    + " askTitle: (document.querySelector('#ui-sheet .ui-sheet-title') || {}).textContent || '',"
    + " pars: !!(document.getElementById('hp-pars') && document.getElementById('hp-pars').style.display !== 'none' && document.getElementById('hp-pars-t')),"
    + " bet: !!(document.getElementById('hp-bet') && document.getElementById('hp-bet').classList.contains('open')),"
    + " page: location.pathname.split('/').pop(), min: window.__MIN })";
const state = async (j) => JSON.parse(await j.evaluate(STATE));

test('ANDROID 073: Back on the round opens the Round Menu; End round asks; Back = "Keep playing" (round kept, nothing else closed)', { timeout: 120000 }, async () => {
    const j = await open('android', 'BACK73', endRound());
    await j.goto(fileUrl('index.html', 'game=BACK73'), 4500);
    assert.ok(await press(j) >= 1, 'pwa-boot armed the hardware Back listener');
    await sleep(400);
    let s = await state(j);
    assert.equal(s.menu, true, 'Back on the round opens the Round Menu: ' + JSON.stringify(s));
    assert.ok(await j.tap('#hp-sheet [data-hs=end-round]'), 'the organizer has the End round row');
    await sleep(500);
    s = await state(j);
    assert.equal(s.ask, true); assert.equal(s.askTitle, 'End this round and delete it?');
    await press(j); await sleep(500);
    s = await state(j);
    assert.equal(s.ask, false, 'one Back closes the ask');
    assert.equal(s.menu, false, '...and only the ask (the menu had closed itself before asking)');
    assert.equal(s.page, 'index.html'); assert.equal(s.min, 0, 'still in the round, app not minimised');
    const db = await j.harvest();
    assert.ok(db.events.BACK73 && db.events.BACK73.players, 'the round is still in the database - Back is never "Delete round"');
    assert.ok(!db.events.BACK73.endedByOrganizer, 'nothing written');
});

test('ANDROID 071b: Back over the + Bet pars sheet is its "Not now" - no bet, and the bet sheet does not step back under it', { timeout: 120000 }, async () => {
    const j = await open('android', 'BACK71', parsRound());
    await j.goto(fileUrl('index.html', 'game=BACK71&group=1'), 4500);
    await j.evaluate("HardPanBet.open('match', { mode: '1v1' }), 1"); await sleep(400);
    for (const sel of ['#hp-bet [data-hb-pick="101"]', '#hp-bet [data-hb-pick="102"]', '#hp-bet [data-hb="next"]', '#hp-bet [data-hb-stake="10"]', '#hp-bet [data-hb-scoring="net"]', '#hp-bet [data-hb="start"]']) {
        assert.ok(await j.tap(sel), 'tap ' + sel); await sleep(300);
    }
    await sleep(600);
    let s = await state(j);
    assert.equal(s.pars, true, 'the pars sheet is up: ' + JSON.stringify(s));
    await press(j); await sleep(600);
    s = await state(j);
    assert.equal(s.pars, false, 'one Back closes the pars sheet');
    assert.equal(s.bet, false, '"Not now" = no bet: the bet sheet goes with it, as the button does');
    assert.equal(s.min, 0);
    const db = await j.harvest();
    assert.equal(Object.keys((db.events.BACK71 || {}).sideMatches || {}).length, 0, 'no bet written');
    assert.equal(JSON.stringify(db.events.BACK71.courseData.map((h) => h.par)), JSON.stringify(STAND_IN.map((h) => h.par)), 'card untouched');
});

test('iOS UNCHANGED: gps-bet.js registers no hp-pars Back probe off Android', { timeout: 120000 }, async () => {
    const j = await open('ios', 'BACK71', parsRound());
    await j.goto(fileUrl('index.html', 'game=BACK71&group=1'), 4500);
    const probes = JSON.parse(await j.evaluate('JSON.stringify(window.GolfBack ? GolfBack.probes() : null)'));
    assert.ok(Array.isArray(probes) && probes.indexOf('hp-bet') !== -1, 'the bet sheet\'s own probe is there (positive control): ' + JSON.stringify(probes));
    assert.equal(probes.indexOf('hp-pars'), -1);
});
