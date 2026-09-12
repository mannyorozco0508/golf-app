// ============================================================================
// FOUR COURSES NAMED "LEGACY GOLF CLUB" MUST NOT BECOME ONE PERMANENT RECORD.
//
// admin.html mints a key for an unmapped course as
//
//     "comm_" + name.toLowerCase().replace(/[^a-z0-9]/g, '')
//
// Measured against the four Legacy Golf Clubs the provider actually returns -
// Leitchfield KY, Henderson NV, Ottawa Lake MI, Norwalk IA - that is ONE KEY FOR
// ALL FOUR: comm_legacygolfclub.
//
// Import the Kentucky one today and the Nevada one next week and the second
// OVERWRITES the first, name and card together. global_courses/$courseId carries
// ".write": "newData.exists()", so a client may create and overwrite but never
// delete: there is no way back, from any page, ever. Four real courses collapse
// into one record and the only repair is the Firebase console.
//
// That is reachable today, by accident, through the ordinary save path. It is
// the worst outcome available in this feature and it is the first assertion in
// this file.
//
// THE FIX: an imported course is keyed on the provider's own id - gca_s21hccyk,
// gca_5ngjj512 - which is unique by construction, stable, and reversible.
//
// ---------------------------------------------------------------------------
// AND THE OTHER HALF: "NO COURSES FOUND" MUST NEVER MEAN "I COULD NOT ASK"
// ---------------------------------------------------------------------------
//
// The picker told a golfer "No courses found for X" when the course existed, and
// then offered to add a duplicate. The proxy already refuses to collapse its
// three shapes; this file holds the SURFACE to the same rule, so an online search
// that runs out of quota cannot re-create the defect one layer up.
//
// WHAT THIS FILE CANNOT PROVE. It calls builders. It cannot prove the dropdown
// renders the row, that tapping is the only trigger, that nothing auto-selects,
// or that a mid-import refusal leaves the grid blank - those need a browser and
// live in tools/course-import-check.js. Neither half is optional.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const PAGE = process.env.CIM_PAGE || 'admin.html';
let PAGEMOD = null;
let loadError = null;
try { PAGEMOD = loadHtmlInlineScript(PAGE, [], { only: false }); }
catch (e) { loadError = e; }

// CROSS-REALM VALUES NEED FLATTENING BEFORE deepEqual.
// loadHtmlInlineScript runs the page inside a vm sandbox, so anything the page
// builds is an Array from ANOTHER REALM - a different Array.prototype.
// assert.deepStrictEqual compares prototypes, so [1,2,3] from the sandbox is not
// deep-equal to [1,2,3] from here, and the failure reads "Values have same
// structure but are not reference-equal" - which looks like a real mismatch and
// is not. Round-tripping through JSON gives a plain host value.
const plain = (v) => JSON.parse(JSON.stringify(v));

const need = (name) => {
    if (loadError) assert.fail('admin.html did not load: ' + loadError.message);
    assert.equal(typeof PAGEMOD[name], 'function',
        `admin.html must expose ${name}() - the import cannot be tested through the wizard `
        + 'alone, and a rule written inline in a handler is a rule nothing can check');
    return PAGEMOD[name];
};

// ---------------------------------------------------------------------------
// THE FOUR REAL COURSES. Captured from the live provider during the evaluation:
// a search for "Legacy" returned all four of these, identically named, in four
// states. They are the fixture because they are the defect.
// ---------------------------------------------------------------------------
const FOUR_LEGACYS = [
    { id: 's21hccyk', club_name: 'Legacy Golf Club', course_name: 'Legacy Golf Club',
      location: { city: 'Leitchfield', state: 'KY', address: '397 Golfcourse Rd, Leitchfield, KY 42754, USA' }, tees: {} },
    { id: '5ngjj512', club_name: 'Legacy Golf Club', course_name: 'Legacy Golf Club',
      location: { city: 'Henderson', state: 'NV', address: '130 Par Excellence Drive, Henderson, NV 89074' }, tees: { male: 5, female: 3 } },
    { id: 'mfhj23vv', club_name: 'Legacy Golf Club', course_name: 'Legacy Golf Club',
      location: { city: 'Ottawa Lake', state: 'MI', address: '7677 US-223, Ottawa Lake, MI 49267, USA' }, tees: { male: 4, female: 4 } },
    { id: 'gves4t7j', club_name: 'Legacy Golf Club', course_name: 'Legacy Golf Club',
      location: { city: 'Norwalk', state: 'IA', address: '400 Legacy Pkwy, Norwalk, IA 50211, USA' }, tees: { male: 6, female: 6 } }
];
const PHOENIX = { id: 'bwcdmzcy', club_name: 'Legacy Golf Resort', course_name: 'Legacy Golf Resort',
    location: { city: 'Phoenix', state: 'AZ', address: '6808 S 32nd St, Phoenix, AZ 85042, USA' },
    tees: { male: 5, female: 3 } };

