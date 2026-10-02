// ============================================================================
// "YOUR CARD IS IN" - AND THE THREE FACTS IT MUST NOT CONFUSE
//
// THE DEFECT. A group posts its last score and the app says nothing: the hole view
// still looks like a hole view, and nobody knows whether they are done, whether the
// money is settled, or where to go. On a six-group round "we are done keeping score"
// and "the round is over" are different facts, and nothing distinguished them.
//
// THE THREE FACTS, kept apart on purpose:
//   1. THIS GROUP'S CARD - every golfer in THIS group has every hole. Counted here,
//      per group, because no engine models it.
//   2. THE ROUND - settlement-engine's computeRoundFinish over the WHOLE field, the
//      same resolver Net Finish asks before it prints names. PASSED IN as
//      roundFinished and never recomputed, because two answers to "is it over" is a
//      defect this repo has already paid for twice.
//   3. AM I KEEPING A CARD - a ?group= link is a scorekeeper's. A bare link on a
//      multi-group round is keeping nobody's card, so it is never told "your card is
//      in"; it gets the waiting state, which is the true thing to say to a watcher.
//
// WHY THE ENGINE'S ANSWER WINS. A group with a picked-up ball never completes by
// counting - somebody has no score on hole 12 and never will. That round can still be
// FINISHED, because the organizer verified it, and when it is, this card says final
// to everybody regardless of the counting. The counting only ever ADDS the per-group
// line the engine does not model; it can never contradict it.
//
// WHY A GROUP'S THRU IS THE MINIMUM. "Group 4 (thru 16)" has to mean every golfer in
// it has at least 16. The maximum would announce a group as nearly done on its
// fastest card, and an average is a number nobody can point at.
//
// WHAT THIS FILE CANNOT PROVE. mini-dom has no layout, so "the card is shown" here
// means style.display and the markup the renderer wrote - never that a thumb could
// reach it. And nothing here proves the button navigates: See Results calls the
// page's existing openFinishRoundModal (the recap that already holds review, results
// and the Receipt), and See Leaderboard sets window.location - both are asserted as
// the call, not the arrival.
//
// THE BASELINE, all 29 tests, measured against main c086dca in a clean worktree -
// where card-is-in.js does not exist and neither surface says anything:
//
//     0 PASS / 29 FAIL
//
// Every one is red for the same reason: no module, so the require throws and the two
// page realms have no window.cardIsIn to render. The file earns its keep from its
// first line, and the useful per-arm figures are in the controls at the bottom.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
let C = null;
try { C = require('./card-is-in.js'); } catch (e) { C = null; }
const need = () => { assert.ok(C, 'card-is-in.js must exist and load'); return C; };

// 18 holes, eight golfers, two groups of four.
const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const EIGHT = [1, 2, 3, 4, 5, 6, 7, 8].map(id => ({ id: id, name: 'P' + id }));
const G2 = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 2, 6: 2, 7: 2, 8: 2 };
const FOUR = [1, 2, 3, 4].map(id => ({ id: id, name: 'P' + id }));
const G1 = { 1: 1, 2: 1, 3: 1, 4: 1 };

// thru: { playerId: holesPosted }
function scoresFor(thru) {
    const sc = {};
    Object.keys(thru).forEach(id => {
        for (let h = 1; h <= thru[id]; h++) sc['p' + id + '_h' + h] = 4;
    });
    return sc;
}
const ALL = n => { const o = {}; for (let i = 1; i <= n; i++) o[i] = 18; return o; };

