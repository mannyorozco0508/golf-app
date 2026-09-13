// ============================================================================
// THE SETUP TAB RENDERS EVERY LIST THE RECORD IMPLIES - counted, per section.
//
// WHY THIS FILE EXISTS. 7d5866d moved the "Team Scorecard Links" block onto the
// Leaderboard tab so a signed-out visitor could still send a team its card.
// That block's rows were ALSO the Setup tab's per-team cards - the team name,
// its golfers, the shotgun hole badge and the editable Team Handicap input all
// lived in the same <div class="team-link-row"> that renderTeamLinks() wrote
// into #team-links-list. Moving the container moved the cards: the owner of a
// live tournament opened Setup and found nothing between Flights and "Add
// Another Team", while the public Leaderboard tab gained an editable handicap
// input. Measured on golf-app-5a5.pages.dev after v109.
//
// It shipped because the gate tests asserted the Setup tab's PRESENCE and
// nothing asserted its CONTENTS. This file closes that: for each shape of
// record it counts what each Setup section renders against the record, the
// way a starter counts carts - one row per team, one per flight, one per
// golfer, one per group - and pins which controls are editable and where.
// Structural: rows are counted by their onchange/onclick handlers and ids, not
// by matching sentences.
//
// Reached the way the page is reached: sb.loadTournament(code) registers the
// page's own value handler and the test fires it with the fixture, signed in
// as the owner through the harness auth stub.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const ORGANIZER = { uid: 'u-org', email: 'org@example.com' };

function teamRecord(overrides) {
    return Object.assign({
        name: 'Inventory Scramble', format: 'scramble', courseName: 'Cameron', activeCourseKey: 'cameron',
        courseData: COURSE, entryFee: 0, createdAt: 1, ownerUid: 'u-org', startType: 'shotgun',
        teams: {
            team1: { num: 1, name: 'Eagles', players: ['Ann Alpha', 'Bo Bravo'], handicap: 3, startingHole: '1' },
            team2: { num: 2, name: 'Hawks', players: ['Cal Charlie', 'Dee Delta'], handicap: 0, startingHole: '2' },
            team3: { num: 3, name: 'Owls', players: ['Ed Echo'], handicap: 7, startingHole: '' }
        },
        flights: { champ: { id: 'champ', name: 'Championship', createdAt: 1 }, aflight: { id: 'aflight', name: 'A Flight', createdAt: 2 } },
        scores: { team1_h1: 4 }
    }, overrides || {});
}
function individualRecord(overrides) {
    const players = {};
    ['Ann Alpha', 'Bo Bravo', 'Cal Charlie', 'Dee Delta', 'Ed Echo'].forEach((n, i) => { players['p' + i] = { id: 'p' + i, name: n, handicap: String(i), addedAt: i }; });
    return Object.assign({
        name: 'Inventory Individual', format: 'individual', scoringModel: 'player-v1', scoringMode: 'gross',
        courseName: 'Cameron', activeCourseKey: 'cameron', courseData: COURSE, entryFee: 0, createdAt: 1, ownerUid: 'u-org',
        teams: {}, players,
        scoringGroups: {
            g1: { id: 'g1', name: 'Group 1', playerIds: ['p0', 'p1', 'p2'], startingHole: '1', createdAt: 10 },
            g2: { id: 'g2', name: 'Group 2', playerIds: ['p3'], startingHole: '', createdAt: 20 }
        }
    }, overrides || {});
}

function arrive(rec, user = ORGANIZER) {
    const sb = loadHtmlInlineScript('tournament.html', [], { search: '?tourney=INV1' });
    sb.__auth.setUser(user);
    const handlers = sb.__dbHandlers.filter(h => h.event === 'value' && /tournaments\/INV1$/.test(h.path));
    assert.ok(handlers.length > 0, 'no value handler registered');
    handlers.forEach(h => h.cb({ val: () => JSON.parse(JSON.stringify(rec)), exists: () => true }));
    return sb;
}
const html = (sb, id) => { const el = sb.document.getElementById(id); return el ? String(el.innerHTML || '') : null; };
const count = (s, re) => (s.match(re) || []).length;

