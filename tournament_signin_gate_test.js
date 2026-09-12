// ============================================================================
// SIGN-IN ON tournament.html: WHO SEES THE SETUP TAB, AND WHO CAN CREATE.
//
// The decisions this file is built to (auth wave, step 2), not re-opened here:
//   1. Signed out on an OWNED tournament, the Setup & Links tab is NOT RENDERED -
//      not disabled, not greyed. Leaderboard, printing, the share links, theme
//      and navigation stay open exactly as today.
//   2. No organizer link this wave.
//   3. A LEGACY tournament (no ownerUid) behaves exactly as today, fully open.
//      The page branches on whether ownerUid exists. This is the grandfather
//      promise, pinned here so it cannot be broken later by accident.
//   4. An owned tournament's Setup tab renders only when auth.uid === ownerUid.
//      Signed in as somebody else is the same as signed out.
//   5. saveTournament requires a signed-in user and writes ownerUid in the same
//      .set() that creates the record. Signed out, creation is refused with a
//      clear message and nothing is written.
//   6. No rules change this wave.
//
// THE HONEST LIMIT, which the gate's own comment and HANDOFF repeat: this is a
// guardrail against the casual case - a golfer who followed a link into the
// console and tapped something - NOT a security boundary. database.rules.json
// still lets anyone holding the code write every child the Setup tab edits. A
// test here proves what the PAGE shows and does; it cannot prove the server
// refuses anything, because it does not. No UI string may imply a lock.
//
// HOW THE PAGE IS REACHED. The page's own arrival: sb.loadTournament(code)
// registers the value handler production registers; the test fires it through
// __dbHandlers with a fixture. Auth is the harness stub (helpers/load-script.js):
// firebase.auth().onAuthStateChanged is captured and sb.__auth.setUser(user)
// fires it, so the two orders a browser produces - auth known before the record
// arrives, and after - are both driven.
//
// WHAT MINI-DOM CAN AND CANNOT SEE. Static markup is not parsed into a tree, so
// "the tab is present" for an untouched page is a registry element, and "the tab
// is absent" is measurable only because helpers/mini-dom.js now answers null
// from getElementById after element.remove() - the browser's answer. Layout
// (the tab is 0x0 or off screen) is not measured here; tools/tournament-signin-
// gate-check.js is the Chrome half.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const PAGE = 'tournament.html';
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
function record(overrides) {
    return Object.assign({
        name: 'Gate Scramble', format: 'scramble', courseName: 'Cameron',
        activeCourseKey: 'cameron', courseData: COURSE, entryFee: 0, createdAt: 1,
        teams: {
            team1: { num: 1, name: 'Eagles', players: ['Ann Alpha', 'Bo Bravo'], handicap: 0 },
            team2: { num: 2, name: 'Hawks', players: ['Cal Charlie', 'Dee Delta'], handicap: 0 }
        },
        scores: { team1_h1: 4, team2_h1: 5 }
    }, overrides || {});
}
const OWNED = () => record({ ownerUid: 'u-org' });
const LEGACY = () => record();
const ORGANIZER = { uid: 'u-org', email: 'org@example.com' };
const STRANGER = { uid: 'u-other', email: 'other@example.com' };

// Arrive on ?tourney=GATE1 with the record, with the auth user set either
// before the record lands (user first) or after (record first).
function arrive(rec, user, order = 'user-first') {
    const sb = loadHtmlInlineScript(PAGE, [], { search: '?tourney=GATE1' });
    if (order === 'user-first') sb.__auth.setUser(user);
    const handlers = sb.__dbHandlers.filter(h => h.event === 'value' && /tournaments\/GATE1$/.test(h.path));
    assert.ok(handlers.length > 0, 'the page registered no value handler for the tournament');
    handlers.forEach(h => h.cb({ val: () => JSON.parse(JSON.stringify(rec)), exists: () => true }));
    if (order === 'record-first') sb.__auth.setUser(user);
    return sb;
}
const setupTab = (sb) => sb.document.getElementById('tab-btn-setup');
// Rendered text: mini-dom's textContent is a plain property, so text appended as
// nodes lives on the children. Walk them, the way innerText would read.
const textOf = (el) => !el ? '' : (el.textContent || '') + el.children.map(textOf).join('');
const setupPanel = (sb) => sb.document.getElementById('manage-tab-setup');
const leaderboardTab = (sb) => sb.document.getElementById('tab-btn-leaderboard');

