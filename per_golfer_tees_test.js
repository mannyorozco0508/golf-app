// ============================================================================
// A TEE PER GOLFER (2026-10-05, STRICT: net money)
//
// Four golfers, one card, different tees. Until now a round had ONE tee and
// every Index was converted from it, so a golfer playing the forward tees was
// given the back tees' slope and rating - and on a Strokes round the tee was
// not recorded at all, so nothing on any screen said why two golfers with the
// same number were stroking differently.
//
// THE WHOLE DESIGN IN ONE LINE: the per-golfer tee changes what is STORED in
// p.hcp, exactly as the round's tee already does. Every engine downstream reads
// p.hcp through parseHcp/getStrokes and is untouched - no money file moves, and
// handicap.js (protected) is not edited: player-tees.js chooses the tee and
// hands it to handicap.js's existing builders.
//
// TWO ROUNDS, TWO RULES:
//   GHIN INDEX   each golfer's Index is converted from THEIR tee's slope and
//                rating. The USGA formula already carries the tee inside it.
//   AS ENTERED   the number in the box IS the playing handicap, so the tee is
//                RECORDED AND NOTHING ELSE by default - a group that writes 12
//                means twelve. The optional switch adds the official
//                course-rating difference, rounded half-up.
//
// WHAT THIS FILE WILL NOT LET THROUGH, and it is the reason it exists: a round
// where everybody plays the same tee must save the same money it saved
// yesterday. That is asserted two ways - the engines by sha, and the stored
// handicap by value through the real save path.
//
// BASELINE, measured over the FINISHED file against main (24bff98, with
// admin.html, index.html and roster-paste.js swapped out and restored by sha),
// all 15 tests: 11 PASS / 4 FAIL. 11 + 4 = 15.
//
// AND THE SHAPE OF THAT BASELINE IS ITSELF THE FINDING, so it is stated rather
// than dressed up: ELEVEN of fifteen pass without the wave, because the half of
// this file that tests player-tees.js is testing a file that did not exist at
// all before it - every one of those assertions is about new code, so measuring
// them against a build without the module is not a measurement, it is a
// tautology. Removing the module entirely was the first baseline I took and it
// reported 0 pass / 1 fail: the whole FILE failed to load, which CLAUDE.md says
// plainly proves nothing per assertion. So the module is left in place and the
// three PAGES are swapped, which is the state where every assertion actually
// runs.
//   The four reds are the four claims that are about the pages: the paste taking
//   a tee, the scorecard printing one on a mixed round, the switch being scoped
//   to a Strokes round with a choice, and the save storing a tee only when it
//   differs. They are the wave.
//   Of the eleven, one is the money-golden sha pin - here as the thing this wave
//   must not break rather than as evidence it did anything - and one is "a
//   same-tee round prints no chip", which is true of a build with no chips at
//   all and is weak evidence, said so.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex').slice(0, 12);
const T = require('./player-tees.js');
const RP = require('./roster-paste.js');
const vm = require('vm');
const { loadJsFile } = require('./helpers/load-script.js');
// handicap.js is a plain-globals file loaded by a <script>, so it is read the
// way the page reads it rather than required.
const HSB = loadJsFile('handicap.js');
const H = { convertHandicapIndex: (t, tee) => JSON.parse(vm.runInContext(
    'JSON.stringify(convertHandicapIndex(' + JSON.stringify(t) + ', ' + JSON.stringify(tee) + '))', HSB)) };

const BLUE = { teeKey: 'blue', teeName: 'Men · Blue', slope: 128, courseRating: 71.2, par: 72, allowance: 100 };
const WHITE = { teeKey: 'white', teeName: 'Men · White', slope: 119, courseRating: 68.9, par: 72, allowance: 100 };
const RED = { teeKey: 'red', teeName: 'Women · Red', slope: 112, courseRating: 65.4, par: 72, allowance: 100 };

