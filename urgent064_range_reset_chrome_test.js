// 064-6a - RESET RANGE DATA IN MY BAG, IN REAL CHROME (393x852 and 375x667, the GPS map).
// A made-up course (synthetic - no licensed data); the GPS screen's golfer is Ann.
//   1  Ann's phone: a typed Driver 230 and Pitching wedge 120, a learned 7-iron (3 marked shots),
//      a 9-iron learned from the 049 shot log, a Strokes Gained record for the round
//   2  Tools > Range: Driver 240 / 251 / 236, 7-iron 150 / 155 / 148 typed; Update my bag
//   3  My bag: the Driver and 7-iron rows carry a Range line + "Reset range data"; others do not;
//      "Reset all range data" shows
//   4  Driver "Reset range data" -> the confirm ("Driver: 240 -> 230 entered"); Cancel and a tap
//      outside change NOTHING (every key on the phone the same)
//   5  Driver again -> Reset: Driver back to 230 entered, its Range line gone; 7-iron still Range's 150
//   6  Reset all range data -> the confirm ("7-iron: 150 -> 161 learned") -> Reset: no Range data left
//   7  THE GUARD: typed numbers, the marked shots (My bag's and the shot log), Strokes Gained untouched;
//      no database write
// Screenshots into SHOTS_064 when set.
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-range.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
global.window = global; require('./gps-geo.js'); const G = window.HardPanGeo;