// ===========================================================================
describe('a) SIGNED OUT on an OWNED tournament: the Setup tab is not rendered; everything else is', () => {

    ['user-first', 'record-first'].forEach(order => {
        test(`the Setup tab and its panel are absent from the DOM (${order})`, () => {
            const sb = arrive(OWNED(), null, order);
            assert.equal(setupTab(sb), null, 'tab-btn-setup must be removed, not hidden or disabled');
            assert.equal(setupPanel(sb), null, 'manage-tab-setup must be removed - its controls must not exist');
            assert.ok(leaderboardTab(sb), 'the Leaderboard tab stays');
        });
    });

    test('showTab("setup") cannot bring it back and does not throw', () => {
        const sb = arrive(OWNED(), null);
        assert.doesNotThrow(() => sb.showTab('setup'));
        assert.equal(setupTab(sb), null);
        assert.equal(setupPanel(sb), null);
    });

    test('the leaderboard still renders', () => {
        const sb = arrive(OWNED(), null);
        sb.showTab('leaderboard');
        const list = sb.document.getElementById('leaderboard-list');
        assert.ok(list && /Eagles/.test(list.innerHTML) && /Hawks/.test(list.innerHTML), 'the board must list the teams');
    });

    test('printing still works signed out - the pairings sheet builds', () => {
        const sb = arrive(OWNED(), null);
        let printed = 0; sb.print = () => { printed++; }; sb.addEventListener = () => {};
        sb.printTournamentPairings();
        assert.equal(printed, 1, 'window.print must be reached');
        const sheet = sb.document.getElementById('tournament-print-view');
        assert.ok(/Ann Alpha/.test(sheet.innerHTML) && /Dee Delta/.test(sheet.innerHTML));
    });

    test('the print buttons and the scoring links do NOT live inside the Setup panel', () => {
        // Otherwise "the Setup tab is not rendered" would also remove printing and
        // sharing, which decision 1 keeps open. Structural: the markup between
        // <div id="manage-tab-setup"> and the next top-level panel must not hold them.
        const src = read(PAGE);
        const a = src.indexOf('<div id="manage-tab-setup">');
        const b = src.indexOf('<div id="manage-tab-leaderboard"');
        assert.ok(a > 0 && b > a, 'both manage panels exist');
        const setup = src.slice(a, b);
        assert.ok(!/printTournamentResults\(\)|printTournamentPairings\(\)/.test(setup),
            'the print buttons are inside the Setup panel and vanish with it');
        assert.ok(!/id="team-links-list"/.test(setup),
            'the scoring-link list is inside the Setup panel and vanishes with it');
    });

    test('the scoring links still render signed out', () => {
        const sb = arrive(OWNED(), null);
        const links = sb.document.getElementById('team-links-list');
        assert.ok(links, 'team-links-list must exist for a signed-out visitor');
        assert.ok(/team=1/.test(links.innerHTML) && /team=2/.test(links.innerHTML), 'both scoring links render');
    });

    test('no UI string implies a lock', () => {
        // Markup only: scripts and HTML comments are not UI.
        const src = read(PAGE).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '');
        assert.ok(!/\b(Protected|Secure|Locked|Private)\b/.test(src),
            'the gate is a guardrail, not a boundary - the words must not promise one');
    });
});

// ---------------------------------------------------------------------------
// INDIVIDUAL MODE: the group scoring LINKS live on the Leaderboard tab; the
// group EDITOR stays in Setup and goes with it. A multi-round event lists every
// round's groups from the record - the editor shows one round at a time, by
// editingRoundId, which a signed-out visitor never has.
// ---------------------------------------------------------------------------
function individualRecord(overrides) {
    const players = {};
    ['Ann Alpha', 'Bo Bravo', 'Cal Charlie', 'Dee Delta'].forEach((n, i) => { players['p' + i] = { id: 'p' + i, name: n, handicap: '0', addedAt: i }; });
    return Object.assign({
        name: 'Gate Individual', format: 'individual', scoringModel: 'player-v1', scoringMode: 'gross',
        courseName: 'Cameron', activeCourseKey: 'cameron', courseData: COURSE, entryFee: 0, createdAt: 1,
        teams: {}, players,
        scoringGroups: {
            g1: { id: 'g1', name: 'Group 1', playerIds: ['p0', 'p1'], startingHole: '1', createdAt: 10 },
            g2: { id: 'g2', name: 'Group 2', playerIds: ['p2', 'p3'], startingHole: '2', createdAt: 20 }
        }
    }, overrides || {});
}
function multiRoundIndividual(overrides) {
    const rec = individualRecord();
    const r1 = rec.scoringGroups; delete rec.scoringGroups;
    return Object.assign(rec, {
        eventModel: 'round-v1',
        rounds: {
            r1: { id: 'r1', name: 'Saturday', status: 'setup', createdAt: 100, format: 'individual', scoringMode: 'gross', courseName: 'Cameron', courseData: COURSE, scoringGroups: r1, scores: {} },
            r2: { id: 'r2', name: 'Sunday', status: 'setup', createdAt: 200, format: 'individual', scoringMode: 'gross', courseName: 'Cameron', courseData: COURSE,
                  scoringGroups: { h1: { id: 'h1', name: 'Sunday A', playerIds: ['p0', 'p2'], startingHole: '3', createdAt: 30 } }, scores: {} }
        }
    }, overrides || {});
}
const groupLinks = (sb) => sb.document.getElementById('group-links-list');
const EDITOR_HANDLERS = /renameScoringGroup|deleteScoringGroup|assignPlayerToGroup|setGroupStartingHole|createScoringGroup/;

