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
//   2. THE REMINDER IS SCHEDULED ONCE PER CHANGE. Re-registering on every
//      snapshot is how a phone pending queue fills with duplicates of one
//      reminder, and this listener fires on every write to the round. The id is
//      derived from the round code so a reschedule REPLACES, and the device
//      remembers the ISO it scheduled so an unchanged time does nothing.
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
// all 21 tests: 1 PASS / 20 FAIL. Both modules were restored by sha from saved
// copies (3ec2930142fcddef, eb8526e087d16e90), never with git restore.
//
//   THE ONE PASS is "the route is thin, POST-only, and the catch-all knows it",
//   which is a source scan of push-send.js and the catch-all - neither of which
//   the stub touched. It is a real guard and it says nothing about behaviour.
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
require('./tee-time.js');   // push-boot reads its globals through typeof guards
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

// push-boot.js calls teeTimeReminderAt / teeTimeOf / teeTimeShort / pushCopy as
// GLOBALS, the way a page provides them. In node they are module exports, so the
// test supplies them the same way the browser does.
const TEE = require('./tee-time.js');
Object.assign(global, TEE, P);

const PHX = TEE.teeTimeBuild('2026-10-04', '08:40', 420, 'America/Phoenix');
const ROUND = Object.assign({ eventName: 'Saturday at Legacy', courseName: 'Legacy Golf Resort' }, PHX);
const BEFORE = Date.UTC(2026, 9, 3, 12, 0);

// A recording LocalNotifications stand-in, the shape the plugin exposes.
function fakeLocal(over) {
    const o = over || {};
    const log = { scheduled: [], cancelled: [], asked: 0 };
    return {
        log,
        async checkPermissions() { return { display: o.display || 'granted' }; },
        async requestPermissions() { log.asked++; return { display: o.afterAsk || 'granted' }; },
        async schedule(req) { if (o.throwOnSchedule) throw new Error('nope'); log.scheduled.push(req); },
        async cancel(req) { log.cancelled.push(req); }
    };
}

// ===========================================================================
describe('1. ON THE WEB, NOTHING HAPPENS AT ALL', () => {

    test('no plugin means a reason and no side effect, on every entry point', async () => {
        const none = { plugins: { native: false, push: null, local: null } };
        assert.deepEqual(await B.pushScheduleReminder('GFLBAM', ROUND, none),
            { scheduled: false, reason: 'no-plugin' });
        assert.deepEqual(await B.pushRegisterToken({ plugins: { push: null } }),
            { registered: false, reason: 'no-plugin' });
        assert.equal(await B.pushEnsureLocalPermission(null), false);
    });

    test('pushPlugins() answers safely with no Capacitor at all', () => {
        // In node there is no window, which is the browser-with-no-shell case too.
        const p = B.pushPlugins();
        assert.equal(p.native, false);
        assert.equal(p.push, null);
        assert.equal(p.local, null);
    });

    test('A TOKEN IS NEVER WRITTEN WITHOUT A UID, A PLAYER AND A WRITER', async () => {
        const push = { async checkPermissions() { return { receive: 'granted' }; } };
        assert.equal((await B.pushRegisterToken({ plugins: { push }, playerId: '101', save: () => {} })).reason, 'no-uid');
        assert.equal((await B.pushRegisterToken({ plugins: { push }, uid: 'u', save: () => {} })).reason, 'no-player');
        assert.equal((await B.pushRegisterToken({ plugins: { push }, uid: 'u', playerId: '101' })).reason, 'no-writer');
    });
});

