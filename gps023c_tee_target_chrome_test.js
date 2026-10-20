// ============================================================================
// 023c - THE TEE SHOT AT THE GOLFER'S DRIVER, IN THE FAIRWAY, IN REAL CHROME (iPhone 15 size).
// A made-up GolfAPI-shaped course (no licensed data): hole 1 a straight par 4 (430), hole 2 a
// dogleg left (corner 250, then 170), hole 3 a par 5 (560) with water across the line at 285.
// My bag: Driver 300. The golfer on hole 1's tee; holes 2 and 3 are planned from their tees.
//   1  straight: the target 300 out - "Driver 300", "130 left"
//   2  dogleg: it stops at the corner - "Driver 250", the ring note "lay up 250 · the corner"
//   3  water at 285: "Driver 275" - "lay up 275 · water at 285"
//   4  dragging the target keeps it for that hole (no "Driver" label)
// URGENT-026: the driver counts only where the hole has PATH DATA - holes 1 and 3 carry GolfAPI's
// fairway point (`d`, on the line), hole 2 its dogleg point. Hole 4 has NONE (a tee and a green):
//   5  the straight line and the pre-023c default, 260 - never the 300 driver
//   6  "Save this line for this hole?" (features.lineSave forced ON here; it ships off) after a
//      drag on hole 4: a tap writes course_gps/<key>/lines/h4 { pts tee -> target -> green, at, ev }
//      to the STUB database, and the target then follows the saved line.
// Screenshots into ~/Desktop/claude-code-reports/022/tee-target/ when SHOTS_023C is set.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-view.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
global.window = global; require('./gps-geo.js'); const G = window.HardPanGeo;
const YD = G.M_PER_YD, at = (p, b, yd) => G.destination(p, b, yd * YD);
const SHOTS = process.env.SHOTS_023C || '';

// Three holes, 5 km apart (the golfer stands on hole 1's tee only).
const T1 = [33.4607, -111.9608], T2 = at(T1, 90, 5500), T3 = at(T1, 180, 5500), T4 = at(T1, 270, 5500);
const G1 = at(T1, 0, 430), D2 = at(T2, 0, 250), G2 = at(D2, 300, 170), G3 = at(T3, 10, 560), W3 = at(T3, 10, 285), G4 = at(T4, 0, 430);
const D1 = at(T1, 0, 240), D3 = at(T3, 10, 220);
const green = (c, brg) => ({ f: at(c, brg + 180, 12), c, b: at(c, brg, 12) });
const ID = '990000000000000023';
const COURSE = { id: ID, club: 'Synthetic Links', course: '', city: 'Phoenix', state: 'AZ', lat: T1[0], lng: T1[1], holes: 18,
    h: { 1: { t: { b: T1 }, d: D1, g: green(G1, 0) }, 2: { t: { b: T2 }, d: D2, g: green(G2, 300) }, 3: { t: { b: T3 }, d: D3, g: green(G3, 10), z: [['w', 'C', W3[0], W3[1]]] },
        4: { t: { b: T4 }, g: green(G4, 0) } } };
const GAPI = { v: 1, built: 'test', courses: { [ID]: COURSE }, links: { synthetic_links: ID } };
const CODE = 'TEE023';
const pars = [4, 4, 5].concat(new Array(15).fill(4));
const r = wizardSavedRound({ code: CODE, golfers: 1, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Manny'],
    overrides: { activeCourseKey: 'synthetic_links', courseName: 'Synthetic Links', groupSizeOverrides: { 0: 1 },
        courseData: pars.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: i + 1 })) } });
delete r.moneyPool; r.additionalGames = {}; r.additionalGameInstances = {}; r.sideMatches = {}; r.scores = {};
const DB = { events: { [CODE]: r }, global_courses: { synthetic_links: { name: 'Synthetic Links', data: r.courseData, location: { latitude: T1[0], longitude: T1[1], city: 'Phoenix', state: 'AZ' } } }, trips: {}, organizers: {}, tournaments: {} };
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{liveTest:true,devPro:true,features:Object.assign({},v&&v.features,{bagAltitude:false,lineSave:true})});}});})();"
    + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';';
