// ============================================================================
// MY GROUPS IS RELEASED (2026-10-04)
//
// It shipped DARK on 2026-09-30, behind a per-device beta flag with its switch in
// the Account panel, for one reason: a branch preview cannot sign in - a branch
// host is not one of the project's authorized domains, so sendOobCode is refused
// before any email leaves (measured, see preview_signin_domain_test.js) - and My
// Groups is gated on a real email sign-in. The only place it could be tested was
// the live app, so it went there switched off.
//
// IT IS ON FOR EVERYBODY NOW. The flag, the toggle and the "My Groups (beta)"
// card are gone, and the button is an ordinary control on the Players step. This
// file holds the release rather than the hiding: there must be no flag left to
// read, no card left in the Account panel, and nothing that can put the button
// back behind a switch.
//
// THE ONE REAL CONDITION SURVIVES, and it is not decoration: My Groups stores the
// roster ON THE ACCOUNT, so an anonymous browser has nothing to save it to. That
// is now a sentence and a way in - the panel says so and offers Sign in - rather
// than a button that is not there.
//
// WHAT THIS FILE DOES NOT CLAIM. A visible button is not a permission, and it
// never was one: organizers/$uid/groups is owner-only in the LIVE ruleset (Stage
// 1, published 2026-09-29 - see rules_stage1_test.js). The flag was release
// management; the rules are the security. That was worth saying when the feature
// was hidden and it is worth saying now that it is not.
//
// BASELINE. Against a098fa1, where the flag and the beta card were still there,
// over the FINISHED file, all 9 tests: 5 PASS / 4 FAIL. admin.html was restored
// by sha from a saved copy (23d1a7f0f38d9b46), never with git restore.
//
//   THE FIVE PASSES are everything the release does not change: the modal's
//   account refusal, the real-account rule, the rules sentence, and the two that
//   check the feature itself is still wired. The four reds are the flag, the
//   toggle, the beta card and the button shipping visible - which is the whole
//   of this change.
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

describe('THE FLAG, THE TOGGLE AND THE CARD ARE GONE', () => {

    test('nothing reads a My Groups flag any more', () => {
        const src = read('admin.html');
        assert.ok(!/golfapp_mygroups_on/.test(src), 'the localStorage flag is still read');
        assert.ok(!/MY_GROUPS_FLAG/.test(src), 'the flag constant is still here');
        assert.ok(!/myGroupsEnabled/.test(src), 'the predicate that gated it is still here');
        assert.ok(!/toggleMyGroupsFeature/.test(src), 'the switch is still here');
    });

    test('the Account panel has no beta card', () => {
        const src = read('admin.html');
        assert.ok(!/my-groups-beta/.test(src), 'the card is still in the Account panel');
        assert.ok(!/My Groups \(beta\)/.test(src), 'the beta heading is still here');
        // AND THE PANEL IS STILL THE PANEL: the two things that belong there are
        // untouched, so this is a removal and not a rearrangement.
        assert.match(src, /id="account-exit-card"/);
        assert.match(src, /id="email-link-card"|class="email-link-card"/);
    });

    test('the button ships VISIBLE in the markup, with no style that hides it', () => {
        const src = read('admin.html');
        const at = src.indexOf('id="my-groups-btn"');
        assert.ok(at > 0, 'the button is gone');
        const tag = src.slice(src.lastIndexOf('<button', at), src.indexOf('>', at) + 1);
        assert.ok(!/display:\s*none/.test(tag), 'the button still ships hidden: ' + tag);
        assert.match(tag, /onclick="openMyGroupsModal\(\)"/);
    });

    test('and nothing in script can hide it again', () => {
        const src = read('admin.html');
        const fn = src.slice(src.indexOf('function syncMyGroupsVisibility()'),
                             src.indexOf('function myGroupsUser()'));
        assert.ok(fn.length > 40, 'the slice is empty - the endpoint drifted');
        // The pattern has to be an ASSIGNMENT. "= 'none'" also matches inside
        // "=== 'none'", which is the comparison this function is allowed to make
        // and the first version of this line forbade by accident.
        assert.ok(!/display\s*=\s*'none'/.test(fn), 'the sync can still hide the button');
        assert.match(fn, /style\.display === 'none'/, 'it should only ever UNHIDE');
    });
});

describe('WHAT REPLACED THE SWITCH IS AN ACCOUNT', () => {

    test('no account: the panel says so and offers the way in', () => {
        const src = read('admin.html');
        const fn = src.slice(src.indexOf('async function openMyGroupsModal()'),
                             src.indexOf('async function openMyGroupsModal()') + 1600);
        assert.match(fn, /const u = myGroupsUser\(\);/);
        assert.match(fn, /if \(!u\) \{/, 'an anonymous organizer is not told anything');
        assert.match(fn, /Sign in/, 'there is no way in from the refusal');
        assert.match(fn, /openAccountPanel\(\)/, 'the offer does not open the account panel');
    });

    test('an account is a REAL one - anonymous does not count', () => {
        const src = read('admin.html');
        const fn = src.slice(src.indexOf('function myGroupsUser()'),
                             src.indexOf('function myGroupsUid()'));
        assert.match(fn, /isAnonymous === false/, 'an anonymous uid would pass as an account');
        assert.match(fn, /u\.email/, 'a group is found by email; an account without one cannot share');
    });

    test('THE RULES ARE THE SECURITY, not the button', () => {
        // Said in the header, asserted here so the sentence cannot quietly go.
        assert.match(read('my_groups_release_test.js'), /A visible button is not a permission/);
        const rules = read('database.rules.json');
        assert.match(rules, /organizers/, 'the live ruleset no longer scopes organizers');
    });
});

describe('THE FEATURE ITSELF IS UNTOUCHED', () => {

    test('the modal, its mount and the roster pipeline are all still there', () => {
        const src = read('admin.html');
        ['id="my-groups-modal"', 'id="my-groups-body"', 'id="my-groups-note"',
         'function openMyGroupsModal', 'captureCurrentPlayerInputs', 'appendPlayerFrom']
            .forEach((needle) => assert.ok(src.includes(needle), needle + ' went missing'));
    });

    test('and my-groups.js is still the one store shape', () => {
        const M = require('./my-groups.js');
        ['myGroupsPath', 'buildMyGroupPayload', 'myGroupRoster', 'myGroupCanManage']
            .forEach((fn) => assert.equal(typeof M[fn], 'function', fn));
        assert.match(read('admin.html'), /<script src="my-groups\.js"><\/script>/);
    });
});
