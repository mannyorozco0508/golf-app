// ============================================================================
// A RETURNING VISITOR WITH AN OLD SERVICE WORKER GETS THE NEW SITE ON THE
// FIRST VISIT, IN REAL CHROME (website-d, Manny Nov 10: "the site doesn't load
// in Chrome on my Mac but works on my phone - check for an old service
// worker/cache and make sure returning visitors get the new site")
//
// One local server, one origin (http://localhost:<port>, where Chrome allows a
// service worker), one Chrome profile - and the server is SWITCHED mid-test:
//   OLD  = live main ffb344ea (sw.js golfapp-v393-2.0), read with `git show`,
//          routed like Pages routed it: / is index.html, x.html 308s to /x.
//   NEW  = this tree, routed like website-d: a bare / is the homepage (marked
//          X-HardPan-Page: home), / with a query, /app and a bare /index.html
//          are the app, /home is the homepage.
// The browser first visits the OLD site (a game link, the front door, /) and
// keeps its v393 worker and cache. Then the server switches, and the same
// browser comes back. Nothing on any page is called; the test only navigates
// and reads what is on screen, the worker registration and the cache names.
//
// PROVES: on the FIRST visit after the switch, / is the homepage (not the old
// cached app, not blank); the v394 worker takes over by itself and the v393
// cache is gone; /app opens the app front door with no moon; a ?game= link
// opens the scorecard; /home is the homepage.
//
// --use-mock-keychain: without it, Chrome 157 on this Mac waits on the login
// keychain for any http navigation (measured Nov 10).
//
// NEGATIVE CONTROL (by hand, restored by cmp): RETURNING_CONTROL=cachefirst
// makes the OLD worker cache-first for pages (what a broken old worker would
// do) -> the first-visit test goes red (the old app is served).
// It cannot prove Safari, or the real Cloudflare edge; the same switch was run
// against wrangler pages dev for v380, v383, v385 and v393 (report).
// ============================================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, execFileSync } = require('child_process');

const ROOT = __dirname;
const OLD_SHA = 'ffb344ea';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let HAVE_GIT = false;
try { execFileSync('git', ['cat-file', '-e', OLD_SHA + ':sw.js'], { cwd: ROOT, stdio: 'ignore' }); HAVE_GIT = true; } catch (e) { /* an export with no history */ }
const CAN = fs.existsSync(CHROME) && typeof WebSocket === 'function' && HAVE_GIT;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.mp4': 'video/mp4',
    '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const oldCache = new Map();
function oldFile(rel) {
    if (!oldCache.has(rel)) {
        try { oldCache.set(rel, execFileSync('git', ['show', OLD_SHA + ':' + rel], { cwd: ROOT, maxBuffer: 64 << 20 })); } catch (e) { oldCache.set(rel, null); }
    }
    return oldCache.get(rel);
}
function newFile(rel) {
    const f = path.join(ROOT, rel);
    return f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile() ? fs.readFileSync(f) : null;
}
const BARE = /^(utm_[a-z0-9_]*|fbclid|gclid|gbraid|wbraid|dclid|msclkid|mc_cid|mc_eid|igshid|ttclid|twclid|li_fat_id|yclid|_ga|_gl|ref)$/i;
const isBare = (search) => [...new URLSearchParams(search)].every(([k]) => BARE.test(k));

