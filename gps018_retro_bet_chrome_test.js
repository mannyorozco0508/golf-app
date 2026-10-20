// ============================================================================
// 018 - BETS ON HOLES ALREADY PLAYED, from "+ Bet" (features.simpleFlow), IN REAL CHROME.
//
// Manny on hole 18, Thru 18: "+ Bet" › Match 2v2 › Counts from: Hole 1 said "No holes are
// left to bet on". Now:
//   1  Counts from offers EVERY hole; with all 18 in it starts on 1; "Holes 1-18 already
//      played: this bet settles from the scores already in."; the line shows the RESULT (the
//      existing engines, read only) instead of the worst case; Start asks ONE in-sheet confirm
//      ("Add this bet for holes already played? Everyone in it should agree." Add bet /
//      Cancel) - Cancel writes nothing; Add bet writes the record New Action's builder makes
//      for a bet struck on hole 1, and the money is what the preview said, zero-sum.
//   2  Hi-Lo on 18 for 1-18 = the same bet made on hole 1 (record and money, the real
//      hilo-engine.js; its receipt; zero-sum).
//   3  A Nassau added after the front nine, from hole 1: "Holes 1-9 already played", so far +
//      the worst case for the rest; = the Nassau made on hole 1.
//   4  Skins added mid-round (thru 9) counting from hole 1 = the same skins made on hole 1;
//      zero-sum. No confirm for a start on the current hole.
// Money engines untouched: the bet is the existing record with startHole <= now.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-bet.js'))) { console.log('Consumer tree (GPS_ENABLED=0): no + Bet - skipped.'); process.exit(0); }
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
const CH = require('./challenges.js');

