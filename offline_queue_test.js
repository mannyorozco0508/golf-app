// ============================================================================
// A SCORE ENTERED WITH NO SIGNAL IS NOT LOST (2026-10-06)
//
// MEASURED BEFORE ANY OF THIS WAS WRITTEN, with the repo's own vendored SDK
// against a socket that never answers (tools/offline-durability-audit.js):
//
//   (a) signal comes back, page still open   7 writes PENDING (0 resolved,
//       0 rejected) in persistentConnection_.outstandingPuts_, a plain
//       in-memory Array. They flush when the socket opens. NOTHING LOST.
//   (b) app closed and reopened, still offline   after a reload that array is
//       length 0, and the payload is in NO durable store - localStorage holds
//       only "firebase:host:..." and "firebase:previous_websocket_failure";
//       sessionStorage, IndexedDB and the Cache Storage are empty of it.
//       THE SEVEN SCORES ARE GONE.
//   (c) phone restarts   (b) with the oven off: same fresh heap, and
//       sessionStorage is cleared too. GONE.
//   and the round does not even OPEN with no signal: "Connecting to game...",
//       0 score boxes of 0, because RTDB on web has no on-disk read cache.
//
// This file is the queue that fixes (b) and (c). It is a PURE module - storage
// and the writer are passed in - so these tests drive the real logic rather
// than a page that happens to call it.
//
// WHAT A FAKE STORE PROVES AND WHAT IT DOES NOT. A Map stands in for
// localStorage here, which is honest for order, coalescing and confirmation
// because those are decisions about an array. It cannot prove the bytes survive
// the app closing - only a browser can - so that claim is made in Chrome by
// tools/airplane-mode-check.js, and this file asserts the module writes through
// a real Storage API shape rather than keeping state in a closure.
//
// BASELINE, measured over the FINISHED file against a STUB offline-queue.js
// whose every function returns undefined (restored by sha from a saved copy,
// never with git checkout): see the count beside the commit.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const Q = require('./offline-queue.js');

// A STORE THAT BEHAVES LIKE localStorage: string in, string out, and it keeps
// what it was given rather than a reference the module could mutate behind the
// test's back.
function store() {
    const m = new Map();
    return {
        getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
        setItem: (k, v) => { m.set(String(k), String(v)); },
        removeItem: (k) => { m.delete(String(k)); },
        get size() { return m.size; },
        raw: m
    };
}
const scorePath = (code, key) => 'events/' + code + '/scores/' + key;
const scoreOp = (code, key, val) => ({
    path: scorePath(code, key), type: val === null ? 'remove' : 'set', value: val,
    coalesceKey: scorePath(code, key)
});

describe('1. DURABLE, AND IN THE ORDER THE GOLFER TYPED', () => {

    test('an op is in storage the moment it is enqueued', () => {
        const s = store();
        Q.enqueue(s, scoreOp('AAA', 'p101_h1', 4));
        // IN STORAGE, not in a closure: a crash between enqueue and the network
        // write must cost a replay, never a score.
        const raw = s.getItem(Q.STORAGE_KEY);
        assert.ok(raw, 'nothing was written to storage');
        const parsed = JSON.parse(raw);
        assert.equal(parsed.length, 1);
        assert.equal(parsed[0].path, 'events/AAA/scores/p101_h1');
        assert.equal(parsed[0].value, 4);
    });

    test('seven holes queue as seven ops, in order', () => {
        const s = store();
        for (let h = 1; h <= 7; h++) Q.enqueue(s, scoreOp('AAA', 'p101_h' + h, 3 + h));
        const ops = Q.peek(s);
        assert.equal(ops.length, 7);
        assert.deepEqual(ops.map(o => o.value), [4, 5, 6, 7, 8, 9, 10]);
        assert.equal(Q.count(s), 7);
    });

    test('and a fresh module over the same storage sees them - which is the whole point', () => {
        const s = store();
        for (let h = 1; h <= 3; h++) Q.enqueue(s, scoreOp('AAA', 'p101_h' + h, 4));
        // THE RELOAD, in the only form a unit test can make it: nothing is read
        // from memory, everything is read back out of the store.
        const again = require('./offline-queue.js');
        assert.equal(again.count(s), 3, 'a reload found an empty queue - this is defect (b)');
        assert.equal(again.peek(s)[0].path, 'events/AAA/scores/p101_h1');
    });
});

