// ============================================================================
// P1-b, THE HALF THAT RUNS WITHOUT CHROME: tournament.html's Apple / Google
// sign-in is admin.html's card and admin.html's module, and the account-exists
// link goes ONLY to the account with the same email.
//
// tournament_oauth_signin_chrome_test.js is the real proof - real Chrome, the
// real SDK, the Auth and Database emulators, cold arrival and real taps. It is
// skipped where Chrome, the firebase CLI or Java is missing, so this file holds
// the wiring a plain `node --test` can always check:
//
//   A. the same module, loaded before the inline script, and authDomain from
//      its authDomainFor - one builder, never a copy;
//   B. the same three labels, in the same order, as admin.html's live card
//      (decoded first - CLAUDE.md, a source assertion about user-facing text);
//   C. a SIGNED-OUT arrival (sb.__auth.setUser(null), the page's own
//      listener) renders them, and the button's own onclick goes to
//      oauthSignin.signIn with { redirect: true };
//   D. account-exists: the sentence, and the pending credential is linked
//      after a password sign-in to the SAME email and never to another one.
//
// WHAT MINI-DOM CANNOT PROVE: innerHTML is a string here, so "tapping" a
// button is running the onclick text the rendered markup carries - the same
// expression a browser runs, read from the rendered output, not a function
// named by the test. Layout, visibility and the real SDK are the Chrome
// file's.
//
// BASELINE (final run of this file, 2026-11-10):
//   on p1-signin (tournament.html sha256 cedb8327...), all 7 tests: 7 PASS / 0 FAIL
//   against p1-base 48121bea (tournament.html sha256 5f6c2a64...), all 7 tests: 0 PASS / 7 FAIL
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { decodeEscapes } = require('./helpers/decode-escapes.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const PAGE = 'tournament.html';
const PANEL = 'signin-panel-setup';
const htmlText = (h) => decodeEscapes(String(h)).replace(/&#63743;/g, '').replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '\n')
    .split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);

// Signed out, on the setup screen (where an organizer first lands).
function arriveSignedOut() {
    const sb = loadHtmlInlineScript(PAGE);
    sb.__auth.setUser(null);
    return sb;
}
// The onclick a rendered button carries, run as the browser would.
function tapRendered(sb, idSuffix) {
    const html = sb.document.getElementById(PANEL).innerHTML;
    const m = new RegExp('id="' + PANEL + '-' + idSuffix + '"[^>]*onclick="([^"]+)"').exec(html);
    assert.ok(m, 'no rendered button ' + idSuffix + ' with an onclick: ' + html);
    vm.runInContext(m[1], sb);
}
const tick = () => new Promise((r) => setImmediate(r));

describe('A. one module, one config', () => {
    test('oauth-signin.js is loaded after the auth SDK and before the inline script; authDomain comes from its authDomainFor', () => {
        const src = read(PAGE);
        const auth = src.indexOf('<script src="./firebase-auth-compat.js"></script>');
        const mod = src.indexOf('<script src="oauth-signin.js"></script>');
        const inline = src.indexOf('<script>');
        assert.ok(auth > 0 && mod > auth && inline > mod, `order auth=${auth} module=${mod} inline=${inline}`);
        const cfg = src.slice(src.indexOf('const firebaseConfig = {'), src.indexOf('firebase.initializeApp(firebaseConfig)'));
        assert.match(cfg, /apiKey: "AIzaSyB5sBBd-pdnrdp-nu60lHTMBUUd5Kwjfyk"/, 'the config slice is empty or moved');
        assert.match(cfg, /authDomain: \(window\.oauthSignin && typeof window\.oauthSignin\.authDomainFor === 'function'\)\s*\? window\.oauthSignin\.authDomainFor\(location\.hostname\)/);
        assert.ok(!/signInWithPopup|signInWithRedirect|linkWithPopup|signInWithCredential/.test(src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\/[^\n]*/g, '')),
            'tournament.html calls a provider sign-in itself - that belongs to oauth-signin.js');
    });
});

