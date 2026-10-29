// ============================================================================
// 092 THE COMBO CARD (Manny APPROVED Oct 27 - outbox/092-PREVIEW.md + 092-ANSWERS.md), IN REAL CHROME.
// The map's Card sheet: header "Hole N · Par P" + Full card ›, tiles, the compact 18-hole card, quick entry.
// Stub db only, synthetic "Test" rounds (never live, never written to Firebase), phone GPS mode, simple flow.
//
//   flow     putts (no default) then the score: saved through the card's own save, then the next golfer
//            with no score, then the next hole; a name picks the golfer; a box loads that golfer + hole
//            (an earlier hole edits in place, then back to the map's hole); 7+ opens 7-15; More › opens
//            today's full Enter score sheet for that golfer and hole; tiles hide for a golfer whose stats
//            are not tracked; only the score keys write to the round (scores/p<id>_h<n>), putts stay on
//            the phone (hardpan_qstats_v1_<code>_p<id>).
//   18       after the last golfer on 18 the sheet stays open and shows "Finish & settle up"; it opens
//            today's Settle up (display only).
//   layout   375x667 / 402x874 / 440x956, dark and light (html.dark-mode), 4 and 6 golfers: no overlaps,
//            nothing off screen, no clipped keys or tiles; 4 golfers fit, 6 scroll on the SE with the
//            hint and the keys pinned.
// SHOTS=1 saves screens to ~/Desktop/claude-code-reports/092/built/.
// ============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-round.js'))) { console.log('Consumer tree: no simple-flow round - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const SHOT_DIR = path.join(os.homedir(), 'Desktop', 'claude-code-reports', '092', 'built');
async function shot(j, name) {
    if (!process.env.SHOTS) return;
    try { fs.mkdirSync(SHOT_DIR, { recursive: true }); await j.shot(path.join(SHOT_DIR, name + '.png')); } catch (e) {}
}
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const NAMES = ['Skeens Test', 'Bob Test', 'Manny Test', 'Paul Test', 'Luis Test', 'Chris Test'];
const round = (code, n, thru) => {
    const r = wizardSavedRound({ code, golfers: n, ownerUid: 'anon-cold', thru: thru || 0, flights: false, names: NAMES.slice(0, n),
        overrides: { activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', groupSizeOverrides: { 0: n } } });
    delete r.moneyPool; r.additionalGames = {}; r.additionalGameInstances = {}; r.sideMatches = {};
    if (!thru) r.scores = {};
    return r;
};
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,devPro:true});}});})();";
const GEO = "(function(){ try { Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:function(ok){ var f=function(){ok({coords:{latitude:33.4528,longitude:-79.1547,accuracy:5},timestamp:Date.now()});}; setTimeout(f,50); var t=setInterval(f,1000); return t;}, getCurrentPosition:function(ok){ok({coords:{latitude:33.4528,longitude:-79.1547,accuracy:5},timestamp:Date.now()});}, clearWatch:function(t){clearInterval(t);}}}); } catch(e){} })();";
const SPY = "(function(){ if (window.__w) return 1; window.__w = []; var real = db.ref; db.ref = function (p) { var r = real.apply(db, arguments); var u = r.update, s = r.set;"
    + " r.update = function (v) { window.__w.push(['update', String(p), Object.keys(v || {}).sort()]); return u.apply(r, arguments); };"
    + " r.set = function (v) { window.__w.push(['set', String(p)]); return s.apply(r, arguments); }; return r; }; return 1; })()";

