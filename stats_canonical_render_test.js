// ============================================================================
// STATS.HTML — CANONICAL MONEY ENGINES AND THE GOLDEN FINAL SCORECARD
//
// BATCH 3. stats.html was the last page carrying its own copies of the Stroke
// Play side-match engines, and those copies read p1/p2 only - they ignored
// config.sideA/sideB entirely. A 2v2 Stroke Play match therefore paid out on the
// Receipt and on the Matches tab while the FINAL SCORECARD - the card a group
// prints and keeps - showed $0.00 for the same wager.
//
// Batch 3 deleted those copies, loaded settlement-engine.js, passed the real
// sides through, and moved the Stroke ledger rows to side names so they read the
// way the Match Play and Nassau rows beside them always have.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE IS FOR
// ---------------------------------------------------------------------------
//
// Two jobs, and the second is the one that matters most:
//
//   1. Prove the 2v2 correction is real, in money and in words.
//
//   2. Prove NOTHING ELSE MOVED. Canonicalising an engine on a page that renders
//      historical rounds is exactly the change that quietly alters a card
//      somebody already settled from. Thirteen fixtures were rendered through
//      the real renderCleanCard() on the commit BEFORE this batch and hashed;
//      twelve of those hashes are unchanged here and are asserted byte-for-byte.
//      Only '08 stroke 2v2' moved, and it moved to a value proved against
//      canonical settlement rather than to whatever the new code happened to
//      produce.
//
// A hash alone would tell you something broke without telling you what. So the
// changed fixture is ALSO asserted in plain terms - side names, the overall
// bet, the per-hole bet, the combined side result and the zero-sum contract -
// and the money is compared against settlement-engine.js rather than typed in.
//
// ---------------------------------------------------------------------------
// SCOPE, STATED SO IT CANNOT DRIFT
// ---------------------------------------------------------------------------
//
// Batch 3 canonicalised exactly four functions. Wolf, Stableford, point
// settlement, calculateMatchEngine and its relative-handicap helpers,
// nassauStakeConfig, parseHcp and getStrokes remain STATS-LOCAL on purpose -
// they are byte-identical duplicates rather than divergences, and adopting them
// would mean loading money-engine.js, which is a different batch. Tests below
// assert BOTH halves of that boundary: the four are gone, and the deferred ones
// are still here. Claiming Stats owns no calculation logic would be false.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

// The dependency list stats.html actually carries, asserted against its markup
// below rather than trusted.
const STATS_DEPS = ['action-model.js', 'settlement-engine.js'];

// ---------------------------------------------------------------------------
// FIXTURES
// ---------------------------------------------------------------------------

const CD18 = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));

const ANN = { id: 1, name: 'Ann Alpha', hcp: '0' };
const ABE = { id: 2, name: 'Abe Alpha', hcp: '0' };
const BEN = { id: 3, name: 'Ben Bravo', hcp: '12' };
const BO  = { id: 4, name: 'Bo Bravo',  hcp: '0' };

// 1v1 card. Ann wins holes 1, 2, 11 and 14 - deliberately inside EVERY press
// window used below, so a press that is mishandled moves money and the golden
// hash shifts. An earlier draft of these fixtures put every press in a halved
// stretch, which made three cases hash identically and proved nothing.
function scoresHeadToHead() {
    const s = {};
    CD18.forEach(h => {
        s[`p${ANN.id}_h${h.hole}`] = [1, 2, 11, 14].includes(h.hole) ? 4 : 5;
        s[`p${BEN.id}_h${h.hole}`] = 5;
    });
    return s;
}

// 2v2 card. Abe shoots 3 on every hole; the other three shoot 5. Judged as a
// side, Alpha wins every hole. Judged as Ann v Ben - which is what a p1/p2-only
// engine sees - every hole is halved. The two answers are maximally different,
// and the difference is caused only by whether Abe is looked at.
function scoresTeam() {
    const s = {};
    CD18.forEach(h => {
        s[`p${ANN.id}_h${h.hole}`] = 5;
        s[`p${ABE.id}_h${h.hole}`] = 3;
        s[`p${BEN.id}_h${h.hole}`] = 5;
        s[`p${BO.id}_h${h.hole}`]  = 5;
    });
    return s;
}

