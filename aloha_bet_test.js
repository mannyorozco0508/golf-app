// ============================================================================
// v215 — THE ALOHA BET.
//
// "Double or nothing on the last hole", offered by the side that is DOWN money
// in a match, accepted by the side that is up.
//
// THE DECOMPOSITION THIS FILE HOLDS. An accepted Aloha is a ONE-HOLE,
// WINNER-TAKES-THE-STAKE wager on the match's last hole:
//     deficit D = |the match's net at offer time|
//     stake   S = D (double or nothing) or D/2 (half)
//     the winner of that hole takes S; a halved hole pays nobody.
// Every case in the brief falls out of that: double + losing side wins = the day
// is squared, double + leading side wins = the deficit doubles, half + either =
// the deficit moves by D/2. There is no second rule, and no case table.
//
// THE TWO TESTS THAT MATTER MOST, both below and neither skippable:
//   THREE PLACES AGREE   one accepted Aloha, and the SAME number in the Receipt
//                        segment, the itemised ledger line and the round's net
//                        totals. settlement-engine.js's own comment says no line
//                        can exist that the total does not contain; an Aloha
//                        added to the Receipt alone would be the $30-live-vs-
//                        $45-receipt defect again.
//   NEVER THE OTHER POTS a round with the Weekly Game, skins, KP and net finish
//                        all running: every one of those totals byte-identical
//                        with the Aloha accepted and with it declined.
//
// NO GOLF MATH MOVED. aloha-bet.js computes no strokes and no hole results: the
// match's net and the hole's winner both come from money-engine.js's
// calculateMatchEngine, untouched. This suite pins money-engine.js's sha, and
// settlement-engine.js is changed in exactly the three approved places.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha = (f) => crypto.createHash('sha256').update(read(f)).digest('hex').slice(0, 16);
const J = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
const run = (sb, c) => vm.runInContext(c, sb);

const A = (() => {
    try { return loadJsFile('aloha-bet.js'); }
    catch (e) { return { __missing: String((e && e.message) || e) }; }
})();
const CD18 = makeCourseData(18);
const CD9 = makeCourseData(18).slice(0, 9);            // holes 1..9
const HOLES = (cd) => cd.map(h => ({ hole: h.hole }));

// Two golfers, a $20 match. Scores are handed in per hole so a fixture can put
// the match exactly where a test needs it.
function pair() { return makePlayers(['Ann', 'Ben'], [0, 0], 101); }
function scoresFor(spec) {
    // spec: { 1: [annStrokes, benStrokes], ... }
    const s = {};
    Object.keys(spec).forEach(h => {
        const [a, b] = spec[h];
        if (a) s['p101_h' + h] = a;
        if (b) s['p102_h' + h] = b;
    });
    return s;
}
// Ann wins `annWins` of the first holes, then the rest are halved, leaving hole
// `upTo` and beyond unplayed.
function leadBy(annWins, played) {
    const spec = {};
    for (let h = 1; h <= played; h++) spec[h] = h <= annWins ? [4, 5] : [4, 4];
    return scoresFor(spec);
}
const match = (extra) => Object.assign({
    format: 'match', scoring: 'gross', stake: 20, startHole: 1,
    teamAIds: ['101'], teamBIds: ['102'], createdAt: 1
}, extra || {});
const offerInput = (extra) => Object.assign({
    data: { alohaAllowed: true },
    match: match(),
    matchHoles: HOLES(CD18),
    participantIds: ['101', '102'],
    scores: leadBy(1, 17),
    matchNet: 20            // side A up $20, so side B is down $20
}, extra || {});

// ---------------------------------------------------------------------------
describe('1. NO ENGINE MATH MOVED', () => {
    test('money-engine.js is byte-for-byte unchanged', () => {
        assert.equal(sha('money-engine.js'), '9653b6320c583b97', 'money-engine.js changed: ' + sha('money-engine.js'));  // v218: calculateMatchEngine moved OUT to match-engine.js. Deletion plus a pointer comment; no arithmetic moved, and match_engine_parity_test.js pins the 13-fixture corpus the three old copies agreed on.
    });
    test('aloha-bet.js computes no strokes and reads no scores except "is this hole blank"', () => {
        const src = read('aloha-bet.js');
        // WORD BOUNDARIES, not substrings: "par" is inside "separate" and
        // "compared", and the first version of this test failed on its own prose.
        ['getStrokes', 'hcpIndex', 'parseHcp', 'courseHandicap', 'strokesFor', 'netScore'].forEach(t =>
            assert.ok(!new RegExp('\\b' + t + '\\b').test(src), 'aloha-bet.js must not mention ' + t));
    });
});

// ---------------------------------------------------------------------------
describe('2. WHO MAY OFFER', () => {
    test('the side that is DOWN may offer', () => {
        const o = A.alohaOffer(offerInput());                 // A up 20, B down 20
        assert.equal(o.allowed, true, JSON.stringify(o));
        assert.equal(o.offeringSide, 'B');
        assert.equal(o.leadingSide, 'A');
        assert.equal(o.deficit, 20);
        assert.equal(A.alohaCanOfferAs(offerInput(), 'B'), true);
    });
    test('THE LEADER CAN NEVER OFFER', () => {
        assert.equal(A.alohaCanOfferAs(offerInput(), 'A'), false, 'side A is up and must be refused');
        // and the other way round, so this is not passing by always saying no
        const flipped = offerInput({ matchNet: -35 });         // B up 35, A down 35
        const o = A.alohaOffer(flipped);
        assert.equal(o.offeringSide, 'A');
        assert.equal(A.alohaCanOfferAs(flipped, 'A'), true, 'now A is down and may offer');
        assert.equal(A.alohaCanOfferAs(flipped, 'B'), false, 'and B, who is up, may not');
    });
    test('ALL SQUARE: nobody may offer, and the reason says so', () => {
        const o = A.alohaOffer(offerInput({ matchNet: 0 }));
        assert.equal(o.allowed, false);
        assert.equal(o.reason, A.ALOHA_REASONS.square, JSON.stringify(o));
        assert.equal(o.offeringSide, null);
        assert.equal(A.alohaCanOfferAs(offerInput({ matchNet: 0 }), 'A'), false);
        assert.equal(A.alohaCanOfferAs(offerInput({ matchNet: 0 }), 'B'), false);
    });
});

