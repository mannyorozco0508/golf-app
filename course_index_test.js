// ============================================================================
// THE SHARED COURSE LIST IS NO LONGER DOWNLOADED WHOLE ON EVERY SETUP LOAD
//
// MEASURED, 2026-10-03, against the live database over REST (the node carries
// `.read: true`, so this is a public read anyone can repeat):
//
//     global_courses                       61,258 bytes, 42 courses
//     global_courses?shallow=true             941 bytes, the same 42 keys
//     one API-imported record (gca_4ad33747) 8,576 bytes
//     average record                        1,440 bytes
//
// FOUR PLACES READ THE WHOLE NODE: admin.html (a live .on('value')),
// tournament.html (the same), and trip.html twice (once('value')). index.html
// does not read it at all. So every golfer opening a setup page downloads every
// course anybody has ever imported - and that payload grows by roughly 8 KB each
// time somebody imports one. At 500 courses it is 4.3 MB a load, against a Spark
// download quota of 10 GB a month.
//
// WHAT THIS WAVE DOES, AND THE ONE THING IT CANNOT DO. ?shallow=true IS A REST
// PARAMETER AND THE FIREBASE JS SDK HAS NO EQUIVALENT - there is no shallow read
// on a `ref`, so this cannot be fixed by changing a query. The shape here is:
//
//   1. A REST probe for the KEY LIST - 941 bytes, and it stays small forever
//      because keys are 8-character ids.
//   2. A NAME INDEX in localStorage. Keys alone cannot name a course, so a
//      device with no cache still has to read the full node ONCE to build it.
//   3. A PER-COURSE read of global_courses/<key> when a course is selected,
//      which is the only moment the card is needed.
//
// SO THE WIN IS ON THE SECOND LOAD ONWARDS, which is every load a regular
// organizer makes. Cold: 941 + 61,258 once. Warm: 941 bytes, plus one record for
// a course added since the last visit, plus one record when a course is picked.
//
// CARDS ARE DELIBERATELY NOT CACHED, ONLY NAMES. The probe can see a key appear
// or disappear; it cannot see a record CHANGE. A cached card that had been
// corrected upstream would hand a round the wrong par and stroke index, and
// stroke index is what decides where a handicap stroke falls and therefore who
// wins money. A name going stale costs a wrong label for at most a week (the
// index carries a TTL); a card going stale costs somebody a payout. So the
// selected course's record is always read fresh.
//
// THE HARNESS CANNOT PROVE THE localStorage HALF. helpers/mini-dom.js stubs
// localStorage with something that does not store, so a round trip through it is
// untestable here - every function below takes the stored TEXT as an argument
// and returns the text to store, which is the half that holds the logic. The
// wiring is proven in headless Chrome by tools/course-index-check.js.
//
// BASELINE. Against pre-build main (d147a8a) this file cannot report per-test at
// all: course-index.js does not exist, the require throws at load, and node
// reports the FILE as one failing test. 1 test / 0 pass / 1 fail is honest and
// proves nothing per assertion, so the useful baseline is taken from the state
// where every assertion actually runs.
//
// MEASURED with a stub course-index.js in place - every exported name present as
// a function returning undefined, the pages otherwise untouched - over the
// FINISHED file, all 40 tests: 9 PASS / 31 FAIL. The module was restored from a
// saved copy by sha (ef50180ac203), never with git restore.
//
//   THE NINE THAT PASS ARE THE WAVE'S SHAPE, NOT ITS BEHAVIOUR, and they pass
//   because the three PAGES were already wired when the stub went in: the export
//   list, the var/function and no-DOM scans of the stub itself, the shell and
//   SHARED_SHELL membership, the script tags, the absence of the live listeners,
//   the one-loader count, the per-course read, and admin.html's import write
//   (which main already gets right and this wave carries forward).
//
//   So the source scans are measured against a tree where the pages had moved
//   and the logic had not. That is the honest reading and it is why section 7
//   exists: the 31 reds are every claim about what the loader actually DOES, and
//   every one of them is driven through counted fakes rather than read out of
//   the file.
//
// AND THE STUB CAUGHT THREE INERT TESTS OF MY OWN. The first draft used
// assert.equal for "this must be null", and `assert.equal(undefined, null)`
// PASSES - loose equality - so the stub satisfied the failed-probe block, the
// garbage-cache block and the future-stamp test while doing nothing at all. They
// are strictEqual now, each with a positive assertion beside it so a function
// that refuses everything cannot satisfy them either.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const IDX = require('./course-index.js');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

