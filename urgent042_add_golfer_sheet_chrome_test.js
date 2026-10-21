// ============================================================================
// URGENT-042 - "+ ADD" ON THE SCORE SHEET, IN REAL CHROME (iPhone 15 size, phone GPS mode, simple
// flow). Stub db only, synthetic rounds.
//
//   1  A solo round on hole 4 (holes 1-3 scored): the golfer chips end in "+ Add golfer". Tapped:
//      URGENT-044's SHORT form of the Add golfer sheet - Name, HCP, Tee, "Add from hole 4", one
//      button "Add <name> · from hole 4", Cancel; nothing else (no "+ Add another", My golfers,
//      Paste several, plus key or group chips). Added: back on the score sheet with the new golfer
//      picked and "<name> added — from hole 4. Holes 1–3 blank.", the golfer on the Card, holes
//      1-3 blank for them, and their hole-4 score saves through the card's own save.
//   2  A 4-golfer round: the chip reads "+ Add" at the end of the row; Cancel on the short form
//      brings the score sheet back as it was.
//
// SHOTS=1 saves the screens to ~/Desktop/claude-code-reports/042/build/.
// ============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-round.js')) || !fs.existsSync(path.join(__dirname, 'gps-add-golfer.js'))) { console.log('Consumer tree: no score sheet / Add golfer - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const SHOT_DIR = path.join(os.homedir(), 'Desktop', 'claude-code-reports', '042', 'build');
async function shot(j, name) {
    if (!process.env.SHOTS) return;
    try { fs.mkdirSync(SHOT_DIR, { recursive: true }); await j.shot(path.join(SHOT_DIR, name + '.png')); } catch (e) {}
}
const CD = makeCourseData(18);
const TEE = (name, y, r, sl) => ({ name, rating: r, slope: sl, parTotal: 72, totalYards: y, holes: CD.map((h) => ({ par: h.par, yardage: Math.round(y / 18) })) });
const TEES = { male: [TEE('Blue', 6500, 71.0, 125), TEE('White', 6187, 69.0, 118)], female: [TEE('Red', 5645, 71.4, 120)] };
const round = (code, names, sizes, thru) => {
    const r = wizardSavedRound({ code, golfers: names.length, ownerUid: 'anon-cold', thru, flights: false, names, courseData: CD,
        overrides: { activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', groupSizeOverrides: sizes,
            teeRating: { teeKey: 'male:1', teeName: 'White', slope: 118, courseRating: 69.0, par: 72 }, handicapBasis: 'as-entered' } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed; r.additionalGames = {}; r.additionalGameInstances = {}; r.sideMatches = {};
    r.gameFormat = 'stroke'; r.skinsBuyIn = 0; r.holeBetStake = 0; r.birdieGameEnabled = false;
    if (!thru) r.scores = {};
    return r;
};
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,devPro:true});}});})();";
const GEO = "(function(){ try { Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:function(ok){ var f=function(){ok({coords:{latitude:33.4528,longitude:-79.1547,accuracy:5},timestamp:Date.now()});}; setTimeout(f,50); var t=setInterval(f,1000); return t;}, getCurrentPosition:function(ok){ok({coords:{latitude:33.4528,longitude:-79.1547,accuracy:5},timestamp:Date.now()});}, clearWatch:function(t){clearInterval(t);}}}); } catch(e){} })();";
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function start(code, r) {
    const pre = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO
        + "try{localStorage.setItem('golfapp_me_" + code + "','101');sessionStorage.setItem('groupPickDismissed:" + code + "','1');"
        + "localStorage.setItem('hardpan_round_side','gps|" + code + "');"
        + "localStorage.setItem('golfapp_snap_v1_OLD042',JSON.stringify({at:1,data:{players:[{id:1,name:'Earlier Pal',hcp:'9'}]}}));}catch(e){}";
    const db = { events: { [code]: r }, global_courses: { caledonia: { name: 'Caledonia Golf & Fish Club', data: CD, tees: TEES } }, trips: {}, organizers: {}, tournaments: {} };
    const j = await openJourney({ db, viewport: { width: 393, height: 852 }, webgl: true, preScript: pre });
    await j.goto(fileUrl('index.html', 'game=' + code + '&group=1&me=101'), 300);
    const ev = (x) => j.evaluate(x);
    const until = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 8000)) { if (await ev(expr)) return true; await sleep(150); } return false; };
    await until("!!(window.HardPanGps && HardPanGps.side && HardPanGps.side() === 'gps' && document.querySelector('#gps-overlay .gps-score'))", 12000);
    await sleep(800);
    const click = async (sel) => { assert.ok(await ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.click(); return true;})()'), 'no ' + sel); await sleep(350); };
    const type = async (sel, v) => { assert.ok(await ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.value=' + JSON.stringify(v) + '; e.dispatchEvent(new Event("input",{bubbles:true})); return true;})()'), 'no ' + sel); };
    return { j, ev, click, type, until };
}
const SHEET = "JSON.stringify((function(){ var w=document.getElementById('hp-score-sheet'); if(!w||w.style.display==='none') return { open:false }; var on=w.querySelector('.hp-ss-chip.on'), add=w.querySelector('[data-ss-add]'), row=w.querySelector('.hp-ss-chips');"
    + " return { open:true, hole: HardPanGpsStats.sheet.shownHole(), sel: on ? on.getAttribute('data-ss-golfer') : null, chips: Array.prototype.map.call(w.querySelectorAll('.hp-ss-chip'), function(c){return c.textContent;}),"
    + " add: add ? add.textContent : null, addLast: !!(add && row && row.lastElementChild === add), save: w.querySelector('[data-ss-save]').textContent }; })())";

