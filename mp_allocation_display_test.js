// ============================================================================
// ALLOCATION FEEDBACK — the breakdown survives a bad config
//
// The summary told an organizer they were $100 over budget and, in the same
// moment, replaced the only view of WHERE the money was going. You were told the
// total was wrong and shown nothing about which bucket to cut. The rows are the
// thing being corrected; hiding them to make room for the complaint is backwards.
//
// The error now sits underneath the breakdown rather than instead of it, and the
// remainder bucket says it is the remainder so "where does the rest go" is
// answered on screen instead of inferred from a number that happens to fit.
//
// PRESENTATION ONLY, and that is load-bearing. Every figure here comes from
// validateMoneyPool() - totalPool, fixedAllocated, remainder. This batch changed
// none of them, and changed nothing about the save gate: an over-budget or
// unallocated pot is still refused before a round is written. VALIDATION_STILL_
// REFUSES pins that, because a display change that quietly loosened the gate
// would be far worse than the problem it fixed.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');
const { makePlayers } = require('./helpers/fixtures.js');

// Drives the real setup screen: fill the controls, run the real mpRecalc(), read
// what the organizer would actually see.
function setup(cfg) {
    const sb = loadHtmlInlineScript('admin.html', ['course-data.js']);
    const set = (id, prop, val) => { sb.document.getElementById(id)[prop] = val; };

    const players = makePlayers(cfg.names || ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
                                (cfg.names || ['A','B','C','D','E','F','G','H']).map(() => 0));
    sb.__players = players;
    vm.runInContext('collectWizardPlayers = () => __players;', sb);

    set('mp-enabled', 'checked', true);
    set('mp-buyin', 'value', String(cfg.buyIn));
    set('mp-kp-amount', 'value', String(cfg.kp === undefined ? 0 : cfg.kp));
    set('mp-kp-holes', 'value', cfg.kpHoles === undefined ? '4, 14' : cfg.kpHoles);
    set('mp-net-mode', 'value', 'preset');
    set('mp-net-amount', 'value', String(cfg.net === undefined ? 0 : cfg.net));
    set('mp-net-places', 'value', cfg.places || '50,30,20');
    set('mp-skins-mode', 'value', cfg.skinsMode || 'remainder');
    set('mp-skins-amount', 'value', String(cfg.skinsAmount === undefined ? 0 : cfg.skinsAmount));
    set('mp-skins-scoring', 'value', 'net');
    set('mp-skins-carry', 'value', 'yes');

    vm.runInContext('mpRecalc();', sb);
    const box = sb.document.getElementById('mp-math');
    return {
        sb,
        html: String(box.innerHTML || ''),
        text: String(box.innerHTML || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        bad: String(box.className || '') === 'mp-bad'
    };
}

// 8 players x $40 = $320.
const EIGHT = { buyIn: 40 };

describe('EXACT allocation reads as balanced', () => {

    test('every bucket is listed and the total ticks', () => {
        const r = setup(Object.assign({}, EIGHT, { kp: 100, net: 100 }));
        assert.equal(r.bad, false);
        assert.match(r.text, /Total pool \$320/);
        assert.match(r.text, /KP \$100/);
        assert.match(r.text, /Net finish \$100/);
        assert.match(r.text, /Skins \(remainder\) \$120/);
        assert.match(r.text, /Allocated \$320 of \$320 ✓/);
    });

    test('a fixed skins allocation that balances exactly is not called a remainder', () => {
        const r = setup(Object.assign({}, EIGHT, { kp: 100, net: 100, skinsMode: 'fixed', skinsAmount: 120 }));
        assert.equal(r.bad, false);
        assert.match(r.text, /Skins \$120/);
        assert.doesNotMatch(r.text, /remainder/, 'a fixed amount is not the remainder');
        assert.match(r.text, /Allocated \$320 of \$320 ✓/);
    });
});

describe('OVER-ALLOCATION keeps the breakdown that shows which bucket to cut', () => {

    test('the rows stay, and the overage is named', () => {
        // $200 KP + $200 net = $400 fixed against a $320 pot.
        const r = setup(Object.assign({}, EIGHT, { kp: 200, net: 200 }));
        assert.equal(r.bad, true, 'it must still read as an error');
        assert.match(r.text, /Total pool \$320/, 'THE FIX: the pot must remain on screen');
        assert.match(r.text, /KP \$200/, 'and so must the bucket that caused it');
        assert.match(r.text, /Net finish \$200/);
        assert.match(r.text, /over by \$80/, 'the overage, in dollars');
        assert.match(r.text, /⚠️/, 'the plain-English instruction stays too');
    });

    test('a fixed skins bucket that busts the pot is visible in the rows', () => {
        const r = setup(Object.assign({}, EIGHT, { kp: 100, net: 100, skinsMode: 'fixed', skinsAmount: 300 }));
        assert.equal(r.bad, true);
        assert.match(r.text, /Skins \$300/);
        assert.match(r.text, /over by \$180/);
    });
});

describe('UNDER-ALLOCATION says how much is still loose', () => {

    test('with no remainder bucket, the shortfall is shown against the breakdown', () => {
        const r = setup(Object.assign({}, EIGHT, { kp: 100, net: 100, skinsMode: 'none' }));
        assert.equal(r.bad, true);
        assert.match(r.text, /Total pool \$320/);
        assert.match(r.text, /KP \$100/);
        assert.match(r.text, /Net finish \$100/);
        assert.match(r.text, /\$120 left/, 'the unassigned money, named');
    });
});

describe('ZERO-DOLLAR components are simply absent', () => {

    test('no KP money means no KP row', () => {
        const r = setup(Object.assign({}, EIGHT, { kp: 0, kpHoles: '', net: 100 }));
        assert.doesNotMatch(r.text, /KP \$/, 'a bucket with no money is not a bucket');
        assert.match(r.text, /Net finish \$100/);
    });

    test('no net money means no net row', () => {
        const r = setup(Object.assign({}, EIGHT, { kp: 100, net: 0 }));
        assert.doesNotMatch(r.text, /Net finish/);
        assert.match(r.text, /KP \$100/);
    });

    test('skins set to none shows no skins row', () => {
        const r = setup(Object.assign({}, EIGHT, { kp: 120, net: 200, skinsMode: 'none' }));
        assert.doesNotMatch(r.text, /Skins/);
        assert.match(r.text, /Allocated \$320 of \$320 ✓/);
    });

    test('a remainder of exactly $0 still names itself', () => {
        // The remainder bucket exists even when it happens to be empty, so the
        // organizer can see that skins is what would absorb any change.
        const r = setup(Object.assign({}, EIGHT, { kp: 120, net: 200 }));
        assert.match(r.text, /Skins \(remainder\) \$0/);
        assert.match(r.text, /Allocated \$320 of \$320 ✓/);
    });
});

describe('THE PER-SECTION HINTS STILL DO THE ARITHMETIC', () => {

    test('the pot line, the KP split and the net places all survive', () => {
        const r = setup(Object.assign({}, EIGHT, { kp: 100, net: 100, kpHoles: '4, 14' }));
        const hint = id => String(r.sb.document.getElementById(id).textContent || '');
        assert.match(hint('mp-pot-line'), /8 players × \$40 = \$320 total pool/);
        assert.match(hint('mp-kp-split'), /\$50 each across 2 holes/);
        assert.match(hint('mp-net-split'), /1st \$50/);
        assert.match(hint('mp-skins-line'), /Skins pot: \$120/);
    });
});

describe('VALIDATION_STILL_REFUSES — the gate was not loosened', () => {

    test('validateMoneyPool still rejects an over-allocated pot', () => {
        const r = setup(Object.assign({}, EIGHT, { kp: 200, net: 200 }));
        const v = JSON.parse(JSON.stringify(vm.runInContext(
            'validateMoneyPool(mpDraftData(), [])', r.sb)));
        assert.equal(v.valid, false, 'a display change must not make a bad pot savable');
        assert.equal(v.totalPool, 320);
        assert.equal(v.fixedAllocated, 400);
    });

    test('validateMoneyPool still rejects unallocated money', () => {
        const r = setup(Object.assign({}, EIGHT, { kp: 100, net: 100, skinsMode: 'none' }));
        const v = JSON.parse(JSON.stringify(vm.runInContext(
            'validateMoneyPool(mpDraftData(), [])', r.sb)));
        assert.equal(v.valid, false);
    });

    test('and still passes a pot that balances', () => {
        const r = setup(Object.assign({}, EIGHT, { kp: 100, net: 100 }));
        const v = JSON.parse(JSON.stringify(vm.runInContext(
            'validateMoneyPool(mpDraftData(), [])', r.sb)));
        assert.equal(v.valid, true);
    });
});
