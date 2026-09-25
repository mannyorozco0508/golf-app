// ============================================================================
// SETUP CLEANUP — OPTION A: THE ACCOUNT LINK
//
// The Game Day setup screen used to open on a tall "Keep this organizer" card:
// a heading, a paragraph about anonymous auth and the founder pass, an email
// field, a send button, a paste field and a finish button — all of it above
// Resume, the game code and the previous round. It owned the screen, and the
// three things a golfer actually came for sat under it.
//
// Option A moves that flow behind a small top-right "Account" link. This file
// is the guard for the move, and for the one thing that must NOT have moved:
//
//   THE AUTH IS UNTOUCHED. email-link-auth.js is pinned by sha. The whole point
//   of Option A is that it is a PRESENTATION change - the flow, the ids it binds
//   and v214's held-note behaviour are all exactly as they were.
//
// AND THE PANEL IS STATIC MARKUP, MERELY HIDDEN. That is not an implementation
// detail, it is the thing v214 fixed: email-link-auth.js holds a confirmation
// note and flushes it into #email-link-status on DOMContentLoaded and on load,
// because on a cold arrival the note is set before the element exists. Building
// the panel when Account is tapped would put those two events before the element
// again and lose the note a second time. Asserted below, both ways.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha = (f) => crypto.createHash('sha256').update(read(f)).digest('hex');
const admin = () => read('admin.html');

// THE LOBBY SCREEN ONLY, and scoped properly.
//
// The first version of this sliced the Account panel out and returned everything
// else in the file, which is not "the lobby" at all - it carried the whole wizard
// and every other modal. It failed on a <details> element hundreds of lines below
// the screen under test. A slice has to be the thing it is named after.
//
// #lobby-screen is one of several top-level .container screens; it ends where the
// next one begins. Within it, the Account panel is cut out, because the question
// these tests ask is what the home screen shows BEFORE a tap.
function lobbyOnly() {
    const s = admin();
    const open = s.indexOf('<div class="container" id="lobby-screen">');
    assert.ok(open > -1, 'the lobby screen must exist');
    const next = s.indexOf('<div class="container" id="admin-screen"', open);
    assert.ok(next > open, 'the lobby must be followed by the wizard screen');
    const screen = s.slice(open, next);
    // POSITIVE: the slice is the real screen, not an empty string that would
    // satisfy every "must not contain" below forever.
    assert.ok(screen.length > 2000, 'the lobby slice collapsed to ' + screen.length + ' chars');
    assert.ok(screen.indexOf('id="hw-quick"') > -1, 'the slice must contain the Game Day tile');
    const start = screen.indexOf('<div class="modal-overlay" id="account-modal">');
    assert.ok(start > -1, 'the Account panel must be inside the lobby screen');
    const end = screen.indexOf('<!-- RESUME GAME BOX -->', start);
    assert.ok(end > start, 'the panel must sit above the Resume box');
    return screen.slice(0, start) + screen.slice(end);
}

