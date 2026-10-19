// ============================================================================
// 017 PART D - SEAMLESS GPS <-> CARD <-> BETS (features.simpleFlow), IN REAL CHROME,
// iPhone 15 size. Group 1's link on an 8-golfer round, Manny (102) on this phone, thru 3,
// a GPS Map subscriber. Stub db only.
//   a  The Card is a sheet over the map from the first screen - the map built behind it
//      before the GPS was ever opened, and no location watch until the map is shown.
//   b  One bar: on the card ☰ | GPS | Enter score | + Bet; over Bets Card and GPS too.
//      Enter score on the card focuses this hole's first empty box.
//   c  Back = the previous screen, the card at its scroll; at the round's root Back opens
//      the Round Menu; never Home, never "How are you joining?".
//   d  A score typed on the card reaches the GPS chip and the Bets frame at once (the frame's
//      own stub never hears the write: only the hand-over can have put it there); the hole
//      moves on the GPS and the card together.
//   e  No reloads: the same document and the same map canvas throughout; the zoom comes
//      back; every switch timed (< 300 ms; printed).
// Screenshots (d-*.png) into SHOTS_017 when it is set.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-round.js'))) { console.log('Consumer tree (GPS_ENABLED=0): no simple flow - skipped.'); process.exit(0); }
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const CODE = 'FLOW017';
const SHOTS = process.env.SHOTS_017 || '';
const r = wizardSavedRound({ code: CODE, golfers: 8, ownerUid: 'anon-cold', thru: 3, flights: false,
    names: ['Bob Baker', 'Manny Orozco', 'Skeens Hall', 'Paul Park', 'Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta'],
    overrides: { activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', groupSizeOverrides: { 0: 4, 1: 4 } } });
delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
r.sideMatches = { M1: { format: 'match', scoring: 'gross', teamAIds: ['102'], teamBIds: ['101'], startHole: 4, createdAt: 1, stake: 10, pressRule: 'none' } };
const DB = { events: { [CODE]: r }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} };
// This phone last left the round on the card (so it opens there).
const PRE = 'window.__hardpanDoors = true;' + iapStub({ active: true })
    + "try{localStorage.setItem('golfapp_me_" + CODE + "','102');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');localStorage.setItem('hardpan_round_side','bets|" + CODE + "');}catch(e){}";
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const VIS = "function vis(e){ if(!e) return false; var r=e.getBoundingClientRect(); if(!(r.width>0&&r.height>0)) return false; for(var x=e;x&&x!==document.documentElement;x=x.parentElement){var c=getComputedStyle(x); if(c.display==='none'||c.visibility==='hidden') return false;} return true; }";
const STATE = '(function(){' + VIS + ' var cv=document.querySelector("#gps-overlay canvas"); return JSON.stringify({ side: HardPanGps.side(), hole: HardPanGps.hole(), card: currentViewedHole, doc: window.__hpDoc || null, '
    + 'mark: cv ? cv.__hp017 || null : null, sheet: document.body.classList.contains("hp-card-sheet"), bets: document.body.classList.contains("hp-bets-open"), menu: HardPanRound.sheetKind(), '
    + 'join: vis(document.getElementById("group-pick-overlay")), y: Math.round(window.scrollY), url: location.search }); })()';
// A switch, timed to the second frame after the tap (the screen has painted).
const TIMED = (js) => 'new Promise(function(res){ var t=performance.now(); ' + js + '; requestAnimationFrame(function(){ requestAnimationFrame(function(){ res(Math.round(performance.now()-t)); }); }); })';

let j;
const times = {};
const ev = async (x) => j.evaluate(x);
const st = async () => JSON.parse(await ev(STATE));
const shot = async (name) => { if (SHOTS) await j.shot(path.join(SHOTS, 'd-' + name + '.png')); };
const bar = (k) => '#hp-card-bet [data-hp-bar="' + k + '"]';

before(async () => {
    j = await openJourney({ db: DB, viewport: { width: 393, height: 852 }, webgl: true, preScript: PRE });
    await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 5000);
    await ev('window.__hpDoc = "doc-1"; 1');   // a full-page reload would lose it
});
after(async () => {
    if (j) await j.close();
    console.log('017 part D switch times (ms, Chrome, iPhone 15 viewport): ' + JSON.stringify(times));
});

test('a: the card opens as a sheet over the map before the GPS was ever opened; no location watch', { timeout: 60000 }, async () => {
    await sleep(1500);
    const s = await st();
    assert.equal(s.side, 'bets');
    assert.equal(s.sheet, true, 'the card is not a sheet over the map');
    assert.equal(await ev('HardPanGps.view().built'), true, 'the map was not built behind the card');
    assert.equal(await ev('HardPanGps.isWatching()'), false, 'location is watched behind the card');
    assert.ok(await ev('(function(){ var cv=document.querySelector("#gps-overlay canvas"); if(!cv) return false; cv.__hp017 = "same-map"; return true; })()'));
    await shot('card-sheet');
});

test('b: one bar on the card - ☰ | GPS | Enter score | + Bet; Enter score focuses this hole\'s first empty box', { timeout: 60000 }, async () => {
    const b = JSON.parse(await ev('(function(){' + VIS + ' return JSON.stringify(Array.prototype.filter.call(document.querySelectorAll("#hp-card-bet button:not(.hp-money-chip)"), vis).map(function(x){ return x.innerText.trim(); })); })()'));
    assert.deepEqual(b, ['☰', '📍 GPS', 'Enter score', '+ Bet']);
    await ev('document.querySelector(' + JSON.stringify(bar('score')) + ').click(); 1');
    const f = JSON.parse(await ev('JSON.stringify({ hole: document.activeElement && document.activeElement.getAttribute("data-hole"), cls: document.activeElement && document.activeElement.className })'));
    assert.equal(f.hole, '4'); assert.match(f.cls, /score-input/);
    await ev('document.activeElement.blur(); 1');
});

test('c+e: Back walks back through Bets, the map and the card (at its scroll); the root opens the Round Menu; no reload, same map, zoom kept', { timeout: 90000 }, async () => {
    await ev('window.scrollTo(0, 0); 1');
    times.cardToGps = await ev(TIMED('document.querySelector(' + JSON.stringify(bar('gps')) + ').click()'));
    let s = await st();
    assert.deepEqual([s.side, s.hole, s.mark], ['gps', 4, 'same-map']);
    await ev('document.querySelector("#gps-overlay .gps-zoom").click(); 1');
    await sleep(900);
    const z1 = JSON.parse(await ev('JSON.stringify(HardPanGps.view())'));
    await shot('gps');
    times.gpsToCard = await ev(TIMED('document.querySelector("#gps-overlay .gps-side-bets").click()'));
    s = await st();
    assert.deepEqual([s.side, s.sheet, s.hole, s.card, s.mark], ['bets', true, 4, 4, 'same-map']);
    await ev('window.scrollTo(0, 320); 1');
    await sleep(200);
    const y0 = (await st()).y;
    assert.ok(y0 > 100, 'the card did not scroll: ' + y0);
    times.openBetsCold = await ev(TIMED('document.querySelector("#hp-card-bet .hp-money-chip").click()'));
    await sleep(2500);
    times.closeBets = await ev(TIMED('HardPanRound.closeBets()'));
    times.openBetsWarm = await ev(TIMED('HardPanRound.openBets()'));
    await shot('bets-sheet');
    const over = JSON.parse(await ev('(function(){' + VIS + ' return JSON.stringify(Array.prototype.filter.call(document.querySelectorAll("#hp-card-bet button:not(.hp-money-chip)"), vis).map(function(x){ return x.innerText.trim(); })); })()'));
    assert.deepEqual(over, ['☰', 'Card', '📍 GPS', 'Enter score', '+ Bet'], 'the bar over Bets');
    // Back x1: Bets closes - the card under it, where it was.
    assert.equal(await ev('GolfBack.press({ canGoBack: true })'), 'hp-bets');
    s = await st();
    assert.deepEqual([s.bets, s.side, s.y], [false, 'bets', y0]);
    // Back x2: the map (it came before this card), the same zoom.
    assert.equal(await ev('GolfBack.press({ canGoBack: true })'), 'hp-previous');
    s = await st();
    assert.deepEqual([s.side, s.hole, s.mark], ['gps', 4, 'same-map']);
    await sleep(400);
    const z2 = JSON.parse(await ev('JSON.stringify(HardPanGps.view())'));
    assert.equal(z2.zoom, z1.zoom, 'the zoom changed: ' + JSON.stringify([z1, z2]));
    assert.deepEqual(z2.center, z1.center);
    // Back x3: the card this round opened on, at the scroll it had.
    assert.equal(await ev('GolfBack.press({ canGoBack: true })'), 'hp-previous');
    s = await st();
    assert.deepEqual([s.side, s.y], ['bets', y0], 'the card is not back at its scroll');
    // Back x4: nothing before it - the Round Menu, never Home or the join screen.
    assert.equal(await ev('GolfBack.press({ canGoBack: true })'), 'hp-round-root');
    s = await st();
    assert.deepEqual([s.menu, s.join, s.url, s.doc], ['menu', false, '?game=' + CODE + '&group=1', 'doc-1']);
    assert.match(await ev('document.querySelector("#hp-sheet .hs-panel").innerText'), /Leave the round/);
    assert.equal(await ev('GolfBack.press({ canGoBack: true })'), 'hp-round-sheet');
    assert.equal((await st()).menu, null);
    for (const k of Object.keys(times)) if (k !== 'openBetsCold') assert.ok(times[k] < 300, k + ' took ' + times[k] + ' ms');
});

test('d: a score on the card reaches the GPS chip and the Bets frame at once; the hole moves together', { timeout: 60000 }, async () => {
    await ev('HardPanRound.toCard(); 1');
    const before0 = await ev('document.querySelector("#hp-card-bet .hp-money-chip").innerText');
    times.scoreToEverywhere = await ev(TIMED("saveScore('102', 4, 3); saveScore('101', 4, 6)"));
    const a = JSON.parse(await ev('(function(){ var f=document.querySelector("#hp-bets iframe[data-k=bets]"); var fs = null; try { fs = f.contentWindow.eval("currentData.scores && currentData.scores.p102_h4"); } catch(e){ fs = "err " + e; } '
        + 'return JSON.stringify({ chip: document.querySelector("#hp-card-bet .hp-money-chip").innerText, gps: document.querySelector("#gps-overlay .gps-money").innerText, frame: fs, m: HardPanBet.moneyNow().text }); })()'));
    assert.notEqual(a.chip, before0, 'the chip did not move');
    assert.equal(a.gps.replace(/\s+/g, ' '), a.chip.replace(/\s+/g, ' '));
    assert.equal(a.frame, 3, 'the Bets frame did not get the score: ' + a.frame);
    // The hole: Next on the card -> the GPS is on 5 too; the GPS's own hole step -> the card follows.
    await ev('gpsGotoHole(5); 1');
    await sleep(300);
    let s = await st();
    assert.deepEqual([s.card, s.hole], [5, 5]);
    await ev('HardPanRound.toGps(); 1');
    await ev('gpsStepHole(1); 1');
    await sleep(300);
    s = await st();
    assert.deepEqual([s.side, s.card, s.hole, s.doc, s.mark], ['gps', 6, 6, 'doc-1', 'same-map']);
    await shot('gps-after-score');
});
