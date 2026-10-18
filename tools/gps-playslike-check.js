#!/usr/bin/env node
// ============================================================================
// HARDPAN GPS - PLAYS-LIKE, SPELLED OUT, PLAYED (mailbox 009 part B)
//
//   node tools/gps-playslike-check.js     exit 0 = passed, 1 = broke, 2 = could not run
//
// Cold Chrome, the app, a subscriber (tools/lib/iap-stub.js), Caledonia's bundled holes,
// a stand-in GPS (the golfer ~160 yds from hole 1's green, 15 m right of the line), and
// window.fetch stubbed IN THE PAGE for USGS EPQS (the ground rises 0.12 ft per metre
// toward the green) and the NWS (the latest observation: 8 mph, 80 F, from where the
// arm says). A bag with the golfer's own numbers is on the phone. Nothing leaves the page.
//   1  Uphill, INTO the wind: "Plays N: +E uphill, +W into wind (8 mph), -T warm ->
//      5-iron (your 185)" - N, E, W, T from the handoff's formula worked out inline; the
//      club the bag's for the PLAYS-LIKE number; the plain "Suggested:" line steps aside.
//   2  The same, DOWNWIND: "-W downwind (8 mph)" and |W| is half of the into-wind W (+-1).
//   3  CROSSWIND (from the golfer's right): no wind part, "aim 6 yds right".
//   4  playsBreakdown off: no line in the page; "Suggested:" (the plays-like number) is back.
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

const CODE = 'PLAYS';
// Inline geometry - shares no code with gps-geo.
const R = 6371008.8, rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;
const hav = (a, b) => { const s = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const brg = (a, b) => { const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0])), x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1])); return (deg(Math.atan2(y, x)) + 360) % 360; };
const dest = (p, b, m) => { const d = m / R, t = rad(b), la = rad(p[0]), lo = rad(p[1]); const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(t)); return [deg(la2), deg(lo + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2)))]; };
const H1 = table.caledonia.holes['1'].osm, T1 = H1.tee, G1 = H1.mid, B1 = brg(T1, G1), L1 = hav(T1, G1);
// The golfer: 160 yds short of the center along the line, then 15 m to the right of it.
const ME = dest(dest(T1, B1, L1 - 160 * 0.9144), B1 + 90, 15);
// The ground: rises 0.12 ft per metre along the tee -> green direction (flat across).
const SLOPE = 0.12;
const alongM = (p) => hav(T1, p) * Math.cos(rad(brg(T1, p) - B1));
const ftAt = (p) => Math.round(20 + SLOPE * alongM(p));
const MPH = 8, TEMP = 80;
const BAG = { '4i': 195, '5i': 185, '6i': 174, '7i': 163, '8i': 152, '9i': 141, PW: 130 };
const NAMES = { '4i': '4-iron', '5i': '5-iron', '6i': '6-iron', '7i': '7-iron', '8i': '8-iron', '9i': '9-iron', PW: 'Pitching wedge' };
const clubFor = (yd) => { const ks = Object.keys(BAG).filter((c) => BAG[c] >= yd).sort((a, b) => BAG[a] - BAG[b]); const c = ks[0] || '4i'; return NAMES[c] + ' (your ' + BAG[c] + ')'; };
// The handoff's formula, inline: E = dft / 3; head = mph cos(from - shot); W = D 1% / 0.5% per
// mph; T = D 0.1% per degree from 70.
function expect(fromDeg) {
    const D = hav(ME, G1) / 0.9144, shot = brg(ME, G1);
    const E = (20 + SLOPE * alongM(G1) - (20 + SLOPE * alongM(ME))) / 3;
    const head = MPH * Math.cos(rad(fromDeg - shot)), W = head > 0 ? D * 0.01 * head : D * 0.005 * head;
    const T = D * 0.001 * (70 - TEMP);
    const cross = -MPH * Math.sin(rad(fromDeg - shot));
    return { D, E, W, T, plays: D + E + W + T, aim: Math.round(D * 0.005 * Math.abs(cross)), aimSide: cross > 0 ? 'left' : 'right' };
}
const INTO = brg(ME, G1), DOWN = (INTO + 180) % 360, CROSS = (INTO + 90) % 360;

