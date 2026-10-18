#!/usr/bin/env node
// ============================================================================
// QUICK STATS ON THE SCORECARD + MY STATS, THE WAY A GOLFER REACHES THEM (008)
//
//   node tools/quick-stats-check.js     exit 0 = passed, 1 = a guarantee broke, 2 = could not run
//
// Cold Chrome at 390x844, the app (window.__hardpanDoors), the App Store stubbed
// (tools/lib/iap-stub.js). Nothing in the page is called by name:
//   1. A GPS Map subscriber opens a round on the card, types a score on hole 1, taps
//      putts 2 and fairway Hit under that golfer's box (real taps): GIR is worked out
//      ("GIR ✓"), the score box was never blurred by the taps, and the hole's stats
//      are on the phone (hardpan_qstats_v1_<code>_p<id>) - not in the database.
//      Then Round Menu -> My stats shows putts / round 36.0, FIR 100%, GIR 100%, the
//      par-4 average; Last 20 switches.
//   2. The switch off (features.quickStats false): no controls, no My stats.
//   3. No GPS Map: no controls, no My stats - and no paywall on the card.
//   4. Home (the app): a subscriber sees My stats, and it adds up the rounds on the phone;
//      no GPS Map: no My stats on Home, and no paywall.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const HERE = path.join(__dirname, '..');
if (!fs.existsSync(path.join(HERE, 'gps-stats.js'))) { console.error('Consumer tree (GPS_ENABLED=0): no quick stats.'); process.exit(2); }
const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
const { wizardSavedRound } = require(path.join(HERE, 'helpers/wizard-saved-round.js'));
const { iapStub } = require(path.join(HERE, 'tools/lib/iap-stub.js'));

const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});addEventListener('unhandledrejection',function(e){window.__e.push('rej '+String(e.reason&&e.reason.message||e.reason))});";
const APP = 'window.__hardpanDoors = true;';
// The shipped config, with (optionally) the quickStats switch off - set as the page assigns it.
const CFG = (stats) => "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false});"
    + (stats === false ? "c.features=Object.assign({},v.features,{quickStats:false});" : '') + "}});})();";