describe('2. NEWEST EDIT WINS, AND IT STAYS WHERE IT WAS', () => {

    test('re-entering the same box replaces its queued value instead of adding a second', () => {
        const s = store();
        Q.enqueue(s, scoreOp('AAA', 'p101_h1', 5));
        Q.enqueue(s, scoreOp('AAA', 'p101_h2', 4));
        Q.enqueue(s, scoreOp('AAA', 'p101_h1', 6));     // the golfer fixes hole 1
        const ops = Q.peek(s);
        assert.equal(ops.length, 2, 'two writes to one box queued as two facts');
        assert.equal(ops[0].value, 6, 'the older value survived');
        // IN PLACE. Moving the corrected box to the end would let hole 2's older
        // edit land after hole 1's newer one.
        assert.equal(ops[0].path, 'events/AAA/scores/p101_h1');
        assert.equal(ops[1].path, 'events/AAA/scores/p101_h2');
    });

    test('clearing a box replaces the queued number with the removal', () => {
        const s = store();
        Q.enqueue(s, scoreOp('AAA', 'p101_h1', 5));
        Q.enqueue(s, scoreOp('AAA', 'p101_h1', null));
        const ops = Q.peek(s);
        assert.equal(ops.length, 1);
        assert.equal(ops[0].type, 'remove');
    });

    test('but a press is not an edit of a press: no coalesceKey, no merging', () => {
        const s = store();
        // Each press carries its OWN path including the push key, which is also
        // what makes a replay idempotent.
        Q.enqueue(s, { path: 'events/AAA/matchPresses/k1', type: 'set', value: { startHole: 4 } });
        Q.enqueue(s, { path: 'events/AAA/matchPresses/k2', type: 'set', value: { startHole: 7 } });
        assert.equal(Q.count(s), 2, 'two presses collapsed into one');
    });
});

