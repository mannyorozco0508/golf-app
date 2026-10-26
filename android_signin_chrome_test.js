// ============================================================================
// ANDROID: THE 2.0 SIGN-IN SHEET IS EMAIL ONLY, IN REAL CHROME (android-2.0, 024 C)
//   Manny, 2026-10-24: no Apple sign-in on Android, ever; Google comes with its own step
//   (024 D1). Home's "Sign in" pill opens the sheet; on Android it offers "Sign in with
//   email" alone, and the email step goes back to it with "‹ Back". iOS keeps Apple,
//   Google and "Use email instead", in that order.
//   The page is the real home.html with the real hp-account-ui.js and hp-auth.js. Only what
//   Chrome cannot have is faked: Capacitor saying which platform it is (no plugins that
//   matter here) and a small Firebase auth with an anonymous user. Nothing leaves the page.
//   Every step is a tap; no page function is called.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'hp-account-ui.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const DB = () => ({ events: {}, global_courses: {}, trips: {}, organizers: {}, tournaments: {} });
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// The platform, before any page script. No App / Geolocation plugin: Home falls back as a
// phone with location not given, which is all this check needs.
function platform(p) {
    return 'window.Capacitor = { getPlatform: function () { return ' + JSON.stringify(p) + '; }, isNativePlatform: function () { return true; }, Plugins: {} };';
}
// An anonymous Firebase user (every phone at launch), and a log of every auth call.
function fakeAuth() {
    return '(' + function () {
        var CALLS = window.__CALLS = [];
        var U = { uid: 'anon-android-1', isAnonymous: true, email: null, displayName: null, providerData: [] }, L = [];
        var A = {
            get currentUser() { return U; },
            onAuthStateChanged: function (cb) { L.push(cb); setTimeout(function () { cb(U); }, 0); return function () {}; },
            signInAnonymously: function () { CALLS.push('anon'); return Promise.resolve({ user: U }); },
            sendSignInLinkToEmail: function () { CALLS.push('sendLink'); return Promise.resolve(); },
            isSignInWithEmailLink: function () { return false; },
            signInWithPopup: function () { CALLS.push('popup'); return Promise.reject(new Error('no popup')); },
            signOut: function () { CALLS.push('signOut'); return Promise.resolve(); }
        };
        var auth = function () { return A; };
        auth.GoogleAuthProvider = function () { this.providerId = 'google.com'; this.addScope = function () {}; };
        auth.OAuthProvider = function (id) { this.providerId = id; this.addScope = function () {}; };
        auth.EmailAuthProvider = { credentialWithLink: function () { return { providerId: 'emailLink' }; } };
        window.firebase.auth = auth;
        document.addEventListener('DOMContentLoaded', function () {
            if (window.HardPanAuth || document.querySelector('script[src*="hp-auth.js"]')) return;
            var s = document.createElement('script'); s.src = 'hp-auth.js'; document.head.appendChild(s);
        });
    }.toString() + ')();';
}

const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) { } } });
const ev = (j, x) => j.evaluate(x);
async function until(j, expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 8000)) { try { if (await ev(j, expr)) return true; } catch (e) { } await sleep(120); } return false; }
async function home(p) {
    const j = await openJourney({ db: DB(), viewport: { width: 393, height: 852 },
        preScript: platform(p) + 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + fakeAuth() });
    journeys.push(j);
    await j.goto(fileUrl('home.html'), 2200);
    assert.ok(await until(j, "!!window.HardPanAuth && !!document.getElementById('hpa-spot') && document.getElementById('hpa-spot').getAttribute('data-hpa-state') === 'out'"), 'Home shows the Sign in pill');
    return j;
}
// What the sheet offers: each [data-hpa] button's action and its rendered words.
const OFFER = "JSON.stringify(Array.prototype.map.call(document.querySelectorAll('#hpa-sheet button[data-hpa]'), function (b) { return [b.getAttribute('data-hpa'), b.innerText.trim()]; }))";
const TEXT = "(document.getElementById('hpa-sheet') || {}).innerText || ''";

test('ANDROID: Sign in -> the sheet offers email alone; its email step goes back with "‹ Back"', { timeout: 90000 }, async () => {
    const j = await home('android');
    assert.ok(await j.tap('#hpa-spot'));
    assert.ok(await until(j, "!!document.getElementById('hpa-sheet')"), 'the sheet opens');
    const offer = JSON.parse(await ev(j, OFFER));
    assert.deepEqual(offer, [['close', '✕'], ['email', 'Sign in with email']], 'close, and one way in: email');
    const text = await ev(j, TEXT);
    assert.match(text, /So friends, chat and Venmo know it’s you\./, 'the why is still there');
    assert.ok(!/Apple|Google/.test(text), 'no Apple, no Google on Android: ' + text);
    assert.ok(await j.tap('#hpa-sheet [data-hpa=email]'));
    assert.ok(await until(j, "!!document.querySelector('#hpa-sheet [data-hpa-email]')"), 'the email step');
    const back = await ev(j, "(document.querySelector('#hpa-sheet [data-hpa=pick]') || {}).innerText || ''");
    assert.equal(back.trim(), '‹ Back');
    assert.ok(await j.tap('#hpa-sheet [data-hpa=pick]'));
    assert.ok(await until(j, "!document.querySelector('#hpa-sheet [data-hpa-email]') && !!document.querySelector('#hpa-sheet [data-hpa=email]')"), 'back on the one-button sheet');
    assert.deepEqual(JSON.parse(await ev(j, 'JSON.stringify(window.__CALLS)')).filter((c) => c !== 'anon'), [], 'opening, stepping and going back called nothing');
});

test('iOS UNCHANGED: Apple, Google, then "Use email instead"; the email step offers "Other ways to sign in"', { timeout: 90000 }, async () => {
    const j = await home('ios');
    assert.ok(await j.tap('#hpa-spot'));
    assert.ok(await until(j, "!!document.getElementById('hpa-sheet')"));
    const offer = JSON.parse(await ev(j, OFFER));
    assert.deepEqual(offer.map((x) => x[0]), ['close', 'apple', 'google', 'email']);
    assert.deepEqual(offer.slice(1).map((x) => x[1]), ['Sign in with Apple', 'Sign in with Google', 'Use email instead']);
    assert.ok(await j.tap('#hpa-sheet [data-hpa=email]'));
    assert.ok(await until(j, "!!document.querySelector('#hpa-sheet [data-hpa-email]')"));
    assert.equal((await ev(j, "(document.querySelector('#hpa-sheet [data-hpa=pick]') || {}).innerText || ''")).trim(), '‹ Other ways to sign in');
});
