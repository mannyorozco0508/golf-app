// ============================================================================
// URGENT-045 #1 - AUTO-ADVANCE HOLES, WALKED IN REAL CHROME (393x852 and 375x667).
// The PHONE's GPS rules (GolfAPI only, liveTest), a made-up GolfAPI-shaped course (no licensed
// data): hole 1 a par 4 north, hole 2's tee 60 yds east of green 1. A stand-in GPS reports where
// the golfer is once a second (window.__moveTo walks them).
//   1  hole 1's fairway, then its green: no switch;
//   2  hole 2's tee (~10 s): GPS on hole 2, the "Hole 2 →" toast with Undo, the score sheet for
//      HOLE 1 (no score yet) over the map - "An earlier hole - Save goes back to hole 2";
//   3  Undo: back on hole 1, and standing on hole 2's tee does NOT switch again (2-min hold);
//   4  a score for hole 1 already in: the switch happens, no sheet;
//   5  PRIVACY: no coordinate of the walk is in localStorage, sessionStorage or the database.
// Screenshots into $SHOTS_045AA (if set).
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-view.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
global.window = global; require('./gps-geo.js'); const G = window.HardPanGeo;
const YD = G.M_PER_YD, at = (p, b, yd) => G.destination(p, b, yd * YD);
const SHOTS = process.env.SHOTS_045AA || '';

const T1 = [33.4607, -111.9608], G1 = at(T1, 0, 400), T2 = at(G1, 90, 60), G2 = at(T2, 90, 380), T3 = at(G2, 0, 50), G3 = at(T3, 0, 170);
const FW1 = at(T1, 10, 200), OFF_T2 = at(T2, 30, 3);
const green = (c, brg) => ({ f: at(c, brg + 180, 12), c, b: at(c, brg, 12) });
const ID = '990000000000000045';
const COURSE = { id: ID, club: 'Synthetic Walk', course: '', city: 'Phoenix', state: 'AZ', lat: T1[0], lng: T1[1], holes: 18,
    h: { 1: { t: { b: T1 }, g: green(G1, 0) }, 2: { t: { b: T2 }, g: green(G2, 90) }, 3: { t: { b: T3 }, g: green(G3, 0) } } };
const GAPI = { v: 1, built: 'test', courses: { [ID]: COURSE }, links: { synthetic_walk: ID } };
const CODE = 'AA045';
const pars = new Array(18).fill(4);
const round = (scores) => {
    const r = wizardSavedRound({ code: CODE, golfers: 1, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Manny'],
        overrides: { activeCourseKey: 'synthetic_walk', courseName: 'Synthetic Walk', groupSizeOverrides: { 0: 1 },
            courseData: pars.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: i + 1 })) } });
    delete r.moneyPool; r.additionalGames = {}; r.additionalGameInstances = {}; r.sideMatches = {}; r.scores = scores || {};
    return r;
};
const DB = (r) => ({ events: { [CODE]: r }, global_courses: { synthetic_walk: { name: 'Synthetic Walk', data: r.courseData, location: { latitude: T1[0], longitude: T1[1], city: 'Phoenix', state: 'AZ' } } }, trips: {}, organizers: {}, tournaments: {} });
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{liveTest:true,devPro:true,esriKey:''});}});})();"
    + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';';
// The stand-in GPS: a fix a second from wherever __moveTo last put the golfer.
const GEO = (p) => "(function(){ var cur = { lat: " + p[0] + ", lng: " + p[1] + " }, live = {}, n = 1;"
    + " window.__moveTo = function (la, ln) { cur = { lat: la, lng: ln }; Object.keys(live).forEach(function (id) { live[id](); }); return 'moved'; };"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var id = n++; var f = function () { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 5 }, timestamp: Date.now() }); };"
    + " live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; }, getCurrentPosition: function (ok) { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 5 }, timestamp: Date.now() }); }, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";
