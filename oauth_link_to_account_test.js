// ============================================================================
// LINKING APPLE OR GOOGLE TO THE ACCOUNT YOU ARE ALREADY SIGNED IN AS
// (Build 12, 2026-10-08)
//
// THE DEFECT, AND IT IS WHY MANNY HAS A STRAY ACCOUNT. planOauth read:
//
//     if (!user.isAnonymous) return { action: 'sign-in', reason: 'already-linked' };
//
// "already-linked" was the wrong name for it: a golfer signed in with EMAIL has
// no Apple provider attached, and tapping Continue with Apple therefore ran
// signInWithCredential - which SWITCHES accounts rather than attaching Apple to
// the one he is in. Measured in the project's own auth: his email account
// h8Axnef... has exactly one provider (password), and there are four apple.com
// accounts, three of them privaterelay addresses. The Oct 7 relay account is
// that tap.
//
// SO THE RULE IS ABOUT THE PROVIDER, NOT ABOUT ANONYMITY: if there is a user
// and the provider is not on it, LINK. Sign-in is for nobody signed in, or for
// a provider already attached.
//
// AND A DELIBERATE LINK MUST NOT ADOPT. When the Apple identity is already on a
// DIFFERENT account, linkWithCredential fails with credential-already-in-use -
// and the existing path then signs in as that other account, which is the exact
// move that made the stray account in the first place. On a deliberate "Link
// Apple" tap that is never what was asked for: it must refuse and say so.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadJsFile } = require('./helpers/load-script.js');

const O = () => loadJsFile('oauth-signin.js', []).oauthSignin;
const emailUser = (providers) => ({ uid: 'h8Axnef', isAnonymous: false,
    email: 'manny.orozco0508@gmail.com',
    providerData: (providers || ['password']).map((p) => ({ providerId: p })) });
const anonUser = { uid: 'anon-1', isAnonymous: true, providerData: [] };

describe('1. SIGNED IN WITH EMAIL, TAPPING APPLE, LINKS', () => {

    test('an email account with no Apple linked plans a LINK', () => {
        const o = O();
        const plan = o.planOauth(emailUser(['password']), 'apple');
        assert.equal(plan.action, 'link', 'tapping Apple would switch accounts, not link');
        assert.equal(plan.reason, 'provider-not-linked');
    });

    test('the same for Google', () => {
        const o = O();
        assert.equal(O().planOauth(emailUser(['password']), 'google').action, 'link');
    });

    test('an account that ALREADY has that provider just signs in', () => {
        const o = O();
        const plan = o.planOauth(emailUser(['password', 'apple.com']), 'apple');
        assert.equal(plan.action, 'sign-in');
        assert.equal(plan.reason, 'already-linked');
    });

    test('and an anonymous user still links, exactly as before', () => {
        // The Wave 33 behaviour that must not move: an anonymous organizer's
        // rounds and trial follow the provider onto the same uid.
        const o = O();
        const plan = o.planOauth(anonUser, 'apple');
        assert.equal(plan.action, 'link');
        assert.equal(plan.reason, 'anonymous');
    });

    test('nobody signed in signs in', () => {
        const o = O();
        assert.equal(o.planOauth(null, 'apple').action, 'sign-in');
        assert.equal(o.planOauth(null, 'apple').reason, 'no-user');
    });

    test('CONTROL: called the OLD way, with no provider, nothing changed', () => {
        // Every existing caller passes one argument. This is the assertion that
        // proves none of them changed behaviour.
        const o = O();
        assert.equal(o.planOauth(anonUser).action, 'link');
        assert.equal(o.planOauth(emailUser(['password'])).action, 'sign-in');
        assert.equal(o.planOauth(null).action, 'sign-in');
    });
});

describe('2. A DELIBERATE LINK REFUSES TO ADOPT SOMEBODY ELSE’S ACCOUNT', () => {

    test('there is a distinct message for "that provider is on another account"', () => {
        const o = O();
        const err = { code: 'auth/credential-already-in-use' };
        const msg = o.messageFor(err, { deliberateLink: true });
        assert.ok(msg && msg.length > 20, 'no message for a refused deliberate link');
        assert.match(msg, /already/i, 'the message does not say it is already in use: ' + msg);
        // AND IT MUST NOT PROMISE THE SWITCH THAT WAS NOT ASKED FOR.
        assert.doesNotMatch(msg, /signed you in|switched/i,
            'the refusal implies it switched accounts: ' + msg);
    });

    test('and the ordinary (non-deliberate) path keeps its old message', () => {
        const o = O();
        const err = { code: 'auth/credential-already-in-use' };
        const plain = o.messageFor(err);
        const deliberate = o.messageFor(err, { deliberateLink: true });
        assert.notEqual(plain, deliberate,
            'a deliberate link says the same thing as an adopt, so the difference is invisible');
    });

    test('isAdoptSignal still recognises the error itself', () => {
        // The signal is unchanged; what changed is what a DELIBERATE link does
        // with it.
        const o = O();
        assert.equal(o.isAdoptSignal({ code: 'auth/credential-already-in-use' }), true);
        assert.equal(o.isAdoptSignal({ code: 'auth/popup-closed-by-user' }), false);
    });
});

describe('3. THE ACCOUNT SHEET OFFERS IT', () => {

    test('there are Link buttons, and they say link rather than continue', () => {
        const src = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');
        const at = src.indexOf('id="account-modal"');
        assert.notEqual(at, -1, 'the Account panel is gone');
        const panel = src.slice(at, src.indexOf('</div>\n    </div>', at) + 20);
        assert.ok(panel.length > 400, 'the Account panel did not slice - guarding nothing');
        assert.match(src, /id="oauth-link-apple"/, 'no Link Apple control');
        assert.match(src, /id="oauth-link-google"/, 'no Link Google control');
        assert.match(src, /oauthLinkTap\('apple'\)/, 'Link Apple is not wired');
    });

    test('and they are only shown to somebody signed in with an email', () => {
        const src = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');
        const at = src.indexOf('function syncOauthLinkRow');
        assert.notEqual(at, -1, 'nothing decides when the Link row is shown');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 10));
        assert.ok(fn.length > 200, 'the slice collapsed - guarding nothing');
        assert.match(fn, /isAnonymous/, 'the Link row does not check for an anonymous user');
        // THROUGH THE ONE READER, not its own copy. The first version of this
        // demanded the literal "providerData" in here, which would have forced
        // the page to re-read the SDK's list beside oauth-signin.js's
        // linkedProviders() - two readers of one thing, which is the shape this
        // repo has paid for twice.
        assert.match(fn, /linkedProviders\(/, 'the Link row does not ask which providers are attached');
        assert.doesNotMatch(fn, /providerData/, 'the Link row reads providerData itself instead of asking oauth-signin.js');
        // AND IT HIDES EACH BUTTON ON ITS OWN: offering "Link Apple" to
        // somebody who already linked Apple is an invitation to a refusal.
        assert.match(fn, /apple\.com/, 'the Link row does not look for Apple specifically');
        assert.match(fn, /google\.com/, 'the Link row does not look for Google specifically');
    });
});