const HEAD = scoresHeadToHead();
const TEAM = scoresTeam();

const strokeSm = (extra) => Object.assign({
    format: 'stroke', scoring: 'gross', teamAIds: ['1'], teamBIds: ['3'],
    startHole: 1, createdAt: 1, holeStake: 10, overallStake: 50,
    overallMode: 'stroke', segment: 'full', tieRule: 'carry',
}, extra || {});

const withSide = (players, sm, scores) => ({
    gameFormat: 'stroke', players: players, courseData: CD18, scores: scores,
    sideMatches: { m1: sm },
});

// Twelve shapes a real round can arrive in. Eleven must render byte-for-byte as
// they did before Batch 3; the twelfth is the defect being corrected.
const FIXTURES = {
    '01 stroke 1v1 gross': withSide([ANN, BEN], strokeSm(), HEAD),

    '02 stroke 1v1 net': withSide([ANN, BEN], strokeSm({ scoring: 'net' }), HEAD),

    '03 stroke custom press stake': withSide([ANN, BEN],
        strokeSm({ overallPresses: { a: { startHole: 10, stake: 25 } } }), HEAD),

    '04 stroke multiple presses': withSide([ANN, BEN], strokeSm({
        overallPresses: { a: { startHole: 7, stake: 25 }, b: { startHole: 13, stake: 100 } },
        holePresses: { c: { fromHole: 12, newStake: 30 } },
    }), HEAD),

    '05 stroke start-hole 6': withSide([ANN, BEN], strokeSm({ startHole: 6 }), HEAD),

    '06 side match play 2v2': withSide([ANN, ABE, BEN, BO], {
        format: 'match', scoring: 'net', teamAIds: ['1', '2'], teamBIds: ['3', '4'],
        startHole: 1, createdAt: 1, stake: 20, pressRule: 'none',
    }, TEAM),

    '07 modern nassau 2v2': withSide([ANN, ABE, BEN, BO], {
        format: 'nassau', scoring: 'net', teamAIds: ['1', '2'], teamBIds: ['3', '4'],
        startHole: 1, createdAt: 1, frontStake: 10, backStake: 10,
        overallStake: 20, autoPressStake: 5, pressRule: '2down',
    }, TEAM),

    // THE ONE THAT CHANGES.
    '08 stroke 2v2': withSide([ANN, ABE, BEN, BO],
        strokeSm({ teamAIds: ['1', '2'], teamBIds: ['3', '4'] }), TEAM),

    // Legacy round shape: the wager IS the round format, no sideMatches at all.
    '09 legacy nassau round': {
        gameFormat: 'nassau', nassauStake: 10, nassauScoring: 'net', nassauPressRule: 'none',
        players: [Object.assign({}, ANN, { team: 'Team 1' }), Object.assign({}, BEN, { team: 'Team 2' })],
        courseData: CD18, scores: HEAD,
    },

    '10 money pool round': {
        gameFormat: 'stroke', players: [ANN, ABE, BEN, BO], courseData: CD18, scores: TEAM,
        moneyPool: { enabled: true, buyIn: 20, net: { first: 60, second: 20 }, skins: { mode: 'none' } },
    },

    '11 wolf round': {
        gameFormat: 'wolf', wolfValue: 2, players: [ANN, ABE, BEN, BO], courseData: CD18, scores: TEAM,
        wolfCalls: { h1: { wolf: '1', partner: '2' }, h2: { wolf: '2', partner: null } },
    },

    '12 stableford round': {
        gameFormat: 'stableford', stablefordValue: 1,
        players: [ANN, ABE, BEN, BO], courseData: CD18, scores: TEAM,
    },

    // A TIED stroke bet. Without this the golden set never exercises the equality
    // branch, so mutating the engine's `p1Total < p2Total` to `<=` changed nothing
    // any fixture could see - which is precisely the kind of hole a negative
    // control exists to find. Every hole halved: nobody wins, nothing is paid.
    '14 stroke 1v1 all square': withSide([ANN, BEN], strokeSm(), (() => {
        const s = {};
        CD18.forEach(h => { s[`p${ANN.id}_h${h.hole}`] = 5; s[`p${BEN.id}_h${h.hole}`] = 5; });
        return s;
    })()),

    // A TIED 2v2, for the same reason on the side-resolving path.
    '15 stroke 2v2 all square': withSide([ANN, ABE, BEN, BO],
        strokeSm({ teamAIds: ['1', '2'], teamBIds: ['3', '4'] }), (() => {
            const s = {};
            CD18.forEach(h => [1, 2, 3, 4].forEach(id => { s[`p${id}_h${h.hole}`] = 5; }));
            return s;
        })()),

    // Birdie pool, so the canonicalised calculateBirdieGameTotalsForSettle is
    // covered by a golden rather than only by the parity suite.
    '13 birdie pool round': {
        gameFormat: 'stroke', birdieGameEnabled: true, birdieValue: 5, birdieScoring: 'gross',
        players: [ANN, ABE, BEN, BO], courseData: CD18, scores: TEAM,
    },
};
// ---------------------------------------------------------------------------
// GOLDEN HASHES
//
// Captured from the commit BEFORE Batch 3 by rendering each fixture through the
// real renderCleanCard() and hashing #stats-content. Twelve are unchanged. The
// thirteenth is the defect being corrected and is spelled out in words below as
// well, so a regression reports what broke rather than only that something did.
// ---------------------------------------------------------------------------

