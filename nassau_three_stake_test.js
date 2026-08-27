// ============================================================================
// NASSAU TORTURE MATRIX — THREE INDEPENDENT STAKES
//
// A real Nassau is three separate wagers. "$5 front, $5 back, $10 overall" is the
// ordinary case, and the app could only ever express one number for all three -
// so the bet two friends actually played could not be entered.
//
// THE APPROVED RULES:
//
//   Nassau is MATCH PLAY only.
//   Front / Back / Overall stakes are wholly independent - no assumed relationship.
//   A manual press keeps the amount the golfer typed.
//   An automatic press uses that SEGMENT's configured auto-press amount,
//     defaulting to the segment's own stake.
//   A manually enlarged press NEVER cascades: later automatic presses on that
//     segment still use the configured auto amount, not the one-off escalation.
//
// LEGACY IS SACRED. A round carrying only `nassauStake` settles to the cent exactly
// as it always did. No Firebase migration; the absence of segment fields IS the
// legacy signal.
//
// ZERO-SUM IS NOT USED AS AN ORACLE ANYWHERE HERE. A Nassau that pays nobody
// balances perfectly. Every money case below asserts an EXACT dollar figure.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadJsFile, loadHtmlInlineScript } = require('./helpers/load-script.js');

const ENGINES = {
    'money-engine.js':  loadJsFile('money-engine.js'),
    'index.html':       loadHtmlInlineScript('index.html'),
    'sidematches.html': loadHtmlInlineScript('sidematches.html'),
    'stats.html':       loadHtmlInlineScript('stats.html'),
};
const NAMES = Object.keys(ENGINES);
const CANON = 'money-engine.js';

const cd18 = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
const P = (hcpA = '0', hcpB = '0') => ([
    { id:101, name:'Marty', hcp:hcpA, team:'Team 1' },
    { id:102, name:'Manny', hcp:hcpB, team:'Team 2' },
]);

// wins: hole -> 'A' | 'B' | undefined (halved). thru limits how far play got.
function scores(wins, thru = 18) {
    const s = {};
    for (let h = 1; h <= thru; h++) {
        s['p101_h'+h] = 4 + (wins[h] === 'A' ? -1 : 0);
        s['p102_h'+h] = 4 + (wins[h] === 'B' ? -1 : 0);
    }
    return s;
}
function run({ wins = {}, thru = 18, stake = 10, cfg = undefined, pressRule = 'none',
               presses = [], hcps = null, engine = CANON }) {
    const players = hcps ? P(String(hcps[0]), String(hcps[1])) : P();
    return ENGINES[engine].calculateMatchEngine(players, cd18, scores(wins, thru),
        hcps ? 'net' : 'gross', 'nassau', pressRule, stake, 0, presses, cfg);
}
const money = (o) => o.t1TotalMoney;
const seg  = (o, id) => o.activeMatches.find(m => m.baseId === id && m.pressNum === 0);
const pressesOf = (o, id) => o.activeMatches.filter(m => m.baseId === id && m.pressNum > 0)
    .sort((a,b) => a.startHole - b.startHole);

// Every meaningful scenario is run through all four copies.
function allFour(opts) {
    const out = {};
    NAMES.forEach(n => { out[n] = run(Object.assign({}, opts, { engine: n })); });
    return out;
}
function assertParity(opts, label) {
    const r = allFour(opts);
    const base = r[CANON];
    NAMES.slice(1).forEach(n => {
        assert.equal(r[n].t1TotalMoney, base.t1TotalMoney,
            `${label}: ${n} pays $${r[n].t1TotalMoney}, canonical $${base.t1TotalMoney}`);
        const shape = o => o.activeMatches
            .map(m => `${m.baseId}#${m.pressNum}@${m.startHole}:${m.status}:${m.stake}`)
            .sort().join(' | ');
        assert.equal(shape(r[n]), shape(base), `${label}: ${n} match/press shape`);
    });
    return base;
}

const FIVE_FIVE_TEN = { F9:5, B9:5, '18':10 };

// ============================================================================

