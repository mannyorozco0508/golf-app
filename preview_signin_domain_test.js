// ============================================================================
// A PREVIEW DEPLOY CANNOT SEND A SIGN-IN LINK, AND MUST SAY SO
//
// THE REPORT. On https://ui-wave31-my-groups.golf-app-5a5.pages.dev, "Email me a
// sign-in link" sent NO email, and the screen then said "Could not finish
// sign-in. Check the signal and try the link again."
//
// MEASURED against the real project before anything was changed - the client API
// key is public, and this is the decisive control rather than a hypothesis:
//
//   POST identitytoolkit/v1/accounts:sendOobCode  requestType=EMAIL_SIGNIN
//     continueUrl=https://ui-wave31-my-groups.golf-app-5a5.pages.dev/admin.html
//       -> UNAUTHORIZED_DOMAIN : Domain not allowlisted by project
//     continueUrl=https://golf-app-5a5.pages.dev/admin.html
//       -> accepted
//
// So the cause is the ORIGIN. email-link-auth.js continueUrl() returns
// "<this origin>/admin.html" on purpose - a preview must not email a production
// link - and a branch host is not on the project's authorized domains, so
// Firebase refuses the request and no email is sent.
//
// WHAT WAS ACTUALLY WRONG IN THE CODE, and it is a copy defect of the kind
// CLAUDE.md is about: the SDK reports this as `auth/unauthorized-continue-uri`,
// which is a DIFFERENT code from `auth/unauthorized-domain`. Only the second was
// in messageFor(), so the first fell through to the generic note - and that note
// said two untrue things at once: it blamed the signal, and it implied a link was
// on its way. Nothing was wrong with the network and nothing had been sent.
//
// WHAT THIS FIXES AND WHAT IT DOES NOT. It does not make sign-in work on a
// preview; only adding the hostname in Firebase Console -> Authentication ->
// Settings -> Authorized domains does that, and Firebase does not accept
// wildcards, so each branch host is its own entry. What it fixes is the app
// telling the truth about why, and naming both ways out.
//
// THE RED BASELINE, measured against main f9382a2, all 7 tests:
//
//     2 PASS / 5 FAIL
//
// I wrote 3/4 into this header before running it. The truth is 2/5: the two that
// pass are the two CONTROLS - continueUrl() already returned this origin, which is
// correct behaviour and is pinned here so a later "fix" cannot quietly make a
// preview email a production link, and the other error codes already had their own
// notes. There was no third.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const src = read('email-link-auth.js');

function api(hostname) {
    const sb = loadJsFile('email-link-auth.js');
    if (hostname) {
        try { sb.window.location.hostname = hostname; } catch (e) { /* stubbed differently */ }
    }
    return sb.emailLinkAuth;
}

describe('a preview deploy says why it cannot send a sign-in link', () => {

    test('auth/unauthorized-continue-uri gets its OWN message, not the generic one', () => {
        const a = api('ui-wave31-my-groups.golf-app-5a5.pages.dev');
        const msg = a.messageFor({ code: 'auth/unauthorized-continue-uri' });
        assert.ok(!/Check the signal/.test(msg),
            'the generic note blames the network for a refusal that never reached it');
        assert.match(msg, /No email was sent/, 'it must say nothing was sent');
        assert.match(msg, /authorized sign-in domains|Authorized domains/,
            'and name the real cause');
    });

    test('the message names THIS hostname, so there is nothing to guess', () => {
        const a = api('ui-wave31-my-groups.golf-app-5a5.pages.dev');
        const msg = a.messageFor({ code: 'auth/unauthorized-continue-uri' });
        assert.match(msg, /ui-wave31-my-groups\.golf-app-5a5\.pages\.dev/,
            'the exact string that has to be pasted into the console');
    });

    test('it offers BOTH ways out - the live app, or the console entry', () => {
        const msg = api('preview.example.pages.dev').messageFor({ code: 'auth/unauthorized-continue-uri' });
        assert.match(msg, /live app/, 'the way out that needs nobody');
        assert.match(msg, /Firebase Console.*Authentication.*Authorized domains/s,
            'and the durable one, with the full path through the console');
    });

    test('all four continue-uri codes land on it, not just the one that was reported', () => {
        const a = api('preview.example.pages.dev');
        ['auth/unauthorized-domain', 'auth/unauthorized-continue-uri',
            'auth/invalid-continue-uri', 'auth/missing-continue-uri'].forEach(code => {
                const m = a.messageFor({ code: code });
                assert.match(m, /No email was sent/, code + ' must reach the origin note');
            });
    });

    test('CONTROL a preview still sends its OWN origin, never a production link', () => {
        // This is the behaviour that CAUSES the refusal, and it is correct: a link
        // emailed from a preview must not sign somebody into production. Pinned so a
        // later "fix" cannot quietly point previews at the live host.
        const fn = src.slice(src.indexOf('function continueUrl'), src.indexOf('function actionCodeSettings'));
        assert.match(fn, /shareBaseUrl/, 'the web origin inside Capacitor, THIS origin on http(s)');
        assert.match(fn, /window\.location && window\.location\.origin/);
        assert.match(fn, /admin\.html/, 'and the lobby, because the scorecard drops the code');
        assert.ok(!/golf-app-5a5\.pages\.dev/.test(fn), 'no hard-coded production host');
    });

    test('CONTROL the other codes keep their own notes - this did not flatten the map', () => {
        const a = api('x.pages.dev');
        assert.match(a.messageFor({ code: 'auth/operation-not-allowed' }), /not turned on for this app/);
        assert.match(a.messageFor({ code: 'auth/invalid-email' }), /does not look usable/);
        assert.match(a.messageFor({ code: 'auth/expired-action-code' }), /expired or was already used/);
        assert.match(a.messageFor({ code: 'something-else' }), /Check the signal/,
            'and a genuinely unknown failure still gets the generic note');
    });

    test('the measurement is recorded in the file, not just in a report', () => {
        assert.match(src, /UNAUTHORIZED_DOMAIN : Domain not allowlisted by project/,
            'the exact refusal from the project is written next to the code that handles it');
        assert.match(src, /auth\/unauthorized-continue-uri/);
        // Firebase does not accept wildcards on authorized domains, so "add the
        // hostname" really is per branch. Said in the header so nobody looks for a
        // pattern that does not exist.
        assert.match(read('preview_signin_domain_test.js'), /does not accept\s+wildcards/);
    });
});