const CODE = 'RST064', KEY = 'rstgps_test', ID = '990000000000000064';
const TEE = [33.4600, -111.9600], MID = G.destination(TEE, 0, 400);
const P = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
const h = { 1: { g: { f: P(G.destination(MID, 180, 12)), c: P(MID), b: P(G.destination(MID, 0, 12)) }, t: { b: P(TEE) } } };
for (let n = 2; n <= 18; n++) { const t = G.destination(TEE, 90, 400 * (n - 1)); h[n] = { g: { c: P(G.destination(t, 0, 350)) }, t: { b: P(t) } }; }
const GAPI = { v: 1, built: 'test', links: { [KEY]: ID }, courses: { [ID]: { id: ID, club: 'Reset Test Golf Club', course: '', city: 'Phoenix', state: 'AZ', lat: TEE[0], lng: TEE[1], holes: 18, h } } };
const CD = makeCourseData(18).map((x, i) => Object.assign({}, x, i === 0 ? { par: 4 } : {}));
const round = () => {
    const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Ann Alpha', 'Ben Bravo'], courseData: CD,
        overrides: { activeCourseKey: KEY, courseName: 'Reset Test Golf Club', groupSizeOverrides: { 0: 2 } } });
    r.additionalGames = {}; r.additionalGameInstances = {}; return r;
};
const BAG0 = { v: 1, golfers: { 'n:ann alpha': { shots: { '7i': [160, 162, 161] }, set: { Dr: 230, PW: 120 }, setupAt: 1 } } };
const SG0 = { v: 1, golfers: { 'n:ann alpha': { 1: [{ k: 'tee', d: 420 }] } } };
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:false,live:false,golfapiFile:'gps-golfapi-test.js',devPro:true});}});})();";
const SHOTS = process.env.SHOTS_064 || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const vp of [{ width: 393, height: 852 }, { width: 375, height: 667 }]) {
    test('Reset range data in My bag at ' + vp.width + 'x' + vp.height, { timeout: 240000 }, async () => {
        const r0 = round(), ann = String(r0.players[0].id);
        const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';'
            + "try{if(!sessionStorage.getItem('seed64')){sessionStorage.setItem('seed64','1');localStorage.setItem('hardpan_bag_v1'," + JSON.stringify(JSON.stringify(BAG0)) + ");localStorage.setItem('hardpan_sg_v1_" + CODE + "'," + JSON.stringify(JSON.stringify(SG0)) + ");}"
            + "localStorage.setItem('golfapp_me_" + CODE + "','" + ann + "');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}";
        const j = await openJourney({ db: { events: { [CODE]: r0 }, global_courses: { [KEY]: { name: 'Reset Test Golf Club', data: CD, location: { latitude: TEE[0], longitude: TEE[1], city: 'Phoenix', state: 'AZ' } } }, trips: {}, organizers: {}, tournaments: {} },
            viewport: vp, webgl: true, preScript: PRE });
        const ev = (x) => j.evaluate(x);
        const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
        const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(900); await j.shot(path.join(SHOTS, 'chrome-' + vp.width + 'x' + vp.height + '-' + n + '.png')); } };
        const RS = "document.querySelector('#gps-overlay .gps-range-sheet')";
        const tapR = (sel) => ev("(function(){ var b = " + RS + ".querySelector(" + JSON.stringify(sel) + "); if (!b) return false; b.click(); return true; })()");
        const typedShot = async (club, yds) => {
            const n0 = await ev("(function(){ var c = HardPanRange.current('Ann Alpha'); return c ? c.shots.length : 0; })()");
            await tapR('[data-range-club="' + club + '"]');
            await ev("(function(){ var i = " + RS + ".querySelector('.gps-range-typed'); i.value = '" + yds + "'; return 1; })()");
            await tapR('.gps-range-add');
            assert.ok(await until("(function(){ var c = HardPanRange.current('Ann Alpha'); return !!c && c.shots.length === " + (n0 + 1) + "; })()", 4000), 'typed shot saved');
        };
        const BAGSEL = "document.querySelector('#gps-overlay .gps-bag')";
        const bagOpen = "(function(){ var b = " + BAGSEL + "; return !!b && b.style.display !== 'none' && b.getAttribute('data-bag-view') === 'list'; })()";
        const rowsNow = () => ev("JSON.stringify(Array.from(document.querySelectorAll('#gps-overlay [data-bag-row]')).map(function(r){ var g = r.querySelector('[data-bag-range]'); return { c: r.getAttribute('data-bag-row'), v: r.querySelector('[data-bag-edit]').value, src: r.querySelector('[data-bag-src]').getAttribute('data-bag-src'), range: g ? g.querySelector('span').textContent : null, btn: !!r.querySelector('[data-bag-range-reset]') }; }))").then(JSON.parse);
        const row = async (c) => (await rowsNow()).find((x) => x.c === c);
        // Ann's data on the phone (the bag, Range, the shot log, Strokes Gained, the round's shots and stats, the round) -
        // not the map's caches (elevation, imagery, weather), which fill in on their own.
        const phone = () => ev("(function(){ var o = {}; Object.keys(localStorage).sort().forEach(function(k){ if (/^(hardpan_(bag|range|shotlog)_v1$|hardpan_(sg|shots|stats|qstats)_v1_|golfapp_)/.test(k)) o[k] = localStorage.getItem(k); }); return JSON.stringify(o); })()").then(JSON.parse);
        const confirmNow = () => ev("(function(){ var c = document.querySelector('#gps-overlay .gps-bag-confirm'); if (!c) return null; return JSON.stringify({ k: c.getAttribute('data-bag-confirm'), t: c.querySelector('.gps-bag-confirm-t').textContent, b: c.querySelector('.gps-bag-confirm-b').textContent, l: Array.from(c.querySelectorAll('li')).map(function(x){ return x.textContent; }), go: c.querySelector('.gps-bag-confirm-go').textContent, role: c.getAttribute('role') }); })()").then((x) => (x ? JSON.parse(x) : null));
        const click = (sel) => ev("(function(){ var b = document.querySelector(" + JSON.stringify(sel) + "); if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true; })()");
        try {
            await j.goto(fileUrl('index.html', 'game=' + CODE), 5000);
            assert.ok(await until("typeof currentData !== 'undefined' && !!currentData && !!currentData.players && !!window.HardPanGps", 20000), 'the round');
            await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
            assert.ok(await until("HardPanGps.isMounted() && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-map[data-ready]')", 25000), 'the map');
            await ev('HardPanGps.setHole(1, 4)');
            await sleep(1500);
            const writes0 = JSON.parse(await ev('JSON.stringify(window.__WRITES || [])')).length;
            // 1. My bag once (loads the shot log); the 9-iron's marked shots go into the 049 shot log
            await ev("document.querySelector('#gps-overlay .gps-my-bag').click()");
            assert.ok(await until(bagOpen + " && !!window.HardPanShotLog && !!window.HardPanRange", 8000), 'My bag open, Range loaded with it');
            assert.equal(await ev("[135, 138, 140].map(function(y, i){ return HardPanShotLog.add({ golfer: 'Ann Alpha', club: '9i', carry: y, windMph: 0, relAngle: null, along: null, across: null, course: 'Reset Test Golf Club', hole: 1, date: Date.now() - 86400000 + i }); }).filter(Boolean).length"), 3);
            assert.equal((await rowsNow()).filter((r) => r.range || r.btn).length, 0, 'no Range data yet: no Range line');
            assert.equal(await ev("getComputedStyle(document.querySelector('#gps-overlay .gps-bag-rangeall')).display"), 'none', 'no "Reset all range data" without Range data');
            await click('#gps-overlay .gps-bag-done');
            // 2. Range: typed carries, Update my bag
            await ev("document.querySelector('#gps-overlay .gps-tools').click()");
            assert.ok(await until("(function(){ var t = document.querySelector('#gps-overlay .gps-tsheet'); var b = t && t.querySelector('[data-ts-tile=\".gps-range\"]'); return !!b && t.style.display !== 'none'; })()", 6000), 'Tools');
            await ev("document.querySelector('#gps-overlay .gps-tsheet [data-ts-tile=\".gps-range\"]').click()");
            assert.ok(await until("!!window.HardPanRange && HardPanRange.isOpen()", 8000), 'the Range sheet');
            for (const [c, y] of [['Dr', 240], ['Dr', 251], ['Dr', 236], ['7i', 150], ['7i', 155], ['7i', 148]]) await typedShot(c, y);
            await tapR('.gps-range-bag');
            assert.ok(await until(RS + ".innerText.indexOf('My bag updated') > -1", 4000), 'updated');
            await tapR('.gps-range-openbag');
            assert.ok(await until(bagOpen, 6000), 'My bag (list)');
            // 3. the rows
            const nine = await row('9i');
            assert.equal(nine.src, 'learned', '9-iron learned from the shot log: ' + JSON.stringify(nine));
            assert.deepEqual(await row('Dr'), { c: 'Dr', v: '240', src: 'entered', range: 'Range · 3 good / 0 mishits · 240 (median of good)', btn: true });
            assert.deepEqual(await row('7i'), { c: '7i', v: '150', src: 'entered', range: 'Range · 3 good / 0 mishits · 150 (median of good)', btn: true });
            assert.deepEqual(await row('PW'), { c: 'PW', v: '120', src: 'entered', range: null, btn: false });
            assert.equal((await rowsNow()).filter((r) => r.btn).length, 2, 'only the clubs with Range data');
            assert.notEqual(await ev("getComputedStyle(document.querySelector('#gps-overlay .gps-bag-rangeall')).display"), 'none', '"Reset all range data" shows');
            const fit = JSON.parse(await ev("(function(){ var b = document.querySelector('#gps-overlay [data-bag-range-reset=\"Dr\"]').getBoundingClientRect(), r = document.querySelector('#gps-overlay [data-bag-row=\"Dr\"]').getBoundingClientRect(); return JSON.stringify({ bl: b.left, br: b.right, bh: b.height, rl: r.left, rr: r.right, w: innerWidth, sw: document.documentElement.scrollWidth }); })()"));
            assert.ok(fit.bl >= fit.rl - 1 && fit.br <= fit.rr + 1 && fit.bh >= 36 && fit.sw <= fit.w, 'the button fits its row ' + JSON.stringify(fit));
            await ev("document.querySelector('#gps-overlay [data-bag-row=\"Dr\"]').scrollIntoView({ block: 'center' })");
            await shot('1-club-row');
            const p0 = await phone();
            assert.ok(p0.hardpan_shotlog_v1 && p0['hardpan_sg_v1_' + CODE] && p0.hardpan_range_v1, 'positive: the shot log, Strokes Gained and Range are on the phone');
            // 4. the confirm; Cancel and a tap outside change nothing
            await click('#gps-overlay [data-bag-range-reset="Dr"]');
            assert.ok(await until("!!document.querySelector('#gps-overlay .gps-bag-confirm')", 3000), 'the confirm');
            assert.deepEqual(await confirmNow(), { k: 'Dr', t: 'Reset Driver range data?', b: 'Clears the 3 Driver shots from your Range sessions.', l: ['Driver: 240 → 230 entered'], go: 'Reset range data', role: 'alertdialog' });
            const cf = JSON.parse(await ev("(function(){ var b = document.querySelector('#gps-overlay .gps-bag-confirm-box').getBoundingClientRect(), g = document.querySelector('#gps-overlay .gps-bag-confirm-go').getBoundingClientRect(), n = document.querySelector('#gps-overlay .gps-bag-confirm-no').getBoundingClientRect(); return JSON.stringify({ top: b.top, bottom: b.bottom, gb: g.bottom, nb: n.bottom, h: innerHeight }); })()"));
            assert.ok(cf.top >= 0 && cf.nb <= cf.h + 1, 'the whole prompt on screen ' + JSON.stringify(cf));
            await shot('2-confirm');
            await click('#gps-overlay .gps-bag-confirm-no');
            assert.equal(await confirmNow(), null, 'Cancel closes it');
            assert.deepEqual(await phone(), p0, 'Cancel: nothing changed');
            await click('#gps-overlay [data-bag-range-reset="Dr"]');
            await ev("(function(){ var c = document.querySelector('#gps-overlay .gps-bag-confirm'); c.dispatchEvent(new MouseEvent('click', { bubbles: true })); return 1; })()");
            assert.equal(await confirmNow(), null, 'a tap outside closes it');
            assert.deepEqual(await phone(), p0, 'a tap outside: nothing changed');
            assert.equal((await row('Dr')).v, '240');
            // 5. Driver: reset
            await click('#gps-overlay [data-bag-range-reset="Dr"]');
            await click('#gps-overlay .gps-bag-confirm-go');
            assert.ok(await until("!document.querySelector('#gps-overlay .gps-bag-confirm')", 3000));
            assert.deepEqual(await row('Dr'), { c: 'Dr', v: '230', src: 'entered', range: null, btn: false }, 'Driver: back to the typed 230');
            assert.deepEqual(await row('7i'), { c: '7i', v: '150', src: 'entered', range: 'Range · 3 good / 0 mishits · 150 (median of good)', btn: true });
            assert.deepEqual(await row('9i'), nine, '9-iron untouched');
            const p1 = await phone();
            const rng1 = JSON.parse(p1.hardpan_range_v1).golfers['n:ann alpha'];
            assert.deepEqual(rng1.sessions[0].shots.map((x) => x.c + x.yd), ['7i150', '7i155', '7i148']);
            assert.deepEqual(rng1.sessions[0].bag, { '7i': 150 });
            const bag1 = JSON.parse(p1.hardpan_bag_v1).golfers['n:ann alpha'];
            assert.deepEqual(bag1.set, { Dr: 230, PW: 120, '7i': 150 }); assert.deepEqual(bag1.shots, { '7i': [160, 162, 161] });
            for (const k of ['hardpan_shotlog_v1', 'hardpan_sg_v1_' + CODE]) assert.equal(p1[k], p0[k], k + ' untouched');
            await ev("document.querySelector('#gps-overlay [data-bag-row=\"Dr\"]').scrollIntoView({ block: 'center' })");
            await shot('3-after-driver-reset');
            // 6. Reset all range data
            await click('#gps-overlay .gps-bag-rangeall');
            assert.ok(await until("!!document.querySelector('#gps-overlay .gps-bag-confirm')", 3000));
            assert.deepEqual(await confirmNow(), { k: 'all', t: 'Reset all range data?', b: 'Clears every Range session on this phone for Ann (3 shots).', l: ['7-iron: 150 → 161 learned'], go: 'Reset all range data', role: 'alertdialog' });
            await shot('4-reset-all-confirm');
            await click('#gps-overlay .gps-bag-confirm-no');
            assert.deepEqual(await phone(), p1, 'Cancel: nothing changed');
            await click('#gps-overlay .gps-bag-rangeall');
            await click('#gps-overlay .gps-bag-confirm-go');
            assert.ok(await until("!document.querySelector('#gps-overlay .gps-bag-confirm')", 3000));
            const rows = await rowsNow();
            assert.equal(rows.filter((r) => r.range || r.btn).length, 0, 'no Range data left');
            assert.deepEqual(rows.find((r) => r.c === '7i'), { c: '7i', v: '161', src: 'learned', range: null, btn: false }, '7-iron: learned from its marked shots');
            assert.deepEqual(rows.find((r) => r.c === 'Dr'), { c: 'Dr', v: '230', src: 'entered', range: null, btn: false });
            assert.deepEqual(rows.find((r) => r.c === 'PW'), { c: 'PW', v: '120', src: 'entered', range: null, btn: false });
            assert.deepEqual(rows.find((r) => r.c === '9i'), nine);
            assert.equal(await ev("getComputedStyle(document.querySelector('#gps-overlay .gps-bag-rangeall')).display"), 'none');
            await ev("document.querySelector('#gps-overlay [data-bag-row=\"7i\"]').scrollIntoView({ block: 'center' })");
            await shot('5-after-reset-all');
            // 7. THE GUARD
            const p2 = await phone();
            assert.equal(JSON.parse(p2.hardpan_range_v1).golfers['n:ann alpha'], undefined);
            const bag2 = JSON.parse(p2.hardpan_bag_v1).golfers['n:ann alpha'];
            assert.deepEqual(bag2.set, { Dr: 230, PW: 120 }); assert.deepEqual(bag2.shots, { '7i': [160, 162, 161] });
            for (const k of Object.keys(p0)) if (!/^hardpan_(range|bag)_v1$/.test(k)) assert.equal(p2[k], p0[k], k + ' untouched');
            const writes = JSON.parse(await ev('JSON.stringify(window.__WRITES || [])')).slice(writes0);
            assert.doesNotMatch(JSON.stringify(writes), /range|hardpan_bag|player_clubs|shotlog/i, 'no database write from the reset');
        } finally { await j.close(); }
    });
}