// ===========================================================================
describe('1. PER-GROUP PROGRESS', () => {

    test('a groups thru is its SLOWEST card, not its fastest', () => {
        const sc = scoresFor({ 1: 18, 2: 18, 3: 16, 4: 18, 5: 14, 6: 18, 7: 18, 8: 18 });
        const rows = need().groupProgress(EIGHT, CD, sc, G2);
        assert.deepEqual(rows.map(r => [r.group, r.thru, r.complete]), [[1, 16, false], [2, 14, false]],
            'somebody waiting needs to know the slowest card, not the quickest');
    });

    test('complete means EVERY golfer has EVERY hole', () => {
        const rows = need().groupProgress(EIGHT, CD, scoresFor(Object.assign(ALL(8), { 8: 17 })), G2);
        assert.equal(rows[0].complete, true, 'group 1 is in');
        assert.equal(rows[1].complete, false, 'one golfer on 17 holds group 2 open');
        assert.equal(rows[1].thru, 17);
    });

    test('a golfer marked OUT is not waited on', () => {
        // players[i].out is the rosters own not-playing-today flag. A four-ball with
        // one out is a three-ball, and holding the round open for somebody who is
        // not there would be the app arguing with the people on the course.
        const players = EIGHT.map(p => (p.id === 8 ? { id: 8, name: 'P8', out: true } : p));
        const sc = scoresFor({ 1: 18, 2: 18, 3: 18, 4: 18, 5: 18, 6: 18, 7: 18 });
        const rows = need().groupProgress(players, CD, sc, G2);
        assert.equal(rows[1].players, 3, 'the out golfer is not counted');
        assert.equal(rows[1].complete, true, 'and the group is in');
    });

    test('a group that has not teed off reads thru 0, and is not complete', () => {
        const rows = need().groupProgress(EIGHT, CD, scoresFor(ALL(4)), G2);
        assert.deepEqual([rows[0].complete, rows[1].thru, rows[1].complete], [true, 0, false]);
    });

    test('the waiting line names each group and its thru', () => {
        const line = need().waitingLine([{ group: 4, thru: 16 }, { group: 6, thru: 14 }]);
        assert.equal(line, 'Waiting on 2 groups — Group 4 (thru 16), Group 6 (thru 14)');
        assert.match(need().waitingLine([{ group: 2, thru: 9 }]), /^Waiting on 1 group — Group 2 \(thru 9\)$/,
            'one group is singular');
        assert.equal(need().waitingLine([]), '', 'nothing to say when nobody is out');
    });
});

