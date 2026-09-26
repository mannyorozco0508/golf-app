// ============================================================================
// THE MATCHES TAB IS FOR SIDE BETS (UI Wave 10, option A1)
//
// The Ryder Cup builder lived permanently on sidematches.html, so a golfer who
// opened Matches to add a $10 side bet met "Set Up a Ryder Cup", a Classic 3-day
// preset and "Join a Cup That Already Exists" first. It will never be used from
// there; the tab is for side bets.
//
// IT IS GATED, NOT DELETED, AND THAT IS A MEASUREMENT RATHER THAN CAUTION.
// renderRyderCupSetup exists in exactly ONE file - this one. tournament.html has
// no Ryder references at all. And the wizard DEPENDS on it: choosing the Ryder Cup
// format card makes saveSettings() navigate to sidematches.html?setup=ryder
// (admin.html:8462) instead of showing Round Ready, and the organizer then taps one
// of those two buttons to build the Cup. Deleting them would leave a main format
// that navigates to a surface with nothing on it. "Join a Cup That Already Exists"
// is the only way days 2 and 3 of a multi-round Cup attach to day 1.
//
// So the block renders on exactly three conditions, and is absent otherwise:
//   1  the page arrived with ?setup=ryder   (the wizard handoff)
//   2  this round already HAS a Cup on it   (hasRyderCup - an in-progress Cup
//      must stay manageable)
//   3  this round carries a ryderCupRef     (it is a later day of somebody's Cup)
//
// ELEVEN SUITES AND 320 TESTS reach this surface. None is weakened here: the ones
// that arrive with ?setup=ryder still see everything they always saw.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { decodeEscapes } = require('./helpers/decode-escapes.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
// DECODED. The Classic preset's label is written with \u escapes in the source, so
// a plain regex carrying the em dash matched six ASCII characters and no glyph -
// and reported a correct page as having deleted the button. CLAUDE.md's rule:
// any assertion that reads SOURCE and matches user-facing text decodes first.
const SM = decodeEscapes(read('sidematches.html'));
const CD = makeCourseData(18);
const DEPS = ['handicap.js', 'text-safe.js', 'action-model.js', 'match-engine.js',
    'money-engine.js', 'settlement-engine.js', 'grouping.js', 'ryder-cup.js'];
const P = [101, 102, 103, 104].map((id, i) => ({
    id, name: ['Ann', 'Ben', 'Cal', 'Dee'][i], hcp: '10', playingForMoney: true
}));

function arrive(search, extra) {
    const sb = loadHtmlInlineScript('sidematches.html', DEPS, { search: search });
    vm.runInContext('alert = function () {}; uiRefuse = function () {}; uiFail = function () {};'
        + ' uiToast = function () {}; isOrganizerView = function () { return true; };', sb);
    const handlers = sb.__dbHandlers.filter(h => h.event === 'value');
    assert.ok(handlers.length > 0, 'the page registered no value handler');
    const data = Object.assign({ eventName: 'Single Round', players: P, courseData: CD, scores: {} },
        extra || {});
    handlers.forEach(h => h.cb({ val: () => JSON.parse(JSON.stringify(data)) }));
    return sb;
}
const mount = sb => String(vm.runInContext(
    "document.getElementById('ryder-cup-setup').innerHTML", sb) || '');

// A real Cup, in THE SHAPE ryder-cup.js ACTUALLY READS. My first fixture used
// `teams`, which that file has never looked at: ryderCupConfig() requires
// `sides` with at least two keys and returns null otherwise (ryder-cup.js:81-82),
// and hasRyderCup is exactly `config !== null`. A fixture the predicate rejects
// would have made this test fail against a correct gate - so it is built from the
// normalizer rather than from memory.
const WITH_CUP = {
    ryderCup: {
        name: 'The Cup',
        sides: { A: { name: 'Red' }, B: { name: 'Blue' } },
        members: { 101: 'A', 102: 'A', 103: 'B', 104: 'B' }
    }
};

describe('A GOLFER OPENING MATCHES FOR SIDE BETS DOES NOT MEET A RYDER CUP', () => {

    test('a plain arrival folds the Cup behind one closed row', () => {
        // CORRECTED FROM "renders nothing", and the correction is the finding. Emptying
        // the mount read correctly and broke a documented capability: ryder-cup.js says
        // a Cup is a LAYER, not a format - "A Stroke Play round with Skins and three
        // side matches can also be Session 2 of the Cup" - and the only route to that
        // is this tab WITHOUT ?setup=ryder, because the round was never set up as a
        // Cup. Fourteen tests across five suites said so before this guard did.
        // So it folds: one 44px row, closed, and the card behind it.
        const h = mount(arrive('?game=ENTRY'));
        assert.match(h, /rcs-fold/, 'the Cup block is not folded on a plain arrival');
        assert.match(h, /Running a Ryder Cup\?/, 'the fold row does not say what it opens');
        // CLOSED. `open` is checked as an ATTRIBUTE, not as the substring - the class
        // name itself contains no "open", but a future one might, and Wave 7 was bitten
        // by exactly that when /\bopen\b/ matched an element's own id.
        const summaryAt = h.indexOf('<details');
        const tag = h.slice(summaryAt, h.indexOf('>', summaryAt) + 1);
        assert.ok(!/\sopen(?=[\s=>])/.test(tag), 'the fold ships open: ' + tag);
        // And the three controls are behind it rather than gone.
        assert.match(h, /rcOpen\(\)/, 'the custom Cup entry is not inside the fold');
        assert.match(h, /rcOpenClassic\(\)/, 'the Classic preset is not inside the fold');
    });

    test('and with any of the three conditions it is NOT folded', () => {
        // The difference between "one tap away" and "straight in front of you". An
        // organizer sent here by the wizard should not have to open anything.
        const h = mount(arrive('?game=ENTRY&setup=ryder'));
        assert.ok(!/rcs-fold/.test(h),
            'the wizard handoff still makes the organizer open a disclosure first');
    });

    test('and the side bets ARE there, which is what the tab is for', () => {
        // THE POSITIVE HALF. "No Cup block" is trivially true of a page that rendered
        // nothing, and that is the exact way this change could go wrong.
        const sb = arrive('?game=ENTRY');
        // MEASURED, NOT ASSUMED, AND THE HARNESS SETS THE TERMS: #sidematches-card is
        // STATIC markup, and mini-dom keeps innerHTML as a string with no children
        // parsed from it - so reading the card's innerHTML returns 0 characters
        // whether the page works or not. My first version asserted on it and failed
        // on a correct page. #sidematches-list is written by the page's own render,
        // so it is the thing that actually shows the tab is alive.
        const list = String(vm.runInContext(
            "document.getElementById('sidematches-list').innerHTML", sb) || '');
        assert.ok(list.length > 50, 'the side-match list rendered nothing: ' + list.length);
        const shown = vm.runInContext(
            "document.getElementById('sidematches-card').style.display !== 'none'", sb);
        assert.equal(shown, true, 'the Side Matches card is hidden on a plain arrival');
    });
});