async function start(code, opt) {
    const o = opt || {};
    const me = o.me || '103';
    const pre = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO
        + "try{localStorage.setItem('golfapp_me_" + code + "','" + me + "');sessionStorage.setItem('groupPickDismissed:" + code + "','1');"
        + "localStorage.setItem('hardpan_round_side','gps|" + code + "');}catch(e){}";
    const j = await openJourney({ db: { events: { [code]: round(code, o.golfers || 4, o.thru) }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} }, viewport: o.view || { width: 402, height: 874 }, webgl: true, preScript: pre });
    await j.goto(fileUrl('index.html', 'game=' + code + '&group=1&me=' + me), 300);
    const ev = (x) => j.evaluate(x);
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) { if (await ev("!!(window.HardPanGps && HardPanGps.side && HardPanGps.side() === 'gps' && document.querySelector('#gps-overlay .gps-side-bets'))")) break; await sleep(250); }
    await sleep(800);
    const J = async (x) => JSON.parse(await ev('JSON.stringify(' + x + ')'));
    const click = async (sel) => { assert.ok(await ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.click(); return true;})()'), 'no ' + sel); await sleep(300); };
    return { j, ev, J, click };
}
// The sheet as the golfer sees it.
const CC = "(function(){ var w=document.getElementById('hp-compact-card'); var open=!!(w&&w.parentNode&&w.style.display!=='none'); if(!open) return { open:false };"
    + " var sel=w.querySelector('tr.hp-cc-sel'); var q=function(s){return Array.prototype.map.call(w.querySelectorAll(s),function(e){return e;});};"
    + " return { open:true, title:w.querySelector('.hp-cc-title').textContent, aria:w.getAttribute('aria-label'), sel: sel ? sel.getAttribute('data-cc-row') : null,"
    + " qhole: Number((w.querySelector('[data-cc-qhole]')||{}).getAttribute ? w.querySelector('[data-cc-qhole]').getAttribute('data-cc-qhole') : 0),"
    + " tiles: q('[data-cc-tile]').map(function(t){return [t.getAttribute('data-cc-tile'), t.querySelector('b').textContent, t.classList.contains('good')];}),"
    + " keys: q('[data-cc-keys] .hp-cc-key').map(function(k){return k.textContent;}), par: q('[data-cc-keys] .hp-cc-key.par').map(function(k){return k.getAttribute('data-cc-score');}),"
    + " putts: q('[data-cc-putts]').map(function(k){return k.textContent + (k.classList.contains('on') ? '*' : '');}), finish: !!w.querySelector('[data-cc-finish]'),"
    + " more: !!w.querySelector('[data-cc-moresheet]'), map: HardPanGps.hole(), side: HardPanGps.side() }; })()";

