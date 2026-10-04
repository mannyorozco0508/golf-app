// ============================================================================
// A NOTIFICATION YOU CAN ACTUALLY SEE, AND A TAP THAT GOES SOMEWHERE (2026-10-04)
//
// WHAT HAPPENED. Push worked end to end - "Sent to 1 device" - and no banner
// appeared, because the app was in the FOREGROUND. That is not a delivery
// failure and nothing on the phone or in the Function could have said so.
//
// THE CAUSE, read out of the vendored plugin rather than guessed:
// PushNotificationsHandler.willPresent returns `[]` - present nothing - unless
// capacitor.config names presentationOptions. An empty option set is iOS being
// told, correctly, to show no banner. Test 2 below reads that default out of
// node_modules so this file cannot drift into guarding a fix for a bug that
// was fixed upstream.
//
// AND BOTH PLUGINS CLAIM THE SAME SLOT. @capacitor/push-notifications sets
// bridge.notificationRouter.pushNotificationHandler in its load(), and
// FirebaseMessaging sets the same property in its init - whichever loads last
// owns willPresent and the tap events. The messaging plugin defaults to
// ["badge","sound","alert"] and push-notifications defaults to nothing, so WHICH
// one wins decides whether a banner appears. Naming the options on BOTH is the
// only version of this that does not depend on plugin load order.
//
// WHAT IS NOT GUARDED HERE, said plainly: that a banner appears on Manny's
// phone. That is iOS drawing a UNNotification from a config value, and no test
// in this repo can see it. What is guarded is that the value is there, on both
// plugins, and that a tap is bound and routed.
//
// BASELINE, measured over the FINISHED file against pre-build main (6c8ad0a),
// all 15 tests: 2 PASS / 13 FAIL.
//   The two that pass are the only two that do not describe this wave at all:
//   both read node_modules, which this wave does not touch - the vendored
//   default really is silence, and both plugins really do claim the same
//   handler slot. Everything else is red, including the five real kinds, which
//   pushActionHref has built correctly since Wave 39 and which nothing routed
//   because no page listened for a tap.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const B = require('./push-boot.js');
const P = require('./push-notify.js');
Object.assign(global, P);
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const CONFIG = 'capacitor.config.ts';

describe('1. THE FOREGROUND BANNER IS A CONFIG VALUE', () => {

    test('both plugins are told to present alert, sound and badge', () => {
        const cfg = read(CONFIG);
        // The `plugins` block, not a comment about it: strip the comments first.
        const live = cfg.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
        ['PushNotifications', 'FirebaseMessaging'].forEach((name) => {
            const at = live.indexOf(name + ': {');
            assert.ok(at > 0, name + ' has no plugin config, so its willPresent reads nothing');
            const block = live.slice(at, live.indexOf('}', at));
            assert.match(block, /presentationOptions/, name + ' does not name presentationOptions');
            ['alert', 'badge', 'sound'].forEach((opt) => {
                assert.match(block, new RegExp("'" + opt + "'"),
                    name + ' does not ask for ' + opt + ' while the app is open');
            });
        });
    });

    test('and the vendored default really is silence - so this is needed', () => {
        const h = path.join(__dirname, 'node_modules/@capacitor/push-notifications',
            'ios/Sources/PushNotificationsPlugin/PushNotificationsHandler.swift');
        assert.ok(fs.existsSync(h), 'the push plugin is not installed - nothing can be read');
        const src = fs.readFileSync(h, 'utf8');
        const fn = src.slice(src.indexOf('func willPresent'), src.indexOf('func didReceive'));
        assert.ok(fn.length > 200, 'the slice is empty - willPresent drifted');
        assert.match(fn, /getConfig\(\)\.getArray\("presentationOptions"\)/,
            'the plugin no longer reads the config key this wave sets');
        // THE LAST STATEMENT, which is what runs when the key is absent.
        assert.match(fn.slice(fn.lastIndexOf('return')), /return \[\]/,
            'the plugin now has a non-empty default - re-read it before trusting the comment above');
    });

    test('both plugins fight over the same handler slot, which is why both are named', () => {
        const pushLoad = fs.readFileSync(path.join(__dirname,
            'node_modules/@capacitor/push-notifications/ios/Sources/PushNotificationsPlugin/PushNotificationsPlugin.swift'), 'utf8');
        const fbInit = fs.readFileSync(path.join(__dirname,
            'node_modules/@capacitor-firebase/messaging/ios/Plugin/FirebaseMessaging.swift'), 'utf8');
        assert.match(pushLoad, /notificationRouter\.pushNotificationHandler = /);
        assert.match(fbInit, /notificationRouter\.pushNotificationHandler = /,
            'only one plugin claims the slot now - the two-config belt can be reconsidered');
    });
});

