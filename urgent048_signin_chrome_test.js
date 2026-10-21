// ============================================================================
// URGENT-048 part 1 - SIGN-IN THAT PEOPLE CAN FIND, IN REAL CHROME (393x852 and 375x667).
// Home's profile spot (Sign in pill / the initial), the sign-in sheet and the profile sheet,
// built as the approved preview (claude-code-reports/048/preview/signin-compare.png).
//
// THE REAL CHAIN RUNS: hp-account-ui.js -> hp-auth.js (048 part 2) -> the existing
// oauth-signin.js / email-link-auth.js / account-exit.js / venmo-pay.js, each loaded on first
// use. Only what Chrome cannot have is faked, BELOW those files: the Firebase auth object
// (a user with linkWithCredential / signInWithCredential) and the Capacitor
// FirebaseAuthentication plugin (the native Apple / Google sheet handing back a token).
// No network, no real account. Every test reaches the screen the way a golfer does.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'simple-flow.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
// int-048: home.html now loads hp-auth.js itself; 'no HardPanAuth at all' keeps it off the page.
const { noAuthScript } = require('./tools/lib/hp-auth-stub.js');

const SHOTS = path.join(process.env.HOME || '', 'Desktop', 'claude-code-reports', '048', 'chrome');
try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) { }
const DB = () => ({ events: {}, global_courses: {}, trips: {}, organizers: {}, tournaments: {} });
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// The fake Firebase auth + native plugin. `start`: 'anon' | 'in' | null (no user yet).
// The user survives a reload (sessionStorage), so Sign out's reload is real too.
function fakeAuth(start, seed) {
    return '(' + function (start, seed) {
        var CALLS = window.__CALLS = JSON.parse(sessionStorage.getItem('fa_calls') || '[]');
        function call(x) { CALLS.push(x); try { sessionStorage.setItem('fa_calls', JSON.stringify(CALLS)); } catch (e) { } }
        if (!sessionStorage.getItem('fa_seeded')) {
            sessionStorage.setItem('fa_seeded', '1');
            Object.keys(seed || {}).forEach(function (k) { localStorage.setItem(k, typeof seed[k] === 'string' ? seed[k] : JSON.stringify(seed[k])); });
            var u0 = start === 'anon' ? { uid: 'anon-1', isAnonymous: true, email: null, displayName: null, providerData: [] }
                : start === 'in' ? { uid: 'acct-1', isAnonymous: false, email: 'm@example.com', displayName: 'Manny Orozco', providerData: [{ providerId: 'apple.com' }] } : null;
            sessionStorage.setItem('fa_user', JSON.stringify(u0));
        }
        var U = null, L = [];
        function save() { sessionStorage.setItem('fa_user', JSON.stringify(U ? { uid: U.uid, isAnonymous: U.isAnonymous, email: U.email, displayName: U.displayName, providerData: U.providerData } : null)); }
        function mk(o) {
            if (!o) return null;
            var u = Object.assign({}, o);
            u.linkWithCredential = function (c) {
                call('link:' + c.providerId);
                if (window.__TAKEN) { var e = new Error('taken'); e.code = 'auth/credential-already-in-use'; return Promise.reject(e); }
                u.isAnonymous = false; u.providerData = [{ providerId: c.providerId }]; u.displayName = u.displayName || 'Manny Orozco';
                save(); setTimeout(function () { L.slice().forEach(function (cb) { cb(U); }); }, 0);
                return Promise.resolve({ user: u });
            };
            return u;
        }
        U = mk(JSON.parse(sessionStorage.getItem('fa_user') || 'null'));
        function emit() { save(); L.slice().forEach(function (cb) { try { cb(U); } catch (e) { } }); }
        var A = {
            get currentUser() { return U; },
            onAuthStateChanged: function (cb) { L.push(cb); setTimeout(function () { cb(U); }, 0); return function () { L = L.filter(function (x) { return x !== cb; }); }; },
            signInAnonymously: function () { call('anon'); U = mk({ uid: 'anon-' + (Date.now() % 100000), isAnonymous: true, email: null, displayName: null, providerData: [] }); emit(); return Promise.resolve({ user: U }); },
            signInWithCredential: function (c) { call('signInWith:' + c.providerId); U = mk({ uid: 'existing-acct', isAnonymous: false, email: null, displayName: 'Manny', providerData: [{ providerId: c.providerId }] }); emit(); return Promise.resolve({ user: U }); },
            signInWithPopup: function () { return Promise.reject(Object.assign(new Error('no popup'), { code: 'auth/popup-blocked' })); },
            sendSignInLinkToEmail: function (em) { call('sendLink'); return Promise.resolve(); },
            isSignInWithEmailLink: function () { return false; },
            signOut: function () { call('auth.signOut'); U = null; emit(); return Promise.resolve(); }
        };
        var auth = function () { return A; };
        auth.GoogleAuthProvider = function () { this.providerId = 'google.com'; this.addScope = function () { }; };
        auth.GoogleAuthProvider.credential = function (id) { return { providerId: 'google.com', idToken: id }; };
        auth.OAuthProvider = function (id) { this.providerId = id; this.addScope = function () { }; this.credential = function (o) { return { providerId: id, idToken: o.idToken, rawNonce: o.rawNonce }; }; };
        auth.EmailAuthProvider = { credentialWithLink: function () { return { providerId: 'emailLink' }; } };
        window.firebase.auth = auth;
        // The native Apple / Google sheet (Capacitor FirebaseAuthentication). Installed by the test
        // only when it taps a provider, so nothing else on Home sees a Capacitor object.
        window.__installNative = function () {
            window.Capacitor = window.Capacitor || {};
            window.Capacitor.Plugins = window.Capacitor.Plugins || {};
            var n = 0;
            function sheet(which) { return function () { call('native:' + which); if (window.__CANCEL) return Promise.reject(Object.assign(new Error('cancel'), { code: 'auth/user-cancelled' })); return Promise.resolve({ credential: { idToken: 'tok-' + which + '-' + (++n), nonce: 'nonce-' + n } }); }; }
            window.Capacitor.Plugins.FirebaseAuthentication = { signInWithApple: sheet('apple'), signInWithGoogle: sheet('google') };
        };
        // hp-auth.js (048 part 2) is tagged into the pages by its own branch; until that merge,
        // load it here exactly once, after the page.
        document.addEventListener('DOMContentLoaded', function () {
            if (window.HardPanAuth || document.querySelector('script[src*="hp-auth.js"]')) return;
            var s = document.createElement('script'); s.src = 'hp-auth.js'; document.head.appendChild(s);
        });
    }.toString() + ')(' + JSON.stringify(start) + ',' + JSON.stringify(seed || {}) + ');';
}

