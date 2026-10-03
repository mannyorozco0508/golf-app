// ============================================================================
// A CHALLENGE HOLDS NO MONEY, AND ACCEPTING IT CREATES NOTHING NEW (Wave 39)
//
// This is the STRICT half of the wave. A challenge is a new money-adjacent
// record, and there are exactly two things that could go wrong with it:
//
//   1. A PENDING OFFER COULD BE SETTLED. Somebody asks for a $20 Nassau,
//      nobody answers, and the Receipt pays it out. That must be impossible,
//      not merely filtered.
//   2. ACCEPTING COULD WRITE A DIFFERENT BET from the one the in-app creator
//      writes. Then two surfaces price the same terms differently, which is the
//      defect this project has already paid for with a per-press stake that
//      reached the engine but not the pages.
//
// HOW (1) IS IMPOSSIBLE RATHER THAN FILTERED. A challenge lives at
// events/<code>/challenges, and every engine that counts money reads
// sideMatches: money-engine, settlement-engine, pool-engine, bet-strip,
// side-match-lines, the Receipt. None of them has ever heard of challenges and
// none of them is being taught. So the proof below is not "a filter excluded
// it" - it is the same round settled twice, with and without a node full of
// pending challenges, and the money identical to the cent.
//
// HOW (2) IS GUARANTEED. saveSideMatch() no longer builds its own payload: it
// calls challenges.js sideMatchPayloadFromTerms(), which is the same function an
// accepted challenge calls. "Byte-identical" is therefore true by construction,
// and asserted here against the form's own field list so a field added to one
// path cannot be missed by the other.
//
// THE ENGINES ARE FROZEN BY SHA in this file, for the reason
// format_first_wizard_test.js freezes them: this wave must not touch arithmetic,
// and a hash is how that is checked rather than hoped for.
//
// BASELINE. Against pre-build main (0eb4a66) challenges.js does not exist, the
// require throws at load, and node reports the FILE as one failing test.
//
// MEASURED with a stub - every exported function present and returning undefined,
// the constants present and empty - over the FINISHED file, all 21 tests:
// 9 PASS / 12 FAIL. The module was restored by sha from a saved copy
// (7fc9ed67d513a1b1), never with git restore.
//
// RE-MEASURED when the group scoping landed: this header was first written
// against a 14-test file, and a baseline is a statement about the file as it
// stands rather than a historical record.
//
//   NINE PASSES IS A LOT, AND EIGHT OF THEM ARE THE POINT RATHER THAN A
//   WEAKNESS - they are the STRICT half, and they are meant to be true before
//   and after:
//     - the three settle-twice tests pass because nothing that counts money
//       reads the challenges node, which is the claim. They were already true on
//       main, and they must STAY true: if this wave had taught an engine to read
//       that node, they are what would have gone red.
//     - the no-engine scan and the engine sha pins likewise: they assert that
//       arithmetic did NOT move.
//     - the three source scans of sidematches.html - the shared field list, the
//       atomic accept, the status-only decline - pass because the PAGE was
//       already wired when the stub went in. They describe a tree where the page
//       had moved and the module had not.
//
//     - and the Receipt scan plus the page's use of the scoping rule, which are
//       also source scans of a page that was already wired.
//
//   THE TWELVE REDS are every rule the module owns: the three payload shapes, the
//   builder-versus-byhand settle, the status machine, who may answer, and all
//   five visibility rules - cross-group both ways, other groups refused, the two
//   phones, the spectator, and the ordering.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const sha12 = (f) => crypto.createHash('sha256').update(read(f)).digest('hex').slice(0, 12);

// The engines are loaded into ONE realm, the way a page loads them, so
// buildNassauWagerPayload is a global to challenges.js exactly as it is in the
// browser.
const vm = require('vm');
const ctx = { console, JSON, Math, Number, String, Object, Array, Boolean, isNaN,
              parseInt, parseFloat, Date, isFinite };