describe('a2) INDIVIDUAL MODE: the group scoring links are rendered for everyone; the editor is not', () => {

    test('owned, signed out: both group links render, and no editor control is among them', () => {
        const sb = arrive(individualRecord({ ownerUid: 'u-org' }), null);
        const html = groupLinks(sb).innerHTML;
        assert.ok(/group=g1/.test(html) && /group=g2/.test(html), 'both group links: ' + html.slice(0, 200));
        assert.ok(/Ann Alpha/.test(html) && /Dee Delta/.test(html), 'each link names its golfers');
        assert.ok(!EDITOR_HANDLERS.test(html), 'the editor must not ride along with the links');
        assert.equal(setupPanel(sb), null, 'and the Setup panel - the editor - is gone');
    });

    test('legacy individual, signed out: the links render AND the editor is still there', () => {
        const sb = arrive(individualRecord(), null);
        assert.ok(/group=g1/.test(groupLinks(sb).innerHTML));
        assert.ok(setupPanel(sb), 'legacy keeps its Setup panel');
        assert.ok(EDITOR_HANDLERS.test(sb.document.getElementById('scoring-groups-list').innerHTML),
            'the editor still renders its controls on a legacy tournament');
    });

    test('the editor rows no longer carry the link - it lives in one place', () => {
        const sb = arrive(individualRecord(), null);
        assert.ok(!/Open scoring link/.test(sb.document.getElementById('scoring-groups-list').innerHTML),
            'the link line must not be duplicated inside the editor');
    });

    test('multi-round individual, owned, signed out: every round\'s groups, labelled by round, with no editing state', () => {
        const sb = arrive(multiRoundIndividual({ ownerUid: 'u-org' }), null);
        const html = groupLinks(sb).innerHTML;
        assert.ok(/group=g1&round=r1/.test(html) && /group=g2&round=r1/.test(html), 'Saturday\'s links');
        assert.ok(/group=h1&round=r2/.test(html), 'Sunday\'s link');
        assert.ok(/Saturday/.test(html) && /Sunday/.test(html), 'labelled by round');
        assert.equal(sb.editingRoundId, undefined, 'no editor state is involved - the block reads the record');
    });

    test('a team tournament shows no group block', () => {
        const sb = arrive(OWNED(), null);
        const block = sb.document.getElementById('group-links-block');
        assert.equal(block.style.display, 'none');
    });
});

// ===========================================================================
describe('b) SIGNED IN AS THE OWNER: the Setup tab is present and its controls write', () => {

    ['user-first', 'record-first'].forEach(order => {
        test(`tab and panel present (${order})`, () => {
            const sb = arrive(OWNED(), ORGANIZER, order);
            assert.ok(setupTab(sb), 'tab-btn-setup must be present for the owner');
            assert.ok(setupPanel(sb), 'manage-tab-setup must be present for the owner');
        });
    });

    test('a Setup control writes to the record', () => {
        const sb = arrive(OWNED(), ORGANIZER);
        sb.updateTeamHandicap(1, '5');
        const w = sb.__dbWrites.find(x => x.path === 'tournaments/GATE1/teams/team1/handicap');
        assert.ok(w && w.op === 'set' && w.value === 5, 'the handicap write must reach the database: ' + JSON.stringify(sb.__dbWrites.slice(-3)));
    });

    test('the page says who is signed in, as a fact, not as a lock', () => {
        const sb = arrive(OWNED(), ORGANIZER);
        const who = sb.document.getElementById('signed-in-as');
        assert.ok(who && /Signed in as org@example\.com/.test(textOf(who)),
            'a "Signed in as <email>" line must render for the owner');
    });
});

// ===========================================================================
describe('c) SIGNED IN AS A NON-OWNER of an owned tournament: same as signed out', () => {

    ['user-first', 'record-first'].forEach(order => {
        test(`the Setup tab is absent (${order})`, () => {
            const sb = arrive(OWNED(), STRANGER, order);
            assert.equal(setupTab(sb), null, 'auth != null is not enough; auth.uid must equal ownerUid');
            assert.equal(setupPanel(sb), null);
            assert.ok(leaderboardTab(sb));
        });
    });
});

