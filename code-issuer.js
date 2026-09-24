// ============================================================================
// GolfApp — Code Issuer (SHARED CORE)
//
// One generator, one existence check, one place. Before this file there were
// THREE byte-identical generators - admin.html, trip.html, tournament.html -
// and not one of them asked whether the code was already in use:
//
//     const newCode = generateRoomCode();
//     window.location.href = `admin.html?game=${newCode}&...`;
//
// WHY THAT MATTERED MORE THAN THE ODDS. 32^6 is 1,073,741,824, so a new code
// hits an existing one roughly once in a million at a thousand live codes.
// Remote. The damage is not: the round save is
// db.ref(`events/${code}`).update(payload), a MERGE, and the payload's 45 keys
// include players and courseData but NOT scores. Measured, a second organizer
// landing on a live code replaces the roster and the course while A's scores
// SURVIVE as orphans keyed to player ids no longer in the roster. A's card
// empties mid-round and the data sits unreachable in the database, with their
// side matches and audit log still pointing at people who are not there.
//
// THE RULES CATCH IT ON AN OWNED ROUND (2026-09-23). players and courseData are
// owner-only once ownerUid is set, so a second organizer's merge onto a live
// code is PERMISSION_DENIED. A LEGACY round (no ownerUid) is still open:
// overwriting players is allowed, and only a delete of a scored round is
// refused. The existence check stays, because legacy rounds and the race
// before the first write are still real.
//
// TRIPS ARE WORSE. trip.html's batch builder writes trips/<code>/rounds/<code>
// as MERGE keys, so a colliding trip code puts two unrelated groups' rounds in
// ONE trip - and trip settlement nets money across every round in a trip.
//
// THE CHECK RUNS AT GENERATION TIME, NOT AT SAVE. createRoom navigates before
// anything is written; the round does not exist until Save & Start Round, by
// which point the organizer has typed a roster. A save-time check would find
// the collision after the work, and the wizard has nowhere to put that.
//
// THE RACE IS DELIBERATELY NOT CLOSED. Two organizers can both read "absent"
// before either writes. That needs them to draw the same billion-to-one code
// inside the same few hundred milliseconds; a transaction to close it would be
// machinery bought with complexity, and the wizard would have to stop
// navigating before it writes to pay for it. The read removes essentially all
// of the real risk. Server-side issuance is the correct end state and belongs
// with the Worker MONETIZATION.md already needs.
//
// A READ THAT NEVER ANSWERS IS A REJECTION (2026-09-14). Measured in Chrome with
// the network cut at the browser: tapping Game Day left the tile on
// "⏳ Starting..." at +0.3 s, +2 s, +5 s, +8 s and forever, because the
// Realtime Database SDK neither resolves nor rejects a once('value') while the
// socket is down - it queues it, and no caller can catch what never rejects.
// Every existence check below now races the read against a timer
// (opts.timeoutMs, default 8000). On timeout the issuer rejects with an Error
// whose .code is 'timeout', so a caller can tell it from the exhausted-attempts
// rejection and restore its control. navigator.onLine is deliberately NOT
// consulted: it read true under that same offline emulation, and reads true on
// a phone with a bar of signal and no throughput. The timer is the decision.
// ============================================================================

