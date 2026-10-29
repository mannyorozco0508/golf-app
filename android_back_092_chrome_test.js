// ============================================================================
// ANDROID BACK OVER 092's COMBO CARD, IN REAL CHROME (Android job 102, the iOS 101 catch-up).
//   The map's Card button opens the combo card (#hp-compact-card) as a sheet over the map. Before
//   this job no Back probe saw it: one press ran the round's own Back (map -> previous screen /
//   Round Menu) with the card left floating. Now (gps-round.js, Android only, priority 3):
//     1  Back with the card up closes the card (= a tap on the map above it); the map stays.
//     2  More › (today's Enter score sheet over the card): Back closes that sheet first, the card
//        stays; the next Back closes the card.
//     3  iOS ('ios' platform): no hp-compact-card probe is registered (iOS has no back button).
//   Back is pressed the way the hardware key arrives (the App plugin's backButton listener that
//   pwa-boot.js arms in the Android shell). Stub database only: nothing leaves the machine.
//   WHAT THIS CANNOT PROVE: a real WebView's key routing. That is the emulator pass.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-round.js'))) { console.log('Consumer tree: no simple-flow round - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const NAMES = ['Skeens Test', 'Bob Test', 'Manny Test', 'Paul Test'];
const round = (code) => {
    const r = wizardSavedRound({ code, golfers: 4, ownerUid: 'anon-cold', thru: 0, flights: false, names: NAMES,
        overrides: { activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', groupSizeOverrides: { 0: 4 } } });
    delete r.moneyPool; r.additionalGames = {}; r.additionalGameInstances = {}; r.sideMatches = {}; r.scores = {};
    return r;
};
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,devPro:true});}});})();";
const GEO = "(function(){ try { Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:function(ok){ var f=function(){ok({coords:{latitude:33.4528,longitude:-79.1547,accuracy:5},timestamp:Date.now()});}; setTimeout(f,50); return 1; }, clearWatch:function(){}, getCurrentPosition:function(ok){ ok({coords:{latitude:33.4528,longitude:-79.1547,accuracy:5},timestamp:Date.now()}); }}}); } catch (e) {} })();";
function platform(p) {
    return 'window.__BACK = []; window.Capacitor = { getPlatform: function () { return ' + JSON.stringify(p) + '; }, isNativePlatform: function () { return true; }, '
        + 'Plugins: { App: { addListener: function (n, fn) { if (n === "backButton") window.__BACK.push(fn); return Promise.resolve({ remove: function () {} }); }, '
        + 'minimizeApp: function () {}, getLaunchUrl: function () { return Promise.resolve(undefined); } } } };';
}
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) { } } });
async function start(p, code) {
    const me = '103';
    const pre = platform(p) + 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO
        + "try{localStorage.setItem('golfapp_me_" + code + "','" + me + "');sessionStorage.setItem('groupPickDismissed:" + code + "','1');"
        + "localStorage.setItem('hardpan_round_side','gps|" + code + "');}catch(e){}";
    const j = await openJourney({ db: { events: { [code]: round(code) }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} }, viewport: { width: 402, height: 874 }, webgl: true, preScript: pre });
    journeys.push(j);
    await j.goto(fileUrl('index.html', 'game=' + code + '&group=1&me=' + me), 300);
    const ev = (x) => j.evaluate(x);
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) { if (await ev("!!(window.HardPanGps && HardPanGps.side && HardPanGps.side() === 'gps' && document.querySelector('#gps-overlay .gps-side-bets'))")) break; await sleep(250); }
    await sleep(800);
    const click = async (sel) => { assert.ok(await ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.click(); return true;})()'), 'no ' + sel); await sleep(300); };
    const press = async () => { await ev('(function(){ window.__BACK.forEach(function (f) { f({ canGoBack: false }); }); return 1; })()'); await sleep(300); };
    const st = async () => JSON.parse(await ev("JSON.stringify({ card: HardPanRound.compactCardOpen(), side: HardPanGps.side(),"
        + " score: (function(){ var w=document.getElementById('hp-score-sheet'); return !!(w && w.style.display !== 'none'); })(),"
        + " menu: HardPanRound.sheetKind(), probes: window.GolfBack ? GolfBack.probes() : [] })"));
    return { ev, click, press, st };
}

test('ANDROID 092: Back closes the combo card (map stays); over More ›, the Enter score sheet first', { timeout: 120000 }, async () => {
    const { click, press, st } = await start('android', 'TB092A');
    await click('#gps-overlay .gps-side-bets');
    let s = await st();
    assert.equal(s.card, true, 'Card opened the combo card');
    assert.ok(s.probes.indexOf('hp-compact-card') >= 0, 'probe registered on Android: ' + s.probes.join(','));
    await press();
    s = await st();
    assert.deepEqual([s.card, s.side, s.menu], [false, 'gps', null], 'Back = the card closes, the map stays, no Round Menu: ' + JSON.stringify(s));
    await click('#gps-overlay .gps-side-bets');
    await click('#hp-compact-card [data-cc-moresheet]');
    s = await st();
    assert.deepEqual([s.card, s.score], [true, true], 'More › opened Enter score over the card: ' + JSON.stringify(s));
    await press();
    s = await st();
    assert.deepEqual([s.score, s.card], [false, true], 'Back #1 = the Enter score sheet only: ' + JSON.stringify(s));
    await press();
    s = await st();
    assert.deepEqual([s.card, s.side, s.menu], [false, 'gps', null], 'Back #2 = the card: ' + JSON.stringify(s));
});

test('iOS: no hp-compact-card Back probe (iOS has no back button)', { timeout: 120000 }, async () => {
    const { st } = await start('ios', 'TB092I');
    const s = await st();
    assert.equal(s.probes.indexOf('hp-compact-card'), -1, s.probes.join(','));
});