describe('3. AN OP LEAVES THE QUEUE ONLY WHEN THE SERVER SAYS SO', () => {

    test('a resolved write confirms it; the queue empties', async () => {
        const s = store();
        for (let h = 1; h <= 3; h++) Q.enqueue(s, scoreOp('AAA', 'p101_h' + h, 4));
        const seen = [];
        const r = await Q.drain(s, (op) => { seen.push(op.path); return Promise.resolve(); });
        assert.equal(r.sent, 3);
        assert.equal(Q.count(s), 0, 'confirmed ops are still queued');
        assert.deepEqual(seen, ['events/AAA/scores/p101_h1', 'events/AAA/scores/p101_h2',
                                'events/AAA/scores/p101_h3'], 'replayed out of order');
    });

    test('A WRITE THAT NEVER SETTLES KEEPS ITS OP - which is what offline looks like', async () => {
        const s = store();
        Q.enqueue(s, scoreOp('AAA', 'p101_h1', 4));
        // The SDK's offline behaviour, measured: neither resolved nor rejected.
        let settled = false;
        const r = await Promise.race([
            Q.drain(s, () => new Promise(() => {})).then(() => { settled = true; }),
            new Promise(res => setTimeout(() => res('still draining'), 120))
        ]);
        assert.equal(r, 'still draining');
        assert.equal(settled, false);
        assert.equal(Q.count(s), 1, 'the op was dropped while the write was still in flight');
    });

    test('an outage stops the drain AND KEEPS THE ORDER: nothing behind it is sent', async () => {
        const s = store();
        for (let h = 1; h <= 4; h++) Q.enqueue(s, scoreOp('AAA', 'p101_h' + h, 4));
        const seen = [];
        const r = await Q.drain(s, (op) => {
            seen.push(op.path);
            return /h2$/.test(op.path) ? Promise.reject(new Error('network')) : Promise.resolve();
        });
        assert.equal(r.sent, 1);
        assert.ok(r.stoppedOn && /h2$/.test(r.stoppedOn.path), JSON.stringify(r));
        assert.equal(seen.length, 2, 'it carried on past the failure and reordered the round');
        assert.equal(Q.count(s), 3, 'the failed op and the two behind it must stay queued');
        assert.equal(Q.peek(s)[0].path, 'events/AAA/scores/p101_h2');
    });

    test('a PERMANENT refusal is dropped rather than blocking every score behind it', async () => {
        const s = store();
        Q.enqueue(s, scoreOp('AAA', 'p101_h1', 4));
        Q.enqueue(s, scoreOp('AAA', 'p101_h2', 5));
        const err = new Error('PERMISSION_DENIED: Permission denied');
        const r = await Q.drain(s, (op) => /h1$/.test(op.path) ? Promise.reject(err) : Promise.resolve());
        assert.equal(r.dropped, 1);
        assert.equal(r.sent, 1, 'the score behind the refusal never went');
        assert.equal(Q.count(s), 0);
        assert.match(String(r.droppedReason), /PERMISSION_DENIED/);
        // AND THE TELLING APART IS THE WHOLE POINT: an outage is not a refusal.
        assert.equal(Q.isPermanent(new Error('network error')), false);
        assert.equal(Q.isPermanent(new Error('PERMISSION_DENIED')), true);
    });

    test('A WRITE THAT NEVER SETTLES IS ABANDONED, AND THE OP STAYS - the bug that cost the feature', async () => {
        // MEASURED END TO END before this existed: a drain that starts while the
        // socket is still down issues ONE write, that write never settles, and
        // the drain waits on it for the life of the page. The stand-in database
        // recorded exactly one write, the queue stayed at 7, and the badge stayed
        // on "Sending..." - so no later drain could ever start.
        const s = store();
        for (let h = 1; h <= 3; h++) Q.enqueue(s, scoreOp('AAA', 'p101_h' + h, 4));
        const issued = [];
        const r = await Q.drain(s, (op) => { issued.push(op.path); return new Promise(() => {}); },
                                { timeoutMs: 150 });
        assert.equal(issued.length, 1, 'it issued more than one write into a dead socket');
        assert.equal(r.sent, 0);
        assert.equal(r.dropped, 0, 'a timeout is not a refusal - the score must not be dropped');
        assert.ok(r.stoppedOn && /did not settle/.test(r.stoppedOn.reason), JSON.stringify(r));
        assert.equal(Q.count(s), 3, 'the queue lost an op to a write that never landed');
        // AND THE DRAIN RETURNED, which is the whole point: the caller can try again.
        assert.equal(Q.isPermanent({ code: 'queue_timeout' }), false);
    });

    test('and a write that settles inside the timeout is confirmed as normal', async () => {
        const s = store();
        Q.enqueue(s, scoreOp('AAA', 'p101_h1', 4));
        const r = await Q.drain(s, () => new Promise(res => setTimeout(res, 40)), { timeoutMs: 400 });
        assert.equal(r.sent, 1);
        assert.equal(Q.count(s), 0);
    });

    test('a writer that throws synchronously is an outage, not a crash', async () => {
        const s = store();
        Q.enqueue(s, scoreOp('AAA', 'p101_h1', 4));
        const r = await Q.drain(s, () => { throw new Error('db is not defined'); });
        assert.equal(r.sent, 0);
        assert.equal(Q.count(s), 1, 'the op was lost when the writer threw');
    });
});

