// ============================================================================
// v212 A — A WHOLE GROUP THAT SKIPS A HOLE (2026-09-23).
//
// THE GAP v192 LEFT, in its own words (score-gaps.js header, and HANDOFF.md):
// "a group that skips a hole together - every golfer blank on hole 1, all
// scored 2-17 - reads as having started on 2, and the missed hole is not a
// gap." Nothing said so until Finish Round. One group's start hole is not
// evidence by itself; the OTHER GROUPS are. If five groups began on hole 1 and
// one group's card begins on hole 2, that group did not tee off later - it
// skipped a hole.
//
// THE RULE ADDED HERE, and every clause of it earns its place:
//   1. take each group's start index (groupStartIndex, unchanged).
//   2. the round's start is the MOST COMMON of them, and only when that mode is
//      UNIQUE and at least TWO groups share it. A shotgun start puts every
//      group on a different hole, so there is no mode and nothing is flagged -
//      which is the whole point. A two-tee start splits the field evenly, so
//      the mode ties and nothing is flagged either.
//   3. a group whose start is LATER than that mode, by no more than
//      WHOLE_GROUP_SKIP_MAX holes, and every hole in between blank for every
//      golfer in the group, is re-based to the mode. Those holes then fall out
//      of findScoreGaps as ordinary gaps.
//
// WHY THE OFFSET IS CAPPED, which the brief did not ask for. Without a cap,
// four groups off hole 1 and two groups off hole 10 - an ordinary two-tee start
// where the mode does NOT tie - flags the hole-10 groups as missing holes 1
// through 9. Accusing a group of nine missing holes because they started on the
// tenth tee is worse than the defect this fixes, and Finish Round still counts
// every blank in the field at the end. A skipped hole is one or two holes; a
// different starting tee is not. The cap is the line between them, and
// "a two-tee start is not a skip" below is the case that holds it.
//
// WHAT IS UNCHANGED: one golfer blank inside a group, the circular walk, a
// back-nine round, and every existing consumer - all three surfaces call
// findScoreGapsByGroup (settlement.html:825, index.html:5150,
// leaderboard.html:1091), so the field-level entry point is the only place this
// had to go.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const G = loadJsFile('score-gaps.js');
const GROUPING = loadJsFile('grouping.js');
const SRC = fs.readFileSync(path.join(REPO_ROOT, 'score-gaps.js'), 'utf8');
// The cap, read from SOURCE. loadJsFile hands back the sandbox's globals, and a
// top-level `const` is not one of them - only function declarations are - so
// G.WHOLE_GROUP_SKIP_MAX is undefined and `2 <= undefined` is false. Parsing it
// here also pins that the cap stays a named constant rather than a literal.
const SKIP_MAX = (() => {
    const m = SRC.match(/const WHOLE_GROUP_SKIP_MAX = (\d+);/);
    assert.ok(m, 'the cap is still a named constant in score-gaps.js');
    return Number(m[1]);
})();

const CD18 = makeCourseData(18);                                    // holes 1..18
const CD_BACK9 = makeCourseData(18).slice(9);                        // holes 10..18
const NAMES = ['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jon',
    'Kim', 'Lou', 'Moe', 'Ned', 'Oli', 'Pat', 'Qui', 'Rex', 'Sam', 'Tom', 'Uma', 'Vic', 'Wes', 'Xan'];

