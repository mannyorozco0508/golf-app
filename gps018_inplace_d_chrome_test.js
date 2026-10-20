// ============================================================================
// URGENT-018 (helper D) - QUICK EDITS IN PLACE: AN EARLIER HOLE'S SCORE, THE TOOLS SHEET, SHARE
// (features.simpleFlow), IN REAL CHROME, iPhone 15 size. Stub db only.
//
// A 4-golfer round with a Nassau, thru 5, this phone the organizer (Manny, 101), on hole 6.
//   1  GPS, hole 6 -> Enter score -> ‹ ‹ ‹ to hole 3 -> 5 -> "Save · back to hole 6": the score
//      is saved through the card's own save; the sheet closes on the MAP, hole 6 - no page
//      load, never the card, never Round Setup.
//   2  Card (sheet over the map), hole 6 -> the bar's Enter score -> the same sheet -> ‹ to hole 2
//      -> save: the card is still on hole 6, the map behind it too.
//   3  Tools: units (yards / meters), layout (HardPan / Bottom panel) and tournament mode change
//      in place - the same page, the same hole, the sheet still there.
//   4  Share: the code, the link and the QR codes over the map,
//      closed -> the map on hole 6. No page load.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-round.js'))) { console.log('Consumer tree: no simple-flow round - skipped.'); process.exit(0); }
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const CODE = 'INPL18';
const r = wizardSavedRound({ code: CODE, golfers: 4, ownerUid: 'anon-cold', thru: 5, flights: false, names: ['Manny Orozco', 'Bob Baker', 'Skeens Hall', 'Paul Park'],
    overrides: { activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', groupSizeOverrides: { 0: 4 } } });
r.sideMatches = { M1: { format: 'nassau', scoring: 'net', teamAIds: ['101'], teamBIds: ['102'], startHole: 1, createdAt: 1, frontStake: 5, backStake: 5, overallStake: 5, pressRule: 'none' } };
const DB = { events: { [CODE]: r }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} };
const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true })
    + "try{localStorage.setItem('golfapp_me_" + CODE + "','101');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}";
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const VIS = "function vis(e){ if(!e) return false; var r=e.getBoundingClientRect(); if(!(r.width>0&&r.height>0)) return false; for(var x=e;x&&x!==document.documentElement;x=x.parentElement){var c=getComputedStyle(x); if(c.display==='none'||c.visibility==='hidden') return false;} return true; }";
const STATE = '(function(){' + VIS + ' var ss=document.getElementById("hp-score-sheet"); return JSON.stringify({ mark: window.__d18 || null, url: location.pathname.split("/").pop() + location.search,'
    + ' side: HardPanGps.side(), map: HardPanGps.hole(), card: currentViewedHole, sheet: vis(ss) ? (ss.querySelector(".hp-ss-title") || {}).textContent : null,'
    + ' save: vis(ss) ? (ss.querySelector("[data-ss-save]") || {}).textContent : null, setup: !!document.querySelector("#sf, .wizard-step") }); })()';

let j;
const ev = async (x) => j.evaluate(x);
const st = async () => JSON.parse(await ev(STATE));
async function click(sel) { assert.ok(await ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.click(); return true;})()'), 'no ' + sel); await sleep(250); }
async function until(expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 6000)) { if (await ev(expr)) return true; await sleep(150); } return false; }

before(async () => {
    j = await openJourney({ db: DB, viewport: { width: 393, height: 852 }, webgl: true, preScript: PRE });
    await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 4500);
    await ev("(function(){ var b=(document.querySelector('#hp-card-bet [data-hp-bar=gps]') || document.getElementById('fd-gps-btn')); if(b) b.click(); return 1; })()");
    assert.ok(await until("window.HardPanGps && HardPanGps.side() === 'gps' && HardPanGps.hole() === 6", 8000), 'on the map, hole 6');
    await ev('window.__d18 = "same-page"; 1');
});
after(async () => { if (j) await j.close(); });

test('GPS: an earlier hole\'s score from the score sheet (‹), saved, back on the map on hole 6', { timeout: 60000 }, async () => {
    await click('#gps-overlay .gps-score');
    let s = await st();
    assert.match(String(s.sheet), /^Hole 6/);
    for (let i = 0; i < 3; i++) await click('#hp-score-sheet [data-ss-step="-1"]');
    s = await st();
    assert.match(String(s.sheet), /^Hole 3/, JSON.stringify(s));
    assert.equal(s.map, 6, 'the map did not move');
    assert.match(s.save, /Save · back to hole 6/);
    await click('#hp-score-sheet [data-ss-golfer="101"]');
    await click('#hp-score-sheet [data-ss-score="5"]');
    await click('#hp-score-sheet [data-ss-save]');
    assert.ok(await until("currentData.scores.p101_h3 === 5 || currentData.scores.p101_h3 === '5'", 5000), 'hole 3 saved');
    s = await st();
    assert.deepEqual([s.mark, s.side, s.map, s.card, s.sheet, s.setup], ['same-page', 'gps', 6, 6, null, false], JSON.stringify(s));
});