// ---------------------------------------------------------------------------
describe('3. WHEN IT MAY BE OFFERED', () => {
    test('the ROUND SETTING is off by default, and off means never', () => {
        assert.equal(A.alohaAllowedOnRound({}), false, 'absent = off');
        assert.equal(A.alohaAllowedOnRound({ alohaAllowed: false }), false);
        assert.equal(A.alohaAllowedOnRound({ alohaAllowed: 'yes' }), false, 'only a real true counts');
        assert.equal(A.alohaAllowedOnRound({ alohaAllowed: true }), true);
        const o = A.alohaOffer(offerInput({ data: {} }));
        assert.equal(o.allowed, false);
        assert.equal(o.reason, A.ALOHA_REASONS.off);
    });
    test('the LAST HOLE is the match\'s own last hole, not literally 18', () => {
        assert.equal(A.alohaLastHole(HOLES(CD18)), 18);
        assert.equal(A.alohaLastHole(HOLES(CD9)), 9, 'a nine-hole round ends on 9');
        assert.equal(A.alohaLastHole(HOLES(makeCourseData(18).slice(9))), 18, 'a back nine ends on 18');
        assert.equal(A.alohaLastHole([]), null);
        // and the offer carries it
        assert.equal(A.alohaOffer(offerInput()).lastHole, 18);
        assert.equal(A.alohaOffer(offerInput({ matchHoles: HOLES(CD9), scores: leadBy(1, 8) })).lastHole, 9);
    });
    test('A NINE-HOLE ROUND: the offer is live on hole 9', () => {
        const o = A.alohaOffer(offerInput({ matchHoles: HOLES(CD9), scores: leadBy(1, 8) }));
        assert.equal(o.allowed, true, JSON.stringify(o));
        assert.equal(o.lastHole, 9);
    });
    test('ONCE A SCORE LANDS ON THAT HOLE it is too late - ANY score, not all of them', () => {
        const oneIn = Object.assign(leadBy(1, 17), { p101_h18: 4 });
        const o = A.alohaOffer(offerInput({ scores: oneIn }));
        assert.equal(o.allowed, false);
        assert.equal(o.reason, A.ALOHA_REASONS.scored, JSON.stringify(o));
        // the other golfer's score alone closes it too
        const otherIn = Object.assign(leadBy(1, 17), { p102_h18: 5 });
        assert.equal(A.alohaOffer(offerInput({ scores: otherIn })).reason, A.ALOHA_REASONS.scored);
        // POSITIVE CONTROL: with hole 18 blank it IS allowed, so this is not
        // passing because the fixture refuses everything.
        assert.equal(A.alohaOffer(offerInput()).allowed, true);
    });
    test('ONE PER MATCH, EVER - offered, accepted or declined all count as used', () => {
        ['offered', 'accepted', 'declined'].forEach(status => {
            const o = A.alohaOffer(offerInput({ match: match({ aloha: { status } }) }));
            assert.equal(o.allowed, false, status);
            assert.equal(o.reason, A.ALOHA_REASONS.exists, status + ': ' + JSON.stringify(o));
        });
    });
    test('MATCHES ONLY - and a stroke side match is refused with its own reason', () => {
        ['match', 'nassau', 'bestball', 'scramble', 'ryder'].forEach(f =>
            assert.equal(A.alohaOffer(offerInput({ match: match({ format: f }) })).allowed, true, f));
        ['stroke', 'skins', 'wolf', 'dots', 'stableford', 'hilo'].forEach(f => {
            const o = A.alohaOffer(offerInput({ match: match({ format: f }) }));
            assert.equal(o.allowed, false, f);
            assert.equal(o.reason, A.ALOHA_REASONS.format, f + ': ' + JSON.stringify(o));
        });
    });
});

// ---------------------------------------------------------------------------
describe('4. THE AMOUNT, FROZEN AT OFFER TIME', () => {
    test('DOUBLE OR NOTHING is the whole deficit; HALF is half of it', () => {
        const o = A.alohaOffer(offerInput({ matchNet: 20 }));
        assert.equal(o.amounts.double, 20);
        assert.equal(o.amounts.half, 10);
        assert.equal(A.alohaStakeFor(20, 'double'), 20);
        assert.equal(A.alohaStakeFor(20, 'half'), 10);
        assert.equal(A.alohaStakeFor(20, undefined), 20, 'double or nothing is the default');
    });
    test('AN ODD DEFICIT HALVES TO CENTS, and is not refused for it', () => {
        assert.equal(A.alohaStakeFor(25, 'half'), 12.5);
        const rec = A.alohaOfferRecord(offerInput({ matchNet: -25 }), 'A', 'half', 111);
        assert.equal(rec.amount, 12.5, 'the half of an odd deficit stands: ' + JSON.stringify(rec));
    });
    test('the record a page writes: the side, the mode, the frozen amount, the hole', () => {
        // J() because the record crosses the vm realm: assert.deepEqual (strict)
        // compares prototypes and fails with "same structure but not
        // reference-equal" on an object built in the sandbox.
        const rec = J(A.alohaOfferRecord(offerInput(), 'B', 'double', 12345));
        assert.deepEqual(rec, { offeredBySide: 'B', mode: 'double', amount: 20, hole: 18, status: 'offered', offeredAt: 12345 });
    });
    test('and no record is produced for a side that may not offer, or a refused offer', () => {
        assert.equal(A.alohaOfferRecord(offerInput(), 'A', 'double', 1), null, 'the leader gets nothing to write');
        assert.equal(A.alohaOfferRecord(offerInput({ data: {} }), 'B', 'double', 1), null, 'nor does a round with it off');
        assert.equal(A.alohaOfferRecord(offerInput({ matchNet: 0 }), 'B', 'double', 1), null, 'nor an all-square match');
    });
});

