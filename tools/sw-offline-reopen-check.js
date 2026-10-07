#!/usr/bin/env node
// ============================================================================
// CLOSE THE TAB OFFLINE, OPEN IT AGAIN (2026-10-06)
//
// Manny's phone, Safari, the preview URL: open the round online, enter scores
// offline, close the tab, reopen it -> "Safari can't open the page. Response
// served by service worker has redirections." The round's scores were in
// localStorage behind a door that would not open.
//
// WHAT THIS DRIVES. The REAL sw.js, registered by the real page, over a local
// server that redirects /index.html to / exactly as Cloudflare Pages does
// (it strips the extension and keeps the query). The worker installs, the page
// is loaded, the network is taken away with CDP, and the page is loaded AGAIN -
// which is the reopen. Then it reads what the worker served and what it cached.
//
// WHAT IT IS NOT. It is not Safari. safaridriver is installed on this machine
// but Remote Automation is not enabled, so no session can be opened; the phone
// is the only WebKit in this loop. What this proves is the PROPERTY WebKit
// enforces - redirected === false on anything served to or cached for a
// navigation - measured on a real Cache API and a real worker rather than a
// fake one. The unit guard (sw_redirect_navigation_test.js) proves the branch;
// this proves the browser agrees.
//
// EXIT: 0 both reopen urls serve a clean cached page; 2 anything else.
// ============================================================================

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const registry = require('./lib/browser-registry.js');

const REPO = path.join(__dirname, '..');
const CHROME = process.env.CHROME_PATH
    || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
               '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