// THE OLD SCHEME, written out so the control below is a demonstration rather
// than a claim. This is admin.html:5157 verbatim.
const OLD_KEY = (name) => 'comm_' + String(name).toLowerCase().replace(/[^a-z0-9]/g, '');

// ===========================================================================
describe('1. FOUR IDENTICALLY NAMED COURSES PRODUCE FOUR DISTINCT KEYS', () => {

    test('the four Legacy Golf Clubs get four different keys', () => {
        const keyFor = need('importedCourseKey');
        const keys = FOUR_LEGACYS.map((c) => keyFor(c, {}));
        assert.equal(new Set(keys).size, 4,
            'four real courses, in four states, collapsed into '
            + new Set(keys).size + ' key(s): ' + JSON.stringify(keys)
            + '. Whichever is imported second OVERWRITES the first, permanently - '
            + 'global_courses/$courseId is ".write": "newData.exists()", so no client can '
            + 'ever undo it.');
    });

    test('each key is derived from the PROVIDER ID, not the name', () => {
        const keyFor = need('importedCourseKey');
        FOUR_LEGACYS.forEach((c) => {
            assert.equal(keyFor(c, {}), 'gca_' + c.id,
                'a key built from anything but the provider id cannot be unique - the name is '
                + 'identical across all four of these');
        });
    });

    test('THE CONTROL: the old scheme CANNOT satisfy the assertion above', () => {
        // Not a claim about the old code - a demonstration of it, run every time.
        // If this ever produces four keys, the collision this file exists for is
        // gone and the first assertion is no longer guarding anything.
        const old = FOUR_LEGACYS.map((c) => OLD_KEY(c.club_name));
        assert.equal(new Set(old).size, 1,
            'the old name-slug scheme no longer collides, so assertion 1 is no longer '
            + 'protecting against a real defect. Got: ' + JSON.stringify([...new Set(old)]));
        assert.equal(old[0], 'comm_legacygolfclub');
    });

    test('and a differently named course at the same club does not collide either', () => {
        const keyFor = need('importedCourseKey');
        assert.notEqual(keyFor(PHOENIX, {}), keyFor(FOUR_LEGACYS[0], {}));
    });
});

