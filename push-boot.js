// ============================================================================
// THE DEVICE HALF OF NOTIFICATIONS (Wave 39)
//
// Everything that touches a plugin, a token or the database lives here. The
// decisions live elsewhere and are pure: push-notify.js says what to send and
// how often. This file is the wiring
// between them and a phone, and it is written so that NOTHING HAPPENS AT ALL
// until the pieces exist.
//
// INERT BY DEFAULT, AND THAT IS THE POINT. The APNs key, the Firebase upload,
// the Xcode capability and the Cloudflare secret are all Manny's steps and none
// of them is done yet. So:
//
//   - On a BROWSER there is no plugin: every entry point here returns a reason
//     and does nothing. The web app behaves exactly as it does today.
//   - In the SHELL without an APNs key, register() rejects. That is caught, the
//     reason is recorded, and the app carries on. No alert, no retry loop.
//   - THERE IS NO TEE-TIME REMINDER. One was built here as a local notification
//     and REMOVED on Manny's call before it shipped. The tee-time FIELD went
//     the same way on 2026-10-04: there is no tee time anywhere in the UI.
//     Nothing is left dormant - the plugin came out of package.json and the iOS
//     allowlist with it, because unreachable code still ships and git history is
//     the right home for code that is not running.
//
// PERMISSION IS ASKED AFTER JOINING A ROUND, NEVER ON FIRST LAUNCH. A prompt on
// launch is the one a golfer declines before they know what the app is for, and
// iOS gives you exactly one chance to ask. So the ask happens at the moment it
// explains itself: a golfer has opened a round that has a tee time.
//
// NOTHING HERE DECIDES ANYTHING ABOUT MONEY. It schedules a reminder, stores a
// token and saves three switches.
// ============================================================================

// The plugin handles, resolved lazily. Capacitor puts them on window.Capacitor
// .Plugins; a browser has neither, which is the whole inertness story in one
// property lookup.
function pushPlugins() {
    var cap = (typeof window !== 'undefined') ? window.Capacitor : null;
    var p = (cap && cap.Plugins) ? cap.Plugins : {};
    return {
        native: !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()),
        push: p.PushNotifications || null,
        // FirebaseMessaging is here for ONE call - see pushFcmToken below. It is
        // not a second push plugin and it does not handle permission or taps.
        messaging: p.FirebaseMessaging || null
    };
}

// ---------------------------------------------------------------------------
// THE TOKEN THE SENDER CAN ACTUALLY ADDRESS.
//
// @capacitor/push-notifications hands back the APNs DEVICE TOKEN on iOS: a raw
// address for Apple's own gateway. This app sends through FCM HTTP v1, where
// message.token must be an FCM REGISTRATION TOKEN - a different string, issued by
// Firebase once IT has been given the APNs token. Posting one where the other is
// expected is an INVALID_ARGUMENT from Google, not a delivery, and nothing on the
// phone would ever say so.
//
// So the FCM token is asked for FIRST, and the APNs listener is the fallback for
// a build without the messaging plugin. Both are tokens; only one of them is an
// address the sender holds a credential for.
async function pushFcmToken(messaging) {
    if (!messaging || typeof messaging.getToken !== 'function') return null;
    try {
        var res = await messaging.getToken();
        var t = res && res.token ? String(res.token) : '';
        return t || null;
    } catch (e) { return null; }
}

