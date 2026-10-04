// ============================================================================
// THE DEVICE HALF, THE SENDER, AND "INERT" MEANING INERT (Wave 39)
//
// Wave 39 ships a feature whose setup does not exist yet: no APNs key, no
// Firebase upload, no Xcode capability, no Cloudflare secret. Every one of those
// is Manny's step. So the claim this file has to prove is not "notifications
// work" - it is THE APP IS UNCHANGED UNTIL THEY DO, and the one half that needs
// none of them (the local tee-time reminder) works now.
//
// THREE THINGS GUARDED HERE.
//
//   1. INERTNESS. On the web there is no plugin: every entry point answers with
//      a reason and touches nothing. In the shell with no APNs key, register()
//      fires 'registrationError' and that must be quiet - no alert, no retry
//      loop, no promise left hanging.
//
//   2. THE TEE-TIME REMINDER IS GONE. It was built in this wave as a local
//      notification and removed on Manny's call before it shipped; the FIELD
//      stays. Eleven tests covered it and came out with it, and four replaced
//      them to assert the removal left nothing dormant - a plugin still linked
//      still ships and still asks for a permission the app never uses.
//
//   3. THE CREDENTIAL IS NOWHERE NEAR THE BROWSER. functions/api/_push.js is the
//      only file that reads FCM_SERVICE_ACCOUNT, and with it unset every route
//      answers not_configured and spends nothing. A source scan asserts no page
//      and no shell module names it, because this repo root is served publicly -
//      measured, /package.json returns 200 - so any file in the tree is a URL.
//
// NOT GUARDED, and said plainly: that a real notification arrives on a real
// phone. That needs the APNs key and a device, and it is what Manny tests via
// Cmd+R.
//
// BASELINE. Against pre-build main (89b3c1a) push-boot.js does not exist, the
// require throws at load, and node reports the FILE as one failing test - no
// per-assertion signal at all.
//
// MEASURED with stubs for push-boot.js AND functions/api/_push.js - every
// exported function present and returning undefined - over the FINISHED file,
// all 16 tests: 4 PASS / 12 FAIL. Both modules were restored by sha from saved
// copies (c9727474c618ed95 and the _push copy), never with git restore.
//
// BASELINE COUNT DELTA: +14 - fourteen tests were added on 2026-10-04, after
// this baseline was measured, in four sittings.
//
//   TWO FOR THE TEST BUTTON. Measured on their own against the build before that
//   work: both RED, because admin.html had no sendTestNotification at all.
//   Controls: a canned decision in place of the decider's fires the first - and
//   that control caught the first version of that assertion being INERT, since it
//   proved the CALL was written and not that its answer was used - and showing
//   the row to everybody fires the second.
//
//   FIVE FOR THE LAUNCH REFRESH, after Manny's phone turned out to have
//   permission and no token: iOS asks once, he said yes before the rules were
//   published, the write was refused, and nothing ran again. Four were RED before
//   the fix (pushRegisterIfGranted and pushDeviceKey did not exist, and neither
//   page refreshed on launch); the fifth - a phone with no name on it still
//   registers - was red because a missing playerId was a refusal.
//
//   AND ONE MORE INERT CONTROL, found and repaired: commenting out the launch
//   call left "BOTH PAGES refresh on launch" green, because the pattern matched
//   the sentence ABOVE the call that explains it. It strips comments first now,
//   and the control fires.
//
//   FOUR FOR THE TOKEN ITSELF, after the phone answered no-token to both buttons
//   with permission already granted. All four were RED before the fix: the
//   AppDelegate forwarded nothing (so register() could never produce a token),
//   the APNs device token would have been saved where FCM v1 needs a registration
//   token, the messaging plugin was not linked, and the panel still promised a
//   tee time, a 30-minute reminder and a press offer - all three removed.
//   Controls: deleting the AppDelegate methods fires the first; skipping the FCM
//   token fires the second.
//
//   THREE FOR THE PREFLIGHT, after the app reported "Load failed" with a token in
//   hand: a JSON POST is preflighted, nothing exported onRequestOptions, the
//   OPTIONS fell to the catch-all and came back 405, and fetch() gives a failed
//   preflight no status and no body to read. All three were RED before the fix.
//
//   THE FOUR PASSES ARE ALL SOURCE SCANS, and three of them scan the REMOVAL -
//   push-boot.js having no scheduler, the plugin being out of the build,
//   index.html scheduling nothing - which a stub satisfies because the stub has
//   none of it either. The fourth is the route scan. Not one says anything about
//   behaviour.
//
// RE-MEASURED after the tee-time reminder came out: eleven reminder tests left
// this file and four replaced them, so the 21-test figure this header was first
// written with describes a file that no longer exists.
//
//   The 20 reds are every inertness claim, every reminder rule, the no-APNs-key
//   path, the settings shape, and the three credential assertions.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const B = require('./push-boot.js');
const P = require('./push-notify.js');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

