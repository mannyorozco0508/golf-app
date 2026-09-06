// ============================================================================
// A MATCH KEEPS THE FORMAT IT WAS SEEDED WITH
//
// buildRyderCupConfig() flattened every non-singles format to 'fourball':
//
//     format: m.format === 'singles' ? 'singles' : 'fourball'
//
// That was correct in Phase 3B, when singles and fourball were the only two
// formats. Phase 5 added Foursomes - a real alternate-shot implementation with
// its own team-score namespace - and edited the `scoring:` line DIRECTLY BELOW
// this one to be Foursomes-aware, while leaving this one alone.
//
// So a Classic Cup saved a Day 1 Foursomes session as:
//
//     session.format  "foursomes"      <- what the schedule says
//     match.format    "fourball"       <- what the record says
//
// and the two halves of the app then disagreed about what game was being played.
// index.html:2718 keys team-score entry off the SESSION, so it offered
// alternate-shot entry; ryder-cup.js:404 keys result computation off the MATCH,
// so it scored the pairing as Four-Ball from individual scores that alternate
// shot never produces.
//
// ---------------------------------------------------------------------------
// THESE TESTS DRIVE THE REAL SAVE PATH.
//
// rcOpenClassic -> rcToggle -> rcSeedSession -> rcSave -> buildRyderCupConfig,
// with the database write captured. They never hand-build a match object and
// hand it to the builder. That distinction is the whole point: the existing
// Phase 5 suite hand-builds its matches with format:'foursomes' and never goes
// through the writer, which is exactly why it stayed green while every real save
// flattened the format. Five separate defects this session had that shape - a
// test that constructs the thing it is meant to be checking.
//
// THE COMPANION CHANGE, and why it is not scope creep. RYDER_ROSTER_SIZE was
// { fourball: 2, singles: 1 }. validateRyderCup does:
//
//     var want = RYDER_ROSTER_SIZE[m.format || 'fourball'];
//     if (want && ...) problems.push(...)
//
// With a real 'foursomes' format and no entry, `want` is undefined and the guard
// short-circuits - so carrying the format through would SILENTLY DISABLE
// roster-size validation for every Foursomes match. Measured before the fix: an
// illegal 3-v-2 roster is flagged as fourball and passes clean as foursomes.
// Foursomes is two a side, the same as Four-Ball, so the added entry restores the
// identical check rather than inventing a rule.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const RYDER_SRC = read('ryder-cup.js');
const SM_SRC = read('sidematches.html');

const SM_DEPS = ['handicap.js', 'money-engine.js', 'action-model.js',
    'settlement-engine.js', 'ryder-cup.js'];

const cd18 = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const FOUR = [{ id: 101, name: 'Ann', hcp: '0' }, { id: 102, name: 'Bob', hcp: '0' },
              { id: 103, name: 'Cal', hcp: '0' }, { id: 104, name: 'Dee', hcp: '0' }];

// The Matches page with its database captured rather than stubbed away, so the
// payload a real save would send is what these tests read.
function cupPage(players) {
    const sb = loadHtmlInlineScript('sidematches.html', SM_DEPS);
    vm.runInContext(`
        window.__written = [];
        alert = function () {};
        confirm = function () { return true; };
        db.ref = function (p) { return {
            set: function (v) { window.__written.push({ path: p, value: v });
                return { then: function (f) { f && f(); return { catch: function () {} }; } }; },
            remove: function () { return { then: function (f) { f && f();
                return { catch: function () {} }; } }; },
            on: function () {},
            once: function () { return { then: function (f) {
                f && f({ val: function () { return null; } });
                return { catch: function () {} }; } }; },
            push: function () { return { key: 'K1' }; },
            update: function () {} }; };
        currentMode = 'TESTCUP';
        isOrganizerView = function () { return true; };
        currentData = { players: ${JSON.stringify(players || FOUR)},
                        courseData: ${JSON.stringify(cd18)}, scores: {} };
    `, sb);
    return sb;
}

const run = (sb, expr) => vm.runInContext(expr, sb);

// Drives the Classic preset all the way to a captured write and returns the
// Cup exactly as it would land in Firebase.
function saveClassicCup(sb, sessionId) {
    run(sb, 'rcOpenClassic();');
    run(sb, 'rcToggle(101, "A"); rcToggle(102, "A"); rcToggle(103, "B"); rcToggle(104, "B");');
    run(sb, 'rcSeedSession(' + JSON.stringify(sessionId) + ');');
    // A scheduled Cup will not save until the round says which session it is -
    // see ryder_session_pointer_test.js. The organizer answers that too, so this
    // driver does as well; the assertions below are unchanged.
    run(sb, 'rcSetPlaysSession(' + JSON.stringify(sessionId) + ');');
    run(sb, 'rcSave();');
    const written = JSON.parse(run(sb, 'JSON.stringify(window.__written)'));
    // Selected by PATH, not by position. Saving now performs two writes - the Cup
    // and the round's session pointer - so "the last write" is the pointer, and a
    // helper that assumed one write silently started returning the wrong object.
    const cup = written.filter(w => String(w.path).endsWith('/ryderCup'))[0];
    return cup ? cup.value : null;
}