describe('Option A: the setup home does not open on the organizer card', () => {

    test('THE AUTH IS BYTE-IDENTICAL — this wave moved UI and nothing else', () => {
        // The sha of email-link-auth.js at the commit this work started from.
        // If it moves, Option A stopped being a presentation change and the
        // held-note flush, the uid preservation and the link/adopt split all need
        // re-proving rather than re-pinning.
        assert.equal(sha('email-link-auth.js'), 'ed3eed24c3a4410ad1a5915eb5e61cebb9f8782aa0d5f0c8023bafc678f6c044',
            'email-link-auth.js changed. Option A is a PRESENTATION change - moving the '
            + 'card behind Account must not touch the auth. If this was deliberate, the '
            + 'held-note flush (v214), the uid-preserving link path and the second-device '
            + 'adopt path all need re-proving, not re-pinning.');
    });

    test('the tall card is NOT in the lobby markup any more', () => {
        const lobby = lobbyOnly();
        assert.ok(!/id="email-link-card"/.test(lobby),
            'the Keep this organizer card is back on the setup home');
        assert.ok(!/Keep this organizer/.test(lobby),
            'the card heading is back on the setup home');
        assert.ok(!/id="email-link-send"/.test(lobby),
            'the send button is back on the setup home');
    });

    test('and it IS in the Account panel, with every id the auth binds', () => {
        // POSITIVE ASSERTION. Every check above is "not there", and "not there" is
        // trivially true of a card that was deleted rather than moved. The flow has
        // to be somewhere, and this is where.
        const s = admin();
        const start = s.indexOf('<div class="modal-overlay" id="account-modal">');
        const end = s.indexOf('<!-- RESUME GAME BOX -->', start);
        const panel = s.slice(start, end);
        assert.ok(panel.length > 500, 'the panel slice collapsed');
        assert.match(panel, /id="email-link-card"/);
        assert.match(panel, /id="email-link-title">Keep this organizer</);
        ['email-link-form', 'email-link-input', 'email-link-send',
         'email-link-paste', 'email-link-finish', 'email-link-status'].forEach(id =>
            assert.ok(panel.indexOf('id="' + id + '"') > -1, 'the panel lost #' + id));
        // The two handlers are the auth's own entry points, unchanged.
        assert.match(panel, /onsubmit="return emailLinkAuth\.submitSend\(event\)"/);
        assert.match(panel, /onclick="emailLinkAuth\.submitPaste\(\)"/);
    });

    test('THE PANEL IS STATIC, NOT BUILT ON TAP — v214 depends on it', () => {
        // #email-link-status must be in the document from parse, or the held-note
        // flush on DOMContentLoaded/load has nowhere to write. Read off the page's
        // own markup, not from a render.
        const s = admin();
        assert.match(s, /<p id="email-link-status" role="status"><\/p>/,
            'the status element must be static markup');
        // And openAccountPanel must not be creating it.
        const open = s.slice(s.indexOf('function openAccountPanel'), s.indexOf('function closeAccountPanel'));
        assert.ok(!/innerHTML|createElement|insertAdjacentHTML/.test(open),
            'openAccountPanel builds markup; the panel must already be in the page');
        assert.match(open, /classList\.add\('open'\)/, 'it should only reveal the panel');
    });

    test('the Account link is on the screen, top-right, and opens the panel', () => {
        const lobby = lobbyOnly();
        assert.match(lobby, /id="account-link"[^>]*onclick="openAccountPanel\(\)"/,
            'the Account link must be on the home screen and wired to the panel');
        assert.match(lobby, /class="lobby-account-row"/);
        assert.match(admin(), /\.lobby-account-row \{[^}]*justify-content: flex-end/,
            'the row is right-aligned, as the mock has it');
    });

    test('THE THREE THINGS THE SCREEN IS FOR ARE STILL ON IT', () => {
        // Resume, the game code, and the previous round. The point of the cleanup
        // was that these sat under the card; deleting any of them would "clean up"
        // the screen and lose it.
        const lobby = lobbyOnly();
        assert.match(lobby, /id="resume-container"/, 'Resume');
        assert.match(lobby, /onclick="resumeGame\(\)"/, 'Resume is still wired');
        assert.match(lobby, /GAME CODE/, 'the game code field');
        assert.match(lobby, /PREVIOUS ROUND/, 'the previous round field');
        assert.match(lobby, /Start from it/, 'Start from it');
    });

    test('NO Create Game hero was invented, and no accordion or banner', () => {
        // The three rejected alternatives, held out by name. This screen never had
        // a Create Game hero and the brief says not to invent one: the two tiles
        // (Road Trip, Game Day) are how a round starts here and they are unchanged.
        // COMMENTS STRIPPED FIRST. The first version of this matched "start a round"
        // inside a comment explaining the Nassau selector - prose, not a hero - and
        // failed on a correct page. What is forbidden is a new CONTROL, so the check
        // reads markup only.
        const lobby = lobbyOnly().replace(/<!--[\s\S]*?-->/g, '');
        assert.ok(!/>\s*(?:Create|New)\s+Game\s*</i.test(lobby),
            'a Create Game hero was invented; the brief rejected it');
        assert.match(lobby, /id="hw-trip"/, 'the Road Trip tile must still be the way in');
        assert.match(lobby, /id="hw-quick"/, 'and the Game Day tile');
        assert.ok(!/<details/.test(lobby), 'an accordion was added to the lobby');
        assert.ok(!/one-time|dismiss-once|banner-once/i.test(lobby), 'a one-time banner was added');
    });
});

