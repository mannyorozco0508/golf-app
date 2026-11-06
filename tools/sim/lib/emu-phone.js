// ============================================================================
// A PHONE ON THE RTDB EMULATOR (web chat, ADVISOR-1727). Test-only; /tools/* answers 404 on the site.
//
// Phone (phone.js) is real Chrome + a stand-in Firebase that enforces nothing. EmuPhone is the same real Chrome, real
// taps and real pages, but with THE REAL database SDK talking over a socket to a local RTDB emulator running the real
// rules - so what a page writes is accepted or refused by the rules themselves, and a second phone receives it the way
// a phone does. Only the auth SDK is stood in: a mock token carries the uid and sign_in_provider the rules read.
//
// NOTHING CAN REACH THE LIVE DATABASE: the config is rewritten at firebase.initializeApp, every firebase / google URL is
// blocked over CDP, and a WebSocket / fetch to anywhere but 127.0.0.1 throws and is counted (window.__netEscapes).
// ============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { Phone } = require('./phone.js');

const JAR = path.join(os.homedir(), '.cache', 'firebase', 'emulators', 'firebase-database-emulator-v4.11.2.jar');
const JAVA = [process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, 'bin', 'java'), path.join(os.homedir(), 'jdks', 'jdk-21.0.12.1+1', 'Contents', 'Home', 'bin', 'java'), '/usr/bin/java']
    .filter(Boolean).find((p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emuRules = (s) => JSON.stringify(JSON.parse(s)).replace(/\[\^@\\\\s\]/g, '[^@ ]');   // the emulator cannot parse one e-mail regex in events/

class Emulator {
    constructor(port, ns) { this.port = port; this.ns = ns; this.base = 'http://127.0.0.1:' + port; }
    static available() { return !!JAVA && fs.existsSync(JAR); }
    async start(rulesFile) {
        this.proc = spawn(JAVA, ['-jar', JAR, '--port', String(this.port)], { stdio: 'ignore' });
        for (let i = 0; i < 60; i++) { try { await fetch(this.base + '/.json?ns=' + this.ns); break; } catch (e) { await sleep(500); } }
        const r = await fetch(this.base + '/.settings/rules.json?ns=' + this.ns, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: emuRules(fs.readFileSync(rulesFile, 'utf8')) }).then((x) => x.json());
        if (r.status !== 'ok') throw new Error('rules refused: ' + JSON.stringify(r));
    }
    stop() { if (this.proc) this.proc.kill('SIGKILL'); }
    admin(p, method, body) { return fetch(this.base + '/' + p + '.json?ns=' + this.ns, { method: method || 'GET', headers: { Authorization: 'Bearer owner' }, body: body === undefined ? undefined : JSON.stringify(body) }).then((r) => r.json()); }
    read(p) { return this.admin(p); }
    write(p, v) { return this.admin(p, 'PUT', v); }
}

function pre(o) {
    const u = Object.assign({ uid: 'anon-cold', isAnonymous: true, email: null }, o.auth || {});
    const provider = u.isAnonymous ? 'anonymous' : ((u.providerData && u.providerData[0] && u.providerData[0].providerId) || 'apple.com');
    return `(function () {
  var PORT = ${o.emu.port}, NS = ${JSON.stringify(o.emu.ns)}, USER = ${JSON.stringify(u)};
  USER.getIdToken = function () { return Promise.resolve('emu-token'); };
  window.__netEscapes = []; window.__dbDenied = []; window.__simErrs = [];
  var okHost = function (url) { try { var h = new URL(String(url), location.href); return h.protocol === 'file:' || h.hostname === '127.0.0.1'; } catch (e) { return false; } };
  var WS = window.WebSocket;
  window.WebSocket = function (url, p) { if (!okHost(url)) { window.__netEscapes.push(String(url)); throw new Error('emu: off-machine socket'); } return p ? new WS(url, p) : new WS(url); };
  window.WebSocket.prototype = WS.prototype; ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k) { window.WebSocket[k] = WS[k]; });
  var F = window.fetch; window.fetch = function (x, y) { var url = x && x.url ? x.url : x; if (!okHost(url)) { window.__netEscapes.push(String(url)); return Promise.reject(new Error('emu: off-machine fetch')); } return F.call(window, x, y); };
  var AL = [];
  var authStub = { get currentUser() { return USER; },
    onAuthStateChanged: function (cb) { if (typeof cb === 'function') { AL.push(cb); setTimeout(function () { cb(USER); }, 0); } return function () {}; },
    signInAnonymously: function () { return Promise.resolve({ user: USER }); },
    signInWithEmailAndPassword: function () { return Promise.reject(new Error('emu: no email sign-in')); }, signOut: function () { return Promise.resolve(); } };
  var fbv, done = false;
  function patch(v) {
    if (!v || done || typeof v.initializeApp !== 'function') return;
    done = true;
    v.auth = function () { return authStub; };
    var init = v.initializeApp;
    v.initializeApp = function (cfg, name) {
      { window.__L = []; v.database.enableLogging(function (m) { window.__L.push(Math.round(performance.now()) + ' ' + String(m).slice(0, 130)); }); }
      var app = init.call(v, Object.assign({}, cfg, { databaseURL: 'http://127.0.0.1:' + PORT + '?ns=' + NS, projectId: NS, apiKey: 'emu' }), name);
      v.database(app).useEmulator('127.0.0.1', PORT, { mockUserToken: { sub: USER.uid, firebase: { sign_in_provider: ${JSON.stringify(provider)} } } });
      return app;
    };
  }
  Object.defineProperty(window, 'firebase', { configurable: true, get: function () { return fbv; }, set: function (v) { fbv = v; patch(v); } });
  window.alert = function () {}; window.confirm = function () { return true; }; window.prompt = function () { return null; };
  var ce = console.error; console.error = function () { try { window.__simErrs.push('console.error ' + Array.prototype.map.call(arguments, String).join(' ').slice(0, 300)); } catch (e) {} return ce.apply(console, arguments); };
  addEventListener('error', function (e) { if (e && e.message) window.__simErrs.push('error ' + e.message + ' @' + String(e.filename || '').split('/').pop() + ':' + e.lineno); });
  addEventListener('unhandledrejection', function (e) { window.__simErrs.push('unhandledrejection ' + String(e.reason && e.reason.message || e.reason).slice(0, 200)); });
})();`;
}

class EmuPhone extends Phone {
    static async launch(o) { const p = new EmuPhone(o); await p._start(); if (o.url) await p.goto(o.url, o.settleMs); return p; }
    constructor(o) { super(Object.assign({ server: { db: {} } }, o)); }
    async _inject() {
        await this.cdp('Network.setBlockedURLs', { urls: ['*firebase-auth-compat.js', '*firebaseio.com*', '*firebasedatabase.app*', '*cloudfunctions.net*', '*googleapis.com*', '*arcgisonline.com*', '*arcgis.com*'] });
        if (this.injected) { for (const id of this.injected) await this.cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: id }); }
        this.injected = [];
        const a = await this.cdp('Page.addScriptToEvaluateOnNewDocument', { source: pre(this.o) });
        this.injected.push(a.result.identifier);
        if (this.o.preScript) { const b = await this.cdp('Page.addScriptToEvaluateOnNewDocument', { source: this.o.preScript }); this.injected.push(b.result.identifier); }
    }
    async sync() { return 0; }   // the emulator is the server: nothing to replay
    async goto(url, settleMs) {
        await this._inject(); await this.cdp('Page.navigate', { url }); await sleep(settleMs || 2500);
        const up = await this.waitFor("Promise.race([firebase.database().ref('.info/connected').once('value').then(function (s) { return s.val(); }), new Promise(function (r) { setTimeout(function () { r(false); }, 500); })])", 25000);
        if (!up) console.log('# ' + this.name + ': no database connection. SDK log:\n' + ((await this.json('window.__L')) || []).filter((l) => !/connected:value/.test(l)).slice(0, 24).join('\n'));
        await this.collect(); return this;
    }
    async collect() {
        try { const e = await this.json('(function(){var x=(window.__simErrs||[]).slice(); window.__simErrs=[]; return x;})()'); if (e) e.forEach((x) => this.errs.push(x)); } catch (err) {}
        return { errs: this.errs, dialogs: this.dialogs };
    }
    netEscapes() { return this.json('window.__netEscapes || []'); }
}

// A read-only export of a commit, for phones on older code (never a checkout of this tree). Cached by sha.
function exportTree(repo, ref, dir) {
    const sha = execFileSync('git', ['-C', repo, 'rev-parse', '--short=10', ref], { encoding: 'utf8' }).trim();
    const out = path.join(dir, 'tree-' + sha);
    if (fs.existsSync(path.join(out, 'index.html'))) return out;
    fs.mkdirSync(out, { recursive: true });
    execFileSync('/bin/sh', ['-c', 'git -C "$1" archive "$2" -- . ":!ios" ":!android" ":!*_test.js" ":!*.fixture.json" | tar -x -C "$3"', 'sh', repo, ref, out], { stdio: 'ignore', maxBuffer: 1 << 30 });
    return out;
}

module.exports = { Emulator, EmuPhone, exportTree, sleep };