const GEO = "(function(){ try { Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:function(ok){ var f=function(){ok({coords:{latitude:" + T1[0] + ",longitude:" + T1[1] + ",accuracy:5},timestamp:Date.now()});}; setTimeout(f,50); var t=setInterval(f,1000); return t;}, getCurrentPosition:function(ok){ok({coords:{latitude:" + T1[0] + ",longitude:" + T1[1] + ",accuracy:5},timestamp:Date.now()});}, clearWatch:function(t){clearInterval(t);}}}); } catch(e){} })();";
const BAG = "try{localStorage.setItem('hardpan_bag_v1', JSON.stringify({ v: 1, golfers: { 'n:manny': { shots: {}, set: { Dr: 300 } }, me: { shots: {}, set: { Dr: 300 } } } }));}catch(e){}";
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const READ = "JSON.stringify({ hole: HardPanGps.hole(), to: (document.querySelector('#gps-overlay .gps-pill-to')||{}).textContent||'', on: (document.querySelector('#gps-overlay .gps-pill-on')||{}).textContent||'', note: (document.querySelector('#gps-overlay .gps-ring-lbl')||{}).textContent||'' })";

let j;
const ev = (x) => j.evaluate(x);
async function until(x, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(x)) return true; } catch (e) {} await sleep(250); } return false; }
async function hole(n) {
    await ev('HardPanGps.setHole(' + n + ')');
    await until("/Driver|left/.test(((document.querySelector('#gps-overlay .gps-pill-to')||{}).textContent||'') + ((document.querySelector('#gps-overlay .gps-pill-on')||{}).textContent||''))", 12000);
    await sleep(1500);
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await j.shot(path.join(SHOTS, 'hole' + n + '.png')); }
    return JSON.parse(await ev(READ));
}
before(async () => {
    j = await openJourney({ db: DB, viewport: { width: 393, height: 852 }, webgl: true,
        preScript: 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO + BAG
            + "try{localStorage.setItem('golfapp_me_" + CODE + "','101');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}" });
    await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1&me=101'), 3000);
    assert.ok(await until("window.HardPanGps && HardPanGps.isMounted && HardPanGps.isMounted() && HardPanGps.side() === 'gps'", 20000), 'the map opened');
});
after(async () => { if (j) await j.close(); });

