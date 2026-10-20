// ============================================================================
// 017 PART B - ONE "+ BET" (features.simpleFlow), IN REAL CHROME, iPhone 15 size.
//
// Group 1's link on an 8-golfer round, Manny (102) on this phone, thru 3 - so a bet
// struck now counts from hole 4. Stub db only (tools/lib/journey.js): nothing leaves.
//   1  The card has "+ Bet" and "You: $0 · N bets"; the GPS bottom bar has a yellow
//      "+ Bet" (layout D) and the chip.
//   2  + Bet -> Match -> Bob, Manny, Skeens, Paul -> "Bob + Manny vs Skeens + Paul" ->
//      $10 -> "Counts from Hole 4 (now)", "Worst case for you: -$5" -> Start bet: the
//      record in events/<code>/sideMatches is EXACTLY what challenges.js
//      sideMatchPayloadFromTerms (New Action's builder) makes from the same terms.
//   3  No hilo-engine.js: no Hi-Lo tile. With the Hi-Lo module loaded (016): the tile,
//      four golfers, a 'hilo' side match through the same builder.
//   4  Skins: an additionalGameInstances entry in New Action's saveFieldAction shape.
//   5  A Group 1 link may not start a skins game with a Group 2 golfer (New Action's rule).
//   6  A score entered on the card moves the money chip (GPS and card) at once.
//   7  simpleFlow OFF: no + Bet, no chip, anywhere.
// Screenshots (b-*.png) into SHOTS_017 when it is set.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ON = fs.existsSync(path.join(__dirname, 'gps-bet.js'));
if (!ON) { console.log('Consumer tree (GPS_ENABLED=0): no + Bet sheet - skipped.'); process.exit(0); }
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
const CH = require('./challenges.js');

const CODE = 'BET017';
const SHOTS = process.env.SHOTS_017 || '';
function round() {
    const r = wizardSavedRound({ code: CODE, golfers: 8, ownerUid: 'anon-cold', thru: 3, flights: false,
        names: ['Bob Baker', 'Manny Orozco', 'Skeens Hall', 'Paul Park', 'Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta'],
        overrides: { activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', groupSizeOverrides: { 0: 4, 1: 4 } } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    return r;
}
const DB = { events: { [CODE]: round() }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} };
const PRE = 'window.__hardpanDoors = true;' + iapStub({ active: true })
    + "try{localStorage.setItem('golfapp_me_" + CODE + "','102');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIS = "function vis(e){ if(!e) return false; var r=e.getBoundingClientRect(); if(!(r.width>0&&r.height>0)) return false; for(var x=e;x&&x!==document.documentElement;x=x.parentElement){var c=getComputedStyle(x); if(c.display==='none'||c.visibility==='hidden') return false;} return true; }";

let j;
const ev = async (x) => j.evaluate(x);
const shot = async (name) => { if (SHOTS) await j.shot(path.join(SHOTS, 'b-' + name + '.png')); };
async function tapIn(sel) { const ok = await ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.click(); return true;})()'); assert.ok(ok, 'no ' + sel); }
async function pick(ids) { for (const id of ids) await tapIn('#hp-bet [data-hb-pick="' + id + '"]'); }
const lastSide = "JSON.stringify((function(){ var sm = (window.__DB.events['" + CODE + "'].sideMatches)||{}; var k = Object.keys(sm).sort().pop(); return k ? sm[k] : null; })())";

before(async () => {
    j = await openJourney({ db: DB, viewport: { width: 393, height: 852 }, webgl: true, preScript: PRE });
    await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 4500);
});
after(async () => { if (j) await j.close(); });

test('the card and the GPS have "+ Bet" and the money chip', { timeout: 60000 }, async () => {
    const card = JSON.parse(await ev('(function(){' + VIS + ' return JSON.stringify({ bet: vis(document.querySelector("#hp-card-bet .hp-bet-btn")), chip: (document.querySelector("#hp-card-bet .hp-money-chip")||{}).innerText, on: HardPanBet.on() }); })()'));
    assert.equal(card.on, true, 'simpleFlow is on in dev');
    assert.equal(card.bet, true, 'no + Bet on the card');
    assert.match(card.chip, /^You: \$0 · \d+ bets?$/);
    await shot('card');
    await ev("(function(){ var b=(document.querySelector('#hp-card-bet [data-hp-bar=gps]') || document.getElementById('fd-gps-btn')); if(b) b.click(); return 1; })()");
    await sleep(3000);
    const g = JSON.parse(await ev('(function(){' + VIS + ' var b=document.querySelector("#gps-overlay .gps-bet-btn"); var c=document.querySelector("#gps-overlay .gps-money"); return JSON.stringify({ side: HardPanGps.side(), layout: HardPanGps.layout(), bet: vis(b), text: b && b.innerText, bg: b && getComputedStyle(b).backgroundColor, chip: vis(c) && c.innerText, cardBar: vis(document.querySelector("#hp-card-bet .hp-bet-btn")) }); })()'));
    assert.equal(g.side, 'gps'); assert.equal(g.layout, 'd');
    assert.equal(g.bet, true, 'no + Bet on the GPS bottom bar'); assert.equal(g.text, '+ Bet');
    assert.equal(g.bg, 'rgb(255, 214, 10)', '+ Bet is yellow');
    assert.match(g.chip, /^You: \$0 · \d+ bets?$/);
    assert.equal(g.cardBar, false, 'the card bar stays off the map');
    await shot('gps');
});

