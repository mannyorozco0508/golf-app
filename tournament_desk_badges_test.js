// ============================================================================
// DESK STATE BADGES (polish wave item 3, 2026-09-18): a row reads its state
// at a glance - Unpaid / Paid, In the field, and NEEDS A TEAM - and a sixth
// chip filters to the golfers who need one.
//
// BEFORE: Paid was an unlabelled checkbox state; Approved was the words "In
// the field" in plain muted text; and a golfer approved with no destination
// became a one-player team named "Team N" (approveRegistration :2593-2606)
// that looked exactly like a finished foursome everywhere - the desk said "In
// the field" and nothing more.
//
// "NEEDS A TEAM", DERIVED AND NARROWED (definition (a), narrowed): the entry
// is in the field on a TEAM event, its teamNum names a team with exactly one
// golfer, AND that team's name is the default /^Team \d+$/. A one-golfer team
// the organizer NAMED (the Hawks in the fixture) is a team of one on purpose
// and does not need one. Nothing is stored: no key on the signup (the rules'
// $other is false there - a publish), no marker on the team. regNeedsTeam()
// reads currentData.teams.
//
// INDIVIDUAL EVENTS have players, not teams: no "needs a team" badge and no
// chip there - a badge that cannot be true is not rendered (HANDOFF says so).
//
// THE TWO PINS STAND: "In the field" is still the approved row's words, once
// per row (tournament_desk_2c_test.js:298, tools/tournament-desk-check.js:135);
// the words became the badge, the Needs-a-team badge sits beside them. No
// rename / move on the desk this wave (3-E declined): Setup is where a
// singleton is fixed.
//
// HARNESS. mini-dom: innerHTML is a string, so rows are counted by class in
// the markup; the 390-px rects and the four distinct badge colours are
// Chrome's (tools/tournament-desk-check.js, the OWNED2 arrival).
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { deskEntries, deskTeams, TOTALS } = require('./helpers/registration-desk-fixture.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const SRC = read('tournament.html');
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const ORGANIZER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };

function teamRecord(teams) {
    return { name: 'Desk Scramble', format: 'scramble', courseName: 'Cameron', activeCourseKey: 'cameron', courseData: COURSE, entryFee: 400, createdAt: 1, ownerUid: 'u-org', teams: teams || deskTeams() };
}
function individualRecord() {
    return { name: 'Desk Individual', format: 'individual', scoringModel: 'player-v1', scoringMode: 'net', courseName: 'Cameron', activeCourseKey: 'cameron', courseData: COURSE, entryFee: 100, createdAt: 1, ownerUid: 'u-org', teams: {}, players: {} };
}
function arrive(rec, regs) {
    const sb = loadHtmlInlineScript('tournament.html', [], { search: '?tourney=DESK1' });
    sb.__auth.setUser(ORGANIZER);
    sb.__dbHandlers.filter((h) => h.event === 'value' && /tournaments\/DESK1$/.test(h.path)).forEach((h) => h.cb({ val: () => JSON.parse(JSON.stringify(rec)), exists: () => true }));
    sb.__dbHandlers.filter((h) => h.event === 'value' && /registrations\/DESK1$/.test(h.path)).forEach((h) => h.cb({ val: () => JSON.parse(JSON.stringify(regs)), exists: () => true }));
    return sb;
}
const html = (sb, id) => String((sb.document.getElementById(id) || {}).innerHTML || '');
const count = (s, re) => (String(s || '').match(re) || []).length;
const rowOf = (list, id) => { const a = list.indexOf('data-entry-id="' + id + '"'); const b = list.indexOf('class="reg-row"', a + 1); return list.slice(a, b > 0 ? b : undefined); };

describe('1. THE FIXTURE has a real singleton-from-approval record', () => {
    test('e130 sits on "Team 3" (one golfer, default name); e120 on the Hawks (one golfer, named); the rest on the Eagles', () => {
        const e = deskEntries('team'), t = deskTeams();
        assert.equal(e.e130.teamNum, 3); assert.equal(t.team3.name, 'Team 3'); assert.deepEqual(t.team3.players, [e.e130.fullName]);
        assert.equal(e.e120.teamNum, 2); assert.equal(t.team2.name, 'Hawks'); assert.equal(t.team2.players.length, 1);
        assert.equal(Object.values(e).filter((x) => x.teamNum === 1).length, 12);
        assert.equal(Object.values(e).filter((x) => x.teamNum).length, TOTALS.inField);
        assert.equal(TOTALS.needsTeam, 1);
    });
});