// ---------------------------------------------------------------------------
describe('5. WHAT AN ACCEPTED ALOHA PAYS', () => {
    const accepted = (mode, amount) => ({ offeredBySide: 'B', mode, amount, hole: 18, status: 'accepted' });

    test('DOUBLE + the LOSING side wins the hole: the day is SQUARED', () => {
        // B was down 20 and offered; B wins 18 and takes 20, so the match net
        // (20 to A) plus the Aloha (-20 to A) is zero.
        const r = A.alohaResult(accepted('double', 20), 'B');
        assert.equal(r.settled, true);
        assert.equal(r.toSideA, -20);
        assert.equal(20 + r.toSideA, 0, 'squared');
    });
    test('DOUBLE + the LEADING side wins the hole: the deficit DOUBLES', () => {
        const r = A.alohaResult(accepted('double', 20), 'A');
        assert.equal(r.toSideA, 20);
        assert.equal(20 + r.toSideA, 40, 'doubled');
    });
    test('A HALVED HOLE pays nobody, and is still a settled bet', () => {
        const r = A.alohaResult(accepted('double', 20), null);
        assert.equal(r.settled, true);
        assert.equal(r.toSideA, 0);
        assert.equal(r.reason, 'halved');
    });
    test('HALF + the losing side wins: the deficit SHRINKS by half', () => {
        const r = A.alohaResult(accepted('half', 10), 'B');
        assert.equal(r.toSideA, -10);
        assert.equal(20 + r.toSideA, 10, 'a $20 deficit becomes $10');
    });
    test('HALF + the leading side wins: the deficit GROWS by half', () => {
        const r = A.alohaResult(accepted('half', 10), 'A');
        assert.equal(20 + r.toSideA, 30, 'a $20 deficit becomes $30');
    });
    test('DECLINED pays nothing', () => {
        const r = A.alohaResult({ status: 'declined', amount: 20, mode: 'double' }, 'B');
        assert.equal(r.settled, false);
        assert.equal(r.toSideA, 0);
        assert.equal(r.reason, 'declined');
    });
    test('OFFERED AND NEVER ANSWERED pays nothing - no timer needed', () => {
        const r = A.alohaResult({ status: 'offered', amount: 20, mode: 'double' }, 'A');
        assert.equal(r.settled, false);
        assert.equal(r.toSideA, 0);
        assert.equal(r.reason, 'offered');
    });
    test('and an absent or amountless record pays nothing', () => {
        assert.equal(A.alohaResult(null, 'A').toSideA, 0);
        assert.equal(A.alohaResult({ status: 'accepted', amount: 0 }, 'A').settled, false);
    });
    test('the hole\'s winner is read from the engine\'s own name, not guessed', () => {
        assert.equal(A.alohaSideOfWinner('Ann', 'Ann', 'Ben'), 'A');
        assert.equal(A.alohaSideOfWinner('Ben', 'Ann', 'Ben'), 'B');
        assert.equal(A.alohaSideOfWinner('Halved', 'Ann', 'Ben'), null);
        assert.equal(A.alohaSideOfWinner('', 'Ann', 'Ben'), null);
        assert.equal(A.alohaSideOfWinner('Somebody else', 'Ann', 'Ben'), null);
    });
});

// ---------------------------------------------------------------------------
// THE JOIN. Everything above is the rule; this is the money.
// ---------------------------------------------------------------------------
// pool-engine.js too: computeMoneyPool lives there, and section 7 asserts the
// Weekly Game pool does not move.
const ENGINE = () => loadJsFile('settlement-engine.js',
    ['handicap.js', 'match-engine.js', 'money-engine.js', 'action-model.js', 'pool-engine.js', 'aloha-bet.js']);

// A round with a real match on it, plus - deliberately - every other pot the
// Aloha must never touch.
function roundWith(alohaStatus, opts) {
    const o = opts || {};
    const players = makePlayers(['Ann', 'Ben', 'Cal', 'Dee'], [0, 0, 0, 0], 101);
    players[0].team = 'Team 1'; players[1].team = 'Team 2';
    players[2].team = 'Team 1'; players[3].team = 'Team 2';
    const scores = {};
    players.forEach(p => { for (let h = 1; h <= 18; h++) scores['p' + p.id + '_h' + h] = 4; });
    // THE MATCH IS CLOSED BEFORE 18, and that is the case the Aloha is FOR.
    // Side A wins holes 1 and 2, so at 2 up with one to play the engine closes it
    // (money-engine.js: |status| > holesLeft) and hole 18 cannot change the
    // match's own money. That is the only configuration in which "squared" and
    // "doubled" mean what the brief says: an OPEN match on 18 has its own money
    // move when the hole is won, and the Aloha lands on top of that - which is
    // real behaviour, pinned separately below.
    scores.p102_h1 = 5; scores.p104_h1 = 5;
    scores.p102_h2 = 5; scores.p104_h2 = 5;
    // Hole 18. Both golfers on the losing side are given the worse score so the
    // hole has the same winner for a 1v1 side match and for the 2v2 main game.
    const win = o.win || 'A';
    if (win === 'A') { scores.p102_h18 = 5; scores.p104_h18 = 5; }
    else if (win === 'B') { scores.p101_h18 = 5; scores.p103_h18 = 5; }
    const sm = {
        format: 'match', scoring: 'gross', stake: 20, startHole: 1,
        teamAIds: ['101'], teamBIds: ['102'], createdAt: 1
    };
    if (alohaStatus) {
        sm.aloha = { offeredBySide: 'B', mode: o.mode || 'double', amount: o.amount === undefined ? 20 : o.amount, hole: 18, status: alohaStatus };
    }
    return {
        eventName: 'monday', gameFormat: 'stroke', courseData: CD18, players, scores,
        alohaAllowed: true,
        sideMatches: { m1: sm },
        // The pots the Aloha must never reach.
        moneyPool: { enabled: true, buyIn: 20, kp: { amount: 0, holes: [] }, net: { amount: 40, places: [60, 40] }, skins: { mode: 'remainder', scoring: 'gross' } },
        additionalGames: { skins: { enabled: true, skinsBuyIn: 5, skinsPotFormat: 'gross', skinsScoring: 'gross', skinsCarryOver: false, startHole: 1 } },
        settlementMode: 'whole-dollar'
    };
}
const receiptsOf = (sb, d) => { sb.__d = J(d); return J(run(sb, 'buildSideMatchReceipts(__d, __d.courseData, __d.scores)')); };
const totalsOf = (sb, d) => { sb.__d = J(d); return J(run(sb, 'computeCombinedNetTotals(__d, __d.courseData, __d.scores)')); };
// computeCombinedNetTotals returns { netByName, exact, contributions,
// transactions }: the rounded balances, and the itemised lines per golfer keyed
// by the lowercased name. Read them as the pages do.
const netOf = (t, name) => {
    const row = (t.netByName || {})[String(name).trim().toLowerCase()];
    return row ? row.net : undefined;
};
const linesOf = (t, name) => {
    const c = (t.contributions || {})[String(name).trim().toLowerCase()];
    return (c && c.lines) || [];
};
const balances = (t) => J(t.netByName || {});

