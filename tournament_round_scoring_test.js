// ============================================================================
// EVERY SCORE WRITER ON THE CARD ASKS THE SAME TWO QUESTIONS.
//
//   WHICH ROUND AM I IN?   scorePath(suffix)
//   IS IT OPEN?            if (roundLocked) return;
//
// tournament-scorecard.html has THREE functions that write a score. Until the
// round-scoring wave, only ONE of them asked either question:
//
//   saveIndividualScore   roundLocked + scorePath          <- was already right
//   saveHoleScore         neither                          <- scramble
//   savePlayerHoleScore   neither                          <- best ball
//
// That was CLAUDE.md's "two entry points means one builder" at three, and the
// incomplete-migration shape again: scorePath() was written and only the
// individual caller was wired to it. WHAT WAS MEASURED BEFORE THE FIX, cold, on
// both team formats:
//
//   a SETUP round accepted a team score and wrote it. So did a CLOSED round,
//   both leaving every box enabled while the organizer's screen said nobody
//   could enter scores yet.
//   Day 1 and Day 2 of the same event both wrote tournaments/T/scores/team1_h1,
//   so the second day overwrote the first in storage as it was played.
//   And the card read the EVENT ROOT, so 18 scores stored under the round
//   rendered 0 of 18 filled boxes.
//
// All four are fixed. This file is what keeps them fixed.
//
// WHY THIS FILE EXISTS ALONGSIDE tools/tournament-round-scoring-check.js, AND
// WHY NEITHER IS OPTIONAL. The cold check drives a browser and proves what the
// page DOES - the only thing that can prove a fix works. But it can only measure
// the writers it knows how to reach: it types into `#holes-list input` on a
// scramble card and a best-ball card, which is two of three branches of one
// renderer. A FOURTH writer added later for a fourth format would be invisible
// to it and would ship with both holes in it, exactly as these two did.
//
// So this half does not test behaviour. It DISCOVERS every score writer in the
// source and requires each one to ask both questions. A new writer joins the
// test by existing. It also holds the one thing the browser cannot reach - the
// shape salt that keeps a REOPENED round from staying disabled, which would need
// a status change mid-session and a listener the stub does not re-fire.
//
// THE DISCOVERY IS ITSELF GUARDED. A regex that stops matching finds zero
// writers and every "each writer is correct" assertion below becomes trivially
// true - the empty-slice failure CLAUDE.md records. So the enumeration asserts a
// floor and asserts the three known names are among what it found, by name.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// TRS_PAGE lets a negative control point this file at a TEMP COPY carrying the
// diagnosed fix, so the three assertions below can be shown to be SATISFIABLE
// without editing the real page to find out. A guard that is structurally
// impossible to satisfy is red forever and tells you nothing; this is how that
// gets ruled out. Unset in normal use.
const PAGE = process.env.TRS_PAGE || 'tournament-scorecard.html';
const SRC = fs.readFileSync(path.join(__dirname, PAGE), 'utf8');

// The three that exist today. Named so the discovery below cannot quietly
// shrink: if a rename or a refactor drops one, this list is what notices.
const KNOWN_WRITERS = ['saveHoleScore', 'savePlayerHoleScore', 'saveIndividualScore'];

// scorePath is the resolver, not a writer - it is the thing writers must call,
// and it is the one place a raw `tournaments/<code>/scores/` string is correct.
const RESOLVER = 'scorePath';

// ---------------------------------------------------------------------------
// Slice one function body out of the page.
//
// THE ENDPOINT CANNOT BE A HAND-WRITTEN NEXT-FUNCTION NAME. CLAUDE.md records a
// slice that collapsed to nothing when a new function was inserted between its
// two anchors. `\n    function ` finds the end of the CURRENT function at this
// file's indent, and does not care what comes next.
// ---------------------------------------------------------------------------
// AND THE FALLBACK CANNOT BE AN ARBITRARY NUMBER OF CHARACTERS. The first
// version of this took `at + 1200` when there was no next function. renderAll is
// the LAST function in the file, so it always took that branch - and the moment a
// comment was added to renderAll, `const scores =` fell past 1200 and the slice
// stopped containing the line this test is about. It failed on a page that was
// CORRECT, and it was the positive assertion that said so rather than a negative
// one quietly passing on a truncated string. The last function runs to the end of
// its script block.
function bodyOf(name) {
    const at = SRC.indexOf('function ' + name + '(');
    if (at < 0) return null;
    const next = SRC.indexOf('\n    function ', at + 30);
    if (next > at) return SRC.slice(at, next);
    const close = SRC.indexOf('</script>', at);
    return SRC.slice(at, close > at ? close : SRC.length);
}

