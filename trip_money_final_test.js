// ============================================================================
// TRIP MONEY - TELL THE TRUTH ABOUT WHAT IS FINAL (2026-09-15)
//
// TWO DECISIONS, BOTH MANNY'S.
//
// 1. SHOW BOTH TOTALS. Each round rounds its nets to whole dollars on its own
//    and hands the odd dollar to somebody by name, so a group that settled up
//    after every round paid the SUM OF THE ROUNDED DAYS, and a group settling
//    once at the end pays the exact bets netted first and rounded once. Three
//    identical 2v2 $25 days: +$36/+$39 against +$37/+$38 (measured below). The
//    trip cannot know which the group did, so it shows both and names each in
//    plain words. Where they agree it shows one number and says so.
//
// 2. A ROUND STILL IN PLAY IS NAMED, AND ITS MONEY STILL COUNTS. A match
//    scored thru 9 already pays match and skins as if the day were over; that
//    money stays in every total (it is the running position), but the heading
//    cannot say Final while a golfer is still out - the shape the KP case has
//    had since trip_settlement_gate_test.js.
//
// THE PREDICATE lives in settlement-engine.js (computeRoundSettlement - the one
// approved addition) and trip.html reads it. The Receipt does NOT read it yet
// (HANDOFF). "Every golfer playing" = holesPlayed > 0; a roster name with no
// score never teed off; a picked-up ball or a golfer who left after nine leaves
// the round unfinished until the organizer VERIFIES it - the app cannot tell
// "picked up on 12" from "has not reached 12 yet", and verification is the
// word that says the blanks are deliberate.
//
// PROVED THE WAY v136-v145 WERE: trip_money_final_prev.fixture.json is the
// tag-stripped money card, recap card and share text captured at cb42f1d on the
// two-round trip in helpers/trip-weekly-rounds.js (both totals agree there).
// Today's text must equal it with exactly the deliberate substitutions.
//
// HARNESS LIMIT. Every row here calls renderTripMoneySettlement() the way the
// other trip money suites do (mini-dom; the trip page's Firebase load is not
// driven). The predicate and the wording are proved; that the page calls the
// renderer on load is proved elsewhere (trip_page_load tests) and not here.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');
const { linkedRounds, DEPS: WEEKLY_DEPS } = require('./helpers/trip-weekly-rounds.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha8 = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO_ROOT, f))).digest('hex').slice(0, 8);
// strip0 is the v136-v145 stripper the fixture was captured with; strip also
// drops whitespace beside a bar so the rows below can match text across tags.
const strip0 = h => h.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ').trim();
const strip = h => strip0(h).replace(/ ?\| ?/g, '|').replace(/\|+/g, '|');
const stripComments = s => s.replace(/<!--[\s\S]*?-->|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str !== undefined ? str : '');

const DEPS = ['money-engine.js', 'action-model.js', 'settlement-engine.js', 'pool-engine.js', 'score-marks.js'];
const ENGINE_DEPS = ['handicap.js', 'money-engine.js', 'action-model.js', 'pool-engine.js'];

// ---------------------------------------------------------------------------
// FIXTURES
// ---------------------------------------------------------------------------
const CD = makeCourseData(18);
const P4 = makePlayers(['Ann A', 'Ben B', 'Cal C', 'Dee D'], [0, 0, 0, 0], 101);

// A 2v2 $25 gross match (Ann+Cal v Ben+Dee), Ann birdies every third hole so
// A wins. Each partner's exact share is $12.50 - the odd dollar the rounder
// has to hand out. `thruBy` = holes scored per golfer; `verified` sets the
// organizer's verification; `blank` deletes one hole (a picked-up ball).
function twoVtwo({ thruBy = [18, 18, 18, 18], verified = false, blank = null, extra = {} } = {}) {
    const scores = {};
    P4.forEach((p, i) => CD.forEach(h => { if (h.hole <= thruBy[i]) scores['p' + p.id + '_h' + h.hole] = h.par + ((i === 0 && h.hole % 3 === 0) ? -1 : 0); }));
    if (blank) delete scores[blank];
    const d = { players: P4, courseData: CD, scores, gameFormat: 'stroke', settlementMode: 'whole-dollar',
        sideMatches: { m: { format: 'match', scoring: 'gross', stake: 25, startHole: 1, createdAt: 1, teamAIds: ['101', '103'], teamBIds: ['102', '104'] } } };
    if (verified) d.scoresVerified = { verified: true, verifiedAt: 1, verifiedBy: 'round' };
    return Object.assign(d, extra);
}

// The KP fixture from trip_settlement_gate_test.js: 12 x $40 pool, KP $100;
// `confirmed:false` leaves $100 hanging.
const NAMES12 = ['Marty', 'Scott', 'Carp', 'Randy', 'Manny', 'Matt B', 'Lance', 'Kopp', 'Marcus', 'Rocco', 'Matt H', 'Jeremy'];
function poolRound({ confirmed = true, seed = 0 } = {}) {
    const cd = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
    const ps = NAMES12.map((n, i) => ({ id: 101 + i, name: n, hcp: '9', playingForMoney: true }));
    const sc = {};
    ps.forEach((p, pi) => cd.forEach((h, hi) => { sc['p' + p.id + '_h' + h.hole] = 4 + ((pi + hi + seed) % 3) - 1; }));
    const d = { players: ps, courseData: cd, scores: sc, gameFormat: 'stroke', settlementMode: 'whole-dollar',
        kpWinners: confirmed ? { h3: '101', h7: '105', h12: '109', h16: '102' } : {},
        moneyPool: { enabled: true, buyIn: 40, kp: { amount: 100, holes: [3, 7, 12, 16] }, net: { amount: 70, places: [57.142857, 42.857143] }, skins: { mode: 'remainder', scoring: 'net', carryOver: false } } };
    if (confirmed) d.kpConfirmed = { confirmed: true };
    return d;
}

// rounds: [{ label, data }]. Renders the money card, then opens the recap the
// way a golfer does (the button -> openTripRecap) and builds the share text.
function boot(rounds, deps = DEPS, name = 'Truth Trip') {
    const sb = loadHtmlInlineScript('trip.html', deps);
    const linked = rounds.map(r => ({ code: r.label.replace(/\W/g, '').toUpperCase(), label: r.label, countsTowardTrip: true, data: r.data }));
    vm.runInContext(`tripData = { name: ${JSON.stringify(name)} }; cachedRoundResults = ${JSON.stringify(linked)}; cachedCountedResults = cachedRoundResults;
        renderCumulativeLeaderboard(); renderTripMoneySettlement(); renderTripAwards(); openTripRecap();`, sb);
    return {
        sb,
        money: () => strip(sb.document.getElementById('trip-money-settlement').innerHTML),
        recap: () => strip(sb.document.getElementById('trip-recap-card').innerHTML),
        money0: () => strip0(sb.document.getElementById('trip-money-settlement').innerHTML),
        recap0: () => strip0(sb.document.getElementById('trip-recap-card').innerHTML),
        share: () => String(vm.runInContext('buildShareRecapText()', sb)),
        totals: () => JSON.parse(vm.runInContext('JSON.stringify(cachedTripTotals)', sb)),
        holds: () => JSON.parse(vm.runInContext('JSON.stringify(cachedTripHolds)', sb)),
        settled: () => vm.runInContext('cachedTripSettled', sb),
    };
}
function settle(data) {
    const sb = loadJsFile('settlement-engine.js', ENGINE_DEPS);
    sb.__d = data;
    return JSON.parse(vm.runInContext('JSON.stringify(computeRoundSettlement(__d, __d.courseData, __d.scores))', sb));
}
const net = (text, name) => { const m = text.match(new RegExp('\\|' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\|([+-]\\$\\d+(?:\\.\\d+)?)\\|')); return m ? m[1] : null; };

// ---------------------------------------------------------------------------
// THE BASELINE - the way v136-v145 were proved
// ---------------------------------------------------------------------------
describe('THE BASELINE: the two-round weekly trip renders as it did at cb42f1d, plus exactly the agree sentence', () => {
    const prev = JSON.parse(read('trip_money_final_prev.fixture.json'));
    test('the fixture is the one captured at cb42f1d', () => {
        assert.equal(sha8('trip_money_final_prev.fixture.json'), 'a723d391');
        assert.equal(prev.capturedAt, 'cb42f1d');
        assert.match(prev.money, /^\|🏁 Final "Who Pays Who"\|Randy → Marty\|\$74\|/);
    });
    const b = boot(linkedRounds().map(r => ({ label: r.label, data: r.data })), WEEKLY_DEPS, 'Myrtle Beach 2026');
    test('money card: old text with ONE insertion - the agree sentence after Net Across the Trip', () => {
        const expected = prev.money.replace('|Jeremy|-$74|Per-Round Breakdown|', '|Jeremy|-$74|Whether you settled up after each round or settle once at the end, the numbers are the same.|Per-Round Breakdown|');
        assert.notEqual(expected, prev.money, 'the substitution point exists in the fixture');
        assert.equal(b.money0(), expected);
    });
    // Re-pinned 2026-09-15 (awards made honest, trip_awards_honest_test.js): the
    // AWARDS block of the card and the text changed in exactly three ways - the
    // eleven-way birdie tie is named, Carp's two 9s are both said, the card's
    // Sandbagger carries its number. The money blocks are untouched.
    const AWARDS_SUBS = s => s
        .replace('|Marty| · Most Birdies (12)|', '|Marty, Scott, Randy and 8 more| · Most Birdies (12 birdies each over 2 rounds)|')   // + rounds played, 2026-09-16
        .replace('|9 on a par 4 · Hole 5, Caledonia|', '|Hole 5 (Par 4, shot 9) on Caledonia, and again Hole 5 (Par 4, shot 9) on True Blue|')
        .replace('| · Sandbagger of the Week|', '| · Sandbagger of the Week|23 net strokes under par over 2 rounds|')
        .replace('🐦 Most Birdies: Marty (12)', '🐦 Most Birdies: Marty, Scott, Randy and 8 more — 12 birdies each over 2 rounds')
        .replace('🎭 Sandbagger of the Week: Marty (23 net strokes under par)', '🎭 Sandbagger of the Week: Marty (23 net strokes under par over 2 rounds)')
        .replace('💥 Biggest Blow-Up: Carp, Hole 5 on Caledonia (shot 9 on a Par 4)', '💥 Biggest Blow-Up: Carp — Hole 5 (Par 4, shot 9) on Caledonia, and again Hole 5 (Par 4, shot 9) on True Blue');
    test('recap card and share text: cb42f1d\'s text with only the awards substitutions (both totals agree, every round finished)', () => {
        assert.notEqual(AWARDS_SUBS(prev.recap), prev.recap); assert.notEqual(AWARDS_SUBS(prev.share), prev.share);
        assert.equal(b.recap0(), AWARDS_SUBS(prev.recap));
        assert.equal(b.share(), AWARDS_SUBS(prev.share));
        assert.equal(b.totals().agree, true);
        assert.equal(b.settled(), true);
    });
});

// ---------------------------------------------------------------------------
// THE PREDICATE, in the engine
// ---------------------------------------------------------------------------
describe('computeRoundSettlement: who is still out, and what finishes a round', () => {
    test('all 18 scored, no verification: finished, scored, settled', () => {
        const s = settle(twoVtwo());
        assert.equal(s.settled, true); assert.equal(s.finished, true); assert.equal(s.scored, true); assert.equal(s.verified, false);
        assert.equal(s.playing, 4); assert.equal(s.thru, 18); assert.deepEqual(s.unfinished, []);
    });
    test('one golfer thru 9: unfinished, named with holes played, NOT settled', () => {
        const s = settle(twoVtwo({ thruBy: [18, 18, 18, 9] }));
        assert.equal(s.settled, false); assert.equal(s.finished, false); assert.equal(s.started, true);
        assert.equal(s.thru, 9);
        assert.deepEqual(s.unfinished, [{ id: 104, name: 'Dee D', holesPlayed: 9, holesRequired: 18 }]);
    });
    test('a picked-up ball (one blank hole, unverified) leaves the round unfinished - the app cannot tell it from "not there yet"', () => {
        const s = settle(twoVtwo({ blank: 'p104_h12' }));
        assert.equal(s.finished, false);
        assert.deepEqual(s.unfinished, [{ id: 104, name: 'Dee D', holesPlayed: 17, holesRequired: 18 }]);
    });
    test('a golfer who left after nine, VERIFIED by the organizer: finished (verification is the word for a deliberate blank)', () => {
        const s = settle(twoVtwo({ thruBy: [18, 18, 18, 9], verified: true }));
        assert.equal(s.finished, true); assert.equal(s.verified, true); assert.equal(s.scored, false); assert.equal(s.settled, true);
        assert.equal(s.unfinished.length, 1, 'still names who has holes left, for the record');
    });
    test('a roster name with no score never teed off, and is not waited for', () => {
        const s = settle(twoVtwo({ thruBy: [18, 18, 18, 0] }));
        assert.equal(s.finished, true); assert.equal(s.playing, 3); assert.deepEqual(s.unfinished, []);
    });
    test('no scores at all: not started, not finished, not settled', () => {
        const s = settle(twoVtwo({ thruBy: [0, 0, 0, 0] }));
        assert.equal(s.started, false); assert.equal(s.finished, false); assert.equal(s.settled, false); assert.equal(s.playing, 0);
    });
    test('a finished round with no KP recorded is NOT settled (2026-09-22): the blanks are held, kpSettled false, $100 named', () => {
        // Held until 2026-09-19, refunded 2026-09-19 to 2026-09-22, held again
        // since: KP money never goes back to the field.
        const s = settle(poolRound({ confirmed: false }));
        assert.equal(s.finished, true); assert.equal(s.kpSettled, false); assert.equal(s.kpUnresolvedCents, 10000); assert.equal(s.settled, false);
        const ok = settle(poolRound({ confirmed: true }));
        assert.equal(ok.kpSettled, true); assert.equal(ok.settled, true);
    });
});

// ---------------------------------------------------------------------------
// DECISION 1 - BOTH TOTALS
// ---------------------------------------------------------------------------
describe('BOTH TOTALS on a trip where they differ: three identical 2v2 $25 days', () => {
    const b = boot([1, 2, 3].map(n => ({ label: 'Day ' + n, data: twoVtwo() })));
    test('the engine measures the divergence: daily +36/+39 (-39/-36), once +37/+38 (-38/-37) - the exact $37.50 shares rounded ONCE by the engine\'s own reconciler', () => {
        const t = b.totals();
        assert.equal(t.agree, false);
        const d = Object.fromEntries(t.daily.map(v => [v.name, v.net])), o = Object.fromEntries(t.once.map(v => [v.name, v.net]));
        assert.deepEqual(d, { 'Ann A': 36, 'Cal C': 39, 'Ben B': -39, 'Dee D': -36 });
        assert.deepEqual(o, { 'Ann A': 37, 'Cal C': 38, 'Ben B': -38, 'Dee D': -37 });
        assert.equal(Object.values(o).reduce((a, v) => a + v, 0), 0, 'settle-once nets to zero');
        assert.equal(Object.values(d).reduce((a, v) => a + v, 0), 0, 'each day netted to zero, so their sum does');
    });
    test('the card shows both columns, each named in plain words, in the right order', () => {
        const m = b.money();
        const i = m.indexOf('|Settled after each round|Settled once at the end|');
        assert.ok(i > 0, 'both column heads, daily first: ' + m);
        assert.match(m, /\|Ann A\|\+\$36\|\+\$37\|/); assert.match(m, /\|Cal C\|\+\$39\|\+\$38\|/);
        assert.match(m, /\|Ben B\|-\$39\|-\$38\|/); assert.match(m, /\|Dee D\|-\$36\|-\$37\|/);
        assert.ok(!/numbers are the same/.test(m), 'no agree sentence when they differ');
    });
    test('the explanation is readable without the word "reconciled"', () => {
        const m = b.money();
        assert.match(m, /Settled after each round\|adds up what each day’s Results page said, so it is what you paid if you settled up every night\./);
        assert.match(m, /Settled once at the end\|nets every bet across the whole trip first and rounds to whole dollars once\./);
        assert.match(m, /the odd dollar can land on the same golfer more than once/);
        assert.match(m, /only your group knows which one it is doing/);
        assert.ok(!/reconcil/i.test(m));
    });
    test('Who Pays Who runs from the settle-once total and says so', () => {
        const m = b.money();
        assert.match(m, /^\|🏁 Final "Who Pays Who"\|This list is for settling once at the end\. If you settled up after each round there is nothing left to pay — see “Settled after each round” below\.\|/);
        assert.match(m, /\|Ben B → Cal C\|\$38\|Dee D → Ann A\|\$37\|Net Across/);
        assert.ok(!/\$39\|/.test(m.slice(0, m.indexOf('Net Across'))), 'no daily figure in the transfer list');
    });
    test('the recap card and the share text carry both totals', () => {
        const line = 'Who Pays Who above is for settling once at the end (Cal C +$38, Ann A +$37, Dee D -$37, Ben B -$38). If you settled up after each round, the days added up to: Cal C +$39, Ann A +$36, Dee D -$36, Ben B -$39. The two differ because each day rounded to whole dollars on its own.';
        assert.ok(b.recap().includes('|' + line + '|'), b.recap());
        assert.ok(b.share().includes('\n' + line + '\n'), b.share());
        assert.match(b.share(), /\n💵 FINAL SETTLEMENT\n/);
    });
});

describe('BOTH TOTALS on a trip where they agree: one number, and the sentence', () => {
    // Even stakes: a $50 1v1 match, no odd dollar anywhere.
    const even = () => twoVtwo({ extra: { sideMatches: { m: { format: 'match', scoring: 'gross', stake: 50, startHole: 1, createdAt: 1, teamAIds: ['101'], teamBIds: ['102'] } } } });
    const b = boot([1, 2, 3].map(n => ({ label: 'Day ' + n, data: even() })));
    test('agree: one column, the agree sentence, no column heads, no both-totals line anywhere', () => {
        const m = b.money();
        assert.equal(b.totals().agree, true);
        assert.match(m, /\|Net Across the Trip\|Ann A\|\+\$150\|Ben B\|-\$150\|Whether you settled up after each round or settle once at the end, the numbers are the same\.\|Per-Round Breakdown\|/);
        assert.ok(!/Settled after each round/.test(m)); assert.ok(!/This list is for settling once/.test(m));
        assert.ok(!/settling once at the end \(/.test(b.recap())); assert.ok(!/settling once at the end \(/.test(b.share()));
    });
});

// ---------------------------------------------------------------------------
// DECISION 2 - A ROUND STILL IN PLAY
// ---------------------------------------------------------------------------
describe('A HALF-PLAYED ROUND: named, counted, not called final', () => {
    const done = boot([{ label: 'Day 1', data: twoVtwo() }, { label: 'Day 2', data: twoVtwo() }]);
    const half = boot([{ label: 'Day 1', data: twoVtwo() }, { label: 'Day 2', data: twoVtwo({ thruBy: [18, 18, 18, 9] }) }]);
    test('the heading does not say Final; the card names the round, how far it is, and who is still out', () => {
        const m = half.money();
        assert.equal(half.settled(), false);
        assert.match(m, /^\|⚠️ Not Settled Yet\|Still in play: Day 2 — thru 9, 1 golfer still has holes left\. Its money so far is counted below\.\|These totals will change once those rounds are finished\.\|/);
        assert.match(m, /\|⏳ Who Pays Who — Not Final\|/);
        assert.ok(!/Final "Who Pays Who"/.test(m));
        assert.ok(!/KP results/.test(m), 'nothing about KPs on a trip with none');
    });
    test('its money still COUNTS: Day 2\'s nets are in the per-round breakdown and in the trip total', () => {
        const m = half.money();
        const day2 = m.slice(m.indexOf('|Day 2 — '));
        assert.ok(m.indexOf('|Day 2 — ') > 0, 'Day 2 is in the breakdown');
        assert.match(day2, /\|Ann A\|\+\$1[23]\|/, 'Day 2 thru 9 already pays the match: ' + day2);
        assert.equal(net(done.money(), 'Ann A'), net(half.money(), 'Ann A'), 'A finished Day 2 and a thru-9 Day 2 pay the same today - the money is counted, only the word changes');
        assert.equal(net(half.money(), 'Ann A'), '+$24');
    });
    test('the recap card and the share text say which round, in the same words', () => {
        assert.match(half.recap(), /\|2 rounds · still in progress\|/);
        assert.match(half.recap(), /\|💵 SETTLEMENT SO FAR\|/);
        assert.match(half.recap(), /\|⚠️ Not final — Day 2 is still in play\.\|/);
        assert.match(half.share(), /\n💵 SETTLEMENT SO FAR — NOT FINAL\nDay 2 is still in play\.\n/);
        assert.deepEqual(half.holds(), { inPlay: [{ label: 'Day 2', started: true, thru: 9, playing: 4, left: 1 }], kp: [] });
    });
    test('a round nobody has started is named as not started, and holds the trip open', () => {
        const b = boot([{ label: 'Day 1', data: twoVtwo() }, { label: 'Day 3', data: twoVtwo({ thruBy: [0, 0, 0, 0] }) }]);
        assert.match(b.money(), /^\|⚠️ Not Settled Yet\|Not started yet: Day 3\.\|These totals will change once those rounds are finished\.\|/);
        assert.match(b.recap(), /Not final — Day 3 has not started\./);
    });
    test('two rounds still out are both named, plural', () => {
        const b = boot([1, 2, 3].map(n => ({ label: 'Day ' + n, data: twoVtwo({ thruBy: n === 1 ? [18, 18, 18, 18] : [12, 12, 12, 12] }) })));
        assert.match(b.money(), /Still in play: Day 2 — thru 12, 4 golfers still have holes left\./);
        assert.match(b.money(), /Still in play: Day 3 — thru 12, 4 golfers still have holes left\./);
        assert.match(b.recap(), /Not final — Day 2, Day 3 are still in play\./);
    });
});

// RE-PINNED 2026-09-22 (KP never refunds), reversing 2026-09-19: a finished
// round with unrecorded KPs holds the trip again - its blanks are held in the
// pot, not refunded. The old "KP results are still unconfirmed in" sentence
// stays gone: nothing is "confirmed" any more, a hole is recorded or not.
describe('UNRECORDED KPs ON A FINISHED ROUND: the trip is held, nothing says unconfirmed', () => {
    const b = boot([{ label: 'Caledonia', data: poolRound({ confirmed: false }) }]);
    test('the trip is NOT settled and nothing says unconfirmed', () => {
        const m = b.money();
        assert.match(m, /Not Settled Yet/);
        assert.ok(!/unconfirmed/.test(m), m.slice(0, 120));
        assert.equal(b.settled(), false);
        assert.ok(!/unconfirmed/.test(b.recap() + b.share()));
    });
    test('CONTROL: the same round with its KPs recorded settles the trip', () => {
        const ok = boot([{ label: 'Caledonia', data: poolRound({ confirmed: true }) }]);
        assert.equal(ok.settled(), true);
        assert.ok(!/Not Settled Yet/.test(ok.money()));
    });
});

describe('A ROUND IN PLAY beside finished pool rounds: the in-play sentence alone, and the verb is "finished"', () => {
    const b = boot([{ label: 'Caledonia', data: poolRound({ confirmed: false }) }, { label: 'True Blue', data: poolRound({ confirmed: true, seed: 1 }) }, { label: 'Pine Lakes', data: twoVtwo({ thruBy: [18, 9, 18, 18], extra: { players: P4 } }) }]);
    test('the round in play is named; the finished pool rounds are not', () => {
        const m = b.money();
        assert.match(m, /^\|⚠️ Not Settled Yet\|Still in play: Pine Lakes — thru 9, 1 golfer still has holes left\. Its money so far is counted below\.\|These totals will change once those rounds are finished\.\|/);
        assert.equal(b.settled(), false);
        assert.match(b.recap(), /Not final — Pine Lakes is still in play\./);
        assert.match(b.share(), /NOT FINAL\nPine Lakes is still in play\.\n/);
    });
});

describe('EVERY ROUND FINISHED AND VERIFIED: says Final', () => {
    test('all 18 scored and verified on every round: Final, both totals shown or one number', () => {
        const b = boot([1, 2, 3].map(n => ({ label: 'Day ' + n, data: twoVtwo({ verified: true }) })));
        assert.equal(b.settled(), true);
        assert.match(b.money(), /^\|🏁 Final "Who Pays Who"\|/);
        assert.ok(!/Not Settled Yet/.test(b.money()));
        assert.match(b.money(), /\|Settled after each round\|Settled once at the end\|/, 'these three days differ, so both are shown');
        assert.match(b.share(), /\n💵 FINAL SETTLEMENT\n/);
        assert.deepEqual(b.holds(), { inPlay: [], kp: [] });
    });
    test('a golfer who left after nine on a VERIFIED round does not hold the trip open', () => {
        const b = boot([{ label: 'Day 1', data: twoVtwo() }, { label: 'Day 2', data: twoVtwo({ thruBy: [18, 18, 18, 9], verified: true }) }]);
        assert.equal(b.settled(), true);
        assert.match(b.money(), /^\|🏁 Final "Who Pays Who"\|/);
    });
});

// ---------------------------------------------------------------------------
// THE SEAMS (source, comments stripped)
// ---------------------------------------------------------------------------
describe('THE SEAMS', () => {
    const trip = stripComments(read('trip.html'));
    const engine = stripComments(read('settlement-engine.js'));
    test('the predicate is the engine\'s, and trip.html asks it - the old inline KP check is gone', () => {
        assert.match(engine, /\n    function computeRoundSettlement\(data, courseData, savedScores\) \{/);
        assert.match(engine, /const finished = verified \|\| scored;/);
        assert.match(engine, /const playing = totals\.filter\(t => t\.holesPlayed > 0\);/);
        assert.match(trip, /const settlement = computeRoundSettlement\(data, courseData, savedScores\);/);
        const fn = trip.slice(trip.indexOf('function renderTripMoneySettlement()'), trip.indexOf('\n    function ', trip.indexOf('function renderTripMoneySettlement()') + 30));
        assert.ok(fn.length > 3000, 'the renderer was sliced: ' + fn.length);
        assert.ok(!/computeMoneyPool/.test(fn), 'the renderer no longer asks pool-engine itself');
        assert.match(fn, /const tripSettled = unresolvedRounds\.length === 0 && inPlayRounds\.length === 0;/);
        assert.match(fn, /roundNetTotalsToWholeDollars\(onceByName, -unresolvedDollars\)/);
        assert.match(fn, /onceList\.forEach\(v => \{ netTotals\[v\.name\] = v\.net; \}\);/, 'Who Pays Who runs from the settle-once total');
    });
    test('the Receipt reads the same predicate now (its own paste, the same day - receipt_final_test.js)', () => {
        // v148 pinned the Receipt as untouched; v149 wired it. Both read the engine.
        assert.match(read('settlement.html'), /return computeRoundSettlement\(data, courseData \|\| \[\], savedScores \|\| \{\}\);/);
        assert.ok(/computeRoundSettlement/.test(read('HANDOFF.md')), 'HANDOFF names the predicate');
    });
});