// ===========================================================================
describe('TEAM MODE - the Setup tab, signed in as the owner', () => {

    test('one team card per team, in the Setup panel, each with its name, golfers and an editable handicap', () => {
        const sb = arrive(teamRecord());
        const cards = html(sb, 'team-cards-list');
        assert.ok(cards !== null, 'the Setup tab has a #team-cards-list');
        assert.equal(count(cards, /onchange="updateTeamHandicap\((1|2|3), this\.value\)"/g), 3,
            'exactly one editable handicap per team, wired to updateTeamHandicap(num)');
        // The label once per team. (The name also rides in the Share button's
        // onclick argument, as it always has, so a bare count would read two.)
        ['Eagles', 'Hawks', 'Owls'].forEach(n => assert.equal(count(cards, new RegExp('🏌️ ' + n, 'g')), 1, n + ' labelled once'));
        ['Ann Alpha', 'Bo Bravo', 'Cal Charlie', 'Dee Delta', 'Ed Echo'].forEach(n => assert.ok(cards.includes(n), n + ' listed on a card'));
        assert.ok(/value="3"/.test(cards) && /value="7"/.test(cards), 'the stored handicaps are the inputs\' values');
    });

    test('the team cards live INSIDE the Setup panel, so they go with the gate', () => {
        const src = require('fs').readFileSync(require('path').join(__dirname, 'tournament.html'), 'utf8');
        const a = src.indexOf('<div id="manage-tab-setup">');
        const b = src.indexOf('<div id="manage-tab-leaderboard"');
        assert.ok(a > 0 && b > a);
        assert.ok(/id="team-cards-list"/.test(src.slice(a, b)), '#team-cards-list must sit inside #manage-tab-setup');
        assert.ok(!/id="team-cards-list"/.test(src.slice(b)), 'and nowhere else');
    });

    test('the shotgun hole badge shows on the card of every team that has a hole', () => {
        const sb = arrive(teamRecord());
        const cards = html(sb, 'team-cards-list');
        assert.equal(count(cards, /Hole 1\b/g), 1);
        assert.equal(count(cards, /Hole 2\b/g), 1);
        assert.equal(count(cards, /🚀 Hole/g), 2, 'two teams have a hole, one does not');
    });

    test('the shotgun assignment list has one starting-hole input per team', () => {
        const sb = arrive(teamRecord());
        const s = html(sb, 'shotgun-assignments-list');
        assert.equal(count(s, /onchange="updateTeamStartingHole\((1|2|3), this\.value\)"/g), 3);
    });

    test('the flights list has one row per flight and the assignment list one select per team', () => {
        const sb = arrive(teamRecord());
        assert.equal(count(html(sb, 'flights-list'), /onchange="renameFlight\('(champ|aflight)'/g), 2);
        assert.equal(count(html(sb, 'flight-assign-list'), /onchange="assignTeamToFlight\('team(1|2|3)'/g), 3);
    });

    test('the Leaderboard tab\'s scoring-link block is links only: one Share per team, NO editable control', () => {
        const sb = arrive(teamRecord(), null);   // signed out - the public view
        const links = html(sb, 'team-links-list');
        assert.equal(count(links, /onclick="openShareModal\(/g), 3, 'one Share button per team');
        ['team=1', 'team=2', 'team=3'].forEach(q => assert.ok(links.includes(q), q + ' link present'));
        assert.equal(count(links, /<input\b/g), 0, 'an editable control on the public tab is the leak this file exists to catch');
        assert.ok(!/updateTeamHandicap/.test(links), 'no handicap editor on the public tab');
    });

    test('the two team renderers share one row builder - the card is the link row plus the editor, not a second copy', () => {
        // CLAUDE.md: two entry points means one builder. Both lists must be built
        // by the same function, with an option, or the next move drifts them.
        const src = require('fs').readFileSync(require('path').join(__dirname, 'tournament.html'), 'utf8');
        assert.equal(count(src, /function teamRowHtml\(/g), 1, 'one row builder');
        const cardsFn = src.slice(src.indexOf('function renderTeamCards('), src.indexOf('\n    function ', src.indexOf('function renderTeamCards(') + 30));
        const linksFn = src.slice(src.indexOf('function renderTeamLinks('), src.indexOf('\n    function ', src.indexOf('function renderTeamLinks(') + 30));
        assert.ok(/teamRowHtml\(/.test(cardsFn) && /teamRowHtml\(/.test(linksFn), 'both renderers call it');
        assert.ok(!/team-link-row/.test(cardsFn) && !/team-link-row/.test(linksFn), 'neither writes the row markup itself');
    });
});

// ===========================================================================
describe('INDIVIDUAL MODE - the Setup tab, signed in as the owner', () => {

    test('the player field lists one row per golfer with an editable name and handicap', () => {
        const sb = arrive(individualRecord());
        const field = html(sb, 'player-field-list');
        assert.ok(field !== null && field.length > 0, 'the player field rendered');
        assert.equal(count(field, /onchange="updatePlayerName\('p[0-4]'/g), 5, 'one name editor per golfer');
        assert.equal(count(field, /onchange="updatePlayerHandicap\('p[0-4]'/g), 5, 'one handicap editor per golfer');
    });

    test('the scoring-group editor lists one row per group with its controls, and no link', () => {
        const sb = arrive(individualRecord());
        const editor = html(sb, 'scoring-groups-list');
        assert.equal(count(editor, /onchange="renameScoringGroup\('g[12]'/g), 2, 'one rename per group');
        assert.equal(count(editor, /onchange="setGroupStartingHole\('g[12]'/g), 2, 'one hole input per group');
        assert.equal(count(editor, /onchange="assignPlayerToGroup\('p[0-4]'/g), 5, 'one assignment select per golfer');
        assert.ok(!/Open scoring link/.test(editor), 'the link moved out; the editor does not carry a copy');
    });

    test('the Leaderboard tab\'s group-link block is links only: one link per group, NO editable control', () => {
        const sb = arrive(individualRecord(), null);
        const links = html(sb, 'group-links-list');
        assert.equal(count(links, /group=g[12]/g), 2);
        assert.equal(count(links, /<input\b|<select\b/g), 0, 'no editor on the public tab');
    });

    test('and no team card list renders in individual mode', () => {
        const sb = arrive(individualRecord());
        const cards = html(sb, 'team-cards-list');
        assert.ok(cards === null || !/updateTeamHandicap/.test(cards), 'an individual event has no teams to card');
    });
});
