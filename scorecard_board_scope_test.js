// ============================================================================
// "SHOWING 4 OF 4 PLAYERS" — A CONFIRMATION THAT COULD NEVER REPORT A PROBLEM
//
// The scorecard's expanded leaderboard is reached by tapping "Full Leaderboard"
// on the compact card. Three separate places said it showed the whole field:
//
//   the overlay markup       "FULL FIELD, WITHOUT LEAVING SCORE ENTRY"
//   renderLiveBoard()        "The whole field, plus who has actually won a skin"
//   its own footer           "Confirms at a glance that nobody is missing"
//
// It did not. It called liveStandings(), which scopes to __scFilteredPlayers, so
// a Group 1 scorekeeper on a twelve-golfer round opened the FULL leaderboard and
// saw four people. Measured in Chrome before any of this was written.
//
// AND THE FOOTER COULD NOT POSSIBLY HAVE CAUGHT IT, because it was built as
//
//     'Showing ' + shown + ' of ' + shown + ' players'
//
// the same variable twice. It reads "Showing 4 of 4" on a field of twelve. A
// sentence whose entire job is to report a discrepancy, structurally incapable of
// reporting one - and the test guarding it, named "the footer confirms the whole
// field is present", never set a group lock, so it exercised the one state where
// the two numbers legitimately agree. Green suite, uncovered defect, exactly the
// default-state gap CLAUDE.md opens with.
//
// THE PRODUCT RULE IS NOT BEING REVERSED. group_scope_test.js holds it:
//
//   Scorecard          the group this scorekeeper is responsible for
//   Leaderboard page   the whole field
//
// The COMPACT CARD stays scoped - that is the working view, and it is asserted
// below so this change cannot quietly widen it. What changes is the EXPANDED
// view, which claimed the whole field in three comments and now delivers it, with
// a toggle back to the group mirroring the Leaderboard page's By Group / All
// Players. The footer now compares what is shown against the real field size, so
// it can finally say something false-looking when something is missing.
//
// NO <details>. CLAUDE.md records one that fired at parse time and poisoned its
// own stored state; this is a button and a class.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const IDX = ['score-marks.js', 'money-engine.js', 'action-model.js',
             'settlement-engine.js', 'pool-engine.js', 'bet-strip.js', 'hole-events.js'];
const cd18 = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));

// Twelve golfers, three foursomes, everybody thru six holes so nobody is dropped
// for not having started.
const NAMES = ['Marty', 'Scott', 'Carp', 'Randy', 'Manny', 'Matt B',
               'Lance', 'Kopp', 'Marcus', 'Rocco', 'Matt H', 'Jeremy'];
const FIELD = NAMES.map((name, i) => (
    { id: 101 + i, name, hcp: String(i % 5), group: Math.floor(i / 4) + 1 }));
const GROUP1 = NAMES.slice(0, 4);
const OTHERS = NAMES.slice(4);
const SCORES = (() => {
    const s = {};
    FIELD.forEach((p, pi) => { for (let h = 1; h <= 6; h++) s['p' + p.id + '_h' + h] = 4 + ((pi + h) % 3); });
    return s;
})();
const ROUND = { players: FIELD, courseData: cd18, scores: SCORES, gameFormat: 'stroke' };

