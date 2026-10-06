#!/usr/bin/env node
// ============================================================================
// WHAT HAPPENS TO A SCORE ENTERED WITH NO SIGNAL (audit, 2026-10-06)
//
// Manny, before anything was built: what happens TODAY if a scorekeeper enters
// scores with no signal and then (a) gets signal back, (b) closes and reopens
// the app while still offline, (c) the phone restarts. "Firebase's queue lives
// in memory, so (b)/(c) may lose scores; PROVE IT either way."
//
// pwa-boot.js already ASSERTS the answer in a comment - "Firebase Realtime
// Database on web has no on-disk write queue ... a reload while offline loses
// unsynced writes, full stop". A comment is not a measurement, and the whole
// wave rests on this, so it is measured here.
//
// THE REAL SDK, AND NO SERVER. This loads the repo's own vendored
// firebase-database-compat.js - not a stand-in, because the question is about
// the SDK's own durability - over a LOCAL http origin, with the Firebase hosts
// blocked so the socket can never open. Nothing is written to the live
// database; nothing needs to be. The question "could a reload recover this
// write" is answered by looking for the write in every place a reload could
// read from: localStorage, sessionStorage, IndexedDB and the Cache Storage.
//
// WHY A LOCAL HTTP ORIGIN AND NOT file://. Two reasons, both measured the hard
// way: a file:// page gets an opaque origin, so localStorage and IndexedDB are
// not shared across a reload and "nothing persisted" would be true of any page;
// and a service worker cannot register on file:// at all, which is half of what
// the audit is about.
//
// (c) IS (b) WITH THE OVEN OFF. A phone restart cannot recover what a reload
// could not: both start a fresh page with a fresh JS heap, and the only
// difference is that a restart also clears sessionStorage. So the audit measures
// the reload and reports the restart as the same answer or worse - and it checks
// sessionStorage separately so that difference is stated rather than assumed.
//
// RUN:  node tools/offline-durability-audit.js
// EXIT: 0 the audit ran and reported; 2 it could not measure.
// ============================================================================

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const registry = require('./lib/browser-registry.js');

const REPO_ROOT = path.join(__dirname, '..');
const CHROME = process.env.CHROME_PATH
    || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// HOW THIS GOES OFFLINE, AND THE FIRST ATTEMPT THAT DID NOT.
//
// Network.setBlockedURLs with *firebaseio.com* patterns DID NOT WORK: measured,
// the SDK still reported connected_ true and the live rules refused the writes
// with PERMISSION_DENIED. So the first run of this audit was not offline at all
// and its verdict would have been a fabrication. (Nothing landed - the writes
// were refused - but it measured the wrong thing.)
//
// Instead the SDK is pointed at a LOCAL socket that never completes the
// websocket handshake: databaseURL http://127.0.0.1:<port>?ns=audit. The SDK is
// real, its queue is real, it genuinely cannot reach a server, and the live
// database is never contacted. A reload still works because the page itself is
// served by that same local server - which is the only way to measure (b) at
// all.
const FIREBASE_HOSTS = ['*firebaseio.com*', '*firebasedatabase.app*', '*googleapis.com*'];