const SHOTS = process.env.SHOTS_017 || '';
const NAMES = ['Bob Baker', 'Manny Orozco', 'Skeens Hall', 'Paul Park', 'Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta'];
function round(code, thru) {
    const r = wizardSavedRound({ code, golfers: 8, ownerUid: 'anon-cold', thru, flights: false, names: NAMES,
        overrides: { activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', groupSizeOverrides: { 0: 4, 1: 4 } } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    // Bob (101) and Manny (102) birdie 1-3 (the bets here are gross, so these decide them); Skeens (103) bogeys 5 and 7 - real results to settle.
    [1, 2, 3].forEach((h) => { r.scores['p101_h' + h] -= 1; r.scores['p102_h' + h] -= 1; });
    [5, 7].filter((h) => h <= thru).forEach((h) => { r.scores['p103_h' + h] += 1; });
    return r;
}
// OFF THE 10TH: holes 10-18 played (Bob and Manny birdie 10-12), 1-9 still to play.
function round10() {
    const r = round('R10', 18);
    r.startingHole = 10;
    Object.keys(r.scores).forEach((k) => { const h = Number(k.split('_h')[1]); if (h <= 9) delete r.scores[k]; });
    r.scores.p103_h5 = undefined; r.scores.p103_h7 = undefined;
    Object.keys(r.scores).forEach((k) => { if (r.scores[k] === undefined) delete r.scores[k]; });
    [10, 11, 12].forEach((h) => { r.scores['p101_h' + h] -= 1; r.scores['p102_h' + h] -= 1; });
    return r;
}
const DB = { events: { R18: round('R18', 18), R9: round('R9', 9), R10: round10() }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} };
const PRE = 'window.__hardpanDoors = true;' + iapStub({ active: true })
    + "try{['R18','R9','R10'].forEach(function(c){ localStorage.setItem('golfapp_me_' + c,'102'); sessionStorage.setItem('groupPickDismissed:' + c,'1'); localStorage.setItem('hardpan_round_side','bets'); });}catch(e){}";
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
let j;
const ev = async (x) => j.evaluate(x);
const shot = async (name) => { if (SHOTS) await j.shot(path.join(SHOTS, 'd-' + name + '.png')); };
async function tapIn(sel) { assert.ok(await ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.click(); return true;})()'), 'no ' + sel); }
async function pick(ids) { for (const id of ids) await tapIn('#hp-bet [data-hb-pick="' + id + '"]'); }
const panel = () => ev('document.querySelector("#hp-bet .hb-panel").innerText');
// In the page: the money of the round with `rec` added under `slot` (exact, per name), its sum, and
// the Hi-Lo receipt when there is one. Read only (a copy of currentData).
const MONEY = (slot, rec) => '(function(){ var d = JSON.parse(JSON.stringify(currentData)); d.' + slot + ' = d.' + slot + ' || {}; d.' + slot + '.T = ' + JSON.stringify(rec) + '; '
    + 'var cd = d.courseData.slice().sort(function(a,b){return a.hole-b.hole;}); var r = computeCombinedNetTotals(d, cd, d.scores || {}); var ex = r.exact || {}; var sum = 0; var out = {}; '
    + 'Object.keys(ex).forEach(function(k){ out[k] = Math.round(ex[k].net * 100) / 100; sum += ex[k].net; }); '
    + 'var rc = null; try { rc = (typeof buildSideMatchReceipts === "function" ? buildSideMatchReceipts(d, cd, d.scores || {}) : []).filter(function(x){ return x && /hi-?lo/i.test(JSON.stringify(x).slice(0, 400)); }).length; } catch (e) { rc = "err " + e; } '
    + 'return JSON.stringify({ net: out, sum: Math.round(sum * 100) / 100, hiloReceipts: rc }); })()';
const strip = (o) => { const c = Object.assign({}, o); delete c.createdAt; return c; };

before(async () => { j = await openJourney({ db: DB, viewport: { width: 393, height: 852 }, webgl: true, preScript: PRE }); });
after(async () => { if (j) await j.close(); });

test('1: Match 2v2 on 18 for holes 1-18 - the played line, the result, one confirm, = the bet made on hole 1, zero-sum', { timeout: 90000 }, async () => {
    await j.goto(fileUrl('index.html', 'game=R18&group=1'), 4500);
    await ev('HardPanBet.open("match")');
    await pick(['101', '102', '103', '104']);
    await tapIn('#hp-bet [data-hb="next"]');
    await tapIn('#hp-bet [data-hb-stake="10"]');
    await tapIn('#hp-bet [data-hb-scoring="gross"]');   // gross: the birdies decide it, not the strokes
    assert.equal(await ev('document.querySelector("#hp-bet .hb-from").value'), '1', 'all 18 in: it starts on 1');
    assert.equal(await ev('document.querySelectorAll("#hp-bet .hb-from option").length'), 18, 'every hole is offered');
    const p = await panel();
    assert.match(p, /Holes 1-18 already played: this bet settles from the scores already in\./);
    // The Bets strip's own status line, then the money (018 follow-up wording).
    assert.match(p, /Result: Bob\/Manny \S+ → Bob \+ Manny \+\$5 each · Skeens \+ Paul −\$5 each/);
    assert.doesNotMatch(p, /Worst case/, 'a fully played bet shows its result, not a worst case');
    assert.equal(await ev('document.querySelector("#hp-bet [data-hb=start]").disabled'), false);
    await shot('retro-terms');
    const w0 = await ev('window.__WRITES.length');
    await tapIn('#hp-bet [data-hb="start"]');
    const c = await panel();
    assert.match(c, /Add this bet for holes already played\?/);
    assert.match(c, /Everyone in it should agree\./);
    assert.equal(await ev('document.querySelectorAll("dialog[open], .ui-sheet[style*=flex]").length'), 0, 'an in-app sheet, not a native dialog');
    await shot('retro-confirm');
    await tapIn('#hp-bet [data-hb="confirm-cancel"]');
    assert.equal(await ev('window.__WRITES.length'), w0, 'Cancel wrote something');
    assert.match(await panel(), /Counts from/);
    await tapIn('#hp-bet [data-hb="start"]');
    await tapIn('#hp-bet [data-hb="confirm-add"]');
    await sleep(400);
    const got = JSON.parse(await ev("JSON.stringify((function(){ var sm = window.__DB.events.R18.sideMatches || {}; var k = Object.keys(sm).sort().pop(); return sm[k]; })())"));
    const onHole1 = CH.sideMatchPayloadFromTerms({ format: 'match', scoring: 'gross', startHole: 1, stake: 10, pressRule: 'none' },
        { teamAIds: ['101', '102'], teamBIds: ['103', '104'], startHole: 1, now: 1, scope: 'group', ownerGroup: 1 });
    assert.deepEqual(strip(got), strip(onHole1));
    const late = JSON.parse(await ev(MONEY('sideMatches', got))), early = JSON.parse(await ev(MONEY('sideMatches', onHole1)));
    assert.deepEqual(late.net, early.net);
    assert.equal(late.sum, 0, 'not zero-sum');
    // After the round: Finish & settle up still offers a bet on it.
    await ev('HardPanRound.openFinish()');
    await tapIn('#hp-sheet [data-hs="add-bet"]');
    assert.equal(await ev('HardPanBet.isOpen()'), true, '"Add a bet on this round" did not open + Bet');
    await ev('HardPanBet.close()');
});

test('2: Hi-Lo on 18 for 1-18 = the Hi-Lo made on hole 1 (the real engine, its receipt, zero-sum)', { timeout: 60000 }, async () => {
    assert.equal(await ev('typeof calculateHiLoSideMatch'), 'function');
    await ev('HardPanBet.open("hilo")');
    await pick(['101', '102', '103', '104']);
    await tapIn('#hp-bet [data-hb="next"]');
    await tapIn('#hp-bet [data-hb-stake="5"]');
    await tapIn('#hp-bet [data-hb-scoring="gross"]');
    assert.match(await panel(), /Result: Bob \+ Manny \+\d+ \(Low \d+-\d+, High \d+-\d+\) → Bob \+ Manny \+\$\d+ each · Skeens \+ Paul −\$\d+ each/);
    const b = JSON.parse(await ev('JSON.stringify(HardPanBet.buildBet({ game: "hilo", picks: ["101","102","103","104"], stake: 5, scoring: "gross", startHole: 1 }))'));
    const onHole1 = CH.sideMatchPayloadFromTerms({ format: 'hilo', scoring: 'gross', startHole: 1, stake: 5, pressRule: 'none' },
        { teamAIds: ['101', '102'], teamBIds: ['103', '104'], startHole: 1, now: 1, scope: 'group', ownerGroup: 1 });
    assert.deepEqual(strip(b.value), strip(onHole1));
    const late = JSON.parse(await ev(MONEY('sideMatches', b.value))), early = JSON.parse(await ev(MONEY('sideMatches', onHole1)));
    assert.deepEqual(late.net, early.net);
    assert.equal(late.sum, 0);
    assert.ok(late.hiloReceipts >= 1, 'no Hi-Lo receipt: ' + late.hiloReceipts);
    assert.ok(late.net['bob baker'] > early.net['bob baker'] - 0.001 && Object.values(late.net).some((v) => v !== 0), 'the Hi-Lo moved no money');
    await ev('HardPanBet.close()');
});

test('3: a Nassau added after the front nine, from hole 1 = the Nassau made on hole 1', { timeout: 60000 }, async () => {
    await j.goto(fileUrl('index.html', 'game=R9&group=1'), 4500);
    await ev('HardPanBet.open("nassau")');
    await pick(['102', '103']);
    await tapIn('#hp-bet [data-hb="next"]');
    assert.equal(await ev('document.querySelector("#hp-bet .hb-from").value'), '10', 'the default is still now');
    assert.doesNotMatch(await panel(), /already played/);
    await ev('(function(){ var s = document.querySelector("#hp-bet .hb-from"); s.value = "1"; s.dispatchEvent(new Event("change", { bubbles: true })); return 1; })()');
    const p = await panel();
    assert.match(p, /Holes 1-9 already played: this bet settles from the scores already in\./);
    assert.match(p, /So far: Front 9 .+ · Back 9 .+ · Total .+ → /);
    assert.match(p, /Worst case for you: /, 'the back nine is still to play');
    await shot('retro-nassau');
    const b = JSON.parse(await ev('JSON.stringify(HardPanBet.buildBet({ game: "nassau", picks: ["102","103"], stake: 5, scoring: "net", startHole: 1 }))'));
    // The Nassau New Action makes on hole 1, through the same builder (it needs action-model.js's
    // buildNassauWagerPayload, so it is built in the page).
    const onHole1 = JSON.parse(await ev('JSON.stringify(sideMatchPayloadFromTerms({ format: "nassau", scoring: "net", startHole: 1, stake: 5, pressRule: "none", frontStake: 5, backStake: 5, overallStake: 5, autoPressStake: null }, '
        + '{ teamAIds: ["102"], teamBIds: ["103"], startHole: 1, now: 1, scope: "group", ownerGroup: 1 }))'));
    assert.deepEqual(strip(b.value), strip(onHole1));
    const late = JSON.parse(await ev(MONEY('sideMatches', b.value))), early = JSON.parse(await ev(MONEY('sideMatches', onHole1)));
    assert.deepEqual(late.net, early.net);
    assert.equal(late.sum, 0);
    await ev('HardPanBet.close()');
});

test('4: skins added mid-round counting from hole 1 = the skins made on hole 1; no confirm for a start on now', { timeout: 60000 }, async () => {
    const b = JSON.parse(await ev('JSON.stringify(HardPanBet.buildBet({ game: "skins", picks: ["102","103","104"], stake: 10, scoring: "gross", startHole: 1 }))'));
    const onHole1 = { format: 'skins', enabled: true, startHole: 1, createdAt: 1, scope: 'group', ownerGroup: 1, skinsBuyIn: 10, skinsPotFormat: 'gross', skinsScoring: 'gross', skinsCarryOver: false, participantIds: ['102', '103', '104'] };
    assert.deepEqual(strip(b.value), strip(onHole1));
    const late = JSON.parse(await ev(MONEY('additionalGameInstances', b.value))), early = JSON.parse(await ev(MONEY('additionalGameInstances', onHole1)));
    assert.deepEqual(late.net, early.net);
    assert.equal(late.sum, 0);
    const pv = JSON.parse(await ev('JSON.stringify(HardPanBet.preview({ game: "skins", picks: ["102","103","104"], stake: 10, scoring: "gross", startHole: 1 }))'));
    assert.ok(Object.keys(pv).length > 0, 'the skins on 1-9 paid nothing in the preview');
    // A start on the current hole: Start writes at once (no confirm).
    await ev('HardPanBet.open("skins")');
    await pick(['101', '102', '103']);
    await tapIn('#hp-bet [data-hb="next"]');
    await tapIn('#hp-bet [data-hb="start"]');
    await sleep(300);
    assert.equal(await ev('HardPanBet.isOpen()'), false, 'a start on now asked a confirm');
});

test('5: off the 10th - play order: the list starts at 10, now is 1, "Holes 10-18 already played", the confirm; from 10 = the whole round', { timeout: 90000 }, async () => {
    await j.goto(fileUrl('index.html', 'game=R10&group=1'), 4500);
    await ev('HardPanBet.open("match")');
    await pick(['101', '102', '103', '104']);
    await tapIn('#hp-bet [data-hb="next"]');
    await tapIn('#hp-bet [data-hb-scoring="gross"]');
    const opts = JSON.parse(await ev('JSON.stringify(Array.prototype.map.call(document.querySelectorAll("#hp-bet .hb-from option"), function(o){ return o.value; }))'));
    assert.deepEqual(opts, ['10', '11', '12', '13', '14', '15', '16', '17', '18', '1', '2', '3', '4', '5', '6', '7', '8', '9'], 'the holes in play order');
    assert.equal(await ev('document.querySelector("#hp-bet .hb-from").value'), '1', 'now (the next hole played) is 1');
    assert.doesNotMatch(await panel(), /already played/, 'hole 1 is still to play');
    await ev('(function(){ var s = document.querySelector("#hp-bet .hb-from"); s.value = "13"; s.dispatchEvent(new Event("change", { bubbles: true })); return 1; })()');
    assert.match(await panel(), /Holes 13-18 already played: this bet settles from the scores already in\./);
    await ev('(function(){ var s = document.querySelector("#hp-bet .hb-from"); s.value = "10"; s.dispatchEvent(new Event("change", { bubbles: true })); return 1; })()');
    const p = await panel();
    assert.match(p, /Holes 10-18 already played: this bet settles from the scores already in\./);
    assert.match(p, /So far: Bob\/Manny .+ → /);
    assert.match(p, /Worst case for you: /, 'holes 1-9 are still to play');
    await shot('retro-10th');
    await tapIn('#hp-bet [data-hb="start"]');
    assert.match(await panel(), /Add this bet for holes already played\?/, 'a start before now (in play order) asks');
    await tapIn('#hp-bet [data-hb="confirm-add"]');
    await sleep(400);
    const got = JSON.parse(await ev("JSON.stringify((function(){ var sm = window.__DB.events.R10.sideMatches || {}; var k = Object.keys(sm).sort().pop(); return sm[k]; })())"));
    const whole = CH.sideMatchPayloadFromTerms({ format: 'match', scoring: 'gross', startHole: 1, stake: 10, pressRule: 'none' },
        { teamAIds: ['101', '102'], teamBIds: ['103', '104'], startHole: 1, now: 1, scope: 'group', ownerGroup: 1 });
    assert.deepEqual(strip(got), strip(whole), 'from the first hole played = the whole round (startHole 1)');
    const m = JSON.parse(await ev(MONEY('sideMatches', got)));
    assert.equal(m.sum, 0);
    // From now (hole 1 on this round): no played line, no confirm.
    await ev('HardPanBet.open("match")');
    await pick(['102', '103']);
    await tapIn('#hp-bet [data-hb="next"]');
    await tapIn('#hp-bet [data-hb="start"]');
    await sleep(300);
    assert.equal(await ev('HardPanBet.isOpen()'), false, 'a start on now asked a confirm');
});
