// ============================================================================
// URGENT-018 (helper E) - GAMES, BETS AND THE WEEKLY GAME, IN PLACE (features.simpleFlow),
// IN REAL CHROME, iPhone 15 size. Stub db only.
//
//   1  Weekly Game sheet (HardPanBet.openWeekly - Round settings › Weekly Game): buy-in, KP $
//      and holes, net, skins - saved as moneyPool in Round Setup's own shape, the keys the form
//      does not own kept; an over-budget pot refused with validateMoneyPool's reason (nothing
//      written); Off writes moneyPool: null. Same page, same hole, no reload.
//   2  Add a game › Nassau: the + Bet sheet over the round (no sidematches.html, no Round Setup).
//      Add a game › KP pool / Weekly game: the Weekly Game sheet.
//   3  Add a game with one golfer › Nassau: the Add golfer sheet first, then the + Bet sheet -
//      never Round Setup's Players / Money steps.
//   4  A bet from the Bets sheet (its row in the Bets frame): Change -> saved at the same key;
//      Remove -> gone. Back on the same screen.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-bet.js'))) { console.log('Consumer tree: no + Bet sheet - skipped.'); process.exit(0); }
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const PRE = (code) => 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true })
    + "try{localStorage.setItem('golfapp_me_" + code + "','101');sessionStorage.setItem('groupPickDismissed:" + code + "','1');}catch(e){}";
const STATE = "JSON.stringify({ url: location.pathname.split('/').pop() + location.search, nav: performance.getEntriesByType('navigation').length, hole: window.HardPanGps ? HardPanGps.hole() : null, side: window.HardPanGps ? HardPanGps.side() : null,"
    + " bet: !!document.querySelector('#hp-bet.open'), weekly: !!document.querySelector('#hp-weekly.open'), addg: !!document.querySelector('#hp-addg.open'), steps: !!document.querySelector('.wizard-step:not([style*=\"none\"]) .step-number, #sf') })";

function harness(code, round) {
    const h = { j: null };
    h.ev = async (x) => h.j.evaluate(x);
    h.st = async () => JSON.parse(await h.ev(STATE));
    h.click = async (sel) => assert.ok(await h.ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.click(); return true;})()'), 'no ' + sel);
    h.type = async (sel, v) => assert.ok(await h.ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.value=' + JSON.stringify(v) + '; e.dispatchEvent(new Event("input",{bubbles:true})); return true;})()'), 'no ' + sel);
    h.until = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 8000)) { if (await h.ev(expr)) return true; await sleep(150); } return false; };
    h.open = async () => {
        h.j = await openJourney({ db: { events: { [code]: round }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} }, viewport: { width: 393, height: 852 }, webgl: true, preScript: PRE(code) });
        await h.j.goto(fileUrl('index.html', 'game=' + code + '&group=1'), 4500);
    };
    return h;
}

