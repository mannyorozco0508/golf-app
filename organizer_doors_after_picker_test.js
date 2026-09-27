// ============================================================================
// A GROUP LOCK IS NOT A DEMOTION (Wave 22)
//
// THE SEQUENCE MANNY HIT, on round 4C6722 - 25 golfers in 6 groups - and which
// nothing tested: he tapped "🔑 Share organizer link", opened it, and landed on the
// group picker, which is the same first screen as "📣 The whole round". Measured
// cold, the organizer link DID work on arrival: Edit round setup, Group Links and
// canReachSetup() were all true, and isRoundOrganizer said yes. Then he answered the
// picker - the only thing on that screen - and:
//     the URL gained &group=1
//     hasGroupLock became true
//     canReachSetup() returned FALSE, because its first line was
//         if (hasGroupLock) return false;
//     both doors vanished, while the token was still held and still validating.
// The organizer demoted himself by doing the only thing the screen offered, which is
// why the organizer link read as identical to the whole-round link.
//
// THE RULE NOW: the token means "this device is the organizer"; &group= means "this
// card is scoped to four golfers". Only the first governs the doors.
//
// THIS REVERSES A STATED v189 RULE, deliberately and on Manny's instruction.
// organizer_door_test.js's header says "And never on a group link, whoever holds it",
// and its group-link case asserted canReachSetup() === false on the OWNER's own
// device. That case is re-pointed, not deleted, and the reason it existed is kept:
// isRoundOrganizer has a THIRD arm - a round with neither ownerUid nor organizerToken
// is open to anybody - and on a group link that arm would hand the organizer's doors
// to every scorekeeper of a legacy round. So the group lock still blocks the FALLBACK
// and only real evidence survives it:
//     organizerEvidence(data, uid, token) -> 'uid' | 'token' | null
// one comparison, in organizer-gate.js, which isRoundOrganizer now uses as well, so
// the two predicates cannot drift apart.
//
// WHY CHROME. The sequence is a real tap on the picker, and the picker is a modal
// over the page. Cold through tools/lib/cold-arrival.js.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const CD = makeCourseData(18);
const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
// 25 golfers in 6 groups: Manny's round, so the picker really appears.
const NAMES = ['Randy T', 'Ryan H', 'Anthony', 'Kopp', 'Dalen', 'Vic', 'Manny', 'Marty', 'Lance',
    'Matt M', 'Matt B', 'Matt H', 'Eric', 'Chris', 'Ivy', 'Jon', 'Kim', 'Lee', 'Gus', 'Hal',
    'Fay', 'Eli', 'Dee', 'Cal', 'Ben'];
const P = makePlayers(NAMES, NAMES.map((_, i) => i % 20), 101);

function round(extra) {
    return Object.assign({ eventName: 'Doors', courseName: 'Test', players: P, gameFormat: 'stroke',
        courseData: CD, scores: {}, settlementMode: 'whole-dollar' }, extra || {});
}
const OWNED_WITH_TOKEN = round({ organizerToken: TOKEN, ownerUid: 'somebody-else' });
const LEGACY = round({});                       // neither ownerUid nor organizerToken

const LOOK = `(function () {
  function on(sel) { var e = document.querySelector(sel); return !!(e && e.getClientRects().length); }
  var pillText = Array.prototype.slice.call(document.querySelectorAll('.group-btn'))
    .map(function (b) { return (b.innerText || '').trim(); });
  var picker = document.getElementById('group-pick-overlay');
  return JSON.stringify({
    search: location.search,
    pickerShown: !!(picker && getComputedStyle(picker).display !== 'none'),
    editSetupDoor: on('.group-setup-btn'),
    groupLinksPanel: on('.group-links-btn'),
    playersPill: pillText.some(function (t) { return /Players/.test(t); }),
    canReachSetup: (typeof canReachSetup === 'function') ? canReachSetup() : 'n/a',
    hasGroupLock: (typeof hasGroupLock !== 'undefined') ? hasGroupLock : 'n/a',
    evidence: (window.organizerGate && window.organizerGate.organizerEvidence)
      ? window.organizerGate.organizerEvidence(currentData,
          (window.authBootState && window.authBootState.uid) || null,
          window.organizerGate.heldOrganizerToken(new URLSearchParams(location.search).get('game'),
            new URLSearchParams(location.search).get('organizer')))
      : 'no organizerEvidence'
  });
})()`;

async function arrive(data, query, steps) {
    const r = await arriveCold({ url: fileUrl('index.html', query),
        db: { events: { DOORS: data }, global_courses: {}, trips: {}, tournaments: {} },
        settleMs: 3200, viewport: { width: 390, height: 844 },
        steps: (steps || []).concat([{ expression: LOOK }]) });
    return r.ok ? JSON.parse(r.value[r.value.length - 1]) : { error: r.reason };
}

const S = {};
before(async () => {
    const TAP_PICKER = [{ tap: '#group-pick-overlay button', nth: 0 }, { sleep: 800 }];
    S.arrival = await arrive(OWNED_WITH_TOKEN, 'game=DOORS&organizer=' + TOKEN);
    S.afterPicker = await arrive(OWNED_WITH_TOKEN, 'game=DOORS&organizer=' + TOKEN, TAP_PICKER);
    S.plainGroup = await arrive(OWNED_WITH_TOKEN, 'game=DOORS&group=1');
    S.legacyGroup = await arrive(LEGACY, 'game=DOORS&group=1');
    S.legacyBare = await arrive(LEGACY, 'game=DOORS');
});

