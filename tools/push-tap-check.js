#!/usr/bin/env node
// ============================================================================
// A TAP ON A NOTIFICATION, IN A COLD BROWSER, WITH NOTHING CALLED BY NAME.
//
// WHAT THIS PROVES, AND WHY A UNIT TEST CANNOT. push-boot.js's binder is tested
// against a fake plugin, which proves the binder. The defect this wave fixes is
// one level up: pushActionHref was built in Wave 39, it was correct, and NO PAGE
// EVER LISTENED - so every tap on every notification opened whatever the app was
// last showing. A guard that calls pushBindNotifications itself cannot tell that
// apart from a page that binds nothing.
//
// SO THIS ARRIVES COLD and touches nothing. The only thing injected before the
// page's own scripts is a stand-in for window.Capacitor whose addListener RECORDS
// what the page asks to hear - exactly what the real plugin does. Then the
// recorded callback is fired the way iOS fires it: with a notification payload.
// Nothing the page defines is called from outside.
//
//   A  admin.html, signed in, with the test row switched on
//      - which events the page asked for, unprompted
//      - the Account panel is CLOSED on arrival
//      - a tapped TEST notification opens it
//      - one that arrives while the app is open says so on the card
//   B  admin.html?account=1 - the cross-page tap is a link, so the link works
//   C  index.html?game=COLD - a tapped FINAL RESULTS notification makes the page
//      request settlement.html?game=COLD. Read from the outbound request, not
//      document.URL, because the navigation completes.
//
// EXIT 0 all four pass. EXIT 1 something is wrong. EXIT 2 nothing was proven.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const UID = 'cold-organizer-uid';

// THE STAND-IN. isNativePlatform() true, because pushPlugins() reads it; two
// plugins, because the app binds on both and either may own the tap on a device.
// addListener records and nothing else - the page's own callbacks are the thing
// under test.
const CAP = `
(function () {
  window.__pushListeners = {};
  var rec = function (ev, fn) { window.__pushListeners[ev] = fn; return Promise.resolve({ remove: function () {} }); };
  var perm = function () { return Promise.resolve({ receive: 'granted' }); };
  window.Capacitor = {
    isNativePlatform: function () { return true; },
    Plugins: {
      PushNotifications: { addListener: rec, checkPermissions: perm, requestPermissions: perm,
                           register: function () { return Promise.resolve(); } },
      FirebaseMessaging: { addListener: rec, getToken: function () { return Promise.resolve({ token: 'cold-fcm-token' }); } }
    }
  };
})();
`;

const CLASS = (id) => `(function(){var e=document.getElementById('${id}'); return e ? String(e.className||'') : 'MISSING';})()`;
const FIRE = (ev, payload) =>
    `(function(){var f=window.__pushListeners['${ev}']; if(typeof f!=='function') return 'NOT BOUND';`
    + ` try { f(${payload}); } catch (e) { return 'threw: ' + e.message; } return 'fired';})()`;

const PLAYERS = [{ id: 101, name: 'Ann Adams', hcp: '2', playingForMoney: true },
                 { id: 102, name: 'Bob Brown', hcp: '6', playingForMoney: true }];
const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const ROUND = { eventName: 'Tap Check', gameFormat: 'stroke', players: PLAYERS,
                courseData: CD, scores: {}, settlementMode: 'whole-dollar' };