const matchesOf = cup => Object.keys(cup.matches).map(k => cup.matches[k]);

describe('THE SAVE PATH CARRIES THE REAL FORMAT', () => {

    test('the Classic preset seeds a Foursomes match into the draft', () => {
        const sb = cupPage();
        run(sb, 'rcOpenClassic();');
        run(sb, 'rcToggle(101, "A"); rcToggle(102, "A"); rcToggle(103, "B"); rcToggle(104, "B");');
        run(sb, 'rcSeedSession("d1s1");');
        const drafted = JSON.parse(run(sb,
            'JSON.stringify(rcDraft.matches.map(function(m){return m.format;}))'));
        assert.deepEqual(drafted, ['foursomes'], 'the seeder no longer produces Foursomes');
    });

    // THE DEFECT. What the seeder built and what the writer stored disagreed.
    test('a seeded Foursomes match SAVES as foursomes', () => {
        const cup = saveClassicCup(cupPage(), 'd1s1');
        assert.ok(cup, 'nothing was written');
        assert.deepEqual(matchesOf(cup).map(m => m.format), ['foursomes'],
            'the save flattened Foursomes into Four-Ball — the record now says a ' +
            'different game than the schedule does');
    });

    test('the saved session and its saved matches agree', () => {
        const cup = saveClassicCup(cupPage(), 'd1s1');
        const sessionFormat = cup.sessions.d1s1.format;
        matchesOf(cup).forEach(m => {
            assert.equal(m.format, sessionFormat,
                'match ' + m.id + ' says ' + m.format + ' while its session says ' + sessionFormat);
        });
    });

    test('a Four-Ball session still saves as fourball', () => {
        const cup = saveClassicCup(cupPage(), 'd1s2');
        assert.deepEqual(matchesOf(cup).map(m => m.format), ['fourball']);
    });

    test('a Singles session still saves as singles', () => {
        const cup = saveClassicCup(cupPage(), 'd3s1');
        assert.equal(matchesOf(cup).every(m => m.format === 'singles'), true);
        assert.equal(matchesOf(cup).length, 2, 'singles seats everyone');
    });

    test('Foursomes keeps its scratch scoring through the save', () => {
        const cup = saveClassicCup(cupPage(), 'd1s1');
        assert.equal(matchesOf(cup)[0].scoring, 'scratch');
    });

    test('an unknown format is still normalised rather than stored raw', () => {
        // The flattening did one useful thing - it refused to store garbage. That
        // defence has to survive, or a typo becomes a match nothing can score.
        const R = loadJsFile('ryder-cup.js');
        const out = R.buildRyderCupConfig({
            members: { '101': 'A', '103': 'B' },
            matches: [{ id: 'm1', format: 'buggy-value', playersA: ['101'], playersB: ['103'] }]
        });
        assert.equal(out.matches.m1.format, 'fourball',
            'an unrecognised format must fall back, not be stored verbatim');
    });
});

describe('VALIDATION STILL GUARDS A FOURSOMES ROSTER', () => {

    test('the roster table knows how many a Foursomes side seats', () => {
        assert.match(RYDER_SRC, /RYDER_ROSTER_SIZE = \{[^}]*foursomes:\s*2/,
            'without an entry, `want` is undefined and the roster check is skipped ' +
            'entirely for every Foursomes match');
    });

    // Driven through the real save gate: rcSave asks the engine and refuses.
    test('an illegal Foursomes roster is refused by the real save', () => {
        const sb = cupPage(FOUR.concat([{ id: 105, name: 'Eve', hcp: '0' }]));
        run(sb, 'rcOpenClassic();');
        run(sb, 'rcToggle(101,"A"); rcToggle(102,"A"); rcToggle(105,"A");'
              + ' rcToggle(103,"B"); rcToggle(104,"B");');
        run(sb, 'rcSeedSession("d1s1");');
        // Three a side in an alternate-shot pairing is not a thing.
        run(sb, 'rcDraft.matches[0].playersA = ["101","102","105"];');
        run(sb, 'rcSetPlaysSession("d1s1");');   // so the refusal is about the ROSTER
        run(sb, 'rcSave();');
        const written = JSON.parse(run(sb, 'JSON.stringify(window.__written)'));
        assert.equal(written.length, 0,
            'a 3-a-side Foursomes pairing was saved — roster validation did not run');
    });

    test('a legal Foursomes roster still saves', () => {
        const cup = saveClassicCup(cupPage(), 'd1s1');
        assert.ok(cup, 'a legal pairing was refused');
        assert.equal(matchesOf(cup)[0].playersA.length, 2);
    });
});

