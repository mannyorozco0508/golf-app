// ============================================================================
// THE GATE HIDES, IT DOES NOT REMOVE - so the value callback can keep painting
// the board for everyone (2026-09-18).
//
// THE DEFECT. applyManageGate removed the Setup and Desk tabs for anyone who is
// not the owner. loadTournament's value callback writes fourteen sites inside
// the Setup tab before it reaches renderLeaderboard (re-derived in Chrome:
// tournament.html:4094-4108, and inside renderShotgunAssignments, renderRounds,
// renderFlights, renderPlayerField, renderScoringGroups, renderTripLinkStatus).
// The first snapshot painted, the gate ran last and removed the tab, and every
// later snapshot threw at :4094 before the board. A spectator saw the first
// paint and nothing after - since 7d5866d (2026-09-12); since the narrowing,
// on a legacy record, the organizer too. Option B: the pills and panels get
// display:none and stay in the tree; showTab treats a gated tab as absent for
// a non-owner; the owner's late sign-in un-hides them. No stash, no
// re-insertion, no guard per write - the next renderer someone adds to that
// callback cannot reopen this.
//
// WHAT MINI-DOM CAN AND CANNOT PROVE HERE. Its removed panel answered null,
// but the badge and the rest are registry elements hanging off BODY, not
// children of the panel - so a twice-fired handler did NOT throw in mini-dom
// on the broken page (measured; the recon said otherwise and was wrong). The
// throw and the frozen board are Chrome's: tools/tournament-live-board-check.js
// delivers a second and a third snapshot through cold-arrival's new
// { deliver } step. What this file proves: the gate's new shape (hidden, in
// the tree, un-hidden for the owner), that the board's markup CHANGES on a
// second snapshot for every arrival, and the seams.
//
// THE RULE, stated once, in HANDOFF (harness fault #6): a check on a live page
// delivers at least two snapshots on the listener whose render it measures and
// asserts the second landed. One snapshot proves the first paint, not the page.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const SRC = read('tournament.html');
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const STRANGER = { uid: 'u-other', email: 'other@example.com', isAnonymous: false };
const base = () => ({ name: 'Live', format: 'scramble', courseName: 'C', courseData: COURSE, entryFee: 0, createdAt: 1,
    teams: { team1: { num: 1, name: 'Eagles', players: ['Ann', 'Bo'], handicap: 0 }, team2: { num: 2, name: 'Hawks', players: ['Cal'], handicap: 0 } }, scores: {} });
const OWNED = () => Object.assign(base(), { ownerUid: 'u-org' });
const LEGACY = () => base();
const scored = (rec, holes) => { const r = JSON.parse(JSON.stringify(rec)); r.scores = {}; for (let h = 1; h <= holes; h++) { r.scores['team1_h' + h] = 3; r.scores['team2_h' + h] = 5; } return r; };

function arrive(rec, user, order) {
    const sb = loadHtmlInlineScript('tournament.html', [], { search: '?tourney=LB1' });
    if (order === 'user-first') sb.__auth.setUser(user);
    const hs = sb.__dbHandlers.filter((h) => h.event === 'value' && /tournaments\/LB1$/.test(h.path));
    assert.ok(hs.length > 0, 'the page registered no value handler');
    const fire = (r) => hs.forEach((h) => h.cb({ val: () => JSON.parse(JSON.stringify(r)), exists: () => true }));
    fire(rec);
    if (order !== 'user-first') sb.__auth.setUser(user);
    return { sb, fire };
}
const el = (sb, id) => sb.document.getElementById(id);
const board = (sb) => String((el(sb, 'leaderboard-list') || {}).innerHTML || '');

const ARMS = [['signed out, owned', OWNED, null], ['a stranger, owned', OWNED, STRANGER], ['the owner, LEGACY', LEGACY, OWNER], ['signed out, LEGACY', LEGACY, null]];

