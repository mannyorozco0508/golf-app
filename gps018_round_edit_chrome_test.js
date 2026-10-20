// ============================================================================
// URGENT-018 - ROUND EDITS IN PLACE (gps-round-edit.js, features.simpleFlow), IN REAL CHROME,
// iPhone 15 size. Stub db only.
//
// An 8-golfer round, two groups of four, thru 3, the organizer's phone, on hole 4 of the card.
//   1  Round settings: QUICK EDITS on top; Round Setup's wizard is "Full setup ›" (the one
//      place it stays).
//   2  Groups: 5 / 3 - one golfer moves to Group 1; the page never leaves, the same hole;
//      a group emptied that has scores is refused.
//   3  Start: Hole 10, then each group's own first hole (groupStartingHoles).
//   4  Tee for everyone: teeRating + every golfer's handicap re-derived from the Index on the
//      new tee by handicap.js playerHandicapFields (the function Round Setup's save calls).
//   5  Nines on Thistle (thistle_27) before any score: courseData + courseName rebuilt as Round
//      Setup builds them; with scores in: refused, pointing at Full setup.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-round-edit.js'))) { console.log('Consumer tree: no round edits - skipped.'); process.exit(0); }
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const CODE = 'REDT18';
const CD = makeCourseData(18);
const TEE = (name, y, r, sl) => ({ name, rating: r, slope: sl, parTotal: 72, totalYards: y, holes: CD.map((h) => ({ par: h.par, yardage: Math.round(y / 18) })) });
const TEES = { male: [TEE('Copper', 6800, 72.5, 130), TEE('Blue', 6500, 71.0, 125), TEE('White', 6187, 69.0, 118)], female: [TEE('Red', 5645, 71.4, 120)] };
const WHITE = { teeKey: 'male:2', teeName: 'Men · White', slope: 118, courseRating: 69.0, par: 72, allowance: 100 };
const r = wizardSavedRound({ code: CODE, golfers: 8, ownerUid: 'anon-cold', thru: 3, flights: false, courseData: CD,
    overrides: { activeCourseKey: 'gca_zgkynkan', courseName: 'Dobson Ranch Golf Course', groupSizeOverrides: { 0: 4, 1: 4 }, teeRating: WHITE, handicapBasis: 'ghin-index' } });
delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
// Indexes for the first three; the rest are legacy (no Index) and keep their numbers.
r.players[0].handicapIndex = '10.0'; r.players[1].handicapIndex = '+2.0'; r.players[2].handicapIndex = '18.4';
const THISTLE = wizardSavedRound({ code: 'NINE18', golfers: 4, ownerUid: 'anon-cold', thru: 0, flights: false,
    overrides: { activeCourseKey: 'thistle_27', courseName: 'Thistle Golf Club (Cameron / MacKay)', groupSizeOverrides: { 0: 4 } } });
delete THISTLE.moneyPool;
const DB = { events: { [CODE]: r, NINE18: THISTLE }, global_courses: { gca_zgkynkan: { name: 'Dobson Ranch Golf Course', data: CD, tees: TEES } }, trips: {}, organizers: {}, tournaments: {} };
const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true })
    + "try{['" + CODE + "','NINE18'].forEach(function(c){localStorage.setItem('golfapp_me_'+c,'101');sessionStorage.setItem('groupPickDismissed:'+c,'1');localStorage.setItem('hardpan_round_side','bets|'+c);});}catch(e){}";
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const STATE = "JSON.stringify({ url: location.pathname.split('/').pop() + location.search, nav: performance.getEntriesByType('navigation').length, hole: typeof currentViewedHole !== 'undefined' ? currentViewedHole : null,"
    + " sheet: !!document.querySelector('#hp-redit.open'), steps: !!document.querySelector('.wizard-step, #sf'), groups: currentData.groupSizeOverrides, start: currentData.startingHole === undefined ? null : currentData.startingHole,"
    + " gsh: currentData.groupStartingHoles || null, tee: currentData.teeRating || null, players: currentData.players.map(function (p) { return [p.name, p.hcp, p.handicapIndex == null ? null : p.handicapIndex, p.courseHandicap == null ? null : p.courseHandicap]; }),"
    + " course: currentData.courseName, card: (currentData.courseData || []).length })";