describe('6. THE THREE PLACES AGREE', () => {
    test('an accepted Aloha is ONE number in the Receipt segment, the ledger line and the net totals', () => {
        const sb = ENGINE();
        const d = roundWith('accepted', { win: 'A' });        // the LEADER wins 18 -> deficit doubles
        const r = receiptsOf(sb, d).find(x => x.matchId === 'm1');
        assert.ok(r, 'the match has a receipt');
        const seg = (r.segments || []).find(s => /Aloha/i.test(String(s.label)));
        assert.ok(seg, 'the Receipt shows an Aloha segment: ' + JSON.stringify((r.segments || []).map(s => s.label)));
        assert.equal(seg.stake, 20, 'at the frozen amount');
        assert.equal(seg.startHole, 18, 'on the last hole');
        assert.equal(seg.money, 20);
        assert.equal(seg.winner, 'Ann', 'the leader took it: ' + JSON.stringify(seg));
        // 1. the Receipt's own net for the match
        assert.equal(r.net, 40, 'the match net doubles from 20 to 40: ' + r.net);
        // 2. the itemised ledger line
        const t = totalsOf(sb, d);
        const annLines = linesOf(t, 'Ann');
        const alohaLine = annLines.find(l => /Aloha/i.test(String(l.label)));
        assert.ok(alohaLine, "Ann's ledger names the Aloha: " + JSON.stringify(annLines.map(l => l.label)));
        assert.equal(alohaLine.amount, 20, 'and for the same $20: ' + JSON.stringify(alohaLine));
        // 3. the net totals
        const withAloha = netOf(t, 'Ann');
        const without = netOf(totalsOf(sb, roundWith('declined', { win: 'A' })), 'Ann');
        assert.equal(withAloha - without, 20, "Ann's net is exactly $20 better: " + withAloha + ' vs ' + without);
    });
    test('and when the LOSING side wins the hole, all three move the other way', () => {
        const sb = ENGINE();
        const d = roundWith('accepted', { win: 'B' });        // B was down and wins 18 -> squared
        const r = receiptsOf(sb, d).find(x => x.matchId === 'm1');
        const seg = (r.segments || []).find(s => /Aloha/i.test(String(s.label)));
        assert.ok(seg, 'the segment is there');
        assert.equal(seg.winner, 'Ben');
        assert.equal(r.net, 0, 'the day is squared: ' + r.net);
        const t = totalsOf(sb, d);
        assert.equal(netOf(t, 'Ann'), netOf(totalsOf(sb, roundWith('declined', { win: 'B' })), 'Ann') - 20);
    });
    test('A HALVED LAST HOLE changes nothing anywhere, though the bet was accepted', () => {
        const sb = ENGINE();
        const acc = roundWith('accepted', { win: 'halved' });
        const dec = roundWith('declined', { win: 'halved' });
        const rAcc = receiptsOf(sb, acc).find(x => x.matchId === 'm1');
        const rDec = receiptsOf(sb, dec).find(x => x.matchId === 'm1');
        assert.equal(rAcc.net, rDec.net, 'the match net is untouched');
        assert.deepEqual(netOf(totalsOf(sb, acc), 'Ann'), netOf(totalsOf(sb, dec), 'Ann'));
    });
    test('DECLINED and UNANSWERED settle exactly like no Aloha at all', () => {
        const sb = ENGINE();
        const none = totalsOf(sb, roundWith(null, { win: 'A' }));
        ['declined', 'offered'].forEach(status => {
            const t = totalsOf(sb, roundWith(status, { win: 'A' }));
            assert.deepEqual(balances(t), balances(none), status + ' moved money');
        });
        // POSITIVE CONTROL in the same test: accepted DOES move it, so the
        // three comparisons above are not all of a system that never pays.
        const acc = totalsOf(sb, roundWith('accepted', { win: 'A' }));
        assert.notDeepEqual(balances(acc), balances(none), 'an accepted Aloha must move money');
    });
    test('THE HALF VARIANT, through the same path', () => {
        const sb = ENGINE();
        const d = roundWith('accepted', { win: 'A', mode: 'half', amount: 10 });
        const r = receiptsOf(sb, d).find(x => x.matchId === 'm1');
        const seg = (r.segments || []).find(s => /Aloha/i.test(String(s.label)));
        assert.match(String(seg.label), /half/i, 'the Receipt says which kind: ' + seg.label);
        assert.equal(seg.stake, 10);
        assert.equal(r.net, 30, 'a $20 deficit grows to $30: ' + r.net);
    });
    test('THE LEDGER STILL SUMS TO ZERO with an Aloha in it', () => {
        const sb = ENGINE();
        [null, 'declined', 'accepted'].forEach(status => {
            ['A', 'B', 'halved'].forEach(win => {
                const t = totalsOf(sb, roundWith(status, { win }));
                const sum = Object.keys(t.netByName || {}).reduce((n, k) => n + t.netByName[k].net, 0);
                assert.ok(Math.abs(sum) < 0.0001, status + '/' + win + ' is not zero-sum: ' + sum);
            });
        });
    });
});

