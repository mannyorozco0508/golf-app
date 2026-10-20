// 022 PART 3 - THE APPROACH VIEW, IN REAL CHROME (iPhone 15 size, the GPS map, a stand-in GPS that walks).
// A made-up par 4 (366 m, synthetic - no licensed course data) with a fairway bunker pair and water near
// the line short of the green.
//   1  on the tee (366 m): the full hole - no approach;
//   2  walk to 175 yds out, right of the tee line: the approach opens BY ITSELF, turned to the golfer's
//      line (not the tee's), "carry bunker N" / "clear water N" on the map and in the line;
//   3  "⛳ Hole": the full hole, and it stays (walking closer does not reopen it on this hole);
//   4  "⛳ Green" opens it again; far away (off the hole) it never opens by itself.
// Screenshots into SHOTS_022 when set.
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-view.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
global.window = global; require('./gps-geo.js'); const G = window.HardPanGeo;

const CODE = 'APPR22', KEY = 'appr_test', ID = '990000000000000022';
const TEE = [33.4600, -111.9600], MID = G.destination(TEE, 0, 366);
const ME175 = G.destination(MID, 210, 160);
const LINE = G.bearingDeg(ME175, MID);
const P = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
const hole1 = { g: { f: P(G.destination(MID, 180, 14)), c: P(MID), b: P(G.destination(MID, 0, 14)) }, t: { b: P(TEE) },
    z: [['fb', 'L', ...P(G.destination(ME175, LINE - 3, 120))], ['fb', 'L', ...P(G.destination(ME175, LINE - 3, 130))], ['w', 'R', ...P(G.destination(ME175, LINE + 4, 140))]] };
const h = { 1: hole1 };
for (let n = 2; n <= 18; n++) { const t = G.destination(TEE, 90, 400 * (n - 1)); h[n] = { g: { c: P(G.destination(t, 0, 350)) }, t: { b: P(t) } }; }
const GAPI = { v: 1, built: 'test', links: { [KEY]: ID }, courses: { [ID]: { id: ID, club: 'Approach Test Golf Club', course: '', city: 'Phoenix', state: 'AZ', lat: TEE[0], lng: TEE[1], holes: 18, h } } };
const CD = makeCourseData(18).map((x, i) => Object.assign({}, x, i === 0 ? { par: 4 } : {}));
const round = () => {
    const r = wizardSavedRound({ code: CODE, golfers: 1, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Manny'], courseData: CD,
        overrides: { activeCourseKey: KEY, courseName: 'Approach Test Golf Club', groupSizeOverrides: { 0: 1 } } });
    delete r.moneyPool; r.additionalGames = {}; r.additionalGameInstances = {}; return r;
};
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:false,live:false,golfapiFile:'gps-golfapi-test.js',devPro:true});}});})();";
const GEO = "(function(){ var cur = { lat: " + TEE[0] + ", lng: " + TEE[1] + " }, live = {}, n = 1; window.__moveTo = function (la, ln) { cur = { lat: la, lng: ln }; Object.keys(live).forEach(function (id) { live[id](); }); return 'moved'; };"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var id = n++; var f = function () { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 5 }, timestamp: Date.now() }); }; live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; },"
    + " getCurrentPosition: function (ok) { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 5 }, timestamp: Date.now() }); }, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";
const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';'
    + "try{localStorage.setItem('golfapp_me_" + CODE + "','101');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}";
const SHOTS = process.env.SHOTS_022 || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let j;
const ev = (x) => j.evaluate(x);
const ST = "JSON.stringify({ side: HardPanGps.side(), hole: HardPanGps.hole(), view: HardPanGps.screenView(), bearing: Math.round(((window.__mapB || 0))), appr: (document.querySelector('#gps-overlay .gps-map') || {}).getAttribute ? document.querySelector('#gps-overlay .gps-map').getAttribute('data-approach') : null, bearingAttr: document.querySelector('#gps-overlay .gps-map').getAttribute('data-bearing'), labels: Array.prototype.map.call(document.querySelectorAll('#gps-overlay .gps-appr-lbl'), function (e) { return e.textContent; }), btn: (document.querySelector('#gps-overlay .gps-green-view') || {}).textContent || '' })";
const st = async () => JSON.parse(await ev(ST));
const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(2500); await j.shot(path.join(SHOTS, n + '.png')); } };

before(async () => {
    j = await openJourney({ db: { events: { [CODE]: round() }, global_courses: { [KEY]: { name: 'Approach Test Golf Club', data: CD, location: { latitude: TEE[0], longitude: TEE[1], city: 'Phoenix', state: 'AZ' } } }, trips: {}, organizers: {}, tournaments: {} },
        viewport: { width: 393, height: 852 }, webgl: true, preScript: PRE });
    await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 5000);
    await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
    assert.ok(await until("HardPanGps.isMounted() && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-map[data-ready]')", 25000), 'the map');
    await sleep(1500);
});
after(async () => { if (j) await j.close(); });

test('on the tee: the full hole, no approach', { timeout: 60000 }, async () => {
    const s = await st();
    assert.equal(s.hole, 1); assert.notEqual(s.view, 'green');
});

test('175 yds out, right of the tee line: the approach by itself, turned to the golfer\'s line, carry bunker / clear water', { timeout: 60000 }, async () => {
    await ev('__moveTo(' + ME175[0] + ',' + ME175[1] + ')');
    assert.ok(await until("HardPanGps.screenView() === 'green'", 8000), 'the approach opened by itself');
    await sleep(800);
    const s = await st();
    const b = Number(s.bearingAttr), want = Math.round(G.bearingDeg(ME175, MID)), teeLine = Math.round(G.bearingDeg(TEE, MID));
    const diff = (a, c) => Math.abs((((a - c) % 360) + 540) % 360 - 180);
    assert.ok(diff(b, want) <= 2, 'turned to the golfer\'s line: map ' + b + ' want ' + want);
    assert.ok(diff(b, teeLine) > 20, 'not the tee line');
    assert.match(s.appr, /^carry bunker \d+ · clear water \d+$/);
    assert.deepEqual(s.labels.map((t) => t.replace(/\d+/, 'N')), ['carry bunker N', 'clear water N']);
    assert.match(s.btn, /Hole/, 'the button goes back to the hole');
    await shot('approach-175-carries');
});

test('"⛳ Hole": the full hole, and it stays on this hole; "⛳ Green" opens it again', { timeout: 60000 }, async () => {
    await ev("document.querySelector('#gps-overlay .gps-green-view').click()");
    await sleep(500);
    assert.equal((await st()).view, 'hole');
    const closer = G.destination(MID, 210, 110);
    await ev('__moveTo(' + closer[0] + ',' + closer[1] + ')');
    await sleep(2500);
    assert.equal((await st()).view, 'hole', 'did not reopen on this hole');
    await ev("document.querySelector('#gps-overlay .gps-green-view').click()");
    await sleep(500);
    assert.equal((await st()).view, 'green');
    await shot('approach-120');
});

test('far away (off the course): never opens by itself', { timeout: 60000 }, async () => {
    await ev("document.querySelector('#gps-overlay .gps-green-view').click()");   // back to the hole
    await ev("HardPanGps.setHole(2, 4)");
    await sleep(800);
    const away = G.destination(TEE, 180, 3000);
    await ev('__moveTo(' + away[0] + ',' + away[1] + ')');
    await sleep(2500);
    assert.notEqual((await st()).view, 'green');
});