describe('THE ORGANIZER LINK KEEPS ITS DOORS THROUGH THE PICKER', () => {
    test('ran', () => {
        Object.keys(S).forEach(k => assert.ok(S[k] && !S[k].error, k + ': ' + (S[k] && S[k].error)));
    });

    test('on arrival: the picker is up, and the doors are there behind it', () => {
        const v = S.arrival;
        assert.equal(v.pickerShown, true, 'no picker on a 6-group round - the fixture is wrong');
        assert.equal(v.canReachSetup, true);
        assert.equal(v.editSetupDoor, true);
        assert.equal(v.groupLinksPanel, true);
        assert.equal(v.evidence, 'token', 'the token is not what is granting this');
    });

    test('AFTER ANSWERING THE PICKER: all three doors are STILL there', () => {
        // The exact sequence from round 4C6722. Before this wave every one of these was
        // false and the token was still being held - the page knew who he was and hid the
        // doors anyway.
        const v = S.afterPicker;
        assert.match(v.search, /group=1/, 'the picker was not actually answered: ' + v.search);
        assert.equal(v.hasGroupLock, true, 'the group lock did not take, so this proves nothing');
        assert.equal(v.canReachSetup, true, 'canReachSetup() still discards the token on a group lock');
        assert.equal(v.editSetupDoor, true, 'the Edit round setup door vanished');
        assert.equal(v.groupLinksPanel, true, 'the Group Links panel vanished');
        assert.equal(v.playersPill, true, 'the Players pill vanished');
        assert.equal(v.evidence, 'token', 'the evidence is gone, not just the doors');
    });
});

describe('AND A GROUP LOCK STILL BLOCKS EVERYTHING THAT IS NOT EVIDENCE', () => {
    // The risk this wave introduces, tested in isolation rather than assumed away.
    test('a plain group link on an owned round: no doors, no evidence', () => {
        const v = S.plainGroup;
        assert.equal(v.evidence, null, 'a scorekeeper has evidence of being the organizer');
        assert.equal(v.canReachSetup, false);
        assert.equal(v.editSetupDoor, false);
        assert.equal(v.groupLinksPanel, false);
        assert.equal(v.playersPill, false);
    });

    test('A LEGACY ROUND on a group link: STILL no doors, even though isRoundOrganizer says yes', () => {
        // isRoundOrganizer's third arm - neither ownerUid nor organizerToken - is open to
        // anybody, and it is the reason v189 blocked group links outright. If the group
        // lock stopped blocking the FALLBACK, every scorekeeper of a legacy round would
        // get the organizer's doors. This is the assertion that says it still does.
        const v = S.legacyGroup;
        assert.equal(v.evidence, null, 'the no-owner fallback is being counted as evidence');
        assert.equal(v.canReachSetup, false,
            'a legacy round on a GROUP LINK opened the setup doors to a scorekeeper');
        assert.equal(v.editSetupDoor, false);
        assert.equal(v.groupLinksPanel, false);
    });

    test('and a legacy round on a BARE link is unchanged: the doors are open, as they always were', () => {
        // The positive control for the test above: the fallback still works where it always
        // did, so "no doors on a legacy group link" is not just a guard that refuses
        // everything.
        const v = S.legacyBare;
        assert.equal(v.canReachSetup, true, 'a legacy round lost its open setup');
    });
});

describe('THE SOURCE: ONE COMPARISON, IN THE GATE', () => {
    const IDX = read('index.html');
    const GATE = read('organizer-gate.js');
    const fn = IDX.slice(IDX.indexOf('function canReachSetup()'),
                         IDX.indexOf('\n    }', IDX.indexOf('function canReachSetup()')));

    test('canReachSetup no longer returns false for a group lock alone', () => {
        assert.ok(fn.length > 80, 'canReachSetup could not be sliced');
        assert.ok(!/^\s*if \(hasGroupLock\) return false;/m.test(fn),
            'the unconditional group-lock early return is back');
        assert.match(fn, /hasGroupLock/, 'the group lock must still matter - just not on its own');
        assert.match(fn, /organizerEvidence/, 'it does not ask for evidence');
    });

    test('organizerEvidence lives in the gate and isRoundOrganizer uses it, so they cannot drift', () => {
        assert.match(GATE, /function organizerEvidence\(data, uid, token\)/);
        // organizer-gate.js exports through one object literal, not module.exports.x = x -
        // my first version of this assertion described a style the file does not use.
        assert.match(GATE, /organizerEvidence: organizerEvidence,/);
        const iro = GATE.slice(GATE.indexOf('function isRoundOrganizer'),
                               GATE.indexOf('\n    }', GATE.indexOf('function isRoundOrganizer')));
        assert.match(iro, /organizerEvidence\(/,
            'isRoundOrganizer keeps its own copy of the comparison');
        // and the fallback still lives in isRoundOrganizer, NOT in the evidence function
        const ev = GATE.slice(GATE.indexOf('function organizerEvidence'),
                              GATE.indexOf('\n    }', GATE.indexOf('function organizerEvidence')));
        assert.ok(!/!data\.ownerUid && !data\.organizerToken/.test(ev),
            'the no-owner fallback leaked into organizerEvidence, which would make a legacy '
            + 'group link an organizer');
    });
});