describe('7. IT NEVER TOUCHES THE OTHER POTS', () => {
    // The round carries a Weekly Game (buy-in + net payout), skins and the net
    // finish. An Aloha is money between two sides of one match; none of those
    // four may move by a cent when it settles.
    const sb = ENGINE();
    const pool = (d) => { sb.__d = J(d); return J(run(sb, 'computeMoneyPool(__d, __d.courseData, __d.scores)')); };
    const skins = (d) => { sb.__d = J(d); return J(run(sb, 'computeSkinsHoleLedger(__d, __d.courseData, __d.scores)')); };

    test('the Weekly Game pool is byte-identical accepted vs declined', () => {
        const a = pool(roundWith('accepted', { win: 'A' }));
        const b = pool(roundWith('declined', { win: 'A' }));
        assert.deepEqual(a, b);
    });
    test('the skins ledger is byte-identical accepted vs declined', () => {
        const a = skins(roundWith('accepted', { win: 'A' }));
        const b = skins(roundWith('declined', { win: 'A' }));
        assert.deepEqual(a, b);
    });
    test('the ONLY money-moving line that appears is the Aloha, and no other pot\'s line moves', () => {
        const acc = totalsOf(sb, roundWith('accepted', { win: 'A' }));
        const dec = totalsOf(sb, roundWith('declined', { win: 'A' }));
        const moving = (t, k) => linesOf(t, k).filter(l => !l.note).map(l => l.label + ' | ' + l.amount).sort();
        const notes = (t, k) => linesOf(t, k).filter(l => l.note).map(l => l.label + ' | ' + l.amount).sort();
        ['ann', 'ben', 'cal', 'dee'].forEach(k => {
            const addedMoving = moving(acc, k).filter(x => moving(dec, k).indexOf(x) === -1);
            const lostMoving = moving(dec, k).filter(x => moving(acc, k).indexOf(x) === -1);
            assert.deepEqual(lostMoving, [], k + ' lost a money line: ' + JSON.stringify(lostMoving));
            if (k === 'ann' || k === 'ben') {
                assert.equal(addedMoving.length, 1, k + ' gains exactly one line: ' + JSON.stringify(addedMoving));
                        assert.match(addedMoving[0], /^Side Match · Aloha/, k + ': ' + addedMoving[0]);
            } else {
                // Cal and Dee are in the round's other pots and NOT in this match.
                assert.deepEqual(addedMoving, [], k + ' is not in the match and must not move: ' + JSON.stringify(addedMoving));
            }
            // NOTE LINES. Nothing a golfer was already being shown may vanish.
            const lostNotes = notes(dec, k).filter(x => notes(acc, k).indexOf(x) === -1);
            assert.deepEqual(lostNotes, [], k + ' lost an explanation: ' + JSON.stringify(lostNotes));
            // And any note that APPEARS must be part of this match's own breakdown.
            // The ledger only itemises a match once it has more than one segment,
            // so an accepted Aloha legitimately brings the match's own segments
            // with it - that is the Receipt's detail, not another pot's money.
            const addedNotes = notes(acc, k).filter(x => notes(dec, k).indexOf(x) === -1);
            addedNotes.forEach(x => assert.match(x, /Aloha|Overall Match|Front 9|Back 9|Press/,
                k + ': an unrelated explanation appeared: ' + x));
            if (k === 'cal' || k === 'dee') {
                assert.deepEqual(addedNotes, [], k + ' is not in the match: ' + JSON.stringify(addedNotes));
            }
        });
    });
    test('and the Aloha appears in the ledger\'s own per-segment detail, matching the Receipt', () => {
        const acc = totalsOf(sb, roundWith('accepted', { win: 'A' }));
        const detail = linesOf(acc, 'ann').filter(l => l.note && /Aloha/i.test(String(l.label)));
        assert.equal(detail.length, 1, "Ann's detail names the Aloha once: " + JSON.stringify(linesOf(acc, 'ann').map(l => l.label)));
        assert.match(String(detail[0].label), /H18/, 'on the last hole: ' + detail[0].label);
        assert.equal(detail[0].amount, 20, 'for the same $20 the Receipt printed');
    });
    test('a round with the setting OFF settles identically even with an accepted record on it', () => {
        // Belt and braces: the round-level gate is enforced at settlement too,
        // not only in the UI that wrote the record.
        const on = roundWith('accepted', { win: 'A' });
        const off = Object.assign(roundWith('accepted', { win: 'A' }), { alohaAllowed: false });
        const none = roundWith(null, { win: 'A' });
        assert.deepEqual(balances(totalsOf(sb, off)), balances(totalsOf(sb, none)),
            'with the setting off, an accepted record pays nothing');
        assert.notDeepEqual(balances(totalsOf(sb, on)), balances(totalsOf(sb, none)));
    });
});

