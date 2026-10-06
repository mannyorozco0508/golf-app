// ============================================================================
// AFTER APPROVE, THE DESK SAYS WHICH TEAM - AND STOPS SAYING "NEEDS A TEAM"
// (Tournaments Wave 1 follow-up, phone QA on event 8HF9WV, 2026-10-06)
//
// Approving a signup into "New team" put the golfer on Team 3 in the field,
// and the desk went on saying "Needs a team" with a "1 needs a team" count -
// after the approve and after a reload. MEASURED ON BOTH: base 732194e shows
// it exactly as tournaments-wave1 does, so A5's multi-path approve did not
// introduce it. It was the 2026-09-18 rule: in the field on a ONE-golfer team
// that still wears the default name "Team N" = needs a team. That is exactly
// what a deliberate New-team approve produces, so the flag fired on every one.
//
// THE RULE NOW: the row names the golfer's team, and "Needs a team" means the
// team the entry points at no longer exists (removed from the record - no Setup control removes a team today (Wave 2)) - a golfer who
// really has nowhere to play. Still derived, still nothing stored.
//
// THE PATH IS THE USER'S: the desk's own listeners, the row's Approve, the
// writes echoed back through both listeners; "after reload" is a fresh page
// arriving on the records as the server now holds them.
//
// BASELINE over the FINISHED file, all 5 tests: measured against 2d0d6b7,
// tournament.html as committed there:
//
//   0 PASS / 5 FAIL / 5 tests.   0 + 5 = 5.
//
// The positive control is red there too: the old rule returned false for a
// team that no longer exists, so a golfer whose team was deleted was never
// flagged at all.
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');
const { applyWrites } = require('./helpers/tournament-write-apply.js');

const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const rec = () => ({ name: 'Desk', format: 'scramble', courseName: 'C', courseData: COURSE, createdAt: 1, ownerUid: OWNER.uid,
    teams: { team1: { num: 1, name: 'Eagles', players: ['Ann'], handicap: 0 }, team2: { num: 2, name: 'Hawks', players: ['Bo', 'Cy'], handicap: 0 } } });
const regs = () => ({ e1: { fullName: 'Dee Delta', email: 'dee@example.com', phone: '555-0001', createdAt: 10 } });

function page(r, g) {
    const sb = loadHtmlInlineScript('tournament.html', [], { search: '?tourney=HF9' });
    sb.__fire = (re, v) => sb.__dbHandlers.filter((x) => x.event === 'value' && re.test(x.path))
        .forEach((x) => x.cb({ val: () => JSON.parse(JSON.stringify(v)), exists: () => true }));
    sb.__fire(/tournaments\/HF9$/, r);
    sb.__auth.setUser(OWNER);
    sb.__fire(/registrations\/HF9$/, g);
    return sb;
}
function approve(dest) {
    const r = rec(), g = regs();
    const sb = page(r, g);
    sb.document.getElementById('reg-dest-e1').value = dest;
    vm.runInContext("approveRegistration('e1')", sb);
    const r2 = applyWrites(r, sb.__dbWrites, 'tournaments/HF9');
    const g2 = applyWrites(g, sb.__dbWrites, 'registrations/HF9');
    sb.__fire(/tournaments\/HF9$/, r2); sb.__fire(/registrations\/HF9$/, g2);
    return { sb, r2, g2 };
}
const desk = (sb) => ({
    row: String(sb.document.getElementById('registration-list').innerHTML),
    counts: String(sb.document.getElementById('registration-counts').innerHTML),
    chips: String(sb.document.getElementById('registration-chips').innerHTML)
});
function assertSettled(d, teamName) {
    assert.match(d.row, /reg-state-field/, 'the row is not in the field - nothing was approved');
    assert.match(d.row, new RegExp('reg-state-team">' + teamName + '<'), 'the row does not name the team');
    assert.doesNotMatch(d.row, /Needs a team/);
    assert.doesNotMatch(d.counts, /needs a team/);
    assert.match(d.chips, /Needs a team 0/);
}

test('approve into a NEW team: the desk names Team 3, no "needs a team"', () => {
    assertSettled(desk(approve('new').sb), 'Team 3');
});
test('approve into an EXISTING team: the desk names Eagles, no "needs a team"', () => {
    assertSettled(desk(approve('1').sb), 'Eagles');
});
test('after a reload (new team): the same', () => {
    const { r2, g2 } = approve('new');
    assertSettled(desk(page(r2, g2)), 'Team 3');
});
test('after a reload (existing team): the same', () => {
    const { r2, g2 } = approve('1');
    assertSettled(desk(page(r2, g2)), 'Eagles');
});
test('POSITIVE CONTROL: the team is gone from the record (no UI does this yet; modelled in data) - now it needs a team', () => {
    const { r2, g2 } = approve('new');
    delete r2.teams.team3;
    const d = desk(page(r2, g2));
    assert.match(d.row, /reg-state-needs">Needs a team</);
    assert.match(d.counts, /1 needs a team/);
    assert.match(d.chips, /Needs a team 1/);
});