const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) { } } });
async function open(start, opts) {
    const o = opts || {};
    const j = await openJourney({ db: DB(), viewport: o.vp || { width: 393, height: 852 },
        preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + (o.noAuth ? noAuthScript() : fakeAuth(start, o.seed)) });
    journeys.push(j);
    await j.goto(fileUrl('home.html'), 2200);
    if (!o.noAuth) await until(j, "!!window.HardPanAuth && document.getElementById('hpa-spot').getAttribute('data-hpa-state') === " + JSON.stringify(start === 'in' ? 'in' : 'out'));
    return j;
}
const ev = (j, x) => j.evaluate(x);
async function until(j, expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 8000)) { try { if (await ev(j, expr)) return true; } catch (e) { } await sleep(120); } return false; }
const SPOT = "JSON.stringify((function(){ var b=document.getElementById('hpa-spot'), h=document.getElementById('hs-hello'); if(!b) return null; var r=b.getBoundingClientRect(), hr=h.getBoundingClientRect(), cs=getComputedStyle(b); return { state:b.getAttribute('data-hpa-state'), cls:b.className, text:b.innerText.trim(), right:Math.round(window.innerWidth-r.right), midDy:Math.round(Math.abs((r.top+r.bottom)/2-(hr.top+hr.bottom)/2)), w:Math.round(r.width), h:Math.round(r.height), bg:cs.backgroundColor, radius:cs.borderRadius }; })())";
const SHEET = "JSON.stringify((function(){ var s=document.getElementById('hpa-sheet'); if(!s) return null; var r=s.getBoundingClientRect(); return { kind:s.getAttribute('data-hpa-sheet'), text:s.innerText.replace(/\\s+/g,' ').trim(), top:Math.round(r.top), bottom:Math.round(r.bottom), vh:window.innerHeight, order:Array.prototype.map.call(s.querySelectorAll('[data-hpa=apple],[data-hpa=google],[data-hpa=email]'), function(b){ return b.getAttribute('data-hpa'); }), appleBg: (s.querySelector('[data-hpa=apple]')? getComputedStyle(s.querySelector('[data-hpa=apple]')).backgroundColor : null), scroll: document.documentElement.scrollWidth > window.innerWidth }; })())";
const CALLS = "JSON.stringify(window.__CALLS || [])";
const MSG = "(document.querySelector('#hpa-sheet .hpa-msg')||{}).textContent || ''";
const WRITES = "JSON.stringify((window.__WRITES || []).map(function (w) { return w.path; }))";
const SIGNED_OUT_ROUND = { at: Date.now(), data: { ownerUid: 'anon-1', courseName: 'Test 048 Links', players: [{ id: 101, name: 'Test A' }] }, meta: { group: null } };

