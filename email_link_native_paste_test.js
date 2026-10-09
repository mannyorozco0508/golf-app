// ============================================================================
// FINISHING EMAIL SIGN-IN INSIDE THE NATIVE APP (2026-10-08)
//
// MANNY, ON TESTFLIGHT 1.0.7 (11): Account -> "Use email instead" -> tapped the
// link in the email -> it opened the WEB app. The native app stayed anonymous,
// so he was a spectator on rounds his own account owns.
//
// WHAT WAS ALREADY THERE, and this matters because it is most of the fix: the
// email-link card ALREADY has "Paste the link from the email" with a Finish
// sign-in button wired to emailLinkAuth.submitPaste(), and a pasted link
// already completes sign-in in place. Measured before changing anything: a full
// link is accepted, so copying the link out of Mail and pasting it works on
// native today.
//
// WHAT WAS MISSING, measured the same way:
//   1. A BARE CODE was refused. isEmailLink() requires "oobCode=" in the
//      string, so the oobCode on its own - the short thing a human can retype
//      off a screen without copying a 300-character URL on a phone - did not
//      work. Manny asked for exactly that ("or type the code from the email").
//   2. NOTHING TOLD HIM NOT TO TAP THE LINK. Tapping it is the obvious action
//      and it is the one that fails, and no sentence anywhere said so. The card
//      invited him to send an email and then said nothing about what to do with
//      it on this phone.
//
// NO UNIVERSAL LINKS NEEDED, which is the point: the completion happens in the
// app from text the golfer brings in.
//
// BASELINE, RE-MEASURED over the FINISHED file (2026-10-08) against the
// pre-wave email-link-auth.js and admin.html, all 19 tests: 3 PASS / 16 FAIL.
// 3 + 16 = 19.
//
// This header has now been re-measured TWICE for the same reason - it said 7
// tests, then 11, while tests were still being appended underneath it. The rule
// is that the baseline describes the file as it stands, and the arithmetic
// check caught both.
//
// The three that pass against the pre-wave files are all don't-regress pins
// rather than caught defects, and saying so is the point:
//   the paste control is still wired     the field and its Finish button have
//                                        existed since v203
//   a used or expired link has a message these codes were already mapped
//   an unknown failure says something     so was the fallback
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadJsFile } = require('./helpers/load-script.js');
const { decodeEscapes } = require('./helpers/decode-escapes.js');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
// HTML ENTITIES TOO, not just \uXXXX. This copy lives in MARKUP, where the
// right way to write an apostrophe is &rsquo; - and a plain regex sees seven
// ASCII characters where the golfer sees one glyph, which is the same trap
// decode-escapes.js exists for one layer down. The first version of this test
// failed on correct copy for exactly that reason.
const ENTITIES = { rsquo: '\u2019', lsquo: '\u2018', ldquo: '\u201C', rdquo: '\u201D',
                   mdash: '\u2014', ndash: '\u2013', rarr: '\u2192', amp: '&',
                   nbsp: ' ', hellip: '\u2026', quot: '"', apos: "'" };
const decodeCopy = (t) => decodeEscapes(String(t))
    .replace(/&([a-zA-Z]+);/g, (m, name) => (ENTITIES[name] !== undefined ? ENTITIES[name] : m))
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)));
const E = () => loadJsFile('email-link-auth.js', []).emailLinkAuth;
// A REALISTIC oobCode. The first version of this test used an 11-character
// stand-in and failed against a correct implementation, because the floor is
// deliberately 12: a short string must NOT be taken for a sign-in code or a
// typo in the box becomes an attempt. Firebase's real codes are far longer than
// this one.
const CODE = 'AbC123-_xyzQWErty456UIOp789asdFGH012jkl';
const LINK = 'https://golf-app-5a5.pages.dev/admin.html?apiKey=K&mode=signIn&oobCode=' + CODE + '&continueUrl=C';

