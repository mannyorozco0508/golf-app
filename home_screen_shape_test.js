// ============================================================================
// THE HOME SCREEN SHOWS WHAT IS ACTUALLY USED
//
// FOUR CHANGES, and the first is a removal of something nobody has ever done.
//
// 1. NO CODE ENTRY. "ENTER GAME CODE" and "Join Game" are gone. Confirmed against
//    how these rounds actually start: a golfer arrives on a LINK the organizer
//    sends, and the link carries ?game=CODE which the page reads on load. Nobody
//    has typed a code, and the field asked every arriving golfer to answer a
//    question that was never theirs.
//
//    NOTHING ELSE DEPENDED ON IT. joinRoom existed only on this page and was
//    called only by that button. Every real way in - the round link, a group's
//    scorekeeper link (index.html?game=CODE&group=N), the read-only follow link
//    (shared.html?game=CODE), a deep link carrying ?eventType= - reads the URL
//    directly and never went near it. Duplicate keeps its own separate field.
//
//    LEGACY FOUR-CHARACTER CODES STILL OPEN. The link path applies no length rule
//    at all, so an old round's link works exactly as before. That guarantee moved
//    to the path that still exists rather than being deleted with the one that
//    did not; see code_length_test.js.
//
// 2. RESUME IS SMALL. It is a convenience for one person on one device, not a
//    third headline choice, and it sat as a full-width primary button competing
//    with the two tiles that are the actual question.
//
// 3. THE MARK LEADS. The logo is the first thing on the screen and was smaller
//    than the word underneath it. It grows; the wordmark shrinks. The wordmark
//    stays - a symbol alone does not tell a first-time golfer what this is.
//
// 4. AND EVERY PAGE CAN GET BACK. Covered in setup_page_nav_test.js for the two
//    action pages; this wave extends the same pattern to the pages that had no
//    way out at all.
//
// WHAT MINI-DOM CANNOT PROVE: relative rendered size. It has no layout, so the
// sizes here are read from the stylesheet as declared values. That is enough for
// "the mark is bigger than the wordmark" because both are declared in the same
// units in the same rule set; it would not be enough for anything depending on
// how they actually lay out.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ADMIN = read('admin.html');
const lobby = () => ADMIN.slice(ADMIN.indexOf('id="lobby-screen"'), ADMIN.indexOf('id="admin-screen"'));

// A declared px/rem value from a CSS rule in admin.html.
function cssNum(selector, prop) {
    const at = ADMIN.indexOf(selector + ' {');
    assert.ok(at > -1, 'no rule for ' + selector);
    const block = ADMIN.slice(at, ADMIN.indexOf('}', at));
    const m = new RegExp(prop + ':\\s*([\\d.]+)(px|rem)').exec(block);
    assert.ok(m, selector + ' declares no ' + prop + ': ' + block);
    return { n: Number(m[1]), unit: m[2] };
}

describe('NOBODY IS ASKED TO TYPE A CODE', () => {

    test('the code field is gone', () => {
        assert.ok(!/id="join-room-input"/.test(ADMIN),
            'the home still asks for a code nobody has ever typed');
        assert.ok(!/ENTER GAME CODE/.test(ADMIN));
    });

    test('the Join button is gone', () => {
        assert.ok(!/Join Game/.test(ADMIN));
        assert.ok(!/onclick="joinRoom\(\)"/.test(ADMIN));
    });

    test('and its handler went with it', () => {
        assert.ok(!/function joinRoom/.test(ADMIN),
            'a handler nothing can reach is left behind');
    });

    test('no divider is left stranded by the removal', () => {
        // Two "OR"s separated three ways in. One way in needs no "OR" at all.
        const l = lobby();
        const before = l.slice(0, l.indexOf('id="duplicate-room-input"'));
        assert.equal((before.match(/lobby-divider/g) || []).length, 0,
            'an "OR" survives with nothing on one side of it');
    });

    test('DUPLICATE keeps its own field, which is a different question', () => {
        assert.match(ADMIN, /id="duplicate-room-input"/,
            'the duplicate field was removed with the join field');
        assert.match(ADMIN, /onclick="duplicateRoom\(\)"/);
        assert.match(ADMIN, /maxlength="6"/, 'and it still holds a whole code');
    });

    test('the shared input styling survives for it', () => {
        assert.match(ADMIN, /\.join-input \{/,
            'the CSS went with the join field and took duplicate down with it');
    });
});

describe('EVERY REAL WAY INTO A ROUND STILL WORKS', () => {

    // These are the paths golfers actually use, and none went through joinRoom.
    test('a round link opens the round', () => {
        const sb = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js'],
            { search: '?game=ABCD12' });
        assert.equal(vm.runInContext('currentMode', sb), 'ABCD12',
            'a link no longer opens the round it names');
    });

    test('a legacy four-character link still opens', () => {
        const sb = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js'],
            { search: '?game=ABCD' });
        assert.equal(vm.runInContext('currentMode', sb), 'ABCD',
            'an old round became unreachable');
    });

    test('the scorecard reads the same parameter', () => {
        const sb = loadHtmlInlineScript('index.html',
            ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js',
             'pool-engine.js', 'bet-strip.js', 'hole-events.js', 'ryder-cup.js'],
            { search: '?game=WXYZ99&group=2' });
        assert.equal(vm.runInContext('currentMode', sb), 'WXYZ99');
    });

    test('a group scorekeeper link is still built', () => {
        assert.match(ADMIN, /function scorecardUrlFor/, 'group links lost their builder');
        const fn = ADMIN.slice(ADMIN.indexOf('function scorecardUrlFor'),
            ADMIN.indexOf('function scorecardUrlFor') + 400);
        assert.match(fn, /index\.html/);
        assert.match(fn, /'\?game=' \+ gameCode/);
        assert.match(fn, /&group=/, 'a group link that names no group overwrites another card');
    });

    test('the read-only follow link is still built', () => {
        assert.match(read('leaderboard.html'), /shared\.html\?game=\$\{currentMode\}/,
            'the spectator link was lost');
    });

    test('a deep link carrying eventType still works', () => {
        assert.match(ADMIN, /urlParams\.get\('eventType'\)/,
            'the deep-link parameter was removed with the join path');
    });

    test('the trip code field is untouched — a different code, a different page', () => {
        assert.match(read('trip.html'), /id="join-trip-input"/);
    });
});

