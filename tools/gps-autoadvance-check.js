#!/usr/bin/env node
// ============================================================================
// HARDPAN GPS - AUTO-ADVANCE HOLES, WALKED (008, switch autoAdvance)
//
//   node tools/gps-autoadvance-check.js     exit 0 = passed, 1 = broke, 2 = could not run
//
// Cold Chrome, the app (window.__hardpanDoors), a subscriber (tools/lib/iap-stub.js),
// Caledonia's bundled holes, and a stand-in GPS that reports where the golfer is
// once a second (window.__moveTo walks them). The golfer:
//   A  stands on hole 4's green (no jump), walks to hole 5's tee, waits: after ~10 s
//      GPS is on 5 with "Hole 5 ->"; Undo -> hole 4 and no second jump for 2 min
//      (URGENT-045), even off the tee and back.
//   B  taps Enter score on 4 (the card's score box - the 012 score sheet switched off) and
//      walks to 5's tee: no jump while the score is open; back to the map -> 5.
//   B2 the same with the score sheet (012): no jump while the sheet is up; closed -> 5.
//   C  hole 4's green set (a round pin) 15 m from 5's tee: standing on that green, on
//      the tee point itself, no jump; 10 m past the tee (off the green) -> 5.
//   D  a round off the 10th: from 18's green to 1's tee -> 1 ("Hole 1 >").
//   E  Tools > Auto-advance holes -> Off (remembered on the phone): no jump.
//   F  the 008 switch off: no toggle, no toast in the page, no jump.
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

const CODE = 'AUTOADV';
const H = (n) => table.caledonia.holes[String(n)].osm;
const R = 6371008.8;
const east = (p, m) => [p[0], p[1] + (m / (R * Math.cos(p[0] * Math.PI / 180))) * 180 / Math.PI];
const T5 = H(5).tee, G4 = H(4).mid, G18 = H(18).mid, T1 = H(1).tee;

const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});";
const APP = 'window.__hardpanDoors = true;';
// The bundled holes on the web (OpenStreetMap on, GPS LIVE off), no Esri key (no tile
// requests to Esri), and the 008 switches as the arm says.
const CFG = (features) => "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,esriKey:''" + (features ? ',features:' + JSON.stringify(features) : '') + "});}});})();";
// The stand-in GPS: a fix a second, from wherever __moveTo last put the golfer.
const GEO = (p) => "(function(){ var cur = { lat: " + p[0] + ", lng: " + p[1] + " }, live = {}, n = 1;"
    + " window.__moveTo = function (la, ln) { cur = { lat: la, lng: ln }; Object.keys(live).forEach(function (id) { live[id](); }); return 'moved'; };"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var id = n++; var f = function () { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 5 }, timestamp: Date.now() }); };"
    + " live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; }, getCurrentPosition: function () {}, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";
