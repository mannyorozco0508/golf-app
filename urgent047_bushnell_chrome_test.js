// URGENT-047 B - LAUNCH MONITOR QUICK ENTRY, IN REAL CHROME (393x852 and 375x667).
// A made-up course (synthetic - no licensed data), 2 golfers; Ann is this phone's golfer.
//   1  GPS map > Tools > My bag: the "Enter carries from my Bushnell" door (list view)
//   2  the grid: a row per My bag club, "My bag now" per row, on screen, no sideways scroll
//   3  a bad carry (600) is flagged and NOTHING is written
//   4  Driver 247, 7-iron 158, PW 121 typed -> Update my bag -> hardpan_bag_v1 set = those
//      (the 6-iron typed earlier in My bag kept: blank rows keep their number)
//   5  Open My bag: the rows show 247 / 158 / 121 "entered"
//   6  the guard: no database write, no request carries a carry or a position
// Screenshots into SHOTS_047 when set.
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-view.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
global.window = global; require('./gps-geo.js'); const G = window.HardPanGeo;

const CODE = 'BSH047', KEY = 'bshgps_test', ID = '990000000000000047';
const TEE = [33.4700, -111.9500], MID = G.destination(TEE, 0, 380);
const P = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
const h = { 1: { g: { f: P(G.destination(MID, 180, 12)), c: P(MID), b: P(G.destination(MID, 0, 12)) }, t: { b: P(TEE) } } };
for (let n = 2; n <= 18; n++) { const t = G.destination(TEE, 90, 400 * (n - 1)); h[n] = { g: { c: P(G.destination(t, 0, 350)) }, t: { b: P(t) } }; }
const GAPI = { v: 1, built: 'test', links: { [KEY]: ID }, courses: { [ID]: { id: ID, club: 'Bag Test Golf Club', course: '', city: 'Phoenix', state: 'AZ', lat: TEE[0], lng: TEE[1], holes: 18, h } } };
const CD = makeCourseData(18);
const round = () => {
    const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Ann Alpha', 'Ben Bravo'], courseData: CD,
        overrides: { activeCourseKey: KEY, courseName: 'Bag Test Golf Club', groupSizeOverrides: { 0: 2 } } });
    r.additionalGames = {}; r.additionalGameInstances = {}; return r;
};
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:false,live:false,golfapiFile:'gps-golfapi-test.js',devPro:true});}});})();";
const GEO = "(function(){ try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { setTimeout(function () { ok({ coords: { latitude: " + TEE[0] + ", longitude: " + TEE[1] + ", accuracy: 3 }, timestamp: Date.now() }); }, 50); return 1; },"
    + " getCurrentPosition: function (ok) { ok({ coords: { latitude: " + TEE[0] + ", longitude: " + TEE[1] + ", accuracy: 3 }, timestamp: Date.now() }); }, clearWatch: function () {} } }); } catch (e) {} })();";
