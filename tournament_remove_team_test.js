// ============================================================================
// REMOVE A TEAM FROM SETUP (Tournaments Wave 2, 2026-10-06)
//
// There was no control that removes a team, so Wave 1's phone check B ("delete
// the team in Setup, the Desk says Needs a team") could not run. Each editable
// Setup row now carries Remove.
//
// ONLY A TEAM WITH NO POSTED SCORE, IN ANY ROUND. With a score it is refused
// with "<name> has scores and can't be removed." and NOTHING is written.
// Without, one node goes: teams/teamN - which holds the team's golfers,
// handicap, starting hole and flight; the tee sheet and the shotgun list are
// built from teams, so its hole and its tee-sheet slot go with it.
// Registrations are left alone: the Desk derives "Needs a team" (631b4ef).
//
// THE PATH IS THE USER'S: the owner's page, the Setup row as rendered, its
// Remove button's own onclick, the confirm answered, the write echoed back
// through the page's own listener; the Desk read off its own listener.
//
// BASELINE over the FINISHED file, all 9 tests: measured against main c62ab77,
// tournament.html as committed there:
//
//   3 PASS / 6 FAIL / 9 tests.   3 + 6 = 9.
//
// THREE PASS. Two are the targaryen rows on database.rules.json (unchanged
// from main, green both sides). The third is "a stranger cannot" - vacuous on main, where there
// was no Remove at all. Kept for what it catches: a remover without canManage.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');
const { applyWrites } = require('./helpers/tournament-write-apply.js');

const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const STRANGER = { uid: 'u-who', email: 'who@example.com', isAnonymous: false };
function rec(extra) {
    return Object.assign({ name: 'Desk Day', format: 'scramble', courseName: 'C', courseData: COURSE, createdAt: 1, ownerUid: OWNER.uid,
        entryFee: 100, startType: 'shotgun', payoutSpots: [200, 100],
        teams: {
            team1: { num: 1, name: 'Eagles', players: ['Ann'], handicap: 0, startingHole: '1' },
            team2: { num: 2, name: 'Team 2', players: ['Desk One', 'Desk Two'], handicap: 0, startingHole: '7' },
            team3: { num: 3, name: 'Owls', players: ['Cal'], handicap: 0, startingHole: '12' }
        },
        scores: { team1_h1: 4, team3_h1: 5 } }, extra || {});
}
const regs = () => ({
    e1: { fullName: 'Desk One', email: 'one@example.com', phone: '555-0001', createdAt: 10, approvedAt: 11, teamNum: 2 },
    e2: { fullName: 'Desk Two', email: 'two@example.com', phone: '555-0002', createdAt: 12, approvedAt: 13, teamNum: 2 }
});

function page(r, user) {
    const sb = loadHtmlInlineScript('tournament.html', [], { search: '?tourney=RT1' });
    sb.__fire = (re, v) => sb.__dbHandlers.filter((x) => x.event === 'value' && re.test(x.path))
        .forEach((x) => x.cb({ val: () => JSON.parse(JSON.stringify(v)), exists: () => true }));
    sb.__fire(/tournaments\/RT1$/, r);
    sb.__auth.setUser(user || OWNER);
    sb.__fire(/registrations\/RT1$/, regs());
    sb.__alerts = []; sb.__confirms = [];
    vm.runInContext('alert = function (m) { __alerts.push(String(m)); }; confirm = function (m) { __confirms.push(String(m)); return true; };', sb);
    return sb;
}
// Tap Remove on team N: its onclick, as the rendered Setup row carries it.
function tapRemove(sb, num) {
    const cards = String(sb.document.getElementById('team-cards-list').innerHTML);
    const m = new RegExp('class="btn-outline team-remove"[^>]*data-team="' + num + '"[^>]*onclick="([^"]+)"').exec(cards);
    assert.ok(m, 'no Remove button on team ' + num + ' in the Setup row');
    vm.runInContext(m[1], sb);
}
const html = (sb, id) => String(sb.document.getElementById(id).innerHTML || '');

