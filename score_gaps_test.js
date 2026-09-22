// ============================================================================
// THE MISSING-HOLE WARNING (2026-09-22, v192)
//
// 2026-09-21: a golfer had no score on hole 1; his total read four strokes
// better than he shot and nobody knew why. score-gaps.js is the one builder;
// the scorecard outlines the box and names it, the Board flags the total,
// the money pages say "Not final". THE COURSE IS CIRCULAR - per GROUP the
// start hole is where the group's scoring begins (after the longest run of
// holes nobody in the group has scored), and a gap is a blank before a
// golfer's last scored hole walked from there. Shotgun starts do not alarm.
// Known limit: a group that skips a hole together reads as having started
// after it (HANDOFF.md); Finish Round's still-missing list catches that.
// No engine is touched: totals, positions and money are the engines' numbers;
// every surface only draws the flag.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const G = require('./score-gaps.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const run = (sb, e) => vm.runInContext(e, sb);
const J = v => JSON.parse(JSON.stringify(v));
const CD = makeCourseData(18);
const P4 = [{ id: 1, name: 'Marty' }, { id: 2, name: 'Kopp' }, { id: 3, name: 'Ann' }, { id: 4, name: 'Ben' }];
function scores(spec) {   // { id: [holes] }
    const s = {}; Object.keys(spec).forEach(id => spec[id].forEach(h => { s['p' + id + '_h' + h] = 4; })); return s;
}
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const gaps = (players, cd, s) => G.findScoreGaps(players, cd, s).map(g => [g.name, g.holes]);