// ===========================================================================
describe('2. THE STATE, AND WHO IS TOLD WHAT', () => {

    const st = (over) => need().cardIsInState(Object.assign({
        players: EIGHT, courseData: CD, groupOf: G2, groupCount: 2,
        hasGroupLock: true, lockedGroup: 1, roundFinished: false
    }, over));

    test('SINGLE GROUP, card in, round finished: results are final', () => {
        const s = need().cardIsInState({
            players: FOUR, courseData: CD, scores: scoresFor(ALL(4)), groupOf: G1,
            groupCount: 1, hasGroupLock: false, lockedGroup: null, roundFinished: true
        });
        assert.equal(s.show, true);
        assert.equal(s.kind, 'final');
        assert.equal(s.ctaKind, 'results', 'one group means the button goes straight to Results');
        assert.equal(s.note, '', 'nobody to wait for');
        assert.equal(s.fix, true, 'and it is not a lock - a score can still be fixed');
    });

    test('SINGLE GROUP on a BARE link is the scorekeeper, so it says your card is in', () => {
        // There is only one card, and whoever holds the round is keeping it.
        const s = need().cardIsInState({
            players: FOUR, courseData: CD, scores: scoresFor(ALL(4)), groupOf: G1,
            groupCount: 1, hasGroupLock: false, lockedGroup: null, roundFinished: false
        });
        assert.equal(s.kind, 'mine');
        assert.match(s.head, /Your card is in/);
        assert.equal(s.ctaKind, 'results');
    });

    test('MULTI GROUP, my card in, others out: your card is in + who is left', () => {
        const s = st({ scores: scoresFor(Object.assign(ALL(4), { 5: 16, 6: 16, 7: 16, 8: 14 })) });
        assert.equal(s.kind, 'mine');
        assert.match(s.head, /✅ Your card is in/);
        assert.match(s.sub, /done keeping score/i);
        assert.equal(s.note, 'Waiting on 1 group — Group 2 (thru 14)');
        assert.equal(s.ctaKind, 'leaderboard', 'results are not final, so the button is the leaderboard');
        assert.equal(s.fix, true);
    });

    test('THE FLIP: the last group finishes and it becomes FINAL -> See Results', () => {
        const waiting = st({ scores: scoresFor(Object.assign(ALL(4), { 5: 17, 6: 18, 7: 18, 8: 18 })) });
        assert.equal(waiting.kind, 'mine');
        assert.equal(waiting.ctaKind, 'leaderboard');
        // One more score posts, and the ROUND resolver says finished.
        const final = st({ scores: scoresFor(ALL(8)), roundFinished: true });
        assert.equal(final.kind, 'final');
        assert.match(final.head, /Final results are in/);
        assert.equal(final.ctaKind, 'results');
        assert.equal(final.note, '', 'nobody is waited on any more');
        assert.match(final.sub, /done keeping score/i, 'and the card-keeper is still told their job is done');
    });

    test('A SPECTATOR IS NEVER TOLD "your card is in"', () => {
        // Item 4 of the brief, and the branch that exists for it. A bare link on a
        // multi-group round is keeping nobody's card.
        const s = st({ hasGroupLock: false, lockedGroup: null,
                       scores: scoresFor(Object.assign(ALL(4), { 5: 16, 6: 16, 7: 16, 8: 16 })) });
        assert.equal(s.kind, 'waiting');
        assert.ok(!/card is in/i.test(s.head + ' ' + s.sub), 'it must not claim a card: ' + s.head + ' / ' + s.sub);
        assert.equal(s.note, 'Waiting on 1 group — Group 2 (thru 16)');
        assert.equal(s.ctaKind, 'leaderboard');
        assert.equal(s.fix, false, 'and no Fix a score link - it is not their card');
    });

    test('a spectator on a FINISHED round is told it is final, same as everybody', () => {
        const s = st({ hasGroupLock: false, lockedGroup: null, scores: scoresFor(ALL(8)), roundFinished: true });
        assert.equal(s.kind, 'final');
        assert.equal(s.ctaKind, 'results');
        assert.ok(!/card is in/i.test(s.sub), 'still not their card: ' + s.sub);
        assert.equal(s.fix, false);
    });

    test('A GROUP WITH A PICKED-UP BALL: the engine decides, not the counting', () => {
        // Nobody will ever post hole 12 for golfer 4, so group 1 never completes by
        // counting. The organizer verified the round, so it IS finished - and the
        // card says final rather than arguing with the engine.
        const sc = scoresFor(ALL(8));
        delete sc.p4_h12;
        const counting = st({ scores: sc });
        assert.notEqual(counting.kind, 'final', 'without the engine saying so, it is not final');
        assert.equal(counting.kind, 'waiting', 'and my own card is not in either - a hole is missing');
        const verified = st({ scores: sc, roundFinished: true });
        assert.equal(verified.kind, 'final', 'the verified round wins');
    });

    test('NOTHING IS SAID before anybody has posted a score, or with no course', () => {
        assert.equal(st({ scores: {} }).show, false, 'an untouched round says nothing');
        assert.equal(st({ scores: scoresFor(ALL(8)), courseData: [] }).show, false, 'no card, no question');
        const mid = st({ scores: scoresFor({ 1: 9, 2: 9, 3: 9, 4: 9, 5: 9, 6: 9, 7: 9, 8: 9 }) });
        assert.equal(mid.show, false, 'and nothing while EVERY group is still out - that is just a round in progress');
    });

    test('the Results banner is the same state, said in one line', () => {
        const c = need();
        const waiting = c.resultsBanner(st({ hasGroupLock: false, lockedGroup: null,
            scores: scoresFor(Object.assign(ALL(4), { 5: 16, 6: 16, 7: 16, 8: 16 })) }));
        assert.equal(waiting.show, true);
        assert.equal(waiting.text, 'Not final yet');
        assert.match(waiting.note, /Group 2 \(thru 16\)/);
        const final = c.resultsBanner(st({ scores: scoresFor(ALL(8)), roundFinished: true }));
        assert.deepEqual([final.show, final.text, final.note], [true, 'Final', '']);
        assert.equal(c.resultsBanner({ kind: 'none' }).show, false, 'mid-round it says nothing');
    });
});

