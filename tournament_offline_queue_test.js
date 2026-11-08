// ============================================================================
// THE TOURNAMENT SCORECARD KEEPS A SCORE THROUGH A CLOSED TAB (2026-11-07)
//
// tournament-scorecard.html wrote each score straight to Firebase. The SDK's
// queue of unsent writes is in memory only, so a golfer who typed three holes
// with no signal and then closed the tab (or the app, or the phone died) lost
// all three. Every score write now goes to a queue in this phone's storage
// FIRST (offline-queue.js, unmodified, filed under this product's own key),
// is removed only when the server confirms it, and is replayed in order when
// the card next opens or the socket comes back.
//
// HOW THIS FILE REACHES IT. Every test arrives the way a golfer does: the
// page loads from its own URL, the page's own listener receives the round, a
// score is "typed" by running the onchange handler the card itself rendered
// into #holes-list (never by calling saveHoleScore by name), and a RELOAD is a
// brand-new realm seeded with nothing but what the first realm left in
// localStorage. The network is the stand-in db: offline = a write that never
// settles (what the real SDK does with no signal, measured in
// tools/offline-durability-audit.js), a refusal = PERMISSION_DENIED.
//
// WHAT THE HARNESS CANNOT PROVE, said plainly:
//   - mini-dom has no <template>.content, which the card's render uses to
//     patch values in place. A minimal stand-in (content.querySelectorAll ->
//     []) is installed so the FIRST render lays its markup into #holes-list;
//     nothing here measures the in-place patch path.
//   - a realm is not a browser restart, and the stand-in db is not the rules.
//     tools/tournament-offline-queue-check.js is the other half: the real page,
//     the real SDK, the database emulator with the LIVE+lock rules, a second
//     Chrome process over the same profile directory.
//
// COUNTS (final run of this final file): 17 tests.
//   Against this branch:                          17 pass / 0 fail.
//   BASELINE against 1fb1ef43 (tournament-scorecard.html sha256 a18e5dbfa18c403b...,
//   the page before this wave, swapped in and restored by sha):
//                                                  5 pass / 12 fail = 17.
//   The 5 that pass on the old page: the touch-nothing arrival, the live keyed
//   write, the live refusal, "a confirmed score is never replayed" and "the
//   other product's queue is untouched". The last three hold trivially for a
//   page with no queue at all; controls 2, 4 and 7 below are what show they
//   bite on this one.
//
// NEGATIVE CONTROLS (each mutated the wave page, sha 13525961d9454a63...,
// ran this file, then restored it by copying the saved file back; every one
// printed RESTORED-OK 13525961d9454a63):
//   1. durableScoreWrite enqueues nothing                  -> 12 fail / 5 pass
//   2. no confirm when the live write lands                -> 1 fail
//   3. keyed op stores t: Date.now() and replays it        -> 3 fail
//   4. a live permanent refusal is not dropped             -> 1 fail
//   5. the drain's own-card filter (`only`) removed        -> 1 fail
//   6. the drain's roundLocked gate removed                -> 1 fail
//   7. the store hands back raw localStorage (shared key)  -> 8 fail (7 of
//      them because these tests read the page's own key; the one about the
//      other product's queue is the one that matters)
//   8. a dropped replay no longer shows the refusal        -> 1 fail
// Controls 1 and 3 were also run against tools/tournament-offline-queue-check.js
// (real SDK, LIVE+lock rules): both FAIL - with a stored numeric t the rules
// refused every replay and the server held nothing.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

const PAGE = 'tournament-scorecard.html';
const QKEY = 'rattle_tournament_scores_wq_v1';
const CONSUMER_KEY = 'golfapp_wq_v1';
const TS = { '.sv': 'timestamp' };
const K1 = 'a'.repeat(32), K2 = 'b'.repeat(32);
const REFUSED = "⚠️ Not saved — this link can't score this card. Ask the organizer for your team's link.";
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const clone = (o) => JSON.parse(JSON.stringify(o));
const settle = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

