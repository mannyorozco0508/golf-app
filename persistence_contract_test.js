// ============================================================================
// ROUND-TRIP PERSISTENCE CONTRACT
//
// Every lifecycle bug found in this codebase recently has been the same shape: a
// field written by saveSettings() that nothing restores, so reopening a round and
// re-saving it silently destroyed or changed something.
//
//   moneyPool        the whole pot was erased on every re-save
//   organizerToken   a new secret was minted, killing the shared organizer link
//   settlementMode   a legacy cent round was converted to whole dollars
//
// Three separate bugs, one missing rule. This file is that rule.
//
// It enumerates the ACTUAL keys of the payload in admin.html and requires each one
// to be either restored on load, or declared here with a reason. A new field added
// to the payload fails this test until somebody classifies it - which is the whole
// point: the classification is the thinking that was missing all three times.
//
// It is deliberately source-level. saveSettings() is a long function wired to
// Firebase, alerts and several hundred DOM ids; driving it end to end would test
// the harness more than the contract. What matters is the pairing between the two
// halves, and that is legible in the source.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers/load-script.js');

const SRC = fs.readFileSync(path.join(REPO_ROOT, 'admin.html'), 'utf8');

function fnBody(name) {
    const a = SRC.indexOf('function ' + name + '(');
    assert.notEqual(a, -1, name + '() must exist');
    const b = SRC.indexOf('\n    function ', a + 10);
    return SRC.slice(a, b === -1 ? SRC.length : b);
}

function payloadKeys() {
    const at = SRC.indexOf('const payload = {');
    assert.notEqual(at, -1, 'saveSettings must still build a payload object');
    const block = SRC.slice(at, SRC.indexOf('\n            };', at));
    return (block.match(/^\s{16}([A-Za-z_][A-Za-z0-9_]*):/gm) || [])
        .map(l => l.trim().replace(':', ''));
}

// Everything that puts a stored value back on screen. loadModeData delegates to
// these, so they count as part of the restore surface.
const RESTORE_SURFACE = () =>
    fnBody('loadModeData') + fnBody('loadMoneyPool')
    + fnBody('loadAdditionalGames') + fnBody('loadSkinsInstances');

// ---------------------------------------------------------------------------
// DECLARED NON-RESTORED FIELDS.
//
// Each entry is a claim that not restoring the field is correct. Adding to this
// list should feel like a decision, because it is one.
// ---------------------------------------------------------------------------
const DECLARED = {
    eventName:
        'RECOMPUTED. Derived at save from roundDay, which IS restored, so the same '
        + 'round re-saves to the same name.',
    categoryIcon:
        'RECOMPUTED. Derived from eventCategory, which IS restored.',
    settlementMode:
        'ONE-WAY FOR NEW ROUNDS ONLY. Written for a brand-new round; DELETED from '
        + 'the payload when editing an existing one so the stored value - including '
        + "a legacy round's deliberate absence, meaning cents - is never touched. "
        + 'Guarded by NO_SILENT_MODE_CONVERSION below.',
    skinsRounding:
        'ONE-WAY FOR NEW ROUNDS ONLY, like settlementMode. Written as '
        + "'odd-dollar' for a brand-new round (skins pay whole dollars); DELETED "
        + 'from the payload when editing an existing one so a round played under '
        + 'the float math keeps it. Guarded by skins_flag_persistence_test.js.',
    richHoleBet:
        'RETIRED FIELD. Written as null to clear legacy data; nothing reads it.',
    richHoleBetPresses:
        'RETIRED FIELD. Written as null to clear legacy data; nothing reads it.',
    richOverallBetPresses:
        'RETIRED FIELD. Written as null to clear legacy data; nothing reads it.',
};