// ---------------------------------------------------------------------------
// THE PUSH TOKEN. Registered only once a golfer has said who they are in a
// round, because the token is worth nothing without the playerId - that is what
// turns "a device" into "Marty's phone" and lets the sender address one person.
//
// resolvedMeId() is the existing Wave 17 answer to "Who am I?", stored as
// golfapp_me_<code>, so NOBODY IS ASKED A NEW QUESTION.
//
// WRITES ONLY UNDER THE GOLFER'S OWN UID. pushTokens/$uid is owner-only in the
// proposed rules, which is the whole reason a token cannot be enumerated: it is
// a capability, and anyone holding one can push to that phone.
async function pushRegisterToken(deps) {
    var d = deps || {};
    var plugins = d.plugins || pushPlugins();
    var push = plugins.push;
    if (!push) return { registered: false, reason: 'no-plugin' };
    if (!d.uid) return { registered: false, reason: 'no-uid' };
    if (typeof d.save !== 'function') return { registered: false, reason: 'no-writer' };
    // THE PLAYER ID IS OPTIONAL NOW (2026-10-04). It used to be required, on the
    // grounds that a token is worth nothing without it - which is true of the
    // notifications that address a golfer, and NOT true of the token itself. An
    // organizer holding the card has a phone that can be pushed to, and so does a
    // golfer who has not picked a name yet; who RECEIVES what is decided when the
    // notification is sent, not when the device registers. Registering only the
    // golfers who had already answered "Who am I?" is why Manny's own phone had
    // no token at all.
    var playerId = String(d.playerId === undefined || d.playerId === null ? '' : d.playerId);

    try {
        var perm = await push.checkPermissions();
        if (perm && perm.receive === 'denied') return { registered: false, reason: 'denied' };
        if (!perm || perm.receive !== 'granted') {
            // ASKING IS A CHOICE THE CALLER MAKES. A launch-time refresh must
            // NEVER raise the iOS prompt: permission is granted once, and a
            // second prompt is not shown by the system anyway - the failure this
            // fixes is a phone that said yes last night, before the rules were
            // published, and was never asked again because iOS had nothing left
            // to ask.
            if (d.ask === false) return { registered: false, reason: 'not-granted' };
            var asked = await push.requestPermissions();
            if (!asked || asked.receive !== 'granted') return { registered: false, reason: 'declined' };
        }
    } catch (e) { return { registered: false, reason: 'permission-failed' }; }

    // THE FCM REGISTRATION TOKEN, when the messaging plugin is there. This is the
    // one the sender can address; see pushFcmToken.
    var token = await pushFcmToken(plugins.messaging);

    // THE APNs FALLBACK. The token arrives on an EVENT, not from register():
    // register() resolves as soon as the OS accepts the request, the token comes
    // later on 'registration', and 'registrationError' is what fires when the
    // build has no push entitlement.
    //
    // AND THE EVENT ONLY FIRES IF THE AppDelegate FORWARDS IT. iOS hands the
    // device token to application(_:didRegisterForRemoteNotificationsWithDeviceToken:);
    // the Capacitor plugin sees it only through
    // NotificationCenter.capacitorDidRegisterForRemoteNotifications. Without those
    // two methods this promise times out and every caller reports no-token, with
    // nothing on screen pointing at the AppDelegate. That was the bug.
    if (!token) token = await new Promise(function (resolve) {
        var done = false;
        var finish = function (v) { if (!done) { done = true; resolve(v); } };
        try {
            push.addListener('registration', function (t) { finish(t && t.value ? t.value : null); });
            push.addListener('registrationError', function () { finish(null); });
            push.register();
        } catch (e) { finish(null); }
        // A DEADLINE, because a promise that never settles here would hang the
        // caller. Ten seconds is long for an APNs handshake and short enough
        // that nothing visible waits on it.
        setTimeout(function () { finish(null); }, (d.timeoutMs === undefined ? 10000 : d.timeoutMs));
    });

    if (!token) return { registered: false, reason: 'no-token' };
    try {
        // IDEMPOTENT BY CONSTRUCTION: the row key is the token's own fingerprint,
        // so re-saving the same phone rewrites one row rather than adding another,
        // and a token that has rotated writes a new row for the new token. The
        // save is attempted on EVERY launch for exactly that reason - a token is
        // not a permanent address.
        await d.save({ token: token, playerId: playerId, roundCode: String(d.roundCode || ''), at: d.now || Date.now() });
    } catch (e) { return { registered: false, reason: 'write-failed' }; }
    return { registered: true, reason: 'ok', token: token };
}

