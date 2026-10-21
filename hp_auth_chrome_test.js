// ============================================================================
// URGENT-048 part 2 - window.HardPanAuth in REAL headless Chrome (393x852 and 375x667).
//
// home.html / index.html / settlement.html as they ship, the journey harness's stub
// database (every write recorded in window.__WRITES), and a STUB Firebase auth with
// the link / sign-in calls recorded (window.__AUTHCALLS). The native Apple / Google
// sheet is a stub plugin returning a fresh fake token per call - a real Apple or
// Google sign-in is NOT exercised here (it cannot be, in Chrome or the Simulator).
// Synthetic rounds only (codes TST048 / TSTB48, never written anywhere).
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'simple-flow.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const CD = makeCourseData(18);
function rnd(code, owner) {
    const r = wizardSavedRound({ code, golfers: 2, names: ['Test A', 'Test B'], ownerUid: owner, thru: 2, flights: false, courseData: CD,
        overrides: { activeCourseKey: 'comm_links', courseName: 'Test Links', groupSizeOverrides: { 0: 2 } } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed; delete r.sideMatches;
    r.additionalGameInstances = {}; r.additionalGames = {}; r.gameFormat = 'stroke';
    return r;
}
const R1 = rnd('TST048', 'anon-cold');
const DB = () => ({ events: { TST048: R1 }, global_courses: { comm_links: { name: 'Test Links', data: CD } }, trips: {}, organizers: {}, tournaments: {} });

// One auth instance for the page: anonymous 'anon-cold'; `taken` providers belong to acct9.
const AUTH = (taken) => `(function(){
  var calls = window.__AUTHCALLS = [], listeners = [], n = 0, TAKEN = ${JSON.stringify(taken || [])};
  var other = { uid: 'acct9', isAnonymous: false, email: 'golfer@example.com', displayName: 'Manny Golfer', providerData: [{ providerId: 'apple.com' }] };
  function fire() { listeners.slice().forEach(function (f) { try { f(A.currentUser); } catch (e) {} }); }
  var anon = { uid: 'anon-cold', isAnonymous: true, email: null, displayName: null, providerData: [],
    linkWithCredential: function (c) { calls.push(['linkWithCredential', c.providerId, c.idToken || null]);
      if (TAKEN.indexOf(c.providerId) !== -1) { var e = new Error('in use'); e.code = 'auth/credential-already-in-use'; return Promise.reject(e); }
      anon.isAnonymous = false; anon.providerData = [{ providerId: c.providerId }]; anon.email = 'me@example.com'; setTimeout(fire, 0); return Promise.resolve({ user: anon }); } };
  var A = { currentUser: anon,
    onAuthStateChanged: function (f) { listeners.push(f); setTimeout(function () { f(A.currentUser); }, 0); return function () {}; },
    signInAnonymously: function () { calls.push(['signInAnonymously']); return Promise.resolve({ user: A.currentUser }); },
    signInWithCredential: function (c) { calls.push(['signInWithCredential', c.providerId, c.idToken || null]); A.currentUser = other; setTimeout(fire, 0); return Promise.resolve({ user: other }); },
    signOut: function () { calls.push(['signOut']); A.currentUser = null; setTimeout(fire, 0); return Promise.resolve(); } };
  function Google() { this.providerId = 'google.com'; this.addScope = function () {}; }
  Google.credential = function (t) { return { providerId: 'google.com', idToken: t }; };
  function OAuth(id) { this.providerId = id; this.addScope = function () {}; this.credential = function (x) { return { providerId: id, idToken: x.idToken }; }; }
  var fn = function () { return A; }; fn.GoogleAuthProvider = Google; fn.OAuthProvider = OAuth;
  window.firebase.auth = fn;
  window.Capacitor = { Plugins: { FirebaseAuthentication: {
    signInWithApple: function () { calls.push(['nativeApple']); return Promise.resolve({ credential: { idToken: 'apple-tok-' + (++n), nonce: 'x' + n } }); },
    signInWithGoogle: function () { calls.push(['nativeGoogle']); return Promise.resolve({ credential: { idToken: 'g-tok-' + (++n) } }); } } } };
})();`;
const SEED = "try{if(!sessionStorage.getItem('hpaseed')){sessionStorage.setItem('hpaseed','1');"
    + "localStorage.setItem('golfapp_snap_v1_TST048', JSON.stringify({ at: Date.now() - 60000, data: " + JSON.stringify(R1) + ", meta: { group: null } }));"
    + "localStorage.setItem('hardpan_round_seen_v1', JSON.stringify({ TST048: Date.now() - 60000 }));}}catch(e){}";

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) {} } });
async function open(vp, taken) {
    const j = await openJourney({ db: DB(), viewport: vp, webgl: true,
        preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + AUTH(taken) + SEED });
    journeys.push(j);
    return j;
}
const ev = (j, x) => j.evaluate(x);
async function until(j, expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 10000)) { try { if (await ev(j, expr)) return true; } catch (e) {} await sleep(150); } return false; }
const ST = "JSON.stringify(window.HardPanAuth.state())";
const WRITES = "JSON.stringify((window.__WRITES || []).map(function (w) { return w.path; }))";
const SCRIPTS = "JSON.stringify(Array.prototype.map.call(document.scripts, function (s) { return (s.getAttribute('src') || '').replace(/^.*\\//, ''); }).filter(Boolean))";
async function run(j, expr) { // a promise in the page -> its JSON, or { error }
    await ev(j, "window.__R = null; Promise.resolve().then(function () { return " + expr + "; }).then(function (r) { window.__R = JSON.stringify({ ok: r === undefined ? null : r }); }, function (e) { window.__R = JSON.stringify({ error: { code: e && e.code, message: e && e.message } }); }); 1");
    assert.ok(await until(j, 'window.__R !== null', 15000), 'promise settled: ' + expr);
    return JSON.parse(await ev(j, 'window.__R'));
}