// ===========================================================================
describe('d) LEGACY tournament (no ownerUid), signed out: exactly as today - THE GRANDFATHER PROMISE', () => {

    test('the Setup tab and panel are present', () => {
        const sb = arrive(LEGACY(), null);
        assert.ok(setupTab(sb), 'a legacy tournament must keep its Setup tab for everyone');
        assert.ok(setupPanel(sb));
    });

    test('a Setup control still writes', () => {
        const sb = arrive(LEGACY(), null);
        sb.updateTeamHandicap(2, '3');
        const w = sb.__dbWrites.find(x => x.path === 'tournaments/GATE1/teams/team2/handicap');
        assert.ok(w && w.value === 3, 'legacy tournaments are fully open, as today');
    });

    test('and signed in as anybody, still present - a legacy tournament is not claimed by signing in', () => {
        const sb = arrive(LEGACY(), STRANGER);
        assert.ok(setupTab(sb));
        assert.ok(!sb.__dbWrites.some(x => /ownerUid/.test(x.path) || (x.value && x.value.ownerUid)),
            'no claim path this wave: nothing may write ownerUid onto a legacy record');
    });
});

// ===========================================================================
describe('e) and f) CREATING a tournament', () => {

    // A valid setup, built from real nodes: mini-dom parses no innerHTML, so the
    // team card the page builds with innerHTML has no readable inputs. The card
    // here is what the page's own addTeam() produces, as nodes.
    function fillSetup(sb) {
        const d = sb.document;
        d.getElementById('t-name').value = 'Created Scramble';
        sb.pickCourse('cameron', 'Cameron');
        const list = d.getElementById('teams-list');
        d.body.appendChild(list);
        const card = d.createElement('div'); card.className = 'team-card';
        const name = d.createElement('input'); name.className = 'team-name-input'; name.value = 'Eagles';
        const names = d.createElement('div'); names.className = 'team-name-inputs';
        ['Ann Alpha', 'Bo Bravo'].forEach(n => { const i = d.createElement('input'); i.value = n; names.appendChild(i); });
        const hcp = d.createElement('input'); hcp.className = 'team-handicap-input'; hcp.value = '0';
        card.appendChild(name); card.appendChild(names); card.appendChild(hcp);
        list.appendChild(card);
    }
    const tournamentSets = (sb) => sb.__dbWrites.filter(x => /^tournaments\/[A-Z0-9]+$/.test(x.path) && x.op === 'set');

    test('e) SIGNED OUT: refused with a clear message, nothing written', async () => {
        const sb = loadHtmlInlineScript(PAGE);
        const alerts = []; sb.alert = (m) => alerts.push(String(m));
        fillSetup(sb);
        await sb.saveTournament();
        await new Promise(r => setImmediate(r));
        assert.equal(tournamentSets(sb).length, 0, 'a signed-out save must write nothing: ' + JSON.stringify(sb.__dbWrites));
        assert.ok(alerts.some(m => /sign/i.test(m)), 'the refusal must say sign-in is needed: ' + JSON.stringify(alerts));
        assert.ok(!alerts.some(m => /Protected|Secure|Locked/.test(m)), 'and must not promise a lock');
    });

    test('f) SIGNED IN: the record is created with ownerUid === auth.uid, in the same set()', async () => {
        const sb = loadHtmlInlineScript(PAGE);
        sb.__auth.setUser(ORGANIZER);
        fillSetup(sb);
        await sb.saveTournament();
        await new Promise(r => setImmediate(r));
        const sets = tournamentSets(sb);
        assert.equal(sets.length, 1, 'exactly one creating set: ' + JSON.stringify(sb.__dbWrites.map(w => w.path)));
        assert.equal(sets[0].value.ownerUid, 'u-org', 'ownerUid must be the signed-in uid, written with the record');
        assert.equal(sets[0].value.name, 'Created Scramble');
        assert.ok(sets[0].value.teams && sets[0].value.teams.team1, 'the rest of the payload is unchanged');
    });
});

// ===========================================================================
describe('g) tournament-scorecard.html: no auth SDK, no sign-in, no change', () => {

    test('the scorecard loads no auth SDK and calls no auth API', () => {
        const src = read('tournament-scorecard.html');
        assert.ok(!/firebase-auth-compat/.test(src), 'the scorecard must not download the sign-in SDK');
        assert.ok(!/firebase\.auth\(/.test(src), 'the scorecard must not call firebase.auth()');
        assert.ok(!/onAuthStateChanged|signInWith|signOut/.test(src));
    });

    test('loaded, the scorecard registers no auth listener', () => {
        const sb = loadHtmlInlineScript('tournament-scorecard.html', [], { search: '?tourney=GATE1&team=1' });
        assert.equal(sb.__auth.listeners.length, 0, 'a golfer on a tee box never sees a sign-in');
    });
});
