// ============================================================================
// HARDPAN - THE TRIP BUILDER (gps-builder): one paste -> one plan -> the writes
//
// Manny's own Myrtle Cup text (tools/fixtures/myrtle-cup-test.txt) read into a
// plan; the questions it raises, each with the likely answer picked; and the
// exact update Confirm makes - every round in the shape Round Setup saves, the
// Nassaus through the app's one Nassau builder, Vegas / BBB / skins instances,
// the KP pot that validateMoneyPool accepts, and the Cup through ryder-cup.js's
// own buildRyderCupConfig. The Cup engine and every money file are unchanged.
// tools/trip-builder-check.js drives the same thing in Chrome.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'trip-builder.js'));
const skip = ON ? false : 'Consumer tree: no trip builder';
const TB = ON ? require('./trip-builder.js') : null;
const TSP = ON ? require('./trip-setup-paste.js') : null;
const IT = require('./trip-itinerary.js');
const { loadJsFile } = require('./helpers/load-script.js');
const KNOWN = { caledonia: 'Caledonia Golf & Fish Club', true_blue: 'True Blue Golf Club', pine_lakes: 'Pine Lakes Country Club', thistle_27: 'Thistle Golf Club (NC - 27 Hole)' };
const LOOPS = { thistle_27: { cameron: { name: 'Cameron Nine' }, stewart: { name: 'Stewart Nine' }, mackay: { name: 'MacKay Nine' } } };
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 3, 4, 4, 5][i], hcpIndex: i + 1 }));
function plan(file) {
    const p = TB.parseTrip(read(file || 'tools/fixtures/myrtle-cup-test.txt'), { year: 2026, tspGames: TSP.tspGames, tripItinDate: IT.tripItinDate });
    return TB.matchCourses(p, KNOWN, IT.tripItinMatch);
}
function build(p, qs, hcps) {
    const CH = loadJsFile('challenges.js', ['action-model.js']);
    const RC = loadJsFile('ryder-cup.js', ['handicap.js', 'match-engine.js', 'money-engine.js']);
    const PE = loadJsFile('pool-engine.js', ['action-model.js']);
    let k = 0;
    return TB.build(p, qs, { tripCode: 'TRIP01', roundCodes: ['RND001', 'RND002', 'RND003', 'RND004'].slice(0, p.days.length), uid: 'uid-1', now: 1000,
        tokens: { trip: 'tt', rounds: ['t1', 't2', 't3', 't4'] }, hcps: hcps || {},
        courseFor: (d) => (d.courseKey ? { courseKey: d.courseKey, courseName: KNOWN[d.courseKey], courseData: CD } : {}),
        pushKey: () => 'k' + (++k), sideMatchPayloadFromTerms: CH.sideMatchPayloadFromTerms, buildRyderCupConfig: RC.buildRyderCupConfig,
        validateMoneyPool: PE.validateMoneyPool, validateRyderCupSave: RC.validateRyderCupSave });
}

test('the paste: trip, Cup line, teams + captains, 4 days (date, course, tee times, format), groups, pairings, games, notes', { skip }, () => {
    const p = plan();
    assert.equal(p.name, 'Myrtle Cup 2026 (TEST)');
    assert.deepEqual([p.cup.nameA, p.cup.nameB, p.cup.pointsPerWin, p.cup.halve, p.cup.toWin], ['Team USA', 'Team EURO', 1, 0.5, 8.5]);
    assert.deepEqual(p.teams.map((t) => [t.name, t.captain, t.players.join(',')]), [['Team USA', 'Manny', 'Manny,Joe,Mike,Dave'], ['Team EURO', 'Tom', 'Tom,Rick,Steve,Paul']]);
    assert.deepEqual(p.days.map((d) => [d.date, d.courseKey, d.times.join(' '), d.format.type, d.format.points]),
        [['2026-10-13', 'caledonia', '09:10 09:20', 'fourball', 2], ['2026-10-14', 'true_blue', '08:30 08:40', 'foursomes', 1],
         ['2026-10-15', 'pine_lakes', '10:00 10:10', 'fourball', 1], ['2026-10-16', 'thistle_27', '09:00 09:10', 'singles', null]]);
    assert.equal(p.days[0].format.nines, true);
    assert.deepEqual(p.days[0].groups.map((g) => g.matches.map((m) => m.a.join('&') + ' v ' + m.b.join('&')).join() + ' @' + g.time + ' ' + g.games.map((x) => x.type).join('+')),
        ['Manny&Joe v Tom&Rick @09:10 nassau+vegas', 'Mike&Dave v Steve&Paul @09:20 nassau+bbb']);
    assert.deepEqual(p.days[3].groups.map((g) => g.matches.length), [2, 2], 'two singles per group');
    assert.deepEqual(p.days.map((d) => d.everyone.map((x) => x.type).join('+')), ['skins', 'kp', 'skins+kp', 'nassau+skins']);
    assert.deepEqual(p.notes.map((n) => n.text), ['Loser team buys dinner Friday.', 'Captains can swap the singles order up to Thursday night.'], 'nothing unread is dropped');
});