const SEED = (hole, more) => "(function(){ try { if (sessionStorage.getItem('__seeded')) return; sessionStorage.setItem('__seeded','1'); localStorage.setItem('hardpan_round_side', 'gps|" + CODE + "'); localStorage.setItem('hardpan_last_hole_" + CODE + "', '" + hole + "'); localStorage.setItem('hardpan_gps_whoasked_" + CODE + "', '1'); " + (more || '') + " } catch (e) {} })();";
function round(extra) {
    const r = wizardSavedRound({ code: CODE, golfers: 2, names: ['Manny Orozco', 'Joe Russo'], hcps: [9, 12], ownerUid: 'anon-cold', thru: 0, flights: false,
        overrides: Object.assign({ additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', startingHole: 1 }, extra || {}) });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    return r;
}
const DB = (r) => ({ events: { [CODE]: r }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} });
const BLOCK = ['*nationalmap.gov*', '*arcgis*', '*weather.gov*', '*epqs*', '*overpass*', '*cloudfunctions.net*'];
const go = async (o) => {
    const r = await arriveCold({ url: fileUrl('index.html', 'game=' + CODE), db: DB(o.round), settleMs: 3500, viewport: { width: 390, height: 844 }, webgl: true, blockUrls: BLOCK,
        preScript: CFG(o.features) + APP + ERR + GEO(o.at) + SEED(o.hole, o.seed) + iapStub({ active: true }), steps: o.steps });
    if (!r.ok) throw new Error(r.reason);
    return r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
};
const OPEN = { expression: "(function(){ if (window.HardPanGps && HardPanGps.side() === 'gps') return 'on'; var b = document.querySelector('#gps-side-toggle .gps-side-gps'); if (b) b.click(); return 'tap'; })()" };
const ST = { expression: "JSON.stringify({ hole: HardPanGps.hole(), side: HardPanGps.side(), card: typeof currentViewedHole !== 'undefined' ? currentViewedHole : null,"
    + " toast: (function(){ var t = document.querySelector('#gps-overlay .gps-aa-toast'); return t ? (t.style.display === 'none' ? '' : t.innerText.replace(/\\s+/g, ' ').trim()) : null; })(),"
    + " toggle: (function(){ var t = document.querySelector('#gps-overlay .gps-aa-toggle'); return t ? t.textContent : null; })(),"
    + " key: localStorage.getItem('hardpan_gps_autoadvance'), active: document.activeElement ? (document.activeElement.className || document.activeElement.tagName) : null,"
    + " e: window.__e })" };
const MOVE = (p) => ({ expression: 'window.__moveTo(' + p[0] + ',' + p[1] + ')' });
const CLICK = (sel) => ({ expression: "(function(){ var b = document.querySelector(" + JSON.stringify(sel) + "); if (!b) return 'none'; b.click(); return 'ok'; })()" });
const WAIT = (ms) => ({ sleep: ms });
const START = [WAIT(2500), OPEN, WAIT(2500)];

(async () => {
    const fails = [], report = {};
    const f = (c, m) => { if (!c) fails.push(m); };
    const errs = (list, tag) => list.forEach((x) => { if (x.e && x.e.length) fails.push(tag + ': page errors ' + x.e.join(' | ')); });

    // A: the walk, Undo, a second visit.
    let s = await go({ round: round(), hole: 4, at: G4, steps: START.concat([ST, WAIT(12000), ST, MOVE(T5), WAIT(4000), ST, WAIT(8000), ST,
        CLICK('#gps-overlay .gps-aa-undo'), WAIT(700), ST, WAIT(12000), ST, MOVE(G4), WAIT(2500), MOVE(T5), WAIT(12500), ST]) });
    report.A = s.map((x) => [x.hole, x.toast]);
    f(s[0].hole === 4 && s[0].side === 'gps', 'A: did not open GPS on hole 4: ' + JSON.stringify(s[0]));
    f(s[1].hole === 4, 'A: jumped while the golfer stood on hole 4\'s green: ' + s[1].hole);
    f(s[2].hole === 4 && !s[2].toast, 'A: jumped before ~10 s on the tee: ' + JSON.stringify([s[2].hole, s[2].toast]));
    f(s[3].hole === 5 && s[3].card === 5 && s[3].toast === 'Hole 5 \u2192 Undo', 'A: ~10 s on hole 5\'s tee did not move GPS (and the card) to 5 with "Hole 5 >": ' + JSON.stringify([s[3].hole, s[3].card, s[3].toast]));
    f(s[4].hole === 4 && s[4].card === 4 && !s[4].toast, 'A: Undo did not go back to hole 4: ' + JSON.stringify([s[4].hole, s[4].card, s[4].toast]));
    f(s[5].hole === 4, 'A: jumped again on the same tee visit after Undo: ' + s[5].hole);
    // URGENT-045: Undo holds auto-advance for 2 minutes - a new visit inside them does not advance.
    f(s[6].hole === 4, 'A: advanced again within 2 min of Undo: ' + s[6].hole);
    errs(s, 'A');

    // B: Enter score is open (the card's box, the 012 score sheet off) - no jump; back to the map - the jump.
    s = await go({ round: round(), hole: 4, at: G4, features: { autoAdvance: true, scoreSheet: false }, steps: START.concat([CLICK('#gps-overlay .gps-score'), WAIT(800), MOVE(T5), WAIT(13000), ST,
        { expression: "(function(){ if (document.activeElement) document.activeElement.blur(); return 'blur'; })()" }, OPEN, WAIT(12500), ST]) });
    report.B = s.map((x) => [x.hole, x.side, x.active]);
    f(s[0].hole === 4 && s[0].side === 'bets' && /score-input/.test(s[0].active || ''), 'B: jumped (or the score box closed) while a score was being entered: ' + JSON.stringify([s[0].hole, s[0].side, s[0].active]));
    f(s[1].hole === 5 && s[1].side === 'gps', 'B: back on the map on 5\'s tee, no advance: ' + JSON.stringify([s[1].hole, s[1].side]));
    errs(s, 'B');

    // B2 (012): Enter score opens the score sheet over the map - no jump while it is up; closed - the jump.
    s = await go({ round: round(), hole: 4, at: G4, steps: START.concat([CLICK('#gps-overlay .gps-score'), WAIT(800), MOVE(T5), WAIT(13000), ST,
        { expression: "(function(){ var w = document.getElementById('hp-score-sheet'); if (!w) return 'none'; w.click(); return 'closed'; })()" }, WAIT(12500), ST]) });
    report.B2 = s.map((x) => [x.hole, x.side]);
    f(s[0].hole === 4 && s[0].side === 'gps', 'B2: jumped while the score sheet was up: ' + JSON.stringify(report.B2[0]));
    f(s[1].hole === 5 && s[1].side === 'gps', 'B2: the sheet closed on 5\'s tee, no advance: ' + JSON.stringify(report.B2[1]));
    errs(s, 'B2');

    // C: hole 4's green 15 m from 5's tee (a round pin): on it, no jump; past the tee, the jump.
    const pin = east(T5, -15);
    s = await go({ round: round({ gpsPins: { h4: { mid: { lat: pin[0], lng: pin[1] }, at: 1, by: 'tap' } } }), hole: 4, at: east(T5, -12),
        steps: START.concat([WAIT(12000), ST, MOVE(T5), WAIT(12000), ST, MOVE(east(T5, 10)), WAIT(12500), ST]) });
    report.C = s.map((x) => x.hole);
    f(s[0].hole === 4 && s[1].hole === 4, 'C: jumped while the golfer was on the current green (next tee 15 m away): ' + JSON.stringify(report.C));
    f(s[2].hole === 5, 'C: off the green, on the tee: no advance: ' + s[2].hole);
    errs(s, 'C');

    // D: start on 10 - from 18 to 1.
    s = await go({ round: round({ startingHole: 10 }), hole: 18, at: G18, steps: START.concat([ST, MOVE(T1), WAIT(12500), ST]) });
    report.D = s.map((x) => [x.hole, x.toast]);
    f(s[0].hole === 18 && s[1].hole === 1 && s[1].toast === 'Hole 1 \u2192 Undo', 'D: start on 10: 18 -> 1 did not happen: ' + JSON.stringify(report.D));
    errs(s, 'D');

    // E: Tools > Auto-advance holes -> Off.
    s = await go({ round: round(), hole: 4, at: G4, steps: START.concat([CLICK('#gps-overlay .gps-tools'), WAIT(300), ST, CLICK('#gps-overlay .gps-aa-toggle'), WAIT(300),
        CLICK('#gps-overlay .gps-tools'), WAIT(300), ST, CLICK('#gps-overlay .gps-tools'), MOVE(T5), WAIT(13000), ST]) });
    report.E = s.map((x) => [x.hole, x.toggle, x.key]);
    f(s[0].toggle === 'Auto-advance holes: On' && s[0].key === null, 'E: the Tools toggle is not "On" by default: ' + JSON.stringify([s[0].toggle, s[0].key]));
    f(s[1].toggle === 'Auto-advance holes: Off' && s[1].key === '0', 'E: the toggle did not turn off (and remember it): ' + JSON.stringify([s[1].toggle, s[1].key]));
    f(s[2].hole === 4 && !s[2].toast, 'E: off, and it still jumped: ' + JSON.stringify([s[2].hole, s[2].toast]));
    errs(s, 'E');

    // F: the 008 switch off.
    s = await go({ round: round(), hole: 4, at: G4, features: { autoAdvance: false }, steps: START.concat([ST, MOVE(T5), WAIT(13000), ST]) });
    report.F = s.map((x) => [x.hole, x.toggle, x.toast]);
    f(s[0].toggle === null && s[0].toast === null, 'F: switch off, but the toggle / toast is in the page: ' + JSON.stringify([s[0].toggle, s[0].toast]));
    f(s[1].hole === 4, 'F: switch off, and it jumped: ' + s[1].hole);
    errs(s, 'F');

    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