vm.createContext(ctx);
['handicap.js', 'match-engine.js', 'money-engine.js', 'action-model.js',
 'pool-engine.js', 'settlement-engine.js', 'grouping.js', 'challenges.js']
    .forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));

const cd18 = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const PLAYERS = [{ id: 101, name: 'Jimmy', hcp: '0' }, { id: 102, name: 'Manny', hcp: '0' },
                 { id: 103, name: 'Marty', hcp: '4' }, { id: 104, name: 'Dee', hcp: '9' }];
function scores(thru) {
    const s = {};
    PLAYERS.forEach((p) => cd18.forEach((h) => { if (h.hole <= thru) s['p' + p.id + '_h' + h.hole] = 4; }));
    [[1, 101], [3, 102], [5, 101], [7, 103], [9, 104], [11, 101], [13, 102]]
        .forEach(([h, w]) => { if (h <= thru) s['p' + w + '_h' + h] = 3; });
    return s;
}
const MATCH = {
    format: 'match', scoring: 'net', teamAIds: ['101'], teamBIds: ['102'],
    startHole: 1, stake: 20, pressRule: 'none', createdAt: 1
};
function round(over) {
    return Object.assign({
        players: PLAYERS, courseData: cd18, scores: scores(18), gameFormat: 'stroke',
        sideMatches: { live1: MATCH }
    }, over || {});
}
// Every pending shape a challenge can be in, so "no money" is not asserted
// against one example.
const PENDING = {
    c1: { from: '101', to: '102', status: 'pending', createdAt: 1,
          terms: { format: 'match', scoring: 'net', startHole: 1, stake: 20, pressRule: 'none' } },
    c2: { from: '103', to: '104', status: 'pending', createdAt: 2,
          terms: { format: 'nassau', scoring: 'net', startHole: 1, frontStake: 50, backStake: 50, overallStake: 100, pressRule: '2down', stake: 100 } },
    c3: { from: '101', to: '104', status: 'pending', createdAt: 3,
          terms: { format: 'stroke', scoring: 'gross', startHole: 1, holeStake: 25, overallStake: 250, tieRule: 'carry', overallMode: 'total', segment: '18' } },
    c4: { from: '102', to: '103', status: 'declined', createdAt: 4,
          terms: { format: 'match', scoring: 'net', startHole: 1, stake: 500, pressRule: 'none' } },
    c5: { from: '104', to: '101', status: 'cancelled', createdAt: 5,
          terms: { format: 'match', scoring: 'net', startHole: 1, stake: 900, pressRule: 'none' } }
};
// EVERY COMPARISON GOES THROUGH plain(). The engines run in a vm context, so
// their objects have that realm's prototypes and assert's deepStrictEqual fails
// on reference equality alone - "same structure but not reference-equal", which
// looks like a real difference and is not. CLAUDE.md records this; four suites in
// this repo already carry the same helper.
const plain = (v) => JSON.parse(JSON.stringify(v));
const money = (d) => plain(ctx.computeRoundMoneyByPlayer(d, d.courseData, d.scores));
const receipts = (d) => plain(ctx.buildSideMatchReceipts(d, d.courseData, d.scores));

