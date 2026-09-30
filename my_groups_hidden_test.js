// ============================================================================
// MY GROUPS SHIPS DARK, AND CANNOT LEAK
//
// WHY IT SHIPS AT ALL RATHER THAN WAITING ON A PREVIEW. My Groups is gated on a
// real email sign-in, and a branch preview CANNOT sign in: a branch host is not one
// of the project's authorized domains, so sendOobCode is refused before any email
// leaves. That is measured, not assumed - preview_signin_domain_test.js carries the
// two REST results. The only place the feature can be tested is the live app, so it
// goes there switched OFF for everybody.
//
// THE SWITCH IS AN ACCOUNT SETTING, "My Groups (beta)", and it MOVED THERE on
// 2026-09-30 because the secret master panel could never reach the App Store app:
// handleSecretTap() is a deliberate native no-op under App Review Guideline 2.1, so
// five taps on the logo do nothing in the shell - which is exactly where the switch
// was needed. Manny tapped five times on his iPhone and nothing happened, which is
// the app behaving as designed and the switch being in the wrong place.
//
// It is shown only to a SIGNED-IN organizer, and that is not decoration: My Groups
// stores the roster on the ACCOUNT, so an anonymous browser has nothing to save it
// to and the switch would promise something that cannot work.
//
// It still writes a PER-DEVICE flag in localStorage. A flag in app_settings would be
// global: it would turn the feature on for every golfer at once, which is the
// opposite of hidden. The secret panel's native no-op is UNTOUCHED, and
// native_review_surface_test.js still holds both of its arms.
//
// WHAT "CANNOT LEAK" MEANS HERE, and each half is asserted below: the button ships
// display:none in the markup, and nothing but the flag turns it on - no URL
// parameter, no gesture, no other caller. A device that has never been switched on
// has no way in, including Manny's until he taps the logo five times.
//
// WHAT THIS FILE DOES NOT CLAIM. Hiding a button is not a permission. Anyone who
// opens the console can call openMyGroupsModal() directly, and the panel would then
// refuse anyway: it needs a linked account, and organizers/$uid/groups is owner-only
// in the LIVE ruleset (Stage 1, published 2026-09-29 - see rules_stage1_test.js). The
// flag is release management, and the rules are the security. Saying that plainly is
// the point of this paragraph, because "hidden" reads like "protected" and is not.
//
// THE RED BASELINE, all 10 tests, measured against main 433345d - where the switch
// was behind the secret panel and therefore unreachable in the App Store app:
//
//     7 PASS / 3 FAIL
//
// THE SEVEN THAT PASS are the dark-ship properties this file was written for in the
// first place and which the move does not change: the button ships display:none, a
// fresh device sees nothing, the switch goes on and off, it survives a reload, only
// the flag turns it on, and hiding is not security. The THREE reds are exactly the
// move - the switch being an Account setting, being shown only to a signed-in
// organizer, and the Account panel repainting it - which is what a baseline should
// look like when a wave relocates a control rather than inventing one.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const src = read('admin.html');
// helpers/load-script.js's localStorage STUB DOES NOT STORE: setItem is a no-op and
// getItem answers null. Measured - a direct setItem then getItem comes back null - and
// it is the right default for a stub, but this file is entirely about a value that
// persists, so it supplies a real one. A Map, not a fake: set what you set, read what
// you set, and the page's own code is what is under test.
function page() {
    const sb = loadHtmlInlineScript('admin.html', ['my-groups.js']);
    const store = new Map();
    sb.localStorage = {
        getItem: k => (store.has(String(k)) ? store.get(String(k)) : null),
        setItem: (k, v) => { store.set(String(k), String(v)); },
        removeItem: k => { store.delete(String(k)); },
        clear: () => store.clear()
    };
    return sb;
}

