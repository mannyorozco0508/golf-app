// ============================================================================
// 2v2 STROKE SIDE MATCHES — PARITY TRIPWIRE AND REACHABILITY PROOF
//
// BATCH 1. TESTS ONLY. This file changes no production behaviour and fixes
// nothing. It exists to make the CURRENT state of the repo permanent and
// visible before anything is repaired.
//
// ---------------------------------------------------------------------------
// WHAT IS WRONG TODAY
// ---------------------------------------------------------------------------
//
// settlement-engine.js supports 2v2 stroke side matches. calculateHoleBetEngine
// and calculateOverallBetEngine each resolve a SIDE from config.sideA/sideB and
// score it best ball through sideHoleScore(). The comment at the top of
// buildSideMatchReceipts' stroke branch calls this out as a regression fix: the
// engine used to receive only [p1, p2], so a 2v2 stroke match settled two
// golfers and silently dropped the other two - money that was not zero-sum.
//
// The page-local copies of those two engines in sidematches.html and stats.html
// never received that fix. They read p1/p2 only and ignore config.sideA/sideB
// entirely. So on a 2v2 stroke side match:
//
//     the Receipt pays out            (settlement-engine.js)
//     the Matches tab shows nothing   (sidematches.html)
//     the Final Scorecard shows nothing (stats.html)
//
// ---------------------------------------------------------------------------
// WHY THAT IS NOT MERELY THEORETICAL
// ---------------------------------------------------------------------------
//
// pickPlayerForSide() in sidematches.html caps a stroke match at one player per
// side (maxPerSide). That cap looks like it prevents the divergence from ever
// being reached. It does not, for two reasons proved behaviourally below:
//
//   1. The cap lives in the PICKER only. saveSideMatch() validates that the two
//      sides are equal and no larger than two, and never re-applies the
//      stroke-specific limit at the write boundary.
//
//   2. sidematchPickState is cleared in exactly one place - openSideMatchModal().
//      Changing the format dropdown does not clear it. So picking 2v2 while the
//      default Match Play format allows it, then switching to Stroke Play Bet,
//      carries a 2v2 selection into a stroke save.
//
// The product also INTENDS 2v2 stroke to work: updateSideMatchPickerFeedback()
// states that the engine takes the whole side and scores it best ball and that
// settlement splits the stake evenly between teammates. maxPerSide contradicts
// that intent rather than protecting it.
//
// ---------------------------------------------------------------------------
// THE DEFECT-PINNING ASSERTIONS
// ---------------------------------------------------------------------------
//
// Several tests below assert that the canonical engine and a page copy
// DISAGREE. Those are marked:
//
//     KNOWN DEFECT - EXPECTED TO BE REVERSED IN BATCH 2
//
// They document a defect, not a desired state. When Batch 2 teaches
// sidematches.html (and later stats.html) to use the canonical engines, those
// assertions MUST fail, and whoever does that work MUST rewrite them from
// "these disagree" to "these agree". That failure is the point. Do not delete
// or weaken an assertion to make a batch pass.
//
// ---------------------------------------------------------------------------
// HARNESS HONESTY
// ---------------------------------------------------------------------------
//
// This repo has been burned by tests that looked like they exercised production
// and did not. Specific guards in this file:
//
//   * Every expectation is produced by RUNNING production code. No algorithm is
//     reimplemented here. The only literals asserted are inputs (the $50 stake,
//     the $10 per-hole rate, 18 holes) and the zero-sum contract.
//
//   * Cross-realm objects carry a foreign prototype, so deepStrictEqual rejects
//     them even when every value matches. Everything crossing a realm boundary
//     is normalised through plain() - the same JSON round-trip
//     money_parity_test.js uses.
//
//   * Each page is loaded in its own realm with the dependency list that page
//     actually carries in its <script src> tags - action-model.js for both
//     sidematches.html and stats.html. Neither page loads money-engine.js or
//     settlement-engine.js in production, and neither is given them here.
//
//   * The realms are proved distinct before anything is compared, so a
//     collapsed harness cannot make two copies agree by accident.
//
//   * The reachability proof EXECUTES saveSideMatch() and captures the Firebase
//     write. It is not a regex for a missing validation line. To prove the
//     mini-DOM harness is not silently inert, a paired test shows the SAME
//     picker function correctly REFUSING a second player when stroke is chosen
//     first. If the harness were dead, that refusal could not be observed.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

// ---------------------------------------------------------------------------
// REALMS
// ---------------------------------------------------------------------------

