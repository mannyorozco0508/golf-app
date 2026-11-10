// ============================================================================
// ORGANIZER SIGN-IN WITH APPLE AND GOOGLE ON tournament.html, IN REAL CHROME
// (P1-b, 2026-11-10)
//
// The page an organizer opens (tournament.html?tourney=CODE, served over http
// under the hostname tournaments.rattlegolf.com - Chrome's --host-resolver-rules
// sends that name to a local static server, so the page believes it is on its
// production host), the REAL auth and database SDKs the site ships, and the
// REAL Firebase Auth and Realtime Database emulators. The event record sits in
// the database emulator with the organizer's uid as ownerUid; the organizer's
// Apple / Google / email account sits in the auth emulator. Nothing in
// tournament.html or oauth-signin.js is stubbed and NO PAGE FUNCTION IS CALLED:
// every test arrives cold, taps the buttons a golfer sees (real CDP mouse
// events), drives the emulator's own sign-in window with real taps, and reads
// what the page then renders, through innerText.
//
// THE ONE PRE-SCRIPT points initializeApp at a demo project (the database
// emulator and a fake key), calls auth().useEmulator on the first auth
// instance, and records the authDomain the PAGE chose. It is the
// web_signin_redirect_chrome_test.js pre-script with the database pointed at
// an emulator instead of a closed port. THE NATIVE TESTS (5, 6) add a stand-in
// for window.Capacitor.Plugins.FirebaseAuthentication - the boundary
// oauth_native_test.js mocks - which hands back what the Apple / Google SDK
// would: an idToken. The emulator accepts an unsigned JSON id_token, so the
// real SDK's signInWithCredential reaches the real emulator.
//
// WHAT IT PROVES
//   1. signed out, cold: the box shows Continue with Apple, Continue with Google,
//      then Use email instead (admin.html's order and wording); email row hidden.
//   2. Google popup -> signed in as the owner, Setup tab shown, box gone.
//   3. Apple popup -> the same, for an Apple-owned event.
//   4. AN EMAIL + PASSWORD ORGANIZER TAPS GOOGLE WITH THE SAME EMAIL: in the
//      emulator (a verified Google email) Firebase links it to the SAME uid, so
//      the event is still theirs. Emulator behaviour - see UNPROVEN.
//   5. ACCOUNT EXISTS: the same, with an UNVERIFIED provider email, which is
//      where Firebase refuses with auth/account-exists-with-different-
//      credential. The box says to sign in with email and password, opens the
//      email row with the address filled in, signs nobody in and makes no
//      account; the password sign-in then opens the gate AND links Google to
//      that account (same uid, google.com now on it).
//   6. INSIDE THE APP (Capacitor stand-in): Google and Apple go through the
//      native seam with skipNativeAuth, no popup window opens, the gate opens.
//   7. ALREADY SIGNED IN on admin.html on the same origin (the app's case: one
//      origin, one persisted user): tournament.html opens the gate with no tap.
//   8. A REDIRECT HOST (oauth-signin.js REDIRECT_HOSTS): authDomain is the
//      page's own host and Google goes by REDIRECT - the page leaves and comes
//      back signed in, gate open. 9: leaving the Google page without signing in
//      comes back "not finished". Measured on hardpangolf.com, the listed host
//      Chrome will load over plain http: golf-app-5a5.pages.dev is .dev, which
//      is HSTS-preloaded, so Chrome refuses it here (ERR_SSL_PROTOCOL_ERROR).
//   4 ALSO RECORDS: the emulator REMOVES the unverified password when a
//      verified Google email takes the account over (same uid).
//
// UNPROVEN HERE: real Google and Apple (the emulator replaces them); which
// branch PRODUCTION Firebase takes for test 4 vs 5 - Google is authoritative
// for gmail.com addresses, other providers/addresses can raise account-exists
// - a real device tap in the iOS app; Safari; the /__/auth/ proxy (with the
// emulator the SDK never uses authDomain for its handler).
//
// SCREENSHOTS: P1B_SHOTS=<dir> writes P1b-signin-box.png (test 1) and
// P1b-account-exists.png (test 5), 390x844 @2x. Unset, nothing is written.
//
// BASELINE (final run of this file, 2026-11-10):
//   on p1-signin (tournament.html sha256 cedb8327...), all 9 tests: 9 PASS / 0 FAIL
//   against p1-base 48121bea (tournament.html sha256 5f6c2a64...), all 9 tests: 1 PASS / 8 FAIL
//   (the one pass is 7, already-signed-in: persistence was already shared.)
// ============================================================================
'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, execFileSync } = require('child_process');
const registry = require('./tools/lib/browser-registry.js');