describe('every persisted round field is restored or declared', () => {

    test('the payload is still discoverable', () => {
        const keys = payloadKeys();
        assert.ok(keys.length > 30,
            'Expected the full round payload; found ' + keys.length + ' keys. '
            + 'If saveSettings was restructured, this test must be re-pointed, not deleted.');
    });

    test('CONTRACT: no field is written without being restored or classified', () => {
        const surface = RESTORE_SURFACE();
        const unclassified = payloadKeys()
            .filter(k => !surface.includes(k))
            .filter(k => !Object.prototype.hasOwnProperty.call(DECLARED, k));

        assert.deepEqual(unclassified, [],
            'These fields are saved but never restored, and are not declared:\n  '
            + unclassified.join('\n  ')
            + '\n\nReopening a round and re-saving it will overwrite them with form '
            + 'defaults. Either restore the field on load, or add it to DECLARED with '
            + 'the reason it is safe. This is exactly how the Main Pool, organizer '
            + 'token and settlement mode bugs reached production.');
    });

    test('DECLARED does not drift: every declaration still applies to a real field', () => {
        // A stale exemption is worse than none - it silently blesses a field that
        // may have been renamed into a genuine gap.
        const keys = payloadKeys();
        const stale = Object.keys(DECLARED).filter(k => !keys.includes(k));
        assert.deepEqual(stale, [],
            'DECLARED exempts fields that are no longer in the payload: ' + stale.join(', '));
    });
});

describe('the organizer link survives a re-save', () => {

    test('TOKEN_IS_PRESERVED: an existing token is reused, not reminted', () => {
        assert.match(SRC, /organizerToken: loadedOrganizerToken \|\| makeOrganizerToken\(\)/,
            'saveSettings must reuse the round\'s existing token.');
        assert.match(fnBody('loadModeData'), /loadedOrganizerToken = data\.organizerToken \|\| null/,
            'loadModeData must capture the stored token.');
        assert.doesNotMatch(SRC, /organizerToken: makeOrganizerToken\(\),/,
            'The unconditional mint must be gone - it silently broke shared organizer links.');
    });

    test('COPY_DOES_NOT_INHERIT_A_SECRET: only the round being edited is preserved', () => {
        // loadModeData is also the copy-a-round loader. Carrying the source round's
        // organizer token into a new round would hand out its secret.
        const body = fnBody('loadModeData');
        assert.match(body, /const isThisRound = String\(modeKey\) === String\(currentMode\)/);
        // "This round" is the code AND a stored record. A brand-new round arrives
        // on ?game=CODE before anything is written; until 2026-09-13 the plain
        // `if (isThisRound)` marked it as existing and deleted settlementMode from
        // its first save (skins_flag_persistence_test.js measures the arrival).
        assert.match(body, /if \(isThisRound && snapshot\.exists\(\)\) \{/,
            'the capture must be gated on editing this round - code AND record - not copying another, and not a fresh code');
    });
});

describe('flights are RESTORED, not declared (Wave 2, 2026-09-13)', () => {
    // `flights` is written by the payload (null when off - the moneyPool
    // pattern - so update() deletes the key) and RESTORED by loadModeData
    // before the roster rebuild, so it needs no DECLARED entry: an entry
    // there would claim not restoring it is correct, which it is not - a
    // re-save of a flighted round with no restore would silently un-flight it.
    test('the payload writes flights and loadModeData restores the switch and both scopes before the rows are rebuilt', () => {
        assert.ok(payloadKeys().includes('flights'), 'flights is a payload field');
        const body = fnBody('loadModeData');
        assert.match(body, /const fl = data\.flights;/);
        assert.match(body, /setFlightsEnabled\(flOn\)/);
        assert.match(body, /setFlightScope\('skins'/);
        assert.match(body, /setFlightScope\('birdies'/);
        assert.ok(body.indexOf('setFlightsEnabled(flOn)') < body.indexOf('storedPlayersTemp = data.players'),
            'the switch must be known before the roster rebuild, or the rows render without their column');
        assert.match(SRC, /flights: flightsSetting\(\),/, 'null when off, the object when on');
    });
});

describe('a legacy round keeps the settlement mode it was played under', () => {

    test('NO_SILENT_MODE_CONVERSION: the key is dropped when editing', () => {
        assert.match(SRC, /if \(loadedExistingRound\) delete payload\.settlementMode;/,
            'Editing an existing round must not write settlementMode at all. update() '
            + 'leaves an omitted key untouched, which is the only way a legacy round\'s '
            + 'ABSENT value - meaning cents - survives.');
        const at = SRC.indexOf('delete payload.settlementMode');
        const upd = SRC.indexOf('.update(payload)');
        assert.ok(at > -1 && at < upd, 'the deletion must happen before the write');
    });

    test('a brand-new round still settles in whole dollars', () => {
        assert.match(SRC, /settlementMode: 'whole-dollar'/,
            'New rounds must still declare whole-dollar settlement.');
        assert.match(fnBody('loadModeData'), /loadedExistingRound = true/,
            'loadModeData must record that this is an existing round.');
    });
});
