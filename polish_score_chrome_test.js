// ============================================================================
// 2.0 POLISH #4 / #10 / #34 - THE SCORE SHEET, SCORES SAVED WITH NO SIGNAL, AND THE LAST HOLE,
// IN REAL CHROME (iPhone 15 size, phone GPS mode, simple flow). Stub db only, synthetic rounds.
//
//   #34  After a golfer's score the sheet moves on to the next golfer with no score on that hole
//        (the phone's own golfer: once score and putts are in). Penalties clears the Save bar.
//   #4   No signal (writes never settle, the round's listener never fires): a score saved from the
//        sheet is on the card at once, the map's Thru pill counts it and carries "📴 N waiting",
//        the save line never sticks on "Saving…". Back online the queue sends and the badge goes.
//   #10  The last hole saved with every golfer scored: "Finish & settle up" opens. Nothing is
//        finished or written by it.
//
// SHOTS=1 saves the screens to ~/Desktop/claude-code-reports/029/fixed/ (SHOT_TAG names them).
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

const SHOT_DIR = path.join(os.homedir(), 'Desktop', 'claude-code-reports', '029', 'fixed');
const TAG = (process.env.SHOT_TAG || 'after') + (process.env.POLISH_VIEW ? '-' + process.env.POLISH_VIEW : '');
async function shot(j, name) {
    if (!process.env.SHOTS) return;
    try { fs.mkdirSync(SHOT_DIR, { recursive: true }); await j.shot(path.join(SHOT_DIR, name + '-' + TAG + '.png')); } catch (e) {}
}

const round = (code, thru) => {
    const r = wizardSavedRound({ code, golfers: 2, ownerUid: 'anon-cold', thru, flights: false, names: ['Test Alpha', 'Test Bravo'],
        overrides: { activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', groupSizeOverrides: { 0: 2 } } });
    delete r.moneyPool; r.additionalGames = {}; r.additionalGameInstances = {}; r.sideMatches = {};
    if (!thru) r.scores = {};
    return r;
};
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,devPro:true});}});})();";
const GEO = "(function(){ try { Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:function(ok){ var f=function(){ok({coords:{latitude:33.4528,longitude:-79.1547,accuracy:5},timestamp:Date.now()});}; setTimeout(f,50); var t=setInterval(f,1000); return t;}, getCurrentPosition:function(ok){ok({coords:{latitude:33.4528,longitude:-79.1547,accuracy:5},timestamp:Date.now()});}, clearWatch:function(t){clearInterval(t);}}}); } catch(e){} })();";
// NO SIGNAL, as the phone sees it: navigator.onLine false, and every write to the round never
// settles and never fires the round's listener (a cold-opened round, one dead bar).
const OFF = "(function(){ window.__off = false; try { Object.defineProperty(navigator,'onLine',{configurable:true,get:function(){ return !window.__off; }}); } catch(e){} })();";
const WRAP = "(function(){ if (window.__wrapped) return; window.__wrapped = true; var real = db.ref; db.ref = function (p) { var r = real.apply(db, arguments); if (!window.__off) return r; var never = function () { return new Promise(function () {}); };"
    + " var o = Object.create(r); o.set = never; o.update = never; o.remove = never; o.push = function () { var k = Object.create(r); k.key = 'k' + Date.now(); k.set = never; return k; }; return o; }; })()";
