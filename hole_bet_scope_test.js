// ============================================================================
// A STAKE THAT IS STORED AND NEVER PAID
//
// Step 6 offered "Amount ($ per hole)" on seven round formats. Only four of them
// can settle it: holeBetStake is consumed by exactly one function,
// computeHiLoSettlementNet, reached via Hi-Lo, Nassau, Best Ball and Scramble.
//
// On Wolf, Stableford and Skins a golfer could set $5 a hole, play eighteen, and
// settle nothing. No warning, no zero line on the receipt - the money simply was
// never part of the round. Measured before this batch:
//
//     hilo       Marty $10        wolf        $0
//     nassau     Marty $20        stableford  $0
//     bestball   Marty $10        skins       $0
//     scramble   Marty $10
//
// The control is removed from those three rather than made to pay, because
// paying would be new money logic invented for games that are configured
// elsewhere - Wolf has a point value, Stableford has points, Skins has a buy-in.
//
// SETUP ONLY. The engine is untouched, so a round already saved with a dead
// holeBetStake keeps settling exactly as it always did: at zero. Nothing is
// migrated and no historical receipt changes.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ADMIN = ['money-engine.js','action-model.js','settlement-engine.js','pool-engine.js','score-marks.js'];
const cd18 = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
const PAIR = [{ id:101, name:'Marty', hcp:'0', team:'Team 1' },
              { id:102, name:'Manny', hcp:'0', team:'Team 2' }];

// Formats whose settlement genuinely reads holeBetStake.
const PAYS = ['hilo', 'nassau', 'bestball', 'scramble'];
// Formats where the stake was accepted and silently ignored.
const DEAD = ['wolf', 'stableford', 'skins'];

function engines() {
    const sb = { console, Math, Object, Array, String, Number, JSON, isNaN,
                 parseInt, parseFloat, Date, Set, Map };
    vm.createContext(sb);
    ['money-engine.js','action-model.js','pool-engine.js','settlement-engine.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    ['computeCombinedNetTotals','buildSideMatchReceipts','computeHiLoSettlementNet']
        .forEach(fn => { try { sb[fn] = vm.runInContext(fn, sb); } catch (e) {} });
    return sb;
}
// Marty wins holes 1 and 2; everything else halved.
function scores() {
    const s = {};
    PAIR.forEach(p => cd18.forEach(h => { s['p'+p.id+'_h'+h.hole] = 4; }));
    s.p101_h1 = 3; s.p101_h2 = 3;
    return s;
}
function settle(gameFormat, holeBetStake) {
    const s = scores();
    const d = { players: PAIR, courseData: cd18, scores: s, gameFormat,
                holeBetStake, settlementMode: 'whole-dollar',
                nassauStake: 0, matchStake: 0, stablefordPointVal: 0,
                wolfPointVal: 0, skinsBuyIn: 0 };
    const E = engines();
    const vals = Object.values(E.computeCombinedNetTotals(d, cd18, s).netByName);
    return {
        marty: (vals.find(v => v.name === 'Marty') || {}).net || 0,
        sum: vals.reduce((a, v) => a + v.net, 0),
        anyonePaid: vals.some(v => v.net !== 0),
    };
}
// Which formats admin.html will show the hole-bet control for.
function holeBetFormats() {
    const src = read('admin.html');
    const m = src.match(/const formatsWithHoleBets = \[([^\]]*)\]/);
    assert.ok(m, 'formatsWithHoleBets must exist');
    return m[1].split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
}
// Drives handleFormatChange the way selecting a format in Step 3 does.
function panelShownFor(format) {
    const sb = loadHtmlInlineScript('admin.html', ADMIN);
    vm.runInContext(`
        alert = function(){};
        document.getElementById('game-format-select').value = '${format}';
        handleFormatChange();
    `, sb);
    return vm.runInContext(
        "(document.getElementById('hole-bet-settings')||{style:{}}).style.display", sb);
}

// ============================================================================

describe('THE DEAD STAKE IS NO LONGER OFFERED', () => {

    DEAD.forEach(f => {
        test(`${f} does not offer a per-hole amount`, () => {
            assert.ok(!holeBetFormats().includes(f),
                f + ' cannot settle a hole bet, so it must not ask for one');
        });

        test(`${f} hides the hole-bet panel`, () => {
            assert.notEqual(panelShownFor(f), 'block');
        });
    });

    test('the list is exactly the four formats that can pay', () => {
        assert.deepEqual(holeBetFormats().slice().sort(), PAYS.slice().sort());
    });
});

