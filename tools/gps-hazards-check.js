#!/usr/bin/env node
// ============================================================================
// HARDPAN GPS - THE HAZARDS + LAYUP SHEET, OPENED (008, switch hazards)
//
//   node tools/gps-hazards-check.js     exit 0 = passed, 1 = broke, 2 = could not run
//
// Cold Chrome, the app, a subscriber (tools/lib/iap-stub.js), and a GolfAPI course
// the way the app carries one (window.HardPanGolfApi): Caledonia's tees and greens,
// with hazards on hole 1 only - a fairway bunker right (front + back edge), water left
// (one point) and a bunker the golfer has already passed. The golfer stands 40% of the
// way down hole 1 (a stand-in GPS; window.__moveTo walks them).
//   1  "Hazards" opens the sheet: each hazard's reach / carry in yards from the golfer,
//      as an inline haversine (no gps-geo code) says; the passed bunker "behind you";
//      lay up to 50 / 75 / 100 / 125 / 150 = (center - leave) from you.
//   2  the golfer walks 20 m on: the numbers follow.
//   3  hole 2 (no hazard data): the sheet says so plainly; layups still there.
//   4  the 008 switch off: no Hazards button, no sheet in the page.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const HERE = path.join(__dirname, '..');
if (!fs.existsSync(path.join(HERE, 'gps-view.js'))) { console.error('Consumer tree (GPS_ENABLED=0): no GPS.'); process.exit(2); }
const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
const { wizardSavedRound } = require(path.join(HERE, 'helpers/wizard-saved-round.js'));
const { iapStub } = require(path.join(HERE, 'tools/lib/iap-stub.js'));
const table = require(path.join(HERE, 'gps-courses.js'));

const CODE = 'HAZARD';
const R = 6371008.8, rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;
const hav = (a, b) => { const s = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const brg = (a, b) => { const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0])), x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1])); return (deg(Math.atan2(y, x)) + 360) % 360; };
const dest = (p, b, m) => { const d = m / R, t = rad(b), la = rad(p[0]), lo = rad(p[1]); const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(t)); return [deg(la2), deg(lo + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2)))]; };
const r6 = (p) => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6];
const yd = (m) => String(Math.round(m / 0.9144));

// The GolfAPI course, from the bundled Caledonia holes.
const H = (n) => table.caledonia.holes[String(n)].osm;
const T1 = H(1).tee, G1 = H(1).mid, B1 = brg(T1, G1);
const along = (m, side) => { const p = dest(T1, B1, m); return side ? dest(p, B1 + 90, side) : p; };
const HZ1 = [['fb', 'R', along(210, 18)], ['fb', 'R', along(226, 18)], ['w', 'L', along(255, -20)], ['fb', 'L', along(60, -12)], ['fb', 'L', along(72, -12)]].map((z) => [z[0], z[1]].concat(r6(z[2])));
const holes = {};
for (let n = 1; n <= 18; n++) {
    const o = H(n), b = brg(o.tee, o.mid);
    holes[n] = { g: { f: r6(dest(o.mid, b, -12)), c: r6(o.mid), b: r6(dest(o.mid, b, 12)) }, t: { b: r6(o.tee) } };
}
holes[1].z = HZ1;
const GA = { built: true, courses: { CHK1: { id: 'CHK1', club: 'Caledonia Golf & Fish Club', course: 'Caledonia', lat: T1[0], lng: T1[1], holes: 18, h: holes } }, links: { caledonia: 'CHK1' } };

const ME = along(0.4 * hav(T1, G1));
const ME2 = along(0.4 * hav(T1, G1) + 20);
const expectFrom = (me) => {
    const d = (p) => hav(me, [p[2], p[3]]);
    return { bunker: 'reach ' + yd(d(HZ1[0])) + ' · carry ' + yd(d(HZ1[1])), water: 'reach ' + yd(d(HZ1[2])) + ' · carry —',
             lay: [50, 75, 100, 125, 150].filter((l) => l * 0.9144 < hav(me, G1)).map((l) => 'Lay up to ' + l + ' = ' + yd(hav(me, G1) - l * 0.9144) + ' from you') };
};

const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});";
const APP = 'window.__hardpanDoors = true;';
const CFG = (features) => "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,golfapi:true,golfapiFile:'gps-golfapi-check.js',esriKey:''" + (features ? ',features:' + JSON.stringify(features) : '') + "});}});})();"
    + 'window.HardPanGolfApi = ' + JSON.stringify(GA) + ';';
const GEO = (p) => "(function(){ var cur = { lat: " + p[0] + ", lng: " + p[1] + " }, live = {}, n = 1;"
    + " window.__moveTo = function (la, ln) { cur = { lat: la, lng: ln }; Object.keys(live).forEach(function (id) { live[id](); }); return 'moved'; };"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var id = n++; var f = function () { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 5 }, timestamp: Date.now() }); };"
    + " live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; }, getCurrentPosition: function () {}, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";