const REPO = __dirname;
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROJECT = 'demo-hardpan-p1b';
const BASE_PORT = 9400 + Math.floor(Math.random() * 280) * 2;
const AUTH_PORT = BASE_PORT + 1, DB_PORT = BASE_PORT + 2;
const EMU = 'http://127.0.0.1:' + AUTH_PORT;
const DB = 'http://127.0.0.1:' + DB_PORT;
const SHOTS = process.env.P1B_SHOTS || '';

function has(cmd, args) { try { execFileSync(cmd, args, { stdio: 'ignore' }); return true; } catch (e) { return false; } }
const CAN = fs.existsSync(CHROME) && has('firebase', ['--version']) && has('java', ['-version']);

// ---- a static server for the repo, forwarding the emulator's auth paths -----
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css' };
const EMU_PREFIXES = ['/emulator/', '/identitytoolkit.googleapis.com/', '/securetoken.googleapis.com/', '/www.googleapis.com/'];
function forward(req, res) {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
        try {
            const headers = Object.assign({}, req.headers); delete headers.host; delete headers.connection;
            const r = await fetch(EMU + req.url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks), redirect: 'manual' });
            const out = {}; r.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) out[k] = v; });
            res.writeHead(r.status, out);
            res.end(Buffer.from(await r.arrayBuffer()));
        } catch (e) { res.writeHead(502); res.end(String(e)); }
    });
}
function serve() {
    const srv = http.createServer((req, res) => {
        if (EMU_PREFIXES.some((x) => req.url.startsWith(x))) return forward(req, res);
        let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (p === '/') p = '/tournament.html';
        const f = path.join(REPO, path.normalize(p));
        if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        fs.createReadStream(f).pipe(res);
    });
    return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

// ---- the emulators ----------------------------------------------------------
let emuProc = null;
async function startEmu() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p1b-emu-'));
    // The DEMO project's rules, open: this suite is about who the page lets in,
    // not about database.rules.json (which the tournament rules suites own).
    fs.writeFileSync(path.join(dir, 'rules.json'), JSON.stringify({ rules: { '.read': true, '.write': true } }));
    fs.writeFileSync(path.join(dir, 'firebase.json'), JSON.stringify({ database: { rules: 'rules.json' },
        emulators: { auth: { port: AUTH_PORT, host: '127.0.0.1' }, database: { port: DB_PORT, host: '127.0.0.1' }, ui: { enabled: false }, hub: { port: BASE_PORT + 3 }, logging: { port: BASE_PORT + 4 } } }));
    emuProc = spawn('firebase', ['emulators:start', '--only', 'auth,database', '--project', PROJECT], { cwd: dir, stdio: 'ignore', detached: true });
    for (let i = 0; i < 120; i++) {
        let a = false, d = false;
        try { a = (await fetch(EMU + '/')).ok; } catch (e) { }
        try { d = (await fetch(DB + '/.json?ns=' + PROJECT)).ok; } catch (e) { }
        if (a && d) return;
        await sleep(500);
    }
    throw new Error('the emulators never answered');
}
function stopEmu() { if (emuProc && emuProc.pid) { try { process.kill(-emuProc.pid, 'SIGTERM'); } catch (e) { } } }
const IDT = EMU + '/identitytoolkit.googleapis.com/v1';
async function post(url, body, owner) {
    const r = await fetch(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, owner ? { Authorization: 'Bearer owner' } : {}), body: JSON.stringify(body) });
    return r.json();
}
async function accounts() { return (await post(IDT + '/projects/' + PROJECT + '/accounts:query', {}, true)).userInfo || []; }
async function signUpPassword(email, password) { return post(IDT + '/accounts:signUp?key=fake', { email, password, returnSecureToken: true }); }
const idToken = (sub, email, verified) => JSON.stringify({ sub, email, email_verified: verified !== false });
async function signUpIdp(providerId, sub, email) {
    return post(IDT + '/accounts:signInWithIdp?key=fake', { requestUri: 'http://localhost', returnSecureToken: true,
        postBody: 'id_token=' + encodeURIComponent(idToken(sub, email)) + '&providerId=' + providerId });
}
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
async function seedEvent(code, ownerUid) {
    const rec = { name: 'P1b Scramble ' + code, format: 'scramble', courseName: 'Cameron', activeCourseKey: 'cameron', courseData: COURSE, entryFee: 0, createdAt: 1, ownerUid,
        teams: { team1: { num: 1, name: 'Eagles', players: ['Ann Alpha', 'Bo Bravo'], handicap: 0 }, team2: { num: 2, name: 'Hawks', players: ['Cal Charlie', 'Dee Delta'], handicap: 0 } } };
    const r = await fetch(DB + '/tournaments/' + code + '.json?ns=' + PROJECT, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(rec) });
    assert.ok(r.ok, 'could not seed ' + code);
}