describe('2. WHERE A TAP LANDS', () => {

    test('the test notification lands on Account, not on a round', () => {
        assert.equal(B.pushTapHref('https://x.dev', '/', { test: '1' }),
            'https://x.dev/admin.html?account=1');
        // It carries no round, so the round routes must not be able to claim it.
        assert.ok(!/index\.html|settlement\.html|sidematches\.html/.test(
            B.pushTapHref('https://x.dev', '/', { test: '1', kind: 'youre-in' })),
            'a test notification lands on a round it does not belong to');
    });

    test('and a real one lands on its own round', () => {
        const at = (data) => B.pushTapHref('https://x.dev', '/', data);
        assert.equal(at({ kind: 'youre-in', roundCode: 'ABCD' }), 'https://x.dev/index.html?game=ABCD');
        assert.equal(at({ kind: 'hype', roundCode: 'ABCD' }), 'https://x.dev/index.html?game=ABCD');
        assert.equal(at({ kind: 'final-results', roundCode: 'ABCD' }), 'https://x.dev/settlement.html?game=ABCD');
        assert.match(at({ kind: 'bet-challenge', roundCode: 'ABCD', offerId: 'c9' }),
            /sidematches\.html\?game=ABCD&challenge=c9/);
        assert.match(at({ kind: 'press-offered', roundCode: 'ABCD', matchId: 'm2', aloha: '1' }),
            /sidematches\.html\?game=ABCD&aloha=m2/);
    });

    test('a notification with nothing in it cannot send anybody anywhere odd', () => {
        const href = B.pushTapHref('https://x.dev', '/', {});
        assert.match(href, /^https:\/\/x\.dev\/index\.html\?game=$/,
            'an empty payload builds a surprising URL: ' + href);
    });
});

