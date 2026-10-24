// URGENT-049 INTEGRATION (int-049) IN REAL CHROME (393x852 and 375x667): the chips (part 1) + the
// shot log / My bag / Shot history (part 3) together, with the integration fixes:
//   1  Mark shot on the tee, tap 7i, Mark shot at the ball: ONE 7-iron record; My bag's 7-iron
//      says "1 shot" (the shot log is the one source - nothing in the old bag's shot list)    [a]
//   2  no wind reading on the phone: the record has windMph null / src null; Shot history says
//      "no wind reading"; the Calm filter does not list it                                     [b]
//   3  the chip row left alone until it times out: the pre-picked club still counts           [d]
//   4  a score for the hole with no fix on the green: the open shot closes at the green center [d]
//   5  Shot history: swipe + Delete removes from the log ONCE (HardPanShotLog.remove called 1x) [c]
//   6  Reset on a club with a marked shot: its log shots go, the set-up number comes back      [c]
//   7  the log holds no coordinate; nothing written to the database
// A made-up course (synthetic - no licensed data). Screenshots into SHOTS_049 when set.
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-mark-chips.js')) || !fs.existsSync(path.join(__dirname, 'gps-shot-bag.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
global.window = global; require('./gps-geo.js'); const G = window.HardPanGeo;

const CODE = 'INT049', KEY = 'int049_test', ID = '990000000000000049';
const TEE = [33.4600, -111.9600], MID = G.destination(TEE, 0, 350);
const BALL1 = G.destination(TEE, 3, 215), BALL2 = G.destination(MID, 175, 40);
const P = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
const h = { 1: { g: { f: P(G.destination(MID, 180, 12)), c: P(MID), b: P(G.destination(MID, 0, 12)) }, t: { b: P(TEE) } } };
for (let n = 2; n <= 18; n++) { const t = G.destination(TEE, 90, 400 * (n - 1)); h[n] = { g: { c: P(G.destination(t, 0, 350)) }, t: { b: P(t) } }; }
const GAPI = { v: 1, built: 'test', links: { [KEY]: ID }, courses: { [ID]: { id: ID, club: 'Int Test Golf Club', course: '', city: 'Phoenix', state: 'AZ', lat: TEE[0], lng: TEE[1], holes: 18, h } } };
const CD = makeCourseData(18).map((x, i) => Object.assign({}, x, i === 0 ? { par: 4 } : {}));
const round = () => {
    const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Ann Alpha', 'Ben Bravo'], courseData: CD,
        overrides: { activeCourseKey: KEY, courseName: 'Int Test Golf Club', eventName: 'Test 049 int', groupSizeOverrides: { 0: 2 } } });
    r.additionalGames = {}; r.additionalGameInstances = {}; return r;
};
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:false,live:false,golfapiFile:'gps-golfapi-test.js',devPro:true});}});})();";
const GEO = "(function(){ var cur = { lat: " + TEE[0] + ", lng: " + TEE[1] + " }, live = {}, n = 1; window.__moveTo = function (la, ln) { cur = { lat: la, lng: ln }; Object.keys(live).forEach(function (id) { live[id](); }); return 'moved'; };"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var id = n++; var f = function () { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }; live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; },"
    + " getCurrentPosition: function (ok) { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";
// No wind reading anywhere: WeatherKit off and the NWS fetch refused (a mark with no reading).
const NOWIND = "(function(){ var f = window.fetch; window.fetch = function (u) { if (/weather|nws|wind/i.test(String(u && u.url || u))) return Promise.reject(new Error('offline')); return f.apply(this, arguments); }; })();";
// Ann's bag: SET UP (the starting carries - "entered"), so the likely club is picked and Reset has a number to go back to.
const SETUP = "(function(){ var base = { Dr: 250, '3w': 230, '5w': 215, Hy: 200, '4i': 190, '5i': 180, '6i': 171, '7i': 163, '8i': 152, '9i': 141, PW: 130, GW: 115, SW: 95, LW: 75 };"
    + " localStorage.setItem('hardpan_bag_v1', JSON.stringify({ v: 1, golfers: { 'n:ann alpha': { shots: {}, set: {}, base: base, setupAt: Date.now() } } })); })();";