for (const vp of [{ width: 393, height: 852 }, { width: 375, height: 667 }]) {
    const tag = vp.width + 'x' + vp.height;

    test(tag + ': Home - anonymous, then Sign in with Apple LINKS (same uid), profile feeds front-door, sign out', { timeout: 120000 }, async () => {
        const j = await open(vp);
        await j.goto(fileUrl('home.html'), 2500);
        assert.ok(await until(j, '!!window.HardPanAuth && !!window.HardPanDoors'));
        let s = JSON.parse(await ev(j, ST));
        assert.equal(s.signedIn, false); assert.equal(s.anonymous, true); assert.equal(s.uid, 'anon-cold');
        const before = JSON.parse(await ev(j, SCRIPTS));
        assert.ok(!before.includes('oauth-signin.js') && !before.includes('email-link-auth.js') && !before.includes('account-exit.js'), 'nothing loaded until a tap');
        await ev(j, "window.__CH = []; window.HardPanAuth.onChange(function (s) { window.__CH.push(s.signedIn); }); 1");
        const r = await run(j, 'window.HardPanAuth.signInApple()');
        assert.ok(r.ok, JSON.stringify(r));
        assert.equal(r.ok.uid, 'anon-cold'); assert.equal(r.ok.preserved, true);
        const calls = JSON.parse(await ev(j, 'JSON.stringify(window.__AUTHCALLS)'));
        assert.deepEqual(calls.map((c) => c[0]).filter((c) => c !== 'signInAnonymously'), ['nativeApple', 'linkWithCredential'], 'linked, never switched');
        assert.ok(await until(j, "window.__CH.indexOf(true) !== -1"), 'onChange fired');
        s = JSON.parse(await ev(j, ST));
        assert.equal(s.signedIn, true); assert.equal(s.uid, 'anon-cold'); assert.equal(s.provider, 'apple');
        assert.ok(JSON.parse(await ev(j, SCRIPTS)).includes('oauth-signin.js'), 'the existing oauth-signin.js was loaded and used');
        // Profile -> the stores front-door / venmo-pay already read.
        const p = await run(j, "window.HardPanAuth.profile.set({ name: 'Manny', hcp: '12.4', tees: 'White', venmo: '@manny-golf' })");
        assert.ok(p.ok, JSON.stringify(p));
        assert.equal(p.ok.venmo, 'manny-golf'); assert.equal(p.ok.tees, 'White');
        assert.equal(await ev(j, 'window.HardPanDoors.meName()'), 'Manny');
        assert.equal(await ev(j, 'window.HardPanDoors.myHcp()'), '12.4');
        assert.equal(await ev(j, 'window.HardPanVenmo.getProfile().venmo'), 'manny-golf');
        s = JSON.parse(await ev(j, ST)); assert.equal(s.name, 'Manny'); assert.equal(s.initial, 'M');
        assert.deepEqual(JSON.parse(await ev(j, 'JSON.stringify(window.HardPanAuth.movedRounds())')), []);
        const o = await run(j, 'window.HardPanAuth.signOut({ reload: false })');
        assert.ok(o.ok, JSON.stringify(o));
        assert.equal(JSON.parse(await ev(j, ST)).signedIn, false);
        assert.ok(await ev(j, "!!localStorage.getItem('golfapp_snap_v1_TST048')"), 'sign-out keeps this phone\'s round');
        assert.deepEqual(JSON.parse(await ev(j, WRITES)), [], 'no database write');
    });

    test(tag + ': identity already exists - switches account; round stays in History, its ownerUid is the old anonymous uid (noted, not written)', { timeout: 120000 }, async () => {
        const j = await open(vp, ['apple.com']);
        await j.goto(fileUrl('home.html'), 2500);
        assert.ok(await until(j, '!!window.HardPanAuth && !!window.HardPanDoors'));
        const r = await run(j, 'window.HardPanAuth.signInApple()');
        assert.ok(r.ok, JSON.stringify(r));
        assert.equal(r.ok.uid, 'acct9'); assert.equal(r.ok.preserved, false);
        const calls = JSON.parse(await ev(j, 'JSON.stringify(window.__AUTHCALLS)')).filter((c) => c[0] !== 'signInAnonymously');
        assert.deepEqual(calls.map((c) => c[0]), ['nativeApple', 'linkWithCredential', 'nativeApple', 'signInWithCredential']);
        assert.notEqual(calls[1][2], calls[3][2], 'a fresh Apple token for the switch');
        assert.ok(await until(j, "window.authBootState.uid === 'acct9'"), 'authBootState follows the account');
        assert.deepEqual(JSON.parse(await ev(j, 'JSON.stringify(window.HardPanAuth.movedRounds())')), [{ code: 'TST048', ownerUid: 'anon-cold', nowUid: 'acct9' }]);
        // Still in History.
        assert.ok(await j.tap('[data-hp-act="shistory"]'), 'History link');
        assert.ok(await until(j, "!!document.querySelector('#hp-history-list [data-hp-hist=\"TST048\"]')"), 'TST048 still in History');
        assert.deepEqual(JSON.parse(await ev(j, WRITES)), [], 'no database write');
    });
}

test('the round page and Results carry HardPanAuth too', { timeout: 120000 }, async () => {
    const j = await open({ width: 393, height: 852 });
    await j.goto(fileUrl('index.html?game=TST048'), 3000);
    assert.ok(await until(j, '!!window.HardPanAuth'), 'index.html');
    assert.equal(JSON.parse(await ev(j, ST)).uid, 'anon-cold');
    await j.goto(fileUrl('settlement.html?game=TST048'), 3000);
    assert.ok(await until(j, '!!window.HardPanAuth'), 'settlement.html');
    assert.equal(JSON.parse(await ev(j, ST)).signedIn, false);
});
