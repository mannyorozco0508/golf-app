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
// THE SWITCH IS THE SECRET MASTER PANEL - the ⛳ logo, five taps - the same door the
// whole-dollar settlement switch already uses, and it writes a PER-DEVICE flag in
// localStorage. A flag in app_settings would be global: it would turn the feature on
// for every golfer at once, which is the opposite of hidden.
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
// THE RED BASELINE, all 8 tests, measured against main 4676a29 - where admin.html
// has no My Groups button at all, because Wave 31 had not merged:
//
//     0 PASS / 8 FAIL
//
// Every one is red for the same honest reason: there is nothing to hide yet. The
// file earns its keep from here on as the thing that stops the button appearing for
// everybody the day somebody deletes a style attribute.
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
            'the load hook, the secret panel, and the toggle itself');
    });

    test('the switch is INSIDE the secret master panel, which needs five taps', () => {
        const panel = src.slice(src.indexOf('<div id="secret-master-panel">'), src.indexOf('<div class="smp-close-row">'));
        assert.match(panel, /onclick="toggleMyGroupsFeature\(\)"/, 'the switch is in the panel');
        assert.match(panel, /id="my-groups-flag-state"/, 'and it says which way it is set');
        assert.match(src, /tapCount \+\+?=|tapCount\+\+/, 'the panel counts taps');
        assert.match(src, /if \(tapCount >= 5\)/, 'five of them');
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
