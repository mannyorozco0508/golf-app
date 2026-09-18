// ============================================================================
// ONLINE COURSE SEARCH ON tournament.html - OPTION B (2026-09-17).
// Search and import into the tournament record only. No global_courses write
// from this page, ever.
//
// WHY THIS WAVE EXISTS. courseDirectory has 141 entries; coursePresets holds a
// card for 26 of them. 115 of 141 directory courses had NO card anywhere in the
// repo, and every one of them silently became eighteen par-4s indexed 1..18
// (the old resolveCourseCard fallback), flagged only for Net. This wave puts
// the course proxy (functions/api/) on the setup picker and REMOVES the silent
// fallback: a course with no card is offered the online fetch, and an event
// cannot start on fiction.
//
// THE SHAPE. The pure rules - what a valid card is, the canonical tee, every
// refusal sentence, the 25 ceiling - live in course-import-rules.js, loaded by
// admin.html and this page (one builder, two entry points). Everything that
// touches this page's DOM is written here against this page's elements.
//
//   - the online row appears at 3 typed characters, appended last, and fires
//     ONLY on a tap - never on the keystroke that rendered it
//   - one tap = one request; a second tap while in flight spends nothing
//   - three outcome shapes: could not ask (the reason's sentence, and when the
//     typed name is not in the local list, the honest stuck sentence), asked
//     and none, found (rows as nodes; nothing auto-selects; the 25-cut note)
//   - a result tap fetches the card; a refusal selects nothing
//   - the confirm panel shows the WHOLE card read-only, a tee chooser (every
//     tee set; the card is re-validated per pick), and a button that names
//     the course and its city; nothing is selected until the button
//   - confirm inlines the card: activeCourseKey = gca_<id>, courseData the
//     validated 18, courseIndexSynthetic false; the import is kept on the
//     event at importedCourses/gca_<id> so a later round can pick it
//     (Option B (b)); NO global_courses path is written
//   - a directory pick with no card is not selected; the row offers the fetch
//   - no message mentions typing a card in - there is no grid on this page
//
// HARNESS. helpers/mini-dom.js: the dropdown rows are nodes (children), the
// proxy is the sandbox's fetch (set by the test - the page calls whatever
// `fetch` is, which is what a stub of the data source means here), the
// record write is read from __dbWrites. Rects and real taps are Chrome's job:
// tools/tournament-course-search-check.js.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const PAGE = 'tournament.html';
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const SRC = read(PAGE);
const ORGANIZER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };

// ---- provider fixtures, the shape /v1/search and /v1/courses/<id> return ----
const holes = (order) => order.map((si, i) => ({ par: [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5][i], yardage: 380, handicap: si }));
const SI_BLUE = [7, 13, 17, 1, 5, 11, 15, 9, 3, 8, 14, 18, 2, 6, 12, 16, 10, 4];
const SI_WHITE = [13, 7, 17, 1, 5, 11, 15, 9, 3, 8, 14, 18, 2, 6, 12, 16, 10, 4];   // holes 1 and 2 swapped
const STICK = { id: 'a1b2c3d4', club_name: 'Talking Stick Golf Club', course_name: 'Talking Stick Piipaash',
    location: { city: 'Scottsdale', state: 'AZ', address: '9998 E Indian Bend Rd, Scottsdale, AZ 85256' }, tees: { male: 2, female: 1 } };
const STICK_DETAIL = Object.assign({}, STICK, { tees: {
    male: [{ tee_name: 'White', course_rating: 70.1, slope_rating: 125, total_yards: 6300, par_total: 72, holes: holes(SI_WHITE) },
           { tee_name: 'Blue', course_rating: 72.4, slope_rating: 131, total_yards: 6800, par_total: 72, holes: holes(SI_BLUE) }],
    female: [{ tee_name: 'Red', course_rating: 69.0, slope_rating: 118, total_yards: 5400, par_total: 72, holes: holes(SI_BLUE) }] } });
const NO_CARD = { id: 'e5f6g7h8', club_name: 'Bare Club', course_name: 'Bare Course', location: { city: 'Nowhere', state: 'KS' }, tees: {} };
const NO_CARD_DETAIL = Object.assign({}, NO_CARD, { tees: { male: [], female: [] } });
const OK = (courses) => ({ status: 'ok', courses });
const UNAVAILABLE = (reason) => ({ status: 'unavailable', reason });