// REGISTER ONLY IF THE PHONE HAS ALREADY SAID YES. Called on every launch and
// after a sign-in: it never prompts, it never needs a round, and it never needs a
// name. If permission was granted at any point in the past - which iOS will not
// ask about twice - this is the only thing that can put the token back.
function pushRegisterIfGranted(deps) {
    var d = deps || {};
    var opts = {};
    Object.keys(d).forEach(function (k) { opts[k] = d[k]; });
    opts.ask = false;
    return pushRegisterToken(opts);
}

// A STABLE SHORT KEY FROM THE TOKEN, and not the token itself: an FCM token runs
// to about 400 characters and a database key may not contain '/', which they do.
// Shared, because two pages write this row now and a second copy of the hash is a
// second row for one phone.
function pushDeviceKey(token) {
    var s = String(token || '');
    var h = 0;
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return 'd' + Math.abs(h).toString(36);
}

// ---------------------------------------------------------------------------
// WHERE A TAPPED NOTIFICATION LANDS (Wave 39, item 3)
//
// THE RULE: ACCEPT AND DECLINE MUST WRITE WHAT THE IN-APP BUTTONS WRITE, so this
// does not write anything. It carries the golfer to the control that does.
//
// RECON, BEFORE BUILDING, and it changes what is possible:
//
//   THE ALOHA IS THE ONLY ACCEPT/DECLINE RECORD IN THE APP.
//   sidematches.html respondAloha() updates
//   events/<code>/sideMatches/<id>/aloha { status, respondedAt } - or
//   matchPresses/aloha for the main game - and that is the whole of it.
//
//   A PRESS HAS NO OFFER AND NO ANSWER. index.html confirmSidePress() writes the
//   press straight to sideMatches/<id>/presses when the golfer taps it: there is
//   nobody to accept, because pressing is a thing you do, not a thing you ask.
//   So a "press offered" notification has no record to answer, and inventing one
//   would be a NEW money record - which is STRICT and is not approved. The
//   press-offered notification therefore carries a golfer to the match, and the
//   notification for a press that has already been made is news, not a decision.
//
//   A BET CHALLENGE HAS NO RECORD EITHER. Bets are created by the organizer or
//   the scorekeeper in person. Same conclusion.
//
// AND MONEY DOES NOT MOVE FROM A URL. sidematches.html has refused that since
// the ?press= link was built - "deep-linking straight into a write would mean
// money moving from a URL" - and a notification is a tap on a banner, which is
// not the same as a decision. So ?aloha=<id> brings the card with the Accept and
// Decline buttons into view and the golfer taps the one they mean.
function pushActionHref(origin, dir, roundCode, data) {
    var d = data || {};
    var base = String(origin || '') + String(dir || '/');
    var code = encodeURIComponent(String(roundCode || d.roundCode || ''));
    var kind = String(d.kind || '');
    if (kind === 'bet-challenge') {
        // WAVE 39: a challenge now HAS something to answer. ?challenge=<id>
        // brings the pending card - with its own Accept and Decline buttons - into
        // view on the Matches tab. It answers nothing: money does not move
        // because a URL was opened, and a notification is a tap on a banner
        // rather than a decision.
        var cid = String(d.offerId || d.challengeId || '');
        return base + 'sidematches.html?game=' + code
            + (cid ? '&challenge=' + encodeURIComponent(cid) : '');
    }
    if (kind === 'press-offered') {
        var id = String(d.matchId || '');
        // An ALOHA is answered on its own card; a press has no offer to answer at
        // all - index.html confirmSidePress writes it straight through - so that
        // notification is news and lands on the match.
        return base + 'sidematches.html?game=' + code
            + (id ? (d.aloha ? '&aloha=' : '&press=') + encodeURIComponent(id) : '');
    }
    if (kind === 'final-results') return base + 'settlement.html?game=' + code;
    // youre-in and hype both belong on the round itself.
    return base + 'index.html?game=' + code;
}

