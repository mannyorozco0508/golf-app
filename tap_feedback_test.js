// ============================================================================
// EVERY TAP SHOWS IT REGISTERED (2026-10-08)
//
// Manny, across three builds in two days: "Finish sign-in does NOTHING", "the
// tap does nothing". Twice the app WAS answering and the answer was off the
// bottom of the screen; once it genuinely did nothing. From the thumb there is
// no difference between those, and that is the whole problem - a button that
// looks dead gets tapped again, and again, and then reported as broken.
//
// So one module answers for every button that does work:
//   tapBusy(btn, 'Sending…')   pressed, disabled, and SAYING what it is doing
//   tapDone(btn, '✓ Email sent — copy the link from Gmail and paste it below')
//   tapFail(btn, 'That link has expired — send yourself a new one')
//
// THE RESULT LINE GOES NEAR THE BUTTON AND IS SCROLLED INTO VIEW, because the
// two "it did nothing" reports were both a sentence rendered 24px below the
// fold. A message nobody can see is not a message.
//
// WHAT THIS FILE HOLDS: the pure shape - what the label becomes, what is
// restored, where the line goes, and that a failure can never leave the button
// stuck in its working state. The screen is measured in
// tools/tap-feedback-check.js.
//
// BASELINE, against pre-wave main d6dbb45 (admin.html sha 1ec62d30df8c28d7 is
// THIS wave's; d6dbb45's is the one measured), all 12 tests: 0 PASS / 12 FAIL.
// Every one is red there because tap-feedback.js does not exist on that tree, so
// that figure proves nothing per assertion - it only proves the file is red.
//
// THE USEFUL BASELINE is the module present with NOTHING WIRED TO IT -
// d6dbb45's admin.html, index.html, email-link-auth.js, sw.js and
// sync-mobile-web.js with this tap-feedback.js dropped in. Measured at all 12
// tests: 9 PASS / 3 FAIL. The nine green there are the module's own shape,
// which the module alone satisfies; the three red are the ones that prove
// anything REACHES it - the Account sheet's buttons, submitPaste's early
// return, and the module travelling in the shell manifests. That split is the
// honest reading of this file: nine tests of a module, three of a wire.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
// A button inside a container, built from the harness's own document - the
// first version of this test called a __mkButton helper that did not exist.
const box = () => {
    const sb = loadJsFile('tap-feedback.js', []);
    // THE HARNESS CANNOT SEE A SCROLL UNLESS IT RECORDS ONE. mini-dom's
    // scrollIntoView is a no-op stub, so every element this test makes gets one
    // that leaves a mark. The app calls the real thing; this only makes the call
    // observable, which is the difference between asserting the behaviour and
    // asserting the mock.
    vm.runInContext(`(function () {
        var make = document.createElement;
        document.createElement = function (tag) {
            var el = make.call(document, tag);
            el.scrollIntoView = function () { el.__scrolled = true; };
            return el;
        };
    })();
    function __mkButton(label) {
        var wrap = document.createElement('div');
        var b = document.createElement('button');
        b.innerHTML = label;
        wrap.appendChild(b);
        return b;
    }
    // TWO BUTTONS, ONE CONTAINER - the account sheet's email card exactly:
    // "Email me a sign-in link" and "Finish sign-in" are siblings.
    function __mkPair(aLabel, bLabel, aId, bId) {
        var wrap = document.createElement('div');
        var a = document.createElement('button');
        a.innerHTML = aLabel; if (aId) a.id = aId;
        var b = document.createElement('button');
        b.innerHTML = bLabel; if (bId) b.id = bId;
        wrap.appendChild(a); wrap.appendChild(b);
        return [a, b];
    }`, sb);
    return sb;
};
// THE NOTE BOUND TO THIS BUTTON, by the module's own key rule - not simply the
// first .tap-note in the box, which is the bug this is here to catch.
const noteFor = (sb, btnExpr) => vm.runInContext(
    '(function(){var b=' + btnExpr + ';var key=b.id||b.getAttribute("data-tap-key");'
    + 'var kids=b.parentNode.children;'
    + 'for(var i=0;i<kids.length;i++){var el=kids[i];'
    + 'if(el&&typeof el.getAttribute==="function"&&/tap-note/.test(String(el.className||""))'
    + '&&String(el.getAttribute("data-tap-for")||"")===String(key))'
    + 'return {textContent:el.textContent,className:String(el.className||"")};}'
    + 'return {textContent:"<no line bound to this button>",className:""};})()', sb);
const noteOf = (sb, btnExpr) => vm.runInContext(
    '(function(){var n=' + btnExpr + '.parentNode.querySelector(".tap-note");'
    + 'return n?{className:n.className,textContent:n.textContent,scrolled:!!n.__scrolled}:null;})()', sb);
const run = (expr, args) => {
    const sb = box();
    Object.keys(args || {}).forEach((k) => { sb[k] = args[k]; });
    return vm.runInContext(expr, sb);
};