// The scorecard as a ?group=N link renders it. Real lock, the way index.html sets
// one - filtering a player array by hand would prove the filter works, not that
// the lock reaches the board.
function scorecard(lockedGroup) {
    const sb = loadHtmlInlineScript('index.html', IDX);
    const groupMap = FIELD.reduce((m, p) => (m[p.id] = p.group, m), {});
    vm.runInContext(`
        currentMode = 'BOARD';
        hasGroupLock = ${lockedGroup ? 'true' : 'false'};
        lockedGroup = ${lockedGroup || 'null'};
        currentData = ${JSON.stringify(ROUND)};
        window.__scPlayerGroupMap = ${JSON.stringify(groupMap)};
        window.__scFilteredPlayers = ${lockedGroup
            ? `currentData.players.filter(function (p) { return p.group === ${lockedGroup}; })`
            : '[]'};
        renderLiveTicker();
        renderLiveBoard();
    `, sb);
    const el = id => String(vm.runInContext(
        `(document.getElementById('${id}') || {}).innerHTML || ''`, sb));
    const strip = h => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    const namesIn = t => NAMES.filter(n => new RegExp('\\b' + n + '\\b').test(t));
    return {
        sb,
        run: c => vm.runInContext(c, sb),
        boardNames: () => namesIn(strip(el('live-board-body'))),
        boardText: () => strip(el('live-board-body')),
        // RAW markup. strip() deletes tags, so a class name can never appear in
        // boardText() - an assertion about the toggle's absence made against the
        // stripped text would pass on any page at all.
        boardHtml: () => el('live-board-body'),
        cardNames: () => {
            const t = strip(el('live-ticker-mount'));
            const start = t.indexOf('LIVE LEADERBOARD');
            if (start === -1) return [];
            const ends = ['SKINS', 'LIVE MATCHES', 'LIVE GAME', 'LIVE DOTS']
                .map(m => t.indexOf(m, start)).filter(i => i > -1);
            return namesIn(t.slice(start, ends.length ? Math.min.apply(null, ends) : undefined));
        },
    };
}

describe('THE EXPANDED BOARD IS THE WHOLE FIELD', () => {

    test('THE REPORTED DEFECT: a Group 1 link opens it and sees everybody', () => {
        const names = scorecard(1).boardNames();
        assert.equal(names.length, 12,
            'the FULL leaderboard showed ' + names.length + ' of 12: ' + names.join(', '));
        OTHERS.forEach(n => assert.ok(names.includes(n),
            n + ' is in this round and missing from the full leaderboard'));
    });

    test('an organizer with no lock is unchanged', () => {
        assert.equal(scorecard(null).boardNames().length, 12);
    });

    test('every group link gets the same whole field, not just group 1', () => {
        [1, 2, 3].forEach(g => assert.equal(scorecard(g).boardNames().length, 12,
            'group ' + g + ' sees a short field'));
    });
});

describe('THE FOOTER CAN FINALLY REPORT A DISCREPANCY', () => {

    test('it counts against the REAL field, not against itself', () => {
        const src = read('index.html').replace(/\/\/.*$/gm, '');
        const at = src.indexOf('function renderLiveBoard');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 30));
        // The exact shape it shipped as, whitespace-tolerant: one expression whose
        // two operands are the same identifier.
        assert.ok(!/Showing '\s*\+\s*(\w+)\s*\+\s*' of '\s*\+\s*\1\b/.test(fn),
            'the footer still compares a number with itself and can never fire');
    });

    test('whole field: it says 12 of 12', () => {
        assert.match(scorecard(1).boardText(), /Showing 12 of 12 players/);
    });

    // THE ASSERTION THE OLD TEST COULD NOT MAKE.
    test('narrowed to the group: it says 4 of 12, and the gap is visible', () => {
        const s = scorecard(1);
        s.run("setLiveBoardScope('group');");
        assert.match(s.boardText(), /Showing 4 of 12 players/,
            'a scorekeeper cannot tell that eight golfers are not on this list');
    });

    test('one group in the whole round is not a discrepancy', () => {
        const sb = loadHtmlInlineScript('index.html', IDX);
        vm.runInContext(`
            currentMode = 'BOARD'; hasGroupLock = false; lockedGroup = null;
            currentData = ${JSON.stringify({ players: FIELD.slice(0, 4),
                courseData: cd18, scores: SCORES, gameFormat: 'stroke' })};
            window.__scFilteredPlayers = [];
            renderLiveBoard();
        `, sb);
        const t = String(vm.runInContext(
            "document.getElementById('live-board-body').innerHTML", sb))
            .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        assert.match(t, /Showing 4 of 4 players/);
    });
});