// A field of `groups` foursomes. `startHoleOf(groupIndex)` gives the hole that
// group teed off on, `played` how many holes it has completed. Scores are put on
// the holes that group actually played, walking courseData circularly.
function field(courseData, groups, startHoleOf, played, opts) {
    const o = opts || {};
    const players = makePlayers(NAMES.slice(0, groups * 4), NAMES.slice(0, groups * 4).map(() => 10), 101);
    const boundaries = J(GROUPING.computeGroupBoundaries(players.length, {}));
    const scores = {};
    boundaries.forEach((b, gi) => {
        const startHole = startHoleOf(gi);
        const startIdx = courseData.findIndex(h => h.hole === startHole);
        assert.ok(startIdx >= 0, 'fixture: hole ' + startHole + ' is not on this card');
        const n = (typeof played === 'function') ? played(gi) : played;
        for (let k = 0; k < n; k++) {
            const hole = courseData[(startIdx + k) % courseData.length].hole;
            for (let i = b.startIdx; i < b.startIdx + b.size; i++) {
                const p = players[i];
                if (o.skipOne && o.skipOne.group === gi && o.skipOne.seat === (i - b.startIdx) && o.skipOne.hole === hole) continue;
                scores['p' + p.id + '_h' + hole] = 5;
            }
        }
    });
    return { players, boundaries, scores, courseData };
}
// EVERY VALUE THAT CROSSES THE SANDBOX BOUNDARY IS NORMALISED. loadJsFile runs
// score-gaps.js in a vm realm, so the arrays it returns have that realm's
// Array.prototype and assert.deepEqual (strict) fails on "same structure but not
// reference-equal" even when the contents match. This cost the first run of this
// file six confusing reds. results_scope_test.js:203 does the same thing.
const J = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
const gapsOf = (f) => J(G.findScoreGapsByGroup(f.players, f.courseData, f.scores, f.boundaries));
const byName = (gaps) => (gaps || []).reduce((m, g) => { m[g.name] = g.holes.slice(); return m; }, {});

describe('A WHOLE GROUP THAT SKIPPED A HOLE IS FLAGGED', () => {
    test('five groups off hole 1, the sixth\'s card begins on hole 2: all four of them are missing hole 1', () => {
        // Every group has played five holes of its own walk. Group 6 blank on 1.
        const f = field(CD18, 6, (gi) => (gi === 5 ? 2 : 1), 5);
        // POSITIVE FIRST, so this cannot pass on an empty fixture: the sixth
        // group really does have scores, and really is blank on hole 1.
        const six = f.players.slice(20, 24);
        six.forEach(p => {
            assert.equal(f.scores['p' + p.id + '_h1'], undefined, p.name + ' has no score on hole 1');
            assert.equal(f.scores['p' + p.id + '_h2'], 5, p.name + ' does have hole 2');
        });
        const g = byName(gapsOf(f));
        // The sixth foursome is seats 20-23 of the roster: Uma, Vic, Wes, Xan.
        assert.deepEqual(Object.keys(g).sort(), ['Uma', 'Vic', 'Wes', 'Xan'],
            'exactly the sixth group is flagged: ' + JSON.stringify(g));
        ['Uma', 'Vic', 'Wes', 'Xan'].forEach(n => assert.deepEqual(g[n], [1], n + ' is missing hole 1: ' + JSON.stringify(g[n])));
    });

    test('and the five groups that did tee off on hole 1 are flagged nothing', () => {
        const f = field(CD18, 6, (gi) => (gi === 5 ? 2 : 1), 5);
        const flagged = Object.keys(byName(gapsOf(f)));
        f.players.slice(0, 20).forEach(p => assert.ok(!flagged.includes(p.name), p.name + ' must not be flagged'));
    });

    test('two holes skipped together is still caught (the cap is 2, not 1)', () => {
        const f = field(CD18, 6, (gi) => (gi === 5 ? 3 : 1), 5);
        const g = byName(gapsOf(f));
        ['Uma', 'Vic', 'Wes', 'Xan'].forEach(n => assert.deepEqual(g[n], [1, 2], n + ': ' + JSON.stringify(g[n])));
    });
});

