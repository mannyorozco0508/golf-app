#!/usr/bin/env node
// ============================================================================
// HARDPAN GPS - 070 PART 2 PICTURES: THE ELEVATION ON THE PILL AND IN THE (i) SHEET
//
//   GPS_DEV_PRO=1 node tools/build-gps-app.js && node tools/gps-elev-pill-shots.js [outDir]
//
// Runs on the BUILT app (gps-beta/www, or WWW=...), in headless Chrome, one session at a time.
// A made-up links course outside the US (no USGS there), made-up golfers (Ann Alpha, Ben Bravo),
// calm and 70 F. window.fetch answers in the page; nothing reaches the network. Ann's bag is typed.
//   course   this course's own height record (1,200 ft), Ann's numbers from sea level
//   phone    no record, the terrain tile fails, the phone says 360.6 m (~1,183 ft)
//   below    the same 1,200 ft course, Ann's numbers from a 2,000 ft course ("Highland Links")
//   layoutC  the course case in layout C (one line)
//   info     the course case, the (i) sheet open
// Each at 393x852 and 375x667. Every picture is also MEASURED: the pill's second line is not cut
// off, and it touches neither the right rail nor the "20 yd" label. exit 0 = all fit.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const WWW = process.env.WWW ? path.resolve(process.env.WWW) : path.join(ROOT, 'gps-beta', 'www');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'gps-beta', 'shots-070-part2'));
if (!fs.existsSync(path.join(WWW, 'gps-view.js'))) { console.error('No built app at ' + WWW + ' - run GPS_DEV_PRO=1 node tools/build-gps-app.js'); process.exit(2); }
const { openJourney } = require('./lib/journey.js');
const { wizardSavedRound } = require('../helpers/wizard-saved-round.js');
const { makeCourseData } = require('../helpers/fixtures.js');
const { iapStub } = require('./lib/iap-stub.js');
global.window = global; require('../gps-geo.js'); const G = window.HardPanGeo;

const CODE = 'ELP070', KEY = 'elev070_pill', ID = '990000000000000071';
const TEE = [56.3433, -2.8025], MID = G.destination(TEE, 0, 350);
const P = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
const h = { 1: { g: { f: P(G.destination(MID, 180, 12)), c: P(MID), b: P(G.destination(MID, 0, 12)) }, t: { b: P(TEE) } } };
for (let n = 2; n <= 18; n++) { const t = G.destination(TEE, 90, 300 * (n - 1)); h[n] = { g: { c: P(G.destination(t, 0, 350)) }, t: { b: P(t) } }; }
const GAPI = { v: 1, built: 'shots', links: { [KEY]: ID }, courses: { [ID]: { id: ID, club: 'Firth Links Golf Club', course: '', city: 'St Andrews', state: '', lat: TEE[0], lng: TEE[1], holes: 18, h } } };
const CD = makeCourseData(18).map((x, i) => Object.assign({}, x, i === 0 ? { par: 4 } : {}));
const round = () => {
    const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Ann Alpha', 'Ben Bravo'], courseData: CD,
        overrides: { activeCourseKey: KEY, courseName: 'Firth Links Golf Club', eventName: 'Saturday game', groupSizeOverrides: { 0: 2 } } });
    r.additionalGames = {}; r.additionalGameInstances = {}; return r;
};
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:false,live:false,devPro:true,golfapiFile:'gps-golfapi-shots.js'});}});})();";
const GEO = "(function(){ var cur = { lat: " + TEE[0] + ", lng: " + TEE[1] + " }, live = {}, n = 1; window.__moveTo = function (la, ln) { cur = { lat: la, lng: ln }; Object.keys(live).forEach(function (id) { live[id](); }); return 'moved'; };"
    + " var co = function () { return { latitude: cur.lat, longitude: cur.lng, accuracy: 3, altitude: typeof window.__altM === 'number' ? window.__altM : null, altitudeAccuracy: typeof window.__altM === 'number' ? 8 : null }; };"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var id = n++; var f = function () { ok({ coords: co(), timestamp: Date.now() }); }; live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; },"
    + " getCurrentPosition: function (ok) { ok({ coords: co(), timestamp: Date.now() }); }, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";