// ===========================================================================
describe('2. A NAME MATCH WRITES TO THE DIRECTORY KEY, AND THE PANEL SAYS SO', () => {

    // This is desirable, not a bug: 114 of the 141 directory entries have no
    // hole data, and an import filling one in is the whole point. What makes it
    // safe is that the golfer is TOLD, with the city the provider gave -
    // because the directory carries no city or state and cannot verify that a
    // name match is the same physical course.

    const CAMAS = { id: 'aaaa1111', club_name: 'Camas Meadows Golf Club',
        course_name: 'Camas Meadows Golf Club',
        location: { city: 'Camas', state: 'WA', address: '4105 NW Camas Meadows Dr, Camas, WA' },
        tees: { male: 4 } };

    test('an exact directory name match uses the DIRECTORY key, not a gca_ one', () => {
        const keyFor = need('importedCourseKey');
        const k = keyFor(CAMAS, {});
        assert.equal(k, 'swwa_camasmeadows',
            'an import whose name matches a directory entry must fill that entry in rather '
            + 'than create a second record for the same course. Got ' + k);
    });

    test('an existing global_courses name match wins too', () => {
        const keyFor = need('importedCourseKey');
        const existing = { some_existing_key: { name: 'Legacy Golf Resort', data: [] } };
        assert.equal(keyFor(PHOENIX, existing), 'some_existing_key');
    });

    test('the confirm panel NAMES the match and carries the provider city', () => {
        const note = need('importMatchNote');
        const text = note(CAMAS, 'swwa_camasmeadows', 'Camas Meadows Golf Club');
        assert.match(text, /Camas Meadows Golf Club/,
            'the note must name the course it is about to fill in');
        assert.match(text, /\bCamas\b/, 'the note must carry the city the PROVIDER gave');
        assert.match(text, /\bWA\b/, 'the note must carry the state the provider gave');
        assert.match(text, /already/i,
            'the note must say the course is already in the list, or a golfer cannot tell '
            + 'this from a fresh import');
    });

    test('the affirmative control names the course AND the city', () => {
        const label = need('importConfirmLabel');
        const t = label(PHOENIX);
        assert.match(t, /Legacy Golf Resort/);
        assert.match(t, /Phoenix/);
        assert.match(t, /\bAZ\b/);
        assert.ok(!/^(OK|Import|Confirm)$/i.test(t.trim()),
            'a bare "OK" lets a golfer confirm the wrong Legacy without reading anything');
    });

    // A REAL RECORD WITH NO CITY. Measured live on 2026-09-12 by
    // tools/golfcourse-contract-check.js --query "Golf Club": the first course
    // returned, kjr804p4 Gore Golf Club, carries location { state: "Unknown",
    // country: "Unknown" } - no city, no address. The fixtures above all have a
    // city, so nothing here knew the field is optional, and two golfer-facing
    // strings interpolated it raw. The result row at admin.html:3700 already
    // solves the same case with (L.city || '?'); these two must do the same.
    const GORE = { id: 'kjr804p4', club_name: 'Gore Golf Club', course_name: 'Gore Golf Club',
                   location: { state: 'Unknown', country: 'Unknown' }, tees: { female: 3, male: 2 } };

    test('a course with no city never prints the word "undefined" - the match note', () => {
        const note = need('importMatchNote');
        const text = note(GORE, 'gca_kjr804p4', 'Gore Golf Club');
        assert.ok(!/undefined/.test(text), 'the note printed "undefined": ' + text);
        assert.match(text, /\?, Unknown/, 'the missing city is shown the way the result row shows it: "?"');
        assert.match(text, /Gore Golf Club/);
    });

    test('a course with no city never prints the word "undefined" - the confirm button', () => {
        const label = need('importConfirmLabel');
        const t = label(GORE);
        assert.ok(!/undefined/.test(t), 'the confirm button printed "undefined": ' + t);
        assert.match(t, /\?, Unknown/, 'the missing city is shown the way the result row shows it: "?"');
        assert.match(t, /Gore Golf Club/);
    });

    test('and a record with no location at all is handled the same way', () => {
        const note = need('importMatchNote');
        const label = need('importConfirmLabel');
        const bare = { id: 'kjr804p4', club_name: 'Gore Golf Club', course_name: 'Gore Golf Club' };
        assert.ok(!/undefined/.test(note(bare, 'k', 'Gore Golf Club')));
        assert.ok(!/undefined/.test(label(bare)));
        assert.match(label(bare), /\?, \?/);
    });
});

