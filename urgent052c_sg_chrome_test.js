// ============================================================================
// URGENT-052 C - STROKES GAINED (LITE), IN REAL CHROME, REACHED AS A GOLFER DOES (no page function
// is called to render anything: taps on the score sheet, the last hole's Save, Home -> My stats).
//
//   1. The score sheet: FIRST PUTT is one optional row of chips under Putts (the phone's own golfer).
//      A chip tapped before any score blocks nothing (the bottom button is unchanged), the score saves
//      through the card's own save, the chip is kept beside putts in the quick-stats record, 0 putts
//      hides the row, and the row fits the phone's width.
//   2. The last hole: Save -> this round's Strokes Gained card (4 categories, the benchmark picker,
//      Practice this) -> Done -> Finish & settle up, exactly as before. Nothing is finished or written.
//   3. My stats: the Strokes Gained section - Last round / 10 / 20, Scratch / 10 / 20 (kept on this
//      phone), a category with "Not enough data" left out of the total (and the line saying so), the
//      (i) saying "estimated". The tiles below keep Last 5 / Last 20.
// Synthetic data only ("Test ..." golfers, stub db). SG_SHOTS=<dir> saves the screens.
// SG_VIEW=375x667 runs it on the small phone.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-round.js')) || !fs.existsSync(path.join(__dirname, 'gps-stats.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { arriveCold } = require('./tools/lib/cold-arrival.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const VIEW = (function () { const m = /^(\d+)x(\d+)$/.exec(process.env.SG_VIEW || ''); return m ? { width: +m[1], height: +m[2] } : { width: 393, height: 852 }; })();
const SHOTS = process.env.SG_SHOTS || '';
const TAG = VIEW.width + 'x' + VIEW.height;
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,devPro:true});}});})();";
const GEO = "(function(){ try { Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:function(ok){ var f=function(){ok({coords:{latitude:33.4528,longitude:-79.1547,accuracy:5},timestamp:Date.now()});}; setTimeout(f,50); var t=setInterval(f,1000); return t;}, getCurrentPosition:function(ok){ok({coords:{latitude:33.4528,longitude:-79.1547,accuracy:5},timestamp:Date.now()});}, clearWatch:function(t){clearInterval(t);}}}); } catch(e){} })();";
const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});";

