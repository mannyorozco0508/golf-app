// ============================================================================
// URGENT-021 (ADDED 8:43 AM) - EVERY ROUND START LANDS ON THE GPS MAP, NOT THE CARD
// (features.simpleFlow), IN REAL CHROME, iPhone 15 size. Stub db only.
//
// Manny: after Start Round the card sheet ("Hole 1 · Manny · putts/FW · Just scores, no money")
// covered the map on hole 1 before the hole was played.
//   1  Start Round / Resume / Change course (the round left on GPS: hardpan_round_side gps|CODE):
//      the map at once - from the first moment the round is up, never the card in between.
//   2  a join by link / Same as last week (no side kept) on a course with GPS: the map.
//   3  ... even on a phone that used the Games door before (simple flow: every start is the map).
//   4  the golfer left the round on the card (bets|CODE): the card, as they left it.
//   5  a course with no GPS data at all: the card ("Just scores"), with the note.
//   6  Enter score opens the score sheet over the map; Save closes it back to the map.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-round.js'))) { console.log('Consumer tree: no simple-flow round - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const round = (code, key, name) => {
    const r = wizardSavedRound({ code, golfers: 1, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Manny'],
        overrides: { activeCourseKey: key, courseName: name, groupSizeOverrides: { 0: 1 } } });
    delete r.moneyPool; r.additionalGames = {}; r.additionalGameInstances = {}; r.sideMatches = {}; r.scores = {};
    return r;
};
// The course's GPS from the app's bundled OpenStreetMap greens (as the GPS checks run it).
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,devPro:true});}});})();";   // devPro: as Manny's Cmd+R build (GPS_DEV_PRO=1)
// The golfer on the course, a fix every second.
const GEO = "(function(){ try { Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:function(ok){ var f=function(){ok({coords:{latitude:33.4528,longitude:-79.1547,accuracy:5},timestamp:Date.now()});}; setTimeout(f,50); var t=setInterval(f,1000); return t;}, getCurrentPosition:function(ok){ok({coords:{latitude:33.4528,longitude:-79.1547,accuracy:5},timestamp:Date.now()});}, clearWatch:function(t){clearInterval(t);}}}); } catch(e){} })();";
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const VIS = "function vis(e){ if(!e) return false; var r=e.getBoundingClientRect(); if(!(r.width>0&&r.height>0)) return false; for(var x=e;x&&x!==document.documentElement;x=x.parentElement){var c=getComputedStyle(x); if(c.display==='none'||c.visibility==='hidden') return false;} return true; }";
const STATE = '(function(){' + VIS + ' var ss=document.getElementById("hp-score-sheet"); return JSON.stringify({ side: window.HardPanGps && HardPanGps.side ? HardPanGps.side() : null, hole: window.HardPanGps && HardPanGps.hole ? HardPanGps.hole() : null,'
    + ' map: vis(document.getElementById("gps-overlay")), cardSheet: document.body.classList.contains("hp-card-sheet"), scoreSheet: vis(ss), note: ((document.querySelector(".gps-side-note")||{}).textContent||"") }); })()';

// Opens the round; samples the side every 250 ms for `ms`. Returns { j, seen: [...sides], last }.
async function start({ code, key = 'caledonia', name = 'Caledonia Golf & Fish Club', side, door, ms = 6000 }) {
    const pre = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO
        + "try{localStorage.setItem('golfapp_me_" + code + "','101');sessionStorage.setItem('groupPickDismissed:" + code + "','1');"
        + (side ? "localStorage.setItem('hardpan_round_side','" + side + "|" + code + "');" : '')
        + (door ? "localStorage.setItem('hardpan_front_door','" + door + "');" : '') + '}catch(e){}';
    const j = await openJourney({ db: { events: { [code]: round(code, key, name) }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} }, viewport: { width: 393, height: 852 }, webgl: true, preScript: pre });
    await j.goto(fileUrl('index.html', 'game=' + code + '&group=1&me=101'), 300);
    const seen = [], t0 = Date.now();
    let firstGps = null;
    while (Date.now() - t0 < ms) {
        let s = null; try { s = JSON.parse(await j.evaluate(STATE)); } catch (e) {}
        if (s && s.side) { seen.push(s.side + (s.cardSheet ? '+cardSheet' : '')); if (s.side === 'gps' && firstGps == null) firstGps = Date.now() - t0; }
        await sleep(250);
    }
    return { j, seen, firstGps, last: JSON.parse(await j.evaluate(STATE)) };
}

