// ============================================================================
// PUSH NOTIFICATIONS, THE PURE HALF (Wave 39)
//
// WHAT THIS GUARDS AND WHAT IT DELIBERATELY DOES NOT. push-notify.js decides
// what to say, to whom, and how often. It sends nothing: no DOM, no db, no FCM
// credential, no network call. So everything here is testable in plain node, and
// the one piece of this feature that will hold a service-account key stays a
// Cloudflare Function with no product logic in it.
//
// NOT GUARDED HERE, because none of it exists yet and two of them need Manny:
//   - the device-token store (a database.rules.json delta, STRICT)
//   - the sender and its FCM credential (a Pages secret Manny creates)
//   - the Capacitor plugin and the APNs key (an Xcode capability and a key)
//   - the tee-time field, which the recon found DOES NOT EXIST on a round
//
// THE RECON FINDING THIS FILE IS BUILT AROUND. `teeTime` appears nowhere in
// admin.html, index.html or database.rules.json. A round carries `roundDay` - a
// LABEL, "Single Round" - and `createdAt`, which is when it was made. So
// notifications 1 and 2 have nothing to quote and nothing to schedule against.
// pushDecide REFUSES them with reason 'no-tee-time' rather than inventing a
// time, and that refusal is tested, because the alternative is a notification
// that tells a group to be somewhere at a time nobody set.
//
// BASELINE. Against pre-build main (a9fbf8d) this file cannot report per-test:
// push-notify.js does not exist, the require throws at load, and node reports the
// FILE as one failing test - which proves nothing per assertion.
//
// MEASURED with a stub in place - all eleven exported functions present and
// returning undefined, the constants present and empty - over the FINISHED file,
// all 27 tests: 2 PASS / 25 FAIL. The module was restored from a saved copy by
// sha (3917c94ed9fc), never with git restore.
//
//   BOTH PASSES ARE INERT AGAINST THE STUB AND I AM NOT GOING TO DRESS THEM UP:
//     - "the dedupe key is derived from the EVENT, never from the clock" passes
//       because undefined === undefined and /\d{10}/ does not match undefined.
//       It is a real guard against a key with a timestamp in it, and it was
//       satisfied by a function that returns nothing.
//     - "PURE: no DOM, no db, no fetch, no credential" is a scan of the stub's
//       own source, which of course contains none of those.
//
//   The 25 reds are every rule in the file: the channel table, essentials being
//   unsilenceable, all six sentences, the hype vocabulary, the streak
//   definition, the throttle in all four of its cases, the dedupe refusal, the
//   tee-time refusal and the reminder window.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const P = require('./push-notify.js');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

const SIX = ['youre-in', 'tee-reminder', 'final-results', 'bet-challenge', 'press-offered', 'hype'];
const base = (over) => Object.assign({
    kind: 'final-results',
    tokens: ['tok-1'],
    prefs: {},
    facts: { uid: 'u-1', roundCode: 'GFLBAM', roundName: 'Saturday at Legacy', netCents: 4000 },
    alreadySent: {}, buzzedHoles: {}, now: 0
}, over || {});

// ===========================================================================
describe('1. SIX NOTIFICATIONS, THREE CHANNELS, AND ESSENTIALS CANNOT BE SILENCED', () => {

    test('every export is a function, and the six kinds are the six briefed', () => {
        ['pushChannelOf', 'pushPrefsNormalise', 'pushAllowed', 'pushCopy', 'pushHypeFor',
         'pushDedupeKey', 'pushThrottleKey', 'pushDecide'].forEach((n) => {
            assert.equal(typeof P[n], 'function', 'push-notify.js must export ' + n);
        });
        assert.deepEqual(Object.keys(P.PUSH_KIND_CHANNEL).sort(), SIX.slice().sort());
    });

    test('1-3 are essentials, 4-5 are bets, 6 is hype', () => {
        assert.equal(P.pushChannelOf('youre-in'), 'essentials');
        assert.equal(P.pushChannelOf('tee-reminder'), 'essentials');
        assert.equal(P.pushChannelOf('final-results'), 'essentials');
        assert.equal(P.pushChannelOf('bet-challenge'), 'bets');
        assert.equal(P.pushChannelOf('press-offered'), 'bets');
        assert.equal(P.pushChannelOf('hype'), 'hype');
        assert.equal(P.pushChannelOf('made-up'), null);
    });

    test('ESSENTIALS STAY ON however the settings are stored, including a stored false', () => {
        // A stored `false` here could only come from a bug or a hand edit, and
        // the cost of honouring it is a golfer who never finds out what they owe.
        [undefined, null, {}, { essentials: false }, { essentials: 0 }, 'nonsense', []].forEach((raw) => {
            assert.equal(P.pushPrefsNormalise(raw).essentials, true, JSON.stringify(raw));
            assert.equal(P.pushAllowed('final-results', raw), true, JSON.stringify(raw));
        });
    });

    test('bets and hype are opt-OUT: on by default, off when turned off', () => {
        assert.deepEqual(P.pushPrefsNormalise({}), { essentials: true, bets: true, hype: true });
        assert.equal(P.pushAllowed('bet-challenge', { bets: false }), false);
        assert.equal(P.pushAllowed('press-offered', { bets: false }), false);
        assert.equal(P.pushAllowed('hype', { hype: false }), false);
        assert.equal(P.pushAllowed('hype', { bets: false }), true, 'the two switches are independent');
    });
});

