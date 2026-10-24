// ============================================================================
// URGENT-048 part 2 - window.HardPanAuth (hp-auth.js) over a STUB firebase.
//
// hp-auth.js, and the REAL oauth-signin.js / email-link-auth.js / account-exit.js /
// venmo-pay.js it loads on first use, run in one sandbox. Firebase auth is a stub
// that records every call, so "the anonymous user was LINKED, the uid kept" is the
// assertion, not a guess. Real Apple / Google sheets are NOT exercised here (they
// cannot be in a test or the Simulator): the native plugin is a stub that hands back
// a fresh fake token per call, the same shape @capacitor-firebase/authentication does.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = __dirname;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function storage(init) {
    const m = new Map(Object.entries(init || {}));
    return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: (k) => m.delete(k),
        key: (i) => Array.from(m.keys())[i] || null,
        get length() { return m.size; },
        _m: m
    };
}

// The stub: one anonymous user; `taken` = provider ids already on ANOTHER account (acct9).
function makeWorld(opts) {
    const o = opts || {};
    const calls = [];
    let tokenN = 0;
    const listeners = [];
    const taken = new Set(o.taken || []);
    const other = { uid: 'acct9', isAnonymous: false, email: 'golfer@example.com', displayName: 'Manny Golfer', providerData: (o.otherProviders || ['apple.com']).map((providerId) => ({ providerId })) };
    const fire = () => listeners.forEach((fn) => fn(auth.currentUser));
    function mkAnon() {
        const u = {
            uid: 'anon1', isAnonymous: true, email: null, displayName: null, providerData: [],
            linkWithCredential(c) {
                calls.push(['linkWithCredential', c.providerId, c.idToken || null]);
                if (taken.has(c.providerId)) {
                    const e = new Error('in use'); e.code = 'auth/credential-already-in-use';
                    if (o.errCredential) e.credential = { providerId: c.providerId, pendingToken: 'pend-1' };
                    return Promise.reject(e);
                }
                u.isAnonymous = false; u.providerData = [{ providerId: c.providerId }];
                u.email = c.providerId === 'password' || c.providerId === 'emailLink' ? c.email : 'me@example.com';
                u.displayName = c.providerId === 'google.com' ? 'Manny O' : null;
                setTimeout(fire, 0);
                return Promise.resolve({ user: u });
            },
            linkWithPopup(p) {
                calls.push(['linkWithPopup', p.providerId]);
                if (o.popupError) { const e = new Error('x'); e.code = o.popupError; return Promise.reject(e); }
                if (taken.has(p.providerId)) { const e = new Error('in use'); e.code = 'auth/credential-already-in-use'; return Promise.reject(e); }
                u.isAnonymous = false; u.providerData = [{ providerId: p.providerId }]; u.email = 'me@example.com'; u.displayName = 'Manny O';
                setTimeout(fire, 0);
                return Promise.resolve({ user: u });
            }
        };
        return u;
    }
    const auth = {
        currentUser: o.noUser ? null : o.startOther ? other : mkAnon(),
        onAuthStateChanged(fn) { listeners.push(fn); setTimeout(() => fn(auth.currentUser), 0); return () => {}; },
        signInWithCredential(c) {
            calls.push(['signInWithCredential', c.providerId, c.idToken || c.pendingToken || null]);
            auth.currentUser = other; setTimeout(fire, 0); return Promise.resolve({ user: other });
        },
        signInWithPopup(p) { calls.push(['signInWithPopup', p.providerId]); auth.currentUser = other; setTimeout(fire, 0); return Promise.resolve({ user: other }); },
        signInAnonymously() { calls.push(['signInAnonymously']); auth.currentUser = mkAnon(); auth.currentUser.uid = 'anon2'; setTimeout(fire, 0); return Promise.resolve({ user: auth.currentUser }); },
        signOut() { calls.push(['signOut']); auth.currentUser = null; setTimeout(fire, 0); return Promise.resolve(); },
        sendSignInLinkToEmail(email, settings) { calls.push(['sendSignInLinkToEmail', email, settings && settings.handleCodeInApp]); return Promise.resolve(); },
        isSignInWithEmailLink(s) { return /mode=signIn/.test(s) && /oobCode=/.test(s); },
        signInWithEmailLink(email) { calls.push(['signInWithEmailLink', email]); auth.currentUser = other; return Promise.resolve({ user: other }); }
    };
    function GoogleAuthProvider() { this.providerId = 'google.com'; this.addScope = () => {}; }
    GoogleAuthProvider.credential = (idToken) => ({ providerId: 'google.com', idToken });
    function OAuthProvider(id) { this.providerId = id; this.addScope = () => {}; this.credential = (x) => ({ providerId: id, idToken: x.idToken }); }
    const EmailAuthProvider = { credentialWithLink: (email, href) => ({ providerId: 'emailLink', email, href }) };
    const authFn = () => auth;
    authFn.GoogleAuthProvider = GoogleAuthProvider; authFn.OAuthProvider = OAuthProvider; authFn.EmailAuthProvider = EmailAuthProvider;
    const dbCalls = [];
    const firebase = {
        auth: authFn,
        app: () => ({ options: { apiKey: 'test-key' } }),
        database: () => { dbCalls.push('database'); return { ref: (p) => { dbCalls.push('ref ' + p); return {}; } }; }
    };
    const reloads = [];
    const head = { appendChild(s) { // the lazy loader: run the real file, then onload
        calls.push(['load', s.src]);
        const f = String(s.src).replace(/^.*\//, '');
        setTimeout(() => { try { vm.runInContext(read(f), sb, { filename: f }); s.onload && s.onload(); } catch (e) { s.onerror && s.onerror(e); } }, 0);
    } };
    const document = {
        currentScript: { src: 'https://app.test/hp-auth.js' }, readyState: 'complete', head,
        createElement: () => ({}), getElementById: () => null, addEventListener() {}, querySelectorAll: () => []
    };
    const sb = {
        console, setTimeout, clearTimeout, Promise, JSON, Object, Array, String, Number, Math, Date, Error, RegExp, Map, Set, encodeURIComponent, decodeURIComponent, URL, URLSearchParams, isFinite, isNaN,
        document, firebase, localStorage: storage(o.ls),
        location: { href: 'https://app.test/home.html', search: '', origin: 'https://app.test', hostname: 'app.test', reload: () => reloads.push(1) },
        addEventListener() {},
        authBootState: { status: 'signed-in', uid: o.noUser ? null : 'anon1' },
        authReady: Promise.resolve(o.noUser ? null : 'anon1')
    };
    if (o.native) {
        sb.Capacitor = { Plugins: { FirebaseAuthentication: {
            signInWithApple: () => { calls.push(['nativeApple']); return Promise.resolve({ credential: { idToken: 'apple-tok-' + (++tokenN), nonce: 'n' + tokenN } }); },
            signInWithGoogle: () => { calls.push(['nativeGoogle']); return Promise.resolve({ credential: { idToken: 'g-tok-' + (++tokenN), accessToken: 'a' } }); }
        } } };
    }
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(read('hp-auth.js'), sb, { filename: 'hp-auth.js' });
    return { sb, A: sb.HardPanAuth, auth, calls, dbCalls, reloads, ls: sb.localStorage };
}
const tick = () => new Promise((r) => setTimeout(r, 5));
const names = (calls) => calls.map((c) => c[0]);
const snapFor = (code, ownerUid) => ({ ['golfapp_snap_v1_' + code]: JSON.stringify({ at: 5, data: { ownerUid, players: [{ id: 101, name: 'Manny', hcp: '12.4' }] } }) });

test('state(): an anonymous launch is NOT signed in; uid kept; provider anonymous', async () => {
    const w = makeWorld();
    await w.A.ready();
    const s = w.A.state();
    assert.deepEqual({ ...s }, { signedIn: false, anonymous: true, uid: 'anon1', name: '', initial: '', provider: 'anonymous' });
    assert.equal(names(w.calls).filter((n) => n === 'load').length, 0, 'Home loads none of the sign-in flows until a tap');
});

test('Apple, iOS path (stub plugin): the anonymous user is LINKED (linkWithCredential), uid and ownerUid kept, nothing moved', async () => {
    const w = makeWorld({ native: true, ls: snapFor('TST048', 'anon1') });
    const seen = [];
    w.A.onChange((s) => seen.push(s.signedIn));
    await w.A.ready();
    const r = await w.A.signInApple();
    await tick();
    assert.equal(r.uid, 'anon1'); assert.equal(r.preserved, true);
    assert.ok(names(w.calls).includes('linkWithCredential'));
    assert.ok(!names(w.calls).includes('signInWithCredential'), 'never switched accounts');
    const s = w.A.state();
    assert.equal(s.signedIn, true); assert.equal(s.anonymous, false); assert.equal(s.uid, 'anon1'); assert.equal(s.provider, 'apple');
    assert.equal(s.initial, 'M', 'from the email when Apple gives no name');
    assert.ok(seen.includes(true), 'onChange told the page');
    assert.deepEqual(Array.from(w.A.movedRounds()), [], 'the round on this phone is still owned by the signed-in uid');
    assert.deepEqual(Array.from(w.A.moves()), []);
    assert.equal(w.sb.authBootState.uid, 'anon1');
    assert.deepEqual(w.dbCalls, [], 'no database write');
    assert.ok(w.calls.some((c) => c[0] === 'load' && /oauth-signin\.js$/.test(c[1])), 'the EXISTING oauth-signin.js did it');
});

test('Google, web popup path: linkWithPopup on the anonymous user, same uid', async () => {
    const w = makeWorld();
    const r = await w.A.signInGoogle();
    await tick();
    assert.equal(r.preserved, true); assert.equal(r.uid, 'anon1');
    assert.deepEqual(names(w.calls).filter((n) => /^(link|signIn)/.test(n)), ['linkWithPopup']);
    const s = w.A.state();
    assert.equal(s.provider, 'google'); assert.equal(s.name, 'Manny O'); assert.equal(s.initial, 'M');
});

test('identity ALREADY EXISTS (Apple, iOS): switches to that account with a FRESH Apple token; the phone notes the move, rounds listed, nothing written', async () => {
    const w = makeWorld({ native: true, taken: ['apple.com'], ls: Object.assign(snapFor('TSTA48', 'anon1'), snapFor('TSTB48', 'someoneelse')) });
    await w.A.ready();
    const r = await w.A.signInApple();
    await tick();
    assert.equal(r.preserved, false); assert.equal(r.uid, 'acct9');
    assert.match(r.note, /rounds set up on that anonymous account are not moved/);
    const link = w.calls.find((c) => c[0] === 'linkWithCredential'), sign = w.calls.find((c) => c[0] === 'signInWithCredential');
    assert.ok(link && sign); assert.notEqual(link[2], sign[2], 'the spent Apple token is never sent twice');
    assert.equal(w.calls.filter((c) => c[0] === 'nativeApple').length, 2, 'a fresh Apple request for the switch');
    assert.equal(w.A.state().uid, 'acct9'); assert.equal(w.A.state().signedIn, true);
    assert.equal(w.sb.authBootState.uid, 'acct9', 'ownRound / GPS organizer checks follow the account');
    const mv = Array.from(w.A.moves());
    assert.equal(mv.length, 1); assert.equal(mv[0].from, 'anon1'); assert.equal(mv[0].to, 'acct9');
    assert.deepEqual(JSON.parse(JSON.stringify(w.A.movedRounds().map((x) => [x.code, x.ownerUid, x.nowUid]))), [['TSTA48', 'anon1', 'acct9']]);
    assert.ok(w.ls.getItem('golfapp_snap_v1_TSTA48'), 'the round stays in this phone\'s History');
    assert.deepEqual(w.dbCalls, [], 'no database write - a re-stamp is only a proposal');
});

test('identity already exists (Google, iOS): Firebase\'s credential on the error is used for the switch', async () => {
    const w = makeWorld({ native: true, taken: ['google.com'], errCredential: true });
    const r = await w.A.signInGoogle();
    assert.equal(r.preserved, false);
    const sign = w.calls.find((c) => c[0] === 'signInWithCredential');
    assert.equal(sign[2], 'pend-1');
});

test('cancel: rejects with the existing flow\'s own sentence, nothing changed', async () => {
    const w = makeWorld({ popupError: 'auth/popup-closed-by-user' });
    await assert.rejects(w.A.signInGoogle(), (e) => e.code === 'auth/popup-closed-by-user' && /cancelled/i.test(e.message));
    assert.equal(w.A.state().signedIn, false); assert.equal(w.A.state().uid, 'anon1');
});

test('email: signInEmail sends through email-link-auth; finishEmail (pasted code) LINKS on the same uid', async () => {
    const w = makeWorld();
    const s = await w.A.signInEmail(' Me@Example.com ');
    assert.equal(s.sent, true); assert.equal(s.email, 'me@example.com');
    assert.deepEqual(w.calls.find((c) => c[0] === 'sendSignInLinkToEmail').slice(1), ['me@example.com', true]);
    await assert.rejects(w.A.finishEmail('nonsense here'), (e) => e.code === 'bad-paste' || e.code === 'not-link');
    const r = await w.A.finishEmail('ABCdef123456789XYZ');
    await tick();
    assert.equal(r.preserved, true); assert.equal(r.uid, 'anon1');
    assert.ok(names(w.calls).includes('linkWithCredential')); assert.ok(!names(w.calls).includes('signInWithEmailLink'));
    assert.equal(w.A.state().provider, 'email'); assert.equal(w.A.state().signedIn, true);
});

test('signOut goes through account-exit.js (auth.signOut, then the reload that brings a fresh anonymous session)', async () => {
    const w = makeWorld({ native: true });
    await w.A.signInApple(); await tick();
    await w.A.signOut();
    assert.ok(names(w.calls).includes('signOut')); assert.equal(w.reloads.length, 1);
    assert.ok(w.calls.some((c) => c[0] === 'load' && /account-exit\.js$/.test(c[1])));
    const w2 = makeWorld(); await w2.A.signOut({ reload: false }); assert.equal(w2.reloads.length, 0);
});

test('profile: name / hcp / tees on the phone, Venmo + Cash App through venmo-pay.js setProfile', async () => {
    const w = makeWorld({ ls: { hardpan_last_tee_papago: 'White', hardpan_last_tee_dobson: 'White', hardpan_last_tee_legacy: 'Blue' } });
    let p = w.A.profile.get();
    assert.equal(p.tees, 'White', 'most-used last tee when no default set');
    assert.equal(p.teesByCourse.legacy, 'Blue');
    await assert.rejects(w.A.profile.set({ hcp: '99' }), (e) => e.code === 'bad-hcp');
    let changes = 0; w.A.onChange(() => changes++);
    p = await w.A.profile.set({ name: '  Manny  ', hcp: '12.4', tees: 'Blue', venmo: '@manny-golf' });
    assert.equal(p.name, 'Manny'); assert.equal(p.hcp, '12.4'); assert.equal(p.tees, 'Blue'); assert.equal(p.venmo, 'manny-golf'); assert.equal(p.cashapp, null);
    assert.equal(w.ls.getItem('hardpan_my_name'), 'Manny');
    assert.equal(JSON.parse(w.ls.getItem('hardpan_my_hcp')).h, '12.4');
    assert.equal(w.ls.getItem('hardpan_default_tees'), 'Blue');
    assert.deepEqual(JSON.parse(w.ls.getItem('hardpan_pay_profile')), { venmo: 'manny-golf', cashapp: null });
    p = await w.A.profile.set({ cashapp: '$Manny22' });
    assert.equal(p.venmo, 'manny-golf', 'a field not given is kept'); assert.equal(p.cashapp, 'Manny22');
    assert.equal(w.A.state().name, 'Manny'); assert.equal(w.A.state().initial, 'M');
    assert.ok(changes >= 2);
    p = await w.A.profile.set({ hcp: '+2' }); assert.equal(p.hcp, '+2');
    p = await w.A.profile.set({ name: '', hcp: '' }); assert.equal(w.ls.getItem('hardpan_my_name'), null); assert.equal(p.hcp, '');
    assert.deepEqual(w.dbCalls, []);
});

test('front-door.js reads the profile: meName() = typed name, myHcp() = typed hcp unless a NEWER round says otherwise', () => {
    const src = read('front-door.js');
    assert.match(src, /function meName\(\) \{\s*\/\/ URGENT-048[^\n]*\n\s*var typed = String\(ls\('hardpan_my_name'\)/);
    assert.match(src, /ls\('hardpan_my_hcp'\)[^\n]*\(!best \|\| \(Number\(P\.at\) \|\| 0\) >= best\.at\)/);
    assert.match(read('simple-flow.js'), /var dflt = !want \? String\(ls\('hardpan_default_tees'\)/, 'last tee at a course still wins');
});

test('no location, no tokens, no database, no new provider in hp-auth.js', () => {
    const code = read('hp-auth.js').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /geolocation|coords|latitude|longitude|watchPosition/);
    assert.doesNotMatch(code, /\.database\(|\.ref\(|\.set\(\{[^}]*ownerUid/);
    assert.doesNotMatch(code, /signInWithPopup|signInWithCredential|linkWithCredential|signInAnonymously|new firebase\.auth\.|AuthProvider/, 'every auth call is the existing files\'');
    assert.doesNotMatch(code, /getIdToken|idToken|console\.log/);
});

test('wiring: Home, the round page and Results load hp-auth.js after auth-boot; in the HardPan shell lists', () => {
    for (const f of ['home.html', 'index.html', 'settlement.html']) {
        const h = read(f), a = h.indexOf('src="auth-boot.js"'), b = h.indexOf('src="hp-auth.js"');
        assert.ok(a > -1 && b > a, f + ' loads hp-auth.js after auth-boot.js');
    }
    const idx = read('index.html'), at = idx.indexOf('src="hp-auth.js"');
    assert.ok(idx.lastIndexOf('GPS:BEGIN', at) > idx.lastIndexOf('GPS:END', at), 'index.html: inside a GPS block');
    const sw = read('sw.js'), s = sw.indexOf("'./hp-auth.js'");
    assert.ok(s > -1 && sw.lastIndexOf('GPS:BEGIN', s) > sw.lastIndexOf('GPS:END', s), 'sw.js: in the GPS block');
    assert.equal((read('sync-mobile-web.js').match(/'hp-auth\.js'/g) || []).length, 2, 'CONSUMER_SHELL GPS block + GPS_SHELL');
});

// ---- 064-6b: Profile names the sign-in method USED, not the first one linked ----------
// Manny's one account carries Apple + Google + email. He tapped Google; Profile said
// Apple because providerOf() took the first entry of providerData.
const ALL3 = ['apple.com', 'google.com', 'password'];
const AUTH_CALLS = /^(link|signIn|signOut|sendSignIn|native)/;

test('064-6b: Google sign-in on an account with Apple + Google + email shows Google (the switch path); only the existing auth calls', async () => {
    const w = makeWorld({ native: true, taken: ['google.com'], errCredential: true, otherProviders: ALL3 });
    await w.A.ready();
    const r = await w.A.signInGoogle();
    await tick();
    assert.equal(r.uid, 'acct9'); assert.equal(r.preserved, false);
    assert.equal(w.A.state().provider, 'google', 'the method he tapped, not providerData[0] (apple.com)');
    assert.equal(w.A._test.providerOf({ uid: 'x', providerData: ALL3.map((providerId) => ({ providerId })) }), 'apple', 'control: no record falls back to the old order');
    const l = w.A.lastSignIn(); assert.equal(l.method, 'google'); assert.equal(l.switched, true);
    const rec = JSON.parse(w.ls.getItem('hardpan_signin_method'));
    assert.deepEqual(Object.keys(rec).sort(), ['at', 'method', 'switched', 'uid'], 'no token, no email stored');
    assert.deepEqual(names(w.calls).filter((n) => AUTH_CALLS.test(n)), ['nativeGoogle', 'linkWithCredential', 'signInWithCredential'], 'exactly the existing sign-in calls');
    assert.deepEqual(w.dbCalls, []);
});

test('064-6b: Apple sign-in on that same account shows Apple', async () => {
    const w = makeWorld({ native: true, taken: ['apple.com'], otherProviders: ALL3 });
    await w.A.ready();
    await w.A.signInApple(); await tick();
    assert.equal(w.A.state().uid, 'acct9');
    assert.equal(w.A.state().provider, 'apple');
    assert.equal(w.A.lastSignIn().switched, true);
});

test('064-6b: a plain link (no switch) records the method with switched = false; email shows email', async () => {
    const g = makeWorld();
    await g.A.signInGoogle(); await tick();
    assert.equal(g.A.state().provider, 'google'); assert.equal(g.A.lastSignIn().switched, false);
    const e = makeWorld();
    await e.A.signInEmail('me@example.com');
    await e.A.finishEmail('ABCdef123456789XYZ'); await tick();
    assert.equal(e.A.state().provider, 'email');
    assert.deepEqual({ ...e.A.lastSignIn() }, { method: 'email', switched: false });
});

test('064-6b: after a reload the stored method holds; a record for another uid or a removed method is ignored', async () => {
    const w = makeWorld({ native: true, taken: ['google.com'], errCredential: true, otherProviders: ALL3 });
    await w.A.signInGoogle(); await tick();
    const saved = Object.fromEntries(w.ls._m);
    const again = makeWorld({ startOther: true, otherProviders: ALL3, ls: saved });
    await again.A.ready();
    assert.equal(again.A.state().provider, 'google', 'the reloaded page still says Google');
    assert.deepEqual(names(again.calls).filter((n) => AUTH_CALLS.test(n)), [], 'reading it makes no auth call');
    const stale = makeWorld({ startOther: true, otherProviders: ALL3, ls: { hardpan_signin_method: JSON.stringify({ uid: 'someone-else', method: 'google' }) } });
    assert.equal(stale.A.state().provider, 'apple', 'not this account: old order');
    const gone = makeWorld({ startOther: true, otherProviders: ['apple.com'], ls: { hardpan_signin_method: JSON.stringify({ uid: 'acct9', method: 'google' }) } });
    assert.equal(gone.A.state().provider, 'apple', 'Google no longer on the account: old order');
    const old = makeWorld({ startOther: true, otherProviders: ALL3 });
    assert.equal(old.A.state().provider, 'apple', 'old install, nothing recorded: old order');
    assert.equal(old.A.lastSignIn(), null);
});

test('064-6b: sign out clears the stored method', async () => {
    const w = makeWorld({ native: true });
    await w.A.signInGoogle(); await tick();
    assert.ok(w.ls.getItem('hardpan_signin_method'));
    await w.A.signOut();
    assert.equal(w.ls.getItem('hardpan_signin_method'), null);
    const w2 = makeWorld({ native: true });
    await w2.A.signInApple(); await tick();
    await w2.A.signOut({ reload: false });
    assert.equal(w2.ls.getItem('hardpan_signin_method'), null);
});

test('064-6b: Profile shows "Signed in with <method>" and the switch note only after a switch', () => {
    const src = read('hp-account-ui.js');
    assert.match(src, /var via = providerLabel\(s\.provider\);/);
    assert.ok(src.includes("Signed in with ' + esc(via)"));
    assert.match(src, /switchedVia\(via\) \? '<div class="hpa-fine" data-hpa-switched="1"/);
    assert.match(src, /l && l\.switched && via \? via : ''/);
});
