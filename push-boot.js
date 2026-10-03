// ============================================================================
// THE DEVICE HALF OF NOTIFICATIONS (Wave 39)
//
// Everything that touches a plugin, a token or the database lives here. The
// decisions live elsewhere and are pure: push-notify.js says what to send and
// how often, tee-time.js says when a round tees off. This file is the wiring
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
//     and REMOVED on Manny's call before it shipped; the tee-time FIELD stays.
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
        push: p.PushNotifications || null
    };
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
    if (!d.playerId) return { registered: false, reason: 'no-player' };
    if (typeof d.save !== 'function') return { registered: false, reason: 'no-writer' };

    try {
        var perm = await push.checkPermissions();
        if (perm && perm.receive === 'denied') return { registered: false, reason: 'denied' };
        if (!perm || perm.receive !== 'granted') {
            var asked = await push.requestPermissions();
            if (!asked || asked.receive !== 'granted') return { registered: false, reason: 'declined' };
        }
    } catch (e) { return { registered: false, reason: 'permission-failed' }; }

    // THE TOKEN ARRIVES ON AN EVENT, NOT FROM register(). register() resolves as
    // soon as the OS accepts the request; the token comes later on
    // 'registration', and 'registrationError' is what fires when there is no
    // APNs key - which is TODAY, and it must be quiet.
    var token = await new Promise(function (resolve) {
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
        await d.save({ token: token, playerId: String(d.playerId), roundCode: String(d.roundCode || ''), at: d.now || Date.now() });
    } catch (e) { return { registered: false, reason: 'write-failed' }; }
    return { registered: true, reason: 'ok', token: token };
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
        pushPlugins, pushRegisterToken, pushPrefsForSave, pushActionHref
    };
}