describe('1. THE CODE ON ITS OWN IS ENOUGH', () => {

    test('a bare oobCode is recognised', () => {
        const e = E();
        assert.equal(e.codeFromPaste(CODE), CODE, 'the bare code was not accepted');
        assert.equal(e.codeFromPaste('  ' + CODE + '  '), CODE, 'surrounding space defeated it');
    });

    test('and a code pulled out of a pasted link is the same code', () => {
        const e = E();
        assert.equal(e.codeFromPaste(LINK), CODE,
            'the code was not extracted from a full link');
        // oobCode=... written anywhere in pasted text, which is what a mail app
        // hands over when somebody copies a line rather than the link.
        assert.equal(e.codeFromPaste('tap here: oobCode=' + CODE + ' thanks'), CODE);
    });

    test('rubbish is still refused, so a typo does not become a sign-in attempt', () => {
        const e = E();
        ['', '   ', 'hello', 'a', 'no code here', '!!!!!!!!!!'].forEach((bad) => {
            assert.equal(e.codeFromPaste(bad), null, JSON.stringify(bad) + ' was accepted as a code');
        });
    });

    test('a code becomes a link the SDK can complete', () => {
        const e = E();
        const url = e.linkForCode(CODE);
        assert.match(url, /oobCode=AbC123-_xyz/, 'the synthesised link lost the code');
        assert.match(url, /mode=signIn/, 'the SDK looks for mode=signIn');
        assert.equal(e.isEmailLink(url), true, 'the synthesised link is not recognised as a sign-in link');
    });

    test('a FULL LINK still works - the path that already worked must not break', () => {
        const e = E();
        assert.equal(e.isEmailLink(LINK), true);
        assert.equal(e.codeFromPaste(LINK), CODE);
    });
});

describe('2. THE APP SAYS WHAT TO DO WITH THE EMAIL', () => {

    test('the card tells the golfer to copy the link, not tap it', () => {
        // DECODED: this copy carries escapes, and a plain regex sees six ASCII
        // characters where the golfer sees a glyph.
        const src = decodeCopy(read('admin.html'));
        const at = src.indexOf('id="email-link-card"');
        assert.notEqual(at, -1, 'the email-link card is gone');
        const card = src.slice(at, src.indexOf('</section>', at));
        assert.match(card, /don\u2019t tap|don't tap|do not tap/i,
            'nothing warns that tapping the link leaves the app: ' + card.slice(0, 200));
        assert.match(card, /copy/i, 'nothing tells the golfer to copy it instead');
        // AND THE FIELD TAKES EITHER. The label must not promise only a link
        // when a code now works, or the code path is invisible.
        assert.match(card, /code/i, 'the paste field does not mention the code');
    });

    test('the paste control is still wired to the one completer', () => {
        const src = read('admin.html');
        assert.match(src, /onclick="emailLinkAuth\.submitPaste\(\)"/,
            'Finish sign-in no longer calls submitPaste');
        assert.match(src, /id="email-link-paste"/, 'the paste field is gone');
    });
});

// ============================================================================
// 3. WHAT A MAIL APP ACTUALLY HANDS OVER (2026-10-08, build 11 bug)
//
// Manny: Finish sign-in did NOTHING with a fresh, unused link copied from Gmail
// with Press and hold -> Copy Link. Measured, and it is two faults at once:
//
//   1. GMAIL DOES NOT GIVE YOU THE LINK. "Copy Link" yields its own redirect -
//      https://www.google.com/url?q=<the real link, PERCENT-ENCODED>&source=gmail
//      - so "oobCode=" appears only as "oobCode%3D" and every check for the
//      real thing failed. He pasted the whole link, correctly, and was told to
//      paste the whole link.
//   2. THE REFUSAL WAS BELOW THE FOLD. Measured in the Account panel at
//      390x844: the status line rendered at top 832, bottom 868 - 24px off the
//      bottom of the screen. The app did say something; there was no way to see
//      it. That is the "nothing happens".
// ============================================================================

