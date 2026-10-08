// ============================================================================
// BIG-MOMENT MATCH ALERTS (Wave 2, 2026-10-07) - THE PURE HALF
//
// Manny's brief: push a golfer in a match when something happens in THAT match
// on a hole played by a DIFFERENT group. Never about your own group's holes.
// Match status change, a press starting, a match decided. One per hole per
// match. Never money amounts mid-round. Quiet while the golfer is looking at
// that round. Per-golfer "Match alerts" toggle, on by default, plus a
// round-level off switch for the organizer.
//
// WHY THE RULES AND NOT THE PLUMBING. Push already works end to end in
// production as of Wave 39 (c143857): FCM_SERVICE_ACCOUNT is configured,
// /api/push-send is deployed, the APNs/FCM token shape is verified, and
// push-notify.js is the pure decision layer that runs where the event happens
// and sends nothing. So this wave is a new KIND in that layer plus its gates -
// all of it testable in plain node, with no credential and no network.
//
// THE ONE THAT CANNOT BE WRITTEN HERE: "quiet while the golfer is viewing that
// round" has a second half on the phone, in push-boot.js, because the only
// thing that truly knows which round is on screen is the screen. The decision
// layer refuses on a `viewing` fact; the delivery layer must also suppress.
// That is listed as remaining work rather than claimed.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const P = require('./push-notify.js');

const KINDS = ['match-swing', 'match-press', 'match-decided'];
// A recipient in group 1; the hole was posted by group 3.
const base = (over) => Object.assign({
    kind: 'match-swing',
    tokens: ['tok'],
    prefs: {},
    facts: {
        uid: 'u-ivy', roundCode: 'ABC123', hole: 7,
        matchId: 'm1', matchLabel: 'Ivy vs Jon',
        recipientGroup: 1, scoredByGroup: 3,
        swing: 'Jon birdied 7', state: 'all square'
    }
}, over || {});
const decide = (over) => P.pushDecide(base(over));
const withFacts = (f, over) => decide(Object.assign({ facts: Object.assign({}, base().facts, f) }, over || {}));

describe('1. THE KINDS EXIST AND LAND ON THEIR OWN CHANNEL', () => {

    test('all three match kinds are on a "match" channel', () => {
        KINDS.forEach((k) => assert.equal(P.pushChannelOf(k), 'match',
            k + ' is on channel ' + P.pushChannelOf(k)));
    });

    test('Match alerts are ON by default, and can be turned off', () => {
        // Manny: on by default. A golfer who has never opened the screen gets them.
        assert.equal(P.pushPrefsNormalise({}).match, true);
        assert.equal(P.pushPrefsNormalise({ match: false }).match, false);
        KINDS.forEach((k) => {
            assert.equal(P.pushAllowed(k, {}), true, k + ' is off by default');
            assert.equal(P.pushAllowed(k, { match: false }), false, k + ' ignores the toggle');
        });
        // AND IT IS ITS OWN SWITCH: turning bets or hype off leaves it alone.
        assert.equal(P.pushAllowed('match-swing', { bets: false, hype: false }), true);
    });

    test('and they did not disturb the existing channels', () => {
        assert.equal(P.pushChannelOf('youre-in'), 'essentials');
        assert.equal(P.pushChannelOf('press-offered'), 'bets');
        assert.equal(P.pushChannelOf('hype'), 'hype');
        assert.equal(P.pushPrefsNormalise({}).essentials, true);
    });
});

describe('2. NEVER ABOUT YOUR OWN GROUP’S HOLES', () => {

    test('a hole posted by ANOTHER group sends', () => {
        const d = decide();
        assert.equal(d.send, true, 'refused with: ' + d.reason);
    });

    test('a hole posted by the golfer’s OWN group does not', () => {
        // The whole point of the feature: you watched it happen.
        const d = withFacts({ scoredByGroup: 1 });
        assert.equal(d.send, false);
        assert.equal(d.reason, 'own-group');
    });

    test('and an UNKNOWN group fails closed, both ways round', () => {
        // A missing group is not evidence of a different group. Guessing here
        // would push a golfer about the card in his own hand.
        [{ scoredByGroup: null }, { recipientGroup: null },
         { scoredByGroup: undefined }, { recipientGroup: undefined }].forEach((f) => {
            const d = withFacts(f);
            assert.equal(d.send, false, JSON.stringify(f) + ' sent anyway');
            assert.equal(d.reason, 'group-unknown');
        });
    });

    test('a one-group round therefore alerts nobody', () => {
        // Every hole is your own group's, so there is nothing to tell anyone.
        const d = withFacts({ recipientGroup: 1, scoredByGroup: 1 });
        assert.equal(d.send, false);
    });
});

