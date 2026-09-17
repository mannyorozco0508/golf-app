// ============================================================================
// TRIP IDENTITY - ASK ON COLLISION, SHOW THE ROSTER
//
// A trip keys every golfer by normalised name. Two different people who share
// a name on different days merge into one balance; one person typed two ways
// becomes two golfers. Shape (b) from the 2026-09-17 recon: a MAPPING TABLE on
// the trip record - trips/<code>/identity/<roundCode>/<playerId> = "g<n>" -
// written only when the organizer answers a question the app asks only when
// two spellings collide, read by ONE function (tripGolferKey) that every keyed
// surface calls. No mapping, no collision: byte-identical to before.
//
// THE PROOF OF "BYTE-IDENTICAL". trip_identity_prev.fixture.json holds the six
// keyed surfaces - cumulative board, money, points, awards, recap card, share
// text - as tag-stripped text captured at 1ef9b27 (v164), before any of this
// existed, for five trips (helpers/trip-identity-rounds.js). Today's page,
// with no identity node, must render every one identically. The roster and
// the question sit in their own mounts, outside the six.
//
// THE RULE is proved by targaryen on database.rules.json with
// trip_identity.tests-data.json (accepted shape, refused values, refused
// player id, refused unknown round).
//
// WHAT MINI-DOM CANNOT DO: tap. The buttons are exercised in Chrome by
// tools/trip-identity-check.js; here the page's own answer function is called
// with the index the button passes, and the write it makes is read back.
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { DEPS } = require('./helpers/trip-weekly-rounds.js');
const { trips, roundOf, linked } = require('./helpers/trip-identity-rounds.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha8 = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO_ROOT, f))).digest('hex').slice(0, 8);
const strip = h => String(h == null ? '' : h).replace(/<[^>]+>/g, '|').replace(/[\s|]*\|[\s|]*/g, '|').replace(/\s+/g, ' ').trim();
const FIXTURE = 'trip_identity_prev.fixture.json';
const FIXTURE_SHA = '3309154c';
const PREV = JSON.parse(read(FIXTURE)).trips;
const T = trips();

// The page as the trip listener leaves it, then the same render sequence
// refreshTripComputations runs.
function arrive(rounds, identity) {
    const sb = loadHtmlInlineScript('trip.html', DEPS);
    vm.runInContext(`tripData = ${JSON.stringify({ name: 'Myrtle Beach 2026', identity })}; currentTripCode = 'TRIP1';
        cachedRoundResults = ${JSON.stringify(rounds)}; cachedCountedResults = cachedRoundResults.filter(r => r.countsTowardTrip);
        window.__alerts = []; alert = m => window.__alerts.push(String(m));
        recomputeTripGate(); renderTripRoster(); renderTripIdentityQuestions();
        renderCumulativeLeaderboard(); renderTripMoneySettlement(); renderTripAwards(); renderPointsRace(); openTripRecap();`, sb);
    return sb;
}
const el = (sb, id) => strip((sb.document.getElementById(id) || {}).innerHTML || '');
const six = sb => ({ board: el(sb, 'trip-leaderboard'), money: el(sb, 'trip-money-settlement'), points: el(sb, 'trip-points-race'),
    awards: el(sb, 'trip-awards'), card: el(sb, 'trip-recap-card'), text: String(vm.runInContext('buildShareRecapText()', sb)) });
const roster = sb => el(sb, 'trip-roster');
const questions = sb => el(sb, 'trip-identity-questions');
const identityWrites = sb => sb.__dbWrites.filter(w => /^trips\/TRIP1\/identity$/.test(w.path));

describe('NO MAPPING, NO COLLISION: BYTE-IDENTICAL TO 1ef9b27 ON ALL SIX SURFACES', () => {
    test('the fixture is the one captured at 1ef9b27', () => {
        assert.equal(sha8(FIXTURE), FIXTURE_SHA);
        assert.deepEqual(Object.keys(PREV).sort(), ['clean', 'mikes', 'oneRound', 'sameKey', 'weekly']);
        assert.ok(PREV.clean.money.includes('Carp Dean → Marty Sharp') && PREV.weekly.text.length > 1000, 'captured with content');
    });
    ['clean', 'weekly', 'oneRound', 'sameKey', 'mikes'].forEach(k => {
        test(`${k}: six surfaces identical with no identity node`, () => {
            assert.deepEqual(six(arrive(T[k])), PREV[k]);
        });
        test(`${k}: identical with an EMPTY identity node too (an old trip that never answered)`, () => {
            assert.deepEqual(six(arrive(T[k], {})), PREV[k]);
        });
    });
});

describe('THE ROSTER, always visible', () => {
    test('one line per golfer with how many of the trip\'s rounds they are in', () => {
        const sb = arrive(T.clean);
        assert.equal(roster(sb), '|Carp Dean|in 2 of 2 rounds|Lance Webb|in 2 of 2 rounds|Marty Sharp|in 2 of 2 rounds|Zach Hill|in 2 of 2 rounds|');
    });
    test('a one-round trip says "in 1 round", never "1 of 1"', () => {
        const sb = arrive(T.oneRound);
        assert.equal(roster(sb), '|Carp Dean|in 1 round|Lance Webb|in 1 round|Marty Sharp|in 1 round|Zach Hill|in 1 round|');
        assert.ok(!/of 1/.test(roster(sb)));
    });
    test('THE TELL: two different Mikes with one exact name merge, and the roster shows "Mike · in 2 of 2 rounds" - no question is asked because nothing can tell them apart', () => {
        const sb = arrive(T.sameKey);
        assert.match(roster(sb), /\|Mike\|in 2 of 2 rounds\|/);
        assert.equal(questions(sb), '', 'no collision signal exists for an exact key');
    });
    test('a golfer listed with no scores is still on the roster; a round nobody has started is still a round', () => {
        const r = linked([roundOf('Day 1', ['Ann A', 'Ben B'], s => { Object.keys(s).forEach(k => { if (/^p102_/.test(k)) delete s[k]; }); }),
                          roundOf('Day 2', ['Ann A', 'Cal C'], s => { Object.keys(s).forEach(k => delete s[k]); })]);
        const sb = arrive(r);
        assert.equal(roster(sb), '|Ann A|in 2 of 2 rounds|Ben B|in 1 of 2 rounds|Cal C|in 1 of 2 rounds|');
    });
    test('an excluded round is not counted', () => {
        const r = T.clean.map((x, i) => Object.assign({}, x, { countsTowardTrip: i === 0 }));
        const sb = arrive(r);
        assert.match(roster(sb), /\|Marty Sharp\|in 1 round\|/);
    });
    test('no rounds: "No rounds yet."', () => {
        const sb = loadHtmlInlineScript('trip.html', DEPS);
        vm.runInContext(`tripData = { name: 'T' }; currentTripCode = 'TRIP1'; cachedRoundResults = []; cachedCountedResults = []; renderTripRoster();`, sb);
        assert.equal(roster(sb), '|No rounds yet.|');
    });
    test('the roster lines come BEFORE the question cards in the markup, in their own mounts', () => {
        const src = read('trip.html');
        const a = src.indexOf('id="trip-roster"'), b = src.indexOf('id="trip-identity-questions"'), c = src.indexOf('id="trip-placeholder-warning"'), d = src.indexOf('id="rounds-list"');
        assert.ok(d < a && a < b && b < c, 'rounds list, then roster, then questions, then the placeholder warning and the boards');
    });
});

describe('THE COLLISIONS - the only reasons the app asks', () => {
    test('form B (bare first name vs first + initial) and form A (punctuation) are both asked, in the drafted wording', () => {
        const sb = arrive(T.mikes);
        const q = questions(sb);
        assert.match(q, /\|Same golfer\?\|Matt B\|\(Day 1\) and\|Matt B\.\|\(Day 2\) — the trip adds up money and standings by name, so it needs to know whether that is one person typed two ways or two people\.\|One golfer\|Two people\|Nothing is merged or split until you answer\. You can change this later\.\|/);
        assert.match(q, /\|Same golfer\?\|Mike\|\(Day 1\) and\|Mike H\|\(Day 2\) — the trip adds up money and standings by name/);
        assert.equal((q.match(/Same golfer\?/g) || []).length, 2);
        assert.ok(!/duplicate|wrong|fix|error/i.test(q), 'a question, not an accusation');
    });
    test('a bare name and an initialled name IN THE SAME ROUND are two people by construction - not asked', () => {
        const r = linked([roundOf('Day 1', ['Mike', 'Mike H', 'Lance Webb', 'Zach Hill']), roundOf('Day 2', ['Mike', 'Mike H', 'Lance Webb', 'Zach Hill'])]);
        assert.equal(questions(arrive(r)), '');
    });
    test('no collision -> no question (clean, weekly, oneRound)', () => {
        ['clean', 'weekly', 'oneRound'].forEach(k => assert.equal(questions(arrive(T[k])), '', k));
    });
    test('case-only differences are one key already and are not asked; two different first names are not a collision', () => {
        const r = linked([roundOf('Day 1', ['PAUL', 'Ann A']), roundOf('Day 2', ['Paul', 'Ann A'])]);
        assert.equal(questions(arrive(r)), '');
        const r2 = linked([roundOf('Day 1', ['Mike', 'Ann A']), roundOf('Day 2', ['Mark H', 'Ann A'])]);
        assert.equal(questions(arrive(r2)), '');
    });
    test('placeholders are the gate\'s business, not a question', () => {
        const r = linked([roundOf('Day 1', ['Player 1', 'Ann A']), roundOf('Day 2', ['Player 1 x', 'Ann A'])]);
        assert.ok(!/Player 1/.test(questions(arrive(r))));
    });
    test('handicap drift is NOT a signal', () => {
        const r = linked([roundOf('Day 1', ['Paul', 'Ann A']), roundOf('Day 2', ['Paul', 'Ann A'])]);
        r[0].data.players[0].hcp = '11'; r[1].data.players[0].hcp = '';
        assert.equal(questions(arrive(r)), '');
    });
});

describe('THE ANSWER writes the map, and every keyed surface uses it', () => {
    test('"One golfer" writes the same g-id on both spellings, in every counted round, in one update', () => {
        const sb = arrive(T.mikes);
        vm.runInContext(`answerTripIdentity(1, 'one')`, sb);   // card 1 = Mike / Mike H (cards sort by key)
        const w = identityWrites(sb);
        assert.equal(w.length, 1);
        assert.deepEqual(JSON.parse(JSON.stringify(w[0].value)), { 'R0/101': 'g1', 'R1/101': 'g1' });
    });
    test('"Two people" writes two g-ids', () => {
        const sb = arrive(T.mikes);
        vm.runInContext(`answerTripIdentity(1, 'two')`, sb);
        assert.deepEqual(JSON.parse(JSON.stringify(identityWrites(sb)[0].value)), { 'R0/101': 'g1', 'R1/101': 'g2' });
    });
    test('answered as ONE golfer: one balance, one roster line "in 2 of 2 rounds", the awards count him once, the question becomes a line with Change', () => {
        const sb = arrive(T.mikes, { R0: { 101: 'g1' }, R1: { 101: 'g1' } });
        const s = six(sb);
        assert.match(s.money, /\|Net Across the Trip\|Zach Hill\|\+\$50\|Mike H\|\$0\|Matt B\|-\$50\|/, 'Day 1 +50 and Day 2 -50 net to $0 for one golfer, labelled by the longest spelling');
        const totals = s.money.slice(0, s.money.indexOf('Per-Round Breakdown'));
        assert.ok(!/\|Mike\|/.test(totals), 'no separate "Mike" line in the trip totals (the per-round breakdown still prints each day\'s own names)');
        assert.match(roster(sb), /\|Mike H\|in 2 of 2 rounds\|/);
        assert.ok(!/\|Mike\|in 1 of 2/.test(roster(sb)));
        assert.match(s.board, /\|Mike H\|2 rounds played\|/);
        assert.match(questions(sb), /\|Mike and Mike H are one golfer\.\|Change\|/);
        assert.ok(/Same golfer\?\|Matt B\|/.test(questions(sb)), 'the other, unanswered pair is still asked');
    });
    test('answered as TWO people: two balances, two roster lines, each counted separately - identical to the unmapped money (which was already two names)', () => {
        const sb = arrive(T.mikes, { R0: { 101: 'g1' }, R1: { 101: 'g2' } });
        const s = six(sb);
        assert.equal(s.money, PREV.mikes.money);
        assert.match(roster(sb), /\|Mike\|in 1 of 2 rounds\|Mike H\|in 1 of 2 rounds\|/);
        assert.match(questions(sb), /\|Mike and Mike H are two people\.\|Change\|/);
        assert.ok(!/Same golfer\?\|Mike\|/.test(questions(sb)), 'the answered pair is not asked again');
    });
    test('THE INVISIBLE CASE, split by the map: two exact "Mike"s mapped to two g-ids become two balances and two roster lines', () => {
        const sb = arrive(T.sameKey, { R0: { 101: 'g1' }, R1: { 101: 'g2' } });
        const s = six(sb);
        // Two people with one spelling are told apart by their rounds, everywhere.
        assert.match(s.money, /\|Mike \(Day 1\)\|\+\$50\|/); assert.match(s.money, /\|Mike \(Day 2\)\|-\$50\|/);
        assert.match(s.money, /\|Mike \(Day 2\) → Zach Hill\|\$50\|/, 'who pays who names the right Mike');
        assert.match(roster(sb), /\|Mike \(Day 1\)\|in 1 of 2 rounds\|Mike \(Day 2\)\|in 1 of 2 rounds\|/);
        assert.match(s.board, /\|Mike \(Day 1\)\|1 round played\|/);
    });
    test('points and awards key by the map too: one golfer\'s rounds add up under one label', () => {
        const one = six(arrive(T.mikes, { R0: { 101: 'g1' }, R1: { 101: 'g1' } }));
        const two = six(arrive(T.mikes, { R0: { 101: 'g1' }, R1: { 101: 'g2' } }));
        assert.match(one.points, /\|Mike H\|2 rounds played\|/, 'points: one golfer over two rounds');
        assert.match(two.points, /\|Mike H\|1 round played\|/); assert.match(two.points, /\|Mike\|1 round played\|/);
        assert.notEqual(one.awards, two.awards, 'the awards differ between one golfer and two');
    });
    test('Change on a "one golfer" answer splits the second spelling to a fresh g-id; on a "two people" answer joins it', () => {
        const one = arrive(T.mikes, { R0: { 101: 'g1' }, R1: { 101: 'g1' } });
        vm.runInContext(`changeTripIdentity(0)`, one);
        assert.deepEqual(JSON.parse(JSON.stringify(identityWrites(one)[0].value)), { 'R1/101': 'g2' });
        const two = arrive(T.mikes, { R0: { 101: 'g1' }, R1: { 101: 'g2' } });
        vm.runInContext(`changeTripIdentity(0)`, two);
        assert.deepEqual(JSON.parse(JSON.stringify(identityWrites(two)[0].value)), { 'R1/101': 'g1' });
    });
    test('the share text and the recap card follow the map', () => {
        const one = six(arrive(T.mikes, { R0: { 101: 'g1' }, R1: { 101: 'g1' } }));
        assert.ok(!/Matt B owes Mike \$/.test(one.text) || /Mike H/.test(one.text));
        assert.match(one.text, /Mike H/);
        assert.ok(!/\bMike\b(?! H)/.test(one.text), 'no bare "Mike" left in the text: ' + one.text);
    });
});

describe('THE GATE IS UNTOUCHED', () => {
    test('a within-round duplicate still refuses, mapping or not', () => {
        const dup = linked([roundOf('Day 1', ['Mike Dunne', 'Mike Dunne', 'Lance Webb', 'Zach Hill']), roundOf('Day 2', ['Mike Dunne', 'Lance Webb', 'Zach Hill'])]);
        const sb = arrive(dup, { R0: { 101: 'g1', 102: 'g2' } });
        assert.match(el(sb, 'trip-money-settlement'), /Two golfers in/);
        assert.ok(vm.runInContext('cachedIdentityProblems.map(p => p.kind)', sb).includes('duplicate'));
    });
    test('the impossible-round-count gate still fires on names', () => {
        const src = read('trip.html');
        const fn = src.slice(src.indexOf('function tripRoundCountProblems'), src.indexOf('function recomputeTripGate'));
        assert.match(fn, /normalisePlayerName\(p\.name\)/);
        assert.ok(!/tripGolferKey/.test(fn), 'the gate keys on names, as before');
    });
});

describe('ONE FUNCTION, SIX CALLERS, AND THE RULE', () => {
    test('every keyed site calls tripGolferKey; no site trims and lowercases a name for a key any more', () => {
        const src = read('trip.html').replace(/\/\/[^\n]*/g, '');
        const keyed = ['function renderCumulativeLeaderboard', 'function renderTripMoneySettlement', 'function computeTripAwards', 'function computeTripPointsRace'];
        keyed.forEach(fn => {
            const at = src.indexOf(fn);
            const body = src.slice(at, src.indexOf('\n    function ', at + 30));
            assert.match(body, /tripGolferKey\(/, fn + ' must key through tripGolferKey');
            assert.ok(!/\.name\.trim\(\)\.toLowerCase\(\)/.test(body), fn + ' still keys by name itself');
        });
        assert.equal((src.match(/function tripGolferKey\(/g) || []).length, 1);
    });
    test('the rule: one node, accepted shape, refused values, refused player id, refused unknown round (targaryen)', () => {
        const bin = path.join(REPO_ROOT, 'node_modules', '.bin', 'targaryen');
        const out = execFileSync(bin, [path.join(REPO_ROOT, 'database.rules.json'), path.join(REPO_ROOT, 'trip_identity.tests-data.json')], { encoding: 'utf8' });
        assert.match(out, /0 failures in 11 tests/, out);
        const rules = JSON.parse(read('database.rules.json')).rules;
        const node = rules.trips.$tripCode.identity;
        assert.equal(node.$roundCode['.validate'], "root.child('trips/' + $tripCode + '/rounds/' + $roundCode).exists()");
        assert.equal(node.$roundCode.$playerId['.validate'], "$playerId.matches(/^[0-9]+$/) && newData.isString() && newData.val().matches(/^g[0-9]+$/)");
        assert.deepEqual(Object.keys(rules.trips.$tripCode).sort(), ['.read', '.validate', '.write', 'identity'], 'the trip rule gained exactly one child');
    });
});