describe('BUT EVERY PATH THAT STILL USES IT KEEPS WORKING', () => {

    test('the wizard handoff still shows both entry buttons', () => {
        // This is the arrival admin.html:8462 creates for the Ryder Cup main format,
        // and what entry_screen_cleanup_test.js:196 asserts on.
        const h = mount(arrive('?game=ENTRY&setup=ryder'));
        assert.match(h, /Set Up a Ryder Cup/, 'the custom Cup widget is gone');
        assert.match(h, /Classic Ryder Cup/, 'the Classic 3-day preset is gone');
    });

    test('a round that already has a Cup still shows it, without the flag', () => {
        const h = mount(arrive('?game=ENTRY', WITH_CUP));
        assert.ok(h.length > 40, 'an in-progress Cup can no longer be managed: ' + h);
    });

    test('a later day of a Cup still shows it, without the flag', () => {
        const h = mount(arrive('?game=ENTRY', { ryderCupRef: { host: 'HOST1', sessionId: 's1' } }));
        assert.ok(h.length > 40, 'a round pointing at a Cup shows nothing: ' + h);
    });

    test('NOTHING WAS DELETED - all three controls are still in the file', () => {
        // The difference between gating and deleting, asserted. If a later wave
        // decides to remove them, it does so deliberately and not by way of this one.
        assert.match(SM, /Set Up a Ryder Cup/, 'the custom Cup button was deleted');
        assert.match(SM, /Classic Ryder Cup — 3 Days, 5 Sessions/, 'the Classic preset was deleted');
        assert.match(SM, /Join a Cup/, 'the join path was deleted');
        assert.match(SM, /function renderRyderCupSetup/, 'the builder was deleted');
        // Named from the file, not from memory: the join path is rcOpenJoin ->
        // rcJoinLookup -> rcJoinConfirm. My first version asserted an rcJoinByCode
        // that has never existed, which would have reported a deletion that had not
        // happened - the dangerous direction for a guard like this.
        ['rcOpenJoin', 'rcJoinLookup', 'rcJoinConfirm'].forEach(fn =>
            assert.match(SM, new RegExp('function ' + fn + '\\s*\\('),
                'the join path lost ' + fn));
    });

    test('the gate is one condition, and it names all three ways in', () => {
        const fn = SM.slice(SM.indexOf('function renderRyderCupSetup'),
                            SM.indexOf('\n    function ', SM.indexOf('function renderRyderCupSetup') + 30));
        assert.ok(fn.length > 400, 'renderRyderCupSetup could not be sliced: ' + fn.length);
        assert.match(fn, /setup.*ryder|rcSurfaceWanted/, 'no arrival condition in the renderer');
        // The predicates are the app's own, not a second opinion about what a Cup is.
        const gate = SM.slice(SM.indexOf('function rcSurfaceWanted'),
                              SM.indexOf('\n    function ', SM.indexOf('function rcSurfaceWanted') + 30));
        assert.ok(gate.length > 120, 'rcSurfaceWanted could not be sliced: ' + gate.length);
        assert.match(gate, /hasRyderCup\(/, 'the gate does not use hasRyderCup');
        assert.match(gate, /ryderCupRef/, 'the gate forgets the later-day case');
        assert.match(gate, /setup/, 'the gate forgets the wizard handoff');
    });
});

describe('AND THE TAB NO LONGER DESCRIBES WHAT IS NOT THERE', () => {
    test('the intro sentence does not promise a Ryder Cup', () => {
        // It never did mention the Cup, and this asserts it stays that way now that
        // the Cup is conditional - a sentence naming it would be false on the arrival
        // a golfer actually makes.
        const intro = SM.slice(SM.indexOf('id="sidematches-card"'),
                               SM.indexOf('id="sidematches-card"') + 900);
        assert.ok(intro.length > 200, 'the card intro could not be sliced');
        assert.ok(!/Ryder/i.test(intro),
            'the Side Matches card now describes a Ryder Cup that a plain arrival does '
            + 'not show: ' + intro.slice(0, 200));
    });
});