for (const vp of [{ width: 393, height: 852, tag: '393' }, { width: 375, height: 667, tag: '375' }]) {
    test(vp.tag + ': anonymous (every phone at launch) - "Sign in" pill top right; the sheet: Apple, Google, email, the why, the card', { timeout: 90000 }, async () => {
        const j = await open('anon', { vp });
        const s = JSON.parse(await ev(j, SPOT));
        assert.equal(s.state, 'out'); assert.equal(s.text, 'Sign in'); assert.equal(s.cls, 'hpa-pill');
        assert.ok(s.right >= 14 && s.right <= 30, 'right edge in the gutter: ' + s.right);
        assert.ok(s.midDy <= 4, 'on the HardPan line: ' + s.midDy);
        assert.equal(s.radius, '999px'); assert.equal(s.h, 36);
        await j.shot(path.join(SHOTS, vp.tag + '-1-home-signed-out.png'));
        assert.ok(await j.tap('#hpa-spot'));
        assert.ok(await until(j, "!!document.getElementById('hpa-sheet')"));
        const sh = JSON.parse(await ev(j, SHEET));
        assert.equal(sh.kind, 'signin');
        assert.deepEqual(sh.order, ['apple', 'google', 'email'], 'Apple first, then Google, then email');
        assert.equal(sh.appleBg, 'rgb(0, 0, 0)', "Apple's black button");
        assert.match(sh.text, /^Sign in ✕ So friends, chat and Venmo know it’s you\. Sign in with Apple Sign in with Google Use email instead/);
        assert.match(sh.text, /Golf GPS works without it\. So do scoring and bets on this phone\. Rounds already on this phone come with you\./);
        assert.match(sh.text, /Privacy · Terms$/);
        assert.equal(sh.bottom, sh.vh, 'a bottom sheet'); assert.ok(sh.top > 0, 'fits: ' + sh.top);
        assert.equal(sh.scroll, false, 'no sideways scroll');
        await j.shot(path.join(SHOTS, vp.tag + '-2-signin-sheet.png'));
        assert.ok(await j.tap('#hpa-sheet [data-hpa=close]'));
        assert.equal(await ev(j, "!!document.getElementById('hpa-sheet')"), false);
        assert.deepEqual(JSON.parse(await ev(j, CALLS)), [], 'opening and closing called nothing');
        assert.deepEqual(JSON.parse(await ev(j, WRITES)), [], 'the UI wrote nothing');
    });
}