test('URGENT-042 solo round: "+ Add golfer" -> Name, HCP, Tee, "Add from hole 4" -> back with the new golfer picked; on the Card; holes 1-3 blank', { timeout: 120000 }, async () => {
    const CODE = 'AG0421';
    const { j, ev, click, type, until } = await start(CODE, round(CODE, ['Manny Test'], { 0: 1 }, 3));
    try {
        await ev('HardPanGps.goToHole ? HardPanGps.goToHole(4) : 0');
        await sleep(700);
        await click('#gps-overlay .gps-score');
        let s = JSON.parse(await ev(SHEET));
        assert.equal(s.open, true, 'Enter score opened the sheet (one tap)');
        assert.equal(s.hole, 4);
        assert.equal(s.chips.length, 1, 'one golfer chip: ' + JSON.stringify(s));
        assert.equal(s.add, '+ Add golfer', 'solo round wording, next to your name');
        assert.equal(s.addLast, true, 'the chip ends the golfer row');
        await shot(j, 'short-1-solo-sheet');
        await click('#hp-score-sheet [data-ss-add]');
        assert.ok(await until("!!document.querySelector('#hp-addg.open.ag-short')", 4000), 'the SHORT Add golfer form opened');
        assert.equal(JSON.parse(await ev(SHEET)).open, true, 'the score sheet stays behind the form');
        assert.ok(await until("document.querySelectorAll('#hp-addg .ag-tees [data-ag-tee]').length === 3", 5000), 'the tees: the round\'s three');
        await sleep(600);   // My golfers would have loaded by now, if drawn at all
        const F = "JSON.stringify((function(){ var e=document.getElementById('hp-addg');"
            + " return { text: e.innerText, heads: Array.prototype.map.call(e.querySelectorAll('.ag-h'), function(h){return h.textContent;}),"
            + " inputs: Array.prototype.map.call(e.querySelectorAll('input,textarea'), function(i){return i.id;}),"
            + " buttons: Array.prototype.map.call(e.querySelectorAll('button'), function(b){return b.getAttribute('data-ag') || (b.hasAttribute('data-ag-tee') ? 'tee:' + b.textContent : b.className);}),"
            + " cta: (e.querySelector('[data-ag=\"save\"]')||{}).textContent, ctaOff: !!(e.querySelector('[data-ag=\"save\"]')||{}).disabled,"
            + " holes: Array.prototype.map.call(e.querySelectorAll('.ag-holes span'), function(x){return x.className + ':' + x.textContent;}) }; })())";
        let f = JSON.parse(await ev(F));
        assert.deepEqual(f.heads, ['NAME', 'HCP', 'TEE'], 'Name, HCP, Tee - and no other section: ' + JSON.stringify(f));
        assert.deepEqual(f.inputs, ['ag-name', 'ag-hcp'], 'two fields, no paste box');
        assert.deepEqual(f.buttons, ['close', 'tee:Blue', 'tee:White', 'tee:Red', 'save'], 'Cancel, the tees, one button - nothing else: ' + JSON.stringify(f.buttons));
        assert.match(f.text, /Add from hole 4/, 'Add from hole N, N = the current hole');
        assert.match(f.text, /Holes 1\u20133 stay blank/, 'the holes before it stay blank');
        assert.match(f.text, /Joins this group · Caledonia Golf & Fish Club/);
        assert.doesNotMatch(f.text, /Add another|MY GOLFERS|Earlier Pal|Paste several|GROUP/, 'none of the full sheet\'s extras');
        assert.equal(await ev("!!document.querySelector('#hp-addg .ag-plus, #hp-addg [data-ag-chip], #hp-addg [data-ag-group], #hp-addg [data-ag=\"another\"], #hp-addg [data-ag=\"paste\"]')"), false);
        assert.equal(f.cta, 'Add golfer · from hole 4'); assert.equal(f.ctaOff, true, 'no name yet: the button waits');
        assert.deepEqual(f.holes, [':\u20131', ':\u20132', ':\u20133', 'now:4now', 'later:·5', 'later:·6', 'later:·7'], 'the hole strip: 1-3 blank, 4 now');
        assert.equal(await ev("document.querySelector('#hp-addg .ag-tees .on').textContent"), 'White', 'the round\'s tee picked');
        await type('#ag-name', 'Tim Test');
        await type('#ag-hcp', '8');
        await click('#hp-addg [data-ag-tee="male:0"]');
        f = JSON.parse(await ev(F));
        assert.equal(f.cta, 'Add Tim Test · from hole 4', 'the one button names them and the hole');
        assert.equal(f.ctaOff, false);
        assert.match(f.text, /Holes 1\u20133 stay blank for Tim Test/);
        await shot(j, 'short-2-add-form');
        const before = await ev('currentData.players.length');
        await click('#hp-addg [data-ag="save"]');
        assert.ok(await until("!document.querySelector('#hp-addg.open') && currentData.players.length === " + (before + 1), 8000), 'added through the Add golfer save');
        assert.ok(await until("(function(){ var w=document.getElementById('hp-score-sheet'); var on=w&&w.style.display!=='none'&&w.querySelector('.hp-ss-chip.on'); return !!(on && on.getAttribute('data-ss-golfer') !== '101'); })()", 8000), 'back on the score sheet with the new golfer picked');
        const tim = JSON.parse(await ev("JSON.stringify(currentData.players.filter(function(p){return p.name==='Tim Test';})[0])"));
        assert.ok(tim, 'Tim is in the round');
        assert.equal(tim.hcp, '8');
        assert.equal(tim.tee && tim.tee.teeName, 'Blue', 'their own tee');
        s = JSON.parse(await ev(SHEET));
        assert.equal(s.sel, String(tim.id), 'the new golfer is selected: ' + JSON.stringify(s));
        assert.equal(s.hole, 4, 'the same hole');
        assert.equal(s.chips.length, 2);
        assert.equal(s.add, '+ Add', 'two golfers: the short wording');
        assert.equal(s.addLast, true);
        const chipName = await ev("document.querySelector('#hp-score-sheet .hp-ss-chip.on').textContent");
        assert.match(chipName, /^Tim/, 'the new golfer\'s chip (the sheet\'s own short label)');
        assert.equal(await ev("document.querySelector('#hp-score-sheet .hp-ss-earlier').textContent"), chipName + ' added \u2014 from hole 4. Holes 1\u20133 blank.', 'the added line, named as the chip');
        assert.equal(await ev("!!document.querySelector('#hp-score-sheet .hp-ss-chip.on.hp-ss-new')"), true, 'the new golfer\'s chip, picked');
        if (process.env.SHOTS) await sleep(4000);   // the "Added Tim Test" toast gone, for the picture
        await shot(j, 'short-3-back-new-golfer-selected');
        // On the Card: their box on this hole; no score on the holes before it.
        assert.ok(await ev("!!document.querySelector('.score-input[data-player-id=\"" + tim.id + "\"][data-hole=\"4\"]')"), 'Tim has a box on the Card for hole 4');
        const early = await ev("JSON.stringify([1,2,3].map(function(h){ return (currentData.scores||{})['p" + tim.id + "_h'+h]; }))");
        assert.deepEqual(JSON.parse(early), [null, null, null], 'holes 1-3 blank for Tim: ' + early);
        assert.equal(await ev("[1,2,3].every(function(h){ return Number((currentData.scores||{})['p101_h'+h]) > 0; })"), true, 'Manny\'s earlier scores untouched');
        // Every tap saves - Tim's hole 4.
        await click('#hp-score-sheet [data-ss-score="5"]');
        assert.ok(await until("Number((currentData.scores||{}).p" + tim.id + "_h4) === 5", 5000), 'Tim\'s hole-4 score saved at the tap');
        assert.equal(await ev("JSON.stringify([1,2,3].map(function(h){ return (currentData.scores||{})['p" + tim.id + "_h'+h] == null; }))"), '[true,true,true]', 'still blank before hole 4');
        // The Card itself (the page under the map) carries Tim.
        await ev("HardPanGps.showSide('bets')");
        await sleep(600);
        assert.match(await ev("document.body.innerText"), /Tim/, 'Tim on the Card');
        await shot(j, 'short-4-card-with-new-golfer');
    } finally { await j.close(); }
});