// The shared engines, loaded in dependency order exactly as every page that
// uses them does. settlement-engine.js depends on money-engine.js for parseHcp
// and getStrokes, so money-engine.js must come first.
function engineRealm() {
    const sb = { console, Math, Object, Array, String, Number, JSON, isNaN,
                 parseInt, parseFloat, Date, Set, Map };
    vm.createContext(sb);
    ['money-engine.js', 'action-model.js', 'pool-engine.js', 'settlement-engine.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}

// PRODUCTION DEPENDENCY LISTS, not convenient ones. Both pages load exactly one
// shared engine file, and their inline copies of the stroke engines are the only
// implementations those pages have at runtime.
const PAGE_DEPS = {
    'sidematches.html': ['action-model.js'],
    'stats.html': ['action-model.js'],
};

const realms = {};
function realmFor(name) {
    if (!realms[name]) {
        realms[name] = name === 'settlement-engine.js'
            ? engineRealm()
            : loadHtmlInlineScript(name, PAGE_DEPS[name]);
    }
    return realms[name];
}

const CANONICAL = 'settlement-engine.js';
const PAGE_COPIES = ['sidematches.html', 'stats.html'];
const ALL_THREE = [CANONICAL].concat(PAGE_COPIES);

const plain = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

// ---------------------------------------------------------------------------
// FIXTURES
//
// Eighteen par-4s with a clean 1..18 stroke index. Chosen so nothing depends on
// a particular course: the divergence being measured is about WHICH GOLFERS the
// engine looks at, not about handicap allocation.
// ---------------------------------------------------------------------------

const cd18 = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));

const ALPHA_1 = { id: 1, name: 'Ann Alpha', hcp: '0' };
const ALPHA_2 = { id: 2, name: 'Abe Alpha', hcp: '0' };
const BRAVO_1 = { id: 3, name: 'Ben Bravo', hcp: '0' };
const BRAVO_2 = { id: 4, name: 'Bo Bravo', hcp: '0' };
const FOURSOME = [ALPHA_1, ALPHA_2, BRAVO_1, BRAVO_2];

// THE FIXTURE IS DELIBERATELY LOPSIDED AND DELIBERATELY HIDDEN FROM 1v1.
//
// Ann and both Bravos shoot 5 on every hole. Abe - Ann's PARTNER - shoots 3 on
// every hole. So:
//
//   * Judged as a 2v2 best ball, side Alpha shoots 3 a hole and side Bravo 5.
//     Alpha wins every hole and the overall by 36 strokes.
//   * Judged as 1v1 between the two first-named players (Ann v Ben), every
//     single hole is halved and nothing is won.
//
// An engine that honours config.sideA/sideB and one that ignores it therefore
// produce maximally different answers on identical input, and the difference is
// caused only by whether Abe is looked at.
function lopsided2v2Scores() {
    const s = {};
    cd18.forEach(h => {
        s[`p${ALPHA_1.id}_h${h.hole}`] = 5;
        s[`p${ALPHA_2.id}_h${h.hole}`] = 3;
        s[`p${BRAVO_1.id}_h${h.hole}`] = 5;
        s[`p${BRAVO_2.id}_h${h.hole}`] = 5;
    });
    return s;
}

const SIDES_2V2 = { sideA: [ALPHA_1, ALPHA_2], sideB: [BRAVO_1, BRAVO_2] };

const OVERALL_STAKE = 50;
const HOLE_STAKE = 10;

function overallCfg2v2() {
    return Object.assign({
        overallEnabled: true, overallStake: OVERALL_STAKE,
        overallMode: 'stroke', scoringType: 'gross',
    }, SIDES_2V2);
}

function holeCfg2v2() {
    return Object.assign({
        holeEnabled: true, holeStake: HOLE_STAKE,
        segment: 'full', tieRule: 'carry', scoringType: 'gross',
    }, SIDES_2V2);
}

// Every engine below is called with [p1, p2] as its players argument and the
// sides carried on the config - which is exactly how settlement-engine.js calls
// it for a 2v2 stroke match.
const callOverall = (realm, cfg, scores, presses) =>
    plain(realm.calculateOverallBetEngine([ALPHA_1, BRAVO_1], cd18, scores, cfg, presses || []));

const callHole = (realm, cfg, scores, presses) =>
    plain(realm.calculateHoleBetEngine([ALPHA_1, BRAVO_1], cd18, scores, cfg, presses || []));

// ===========================================================================
// 0. HARNESS INTEGRITY
//
// Everything after this point is meaningless if the three realms are not really
// three separate loads of three separate implementations.
// ===========================================================================