// A stubbed proxy: every call recorded, answers by path.
function stubFetch(sb, answers) {
    sb.__fetches = [];
    sb.fetch = (url) => {
        sb.__fetches.push(String(url));
        const a = typeof answers === 'function' ? answers(String(url)) : answers;
        if (a && a.__throw) return Promise.reject(new Error('network down'));
        return Promise.resolve({ ok: true, json: () => Promise.resolve(a) });
    };
}
function arrive() {
    const sb = loadHtmlInlineScript(PAGE);
    sb.alert = () => {};
    return sb;
}
const allText = (el) => !el ? '' : (el.textContent || '') + (el.children || []).map(allText).join(' ');
const dropdown = (sb) => sb.document.getElementById('course-dropdown');
const rows = (sb) => dropdown(sb).children;
const rowText = (r) => String(r.textContent || '');
const find = (sb, re) => rows(sb).find(r => re.test(allText(r)));
const onlineRow = (sb) => rows(sb).find(r => r.id === 'course-online-search-row');
const host = (sb) => sb.document.getElementById('course-import-host');
const panel = (sb) => (host(sb).children || []).find(c => c.id === 'course-import-confirm') || null;
const settle = () => new Promise(r => setImmediate(r)).then(() => new Promise(r => setImmediate(r)));
// The user types: the input's oninput is filterCourseDropdown(this.value) (markup :316).
function typeCourse(sb, text) { sb.document.getElementById('course-search-input').value = text; sb.filterCourseDropdown(text); }
async function searchAndOpen(sb, query, searchAnswer, detailAnswer) {
    stubFetch(sb, (url) => /course-search/.test(url) ? searchAnswer : detailAnswer);
    typeCourse(sb, query);
    onlineRow(sb).click();
    await settle();
}
async function toConfirm(sb) {
    await searchAndOpen(sb, 'talking', OK([STICK]), { status: 'ok', course: STICK_DETAIL });
    find(sb, /Talking Stick Piipaash/).click();
    await settle();
    return panel(sb);
}
const noGlobalWrite = (sb) => assert.deepEqual(sb.__dbWrites.filter(w => /global_courses/.test(w.path)), [], 'NOTHING may write global_courses from this page');

