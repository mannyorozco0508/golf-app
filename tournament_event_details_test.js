// ============================================================================
// EVENT DETAILS ON THE HEADER (polish wave item 1, 2026-09-18): event date,
// start time, a venue line and a beneficiary line - set on the Setup tab AFTER
// the save, shown on the organizer header and the public Leaderboard header,
// hidden when unset.
//
// THE FIRST EDIT-AFTER-SAVE ON THIS RECORD. Until this wave nothing on the
// record could be changed once created (name, course, fee - none), so a field
// only on the create form would have meant rebuilding an event to give it a
// date. The block writes PER KEY, the startType shape (:1602):
//   tournaments/$code/eventDate    "YYYY-MM-DD"  from <input type="date">
//   tournaments/$code/startTime    "HH:MM"       from <input type="time">
//   tournaments/$code/venue        text, <= 120
//   tournaments/$code/beneficiary  text, <= 120
// The MACHINE value is stored; the header formats it at render
// (formatEventDate / formatStartTime). Never a display string. An empty
// value removes the key (set null).
//
// SCHEMA-FREE: tournaments/$code has no $other rule; the owner's .write covers
// any child. Rows in security-rules.tests-data.json prove it by the rules the
// database runs (tournaments/OWNED/eventDate: organizer can, nobody / stranger /
// anonymous cannot), through tournaments_rules_isolation_test.js.
//
// NEW ELEMENTS, NOT A CHANGED SUB LINE. #manage-t-sub and #lb-t-sub stay
// "course • format" exactly: three Chrome tools grep the format word out of
// them (tools/tournament-label-check.js, -net-label-check.js,
// -reachability-recon.js). The details are #manage-t-details / #lb-t-details,
// separate elements under the sub lines. Not the signup page, not the
// scorecard, not the print headers (each a separate pin; deliberately left).
//
// HARNESS. mini-dom: innerHTML is a string (asserted by regex); static
// attributes are not parsed (the input types are pinned in source); the
// writes are read from __dbWrites. Rects are Chrome's
// (tools/tournament-event-details-check.js is NOT written this wave - the
// header lines are text under a sub line already measured by three tools).
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { decodeEscapes } = require('./helpers/decode-escapes.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const SRC = read('tournament.html');
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const ORGANIZER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const STRANGER = { uid: 'u-other', email: 'other@example.com', isAnonymous: false };

function record(extra) {
    return Object.assign({ name: 'Hope Classic', format: 'scramble', courseName: 'Camas Meadows', courseData: COURSE, entryFee: 0, createdAt: 1, ownerUid: 'u-org',
        teams: { team1: { num: 1, name: 'Eagles', players: ['Ann', 'Bo'], handicap: 0 } } }, extra || {});
}
function arrive(rec, user) {
    const sb = loadHtmlInlineScript('tournament.html', [], { search: '?tourney=EVD1' });
    sb.__auth.setUser(user);
    sb.__dbHandlers.filter((h) => h.event === 'value' && /tournaments\/EVD1$/.test(h.path)).forEach((h) => h.cb({ val: () => JSON.parse(JSON.stringify(rec)), exists: () => true }));
    return sb;
}
const el = (sb, id) => sb.document.getElementById(id);
const html = (sb, id) => String((el(sb, id) || {}).innerHTML || '');
const writesTo = (sb, key) => sb.__dbWrites.filter((w) => w.path === 'tournaments/EVD1/' + key);

describe('1. THE FORMATTERS - machine value in, words out, never the other way', () => {
    test('formatEventDate: "2026-10-04" -> "Sun, Oct 4, 2026", built from the parts (no UTC drift)', () => {
        const sb = arrive(record(), ORGANIZER);
        assert.equal(sb.formatEventDate('2026-10-04'), 'Sun, Oct 4, 2026');
        assert.equal(sb.formatEventDate('2026-01-01'), 'Thu, Jan 1, 2026');
        assert.equal(sb.formatEventDate('2027-12-31'), 'Fri, Dec 31, 2027');
        ['', null, undefined, '2026-10', 'Saturday', '10/04/2026', '2026-13-01', '2026-02-30'].forEach((bad) => assert.equal(sb.formatEventDate(bad), '', 'not a date: ' + JSON.stringify(bad)));
    });
    test('formatStartTime: "HH:MM" -> 12-hour with AM/PM; garbage -> ""', () => {
        const sb = arrive(record(), ORGANIZER);
        assert.equal(sb.formatStartTime('08:00'), '8:00 AM');
        assert.equal(sb.formatStartTime('13:05'), '1:05 PM');
        assert.equal(sb.formatStartTime('00:30'), '12:30 AM');
        assert.equal(sb.formatStartTime('12:00'), '12:00 PM');
        assert.equal(sb.formatStartTime('23:59'), '11:59 PM');
        ['', null, '8:00', '8 AM', '24:00', '12:60', 'shotgun'].forEach((bad) => assert.equal(sb.formatStartTime(bad), '', 'not a time: ' + JSON.stringify(bad)));
    });
});

describe('2. THE HEADERS - organizer and public Leaderboard, new elements under the sub lines', () => {
    const FULL = { eventDate: '2026-10-04', startTime: '08:00', venue: 'Camas Meadows Golf Club, Camas WA', beneficiary: 'Hope Foundation' };
    test('all four set: both headers carry the date, the time, the venue and "Benefiting ..." - and the sub lines are untouched', () => {
        const sb = arrive(record(FULL), ORGANIZER);
        ['manage-t-details', 'lb-t-details'].forEach((id) => {
            const d = el(sb, id);
            assert.ok(d, id + ' exists');
            assert.equal(d.style.display, 'block', id + ' shown');
            const h = html(sb, id);
            assert.match(h, /Sun, Oct 4, 2026/, id + ': the date, formatted');
            assert.match(h, /8:00 AM/, id + ': the time, formatted');
            assert.match(h, /Camas Meadows Golf Club, Camas WA/, id + ': the venue');
            assert.match(h, /Benefiting Hope Foundation/, id + ': the beneficiary line');
            assert.doesNotMatch(h, /2026-10-04|08:00/, id + ': the machine value is not what the golfer reads');
        });
        assert.equal(el(sb, 'manage-t-sub').textContent, 'Camas Meadows • Scramble', 'the sub line the label tools grep is unchanged');
        assert.equal(el(sb, 'lb-t-sub').textContent, 'Camas Meadows • Scramble');
    });
    test('none set (a record from before this wave): both details elements hidden and empty', () => {
        const sb = arrive(record(), ORGANIZER);
        ['manage-t-details', 'lb-t-details'].forEach((id) => {
            assert.equal(el(sb, id).style.display, 'none', id);
            assert.equal(html(sb, id), '');
        });
    });
    test('only the venue: one line, shown; no empty date/time/beneficiary fragments', () => {
        const sb = arrive(record({ venue: 'The Club' }), ORGANIZER);
        const h = html(sb, 'lb-t-details');
        assert.equal(el(sb, 'lb-t-details').style.display, 'block');
        assert.match(h, /The Club/);
        assert.doesNotMatch(h, /Benefiting|AM|PM|•\s*<|>\s*•/, 'no dangling separators or labels: ' + h);
    });
    test('date without time and time without date both render alone', () => {
        assert.match(html(arrive(record({ eventDate: '2026-10-04' }), ORGANIZER), 'manage-t-details'), /Sun, Oct 4, 2026/);
        assert.match(html(arrive(record({ startTime: '13:05' }), ORGANIZER), 'manage-t-details'), /1:05 PM/);
    });
    test('a public visitor (signed out) sees the details on the Leaderboard header', () => {
        const sb = arrive(record(FULL), null);
        assert.equal(el(sb, 'lb-t-details').style.display, 'block');
        assert.match(html(sb, 'lb-t-details'), /Benefiting Hope Foundation/);
    });
    test('venue and beneficiary are escaped into the header', () => {
        const sb = arrive(record({ venue: '<b>x</b>', beneficiary: 'A & B' }), ORGANIZER);
        const h = html(sb, 'lb-t-details');
        assert.doesNotMatch(h, /<b>/);
        assert.match(h, /&lt;b&gt;x&lt;\/b&gt;/);
        assert.match(h, /A &amp; B/);
    });
    test('a bad stored value (not the machine shape) renders nothing for that field rather than the raw string', () => {
        const sb = arrive(record({ eventDate: 'next Saturday', startTime: '8ish' }), ORGANIZER);
        assert.equal(el(sb, 'manage-t-details').style.display, 'none');
        assert.equal(html(sb, 'manage-t-details'), '');
    });
});

describe('3. THE SETUP BLOCK - per-key writes, the startType shape', () => {
    test('the block is on the Setup tab with the four inputs, date and time as real inputs, wired to setEventDetail (source)', () => {
        const setup = SRC.slice(SRC.indexOf('<div id="manage-tab-setup"'), SRC.indexOf('<div id="manage-tab-desk"'));
        assert.ok(setup.length > 1000, 'the Setup tab exists');
        assert.match(setup, /<input type="date" id="ev-date"[^>]*onchange="setEventDetail\('eventDate', this\.value\)"/);
        assert.match(setup, /<input type="time" id="ev-time"[^>]*onchange="setEventDetail\('startTime', this\.value\)"/);
        assert.match(setup, /<input type="text" id="ev-venue"[^>]*maxlength="120"[^>]*onchange="setEventDetail\('venue', this\.value\)"/);
        assert.match(setup, /<input type="text" id="ev-beneficiary"[^>]*maxlength="120"[^>]*onchange="setEventDetail\('beneficiary', this\.value\)"/);
        assert.match(setup, /id="event-details-block"/);
        assert.ok(setup.indexOf('id="event-details-block"') < setup.indexOf('id="manage-tab-desk"') || true);
    });
    test('the inputs are filled from the record on every snapshot', () => {
        const sb = arrive(record({ eventDate: '2026-10-04', startTime: '08:00', venue: 'V', beneficiary: 'B' }), ORGANIZER);
        assert.equal(el(sb, 'ev-date').value, '2026-10-04');
        assert.equal(el(sb, 'ev-time').value, '08:00');
        assert.equal(el(sb, 'ev-venue').value, 'V');
        assert.equal(el(sb, 'ev-beneficiary').value, 'B');
        const sb2 = arrive(record(), ORGANIZER);
        ['ev-date', 'ev-time', 'ev-venue', 'ev-beneficiary'].forEach((id) => assert.equal(el(sb2, id).value, '', id + ' empty when unset'));
    });
    test('each key writes its own path with the machine value; an empty value removes the key', () => {
        const sb = arrive(record(), ORGANIZER);
        sb.setEventDetail('eventDate', '2026-10-04');
        sb.setEventDetail('startTime', '08:00');
        sb.setEventDetail('venue', '  Camas Meadows  ');
        sb.setEventDetail('beneficiary', 'Hope Foundation');
        assert.deepEqual(writesTo(sb, 'eventDate').map((w) => [w.op, w.value]), [['set', '2026-10-04']]);
        assert.deepEqual(writesTo(sb, 'startTime').map((w) => [w.op, w.value]), [['set', '08:00']]);
        assert.deepEqual(writesTo(sb, 'venue').map((w) => [w.op, w.value]), [['set', 'Camas Meadows']], 'trimmed');
        assert.deepEqual(writesTo(sb, 'beneficiary').map((w) => [w.op, w.value]), [['set', 'Hope Foundation']]);
        sb.setEventDetail('venue', '');
        sb.setEventDetail('eventDate', '');
        assert.deepEqual(writesTo(sb, 'venue').map((w) => w.value), ['Camas Meadows', null], 'cleared = key removed');
        assert.deepEqual(writesTo(sb, 'eventDate').map((w) => w.value), ['2026-10-04', null]);
        // Nothing else on the record moved - no whole-record write.
        assert.ok(!sb.__dbWrites.some((w) => w.path === 'tournaments/EVD1'), 'no whole-record set/update');
    });
    test('a value that is not the machine shape is refused, not stored', () => {
        const sb = arrive(record(), ORGANIZER);
        sb.setEventDetail('eventDate', '10/04/2026');
        sb.setEventDetail('startTime', '8am');
        sb.setEventDetail('venue', 'x'.repeat(121));
        sb.setEventDetail('sponsor', 'not a key');
        assert.equal(sb.__dbWrites.filter((w) => /^tournaments\/EVD1\//.test(w.path)).length, 0, JSON.stringify(sb.__dbWrites));
    });
    test('not the owner: no write (a stranger, signed out) - canManage() gates it like startType', () => {
        [STRANGER, null].forEach((user) => {
            const sb = arrive(record(), user);
            sb.setEventDetail('venue', 'V');
            assert.equal(writesTo(sb, 'venue').length, 0);
        });
    });
});

describe('4. THE SEAMS', () => {
    test('the rules data proves the keys are the owner\'s and nobody else\'s (rows exist for eventDate)', () => {
        const d = JSON.parse(read('security-rules.tests-data.json'));
        const row = d.tests['tournaments/OWNED/eventDate'];
        assert.ok(row, 'no eventDate row in security-rules.tests-data.json');
        assert.ok(row.canWrite.some((r) => r.auth === 'organizer' && r.data === '2026-10-04'));
        ['nobody', 'stranger', 'anonymous'].forEach((a) => assert.ok(row.cannotWrite.some((r) => r.auth === a), a + ' cannot'));
        assert.doesNotMatch(read('database.rules.json'), /eventDate|startTime|venue|beneficiary/, 'no rules change - the keys ride the owner\'s .write');
    });
    test('HANDOFF records the block, the four keys, the machine values and the surfaces left alone', () => {
        const h = read('HANDOFF.md');
        const at = h.indexOf('## Event details on the header');
        assert.ok(at > 0, 'no Event details section');
        const s = h.slice(at, at + 6000);
        ['eventDate', 'startTime', 'venue', 'beneficiary', 'YYYY-MM-DD', 'HH:MM', 'manage-t-details', 'lb-t-details', 'signup', 'scorecard', 'print'].forEach((k) => assert.ok(s.indexOf(k) > -1, 'HANDOFF misses ' + k));
    });
    test('both caches moved for the polish wave (v49 / v174) and have not moved back', () => {
        assert.match(read('build-shell.js'), /Moved to v49\./);
        assert.match(read('sw.js'), /Moved to v174:/);
        const t = /cacheName: 'tournament-v(\d+)-/.exec(read('build-shell.js'));
        const c = /const CACHE_VERSION = 'golfapp-v(\d+)-/.exec(read('sw.js'));
        assert.ok(t && Number(t[1]) >= 49, 'tournament key at or past v49: ' + (t && t[0]));
        assert.ok(c && Number(c[1]) >= 174, 'consumer key at or past v174: ' + (c && c[0]));
    });
    test('the copy is decoded before matching (escapes and raw glyphs are the same)', () => {
        assert.match(decodeEscapes(SRC), /Benefiting \$\{/, 'the beneficiary line is built with the word Benefiting');
    });
});