// Nothing reaches the network: the terrain tile fails (503), everything else 404.
const NET = "(function(){ var real = window.fetch; window.fetch = function (input) { var u = typeof input === 'string' ? input : (input && input.url) || String(input);"
    + " if (/elevation-tiles-prod/.test(u)) return Promise.resolve(new Response('', { status: 503 }));"
    + " if (/^(https?:)?\\/\\//.test(u)) return Promise.resolve(new Response('{}', { status: 404 })); return real.apply(this, arguments); }; })();";
const SET = { Dr: 250, '3w': 230, '5w': 215, Hy: 200, '4i': 190, '5i': 180, '6i': 171, '7i': 163, '8i': 152, '9i': 141, PW: 130, GW: 115, SW: 95, LW: 75 };
const bag = (alt) => ({ v: 1, golfers: { 'n:ann alpha': { shots: {}, set: SET, setupDone: true, alt } } });
// THIS COURSE'S OWN HEIGHT RECORD (hardpan_celev_v1_): complete, every point 1,200 ft, its origin this course's green.
const celev = () => { const hh = {}; for (let n = 1; n <= 18; n++) { const c = h[n].g.c, t = h[n].t.b; hh[n] = [t[0], t[1], 1200, c[0], c[1], 1200]; } return { v: 1, done: true, o: P(MID), h: hh }; };
const SEED = (o) => "(function(){ var now = Date.now(), w = JSON.stringify({ at: now, src: 'weatherkit', obsAt: now - 20 * 60000, mph: 0, gustMph: null, toDeg: 180, fromDeg: 0, tempF: 70 });"
    + " ['" + KEY + "', 'gapi_" + ID + "'].forEach(function (k) { localStorage.setItem('hardpan_wind_v1_' + k, w); });"
    + (o.celev ? " localStorage.setItem('hardpan_celev_v1_" + KEY + "', " + JSON.stringify(JSON.stringify(celev())) + ");" : '')
    + (o.layout ? " localStorage.setItem('hardpan_gps_layout', '" + o.layout + "');" : '')
    + " localStorage.setItem('hardpan_bag_v1', " + JSON.stringify(JSON.stringify(bag(o.alt))) + "); })();";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const AT151 = G.destination(MID, 180, 151 * G.M_PER_YD);
const fileUrl = (q) => 'file://' + path.join(WWW, 'index.html') + '?' + q;

// The fit, measured in the page: the pill vs the rail's squares and the "20 yd" label; the second line not cut off.
const MEASURE = "(function(){ var q = function (s) { return document.querySelector('#gps-overlay ' + s); }, R = function (e) { if (!e || e.offsetParent === null) return null; var b = e.getBoundingClientRect(); return b.width && b.height ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null; };"
    + " var hit = function (a, b) { return !!(a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b); };"
    + " var pill = R(q('.gps-ld-plays')), ev = q('.gps-ld-elev'), ring = R(q('.gps-ring-lbl')), rail = [];"
    + " Array.prototype.forEach.call(document.querySelectorAll('#gps-overlay .gps-ld-rail > *'), function (c) { var b = R(c); if (b) rail.push(b); });"
    + " return JSON.stringify({ W: innerWidth, H: innerHeight, pill: pill, pillText: pill ? q('.gps-ld-plays').innerText.replace(/\\s+/g, ' ').trim() : null, elev: ev && ev.style.display !== 'none' ? ev.textContent : '',"
    + "  elevCut: !!(ev && ev.scrollWidth > ev.clientWidth + 0.5), inside: !!(pill && pill.l >= 0 && pill.r <= innerWidth), railHit: rail.some(function (b) { return hit(pill, b); }), ring: ring, ringText: ring ? q('.gps-ring-lbl').textContent : null, ringHit: hit(pill, ring),"
    + "  line: (function(){ var e = q('.gps-pl-line'); return e && e.style.display !== 'none' ? e.innerText.replace(/\\s+/g, ' ').trim() : ''; })(), layout: HardPanGps.layout ? HardPanGps.layout() : null,"
    + "  rows: Array.prototype.map.call(document.querySelectorAll('#gps-overlay .gps-plinfo-now .gps-plinfo-row'), function (d) { return d.textContent; }), playsLine: HardPanGps.playsLine(), elevNow: HardPanGps.courseElev ? HardPanGps.courseElev() : null }); })()";

