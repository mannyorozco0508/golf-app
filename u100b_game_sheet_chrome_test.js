// ============================================================================
// 100b - THE "+ GAME" SHEET (A) AND THE LEADERBOARD SHORTCUT (B), IN REAL CHROME. Stub db only
// (tools/lib/journey.js): nothing leaves the machine.
//   1  Layout: the card bar's "+ Game" and the GPS pill above Mark; the sheet (Nassau, Wolf needs 4)
//      and "Start a game with Jim" at 375x667, 402x874 and 440x956, light and dark - nothing overlaps,
//      the Start button is on screen.
//   2  Nassau from 7, Me vs Jim: the "what counts" line, Auto @2, the record (sideMatches, startHole 7).
//   3  Nassau from 15 (Pick): "Nassau from 15 = one bet, 15-18." and a one-stake worst case.
//   4  Wolf with 3 picked: the reason, a disabled Start. 9 Points with 2: the clear message.
//   5  Dots from 7 (an additionalGameInstances entry) - and the Leaderboard's Dots card counts from 7
//      only; Hi-Lo side bets and 9 Points games are on the Leaderboard.
//   6  Vegas / BBB / Wolf are live only once 100c's engines are in (flags); then their records carry inSettle.
//   7  A spectator: no "+ Game", no "+ Bet" tile; the Matches page refuses New Action.
//   8  B: Jim's card on the Leaderboard -> "Start a game with Jim" -> Match -> the + Game sheet with Jim in.
//   9  Wolf as a side game: the call box from its start hole, first golfer picked is Wolf; a call is written.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ON = fs.existsSync(path.join(__dirname, 'gps-game.js'));
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
if (!ON) { test('100b: gps-game.js (the + Game sheet) is in this tree', () => { assert.fail('gps-game.js missing - the + Game sheet is not built here'); }); return; }
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const CODE = 'GAM100', SPEC = 'SPC100';
const SHOTS = process.env.SHOTS_100B || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function round(code, n, thru) {
    const names = ['Manny O', 'Jim B', 'Dave K', 'Rob T', 'Ann A', 'Ben B', 'Cal C', 'Dee D'].slice(0, n);
    const r = wizardSavedRound({ code, golfers: n, ownerUid: 'org-not-me', thru: 0, flights: false, names, hcps: names.map(() => 0),
        overrides: { activeCourseKey: 'caledonia', courseName: 'Caledonia', eventName: 'Saturday Game', groupSizeOverrides: n > 4 ? { 0: 4, 1: 4 } : { 0: n } } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed; r.additionalGames = {};
    r.scores = {};
    r.courseData.slice().sort((a, b) => a.hole - b.hole).slice(0, thru).forEach((h) => r.players.forEach((p, i) => { r.scores['p' + p.id + '_h' + h.hole] = h.par + (i === 0 ? -1 : 0); }));
    return r;
}
const R = round(CODE, 4, 6);
const ID = R.players.map((p) => String(p.id));   // Manny, Jim, Dave, Rob
// Dots on holes 2 and 8 for Jim: a Dots game from 7 counts the 8th only.
R.dots = { h2: { ['p' + ID[1]]: ['sandy'] }, h8: { ['p' + ID[1]]: ['sandy'] } };
const DB = { events: { [CODE]: R, [SPEC]: round(SPEC, 8, 3) }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} };
const PRE = (theme) => 'window.__hardpanDoors = true;' + iapStub({ active: true })
    + "try{localStorage.setItem('golfapp-theme','" + theme + "');localStorage.setItem('golfapp_me_" + CODE + "','" + ID[0] + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');sessionStorage.setItem('groupPickDismissed:" + SPEC + "','1');}catch(e){}";

// Visible boxes of `sel` inside `scope`, and any two that overlap (more than 1 px).
const OVERLAP = `function vis(e){ if(!e) return false; var r=e.getBoundingClientRect(); if(!(r.width>0&&r.height>0)) return false; for(var x=e;x&&x!==document.documentElement;x=x.parentElement){var c=getComputedStyle(x); if(c.display==='none'||c.visibility==='hidden') return false;} return true; }
function boxes(sel){ return Array.prototype.filter.call(document.querySelectorAll(sel), vis).map(function(e){ var r=e.getBoundingClientRect(); return { t:(e.innerText||e.getAttribute('aria-label')||e.className).trim().slice(0,30), l:r.left, r:r.right, top:r.top, b:r.bottom }; }); }
function hits(list){ var out=[]; for(var i=0;i<list.length;i++) for(var k=i+1;k<list.length;k++){ var a=list[i], b=list[k]; if(Math.min(a.r,b.r)-Math.max(a.l,b.l)>1 && Math.min(a.b,b.b)-Math.max(a.top,b.top)>1) out.push(a.t+' x '+b.t); } return out; }`;

async function openAt(w, h, theme, url) {
    const j = await openJourney({ db: JSON.parse(JSON.stringify(DB)), viewport: { width: w, height: h }, webgl: true, preScript: PRE(theme) });
    await j.goto(url, 4500);
    return j;
}
const card = () => fileUrl('index.html', 'game=' + CODE + '&group=1');

const SIZES = [[375, 667], [402, 874], [440, 956]];
for (const [w, h] of SIZES) {
    for (const theme of ['light', 'dark']) {
        test(`layout ${w}x${h} ${theme}: + Game on the card bar and above Mark; the sheet and "Start a game with Jim" without overlaps`, { timeout: 120000 }, async () => {
            const j = await openAt(w, h, theme, card());
            const shot = async (n) => { if (SHOTS) await j.shot(path.join(SHOTS, `${w}x${h}-${theme}-${n}.png`)); };
            try {
                const bar = JSON.parse(await j.evaluate(`(function(){ ${OVERLAP} var b=boxes('#hp-card-bet button'); return JSON.stringify({ names: b.map(function(x){return x.t;}), hits: hits(b), inView: b.every(function(x){ return x.r<=innerWidth+0.5 && x.b<=innerHeight+0.5 && x.l>=-0.5; }) }); })()`));
                assert.ok(bar.names.indexOf('＋ Game') > -1, 'the card bar has + Game: ' + JSON.stringify(bar.names));
                assert.deepEqual(bar.hits, [], 'card bar buttons overlap');
                assert.ok(bar.inView, 'card bar fits the screen');
                await shot('A0-card');
                await j.evaluate('document.querySelector("#hp-card-bet [data-hp-bar=game]").click()'); await sleep(400);
                // Jim in -> Nassau Me vs Jim (the A1 picture)
                await j.evaluate(`document.querySelector('#hp-game [data-hg-pick="${ID[1]}"]').click()`); await sleep(200);
                const sheetCheck = async () => JSON.parse(await j.evaluate(`(function(){ ${OVERLAP}
                    var groups = ['#hp-game .hb-tiles > *', '#hp-game .hb-chips > *', '#hp-game .hb-seg > *'];
                    var all = []; groups.forEach(function(g){ all = all.concat(hits(boxes(g))); });
                    var blocks = boxes('#hp-game .hb-panel > .hb-h, #hp-game .hb-panel > .hb-tiles, #hp-game .hb-panel > .hb-chips, #hp-game .hb-panel > .hb-say, #hp-game .hb-panel > .hb-card, #hp-game .hb-panel > .hb-worst');
                    all = all.concat(hits(blocks));
                    var go = document.querySelector('#hp-game [data-hg=start]').getBoundingClientRect();
                    var tiles = boxes('#hp-game .hb-tile b').filter(function(x){ return x.r > innerWidth; });
                    return JSON.stringify({ hits: all, goIn: go.bottom <= innerHeight + 0.5 && go.top >= 0, wide: document.querySelector('#hp-game .hb-panel').scrollWidth <= innerWidth + 1, off: tiles.length }); })()`));
                let s = await sheetCheck();
                assert.deepEqual(s.hits, [], 'sheet parts overlap');
                assert.ok(s.goIn, 'Start button on screen');
                assert.ok(s.wide, 'no sideways scroll');
                await shot('A1-card-nassau');
                if (h < 800) { await j.evaluate('(function(){var p=document.querySelector("#hp-game .hb-panel"); p.scrollTop=p.scrollHeight;})()'); await sleep(200); s = await sheetCheck(); assert.deepEqual(s.hits, []); await shot('A1b-card-nassau-scrolled'); }
                // Wolf with 3 (the A3 picture) - Wolf live for the picture (100c's catalog entry stood in).
                assert.equal(await j.evaluate('HardPanGame.ready("wolf")'), true, 'Wolf is live (100c catalog entry)');
                await j.evaluate(`document.querySelector('#hp-game [data-hg-game="wolf"]').click()`); await sleep(150);
                await j.evaluate(`document.querySelector('#hp-game [data-hg-pick="${ID[2]}"]').click()`); await sleep(200);
                s = await sheetCheck();
                assert.deepEqual(s.hits, [], 'wolf sheet overlaps');
                await shot('A3-card-wolf-needs4');
                // + Game › More: the grid fits the screen (Build E Simulator, SE: the 3rd column ran to 424 px).
                await j.evaluate(`document.querySelector('#hp-game [data-hg="more"]').click()`); await sleep(200);
                const mg = JSON.parse(await j.evaluate(`(function(){ ${OVERLAP} var t = boxes('#hp-game .hb-tiles > *'); var p = document.querySelector('#hp-game .hb-panel');
                    return JSON.stringify({ n: t.length, hits: hits(t), off: t.filter(function(x){ return x.r > innerWidth + 0.5 || x.l < -0.5; }).map(function(x){ return x.t + ' ' + Math.round(x.r); }), wide: p.scrollWidth <= innerWidth + 1, docWide: document.documentElement.scrollWidth <= innerWidth + 1 }); })()`));
                assert.equal(mg.n, 9, 'More: 8 games + Back');
                assert.deepEqual(mg.off, [], `More grid fits ${w} px`);
                assert.deepEqual(mg.hits, []);
                assert.ok(mg.wide && mg.docWide, 'no sideways scroll on More');
                await shot('A4-more-grid');
                await j.evaluate(`document.querySelector('#hp-game [data-hg="less"]').click()`); await sleep(150);
                await j.evaluate('HardPanGame.close()');
                // GPS: the pill above Mark, clear of every map control
                await j.evaluate("(document.querySelector('#hp-card-bet [data-hp-bar=gps]')||{click(){}}).click()"); await sleep(3500);
                const g = JSON.parse(await j.evaluate(`(function(){ ${OVERLAP} var p=document.querySelector('#gps-overlay .gps-game-pill'); var pb=vis(p)?p.getBoundingClientRect():null;
                    var others = boxes('#gps-overlay .gps-ld-bottom .gps-bottom > *, #gps-overlay .gps-ld-rail > *, #gps-overlay .gps-ld-plays, #gps-overlay .gps-leftrow > *, #gps-overlay .gps-credit, #gps-overlay .gps-msg, #gps-overlay .gps-ld-top, #gps-overlay .gps-ld-row2');
                    var mk = document.querySelector('#gps-overlay .gps-mark-shot'), mb = mk && mk.getBoundingClientRect();
                    return JSON.stringify({ pill: !!pb, hits: pb ? hits([{ t:'pill', l:pb.left, r:pb.right, top:pb.top, b:pb.bottom }].concat(others)).filter(function(x){ return x.indexOf('pill')===0; }) : [], above: !!(pb && mb && pb.bottom <= mb.top), inView: !!(pb && pb.right <= innerWidth && pb.left >= 0) }); })()`));
                assert.ok(g.pill, 'the GPS has + Game');
                assert.deepEqual(g.hits, [], 'the pill covers a map control');
                assert.ok(g.above, 'the pill sits above Mark');
                assert.ok(g.inView);
                await shot('A0-gps-entry');
                await j.evaluate(`document.querySelector('#gps-overlay .gps-game-pill').click()`); await sleep(400);
                await j.evaluate(`document.querySelector('#hp-game [data-hg-pick="${ID[1]}"]').click()`); await sleep(200);
                s = await sheetCheck();
                assert.deepEqual(s.hits, []); assert.ok(s.goIn);
                await shot('A2-gps-nassau');
                await j.evaluate('HardPanGame.close()');
                // B: the leaderboard shortcut
                await j.goto(fileUrl('leaderboard.html', 'game=' + CODE + '&group=1'), 3500);
                await j.tap(`#board-content tr[data-player-id="${ID[1]}"]`);
                await sleep(300);
                await shot('B0-leaderboard-jim-card');
                assert.ok(await j.tap('[data-lb-game-with]'), 'Jim\'s card has "Start a game with Jim"');
                await sleep(300);
                const b = JSON.parse(await j.evaluate(`(function(){ ${OVERLAP} var t = boxes('#lb-game-with-sheet [data-lbg]'); var el=document.getElementById('lb-game-with-sheet'); return JSON.stringify({ text: el.innerText.replace(/\\s+/g,' '), hits: hits(t), inView: t.every(function(x){ return x.b <= innerHeight + 0.5 && x.r <= innerWidth + 0.5; }) }); })()`));
                assert.match(b.text, /Start a game with Jim/);
                assert.match(b.text, /from hole 7 \(now\) · holes 1-6 don’t count/);
                assert.match(b.text, /Match 1 v 1, holes 7-18/);
                assert.match(b.text, /Nassau 7-9 · 10-18 · 7-18/);
                assert.match(b.text, /Skins Just us two, 7-18/);
                assert.match(b.text, /BBB Points from 7/);
                assert.match(b.text, /All games ›/);
                assert.deepEqual(b.hits, [], 'shortcut tiles overlap');
                assert.ok(b.inView, 'shortcut fits the screen');
                await shot('B1-start-a-game-with-jim');
            } finally { await j.close(); }
        });
    }
}

let j;
before(async () => { j = await openAt(402, 874, 'light', card()); });
after(async () => { if (j) await j.close(); });
const ev = (x) => j.evaluate(x);
const st = async () => JSON.parse(await ev('JSON.stringify(HardPanGame.state())'));
const panel = async () => ev('document.querySelector("#hp-game .hb-panel").innerText.replace(/\\s+/g," ")');
const tapG = async (sel) => { const ok = await ev(`(function(){ var e=document.querySelector(${JSON.stringify('#hp-game ' + sel)}); if(!e) return false; e.click(); return true; })()`); assert.ok(ok, 'no ' + sel); await sleep(120); };
const lastOf = (slot) => `JSON.stringify((function(){ var m=(window.__DB.events['${CODE}'].${slot})||{}; var k=Object.keys(m).sort(function(a,b){ return (m[a].createdAt||0)-(m[b].createdAt||0) || (a<b?-1:1); }).pop(); return k ? m[k] : null; })())`;

test('Nassau from 7, Me vs Jim: the line, Auto @2, and the record (sideMatches, startHole 7)', { timeout: 60000 }, async () => {
    assert.ok(await ev('HardPanGame.open({})'));
    await tapG(`[data-hg-pick="${ID[1]}"]`);
    const t = await panel();
    assert.match(t, /Nassau from 7: front = 7-9, back = 10-18, total = 7-18\. Presses on\./);
    assert.match(t, /Counts holes 7-18 only\. Holes 1-6 are not in it\. Worst case for you: −\$15 before presses\./);
    assert.match(t, /Start Nassau · Me vs Jim/);
    await tapG('[data-hg=start]');
    await sleep(500);
    const sm = JSON.parse(await ev(lastOf('sideMatches')));
    assert.equal(sm.format, 'nassau'); assert.equal(Number(sm.startHole), 7); assert.equal(sm.pressRule, '2down');
    assert.deepEqual(sm.teamAIds.map(String), [ID[0]]); assert.deepEqual(sm.teamBIds.map(String), [ID[1]]);
    assert.equal(Number(sm.frontStake), 5);
    assert.equal(await ev('HardPanGame.isOpen()'), false);
});

test('Nassau from 15 (Pick): "one bet, 15-18" and a one-stake worst case; Pick offers no played hole', { timeout: 60000 }, async () => {
    await ev('HardPanGame.open({})');
    await tapG(`[data-hg-pick="${ID[1]}"]`);
    await tapG('[data-hg-from=pick]');
    const opts = JSON.parse(await ev('JSON.stringify(Array.prototype.map.call(document.querySelectorAll("#hp-game select.hb-from option"), function(o){ return Number(o.value); }))'));
    assert.deepEqual(opts, [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18], 'from now on only (no back-fill)');
    await ev('(function(){ var s=document.querySelector("#hp-game select.hb-from"); s.value="15"; s.dispatchEvent(new Event("change",{bubbles:true})); })()');
    await sleep(150);
    const t = await panel();
    assert.match(t, /Nassau from 15 = one bet, 15-18\./);
    assert.match(t, /Worst case for you: −\$5 before presses\./);
    // + Bet's own worst case agrees (gps-bet.js worstCase, the 1-bet Nassau)
    assert.equal(await ev(`HardPanBet.worstCase('nassau', 5, HardPanBet.shapeOf('nassau', ['${ID[0]}','${ID[1]}']), 15).amount`), 5);
    assert.equal(await ev(`HardPanBet.worstCase('nassau', 5, HardPanBet.shapeOf('nassau', ['${ID[0]}','${ID[1]}']), 7).amount`), 15);
    await ev('HardPanGame.close()');
});

test('Wolf with 3: the reason and a disabled Start; 9 Points with 2: the clear message', { timeout: 60000 }, async () => {
    await ev('HardPanGame.open({ game: "wolf" })');
    await tapG(`[data-hg-pick="${ID[1]}"]`); await tapG(`[data-hg-pick="${ID[2]}"]`);
    let t = await panel();
    assert.match(t, /Wolf needs 4 golfers\. You picked 3: tap Rob\./);
    assert.match(t, /Start Wolf · needs 4 golfers/);
    assert.equal(await ev('document.querySelector("#hp-game [data-hg=start]").disabled'), true);
    assert.match(t, /Wolf from 7: holes 7-18, you are Wolf on 7, then in the order picked\./);
    await ev('HardPanGame.close()');
    await ev('HardPanGame.open({ game: "nines" })');
    await tapG(`[data-hg-pick="${ID[1]}"]`);
    t = await panel();
    assert.match(t, /9 Points is for exactly 3 golfers\. You have 2: try Match or Skins\./);
    assert.equal(await ev('document.querySelector("#hp-game [data-hg=start]").disabled'), true);
    await ev('HardPanGame.close()');
});

test('Vegas / BBB / Wolf / KP / Birdies are live with 100c in, and their records carry inSettle; without 100c they wait (organizer line)', { timeout: 60000 }, async () => {
    const live = JSON.parse(await ev('JSON.stringify(["vegas","bbb","wolf","kp","birdies"].map(function(k){ return HardPanGame.ready(k); }))'));
    assert.deepEqual(live, [true, true, true, true, true], '100c engines are in this build');
    // Without 100c (its flags off on this page): the organizer line, a disabled Start - today's behavior.
    const off = JSON.parse(await ev(`(function(){ var f = window.HP_SETTLE_VEGAS_BBB; window.HP_SETTLE_VEGAS_BBB = false; var w = ADDITIONAL_GAME_CATALOG.wolf; delete ADDITIONAL_GAME_CATALOG.wolf; var t = ADDITIONAL_GAME_CATALOG.dots.typeFilter; delete ADDITIONAL_GAME_CATALOG.dots.typeFilter;
        var cf = window.computeVegasBbbSettle; try { delete window.computeVegasBbbSettle; } catch (e) {}
        var r = ['vegas','bbb','wolf','kp'].map(function(k){ return HardPanGame.ready(k); });
        HardPanGame.open({ game: 'vegas' }); var txt = document.querySelector('#hp-game .hb-panel').innerText.replace(/\\s+/g,' '); var dis = document.querySelector('#hp-game [data-hg=start]').disabled; HardPanGame.close();
        window.HP_SETTLE_VEGAS_BBB = f; ADDITIONAL_GAME_CATALOG.wolf = w; ADDITIONAL_GAME_CATALOG.dots.typeFilter = t; if (cf) window.computeVegasBbbSettle = cf;
        return JSON.stringify({ r: r, txt: txt, dis: dis }); })()`));
    assert.deepEqual(off.r, [false, false, false, false]);
    assert.match(off.txt, /The organizer sets this up in Round Setup\./);
    assert.equal(off.dis, true);
    const rec = JSON.parse(await ev(`(function(){ var ids = ${JSON.stringify(ID)}; var o = function(g, p){ var r = HardPanGame.build({ game: g, picks: p, stake: 2, from: 7, now: 1 }); return r.refuse ? r : r[0].value; };
        return JSON.stringify({ vegas: o('vegas', ids), bbb: o('bbb', ids.slice(0,2)), wolf: o('wolf', [ids[2], ids[0], ids[1], ids[3]]), kp: o('kp', ids), birdies: o('birdies', ids) }); })()`));
    assert.deepEqual(rec.vegas, { format: 'vegas', enabled: true, startHole: 7, createdAt: 1, vegasPointVal: 2, vegasBirdieFlip: false, vegasTeamA: [ID[0], ID[1]], vegasTeamB: [ID[2], ID[3]], participantIds: ID, inSettle: true });
    assert.deepEqual(rec.bbb, { format: 'bbb', enabled: true, startHole: 7, createdAt: 1, bbbPointVal: 2, participantIds: [ID[0], ID[1]], inSettle: true });
    assert.deepEqual(rec.wolf.participantIds, [ID[2], ID[0], ID[1], ID[3]], 'first golfer picked = Wolf on the start hole');
    assert.equal(rec.wolf.inSettle, true); assert.equal(rec.wolf.startHole, 7); assert.equal(rec.wolf.wolfPointVal, 2);
    assert.deepEqual(rec.kp.dotTypes, ['greenie']); assert.equal(rec.kp.format, 'dots');
    assert.deepEqual(rec.birdies.dotTypes, ['birdie', 'eagle']);
    // Vegas started from the sheet lands in the round (and a live Vegas card is extra-games-ui.js's).
    await ev('HardPanGame.open({ game: "vegas" })');
    for (const id of ID.slice(1)) await tapG(`[data-hg-pick="${id}"]`);
    let t = await panel();
    assert.match(t, /Vegas from 7: holes 7-18, the first two picked vs the last two\./);
    assert.match(t, /Start Vegas · Me \+ Jim vs Dave \+ Rob/);
    await tapG('[data-hg=start]'); await sleep(400);
    const v = JSON.parse(await ev(lastOf('additionalGameInstances')));
    assert.equal(v.format, 'vegas'); assert.equal(v.inSettle, true); assert.equal(Number(v.startHole), 7);
    // More: the organizer-only games say so
    await ev('HardPanGame.open({ game: "scramble" })');
    t = await panel();
    assert.match(t, /A scramble has one team score a hole\. The organizer sets this up in Round Setup\./);
    await ev('HardPanGame.close()');
});

test('Team match auto-pairs 1 v 1s from the start hole; Match from hole 1 = the whole round (startHole 1)', { timeout: 60000 }, async () => {
    const r = JSON.parse(await ev(`JSON.stringify(HardPanGame.build({ game: 'team', picks: ${JSON.stringify(ID)}, stake: 5, from: 7, press: 'none', now: 5 }))`));
    assert.equal(r.length, 2);
    assert.deepEqual(r.map((x) => [x.value.teamAIds.map(String), x.value.teamBIds.map(String), Number(x.value.startHole), x.value.format]),
        [[[ID[0]], [ID[2]], 7, 'match'], [[ID[1]], [ID[3]], 7, 'match']]);
});

test('Dots from 7 (an instance) and the Leaderboard: Dots from 7 only, Hi-Lo side bet + 9 Points on it', { timeout: 90000 }, async () => {
    await ev('HardPanGame.open({ game: "dots" })');
    await tapG(`[data-hg-pick="${ID[1]}"]`);
    await tapG('[data-hg=start]'); await sleep(400);
    const gi = JSON.parse(await ev(lastOf('additionalGameInstances')));
    assert.equal(gi.format, 'dots'); assert.equal(Number(gi.startHole), 7); assert.deepEqual(gi.participantIds, [ID[0], ID[1]]); assert.equal(gi.dotPointVal, 2);
    // a Hi-Lo side bet from 7 and a 9 Points game from 7 (the + Game sheet's own records)
    await ev(`(function(){ var a = HardPanGame.build({ game: 'hilo', picks: ${JSON.stringify(ID)}, stake: 1, from: 7 }); HardPanBet.write(a[0]); var n = HardPanGame.build({ game: 'nines', picks: ${JSON.stringify(ID.slice(0, 3))}, stake: 1, from: 7 }); HardPanBet.write(n[0]); return 1; })()`);
    // Jim posts a 4 on 8 (his dot there counts; the one on 2 is before the game).
    await ev(`(function(){ var p = 'events/${CODE}/scores/p${ID[1]}_h8'; durableWrite(p, 'set', 4, p); return 1; })()`);
    await sleep(400);
    await j.goto(fileUrl('leaderboard.html', 'game=' + CODE + '&group=1'), 3500);
    const t = await j.text('#live-sidegames-mount');
    assert.match(t, /DOTS from 7 · thru 8/, t);
    assert.match(t, /Jim B 1\b/, 'Jim\'s dot on 8 only (not the one on 2): ' + t);
    assert.match(t, /HI-LO from 7/);
    assert.match(t, /9 POINTS from 7/);
    assert.equal(await j.text('#live-points-mount'), '', 'the whole-card Dots card stepped aside');
    await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 4500);
    await ev(`(function(){ var p = 'events/${CODE}/scores/p${ID[1]}_h8'; durableWrite(p, 'remove', null, p); return 1; })()`);
    await sleep(300);
});