describe('3. A WRAPPED LINK IS STILL A LINK', () => {

    const real = 'https://golfapp-9fb21.firebaseapp.com/__/auth/action?apiKey=K&mode=signIn'
        + '&oobCode=' + CODE + '&continueUrl=https%3A%2F%2Fgolf-app-5a5.pages.dev%2Fadmin.html&lang=en';

    test('Gmail’s own redirect wrapper still yields the code', () => {
        const e = E();
        const gmail = 'https://www.google.com/url?q=' + encodeURIComponent(real) + '&source=gmail&ust=1&usg=A';
        assert.equal(e.codeFromPaste(gmail), CODE,
            'the code could not be read out of a Gmail Copy Link');
    });

    test('and so does a doubly-encoded one, and other wrappers', () => {
        const e = E();
        [['double encoding', 'https://www.google.com/url?q=' + encodeURIComponent(encodeURIComponent(real))],
         ['url= wrapper', 'https://click.example.com/x?url=' + encodeURIComponent(real)],
         ['target= wrapper', 'https://t.example.com/r?target=' + encodeURIComponent(real)],
         ['the encoded code alone', 'oobCode%3D' + CODE]].forEach(([label, u]) => {
            assert.equal(e.codeFromPaste(u), CODE, label + ' did not yield the code');
        });
    });

    test('a wrapper with NO code in it is still refused', () => {
        // The failure that must stay a failure: a tracking link that never
        // carried the code cannot be turned into a sign-in.
        const e = E();
        ['https://url8936.example.com/ls/click?upn=abc123def456',
         'https://www.google.com/url?q=' + encodeURIComponent('https://example.com/hello') + '&source=gmail'
        ].forEach((u) => {
            assert.equal(e.codeFromPaste(u), null, u.slice(0, 40) + ' was accepted with no code in it');
        });
    });

    test('the raw link still works, unwrapped', () => {
        const e = E();
        assert.equal(e.codeFromPaste(real), CODE);
        assert.equal(e.isEmailLink(real), true);
    });
});

// ============================================================================
// 4. THE WRAPPER FIREBASE ACTUALLY SENDS, AND WHY THE TAP WAS A NO-OP
//    (build 13 bug, 2026-10-08)
//
// Manny on 1.0.7 (13), iPhone 17 Pro: Finish sign-in did NOTHING - no sign-in
// and no error - with the full emailed link, with the oobCode alone, and with a
// fresh link's code. The email arrives as
//
//   https://golfapp-9fb21.firebaseapp.com/__/auth/links?link=<URL-ENCODED
//       action URL with mode=signIn&oobCode=...&continueUrl=...>
//
// THE DEFECT, AND THE TEST GAP THAT HID IT. For a bare code (and for anything
// that is not already a link) submitPaste synthesises one with linkForCode -
// and that synthesised link carried NO apiKey. Firebase's real
// isSignInWithEmailLink parses an action URL and requires apiKey, so on a
// device it answered false for every one of the three shapes. In this harness
// there is no real SDK, so isEmailLink fell through to its own regex, answered
// TRUE, and every test passed. The harness was more permissive than the
// runtime, which is the only way a bug like this survives a green suite.
//
// SO: the inner action URL is preferred when the paste contains one - it is
// Firebase's own URL, apiKey included - and a synthesised link carries the
// apiKey from the page's own config. Neither depends on the SDK being lenient.
// ============================================================================

