// ============================================================================
// A PRESS PAYS ITS OWN STAKE
//
// "Press it for $25" means the press is worth $25 - not whatever the original
// bet was worth. calculateOverallBetEngine exists in three copies, and only
// settlement-engine.js honoured that:
//
//     settlement-engine.js   segmentTotals(pr.startHole, pr.stake)   correct
//     sidematches.html       segmentTotals(pr.startHole)             fell back
//     stats.html             segmentTotals(pr.startHole)             fell back
//
// The two page copies dropped the press stake on the floor and every press
// settled at config.overallStake instead. Measured on a $20 overall with presses
// at H5/$50, H8/$25 and H14/$12.50:
//
//     settlement    p1Money = -5     press stake 25 -> paid 25
//     sidematches   p1Money =  0     press stake 25 -> paid 20
//     stats         p1Money =  0     press stake 25 -> paid 20
//
// Results settles from settlement-engine.js, so nobody was ever paid the wrong
// amount - but the Matches tab and Stats page showed money that would not match
// the final receipt, which is its own kind of wrong when golfers are settling up.
//
// It only diverges when a press stake differs from the base stake. Equal-stake
// presses agree everywhere, which is why this survived: the common case is silent.
//
// These fixtures are permanent. The custom-stake press is the regression.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

function engineRealm() {
    const sb = { console, Math, Object, Array, String, Number, JSON, isNaN,
                 parseInt, parseFloat, Date, Set, Map };
    vm.createContext(sb);
    ['money-engine.js','action-model.js','pool-engine.js','settlement-engine.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}
const PAGE_DEPS = ['money-engine.js','action-model.js','settlement-engine.js'];
const realms = {};
function fromPage(page, name) {
    if (!realms[page]) realms[page] = loadHtmlInlineScript(page, PAGE_DEPS);
    return vm.runInContext(name, realms[page]);
}
// vm objects carry a foreign prototype; JSON brings them into this realm.
const plain = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

const cd18 = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
const PAIR = [{ id:101, name:'Marty', hcp:'0' }, { id:102, name:'Manny', hcp:'0' }];

// The exact card that reproduced the defect: Marty wins 1, 2 and 6; Manny wins 9.
function reproScores() {
    const s = {};
    PAIR.forEach(p => cd18.forEach(h => { s['p'+p.id+'_h'+h.hole] = 4; }));
    s.p101_h1 = 3; s.p101_h2 = 3; s.p101_h6 = 3; s.p102_h9 = 3;
    return s;
}
const cfg = (o) => Object.assign({ overallEnabled:true, overallStake:20, overallMode:'stroke',
    segment:'full', scoringType:'gross', p1:PAIR[0], p2:PAIR[1] }, o || {});

const COPIES = () => ({
    'settlement-engine.js': engineRealm().calculateOverallBetEngine,
    'sidematches.html': fromPage('sidematches.html', 'calculateOverallBetEngine'),
    'stats.html': fromPage('stats.html', 'calculateOverallBetEngine'),
});
// Every copy's answer for one fixture.
function run(scores, config, presses) {
    const out = {};
    Object.entries(COPIES()).forEach(([name, fn]) => { out[name] = plain(fn(PAIR, cd18, scores, config, presses)); });
    return out;
}
function assertAgree(label, scores, config, presses) {
    const out = run(scores, config, presses);
    const names = Object.keys(out);
    const money = names.map(n => out[n].p1Money);
    money.slice(1).forEach((m, i) => {
        assert.equal(m, money[0],
            label + ': ' + names[i+1] + ' says ' + m + ', ' + names[0] + ' says ' + money[0]);
    });
    // Per-press too, not just the total: two wrong presses can cancel out.
    names.slice(1).forEach(n => {
        out[n].pressSegs.forEach((seg, i) => {
            assert.equal(seg.p1Money, out[names[0]].pressSegs[i].p1Money,
                label + ': ' + n + ' press ' + (i+1) + ' pays ' + seg.p1Money +
                ', canonical pays ' + out[names[0]].pressSegs[i].p1Money);
        });
    });
    return out[names[0]].p1Money;
}

// ============================================================================

describe('THE REPRODUCED DEFECT', () => {

    const PRESSES = [{ startHole:5, stake:50 }, { startHole:8, stake:25 }, { startHole:14, stake:12.5 }];

    test('all three copies agree on the reproduced card', () => {
        assertAgree('repro', reproScores(), cfg(), PRESSES);
    });

    test('and the canonical answer is still -5', () => {
        // Pinned to the number, not just to agreement: if all three drifted
        // together this would still catch it.
        const out = run(reproScores(), cfg(), PRESSES);
        assert.equal(out['settlement-engine.js'].p1Money, -5);
        assert.equal(out['sidematches.html'].p1Money, -5);
        assert.equal(out['stats.html'].p1Money, -5);
    });

    test('the $25 press pays $25, not the $20 base', () => {
        // The defect in one assertion.
        const out = run(reproScores(), cfg(), PRESSES);
        Object.entries(out).forEach(([name, r]) => {
            const p = r.pressSegs.find(x => x.startHole === 8);
            assert.equal(p.p1Money, -25,
                name + ' paid ' + p.p1Money + ' on a $25 press');
        });
    });

    test('each press carries its own stake through', () => {
        const out = run(reproScores(), cfg(), PRESSES);
        Object.entries(out).forEach(([name, r]) => {
            assert.equal(r.pressSegs.length, 3, name);
            assert.deepEqual(r.pressSegs.map(s => s.startHole), [5, 8, 14], name);
        });
    });
});

describe('PRESS STAKES ABOVE, BELOW AND EQUAL TO THE BASE', () => {

    test('press stake greater than base', () => {
        assertAgree('above', reproScores(), cfg(), [{ startHole:8, stake:100 }]);
    });

    test('press stake less than base', () => {
        assertAgree('below', reproScores(), cfg(), [{ startHole:8, stake:5 }]);
    });

    test('press stake equal to base — the case that always agreed', () => {
        // Included deliberately: this is why the bug survived. It must stay green.
        assertAgree('equal', reproScores(), cfg(), [{ startHole:8, stake:20 }]);
    });

    test('decimal press stake', () => {
        assertAgree('decimal', reproScores(), cfg(), [{ startHole:8, stake:12.5 }]);
    });

    test('several presses, all different stakes', () => {
        assertAgree('mixed', reproScores(), cfg(),
            [{ startHole:3, stake:5 }, { startHole:7, stake:40 }, { startHole:11, stake:17.5 },
             { startHole:15, stake:20 }]);
    });

    test('zero-stake press pays nothing anywhere', () => {
        const out = run(reproScores(), cfg(), [{ startHole:8, stake:0 }]);
        Object.entries(out).forEach(([name, r]) =>
            assert.equal(r.pressSegs[0].p1Money, 0, name));
    });
});

describe('EITHER GOLFER CAN WIN A CUSTOM-STAKE PRESS', () => {

    test('player A wins the press', () => {
        const s = reproScores();
        s.p101_h10 = 3; s.p101_h12 = 3;   // Marty pulls ahead after the press starts
        const total = assertAgree('A wins', s, cfg(), [{ startHole:9, stake:75 }]);
        assert.ok(typeof total === 'number');
    });

    test('player B wins the press', () => {
        const s = reproScores();
        s.p102_h10 = 3; s.p102_h12 = 3;
        assertAgree('B wins', s, cfg(), [{ startHole:9, stake:75 }]);
    });

    test('tied press pays nobody', () => {
        const s = {};
        PAIR.forEach(p => cd18.forEach(h => { s['p'+p.id+'_h'+h.hole] = 4; }));
        const out = run(s, cfg(), [{ startHole:9, stake:75 }]);
        Object.entries(out).forEach(([name, r]) =>
            assert.equal(r.pressSegs[0].p1Money, 0, name + ' must pay nothing on a tie'));
    });

    test('press on an unfinished round', () => {
        const s = {};
        [1,2,3,4,5,6].forEach(h => { s['p101_h'+h] = h === 1 ? 3 : 4; s['p102_h'+h] = 4; });
        assertAgree('unfinished', s, cfg(), [{ startHole:4, stake:30 }]);
    });
});

describe('NOTHING ELSE ABOUT THE ENGINE MOVED', () => {

    test('an overall bet with no presses is unchanged', () => {
        const total = assertAgree('no presses', reproScores(), cfg(), []);
        assert.equal(total, 20, 'Marty wins the base bet outright');
    });

    test('the base segment never uses a press stake', () => {
        const out = run(reproScores(), cfg(), [{ startHole:8, stake:1000 }]);
        Object.entries(out).forEach(([name, r]) =>
            assert.equal(r.base.p1Money, 20, name + ': base must stay at the base stake'));
    });

    test('front and back segments still agree', () => {
        assertAgree('front', reproScores(), cfg({ segment:'front' }), [{ startHole:5, stake:35 }]);
        assertAgree('back', reproScores(), cfg({ segment:'back' }), [{ startHole:14, stake:35 }]);
    });

    test('net scoring still agrees', () => {
        const hcp = [{ id:101, name:'Marty', hcp:'18' }, { id:102, name:'Manny', hcp:'0' }];
        const out = {};
        Object.entries(COPIES()).forEach(([n, fn]) => {
            out[n] = plain(fn(hcp, cd18, reproScores(),
                cfg({ scoringType:'net', p1:hcp[0], p2:hcp[1] }), [{ startHole:8, stake:25 }]));
        });
        const vals = Object.values(out).map(r => r.p1Money);
        vals.slice(1).forEach(v => assert.equal(v, vals[0]));
    });

    test('settlement-engine.js was not edited to achieve this', () => {
        // The canonical copy was already right; the fix belongs in the two pages.
        const src = read('settlement-engine.js');
        assert.match(src, /function segmentTotals\(startHole, segStake\)/,
            'settlement must still take a per-press stake');
        assert.match(src, /segmentTotals\(pr\.startHole, pr\.stake\)/);
    });

    test('both page copies now pass the press stake', () => {
        ['sidematches.html','stats.html'].forEach(f => {
            const src = read(f);
            const at = src.indexOf('function calculateOverallBetEngine');
            const body = src.slice(at, at + 3000);
            assert.match(body, /function segmentTotals\(startHole, segStake\)/,
                f + ': segmentTotals must accept a per-press stake');
            assert.match(body, /segmentTotals\(pr\.startHole, pr\.stake\)/,
                f + ': the press stake must be passed through');
        });
    });
});
