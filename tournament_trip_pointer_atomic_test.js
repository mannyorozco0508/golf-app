// ============================================================================
// A TRIP LINK IS ONE WRITE (Tournaments Wave 1, A9)
//
// Both trip pointers - trips/<trip>/tournaments/<code> and the record's own
// tripCode - were written as two sequential sets, and in linkTournamentToTrip
// the second ran inside an unreturned promise, so its failure was never
// reported. A half-linked pair was possible: the trip lists the event while
// the event says it is linked to nothing. Both paths now write the pair in
// one multi-path update().
//
// The link button is reached the way the organizer reaches it: the owner's
// page, the trip code typed into its box, the function its button calls. The
// create-from-trip path in saveTournament is pinned at source level only - a
// mini-dom run of the whole create form is out of reach here, and the trip
// check in Chrome (tools/tournament-reachability-recon.js) arrives on that
// page but does not save.
//
// BASELINE over the FINISHED file, all 3 tests: measured against 8ffb5a1 (A1
// to A6 committed), tournament.html swapped back and restored by sha from a
// saved copy:
//
//   0 PASS / 3 FAIL / 3 tests.   0 + 3 = 3.
//
// (The refusal test refuses only the tripCode half. Refusing every write
// passed on the base page, because the first set's failure was always
// reported - that version was inert and was narrowed before this baseline.)
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const SRC = fs.readFileSync('tournament.html', 'utf8');

function ownerPage() {
    const sb = loadHtmlInlineScript('tournament.html', [], { search: '?tourney=TP1' });
    sb.__dbReads = { 'trips/TRIP9': { name: 'Vegas' } };
    const rec = { name: 'Day Two', format: 'scramble', courseName: 'C', courseData: COURSE, createdAt: 1, ownerUid: OWNER.uid,
        teams: { team1: { num: 1, name: 'Eagles', players: ['Ann'], handicap: 0 } } };
    sb.__dbHandlers.filter((x) => x.event === 'value' && /tournaments\/TP1$/.test(x.path))
        .forEach((x) => x.cb({ val: () => rec, exists: () => true }));
    sb.__auth.setUser(OWNER);
    return sb;
}
const tick = () => new Promise((r) => setImmediate(r));

test('Link to trip writes both pointers in ONE update', async () => {
    const sb = ownerPage();
    sb.document.getElementById('link-trip-code').value = 'trip9';
    vm.runInContext('linkTournamentToTrip()', sb);
    await tick(); await tick();
    const w = sb.__dbWrites.filter((x) => /trips\/|tripCode/.test(JSON.stringify(x)));
    assert.equal(w.length, 1, 'the link took ' + w.length + ' writes: ' + JSON.stringify(w));
    assert.equal(w[0].op, 'update');
    assert.deepEqual(Object.keys(w[0].value).sort(), ['tournaments/TP1/tripCode', 'trips/TRIP9/tournaments/TP1']);
    assert.equal(w[0].value['tournaments/TP1/tripCode'], 'TRIP9');
    assert.equal(w[0].value['trips/TRIP9/tournaments/TP1'].label, 'Day Two');
});

test('a refused link is reported, not swallowed', async () => {
    const sb = ownerPage();
    const alerts = [];
    vm.runInContext('alert = function (m) { __alerts.push(String(m)); };', Object.assign(sb, { __alerts: alerts }));
    // Refuse ONLY the tripCode half - the write that ran in the unreturned
    // promise. Refusing everything would fail the first set, which was always
    // reported, and pass on the old page for the wrong reason.
    sb.__dbRefuse = (p, op, v) => (/tripCode$/.test(String(p)) || (v && typeof v === 'object' && Object.keys(v).some((k) => /tripCode$/.test(k))))
        ? new Error('PERMISSION_DENIED') : null;
    sb.document.getElementById('link-trip-code').value = 'TRIP9';
    vm.runInContext('linkTournamentToTrip()', sb);
    await tick(); await tick(); await tick();
    assert.ok(alerts.some((m) => /Error linking to trip: PERMISSION_DENIED/.test(m)), 'alerts: ' + JSON.stringify(alerts));
});

test('creating from a trip writes the pair as one update too (source)', () => {
    const at = SRC.indexOf('function saveTournament(');
    const fn = SRC.slice(at, SRC.indexOf('\n    function ', at + 30));
    assert.ok(fn.length > 500 && /tripLinkCode/.test(fn), 'the save path slice is empty');
    assert.match(fn, /db\.ref\(\)\.update\(\{\s*\[`trips\/\$\{tripLinkCode\}\/tournaments\/\$\{currentCode\}`\]/);
    assert.match(fn, /\[`tournaments\/\$\{currentCode\}\/tripCode`\]: tripLinkCode/);
});
