// ============================================================================
// URGENT-017 - ADD A GOLFER FROM THE GPS ROUND: ONE SHEET, IN PLACE (features.simpleFlow),
// IN REAL CHROME, iPhone 15 size. Stub db only.
//
// A GPS round (Start GPS: one golfer, no games, the White tee), on hole 4 of the map.
//   1  Card (sheet over the map) -> "+ Add a player": the Add golfer sheet over the page -
//      no navigation, no Round Setup, no step bar. One golfer with a PLUS handicap (+ key),
//      then two more ("Add another"): written through the Players sheet's own builder, the
//      round's tee for each, the page never left, the same hole, and a score still saves.
//   2  + Bet -> "Anyone in the field" -> "+ Add golfer": the sheet, and the new golfer is
//      a chip in the bet sheet right after.
//   3  Another tee for one golfer: p.tee is that tee.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-add-golfer.js'))) { console.log('Consumer tree: no Add golfer sheet - skipped.'); process.exit(0); }
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const CODE = 'ADDG17';
const CD = makeCourseData(18);
const TEE = (name, y, r, sl) => ({ name, rating: r, slope: sl, parTotal: 72, totalYards: y, holes: CD.map((h) => ({ par: h.par, yardage: Math.round(y / 18) })) });
const TEES = { male: [TEE('Copper', 6800, 72.5, 130), TEE('Blue', 6500, 71.0, 125), TEE('White', 6187, 69.0, 118)], female: [TEE('Red', 5645, 71.4, 120)] };
const r = wizardSavedRound({ code: CODE, golfers: 1, ownerUid: 'anon-cold', thru: 3, flights: false, names: ['Manny'], courseData: CD,
    overrides: { activeCourseKey: 'gca_zgkynkan', courseName: 'Dobson Ranch Golf Course', groupSizeOverrides: { 0: 1 },
        teeRating: { teeKey: 'male:2', teeName: 'White', slope: 118, courseRating: 69.0, par: 72 }, handicapBasis: 'as-entered' } });
delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed; delete r.sideMatches;
r.additionalGameInstances = {}; r.additionalGames = {}; r.gameFormat = 'stroke'; r.skinsBuyIn = 0; r.holeBetStake = 0; r.birdieGameEnabled = false;
const DB = { events: { [CODE]: r }, global_courses: { gca_zgkynkan: { name: 'Dobson Ranch Golf Course', data: CD, tees: TEES } }, trips: {}, organizers: {}, tournaments: {} };
const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true })
    + "try{localStorage.setItem('golfapp_me_" + CODE + "','101');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');"
    + "localStorage.setItem('golfapp_snap_v1_OLD001', JSON.stringify({ at: 1, data: { players: [{ id: 101, name: 'Skeens', hcp: '2.0' }, { id: 102, name: 'Bob', hcp: '5.0' }] } }));}catch(e){}";
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const STATE = "JSON.stringify({ url: location.pathname.split('/').pop() + location.search, side: window.HardPanGps ? HardPanGps.side() : null, hole: window.HardPanGps ? HardPanGps.hole() : null,"
    + " sheet: !!document.querySelector('#hp-addg.open'), steps: !!document.querySelector('.wizard-step, #sf, .sf-bar'), nav: performance.getEntriesByType('navigation').length,"
    + " players: (currentData.players || []).map(function (p) { return [p.id, p.name, p.hcp, p.tee ? p.tee.teeName : null]; }), groups: currentData.groupSizeOverrides })";

let j;
const ev = async (x) => j.evaluate(x);
const st = async () => JSON.parse(await ev(STATE));
async function click(sel) { assert.ok(await ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.click(); return true;})()'), 'no ' + sel); }
async function type(sel, v) { assert.ok(await ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.value=' + JSON.stringify(v) + '; e.dispatchEvent(new Event("input",{bubbles:true})); return true;})()'), 'no ' + sel); }
async function until(expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 8000)) { if (await ev(expr)) return true; await sleep(150); } return false; }

before(async () => {
    j = await openJourney({ db: DB, viewport: { width: 393, height: 852 }, webgl: true, preScript: PRE });
    await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 4500);
    // To the map, on hole 4.
    await ev("(function(){ var b=(document.querySelector('#hp-card-bet [data-hp-bar=gps]') || document.getElementById('fd-gps-btn')); if(b) b.click(); return 1; })()");
    await sleep(2500);
    await ev('HardPanGps.goToHole ? HardPanGps.goToHole(4) : 0');
    await sleep(600);
});
after(async () => { if (j) await j.close(); });