function teamEvent() {
    return { name: 'Queue Day', format: 'scramble', courseName: 'C', courseData: COURSE, createdAt: 1,
        teams: { team1: { num: 1, name: 'Eagles', players: ['Ann'], handicap: 0 }, team2: { num: 2, name: 'Hawks', players: ['Bo'], handicap: 0 } } };
}
function groupEvent(status) {
    const r = { name: 'Medal', format: 'individual', scoringModel: 'player-v1', courseName: 'C', courseData: COURSE, createdAt: 1,
        players: { pann: { id: 'pann', name: 'Ann Lee', handicap: '0' } }, scoringGroups: {} };
    r.eventModel = 'round-v1';
    r.rounds = { r1: { id: 'r1', name: 'Sat', status: status || 'open', format: 'individual', courseData: COURSE, createdAt: 1,
        scoringGroups: { g1: { id: 'g1', name: 'G1', playerIds: ['pann'] } } } };
    return r;
}

// THE PHONE: its storage outlives a realm; the server outlives everything.
function phone(code, record) {
    return { storage: {}, server: { tournaments: { [code]: record } }, code };
}

function applyServer(server, p, op, v) {
    const put = (path, val) => {
        const parts = String(path).split('/').filter(Boolean);
        let n = server;
        for (let i = 0; i < parts.length - 1; i++) { if (n[parts[i]] == null || typeof n[parts[i]] !== 'object') n[parts[i]] = {}; n = n[parts[i]]; }
        if (val === null || val === undefined) delete n[parts[parts.length - 1]]; else n[parts[parts.length - 1]] = clone(val);
    };
    if (op === 'update' && !p) Object.keys(v).forEach((k) => put(k, v[k]));
    else if (op === 'remove') put(p, null);
    else put(p, v);
}

// ARRIVE: load the page at the link's URL with this phone's storage, and the
// network in `net.mode` ('online' | 'offline' | 'flaky'); `net.refuse(path, op,
// value)` may return true for a write the rules refuse.
function arrive(ph, query, net) {
    const sends = [];
    const sb = loadHtmlInlineScript(PAGE, [], {
        search: '?' + query, localStorage: true, seedStorage: ph.storage,
        beforeRun(s) {
            // <template>.content: see the header. Only what the first render needs.
            const ce = s.document.createElement.bind(s.document);
            s.document.createElement = (tag) => {
                const el = ce(tag);
                if (String(tag).toLowerCase() === 'template' && !el.content) el.content = { querySelectorAll: () => [] };
                return el;
            };
            // The stub's remove() ignores __dbHold; a remove with no signal must
            // hang like every other offline write, so it is routed the same way.
            const ref0 = s.db.ref;
            s.db.ref = (p) => {
                const r = ref0(p);
                const rm = r.remove;
                r.remove = () => {
                    const h = s.__dbHold && s.__dbHold(p, 'remove', null);
                    if (h) { s.__dbWrites.push({ path: p, op: 'remove', value: null }); return h; }
                    return rm();
                };
                return r;
            };
            s.__dbHold = (p, op, v) => {
                // What storage held at the moment the write reached the network.
                sends.push({ path: p, op, value: v, queuedAtSend: s.localStorage.getItem(QKEY) });
                if (net.mode === 'offline') return new Promise(() => {});
                if (net.mode === 'flaky') return Promise.reject(Object.assign(new Error('socket closed'), { code: 'disconnected' }));
                if (net.refuse && net.refuse(p, op, v)) return null;   // let __dbRefuse answer
                applyServer(ph.server, p, op, v);
                return null;
            };
            s.__dbRefuse = (p, op, v) => (net.refuse && net.refuse(p, op, v))
                ? Object.assign(new Error('PERMISSION_DENIED: Permission denied'), { code: 'PERMISSION_DENIED' }) : null;
        }
    });
    sb.__sends = sends;
    return sb;
}

// THE ROUND ARRIVES - the page's own listener, with what the server holds now.
function deliver(sb, ph) {
    sb.__dbHandlers.filter((h) => h.event === 'value' && h.path === 'tournaments/' + ph.code)
        .forEach((h) => h.cb({ val: () => clone(ph.server.tournaments[ph.code]), exists: () => true }));
}
function connected(sb, on) {
    sb.__dbHandlers.filter((h) => h.event === 'value' && h.path === '.info/connected')
        .forEach((h) => h.cb({ val: () => on }));
}