describe('THE TOGGLE MIRRORS THE LEADERBOARD PAGE', () => {

    // Asserted on the RENDERED markup, not the source: the handler is built by
    // interpolating the mode, so setLiveBoardScope('group') never appears literally
    // in index.html. Checking the source for it would fail on a correct
    // implementation and pass on a hard-coded one.
    test('it offers the same two choices, by the same names', () => {
        const h = scorecard(1).boardHtml();
        assert.match(h, /setLiveBoardScope\('group'\)/, 'no By Group control is wired');
        assert.match(h, /setLiveBoardScope\('field'\)/, 'no All Players control is wired');
        assert.match(h, /By Group/, 'the group choice is unlabelled');
        assert.match(h, /All Players/, 'the field choice is unlabelled');
        // The same vocabulary the Leaderboard page uses, so a golfer moving between
        // the two surfaces is not asked to learn a second one.
        const lb = read('leaderboard.html');
        assert.match(lb, /By Group/, 'the Leaderboard page renamed its group view');
        assert.match(lb, /All Players/, 'the Leaderboard page renamed its field view');
    });

    test('the chosen one is marked, so it says which you are looking at', () => {
        const s = scorecard(1);
        assert.match(s.boardHtml(), /lb-scope-btn active[^>]*setLiveBoardScope\('field'\)/,
            'nothing shows that All Players is the current view');
        s.run("setLiveBoardScope('group');");
        assert.match(s.boardHtml(), /lb-scope-btn active[^>]*setLiveBoardScope\('group'\)/,
            'the toggle does not follow the choice');
    });

    test('it defaults to the whole field — that is what the button promises', () => {
        assert.match(scorecard(1).boardText(), /Showing 12 of 12 players/);
    });

    test('switching to the group narrows it, and back widens it again', () => {
        const s = scorecard(1);
        s.run("setLiveBoardScope('group');");
        assert.deepEqual(s.boardNames().sort(), GROUP1.slice().sort());
        s.run("setLiveBoardScope('field');");
        assert.equal(s.boardNames().length, 12, 'it cannot get back to the whole field');
    });

    test('it is a button and a class, not a <details>', () => {
        const src = read('index.html').replace(/\/\/.*$/gm, '');
        const at = src.indexOf('function renderLiveBoard');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 30));
        assert.ok(!/<details/.test(fn),
            'CLAUDE.md records a <details> that fired at parse time and poisoned its state');
        assert.match(fn, /lb-scope-btn/, 'the toggle is not built from a button and a class');
    });

    test('with nothing to scope to, the toggle is not offered', () => {
        // No lock: "my group" is not a thing this link has.
        const h = scorecard(null).boardHtml();
        assert.ok(!/lb-scope-btn/.test(h),
            'an organizer is offered a group filter with no group');
        assert.ok(!/By Group/.test(h));
    });

    test('and it IS offered on a group link', () => {
        // The other half. Without this, the assertion above passes on a page that
        // never renders a toggle for anybody.
        assert.match(scorecard(1).boardHtml(), /lb-scope-btn/,
            'no scope toggle on the surface that needs one');
    });
});

describe('THE COMPACT CARD IS UNCHANGED — THE RULE STANDS', () => {

    // group_scope_test.js owns this rule; asserted here too so widening the
    // overlay cannot quietly widen the working view with it.
    test('a Group 1 link still sees only its foursome on the card', () => {
        const names = scorecard(1).cardNames();
        assert.deepEqual(names.slice().sort(), GROUP1.slice().sort(),
            'the compact card widened to the field: ' + names.join(', '));
        OTHERS.forEach(n => assert.ok(!names.includes(n), n + ' is not this scorekeeper’s'));
    });

    test('and the scope toggle does not touch it', () => {
        const s = scorecard(1);
        s.run("setLiveBoardScope('field'); renderLiveTicker();");
        assert.deepEqual(s.cardNames().slice().sort(), GROUP1.slice().sort(),
            'opening the full board rescoped the working card underneath it');
    });

    test('liveStandings still reads the canonical scoped set by default', () => {
        const src = read('index.html');
        const at = src.indexOf('function liveStandings');
        const fn = src.slice(at, at + 1800);
        assert.match(fn, /window\.__scFilteredPlayers/);
        assert.match(fn, /currentData && currentData\.players/);
    });
});