describe('WHAT MUST NOT TRIGGER IT', () => {
    test('A TRUE SHOTGUN - groups off 1, 4, 7, 10, 13, 16 - flags nobody', () => {
        const starts = [1, 4, 7, 10, 13, 16];
        const f = field(CD18, 6, (gi) => starts[gi], 3);
        // POSITIVE FIRST: the fixture really is a spread field with scores on it.
        assert.equal(Object.keys(f.scores).length, 6 * 4 * 3, 'every group posted three holes');
        const starts6 = f.boundaries.map(b => G.groupStartIndex(f.players.slice(b.startIdx, b.startIdx + b.size), CD18, f.scores));
        assert.deepEqual(starts6, [0, 3, 6, 9, 12, 15], 'each group reads its own start hole: ' + JSON.stringify(starts6));
        assert.deepEqual(gapsOf(f), [], 'a shotgun start is not a skipped hole');
    });

    test('A TIGHT SHOTGUN - groups off 1, 3, 5, 7 - flags nobody, and ONLY the mode rule can save this one', () => {
        // Measured, not assumed: on the 1/4/7/10/13/16 shotgun above it is the
        // offset CAP that refuses, not the mode rule - every group is 3+ holes
        // from the earliest. This spacing is inside the cap, so the mode rule is
        // the only thing standing between a shotgun and four false accusations.
        // The naive "later than the earliest start" reading goes red here.
        const starts = [1, 3, 5, 7];
        const f = field(CD18, 4, (gi) => starts[gi], 2);
        const idx = f.boundaries.map(b => G.groupStartIndex(f.players.slice(b.startIdx, b.startIdx + b.size), CD18, f.scores));
        assert.deepEqual(idx, [0, 2, 4, 6], 'each group reads its own start: ' + JSON.stringify(idx));
        assert.ok(idx[1] - idx[0] <= SKIP_MAX, 'group 2 is inside the cap (' + (idx[1] - idx[0]) + ' <= ' + SKIP_MAX + '), so the cap cannot be what saves it');
        assert.deepEqual(gapsOf(f), [], 'a tight shotgun is not a skipped hole');
    });

    test('A GROUP COMPLETE EXCEPT ONE HOLE TOGETHER is not flagged by this rule - a stated limit', () => {
        // 18 holes played, every golfer in the last group blank on hole 2 only.
        // groupStartIndex reads their start as hole 3 (the single blank hole is
        // the longest run), and the holes between the field's start and theirs
        // are NOT all blank - hole 1 is scored - so the rule declines to
        // re-base. Finish Round's "still missing" list is what names this one.
        const f = field(CD18, 3, () => 1, 18);
        f.players.slice(8, 12).forEach(p => { delete f.scores['p' + p.id + '_h2']; });
        const g = byName(gapsOf(f));
        assert.deepEqual(g, {}, 'documented limit, not a claim that the card is complete: ' + JSON.stringify(g));
    });

    test('A TWO-TEE START - four groups off 1, two off 10 - flags nobody, even though the mode does not tie', () => {
        const f = field(CD18, 6, (gi) => (gi >= 4 ? 10 : 1), 4);
        const starts = f.boundaries.map(b => G.groupStartIndex(f.players.slice(b.startIdx, b.startIdx + b.size), CD18, f.scores));
        assert.deepEqual(starts, [0, 0, 0, 0, 9, 9], 'the mode is hole 1, shared by four groups: ' + JSON.stringify(starts));
        assert.deepEqual(gapsOf(f), [], 'starting on the tenth tee is not skipping nine holes');
    });

    test('A BACK-NINE ROUND - every group off hole 10 - flags nobody', () => {
        const f = field(CD_BACK9, 4, () => 10, 5);
        assert.equal(f.courseData[0].hole, 10, 'the card starts at hole 10');
        assert.deepEqual(gapsOf(f), [], 'no group is later than any other');
    });

    test('A BACK-NINE ROUND where one group skips hole 10 IS caught', () => {
        const f = field(CD_BACK9, 4, (gi) => (gi === 3 ? 11 : 10), 5);
        const g = byName(gapsOf(f));
        ['Moe', 'Ned', 'Oli', 'Pat'].forEach(n => assert.deepEqual(g[n], [10], n + ': ' + JSON.stringify(g[n])));
    });

    test('ONE GOLFER blank inside a group is unchanged from v192', () => {
        // Every group off hole 1; Dee (group 1, seat 3) has no score on hole 3.
        const f = field(CD18, 6, () => 1, 5, { skipOne: { group: 0, seat: 3, hole: 3 } });
        const g = byName(gapsOf(f));
        assert.deepEqual(Object.keys(g), ['Dee'], 'only the one golfer: ' + JSON.stringify(g));
        assert.deepEqual(g.Dee, [3]);
    });

    test('A SINGLE GROUP that skips hole 1 is NOT flagged - there are no peers to compare with', () => {
        // The honest limit of this rule, stated rather than hidden: with one
        // group there is no "most common start". Finish Round still catches it.
        const f = field(CD18, 1, () => 2, 5);
        assert.deepEqual(gapsOf(f), [], 'one group alone cannot be judged this way');
    });

    test('A GROUP THAT HAS NOT TEED OFF is not flagged, and does not move anyone else\'s start', () => {
        const f = field(CD18, 6, () => 1, (gi) => (gi === 5 ? 0 : 5));
        const g = byName(gapsOf(f));
        assert.deepEqual(g, {}, 'nobody is flagged: ' + JSON.stringify(g));
    });

    test('EARLY IN THE ROUND: one group off hole 1, one whose card begins on 2, three not started - nobody is flagged', () => {
        // Only two groups have any evidence and they disagree, so there is no
        // agreed start. Counting the three groups that have not teed off would
        // manufacture one (they all read as start 0) and accuse the second group.
        const f = field(CD18, 5, (gi) => (gi === 1 ? 2 : 1), (gi) => (gi <= 1 ? 4 : 0));
        assert.deepEqual(gapsOf(f), [], 'two disagreeing groups are not a mode');
        const r = J(G.resolveGroupStarts(f.players, CD18, f.scores, f.boundaries));
        assert.equal(r.mode, null, 'and the mode is absent: ' + JSON.stringify(r));
    });

    test('a group that skipped a hole AND has a golfer missing another one reports both', () => {
        const f = field(CD18, 6, (gi) => (gi === 5 ? 2 : 1), 5, { skipOne: { group: 5, seat: 2, hole: 4 } });
        const g = byName(gapsOf(f));
        assert.deepEqual(g.Wes, [1, 4], 'Wes is missing the group\'s hole 1 and his own hole 4: ' + JSON.stringify(g.Wes));
        assert.deepEqual(g.Uma, [1], 'and his group-mates only hole 1: ' + JSON.stringify(g.Uma));
    });
});

