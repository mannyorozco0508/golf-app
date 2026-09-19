// ============================================================================
// THREE IMPORT DEFECTS SEEN ON A PHONE (2026-09-19), AND THE RULE FOR EACH.
//
// Manny imported Streamsong Red on the v177 Xcode build. It worked - search,
// pick, confirm, the card in the grid, the round started - and three things
// were wrong on screen:
//   1. the confirm button read `Use Red — Streamsong, FL` - the six
//      characters of an escape, not an em dash. admin.html:3719 had `\\u2014`
//      inside a template literal; course_import_test asserted the label's
//      words and never its separator.
//   2. "⚠️ COURSE NOT MAPPED! Please enter the Pars and Handicaps from your
//      scorecard" rendered under the confirm panel that had just put the
//      provider's 36 numbers into the grid. openImportConfirm borrows the
//      unmapped path to open the grid, and the path's red warning showed
//      through, contradicting the panel's own "Par and stroke index below came
//      from this course's … tees. Check them against the card before you save."
//   3. the course was stored and shown as "Red". The provider gives
//      course_name "Red" and club_name "Streamsong Resort"; the app's own
//      directory names a club's course as CLUB (COURSE) - "TPC Scottsdale
//      (Stadium)", "Talking Stick Golf Club (O'odham)". Five copies of
//      `course_name || club_name` on admin.html and four on tournament.html
//      each took the tee course alone.
//
// NOW: ONE composer, courseDisplayName(), in course-import-rules.js (shared by
// both pages): club_name (course_name) when they differ, the bare name when
// they match, whichever one exists when only one does. Every name a golfer
// reads on the import path comes from it - the result row, the typed name,
// the panel title, the confirm label, the stored record - and the NAME MATCHER
// compares the composed string, so a provider "Talking Stick Golf Club" /
// "O'odham" lands on the directory's az_talking_oodham instead of writing a
// shadow gca_ record beside it. The confirm label's separator is asserted AS
// A CHARACTER, through helpers/decode-escapes.js, so an escape that prints
// literally cannot pass again. The warning is suppressed while pendingImport
// is set, and shows again on the refusal path, where the grid IS empty.
//
// HARNESS. mini-dom: the panel is built from nodes with textContent (readable);
// the network is the only thing replaced (a fetch stub answering the detail);
// openImportConfirm is reached by name here because its tap is the result
// row's onclick, which course_import_test.js pins from source.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { decodeEscapes } = require('./helpers/decode-escapes.js');
const RULES = require('./course-import-rules.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ADMIN = read('admin.html'), TOURN = read('tournament.html');
const holes = (par, si) => Array.from({ length: 18 }, (_, i) => ({ par: par[i], yardage: 400, handicap: si[i] }));
const PAR = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4], SI = [7, 1, 17, 3, 9, 13, 15, 5, 11, 8, 2, 18, 4, 10, 14, 16, 6, 12];
const RED = { id: '4ad33747', club_name: 'Streamsong Resort', course_name: 'Red',
    location: { address: '1000 Streamsong Dr, Streamsong, FL 33834, USA', city: 'Streamsong', state: 'FL', country: 'United States' },
    tees: { male: [{ tee_name: 'Green', course_rating: 73.4, slope_rating: 133, total_yards: 7148, par_total: 72, holes: holes(PAR, SI) }], female: [] } };
const LEGACY = { id: 'bwcdmzcy', club_name: 'Legacy Golf Resort', course_name: 'Legacy Golf Resort', location: { city: 'Phoenix', state: 'AZ' },
    tees: { male: [{ tee_name: 'Copper', course_rating: 72.1, slope_rating: 128, total_yards: 6768, par_total: 71, holes: holes(PAR, SI) }], female: [] } };
const OODHAM = { id: 'ts000001', club_name: 'Talking Stick Golf Club', course_name: "O'odham", location: { city: 'Scottsdale', state: 'AZ' },
    tees: { male: [{ tee_name: 'Black', course_rating: 72.0, slope_rating: 130, total_yards: 7000, par_total: 72, holes: holes(PAR, SI) }], female: [] } };