describe('8. THE MAIN GAME, AND ALL THREE PLACES AGREE THERE TOO', () => {
    // v216. v215 shipped the side match only, because the approved wiring put the
    // main game's Aloha on the Receipt and NOT in the ledger - measured then as
    //     Receipt net 20 -> 40      ledger net 10 -> 10
    // which is the shape this block exists to prevent from ever coming back. The
    // fourth edit books it where the main game's money is actually booked, and the
    // last test here is that v215 measurement turned into a guard.
    const mainRound = (aloha, opts) => {
        const o = opts || {};
        const base = roundWith(null, { win: o.win || 'A' });
        return Object.assign({}, base, {
            gameFormat: 'match', matchScoring: 'gross', matchStake: 20, sideMatches: {},
            matchPresses: aloha ? { aloha } : {}
        });
    };
    const ACC = (extra) => Object.assign({ offeredBySide: 'B', mode: 'double', amount: 20, hole: 18, status: 'accepted' }, extra || {});
    // Ann and Cal are Team 1 (side A); Ben and Dee are Team 2. A $20 match, closed
    // 2 up before 18, so the hole itself cannot move the match's own money.
    const alohaLine = (t, name) => linesOf(t, name).filter(l => !l.note).find(l => /Aloha/i.test(String(l.label)));

    test('THE RECEIPT shows the Aloha segment on the main game', () => {
        const sb = ENGINE();
        const r = receiptsOf(sb, mainRound(ACC()))[0];
        const seg = (r.segments || []).find(x => /Aloha/i.test(String(x.label)));
        assert.ok(seg, 'a segment: ' + JSON.stringify((r.segments || []).map(x => x.label)));
        assert.equal(seg.stake, 20);
        assert.equal(seg.startHole, 18);
        assert.equal(seg.money, 20);
        assert.equal(r.net, 40, 'the match net doubles: ' + r.net);
    });
    test('THE LEDGER moves too - this is the v215 failure, fixed', () => {
        const sb = ENGINE();
        const withA = totalsOf(sb, mainRound(ACC()));
        const without = totalsOf(sb, mainRound(null));
        const line = alohaLine(withA, 'Ann');
        assert.ok(line, "Ann's ledger names it: " + JSON.stringify(linesOf(withA, 'Ann').map(l => l.label)));
        assert.equal(line.amount, 10, 'her half of the $20, two golfers a side: ' + line.amount);
        assert.equal(netOf(withA, 'Ann') - netOf(without, 'Ann'), 10, 'and her net moves by it');
        assert.equal(netOf(withA, 'Ben') - netOf(without, 'Ben'), -10, "and Ben's the other way");
    });
    test('THE THREE PLACES AGREE: the Receipt segment, the ledger line and the net totals', () => {
        const sb = ENGINE();
        const withA = totalsOf(sb, mainRound(ACC()));
        const without = totalsOf(sb, mainRound(null));
        const r = receiptsOf(sb, mainRound(ACC()))[0];
        const seg = (r.segments || []).find(x => /Aloha/i.test(String(x.label)));
        // one $20, three places: the segment, the four ledger lines, the four nets
        assert.equal(seg.money, 20);
        const booked = ['Ann', 'Cal'].reduce((n, k) => n + alohaLine(withA, k).amount, 0);
        assert.equal(booked, 20, 'side A is booked the whole $20 between them: ' + booked);
        const moved = ['Ann', 'Cal'].reduce((n, k) => n + (netOf(withA, k) - netOf(without, k)), 0);
        assert.equal(moved, 20, 'and their nets move by exactly that: ' + moved);
        const movedB = ['Ben', 'Dee'].reduce((n, k) => n + (netOf(withA, k) - netOf(without, k)), 0);
        assert.equal(movedB, -20, 'with side B down the same: ' + movedB);
    });
    test('THE OTHER DIRECTION: the losing side wins 18 and the day is squared', () => {
        const sb = ENGINE();
        const withA = totalsOf(sb, mainRound(ACC(), { win: 'B' }));
        const without = totalsOf(sb, mainRound(null, { win: 'B' }));
        const r = receiptsOf(sb, mainRound(ACC(), { win: 'B' }))[0];
        assert.equal(r.net, 0, 'squared: ' + r.net);
        assert.equal(netOf(withA, 'Ann') - netOf(without, 'Ann'), -10, "Ann's net drops by her half");
        assert.equal(netOf(withA, 'Ben') - netOf(without, 'Ben'), 10);
    });
    test('A HALVED LAST HOLE moves nothing, and DECLINED/UNANSWERED settle as no bet', () => {
        const sb = ENGINE();
        const none = totalsOf(sb, mainRound(null));
        assert.deepEqual(J(totalsOf(sb, mainRound(ACC(), { win: 'halved' })).netByName),
            J(totalsOf(sb, mainRound(null, { win: 'halved' })).netByName), 'a halved hole paid somebody');
        ['declined', 'offered'].forEach(status => {
            assert.deepEqual(J(totalsOf(sb, mainRound(ACC({ status }))).netByName), J(none.netByName), status + ' moved money');
        });
        // the positive control, in the same test
        assert.notDeepEqual(J(totalsOf(sb, mainRound(ACC())).netByName), J(none.netByName));
    });
    test('THE HALF VARIANT on the main game', () => {
        const sb = ENGINE();
        const r = receiptsOf(sb, mainRound(ACC({ mode: 'half', amount: 10 })))[0];
        const seg = (r.segments || []).find(x => /Aloha/i.test(String(x.label)));
        assert.match(String(seg.label), /half/i, seg.label);
        assert.equal(r.net, 30, 'a $20 deficit grows to $30: ' + r.net);
        const withA = totalsOf(sb, mainRound(ACC({ mode: 'half', amount: 10 })));
        assert.equal(alohaLine(withA, 'Ann').amount, 5, 'her quarter of the $10 pair-split: ' + alohaLine(withA, 'Ann').amount);
    });
    test('A STROKE-PLAY main game refuses it, the same as a stroke side match', () => {
        const sb = ENGINE();
        const stroke = Object.assign({}, mainRound(ACC()), { gameFormat: 'stroke', matchStake: 0 });
        const none = Object.assign({}, mainRound(null), { gameFormat: 'stroke', matchStake: 0 });
        assert.deepEqual(J(totalsOf(sb, stroke).netByName), J(totalsOf(sb, none).netByName),
            'a stroke-play main game must not settle an Aloha');
    });
    test('...and it is the FORMAT that refuses it, not just the absence of a stake', () => {
        // A stroke round can carry matchStake from a format the organizer looked at
        // and moved away from, so "no stake" is not what makes this safe - the format
        // list is. Without this case the format gate could be deleted and nothing
        // would notice.
        const sb = ENGINE();
        const stroke = Object.assign({}, mainRound(ACC()), { gameFormat: 'stroke', matchStake: 20 });
        const none = Object.assign({}, mainRound(null), { gameFormat: 'stroke', matchStake: 20 });
        assert.deepEqual(J(totalsOf(sb, stroke).netByName), J(totalsOf(sb, none).netByName),
            'a stroke-play round with a leftover matchStake must still refuse it');
        assert.equal(A.alohaMainGameMatch({ gameFormat: 'stroke', matchStake: 20,
            players: makePlayers(['Ann', 'Ben'], [0, 0], 101) }), null, 'and the shape refuses it outright');
    });
    test('THE LEDGER IS STILL ZERO-SUM with a main-game Aloha in it', () => {
        const sb = ENGINE();
        [null, ACC(), ACC({ status: 'declined' }), ACC({ mode: 'half', amount: 10 })].forEach(a => {
            ['A', 'B', 'halved'].forEach(win => {
                const t = totalsOf(sb, mainRound(a, { win }));
                const sum = Object.keys(t.netByName).reduce((n, k) => n + t.netByName[k].net, 0);
                assert.ok(Math.abs(sum) < 0.0001, JSON.stringify(a) + '/' + win + ' is not zero-sum: ' + sum);
            });
        });
    });
    test('THE v215 SHAPE, AS A GUARD: the Receipt and the ledger move together or not at all', () => {
        const sb = ENGINE();
        [{ win: 'A' }, { win: 'B' }, { win: 'halved' }].forEach(o => {
            const rA = receiptsOf(sb, mainRound(ACC(), o))[0].net;
            const rN = receiptsOf(sb, mainRound(null, o))[0].net;
            const tA = netOf(totalsOf(sb, mainRound(ACC(), o)), 'Ann');
            const tN = netOf(totalsOf(sb, mainRound(null, o)), 'Ann');
            assert.equal(rA !== rN, tA !== tN,
                o.win + ': the Receipt moved ' + (rA !== rN) + ' and the ledger moved ' + (tA !== tN)
                + ' (Receipt ' + rN + '->' + rA + ', ledger ' + tN + '->' + tA + ')');
        });
    });
    test('IT NEVER TOUCHES THE OTHER POTS on the main game either', () => {
        const sb = ENGINE();
        const pool = (d) => { sb.__d = J(d); return J(run(sb, 'computeMoneyPool(__d, __d.courseData, __d.scores)')); };
        const skins = (d) => { sb.__d = J(d); return J(run(sb, 'computeSkinsHoleLedger(__d, __d.courseData, __d.scores)')); };
        assert.deepEqual(pool(mainRound(ACC())), pool(mainRound(null)), 'the Weekly Game moved');
        assert.deepEqual(skins(mainRound(ACC())), skins(mainRound(null)), 'the skins ledger moved');
        // and the only money-moving line that appears anywhere is the Aloha
        const acc = totalsOf(sb, mainRound(ACC()));
        const dec = totalsOf(sb, mainRound(null));
        ['ann', 'ben', 'cal', 'dee'].forEach(k => {
            const moving = (t) => linesOf(t, k).filter(l => !l.note).map(l => l.label + ' | ' + l.amount).sort();
            const added = moving(acc).filter(x => moving(dec).indexOf(x) === -1);
            const lost = moving(dec).filter(x => moving(acc).indexOf(x) === -1);
            assert.deepEqual(lost, [], k + ' lost a line: ' + JSON.stringify(lost));
            assert.equal(added.length, 1, k + ' gains exactly one: ' + JSON.stringify(added));
            assert.match(added[0], /Aloha/, k + ': ' + added[0]);
        });
    });
    test('the main game\'s match shape agrees with the engine\'s own legacyMainAsSideMatch', () => {
        // FORCED DUPLICATION, tested rather than hoped. legacyMainAsSideMatch lives
        // in the protected file and cannot be exported to a page, so aloha-bet.js
        // carries its own alohaMainGameMatch for the offer UI. If the two ever
        // disagree about the teams, the scoring or the stake, the offer a golfer
        // sees and the money that settles come from two different matches.
        const sb = ENGINE();
        const d = mainRound(null);
        sb.__d = J(d);
        const legacy = J(run(sb, 'legacyMainAsSideMatch(__d)'));
        const mine = J(A.alohaMainGameMatch(d));
        assert.ok(legacy && mine, 'both produce a shape');
        ['format', 'scoring', 'stake', 'startHole'].forEach(k =>
            assert.deepEqual(mine[k], legacy[k], k + ': ' + mine[k] + ' vs ' + legacy[k]));
        assert.deepEqual(mine.teamAIds, legacy.teamAIds);
        assert.deepEqual(mine.teamBIds, legacy.teamBIds);
    });
    test('and it refuses the shapes legacyMainAsSideMatch refuses', () => {
        assert.equal(A.alohaMainGameMatch({ gameFormat: 'stroke', matchStake: 20, players: [] }), null, 'stroke play');
        assert.equal(A.alohaMainGameMatch({ gameFormat: 'match', matchStake: 0, players: [] }), null, 'no stake');
        const oneSided = { gameFormat: 'match', matchStake: 20, players: makePlayers(['Ann', 'Ben'], [0, 0], 101) };
        oneSided.players.forEach(p => { p.team = 'Team 1'; });
        assert.equal(A.alohaMainGameMatch(oneSided), null, 'nobody on the other side');
    });
});