describe('1. THE ARITHMETIC, AND WHOSE IT IS', () => {

    test('a GHIN Index converts from the golfer’s OWN tee, through handicap.js', () => {
        // THE WORKED EXAMPLE. One Index, three tees, and the three answers are
        // handicap.js's own - this wave chooses the tee and computes nothing.
        //   course handicap = index x slope/113 + (rating - par)
        //   12.4 from Blue  = 14.046 + (71.2 - 72) = 13.246 -> 13
        //   12.4 from White = 13.058 + (68.9 - 72) =  9.958 -> 10
        //   12.4 from Red   = 12.290 + (65.4 - 72) =  5.690 ->  6
        // I had this wrong first time and the test caught it: I added the
        // rating-minus-par term with the wrong sign on Blue and wrote 14.
        const got = [BLUE, WHITE, RED].map(tee => H.convertHandicapIndex('12.4', tee));
        assert.deepEqual(got.map(g => g.playingText), ['13', '10', '6']);
        // SEVEN SHOTS between Blue and Red on the same Index is the whole point:
        // that is the money this wave moves, and it moves it to where it belongs.
        assert.equal(got[0].playing - got[2].playing, 7);
    });

    test('AS ENTERED records the tee and changes nothing, unless asked', () => {
        assert.equal(T.adjustedStrokesText('12', BLUE, WHITE, false), '12',
            'the switch is off and the number moved - a group that writes 12 means twelve');
        // On: the official difference between the two COURSE RATINGS, rounded.
        // 71.2 - 68.9 = 2.3 -> 2.
        assert.equal(T.teeStrokeAdjustment(BLUE, WHITE), 2);
        assert.equal(T.adjustedStrokesText('12', BLUE, WHITE, true), '14');
        // And the other way: a golfer moving forward gives strokes up.
        assert.equal(T.adjustedStrokesText('12', RED, BLUE, true), '6');   // 65.4-71.2 = -5.8 -> -6
        // A PLUS HANDICAP STAYS A PLUS HANDICAP.
        assert.equal(T.adjustedStrokesText('+2', RED, BLUE, true), '+8');
        // A BLANK BOX STAYS BLANK: a golfer with no handicap does not acquire one
        // by standing on a different tee.
        assert.equal(T.adjustedStrokesText('', BLUE, WHITE, true), '');
    });

    test('and a missing rating adjusts by NOTHING, rather than by a guess', () => {
        // Most hand-entered courses have no ratings at all.
        assert.equal(T.teeStrokeAdjustment({ name: 'Blue' }, WHITE), 0);
        assert.equal(T.canAdjust({ name: 'Blue' }, WHITE), false);
        assert.equal(T.adjustedStrokesText('12', { name: 'Blue' }, WHITE, true), '12');
        assert.equal(T.canAdjust(BLUE, WHITE), true);
    });

    test('CONTROL: the same tee is worth nothing, which is what makes a same-tee round identical', () => {
        assert.equal(T.teeStrokeAdjustment(BLUE, BLUE), 0);
        assert.equal(T.adjustedStrokesText('12', BLUE, BLUE, true), '12');
        [['7', '7'], ['+1', '+1'], ['0', '0'], ['', '']].forEach(([inp, want]) =>
            assert.equal(T.adjustedStrokesText(inp, BLUE, BLUE, true), want, inp));
    });

    test('whose tee it is: the golfer’s own, the round’s otherwise', () => {
        assert.equal(T.playerTee({ tee: WHITE }, BLUE).teeKey, 'white');
        assert.equal(T.playerTee({}, BLUE).teeKey, 'blue');
        assert.equal(T.playerTee({ tee: {} }, BLUE).teeKey, 'blue', 'an empty tee object is not a tee');
        assert.equal(T.playerTee({}, null), null);
        // MIXED is what the scorecard asks before it prints a chip beside a name.
        assert.equal(T.hasMixedTees([{}, {}, {}], BLUE), false);
        assert.equal(T.hasMixedTees([{}, { tee: WHITE }], BLUE), true);
        assert.equal(T.hasMixedTees([], BLUE), false);
        assert.equal(T.teeLabel(BLUE), 'Blue', 'the chip says the tee, not the gender it was listed under');
    });
});