test('Start Round / Resume (left on GPS): the map at once - never the card sheet first', { timeout: 90000 }, async () => {
    const { j, seen, firstGps, last } = await start({ code: 'MF0001', side: 'gps' });
    try {
        assert.equal(last.side, 'gps');
        assert.equal(last.map, true, 'the map is on screen');
        assert.equal(last.cardSheet, false, 'no card sheet');
        assert.equal(last.scoreSheet, false, 'no score sheet');
        assert.equal(last.hole, 1);
        // From the first moment the round is up, it is the map - the card (sheet or not) never shows.
        assert.equal(seen[0], 'gps', 'the first thing on screen is the map: ' + seen.join(' '));
        assert.ok(seen.every((x) => x === 'gps'), 'never the card in between: ' + seen.join(' '));
    } finally { await j.close(); }
});

test('a join / Same as last week (no side kept), course with GPS: the map', { timeout: 90000 }, async () => {
    const { j, seen, last } = await start({ code: 'MF0002', ms: 9000 });
    try {
        assert.equal(last.side, 'gps', seen.join(' '));
        assert.equal(last.cardSheet, false);
        assert.equal(last.scoreSheet, false);
    } finally { await j.close(); }
});

test('a phone that used the Games door before: still the map (simple flow)', { timeout: 90000 }, async () => {
    const { j, seen, last } = await start({ code: 'MF0003', door: 'games', ms: 9000 });
    try { assert.equal(last.side, 'gps', seen.join(' ')); assert.equal(last.cardSheet, false); } finally { await j.close(); }
});

test('left on the card (bets): the card, as the golfer left it', { timeout: 90000 }, async () => {
    const { j, last } = await start({ code: 'MF0004', side: 'bets', ms: 5000 });
    try { assert.equal(last.side, 'bets'); } finally { await j.close(); }
});

test('a course with no GPS data at all: the card ("Just scores") with the note', { timeout: 90000 }, async () => {
    const { j, seen, last } = await start({ code: 'MF0005', key: 'zz_nodata_course', name: 'Nowhere Links', side: 'gps', ms: 12000 });
    try {
        assert.equal(last.side, 'bets', seen.join(' '));
        assert.match(last.note, /No GPS map for this course yet/);
    } finally { await j.close(); }
});

test('Enter score opens the score sheet over the map; Save closes it back to the map', { timeout: 90000 }, async () => {
    const { j, last } = await start({ code: 'MF0006', side: 'gps', ms: 3000 });
    const ev = (x) => j.evaluate(x);
    const click = async (sel) => { assert.ok(await ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.click(); return true;})()'), 'no ' + sel); await sleep(400); };
    try {
        assert.equal(last.side, 'gps');
        await click('#gps-overlay .gps-score');
        let s = JSON.parse(await ev(STATE));
        assert.equal(s.scoreSheet, true, 'Enter score opened the score sheet');
        await click('#hp-score-sheet [data-ss-score="4"]');
        await click('#hp-score-sheet [data-ss-save]');
        await sleep(800);
        s = JSON.parse(await ev(STATE));
        assert.equal(s.scoreSheet, false, 'Save closed the sheet');
        assert.equal(s.side, 'gps', 'back on the map');
        assert.equal(s.cardSheet, false);
        assert.equal(await ev("String((currentData.scores||{}).p101_h1)"), '4', 'the score saved');
    } finally { await j.close(); }
});