// ===========================================================================
describe('2. THE COPY IS THE BRIEF\'S COPY', () => {

    test('"You\'re in" quotes the round, the date and the tee time', () => {
        const c = P.pushCopy('youre-in', {
            roundName: 'Saturday at Legacy', dateText: 'Sat 4 Oct', teeTimeText: '8:40 AM'
        });
        assert.equal(c.body, 'Saturday at Legacy, Sat 4 Oct 8:40 AM');
    });

    test('the final result is ADDRESSED TO THE READER, and signed', () => {
        assert.match(P.pushCopy('final-results', { netCents: 4000 }).body, /you won \$40$/);
        assert.match(P.pushCopy('final-results', { netCents: -2500 }).body, /you owe \$25$/);
        // ZERO IS ITS OWN OUTCOME. "you won $0" reads as a bug - this app has
        // already paid for a bare $0 with no explanation on the side-match card.
        const even = P.pushCopy('final-results', { netCents: 0 }).body;
        assert.match(even, /even/);
        assert.ok(!/\$0/.test(even), 'a $0 with no explanation is what sends somebody hunting for a bug');
    });

    test('money is grouped with thousands separators, like every other figure in the app', () => {
        assert.equal(P.pushMoneyText(150000), '$1,500');
        assert.equal(P.pushMoneyText(-2550), '$25.50');
    });

    test('a challenge and a press OFFER ACTIONS - accept and decline, in that order', () => {
        const c = P.pushCopy('bet-challenge', { fromName: 'Jimmy', stakeCents: 2000, formatLabel: 'Nassau' });
        assert.equal(c.body, 'Jimmy challenged you: $20 Nassau');
        assert.deepEqual(c.actions, ['accept', 'decline']);
        assert.deepEqual(P.pushCopy('press-offered', { fromName: 'Jimmy', offerLabel: '$20 on the back nine' }).actions,
            ['accept', 'decline']);
    });

    test('a nameless sender still produces a sentence, never "undefined challenged you"', () => {
        assert.match(P.pushCopy('bet-challenge', {}).body, /^Someone challenged you/);
        assert.ok(!/undefined|null/.test(P.pushCopy('press-offered', {}).body));
    });
});

// ===========================================================================
describe('3. HYPE NEVER REVEALS STANDINGS', () => {

    // The one rule on notification 6, and it is the rule most easily broken by a
    // later "make it more exciting" edit. Held against a vocabulary rather than
    // against one example.
    const BANNED = [/\$/, /\bwon\b/i, /\bowes?\b/i, /\blead(ing|s|er)?\b/i, /\b1st\b/,
                    /\bup\b/i, /\bdown\b/i, /\bnet\b/i, /\btotal\b/i];

    test('no hype sentence carries money, a position, or a margin', () => {
        [{ hype: 'ace', playerName: 'Marty', hole: 7 },
         { hype: 'eagle', playerName: 'Dee', hole: 12 },
         { hype: 'streak', playerName: 'Reese', hole: 9 }].forEach((f) => {
            const c = P.pushCopy('hype', f);
            const whole = c.title + ' ' + c.body;
            BANNED.forEach((re) => assert.ok(!re.test(whole),
                'hype copy leaked a standing: ' + JSON.stringify(whole) + ' matched ' + re));
            assert.ok(c.body.length > 8, 'and it still says something');
        });
    });

    test('an ace outranks an eagle outranks a streak - ONE buzz per hole, the best one', () => {
        const marks = { 5: 'birdie', 6: 'birdie', 7: 'eagle' };
        assert.deepEqual(P.pushHypeFor(marks, 7, 1), { hype: 'ace', hole: 7 }, 'one stroke is an ace');
        assert.deepEqual(P.pushHypeFor(marks, 7, 3), { hype: 'eagle', hole: 7 });
    });

    test('a STREAK is three birdies in five holes, counted on the marks the card already draws', () => {
        // score-marks.js decides what a birdie is - gross, against par - so a
        // birdie means here exactly what the red circle means. Nothing re-derives par.
        assert.deepEqual(P.pushHypeFor({ 3: 'birdie', 5: 'birdie', 7: 'birdie' }, 7, 3), { hype: 'streak', hole: 7 });
        assert.equal(P.pushHypeFor({ 1: 'birdie', 2: 'birdie', 7: 'birdie' }, 7, 3), null,
            'two of them are six and five holes back - that is not a streak');
        assert.equal(P.pushHypeFor({ 6: 'birdie', 7: 'birdie' }, 7, 3), null, 'two is not three');
    });

    test('the streak fires on the hole that COMPLETED it, and a flat hole fires nothing', () => {
        const marks = { 5: 'birdie', 6: 'birdie', 7: 'birdie', 8: '' };
        assert.deepEqual(P.pushHypeFor(marks, 7, 3), { hype: 'streak', hole: 7 });
        assert.equal(P.pushHypeFor(marks, 8, 4), null,
            'announcing the same run again on the next hole is how one good stretch becomes four buzzes');
        assert.equal(P.pushHypeFor({}, 0, 4), null);
        assert.equal(P.pushHypeFor(null, 5, 4), null);
    });
});