test('092 flow: putts then score, next golfer, next hole; name and box pick; 7+; More ›; tiles hide; only scores written', { timeout: 180000 }, async () => {
    const code = 'T092FL';
    const { j, ev, J, click } = await start(code);
    try {
        await ev(SPY);
        await click('#gps-overlay .gps-side-bets');
        await sleep(400);
        let c = await J(CC);
        assert.equal(c.open, true, 'Card opens the COMBO card');
        assert.equal(c.side, 'gps', 'over the map');
        assert.equal(c.aria, 'Scorecard', 'the dialog keeps its name for screen readers');
        assert.equal(c.title, 'Hole 1 · Par 4', 'header: Hole N · Par P');
        assert.equal(c.sel, '103', 'this phone\'s golfer selected first');
        assert.equal(c.qhole, 1);
        assert.deepEqual(c.keys, ['1ACE', '2EAGLE', '3BIRDIE', '4PAR', '5BOGEY', '6DOUBLE', '7+MORE'], 'fixed keys 1-7+');
        assert.deepEqual(c.par, ['4'], 'par lime');
        const tracked = c.tiles.length === 5;
        assert.deepEqual(c.tiles.map((t) => t[0]), tracked ? ['topar', 'thru', 'putts', 'fw', 'gir'] : ['topar', 'thru']);
        assert.ok(tracked, 'quick stats are on in this harness (GPS Pro): ' + JSON.stringify(c.tiles));
        assert.deepEqual(c.putts, ['0', '1', '2', '3', '4+'], 'putts row, nothing selected (no default)');
        await shot(j, 'flow-1-open');
        // PUTTS FIRST: phone-only, no score yet, no write.
        await click('#hp-compact-card [data-cc-putts="2"]');
        c = await J(CC);
        assert.deepEqual(c.putts, ['0', '1', '2*', '3', '4+'], 'putts 2 picked');
        assert.equal(await ev("String((currentData.scores||{}).p103_h1)"), 'undefined', 'putts save no score');
        assert.equal(await ev("JSON.parse(localStorage.getItem('hardpan_qstats_v1_" + code + "_p103')).holes['1'].putts"), 2, 'putts in the phone-only record');
        assert.deepEqual(await J('window.__w'), [], 'putts write nothing to the round');
        // THE SCORE: saved, then the next golfer with no score (after Manny: Paul).
        await click('#hp-compact-card [data-cc-score="4"]');
        assert.equal(await ev("String((currentData.scores||{}).p103_h1)"), '4', 'saved through the card\'s own save');
        c = await J(CC);
        assert.equal(c.sel, '104', 'on to the next golfer');
        assert.deepEqual(c.tiles.map((t) => t[0]), ['topar', 'thru'], 'another golfer, stats not tracked for others: TO PAR + THRU only');
        assert.deepEqual(c.putts, [], 'no putts row for them');
        // TILES for Manny: E (green), thru 1, putts 2, fairways none answered, greens 1/1.
        await click('#hp-compact-card [data-cc-golfer="103"]');
        c = await J(CC);
        assert.equal(c.sel, '103', 'a name tap switches the golfer');
        assert.deepEqual(c.tiles, [['topar', 'E', true], ['thru', '1', false], ['putts', '2', false], ['fw', '—', false], ['gir', '1/1', false]], 'Manny\'s tiles');
        // NAME TAP + the rest of the hole.
        await click('#hp-compact-card [data-cc-golfer="101"]');
        await click('#hp-compact-card [data-cc-score="3"]');
        c = await J(CC);
        assert.equal(c.sel, '102', 'Skeens scored: Bob next');
        await click('#hp-compact-card [data-cc-score="5"]');
        c = await J(CC);
        assert.equal(c.sel, '104', 'Bob scored: Paul (Manny already in)');
        await shot(j, 'flow-2-last-golfer');
        await click('#hp-compact-card [data-cc-score="6"]');
        await sleep(600);
        c = await J(CC);
        assert.equal(c.open, true, 'the sheet stays open');
        assert.equal(c.map, 2, 'everyone in: the round moved to hole 2');
        assert.deepEqual([c.title, c.qhole, c.sel], ['Hole 2 · Par 4', 2, '103'], 'quick entry on hole 2, this phone\'s golfer');
        assert.deepEqual(await J("['101','102','103','104'].map(function(p){ return (currentData.scores||{})['p'+p+'_h1']; })"), [3, 5, 4, 6], 'hole 1 saved');
        // THE MARKS (081): birdie circle, bogey box, double box.
        assert.deepEqual(await J("['101','102','103','104'].map(function(p){ var s=document.querySelector('#hp-compact-card [data-cc-hole=\"1\"][data-cc-player=\"'+p+'\"] .hp-cc-n'); return s ? s.className.replace('hp-cc-n','').trim() : null; })"),
            ['mark-birdie', 'mark-bogey', '', 'mark-double'], 'the 081 marks on hole 1');
        assert.equal(await ev("document.querySelectorAll('#hp-compact-card th.hp-cc-now').length"), 1, 'the map\'s hole outlined');
        assert.equal(await ev("document.querySelector('#hp-compact-card th.hp-cc-now').textContent"), '2');
        // A BOX ON AN EARLIER HOLE: edit in place; the map stays on hole 2.
        await click('#hp-compact-card [data-cc-hole="1"][data-cc-player="102"]');
        c = await J(CC);
        assert.deepEqual([c.sel, c.qhole, c.map], ['102', 1, 2], 'Bob, hole 1, map still on 2');
        assert.equal(await ev("!!document.querySelector('#hp-compact-card td.hp-cc-tgt [data-cc-hole=\"1\"][data-cc-player=\"102\"]')"), true, 'the box being edited is outlined');
        // 7+: the rest of the scores.
        await click('#hp-compact-card [data-cc-seven]');
        assert.equal(await ev("document.querySelectorAll('#hp-compact-card .hp-cc-seven [data-cc-score]').length"), 9, '7..15');
        await click('#hp-compact-card .hp-cc-seven [data-cc-score="8"]');
        assert.equal(await ev("String((currentData.scores||{}).p102_h1)"), '8', 'an 8 from 7+');
        c = await J(CC);
        assert.deepEqual([c.qhole, c.map, c.sel], [2, 2, '103'], 'everyone already in on hole 1: back to the map\'s hole');
        // MORE ›: today's full Enter score sheet for that golfer and hole.
        await click('#hp-compact-card [data-cc-golfer="102"]');
        await click('#hp-compact-card [data-cc-moresheet]');
        const s = await J("(function(){ var w=document.getElementById('hp-score-sheet'); if(!w||w.style.display==='none') return null; var on=w.querySelector('.hp-ss-chip.on'); return { sel: on ? on.getAttribute('data-ss-golfer') : null, hole: HardPanGpsStats.sheet.shownHole() }; })()");
        assert.deepEqual(s, { sel: '102', hole: 2 }, 'More › opened the Enter score sheet on Bob, hole 2');
        await ev('HardPanGpsStats.sheet.close()'); await sleep(500);
        assert.equal((await J(CC)).open, true, 'back on the COMBO card');
        // ONLY SCORES WERE WRITTEN, and only to scores/p<id>_h<n> (plus the card's own audit line).
        const w = await J('window.__w');
        assert.ok(w.length > 0, 'the saves went through the db');
        assert.ok(w.every((x) => /\/scores\/p10[1-4]_h1$|\/auditLog(\/|$)/.test(x[1])), 'only score (and audit) writes: ' + JSON.stringify(w));
        // FULL CARD ›
        await click('#hp-compact-card [data-cc-full]');
        await sleep(600);
        assert.deepEqual(await J("[HardPanGps.side(), currentViewMode, HardPanRound.compactCardOpen()]"), ['bets', 'full', false], 'Full card › is the full page');
    } finally { await j.close(); }
});