describe('4. THE ROUND OPENS, AND IT SHOWS THE GOLFER THEIR OWN WORK', () => {

    const ROUND = { eventName: 'Sat', courseName: 'Dobson', players: [{ id: 101, name: 'Ann' }],
                    scores: { p101_h1: 4 }, gameFormat: 'stroke' };

    test('the last round we saw is kept, and read back after a reload', () => {
        const s = store();
        assert.equal(Q.saveSnapshot(s, 'aaa', ROUND), true);
        const got = Q.loadSnapshot(s, 'AAA');   // the code is upper-cased both ways
        assert.ok(got, 'nothing came back');
        assert.equal(got.data.courseName, 'Dobson');
        assert.ok(got.at > 0, 'no timestamp, so the page cannot say how old it is');
        assert.equal(Q.loadSnapshot(s, 'BBB'), null, 'another round came back from this one');
    });

    test('AND THE QUEUE IS LAID ON TOP: the golfer sees the scores they just typed', () => {
        const s = store();
        Q.enqueue(s, scoreOp('AAA', 'p101_h2', 5));
        Q.enqueue(s, scoreOp('AAA', 'p101_h3', 6));
        const shown = Q.applyQueued(ROUND, Q.peek(s), 'AAA');
        assert.equal(shown.scores.p101_h1, 4, 'the stored round was lost');
        assert.equal(shown.scores.p101_h2, 5, 'the queued score is missing from the card');
        assert.equal(shown.scores.p101_h3, 6);
        // AND THE SNAPSHOT IS NOT MUTATED: it is what the server said, and it has
        // to stay that way or a replay would be measured against its own output.
        assert.equal(ROUND.scores.p101_h2, undefined, 'applyQueued mutated the snapshot');
    });

    test('a queued removal clears the box on the card too', () => {
        const s = store();
        Q.enqueue(s, scoreOp('AAA', 'p101_h1', null));
        const shown = Q.applyQueued(ROUND, Q.peek(s), 'AAA');
        assert.equal(shown.scores.p101_h1, undefined, 'a cleared box still shows its old number');
    });

    test('A KP ANSWER IS ONE ROOT UPDATE, and it shows on the card', () => {
        // The app writes a KP as ONE update() at events/<code> carrying
        // kpLeaders/hN and kpWinners/hN together, so a refusal cannot leave half
        // of it. applyQueued skipped that shape at first - the path has nothing
        // after the code - so a KP answered with no signal was in the queue and
        // invisible on the card, which is how a group answers it twice.
        const s = store();
        Q.enqueue(s, { path: 'events/AAA', type: 'update', coalesceKey: 'kp:h3',
            value: { 'kpLeaders/h3': { playerId: '101', distanceInches: 42 },
                     'kpWinners/h3': '101' } });
        const shown = Q.applyQueued(ROUND, Q.peek(s), 'AAA');
        assert.equal(shown.kpWinners.h3, '101', 'the queued KP winner is not on the card');
        assert.equal(shown.kpLeaders.h3.distanceInches, 42);
        assert.equal(shown.scores.p101_h1, 4, 'the stored round was lost');
    });

    test('and answering the same hole again replaces it, newest wins', () => {
        const s = store();
        const kp = (pid) => ({ path: 'events/AAA', type: 'update', coalesceKey: 'kp:h3',
            value: { 'kpLeaders/h3': { playerId: pid }, 'kpWinners/h3': pid } });
        Q.enqueue(s, kp('101'));
        Q.enqueue(s, kp('102'));
        assert.equal(Q.count(s), 1, 'two answers to one hole queued as two facts');
        assert.equal(Q.applyQueued(ROUND, Q.peek(s), 'AAA').kpWinners.h3, '102');
    });

    test('an op for ANOTHER round is never laid on this one', () => {
        const s = store();
        Q.enqueue(s, scoreOp('BBB', 'p101_h9', 9));
        const shown = Q.applyQueued(ROUND, Q.peek(s), 'AAA');
        assert.equal(shown.scores.p101_h9, undefined, 'another round’s score is on this card');
    });

    test('an update op merges, and a null inside it deletes that key', () => {
        const s = store();
        Q.enqueue(s, { path: 'events/AAA/kpWinners', type: 'update', value: { h3: '101', h7: null } });
        const base = Object.assign({}, ROUND, { kpWinners: { h3: '999', h7: '101', h12: '101' } });
        const shown = Q.applyQueued(base, Q.peek(s), 'AAA');
        assert.equal(shown.kpWinners.h3, '101', 'the KP answer did not apply');
        assert.equal(shown.kpWinners.h7, undefined, 'a null inside an update did not delete');
        assert.equal(shown.kpWinners.h12, '101', 'an untouched key was dropped');
    });
});