// COMMENTS ARE NOT CODE, AND LINE COMMENTS GO FIRST.
// CLAUDE.md records a stripper that took block comments first and ate 51,000
// characters of trip.html, because a LINE comment there contained `tournaments/*`.
// The `[^:]` guard keeps a `https://` in a comment or string from being read as
// the start of one.
function stripComments(s) {
    return String(s)
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
        .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

// A function writes a score if it MUTATES the database at a scores-shaped
// target. Both halves are load-bearing and each was added because the other
// alone was wrong:
//
//   without the mutation half, showTab() qualified - it opens the tournament
//   listener with db.ref(...).on('value'), which is a READ
//   without comment stripping, showTab() qualified anyway, on the word "scores"
//   inside a comment explaining why the listener is torn down
//
// The target is checked across the whole body rather than inside db.ref(...)
// because savePlayerHoleScore builds its path into a `const path` first and
// passes the variable.
function writesAScore(body) {
    const b = stripComments(body);
    if (!/\.(set|remove|update)\s*\(/.test(b)) return false;
    return /scores\//.test(b) || new RegExp(RESOLVER + '\\(').test(b);
}

// Every `function <name>(` at this file's top indent.
function allFunctionNames() {
    return [...SRC.matchAll(/\n {4}function (\w+)\(/g)].map((m) => m[1]);
}

describe('THE DISCOVERY RULE KNOWS A WRITE FROM A READ', () => {

    // A vocabulary nobody checked is a vocabulary that gets widened wrongly
    // later. Both of these are shapes that actually appear in this page.
    test('a listener is not a score write', () => {
        assert.ok(!writesAScore(`function showTab(t) {
            // back to yesterday's message would post today's scores into yesterday's round -
            db.ref(\`tournaments/\${currentCode}\`).on('value', (snap) => { render(snap); });
        }`), 'a db.ref(...).on() listener was counted as a score writer. It reads. Counting '
           + 'it means every assertion below runs against a function that cannot possibly '
           + 'satisfy them, and this file reports defects that are not there.');
    });

    test('a comment mentioning scores is not a score write', () => {
        assert.ok(!writesAScore(`function helper() {
            // scores/ are written elsewhere
            other.set(1);
        }`), 'the word "scores" inside a comment qualified a function as a score writer');
    });

    test('both real writer shapes ARE caught', () => {
        // The path built inline...
        assert.ok(writesAScore('function a(){ const r = db.ref(`t/${c}/scores/x`); r.set(1); }'));
        // ...and the path built into a variable first, which is what
        // savePlayerHoleScore does and what a check on db.ref's argument alone
        // would have missed.
        assert.ok(writesAScore('function b(){ const p = `t/${c}/scores/x`; db.ref(p).remove(); }'));
        // ...and one already routed correctly, which must stay discovered so it
        // keeps being held to the rule.
        assert.ok(writesAScore('function c(){ db.ref(scorePath(`x`)).set(1); }'));
    });

    test('a comment claiming the guard does not count as the guard', () => {
        // Otherwise "// roundLocked is applied by the caller" satisfies the
        // roundLocked assertion, and that exact sentence is in this page at :410.
        const pretend = `function d(){ /* if (roundLocked) return; is handled upstream */
            db.ref(\`t/\${c}/scores/x\`).set(1); }`;
        assert.ok(!/if\s*\(\s*roundLocked\s*\)\s*return/.test(stripComments(pretend)),
            'prose about the guard read as the guard');
    });
});

describe('THE DISCOVERY CAN SEE THE FILE', () => {

    test('the page parses into the list of functions it actually has', () => {
        // MEASURED, NOT GUESSED. This page has 13 functions and all 13 sit at
        // four-space indent: toggleTheme, showTab, renderLeaderboard,
        // setSaveState, trackWrite, saveHoleScore, savePlayerHoleScore,
        // scorePath, saveIndividualScore, holesShapeKey,
        // setHolesListPreservingFocus, renderGroup, renderAll.
        //
        // A first draft asserted `> 20` from imagination and went red on a
        // perfectly correct enumeration - a floor invented rather than measured
        // is a floor that reports a defect in the page when the fault is in the
        // test. The floor is set below today's count so ordinary refactoring
        // does not trip it, and the named assertions underneath are what
        // actually prove the enumeration reaches the right region.
        const names = allFunctionNames();
        assert.ok(names.length >= 10,
            `only ${names.length} functions were found in ${PAGE}, against 13 measured. The `
            + 'enumeration below would be asserting against almost nothing, which is how a '
            + 'slice that truncated to empty passed every negative assertion in it.');
        // The two renderers are what build the score inputs. If the enumeration
        // cannot see them it is not reading the half of the file this test is
        // about, whatever its count says.
        ['renderAll', 'renderGroup'].forEach((n) => assert.ok(names.includes(n),
            `${n} is not in the enumeration - the renderer that creates the score inputs is `
            + 'outside what this test can see'));
    });

    KNOWN_WRITERS.forEach((n) => {
        test(`${n} is still present and still writes a score`, () => {
            const body = bodyOf(n);
            assert.ok(body, `${n} is gone from ${PAGE}. Either it was renamed - in which case `
                + 'KNOWN_WRITERS is now lying about what this file guards - or score writing '
                + 'moved somewhere this test cannot see.');
            // THE POSITIVE ASSERTION. Without it, a slice that came back empty
            // would satisfy every "must contain" below by containing nothing to
            // contradict them, and this file would guard an empty string.
            assert.ok(writesAScore(body),
                `${n} no longer looks like a score writer - no db.ref() with a scores path in `
                + 'its body. This test can no longer tell whether it asks the two questions.');
        });
    });

    test('the resolver exists and is the only place a raw scores path belongs', () => {
        const rp = bodyOf(RESOLVER);
        assert.ok(rp, 'scorePath() is gone - there is no canonical round resolver to route to');
        assert.match(rp, /rounds\/\$\{myRoundId\}\/scores/,
            'scorePath no longer puts round identity in the path');
        assert.match(rp, /tournaments\/\$\{currentCode\}\/scores/,
            'scorePath no longer falls back to the event root, which is where a SINGLE-round '
            + 'event stores its scores and where its board reads them');
    });
});

describe('EVERY SCORE WRITER ASKS WHICH ROUND, AND WHETHER IT IS OPEN', () => {

    // Discovered, not listed - so a fourth format's writer is covered the day it
    // is written rather than the day somebody remembers this file.
    const discovered = allFunctionNames()
        .filter((n) => n !== RESOLVER)
        .filter((n) => { const b = bodyOf(n); return b && writesAScore(b); });

    test('the discovery found at least the writers we already know about', () => {
        // ANTI-VACUITY. If the regex stops matching, `discovered` is empty and
        // the forEach below runs zero assertions while reporting success.
        assert.ok(discovered.length >= KNOWN_WRITERS.length,
            `discovery found ${discovered.length} score writers (${discovered.join(', ')}) but `
            + `${KNOWN_WRITERS.length} are known to exist. The enumeration is broken and the `
            + 'assertions below are running on a short list.');
        KNOWN_WRITERS.forEach((n) => assert.ok(discovered.includes(n),
            `${n} writes a score but discovery did not find it`));
    });

    test('no score writer hard-codes the event root', () => {
        const offenders = discovered.filter((n) => /tournaments\/\$\{currentCode\}\/scores\//.test(stripComments(bodyOf(n))));
        assert.deepEqual(offenders, [],
            'these writers build their own path instead of calling scorePath(), so on a '
            + 'multi-round event every day writes the same key and the second day overwrites '
            + 'the first as it is played. Measured: Day 1 and Day 2 both wrote '
            + 'tournaments/T/scores/team1_h1.\n  ' + offenders.join('\n  '));
    });

    test('every score writer routes through scorePath()', () => {
        const offenders = discovered.filter((n) => !new RegExp(RESOLVER + '\\(').test(stripComments(bodyOf(n))));
        assert.deepEqual(offenders, [],
            'these writers never ask which round they are in. scorePath() already exists and '
            + 'already answers correctly - it simply is not called.\n  ' + offenders.join('\n  '));
    });

    test('every score writer refuses when the round is not open', () => {
        const offenders = discovered.filter((n) => !/if\s*\(\s*roundLocked\s*\)\s*return/.test(stripComments(bodyOf(n))));
        assert.deepEqual(offenders, [],
            'these writers accept a score into a round that is in Setup or Closed. roundLocked '
            + 'is computed at :275 before the renderer runs, and the organizer screen tells a '
            + 'head pro "Setup means nobody can enter scores yet".\n  ' + offenders.join('\n  '));
    });
});

describe('THE TEAM RENDERER READS THE ROUND IT IS SCORING', () => {

    // THE OTHER HALF OF THE SAME MIGRATION, AND THE ONE THAT NEARLY GOT MISSED.
    // Three sites were moved to round scope and one was not:
    //
    //   saveIndividualScore :378  const scope = roundScope || currentData;
    //   renderGroup         :485  const currentData = roundScope || window.currentData;
    //   renderLeaderboard   :289  resolveLeaderboardView(currentData, myRoundId)
    //   renderAll           :591  const scores = currentData.scores;      <- the root
    //
    // renderAll is round-blind on BOTH sides, which is exactly why the team path
    // appears to work today: root in, root out. Fixing only the write turns that
    // consistency into a card that blanks on save. Measured: 18 team scores at
    // rounds/r1/scores render 0 of 18 filled boxes.
    test('renderAll resolves its data through roundScope, the way renderGroup does', () => {
        const body = bodyOf('renderAll');
        assert.ok(body, 'renderAll is gone');
        // POSITIVE FIRST. If the slice came back without the score read in it,
        // the assertion below would be guarding the wrong region.
        assert.match(stripComments(body), /const scores = /,
            'renderAll no longer reads scores in the slice this test measures');
        assert.match(stripComments(body), /roundScope/,
            'renderAll never mentions roundScope, so it reads the EVENT ROOT while the team '
            + 'writer is being moved to the round. renderGroup:485 shadows currentData with '
            + 'roundScope; renderAll does not, and that asymmetry is the defect.');
    });

    test('the locked state is in the holes-list shape key, or a reopened round stays dead', () => {
        // setHolesListPreservingFocus:436 patches values IN PLACE when the shape
        // key matches, and `disabled` is set imperatively rather than in the
        // markup - so the markup is byte-identical whether the round is locked or
        // not. Without roundLocked in the key, an organizer reopening a round
        // leaves every box disabled with nothing to re-enable them.
        //
        // THE COLD CHECK CANNOT PROVE THIS ONE. It would need a round to change
        // status while the card is open, and cold-arrival's stub answers set()
        // with Promise.resolve() without persisting or re-firing the listener.
        // Teaching it to fake that would assert the mock. So this half holds the
        // shape instead, and says plainly that is what it is doing.
        const body = stripComments(bodyOf('renderAll'));
        assert.match(body, /setHolesListPreservingFocus\(/,
            'renderAll no longer goes through setHolesListPreservingFocus, so this assertion '
            + 'is about a call that is not there any more');
        assert.match(body, /setHolesListPreservingFocus\(html, 'locked:' \+ roundLocked\)/,
            'renderAll rebuilds the holes list without roundLocked in the shape key. A round '
            + 'the organizer REOPENS would keep every box disabled. renderGroup:564 salts it.');
    });

    test('renderGroup already does it, so this is a migration and not an invention', () => {
        // If this ever goes red the pattern being copied has moved, and the
        // assertion above is asking renderAll to match something that is gone.
        assert.match(stripComments(bodyOf('renderGroup')), /roundScope \|\| window\.currentData/,
            'renderGroup no longer resolves through roundScope - the shape renderAll is '
            + 'being held to no longer exists');
    });
});

describe('THE LOCK IS COMPUTED BEFORE ANYTHING CAN BE TYPED INTO', () => {

    // If roundLocked were assigned AFTER the render, a guard reading it would be
    // reading `false` on arrival and the fix would be cosmetic.
    test('roundLocked is set before the renderers are called', () => {
        const set = SRC.indexOf('roundLocked = (status !== ');
        const render = SRC.indexOf('if (group) renderGroup(group); else renderAll();');
        assert.ok(set > 0, 'roundLocked is no longer derived from the round status');
        assert.ok(render > 0, 'the render dispatch this test anchors on has moved');
        assert.ok(set < render,
            'roundLocked is assigned after the renderers run, so a writer guarded by it would '
            + 'see the default on arrival and the guard would prove nothing');
    });
});