async function one(name, o, vp) {
    const pid = (round().players[0] || {}).id;
    const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + NET + GEO + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';'
        + (o.altM != null ? 'window.__altM = ' + o.altM + ';' : '')
        + "try{localStorage.setItem('golfapp_me_" + CODE + "','" + pid + "');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}"
        + "if (!sessionStorage.getItem('seeded070p')) { sessionStorage.setItem('seeded070p', '1'); " + SEED(o) + " }";
    const j = await openJourney({ db: { events: { [CODE]: round() }, global_courses: { [KEY]: { name: 'Firth Links Golf Club', data: CD, location: { latitude: TEE[0], longitude: TEE[1], city: 'St Andrews', state: '' } } }, trips: {}, organizers: {}, tournaments: {} },
        viewport: vp, webgl: true, preScript: PRE });
    const ev = (x) => j.evaluate(x);
    const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
    try {
        await j.goto(fileUrl('game=' + CODE + '&group=1'), 5000);
        await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
        if (!await until("HardPanGps.isMounted() && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-map[data-ready]')", 30000)) throw new Error(name + ': the map did not open');
        await ev('__moveTo(' + AT151[0] + ',' + AT151[1] + ')');
        const want = o.layout === 'c' ? "(function(){ var e = document.querySelector('#gps-overlay .gps-pl-line'); return !!(e && e.style.display !== 'none' && /elev/.test(e.textContent)); })()"
            : "(function(){ var e = document.querySelector('#gps-overlay .gps-ld-elev'); return !!(e && e.style.display !== 'none' && e.textContent); })()";
        const ok = await until(want, 25000);
        await sleep(1500);
        if (o.info) { await ev("(function(){ var b = document.querySelector('#gps-overlay .gps-ld-plays'); if (b) b.click(); return 1; })()"); await sleep(1200); }
        const m = JSON.parse(await ev(MEASURE));
        const file = path.join(OUT, name + '-' + vp.width + 'x' + vp.height + '.png');
        await j.shot(file);
        return Object.assign({ name, file, shown: ok }, m);
    } finally { await j.close(); }
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const CASES = [
        ['1-pill-course', { celev: true, alt: { mode: 'sea' } }],
        ['2-pill-phone', { alt: { mode: 'sea' }, altM: 360.6 }],
        ['3-pill-below-baseline', { celev: true, alt: { mode: 'course', name: 'Highland Links', ft: 2000 } }],
        ['4-layout-c', { celev: true, alt: { mode: 'sea' }, layout: 'c' }],
        ['5-info-sheet', { celev: true, alt: { mode: 'sea' }, info: true }],
    ];
    const res = [], fails = [];
    for (const vp of [{ width: 393, height: 852 }, { width: 375, height: 667 }]) {
        for (const [name, o] of CASES) {
            const r = await one(name, o, vp);
            res.push(r);
            const tag = name + ' ' + vp.width + 'x' + vp.height;
            if (!r.shown) fails.push(tag + ': the elevation did not show');
            if (o.layout !== 'c' && !o.info) {
                if (r.elevCut) fails.push(tag + ': the second line is cut off');
                if (r.railHit) fails.push(tag + ': the pill touches the rail');
                if (r.ringHit) fails.push(tag + ': the pill touches the "' + r.ringText + '" label');
                if (!r.inside) fails.push(tag + ': the pill is off the screen');
            }
        }
    }
    console.log(JSON.stringify({ out: OUT, results: res.map((r) => ({ name: r.name, vp: r.W + 'x' + r.H, file: r.file, layout: r.layout, pillText: r.pillText, elev: r.elev, line: r.line, rows: r.rows,
        elevCut: r.elevCut, railHit: r.railHit, ringHit: r.ringHit, ring: r.ringText, pill: r.pill, playsLine: r.playsLine, elevNow: r.elevNow })), fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
