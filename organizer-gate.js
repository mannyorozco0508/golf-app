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
    // The uid the NEXT write will present as auth.uid. authReady captured whoever
    // was signed in at boot. Email-link sign-in (email-link-auth.js) can replace
    // that user afterwards — a second device adopts the account that already
    // holds the trial — and the rules compare ownerUid to the token, not to the
    // boot-time uid. Stamp the live one. Absent a live user, the boot uid stands.
    function liveUid() {
        try {
            var u = window.firebase && window.firebase.auth && window.firebase.auth().currentUser;
            if (u && u.uid) return String(u.uid);
        } catch (e) {}
        return null;
    }
    function ensureOrganizer(db) {
        var ready = window.authReady;
        if (!ready || typeof ready.then !== 'function') return Promise.reject(Object.assign(new Error('organizer-gate: no authReady on this page'), { code: 'no-auth' }));
        return ready.then(function (uid) {
            var live = liveUid();
            if (live) uid = live;
            var sv = (window.firebase && window.firebase.database && window.firebase.database.ServerValue) ? window.firebase.database.ServerValue.TIMESTAMP : Date.now();
            return db.ref('organizers/' + uid + '/firstSeenAt').set(sv).then(function () { return uid; }, function (err) {
                if (isPermissionDenied(err)) return uid;   // write-once: the clock was already running
                throw err;
            });
        });
    }

    // Step 3, for one round or a batch: the same uid on every record.
    function stamp(payload, uid) { payload.ownerUid = uid; return payload; }

    // ---- THE ORGANIZER DOOR (2026-09-21, v189) ------------------------------
    // "Is this the organizer of THIS round" - one predicate for the scorecard's
    // and the Game tab's "Edit round setup" button, the Group Links panel (it
    // prints the organizer link), and admin.html's refusal of the wizard on an
    // existing round. It is NOT "no ?group= in the link" (index.html's older
    // isOrganizerView, which a spectator on the bare link satisfies).
    //
    //   1. data.ownerUid === this session's uid   - the browser that created it.
    //      The uid is per browser ORIGIN: Safari, the home-screen app and the
    //      App Store app on one phone are three different organizers.
    //   2. the organizer token is held - on the URL (?organizer=TOKEN, the link
    //      copied from the Group Links panel) or REMEMBERED on this device for
    //      this round, because the nav rewrite drops the param on the first tap
    //      to another tab. Only a token that matched the round is ever stored.
    //   3. a legacy round with neither field (before 2026-08-24) is open, as it
    //      always was - there is nothing to check against. A round with a token
    //      and no ownerUid (2026-08-24 to 09-14) admits only the link.
    //
    // HIDES THE DOORS. database.rules.json locks SETUP on a round that has
    // ownerUid (auth.uid must match). The token is not that lock: the round is
    // world-readable, so the token is too. A second device saves setup by
    // email-link sign-in, which adopts this uid. Scores and the other play
    // paths stay open to a code-holder. A legacy round with no ownerUid is
    // still open. See HANDOFF.md.
    var TOKEN_KEY = 'golfapp_organizer_';
    function tokenKey(code) { return TOKEN_KEY + String(code || '').toUpperCase(); }
    function heldOrganizerToken(code, urlToken) {
        if (urlToken) return String(urlToken);
        try { return (typeof localStorage !== 'undefined' && localStorage.getItem(tokenKey(code))) || null; } catch (e) { return null; }
    }
    function rememberOrganizerToken(code, data, urlToken) {
        if (!urlToken || !data || !data.organizerToken) return false;
        if (String(urlToken) !== String(data.organizerToken)) return false;
        try { localStorage.setItem(tokenKey(code), String(urlToken)); return true; } catch (e) { return false; }
    }
    function isRoundOrganizer(data, uid, token) {
        if (!data || typeof data !== 'object') return false;
        if (data.ownerUid && uid && String(uid) === String(data.ownerUid)) return true;
        if (data.organizerToken && token && String(token) === String(data.organizerToken)) return true;
        if (!data.ownerUid && !data.organizerToken) return true;
        return false;
    }

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

    // ---- WHERE THE TRIAL STANDS (2026-09-20) ---------------------------------
    //
    // Until this, the wall was the first an organizer heard of the window - on a
    // first tee, with the round typed in and not saved. organizers/<uid> is
    // readable by its own uid, so a page reads it ONCE after authReady and says
    // one line (standingLine) on the screens right before the wall.
    //
    // THE TELL. A pass is attached to the device's storage, not to a person: a
    // reinstall signs in as a new uid, the next round stamps a fresh firstSeenAt,
    // and the pass is orphaned on the old uid with no refusal to show for it -
    // the wall comes 21 days later. The founder line disappearing is how that is
    // noticed. Anything unknown - no session, the read failed, the read did not
    // answer in time - says NOTHING rather than guess.
    // 21, not 7 (2026-09-20, Manny's call on the tell): at 7 a phone whose
    // storage reset showed NOTHING for the first two weeks of its fresh trial, so
    // the signal was the founder line VANISHING - an absence nobody notices. At
    // 21 the trial line is always there while a trial runs, and a phone that said
    // "Founder pass" yesterday saying "Free trial · 21 days left" today is a
    // sentence APPEARING. That is the signal worth having.
    var NOTICE_DAYS = 21;
    var DAY_MS = 86400000;

    // The raw record -> what it means at `now`. null when unknown.
    //   { kind: 'pass', passKind, expiresAt }   a live pass
    //   { kind: 'trial', endsAt, daysLeft }     inside the window
    //   { kind: 'ended', endsAt }               the window closed (the wall speaks)
    //   { kind: 'none' }                        no record: not an organizer
    function standingOf(record, now) {
        if (record === undefined) return null;
        if (!record || typeof record.firstSeenAt !== 'number') return { kind: 'none' };
        var t = typeof now === 'number' ? now : Date.now();
        var pass = record.pass;
        if (pass && typeof pass.expiresAt === 'number' && pass.expiresAt > t) {
            return { kind: 'pass', passKind: String(pass.kind || ''), expiresAt: pass.expiresAt };
        }
        var endsAt = record.firstSeenAt + TRIAL_MS;
        // The rule is `now < firstSeenAt + TRIAL_MS`: the same comparison, so the
        // line and the wall change hands at the same millisecond.
        if (!(t < endsAt)) return { kind: 'ended', endsAt: endsAt };
        return { kind: 'trial', endsAt: endsAt, daysLeft: Math.ceil((endsAt - t) / DAY_MS) };
    }

    function fmtDate(ms) {
        try { return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); }
        catch (e) { return ''; }
    }

    // One line, or ''. Nothing for 'ended' (the wall), 'none', null, or a trial
    // with more than NOTICE_DAYS left (none, at 21: every live trial says its days).
    function standingLine(st) {
        if (!st) return '';
        if (st.kind === 'pass') {
            if (st.passKind === 'founder') return 'Founder pass \u00B7 setting up rounds is free';
            var label = st.passKind ? st.passKind.charAt(0).toUpperCase() + st.passKind.slice(1) + ' pass' : 'Pass';
            return label + ' \u00B7 rounds free to set up until ' + fmtDate(st.expiresAt);
        }
        if (st.kind === 'trial' && st.daysLeft <= NOTICE_DAYS) {
            return 'Free trial \u00B7 ' + st.daysLeft + (st.daysLeft === 1 ? ' day' : ' days') + ' left to set up new rounds';
        }
        return '';
    }

    // The one read. Resolves to the record (null when there is none) or
    // undefined when nothing can be said: no session, the read rejected, or it
    // did not answer inside READ_MS (the same race explainRefusal runs).
    function readStanding(db) {
        var ready = window.authReady;
        if (!ready || typeof ready.then !== 'function') return Promise.resolve(undefined);
        return ready.then(function (uid) {
            var read = db.ref('organizers/' + uid).once('value').then(function (snap) {
                return (snap && typeof snap.val === 'function') ? snap.val() : undefined;
            });
            var timer = new Promise(function (resolve) { setTimeout(function () { resolve(undefined); }, window.organizerGate.READ_MS); });
            return Promise.race([read, timer]);
        }).then(function (v) { return v; }, function () { return undefined; });
    }

    // ---- THE ORGANIZER LINK, SHARED AND CLAIMED (2026-09-22, v200) ----------
    //
    // WHY THIS EXISTS. ownerUid is an anonymous uid, and anonymous auth is per
    // browser ORIGIN: the App Store app, Safari, the home-screen PWA and a Mac
    // are four organizers on one person's desk. On 2026-09-21 Manny created a
    // round in the app and Safari showed him his own round as a spectator. The
    // cure already existed - ?organizer=TOKEN, remembered per device - and was
    // rendered ONLY on the Group Links panel, which only somebody the gate
    // already calls the organizer can see. The fix that needs the fix was
    // invisible to the person who needed it. So:
    //   SHARE (a)   organizerShareUrl/organizerShareText build the link and the
    //               words; the organizer's Round Ready and Game tab offer it.
    //   CLAIM (d)   claimOrganizerToken takes what a golfer PASTES - the whole
    //               URL or the bare token - validates it against this round's
    //               organizerToken and stores it. The refusal screens offer the
    //               box, so the device that is stuck can unstick itself.
    // NOTHING IS WRITTEN TO FIREBASE by either: the token is already on the
    // record, and a claim is a localStorage write on this device. The token is a
    // bearer secret for the SCREENS - the share text says to keep it. It does
    // not authorize a setup write. Those require auth.uid === ownerUid, which
    // a second device gets by email-link sign-in (HANDOFF).
    // THE URL IS BUILT FROM shareBaseUrl() (product-links.js), never from
    // location: inside the shell that is capacitor://localhost and the link
    // would open nothing on anybody else's phone (the Build-9 failure).
    function organizerShareUrl(code, token) {
        var base = (typeof shareBaseUrl === 'function') ? shareBaseUrl()
            : ((typeof window !== 'undefined' && window.shareBaseUrl) ? window.shareBaseUrl() : '/');
        return base + 'index.html?game=' + encodeURIComponent(String(code || '').toUpperCase())
            + '&organizer=' + encodeURIComponent(String(token || ''));
    }
    function organizerShareText(code) {
        return 'Organizer link for ' + String(code || '').toUpperCase()
            + ' \u2014 opens the setup screens on this device. Saving them needs the email sign-in for this round. Keep it to yourself.';
    }
    // A pasted URL, a pasted token, or rubbish. Returns the 32-hex token or null;
    // reads nothing and writes nothing.
    function tokenFromPaste(text) {
        var t = String(text == null ? '' : text).trim();
        if (!t) return null;
        var m = /[?&]organizer=([^&#\s]+)/.exec(t);
        if (m) { try { t = decodeURIComponent(m[1]); } catch (e) { t = m[1]; } }
        t = t.trim();
        return /^[A-Za-z0-9_-]{8,128}$/.test(t) ? t : null;
    }
    // Validate against THIS round's token and remember it on this device.
    // 'ok' | 'wrong' (a token, but not this round's) | 'empty' (nothing usable).
    // A round with no organizerToken (before 2026-08-24) cannot be claimed - there
    // is nothing to check against - and says so as 'wrong' rather than opening.
    function claimOrganizerToken(code, data, text) {
        var token = tokenFromPaste(text);
        if (!token) return 'empty';
        var want = data && data.organizerToken;
        if (!want || String(token) !== String(want)) return 'wrong';
        try { localStorage.setItem(tokenKey(code), String(token)); } catch (e) { /* private mode: the doors open for this render only */ }
        return 'ok';
    }
    // ONE SHARE PATH FOR THREE CALLERS (Round Ready, the Game tab, the scorecard's
    // panel). Inside the shell: @capacitor/share through Capacitor.Plugins - the
    // NATIVE injected bridge, which is the only runtime this app has (see
    // native-export.js nativePlugins: there is no registerPlugin on the device).
    // On the web: navigator.share where it exists (iOS Safari, Android), else the
    // clipboard, else a prompt the golfer can copy out of. Resolves to
    // 'shared' | 'copied' | 'shown' | 'failed' so a caller can say what happened.
    function nativeShare() {
        try {
            var cap = window.Capacitor;
            if (!cap || !(cap.isNativePlatform && cap.isNativePlatform())) return null;
            var bag = cap.Plugins || {};
            if (bag.Share && typeof bag.Share.share === 'function') return bag.Share;
            if (typeof cap.registerPlugin === 'function') { var p = cap.registerPlugin('Share'); if (p && p.share) return p; }
        } catch (e) { /* no bridge: the web path */ }
        return null;
    }
    function shareOrganizerLink(code, data) {
        var token = data && data.organizerToken;
        if (!token) return Promise.resolve('failed');
        var url = organizerShareUrl(code, token);
        var text = organizerShareText(code);
        var plugin = nativeShare();
        if (plugin) {
            return Promise.resolve(plugin.share({ title: 'HardPan', text: text, url: url, dialogTitle: 'Organizer link' }))
                .then(function () { return 'shared'; }, function () { return copyOrganizerLink(url, text); });
        }
        if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
            return Promise.resolve(navigator.share({ title: 'HardPan', text: text, url: url }))
                .then(function () { return 'shared'; }, function () { return copyOrganizerLink(url, text); });
        }
        return copyOrganizerLink(url, text);
    }
    function copyOrganizerLink(url, text) {
        var msg = text + '\n' + url;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                return navigator.clipboard.writeText(msg).then(function () { return 'copied'; }, function () { return showOrganizerLink(msg); });
            }
        } catch (e) { /* fall through */ }
        return Promise.resolve(showOrganizerLink(msg));
    }
    function showOrganizerLink(msg) {
        try { window.prompt('Organizer link \u2014 copy this and keep it to yourself:', msg); return 'shown'; }
        catch (e) { return 'failed'; }
    }
    var CLAIM_PROMPT = 'Are you the organizer? Paste your organizer link.';
    var CLAIM_WRONG = 'That link isn\u2019t for this round.';

    window.organizerGate = {
        TRIAL_MS: TRIAL_MS,
        NOTICE_DAYS: NOTICE_DAYS,
        READ_MS: READ_MS,
        WALL: WALL,
        isPermissionDenied: isPermissionDenied,
        ensureOrganizer: ensureOrganizer,
        stamp: stamp,
        heldOrganizerToken: heldOrganizerToken,
        rememberOrganizerToken: rememberOrganizerToken,
        isRoundOrganizer: isRoundOrganizer,
        explainRefusal: explainRefusal,
        standingOf: standingOf,
        standingLine: standingLine,
        readStanding: readStanding,
        organizerShareUrl: organizerShareUrl,
        shareOrganizerLink: shareOrganizerLink,
        organizerShareText: organizerShareText,
        tokenFromPaste: tokenFromPaste,
        claimOrganizerToken: claimOrganizerToken,
        CLAIM_PROMPT: CLAIM_PROMPT,
        CLAIM_WRONG: CLAIM_WRONG
    };
})();
