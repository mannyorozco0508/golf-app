#!/usr/bin/env node
// LAYER 1: the app's own engines (the same files the pages load: handicap.js, payouts.js, tournament-engine.js,
// skins.js, tournament-contests.js, tournament-prizes.js) run on the event's FINAL record in Node, compared item by
// item to the independent answer key. No browser, no database: this proves the arithmetic before the phones run.
//   node tools/event-sim/engine-check.js            exit 0 all match, 1 a mismatch
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const K = require('./answer-key.js');
const { finalState, keyInput } = require('./final-state.js');

function engines() {
    const ctx = { console, Math, Date, JSON, Object, Array, Number, String, isFinite, parseInt, parseFloat };
    ctx.window = ctx; ctx.self = ctx;
    vm.createContext(ctx);
    ['handicap.js', 'payouts.js', 'tournament-engine.js', 'skins.js', 'tournament-contests.js', 'tournament-prizes.js'].forEach((f) => {
        vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n;' + (f === 'tournament-engine.js' || f === 'handicap.js' || f === 'payouts.js'
            ? 'Object.assign(this, {' + ['getStrokes', 'parseHcp', 'allocatePlacePayouts', 'rankRows', 'computeTournamentLeaderboard', 'resolveLeaderboardView', 'resolvePrizeView', 'roundView', 'countableRoundIds', 'isMultiRound', 'competitorDisplayName', 'competitorCount', 'isWithdrawn'].filter((n) => new RegExp('function ' + n + '\\b').test(fs.readFileSync(path.join(ROOT, f), 'utf8'))).map((n) => n + ':' + n).join(',') + '});' : ''), ctx, { filename: f });
    });
    return ctx;
}

function main() {
    const s = finalState();
    const key = K.compute(keyInput(s));
    const E = engines();
    const results = [];
    const item = (name, ok, detail) => results.push({ name, ok: !!ok, detail: detail || '' });
    const rec = JSON.parse(JSON.stringify(s.rec));
    rec.scores = {};
    Object.keys(s.posted).forEach((pid) => Object.keys(s.posted[pid]).forEach((h) => { rec.scores[pid + '_h' + h] = s.posted[pid][h]; }));
    rec.contestEntriesForSim = null;

    // 1. the field and each flight: place and to-par for every golfer
    const cmpBoard = (label, engineRows, keyRows) => {
        const er = engineRows.filter((r) => r.hasScores).map((r) => [r.playerId, r.rank, r.toPar, r.thru]);
        const kr = keyRows.map((r) => [r.pid, r.place, r.toPar, r.thru]);
        const byE = Object.fromEntries(er.map((x) => [x[0], x])), byK = Object.fromEntries(kr.map((x) => [x[0], x]));
        const bad = Object.keys(Object.assign({}, byE, byK)).filter((pid) => JSON.stringify(byE[pid]) !== JSON.stringify(byK[pid]));
        item(label + ': ' + kr.length + ' golfers, place + to par + thru', bad.length === 0, bad.slice(0, 5).map((p) => p + ' engine ' + JSON.stringify(byE[p]) + ' key ' + JSON.stringify(byK[p])).join('; '));
    };
    cmpBoard('field board', E.computeTournamentLeaderboard(rec, null), key.field);
    Object.keys(rec.flights).forEach((fid) => cmpBoard(rec.flights[fid].name + ' board', E.computeTournamentLeaderboard(rec, fid), key.flights[fid]));
    item('the withdrawn golfer is on no board', !E.computeTournamentLeaderboard(rec, null).some((r) => r.playerId === 'p02'));

    // 2. place prizes per flight (the engine's split rule over the engine's ranks)
    Object.keys(rec.flights).forEach((fid) => {
        const rows = E.computeTournamentLeaderboard(rec, fid).filter((r) => r.hasScores);
        const pay = E.allocatePlacePayouts(rows, s.rec.payoutSpots).filter((p) => p.amount > 0).map((p) => [p.entry.playerId, p.rank, Math.round(p.amount * 100) / 100]);
        const kp = key.prizePlaces[fid].map((p) => [p.pid, p.place, Math.round(p.amount * 100) / 100]);
        item(rec.flights[fid].name + ' places: ' + kp.map((x) => x[0] + ' ' + x[2]).join(', '), JSON.stringify(pay) === JSON.stringify(kp), 'engine ' + JSON.stringify(pay));
    });

    // 3. skins
    const sk = E.TournamentSkins.computeSkins({ holes: rec.courseData, entrants: E.TournamentSkins.entrantsFromRecord(rec) }, { carryover: true, scoringBasis: 'gross' });
    const ew = sk.holes.filter((h) => h.status === 'won').map((h) => [h.hole, h.winner, h.skins]);
    const kw = key.skins.won.map((w) => [w.hole, w.pid, w.skins]);
    item('skins won: ' + kw.map((w) => 'h' + w[0] + ' ' + w[1] + ' x' + w[2]).join(', '), JSON.stringify(ew) === JSON.stringify(kw), 'engine ' + JSON.stringify(ew));
    item('skins tied (carried): ' + key.skins.tied.join(','), JSON.stringify(sk.holes.filter((h) => h.status === 'tied').map((h) => h.hole)) === JSON.stringify(key.skins.tied), 'engine ' + JSON.stringify(sk.holes.filter((h) => h.status === 'tied').map((h) => h.hole)));
    item('skins entrants ' + key.skins.entrants + ' (the withdrawn golfer out, the late add in)', E.TournamentSkins.entrantsFromRecord(rec).length === key.skins.entrants);

    // 4. contests: the engine's ranking over the entries as they would be stored
    const stored = {};
    Object.keys(s.entries).forEach((hole) => {
        stored['h' + hole] = {};
        s.entries[hole].forEach((e) => { stored['h' + hole][e.pid] = Object.assign({ name: rec.players[e.pid].name, kind: e.yards ? 'ld' : 'kp', by: 'sim', at: 1700000000000 + e.order * 1000 }, e.yards ? { yards: e.yards } : { inches: e.inches }); });
    });
    // The pages rank with TournamentContests.ranked(entries of the hole, kind) and show the top of it: the golfer's
    // card (top 3) and the organizer's Contest holes list, where "Make winner" is tapped.
    const C = E.TournamentContests;
    Object.keys(key.contests).forEach((hole) => {
        const k = key.contests[hole];
        const list = C.ranked(stored['h' + hole], k.kind);
        const lead = list[0] && list[0].key;
        const shown = list.slice(0, 3).map((e) => e.key + (rec.players[e.key] && rec.players[e.key].status === 'withdrawn' ? ' (withdrawn)' : '')).join(', ');
        item((k.kind === 'kp' ? 'KP ' : 'LD ') + hole + ': the leader the pages show is ' + k.pid, lead === k.pid, 'the pages show ' + shown);
    });
    item('contest "through" count leaves the withdrawn golfer out (71 golfers)', C.throughCount(rec, 3).total === 71, 'throughCount total ' + C.throughCount(rec, 3).total);
    return { results, key };
}

if (require.main === module) {
    const { results, key } = main();
    results.forEach((r) => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '\n      ' + r.detail)));
    const fails = results.filter((r) => !r.ok).length;
    console.log('\n' + (results.length - fails) + ' / ' + results.length + ' match');
    fs.writeFileSync(path.join(__dirname, 'answer-key.json'), JSON.stringify(key, null, 1));
    process.exit(fails ? 1 : 0);
}
module.exports = { main, engines };