test('Card: the bar\'s Enter score is the same sheet; ‹ to hole 2, saved; the card stays on hole 6', { timeout: 60000 }, async () => {
    await ev("HardPanGps.showSide('bets')");
    await sleep(600);
    assert.ok(await until("HardPanGps.side() === 'bets'", 4000));
    await click('#hp-card-bet .hp-bar-score');
    let s = await st();
    assert.match(String(s.sheet), /^Hole 6/, JSON.stringify(s));
    for (let i = 0; i < 4; i++) await click('#hp-score-sheet [data-ss-step="-1"]');
    s = await st();
    assert.match(String(s.sheet), /^Hole 2/);
    await click('#hp-score-sheet [data-ss-golfer="102"]');
    await click('#hp-score-sheet [data-ss-score="6"]');
    await click('#hp-score-sheet [data-ss-save]');
    assert.ok(await until("String(currentData.scores.p102_h2) === '6'", 5000), 'hole 2 saved');
    s = await st();
    assert.deepEqual([s.mark, s.side, s.card, s.map, s.sheet, s.setup], ['same-page', 'bets', 6, 6, null, false], JSON.stringify(s));
    await ev("HardPanGps.showSide('gps')");
    assert.ok(await until("HardPanGps.side() === 'gps' && HardPanGps.hole() === 6", 4000), 'back to the map on hole 6');
});

test('Tools: units, layout and tournament mode change in place - same page, same hole', { timeout: 60000 }, async () => {
    assert.ok(await ev('HardPanGps.openTools()'));
    await sleep(400);
    const TS = '(function(){' + VIS + ' var t=document.querySelector("#gps-overlay .gps-tsheet"); return JSON.stringify({ open: vis(t), units: (t && t.querySelector("[data-ts-seg=units] .on") || {}).getAttribute ? t.querySelector("[data-ts-seg=units] .on").getAttribute("data-v") : null, layout: HardPanGps.layout(), mark: window.__d18, hole: HardPanGps.hole() }); })()';
    let t = JSON.parse(await ev(TS));
    assert.equal(t.open, true, 'the Tools sheet is open');
    await click('#gps-overlay [data-ts-seg="units"] [data-v="m"]');
    t = JSON.parse(await ev(TS));
    assert.deepEqual([t.units, t.mark, t.hole, t.open], ['m', 'same-page', 6, true], JSON.stringify(t));
    await click('#gps-overlay [data-ts-seg="units"] [data-v="yd"]');
    await click('#gps-overlay [data-ts-seg="layout"] [data-v="c"]');
    t = JSON.parse(await ev(TS));
    assert.deepEqual([t.layout, t.mark, t.hole], ['c', 'same-page', 6], JSON.stringify(t));
    await ev("HardPanGps.setLayout('d')");
    await sleep(300);
    if (!JSON.parse(await ev(TS)).open) { await ev('HardPanGps.openTools()'); await sleep(300); }
    await click('#gps-overlay [data-ts-sw="tourney"]');
    t = JSON.parse(await ev(TS));
    assert.deepEqual([t.mark, t.hole], ['same-page', 6]);
    await click('#gps-overlay [data-ts-sw="tourney"]');
    const s = await st();
    assert.deepEqual([s.mark, s.side, s.map, s.setup], ['same-page', 'gps', 6, false]);
});

test('Share (Round Menu) over the map: the code, the link, the QR codes on top of the map; closed -> the map, hole 6', { timeout: 60000 }, async () => {
    await ev('(function(){ var e=document.querySelector("#gps-overlay .gps-tsheet"); if (e && getComputedStyle(e).display !== "none") { var x = document.querySelector("#gps-overlay .gps-ts-back"); if (x) x.click(); } return 1; })()');
    assert.ok(await ev('HardPanRound.openMenu()'));
    await sleep(300);
    await click('#hp-sheet [data-hs-tile="share"]');
    assert.match(await ev("document.getElementById('hp-sheet').innerText"), new RegExp(CODE));
    await click('#hp-sheet [data-hs="qr"]');
    await sleep(400);
    // The QR sheet is the top thing at the middle of the screen - not the map.
    const top = await ev("(function(){ var e=document.elementFromPoint(196, 420); var q=document.querySelector('.qr-sheet'); return JSON.stringify({ onTop: !!(q && e && q.contains(e)), open: !!(q && q.classList.contains('open')) }); })()");
    assert.deepEqual(JSON.parse(top), { onTop: true, open: true }, 'the QR codes show over the map: ' + top);
    await click('.qr-sheet .qr-close');
    const s = await st();
    assert.deepEqual([s.mark, s.side, s.map, s.setup], ['same-page', 'gps', 6, false], JSON.stringify(s));
});

test('Tools > Other course in a round: asks first (over the map); "Not now" stays on hole 6 - Full setup only on yes', { timeout: 60000 }, async () => {
    assert.ok(await ev('HardPanGps.openTools()'));
    await sleep(400);
    // The tile runs the menu's own button (tsRun); the button itself, whether or not this course shows the tile.
    await ev("(function(){ var t=document.querySelector('#gps-overlay [data-ts-tile=\".gps-pick-course\"]'); if (t && t.offsetParent) { t.click(); return 'tile'; } document.querySelector('#gps-overlay .gps-tools-menu .gps-pick-course').click(); return 'button'; })()");
    await sleep(300);
    const ask = await ev("(function(){ var s=document.getElementById('ui-sheet'); var e=document.elementFromPoint(196, 500); return JSON.stringify({ text: s ? s.innerText : '', onTop: !!(s && e && s.contains(e)) }); })()");
    const a = JSON.parse(ask);
    assert.match(a.text, /Change the course for this round\?[\s\S]*Full setup/);
    assert.equal(a.onTop, true, 'the question shows over the map');
    await ev("(function(){ var b=Array.prototype.filter.call(document.querySelectorAll('#ui-sheet button'), function(x){ return /Not now/.test(x.textContent); })[0]; if (b) b.click(); return 1; })()");
    await sleep(400);
    const s = await st();
    assert.deepEqual([s.mark, s.side, s.map, s.setup], ['same-page', 'gps', 6, false], JSON.stringify(s));
});
