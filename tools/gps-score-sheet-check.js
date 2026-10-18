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
//   L  THE LAYOUT on iPhone SE 375x667, iPhone 15 393x852 and 15 Pro Max 430x932, each at the
//      default text and the LARGEST TEXT (every font size on the GPS screen and the sheet x1.35 -
//      iOS xxxLarge over the default; the app has no Dynamic Type of its own, as
//      tools/gps-layout-c-check.js simulates it): the sheet inside the screen at ~90%; no label
//      cut off; no two buttons, rows or header parts overlapping; every button 44px+ tall; Save
//      and Notes on top (hit-tested) and clear of the rows; scrolled to the bottom, "Saved on this
//      phone" above the footer. Screenshots (--shots): sheet-top / sheet-bottom-<phone>-<text>.png.
//   SS_ONLY=flow|layout runs one half (default both).
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
// THE GOLFER ~150 yds out on the hole, on the line from its tee to its green - not on the green
// (standing on the green centre the map truthfully reads CENTER 0 and FRONT "ON").
const R_EARTH = 6371008.8;
const metres = (a, b) => { const r = Math.PI / 180, x = (b[1] - a[1]) * r * Math.cos((a[0] + b[0]) / 2 * r), y = (b[0] - a[0]) * r; return Math.hypot(x, y) * R_EARTH; };
const OUT = (n, m) => { const t = H(n).tee, g = H(n).mid, f = Math.max(0, 1 - m / metres(t, g)); return [t[0] + (g[0] - t[0]) * f, t[1] + (g[1] - t[1]) * f]; };
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
    const vp = o.vp || VP;
    const r = await arriveCold({ url: fileUrl('index.html', 'game=' + CODE), db: DB(o.round || round()), settleMs: 3500, viewport: { width: vp.width, height: vp.height }, webgl: true, blockUrls: BLOCK,
        preScript: CFG(o.features) + APP + ERR + GEO(o.at || OUT(o.hole || 5, 137)) + SEED(o.hole || 5, o.seed) + iapStub({ active: true }), steps: o.steps });
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
  // "Track stats for others" where this tree has it: the Tools bottom sheet's ROUND switch (layouts D / C,
  // HardPanGps.toolsSheetOn()) or the old Tools drop-down's row. Shown as "Track stats for others: On|Off".
  var tsOn = !!(window.HardPanGps && typeof HardPanGps.toolsSheetOn === 'function' && HardPanGps.toolsSheetOn());
  var tools = (function () {
    if (tsOn) { var sw = document.querySelector('#gps-overlay [data-ts-sw="others"]'); var row = sw && sw.closest('[data-ts-row]');
      if (!sw || !shown(sw) || (row && !shown(row))) return null; return { textContent: 'Track stats for others: ' + (sw.getAttribute('aria-checked') === 'true' ? 'On' : 'Off') }; }
    var b = document.querySelector('#gps-overlay .hp-ss-others'); return b && shown(b) ? b : (b ? { textContent: b.textContent } : null);
  })();
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
// THE PREVIOUS-HOLE BUTTON THE LAYOUT SHOWS (the old top panel's ‹, layout D's ‹ beside Enter score):
// the visible one is marked, then tapped for real.
const PREV = { expression: "(function(){ var b = Array.prototype.filter.call(document.querySelectorAll('#gps-overlay [aria-label=\\'Previous hole\\']'), function (x) { var r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(x).visibility !== 'hidden'; })[0]; if (!b) return 'none'; b.setAttribute('data-ss-prev', '1'); return b.className; })()" };
// THE "Track stats for others" CONTROL, wherever this tree puts it (the Tools sheet's switch, or the
// drop-down's row): marked, then tapped for real. And Tools closed the way each closes.
const TS_ON = "(window.HardPanGps && typeof HardPanGps.toolsSheetOn === 'function' && HardPanGps.toolsSheetOn())";
const OTHERS = { expression: "(function(){ var b = " + TS_ON + " ? document.querySelector('#gps-overlay [data-ts-sw=\\'others\\']') : document.querySelector('#gps-overlay .hp-ss-others'); if (!b) return 'none'; b.setAttribute('data-ss-others-tap', '1'); return b.className; })()" };
const CLOSE_TOOLS = { expression: "(function(){ if (" + TS_ON + ") { var k = document.querySelector('#gps-overlay .gps-ts-back'); if (k) k.click(); return 'sheet closed'; } var t = document.querySelector('#gps-overlay .gps-tools'); if (t) t.click(); return 'menu closed'; })()" };
const SCROLL_BOTTOM = { expression: "(function(){ var b = document.querySelector('#hp-score-sheet .hp-ss-body'); if (!b) return 'none'; b.scrollTop = b.scrollHeight; return 'scrolled'; })()" };
const shot = (name) => SHOTS ? [{ shot: path.join(SHOTS, name), viewportOnly: true }] : [];
// THE LARGEST TEXT (as tools/gps-layout-c-check.js): every font size (and px line height) on the GPS
// screen and the sheet x k, once per element - read every size first, then write.
const SCALE = (k) => ({ expression: "(function(){ var k = " + k + "; if (k === 1) return 'k1'; var todo = [];"
    + " [document.getElementById('gps-overlay')].forEach(function (root) { if (!root) return;"
    + "  [root].concat([].slice.call(root.querySelectorAll('*'))).forEach(function (e) { if (e.closest('.gps-map-wrap') || e.hasAttribute('data-fs0') || e.tagName === 'STYLE' || e.closest('svg')) return;"
    + "   var cs = getComputedStyle(e), p = e.parentElement; todo.push([e, parseFloat(cs.fontSize), cs.lineHeight, !!(p && p.hasAttribute('data-fs0') && parseFloat(getComputedStyle(p).fontSize) === parseFloat(cs.fontSize))]); }); });"
    + " todo.forEach(function (t) { var e = t[0]; e.setAttribute('data-fs0', t[1]); if (t[3]) return;"
    + "  e.style.setProperty('font-size', (t[1] * k).toFixed(2) + 'px', 'important'); if (/px$/.test(t[2])) e.style.setProperty('line-height', (parseFloat(t[2]) * k).toFixed(2) + 'px', 'important'); });"
    + " window.dispatchEvent(new Event('resize')); return 'scaled ' + todo.length; })()" });
