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
// THE RULES DO NOT CATCH IT. Measured against the deployed database.rules.json:
// overwriting players on a scored round is ALLOWED, overwriting courseData is
// ALLOWED, replacing the whole round with set() is ALLOWED. Only a DELETE is
// refused, and a collision is not a delete.
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
// ============================================================================

(function () {
    'use strict';

    // Each code is issued against its OWN node. A round code colliding with a
    // trip code is not a collision at all, and an issuer that checked one
    // shared namespace would tell organizers a free code was taken.
    var ROOTS = ['events', 'trips', 'tournaments'];

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
    // root        'events' | 'trips' | 'tournaments'
    // generate    injected so a test can force a collision; defaults to the
    //             generator above, which is the only one the app has
    // maxAttempts a BOUND. Exhausting it REJECTS - returning a colliding code
    //             anyway would be worse than no check at all, because the
    //             caller would believe it had been checked
    // reserved    optional Set for in-memory dedupe within one batch. The
    //             database cannot know about codes a batch has issued but not
    //             yet written, which is why trip.html has always needed it.
    function issueUniqueCode(opts) {
        opts = opts || {};
        var db = opts.db;
        var root = opts.root;
        var generate = opts.generate || generateCode;
        var maxAttempts = opts.maxAttempts || 8;
        var reserved = opts.reserved || null;

        if (ROOTS.indexOf(root) === -1) {
            return Promise.reject(new Error('unknown root "' + root
                + '" - a code is issued against events, trips or tournaments and nothing else'));
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
            return db.ref(root + '/' + code).once('value').then(function (snap) {
                if (snap && snap.exists()) return attempt();
                if (reserved) reserved.add(code);
                return code;
            });
        }
        return attempt();
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { issueUniqueCode: issueUniqueCode, generateCode: generateCode };
    }
    if (typeof window !== 'undefined') {
        window.issueUniqueCode = issueUniqueCode;
        window.generateCode = generateCode;
    }
})();
