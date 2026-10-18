#!/usr/bin/env node
// ============================================================================
// HARDPAN GPS - THE SCORE SHEET (mailbox 012 part 2, switch scoreSheet), PLAYED
//
//   node tools/gps-score-sheet-check.js [--shots <dir>]   exit 0 = passed, 1 = broke, 2 = could not run
//     SS_SIZE=se|15|promax   the phone (default 15: 393x852)
//
// Cold Chrome, the app (window.__hardpanDoors), a subscriber (tools/lib/iap-stub.js),
// Caledonia's bundled holes, a stand-in GPS on hole 5's green, auto-advance off on the
// phone (no jump in the middle of a step). Nothing in the page is called by name - every
// step is a real tap:
//   A  Enter score on the GPS screen (par 4): the sheet is up over the map - "Hole 5 · Par 4",
//      the two golfers this phone scores, Manny (the GPS golfer) picked, 2..8 + More with the
//      card's marks, putts / tee shot / green in reg / bunker / penalties for Manny and
//      "Saved on this phone". Joe: no stats rows (Track stats for others is off); 5 ->
//      "Joe · 5". Manny: 4, putts 2 -> GIR "Hit · auto"; Short -> the golfer's own answer.
//      Save · Next hole: both scores written through the card's save (events/<code>/scores/
//      p<id>_h5, the offline queue), the stats only on the phone, GPS on hole 6, sheet gone.
//      The database's echo: the card's boxes say 4 and 5. Back to 5: the chip says "Joe · 5".
//      The card's Round Menu -> My stats: green missed short 1.
//   B  a par 3: no TEE SHOT row.
//   C  Tools > Track stats for others: On (this phone) -> Joe gets the stats rows.
//   D  the switch off: Enter score = the card's box, focused, exactly as before; no Tools row.
//   E  tournament mode (set by the organizer): the sheet still scores.
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

const argShots = process.argv.indexOf('--shots');
const SHOTS = argShots > 0 ? path.resolve(process.argv[argShots + 1]) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const SIZES = { se: { width: 375, height: 667, tag: 'se' }, 15: { width: 393, height: 852, tag: 'iphone15' }, promax: { width: 430, height: 932, tag: 'promax' } };
const VP = SIZES[process.env.SS_SIZE || '15'] || SIZES[15];

const CODE = 'SSHEET';
const H = (n) => table.caledonia.holes[String(n)].osm;
const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});addEventListener('unhandledrejection',function(e){window.__e.push('rej '+String(e.reason&&e.reason.message||e.reason))});";
const APP = 'window.__hardpanDoors = true;';
const CFG = (features) => "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,esriKey:''});"
    + "c.features=Object.assign({},v.features," + JSON.stringify(features || {}) + ");}});})();";
const GEO = (p) => "(function(){ var cur = { lat: " + p[0] + ", lng: " + p[1] + " };"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var f = function () { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 5 }, timestamp: Date.now() }); };"
    + " var t = setInterval(f, 1000); setTimeout(f, 50); return 1; }, getCurrentPosition: function () {}, clearWatch: function () {} } }); } catch (e) {} })();";