let j;
const ev = async (x) => j.evaluate(x);
const st = async () => JSON.parse(await ev(STATE));
async function click(sel) { assert.ok(await ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.click(); return true;})()'), 'no ' + sel); await sleep(150); }
async function until(expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 8000)) { if (await ev(expr)) return true; await sleep(150); } return false; }
async function toHole4() { await ev("(function(){ if (typeof goToHole === 'function') goToHole(4); return 1; })()"); await sleep(400); }

before(async () => {
    j = await openJourney({ db: DB, viewport: { width: 393, height: 852 }, preScript: PRE });
    await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 4500);
    await toHole4();
});
after(async () => { if (j) await j.close(); });

test('Round settings: QUICK EDITS on top, and the wizard is "Full setup ›"', { timeout: 60000 }, async () => {
    await ev('HardPanRound.openSettings()');
    assert.ok(await until("!!document.getElementById('hp-quick') && /Full setup/.test(document.getElementById('round-sheet-body').innerText)", 6000), 'quick edits and Full setup drawn');
    const t = await ev("document.getElementById('round-sheet-body').innerText");
    assert.match(t, /QUICK EDITS[\s\S]*\+ Add golfer[\s\S]*Groups[\s\S]*Start[\s\S]*Tee for everyone/);
    assert.match(t, /Full setup › · every step/);
    const full = JSON.parse(await ev("JSON.stringify(Array.prototype.filter.call(document.querySelectorAll('a'), function (a) { return /admin\\.html\\?game=/.test(a.getAttribute('href') || '') && a.offsetParent !== null; }).map(function (a) { return a.textContent; }))"));
    assert.equal(full.length, 1, 'exactly one way into the full setup: ' + JSON.stringify(full));
    assert.match(full[0], /^Full setup ›/);
    await click('#hp-quick [data-hq="groups"]');
    assert.equal((await st()).sheet, true, 'Groups opens as a sheet');
    await click('#hp-redit [data-re="close"]');
});

test('Groups: 5 / 3 in place - same page, same hole; emptying a group with scores is refused', { timeout: 60000 }, async () => {
    const s0 = await st();
    await ev("HardPanRoundEdit.open('groups')");
    await click('#hp-redit [data-re-more="0"]');
    assert.match(await ev("document.getElementById('hp-redit').innerText"), /Group 1’s link now includes/);
    await click('#hp-redit [data-re="save"]');
    assert.ok(await until("!document.querySelector('#hp-redit.open') && currentData.groupSizeOverrides && currentData.groupSizeOverrides[0] === 5", 8000), 'saved 5/3');
    let s = await st();
    assert.deepEqual(s.groups, { 0: 5, 1: 3 });
    assert.deepEqual([s.url, s.nav, s.hole, s.steps], [s0.url, 1, s0.hole, false], 'same page, no reload, same hole, no setup');
    // Group 2 down to nothing: it has scores - refused.
    await ev("HardPanRoundEdit.open('groups')");
    for (let k = 0; k < 3; k++) await click('#hp-redit [data-re-more="0"]');
    await click('#hp-redit [data-re="save"]');
    assert.ok(await until("/has scores/.test(document.getElementById('hp-redit').innerText)", 6000), 'refused');
    assert.deepEqual((await st()).groups, { 0: 5, 1: 3 });
    await click('#hp-redit [data-re="close"]');
});

test('Start: Hole 10, then Group 2 off hole 5 - narrow writes, same page', { timeout: 60000 }, async () => {
    const s0 = await st();
    await ev("HardPanRoundEdit.open('start')");
    await click('#hp-redit [data-re-start="10"]');
    await ev("(function(){ var s=document.querySelector('#hp-redit [data-re-ghole=\"2\"]'); s.value='5'; s.dispatchEvent(new Event('change',{bubbles:true})); return 1; })()");
    await click('#hp-redit [data-re="save"]');
    assert.ok(await until("currentData.startingHole === 10 && currentData.groupStartingHoles && currentData.groupStartingHoles['2'] === 5", 8000));
    const s = await st();
    assert.deepEqual([s.url, s.nav, s.steps], [s0.url, 1, false]);
    // Back to Hole 1, no per-group holes.
    await ev("HardPanRoundEdit.open('start')");
    await click('#hp-redit [data-re-start="1"]');
    await click('#hp-redit [data-re="allsame"]');
    await click('#hp-redit [data-re="save"]');
    assert.ok(await until("currentData.startingHole === 1 && !(currentData.groupStartingHoles && currentData.groupStartingHoles['2'])", 8000));
});

