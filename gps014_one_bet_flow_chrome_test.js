// ============================================================================
// URGENT-014 - SIDE BETS: ONE FLOW FROM EVERYWHERE (features.simpleFlow), IN REAL CHROME.
//
// Group 1's link on an 8-golfer round, Manny (102), thru 3, a GPS Map subscriber. Stub db.
//   1  EVERY entry point opens the SAME "+ Bet" sheet: the GPS, the card, the Round Menu,
//      Finish & settle up, the Bets sheet's "+ Add a bet", and - on their own pages - the
//      Bets tab's "+ Add a bet", Results' "+ Add a bet on this round", the Matches page's
//      SIDE BETS (the old New Action) and CHALLENGE SOMEBODY.
//   2  1 v 1 / 2 v 2 first: 1v1 Match, 2v2 Match, 2v2 Hi-Lo, 1v1 Nassau (presses Auto @ 2
//      down), 1v1 Stroke play - each record exactly what New Action's builder makes.
//   3  A retroactive Nassau (from hole 1 on hole 4): the confirm, then the record.
//   4  After Start: a GPS round -> the GPS on the same hole, the same map (no reload); no map
//      -> the card; from the Bets page -> back to it; the toast "Bet added: ...".
//   5  A tap on a bet on the Bets tab: the sheet pre-filled ("Change this bet"); Save keeps its
//      key, its presses and when it was made; Remove asks "Everyone in the bet agreed?" first.
// Screenshots (e-*.png) into SHOTS_017 when it is set.
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