// THE SERVER THAT BEHAVES LIKE CLOUDFLARE PAGES: a request for /index.html is
// answered with a 301 to / with the query kept. That one redirect is the whole
// cause of the bug.
function serve() {
    return new Promise((resolve) => {
        const hits = [];
        const server = http.createServer((req, res) => {
            const u = new URL(req.url, 'http://x');
            hits.push(u.pathname + u.search);
            if (u.pathname === '/index.html') {
                res.writeHead(301, { Location: '/' + (u.search || '') });
                return res.end();
            }
            const file = u.pathname === '/' ? 'index.html' : u.pathname.replace(/^\/+/, '');
            const f = path.join(REPO, file);
            if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
                res.writeHead(404); return res.end('no');
            }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
            res.end(fs.readFileSync(f));
        });
        server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, hits }));
        // (bound on the loopback address; reached by the NAME localhost above)
    });
}
function readPort(dir, ms) {
    const file = path.join(dir, 'DevToolsActivePort');
    const deadline = Date.now() + ms;
    return new Promise((resolve, reject) => {
        (function poll() {
            try {
                const raw = fs.readFileSync(file, 'utf8').split('\n')[0].trim();
                if (/^[0-9]+$/.test(raw)) return resolve(Number(raw));
            } catch (e) {}
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

// WHAT THE WORKER PUT IN THE CACHE, and whether any of it carries a redirect.
// Read through the real Cache API, from the page.
const CACHE_REPORT = `(async function () {
  const out = { keys: [], redirected: [], controlled: !!navigator.serviceWorker.controller };
  const names = await caches.keys();
  for (const n of names) {
    const c = await caches.open(n);
    for (const req of await c.keys()) {
      out.keys.push(req.url.replace(location.origin, ''));
      const r = await c.match(req);
      if (r && r.redirected) out.redirected.push(req.url.replace(location.origin, ''));
    }
  }
  return JSON.stringify(out);
})()`;

const PAGE_REPORT = `(function () {
  const body = String(document.body.innerText || '').replace(/\\s+/g, ' ');
  return JSON.stringify({
    url: location.pathname + location.search,
    // THE APP, NOT "SOME TEXT". The first version asked whether the body failed
    // to match a few error phrases and was longer than 80 characters - and
    // Chrome's own ERR_INTERNET_DISCONNECTED page passed that happily, so the
    // check reported a successful reopen of a page that never loaded. Evidence
    // now means an element only this scorecard has.
    opened: !!document.getElementById('hole-view-card') && !!document.getElementById('round-sheet'),
    browserErrorPage: /ERR_|Press space to play|cables, modem/i.test(body),
    noConnectionCard: /No connection/.test(body),
    boxes: document.querySelectorAll('.score-input').length,
    queued: (function () { try { return window.OfflineQueue
        ? (window.OfflineQueue.count(localStorage) || 0) : -1; } catch (e) { return -2; } })(),
    body: body.slice(0, 120)
  });
})()`;

(async () => {
    const out = { what: 'close the tab offline and open it again' };
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-reopen-'));
    const served = await serve();
    // localhost, NOT 127.0.0.1. pwa-boot's canRegister() accepts https: or the
    // hostname 'localhost' only, so on 127.0.0.1 the worker is never registered
    // at all - measured: an empty cache, controlled false, and a check that
    // reported success while proving nothing.
    const base = 'http://localhost:' + served.port;
    const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run',
        '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
    const tracked = registry.track(chrome, profile);
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
            } catch (e) {}
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
        const go = async (url) => { await rpc(ws, id++, 'Page.navigate', { url }); await new Promise(r => setTimeout(r, 3500)); };
        await rpc(ws, id++, 'Page.enable', {});
        await rpc(ws, id++, 'Runtime.enable', {});
        await rpc(ws, id++, 'Network.enable', {});

        // 1. ONLINE: the page loads through the redirect and registers the worker.
        await go(base + '/index.html?game=ABCD&group=1');
        await new Promise(r => setTimeout(r, 2500));   // let install/activate settle
        out.online = JSON.parse(await ev(PAGE_REPORT));
        // 2. A second navigation, now controlled, so the worker handles it.
        await go(base + '/index.html?game=ABCD&group=1');
        out.onlineControlled = JSON.parse(await ev(PAGE_REPORT));
        out.cacheAfterOnline = JSON.parse(await ev(CACHE_REPORT, true));

        // 3. THE TAB CLOSES AND THE SIGNAL IS GONE. Reopen at BOTH shapes.
        await rpc(ws, id++, 'Network.emulateNetworkConditions', { offline: true,
            latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
        out.reopen = {};
        for (const p of ['/index.html?game=ABCD&group=1', '/?game=ABCD']) {
            await go(base + p);
            out.reopen[p] = JSON.parse(await ev(PAGE_REPORT));
        }
    } catch (e) {
        out.error = String(e && e.message || e);
    } finally {
        try { if (ws) ws.close(); } catch (e) {}
        try { served.server.close(); } catch (e) {}
        registry.release(tracked);
        chrome.kill();
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
    }

    const r = out.reopen || {};
    const c = out.cacheAfterOnline || {};
    out.ok = !out.error
        // POSITIVE CONTROL FIRST: the worker actually took over and actually
        // cached the page. Without these two, every "it reopened" below is true
        // of a page the worker never touched.
        && c.controlled === true
        && (c.keys || []).some((k) => /index\.html|^\/\?/.test(k))
        && (c.redirected || []).length === 0
        && out.onlineControlled && out.onlineControlled.opened === true
        && Object.keys(r).length === 2
        && Object.keys(r).every((k) => r[k].opened === true
                                      && r[k].browserErrorPage === false
                                      && r[k].noConnectionCard === false);
    out.why = {
        controlled: c.controlled === true,
        cachedShell: (c.keys || []).some((k) => /index\.html|^\/\?/.test(k)),
        noneRedirected: (c.redirected || []).length === 0,
        onlineOpened: !!(out.onlineControlled && out.onlineControlled.opened === true),
        reopens: Object.keys(r).map((k) => k + '=' + (r[k].opened && !r[k].browserErrorPage && !r[k].noConnectionCard))
    };
    console.log(JSON.stringify(out, null, 2));
    process.exit(out.ok ? 0 : 2);
})();