// ===========================================================================
describe('4. EVERY unavailable REASON HAS ITS OWN MESSAGE', () => {

    const REASONS = ['query_too_short', 'not_configured', 'bad_course_id',
                     'rate_limited', 'daily_limit', 'upstream_error', 'network'];

    test('the reason list here matches the Function\'s, so none is unhandled', () => {
        need('onlineSearchMessage');
        const lib = fs.readFileSync(path.join(REPO_ROOT, 'functions/api/_lib.js'), 'utf8');
        const code = lib.replace(/(^|[^:])\/\/[^\n]*/g, '$1 ').replace(/\/\*[\s\S]*?\*\//g, ' ');
        REASONS.forEach((r) => assert.ok(code.includes("'" + r + "'"),
            `${r} is handled on the surface but the Function never emits it - this list has `
            + 'drifted from the one it is supposed to mirror'));
    });

    test('each reason produces a DISTINCT message', () => {
        const msg = need('onlineSearchMessage');
        const seen = new Map();
        REASONS.forEach((r) => {
            const m = msg(r);
            assert.ok(m && m.length > 10, `${r} has no message`);
            if (seen.has(m)) {
                assert.fail(`${r} and ${seen.get(m)} share a message: ${JSON.stringify(m)}. `
                    + 'A golfer who cannot search because the day is used up needs different '
                    + 'advice from one whose signal dropped.');
            }
            seen.set(m, r);
        });
    });

    test('NO message says "no courses found" or implies the course does not exist', () => {
        const msg = need('onlineSearchMessage');
        // THE WHOLE POINT OF THE FILE. Every one of these means we did not get
        // an answer. Saying anything about what exists is a lie we have already
        // told once, on the local picker, and paid for.
        const FORBIDDEN = [
            /no courses? found/i,
            /not (in|found in) (the |our )?(database|list)/i,
            /does ?n.t exist/i,
            /no (such )?course/i,
            /nothing (matched|found)/i
        ];
        REASONS.forEach((r) => {
            const m = msg(r);
            FORBIDDEN.forEach((re) => assert.ok(!re.test(m),
                `the message for "${r}" reads as a statement about what exists: `
                + JSON.stringify(m) + '. It means WE COULD NOT ASK.'));
        });
    });

    test('query_too_short is the one that is NOT about failure', () => {
        const msg = need('onlineSearchMessage');
        const m = msg('query_too_short');
        assert.match(m, /type|more|longer|characters/i,
            'query_too_short must tell the golfer what to do next, not report a failure. '
            + 'Nothing went wrong and nothing was spent. Got: ' + JSON.stringify(m));
        assert.ok(!/couldn.t|could not|unable|error|problem/i.test(m),
            'query_too_short is being reported as a failure: ' + JSON.stringify(m));
    });

    test('daily_limit says when it comes back, and offers the manual path', () => {
        const msg = need('onlineSearchMessage');
        const m = msg('daily_limit');
        assert.match(m, /tomorrow|today/i, 'daily_limit must say when it recovers');
        assert.match(m, /type|enter|yourself|below/i,
            'daily_limit must point at the manual path - a golfer on the first tee needs to '
            + 'be told they can still play');
    });
});

// ===========================================================================
describe('7. validateCourseGrid GATES EVERY WRITE', () => {

    test('an import that cannot produce a valid 18 is refused before any write', () => {
        const gate = need('importCardOrRefuse');
        // A provider record with a broken stroke index: 1-17 with 5 twice.
        const bad = { holes: [] };
        for (let i = 1; i <= 18; i++) {
            bad.holes.push({ par: 4, yardage: 350, handicap: i === 18 ? 5 : i });
        }
        const res = gate(bad);
        assert.equal(res.ok, false,
            'an 18 whose stroke indexes are not a clean permutation of 1-18 was accepted. '
            + 'validateCourseGrid refuses that, the Firebase rules refuse that, and an import '
            + 'must refuse it before spending a write on it.');
        assert.ok(res.reason && res.reason.length > 5, 'a refusal must say why');
    });

    test('a good card passes and comes back in the canonical shape', () => {
        const gate = need('importCardOrRefuse');
        const good = { holes: [] };
        const SI = [10, 6, 16, 12, 14, 2, 18, 8, 4, 9, 11, 3, 15, 1, 13, 17, 5, 7];
        const PAR = [4, 4, 4, 3, 4, 5, 3, 5, 4, 4, 3, 4, 4, 5, 3, 4, 3, 5];
        for (let i = 0; i < 18; i++) good.holes.push({ par: PAR[i], yardage: 400, handicap: SI[i] });
        const res = gate(good);
        assert.equal(res.ok, true, 'a valid provider card was refused: ' + res.reason);
        assert.equal(res.data.length, 18);
        assert.deepEqual(plain(res.data.map((h) => h.hole)), Array.from({ length: 18 }, (_, i) => i + 1));
        assert.deepEqual(plain(res.data.map((h) => h.par)), PAR);
        assert.deepEqual(plain(res.data.map((h) => h.hcpIndex)), SI);
    });

    test('a course with NO tee data is refused without pretending', () => {
        const gate = need('importCardOrRefuse');
        const res = gate({ holes: [] });
        assert.equal(res.ok, false);
    });

    test('the refusal happens in SOURCE before the write, not after', () => {
        // Order is not observable from the builder alone - the call site decides
        // it. Pinned here because getting it wrong means a refused card still
        // reaches global_courses, where no client can delete it.
        const src = fs.readFileSync(path.join(REPO_ROOT, PAGE), 'utf8');
        const code = src.replace(/(^|[^:])\/\/[^\n]*/g, '$1 ').replace(/\/\*[\s\S]*?\*\//g, ' ');
        const gateAt = code.indexOf('importCardOrRefuse');
        const writeAt = code.indexOf('global_courses/${importKey}');
        assert.ok(gateAt > -1, 'importCardOrRefuse is never called');
        assert.ok(writeAt > -1, 'the import write was not found under the expected key name');
        assert.ok(gateAt < writeAt,
            'the import writes before it validates. A card the validator would refuse would '
            + 'reach a record no client can delete.');
    });
});

// ===========================================================================
describe('6. THE IMPORTED RECORD IS THE SHAPE WE AGREED', () => {

    const DETAIL = {
        id: 'bwcdmzcy', club_name: 'Legacy Golf Resort', course_name: 'Legacy Golf Resort',
        location: { address: '6808 S 32nd St, Phoenix, AZ 85042, USA', city: 'Phoenix',
                    state: 'AZ', country: 'United States' },
        tees: {
            male: [{ tee_name: 'Copper', course_rating: 72.1, slope_rating: 128,
                     total_yards: 6768, par_total: 71,
                     holes: Array.from({ length: 18 }, (_, i) => ({ par: 4, yardage: 400, handicap: i + 1 })) },
                   { tee_name: 'White/Purple', course_rating: 66.6, slope_rating: 113,
                     total_yards: 5664, par_total: 71,
                     holes: Array.from({ length: 18 }, (_, i) => ({ par: 4, yardage: 350, handicap: i + 1 })) }],
            female: [{ tee_name: 'Purple', course_rating: 70.5, slope_rating: 118,
                       total_yards: 5402, par_total: 71,
                       holes: Array.from({ length: 18 }, (_, i) => ({ par: 4, yardage: 320, handicap: i + 1 })) }]
        }
    };

    test('data[18] is canonical and in the existing shape', () => {
        const build = need('buildImportRecord');
        const rec = build(PHOENIX, DETAIL, 'male/Copper');
        assert.equal(rec.data.length, 18);
        ['hole', 'par', 'hcpIndex'].forEach((k) => assert.ok(k in rec.data[0],
            `data[] lost ${k} - every existing reader expects it`));
        assert.equal(typeof rec.name, 'string');
    });

    test('tees are ARRAYS, not a map keyed by tee name', () => {
        const build = need('buildImportRecord');
        const rec = build(PHOENIX, DETAIL, 'male/Copper');
        assert.ok(Array.isArray(rec.tees.male), 'tees.male must be an array');
        assert.ok(Array.isArray(rec.tees.female), 'tees.female must be an array');
        // AND THE REASON, ASSERTED. Firebase keys cannot contain a forward
        // slash, and this real course has a tee called "White/Purple". A map
        // keyed by tee name needs escaping, and escaping gets done
        // inconsistently.
        const names = rec.tees.male.map((t) => t.name || t.tee_name);
        assert.ok(names.includes('White/Purple'),
            'the tee named "White/Purple" did not survive - if it became a KEY it could not, '
            + 'which is why tees are arrays');
    });

    test('source.siFrom records WHICH tee the stroke index came from', () => {
        const build = need('buildImportRecord');
        const rec = build(PHOENIX, DETAIL, 'male/Copper');
        assert.equal(rec.source.siFrom, 'male/Copper',
            'without siFrom, a womens round allocated on mens indexes is undetectable '
            + 'afterwards');
        assert.equal(rec.source.providerCourseId, 'bwcdmzcy',
            'providerCourseId is the only thing that lets a single course be re-fetched later '
            + 'without spending a search request to find it again');
        assert.equal(rec.source.provider, 'golfcourseapi');
        assert.ok(rec.source.importedAt > 0);
    });

    test('location is carried, and no lat/long is invented', () => {
        const build = need('buildImportRecord');
        const rec = build(PHOENIX, DETAIL, 'male/Copper');
        assert.equal(rec.location.city, 'Phoenix');
        assert.equal(rec.location.state, 'AZ');
        const s = JSON.stringify(rec);
        assert.ok(!/\blat\b|\blng\b|\blatitude\b|\blongitude\b/i.test(s),
            'the record carries coordinates. The provider has none - measured twice - so any '
            + 'that appear here were invented.');
    });

    test('the record carries nothing the rules would refuse', () => {
        const build = need('buildImportRecord');
        const rec = build(PHOENIX, DETAIL, 'male/Copper');
        const rules = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'database.rules.json'), 'utf8'));
        const v = rules.rules.global_courses.$courseId['.validate'];
        assert.match(v, /hasChildren\(\['name','data'\]\)/,
            'the rule this record is shaped for has changed');
        assert.ok(rec.name.length > 0 && rec.name.length <= 120,
            'name must be 1-120 chars or the server refuses the whole write');
        rec.data.forEach((h, i) => {
            assert.ok(h.par >= 3 && h.par <= 6, `hole ${i + 1} par ${h.par} is outside 3-6`);
            assert.ok(h.hcpIndex >= 1 && h.hcpIndex <= 18, `hole ${i + 1} hcpIndex out of range`);
        });
    });
});