describe('THE BUILDER (score-gaps.js) - circular, per group', () => {
    test('a group started on 10, scored 10-14, holes 1-9 blank: NO gaps (a shotgun start is not an alarm)', () => {
        const s = scores({ 1: range(10, 14), 2: range(10, 14), 3: range(10, 14), 4: range(10, 14) });
        assert.equal(G.groupStartIndex(P4, CD, s), 9, 'start = hole 10');
        assert.deepEqual(gaps(P4, CD, s), []);
        // CONTROL: a linear walk from courseData[0] would call 1-9 gaps for all four
        const linear = P4.map(p => { const lastK = 13; const g = []; for (let k = 0; k < lastK; k++) if (!(s['p' + p.id + '_h' + CD[k].hole] > 0)) g.push(CD[k].hole); return g; });
        assert.deepEqual(linear[0], range(1, 9), 'the linear walk is wrong here, which is why the walk is circular');
    });
    test('the same group, Marty missing 12 with 13-14 scored: gap [12]', () => {
        const s = scores({ 1: [10, 11, 13, 14], 2: range(10, 14), 3: range(10, 14), 4: range(10, 14) });
        assert.deepEqual(gaps(P4, CD, s), [['Marty', [12]]]);
        assert.deepEqual(G.findScoreGaps(P4, CD, s)[0].last, 14);
    });
    test('a group started on 1: Marty scored 2-17, the others 1-17: gap [1] for Marty (his group-mates scored it, so the group started on 1)', () => {
        const s = scores({ 1: range(2, 17), 2: range(1, 17), 3: range(1, 17), 4: range(1, 17) });
        assert.equal(G.groupStartIndex(P4, CD, s), 0);
        assert.deepEqual(gaps(P4, CD, s), [['Marty', [1]]]);
    });
    test('the hole being played is never a gap: Ann scored 1-6, on 7 now - none; Kopp 1, 3-6, 8 - gaps [2, 7]', () => {
        const s = scores({ 1: range(1, 17), 2: [1, 3, 4, 5, 6, 8], 3: range(1, 6), 4: [] });
        assert.deepEqual(gaps(P4, CD, s), [['Kopp', [2, 7]]]);
        // CONTROL: a walk that treated the hole after the last score as a gap would name Ann's 7
        assert.ok(!gaps(P4, CD, s).some(g => g[0] === 'Ann'));
    });
    test('THE KNOWN LIMIT: the whole group skipped hole 1, all scored 2-17 - the start reads as 2, nothing flagged', () => {
        const s = scores({ 1: range(2, 17), 2: range(2, 17), 3: range(2, 17), 4: range(2, 17) });
        assert.equal(G.groupStartIndex(P4, CD, s), 1, 'start = hole 2');
        assert.deepEqual(gaps(P4, CD, s), []);
        assert.match(read('HANDOFF.md'), /skips a hole together/);
    });
    test('a group with no scores has no gaps; a golfer who has not started has none; ties in the longest blank run -> courseData[0]', () => {
        assert.deepEqual(gaps(P4, CD, {}), []);
        assert.equal(G.groupStartIndex(P4, CD, {}), 0);
        // two equal blank runs (holes 1-3 and 10-12 blank, everything else scored): a tie -> start 0
        const played = range(4, 9).concat(range(13, 18));
        const s = scores({ 1: played, 2: played, 3: played, 4: played });
        assert.equal(G.groupStartIndex(P4, CD, s), 0);
        // every hole scored by someone: start 0
        assert.equal(G.groupStartIndex(P4, CD, scores({ 1: range(1, 18) })), 0);
    });
    test('a back-9 course (10..18 only): 11 blank, 12-14 scored -> gap [11]; a front 9 stops at 9', () => {
        const back = makeCourseData(18).slice(9);
        assert.deepEqual(gaps(P4, back, scores({ 1: [10, 12, 13, 14], 2: range(10, 14) })), [['Marty', [11]]]);
        const front = makeCourseData(18).slice(0, 9);
        assert.deepEqual(gaps(P4, front, scores({ 1: [1, 2, 4, 5, 6, 7, 8, 9], 2: range(1, 9) })), [['Marty', [3]]]);
        assert.deepEqual(gaps(P4, front, scores({ 1: range(1, 9) })), []);
    });
    test('courseData out of hole order is walked AS GIVEN, never sorted (CONTROL: a sort by hole number invents a gap)', () => {
        const odd = [CD[2], CD[0], CD[1], CD[3]];   // played 3, 1, 2, 4
        // Kopp has played all four; Marty has played 3 and 1 and is standing on 2:
        // in play order nothing is blank before his last score - no gap.
        // Sorted by hole number his last score would be "3" with "2" blank before it - a false alarm.
        assert.deepEqual(gaps(P4, odd, scores({ 1: [3, 1], 2: [3, 1, 2, 4] })), []);
        // and a real gap in play order: Marty played 3, skipped 1, played 2 -> gap [1]
        assert.deepEqual(gaps(P4, odd, scores({ 1: [3, 2], 2: [3, 1, 2, 4] })), [['Marty', [1]]]);
        const g = G.findScoreGaps(P4, odd, scores({ 1: [3, 4], 2: [3, 1, 2, 4] }));
        assert.deepEqual(g[0].holes, [1, 2], 'holes reported in play order');
    });
    test('a five-golfer group, by group: findScoreGapsByGroup slices the field with the boundaries', () => {
        const P = range(1, 9).map(i => ({ id: i, name: 'G' + i }));
        // group 1 = golfers 1-5 on a shotgun 10 start, golfer 3 missing 11; group 2 = 6-9 on hole 1, golfer 8 missing 2
        const s = scores({ 1: range(10, 13), 2: range(10, 13), 3: [10, 12, 13], 4: range(10, 13), 5: range(10, 13), 6: range(1, 5), 7: range(1, 5), 8: [1, 3, 4, 5], 9: range(1, 5) });
        const out = G.findScoreGapsByGroup(P, CD, s, [{ startIdx: 0, size: 5 }, { startIdx: 5, size: 4 }]);
        assert.deepEqual(out.map(g => [g.name, g.holes]), [['G3', [11]], ['G8', [2]]]);
        // CONTROL: as ONE group the start is ambiguous (two equal blank runs: 6-9 and 14-18 -> tie -> hole 1) and golfers 1-5 read 1-9 as gaps
        const one = G.findScoreGapsByGroup(P, CD, s);
        assert.ok(one.some(g => g.name === 'G1' && g.holes.length === 9), 'the grouping is what makes a shotgun start safe');
    });
    test('the words', () => {
        assert.equal(G.gapLine({ holes: [1] }, 'Marty'), 'Marty: hole 1 has no score');
        assert.equal(G.gapLine({ holes: [2, 5] }, 'Kopp'), 'Kopp: holes 2, 5 have no score');
        assert.equal(G.notFinalLine([{ name: 'Marty', holes: [1] }], g => g.name), 'Not final — Marty is missing hole 1');
        assert.equal(G.notFinalLine([{ name: 'Marty', holes: [1] }, { name: 'Kopp', holes: [2, 5] }], g => g.name), 'Not final — Marty is missing hole 1; Kopp is missing holes 2, 5');
        assert.equal(G.notFinalLine([], g => g.name), '');
    });
});