// ---- the pre-script ---------------------------------------------------------
function pre(native) {
    return `(function () {
  window.__authDomainSeen = null; window.__errs = []; window.__nativeCalls = [];
  addEventListener('error', function (e) { window.__errs.push(String(e.message)); });
  ${native ? `window.Capacitor = { isNativePlatform: function () { return true; }, getPlatform: function () { return 'ios'; }, Plugins: { FirebaseAuthentication: {
      signInWithGoogle: function (o) { window.__nativeCalls.push({ fn: 'signInWithGoogle', o: o }); return Promise.resolve({ credential: { idToken: ${JSON.stringify(native.google || '')} } }); },
      signInWithApple: function (o) { window.__nativeCalls.push({ fn: 'signInWithApple', o: o }); return Promise.resolve({ credential: { idToken: ${JSON.stringify(native.apple || '')}, nonce: 'raw-nonce-p1b' } }); } } } };` : ''}
  var fbv, done = false;
  function wrapAuth(ns) {
    var real = ns.auth; if (!real || real.__wrapped) return;
    var w = function () { var a = real.apply(this, arguments); if (a && !a.__emu) { a.__emu = 1; a.useEmulator('http://' + location.host, { disableWarnings: true }); } return a; };
    Object.keys(real).forEach(function (k) { w[k] = real[k]; });
    ['GoogleAuthProvider', 'OAuthProvider', 'EmailAuthProvider', 'Auth'].forEach(function (k) { if (real[k]) w[k] = real[k]; });
    w.__wrapped = true; ns.auth = w;
  }
  function patch(v) {
    if (!v || done || typeof v.initializeApp !== 'function') return;
    done = true;
    var init = v.initializeApp;
    v.initializeApp = function (cfg, name) {
      window.__authDomainSeen = cfg && cfg.authDomain;
      return init.call(v, Object.assign({}, cfg, { databaseURL: '${DB}?ns=${PROJECT}', projectId: '${PROJECT}', apiKey: 'fake-api-key' }), name);
    };
    var authVal = v.auth;
    Object.defineProperty(v, 'auth', { configurable: true, enumerable: true,
      get: function () { return authVal; },
      set: function (x) { authVal = x; var tmp = { auth: x }; wrapAuth(tmp); authVal = tmp.auth; } });
    if (authVal) { var t = { auth: authVal }; wrapAuth(t); authVal = t.auth; }
  }
  Object.defineProperty(window, 'firebase', { configurable: true, get: function () { return fbv; }, set: function (v) { fbv = v; patch(v); } });
})();`;
}

