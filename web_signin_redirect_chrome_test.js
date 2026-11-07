// ============================================================================
// WEB SIGN-IN BY REDIRECT, IN REAL CHROME (web-signin-redirect, 2026-11-07)
//
// The page a golfer opens (admin.html, served over http under the hostname
// hardpangolf.com - Chrome's --host-resolver-rules sends that name to a local
// static server, so the page really believes it is on hardpangolf.com), the
// REAL auth SDK (firebase-auth-compat.js, the vendored copy the site ships),
// and the REAL Firebase Auth emulator standing in for Google: its own sign-in
// page is where the redirect lands, and it is driven with real taps. Nothing is
// stubbed in oauth-signin.js or admin.html, and no page function is called -
// the test taps Account, taps the button, taps through the emulator's page and
// reads what the page then shows.
//
// WHAT THE ONE PRE-SCRIPT DOES (and nothing else): points initializeApp at a
// demo project (databaseURL to a closed local port, so no database traffic
// leaves the machine) and calls auth().useEmulator on the first auth instance.
// The authDomain the PAGE chose is left alone and recorded. Every other host
// resolves to nothing (MAP * ~NOTFOUND), so an escape fails instead of
// reaching the live site or the live project - with ONE exception,
// apis.google.com: the auth SDK loads Google's iframe loader (gapi, api.js)
// from there to talk to the handler iframe, in production too, and without it
// every redirect result is auth/internal-error (measured). It is a public
// script GET; nothing about the project or a user goes to it.
//
// WHAT IT CANNOT PROVE: real Google or Apple (the emulator's page replaces
// them, and with the emulator the SDK never uses authDomain for the handler,
// so the /__/auth/ proxy is NOT exercised here - web_signin_redirect_test.js
// holds the proxy, and a deploy-time check is in the report); Safari; the
// console steps (OAuth redirect URIs, Apple return URLs).
//
// COUNTS (final run, 2026-11-07): 5 tests - on web-signin-redirect 5 pass;
// against origin/main d2f9ef9f 1 pass / 4 fail (5, the popup fallback, is
// the one that was already true). EMU_THIRD_PARTY=1 (handler third-party):
// test 1 fails, "Sign-in was not finished" - partitioning reproduced.
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
const PROJECT = 'demo-hardpan-redirect';
const EMU_PORT = 9000 + Math.floor(Math.random() * 400) * 2 + 1;
const EMU = 'http://127.0.0.1:' + EMU_PORT;

function firebaseCli() { try { execFileSync('firebase', ['--version'], { stdio: 'ignore' }); return true; } catch (e) { return false; } }
const CAN = fs.existsSync(CHROME) && firebaseCli();

// ---- a static server for the repo -------------------------------------------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css' };
// THE SAME-ORIGIN AUTH PATHS, as production will have them. In production
// functions/_middleware.js forwards /__/auth/ on hardpangolf.com to
// firebaseapp.com so the handler and its iframe are FIRST-PARTY. Here the
// emulator plays Firebase, so its paths (/emulator/..., the identitytoolkit
// REST) are forwarded by this server on the page's own origin - the same move,
// and useEmulator is pointed at http://hardpangolf.com. Measured first without
// it (EMU_THIRD_PARTY=1: the emulator's handler and iframe on their own
// 127.0.0.1 origin, i.e. third-party to the page, which is today's
// firebaseapp.com shape): the sign-in on the emulator page completed, and back
// on hardpangolf.com getRedirectResult had NO result - test 1 fails with "Sign-in
// was not finished" (2026-11-07). That is the storage-partitioning failure the
// proxy exists for, reproduced; same-origin, test 1 passes.
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
        if (p === '/' || p === '/admin') p = '/admin.html';
        const f = path.join(REPO, path.normalize(p));
        if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        fs.createReadStream(f).pipe(res);
    });
    return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