describe('3. ONE PER HOLE PER MATCH', () => {

    test('the throttle key is the round, the MATCH and the hole', () => {
        const k = P.pushMatchThrottleKey('ABC123', 'm1', 7);
        assert.match(k, /ABC123/); assert.match(k, /m1/); assert.match(k, /7/);
        assert.notEqual(k, P.pushMatchThrottleKey('ABC123', 'm2', 7),
            'two matches on one hole share a key, so the second match goes silent');
        assert.notEqual(k, P.pushMatchThrottleKey('ABC123', 'm1', 8),
            'two holes in one match share a key, so the next hole goes silent');
    });

    test('a second alert for the same match on the same hole is throttled', () => {
        const first = decide();
        assert.equal(first.send, true);
        const again = decide({ buzzedHoles: { [first.throttleKey]: true } });
        assert.equal(again.send, false);
        assert.equal(again.reason, 'throttled');
    });

    test('but the OTHER match on that hole still speaks', () => {
        // Manny's limit is per hole per MATCH, not per hole. A golfer in two
        // matches can hear about both.
        const first = decide();
        const other = withFacts({ matchId: 'm2', matchLabel: 'Ivy vs Kim' },
            { buzzedHoles: { [first.throttleKey]: true } });
        assert.equal(other.send, true, 'refused with: ' + other.reason);
    });

    test('and the same moment is not sent twice', () => {
        const d = decide();
        const dup = decide({ alreadySent: { [d.dedupeKey]: true } });
        assert.equal(dup.send, false);
        assert.equal(dup.reason, 'already-sent');
    });
});

describe('4. NO MONEY MID-ROUND, IN ANY OF THE THREE', () => {

    // The Receipt's oldest defect was printing "+$30" with twelve holes
    // unplayed. A notification is worse: it cannot be corrected by scrolling.
    const MONEY = /\$|\bdollar|\bowe[sd]?\b|\bwon \$|\bpaid\b/i;

    KINDS.forEach((kind) => {
        test(kind + ' carries no money while the round is live', () => {
            const d = decide({ kind: kind, facts: Object.assign({}, base().facts, {
                kind: kind, money: 4000, moneyCents: 4000, result: 'Ivy 6&5', roundFinished: false
            }) });
            assert.equal(d.send, true, 'refused with: ' + d.reason);
            const text = String(d.copy.title || '') + ' | ' + String(d.copy.body || '');
            assert.doesNotMatch(text, MONEY, kind + ' leaked money mid-round: ' + text);
            // AND IT STILL SAYS SOMETHING. A rule that empties the message is
            // not a rule, it is a deletion.
            assert.ok(String(d.copy.body || '').length > 8, kind + ' says nothing: ' + text);
        });
    });

    test('a decided match names the result, which is not money', () => {
        const d = decide({ kind: 'match-decided', facts: Object.assign({}, base().facts,
            { result: 'Ivy 6&5', roundFinished: false }) });
        assert.match(String(d.copy.body), /6&5/, 'the body does not say how it finished');
    });
});

describe('5. QUIET WHILE THE GOLFER IS LOOKING AT THAT ROUND', () => {

    test('viewing the round refuses', () => {
        const d = withFacts({ viewing: true });
        assert.equal(d.send, false);
        assert.equal(d.reason, 'viewing');
    });

    test('viewing a DIFFERENT round does not refuse', () => {
        const d = withFacts({ viewing: false });
        assert.equal(d.send, true, 'refused with: ' + d.reason);
    });
});

describe('6. THE ORGANIZER CAN TURN THEM OFF FOR THE WHOLE ROUND', () => {

    test('the round switch beats the golfer’s own preference', () => {
        const d = decide({ roundAlertsOff: true });
        assert.equal(d.send, false);
        assert.equal(d.reason, 'round-off');
        // CONTROL: it is the switch doing it, not something else in the fixture.
        assert.equal(decide({ roundAlertsOff: false }).send, true);
    });

    test('and it does NOT silence essentials', () => {
        // "You won $40" at the end of the round is not a match alert, and an
        // organizer muting the chatter must not mute the settlement.
        const d = P.pushDecide({
            kind: 'final-results', tokens: ['tok'], prefs: {}, roundAlertsOff: true,
            facts: { uid: 'u-ivy', roundCode: 'ABC123', roundName: 'Saturday', netCents: 4000 }
        });
        assert.equal(d.send, true, 'the round switch silenced an essential: ' + d.reason);
    });
});