describe('HARNESS INTEGRITY — three genuinely separate implementations', () => {

    test('all three realms expose both stroke engines', () => {
        ALL_THREE.forEach(name => {
            const r = realmFor(name);
            assert.equal(typeof r.calculateOverallBetEngine, 'function',
                name + ' should define calculateOverallBetEngine');
            assert.equal(typeof r.calculateHoleBetEngine, 'function',
                name + ' should define calculateHoleBetEngine');
        });
    });

    test('the three copies are distinct function objects, not one shared realm', () => {
        const fns = ALL_THREE.map(n => realmFor(n).calculateOverallBetEngine);
        assert.notEqual(fns[0], fns[1]);
        assert.notEqual(fns[0], fns[2]);
        assert.notEqual(fns[1], fns[2]);
    });

    test('the page realms were NOT given money-engine.js or settlement-engine.js', () => {
        // Fidelity check. sidematches.html and stats.html load exactly one shared
        // engine file in production - action-model.js. If this harness quietly
        // handed them settlement-engine.js, the canonical implementation would be
        // loaded first and then SHADOWED by the page's own inline copy, which
        // happens to produce the same function identity - but the realm would no
        // longer represent what those pages actually ship.
        PAGE_COPIES.forEach(page => {
            assert.deepEqual(PAGE_DEPS[page], ['action-model.js'],
                page + ' must be loaded with its real dependency list');
            const r = realmFor(page);
            assert.equal(typeof r.computeCombinedNetTotals, 'undefined',
                page + ' does not load settlement-engine.js in production and must not here');
            assert.equal(typeof r.computeRoundMoneyByPlayer, 'undefined',
                page + ' does not load money-engine.js in production and must not here');
        });
    });

    test('the pages carry their OWN getStrokes/parseHcp, which is why they run at all', () => {
        // Not a style note. These pages compute net scores without money-engine.js
        // loaded, so the inline copies are load-bearing. If they ever disappear
        // without the page gaining <script src="money-engine.js">, the stroke
        // engines here would throw rather than diverge, and every assertion below
        // would change meaning.
        PAGE_COPIES.forEach(page => {
            const r = realmFor(page);
            assert.equal(typeof r.getStrokes, 'function', page + ' defines getStrokes');
            assert.equal(typeof r.parseHcp, 'function', page + ' defines parseHcp');
        });
    });

    test('cross-realm results normalise to comparable plain objects', () => {
        // Guards the specific trap: deepStrictEqual rejects a foreign prototype
        // even when every value matches, so a naive comparison would report a
        // difference that does not exist and mask the one that does.
        const raw = realmFor(CANONICAL)
            .calculateOverallBetEngine([ALPHA_1, BRAVO_1], cd18, lopsided2v2Scores(), overallCfg2v2(), []);
        const norm = plain(raw);
        assert.equal(typeof norm, 'object');
        assert.equal(Object.getPrototypeOf(norm), Object.prototype);
        assert.equal(typeof norm.base, 'object');
    });
});

// ===========================================================================
// 1. CANONICAL 2v2 BEHAVIOUR — settlement-engine.js
//
// Measured from fresh main. Nothing here is copied from an audit note; each
// number is either an input to the fixture or the observed output of running
// the production engine.
// ===========================================================================