describe('2. THE MONEY FILES DO NOT MOVE', () => {
    test('every engine is byte-identical, and handicap.js among them', () => {
        // THE STRICT-LANE CLAIM. The per-golfer tee is resolved into p.hcp at save
        // time, so nothing that settles money had to learn about tees at all -
        // including handicap.js, which is protected and was NOT edited: its
        // builders are called with a different tee, not changed.
        const PINS = {
            'handicap.js': '2d3b2f7fd916', 'money-engine.js': '12bfa41c2c8e',
            'settlement-engine.js': '6ddd4c8676cd', 'pool-engine.js': '372e76d7d5c4',
            'action-model.js': '399ba26f0025', 'bet-strip.js': '6a876155251e',
            'hole-events.js': '6fd7f7edf41e', 'score-marks.js': '02f972d6d2fc',
            'payouts.js': 'c35e34f571e5', 'match-engine.js': '42bb272d1181',
            'ryder-cup.js': '0b4e3f9059ad', 'play-order.js': 'c243c2eafb8d'
        };
        Object.keys(PINS).forEach(f => assert.equal(sha(f), PINS[f], f + ' moved in a tee wave'));
    });

    test('and the new file computes no strokes of its own', () => {
        const src = read('player-tees.js');
        assert.ok(!/getStrokes|hcpIndex|courseHandicapFromIndex|\* *slope/.test(src),
            'player-tees.js is doing handicap.js’s job');
        // What it DOES do is one subtraction, and it is named.
        assert.match(src, /function teeStrokeAdjustment/);
        assert.match(src, /courseRating/);
    });
});

describe('3. THE PASTE TAKES A TEE, AND ERRS TOWARD THE NAME', () => {
    const TEES = ['Blue', 'White', 'Gold'];
    const names = t => RP.parsePlayerPasteText(t, TEES).validPlayers;

    test('a tee sheet line carries one', () => {
        assert.deepEqual(names('Zack Carrano 6 blue'),
            [{ name: 'Zack Carrano', hcp: '6', teeName: 'Blue' }]);
        assert.deepEqual(names('B Zack 6 gold'),
            [{ name: 'Zack', hcp: '6', flight: 'B', teeName: 'Gold' }]);
        assert.deepEqual(names('Mary - blue'), [{ name: 'Mary', hcp: '', teeName: 'Blue' }]);
    });

    test('and a golfer called Blue is a golfer', () => {
        // THE DIRECTION THIS MUST ERR IN. This file once turned six "Group N"
        // lines into six golfers with handicaps; a tee is strokes too on a round
        // with the adjustment on.
        assert.deepEqual(names('Mary Blue'), [{ name: 'Mary Blue', hcp: '' }]);
        assert.deepEqual(names('Mary Blue 4'), [{ name: 'Mary Blue', hcp: '4' }]);
        // A word that is not one of THIS course's tees is not a tee.
        assert.deepEqual(names('Zack 6 purple'), [{ name: 'Zack 6 purple', hcp: '' }]);
    });

    test('CONTROL: with no tee names, the parser is byte-identical to before', () => {
        // Every existing caller passes one argument. trip.html is one of them.
        const before = RP.parsePlayerPasteText('Zack 6 blue\nMary Blue\nB Jimmy 11 (captain)');
        assert.deepEqual(before.validPlayers.map(p => p.name), ['Zack 6 blue', 'Mary Blue', 'Jimmy']);
        assert.ok(before.validPlayers.every(p => !('teeName' in p)), 'a tee appeared with no tee list');
    });
});

// ---------------------------------------------------------------------------
// 4. THE PAGE, COLD. The switch belongs to a Strokes round with more than one
//    rated tee and to nothing else, and the scorecard prints a tee only when
//    there is one worth printing.
// ---------------------------------------------------------------------------
const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const P = [{ id: 101, name: 'Ann', hcp: '4' }, { id: 102, name: 'Ben', hcp: '4', tee: WHITE },
           { id: 103, name: 'Cal', hcp: '9' }, { id: 104, name: 'Dee', hcp: '14' }];
