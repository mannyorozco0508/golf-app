// ============================================================================
// THE DESK CAN FIX A TYPO, REMOVE AN ENTRY, AND HAND THE LIST OVER (2026-10-06)
//
// Rattle Golf Tournaments. Registration itself already shipped - the signup
// link, the public form, the owner-only list with counts, chips, search, Paid
// and Approve into field, and QR + Copy on the share modal. RECON FOUND four
// things missing against the brief, and nothing else:
//
//   1. REMOVE. There was no control, and the RULES REFUSED IT TOO: both arms of
//      registrations/$code/$entryId .write ended in `newData.exists()`, so a
//      delete was refused for everybody including the organizer. Measured as a
//      red row before the rules changed - "registrations/OWNED/e1 write
//      organizer expect ✓" - which is the only honest way to show that the
//      one-line rules change is what does the work.
//   2. EDIT. The rules have always allowed the owner to correct an entry (there
//      is a targaryen row for "Ann Alpha-Corrected"), and no screen could.
//   3. CSV. Nothing could get the field off the phone.
//   4. The signup page showed the event name, the course and the format, and
//      NOT the date or the entry fee - the two things a golfer deciding whether
//      to sign up actually needs. The record carries both (eventDate, entryFee).
//
// WHAT THIS FILE WILL NOT DO. It does not re-test what already works; the
// existing registration suites own that. Every case here is one of the four.
//
// AND THE ONE THING THE DESK MUST NEVER DO. An edit writes the three contact
// keys and nothing else. paid, paidAt, approvedAt, playerId and teamNum are the
// desk's own state and a typo fix that carried them would silently re-approve a
// golfer or wipe a payment. The rules cannot catch that - the owner is allowed
// to write all of them - so it is asserted here, on the payload.
//
// BASELINE over the FINISHED file (all 15 tests, after the last assertion was
// written) against main 21f9c7f, tournament.html sha da37710107035e92 swapped in
// and restored by sha from a saved copy, never with git checkout:
//
//   1 PASS / 14 FAIL / 15 tests.   1 + 14 = 15.
//
// THE ONE THAT PASSES is the wiring pin on tools/registration-desk-check.js, and
// it is VACUOUS there: the tool is added by this wave, so on main it reads the
// branch's own file. It is in the suite so the check cannot quietly stop tapping,
// or start calling the page's functions, without a test saying so.
//
// AND ONE OF THE FOURTEEN IS RED FOR A WEAKER REASON THAN IT LOOKS. "a
// stranger's page has no Remove" is VACUOUSLY TRUE on main - there is no Remove
// for anybody - and it goes red there only because calling removeRegistration()
// throws, the function not existing yet. It is in the file for what it will
// catch LATER: a row that renders the control from the entry data instead of
// from canManage(). The honest count of behaviours this wave adds is thirteen.
//
// THE RULES HALF IS MEASURED SEPARATELY, in security-rules.tests-data.json
// against database.rules.json: "registrations/OWNED/e1 write organizer expect
// OK" was RED before the one-line change and green after, with the three
// cannotWrite delete rows (nobody, stranger, anonymous) and the wholesale-wipe
// row green throughout. registrations_rules_isolation_test.js then proves each
// of those refusals comes from the registrations block and not from the $other
// catch-all, and tournament_registration_2a_test.js knocks the owner clause out
// and requires the rows to fire.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const PAGE = 'tournament.html';
const SRC = fs.readFileSync(path.join(REPO_ROOT, PAGE), 'utf8');
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const ORGANIZER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const STRANGER = { uid: 'u-stranger', email: 'who@example.com', isAnonymous: false };

const EVENT = {
    name: 'Cameron Charity Classic', format: 'scramble', courseName: 'Cameron Park',
    activeCourseKey: 'cameron', courseData: COURSE, entryFee: 125, eventDate: '2026-10-24',
    startTime: '08:30', venue: 'Cameron Park GC', createdAt: 1, ownerUid: 'u-org',
    teams: { team1: { num: 1, name: 'Eagles', players: ['Ann Alpha'], handicap: 0 } }
};
// Three entries, one of them carrying desk state, so an edit that clobbers it is
// visible. The comma and the quote in Dee's row are the CSV's real test.
const ENTRIES = {
    e1: { fullName: 'Ann Alpha', email: 'ann@example.com', phone: '555-0001', createdAt: 10 },
    e2: { fullName: 'Bo Bravo', email: 'bo@example.com', phone: '555-0002', createdAt: 20,
          paid: true, paidAt: 21, approvedAt: 22, teamNum: 1, ghinOrHandicap: '12.4' },
    e3: { fullName: 'Dee "Deets" Delta, Jr', email: 'dee@example.com', phone: '555-0003',
          createdAt: 30, teamPreference: 'Hawks, please' }
};