const SEED = "(function(){ try { if (sessionStorage.getItem('__seeded')) return; sessionStorage.setItem('__seeded','1'); localStorage.setItem('hardpan_round_side', 'gps|" + CODE + "'); localStorage.setItem('hardpan_last_hole_" + CODE + "', '1'); localStorage.setItem('hardpan_gps_whoasked_" + CODE + "', '1'); localStorage.setItem('hardpan_gps_autoadvance', '0'); } catch (e) {} })();";
function round() {
    const r = wizardSavedRound({ code: CODE, golfers: 2, names: ['Manny Orozco', 'Joe Russo'], hcps: [9, 12], ownerUid: 'anon-cold', thru: 0, flights: false,
        overrides: { additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', startingHole: 1 } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    return r;
}
const BLOCK = ['*nationalmap.gov*', '*arcgis*', '*weather.gov*', '*epqs*', '*overpass*', '*cloudfunctions.net*'];
const go = async (o) => {
    const r = await arriveCold({ url: fileUrl('index.html', 'game=' + CODE), db: { events: { [CODE]: round() }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} },
        settleMs: 3500, viewport: { width: 390, height: 844 }, webgl: true, blockUrls: BLOCK,
        preScript: CFG(o.features) + APP + ERR + GEO(ME) + SEED + iapStub({ active: true }), steps: o.steps });
    if (!r.ok) throw new Error(r.reason);
    return r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
};
const OPEN = { expression: "(function(){ if (window.HardPanGps && HardPanGps.side() === 'gps') return 'on'; var b = document.querySelector('#gps-side-toggle .gps-side-gps'); if (b) b.click(); return 'tap'; })()" };
const ST = { expression: "JSON.stringify({ hole: HardPanGps.hole(), side: HardPanGps.side(),"
    + " btn: (function(){ var b = document.querySelector('#gps-overlay .gps-hz-btn'); return b ? getComputedStyle(b).display !== 'none' : null; })(),"
    + " sheet: (function(){ var s = document.querySelector('#gps-overlay .gps-hzs'); if (!s) return null; if (s.style.display === 'none') return '';"
    + "   return { title: s.querySelector('.gps-hzs-title').textContent, sub: s.querySelector('.gps-hzs-sub').textContent, none: (s.querySelector('.gps-hzs-none') || {}).textContent || null,"
    + "     rows: [].map.call(s.querySelectorAll('.gps-hzs-list .gps-hzs-row'), function (r) { return [r.querySelector('.gps-hzs-name').textContent, r.querySelector('.gps-hzs-nums').textContent]; }),"
    + "     lay: [].map.call(s.querySelectorAll('.gps-hzs-lay .gps-hzs-row'), function (r) { return r.querySelector('.gps-hzs-name').textContent + ' ' + r.querySelector('.gps-hzs-nums').textContent; }) }; })(),"
    + " e: window.__e })" };
const CLICK = (sel) => ({ expression: "(function(){ var b = document.querySelector(" + JSON.stringify(sel) + "); if (!b) return 'none'; b.click(); return 'ok'; })()" });
const MOVE = (p) => ({ expression: 'window.__moveTo(' + p[0] + ',' + p[1] + ')' });

(async () => {
    const fails = [], report = {};
    const f = (c, m) => { if (!c) fails.push(m); };
    let s = await go({ steps: [{ sleep: 2500 }, OPEN, { sleep: 3000 }, ST, CLICK('#gps-overlay .gps-hz-btn'), { sleep: 500 }, ST, MOVE(ME2), { sleep: 1600 }, ST,
        CLICK('#gps-overlay .gps-hzs-done'), { sleep: 300 }, CLICK('#gps-overlay .gps-next'), { sleep: 1500 }, CLICK('#gps-overlay .gps-hz-btn'), { sleep: 500 }, ST] });
    report.on = s.map((x) => [x.hole, x.btn, x.sheet]);
    const e1 = expectFrom(ME), e2 = expectFrom(ME2);
    const [closed, open1, moved, hole2] = s;
    f(closed.hole === 1 && closed.side === 'gps' && closed.btn === true && closed.sheet === '', '0: GPS on hole 1 with a Hazards button (sheet closed): ' + JSON.stringify(closed));
    const o1 = open1.sheet || {};
    f(o1.title === 'Hazards · Hole 1' && o1.sub === 'Yards from you', '1: the sheet head: ' + JSON.stringify([o1.title, o1.sub]));
    f(JSON.stringify(o1.rows) === JSON.stringify([['Fairway bunker right', e1.bunker], ['Water left', e1.water], ['Fairway bunker left', 'behind you']]),
        '1: hazards ' + JSON.stringify(o1.rows) + ' expected ' + JSON.stringify([e1.bunker, e1.water, 'behind you']));
    f(JSON.stringify(o1.lay) === JSON.stringify(e1.lay) && e1.lay.length === 5, '1: layups ' + JSON.stringify(o1.lay) + ' expected ' + JSON.stringify(e1.lay));
    const o2 = moved.sheet || {};
    f(o2.rows && o2.rows[0] && o2.rows[0][1] === e2.bunker && o2.rows[1][1] === e2.water && e2.bunker !== e1.bunker, '2: walking 20 m did not move the numbers: ' + JSON.stringify(o2.rows) + ' expected ' + e2.bunker);
    f(JSON.stringify(o2.lay) === JSON.stringify(e2.lay), '2: layups after the walk ' + JSON.stringify(o2.lay) + ' expected ' + JSON.stringify(e2.lay));
    const o3 = hole2.sheet || {};
    f(hole2.hole === 2 && o3.title === 'Hazards · Hole 2' && o3.none === 'No hazard data for this hole.' && !o3.rows.length, '3: a hole with no hazard data: ' + JSON.stringify(o3));
    f(o3.lay && o3.lay.length === 5 && /^Lay up to 50 = \d+ from you$/.test(o3.lay[0]), '3: layups on a hole with no hazards: ' + JSON.stringify(o3.lay));
    s.forEach((x) => { if (x.e && x.e.length) fails.push('page errors ' + x.e.join(' | ')); });

    s = await go({ features: { hazards: false }, steps: [{ sleep: 2500 }, OPEN, { sleep: 3000 }, ST] });
    report.off = s.map((x) => [x.hole, x.btn, x.sheet]);
    f(s[0].side === 'gps' && s[0].btn === null && s[0].sheet === null, '4: switch off, but the Hazards button / sheet is in the page: ' + JSON.stringify(s[0]));

    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