test('Sign in with Apple LINKS the anonymous user: same uid, the round played signed out is still this account\'s, Home shows "M"', { timeout: 90000 }, async () => {
    const j = await open('anon', { seed: { golfapp_snap_v1_T048A1: SIGNED_OUT_ROUND } });
    await ev(j, 'window.__installNative()');
    await j.tap('#hpa-spot'); await until(j, "!!document.getElementById('hpa-sheet')");
    await j.tap('#hpa-sheet [data-hpa=apple]');
    assert.ok(await until(j, "!document.getElementById('hpa-sheet')"), 'closed after sign-in: ' + await ev(j, MSG));
    assert.deepEqual(JSON.parse(await ev(j, CALLS)), ['native:apple', 'link:apple.com'], 'the native Apple sheet, then linkWithCredential - no sign-in-as-someone-else');
    const st = JSON.parse(await ev(j, 'JSON.stringify(window.HardPanAuth.state())'));
    assert.equal(st.uid, 'anon-1', 'SAME uid after sign-in'); assert.equal(st.signedIn, true); assert.equal(st.provider, 'apple');
    assert.equal(await ev(j, "JSON.parse(localStorage.getItem('golfapp_snap_v1_T048A1')).data.ownerUid"), 'anon-1', 'the round owner is the signed-in account');
    assert.equal(await ev(j, 'window.HardPanAuth.movedRounds().length'), 0, 'nothing left behind');
    const s = JSON.parse(await ev(j, SPOT));
    assert.equal(s.state, 'in'); assert.equal(s.text, 'M'); assert.equal(s.cls, 'hpa-ini');
    assert.equal(s.bg, 'rgb(15, 76, 58)', 'green circle'); assert.equal(s.w, 40); assert.equal(s.h, 40);
    await j.shot(path.join(SHOTS, '393-3-home-signed-in.png'));
});

test('the switch case: that Apple ID is already an account -> the phone signs in AS it; the signed-out round is listed as left on the old uid, and the profile says so', { timeout: 90000 }, async () => {
    const j = await open('anon', { seed: { golfapp_snap_v1_T048A2: SIGNED_OUT_ROUND } });
    await ev(j, 'window.__installNative(); window.__TAKEN = true;');
    await j.tap('#hpa-spot'); await until(j, "!!document.getElementById('hpa-sheet')");
    await j.tap('#hpa-sheet [data-hpa=apple]');
    assert.ok(await until(j, "!document.getElementById('hpa-sheet')"), 'closed: ' + await ev(j, MSG));
    assert.deepEqual(JSON.parse(await ev(j, CALLS)), ['native:apple', 'link:apple.com', 'native:apple', 'signInWith:apple.com'],
        'link refused (credential-already-in-use) -> a FRESH Apple token (never the spent one) -> sign in as that account');
    assert.equal(await ev(j, 'window.HardPanAuth.state().uid'), 'existing-acct');
    assert.deepEqual(JSON.parse(await ev(j, 'JSON.stringify(window.HardPanAuth.movedRounds())')), [{ code: 'T048A2', ownerUid: 'anon-1', nowUid: 'existing-acct' }]);
    await j.tap('#hpa-spot');
    assert.ok(await until(j, "!!document.querySelector('#hpa-sheet [data-hpa-moved]')"), 'the profile notes it');
    assert.match(await ev(j, "document.getElementById('hpa-sheet').innerText"), /still show in History and keep scoring/);
    await j.shot(path.join(SHOTS, '393-7-profile-after-switch.png'));
    assert.deepEqual(JSON.parse(await ev(j, WRITES)), [], 'nothing written to the database');
});

test('Google cancelled: the existing sentence shows, the sheet stays, still "Sign in"', { timeout: 90000 }, async () => {
    const j = await open('anon');
    await ev(j, 'window.__installNative(); window.__CANCEL = true;');
    await j.tap('#hpa-spot'); await until(j, "!!document.getElementById('hpa-sheet')");
    await j.tap('#hpa-sheet [data-hpa=google]');
    assert.ok(await until(j, "/Sign-in cancelled\\. Nothing changed\\./.test(" + MSG + ")"), 'oauth-signin.js NOTE_CANCELLED: ' + await ev(j, MSG));
    assert.equal(await ev(j, "document.querySelector('#hpa-spot').getAttribute('data-hpa-state')"), 'out');
    assert.equal(await ev(j, 'window.HardPanAuth.state().uid'), 'anon-1');
});