const round = (code, thru) => {
    const r = wizardSavedRound({ code, golfers: 2, ownerUid: 'anon-cold', thru, flights: false, names: ['Test 052C Alpha', 'Test 052C Bravo'],
        overrides: { activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', groupSizeOverrides: { 0: 2 } } });
    delete r.moneyPool; r.additionalGames = {}; r.additionalGameInstances = {}; r.sideMatches = {};
    if (!thru) r.scores = {};
    return r;
};
async function start(code, thru, extraPre) {
    const pre = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO + ERR
        + "try{localStorage.setItem('golfapp_me_" + code + "','101');sessionStorage.setItem('groupPickDismissed:" + code + "','1');"
        + "localStorage.setItem('hardpan_round_side','gps|" + code + "');}catch(e){}" + (extraPre || '');
    const r = round(code, thru);
    const j = await openJourney({ db: { events: { [code]: r }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} }, viewport: VIEW, webgl: true, preScript: pre });
    await j.goto(fileUrl('index.html', 'game=' + code + '&group=1&me=101'), 300);
    const ev = (x) => j.evaluate(x);
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) { if (await ev("!!(window.HardPanGps && HardPanGps.side && HardPanGps.side() === 'gps' && document.querySelector('#gps-overlay .gps-score'))")) break; await sleep(250); }
    await sleep(800);
    const click = async (sel) => { assert.ok(await ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.click(); return true;})()'), 'no ' + sel); await sleep(350); };
    return { j, ev, click, round: r };
}
async function shot(j, name) { if (!SHOTS) return; try { fs.mkdirSync(SHOTS, { recursive: true }); await j.shot(path.join(SHOTS, name + '-' + TAG + '.png')); } catch (e) {} }
const SAVE = "document.querySelector('#hp-score-sheet [data-ss-save]').textContent";
const QREC = (code) => "JSON.stringify(JSON.parse(localStorage.getItem('hardpan_qstats_v1_" + code + "_p101')||'null'))";

test('1. score sheet: FIRST PUTT - one optional tap, never blocks the score, kept beside putts, fits the phone', { timeout: 150000 }, async () => {
    const { j, ev, click } = await start('SG52C1', 0);
    try {
        await click('#gps-overlay .gps-score');
        assert.ok(await ev("!!document.querySelector('#hp-score-sheet [data-ss-row=\"putts\"]')"), 'the own golfer\'s stats rows show');
        const labels = JSON.parse(await ev("JSON.stringify(Array.prototype.map.call(document.querySelectorAll('#hp-score-sheet [data-ss-row=\"fp\"] [data-ss-k]'), function(b){return b.textContent;}))"));
        assert.deepEqual(labels, ['<3', '3–6', '6–10', '10–20', '20–40', '40+'], 'the chips');
        // The order on the sheet: Putts, then First putt.
        assert.ok(await ev("(function(){var p=document.querySelector('#hp-score-sheet [data-ss-row=\"putts\"]'), f=document.querySelector('#hp-score-sheet [data-ss-row=\"fp\"]'); return !!(p && f && (p.compareDocumentPosition(f) & 4));})()"), 'First putt is under Putts');
        const before = await ev(SAVE);
        // A chip BEFORE any score: kept, and the bottom button is exactly what it was.
        await click('#hp-score-sheet [data-ss-k="fp"][data-ss-v="6-10"]');
        assert.equal(await ev(SAVE), before, 'the chip blocks nothing: ' + before);
        assert.equal(await ev("document.querySelector('#hp-score-sheet [data-ss-k=\"fp\"][data-ss-v=\"6-10\"]').getAttribute('aria-pressed')"), 'true');
        // The row fits: no chip outside the sheet, no sideways scroll.
        const geo = JSON.parse(await ev("JSON.stringify((function(){var w=document.querySelector('#hp-score-sheet .hp-ss').getBoundingClientRect(); var r=[].map.call(document.querySelectorAll('#hp-score-sheet [data-ss-row=\"fp\"] button'), function(b){var x=b.getBoundingClientRect(); return [x.left, x.right, x.height, b.scrollWidth <= b.clientWidth + 1];}); return { l: w.left, r: w.right, chips: r, sw: document.documentElement.scrollWidth, iw: innerWidth }; })())"));
        geo.chips.forEach((c, i) => { assert.ok(c[0] >= geo.l - 0.5 && c[1] <= geo.r + 0.5, 'chip ' + i + ' inside: ' + JSON.stringify(geo)); assert.ok(c[2] >= 44, 'chip ' + i + ' 44pt tall'); assert.ok(c[3], 'chip ' + i + ' text not cut'); });
        assert.ok(geo.sw <= geo.iw, 'no sideways scroll');
        await click('#hp-score-sheet [data-ss-score="4"]');
        await click('#hp-score-sheet [data-ss-k="putts"][data-ss-v="2"]');
        await ev("(function(){var r=document.querySelector('#hp-score-sheet [data-ss-row=\"fp\"]'); if(r) r.scrollIntoView({block:'center'});})()");
        await sleep(300);
        await shot(j, 'c1-first-putt-chip');
        let rec = JSON.parse(await ev(QREC('SG52C1')));
        assert.equal(rec.holes['1'].putts, 2); assert.equal(rec.holes['1'].fp, '6-10', 'kept beside putts');
        // 0 putts (holed from off the green): no first putt asked; back to 2, the chip is still there.
        await click('#hp-score-sheet [data-ss-k="putts"][data-ss-v="0"]');
        assert.equal(await ev("!!document.querySelector('#hp-score-sheet [data-ss-row=\"fp\"]')"), false, '0 putts: no First putt row');
        await click('#hp-score-sheet [data-ss-k="putts"][data-ss-v="2"]');
        assert.equal(await ev("document.querySelector('#hp-score-sheet [data-ss-k=\"fp\"][data-ss-v=\"6-10\"]').getAttribute('aria-pressed')"), 'true');
        // Tap again = cleared.
        await click('#hp-score-sheet [data-ss-k="fp"][data-ss-v="6-10"]');
        rec = JSON.parse(await ev(QREC('SG52C1')));
        assert.equal(rec.holes['1'].fp, undefined, 'cleared');
        await click('#hp-score-sheet [data-ss-k="fp"][data-ss-v="20-40"]');
        // Next golfer, score, Save: both scores through the card's own save.
        await click('#hp-score-sheet [data-ss-save]');
        await click('#hp-score-sheet [data-ss-score="5"]');
        await click('#hp-score-sheet [data-ss-save]');
        await sleep(700);
        assert.equal(await ev("String((currentData.scores||{}).p101_h1) + '/' + String((currentData.scores||{}).p102_h1)"), '4/5', 'scores saved');
        rec = JSON.parse(await ev(QREC('SG52C1')));
        assert.equal(rec.holes['1'].fp, '20-40'); assert.equal(rec.snap['1'].s, 4);
        assert.deepEqual(JSON.parse(await ev('JSON.stringify(window.__e)')), []);
        // Nothing with a position in any SG / stats key.
        const ls = await ev("JSON.stringify(Object.keys(localStorage).filter(function(k){return /^hardpan_(sg|qstats)_/.test(k);}).map(function(k){return localStorage.getItem(k);}))");
        assert.ok(!/lat|lng|"p":|\d+\.\d{4,}/.test(ls), 'no coordinates: ' + ls);
    } finally { await j.close(); }
});

// The phone's own golfer, holes 1-17 with putts, first putts, tee shots and marks (yards only), as
// the score sheet and Mark shot would have kept them.
function seed17(code) {
    return "try{(function(){var holes={},snap={},yd={},mk={};for(var n=1;n<=17;n++){holes[n]={putts:n%3?2:1,fp:n%3?'10-20':'3-6',fw:n%2?'hit':'R'};mk[n]=[150];yd[n]=400;}"
        + "localStorage.setItem('hardpan_qstats_v1_" + code + "_p101',JSON.stringify({v:1,code:'" + code + "',pid:'101',course:'Caledonia Golf & Fish Club',at:Date.now(),me:true,holes:holes,snap:snap}));"
        + "localStorage.setItem('hardpan_sg_v1_" + code + "',JSON.stringify({v:1,code:'" + code + "',yd:yd,marks:{101:mk}}));})();}catch(e){}";
}

test('2. the last hole: Save -> this round\'s Strokes Gained -> Done -> Finish & settle up, as before', { timeout: 150000 }, async () => {
    const { j, ev, click } = await start('SG52C2', 17, seed17('SG52C2'));
    try {
        assert.equal(await ev('HardPanGps.hole()'), 18, 'on the 18th');
        await click('#gps-overlay .gps-score');
        await click('#hp-score-sheet [data-ss-score="4"]');
        await click('#hp-score-sheet [data-ss-k="putts"][data-ss-v="2"]');
        await click('#hp-score-sheet [data-ss-k="fp"][data-ss-v="3-6"]');
        await click('#hp-score-sheet [data-ss-save]');
        await click('#hp-score-sheet [data-ss-score="5"]');
        assert.equal(await ev(SAVE), 'Save', 'the last hole: Save');
        await click('#hp-score-sheet [data-ss-save]');
        await sleep(900);
        const card = JSON.parse(await ev("JSON.stringify((function(){var c=document.getElementById('hp-sg-card'); if(!c) return null; return { text: c.innerText, cats: [].map.call(c.querySelectorAll('[data-sg-cat]'), function(r){return r.getAttribute('data-sg-cat')+':'+r.getAttribute('data-sg-enough');}), bench: (c.querySelector('[data-sg-bench].on')||{}).textContent, practice: !!c.querySelector('[data-sg-practice]'), h: c.querySelector('.box').getBoundingClientRect().height }; })())"));
        assert.ok(card, 'the Strokes Gained card is up');
        assert.deepEqual(card.cats.map((x) => x.split(':')[0]), ['ott', 'app', 'arg', 'putt']);
        assert.match(card.text, /Round done/); assert.match(card.text, /ESTIMATED/i);
        assert.equal(card.bench, '10 hcp', 'default benchmark: 10 hcp');
        assert.equal(await ev("HardPanRound.sheetKind ? HardPanRound.sheetKind() : null") === 'finish', false, 'Finish waits for Done');
        await shot(j, 'c2-after-round-card');
        // The picker on the card: Scratch re-reads the round.
        const t10 = await ev("document.querySelector('#hp-sg-card [data-sg-total]').getAttribute('data-sg-total')");
        await click('#hp-sg-card [data-sg-bench="0"]');
        const t0 = await ev("document.querySelector('#hp-sg-card [data-sg-total]').getAttribute('data-sg-total')");
        assert.notEqual(t0, t10, 'scratch reads differently: ' + t0 + ' vs ' + t10);
        assert.equal(await ev("localStorage.getItem('hardpan_sg_bench')"), '0', 'kept on this phone');
        await click('#hp-sg-card [data-sg-done]');
        await sleep(900);
        assert.equal(await ev('!!document.getElementById(\'hp-sg-card\')'), false, 'the card closed');
        assert.equal(await ev('HardPanRound.sheetKind()'), 'finish', 'Finish & settle up opens after Done');
        const fin = await ev("JSON.stringify({ c: currentData.roundComplete || currentData.finished || currentData.status || null })");
        assert.equal(JSON.parse(fin).c, null, 'nothing marked the round finished');
        assert.deepEqual(JSON.parse(await ev('JSON.stringify(window.__e)')), []);
    } finally { await j.close(); }
});

// MY STATS: two rounds. The newer one has first putts on only 7 holes (Putting: not enough data on its own).
function seedMy() {
    const PARS = [4, 4, 4, 4, 3, 5, 4, 3, 5, 4, 4, 5, 3, 4, 4, 3, 5, 4];
    const mk = (code, at, fpHoles, miss) => {
        const holes = {}, snap = {}, yd = {}, marks = {};
        PARS.forEach((p, i) => {
            // Par, a bogey every 4th hole (one chip from 50 in, marked), a birdie every 3rd (one putt).
            const n = i + 1, bogey = n % 4 === 0, birdie = !bogey && n % 3 === 0, s = p + (bogey ? 1 : birdie ? -1 : 0);
            snap[n] = { s, par: p };
            holes[n] = { putts: birdie ? 1 : 2 };
            if (p >= 4) holes[n].fw = n % 2 ? 'hit' : 'L';
            if (n <= fpHoles) holes[n].fp = birdie ? '3-6' : '10-20';
            yd[n] = p === 3 ? 165 : p === 4 ? 395 : 530;
            marks[n] = (p === 3 ? [] : p === 4 ? [miss ? 160 : 140] : [250, 95]).concat(bogey ? [25] : []);
        });
        return "localStorage.setItem('hardpan_qstats_v1_" + code + "_p101'," + JSON.stringify(JSON.stringify({ v: 1, code, pid: '101', course: 'Test 052C Papago', at, me: true, holes, snap })) + ");"
            + "localStorage.setItem('hardpan_sg_v1_" + code + "'," + JSON.stringify(JSON.stringify({ v: 1, code, yd, marks: { 101: marks } })) + ");";
    };
    return 'try{' + mk('SG52M1', Date.now() - 86400000, 18, false) + mk('SG52M2', Date.now(), 7, true) + '}catch(e){}';
}
const MY = `JSON.stringify((function () {
  var p = document.getElementById('hp-my-stats'), s = p && p.querySelector('[data-ms-sg]');
  if (!s) return { open: !!p, sg: false };
  return { open: true, sg: true, text: s.innerText,
    last: (s.querySelector('[data-sg-last].on') || {}).textContent, bench: (s.querySelector('[data-sg-bench].on') || {}).textContent,
    total: s.querySelector('[data-sg-total]').getAttribute('data-sg-total'),
    cats: [].map.call(s.querySelectorAll('[data-sg-cat]'), function (r) { return r.getAttribute('data-sg-cat') + ':' + r.getAttribute('data-sg-enough'); }),
    foot: (s.querySelector('[data-sg-foot]') || {}).textContent, practice: (s.querySelector('[data-sg-practice]') || {}).textContent || null,
    tiles: (p.querySelector('.ms-seg [data-ms-last].on') || {}).textContent, info: (document.getElementById('hp-sg-info') || {}).innerText || null,
    sw: document.documentElement.scrollWidth, iw: innerWidth, e: window.__e };
})())`;
async function myStats(steps) {
    const all = [{ sleep: 800 }, { tap: '.hp-view.on [data-hp-act="sstats"]' }, { sleep: 700 }].concat(steps);
    const r = await arriveCold({ url: fileUrl('home.html'), settleMs: 3500, viewport: VIEW,
        preScript: seedMy() + CFG + 'window.__hardpanDoors = true;' + ERR + iapStub({ active: true }), steps: all });
    if (!r.ok) throw new Error(r.reason);
    return r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
}

test('3. My stats: the section, Last round / 10 / 20, Scratch / 10 / 20, not enough data, the (i)', { timeout: 150000 }, async () => {
    const sh = (n) => SHOTS ? [{ shot: path.join(SHOTS, n + '-' + TAG + '.png'), viewportOnly: true }] : [];
    const scrollTo = (sel) => ({ expression: "(function(){var e=document.querySelector(" + JSON.stringify(sel) + "); if(e) e.scrollIntoView({block:'start'}); var p=document.getElementById('hp-my-stats'); if(p) p.scrollTop-=8; return 1;})()" });
    const v = await myStats([
        { expression: MY }, scrollTo('[data-ms-sg]'), { sleep: 300 }].concat(sh('c3-mystats-last10-10hcp'), [
        { tap: '[data-ms-sg] [data-sg-bench="0"]' }, { sleep: 400 }, { expression: MY },
        { tap: '[data-ms-sg] [data-sg-last="1"]' }, { sleep: 400 }, { expression: MY }, scrollTo('[data-ms-sg]'), { sleep: 300 }], sh('c4-not-enough-data'), [
        { tap: '[data-ms-sg] [data-sg-info]' }, { sleep: 500 }, { expression: MY }], sh('c5-info'), [
        { tap: '#hp-sg-info button' }, { sleep: 300 },
        { tap: '[data-ms-sg] [data-sg-last="20"]' }, { sleep: 300 }, { tap: '[data-ms-sg] [data-sg-bench="20"]' }, { sleep: 400 }, { expression: MY }]));
    const [a, b, c, d, e] = v;
    // Default: Last 10 vs a 10 handicap, both rounds; every category has 18+ holes over the two.
    assert.ok(a.open && a.sg, 'the section is on My stats');
    assert.equal(a.last, 'Last 10'); assert.equal(a.bench, '10 hcp'); assert.equal(a.tiles, 'Last 5', 'the tiles keep Last 5 / 20');
    assert.deepEqual(a.cats, ['ott:1', 'app:1', 'arg:1', 'putt:1']);
    assert.match(a.text, /ESTIMATED/i); assert.match(a.text, /2 rounds/);
    assert.ok(a.practice && /^🎯 PRACTICE THIS/.test(a.practice), 'Practice this: ' + a.practice);
    assert.ok(a.sw <= a.iw, 'no sideways scroll');
    // Scratch: the same rounds read worse.
    assert.equal(b.bench, 'Scratch');
    assert.ok(Number(b.total) < Number(a.total), 'scratch ' + b.total + ' < 10 hcp ' + a.total);
    // Last round: Putting has 7 holes - not enough data, out of the total, and the line says so.
    assert.equal(c.last, 'Last round');
    assert.ok(c.cats.indexOf('putt:0') !== -1, 'putting: not enough data - ' + c.cats);
    assert.match(c.text, /Not enough data\. Needs first-putt length on 18\+ holes · you have 7\./);
    assert.match(c.foot, /Total leaves out .*Putting/);
    // The (i): what each category uses, "estimated", Broadie named.
    assert.ok(d.info, 'the (i) opened');
    assert.match(d.info, /How Strokes Gained works/); assert.match(d.info, /estimated/); assert.match(d.info, /Broadie/);
    assert.match(d.info, /Off the tee/); assert.match(d.info, /Putting/);
    // Kept: Last 20 vs a 20.
    assert.equal(e.last, 'Last 20'); assert.equal(e.bench, '20 hcp');
    assert.ok(Number(e.total) > Number(a.total), '20 hcp ' + e.total + ' > 10 hcp ' + a.total);
    v.forEach((x) => assert.deepEqual(x.e, [], 'page errors'));
});