// Ann's bag on this phone: set up already, a 6-iron typed earlier.
const BAG0 = { v: 1, golfers: { 'n:ann alpha': { shots: {}, set: { '6i': 168 }, setupAt: 1792000000000 } } };
const SHOTS = process.env.SHOTS_047 || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const vp of [{ width: 393, height: 852 }, { width: 375, height: 667 }]) {
    test('Bushnell quick entry at ' + vp.width + 'x' + vp.height, { timeout: 180000 }, async () => {
        const r0 = round(), ann = String(r0.players[0].id);
        const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';'
            + "try{localStorage.setItem('golfapp_me_" + CODE + "','" + ann + "');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');"
            + "localStorage.setItem('hardpan_bag_v1'," + JSON.stringify(JSON.stringify(BAG0)) + ");}catch(e){}"
            + "window.__REQ = []; (function(){ var f = window.fetch; window.fetch = function (u, o) { window.__REQ.push(String(u) + ' ' + (o && o.body ? String(o.body) : '')); return f.apply(this, arguments); }; })();";
        const j = await openJourney({ db: { events: { [CODE]: r0 }, global_courses: { [KEY]: { name: 'Bag Test Golf Club', data: CD, location: { latitude: TEE[0], longitude: TEE[1], city: 'Phoenix', state: 'AZ' } } }, trips: {}, organizers: {}, tournaments: {} },
            viewport: vp, webgl: true, preScript: PRE });
        const ev = (x) => j.evaluate(x);
        const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
        const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(1200); await j.shot(path.join(SHOTS, 'chrome-' + vp.width + 'x' + vp.height + '-' + n + '.png')); } };
        const shown = (sel) => "(function(){ var s = document.querySelector('#gps-overlay " + sel + "'); return !!s && s.style.display !== 'none' && s.getBoundingClientRect().height > 0; })()";
        try {
            await j.goto(fileUrl('index.html', 'game=' + CODE), 5000);
            assert.ok(await until("typeof currentData !== 'undefined' && !!currentData && !!currentData.players && !!window.HardPanGps", 20000), 'the round');
            await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
            assert.ok(await until("HardPanGps.isMounted() && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-map[data-ready]')", 25000), 'the map');
            const writes0 = await ev("JSON.stringify(window.__WRITES || [])");
            // 1. Tools > My bag
            await ev("document.querySelector('#gps-overlay .gps-my-bag').click()");
            assert.ok(await until(shown('.gps-bag') + " && document.querySelector('#gps-overlay .gps-bag').getAttribute('data-bag-view') === 'list'", 8000), 'My bag (list)');
            assert.ok(await until(shown('.gps-bag-lm'), 4000), 'the door');
            assert.equal(await ev("document.querySelector('#gps-overlay .gps-bag-lm').textContent.trim()"), 'Enter carries from my Bushnell');
            await shot('1-my-bag-door');
            await ev("document.querySelector('#gps-overlay .gps-bag-lm').click()");
            // 2. the grid
            assert.ok(await until(shown('.gps-lm') + " && !!window.HardPanLaunchEntry", 8000), 'the grid');
            assert.equal(await ev(shown('.gps-bag')), false, 'My bag closed under it');
            const g = JSON.parse(await ev("(function(){ var s = document.querySelector('#gps-overlay .gps-lm'), r = s.getBoundingClientRect(); return JSON.stringify({ rows: s.querySelectorAll('[data-lm-club]').length, clubs: HardPanGpsBag.BAG.length,"
                + " now6: s.querySelector('[data-lm-now=\"6i\"]').textContent, nowDr: s.querySelector('[data-lm-now=\"Dr\"]').textContent, top: r.top, right: r.right, w: innerWidth, sw: document.documentElement.scrollWidth,"
                + " text: s.innerText }); })()"));
            assert.equal(g.rows, g.clubs, 'a row per My bag club');
            assert.equal(g.now6, '168 · entered'); assert.equal(g.nowDr, '—');
            assert.ok(g.top >= 0 && g.right <= g.w && g.sw <= g.w, 'on screen, no sideways scroll');
            assert.match(g.text, /Type the CARRY your Bushnell showed/);
            assert.match(g.text, /no Bushnell sign-in/);
            assert.doesNotMatch(g.text, /password|email/i);
            const type = (c, v) => ev("(function(){ var i = document.querySelector('#gps-overlay [data-lm-club=\"" + c + "\"]'); i.focus(); i.value = '" + v + "'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()");
            // 3. a bad number: flagged, nothing written
            await type('Dr', '600');
            await ev("document.querySelector('#gps-overlay .gps-lm-save').click()");
            assert.ok(await until("!!document.querySelector('#gps-overlay .gps-lm-err')", 3000), 'the error');
            assert.match(await ev("document.querySelector('#gps-overlay .gps-lm-err').textContent"), /Check Dr: a carry from 1 to 449 yds/);
            assert.equal(await ev("!!document.querySelector('#gps-overlay [data-lm-row=Dr].gps-lm-bad')"), true);
            assert.deepEqual(JSON.parse(await ev("localStorage.getItem('hardpan_bag_v1')")), BAG0, 'nothing written');
            // 4. the real numbers
            await type('Dr', '247'); await type('7i', '158'); await type('PW', '121');
            await shot('2-grid-typed');
            await ev("document.querySelector('#gps-overlay .gps-lm-save').click()");
            assert.ok(await until("!!document.querySelector('#gps-overlay .gps-lm-done')", 3000), 'done line');
            assert.match(await ev("document.querySelector('#gps-overlay .gps-lm-done').textContent"), /My bag updated: Dr 247, 7i 158, PW 121/);
            const rec = JSON.parse(await ev("localStorage.getItem('hardpan_bag_v1')"));
            assert.deepEqual(rec.golfers['n:ann alpha'].set, { '6i': 168, Dr: 247, '7i': 158, PW: 121 });
            assert.deepEqual(Object.keys(rec.golfers), ['n:ann alpha'], 'Ann only');
            await shot('3-grid-updated');
            // 5. My bag after the update
            await ev("document.querySelector('#gps-overlay .gps-lm-openbag').click()");
            assert.ok(await until(shown('.gps-bag') + " && !" + shown('.gps-lm'), 6000), 'My bag again');
            const bag = JSON.parse(await ev("JSON.stringify(['Dr','6i','7i','PW'].map(function(c){ var r = document.querySelector('#gps-overlay [data-bag-row=\"' + c + '\"]'); return [r.querySelector('input').value, r.querySelector('.gps-bag-meta').textContent]; }))"));
            assert.deepEqual(bag, [['247', 'entered'], ['168', 'entered'], ['158', 'entered'], ['121', 'entered']]);
            await shot('4-my-bag-after');
            // 6. the guard
            assert.equal(await ev("JSON.stringify(window.__WRITES || [])"), writes0, 'no database write');
            const req = JSON.parse(await ev("JSON.stringify(window.__REQ)")).join('\n');
            assert.doesNotMatch(req, /247|hardpan_bag|bushnell|foresight/i, 'no request carries the bag');
        } finally { await j.close(); }
    });
}
