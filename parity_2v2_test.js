// ============================================================================
// 2v2 STROKE SIDE MATCHES — CORRECTNESS PROTECTION
//
// BATCH 1 wrote this file to PIN a defect. BATCH 2 fixed half of it, and the
// assertions moved with the code rather than being deleted.
//
// ---------------------------------------------------------------------------
// WHERE THINGS STAND NOW
// ---------------------------------------------------------------------------
//
//     settlement-engine.js   CANONICAL. Resolves each side from
//                            config.sideA/sideB and scores it best ball.
//
//     sidematches.html       CANONICAL CONSUMER. Loads settlement-engine.js and
//                            owns no stroke-engine copy at all. Batch 2.
//
//     stats.html             REMAINING DIVERGENT SHADOW. Still carries its own
//                            p1/p2-only copies. Guarded below until Batch 3.
//
// ---------------------------------------------------------------------------
// WHAT WAS WRONG, AND WHAT BATCH 2 DID ABOUT IT
// ---------------------------------------------------------------------------
//
// settlement-engine.js resolves a SIDE through sideHoleScore(); the copies that
// used to live in sidematches.html and stats.html read p1/p2 and ignore
// config.sideA/sideB entirely. On a 2v2 stroke match that meant the Receipt paid
// out while the Matches tab that created the match showed ALL SQUARE and $0.
//
// Batch 1 proved that is reachable today: pickPlayerForSide() caps a stroke match
// at one golfer per side, but the cap lives in the PICKER only, sidematchPickState
// is cleared solely by openSideMatchModal(), and saveSideMatch() never re-applies
// the stroke-specific limit at the write boundary. Pick 2v2 under Match Play,
// switch the format, save.
//
// Batch 2 deleted sidematches.html's copies, loaded settlement-engine.js, passed
// the real sides through, and corrected the five display sites that assumed one
// golfer per side. The picker cap is deliberately UNTOUCHED - that is Batch 2b.
//
// ---------------------------------------------------------------------------
// THE DEFECT-PINNING ASSERTIONS THAT REMAIN
// ---------------------------------------------------------------------------
//
// The stats.html tests still assert that canonical and page DISAGREE, marked:
//
//     KNOWN DEFECT - EXPECTED TO BE REVERSED IN BATCH 3
//
// They document a defect, not a desired state. When stats.html moves to the
// canonical engine those assertions MUST fail, and whoever does that work MUST
// rewrite them from "these disagree" to "these agree" - exactly as the
// sidematches.html block below was rewritten. That failure is the point. Do not
// delete or weaken an assertion to make a batch pass.
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
//   * Each page is loaded with the dependency list that page actually carries in
//     its <script src> tags. sidematches.html gets action-model.js AND
//     settlement-engine.js because it really loads both now; stats.html gets
//     action-model.js alone because that is still all it loads.
//
//   * The realms are proved distinct before anything is compared, so a collapsed
//     harness cannot make two implementations agree by accident.
//
//   * The reachability, display and press-start proofs EXECUTE production
//     functions and read what they produced - the saved Firebase write, the
//     rendered card HTML, the onclick the press input emits. None of them is a
//     regex standing in for behaviour.
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