test('Tee for everyone: Blue - teeRating, and each Index re-figured by handicap.js playerHandicapFields; legacy golfers keep their numbers', { timeout: 60000 }, async () => {
    const before = await st();
    await ev("HardPanRoundEdit.open('tee')");
    assert.ok(await until("!!document.querySelector('#hp-redit [data-re-tee=\"male:1\"]')", 6000), 'the rated tees');
    await click('#hp-redit [data-re-tee="male:1"]');
    assert.match(await ev("document.getElementById('hp-redit').innerText"), /→/);
    await click('#hp-redit [data-re="save"]');
    assert.ok(await until("currentData.teeRating && currentData.teeRating.teeKey === 'male:1'", 8000));
    const s = await st();
    assert.deepEqual(s.tee, { teeKey: 'male:1', teeName: 'Men · Blue', slope: 125, courseRating: 71, par: 72, allowance: 100 });
    // The same function Round Setup's save calls, run in Node on the same inputs.
    const sb = { console }; vm.createContext(sb);
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'handicap.js'), 'utf8') + '\nthis.F = playerHandicapFields;', sb);
    const blue = { slope: 125, courseRating: 71, par: 72, allowance: 100 };
    ['10.0', '+2.0', '18.4'].forEach((idx, i) => {
        const f = sb.F(idx, null, blue);
        assert.deepEqual(s.players[i].slice(1), [f.hcp, f.handicapIndex, f.courseHandicap], 'golfer ' + i);
    });
    for (let i = 3; i < 8; i++) assert.equal(s.players[i][1], before.players[i][1], 'a legacy golfer keeps their number');
});

test('Nines (Thistle) before any score: rebuilt as Round Setup builds them; a scored card is refused', { timeout: 60000 }, async () => {
    await j.goto(fileUrl('index.html', 'game=NINE18&group=1'), 4500);
    await ev("HardPanRoundEdit.open('nines')");
    assert.ok(await until("!!document.querySelector('#hp-redit [data-re-back=\"stewart\"]')", 6000), 'the nines');
    await click('#hp-redit [data-re-back="stewart"]');
    await click('#hp-redit [data-re="save"]');
    assert.ok(await until("/Cameron \\/ Stewart/.test(currentData.courseName)", 8000), 'saved');
    let s = await st();
    assert.equal(s.course, 'Thistle Golf Club (Cameron / Stewart)');
    assert.equal(s.card, 18);
    // Round Setup's build, in Node: remapNineHandicaps from course-data.js.
    const sb = {}; vm.createContext(sb);
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'course-data.js'), 'utf8') + '\nthis.L = nineHoleLoops; this.R = remapNineHandicaps;', sb);
    const want = []; sb.R(sb.L.thistle_27.cameron.data, true).forEach((h, i) => want.push({ hole: i + 1, par: h.par, hcpIndex: h.hcpIndex }));
    sb.R(sb.L.thistle_27.stewart.data, false).forEach((h, i) => want.push({ hole: i + 10, par: h.par, hcpIndex: h.hcpIndex }));
    assert.deepEqual(JSON.parse(await ev('JSON.stringify(currentData.courseData)')), want);
    // A score in: refused.
    await ev("db.ref('events/NINE18/scores/p101_h1').set(4)");
    await sleep(500);
    await ev("HardPanRoundEdit.open('nines')");
    assert.match(await ev("document.getElementById('hp-redit').innerText"), /Full setup/);
    assert.ok(!(await ev("!!document.querySelector('#hp-redit [data-re=\"save\"]')")), 'no Save');
    await click('#hp-redit [data-re="close"]');
});