// ===========================================================================
describe('4. ONE BUZZ PER HOLE - AND NEVER AT AN ESSENTIAL\'S EXPENSE', () => {

    test('a second hole-scoped notification on the same hole is throttled', () => {
        const facts = { uid: 'u-1', roundCode: 'GFLBAM', hole: 7, hype: 'eagle', playerName: 'Dee' };
        const first = P.pushDecide(base({ kind: 'hype', facts }));
        assert.equal(first.send, true, first.reason);
        const second = P.pushDecide(base({
            kind: 'hype', facts: Object.assign({}, facts, { hype: 'streak' }),
            buzzedHoles: { [first.throttleKey]: true }
        }));
        assert.equal(second.send, false);
        assert.equal(second.reason, 'throttled');
    });

    test('THE NEXT HOLE IS A NEW BUZZ - the throttle is per hole, not per round', () => {
        const f7 = { uid: 'u-1', roundCode: 'GFLBAM', hole: 7, hype: 'eagle', playerName: 'Dee' };
        const used = { [P.pushThrottleKey('GFLBAM', 'u-1', 7)]: true };
        const next = P.pushDecide(base({
            kind: 'hype', facts: Object.assign({}, f7, { hole: 8 }), buzzedHoles: used
        }));
        assert.equal(next.send, true, next.reason);
    });

    test('A FINAL RESULT IS NEVER THROTTLED, whatever the hole already cost', () => {
        // The failure this prevents: a hype message got there first and a golfer
        // never found out what they owed. Essentials are not hole-scoped, so the
        // throttle branch cannot reach them - that is the table doing the work,
        // not a condition.
        const every = {};
        for (let h = 1; h <= 18; h++) every[P.pushThrottleKey('GFLBAM', 'u-1', h)] = true;
        const r = P.pushDecide(base({ buzzedHoles: every }));
        assert.equal(r.send, true, r.reason);
        assert.equal(r.throttleKey, null, 'an essential must not even claim a hole\'s buzz');
    });

    test('the throttle is PER GOLFER - one person\'s buzz does not silence another\'s', () => {
        const used = { [P.pushThrottleKey('GFLBAM', 'u-1', 7)]: true };
        const other = P.pushDecide(base({
            kind: 'hype', facts: { uid: 'u-2', roundCode: 'GFLBAM', hole: 7, hype: 'eagle', playerName: 'Dee' },
            buzzedHoles: used
        }));
        assert.equal(other.send, true, other.reason);
    });
});

// ===========================================================================
describe('5. THE SAME EVENT IS NEVER SENT TWICE', () => {

    test('the dedupe key is derived from the EVENT, never from the clock', () => {
        const f = { uid: 'u-1', roundCode: 'GFLBAM', hole: 7, hype: 'eagle' };
        assert.equal(P.pushDedupeKey('hype', f), P.pushDedupeKey('hype', f),
            'a key that changes between calls cannot stop a retry');
        assert.ok(!/\d{10}/.test(P.pushDedupeKey('hype', f)), 'no timestamp in the key');
    });

    test('a recorded key refuses the repeat', () => {
        const first = P.pushDecide(base());
        assert.equal(first.send, true, first.reason);
        const again = P.pushDecide(base({ alreadySent: { [first.dedupeKey]: true } }));
        assert.equal(again.send, false);
        assert.equal(again.reason, 'already-sent');
    });

    test('two presses on ONE hole are two different things to accept', () => {
        const a = P.pushDedupeKey('press-offered', { uid: 'u-1', roundCode: 'G', hole: 7, offerId: 'p1' });
        const b = P.pushDedupeKey('press-offered', { uid: 'u-1', roundCode: 'G', hole: 7, offerId: 'p2' });
        assert.notEqual(a, b, 'collapsing them would silently drop a real money decision');
    });

    test('ONE PERSON WITH TWO PHONES IS NOT DEDUPED - both buzz, deliberately', () => {
        const r = P.pushDecide(base({ tokens: ['phone', 'watch'] }));
        assert.equal(r.send, true);
        assert.equal(r.dedupeKey, P.pushDecide(base({ tokens: ['phone'] })).dedupeKey,
            'the key is per PERSON per event, so the sender fans out to every token that '
            + 'person registered - silently picking one device is a notification that did '
            + 'not arrive on the one they were looking at');
    });
});