test('Use email instead: send the link (email-link-auth.js), then the paste step', { timeout: 90000 }, async () => {
    const j = await open('anon');
    await j.tap('#hpa-spot'); await until(j, "!!document.getElementById('hpa-sheet')");
    await j.tap('#hpa-sheet [data-hpa=email]');
    assert.ok(await until(j, "!!document.getElementById('hpa-email-in')"));
    await j.tap('#hpa-sheet [data-hpa=emailsend]');
    assert.match(await ev(j, MSG), /Type your email/);
    await j.setValue('#hpa-email-in', 'test048@example.com');
    await j.shot(path.join(SHOTS, '393-2b-email.png'));
    await j.tap('#hpa-sheet [data-hpa=emailsend]');
    assert.ok(await until(j, "!!document.getElementById('hpa-email-paste')"), 'the paste step: ' + await ev(j, MSG));
    assert.ok(JSON.parse(await ev(j, CALLS)).includes('sendLink'), 'auth.sendSignInLinkToEmail through email-link-auth.js');
    assert.match(await ev(j, "document.getElementById('hpa-sheet').innerText"), /test048@example\.com|link|Link/);
    await j.shot(path.join(SHOTS, '393-2c-email-sent.png'));
    await j.setValue('#hpa-email-paste', 'not a link');
    await j.tap('#hpa-sheet [data-hpa=emailfinish]');
    assert.ok(await until(j, "(" + MSG + ").length > 10 && !/Signing in/.test(" + MSG + ")"), 'a bad paste says so');
    assert.equal(await ev(j, "document.querySelector('#hpa-spot').getAttribute('data-hpa-state')"), 'out');
});

test('signed in - the profile sheet: name, handicap, default tees, Venmo / Cash App, Sign out; edits save on the phone', { timeout: 90000 }, async () => {
    const j = await open('in', { seed: { hardpan_my_name: 'Manny', hardpan_my_hcp: { h: '12.4', at: Date.now() }, hardpan_default_tees: 'White', hardpan_pay_profile: { venmo: 'manny-golf' } } });
    await j.shot(path.join(SHOTS, '393-3b-home-signed-in.png'));
    await j.tap('#hpa-spot');
    assert.ok(await until(j, "/Sign out/.test((document.getElementById('hpa-sheet')||{}).innerText||'')"));
    const sh = JSON.parse(await ev(j, SHEET));
    assert.equal(sh.kind, 'profile');
    assert.match(sh.text, /^Profile ✕ M Manny Signed in with Apple YOU Name Manny › Handicap 12\.4 › Default tees White › GET PAID Venmo @manny-golf › Cash App Add \$cashtag › Sign out Signing out keeps this phone’s rounds and GPS\.$/);
    assert.ok(sh.top > 0, 'fits on screen: ' + sh.top);
    await j.shot(path.join(SHOTS, '393-4-profile-sheet.png'));
    // Venmo -> venmo-pay.js setProfile (hardpan_pay_profile), the row shows it.
    await j.tap('#hpa-sheet [data-hpa-field=venmo]');
    assert.ok(await until(j, "!!document.querySelector('#hpa-sheet .hpa-edit input')"));
    await j.setValue('#hpa-sheet .hpa-edit input', '@manny-new');
    await j.shot(path.join(SHOTS, '393-5-profile-edit-venmo.png'));
    await j.tap('#hpa-sheet [data-hpa=save]');
    assert.ok(await until(j, "/@manny-new/.test(document.getElementById('hpa-sheet').innerText)"));
    assert.equal(await ev(j, "JSON.parse(localStorage.getItem('hardpan_pay_profile')).venmo"), 'manny-new');
    // Tees by chip.
    await j.tap('#hpa-sheet [data-hpa-field=tees]');
    await until(j, "!!document.querySelector('#hpa-sheet .hpa-chip')");
    await j.tap('#hpa-sheet .hpa-chip', /Blue/);
    await j.tap('#hpa-sheet [data-hpa=save]');
    assert.ok(await until(j, "/Default tees Blue/.test(document.getElementById('hpa-sheet').innerText.replace(/\\s+/g,' '))"));
    assert.equal(await ev(j, "localStorage.getItem('hardpan_default_tees')"), 'Blue');
    // A bad handicap: hp-auth.js refuses it (bad-hcp) and its sentence shows; nothing saved.
    await j.tap('#hpa-sheet [data-hpa-field=hcp]');
    await until(j, "!!document.querySelector('#hpa-sheet .hpa-edit input')");
    await j.setValue('#hpa-sheet .hpa-edit input', 'abc');
    await j.tap('#hpa-sheet [data-hpa=save]');
    assert.ok(await until(j, "/0 to 54/.test(" + MSG + ")"), 'bad-hcp: ' + await ev(j, MSG));
    assert.equal(await ev(j, "JSON.parse(localStorage.getItem('hardpan_my_hcp')).h"), '12.4');
    await j.tap('#hpa-sheet [data-hpa=back]');
    // Sign out -> account-exit.js signOut -> reload -> a fresh anonymous phone: the pill again.
    await until(j, "!!document.querySelector('#hpa-sheet [data-hpa=signout]')");
    await j.tap('#hpa-sheet [data-hpa=signout]', null, { settleMs: 2500 });
    assert.ok(await until(j, "!!window.HardPanAuth && window.HardPanAuth.state().anonymous && document.getElementById('hpa-spot').getAttribute('data-hpa-state') === 'out'", 10000), 'signed out: the pill again');
    const calls = JSON.parse(await ev(j, CALLS));
    assert.ok(calls.includes('auth.signOut') && calls.includes('anon'), 'signed out, then auth-boot made a new anonymous user: ' + calls);
    assert.equal(await ev(j, "JSON.parse(localStorage.getItem('hardpan_pay_profile')).venmo"), 'manny-new', 'the phone keeps its profile');
    await j.shot(path.join(SHOTS, '393-6-after-sign-out.png'));
    assert.deepEqual(JSON.parse(await ev(j, WRITES)), [], 'the UI wrote nothing to the database');
});

