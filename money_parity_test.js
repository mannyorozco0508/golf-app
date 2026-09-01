// ============================================================================
// DUPLICATED MONEY ENGINES MUST NOT DRIFT
//
// This app has no module system for its pages, so seven money-critical engines
// exist as inline copies across settlement-engine.js, money-engine.js,
// index.html, sidematches.html and stats.html. Duplication is deliberate - the
// project chose parity tests over a build step - but a copy edited alone would
// pay one golfer differently depending on which SCREEN produced the number.
//
// Every family below was measured agreeing before these guards were written.
// Nothing here is a fix; it is a tripwire.
//
// WHAT "PARITY" MEANS HERE, AND WHAT IT DOES NOT.
//
// calculateOverallBetEngine's settlement copy carries four fields the page
// copies lack - base.stake, base.nameA, base.nameB, base.endHole - used for
// receipt wording. Requiring whole-object equality would fail forever on
// display metadata while proving nothing about money. So that family is guarded
// on its money contract and the extras are asserted as intentional, which is
// stricter in the way that matters: if a page copy ever starts disagreeing about
// p1Money, that fails, and if the extras quietly appear or vanish, that fails too.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

// Shared engines in one realm; each page in its own, loaded with its real deps.
function engineRealm() {
    const sb = { console, Math, Object, Array, String, Number, JSON, isNaN,
                 parseInt, parseFloat, Date, Set, Map };
    vm.createContext(sb);
    ['money-engine.js','action-model.js','pool-engine.js','settlement-engine.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}
const PAGE_DEPS = {
    'index.html': ['score-marks.js','money-engine.js','action-model.js','settlement-engine.js',
                   'pool-engine.js','bet-strip.js','hole-events.js'],
    // sidematches.html (Batch 2) and stats.html (Batch 3) both load
    // settlement-engine.js for real - a <script src> on the page, not a harness
    // convenience - and neither carries a stroke-engine copy of its own any more.
    // Their stroke entries below therefore resolve to the canonical implementation;
    // the OTHER families here (calcPointSettlement, nassauStakeConfig) are still
    // genuine stats.html duplicates and are still guarded as such.
    'sidematches.html': ['money-engine.js','action-model.js','settlement-engine.js'],
    'stats.html': ['money-engine.js','action-model.js','settlement-engine.js'],
};
const pageRealms = {};
function fromPage(page, name) {
    if (!pageRealms[page]) pageRealms[page] = loadHtmlInlineScript(page, PAGE_DEPS[page]);
    try { return vm.runInContext(name, pageRealms[page]); } catch (e) { return undefined; }
}
// Cross-realm objects carry a foreign prototype, so deepStrictEqual rejects them
// even when every value matches. JSON round-trips into this realm.
const plain = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
const pick = (v, keys) => {
    const o = plain(v);
    if (o === null) return null;
    return keys.reduce((acc, k) => (acc[k] = o[k], acc), {});
};

const cd18 = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
const PAIR = [{ id:101, name:'Marty', hcp:'0' }, { id:102, name:'Manny', hcp:'0' }];
const TEAMS = PAIR.map((p,i) => Object.assign({}, p, { team: i ? 'Team 2' : 'Team 1' }));
const HCP = [{ id:101, name:'Marty', hcp:'18' }, { id:102, name:'Manny', hcp:'0' }];

// Marty wins 1 and 2; the rest halved. Deliberately not a blowout, so ties and
// carries are exercised on the same card.
function scores(mut) {
    const s = {};
    PAIR.forEach(p => cd18.forEach(h => { s['p'+p.id+'_h'+h.hole] = 4; }));
    s.p101_h1 = 3; s.p101_h2 = 3;
    if (mut) mut(s);
    return s;
}
const partial = () => {
    const s = {};
    [1,2,3,4].forEach(h => { s['p101_h'+h] = h === 1 ? 3 : 4; s['p102_h'+h] = 4; });
    return s;
};

// Runs one fixture through every copy of a family and asserts they agree.
function assertParity(label, copies, args, keys) {
    const names = Object.keys(copies).filter(k => typeof copies[k] === 'function');
    assert.ok(names.length >= 2, label + ': expected 2+ live copies, found ' + names.length);
    const results = names.map(n => {
        let out;
        try { out = copies[n](...args); }
        catch (e) { assert.fail(label + ' [' + n + '] threw: ' + e.message); }
        return [n, JSON.stringify(keys ? pick(out, keys) : plain(out))];
    });
    const first = results[0][1];
    results.slice(1).forEach(([n, v]) => {
        assert.equal(v, first,
            label + ': ' + n + ' disagrees with ' + results[0][0] + '\n  ' +
            results[0][0] + ': ' + first.slice(0, 200) + '\n  ' + n + ': ' + v.slice(0, 200));
    });
    return results.length;
}

// ============================================================================

describe('calculateHoleBetEngine — 1 implementation, 2 consumers', () => {
    // WAS THREE COPIES, THEN TWO, NOW ONE. sidematches.html's copy went in Batch 2
    // and stats.html's in Batch 3, so nothing can drift - the strongest form of
    // parity is not "the duplicates agree" but "there are no duplicates". The page
    // entries stay because running them proves each page ENDS UP with the canonical
    // function at runtime, which source text alone cannot show.
    const copies = () => ({
        'settlement-engine': engineRealm().calculateHoleBetEngine,
        'sidematches.html': fromPage('sidematches.html', 'calculateHoleBetEngine'),
        'stats.html': fromPage('stats.html', 'calculateHoleBetEngine'),
    });
    const cfg = (o) => Object.assign({ holeEnabled:true, holeStake:5, segment:'full',
        tieRule:'carry', scoringType:'gross', p1:PAIR[0], p2:PAIR[1] }, o || {});

    test('all three entries resolve to a function', () => {
        assert.equal(Object.values(copies()).filter(f => typeof f === 'function').length, 3);
    });
    test('NEITHER page has a local copy left to drift', () => {
        ['sidematches.html', 'stats.html'].forEach(page => {
            const src = read(page);
            const inline = src.replace(/<script src=[^>]*><\/script>/g, '');
            assert.ok(!/function calculateHoleBetEngine\s*\(/.test(inline),
                page + ' must not redeclare calculateHoleBetEngine - it would shadow the canonical one');
            assert.ok(!/function getRichHoleBetScore\s*\(/.test(inline),
                page + ' must not redeclare getRichHoleBetScore');
            assert.match(src, /<script src="settlement-engine\.js">/,
                page + ' must load the canonical engine instead');
        });
    });
    test('winner A', () => assertParity('holeBet A', copies(), [PAIR, cd18, scores(), cfg(), []]));
    test('winner B', () => assertParity('holeBet B', copies(),
        [PAIR, cd18, scores(s => { s.p101_h1 = 4; s.p101_h2 = 4; s.p102_h5 = 3; }), cfg(), []]));
    test('all halved', () => assertParity('holeBet tie', copies(),
        [PAIR, cd18, scores(s => { s.p101_h1 = 4; s.p101_h2 = 4; }), cfg(), []]));
    test('carries then resolves', () => assertParity('holeBet carry', copies(),
        [PAIR, cd18, scores(s => { s.p101_h1 = 4; s.p101_h2 = 4; s.p101_h6 = 3; }), cfg(), []]));
    test('net with strokes', () => assertParity('holeBet net', copies(),
        [HCP, cd18, scores(), cfg({ scoringType:'net', p1:HCP[0], p2:HCP[1] }), []]));
    test('odd stake', () => assertParity('holeBet odd', copies(),
        [PAIR, cd18, scores(), cfg({ holeStake: 7.5 }), []]));
    test('zero stake', () => assertParity('holeBet zero', copies(),
        [PAIR, cd18, scores(), cfg({ holeStake: 0 }), []]));
    test('front segment', () => assertParity('holeBet front', copies(),
        [PAIR, cd18, scores(), cfg({ segment:'front' }), []]));
    test('back segment', () => assertParity('holeBet back', copies(),
        [PAIR, cd18, scores(s => { s.p101_h12 = 3; }), cfg({ segment:'back' }), []]));
    test('partial round', () => assertParity('holeBet partial', copies(),
        [PAIR, cd18, partial(), cfg(), []]));
    test('empty card', () => assertParity('holeBet empty', copies(), [PAIR, cd18, {}, cfg(), []]));
});

describe('calculateOverallBetEngine — 1 implementation, 2 consumers', () => {
    // Now that no page owns a copy, the whole object can be compared rather than
    // just the money contract - see the note on the extras test below.
    const MONEY = ['p1Money','p1Total','p2Total','winner','roundComplete','holesCompleted','totalHoles'];
    const copies = () => ({
        'settlement-engine': engineRealm().calculateOverallBetEngine,
        'sidematches.html': fromPage('sidematches.html', 'calculateOverallBetEngine'),
        'stats.html': fromPage('stats.html', 'calculateOverallBetEngine'),
    });
    const cfg = (o) => Object.assign({ overallEnabled:true, overallStake:20, overallMode:'stroke',
        segment:'full', scoringType:'gross', p1:PAIR[0], p2:PAIR[1] }, o || {});

    test('all three entries resolve to a function', () => {
        assert.equal(Object.values(copies()).filter(f => typeof f === 'function').length, 3);
    });
    test('NEITHER page has a local copy left to drift', () => {
        ['sidematches.html', 'stats.html'].forEach(page => {
            const inline = read(page).replace(/<script src=[^>]*><\/script>/g, '');
            assert.ok(!/function calculateOverallBetEngine\s*\(/.test(inline),
                page + ' must not redeclare calculateOverallBetEngine');
            // segmentTotals and matchStatusFromHole lived INSIDE that copy. If either
            // reappears at any nesting level, a page-local money path has come back.
            assert.ok(!/function segmentTotals\s*\(/.test(inline),
                page + ' must not redeclare segmentTotals');
            assert.ok(!/function matchStatusFromHole\s*\(/.test(inline),
                page + ' must not redeclare matchStatusFromHole');
        });
    });
    test('winner A', () => assertParity('overall A', copies(), [PAIR, cd18, scores(), cfg(), []], MONEY));
    test('winner B', () => assertParity('overall B', copies(),
        [PAIR, cd18, scores(s => { s.p101_h1 = 4; s.p101_h2 = 4; s.p102_h5 = 3; }), cfg(), []], MONEY));
    test('tie', () => assertParity('overall tie', copies(),
        [PAIR, cd18, scores(s => { s.p101_h1 = 4; s.p101_h2 = 4; }), cfg(), []], MONEY));
    test('net', () => assertParity('overall net', copies(),
        [HCP, cd18, scores(), cfg({ scoringType:'net', p1:HCP[0], p2:HCP[1] }), []], MONEY));
    test('front / back segments', () => {
        assertParity('overall front', copies(), [PAIR, cd18, scores(), cfg({ segment:'front' }), []], MONEY);
        assertParity('overall back', copies(),
            [PAIR, cd18, scores(s => { s.p101_h12 = 3; }), cfg({ segment:'back' }), []], MONEY);
    });
    test('one press', () => assertParity('overall press', copies(),
        [PAIR, cd18, scores(), cfg(), [{ startHole: 5, stake: 50 }]], MONEY));
    test('multiple presses at different holes and stakes', () => assertParity('overall presses', copies(),
        [PAIR, cd18, scores(s => { s.p101_h6 = 3; s.p102_h9 = 3; }), cfg(),
         [{ startHole:5, stake:50 }, { startHole:8, stake:25 }, { startHole:14, stake:12.5 }]], MONEY));
    test('partial round', () => assertParity('overall partial', copies(), [PAIR, cd18, partial(), cfg(), []], MONEY));

    test('the display-only extras are no longer optional — nothing can lack them', () => {
        // OBSOLETE RATHER THAN SMALLER. This used to assert that the page copies
        // LACKED base.stake/nameA/nameB/endHole while settlement carried them, and
        // it shrank in Batch 2 when sidematches.html stopped having a copy. Batch 3
        // removed the last one, so there is nothing left that can lack them and the
        // useful statement inverted: every consumer now gets the canonical shape,
        // whole, and any page that starts differing has grown a local copy.
        const s = scores();
        const settle = plain(engineRealm().calculateOverallBetEngine(PAIR, cd18, s, cfg(), []));
        ['stake','nameA','nameB','endHole'].forEach(k =>
            assert.ok(k in settle.base, 'settlement must still carry base.' + k));

        ['sidematches.html','stats.html'].forEach(page => {
            const p = plain(fromPage(page, 'calculateOverallBetEngine')(PAIR, cd18, s, cfg(), []));
            assert.deepEqual(p, settle,
                page + ': one implementation now - the WHOLE object should match, not just the money');
        });
    });

});

describe('calcDotsEngine — 2 copies', () => {
    const copies = () => ({
        'index.html': fromPage('index.html', 'calcDotsEngine'),
        'money-engine': engineRealm().calcDotsEngine,
    });
    const data = (dots, val) => ({ players: PAIR, dots: dots || {}, dotPointVal: val === undefined ? 1 : val });

    test('both copies exist', () => {
        assert.equal(Object.values(copies()).filter(f => typeof f === 'function').length, 2);
    });
    test('no dots recorded', () => assertParity('dots empty', copies(), [data(), cd18, scores()]));
    test('positive events', () => assertParity('dots positive', copies(),
        [data({ h1: { '101': ['birdie'] }, h3: { '102': ['greenie'] } }), cd18, scores()]));
    test('multiple events on one hole', () => assertParity('dots multi', copies(),
        [data({ h1: { '101': ['birdie','greenie'], '102': ['sandy'] } }), cd18, scores()]));
    test('snake', () => assertParity('dots snake', copies(),
        [data({ h5: { '102': ['snake'] } }), cd18, scores()]));
    test('odd point value', () => assertParity('dots odd', copies(),
        [data({ h1: { '101': ['birdie'] } }, 2.5), cd18, scores()]));
    test('zero point value', () => assertParity('dots zero', copies(),
        [data({ h1: { '101': ['birdie'] } }, 0), cd18, scores()]));
    test('partial round', () => assertParity('dots partial', copies(),
        [data({ h1: { '101': ['birdie'] } }), cd18, partial()]));
});

describe('calculateHiLoEngine — 2 copies', () => {
    const copies = () => ({
        'index.html': fromPage('index.html', 'calculateHiLoEngine'),
        'settlement-engine': engineRealm().calculateHiLoEngine,
    });
    const teamsWithHcp = [{ id:101, name:'Marty', hcp:'18', team:'Team 1' },
                          { id:102, name:'Manny', hcp:'0', team:'Team 2' }];

    test('both copies exist', () => {
        assert.equal(Object.values(copies()).filter(f => typeof f === 'function').length, 2);
    });
    test('one side ahead', () => assertParity('hilo ahead', copies(), [TEAMS, cd18, scores()]));
    test('all square', () => assertParity('hilo square', copies(),
        [TEAMS, cd18, scores(s => { s.p101_h1 = 4; s.p101_h2 = 4; })]));
    test('other side ahead', () => assertParity('hilo behind', copies(),
        [TEAMS, cd18, scores(s => { s.p101_h1 = 4; s.p101_h2 = 4; s.p102_h7 = 3; })]));
    test('with handicap strokes', () => assertParity('hilo hcp', copies(), [teamsWithHcp, cd18, scores()]));
    test('partial round', () => assertParity('hilo partial', copies(), [TEAMS, cd18, partial()]));
    test('empty card', () => assertParity('hilo empty', copies(), [TEAMS, cd18, {}]));
});

describe('calculateStrokePressSet — 2 copies', () => {
    const copies = () => ({
        'index.html': fromPage('index.html', 'calculateStrokePressSet'),
        'money-engine': engineRealm().calculateStrokePressSet,
    });

    test('both copies exist', () => {
        assert.equal(Object.values(copies()).filter(f => typeof f === 'function').length, 2);
    });
    test('no presses', () => assertParity('press none', copies(), [PAIR, cd18, scores(), 'gross', 10, []]));
    test('one press', () => assertParity('press one', copies(),
        [PAIR, cd18, scores(), 'gross', 10, [{ startHole: 5, stake: 10 }]]));
    test('multiple presses, different start holes', () => assertParity('press many', copies(),
        [PAIR, cd18, scores(), 'gross', 10,
         [{ startHole:4, stake:10 }, { startHole:9, stake:25 }, { startHole:13, stake:5 }]]));
    test('press with a different stake from the base', () => assertParity('press stake', copies(),
        [PAIR, cd18, scores(), 'gross', 10, [{ startHole: 6, stake: 100 }]]));
    test('net scoring', () => assertParity('press net', copies(), [HCP, cd18, scores(), 'net', 10, []]));
    test('odd base stake', () => assertParity('press odd', copies(), [PAIR, cd18, scores(), 'gross', 7.5, []]));
    test('partial round', () => assertParity('press partial', copies(),
        [PAIR, cd18, partial(), 'gross', 10, [{ startHole: 3, stake: 10 }]]));
});

describe('calcPointSettlement — 3 copies', () => {
    const copies = () => ({
        'index.html': fromPage('index.html', 'calcPointSettlement'),
        'stats.html': fromPage('stats.html', 'calcPointSettlement'),
        'money-engine': engineRealm().calcPointSettlement,
    });

    test('all three copies exist', () => {
        assert.equal(Object.values(copies()).filter(f => typeof f === 'function').length, 3);
    });
    test('one player ahead', () => assertParity('points ahead', copies(), [PAIR, { 101: 10, 102: 4 }, 2]));
    test('level', () => assertParity('points level', copies(), [PAIR, { 101: 7, 102: 7 }, 2]));
    test('other player ahead', () => assertParity('points behind', copies(), [PAIR, { 101: 3, 102: 11 }, 2]));
    test('odd dollar per point', () => assertParity('points odd', copies(), [PAIR, { 101: 10, 102: 4 }, 2.5]));
    test('zero dollar per point', () => assertParity('points zero', copies(), [PAIR, { 101: 10, 102: 4 }, 0]));
    test('negative totals', () => assertParity('points negative', copies(), [PAIR, { 101: -3, 102: 5 }, 2]));
    test('four players', () => {
        const four = PAIR.concat([{ id:103, name:'Carp', hcp:'0' }, { id:104, name:'Scott', hcp:'0' }]);
        assertParity('points four', copies(), [four, { 101: 8, 102: 4, 103: 6, 104: 2 }, 1]);
    });
    test('zero-sum holds in every copy', () => {
        // The money invariant, not just agreement between copies.
        Object.entries(copies()).forEach(([name, fn]) => {
            const out = plain(fn(PAIR, { 101: 10, 102: 4 }, 2));
            const sum = Object.values(out).reduce((a, v) => a + (typeof v === 'number' ? v : 0), 0);
            assert.equal(sum, 0, name + ' must be zero-sum');
        });
    });
});

describe('nassauStakeConfig — 4 copies', () => {
    const copies = () => ({
        'index.html': fromPage('index.html', 'nassauStakeConfig'),
        'sidematches.html': fromPage('sidematches.html', 'nassauStakeConfig'),
        'stats.html': fromPage('stats.html', 'nassauStakeConfig'),
        'money-engine': engineRealm().nassauStakeConfig,
    });

    test('all four copies exist', () => {
        assert.equal(Object.values(copies()).filter(f => typeof f === 'function').length, 4);
    });
    test('modern side-match shape', () => assertParity('nassau modern', copies(),
        [{ format:'nassau', frontStake:5, backStake:5, overallStake:10, autoPressStake:null }]));
    test('asymmetric stakes', () => assertParity('nassau asymmetric', copies(),
        [{ format:'nassau', frontStake:10, backStake:20, overallStake:50, autoPressStake:null }]));
    test('explicit auto-press amount', () => assertParity('nassau autopress', copies(),
        [{ format:'nassau', frontStake:10, backStake:10, overallStake:20, autoPressStake:25 }]));
    test('string values', () => assertParity('nassau strings', copies(),
        [{ format:'nassau', frontStake:'10', backStake:'10', overallStake:'20' }]));
    test('zeros', () => assertParity('nassau zeros', copies(),
        [{ format:'nassau', frontStake:0, backStake:0, overallStake:0 }]));
    test('missing individual fields', () => assertParity('nassau partial', copies(),
        [{ format:'nassau', frontStake:10 }]));
    test('not a nassau', () => assertParity('nassau other', copies(),
        [{ format:'match', frontStake:10 }]));
    test('empty object', () => assertParity('nassau empty', copies(), [{}]));

    test('legacy round-format shape resolves the same everywhere', () => {
        // The sidematches copy takes a side match and returns undefined for a legacy
        // round shape; money-engine understands both. Measured: all four return
        // undefined here, so the engine falls back to the single stake in every case
        // and legacy rounds settle identically whichever screen asks.
        [{ nassauFrontStake:5, nassauBackStake:5, nassauOverallStake:10 },
         { nassauStake: 10 }].forEach(fx => assertParity('nassau legacy', copies(), [fx]));
    });
});

describe('THE DUPLICATE INVENTORY IS EXACTLY WHAT WE THINK IT IS', () => {
    // This used to assert that nothing had moved. Something has: sidematches.html's
    // two stroke engines are gone, deliberately, and the list below is the current
    // truth rather than a frozen snapshot. Kept as an inventory, not deleted, so the
    // next removal is also a deliberate edit here instead of a silent disappearance.
    test('every guarded copy is still defined where we expect it', () => {
        const expected = {
            'settlement-engine.js': ['calculateHoleBetEngine','calculateOverallBetEngine','calculateHiLoEngine'],
            'money-engine.js': ['calcDotsEngine','calcPointSettlement','calculateStrokePressSet','nassauStakeConfig'],
            'index.html': ['calcDotsEngine','calculateHiLoEngine','calculateStrokePressSet','calcPointSettlement','nassauStakeConfig'],
            'sidematches.html': ['nassauStakeConfig'],
            // Batch 3 removed stats.html's two stroke engines. calcPointSettlement and
            // nassauStakeConfig are byte-identical money-engine duplicates that were
            // deliberately DEFERRED, so they must still be here.
            'stats.html': ['calcPointSettlement','nassauStakeConfig'],
        };
        Object.entries(expected).forEach(([file, fns]) => {
            const src = read(file);
            fns.forEach(fn => assert.ok(src.includes('function ' + fn + '('),
                fn + ' should still be defined in ' + file));
        });
    });

    test('and the stroke engines are gone from BOTH pages for good', () => {
        ['sidematches.html','stats.html'].forEach(page => {
            const inline = read(page).replace(/<script src=[^>]*><\/script>/g, '');
            ['calculateHoleBetEngine','calculateOverallBetEngine','getRichHoleBetScore',
             'segmentTotals','matchStatusFromHole'].forEach(fn =>
                assert.ok(!new RegExp('function ' + fn + '\\s*\\(').test(inline),
                    fn + ' must not return to ' + page));
        });
        // Batch 3 also took the byte-identical Birdie copy, for the same reason: a
        // shadow of a settlement-engine function on a page that now LOADS
        // settlement-engine is a divergence that has not happened yet.
        const statsInline = read('stats.html').replace(/<script src=[^>]*><\/script>/g, '');
        assert.ok(!/function calculateBirdieGameTotalsForSettle\s*\(/.test(statsInline),
            'calculateBirdieGameTotalsForSettle must not return to stats.html');
    });
});