describe('THE FOUR THAT PAY ARE UNTOUCHED', () => {

    PAYS.forEach(f => {
        test(`${f} still offers the per-hole amount`, () => {
            assert.ok(holeBetFormats().includes(f));
            assert.equal(panelShownFor(f), 'block');
        });
    });

    test('and the money is unchanged, to the dollar', () => {
        // Measured before the change; these are the numbers that must not move.
        assert.equal(settle('hilo', 5).marty, 10);
        assert.equal(settle('nassau', 5).marty, 20);
        assert.equal(settle('bestball', 5).marty, 10);
        assert.equal(settle('scramble', 5).marty, 10);
    });

    test('every one of them still conserves', () => {
        PAYS.forEach(f => assert.equal(settle(f, 5).sum, 0, f + ' must be zero-sum'));
    });

    test('a bigger stake still scales', () => {
        assert.equal(settle('hilo', 10).marty, 20);
        assert.equal(settle('bestball', 10).marty, 20);
    });

    test('and zero still means zero, where the hole bet is the only money', () => {
        // Nassau is excluded deliberately: a legacy Nassau round settles from
        // nassauStake, so it can pay with no hole bet at all. Asserting otherwise
        // would have been my fixture describing a game it does not play.
        ['hilo', 'bestball', 'scramble'].forEach(f =>
            assert.equal(settle(f, 0).anyonePaid, false,
                f + ' must pay nothing without a stake'));
    });

    test('a legacy Nassau still pays from its own stake, not the hole bet', () => {
        const s = scores();
        const d = { players: PAIR, courseData: cd18, scores: s, gameFormat: 'nassau',
                    holeBetStake: 0, nassauStake: 10, nassauScoring: 'net',
                    nassauPressRule: 'none', settlementMode: 'whole-dollar' };
        const vals = Object.values(engines().computeCombinedNetTotals(d, cd18, s).netByName);
        assert.ok(vals.some(v => v.net !== 0), 'the Nassau stake still settles');
        assert.equal(vals.reduce((a, v) => a + v.net, 0), 0);
    });
});

describe('OLD ROUNDS ARE NOT MIGRATED', () => {

    DEAD.forEach(f => {
        test(`a saved ${f} round with a dead stake still settles as it did`, () => {
            // It paid nothing before and pays nothing now. Removing the control
            // changes what can be CREATED, not what was stored.
            assert.equal(settle(f, 5).anyonePaid, false);
            assert.equal(settle(f, 5).sum, 0);
        });
    });

    test('the stored field is still read, not stripped', () => {
        // No migration: the engine still looks for holeBetStake wherever it always
        // did. Deleting stored data would be a far bigger decision than hiding a
        // control, and is not what this batch does.
        assert.match(read('settlement-engine.js'), /data\.holeBetStake/);
        assert.match(read('money-engine.js'), /data\.holeBetStake/);
    });

    test('opening such a round still loads its stake into the field', () => {
        // The loader is guarded on the element existing, so a format that no longer
        // shows the panel simply skips it rather than throwing.
        const src = read('admin.html');
        assert.match(src, /if \(data\.holeBetStake && document\.getElementById\("hole-bet-stake"\)\)/);
    });
});

describe('NO ENGINE OR SETTLEMENT CHANGED', () => {

    test('holeBetStake is still consumed by exactly one settlement function', () => {
        // The whole reason three formats could not pay: one consumer, reached by
        // four formats. That fact is pinned so a future change has to be deliberate.
        const src = read('settlement-engine.js');
        const at = src.indexOf('const holeBet = data.holeBetStake');
        assert.ok(at > -1);
        const owner = src.lastIndexOf('function ', at);
        assert.match(src.slice(owner, owner + 60), /computeHiLoSettlementNet/);
    });

    test('the settlement and money engines were not edited', () => {
        ['settlement-engine.js','money-engine.js','pool-engine.js','action-model.js']
            .forEach(f => assert.ok(!read(f).includes('formatsWithHoleBets'),
                f + ' must know nothing about which formats show a control'));
    });

    test('Action stroke side matches are unaffected', () => {
        // A separate system with its own fields, participants and receipt.
        const s = scores();
        const d = { players: PAIR, courseData: cd18, scores: s, gameFormat: 'stroke',
            settlementMode: 'whole-dollar', sideMatches: { s1: {
                format:'stroke', scoring:'net', teamAIds:['101'], teamBIds:['102'],
                startHole:1, holeStake:5, overallStake:20, tieRule:'carry',
                overallMode:'stroke', segment:'full' } } };
        const E = engines();
        assert.equal(E.buildSideMatchReceipts(d, cd18, s).length, 1);
        const vals = Object.values(E.computeCombinedNetTotals(d, cd18, s).netByName);
        assert.equal((vals.find(v => v.name === 'Marty') || {}).net, 30);
        assert.equal(vals.reduce((a, v) => a + v.net, 0), 0);
    });

    test('and are still configured from Action, not Step 6', () => {
        assert.match(read('sidematches.html'), /payload\.holeStake = holeStake;/);
        assert.ok(!read('sidematches.html').includes('formatsWithHoleBets'));
    });
});
