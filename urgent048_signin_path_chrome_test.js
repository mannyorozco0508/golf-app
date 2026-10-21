// ============================================================================
// URGENT-048 (int-048) - THE WHOLE PATH, IN REAL CHROME, all three parts together:
// Settle up while signed out (anonymous, as every phone launches):
//   Pay with Venmo -> "Sign in to use Venmo" (hp-needs-account.js) -> Sign in
//   -> the REAL sign-in sheet (hp-account-ui.js) -> Sign in with Apple -> the
//   anonymous user is LINKED (same uid) through the real hp-auth.js + oauth-signin.js
//   -> Home's pill shows the golfer's initial -> back on Settle up, Pay with Venmo
//   opens straight away: no second prompt.
//
// STUBS (say so): Firebase auth is a fake (anonymous 'anon-int48', linkWithCredential
// recorded) and the native Apple sheet is a stub Capacitor FirebaseAuthentication
// plugin handing back a fake token. A real Apple sign-in is NOT exercised here.
// The round is the synthetic XGBACK fixture (tools/extra-games-backcompat.js), held
// in the journey harness's in-memory database: nothing is written anywhere real.
// At 393x852 and 375x667. Screens -> HPNA_SHOTS=<dir> (optional).
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-config.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { round } = require('./tools/extra-games-backcompat.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const SHOTS = process.env.HPNA_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const UID = 'anon-int48';

function db() {
    const base = round(true);
    base.date = '2026-10-21';
    base.courseName = 'Dobson Ranch';
    base.venmo = { 12: 'bob-baker-1', 13: 'cal-cole' };
    base.cashapp = { 13: 'CalCash' };
    return { events: { XGBACK: base }, global_courses: {}, trips: {}, tournaments: {} };
}

// A fake Firebase auth that survives page loads (sessionStorage), an anonymous user
// with linkWithCredential, and - installed on the tap - the native Apple sheet stub.
function fakeAuth() {
    return '(' + function (UID) {
        var CALLS = window.__CALLS = JSON.parse(sessionStorage.getItem('pa_calls') || '[]');
        function call(x) { CALLS.push(x); try { sessionStorage.setItem('pa_calls', JSON.stringify(CALLS)); } catch (e) { } }
        if (!sessionStorage.getItem('pa_user')) sessionStorage.setItem('pa_user', JSON.stringify({ uid: UID, isAnonymous: true, email: null, displayName: null, providerData: [] }));
        var U = null, L = [];
        function save() { sessionStorage.setItem('pa_user', JSON.stringify(U ? { uid: U.uid, isAnonymous: U.isAnonymous, email: U.email, displayName: U.displayName, providerData: U.providerData } : null)); }
        function fire() { L.slice().forEach(function (cb) { try { cb(U); } catch (e) { } }); }
        function mk(o) {
            if (!o) return null;
            var u = Object.assign({}, o);
            u.linkWithCredential = function (c) {
                call('link:' + c.providerId);
                u.isAnonymous = false; u.providerData = [{ providerId: c.providerId }]; u.displayName = 'Test 048 int Golfer';
                save(); setTimeout(fire, 0);
                return Promise.resolve({ user: u });
            };
            return u;
        }
        U = mk(JSON.parse(sessionStorage.getItem('pa_user') || 'null'));
        var A = {
            get currentUser() { return U; },
            onAuthStateChanged: function (cb) { L.push(cb); setTimeout(function () { cb(U); }, 0); return function () { L = L.filter(function (x) { return x !== cb; }); }; },
            signInAnonymously: function () { call('anon'); return Promise.resolve({ user: U }); },
            signInWithCredential: function (c) { call('signInWith:' + c.providerId); return Promise.reject(Object.assign(new Error('not in this test'), { code: 'auth/internal-error' })); },
            signInWithPopup: function () { return Promise.reject(Object.assign(new Error('no popup'), { code: 'auth/popup-blocked' })); },
            signOut: function () { call('auth.signOut'); U = null; save(); fire(); return Promise.resolve(); }
        };
        var auth = function () { return A; };
        auth.GoogleAuthProvider = function () { this.providerId = 'google.com'; this.addScope = function () { }; };
        auth.GoogleAuthProvider.credential = function (id) { return { providerId: 'google.com', idToken: id }; };
        auth.OAuthProvider = function (id) { this.providerId = id; this.addScope = function () { }; this.credential = function (o) { return { providerId: id, idToken: o.idToken, rawNonce: o.rawNonce }; }; };
        window.firebase.auth = auth;
        window.__installNative = function () {
            window.Capacitor = window.Capacitor || {};
            window.Capacitor.Plugins = window.Capacitor.Plugins || {};
            var n = 0;
            window.Capacitor.Plugins.FirebaseAuthentication = { signInWithApple: function () { call('native:apple'); return Promise.resolve({ credential: { idToken: 'tok-apple-' + (++n), nonce: 'nonce-' + n } }); } };
            return 1;
        };
    }.toString() + ')(' + JSON.stringify(UID) + ');';
}
// Every link click as the browser sees it after every page listener; then stopped here so
// the headless browser never leaves for venmo.com.
const REC = "window.__hpErr = []; addEventListener('error', function (e) { window.__hpErr.push(String(e.message || e)); });"
    + "window.__clicks = []; window.addEventListener('click', function (e) { var a = e.target && e.target.closest && e.target.closest('a[href]'); if (!a) return; window.__clicks.push({ href: a.getAttribute('href'), prevented: e.defaultPrevented, inSheet: !!a.closest('.hpna-root') }); e.preventDefault(); });"
    + "window.open = function () { return null; };"
    + "window.__answers = []; (function () { var t = setInterval(function () { var N = window.HardPanNeedsAccount; if (!N || N.__wrapped) return; var p = N.prompt; N.prompt = function (o) { var r = p.call(N, o); r.then(function (v) { window.__answers.push(v); }); return r; }; N.__wrapped = true; clearInterval(t); }, 5); })();";
const LOOK = `JSON.stringify({
  prompt: !!document.querySelector('.hpna-sheet'), promptTitle: (document.querySelector('.hpna-t') || {}).innerText || '',
  sheet: (document.getElementById('hpa-sheet') || { getAttribute: function () { return null; } }).getAttribute('data-hpa-sheet'),
  sheetText: ((document.getElementById('hpa-sheet') || {}).innerText || '').replace(/\\s+/g, ' ').trim(),
  venmoHref: (document.querySelector('#vm-mount a.vm-venmo') || { getAttribute: function () { return null; } }).getAttribute('href'),
  st: window.HardPanAuth ? window.HardPanAuth.state() : null,
  calls: window.__CALLS || [], clicks: window.__clicks || [], answers: window.__answers || [], errs: window.__hpErr || [],
  ticks: (window.__WRITES || []).filter(function (w) { return /settleUp/.test(w.path); }).map(function (w) { return w.path; }) })`;
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) { } } });
async function until(j, expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 8000)) { try { if (await j.evaluate(expr)) return true; } catch (e) { } await sleep(120); } return false; }
const look = async (j) => JSON.parse(await j.evaluate(LOOK));