describe('THE SCREEN AGREES WITH THE RECORD', () => {

    // A screen that contradicts its own record is worse than the bug: the label
    // read "Four-Ball" for a match the schedule, the entry UI and the engine all
    // treat as alternate shot.
    test('a Foursomes pairing is labelled Foursomes, not Four-Ball', () => {
        const sb = cupPage();
        run(sb, 'rcOpenClassic();');
        run(sb, 'rcToggle(101, "A"); rcToggle(102, "A"); rcToggle(103, "B"); rcToggle(104, "B");');
        run(sb, 'rcSeedSession("d1s1");');
        run(sb, 'renderRyderCupSetup();');
        const html = run(sb, 'document.getElementById("ryder-cup-setup").innerHTML');
        assert.match(html, /Foursomes/, 'the pairing row does not say Foursomes');
        assert.ok(!/rcs-mtop">Four-Ball/.test(html),
            'a Foursomes pairing is still labelled Four-Ball');
    });

    test('Four-Ball and Singles keep their own labels', () => {
        const sb = cupPage();
        run(sb, 'rcOpenClassic();');
        run(sb, 'rcToggle(101, "A"); rcToggle(102, "A"); rcToggle(103, "B"); rcToggle(104, "B");');
        run(sb, 'rcSeedSession("d1s2");');
        run(sb, 'renderRyderCupSetup();');
        assert.match(run(sb, 'document.getElementById("ryder-cup-setup").innerHTML'), /Four-Ball/);
    });

    test('the label is derived, not a two-way guess', () => {
        assert.ok(!/m\.format === 'singles' \? 'Singles' : 'Four-Ball'/.test(SM_SRC),
            'the row still collapses every non-singles format into one label');
    });
});

describe('A MODULE THAT THROWS WHEN LOADED ALONE IS A TRAP', () => {

    // ryder-cup.js calls parseHcp and calculateMatchEngine as plain globals, as
    // the browser supplies them. Loaded without them, the Foursomes path throws
    // ReferenceError and - worse - ryderFourBallState bails at its first line and
    // returns a SILENT null, so a Four-Ball test would pass having computed
    // nothing at all.
    test('handicap.js comes with it', () => {
        const sb = loadJsFile('ryder-cup.js');
        assert.equal(vm.runInContext('typeof parseHcp', sb), 'function',
            'a Foursomes handicap allowance throws ReferenceError without it');
    });

    test('money-engine.js comes with it, so Four-Ball cannot silently return null', () => {
        const sb = loadJsFile('ryder-cup.js');
        assert.equal(vm.runInContext('typeof calculateMatchEngine', sb), 'function',
            'ryderFourBallState returns null at its first line without this');
    });

    test('the prerequisite is declared once, in the loader', () => {
        const helper = read('helpers/load-script.js');
        assert.match(helper, /'ryder-cup\.js':\s*\[[^\]]*'handicap\.js'/);
        assert.match(helper, /'ryder-cup\.js':\s*\[[^\]]*'money-engine\.js'/);
    });
});

describe('STORED RECORDS ARE NOT RE-SCORED', () => {

    // The guarantee that made this safe to ship: buildRyderCupConfig is a WRITER,
    // with one caller. ryderCupConfig passes rc.matches straight through, so a Cup
    // already in Firebase reads back exactly as it did and settles to the same
    // numbers. Verified before the change by running both versions against the
    // same record; pinned here so it stays true.
    test('the read path never normalises through the writer', () => {
        const cfgFn = RYDER_SRC.slice(RYDER_SRC.indexOf('function ryderCupConfig'),
                                      RYDER_SRC.indexOf('function hasRyderCup'));
        assert.ok(!/buildRyderCupConfig/.test(cfgFn),
            'the reader now rebuilds stored records - old Cups would change meaning');
        assert.match(cfgFn, /matches: rc\.matches \|\| \{\}/,
            'stored matches must ride through untouched');
    });

    test('a record stored with the old flattening still reads as fourball', () => {
        const R = loadJsFile('ryder-cup.js');
        const stored = {
            v: 1, name: 'Old Cup',
            sides: { A: { id: 'A', name: 'A' }, B: { id: 'B', name: 'B' } },
            members: { '101': 'A', '102': 'A', '103': 'B', '104': 'B' },
            sessions: { d1s1: { id: 'd1s1', day: 1, order: 1, format: 'foursomes' } },
            matches: {
                m1: { id: 'm1', sessionId: 'd1s1', format: 'fourball', scoring: 'scratch',
                      sideA: 'A', sideB: 'B', playersA: ['101', '102'], playersB: ['103', '104'] }
            }
        };
        const cfg = R.ryderCupConfig({ ryderCup: stored });
        assert.equal(cfg.matches.m1.format, 'fourball',
            'an existing Cup was silently re-pointed at a different game');
        assert.equal(cfg.sessions.d1s1.format, 'foursomes');
    });
});