const SHOTS = process.env.SHOTS_049 || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const yd = (a, b) => G.haversineMeters(a, b) / G.M_PER_YD;

for (const vp of [{ width: 393, height: 852 }, { width: 375, height: 667 }]) {
    test('049 integration at ' + vp.width + 'x' + vp.height, { timeout: 240000 }, async () => {
        const r0 = round(), pid = (r0.players[0] || {}).id;
        const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG.replace('devPro:true', 'devPro:true,weatherkit:false') + GEO + NOWIND + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';'
            + "try{localStorage.setItem('golfapp_me_" + CODE + "','" + pid + "');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}" + SETUP;
        const j = await openJourney({ db: { events: { [CODE]: r0 }, global_courses: { [KEY]: { name: 'Int Test Golf Club', data: CD, location: { latitude: TEE[0], longitude: TEE[1], city: 'Phoenix', state: 'AZ' } } }, trips: {}, organizers: {}, tournaments: {} },
            viewport: vp, webgl: true, preScript: PRE });
        const ev = (x) => j.evaluate(x);
        const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
        const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(1000); await j.shot(path.join(SHOTS, 'int-' + vp.width + 'x' + vp.height + '-' + n + '.png')); } };
        const bar = () => ev("(function(){ var b = document.querySelector('#gps-overlay .gps-bagask'); if (!b || b.style.display === 'none') return null; var r = b.getBoundingClientRect(), on = b.querySelector('.gps-bagask-row button.on'), onr = on ? on.getBoundingClientRect() : null; return JSON.stringify({ head: b.querySelector('.gps-bagask-head').textContent, sub: b.querySelector('.gps-bagask-sub').textContent, on: on ? on.getAttribute('data-bag-club') : null, onVisible: onr ? onr.left >= r.left - 1 && onr.right <= r.right + 1 : null, top: r.top, bottom: r.bottom, h: innerHeight, sw: document.documentElement.scrollWidth, w: innerWidth, n: b.querySelectorAll('[data-bag-club]').length }); })()").then((s) => (s ? JSON.parse(s) : null));
        const logList = (club) => ev("JSON.stringify(window.HardPanShotLog ? HardPanShotLog.list({ golfer: 'Ann Alpha'" + (club ? ", club: '" + club + "'" : '') + " }) : null)").then(JSON.parse);
        const mark = () => ev("document.querySelector('#gps-overlay .gps-mark-shot').click()");
        const moveTo = async (p) => { await ev('__moveTo(' + p[0] + ',' + p[1] + ')'); await sleep(1500); };
        const rowOn = () => until("(function(){ var b = document.querySelector('#gps-overlay .gps-bagask'); return !!b && b.style.display !== 'none' && b.querySelectorAll('[data-bag-club]').length > 0; })()", 8000);
        const BAGS = "document.querySelector('#gps-overlay .gps-bag')", HIST = "document.querySelector('#gps-overlay .gps-shist')";
        const bagRow = (c) => ev("(function(){ var r = " + BAGS + ".querySelector('[data-bag-row=\"" + c + "\"]'); return r ? r.querySelector('.gps-bag-yd').value + ' | ' + r.innerText.replace(/\\s+/g, ' ') : ''; })()");
        const openBag = async () => { await ev("document.querySelector('#gps-overlay .gps-my-bag').click()"); assert.ok(await until("(function(){ var s = " + BAGS + "; return !!s && s.style.display !== 'none' && !!s.querySelector('[data-bag-row]'); })()", 6000), 'My bag'); };
        const tap = (sel, inner) => ev("(function(){ var s = " + sel + "; var b = s && s.querySelector(" + JSON.stringify(inner) + "); if (!b) return false; b.click(); return true; })()");
        try {
            await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 5000);
            await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
            assert.ok(await until("HardPanGps.isMounted() && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-map[data-ready]')", 25000), 'the map');
            assert.ok(await until("(function(){ var b = document.querySelector('#gps-overlay .gps-mark-shot'); return !!b && b.offsetParent !== null; })()", 10000), 'Mark shot');
            await sleep(1500);
            const writes0 = JSON.parse(await ev('JSON.stringify(window.__WRITES || [])')).length;
            // 1 - tee: Mark shot, tap 7i; the ball: Mark shot -> one 7-iron record.
            await mark();
            assert.ok(await rowOn(), 'the chip row');
            await ev("document.querySelector('#gps-overlay .gps-bagask [data-bag-club=\"7i\"]').click()");
            await moveTo(BALL1);
            await mark();
            assert.ok(await until("window.HardPanShotLog && HardPanShotLog.list({ golfer: 'Ann Alpha' }).length === 1", 8000), 'the 7-iron counted');
            const l1 = await logList();
            assert.equal(l1[0].club, '7i');
            assert.ok(Math.abs(l1[0].carry - yd(TEE, BALL1)) <= 1);
            // 2 - no reading: null, not calm
            assert.strictEqual(l1[0].windMph, null, 'no wind reading -> null (not 0 / calm)');
            assert.strictEqual(l1[0].src, null); assert.strictEqual(l1[0].relAngle, null);
            const oldBag = JSON.parse(await ev("localStorage.getItem('hardpan_bag_v1')"));
            assert.deepEqual(oldBag.golfers['n:ann alpha'].shots, {}, 'nothing added to the old bag\'s shot list');
            // 3 - the next row: leave it alone until it times out (20 s); the pre-picked club stands.
            assert.ok(await rowOn(), 'the next chip row');
            const pre = (await bar()).on;
            assert.ok(pre && pre !== '7i', 'pre-picked for what is left: ' + pre);
            await shot('1-chips-untouched');
            assert.ok(await until("(function(){ var b = document.querySelector('#gps-overlay .gps-bagask'); return !b || b.style.display === 'none'; })()", 25000), 'the row timed out');
            await moveTo(BALL2);
            await mark();
            assert.ok(await until("HardPanShotLog.list({ golfer: 'Ann Alpha' }).length === 2", 8000), 'the untouched row counted');
            assert.equal((await logList())[0].club, pre, 'the pre-picked club');
            // 4 - a score for hole 1, no fix on the green: the open shot closes at the green center.
            assert.ok(await rowOn());
            const pre2 = (await bar()).on;
            assert.ok(pre2, 'a club pre-picked at ' + Math.round(yd(BALL2, MID)) + ' yds');
            await ev("(function(){ currentData.scores = currentData.scores || {}; currentData.scores['p" + pid + "_h1'] = 4; return 1; })()");
            await moveTo(G.destination(BALL2, 90, 1));
            assert.ok(await until("HardPanShotLog.list({ golfer: 'Ann Alpha' }).length === 3", 8000), 'the hole\'s end closed it');
            const l3 = (await logList())[0];
            assert.equal(l3.club, pre2);
            assert.ok(Math.abs(l3.carry - yd(BALL2, MID)) <= 1, 'carry to the green center: ' + l3.carry + ' vs ' + yd(BALL2, MID).toFixed(1));
            // My bag: the 7-iron says exactly 1 shot.
            await openBag();
            const r7 = await bagRow('7i');
            assert.match(r7, /^163 \| 7-iron entered · 1 shot Reset wind: generic · 0 of 8 windy shots Shot history \(1\) 7-iron · 163 · miss right ≈ 4 short, miss left ≈ 4 long$/, r7);  // URGENT-063: + the My miss line per iron
            assert.doesNotMatch(r7, /2 shots/);
            await ev(BAGS + ".querySelector('[data-bag-row=\"7i\"]').scrollIntoView({ block: 'center' })");
            await shot('2-my-bag-1-shot');
            // 5 - Shot history: "no wind reading"; Calm does not list it; swipe + Delete = one remove.
            assert.equal(await tap(BAGS, '[data-bag-hist="7i"]'), true);
            assert.ok(await until("(function(){ var s = " + HIST + "; return !!s && s.style.display !== 'none' && !!s.querySelector('.gps-shist-row'); })()", 4000), 'Shot history');
            const row0 = await ev(HIST + ".querySelector('.gps-shist-row').innerText.replace(/\\s+/g, ' ')");
            assert.match(row0, /no wind reading/, row0);
            assert.doesNotMatch(row0, /calm/i);
            await shot('3-history-no-reading');
            await tap(HIST, '[data-shist-s="calm"]');
            assert.equal(await ev(HIST + ".querySelectorAll('.gps-shist-row').length"), 0, 'not a calm shot');
            await tap(HIST, '[data-shist-s=""]');
            await ev("(function(){ var L = HardPanShotLog, f = L.remove; window.__rm = 0; L.remove = function () { window.__rm++; return f.apply(this, arguments); }; return 1; })()");
            const id7 = await ev(HIST + ".querySelector('.gps-shist-row').getAttribute('data-shist-id')");
            await ev("(function(){ var r = " + HIST + ".querySelector('.gps-shist-row'); var b = r.getBoundingClientRect(), y = b.top + b.height / 2;"
                + " var T = function (cx) { return new Touch({ identifier: 1, target: r, clientX: cx, clientY: y }); };"
                + " r.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [T(b.left + 250)], changedTouches: [T(b.left + 250)] }));"
                + " r.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [T(b.left + 120)] })); return 1; })()");
            assert.equal(await ev("window.__rm"), 0, 'a swipe alone deletes nothing');
            await tap(HIST, '[data-shist-del="' + id7 + '"]');
            assert.equal(await ev("window.__rm"), 1, 'removed through the log exactly once');
            assert.equal((await logList('7i')).length, 0);
            assert.equal((await logList()).length, 2, 'only that one');
            await tap(HIST, '.gps-shist-done');
            assert.ok(await until("(function(){ var s = " + BAGS + "; return !!s && s.style.display !== 'none'; })()", 3000), 'back to My bag');
            assert.match(await bagRow('7i'), /^163 \| 7-iron entered Reset/, 'the 7-iron: no shots left');
            // 6 - Reset on the club the untouched row counted: its marked shot goes, the set-up number stays.
            assert.match(await bagRow(pre), / 1 shot/);
            await tap(BAGS, '[data-bag-reset="' + pre + '"]');
            assert.equal((await logList(pre)).length, pre === pre2 ? 0 : 0);
            assert.doesNotMatch(await bagRow(pre), /shot history|\d shot/i, 'Reset: no marked shots left');
            await ev("document.querySelector('#gps-overlay .gps-bag-done').click()");
            // 7 - no coordinate anywhere; nothing written.
            const stored = await ev("localStorage.getItem('hardpan_shotlog_v1') || ''");
            const writes = JSON.stringify(JSON.parse(await ev('JSON.stringify(window.__WRITES || [])')).slice(writes0));
            for (const c of [TEE, MID, BALL1, BALL2].flat()) {
                assert.ok(stored.indexOf(String(c).slice(0, 7)) === -1, 'no coordinate in the log: ' + c);
                assert.ok(writes.indexOf(String(c).slice(0, 7)) === -1, 'no coordinate written: ' + c);
            }
            assert.doesNotMatch(stored, /"(lat|lng|latitude|longitude|p|pt|coords)"/);
            assert.doesNotMatch(writes, /shotlog|bagask|"carry"/);
        } finally { await j.close(); }
    });
}
