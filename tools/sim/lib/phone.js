// ============================================================================
// A PHONE YOU CAN HOLD (mailbox 013, setup-flow simulations).
//
// arriveCold takes a fixed list of steps; a journey remembers the database but
// clicks with element.click() and cannot be killed. A setup simulation needs
// both and one more thing: to decide the next tap from what the screen shows,
// the way a golfer does. So this is one headless Chrome per phone, driven step
// by step over CDP, with:
//
//   tap(selector | {text})  a REAL tap (Input.dispatchMouseEvent) at the
//                           element's centre, after scrolling it into view -
//                           counted, so a path reports its taps
//   type / paste            focus by a real tap, then Input.insertText
//   shot(name)              the screen as the phone shows it, into the path's
//                           folder - counted as a screen when the URL or the
//                           visible view changed
//   kill() / Phone.launch   the app gone and back: Chrome is killed and a new
//                           one started over the SAME profile (localStorage
//                           survives, sessionStorage and memory do not)
//   offline(true|false)     airplane mode: CDP network offline AND the stand-in
//                           database stops answering (see below)
//
// THE DATABASE IS A SERVER IN NODE. Each phone's page gets a stand-in Firebase
// seeded from the server copy (tools/lib/journey.js's model: writes land in
// the tab's copy, listeners re-fire). Every write is logged with its value;
// sync() replays the ACKED writes onto the server, so a second phone launched
// later sees them, and deliver() pushes the server's copy of a path to a phone
// that is already open. Nothing here can reach the live database: the real
// Firebase bundles are blocked, and so is every *.firebaseio.com /
// *.firebasedatabase.app / cloudfunctions URL.
//
// OFFLINE, MODELLED ON THE REAL SDK (measured in tools/offline-durability-
// audit.js): a write made offline is applied locally and fires local
// listeners, but its promise never settles until the signal returns; a page
// that STARTED offline (a relaunch with no signal) has no cache, so its reads
// never answer. Kill the app while offline and the unacked writes are gone,
// unless the app's own durable queue (offline-queue.js) kept them.
// ============================================================================
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const registry = require('../../lib/browser-registry.js');

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (page, query) => 'file://' + path.join(REPO_ROOT, page) + (query ? (query.charAt(0) === '#' ? query : '?' + query) : '');

