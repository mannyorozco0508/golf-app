// ============================================================================
// THE PAGES AFTER THE NARROWING (2026-09-18): the golfer's refusal sentence,
// and the legacy console.
//
// The rule now published (tournaments_rules_isolation_test.js): a code-holder
// writes scores and nothing else; structure is the owner's; a record with no
// ownerUid is frozen. Two things on the pages follow from it:
//
// 1. THE GOLFER'S REFUSAL SENTENCE. tournament-scorecard.html trackWrite() said
//    "check your signal and re-enter that hole" for EVERY failure. On a
//    PERMISSION_DENIED that is a lie - the signal is fine and re-entering will
//    not help. Now: a PERMISSION_DENIED says the event is not accepting scores
//    and to ask the organizer; anything else keeps the signal sentence. The
//    way the signup form was taught in registration 2b.
//
// 2. THE LEGACY CONSOLE. canManage() was TRUE for everyone on a record with no
//    ownerUid - the "grandfather promise" - and FN68 signed out rendered the
//    whole Setup tab; after the publish every one of its 33 writers would be
//    refused with alert("Error: PERMISSION_DENIED"). Now canManage() is false
//    without an owner: the gate removes Setup and Desk as for a stranger, and
//    the Leaderboard tab shows ONE line above the board: "This event has no
//    organizer account, so its setup can't be changed. Scores still save."
//    No claim button - the rule closed the claim, deliberately. Measured at the
//    decision: two tournaments exist, one legacy (FN68, a throwaway).
//
// HARNESS. mini-dom; the scorecard's writer is reached through the page's own
// saveHoleScore, with the stub's set() made to reject the way the SDK does
// (an Error carrying code 'PERMISSION_DENIED'). The gate is driven through the
// page's own value handler and auth callback, as tournament_signin_gate_test
// does. Rects are Chrome's (tools/tournament-signin-gate-check.js legacy arm).
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const ORGANIZER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const STRANGER = { uid: 'u-other', email: 'other@example.com', isAnonymous: false };
const settle = () => new Promise((r) => setImmediate(r)).then(() => new Promise((r) => setImmediate(r)));

const REFUSED = "⚠️ This event isn't accepting scores — ask the organizer.";
const SIGNAL = '⚠️ Could not save — check your signal and re-enter that hole';

// A team scramble the scorecard can score, with the stub's set() shaped per test.
function arriveCard(rejectWith) {
    const sb = loadHtmlInlineScript('tournament-scorecard.html', [], {
        search: '?tourney=NARROW1&team=1',
        beforeRun(sandbox) {
            const realRef = sandbox.db.ref;
            sandbox.db.ref = function (p) {
                const r = realRef.call(this, p);
                if (rejectWith && /\/scores\//.test(String(p))) {
                    const err = new Error(rejectWith.message); err.code = rejectWith.code;
                    r.set = () => Promise.reject(err);
                    r.remove = () => Promise.reject(err);
                }
                return r;
            };
        }
    });
    const rec = { name: 'Narrow', format: 'scramble', courseName: 'C', courseData: COURSE, ownerUid: 'u-org', createdAt: 1,
        teams: { team1: { num: 1, name: 'Eagles', players: ['Ann', 'Bo'], handicap: 0 } } };
    // The listener sets currentData and roundLocked, then renders through a
    // <template>.content mini-dom does not have. The state this test needs is
    // set before that throw; the render is Chrome's to prove.
    sb.__dbHandlers.filter((h) => h.event === 'value' && /tournaments\/NARROW1$/.test(h.path)).forEach((h) => {
        try { h.cb({ val: () => JSON.parse(JSON.stringify(rec)), exists: () => true }); } catch (e) { if (!/querySelectorAll/.test(String(e.message))) throw e; }
    });
    return sb;
}
const saveState = (sb) => { const el = sb.document.getElementById('save-state'); return { cls: el.className, text: el.textContent }; };

describe('1. THE GOLFER\'S REFUSAL SENTENCE (tournament-scorecard.html)', () => {
    test('a PERMISSION_DENIED on a score write says the event is not accepting scores - not "check your signal"', async () => {
        const sb = arriveCard({ code: 'PERMISSION_DENIED', message: 'PERMISSION_DENIED: Permission denied' });
        sb.saveHoleScore(1, '5');
        await settle();
        const s = saveState(sb);
        assert.equal(s.text, REFUSED);
        assert.equal(s.cls, 'save-state error');
    });
    test('any other failure keeps the signal sentence', async () => {
        const sb = arriveCard({ code: 'NETWORK_ERROR', message: 'network' });
        sb.saveHoleScore(1, '5');
        await settle();
        assert.equal(saveState(sb).text, SIGNAL);
    });
    test('a write that lands still says Saved', async () => {
        const sb = arriveCard(null);
        sb.saveHoleScore(1, '5');
        await settle();
        assert.equal(saveState(sb).text, '✓ Saved');
        assert.ok(sb.__dbWrites.some((w) => w.path === 'tournaments/NARROW1/scores/team1_h1' && w.value === 5));
    });
    test('the two sentences are pinned in source, and the refusal reads the SDK code', () => {
        const src = read('tournament-scorecard.html');
        assert.ok(src.includes("err && err.code === 'PERMISSION_DENIED'"), 'the catch must switch on the SDK code');
        assert.ok(src.includes("This event isn't accepting scores \\u2014 ask the organizer.") || src.includes(REFUSED), 'the refusal sentence');
        assert.ok(src.includes('check your signal and re-enter that hole'), 'the signal sentence stays for real signal failures');
    });
});

