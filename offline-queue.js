// ============================================================================
// SCORES THAT SURVIVE THE PHONE BEING CLOSED (2026-10-06)
//
// WHAT THIS EXISTS FOR, MEASURED FIRST (tools/offline-durability-audit.js, the
// repo's own vendored SDK against a socket that never answers):
//
//   7 score writes issued with no signal -> 0 resolved, 0 rejected, 7 sitting in
//   persistentConnection_.outstandingPuts_, which is a plain in-memory Array.
//   The payload appears in NO durable store: localStorage holds only
//   "firebase:host:..." and "firebase:previous_websocket_failure", and
//   sessionStorage, IndexedDB and the Cache Storage are empty of it. After a
//   reload the queue length is 0. The seven scores are gone.
//
// So Firebase's queue is a promise to a page that stays open. This is the queue
// for the other case: the app closed on the 6th tee, or the phone died.
//
// THE RULES IT KEEPS, and each one is a test:
//
//   DURABLE     every op is written to storage BEFORE the network write is
//               issued. A crash between the two costs a replay, never a score.
//   IN ORDER    replay follows the order the golfer typed. An out-of-order
//               replay can land an old value on top of a new one.
//   CONFIRMED   an op leaves the queue only when the server's own promise
//               RESOLVES. Not when it is issued, not on a timer. A rejection
//               leaves it queued; a refusal that can never succeed is the one
//               case that drops it, because retrying it forever would block
//               every score behind it.
//   NEWEST WINS a second edit to the same box replaces the queued value in
//               place - same position in the order, new value. Two writes to
//               one box are not two facts; they are one box and the last thing
//               the golfer typed.
//   IDEMPOTENT  every op carries its FULL path, including any push key, so a
//               replay of something that actually landed writes the same value
//               to the same place. That is why nothing here calls push().
//
// NO DOM, NO FIREBASE, NO GLOBALS BEYOND window.OfflineQueue. Storage and the
// writer are passed in, so the tests drive the real logic and a page swaps in
// localStorage and db.ref. Plain var/function declarations: a const at the top
// level collides with any page that re-declares the name.
// ============================================================================