// ---- the auth emulator ------------------------------------------------------
let emuProc = null, emuDir = null;
async function startEmu() {
    emuDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-emu-'));
    fs.writeFileSync(path.join(emuDir, 'firebase.json'), JSON.stringify({ emulators: { auth: { port: EMU_PORT, host: '127.0.0.1' }, ui: { enabled: false }, hub: { port: EMU_PORT + 1 }, logging: { port: EMU_PORT + 2 } } }));
    emuProc = spawn('firebase', ['emulators:start', '--only', 'auth', '--project', PROJECT], { cwd: emuDir, stdio: 'ignore', detached: true });
    for (let i = 0; i < 90; i++) { try { const r = await fetch(EMU + '/'); if (r.ok) return; } catch (e) { } await sleep(500); }
    throw new Error('auth emulator never answered');
}
function stopEmu() {
    if (emuProc && emuProc.pid) { try { process.kill(-emuProc.pid, 'SIGTERM'); } catch (e) { } }
}
async function emuAccounts() {
    const r = await fetch(EMU + '/identitytoolkit.googleapis.com/v1/projects/' + PROJECT + '/accounts:query', {
        method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: '{}' });
    const j = await r.json();
    return j.userInfo || [];
}
async function emuSignUp(email, password) {
    const r = await fetch(EMU + '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
    return r.json();
}

// ---- the one pre-script -----------------------------------------------------
const PRE = `(function () {
  window.__authDomainSeen = null; window.__errs = [];
  addEventListener('error', function (e) { window.__errs.push(String(e.message)); });
  var fbv, done = false;
  function wrapAuth(ns) {
    var real = ns.auth; if (!real || real.__wrapped) return;
    var w = function () { var a = real.apply(this, arguments); if (a && !a.__emu) { a.__emu = 1; a.useEmulator(${JSON.stringify(process.env.EMU_THIRD_PARTY ? EMU : 'http://hardpangolf.com')}, { disableWarnings: true }); } return a; };
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
      return init.call(v, Object.assign({}, cfg, { databaseURL: 'http://127.0.0.1:9?ns=${PROJECT}', projectId: ${JSON.stringify(PROJECT)}, apiKey: 'fake-api-key' }), name);
    };
    var authVal = v.auth;
    Object.defineProperty(v, 'auth', { configurable: true, enumerable: true,
      get: function () { return authVal; },
      set: function (x) { authVal = x; var tmp = { auth: x }; wrapAuth(tmp); authVal = tmp.auth; } });
    if (authVal) { var t = { auth: authVal }; wrapAuth(t); authVal = t.auth; }
  }
  Object.defineProperty(window, 'firebase', { configurable: true, get: function () { return fbv; }, set: function (v) { fbv = v; patch(v); } });
})();`;

// ---- one Chrome per phone ---------------------------------------------------
class Browser {
    static async launch(port) { const b = new Browser(); await b.start(port); return b; }
    async start(port) {
        this.profile = fs.mkdtempSync(path.join(os.tmpdir(), 'redirect-phone-'));
        const rules = `MAP hardpangolf.com 127.0.0.1:${port}, MAP golf-app-5a5.pages.dev 127.0.0.1:${port}, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE apis.google.com`;
        this.chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=' + this.profile,
            '--host-resolver-rules=' + rules, '--disable-features=HttpsUpgrades,HttpsFirstBalancedModeAutoEnable', 'about:blank'], { stdio: 'ignore' });
        registry.track(this.chrome, this.profile);
        const file = path.join(this.profile, 'DevToolsActivePort');
        let dport = null;
        for (let i = 0; i < 100 && !dport; i++) { await sleep(150); try { const raw = fs.readFileSync(file, 'utf8').split('\n')[0].trim(); if (/^\d+$/.test(raw)) dport = Number(raw); } catch (e) { } }
        if (!dport) throw new Error('Chrome never wrote DevToolsActivePort');
        this.dport = dport;
        let t = null;
        for (let i = 0; i < 60 && !t; i++) { await sleep(150); try { t = (await (await fetch('http://127.0.0.1:' + dport + '/json')).json()).find((x) => x.type === 'page'); } catch (e) { } }
        await this.attach(t.webSocketDebuggerUrl);
    }
    async attach(wsUrl) {
        this.id = 1;
        this.ws = new WebSocket(wsUrl);
        await new Promise((res, rej) => { this.ws.addEventListener('open', res, { once: true }); this.ws.addEventListener('error', rej, { once: true }); });
        this.logs = this.logs || [];
        this.ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data);
            if (process.env.REDIRECT_DEBUG && m.method === 'Network.requestWillBeSent') this.logs.push('REQ ' + m.params.request.method + ' ' + m.params.request.url.slice(0, 200));
            if (process.env.REDIRECT_DEBUG && m.method === 'Network.loadingFailed') this.logs.push('FAILED ' + m.params.errorText + ' ' + m.params.requestId);
            if (m.method === 'Runtime.consoleAPICalled') this.logs.push(m.params.type + ' ' + (m.params.args || []).map((x) => x.value !== undefined ? String(x.value) : (x.description || '')).join(' ').slice(0, 400));
            if (m.method === 'Runtime.exceptionThrown') this.logs.push('exception ' + JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text).slice(0, 400));
            if (m.method === 'Page.javascriptDialogOpening') this.ws.send(JSON.stringify({ id: 999999, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); });
        await this.cdp('Page.enable'); await this.cdp('Runtime.enable'); await this.cdp('Network.enable');
        await this.cdp('Network.setBlockedURLs', { urls: ['*/sw.js*', '*firebaseio.com*', '*firebasedatabase.app*', '*cloudfunctions.net*'] });
        await this.cdp('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
        await this.cdp('Page.addScriptToEvaluateOnNewDocument', { source: PRE });
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
        throw new Error('timed out waiting for ' + (what || expr) + ' at ' + (await this.eval('document.URL')) + ' :: ' + String(await this.eval('(document.body && document.body.innerText || "").slice(0, 300)')));
    }
    // A REAL TAP at the centre of the first visible match (selector, or text in buttons/links).
    async tap(target) {
        const t = typeof target === 'string' ? { sel: target } : target;
        const re = t.text ? t.text.toString() : 'null';
        const box = await this.waitFor(`(function(){ var re=${re}; var els=[].slice.call(document.querySelectorAll(${JSON.stringify(t.sel || 'button, a, [role=button], input[type=submit], li, .mdc-list-item')}));
            var el=els.find(function(e){ var r=e.getBoundingClientRect(); var s=getComputedStyle(e); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&(!re||re.test((e.innerText||e.value||'').replace(/\\s+/g,' ').trim())); });
            if(!el) return null; el.scrollIntoView({block:'center'}); var r=el.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`, 15000, 'tap target ' + JSON.stringify(t.sel || '') + ' ' + re);
        for (const type of ['mousePressed', 'mouseReleased']) await this.cdp('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
        await sleep(300);
    }
    async url() { return this.eval('document.URL'); }
    // The signed-in user as the SDK holds it - a read, not a page function.
    async user() {
        return this.eval(`(function(){ var u = firebase.auth().currentUser; return u ? { uid: u.uid, isAnonymous: u.isAnonymous, email: u.email, providers: (u.providerData||[]).map(function(p){return p.providerId;}) } : null; })()`);
    }
    async noteBeside(id) {
        return this.eval(`(function(){ var b=document.getElementById(${JSON.stringify(id)}); if(!b||!b.parentNode) return null; var n=[].slice.call(b.parentNode.children).find(function(e){ return /\\btap-note\\b/.test(e.className) && e.getAttribute('data-tap-note-for'); }); return n ? { text: n.innerText, fail: /tap-note-fail/.test(n.className) } : null; })()`);
    }
    async close() { try { this.chrome.kill('SIGKILL'); } catch (e) { } }
}