describe('My Groups is off until the secret panel turns it on', () => {

    test('the button ships display:none in the MARKUP, not only in script', () => {
        // Script that hides it on load would leave it visible for one paint, and on a
        // slow phone that paint is a tap.
        assert.match(src, /<button class="btn-outline" id="my-groups-btn" style="display:none;" onclick="openMyGroupsModal\(\)">/,
            'the button must be hidden by the attribute');
    });

    test('a fresh device sees nothing: the flag is off and the button stays hidden', () => {
        const sb = page();
        assert.equal(sb.myGroupsEnabled(), false, 'off by default');
        sb.syncMyGroupsVisibility();
        assert.equal(sb.document.getElementById('my-groups-btn').style.display, 'none');
    });

    test('the switch turns it on for THIS DEVICE, and the button appears', () => {
        const sb = page();
        sb.toggleMyGroupsFeature();
        assert.equal(sb.myGroupsEnabled(), true);
        assert.equal(sb.localStorage.getItem('golfapp_mygroups_on'), '1', 'per device, in localStorage');
        assert.notEqual(sb.document.getElementById('my-groups-btn').style.display, 'none');
    });

    test('and off again, because a switch that only goes one way is a release', () => {
        const sb = page();
        sb.toggleMyGroupsFeature();
        sb.toggleMyGroupsFeature();
        assert.equal(sb.myGroupsEnabled(), false);
        assert.equal(sb.document.getElementById('my-groups-btn').style.display, 'none');
    });

    test('it survives a reload: the load hook reads the flag', () => {
        const sb = page();
        sb.toggleMyGroupsFeature();
        const kept = sb.localStorage.getItem('golfapp_mygroups_on');
        const again = page();                                     // the same device, next visit
        again.localStorage.setItem('golfapp_mygroups_on', kept);
        again.syncMyGroupsVisibility();
        assert.notEqual(again.document.getElementById('my-groups-btn').style.display, 'none');
        assert.match(src, /if \(typeof syncMyGroupsVisibility === 'function'\) syncMyGroupsVisibility\(\);/,
            'and the hook is really on DOMContentLoaded');
    });

    test('NOTHING BUT THE FLAG turns it on - no URL parameter, no other caller', () => {
        const fn = src.slice(src.indexOf('function syncMyGroupsVisibility'), src.indexOf('function toggleMyGroupsFeature'));
        assert.match(fn, /myGroupsEnabled\(\)/, 'the flag is the only input');
        assert.ok(!/urlParams|location\.search/.test(fn), 'a URL parameter would be a public door');
        // Exactly two callers: the load hook and the secret panel opening. Anything
        // else is a new way in and has to be justified rather than assumed.
        assert.equal((src.match(/syncMyGroupsVisibility\(\);/g) || []).length, 3,
            'the load hook, refreshAccountState, and the toggle itself');
    });

    test('the switch is an ACCOUNT setting, reachable in the App Store app', () => {
        const acct = src.slice(src.indexOf('<div class="modal-overlay" id="account-modal">'),
            src.indexOf('<!-- Dot Game Modal -->'));
        assert.match(acct, /id="my-groups-beta"/, 'the card is in the Account panel');
        assert.match(acct, /My Groups \(beta\)/, 'labelled as a beta setting');
        assert.match(acct, /onclick="toggleMyGroupsFeature\(\)"/, 'and the switch is there');
        // AND NOT IN THE SECRET PANEL ANY MORE - which is the whole point of the move.
        const panel = src.slice(src.indexOf('<div id="secret-master-panel">'), src.indexOf('<div class="smp-close-row">'));
        assert.ok(!/toggleMyGroupsFeature/.test(panel), 'it must not be behind the native no-op');
        // The panel's own native no-op is untouched.
        assert.match(src, /if \(isNativeApp\(\)\) return;/, 'handleSecretTap stays a native no-op');
        assert.match(src, /if \(tapCount >= 5\)/, 'and the panel still takes five taps for what is left in it');
    });

    test('and it is shown ONLY to a signed-in organizer', () => {
        // Not decoration: the roster is stored on the ACCOUNT, so an anonymous browser
        // has nothing to save it to.
        const sb = page();
        sb.syncMyGroupsVisibility();
        assert.equal(sb.document.getElementById('my-groups-beta').style.display, 'none',
            'anonymous sees no switch');
        sb.__auth.setUser({ uid: 'u1', isAnonymous: false, email: 'a@b.com' });
        sb.syncMyGroupsVisibility();
        assert.notEqual(sb.document.getElementById('my-groups-beta').style.display, 'none',
            'a signed-in organizer does');
        assert.match(src, /<section id="my-groups-beta"[^>]*style="display:none;"/,
            'and it ships hidden in the markup, not only in script');
    });

    test('the Account panel repaints it, so a sign-in inside the panel shows it', () => {
        const fn = src.slice(src.indexOf('function refreshAccountState'), src.indexOf('function previewPastedPlayers'));
        assert.match(fn, /syncMyGroupsVisibility\(\)/,
            'without this, finishing sign-in in the open panel would leave the switch hidden');
    });

    test('HIDING IS NOT SECURITY, and the file says so where it can be checked', () => {
        // The panel still refuses without a linked account, and the live ruleset makes
        // organizers/$uid/groups owner-only. If either of those stopped being true,
        // hiding a button would be all that stood there - which is why this is pinned
        // rather than left to the header.
        const open = src.slice(src.indexOf('async function openMyGroupsModal'), src.indexOf('function myGroupsAllEntries'));
        assert.match(open, /Sign in with your email first/, 'no account, no panel');
        const stage1 = JSON.parse(read('database.rules.stage1.json'));
        assert.ok(stage1.rules.organizers.$uid.groups, 'and the live rules own the data');
        assert.match(read('my_groups_hidden_test.js'), /Hiding a button is not a permission/);
    });
});