const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});";
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const ST = "JSON.stringify({ hole: HardPanGps.hole(), side: HardPanGps.side(),"
    + " toast: (function(){ var t = document.querySelector('#gps-overlay .gps-aa-toast'); return t ? (t.style.display === 'none' ? '' : t.innerText.replace(/\\s+/g, ' ').trim()) : null; })(),"
    + " sheet: (function(){ var s = window.HardPanGpsStats && HardPanGpsStats.sheet; return s && s.isOpen() ? { home: s.hole(), shown: s.shownHole(), title: (document.querySelector('.hp-ss-title')||{}).textContent || '', earlier: (document.querySelector('.hp-ss-earlier')||{}).textContent || '' } : null; })(),"
    + " e: window.__e })";
const MOVE = (p) => 'window.__moveTo(' + p[0] + ',' + p[1] + ')';

const VIEWS = [{ width: 393, height: 852, tag: '393' }, { width: 375, height: 667, tag: '375' }];
let j = null;
after(async () => { if (j) { await j.close(); j = null; } });
const ev = (x) => j.evaluate(x);
const st = async () => JSON.parse(await ev(ST));
async function until(x, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(x)) return true; } catch (e) {} await sleep(250); } return false; }
async function open(view, scores) {
    if (j) { await j.close(); j = null; }
    j = await openJourney({ db: DB(round(scores)), viewport: { width: view.width, height: view.height }, webgl: true,
        blockUrls: ['*nationalmap.gov*', '*arcgis*', '*weather.gov*', '*epqs*', '*overpass*', '*cloudfunctions.net*'],
        preScript: ERR + 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO(FW1)
            + "try{localStorage.setItem('golfapp_me_" + CODE + "','101');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');localStorage.setItem('hardpan_last_hole_" + CODE + "','1');localStorage.setItem('hardpan_gps_whoasked_" + CODE + "','1');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}" });
    await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1&me=101'), 3000);
    assert.ok(await until("window.HardPanGps && HardPanGps.isMounted && HardPanGps.isMounted() && HardPanGps.side() === 'gps' && HardPanGps.hole() === 1", 20000), 'the map opened on hole 1');
    await sleep(1500);
}
const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await j.shot(path.join(SHOTS, name + '.png')); } };