// ---- CDP --------------------------------------------------------------------
class Page {
    static async open(wsUrl, opts) { const p = new Page(); await p.attach(wsUrl, opts || {}); return p; }
    async attach(wsUrl, opts) {
        this.id = 1; this.logs = [];
        this.ws = new WebSocket(wsUrl);
        await new Promise((res, rej) => { this.ws.addEventListener('open', res, { once: true }); this.ws.addEventListener('error', rej, { once: true }); });
        this.ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data);
            if (m.method === 'Runtime.consoleAPICalled') this.logs.push(m.params.type + ' ' + (m.params.args || []).map((x) => x.value !== undefined ? String(x.value) : (x.description || '')).join(' ').slice(0, 300));
            if (m.method === 'Runtime.exceptionThrown') this.logs.push('exception ' + JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text).slice(0, 300));
            if (m.method === 'Page.javascriptDialogOpening') this.ws.send(JSON.stringify({ id: 999999, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); });
        await this.cdp('Page.enable'); await this.cdp('Runtime.enable');
        if (opts.main) {
            await this.cdp('Network.enable');
            await this.cdp('Network.setBlockedURLs', { urls: ['*/sw.js*', '*firebaseio.com*', '*firebasedatabase.app*', '*cloudfunctions.net*'] });
            await this.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
            await this.cdp('Page.addScriptToEvaluateOnNewDocument', { source: opts.pre });
        }
    }
    cdp(method, params) {
        const id = this.id++;
        return new Promise((res, rej) => {
            const timer = setTimeout(() => rej(new Error('CDP timeout ' + method)), 30000);
            const h = (ev) => { const m = JSON.parse(ev.data); if (m.id === id) { clearTimeout(timer); this.ws.removeEventListener('message', h); res(m); } };
            this.ws.addEventListener('message', h);
            this.ws.send(JSON.stringify({ id, method, params: params || {} }));
        });
    }
    async eval(expr) {
        const m = await this.cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
        if (m.result && m.result.exceptionDetails) return { __threw: String((m.result.exceptionDetails.exception || {}).description || m.result.exceptionDetails.text) };
        return m.result && m.result.result ? m.result.result.value : undefined;
    }
    async goto(url) { await this.cdp('Page.navigate', { url }); await sleep(600); }
    async waitFor(expr, ms, what) {
        const until = Date.now() + (ms || 15000);
        while (Date.now() < until) { let v; try { v = await this.eval(expr); } catch (e) { v = null; } if (v && !v.__threw) return v; await sleep(200); }
        throw new Error('timed out waiting for ' + (what || expr) + ' :: ' + String(await this.eval('(document.body && document.body.innerText || "").slice(0, 400)')) + '\nLOGS ' + this.logs.slice(-12).join('\n'));
    }
    // A REAL TAP at the centre of the first VISIBLE match.
    async tap(target) {
        const t = typeof target === 'string' ? { sel: target } : target;
        const re = t.text ? t.text.toString() : 'null';
        const box = await this.waitFor(`(function(){ var re=${re}; var els=[].slice.call(document.querySelectorAll(${JSON.stringify(t.sel || 'button, a, [role=button], input[type=submit], li, .mdc-list-item')}));
            var el=els.find(function(e){ var r=e.getBoundingClientRect(); var s=getComputedStyle(e); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&!e.disabled&&(!re||re.test((e.innerText||e.value||'').replace(/\\s+/g,' ').trim())); });
            if(!el) return null; el.scrollIntoView({block:'center'}); var r=el.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`, 15000, 'tap target ' + JSON.stringify(t.sel || '') + ' ' + re);
        for (const type of ['mousePressed', 'mouseReleased']) await this.cdp('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
        await sleep(300);
    }
    async type(sel, text) {
        await this.tap(sel);
        await this.eval(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); e.focus(); e.select && e.select(); return true; })()`);
        await this.cdp('Input.insertText', { text });
    }
    // The signed-in user as the SDK holds it - a read, not a page function.
    async user() {
        return this.eval(`(function(){ var u = firebase.auth().currentUser; return u ? { uid: u.uid, isAnonymous: u.isAnonymous, email: u.email, providers: (u.providerData||[]).map(function(p){return p.providerId;}).sort() } : null; })()`);
    }
    // innerText of a visible element, or null when it is hidden / absent.
    async text(id) {
        return this.eval(`(function(){ var e=document.getElementById(${JSON.stringify(id)}); if(!e) return null; var r=e.getBoundingClientRect(); if(!(r.width>0&&r.height>0)) return null; return e.innerText; })()`);
    }
    async shown(id) { return this.eval(`(function(){ var e=document.getElementById(${JSON.stringify(id)}); if(!e) return false; var r=e.getBoundingClientRect(); return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'; })()`); }
    async shot(file, sel) {
        if (sel) await this.eval(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); if(e) e.scrollIntoView({block:'start'}); window.scrollBy(0,-12); return true; })()`);
        await sleep(300);
        const m = await this.cdp('Page.captureScreenshot', { format: 'png' });
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.from(m.result.data, 'base64'));
    }
}
class Browser {
    static async launch(port, preSource) { const b = new Browser(); await b.start(port, preSource); return b; }
    async start(port, preSource) {
        this.profile = fs.mkdtempSync(path.join(os.tmpdir(), 'p1b-phone-'));
        const rules = `MAP tournaments.rattlegolf.com 127.0.0.1:${port}, MAP hardpangolf.com 127.0.0.1:${port}, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE apis.google.com`;
        this.chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=' + this.profile,
            '--host-resolver-rules=' + rules, '--disable-features=HttpsUpgrades,HttpsFirstBalancedModeAutoEnable', 'about:blank'], { stdio: 'ignore' });
        registry.track(this.chrome, this.profile);
        const file = path.join(this.profile, 'DevToolsActivePort');
        let dport = null;
        for (let i = 0; i < 100 && !dport; i++) { await sleep(150); try { const raw = fs.readFileSync(file, 'utf8').split('\n')[0].trim(); if (/^\d+$/.test(raw)) dport = Number(raw); } catch (e) { } }
        if (!dport) throw new Error('Chrome never wrote DevToolsActivePort');
        this.dport = dport;
        let t = null;
        for (let i = 0; i < 60 && !t; i++) { await sleep(150); try { t = (await this.targets()).find((x) => x.type === 'page'); } catch (e) { } }
        this.mainId = t.id;
        this.page = await Page.open(t.webSocketDebuggerUrl, { main: true, pre: preSource });
    }
    async targets() { return (await fetch('http://127.0.0.1:' + this.dport + '/json')).json(); }
    async popups() { return (await this.targets()).filter((t) => t.type === 'page' && t.id !== this.mainId && /emulator\/auth\/handler/.test(t.url)); }
    async popup() {
        for (let i = 0; i < 75; i++) { const p = await this.popups(); if (p.length) return Page.open(p[0].webSocketDebuggerUrl); await sleep(200); }
        throw new Error('no sign-in window opened');
    }
    async close() { try { this.chrome.kill('SIGKILL'); } catch (e) { } }
}

// Through the emulator's own sign-in page with real taps: pick the account
// already there (by email), or add one with this email.
async function throughEmulator(p, o) {
    await p.waitFor(`/\\/emulator\\/auth\\/handler/.test(document.URL) && document.body && document.body.innerText.length > 20`, 20000, 'the emulator sign-in page');
    if (o.existing) {
        await p.tap({ text: new RegExp(o.existing.replace(/[.@]/g, '\\$&')) });
    } else {
        await p.tap({ text: /Add new account/i });
        await p.waitFor(`!!document.querySelector('#email-input')`, 10000, 'the emulator account form');
        await p.eval(`(function(){ var e=document.querySelector('#email-input'); e.focus(); e.value=''; return true; })()`);
        await p.cdp('Input.insertText', { text: o.email });
        await p.tap({ text: /Sign in with/i });
    }
}

const HOST = 'http://tournaments.rattlegolf.com';
const PANEL = 'signin-panel-manage';
// The gate is OPEN when the Setup pill is on screen and the sign-in box is not.
async function gateOpen(p, email) {
    await p.waitFor(`(function(){ var t=document.getElementById('tab-btn-setup'); if(!t) return false; var r=t.getBoundingClientRect(); return r.width>0&&r.height>0; })()`, 20000, 'the Setup tab');
    assert.equal(await p.shown(PANEL), false, 'the sign-in box is still on screen');
    const who = await p.text('signed-in-as');
    assert.ok(who && who.includes('Signed in as ' + email), 'no "Signed in as ' + email + '" line: ' + who);
    assert.ok(!/different organizer account/.test(who), 'the owner was told the event is someone else\'s: ' + who);
}
async function arriveSignedOut(b, code) {
    await b.page.goto(HOST + '/tournament.html?tourney=' + code);
    await b.page.waitFor(`(function(){ var e=document.getElementById('${PANEL}-google'); if(!e) return false; var r=e.getBoundingClientRect(); return r.width>0&&r.height>0; })()`, 20000, 'the signed-out sign-in box');
    assert.equal(await b.page.user(), null, 'arrived signed in');
}

let srv = null, PORT = 0;
describe('P1-b: organizer sign-in with Apple and Google on tournament.html, real Chrome, real SDK, Auth + Database emulators', { skip: !CAN && 'Chrome, the firebase CLI or Java is not installed' }, () => {
    const G = { email: 'owner.google@example.com', sub: 'g-owner-1' };
    const A = { email: 'owner.apple@privaterelay.appleid.com', sub: 'a-owner-1' };
    const W = { email: 'owner.pw@example.com', password: 'pw-123456' };
    const X = { email: 'owner.exists@example.com', password: 'pw-654321' };
    const V = { email: 'owner.app@example.com', password: 'pw-777777' };
    let Guid = null, Auid = null, Wuid = null, Xuid = null, Vuid = null;

    before(async () => {
        srv = await serve(); PORT = srv.address().port;
        await startEmu();
        Guid = (await signUpIdp('google.com', G.sub, G.email)).localId;
        Auid = (await signUpIdp('apple.com', A.sub, A.email)).localId;
        Wuid = (await signUpPassword(W.email, W.password)).localId;
        Xuid = (await signUpPassword(X.email, X.password)).localId;
        Vuid = (await signUpPassword(V.email, V.password)).localId;
        assert.ok(Guid && Auid && Wuid && Xuid && Vuid, 'seeding the accounts failed');
        await seedEvent('P1BG', Guid);
        await seedEvent('P1BA', Auid);
        await seedEvent('P1BW', Wuid);
        await seedEvent('P1BX', Xuid);
        await seedEvent('P1BV', Vuid);
    });
    after(() => { stopEmu(); if (srv) srv.close(); });

    test('1. SIGNED OUT, COLD: Continue with Apple, Continue with Google, then Use email instead - admin.html\'s card - and the email row is one tap away', async () => {
        const b = await Browser.launch(PORT, pre(null));
        try {
            await arriveSignedOut(b, 'P1BG');
            assert.equal(await b.page.eval('window.__authDomainSeen'), 'golfapp-9fb21.firebaseapp.com', 'tournaments.rattlegolf.com is a popup host');
            const box = await b.page.text(PANEL);
            const at = (s) => box.indexOf(s);
            assert.ok(at('Organizers sign in to set up and edit a tournament.') === 0, box);
            assert.ok(at('Continue with Apple') > 0, 'no Continue with Apple: ' + box);
            assert.ok(at('Continue with Apple') < at('Continue with Google'), 'Apple first, then Google: ' + box);
            assert.ok(at('Continue with Google') < at('Use email instead'), 'then the email option: ' + box);
            assert.equal(await b.page.shown(PANEL + '-email-row'), false, 'the email row is open on arrival');
            assert.equal(await b.page.shown('tab-btn-setup'), false, 'Setup shown to a signed-out visitor');
            if (SHOTS) await b.page.shot(path.join(SHOTS, 'P1b-signin-box.png'), '#signed-in-as');
            await b.page.tap('#' + PANEL + '-email-toggle');
            assert.equal(await b.page.shown(PANEL + '-email-row'), true, 'Use email instead did not open the email row');
            assert.match(await b.page.text(PANEL + '-email-toggle'), /Hide the email option/);
            assert.deepEqual(await b.page.eval('window.__errs'), []);
        } finally { await b.close(); }
    });

    test('2. GOOGLE (popup): the organizer ends signed in as the event\'s owner with the Setup tab open', async () => {
        const b = await Browser.launch(PORT, pre(null));
        try {
            await arriveSignedOut(b, 'P1BG');
            const before = (await accounts()).length;
            await b.page.tap('#' + PANEL + '-google');
            const pop = await b.popup();
            await throughEmulator(pop, { existing: G.email });
            await gateOpen(b.page, G.email);
            const u = await b.page.user();
            assert.equal(u.uid, Guid, 'signed in as a different account from the owner');
            assert.deepEqual(u.providers, ['google.com']);
            assert.equal((await accounts()).length, before, 'a new account was made');
            assert.deepEqual(await b.page.eval('window.__errs'), []);
        } finally { await b.close(); }
    });

    test('3. APPLE (popup): the same for an event an Apple account owns', async () => {
        const b = await Browser.launch(PORT, pre(null));
        try {
            await arriveSignedOut(b, 'P1BA');
            await b.page.tap('#' + PANEL + '-apple');
            const pop = await b.popup();
            await throughEmulator(pop, { existing: A.email });
            await gateOpen(b.page, A.email);
            assert.equal((await b.page.user()).uid, Auid);
        } finally { await b.close(); }
    });

    test('4. AN EMAIL + PASSWORD ORGANIZER TAPS GOOGLE WITH THE SAME (verified) EMAIL: the emulator links it to the same uid - the event is still theirs', async () => {
        const b = await Browser.launch(PORT, pre(null));
        try {
            await arriveSignedOut(b, 'P1BW');
            await b.page.tap('#' + PANEL + '-google');
            const pop = await b.popup();
            await throughEmulator(pop, { email: W.email });
            await gateOpen(b.page, W.email);
            const u = await b.page.user();
            assert.equal(u.uid, Wuid, 'THE UID CHANGED - the organizer\'s events would look gone');
            assert.ok(u.providers.includes('google.com'), JSON.stringify(u));
            // MEASURED, AND A THING MANNY HAS TO KNOW: the emulator treats a
            // verified Google email as authoritative over an UNVERIFIED password
            // account and REMOVES the password (Firebase documents the same for
            // gmail.com). Same uid, events intact - but email + password stops
            // working for that organizer; Google is now the way in.
            assert.deepEqual(u.providers, ['google.com'], 'the emulator kept the password this time: ' + JSON.stringify(u));
        } finally { await b.close(); }
    });

    test('5. ACCOUNT EXISTS (unverified provider email): the box says sign in with email and password, nobody is signed in, and the password sign-in then links Google to that same account', async () => {
        const b = await Browser.launch(PORT, pre({ google: idToken('g-exists-1', X.email, false) }));
        try {
            await arriveSignedOut(b, 'P1BX');
            const before = (await accounts()).length;
            await b.page.tap('#' + PANEL + '-google');
            const note = await b.page.waitFor(`(function(){ var e=document.getElementById('${PANEL}-oauth-status'); return e && e.innerText ? e.innerText : null; })()`, 20000, 'the answer under the buttons');
            assert.match(note, /already has an organizer account that signs in with a password/, note);
            assert.match(note, /Sign in with your email and password below/, note);
            assert.match(note, /Google is then added to that account/, note);
            assert.equal(await b.page.user(), null, 'somebody was signed in');
            assert.equal((await accounts()).length, before, 'an account was made');
            assert.equal(await b.page.shown(PANEL + '-email-row'), true, 'the email row did not open');
            assert.equal(await b.page.eval(`document.getElementById('${PANEL}-email').value`), X.email, 'the address was not filled in');
            assert.equal(await b.page.shown('tab-btn-setup'), false);
            if (SHOTS) await b.page.shot(path.join(SHOTS, 'P1b-account-exists.png'), '#signed-in-as');
            await b.page.type('#' + PANEL + '-password', X.password);
            await b.page.tap({ sel: '#' + PANEL + '-email-row button', text: /^Sign in$/ });
            await gateOpen(b.page, X.email);
            const u = await b.page.user();
            assert.equal(u.uid, Xuid, 'not the account the event belongs to');
            await b.page.waitFor(`(function(){ var u=firebase.auth().currentUser; return !!(u && (u.providerData||[]).some(function(p){return p.providerId==='google.com';})); })()`, 15000, 'google.com linked to the password account');
            const acct = (await accounts()).find((a) => a.localId === Xuid);
            assert.deepEqual((acct.providerUserInfo || []).map((p) => p.providerId).sort(), ['google.com', 'password'], 'the server account does not hold both');
            assert.equal((await accounts()).length, before, 'an account was made');
        } finally { await b.close(); }
    });

    test('6. INSIDE THE APP (Capacitor stand-in): Google and Apple go through the native seam, skipNativeAuth, no sign-in window, the gate opens', async () => {
        for (const [code, which, who, uid] of [['P1BG', 'google', G, () => Guid], ['P1BA', 'apple', A, () => Auid]]) {
            const b = await Browser.launch(PORT, pre({ google: idToken(G.sub, G.email), apple: idToken(A.sub, A.email) }));
            try {
                await arriveSignedOut(b, code);
                await b.page.tap('#' + PANEL + '-' + which);
                await gateOpen(b.page, who.email);
                assert.equal((await b.page.user()).uid, uid(), which + ': not the owner');
                const calls = await b.page.eval('window.__nativeCalls');
                assert.deepEqual(calls, [{ fn: which === 'google' ? 'signInWithGoogle' : 'signInWithApple', o: { skipNativeAuth: true } }], JSON.stringify(calls));
                assert.equal((await b.popups()).length, 0, which + ': a sign-in window opened inside the app');
            } finally { await b.close(); }
        }
    });

    test('7. ALREADY SIGNED IN on admin.html (same origin, same persisted user): tournament.html opens the gate with no tap', async () => {
        const b = await Browser.launch(PORT, pre(null));
        try {
            await b.page.goto(HOST + '/admin.html');
            await b.page.waitFor(`(function(){ try { return !!firebase.auth(); } catch (e) { return false; } })()`, 20000, 'admin.html auth');
            // SETUP, not the feature: the SDK's own sign-in on the other page.
            const r = await b.page.eval(`firebase.auth().signInWithEmailAndPassword(${JSON.stringify(V.email)}, ${JSON.stringify(V.password)}).then(function(c){ return c.user.uid; })`);
            assert.equal(r, Vuid, JSON.stringify(r));
            await b.page.goto(HOST + '/tournament.html?tourney=P1BV');
            await gateOpen(b.page, V.email);
        } finally { await b.close(); }
    });

    test('8. A REDIRECT HOST (hardpangolf.com): authDomain is the page\'s own host and Google goes by REDIRECT - out and back, signed in, gate open', async () => {
        const b = await Browser.launch(PORT, pre(null));
        try {
            const url = 'http://hardpangolf.com/tournament.html?tourney=P1BG';
            await b.page.goto(url);
            await b.page.waitFor(`!!document.getElementById('${PANEL}-google')`, 20000, 'the box');
            assert.equal(await b.page.eval('window.__authDomainSeen'), 'hardpangolf.com');
            await b.page.tap('#' + PANEL + '-google');
            await throughEmulator(b.page, { existing: G.email });
            await b.page.waitFor(`/^http:\\/\\/hardpangolf\\.com\\/tournament\\.html/.test(document.URL)`, 20000, 'back on the page');
            await gateOpen(b.page, G.email);
            assert.equal((await b.page.user()).uid, Guid);
            assert.equal(await b.page.eval(`sessionStorage.getItem('hardpan_oauth_redirect_pending')`), null);
        } finally { await b.close(); }
    });

    test('9. A REDIRECT HOST: leaving the Google page without signing in comes back "not finished", still signed out', async () => {
        const b = await Browser.launch(PORT, pre(null));
        try {
            const url = 'http://hardpangolf.com/tournament.html?tourney=P1BG';
            await b.page.goto(url);
            await b.page.tap('#' + PANEL + '-apple');
            await b.page.waitFor(`/emulator\\/auth\\/handler/.test(document.URL)`, 20000, 'the provider page');
            await b.page.goto(url);
            const note = await b.page.waitFor(`(function(){ var e=document.getElementById('${PANEL}-oauth-status'); return e && e.innerText ? e.innerText : null; })()`, 20000, 'the answer');
            assert.match(note, /not finished\. Nothing changed/);
            assert.equal(await b.page.user(), null);
        } finally { await b.close(); }
    });
});
