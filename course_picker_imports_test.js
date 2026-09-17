// ============================================================================
// IMPORTED COURSES SHOW UP IN THE PICKER
//
// THE DEFECT. An online import (the /api proxy, admin.html's openImportConfirm
// -> commitPendingImport) writes global_courses/gca_<providerId> - keyed on the
// provider's id on purpose, because four "Legacy Golf Club"s would otherwise
// collapse into one comm_ slug and overwrite each other. But the picker listed
// community courses with .filter(k => k.startsWith("comm_")), so an import was
// written, shared, and never offered again. Measured on the live database
// 2026-09-16: global_courses/gca_bwcdmzcy "Legacy Golf Resort", Phoenix AZ,
// 18 holes, imported Mon 2026-09-14 08:13 from Manny's phone; typing "legacy"
// on Wednesday said "No local match" and offered to buy the import again.
//
// THE FIX (admin.html populateCourseDropdown): the community list is every
// comm_ AND every gca_ key. The key scheme is untouched. The record was always
// shared; this makes it reachable. Decision (Manny, 2026-09-16): visible to
// everyone, like the community ones.
//
// HOW THE PAGE IS DRIVEN. The way a golfer drives it as far as mini-dom allows:
// the value goes into #course-search-input and the page's OWN 'input' listener
// runs (mini-dom has no dispatchEvent; the listener is invoked from its
// registry). A row is chosen through the row's own onclick, which is
// selectCourse -> handleCourseChange. The card the round will save is read
// through previewCourseData, the function saveSettings itself calls.
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const PAGE = 'admin.html';
const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

// The live record's shape (name, 18-hole data, location, tees, source), with a
// card distinctive enough that "the card loaded" cannot be satisfied by the
// unmapped par-4 fallback: hole 3 and hole 12 are par 3, hole 7 par 5.
const LEGACY_CARD = Array.from({ length: 18 }, (_, i) => ({
    hole: i + 1, par: (i === 2 || i === 11) ? 3 : (i === 6 ? 5 : 4), hcpIndex: ((i * 7) % 18) + 1
}));
const LEGACY = {
    name: 'Legacy Golf Resort', data: LEGACY_CARD,
    location: { address: '6808 S 32nd St, Phoenix, AZ 85042, USA', city: 'Phoenix', state: 'AZ', country: 'United States' },
    tees: { male: [{ name: 'Copper', rating: 70.1, slope: 121, totalYards: 6400, parTotal: 71, holes: [] }], female: [] },
    source: { provider: 'golfcourseapi', providerCourseId: 'bwcdmzcy', providerClubName: 'Legacy Golf Resort', importedAt: 1789398796234, siFrom: 'male/Copper' }
};
const PROBE = { name: 'Probe Course', data: Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 })) };

function page(globals) {
    const sb = loadHtmlInlineScript(PAGE, [], { only: false });
    vm.runInContext('globalCourses = ' + JSON.stringify(globals || {}), sb);
    return sb;
}
// Type into the picker: the page's own input listener, from mini-dom's registry.
function type(sb, text) {
    const inp = sb.document.getElementById('course-search-input');
    inp.value = text;
    const listeners = (inp._listeners && inp._listeners.input) || [];
    assert.ok(listeners.length > 0, 'the search input has no input listener - the page did not wire the picker');
    listeners.forEach(fn => fn({ target: inp }));
    return sb.document.getElementById('course-dropdown').children;
}
const texts = rows => rows.map(r => (r.textContent || '').trim());
const optionRows = rows => rows.filter(r => /custom-select-option/.test(r.className || '') && !/course-online-search-row|custom-select-add-option/.test((r.id || '') + ' ' + (r.className || '')));

describe('THE PICKER OFFERS AN IMPORTED COURSE, by name and by part of it', () => {
    test('"legacy" lists Legacy Golf Resort once, from its gca_ key', () => {
        const sb = page({ gca_bwcdmzcy: LEGACY, comm_probecourse: PROBE });
        const rows = type(sb, 'legacy');
        const legacy = rows.filter(r => (r.textContent || '') === 'Legacy Golf Resort');
        assert.equal(legacy.length, 1, 'Legacy must be offered exactly once: ' + JSON.stringify(texts(rows)));
        assert.ok(!texts(rows).some(t => /No local match/.test(t)), 'the picker must not say "No local match" when the course is in the list');
    });
    test('partials and the full name find it too: "lega", "legacy golf", "legacy golf resort", "resort"', () => {
        const sb = page({ gca_bwcdmzcy: LEGACY });
        ['lega', 'legacy golf', 'legacy golf resort', 'resort', 'LEGACY'].forEach(q => {
            const rows = type(sb, q);
            assert.equal(rows.filter(r => (r.textContent || '') === 'Legacy Golf Resort').length, 1, q + ' -> ' + JSON.stringify(texts(rows)));
        });
    });
    test('with no text typed, the community group heads both kinds of key', () => {
        const sb = page({ gca_bwcdmzcy: LEGACY, comm_probecourse: PROBE });
        const rows = type(sb, '');
        const t = texts(rows);
        const head = t.indexOf('🌎 Community Mapped Courses');
        assert.ok(head >= 0, 'no community group heading: ' + JSON.stringify(t.slice(-6)));
        assert.ok(t.indexOf('Legacy Golf Resort') > head && t.indexOf('Probe Course') > head, 'both sit under the community heading');
    });
    test('a comm_ course is still offered, unchanged', () => {
        const sb = page({ gca_bwcdmzcy: LEGACY, comm_probecourse: PROBE });
        const rows = type(sb, 'probe');
        assert.equal(rows.filter(r => (r.textContent || '') === 'Probe Course').length, 1, JSON.stringify(texts(rows)));
    });
    test('a key that is neither comm_ nor gca_ is still NOT listed by the community filter (a directory id lists through the directory, a stray does not list at all)', () => {
        const sb = page({ zz_scratch_probe: { name: 'Scratch Probe Xyz', data: PROBE.data }, gca_bwcdmzcy: LEGACY });
        const rows = type(sb, 'scratch probe');
        assert.equal(rows.filter(r => /Scratch Probe Xyz/.test(r.textContent || '')).length, 0, JSON.stringify(texts(rows)));
        assert.ok(texts(rows).some(t => /No local match/.test(t)));
    });
});