for (const view of VIEWS) {
    test(view.tag + ': hole 1 -> walk to hole 2\'s tee: "Hole 2 →", the score sheet for hole 1; Undo holds it', { timeout: 120000 }, async () => {
        await open(view);
        let s = await st();
        assert.equal(s.hole, 1, JSON.stringify(s));
        // GPS tools: "Auto-advance holes", ON by default (the golfer opens Tools; nothing else touched).
        assert.equal(await ev("(function(){ var b = document.querySelector('#gps-overlay .gps-tools'); if (!b) return 'none'; b.click(); return 'ok'; })()"), 'ok', 'the Tools button');
        await sleep(500);
        const tools = JSON.parse(await ev("JSON.stringify({ menu: (document.querySelector('#gps-overlay .gps-aa-toggle')||{}).textContent || '', row: (function(){ var r = document.querySelector('#gps-overlay [data-ts-row=\"aa\"]'), b = document.querySelector('#gps-overlay [data-ts-sw=\"aa\"]'); return r && r.offsetParent !== null ? r.innerText.trim() + '|' + b.getAttribute('aria-checked') : ''; })() })"));
        assert.ok(tools.menu === 'Auto-advance holes: On' || tools.row === 'Auto-advance holes|true', 'ON by default, in GPS tools: ' + JSON.stringify(tools));
        await shot(view.tag + '-0-tools-toggle');
        await ev("(function(){ var b = document.querySelector('#gps-overlay .gps-tools'); if (b) b.click(); var d = document.querySelector('#gps-overlay .gps-ts-done, #gps-overlay .gps-tools-sheet [data-ts-close]'); if (d && d.offsetParent !== null) d.click(); return 1; })()");
        await sleep(500);
        await ev(MOVE(G1)); await sleep(4000);
        s = await st();
        assert.deepEqual([s.hole, s.toast, s.sheet], [1, '', null], 'on the green: no switch ' + JSON.stringify(s));
        await ev(MOVE(OFF_T2)); await sleep(3000);
        s = await st();
        assert.deepEqual([s.hole, s.toast], [1, ''], 'on the tee, before the ~10 s wait: still hole 1 ' + JSON.stringify(s));
        await shot(view.tag + '-1-before-switch');
        assert.ok(await until('HardPanGps.hole() === 2', 12000), 'switched to hole 2 on its tee');
        await sleep(600);
        s = await st();
        assert.equal(s.toast, 'Hole 2 → Undo', JSON.stringify(s));
        assert.ok(s.sheet, 'the score sheet opened ' + JSON.stringify(s));
        assert.deepEqual([s.sheet.home, s.sheet.shown], [2, 1], 'the sheet shows hole 1, Save goes back to hole 2');
        assert.match(s.sheet.title, /^Hole 1/);
        assert.match(s.sheet.earlier, /Save goes back to hole 2/);
        await shot(view.tag + '-2-toast-and-sheet-hole1');
        // Undo: back on hole 1 (the sheet closes), and no second switch while still on that tee.
        // Undo is IN SIGHT and tappable over the sheet: a real tap at its center lands on it.
        const ub = JSON.parse(await ev("(function(){ var b = document.querySelector('#gps-overlay .gps-aa-undo'), r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, h = document.elementFromPoint(x, y); return JSON.stringify({ x: x, y: y, w: r.width, hit: !!(h && h.closest && h.closest('.gps-aa-undo')) }); })()"));
        assert.ok(ub.hit && ub.w > 30 && ub.y > 0 && ub.y < view.height, 'Undo is on top, in sight: ' + JSON.stringify(ub));
        for (const type of ['mousePressed', 'mouseReleased']) await j.cdp('Input.dispatchMouseEvent', { type, x: Math.round(ub.x), y: Math.round(ub.y), button: 'left', clickCount: 1 });
        await sleep(800);
        s = await st();
        assert.deepEqual([s.hole, s.toast, s.sheet], [1, '', null], 'Undo -> hole 1 ' + JSON.stringify(s));
        await sleep(13000);
        s = await st();
        assert.equal(s.hole, 1, 'held for 2 min after Undo, while on hole 2\'s tee ' + JSON.stringify(s));
        assert.deepEqual(s.e, [], 'no page errors');
        // PRIVACY: none of the walk's coordinates were kept or written.
        const dump = await ev("new Promise(function(res){ var ls = ''; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); ls += k + '=' + localStorage.getItem(k) + '\\n'; } for (var i2 = 0; i2 < sessionStorage.length; i2++) { var k2 = sessionStorage.key(i2); ls += k2 + '=' + sessionStorage.getItem(k2) + '\\n'; } } catch (e) {} firebase.database().ref('events/" + CODE + "').once('value').then(function(sn){ res(ls + JSON.stringify(sn.val())); }, function(){ res(ls); }); })");
        // (A value the course data itself carries - the tee's longitude - is the course's, not the golfer's.)
        const seeded = JSON.stringify(DB(round())) + JSON.stringify(GAPI);
        let checked = 0;
        for (const p of [FW1, OFF_T2]) for (const v of p) {
            const k = String(v).slice(0, 10);
            if (seeded.indexOf(k) !== -1) continue;
            checked++;
            assert.ok(dump.indexOf(k) === -1, 'the golfer\'s coordinate ' + v + ' was stored');
        }
        assert.ok(checked >= 3 && dump.length > 50, 'the guard looked at something: ' + checked);
    });

    test(view.tag + ': hole 1 already scored -> the switch, no sheet', { timeout: 90000 }, async () => {
        await open(view, { p101_h1: 4 });
        await ev(MOVE(G1)); await sleep(2500);
        await ev(MOVE(OFF_T2));
        assert.ok(await until('HardPanGps.hole() === 2', 16000), 'switched to hole 2');
        await sleep(600);
        const s = await st();
        assert.deepEqual([s.toast, s.sheet], ['Hole 2 → Undo', null], JSON.stringify(s));
        assert.deepEqual(s.e, []);
    });
}