describe('3. THE TAP IS BOUND, NOT MERELY BUILDABLE', () => {

    // A HREF BUILDER NOTHING LISTENS TO IS THE WAVE-39 DEFECT ALL OVER AGAIN:
    // pushActionHref has existed since the wave was built and NO PAGE CALLED IT,
    // so every tap on every notification opened whatever the app was last on.
    // These tests go through addListener, the way the plugin does.
    const fakePlugins = () => {
        const listeners = {};
        const mk = () => ({ addListener: (ev, fn) => { listeners[ev] = fn; } });
        return { listeners, plugins: { native: true, push: mk(), messaging: mk() } };
    };

    test('it listens on BOTH plugins, because either one may own the tap', () => {
        const f = fakePlugins();
        const out = B.pushBindNotifications({ plugins: f.plugins, go: () => {} });
        assert.equal(out.bound, true);
        ['pushNotificationActionPerformed', 'pushNotificationReceived',
         'notificationActionPerformed', 'notificationReceived'].forEach((ev) => {
            assert.equal(typeof f.listeners[ev], 'function', ev + ' is not listened for');
        });
    });

    test('a tap delivered by the plugin navigates - nothing calls the builder by name', () => {
        const f = fakePlugins();
        const went = [];
        B.pushBindNotifications({
            plugins: f.plugins, origin: 'https://x.dev', dir: '/',
            go: (href) => went.push(href)
        });
        f.listeners.pushNotificationActionPerformed({
            actionId: 'tap',
            notification: { id: 'n1', data: { kind: 'final-results', roundCode: 'WXYZ' } }
        });
        assert.deepEqual(went, ['https://x.dev/settlement.html?game=WXYZ']);
        // AND THE OTHER PLUGIN'S EVENT ROUTES THE SAME WAY.
        f.listeners.notificationActionPerformed({
            notification: { id: 'n2', data: { test: '1' } }
        });
        assert.equal(went[1], 'https://x.dev/admin.html?account=1');
    });

    test('one tap seen by both plugins navigates once', () => {
        const f = fakePlugins();
        const went = [];
        B.pushBindNotifications({ plugins: f.plugins, origin: 'https://x.dev', dir: '/', go: (h) => went.push(h) });
        const ev = { notification: { id: 'n1', data: { kind: 'youre-in', roundCode: 'ABCD', dedupeKey: 'youre-in:ABCD:u1' } } };
        f.listeners.pushNotificationActionPerformed(ev);
        f.listeners.notificationActionPerformed(ev);
        assert.equal(went.length, 1, 'the same tap navigated twice: ' + JSON.stringify(went));
    });

    test('a notification arriving while the app is open is handed to the page', () => {
        const f = fakePlugins();
        const got = [];
        B.pushBindNotifications({ plugins: f.plugins, go: () => {}, onReceive: (d) => got.push(d) });
        f.listeners.pushNotificationReceived({ id: 'n3', data: { test: '1' } });
        assert.deepEqual(got, [{ test: '1' }]);
    });

    test('on the web it binds nothing and says so', () => {
        const out = B.pushBindNotifications({ plugins: { native: false, push: null, messaging: null } });
        assert.deepEqual(out, { bound: false, reason: 'no-plugin' });
    });

    test('BOTH PAGES bind it on arrival, and admin honours the Account link', () => {
        ['index.html', 'admin.html'].forEach((f) => {
            const live = read(f).split('\n').filter((l) => !/^\s*(\/\/|<!--)/.test(l)).join('\n');
            assert.match(live, /pushBindNotifications\(\{/, f + ' never binds a tap handler');
        });
        const admin = read('admin.html');
        assert.match(admin, /urlParams\.get\('account'\)/,
            'admin.html cannot be arrived at with the Account panel open, so the test tap lands nowhere');
        assert.match(admin, /openAccountPanel\(\)/);
    });
});

describe('4. SEND IN TEN SECONDS', () => {

    test('the button exists, says what it is for, and waits', () => {
        const admin = read('admin.html');
        assert.match(admin, /id="notify-test-delay-btn"/, 'there is no delayed test button');
        assert.match(admin, /onclick="sendTestNotificationLater\(10\)"/,
            'the delayed button does not call the delayed sender with a delay');
        const at = admin.indexOf('function sendTestNotificationLater(');
        assert.ok(at > 0, 'the delayed sender does not exist');
        const fn = admin.slice(at, admin.indexOf('\n    function ', at + 30));
        assert.ok(fn.length > 200, 'the slice is empty - the endpoint drifted');
        assert.match(fn, /setInterval|setTimeout/, 'it sends immediately, which is the thing it exists not to do');
        assert.match(fn, /sendTestNotification\(\)/, 'the wait never reaches the real sender');
        assert.match(fn, /[Ll]ock/, 'it does not tell him what the ten seconds are for');
    });

    test('and the real sender still goes through the real decider', () => {
        // The delayed button must not become a second, simpler sender. AND THIS
        // SLICE IS ASSERTED TO EXIST FIRST: a negative-only block is satisfied
        // forever by a slice that truncated to nothing, which is exactly what it
        // did against pre-build main.
        const admin = read('admin.html');
        const at = admin.indexOf('function sendTestNotificationLater(');
        assert.ok(at > 0, 'the delayed sender does not exist');
        const fn = admin.slice(at, admin.indexOf('\n    function ', at + 30));
        assert.ok(fn.length > 200, 'the slice is empty - the endpoint drifted');
        assert.match(fn, /notify-test-note/, 'it says nothing while it waits');
        assert.ok(!/pushDecide|push-send/.test(fn),
            'the delayed path builds its own send - there must be exactly one sender');
    });
});

describe('5. A TAP NEEDS SOMETHING TO ROUTE ON', () => {

    test('the decision carries its kind and round, and the message carries them as data', async () => {
        const decided = P.pushDecide({
            kind: 'final-results', tokens: ['t'], prefs: { bets: true, hype: true },
            facts: { uid: 'u1', roundCode: 'ABCD', moneyText: '+$20' }
        });
        assert.equal(decided.send, true, 'refused: ' + decided.reason);
        assert.equal(decided.kind, 'final-results', 'the decision does not say what it is about');
        assert.equal(decided.roundCode, 'ABCD', 'the decision does not say which round');
        const { fcmMessage } = await import('./functions/api/_push.js');
        const msg = fcmMessage('tok', decided, {});
        assert.equal(msg.message.data.kind, 'final-results',
            'the phone receives no kind, so a tap cannot know where to go');
        assert.equal(msg.message.data.roundCode, 'ABCD',
            'the phone receives no round code, so a tap cannot open the round');
    });
});