const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});";
const APP = 'window.__hardpanDoors = true;';
const CFG = (features, more) => "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,esriKey:'',elevGapMs:0}" + (features ? ',{features:' + JSON.stringify(features) + '}' : '') + (more ? ',' + JSON.stringify(more) : '') + ");}});})();";
const GEO = (p) => "(function(){ var cur = { lat: " + p[0] + ", lng: " + p[1] + " }, live = {}, n = 1;"
    + " window.__moveTo = function (la, ln) { cur = { lat: la, lng: ln }; Object.keys(live).forEach(function (id) { live[id](); }); return 'moved'; };"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var id = n++; var f = function () { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 5 }, timestamp: Date.now() }); };"
    + " live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; }, getCurrentPosition: function () {}, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";
// THE STAND-INS, in the page: EPQS answers the ground's height; NWS the latest observation.
// Every EPQS request is logged with how many were in flight at once.
const FETCH = (fromDeg) => "(function(){ var real = window.fetch; window.__epqs = []; window.__nws = []; var busy = 0; window.__epqsMaxBusy = 0;"
    + " var T1 = " + JSON.stringify(T1) + ", B1 = " + B1 + ", SLOPE = " + SLOPE + ";"
    + " function rad(d) { return d * Math.PI / 180; }"
    + " function hav(a, b) { var s = Math.pow(Math.sin(rad(b[0] - a[0]) / 2), 2) + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.pow(Math.sin(rad(b[1] - a[1]) / 2), 2); return 2 * 6371008.8 * Math.asin(Math.sqrt(s)); }"
    + " function brg(a, b) { var y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0])), x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1])); return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; }"
    + " function json(o) { return new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } }); }"
    + " window.fetch = function (u, o) { var url = String(u && u.url || u);"
    + "  if (/epqs/.test(url)) { var q = new URL(url).searchParams, p = [+q.get('y'), +q.get('x')]; window.__epqs.push(p); busy++; window.__epqsMaxBusy = Math.max(window.__epqsMaxBusy, busy);"
    + "   var ft = 20 + SLOPE * hav(T1, p) * Math.cos(rad(brg(T1, p) - B1));"
    + "   return new Promise(function (ok) { setTimeout(function () { busy--; ok(json({ value: Math.round(ft) })); }, 4); }); }"
    + "  if (/api\\.weather\\.gov/.test(url)) { window.__nws.push(url);"
    + "   if (/\\/points\\//.test(url)) return Promise.resolve(json({ properties: { forecastHourly: 'https://api.weather.gov/gridpoints/XX/1,2/forecast/hourly', observationStations: 'https://api.weather.gov/gridpoints/XX/1,2/stations' } }));"
    + "   if (/\\/stations$/.test(url)) return Promise.resolve(json({ features: [{ id: 'https://api.weather.gov/stations/KXXX' }] }));"
    + "   if (/observations\\/latest/.test(url)) return Promise.resolve(json({ properties: { timestamp: new Date().toISOString(), windSpeed: { unitCode: 'wmoUnit:mi_h-1', value: " + MPH + " }, windDirection: { value: " + fromDeg + " }, temperature: { unitCode: 'wmoUnit:degF', value: " + TEMP + " } } }));"
    + "   return Promise.resolve(new Response('{}', { status: 404 })); }"
    + "  return real.apply(this, arguments); }; })();";
const SEED = (more) => "(function(){ try { if (sessionStorage.getItem('__seeded')) return; sessionStorage.setItem('__seeded','1'); localStorage.setItem('hardpan_round_side', 'gps|" + CODE + "'); localStorage.setItem('hardpan_last_hole_" + CODE + "', '1'); localStorage.setItem('hardpan_gps_whoasked_" + CODE + "', '1'); localStorage.setItem('hardpan_gps_autoadvance', '0');"
    + " localStorage.setItem('hardpan_bag_v1', " + JSON.stringify(JSON.stringify({ v: 1, golfers: { 'n:manny orozco': { shots: {}, set: BAG, setupAt: 1 } } })) + "); " + (more || '') + " } catch (e) {} })();";
