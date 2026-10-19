// ============================================================================
// 017 PART B - THE ROUND MENU (6 tiles + Finish & settle up) AND GPS <-> CARD <-> BETS
// WITHOUT LEAVING (features.simpleFlow), IN REAL CHROME, iPhone 15 size.
//
// Group 1's link on an 8-golfer round, Manny (102) on this phone, thru 3. Stub db only.
//   1  GPS -> Card: the card opens as a sheet OVER THE MAP (the map stays shown, the same
//      MapLibre canvas - never rebuilt), the same hole, under 300 ms; the strip above the
//      sheet -> the map again, same canvas, same hole.
//   2  ☰ Menu (the card's bar, the old Round Menu pill, the GPS "☰ Menu"): the six tiles and
//      Finish & settle up, and every tile does its job - Card, Bets (a sheet with the Bets
//      page in a kept frame), GPS, + Bet, Share (code, QR codes, the group's link), Round
//      settings (today's Round Menu sheet, with GPS tools that open the map's Tools sheet).
//   3  Finish & settle up: one screen, exactly computeCombinedNetTotals' who-pays-who.
//   4  Back (GolfBack): Bets closes, the card that came from the map goes to the map; the
//      join screen ("How are you joining?") never shows.
// Screenshots (b-*.png) into SHOTS_017 when it is set.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-round.js'))) { console.log('Consumer tree (GPS_ENABLED=0): no simple-flow Round Menu - skipped.'); process.exit(0); }
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const CODE = 'MENU017';
const SHOTS = process.env.SHOTS_017 || '';
const r = wizardSavedRound({ code: CODE, golfers: 8, ownerUid: 'anon-cold', thru: 3, flights: false,
    names: ['Bob Baker', 'Manny Orozco', 'Skeens Hall', 'Paul Park', 'Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta'],
    overrides: { activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', groupSizeOverrides: { 0: 4, 1: 4 } } });
delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
// A $10 1v1 from hole 1: Manny (102) beat Bob (101) on 1 and 2 - money to settle.
r.sideMatches = { M1: { format: 'match', scoring: 'gross', teamAIds: ['102'], teamBIds: ['101'], startHole: 1, createdAt: 1, stake: 10, pressRule: 'none' } };
r.scores.p102_h1 = 3; r.scores.p102_h2 = 3;
const DB = { events: { [CODE]: r }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} };
const PRE = 'window.__hardpanDoors = true;' + iapStub({ active: true })
    + "try{localStorage.setItem('golfapp_me_" + CODE + "','102');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}";
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const VIS = "function vis(e){ if(!e) return false; var r=e.getBoundingClientRect(); if(!(r.width>0&&r.height>0)) return false; for(var x=e;x&&x!==document.documentElement;x=x.parentElement){var c=getComputedStyle(x); if(c.display==='none'||c.visibility==='hidden') return false;} return true; }";
const STATE = '(function(){' + VIS + ' var cv=document.querySelector("#gps-overlay canvas"); return JSON.stringify({ side: HardPanGps.side(), hole: HardPanGps.hole(), card: currentViewedHole, '
    + 'mark: cv ? cv.__hp017 || null : null, overlay: vis(document.getElementById("gps-overlay")), sheet: document.body.classList.contains("hp-card-sheet"), '
    + 'join: vis(document.getElementById("group-pick-overlay")), menu: HardPanRound.sheetKind(), bets: document.body.classList.contains("hp-bets-open"), url: location.search }); })()';

let j;
const ev = async (x) => j.evaluate(x);
const st = async () => JSON.parse(await ev(STATE));
const shot = async (name) => { if (SHOTS) await j.shot(path.join(SHOTS, 'b-' + name + '.png')); };
async function click(sel) { assert.ok(await ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.click(); return true;})()'), 'no ' + sel); }

before(async () => {
    j = await openJourney({ db: DB, viewport: { width: 393, height: 852 }, webgl: true, preScript: PRE });
    await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 4500);
    await ev("(function(){ var b=document.getElementById('fd-gps-btn'); if(b) b.click(); return 1; })()");
    await sleep(3000);
    // Mark the map's canvas: a rebuilt map would be a new canvas without the mark.
    assert.ok(await ev('(function(){ var cv=document.querySelector("#gps-overlay canvas"); if(!cv) return false; cv.__hp017 = "same-map"; return true; })()'), 'no map canvas');
});
after(async () => { if (j) await j.close(); });

test('GPS -> Card is a sheet over the live map (same hole, same map, < 300 ms); the strip -> the map', { timeout: 60000 }, async () => {
    const ms = await ev('new Promise(function(res){ var t=performance.now(); document.querySelector("#gps-overlay .gps-side-bets").click(); '
        + 'requestAnimationFrame(function(){ requestAnimationFrame(function(){ res(performance.now()-t); }); }); })');
    await sleep(200);
    const s = await st();
    assert.ok(ms < 300, 'GPS -> Card took ' + ms + ' ms');
    assert.deepEqual([s.side, s.hole, s.card, s.mark, s.overlay, s.sheet, s.join], ['bets', 4, 4, 'same-map', true, true, false], JSON.stringify(s));
    await shot('card-sheet');
    const ms2 = await ev('new Promise(function(res){ var t=performance.now(); document.getElementById("hp-strip").click(); requestAnimationFrame(function(){ requestAnimationFrame(function(){ res(performance.now()-t); }); }); })');
    const g = await st();
    assert.ok(ms2 < 300, 'Card -> GPS took ' + ms2 + ' ms');
    assert.deepEqual([g.side, g.hole, g.mark, g.sheet], ['gps', 4, 'same-map', false], JSON.stringify(g));
});

test('☰ Menu on the GPS and on the card: six tiles and Finish & settle up; the old pill opens it too', { timeout: 60000 }, async () => {
    assert.equal(await ev('document.querySelector("#gps-overlay .gps-door-games").innerText'), '☰ Menu');
    assert.equal(await ev('(function(){' + VIS + ' return vis(document.querySelector("#gps-overlay .gps-bottom .gps-tools")); })()'), false, 'Tools left the GPS bar');
    await click('#gps-overlay .gps-door-games');
    const tiles = JSON.parse(await ev('JSON.stringify(Array.prototype.map.call(document.querySelectorAll("#hp-sheet .hs-tile b"), function(b){ return b.innerText.replace(/^\\S+\\s/, ""); }))'));
    assert.deepEqual(tiles, ['Card', 'Bets', 'GPS', 'Bet', 'Share', 'Round settings']);
    assert.match(await ev('document.querySelector("#hp-sheet .hs-finish").innerText'), /Finish & settle up/);
    assert.equal((await st()).side, 'gps', 'the menu opens over the map');
    await shot('menu-gps');
    await click('#hp-sheet [data-hs-tile="card"]');
    await sleep(200);
    let s = await st();
    assert.deepEqual([s.side, s.menu, s.hole, s.mark], ['bets', null, 4, 'same-map']);
    await ev('toggleRoundSheet()');   // the old Round Menu pill's own call
    assert.equal(await ev('HardPanRound.sheetKind()'), 'menu');
    assert.equal(await ev('document.getElementById("round-sheet").classList.contains("open")'), false, 'the old sheet stays shut');
    await shot('menu');
    await click('#hp-sheet [data-hs-tile="gps"]');
    await sleep(200);
    s = await st();
    assert.deepEqual([s.side, s.hole, s.mark, s.menu], ['gps', 4, 'same-map', null]);
});

test('Bets tile: a sheet with the Bets page (kept frame) and the Leaderboard; the bar stays; back = close', { timeout: 60000 }, async () => {
    await ev('HardPanRound.openMenu()');
    await click('#hp-sheet [data-hs-tile="bets"]');
    await sleep(2500);
    const b = JSON.parse(await ev('(function(){' + VIS + ' var f=document.querySelector("#hp-bets iframe[data-k=bets]"); var t=""; try { t=f.contentDocument.body.innerText; } catch(e){} '
        + 'return JSON.stringify({ open: document.body.classList.contains("hp-bets-open"), text: t.slice(0, 400), nav: vis(f && f.contentDocument.getElementById("app-nav-wrap")), bar: vis(document.querySelector("#hp-card-bet .hp-bet-btn")), gpsBtn: vis(document.querySelector("#hp-card-bet [data-hp-bar=gps]")), cardBtn: vis(document.querySelector("#hp-card-bet [data-hp-bar=card]")), side: HardPanGps.side() }); })()'));
    assert.equal(b.open, true);
    assert.match(b.text, /Bets/);
    assert.deepEqual([b.nav, b.bar, b.gpsBtn, b.cardBtn, b.side], [false, true, true, true, 'gps'], JSON.stringify(b));
    await shot('bets-sheet');
    await click('#hp-bets [data-hb2="board"]');
    await sleep(2000);
    assert.equal(await ev('(function(){ var f=document.querySelector("#hp-bets iframe[data-k=board]"); return !!f && f.style.visibility === "visible" && /leaderboard\\.html/.test(f.src); })()'), true);
    assert.equal(await ev('GolfBack.press({ canGoBack: true })'), 'hp-bets');
    const s = await st();
    assert.deepEqual([s.bets, s.side, s.hole, s.mark, s.join], [false, 'gps', 4, 'same-map', false]);
});

test('+ Bet and Share tiles: the bet sheet; the code, the QR codes and the group link', { timeout: 60000 }, async () => {
    await ev('HardPanRound.openMenu()');
    await click('#hp-sheet [data-hs-tile="bet"]');
    assert.equal(await ev('HardPanBet.isOpen()'), true);
    await ev('HardPanBet.close()');
    await ev('HardPanRound.openMenu()');
    await click('#hp-sheet [data-hs-tile="share"]');
    const sh = await ev('document.querySelector("#hp-sheet .hs-panel").innerText');
    assert.match(sh, new RegExp(CODE));
    assert.match(sh, /Show QR code/);
    assert.match(sh, /Group 1/);
    await shot('share');
    await click('#hp-sheet [data-hs-copy="1"]');
    await sleep(300);
    assert.match(await ev('document.querySelector("#hp-sheet [data-hs-copy=\\"1\\"]").innerText'), /Copied/);
    await click('#hp-sheet [data-hs="qr"]');
    await sleep(800);
    const qr = JSON.parse(await ev('(function(){' + VIS + ' var q=document.querySelector(".qr-sheet.open"); return JSON.stringify({ open: !!q, shown: vis(q), z: q ? getComputedStyle(q).zIndex : null, imgs: q ? q.querySelectorAll("svg, img, canvas").length : 0 }); })()'));
    assert.equal(qr.open && qr.shown, true, 'the QR codes did not show over the map: ' + JSON.stringify(qr));
    assert.ok(qr.imgs > 0);
    await ev('(function(){ var q=document.querySelector(".qr-sheet.open"); if (q) q.classList.remove("open"); return 1; })()');
});

test('Round settings: today\'s Round Menu sheet, with GPS tools -> the map\'s Tools sheet', { timeout: 60000 }, async () => {
    await ev('HardPanRound.openMenu()');
    await click('#hp-sheet [data-hs-tile="settings"]');
    await sleep(400);
    const rs = JSON.parse(await ev('(function(){' + VIS + ' return JSON.stringify({ open: document.getElementById("round-sheet").classList.contains("open"), side: HardPanGps.side(), tools: vis(document.getElementById("hp-gps-tools")), text: document.getElementById("round-sheet-body").innerText.slice(0, 600) }); })()'));
    assert.deepEqual([rs.open, rs.side, rs.tools], [true, 'bets', true], JSON.stringify(rs));
    await shot('settings');
    await click('#hp-gps-tools');
    await sleep(500);
    const t = JSON.parse(await ev('(function(){' + VIS + ' return JSON.stringify({ side: HardPanGps.side(), sheet: vis(document.querySelector("#gps-overlay .gps-tsheet")), rs: document.getElementById("round-sheet").classList.contains("open") }); })()'));
    assert.deepEqual(t, { side: 'gps', sheet: true, rs: false });
    await ev('(function(){ var t=document.querySelector("#gps-overlay .gps-tsheet"); if (t) t.style.display="none"; return 1; })()');
});

test('Finish & settle up: one screen, exactly who-pays-who, Share; writes nothing', { timeout: 60000 }, async () => {
    const writes0 = await ev('window.__WRITES.length');
    await ev('HardPanRound.openMenu()');
    await click('#hp-sheet [data-hs="finish"]');
    const f = JSON.parse(await ev('(function(){ var d=currentData; var res=computeCombinedNetTotals(d, d.courseData.slice().sort(function(a,b){return a.hole-b.hole;}), d.scores||{}); '
        + 'return JSON.stringify({ tx: res.transactions.map(function(t){ return t.from + " → " + t.to + " $" + Math.round(t.amount); }), rows: Array.prototype.map.call(document.querySelectorAll("#hp-sheet .hs-pay"), function(r){ return r.innerText.replace(/\\s+/g, " ").trim(); }), text: document.querySelector("#hp-sheet .hs-panel").innerText }); })()'));
    assert.ok(f.tx.length >= 1, 'the fixture has money to settle');
    assert.deepEqual(f.rows, f.tx);
    assert.match(f.text, /Share who pays who/);
    assert.match(await ev('HardPanRound.payText()'), /Bob pays Manny \$\d+|pays/);
    await shot('finish');
    assert.equal(await ev('window.__WRITES.length'), writes0, 'Settle up wrote something');
    await ev('HardPanRound.closeSheet(true)');
});

test('Back: card from the map -> the map; never the join screen', { timeout: 60000 }, async () => {
    await ev('HardPanRound.toCard()');
    await sleep(200);
    assert.equal(await ev('GolfBack.press({ canGoBack: true })'), 'hp-card-to-map');
    let s = await st();
    assert.deepEqual([s.side, s.hole, s.mark, s.join], ['gps', 4, 'same-map', false]);
    await ev('HardPanRound.openMenu()');
    await click('#hp-sheet [data-hs-tile="share"]');
    assert.equal(await ev('GolfBack.press({ canGoBack: true })'), 'hp-round-sheet');
    assert.equal(await ev('HardPanRound.sheetKind()'), 'menu', 'Share -> back -> the menu');
    assert.equal(await ev('GolfBack.press({ canGoBack: true })'), 'hp-round-sheet');
    s = await st();
    assert.deepEqual([s.menu, s.side, s.join, s.url], [null, 'gps', false, '?game=' + CODE + '&group=1']);
});