test('Wolf as a side game: the call box from its start hole, the first golfer picked is Wolf; a call is written', { timeout: 60000 }, async () => {
    await ev(`(function(){ var r = HardPanGame.build ? null : null; var e = { format: 'wolf', enabled: true, startHole: 7, createdAt: 9, wolfPointVal: 1, participantIds: ['${ID[1]}', '${ID[0]}', '${ID[2]}', '${ID[3]}'], wolfLoneMult: 2, wolfBlindMult: 3, wolfTieRule: 'carry', wolfLastPlaceRule: 'off', inSettle: true };
        return durableWrite('events/${CODE}/additionalGameInstances/wolfX', 'set', e, 'events/${CODE}/additionalGameInstances/wolfX'); })()`);
    await sleep(600);
    await ev('renderScorecard()'); await sleep(300);
    let t = await j.text('#wolf-inst-mount');
    assert.match(t, /Wolf side game · from hole 7/);
    assert.match(t, /Hole 7 Wolf: 🐺 Jim/);
    assert.match(t, /H7: Jim → H8: Manny → H9: Dave → H10: Rob/);
    await ev(`document.querySelector('#wolf-inst-mount [data-wolf-call=lone]').click()`); await sleep(400);
    const call = JSON.parse(await ev(`JSON.stringify(window.__DB.events['${CODE}'].additionalGameInstances.wolfX.wolfCalls)`));
    assert.deepEqual(call, { h7: { call: 'lone' } });
    t = await j.text('#wolf-inst-mount');
    assert.match(t, /Hole 8 Wolf: 🐺 Manny/);
});