describe('CANONICAL — settlement-engine.js honours config.sideA / config.sideB', () => {

    test('the overall bet is won by the side with the better BEST BALL, not by p1 alone', () => {
        const r = callOverall(realmFor(CANONICAL), overallCfg2v2(), lopsided2v2Scores());

        // Side Alpha's best ball is Abe's 3 on all eighteen; side Bravo's is 5.
        assert.equal(r.base.p1Total, 3 * 18);
        assert.equal(r.base.p2Total, 5 * 18);
        assert.equal(r.base.roundComplete, true);

        // The stake goes to side Alpha, whole, once.
        assert.equal(r.base.p1Money, OVERALL_STAKE);

        // The winner is named as a SIDE, which is itself evidence the engine
        // resolved two golfers per side rather than one.
        assert.ok(/Ann/.test(r.base.winner) && /Abe/.test(r.base.winner),
            'the winning side should name both Alpha golfers, got: ' + r.base.winner);
    });

    test('the per-hole bet pays every hole to the better side', () => {
        const r = callHole(realmFor(CANONICAL), holeCfg2v2(), lopsided2v2Scores());
        // Eighteen holes, none halved, at the per-hole rate.
        assert.equal(r.p1Money, HOLE_STAKE * 18);
    });

    test('a partner who has not posted holds the hole rather than winning it', () => {
        // sideHoleScore returns null until every golfer on the side has posted, so
        // a half-scored side can neither win nor lose. Proved by removing ONE
        // partner's card and watching the decided money fall to zero.
        const scores = lopsided2v2Scores();
        cd18.forEach(h => { delete scores[`p${ALPHA_2.id}_h${h.hole}`]; });

        const r = callOverall(realmFor(CANONICAL), overallCfg2v2(), scores);
        assert.equal(r.base.roundComplete, false);
        assert.equal(r.base.p1Money, 0);
    });

    test('the full receipt pays all four golfers and stays zero-sum', () => {
        // The end-to-end contract, through computeCombinedNetTotals - the canonical
        // settlement path, not the engine in isolation.
        const scores = lopsided2v2Scores();
        const data = {
            gameFormat: 'stroke',
            players: FOURSOME,
            courseData: cd18,
            scores: scores,
            sideMatches: {
                m1: {
                    format: 'stroke', scoring: 'gross',
                    teamAIds: ['1', '2'], teamBIds: ['3', '4'],
                    startHole: 1, createdAt: 1,
                    holeStake: 0, overallStake: OVERALL_STAKE,
                    overallMode: 'stroke', segment: 'full', tieRule: 'carry',
                },
            },
        };
        const result = plain(realmFor(CANONICAL).computeCombinedNetTotals(data, cd18, scores));
        const nets = Object.values(result.netByName);

        assert.equal(nets.length, 4, 'all four golfers should appear in the settlement');

        // The stake is PER SIDE, split evenly between teammates.
        const byName = {};
        nets.forEach(v => { byName[v.name] = v.net; });
        assert.equal(byName['Ann Alpha'], OVERALL_STAKE / 2);
        assert.equal(byName['Abe Alpha'], OVERALL_STAKE / 2);
        assert.equal(byName['Ben Bravo'], -OVERALL_STAKE / 2);
        assert.equal(byName['Bo Bravo'], -OVERALL_STAKE / 2);

        // THE INVARIANT.
        const sum = nets.reduce((s, v) => s + v.net, 0);
        assert.equal(sum, 0, 'every completed wager must be zero-sum');
    });
});

// ===========================================================================
// 2. KNOWN DEFECT — the page copies ignore the sides
// ===========================================================================

describe('KNOWN DEFECT — sidematches.html is not 2v2-aware', () => {

    // KNOWN DEFECT - EXPECTED TO BE REVERSED IN BATCH 2.
    test('the overall bet reports ALL SQUARE on a match the receipt pays out', () => {
        const page = callOverall(realmFor('sidematches.html'), overallCfg2v2(), lopsided2v2Scores());
        const canon = callOverall(realmFor(CANONICAL), overallCfg2v2(), lopsided2v2Scores());

        // The page looked at Ann v Ben only. Both shot 5 every hole.
        assert.equal(page.base.p1Total, 5 * 18);
        assert.equal(page.base.p2Total, 5 * 18);
        assert.equal(page.base.winner, null);
        assert.equal(page.base.p1Money, 0);

        // And the canonical engine, on the SAME input, pays the stake.
        assert.equal(canon.base.p1Money, OVERALL_STAKE);
        assert.notEqual(page.base.p1Money, canon.base.p1Money,
            'BATCH 2 MUST REVERSE THIS: rewrite to assert.equal once the page uses the canonical engine');
    });

    // KNOWN DEFECT - EXPECTED TO BE REVERSED IN BATCH 2.
    test('the per-hole bet reports nothing on eighteen holes the receipt pays', () => {
        const page = callHole(realmFor('sidematches.html'), holeCfg2v2(), lopsided2v2Scores());
        const canon = callHole(realmFor(CANONICAL), holeCfg2v2(), lopsided2v2Scores());

        assert.equal(page.p1Money, 0);
        assert.equal(canon.p1Money, HOLE_STAKE * 18);
        assert.notEqual(page.p1Money, canon.p1Money,
            'BATCH 2 MUST REVERSE THIS: rewrite to assert.equal once the page uses the canonical engine');
    });

    // KNOWN DEFECT - EXPECTED TO BE REVERSED IN BATCH 2.
    test('the divergence is caused by the SIDES being ignored, nothing else', () => {
        // Same page copy, same scores, sides stripped from the config. If the page
        // agreed with itself with and without sides, it is provably not reading
        // them - which isolates the cause rather than merely observing a mismatch.
        const withSides = callOverall(realmFor('sidematches.html'), overallCfg2v2(), lopsided2v2Scores());

        const bare = overallCfg2v2();
        delete bare.sideA;
        delete bare.sideB;
        const withoutSides = callOverall(realmFor('sidematches.html'), bare, lopsided2v2Scores());

        assert.deepEqual(withSides.base, withoutSides.base,
            'sidematches.html produces identical output with and without sideA/sideB, ' +
            'proving it never reads them');
    });
});