// ---------------------------------------------------------------------------
// WHERE IT IS STORED, AND WHY THAT IS SAFE.
//
// The main game's Aloha lives at matchPresses/aloha because that is the only
// node under events/<code> which both holds the main game's wagers and is
// writable by a code-holder: database.rules.json gives matchPresses its own
// ".write", while a NEW top-level key would fall to the parent rule and be
// owner-only since PR #13 - a scorekeeper could neither offer nor accept.
//
// THE RISK THAT BUYS: money-engine.js reads Object.values(d.matchPresses) as the
// manual press list, and money-engine.js is protected and untouched. So the
// question is whether the Aloha record is mistaken for a press. MEASURED: it is
// ignored - it carries no baseId and no startHole, so nothing acts on it - and
// this is the guard that keeps it that way.
describe('9. THE ALOHA RECORD IS NOT A PRESS', () => {
    const M = loadJsFile('money-engine.js', ['handicap.js']);
    const two = () => {
        const ps = makePlayers(['Ann', 'Ben'], [0, 0], 101);
        ps[0].team = 'Team 1'; ps[1].team = 'Team 2';
        return ps;
    };
    const scores = (() => {
        const s = {};
        for (let h = 1; h <= 18; h++) { s['p101_h' + h] = 4; s['p102_h' + h] = 4; }
        s.p102_h1 = 5; s.p102_h2 = 5;
        return s;
    })();
    const calcWith = (presses) => J(M.calculateMatchEngine(two(), CD18, scores, 'gross', 'match', 'none', 20, 0, presses));

    test('calculateMatchEngine\'s answer is byte-identical with the Aloha record in the press list', () => {
        const aloha = { offeredBySide: 'B', mode: 'double', amount: 20, hole: 18, status: 'accepted' };
        const clean = calcWith([]);
        const withAloha = calcWith([aloha]);
        assert.equal(clean.t1TotalMoney, 20, 'the fixture is a live $20 match');
        assert.deepEqual(withAloha, clean, 'the Aloha record was read as a press');
        assert.equal(withAloha.pressCount, 0, 'and it created no press: ' + withAloha.pressCount);
    });
    test('CONTROL: a REAL press in that list does change the answer, so the test above is not vacuous', () => {
        const real = { baseId: '18', startHole: 3, stake: 20 };
        const changed = calcWith([real]);
        assert.notDeepEqual(changed, calcWith([]), 'a real press must move the match');
        assert.ok(changed.pressCount > 0, 'and it is counted: ' + changed.pressCount);
    });
    test('and the settled main game reads it as an Aloha, never as a press', () => {
        const sb = ENGINE();
        const base = roundWith(null, { win: 'A' });
        const main = Object.assign({}, base, {
            gameFormat: 'match', matchScoring: 'gross', matchStake: 20, sideMatches: {},
            matchPresses: { aloha: { offeredBySide: 'B', mode: 'double', amount: 20, hole: 18, status: 'accepted' } }
        });
        const labels = (receiptsOf(sb, main)[0].segments || []).map(x => String(x.label));
        assert.ok(!labels.some(l => /^Press/i.test(l)), 'never a press: ' + JSON.stringify(labels));
        assert.ok(labels.some(l => /Aloha/i.test(l)), 'and it IS the Aloha: ' + JSON.stringify(labels));
    });
});

