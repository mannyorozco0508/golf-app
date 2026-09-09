// ============================================================================
// THE POLICY MUST NOT CLAIM COLLECTION THAT DOES NOT HAPPEN.
//
// privacy.html's "What is stored" table carries this row:
//
//     "A random identifier generated on your device | To count how many rounds have
//      been set up on this device. It is not linked to you, and it is not shared."
//
// NEITHER THING EXISTS. Measured across the 33 files sync-mobile-web.js actually
// ships: crypto.randomUUID, uuid, deviceId, device_id, installId, install_id,
// clientId and userId are ZERO hits, and no storage key holds a count. The complete
// set of localStorage keys is golfapp-theme, golfAppRoster, lastRoomCode,
// lastTripCode, betaNoticeDismissed, landingDismissed_<code> and golfapp_me_<code> -
// and the last of those is the player NUMBER the golfer taps as "me" on one round,
// not a random value and never sent anywhere.
//
// THIS IS THE INVERSE OF THE USUAL COPY BUG and it is still a bug. The App Store
// privacy questionnaire has to match the policy, and answering "yes, identifiers"
// for something the app does not do is a wrong answer that is hard to defend later.
// Nine lines further down the same file already says the accurate thing: "No
// advertising identifier, and no third-party analytics or tracking SDK".
//
// BOUND TO THE CODE, NOT JUST TO THE WORDS. The second half of this file re-measures
// the shipped bundle. If somebody LEGITIMATELY adds a device identifier one day, the
// policy assertion here is the wrong thing to relax - the code assertion goes red
// too and says so, which is the prompt to write an accurate row rather than delete
// a test.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const POLICY = read('privacy.html');

// The RENDERED claim, not the markup. Tags are stripped so a phrase split across
// <td> boundaries still reads as one sentence, and so a class name can never be
// mistaken for a claim.
const PROSE = POLICY.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

// What the policy must not claim, each with the words a reader would actually see.
const FORBIDDEN = [
    { what: 'a random identifier',      re: /random identifier/i },
    { what: 'a device identifier',      re: /device identifier/i },
    { what: 'an identifier generated on the device', re: /identifier generated on your device/i },
    { what: 'a per-device round counter', re: /count how many rounds/i },
    { what: 'any per-device counter',   re: /how many rounds .{0,30}(this|your) device/i },
];

// The identifier-shaped things that would have to exist for such a row to be true.
const IDENTIFIER_TOKENS = [
    /\bcrypto\.randomUUID\b/, /\buuid\b/i, /\bdeviceId\b/, /\bdevice_id\b/,
    /\binstallId\b/, /\binstall_id\b/, /\bclientId\b/, /\bclient_id\b/,
];

function shippedFiles() {
    const S = read('sync-mobile-web.js');
    const d = name => {
        const m = new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];').exec(S);
        assert.ok(m, name + ' must be declared in sync-mobile-web.js');
        return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
    };
    // The vendored Firebase bundles are third-party minified code, not claims this
    // policy makes about what the APP does. They are excluded deliberately and the
    // exclusion is named here rather than left implicit.
    return d('SHARED_SHELL').concat(d('CONSUMER_SHELL'))
        .filter(f => !/^firebase-/.test(f) && !/\.(png|json)$/.test(f));
}

describe('THE PRIVACY POLICY DESCRIBES THE APP THAT SHIPS', () => {

    // POSITIVE FIRST - every assertion below is "this phrase is absent", which an
    // empty string satisfies forever.
    test('the policy was actually read', () => {
        assert.ok(PROSE.length > 800,
            'privacy.html stripped to ' + PROSE.length + ' characters of prose; the '
            + 'absence assertions below would be vacuous.');
        assert.match(PROSE, /What is stored/i, 'the table this test is about must exist');
        assert.match(PROSE, /What is never collected/i);
    });

    test('the policy claims no identifier and no per-device counter', () => {
        const claimed = FORBIDDEN.filter(f => f.re.test(PROSE)).map(f => f.what);
        assert.deepEqual(claimed, [],
            '\nprivacy.html claims ' + claimed.length + ' thing(s) the app does not do:\n'
            + claimed.map(c => '    ' + c).join('\n')
            + '\n\n  Nothing in the shipped bundle generates an identifier or counts '
            + 'rounds per device.\n  A policy that over-declares still has to match the '
            + 'App Store privacy questionnaire.');
    });

    // THE ACCURATE LINE, PINNED. Deleting the false row must not take the true one
    // with it - and a policy that says nothing about identifiers at all is weaker
    // than one that says there are none.
    test('the policy still states plainly that there is no ad identifier or tracking SDK', () => {
        assert.match(PROSE, /No advertising identifier/i,
            'privacy.html must keep the accurate claim it already makes');
        assert.match(PROSE, /no third-party analytics or tracking SDK/i);
    });

    // ---- BOUND TO THE CODE ------------------------------------------------
    test('and the shipped bundle really does generate no identifier', () => {
        const offenders = [];
        shippedFiles().forEach(f => {
            let src;
            try { src = read(f); } catch (e) { return; }
            src.split('\n').forEach((line, i) => {
                // Comments are stripped: native-export.js has a comment about the
                // Capacitor bridge's "fingerprint", and a substring match on prose is
                // the trap this repo keeps paying for.
                if (/^\s*(\/\/|\*|<!--)/.test(line)) return;
                IDENTIFIER_TOKENS.forEach(re => {
                    if (re.test(line)) offenders.push(f + ':' + (i + 1) + '  ' + line.trim().slice(0, 90));
                });
            });
        });
        assert.deepEqual(offenders, [],
            '\nthe shipped bundle now generates or stores an identifier:\n'
            + offenders.map(o => '    ' + o).join('\n')
            + '\n\n  If that is DELIBERATE, privacy.html needs an accurate row describing '
            + 'it -\n  do not relax the policy assertion above to match.');
        assert.ok(shippedFiles().length >= 20,
            'only ' + shippedFiles().length + ' shipped files were scanned; too few '
            + 'for the assertion above to mean anything');
    });

    test('this test says why it is bound to the code as well as the words', () => {
        assert.match(fs.readFileSync(__filename, 'utf8'), /BOUND TO THE CODE, NOT JUST TO THE WORDS/);
    });
});