// ---- the server ----------------------------------------------------------------
function applyWrite(db, op, pathStr, value) {
    const parts = String(pathStr || '').split('/').filter(Boolean);
    if (op === 'update' && value && typeof value === 'object' && !Array.isArray(value)) {
        Object.keys(value).forEach((k) => {
            if (k.indexOf('/') !== -1 || !parts.length) applyWrite(db, 'set', parts.concat(k.split('/').filter(Boolean)).join('/'), value[k]);
            else applyWrite(db, 'set', parts.concat(k).join('/'), value[k]);
        });
        return db;
    }
    if (!parts.length) return db;
    let node = db;
    for (let i = 0; i < parts.length - 1; i++) {
        if (node[parts[i]] == null || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
        node = node[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (op === 'remove' || value === null || value === undefined) delete node[last];
    else node[last] = JSON.parse(JSON.stringify(value));
    return db;
}
function readPath(db, pathStr) {
    let node = db;
    for (const p of String(pathStr || '').split('/').filter(Boolean)) { if (node == null) return null; node = node[p]; }
    return node === undefined ? null : node;
}

// ---- the stand-in Firebase, in the page ------------------------------------------
function stub(dbJson, auth) {
    const user = auth === null ? null : Object.assign({ uid: 'anon-cold', isAnonymous: true, email: null }, auth || {});
    return `(function () {
  var SEED = ${dbJson};
  var KEY = '__sim_db';
  var carried = null; try { carried = sessionStorage.getItem(KEY); } catch (e) {}
  window.__DB = carried ? JSON.parse(carried) : SEED;
  function persist() { try { sessionStorage.setItem(KEY, JSON.stringify(window.__DB)); } catch (e) {} }
  persist();
  var off0 = false; try { off0 = localStorage.getItem('__simOffline') === '1'; } catch (e) {}
  window.__simOffline = off0;
  window.__simColdOffline = off0;           // this document started with no signal: no cache
  var LOGK = '__sim_log';
  try { window.__simLog = JSON.parse(sessionStorage.getItem(LOGK) || '[]'); } catch (e) { window.__simLog = []; }
  var seq = window.__simLog.length ? window.__simLog[window.__simLog.length - 1].seq : 0; var pending = [];
  function persistLog() { try { sessionStorage.setItem(LOGK, JSON.stringify(window.__simLog)); } catch (e) {} }
  var listeners = []; var connL = [];
  function parts(p) { return String(p == null ? '' : p).split('/').filter(Boolean); }
  function readAt(p) { var n = window.__DB, a = parts(p); for (var i = 0; i < a.length; i++) { if (n == null || typeof n !== 'object') return null; n = n[a[i]]; } return n === undefined ? null : n; }
  function put(a, v) {
    if (!a.length) { window.__DB = v || {}; return; }
    var n = window.__DB; for (var i = 0; i < a.length - 1; i++) { if (n[a[i]] == null || typeof n[a[i]] !== 'object') n[a[i]] = {}; n = n[a[i]]; }
    var k = a[a.length - 1]; if (v === null || v === undefined) delete n[k]; else n[k] = JSON.parse(JSON.stringify(v));
  }
  function apply(op, p, v) {
    var a = parts(p);
    if (op === 'update' && v && typeof v === 'object' && !Array.isArray(v)) { Object.keys(v).forEach(function (k) { put(a.concat(parts(k)), v[k]); }); }
    else put(a, op === 'remove' ? null : v);
    persist();
  }
  function snap(p) { var v = readAt(p); return { val: function () { return v == null ? null : JSON.parse(JSON.stringify(v)); }, exists: function () { return v != null; }, key: parts(p).pop() || null,
    forEach: function (cb) { if (v && typeof v === 'object') Object.keys(v).some(function (k) { return cb({ key: k, val: function () { return JSON.parse(JSON.stringify(v[k])); } }) === true; }); }, numChildren: function () { return v && typeof v === 'object' ? Object.keys(v).length : 0; } }; }
  window.__simErrs = window.__simErrs || [];
  function notify() { listeners.slice().forEach(function (l) { try { l.cb(snap(l.path)); } catch (e) { window.__simErrs.push('listener ' + l.path + ': ' + (e && e.message)); } }); }
  function write(op, p, v) {
    var entry = { seq: ++seq, op: op, path: parts(p).join('/'), value: v === undefined ? null : JSON.parse(JSON.stringify(v)), acked: !window.__simOffline, at: Date.now() };
    window.__simLog.push(entry); persistLog();
    apply(op, p, v); setTimeout(notify, 0);
    if (!window.__simOffline) return Promise.resolve();
    return new Promise(function (res) { pending.push({ entry: entry, res: res }); });
  }
  window.__simSetOffline = function (on) {
    window.__simOffline = !!on;
    try { if (on) localStorage.setItem('__simOffline', '1'); else localStorage.removeItem('__simOffline'); } catch (e) {}
    if (!on) { window.__simColdOffline = false; var p = pending; pending = []; p.forEach(function (x) { x.entry.acked = true; x.res(); }); persistLog(); setTimeout(notify, 0); }
    connL.forEach(function (cb) { try { cb({ val: function () { return !on; }, exists: function () { return true; } }); } catch (e) {} });
    return !!on;
  };
  // ANOTHER PHONE'S WRITE, arriving from the server.
  window.__simApply = function (op, p, v) { apply(op, p, v); notify(); return 'applied'; };
  window.__simPendingCount = function () { return pending.length; };
  function refFor(p) {
    var path = parts(p).join('/');
    var api = {
      key: parts(p).pop() || null,
      on: function (ev, cb) {
        if (typeof cb !== 'function') return cb;
        if (path === '.info/connected') { connL.push(cb); setTimeout(function () { cb({ val: function () { return !window.__simOffline; }, exists: function () { return true; } }); }, 0); return cb; }
        if (ev !== 'value') return cb;
        var l = { path: path, cb: cb }; listeners.push(l);
        var fire = function () { if (window.__simColdOffline) { setTimeout(fire, 300); return; } try { cb(snap(path)); } catch (e) { window.__simErrs.push('listener ' + path + ': ' + (e && e.message)); } };
        setTimeout(fire, 0);
        return cb;
      },
      off: function (ev, cb) { listeners = listeners.filter(function (l) { return !(l.path === path && (!cb || l.cb === cb)); }); },
      once: function () {
        if (path === '.info/connected') return Promise.resolve({ val: function () { return !window.__simOffline; }, exists: function () { return true; } });
        if (window.__simColdOffline) return new Promise(function (res) { var t = setInterval(function () { if (!window.__simColdOffline) { clearInterval(t); res(snap(path)); } }, 300); });
        return Promise.resolve(snap(path));
      },
      set: function (v) { return write('set', path, v); },
      update: function (v) { return write('update', path, v); },
      remove: function () { return write('remove', path, null); },
      transaction: function (fn) { var nv = fn(readAt(path)); return write('set', path, nv).then(function () { return { committed: true, snapshot: snap(path) }; }); },
      child: function (c) { return refFor(path + '/' + c); },
      push: function (v) { var k = '-SIM' + Date.now().toString(36) + (++seq); var c = refFor(path + '/' + k); if (v !== undefined) c.set(v); return c; },
      orderByChild: function () { return api; }, equalTo: function () { return api; }, limitToLast: function () { return api; }, limitToFirst: function () { return api; }, orderByKey: function () { return api; }
    };
    return api;
  }
  var AUTH_USER = ${JSON.stringify(user)};
  var AL = [];
  window.firebase = {
    initializeApp: function () { return {}; }, apps: [],
    database: function () { return { ref: refFor, goOffline: function () {}, goOnline: function () {} }; },
    auth: function () { return {
      get currentUser() { return AUTH_USER; },
      onAuthStateChanged: function (cb) { if (typeof cb === 'function') { AL.push(cb); setTimeout(function () { cb(AUTH_USER); }, 0); } return function () {}; },
      signInAnonymously: function () { if (!AUTH_USER) AUTH_USER = { uid: 'anon-cold', isAnonymous: true, email: null }; AL.forEach(function (cb) { try { cb(AUTH_USER); } catch (e) {} }); return Promise.resolve({ user: AUTH_USER }); },
      signInWithEmailAndPassword: function () { return Promise.reject(new Error('sim: no email sign-in')); },
      signOut: function () { AUTH_USER = null; return Promise.resolve(); }
    }; }
  };
  if (AUTH_USER && !AUTH_USER.getIdToken) AUTH_USER.getIdToken = function () { return Promise.resolve('sim-token'); };
  // Native dialogs block the renderer: recorded and answered "OK" / cancel.
  window.__DIALOGS = [];
  window.alert = function (m) { window.__DIALOGS.push({ type: 'alert', message: String(m) }); };
  window.confirm = function (m) { window.__DIALOGS.push({ type: 'confirm', message: String(m) }); return true; };
  window.prompt = function (m) { window.__DIALOGS.push({ type: 'prompt', message: String(m) }); return null; };
  // Console errors and uncaught throws: every one is a finding.
  window.__simErrs = window.__simErrs || [];
  var ce = console.error; console.error = function () { try { window.__simErrs.push('console.error ' + Array.prototype.map.call(arguments, function (x) { return x && x.stack ? String(x.message) : String(x); }).join(' ').slice(0, 300)); } catch (e) {} return ce.apply(console, arguments); };
  addEventListener('error', function (e) { window.__simErrs.push('error ' + String(e.message) + ' @' + String(e.filename || '').split('/').pop() + ':' + e.lineno); });
  addEventListener('unhandledrejection', function (e) { window.__simErrs.push('unhandledrejection ' + String(e.reason && e.reason.message || e.reason).slice(0, 200)); });
})();`;
}

function rpc(ws, id, method, params) {
    return new Promise((res, rej) => {
        const timer = setTimeout(() => rej(new Error('CDP timeout on ' + method)), 40000);
        const h = (ev) => { const m = JSON.parse(ev.data); if (m.id === id) { clearTimeout(timer); ws.removeEventListener('message', h); res(m); } };
        ws.addEventListener('message', h);
        ws.send(JSON.stringify({ id, method, params }));
    });
}
function readPort(profile) {
    const file = path.join(profile, 'DevToolsActivePort'), until = Date.now() + 20000;
    return new Promise((res, rej) => (function poll() {
        try { const raw = fs.readFileSync(file, 'utf8').split('\n')[0].trim(); if (/^\d+$/.test(raw)) return res(Number(raw)); } catch (e) {}
        if (Date.now() > until) return rej(new Error('Chrome never wrote DevToolsActivePort'));
        setTimeout(poll, 100);
    })());
}

class Server {
    constructor(db) { this.db = JSON.parse(JSON.stringify(db)); }
    read(p) { return readPath(this.db, p); }
}

class Phone {
    // o: { name, server, profileDir (kept between launches = the same phone), viewport, preScript, webgl, auth, shotDir, url }
    static async launch(o) {
        const p = new Phone(o);
        await p._start();
        if (o.url) await p.goto(o.url, o.settleMs);
        return p;
    }
    constructor(o) {
        this.o = o; this.name = o.name || 'phone'; this.server = o.server;
        this.profile = o.profileDir || fs.mkdtempSync(path.join(os.tmpdir(), 'sim-phone-'));
        fs.mkdirSync(this.profile, { recursive: true });
        this.taps = 0; this.screens = 0; this.shots = []; this.errs = []; this.dialogs = []; this.lastScreen = null; this.logSeen = 0; this.id = 1;
        this.shotDir = o.shotDir || null; this.shotN = o.shotN || 0; this.taps = o.taps || 0; this.screens = o.screens || 0;
    }
    async _start() {
        this.logSeen = 0;
        ['DevToolsActivePort', 'SingletonLock', 'SingletonSocket', 'SingletonCookie'].forEach((f) => { try { fs.rmSync(path.join(this.profile, f), { force: true, recursive: true }); } catch (e) {} });
        const gpu = this.o.webgl ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--disable-gpu'];
        this.chrome = spawn(CHROME, ['--headless=new', ...gpu, '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=' + this.profile, '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
        this.tracked = registry.track(this.chrome, this.profile);
        const port = await readPort(this.profile);
        let targets = null;
        for (let i = 0; i < 80 && !(targets && targets.length); i++) {
            await sleep(250);
            try { targets = (await (await fetch('http://127.0.0.1:' + port + '/json')).json()).filter((t) => t.type === 'page'); } catch (e) {}
        }
        if (!targets || !targets.length) throw new Error('Chrome exposed no page target');
        // A profile that closed cleanly can come back with its old tab as well: drive the
        // fresh about:blank one, bring it to the front, and close the rest (a background tab
        // never paints, so a screenshot of it waits forever).
        const mine = targets.find((t) => t.url === 'about:blank') || targets[0];
        for (const t of targets) { if (t !== mine) { try { await fetch('http://127.0.0.1:' + port + '/json/close/' + t.id); } catch (e) {} } }
        try { await fetch('http://127.0.0.1:' + port + '/json/activate/' + mine.id); } catch (e) {}
        this.ws = new WebSocket(mine.webSocketDebuggerUrl);
        await new Promise((res, rej) => { this.ws.addEventListener('open', res, { once: true }); this.ws.addEventListener('error', () => rej(new Error('CDP socket error')), { once: true }); });
        this.ws.addEventListener('message', (ev) => {
            let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
            if (m.method === 'Page.javascriptDialogOpening') { this.dialogs.push(m.params.message); this.ws.send(JSON.stringify({ id: 990000 + this.dialogs.length, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); }
            if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; this.errs.push('exception ' + ((d.exception && d.exception.description) || d.text || '').split('\n')[0]); }
        });
        await this.cdp('Page.enable'); await this.cdp('Network.enable'); await this.cdp('Runtime.enable');
        const v = this.o.viewport || { width: 393, height: 852 };
        await this.cdp('Emulation.setDeviceMetricsOverride', { width: v.width, height: v.height, deviceScaleFactor: 2, mobile: true });
        await this.cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
        await this.cdp('Network.setBlockedURLs', { urls: ['*firebase-app-compat.js', '*firebase-database-compat.js', '*firebase-auth-compat.js',
            '*firebaseio.com*', '*firebasedatabase.app*', '*cloudfunctions.net*', '*googleapis.com*', '*arcgisonline.com*', '*arcgis.com*'] });
        if (this._offline) await this.cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
        await this._inject();
    }
    async _inject() {
        if (this.injected) { for (const id of this.injected) await this.cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: id }); }
        this.injected = [];
        const a = await this.cdp('Page.addScriptToEvaluateOnNewDocument', { source: stub(JSON.stringify(this.server.db), this.o.auth) });
        this.injected.push(a.result.identifier);
        if (this.o.preScript) { const b = await this.cdp('Page.addScriptToEvaluateOnNewDocument', { source: this.o.preScript }); this.injected.push(b.result.identifier); }
    }
    async cdp(method, params) { return rpc(this.ws, this.id++, method, params || {}); }
    async eval(expr) {
        const m = await this.cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
        if (m.result && m.result.exceptionDetails) throw new Error('page threw: ' + ((m.result.exceptionDetails.exception || {}).description || m.result.exceptionDetails.text));
        return m.result && m.result.result ? m.result.result.value : undefined;
    }
    async json(expr) { const v = await this.eval('JSON.stringify(' + expr + ')'); return v ? JSON.parse(v) : null; }
    // Server -> this phone: a fresh seed for the next document.
    async goto(url, settleMs) {
        await this.sync();
        await this._inject();
        try { await this.eval("sessionStorage.removeItem('__sim_db')"); } catch (e) {}
        await this.cdp('Page.navigate', { url });
        await sleep(settleMs || 2500);
        await this.collect();
        return this;
    }
    async url() { return this.eval('document.URL'); }
    // This phone -> server: every acked write not yet replayed.
    async sync() {
        let log;
        try { log = await this.json('(window.__simLog||[]).filter(function(e){return e.acked;})'); } catch (e) { return 0; }
        if (!log) return 0;
        // The log lives in the tab (sessionStorage), so it survives the page's own
        // navigations; a relaunch starts a new tab and _start resets logSeen.
        const fresh = log.filter((e) => e.seq > this.logSeen);
        fresh.forEach((e) => applyWrite(this.server.db, e.op, e.path, e.value));
        if (fresh.length) this.logSeen = fresh[fresh.length - 1].seq;
        (this.writes = this.writes || []).push(...fresh);
        return fresh.length;
    }
    // Server -> an open page: another phone's writes arriving on its listeners.
    async deliver(pathStr) {
        return this.eval('window.__simApply(' + JSON.stringify('set') + ',' + JSON.stringify(pathStr) + ',' + JSON.stringify(readPath(this.server.db, pathStr)) + ')');
    }
    async collect() {
        try {
            const e = await this.json('(function(){var x=(window.__simErrs||[]).slice(); window.__simErrs=[]; var d=(window.__DIALOGS||[]).slice(); window.__DIALOGS=[]; return {e:x,d:d};})()');
            if (e) { e.e.forEach((x) => this.errs.push(x)); e.d.forEach((x) => this.dialogs.push(x.type + ': ' + x.message)); }
        } catch (err) {}
        return { errs: this.errs, dialogs: this.dialogs };
    }
    // A REAL TAP. target: a CSS selector, or { sel, text: RegExp|string, nth } - the first
    // VISIBLE element matching sel whose text matches.
    async find(target) {
        const t = typeof target === 'string' ? { sel: target } : target;
        const re = t.text ? (t.text instanceof RegExp ? t.text : new RegExp(String(t.text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))) : null;
        const expr = `(function(){ var re = ${re ? re.toString() : 'null'}; var els = Array.prototype.slice.call(document.querySelectorAll(${JSON.stringify(t.sel || 'button, a, [role=button], [onclick]')}));
            var vis = els.filter(function (e) { var r = e.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) return false; var s = getComputedStyle(e); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false; return !re || re.test((e.innerText || e.value || e.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim()); });
            var el = vis[${t.nth || 0}]; if (!el) return null; window.__simTarget = el; el.scrollIntoView({ block: 'center' }); return (el.innerText || el.value || el.getAttribute('aria-label') || el.tagName).replace(/\\s+/g, ' ').trim().slice(0, 60); })()`;
        return this.eval(expr);
    }
    async tap(target, o) {
        const label = await this.find(target);
        if (label == null) { return null; }
        await sleep(150);
        const pt = await this.json("(function(){ var r = window.__simTarget.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()");
        // What a finger at that point actually lands on (a sheet over the button is a finding).
        const hit = await this.eval(`(function(){ var h = document.elementFromPoint(${pt.x}, ${pt.y}); return !!(h && (h === window.__simTarget || window.__simTarget.contains(h) || h.contains(window.__simTarget))); })()`);
        for (const type of ['mousePressed', 'mouseReleased']) await this.cdp('Input.dispatchMouseEvent', { type, x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
        this.taps++;
        (this.tapLog = this.tapLog || []).push(label + (hit ? '' : ' [COVERED]'));
        await sleep((o && o.settle) || 500);
        return hit ? label : label + ' [COVERED]';
    }
    // Typing: a real tap to focus, select all, then the text as one insert (a paste).
    async type(target, text, o) {
        const label = await this.tap(target, { settle: 150 });
        if (label == null) return null;
        await this.eval("(function(){ var a = document.activeElement; if (a && a.select) a.select(); return 1; })()");
        await this.cdp('Input.insertText', { text: String(text) });
        if (o && o.enter) { for (const type of ['keyDown', 'keyUp']) await this.cdp('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); }
        await sleep((o && o.settle) || 400);
        return label;
    }
    async select(sel, value) {
        // A <select> is a native picker: a tap opens it, the choice is one more tap.
        this.taps += 2;
        (this.tapLog = this.tapLog || []).push('select ' + sel + ' = ' + value + ' (2 taps)');
        return this.eval(`(function(){ var s = document.querySelector(${JSON.stringify(sel)}); if (!s) return null; s.value = ${JSON.stringify(String(value))}; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; })()`);
    }
    async text(sel) { return this.eval(`(function(){ var e = document.querySelector(${JSON.stringify(sel || 'body')}); return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; })()`); }
    async visibleText() {
        return this.eval("(function(){ var out = []; var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); var n; while ((n = w.nextNode())) { var t = n.nodeValue.replace(/\\s+/g, ' ').trim(); if (!t) continue; var el = n.parentElement; if (!el) continue; var r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight || r.width === 0) continue; var s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none') continue; out.push(t); } return out.join(' | ').slice(0, 3000); })()");
    }
    async waitFor(expr, ms) {
        const until = Date.now() + (ms || 15000);
        while (Date.now() < until) { try { if (await this.eval(expr)) return true; } catch (e) {} await sleep(250); }
        return false;
    }
    async shot(name) {
        await this.collect();
        const screen = await this.eval("document.URL.replace(/^.*\\//, '') + ' ' + ((document.querySelector('.hp-view.on')||{}).id||'') + ' ' + (typeof currentWizardStep !== 'undefined' ? currentWizardStep : '') + ' ' + document.body.className").catch(() => '');
        if (screen !== this.lastScreen) { this.screens++; this.lastScreen = screen; }
        if (!this.shotDir) return null;
        fs.mkdirSync(this.shotDir, { recursive: true });
        let r = null;
        for (let i = 0; i < 2 && !(r && r.result && r.result.data); i++) {
            try { r = await this.cdp('Page.captureScreenshot', { format: 'png' }); }
            catch (e) { r = null; try { await this.cdp('Page.bringToFront'); } catch (x) {} await sleep(1000); }
        }
        if (!(r && r.result && r.result.data)) { this.errs.push('sim: no screenshot for ' + name); return null; }
        const file = path.join(this.shotDir, String(++this.shotN).padStart(2, '0') + '-' + name + '.png');
        if (r.result && r.result.data) fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
        this.shots.push(file);
        return file;
    }
    async offline(on) {
        this._offline = !!on;
        await this.cdp('Network.emulateNetworkConditions', { offline: !!on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
        try { await this.eval('window.__simSetOffline(' + (!!on) + ')'); } catch (e) {}
        if (!on) await sleep(600);
        return on;
    }
    // THE APP KILLED: acked writes reach the server, the rest are gone with the process.
    // A SWIPE-UP KILL IS NOT A POWER CUT: the app goes to the background first (the page
    // hears visibilitychange -> hidden, WebKit writes localStorage down), then the process
    // ends. So: hidden, a beat, then Chrome closed GRACEFULLY (Browser.close) - a SIGKILL
    // here lost the last localStorage writes, which is a harness fault, not the app's.
    async kill() {
        await this.collect();
        await this.sync();
        try { await this.eval("(function(){ try { Object.defineProperty(document, 'visibilityState', { configurable: true, get: function () { return 'hidden'; } }); Object.defineProperty(document, 'hidden', { configurable: true, get: function () { return true; } }); } catch (e) {} document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); return 1; })()"); } catch (e) {}
        await sleep(400);
        const exited = new Promise((r) => { if (this.chrome.exitCode !== null) r(); else this.chrome.once('exit', r); });
        try { this.ws.send(JSON.stringify({ id: this.id++, method: 'Browser.close', params: {} })); } catch (e) {}
        await Promise.race([exited, sleep(5000)]);
        try { this.ws.close(); } catch (e) {}
        registry.release(this.tracked);
        if (this.chrome.exitCode === null) this.chrome.kill('SIGTERM');
        await sleep(500);
    }
    // ...and opened again from the home screen icon: the app's own start page.
    async reopen(url, settleMs) {
        if (!this.chrome || this.chrome.exitCode !== null || this.chrome.signalCode) await this._start();
        // A loaded machine can leave the relaunched browser's first tab unresponsive: one
        // more relaunch (the same profile - the same phone), never a silent pass.
        try { await this.cdp('Page.navigate', { url: url || fileUrl('index.html') }); }
        catch (e) {
            try { this.ws.close(); } catch (x) {}
            registry.release(this.tracked);
            if (this.chrome.exitCode === null) { const gone = new Promise((r) => this.chrome.once('exit', r)); this.chrome.kill('SIGTERM'); await Promise.race([gone, sleep(5000)]); }
            await this._start();
            await this.cdp('Page.navigate', { url: url || fileUrl('index.html') });
        }
        await sleep(settleMs || 3500);
        await this.collect();
        return this;
    }
    async close() { await this.kill(); if (!this.o.profileDir) { try { fs.rmSync(this.profile, { recursive: true, force: true }); } catch (e) {} } }
}

module.exports = { Phone, Server, fileUrl, applyWrite, readPath, REPO_ROOT, sleep };