describe('no scores: the team is removed and the Desk flags its golfers', () => {
    test('it asks, by name, and writes one removal of teams/team2', () => {
        const sb = page(rec());
        tapRemove(sb, 2);
        assert.equal(sb.__confirms.length, 1);
        assert.match(sb.__confirms[0], /^Remove Team 2\? Golfers on it will need a new team on the Desk\./);
        assert.equal(JSON.stringify(sb.__dbWrites.map((w) => [w.op, w.path])), JSON.stringify([['remove', 'tournaments/RT1/teams/team2']]));
    });

    test('after the echo, and after a reload: both golfers "Needs a team", count 2; registrations untouched', () => {
        const sb = page(rec());
        tapRemove(sb, 2);
        const after = applyWrites(rec(), sb.__dbWrites, 'tournaments/RT1');
        sb.__fire(/tournaments\/RT1$/, after);
        [sb, page(after)].forEach((p) => {
            assert.equal((html(p, 'registration-list').match(/reg-state-needs">Needs a team</g) || []).length, 2);
            assert.match(html(p, 'registration-counts'), /2 need a team/);
            assert.match(html(p, 'registration-chips'), /Needs a team 2/);
        });
        assert.ok(!sb.__dbWrites.some((w) => /^registrations\//.test(String(w.path))), 'a registration was written');
    });

    test('its starting hole and tee-sheet slot are gone; the board and payouts render with no gap row', () => {
        const sb = page(rec());
        tapRemove(sb, 2);
        const after = applyWrites(rec(), sb.__dbWrites, 'tournaments/RT1');
        sb.__fire(/tournaments\/RT1$/, after);
        const shotgun = html(sb, 'shotgun-assignments-list');
        assert.match(shotgun, /Eagles/); assert.match(shotgun, /Owls/);
        assert.doesNotMatch(shotgun, /Team 2|value="7"/);
        vm.runInContext('window.print = function () {}; print = window.print; printTournamentTeeSheet();', sb);
        const tee = html(sb, 'tournament-print-view');
        assert.equal((tee.match(/class="tee-cell"/g) || []).length, 2);
        assert.doesNotMatch(tee, /team=2|Hole 7/);
        const board = html(sb, 'leaderboard-list');
        const rows = (board.match(/class="lb-row /g) || []).length;
        assert.equal(rows, 2, 'board rows: ' + rows);
        assert.match(board, /Eagles/); assert.match(board, /Owls/); assert.doesNotMatch(board, /Team 2/);
        // Read off a WATCHER's page: they render the saved payoutSpots. The
        // owner previews the boxes, which mini-dom cannot parse from innerHTML.
        const pay = html(page(after, STRANGER), 'payout-results');
        assert.match(pay, /1st — Eagles<\/span><span class="val-pos">\$200\.00/);
        assert.match(pay, /2nd — Owls<\/span><span class="val-pos">\$100\.00/);
    });
});

describe('has scores: refused, nothing written', () => {
    test('a score at the event root refuses the remove with one sentence', () => {
        const sb = page(rec());
        tapRemove(sb, 1);
        assert.deepEqual(sb.__alerts, ["Eagles has scores and can't be removed."]);
        assert.equal(sb.__confirms.length, 0, 'it asked before refusing');
        assert.equal(sb.__dbWrites.length, 0);
    });
    test('a score in any round counts too (a multi-round event)', () => {
        const r = rec({ eventModel: 'round-v1', scores: {},
            rounds: { r1: { name: 'Sat', status: 'closed', format: 'scramble', courseData: COURSE, createdAt: 1, scores: {} },
                      r2: { name: 'Sun', status: 'open', format: 'scramble', courseData: COURSE, createdAt: 2, scores: { team2_h5: 4 } } } });
        const sb = page(r);
        tapRemove(sb, 2);
        assert.deepEqual(sb.__alerts, ["Team 2 has scores and can't be removed."]);
        assert.equal(sb.__dbWrites.length, 0);
    });
    test('a best-ball per-golfer score (team2_p1_h3) counts too', () => {
        const sb = page(rec({ scores: { team2_p1_h3: 5 } }));
        tapRemove(sb, 2);
        assert.deepEqual(sb.__alerts, ["Team 2 has scores and can't be removed."]);
        assert.equal(sb.__dbWrites.length, 0);
    });
});

describe('only the owner', () => {
    test('a stranger has no Setup row to tap, and calling it writes nothing', () => {
        const sb = page(rec(), STRANGER);
        try { vm.runInContext('removeTeam(2)', sb); } catch (e) { /* main: no such function */ }
        assert.equal(sb.__dbWrites.length, 0);
    });
});

describe('the live rules allow the owner and nobody else (read, never published)', () => {
    const targaryen = require('targaryen');
    const rules = require('./database.rules.json');
    const data = { tournaments: { RT1: { name: 'x', ownerUid: OWNER.uid, teams: { team1: { num: 1, name: 'E', players: ['a'], handicap: 0 }, team2: { num: 2, name: 'T', players: ['b'], handicap: 0 } } } } };
    const as = (uid) => targaryen.database(rules, data).as(uid ? { uid, provider: 'password', token: { firebase: { sign_in_provider: 'password' } } } : null);
    test('owner may remove teams/team2', () => { assert.equal(as(OWNER.uid).write('/tournaments/RT1/teams/team2', null).allowed, true); });
    test('a stranger and an anonymous visitor may not', () => {
        assert.equal(as('u-who').write('/tournaments/RT1/teams/team2', null).allowed, false);
        assert.equal(as(null).write('/tournaments/RT1/teams/team2', null).allowed, false);
    });
});