test('+ Bet Match 2v2 mid-round writes New Action\'s record (sideMatchPayloadFromTerms)', { timeout: 60000 }, async () => {
    await tapIn('#gps-overlay .gps-bet-btn');
    const tiles = JSON.parse(await ev('JSON.stringify(Array.prototype.map.call(document.querySelectorAll("#hp-bet .hb-tile b"), function(b){return b.innerText;}))'));
    // Hi-Lo is in the tree (gps-features 3e7654b): the first row is Match · Nassau · Hi-Lo · Skins (018).
    assert.deepEqual(tiles, ['Match', 'Nassau', 'Hi-Lo', 'Stroke play', 'More ›'], 'URGENT-014: 2 v 2 (a group of four) - Match · Nassau · Hi-Lo · Stroke play · More');
    await tapIn('#hp-bet [data-hb-game="match"]');
    await pick(['101', '102', '103', '104']);
    assert.equal(await ev('document.querySelector("#hp-bet .hb-vs").innerText'), 'Bob + Manny vs Skeens + Paul');
    await shot('bet-pick');
    await tapIn('#hp-bet [data-hb="next"]');
    await tapIn('#hp-bet [data-hb-stake="10"]');
    const s2 = await ev('document.querySelector("#hp-bet .hb-panel").innerText');
    assert.match(s2, /Hole 4 \(now\)/);
    assert.match(s2, /Worst case for you: −\$5/);
    assert.equal(await ev('document.querySelector("#hp-bet .hb-from").value'), '4');
    await shot('bet-stake');
    const t0 = Date.now();
    await tapIn('#hp-bet [data-hb="start"]');
    await sleep(500);
    const got = JSON.parse(await ev(lastSide));
    assert.ok(got, 'nothing written');
    const want = CH.sideMatchPayloadFromTerms({ format: 'match', scoring: 'net', startHole: 4, stake: 10, pressRule: 'none' },
        { teamAIds: ['101', '102'], teamBIds: ['103', '104'], startHole: 4, now: got.createdAt, scope: 'group', ownerGroup: 1 });
    assert.deepEqual(got, want);
    assert.ok(got.createdAt >= t0 - 5000);
    assert.equal(await ev('HardPanBet.isOpen()'), false, 'the sheet closes');
    assert.match(await ev('document.querySelector("#gps-overlay .gps-money").innerText'), /· \d+ bets?$/);
    await shot('gps-after-bet');
});

test('Skins: New Action\'s additionalGameInstances entry; a Group 1 link cannot enrol Group 2', { timeout: 60000 }, async () => {
    await ev('HardPanBet.open("skins")');
    await pick(['101', '102', '103']);
    await tapIn('#hp-bet [data-hb="field"]');
    await pick(['105']);
    await tapIn('#hp-bet [data-hb="next"]');
    await tapIn('#hp-bet [data-hb="start"]');
    assert.match(await ev('document.querySelector("#hp-bet .hb-why").innerText'), /Group 1.s link, so a skins game here can only include Group 1 golfers/);
    await tapIn('#hp-bet [data-hb="back"]');
    await pick(['105']);   // out again
    await tapIn('#hp-bet [data-hb="next"]');
    await tapIn('#hp-bet [data-hb-scoring="gross"]');
    await tapIn('#hp-bet [data-hb="start"]');
    await sleep(400);
    const inst = JSON.parse(await ev("JSON.stringify((function(){ var a = window.__DB.events['" + CODE + "'].additionalGameInstances||{}; var k=Object.keys(a).sort().pop(); return a[k]; })())"));
    const { createdAt, ...rest } = inst;
    assert.ok(createdAt > 0);
    assert.deepEqual(rest, { format: 'skins', enabled: true, startHole: 4, scope: 'group', ownerGroup: 1, skinsBuyIn: 10, skinsPotFormat: 'gross',
        skinsScoring: 'gross', skinsCarryOver: false, participantIds: ['101', '102', '103'] });
});