// ---------------------------------------------------------------------------
function arrive(rec, user, order) {
    const sb = loadHtmlInlineScript('tournament.html', [], { search: '?tourney=LEG1' });
    if (order === 'user-first') sb.__auth.setUser(user);
    sb.__dbHandlers.filter((h) => h.event === 'value' && /tournaments\/LEG1$/.test(h.path)).forEach((h) => h.cb({ val: () => JSON.parse(JSON.stringify(rec)), exists: () => true }));
    if (order !== 'user-first') sb.__auth.setUser(user);
    return sb;
}
const LEGACY = () => ({ name: 'Hope Foundation (test)', format: 'scramble', courseName: 'Chambers Bay', courseData: COURSE, createdAt: 1,
    teams: { team1: { num: 1, name: 'Eagles', players: ['Ann', 'Bo'], handicap: 0 } } });
const OWNED = () => Object.assign(LEGACY(), { ownerUid: 'u-org' });
const el = (sb, id) => sb.document.getElementById(id);
const NOTE = "This event has no organizer account, so its setup can't be changed. Scores still save.";

describe('2. THE LEGACY CONSOLE (tournament.html): no owner, no console - one line instead of 33 alerts', () => {
    [[null, 'nobody'], [STRANGER, 'a stranger'], [ORGANIZER, 'the organizer account']].forEach(([user, who]) => {
        ['user-first', 'record-first'].forEach((order) => {
            test(`legacy record, ${who}, ${order}: Setup and Desk are REMOVED, the Leaderboard stays, the no-organizer line is on it`, () => {
                const sb = arrive(LEGACY(), user, order);
                assert.equal(el(sb, 'tab-btn-setup'), null, 'the Setup tab must be removed - the rule refuses every control on it');
                assert.equal(el(sb, 'manage-tab-setup'), null);
                assert.equal(el(sb, 'tab-btn-desk'), null);
                assert.ok(el(sb, 'tab-btn-leaderboard'), 'the Leaderboard tab stays');
                const note = el(sb, 'lb-no-owner-note');
                assert.equal(note.style.display, 'block', 'the line must be shown');
                // mini-dom parses no static text, so the sentence itself is pinned in
                // the markup test below; here only that the page SHOWS it.
                assert.equal(sb.canManage(), false, 'canManage() is false without an owner');
            });
        });
    });

    test('the line does NOT show on an owned record - for the owner or for a visitor', () => {
        [[ORGANIZER, 'user-first'], [null, 'record-first']].forEach(([user, order]) => {
            const sb = arrive(OWNED(), user, order);
            assert.notEqual(el(sb, 'lb-no-owner-note').style.display, 'block');
        });
        assert.ok(el(arrive(OWNED(), ORGANIZER), 'tab-btn-setup'), 'the owner keeps Setup');
    });

    test('no claim path: nothing on the legacy console writes ownerUid, signed in or not', () => {
        const sb = arrive(LEGACY(), ORGANIZER);
        assert.ok(!sb.__dbWrites.some((w) => /ownerUid/.test(w.path) || (w.value && w.value.ownerUid)));
        assert.doesNotMatch(read('tournament.html'), /Claim this event|claimTournament/);
    });

    test('the line is static markup on the Leaderboard tab, above the board, hidden by default', () => {
        const src = read('tournament.html');
        const lb = src.slice(src.indexOf('<div id="manage-tab-leaderboard"'), src.indexOf('<script>', src.indexOf('<div id="manage-tab-leaderboard"')));
        assert.match(lb, /<div id="lb-no-owner-note"[^>]*style="display:none;[^"]*"[^>]*>This event has no organizer account, so its setup can't be changed\. Scores still save\.<\/div>/);
        assert.ok(lb.indexOf('id="lb-no-owner-note"') < lb.indexOf('id="leaderboard-list"'), 'above the board');
    });

    test('canManage() reads ownerUid: no owner means nobody manages (the source says so)', () => {
        const src = read('tournament.html');
        const at = src.indexOf('function canManage()');
        const fn = src.slice(at, src.indexOf('\n    }', at));
        assert.doesNotMatch(fn, /if \(!owner\) return true;/, 'the grandfather branch is back');
        assert.match(fn, /if \(!owner\) return false;/);
    });
});

describe('3. THE SEAMS', () => {
    test('HANDOFF records the count, the date, the claim closing, and the $scoreKey placement', () => {
        const h = read('HANDOFF.md');
        const at = h.indexOf('## tournaments/$code is narrowed');
        assert.ok(at > 0, 'no narrowing section');
        const s = h.slice(at, at + 9000);
        assert.match(s, /2026-09-18/);
        assert.match(s, /two tournaments exist/i);
        assert.match(s, /FN68/);
        assert.match(s, /claim/i);
        assert.match(s, /deliberate/i);
        assert.match(s, /\$scoreKey/);
        assert.match(s, /ab32b84928fc30cebe7ba8529d570a7a3d095c300c9b8ff0df310025e50f940b/, 'the live hash after publish');
        assert.match(s, /a9015b86aa6528758933392f4c6b49ade1d3d38e75ad134dfd337e08fede79f1/, 'the hash of the rules before');
    });
    test('both caches moved: build-shell tournament-v46 and sw.js v171 (the hero PR had taken v45 / v170)', () => {
        assert.match(read('build-shell.js'), /cacheName: 'tournament-v46-narrowed-rules'/);
        assert.match(read('sw.js'), /const CACHE_VERSION = 'golfapp-v171-tournament-narrowing';/);
    });
});