test('the hooks for the needs-an-account prompt: HardPanAccountUI.openSignIn / openProfile', { timeout: 60000 }, async () => {
    const j = await open('anon');
    assert.equal(await ev(j, "typeof window.HardPanAccountUI.openSignIn + typeof window.HardPanAccountUI.openProfile"), 'functionfunction');
    await ev(j, 'window.HardPanAccountUI.openSignIn()');
    assert.equal(await ev(j, "document.getElementById('hpa-sheet').getAttribute('data-hpa-sheet')"), 'signin');
    await j.tap('#hpa-scrim');
    assert.equal(await ev(j, "!!document.getElementById('hpa-sheet')"), false, 'a tap outside closes it');
});

test('nothing on Home needs sign-in: with no HardPanAuth at all the pill still shows, and the GPS door still opens', { timeout: 90000 }, async () => {
    const j = await open(null, { noAuth: true });
    await sleep(500);
    const s = JSON.parse(await ev(j, SPOT));
    assert.equal(s.state, 'out'); assert.equal(s.text, 'Sign in');
    await j.tap('#hpa-spot'); await until(j, "!!document.getElementById('hpa-sheet')");
    await j.tap('#hpa-sheet [data-hpa=apple]');
    assert.match(await ev(j, MSG), /isn’t ready yet/);
    await j.tap('#hpa-sheet [data-hpa=close]');
    await j.tap('[data-hp-act="sgpsdoor"]', null, { settleMs: 1500 });
    const where = JSON.parse(await ev(j, "JSON.stringify({ page: location.pathname.split('/').pop(), sheet: !!document.getElementById('hpa-sheet'), home: !!document.getElementById('v-simple') && getComputedStyle(document.getElementById('v-simple')).display !== 'none' })"));
    assert.equal(where.sheet, false, 'the GPS door never asks for sign-in');
    assert.ok(where.page !== 'home.html' || !where.home, 'the GPS door went on: ' + JSON.stringify(where));
});