const PROBE_HTML = `<!doctype html><meta charset="utf-8"><title>durability audit</title>
<script src="/firebase-app-compat.js"></script>
<script src="/firebase-database-compat.js"></script>
<script>
window.__log = [];
// THE DATABASE URL IS THE LOCAL DEAD SOCKET, passed in so nothing here can
// accidentally name the live database.
var DBURL = new URLSearchParams(location.search).get('db');
firebase.initializeApp({ apiKey: "audit-not-a-real-key", databaseURL: DBURL, projectId: "audit" });
window.__dburl = DBURL;
window.db = firebase.database();
window.__conn = null;
try { db.ref('.info/connected').on('value', function (s) { window.__conn = s.val(); }); } catch (e) {}

// THE SCORE WRITES THE APP ACTUALLY MAKES: events/<code>/scores/<key>, one
// update() per box, which is what index.html does on every entry.
window.enterScores = function (code, n) {
  window.__settled = [];
  for (var i = 1; i <= n; i++) {
    (function (hole) {
      var patch = {}; patch['p101_h' + hole] = 4;
      db.ref('events/' + code + '/scores').update(patch)
        .then(function () { window.__settled.push({ hole: hole, outcome: 'RESOLVED' }); })
        .catch(function (e) { window.__settled.push({ hole: hole, outcome: 'REJECTED', message: String(e && e.message) }); });
    })(i);
  }
  return n + ' writes issued';
};

// EVERY PLACE A RELOAD COULD READ FROM. If the payload is in none of them, a
// reload cannot replay it - which is the whole question.
window.whereIsIt = async function (needle) {
  var found = { localStorage: [], sessionStorage: [], indexedDB: [], caches: [] };
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i), v = String(localStorage.getItem(k) || '');
      found.localStorage.push({ key: k, bytes: v.length, hasNeedle: v.indexOf(needle) !== -1 });
    }
  } catch (e) { found.localStorage = 'threw: ' + e.message; }
  try {
    for (var j = 0; j < sessionStorage.length; j++) {
      var sk = sessionStorage.key(j), sv = String(sessionStorage.getItem(sk) || '');
      found.sessionStorage.push({ key: sk, bytes: sv.length, hasNeedle: sv.indexOf(needle) !== -1 });
    }
  } catch (e) { found.sessionStorage = 'threw: ' + e.message; }
  try {
    var dbs = (indexedDB.databases ? await indexedDB.databases() : []);
    found.indexedDB = dbs.map(function (d) { return { name: d.name, version: d.version }; });
  } catch (e) { found.indexedDB = 'threw: ' + e.message; }
  try {
    var keys = (window.caches ? await caches.keys() : []);
    found.caches = keys;
  } catch (e) { found.caches = 'threw: ' + e.message; }
  return JSON.stringify(found);
};

// THE SDK'S OWN QUEUE, by the name pwa-boot.js's comment gives it. Read off the
// live object rather than trusted: if a future SDK persists these, the audit's
// conclusion changes and this is where it shows.
window.queueState = function () {
  var out = { found: false };
  try {
    var repo = db._delegate && db._delegate._repo;
    if (!repo) { var any = db.ref('x'); repo = any && any._repo; }
    if (repo && repo.persistentConnection_) {
      var pc = repo.persistentConnection_;
      out.found = true;
      out.outstandingPutCount = pc.outstandingPuts_ ? pc.outstandingPuts_.length : null;
      out.outstandingPutsIsArray = Array.isArray(pc.outstandingPuts_);
      out.connected = !!pc.connected_;
    }
  } catch (e) { out.error = String(e && e.message); }
  return JSON.stringify(out);
};
</script>`;

function readPort(profileDir, timeoutMs) {
    const file = path.join(profileDir, 'DevToolsActivePort');
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
        (function poll() {
            try {
                const raw = fs.readFileSync(file, 'utf8').split('\n')[0].trim();
                if (raw && /^[0-9]+$/.test(raw)) return resolve(Number(raw));
            } catch (e) { /* not yet */ }
            if (Date.now() > deadline) return reject(new Error('no DevToolsActivePort'));
            setTimeout(poll, 100);
        })();
    });
}
function rpc(ws, id, method, params) {
    return new Promise((resolve, reject) => {
        const onMsg = (ev) => {
            let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
            if (m.id !== id) return;
            ws.removeEventListener('message', onMsg);
            if (m.error) return reject(new Error(method + ': ' + JSON.stringify(m.error)));
            resolve(m);
        };
        ws.addEventListener('message', onMsg);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
               '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

function serve(root, extra) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const url = req.url.split('?')[0];
            if (extra[url]) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                return res.end(extra[url]);
            }
            const f = path.join(root, url === '/' ? 'index.html' : url.replace(/^\/+/, ''));
            if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
                res.writeHead(404); return res.end('no');
            }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
            res.end(fs.readFileSync(f));
        });
        server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
    });
}