// ===========================================================================
// 3. THE SCORECARD. The page's own renderer, from its own data.
// ===========================================================================
describe('3. ON THE SCORECARD', () => {

    function page(opts) {
        const o = opts || {};
        const sb = loadHtmlInlineScript('index.html', ['card-is-in.js'],
            { search: '?game=CII' + (o.code || '1') + (o.group ? '&group=' + o.group : '') });
        const data = {
            eventName: 'Thursday', gameFormat: 'stroke', courseData: CD,
            players: o.players || EIGHT, scores: o.scores || {},
            groupSizeOverrides: o.overrides || {}
        };
        const handlers = sb.__dbHandlers.filter(h => h.event === 'value');
        assert.ok(handlers.length > 0, 'the page registered no value handler');
        handlers.forEach(h => h.cb({ val: () => data }));
        return sb;
    }
    const card = sb => sb.document.getElementById('card-is-in');
    const html = sb => card(sb).innerHTML;
    const shown = sb => card(sb).style.display === 'block';

    test('ARRIVE AND TOUCH NOTHING: group 1 has holed out, and the card says so', () => {
        // The page renders itself from the round - nothing here calls renderCardIsIn.
        const sb = page({ group: 1, scores: scoresFor(Object.assign(ALL(4), { 5: 16, 6: 16, 7: 16, 8: 16 })) });
        assert.equal(shown(sb), true, 'the card must be on the scorecard');
        assert.match(html(sb), /Your card is in/);
        assert.match(html(sb), /Waiting on 1 group/);
        assert.match(html(sb), /See Leaderboard/);
        assert.match(html(sb), /Fix a score/, 'and it says the card is not locked');
    });

    test('mid-round there is nothing there at all', () => {
        const sb = page({ group: 1, scores: scoresFor({ 1: 9, 2: 9, 3: 9, 4: 9 }) });
        assert.equal(shown(sb), false);
        assert.equal(html(sb), '', 'not an empty box - nothing');
    });

    test('a SPECTATOR on the same round never sees "your card is in"', () => {
        const sb = page({ code: '2', scores: scoresFor(Object.assign(ALL(4), { 5: 16, 6: 16, 7: 16, 8: 16 })) });
        assert.equal(shown(sb), true);
        assert.ok(!/card is in/i.test(html(sb)), html(sb).slice(0, 300));
        assert.match(html(sb), /Still playing/);
        assert.ok(!/Fix a score/.test(html(sb)));
    });

    test('See Results opens the EXISTING recap, and does not start a second flow', () => {
        const sb = page({ group: 1, code: '3', players: FOUR, scores: scoresFor(ALL(4)) });
        assert.match(html(sb), /See Results/);
        let opened = 0;
        sb.openFinishRoundModal = () => { opened += 1; };
        sb.cardIsInGo('results');
        assert.equal(opened, 1, 'one builder, not a second results page');
    });

    test('See Leaderboard goes to the leaderboard, carrying the group', () => {
        const sb = page({ group: 1, code: '4', scores: scoresFor(Object.assign(ALL(4), { 5: 16, 6: 16, 7: 16, 8: 16 })) });
        sb.cardIsInGo('leaderboard');
        assert.match(String(sb.location.href), /leaderboard\.html\?game=CII4&group=1/);
    });

    test('EDITING AFTER THE CARD IS IN still works, and Fix a score gets out of the way', () => {
        const sb = page({ group: 1, code: '5', players: FOUR, scores: scoresFor(ALL(4)) });
        assert.equal(shown(sb), true);
        // NOT A LOCK. The score boxes are untouched by any of this - the card is a
        // sentence and a button, and the page's own save path is what it always was.
        assert.ok(!/disabled/.test(html(sb)), 'nothing here disables anything');
        sb.cardIsInFix();
        assert.equal(shown(sb), false, 'the card steps aside so the hole view is clear');
        const src = read('index.html');
        const fn = src.slice(src.indexOf('function cardIsInFix'), src.indexOf('function renderCardIsIn'));
        assert.match(fn, /setViewMode\('hole'\)/,
            'and it lands on the hole view, by the name the page actually has');
    });

    test('the renderer is called BY THE SCORECARD, not only defined', () => {
        // The gap this repo has shipped three times: a builder nothing calls.
        const src = read('index.html');
        assert.match(src, /renderGroupMissingNote\(groupMissing, selectedGroup, groupBoundaries\.length\);\s*\n\s*renderCardIsIn\(\);/,
            'renderCardIsIn must sit with the other static notes in renderScorecard');
    });
});