describe('4. ALL THREE SHAPES, AND THE APIKEY THE SDK INSISTS ON', () => {

    const action = 'https://golfapp-9fb21.firebaseapp.com/__/auth/action?apiKey=AIzaKEY'
        + '&mode=signIn&oobCode=' + CODE
        + '&continueUrl=https%3A%2F%2Fgolf-app-5a5.pages.dev%2Fadmin.html&lang=en';
    const wrapped = 'https://golfapp-9fb21.firebaseapp.com/__/auth/links?link=' + encodeURIComponent(action);

    test('the WRAPPED /__/auth/links form yields the inner action URL, apiKey and all', () => {
        const e = E();
        const got = e.actionUrlFromPaste(wrapped);
        assert.ok(got, 'the wrapper yielded no action URL');
        assert.match(got, /oobCode=/, 'the action URL lost the code');
        assert.match(got, /apiKey=/, 'the action URL lost the apiKey - the SDK will refuse it');
        assert.match(got, /mode=signIn/);
        // AND IT IS THE INNER URL, not the wrapper: the wrapper is not an
        // action URL and the SDK does not accept it.
        assert.doesNotMatch(got, /__\/auth\/links/, 'it handed back the wrapper rather than the inner URL');
    });

    test('the inner action URL pasted directly is used as it is', () => {
        const e = E();
        assert.equal(e.actionUrlFromPaste(action), action);
    });

    test('a BARE CODE becomes a link that carries an apiKey', () => {
        const e = E();
        const url = e.linkForCode(CODE, 'AIzaFROMPAGE');
        assert.match(url, /oobCode=/ , 'the synthesised link lost the code');
        assert.match(url, /apiKey=AIzaFROMPAGE/,
            'the synthesised link has no apiKey, so Firebase isSignInWithEmailLink answers false');
        assert.match(url, /mode=signIn/);
    });

    test('and it still carries one when no key is passed, from the page config', () => {
        // The page's own firebaseConfig is the source; a hard-coded fallback
        // here would be a second copy of a credential.
        const e = E();
        const url = e.linkForCode(CODE);
        assert.match(url, /apiKey=[A-Za-z0-9_-]{10,}/,
            'with no key argument the link must still find one: ' + url);
    });

    test('rubbish still yields nothing, in either function', () => {
        const e = E();
        ['', 'hello', 'https://example.com/nothing-here'].forEach((bad) => {
            assert.equal(e.actionUrlFromPaste(bad), null, JSON.stringify(bad) + ' produced an action URL');
        });
    });
});

describe('5. A FAILURE IS NEVER A SILENT NO-OP', () => {

    test('submitPaste cannot throw past its own handler', () => {
        // THE NO-OP IS THE BUG. Whatever goes wrong - a missing element, an SDK
        // that is not there, a link the SDK refuses - the golfer must get a
        // sentence. So the whole body is wrapped, and the catch says something.
        const src = fs.readFileSync(path.join(__dirname, 'email-link-auth.js'), 'utf8');
        const at = src.indexOf('function submitPaste');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 10));
        assert.ok(fn.length > 300, 'submitPaste did not slice - this test is guarding nothing');
        assert.match(fn, /try\s*\{/, 'submitPaste has no try - a throw is a silent no-op');
        assert.match(fn, /catch/, 'submitPaste has no catch');
        // AND THE CATCH MUST SPEAK. A catch that swallows is the same no-op.
        const tail = fn.slice(fn.indexOf('catch'));
        assert.match(tail, /setStatus\(/, 'the catch does not put anything on screen');
    });

    test('there is a clear message for a used or expired link', () => {
        const e = E();
        [['auth/invalid-action-code', /expired|already been used|new link/i],
         ['auth/expired-action-code', /expired|new link/i],
         ['auth/invalid-email', /email/i]].forEach(([code, want]) => {
            const msg = e.messageFor({ code: code });
            assert.ok(msg && msg.length > 15, 'no message for ' + code);
            assert.match(msg, want, code + ' says: ' + msg);
        });
    });

    test('and an unknown failure still says something rather than nothing', () => {
        const e = E();
        const msg = e.messageFor({ code: 'auth/something-nobody-has-seen' });
        assert.ok(msg && msg.length > 15, 'an unknown code produced no message: ' + JSON.stringify(msg));
    });
});