function makeServer(state) {
    return http.createServer((req, res) => {
        const u = new URL(req.url, 'http://x');
        const p = decodeURIComponent(u.pathname);
        const send = (buf, rel, extra) => {
            if (!buf) { res.writeHead(404); res.end(); return; }
            if (rel === 'sw.js' && state.mode === 'old' && process.env.RETURNING_CONTROL === 'cachefirst') {
                buf = Buffer.from(String(buf).replace('response = await fetch(request);',
                    'if (isNavigation) { const c = await caches.match(request, { ignoreSearch: true }); if (c) return c; } response = await fetch(request);'));
            }
            res.writeHead(200, Object.assign({ 'Content-Type': TYPES[path.extname(rel)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }, extra || {}));
            res.end(buf);
        };
        const redirect = (to) => { res.writeHead(308, { Location: to + u.search }); res.end(); };
        if (state.mode === 'old') {
            if (p === '/') return send(oldFile('index.html'), 'index.html');
            if (p === '/index.html' || p === '/index') return redirect('/');
            if (p.endsWith('.html')) return redirect(p.slice(0, -5));
            const rel = p.slice(1);
            return send(oldFile(rel + '.html') || oldFile(rel), oldFile(rel + '.html') ? rel + '.html' : rel);
        }
        if (p === '/') {
            if (isBare(u.search)) return send(newFile('hardpan-home.html'), 'hardpan-home.html', { 'X-HardPan-Page': 'home' });
            return send(newFile('index.html'), 'index.html');
        }
        if (p === '/app') return send(newFile('index.html'), 'index.html', { 'X-HardPan-Page': 'app' });
        if ((p === '/index.html' || p === '/index') && isBare(u.search)) return send(newFile('index.html'), 'index.html', { 'X-HardPan-Page': 'app' });
        if (p === '/index.html' || p === '/index') return redirect('/');
        if (p === '/home') return send(newFile('hardpan-home.html'), 'hardpan-home.html');
        if (p.endsWith('.html')) return redirect(p.slice(0, -5));
        const rel = p.slice(1);
        return send(newFile(rel + '.html') || newFile(rel), newFile(rel + '.html') ? rel + '.html' : rel);
    });
}

class Tab {
    async open() {
        this.profile = fs.mkdtempSync(path.join(os.tmpdir(), 'returning-'));
        this.chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--use-mock-keychain',
            // Firebase and every other outside host resolve to nothing: no live traffic.
            '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost',
            '--remote-debugging-port=0', '--user-data-dir=' + this.profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
        const wsBrowser = await new Promise((resolve, reject) => {
            let err = '';
            this.chrome.stderr.on('data', (d) => { err += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(err); if (m) resolve(m[1]); });
            setTimeout(() => reject(new Error('Chrome did not start')), 30000);
        });
        const port = new URL(wsBrowser).port;
        let page;
        for (let i = 0; i < 100 && !page; i++) {
            try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch (e) { /* not yet */ }
            if (!page) await sleep(100);
        }
        this.ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r) => { this.ws.onopen = r; });
        this.id = 0; this.pending = new Map();
        this.ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && this.pending.has(d.id)) { this.pending.get(d.id)(d); this.pending.delete(d.id); } };
        await this.send('Page.enable');
        await this.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    }
    send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const i = ++this.id;
            this.pending.set(i, resolve);
            this.ws.send(JSON.stringify({ id: i, method, params }));
            setTimeout(() => { if (this.pending.has(i)) { this.pending.delete(i); reject(new Error(method + ' timed out')); } }, 30000);
        });
    }
    async eval(expression) {
        const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
        return r.result.result.value;
    }
    async go(url, wait) { await this.send('Page.navigate', { url }); await sleep(wait || 2500); return this.screen(); }
    screen() {
        return this.eval(`(async () => {
            let ck = []; try { ck = await caches.keys(); } catch (e) {}
            const moons = [...document.querySelectorAll('.theme-toggle-btn')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length;
            return { path: location.pathname + location.search, title: document.title, text: (document.body && document.body.innerText || '').slice(0, 80),
                controlled: !!(navigator.serviceWorker && navigator.serviceWorker.controller), caches: ck, moons }; })()`);
    }
    async waitFor(pred, ms) {
        let s;
        for (let t = 0; t < ms; t += 250) { s = await this.screen(); if (pred(s)) return s; await sleep(250); }
        return s;
    }
    async close() {
        try { this.ws.close(); } catch (e) { /* gone */ }
        const gone = new Promise((r) => { this.chrome.once('exit', r); setTimeout(r, 5000); });
        try { this.chrome.kill(); } catch (e) { /* gone */ }
        await gone;
        try { this.chrome.stderr.destroy(); } catch (e) { /* closed */ }
        try { fs.rmSync(this.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (e) { /* harmless */ }
    }
}

describe('a returning visitor with the v393 (live main) worker gets website-d on the first visit (real Chrome)',
    { skip: !CAN && 'Chrome or the git history is not available' }, () => {
        const state = { mode: 'old' };
        let srv, O, tab;
        before(async () => {
            srv = makeServer(state);
            await new Promise((r) => srv.listen(0, '127.0.0.1', r));
            O = 'http://localhost:' + srv.address().port;
            tab = new Tab();
            await tab.open();
        });
        after(async () => {
            if (tab) await tab.close();
            if (srv) { srv.closeAllConnections(); srv.close(); }
        });

        test('OLD site: the v393 worker installs and controls the app (positive control)', async () => {
            await tab.go(O + '/?game=WARM&group=1', 2500);
            const s = await tab.waitFor((x) => x.controlled && x.caches.includes('golfapp-v393-2.0'), 15000);
            assert.ok(s.controlled, 'the old worker never took control');
            assert.deepEqual(s.caches, ['golfapp-v393-2.0']);
            const root = await tab.go(O + '/', 3000);
            assert.equal(root.title, 'Trip & Round Setup - Home', 'old / was the app front door');
            assert.equal(root.moons, 1, 'positive: the old site shows the moon');
        });

        test('after the switch, the FIRST visit to / is the homepage - not the old app, not blank', async () => {
            state.mode = 'new';
            const s = await tab.go(O + '/', 3000);
            assert.equal(s.path, '/', 'the visitor was sent somewhere else: ' + s.path);
            assert.equal(s.title, 'HardPan: Golf GPS & Games', 'first visit after the deploy showed: ' + s.title + ' / ' + s.text);
            assert.match(s.text, /HardPan/, 'the page is blank');
        });

        test('the v394 worker takes over by itself and the v393 cache is deleted', async () => {
            const s = await tab.waitFor((x) => x.caches.length === 1 && x.caches[0] === 'golfapp-v401-2.0', 20000);
            assert.deepEqual(s.caches, ['golfapp-v401-2.0'], 'old caches left: ' + s.caches.join(','));
        });

        test('second visit to /, then /app, a ?game= link and /home: each is the right page, no moon', async () => {
            const again = await tab.go(O + '/', 2500);
            assert.equal(again.title, 'HardPan: Golf GPS & Games');   // was 'HardPan Golf' (full name, Nov 10)
            const app = await tab.go(O + '/app', 3500);
            assert.equal(app.title, 'Trip & Round Setup - Home', '/app did not open the app front door');
            assert.equal(app.path, '/admin');
            assert.equal(app.moons, 0, 'the moon is still on the web');
            const game = await tab.go(O + '/?game=TEST&group=1', 3000);
            assert.equal(game.title, 'Live Scorecard');
            assert.equal(game.path, '/?game=TEST&group=1');
            const home = await tab.go(O + '/home', 2500);
            assert.equal(home.title, 'HardPan: Golf GPS & Games');   // was 'HardPan Golf' (full name, Nov 10)
            const after = await tab.screen();
            assert.ok(after.controlled, 'positive: the visitor is still controlled by a worker (v394)');
        });
    });