describe('Weekly Game, Add a game, bet edit / remove - in place', () => {
    const CODE = 'MONEY18';
    const r = wizardSavedRound({ code: CODE, golfers: 4, ownerUid: 'anon-cold', thru: 3, flights: false,
        names: ['Manny Orozco', 'Bob Baker', 'Skeens Hall', 'Paul Park'], overrides: { groupSizeOverrides: { 0: 4 } } });
    r.moneyPool = { enabled: true, buyIn: 20, kp: { amount: 20, holes: [3, 7] }, net: { amount: 40, places: [60, 40] }, skins: { mode: 'remainder', scoring: 'net', carryOver: true }, participantIds: ['101', '102', '103', '104'] };
    r.sideMatches = { M1: { format: 'match', scoring: 'net', teamAIds: ['101'], teamBIds: ['102'], startHole: 1, createdAt: 1, stake: 10, pressRule: 'none' } };
    const h = harness(CODE, r);
    before(async () => { await h.open(); });
    after(async () => { if (h.j) await h.j.close(); });

    test('Weekly Game sheet: change buy-in + a KP hole; refused when over budget; Off; same page, same hole', { timeout: 60000 }, async () => {
        const s0 = await h.st();
        assert.ok(await h.ev('HardPanBet.openWeekly()'));
        await sleep(300);
        let s = await h.st();
        assert.equal(s.weekly, true);
        assert.match(await h.ev("document.getElementById('hp-weekly').innerText"), /Buy-in[\s\S]*Pot\n\$80[\s\S]*KP money/);
        // Over budget: KP $100 on an $80 pot -> refused, nothing written.
        await h.type('[data-wk-in="kpAmt"]', '100');
        await h.click('#hp-weekly [data-wk="save"]');
        await sleep(300);
        assert.match(await h.ev("document.getElementById('wk-why').textContent"), /NOT SAVED[\s\S]*over budget/);
        assert.equal(await h.ev('currentData.moneyPool.kp.amount'), 20, 'nothing written');
        // A real change: $30 in, KP $20 on 3, 7 and 12.
        await h.type('[data-wk-in="kpAmt"]', '20');
        await h.type('[data-wk-in="buyIn"]', '30');
        await h.click('#hp-weekly [data-wk-kp="12"]');
        await h.click('#hp-weekly [data-wk="save"]');
        assert.ok(await h.until("!document.querySelector('#hp-weekly.open') && currentData.moneyPool.buyIn === 30", 6000), 'saved and closed');
        const mp = JSON.parse(await h.ev('JSON.stringify(currentData.moneyPool)'));
        assert.deepEqual(mp, { enabled: true, buyIn: 30, kp: { amount: 20, holes: [3, 7, 12] }, net: { amount: 40, places: [60, 40] }, skins: { mode: 'remainder', scoring: 'net', carryOver: true }, participantIds: ['101', '102', '103', '104'] },
            'Round Setup\'s shape, the participantIds it does not own kept');
        s = await h.st();
        assert.deepEqual([s.url, s.nav, s.hole, s.steps], [s0.url, 1, s0.hole, false]);
        // Off -> moneyPool: null (what an unticked box saves); then back on.
        await h.ev('HardPanBet.openWeekly()'); await sleep(200);
        await h.click('#hp-weekly [data-wk-set="on"][data-v="false"]');
        await h.click('#hp-weekly [data-wk="save"]');
        assert.ok(await h.until('!currentData.moneyPool', 6000), 'Weekly Game off');
        await h.ev("db.ref('events/" + CODE + "/moneyPool').set(" + JSON.stringify(mp) + ")");
        await sleep(300);
    });

    test('Add a game › Nassau: the + Bet sheet; › KP pool / Weekly game: the Weekly Game sheet - no page change', { timeout: 60000 }, async () => {
        const s0 = await h.st();
        await h.ev('HardPanDoors.openAddGame()'); await sleep(300);
        await h.click('#fd-addgame [data-ag-all="nassau"]');
        await sleep(400);
        let s = await h.st();
        assert.equal(s.bet, true, 'the + Bet sheet');
        assert.match(await h.ev("document.getElementById('hp-bet').innerText"), /Nassau/);
        assert.equal(await h.ev("getComputedStyle(document.getElementById('fd-addgame')).display"), 'none');
        await h.ev('HardPanBet.close()');
        await h.ev('HardPanDoors.openAddGame()'); await sleep(300);
        await h.click('#fd-addgame [data-ag-all="kp"]');
        await sleep(300);
        s = await h.st();
        assert.equal(s.weekly, true, 'the Weekly Game sheet');
        await h.ev('HardPanBet.closeWeekly()');
        s = await h.st();
        assert.deepEqual([s.url, s.nav], [s0.url, 1]);
    });

    test('Round settings › QUICK EDITS › Weekly Game: the sheet', { timeout: 60000 }, async () => {
        await h.ev("(function(){ if (typeof toggleRoundSheet === 'function') toggleRoundSheet(true); return 1; })()");
        assert.ok(await h.until("!!document.querySelector('#hp-quick [data-hq=\"weekly\"]')", 6000), 'Weekly Game in QUICK EDITS');
        await h.click('#hp-quick [data-hq="weekly"]');
        await sleep(300);
        assert.equal((await h.st()).weekly, true);
        await h.ev('HardPanBet.closeWeekly()');
    });

    test('the map\'s Add a game › Full game setup: the Add a game list over the map (no Round Setup)', { timeout: 60000 }, async () => {
        const s0 = await h.st();
        await h.ev("(function(){ var b=(document.querySelector('#hp-card-bet [data-hp-bar=gps]') || document.getElementById('fd-gps-btn')); if(b) b.click(); return 1; })()");
        assert.ok(await h.until("!!document.querySelector('#gps-overlay .gps-addgame [data-ag-go=\"full\"]')", 10000), 'the map is up');
        await h.ev("(function(){ var g=document.querySelector('#gps-overlay .gps-addgame'); g.style.display=''; g.querySelector('[data-ag-go=\"full\"]').click(); return 1; })()");
        await sleep(400);
        assert.equal(await h.ev("getComputedStyle(document.getElementById('fd-addgame')).display !== 'none'"), true, 'the Add a game list');
        const s = await h.st();
        assert.deepEqual([s.url, s.nav], [s0.url, 1]);
        await h.ev('HardPanDoors.closeAddGame()');
        await h.ev("(function(){ var b=document.querySelector('[data-hp-gpsbar=card]') || document.querySelector('[data-hp-bar=card]'); if (b) b.click(); else HardPanGps.showSide('bets'); return 1; })()");
        await sleep(500);
    });

    test('a bet from the Bets sheet: Change saves at the same key; Remove takes it off; back on the same screen', { timeout: 60000 }, async () => {
        const s0 = await h.st();
        await h.ev("HardPanRound.openBets ? HardPanRound.openBets('bets') : HardPanBet.openBets()");
        assert.ok(await h.until("(function(){ var f=document.querySelector('iframe[data-k=\"bets\"]'); return !!(f && f.contentDocument && f.contentDocument.querySelector('[data-sm-id=\"M1\"]')); })()", 15000), 'the Bets frame lists the bet');
        await h.ev("(function(){ var f=document.querySelector('iframe[data-k=\"bets\"]'); f.contentDocument.querySelector('[data-sm-id=\"M1\"]').click(); return 1; })()");
        assert.ok(await h.until("!!document.querySelector('#hp-bet.open')", 4000), 'the + Bet sheet over Bets, to change it');
        assert.match(await h.ev("document.getElementById('hp-bet').innerText"), /Manny vs Bob[\s\S]*Save changes[\s\S]*Remove this bet/, 'pre-filled, to change or remove');
        // The stake: $20.
        assert.ok(await h.ev("(function(){ var c=Array.prototype.filter.call(document.querySelectorAll('#hp-bet button'), function(b){ return b.textContent.trim() === '$20'; })[0]; if(!c) return false; c.click(); return true; })()"), 'a $20 chip');
        await sleep(200);
        await h.click('#hp-bet [data-hb="start"]');
        await sleep(300);
        await h.ev("(function(){ var c=document.querySelector('#hp-bet [data-hb=\"confirm-add\"]'); if(c) c.click(); return 1; })()");
        assert.ok(await h.until("currentData.sideMatches && currentData.sideMatches.M1 && currentData.sideMatches.M1.stake === 20", 6000), 'changed at the same key: ' + await h.ev('JSON.stringify(currentData.sideMatches)'));
        assert.equal(await h.ev('Object.keys(currentData.sideMatches).length'), 1);
        // Remove.
        await h.ev("HardPanBet.open(null, { editId: 'M1', returnTo: 'bets' })"); await sleep(300);
        await h.click('#hp-bet [data-hb="remove"]'); await sleep(200);
        await h.click('#hp-bet [data-hb="remove-yes"]');
        assert.ok(await h.until('!currentData.sideMatches || !currentData.sideMatches.M1', 6000), 'removed');
        const s = await h.st();
        assert.deepEqual([s.url, s.nav, s.bet], [s0.url, 1, false]);
        assert.equal(await h.ev("document.body.classList.contains('hp-bets-open')"), true, 'back on Bets');
    });
});