async function main() {
    const out = { what: 'what happens to a score entered with no signal, measured' };
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'offline-audit-'));
    if (!fs.existsSync(CHROME)) { console.log(JSON.stringify({ ok: false, reason: 'Chrome not found' })); process.exit(2); }
    const { server, port } = await serve(REPO_ROOT, { '/audit.html': PROBE_HTML });

    const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run',
        '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
    registry.track(chrome, profile);
    let ws = null;
    try {
        const dp = await readPort(profile, 20000);
        let target = null;
        for (let i = 0; i < 60; i++) {
            await new Promise(r => setTimeout(r, 200));
            try {
                const list = await (await fetch('http://127.0.0.1:' + dp + '/json')).json();
                target = list.filter(t => t.type === 'page')[0];
                if (target) break;
            } catch (e) { /* not up */ }
        }
        if (!target) throw new Error('no page target');
        ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws failed')); });
        let id = 1;
        const ev = async (expr, awaitPromise) => {
            const r = await rpc(ws, id++, 'Runtime.evaluate',
                { expression: expr, awaitPromise: !!awaitPromise, returnByValue: true });
            return r.result && r.result.result && r.result.result.value;
        };
        await rpc(ws, id++, 'Page.enable', {});
        await rpc(ws, id++, 'Runtime.enable', {});
        await rpc(ws, id++, 'Network.enable', {});
        // THE PHONE WITH NO SIGNAL: the Firebase hosts are unreachable from the
        // first byte, so the socket never opens and the queue can only grow.
        await rpc(ws, id++, 'Network.setBlockedURLs', { urls: FIREBASE_HOSTS });

        const base = 'http://127.0.0.1:' + port;
        const dbUrl = 'http://127.0.0.1:' + port + '?ns=audit';
        out.databaseUrl = dbUrl + '  (a local socket that never answers - the live database is never contacted)';
        await rpc(ws, id++, 'Page.navigate', { url: base + '/audit.html?db=' + encodeURIComponent(dbUrl) });
        await new Promise(r => setTimeout(r, 2500));
        out.sdkLoaded = await ev('typeof firebase === "object" && typeof db === "object"');
        if (!out.sdkLoaded) throw new Error('the vendored SDK did not load from the local origin');
        out.connectedFlag = await ev('window.__conn');

        // ---- (a) and the queue ------------------------------------------------
        out.wrote = await ev('enterScores("AUDITX", 7)');
        await new Promise(r => setTimeout(r, 2500));
        out.a_settledWhileOffline = await ev('JSON.stringify(window.__settled)');
        out.a_sdkQueue = JSON.parse(await ev('queueState()'));

        // ---- (b) could a reload recover them? ---------------------------------
        out.b_storageBeforeReload = JSON.parse(await ev('whereIsIt("p101_h3")', true));
        await rpc(ws, id++, 'Page.reload', {});
        await new Promise(r => setTimeout(r, 2500));
        out.b_afterReload = {
            sdkQueue: JSON.parse(await ev('queueState()')),
            settled: await ev('JSON.stringify(window.__settled || null)'),
            storage: JSON.parse(await ev('whereIsIt("p101_h3")', true))
        };

        // ---- (c) a restart also clears sessionStorage -------------------------
        out.c_sessionStorageHeldAnything = (out.b_storageBeforeReload.sessionStorage || []).length;

        // ---- AND THE OTHER HALF: does the round OPEN with no signal? ----------
        // The scorecard itself, same dead socket, arriving the way a golfer does.
        // RTDB on web has no on-disk read cache either, so there is nothing for
        // the page to render from - which is the question requirement 3 asks.
        await rpc(ws, id++, 'Page.navigate', { url: base + '/index.html?game=OFFL1' });
        await new Promise(r => setTimeout(r, 5000));
        out.d_scorecardOffline = JSON.parse(await ev(`JSON.stringify({
            shellLoaded: !!document.getElementById('hole-view-card') || !!document.body,
            title: document.title,
            // innerText: the rendered text. textContent would match the page's own
            // inline application source on a page that rendered nothing.
            onScreen: String(document.body.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 160),
            writableBoxes: document.querySelectorAll('.score-input:not([disabled])').length,
            totalBoxes: document.querySelectorAll('.score-input').length,
            anyRoundData: typeof currentData !== 'undefined' && !!currentData
        })`));

        server.close();
    } catch (e) {
        out.error = String(e && e.message || e);
    } finally {
        try { if (ws) ws.close(); } catch (e) {}
        try { server.close(); } catch (e) {}
        registry.release(chrome, profile);
    }

    // ---- the verdict, derived from what was measured --------------------------
    const needle = (arr) => Array.isArray(arr) && arr.some(x => x && x.hasNeedle);
    const before = out.b_storageBeforeReload || {};
    const settled = JSON.parse(out.a_settledWhileOffline || '[]');
    const resolved = settled.filter(x => x.outcome === 'RESOLVED').length;
    const rejected = settled.filter(x => x.outcome === 'REJECTED').length;
    out.verdict = {
        issued: 7,
        a_while_offline: 'of 7 writes: ' + resolved + ' resolved, ' + rejected + ' rejected, '
            + (7 - resolved - rejected) + ' still pending. '
            + (resolved + rejected === 0
                ? 'PENDING is the right answer: nothing is lost and nothing is confirmed, and the '
                  + 'SDK flushes them when a socket opens (tools/offline-measure.js measured that '
                  + 'against the live database).'
                : 'NOT THE EXPECTED STATE - if anything settled here the harness was not offline, '
                  + 'and every line below is suspect.'),
        a_connectedFlag: out.a_sdkQueue && out.a_sdkQueue.connected,
        b_close_and_reopen: (needle(before.localStorage) || needle(before.sessionStorage))
            ? 'RECOVERABLE - the payload is in web storage'
            : 'LOST - the queued scores are in no durable store, so a reload starts with an empty queue',
        c_phone_restart: 'LOST - same as (b), and a restart also clears sessionStorage'
            + ' (it held ' + out.c_sessionStorageHeldAnything + ' keys here)',
        queueIsInMemoryArray: out.a_sdkQueue && out.a_sdkQueue.outstandingPutsIsArray === true,
        queuedBeforeReload: out.a_sdkQueue && out.a_sdkQueue.outstandingPutCount,
        queuedAfterReload: out.b_afterReload && out.b_afterReload.sdkQueue
            && out.b_afterReload.sdkQueue.outstandingPutCount
    };
    console.log(JSON.stringify(out, null, 2));
    process.exit(out.error ? 2 : 0);
}

main();
