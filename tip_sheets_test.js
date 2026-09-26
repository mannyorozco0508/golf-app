// ============================================================================
// CONTEXT TIPS — THE "?" SHEETS (UI Wave 10)
//
// Three surfaces where a host most often asks "what is this?": the Players sheet,
// the wizard's money step, and Results. Each gets a "?" that opens a short sheet
// and never blocks anything.
//
// WHY A SEVENTH FUNCTION. ui-dialogs.js had no informational variant - uiConfirm
// was the only thing that drew a dismissable card, and it draws two buttons and a
// promise nobody needs for a tip. dialog_sweep_test.js pins the SIX by name, so a
// seventh is allowed; it must be declared once, in ui-dialogs.js only, because the
// same suite forbids a page hand-rolling .ui-sheet / .ui-note / .ui-toast.
//
// BULLETS COME FREE. .ui-sheet-body already sets white-space: pre-line
// (ui-dialogs.js:107), so a "\n"-joined list renders as separate lines with no new
// CSS. That is measured against the rule, not assumed: the test below reads the
// declaration out of the file.
//
// A LITERAL "?" AND NOT AN EMOJI, and that is a rule rather than a taste. 📖 owns
// "the guide" on both routes to instructions.html, and
// rattle_icon_system_test.js's standing rule is one concept, one icon. A text "?"
// allocates no glyph, so it cannot collide with a later one.
//
// 44px, because Wave 8b spent a whole wave raising this app's tap targets and the
// nearest reusable shape - .ps-add, inside the Players sheet already - is 32.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const DIALOGS = read('ui-dialogs.js');
const strip = s => s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/^[ \t]*\/\/[^\n]*$/gm, ' ');

const SURFACES = [
    { file: 'index.html', id: 'tip-players', where: 'the Players sheet header' },
    { file: 'admin.html', id: 'tip-money', where: "the wizard's Games & Money step" },
    { file: 'settlement.html', id: 'tip-results', where: 'the Pay out card' },
];