// The sheet measured: every box, whether its text fits, what overlaps what.
const LAYOUT = { expression: `JSON.stringify((function () {
  var w = document.getElementById('hp-score-sheet'); if (!w) return { none: true };
  var R = function (e) { var b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  var clip = function (e) { return e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 2; };
  var label = function (e) { return (e.getAttribute('data-ss-k') || e.getAttribute('data-ss-score') && 'score' || e.getAttribute('data-ss-golfer') && 'chip' || e.className) + ':' + e.textContent; };
  var over = function (a, b) { return Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5; };
  var card = w.querySelector('.hp-ss'), body = w.querySelector('.hp-ss-body'), foot = w.querySelector('.hp-ss-foot');
  var out = { vw: innerWidth, vh: innerHeight, card: R(card), body: R(body), foot: R(foot), clipped: [], overlaps: [], small: [], covered: [], rowsOrder: [] };
  var btns = [].slice.call(w.querySelectorAll('button')).filter(function (b) { return b.getBoundingClientRect().height > 0; });
  btns.forEach(function (b) {
    if (clip(b)) out.clipped.push(label(b) + ' ' + [b.scrollWidth, b.clientWidth, b.scrollHeight, b.clientHeight].join('/'));
    if (b.getBoundingClientRect().height < 44) out.small.push(label(b) + ' ' + Math.round(b.getBoundingClientRect().height));
    var r = R(b); if (r.l < -0.5 || r.r > innerWidth + 0.5) out.clipped.push('off screen ' + label(b));
  });
  [w.querySelector('.hp-ss-title'), w.querySelector('.hp-ss-meta')].concat([].slice.call(w.querySelectorAll('.hp-ss-h'))).forEach(function (e) { if (e && e.scrollWidth > e.clientWidth + 1) out.clipped.push('text ' + e.textContent); });
  // Body buttons against body buttons (their own scrolled space), footer against footer; the body
  // and the footer against each other are checked as boxes (the rows end above the footer).
  var inFoot = function (b) { return foot.contains(b); };
  for (var i = 0; i < btns.length; i++) for (var j = i + 1; j < btns.length; j++) if (inFoot(btns[i]) === inFoot(btns[j]) && over(R(btns[i]), R(btns[j]))) out.overlaps.push(label(btns[i]) + ' x ' + label(btns[j]));
  var tl = w.querySelector('.hp-ss-title'), mt = w.querySelector('.hp-ss-meta');
  if (mt.textContent && over(R(tl), R(mt))) out.overlaps.push('title x meta');
  // The rows of the body, top to bottom: each starts below the one before.
  var blocks = [].slice.call(body.children).filter(function (e) { return e.getBoundingClientRect().height > 0; });
  for (var k = 1; k < blocks.length; k++) { var a = R(blocks[k - 1]), b = R(blocks[k]); if (b.t < a.b - 0.5) out.rowsOrder.push(blocks[k - 1].className + ' / ' + blocks[k].className); }
  // Save / Notes: on top at their middles and corners.
  [].slice.call(foot.querySelectorAll('button')).filter(function (b) { return b.getBoundingClientRect().height > 0; }).forEach(function (b) {
    var r = R(b); [[(r.l + r.r) / 2, (r.t + r.b) / 2], [r.l + 12, r.b - 12], [r.r - 12, r.b - 12]].forEach(function (p) { var e = document.elementFromPoint(p[0], p[1]); if (!e || !b.contains(e)) out.covered.push(b.className + ' at ' + p.map(Math.round)); });
    if (r.b > innerHeight + 0.5) out.covered.push(b.className + ' below the screen');
  });
  var saved = w.querySelector('.hp-ss-saved'); out.saved = saved ? R(saved) : null;
  out.heightPct = Math.round(R(card).h / innerHeight * 100);
  return out;
})())` };
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

    const ONLY = process.env.SS_ONLY || '';
    if (ONLY !== 'layout') {
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
        PREV, TAP('#gps-overlay [data-ss-prev]'), WAIT(1200), TAP('#gps-overlay .gps-score'), WAIT(600), ST,
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
    f(ok(a7) && a7.hole === 5, 'A: the previous-hole button did not go back to 5: ' + (a7 && a7.hole));
    f(ok(a7) && a7.open && a7.title === 'Hole 5 · Par 4' && a7.chips.indexOf('Manny · 4*') !== -1 && a7.chips.indexOf('Joe · 5') !== -1, 'A: back on 5 the chips: ' + JSON.stringify(a7 && a7.chips));
    f(ok(a8) && !a8.open && a8.side === 'bets', 'A: a tap above the sheet did not close it: ' + JSON.stringify(a8 && [a8.open, a8.side]));
    f(ok(m1) && m1.open && m1.miss['gir-short'] === '1' && m1.miss['tee-L'] === '0', 'A: My stats miss counts: ' + JSON.stringify(m1));
    errs(s, 'A');

    // ---- B: a par 3 ------------------------------------------------------------------------
    s = await go({ hole: 3, steps: START.concat([TAP('#gps-overlay .gps-score'), WAIT(600), ST]) });
    report.B = s[0] && [s[0].title, s[0].grid, s[0].rows];
    f(ok(s[0]) && s[0].title === 'Hole 3 · Par 3' && s[0].rows.indexOf('fw') === -1 && s[0].rows.indexOf('gd') !== -1, 'B: par 3: tee shot shown: ' + JSON.stringify(report.B));
    f(ok(s[0]) && s[0].grid[0] === '1/eagle' && s[0].grid[2] === '3', 'B: par 3 grid not centred on par: ' + JSON.stringify(s[0] && s[0].grid));
    errs(s, 'B');

    // ---- C: Track stats for others --------------------------------------------------------
    s = await go({ steps: START.concat([TAP('#gps-overlay .gps-tools'), WAIT(400), ST, OTHERS, TAP('#gps-overlay [data-ss-others-tap]'), WAIT(300), ST, CLOSE_TOOLS, WAIT(400),
        TAP('#gps-overlay .gps-score'), WAIT(600), TAP('#hp-score-sheet [data-ss-golfer="102"]'), WAIT(250), ST]) });
    report.C = s.map((x) => x && [x.tools, x.others, x.rows]);
    f(ok(s[0]) && s[0].tools === 'Track stats for others: Off' && s[0].others === null, 'C: the Tools row is not Off by default: ' + JSON.stringify(report.C[0]));
    f(ok(s[1]) && s[1].tools === 'Track stats for others: On' && s[1].others === '1', 'C: the toggle did not turn on: ' + JSON.stringify(report.C[1]));
    f(ok(s[2]) && s[2].chips[1] === 'Joe*' && s[2].rows.indexOf('putts') !== -1, 'C: on, Joe has no stats rows: ' + JSON.stringify(s[2] && [s[2].chips, s[2].rows]));
    errs(s, 'C');

    // ---- D: the switch off ----------------------------------------------------------------
    s = await go({ features: { scoreSheet: false }, steps: START.concat([TAP('#gps-overlay .gps-tools'), WAIT(400), ST, CLOSE_TOOLS, WAIT(400), TAP('#gps-overlay .gps-score'), WAIT(800), ST]) });
    report.D = s.map((x) => x && [x.open, x.side, x.active, x.tools]);
    f(ok(s[0]) && s[0].tools === null, 'D: switch off, the Tools row is there');
    f(ok(s[1]) && !s[1].open && s[1].side === 'bets' && /score-input/.test(s[1].active || ''), 'D: switch off, Enter score is not the card\'s box: ' + JSON.stringify(report.D[1]));
    errs(s, 'D');

    // ---- E: tournament mode -----------------------------------------------------------------
    s = await go({ round: round({ tournamentMode: true }), steps: START.concat([TAP('#gps-overlay .gps-score'), WAIT(600), TAP('#hp-score-sheet [data-ss-score="4"]'), WAIT(200), TAP('#hp-score-sheet [data-ss-save]'), WAIT(1000), ST]) });
    report.E = s[0] && [s[0].hole, s[0].writes.filter((w) => /scores/.test(w))];
    f(ok(s[0]) && s[0].writes.indexOf('set events/' + CODE + '/scores/p101_h5=4') !== -1 && s[0].hole === 6, 'E: tournament mode: the sheet did not score: ' + JSON.stringify(report.E));
    errs(s, 'E');

    }

    // ---- L: the layout, three phones x two text sizes -------------------------------------
    if (ONLY !== 'flow') {
        report.L = {};
        for (const phone of [SIZES.se, SIZES[15], SIZES.promax]) {
            for (const [tname, k] of [['default', 1], ['largest', 1.35]]) {
                const tag = phone.tag + '-' + tname;
                const out = await go({ vp: phone, steps: START.concat([
                    TAP('#gps-overlay .gps-score'), WAIT(600),
                    TAP('#hp-score-sheet [data-ss-golfer="102"]'), WAIT(200), TAP('#hp-score-sheet [data-ss-score="5"]'), WAIT(200),
                    TAP('#hp-score-sheet [data-ss-golfer="101"]'), WAIT(200), TAP('#hp-score-sheet [data-ss-score="4"]'), WAIT(200),
                    TAP('#hp-score-sheet [data-ss-k="putts"][data-ss-v="2"]'), WAIT(200), TAP('#hp-score-sheet [data-ss-k="fw"][data-ss-v="hit"]'), WAIT(200),
                    { expression: "(function(){ var b = document.querySelector('#hp-score-sheet .hp-ss-body'); b.scrollTop = 0; return 'top'; })()" },
                    SCALE(k), WAIT(400), LAYOUT], shot('sheet-top-' + tag + '.png'), [SCROLL_BOTTOM, WAIT(300), LAYOUT], shot('sheet-bottom-' + tag + '.png')) });
                const [t, b] = out;
                report.L[tag] = t && { heightPct: t.heightPct, clipped: t.clipped.length, overlaps: t.overlaps.length };
                const F = (c, m) => f(c, 'L ' + tag + ': ' + m);
                F(ok(t) && !t.none, 'no sheet');
                if (!ok(t) || t.none) continue;
                F(t.card.l >= -0.5 && t.card.r <= t.vw + 0.5 && t.card.b <= t.vh + 0.5 && t.heightPct >= 85 && t.heightPct <= 92, 'the sheet is not inside the screen at ~90%: ' + JSON.stringify([t.card, t.heightPct]));
                [t, b].forEach((x, i) => {
                    const at = i ? 'scrolled down' : 'at the top';
                    F(!x.clipped.length, at + ': cut off: ' + JSON.stringify(x.clipped));
                    F(!x.overlaps.length, at + ': overlapping: ' + JSON.stringify(x.overlaps));
                    F(!x.small.length, at + ': under 44px: ' + JSON.stringify(x.small));
                    F(!x.covered.length, at + ': Save / Notes covered: ' + JSON.stringify(x.covered));
                    F(!x.rowsOrder.length, at + ': rows overlapping: ' + JSON.stringify(x.rowsOrder));
                    F(x.body.b <= x.foot.t + 0.5, at + ': the rows run under the footer: ' + JSON.stringify([x.body, x.foot]));
                });
                F(b.saved && b.saved.b <= b.foot.t + 0.5 && b.saved.t >= b.body.t - 0.5, 'scrolled down, "Saved on this phone" not in view above the footer: ' + JSON.stringify([b.saved, b.foot]));
                errs(out, 'L ' + tag);
            }
        }
    }

    console.log(JSON.stringify({ report, fails }, null, 1));
    console.log(fails.length ? 'FAILED ' + fails.length : 'PASSED');
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('could not run: ' + (e && e.stack || e)); process.exit(2); });