const DB = 'https://golfapp-9fb21-default-rtdb.firebaseio.com';
const NOW = Date.UTC(2026, 9, 3, 16, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

// ===========================================================================
describe('1. THE PROBE URL AND THE KEY LIST', () => {

    test('every export is a function', () => {
        ['courseIndexShallowUrl', 'courseIndexKeysFrom', 'courseIndexStubs',
         'courseIndexPlan', 'courseIndexNamesFrom', 'courseIndexSerialise',
         'courseIndexParse', 'courseIndexBytes'].forEach((n) => {
            assert.equal(typeof IDX[n], 'function', 'course-index.js must export ' + n);
        });
    });

    test('the probe asks for shallow - without it the URL downloads everything', () => {
        const u = IDX.courseIndexShallowUrl(DB);
        assert.match(u, /^https:\/\/golfapp-9fb21-default-rtdb\.firebaseio\.com\/global_courses\.json\?shallow=true$/,
            'got ' + u + '. shallow=true is the whole point: without it this URL is the 61 KB '
            + 'download the wave exists to remove.');
        assert.equal(IDX.courseIndexShallowUrl(DB + '/'), u, 'a trailing slash must not double up');
    });

    test('a shallow body is a flat map of key -> true, and only keys survive', () => {
        assert.deepEqual(IDX.courseIndexKeysFrom({ gca_4ad33747: true, caledonia: true }),
            ['caledonia', 'gca_4ad33747'], 'sorted, so a diff is stable');
    });

    test('A FAILED OR EMPTY PROBE IS NOT AN EMPTY DATABASE', () => {
        // The difference matters: [] would mean "drop every name you have
        // cached", which on a dropped signal would empty the picker. null says
        // "I do not know", and the plan below keeps the cache on null.
        [null, undefined, '', 0, [], 'nope', { }].forEach((v) => {
            // strictEqual, NOT equal. `assert.equal(undefined, null)` PASSES -
            // loose equality - so a stub that returns nothing satisfied this
            // assertion when it was first written, which is exactly the inert
            // test the baseline above had to admit to.
            assert.strictEqual(IDX.courseIndexKeysFrom(v), null,
                JSON.stringify(v) + ' must be "unknown", never "no courses"');
        });
    });

    test('courseIndexBytes reports the measured sizes this wave is justified by', () => {
        const b = IDX.courseIndexBytes();
        assert.equal(b.wholeNode, 61258, 'the measured full-node payload');
        assert.equal(b.shallow, 941, 'the measured shallow payload');
        assert.equal(b.courses, 42, 'the measured course count');
        assert.ok(b.wholeNode / b.shallow > 60,
            'the ratio this wave claims is 65x; if these numbers change, the claim changes');
    });
});

// ===========================================================================
describe('2. STUBS: A NAME IS ENOUGH TO DRAW THE PICKER', () => {

    test('courseIndexStubs turns a name index into the map the pages already read', () => {
        const stubs = IDX.courseIndexStubs({ caledonia: 'Caledonia Golf & Fish Club' });
        assert.deepEqual(stubs, { caledonia: { name: 'Caledonia Golf & Fish Club' } });
    });

    test('A STUB CARRIES NO data KEY - a half-record must not look like a card', () => {
        // Three places read globalCourses[key].data synchronously. If a stub
        // carried `data: []` or `data: null`, those branches would take the
        // "mapped" path and build a round off nothing.
        const stubs = IDX.courseIndexStubs({ a: 'A', b: 'B' });
        Object.keys(stubs).forEach((k) => {
            assert.ok(!('data' in stubs[k]),
                'a stub carries a data key. buildCourseData would read it as a real card.');
            assert.ok(!('tees' in stubs[k]), 'a stub must not look like it has rated tees');
        });
    });

    test('a nameless or blank entry is dropped, not stubbed as undefined', () => {
        const stubs = IDX.courseIndexStubs({ a: 'A', b: '', c: null, d: '   ' });
        assert.deepEqual(Object.keys(stubs), ['a'],
            'a stub with no name renders a blank row in the picker that cannot be identified');
    });

    test('courseIndexNamesFrom builds the index from full records, ignoring the cards', () => {
        const names = IDX.courseIndexNamesFrom({
            caledonia: { name: 'Caledonia', data: [1, 2, 3], tees: { male: [] } },
            broken: { data: [1] },
            gca_zz: { name: 'Quintero' }
        });
        assert.deepEqual(names, { caledonia: 'Caledonia', gca_zz: 'Quintero' },
            'only key -> name; a record with no name cannot be offered');
    });
});

// ===========================================================================
describe('3. THE PLAN: WHAT TO FETCH, AND HOW LITTLE', () => {

    const cached = { a: 'Course A', b: 'Course B' };

    test('no cache at all -> read the whole node once, and say so', () => {
        const p = IDX.courseIndexPlan(null, ['a', 'b'], NOW);
        assert.equal(p.use, 'full');
        assert.deepEqual(p.missing, []);
        assert.equal(p.names, null, 'there is nothing to draw with until the full read lands');
    });

    test('cache matches the live keys -> ZERO further reads. This is the win.', () => {
        const p = IDX.courseIndexPlan({ names: cached, at: NOW - DAY }, ['a', 'b'], NOW);
        assert.equal(p.use, 'cache');
        assert.deepEqual(p.missing, [], 'a matching cache must cost no RTDB read at all');
        assert.deepEqual(p.names, cached);
    });

    test('ONE NEW COURSE -> one record, not the whole node', () => {
        const p = IDX.courseIndexPlan({ names: cached, at: NOW - DAY }, ['a', 'b', 'gca_new1'], NOW);
        assert.equal(p.use, 'cache');
        assert.deepEqual(p.missing, ['gca_new1'],
            'the whole point: a course added by somebody else costs one record, not 61 KB');
        assert.deepEqual(p.names, cached, 'the cached names are usable immediately');
    });

    test('a course REMOVED upstream is dropped from the names we draw with', () => {
        const p = IDX.courseIndexPlan({ names: cached, at: NOW - DAY }, ['a'], NOW);
        assert.deepEqual(p.names, { a: 'Course A' });
        assert.deepEqual(p.missing, []);
    });

    test('A LOT OF NEW COURSES -> fall back to the whole node, because 30 reads beat nothing', () => {
        // Thirty separate reads of ~1.4 KB each is slower and more expensive than
        // one read of the node. The threshold exists so a device that has been
        // away for a season does not open thirty connections.
        const live = ['a', 'b'];
        for (let i = 0; i < 30; i++) live.push('gca_new' + i);
        const p = IDX.courseIndexPlan({ names: cached, at: NOW - DAY }, live, NOW);
        assert.equal(p.use, 'full',
            'thirty per-course reads is worse than one full read - the plan must notice');
    });

    test('AN EXPIRED INDEX IS REBUILT - a renamed course cannot be wrong for ever', () => {
        const p = IDX.courseIndexPlan({ names: cached, at: NOW - 8 * DAY }, ['a', 'b'], NOW);
        assert.equal(p.use, 'full',
            'the probe cannot see a record change, only keys appear and disappear. A TTL is '
            + 'the only thing that ever corrects a renamed course.');
    });

    test('A FAILED PROBE KEEPS THE CACHE - it does NOT empty the picker', () => {
        const p = IDX.courseIndexPlan({ names: cached, at: NOW - DAY }, null, NOW);
        assert.equal(p.use, 'cache');
        assert.deepEqual(p.names, cached);
        assert.deepEqual(p.missing, []);
    });

    test('a failed probe AND no cache -> the whole node, which is todays behaviour exactly', () => {
        const p = IDX.courseIndexPlan(null, null, NOW);
        assert.equal(p.use, 'full',
            'with no probe and no cache there is nothing to be clever with, and the page must '
            + 'still work - that means the read it always did');
    });
});

// ===========================================================================
describe('4. THE CACHE IS TEXT, AND EVERY WAY IT CAN BE WRONG IS HANDLED', () => {

    test('a round trip through serialise/parse keeps the names and the stamp', () => {
        const text = IDX.courseIndexSerialise({ a: 'A' }, NOW);
        const back = IDX.courseIndexParse(text, NOW);
        assert.deepEqual(back.names, { a: 'A' });
        assert.equal(back.at, NOW);
    });

    test('GARBAGE IN localStorage IS NOT A CRASH - every form returns null', () => {
        // localStorage is shared per origin and survives everything: an older
        // version of this app, a half-written value, a different app on the same
        // host. A throw here happens before the page has drawn anything.
        ['', '{', 'null', '[]', '"a"', '{"names":"notanobject"}', '{"at":"soon","names":{}}',
         '{"v":99,"at":1,"names":{"a":"A"}}', JSON.stringify({ v: 1, at: NOW })].forEach((t) => {
            assert.strictEqual(IDX.courseIndexParse(t, NOW), null, JSON.stringify(t) + ' did not return null');
        });
        assert.strictEqual(IDX.courseIndexParse(null, NOW), null);
        assert.strictEqual(IDX.courseIndexParse(undefined, NOW), null);
        // And the positive control beside them, so a function that refuses
        // EVERYTHING cannot satisfy this block (CLAUDE.md: a slice of negatives
        // guards an empty string forever).
        assert.deepEqual(IDX.courseIndexParse(IDX.courseIndexSerialise({ a: 'A' }, NOW), NOW).names,
            { a: 'A' }, 'a good cache must still parse - otherwise this block is satisfied by a refusal');
    });

    test('A STAMP IN THE FUTURE IS REJECTED - a wrong device clock must not pin the cache', () => {
        const text = IDX.courseIndexSerialise({ a: 'A' }, NOW + 30 * DAY);
        assert.strictEqual(IDX.courseIndexParse(text, NOW), null,
            'a clock set forward would otherwise make the index never expire');
        assert.deepEqual(IDX.courseIndexParse(IDX.courseIndexSerialise({ a: 'A' }, NOW - 1000), NOW).names,
            { a: 'A' }, 'a stamp slightly in the past is normal and must be accepted');
    });

    test('the serialised form carries names ONLY - no cards, however they arrived', () => {
        const text = IDX.courseIndexSerialise({ a: 'A' }, NOW);
        assert.ok(!/data|hcpIndex|tees|slope/.test(text),
            'a card reached localStorage: ' + text + '. Cards are never cached - a stale stroke '
            + 'index moves money.');
        assert.ok(text.length < 400, 'the whole index for one course should be tiny');
    });
});

// ===========================================================================
describe('5. THE MODULE SHIPS, AND IT IS LOADABLE BY A PAGE', () => {

    test('plain var/function declarations - a const here is a SyntaxError in any page that re-declares', () => {
        const m = read('course-index.js');
        assert.doesNotMatch(m, /^\s*const course/m,
            'tournament.html learned this with PLAYER_MODEL: a page-level const over a module '
            + 'const kills the whole inline script');
        assert.doesNotMatch(m, /^\s*let course/m);
        assert.match(m, /^function courseIndexPlan\(/m);
    });

    test('NO DOM, NO db, NO localStorage CALL INSIDE THE MODULE', () => {
        const m = read('course-index.js').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ').replace(/\/\*[\s\S]*?\*\//g, ' ');
        ['document.', 'window.', 'firebase.', 'localStorage'].forEach((bad) => {
            assert.ok(!m.includes(bad),
                'course-index.js touches ' + bad + '. It is the pure half on purpose: the pages '
                + 'own the IO, and this file stays testable without a browser.');
        });
    });

    test('it is in the service-worker shell and in SHARED_SHELL, so it ships to both products', () => {
        assert.match(read('sw.js'), /'\.\/course-index\.js'/,
            'a page loads it UNGUARDED, so a cached shell without it throws before the setup '
            + 'page draws anything - not a degraded picker, a dead screen');
        // build-shell.js never names a file: it reads SHARED_SHELL,
        // CONSUMER_SHELL and TOURNAMENT_SHELL out of sync-mobile-web.js so
        // membership is declared once. So the declaration is what to assert, and
        // it has to be in the SHARED block specifically - tournament.html needs
        // it too, and a CONSUMER-only entry would ship a broken Tournament.
        const sync = read('sync-mobile-web.js');
        const shared = /const SHARED_SHELL = \[([\s\S]*?)\];/.exec(sync);
        assert.ok(shared, 'SHARED_SHELL is not declared in sync-mobile-web.js any more');
        assert.match(shared[1], /'course-index\.js'/,
            'course-index.js is not in SHARED_SHELL, so one of the two products ships without it');
    });

    test('every page that reads the course list loads it', () => {
        ['admin.html', 'tournament.html', 'trip.html'].forEach((f) => {
            assert.match(read(f), /<script src="course-index\.js"><\/script>/, f + ' does not load it');
        });
    });
});

// ===========================================================================
describe('6. NO PAGE HOLDS A LIVE LISTENER ON THE WHOLE NODE', () => {

    // WHAT THIS CAN AND CANNOT ASSERT. The cold path still reads the node whole,
    // once, and must - keys cannot name a course. So "no whole-node read in the
    // source" would be a false claim, and a test asserting it would have to be
    // satisfied by deleting the fallback that makes a fresh device work at all.
    //
    // What IS assertable here is the shape: the live listener is gone, every
    // whole-node read is reached through the one loader, and a per-course read
    // exists. The behavioural claim - a warm cache costs ZERO node reads - is
    // section 7, driven through the loader with counted fakes, because that is
    // the only place it can be measured rather than inferred.
    const PAGES = ['admin.html', 'tournament.html', 'trip.html'];
    // CODE ONLY - COMMENTS STRIPPED, AND I NEEDED IT. The first version of this
    // scan matched admin.html's own comment explaining that the listener had
    // been removed: "This was `db.ref('global_courses').on('value')`". That is
    // the third time in this repo a guard has been tripped by the sentence
    // describing the thing it bans. The claim is about what the page RUNS.
    const code = (f) => read(f).replace(/(^|[^:])\/\/[^\n]*/g, '$1 ').replace(/\/\*[\s\S]*?\*\//g, ' ');

    test('THE LIVE .on(\'value\') LISTENERS ARE GONE', () => {
        PAGES.forEach((f) => {
            assert.ok(!/ref\(['"`]global_courses['"`]\)\s*\.\s*on\(/.test(code(f)),
                f + ' still holds a live listener on the WHOLE node - that is 61 KB on every '
                + 'load plus a push of all of it whenever anybody imports a course');
        });
    });

    test('every whole-node read goes through the ONE loader, and there is at most one per page', () => {
        PAGES.forEach((f) => {
            const src = code(f);
            assert.match(src, /courseIndexLoader\(\{/, f + ' does not use the shared loader');
            const whole = (src.match(/ref\(['"`]global_courses['"`]\)\s*\.\s*once\(/g) || []).length;
            assert.ok(whole <= 1,
                f + ' has ' + whole + ' whole-node reads. One is the loader\'s readAll - the cold '
                + 'path a fresh device needs. More than one is a copy that will drift.');
        });
    });

    test('a PER-COURSE read exists on all three - the cards did not simply disappear', () => {
        PAGES.forEach((f) => {
            assert.match(code(f), /global_courses\/['"`]?\s*\+|global_courses\/\$\{/,
                f + ' never reads a single course, so no card can ever be found');
        });
    });

    test('admin.html still WRITES whole records, and still never deletes', () => {
        assert.match(read('admin.html'), /ref\(`global_courses\/\$\{importKey\}`\)\.update\(rec\)/,
            'the import write is what makes a course fetched from the provider once ever');
    });
});

// ===========================================================================
describe('7. THE LOADER, DRIVEN WITH COUNTED FAKES - WHERE THE WIN IS MEASURED', () => {

    // The source scans above prove the shape. These prove the cost, which is the
    // actual claim of the wave. Every dependency is counted, so "zero reads"
    // is a measurement and not a reading of the code.
    function rig(over) {
        const o = over || {};
        const calls = { readAll: 0, readRecord: [], fetchJson: 0, apply: 0, setItem: [] };
        const store = Object.prototype.hasOwnProperty.call(o, 'stored') ? { v: o.stored } : { v: null };
        const into = o.into || {};
        const loader = IDX.courseIndexLoader({
            into: into,
            databaseURL: DB,
            now: () => (o.now || NOW),
            readRecord: (k) => { calls.readRecord.push(k); return Promise.resolve((o.records || {})[k] || null); },
            readAll: () => { calls.readAll++; return Promise.resolve(o.all || {}); },
            fetchJson: () => { calls.fetchJson++; return Promise.resolve(o.shallow === undefined ? null : o.shallow); },
            getItem: () => store.v,
            setItem: (k, v) => { calls.setItem.push(v); store.v = v; },
            onApply: () => { calls.apply++; }
        });
        return { loader, calls, into, store };
    }

    test('A COLD DEVICE reads the node once, AND DOES NOT PROBE FIRST', async () => {
        const r = rig({ all: { a: { name: 'A', data: [1] }, b: { name: 'B', data: [2] } } });
        await r.loader.load();
        assert.equal(r.calls.readAll, 1, 'a cold device must read the node, exactly once');
        assert.equal(r.calls.fetchJson, 0,
            'the probe only exists to diff against a CACHE. With nothing cached the plan is '
            + '"full" whatever the probe says, so asking first just puts a network round trip '
            + 'in front of the read - and a first paint that waits on a request it does not '
            + 'need is a page that races. tools/tournament-net-reachable-check.js caught '
            + 'exactly that inside the full suite.');
        assert.deepEqual(Object.keys(r.into).sort(), ['a', 'b']);
        assert.ok(r.into.a.data, 'the full records are in hand after the cold read');
        assert.match(r.store.v, /"a":"A"/, 'the names were not cached, so the next load is cold too');
        assert.ok(!/data/.test(r.store.v), 'a card reached the cache');
    });

    test('A WARM DEVICE WHOSE KEYS MATCH READS NOTHING AT ALL. This is the wave.', async () => {
        const r = rig({
            stored: IDX.courseIndexSerialise({ a: 'A', b: 'B' }, NOW - DAY),
            shallow: { a: true, b: true }
        });
        await r.loader.load();
        assert.equal(r.calls.readAll, 0, 'the whole node was read with a perfectly good cache');
        assert.deepEqual(r.calls.readRecord, [], 'no per-course read was needed either');
        assert.equal(r.calls.fetchJson, 1, 'exactly one probe - 941 bytes, measured');
        assert.deepEqual(r.into, { a: { name: 'A' }, b: { name: 'B' } }, 'stubs, drawn from the cache');
    });

    test('ONE NEW COURSE costs ONE record, not the node', async () => {
        const r = rig({
            stored: IDX.courseIndexSerialise({ a: 'A' }, NOW - DAY),
            shallow: { a: true, zz: true },
            records: { zz: { name: 'Quintero', data: [1] } }
        });
        await r.loader.load();
        assert.equal(r.calls.readAll, 0);
        assert.deepEqual(r.calls.readRecord, ['zz']);
        assert.equal(r.into.zz.name, 'Quintero');
        assert.match(r.store.v, /Quintero/, 'the new name must join the cache or it is re-read for ever');
    });

    test('A FAILED PROBE DRAWS THE CACHE AND READS NOTHING - it does not empty the picker', async () => {
        const r = rig({ stored: IDX.courseIndexSerialise({ a: 'A' }, NOW - DAY), shallow: null });
        await r.loader.load();
        assert.equal(r.calls.readAll, 0, 'a dropped signal must not trigger a 61 KB read');
        assert.deepEqual(r.into, { a: { name: 'A' } });
    });

    test('AN EXPIRED CACHE rebuilds from the node - a renamed course cannot stay wrong', async () => {
        const r = rig({
            stored: IDX.courseIndexSerialise({ a: 'Old Name' }, NOW - 8 * DAY),
            shallow: { a: true },
            all: { a: { name: 'New Name', data: [1] } }
        });
        await r.loader.load();
        assert.equal(r.calls.readAll, 1);
        assert.equal(r.into.a.name, 'New Name');
    });

    test('ensureCard FETCHES ONCE and then resolves from memory', async () => {
        const r = rig({ into: { a: { name: 'A' } }, records: { a: { name: 'A', data: [1, 2] } } });
        const first = await r.loader.ensureCard('a');
        assert.deepEqual(first.data, [1, 2], 'the card must actually arrive');
        assert.deepEqual(r.calls.readRecord, ['a']);
        await r.loader.ensureCard('a');
        assert.deepEqual(r.calls.readRecord, ['a'], 'a second pick of the same course read it again');
    });

    test('ensureCard ON A COURSE WITH NO RECORD resolves null and leaves no half-entry', async () => {
        const r = rig({ into: { a: { name: 'A' } }, records: {} });
        assert.strictEqual(await r.loader.ensureCard('a'), null);
        assert.deepEqual(r.into.a, { name: 'A' },
            'a failed read must not stamp a data key - that would make an unmapped course look mapped');
        assert.strictEqual(await r.loader.ensureCard(''), null, 'no key is not a read');
        assert.deepEqual(r.calls.readRecord, ['a']);
    });

    test('A RECORD ALREADY IN HAND IS NEVER OVERWRITTEN BY A STUB', async () => {
        // The import path writes a full record into the map and then the index
        // lands. If a stub won, the course the organizer just imported would
        // lose its card and the grid would blank.
        const into = { fresh: { name: 'Just Imported', data: [1, 2, 3] } };
        const r = rig({ into, stored: IDX.courseIndexSerialise({ fresh: 'Stale Name' }, NOW - DAY), shallow: { fresh: true } });
        await r.loader.load();
        assert.deepEqual(into.fresh.data, [1, 2, 3], 'the just-imported card was replaced by a stub');
    });

    test('A COURSE THE PROBE NO LONGER SEES is dropped - unless its card is in use', async () => {
        const into = { gone: { name: 'Gone' }, inUse: { name: 'In Use', data: [1] } };
        const r = rig({ into, stored: IDX.courseIndexSerialise({ gone: 'Gone', inUse: 'In Use' }, NOW - DAY), shallow: { other: true }, records: { other: { name: 'Other', data: [9] } } });
        await r.loader.load();
        assert.ok(!into.gone, 'a removed course stayed in the picker');
        assert.ok(into.inUse, 'a course whose card the page is using was pulled out from under it');
    });

    test('A NON-PROMISE FROM A READ IS A RESOLVED null, NOT AN UNHANDLED REJECTION', async () => {
        // MEASURED, and it cost 69 failures in files with nothing to do with
        // courses. Several harnesses stub db.ref().once() with a plain object, so
        // `deps.readAll(...).then` was not a function - raised inside a chain
        // nobody awaits, which node reports as asynchronous activity after the
        // test ended. The same shape is reachable in production from a
        // half-initialised SDK, and the answer is the same: no record, draw what
        // we have.
        let drew = 0;
        const into = {};
        const loader = IDX.courseIndexLoader({
            into: into, databaseURL: DB, now: () => NOW,
            readRecord: () => ({ val: () => null }),
            readAll: () => ({ val: () => null }),
            fetchJson: () => { throw new TypeError('fetch blew up'); },
            getItem: () => { throw new Error('blocked site data'); },
            setItem: () => { throw new Error('quota exceeded'); },
            onApply: () => { drew++; }
        });
        // The claim is that NONE of this throws and the page still gets drawn -
        // not that a snapshot-shaped object is understood. A record with no
        // `name` is not adopted into the map, which is the part that matters:
        // an entry with no name and no data cannot be offered or scored.
        await loader.load();
        await loader.ensureCard('x');
        assert.ok(drew > 0, 'with every dependency misbehaving the page was never told to draw');
        assert.deepEqual(into, {}, 'a snapshot-shaped non-record was adopted as a course');
    });

    test('A THROWING readAll DOES NOT LEAVE THE PAGE UNDRAWN', async () => {
        const calls = { apply: 0 };
        const loader = IDX.courseIndexLoader({
            into: {}, databaseURL: DB, now: () => NOW,
            readRecord: () => Promise.reject(new Error('offline')),
            readAll: () => Promise.reject(new Error('offline')),
            fetchJson: () => Promise.resolve(null),
            getItem: () => null, setItem: () => {},
            onApply: () => { calls.apply++; }
        });
        await loader.load();
        assert.ok(calls.apply > 0,
            'with the network down the page must still be told to draw - an empty picker is bad, '
            + 'a picker that never renders is a dead screen');
        assert.strictEqual(await loader.ensureCard('x'), null, 'a rejected record read must not throw');
    });
});