// ===========================================================================
describe('4. ON THE RESULTS PAGE', () => {

    test('settlement.html loads the builder and mounts the banner', () => {
        const src = read('settlement.html');
        assert.match(src, /<script src="card-is-in\.js"><\/script>/);
        assert.match(src, /<div id="results-final-banner"/);
        assert.match(src, /renderFinalBanner\(currentData/, 'and renders it from the page own path');
    });

    test('the Receipt asks about the ROUND, never about "your card"', () => {
        // The Receipt is the whole round's document. It passes hasGroupLock: false on
        // purpose, so a ?group= on the URL can never turn its banner into a claim
        // about one foursome.
        const src = read('settlement.html');
        const fn = src.slice(src.indexOf('function renderFinalBanner'), src.indexOf('mount.style.display = \'block\';'));
        assert.ok(fn.length > 200, 'the slice collapsed');
        assert.match(fn, /hasGroupLock: false/);
        assert.match(fn, /computeRoundFinish/, 'and it uses the round resolver');
        assert.ok(!/lockedGroup: *lockedGroup/.test(fn), 'the page group must not reach this banner');
    });

    test('it is in the consumer shell, so it works offline', () => {
        assert.match(read('sw.js'), /'\.\/card-is-in\.js'/);
        assert.match(read('sync-mobile-web.js'), /'card-is-in\.js'/);
    });

    test('NO BROWSER-ONLY APIS - it has to run in the Capacitor shell', () => {
        // The iOS app is a WKWebView with no window.open, no prompt and no
        // navigator.share worth relying on. The builder is pure; the renderers use
        // innerHTML, style.display and location.href, all of which the shell has.
        const src = read('card-is-in.js');
        [/window\.open/, /\balert\s*\(/, /\bprompt\s*\(/, /navigator\.share/, /localStorage/, /document\./]
            .forEach(re => assert.ok(!re.test(src), 'card-is-in.js must stay pure: ' + re));
        assert.match(src, /module\.exports/, 'and loadable in node, which is how the table above is tested');
    });
});

// ===========================================================================
// 5. CONTROLS. Each one breaks the thing beside it and names what goes red.
// ===========================================================================
describe('5. CONTROLS', () => {

    const base = {
        players: EIGHT, courseData: CD, groupOf: G2, groupCount: 2,
        hasGroupLock: true, lockedGroup: 1, roundFinished: false,
        scores: scoresFor(Object.assign(ALL(4), { 5: 16, 6: 16, 7: 16, 8: 14 }))
    };

    test('CONTROL: a thru taken from the FASTEST card would read 16, not 14', () => {
        // Proves the minimum is doing work rather than coinciding: group 2 has cards
        // on 16, 16, 16 and 14, so max and min differ.
        const rows = need().groupProgress(EIGHT, CD, base.scores, G2);
        const g2 = rows.filter(r => r.group === 2)[0];
        assert.equal(g2.thru, 14);
        assert.notEqual(g2.thru, 16, 'if this ever equals 16 the fixture stopped testing anything');
    });

    test('CONTROL: without the group lock the SAME scores produce a different card', () => {
        // The one fact that separates "your card is in" from "still playing".
        const mine = need().cardIsInState(base);
        const watcher = need().cardIsInState(Object.assign({}, base, { hasGroupLock: false, lockedGroup: null }));
        assert.equal(mine.kind, 'mine');
        assert.equal(watcher.kind, 'waiting');
        assert.notEqual(mine.head, watcher.head);
    });

    test('CONTROL: a lock on the group that is STILL OUT says nothing about a card', () => {
        const s = need().cardIsInState(Object.assign({}, base, { lockedGroup: 2 }));
        assert.equal(s.kind, 'waiting', 'group 2 is on 14 - their card is not in');
        assert.ok(!/card is in/i.test(s.head));
    });

    test('CONTROL: roundFinished is the ONLY thing that produces final', () => {
        const s = need().cardIsInState(Object.assign({}, base, { scores: scoresFor(ALL(8)) }));
        assert.equal(s.kind, 'mine', 'every card complete by counting is still not FINAL on its own');
        assert.equal(s.ctaKind, 'leaderboard');
        const f = need().cardIsInState(Object.assign({}, base, { scores: scoresFor(ALL(8)), roundFinished: true }));
        assert.equal(f.kind, 'final');
        // This is the point: the engine's answer is what flips it, so the card can
        // never disagree with Net Finish about whether the round is over.
    });
});