// ===========================================================================
describe('0. THE SHARED RULES ARE LOADED, NOT COPIED', () => {
    test('tournament.html and admin.html both load course-import-rules.js before their inline script', () => {
        assert.match(SRC, /<script src="course-import-rules\.js"><\/script>/);
        assert.match(read('admin.html'), /<script src="course-import-rules\.js"><\/script>/);
        for (const p of ['tournament.html', 'admin.html']) {
            const s = read(p);
            assert.ok(s.indexOf('course-import-rules.js') < s.indexOf('<script>\n'), p + ' loads the rules before its inline script');
            // POSITIVE: the module is a real declaration, not an empty file.
            assert.match(read('course-import-rules.js'), /function importCardOrRefuse\(tee\)/);
            assert.doesNotMatch(s, /function importCardOrRefuse\(|function pickCanonicalTee\(|const ONLINE_SEARCH_MESSAGES|const ONLINE_SEARCH_CEILING/, p + ' must not re-declare a shared rule');
        }
    });
    test('the rules are reachable on the loaded page', () => {
        const sb = arrive();
        assert.equal(typeof sb.importCardOrRefuse, 'function');
        assert.equal(typeof sb.pickCanonicalTee, 'function');
        assert.equal(typeof sb.allTeeSets, 'function');
        assert.equal(sb.ONLINE_SEARCH_CEILING, 25);
    });
    test('course-import-rules.js ships: SHARED_SHELL, sw.js SHELL_FILES, and the built product list', () => {
        assert.match(read('sync-mobile-web.js'), /'course-import-rules\.js'/);
        assert.match(read('sw.js'), /'\.\/course-import-rules\.js'/);
    });
});

// ===========================================================================
describe('1. THE ONLINE ROW', () => {
    test('two characters: no row; three: the row, appended LAST, and no request was made', () => {
        const sb = arrive();
        stubFetch(sb, OK([]));
        typeCourse(sb, 'ta');
        assert.equal(onlineRow(sb), undefined, 'no online row under MIN_QUERY');
        typeCourse(sb, 'tal');
        const r = onlineRow(sb);
        assert.ok(r, 'the online row is offered at three characters');
        assert.equal(rows(sb)[rows(sb).length - 1], r, 'appended last');
        assert.match(rowText(r), /Search online for "tal"/);
        assert.equal(sb.__fetches.length, 0, 'a keystroke must never spend a request');
    });
    test('the row sits below the local matches, and below the empty-state sentence when there are none', () => {
        const sb = arrive();
        stubFetch(sb, OK([]));
        typeCourse(sb, 'zzq');
        const texts = rows(sb).map(rowText);
        assert.match(texts[0], /No courses found for "zzq"/);
        assert.equal(rows(sb)[rows(sb).length - 1].id, 'course-online-search-row');
        // No add row, no placeholder row: this page has nothing to add to.
        assert.ok(!texts.some(t => /Add .* as a new course|placeholder/i.test(t)), JSON.stringify(texts));
    });
    test('a tap fires exactly one request for the typed text; while it is in flight, typing more and tapping the fresh row spends nothing', async () => {
        const sb = arrive();
        let resolveIt; stubFetch(sb, OK([]));
        sb.fetch = (url) => { sb.__fetches.push(String(url)); return new Promise(res => { resolveIt = () => res({ ok: true, json: () => Promise.resolve(OK([])) }); }); };
        typeCourse(sb, 'talking stick');
        onlineRow(sb).click();
        assert.equal(sb.__fetches.length, 1, 'one request');
        assert.equal(sb.__fetches[0], '/api/course-search?q=talking%20stick');
        assert.match(rowText(onlineRow(sb)), /Searching online/);
        // The organizer keeps typing: the dropdown re-renders with a FRESH online
        // row (its own onclick), and an impatient thumb taps it. The in-flight
        // guard is what makes that second tap free - the first row's onclick
        // being removed cannot, because this is a different row.
        typeCourse(sb, 'talking stick g');
        onlineRow(sb).click();
        assert.equal(sb.__fetches.length, 1, 'still one request - the second tap spent nothing');
        resolveIt(); await settle();
    });
});

// ===========================================================================
describe('2. THE THREE OUTCOME SHAPES', () => {
    test('could not ask: the reason sentence; the typed name IS in the local list -> no stuck sentence', async () => {
        const sb = arrive();
        await searchAndOpen(sb, 'talking', UNAVAILABLE('rate_limited'), null);
        const t = rows(sb).map(rowText).join(' | ');
        assert.match(t, /searched online a few times just now/);
        assert.doesNotMatch(t, /isn't in the built-in list/);
        assert.doesNotMatch(t, /no courses? found|nothing matched/i, 'a refusal never reads as "not found"');
    });
    test('could not ask AND the name is not in the 141: the honest stuck sentence, and nothing to add', async () => {
        const sb = arrive();
        await searchAndOpen(sb, 'zzq course', UNAVAILABLE('daily_limit'), null);
        const t = rows(sb).map(rowText).join(' | ');
        assert.match(t, /used up today's lookups\. It works again tomorrow\./);
        assert.match(t, /Couldn't check online just now, and "zzq course" isn't in the built-in list\. Try again in a moment\. To start the event now, pick a course from the list — the event scores on that course's card\./);
        assert.doesNotMatch(t, /type|grid|below/i, 'there is no grid on this page');
        assert.ok(!rows(sb).some(r => /Add|placeholder/i.test(rowText(r))));
    });
    test('the fetch throws: reason network, same shape', async () => {
        const sb = arrive();
        await searchAndOpen(sb, 'zzq course', { __throw: true }, null);
        assert.match(rows(sb).map(rowText).join(' | '), /Couldn't reach online search\. Check your signal\./);
    });
    test('asked, genuinely none: the one honest "nothing matched"', async () => {
        const sb = arrive();
        await searchAndOpen(sb, 'zzq course', OK([]), null);
        const t = rows(sb).map(rowText).join(' | ');
        assert.match(t, /Nothing online matched "zzq course"\./);
        assert.doesNotMatch(t, /built-in list/);
    });
    test('found: a head, one row per course with city, state and tee count; nothing selected; nothing written', async () => {
        const sb = arrive();
        await searchAndOpen(sb, 'talking', OK([STICK, NO_CARD]), null);
        assert.ok(find(sb, /Found online/));
        const r1 = find(sb, /Talking Stick Piipaash/), r2 = find(sb, /Bare Course/);
        assert.ok(r1 && r2);
        assert.match(allText(r1), /Scottsdale, AZ/); assert.match(allText(r1), /3 tee sets/);
        assert.match(allText(r2), /Nowhere, KS/); assert.match(allText(r2), /no tee data/);
        assert.equal(sb.document.getElementById('course-key').value || '', '', 'nothing auto-selects');
        assert.equal(sb.__dbWrites.length, 0);
    });
    test('found, one result: STILL nothing auto-selects', async () => {
        const sb = arrive();
        await searchAndOpen(sb, 'talking', OK([STICK]), null);
        assert.equal(sb.document.getElementById('course-key').value || '', '');
        assert.equal(panel(sb), null);
    });
    test('25 results: the cut notice, above nothing else', async () => {
        const sb = arrive();
        const many = [...Array(25)].map((_, i) => Object.assign({}, STICK, { id: 'id' + String(i).padStart(6, '0'), course_name: 'Course ' + i }));
        await searchAndOpen(sb, 'course', OK(many), null);
        const t = rows(sb).map(rowText).join(' | ');
        assert.match(t, /Only the first 25 are shown/);
        assert.match(t, /narrower search/);
    });
});

// ===========================================================================
describe('3. THE DETAIL AND THE CONFIRM', () => {
    test('a result tap spends the detail request and shows "Fetching the card"', async () => {
        const sb = arrive();
        await searchAndOpen(sb, 'talking', OK([STICK]), { status: 'ok', course: STICK_DETAIL });
        find(sb, /Talking Stick Piipaash/).click();
        assert.equal(sb.__fetches[1], '/api/course/a1b2c3d4');
        await settle();
    });
    test('the detail is refused: the sentence, nothing selected, the search box keeps the typed text', async () => {
        const sb = arrive();
        await searchAndOpen(sb, 'talking', OK([STICK]), UNAVAILABLE('upstream_error'));
        find(sb, /Talking Stick Piipaash/).click();
        await settle();
        assert.match(rows(sb).map(rowText).join(' | '), /Couldn't fetch the card for Talking Stick Piipaash\. Online search isn't answering right now\./);
        assert.equal(sb.document.getElementById('course-key').value || '', '');
        assert.equal(sb.document.getElementById('course-search-input').value, 'talking', 'a name in the box with no card would look chosen');
        assert.equal(panel(sb), null);
    });
    test('no usable card from the provider: the reason, nothing selected', async () => {
        const sb = arrive();
        await searchAndOpen(sb, 'bare', OK([NO_CARD]), { status: 'ok', course: NO_CARD_DETAIL });
        find(sb, /Bare Course/).click();
        await settle();
        assert.match(rows(sb).map(rowText).join(' | '), /Bare Course: This course has no tee data from the provider\./);
        assert.equal(panel(sb), null);
        assert.equal(sb.document.getElementById('course-key').value || '', '');
    });
    test('the confirm panel: name, address, par and tee count, the WHOLE card read-only, the source line, the button naming the city', async () => {
        const sb = arrive();
        const p = await toConfirm(sb);
        assert.ok(p, 'no confirm panel');
        const t = allText(p);
        assert.match(t, /Talking Stick Piipaash/);
        assert.match(t, /9998 E Indian Bend Rd/);
        assert.match(t, /Par 72 · 3 tee sets/);
        assert.match(t, /Par and stroke index came from this course's Blue tees\. This is the card the event will score on\. It can't be edited on this page — if it's wrong, pick a different tee set or a different course\./);
        assert.doesNotMatch(t, /check them against the card before you save/i, 'the Consumer grid promise has no grid here');
        const card = (p.children || []).find(c => c.id === 'course-import-card');
        assert.ok(card, 'the card table is on the panel');
        assert.match(card.innerHTML, /<td>7<\/td>/, 'hole 1 stroke index from the Blue tees');
        assert.equal((card.innerHTML.match(/<th>Hole<\/th>/g) || []).length, 2, 'two rows of nine');
        const btn = (p.children || []).find(c => c.id === 'course-import-confirm-btn');
        assert.ok(btn); assert.equal(btn.textContent, 'Use Talking Stick Piipaash — Scottsdale, AZ');
        assert.equal(sb.document.getElementById('course-key').value || '', '', 'not selected until the button');
        assert.equal(sb.__dbWrites.length, 0);
    });
    test('the tee chooser: every tee set listed, the canonical (longest men\'s) active; picking White re-validates and re-draws', async () => {
        const sb = arrive();
        const p = await toConfirm(sb);
        const chips = (p.children || []).find(c => c.id === 'course-import-tees').children;
        assert.deepEqual(chips.map(c => c.textContent), ['Blue 72.4/131', 'White 70.1/125', 'Red 69/118']);
        assert.ok(chips[0].className.includes('active'));
        chips[1].click();
        const p2 = panel(sb);
        const chips2 = (p2.children || []).find(c => c.id === 'course-import-tees').children;
        assert.ok(chips2[1].className.includes('active') && !chips2[0].className.includes('active'));
        const card = (p2.children || []).find(c => c.id === 'course-import-card');
        assert.match(card.innerHTML, /<td>13<\/td><td>7<\/td>/, 'holes 1-2 carry the White indexes now');
        assert.match(allText(p2), /came from this course's White tees/);
    });
    test('a tee whose card is refused: the reason is shown and the button is disabled; a valid tee re-enables it', async () => {
        const sb = arrive();
        const bad = JSON.parse(JSON.stringify(STICK_DETAIL));
        bad.tees.male[0].holes[3].handicap = 99;   // White, hole 4
        await searchAndOpen(sb, 'talking', OK([STICK]), { status: 'ok', course: bad });
        find(sb, /Talking Stick Piipaash/).click();
        await settle();
        let p = panel(sb);
        let btn = (p.children || []).find(c => c.id === 'course-import-confirm-btn');
        assert.equal(btn.disabled, false, 'Blue (canonical) is valid');
        (p.children || []).find(c => c.id === 'course-import-tees').children[1].click();
        p = panel(sb); btn = (p.children || []).find(c => c.id === 'course-import-confirm-btn');
        assert.equal(btn.disabled, true);
        assert.match(allText(p), /White: Hole 4 has handicap 99, which is outside 1-18\./);
        btn.click();
        assert.equal(sb.document.getElementById('course-key').value || '', '', 'a disabled confirm selects nothing');
        (p.children || []).find(c => c.id === 'course-import-tees').children[0].click();
        p = panel(sb); btn = (p.children || []).find(c => c.id === 'course-import-confirm-btn');
        assert.equal(btn.disabled, false);
    });
});

// ===========================================================================
describe('4. CONFIRM INLINES THE CARD - INTO THE EVENT, NEVER global_courses', () => {
    test('the button selects gca_<id> with the chosen tee\'s card; the panel goes; the box shows the name', async () => {
        const sb = arrive();
        const p = await toConfirm(sb);
        (p.children || []).find(c => c.id === 'course-import-confirm-btn').click();
        assert.equal(sb.document.getElementById('course-key').value, 'gca_a1b2c3d4');
        assert.equal(sb.document.getElementById('course-search-input').value, 'Talking Stick Piipaash');
        assert.equal(panel(sb), null);
        noGlobalWrite(sb);
    });
    test('Save writes the card into the record: activeCourseKey, courseData (18, Blue), synthetic false, importedCourses/gca_<id>', async () => {
        const sb = arrive();
        sb.__auth.setUser(ORGANIZER);
        sb.document.getElementById('t-name').value = 'Imported Event';
        const p = await toConfirm(sb);
        (p.children || []).find(c => c.id === 'course-import-confirm-btn').click();
        const d = sb.document; const list = d.getElementById('teams-list'); d.body.appendChild(list);
        const card = d.createElement('div'); card.className = 'team-card';
        const name = d.createElement('input'); name.className = 'team-name-input'; name.value = 'Eagles';
        const names = d.createElement('div'); names.className = 'team-name-inputs';
        ['Ann Alpha', 'Bo Bravo'].forEach(n => { const i = d.createElement('input'); i.value = n; names.appendChild(i); });
        const hcp = d.createElement('input'); hcp.className = 'team-handicap-input'; hcp.value = '0';
        card.appendChild(name); card.appendChild(names); card.appendChild(hcp); list.appendChild(card);
        await sb.saveTournament(); await settle();
        const set = sb.__dbWrites.find(w => /^tournaments\/[A-Z0-9]+$/.test(w.path) && w.op === 'set');
        assert.ok(set, JSON.stringify(sb.__dbWrites.map(w => w.path)));
        const v = set.value;
        assert.equal(v.activeCourseKey, 'gca_a1b2c3d4');
        assert.equal(v.courseName, 'Talking Stick Piipaash');
        assert.equal(v.courseData.length, 18);
        assert.equal(v.courseData[0].hcpIndex, 7); assert.equal(v.courseData[3].par, 5);
        assert.equal(v.courseIndexSynthetic, false);
        assert.ok(v.importedCourses && v.importedCourses.gca_a1b2c3d4, 'the import is kept on the event for later rounds');
        const imp = v.importedCourses.gca_a1b2c3d4;
        assert.equal(imp.name, 'Talking Stick Piipaash');
        assert.equal(imp.data.length, 18);
        assert.deepEqual(Object.keys(imp.source).sort(), ['importedAt', 'provider', 'providerCourseId', 'siFrom']);
        assert.equal(imp.source.siFrom, 'male/Blue');
        assert.equal(imp.source.providerCourseId, 'a1b2c3d4');
        noGlobalWrite(sb);
    });
    test('a directory pick after an import: importedCourses is not written when nothing was imported for it', async () => {
        const sb = arrive();
        sb.__auth.setUser(ORGANIZER);
        // seed a card for cameron the way it arrives - the page's own global_courses listener
        sb.__dbHandlers.filter(h => h.event === 'value' && /global_courses$/.test(h.path)).forEach(h => h.cb({ val: () => ({ cameron: { name: 'Cameron', data: holes(SI_BLUE).map((h, i) => ({ hole: i + 1, par: h.par, hcpIndex: h.handicap })) } }), exists: () => true }));
        sb.pickCourse('cameron', 'Cameron');
        assert.equal(sb.document.getElementById('course-key').value, 'cameron');
        noGlobalWrite(sb);
    });
});

// ===========================================================================
describe('5. THE SILENT FALLBACK IS GONE', () => {
    test('a directory course with no card anywhere is NOT selected; the row offers the online fetch by name', () => {
        const sb = arrive();
        stubFetch(sb, OK([]));
        typeCourse(sb, 'cameron');
        sb.pickCourse('cameron', 'Cameron');
        assert.equal(sb.document.getElementById('course-key').value || '', '', 'no card, no selection');
        const t = rows(sb).map(rowText).join(' | ');
        assert.match(t, /No card for Cameron yet\./);
        const r = onlineRow(sb);
        assert.ok(r && /Get the card for "Cameron" online/.test(rowText(r)));
        assert.equal(sb.__fetches.length, 0, 'offered, not spent');
    });
    test('the fetch row for a card-less pick searches the course NAME', async () => {
        const sb = arrive();
        stubFetch(sb, OK([]));
        typeCourse(sb, 'cameron');
        sb.pickCourse('cameron', 'Cameron');
        onlineRow(sb).click(); await settle();
        assert.equal(sb.__fetches[0], '/api/course-search?q=Cameron');
    });
    test('a directory course WITH a preset still selects at once, no request', () => {
        const sb = arrive();
        stubFetch(sb, OK([]));
        // caledonia is the first coursePresets key in course-data.js (18 holes).
        sb.pickCourse('caledonia', 'Caledonia Golf & Fish Club');
        assert.equal(sb.document.getElementById('course-key').value, 'caledonia');
        assert.equal(sb.__fetches.length, 0);
    });
    test('resolveCourseCard never fabricates: no eighteen par-4s indexed 1..18 in the page', () => {
        const at = SRC.indexOf('function resolveCourseCard(');
        const end = SRC.indexOf('\n    function ', at + 30);
        const fn = SRC.slice(at, end);
        assert.ok(fn.length > 80 && /globalCourses\[key\]/.test(fn), 'the function is there');
        assert.doesNotMatch(fn, /par: 4, hcpIndex: h/, 'the fabricated card is back');
        assert.doesNotMatch(fn, /synthetic: true/);
        assert.match(fn, /return null;/, 'no card is null, not fiction');
    });
    test('Save with no selected course is refused, and says so, and writes nothing', async () => {
        const sb = arrive();
        sb.__auth.setUser(ORGANIZER);
        const alerts = []; sb.alert = (m) => alerts.push(String(m));
        sb.document.getElementById('t-name').value = 'No Course';
        await sb.saveTournament(); await settle();
        assert.ok(alerts.some(m => /select a golf course/i.test(m)));
        assert.equal(sb.__dbWrites.filter(w => /^tournaments\//.test(w.path)).length, 0);
    });
});

// ===========================================================================
describe('6. MULTI-ROUND: a later round can pick the event\'s own import', () => {
    test('allCourses() lists importedCourses from the record, and setRoundCourse writes its card', () => {
        const sb = loadHtmlInlineScript(PAGE, [], { search: '?tourney=MR1' });
        sb.alert = () => {};
        sb.__auth.setUser(ORGANIZER);
        const rec = { name: 'Two Days', format: 'scramble', eventModel: 'rounds-v1', courseName: 'Talking Stick Piipaash', activeCourseKey: 'gca_a1b2c3d4',
            courseData: holes(SI_BLUE).map((h, i) => ({ hole: i + 1, par: h.par, hcpIndex: h.handicap })), courseIndexSynthetic: false, entryFee: 0, createdAt: 1, ownerUid: 'u-org',
            teams: { team1: { num: 1, name: 'Eagles', players: ['Ann Alpha'], handicap: 0 } },
            importedCourses: { gca_a1b2c3d4: { name: 'Talking Stick Piipaash', data: holes(SI_BLUE).map((h, i) => ({ hole: i + 1, par: h.par, hcpIndex: h.handicap })), source: { provider: 'golfcourseapi', providerCourseId: 'a1b2c3d4', siFrom: 'male/Blue', importedAt: 1 } } },
            rounds: { r1: { id: 'r1', name: 'Round 1', status: 'setup', createdAt: 1, format: 'scramble' }, r2: { id: 'r2', name: 'Round 2', status: 'setup', createdAt: 2, format: 'scramble' } } };
        sb.__dbHandlers.filter(h => h.event === 'value' && /tournaments\/MR1$/.test(h.path)).forEach(h => h.cb({ val: () => JSON.parse(JSON.stringify(rec)), exists: () => true }));
        assert.ok(sb.allCourses().gca_a1b2c3d4, 'the import is offered: ' + Object.keys(sb.allCourses()).join(','));
        sb.setRoundCourse('r2', 'gca_a1b2c3d4');
        const w = sb.__dbWrites.find(x => x.path === 'tournaments/MR1/rounds/r2' && x.op === 'update');
        assert.ok(w, JSON.stringify(sb.__dbWrites.map(x => x.path)));
        assert.equal(w.value.activeCourseKey, 'gca_a1b2c3d4');
        assert.equal(w.value.courseData.length, 18);
        assert.equal(w.value.courseIndexSynthetic, false);
        noGlobalWrite(sb);
    });
});

// ===========================================================================
describe('7. THE SEAMS', () => {
    test('no sentence on this page tells the organizer to type a card in', () => {
        const inline = [...SRC.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
        assert.doesNotMatch(inline, /type the card in|type it in below|card in below/i);
    });
    test('HANDOFF carries the reason this wave exists: 115 of 141, and the silent par-4 card', () => {
        const h = read('HANDOFF.md');
        const at = h.indexOf('## Tournament course search');
        assert.ok(at > 0, 'no course search section');
        const s = h.slice(at, at + 8000);
        assert.match(s, /115 of 141/);
        assert.match(s, /eighteen par-4s indexed 1\.\.18/);
        assert.match(s, /no global_courses write/i);
    });
    test('both caches moved for this wave (v43 / v168) and have not moved back', () => {
        // Later tournament waves move both keys on (v44 / v169: dark mode off;
        // v45 / v170: hero lockup); the Moved-to notes for this wave stay in
        // both files either way.
        assert.match(read('build-shell.js'), /Moved to v43\. Online course search on the setup picker/);
        assert.match(read('sw.js'), /Moved to v168: online course search on tournament\.html/);
        const t = /cacheName: 'tournament-v(\d+)-/.exec(read('build-shell.js'));
        const c = /const CACHE_VERSION = 'golfapp-v(\d+)-/.exec(read('sw.js'));
        assert.ok(t && Number(t[1]) >= 43, 'tournament key at or past v43: ' + (t && t[0]));
        assert.ok(c && Number(c[1]) >= 168, 'consumer key at or past v168: ' + (c && c[0]));
    });
});