// ===========================================================================
describe('6. THE TEE TIME A ROUND DOES NOT HAVE YET', () => {

    test('WITHOUT A TEE TIME, 1 and 2 REFUSE - they never invent one', () => {
        // MEASURED: `teeTime` is in no page and in no rule. A round carries
        // roundDay, which is a label, and createdAt, which is when it was made.
        ['youre-in', 'tee-reminder'].forEach((kind) => {
            const r = P.pushDecide(base({ kind, facts: { uid: 'u-1', roundCode: 'G', roundName: 'Sat' } }));
            assert.equal(r.send, false, kind);
            assert.equal(r.reason, 'no-tee-time',
                kind + ' must refuse rather than send a time nobody set');
        });
    });

    test('with one, the reminder fires 30 minutes before and NOT a minute earlier', () => {
        const tee = Date.UTC(2026, 9, 4, 15, 40);
        const facts = { uid: 'u-1', roundCode: 'G', roundName: 'Sat', teeTimeText: '8:40 AM', teeTimeMs: tee };
        const at = (ms) => P.pushDecide(base({ kind: 'tee-reminder', facts, now: ms }));
        assert.equal(at(tee - 31 * 60000).reason, 'too-early');
        assert.equal(at(tee - 30 * 60000).send, true, 'exactly 30 minutes is the moment');
        assert.equal(at(tee - 20 * 60000).send, true, 'a scheduler that runs every quarter hour');
        assert.equal(at(tee - 5 * 60000).send, true, 'still useful to somebody in the car park');
        // THE WINDOW'S LATE EDGE IS MEASURED FROM THE TEE TIME, not from the fire
        // point. A first version put a ten-minute grace on the fire point, making
        // the window [tee-30, tee-20] - which a cron running every fifteen
        // minutes can miss entirely, so the reminder would never arrive at all.
        assert.equal(at(tee - 4 * 60000).reason, 'too-late');
    });

    test('A MISSED SLOT IS NOT SENT LATE - "tee time in 30 minutes" after they teed off is worse than silence', () => {
        const tee = Date.UTC(2026, 9, 4, 15, 40);
        const facts = { uid: 'u-1', roundCode: 'G', roundName: 'Sat', teeTimeText: '8:40 AM', teeTimeMs: tee };
        const late = P.pushDecide(base({ kind: 'tee-reminder', facts, now: tee + 60 * 60000 }));
        assert.equal(late.send, false);
        assert.equal(late.reason, 'too-late');
    });
});

// ===========================================================================
describe('7. NOTHING IS SENT WITHOUT A RECIPIENT, A DEVICE AND A SENTENCE', () => {

    test('no uid, no token, an unknown kind and a channel that is off all refuse by name', () => {
        assert.equal(P.pushDecide(base({ facts: { roundCode: 'G' } })).reason, 'no-recipient');
        assert.equal(P.pushDecide(base({ tokens: [] })).reason, 'no-device');
        assert.equal(P.pushDecide(base({ kind: 'made-up' })).reason, 'unknown-kind');
        assert.equal(P.pushDecide(base({ kind: 'hype', prefs: { hype: false },
            facts: { uid: 'u-1', roundCode: 'G', hole: 3, hype: 'eagle' } })).reason, 'channel-off');
    });

    test('A SEND SAYS WHY TOO, so a log can be read afterwards', () => {
        const r = P.pushDecide(base());
        assert.equal(r.reason, 'ok');
        assert.equal(r.channel, 'essentials');
        assert.ok(r.copy && r.copy.title && r.copy.body);
    });

    test('PURE: no DOM, no db, no fetch, no credential anywhere in the module', () => {
        const m = read('push-notify.js').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ').replace(/\/\*[\s\S]*?\*\//g, ' ');
        ['document.', 'window.', 'firebase.', 'localStorage', 'fetch(', 'Authorization', 'serviceAccount']
            .forEach((bad) => assert.ok(!m.includes(bad),
                'push-notify.js touches ' + bad + '. It decides and says nothing - the sender is '
                + 'a Cloudflare Function with no product logic in it, which is what keeps the '
                + 'service-account key away from everything in this file.'));
        assert.doesNotMatch(read('push-notify.js'), /^\s*const push/m,
            'a const here collides with any page that re-declares the name');
    });
});