describe('1. THE SECOND SNAPSHOT LANDS - for every arrival, in both orders', () => {
    ARMS.forEach(([who, rec, user]) => ['record-first', 'user-first'].forEach((order) => {
        test(`${who}, ${order}: the board changes on the second and third snapshot; nothing throws`, () => {
            const { sb, fire } = arrive(rec(), user, order);
            const first = board(sb);
            assert.match(first, /Eagles/, 'the first paint lists the teams');
            assert.doesNotMatch(first, /lb-pos">1</, 'no rank before scores');
            fire(scored(rec(), 2));
            const second = board(sb);
            assert.notEqual(second, first, 'THE BOARD DID NOT MOVE ON THE SECOND SNAPSHOT');
            assert.match(second, /lb-pos">1<\/span>\s*<span class="lb-team">Eagles/, 'Eagles lead after two holes');
            fire(scored(rec(), 5));
            assert.match(board(sb), /lb-thru">5</, 'thru 5 after the third');
        });
    }));
    test('the owner on an owned record (control): the same, with the Setup tab on screen', () => {
        const { sb, fire } = arrive(OWNED(), OWNER);
        fire(scored(OWNED(), 2));
        assert.match(board(sb), /lb-pos">1<\/span>\s*<span class="lb-team">Eagles/);
        assert.notEqual(el(sb, 'manage-tab-setup').style.display, 'none');
    });
});

describe('2. HIDDEN, NOT REMOVED', () => {
    ARMS.forEach(([who, rec, user]) => {
        test(`${who}: the four gated elements are in the tree with display none; the Leaderboard pill is active`, () => {
            const { sb } = arrive(rec(), user);
            ['tab-btn-setup', 'tab-btn-desk', 'manage-tab-setup', 'manage-tab-desk'].forEach((id) => {
                const e = el(sb, id);
                assert.ok(e, id + ' must stay in the tree - the value callback writes into it');
                assert.equal(e.style.display, 'none', id + ' hidden');
            });
            assert.ok(el(sb, 'manage-room-badge'), 'the first throwing site is reachable');
            assert.ok(el(sb, 'tab-btn-leaderboard').classList.contains('active'));
            assert.equal(el(sb, 'manage-tab-leaderboard').style.display, 'block');
        });
    });
    test('a non-owner asking for a gated tab lands on the Leaderboard (showTab treats hidden as absent)', () => {
        const { sb } = arrive(OWNED(), STRANGER);
        sb.showTab('setup');
        assert.equal(el(sb, 'manage-tab-setup').style.display, 'none');
        assert.equal(el(sb, 'manage-tab-leaderboard').style.display, 'block');
        sb.showTab('desk');
        assert.equal(el(sb, 'manage-tab-desk').style.display, 'none');
        assert.ok(el(sb, 'tab-btn-leaderboard').classList.contains('active'));
    });
    test('the owner: nothing hidden, Setup shown by default', () => {
        const { sb } = arrive(OWNED(), OWNER);
        ['tab-btn-setup', 'tab-btn-desk'].forEach((id) => assert.notEqual(el(sb, id).style.display, 'none', id));
        assert.equal(el(sb, 'manage-tab-setup').style.display, 'block');
    });
    test('THE LATE SIGN-IN: record first, signed out (hidden), then the owner signs in - un-hidden, Setup shown, and the next snapshot still lands', () => {
        const { sb, fire } = arrive(OWNED(), null);
        assert.equal(el(sb, 'tab-btn-setup').style.display, 'none');
        sb.__auth.setUser(OWNER);
        ['tab-btn-setup', 'tab-btn-desk'].forEach((id) => assert.notEqual(el(sb, id).style.display, 'none', id + ' un-hidden'));
        assert.equal(el(sb, 'manage-tab-setup').style.display, 'block', 'Setup shown on sign-in');
        assert.ok(el(sb, 'tab-btn-setup').classList.contains('active'));
        fire(scored(OWNED(), 2));
        assert.match(board(sb), /lb-pos">1<\/span>\s*<span class="lb-team">Eagles/);
        // and signing out again hides them again
        sb.__auth.setUser(null);
        assert.equal(el(sb, 'tab-btn-setup').style.display, 'none');
        assert.equal(el(sb, 'manage-tab-leaderboard').style.display, 'block');
    });
    test('the record gains an owner while a stranger watches: the tabs stay hidden; the owner watching gets them', () => {
        const { sb, fire } = arrive(LEGACY(), OWNER);
        assert.equal(el(sb, 'tab-btn-setup').style.display, 'none', 'legacy: hidden even for the account that will own it');
        fire(OWNED());
        assert.notEqual(el(sb, 'tab-btn-setup').style.display, 'none', 'now owned by this account: shown');
        const s2 = arrive(LEGACY(), STRANGER);
        s2.fire(OWNED());
        assert.equal(el(s2.sb, 'tab-btn-setup').style.display, 'none');
    });
});

describe('3. THE SOURCE - no removal, no stash, the stale sentence gone', () => {
    const at = SRC.indexOf('function applyManageGate()');
    const fn = SRC.slice(at, SRC.indexOf('\n    }', at));
    test('applyManageGate hides and un-hides; it never removes or re-inserts', () => {
        assert.ok(fn.length > 400, 'the gate exists');
        assert.doesNotMatch(fn, /\.remove\(\)|insertBefore|gateStash/, 'removal and the re-insertion dance are gone');
        assert.match(fn, /style\.display = 'none'/, 'hidden');
        assert.match(fn, /style\.display = ''/, 'un-hidden by clearing the inline style');
        assert.doesNotMatch(SRC, /let gateStash/);
    });
    test('showTab refuses a gated tab for a non-owner', () => {
        const s = SRC.indexOf('function showTab(tab)');
        const st = SRC.slice(s, SRC.indexOf('\n    }', s));
        assert.match(st, /GATED_TABS\.includes\(tab\) && !canManage\(\)/);
    });
    test('the stale rules sentence is gone from the gate comment (false since dab91d8)', () => {
        const gate = SRC.slice(SRC.indexOf('SIGN-IN AND THE MANAGE GATE'), at);
        assert.doesNotMatch(gate, /still lets anyone holding the six-character code write every child/, 'the comment lied since the narrowing');
        assert.doesNotMatch(gate, /parent \.write is unchanged/);
        assert.match(gate, /narrow/i, 'the comment names the narrowing');
        assert.doesNotMatch(SRC, /NOT hidden, NOT disabled: removed/);
    });
});

describe('4. THE HARNESS AND THE SEAMS', () => {
    test('cold-arrival has the opt-in deliver step and a listener registry; writes still re-fire nothing', () => {
        const c = read('tools/lib/cold-arrival.js');
        assert.match(c, /window\.__coldDeliver = function \(pathStr, value\)/);
        assert.match(c, /VALUE_LISTENERS\.push\(/);
        assert.match(c, /if \(step\.deliver\) \{/);
        assert.match(c, /listeners: hits\.length, threw: threw/, 'the step reports how many listeners it reached and whether one threw');
        assert.match(c, /set: function \(\) \{ return Promise\.resolve\(\); \}/, 'set() still re-fires nothing - delivery is opt-in');
    });
    test('journey records a thrown listener and raises it from evaluate', () => {
        const j = read('tools/lib/journey.js');
        assert.doesNotMatch(j, /catch \(e\) \{ \/\* a listener that throws is the page's problem \*\/ \}/, 'the swallow is gone');
        assert.match(j, /window\.__listenerErrs\.push\(/);
        assert.match(j, /page threw in a listener: /);
    });
    test('the Chrome check exists, delivers a second and a third snapshot, bails when nothing listened, and self-tests journey', () => {
        const t = read('tools/tournament-live-board-check.js');
        assert.match(t, /\{ deliver: \{ path: 'tournaments\/' \+ code, value: withScores\(rec, 2\) \} \}/);
        assert.match(t, /withScores\(rec, 5\)/);
        assert.match(t, /REACHED NO LISTENER - this arm proves nothing/);
        assert.match(t, /LISTENER-PROBE-THREW/);
        assert.match(t, /openJourney\(/);
    });
    test('HANDOFF: fault #6 by name, the rule, and the count re-derived in Chrome (14, not 13)', () => {
        const h = read('HANDOFF.md');
        assert.match(h, /Six harness faults in six waves/);
        assert.match(h, /One snapshot proves the first paint, not the page/);
        assert.match(h, /at least two snapshots/i);
        assert.match(h, /14 (throwing )?sites/);
        const at = h.indexOf('## The non-owner\'s leaderboard froze after the first snapshot');
        assert.ok(at > 0, 'no section');
        const s = h.slice(at, at + 9000);
        ['7d5866d', 'hide', 'display:none', 'showTab', 'late sign-in', 'mini-dom', 'tools/tournament-live-board-check.js'].forEach((k) => assert.ok(s.indexOf(k) > -1, 'HANDOFF misses ' + k));
    });
    test('both caches moved for this wave (v50 / v175) and have not moved back', () => {
        assert.match(read('build-shell.js'), /Moved to v50\./);
        assert.match(read('sw.js'), /Moved to v175:/);
        const t = /cacheName: 'tournament-v(\d+)-/.exec(read('build-shell.js'));
        const c = /const CACHE_VERSION = 'golfapp-v(\d+)-/.exec(read('sw.js'));
        assert.ok(t && Number(t[1]) >= 50, 'tournament key at or past v50: ' + (t && t[0]));
        assert.ok(c && Number(c[1]) >= 175, 'consumer key at or past v175: ' + (c && c[0]));
    });
});
