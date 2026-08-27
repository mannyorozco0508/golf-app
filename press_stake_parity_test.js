// ============================================================================
// PER-PRESS STAKE PARITY — THE HOLE THAT LET A $15 DISCREPANCY SHIP
//
// calculateMatchEngine exists in four places. HANDOFF.md says that duplication is
// intentional and parity-guarded, and seventeen parity tests were green.
//
// They were green because parity_test.js exercised Nassau with
//
//     manualPresses = []
//
// The ONE behaviour that had diverged was the one behaviour never tested. The
// per-press stake work (authorized Aug 2026) landed in money-engine.js alone;
// index.html, sidematches.html and stats.html kept settling every press at the
// base wager.
//
//     $10 Nassau + $25 manual press, press wins
//       money-engine.js  $45   <- what the Receipt paid
//       index.html       $30   <- what the scorecard showed all round
//
// Final settlement was always correct - settlement.html loads money-engine.js and
// defines no copy. Nothing was ever paid wrong. But the live surfaces contradicted
// the Receipt, which for an app whose whole promise is "nobody argues after the
// round" is its own kind of failure.
//
// THESE TESTS USE REAL EXPLICIT PRESS STAKES and assert EXACT DOLLARS across all
// four implementations. Zero-sum is not used as an oracle: every case below would
// balance perfectly while still paying the wrong number.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadJsFile, loadHtmlInlineScript } = require('./helpers/load-script.js');

const ENGINES = {
    'money-engine.js':   loadJsFile('money-engine.js'),
    'index.html':        loadHtmlInlineScript('index.html'),
    'sidematches.html':  loadHtmlInlineScript('sidematches.html'),
    'stats.html':        loadHtmlInlineScript('stats.html'),
};
const NAMES = Object.keys(ENGINES);

const cd18 = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
const PLAYERS = [
    { id:101, name:'Marty', hcp:'0', team:'Team 1' },
    { id:102, name:'Manny', hcp:'0', team:'Team 2' },
];

// winners: hole -> 'A' (team 1) | 'B' (team 2) | undefined (halved)
function scores(winners) {
    const s = {};
    for (let h = 1; h <= 18; h++) {
        s['p101_h'+h] = 4 + (winners[h] === 'A' ? -1 : 0);
        s['p102_h'+h] = 4 + (winners[h] === 'B' ? -1 : 0);
    }
    return s;
}
function runAll({ winners = {}, format = 'nassau', stake = 10, presses = [], pressRule = 'none' }) {
    const sc = scores(winners);
    const args = [PLAYERS, cd18, sc, 'gross', format, pressRule, stake, 0, presses];
    const out = {};
    NAMES.forEach(n => { out[n] = ENGINES[n].calculateMatchEngine(...args); });
    return out;
}
// Every implementation must agree on money AND on the press facts behind it.
function assertParity(r, label) {
    const base = r[NAMES[0]];
    NAMES.slice(1).forEach(n => {
        const x = r[n];
        assert.equal(x.t1TotalMoney, base.t1TotalMoney,
            `${label}: ${n} pays $${x.t1TotalMoney}, canonical pays $${base.t1TotalMoney}`);
        assert.equal(x.pressCount, base.pressCount, `${label}: ${n} press count`);
        const shape = m => m.activeMatches.filter(a => a.pressNum > 0)
            .map(a => a.baseId + '@' + a.startHole + ':' + a.status + ':' + String(a.stake))
            .sort().join(' | ');
        assert.equal(shape(x), shape(base), `${label}: ${n} press shape`);
        const segs = m => m.activeMatches.map(a => a.id + '=' + a.status).sort().join(',');
        assert.equal(segs(x), segs(base), `${label}: ${n} segment states`);
    });
}
const money = r => r['money-engine.js'].t1TotalMoney;

// ============================================================================

describe('THE EXACT REPRODUCTION', () => {

    test('$10 Nassau + $25 press, press WINS — all four pay $45', () => {
        // Front $10 won + Total $10 won + press $25 won = $45.
        const r = runAll({ winners:{6:'A'}, presses:[{ baseId:'F9', startHole:5, stake:25 }] });
        assert.equal(money(r), 45, 'canonical must pay $45');
        assertParity(r, '$25 press wins');
    });

    test('$10 Nassau + $25 press, press LOSES — all four agree', () => {
        // Manny takes hole 6, so the press swings to team 2 at its own $25.
        const r = runAll({ winners:{6:'B'}, presses:[{ baseId:'F9', startHole:5, stake:25 }] });
        assert.equal(money(r), -45, 'the $25 must swing the other way, not $10');
        assertParity(r, '$25 press loses');
    });

    test('$10 Nassau + $25 press, press PUSHES — press pays nothing', () => {
        // Nobody wins a hole after H5, so the press is level and settles at zero
        // while the base segments still pay.
        const r = runAll({ winners:{1:'A'}, presses:[{ baseId:'F9', startHole:5, stake:25 }] });
        assert.equal(money(r), 20, 'Front $10 + Total $10, press level');
        assertParity(r, '$25 press pushes');
    });

    test('THE SIDE MATCH CASE — $10 + $25 press pays $35', () => {
        // sidematches.html persists stake on press creation, so this is a routine
        // user action there rather than an edge case.
        const r = runAll({ winners:{6:'A'}, format:'match',
                           presses:[{ baseId:'18', startHole:5, stake:25 }] });
        assert.equal(money(r), 35, 'base $10 + press $25');
        assertParity(r, 'side match $25 press');
    });
});