test('the questions: each one with the likely answer picked; nothing silently skipped', { skip }, () => {
    const q = TB.questions(plan(), LOOPS);
    const a = Object.fromEntries(q.map((x) => [x.id, x.answer]));
    assert.equal(a['pts-1'], 'one', 'Day 1 2-point / nines rule: counted 1, said so');
    assert.equal(a['cup-towin'], 'adjust', 'the Cup is 10 points, not 12: first to 5½ pre-filled, flagged');
    assert.match(q.find((x) => x.id === 'cup-towin').text, /Your paste has 12 Cup points \(first to 8½\); the app’s Cup has 10 \(Day 1: the app counts 1 a match\)/);
    assert.equal(a['cup-scoring'], 'net');
    assert.equal(a['kp-2'], 'buyin'); assert.equal(a['kp-3'], 'buyin');
    assert.equal(a['evnassau-4'], 'permatch');
    assert.equal(a['nines-4'], 'cameron|stewart', 'Thistle: which two nines');
    assert.equal(a['carry-1'], 'yes');
    assert.equal(a['hcp'], 'enter');
    assert.ok(q.every((x) => x.options.some((o) => o.v === x.answer)), 'every pre-picked answer is one of its options');
});

test('the writes: every round in Round Setup\'s shape, same golfer ids every day, groups of 4', { skip }, () => {
    const p = plan();
    const r = build(p, TB.questions(p, LOOPS), { manny: '8', tom: '4.5' });
    assert.deepEqual(r.problems, []);
    const ev = r.updates['events/RND001'];
    const { PAYLOAD_KEYS } = require('./helpers/wizard-saved-round.js');
    PAYLOAD_KEYS.filter((k) => !['richHoleBet', 'richHoleBetPresses', 'richOverallBetPresses', 'flights', 'moneyPool', 'skinsPotFormat'].includes(k))
        .forEach((k) => assert.ok(k in ev, 'Round Setup key ' + k));
    assert.equal(ev.ownerUid, 'uid-1');
    assert.equal(ev.eventName, 'Day 1 · Tue 10/13 · Caledonia Golf & Fish Club');
    assert.deepEqual(ev.groupSizeOverrides, { 0: 4, 1: 4 });
    assert.deepEqual(ev.players.map((p) => p.name + p.id + ':' + p.hcp).join(), 'Manny101:8,Joe102:0,Tom105:4.5,Rick106:0,Mike103:0,Dave104:0,Steve107:0,Paul108:0');
    assert.deepEqual(r.updates['events/RND004'].players.map((p) => p.name + p.id).join(), 'Manny101,Tom105,Joe102,Rick106,Mike103,Steve107,Dave104,Paul108');
    assert.deepEqual(r.updates['trips/TRIP01/rounds/RND003'], { label: 'Day 3 · Thu 10/15 · Pine Lakes Country Club', addedAt: 1002, date: '2026-10-15', time: '10:00' });
    assert.equal(r.updates['trips/TRIP01/name'], 'Myrtle Cup 2026 (TEST)');
    assert.equal(r.updates['trips/TRIP01/organizerToken'], 'tt');
    assert.ok(!JSON.stringify(r.updates).includes('undefined') && !/:undefined|NaN/.test(JSON.stringify(r.updates)), 'no undefined / NaN anywhere (Firebase refuses them)');
});