describe('KNOWN DEFECT — stats.html is not 2v2-aware', () => {

    // KNOWN DEFECT - EXPECTED TO BE REVERSED IN A LATER BATCH.
    test('the Final Scorecard would show all square where the receipt pays out', () => {
        const page = callOverall(realmFor('stats.html'), overallCfg2v2(), lopsided2v2Scores());
        const canon = callOverall(realmFor(CANONICAL), overallCfg2v2(), lopsided2v2Scores());

        assert.equal(page.base.p1Money, 0);
        assert.equal(canon.base.p1Money, OVERALL_STAKE);
        assert.notEqual(page.base.p1Money, canon.base.p1Money,
            'A LATER BATCH MUST REVERSE THIS: rewrite to assert.equal once stats.html uses the canonical engine');
    });

    // KNOWN DEFECT - EXPECTED TO BE REVERSED IN A LATER BATCH.
    test('the per-hole bet also reports nothing', () => {
        const page = callHole(realmFor('stats.html'), holeCfg2v2(), lopsided2v2Scores());
        assert.equal(page.p1Money, 0);
        assert.notEqual(page.p1Money, HOLE_STAKE * 18,
            'A LATER BATCH MUST REVERSE THIS');
    });

    test('the two page copies currently agree with EACH OTHER, and only with each other', () => {
        // They are the same defect twice, not two different defects. Recording that
        // now means a future batch that fixes one and forgets the other fails here.
        const sm = callOverall(realmFor('sidematches.html'), overallCfg2v2(), lopsided2v2Scores());
        const st = callOverall(realmFor('stats.html'), overallCfg2v2(), lopsided2v2Scores());
        assert.deepEqual(sm.base, st.base);
    });
});

// ===========================================================================
// 3. REACHABILITY
//
// The whole defect would be academic if a 2v2 stroke side match could not be
// created. It can. Proved by executing the real save path and capturing the
// Firebase write, not by scanning for a missing validation line.
// ===========================================================================