test('Hi-Lo: a tile only with the Hi-Lo module (the real hilo-engine.js); four golfers; the same builder', { timeout: 60000 }, async () => {
    assert.equal(await ev('typeof calculateHiLoSideMatch === "function" && typeof hiloShapeOk === "function"'), true, 'hilo-engine.js is not loaded');
    // WITHOUT the module (simulated: its two entry points hidden for one open) there is no tile.
    const without = JSON.parse(await ev('(function(){ var a = window.hiloShapeOk, b = window.hiloForSideMatch; window.hiloShapeOk = undefined; window.hiloForSideMatch = undefined; '
        + 'HardPanBet.open(); var t = Array.prototype.map.call(document.querySelectorAll("#hp-bet .hb-tile b"), function(x){ return x.innerText; }); HardPanBet.close(); window.hiloShapeOk = a; window.hiloForSideMatch = b; return JSON.stringify(t); })()'));
    assert.deepEqual(without, ['Match', 'Nassau', 'Stroke play', 'More ›']);
    await ev('HardPanBet.open()');
    const tiles = JSON.parse(await ev('JSON.stringify(Array.prototype.map.call(document.querySelectorAll("#hp-bet .hb-tile b"), function(b){return b.innerText;}))'));
    assert.deepEqual(tiles, ['Match', 'Nassau', 'Hi-Lo', 'Stroke play', 'More ›'], 'URGENT-014: 2 v 2 (a group of four) - Match · Nassau · Hi-Lo · Stroke play · More');
    await tapIn('#hp-bet [data-hb-game="hilo"]');
    await pick(['101', '102']);
    assert.equal(await ev('document.querySelector("#hp-bet [data-hb=next]").disabled'), true, 'Hi-Lo needs four');
    await pick(['103', '104']);
    await tapIn('#hp-bet [data-hb="next"]');
    await tapIn('#hp-bet [data-hb-stake="5"]');
    assert.match(await ev('document.querySelector("#hp-bet .hb-panel").innerText'), /Hi-Lo · \$ per point[\s\S]*Worst case for you: −\$75[\s\S]*Ties are a wash/);
    await shot('bet-hilo');
    await tapIn('#hp-bet [data-hb="start"]');
    await sleep(400);
    const got = JSON.parse(await ev(lastSide));
    assert.deepEqual(got, CH.sideMatchPayloadFromTerms({ format: 'hilo', scoring: 'net', startHole: 4, stake: 5, pressRule: 'none' },
        { teamAIds: ['101', '102'], teamBIds: ['103', '104'], startHole: 4, now: got.createdAt, scope: 'group', ownerGroup: 1 }));
});

test('a score entered on the card moves the money chip on the card and the GPS', { timeout: 60000 }, async () => {
    // A fresh $20 1v1 between Manny and Bob from hole 4; Manny birdies 4, Bob bogeys - Manny is 1 UP.
    await ev("(function(){ var sm = window.__DB.events['" + CODE + "'].sideMatches; Object.keys(sm).forEach(function(k){ db.ref('events/" + CODE + "/sideMatches/' + k).remove(); }); return 1; })()");
    await sleep(300);
    await ev('HardPanBet.open("match")');
    await tapIn('#hp-bet [data-hb-mode="1v1"]');
    await tapIn('#hp-bet [data-hb-game="match"]');
    await pick(['102', '101']);
    await tapIn('#hp-bet [data-hb="next"]');
    await tapIn('#hp-bet [data-hb-stake="20"]');
    await tapIn('#hp-bet [data-hb="start"]');
    await sleep(400);
    await ev("HardPanGps.showSide('bets')");
    await sleep(300);
    const before0 = await ev('document.querySelector("#hp-card-bet .hp-money-chip").innerText');
    await ev("saveScore('102', 4, 4); saveScore('101', 4, 6); 1");
    await sleep(800);
    const after = JSON.parse(await ev('JSON.stringify({ card: document.querySelector("#hp-card-bet .hp-money-chip").innerText, m: HardPanBet.moneyNow() })'));
    assert.notEqual(after.card, before0, 'the chip did not move: ' + before0);
    assert.equal(after.card.replace(/\s+/g, ' '), after.m.text);
    await ev("(function(){ var b=(document.querySelector('#hp-card-bet [data-hp-bar=gps]') || document.getElementById('fd-gps-btn')); if(b) b.click(); return 1; })()");
    await sleep(1200);
    assert.equal(await ev('document.querySelector("#gps-overlay .gps-money").innerText'), after.card, 'GPS chip = card chip');
});

test('simpleFlow OFF: no + Bet and no chip anywhere', { timeout: 60000 }, async () => {
    const r = JSON.parse(await ev('(function(){' + VIS + ' HARDPAN_GPS_CONFIG.features.simpleFlow = false; HardPanBet.refresh(); HardPanGps.roundUpdated(currentData);'
        + ' var o = { gpsBet: vis(document.querySelector("#gps-overlay .gps-bet-btn")), gpsChip: vis(document.querySelector("#gps-overlay .gps-money")), open: HardPanBet.open() };'
        + ' HardPanGps.showSide("bets"); o.cardBar = vis(document.querySelector("#hp-card-bet .hp-bet-btn")); HARDPAN_GPS_CONFIG.features.simpleFlow = true; return JSON.stringify(o); })()'));
    assert.deepEqual(r, { gpsBet: false, gpsChip: false, open: false, cardBar: false });
});
