// ============================================================================
// A TRIP'S ORGANIZER IS THE ORGANIZER OF ITS ROUNDS (2026-10-08)
//
// Manny's ask: "when a signed-in organizer of a TRIP opens one of its rounds,
// treat him as that round's organizer."
//
// WHY IT IS WORTH HAVING even though his account already owns all seven Myrtle
// rounds: the next round he adds to the trip, or one a playing partner sets up
// and links in, carries somebody else's ownerUid or none - and he would be a
// spectator on a round inside his own trip. One stamp on the trip now covers
// every round in it, including the ones that do not exist yet.
//
// HOW IT IS KNOWN. The trip holds the round codes, not the other way round, so
// a round could not find its trip at all. Each round in the trip now carries
// tripCode (additive, written 2026-10-08), and the gate is handed the trip's
// ownerUid alongside the round's. Nothing searches, and nothing new is read on
// a round with no tripCode.
//
// IT GRANTS SCREENS, NOT WRITES. organizerEvidence decides which doors are
// shown; database.rules.json is untouched and a setup WRITE still requires
// auth.uid === the round's own ownerUid. That boundary is the same one the
// organizer TOKEN has always had, and no word here may suggest otherwise.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadJsFile } = require('./helpers/load-script.js');

const G = () => loadJsFile('organizer-gate.js', []).organizerGate;
const MINE = 'uid-manny';
const THEIRS = 'uid-somebody-else';

describe('1. THE TRIP OWNER IS LET IN', () => {

    test('a round owned by somebody else, inside MY trip, opens for me', () => {
        const g = G();
        const round = { ownerUid: THEIRS, tripCode: 'VWNPW6' };
        assert.equal(g.organizerEvidence(round, MINE, null), null,
            'without the trip it must still refuse - that is the old behaviour');
        assert.equal(g.organizerEvidence(round, MINE, null, { ownerUid: MINE }), 'trip',
            'the trip owner was not recognised');
        assert.equal(g.isRoundOrganizer(round, MINE, null, { ownerUid: MINE }), true);
    });

    test('the round’s own owner still wins, with or without a trip', () => {
        const g = G();
        const round = { ownerUid: MINE, tripCode: 'VWNPW6' };
        assert.equal(g.organizerEvidence(round, MINE, null, { ownerUid: THEIRS }), 'uid',
            'the round’s own owner must be recognised first');
    });

    test('and a round with NO owner inside my trip opens for me', () => {
        const g = G();
        const round = { tripCode: 'VWNPW6', organizerToken: 'tok' };
        assert.equal(g.organizerEvidence(round, MINE, null, { ownerUid: MINE }), 'trip');
    });
});

describe('2. AND NOBODY ELSE IS', () => {

    test('somebody else’s trip does not open my round', () => {
        const g = G();
        const round = { ownerUid: MINE, tripCode: 'OTHER1' };
        assert.equal(g.organizerEvidence(round, THEIRS, null, { ownerUid: MINE }), null,
            'a golfer who owns neither was let in');
        assert.equal(g.isRoundOrganizer(round, THEIRS, null, { ownerUid: MINE }), false);
    });

    test('a trip with no owner grants nothing', () => {
        const g = G();
        const round = { ownerUid: THEIRS, tripCode: 'VWNPW6' };
        [null, undefined, {}, { ownerUid: '' }, { ownerUid: null }].forEach((trip) => {
            assert.equal(g.organizerEvidence(round, MINE, null, trip), null,
                'an unowned trip let somebody in: ' + JSON.stringify(trip));
        });
    });

    test('a signed-OUT visitor is never the trip organizer', () => {
        const g = G();
        const round = { ownerUid: THEIRS, tripCode: 'VWNPW6' };
        [null, undefined, ''].forEach((uid) => {
            assert.equal(g.organizerEvidence(round, uid, null, { ownerUid: MINE }), null,
                'a missing uid matched the trip owner');
        });
    });

    test('CONTROL: every old answer is unchanged when no trip is passed', () => {
        // The fourth argument is new. Every existing caller passes three, and
        // this is the assertion that proves none of them changed behaviour.
        const g = G();
        assert.equal(g.organizerEvidence({ ownerUid: MINE }, MINE, null), 'uid');
        assert.equal(g.organizerEvidence({ organizerToken: 'tok' }, null, 'tok'), 'token');
        assert.equal(g.organizerEvidence({ ownerUid: THEIRS }, MINE, null), null);
        assert.equal(g.isRoundOrganizer({}, MINE, null), true, 'an open round must stay open');
        assert.equal(g.isRoundOrganizer({ ownerUid: THEIRS }, MINE, null), false);
    });
});

describe('3. IT GRANTS SCREENS, NOT WRITES', () => {

    test('the rules file is untouched by this wave', () => {
        // A setup write still requires auth.uid === the round's own ownerUid.
        // If that ever changes it is a rules wave with Manny's approval, not
        // this one.
        //
        // BY SHA, NOT BY GREP. The first version of this asserted the rules
        // never mention "tripCode" - and they already did, as the path variable
        // \ under trips, which predates this wave by months. So the
        // assertion failed on an untouched file and said the opposite of the
        // truth. A sha says "this file did not move", which is the actual claim.
        const sha = require('crypto').createHash('sha256')
            .update(fs.readFileSync(path.join(__dirname, 'database.rules.json'))).digest('hex').slice(0, 16);
        assert.equal(sha, '31496c1b5ea03cf8',
            'database.rules.json moved. This wave grants SCREENS only - a setup write still '
            + 'needs auth.uid === the round owner. If the rules genuinely changed, that is its '
            + 'own wave with Manny approving the diff, and this pin is re-pinned with the reason.');
    });

    test('and the gate still says nothing about security', () => {
        const src = fs.readFileSync(path.join(__dirname, 'organizer-gate.js'), 'utf8');
        const at = src.indexOf('function organizerEvidence');
        const fn = src.slice(at, src.indexOf('\n    function isRoundOrganizer', at));
        assert.ok(fn.length > 200, 'the slice collapsed - this test is guarding nothing');
        assert.doesNotMatch(fn, /\bsecure\b|\bprotected\b|\blocked\b/i,
            'the gate hides doors and must not claim to protect anything');
    });
});