// THE TEST NOTIFICATION IS THE ONE THAT IS NOT ABOUT A ROUND. It proves the
// credential, the token, the capability and the route, and it is sent from
// Account - so that is where tapping it belongs. Everything else is a round, and
// pushActionHref already knows which screen of it.
function pushTapHref(origin, dir, data) {
    var d = data || {};
    if (String(d.test || '') === '1') {
        return String(origin || '') + String(dir || '/') + 'admin.html?account=1';
    }
    return pushActionHref(origin, dir, d.roundCode, d);
}

// ---------------------------------------------------------------------------
// AND SOMETHING HAS TO LISTEN. pushActionHref was built in Wave 39 and NO PAGE
// CALLED IT: every tap on every notification opened whatever the app was last
// looking at. A builder nothing listens to is not a feature, so this binds it.
//
// BOTH PLUGINS, because either one may own the tap - whichever claimed
// bridge.notificationRouter.pushNotificationHandler last is the one whose
// listener fires, and that is plugin load order rather than a decision. Their
// event names differ: pushNotificationActionPerformed and
// notificationActionPerformed.
//
// ONE TAP, ONE NAVIGATION. If both ever deliver the same tap, the dedupe key -
// or the notification's own id - makes the second one a no-op. Navigating twice
// would reload the round out from under the golfer who just arrived on it.
//
// AND IT NAVIGATES NOTHING ITSELF. The page supplies `go`, which is what keeps a
// notification from being able to do anything a link could not.
function pushBindNotifications(deps) {
    var d = deps || {};
    var plugins = d.plugins || pushPlugins();
    if (!plugins.push && !plugins.messaging) return { bound: false, reason: 'no-plugin' };
    var seen = {};
    var dataOf = function (ev) {
        var e = ev || {};
        var n = e.notification || e;
        return (n && n.data) || {};
    };
    var onTap = function (ev) {
        var data = dataOf(ev);
        var e = ev || {};
        var n = e.notification || e;
        var id = String(data.dedupeKey || (n && n.id) || '');
        if (id) {
            if (seen[id]) return;
            seen[id] = true;
        }
        var href = pushTapHref(d.origin, d.dir, data);
        if (typeof d.go === 'function') d.go(href, data);
    };
    var onReceive = function (ev) {
        if (typeof d.onReceive === 'function') d.onReceive(dataOf(ev));
    };
    var events = [];
    var add = function (plugin, name, fn) {
        if (!plugin || typeof plugin.addListener !== 'function') return;
        try { plugin.addListener(name, fn); events.push(name); } catch (e) { /* a tap is not worth a crash */ }
    };
    add(plugins.push, 'pushNotificationActionPerformed', onTap);
    // THE FOREGROUND ARRIVAL. iOS draws the banner itself from
    // presentationOptions; this is how the PAGE finds out, which is what lets the
    // test card say the notification landed while the app was open.
    add(plugins.push, 'pushNotificationReceived', onReceive);
    add(plugins.messaging, 'notificationActionPerformed', onTap);
    add(plugins.messaging, 'notificationReceived', onReceive);
    return { bound: events.length > 0, events: events };
}

// ---------------------------------------------------------------------------
// THE SETTINGS. Three switches, and only two of them are switches:
// Essentials cannot be turned off - push-notify.js forces it true whatever is
// stored - so the stored shape has two keys and the screen says why.
function pushPrefsForSave(prefs) {
    var p = (typeof pushPrefsNormalise === 'function') ? pushPrefsNormalise(prefs) : (prefs || {});
    // essentials is NOT stored. A value nothing reads is a value that will one
    // day disagree with the code, and a stored `false` could then only mean a bug.
    return { bets: !!p.bets, hype: !!p.hype };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        pushPlugins, pushRegisterToken, pushRegisterIfGranted, pushDeviceKey,
        pushPrefsForSave, pushActionHref, pushTapHref, pushBindNotifications
    };
}