function bail(reason) {
    console.error('BAILED: ' + reason);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

(async () => {
    const problems = [];

    // ---- A -----------------------------------------------------------------
    const a = await arriveCold({
        url: fileUrl('admin.html', ''),
        db: { events: {}, trips: {}, global_courses: {}, tournaments: {},
              app_settings: { pushTestUid: UID } },
        auth: { uid: UID, email: 'cold@example.com', isAnonymous: false },
        preScript: CAP, viewport: { width: 390, height: 844 }, settleMs: 3500,
        steps: [
            { expression: `Object.keys(window.__pushListeners||{}).sort().join(',')` },
            { expression: CLASS('account-modal') },
            { expression: FIRE('pushNotificationActionPerformed', `{ notification: { id: 't1', data: { test: '1' } } }`) },
            { sleep: 400 },
            { expression: CLASS('account-modal') },
            { expression: FIRE('pushNotificationReceived', `{ id: 't2', data: { test: '1' } }`) },
            { sleep: 300 },
            { expression: `(function(){var e=document.getElementById('notify-test-note'); return e ? (e.innerText||'').trim() : 'MISSING';})()` },
        ],
    });
    if (!a.ok) bail('admin.html: ' + a.reason);
    const [bound, before, fired1, , after, fired2, , note] = a.value;
    const want = ['notificationActionPerformed', 'notificationReceived',
                  'pushNotificationActionPerformed', 'pushNotificationReceived'];
    want.forEach((ev) => {
        if (String(bound).indexOf(ev) === -1) problems.push('admin.html never asked to hear ' + ev + ' (bound: ' + bound + ')');
    });
    if (/open/.test(String(before))) problems.push('the Account panel is already open on arrival, so opening it proves nothing');
    if (fired1 !== 'fired') problems.push('the tap could not be delivered: ' + fired1);
    if (!/open/.test(String(after))) problems.push('a tapped test notification did not open the Account panel (class: ' + after + ')');
    if (fired2 !== 'fired') problems.push('the foreground arrival could not be delivered: ' + fired2);
    if (!/while the app was open/i.test(String(note))) problems.push('nothing on the card says it arrived while the app was open: "' + note + '"');

    // ---- B -----------------------------------------------------------------
    const b = await arriveCold({
        url: fileUrl('admin.html', 'account=1'),
        db: { events: {}, trips: {}, global_courses: {}, tournaments: {},
              app_settings: { pushTestUid: UID } },
        auth: { uid: UID, email: 'cold@example.com', isAnonymous: false },
        preScript: CAP, viewport: { width: 390, height: 844 }, settleMs: 3500,
        expression: CLASS('account-modal'),
    });
    if (!b.ok) bail('admin.html?account=1: ' + b.reason);
    if (!/open/.test(String(b.value))) problems.push('?account=1 did not open the Account panel (class: ' + b.value + ')');

    // ---- C -----------------------------------------------------------------
    const c = await arriveCold({
        url: fileUrl('index.html', 'game=COLD'),
        rounds: { COLD: ROUND },
        preScript: CAP, viewport: { width: 390, height: 844 }, settleMs: 3500,
        steps: [
            { expression: `Object.keys(window.__pushListeners||{}).sort().join(',')` },
            { expression: FIRE('pushNotificationActionPerformed',
                `{ notification: { id: 'f1', data: { kind: 'final-results', roundCode: 'COLD' } } }`) },
            { sleep: 900 },
        ],
    });
    if (!c.ok) bail('index.html: ' + c.reason);
    const [boundC, firedC] = c.value;
    want.forEach((ev) => {
        if (String(boundC).indexOf(ev) === -1) problems.push('index.html never asked to hear ' + ev + ' (bound: ' + boundC + ')');
    });
    if (firedC !== 'fired') problems.push('the round tap could not be delivered: ' + firedC);
    const asked = (c.requests || []).filter((u) => /settlement\.html/.test(u));
    if (!asked.length) problems.push('a tapped final-results notification asked for no settlement page at all');
    else if (!/settlement\.html\?game=COLD$/.test(asked[asked.length - 1]))
        problems.push('it asked for the wrong URL: ' + asked[asked.length - 1]);

    console.log(JSON.stringify({
        adminBound: bound, accountBefore: before, accountAfter: after, foregroundNote: note,
        accountLink: b.value, indexBound: boundC, navigatedTo: asked[asked.length - 1] || null,
        problems: problems,
    }, null, 2));
    if (problems.length) { console.error(problems.length + ' problem(s)'); process.exit(1); }
    console.log('OK - both pages bind a tap on arrival, and three taps land where they belong.');
})();
