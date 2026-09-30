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
        deleteWarn1: 'Delete this account? This removes the account itself, your saved groups, and any co-organizer invites you sent. It does NOT delete rounds: a round you set up stays in its round code, so anybody still scoring it keeps scoring it.',
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
        founderMaybe: 'If this account has a founder pass or a running free trial, it stays attached to this account and a new one does not get it.'
    };

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

    function coded(code, message) {
        var e = new Error(message || code);
        e.code = code;
        return e;
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

    function deleteAccount(deps) {
        var auth = deps && deps.auth;
        var db = deps && deps.db;
        var user = auth && auth.currentUser;
        var plan = planExit(user);
        if (!plan.show) return Promise.reject(coded(plan.reason));
        var uid = plan.uid;
        return readGroups(db, uid).then(function (groupsVal) {
            var p = deletePlan(uid, groupsVal);
            return removeAll(db, p.removals).then(function (out) {
                // THE STOP. Data first, and if a HARD removal did not go, the
                // account stays - see the header. A soft one is allowed to fail.
                if (out.failed.length) throw coded('removal-failed',
                    'could not remove ' + out.failed.length + ' of ' + p.removals.length);
                return dropUser(auth, deps).then(function (reauthed) {
                    if (deps && typeof deps.reload === 'function') deps.reload();
                    return {
                        uid: uid, deleted: true, reauthed: !!reauthed,
                        removed: p.removals.map(function (r) { return r.path; }),
                        done: out.done,
                        // TRUE only when the whole record actually went, which is the
                        // one fact that says whether the rules publish has landed.
                        recordRemoved: out.done['organizers/' + uid] === 'removed',
                        keeps: p.keeps
                    };
                });
            });
        });
    }

    window.accountExit = {
        WORDS: WORDS,
        KEEPS: KEEPS,
        planExit: planExit,
        deletePlan: deletePlan,
        deleteWarning: deleteWarning,
        needsReauth: needsReauth,
        messageFor: messageFor,
        signOut: signOut,
        deleteAccount: deleteAccount
    };
})();