test('B: Leaderboard -> "Start a game with Jim" -> Match -> the + Game sheet with Me + Jim, Match, from 7', { timeout: 60000 }, async () => {
    await j.goto(fileUrl('leaderboard.html', 'game=' + CODE + '&group=1'), 3500);
    await j.tap(`#board-content tr[data-player-id="${ID[1]}"]`); await sleep(300);
    assert.equal(await ev(`!!document.querySelector('[data-lb-game-with="${ID[0]}"]')`), false, 'none on my own card');
    await j.tap('[data-lb-game-with]'); await sleep(300);
    await ev(`document.querySelector('#lb-game-with-sheet [data-lbg="match"]').click()`);
    await sleep(5000);
    const s = await st();
    assert.ok(s, 'the + Game sheet is open on the round');
    assert.equal(s.game, 'match'); assert.deepEqual(s.picks, [ID[0], ID[1]]);
    assert.match(await panel(), /Match from 7: holes 7-18, one match\./);
    assert.match(s.returnTo || '', /^leaderboard\.html/);
    await ev('HardPanGame.close()');
});

test('a spectator: no + Game anywhere, no + Bet tile; the Matches page refuses New Action', { timeout: 90000 }, async () => {
    await j.goto(fileUrl('index.html', 'game=' + SPEC + '&spectate=1'), 4500);
    const r = JSON.parse(await ev(`(function(){ var g=document.querySelector('#hp-card-bet [data-hp-bar=game]'); var o = HardPanGame.open({}); return JSON.stringify({ spect: hpSpectating(), game: !!(g && g.style.display !== 'none'), opened: o }); })()`));
    assert.equal(r.spect, true);
    assert.equal(r.game, false, 'no + Game on a spectator\'s bar');
    assert.equal(r.opened, false, 'the sheet does not open');
    await ev('HardPanRound.openMenu ? HardPanRound.openMenu() : 0'); await sleep(300);
    const tiles = JSON.parse(await ev('JSON.stringify(Array.prototype.map.call(document.querySelectorAll("#hp-sheet [data-hs-tile]"), function(b){ return b.getAttribute("data-hs-tile"); }))'));
    assert.equal(tiles.indexOf('bet'), -1, 'no + Bet tile: ' + JSON.stringify(tiles));
    await j.goto(fileUrl('sidematches.html', 'game=' + SPEC + '&spectate=1'), 3500);
    await j.dialogs();
    await ev('openSideMatchModal()'); await sleep(300);
    const body = await j.screenText();
    assert.match(body, /You are watching this round - a scorekeeper starts bets and presses\./);
});