describe('THREE INDEPENDENT STAKES', () => {

    test('CASE: $5/$5/$10 — front win pays $5 + $10', () => {
        // Winning hole 1 wins the Front AND puts you up in the Total.
        const o = assertParity({ wins:{1:'A'}, cfg:FIVE_FIVE_TEN }, '$5/$5/$10 front');
        assert.equal(seg(o,'F9').stake, 5);
        assert.equal(seg(o,'B9').stake, 5);
        assert.equal(seg(o,'18').stake, 10);
        assert.equal(money(o), 15, 'Front $5 + Total $10');
    });

    test('a back-nine win pays the Back stake, not the Front', () => {
        const o = assertParity({ wins:{10:'A'}, cfg:FIVE_FIVE_TEN }, 'back win');
        assert.equal(seg(o,'F9').status, 0, 'front untouched');
        assert.equal(money(o), 15, 'Back $5 + Total $10');
    });

    test('$5/$50/$10 — wildly unequal stakes are honoured', () => {
        const o = assertParity({ wins:{10:'A'}, cfg:{ F9:5, B9:50, '18':10 } }, '$5/$50/$10');
        assert.equal(seg(o,'B9').stake, 50);
        assert.equal(money(o), 60, 'Back $50 + Total $10');
    });

    test('$20/$20/$60', () => {
        const o = assertParity({ wins:{1:'A'}, cfg:{ F9:20, B9:20, '18':60 } }, '$20/$20/$60');
        assert.equal(money(o), 80, 'Front $20 + Total $60');
    });

    test('each segment pays ONLY its own stake', () => {
        // Front to team 1, Back to team 2: the two must not borrow each other's number.
        const o = assertParity({ wins:{1:'A',10:'B'}, cfg:{ F9:5, B9:50, '18':0 } }, 'independent');
        assert.equal(money(o), 5 - 50, 'Front +$5, Back -$50, Total $0');
    });

    test('CASE E — LEGACY: nassauStake only, all three equal', () => {
        const o = assertParity({ wins:{1:'A'}, stake:10, cfg:undefined }, 'legacy');
        assert.equal(seg(o,'F9').stake, 10);
        assert.equal(seg(o,'B9').stake, 10);
        assert.equal(seg(o,'18').stake, 10);
        assert.equal(money(o), 20, 'unchanged from before three-stake existed');
    });

    test('a partially-configured round falls back per segment', () => {
        // Only the front was given a stake; the rest must use the legacy wager.
        const o = assertParity({ wins:{1:'A'}, stake:10, cfg:{ F9:5 } }, 'partial');
        assert.equal(seg(o,'F9').stake, 5);
        assert.equal(seg(o,'18').stake, 10);
        assert.equal(money(o), 15);
    });
});

describe('AUTO-PRESS STAKE INHERITANCE', () => {

    test('CASE A — Front 2 down: auto press = Front stake $5', () => {
        const o = assertParity({ wins:{1:'A',2:'A'}, thru:6, cfg:FIVE_FIVE_TEN,
                                 pressRule:'2down' }, 'CASE A');
        const fp = pressesOf(o,'F9');
        assert.equal(fp.length, 1, 'exactly one front press');
        assert.equal(fp[0].stake, 5, 'the $5 front, NOT the $10 overall');
        assert.equal(fp[0].startHole, 3, 'begins the next hole');
    });

    test('CASE B — Overall 2 down: auto press = Overall stake $10', () => {
        const o = assertParity({ wins:{1:'A',2:'A'}, thru:6, cfg:FIVE_FIVE_TEN,
                                 pressRule:'2down' }, 'CASE B');
        const op = pressesOf(o,'18');
        assert.equal(op.length, 1);
        assert.equal(op[0].stake, 10, 'the $10 overall, NOT the $5 front');
    });

    test('Back 2 down: auto press = Back stake', () => {
        const o = assertParity({ wins:{10:'A',11:'A'}, thru:14, cfg:{ F9:5, B9:50, '18':10 },
                                 pressRule:'2down' }, 'back press');
        assert.equal(pressesOf(o,'B9')[0].stake, 50);
    });

    test('Front and Overall press simultaneously at their OWN stakes', () => {
        const o = assertParity({ wins:{1:'A',2:'A'}, thru:6, cfg:FIVE_FIVE_TEN,
                                 pressRule:'2down' }, 'simultaneous');
        assert.equal(pressesOf(o,'F9')[0].stake, 5);
        assert.equal(pressesOf(o,'18')[0].stake, 10);
        assert.notEqual(pressesOf(o,'F9')[0].stake, pressesOf(o,'18')[0].stake);
    });

    test('CASE D — a configured auto-press amount overrides the segment stake', () => {
        const o = assertParity({ wins:{1:'A',2:'A'}, thru:6,
            cfg:{ F9:5, B9:5, '18':10, autoPress:25 }, pressRule:'2down' }, 'CASE D');
        pressesOf(o,'F9').concat(pressesOf(o,'18'))
            .forEach(p => assert.equal(p.stake, 25, 'every auto press uses the configured $25'));
        assert.equal(seg(o,'F9').stake, 5, 'the BASE segment is untouched by it');
    });

    test('a per-segment auto amount beats the global one', () => {
        const o = assertParity({ wins:{1:'A',2:'A'}, thru:6,
            cfg:{ F9:5, B9:5, '18':10, autoPress:{ F9:7 } }, pressRule:'2down' }, 'per-segment auto');
        assert.equal(pressesOf(o,'F9')[0].stake, 7, 'front uses its own $7');
        assert.equal(pressesOf(o,'18')[0].stake, 10, 'overall falls back to its segment stake');
    });

    test('LEGACY: auto press with no config uses the single wager', () => {
        const o = assertParity({ wins:{1:'A',2:'A'}, thru:6, stake:10, pressRule:'2down' }, 'legacy auto');
        // The presses are created at hole 3 and are still LEVEL at hole 6, so they
        // pay nothing yet - only the two base segments do. My first expectation
        // counted the presses as won, which they are not.
        pressesOf(o,'F9').forEach(p => assert.equal(p.stake, 10));
        assert.equal(money(o), 20, 'F9 $10 + Total $10; both presses square');
    });
});