test('URGENT-042 four golfers: "+ Add" at the end of the row; closing the form brings the sheet back unchanged', { timeout: 120000 }, async () => {
    const CODE = 'AG0424';
    const { j, ev, click, until } = await start(CODE, round(CODE, ['Skeens Test', 'Bob Test', 'Manny Test', 'Paul Test'], { 0: 4 }, 0));
    try {
        await click('#gps-overlay .gps-score');
        let s = JSON.parse(await ev(SHEET));
        assert.equal(s.open, true);
        assert.equal(s.chips.length, 4);
        assert.equal(s.add, '+ Add');
        assert.equal(s.addLast, true);
        await shot(j, 'short-5-four-golfers-sheet');
        // URGENT-034 kept: own golfer stays after a score; the button says where it goes.
        await click('#hp-score-sheet [data-ss-score="4"]');
        s = JSON.parse(await ev(SHEET));
        assert.equal(s.sel, '101', 'own golfer never auto-advances');
        assert.match(s.save, /^Next: .+ ›$/, 'Next: X ›');
        await click('#hp-score-sheet [data-ss-add]');
        assert.ok(await until("!!document.querySelector('#hp-addg.open.ag-short')", 4000));
        const t2 = await ev("document.getElementById('hp-addg').innerText");
        assert.match(t2, /Add from hole 1/);
        assert.match(t2, /Their card starts here/, 'hole 1: no holes to leave blank');
        assert.equal(await ev("document.querySelector('#hp-addg [data-ag=\"save\"]').textContent"), 'Add golfer · from hole 1');
        await shot(j, 'short-6-four-golfers-form');
        await click('#hp-addg .ag-cancel');
        assert.ok(await until("(function(){ var w=document.getElementById('hp-score-sheet'); return !!(w && w.style.display !== 'none'); })()", 4000), 'the score sheet is back');
        s = JSON.parse(await ev(SHEET));
        assert.equal(s.sel, '101', 'the same golfer');
        assert.equal(s.chips.length, 4, 'no golfer added');
        assert.equal(await ev('currentData.players.length'), 4);
        assert.equal(await ev("Number((currentData.scores||{}).p101_h1)"), 4, 'the score typed before is saved');
        assert.equal(await ev("document.querySelector('#hp-score-sheet .hp-ss-earlier').textContent"), '', 'no "added" line when nobody was added');
    } finally { await j.close(); }
});