function owner(rec, user) {
    const sb = loadHtmlInlineScript(PAGE, [], { search: '?tourney=DESK1' });
    sb.__writes = [];
    sb.__confirms = [];
    const h = sb.__dbHandlers.filter(x => x.event === 'value' && /tournaments\/DESK1$/.test(x.path));
    assert.ok(h.length > 0, 'the page registered no value handler for the tournament');
    h.forEach(x => x.cb({ val: () => JSON.parse(JSON.stringify(rec || EVENT)), exists: () => true }));
    sb.__auth.setUser(user === undefined ? ORGANIZER : user);
    return sb;
}
function fireRegistrations(sb, data) {
    const h = sb.__dbHandlers.filter(x => x.event === 'value' && /registrations\/DESK1$/.test(x.path));
    assert.ok(h.length > 0, 'the owner page registered no registrations listener');
    h.forEach(x => x.cb({ val: () => (data == null ? null : JSON.parse(JSON.stringify(data))),
                          exists: () => data != null }));
}
// A STRANGER HAS NO LISTENER, and that is the point - registrations/$code is
// owner-only to read. So their arms deliver nothing and read the empty desk.
function fireIfListening(sb, data) {
    const h = sb.__dbHandlers.filter(x => x.event === 'value' && /registrations\/DESK1$/.test(x.path));
    h.forEach(x => x.cb({ val: () => JSON.parse(JSON.stringify(data)), exists: () => true }));
    return h.length;
}
// EVERY WRITE, WITH ITS PATH AND WHETHER IT WAS A REMOVAL. db.ref().update/set/
// remove are recorded rather than stubbed away: what the desk SENDS is the claim.
function recordWrites(sb) {
    vm.runInContext(`
        window.__origRef = db.ref;
        db.ref = function (p) {
            var r = window.__origRef.call(db, p);
            ['update', 'set', 'remove'].forEach(function (m) {
                var o = r[m];
                r[m] = function (v) {
                    window.__writes.push({ path: String(p), method: m,
                        value: (v === undefined ? null : JSON.parse(JSON.stringify(v === null ? null : v))) });
                    return o ? o.apply(r, arguments) : Promise.resolve();
                };
            });
            return r;
        };
        window.confirm = function (m) { window.__confirms.push(String(m)); return window.__confirmAnswer !== false; };
        window.uiConfirm = window.confirm;
    `, sb);
}
const deskHtml = (sb) => String(sb.document.getElementById('registration-list').innerHTML || '');
const run = (sb, e) => vm.runInContext(e, sb);