for (const vp of [{ width: 393, height: 852 }, { width: 375, height: 667 }]) {
    const tag = vp.width + 'x' + vp.height;
    const shot = (j, n) => SHOTS ? j.shot(path.join(SHOTS, tag + '-' + n + '.png')) : null;
    test(tag + ' Settle up signed out: Pay with Venmo -> prompt -> Sign in -> REAL sheet -> Apple links (same uid) -> pill shows the initial -> no second prompt', { timeout: 120000 }, async () => {
        const j = await openJourney({ db: db(), viewport: vp,
            preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + fakeAuth() + REC });
        journeys.push(j);
        await j.goto(fileUrl('settlement.html', 'game=XGBACK&me=11'), 3500);
        assert.ok(await until(j, "!!document.querySelector('#vm-mount a.vm-venmo') && !!window.HardPanAccountUI && !!window.HardPanAuth"), 'Settle up is up');
        const a0 = await look(j);
        assert.equal(a0.st.signedIn, false); assert.equal(a0.st.uid, UID, 'anonymous at launch');
        assert.match(a0.venmoHref, /^https:\/\/venmo\.com\/u\/bob-baker-1\?txn=pay/);

        // 1. Pay with Venmo -> the prompt (the tap is held).
        assert.ok(await j.tap('#vm-mount a.vm-venmo'));
        assert.ok(await until(j, "!!document.querySelector('.hpna-sheet')"));
        await sleep(300); await shot(j, '1-prompt');
        const a1 = await look(j);
        assert.equal(a1.promptTitle, 'Sign in to use Venmo');
        assert.deepEqual(a1.clicks, [{ href: a0.venmoHref, prevented: true, inSheet: false }]);

        // 2. Sign in -> the REAL sign-in sheet.
        assert.ok(await j.tap('.hpna-root [data-hpna-in]'));
        assert.ok(await until(j, "!!document.getElementById('hpa-sheet')"));
        await sleep(300); await shot(j, '2-real-signin-sheet');
        const a2 = await look(j);
        assert.equal(a2.prompt, false, 'the prompt made way');
        assert.equal(a2.sheet, 'signin');
        assert.match(a2.sheetText, /^Sign in ✕ So friends, chat and Venmo know it’s you\. Sign in with Apple Sign in with Google Use email instead/);
        assert.deepEqual(a2.answers, [], 'not answered before signed in');
        // On top of everything on Settle up (the Venmo card is behind the scrim).
        assert.equal(await j.evaluate("(function(){ var b = document.querySelector('#hpa-sheet [data-hpa=apple]').getBoundingClientRect(); var e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!(e && e.closest('#hpa-sheet')); })()"), true, 'the Apple button is not covered');

        // 3. Sign in with Apple (stub native sheet) -> LINKED, same uid.
        await j.evaluate('window.__installNative()');
        assert.ok(await j.tap('#hpa-sheet [data-hpa=apple]'));
        assert.ok(await until(j, "!!window.HardPanAuth && window.HardPanAuth.state().signedIn && !document.getElementById('hpa-sheet')"), 'signed in and the sheet closed');
        await sleep(300); await shot(j, '3-signed-in-settle-up');
        const a3 = await look(j);
        assert.deepEqual(a3.calls, ['native:apple', 'link:apple.com'], 'the native Apple sheet, then linkWithCredential - nothing else');
        assert.equal(a3.st.uid, UID, 'SAME uid after sign-in: rounds owned by it stay this golfer\'s');
        assert.equal(a3.st.provider, 'apple'); assert.equal(a3.st.initial, 'T');
        assert.deepEqual(a3.answers, ['signin'], 'the prompt resolved signin');
        assert.equal(a3.prompt, false);
        assert.deepEqual(a3.ticks, [], 'nothing paid or written by signing in');

        // 4. Pay with Venmo again: no second prompt, the link opens as today.
        assert.ok(await j.tap('#vm-mount a.vm-venmo')); await sleep(500);
        const a4 = await look(j);
        assert.equal(a4.prompt, false, 'no second prompt');
        assert.deepEqual(a4.clicks[1], { href: a0.venmoHref, prevented: false, inSheet: false }, 'the page let the link open');
        assert.deepEqual(a4.errs, []);

        // 5. Home: the pill is now the initial.
        await j.goto(fileUrl('home.html'), 2500);
        assert.ok(await until(j, "!!document.getElementById('hpa-spot') && document.getElementById('hpa-spot').getAttribute('data-hpa-state') === 'in'"), 'Home pill signed in');
        await shot(j, '4-home-initial');
        const spot = JSON.parse(await j.evaluate("JSON.stringify({ text: document.getElementById('hpa-spot').innerText.trim(), cls: document.getElementById('hpa-spot').className, uid: window.HardPanAuth.state().uid })"));
        assert.equal(spot.text, 'T'); assert.equal(spot.cls, 'hpa-ini'); assert.equal(spot.uid, UID);

        // 6. Back on Settle up (a fresh page load): still signed in, no prompt.
        await j.goto(fileUrl('settlement.html', 'game=XGBACK&me=11'), 3500);
        assert.ok(await until(j, "!!document.querySelector('#vm-mount a.vm-venmo') && !!window.HardPanAuth && window.HardPanAuth.state().signedIn"));
        assert.ok(await j.tap('#vm-mount a.vm-venmo')); await sleep(500);
        const a6 = await look(j);
        assert.equal(a6.prompt, false, 'no prompt on the next visit either');
        assert.equal(a6.clicks.length, 1); assert.equal(a6.clicks[0].prevented, false);
        assert.deepEqual(a6.calls, ['native:apple', 'link:apple.com'], 'no further sign-in calls');
        assert.deepEqual(a6.errs, []);
    });
}