describe('A ROUND OPENED ON AN IMPORTED COURSE LOADS ITS CARD', () => {
    test('choosing the Legacy row selects the gca_ key and stamps its card into the grid', () => {
        const sb = page({ gca_bwcdmzcy: LEGACY });
        const rows = type(sb, 'legacy');
        const row = rows.find(r => (r.textContent || '') === 'Legacy Golf Resort');
        assert.ok(row && typeof row.onclick === 'function', 'the row has no onclick');
        row.onclick();
        assert.equal(sb.document.getElementById('course-select').value, 'gca_bwcdmzcy');
        assert.equal(sb.document.getElementById('course-search-input').value, 'Legacy Golf Resort');
        // The grid carries THIS card, not the par-4 fallback: hole 3 par 3, hole 7 par 5.
        assert.equal(String(sb.document.getElementById('c-par-3').value), '3');
        assert.equal(String(sb.document.getElementById('c-par-7').value), '5');
        assert.equal(String(sb.document.getElementById('c-hcp-2').value), String(LEGACY_CARD[1].hcpIndex));
    });
    test('previewCourseData - what saveSettings writes as the round\'s courseData - is the imported card', () => {
        const sb = page({ gca_bwcdmzcy: LEGACY });
        type(sb, 'legacy').find(r => (r.textContent || '') === 'Legacy Golf Resort').onclick();
        const preview = JSON.parse(JSON.stringify(vm.runInContext("previewCourseData('gca_bwcdmzcy')", sb)));
        assert.equal(preview.ok, true, preview.reason);
        assert.deepEqual(preview.data.map(h => [h.hole, h.par, h.hcpIndex]), LEGACY_CARD.map(h => [h.hole, h.par, h.hcpIndex]));
    });
    test('reopening a saved round: the hidden key restores the name through getCourseNameById', () => {
        const sb = page({ gca_bwcdmzcy: LEGACY });
        assert.equal(vm.runInContext("getCourseNameById('gca_bwcdmzcy', globalCourses)", sb), 'Legacy Golf Resort');
    });
});

describe('WHAT DID NOT CHANGE', () => {
    test('a name that matches nothing still says so and still offers the online row', () => {
        const sb = page({ gca_bwcdmzcy: LEGACY, comm_probecourse: PROBE });
        const rows = type(sb, 'dobson ranch');
        const t = texts(rows);
        assert.ok(t.some(x => /No local match for "dobson ranch"/.test(x)), JSON.stringify(t));
        assert.ok(rows.some(r => r.id === 'course-online-search-row'), 'the online row must still be offered');
        assert.ok(t.some(x => /Search online for "dobson ranch"/.test(x)));
    });
    test('the native shell still lists no community course of either prefix (deliberate, pending Manny\'s decision on gca_)', () => {
        const sb = page({ gca_bwcdmzcy: LEGACY, comm_probecourse: PROBE });
        vm.runInContext('isNativeApp = () => true', sb);
        const rows = type(sb, 'legacy');
        assert.equal(rows.filter(r => /Legacy Golf Resort|Probe Course/.test(r.textContent || '')).length, 0, JSON.stringify(texts(rows)));
    });
    test('an import named exactly like a directory entry lands on the DIRECTORY key, so the picker shows one row, not a shadow', () => {
        // The key rule (course_import_test.js) is what prevents a second physical
        // course from shadowing a directory entry under a gca_ key. Followed here
        // through the picker: import "Camas Meadows Golf Club" -> key
        // swwa_camasmeadows -> one row for "camas meadows", from the directory.
        const sb = page({});
        const key = vm.runInContext("importedCourseKey({ id: 'zzzz9999', course_name: 'Camas Meadows Golf Club' }, globalCourses)", sb);
        assert.equal(key, 'swwa_camasmeadows', 'a same-named import must reuse the directory key');
        vm.runInContext(`globalCourses = { '${key}': { name: 'Camas Meadows Golf Club', data: ${JSON.stringify(PROBE.data)} } }`, sb);
        const rows = type(sb, 'camas meadows');
        assert.equal(rows.filter(r => (r.textContent || '') === 'Camas Meadows Golf Club').length, 1, JSON.stringify(texts(rows)));
    });
    test('the filter in source names both prefixes and nothing else', () => {
        const src = read(PAGE);
        const m = /Object\.keys\(globalCourses\)\.filter\(k => (.+?)\);/.exec(src);
        assert.ok(m, 'the community filter is not where it was');
        assert.equal(m[1], 'k.startsWith("comm_") || k.startsWith("gca_")');
    });
});