const SIDE = (code) => "try { localStorage.setItem('hardpan_round_side', 'bets|" + code + "'); } catch (e) {}";
const DB = (ev) => ({ events: ev || {}, global_courses: {}, trips: {}, organizers: {}, tournaments: {} });
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
function round(code) {
    const r = wizardSavedRound({ code, golfers: 2, names: ['Ann Able', 'Bob Baker'], hcps: [9, 12], ownerUid: 'anon-cold', thru: 0, flights: false,
        overrides: { additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', gameFormat: 'nassau', nassauStake: 5, skinsBuyIn: 5 } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    return r;
}
const go = async (o) => {
    const pre = (o.pre || '') + CFG(o.stats) + APP + ERR + iapStub(o.iap || { active: true });
    const r = await arriveCold(Object.assign({ settleMs: 3500, viewport: { width: 390, height: 844 }, preScript: pre }, o, { pre: undefined, iap: undefined, stats: undefined }));
    if (!r.ok) throw new Error(r.reason);
    return r;
};
// What the card shows.
const CARD = `JSON.stringify((function () {
  var shown = function (e) { if (!e) return false; var cs = getComputedStyle(e), r = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  var rows = Array.prototype.slice.call(document.querySelectorAll('#hole-view-card .hv-player-row'));
  var strips = Array.prototype.slice.call(document.querySelectorAll('#hole-view-card .hv-qs'));
  var s0 = strips[0];
  var box = document.querySelector('#hole-view-card .score-input[data-hole]:not([disabled])');
  var pw = document.getElementById('gps-paywall');
  var ls = {}; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^hardpan_qstats_v1_/.test(k)) ls[k] = JSON.parse(localStorage.getItem(k)); }
  var under = null;
  if (s0 && box) { var sr = s0.getBoundingClientRect(), br = box.getBoundingClientRect(); under = sr.top >= br.bottom - 1 && sr.right >= br.left; }
  return { rows: rows.length, strips: strips.length, inRow: !!(s0 && s0.parentNode && s0.parentNode.classList.contains('hv-player-row')), under: under,
    stripShown: shown(s0), oneLine: s0 ? (function () { var m = Array.prototype.map.call(s0.children, function (c) { var r = c.getBoundingClientRect(); return r.top + r.height / 2; }); return Math.max.apply(null, m) - Math.min.apply(null, m) <= 4; })() : null, text: s0 ? s0.innerText.replace(/\\s+/g, ' ').trim() : null,
    on: s0 ? Array.prototype.map.call(s0.querySelectorAll('.hv-qs-chip.on'), function (b) { return b.getAttribute('data-qs') + ':' + b.getAttribute('data-qs-v'); }) : [],
    gir: s0 && s0.querySelector('.hv-qs-gir') ? s0.querySelector('.hv-qs-gir').textContent : null,
    par: (document.querySelector('#hole-view-card .hv-hole-meta') || {}).textContent || '',
    box: box ? { v: box.value, pid: box.getAttribute('data-player-id') } : null,
    typing: !!(document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('score-input')),
    menu: !!document.getElementById('qs-menu-mystats'), pw: !!(pw && pw.style.display !== 'none' && shown(pw.querySelector('.gps-sheet-card'))),
    ls: ls, writes: (window.__coldWrites || []).map(function (w) { return w.op + ' ' + w.path; }), e: window.__e };
})())`;
const MY = `JSON.stringify((function () {
  var p = document.getElementById('hp-my-stats');
  var t = {}; if (p) Array.prototype.forEach.call(p.querySelectorAll('[data-ms]'), function (x) { t[x.getAttribute('data-ms')] = x.querySelector('.v').textContent; });
  var on = p && p.querySelector('.ms-seg .on');
  return { open: !!(p && p.style.display !== 'none' && p.getBoundingClientRect().height > 0), tiles: t, last: on ? on.textContent : null,
    note: p ? (p.querySelector('.ms-note') || {}).textContent : null,
    saved: (function () { var x = p && p.querySelector('.ms-saved'); return x && x.getBoundingClientRect().height > 0 ? x.textContent : null; })(), e: window.__e };
})())`;
const EVAL = (js) => ({ expression: js });
// Types a score into the first box the phone can score, and leaves the box FOCUSED (still typing).
const TYPE = (v) => EVAL("(function(){ var i = document.querySelector('#hole-view-card .score-input[data-hole]:not([disabled])'); if (!i) return 'no box'; i.focus(); i.value = '" + v + "'; i.dispatchEvent(new Event('input', { bubbles: true })); return 'typed'; })()");
const BLUR = EVAL("(function(){ var i = document.activeElement; if (i && i.classList.contains('score-input')) { i.dispatchEvent(new Event('change', { bubbles: true })); i.blur(); return 'saved'; } return 'no focus'; })()");

(async () => {
    const fails = [], report = {};
    const f = (c, m) => { if (!c) fails.push(m); };
    const clean = (tag, s) => f(!s.e || !s.e.length, tag + ': page errors ' + JSON.stringify(s.e));

    // ---- 1. A SUBSCRIBER ON THE CARD ------------------------------------------------
    const code = 'QSTA01';
    const url = fileUrl('index.html', 'game=' + code + '&group=1');
    const steps = [{ sleep: 1200 }, EVAL(CARD)];
    // What Firebase hands every listener once the score is saved (the stand-in does not echo writes).
    const base = round(code), par1 = Number((base.courseData || []).find((h) => Number(h.hole) === 1).par);
    const saved = Object.assign({}, base, { scores: Object.assign({}, base.scores || {}, { ['p' + base.players[0].id + '_h1']: par1 }) });
    // The par of hole 1 decides the score: par, so 2 putts is on in par - 2 = GIR.
    const r1 = J(await go({ url, db: DB({ [code]: round(code) }), pre: SIDE(code), steps: steps.concat([
        EVAL("(function(){ var m = /Par (\\d)/.exec((document.querySelector('#hole-view-card .hv-hole-meta') || {}).textContent || ''); window.__par = m ? Number(m[1]) : 4; return 'par'; })()"),
        EVAL("(function(){ var i = document.querySelector('#hole-view-card .score-input[data-hole]:not([disabled])'); if (!i) return 'no box'; i.focus(); i.value = String(window.__par); i.dispatchEvent(new Event('input', { bubbles: true })); return 'typed'; })()"),
        { tap: '#hole-view-card .hv-qs [data-qs="putts"][data-qs-v="2"]' }, { sleep: 300 }, EVAL(CARD),
        { tap: '#hole-view-card .hv-qs [data-qs="fw"][data-qs-v="hit"]' }, { sleep: 300 }, BLUR, { sleep: 400 }, { deliver: { path: 'events/' + code, value: saved } }, { sleep: 600 }, EVAL(CARD),
        // Round Menu -> My stats.
        { tap: '#round-sheet-handle' }, { sleep: 700 }, { tap: '#qs-menu-mystats' }, { sleep: 600 }, EVAL(MY),
        { tap: '#hp-my-stats [data-ms-last="20"]' }, { sleep: 300 }, EVAL(MY)
    ]) }));
    const [c0, c1, c2, m1, m2] = r1;
    report.subscriber = { before: c0 && c0.text, afterPutts: c1 && c1.text, afterSave: c2 && c2.text, my: m1 && m1.tiles };
    f(c0 && c0.rows === 2 && c0.strips === 2, 'subscriber: a quick stats line under each golfer: ' + JSON.stringify(c0 && { rows: c0.rows, strips: c0.strips }));
    f(c0 && c0.inRow && c0.under === true && c0.stripShown, 'subscriber: the line is inside the row, under the score box: ' + JSON.stringify(c0 && { inRow: c0.inRow, under: c0.under, shown: c0.stripShown }));
    f(c0 && /putts/i.test(c0.text) && /4\+/.test(c0.text) && c0.gir === null, 'subscriber: the untouched line: ' + (c0 && c0.text));
    f(c0 && /Par [45]/.test(c0.par) ? /FW/.test(c0.text) : true, 'subscriber: no fairway on a par 4 / 5: ' + (c0 && c0.text));
    f(c0 && !c0.pw && c0.menu, 'subscriber: no paywall; My stats in the Round Menu: ' + JSON.stringify(c0 && { pw: c0.pw, menu: c0.menu }));
    f(c0 && c0.oneLine && c2 && c2.oneLine, 'the stats line wraps at 390px: ' + JSON.stringify([c0 && c0.oneLine, c2 && c2.oneLine]));
    f(c1 && c1.on.indexOf('putts:2') !== -1, 'putts 2 did not take: ' + JSON.stringify(c1 && c1.on));
    f(c1 && c1.gir === 'GIR ✓', 'GIR not worked out from the typed score + 2 putts: ' + (c1 && c1.gir));
    f(c1 && c1.typing && c1.box && c1.box.v !== '', 'the tap took the focus from score entry: ' + JSON.stringify(c1 && { typing: c1.typing, box: c1.box }));
    f(c2 && c2.on.indexOf('putts:2') !== -1 && c2.on.indexOf('fw:hit') !== -1 && c2.gir === 'GIR ✓', 'after the save: ' + JSON.stringify(c2 && { on: c2.on, gir: c2.gir }));
    const recKey = 'hardpan_qstats_v1_' + code + '_p' + (c2 && c2.box ? c2.box.pid : '');
    const rec = c2 && c2.ls[recKey];
    f(rec && rec.holes && rec.holes['1'] && rec.holes['1'].putts === 2 && rec.holes['1'].fw === 'hit' && rec.holes['1'].gir === true, 'not on the phone as { putts, fw, gir }: ' + JSON.stringify(rec && rec.holes));
    f(rec && rec.me === true, 'the round\'s owner phone is not "me" for My stats: ' + JSON.stringify(rec && rec.me));
    f(c2 && c2.writes.some((w) => /scores\/p\d+_h1$|scores$|^update events\/QSTA01$/.test(w)) , 'the score itself was not saved: ' + JSON.stringify(c2 && c2.writes));
    f(c2 && !c2.writes.some((w) => /stats/.test(w)), 'stats were written to the database: ' + JSON.stringify(c2 && c2.writes));
    f(m1 && m1.open, 'Round Menu -> My stats did not open: ' + JSON.stringify(m1));
    f(m1 && m1.saved === 'Saved on this phone', 'My stats does not say "Saved on this phone": ' + JSON.stringify(m1 && m1.saved));
    f(m1 && m1.last === 'Last 5' && m1.tiles.putts === '36.0' && m1.tiles.fir === '100%' && m1.tiles.gir === '100%' && m1.tiles.par4 === (c2 && /Par 4/.test(c2.par) ? '4.00' : m1.tiles.par4), 'My stats numbers: ' + JSON.stringify(m1 && m1.tiles));
    f(m1 && m1.tiles.avg === '—', 'scoring average from a 1-hole round: ' + (m1 && m1.tiles.avg));
    f(m2 && m2.last === 'Last 20' && m2.tiles.putts === '36.0', 'Last 20: ' + JSON.stringify(m2));
    [c0, c1, c2, m1].forEach((s, i) => s && clean('subscriber[' + i + ']', s));

    // ---- 2. THE SWITCH OFF -------------------------------------------------------------
    const [o0] = J(await go({ url: fileUrl('index.html', 'game=QSTB01&group=1'), db: DB({ QSTB01: round('QSTB01') }), pre: SIDE('QSTB01'), stats: false,
        steps: [{ sleep: 1200 }, { tap: '#round-sheet-handle' }, { sleep: 500 }, EVAL(CARD)] }));
    f(o0 && o0.rows === 2 && o0.strips === 0 && !o0.menu && !/Stats/.test(o0.text || ''), 'switch off: quick stats still there: ' + JSON.stringify(o0 && { rows: o0.rows, strips: o0.strips, menu: o0.menu }));
    f(o0 && !Object.keys(o0.ls).length, 'switch off: a stats record was kept: ' + JSON.stringify(o0 && o0.ls));
    if (o0) clean('switch off', o0);

    // ---- 3. NO GPS MAP ------------------------------------------------------------------
    const [n0] = J(await go({ url: fileUrl('index.html', 'game=QSTC01&group=1'), db: DB({ QSTC01: round('QSTC01') }), pre: SIDE('QSTC01'), iap: { active: false },
        steps: [{ sleep: 1200 }, TYPE(4), BLUR, { sleep: 600 }, { tap: '#round-sheet-handle' }, { sleep: 500 }, EVAL(CARD)] }));
    f(n0 && n0.rows === 2 && n0.strips === 0 && !n0.menu, 'no GPS Map: quick stats shown: ' + JSON.stringify(n0 && { rows: n0.rows, strips: n0.strips, menu: n0.menu }));
    f(n0 && !n0.pw, 'no GPS Map: the card put up a paywall');
    if (n0) clean('no GPS Map', n0);

    // ---- 4. HOME ----------------------------------------------------------------------
    // The phone already holds two rounds (as the card leaves them): 18 holes each, par 72 + 9 and + 18.
    const PARS = [4, 4, 4, 4, 3, 5, 4, 3, 5, 4, 4, 5, 3, 4, 4, 3, 5, 4];
    const seed = [['HOMEA', 1, 1000], ['HOMEB', 0.5, 2000]].map(([c, d, at]) => {
        const snap = {}, holes = {};
        PARS.forEach((p, k) => { snap[k + 1] = { s: p + (d === 1 ? 1 : (k % 2 ? 1 : 0)), par: p }; holes[k + 1] = Object.assign({ putts: 2 }, p >= 4 ? { fw: 'hit' } : {}); });
        return "localStorage.setItem('hardpan_qstats_v1_" + c + "_p101', " + JSON.stringify(JSON.stringify({ v: 1, code: c, pid: '101', course: 'X', at, me: true, holes, snap })) + ");";
    }).join('');
    const HOME = `JSON.stringify((function () { var b = document.querySelector('[data-hp-mystats]'); var pw = document.getElementById('gps-paywall');
      return { btn: !!b, shown: !!(b && b.getBoundingClientRect().height > 0), pw: !!(pw && pw.style.display !== 'none'), view: (document.querySelector('.hp-view.on') || {}).id || null, e: window.__e }; })())`;
    const [h0, hm] = J(await go({ url: fileUrl('home.html'), pre: 'try{' + seed + '}catch(e){}', steps: [{ sleep: 800 }, EVAL(HOME), { tap: '.hp-view.on [data-hp-mystats]' }, { sleep: 500 }, EVAL(MY)] }));
    f(h0 && h0.shown && !h0.pw, 'Home: My stats not offered to a subscriber: ' + JSON.stringify(h0));
    // 2 rounds: 81 and 72 + 9 = 81? HOMEB is par + 1 on the 9 even-indexed-odd holes: 72 + 9 = 81; HOMEA 72 + 18 = 90.
    f(hm && hm.open && hm.tiles.avg === '85.5' && hm.tiles.putts === '36.0' && hm.tiles.fir === '100%', 'Home -> My stats numbers: ' + JSON.stringify(hm && hm.tiles));
    report.home = hm && hm.tiles;
    if (h0) clean('home', h0);
    const [hn] = J(await go({ url: fileUrl('home.html'), iap: { active: false }, pre: 'try{' + seed + '}catch(e){}', steps: [{ sleep: 800 }, EVAL(HOME)] }));
    f(hn && !hn.btn && !hn.pw, 'Home, no GPS Map: My stats shown or a paywall: ' + JSON.stringify(hn));

    console.log(JSON.stringify(report, null, 1));
    if (fails.length) { console.error('FAIL (' + fails.length + '):\n - ' + fails.join('\n - ')); process.exit(1); }
    console.log('PASS: quick stats on the card (subscriber), switch off, no GPS Map, Home.');
})().catch((e) => { console.error('could not run: ' + (e && e.stack || e)); process.exit(2); });