// push-boot.js calls pushCopy and the rest as GLOBALS, the way a page provides
// them. In node they are module exports, so the test supplies them the same way
// the browser does. tee-time.js is no longer among them: the field came out of
// the app on 2026-10-04 and the module went with it.
Object.assign(global, P);


// ===========================================================================
describe('1. ON THE WEB, NOTHING HAPPENS AT ALL', () => {

    test('no plugin means a reason and no side effect', async () => {
        assert.deepEqual(await B.pushRegisterToken({ plugins: { push: null } }),
            { registered: false, reason: 'no-plugin' });
    });

    test('pushPlugins() answers safely with no Capacitor at all', () => {
        // In node there is no window, which is the browser-with-no-shell case too.
        const p = B.pushPlugins();
        assert.equal(p.native, false);
        assert.equal(p.push, null);
    });

    test('A TOKEN IS NEVER WRITTEN WITHOUT A UID AND A WRITER', async () => {
        const push = { async checkPermissions() { return { receive: 'granted' }; } };
        assert.equal((await B.pushRegisterToken({ plugins: { push }, playerId: '101', save: () => {} })).reason, 'no-uid');
        assert.equal((await B.pushRegisterToken({ plugins: { push }, uid: 'u', playerId: '101' })).reason, 'no-writer');
    });

    // THE PLAYER ID STOPPED BEING REQUIRED on 2026-10-04, and that is the fix for
    // a real failure: Manny's phone had permission and no token, because the only
    // code that could write one ran for a golfer who had already answered "Who am
    // I?" in a round. An organizer holding the card has a phone too, and who
    // RECEIVES a notification is decided when one is sent, not when a device
    // registers.
    test('A PHONE WITH NO NAME ON IT STILL REGISTERS, and the row says so', async () => {
        const saved = [];
        const push = {
            async checkPermissions() { return { receive: 'granted' }; },
            addListener(name, cb) { if (name === 'registration') setTimeout(() => cb({ value: 'TOK' }), 0); },
            register() {}
        };
        const r = await B.pushRegisterToken({ plugins: { push }, uid: 'u', save: (rec) => { saved.push(rec); } });
        assert.equal(r.registered, true, r.reason);
        assert.equal(saved.length, 1);
        assert.equal(saved[0].playerId, '', 'an unknown golfer must be an empty string, not undefined - the rules check isString');
        assert.equal(saved[0].token, 'TOK');
    });
});