// TYPE: the onchange the card rendered for this hole (and golfer), run with
// `this.value` - what a browser does when the box loses focus.
function type(sb, hole, value, pid) {
    const html = String(sb.document.getElementById('holes-list').innerHTML);
    const handlers = [...html.matchAll(/onchange="([^"]*)"/g)].map((m) => m[1].replace(/&#39;/g, "'"));
    const mine = handlers.filter((h) => pid
        ? new RegExp("saveIndividualScore\\('" + pid + "', " + hole + ',').test(h)
        : new RegExp('saveHoleScore\\(' + hole + ',').test(h));
    assert.equal(mine.length, 1, 'the card rendered no box for hole ' + hole + ' (' + handlers.length + ' boxes on the card)');
    vm.runInContext('(function () { ' + mine[0] + ' }).call(' + JSON.stringify({ value: String(value) }) + ')', sb);
}

// CLOSE: the realm is dropped; only storage survives.
function close(sb, ph) {
    const out = {};
    for (let i = 0; i < sb.localStorage.length; i++) { const k = sb.localStorage.key(i); out[k] = sb.localStorage.getItem(k); }
    ph.storage = out;
}
const queued = (ph) => JSON.parse(ph.storage[QKEY] || '[]');
const scores = (ph) => (ph.server.tournaments[ph.code].scores || {});
const saveState = (sb) => { const el = sb.document.getElementById('save-state'); return { cls: el.className, text: el.textContent }; };

describe('a golfer who touches nothing', () => {
    test('opening the card writes nothing and queues nothing', async () => {
        const ph = phone('OQ1', teamEvent());
        const sb = arrive(ph, 'tourney=OQ1&team=1', { mode: 'online' });
        deliver(sb, ph); connected(sb, true); await settle();
        // POSITIVE FIRST: the card actually rendered its boxes.
        assert.match(String(sb.document.getElementById('holes-list').innerHTML), /saveHoleScore\(18, this\.value\)/);
        assert.equal(sb.__dbWrites.length, 0);
        close(sb, ph);
        assert.deepEqual(queued(ph), []);
        assert.equal(saveState(sb).text, '');
    });
});

describe('with signal', () => {
    test('a score the server confirmed leaves the queue, and a reload never sends it again', async () => {
        const ph = phone('OQ17', teamEvent());
        const a = arrive(ph, 'tourney=OQ17&team=1&k=' + K1, { mode: 'online' });
        deliver(a, ph);
        type(a, 2, 4); await settle();
        assert.equal(scores(ph).team1_h2, 4, 'the live write landed');
        close(a, ph);
        assert.deepEqual(queued(ph), [], 'a confirmed score is still queued');
        // THE ORGANIZER CORRECTS IT on their own screen. A stale replay of the
        // golfer's confirmed 4 would put it back on top of the correction.
        ph.server.tournaments.OQ17.scores.team1_h2 = 5;
        const b = arrive(ph, 'tourney=OQ17&team=1&k=' + K1, { mode: 'online' });
        deliver(b, ph); connected(b, true); await settle();
        assert.equal(b.__dbWrites.length, 0, 'a confirmed score was replayed');
        assert.equal(scores(ph).team1_h2, 5);
    });
});