const GOLDEN = {
    '01 stroke 1v1 gross': '2703164454e3ef05e9b0cc664ae5bd74234fefa5c30dda6bfa750705cfe904e6',
    '02 stroke 1v1 net': 'c465914e8d802f0127904626f12c6083ef64894f42cb406b25ff3832af868b8c',
    '03 stroke custom press stake': '4a695d586d7f8ddc691b95308f9ab6190c16bd7130e238ebacaf21d4ba475cd3',
    '04 stroke multiple presses': '361c3fcbf1a3c313972e86dc21dbd52e3b8382f5a57549417ec84e20b587a795',
    '05 stroke start-hole 6': 'd706b349329a710a4d5b6798d65b3cc5d86e724211660837fa6d1b0efc7cc629',
    '06 side match play 2v2': 'ea8e19a541ed3a5ce6fe043048c78af6f822d38575f5e5dfe465eb9fa23fab2e',
    '07 modern nassau 2v2': '13323d8e9427ad8a87d36ef2a6068b82760ad85a836679e11c5b29c9f1bc664e',
    '08 stroke 2v2': '34788195a3eb21219df042734ee0672b6e9de25fa277c5937a01a9cda5629c0e',   // INTENTIONAL — the money defect, spelled out below
    '09 legacy nassau round': 'c79a96f13de1b87d67a9a63253c76716dbc514f9abd10691e8497025bbef6118',
    '10 money pool round': '24cc53526012abeba1f0b76bc67369fe5335b48348baf7a5d850985b4f25320a',
    '11 wolf round': '0cd128cb2bf50dbbe4d04bd51e73143716df024f675700d979d4f26a0bbc8aa3',
    '12 stableford round': '3664ab5a65e2fbf09e6bba32249ca5805fc03cd08d159f1c622c11bf66368808',
    '13 birdie pool round': '2d6d3b299d0c11ca8621a007f8188ccb96243c09ba95b37e63cc3dff3fa1ed3f',
    '14 stroke 1v1 all square': '8f4626495317cb96a3ec6f6b95ac3b635925b456ab7147bc087934dad57badfe',
    '15 stroke 2v2 all square': '679a62b83305052cf6614caa194379edafb3f20489850c4b7097b777ee69c107',   // INTENTIONAL — side name only; money is $0 either way
};