describe('THE SEAM: one builder, and the surfaces are untouched', () => {
    test('the cross-group rule lives in findScoreGapsByGroup, which is what every surface calls', () => {
        const at = SRC.indexOf('function findScoreGapsByGroup(');
        assert.ok(at > 0, 'findScoreGapsByGroup is still the field-level entry point');
        const fn = SRC.slice(at, SRC.indexOf('\n// ', at));
        assert.match(fn, /WHOLE_GROUP_SKIP_MAX|resolveGroupStarts/, 'the rule is in this function or a helper it calls');
        assert.match(fn, /findScoreGaps\(/, 'and it still delegates per group');
    });
    test('findScoreGaps still takes a group on its own and still honours an explicit start', () => {
        const players = makePlayers(['Ann', 'Ben'], [10, 10], 101);
        const scores = { p101_h2: 4, p101_h3: 4, p102_h2: 5, p102_h3: 5 };
        // On its own, the group reads as having started on hole 2: no gaps.
        assert.deepEqual(J(G.findScoreGaps(players, CD18, scores)), []);
        // Told the round started on hole 1, hole 1 is a gap for both.
        const forced = J(G.findScoreGaps(players, CD18, scores, 0));
        assert.deepEqual(forced.map(x => [x.name, x.holes]), [['Ann', [1]], ['Ben', [1]]]);
    });
    test('resolveGroupStarts is exported and says what it decided', () => {
        const f = field(CD18, 6, (gi) => (gi === 5 ? 2 : 1), 5);
        const r = J(G.resolveGroupStarts(f.players, CD18, f.scores, f.boundaries));
        assert.equal(typeof r, 'object');
        assert.deepEqual(r.starts, [0, 0, 0, 0, 0, 0], 'the sixth group was re-based onto the mode: ' + JSON.stringify(r.starts));
        assert.deepEqual(r.rebased.map(x => [x.group, x.from, x.to, x.holes]), [[5, 1, 0, [1]]],
            'and it says which group, from where, to where, and which holes: ' + JSON.stringify(r.rebased));
    });
    test('and on a shotgun it re-bases nothing, with the mode reported as absent', () => {
        const starts = [1, 4, 7, 10, 13, 16];
        const f = field(CD18, 6, (gi) => starts[gi], 3);
        const r = J(G.resolveGroupStarts(f.players, CD18, f.scores, f.boundaries));
        assert.deepEqual(r.rebased, []);
        assert.equal(r.mode, null, 'no unique mode on a shotgun: ' + JSON.stringify(r.mode));
    });
});