describe('offline, then the tab is closed', () => {
    test('a score typed with no signal is in storage BEFORE the write is sent', async () => {
        const ph = phone('OQ2', teamEvent());
        const sb = arrive(ph, 'tourney=OQ2&team=1', { mode: 'offline' });
        deliver(sb, ph);
        type(sb, 3, 5);
        assert.equal(sb.__sends.length, 1, 'the write was sent');
        const atSend = JSON.parse(sb.__sends[0].queuedAtSend || '[]');
        assert.equal(atSend.length, 1, 'storage held nothing when the write went out');
        assert.equal(atSend[0].path, 'tournaments/OQ2/scores/team1_h3');
        assert.equal(atSend[0].value, 5);
    });

    test('three holes typed offline, tab closed, card reopened with signal: all three land, in order', async () => {
        const ph = phone('OQ3', teamEvent());
        const a = arrive(ph, 'tourney=OQ3&team=1', { mode: 'offline' });
        deliver(a, ph);
        type(a, 1, 4); type(a, 2, 5); type(a, 3, 6);
        close(a, ph);
        assert.equal(queued(ph).length, 3, 'three scores must survive the close');
        assert.deepEqual(scores(ph), {}, 'nothing reached the server while offline');

        const b = arrive(ph, 'tourney=OQ3&team=1', { mode: 'online' });
        deliver(b, ph); await settle();
        assert.deepEqual(b.__dbWrites.map((w) => [w.op, w.path, w.value]), [
            ['set', 'tournaments/OQ3/scores/team1_h1', 4],
            ['set', 'tournaments/OQ3/scores/team1_h2', 5],
            ['set', 'tournaments/OQ3/scores/team1_h3', 6]]);
        assert.deepEqual(scores(ph), { team1_h1: 4, team1_h2: 5, team1_h3: 6 });
        close(b, ph);
        assert.deepEqual(queued(ph), [], 'confirmed writes must leave the queue');
    });

    test('a keyed link: the replay sends the score and a FRESH proof - stored k, server-time t', async () => {
        const ph = phone('OQ4', teamEvent());
        const a = arrive(ph, 'tourney=OQ4&team=1&k=' + K1, { mode: 'offline' });
        deliver(a, ph);
        type(a, 1, 4); type(a, 2, 5);
        close(a, ph);
        const raw = ph.storage[QKEY];
        assert.ok(raw && raw.includes(K1), 'the link key must be stored with the op');
        assert.ok(!/"t":/.test(raw), 'no proof time may be stored on the phone: ' + raw);

        // REOPENED FROM A LINK WITH NO KEY ON IT: the stored k is what replays.
        const b = arrive(ph, 'tourney=OQ4&team=1', { mode: 'online' });
        deliver(b, ph); await settle();
        assert.equal(b.__dbWrites.length, 2);
        b.__dbWrites.forEach((w, i) => {
            const h = i + 1;
            assert.equal(w.op, 'update'); assert.equal(w.path, undefined, 'a root multi-path update');
            assert.equal(w.value[`tournaments/OQ4/scores/team1_h${h}`], h + 3);
            const p = w.value[`scoreProofs/OQ4/team1_h${h}`];
            assert.equal(p.who, 'team1'); assert.equal(p.k, K1);
            assert.deepEqual(clone(p.t), TS, 'the proof t must be ServerValue.TIMESTAMP at send time, got ' + JSON.stringify(p.t));
        });
        close(b, ph);
        assert.deepEqual(queued(ph), []);
    });

    test('the live keyed write is unchanged: one update, score + proof, t = TIMESTAMP', () => {
        const ph = phone('OQ5', teamEvent());
        const sb = arrive(ph, 'tourney=OQ5&team=1&k=' + K1, { mode: 'online' });
        deliver(sb, ph);
        type(sb, 3, 5);
        assert.equal(sb.__dbWrites.length, 1);
        const w = sb.__dbWrites[0];
        assert.equal(w.op, 'update');
        assert.equal(w.value['tournaments/OQ5/scores/team1_h3'], 5);
        assert.deepEqual(clone(w.value['scoreProofs/OQ5/team1_h3']), { who: 'team1', k: K1, t: TS });
    });

    test('a group link on a multi-round event: the replay lands in its round, proof under r/<rid>', async () => {
        const ph = phone('OQ6', groupEvent('open'));
        const a = arrive(ph, 'tourney=OQ6&group=g1&round=r1&k=' + K2, { mode: 'offline' });
        deliver(a, ph);
        type(a, 7, 3, 'pann');
        close(a, ph);
        const b = arrive(ph, 'tourney=OQ6&group=g1&round=r1&k=' + K2, { mode: 'online' });
        deliver(b, ph); await settle();
        assert.equal(b.__dbWrites.length, 1);
        const v = b.__dbWrites[0].value;
        assert.equal(v['tournaments/OQ6/rounds/r1/scores/pann_h7'], 3);
        assert.deepEqual(clone(v['scoreProofs/OQ6/r/r1/pann_h7']), { who: 'pann', k: K2, t: TS });
    });
});