describe('5. AND IT NEVER FRIGHTENS SOMEBODY WHOSE SCORES ARE SAFE', () => {

    test('the three states say what is true', () => {
        assert.equal(Q.badge({ waiting: 0 }).kind, 'synced');
        assert.match(Q.badge({ waiting: 0 }).text, /✓ Synced/);
        const q = Q.badge({ waiting: 7 });
        assert.equal(q.kind, 'queued');
        assert.match(q.text, /Saved on this phone/);
        assert.match(q.text, /7 waiting/);
        assert.match(q.text, /will send when you have signal/);
        assert.equal(Q.badge({ waiting: 3, sending: true }).kind, 'sending');
    });

    test('AND NOT ONE OF THEM CALLS A QUEUED SCORE AN ERROR', () => {
        [{ waiting: 1 }, { waiting: 18 }, { waiting: 2, sending: true }].forEach((st) => {
            const t = Q.badge(st).text;
            assert.doesNotMatch(t, /error|fail|failed|lost|could not|couldn’t|problem/i,
                'a queued score is described as a failure: ' + t);
        });
    });

    test('a refusal IS worth a warning, because that one will not fix itself', () => {
        const b = Q.badge({ waiting: 0, dropped: 2 });
        assert.equal(b.kind, 'refused');
        assert.match(b.text, /refused/);
        assert.match(b.text, /re-enter/);
    });
});

describe('6. IT SHIPS, AND IT CANNOT TAKE THE ROUND DOWN WITH IT', () => {

    const SRC = fs.readFileSync(path.join(__dirname, 'offline-queue.js'), 'utf8');

    test('no DOM, no Firebase, no top-level const', () => {
        const code = SRC.replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
        ['document.', 'db.ref', 'firebase.', 'localStorage'].forEach((bad) =>
            assert.ok(!code.includes(bad),
                'offline-queue.js touches ' + bad + ' - the page owns the storage and the DOM'));
        assert.doesNotMatch(SRC, /^\s*const [A-Za-z]/m, 'a top-level const collides with the pages');
    });

    test('a storage that throws does not stop the write going out', () => {
        const angry = { getItem: () => { throw new Error('nope'); },
                        setItem: () => { throw new Error('quota'); } };
        assert.doesNotThrow(() => Q.enqueue(angry, scoreOp('AAA', 'p101_h1', 4)));
        assert.deepEqual(Q.peek(angry), [], 'an unreadable queue must read as empty, not throw');
        assert.equal(Q.count(angry), 0);
    });

    test('corrupt storage reads as empty rather than taking the page down', () => {
        const s = store();
        s.setItem(Q.STORAGE_KEY, '{not json');
        assert.deepEqual(Q.peek(s), []);
        s.setItem(Q.STORAGE_KEY, '{"notAnArray":true}');
        assert.deepEqual(Q.peek(s), []);
    });

    test('it is in the shell and in SHARED_SHELL, or an installed phone never gets it', () => {
        assert.match(fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8'), /'\.\/offline-queue\.js'/);
        const shared = /const SHARED_SHELL = \[([\s\S]*?)\];/
            .exec(fs.readFileSync(path.join(__dirname, 'sync-mobile-web.js'), 'utf8'));
        assert.ok(shared && /'offline-queue\.js'/.test(shared[1]), 'not in SHARED_SHELL');
    });
});