(function () {
    'use strict';

    // Each code is issued against its OWN node. A round code colliding with a
    // trip code is not a collision at all, and an issuer that checked one
    // shared namespace would tell organizers a free code was taken.
    var ROOTS = ['events', 'trips', 'tournaments', 'seasons'];

    // No I, O, 0 or 1: a code is read aloud on a tee box and typed by someone
    // who did not write it down.
    var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var LENGTH = 6;

    // SIX CHARACTERS, NOT FOUR. Four from this alphabet is 1,048,576 - and
    // there is no listing endpoint, every read names a specific code, but a
    // million is small for a machine and a hit grants full read and write to
    // that round. Six raises it to 1,073,741,824.
    //
    // NOT SEVEN: every code input carries maxlength="6", so a 7-character code
    // could be generated and linked but never typed.
    //
    // crypto.getRandomValues, NOT Math.random. This does NOT move the collision
    // numbers - V8's Math.random is xorshift128+ with a 128-bit state and a
    // code consumes 30 bits, so period exhaustion was never the risk. It helps
    // the OTHER surface the comment above has always reasoned about: a code
    // grants full read and write to a round, Math.random's output is
    // predictable from prior output, and the app has no accounts behind it.
    //
    // REJECTION SAMPLING, not modulo. 256 is not a multiple of 32 here only by
    // luck; taking a byte mod 32 would bias the alphabet whenever it is not,
    // and a biased code space is a smaller code space. Bytes above the largest
    // whole multiple are discarded instead.
    function randomByte() {
        var g = (typeof crypto !== 'undefined' && crypto)
            || (typeof window !== 'undefined' && (window.crypto || window.msCrypto));
        if (g && typeof g.getRandomValues === 'function') {
            var buf = new Uint8Array(1);
            g.getRandomValues(buf);
            return buf[0];
        }
        // A browser with no crypto still has to be able to start a round. This
        // is the pre-existing behaviour, not a new weakness, and it is the only
        // path that ever reaches Math.random.
        return Math.floor(Math.random() * 256);
    }

    function generateCode() {
        var limit = 256 - (256 % ALPHABET.length);   // 256 for a 32-char alphabet
        var code = '';
        while (code.length < LENGTH) {
            var b = randomByte();
            if (b >= limit) continue;                // discard, do not fold
            code += ALPHABET.charAt(b % ALPHABET.length);
        }
        return code;
    }

    // db          anything with .ref(path).once('value') -> { exists() }
    // root        'events' | 'trips' | 'tournaments' | 'seasons'
    // generate    injected so a test can force a collision; defaults to the
    //             generator above, which is the only one the app has
    // maxAttempts a BOUND. Exhausting it REJECTS - returning a colliding code
    //             anyway would be worse than no check at all, because the
    //             caller would believe it had been checked
    // reserved    optional Set for in-memory dedupe within one batch. The
    //             database cannot know about codes a batch has issued but not
    //             yet written, which is why trip.html has always needed it.
    // timeoutMs   how long ONE existence check may take before the issuer gives
    //             up and rejects with err.code === 'timeout'. Per attempt, not
    //             per call: a slow-but-answering database is not a dead one.
    function issueUniqueCode(opts) {
        opts = opts || {};
        var db = opts.db;
        var root = opts.root;
        var generate = opts.generate || generateCode;
        var maxAttempts = opts.maxAttempts || 8;
        var reserved = opts.reserved || null;
        var timeoutMs = opts.timeoutMs || 8000;

        if (ROOTS.indexOf(root) === -1) {
            return Promise.reject(new Error('unknown root "' + root
                + '" - a code is issued against events, trips, tournaments or seasons and nothing else'));
        }
        if (!db || typeof db.ref !== 'function') {
            return Promise.reject(new Error('issueUniqueCode needs a database to check the '
                + root + ' code against'));
        }

        var attempts = 0;
        function attempt() {
            if (attempts >= maxAttempts) {
                return Promise.reject(new Error('could not issue a free ' + root + ' code after '
                    + maxAttempts + ' attempts'));
            }
            attempts++;
            var code = generate();
            // In-memory first: it costs nothing and the database would say this
            // one is free, because the batch has not written it yet.
            if (reserved && reserved.has(code)) return attempt();
            return readWithTimeout(db.ref(root + '/' + code).once('value'),
                                   { timeoutMs: timeoutMs, what: 'the ' + root + ' code check' }).then(function (snap) {
                if (snap && snap.exists()) return attempt();
                if (reserved) reserved.add(code);
                return code;
            });
        }
        return attempt();
    }

    // THE RACE, SHARED. Any read that sits on the way to creating a round, a
    // trip or a tournament goes through here - the source round a copy starts
    // from, the course list the trip planner reads, the wizard's arrival load -
    // not only the code check. Measured 2026-09-14: the copy button hung on
    // "⏳ Checking…" forever because its source read sat AHEAD of the issuer and
    // the issuer's timer was never reached. One helper, exported, so the next
    // read on such a path does not grow its own copy of the race.
    //
    // The timer is cleared when the read wins so a fast answer leaves nothing
    // ticking; when the timer wins, the read's eventual answer (if it ever
    // comes) is dropped - the caller has already been told.
    //
    //   readWithTimeout(promise, { timeoutMs = 8000, what = 'the database read' })
    //     -> the promise's value, or a rejection whose .code is 'timeout'
    function readWithTimeout(readPromise, opts) {
        opts = opts || {};
        var timeoutMs = opts.timeoutMs || 8000;
        var what = opts.what || 'the database read';
        return new Promise(function (resolve, reject) {
            var timer = setTimeout(function () {
                var err = new Error(what + ' did not answer within ' + timeoutMs + 'ms - nothing was created');
                err.code = 'timeout';
                reject(err);
            }, timeoutMs);
            readPromise.then(function (v) { clearTimeout(timer); resolve(v); },
                             function (e) { clearTimeout(timer); reject(e); });
        });
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { issueUniqueCode: issueUniqueCode, generateCode: generateCode, readWithTimeout: readWithTimeout };
    }
    if (typeof window !== 'undefined') {
        window.issueUniqueCode = issueUniqueCode;
        window.generateCode = generateCode;
        window.readWithTimeout = readWithTimeout;
    }
})();