describe('Add a game with one golfer: Add golfer first, then the game - in place', () => {
    const CODE = 'SOLO18';
    const r = wizardSavedRound({ code: CODE, golfers: 1, ownerUid: 'anon-cold', thru: 2, flights: false, names: ['Manny'], overrides: { groupSizeOverrides: { 0: 1 }, handicapBasis: 'as-entered' } });
    delete r.moneyPool; delete r.sideMatches; r.additionalGames = {}; r.additionalGameInstances = {}; r.skinsBuyIn = 5;
    const h = harness(CODE, r);
    before(async () => { await h.open(); });
    after(async () => { if (h.j) await h.j.close(); });

    test('Nassau with one golfer: the Add golfer sheet, then the + Bet sheet; never Round Setup', { timeout: 60000 }, async () => {
        const s0 = await h.st();
        await h.ev('HardPanDoors.openAddGame()'); await sleep(300);
        await h.click('#fd-addgame [data-ag-all="nassau"]');
        await sleep(400);
        let s = await h.st();
        assert.equal(s.addg, true, 'the Add golfer sheet first');
        assert.equal(s.url, s0.url);
        await h.type('#ag-name', 'Bob');
        await h.type('#ag-hcp', '5');
        await h.click('#hp-addg [data-ag="save"]');
        assert.ok(await h.until("!!document.querySelector('#hp-bet.open')", 8000), 'then the + Bet sheet');
        assert.match(await h.ev("document.getElementById('hp-bet').innerText"), /Bob/);
        s = await h.st();
        assert.deepEqual([s.url, s.nav, s.steps], [s0.url, 1, false], 'no page change, no setup steps');
        assert.equal(await h.ev('currentData.players.length'), 2);
    });

    test('Add a game › Side bets: the + Bet sheet; Bets › "No Skins game … Round Setup": the + Bet Skins; a Press link comes back (hpback)', { timeout: 60000 }, async () => {
        const s0 = await h.st();
        await h.ev('HardPanDoors.openAddGame()'); await sleep(300);
        await h.click('#fd-addgame [data-ag-all="side"]');
        await sleep(300);
        assert.equal((await h.st()).bet, true, 'Side bets -> the + Bet sheet');
        await h.ev('HardPanBet.close()');
        await h.ev("HardPanRound.openBets ? HardPanRound.openBets('bets') : HardPanBet.openBets()");
        const F = "document.querySelector('iframe[data-k=\"bets\"]')";
        assert.ok(await h.until("(function(){ var f=" + F + "; if(!(f && f.contentDocument)) return false; return Array.prototype.some.call(f.contentDocument.querySelectorAll('a[href*=\"admin.html\"]'), function(a){ return /Round Setup/.test(a.textContent); }); })()", 15000), 'the Bets frame shows the Round Setup link');
        await h.ev("(function(){ var f=" + F + "; Array.prototype.filter.call(f.contentDocument.querySelectorAll('a[href*=\"admin.html\"]'), function(a){ return /Round Setup/.test(a.textContent); })[0].click(); return 1; })()");
        assert.ok(await h.until("!!document.querySelector('#hp-bet.open')", 4000), 'the + Bet sheet');
        assert.match(await h.ev("document.getElementById('hp-bet').innerText"), /Skins/);
        const s = await h.st();
        assert.deepEqual([s.url, s.nav], [s0.url, 1], 'no page change');
        await h.ev('HardPanBet.close()');
        assert.match(await h.ev("sideMatchPressHref('X1')"), /sidematches\.html\?game=SOLO18&group=1&hpback=1&press=X1$/);
    });
});