describe('MANUAL PRESSES NEVER CASCADE', () => {

    test('CASE C — a manual $20 press on a $5 front stays $20', () => {
        const o = assertParity({ wins:{6:'A'}, thru:9, cfg:FIVE_FIVE_TEN,
            presses:[{ baseId:'F9', startHole:5, stake:20 }] }, 'CASE C manual');
        const fp = pressesOf(o,'F9');
        assert.equal(fp.length, 1);
        assert.equal(fp[0].stake, 20, 'the golfer typed $20 and keeps it');
        assert.equal(money(o), 5 + 10 + 20, 'Front $5 + Total $10 + press $20');
    });

    test('CASE C — a LATER auto press on that same front is $5, not $20', () => {
        // The heart of the approved rule: a one-off escalation must not become the
        // house rule for every press after it.
        const o = assertParity({ wins:{1:'B',2:'B',6:'A'}, thru:9, cfg:FIVE_FIVE_TEN,
            pressRule:'2down', presses:[{ baseId:'F9', startHole:7, stake:20 }] }, 'CASE C cascade');
        const fp = pressesOf(o,'F9');
        const manual = fp.filter(p => Number(p.stake) === 20);
        const auto = fp.filter(p => Number(p.stake) === 5);
        assert.equal(manual.length, 1, 'the $20 manual press exists');
        assert.ok(auto.length >= 1, 'and the automatic one is $5');
        fp.forEach(p => assert.ok([5,20].includes(Number(p.stake)),
            'no press may take any other amount; got $' + p.stake));
    });

    test('a manual press coexists with an auto press at different amounts', () => {
        const o = assertParity({ wins:{1:'A',2:'A'}, thru:9, cfg:FIVE_FIVE_TEN,
            pressRule:'2down', presses:[{ baseId:'F9', startHole:6, stake:20 }] }, 'coexist');
        const stakes = pressesOf(o,'F9').map(p => Number(p.stake)).sort((a,b)=>a-b);
        assert.equal(stakes.join(','), '5,20', 'both, each at its own amount');
    });

    test('a manual press overrides even a configured auto amount', () => {
        const o = assertParity({ wins:{6:'A'}, thru:9,
            cfg:{ F9:5, B9:5, '18':10, autoPress:25 },
            presses:[{ baseId:'F9', startHole:5, stake:20 }] }, 'manual beats configured');
        assert.equal(pressesOf(o,'F9')[0].stake, 20, 'what the golfer typed wins');
    });
});

describe('SEGMENT OUTCOMES', () => {

    test('Front tied pays nothing on the front', () => {
        const o = assertParity({ wins:{1:'A',2:'B'}, thru:9, cfg:FIVE_FIVE_TEN }, 'front tied');
        assert.equal(seg(o,'F9').status, 0);
        assert.equal(money(o), 0, 'front square and total square');
    });

    test('all three tied pays zero', () => {
        const o = assertParity({ wins:{1:'A',2:'B',10:'A',11:'B'}, cfg:FIVE_FIVE_TEN }, 'all tied');
        assert.equal(money(o), 0);
        ['F9','B9','18'].forEach(id => assert.equal(seg(o,id).status, 0));
    });

    test('Front decided while Back still runs', () => {
        const o = assertParity({ wins:{1:'A',2:'A',3:'A',4:'A',5:'A'}, thru:12,
                                 cfg:FIVE_FIVE_TEN }, 'front closes');
        assert.equal(seg(o,'F9').closed, true, 'mathematically over');
        assert.equal(seg(o,'B9').closed, false);
    });

    test('Overall decided on the last hole', () => {
        // Hole 18 lives in the Back nine as well as the Total, so winning it takes
        // BOTH. The front stays halved.
        const o = assertParity({ wins:{18:'A'}, cfg:FIVE_FIVE_TEN }, 'overall on 18');
        assert.equal(seg(o,'18').status, 1);
        assert.equal(seg(o,'F9').status, 0, 'front halved');
        assert.equal(seg(o,'B9').status, 1, 'the back is decided by 18 too');
        assert.equal(money(o), 15, 'Back $5 + Total $10');
    });

    test('handicap strokes change a hole result', () => {
        const gross = assertParity({ wins:{}, cfg:FIVE_FIVE_TEN }, 'gross');
        const net = assertParity({ wins:{}, cfg:FIVE_FIVE_TEN, hcps:[0,18] }, 'net');
        assert.equal(money(gross), 0, 'all halved on gross');
        assert.notEqual(money(net), 0, 'strokes decide holes on net');
    });

    test('a plus handicap is accepted', () => {
        const o = assertParity({ wins:{1:'A'}, cfg:FIVE_FIVE_TEN, hcps:['+2',9] }, 'plus hcp');
        assert.equal(typeof money(o), 'number');
    });
});