describe('REACHABILITY — a 2v2 stroke side match can be saved from the real UI path', () => {

    // A fresh page realm per test, with the Firebase write captured. Nothing in
    // production is altered: db.ref is replaced on the SAME stub object the page
    // already holds, which is what the harness hands every test.
    function pageWithCapture() {
        const sb = loadHtmlInlineScript('sidematches.html', PAGE_DEPS['sidematches.html']);
        const writes = [];
        sb.db.ref = (refPath) => {
            const ref = {
                key: 'PUSHKEY',
                push() { return ref; },
                set(value) { writes.push({ path: refPath, value: value }); return Promise.resolve(); },
                update() { return Promise.resolve(); },
                remove() { return Promise.resolve(); },
                on() {},
                once() { return Promise.resolve({ val() { return null; }, exists() { return false; } }); },
            };
            return ref;
        };

        // Round state. currentData / currentMode / sidematchPickState are top-level
        // `let` bindings inside the page's inline script, so they live in the
        // context's lexical scope rather than on the sandbox object - they are set
        // by running a statement in the SAME context, which is how the page itself
        // would have set them on load.
        vm.runInContext(
            'currentMode = "TESTCD";' +
            'currentData = { players: ' + JSON.stringify(FOURSOME) + ', courseData: [], scores: {} };' +
            'lockedGroup = null; hasGroupLock = false;' +
            'sidematchPickState = {}; actionScope = null; actionOwnerGroup = null;',
            sb
        );

        const setField = (id, value) => { sb.document.getElementById(id).value = value; };
        const pickState = () => plain(vm.runInContext('sidematchPickState', sb));
        return { sb, writes, setField, pickState };
    }

    test('HARNESS PROOF: the picker cap DOES fire when Stroke is chosen first', () => {
        // This is the control that makes the next test meaningful. If the mini-DOM
        // harness were inert, pickPlayerForSide would appear to accept everything
        // and the bypass below would prove nothing. Here the very same function,
        // in the very same harness, correctly refuses a second golfer on a side
        // once the format is stroke - so the cap is genuinely executing.
        const { sb, setField, pickState } = pageWithCapture();
        setField('sm-format', 'stroke');

        sb.pickPlayerForSide(String(ALPHA_1.id), 'a');
        sb.pickPlayerForSide(String(ALPHA_2.id), 'a');

        assert.deepEqual(pickState(), { '1': 'a' },
            'with Stroke selected first, the picker must admit only one golfer per side');
    });

    test('the picker DOES allow 2v2 while Match Play is selected', () => {
        const { sb, setField, pickState } = pageWithCapture();
        setField('sm-format', 'match');

        sb.pickPlayerForSide(String(ALPHA_1.id), 'a');
        sb.pickPlayerForSide(String(ALPHA_2.id), 'a');
        sb.pickPlayerForSide(String(BRAVO_1.id), 'b');
        sb.pickPlayerForSide(String(BRAVO_2.id), 'b');

        assert.deepEqual(pickState(), { '1': 'a', '2': 'a', '3': 'b', '4': 'b' });
    });

    test('switching the format to Stroke does NOT clear the 2v2 selection', () => {
        const { sb, setField, pickState } = pageWithCapture();
        setField('sm-format', 'match');
        [ALPHA_1, ALPHA_2].forEach(p => sb.pickPlayerForSide(String(p.id), 'a'));
        [BRAVO_1, BRAVO_2].forEach(p => sb.pickPlayerForSide(String(p.id), 'b'));

        setField('sm-format', 'stroke');
        sb.onSideMatchFormatChange();

        assert.deepEqual(pickState(), { '1': 'a', '2': 'a', '3': 'b', '4': 'b' },
            'sidematchPickState is cleared only by openSideMatchModal(), never by a format change');
    });

    test('saveSideMatch() WRITES a 2v2 stroke side match — the write boundary is unguarded', () => {
        const { sb, writes, setField } = pageWithCapture();

        // The exact sequence a golfer can perform today.
        setField('sm-format', 'match');
        [ALPHA_1, ALPHA_2].forEach(p => sb.pickPlayerForSide(String(p.id), 'a'));
        [BRAVO_1, BRAVO_2].forEach(p => sb.pickPlayerForSide(String(p.id), 'b'));

        setField('sm-format', 'stroke');
        sb.onSideMatchFormatChange();

        setField('sm-holestake', '0');
        setField('sm-overallstake', String(OVERALL_STAKE));
        setField('sm-scoring', 'gross');
        setField('sm-tie-rule', 'carry');
        setField('sm-overall-mode', 'stroke');
        setField('sm-segment', 'full');

        sb.saveSideMatch();

        assert.equal(writes.length, 1, 'saveSideMatch() should have written exactly one record');

        const w = writes[0];
        // Proves the function ran all the way to its own write, rather than a test
        // fabricating a payload: the path is the one saveSideMatch() builds.
        assert.equal(w.path, 'events/TESTCD/sideMatches/PUSHKEY');

        assert.equal(w.value.format, 'stroke');
        assert.deepEqual(w.value.teamAIds, ['1', '2']);
        assert.deepEqual(w.value.teamBIds, ['3', '4']);
        assert.equal(w.value.teamAIds.length, 2);
        assert.equal(w.value.teamBIds.length, 2);
        assert.equal(w.value.overallStake, OVERALL_STAKE);
    });

    test('the record that gets saved is exactly the shape the divergent engines disagree about', () => {
        // Closes the loop between reachability and divergence: the thing that can be
        // written is the thing settlement pays and the Matches tab does not.
        const { sb, writes, setField } = pageWithCapture();
        setField('sm-format', 'match');
        [ALPHA_1, ALPHA_2].forEach(p => sb.pickPlayerForSide(String(p.id), 'a'));
        [BRAVO_1, BRAVO_2].forEach(p => sb.pickPlayerForSide(String(p.id), 'b'));
        setField('sm-format', 'stroke');
        sb.onSideMatchFormatChange();
        setField('sm-holestake', '0');
        setField('sm-overallstake', String(OVERALL_STAKE));
        setField('sm-scoring', 'gross');
        setField('sm-tie-rule', 'carry');
        setField('sm-overall-mode', 'stroke');
        setField('sm-segment', 'full');
        sb.saveSideMatch();

        const saved = writes[0].value;
        const scores = lopsided2v2Scores();
        const data = { gameFormat: 'stroke', players: FOURSOME, courseData: cd18,
                       scores: scores, sideMatches: { saved: saved } };

        const result = plain(realmFor(CANONICAL).computeCombinedNetTotals(data, cd18, scores));
        const nets = Object.values(result.netByName);

        // Settlement pays all four golfers on the saved record...
        assert.equal(nets.length, 4);
        assert.equal(nets.reduce((s, v) => s + v.net, 0), 0);
        assert.ok(nets.some(v => v.net > 0), 'somebody should be owed money');

        // ...while the page that created it reports nothing at all.
        // KNOWN DEFECT - EXPECTED TO BE REVERSED IN BATCH 2.
        const pageView = callOverall(realmFor('sidematches.html'), overallCfg2v2(), scores);
        assert.equal(pageView.base.p1Money, 0,
            'BATCH 2 MUST REVERSE THIS: the tab that created the match currently shows no money for it');
    });
});