// ===========================================================================
describe('1. A PENDING CHALLENGE NEVER REACHES A SETTLEMENT', () => {

    test('THE SAME ROUND, SETTLED WITH AND WITHOUT A NODE FULL OF CHALLENGES', () => {
        // The whole claim, in one assertion. $20 + $200 + $275 + $500 + $900 of
        // offers sitting in the data, and the money identical to the cent.
        const without = money(round());
        const withThem = money(round({ challenges: PENDING }));
        assert.deepEqual(withThem, without,
            'a challenge moved money. It lives at events/<code>/challenges and NOTHING that '
            + 'counts money reads that node - if this fails, something was taught to.');
        assert.ok(Object.keys(without).length > 0, 'the fixture settles something, so this is not vacuous');
    });

    test('and the RECEIPT describes the same bets, with no extra rows', () => {
        const a = receipts(round());
        const b = receipts(round({ challenges: PENDING }));
        assert.deepEqual(b, a);
        assert.equal(a.filter((r) => r.matchId === 'live1').length, 1, 'the real bet is on the receipt');
        assert.equal(b.filter((r) => /^c\d$/.test(String(r.matchId))).length, 0,
            'a challenge appeared as a receipt row');
    });

    test('a round whose ONLY action is a pending challenge settles nothing', () => {
        // computeRoundMoneyByPlayer answers { valid, formatLabel, message, players },
        // so the money is the players array - asserting over every top-level key
        // would compare `valid: true` against 0, which is what the first version
        // of this test did.
        const d = round({ sideMatches: {}, challenges: PENDING });
        const m = money(d);
        assert.ok(Array.isArray(m.players) && m.players.length === PLAYERS.length,
            'the fixture must settle a real field, or this is vacuous');
        m.players.forEach((p) => assert.equal(p.net, 0,
            p.name + ' was paid ' + p.net + ' from a bet nobody accepted'));
    });

    test('NO ENGINE MENTIONS challenges - the node is invisible to every one of them', () => {
        ['money-engine.js', 'settlement-engine.js', 'pool-engine.js', 'bet-strip.js',
         'side-match-lines.js', 'match-engine.js', 'action-model.js'].forEach((f) => {
            const code = read(f).replace(/(^|[^:])\/\/[^\n]*/g, '$1 ').replace(/\/\*[\s\S]*?\*\//g, ' ');
            assert.ok(!/challenges/.test(code),
                f + ' reads challenges. The safety model is that nothing which counts money '
                + 'knows the node exists - a filter can be forgotten, ignorance cannot.');
        });
    });

    test('THE ENGINES ARE UNTOUCHED, by sha', () => {
        // format_first_wizard_test.js freezes these for the same reason: a wave
        // that must not change arithmetic should be checked, not trusted.
        assert.equal(sha12('money-engine.js'), '12bfa41c2c8e');
        assert.equal(sha12('settlement-engine.js'), 'd9ee5e5a1afc');
        assert.equal(sha12('pool-engine.js'), '372e76d7d5c4');
        assert.equal(sha12('action-model.js'), '399ba26f0025');
        assert.equal(sha12('handicap.js'), '2d3b2f7fd916');
        assert.equal(sha12('helpers/match-engine-golden.json'), 'aa94f2749f5a',
            'the match-engine goldens moved - this wave changes no arithmetic');
    });
});

// ===========================================================================
describe('2. ACCEPTING BUILDS THE CREATOR\'S OWN PAYLOAD', () => {

    const ctxFor = (over) => Object.assign({ teamAIds: ['101'], teamBIds: ['102'], startHole: 7, now: 999 }, over || {});

    test('MATCH PLAY: exactly the fields the form writes, and no others', () => {
        const p = plain(ctx.sideMatchPayloadFromTerms({ format: 'match', scoring: 'net', stake: 20, pressRule: '2down' }, ctxFor()));
        assert.deepEqual(Object.keys(p).sort(),
            ['createdAt', 'format', 'pressRule', 'scoring', 'stake', 'startHole', 'teamAIds', 'teamBIds'].sort());
        assert.deepEqual(p, { format: 'match', scoring: 'net', teamAIds: ['101'], teamBIds: ['102'],
            startHole: 7, createdAt: 999, stake: 20, pressRule: '2down' });
    });

    test('STROKE: the five stroke fields, with the form\'s own defaults', () => {
        const p = plain(ctx.sideMatchPayloadFromTerms({ format: 'stroke', scoring: 'gross',
            holeStake: 5, overallStake: 50, tieRule: 'carry', overallMode: 'total', segment: '18' }, ctxFor()));
        assert.equal(p.holeStake, 5);
        assert.equal(p.overallStake, 50);
        assert.equal(p.segment, '18');
        assert.ok(!('stake' in p), 'a stroke bet has no single stake - the engines read the two');
        assert.ok(!('pressRule' in p), 'and no press rule');
    });

    test('NASSAU GOES THROUGH action-model.js, not a copy of it', () => {
        const p = plain(ctx.sideMatchPayloadFromTerms({ format: 'nassau', scoring: 'net',
            frontStake: 10, backStake: 10, overallStake: 20, pressRule: '2down', autoPressStake: null }, ctxFor()));
        const direct = plain(ctx.buildNassauWagerPayload({ teamAIds: ['101'], teamBIds: ['102'],
            frontStake: 10, backStake: 10, overallStake: 20, autoPressStake: null,
            pressRule: '2down', scoring: 'net', startHole: 7, createdAt: 999 }));
        Object.keys(direct).forEach((k) => assert.deepEqual(p[k], direct[k],
            'the Nassau field ' + k + ' differs from what action-model.js builds'));
        // The legacy mirror the engines still read.
        assert.equal(p.stake, 20);
    });

    test('A BET PRICED FROM THE BUILDER SETTLES THE SAME AS ONE WRITTEN BY HAND', () => {
        // The claim that actually matters: not that the keys match, but that the
        // money does. Same terms, two routes, one answer.
        const built = plain(ctx.sideMatchPayloadFromTerms(
            { format: 'match', scoring: 'net', stake: 20, pressRule: 'none' },
            { teamAIds: ['101'], teamBIds: ['102'], startHole: 1, now: 1 }));
        const byHand = MATCH;
        assert.deepEqual(money(round({ sideMatches: { x: built } })),
                         money(round({ sideMatches: { x: byHand } })));
    });

    test('THE FORM AND THE OFFER READ THE SAME FIELD LIST', () => {
        // A field added to one path and missed by the other is how the two
        // surfaces start pricing the same terms differently. Both lists are read
        // out of sidematches.html so this cannot drift silently.
        const src = read('sidematches.html');
        const slice = (needle) => {
            const at = src.indexOf(needle);
            assert.ok(at > -1, needle + ' is gone');
            return src.slice(at, src.indexOf('};', at));
        };
        const formFields = (s) => [...s.matchAll(/^\s{8,}(\w+):/gm)].map((m) => m[1]).sort();
        const saveSide = formFields(slice('const terms = {'));
        const challenge = formFields(slice('function challengeTermsFromForm() {'));
        assert.deepEqual(challenge, saveSide,
            'the challenge form and the side-match form read different fields:\n  save: '
            + saveSide.join(',') + '\n  challenge: ' + challenge.join(','));
        assert.ok(saveSide.length >= 12, 'both lists should carry every format\'s fields');
    });
});

// ===========================================================================
describe('2b. WHO SEES A CHALLENGE - THE SCOPING SIDE MATCHES ALREADY HAVE', () => {

    // grouping.js canLinkSeeWager() is the one rule, and it is derived from
    // PARTICIPANTS rather than a stored ownerGroup - which is what makes a
    // cross-group bet resolve to "mine" for BOTH groups by construction.
    const GROUP_OF = { 101: 1, 102: 1, 103: 1, 104: 1, 105: 2, 106: 2, 107: 2, 108: 2,
                       113: 4, 114: 4, 115: 4, 116: 4 };
    const CROSS = { id: 'x1', from: '116', to: '101', status: 'pending' };   // Group 4 v Group 1
    const LOCAL = { id: 'l1', from: '105', to: '106', status: 'pending' };   // both Group 2
    const see = (ch, who) => ctx.challengeVisibleTo(ch, Object.assign({ groupOf: GROUP_OF }, who));

    test('A CROSS-GROUP CHALLENGE SHOWS ON BOTH GROUPS\' CARDS - Group 4 v Group 1', () => {
        assert.equal(see(CROSS, { lockedGroup: 4 }), true, 'the challenger\'s group cannot see it');
        assert.equal(see(CROSS, { lockedGroup: 1 }), true, 'the opponent\'s group cannot see it');
    });

    test('AND ON NOBODY ELSE\'S, mid-round', () => {
        assert.equal(see(CROSS, { lockedGroup: 2 }), false,
            'Group 2 was shown a bet between Group 4 and Group 1');
        assert.equal(see(LOCAL, { lockedGroup: 1 }), false, 'Group 1 was shown Group 2\'s own bet');
        assert.equal(see(LOCAL, { lockedGroup: 2 }), true, 'and Group 2 cannot see its own');
    });

    test('THE TWO GOLFERS SEE THEIRS whatever link they hold', () => {
        // A following player holds no ?group= at all, so the link rule alone would
        // show them everything or nothing. It is their money, and if they are the
        // one it was sent to it is their decision.
        assert.equal(see(CROSS, { lockedGroup: null, meId: '116' }), true, 'the challenger');
        assert.equal(see(CROSS, { lockedGroup: null, meId: '101' }), true, 'the opponent');
        assert.equal(see(CROSS, { lockedGroup: null, meId: '105' }), false,
            'a playing golfer who is not in it was shown somebody else\'s offer');
    });

    test('A SPECTATOR SEES NONE - stricter than side matches, deliberately', () => {
        // The bare link is what gets forwarded to wives, friends and group chats.
        // A struck bet is part of the round's story; an unanswered offer between
        // two other people is not.
        assert.equal(see(CROSS, { lockedGroup: null }), false);
        assert.equal(see(LOCAL, { lockedGroup: null }), false);
        // AND THE OWNER SEES THEM ALL, because a pending offer nobody will answer
        // is theirs to tidy up - which is why challengeMayAnswer gives a
        // scorekeeper `cancel`.
        assert.equal(see(CROSS, { lockedGroup: null, isOwner: true }), true);
    });

    test('challengesVisible filters and keeps the offer order', () => {
        const data = { challenges: { b: Object.assign({ createdAt: 2 }, LOCAL),
                                     a: Object.assign({ createdAt: 1 }, CROSS) } };
        const forG4 = ctx.challengesVisible(data, { lockedGroup: 4, groupOf: GROUP_OF });
        assert.deepEqual(forG4.map((c) => c.id), ['a'], 'Group 4 sees only the one it is in');
        const forG2 = ctx.challengesVisible(data, { lockedGroup: 2, groupOf: GROUP_OF });
        assert.deepEqual(forG2.map((c) => c.id), ['b']);
        const owner = ctx.challengesVisible(data, { lockedGroup: null, isOwner: true, groupOf: GROUP_OF });
        assert.deepEqual(owner.map((c) => c.id), ['a', 'b'], 'oldest first, as offered');
    });

    test('AN ACCEPTED CHALLENGE IS SCOPED THE SAME WAY, and the Receipt is untouched', () => {
        // Accepted or pending, the visibility rule is the same - but by then it is
        // ALSO a side match, and Results and the Receipt list side matches. So an
        // accepted bet appears there exactly as it does today, through nothing
        // this rule does.
        const accepted = Object.assign({}, CROSS, { status: 'accepted' });
        assert.equal(see(accepted, { lockedGroup: 4 }), true);
        assert.equal(see(accepted, { lockedGroup: 2 }), false);
        const src = read('settlement.html');
        assert.ok(!/challenges/.test(src.replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')),
            'the Receipt reads challenges. It must list side matches and nothing else, so an '
            + 'accepted bet appears there as a bet and a pending one cannot appear at all.');
    });

    test('THE PAGE USES THE RULE, rather than listing every challenge', () => {
        const src = read('sidematches.html');
        const fn = src.slice(src.indexOf('function renderChallenges'), src.indexOf('async function acceptChallenge'));
        assert.match(fn, /challengesVisible\(currentData, \{/, 'the card list is not scoped at all');
        assert.match(fn, /lockedGroup: hasGroupLock \? lockedGroup : null/);
        assert.match(fn, /groupOf: buildPlayerGroupMap\(\)/, 'the group map must be the round\'s own');
        assert.ok(!/challengesPending\(currentData\)/.test(fn),
            'the unscoped list is still being used - every group would see every offer');
    });
});

// ===========================================================================
describe('3. DECLINE, WITHDRAW AND A SECOND ANSWER CREATE NOTHING', () => {

    test('only a PENDING challenge can be answered at all', () => {
        const pending = { status: 'pending' };
        assert.equal(ctx.challengeStatusAfter(pending, 'accept'), 'accepted');
        assert.equal(ctx.challengeStatusAfter(pending, 'decline'), 'declined');
        assert.equal(ctx.challengeStatusAfter(pending, 'cancel'), 'cancelled');
        assert.equal(ctx.challengeStatusAfter(pending, 'close'), 'closed');
        // A SECOND ANSWER IS NOT AN ANSWER. Two taps, a retry, or a notification
        // tapped after the scorekeeper already said yes would otherwise create a
        // second bet.
        ['accepted', 'declined', 'cancelled', 'closed'].forEach((st) => {
            assert.equal(ctx.challengeStatusAfter({ status: st }, 'accept'), null, st);
            assert.equal(ctx.challengeStatusAfter({ status: st }, 'decline'), null, st);
        });
        assert.equal(ctx.challengeStatusAfter(pending, 'something-else'), null);
        assert.equal(ctx.challengeStatusAfter(null, 'accept'), null);
    });

    test('THE ACCEPT WRITE IS ONE ATOMIC UPDATE - the bet and the answer cannot disagree', () => {
        // A crash between two separate writes would leave either a bet nobody
        // agreed to, or an accepted challenge with no bet. Asserted on the source
        // because the write itself needs a database.
        const src = read('sidematches.html');
        const fn = src.slice(src.indexOf('async function acceptChallenge'), src.indexOf('async function answerChallenge'));
        assert.match(fn, /db\.ref\(\)\.update\(updates\)/, 'the accept is not one update');
        assert.match(fn, /sideMatches\/\$\{matchKey\}/);
        assert.match(fn, /challenges\/\$\{id\}\/status/);
        assert.ok(!/\.set\(payload\)/.test(fn), 'a separate set() for the match is a second write');
    });

    test('DECLINE AND WITHDRAW TOUCH THE STATUS AND NOTHING ELSE', () => {
        const src = read('sidematches.html');
        const fn = src.slice(src.indexOf('async function answerChallenge'), src.indexOf('function renderSideMatches'));
        assert.match(fn, /challenges\/\$\{id\}`\)\s*\n?\s*\.update\(\{ status: next/);
        assert.ok(!/sideMatches/.test(fn),
            'declining writes to sideMatches. Nothing is created when a bet is refused.');
        assert.ok(!/\.remove\(/.test(fn),
            'the record of the offer survives - a removed one could be re-offered and re-answered');
    });

    test('WHO MAY ANSWER: the golfer it was sent to, or a scorekeeper. Nobody else.', () => {
        const ch = { from: '101', to: '102', status: 'pending' };
        assert.deepEqual(plain(ctx.challengeMayAnswer(ch, { meId: '102' })), { accept: true, decline: true, cancel: false });
        assert.deepEqual(plain(ctx.challengeMayAnswer(ch, { meId: '101' })), { accept: false, decline: false, cancel: true },
            'the challenger may withdraw and may not accept their own bet');
        assert.deepEqual(plain(ctx.challengeMayAnswer(ch, { meId: '103' })), { accept: false, decline: false, cancel: false },
            'a bet between two other people is not theirs to answer');
        assert.deepEqual(plain(ctx.challengeMayAnswer(ch, { meId: null })), { accept: false, decline: false, cancel: false },
            'a spectator has picked no name and has no money in anything');
        // THE SCOREKEEPER ANSWERS FOR GOLFERS WITHOUT THE APP, exactly as their
        // bets are created for them in person today.
        assert.deepEqual(plain(ctx.challengeMayAnswer(ch, { meId: '103', isScorekeeper: true })),
            { accept: true, decline: true, cancel: true });
        // AND AN ANSWERED ONE IS CLOSED TO EVERYONE.
        assert.deepEqual(plain(ctx.challengeMayAnswer({ from: '101', to: '102', status: 'accepted' }, { meId: '102', isScorekeeper: true })),
            { accept: false, decline: false, cancel: false });
    });
});