test('Card -> "+ Add a player": the sheet in place; a +2 golfer, then two more; round tee; same page, same hole; a score still saves', { timeout: 90000 }, async () => {
    const s0 = await st();
    // The card as a sheet over the map.
    await ev("(function(){ var b=document.querySelector('[data-hp-bar=card]') || document.querySelector('[data-hp-gpsbar=card]'); if (b) b.click(); else HardPanGps.showSide('bets'); return 1; })()");
    await sleep(800);
    assert.ok(await until("!!document.querySelector('a[href*=\"step=players\"]')", 6000), 'the card shows "+ Add a player"');
    await click('a[href*="step=players"]');
    await sleep(500);
    let s = await st();
    assert.equal(s.sheet, true, 'the Add golfer sheet is open');
    assert.equal(s.url, s0.url, 'no navigation');
    assert.equal(s.steps, false, 'no setup steps, no step bar');
    const tees = await ev("JSON.stringify(Array.prototype.map.call(document.querySelectorAll('#hp-addg [data-ag-tee]'), function (b) { return b.innerText.replace(/\\n/g, ' | ') + (b.classList.contains('on') ? ' *' : ''); }))");
    assert.ok(JSON.parse(tees).some((t) => /^White \| Men.* \*$/.test(t)), 'the round\'s tee (White) is picked: ' + tees);
    assert.match(await ev("document.getElementById('hp-addg').innerText"), /MY GOLFERS[\s\S]*\+ Skeens 2\.0[\s\S]*\+ Bob 5\.0/, 'My golfers chips from this phone\'s rounds');
    // One golfer, a plus handicap via the + key.
    await type('#ag-name', 'Tim');
    await click('#hp-addg [data-ag="plus"]');
    await type('#ag-hcp', '2');
    await click('#hp-addg [data-ag="save"]');
    assert.ok(await until("!document.querySelector('#hp-addg.open') && currentData.players.length === 2", 8000), 'saved and closed');
    s = await st();
    assert.deepEqual(s.players[1].slice(1), ['Tim', '+2', null], 'Tim, +2, the round\'s tee (no own tee): ' + JSON.stringify(s.players));
    assert.equal(s.url, s0.url);
    assert.equal(s.nav, 1, 'no reload');
    // Two more: one typed + Add another, one My golfers chip.
    await click('a[href*="step=players"]');
    await sleep(400);
    await type('#ag-name', 'Paul');
    await type('#ag-hcp', '4');
    await click('#hp-addg [data-ag="another"]');
    await click('#hp-addg [data-ag-chip="Bob"]');
    assert.match(await ev("document.querySelector('#hp-addg [data-ag=save]').textContent"), /Add 2 golfers/);
    await click('#hp-addg [data-ag="save"]');
    assert.ok(await until("!document.querySelector('#hp-addg.open') && currentData.players.length === 4", 8000), 'two more saved');
    s = await st();
    assert.deepEqual(s.players.map((p) => p[1]), ['Manny', 'Tim', 'Paul', 'Bob']);
    assert.deepEqual(s.players.map((p) => p[2]), ['0', '+2', '4', '5.0'].map((x, i) => i === 0 ? s.players[0][2] : x));
    assert.deepEqual(s.groups, { 0: 4 }, 'all in your group');
    assert.equal(s.url, s0.url);
    assert.equal(s.nav, 1, 'no reload, no setup page in the history');
    assert.equal(s.hole, s0.hole, 'the same hole');
    // The new golfers are on the card, and a score for one of them saves.
    assert.match(await ev("document.body.innerText"), /Tim[\s\S]*Paul[\s\S]*Bob/);
    const pid = s.players[1][0];
    await ev("db.ref('events/" + CODE + "/scores/p" + pid + "_h1').set(4)");
    assert.ok(await until("currentData.scores && currentData.scores.p" + pid + "_h1 === 4", 5000), 'a score for the new golfer saves');
});

test('+ Bet -> "Anyone in the field" -> "+ Add golfer": the sheet, and the new golfer is a chip in the bet sheet', { timeout: 60000 }, async () => {
    await ev("HardPanBet.open('match')");
    await sleep(600);
    await ev("(function(){ var f=document.querySelector('[data-hb=\"field\"]'); if (f) f.click(); return 1; })()");
    await sleep(300);
    assert.ok(await until("!!document.querySelector('[data-hp-addgolfer]')", 4000), 'the bet sheet offers + Add golfer');
    await click('[data-hp-addgolfer]');
    await sleep(400);
    assert.equal((await st()).sheet, true);
    await type('#ag-name', 'Glenn');
    await type('#ag-hcp', '12');
    await click('#hp-addg [data-ag="save"]');
    assert.ok(await until("!document.querySelector('#hp-addg.open') && currentData.players.some(function(p){return p.name==='Glenn';})", 8000));
    assert.ok(await until("/Glenn/.test((document.getElementById('hp-bet') || document.body).innerText)", 4000), 'Glenn is a chip in the bet sheet');
    await ev('HardPanBet.close ? HardPanBet.close() : 0');
});

test('another tee for one golfer: that tee is stored on the golfer', { timeout: 60000 }, async () => {
    await ev('HardPanAddGolfer.open()');
    await sleep(400);
    await type('#ag-name', 'Kopp');
    await type('#ag-hcp', '6');
    await click('#hp-addg [data-ag-tee="male:1"]');
    await click('#hp-addg [data-ag="save"]');
    assert.ok(await until("currentData.players.some(function(p){return p.name==='Kopp';})", 8000));
    const s = await st();
    const k = s.players.filter((p) => p[1] === 'Kopp')[0];
    assert.deepEqual(k.slice(2), ['6', 'Blue']);
});