// ===========================================================================
describe('2. THE TEE-TIME REMINDER IS GONE, AND NOTHING OF IT IS LEFT DORMANT', () => {

    // A 30-minute local reminder was built in this wave - scheduled on the
    // device, rescheduled when the organizer moved the time - and REMOVED on
    // Manny's call before it shipped. The tee-time FIELD stays everywhere it
    // shows. Eleven tests covered the reminder and came out with it; these four
    // assert the removal left nothing behind, because a dormant plugin still
    // ships and still asks for a permission the app never uses.

    test('push-boot.js has no scheduler, no permission prompt and no stored key', () => {
        ['pushScheduleReminder', 'pushEnsureLocalPermission', 'pushReminderId',
         'pushReminderKey', 'pushReminderStored', 'pushReminderRemember'].forEach((n) => {
            assert.equal(B[n], undefined, n + ' is still exported with nothing calling it');
        });
        const src = read('push-boot.js').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
        assert.ok(!/LocalNotifications|golfapp_tee_reminder/.test(src),
            'push-boot.js still reaches for the local-notification plugin');
    });

    test('pushPlugins() resolves the two handles and nothing else', () => {
        // 'messaging' joined on 2026-10-04 for getToken() alone - the FCM
        // registration token the sender can address. Still a closed list: a plugin
        // handle that appears here without a reason is a plugin in the binary.
        const p = B.pushPlugins();
        assert.deepEqual(Object.keys(p).sort(), ['messaging', 'native', 'push']);
    });

    test('the plugin is out of package.json, the allowlist AND the iOS binary', () => {
        assert.ok(!/local-notifications/.test(read('package.json')));
        assert.ok(!/local-notifications/.test(read('capacitor.config.ts').replace(/\/\/[^\n]*/g, ' ')));
        assert.ok(!/LocalNotifications/.test(read('ios/App/CapApp-SPM/Package.swift')),
            'an unused third-party SDK in the binary is what the Facebook trait exclusion '
            + 'exists to prevent');
        // THE POSITIVE HALF: push IS still linked, so this block is not satisfied
        // by a tree with no notification plugins at all.
        assert.match(read('ios/App/CapApp-SPM/Package.swift'), /CapacitorPushNotifications/);
    });

    test('THERE IS NO TEE TIME LEFT IN THE APP, module included', () => {
        // The reminder came out first, on Manny's call, and the FIELD followed on
        // 2026-10-04: he does not use one. Nothing half-removed - no input, no
        // display, no module, and nothing in either shell list pointing at a file
        // that is not there.
        assert.ok(!fs.existsSync(path.join(__dirname, 'tee-time.js')), 'the module is still here');
        ['index.html', 'admin.html', 'game.html', 'trip.html'].forEach((f) => {
            const src = read(f).replace(/(^|[^:])\/\/[^\n]*/g, '$1 ').replace(/<!--[\s\S]*?-->/g, ' ');
            assert.ok(!/teeTimeLabel|teeTimeBuild|teeTimeInputs|tee-time\.js/.test(src),
                f + ' still reads a tee time');
            assert.ok(!/id="tee-time-date"|round-teedate-/.test(src), f + ' still has a tee-time input');
        });
        assert.ok(!/pushScheduleReminder|maybeScheduleTeeReminder/.test(read('index.html')));
        // THE PRECACHE LIST, not the whole file: sw.js keeps a written record of
        // every version it has moved through, and one of those notes names the
        // module by name. History is not a cached file.
        const shell = read('sw.js');
        const list = shell.slice(shell.indexOf('SHELL_FILES = ['), shell.indexOf(']', shell.indexOf('SHELL_FILES = [')));
        assert.ok(!/tee-time\.js/.test(list), 'the shell still precaches a file that is gone');
        assert.ok(!/tee-time\.js/.test(read('sync-mobile-web.js')), 'the native bundle still lists it');
    });
});


// ===========================================================================
describe('3. NO APNs KEY IS THE STATE TODAY, AND IT MUST BE QUIET', () => {

    test('registrationError resolves with no token and writes nothing', async () => {
        const listeners = {};
        let wrote = 0;
        const push = {
            async checkPermissions() { return { receive: 'granted' }; },
            addListener(ev, fn) { listeners[ev] = fn; },
            register() { setImmediate(() => listeners.registrationError && listeners.registrationError({ error: 'no APNs' })); }
        };
        const r = await B.pushRegisterToken({
            plugins: { push }, uid: 'u-1', playerId: '101', save: () => { wrote++; }, timeoutMs: 500
        });
        assert.equal(r.registered, false);
        assert.equal(r.reason, 'no-token',
            'this is TODAY: no APNs key, so the OS refuses to issue one. It must be a reason, '
            + 'not an alert and not a retry loop.');
        assert.equal(wrote, 0, 'nothing may be written without a token');
    });

    test('A SILENT PLUGIN CANNOT HANG THE CALLER', async () => {
        const push = {
            async checkPermissions() { return { receive: 'granted' }; },
            addListener() {}, register() {}
        };
        const r = await B.pushRegisterToken({ plugins: { push }, uid: 'u-1', playerId: '101', save: () => {}, timeoutMs: 50 });
        assert.equal(r.reason, 'no-token', 'a promise that never settles here would hang the scorecard');
    });

    test('a token that DOES arrive is written with the player it belongs to', async () => {
        const listeners = {};
        let rec = null;
        const push = {
            async checkPermissions() { return { receive: 'granted' }; },
            addListener(ev, fn) { listeners[ev] = fn; },
            register() { setImmediate(() => listeners.registration && listeners.registration({ value: 'apns-abc' })); }
        };
        const r = await B.pushRegisterToken({
            plugins: { push }, uid: 'u-1', playerId: '101', roundCode: 'GFLBAM',
            save: (x) => { rec = x; }, now: 123, timeoutMs: 500
        });
        assert.equal(r.registered, true, r.reason);
        assert.equal(rec.token, 'apns-abc');
        assert.equal(rec.playerId, '101',
            'the playerId is what turns "a device" into "Marty phone" - without it the sender '
            + 'cannot address one person');
        assert.equal(rec.at, 123);
    });

    test('A DECLINED PROMPT WRITES NOTHING AND DOES NOT ASK AGAIN', async () => {
        let wrote = 0;
        const push = {
            async checkPermissions() { return { receive: 'denied' }; },
            addListener() {}, register() {}
        };
        const r = await B.pushRegisterToken({ plugins: { push }, uid: 'u-1', playerId: '101', save: () => { wrote++; } });
        assert.equal(r.reason, 'denied');
        assert.equal(wrote, 0);
    });

    test('essentials is NOT stored - a value nothing reads is a value that will disagree', () => {
        assert.deepEqual(B.pushPrefsForSave({ bets: false, hype: true, essentials: false }), { bets: false, hype: true });
        assert.deepEqual(Object.keys(B.pushPrefsForSave({})), ['bets', 'hype']);
    });
});