test('straight par 4: the tee shot is the driver, 300 out - "Driver 300", "130 left"', { timeout: 60000 }, async () => {
    const s = await hole(1);
    // URGENT-025 (Manny: "Too busy"): the bubbles are the number only; the POSITION is still the driver.
    assert.match(s.to, /^30\d$/, JSON.stringify(s));
    assert.match(s.on, /^1[23]\d$/, JSON.stringify(s)); assert.equal(await ev("document.querySelector('#gps-overlay .gps-pill-on').getAttribute('data-u')"), 'y');
    assert.equal(s.note, '20 yd', 'no lay-up note on the ring');
});
test('dogleg left: the drive stops at the corner - "Driver 250", "lay up 250 · the corner"', { timeout: 60000 }, async () => {
    const s = await hole(2);
    assert.match(s.to, /^2[45]\d$/, JSON.stringify(s));   // stops at the corner (position), no label
    assert.equal(s.note, '20 yd', JSON.stringify(s));
});
test('par 5 with water at 285: "Driver 275", "lay up 275 · water at 285"', { timeout: 60000 }, async () => {
    const s = await hole(3);
    assert.match(s.to, /^27\d$/, JSON.stringify(s));   // stops short of the water (position), no label
    assert.equal(s.note, '20 yd', JSON.stringify(s));
});
test('a dragged target is kept for the hole (no "Driver" label)', { timeout: 60000 }, async () => {
    await ev("(function(){ var m=document.querySelector('#gps-overlay .gps-map'); return 1; })()");
    await ev('HardPanGps.setHole(1)'); await sleep(1500);
    // A tap on the map moves the target (the drag's own path).
    const box = JSON.parse(await ev("JSON.stringify(document.querySelector('#gps-overlay .gps-map').getBoundingClientRect())"));
    for (const type of ['mousePressed', 'mouseReleased']) await j.cdp('Input.dispatchMouseEvent', { type, x: Math.round(box.x + box.width * 0.3), y: Math.round(box.y + box.height * 0.45), button: 'left', clickCount: 1 });
    await sleep(1500);
    const s = JSON.parse(await ev(READ));
    assert.doesNotMatch(s.to, /Driver/, JSON.stringify(s));
});
test('URGENT-026 no path data (hole 4: a tee and a green): the straight line, the pre-023c 260 - never the driver', { timeout: 60000 }, async () => {
    await ev('HardPanGps.setHole(4)');
    await until("/\\d/.test((document.querySelector('#gps-overlay .gps-pill-to')||{}).textContent||'')", 12000); await sleep(1500);
    const s = JSON.parse(await ev(READ));
    assert.match(s.to, /^26\d$/, JSON.stringify(s));
    const tt = JSON.parse(await ev('JSON.stringify(HardPanGps.teeTargets())')).find((h) => h.n === 4);
    assert.deepEqual([tt.data, tt.fw, tt.saved], [false, 0, false], JSON.stringify(tt));
    assert.equal(await ev("getComputedStyle(document.querySelector('#gps-overlay .gps-saveline')).display"), 'none', 'no button before a drag');
});
test('URGENT-026 "Save this line" (hole 4, switch forced on): after a drag, one tap saves tee -> target -> green; the target follows it', { timeout: 60000 }, async () => {
    const box = JSON.parse(await ev("JSON.stringify(document.querySelector('#gps-overlay .gps-map').getBoundingClientRect())"));
    for (const type of ['mousePressed', 'mouseReleased']) await j.cdp('Input.dispatchMouseEvent', { type, x: Math.round(box.x + box.width * 0.3), y: Math.round(box.y + box.height * 0.5), button: 'left', clickCount: 1 });
    await sleep(1200);
    const moved = JSON.parse(await ev("JSON.stringify(HardPanGps.target ? HardPanGps.target() : null)"));
    assert.ok(await until("getComputedStyle(document.querySelector('#gps-overlay .gps-saveline')).display !== 'none'", 5000), 'the button shows after the drag');
    assert.equal(await ev("document.querySelector('#gps-overlay .gps-saveline-yes').textContent"), 'Save this line for this hole?');
    if (SHOTS) await j.shot(path.join(SHOTS, 'hole4-save-line.png'));
    await ev("document.querySelector('#gps-overlay .gps-saveline-yes').click()");
    await sleep(1500);
    const saved = JSON.parse(await ev("new Promise(function(res){ firebase.database().ref('course_gps/synthetic_links/lines/h4').once('value').then(function(s){ res(JSON.stringify(s.val())); }, function(e){ res(JSON.stringify({ err: String(e) })); }); })"));
    assert.ok(saved && Array.isArray(saved.pts) && saved.pts.length === 3, JSON.stringify(saved));
    assert.equal(saved.ev, CODE);
    assert.ok(G.haversineMeters(saved.pts[0], T4) < 2 && G.haversineMeters(saved.pts[2], G4) < 2, 'tee ... green');
    if (moved) assert.ok(G.haversineMeters(saved.pts[1], moved) < 2, 'the bend is the dragged target');
    assert.equal(await ev("getComputedStyle(document.querySelector('#gps-overlay .gps-saveline')).display"), 'none', 'gone once saved');
    const tt = JSON.parse(await ev('JSON.stringify(HardPanGps.teeTargets())')).find((h) => h.n === 4);
    assert.deepEqual([tt.data, tt.saved], [true, true], JSON.stringify(tt));
});