describe('1. REMOVE AN ENTRY', () => {

    test('every row offers Remove, and it names the golfer so a mis-tap is visible', () => {
        const sb = owner();
        fireRegistrations(sb, ENTRIES);
        const html = deskHtml(sb);
        assert.ok(html.length > 200, 'the desk rendered nothing, so every assertion here is vacuous');
        assert.equal((html.match(/removeRegistration\(/g) || []).length, 3,
            'one Remove per entry expected; got ' + (html.match(/removeRegistration\(/g) || []).length);
    });

    test('it asks before it removes, and the question says what is lost', () => {
        const sb = owner(); recordWrites(sb);
        fireRegistrations(sb, ENTRIES);
        run(sb, "window.__confirmAnswer = false; removeRegistration('e1');");
        assert.equal(sb.__confirms.length, 1, 'it removed without asking');
        assert.match(sb.__confirms[0], /Ann Alpha/, 'the question does not name the golfer');
        assert.match(sb.__confirms[0], /remove|delete/i);
        assert.deepEqual(sb.__writes, [], 'answering no still wrote something');
    });

    test('and on yes it removes THAT entry, by itself', () => {
        const sb = owner(); recordWrites(sb);
        fireRegistrations(sb, ENTRIES);
        run(sb, "window.__confirmAnswer = true; removeRegistration('e2');");
        assert.equal(sb.__writes.length, 1, 'wrote ' + JSON.stringify(sb.__writes));
        assert.equal(sb.__writes[0].path, 'registrations/DESK1/e2');
        assert.ok(sb.__writes[0].method === 'remove' || sb.__writes[0].value === null,
            'that is not a removal: ' + JSON.stringify(sb.__writes[0]));
    });

    test('a stranger’s page has no Remove, and calling it writes nothing', () => {
        const sb = owner(EVENT, STRANGER); recordWrites(sb);
        assert.equal(fireIfListening(sb, ENTRIES), 0,
            'a stranger\u2019s page is listening to registrations - the rules refuse that read');
        assert.doesNotMatch(deskHtml(sb), /removeRegistration\(/);
        run(sb, "window.__confirmAnswer = true; removeRegistration('e1');");
        assert.deepEqual(sb.__writes, [], 'a non-owner removed an entry');
    });
});

describe('2. CORRECT A TYPO', () => {

    test('every row offers Edit', () => {
        const sb = owner();
        fireRegistrations(sb, ENTRIES);
        assert.equal((deskHtml(sb).match(/editRegistration\(/g) || []).length, 3);
    });

    test('the editor opens with what the golfer typed, not blank', () => {
        const sb = owner();
        fireRegistrations(sb, ENTRIES);
        run(sb, "editRegistration('e2');");
        assert.equal(sb.document.getElementById('reg-edit-name').value, 'Bo Bravo');
        assert.equal(sb.document.getElementById('reg-edit-email').value, 'bo@example.com');
        assert.equal(sb.document.getElementById('reg-edit-phone').value, '555-0002');
    });

    test('saving writes the three contact keys AND NOTHING THE DESK OWNS', () => {
        const sb = owner(); recordWrites(sb);
        fireRegistrations(sb, ENTRIES);
        run(sb, `editRegistration('e2');
            document.getElementById('reg-edit-name').value = 'Bo Bravo-Smith';
            document.getElementById('reg-edit-email').value = 'bo.smith@example.com';
            document.getElementById('reg-edit-phone').value = '555-9999';
            saveRegistrationEdit();`);
        assert.equal(sb.__writes.length, 1, 'wrote ' + JSON.stringify(sb.__writes));
        assert.equal(sb.__writes[0].path, 'registrations/DESK1/e2');
        assert.deepEqual(Object.keys(sb.__writes[0].value).sort(), ['email', 'fullName', 'phone'],
            'the payload carries more than the contact keys: ' + JSON.stringify(sb.__writes[0].value));
        assert.equal(sb.__writes[0].value.fullName, 'Bo Bravo-Smith');
        // e2 is paid, approved and on team 1. A typo fix must not touch any of it.
        ['paid', 'paidAt', 'approvedAt', 'teamNum', 'playerId'].forEach(k =>
            assert.ok(!(k in sb.__writes[0].value), 'the edit wrote ' + k));
    });

    test('and it refuses an empty name or a bad email rather than writing one', () => {
        const sb = owner(); recordWrites(sb);
        fireRegistrations(sb, ENTRIES);
        run(sb, `editRegistration('e1');
            document.getElementById('reg-edit-name').value = '   ';
            saveRegistrationEdit();`);
        assert.deepEqual(sb.__writes, [], 'wrote an empty name');
        run(sb, `editRegistration('e1');
            document.getElementById('reg-edit-name').value = 'Ann Alpha';
            document.getElementById('reg-edit-email').value = 'not-an-email';
            saveRegistrationEdit();`);
        assert.deepEqual(sb.__writes, [], 'wrote an address the rules would refuse');
    });
});

describe('3. HAND THE LIST OVER', () => {

    test('the CSV has a header and one row per entry, in the desk’s order', () => {
        const sb = owner();
        fireRegistrations(sb, ENTRIES);
        const csv = run(sb, 'registrationCsv()');
        const lines = String(csv).trim().split('\n');
        assert.equal(lines.length, 4, 'header + 3 entries expected, got: ' + lines.length);
        assert.match(lines[0], /^Name,Email,Phone,/);
        assert.match(lines[1], /^Ann Alpha,ann@example\.com,555-0001,/);
    });

    test('AND IT SURVIVES A COMMA AND A QUOTE, which is the whole job of a CSV', () => {
        const sb = owner();
        fireRegistrations(sb, ENTRIES);
        const line = String(run(sb, 'registrationCsv()')).trim().split('\n')[3];
        // Dee "Deets" Delta, Jr -> quoted, with the inner quotes doubled.
        assert.ok(line.startsWith('"Dee ""Deets"" Delta, Jr"'),
            'the comma or the quote broke the row: ' + line);
        assert.match(line, /"Hawks, please"/, 'the team preference lost its comma');
    });

    test('it carries the desk state a tee sheet needs: paid and in-the-field', () => {
        const sb = owner();
        fireRegistrations(sb, ENTRIES);
        const csv = String(run(sb, 'registrationCsv()'));
        assert.match(csv.split('\n')[0], /Paid/);
        assert.match(csv.split('\n')[0], /In field/i);
        assert.match(csv.split('\n')[2], /,Yes,/, 'e2 is paid and the row does not say so');
    });

    test('the Export button is on the desk when there is a list, and only then', () => {
        const sb = owner();
        fireRegistrations(sb, ENTRIES);
        assert.match(SRC, /onclick="exportRegistrationsCsv\(\)"/);
        // POSITIVE FIRST. The button ships style="display:none", so a test that
        // only checked the strangers' and the empty cases would pass on a button
        // that is never shown to anybody.
        assert.equal(sb.document.getElementById('registration-export').style.display, 'block',
            'the organizer with 3 signups is not offered the export');
        // AND NOT ON AN EMPTY DESK: a header row with nothing under it.
        const empty = owner();
        fireRegistrations(empty, {});
        assert.equal(empty.document.getElementById('registration-export').style.display, 'none',
            'the export is offered on a desk with no signups');
        const stranger = owner(EVENT, STRANGER);
        fireIfListening(stranger, ENTRIES);
        assert.equal(stranger.document.getElementById('registration-export').style.display, 'none',
            'a stranger is offered the export');
    });
});

describe('4. WHAT A GOLFER DECIDING WHETHER TO PLAY NEEDS TO SEE', () => {

    test('the signup page shows the date and the entry fee, not only the course', () => {
        // THE SIGNUP PAGE READS ONCE, not on: it is a form, not a live card. The
        // harness answers a once() from __dbReads, which is how the other
        // registration suites drive this screen.
        const sb = loadHtmlInlineScript(PAGE, [], { search: '?register=DESK1', beforeRun(s2) {
            s2.__dbReads = s2.__dbReads || {};
            s2.__dbReads['tournaments/DESK1'] = JSON.parse(JSON.stringify(EVENT));
        } });
        return new Promise(r => setTimeout(r, 30)).then(() => {
            const sub = String(sb.document.getElementById('reg-event-sub').innerHTML || '')
                + String(sb.document.getElementById('reg-event-sub').textContent || '');
            assert.match(sub, /Cameron Park/, 'the course is gone');
            assert.match(sub, /Oct(ober)? 24/, 'the date is not on the signup page: ' + sub);
            assert.match(sub, /\$125/, 'the entry fee is not on the signup page: ' + sub);
        });
    });
});

// ---------------------------------------------------------------------------
describe('5. AND A THUMB CAN REACH IT, which mini-dom cannot say', () => {

    // NO LAYOUT HERE. mini-dom returns an all-zero rect and dispatches no
    // events, so everything above is about PAYLOADS. Whether an organizer at the
    // first tee can actually hit Correct and Remove on a 390px screen is a
    // question only a browser answers - CLAUDE.md: never teach the harness to
    // fake a rect, measure it in Chrome.
    test('tools/registration-desk-check.js: real taps, 390px, all three controls', () => {
        const r = require('child_process').spawnSync(process.execPath,
            [path.join(REPO_ROOT, 'tools', 'registration-desk-check.js')],
            { encoding: 'utf8', timeout: 180000 });
        const out = String(r.stdout || '');
        assert.ok(/"ok": true/.test(out), 'the desk check did not pass:\n' + out
            + String(r.stderr || '').slice(0, 400));
        // THE NUMBERS IT MEASURED, so a shrinking control is caught here and not
        // on a phone: 68x30 and 73x30 when this was written, and the check's own
        // threshold is 44 wide by 28 high.
        const d = JSON.parse(out);
        assert.ok(d.correctButton.w >= 44 && d.correctButton.h >= 28,
            'Correct is ' + d.correctButton.w + 'x' + d.correctButton.h);
        assert.ok(d.removeButton.w >= 44 && d.removeButton.h >= 28,
            'Remove is ' + d.removeButton.w + 'x' + d.removeButton.h);
        assert.equal(d.editorPrefilled, 'Ann Alhpa', 'the editor did not open on the misspelling');
        assert.equal(d.sentAfterRemove[0].method, 'remove');
    });

    test('and the check taps rather than calling the page', () => {
        const tool = fs.readFileSync(path.join(REPO_ROOT, 'tools', 'registration-desk-check.js'), 'utf8');
        // The remove is tapped on a NAMED ROW (.reg-row:nth-of-type(3) .reg-remove),
        // so this looks for the selector inside a tap step rather than at the
        // start of one.
        const taps = (tool.match(/\{ tap: '[^']+'/g) || []).join(' ');
        ['.reg-fix', '.reg-remove', '#registration-export'].forEach(sel =>
            assert.ok(taps.includes(sel), 'the check no longer taps ' + sel + ': ' + taps));
        const js = tool.replace(/\/\/[^\n]*/g, '').replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
        ['renderRegistrationDesk', 'removeRegistration', 'saveRegistrationEdit',
         'exportRegistrationsCsv', 'editRegistration'].forEach(fn =>
            assert.ok(!js.includes(fn), 'the check calls ' + fn + ' instead of tapping it'));
    });
});
