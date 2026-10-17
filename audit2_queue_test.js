// ============================================================================
// THE OFFLINE QUEUE, AFTER THE INDEPENDENT AUDIT (mailbox 002, 2026-10-16: B1, B2, B4)
//   B2  the confirm of the first send removed a correction typed while it was in flight
//       (same id) - now each edit has a version and only the version sent is removed.
//   B1  a replay sent the value read when the drain STARTED and then removed the newer
//       correction - now each entry is re-read just before it is sent.
//   B4  opening any round replayed every round's old writes - now a drain takes only the
//       open round's (opts.only), and old ones wait for the golfer.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Q = require('./offline-queue.js');
function mem() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } }; }
const P = 'events/R1/scores/p1_h3';

test('B2: a correction typed while the first write is in flight survives that write\'s confirm', () => {
    const st = mem();
    const a = Q.enqueue(st, { path: P, type: 'set', value: 5, coalesceKey: P });
    const b = Q.enqueue(st, { path: P, type: 'set', value: 4, coalesceKey: P });   // the golfer corrects it
    assert.equal(a.id, b.id, 'the same box, the same entry');
    assert.notEqual(a.v, b.v, 'a new version per edit');
    Q.confirm(st, a.id, a.v);                                                      // the 5 lands
    const left = Q.peek(st);
    assert.equal(left.length, 1, 'the 4 is still waiting to be sent');
    assert.equal(left[0].value, 4);
    Q.confirm(st, b.id, b.v);
    assert.equal(Q.count(st), 0);
});

test('B1: a replay sends what is queued NOW, and a correction made during it is not lost', async () => {
    const st = mem();
    Q.enqueue(st, { path: P, type: 'set', value: 5, coalesceKey: P });
    Q.enqueue(st, { path: 'events/R1/scores/p2_h3', type: 'set', value: 6, coalesceKey: 'events/R1/scores/p2_h3' });
    const sent = [];
    let first = true;
    // The golfer corrects p1_h3 to 4 after the drain has started (before its turn) ...
    Q.enqueue(st, { path: P, type: 'set', value: 4, coalesceKey: P });
    const r = await Q.drain(st, (op) => {
        sent.push(op.path.split('/').pop() + '=' + op.value);
        // ... and p2_h3 to 7 WHILE its own write is in flight.
        if (op.path.endsWith('p2_h3') && first) { first = false; Q.enqueue(st, { path: op.path, type: 'set', value: 7, coalesceKey: op.path }); }
        return Promise.resolve();
    }, { timeoutMs: 0 });
    assert.deepEqual(sent, ['p1_h3=4', 'p2_h3=6'], 'the newest value of p1_h3, never the old 5');
    const left = Q.peek(st);
    assert.deepEqual(left.map((o) => o.path.split('/').pop() + '=' + o.value), ['p2_h3=7'], 'the in-flight correction is still queued');
    assert.equal(r.sent, 2);
});

test('B4: a drain sends only the open round\'s writes; others stay queued; old ones are found for the golfer', async () => {
    const st = mem();
    Q.enqueue(st, { path: 'events/OTHER/scores/p1_h1', type: 'set', value: 3, ts: Date.now() - 1000 });
    Q.enqueue(st, { path: 'events/R1/scores/p1_h1', type: 'set', value: 4 });
    Q.enqueue(st, { path: 'events/R1/scores/p1_h2', type: 'set', value: 5, ts: Date.now() - 7 * 3600 * 1000 });
    const own = (op) => op.path.indexOf('events/R1/') === 0;
    const fresh = (op) => own(op) && Number(op.ts) >= Date.now() - Q.STALE_MS;
    const sent = [];
    await Q.drain(st, (op) => { sent.push(op.path); return Promise.resolve(); }, { timeoutMs: 0, only: fresh });
    assert.deepEqual(sent, ['events/R1/scores/p1_h1']);
    assert.equal(Q.countFor(st, 'events/R1/'), 1, 'the 7-hour-old one waits');
    assert.equal(Q.countFor(st, 'events/OTHER/'), 1, 'another round\'s write is left for that round');
    assert.deepEqual(Q.staleFor(st, 'events/R1/').map((o) => o.path), ['events/R1/scores/p1_h2']);
});

test('the scorecard: one drain at a time, this round only, the version confirmed, a replayed score clears "verified"', () => {
    const f = path.join(__dirname, 'index.html');
    const s = fs.readFileSync(f, 'utf8');
    assert.match(s, /if \(draining\) \{ drainAgain = true; return Promise\.resolve\(null\); \}/);
    assert.ok(!/draining = false; drainQueue\(/.test(s), 'no reset of draining before a new drain');
    assert.match(s, /q\.confirm\(store, op\.id, op\.v\)/);
    assert.match(s, /\{ timeoutMs: 12000, only: only \}/);
    assert.match(s, /if \(touchedScores && r && r\.sent && typeof clearScoresVerified === 'function'\)/);
});

test('B3: two rounds\' KP answers for the same hole on one phone are two queue entries, both sent', () => {
    const st = mem();
    Q.enqueue(st, { path: 'events/AAA', type: 'update', value: { 'kpWinners/h3': '1' }, coalesceKey: 'kp:AAA:h3' });
    Q.enqueue(st, { path: 'events/BBB', type: 'update', value: { 'kpWinners/h3': '7' }, coalesceKey: 'kp:BBB:h3' });
    assert.equal(Q.count(st), 2);
    const s = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    assert.match(s, /'kp:' \+ currentMode \+ ':h' \+ hole/, 'the scorecard tags a KP with its round');
});
test('B5: a refused write is only ever this round\'s - the drain takes this round\'s writes only, so another round\'s refusal can never say "can\'t save" here', () => {
    const s = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    assert.match(s, /function ownOp\(op\) \{ return !!\(op && typeof op\.path === 'string' && currentMode && \(op\.path === 'events\/' \+ currentMode \|\| op\.path\.indexOf\(queuePrefix\(\)\) === 0\)\); \}/);
    assert.match(s, /var only = function \(op\) \{ return ownOp\(op\)/);
});

const GPS = fs.existsSync(path.join(__dirname, 'front-door.js'));
test('B9: a GPS quick-start round is one group of up to four - golfers added later join it, not a second group', { skip: GPS ? false : 'Consumer tree: no front-door.js' }, () => {
    const vm = require('vm');
    const ctx = {}; vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'grouping.js'), 'utf8'), ctx);
    const f = fs.readFileSync(path.join(__dirname, 'front-door.js'), 'utf8');
    const m = /groupSizeOverrides: (\{[^}]*\}), stablefordScoring/.exec(f);
    assert.ok(m, 'the quick-start payload names its groupSizeOverrides');
    const ov = vm.runInContext('(' + m[1] + ')', ctx);
    const four = vm.runInContext('computeGroupBoundaries(4, ' + JSON.stringify(ov) + ')', ctx);
    assert.equal(four.length, 1, 'the quick-start golfer plus three added: one group, not ' + JSON.stringify(four));
});

test('B8: the Join box takes a scorekeeper code (15 characters) and a pasted link', { skip: GPS ? false : 'Consumer tree: no home.html' }, () => {
    const h = fs.readFileSync(path.join(__dirname, 'home.html'), 'utf8');
    const m = /id="hp-code"[^>]*maxlength="(\d+)"/.exec(h);
    assert.ok(m && Number(m[1]) >= 15, 'maxlength ' + (m && m[1]));
});
