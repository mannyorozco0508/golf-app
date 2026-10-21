// ============================================================================
// URGENT-038 PART 1 - BETS & GAMES CLARITY (#24, #26, + Bet's half of #27). IN REAL CHROME,
// iPhone 15 size (393x852) with the iPhone 15's safe-area insets (59 top / 34 bottom).
//
//   #24  Round Menu › Bets on a ONE-group round (Test A v Test B, a $5 Nassau):
//        - no empty band under "You: ±$X · N bets": the Bets page in the sheet's frame
//          (skins.html?hpsheet=1) no longer insets itself by the status bar a second time.
//          The phone gap was exactly env(safe-area-inset-top); Chrome emulates it here.
//        - no "🔒 Group 1 — …" badge, no "Build or press a match on Matches" note,
//          and the card reads "⚔️ Matches", not "Group 1's Matches".
//        On a TWO-group round (8 golfers, 4 + 4, Group 1's link) all three stay.
//   #26  + Bet: the Match tile reads "Hole by hole" (not "1 v 1"); 1 v 1's empty match line
//        reads "Tap the 2 golfers". 2 v 2 keeps "Best ball" and the tap-order hint.
//   #27  + Bet Nassau starts at $5 a bet, presses Off, and writes $5 / $5 / $5, pressRule
//        'none' - New Action's own record (sideMatchPayloadFromTerms).
// Stub db only (tools/lib/journey.js): nothing leaves. Shots into SHOTS_038 when set.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-bet.js'))) { console.log('Consumer tree (GPS_ENABLED=0): no Bets sheet - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const SHOTS = process.env.SHOTS_038 || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function oneGroup(code) {
    const r = wizardSavedRound({ code, golfers: 2, ownerUid: 'anon-cold', thru: 18, flights: false, names: ['Test A', 'Test B'],
        overrides: { activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club' } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    r.additionalGameInstances = {}; r.additionalGames = {};
    const ids = r.players.map((p) => String(p.id));
    r.sideMatches = { '-U38nassau': { format: 'nassau', scoring: 'net', stake: 5, frontStake: 5, backStake: 5, overallStake: 5, pressRule: 'none',
        startHole: 1, createdAt: 1792000000000, teamAIds: [ids[0]], teamBIds: [ids[1]], scope: 'group', ownerGroup: 1 } };
    return r;
}
function twoGroups(code) {
    const r = wizardSavedRound({ code, golfers: 8, ownerUid: 'anon-cold', thru: 3, flights: false,
        names: ['Bob Baker', 'Manny Orozco', 'Skeens Hall', 'Paul Park', 'Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta'],
        overrides: { activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', groupSizeOverrides: { 0: 4, 1: 4 } } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    r.sideMatches = { '-U38match': { format: 'match', scoring: 'net', stake: 10, pressRule: 'none', startHole: 1, createdAt: 1792000000000,
        teamAIds: ['101'], teamBIds: ['102'], scope: 'group', ownerGroup: 1 } };
    return r;
}
const PRE = (code, me) => 'window.__hardpanDoors = true;' + iapStub({ active: true })
    + "try{localStorage.setItem('golfapp_me_" + code + "','" + me + "');sessionStorage.setItem('groupPickDismissed:" + code + "','1');}catch(e){}";

const open = [];
after(async () => { for (const j of open) { try { await j.close(); } catch (e) {} } });
async function round(code, data, me) {
    const j = await openJourney({ db: { events: { [code]: data }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} },
        viewport: { width: 393, height: 852 }, webgl: true, preScript: PRE(code, me) });
    open.push(j);
    // the iPhone 15's insets: the gap under "You: …" was exactly the top one
    await j.cdp('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34 } });
    await j.goto(fileUrl('index.html', 'game=' + code + '&group=1'), 4500);
    return j;
}
const BETS_READ = `(function(){
  var f = document.querySelector('#hp-bets iframe[data-k=bets]'); var d = f && f.contentDocument;
  if (!d || !d.getElementById('main-title')) return null;
  function vis(e){ if(!e) return false; var r=e.getBoundingClientRect(); if(!(r.width>0&&r.height>0)) return false; for(var x=e;x&&x!==d.documentElement;x=x.parentElement){var c=getComputedStyle(x); if(c.display==='none'||c.visibility==='hidden') return false;} return true; }
  var me = document.querySelector('#hp-bets .hb2-me');
  var fr = f.getBoundingClientRect(), card = d.querySelector('.container').getBoundingClientRect();
  var first = Array.prototype.filter.call(d.getElementById('main-content').children, vis)[0];
  return JSON.stringify({
    me: me.innerText.trim(), meBottom: me.getBoundingClientRect().bottom,
    cardTop: fr.top + card.top, firstTop: fr.top + first.getBoundingClientRect().top, first: (first.id || first.className),
    rootInset: getComputedStyle(d.documentElement).paddingTop, inSheet: d.documentElement.classList.contains('hp-in-sheet'),
    badge: vis(d.getElementById('bets-lock-badge')), badgeText: d.getElementById('bets-lock-badge').innerText.trim(),
    note: vis(d.getElementById('bets-matches-note')), head: d.getElementById('bets-matches-head').textContent.trim(),
    matches: d.querySelectorAll('#bets-matches .bets-match, #bets-matches > *').length
  });
})()`;
async function openBets(j) {
    await j.evaluate('HardPanRound.openBets()');
    let got = null;
    for (let i = 0; i < 40 && !got; i++) { await sleep(250); got = JSON.parse((await j.evaluate(BETS_READ)) || 'null'); if (got && !got.head) got = null; }
    await sleep(600);
    return JSON.parse(await j.evaluate(BETS_READ));
}

test('#24 one group: no gap under "You: …", no group-lock or Matches note, "⚔️ Matches"', { timeout: 90000 }, async () => {
    const j = await round('U38ONE', oneGroup('U38ONE'), '101');
    const b = await openBets(j);
    assert.match(b.me, /^You: .\$\d+ · 1 bet$/, 'the money line: ' + b.me);
    assert.equal(b.inSheet, true, 'the Bets page knows it is in the sheet');
    assert.equal(b.rootInset, '0px', 'no second status-bar inset inside the sheet');
    // The white card starts right under "You: …" - the body's own 12px, never a status bar's 59.
    assert.ok(b.cardTop - b.meBottom <= 24, 'gap under "You: …" is ' + Math.round(b.cardTop - b.meBottom) + 'px');
    assert.equal(b.badge, false, 'no "🔒 Group 1 — …" badge on a one-group round');
    assert.equal(b.note, false, 'no "Build or press a match on Matches" note on a one-group round');
    assert.equal(b.head, '⚔️ Matches', 'one group: the card is just "Matches"');
    assert.equal(b.first, 'main-title', 'the first thing in the card is the "Bets" title');
    if (SHOTS) await j.shot(path.join(SHOTS, '24-bets-one-group-after.png'));
});

test('#24 two groups: the group lock, the Matches note and "Group 1\'s Matches" all stay', { timeout: 90000 }, async () => {
    const j = await round('U38TWO', twoGroups('U38TWO'), '102');
    const b = await openBets(j);
    assert.equal(b.rootInset, '0px');
    assert.ok(b.firstTop - b.meBottom <= 48, 'no band in a two-group round either');
    assert.equal(b.badge, true, 'the lock badge shows: two groups');
    assert.match(b.badgeText, /Group 1 — your group's matches and games/);
    assert.equal(b.note, true, 'the Matches note shows: two groups');
    assert.match(b.head, /Group 1.s Matches/i);
    if (SHOTS) await j.shot(path.join(SHOTS, '24-bets-two-groups-after.png'));
});

test('#26 + Bet wording: "Hole by hole", "Tap the 2 golfers"; #27 + Bet Nassau $5 / $5 / $5, presses off', { timeout: 90000 }, async () => {
    const j = open[0];
    await j.evaluate('HardPanRound.closeBets && HardPanRound.closeBets()');
    await j.evaluate('HardPanBet.open(null, { mode: "1v1" })');
    await sleep(300);
    const tiles = JSON.parse(await j.evaluate('JSON.stringify(Array.prototype.map.call(document.querySelectorAll("#hp-bet .hb-tile"), function(t){ return t.innerText.replace(/\\s+/g, " ").trim(); }))'));
    assert.equal(tiles[0], 'Match Hole by hole', '1 v 1: Match says how it is won: ' + JSON.stringify(tiles));
    assert.ok(!tiles.some((t) => /1 v 1/.test(t)), 'no tile repeats the 1 v 1 toggle');
    await j.evaluate('document.querySelector(\'#hp-bet [data-hb-game="nassau"]\').click()');
    await sleep(200);
    assert.equal(await j.evaluate('document.querySelector("#hp-bet .hb-vs").innerText.trim()'), 'Tap the 2 golfers');
    if (SHOTS) await j.shot(path.join(SHOTS, '26-bet-1v1-after.png'));
    // 2 v 2 keeps its own words: Best ball, and the order of the taps is the sides.
    await j.evaluate('document.querySelector(\'#hp-bet [data-hb-mode="2v2"]\').click()');
    await sleep(200);
    const t2 = JSON.parse(await j.evaluate('JSON.stringify(Array.prototype.map.call(document.querySelectorAll("#hp-bet .hb-tile"), function(t){ return t.innerText.replace(/\\s+/g, " ").trim(); }))'));
    assert.equal(t2[0], 'Match Best ball');
    await j.evaluate('document.querySelector(\'#hp-bet [data-hb-game="match"]\').click()');
    await sleep(200);
    assert.equal(await j.evaluate('document.querySelector("#hp-bet .hb-vs").innerText.trim()'), 'Tap the golfers in the order of the sides');
    // #27, + Bet's half, on the thru-3 round (nothing played to confirm): Nassau 1 v 1,
    // Bob v Manny -> $5 picked, presses Off -> the record.
    await j.evaluate('HardPanBet.close && HardPanBet.close()');
    const k = open[1];
    await k.evaluate('HardPanRound.closeBets && HardPanRound.closeBets()');
    await k.evaluate('HardPanBet.open(null, { mode: "1v1" })');
    await sleep(300);
    await bet(k);
});
async function bet(j) {
    await j.evaluate('document.querySelector(\'#hp-bet [data-hb-mode="1v1"]\').click()');
    await j.evaluate('document.querySelector(\'#hp-bet [data-hb-game="nassau"]\').click()');
    await j.evaluate('document.querySelector(\'#hp-bet [data-hb-pick="101"]\').click()');
    await j.evaluate('document.querySelector(\'#hp-bet [data-hb-pick="102"]\').click()');
    await sleep(150);
    await j.evaluate('document.querySelector(\'#hp-bet [data-hb="next"]\').click()');
    await sleep(250);
    const s2 = JSON.parse(await j.evaluate('JSON.stringify({ stake: (document.querySelector("#hp-bet .hb-chip.on[data-hb-stake]") || {}).innerText, press: (document.querySelector("#hp-bet [data-hb-press].on") || {}).innerText })'));
    assert.deepEqual(s2, { stake: '$5', press: 'Off' }, '+ Bet Nassau starts at $5, presses Off');
    if (SHOTS) await j.shot(path.join(SHOTS, '27-bet-nassau-amount.png'));
    const t0 = Date.now();
    await j.evaluate('document.querySelector(\'#hp-bet [data-hb="start"]\').click()');
    await sleep(600);
    const sm = JSON.parse(await j.evaluate("JSON.stringify((function(){ var sm = window.__DB.events.U38TWO.sideMatches || {}; var k = Object.keys(sm).filter(function(x){ return x !== '-U38match'; }).sort().pop(); return k ? sm[k] : null; })())"));
    assert.ok(sm, 'the bet was written to the stub');
    assert.ok(sm.createdAt >= t0 - 5000);
    assert.deepEqual([sm.frontStake, sm.backStake, sm.overallStake, sm.pressRule], [5, 5, 5, 'none']);
    assert.deepEqual(sm, { format: 'nassau', scoring: 'net', teamAIds: ['101'], teamBIds: ['102'], startHole: 4, createdAt: sm.createdAt,
        scope: 'group', ownerGroup: 1, stake: 5, pressRule: 'none', frontStake: 5, backStake: 5, overallStake: 5, autoPressStake: null },
        'the + Bet Nassau record: $5 / $5 / $5, no presses, counted from now (hole 4)');
}