test('GPS build: the Vegas game started from the sheet is in Settle up on the Bets page (bbb/vegas engines load there, in their GPS block)', { timeout: 90000 }, async () => {
    await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 4500);
    // hole 7: Manny 3, Jim 3 (33) vs Dave 4, Rob 5 (45) -> Manny + Jim +12 points at $1
    await ev(`(function(){ var s = { '${ID[0]}': 3, '${ID[1]}': 3, '${ID[2]}': 4, '${ID[3]}': 5 }; Object.keys(s).forEach(function(id){ var p = 'events/${CODE}/scores/p' + id + '_h7'; durableWrite(p, 'set', s[id], p); }); return 1; })()`);
    await sleep(500);
    await j.goto(fileUrl('skins.html', 'game=' + CODE + '&group=1'), 4000);
    const r = JSON.parse(await ev(`(function(){ var d = window.__DB.events['${CODE}']; var t = computeCombinedNetTotals(d, d.courseData, d.scores); var n = t.netByName || {}; return JSON.stringify({ eng: typeof window.HardPanVegas !== 'undefined' || typeof calculateVegas === 'function', flag: window.HP_SETTLE_VEGAS_BBB === true, manny: (n['manny o'] || {}).net || 0, rob: (n['rob t'] || {}).net || 0 }); })()`));
    assert.equal(r.flag, true, 'settlement-engine.js says Vegas/BBB settle here');
    assert.ok(r.eng, 'vegas-engine.js loaded on the Bets page');
    assert.ok(r.manny > 0 && r.rob < 0, 'Vegas money in Settle up: ' + JSON.stringify(r));
    // ... and on the Bets list (Build E Simulator: Settle up had it, Bets did not), with the KP pot by name.
    const bets = await j.text('#bets-games');
    assert.match(bets, /Vegas/, bets);
    assert.match(bets, /Me \+ Jim|Manny \+ Jim/, bets);
    await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 4000);
    await ev(`(function(){ ${JSON.stringify(ID)}.forEach(function(id){ var p = 'events/${CODE}/scores/p' + id + '_h7'; durableWrite(p, 'remove', null, p); }); return 1; })()`);
    await sleep(300);
});