test('the games: Nassaus through the one Nassau builder (2v2, each group\'s own), Vegas / BBB / skins instances, the KP pot balances', { skip }, () => {
    const p = plan();
    const r = build(p, TB.questions(p, LOOPS));
    const d1 = r.updates['events/RND001'];
    const nas = Object.values(d1.sideMatches);
    assert.deepEqual(nas.map((s) => [s.format, s.teamAIds.join('+'), s.teamBIds.join('+'), s.frontStake, s.backStake, s.overallStake, s.pressRule, s.scope, s.ownerGroup]),
        [['nassau', '101+102', '105+106', 5, 5, 5, 'none', 'group', 1], ['nassau', '103+104', '107+108', 5, 5, 5, 'none', 'group', 2]]);
    const inst = Object.values(d1.additionalGameInstances);
    assert.deepEqual(inst.map((i) => i.format), ['vegas', 'bbb', 'skins']);
    assert.deepEqual([inst[0].vegasTeamA, inst[0].vegasTeamB, inst[0].vegasPointVal, inst[0].vegasBirdieFlip], [['101', '102'], ['105', '106'], 1, true]);
    assert.deepEqual([inst[1].participantIds, inst[1].bbbPointVal], [['103', '104', '107', '108'], 2]);
    assert.deepEqual([inst[2].skinsBuyIn, inst[2].skinsPotFormat, inst[2].skinsCarryOver, 'participantIds' in inst[2]], [5, 'gross', true, false]);
    const d2 = r.updates['events/RND002'];
    assert.deepEqual(d2.moneyPool, { enabled: true, buyIn: 5, kp: { amount: 40, holes: [3, 7, 11, 15] }, skins: { mode: 'none', scoring: 'gross', carryOver: true } });
    const d4 = r.updates['events/RND004'];
    assert.deepEqual(Object.values(d4.sideMatches).map((s) => s.teamAIds + 'v' + s.teamBIds + '$' + s.overallStake + 'g' + s.ownerGroup), ['101v105$10g1', '102v106$10g1', '103v107$10g2', '104v108$10g2'], '"$10 Nassau individual": one per singles match');
    // The other answers change what is written.
    const q = TB.questions(p, LOOPS); q.find((x) => x.id === 'kp-2').answer = 'perhole'; q.find((x) => x.id === 'press-1-1').answer = '2down';
    const r2 = build(p, q);
    assert.deepEqual([r2.updates['events/RND002'].moneyPool.buyIn, r2.updates['events/RND002'].moneyPool.kp.amount], [2.5, 20]);
    assert.equal(Object.values(r2.updates['events/RND001'].sideMatches)[0].pressRule, '2down');
});

test('the Cup: ryder-cup.js\'s own config, one session per day, every match, Day 2+ point at Day 1; the rest kept on the trip', { skip }, () => {
    const p = plan();
    const r = build(p, TB.questions(p, LOOPS));
    const cup = r.updates['events/RND001'].ryderCup;
    assert.deepEqual([cup.name, cup.sides.A.name, cup.sides.B.name], ['Myrtle Cup 2026 (TEST)', 'Team USA', 'Team EURO']);
    assert.deepEqual(Object.values(cup.sessions).map((s) => s.id + ':' + s.format), ['d1s1:fourball', 'd2s1:foursomes', 'd3s1:fourball', 'd4s1:singles']);
    assert.deepEqual(Object.values(cup.matches).map((m) => m.sessionId + ' ' + m.playersA.join('+') + 'v' + m.playersB.join('+') + ' ' + m.scoring),
        ['d1s1 101+102v105+106 net', 'd1s1 103+104v107+108 net', 'd2s1 101+103v105+107 handicap', 'd2s1 102+104v106+108 handicap',
         'd3s1 101+104v106+107 net', 'd3s1 102+103v105+108 net', 'd4s1 101v105 net', 'd4s1 102v106 net', 'd4s1 103v107 net', 'd4s1 104v108 net']);
    assert.ok(!/stake|payout|press/i.test(JSON.stringify(cup)), 'a Cup carries no money');
    ['RND001', 'RND002', 'RND003', 'RND004'].forEach((c, i) => assert.deepEqual(r.updates['events/' + c].ryderCupRef, { host: 'RND001', sessionId: 'd' + (i + 1) + 's1' }));
    const b = r.updates['trips/TRIP01/builder'];
    assert.deepEqual([b.cup.toWin, b.cup.toWinPasted, b.cup.teams.map((t) => t.captain).join(), b.cup.days[0].points, b.cup.days[0].nines], [5.5, 8.5, 'Manny,Tom', 2, true]);
    const q2 = TB.questions(p, LOOPS); q2.find((x) => x.id === 'cup-towin').answer = 'keep';
    assert.equal(build(p, q2).updates['trips/TRIP01/builder'].cup.toWin, 8.5, 'Keep 8½');
    p.cup.toWinManual = 6; assert.equal(build(p, q2).updates['trips/TRIP01/builder'].cup.toWin, 6, 'typed on the review wins');
    assert.deepEqual(b.notes, ['Loser team buys dinner Friday.', 'Day 4: Captains can swap the singles order up to Thursday night.']);
});