test('092 hole 18: after the last golfer the sheet stays and shows "Finish & settle up" (display only)', { timeout: 150000 }, async () => {
    const code = 'T092FN';
    const { j, ev, J, click } = await start(code, { thru: 17 });
    try {
        await ev('goToHole(18)'); await sleep(800);
        await ev(SPY);
        await click('#gps-overlay .gps-side-bets');
        let c = await J(CC);
        assert.deepEqual([c.open, c.map, c.qhole, c.finish], [true, 18, 18, false], 'hole 18, no Finish yet');
        for (let k = 0; k < 4; k++) await click('#hp-compact-card [data-cc-score="4"]');
        await sleep(500);
        c = await J(CC);
        assert.equal(c.open, true, 'the sheet stays open on 18');
        assert.equal(c.map, 18, 'still on 18');
        assert.equal(c.finish, true, '"Finish & settle up" shows');
        assert.equal(await ev("document.querySelector('#hp-compact-card [data-cc-finish]').textContent"), 'Finish & settle up');
        await shot(j, 'finish-18');
        await click('#hp-compact-card [data-cc-finish]');
        await sleep(500);
        assert.equal(await ev('HardPanRound.compactCardOpen()'), false, 'the card steps aside');
        assert.equal(await ev("(function(){ var r=document.getElementById('hp-sheet'); return !!(r && r.classList.contains('open')) && r.getAttribute('aria-label'); })()"), 'Settle up', 'today\'s Settle up opens');
        const w = await J('window.__w');
        assert.ok(w.every((x) => /\/scores\/p10[1-4]_h18$|\/auditLog(\/|$)/.test(x[1])), 'Finish wrote nothing: ' + JSON.stringify(w));
    } finally { await j.close(); }
});

// LAYOUT: no overlaps, nothing off screen, nothing clipped - three phones, dark and light, 4 and 6 golfers.
const GEO_JS = "(function(){ var w=document.getElementById('hp-compact-card'), r=function(s){ var e=w.querySelector(s); if(!e) return null; var b=e.getBoundingClientRect(); return { t:b.top, b:b.bottom, l:b.left, r:b.right, h:b.height }; };"
    + " var body=w.querySelector('.hp-cc-body'); var clipped=[]; Array.prototype.forEach.call(w.querySelectorAll('.hp-cc-key, .hp-cc-tile span, .hp-cc-tile b, .hp-cc-full, .hp-cc-title, .hp-cc-moresheet'), function(e){ if (e.scrollWidth > e.clientWidth + 1) clipped.push(e.className + ':' + e.textContent); });"
    + " return { vh: innerHeight, vw: innerWidth, sheet: r('.hp-cc'), head: r('.hp-cc-head'), who: r('.hp-cc-who'), tiles: r('.hp-cc-tiles'), body: r('.hp-cc-body'), qe: r('.hp-cc-qe'), keys: r('[data-cc-keys]'), putts: r('[data-cc-puttsrow]'),"
    + " scrolls: body.scrollHeight > body.clientHeight + 2, hint: !!w.querySelector('.hp-cc-hint'), bg: getComputedStyle(w.querySelector('.hp-cc')).backgroundColor, clipped: clipped, hscroll: document.documentElement.scrollWidth > innerWidth + 1 }; })()";
