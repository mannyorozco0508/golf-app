// ============================================================================
// HOME TITLE "HardPan Golf" (Manny, Oct 21): the Home title top left reads "HardPan Golf"
// and fits on ONE line next to the profile spot (the "Sign in" pill signed out, the initial
// signed in) at iPhone SE 375x667, iPhone 17 393x852 and Pro Max 430x932: no overlap, no wrap,
// no sideways scroll. Same fake Firebase auth as urgent048_signin_chrome_test.js (no network).
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

const SHOTS = path.join(process.env.HOME || '', 'Desktop', 'claude-code-reports', '053', 'home-title');
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

const FIT = "JSON.stringify((function(){ var h=document.getElementById('hs-hello'), b=document.getElementById('hpa-spot'); var hr=h.getBoundingClientRect(), br=b.getBoundingClientRect(), lh=parseFloat(getComputedStyle(h).lineHeight)||parseFloat(getComputedStyle(h).fontSize)*1.2; return { text:h.textContent.trim(), gap:Math.round(br.left-hr.right), lines:Math.round(hr.height/lh), clipped:h.scrollWidth>h.clientWidth+1, spotIn:br.right<=window.innerWidth && br.left>=0, sideScroll:document.documentElement.scrollWidth>window.innerWidth, state:b.getAttribute('data-hpa-state'), titleW:Math.round(hr.width), spotW:Math.round(br.width) }; })())";

for (const vp of [{ width: 375, height: 667, tag: 'SE-375' }, { width: 393, height: 852, tag: '17-393' }, { width: 430, height: 932, tag: 'ProMax-430' }]) {
    for (const st of ['anon', 'in']) {
        test(vp.tag + ' ' + (st === 'in' ? 'signed in (initial)' : 'signed out (Sign in pill)') + ': "HardPan Golf" fits on one line beside the profile spot', { timeout: 90000 }, async () => {
            const j = await open(st, { vp });
            const f = JSON.parse(await ev(j, FIT));
            await j.shot(path.join(SHOTS, vp.tag + '-' + (st === 'in' ? 'signed-in' : 'signed-out') + '.png'));
            assert.equal(f.text, 'HardPan Golf');
            assert.equal(f.state, st === 'in' ? 'in' : 'out');
            assert.ok(f.gap >= 8, 'title and profile spot overlap or touch: gap ' + f.gap + 'px (' + JSON.stringify(f) + ')');
            assert.equal(f.lines, 1, 'title wraps: ' + JSON.stringify(f));
            assert.equal(f.clipped, false, 'title clipped: ' + JSON.stringify(f));
            assert.equal(f.spotIn, true, 'profile spot off screen: ' + JSON.stringify(f));
            assert.equal(f.sideScroll, false, 'sideways scroll: ' + JSON.stringify(f));
            console.log(vp.tag, st, JSON.stringify(f));
        });
    }
}
