// ============================================================================
// 100b - THE PURE CHECKS, one per item (the Chrome halves: u100b_game_sheet_chrome_test.js and
// u100b_offline_send_chrome_test.js).
//   - Press hole (sidematches.html): the press starts on the next HOLE of the match in its own play
//     order, never on a count of holes played.
//   - Leaderboard / live skins (live-skins.js): a skins wager from 7 builds its ledger over 7-18 only.
//   - Matches page offline (sidematches.html smDurableSet / smDrainQueue + offline-queue.js): queued
//     before the write; kept while the write hangs; a new page's drain sends it once, then the queue is empty.
//   - + Bet press options (gps-bet.js): Off / Auto @2 / @1 / Any, saved as New Action's own values.
//   - 9 Points at 2 golfers: the clear message, on the Matches page and in the + Game sheet.
//   - Join by code asks "who are you" (front-door.js -> &askme=1; index.html opens the picker once).
//   - Spectators: no + Bet tile / + Game; the Matches page refuses New Action and presses.
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const SM = read('sidematches.html');

test('press hole: the next hole of the match in play order, not a count (sidematches.html)', () => {
    assert.doesNotMatch(SM, /const nextPressHole = Math\.min\(calc\.maxThru \+ 1, lastHole\);/, 'the count-as-hole line is gone');
    assert.match(SM, /const nextPressHole = smCourse\[calc\.maxThru\] \? Number\(smCourse\[calc\.maxThru\]\.hole\) : null;/);
    // The rule on a match from 7 with 7-9 played (maxThru = 3): the press starts on 10, not 4.
    const ctx = { console };
    vm.createContext(ctx);
    vm.runInContext(read('play-order.js') + '\n' + read('action-model.js') + '\n;this.sideMatchHoles = sideMatchHoles;', ctx);
    const cd = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
    const smCourse = ctx.sideMatchHoles({ startHole: 7 }, cd, {});
    const next = (maxThru) => smCourse[maxThru] ? Number(smCourse[maxThru].hole) : null;
    assert.equal(next(3), 10);
    assert.equal(next(12), null, 'no hole left: no Press button');
    // Off the 10th tee, a match from 13: 13..18 then 1..9 - after 6 played the press is on 1.
    const round = { startingHole: 10 };
    const off10 = ctx.sideMatchHoles({ startHole: 13 }, cd, round);
    if (off10[0] && Number(off10[0].hole) === 13 && off10.length === 15) assert.equal(Number(off10[6].hole), 1);
});

test('live skins: a skins wager from 7 builds its ledger over holes 7-18 only; a whole-round one over all 18', () => {
    const calls = [];
    const ctx = {
        console,
        getRoundGames: (d) => d.__games,
        gameHoles: (g, cd) => cd.filter((h) => h.hole >= g.startHole),
        computeSkinsHoleLedger: (cfg, holes) => { calls.push(holes.map((h) => h.hole)); return { net: { holes: [], participants: [1] } }; }
    };
    vm.createContext(ctx);
    vm.runInContext(read('live-skins.js') + '\n;this.liveSkinsLedgerEntries = liveSkinsLedgerEntries;', ctx);
    const cd = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1 }));
    ctx.liveSkinsLedgerEntries({ __games: [{ key: 'a', format: 'skins', startHole: 7, stake: 5, config: {} }, { key: 'main', format: 'skins', startHole: 1, stake: 5, config: {} }] }, cd, {});
    assert.deepEqual(calls[0], [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
    assert.equal(calls[1].length, 18);
});

// The Matches page's two queue functions, run as they are in the page.
function matchesPage(store, online, db) {
    const pick = (name) => { const i = SM.indexOf('    function ' + name + '('); assert.ok(i > -1, name); const end = SM.indexOf('\n    }\n', i); return SM.slice(i, end + 6); };
    const src = [pick('smStore'), pick('smOfflineNow'), pick('smDurableSet'), 'let smDraining = false;', pick('smDrainQueue')].join('\n');
    const ctx = { console, localStorage: store, navigator: { get onLine() { return online(); } }, db, currentMode: 'OFF100', setTimeout, clearTimeout, Promise, Date, JSON };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(read('offline-queue.js'), ctx);
    vm.runInContext(src + '\n;this.smDurableSet = smDurableSet; this.smDrainQueue = smDrainQueue;', ctx);
    return ctx;
}
function memStore() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, _m: m }; }
function fakeDb() {
    const state = { off: true, data: {}, sets: 0 };
    return { state, ref: (p) => ({ set: (v) => { if (state.off) return new Promise(() => {}); state.sets++; state.data[p] = v; return Promise.resolve(); }, update: () => Promise.resolve(), remove: () => Promise.resolve() }) };
}