// ---------------------------------------------------------------------------
// A 12-golfer round in three groups of four; group 2 has Randy T and Randy C.
const NAMES = ['Marty', 'Kopp', 'Ann', 'Ben', 'Randy T', 'Randy C', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'];
const PLAYERS = NAMES.map((n, i) => ({ id: 101 + i, name: n, hcp: '9' }));
function round(spec) {
    return { eventName: 'Gap', courseName: 'Test', players: PLAYERS, gameFormat: 'stroke', skinsBuyIn: 0, skinsCarryOver: false, courseData: CD, scores: scores(spec), settlementMode: 'whole-dollar', groupSizeOverrides: { 0: 4, 1: 4, 2: 4 } };
}
// group 1 (Marty..Ben) started on 1: Marty missing hole 1, scored 2-9; the others 1-9.
// group 2 (Randy T..Dee) shotgun on 10: Randy T missing 12, scored 10-11, 13-14; the others 10-14.
// group 3 (Eli..Hal) on 1, nobody missing, scored 1-5.
const GAPPY = round({ 101: range(2, 9), 102: range(1, 9), 103: range(1, 9), 104: range(1, 9), 105: [10, 11, 13, 14], 106: range(10, 14), 107: range(10, 14), 108: range(10, 14), 109: range(1, 5), 110: range(1, 5), 111: range(1, 5), 112: range(1, 5) });
const CLEAN = round({ 101: range(1, 9), 102: range(1, 9), 103: range(1, 9), 104: range(1, 9), 105: range(10, 14), 106: range(10, 14), 107: range(10, 14), 108: range(10, 14), 109: range(1, 5), 110: range(1, 5), 111: range(1, 5), 112: range(1, 5) });

function scorecard(data, search) {
    const sb = loadHtmlInlineScript('index.html', [], { search });
    run(sb, "['gap-banner', 'card-body', 'hole-view-card', 'fr-incomplete-warning'].forEach(function (id) { document.__mount(document.getElementById(id)); });");
    const h = sb.__dbHandlers.find(x => x.event === 'value' && /^events\//.test(x.path));
    h.cb({ val: () => J(data), exists: () => true });
    return { sb, banner: String(run(sb, "document.getElementById('gap-banner').innerHTML")), bannerDisplay: run(sb, "document.getElementById('gap-banner').style.display"), card: String(run(sb, "document.getElementById('card-body').innerHTML")) };
}
const wrapperOf = (card, pid, hole) => { const m = new RegExp('<div class="score-input-wrapper([^"]*)">\\s*<input[^>]*data-player-id="' + pid + '"[^>]*data-hole="' + hole + '"').exec(card); return m ? m[1] : null; };

describe('THE SCORECARD (index.html): the box, the banner, the tap', () => {
    test("group 1's link: Marty's hole-1 box is outlined (score-gap) and no other box is; the banner names him", () => {
        const s = scorecard(GAPPY, '?game=gap1&group=1');
        assert.match(wrapperOf(s.card, 101, 1), /\bscore-gap\b/, "Marty h1");
        assert.doesNotMatch(wrapperOf(s.card, 101, 2), /score-gap/, 'CONTROL: Marty h2 is scored');
        assert.doesNotMatch(wrapperOf(s.card, 101, 10), /score-gap/, 'CONTROL: Marty h10 is the future, not a gap');
        assert.doesNotMatch(wrapperOf(s.card, 102, 1), /score-gap/, 'CONTROL: Kopp h1 is scored');
        assert.equal((s.card.match(/score-gap/g) || []).length, 1, 'exactly one outlined box');
        assert.equal(s.bannerDisplay, 'block');
        assert.match(s.banner, /⚠ Marty: hole 1 has no score/);
        assert.match(s.banner, /onclick="jumpToGap\(101, 1\)"/);
        assert.doesNotMatch(s.banner, /Randy/, "another group's gap is not this group's banner");
    });
    test("group 2's link (shotgun on 10): Randy T's hole-12 box outlined, holes 1-9 NOT (CONTROL), the banner uses the Board's name", () => {
        const s = scorecard(GAPPY, '?game=gap1&group=2');
        assert.match(wrapperOf(s.card, 105, 12), /score-gap/);
        range(1, 9).forEach(h => assert.doesNotMatch(wrapperOf(s.card, 105, h) || '', /score-gap/, 'h' + h + ' before a shotgun start is not a gap'));
        assert.equal((s.card.match(/score-gap/g) || []).length, 1);
        assert.match(s.banner, /⚠ Randy T\.: hole 12 has no score/, 'Randy T. with the initial - two Randys in the round');
    });
    test('the bare link (the organizer): both gaps, in group order', () => {
        const s = scorecard(GAPPY, '?game=gap1');
        assert.match(s.banner, /Marty: hole 1 has no score[\s\S]*Randy T\.: hole 12 has no score/);
        assert.equal((s.card.match(/score-gap/g) || []).length, 2);
    });
    test('CONTROL - a clean round: no outline, banner display none and empty', () => {
        const s = scorecard(CLEAN, '?game=gap1&group=1');
        assert.equal((s.card.match(/score-gap/g) || []).length, 0);
        assert.equal(s.bannerDisplay, 'none'); assert.equal(s.banner, '');
    });
    test('the tap: jumpToGap goes to the hole and asks for that box by identity (Chrome proves the focus itself, score_entry_advance_test.js)', () => {
        const s = scorecard(GAPPY, '?game=gap1&group=1');
        run(s.sb, 'jumpToGap(101, 1)');
        assert.equal(run(s.sb, 'currentViewedHole'), 1);
        assert.equal(run(s.sb, "currentViewMode"), 'hole');
        assert.deepEqual(J(run(s.sb, 'window.__lastGapFocus')), { playerId: '101', hole: '1' });
    });
    test('Finish Round: "Not final — Marty is missing hole 1; Randy T. is missing hole 12" first in the warning; absent on a clean round', () => {
        const s = scorecard(GAPPY, '?game=gap1');
        run(s.sb, 'renderIncompleteWarning()');
        const w = String(run(s.sb, "document.getElementById('fr-incomplete-warning').innerHTML"));
        assert.match(w, /^<div class="fr-gap-line">Not final — Marty is missing hole 1; Randy T\. is missing hole 12<\/div>/);
        assert.match(w, /scores still missing/, 'the existing list is still under it');
        const c = scorecard(CLEAN, '?game=gap1');
        run(c.sb, 'renderIncompleteWarning()');
        assert.doesNotMatch(String(run(c.sb, "document.getElementById('fr-incomplete-warning').innerHTML")), /Not final/);
    });
});

describe('THE BOARD (leaderboard.html): ⚠ missing N beside the total, the ranking untouched', () => {
    // The page's own arrival (?game=GAP1), the value handler fed the round.
    function board(data) {
        const sb = loadHtmlInlineScript('leaderboard.html', [], { search: '?game=GAP1' });
        const hs = sb.__dbHandlers.filter(h => h.event === 'value' && /events\/GAP1$/.test(h.path));
        assert.ok(hs.length >= 1, 'no value handler for events/GAP1');
        hs.forEach(h => h.cb({ val: () => J(data), exists: () => true }));
        return String(run(sb, "document.getElementById('board-content').innerHTML") || '');
    }
    test('Marty and Randy T. carry the flag; nobody else does; the position column is the same with and without gaps', () => {
        const g = board(GAPPY), c = board(CLEAN);
        assert.match(g, /Marty[\s\S]{0,300}?<span class="gap-flag">⚠ missing 1<\/span>/);
        assert.match(g, /Randy T[\s\S]{0,300}?<span class="gap-flag">⚠ missing 1<\/span>/);   // the board's rows print the stored name (escapeHtml(r.name)), as before
        assert.equal((g.match(/gap-flag/g) || []).length, 2);
        assert.equal((c.match(/gap-flag/g) || []).length, 0, 'CONTROL: no flag on a clean round');
        const pos = h => (h.match(/<tr[^>]*>\s*<td[^>]*>([^<]*)<\/td>/g) || []).map(x => x.replace(/<[^>]+>/g, '').trim());
        assert.deepEqual(pos(g).length, pos(c).length);
    });
});

describe('RESULTS (settlement.html): "Not final — …" ONCE, in its own mount above the live head (v196); absent when clean', () => {
    function results(data) {
        const sb = loadHtmlInlineScript('settlement.html');
        sb.__d = J(data);
        run(sb, 'currentMode = "GAP1"; RESULTS_MOUNTS.forEach(i => document.__mount(document.getElementById(i))); renderResultsGapLine(__d);');
        return { gap: String(run(sb, "document.getElementById('results-gap-line').innerHTML")), live: String(run(sb, 'buildLiveResultsHtml(__d, __d.courseData, __d.scores)')) };
    }
    test('the line in #results-gap-line, then the head with no copy of its own', () => {
        const r = results(GAPPY);
        assert.equal(r.gap, '<div class="gap-line results-gap">Not final — Marty is missing hole 1; Randy T. is missing hole 12</div>');
        assert.match(r.live, /^<div class="settle-card live-head"><div class="settle-header">/);
        assert.doesNotMatch(r.live, /Not final/);
        const c = results(CLEAN);
        assert.equal(c.gap, ''); assert.doesNotMatch(c.live, /Not final/);
    });
});

describe('ONE BUILDER: score-gaps.js is loaded by the three pages and nobody re-derives a gap', () => {
    test('the tags, the shell lists, and no other gap walk', () => {
        ['index.html', 'leaderboard.html', 'settlement.html'].forEach(p => assert.match(read(p), /<script src="score-gaps\.js"><\/script>/, p));
        assert.match(read('sync-mobile-web.js'), /'score-gaps\.js'/);
        assert.match(read('sw.js'), /'\.\/score-gaps\.js',/);
        ['index.html', 'leaderboard.html', 'settlement.html'].forEach(p => assert.doesNotMatch(read(p), /function findScoreGaps|function groupStartIndex/, p + ' defines its own'));
    });
});