// ===========================================================================
describe('7. THE LIST WAS CUT - /v1/search stops at 25 and says nothing', () => {
    // MEASURED, 2026-09-12, six live requests: a query matching hundreds of
    // courses returns exactly 25, in the same order, whatever paging parameter
    // is sent (page, current_page, page_size, offset all ignored), with no
    // total_records and nothing beside `courses`. So 25 means "possibly cut",
    // never "25 matched" - the API does not say how many matched and neither
    // may the picker. Fewer than 25 means the list is complete; say nothing.
    // The notice must sit BEFORE any offer to add the course as new, because
    // adding creates a key no client can delete, and the golfer's course may
    // simply be the 26th match.
    //
    // Reached the way a tap reaches it: the online row's onclick is
    // runOnlineCourseSearch(typedName, row) - asserted from source below - and
    // the only thing replaced is the network.
    const dropdown = () => PAGEMOD.document.getElementById('course-dropdown');
    const courses = (n) => [...Array(n)].map((_, i) => ({
        id: 'c' + String(i).padStart(7, '0'), club_name: 'Club ' + i, course_name: 'Course ' + i,
        location: { city: 'Town', state: 'ST', country: 'United States' }, tees: { male: 1 }
    }));
    async function searchOnline(n) {
        if (loadError) assert.fail('admin.html did not load: ' + loadError.message);
        PAGEMOD.fetch = async () => ({ json: async () => ({ status: 'ok', courses: courses(n) }) });
        await need('runOnlineCourseSearch')('golf club', null);
        return dropdown().children;
    }
    const isRow = (el) => /course-online-result/.test(el.className || '');
    const isAdd = (el) => /custom-select-add-option/.test(el.className || '');
    const isNotice = (el) => !isRow(el) && !isAdd(el) && /\b25\b/.test(el.textContent || '')
        && /narrow|shorter|more specific|try/i.test(el.textContent || '');

    test('the online row reaches the search through runOnlineCourseSearch', () => {
        const src = fs.readFileSync(path.join(REPO_ROOT, PAGE), 'utf8');
        assert.match(src, /online\.onclick = \(\) => \{ runOnlineCourseSearch\(typedName, online\); \};/);
    });

    test('at exactly 25 results the picker says the list was cut', async () => {
        const kids = await searchOnline(25);
        assert.equal(kids.filter(isRow).length, 25, 'all 25 result rows still render');
        const notices = kids.filter(isNotice);
        assert.equal(notices.length, 1, 'one notice, naming 25 and telling the golfer to narrow the search: '
            + JSON.stringify(kids.map(k => (k.textContent || '').slice(0, 60))));
    });

    test('the notice does not claim to know how many matched', async () => {
        const kids = await searchOnline(25);
        const text = kids.filter(isNotice).map(k => k.textContent).join(' ');
        assert.ok(!/\d+\s+(courses?\s+)?match/i.test(text), 'claims a match count: ' + text);
        assert.ok(!/\bof\s+\d+/i.test(text), 'claims a total ("of N"): ' + text);
        assert.ok(!/\btotal\b|\ball\s+\d+/i.test(text), 'claims a total: ' + text);
        assert.ok(!/\bexactly\b/i.test(text), '25 is a ceiling, not a count: ' + text);
    });

    test('the notice comes BEFORE the offer to add the course as new', async () => {
        const kids = await searchOnline(25);
        const n = kids.findIndex(isNotice);
        const a = kids.findIndex(isAdd);
        assert.ok(n >= 0, 'no notice');
        assert.ok(a >= 0, 'at 25 the golfer\'s course may be the 26th match - the add row must be offered, after the notice');
        assert.ok(n < a, `the notice (index ${n}) must sit above the add row (index ${a})`);
        // And the rows themselves are untouched: every row is still name + city line.
        kids.filter(isRow).forEach(r => assert.equal(r.children.length, 2, 'a result row is title + sub, unchanged'));
    });

    test('at 24 results nothing is said and nothing is offered - the list is complete', async () => {
        const kids = await searchOnline(24);
        assert.equal(kids.filter(isRow).length, 24);
        assert.equal(kids.filter(isNotice).length, 0, 'a complete list carries no notice');
        assert.equal(kids.filter(isAdd).length, 0, 'a complete list offers no duplicate');
    });

    test('at 26 - which the API never returns - the notice still fires, so a raised ceiling is not silently missed', async () => {
        const kids = await searchOnline(26);
        assert.equal(kids.filter(isNotice).length, 1);
    });
});