describe('1. THE BUTTON SAYS WHAT IT IS DOING', () => {

    test('busy sets a pressed state, disables, and changes the words', () => {
        const sb = box();
        const btn = vm.runInContext('__mkButton(' + JSON.stringify('Email me a sign-in link') + ')', sb);
        sb.B = btn;
        vm.runInContext("tapBusy(B, 'Sending\\u2026')", sb);
        assert.equal(btn.disabled, true, 'a busy button is still tappable');
        assert.match(btn.className, /is-pressed/, 'no pressed state - the tap looks unregistered');
        assert.match(btn.innerHTML, /Sending/, 'the button does not say what it is doing');
    });

    test('and done restores the original words', () => {
        const sb = box();
        const btn = vm.runInContext('__mkButton(' + JSON.stringify('Email me a sign-in link') + ')', sb);
        sb.B = btn;
        vm.runInContext("tapBusy(B, 'Sending\\u2026'); tapDone(B, '\\u2713 Email sent')", sb);
        assert.equal(btn.disabled, false, 'the button is left disabled after it finished');
        assert.doesNotMatch(btn.className, /is-pressed/, 'the pressed state was left on');
        assert.equal(btn.innerHTML, 'Email me a sign-in link', 'the original label did not come back');
    });

    test('a FAILURE also restores it - a stuck button is the defect itself', () => {
        const sb = box();
        const btn = vm.runInContext('__mkButton(' + JSON.stringify('Finish sign-in') + ')', sb);
        sb.B = btn;
        vm.runInContext("tapBusy(B, 'Signing in\\u2026'); tapFail(B, 'That link has expired')", sb);
        assert.equal(btn.disabled, false);
        assert.equal(btn.innerHTML, 'Finish sign-in');
    });

    test('busy twice does not lose the original label', () => {
        // A double tap used to leave "Sending…" as the remembered label, so the
        // button never got its name back.
        const sb = box();
        const btn = vm.runInContext('__mkButton(' + JSON.stringify('Save') + ')', sb);
        sb.B = btn;
        vm.runInContext("tapBusy(B, 'Saving\\u2026'); tapBusy(B, 'Saving\\u2026'); tapDone(B, '\\u2713 Saved')", sb);
        assert.equal(btn.innerHTML, 'Save');
    });
});

describe('2. THE RESULT LINE IS NEAR THE BUTTON AND ON SCREEN', () => {

    test('a line is written next to the button', () => {
        const sb = box();
        const btn = vm.runInContext('__mkButton(' + JSON.stringify('Link Apple') + ')', sb);
        sb.B = btn;
        vm.runInContext("tapDone(B, '\\u2713 Apple linked')", sb);
        const note = noteOf(sb, 'B');
        assert.ok(note, 'no result line was added beside the button');
        assert.match(note.textContent, /Apple linked/);
    });

    test('and it is scrolled into view', () => {
        const sb = box();
        const btn = vm.runInContext('__mkButton(' + JSON.stringify('Finish sign-in') + ')', sb);
        sb.B = btn;
        vm.runInContext("tapDone(B, '\\u2713 Signed in')", sb);
        const note = noteOf(sb, 'B');
        assert.equal(note.scrolled, true,
            'the result line was not scrolled into view - this is how "it did nothing" happened twice');
    });

    test('one line per button, not a pile of them', () => {
        const sb = box();
        const btn = vm.runInContext('__mkButton(' + JSON.stringify('Save') + ')', sb);
        sb.B = btn;
        vm.runInContext("tapDone(B, 'one'); tapDone(B, 'two'); tapFail(B, 'three')", sb);
        const count = vm.runInContext('B.parentNode.querySelectorAll(".tap-note").length', sb);
        assert.equal(count, 1, 'each tap added another line: ' + count);
        assert.match(noteOf(sb, 'B').textContent, /three/, 'the line does not show the latest answer');
    });

    // ------------------------------------------------------------------------
    // CAUGHT BY tools/tap-feedback-check.js IN CHROME, not by this file: the
    // first version looked the note up on the button's PARENT, so the account
    // sheet's two email buttons shared one line. Tapping Finish sign-in
    // overwrote the send's "copy the link from Gmail" instruction and drew its
    // own refusal up beside the other button - the off-screen answer again, by
    // a different route.
    //
    // The test above does NOT cover this and passed throughout: it taps one
    // button repeatedly, where one shared line is the correct answer.
    // ------------------------------------------------------------------------
    test('TWO BUTTONS IN ONE CONTAINER GET TWO ANSWERS', () => {
        const sb = box();
        const pair = vm.runInContext(
            '__mkPair("Email me a sign-in link","Finish sign-in","email-link-send","email-link-finish")', sb);
        sb.SEND = pair[0]; sb.FIN = pair[1];
        vm.runInContext("tapDone(SEND, 'Email sent - paste the link below');"
            + "tapFail(FIN, 'That is not a sign-in link')", sb);
        const count = vm.runInContext('SEND.parentNode.querySelectorAll(".tap-note").length', sb);
        assert.equal(count, 2, 'the two buttons share one answer line (' + count + ' line(s) for two buttons)');
        const sendNote = noteFor(sb, 'SEND');
        const finNote = noteFor(sb, 'FIN');
        assert.match(sendNote.textContent, /Email sent/,
            'the send button’s instruction was overwritten by the other button: ' + sendNote.textContent);
        assert.match(finNote.textContent, /not a sign-in link/,
            'Finish sign-in’s refusal is not on its own line: ' + finNote.textContent);
        // AND THE KIND TRAVELS WITH THE RIGHT ONE: a success next to a refusal
        // must not make either read as the other.
        assert.match(sendNote.className, /tap-note-ok/, 'the success is not marked: ' + sendNote.className);
        assert.match(finNote.className, /tap-note-fail/, 'the refusal is not marked: ' + finNote.className);
    });

    test('a failure line is marked as one, so it is not read as success', () => {
        const sb = box();
        const btn = vm.runInContext('__mkButton(' + JSON.stringify('Finish sign-in') + ')', sb);
        sb.B = btn;
        vm.runInContext("tapFail(B, 'That link has expired')", sb);
        const note = noteOf(sb, 'B');
        assert.match(note.className, /tap-note-fail/, 'a failure looks the same as a success');
    });
});