// POLISH_VIEW=375x667 runs it on the small phone too.
const VIEW = (function () { const m = /^(\d+)x(\d+)$/.exec(process.env.POLISH_VIEW || ''); return m ? { width: +m[1], height: +m[2] } : { width: 393, height: 852 }; })();
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function start(code, thru) {
    const pre = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO + OFF
        + "try{localStorage.setItem('golfapp_me_" + code + "','101');sessionStorage.setItem('groupPickDismissed:" + code + "','1');"
        + "localStorage.setItem('hardpan_round_side','gps|" + code + "');}catch(e){}";
    const j = await openJourney({ db: { events: { [code]: round(code, thru) }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} }, viewport: VIEW, webgl: true, preScript: pre });
    await j.goto(fileUrl('index.html', 'game=' + code + '&group=1&me=101'), 300);
    const ev = (x) => j.evaluate(x);
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) { if (await ev("!!(window.HardPanGps && HardPanGps.side && HardPanGps.side() === 'gps' && document.querySelector('#gps-overlay .gps-score'))")) break; await sleep(250); }
    await sleep(800);
    const click = async (sel) => { assert.ok(await ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.click(); return true;})()'), 'no ' + sel); await sleep(350); };
    return { j, ev, click };
}
const SHEET = "JSON.stringify((function(){ var w=document.getElementById('hp-score-sheet'); if(!w||w.style.display==='none') return { open:false }; var on=w.querySelector('.hp-ss-chip.on'); return { open:true, sel: on ? on.getAttribute('data-ss-golfer') : null, chips: Array.prototype.map.call(w.querySelectorAll('.hp-ss-chip'), function(c){return c.textContent;}), stats: !!w.querySelector('[data-ss-row=\"putts\"]') }; })())";

test('#34: after a score the sheet moves to the next golfer with none; Penalties clears the Save bar', { timeout: 120000 }, async () => {
    const { j, ev, click } = await start('PS0034', 0);
    try {
        await click('#gps-overlay .gps-score');
        let s = JSON.parse(await ev(SHEET));
        assert.equal(s.open, true, 'Enter score opened the sheet');
        assert.equal(s.sel, '101', 'the phone\'s own golfer first');
        await click('#hp-score-sheet [data-ss-score="4"]');
        s = JSON.parse(await ev(SHEET));
        if (s.stats) {
            assert.equal(s.sel, '101', 'own golfer with stats rows: stays for the putts');
            // PENALTIES IS REACHABLE: scrolled to the end, its row sits wholly above the Save bar.
            const geo = JSON.parse(await ev("JSON.stringify((function(){ var w=document.getElementById('hp-score-sheet'), b=w.querySelector('.hp-ss-body'); b.scrollTop=b.scrollHeight; var pen=w.querySelector('[data-ss-row=\"pen\"]').getBoundingClientRect(), foot=w.querySelector('.hp-ss-foot').getBoundingClientRect(), box=b.getBoundingClientRect(); return { penBottom: pen.bottom, footTop: foot.top, bodyBottom: box.bottom, vh: innerHeight }; })())"));
            assert.ok(geo.penBottom <= geo.footTop - 8, 'Penalties above the Save bar: ' + JSON.stringify(geo));
            assert.ok(geo.footTop <= geo.vh, 'the Save bar on screen: ' + JSON.stringify(geo));
            await shot(j, '34-penalties');
            await ev("document.querySelector('#hp-score-sheet .hp-ss-body').scrollTop = 0");
            await click('#hp-score-sheet [data-ss-k="putts"][data-ss-v="2"]');
            s = JSON.parse(await ev(SHEET));
        }
        assert.equal(s.sel, '102', 'moved on to Test Bravo (no score yet): ' + JSON.stringify(s));
        await shot(j, '34-next-golfer');
        await click('#hp-score-sheet [data-ss-score="5"]');
        s = JSON.parse(await ev(SHEET));
        assert.equal(s.sel, '102', 'everyone scored: the sheet stays');
        await click('#hp-score-sheet [data-ss-save]');
        await sleep(600);
        assert.equal(await ev("String((currentData.scores||{}).p101_h1) + '/' + String((currentData.scores||{}).p102_h1)"), '4/5', 'both saved');
    } finally { await j.close(); }
});