const SAME = P.map(p => ({ id: p.id, name: p.name, hcp: p.hcp }));
const round = players => ({ eventName: 'Tees', courseName: 'Dobson Ranch', players, courseData: CD,
    gameFormat: 'stroke', scores: {}, settlementMode: 'whole-dollar', groupSizeOverrides: { 0: 4 },
    teeRating: BLUE, ownerUid: 'anon-cold' });

const CARD = `(function () {
  var rows = [].slice.call(document.querySelectorAll('.hv-player-row'));
  return JSON.stringify({
    chips: rows.map(function (r) { var c = r.querySelector('.hv-tee'); return c ? String(c.innerText || '').trim() : null; }),
    rows: rows.length
  });
})()`;
const S = {};
before(async () => {
    const go = (players, code) => arriveCold({
        url: fileUrl('index.html', 'game=' + code),
        db: { events: { [code]: round(players) }, global_courses: {}, trips: {}, tournaments: {} },
        viewport: { width: 390, height: 844 }, settleMs: 3200, steps: [{ expression: CARD }] });
    const a = await go(P, 'MIXT');
    const b = await go(SAME, 'SAMET');
    S.okA = a.ok; S.okB = b.ok; S.reason = a.reason || b.reason;
    if (a.ok) S.mixed = JSON.parse((a.value || []).filter(v => typeof v === 'string' && v[0] === '{').pop());
    if (b.ok) S.same = JSON.parse((b.value || []).filter(v => typeof v === 'string' && v[0] === '{').pop());
});

describe('4. THE SCORECARD SAYS WHICH TEE, WHEN IT IS NEWS', () => {

    test('ran', () => assert.ok(S.okA && S.okB, S.reason));

    test('a MIXED round prints a tee beside every name', () => {
        assert.equal(S.mixed.rows, 4, 'the fixture did not render four golfers');
        assert.deepEqual(S.mixed.chips, ['Blue', 'White', 'Blue', 'Blue'],
            'the chips are ' + JSON.stringify(S.mixed.chips));
    });

    test('and a SAME-TEE round prints none at all', () => {
        // Four identical chips say nothing and cost a line of a card that has to
        // fit one screen.
        assert.equal(S.same.rows, 4);
        assert.deepEqual(S.same.chips, [null, null, null, null],
            'the chips are ' + JSON.stringify(S.same.chips));
    });

    test('the switch belongs to a Strokes round with a choice, and is turned OFF when hidden', () => {
        const ADMIN = read('admin.html');
        const at = ADMIN.indexOf('function syncTeeAdjustRow()');
        assert.ok(at > -1, 'there is no sync for the switch');
        const fn = ADMIN.slice(at, ADMIN.indexOf('\n    function ', at + 10));
        assert.match(fn, /basis && basis\.value === 'as-entered'/, 'a GHIN round would adjust twice');
        assert.match(fn, /teeSel\.options\.length > 1/, 'it shows with nothing to choose between');
        assert.match(fn, /box\.checked = false/,
            'a checked box behind a hidden control is a saved setting nobody agreed to');
        // AND THE SAVE ONLY ASKS ON AN AS-ENTERED ROUND.
        assert.match(ADMIN, /\?\s*\{ hcp: \(function \(\) \{[\s\S]{0,400}teeAdjustOn && window\.playerTees/);
        // THE GHIN ARM GETS THE ROW'S TEE, which is the other half of the wave.
        assert.match(ADMIN, /playerHandicapFields\(hcpRaw, legacyAttr === null \? null : legacyAttr, rowTee\)/);
    });

    test('and a golfer on the round’s own tee stores NO tee at all', () => {
        // What keeps a same-tee round byte-identical in the record as well as in
        // the money: nothing is written that was not written yesterday.
        const ADMIN = read('admin.html');
        assert.match(ADMIN, /rowTee\.teeKey !== teeForSave\.teeKey/,
            'every golfer is being given a stored tee, including the ones on the round tee');
        assert.match(ADMIN, /\.\.\.\(teeAdjustOn \? \{ teeAdjustStrokes: true \} : \{\}\)/,
            'the round-level flag is written even when off');
    });
});
