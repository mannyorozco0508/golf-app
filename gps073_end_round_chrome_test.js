// ============================================================================
// 073 - END ROUND, DON'T SAVE, IN REAL CHROME (iPhone 15 size), the app's real scorecard page and Round
// Menu over a stub database (nothing live). Made-up golfers.
//   1  the organizer's Round Menu: Finish & settle up, Change course and Leave round exactly where they
//      were, then the new last row; Finish & settle up still opens the same Settle up screen
//   2  the ask word for word; Keep playing does nothing (no write, still on the round)
//   3  asked twice (3 other golfers + a $10 match); yes twice: the round is gone from the database,
//      gone from this phone (History copy, Resume, stats), Home opens - and ANOTHER round's money,
//      worked out by the app's own computeCombinedNetTotals, is identical before and after
//   4  another golfer: no row; when the organizer ends it, "The organizer ended this round." (the older
//      "isn't on the server any more" sheet stays out of the way)
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-round.js'))) { console.log('Consumer tree (GPS_ENABLED=0): no Round Menu - skipped.'); process.exit(0); }
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const NAMES = ['Ray Ortiz', 'Dan Kim', 'Luis Vega', 'Tom Reyes'];
function round(code, owner) {
    const r = wizardSavedRound({ code, golfers: 4, ownerUid: owner, thru: 3, flights: false, names: NAMES,
        overrides: { activeCourseKey: 'papago', courseName: 'Papago Golf Club', groupSizeOverrides: { 0: 4 } } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    r.sideMatches = { M1: { format: 'match', scoring: 'gross', teamAIds: ['101'], teamBIds: ['102'], startHole: 1, createdAt: 1, stake: 10, pressRule: 'none' } };
    r.scores.p101_h1 = 3; r.scores.p101_h2 = 3;
    return r;
}
const DB = { events: { END073: round('END073', 'anon-cold'), KEEP73: round('KEEP73', 'anon-cold'), OTHR73: round('OTHR73', 'uid-of-the-organizer') },
    '.info': { connected: true }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} };
const KEEP_BEFORE = JSON.stringify(DB.events.KEEP73);
const PRE = 'window.__hardpanDoors = true;' + iapStub({ active: true })
    + "try{if(!localStorage.getItem('seed073')){localStorage.setItem('seed073','1');['END073','KEEP73','OTHR73'].forEach(function(c){localStorage.setItem('golfapp_me_'+c,'101');sessionStorage.setItem('groupPickDismissed:'+c,'1');});}}catch(e){}";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROWS = '(function(){var p=document.querySelector("#hp-sheet .hs-panel"); return JSON.stringify(Array.prototype.map.call(p.querySelectorAll("button.hs-way, button.hs-finish"), function(b){return b.getAttribute("data-hs")+"|"+b.innerText.replace(/\\n/g," | ");}));})()';
const MONEY = '(function(){ var d=currentData; var r=computeCombinedNetTotals(d,(d.courseData||[]).slice().sort(function(a,b){return a.hole-b.hole;}),d.scores||{}); return JSON.stringify({ tx: r.transactions, net: r.netByName }); })()';
let j;
const ev = (x) => j.evaluate(x);

before(async () => { j = await openJourney({ db: DB, viewport: { width: 393, height: 852 }, preScript: PRE }); });
after(async () => { if (j) await j.close(); });

let moneyBefore = null;
test('0 the other round’s money, before', async () => {
    await j.goto(fileUrl('index.html', 'game=KEEP73'), 4000);
    moneyBefore = await ev(MONEY);
    assert.match(moneyBefore, /"tx":\[\{/, 'the $10 match has a payment');
});

test('1 the organizer’s Round Menu: the old rows where they were, the new row last; Finish still opens Settle up', async () => {
    await j.goto(fileUrl('index.html', 'game=END073'), 4500);
    assert.equal(await ev('HardPanRound.canEnd()'), true);
    await ev('HardPanRound.openMenu(), 1'); await sleep(400);
    const rows = JSON.parse(await ev(ROWS));
    assert.deepEqual(rows.map((r) => r.split('|')[0]), ['finish', 'change-course', 'leave', 'end-round']);
    assert.equal(rows[0], 'finish|Finish & settle up');
    assert.equal(rows[3], 'end-round|🗑️ End round — don’t save | Delete this round: its scores, stats and shots aren’t kept');
    await ev('document.querySelector("[data-hs=finish]").click(), 1'); await sleep(300);
    assert.equal(await ev('HardPanRound.sheetKind()'), 'finish');
    assert.match(await ev('document.querySelector("#hp-sheet .hs-panel").innerText'), /Settle up[\s\S]*payments? settles? everything[\s\S]*Share who pays who/i);
    await ev('HardPanRound.closeSheet(true), 1');
});

test('2 the ask word for word; Keep playing does nothing', async () => {
    await ev('HardPanRound.openMenu(), 1'); await sleep(300);
    await ev('window.__WRITES = []; document.querySelector("[data-hs=end-round]").click(), 1'); await sleep(500);
    assert.equal(await ev('document.querySelector(".ui-sheet-title").textContent'), 'End this round and delete it?');
    assert.equal(await ev('document.querySelector(".ui-sheet-body").textContent'), 'Scores, stats and shots from this round won’t be saved. This can’t be undone.');
    assert.equal(await ev('document.getElementById("ui-sheet-yes").textContent'), 'Delete round');
    assert.equal(await ev('document.getElementById("ui-sheet-no").textContent'), 'Keep playing');
    await ev('document.getElementById("ui-sheet-no").click(), 1'); await sleep(500);
    assert.equal(await ev('JSON.stringify(window.__WRITES)'), '[]', 'nothing written');
    assert.equal(await ev('!!(__DB.events.END073 && __DB.events.END073.players)'), true);
    assert.match(await ev('location.pathname'), /index\.html$/);
});

test('3 asked twice; yes twice: gone from the database and the phone; Home; the other round’s money identical', async () => {
    await ev("localStorage.setItem('hardpan_shots_v1_END073','{\"v\":1,\"holes\":{}}'); localStorage.setItem('hardpan_sg_v1_END073','{\"v\":1}'); localStorage.setItem('hardpan_bag_v1','{\"v\":1,\"golfers\":{\"me\":{\"shots\":{},\"set\":{\"Dr\":255}}}}'); 1");
    await ev('HardPanRound.openMenu(), 1'); await sleep(300);
    await ev('document.querySelector("[data-hs=end-round]").click(), 1'); await sleep(500);
    await ev('document.getElementById("ui-sheet-yes").click(), 1'); await sleep(500);
    assert.equal(await ev('document.querySelector(".ui-sheet-title").textContent'), 'Delete it for everyone?');
    assert.equal(await ev('document.getElementById("ui-sheet-yes").textContent'), 'Delete for everyone');
    await ev('document.getElementById("ui-sheet-yes").click(), 1');
    await sleep(3500);
    assert.match(await ev('location.pathname'), /home\.html$/);
    const db = await j.harvest();
    assert.equal(db.events.END073, undefined, 'the round is gone from the database');
    assert.equal(JSON.stringify(db.events.KEEP73), KEEP_BEFORE, 'the other round is byte-identical');
    const left = JSON.parse(await ev('(function(){var o=[];for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i); if(k.indexOf("END073")>=0) o.push(k);} return JSON.stringify(o);})()'));
    assert.deepEqual(left, ['hardpan_nostats_END073']);
    assert.equal(await ev("localStorage.getItem('hardpan_bag_v1')"), '{"v":1,"golfers":{"me":{"shots":{},"set":{"Dr":255}}}}', 'My bag untouched');
    await j.goto(fileUrl('index.html', 'game=KEEP73'), 4000);
    assert.equal(await ev(MONEY), moneyBefore, 'the other round’s money is identical');
});

test('4 another golfer: no row; then "The organizer ended this round."', async () => {
    await j.goto(fileUrl('index.html', 'game=OTHR73&group=1'), 4500);
    assert.equal(await ev('HardPanRound.canEnd()'), false);
    await ev('HardPanRound.openMenu(), 1'); await sleep(300);
    assert.deepEqual(JSON.parse(await ev(ROWS)).map((r) => r.split('|')[0]), ['finish', 'change-course', 'leave']);
    await ev('HardPanRound.closeSheet(true), 1');
    await ev('db.ref("events/OTHR73").update({ endedByOrganizer: Date.now() }), 1'); await sleep(400);
    await ev('db.ref("events/OTHR73").remove(), 1'); await sleep(800);
    assert.equal(await ev('(function(){var e=document.getElementById("hp-ended-round"); return e && getComputedStyle(e).display!=="none" ? e.innerText.split("\\n")[0] : null;})()'), 'The organizer ended this round.');
    assert.equal(await ev('(function(){var e=document.getElementById("hp-stuck-round"); return !e || getComputedStyle(e).display==="none";})()'), true);
    await ev('document.querySelector("[data-hp-ended-home]").click(), 1'); await sleep(2500);
    assert.match(await ev('location.pathname'), /home\.html$/);
    assert.equal(await ev("localStorage.getItem('golfapp_snap_v1_OTHR73')"), null);
});
