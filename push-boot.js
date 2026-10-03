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
//   - THE LOCAL REMINDER DOES NOT WAIT FOR ANY OF IT. It needs one permission
//     and no server, so the tee-time reminder is the part that works first.
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
        local: p.LocalNotifications || null
    };
}

// ONE NOTIFICATION ID PER ROUND, derived from the round code, so rescheduling
// REPLACES the pending reminder instead of adding a second one. A phone's
// pending queue filling up with duplicates of one reminder is the defect this
// prevents, and it is why the id is a hash of the code rather than a counter.
function pushReminderId(roundCode) {
    var s = String(roundCode || '');
    var h = 0;
    for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    // LocalNotifications ids must be a positive 32-bit int on iOS.
    return Math.abs(h) % 2000000000 + 1;
}

// What the device remembers about a round's reminder, so it only reschedules
// when the tee time actually MOVED. localStorage throws in a private window, so
// both halves are wrapped and the failure mode is "reschedule once more than
// necessary", never a broken page.
function pushReminderKey(roundCode) { return 'golfapp_tee_reminder_' + String(roundCode || ''); }

function pushReminderStored(roundCode) {
    try { return localStorage.getItem(pushReminderKey(roundCode)); } catch (e) { return null; }
}
function pushReminderRemember(roundCode, iso) {
    try {
        if (iso) localStorage.setItem(pushReminderKey(roundCode), iso);
        else localStorage.removeItem(pushReminderKey(roundCode));
    } catch (e) { /* one extra reschedule, and nothing else */ }
}

// ---------------------------------------------------------------------------
// THE TEE-TIME REMINDER. Local, on the device, scheduled when a golfer opens a
// round that has one and rescheduled when the organizer moves it.
//
// Returns a reason in every case, including success, so this is debuggable from
// a console on a real phone - which is the only place it runs.
async function pushScheduleReminder(roundCode, data, deps) {
    var d = deps || {};
    var plugins = d.plugins || pushPlugins();
    var local = plugins.local;
    var now = d.now || Date.now();
    if (!local) return { scheduled: false, reason: 'no-plugin' };
    if (!roundCode) return { scheduled: false, reason: 'no-round' };

    var at = (typeof teeTimeReminderAt === 'function') ? teeTimeReminderAt(data, now) : null;
    var iso = (typeof teeTimeOf === 'function' && teeTimeOf(data)) ? teeTimeOf(data).iso : null;
    var was = (d.stored === undefined) ? pushReminderStored(roundCode) : d.stored;
    var id = pushReminderId(roundCode);

    // NOTHING TO SCHEDULE. A round with no tee time, or one whose tee time has
    // already passed - scheduling into the past makes a phone fire immediately,
    // which would tell a golfer opening a finished round to go and tee off.
    if (at === null) {
        if (was) {
            try { await local.cancel({ notifications: [{ id: id }] }); } catch (e) { /* nothing pending */ }
            pushReminderRemember(roundCode, null);
            return { scheduled: false, reason: iso ? 'already-passed' : 'cleared' };
        }
        return { scheduled: false, reason: iso ? 'already-passed' : 'no-tee-time' };
    }

    // UNCHANGED MEANS UNTOUCHED. Re-registering on every page load is how the
    // queue fills with duplicates.
    if (!(typeof teeTimeChanged === 'function' ? teeTimeChanged(was, data) : was !== iso)) {
        return { scheduled: false, reason: 'unchanged' };
    }

    var granted = await pushEnsureLocalPermission(local);
    if (!granted) return { scheduled: false, reason: 'no-permission' };

    var copy = (typeof pushCopy === 'function')
        ? pushCopy('tee-reminder', {
            roundName: (data && data.eventName) || 'Your round',
            courseName: (data && data.courseName) || '',
            teeTimeText: (typeof teeTimeShort === 'function') ? teeTimeShort(data) : ''
        })
        : null;
    if (!copy || !copy.body) return { scheduled: false, reason: 'no-copy' };

    try {
        // SCHEDULE REPLACES, because the id is the round's. cancel-then-schedule
        // would leave a window in which a crash loses the reminder entirely.
        await local.schedule({
            notifications: [{
                id: id, title: copy.title, body: copy.body,
                schedule: { at: new Date(at), allowWhileIdle: true },
                extra: { roundCode: String(roundCode), kind: 'tee-reminder' }
            }]
        });
    } catch (e) {
        return { scheduled: false, reason: 'schedule-failed' };
    }
    pushReminderRemember(roundCode, iso);
    return { scheduled: true, reason: 'ok', at: at, id: id };
}

// THE ASK, AT THE MOMENT IT EXPLAINS ITSELF. iOS gives one chance, so this is
// called when a golfer opens a round that HAS a tee time - never on launch.
async function pushEnsureLocalPermission(local) {
    if (!local) return false;
    try {
        var state = await local.checkPermissions();
        if (state && state.display === 'granted') return true;
        if (state && state.display === 'denied') return false;
        var asked = await local.requestPermissions();
        return !!(asked && asked.display === 'granted');
    } catch (e) { return false; }
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
        pushPlugins, pushReminderId, pushReminderKey, pushReminderStored,
        pushReminderRemember, pushScheduleReminder, pushEnsureLocalPermission,
        pushRegisterToken, pushPrefsForSave
    };
}
