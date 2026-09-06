// ============================================================================
// THE ALTERNATE-SHOT CARD HAS TO REACH THE SCREEN
//
// Phase 5 built the whole Foursomes team-score entry: context resolution, a box
// per side, WHS allowance, narrow-path writes so two groups cannot overwrite each
// other, host-side locking on the first score, a 360px card. 590 lines of tests.
//
// And it never wired renderFoursomesEntryHtml into any render path. Its only
// mention in the codebase was its own definition. A golfer playing a Foursomes
// session had no way to enter a score, while the engine happily banked points for
// a format nothing could score.
//
// The Phase 5 suite passed throughout, because both of its wiring tests asserted
// that a STRING appeared in the source:
//
//     test('the entry function is wired to its call site', ...)
//         assert.ok(/onchange="saveFoursomesScore\(/.test(IDX))
//
// That string lives inside the dead function's own generated markup. The one test
// whose name claimed the feature was reachable was satisfied by the feature
// quoting itself. Both are rewritten in ryder_cup_phase5_test.js to render.
//
// SO EVERY TEST HERE RENDERS. It builds a real round, calls the real
// renderHoleView(), and reads what a golfer would actually see. None of them
// greps index.html, and none calls renderFoursomesEntryHtml directly - that
// function was never the broken part.
//
// WHERE THE CARD SITS, and why. After the per-golfer rows and before Prev/Next:
//   - the comment at renderHoleView's dashboard block records that content
//     between the hole heading and the score boxes pushes the inputs away from
//     the hole they belong to, which is why the live dashboard was moved out
//   - it is a score box, so it belongs with the score boxes, not among the
//     betting readouts below
//   - "SCORE -> NEXT": below the nav row it would simply be missed
//
// ADDED, NOT SUBSTITUTED. The individual boxes still render. Replacing them is a
// bigger change that removes a way to score, and it can be tightened later once
// a round has actually been played on this.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

const DEPS = ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js',
    'pool-engine.js', 'bet-strip.js', 'hole-events.js', 'ryder-cup.js'];

const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const PLAYERS = [
    { id: 101, name: 'Ann Adams', hcp: '0' }, { id: 102, name: 'Bob Brown', hcp: '0' },
    { id: 103, name: 'Cal Clark', hcp: '0' }, { id: 104, name: 'Dee Dunn', hcp: '0' }];

// HOLE 5 IS LEFT UNSCORED ON PURPOSE. renderScorecard lands currentViewedHole on
// the first hole missing a score, so a fully-scored fixture always opens on hole 1
// - and a card that hardcoded hole 1 would be indistinguishable from one that
// followed the golfer. A control that wrote every score to hole 1 escaped exactly
// that way. Opening on hole 5 makes the difference visible.
function scoresFor() {
    const s = {};
    PLAYERS.forEach(p => CD.forEach(h => {
        if (h.hole === 5) return;
        s['p' + p.id + '_h' + h.hole] = 4;
    }));
    return s;
}

// A Cup whose single session carries `format`, with one pairing in it.
function cupWith(format) {
    const need = format === 'singles' ? 1 : 2;
    return {
        v: 1, name: 'Test Cup',
        sides: { A: { id: 'A', name: 'Rattle' }, B: { id: 'B', name: 'Chaos' } },
        members: { '101': 'A', '102': 'A', '103': 'B', '104': 'B' },
        sessions: { s9: { id: 's9', day: 1, order: 1, format: format, label: 'Session' } },
        matches: {
            m1: {
                id: 'm1', sessionId: 's9', format: format,
                scoring: format === 'foursomes' ? 'scratch' : 'net',
                sideA: 'A', sideB: 'B',
                playersA: ['101', '102'].slice(0, need),
                playersB: ['103', '104'].slice(0, need)
            }
        }
    };
}

// Renders Hole View the way the app does and hands back the markup a golfer sees.
function holeView(extra) {
    const sb = loadHtmlInlineScript('index.html', DEPS);
    const run = e => vm.runInContext(e, sb);
    run('alert=function(){};');
    run('currentMode = "TESTRD";');
    const data = Object.assign({
        gameFormat: 'stroke', players: PLAYERS, courseData: CD, scores: scoresFor()
    }, extra || {});
    run('currentData = ' + JSON.stringify(data) + ';');
    run('renderScorecard();');
    run('setViewMode("hole");');
    return {
        html: run('document.getElementById("hole-view-card").innerHTML'),
        run: run
    };
}

// A round that IS a Foursomes session of a Cup hosted on itself.
const foursomesRound = () => holeView({
    ryderCup: cupWith('foursomes'),
    ryderCupRef: { host: 'TESTRD', sessionId: 's9' }
});