// ---------------------------------------------------------------------------
// THE LOAD ORDER, which is money.
//
// settlement-engine.js calls alohaSettledForMatch through a `typeof` guard, the
// way it already calls nassauStakeConfig and sideMatchHoles. That guard is right
// - a page without the file must not throw - but it means a page that settles
// WITHOUT aloha-bet.js loaded would quietly settle the round as if no Aloha
// existed. Two pages, two totals, and no error anywhere. So every page that
// loads the settlement engine must load this file first, and that is asserted
// rather than remembered.
describe('10. EVERY SETTLING PAGE LOADS IT, BEFORE THE ENGINE', () => {
    const pages = fs.readdirSync(REPO_ROOT).filter(f => f.endsWith('.html'))
        .filter(f => read(f).indexOf('src="settlement-engine.js"') > -1);
    test('the set of settling pages is what this test thinks it is', () => {
        assert.ok(pages.length >= 8, 'found ' + pages.length + ': ' + pages.join(', '));
        ['settlement.html', 'index.html', 'leaderboard.html', 'sidematches.html', 'game.html'].forEach(p =>
            assert.ok(pages.indexOf(p) > -1, p + ' settles and must be in the list'));
    });
    pages.forEach(p => {
        test(p + ' loads aloha-bet.js before settlement-engine.js', () => {
            const s = read(p);
            const a = s.indexOf('src="aloha-bet.js"');
            const e = s.indexOf('src="settlement-engine.js"');
            assert.ok(a > -1, p + ' does not load aloha-bet.js at all');
            assert.ok(a < e, p + ' loads it AFTER the engine (aloha@' + a + ', engine@' + e + ')');
        });
    });
    test('and the engine calls it through a guard, so a page that somehow lacks it fails soft', () => {
        const eng = read('settlement-engine.js');
        const calls = (eng.match(/alohaSettledForMatch/g) || []).length;
        assert.ok(calls >= 2, 'the engine calls it for the Receipt and the ledger: ' + calls);
        assert.equal((eng.match(/typeof alohaSettledForMatch === 'function'/g) || []).length, 2,
            'both calls are guarded');
    });
});

// ---------------------------------------------------------------------------
// THE LEDGER LABEL IS COVERED BY THE TRIP FOOTER'S OWN CATEGORIES.
//
// trip.html's TRIP_TOTAL_INCLUDES is the sentence that tells a golfer what a trip
// total contains, and trip_money_truth_test.js holds every label the engine can
// emit against it - a new money source must be named or the suite fails. The
// Aloha is money on a side match, so its ledger label is prefixed "Side Match ·"
// and is covered by "side matches and presses". That is a claim about a string,
// so it is asserted rather than trusted.
describe('11. THE TRIP FOOTER ALREADY NAMES WHAT THIS IS', () => {
    test('the Aloha\'s ledger label starts "Side Match ·", the category the footer names', () => {
        const sb = ENGINE();
        const t = totalsOf(sb, roundWith('accepted', { win: 'A' }));
        const line = linesOf(t, 'ann').filter(l => !l.note).find(l => /Aloha/i.test(String(l.label)));
        assert.ok(line, 'there is an Aloha money line: ' + JSON.stringify(linesOf(t, 'ann').map(l => l.label)));
        assert.match(String(line.label), /^Side Match · Aloha/, line.label);
        // and the footer's list really does carry that category
        const trip = read('trip.html');
        const at = trip.indexOf('const TRIP_TOTAL_INCLUDES = [');
        const list = trip.slice(at, trip.indexOf('];', at));
        assert.match(list, /side matches and presses/, 'the footer names the category');
    });
    test('and it still names the Aloha in words a golfer reads', () => {
        const sb = ENGINE();
        const t = totalsOf(sb, roundWith('accepted', { win: 'A' }));
        const line = linesOf(t, 'ann').filter(l => !l.note).find(l => /Aloha/i.test(String(l.label)));
        assert.match(String(line.label), /double or nothing/i, 'the line says what the bet was: ' + line.label);
        assert.match(String(line.label), /Ann/, 'and who it was with: ' + line.label);
    });
});

// ---------------------------------------------------------------------------
// THE MATCHES TAB'S WIRING FOR THE MAIN GAME (v216). The offer row is shared with
// side matches, so what needs asserting is that the MAIN game's id routes to the
// right node and the right card - a write to sideMatches/__main would create a
// phantom side match, and the round's card is not a side match's scoped card.
describe('12. THE MAIN GAME\'S OFFER WRITES TO matchPresses/aloha', () => {
    const page = read('sidematches.html');
    test('the row is drawn for the main game, above the side matches', () => {
        assert.match(page, /const mainAlohaLine = mainGameAlohaRowHtml\(\);/, 'the row is built');
        assert.equal((page.match(/roundGamesLine \+ mainAlohaLine/g) || []).length, 2,
            'and rendered on both paths - with side matches and without');
    });
    test("'__main' routes to matchPresses/aloha, and a side match id to its own node", () => {
        const at = page.indexOf('function alohaRefFor(');
        assert.ok(at > 0, 'there is one place that decides the node');
        const fn = page.slice(at, page.indexOf('\n    function ', at + 30));
        assert.match(fn, /matchPresses\/aloha/, 'the main game: ' + fn);
        assert.match(fn, /sideMatches\/\$\{matchId\}\/aloha/, 'a side match: ' + fn);
        // and nothing writes a side match called __main
        assert.ok(!/sideMatches\/__main/.test(page), 'no phantom side match');
    });
    test('both writes go through it - the offer and the answer', () => {
        assert.equal((page.match(/db\.ref\(alohaRefFor\(matchId\)\)/g) || []).length, 2,
            'the offer and the response both use it');
        assert.ok(!/sideMatches\/\$\{matchId\}\/aloha`\)\s*\.(set|update)/.test(page),
            'and neither writes the side-match path directly any more');
    });
    test('the main game is measured over the ROUND\'s card, not a scoped one', () => {
        const at = page.indexOf('function alohaHolesFor(');
        assert.ok(at > 0, 'one place decides the card');
        const fn = page.slice(at, page.indexOf('\n    function ', at + 30));
        assert.match(fn, /__main/, fn);
        assert.match(fn, /currentData\.courseData/, fn);
    });
    test('a stroke-play round draws no row at all', () => {
        // alohaMainGameMatch is the gate, and it is the same one the engine uses.
        assert.equal(A.alohaMainGameMatch({ gameFormat: 'stroke', matchStake: 20, players: [] }), null);
    });
});