// Renders one fixture through production and returns the card HTML.
function renderStats(data, deps) {
    const sb = loadHtmlInlineScript('stats.html', deps || STATS_DEPS);
    vm.runInContext('currentData = ' + JSON.stringify(data) + '; currentMode = "TESTCD";', sb);
    sb.renderCleanCard(data);
    return sb.document.getElementById('stats-content').innerHTML || '';
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// The shared engines in their own realm, for comparing Stats against canonical.
function engineRealm() {
    const sb = { console, Math, Object, Array, String, Number, JSON, isNaN,
                 parseInt, parseFloat, Date, Set, Map };
    vm.createContext(sb);
    ['money-engine.js', 'action-model.js', 'pool-engine.js', 'settlement-engine.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}
const plain = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

// ===========================================================================
// 1. THE GOLDEN LOCK
// ===========================================================================

describe('GOLDEN FINAL SCORECARD — every historical shape still renders identically', () => {

    test('the fixture set and the golden table describe the same thing', () => {
        // A golden lock with a missing entry silently protects nothing.
        assert.deepEqual(Object.keys(FIXTURES).sort(), Object.keys(GOLDEN).sort());
        assert.equal(Object.keys(FIXTURES).length, 15);
    });

    Object.keys(FIXTURES).sort().forEach(name => {
        // Two fixtures change. '08' is the money defect being corrected. '15' is the
        // same 2v2 card with every hole halved: nobody is paid either way, so only
        // the side NAME moved - proof the naming change is independent of the money
        // change and that a tied side is still reported as a side.
        const changed = name === '08 stroke 2v2' || name === '15 stroke 2v2 all square';
        test(`${name}${changed ? ' — INTENTIONALLY CHANGED IN BATCH 3' : ' — byte-identical to pre-Batch-3'}`, () => {
            const html = renderStats(FIXTURES[name]);
            assert.ok(html.length > 200, name + ': the card should have rendered');
            assert.equal(sha(html), GOLDEN[name],
                changed
                    ? name + ': the corrected 2v2 card changed again - if that was deliberate, the money assertions below must be updated too'
                    : name + ': this shape must render exactly as it did before Batch 3');
        });
    });

    test('the fixtures are genuinely distinct, so no two share a hash by accident', () => {
        // An earlier draft of these fixtures put every press inside a halved
        // stretch, so three cases hashed identically and would have passed while
        // proving nothing about press handling. Distinctness is the guard.
        const seen = new Set(Object.values(GOLDEN));
        assert.equal(seen.size, Object.keys(GOLDEN).length,
            'two fixtures share a hash - one of them is not exercising what it claims to');
    });
});

// ===========================================================================
// 2. THE 2v2 CORRECTION, IN WORDS AND IN MONEY
// ===========================================================================

describe('STATS 2v2 STROKE — side names and money that agree with settlement', () => {

    const data = () => FIXTURES['08 stroke 2v2'];

    test('the card names both golfers on both sides', () => {
        const html = renderStats(data());
        assert.ok(html.includes('Ann/Abe vs Ben/Bo — Stroke Play'),
            'the Side Matches heading should name the whole side on each side');
        ['Ann', 'Abe', 'Ben', 'Bo'].forEach(n =>
            assert.ok(html.includes(n), 'the card should mention ' + n));
    });

    test('the money on the card is the canonical side result, to the cent', () => {
        const eng = engineRealm();
        const d = data();
        const sm = d.sideMatches.m1;
        const teamA = d.players.filter(p => sm.teamAIds.includes(String(p.id)));
        const teamB = d.players.filter(p => sm.teamBIds.includes(String(p.id)));
        const sides = { sideA: teamA, sideB: teamB };

        const overall = plain(eng.calculateOverallBetEngine([teamA[0], teamB[0]], CD18, d.scores,
            Object.assign({ overallEnabled: true, overallStake: sm.overallStake,
                            overallMode: 'stroke', scoringType: sm.scoring }, sides), []));
        const hole = plain(eng.calculateHoleBetEngine([teamA[0], teamB[0]], CD18, d.scores,
            Object.assign({ holeEnabled: true, holeStake: sm.holeStake, segment: 'full',
                            tieRule: 'carry', scoringType: sm.scoring }, sides), []));

        // Measured from canonical, not typed in: $50 overall + $180 per-hole.
        assert.equal(overall.base.p1Money, 50);
        assert.equal(hole.p1Money, 180);
        const combined = overall.base.p1Money + hole.p1Money;
        assert.equal(combined, 230);

        const html = renderStats(d);
        assert.ok(html.includes('+$' + combined.toFixed(2)),
            'the winning side should show +$' + combined.toFixed(2));
        assert.ok(html.includes('-$' + combined.toFixed(2)),
            'and the losing side the exact negative');
    });

    test('the card is zero-sum, and matches what the Receipt settles', () => {
        const eng = engineRealm();
        const d = data();
        const result = plain(eng.computeCombinedNetTotals(d, CD18, d.scores));
        const nets = Object.values(result.netByName);

        assert.equal(nets.length, 4, 'settlement pays all four golfers');
        assert.equal(nets.reduce((s, v) => s + v.net, 0), 0, 'every completed wager is zero-sum');

        // Stats reports the SIDE; the Receipt splits it between teammates. Same
        // money, two vocabularies - which is the whole point of the assertion.
        const sideTotal = nets.filter(v => v.net > 0).reduce((s, v) => s + v.net, 0);
        assert.equal(sideTotal, 230);
        const html = renderStats(d);
        assert.ok(html.includes('+$' + sideTotal.toFixed(2)));
    });

    test('Stats stays SIDE-LEVEL, exactly as it already reports 2v2 Match Play', () => {
        // A deliberate product decision, pinned so a later batch does not add a
        // per-golfer breakdown to Stroke alone and leave one card inconsistent
        // with the Match and Nassau rows beside it.
        const html = renderStats(data());
        assert.ok(!/Per golfer/.test(html),
            'the Final Scorecard does not break any format down per golfer - the Receipt does');
        // And the two rows spell the pair the SAME way. settlement-engine.js joins a
        // side with " / " while calculateMatchEngine uses "/", so naming the Stroke
        // row from the engine would have printed "Ann / Abe" directly above
        // "Ann/Abe" for the same two golfers on one card.
        const matchHtml = renderStats(FIXTURES['06 side match play 2v2']);
        assert.ok(matchHtml.includes('Ann/Abe'), 'Match Play reports side names as Ann/Abe');
        assert.ok(html.includes('Ann/Abe'), 'and Stroke must spell it identically');
    });

    test('a 1v1 card still shows the golfer\u2019s stored name, not a joined side name', () => {
        // The side-name change must be invisible on a single match. Ann is "Ann
        // Alpha" on a 1v1 ledger row, as she always was.
        const html = renderStats(FIXTURES['01 stroke 1v1 gross']);
        assert.ok(html.includes('Ann Alpha'), 'a 1v1 row keeps the full stored name');
        assert.ok(html.includes('Ann vs Ben — Stroke Play'),
            'and the heading keeps first names for a one-golfer side');
    });
});

// ===========================================================================
// 3. THE BATCH 3 BOUNDARY — what left, and what deliberately stayed
// ===========================================================================

describe('NO-COPY GUARD — stats.html owns no divergent Stroke engine', () => {

    const inlineOnly = () => read('stats.html').replace(/<script src=[^>]*><\/script>/g, '');

    test('stats.html loads the canonical engine', () => {
        assert.match(read('stats.html'), /<script src="settlement-engine\.js">/);
    });

    test('the four canonicalised functions are gone and cannot shadow it', () => {
        // Load order is <script src> first, inline block second, and both are
        // plain globals - so a re-declared copy inline would WIN. Adding the tag
        // is not the fix; the absence of these is.
        const inline = inlineOnly();
        ['getRichHoleBetScore', 'calculateHoleBetEngine', 'calculateOverallBetEngine',
         'calculateBirdieGameTotalsForSettle',
         // nested inside the deleted overall engine - if either reappears at any
         // depth, a page-local money path has come back
         'segmentTotals', 'matchStatusFromHole'].forEach(fn => {
            assert.ok(!new RegExp('function\\s+' + fn + '\\s*\\(').test(inline),
                'stats.html must not redeclare ' + fn);
        });
    });

    test('the DEFERRED engines are still here, on purpose', () => {
        // Half of the boundary. Batch 3 canonicalised four functions, not every
        // function that calculates something. If one of these disappears, either
        // a later batch widened scope without saying so, or something was deleted
        // by accident - both worth failing over.
        const inline = inlineOnly();
        ['calcWolfEngine', 'calcStablefordEngine', 'calcPointSettlement',
         'calculateMatchEngine', 'nassauStakeConfig', 'parseHcp', 'getStrokes',
         'allocateMatchStrokes', 'matchHandicapBaseline', 'matchRelativeHandicaps',
         'relativeMatchStrokes', 'isRelativeMatchFormat'].forEach(fn => {
            assert.ok(new RegExp('function\\s+' + fn + '\\s*\\(').test(inline),
                'stats.html should STILL own ' + fn + ' - Batch 3 deliberately deferred it');
        });
    });

    test('money-engine.js is deliberately NOT loaded', () => {
        assert.ok(!/<script src="money-engine\.js">/.test(read('stats.html')),
            'adopting the money-engine duplicates is a different batch');
    });

    test('neither page copy of the Stroke engines survives anywhere', () => {
        // The end state Batches 2 and 3 were aiming at, asserted in one place.
        ['sidematches.html', 'stats.html'].forEach(page => {
            const inline = read(page).replace(/<script src=[^>]*><\/script>/g, '');
            ['calculateHoleBetEngine', 'calculateOverallBetEngine'].forEach(fn =>
                assert.ok(!new RegExp('function\\s+' + fn + '\\s*\\(').test(inline),
                    page + ' must not own ' + fn));
            assert.match(read(page), /<script src="settlement-engine\.js">/);
        });
    });
});

// ===========================================================================
// 4. DEPENDENCY — Stats must fail loudly without the engine
// ===========================================================================

describe('DEPENDENCY — no silent fallback to $0', () => {

    test('the runtime functions ARE the canonical definitions, not a survivor', () => {
        // Source text says the copies are gone. This says the page actually ends
        // up with canonical behaviour once every script has run in browser order.
        const sb = loadHtmlInlineScript('stats.html', STATS_DEPS);
        const eng = engineRealm();
        const d = FIXTURES['08 stroke 2v2'];
        const sm = d.sideMatches.m1;
        const teamA = d.players.filter(p => sm.teamAIds.includes(String(p.id)));
        const teamB = d.players.filter(p => sm.teamBIds.includes(String(p.id)));
        const cfg = { overallEnabled: true, overallStake: 50, overallMode: 'stroke',
                      scoringType: 'gross', sideA: teamA, sideB: teamB };
        assert.deepEqual(
            plain(sb.calculateOverallBetEngine([teamA[0], teamB[0]], CD18, d.scores, cfg, [])),
            plain(eng.calculateOverallBetEngine([teamA[0], teamB[0]], CD18, d.scores, cfg, [])),
            'one implementation now - the whole object should match, not just the money');
    });

    test('without settlement-engine.js the card THROWS rather than printing $0', () => {
        // The silent-failure class bundle_manifest_test.js exists to catch: these
        // are plain <script src> globals, and much of this codebase guards call
        // sites with `typeof fn === 'function'`, which turns a missing engine into
        // a quiet zero on a printed scorecard. The Stroke branch calls them
        // unguarded, so absence breaks the card visibly instead.
        // { only: true } - the harness now loads a page's real script tags by default,
        // so a realm deliberately missing the engine has to say so explicitly.
        const crippled = loadHtmlInlineScript('stats.html', ['action-model.js'], { only: true });
        assert.equal(typeof crippled.calculateOverallBetEngine, 'undefined',
            'without the script tag the page should have no Stroke engine at all');
        const d = FIXTURES['08 stroke 2v2'];
        vm.runInContext('currentData = ' + JSON.stringify(d) + '; currentMode = "TESTCD";', crippled);
        assert.throws(() => crippled.renderCleanCard(d),
            'a missing engine must break the card, not silently report no money');
    });

    test('the Birdie totals now come from the canonical engine too', () => {
        // calculateBirdieGameTotalsForSettle was byte-identical when it was
        // deleted, so the golden for fixture 13 is unchanged. What is new is that
        // Stats has no copy of it - proved here at runtime, not by source text.
        const sb = loadHtmlInlineScript('stats.html', STATS_DEPS);
        const eng = engineRealm();
        const d = FIXTURES['13 birdie pool round'];
        assert.equal(typeof sb.calculateBirdieGameTotalsForSettle, 'function');
        assert.deepEqual(
            plain(sb.calculateBirdieGameTotalsForSettle(d, CD18, d.scores)),
            plain(eng.calculateBirdieGameTotalsForSettle(d, CD18, d.scores)));
    });
});