describe('newest edit wins - a cleared hole is never resurrected', () => {
    test('set then clear the same hole offline: the replay sends ONE clear, and no set', async () => {
        const ph = phone('OQ7', teamEvent());
        ph.server.tournaments.OQ7.scores = { team1_h4: 7 };   // on the server from earlier
        const a = arrive(ph, 'tourney=OQ7&team=1', { mode: 'offline' });
        deliver(a, ph);
        type(a, 1, 4); type(a, 4, 5); type(a, 2, 3); type(a, 4, '');
        close(a, ph);
        assert.equal(queued(ph).length, 3, 'two edits to one box are one queued op');
        const b = arrive(ph, 'tourney=OQ7&team=1', { mode: 'online' });
        deliver(b, ph); await settle();
        // In the order each box was first touched: h1, h4, h2.
        assert.deepEqual(b.__dbWrites.map((w) => [w.op, w.path]), [
            ['set', 'tournaments/OQ7/scores/team1_h1'],
            ['remove', 'tournaments/OQ7/scores/team1_h4'],
            ['set', 'tournaments/OQ7/scores/team1_h2']]);
        assert.deepEqual(scores(ph), { team1_h1: 4, team1_h2: 3 }, 'hole 4 must end cleared');
    });

    test('a keyed clear replays as score null with a fresh proof', async () => {
        const ph = phone('OQ8', teamEvent());
        ph.server.tournaments.OQ8.scores = { team1_h4: 7 };
        const a = arrive(ph, 'tourney=OQ8&team=1&k=' + K1, { mode: 'offline' });
        deliver(a, ph);
        type(a, 4, 5); type(a, 4, '');
        close(a, ph);
        const b = arrive(ph, 'tourney=OQ8&team=1&k=' + K1, { mode: 'online' });
        deliver(b, ph); await settle();
        assert.equal(b.__dbWrites.length, 1);
        const v = b.__dbWrites[0].value;
        assert.ok(Object.prototype.hasOwnProperty.call(v, 'tournaments/OQ8/scores/team1_h4'));
        assert.equal(v['tournaments/OQ8/scores/team1_h4'], null);
        assert.deepEqual(clone(v['scoreProofs/OQ8/team1_h4']), { who: 'team1', k: K1, t: TS });
        assert.deepEqual(scores(ph), {});
    });
});

describe('the card stays open and the signal comes back', () => {
    test('the socket reconnecting replays what is waiting, and the queue empties', async () => {
        const ph = phone('OQ9', teamEvent());
        const net = { mode: 'offline' };
        const sb = arrive(ph, 'tourney=OQ9&team=1', net);
        deliver(sb, ph);
        type(sb, 5, 4);
        assert.equal(sb.scoreQueueWaiting(), 1, 'the count a future chip would show');
        net.mode = 'online';
        connected(sb, true); await settle();
        assert.deepEqual(scores(ph), { team1_h5: 4 });
        close(sb, ph);
        assert.deepEqual(queued(ph), []);
    });

    test('a network failure keeps the score; the next connection sends it', async () => {
        const ph = phone('OQ10', teamEvent());
        const a = arrive(ph, 'tourney=OQ10&team=1', { mode: 'offline' });
        deliver(a, ph); type(a, 6, 5); close(a, ph);
        const net = { mode: 'flaky' };
        const b = arrive(ph, 'tourney=OQ10&team=1', net);
        deliver(b, ph); await settle();
        close(b, ph);
        assert.equal(queued(ph).length, 1, 'a failed send that is not a refusal must stay queued');
        net.mode = 'online';
        connected(b, true); await settle();
        assert.deepEqual(scores(ph), { team1_h6: 5 });
        close(b, ph);
        assert.deepEqual(queued(ph), []);
    });
});

