// ============================================================================
// 023c - THE TEE SHOT AT THE GOLFER'S DRIVER, IN THE FAIRWAY, IN REAL CHROME (iPhone 15 size).
// A made-up GolfAPI-shaped course (no licensed data): hole 1 a straight par 4 (430), hole 2 a
// dogleg left (corner 250, then 170), hole 3 a par 5 (560) with water across the line at 285.
// My bag: Driver 300. The golfer on hole 1's tee; holes 2 and 3 are planned from their tees.
//   1  straight: the target 300 out - "Driver 300", "130 left"
//   2  dogleg: it stops at the corner - "Driver 250", the ring note "lay up 250 · the corner"
//   3  water at 285: "Driver 275" - "lay up 275 · water at 285"
//   4  dragging the target keeps it for that hole (no "Driver" label)
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
const T1 = [33.4607, -111.9608], T2 = at(T1, 90, 5500), T3 = at(T1, 180, 5500);
const G1 = at(T1, 0, 430), D2 = at(T2, 0, 250), G2 = at(D2, 300, 170), G3 = at(T3, 10, 560), W3 = at(T3, 10, 285);
const green = (c, brg) => ({ f: at(c, brg + 180, 12), c, b: at(c, brg, 12) });
const ID = '990000000000000023';
const COURSE = { id: ID, club: 'Synthetic Links', course: '', city: 'Phoenix', state: 'AZ', lat: T1[0], lng: T1[1], holes: 18,
    h: { 1: { t: { b: T1 }, g: green(G1, 0) }, 2: { t: { b: T2 }, d: D2, g: green(G2, 300) }, 3: { t: { b: T3 }, g: green(G3, 10), z: [['w', 'C', W3[0], W3[1]]] } } };
const GAPI = { v: 1, built: 'test', courses: { [ID]: COURSE }, links: { synthetic_links: ID } };
const CODE = 'TEE023';
const pars = [4, 4, 5].concat(new Array(15).fill(4));
const r = wizardSavedRound({ code: CODE, golfers: 1, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Manny'],
    overrides: { activeCourseKey: 'synthetic_links', courseName: 'Synthetic Links', groupSizeOverrides: { 0: 1 },
        courseData: pars.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: i + 1 })) } });
delete r.moneyPool; r.additionalGames = {}; r.additionalGameInstances = {}; r.sideMatches = {}; r.scores = {};
const DB = { events: { [CODE]: r }, global_courses: { synthetic_links: { name: 'Synthetic Links', data: r.courseData, location: { latitude: T1[0], longitude: T1[1], city: 'Phoenix', state: 'AZ' } } }, trips: {}, organizers: {}, tournaments: {} };
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{liveTest:true,devPro:true,features:Object.assign({},v&&v.features,{bagAltitude:false})});}});})();"
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
    assert.match(s.to, /^Driver 30\d$/, JSON.stringify(s));
    assert.match(s.on, /^1[23]\d( left)?$/, JSON.stringify(s)); assert.equal(await ev("document.querySelector('#gps-overlay .gps-pill-on').getAttribute('data-u')"), 'y left');
});
test('dogleg left: the drive stops at the corner - "Driver 250", "lay up 250 · the corner"', { timeout: 60000 }, async () => {
    const s = await hole(2);
    assert.match(s.to, /^Driver 2[45]\d$/, JSON.stringify(s));
    assert.match(s.note, /^lay up 2[45]\d · the corner$/, JSON.stringify(s));
});
test('par 5 with water at 285: "Driver 275", "lay up 275 · water at 285"', { timeout: 60000 }, async () => {
    const s = await hole(3);
    assert.match(s.to, /^Driver 27\d$/, JSON.stringify(s));
    assert.match(s.note, /^lay up 27\d · water at 28\d$/, JSON.stringify(s));
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
