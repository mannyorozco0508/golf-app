// ============================================================================
// MAIN POOL PERSISTENCE — reopening a round must not erase its pot
//
// THE BUG THIS EXISTS TO PREVENT.
//
// loadModeData() restored a reopened round's course, format, stakes, skins
// instances and carry rules - but never its Main Pool. The checkbox came up
// unticked. saveSettings() writes `moneyPool: captureMoneyPool()`
// unconditionally, an unticked box returns null, and Firebase .update() DELETES
// a key written as null. So editing a pool round to fix one player's handicap
// silently destroyed the buy-in, the KP holes, the net places and the skins mode.
// The copy-a-round flow used the same loader, so duplicating last Monday dropped
// the pot it was set up for.
//
// Nothing warned anybody. The round simply had no pool the next time it settled.
//
// THREE STATES, AND ONLY THE FIRST ONE CHANGED:
//
//   A  pool loaded, left enabled      -> preserved exactly
//   B  pool loaded, organizer unticks -> null, and the deletion is CORRECT
//   C  round never had a pool         -> stays null; none is invented
//
// Fixing A must not break B. An organizer has to be able to call the pot off.
//
// WHAT IS COMPARED. The real production functions: loadMoneyPool(data) fills the
// controls, captureMoneyPool() reads them back, and the result must match what
// was stored. Not a helper, not a copy - the same two functions saveSettings and
// loadModeData call.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const src = () => fs.readFileSync(path.join(REPO_ROOT, 'admin.html'), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x === undefined ? null : x));

// Load a saved round into the controls, then read the controls back — exactly the
// sequence a reopen-and-save performs, with no edits in between.
function roundTrip(moneyPool) {
    const sb = loadHtmlInlineScript('admin.html', ['course-data.js']);
    sb.__saved = { moneyPool };
    vm.runInContext('loadMoneyPool(__saved);', sb);
    return { sb, captured: plain(vm.runInContext('captureMoneyPool()', sb)) };
}

const PRESET_POOL = {
    enabled: true,
    buyIn: 40,
    kp: { amount: 100, holes: [4, 14] },
    net: { amount: 100, places: [50, 30, 20] },
    skins: { mode: 'remainder', scoring: 'net', carryOver: true }
};

describe('STATE A — a saved Main Pool survives a reopen and re-save untouched', () => {

    test('every stored field comes back exactly as it went in', () => {
        const { captured } = roundTrip(PRESET_POOL);
        assert.notEqual(captured, null, 'THE BUG: the pool came back null and would be deleted.');
        assert.equal(captured.enabled, true);
        assert.equal(captured.buyIn, 40, 'buy-in');
        assert.equal(captured.kp.amount, 100, 'KP amount');
        assert.deepEqual(captured.kp.holes, [4, 14], 'KP holes');
        assert.equal(captured.net.amount, 100, 'net amount');
        assert.deepEqual(captured.net.places, [50, 30, 20], 'net places');
        assert.equal(captured.skins.mode, 'remainder', 'skins mode');
        assert.equal(captured.skins.scoring, 'net', 'skins scoring');
        assert.equal(captured.skins.carryOver, true, 'skins carry');
    });

    test('CUSTOM net payouts survive, including the mode flag', () => {
        const pool = Object.assign({}, PRESET_POOL, {
            net: { payoutMode: 'custom', amounts: [40, 30] }
        });
        const { captured } = roundTrip(pool);
        assert.equal(captured.net.payoutMode, 'custom');
        assert.deepEqual(captured.net.amounts, [40, 30]);
        assert.equal(captured.net.amount, undefined,
            'a custom net stores only its amounts; the total stays derived');
    });

    test('a four-place custom payout restores all four rows', () => {
        const pool = Object.assign({}, PRESET_POOL, {
            net: { payoutMode: 'custom', amounts: [40, 30, 20, 10] }
        });
        const { captured } = roundTrip(pool);
        assert.deepEqual(captured.net.amounts, [40, 30, 20, 10]);
    });

    test('FIXED skins keeps its mode and its dollar amount', () => {
        const pool = Object.assign({}, PRESET_POOL, {
            skins: { mode: 'fixed', amount: 280, scoring: 'gross', carryOver: false }
        });
        const { captured } = roundTrip(pool);
        assert.equal(captured.skins.mode, 'fixed');
        assert.equal(captured.skins.amount, 280);
        assert.equal(captured.skins.scoring, 'gross');
        assert.equal(captured.skins.carryOver, false, 'ties-void must not flip back to carry');
    });

    test('a pool with no skins bucket stays that way', () => {
        const pool = Object.assign({}, PRESET_POOL, { skins: { mode: 'none' } });
        const { captured } = roundTrip(pool);
        assert.equal(captured.skins.mode, 'none');
    });

    test('a pool with no KP bucket does not grow one', () => {
        const pool = { enabled: true, buyIn: 25, skins: { mode: 'remainder', scoring: 'net', carryOver: true } };
        const { captured } = roundTrip(pool);
        assert.equal(captured.buyIn, 25);
        assert.equal(captured.kp, undefined, 'no KP money means no KP bucket');
    });

    test('every preset place option round-trips', () => {
        [[100], [60, 40], [50, 30, 20], [40, 30, 20, 10]].forEach(places => {
            const { captured } = roundTrip(Object.assign({}, PRESET_POOL, {
                net: { amount: 200, places }
            }));
            assert.deepEqual(captured.net.places, places, places.join('/') + ' must survive');
        });
    });
});