test('#4: no signal - the score is on the card and the Thru pill, "📴 N waiting" on the map, no stuck "Saving…"; back online it sends', { timeout: 120000 }, async () => {
    const { j, ev, click } = await start('PS0004', 2);
    try {
        await ev(WRAP);
        await ev("window.__off = true; window.dispatchEvent(new Event('offline'))");
        await sleep(300);
        const pill0 = await ev("(document.querySelector('#gps-overlay .gps-lc-score')||{}).textContent||''");
        assert.match(pill0, /Thru 2/, 'before: thru 2 - ' + pill0);
        await click('#gps-overlay .gps-score');
        await click('#hp-score-sheet [data-ss-score="4"]');
        if (JSON.parse(await ev(SHEET)).sel === '101') await click('#hp-score-sheet [data-ss-k="putts"][data-ss-v="2"]');
        await click('#hp-score-sheet [data-ss-score="5"]');
        await click('#hp-score-sheet [data-ss-save]');
        await sleep(900);
        const st = JSON.parse(await ev("JSON.stringify({ a: (currentData.scores||{}).p101_h3, b: (currentData.scores||{}).p102_h3, q: OfflineQueue.countFor(localStorage, 'events/PS0004/'), pill: (document.querySelector('#gps-overlay .gps-lc-score')||{}).textContent||'', save: document.getElementById('save-state').textContent })"));
        assert.equal(st.q, 2, 'both scores queued on this phone');
        assert.equal(String(st.a) + '/' + String(st.b), '4/5', 'the queued scores are in the round on screen');
        assert.match(st.pill, /Thru 3/, 'the Thru pill counts the queued hole: ' + st.pill);
        assert.match(st.pill, /📴 2 waiting/, 'the map says 2 waiting: ' + st.pill);
        assert.doesNotMatch(st.save, /Saving/, 'no stuck Saving…: ' + st.save);
        await shot(j, '4-offline-map');
        // The card (Bets side) shows the boxes and the leaderboard line with the queued hole.
        await ev("HardPanGps.showSide('bets', { remember: false }); goToHole(3)");
        await sleep(700);
        const card = JSON.parse(await ev("JSON.stringify({ boxes: Array.prototype.map.call(document.querySelectorAll('.score-input[data-hole=\"3\"]'), function(i){return i.value;}), save: document.getElementById('save-state').textContent })"));
        assert.deepEqual([...new Set(card.boxes.filter(Boolean))].sort(), ['4', '5'], 'the card boxes show the queued scores: ' + JSON.stringify(card));
        assert.doesNotMatch(card.save, /Saving/, 'no stuck Saving…');
        await shot(j, '4-offline-card');
        await ev("HardPanGps.showSide('gps', { remember: false })");
        // Signal back: the queue sends, the badge goes.
        await ev("window.__off = false; window.dispatchEvent(new Event('online'))");
        let pill = '';
        for (let i = 0; i < 40; i++) { await sleep(250); pill = await ev("(document.querySelector('#gps-overlay .gps-lc-score')||{}).textContent||''"); if (!/waiting/.test(pill) && await ev("OfflineQueue.countFor(localStorage, 'events/PS0004/') === 0")) break; }
        assert.equal(await ev("OfflineQueue.countFor(localStorage, 'events/PS0004/')"), 0, 'all sent');
        assert.doesNotMatch(pill, /waiting/, 'the badge is gone: ' + pill);
        assert.match(pill, /Thru 3/, pill);
        await shot(j, '4-back-online');
    } finally { await j.close(); }
});

test('#10: the last hole saved - "Finish & settle up" opens; nothing is finished', { timeout: 120000 }, async () => {
    const { j, ev, click } = await start('PS0010', 17);
    try {
        assert.equal(await ev('HardPanGps.hole()'), 18, 'on the 18th');
        await click('#gps-overlay .gps-score');
        await click('#hp-score-sheet [data-ss-score="4"]');
        if (JSON.parse(await ev(SHEET)).sel === '101') await click('#hp-score-sheet [data-ss-k="putts"][data-ss-v="2"]');
        await click('#hp-score-sheet [data-ss-score="5"]');
        const label = await ev("document.querySelector('#hp-score-sheet [data-ss-save]').textContent");
        assert.equal(label, 'Save', 'the last hole: Save');
        await click('#hp-score-sheet [data-ss-save]');
        await sleep(900);
        assert.equal(await ev("HardPanRound.sheetKind()"), 'finish', 'Finish & settle up is open');
        assert.match(await ev("document.getElementById('hp-sheet').textContent"), /Settle up/);
        const fin = await ev("JSON.stringify({ c: currentData.roundComplete || currentData.finished || currentData.status || null })");
        assert.equal(JSON.parse(fin).c, null, 'nothing marked the round finished');
        await shot(j, '10-finish');
    } finally { await j.close(); }
});