// Through the emulator's own sign-in page with real taps. existing: pick the
// account already there (by email); otherwise add a new one with this email.
async function throughEmulator(b, o) {
    await b.waitFor(`/\\/emulator\\/auth\\/handler/.test(document.URL) && document.body && document.body.innerText.length > 20`, 20000, 'the emulator sign-in page');
    if (o.existing) {
        await b.tap({ text: new RegExp(o.existing.replace(/[.@]/g, '\\$&')) });
    } else {
        await b.tap({ text: /Add new account/i });
        await b.waitFor(`!!document.querySelector('#email-input')`, 10000, 'the emulator account form');
        await b.eval(`(function(){ var e=document.querySelector('#email-input'); e.focus(); e.value=''; return true; })()`);
        await b.cdp('Input.insertText', { text: o.email });
        await b.tap({ text: /Sign in with Google/i });
    }
}

let srv = null, PORT = 0;
const PAGE = () => 'http://hardpangolf.com/admin.html';

describe('web sign-in by redirect, real Chrome, real SDK, Auth emulator', { skip: !CAN && 'Chrome or the firebase CLI is not installed' }, () => {
    before(async () => { srv = await serve(); PORT = srv.address().port; await startEmu(); });
    after(() => { stopEmu(); if (srv) srv.close(); });

    const G = 'golfer.redirect@example.com';
    let A1 = null;

    test('1. ANONYMOUS ORGANIZER, Continue with Google: LINKED by redirect, the same uid, and the page says so', async () => {
        const b = await Browser.launch(PORT);
        try {
            await b.goto(PAGE());
            const u0 = await b.waitFor(`(function(){ try { var u = firebase.auth().currentUser; return u && u.uid ? u.uid : null; } catch (e) { return null; } })()`, 20000, 'the anonymous organizer');
            A1 = u0;
            assert.equal(await b.eval('window.__authDomainSeen'), 'hardpangolf.com', 'the page did not set authDomain to its own host');
            assert.equal(await b.eval('location.hostname'), 'hardpangolf.com');
            assert.equal((await b.user()).isAnonymous, true);
            await b.tap('#account-link');
            await b.tap('#oauth-google');
            // THE PAGE LEFT - a redirect, not a popup.
            await throughEmulator(b, { email: G });
            await b.waitFor(`/^http:\\/\\/hardpangolf\\.com\\/admin\\.html/.test(document.URL)`, 20000, 'back on the page');
            const note = await b.waitFor(`(function(){ var b=document.getElementById('oauth-google'); var n=b && b.parentNode && [].slice.call(b.parentNode.children).find(function(e){ return /tap-note/.test(e.className); }); return n && n.innerText ? n.innerText : null; })()`, 20000, 'the answer beside Continue with Google');
            const u1 = await b.user();
            if (process.env.REDIRECT_DEBUG) console.log('NOTE', note, '\nLOGS', b.logs.join('\n'));
            assert.equal(u1.uid, A1, 'THE UID CHANGED - the anonymous organizer\'s rounds would be stranded');
            assert.equal(u1.isAnonymous, false);
            assert.deepEqual(u1.providers, ['google.com']);
            assert.match(note, /Signed in as golfer\.redirect@example\.com/);
            assert.match(note, /your rounds and trial stay on this account/);
            assert.equal(await b.eval(`document.getElementById('account-modal').classList.contains('open')`), true, 'the Account panel did not reopen');
            assert.equal(await b.eval(`sessionStorage.getItem('hardpan_oauth_redirect_pending')`), null);
            const all = await emuAccounts();
            assert.equal(all.length, 1, 'a second account was made: ' + all.length);
            assert.deepEqual(await b.eval('window.__errs'), []);
        } finally { await b.close(); }
    });

    test('2. THE SECOND DEVICE: that Google account is already on A1 - signed in AS A1, and the page does not promise this browser\'s trial', async () => {
        assert.ok(A1, 'test 1 must run first');
        const b = await Browser.launch(PORT);
        try {
            await b.goto(PAGE());
            const A2 = await b.waitFor(`(function(){ try { var u = firebase.auth().currentUser; return u && u.uid ? u.uid : null; } catch (e) { return null; } })()`, 20000, 'a second anonymous organizer');
            assert.notEqual(A2, A1);
            await b.tap('#account-link');
            await b.tap('#oauth-google');
            await throughEmulator(b, { existing: G });
            await b.waitFor(`/^http:\\/\\/hardpangolf\\.com\\/admin\\.html/.test(document.URL)`, 20000, 'back on the page');
            const note = await b.waitFor(`(function(){ var b=document.getElementById('oauth-google'); var n=b && b.parentNode && [].slice.call(b.parentNode.children).find(function(e){ return /tap-note/.test(e.className); }); return n && n.innerText ? n.innerText : null; })()`, 20000, 'the answer');
            const u = await b.user();
            assert.equal(u.uid, A1, 'did not adopt the account that holds this Google identity');
            assert.match(note, /Signed in as golfer\.redirect@example\.com/);
            assert.doesNotMatch(note, /stay on this account/, 'it promised the anonymous trial moved');
            const all = await emuAccounts();
            assert.equal(all.length, 2, 'A1 and the untouched anonymous A2: ' + all.length);
            const a2 = all.find((x) => x.localId === A2);
            assert.ok(a2 && !(a2.providerUserInfo || []).length, 'the anonymous account was changed');
        } finally { await b.close(); }
    });

    test('3. A DELIBERATE "Link Google" from an email account, when Google is on someone else: REFUSED, nothing switched', async () => {
        const email = 'manny.email@example.com';
        const made = await emuSignUp(email, 'pw-123456');
        assert.ok(made.localId, 'could not make the email account: ' + JSON.stringify(made));
        const b = await Browser.launch(PORT);
        try {
            await b.goto(PAGE());
            await b.waitFor(`(function(){ try { return !!firebase.auth().currentUser; } catch (e) { return false; } })()`, 20000, 'auth');
            // SETUP, not the feature: sign this browser in with that email (the page has no password form).
            await b.eval(`firebase.auth().signInWithEmailAndPassword(${JSON.stringify(email)}, 'pw-123456').then(function(){ return true; })`);
            await b.goto(PAGE());
            await b.waitFor(`(function(){ try { var u = firebase.auth().currentUser; return u && u.email === ${JSON.stringify(email)}; } catch (e) { return false; } })()`, 20000, 'the email account restored');
            await b.tap('#account-link');
            await b.tap('#oauth-link-google');
            await throughEmulator(b, { existing: G });
            await b.waitFor(`/^http:\\/\\/hardpangolf\\.com\\/admin\\.html/.test(document.URL)`, 20000, 'back on the page');
            if (process.env.REDIRECT_DEBUG) { await sleep(4000); console.log('DBG3', JSON.stringify(await b.eval(`(function(){ var c=document.getElementById('oauth-link-card'); var b=document.getElementById('oauth-link-google'); return { card: c && c.style.display, btn: b && b.style.display, sib: b && [].slice.call(b.parentNode.children).map(function(e){return e.id+'|'+e.className+'|'+e.textContent.slice(0,80);}), u: firebase.auth().currentUser && firebase.auth().currentUser.email, pend: sessionStorage.getItem('hardpan_oauth_redirect_pending') }; })()`)), '\n', b.logs.filter((l) => !/^REQ|^FAILED/.test(l)).join('\n')); }
            const note = await b.waitFor(`(function(){ var b=document.getElementById('oauth-link-google'); var n=b && b.parentNode && [].slice.call(b.parentNode.children).find(function(e){ return /tap-note/.test(e.className); }); return n && n.innerText ? { t: n.innerText, fail: /tap-note-fail/.test(n.className) } : null; })()`, 20000, 'the refusal');
            assert.match(note.t, /already attached to a different account/);
            assert.equal(note.fail, true);
            const u = await b.user();
            assert.equal(u.uid, made.localId, 'IT SWITCHED ACCOUNTS on a deliberate link');
            assert.deepEqual(u.providers, ['password']);
        } finally { await b.close(); }
    });

    test('4. LEAVING the Google page without signing in: back on the page it says nothing changed, same anonymous uid', async () => {
        const b = await Browser.launch(PORT);
        try {
            await b.goto(PAGE());
            const A = await b.waitFor(`(function(){ try { var u = firebase.auth().currentUser; return u && u.uid ? u.uid : null; } catch (e) { return null; } })()`, 20000, 'anon');
            await b.tap('#account-link');
            await b.tap('#oauth-apple');
            await b.waitFor(`/emulator\\/auth\\/handler/.test(document.URL)`, 20000, 'the provider page');
            await b.goto(PAGE());   // typed the address again / no back-forward cache
            const note = await b.waitFor(`(function(){ var b=document.getElementById('oauth-apple'); var n=b && b.parentNode && [].slice.call(b.parentNode.children).find(function(e){ return /tap-note/.test(e.className); }); return n && n.innerText ? n.innerText : null; })()`, 20000, 'the answer');
            assert.match(note, /not finished\. Nothing changed/);
            const u = await b.user();
            assert.equal(u.uid, A);
            assert.equal(u.isAnonymous, true);
        } finally { await b.close(); }
    });

    test('5. FALLBACK: on a host that is not listed (127.0.0.1) the popup is used, exactly as before', async () => {
        const b = await Browser.launch(PORT);
        try {
            await b.goto('http://127.0.0.1:' + PORT + '/admin.html');
            await b.waitFor(`(function(){ try { return !!firebase.auth().currentUser; } catch (e) { return false; } })()`, 20000, 'auth');
            assert.equal(await b.eval('window.__authDomainSeen'), 'golfapp-9fb21.firebaseapp.com');
            const before = await b.url();
            await b.tap('#account-link');
            await b.tap('#oauth-google');
            await sleep(1500);
            assert.equal(await b.url(), before, 'the page navigated away - that is a redirect, not the popup');
            const targets = await (await fetch('http://127.0.0.1:' + b.dport + '/json')).json();
            assert.ok(targets.some((t) => t.type === 'page' && /emulator\/auth\/handler/.test(t.url)), 'no popup window opened: ' + targets.map((t) => t.url).join(' | '));
        } finally { await b.close(); }
    });
});