describe('THE CARD REACHES THE SCREEN', () => {

    test('the round really is a playable Foursomes session', () => {
        const v = foursomesRound();
        assert.equal(v.run('ryderResolutionUsable(ryderResolution())'), true);
        assert.equal(v.run('!!ryderFoursomesContext()'), true, 'the context did not resolve');
    });

    // THE DEFECT. The card was built correctly and never rendered.
    test('Hole View shows the alternate-shot card', () => {
        assert.match(foursomesRound().html, /fs-card/,
            'a golfer in a Foursomes session has no way to enter a score');
    });

    test('it says what it is', () => {
        assert.match(foursomesRound().html, /Alternate Shot/);
    });

    test('it carries a score box for each side', () => {
        const html = foursomesRound().html;
        const boxes = html.match(/class="fs-in"/g) || [];
        assert.equal(boxes.length, 2, 'one box per side, not per golfer');
    });

    test('each box writes through the real save path', () => {
        const html = foursomesRound().html;
        assert.match(html, /onchange="saveFoursomesScore\('m1','A',\d+, this\.value\)"/);
        assert.match(html, /onchange="saveFoursomesScore\('m1','B',\d+, this\.value\)"/);
    });

    test('it names both partnerships', () => {
        const html = foursomesRound().html;
        assert.match(html, /Ann \/ Bob/);
        assert.match(html, /Cal \/ Dee/);
    });

    test('it is the CURRENT hole that is being entered', () => {
        const v = foursomesRound();
        const hole = Number(v.run('currentViewedHole'));
        assert.equal(hole, 5, 'the fixture must not open on hole 1 - see scoresFor');
        assert.match(v.html, new RegExp("saveFoursomesScore\\('m1','A'," + hole + ","),
            'the card writes to a different hole than the one on screen');
    });

    // Placement is a real decision, so it is pinned rather than left to drift.
    //
    // HARNESS LIMIT, stated rather than worked around: mini-dom stores innerHTML as
    // a string, so the Full Card <tr> has no child nodes and renderHoleView emits NO
    // hv-player-row at all here. The card's position relative to the per-golfer
    // boxes therefore cannot be checked in this harness - only its position between
    // the hole heading and Prev/Next, which is what is asserted. The full ordering,
    // with real score boxes on either side, is verified in headless Chrome by
    // tools/foursomes-entry-check.js.
    test('it sits below the hole heading and above Prev/Next', () => {
        const html = foursomesRound().html;
        const head = html.indexOf('hole-view-header');
        const card = html.indexOf('fs-card');
        const nav = html.indexOf('hole-view-nav-row');
        assert.ok(head !== -1 && card !== -1 && nav !== -1, 'a landmark is missing');
        assert.ok(head < card, 'the card landed above the hole heading');
        assert.ok(card < nav, 'the card sits below Prev/Next, where it would be missed');
    });
});

describe('IT APPEARS ONLY WHERE IT SHOULD', () => {

    test('a Four-Ball session gets no card', () => {
        const v = holeView({ ryderCup: cupWith('fourball'),
                             ryderCupRef: { host: 'TESTRD', sessionId: 's9' } });
        assert.ok(!/fs-card/.test(v.html), 'Four-Ball is scored per golfer');
    });

    test('a Singles session gets no card', () => {
        const v = holeView({ ryderCup: cupWith('singles'),
                             ryderCupRef: { host: 'TESTRD', sessionId: 's9' } });
        assert.ok(!/fs-card/.test(v.html));
    });

    test('an ordinary round with no Cup gets no card', () => {
        assert.ok(!/fs-card/.test(holeView().html),
            'every non-Cup round in the app would grow an alternate-shot box');
    });

    test('a Cup with no session pointer gets no card', () => {
        // status 'local' - a Phase 1-3B Cup with no ryderCupRef. No sessionId, so
        // there is no session to be a Foursomes one.
        const v = holeView({ ryderCup: cupWith('foursomes') });
        assert.ok(!/fs-card/.test(v.html));
    });

    test('a Cup hosted elsewhere and unreachable gets no card', () => {
        const v = holeView({ ryderCupRef: { host: 'OTHER', sessionId: 's9' } });
        assert.ok(!/fs-card/.test(v.html), 'an unavailable host must fail soft');
    });
});

describe('INDIVIDUAL ENTRY IS UNTOUCHED', () => {

    // This wave ADDS the card. Replacing the per-golfer boxes removes a way to
    // score, and that is a decision to make after a round has been played on it.
    // ADDED, NOT SUBSTITUTED - provable without needing the per-golfer rows to
    // render. The Foursomes Hole View must be the ordinary one with the card
    // inserted and NOTHING ELSE changed: strip the card back out and the two must
    // be identical. A replacement would fail this, and so would anything that
    // quietly reordered or dropped a section while wiring the card in.
    test('the Foursomes view is the ordinary view plus the card, exactly', () => {
        const plain = holeView().html;
        const withCard = foursomesRound().html;
        assert.notEqual(plain, withCard, 'nothing was added at all');
        const stripped = withCard.replace(/<div class="fs-card">[\s\S]*?<\/div><\/div>/, '');
        assert.equal(stripped, plain,
            'wiring the card in changed something else about Hole View');
    });

    test('an ordinary round grows no alternate-shot markup', () => {
        assert.ok(!/fs-card|Alternate Shot|saveFoursomesScore/.test(holeView().html));
    });
});
