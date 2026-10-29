// ============================================================================
// 2.0 POLISH #4 / #10 / #34 - THE SCORE SHEET, SCORES SAVED WITH NO SIGNAL, AND THE LAST HOLE,
// IN REAL CHROME (iPhone 15 size, phone GPS mode, simple flow). Stub db only, synthetic rounds.
//
//   #34  After a golfer's score the sheet moves on to the next golfer with no score on that hole.
//        URGENT-034: never the phone's own golfer - they stay until "Next: <golfer> ›" is tapped.
//        Penalties clears the Save bar.
//   URGENT-034 bug 1: ONE tap anywhere on the green bar (Hole 2 · Group 1 · Manny ▾ · Enter score)
//        opens the sheet once on the golfer shown; only ▾ opens "Whose score?", and a pick there
//        opens the sheet for that golfer; ‹ › only when tapped directly. Real taps (mouse at a point).
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

// URGENT-034: Manny's round - Skeens / Bob / Manny / Paul in Group 1 (one more golfer in Group 2, so
// the bar reads "Group 1 · Manny ▾"); this phone is Manny, the 3rd.
const round034 = (code) => {
    const r = wizardSavedRound({ code, golfers: 5, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Skeens Test', 'Bob Test', 'Manny Test', 'Paul Test', 'Extra Test'],
        overrides: { activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', groupSizeOverrides: { 0: 4, 1: 1 } } });
    delete r.moneyPool; r.additionalGames = {}; r.additionalGameInstances = {}; r.sideMatches = {}; r.scores = {};
    return r;
};
async function start(code, thru, opt) {
    const me = (opt && opt.me) || '101';
    const pre = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO + OFF
        + "try{localStorage.setItem('golfapp_me_" + code + "','" + me + "');sessionStorage.setItem('groupPickDismissed:" + code + "','1');"
        + "localStorage.setItem('hardpan_round_side','gps|" + code + "');}catch(e){}";
    const j = await openJourney({ db: { events: { [code]: (opt && opt.round) || round(code, thru) }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} }, viewport: VIEW, webgl: true, preScript: pre });
    await j.goto(fileUrl('index.html', 'game=' + code + '&group=1&me=' + me), 300);
    const ev = (x) => j.evaluate(x);
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) { if (await ev("!!(window.HardPanGps && HardPanGps.side && HardPanGps.side() === 'gps' && document.querySelector('#gps-overlay .gps-score'))")) break; await sleep(250); }
    await sleep(800);
    const click = async (sel) => { assert.ok(await ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.click(); return true;})()'), 'no ' + sel); await sleep(350); };
    return { j, ev, click };
}
const SHEET = "JSON.stringify((function(){ var w=document.getElementById('hp-score-sheet'); if(!w||w.style.display==='none') return { open:false }; var on=w.querySelector('.hp-ss-chip.on'); return { open:true, sel: on ? on.getAttribute('data-ss-golfer') : null, chips: Array.prototype.map.call(w.querySelectorAll('.hp-ss-chip'), function(c){return c.textContent;}), stats: !!w.querySelector('[data-ss-row=\"putts\"]') }; })())";

test('#34 + URGENT-034: other golfers move on after a score; the phone\'s own golfer never does; Penalties clears the Save bar', { timeout: 120000 }, async () => {
    const { j, ev, click } = await start('PS0034', 0);
    try {
        await click('#gps-overlay .gps-score');
        let s = JSON.parse(await ev(SHEET));
        assert.equal(s.open, true, 'Enter score opened the sheet');
        assert.equal(s.sel, '101', 'the phone\'s own golfer first');
        await click('#hp-score-sheet [data-ss-score="4"]');
        s = JSON.parse(await ev(SHEET));
        assert.equal(s.sel, '101', 'own golfer: stays after the score');
        if (s.stats) {
            // PENALTIES IS REACHABLE: scrolled to the end, its row sits wholly above the Save bar.
            const geo = JSON.parse(await ev("JSON.stringify((function(){ var w=document.getElementById('hp-score-sheet'), b=w.querySelector('.hp-ss-body'); b.scrollTop=b.scrollHeight; var pen=w.querySelector('[data-ss-row=\"pen\"]').getBoundingClientRect(), foot=w.querySelector('.hp-ss-foot').getBoundingClientRect(), box=b.getBoundingClientRect(); return { penBottom: pen.bottom, footTop: foot.top, bodyBottom: box.bottom, vh: innerHeight }; })())"));
            assert.ok(geo.penBottom <= geo.footTop - 8, 'Penalties above the Save bar: ' + JSON.stringify(geo));
            assert.ok(geo.footTop <= geo.vh, 'the Save bar on screen: ' + JSON.stringify(geo));
            await shot(j, '34-penalties');
            await ev("document.querySelector('#hp-score-sheet .hp-ss-body').scrollTop = 0");
            await click('#hp-score-sheet [data-ss-k="putts"][data-ss-v="2"]');
            s = JSON.parse(await ev(SHEET));
            assert.equal(s.sel, '101', 'URGENT-034: own golfer stays after putts too: ' + JSON.stringify(s));
        }
        assert.equal(await ev("document.querySelector('#hp-score-sheet [data-ss-save]').textContent"), 'Next: Test Bravo ›', 'the button says where it goes');
        await click('#hp-score-sheet [data-ss-save]');
        s = JSON.parse(await ev(SHEET));
        assert.equal(s.sel, '102', 'Next: moved on to Test Bravo (no score yet): ' + JSON.stringify(s));
        await shot(j, '34-next-golfer');
        await click('#hp-score-sheet [data-ss-score="5"]');
        s = JSON.parse(await ev(SHEET));
        assert.equal(s.sel, '102', 'everyone scored: the sheet stays');
        assert.equal(await ev("document.querySelector('#hp-score-sheet [data-ss-save]').textContent"), 'Save · Next hole ›', 'everyone scored: Save · Next hole ›');
        await click('#hp-score-sheet [data-ss-save]');
        await sleep(600);
        assert.equal(await ev("String((currentData.scores||{}).p101_h1) + '/' + String((currentData.scores||{}).p102_h1)"), '4/5', 'both saved');
    } finally { await j.close(); }
});

// A REAL TAP at a point (the mouse, as the phone's finger lands) - whatever is under it gets it.
async function tapAt(j, x, y) {
    for (const type of ['mousePressed', 'mouseReleased']) await j.cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    await sleep(450);
}
const SPY = "(function(){ if (window.__opens != null) return; window.__opens = 0; var S = HardPanGpsStats.sheet, o = S.open; S.open = function () { window.__opens++; return o.apply(this, arguments); }; })()";
const STATE = "JSON.stringify((function(){ var w=document.getElementById('hp-score-sheet'), ws=document.querySelector('#gps-overlay .gps-who-sheet'); var on = w && w.style.display!=='none' ? w.querySelector('.hp-ss-chip.on') : null; return { sheet: on ? on.getAttribute('data-ss-golfer') : null, picker: !!(ws && ws.style.display!=='none'), opens: window.__opens, hole: HardPanGps.hole(), bar: (document.querySelector('#gps-overlay .gps-ld-l1')||{}).textContent }; })())";
const RESET = "(function(){ var w=document.getElementById('hp-score-sheet'); if (w && w.style.display!=='none') HardPanGpsStats.sheet.close(); var ws=document.querySelector('#gps-overlay .gps-who-sheet'); if (ws) ws.style.display='none'; window.__opens = 0; })()";

test('URGENT-034 bug 1: one tap anywhere on the bar opens the sheet once on the golfer shown; only ▾ is the picker, and its pick opens the sheet', { timeout: 150000 }, async () => {
    const { j, ev } = await start('PS3401', 0, { me: '103', round: round034('PS3401') });
    try {
        await ev('gpsStepHole(1)'); await sleep(900);
        assert.equal(await ev('HardPanGps.hole()'), 2, 'on hole 2');
        await ev(SPY);
        const R = JSON.parse(await ev("JSON.stringify((function(){ var o={}; ['.gps-score-col','.gps-ld-holelbl','.gps-who','.gps-who-pick','.gps-score','.gps-score-prev','.gps-score-next'].forEach(function(k){ var e=document.querySelector('#gps-overlay '+k); if(!e) return; var b=e.getBoundingClientRect(); o[k]={x:b.left,y:b.top,w:b.width,h:b.height}; }); return o; })())"));
        assert.match(await ev("document.querySelector('#gps-overlay .gps-ld-l1').textContent"), /Hole 2.*Group 1 · Manny ▾/, 'the bar Manny saw');
        await shot(j, '034-bar');
        const col = R['.gps-score-col'], who = R['.gps-who'], pick = R['.gps-who-pick'];
        const mid = (r) => [r.x + r.w / 2, r.y + r.h / 2];
        // Everywhere on the bar between ‹ and › - the name the loop came from first.
        const pts = { 'the name (Group 1 · Manny)': [who.x + 20, who.y + who.h / 2], 'Hole 2': mid(R['.gps-ld-holelbl']), 'Enter score': mid(R['.gps-score']),
            'left of the words': [col.x + 12, col.y + col.h / 2], 'right of the words': [col.x + col.w - 12, col.y + col.h / 2], 'bar centre': mid(col),
            'bar top edge': [col.x + col.w / 2, col.y + 3], 'bar bottom edge': [col.x + col.w / 2, col.y + col.h - 3] };
        for (const [name, p] of Object.entries(pts)) {
            if (name === 'Hole 2' && !(R['.gps-ld-holelbl'] && R['.gps-ld-holelbl'].w > 0)) continue;   // a narrow bar drops the "Hole 2" word
            for (let k = 0; k < (name === 'the name (Group 1 · Manny)' ? 10 : 1); k++) {
                await ev(RESET);
                await tapAt(j, p[0], p[1]);
                const st = JSON.parse(await ev(STATE));
                assert.equal(st.sheet, '103', name + ' (tap ' + (k + 1) + '): the sheet on Manny - ' + JSON.stringify(st));
                assert.equal(st.opens, 1, name + ': opened once - ' + JSON.stringify(st));
                assert.equal(st.picker, false, name + ': no picker - ' + JSON.stringify(st));
                assert.equal(st.hole, 2, name + ': the hole did not move');
            }
        }
        // ▾: "Whose score?" - and a pick opens the sheet for that golfer (Paul, 104).
        assert.ok(pick, 'the ▾ is its own tap area');
        await ev(RESET);
        await tapAt(j, ...mid(pick));
        let st = JSON.parse(await ev(STATE));
        assert.equal(st.picker, true, '▾ opens the picker: ' + JSON.stringify(st));
        assert.equal(st.sheet, null, '▾: no sheet yet');
        await shot(j, '034-picker');
        const pb = JSON.parse(await ev("JSON.stringify((function(){ var b=document.querySelector('#gps-overlay .gps-who-sheet [data-who-id=\"104\"]').getBoundingClientRect(); return [b.left+b.width/2, b.top+b.height/2]; })())"));
        await tapAt(j, pb[0], pb[1]);
        st = JSON.parse(await ev(STATE));
        assert.equal(st.picker, false, 'the picker closed');
        assert.equal(st.sheet, '104', 'the pick opened the sheet on Paul: ' + JSON.stringify(st));
        assert.equal(st.opens, 1, 'once');
        await shot(j, '034-picked-sheet');
        // Manny again from ▾ (the loop's exact steps): the sheet opens on Manny.
        await ev(RESET);
        await tapAt(j, ...mid(JSON.parse(await ev("JSON.stringify((function(){ var b=document.querySelector('#gps-overlay .gps-who-pick').getBoundingClientRect(); return {x:b.left,y:b.top,w:b.width,h:b.height}; })())"))));
        const mb = JSON.parse(await ev("JSON.stringify((function(){ var b=document.querySelector('#gps-overlay .gps-who-sheet [data-who-id=\"103\"]').getBoundingClientRect(); return [b.left+b.width/2, b.top+b.height/2]; })())"));
        await tapAt(j, mb[0], mb[1]);
        st = JSON.parse(await ev(STATE));
        assert.equal(st.sheet, '103', 'picker → Manny opens the sheet on Manny: ' + JSON.stringify(st));
        // ‹ › only when tapped directly: they move the hole, never open the sheet.
        await ev(RESET);
        await tapAt(j, ...mid(R['.gps-score-next']));
        st = JSON.parse(await ev(STATE));
        assert.equal(st.hole, 3, '› moved to hole 3'); assert.equal(st.sheet, null, '›: no sheet'); assert.equal(st.picker, false, '›: no picker');
        await tapAt(j, ...mid(R['.gps-score-prev']));
        st = JSON.parse(await ev(STATE));
        assert.equal(st.hole, 2, '‹ back to hole 2'); assert.equal(st.sheet, null, '‹: no sheet');
    } finally { await j.close(); }
});

test('URGENT-034 bug 2: the phone\'s own golfer enters every stat with no jump; others still jump; nothing is lost moving between golfers', { timeout: 150000 }, async () => {
    const { j, ev, click } = await start('PS3402', 0, { me: '103', round: round034('PS3402') });
    try {
        await ev('gpsStepHole(1)'); await sleep(900);
        await click('#gps-overlay .gps-score');
        let s = JSON.parse(await ev(SHEET));
        assert.equal(s.sel, '103', 'the sheet opens on Manny');
        assert.equal(s.stats, true, 'Manny\'s stats rows show');
        const lbl = () => ev("document.querySelector('#hp-score-sheet [data-ss-save]').textContent");
        await click('#hp-score-sheet [data-ss-score="4"]');
        await click('#hp-score-sheet [data-ss-k="putts"][data-ss-v="2"]');
        const rows = [['fw', 'L'], ['gd', 'short'], ['bunker', '1'], ['pen', '1']];
        for (const [k, v] of rows) {
            const has = await ev("!!document.querySelector('#hp-score-sheet [data-ss-k=\"" + k + "\"][data-ss-v=\"" + v + "\"]')");
            if (!has) continue;   // a par 3 asks no Tee shot
            await click('#hp-score-sheet [data-ss-k="' + k + '"][data-ss-v="' + v + '"]');
            s = JSON.parse(await ev(SHEET));
            assert.equal(s.sel, '103', 'still on Manny after ' + k);
        }
        const ON = "JSON.stringify(Array.prototype.map.call(document.querySelectorAll('#hp-score-sheet .hp-ss-b.on'), function(b){ return (b.getAttribute('data-ss-k')||'score') + '=' + (b.getAttribute('data-ss-v')||b.getAttribute('data-ss-score')); }).sort())";
        const mine = JSON.parse(await ev(ON));
        assert.ok(mine.includes('score=4') && mine.includes('putts=2') && mine.includes('bunker=1') && mine.includes('pen=1') && mine.includes('gd=short'), 'every stat in: ' + mine);
        await shot(j, '034-own-all-stats');
        assert.equal(await lbl(), 'Next: Paul ›', 'the button says where it goes');
        await click('#hp-score-sheet [data-ss-save]');
        s = JSON.parse(await ev(SHEET));
        assert.equal(s.sel, '104', 'Next: on Paul');
        assert.equal(await lbl(), 'Next: Skeens ›', 'Paul not scored yet, Skeens neither: the button says Skeens');
        await click('#hp-score-sheet [data-ss-score="5"]');
        s = JSON.parse(await ev(SHEET));
        assert.equal(s.sel, '101', 'another golfer still jumps (to Skeens, the next with no score)');
        // Back to Manny: everything he entered is still there.
        await click('#hp-score-sheet [data-ss-golfer="103"]');
        assert.deepEqual(JSON.parse(await ev(ON)), mine, 'Manny\'s score and stats survived the switch');
        await click('#hp-score-sheet [data-ss-golfer="101"]');
        await click('#hp-score-sheet [data-ss-score="6"]');
        s = JSON.parse(await ev(SHEET));
        assert.equal(s.sel, '102', 'Skeens scored: on to Bob');
        assert.equal(await lbl(), 'Save · Next hole ›', 'Bob is the last one with no score: Save');
        await click('#hp-score-sheet [data-ss-score="3"]');
        s = JSON.parse(await ev(SHEET));
        assert.equal(s.sel, '102', 'everyone scored: the sheet stays');
        assert.equal(await lbl(), 'Save · Next hole ›', 'everyone scored: Save · Next hole ›');
        await click('#hp-score-sheet [data-ss-save]');
        await sleep(700);
        assert.equal(await ev("['101','102','103','104'].map(function(p){ return (currentData.scores||{})['p'+p+'_h2']; }).join('/')"), '6/3/4/5', 'all four saved');
    } finally { await j.close(); }
});

test('URGENT-034 bug 3: every score tap saves at once - 3 golfers scored, the sheet closed any way, the Card and the Thru chip show them', { timeout: 180000 }, async () => {
    const { j, ev, click } = await start('PS3403', 0, { me: '103', round: round034('PS3403') });
    try {
        await j.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        const sc = (h) => ev("JSON.stringify(['101','102','103','104'].map(function(p){ var v = (currentData.scores||{})['p'+p+'_h" + h + "']; return v == null ? '' : String(v); }))");
        // Manny's hole 1: Skeens 5, Bob 5, Manny 4 + 2 putts - each saved the moment it is tapped.
        const enter = async (h) => {
            assert.equal(await ev('HardPanGps.hole()'), h, 'on hole ' + h);
            await click('#gps-overlay .gps-score');
            await click('#hp-score-sheet [data-ss-score="4"]');
            assert.equal(JSON.parse(await sc(h))[2], '4', 'Manny\'s 4 saved at the tap, before any Save');
            await click('#hp-score-sheet [data-ss-k="putts"][data-ss-v="2"]');
            await click('#hp-score-sheet [data-ss-golfer="101"]');
            await click('#hp-score-sheet [data-ss-score="5"]');
            await click('#hp-score-sheet [data-ss-score="5"]');   // the sheet jumped to Bob
            assert.deepEqual(JSON.parse(await sc(h)), ['5', '5', '4', ''], 'hole ' + h + ': all three saved with the sheet still open');
        };
        const closed = async (how) => assert.equal(await ev("(function(){ var w=document.getElementById('hp-score-sheet'); return !w || w.style.display==='none'; })()"), true, how + ' closed the sheet');
        // 1. The backdrop (a tap on the map above the sheet).
        await enter(1);
        await tapAt(j, 200, 30);
        await closed('the backdrop');
        // 2. A swipe down on the handle.
        await ev('gpsStepHole(1)'); await sleep(700);
        await enter(2);
        const hd = JSON.parse(await ev("JSON.stringify((function(){ var b=document.querySelector('#hp-score-sheet .hp-ss-handle').getBoundingClientRect(); return [b.left+b.width/2, b.top+b.height/2]; })())"));
        await j.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: hd[0], y: hd[1] }] });
        for (let k = 1; k <= 6; k++) { await j.cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: hd[0], y: hd[1] + k * 30 }] }); await sleep(20); }
        await j.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await sleep(400);
        await closed('the swipe');
        // 3. The hole changed under the sheet (the card's own Next).
        await ev('gpsStepHole(1)'); await sleep(700);
        await enter(3);
        await ev('gpsStepHole(1)'); await sleep(700);
        await closed('the hole change');
        for (const h of [1, 2, 3]) assert.deepEqual(JSON.parse(await sc(h)), ['5', '5', '4', ''], 'hole ' + h + ' kept');
        // The map's chip counts them; the Card (the grid) shows them.
        const chip = await ev("(document.querySelector('#gps-overlay .gps-lc-score')||{}).textContent||''");
        assert.match(chip, /Thru 3/, 'the Thru chip: ' + chip);
        await shot(j, '034-bug3-thru');
        // The Card (URGENT-034 fix 4: the compact card over the map) shows them.
        await click('#gps-overlay .gps-side-bets');
        await sleep(700);
        const boxes = JSON.parse(await ev("JSON.stringify([1,2,3].map(function(h){ return ['101','102','103','104'].map(function(p){ var i = document.querySelector('#hp-compact-card [data-cc-hole=\"'+h+'\"][data-cc-player=\"'+p+'\"]'); return i ? i.textContent : null; }); }))"));
        assert.deepEqual(boxes, [['5', '5', '4', ''], ['5', '5', '4', ''], ['5', '5', '4', '']], 'the Card shows holes 1-3');
        // 092 (the COMBO card): Out is a column now - one cell per golfer.
        assert.deepEqual(JSON.parse(await ev("JSON.stringify(Array.prototype.map.call(document.querySelectorAll('#hp-compact-card [data-cc-sum=\"Out\"][data-cc-sum-player]'), function(t){ return t.textContent; }))")), ['15', '15', '12', ''], 'Out: the three holes summed');
        await shot(j, '034-bug3-card');
        // ... and the full page behind "Full card ›" too.
        await click('#hp-compact-card [data-cc-full]');
        await sleep(600);
        const full = JSON.parse(await ev("JSON.stringify([1,2,3].map(function(h){ return ['101','102','103','104'].map(function(p){ var i = document.querySelector('#full-card-container .score-input[data-hole=\"'+h+'\"][data-player-id=\"'+p+'\"]'); return i ? i.value : null; }); }))"));
        assert.deepEqual(full, [['5', '5', '4', ''], ['5', '5', '4', ''], ['5', '5', '4', '']], 'the full card shows holes 1-3');
    } finally { await j.close(); }
});