describe('Option A: the panel behaves, in a realm built from the page', () => {
    function page() {
        const sb = loadHtmlInlineScript('admin.html');
        return sb;
    }
    const run = (sb, expr) => vm.runInContext(expr, sb);

    test('the panel starts closed and Account opens it', () => {
        const sb = page();
        // The overlay is hidden by .modal-overlay until it carries .open - the same
        // mechanism every other modal on this page uses.
        assert.match(read('admin.html'), /\.modal-overlay \{ display:none;/);
        assert.match(read('admin.html'), /\.modal-overlay\.open \{ display:flex; \}/);
        run(sb, 'openAccountPanel();');
        assert.ok(run(sb, "document.getElementById('account-modal').classList.contains('open')"),
            'Account did not open the panel');
        run(sb, 'closeAccountPanel();');
        assert.ok(!run(sb, "document.getElementById('account-modal').classList.contains('open')"),
            'Close did not close it');
    });

    test('the QUIET STATE: a linked organizer sees "Organizer saved", not an invitation', () => {
        const sb = page();
        // Not linked: the plain label.
        run(sb, "window.firebase = { auth: function () { return { currentUser: { isAnonymous: true, uid: 'anon-1' } }; } }; refreshAccountState();");
        assert.equal(run(sb, "document.getElementById('account-link').textContent"), 'Account');
        assert.equal(run(sb, "document.getElementById('account-link').getAttribute('data-linked')"), '0');
        // Linked - which is exactly what linkWithCredential leaves behind.
        run(sb, "window.firebase = { auth: function () { return { currentUser: { isAnonymous: false, email: 'marty@example.com', uid: 'anon-1' } }; } }; refreshAccountState();");
        assert.equal(run(sb, "document.getElementById('account-link').textContent"), 'Organizer saved');
        assert.equal(run(sb, "document.getElementById('account-modal').getAttribute('data-linked')"), '1');
        assert.match(read('admin.html'), /#account-modal\[data-linked="1"\] #account-linked-note \{ display: block; \}/,
            'the confirmation line must be what data-linked reveals');
    });

    test('the link repaints on a finish — the watcher is registered, both post-auth paths', () => {
        // WHAT THIS CAN AND CANNOT PROVE. mini-dom has no MutationObserver, so the
        // BEHAVIOUR is proved in Chrome (email_link_auth_test.js: paste and Finish
        // inside the panel repaints the link, with no reopen and no reload). This
        // is the cheap structural half: that the watcher exists, watches the right
        // element, calls refreshAccountState, and is actually REGISTERED - a
        // watcher defined and never called is the shape this bug had in the first
        // place, and it would pass every behaviour-free check.
        const s = admin();
        const fn = s.slice(s.indexOf('function watchAccountStatus'), s.indexOf('function refreshAccountState'));
        assert.ok(fn.length > 100, 'watchAccountStatus is missing');
        assert.match(fn, /getElementById\('account-modal'\)/,
            'it watches the PANEL, not the auth note element - email_link_note_test.js '
            + 'holds that this page never reaches for #email-link-status');
        assert.ok(!/getElementById\(.email-link-status.\)/.test(fn),
            'the page must not touch the auth-owned element');
        assert.match(fn, /new MutationObserver\(\(\) => \{ refreshAccountState\(\); \}\)/);
        assert.match(fn, /typeof MutationObserver !== 'function'/,
            'feature-detected, so a realm without it does not throw');
        // NO MODULE-LEVEL let/const FLAG. This is called from the arrival block
        // thousands of lines above where it is defined; a `let` there is in its
        // temporal dead zone at that point and throws on every Home arrival.
        assert.ok(!/let accountWatching|const accountWatching/.test(s),
            'the once-only flag must not be a module-level let/const - it TDZ-throws');
        assert.match(fn, /data-account-watched/, 'the flag belongs on the element');
        // Registered, not merely defined.
        const calls = (s.match(/watchAccountStatus\(\);/g) || []).length;
        assert.ok(calls >= 3,
            'watchAccountStatus is defined but registered only ' + (calls - 0) + ' time(s); '
            + 'it must run on arrival and on both arms of the standing read');
    });

    test('accountIsLinked never throws on a page where auth has not landed', () => {
        const sb = page();
        run(sb, 'delete window.firebase;');
        assert.equal(run(sb, 'accountIsLinked()'), false);
        run(sb, "window.firebase = { auth: function () { throw new Error('not ready'); } };");
        assert.equal(run(sb, 'accountIsLinked()'), false, 'a throwing auth must read as not linked');
    });
});