const SEED = (hole, more) => "(function(){ try { if (sessionStorage.getItem('__seeded')) return; sessionStorage.setItem('__seeded','1'); localStorage.setItem('hardpan_round_side', 'gps|" + CODE + "'); localStorage.setItem('hardpan_last_hole_" + CODE + "', '" + hole + "'); localStorage.setItem('hardpan_gps_whoasked_" + CODE + "', '1'); localStorage.setItem('hardpan_gps_golfer_" + CODE + "', '101'); localStorage.setItem('hardpan_gps_autoadvance', '0'); " + (more || '') + " } catch (e) {} })();";
function round(extra) {
    const r = wizardSavedRound({ code: CODE, golfers: 2, names: ['Manny Orozco', 'Joe Russo'], hcps: [9, 12], ownerUid: 'anon-cold', thru: 0, flights: false,
        overrides: Object.assign({ additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', startingHole: 1 }, extra || {}) });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    return r;
}
const DB = (r) => ({ events: { [CODE]: r }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} });
const BLOCK = ['*nationalmap.gov*', '*arcgis*', '*weather.gov*', '*epqs*', '*overpass*', '*cloudfunctions.net*'];
const go = async (o) => {
    const r = await arriveCold({ url: fileUrl('index.html', 'game=' + CODE), db: DB(o.round || round()), settleMs: 3500, viewport: { width: VP.width, height: VP.height }, webgl: true, blockUrls: BLOCK,
        preScript: CFG(o.features) + APP + ERR + GEO(o.at || H(5).mid) + SEED(o.hole || 5, o.seed) + iapStub({ active: true }), steps: o.steps });
    if (!r.ok) throw new Error(r.reason);
    return r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
};
const OPEN = { expression: "(function(){ if (window.HardPanGps && HardPanGps.side() === 'gps') return 'on'; var b = document.querySelector('#gps-side-toggle .gps-side-gps'); if (b) b.click(); return 'tap'; })()" };
const WAIT = (ms) => ({ sleep: ms });
const TAP = (sel) => ({ tap: sel });
const START = [WAIT(2500), OPEN, WAIT(2500)];
// What is on screen: the sheet, its rows, the GPS side, the card's boxes, the phone's stats, the writes.
const ST = { expression: `JSON.stringify((function () {
  var w = document.getElementById('hp-score-sheet');
  var shown = function (e) { if (!e) return false; var cs = getComputedStyle(e), r = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  var open = shown(w) && shown(w && w.querySelector('.hp-ss'));
  var q = function (s) { return w ? Array.prototype.slice.call(w.querySelectorAll(s)) : []; };
  var card = w && w.querySelector('.hp-ss'), cr = card ? card.getBoundingClientRect() : null;
  var ls = {}; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^hardpan_qstats_v1_/.test(k)) ls[k] = JSON.parse(localStorage.getItem(k)); }
  var box = function (pid, h) { var b = document.querySelector('.score-input[data-player-id="' + pid + '"][data-hole="' + h + '"]'); return b ? b.value : null; };
  var tools = document.querySelector('#gps-overlay .hp-ss-others');
  return { open: open, inOverlay: !!(w && w.parentNode && w.parentNode.id === 'gps-overlay'),
    heightPct: cr ? Math.round(cr.height / innerHeight * 100) : null,
    title: open ? w.querySelector('.hp-ss-title').textContent : null, meta: open ? w.querySelector('.hp-ss-meta').textContent : null,
    chips: q('.hp-ss-chip').map(function (b) { return b.textContent + (b.classList.contains('on') ? '*' : ''); }),
    grid: q('.hp-ss-grid:not(.hp-ss-more) .hp-ss-b').map(function (b) { var n = b.querySelector('.hp-ss-n'); return (n ? n.textContent + (n.className.replace(/hp-ss-n ?/, '') ? '/' + n.className.replace(/hp-ss-n ?|mark-/g, '') : '') : b.textContent) + (b.classList.contains('on') ? '*' : ''); }),
    rows: q('[data-ss-row]').map(function (r) { return r.getAttribute('data-ss-row'); }),
    on: q('[data-ss-k].on').map(function (b) { return b.getAttribute('data-ss-k') + ':' + b.getAttribute('data-ss-v') + (b.querySelector('small') ? '(' + b.querySelector('small').textContent + ')' : ''); }),
    saved: q('.hp-ss-saved').map(function (x) { return x.textContent; })[0] || null, save: open ? w.querySelector('[data-ss-save]').textContent : null,
    note: q('.hp-ss-note').map(function (x) { return x.textContent; })[0] || null,
    hole: window.HardPanGps ? HardPanGps.hole() : null, side: window.HardPanGps ? HardPanGps.side() : null, cardHole: typeof currentViewedHole !== 'undefined' ? currentViewedHole : null,
    box5: [box(101, 5), box(102, 5)], active: document.activeElement ? (document.activeElement.className || document.activeElement.tagName) : null,
    tools: tools ? tools.textContent : null, others: localStorage.getItem('hardpan_stats_others'),
    queue: Object.keys(localStorage).filter(function (k) { return /offline|queue/i.test(k); }).map(function (k) { return k + '=' + (localStorage.getItem(k) || '').length; }),
    ls: ls, writes: (window.__coldWrites || []).map(function (x) { return x.op + ' ' + x.path + '=' + JSON.stringify(x.value); }), e: window.__e };
})())` };
const SCROLL_BOTTOM = { expression: "(function(){ var b = document.querySelector('#hp-score-sheet .hp-ss-body'); if (!b) return 'none'; b.scrollTop = b.scrollHeight; return 'scrolled'; })()" };
const shot = (name) => SHOTS ? [{ shot: path.join(SHOTS, name), viewportOnly: true }] : [];
const MY = { expression: `JSON.stringify((function () {
  var p = document.getElementById('hp-my-stats'), m = {};
  if (p) Array.prototype.forEach.call(p.querySelectorAll('[data-ms-miss]'), function (x) { m[x.getAttribute('data-ms-miss')] = x.querySelector('b').textContent; });
  return { open: !!(p && p.style.display !== 'none'), miss: m, e: window.__e };
})())` };

(async () => {
    const fails = [], report = {};
    const f = (c, m) => { if (!c) fails.push(m); };
    // THE STAND-IN'S push() hands back the same ref (tools/lib/cold-arrival.js), so the card's own
    // audit-log trim (logAuditEntry) reads the entry's fields as entries - "reading 'ts'" - on
    // every score saved under it, from any entry point. Not this sheet: left out, nothing else.
    const AUDIT_TRIM = /Cannot read properties of null \(reading 'ts'\)/;
    const errs = (list, tag) => list.forEach((x) => { const e = x && x.e ? x.e.filter((m) => !AUDIT_TRIM.test(m)) : []; if (e.length) fails.push(tag + ': page errors ' + e.join(' | ')); });
    const ok = (s) => s && typeof s === 'object';

    // ---- A: hole 5 (par 4), the whole flow ----------------------------------------------
    const base = round();
    const echoed = Object.assign({}, base, { scores: Object.assign({}, base.scores || {}, { p101_h5: 4, p102_h5: 5 }) });
    let s = await go({ steps: START.concat([
        TAP('#gps-overlay .gps-score'), WAIT(600), ST,
        TAP('#hp-score-sheet [data-ss-golfer="102"]'), WAIT(250), ST,
        TAP('#hp-score-sheet [data-ss-score="5"]'), WAIT(250), ST,
        TAP('#hp-score-sheet [data-ss-golfer="101"]'), WAIT(250),
        TAP('#hp-score-sheet [data-ss-score="4"]'), WAIT(200), TAP('#hp-score-sheet [data-ss-k="putts"][data-ss-v="2"]'), WAIT(250), ST,
        TAP('#hp-score-sheet [data-ss-k="fw"][data-ss-v="hit"]'), WAIT(250)],
        [{ expression: "(function(){ var b = document.querySelector('#hp-score-sheet .hp-ss-body'); if (b) b.scrollTop = 0; return 'top'; })()" }, WAIT(300)], shot('first-look-sheet-top-' + VP.tag + '.png'), [SCROLL_BOTTOM, WAIT(300)], shot('first-look-sheet-bottom-' + VP.tag + '.png'), [
        TAP('#hp-score-sheet [data-ss-k="gd"][data-ss-v="short"]'), WAIT(250), ST,
        TAP('#hp-score-sheet [data-ss-save]'), WAIT(1200), ST,
        { deliver: { path: 'events/' + CODE, value: echoed } }, WAIT(900), ST,
        TAP('#gps-overlay .gps-prev'), WAIT(1200), TAP('#gps-overlay .gps-score'), WAIT(600), ST,
        // A tap on the dimmed map above the sheet closes it; then the card.
        { expression: "(function(){ var w = document.getElementById('hp-score-sheet'); if (w) w.click(); return 'closed'; })()" }, WAIT(300),
        { expression: "(function(){ var b = document.querySelector('#gps-overlay .gps-side-bets'); if (b) { b.click(); return 'card'; } return 'no toggle'; })()" }, WAIT(900), ST,
        TAP('#round-sheet-handle'), WAIT(700), TAP('#qs-menu-mystats'), WAIT(700), MY]) });
    const [a0, a1, a2, a3, a4, a5, a6, a7, a8, m1] = s;
    report.A = { open: a0 && [a0.title, a0.meta, a0.chips, a0.grid, a0.rows, a0.heightPct], joe: a1 && [a1.chips, a1.rows, a1.note], joe5: a2 && a2.chips,
        manny: a3 && a3.on, short: a4 && a4.on, saved: a5 && [a5.hole, a5.side, a5.open], writes: a5 && a5.writes, echo: a6 && a6.box5, back: a7 && a7.chips, my: m1 && m1.miss };
    f(ok(a0) && a0.open && a0.inOverlay, 'A: Enter score did not open the sheet over the GPS screen: ' + JSON.stringify(a0 && { open: a0.open, inOverlay: a0.inOverlay, side: a0.side }));
    f(ok(a0) && a0.heightPct >= 85 && a0.heightPct <= 92, 'A: the sheet is not ~90% of the screen: ' + (a0 && a0.heightPct));
    f(ok(a0) && a0.title === 'Hole 5 · Par 4' && /HCP \d+/.test(a0.meta || ''), 'A: header: ' + JSON.stringify(a0 && [a0.title, a0.meta]));
    f(ok(a0) && JSON.stringify(a0.chips) === JSON.stringify(['Manny*', 'Joe']), 'A: golfer chips (Manny, the GPS golfer, picked): ' + JSON.stringify(a0 && a0.chips));
    f(ok(a0) && JSON.stringify(a0.grid) === JSON.stringify(['2/eagle', '3/birdie', '4', '5/bogey', '6/double', '7/double', '8/double', 'More']), 'A: the score grid / marks: ' + JSON.stringify(a0 && a0.grid));
    f(ok(a0) && JSON.stringify(a0.rows) === JSON.stringify(['putts', 'fw', 'gd', 'bunker', 'pen']) && a0.saved === 'Saved on this phone', 'A: Manny\'s stats rows: ' + JSON.stringify(a0 && [a0.rows, a0.saved]));
    f(ok(a0) && a0.save === 'Save · Next hole ›', 'A: the Save button: ' + (a0 && a0.save));
    f(ok(a1) && a1.chips[1] === 'Joe*' && a1.rows.length === 0 && /Track stats for others/.test(a1.note || ''), 'A: Joe (stats for others off): ' + JSON.stringify(a1 && [a1.chips, a1.rows, a1.note]));
    f(ok(a2) && a2.chips[1] === 'Joe · 5*' && a2.grid.indexOf('5/bogey*') !== -1, 'A: Joe 5 -> the chip: ' + JSON.stringify(a2 && [a2.chips, a2.grid]));
    f(ok(a3) && a3.on.indexOf('putts:2') !== -1 && a3.on.indexOf('gd:hit(auto)') !== -1, 'A: 4 with 2 putts -> GIR Hit (auto): ' + JSON.stringify(a3 && a3.on));
    f(ok(a4) && a4.on.indexOf('gd:short') !== -1 && a4.on.indexOf('fw:hit') !== -1 && !a4.on.some((x) => /^gd:hit/.test(x)), 'A: the golfer changed GIR to Short: ' + JSON.stringify(a4 && a4.on));
    const rec = a4 && a4.ls['hardpan_qstats_v1_' + CODE + '_p101'];
    f(rec && rec.holes['5'] && rec.holes['5'].putts === 2 && rec.holes['5'].fw === 'hit' && rec.holes['5'].gd === 'short' && rec.holes['5'].gir === false, 'A: Manny\'s hole on the phone: ' + JSON.stringify(rec && rec.holes));
    f(a4 && !a4.ls['hardpan_qstats_v1_' + CODE + '_p102'], 'A: a stats record for Joe with stats for others off');
    f(ok(a4) && a4.writes.length === 0, 'A: written before Save: ' + JSON.stringify(a4 && a4.writes));
    f(ok(a5) && a5.writes.indexOf('set events/' + CODE + '/scores/p101_h5=4') !== -1 && a5.writes.indexOf('set events/' + CODE + '/scores/p102_h5=5') !== -1, 'A: Save did not write both scores through the score path: ' + JSON.stringify(a5 && a5.writes));
    f(ok(a5) && !a5.writes.some((w) => /stats|qstats/.test(w)), 'A: stats reached the database: ' + JSON.stringify(a5 && a5.writes));
    f(ok(a5) && a5.writes.some((w) => /auditLog/.test(w)), 'A: no audit entry (not the card\'s save?): ' + JSON.stringify(a5 && a5.writes));
    f(ok(a5) && !a5.open && a5.hole === 6 && a5.cardHole === 6 && a5.side === 'gps', 'A: after Save: next hole on GPS: ' + JSON.stringify(a5 && { open: a5.open, hole: a5.hole, card: a5.cardHole, side: a5.side }));
    f(ok(a6) && JSON.stringify(a6.box5) === '["4","5"]', 'A: the scorecard does not show the saved scores: ' + JSON.stringify(a6 && a6.box5));
    f(ok(a7) && a7.open && a7.title === 'Hole 5 · Par 4' && a7.chips.indexOf('Manny · 4*') !== -1 && a7.chips.indexOf('Joe · 5') !== -1, 'A: back on 5 the chips: ' + JSON.stringify(a7 && a7.chips));
    f(ok(a8) && !a8.open && a8.side === 'bets', 'A: a tap above the sheet did not close it: ' + JSON.stringify(a8 && [a8.open, a8.side]));
    f(ok(m1) && m1.open && m1.miss['gir-short'] === '1' && m1.miss['tee-L'] === '0', 'A: My stats miss counts: ' + JSON.stringify(m1));
    errs(s, 'A');

    // ---- B: a par 3 ------------------------------------------------------------------------
    s = await go({ hole: 3, at: H(3).mid, steps: START.concat([TAP('#gps-overlay .gps-score'), WAIT(600), ST]) });
    report.B = s[0] && [s[0].title, s[0].grid, s[0].rows];
    f(ok(s[0]) && s[0].title === 'Hole 3 · Par 3' && s[0].rows.indexOf('fw') === -1 && s[0].rows.indexOf('gd') !== -1, 'B: par 3: tee shot shown: ' + JSON.stringify(report.B));
    f(ok(s[0]) && s[0].grid[0] === '1/eagle' && s[0].grid[2] === '3', 'B: par 3 grid not centred on par: ' + JSON.stringify(s[0] && s[0].grid));
    errs(s, 'B');

    // ---- C: Track stats for others --------------------------------------------------------
    s = await go({ steps: START.concat([TAP('#gps-overlay .gps-tools'), WAIT(300), ST, TAP('#gps-overlay .hp-ss-others'), WAIT(300), ST, TAP('#gps-overlay .gps-tools'), WAIT(300),
        TAP('#gps-overlay .gps-score'), WAIT(600), TAP('#hp-score-sheet [data-ss-golfer="102"]'), WAIT(250), ST]) });
    report.C = s.map((x) => x && [x.tools, x.others, x.rows]);
    f(ok(s[0]) && s[0].tools === 'Track stats for others: Off' && s[0].others === null, 'C: the Tools row is not Off by default: ' + JSON.stringify(report.C[0]));
    f(ok(s[1]) && s[1].tools === 'Track stats for others: On' && s[1].others === '1', 'C: the toggle did not turn on: ' + JSON.stringify(report.C[1]));
    f(ok(s[2]) && s[2].chips[1] === 'Joe*' && s[2].rows.indexOf('putts') !== -1, 'C: on, Joe has no stats rows: ' + JSON.stringify(s[2] && [s[2].chips, s[2].rows]));
    errs(s, 'C');

    // ---- D: the switch off ----------------------------------------------------------------
    s = await go({ features: { scoreSheet: false }, steps: START.concat([TAP('#gps-overlay .gps-tools'), WAIT(300), ST, TAP('#gps-overlay .gps-tools'), WAIT(300), TAP('#gps-overlay .gps-score'), WAIT(800), ST]) });
    report.D = s.map((x) => x && [x.open, x.side, x.active, x.tools]);
    f(ok(s[0]) && s[0].tools === null, 'D: switch off, the Tools row is there');
    f(ok(s[1]) && !s[1].open && s[1].side === 'bets' && /score-input/.test(s[1].active || ''), 'D: switch off, Enter score is not the card\'s box: ' + JSON.stringify(report.D[1]));
    errs(s, 'D');

    // ---- E: tournament mode -----------------------------------------------------------------
    s = await go({ round: round({ tournamentMode: true }), steps: START.concat([TAP('#gps-overlay .gps-score'), WAIT(600), TAP('#hp-score-sheet [data-ss-score="4"]'), WAIT(200), TAP('#hp-score-sheet [data-ss-save]'), WAIT(1000), ST]) });
    report.E = s[0] && [s[0].hole, s[0].writes.filter((w) => /scores/.test(w))];
    f(ok(s[0]) && s[0].writes.indexOf('set events/' + CODE + '/scores/p101_h5=4') !== -1 && s[0].hole === 6, 'E: tournament mode: the sheet did not score: ' + JSON.stringify(report.E));
    errs(s, 'E');

    console.log(JSON.stringify({ report, fails }, null, 1));
    console.log(fails.length ? 'FAILED ' + fails.length : 'PASSED');
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('could not run: ' + (e && e.stack || e)); process.exit(2); });