(function () {
    'use strict';

    var KEY = 'golfapp_wq_v1';          // the queue
    var SNAP = 'golfapp_snap_v1_';      // + code: the last round we saw

    // A REFUSAL IS NOT AN OUTAGE. These are the only errors that mean "retrying
    // this forever will never work", and an op that cannot ever land must not sit
    // at the head of the queue blocking every score behind it. Anything else -
    // a dead socket, a timeout, a 500 - is an outage and stays queued.
    var PERMANENT = ['PERMISSION_DENIED', 'permission_denied', 'INVALID_TOKEN', 'invalid-argument'];

    function isPermanent(err) {
        // A TIMEOUT IS THE OPPOSITE OF PERMANENT - it is the sound of no signal,
        // and dropping the op would be throwing the score away.
        if (err && err.code === 'queue_timeout') return false;
        var s = String((err && (err.code || err.message)) || err || '');
        for (var i = 0; i < PERMANENT.length; i++) {
            if (s.indexOf(PERMANENT[i]) !== -1) return true;
        }
        return false;
    }

    function readAll(store) {
        if (!store) return [];
        try {
            var raw = store.getItem(KEY);
            if (!raw) return [];
            var parsed = JSON.parse(raw);
            return Object.prototype.toString.call(parsed) === '[object Array]' ? parsed : [];
        } catch (e) {
            // A CORRUPT QUEUE IS NOT A CRASH. Unparseable storage reads as empty:
            // the alternative is a page that cannot open at all, which costs the
            // golfer the whole round rather than the writes we could not read.
            return [];
        }
    }

    function writeAll(store, ops) {
        if (!store) return false;
        try { store.setItem(KEY, JSON.stringify(ops)); return true; }
        catch (e) { return false; }   // quota, private mode: the write still goes out
    }

    // ONE OP. `coalesceKey` is what makes two writes "the same box" - for a score
    // it is the path, so a re-entered hole replaces its own queued value. An op
    // with no coalesceKey never merges (a press is not an edit of a press).
    function enqueue(store, op) {
        var ops = readAll(store);
        var now = (op && op.ts) || Date.now();
        var entry = {
            id: (op && op.id) || ('op' + now + '-' + Math.random().toString(36).slice(2, 8)),
            path: op && op.path,
            type: (op && op.type) || 'set',
            value: op && op.value === undefined ? null : op.value,
            coalesceKey: (op && op.coalesceKey) || null,
            ts: now,
            tries: 0
        };
        if (entry.coalesceKey) {
            for (var i = 0; i < ops.length; i++) {
                if (ops[i].coalesceKey === entry.coalesceKey) {
                    // NEWEST WINS, IN PLACE. The position in the queue is the
                    // order the golfer first touched that box; the value is the
                    // last thing they typed. Replacing the whole entry but
                    // keeping the index is deliberate: moving it to the end
                    // would let an older edit to another box land after it.
                    entry.id = ops[i].id;
                    ops[i] = entry;
                    writeAll(store, ops);
                    return entry;
                }
            }
        }
        ops.push(entry);
        writeAll(store, ops);
        return entry;
    }

    function confirm(store, id) {
        var ops = readAll(store);
        var out = [];
        for (var i = 0; i < ops.length; i++) { if (ops[i].id !== id) out.push(ops[i]); }
        writeAll(store, out);
        return ops.length - out.length;
    }

    function count(store) { return readAll(store).length; }
    function peek(store) { return readAll(store); }
    function clear(store) { writeAll(store, []); }

    // REPLAY. `write(op)` issues the real network write and returns a promise.
    // Serial on purpose: the next op is not issued until the one before it has
    // landed, because that is the only thing that makes "in order" true of what
    // the SERVER sees rather than of what we asked for.
    //
    // STOPS AT THE FIRST OUTAGE. If an op fails for anything but a permanent
    // refusal, the drain ends there and leaves it - and everything after it -
    // queued. Carrying on would reorder the round.
    // AND EVERY WRITE IS TIME-BOUND. This is the bug that cost the whole feature
    // once already, measured end to end: a drain that starts while the socket is
    // still down issues ONE write, that write NEVER SETTLES (which is exactly
    // what an offline Firebase write does - measured, 0 resolved, 0 rejected),
    // and the drain then waits on it for the life of the page. The queue stayed
    // full, the badge stayed on "Sending...", and no later drain could start
    // because the first one never finished. The stand-in database recorded
    // precisely one write and the server got nothing.
    //
    // A timeout is not a guess about the network; it is the only way to get the
    // drain back. The op stays queued, the caller is told it stopped, and the
    // write that was in flight may still land later - which costs nothing,
    // because every op carries its full path and its own value, so a replay
    // writes the same number to the same place.
    function drain(store, write, opts) {
        var ops = readAll(store);
        var timeoutMs = (opts && opts.timeoutMs !== undefined) ? opts.timeoutMs : 15000;
        var result = { sent: 0, dropped: 0, left: ops.length, stoppedOn: null };
        function timed(p) {
            if (!timeoutMs) return Promise.resolve(p);
            return new Promise(function (resolve, reject) {
                var done = false;
                var t = setTimeout(function () {
                    if (done) return;
                    done = true;
                    var e = new Error('write did not settle in ' + timeoutMs + 'ms');
                    e.code = 'queue_timeout';
                    reject(e);
                }, timeoutMs);
                Promise.resolve(p).then(function (v) {
                    if (done) return; done = true; clearTimeout(t); resolve(v);
                }, function (err) {
                    if (done) return; done = true; clearTimeout(t); reject(err);
                });
            });
        }
        function step(i) {
            if (i >= ops.length) { result.left = count(store); return Promise.resolve(result); }
            var op = ops[i];
            var p;
            try { p = write(op); } catch (e) { p = Promise.reject(e); }
            return timed(p).then(function () {
                confirm(store, op.id);
                result.sent++;
                return step(i + 1);
            }, function (err) {
                if (isPermanent(err)) {
                    // IT CAN NEVER LAND. Dropping it is the lesser harm: left in
                    // place it blocks every score behind it for the rest of the
                    // round. The reason is returned so the page can say so.
                    confirm(store, op.id);
                    result.dropped++;
                    result.droppedReason = String((err && (err.code || err.message)) || err);
                    return step(i + 1);
                }
                result.stoppedOn = { path: op.path, reason: String((err && err.message) || err) };
                result.left = count(store);
                return result;
            });
        }
        return step(0);
    }

    // ---- THE ROUND ITSELF ---------------------------------------------------
    // The queue keeps what the golfer typed; this keeps what the round WAS, so a
    // phone with no signal can open it at all. Measured in the audit: with no
    // signal index.html renders "Connecting to game..." and 0 score boxes of 0,
    // because RTDB on web has no on-disk read cache either.
    function saveSnapshot(store, code, data) {
        if (!store || !code || !data) return false;
        try {
            store.setItem(SNAP + String(code).toUpperCase(),
                JSON.stringify({ at: Date.now(), data: data }));
            return true;
        } catch (e) { return false; }
    }

    function loadSnapshot(store, code) {
        if (!store || !code) return null;
        try {
            var raw = store.getItem(SNAP + String(code).toUpperCase());
            if (!raw) return null;
            var parsed = JSON.parse(raw);
            return (parsed && parsed.data) ? parsed : null;
        } catch (e) { return null; }
    }

    // WHAT THE GOLFER SHOULD SEE: the round as the server last described it, with
    // their own unsent edits on top. Without this a reload offline shows the
    // snapshot and silently drops the scores still in the queue - the golfer's
    // own work, missing from their own card.
    function applyQueued(data, ops, code) {
        if (!data) return data;
        var out = JSON.parse(JSON.stringify(data));
        var prefix = 'events/' + String(code || '').toUpperCase() + '/';
        for (var i = 0; i < (ops || []).length; i++) {
            var op = ops[i];
            var path = String(op.path || '');
            // A MULTI-PATH UPDATE AT THE ROUND'S ROOT. This is how the app writes
            // a KP answer - one update() carrying kpLeaders/hN and kpWinners/hN
            // together, so a refusal cannot leave half of it - and the first
            // version of this function skipped it entirely: the path is
            // events/<code> with nothing after it, so the per-key walk below had
            // no key to walk to and a queued KP never appeared on the card.
            if (path === 'events/' + String(code || '').toUpperCase()
                && op.type === 'update' && op.value && typeof op.value === 'object') {
                for (var rk in op.value) {
                    if (!Object.prototype.hasOwnProperty.call(op.value, rk)) continue;
                    var seg = String(rk).split('/').filter(Boolean);
                    if (!seg.length) continue;
                    var n2 = out;
                    for (var si = 0; si < seg.length - 1; si++) {
                        if (n2[seg[si]] == null || typeof n2[seg[si]] !== 'object') n2[seg[si]] = {};
                        n2 = n2[seg[si]];
                    }
                    if (op.value[rk] === null) delete n2[seg[seg.length - 1]];
                    else n2[seg[seg.length - 1]] = op.value[rk];
                }
                continue;
            }
            if (path.indexOf(prefix) !== 0) continue;
            var rest = path.slice(prefix.length).split('/').filter(Boolean);
            if (!rest.length) continue;
            var node = out;
            for (var j = 0; j < rest.length - 1; j++) {
                if (node[rest[j]] == null || typeof node[rest[j]] !== 'object') node[rest[j]] = {};
                node = node[rest[j]];
            }
            var last = rest[rest.length - 1];
            if (op.type === 'remove' || op.value === null) { delete node[last]; }
            else if (op.type === 'update' && op.value && typeof op.value === 'object') {
                if (node[last] == null || typeof node[last] !== 'object') node[last] = {};
                for (var k in op.value) {
                    if (Object.prototype.hasOwnProperty.call(op.value, k)) {
                        if (op.value[k] === null) delete node[last][k];
                        else node[last][k] = op.value[k];
                    }
                }
            } else { node[last] = op.value; }
        }
        return out;
    }

    // ---- WHAT THE READING PAGES SHOW (2026-10-06) ---------------------------
    // Requirement 5 is a LABEL, not arithmetic (Manny: "No new math"). The
    // leaderboard, matches, skins and results already compute from the round
    // record they are handed; hand them the stored round with this phone's
    // unsent edits laid on top and they compute offline by themselves. The only
    // new thing is a sentence saying the numbers are provisional.
    //
    // ONE DEFINITION FOR FOUR PAGES. Four hand-written copies of "is this
    // provisional" is how two of them end up disagreeing, and this repo has paid
    // for a hand-written copy per page before.
    function localRound(store, code, serverData) {
        var out = { data: serverData || null, fromLocal: false, waiting: 0 };
        if (!store || !code) return out;
        try { out.waiting = count(store) || 0; } catch (e) { out.waiting = 0; }
        var ops = [];
        try { ops = peek(store) || []; } catch (e) { ops = []; }
        if (!out.data || !out.data.players) {
            // NOTHING FROM THE SERVER: the last round this phone saw, which is
            // the difference between a leaderboard and "Connecting to game...".
            var snap = loadSnapshot(store, code);
            if (snap && snap.data) { out.data = snap.data; out.fromLocal = true; }
        }
        if (out.data && ops.length) out.data = applyQueued(out.data, ops, code) || out.data;
        return out;
    }

    // SHOWN WHEN THE NUMBERS COULD STILL MOVE: this phone has unsent work, or it
    // cannot hear the other phones. Not an error - a caveat.
    function syncNote(state) {
        var waiting = (state && state.waiting) || 0;
        var offline = !!(state && state.offline);
        var fromLocal = !!(state && state.fromLocal);
        return { show: waiting > 0 || offline || fromLocal,
                 text: 'May change when others sync.' };
    }

    // ---- WHAT THE BADGE SAYS ------------------------------------------------
    // Never a scary error for a queued score: a score in this queue is SAFE on
    // this phone, and the words have to say that rather than implying loss.
    function badge(state) {
        var n = (state && state.waiting) || 0;
        if (state && state.sending && n > 0) return { kind: 'sending', text: 'Sending\u2026' };
        if (n > 0) {
            return { kind: 'queued',
                text: '📴 Saved on this phone · ' + n + ' waiting — will send when you have signal' };
        }
        if (state && state.dropped > 0) {
            return { kind: 'refused',
                text: '⚠️ ' + state.dropped + ' change' + (state.dropped === 1 ? '' : 's')
                    + ' the server refused — re-enter ' + (state.dropped === 1 ? 'it' : 'them') };
        }
        return { kind: 'synced', text: '✓ Synced' };
    }

    var api = {
        STORAGE_KEY: KEY, SNAPSHOT_PREFIX: SNAP,
        enqueue: enqueue, confirm: confirm, count: count, peek: peek, clear: clear,
        drain: drain, isPermanent: isPermanent,
        saveSnapshot: saveSnapshot, loadSnapshot: loadSnapshot, applyQueued: applyQueued,
        localRound: localRound, syncNote: syncNote,
        badge: badge
    };

    if (typeof window !== 'undefined') window.OfflineQueue = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