describe('2. regNeedsTeam - derived, narrowed', () => {
    test('true only for an in-field entry on a one-golfer team with the default name', () => {
        const sb = arrive(teamRecord(), deskEntries('team'));
        const e = deskEntries('team');
        assert.equal(sb.regNeedsTeam(e.e130), true, 'Team 3, one golfer, default name');
        assert.equal(sb.regNeedsTeam(e.e120), false, 'the Hawks: a named team of one is on purpose');
        assert.equal(sb.regNeedsTeam(e.e000), false, 'the Eagles have two');
        assert.equal(sb.regNeedsTeam(e.e001), false, 'not in the field');
        assert.equal(sb.regNeedsTeam({ approvedAt: 1, teamNum: 9 }), false, 'a team that does not exist');
        assert.equal(sb.regNeedsTeam(null), false);
    });
    test('the default-name test is /^Team \\d+$/ exactly: "Team 3" yes, "Team 3 " and "team 3" and "The Team 3" no', () => {
        const t = deskTeams();
        t.team4 = { num: 4, name: 'Team 3 ', players: ['x'], handicap: 0 };
        t.team5 = { num: 5, name: 'team 5', players: ['y'], handicap: 0 };
        t.team6 = { num: 6, name: 'The Team 6', players: ['z'], handicap: 0 };
        t.team7 = { num: 7, name: '', players: ['w'], handicap: 0 };
        const sb = arrive(teamRecord(t), {});
        assert.equal(sb.regNeedsTeam({ approvedAt: 1, teamNum: 4 }), false);
        assert.equal(sb.regNeedsTeam({ approvedAt: 1, teamNum: 5 }), false);
        assert.equal(sb.regNeedsTeam({ approvedAt: 1, teamNum: 6 }), false);
        assert.equal(sb.regNeedsTeam({ approvedAt: 1, teamNum: 7 }), true, 'no name at all renders as "Team 7" everywhere - the default');
    });
    test('never on an individual event', () => {
        const sb = arrive(individualRecord(), deskEntries('individual'));
        const e = deskEntries('individual');
        assert.equal(sb.regNeedsTeam(e.e130), false);
    });
});