// 092 (the COMBO card, Manny APPROVED Oct 27): the sheet sizes itself to its content (52 px under the top), the
// golfers are rows (1-9 + OUT, 10-18 + IN + TOT), and a box loads that golfer and hole into quick entry - the
// full Enter score sheet for them is "More ›". Everything else here is as URGENT-034 had it.
test('URGENT-034 fix 4 + 092: the map\'s Card is the COMBO card; a box loads quick entry, More › opens the sheet for that golfer and hole; Full card ›; swipe / map tap close it', { timeout: 150000 }, async () => {
    const { j, ev, click } = await start('PS3404', 0, { me: '103', round: round034('PS3404') });
    try {
        await j.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        await ev('gpsStepHole(1)'); await sleep(800);
        const CC = "JSON.stringify((function(){ var w=document.getElementById('hp-compact-card'), c=w&&w.querySelector('.hp-cc'); var open = !!(w && w.parentNode && w.style.display!=='none'); return { open: open, side: HardPanGps.side(), h: c ? Math.round(c.getBoundingClientRect().height) : 0, top: c ? Math.round(c.getBoundingClientRect().top) : 0, vh: innerHeight, head: open ? Array.prototype.map.call(w.querySelectorAll('table[data-cc-half=\"Out\"] [data-cc-golfer]'), function(t){return t.textContent;}) : [], sums: open ? Array.prototype.map.call(w.querySelectorAll('tr.hp-cc-par [data-cc-sum]'), function(r){return r.getAttribute('data-cc-sum');}) : [], text: open ? w.textContent : '', sel: open && w.querySelector('tr.hp-cc-sel') ? w.querySelector('tr.hp-cc-sel').getAttribute('data-cc-row') : null, qhole: open && w.querySelector('[data-cc-qhole]') ? Number(w.querySelector('[data-cc-qhole]').getAttribute('data-cc-qhole')) : null }; })())";
        // The default state: nothing scored, the Card tapped on hole 2.
        await tapAt(j, ...JSON.parse(await ev("JSON.stringify((function(){ var b=document.querySelector('#gps-overlay .gps-side-bets').getBoundingClientRect(); return [b.left+b.width/2, b.top+b.height/2]; })())")));
        let c = JSON.parse(await ev(CC));
        assert.equal(c.open, true, 'Card opens the compact card');
        assert.equal(c.side, 'gps', 'over the map');
        assert.ok(c.h > c.vh * 0.4 && c.top >= 52, '092: sized to its content, 52 px under the top: ' + c.h + ' of ' + c.vh + ', top ' + c.top);
        assert.deepEqual(c.head, ['Skeens', 'Bob', 'Manny', 'Paul'], '092: one row per golfer');
        assert.deepEqual(c.sums, ['Out', 'In', 'Total'], 'front / back totals');
        assert.doesNotMatch(c.text, /LEADERBOARD|Skins|SKINS/i, 'no leaderboard, no skins');
        await shot(j, '034-compact-card');
        // A box on an EARLIER hole (1, Manny): 092 - Manny, hole 1 in quick entry (the map stays on 2); More › is
        // the score sheet on Manny, hole 1; the tap saves at once.
        await tapAt(j, ...JSON.parse(await ev("JSON.stringify((function(){ var b=document.querySelector('#hp-compact-card [data-cc-hole=\"1\"][data-cc-player=\"103\"]'); b.scrollIntoView({block:'center'}); b=b.getBoundingClientRect(); return [b.left+b.width/2, b.top+b.height/2]; })())")));
        c = JSON.parse(await ev(CC));
        assert.deepEqual([c.sel, c.qhole], ['103', 1], '092: the box loaded Manny, hole 1 into quick entry');
        assert.equal(JSON.parse(await ev(SHEET)).open, false, '092: a box no longer opens the sheet by itself');
        await click('#hp-compact-card [data-cc-moresheet]');
        let s = JSON.parse(await ev(SHEET));
        assert.equal(s.open, true, 'More › opened the score sheet');
        assert.equal(s.sel, '103', 'on Manny');
        assert.equal(await ev('HardPanGpsStats.sheet.shownHole()'), 1, 'on hole 1');
        assert.equal(await ev('HardPanGps.hole()'), 2, 'the map stays on hole 2');
        await shot(j, '034-compact-box-sheet');
        await click('#hp-score-sheet [data-ss-score="4"]');
        assert.equal(await ev("String((currentData.scores||{}).p103_h1)"), '4', 'saved at the tap');
        await tapAt(j, 200, 30);   // the backdrop closes the score sheet; the compact card is still there
        await sleep(600);
        assert.equal(JSON.parse(await ev(SHEET)).open, false, 'the score sheet closed');
        c = JSON.parse(await ev(CC));
        assert.equal(c.open, true, 'back on the compact card');
        assert.equal(await ev("document.querySelector('#hp-compact-card [data-cc-hole=\"1\"][data-cc-player=\"103\"]').textContent"), '4', 'the box shows the new 4');
        // The map's hole box (2, Bob): quick entry on Bob, hole 2; More › - the sheet on Bob, hole 2.
        await click('#hp-compact-card [data-cc-hole="2"][data-cc-player="102"]');
        c = JSON.parse(await ev(CC));
        assert.deepEqual([c.sel, c.qhole], ['102', 2], '092: Bob, hole 2 in quick entry');
        await click('#hp-compact-card [data-cc-moresheet]');
        s = JSON.parse(await ev(SHEET));
        assert.equal(s.sel, '102', 'on Bob'); assert.equal(await ev('HardPanGpsStats.sheet.shownHole()'), 2, 'hole 2');
        await ev('HardPanGpsStats.sheet.close()'); await sleep(300);
        // A swipe down closes it - back to GPS.
        const hd = JSON.parse(await ev("JSON.stringify((function(){ var b=document.querySelector('#hp-compact-card .hp-cc-handle').getBoundingClientRect(); return [b.left+b.width/2, b.top+b.height/2]; })())"));
        await j.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: hd[0], y: hd[1] }] });
        for (let k = 1; k <= 6; k++) { await j.cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: hd[0], y: hd[1] + k * 30 }] }); await sleep(20); }
        await j.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await sleep(400);
        c = JSON.parse(await ev(CC));
        assert.deepEqual([c.open, c.side], [false, 'gps'], 'the swipe closed it, on GPS');
        // A map tap closes it too.
        await click('#gps-overlay .gps-side-bets');
        assert.equal(JSON.parse(await ev(CC)).open, true, 'open again');
        await tapAt(j, 200, 120);
        c = JSON.parse(await ev(CC));
        assert.deepEqual([c.open, c.side], [false, 'gps'], 'a map tap closed it, on GPS');
        // "Full card ›": today's full page, unchanged.
        await click('#gps-overlay .gps-side-bets');
        await click('#hp-compact-card [data-cc-full]');
        await sleep(600);
        assert.deepEqual(JSON.parse(await ev("JSON.stringify([HardPanGps.side(), currentViewMode, HardPanRound.compactCardOpen()])")), ['bets', 'full', false], 'Full card › is the full page');
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
        if (JSON.parse(await ev(SHEET)).stats) await click('#hp-score-sheet [data-ss-k="putts"][data-ss-v="2"]');
        // URGENT-034: the phone's own golfer stays - "Next: Test Bravo ›" moves on.
        await click('#hp-score-sheet [data-ss-save]');
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
        if (JSON.parse(await ev(SHEET)).stats) await click('#hp-score-sheet [data-ss-k="putts"][data-ss-v="2"]');
        // URGENT-034: the phone's own golfer stays - "Next: Test Bravo ›" moves on.
        await click('#hp-score-sheet [data-ss-save]');
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