test('join by code: ONE "Who are you?" - the card\'s ask over the GPS, it saves the pick, and the GPS does not ask again', { timeout: 90000 }, async () => {
    const j2 = await openJourney({ db: JSON.parse(JSON.stringify(DB)), viewport: { width: 402, height: 874 }, webgl: true,
        preScript: 'window.__hardpanDoors = true;' + iapStub({ active: true }) + "try{sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}" });
    try {
        await j2.goto(fileUrl('index.html', 'game=' + CODE + '&group=1&askme=1'), 5000);
        const a = JSON.parse(await j2.evaluate(`JSON.stringify({ me: resolvedMeId(), ask: getComputedStyle(document.getElementById('playing-pick-overlay')).display, z: document.getElementById('playing-pick-overlay').style.zIndex, title: document.getElementById('playing-pick-title').textContent, gps: (function(){ var w = document.querySelector('#gps-overlay .gps-who-sheet'); return !!(w && w.offsetParent !== null && w.style.display !== 'none'); })(), url: location.search })`));
        assert.equal(a.me, null); assert.equal(a.ask, 'flex'); assert.equal(a.title, 'Who are you?'); assert.equal(a.z, '10300');
        assert.equal(a.gps, false, 'no second (GPS) ask');
        assert.doesNotMatch(a.url, /askme/);
        await j2.evaluate(`document.querySelector('#playing-pick-body [data-askme-id="${ID[1]}"]').click()`); await sleep(500);
        const b = JSON.parse(await j2.evaluate(`JSON.stringify({ me: resolvedMeId(), tag: localStorage.getItem('hardpan_gps_golfer_${CODE}'), ask: getComputedStyle(document.getElementById('playing-pick-overlay')).display })`));
        assert.deepEqual(b, { me: ID[1], tag: ID[1], ask: 'none' });
        await j2.evaluate("(document.querySelector('#hp-card-bet [data-hp-bar=gps]')||{click(){}}).click()"); await sleep(3500);
        const g = await j2.evaluate(`(function(){ var w = document.querySelector('#gps-overlay .gps-who-sheet'); return !!(w && w.offsetParent !== null && w.style.display !== 'none'); })()`);
        assert.equal(g, false, 'the GPS screen does not ask again');
    } finally { await j2.close(); }
});