describe('a refusal is dropped, said in red, and never retried', () => {
    const wrongKey = (p, op, v) => op === 'update' && Object.keys(v || {}).some((k) => /^scoreProofs\//.test(k) && v[k].k !== K1);

    test('a replay the rules refuse leaves the queue and shows the refusal sentence', async () => {
        const ph = phone('OQ11', teamEvent());
        const a = arrive(ph, 'tourney=OQ11&team=1&k=' + K2, { mode: 'offline' });   // the wrong team's key
        deliver(a, ph); type(a, 2, 4); close(a, ph);
        const b = arrive(ph, 'tourney=OQ11&team=1&k=' + K2, { mode: 'online', refuse: wrongKey });
        deliver(b, ph); await settle();
        assert.equal(b.__dbWrites.length, 1, 'the replay was attempted');
        assert.deepEqual(saveState(b), { cls: 'save-state error', text: REFUSED });
        close(b, ph);
        assert.deepEqual(queued(ph), [], 'a refused op must be dropped');
        // NOT RETRIED: another connection, another snapshot, nothing more sent.
        connected(b, true); deliver(b, ph); await settle();
        assert.equal(b.__dbWrites.length, 1, 'a dropped refusal was sent again');
        assert.deepEqual(scores(ph), {});
    });

    test('a LIVE refused write says so and is dropped from the queue at once', async () => {
        const ph = phone('OQ12', teamEvent());
        const sb = arrive(ph, 'tourney=OQ12&team=1&k=' + K2, { mode: 'online', refuse: wrongKey });
        deliver(sb, ph); type(sb, 2, 4); await settle();
        assert.deepEqual(saveState(sb), { cls: 'save-state error', text: REFUSED });
        close(sb, ph);
        assert.deepEqual(queued(ph), [], 'a refusal must not sit in the queue for the next replay');
    });

    test('a refused op does not block the good one behind it', async () => {
        const ph = phone('OQ13', teamEvent());
        const a = arrive(ph, 'tourney=OQ13&team=1&k=' + K2, { mode: 'offline' });
        deliver(a, ph); type(a, 2, 4); close(a, ph);
        const c = arrive(ph, 'tourney=OQ13&team=1&k=' + K1, { mode: 'offline' });
        deliver(c, ph); type(c, 3, 5); close(c, ph);
        const b = arrive(ph, 'tourney=OQ13&team=1&k=' + K1, { mode: 'online', refuse: wrongKey });
        deliver(b, ph); await settle();
        assert.deepEqual(scores(ph), { team1_h3: 5 });
        close(b, ph);
        assert.deepEqual(queued(ph), []);
    });
});

describe('what a card replays, and what it leaves alone', () => {
    test('a queued score is not pushed into a round that has since closed; it stays queued', async () => {
        const ph = phone('OQ14', groupEvent('open'));
        const a = arrive(ph, 'tourney=OQ14&group=g1&round=r1', { mode: 'offline' });
        deliver(a, ph); type(a, 1, 4, 'pann'); close(a, ph);
        ph.server.tournaments.OQ14.rounds.r1.status = 'closed';
        const b = arrive(ph, 'tourney=OQ14&group=g1&round=r1', { mode: 'online' });
        deliver(b, ph); connected(b, true); await settle();
        assert.equal(b.__dbWrites.length, 0, 'a score went into a closed round');
        close(b, ph);
        assert.equal(queued(ph).length, 1, 'and it must not be thrown away either');
    });

    test('another event\'s leftovers are not replayed by this card', async () => {
        const ph = phone('OQ15', teamEvent());
        ph.server.tournaments.OTHER = teamEvent();
        const a = arrive(ph, 'tourney=OTHER&team=1', { mode: 'offline' });
        a.__dbHandlers.filter((h) => h.event === 'value' && h.path === 'tournaments/OTHER')
            .forEach((h) => h.cb({ val: () => clone(ph.server.tournaments.OTHER), exists: () => true }));
        type(a, 1, 4); close(a, ph);
        // AND ONE OF ITS OWN, so this card's replay genuinely runs.
        const c = arrive(ph, 'tourney=OQ15&team=1', { mode: 'offline' });
        deliver(c, ph); type(c, 2, 5); close(c, ph);
        const b = arrive(ph, 'tourney=OQ15&team=1', { mode: 'online' });
        deliver(b, ph); await settle();
        assert.deepEqual(b.__dbWrites.map((w) => w.path), ['tournaments/OQ15/scores/team1_h2'], 'only this card\'s own score may replay here');
        close(b, ph);
        assert.equal(queued(ph).length, 1, 'the other event keeps its score for its own link');
        assert.equal(queued(ph)[0].path, 'tournaments/OTHER/scores/team1_h1');
    });

    test('the other product\'s queue on the same origin is never read, written or replayed', async () => {
        const ph = phone('OQ16', teamEvent());
        const theirs = JSON.stringify([{ id: 'x1', path: 'tournaments/OQ16/scores/team1_h9', type: 'set', value: 9, coalesceKey: 'k', ts: 1, v: 'v1', tries: 0 }]);
        ph.storage[CONSUMER_KEY] = theirs;
        const a = arrive(ph, 'tourney=OQ16&team=1', { mode: 'offline' });
        deliver(a, ph); type(a, 1, 4); close(a, ph);
        assert.equal(ph.storage[CONSUMER_KEY], theirs, 'the other queue was written');
        const b = arrive(ph, 'tourney=OQ16&team=1', { mode: 'online' });
        deliver(b, ph); await settle();
        assert.ok(!b.__dbWrites.some((w) => /team1_h9/.test(w.path || '')), 'the other product\'s op was replayed here');
        assert.equal(ph.storage[CONSUMER_KEY], theirs);
    });
});
