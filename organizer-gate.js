// ============================================================================
// GolfApp — the organizer gate (SHARED, Wave 3)
//
// The ONE builder every path that CREATES a round goes through, on the way to
// the write. Two pages create rounds - admin.html's wizard (the lobby tile,
// "start from a previous round" and a hand-typed ?game= all end in its
// saveSettings) and trip.html's planner (one multi-path batch) - and the rules
// (database.rules.json, Wave 2) refuse a new round unless, IN THIS ORDER:
//
//   1. the write carries a token - auth.uid. window.authReady (auth-boot.js)
//      is awaited HERE and nowhere else; a create fired before the token
//      lands is evaluated as auth == null and refused.
//   2. organizers/<uid>/firstSeenAt already exists - the rule reads it from
//      root when the round write is evaluated, so it must be written FIRST,
//      as ServerValue.TIMESTAMP. It is write-once by rule: the second press
//      is refused with PERMISSION_DENIED and that refusal is EXPECTED - it
//      means the clock is already running - not an error.
//   3. the round carries ownerUid: auth.uid. Every round in a planner batch:
//      the multi-path update is atomic, so one round without it refuses the
//      whole batch, good rounds included.
//
// THE WALL. When the round write is refused, the golfer gets a sentence, not
// an SDK error - but only when the refusal IS the gate: organizers/<uid> is
// read back (a uid may read its own node) and the wall shows when the window
// has closed and no pass is live. Any other PERMISSION_DENIED (a shape
// validation, a rule the page did not expect) keeps the page's own error, so
// the wall never lies about why. Inside the window nothing is shown at all:
// no banner, no countdown. The trial is invisible until it matters.
//
// NOT HERE: StoreKit, purchases, a buy button. The sentence says what a pass
// costs and that passes are not on sale in the app yet. The trial keyed on the
// anonymous uid is a learning gate, not the entitlement mechanism (MONETIZATION
// .md, "The rule as drafted").
// ============================================================================
(function () {
    if (typeof window === 'undefined') return;

    var TRIAL_MS = 21 * 24 * 60 * 60 * 1000;   // the rule's 1814400000

    // THE COPY - one sentence per line, shown in the page's alert.
    var WALL = '⛳ Your free trial has ended.\n\n'
        + 'Joining a round is free, always. Setting one up needs a pass — one person per group: '
        + 'a Season Pass ($29.99 a year) or a Trip Pass ($19.99).\n\n'
        + 'Passes aren’t on sale in the app yet. The rounds you already set up still work. This one was not saved.';

    function isPermissionDenied(err) {
        var s = String((err && (err.code || err.message)) || '');
        return /PERMISSION_DENIED|permission_denied|Permission denied/i.test(s);
    }

    // Steps 1 and 2. Resolves to the uid. Rejects only when there is no token
    // (auth-boot rejected: offline, or the SDK absent) or the organizer write
    // failed for a reason OTHER than write-once.
    function ensureOrganizer(db) {
        var ready = window.authReady;
        if (!ready || typeof ready.then !== 'function') return Promise.reject(Object.assign(new Error('organizer-gate: no authReady on this page'), { code: 'no-auth' }));
        return ready.then(function (uid) {
            var sv = (window.firebase && window.firebase.database && window.firebase.database.ServerValue) ? window.firebase.database.ServerValue.TIMESTAMP : Date.now();
            return db.ref('organizers/' + uid + '/firstSeenAt').set(sv).then(function () { return uid; }, function (err) {
                if (isPermissionDenied(err)) return uid;   // write-once: the clock was already running
                throw err;
            });
        });
    }

    // Step 3, for one round or a batch: the same uid on every record.
    function stamp(payload, uid) { payload.ownerUid = uid; return payload; }

    // After a refused round write: 'trial-ended' when the gate is the reason,
    // 'inside-window' / 'no-record' / 'unknown' otherwise (the caller keeps its
    // own error message for those).
    // The read is raced against a short timer: with no socket it would never
    // answer, and a wall that never appears is worse than the SDK's message.
    var READ_MS = 2500;
    function explainRefusal(db, uid) {
        var read = db.ref('organizers/' + uid).once('value');
        var timer = new Promise(function (resolve) { setTimeout(function () { resolve({ val: function () { return undefined; } }); }, READ_MS); });
        return Promise.race([read, timer]).then(function (snap) {
            var o = (snap && typeof snap.val === 'function') ? snap.val() : null;
            if (o === undefined) return 'unknown';   // the read did not answer in time
            if (!o || typeof o.firstSeenAt !== 'number') return 'no-record';
            var now = Date.now();
            var passLive = !!(o.pass && typeof o.pass.expiresAt === 'number' && o.pass.expiresAt > now);
            if (passLive) return 'unknown';
            return now >= o.firstSeenAt + TRIAL_MS ? 'trial-ended' : 'inside-window';
        }, function () { return 'unknown'; });
    }

    window.organizerGate = {
        TRIAL_MS: TRIAL_MS,
        WALL: WALL,
        isPermissionDenied: isPermissionDenied,
        ensureOrganizer: ensureOrganizer,
        stamp: stamp,
        explainRefusal: explainRefusal
    };
})();