describe('MULTIPLE AND MIXED STAKES', () => {

    test('two presses with DIFFERENT explicit stakes stay distinct', () => {
        // $10 base + $25 + $50 = $85. Collapsing them to one value pays $30.
        const r = runAll({ winners:{6:'A'}, format:'match',
            presses:[{ baseId:'18', startHole:3, stake:25 }, { baseId:'18', startHole:5, stake:50 }] });
        assert.equal(money(r), 85);
        assertParity(r, 'two distinct stakes');
        // Compared as plain values: arrays built inside the sandbox are not the same
        // Array constructor as the test's, so deepEqual fails on identity even when
        // the contents match exactly.
        const stakes = r['money-engine.js'].activeMatches
            .filter(m => m.pressNum > 0).map(m => Number(m.stake)).sort((a,b)=>a-b);
        assert.equal(stakes.join(','), '25,50', 'each press keeps its own amount');
    });

    test('an explicit-stake press beside a fallback press', () => {
        // The second press carries no stake and must fall back to the base $10.
        const r = runAll({ winners:{6:'A'}, format:'match',
            presses:[{ baseId:'18', startHole:3, stake:25 }, { baseId:'18', startHole:5 }] });
        assert.equal(money(r), 45, 'base $10 + $25 + fallback $10');
        assertParity(r, 'explicit plus fallback');
    });

    test('a press with stake 0 is respected, not treated as absent', () => {
        const r = runAll({ winners:{6:'A'}, format:'match',
            presses:[{ baseId:'18', startHole:5, stake:0 }] });
        assert.equal(money(r), 10, 'a $0 press adds nothing');
        assertParity(r, 'zero-stake press');
    });
});

describe('LEGACY BEHAVIOUR IS UNCHANGED', () => {

    test('no presses at all — every copy pays the base wager', () => {
        const r = runAll({ winners:{1:'A'} });
        assert.equal(money(r), 20, 'Front $10 + Total $10');
        assertParity(r, 'no presses');
    });

    test('an AUTO press still falls back to the base stake', () => {
        // Nobody typed an amount, so the trigger rule's press settles at the wager -
        // byte-for-byte the behaviour before per-press stakes existed.
        const r = runAll({ winners:{1:'A',2:'A'}, pressRule:'2down' });
        // Three-stake Nassau made the auto-press amount an explicit setting, so a
        // press now CARRIES its resolved stake instead of leaving it undefined for
        // segStake to fill in. What must not change is the money: with no segment
        // config, that resolved amount is still the base wager.
        const presses = r['money-engine.js'].activeMatches.filter(m => m.pressNum > 0);
        assert.ok(presses.length > 0, 'the 2-down rule must fire');
        presses.forEach(p => assert.equal(Number(p.stake), 10,
            'an auto press resolves to the base wager when no segment stakes are set'));
        assertParity(r, 'auto press fallback');
    });

    test('a round with no manual presses is identical to before the repair', () => {
        // This is the shape parity_test.js already covered, and it must not move.
        const r = runAll({ winners:{1:'A',3:'B',7:'A'}, pressRule:'2down' });
        assertParity(r, 'legacy shape');
    });
});

describe('RECONSTRUCTION', () => {

    test('a press stake survives serialization', () => {
        // Firebase hands back JSON; the stake must ride through a reload.
        const presses = JSON.parse(JSON.stringify([{ baseId:'18', startHole:5, stake:25 }]));
        const a = runAll({ winners:{6:'A'}, format:'match', presses });
        const b = runAll({ winners:{6:'A'}, format:'match',
                           presses: JSON.parse(JSON.stringify(presses)) });
        assert.equal(money(a), 35);
        assert.equal(money(a), money(b), 'reload must not change the money');
        assertParity(b, 'after reload');
    });

    test('the production side-match storage shape carries the stake', () => {
        // What sidematches.html actually writes: { baseId, startHole, stake }.
        const stored = { p1: { baseId:'18', startHole:5, stake:25 } };
        const r = runAll({ winners:{6:'A'}, format:'match', presses: Object.values(stored) });
        assert.equal(money(r), 35);
        assertParity(r, 'production storage shape');
    });
});

describe('ALL FOUR COPIES ARE ACTUALLY BEING COMPARED', () => {

    test('every implementation exists and is callable', () => {
        NAMES.forEach(n => assert.equal(typeof ENGINES[n].calculateMatchEngine, 'function',
            n + ' must expose calculateMatchEngine'));
        assert.equal(NAMES.length, 4);
    });

    test('each copy carries the segStake contract', () => {
        // Structural backstop: if a copy loses segStake, the money tests above catch
        // it, but this says plainly which file drifted.
        const fs = require('fs'), path = require('path');
        const { REPO_ROOT } = require('./helpers/load-script.js');
        NAMES.forEach(n => {
            const src = fs.readFileSync(path.join(REPO_ROOT, n), 'utf8');
            assert.match(src, /const segStake = m =>/, n + ' lost segStake');
            assert.match(src, /manualPress && manualPress\.stake !== undefined/,
                n + ' no longer stores an explicit press stake');
        });
    });
});