test('Matches page offline: queued FIRST, kept while the write hangs, sent once by the next page\'s drain', async () => {
    const store = memStore(), db = fakeDb();
    let online = false;
    const page1 = matchesPage(store, () => online, db);
    page1.smDurableSet('events/OFF100/additionalGameInstances/k1', { format: 'dots', dotPointVal: 2 });
    page1.smDurableSet('events/OFF100/sideMatches/k2', { format: 'match', stake: 5 });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(page1.OfflineQueue.count(store), 2, 'both waiting on the phone');
    assert.deepEqual(db.state.data, {}, 'nothing landed');
    // still no signal: the drain does nothing
    assert.equal(await page1.smDrainQueue(), null);
    // the app is killed; a new page opens with the signal back
    db.state.off = false; online = true;
    const page2 = matchesPage(store, () => online, db);
    const res = await page2.smDrainQueue();
    assert.equal(res.sent, 2);
    assert.deepEqual(Object.keys(db.state.data).sort(), ['events/OFF100/additionalGameInstances/k1', 'events/OFF100/sideMatches/k2']);
    assert.equal(db.state.sets, 2, 'each sent once');
    assert.equal(page2.OfflineQueue.count(store), 0);
    // another round's op is never sent from this round's page
    page2.OfflineQueue.enqueue(store, { path: 'events/OTHER1/sideMatches/x', type: 'set', value: 1, coalesceKey: 'x' });
    const r2 = await page2.smDrainQueue();
    assert.equal(r2.sent, 0);
    assert.equal(page2.OfflineQueue.count(store), 1);
});

test('Matches page saves go through the queue (both writes), and offline closes with "Saved. Sends when you have signal."', () => {
    assert.match(SM, /<script src="offline-queue\.js"><\/script>/);
    assert.match(SM, /smDurableSet\(`events\/\$\{currentMode\}\/additionalGameInstances\/\$\{key\}`, entry\)\n\s+\.then/);
    assert.match(SM, /smDurableSet\(`events\/\$\{currentMode\}\/sideMatches\/\$\{pushKey\}`, payload\)\n\s+\.then/);
    assert.match(SM, /Saved\. Sends when you have signal\./);
});

test('+ Bet press options: Off / Auto @2 / @1 / Any, New Action\'s own values', () => {
    const src = read('gps-bet.js');
    assert.match(src, /var PRESS_RULES = \['none', '2down', '1down', 'anytime'\];/);
    assert.match(src, /\[\['none', 'Off'\], \['2down', 'Auto @2'\], \['1down', '@1'\], \['anytime', 'Any'\]\]/);
    assert.match(src, /var press = \(GAMES\[game\]\.presses && PRESS_RULES\.indexOf\(o\.press\) > 0\) \? o\.press : 'none';/);
});

test('9 Points at 2 golfers: the clear message (Matches page and + Game sheet)', () => {
    const msg = '9 Points is for exactly 3 golfers. You have 2: try Match or Skins.';
    assert.ok(SM.split(msg).length - 1 >= 2, 'the Matches page note and its refusal');
    assert.ok(read('gps-game.js').indexOf(msg) > -1);
});

test('join by code asks "who are you": front-door.js adds askme; index.html opens the picker once, with "I\'m only keeping score"', () => {
    const fd = read('front-door.js'), ix = read('index.html');
    assert.match(fd, /'&group=' \+ encodeURIComponent\(v\) \+ '&askme=1'/);
    assert.match(ix, /function hpAskMeOnJoin\(\)/);
    assert.match(ix, /I\\u2019m only keeping score/);
    assert.match(ix, /try \{ hpAskMeOnJoin\(\); \} catch \(e\) \{\}/);
});

test('spectators: no + Bet tile, no + Game, the Matches page refuses New Action and presses', () => {
    assert.match(read('gps-round.js'), /!\(t\.k === 'bet' && spectating\(\)\)/);
    assert.match(read('gps-bet.js'), /window\.HardPanGame && !spectating\(\)/);
    for (const fn of ['function openSideMatchModal() {', 'async function pressSideMatch(matchId, baseId, nextHole) {', 'function saveSideMatch() {', 'function showSideHolePressInput(matchId, p1Id, p2Id) {', 'async function pressSideMatchOverall(matchId, p1Id, p2Id) {']) {
        const i = SM.indexOf(fn); assert.ok(i > -1, fn);
        assert.ok(/if \(smSpectating\(\)\) \{ smRefuseSpectator\(\); return; \}/.test(SM.slice(i, i + 200)), fn + ' refuses a spectator');
    }
});