const CODE = 'ONE014';
const SHOTS = process.env.SHOTS_017 || '';
const r = wizardSavedRound({ code: CODE, golfers: 8, ownerUid: 'anon-cold', thru: 3, flights: false,
    names: ['Bob Baker', 'Manny Orozco', 'Skeens Hall', 'Paul Park', 'Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta'],
    overrides: { activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', groupSizeOverrides: { 0: 4, 1: 4 } } });
delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
// A bet already on the round (to change / remove), with a press hung on it.
r.sideMatches = { OLD1: { format: 'match', scoring: 'net', teamAIds: ['102'], teamBIds: ['101'], startHole: 1, createdAt: 111, stake: 10, pressRule: 'none',
    presses: { P1: { baseId: 'base', startHole: 3, stake: 10 } } } };
// And a skins game added through the sheet earlier - a round game (additionalGameInstances).
r.additionalGameInstances = { SK1: { format: 'skins', enabled: true, startHole: 1, createdAt: 222, scope: 'group', ownerGroup: 1, skinsBuyIn: 5, skinsPotFormat: 'gross',
    skinsScoring: 'gross', skinsCarryOver: true, participantIds: ['101', '102', '103', '104'] } };
const DB = { events: { [CODE]: r }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} };
const PRE = 'window.__hardpanDoors = true;' + iapStub({ active: true })
    + "try{localStorage.setItem('golfapp_me_" + CODE + "','102');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');localStorage.setItem('hardpan_round_side','bets|" + CODE + "');}catch(e){}";
const Q = 'game=' + CODE + '&group=1';
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
let j;
const ev = async (x) => j.evaluate(x);
const shot = async (name) => { if (SHOTS) await j.shot(path.join(SHOTS, 'e-' + name + '.png')); };
async function tapIn(sel) { assert.ok(await ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.click(); return true;})()'), 'no ' + sel); }
async function pick(ids) { for (const id of ids) await tapIn('#hp-bet [data-hb-pick="' + id + '"]'); }
// THE sheet: open, with the 1 v 1 / 2 v 2 switch at the top.
const SHEET = '(function(){ var r = document.getElementById("hp-bet"); return !!(r && r.classList.contains("open") && r.querySelector("[data-hb-mode=\\"1v1\\"]") && r.querySelector("[data-hb-mode=\\"2v2\\"]")); })()';
const lastSide = "JSON.stringify((function(){ var sm = window.__DB.events['" + CODE + "'].sideMatches || {}; var ks = Object.keys(sm).filter(function(k){ return k !== 'OLD1'; }).sort(); return ks.length ? sm[ks[ks.length - 1]] : null; })())";
const TOAST = '(function(){ var t = Array.prototype.slice.call(document.querySelectorAll(".ui-toast, .hp-return-toast")).pop(); return t ? t.textContent.trim() : ""; })()';
// Back on a page: wait for it, then its toast (polled - the page loads first).
async function toastAfter(re, ms) {
    const until = Date.now() + (ms || 8000); let t = '';
    while (Date.now() < until) { try { t = await ev(TOAST); if (re.test(t)) return t; } catch (e) {} await sleep(250); }
    return t;
}
const strip = (o) => { const c = Object.assign({}, o); delete c.createdAt; return c; };
const terms1 = (t, a, b) => CH.sideMatchPayloadFromTerms(Object.assign({ scoring: 'gross', startHole: 4, pressRule: 'none' }, t), { teamAIds: a, teamBIds: b, startHole: t.startHole || 4, now: 1, scope: 'group', ownerGroup: 1 });

before(async () => {
    j = await openJourney({ db: DB, viewport: { width: 393, height: 852 }, webgl: true, preScript: PRE });
    await j.goto(fileUrl('index.html', Q), 4500);
    await ev("(function(){ var b=(document.querySelector('#hp-card-bet [data-hp-bar=gps]') || document.getElementById('fd-gps-btn')); if(b) b.click(); return 1; })()");
    await sleep(2500);
    assert.ok(await ev('(function(){ var cv=document.querySelector("#gps-overlay canvas"); if(!cv) return false; cv.__hp014 = "same-map"; return true; })()'));
});
after(async () => { if (j) await j.close(); });

test('1a: on the round - GPS, card, Round Menu, Finish & settle up, the Bets sheet - all open the ONE sheet', { timeout: 90000 }, async () => {
    const ways = {
        // URGENT-023: no "+ Bet" on the GPS / card bars - the Menu's first tile, from either side.
        gps: 'HardPanRound.toGps(); HardPanRound.openMenu(); document.querySelector("#hp-sheet [data-hs-tile=bet]").click()',
        card: 'HardPanRound.toCard(); HardPanRound.openMenu(); document.querySelector("#hp-sheet [data-hs-tile=bet]").click()',
        menu: 'HardPanRound.openMenu(); document.querySelector("#hp-sheet [data-hs-tile=bet]").click()',
        finish: 'HardPanRound.openFinish(); document.querySelector("#hp-sheet [data-hs=add-bet]").click()'
    };
    for (const k of Object.keys(ways)) {
        await ev('HardPanBet.close(); HardPanRound.closeSheet(true); HardPanRound.closeBets(); ' + ways[k] + '; 1');
        assert.equal(await ev(SHEET), true, k + ' did not open the sheet');
    }
    await shot('sheet');
    await ev('HardPanBet.close(); HardPanRound.openBets(); 1');
    await sleep(2500);
    assert.ok(await ev('(function(){ var f=document.querySelector("#hp-bets iframe[data-k=bets]"); var b=f && f.contentDocument.getElementById("hp-add-bet"); if(!b) return false; b.click(); return true; })()'), 'no "+ Add a bet" in the Bets sheet');
    assert.equal(await ev(SHEET), true, 'Bets "+ Add a bet" did not open the sheet');
    assert.equal(await ev('document.body.classList.contains("hp-bets-open")'), true, 'Bets stays under it');
    await ev('HardPanBet.close(); HardPanRound.closeBets(); 1');
});

test('2+3: 1v1 Match, 2v2 Match, 2v2 Hi-Lo, 1v1 Nassau with presses, 1v1 Stroke play, a retroactive Nassau - New Action\'s records', { timeout: 90000 }, async () => {
    const run = async (mode, game, ids, stake, extra) => {
        await ev('HardPanBet.close(); HardPanRound.toCard(); HardPanBet.open(); 1');
        await tapIn('#hp-bet [data-hb-mode="' + mode + '"]');
        await tapIn('#hp-bet [data-hb-game="' + game + '"]');
        await pick(ids);
        await tapIn('#hp-bet [data-hb="next"]');
        await tapIn('#hp-bet [data-hb-stake="' + stake + '"]');
        await tapIn('#hp-bet [data-hb-scoring="gross"]');
        if (extra) await extra();
        await tapIn('#hp-bet [data-hb="start"]');
        if (await ev('!!document.querySelector("#hp-bet.open [data-hb=confirm-add]")')) await tapIn('#hp-bet [data-hb="confirm-add"]');
        await sleep(300);
        return JSON.parse(await ev(lastSide));
    };
    let got = await run('1v1', 'match', ['102', '103'], 10);
    assert.deepEqual(strip(got), strip(terms1({ format: 'match', stake: 10 }, ['102'], ['103'])), '1v1 Match');
    got = await run('2v2', 'match', ['102', '101', '103', '104'], 10);
    assert.deepEqual(strip(got), strip(terms1({ format: 'match', stake: 10 }, ['102', '101'], ['103', '104'])), '2v2 Match');
    got = await run('2v2', 'hilo', ['102', '101', '103', '104'], 5);
    assert.deepEqual(strip(got), strip(terms1({ format: 'hilo', stake: 5 }, ['102', '101'], ['103', '104'])), '2v2 Hi-Lo');
    got = await run('1v1', 'nassau', ['102', '104'], 5, async () => { await tapIn('#hp-bet [data-hb-press="2down"]'); });
    const nas = JSON.parse(await ev('JSON.stringify(sideMatchPayloadFromTerms({ format: "nassau", scoring: "gross", startHole: 4, stake: 5, pressRule: "2down", frontStake: 5, backStake: 5, overallStake: 5, autoPressStake: null }, { teamAIds: ["102"], teamBIds: ["104"], startHole: 4, now: 1, scope: "group", ownerGroup: 1 }))'));
    assert.deepEqual(strip(got), strip(nas), '1v1 Nassau, presses Auto @ 2 down');
    got = await run('1v1', 'stroke', ['102', '103'], 20);
    assert.deepEqual(strip(got), strip(CH.sideMatchPayloadFromTerms({ format: 'stroke', scoring: 'gross', startHole: 4, holeStake: 0, overallStake: 20, tieRule: 'void', overallMode: 'stroke', segment: 'full' },
        { teamAIds: ['102'], teamBIds: ['103'], startHole: 4, now: 1, scope: 'group', ownerGroup: 1 })), '1v1 Stroke play');
    // RETROACTIVE: a Nassau from hole 1 on hole 4 - the confirm, then the hole-1 record.
    let asked = false;
    got = await run('1v1', 'nassau', ['102', '101'], 5, async () => {
        await ev('(function(){ var s = document.querySelector("#hp-bet .hb-from"); s.value = "1"; s.dispatchEvent(new Event("change", { bubbles: true })); return 1; })()');
        await tapIn('#hp-bet [data-hb="start"]');
        asked = /Add this bet for holes already played\?/.test(await ev('document.querySelector("#hp-bet .hb-panel").innerText'));
        await shot('retro-confirm');
        await tapIn('#hp-bet [data-hb="confirm-cancel"]');
    });
    assert.equal(asked, true, 'no confirm for a start before now');
    assert.equal(got.startHole, 1);
    assert.equal(got.format, 'nassau');
    // URGENT-015: a Nassau side bet does not turn this Stroke Play round into "Match Play" (header + card).
    await ev('HardPanRound.toCard(); 1');
    await sleep(500);
    const hdr = JSON.parse(await ev('JSON.stringify({ sub: document.getElementById("format-subtitle").textContent, card: (document.getElementById("landing-scoring") || {}).textContent })'));
    assert.match(hdr.sub, /STROKE PLAY \((NET|GROSS)\)$/, 'header: ' + hdr.sub);
    assert.doesNotMatch(hdr.sub + ' ' + hdr.card, /Match Play|MATCH PLAY/i, JSON.stringify(hdr));
});

test('4: after Start - a GPS round goes to the GPS on the same hole and map; no map -> the card; the toast', { timeout: 60000 }, async () => {
    await ev('HardPanRound.toCard(); 1');
    await sleep(200);
    await ev('HardPanBet.open(); 1');
    await tapIn('#hp-bet [data-hb-mode="1v1"]');
    await tapIn('#hp-bet [data-hb-game="match"]');
    await pick(['102', '101']);
    await tapIn('#hp-bet [data-hb="next"]');
    await tapIn('#hp-bet [data-hb="start"]');
    await sleep(300);
    const s = JSON.parse(await ev('JSON.stringify({ side: HardPanGps.side(), hole: HardPanGps.hole(), card: currentViewedHole, mark: (document.querySelector("#gps-overlay canvas")||{}).__hp014, toast: Array.prototype.map.call(document.querySelectorAll(".ui-toast"), function(t){ return t.innerText; }).pop() })'));
    assert.deepEqual([s.side, s.hole, s.card, s.mark], ['gps', 4, 4, 'same-map']);
    assert.match(s.toast, /^Bet added: Manny vs Bob · \$10 Match$/);
    await shot('after-start-gps');
    // A tap on the toast opens the bet.
    await ev('(function(){ var t = Array.prototype.slice.call(document.querySelectorAll(".ui-toast")).pop(); t.click(); return 1; })()');
    assert.match(await ev('document.querySelector("#hp-bet .hb-panel").innerText'), /Save changes[\s\S]*Remove this bet/, 'the toast opens the bet (pre-filled)');
    await ev('HardPanBet.close(); 1');
    // No map on this phone (GPS Map off): the card.
    const c = await ev('(function(){ var g = HardPanGps, keep = g.canMap; g.canMap = function(){ return false; }; HardPanBet.open(); '
        + 'document.querySelector("#hp-bet [data-hb-mode=\\"1v1\\"]").click(); document.querySelector("#hp-bet [data-hb-game=\\"match\\"]").click(); '
        + '["102","104"].forEach(function(id){ document.querySelector("#hp-bet [data-hb-pick=\\"" + id + "\\"]").click(); }); '
        + 'document.querySelector("#hp-bet [data-hb=next]").click(); document.querySelector("#hp-bet [data-hb=start]").click(); var side = g.side(); g.canMap = keep; return side; })()');
    assert.equal(c, 'bets', 'no map: back to the card');
});

test('1b+4+5: the Bets page - "+ Add a bet" and a tap on a bet open the sheet on the round; Save comes back; edit keeps the record; Remove asks first', { timeout: 120000 }, async () => {
    // + Add a bet on the Bets tab -> the round's sheet -> Start -> back on the Bets tab.
    await j.goto(fileUrl('skins.html', Q), 3500);
    await shot('bets-tab');
    await tapIn('#hp-add-bet');
    await sleep(4500);
    assert.match(await ev('location.href'), /index\.html/);
    assert.equal(await ev(SHEET), true, 'Bets tab "+ Add a bet" did not open the sheet');
    assert.doesNotMatch(await ev('location.search'), /hpbet/, 'the URL keeps no hpbet (a reload does not reopen it)');
    await tapIn('#hp-bet [data-hb-mode="1v1"]');
    await tapIn('#hp-bet [data-hb-game="match"]');
    await pick(['102', '103']);
    await tapIn('#hp-bet [data-hb="next"]');
    await tapIn('#hp-bet [data-hb="start"]');
    assert.match(await toastAfter(/^Bet added/), /^Bet added: Manny vs Skeens · \$10 Match$/, 'no "Bet added" toast back on the Bets tab');
    assert.match(await ev('location.href'), /skins\.html/, 'not back on the Bets tab');
    // A tap on the old bet -> the sheet pre-filled; $20; Save -> same key, its press and createdAt kept.
    assert.ok(await ev('!!document.querySelector("#bets-matches [data-sm-id=\\"OLD1\\"]")'), 'the bet is not tappable');
    await tapIn('#bets-matches [data-sm-id="OLD1"]');
    await sleep(4500);
    const p = await ev('document.querySelector("#hp-bet .hb-panel").innerText');
    assert.match(p, /Match · \$ a side/);
    assert.match(p, /Save changes/);
    assert.match(p, /Remove this bet/);
    await shot('edit');
    await tapIn('#hp-bet [data-hb-stake="20"]');
    await tapIn('#hp-bet [data-hb="start"]');
    if (await ev('!!document.querySelector("#hp-bet.open [data-hb=confirm-add]")')) await tapIn('#hp-bet [data-hb="confirm-add"]');
    await sleep(3500);
    assert.match(await ev('location.href'), /skins\.html/);
    const ed = JSON.parse(await ev("JSON.stringify(window.__DB.events['" + CODE + "'].sideMatches.OLD1)"));
    assert.equal(ed.stake, 20);
    assert.equal(ed.createdAt, 111);
    assert.ok(ed.presses && ed.presses.P1, 'the press hung on it was lost');
    // Remove: "Everyone in the bet agreed?" - Cancel keeps it; Yes removes it.
    await tapIn('#bets-matches [data-sm-id="OLD1"]');
    await sleep(4500);
    await tapIn('#hp-bet [data-hb="remove"]');
    assert.match(await ev('document.querySelector("#hp-bet .hb-panel").innerText'), /Everyone in the bet agreed\?/);
    await shot('remove');
    await tapIn('#hp-bet [data-hb="remove-no"]');
    assert.ok(await ev("!!window.__DB.events['" + CODE + "'].sideMatches.OLD1"));
    await tapIn('#hp-bet [data-hb="remove"]');
    await tapIn('#hp-bet [data-hb="remove-yes"]');
    await sleep(3500);
    assert.equal(await ev("!!window.__DB.events['" + CODE + "'].sideMatches.OLD1"), false, 'not removed');
    assert.match(await ev('location.href'), /skins\.html/);
});

test('1c: Results "+ Add a bet on this round", Matches SIDE BETS and CHALLENGE SOMEBODY open the same sheet', { timeout: 120000 }, async () => {
    const pages = [['settlement.html', '#hp-add-bet'], ['sidematches.html', 'button.btn-primary'], ['sidematches.html', '#sm-challenge-btn']];
    for (const [page, sel] of pages) {
        await j.goto(fileUrl(page, Q), 3500);
        const ok = await ev('(function(){ var b = Array.prototype.filter.call(document.querySelectorAll(' + JSON.stringify(sel) + '), function(x){ return /SIDE BETS|CHALLENGE|Add a bet/.test(x.textContent); })[0]; if (!b) return false; b.click(); return true; })()');
        assert.ok(ok, page + ': no ' + sel);
        await sleep(4500);
        assert.match(await ev('location.href'), /index\.html/, page + ' did not go to the round');
        assert.equal(await ev(SHEET), true, page + ' ' + sel + ': not the sheet');
        assert.equal(await ev('!!document.querySelector("#sidematch-modal[style*=flex]")'), false);
        await tapIn('#hp-bet [data-hb="close"]');
        await sleep(3000);
        assert.match(await ev('location.href'), new RegExp(page.replace('.', '\\.')), 'Close did not go back to ' + page);
    }
});

test('6: skins (a round game) - tapped on the Bets tab: the sheet pre-filled; Save keeps it (carry-over, createdAt); Remove; the toasts come back with it', { timeout: 120000 }, async () => {
    await j.goto(fileUrl('skins.html', Q), 3500);
    assert.ok(await ev('!!document.querySelector("#bets-games .bets-game[data-game-key=\\"SK1\\"][data-hp-bet]")'), 'the skins row is not tappable');
    await tapIn('#bets-games .bets-game[data-game-key="SK1"]');
    await sleep(4500);
    const p = await ev('document.querySelector("#hp-bet .hb-panel").innerText');
    assert.match(p, /Skins · \$ each/);
    assert.match(p, /Save changes[\s\S]*Remove this bet/);
    assert.equal(await ev('document.querySelector("#hp-bet [data-hb-stake=\\"5\\"]").classList.contains("on")'), true, 'the buy-in is not pre-filled');
    await shot('edit-skins');
    await tapIn('#hp-bet [data-hb-stake="10"]');
    await tapIn('#hp-bet [data-hb="start"]');
    if (await ev('!!document.querySelector("#hp-bet.open [data-hb=confirm-add]")')) await tapIn('#hp-bet [data-hb="confirm-add"]');
    assert.match(await toastAfter(/^Bet changed/), /^Bet changed: .+ · \$10 Skins$/);
    assert.match(await ev('location.href'), /skins\.html/);
    const sk = JSON.parse(await ev("JSON.stringify(window.__DB.events['" + CODE + "'].additionalGameInstances.SK1)"));
    assert.deepEqual([sk.skinsBuyIn, sk.createdAt, sk.skinsCarryOver, sk.format, sk.startHole], [10, 222, true, 'skins', 1]);
    assert.deepEqual(sk.participantIds, ['101', '102', '103', '104']);
    await tapIn('#bets-games .bets-game[data-game-key="SK1"]');
    await sleep(4500);
    await tapIn('#hp-bet [data-hb="remove"]');
    assert.match(await ev('document.querySelector("#hp-bet .hb-panel").innerText'), /Everyone in the bet agreed\?/);
    await tapIn('#hp-bet [data-hb="remove-yes"]');
    assert.match(await toastAfter(/^Bet removed/), /^Bet removed: /);
    assert.match(await ev('location.href'), /skins\.html/);
    assert.equal(await ev("!!(window.__DB.events['" + CODE + "'].additionalGameInstances || {}).SK1"), false, 'not removed');
});