describe('RESUME IS A CONVENIENCE, NOT A HEADLINE', () => {

    test('it is still there and still resumes', () => {
        assert.match(ADMIN, /id="resume-container"/);
        assert.match(ADMIN, /onclick="resumeGame\(\)"/);
        assert.match(ADMIN, /id="resume-room-badge"/, 'and it still names the round');
    });

    test('it is still hidden until there is something to resume', () => {
        assert.match(ADMIN, /id="resume-container"[^>]*display: ?none/);
    });

    test('it is no longer a full-width primary button', () => {
        const box = ADMIN.slice(ADMIN.indexOf('id="resume-container"'),
                                ADMIN.indexOf('id="resume-container"') + 700);
        assert.ok(!/class="btn-primary"/.test(box),
            'Resume still competes with the two tiles that are the actual question');
    });

    test('and it carries a class that can be styled small', () => {
        const box = ADMIN.slice(ADMIN.indexOf('id="resume-container"'),
                                ADMIN.indexOf('id="resume-container"') + 700);
        assert.match(box, /class="resume-link"/, 'nothing to style it by');
        assert.match(ADMIN, /\.resume-link \{/, 'the class has no rule');
    });

    // Small is not the same as unreachable on a phone.
    test('it still meets the touch target minimum', () => {
        const h = cssNum('.resume-link', 'min-height');
        assert.ok(h.n >= 40, '.resume-link min-height is ' + h.n + h.unit
            + ', below a usable touch target');
    });
});

describe('THE MARK LEADS THE SCREEN', () => {

    test('the logo is bigger than it was', () => {
        assert.ok(cssNum('.lobby-mark', 'width').n > 72,
            'the mark did not grow');
        assert.ok(cssNum('.lobby-mark img', 'width').n > 56,
            'the disc grew but the symbol inside it did not');
    });

    test('the symbol still fits inside its disc', () => {
        assert.ok(cssNum('.lobby-mark img', 'width').n < cssNum('.lobby-mark', 'width').n,
            'the symbol is as wide as or wider than the disc it sits in');
    });

    test('the wordmark is smaller than it was', () => {
        const t = cssNum('.lobby-title', 'font-size');
        assert.equal(t.unit, 'rem');
        assert.ok(t.n < 2, 'the wordmark is still ' + t.n + 'rem');
    });

    test('but the wordmark survives — a symbol alone names nothing', () => {
        assert.match(ADMIN, /class="lobby-title">Rattle Golf</,
            'a first-time golfer is shown a symbol and no name');
    });

    test('the img element is sized to match its rule', () => {
        // width/height attributes on the tag override nothing but do describe the
        // intrinsic box; leaving them at the old size makes the markup lie.
        const tag = /<img src="logo-mark\.png"[^>]*>/.exec(ADMIN);
        assert.ok(tag, 'the logo img is gone');
        const w = /width="(\d+)"/.exec(tag[0]);
        assert.ok(w && Number(w[1]) === cssNum('.lobby-mark img', 'width').n,
            'the img attributes still describe the old size: ' + tag[0]);
    });

    test('the mark is still tappable for the secret panel', () => {
        assert.match(ADMIN, /class="lobby-logo lobby-mark" onclick="handleSecretTap\(\)"/);
    });
});