for (const view of [{ width: 375, height: 667 }, { width: 402, height: 874 }, { width: 440, height: 956 }]) {
    for (const golfers of [4, 6]) {
        test('092 layout ' + view.width + 'x' + view.height + ', ' + golfers + ' golfers, dark and light', { timeout: 120000 }, async () => {
            const code = 'T092L' + golfers;
            const { j, ev, J, click } = await start(code, { view, golfers, thru: 5 });
            try {
                await click('#gps-overlay .gps-side-bets');
                for (const theme of ['dark', 'light']) {
                    await ev("document.documentElement.classList." + (theme === 'dark' ? 'add' : 'remove') + "('dark-mode')");
                    await ev("HardPanRound.closeCompactCard(); HardPanRound.openCompactCard()");
                    await sleep(400);
                    const g = await J(GEO_JS);
                    const tag = view.width + 'x' + view.height + ' ' + theme + ' ' + golfers + ': ' + JSON.stringify(g);
                    assert.equal(g.bg, theme === 'dark' ? 'rgb(17, 22, 17)' : 'rgb(255, 255, 255)', 'theme follows html.dark-mode ' + tag);
                    const order = ['head', 'who', 'tiles', 'body', 'qe'];
                    for (let k = 1; k < order.length; k++) assert.ok(g[order[k]].t >= g[order[k - 1]].b - 0.5, order[k] + ' below ' + order[k - 1] + ' ' + tag);
                    assert.ok(g.keys.b <= g.qe.b && (!g.putts || g.putts.t >= g.keys.b), 'putts under the keys ' + tag);
                    assert.ok(g.sheet.t >= 52 - 0.5, 'the sheet stops 52 px under the top ' + tag);
                    assert.ok(g.qe.b <= g.vh + 0.5 && g.sheet.r <= g.vw + 0.5 && g.sheet.l >= -0.5, 'on screen ' + tag);
                    assert.deepEqual(g.clipped, [], 'nothing clipped ' + tag);
                    assert.equal(g.hscroll, false, 'no sideways scroll ' + tag);
                    assert.ok(g.putts, 'the putts row (this phone\'s golfer) ' + tag);
                    if (golfers === 4) assert.equal(g.scrolls, false, '4 golfers fit ' + tag);
                    if (golfers === 6 && view.height === 667) { assert.equal(g.scrolls, true, '6 golfers scroll on the SE ' + tag); assert.equal(g.hint, true, 'the scroll hint ' + tag); }
                    if (!g.scrolls) assert.equal(g.hint, false, 'no hint when nothing scrolls ' + tag);
                    await shot(j, 'card-' + golfers + 'golfers-' + theme + '-' + view.width + 'x' + view.height);
                }
                if (golfers === 6 && view.height === 667) {
                    // Scrolled to the bottom: the keys stay pinned, and the last golfer's back nine shows.
                    const pin = await J("(function(){ var w=document.getElementById('hp-compact-card'), b=w.querySelector('.hp-cc-body'), k0=w.querySelector('[data-cc-keys]').getBoundingClientRect().top; b.scrollTop=b.scrollHeight; var k1=w.querySelector('[data-cc-keys]').getBoundingClientRect().top; var last=w.querySelector('table[data-cc-half=\"In\"] tr.hp-cc-g:last-child').getBoundingClientRect(); return { moved: Math.abs(k1-k0), lastIn: last.bottom <= b.getBoundingClientRect().bottom + 1 }; })()");
                    assert.deepEqual(pin, { moved: 0, lastIn: true }, 'keys pinned while the card scrolls');
                    await shot(j, 'card-6golfers-scrolled-light-375x667');
                }
            } finally { await j.close(); }
        });
    }
}