test('the Cup scoreboard (display only): ryder-cup.js\'s own totals across rounds, the target, the winner', { skip }, () => {
    const p = plan();
    const r = build(p, TB.questions(p, LOOPS));
    const sb = loadJsFile('cup-scoreboard.js', ['handicap.js', 'match-engine.js', 'money-engine.js', 'ryder-cup.js']);
    const events = {};
    ['RND001', 'RND002', 'RND003', 'RND004'].forEach((c) => { events[c] = JSON.parse(JSON.stringify(r.updates['events/' + c])); });
    const sc = (e, fn) => { e.scores = {}; e.courseData.forEach((h) => e.players.forEach((pl) => { e.scores['p' + pl.id + '_h' + h.hole] = fn(pl.id); })); };
    sc(events.RND001, (id) => ([105, 106].includes(id) ? 5 : 4));
    sc(events.RND004, (id) => (id === 101 ? 3 : 4));
    const B = sb.HardPanCupBoard || sb.window && sb.window.HardPanCupBoard;
    const res = B.compute(r.updates['trips/TRIP01/builder'].cup, events);
    assert.deepEqual(res.sides.map((s) => [s.name, s.captain, s.official]), [['Team USA', 'Manny', 4], ['Team EURO', 'Tom', 2]]);
    assert.deepEqual([res.toWin, res.available, res.winner], [5.5, 10, null]);
    assert.match(B.html(res), /First to 5½ wins · Team USA needs 1½, Team EURO needs 3½ · 10 points in all/);
    res.toWin = 4; res.winner = res.sides[0];
    assert.match(B.html(res), /Team USA wins the Cup \(4\)/);
});

test('one round: the same builder, one day', { skip }, () => {
    const p = plan('tools/fixtures/one-round-test.txt');
    const r = build(p, TB.questions(p, LOOPS));
    assert.deepEqual(r.problems, []);
    const ev = r.updates['events/RND001'];
    assert.deepEqual(Object.values(ev.additionalGameInstances).map((i) => i.format), ['vegas', 'bbb', 'skins']);
    assert.equal(Object.keys(ev.ryderCup.matches).length, 1);
    assert.deepEqual(ev.groupSizeOverrides, { 0: 4 });
    assert.ok(!('scope' in Object.values(ev.sideMatches)[0]), 'a one-group round writes no scope, like the Action tab');
});

// The Cup engine and the code / organizer paths the builder calls are main's, byte for byte.
const UNCHANGED = {
    'ryder-cup.js': '0b4e3f9059ad29a86af23f8a3b814f0393da396e87dae0fc6ccaa66848060433',
    'challenges.js': '7fc9ed67d513a1b18fa807d92a2634e57a9734e44b488f61035ecbbdcb6fdc1b',
    'code-issuer.js': 'c8e246c246d194a539f346f7e9e5dcfe2ae4ac21c611809b938bf12fa7865c9d',
    'organizer-gate.js': '8bff990e9bdc00ceaca42392cf9dbea42ec61b87aa92bd2fc41f0736a155773d'
};
test('the Ryder engine and the code / organizer helpers are byte-identical to main', () => {
    Object.keys(UNCHANGED).forEach((f) => assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex'), UNCHANGED[f], f + ' changed'));
});

test('wiring: trip.html loads the builder and the scoreboard in GPS blocks; nothing outside one names them', { skip }, () => {
    const s = read('trip.html');
    ['challenges.js', 'ryder-cup.js', 'trip-builder.js', 'trip-builder-ui.js', 'cup-scoreboard.js'].forEach((f) => assert.ok(s.includes('<script src="' + f + '"></script>'), f));
    const consumer = require('./tools/gps-flag.js').applyFlag(s, false);
    assert.ok(!/HardPanTripBuilder|HardPanCupBoard|tb-card|trip-builder|cup-scoreboard|ryder-cup\.js|challenges\.js/.test(consumer), 'HardPan only');
    assert.match(s, /id="sp-trip-card" style="margin-bottom:12px;" open>/, 'the per-day paste stays, as the fallback');
    const ui = read('trip-builder-ui.js');
    assert.match(ui, /W\.organizerGate\.ensureOrganizer\(DB\)/); assert.match(ui, /W\.organizerGate\.stamp\(out\.updates\[k\], uid\)/);
    assert.match(ui, /W\.issueUniqueCode\(\{ db: DB, root: 'trips', reserved: used \}\)/); assert.match(ui, /DB\.ref\(\)\.update\(out\.updates\)/);
    assert.ok(!/\.set\(|\.push\(\)\.key|\.remove\(/.test(ui), 'one update, nothing else');
    assert.ok(!/db\.ref|\.set\(|\.update\(/.test(read('cup-scoreboard.js').replace(/db\.ref\('events\/' \+ c\)/, '')), 'the scoreboard only reads');
});
