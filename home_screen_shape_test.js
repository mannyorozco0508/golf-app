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

    // The duplicate field went in the wave after this one, for the same reason:
    // never used. Its PREFILL is untouched - see below.
    test('the duplicate field is gone too', () => {
        assert.ok(!/id="duplicate-room-input"/.test(ADMIN));
        assert.ok(!/duplicateRoom/.test(ADMIN));
        assert.ok(!/GAME CODE TO COPY/.test(ADMIN));
    });

    test('and the styling that existed only for those two fields went with them', () => {
        assert.ok(!/\.join-input\b/.test(ADMIN),
            'a rule is left behind for controls that no longer exist');
    });

    // Cutting the button must not cut the capability. A link is still a way in.
    test('the copyFrom prefill still works — only the control was removed', () => {
        assert.match(ADMIN, /urlParams\.get\('copyFrom'\)/,
            'admin.html?game=NEW&copyFrom=OLD stopped pre-filling');
        assert.match(ADMIN, /loadModeData\(copyFromCode\)/);
    });

    // WHAT IS BELOW THE TILES, now that the code row is back. The shape finding
    // holds - compact rows, not a full-width field above a full-width button
    // competing with the tiles. RE-PINNED 2026-09-13 (v123): the copy-an-old-round
    // field is BACK, deliberately, as a second compact row: it is the only place
    // on this product that emits the copyFrom prefill (the trip select's copy had
    // never survived the lobby). RE-PINNED 2026-09-23: the email-link card sits
    // on this same lobby, so two more inputs (the address, and the pasted link)
    // belong here too. Four, and no others.
    // RE-PINNED v218: the season code is a fifth input, the same compact row
    // shape as the game code and the previous-round code. It opens a ledger,
    // it does not start a round. Five, and no others.
    test('below the tiles there is Resume, the email-link card, and exactly three compact code inputs', () => {
        // COMMENTS STRIPPED. The note explaining what stayed removed names
        // copyFrom=OLD, and an earlier version of this assertion matched that
        // sentence rather than any control - grading prose as though it were markup.
        const l = lobby().replace(/<!--[\s\S]*?-->/g, '');
        const afterWidgets = l.slice(l.indexOf('home-widgets'));
        const inputs = afterWidgets.match(/<input/g) || [];
        assert.equal(inputs.length, 5,
            'the home screen asks for ' + inputs.length + ' things to be typed');
        assert.match(afterWidgets, /id="email-link-input"/, 'the sign-in email');
        assert.match(afterWidgets, /id="email-link-paste"/, 'the pasted sign-in link');
        assert.match(afterWidgets, /id="join-code-input"/, 'the game code');
        assert.match(afterWidgets, /id="copy-code-input"/, 'the previous round to start from');
        assert.match(afterWidgets, /id="season-open-input"/, 'and the season code that opens a ledger');
        assert.ok(!/lobby-divider/.test(afterWidgets),
            'a divider survives with nothing to divide');
    });

    test('the code row is not a full-width block competing with the tiles', () => {
        // REPOINTED (UI Wave 5). This read display:flex out of the row's INLINE
        // style. The inline style is gone on purpose: an inline declaration beats
        // any rule, which is precisely why the shared row rule could not reach
        // #copy-code-row or the season row and they rendered 40px fields beside a
        // correct one. The layout is declared once now, for all three rows.
        assert.ok(ADMIN.indexOf('id="join-code-row"') > -1, 'the row is gone');
        const rule = ADMIN.slice(ADMIN.indexOf('#join-code-row, #copy-code-row, #season-open-row {'));
        const block = rule.slice(0, rule.indexOf('}'));
        assert.ok(block.length > 20, 'the shared row rule is gone');
        assert.match(block, /display:\s*flex/, 'the field and its button are stacked again');
        assert.match(block, /max-width:\s*var\(--ctl-max\)/, 'the row is not contained');
        // ALL THREE rows, by name: the whole defect this replaced was a fix that
        // only ever covered the first one.
        ['#join-code-row', '#copy-code-row', '#season-open-row'].forEach(sel =>
            assert.ok(block.indexOf('{') === -1 || rule.indexOf(sel) < rule.indexOf('{'),
                sel + ' is not in the shared row rule'));
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
            ['score-marks.js', 'match-engine.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js',
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
        // REPOINTED (UI Wave 5): the button system also gives .resume-link
        // min-height: var(--ctl-h), and being later in the sheet that is the
        // value that actually governs. cssNum above reads the FIRST rule for the
        // class, so it would go on passing on 44px if the system's own number
        // ever dropped below it - which is the shape of an inert assertion. The
        // effective value is asserted here.
        const SYS = ADMIN.slice(ADMIN.indexOf('THE BUTTON SYSTEM (UI Wave 5)'));
        const ctlH = /--ctl-h:\s*([\d.]+)px/.exec(SYS);
        assert.ok(ctlH, 'the system declares no --ctl-h');
        assert.ok(Number(ctlH[1]) >= 44, '--ctl-h is ' + ctlH[1]
            + 'px, and it is what sizes this control');
        const rl = SYS.slice(SYS.indexOf('.resume-link {'));
        assert.match(rl.slice(0, rl.indexOf('}')), /min-height:\s*var\(--ctl-h\)/,
            '.resume-link is outside the system again');
    });
});

describe('THE LOCKUP LEADS THE SCREEN', () => {

    test('the header is the ball icon and an HTML word, on the near-black field', () => {
        assert.ok(cssNum('.lobby-lockup', 'width').n >= 280, 'the lockup is not a wide bar');
        assert.match(ADMIN, /\.lobby-lockup \{[^}]*background:\s*#0B0F0C/);
        assert.match(ADMIN, /<img src="hardpan-icon\.svg" alt="" width="72" height="72"><span class="lobby-word">HARDPAN<\/span>/);
        assert.ok(!/hardpan-lockup\.svg/.test(lobby()),
            'the lobby header must not be the outlined lockup');
    });

    test('the word is heavy type with open tracking, not a condensed SVG', () => {
        const at = ADMIN.indexOf('.lobby-word {');
        assert.ok(at > -1, 'no .lobby-word rule');
        const block = ADMIN.slice(at, ADMIN.indexOf('}', at));
        assert.match(block, /font-weight:\s*800/);
        assert.match(block, /letter-spacing:\s*0\.06em/);
        assert.ok(!/letter-spacing:\s*-/.test(block), 'negative tracking condenses the word');
        assert.match(block, /color:\s*#F2EDE4/);
        const tag = /<img src="hardpan-icon\.svg"[^>]*>/.exec(ADMIN);
        assert.ok(tag, 'the ball icon is gone');
        const w = Number(/width="(\d+)"/.exec(tag[0])[1]);
        const h = Number(/height="(\d+)"/.exec(tag[0])[1]);
        assert.equal(w, h, 'the header icon is the square ball, not the wide lockup');
    });

    test('the mark is still tappable for the secret panel', () => {
        assert.match(ADMIN, /class="lobby-lockup" onclick="handleSecretTap\(\)"/);
    });
});