function round() {
    const r = wizardSavedRound({ code: CODE, golfers: 2, names: ['Manny Orozco', 'Joe Russo'], hcps: [9, 12], ownerUid: 'anon-cold', thru: 0, flights: false,
        overrides: { additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', startingHole: 1 } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    return r;
}
const BLOCK = ['*nationalmap.gov*', '*arcgis*', '*weather.gov*', '*epqs*', '*overpass*', '*cloudfunctions.net*'];
const go = async (o) => {
    const r = await arriveCold({ url: fileUrl('index.html', 'game=' + CODE), db: { events: { [CODE]: round() }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} },
        settleMs: 3500, viewport: { width: 390, height: 844 }, webgl: true, blockUrls: BLOCK, profileDir: o.profileDir,
        preScript: CFG(o.features, o.cfg) + APP + ERR + GEO(o.at || ME) + FETCH(o.wind == null ? INTO : o.wind) + SEED(o.seed) + iapStub({ active: true }), steps: o.steps });
    if (!r.ok) throw new Error(r.reason);
    return r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
};
const OPEN = { expression: "(function(){ if (window.HardPanGps && HardPanGps.side() === 'gps') return 'on'; var b = document.querySelector('#gps-side-toggle .gps-side-gps'); if (b) b.click(); return 'tap'; })()" };
const vis = (sel) => "(function(){ var e = document.querySelector('#gps-overlay " + sel + "'); return e ? (e.style.display === 'none' ? '' : e.textContent) : null; })()";
const ST = { expression: "JSON.stringify({ hole: HardPanGps.hole(), side: HardPanGps.side(), m: (document.querySelector('#gps-overlay .gps-m') || {}).textContent,"
    + " line: " + vis('.gps-pl-text') + ", lineEl: !!document.querySelector('#gps-overlay .gps-pl-line'), sug: " + vis('.gps-suggest') + ","
    + " plays: (document.querySelector('#gps-overlay .gps-plays') || {}).textContent || '', terms: (document.querySelector('#gps-overlay .gps-plays') || { getAttribute: function () { return ''; } }).getAttribute('data-terms'),"
    + " windBox: (document.querySelector('#gps-overlay .gps-wind-mph') || {}).textContent || '',"
    + " epqs: window.__epqs, nws: window.__nws.length, maxBusy: window.__epqsMaxBusy, e: window.__e })" };
const W = (ms) => ({ sleep: ms });
const LINE_UP = { waitFor: "(function(){ var e = document.querySelector('#gps-overlay .gps-pl-text'); return !!(e && /uphill/.test(e.textContent) && /mph|aim/.test(e.textContent)); })()", timeout: 25000 };
const START = [W(2500), OPEN, W(3000)];

(async () => {
    const fails = [], report = {};
    const f = (c, m) => { if (!c) fails.push(m); };
    const errs = (list, tag) => list.forEach((x) => { if (x.e && x.e.length) fails.push(tag + ': page errors ' + x.e.join(' | ')); });
    const RX = /^Plays (\d+): \+(\d+) uphill, ([+-]\d+) (into wind|downwind) \(8 mph\), -(\d+) warm → (.+)$/;

    // 1: uphill, into the wind.
    let s = await go({ wind: INTO, steps: START.concat([LINE_UP, W(800), ST]) });
    const into = s[0], ei = expect(INTO);
    report.into = { line: into.line, sug: into.sug, expected: { plays: Math.round(ei.plays), E: Math.round(ei.E), W: Math.round(ei.W), T: Math.round(ei.T) } };
    const mi = RX.exec(into.line || '');
    f(mi && mi[4] === 'into wind', '1: the into-wind line: ' + JSON.stringify(into.line));
    if (mi) {
        f(Math.abs(+mi[1] - ei.plays) <= 2, '1: plays ' + mi[1] + ', expected ~' + ei.plays.toFixed(1) + ' (inline)');
        f(Math.abs(+mi[2] - ei.E) <= 1, '1: uphill +' + mi[2] + ', expected ~' + ei.E.toFixed(1));
        f(Math.abs(+mi[3] - ei.W) <= 1, '1: into wind ' + mi[3] + ', expected ~' + ei.W.toFixed(1));
        f(Math.abs(-mi[5] - ei.T) <= 1, '1: warm -' + mi[5] + ', expected ~' + ei.T.toFixed(1));
        f(mi[6] === clubFor(+mi[1]), '1: the club for the PLAYS-LIKE ' + mi[1] + ' is ' + clubFor(+mi[1]) + ', the line says ' + mi[6]);
        f(clubFor(+mi[1]) !== clubFor(hav(ME, G1) / 0.9144), '1: (the check proves nothing: the raw distance picks the same club)');
    }
    f(into.sug === '', '1: the plain "Suggested:" line is shown too: ' + into.sug);
    errs(s, 'into');

    // 2: the same shot, downwind: the change is half.
    s = await go({ wind: DOWN, steps: START.concat([LINE_UP, W(800), ST]) });
    const down = s[0], ed = expect(DOWN);
    report.down = { line: down.line, expected: { plays: Math.round(ed.plays), W: Math.round(ed.W) } };
    const md = RX.exec(down.line || '');
    f(md && md[4] === 'downwind', '2: the downwind line: ' + JSON.stringify(down.line));
    if (md && mi) {
        f(+md[3] < 0 && Math.abs(Math.abs(+md[3]) - Math.abs(+mi[3]) / 2) <= 1, '2: downwind ' + md[3] + ' is not half of into-wind ' + mi[3]);
        f(Math.abs(+md[1] - ed.plays) <= 2, '2: plays ' + md[1] + ', expected ~' + ed.plays.toFixed(1));
        f(+md[1] < +mi[1], '2: downwind plays shorter than into the wind');
        f(md[6] === clubFor(+md[1]), '2: club ' + md[6] + ' vs ' + clubFor(+md[1]));
    }
    errs(s, 'down');

    // 3: a crosswind from the right: no distance, the aim-off.
    s = await go({ wind: CROSS, steps: START.concat([LINE_UP, W(800), ST]) });
    const cr = s[0], ec = expect(CROSS);
    report.cross = { line: cr.line, expected: { aim: ec.aim + ' ' + ec.aimSide } };
    f(cr.line && !/wind/.test(cr.line) && new RegExp('· aim ' + ec.aim + ' yds ' + ec.aimSide + '$').test(cr.line), '3: crosswind: ' + JSON.stringify(cr.line) + ' (expected "aim ' + ec.aim + ' yds ' + ec.aimSide + '", no wind part)');
    errs(s, 'cross');

    // 4: playsBreakdown off: no line; the plain suggestion is back (for the plays-like number).
    s = await go({ wind: INTO, features: { playsBreakdown: false }, steps: START.concat([{ waitFor: "/elev/.test((document.querySelector('#gps-overlay .gps-plays') || { getAttribute: function () { return ''; } }).getAttribute('data-terms') || '') && /wind/.test(document.querySelector('#gps-overlay .gps-plays').getAttribute('data-terms'))", timeout: 25000 }, W(800), ST]) });
    report.off = { lineEl: s[0].lineEl, sug: s[0].sug, plays: s[0].plays };
    const pn = /^plays ~(\d+)$/.exec(s[0].plays || '');
    f(s[0].lineEl === false, '4: the line is in the page with its switch off');
    f(pn && s[0].sug === 'Suggested: ' + clubFor(+pn[1]), '4: switch off - the plain suggestion for plays ' + (pn && pn[1]) + ': ' + s[0].sug);
    errs(s, 'off');

    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