describe('3. IT IS ACTUALLY USED, STARTING WITH THE ACCOUNT SHEET', () => {

    test('the Account sheet buttons go through it', () => {
        const a = read('admin.html');
        assert.match(a, /src="tap-feedback\.js"/, 'admin.html does not load the module');
        ['oauthTap', 'oauthLinkTap'].forEach((fn) => {
            const at = a.indexOf('function ' + fn);
            assert.notEqual(at, -1, fn + ' is gone');
            const body = a.slice(at, a.indexOf('\n    function ', at + 10));
            assert.match(body, /tapBusy\(/, fn + ' does not show the tap registering');
            assert.match(body, /tapDone\(|tapFail\(/, fn + ' does not say what happened');
        });
    });

    // ------------------------------------------------------------------------
    // THE PATH THAT LEAVES EARLY, which is the one that burned.
    //
    // submitPaste has two exits that never reach the .then(): an unparseable
    // paste, and the catch. Both spoke only through setStatus - the status line
    // Manny could not see - so the BUTTON itself did nothing on the single most
    // likely mistake a golfer makes, pasting the wrong thing.
    //
    // CAUGHT IN CHROME by tools/tap-feedback-check.js, and only once that check
    // read the note BOUND to Finish sign-in instead of the first one in the
    // box: while it read the shared line it reported the send button's answer
    // as Finish's and called the path healthy.
    //
    // This calls submitPaste rather than tapping, because mini-dom cannot tap;
    // the real journey - type, tap, read - is in the Chrome check.
    // ------------------------------------------------------------------------
    test('AN UNPARSEABLE PASTE MAKES THE BUTTON SPEAK, not just the status line', () => {
        const sb = loadJsFile('email-link-auth.js', ['tap-feedback.js']);
        const got = JSON.parse(vm.runInContext(`(function () {
            var wrap = document.createElement('div');
            document.body.appendChild(wrap);
            var inp = document.createElement('input');
            inp.id = 'email-link-paste';
            inp.value = 'hello this is not a sign-in link at all';
            var b = document.createElement('button');
            b.id = 'email-link-finish';
            b.innerHTML = 'Finish sign-in';
            wrap.appendChild(inp); wrap.appendChild(b);
            emailLinkAuth.submitPaste();
            var note = null, kids = wrap.children;
            for (var i = 0; i < kids.length; i++) {
                if (/tap-note/.test(String(kids[i].className || ''))
                    && kids[i].getAttribute('data-tap-for') === 'email-link-finish') note = kids[i];
            }
            return JSON.stringify({
                note: note ? String(note.textContent || '') : null,
                kind: note ? String(note.className || '') : null,
                label: String(b.innerHTML || ''),
                disabled: !!b.disabled
            });
        })()`, sb));
        assert.ok(got.note,
            'pasting rubbish left Finish sign-in silent - exactly the "it does nothing" report');
        assert.match(got.note, /Paste the whole link|just the code/i,
            'the line does not say what to paste instead: ' + got.note);
        assert.match(got.kind || '', /tap-note-fail/, 'the refusal is not marked: ' + got.kind);
        assert.equal(got.disabled, false, 'the button is left disabled on a refusal it never started work for');
        assert.equal(got.label, 'Finish sign-in', 'the button lost its name: ' + got.label);
    });

    test('and the module travels with the app', () => {
        assert.match(read('sw.js'), /'\.\/tap-feedback\.js'/, 'not in the offline shell');
        assert.match(read('sync-mobile-web.js'), /'tap-feedback\.js'/, 'not in the native bundle');
    });
});
