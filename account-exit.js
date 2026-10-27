// ============================================================================
// SIGN OUT, AND DELETE ACCOUNT
//
// WHY IT EXISTS. App Review 5.1.1(v): an app that lets somebody CREATE an account
// has to let them delete it from inside the app. Wave 33 made Apple and Google the
// front door, so this app now plainly creates accounts and had neither a sign-out
// nor a delete - grep found not one of either. This is the missing half of that
// wave, and it is a build rather than a console click.
//
// WHAT "DELETE" CAN ACTUALLY MEAN HERE, MEASURED AGAINST THE LIVE RULES rather
// than assumed. Stage 1 (published 2026-09-29) was run through targaryen with the
// deletes this file performs, and the eight-row result is in account_exit_test.js:
//
//   organizers/<uid>                 REFUSED   no .write at that level, by design
//   organizers/<uid>/firstSeenAt     REFUSED   create-only: "!data.exists() && ..."
//   organizers/<uid>/pass            REFUSED   .write is literally false
//
// AND ONE RULE WAS APPROVED TO CHANGE THAT, so the first row is about to become
// allowed. database.rules.stage2delete.json adds exactly one key -
//   organizers/$uid ".write": "newData.val() === null && auth != null && auth.uid === $uid"
// - which permits a write that EMPTIES the record and nothing else: setting a pass
// leaves a non-null record, so pass stays unwritable even though the parent now
// grants. rules_stage2_delete_test.js holds twelve rows and three controls on that.
// It is not published yet, which is why the code below attempts the whole record
// FIRST and falls back to the groups write when the rules refuse it. The same build
// is correct before and after the publish; nothing needs re-releasing.
//   organizers/<uid>/groups          allowed   owner writes the whole subtree
//   organizers/<uid>/groups/$id      allowed   owner, and only the owner
//   sharedGroups/<key>/<uid>/$id     allowed   owner of that uid, per leaf
//   sharedGroups/<key>/<uid>         REFUSED   the grant is one level deeper
//
// So THE ACCOUNT can be deleted - the Auth user is deleted by the client, which is
// what 5.1.1(v) is about - and the groups and every co-organizer pointer they
// created go with it. TWO KEYS SURVIVE: firstSeenAt and pass. A rules change is the
// only way to remove those and rules are Manny's call, so nothing here pretends
// otherwise: the second warning SAYS the founder pass does not come back, and the
// plan returns them as `keeps`, each with the rule that refuses it.
//
// WHY THAT IS NOT A HOLE. uids are never reused, and organizers/<uid> is readable
// only by auth.uid === <uid>, which no longer exists. The leftover is two numbers
// nobody can reach. It is data retention to tidy, not an account that still exists.
//
// THE ORDER IS LOAD-BEARING, and it is the one thing here that cannot be got wrong
// twice: the DATA goes first, while the token is still valid, and the Auth user
// LAST. Delete the user first and every write after it is permission-denied
// forever, because the only credential that could authorise them is gone.
//
// AND A FAILED REMOVAL STOPS THE DELETE. If the groups write fails - no signal at
// the course, a rule that changed - the account is NOT deleted, because deleting it
// would strand data the person can never remove afterwards (the read needs the uid
// they just destroyed). Every removal is idempotent, so the honest answer is "try
// again with signal" and a retry finishes the job.
//
// ROUNDS ARE NOT TOUCHED. events/* stays exactly as it is, and that is deliberate
// rather than an oversight: other golfers may be scoring one of those rounds right
// now, the round code is what they typed in, and ownerUid on a finished round is
// what the Receipt reads. The warning says so in those words - the rounds stay in
// the round codes - because a golfer who expects "delete everything" and gets
// "delete my organizer powers" deserves to know which one this is.
//
// THE SERVER FINISHES IT (store-legal, 2026-10-17). App Review 5.1.1(v) also wants
// Sign in with Apple tokens REVOKED and nothing left behind. Revoking needs a
// secret that never ships in an app, and the rules never let a client remove the
// whole organizers/<uid> record, so the callable Cloud Function accountDelete
// (firebase-functions/account-delete-core.js) does both with the Admin SDK:
//   1. an Apple account first asks the native Apple sheet for a FRESH authorization
//      code (deps.appleCode) - before anything is touched, so cancelling it deletes
//      nothing;
//   2. the client removes what the rules let it (the pointers, pushTokens/<uid>,
//      pushPrefs/<uid>, the record or its groups), exactly as before;
//   3. deps.serverDelete hands the code to accountDelete, which revokes the Apple
//      token, removes organizers/<uid>, pushTokens/<uid>, pushPrefs/<uid> and the
//      pointers for good, and deletes the Auth user. A refusal (Apple said no) STOPS
//      here and the account is NOT deleted.
// WHILE THE FUNCTION IS NOT DEPLOYED (a 404, or no answer at all) the old client
// delete runs instead, so Google, email-link and Apple accounts can all still delete
// themselves from this build today. Only a structured answer from the function is
// trusted as a refusal.
//
// SIGN OUT IS NOT A LIGHTER DELETE. It ends the session and the device falls back
// to a fresh anonymous organizer, which is a DIFFERENT organizer: the rounds set up
// on the old account are still in their round codes and still owned by that
// account, and getting the organizer screens back means signing in again. Both
// actions therefore warn first, and the warnings say different things.
//
// WHY BOTH RELOAD. window.authReady (auth-boot.js) is a ONE-SHOT promise that
// resolves to the first uid it sees, and organizer-gate.js reads
// organizers/<uid> through it. After a sign-out the page would keep asking about
// the old uid until something re-ran. A reload re-runs auth-boot, which restores or
// creates the anonymous user cleanly, and every stale read goes with it. The reload
// is injected as a dependency, so the tests drive the whole flow without one.
// ============================================================================
(function () {
    'use strict';

    // ---- THE WORDS. Plain, and each one says what actually happens. -------
    var WORDS = {
        signOutWarn: 'Sign out? The rounds you set up here stay where they are - they are still in their round codes, and they still belong to this account. This device goes back to being a new organizer, so to get the organizer screens back you sign in again with the same Apple ID, Google account or email.',
        signOutGo: 'Sign out',
        deleteWarn1: 'Delete this account? This removes the account itself, your saved groups, any co-organizer invites you sent, and your notification settings. It does NOT delete rounds: a round you set up stays in its round code, so anybody still scoring it keeps scoring it.',
        deleteWarn2: 'Last check. This cannot be undone: the account is gone, the saved groups are gone, and signing in again with the same Apple ID, Google account or email makes a NEW organizer that has none of it.',
        deleteGo: 'Delete my account',
        deleting: 'Deleting…',
        signingOut: 'Signing out…',
        keep: 'Keep my account',
        // The founder-pass sentence is separate because it is the one thing here
        // somebody would be furious to learn afterwards.
        // TRUE BEFORE AND AFTER THE RULES PUBLISH, which is why it does not say where
        // the pass ends up. Today the rules refuse to remove it and it is stranded on
        // an account that no longer exists; once the delete rule is published it goes
        // with the record. Either way it is gone for the person reading this, and a
        // sentence that named the mechanism would be wrong within the week.
        founderWarn: 'THIS ACCOUNT HAS A FOUNDER PASS. Deleting the account gives up that pass for good: nothing brings it back, and signing in again with the same Apple ID, Google account or email makes a NEW organizer that does not have it. If you want the pass, do not delete this account.',
        founderMaybe: 'If this account has a founder pass or a running free trial, it stays attached to this account and a new one does not get it.',
        // SEPARATE FROM founderMaybe ON PURPOSE. "We could not check" and "there is
        // probably nothing" read the same to a golfer and are not the same fact, and
        // the incident happened in exactly the state this sentence describes.
        founderUnknown: 'This device could not check whether this account holds a founder pass or a running free trial. If it does, deleting the account gives it up for good. Check on a connection first if that matters to you.'
    };

    // ---- ANDROID: EMAIL ONLY, AND NO TRIAL (job 012) ----------------------
    // The Android app signs in by email alone, and its Play listing promises no trial
    // and sells no pass. So the Apple ID / Google phrase becomes "email", and the two
    // sentences that raise a trial for everybody become neutral. founderWarn keeps
    // its pass: it only reaches an account that HOLDS one, and losing it is the fact.
    // iOS and the website keep every word above.
    function androidShell() {
        try { return !!(window.Capacitor && typeof window.Capacitor.getPlatform === 'function' && window.Capacitor.getPlatform() === 'android'); }
        catch (e) { return false; }
    }
    var ANDROID = androidShell();
    if (ANDROID) {
        ['signOutWarn', 'deleteWarn2', 'founderWarn'].forEach(function (k) {
            WORDS[k] = WORDS[k].replace('the same Apple ID, Google account or email', 'the same email');
        });
        WORDS.founderMaybe = 'Anything attached to this account stays with it, and a new account does not get it.';
        WORDS.founderUnknown = 'This device could not check what is attached to this account. If something is, deleting the account gives it up for good. Check on a connection first if that matters to you.';
    }

    // WHAT THE LIVE RULES REFUSE TO LET GO OF, with the rule that refuses it. Held
    // here rather than in a comment so the plan can HAND it to the screen and the
    // guard can assert the pair.
    // WHAT SURVIVES A DELETE WHILE THE DELETE RULE IS UNPUBLISHED, with the rule that
    // refuses each one. Held here rather than in a comment so the plan can HAND it to
    // the screen and the guard can assert the pair. Once
    // database.rules.stage2delete.json is published the whole-record removal takes
    // both of these with it and nothing is kept - the result object's recordRemoved
    // is what says which of the two worlds a given delete happened in.
    var KEEPS = [
        { key: 'firstSeenAt', why: 'the rule allows it to be created and never written again' },
        { key: 'pass', why: 'the rule sets .write to false, so nobody may remove a pass' }
    ];

    // ---- THE INCIDENT THIS SECTION EXISTS BECAUSE OF -----------------------
    //
    // 2026-09-30. Manny set out to test Delete account with a throwaway and deleted
    // his REAL organizer, k8fYkL1hsPb6ZDL3wgQi8hywPi42, founder pass and all. Rounds
    // were untouched, as designed. The path, from the code:
    //
    //   1. He was signed in as the real account and tapped Continue with Google with
    //      what he believed was a throwaway. planOauth() sees a NON-anonymous user,
    //      so it takes the sign-in branch - and Firebase, with one-account-per-email,
    //      AUTO-LINKS a verified Google credential to the existing account that has
    //      that email. So he was signed into the SAME uid, and noteFor() correctly
    //      said "This is the same organizer account".
    //   2. The delete then deleted exactly that account, and it was right to.
    //
    // THE FOUNDER-PASS WARNING DID NOT SHOUT, and that is the bug in this file rather
    // than in his tapping. The loud sentence needs standingOf() to see a pass, and the
    // record it reads was fetched ONCE at page load, by organizer-gate.js readStanding,
    // through window.authReady - a ONE-SHOT promise that resolves to the uid the page
    // BOOTED with. Sign in inside the panel and the uid changes underneath a record
    // nothing re-reads. He had signed out first, so the boot uid was anonymous, its
    // record was null, and deleteWarning() produced the HEDGED line - "if this account
    // has a founder pass" - instead of the one in capitals.
    //
    // SO THIS FILE NOW READS THE PASS ITSELF, off auth.currentUser.uid, at the moment
    // of the delete. Not authReady, which is the boot uid; not a record cached at
    // load. accountStanding() below is that read, and the screen refuses to delete a
    // pass-holding account on a tap alone - it has to be typed.
    function coded(code, message) {
        var e = new Error(message || code);
        e.code = code;
        return e;
    }

    // ---- WHO YOU ARE SIGNED IN AS, IN WORDS ------------------------------
    //
    // The line the panel shows instead of two buttons that would sign you into
    // something else. providerData is what Firebase says is ON the account, so
    // "Apple" appears because apple.com is linked, not because Apple was the last
    // thing tapped.
    var PROVIDER_LABEL = {
        'apple.com': 'Apple',
        'google.com': 'Google',
        'password': 'email',
        'emailLink': 'email link'
    };
    function accountProviders(user) {
        var list = (user && user.providerData) || [];
        var out = [];
        for (var i = 0; i < list.length; i += 1) {
            var id = list[i] && list[i].providerId;
            if (!id) continue;
            var label = PROVIDER_LABEL[id] || String(id);
            if (out.indexOf(label) === -1) out.push(label);
        }
        return out;
    }
    function describeAccount(user) {
        if (!user || !user.uid || user.isAnonymous) return '';
        var who = user.email || 'this account';
        var p = accountProviders(user);
        // Android names no providers: an account linked to Apple and Google on an
        // iPhone would read "(Apple and Google and email)" in an app with neither.
        return 'Signed in as ' + who + (p.length && !ANDROID ? ' (' + p.join(' and ') + ')' : '');
    }

    // ---- WHO SEES THE CARD AT ALL ----------------------------------------
    // The same test accountIsLinked() makes on the page: a real, non-anonymous
    // user. An anonymous organizer has no account to sign out of or delete, and
    // offering either would promise something that cannot happen.
    function planExit(user) {
        if (!user || !user.uid) return { show: false, reason: 'no-user' };
        if (user.isAnonymous) return { show: false, reason: 'anonymous' };
        return { show: true, reason: 'linked', uid: String(user.uid) };
    }

    // ---- WHAT A DELETE TOUCHES, AS A LIST --------------------------------
    // Pure: uid plus the value of organizers/<uid>/groups. Every path here is one
    // the live rules allow the owner to write; everything the rules refuse is in
    // `keeps` with its reason, so the caller can say so rather than fail silently.
    function deletePlan(uid, groupsVal) {
        var id = String(uid || '');
        var removals = [];
        var groups = (groupsVal && typeof groupsVal === 'object') ? groupsVal : {};
        var groupIds = Object.keys(groups);
        // THE POINTERS FIRST, because they are the ones whose paths are only
        // knowable while the groups are still there. Order inside the list is the
        // order they are performed in.
        var pointers = 0;
        groupIds.forEach(function (gid) {
            var g = groups[gid] || {};
            var co = (g.coOrganizers && typeof g.coOrganizers === 'object') ? g.coOrganizers : {};
            Object.keys(co).forEach(function (emailKey) {
                if (co[emailKey] !== true) return;
                pointers += 1;
                removals.push({
                    path: 'sharedGroups/' + emailKey + '/' + id + '/' + gid,
                    what: 'the co-organizer invite for ' + emailKey + ' on ' + gid
                });
            });
        });
        // THE PUSH RECORDS (store-legal): this account's device tokens and its
        // notification switches. Both are owner-writable in the rules, and SOFT,
        // because accountDelete removes them again with the Admin SDK - a refusal
        // here (an older ruleset) must not keep an account alive.
        removals.push({ path: 'pushTokens/' + id, what: 'the notification tokens for your devices', soft: true });
        removals.push({ path: 'pushPrefs/' + id, what: 'your notification settings', soft: true });
        // THE WHOLE RECORD FIRST, AND THE GROUPS AS A FALLBACK. Stage 1 refuses a
        // write at organizers/<uid>, so until the delete rule is published this
        // attempt is permission-denied and the groups write is what actually runs.
        // Once it IS published, the first attempt succeeds and takes firstSeenAt and
        // the pass with it, and the fallback never runs.
        //
        // WHY BOTH, RATHER THAN SHIPPING AFTER THE PUBLISH. This is the feature
        // detection: the same build is correct before and after, so the wave can be
        // tested on a device today and the publish can happen whenever Manny wants
        // without a second release. `soft: true` is what tells removeAll that a
        // refusal here is expected rather than the STOP condition.
        removals.push({
            path: 'organizers/' + id,
            what: 'the account record itself, including firstSeenAt and any pass',
            soft: true
        });
        // ONE WRITE FOR EVERY GROUP. The rules grant the owner the whole subtree,
        // so this is one removal rather than one per group - fewer writes to fail
        // half way through.
        if (groupIds.length) {
            removals.push({
                path: 'organizers/' + id + '/groups',
                what: groupIds.length === 1 ? 'the saved group' : 'all ' + groupIds.length + ' saved groups',
                // AND IT IS SOFT TOO, because once the record above is gone there is
                // nothing left to remove and the rules may refuse a write under a
                // node that no longer exists. Neither path failing is a reason to
                // keep an account alive; the pointers are the ones that must land.
                afterRecord: true,
                soft: true
            });
        }
        return {
            uid: id,
            removals: removals,
            groupCount: groupIds.length,
            pointerCount: pointers,
            keeps: KEEPS.map(function (k) {
                return { path: 'organizers/' + id + '/' + k.key, why: k.why };
            })
        };
    }

    // The second warning, built from what is known. An unknown standing gets the
    // hedged sentence rather than silence: "we could not read it" is not a reason
    // to let somebody delete a pass without being told a pass is possible.
    function deleteWarning(standing) {
        var kind = standing && standing.kind;
        if (kind === 'pass' && standing.passKind === 'founder') {
            return WORDS.deleteWarn2 + ' ' + WORDS.founderWarn;
        }
        return WORDS.deleteWarn2 + ' ' + WORDS.founderMaybe;
    }

    // THE PASS, READ NOW, OFF THE UID THAT IS SIGNED IN. Resolves to
    //   { pass: true, kind: 'founder' }   a live pass on THIS account
    //   { pass: false }                   a record with no pass
    //   { unknown: true }                 no session, a refused read, or too slow
    // An UNKNOWN is never treated as "no pass": the delete still warns, and the
    // incident above is what that rule is for.
    var STANDING_MS = 4000;
    function accountStanding(deps) {
        var auth = deps && deps.auth;
        var db = deps && deps.db;
        var user = auth && auth.currentUser;
        if (!user || !user.uid || !db || typeof db.ref !== 'function') {
            return Promise.resolve({ unknown: true });
        }
        var read;
        try {
            read = Promise.resolve(db.ref('organizers/' + user.uid).once('value')).then(function (snap) {
                var v = (snap && typeof snap.val === 'function') ? snap.val() : null;
                var pass = v && v.pass;
                if (!pass) return { pass: false };
                var exp = Number(pass.expiresAt || 0);
                if (exp && exp < Date.now()) return { pass: false, expired: true };
                return { pass: true, kind: String(pass.kind || '') };
            }, function () { return { unknown: true }; });
        } catch (e) { return Promise.resolve({ unknown: true }); }
        var timer = new Promise(function (resolve) {
            setTimeout(function () { resolve({ unknown: true }); }, STANDING_MS);
        });
        return Promise.race([read, timer]);
    }
    // A FOUNDER PASS CANNOT BE GIVEN UP ON A TAP. Typing is the point: it is the one
    // thing on this screen that cannot be done by accident, and the incident above is
    // a person who meant to delete a different account.
    var TYPE_WORD = 'DELETE';
    function deleteNeedsTyping(standing) {
        return !!(standing && standing.pass && standing.kind === 'founder');
    }
    function typedIsRight(typed) {
        return String(typed === null || typed === undefined ? '' : typed).trim().toUpperCase() === TYPE_WORD;
    }
    // The last-check sentence, now NAMING the account. "Delete account" with no name
    // on it is what let a real organizer be deleted in place of a throwaway.
    function deleteFinalWarning(user, standing) {
        var who = describeAccount(user);
        var head = who ? who.replace(/^Signed in as /, 'You are about to delete ') + '.' : '';
        if (deleteNeedsTyping(standing)) {
            return (head ? head + ' ' : '') + WORDS.deleteWarn2 + ' ' + WORDS.founderWarn
                + ' Type ' + TYPE_WORD + ' to confirm.';
        }
        if (standing && standing.unknown) {
            return (head ? head + ' ' : '') + WORDS.deleteWarn2 + ' ' + WORDS.founderUnknown;
        }
        return (head ? head + ' ' : '') + WORDS.deleteWarn2 + ' ' + WORDS.founderMaybe;
    }

    // ---- ERRORS ----------------------------------------------------------
    function needsReauth(err) {
        var code = err && err.code;
        return code === 'auth/requires-recent-login' || code === 'requires-recent-login';
    }
    function messageFor(err) {
        var code = err && err.code;
        if (code === 'no-user' || code === 'anonymous') return 'There is no account signed in on this device.';
        if (code === 'removal-failed') return 'Could not remove your saved groups, so the account was NOT deleted - nothing is half gone. Try again when you have signal.';
        if (code === 'auth/network-request-failed' || code === 'network') return 'No connection. Nothing changed - try again when you have signal.';
        if (code === 'PERMISSION_DENIED' || code === 'permission-denied') return 'The database refused the change, so the account was NOT deleted. Nothing is half gone.';
        if (code === 'auth/requires-recent-login') return 'Sign in once more to prove it is you, then delete.';
        if (code === 'reauth-cancelled') return 'Sign-in was cancelled, so nothing was deleted.';
        if (code === 'apple-revoke-failed') return 'Apple did not confirm that this app was removed from your Apple ID, so the account was NOT deleted. Try again in a moment - it picks up where it stopped.';
        if (code === 'apple-account-mismatch') return 'That Apple ID is not the one on this account, so the account was NOT deleted. Use the Apple ID this account signs in with.';
        if (code === 'internal' || code === 'server-refused' || code === 'unavailable') return 'The server could not finish, so the account was NOT deleted. Try again when you have signal.';
        if (code === 'apple-not-configured') return 'Deleting an Apple account is not switched on yet, so nothing was deleted. Email support@rattlegolf.com and it will be done for you.';
        // Wave 33's lesson, one wave later: an unmapped code is SHOWN. The shell
        // has no visible console, and a sentence that hides which failure it was
        // costs a trip to a physical device to find out.
        if (code) return 'Could not finish. Nothing was deleted. (' + String(code) + ')';
        return 'Could not finish. Nothing was deleted.';
    }

    // ---- THE TWO ACTIONS. Every dependency is injected, so the tests drive the
    // whole flow with fakes and nothing here reaches a network or a page. ----
    function signOut(deps) {
        var auth = deps && deps.auth;
        if (!auth || typeof auth.signOut !== 'function') return Promise.reject(coded('no-user'));
        return Promise.resolve(auth.signOut()).then(function () {
            if (deps && typeof deps.reload === 'function') deps.reload();
            return { signedOut: true };
        });
    }

    function readGroups(db, uid) {
        if (!db || typeof db.ref !== 'function') return Promise.resolve(null);
        try {
            return Promise.resolve(db.ref('organizers/' + uid + '/groups').once('value'))
                .then(function (snap) {
                    return (snap && typeof snap.val === 'function') ? snap.val() : null;
                }, function () {
                    // A refused or offline read is NOT "there are no groups". Say so
                    // by failing, rather than deleting an account and leaving groups
                    // nobody can reach behind it.
                    throw coded('removal-failed', 'could not read the saved groups');
                });
        } catch (e) { return Promise.reject(coded('removal-failed', 'could not read the saved groups')); }
    }

    // Returns { failed, done }. A SOFT removal that is refused is recorded in `done`
    // as not-done and never in `failed`: the whole-record attempt is expected to be
    // refused until the rules are published, and treating that as the STOP would mean
    // nobody could delete an account at all today.
    function removeAll(db, removals) {
        var failed = [];
        var done = {};
        var recordGone = false;
        return removals.reduce(function (chain, r) {
            return chain.then(function () {
                // Once the whole record is gone, the groups write under it is moot.
                if (r.afterRecord && recordGone) { done[r.path] = 'skipped'; return; }
                return Promise.resolve(db.ref(r.path).remove()).then(function () {
                    done[r.path] = 'removed';
                    if (r.path.indexOf('/groups') === -1 && /^organizers\/[^/]+$/.test(r.path)) recordGone = true;
                }, function (err) {
                    var code = (err && err.code) || 'remove-failed';
                    done[r.path] = 'refused:' + code;
                    if (!r.soft) failed.push({ path: r.path, code: code });
                });
            });
        }, Promise.resolve()).then(function () { return { failed: failed, done: done }; });
    }

    function dropUser(auth, deps) {
        var user = auth.currentUser;
        if (!user || typeof user.delete !== 'function') return Promise.reject(coded('no-user'));
        return Promise.resolve(user.delete()).then(function () { return false; }, function (err) {
            if (!needsReauth(err)) throw err;
            // FIREBASE ASKS FOR A FRESH SIGN-IN BEFORE IT DELETES, and it is right
            // to: this is the destructive one. The re-auth is whatever the page
            // hands in - the same Apple, Google or email path that signed in.
            var again = deps && deps.reauth;
            if (typeof again !== 'function') throw err;
            return Promise.resolve(again()).then(function () {
                var fresh = auth.currentUser;
                if (!fresh || typeof fresh.delete !== 'function') throw coded('no-user');
                return Promise.resolve(fresh.delete()).then(function () { return true; });
            });
        });
    }

    function hasProvider(user, id) {
        var list = (user && user.providerData) || [];
        for (var i = 0; i < list.length; i += 1) if (list[i] && list[i].providerId === id) return true;
        return false;
    }

    // THE APPLE CODE, ASKED FOR BEFORE ANYTHING IS TOUCHED. Only when there is a
    // server to hand it to and the account has Apple on it. Null means "none to
    // give" (the web, or no plugin) and the server deletes without revoking; a
    // rejection means the golfer backed out of the Apple sheet, and nothing goes.
    function appleCodeFor(user, deps) {
        if (!hasProvider(user, 'apple.com')) return Promise.resolve(null);
        if (typeof deps.serverDelete !== 'function' || typeof deps.appleCode !== 'function') return Promise.resolve(null);
        var asked;
        try { asked = Promise.resolve(deps.appleCode()); } catch (e) { asked = Promise.reject(e); }
        return asked.then(function (r) {
            if (!r) return null;
            return typeof r === 'string' ? { code: r } : (r.code ? r : null);
        }, function (err) {
            var m = String((err && (err.code || err.message)) || '').toLowerCase();
            if (/cancel|1001/.test(m)) throw coded('reauth-cancelled');
            throw err;
        });
    }

    // THE SERVER'S ANSWER. Resolves { server: true, result } when accountDelete did
    // the job, { server: false } when there is no function to ask (not deployed,
    // or no answer at all), and rejects with the function's own reason otherwise.
    function askServer(deps, apple) {
        if (typeof deps.serverDelete !== 'function') return Promise.resolve({ server: false });
        var payload = {};
        if (apple && apple.code) payload.appleAuthorizationCode = String(apple.code);
        if (apple && apple.bundleId) payload.appleClientId = String(apple.bundleId);
        var call;
        try { call = Promise.resolve(deps.serverDelete(payload)); } catch (e) { call = Promise.reject(e); }
        return call.then(function (result) {
            if (result && result.status === 'deleted') return { server: true, result: result };
            throw coded('server-refused', 'accountDelete answered ' + String(result && result.status));
        }, function (err) {
            if (err && err.code === 'server-absent') return { server: false };
            throw err;
        });
    }

    function deleteAccount(deps) {
        var auth = deps && deps.auth;
        var db = deps && deps.db;
        var user = auth && auth.currentUser;
        var plan = planExit(user);
        if (!plan.show) return Promise.reject(coded(plan.reason));
        var uid = plan.uid;
        return appleCodeFor(user, deps).then(function (apple) {
            return readGroups(db, uid).then(function (groupsVal) {
                var p = deletePlan(uid, groupsVal);
                return removeAll(db, p.removals).then(function (out) {
                    // THE STOP. Data first, and if a HARD removal did not go, the
                    // account stays - see the header. A soft one is allowed to fail.
                    if (out.failed.length) throw coded('removal-failed',
                        'could not remove ' + out.failed.length + ' of ' + p.removals.length);
                    // THE SCAN COUNTS (088): asked while the session is still
                    // good, and never a reason to stop - see scanEraser.
                    return eraseScanCounts(deps).then(function (scan) {
                    return askServer(deps, apple).then(function (srv) {
                        var finish = function (reauthed) {
                            if (deps && typeof deps.reload === 'function') deps.reload();
                            return {
                                uid: uid, deleted: true, reauthed: !!reauthed,
                                removed: p.removals.map(function (r) { return r.path; }),
                                done: out.done,
                                // TRUE when the whole record went: the client's own
                                // write did it, or the server did.
                                recordRemoved: srv.server || out.done['organizers/' + uid] === 'removed',
                                server: !!srv.server,
                                appleRevoked: !!(srv.server && srv.result.appleRevoked),
                                keeps: srv.server ? [] : p.keeps,
                                scanErased: !!scan.erased,
                                scanErasePending: !!scan.pending
                            };
                        };
                        if (srv.server) {
                            // The Auth user is gone on the server; this device's
                            // session goes with a sign-out, then the reload.
                            var so;
                            try { so = Promise.resolve(auth.signOut && auth.signOut()); } catch (e) { so = Promise.resolve(); }
                            return so.then(function () { return finish(false); }, function () { return finish(false); });
                        }
                        return dropUser(auth, deps).then(finish, function (err) {
                            // A server that DID delete the user but whose answer was
                            // lost: the account is already gone, which is the goal.
                            var c = err && err.code;
                            if (typeof deps.serverDelete === 'function'
                                && (c === 'auth/user-not-found' || c === 'auth/user-token-expired')) return finish(false);
                            throw err;
                        });
                    });
                    });
                });
            });
        });
    }

    function eraseScanCounts(deps) {
        if (!deps || typeof deps.scanErase !== 'function') return Promise.resolve({ erased: false, pending: false });
        var call;
        try { call = Promise.resolve(deps.scanErase()); } catch (e) { call = Promise.reject(e); }
        return call.then(function (r) { return r || { erased: false, pending: false }; },
            function () { return { erased: false, pending: false }; });
    }

    // THE DEFAULT serverDelete: a callable function by plain fetch, the same way
    // gps-live.js calls gpsSearch (no extra Firebase SDK in the app). POST { data }
    // with the user's ID token; the answer is { result } or { error }.
    //   no answer at all, a 404, or not JSON  -> 'server-absent' (not deployed yet)
    //   { error: { details: { reason } } }    -> that reason (apple-revoke-failed ...)
    //   { error: { status } }                  -> the status, lower-cased
    var FN_BASE = 'https://us-central1-golfapp-9fb21.cloudfunctions.net';
    var FN_MS = 25000;
    function serverDeleter(opts) {
        var o = opts || {};
        var doFetch = o.fetch;
        var base = String(o.base || FN_BASE).replace(/\/+$/, '');
        return function (payload) {
            var user = o.auth && o.auth.currentUser;
            if (typeof doFetch !== 'function' || !user || typeof user.getIdToken !== 'function') {
                return Promise.reject(coded('server-absent'));
            }
            return Promise.resolve(user.getIdToken()).then(function (tok) {
                var ctl = typeof AbortController === 'function' ? new AbortController() : null;
                var t = ctl ? setTimeout(function () { ctl.abort(); }, FN_MS) : null;
                return Promise.resolve(doFetch(base + '/accountDelete', {
                    method: 'POST', credentials: 'omit', signal: ctl ? ctl.signal : undefined,
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
                    body: JSON.stringify({ data: payload || {} })
                })).then(function (r) {
                    if (t) clearTimeout(t);
                    if (!r || r.status === 404) throw coded('server-absent');
                    return Promise.resolve(r.json()).then(null, function () { throw coded('server-absent'); });
                }, function () {
                    if (t) clearTimeout(t);
                    throw coded('server-absent');
                });
            }).then(function (j) {
                if (j && j.result) return j.result;
                var e = (j && j.error) || {};
                var reason = (e.details && e.details.reason) || String(e.status || 'server-refused').toLowerCase().replace(/_/g, '-');
                throw coded(reason, e.message || reason);
            });
        };
    }


    // ---- THE SCAN COUNTS (088 item 1, a 078 "ADDED Oct 26" must-have) --------------
    //
    // The scorecard-scan server keeps a few numbers under the account id (the free
    // scans used, the course-card scans used, the per-minute and per-day counts:
    // functions/api/_scan.js). Delete account now asks POST /api/scan-erase to drop
    // them. The server takes the uid from the ID token, so this can only ever
    // erase THIS account's counts.
    //
    // IT NEVER STOPS A DELETE. No signal, a slow server, a server that is not
    // deployed yet: the delete carries on and the token is kept on the phone
    // (PENDING_KEY) so the next time this page loads it tries again, until the
    // token runs out (about an hour) - after that nothing can prove the counts
    // are ours, and the pending note is dropped. A refused token is dropped too.
    var SCAN_ERASE_ROUTE = '/api/scan-erase';
    var SCAN_FALLBACK_ORIGIN = 'https://golf-app-5a5.pages.dev';   // product-links.js GOLF_WEB_ORIGIN
    var SCAN_PENDING_KEY = 'hp.scanErasePending';
    var SCAN_MS = 8000;
    var W = typeof window !== 'undefined' ? window : globalThis;
    // The same rule as gps-scan-client.js apiBase(): the native app's pages are
    // capacitor://localhost, so the route is on the web origin; the web is same-origin.
    function scanApiBase() {
        try {
            var native = W.document && W.document.documentElement && W.document.documentElement.classList
                && W.document.documentElement.classList.contains('is-native');
            if (!native && W.Capacitor && typeof W.Capacitor.isNativePlatform === 'function') native = W.Capacitor.isNativePlatform();
            if (!native) return '';
            return (typeof GOLF_WEB_ORIGIN === 'string' && GOLF_WEB_ORIGIN) || SCAN_FALLBACK_ORIGIN;   /* global GOLF_WEB_ORIGIN */
        } catch (e) { return ''; }
    }
    function tokenExpiryMs(tok) {
        try {
            var part = String(tok).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            var json = typeof atob === 'function' ? atob(part + '==='.slice((part.length + 3) % 4))
                : Buffer.from(part, 'base64').toString('utf8');   /* global Buffer */
            var exp = Number(JSON.parse(json).exp);
            return exp > 0 ? exp * 1000 : 0;
        } catch (e) { return 0; }
    }
    // One POST. Resolves 'erased' | 'refused' (the token was not accepted) | 'failed'.
    function postErase(doFetch, base, tok) {
        var ctl = typeof AbortController === 'function' ? new AbortController() : null;
        var t = ctl ? setTimeout(function () { ctl.abort(); }, SCAN_MS) : null;
        var call;
        try {
            call = Promise.resolve(doFetch(base + SCAN_ERASE_ROUTE, {
                method: 'POST', credentials: 'omit', signal: ctl ? ctl.signal : undefined,
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
                body: '{}'
            }));
        } catch (e) { call = Promise.reject(e); }
        return call.then(function (r) {
            if (t) clearTimeout(t);
            if (!r) return 'failed';
            if (r.status === 401) return 'refused';
            return Promise.resolve(r.json()).then(function (j) {
                return j && j.status === 'erased' ? 'erased' : 'failed';
            }, function () { return 'failed'; });
        }, function () {
            if (t) clearTimeout(t);
            return 'failed';
        });
    }
    function storeOf(o) {
        if (o && o.storage) return o.storage;
        try { return W.localStorage || null; } catch (e) { return null; }
    }
    function stash(store, tok) {
        var until = tokenExpiryMs(tok);
        if (!store || !until) return false;
        try { store.setItem(SCAN_PENDING_KEY, JSON.stringify({ token: tok, until: until })); return true; } catch (e) { return false; }
    }
    function unstash(store) { try { if (store) store.removeItem(SCAN_PENDING_KEY); } catch (e) { } }
    // deps.scanErase for deleteAccount. Resolves { erased, pending } and NEVER rejects.
    function scanEraser(opts) {
        var o = opts || {};
        return function () {
            var doFetch = o.fetch;
            var user = o.auth && o.auth.currentUser;
            if (typeof doFetch !== 'function' || !user || typeof user.getIdToken !== 'function') {
                return Promise.resolve({ erased: false, pending: false });
            }
            var base = String(o.base !== undefined ? o.base : scanApiBase()).replace(/\/+$/, '');
            var store = storeOf(o);
            var tok = null;
            var got;
            try { got = Promise.resolve(user.getIdToken()); } catch (e) { got = Promise.reject(e); }
            return got.then(function (t) {
                tok = t;
                return postErase(doFetch, base, t);
            }).then(function (res) {
                if (res === 'erased') { unstash(store); return { erased: true, pending: false }; }
                if (res === 'refused') return { erased: false, pending: false };
                return { erased: false, pending: stash(store, tok) };
            }, function () {
                return { erased: false, pending: false };
            });
        };
    }
    // THE RETRY, on the next page load. Resolves 'none' | 'erased' | 'expired' |
    // 'refused' | 'failed' (kept for the next load). Never rejects.
    function retryScanErase(opts) {
        var o = opts || {};
        var store = storeOf(o);
        var raw = null;
        try { raw = store ? store.getItem(SCAN_PENDING_KEY) : null; } catch (e) { raw = null; }
        if (!raw) return Promise.resolve('none');
        var rec = null;
        try { rec = JSON.parse(raw); } catch (e) { rec = null; }
        var now = typeof o.now === 'function' ? o.now() : Date.now();
        if (!rec || typeof rec.token !== 'string' || !(rec.until > now)) { unstash(store); return Promise.resolve('expired'); }
        if (typeof o.fetch !== 'function') return Promise.resolve('failed');
        var base = String(o.base !== undefined ? o.base : scanApiBase()).replace(/\/+$/, '');
        return postErase(o.fetch, base, rec.token).then(function (res) {
            if (res !== 'failed') unstash(store);
            return res;
        });
    }

    window.accountExit = {
        WORDS: WORDS,
        KEEPS: KEEPS,
        planExit: planExit,
        describeAccount: describeAccount,
        accountProviders: accountProviders,
        accountStanding: accountStanding,
        deleteNeedsTyping: deleteNeedsTyping,
        typedIsRight: typedIsRight,
        deleteFinalWarning: deleteFinalWarning,
        TYPE_WORD: TYPE_WORD,
        deletePlan: deletePlan,
        deleteWarning: deleteWarning,
        needsReauth: needsReauth,
        messageFor: messageFor,
        signOut: signOut,
        deleteAccount: deleteAccount,
        serverDeleter: serverDeleter,
        scanEraser: scanEraser,
        retryScanErase: retryScanErase,
        SCAN_PENDING_KEY: SCAN_PENDING_KEY
    };

    // A DELETE THAT COULD NOT REACH THE SCAN SERVER left a note; this load tries it
    // again. Only when there is a note, so a page with nothing pending does nothing.
    try {
        if (typeof W.fetch === 'function' && W.localStorage && W.localStorage.getItem(SCAN_PENDING_KEY)) {
            retryScanErase({ fetch: function (u, o) { return W.fetch(u, o); } });
        }
    } catch (e) { }
})();