describe('B/C. the same card as admin.html, rendered on a signed-out arrival', () => {
    test('the three labels, in admin.html\'s order and wording', () => {
        const admin = read('admin.html');
        const card = admin.slice(admin.indexOf('<section id="oauth-card"'), admin.indexOf('</section>', admin.indexOf('<section id="oauth-card"')));
        const label = (id) => { const m = new RegExp('id="' + id + '"[^>]*>([^<]+)<').exec(card); assert.ok(m, 'admin.html has no ' + id); return htmlText(m[1])[0]; };
        const want = [label('oauth-apple'), label('oauth-google'), label('oauth-email-toggle')];
        assert.deepEqual(want, [' Continue with Apple', 'Continue with Google', 'Use email instead'], 'admin.html\'s card changed - re-read it');
        const sb = arriveSignedOut();
        const p = sb.document.getElementById(PANEL);
        assert.equal(p.style.display, 'block');
        const lines = htmlText(p.innerHTML);
        const at = want.map((w) => lines.indexOf(w));
        assert.ok(at.every((i) => i >= 0), 'missing a label: ' + JSON.stringify(lines));
        assert.ok(at[0] < at[1] && at[1] < at[2], 'order: ' + JSON.stringify(lines));
        assert.ok(lines.indexOf('Sign in') > at[2], 'the email + password row follows the email option: ' + JSON.stringify(lines));
    });

    test('the email row starts closed; Use email instead opens it and says Hide the email option', () => {
        const sb = arriveSignedOut();
        assert.match(sb.document.getElementById(PANEL).innerHTML, new RegExp('id="' + PANEL + '-email-row" style="display:none;'));
        tapRendered(sb, 'email-toggle');
        const html = sb.document.getElementById(PANEL).innerHTML;
        assert.match(html, new RegExp('id="' + PANEL + '-email-row" style="display:grid;'));
        assert.match(html, /Hide the email option/);
    });

    test('Continue with Google goes to oauthSignin.signIn(\'google\', { redirect: true }), the module admin.html uses', async () => {
        const sb = arriveSignedOut();
        assert.equal(typeof sb.window.oauthSignin.signIn, 'function', 'the page realm did not load oauth-signin.js');
        const calls = [];
        sb.window.oauthSignin.signIn = (which, opts) => { calls.push([which, opts]); return new Promise(() => {}); };
        tapRendered(sb, 'google');
        assert.equal(JSON.stringify(calls), JSON.stringify([['google', { redirect: true }]]));
        assert.match(sb.document.getElementById(PANEL).innerHTML, /⏳ Opening…/, 'the tap is not visible');
    });
});

describe('D. account exists: the sentence, and the link goes only to the same email', () => {
    function existsArrival() {
        const sb = arriveSignedOut();
        const cred = { providerId: 'google.com', marker: 'pending' };
        sb.window.oauthSignin.signIn = () => Promise.reject(Object.assign(new Error('exists'), { code: 'auth/account-exists-with-different-credential', email: 'Org@Example.com', credential: cred }));
        return { sb, cred };
    }
    test('the sentence names the password account, the email row opens, and the module\'s generic sentence is not used', async () => {
        const { sb } = existsArrival();
        tapRendered(sb, 'google');
        await tick(); await tick();
        const status = sb.document.getElementById(PANEL + '-oauth-status').textContent;
        assert.match(status, /^This email already has an organizer account that signs in with a password, and your events are on that account\. Sign in with your email and password below\. Google is then added to that account/);
        assert.ok(!/Could not finish sign-in/.test(status), status);
        assert.match(sb.document.getElementById(PANEL).innerHTML, new RegExp('id="' + PANEL + '-email-row" style="display:grid;'));
        assert.equal(sb.document.getElementById(PANEL + '-email').value, 'org@example.com', 'the address was not filled in');
    });

    for (const [typed, linked] of [['org@example.com', true], ['someone.else@example.com', false]]) {
        test(`a password sign-in as ${typed}: the pending Google credential is ${linked ? 'LINKED to it' : 'NOT linked'}`, async () => {
            const { sb, cred } = existsArrival();
            tapRendered(sb, 'google');
            await tick(); await tick();
            const links = [];
            const user = { uid: 'u-' + typed, email: typed, linkWithCredential: (c) => { links.push(c); return Promise.resolve({ user }); } };
            sb.firebase.auth().signInWithEmailAndPassword = () => Promise.resolve({ user });
            sb.document.getElementById(PANEL + '-email').value = typed;
            sb.document.getElementById(PANEL + '-password').value = 'pw';
            const html = sb.document.getElementById(PANEL).innerHTML;
            const m = /onclick="(signInNow\('signin-panel-setup'\))"/.exec(html);
            assert.ok(m, 'no rendered Sign in button');
            vm.runInContext(m[1], sb);
            await tick(); await tick(); await tick();
            assert.equal(links.length, linked ? 1 : 0, JSON.stringify(links));
            if (linked) assert.equal(links[0], cred, 'linked something other than the credential Firebase put on the error');
        });
    }
});