describe('STATE B — turning the pot off still works', () => {

    test('an organizer who unticks the box deletes the pool, as before', () => {
        const { sb, captured } = roundTrip(PRESET_POOL);
        assert.notEqual(captured, null, 'precondition: it loaded');
        sb.document.getElementById('mp-enabled').checked = false;
        const after = plain(vm.runInContext('captureMoneyPool()', sb));
        assert.equal(after, null,
            'Calling the pot off must remain possible; this fix must not make a pool permanent.');
    });
});

describe('STATE C — a round with no pool never grows one', () => {

    test('no moneyPool at all stays null', () => {
        const { sb, captured } = roundTrip(undefined);
        assert.equal(captured, null);
        assert.equal(sb.document.getElementById('mp-enabled').checked, false,
            'the box must not tick itself');
    });

    test('an explicitly disabled pool is not resurrected', () => {
        const { captured } = roundTrip({ enabled: false, buyIn: 40 });
        assert.equal(captured, null);
    });
});

describe('FIELDS THE FORM CANNOT DRAW ARE CARRIED, NOT DROPPED', () => {

    // pool-engine.js honours participantIds; Rattle Golf 1.0 deliberately ships no
    // picker for it. A rebuild-from-controls capture would erase it on the next save.
    test('participantIds survives a round-trip through a form that cannot show it', () => {
        const pool = Object.assign({}, PRESET_POOL, { participantIds: ['101', '104', '109'] });
        const { captured } = roundTrip(pool);
        assert.deepEqual(captured.participantIds, ['101', '104', '109'],
            'A field the wizard cannot display must not be destroyed by saving.');
    });

    test('an unknown future key is carried too', () => {
        const pool = Object.assign({}, PRESET_POOL, { somethingLaterVersionsAdd: { a: 1 } });
        const { captured } = roundTrip(pool);
        assert.deepEqual(captured.somethingLaterVersionsAdd, { a: 1 });
    });

    test('carrying forward never overwrites what the form does own', () => {
        const { sb } = roundTrip(Object.assign({}, PRESET_POOL, { participantIds: ['101'] }));
        sb.document.getElementById('mp-buyin').value = '75';
        const after = plain(vm.runInContext('captureMoneyPool()', sb));
        assert.equal(after.buyIn, 75, 'an edited buy-in must win over the loaded one');
        assert.deepEqual(after.participantIds, ['101'], 'and the unsupported field still rides along');
    });

    test('a preset the four options cannot express is preserved verbatim', () => {
        const odd = { amount: 100, places: [70, 30] };
        const { captured } = roundTrip(Object.assign({}, PRESET_POOL, { net: odd }));
        assert.deepEqual(captured.net.places, [70, 30],
            'An unshowable split must not be silently rounded to the nearest option.');
    });
});

describe('AUTO-KP INTERACTION — a saved KP list is a decision', () => {

    test('restored KP holes count as a manual override', () => {
        const { sb } = roundTrip(PRESET_POOL);
        assert.equal(vm.runInContext('kpHolesTouched', sb), true,
            'Saved holes must be protected from auto-fill.');
    });

    test('a pool with no KP holes leaves the field free for auto-fill', () => {
        const { sb } = roundTrip({ enabled: true, buyIn: 40, skins: { mode: 'remainder' } });
        assert.equal(vm.runInContext('kpHolesTouched', sb), false);
    });

    test('typing in the field marks it touched', () => {
        const sb = loadHtmlInlineScript('admin.html', ['course-data.js']);
        assert.equal(vm.runInContext('kpHolesTouched', sb), false);
        sb.document.getElementById('mp-kp-holes').value = '7, 12';
        vm.runInContext('mpKpHolesEdited();', sb);
        assert.equal(vm.runInContext('kpHolesTouched', sb), true);
    });
});

describe('THE RESTORE IS WIRED INTO THE REAL LOAD PATH', () => {

    test('loadModeData calls loadMoneyPool', () => {
        // Behavioural tests above drive loadMoneyPool directly; this pins the fact
        // that the production loader actually calls it. Without this line the round
        // trip is perfect and the bug is still shipped.
        const s = src();
        const loader = s.slice(s.indexOf('function loadModeData(modeKey)'));
        assert.match(loader.slice(0, loader.indexOf('\n    function ')), /loadMoneyPool\(data\);/,
            'loadModeData must restore the pool, or nothing above matters.');
    });

    test('the KP field records intent on input', () => {
        assert.match(src(), /id="mp-kp-holes"[^>]*oninput="mpKpHolesEdited\(\)"/,
            'typing must mark the list as the organizer\'s own');
    });

    test('the copy-a-round flow goes through the same loader', () => {
        // Copying a round is explicitly for reusing a setup, so the pot comes with it.
        assert.match(src(), /loadModeData\(copyFromCode\);/);
    });
});