describe('3. THE ROWS - a badge per state, the words "In the field" once per approved row', () => {
    test('142 signups: 72 Unpaid badges, 70 Paid badges, 14 In-the-field badges, 1 Needs-a-team badge', () => {
        const sb = arrive(teamRecord(), deskEntries('team'));
        const list = html(sb, 'registration-list');
        assert.equal(count(list, /class="reg-row"/g), TOTALS.entries);
        assert.equal(count(list, /reg-state-unpaid/g), TOTALS.unpaid);
        assert.equal(count(list, /reg-state-paid/g), TOTALS.paid);
        assert.equal(count(list, /reg-state-field/g), TOTALS.inField);
        assert.equal(count(list, /reg-state-needs/g), TOTALS.needsTeam);
        assert.equal(count(list, /In the field/g), TOTALS.inField, 'the pinned words, once per approved row - the badge IS the words');
        assert.equal(count(list, /Needs a team/g), TOTALS.needsTeam);
        assert.equal(count(list, /Approve into field/g), TOTALS.pending, 'the Approve button is unchanged');
    });
    test('e130 carries Paid + In the field + Needs a team; e120 (Hawks) carries no Needs badge; e001 carries Unpaid and the Approve button', () => {
        const sb = arrive(teamRecord(), deskEntries('team'));
        const list = html(sb, 'registration-list');
        const r130 = rowOf(list, 'e130'), r120 = rowOf(list, 'e120'), r001 = rowOf(list, 'e001');
        assert.match(r130, /reg-state-paid/); assert.match(r130, /reg-state-field/); assert.match(r130, /reg-state-needs">Needs a team</);
        assert.match(r120, /reg-state-paid/); assert.match(r120, /reg-state-field/); assert.doesNotMatch(r120, /reg-state-needs/);
        assert.match(r001, /reg-state-unpaid">Unpaid</); assert.doesNotMatch(r001, /reg-state-field|reg-state-needs/); assert.match(r001, /Approve into field/);
        assert.match(r001, /type="checkbox"/, 'the Paid checkbox is still the control');
    });
    test('the Paid checkbox label keeps the word Paid, so the badge does not double it: the badge reads Paid / Unpaid, the label reads Paid', () => {
        const sb = arrive(teamRecord(), deskEntries('team'));
        const r = rowOf(html(sb, 'registration-list'), 'e000');
        assert.equal(count(r, /> Paid<\/label>/g), 1);
        assert.equal(count(r, /reg-state-paid">Paid</g), 1);
    });
    test('individual event: Unpaid / Paid / In the field badges, never Needs a team', () => {
        const sb = arrive(individualRecord(), deskEntries('individual'));
        const list = html(sb, 'registration-list');
        assert.equal(count(list, /reg-state-field/g), TOTALS.inField);
        assert.equal(count(list, /reg-state-needs|Needs a team/g), 0);
    });
});

describe('4. THE CHIPS AND THE COUNTS', () => {
    test('team event: a sixth chip "Needs a team 1", after the five; tapping it shows the one row', () => {
        const sb = arrive(teamRecord(), deskEntries('team'));
        const chips = html(sb, 'registration-chips');
        ['All 142', 'Unpaid 72', 'Paid 70', 'Approved 14', 'Not yet approved 128', 'Needs a team 1'].forEach((t) => assert.ok(chips.indexOf(t) > -1, 'chip missing: ' + t));
        assert.ok(chips.indexOf('Not yet approved 128') < chips.indexOf('Needs a team 1'), 'sixth, after the five');
        assert.match(chips, /setRegistrationFilter\('needsteam'\)/);
        sb.setRegistrationFilter('needsteam');
        const list = html(sb, 'registration-list');
        assert.equal(count(list, /class="reg-row"/g), 1);
        assert.match(list, /data-entry-id="e130"/);
    });
    test('the counts: the main line is unchanged; "1 needs a team" is its own line, only when > 0', () => {
        const sb = arrive(teamRecord(), deskEntries('team'));
        const c = html(sb, 'registration-counts');
        assert.match(c, /142 signups · 70 paid · 14 in the field<\/div>/, 'the main line ends where it did');
        assert.match(c, /<div class="reg-count-line reg-count-needs">1 needs a team<\/div>/);
        const none = deskTeams(); none.team3.name = 'Owls';
        const sb2 = arrive(teamRecord(none), deskEntries('team'));
        assert.doesNotMatch(html(sb2, 'registration-counts'), /needs a team/);
        assert.match(html(sb2, 'registration-chips'), /Needs a team 0/, 'the chip stays, at zero, on a team event');
    });
    test('individual event: no sixth chip, no needs line', () => {
        const sb = arrive(individualRecord(), deskEntries('individual'));
        assert.doesNotMatch(html(sb, 'registration-chips'), /Needs a team/);
        assert.doesNotMatch(html(sb, 'registration-counts'), /needs a team/);
        assert.equal(count(html(sb, 'registration-chips'), /reg-chip/g), 5);
    });
});

describe('5. THE SOURCE AND THE SEAMS', () => {
    test('four badge styles with four distinct backgrounds, readable on a phone (>= 0.72rem)', () => {
        const css = SRC.slice(SRC.indexOf('<style>'), SRC.indexOf('</style>'));
        assert.match(css, /\.reg-state\s*\{[^}]*font-size:\s*0\.7[2-9]rem/);
        const bg = (cls) => { const m = new RegExp('\\.reg-state-' + cls + '\\s*\\{([^}]*)\\}').exec(css); assert.ok(m, 'no .reg-state-' + cls); const b = /background:\s*([^;]+);/.exec(m[1]); assert.ok(b, cls + ' has no background'); return b[1].trim(); };
        const colours = ['unpaid', 'paid', 'field', 'needs'].map(bg);
        assert.equal(new Set(colours).size, 4, 'four distinct backgrounds: ' + colours.join(' / '));
    });
    test('regNeedsTeam is the one test, used by the row, the chip and the count', () => {
        assert.match(SRC, /function regNeedsTeam\(e\)/);
        const fn = SRC.slice(SRC.indexOf('function regNeedsTeam(e)'), SRC.indexOf('\n    }', SRC.indexOf('function regNeedsTeam(e)')));
        assert.match(fn, /\/\^Team \\d\+\$\//, 'the default-name narrowing');
        assert.match(fn, /players[^;]*length === 1/);
        assert.match(fn, /recordIsIndividual\(\)/);
        assert.ok(count(SRC, /regNeedsTeam\(/g) >= 4, 'row + chip + count + definition');
        assert.doesNotMatch(SRC, /db\.ref\([^)]*needsTeam|needsTeam: true|\/needsTeam/, 'nothing stored: no key on the signup, no marker on the team');
    });
    test('the Chrome desk check measures the badges at 390 px (the OWNED2 arrival)', () => {
        const t = read('tools/tournament-desk-check.js');
        assert.match(t, /OWNED2/);
        assert.match(t, /deskTeams\(\)/);
        assert.match(t, /scrollWidth/);
        assert.match(t, /reg-state-needs/);
    });
    test('HANDOFF records the badges, the narrowing, the individual-event exception and 3-E declined', () => {
        const h = read('HANDOFF.md');
        const at = h.indexOf('## Desk state badges');
        assert.ok(at > 0, 'no desk badges section');
        const s = h.slice(at, at + 6000);
        ['Needs a team', '/^Team \\d+$/', 'Hawks', 'Individual events', 'rename', 'Setup'].forEach((k) => assert.ok(s.indexOf(k) > -1, 'HANDOFF misses ' + k));
    });
});