// ===========================================================================
// 4. 1v1 REGRESSION LOCK
//
// Batch 2 must fix 2v2 WITHOUT moving a single cent of existing 1v1 money. This
// is not a copy of money_parity_test.js - it is a deliberately small set of
// cases whose only job is to fail loudly if a 2v2 repair reaches 1v1.
//
// The same fixture family as above, reduced to one golfer a side, so the 1v1
// and 2v2 coverage are provably about the same code paths.
// ===========================================================================

describe('1v1 REGRESSION LOCK — all three copies still agree without sides', () => {

    // One player per side, no sideA/sideB: the shape every existing side match has.
    function cfg1v1Overall(extra) {
        return Object.assign({
            overallEnabled: true, overallStake: OVERALL_STAKE,
            overallMode: 'stroke', scoringType: 'gross',
        }, extra || {});
    }
    function cfg1v1Hole(extra) {
        return Object.assign({
            holeEnabled: true, holeStake: HOLE_STAKE,
            segment: 'full', tieRule: 'carry', scoringType: 'gross',
        }, extra || {});
    }

    // Ann beats Ben on the first two holes, halves the rest. Deliberately not a
    // blowout, so ties and carries are exercised on the same card.
    function narrowScores() {
        const s = {};
        cd18.forEach(h => {
            s[`p${ALPHA_1.id}_h${h.hole}`] = (h.hole <= 2) ? 4 : 5;
            s[`p${BRAVO_1.id}_h${h.hole}`] = 5;
        });
        return s;
    }

    function partialScores() {
        const s = narrowScores();
        cd18.filter(h => h.hole > 12).forEach(h => {
            delete s[`p${ALPHA_1.id}_h${h.hole}`];
            delete s[`p${BRAVO_1.id}_h${h.hole}`];
        });
        return s;
    }

    // NET NEEDS TWO DIFFERENT HANDICAPS OR IT IS NOT A NET TEST.
    //
    // ALPHA_1 and BRAVO_1 are both scratch, so calling the same card "net" would
    // exercise nothing - getStrokes would return 0 on every hole and the case
    // would silently duplicate the gross one. Ben plays off 18 here, so he
    // receives a stroke on all eighteen and the allocation genuinely decides the
    // match. Every implementation must agree about that allocation, which is the
    // whole point of the case.
    const BRAVO_1_HCP18 = { id: BRAVO_1.id, name: BRAVO_1.name, hcp: '18' };

    const callOverallNet = (realm, cfg, scores, presses) =>
        plain(realm.calculateOverallBetEngine(
            [ALPHA_1, BRAVO_1_HCP18], cd18, scores, cfg, presses || []));

    const CASES = [
        { label: 'Ann ahead, most holes halved', cfg: cfg1v1Overall(), scores: narrowScores(), presses: [] },
        { label: 'net scoring with a real stroke allocation',
          cfg: cfg1v1Overall({ scoringType: 'net' }), scores: narrowScores(), presses: [],
          call: callOverallNet },
        { label: 'partial round', cfg: cfg1v1Overall(), scores: partialScores(), presses: [] },
        { label: 'one press at hole 10 with its own stake',
          cfg: cfg1v1Overall(), scores: narrowScores(), presses: [{ startHole: 10, stake: 25 }] },
        { label: 'two presses at different stakes', cfg: cfg1v1Overall(), scores: narrowScores(),
          presses: [{ startHole: 7, stake: 25 }, { startHole: 13, stake: 100 }] },
    ];

    // The money contract only. settlement-engine.js's copy carries four extra
    // display fields the page copies lack - base.stake, base.nameA, base.nameB,
    // base.endHole - so whole-object equality would fail forever on wording while
    // proving nothing about money. money_parity_test.js documents the same split.
    //
    // `winner` is deliberately NOT in this list, and that is a finding rather than
    // a convenience. On an identical 1v1 card the two implementations name the
    // same golfer differently: settlement-engine.js labels a side by first name
    // ("Ann") because it joins split names for a side that may hold two golfers,
    // while the page copies use the whole stored name ("Ann Alpha"). The money is
    // identical - p1Money carries both amount and direction, and it is asserted.
    // This is a PRE-EXISTING DISPLAY DIFFERENCE, measured on fresh main, not
    // something Batch 1 introduced and not something Batch 2 needs to preserve.
    // It is asserted separately below so it cannot silently become a money
    // difference later.
    const MONEY = ['p1Total', 'p2Total', 'holesCompleted', 'roundComplete', 'p1Money'];
    const pickMoney = (seg) => MONEY.reduce((acc, k) => (acc[k] = seg[k], acc), {});

    // Agreement on WHETHER a segment was won, without asserting how the winner is
    // spelled. A copy that decided nobody won while another paid out would fail
    // here even if p1Money were somehow equal.
    const decided = (seg) => (seg.winner === null || seg.winner === undefined) ? 'none' : 'someone';

    CASES.forEach(({ label, cfg, scores, presses, call }) => {
        test(`overall bet — ${label} — settles identically in all three copies`, () => {
            const run = call || callOverall;
            const results = ALL_THREE.map(name => run(realmFor(name), cfg, scores, presses));

            // Something must actually have been computed, or three empty answers
            // would agree trivially and this lock would be worthless.
            assert.ok(results[0].base.holesCompleted > 0, 'the fixture must complete holes');

            const canonical = pickMoney(results[0].base);
            results.slice(1).forEach((r, i) => {
                assert.deepEqual(pickMoney(r.base), canonical,
                    PAGE_COPIES[i] + ' diverged from settlement-engine.js on a 1v1 case');
                assert.equal(decided(r.base), decided(results[0].base),
                    PAGE_COPIES[i] + ' disagreed about whether the segment was won at all');
            });

            // Presses too, segment by segment.
            const canonPresses = (results[0].pressSegs || []).map(pickMoney);
            results.slice(1).forEach((r, i) => {
                assert.deepEqual((r.pressSegs || []).map(pickMoney), canonPresses,
                    PAGE_COPIES[i] + ' diverged on press segments for a 1v1 case');
                assert.deepEqual((r.pressSegs || []).map(decided),
                    (results[0].pressSegs || []).map(decided),
                    PAGE_COPIES[i] + ' disagreed about which presses were won');
            });
        });
    });

    test('per-hole bet — 1v1 money is identical in all three copies', () => {
        const scores = narrowScores();
        const results = ALL_THREE.map(name => callHole(realmFor(name), cfg1v1Hole(), scores));
        assert.notEqual(results[0].p1Money, 0, 'the fixture must move money');
        results.slice(1).forEach((r, i) => {
            assert.equal(r.p1Money, results[0].p1Money,
                PAGE_COPIES[i] + ' diverged on 1v1 per-hole money');
            assert.equal(r.currentCarry, results[0].currentCarry,
                PAGE_COPIES[i] + ' diverged on 1v1 carry');
            assert.equal(r.currentStake, results[0].currentStake,
                PAGE_COPIES[i] + ' diverged on 1v1 current stake');
        });
    });

    test('the net case genuinely exercises stroke allocation, in all three copies', () => {
        // Without this, "net scoring" above could be a case that quietly proves
        // nothing - three copies agreeing on a card where no stroke was ever given
        // is not evidence they agree about handicaps. Same card, same stake: gross
        // and net must reach DIFFERENT money, or the case is inert.
        const scores = narrowScores();
        ALL_THREE.forEach(name => {
            const gross = callOverall(realmFor(name), cfg1v1Overall(), scores);
            const net = callOverallNet(realmFor(name), cfg1v1Overall({ scoringType: 'net' }), scores);
            assert.notEqual(net.base.p1Money, gross.base.p1Money,
                name + ': eighteen strokes should change who wins, or the net case is inert');
        });
    });

    test('a 1v1 config is unaffected by the presence of single-player sides', () => {
        // The bridge case. settlement-engine.js falls back to [p1]/[p2] when the
        // sides are absent, so a one-per-side config must settle exactly like a
        // config with no sides at all. If Batch 2 breaks this, every existing side
        // match changes - which is the outcome this lock exists to prevent.
        const scores = narrowScores();
        const bare = callOverall(realmFor(CANONICAL), cfg1v1Overall(), scores);
        const explicit = callOverall(realmFor(CANONICAL),
            cfg1v1Overall({ sideA: [ALPHA_1], sideB: [BRAVO_1] }), scores);
        assert.deepEqual(pickMoney(explicit.base), pickMoney(bare.base));
    });
});