// ===========================================================================
describe('4. THE CREDENTIAL IS NOWHERE NEAR THE BROWSER', () => {

    test('with no secret the sender answers not_configured and spends nothing', async () => {
        const M = await import('./functions/api/_push.js');
        assert.deepEqual(await M.handleSend({ env: {} }), { status: 'unavailable', reason: 'not_configured' });
        assert.equal(M.readServiceAccount({}), null);
        assert.equal(M.readServiceAccount({ FCM_SERVICE_ACCOUNT: '{' }), null, 'garbage is a reason, not a throw');
        assert.equal(M.readServiceAccount({ FCM_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'a@b' }) }), null,
            'a half-complete service account is no service account');
        assert.ok(M.readServiceAccount({ FCM_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'a@b', private_key: 'k', project_id: 'p' }) }),
            'and a complete one is accepted - otherwise this block is satisfied by refusing everything');
    });

    test('FCM_SERVICE_ACCOUNT IS NAMED IN EXACTLY ONE PLACE, and it is not shipped', () => {
        // This repo root is served publicly by Cloudflare Pages - measured,
        // /package.json returns 200 - so any file in the tree is a downloadable
        // URL. The credential may only be read by the Function.
        const shipped = /const SHARED_SHELL = \[([\s\S]*?)\];/.exec(read('sync-mobile-web.js'))[1];
        ['index.html', 'admin.html', 'game.html', 'trip.html', 'push-boot.js', 'push-notify.js']
            .forEach((f) => assert.ok(!read(f).includes('FCM_SERVICE_ACCOUNT'),
                f + ' names the service-account secret and is served publicly'));
        assert.ok(!/_push\.js|push-send\.js/.test(shipped),
            'the sender must not be in the precached shell - it is a Function, not an asset');
        assert.match(read('functions/api/_push.js'), /env\.FCM_SERVICE_ACCOUNT/,
            'and the Function must actually read it');
    });

    test('THE MESSAGE CARRIES NO SENTENCE OF ITS OWN - it reads the decision', async () => {
        const M = await import('./functions/api/_push.js');
        const decided = P.pushDecide({
            kind: 'final-results', tokens: ['t'], prefs: {},
            facts: { uid: 'u-1', roundCode: 'G', roundName: 'Sat', netCents: 4000 },
            alreadySent: {}, buzzedHoles: {}, now: 0
        });
        assert.equal(decided.send, true, decided.reason);
        const msg = M.fcmMessage('tok', decided, { roundCode: 'G' });
        assert.equal(msg.message.notification.body, decided.copy.body);
        assert.equal(msg.message.apns.headers['apns-collapse-id'], decided.dedupeKey,
            'the dedupe key collapses a retry on the phone as well as in the sender');
        // EVERY data VALUE IS A STRING. A number here is a 400 from Google.
        Object.keys(msg.message.data).forEach((k) => assert.equal(typeof msg.message.data[k], 'string', k));
        const src = read('functions/api/_push.js').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
        ['challenged you', 'Final results', 'Tee time in', 'birdies in'].forEach((phrase) => {
            assert.ok(!src.includes(phrase),
                'the sender composes copy (' + phrase + '). What to say is push-notify.js, which is '
                + 'pure and testable without a credential.');
        });
    });

    // ---- THE TEST BUTTON (2026-10-04) -----------------------------------
    //
    // One tap that proves the credential, the token, the capability and the route
    // together - with one phone and nobody else's. Guarded because every one of
    // those words is a way for it to be a lie: a button that posted a canned
    // payload, or called FCM directly, or read somebody else's tokens would still
    // light up a phone.
    // ---- THE LAUNCH REFRESH (2026-10-04) ---------------------------------
    //
    // iOS asks for notification permission ONCE. Manny said yes the night before
    // the rules were published, the write was refused, and nothing ever asked
    // again - so the phone had permission and no token, and the test button could
    // only report it. Every launch now re-registers silently if permission is
    // already granted.
    // ---- THE TOKEN TYPE, AND THE AppDelegate (2026-10-04) ----------------
    //
    // Manny's phone had permission and still answered "no-token" to both buttons,
    // and there were TWO faults behind that one word.
    //
    //   1. THE AppDelegate FORWARDED NOTHING. iOS hands the device token to
    //      application(_:didRegisterForRemoteNotificationsWithDeviceToken:), and
    //      the Capacitor plugin only ever sees it through NotificationCenter.
    //      Without those two methods the 'registration' listener never fires, the
    //      promise times out, and every caller reports no-token - with nothing on
    //      screen pointing at a Swift file.
    //
    //   2. AND THE TOKEN WOULD HAVE BEEN THE WRONG KIND. push-notifications
    //      returns the APNs DEVICE TOKEN on iOS; the sender is FCM HTTP v1, where
    //      message.token must be an FCM REGISTRATION TOKEN. That is an
    //      INVALID_ARGUMENT from Google, not a delivery - a second silent failure
    //      waiting behind the first.
    test('THE AppDelegate FORWARDS THE DEVICE TOKEN, and the failure too', () => {
        const app = read('ios/App/App/AppDelegate.swift');
        assert.match(app, /didRegisterForRemoteNotificationsWithDeviceToken/,
            'nothing forwards the token: register() can never produce one');
        assert.match(app, /capacitorDidRegisterForRemoteNotifications/,
            'the token is received and not handed to Capacitor');
        assert.match(app, /didFailToRegisterForRemoteNotificationsWithError/,
            'a failure would be indistinguishable from a slow token');
        assert.match(app, /capacitorDidFailToRegisterForRemoteNotifications/);
    });

    test('THE FCM REGISTRATION TOKEN IS PREFERRED, with APNs as the fallback', async () => {
        const saved = [];
        const messaging = { async getToken() { return { token: 'FCM-REG' }; } };
        const push = {
            async checkPermissions() { return { receive: 'granted' }; },
            addListener(name, cb) { if (name === 'registration') setTimeout(() => cb({ value: 'APNS-HEX' }), 0); },
            register() {}
        };
        const r = await B.pushRegisterToken({ plugins: { push, messaging }, uid: 'u',
            save: (rec) => { saved.push(rec); }, timeoutMs: 50 });
        assert.equal(r.registered, true, r.reason);
        assert.equal(saved[0].token, 'FCM-REG',
            'the APNs device token was saved - FCM v1 would answer INVALID_ARGUMENT');

        // WITHOUT the plugin, the APNs listener still answers: a build that has
        // not been synced must not silently stop registering at all.
        const saved2 = [];
        const r2 = await B.pushRegisterToken({ plugins: { push, messaging: null }, uid: 'u',
            save: (rec) => { saved2.push(rec); }, timeoutMs: 200 });
        assert.equal(r2.registered, true, r2.reason);
        assert.equal(saved2[0].token, 'APNS-HEX');
    });

    test('and the plugin is linked for iOS only, by name', () => {
        const cfg = read('capacitor.config.ts');
        assert.match(cfg, /'@capacitor-firebase\/messaging'/, 'the plugin is not on the iOS allowlist');
        const ios = cfg.slice(cfg.indexOf('ios: {'), cfg.indexOf('android: {'));
        assert.match(ios, /@capacitor-firebase\/messaging/);
        const android = cfg.slice(cfg.indexOf('android: {'));
        assert.ok(!/@capacitor-firebase\/messaging/.test(android),
            'Android has no google-services.json, which is why authentication is iOS-only too');
        assert.match(read('ios/App/CapApp-SPM/Package.swift'), /CapacitorFirebaseMessaging/,
            'the SPM manifest does not link it, so getToken is undefined on the device');
        assert.match(read('package.json'), /@capacitor-firebase\/messaging/);
    });

    test('THE PANEL NAMES WHAT IS ACTUALLY SENT', () => {
        const admin = read('admin.html');
        // COMMENTS STRIPPED: this is about what the PANEL says, and the comment
        // explaining the removal necessarily names the thing that was removed.
        const card = admin.slice(admin.indexOf('id="notify-card"'), admin.indexOf('id="account-exit-card"'))
            .replace(/<!--[\s\S]*?-->/g, ' ');
        assert.ok(card.length > 200, 'the slice is empty - the endpoint drifted');
        // The two that were removed before they ever shipped, and the one that
        // has no record to answer.
        assert.ok(!/tee time/i.test(card), 'the panel still promises a tee time');
        assert.ok(!/30-minute|reminder/i.test(card), 'the panel still promises the reminder');
        assert.ok(!/offers a press/i.test(card), 'the panel still promises a press offer');
        assert.match(card, /final results/i, 'Essentials does not name the final results');
        assert.match(card, /challenges you/i, 'Bets does not name a challenge');
        assert.match(card, /Aloha/, 'Bets does not name the Aloha offer');
    });

    test('pushRegisterIfGranted NEVER prompts, and says so when it cannot', async () => {
        const asked = [];
        const push = {
            async checkPermissions() { return { receive: 'prompt' }; },
            async requestPermissions() { asked.push(1); return { receive: 'granted' }; },
            addListener() {}, register() {}
        };
        const r = await B.pushRegisterIfGranted({ plugins: { push }, uid: 'u', save: () => {} });
        assert.equal(r.registered, false);
        assert.equal(r.reason, 'not-granted');
        assert.equal(asked.length, 0, 'it raised the iOS prompt - a launch must never do that');
    });

    test('and with permission already granted it writes the token, idempotently', async () => {
        const saved = [];
        const push = {
            async checkPermissions() { return { receive: 'granted' }; },
            addListener(name, cb) { if (name === 'registration') setTimeout(() => cb({ value: 'TOK' }), 0); },
            register() {}
        };
        const once = await B.pushRegisterIfGranted({ plugins: { push }, uid: 'u', save: (rec) => { saved.push(rec); } });
        const twice = await B.pushRegisterIfGranted({ plugins: { push }, uid: 'u', save: (rec) => { saved.push(rec); } });
        assert.equal(once.registered, true, once.reason);
        assert.equal(twice.registered, true, twice.reason);
        // SAME PHONE, SAME ROW. The key is the token's own fingerprint, so a
        // second launch rewrites one row rather than collecting phones.
        assert.equal(B.pushDeviceKey('TOK'), B.pushDeviceKey('TOK'));
        assert.notEqual(B.pushDeviceKey('TOK'), B.pushDeviceKey('OTHER'));
        assert.ok(!/\//.test(B.pushDeviceKey('a/b+c')), 'a database key may not contain a slash');
    });

    test('BOTH PAGES refresh on launch, through the shared row key', () => {
        ['index.html', 'admin.html'].forEach((f) => {
            const src = read(f);
            assert.match(src, /pushRegisterIfGranted\(\{/, f + ' never re-registers an already-granted phone');
            assert.match(src, /function refreshPushRegistration/, f + ' has no launch refresh');
            assert.ok(!/function pushDeviceKey\(token\) \{/.test(src),
                f + ' hashes the token itself again - two hashes are two rows for one phone');
        });
        // AND THE REFRESH IS ACTUALLY CALLED, not merely defined. The whole bug
        // was code that existed and never ran.
        // COMMENTS STRIPPED FIRST. The first version of this matched the sentence
        // ABOVE the call explaining it, so commenting the call out left the test
        // green - measured, as a control, and this is the repair.
        const code = (f) => read(f).replace(/(^|[^:])\/\/[^\n]*/g, '$1 ').replace(/<!--[\s\S]*?-->/g, ' ');
        assert.match(code('index.html'), /window\.authReady[\s\S]{0,400}refreshPushRegistration\(\)/,
            'index.html defines the refresh and never calls it after sign-in');
        assert.match(code('admin.html'), /refreshPushRegistration\(\);/,
            'admin.html defines the refresh and never calls it');
    });

    test('the dead end offers Register this phone, and THAT one may ask', () => {
        const admin = read('admin.html');
        const fn = admin.slice(admin.indexOf('async function sendTestNotification()'),
                               admin.indexOf('\n    function ', admin.indexOf('async function sendTestNotification()') + 30));
        assert.match(fn, /refreshPushRegistration\(true\)/, 'it does not try a silent refresh first');
        assert.match(fn, /Register this phone/, 'no way out of the dead end');
        assert.match(fn, /registerThisPhone/, 'the offer is not wired to anything');
        const reg = admin.slice(admin.indexOf('async function registerThisPhone()'),
                                admin.indexOf('async function sendTestNotification()'));
        assert.ok(reg.length > 200, 'the slice is empty - the endpoint drifted');
        assert.match(reg, /pushRegisterToken\(\{/, 'the offer cannot prompt, so it cannot help a phone that never said yes');
        assert.ok(!/pushRegisterIfGranted/.test(reg), 'the button that exists to ask must be allowed to ask');
        assert.match(reg, /out\.reason/, 'a refusal must name itself - denied, no-token and write-failed need different fixes');
    });

    test('it goes through the REAL decider and the REAL route, to this account only', () => {
        const admin = read('admin.html');
        const at = admin.indexOf('async function sendTestNotification()');
        assert.ok(at > 0, 'the test button has no handler');
        const fn = admin.slice(at, admin.indexOf('\n    function ', at + 30));
        assert.ok(fn.length > 400, 'the slice is empty - the endpoint drifted');
        // THE ANSWER IS USED, not merely requested. An earlier version of this
        // assertion only proved the CALL was written: a control that left
        // "pushDecide({" in place and assigned a canned { send: true } in front of
        // it passed cleanly. The decision must BE the decider's.
        assert.match(fn, /var decided = pushDecide\(\{/,
            'the decision is not the decider\u2019s answer');
        assert.ok(!/send:\s*true/.test(fn),
            'the handler builds its own decision - a canned send cannot be refused');
        assert.match(fn, /if \(!decided \|\| !decided\.send\)/, 'it sends whatever the decider refused');
        assert.match(fn, /courseApiBase\(\) \+ '\/api\/push-send'/,
            'it does not post to the real route (or would miss the proxy base in the shell)');
        // THE PATH IS BUILT IN ONE PLACE NOW (pushTokensPath), because the test
        // button, the launch refresh and the Register button all write the same
        // node and three spellings are three chances to write somebody else's.
        assert.match(fn, /db\.ref\(pushTokensPath\(uid\)\)/,
            "it reads tokens from somewhere other than this account's own node");
        assert.match(read('admin.html'), /function pushTokensPath\(uid\) \{ return 'pushTokens\/' \+ uid; \}/,
            'the path builder is gone, so each caller spells it itself');
        assert.ok(!/fcm\.googleapis|oauth2\.googleapis/.test(fn),
            'the page talks to Google directly - the credential belongs to the Function');
        // THE REASON IS THE FUNCTION'S OWN. not_configured means the Cloudflare
        // secret is not in the deployment; a paraphrase would send Manny looking
        // at the phone instead.
        assert.match(fn, /out\.reason \|\| out\.status/);
    });

    test('and nobody sees it until the database names an account', () => {
        const admin = read('admin.html');
        assert.match(admin, /id="notify-test-row"[^>]*style="display:none/,
            'the test row ships visible');
        assert.match(admin, /app_settings\/pushTestUid/, 'nothing decides who may see it');
        const vis = admin.slice(admin.indexOf('function notifyTestVisible'),
                                admin.indexOf('async function sendTestNotification'));
        assert.match(vis, /String\(uid\) === String\(testUid\)/, 'the comparison is not an identity check');
        assert.match(admin, /notifyTestVisible\(uid, null\)/,
            'a failed read must leave the button hidden, not showing');
    });

    // ---- THE PREFLIGHT (2026-10-04) --------------------------------------
    //
    // The app reported "Could not reach the sender: Load failed" with a token in
    // hand. A POST carrying content-type: application/json is not a simple
    // request: the browser - WKWebView included - sends OPTIONS first and will
    // not send the POST at all unless that answer allows the method and the
    // header. Nothing exported onRequestOptions, the preflight fell to the
    // catch-all and came back 405, and fetch() gives a failed preflight no status
    // and no body - so the app could say nothing more useful than "Load failed".
    test('the route answers a preflight, and only for an origin we allow', async () => {
        const route = await import('./functions/api/push-send.js');
        assert.equal(typeof route.onRequestOptions, 'function', 'the route answers no preflight');
        const ask = (origin) => ({ method: 'OPTIONS', headers: { get: (k) =>
            k === 'Origin' ? origin : (k === 'Access-Control-Request-Headers' ? 'content-type' : null) } });
        const ok = await route.onRequestOptions({ request: ask('capacitor://localhost') });
        assert.equal(ok.status, 204, 'a preflight with a body invites a caller to read one');
        assert.equal(ok.headers.get('access-control-allow-origin'), 'capacitor://localhost');
        assert.match(ok.headers.get('access-control-allow-methods') || '', /POST/);
        assert.match(ok.headers.get('access-control-allow-headers') || '', /content-type/);
        // A STRANGER GETS NOTHING, as before. The budget behind this proxy is the
        // whole reason it is not '*'.
        const no = await route.onRequestOptions({ request: ask('https://evil.example') });
        assert.equal(no.headers.get('access-control-allow-origin'), null);
    });

    test('and EVERY answer carries the header, refusals included', async () => {
        const route = await import('./functions/api/push-send.js');
        const post = (origin) => ({
            method: 'POST',
            headers: { get: (k) => (k === 'Origin' ? origin : null) },
            json: async () => ({ decided: { send: false }, tokens: [] })
        });
        // No credential in this context, so this is the not_configured path - the
        // exact answer the app most needs to be allowed to read.
        const res = await route.onRequestPost({ request: post('capacitor://localhost'), env: {} });
        assert.equal(res.headers.get('access-control-allow-origin'), 'capacitor://localhost',
            'a refusal the app cannot read is indistinguishable from the network being down');
        const body = JSON.parse(await res.text());
        assert.equal(body.status, 'unavailable');
        assert.equal(body.reason, 'not_configured');
    });

    test('the catch-all answers a preflight for any route that exports one later', async () => {
        const mod = await import('./functions/api/[[path]].js');
        const res = await mod.onRequest({
            params: { path: ['course-search'] },
            request: { method: 'OPTIONS', headers: { get: (k) =>
                k === 'Origin' ? 'capacitor://localhost' : (k === 'Access-Control-Request-Headers' ? 'content-type' : null) } }
        });
        assert.equal(res.status, 204, 'a preflight to a real route is still refused: ' + res.status);
        assert.match(res.headers.get('access-control-allow-methods') || '', /GET/);
        // AND AN UNKNOWN PATH IS STILL A 404, preflight or not.
        const gone = await mod.onRequest({
            params: { path: ['nope'] },
            request: { method: 'OPTIONS', headers: { get: () => 'capacitor://localhost' } }
        });
        assert.equal(gone.status, 404);
    });

    test('the route is thin, POST-only, and the catch-all knows it', async () => {
        const route = read('functions/api/push-send.js');
        assert.match(route, /export async function onRequestPost/);
        assert.ok(!/onRequestGet/.test(route), 'a GET must fall through to the catch-all for its 405');
        assert.ok(route.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//')).length < 25,
            'if logic accumulates here it accumulates where it cannot be tested without a credential');
        const catchall = read('functions/api/[[path]].js');
        assert.match(catchall, /push-send\.js/,
            'a route with no row answers Pages SPA fallback at 200 - which a caller reads as success');
    });
});