// ===========================================================================
describe('2. THE REMINDER IS SCHEDULED ONCE PER CHANGE', () => {

    test('a round with a tee time schedules one notification, 30 minutes before', async () => {
        const local = fakeLocal();
        const r = await B.pushScheduleReminder('GFLBAM', ROUND, { plugins: { local }, now: BEFORE, stored: null });
        assert.equal(r.scheduled, true, r.reason);
        assert.equal(local.log.scheduled.length, 1);
        const n = local.log.scheduled[0].notifications[0];
        assert.equal(n.schedule.at.getTime(), TEE.teeTimeOf(ROUND).ms - 30 * 60 * 1000);
        assert.match(n.title, /30 minutes/);
        assert.match(n.body, /Saturday at Legacy/);
        assert.match(n.body, /8:40 AM/, 'the body must quote the tee time in the ROUND\'s zone');
        assert.equal(n.extra.roundCode, 'GFLBAM');
    });

    test('AN UNCHANGED TEE TIME SCHEDULES NOTHING, which is the whole point', async () => {
        // This runs on every snapshot of the round - every score anybody posts.
        const local = fakeLocal();
        const r = await B.pushScheduleReminder('GFLBAM', ROUND,
            { plugins: { local }, now: BEFORE, stored: PHX.teeTimeISO });
        assert.equal(r.scheduled, false);
        assert.equal(r.reason, 'unchanged');
        assert.equal(local.log.scheduled.length, 0,
            're-registering on every snapshot fills a phone pending queue with duplicates of '
            + 'one reminder');
    });

    test('A MOVED TEE TIME RESCHEDULES, and the id is the same so it REPLACES', async () => {
        const moved = Object.assign({}, ROUND, TEE.teeTimeBuild('2026-10-04', '09:10', 420, 'America/Phoenix'));
        const local = fakeLocal();
        const r = await B.pushScheduleReminder('GFLBAM', moved,
            { plugins: { local }, now: BEFORE, stored: PHX.teeTimeISO });
        assert.equal(r.scheduled, true, r.reason);
        assert.equal(r.id, B.pushReminderId('GFLBAM'),
            'a changing id would leave the old reminder pending and add a second one');
        assert.equal(local.log.cancelled.length, 0, 'schedule replaces; a cancel first opens a window to lose it');
    });

    test('a round with NO tee time schedules nothing - and CANCELS one it had', async () => {
        const local = fakeLocal();
        const fresh = await B.pushScheduleReminder('GFLBAM', {}, { plugins: { local }, now: BEFORE, stored: null });
        assert.deepEqual(fresh, { scheduled: false, reason: 'no-tee-time' });
        assert.equal(local.log.scheduled.length, 0);

        const cleared = await B.pushScheduleReminder('GFLBAM', {},
            { plugins: { local }, now: BEFORE, stored: PHX.teeTimeISO });
        assert.equal(cleared.reason, 'cleared');
        assert.equal(local.log.cancelled.length, 1,
            'an organizer who removes a tee time must stop the reminder, not leave it pending');
    });

    test('A TEE TIME THAT HAS PASSED IS NEVER SCHEDULED', async () => {
        // A phone fires a past notification immediately: a golfer opening a
        // finished round would be told to go and tee off.
        const local = fakeLocal();
        const r = await B.pushScheduleReminder('GFLBAM', ROUND,
            { plugins: { local }, now: Date.UTC(2027, 0, 1), stored: null });
        assert.equal(r.scheduled, false);
        assert.equal(r.reason, 'already-passed');
        assert.equal(local.log.scheduled.length, 0);
    });

    test('ids are per round, stable, and valid 32-bit positives', () => {
        assert.equal(B.pushReminderId('GFLBAM'), B.pushReminderId('GFLBAM'));
        assert.notEqual(B.pushReminderId('GFLBAM'), B.pushReminderId('ABCDEF'));
        ['GFLBAM', 'A', 'ZZZZZZ', ''].forEach((c) => {
            const id = B.pushReminderId(c);
            assert.ok(Number.isInteger(id) && id > 0 && id < 2147483647, c + ' -> ' + id);
        });
    });

    test('DENIED PERMISSION IS NOT ASKED AGAIN, and schedules nothing', async () => {
        const local = fakeLocal({ display: 'denied' });
        const r = await B.pushScheduleReminder('GFLBAM', ROUND, { plugins: { local }, now: BEFORE, stored: null });
        assert.equal(r.reason, 'no-permission');
        assert.equal(local.log.asked, 0, 'iOS gives one chance and a declined prompt must not be re-shown');
        assert.equal(local.log.scheduled.length, 0);
    });

    test('a prompt is shown when permission has never been asked', async () => {
        const local = fakeLocal({ display: 'prompt' });
        const r = await B.pushScheduleReminder('GFLBAM', ROUND, { plugins: { local }, now: BEFORE, stored: null });
        assert.equal(r.scheduled, true, r.reason);
        assert.equal(local.log.asked, 1);
    });

    test('A THROWING PLUGIN IS A REASON, NOT AN EXCEPTION', async () => {
        const local = fakeLocal({ throwOnSchedule: true });
        const r = await B.pushScheduleReminder('GFLBAM', ROUND, { plugins: { local }, now: BEFORE, stored: null });
        assert.equal(r.scheduled, false);
        assert.equal(r.reason, 'schedule-failed');
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
        ['index.html', 'admin.html', 'game.html', 'trip.html', 'push-boot.js', 'push-notify.js', 'tee-time.js']
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
