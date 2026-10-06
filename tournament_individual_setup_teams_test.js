// ============================================================================
// AN INDIVIDUAL EVENT'S SETUP TAB SHOWS NO TEAMS BLOCK
// (Tournaments Wave 1 follow-up, phone QA 2026-10-06)
//
// On an individual event only #team-cards-list was hidden. The "🏌️ Teams"
// heading, its sentence ("Each team, its golfers and its handicap") and the
// "Add Another Team" button and panel stayed on Setup, over an event that has
// players and no teams. Now the whole block is #setup-teams-block and hides
// with the format - in the tree, never removed (the f0fa56f rule). Nothing it
// holds is read by scoring; no engine change.
//
// NOT DONE HERE, ON PURPOSE: the CREATE form's team blocks. On an individual
// event they are the input surface for golfer names (saveTournament turns
// every name typed into a player record), so hiding them would break creating
// an individual event. That needs its own golfer-entry surface - deferred.
//
// BASELINE over the FINISHED file, all 3 tests: measured against 30a1595,
// tournament.html as committed there:
//
//   1 PASS / 2 FAIL / 3 tests.   1 + 2 = 3.
//
// THE ONE THAT PASSES is "a team event still shows it" - true on the base,
// where nothing hid it for anyone.
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

const SRC = fs.readFileSync('tournament.html', 'utf8');
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
function arrive(individual) {
    const r = individual
        ? { name: 'Medal', format: 'individual', scoringModel: 'player-v1', courseName: 'C', courseData: COURSE, createdAt: 1, ownerUid: OWNER.uid,
            players: { p1: { id: 'p1', name: 'Ann', handicap: '4' } } }
        : { name: 'Scramble', format: 'scramble', courseName: 'C', courseData: COURSE, createdAt: 1, ownerUid: OWNER.uid,
            teams: { team1: { num: 1, name: 'Eagles', players: ['Ann'], handicap: 0 } } };
    const sb = loadHtmlInlineScript('tournament.html', [], { search: '?tourney=IND1' });
    sb.__dbHandlers.filter((x) => x.event === 'value' && /tournaments\/IND1$/.test(x.path))
        .forEach((x) => x.cb({ val: () => r, exists: () => true }));
    sb.__auth.setUser(OWNER);
    return sb;
}

test('the block holds the heading, the card list and the Add Another Team panel', () => {
    const a = SRC.indexOf('<div id="setup-teams-block">');
    assert.ok(a > 0, 'no #setup-teams-block in the markup');
    const end = SRC.indexOf('🧳 Link to a Trip', a);
    const block = SRC.slice(a, end);
    ['🏌️ Teams', 'id="team-cards-list"', 'showAddTeamPanel()', 'id="add-team-panel"'].forEach((k) =>
        assert.ok(block.includes(k), 'the block does not hold ' + k));
});

test('individual event, owner on Setup: the block is hidden', () => {
    const sb = arrive(true);
    assert.equal(sb.document.getElementById('setup-teams-block').style.display, 'none');
});

test('a team event still shows it', () => {
    const sb = arrive(false);
    assert.notEqual(sb.document.getElementById('setup-teams-block').style.display, 'none');
    assert.match(String(sb.document.getElementById('team-cards-list').innerHTML), /Eagles/, 'the team cards did not render');
});