describe('CORRECTIONS AND RECONSTRUCTION', () => {

    test('a correction that erases the deficit removes the press', () => {
        const before = run({ wins:{1:'A',2:'A'}, thru:6, cfg:FIVE_FIVE_TEN, pressRule:'2down' });
        const after  = run({ wins:{1:'A'},       thru:6, cfg:FIVE_FIVE_TEN, pressRule:'2down' });
        assert.ok(pressesOf(before,'F9').length > 0);
        assert.equal(pressesOf(after,'F9').length, 0, 'no stale press may survive');
    });

    test('a correction changes the press outcome and the money', () => {
        const a = run({ wins:{1:'A',2:'A',4:'A'}, thru:6, cfg:FIVE_FIVE_TEN, pressRule:'2down' });
        const b = run({ wins:{1:'A',2:'A',4:'B'}, thru:6, cfg:FIVE_FIVE_TEN, pressRule:'2down' });
        assert.notEqual(money(a), money(b));
    });

    test('refresh reconstructs identical state', () => {
        const cfg = JSON.parse(JSON.stringify(FIVE_FIVE_TEN));
        const a = run({ wins:{1:'A',2:'A',3:'B'}, thru:9, cfg, pressRule:'2down' });
        const b = run({ wins:{1:'A',2:'A',3:'B'}, thru:9,
                        cfg: JSON.parse(JSON.stringify(cfg)), pressRule:'2down' });
        const shape = o => o.activeMatches
            .map(m => `${m.baseId}#${m.pressNum}@${m.startHole}:${m.status}:${m.stake}`).sort().join('|');
        assert.equal(shape(a), shape(b));
        assert.equal(money(a), money(b));
    });

    test('refresh creates no duplicate press', () => {
        const a = run({ wins:{1:'A',2:'A'}, thru:6, cfg:FIVE_FIVE_TEN, pressRule:'2down' });
        const b = run({ wins:{1:'A',2:'A'}, thru:6,
                        cfg: JSON.parse(JSON.stringify(FIVE_FIVE_TEN)), pressRule:'2down' });
        assert.equal(a.pressCount, b.pressCount);
    });

    test('the three-stake config survives serialization', () => {
        const cfg = JSON.parse(JSON.stringify({ F9:5, B9:50, '18':10, autoPress:25 }));
        const o = assertParity({ wins:{10:'A'}, cfg }, 'serialized cfg');
        assert.equal(seg(o,'B9').stake, 50);
    });

    test('a legacy round survives serialization unchanged', () => {
        const o = assertParity({ wins:{1:'A'}, stake:10,
            cfg: JSON.parse(JSON.stringify(null)) }, 'serialized legacy');
        assert.equal(money(o), 20);
    });
});

describe('ALL FOUR COPIES AGREE', () => {

    test('every implementation is callable', () => {
        NAMES.forEach(n => assert.equal(typeof ENGINES[n].calculateMatchEngine, 'function', n));
        assert.equal(NAMES.length, 4);
    });

    test('a full $5/$5/$10 round with presses agrees across all four', () => {
        const o = assertParity({ wins:{1:'A',2:'A',5:'B',10:'A',11:'A',14:'B',18:'A'},
            cfg:FIVE_FIVE_TEN, pressRule:'2down' }, 'full round');
        assert.equal(typeof money(o), 'number');
    });

    test('each copy carries the three-stake contract', () => {
        const fs = require('fs'), path = require('path');
        const { REPO_ROOT } = require('./helpers/load-script.js');
        NAMES.forEach(n => {
            const src = fs.readFileSync(path.join(REPO_ROOT, n), 'utf8');
            assert.match(src, /const baseStakeFor = id =>/, n + ' lost baseStakeFor');
            assert.match(src, /const autoPressStakeFor = id =>/, n + ' lost autoPressStakeFor');
            assert.match(src, /manualPresses, stakeConfig\)/, n + ' lost the stakeConfig parameter');
        });
    });
});