describe('1. THE COMPOSER - one function, shared', () => {
    test('club (course) when they differ; the bare name when they match; whichever exists when one is missing', () => {
        assert.equal(RULES.courseDisplayName(RED), 'Streamsong Resort (Red)');
        assert.equal(RULES.courseDisplayName(LEGACY), 'Legacy Golf Resort');
        assert.equal(RULES.courseDisplayName(OODHAM), "Talking Stick Golf Club (O'odham)");
        assert.equal(RULES.courseDisplayName({ club_name: 'Streamsong Resort', course_name: 'streamsong resort' }), 'Streamsong Resort', 'a case-only difference is the same name');
        assert.equal(RULES.courseDisplayName({ course_name: 'Red' }), 'Red');
        assert.equal(RULES.courseDisplayName({ club_name: 'Streamsong Resort' }), 'Streamsong Resort');
        assert.equal(RULES.courseDisplayName({ club_name: ' Streamsong Resort ', course_name: ' Red ' }), 'Streamsong Resort (Red)', 'trimmed');
        assert.equal(RULES.courseDisplayName({}), '');
        assert.equal(RULES.courseDisplayName(null), '');
    });
    test('every name on the import path goes through it - no copy of `course_name || club_name` survives on either page', () => {
        assert.equal((ADMIN.match(/course_name \|\| [a-z.]*club_name/g) || []).length, 0, 'admin.html still composes a name by hand');
        assert.equal((TOURN.match(/course_name \|\| [a-z.]*club_name/g) || []).length, 0, 'tournament.html still composes a name by hand');
        assert.ok((ADMIN.match(/courseDisplayName\(/g) || []).length >= 7, 'admin: the row, the typed name (x3), the panel title, the label, the record, the matcher');
        assert.ok((TOURN.match(/courseDisplayName\(/g) || []).length >= 4, 'tournament: the row, the detail, the note, the record');
        assert.match(read('course-import-rules.js'), /function courseDisplayName\(c\)/);
        assert.match(read('course-import-rules.js'), /courseDisplayName \}/, 'exported for the tests');
    });
});

describe('2. THE ESCAPE - the confirm label\'s separator is a CHARACTER', () => {
    test('importConfirmLabel: "Use Streamsong Resort (Red) — Streamsong, FL", with a real em dash', () => {
        const sb = loadHtmlInlineScript('admin.html', ['course-import-rules.js'], {});
        const t = sb.importConfirmLabel(RED);
        assert.equal(t, 'Use Streamsong Resort (Red) — Streamsong, FL');
        assert.ok(!/\\u/.test(t), 'an escape printed as text: ' + t);
        assert.equal(sb.importConfirmLabel(LEGACY), 'Use Legacy Golf Resort — Phoenix, AZ');
    });
    test('the SOURCE, decoded: the label carries the dash as one character and never a doubled backslash', () => {
        const at = ADMIN.indexOf('function importConfirmLabel(');
        const fn = ADMIN.slice(at, ADMIN.indexOf('\n    }', at));
        assert.ok(fn.length > 50, 'the label builder exists');
        assert.ok(!/\\\\u/.test(fn), 'a doubled backslash in the label builder prints literally: ' + fn);
        assert.match(decodeEscapes(fn), /— \$\{L\.city/, 'the dash, decoded, before the city');
        // tournament.html's twin label, the same way
        assert.match(decodeEscapes(TOURN), /Use \$\{cname\} — \$\{L\.city/);
    });
    test('no shipped page or script carries a doubled `\\\\u` escape (build-shell.js is source of source and exempt)', () => {
        const files = fs.readdirSync(REPO_ROOT).filter((f) => /\.(html|js)$/.test(f) && !/_test\.js$/.test(f) && f !== 'build-shell.js');
        const hits = files.filter((f) => /\\\\u[0-9a-fA-F]{4}/.test(read(f)));
        assert.deepEqual(hits, [], 'a doubled escape ships in: ' + hits.join(', '));
    });
});

// ---------------------------------------------------------------------------
function page(detail, globals) {
    const sb = loadHtmlInlineScript('admin.html', ['course-import-rules.js'], {});
    sb.alert = () => {};
    // mini-dom has no Event constructor; openImportConfirm dispatches a change on the edit box.
    sb.Event = function (type, init) { this.type = type; this.bubbles = !!(init && init.bubbles); };
    sb.globalCourses = globals || {};
    sb.fetch = async () => ({ json: async () => ({ status: 'ok', course: detail }) });
    sb.document.__mount(sb.document.getElementById('custom-course-container'));
    // mini-dom nodes listen but cannot dispatch; the edit box's change is a no-op here.
    sb.document.getElementById('enable-custom-course').dispatchEvent = () => true;
    return sb;
}
const panelText = (sb) => { const p = sb.document.getElementById('course-import-confirm'); return p ? p.children.map((c) => c.textContent || '').join('\n') : null; };
const warning = (sb) => String(sb.document.getElementById('custom-course-warning').innerHTML || '');
// let-scoped page state, read through the context.
const pending = (sb) => JSON.parse(vm.runInContext('JSON.stringify(pendingImport === undefined ? null : pendingImport)', sb));

describe('3. THE WARNING - not while an import is on screen; still on the refusal path', () => {
    test('after the detail arrives: the panel names the source of the numbers, the grid holds them, and #custom-course-warning is EMPTY', async () => {
        const sb = page(RED);
        await sb.openImportConfirm({ id: '4ad33747', club_name: 'Streamsong Resort', course_name: 'Red', location: RED.location });
        const t = panelText(sb);
        assert.ok(t, 'the confirm panel rendered');
        assert.match(t, /Streamsong Resort \(Red\)/, 'the panel title is the composed name');
        assert.match(t, /came from this course/, 'the panel says where the numbers came from');
        assert.equal(sb.document.getElementById('c-par-1').value, '4');
        assert.equal(sb.document.getElementById('c-hcp-1').value, '7');
        assert.equal(warning(sb), '', 'the unmapped warning showed under an imported card: ' + warning(sb));
        assert.equal(sb.document.getElementById('custom-course-container').style.display, 'block', 'the grid is open for checking');
        assert.equal(sb.document.getElementById('course-search-input').value, 'Streamsong Resort (Red)', 'the typed name is the composed name');
    });
    test('the refusal path (no usable card) keeps the grid EMPTY and the red warning ON - that is the unmapped case', async () => {
        const bad = Object.assign({}, RED, { tees: { male: [{ tee_name: 'Green', holes: [] }], female: [] } });
        const sb = page(bad);
        await sb.openImportConfirm({ id: '4ad33747', club_name: 'Streamsong Resort', course_name: 'Red', location: RED.location });
        assert.ok(!panelText(sb), 'no confirm panel on a refusal (mini-dom answers a detached, empty element for an id never built)');
        assert.match(warning(sb), /COURSE NOT MAPPED/, 'the refusal leaves an unmapped course and the warning must say so');
        assert.equal(pending(sb), null, 'nothing pending after a refusal');
    });
    test('the suppression reads pendingImport - the source names it in handleCourseChange', () => {
        const at = ADMIN.indexOf('function handleCourseChange()');
        const fn = ADMIN.slice(at, ADMIN.indexOf('\n    }', at));
        assert.match(fn, /!pendingImport/, 'handleCourseChange must know an import is on screen');
        assert.match(fn, /COURSE NOT MAPPED!/, 'the warning itself is unchanged for the case it is for');
    });
});

describe('4. THE NAME MATCHER compares the COMPOSED name', () => {
    test("Talking Stick Golf Club / O'odham lands on the directory's az_talking_oodham - not a shadow gca_ record", () => {
        const sb = page(OODHAM);
        assert.equal(sb.importedCourseKey(OODHAM, {}), 'az_talking_oodham');
    });
    test('Streamsong Resort / Red matches a global record named "Streamsong Resort (Red)", and no longer one named "Red"', () => {
        const sb = page(RED);
        assert.equal(sb.importedCourseKey(RED, { gca_4ad33747: { name: 'Streamsong Resort (Red)' } }), 'gca_4ad33747');
        assert.equal(sb.importedCourseKey(RED, { gca_4ad33747: { name: 'Red' } }), 'gca_4ad33747', 'the same provider id still lands on its own key - by id, not by the old bare name');
        assert.equal(sb.importedCourseKey(RED, { comm_somebody: { name: 'Red' } }), 'gca_4ad33747', 'a stranger\'s "Red" is not this course');
    });
    test('a one-course club is unchanged: Legacy Golf Resort matches by its bare name, as before', () => {
        const sb = page(LEGACY);
        assert.equal(sb.importedCourseKey(LEGACY, { gca_bwcdmzcy: { name: 'Legacy Golf Resort' } }), 'gca_bwcdmzcy');
        assert.equal(sb.importedCourseKey(LEGACY, {}), 'gca_bwcdmzcy');
    });
    test('the stored record carries the composed name; the directory match keeps the directory key', async () => {
        const sb = page(RED);
        await sb.openImportConfirm({ id: '4ad33747', club_name: 'Streamsong Resort', course_name: 'Red', location: RED.location });
        assert.equal(pending(sb).key, 'gca_4ad33747');
        assert.equal(pending(sb).record.name, 'Streamsong Resort (Red)');
        assert.equal(pending(sb).record.source.providerClubName, 'Streamsong Resort');
        const sb2 = page(OODHAM);
        await sb2.openImportConfirm({ id: 'ts000001', club_name: 'Talking Stick Golf Club', course_name: "O'odham", location: OODHAM.location });
        assert.equal(pending(sb2).key, 'az_talking_oodham');
        assert.equal(pending(sb2).record.name, "Talking Stick Golf Club (O'odham)");
    });
});

describe('5. tournament.html composes the same way', () => {
    test('its detail path and stored record use courseDisplayName (source)', () => {
        const at = TOURN.indexOf('function confirmCourseImport()');
        const fn = TOURN.slice(at, TOURN.indexOf('\n    }', at));
        assert.match(fn, /const name = courseDisplayName\(detail\)/);
        const d = TOURN.indexOf('async function openTournamentCourseDetail(');
        assert.match(TOURN.slice(d, d + 400), /const cname = courseDisplayName\(course\)/);
    });
    test('HANDOFF records the composer, the escape, the warning, and what to do about gca_4ad33747', () => {
        const h = read('HANDOFF.md');
        const at = h.indexOf('## The import names the club');
        assert.ok(at > 0, 'no section');
        const s = h.slice(at, at + 7000);
        ['courseDisplayName', 'Streamsong Resort (Red)', 'gca_4ad33747', '\\\\u2014', 'COURSE NOT MAPPED', 'pendingImport', 'importedAt'].forEach((k) => assert.ok(s.indexOf(k) > -1, 'HANDOFF misses ' + k));
    });
    test('both caches moved (tournament-v51 / golfapp-v179) and have not moved back', () => {
        assert.match(read('build-shell.js'), /Moved to v51\./);
        assert.match(read('sw.js'), /Moved to v179:/);
        const t = /cacheName: 'tournament-v(\d+)-/.exec(read('build-shell.js'));
        const c = /const CACHE_VERSION = 'golfapp-v(\d+)-/.exec(read('sw.js'));
        assert.ok(t && Number(t[1]) >= 51, 'tournament key at or past v51: ' + (t && t[0]));
        assert.ok(c && Number(c[1]) >= 179, 'consumer key at or past v179: ' + (c && c[0]));
    });
});