describe('1. uiTip IS PART OF THE SHARED COMPONENT, NOT A FORK', () => {

    test('it is declared once, in ui-dialogs.js, and exported', () => {
        assert.match(DIALOGS, /function uiTip\s*\(/, 'ui-dialogs.js has no uiTip');
        assert.equal((DIALOGS.match(/function uiTip\s*\(/g) || []).length, 1,
            'uiTip is declared more than once');
        assert.match(DIALOGS, /uiTip:\s*uiTip/, 'uiTip is not in the exported api');
        // And NO PAGE declares its own. dialog_sweep_test.js makes the same demand of
        // the other six; a seventh that a page could shadow would be a fork.
        ['index.html', 'admin.html', 'settlement.html', 'sidematches.html', 'skins.html',
         'trip.html', 'season.html', 'leaderboard.html', 'game.html'].forEach(f => {
            assert.ok(!/function uiTip\s*\(/.test(read(f)), f + ' declares its own uiTip');
        });
    });

    test('it reuses the sheet the component already has', () => {
        const fn = DIALOGS.slice(DIALOGS.indexOf('function uiTip'),
                                 DIALOGS.indexOf('\n    function ', DIALOGS.indexOf('function uiTip') + 20));
        assert.ok(fn.length > 200, 'uiTip could not be sliced: ' + fn.length);
        assert.match(fn, /sheet\(\)/, 'uiTip does not use the shared sheet()');
        assert.match(fn, /ui-sheet-card/, 'uiTip does not draw the shared card');
        assert.match(fn, /ensureStyle\(\)/, 'uiTip does not ensure the shared style');
        // ONE BUTTON. It is a tip, not a decision - a Cancel on an explanation asks
        // the reader to decline information.
        assert.ok(!/ui-btn-danger/.test(fn), 'a tip must not draw a destructive button');
        assert.ok(!/ui-sheet-no/.test(fn), 'a tip must not draw a Cancel');
    });

    test('bullets work because the body is already pre-line', () => {
        // The mechanism this depends on, asserted rather than assumed: if the rule
        // ever loses pre-line, every tip collapses to one run-on paragraph and this
        // is the line that says so.
        assert.match(DIALOGS, /\.ui-sheet-body\s*\{[^}]*white-space:\s*pre-line/,
            '.ui-sheet-body is no longer pre-line, so "\\n" bullets would collapse');
    });

    test('it renders the bullets it is given, and closes', () => {
        const sb = loadHtmlInlineScript('index.html', ['ui-dialogs.js'], { search: '?game=TIP1' });
        sb.uiTip({ title: 'Players', bullets: ['One row per golfer', 'Out keeps their scores'] });
        const sheet = sb.document.getElementById('ui-sheet');
        const html = String(sheet.innerHTML || '');
        assert.match(html, /ui-sheet-card/, 'no card was drawn');
        assert.match(html, /Players/, 'the title is missing');
        assert.match(html, /One row per golfer/, 'the first bullet is missing');
        assert.match(html, /Out keeps their scores/, 'the second bullet is missing');
        assert.match(html, /•/, 'the bullets are not marked as a list');
        // POSITIVE then negative: it drew something, and it can be dismissed.
        assert.match(html, /ui-sheet-ok/, 'there is nothing to dismiss it with');
        sb.uiCloseSheet();
        assert.equal(String(sb.document.getElementById('ui-sheet').innerHTML || ''), '',
            'the sheet did not close');
    });
});

describe('2. THE THREE "?" CONTROLS EXIST, AND DO NOT DISTURB WHAT IS THERE', () => {

    SURFACES.forEach(s => {
        test(`${s.file}: a "?" on ${s.where}`, () => {
            const src = strip(read(s.file));
            assert.match(src, new RegExp('id="' + s.id + '"'), 'no "?" control');
            const at = src.indexOf('id="' + s.id + '"');
            const tag = src.slice(src.lastIndexOf('<', at), src.indexOf('>', at) + 1);
            assert.match(tag, /^<button/, 'the "?" is not a button: ' + tag);
            assert.match(tag, /aria-label="/, 'the "?" has no accessible name: ' + tag);
            assert.match(tag, /class="[^"]*\btip-btn\b/, 'the "?" does not use the shared class');
            // A LITERAL "?", not an emoji. No glyph is allocated, so it cannot collide
            // with the one-concept-one-icon rule later.
            const label = src.slice(src.indexOf('>', at) + 1, src.indexOf('</button>', at));
            assert.equal(label.trim(), '?', 'the label is not a plain "?": ' + JSON.stringify(label));
            // It calls into the shared component, and the page loads it.
            assert.match(src, /uiTip\(/, s.file + ' never calls uiTip');
            assert.match(read(s.file), /<script src="ui-dialogs\.js"><\/script>/,
                s.file + ' calls uiTip without loading ui-dialogs.js');
        });
    });

    test('the Players "?" is NOT a .group-setup-btn', () => {
        // organizer_link_share_test.js:482 asserts deepEqual over EVERY
        // .group-setup-btn == ['✏️ Edit round setup', '👥 Players'], and
        // players_sheet_test.js taps '.group-setup-btn' at nth: 1. A third pill with
        // that class fails the first and silently redirects the second to the wrong
        // control - a test that still passes while pressing something else.
        const src = read('index.html');
        const at = src.indexOf('id="tip-players"');
        assert.ok(at > -1, 'the Players "?" is gone');
        const tag = src.slice(src.lastIndexOf('<', at), src.indexOf('>', at) + 1);
        assert.ok(!/group-setup-btn/.test(tag),
            'the Players "?" carries .group-setup-btn: ' + tag);
        // COUNTED IN CLASS ATTRIBUTES ONLY. My first version compared this against
        // every occurrence of the string, which includes the CSS rule
        // `a.group-setup-btn { ... }` - so it counted a selector as a button and
        // failed on a correct page. The pills are what matter: exactly the two
        // organizer doors, and no third.
        const pills = src.match(/class="[^"]*\bgroup-setup-btn\b[^"]*"/g) || [];
        assert.equal(pills.length, 2,
            'expected exactly the two organizer doors, found ' + pills.length + ': '
            + JSON.stringify(pills));
    });

    test('the money "?" did not break the step-6 title the icon system pins', () => {
        // rattle_icon_system_test.js:157 regex-pins the whole title: the glyph, the
        // label, then <span class="wiz-step-n" id="wiz-n-action">Step 6</span>.
        // Appending after the span is allowed; inserting between any of them is not.
        const src = read('admin.html');
        assert.match(src, /wizard-step-title">💰 Games &amp; Money · <span class="wiz-step-n" id="wiz-n-action">Step 6<\/span>/,
            'the step 6 title no longer matches the pinned shape');
        // And there are still exactly seven wizard step marks.
        const marks = [...src.matchAll(/wizard-step-title">(\S+?) /gu)].map(m => m[1]);
        assert.equal(marks.length, 7, 'the wizard gained or lost a step title');
        assert.equal(new Set(marks).size, 7, 'two wizard steps share a mark');
    });

    test('the Results "?" is in the Pay out card, not the pinned title row', () => {
        const src = read('settlement.html');
        // receipt_send_button_test.js byte-pins #title-row to exactly the heading plus
        // #receipt-actions, and asserts zero buttons in four other mounts. #results-top,
        // which holds the Pay out card, is the one slot not in that list.
        const row = /<div class="title-row" id="title-row">\s*<h2 class="event-title" id="main-title">[^<]*<\/h2>\s*<div id="receipt-actions" class="receipt-actions"><\/div>\s*<\/div>/;
        assert.match(src, row, 'the title row no longer matches its pinned shape');
        const at = src.indexOf('id="tip-results"');
        assert.ok(at > -1, 'the Results "?" is gone');
        // It lives in the Pay out card head, which is built into #results-top.
        const head = src.indexOf('settle-header po-head');
        assert.ok(head > -1 && Math.abs(at - head) < 400,
            'the Results "?" is not in the Pay out card head');
    });
});