// PRODUCTION DEPENDENCY LISTS, not convenient ones.
//
// sidematches.html gained a real <script src="settlement-engine.js"> in Batch 2,
// so the list below changed with the page. stats.html still loads action-model.js
// alone, and its inline copies remain the only stroke engines it has at runtime.
// A test asserts each list against the page's own markup, so neither can quietly
// stop describing production.
const PAGE_DEPS = {
    'sidematches.html': ['action-model.js', 'settlement-engine.js'],
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
// Pages that still own a stroke-engine copy of their own. sidematches.html left
// this list in Batch 2; stats.html is the last member.
const PAGE_COPIES = ['stats.html'];
// Every realm whose stroke engines must agree. sidematches.html is here not as an
// independent implementation but as the CONSUMER of the canonical one - running it
// proves the page ends up with the right function at runtime, which source text
// alone cannot show.
const ALL_REALMS = [CANONICAL, 'sidematches.html'].concat(PAGE_COPIES);

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

describe('HARNESS INTEGRITY — the realms are what we say they are', () => {

    test('every realm exposes both stroke engines', () => {
        ALL_REALMS.forEach(name => {
            const r = realmFor(name);
            assert.equal(typeof r.calculateOverallBetEngine, 'function',
                name + ' should expose calculateOverallBetEngine');
            assert.equal(typeof r.calculateHoleBetEngine, 'function',
                name + ' should expose calculateHoleBetEngine');
        });
    });

    test('the dependency lists match what each page actually loads', () => {
        // Fidelity, checked against the pages themselves rather than trusted. If a
        // page starts or stops loading an engine and this list is not updated, the
        // realm stops representing production and every comparison below softens
        // into an opinion.
        const loads = (page, src) => new RegExp('<script src="' + src.replace('.', '\\.') + '">')
            .test(fs.readFileSync(path.join(REPO_ROOT, page), 'utf8'));

        assert.ok(loads('sidematches.html', 'settlement-engine.js'),
            'sidematches.html must load the canonical engine');
        assert.deepEqual(PAGE_DEPS['sidematches.html'], ['action-model.js', 'settlement-engine.js']);

        assert.ok(!loads('stats.html', 'settlement-engine.js'),
            'stats.html does not load the canonical engine yet - if it now does, this file needs updating');
        assert.deepEqual(PAGE_DEPS['stats.html'], ['action-model.js']);
    });

    test('without the canonical engine the page FAILS LOUDLY, it does not compute zero', () => {
        // The silent-failure class bundle_manifest_test.js exists to catch: these are
        // plain <script src> globals, and much of this codebase guards call sites with
        // `typeof fn === 'function'`, which turns a missing engine into a quiet $0.
        // The stroke branch calls the engines unguarded, so removing the script tag
        // throws instead of paying nobody. Proved by loading the page WITHOUT the
        // dependency and watching the render fail.
        const crippled = loadHtmlInlineScript('sidematches.html', ['action-model.js']);
        assert.equal(typeof crippled.calculateOverallBetEngine, 'undefined',
            'without the script tag the page should have no engine at all');

        vm.runInContext(
            'currentMode = "TESTCD";' +
            'currentData = ' + JSON.stringify({
                players: FOURSOME, courseData: cd18, scores: lopsided2v2Scores(),
                sideMatches: { m1: { format: 'stroke', scoring: 'gross',
                    teamAIds: ['1', '2'], teamBIds: ['3', '4'], startHole: 1, createdAt: 1,
                    holeStake: 0, overallStake: OVERALL_STAKE, overallMode: 'stroke',
                    segment: 'full', tieRule: 'carry' } },
            }) + ';' +
            'lockedGroup = null; hasGroupLock = false;',
            crippled
        );
        assert.throws(() => crippled.renderSideMatches(),
            'a missing engine must break the card, not silently report no money');
    });

    test('sidematches.html owns NO stroke-engine copy that could shadow the canonical one', () => {
        // The load order is <script src> first, inline block second, and both are
        // plain globals - so a re-declared copy inline would WIN and silently
        // restore the divergence Batch 2 removed. Adding the script tag is not the
        // fix on its own; the absence of these five is.
        const src = fs.readFileSync(path.join(REPO_ROOT, 'sidematches.html'), 'utf8');
        const inline = src.replace(/<script src=[^>]*><\/script>/g, '');
        ['calculateHoleBetEngine', 'calculateOverallBetEngine', 'getRichHoleBetScore',
         'segmentTotals', 'matchStatusFromHole'].forEach(fn => {
            assert.ok(!new RegExp('function\\s+' + fn + '\\s*\\(').test(inline),
                'sidematches.html must not redeclare ' + fn + ' - it would shadow the canonical engine');
        });
    });

    test('the sidematches.html realm resolves to the canonical function at runtime', () => {
        // Source text says the copies are gone. This says the page ACTUALLY ends up
        // with the canonical behaviour once every script has run in browser order.
        const scores = lopsided2v2Scores();
        const viaPage = callOverall(realmFor('sidematches.html'), overallCfg2v2(), scores);
        const viaEngine = callOverall(realmFor(CANONICAL), overallCfg2v2(), scores);
        assert.deepEqual(viaPage, viaEngine,
            'one implementation now - the whole object should match, not just the money');
    });

    test('stats.html is still a genuinely separate implementation', () => {
        // The premise of every KNOWN DEFECT assertion that remains. If this ever
        // collapses to one function object, those tests would be comparing a thing
        // to itself and would pass for the wrong reason.
        assert.notEqual(realmFor('stats.html').calculateOverallBetEngine,
                        realmFor(CANONICAL).calculateOverallBetEngine);
        const st = fs.readFileSync(path.join(REPO_ROOT, 'stats.html'), 'utf8');
        assert.match(st, /function calculateOverallBetEngine\s*\(/,
            'stats.html still owns a copy - when it stops, Batch 3 rewrites this file');
    });

    test('stats.html carries its OWN getStrokes/parseHcp, which is why it runs at all', () => {
        // Load-bearing, not a style note: stats.html computes net scores without
        // money-engine.js. If those vanish without the page gaining the engine, the
        // copies below would throw rather than diverge, and every KNOWN DEFECT
        // assertion would change meaning.
        const r = realmFor('stats.html');
        assert.equal(typeof r.getStrokes, 'function');
        assert.equal(typeof r.parseHcp, 'function');
    });

    test('cross-realm results normalise to comparable plain objects', () => {
        // Guards the specific trap: deepStrictEqual rejects a foreign prototype even
        // when every value matches, so a naive comparison would report a difference
        // that does not exist and mask the one that does.
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
// 2. THE PAGE COPIES — one fixed, one still divergent
// ===========================================================================

describe('FIXED IN BATCH 2 — sidematches.html now agrees with canonical on 2v2', () => {
    // These three assertions were the KNOWN DEFECT block. They said "these disagree"
    // and named Batch 2 as the batch that must reverse them. It did, so they were
    // rewritten rather than removed - the protection survives, inverted.

    test('the overall bet pays the side that won, exactly as the Receipt does', () => {
        const page = callOverall(realmFor('sidematches.html'), overallCfg2v2(), lopsided2v2Scores());
        const canon = callOverall(realmFor(CANONICAL), overallCfg2v2(), lopsided2v2Scores());

        // The page used to report 90 v 90, winner null, $0 - Ann v Ben only, all halved.
        assert.equal(page.base.p1Total, 3 * 18);
        assert.equal(page.base.p2Total, 5 * 18);
        assert.equal(page.base.p1Money, OVERALL_STAKE);
        assert.equal(page.base.p1Money, canon.base.p1Money);
        assert.deepEqual(page.base, canon.base);
    });

    test('the per-hole bet pays every hole, exactly as the Receipt does', () => {
        const page = callHole(realmFor('sidematches.html'), holeCfg2v2(), lopsided2v2Scores());
        const canon = callHole(realmFor(CANONICAL), holeCfg2v2(), lopsided2v2Scores());
        assert.equal(page.p1Money, HOLE_STAKE * 18);
        assert.equal(page.p1Money, canon.p1Money);
    });

    test('the sides are genuinely being read, not coincidentally agreeing', () => {
        // The inverse of the Batch 1 isolation test. Back then the page produced
        // identical output with and without sideA/sideB, proving it never read them.
        // Now the two MUST differ, or the sides are being ignored again and the
        // agreement above would be luck rather than correctness.
        const withSides = callOverall(realmFor('sidematches.html'), overallCfg2v2(), lopsided2v2Scores());

        const bare = overallCfg2v2();
        delete bare.sideA;
        delete bare.sideB;
        const withoutSides = callOverall(realmFor('sidematches.html'), bare, lopsided2v2Scores());

        assert.notDeepEqual(withSides.base, withoutSides.base,
            'sidematches.html must read sideA/sideB - identical output either way means it does not');
        assert.equal(withoutSides.base.p1Money, 0, 'and without sides it correctly falls back to 1v1');
    });

    test('a partner who has not posted holds the hole here too', () => {
        // Best ball needs every golfer on the side before a hole can be decided.
        // Proving the page inherits that rule, not merely the arithmetic.
        const scores = lopsided2v2Scores();
        cd18.forEach(h => { delete scores[`p${ALPHA_2.id}_h${h.hole}`]; });
        const page = callOverall(realmFor('sidematches.html'), overallCfg2v2(), scores);
        assert.equal(page.base.roundComplete, false);
        assert.equal(page.base.p1Money, 0);
    });
});

describe('KNOWN DEFECT — stats.html is not 2v2-aware', () => {

    // KNOWN DEFECT - EXPECTED TO BE REVERSED IN BATCH 3.
    test('the Final Scorecard would show all square where the receipt pays out', () => {
        const page = callOverall(realmFor('stats.html'), overallCfg2v2(), lopsided2v2Scores());
        const canon = callOverall(realmFor(CANONICAL), overallCfg2v2(), lopsided2v2Scores());

        assert.equal(page.base.p1Money, 0);
        assert.equal(canon.base.p1Money, OVERALL_STAKE);
        assert.notEqual(page.base.p1Money, canon.base.p1Money,
            'BATCH 3 MUST REVERSE THIS: rewrite to assert.equal once stats.html uses the canonical engine');
    });

    // KNOWN DEFECT - EXPECTED TO BE REVERSED IN BATCH 3.
    test('the per-hole bet also reports nothing', () => {
        const page = callHole(realmFor('stats.html'), holeCfg2v2(), lopsided2v2Scores());
        assert.equal(page.p1Money, 0);
        assert.notEqual(page.p1Money, HOLE_STAKE * 18,
            'BATCH 3 MUST REVERSE THIS');
    });

    test('stats.html is now the ONLY place this defect still lives', () => {
        // Batch 1 recorded that both page copies shared one defect. One of them is
        // fixed, so the useful statement changed: sidematches.html has crossed over
        // and stats.html has not. If these two ever agree again it means either
        // Batch 3 landed (rewrite this file) or sidematches.html regressed.
        const sm = callOverall(realmFor('sidematches.html'), overallCfg2v2(), lopsided2v2Scores());
        const st = callOverall(realmFor('stats.html'), overallCfg2v2(), lopsided2v2Scores());
        assert.notEqual(sm.base.p1Money, st.base.p1Money);
        assert.equal(sm.base.p1Money, OVERALL_STAKE, 'sidematches.html is on the canonical engine');
        assert.equal(st.base.p1Money, 0, 'stats.html is not');
    });
});

// ===========================================================================
// 3. SELECTING AND SAVING A 2v2 STROKE MATCH
//
// BATCH 1 wrote this section to prove a 2v2 stroke match was reachable BY ACCIDENT:
// pickPlayerForSide() capped a stroke side at one golfer, but the cap lived in the
// picker only, sidematchPickState survives a format change, and saveSideMatch()
// never re-checked it. Pick 2v2 under Match Play, switch format, save.
//
// BATCH 2b removed the accident by making the behaviour intentional. Stroke Play
// takes 1v1 or 2v2 like every other match format, the picker says so, and the save
// boundary enforces the same contract - so the old bypass now leads somewhere
// valid instead of somewhere wrong. The tests below moved with it: they still
// execute the real picker and the real save path and read the real Firebase write,
// but what they assert changed from "this leaks" to "this is supported".
//
// The supported shape, stated once: equal sides, one or two golfers each, and no
// golfer on both sides.
// ===========================================================================

describe('BUILDING A SIDE MATCH — the picker offers 1v1 and 2v2 to every format', () => {

    // A fresh page realm per test, with the Firebase write captured. Nothing in
    // production is altered: db.ref is replaced on the SAME stub object the page
    // already holds, which is what the harness hands every test.
    function pageWithCapture(roster) {
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
            'currentData = { players: ' + JSON.stringify(roster || FOURSOME) + ', courseData: [], scores: {} };' +
            'lockedGroup = null; hasGroupLock = false;' +
            'sidematchPickState = {}; actionScope = null; actionOwnerGroup = null;',
            sb
        );

        const setField = (id, value) => { sb.document.getElementById(id).value = value; };
        const pickState = () => plain(vm.runInContext('sidematchPickState', sb));
        const alerts = [];
        sb.alert = (msg) => alerts.push(String(msg));
        return { sb, writes, setField, pickState, alerts };
    }

    // Fill in whichever stake fields the chosen format reads, then save.
    function saveAs(ctx, format) {
        ctx.setField('sm-format', format);
        ctx.sb.onSideMatchFormatChange();
        ctx.setField('sm-scoring', 'gross');
        if (format === 'stroke') {
            ctx.setField('sm-holestake', '0');
            ctx.setField('sm-overallstake', String(OVERALL_STAKE));
            ctx.setField('sm-tie-rule', 'carry');
            ctx.setField('sm-overall-mode', 'stroke');
            ctx.setField('sm-segment', 'full');
        } else {
            ctx.setField('sm-stake', String(OVERALL_STAKE));
            ctx.setField('sm-press-rule', 'none');
            if (format === 'nassau') {
                ctx.setField('sm-front-stake', String(OVERALL_STAKE));
                ctx.setField('sm-back-stake', String(OVERALL_STAKE));
                ctx.setField('sm-overall-stake', String(OVERALL_STAKE));
                ctx.setField('sm-autopress-mode', 'auto');
            }
        }
        ctx.sb.saveSideMatch();
        return ctx.writes;
    }

    const pick = (ctx, player, side) => ctx.sb.pickPlayerForSide(String(player.id), side);

    // ---- 1. Stroke selected FIRST allows two per side -----------------------

    test('Stroke Play, chosen first, accepts a second golfer on a side', () => {
        // The exact thing Batch 1 proved impossible through the normal path. No format
        // switch, no trick: pick Stroke, then build the sides.
        const ctx = pageWithCapture();
        ctx.setField('sm-format', 'stroke');
        ctx.sb.onSideMatchFormatChange();

        pick(ctx, ALPHA_1, 'a');
        pick(ctx, ALPHA_2, 'a');
        pick(ctx, BRAVO_1, 'b');
        pick(ctx, BRAVO_2, 'b');

        assert.deepEqual(ctx.pickState(), { '1': 'a', '2': 'a', '3': 'b', '4': 'b' });
    });

    // ---- 2. A third golfer on one side is still refused ---------------------

    test('a THIRD golfer on a side is refused, and nothing silently moves', () => {
        const roster = FOURSOME.concat([{ id: 5, name: 'Cal Charlie', hcp: '0' }]);
        const ctx = pageWithCapture(roster);
        ctx.setField('sm-format', 'stroke');
        ctx.sb.onSideMatchFormatChange();

        pick(ctx, ALPHA_1, 'a');
        pick(ctx, ALPHA_2, 'a');
        const before = ctx.pickState();
        ctx.sb.pickPlayerForSide('5', 'a');

        assert.deepEqual(ctx.pickState(), before,
            'a full side must reject the tap outright - no reassignment, no swap');
        assert.match(ctx.sb.document.getElementById('sm-team-size-indicator').innerHTML,
            /already has 2/, 'and the golfer must be told why');
    });

    // ---- 3 & 4. Both supported shapes actually save -------------------------

    test('1v1 Stroke Play saves', () => {
        const ctx = pageWithCapture();
        ctx.setField('sm-format', 'stroke');
        ctx.sb.onSideMatchFormatChange();
        pick(ctx, ALPHA_1, 'a');
        pick(ctx, BRAVO_1, 'b');

        const writes = saveAs(ctx, 'stroke');
        assert.equal(writes.length, 1);
        assert.equal(writes[0].value.format, 'stroke');
        assert.deepEqual(writes[0].value.teamAIds, ['1']);
        assert.deepEqual(writes[0].value.teamBIds, ['3']);
    });

    test('2v2 Stroke Play is intentionally selectable and saveable', () => {
        // WAS: "saveSideMatch() WRITES a 2v2 stroke side match - the write boundary is
        // unguarded". Same execution, same captured write; the finding is no longer a
        // loophole but the supported behaviour, reached without touching the format
        // selector twice.
        const ctx = pageWithCapture();
        ctx.setField('sm-format', 'stroke');
        ctx.sb.onSideMatchFormatChange();
        pick(ctx, ALPHA_1, 'a');
        pick(ctx, ALPHA_2, 'a');
        pick(ctx, BRAVO_1, 'b');
        pick(ctx, BRAVO_2, 'b');

        const writes = saveAs(ctx, 'stroke');
        assert.equal(writes.length, 1, 'the match should have been written');

        const w = writes[0];
        // Proves the function ran all the way to its own write rather than a test
        // fabricating a payload: the path is the one saveSideMatch() builds.
        assert.equal(w.path, 'events/TESTCD/sideMatches/PUSHKEY');
        assert.equal(w.value.format, 'stroke');
        assert.deepEqual(w.value.teamAIds, ['1', '2']);
        assert.deepEqual(w.value.teamBIds, ['3', '4']);
        assert.equal(w.value.overallStake, OVERALL_STAKE);
    });

    // ---- 5 & 6. What must NOT save -----------------------------------------

    test('unequal sides do not save', () => {
        // Built by hand rather than through the picker, because the picker cannot
        // produce this - which is exactly why the SAVE boundary has to check. A
        // picker-only rule was the whole Batch 1 finding.
        const ctx = pageWithCapture();
        vm.runInContext("sidematchPickState = { '1': 'a', '2': 'a', '3': 'b' };", ctx.sb);

        const writes = saveAs(ctx, 'stroke');
        assert.equal(writes.length, 0, '2 vs 1 must be refused');
        assert.ok(ctx.alerts.some(a => /equal number/.test(a)), 'and the golfer must be told why');
    });

    test('three per side does not save', () => {
        const ctx = pageWithCapture(FOURSOME.concat([
            { id: 5, name: 'Cal Charlie', hcp: '0' }, { id: 6, name: 'Dan Delta', hcp: '0' }]));
        vm.runInContext("sidematchPickState = { '1': 'a', '2': 'a', '5': 'a', '3': 'b', '4': 'b', '6': 'b' };", ctx.sb);

        const writes = saveAs(ctx, 'stroke');
        assert.equal(writes.length, 0, '3 vs 3 must be refused - two per side is the supported maximum');
        assert.ok(ctx.alerts.some(a => /1v1 or 2v2/.test(a)));
    });

    test('a golfer cannot occupy both sides', () => {
        // Prevention lives in the picker, and it is structural rather than a check:
        // sidematchPickState maps a golfer to ONE side, so tapping the other side
        // MOVES them. Both id lists in saveSideMatch() are Object.keys() of that same
        // map partitioned by value, which makes overlap unrepresentable rather than
        // merely rejected.
        const ctx = pageWithCapture();
        ctx.setField('sm-format', 'stroke');
        ctx.sb.onSideMatchFormatChange();

        pick(ctx, ALPHA_1, 'a');
        assert.deepEqual(ctx.pickState(), { '1': 'a' });

        pick(ctx, ALPHA_1, 'b');
        assert.deepEqual(ctx.pickState(), { '1': 'b' },
            'tapping the other side must MOVE a golfer, never duplicate them');

        // And what actually gets saved is disjoint, checked on the real write rather
        // than on the intermediate state.
        pick(ctx, BRAVO_1, 'a');
        const w = saveAs(ctx, 'stroke')[0].value;
        const overlap = w.teamAIds.filter(id => w.teamBIds.includes(id));
        assert.deepEqual(overlap, [], 'no golfer may appear on both sides of a saved match');
    });

    // ---- 7 & 8. The other formats are unchanged ----------------------------

    test('Match Play 2v2 still works', () => {
        const ctx = pageWithCapture();
        ctx.setField('sm-format', 'match');
        ctx.sb.onSideMatchFormatChange();
        pick(ctx, ALPHA_1, 'a'); pick(ctx, ALPHA_2, 'a');
        pick(ctx, BRAVO_1, 'b'); pick(ctx, BRAVO_2, 'b');

        const writes = saveAs(ctx, 'match');
        assert.equal(writes.length, 1);
        assert.equal(writes[0].value.format, 'match');
        assert.deepEqual(writes[0].value.teamAIds, ['1', '2']);
        assert.deepEqual(writes[0].value.teamBIds, ['3', '4']);
    });

    test('Nassau 2v2 still works', () => {
        const ctx = pageWithCapture();
        ctx.setField('sm-format', 'nassau');
        ctx.sb.onSideMatchFormatChange();
        pick(ctx, ALPHA_1, 'a'); pick(ctx, ALPHA_2, 'a');
        pick(ctx, BRAVO_1, 'b'); pick(ctx, BRAVO_2, 'b');

        const writes = saveAs(ctx, 'nassau');
        assert.equal(writes.length, 1);
        assert.equal(writes[0].value.format, 'nassau');
        assert.deepEqual(writes[0].value.teamAIds, ['1', '2']);
        assert.deepEqual(writes[0].value.teamBIds, ['3', '4']);
    });

    // ---- 9. Format switching in both directions ----------------------------

    test('switching format preserves a valid 2v2 selection, both ways', () => {
        // sidematchPickState is cleared only by openSideMatchModal(), so a selection
        // survives a format change. That used to be the bypass; now every format
        // accepts the same shape, so surviving is correct rather than dangerous.
        const toStroke = pageWithCapture();
        toStroke.setField('sm-format', 'match');
        toStroke.sb.onSideMatchFormatChange();
        pick(toStroke, ALPHA_1, 'a'); pick(toStroke, ALPHA_2, 'a');
        pick(toStroke, BRAVO_1, 'b'); pick(toStroke, BRAVO_2, 'b');
        toStroke.setField('sm-format', 'stroke');
        toStroke.sb.onSideMatchFormatChange();
        assert.deepEqual(toStroke.pickState(), { '1': 'a', '2': 'a', '3': 'b', '4': 'b' },
            'Match Play -> Stroke Play must not drop a golfer');
        assert.equal(saveAs(toStroke, 'stroke')[0].value.format, 'stroke');

        const toMatch = pageWithCapture();
        toMatch.setField('sm-format', 'stroke');
        toMatch.sb.onSideMatchFormatChange();
        pick(toMatch, ALPHA_1, 'a'); pick(toMatch, ALPHA_2, 'a');
        pick(toMatch, BRAVO_1, 'b'); pick(toMatch, BRAVO_2, 'b');
        toMatch.setField('sm-format', 'match');
        toMatch.sb.onSideMatchFormatChange();
        assert.deepEqual(toMatch.pickState(), { '1': 'a', '2': 'a', '3': 'b', '4': 'b' },
            'Stroke Play -> Match Play must not drop a golfer either');
        assert.equal(saveAs(toMatch, 'match')[0].value.format, 'match');
    });

    test('a saved 2v2 stroke match settles through the canonical engine', () => {
        // Closes the loop: the record the picker now produces on purpose is the record
        // Batch 2 taught the tab and the Receipt to agree about.
        const ctx = pageWithCapture();
        ctx.setField('sm-format', 'stroke');
        ctx.sb.onSideMatchFormatChange();
        pick(ctx, ALPHA_1, 'a'); pick(ctx, ALPHA_2, 'a');
        pick(ctx, BRAVO_1, 'b'); pick(ctx, BRAVO_2, 'b');
        const saved = saveAs(ctx, 'stroke')[0].value;

        const scores = lopsided2v2Scores();
        const data = { gameFormat: 'stroke', players: FOURSOME, courseData: cd18,
                       scores: scores, sideMatches: { saved: saved } };
        const result = plain(realmFor(CANONICAL).computeCombinedNetTotals(data, cd18, scores));
        const nets = Object.values(result.netByName);

        assert.equal(nets.length, 4);
        assert.equal(nets.reduce((s, v) => s + v.net, 0), 0);

        const pageView = callOverall(realmFor('sidematches.html'), overallCfg2v2(), scores);
        assert.equal(pageView.base.p1Money, OVERALL_STAKE);
        nets.filter(v => v.net > 0).forEach(v => assert.equal(v.net, pageView.base.p1Money / 2));
    });

    // ---- 10. The instruction line tells the truth --------------------------

    test('the picker instruction no longer limits 2v2 to Match Play and Nassau', () => {
        const src = fs.readFileSync(path.join(REPO_ROOT, 'sidematches.html'), 'utf8');
        assert.ok(!/2v2 works for Match Play and Nassau only/.test(src),
            'the modal must not tell golfers 2v2 is unavailable to Stroke Play');
        assert.ok(!/Match Play and Nassau only/.test(src),
            'nor any rewording of the same claim');
        assert.match(src, /Build 1v1 or 2v2 sides/,
            'and it should say plainly that both shapes are available');
    });
});

// ===========================================================================
// 4. RENDERED 2v2 CARD
//
// Money being right is half of it. Batch 1 found five places in the stroke card
// that assumed one golfer per side, and the engine swap made one of them ACTIVELY
// WRONG: b.winner used to be "Ann Alpha" and is now "Ann / Abe", so the old
// .split(' ')[0] would have dropped the partner from a match she won with him.
//
// These tests run renderSideMatches() - the real production render - and read the
// HTML it produced. No regex stands in for behaviour.
// ===========================================================================

describe('RENDERED 2v2 CARD — both sides, and money that matches the Receipt', () => {

    // A page realm with a whole round loaded, rendered through production.
    function renderRound(players, sideMatch, scores) {
        const sb = loadHtmlInlineScript('sidematches.html', PAGE_DEPS['sidematches.html']);
        vm.runInContext(
            'currentMode = "TESTCD";' +
            'currentData = ' + JSON.stringify({
                players: players, courseData: cd18, scores: scores,
                sideMatches: { m1: sideMatch },
            }) + ';' +
            'lockedGroup = null; hasGroupLock = false;',
            sb
        );
        sb.renderSideMatches();
        return { sb, html: sb.document.getElementById('sidematches-list').innerHTML || '' };
    }

    const SM_2V2 = {
        format: 'stroke', scoring: 'gross',
        teamAIds: ['1', '2'], teamBIds: ['3', '4'],
        startHole: 1, createdAt: 1,
        holeStake: 0, overallStake: OVERALL_STAKE,
        overallMode: 'stroke', segment: 'full', tieRule: 'carry',
    };

    test('the render actually ran and produced a card', () => {
        // Everything below reads this string. If the render silently no-oped, the
        // assertions would be searching an empty page and passing on absence.
        const { html } = renderRound(FOURSOME, SM_2V2, lopsided2v2Scores());
        assert.ok(html.length > 500, 'renderSideMatches() should have produced a card');
        assert.match(html, /side-match-card/);
    });

    test('renderSideMatches passes the WHOLE side to the engine', () => {
        // The call-site guard. The engine-level tests above hand the config in
        // themselves, so they cannot see whether the page builds it correctly.
        // Strip sideA/sideB at the call site and the card falls back to Ann v Ben,
        // which is all square - so this is the assertion that fails.
        const { html } = renderRound(FOURSOME, SM_2V2, lopsided2v2Scores());
        const canon = callOverall(realmFor(CANONICAL), overallCfg2v2(), lopsided2v2Scores());
        assert.equal(canon.base.p1Money, OVERALL_STAKE);
        assert.ok(html.includes('+$' + canon.base.p1Money.toFixed(2)),
            'the card must show the canonical 2v2 result, which means it passed both golfers per side');
        assert.ok(!html.includes('Base bet tied'),
            'a tied card means only the first golfer of each side reached the engine');
    });

    test('the header names BOTH golfers on BOTH sides', () => {
        const { html } = renderRound(FOURSOME, SM_2V2, lopsided2v2Scores());
        const header = html.match(/<div class="side-match-players">([^<]*)<\/div>/);
        assert.ok(header, 'the card should have a players header');
        ['Ann', 'Abe', 'Ben', 'Bo'].forEach(name =>
            assert.ok(header[1].includes(name), 'the header should name ' + name + ', got: ' + header[1]));
    });

    test('the winning SIDE is named in full — a 1v1-only winner render must fail here', () => {
        // THE REGRESSION GUARD. b.winner is "Ann / Abe". Reintroducing
        // winner.split(' ')[0] renders "Ann won the base bet" and this fails.
        const { html } = renderRound(FOURSOME, SM_2V2, lopsided2v2Scores());
        const canon = callOverall(realmFor(CANONICAL), overallCfg2v2(), lopsided2v2Scores());

        assert.ok(html.includes(canon.base.winner + ' won the base bet'),
            'the card should name the whole winning side, got winner: ' + canon.base.winner);
        assert.ok(!/(^|[^/\w])Ann won the base bet/.test(html),
            'a truncated winner name means the partner was dropped from a match she won');
    });

    test('the money row reports the SIDE, and the per-golfer row matches settlement exactly', () => {
        const scores = lopsided2v2Scores();
        const { html } = renderRound(FOURSOME, SM_2V2, scores);

        // The side's position.
        assert.ok(html.includes('+$' + OVERALL_STAKE.toFixed(2)),
            'the side that won should show the whole stake');

        // What each golfer actually settles for, taken from canonical settlement
        // rather than recomputed here.
        const data = { gameFormat: 'stroke', players: FOURSOME, courseData: cd18,
                       scores: scores, sideMatches: { m1: SM_2V2 } };
        const result = plain(realmFor(CANONICAL).computeCombinedNetTotals(data, cd18, scores));

        assert.ok(html.includes('Per golfer:'), 'a team match should break the side total down per golfer');
        Object.values(result.netByName).forEach(v => {
            const first = v.name.split(' ')[0];
            const amount = v.net > 0
                ? '+$' + v.net.toFixed(2)
                : '-$' + Math.abs(v.net).toFixed(2);
            assert.ok(html.includes(first) && html.includes(amount),
                'the card should show ' + first + ' at ' + amount + ' — the same figure the Receipt pays');
        });
    });

    test('all four golfers appear in the mini scorecard', () => {
        // Best ball means a partner's score can decide a hole, so a verify-scores card
        // showing two of the four cannot be used to check the money.
        const { html } = renderRound(FOURSOME, SM_2V2, lopsided2v2Scores());
        const card = html.slice(html.indexOf('sm-scorecard-body'));
        ['Ann', 'Abe', 'Ben', 'Bo'].forEach(name =>
            assert.ok(card.includes('sm-row-label">' + name),
                name + ' should have a row in the mini scorecard'));
    });

    test('the page names each side the way the engine does', () => {
        // The card derives sideAName/sideBName for the per-hole row, which the engine
        // returns no names for. This pins that convention to base.nameA/nameB so one
        // card cannot label the same wager two different ways.
        const { html } = renderRound(FOURSOME, SM_2V2, lopsided2v2Scores());
        const canon = callOverall(realmFor(CANONICAL), overallCfg2v2(), lopsided2v2Scores());
        assert.ok(html.includes(canon.base.nameA), 'side A should be named as the engine names it');
        assert.ok(html.includes(canon.base.nameB), 'side B should be named as the engine names it');
    });

    test('a 1v1 card shows NO per-golfer breakdown, because there is nothing to split', () => {
        const solo = [ALPHA_1, BRAVO_1];
        const sm1v1 = Object.assign({}, SM_2V2, { teamAIds: ['1'], teamBIds: ['3'] });
        const scores = {};
        cd18.forEach(h => {
            scores[`p${ALPHA_1.id}_h${h.hole}`] = (h.hole <= 2) ? 4 : 5;
            scores[`p${BRAVO_1.id}_h${h.hole}`] = 5;
        });
        const { html } = renderRound(solo, sm1v1, scores);
        assert.ok(!html.includes('Per golfer:'),
            'a 1v1 card must be untouched - the split row is for team matches only');
        assert.ok(html.includes('Ann') && html.includes('Ben'));
    });
});

// ===========================================================================
// 5. PRESS START HOLE
//
// Where a press begins is money. getLastPlayedHoleForSideMatch used to look at
// exactly two golfers, so on a 2v2 a press could start on a hole two of the four
// had not played - sitting over holes the engine cannot score yet.
//
// The rule is the engine's own, not a new one: a hole counts once EVERY golfer in
// the match has posted, which is what sideHoleScore() already requires.
// ===========================================================================

describe('PRESS START HOLE — every participant counts', () => {

    function pressRealm(scores, sideMatch, players) {
        const sb = loadHtmlInlineScript('sidematches.html', PAGE_DEPS['sidematches.html']);
        vm.runInContext(
            'currentMode = "TESTCD";' +
            'currentData = ' + JSON.stringify({
                players: players, courseData: cd18, scores: scores,
                sideMatches: { m1: sideMatch },
            }) + ';' +
            'lockedGroup = null; hasGroupLock = false;',
            sb
        );
        return sb;
    }

    const SM_2V2 = {
        format: 'stroke', scoring: 'gross', teamAIds: ['1', '2'], teamBIds: ['3', '4'],
        startHole: 1, createdAt: 1, holeStake: HOLE_STAKE, overallStake: OVERALL_STAKE,
        overallMode: 'stroke', segment: 'full', tieRule: 'carry',
    };

    // Scores for holes 1..thru, optionally leaving one golfer short.
    function postedThrough(ids, thru, shortId, shortAfter) {
        const s = {};
        cd18.filter(h => h.hole <= thru).forEach(h => {
            ids.forEach(id => {
                if (shortId && String(id) === String(shortId) && h.hole > shortAfter) return;
                s[`p${id}_h${h.hole}`] = 5;
            });
        });
        return s;
    }

    // The press hole the production UI actually offers, read out of the onclick that
    // showSideHolePressInput() writes into the card. Behavioural, not a source read.
    function offeredPressHole(sb) {
        sb.showSideHolePressInput('m1', '1', '3');
        const row = sb.document.getElementById('sm-hole-press-row-m1').innerHTML || '';
        const m = row.match(/confirmSideHolePress\('m1', (\d+)/);
        assert.ok(m, 'the press input should carry a start hole, got: ' + row);
        return parseInt(m[1], 10);
    }

    test('2v2 — with all four posted through 6, the press starts on 7', () => {
        const sb = pressRealm(postedThrough([1, 2, 3, 4], 6), SM_2V2, FOURSOME);
        assert.equal(offeredPressHole(sb), 7);
    });

    test('2v2 — a partner short of the group holds the press back', () => {
        // Abe has posted only through 4 while the other three are through 6. The last
        // hole EVERYONE played is 4, so the press starts on 5 - not 7.
        const sb = pressRealm(postedThrough([1, 2, 3, 4], 6, 2, 4), SM_2V2, FOURSOME);
        assert.equal(offeredPressHole(sb), 5,
            'a press must not start on holes two of the four have not played');
    });

    test('2v2 — the golfer left behind can be on either side', () => {
        // Bo is on side B. The rule is about the match, not about one team.
        const sb = pressRealm(postedThrough([1, 2, 3, 4], 6, 4, 3), SM_2V2, FOURSOME);
        assert.equal(offeredPressHole(sb), 4);
    });

    test('1v1 — behaviour is exactly what it always was', () => {
        const sm1v1 = Object.assign({}, SM_2V2, { teamAIds: ['1'], teamBIds: ['3'] });
        const sb = pressRealm(postedThrough([1, 3], 6), sm1v1, [ALPHA_1, BRAVO_1]);
        assert.equal(offeredPressHole(sb), 7);

        const behind = pressRealm(postedThrough([1, 3], 6, 3, 4), sm1v1, [ALPHA_1, BRAVO_1]);
        assert.equal(offeredPressHole(behind), 5,
            'one golfer short has always held a 1v1 press back - unchanged');
    });

    test('the helper reads the participants from the STORED match, not from the card', () => {
        // The press buttons still carry p1Id/p2Id. If the helper trusted those, a 2v2
        // would silently be measured on two golfers again. It resolves the full side
        // list from the saved record instead, which is the wager that actually exists.
        const sb = pressRealm(postedThrough([1, 2, 3, 4], 6, 2, 4), SM_2V2, FOURSOME);
        const people = plain(vm.runInContext(
            'sideMatchParticipants(sideMatchById("m1"), []).map(p => p.name)', sb));
        assert.deepEqual(people.sort(), ['Abe Alpha', 'Ann Alpha', 'Ben Bravo', 'Bo Bravo']);
    });
});

// ===========================================================================
// 6. 1v1 REGRESSION LOCK
//
// Batch 2 must fix 2v2 WITHOUT moving a single cent of existing 1v1 money. This
// is not a copy of money_parity_test.js - it is a deliberately small set of
// cases whose only job is to fail loudly if a 2v2 repair reaches 1v1.
//
// The same fixture family as above, reduced to one golfer a side, so the 1v1
// and 2v2 coverage are provably about the same code paths.
// ===========================================================================

describe('1v1 REGRESSION LOCK — every realm still agrees without sides', () => {

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
        test(`overall bet — ${label} — settles identically in every realm`, () => {
            const run = call || callOverall;
            const results = ALL_REALMS.map(name => run(realmFor(name), cfg, scores, presses));

            // Something must actually have been computed, or three empty answers
            // would agree trivially and this lock would be worthless.
            assert.ok(results[0].base.holesCompleted > 0, 'the fixture must complete holes');

            const canonical = pickMoney(results[0].base);
            results.slice(1).forEach((r, i) => {
                assert.deepEqual(pickMoney(r.base), canonical,
                    ALL_REALMS[i + 1] + ' diverged from settlement-engine.js on a 1v1 case');
                assert.equal(decided(r.base), decided(results[0].base),
                    ALL_REALMS[i + 1] + ' disagreed about whether the segment was won at all');
            });

            // Presses too, segment by segment.
            const canonPresses = (results[0].pressSegs || []).map(pickMoney);
            results.slice(1).forEach((r, i) => {
                assert.deepEqual((r.pressSegs || []).map(pickMoney), canonPresses,
                    ALL_REALMS[i + 1] + ' diverged on press segments for a 1v1 case');
                assert.deepEqual((r.pressSegs || []).map(decided),
                    (results[0].pressSegs || []).map(decided),
                    ALL_REALMS[i + 1] + ' disagreed about which presses were won');
            });
        });
    });

    test('per-hole bet — 1v1 money is identical in every realm', () => {
        const scores = narrowScores();
        const results = ALL_REALMS.map(name => callHole(realmFor(name), cfg1v1Hole(), scores));
        assert.notEqual(results[0].p1Money, 0, 'the fixture must move money');
        results.slice(1).forEach((r, i) => {
            assert.equal(r.p1Money, results[0].p1Money,
                ALL_REALMS[i + 1] + ' diverged on 1v1 per-hole money');
            assert.equal(r.currentCarry, results[0].currentCarry,
                ALL_REALMS[i + 1] + ' diverged on 1v1 carry');
            assert.equal(r.currentStake, results[0].currentStake,
                ALL_REALMS[i + 1] + ' diverged on 1v1 current stake');
        });
    });

    test('the net case genuinely exercises stroke allocation, in every realm', () => {
        // Without this, "net scoring" above could be a case that quietly proves
        // nothing - three copies agreeing on a card where no stroke was ever given
        // is not evidence they agree about handicaps. Same card, same stake: gross
        // and net must reach DIFFERENT money, or the case is inert.
        const scores = narrowScores();
        ALL_REALMS.forEach(name => {
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
