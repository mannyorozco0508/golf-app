// ============================================================================
// A NEW HOMEPAGE RELEASE REACHES A TAB THAT IS ALREADY OPEN (ADVISOR-20261116-0049, Manny 2026-11-16 00:48: his iPhone kept
// showing the old homepage, with the old tiles, in a tab it had open since before the deploy; ?v=416 in a new tab was fine)
//
// functions/_front-door.js stamps the homepage answer with the deploy's build: X-HardPan-Build and Server-Timing
// build;desc="<sha12>" (from CF_PAGES_COMMIT_SHA; 'dev' where Pages did not set it). site-fresh.js remembers the build the
// page was loaded from (the navigation entry's serverTiming, else the first HEAD answer) and, when the tab comes back to the
// front (visibilitychange, pageshow from the back-forward cache, online), at most once a minute, asks `/` with a HEAD
// (cache: no-store) for the build now live; a different build reloads the page unless the viewer or a sheet is open.
//
// 1. The Function: the two headers on the homepage answer (GET and HEAD, with and without the sha), none on the app answer.
// 2. Source: the check listens, never polls, asks with a HEAD and no-store, and reloads only with nothing open.
// 3. Chrome, 390x844, the page served by a tiny server that stamps the build the way the Function does, arrived at the way a
//    visitor arrives (nothing on the page is called): the page remembers build A; the server moves to build B; the tab goes
//    to the back and comes to the front (the lifecycle state over CDP) -> the page loads again, once, and now remembers B.
//    Controls in the same run: the same back-and-front with the build unchanged -> no reload; with the viewer open (a real
//    click on a tile) and a new build -> no reload while it is open.
// WHAT IT CANNOT PROVE: Safari / iOS (the Simulator run is by hand: tournaments/build-home-fresh/), Cloudflare's own headers.
// BASELINE against origin/main 91d0f2b7 (this exact file copied there, final run, 2026-11-16 01:31): 1 pass / 8 fail of the 9 that
// ran (describe 2 reads site-fresh.js at module level, which does not exist there, so its three tests never start; the one pass
// is "serveApp carries no build header", true before and after). Here, the final file: 12 pass / 0 fail.
// iOS (by hand, iPhone 17 Simulator, iOS 26.5, Safari, wrangler pages dev with --binding CF_PAGES_COMMIT_SHA): build A loaded;
// server moved to build B with a visible fold line; Safari sent to the back (Settings) and brought to the front: the page shows
// B; control: the file changed again under the SAME build id: no reload; build C: reloaded. tournaments/build-home-fresh/.
// ============================================================================
'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = __dirname;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SHA = 'abcdef1234567890abcdef1234567890abcdef12';

describe('1. the Function stamps the homepage answer with the build', () => {
    let FD;
    before(async () => { FD = await import(pathToFileURL(path.join(ROOT, 'functions', '_front-door.js')).href); });
    const assets = { fetch: async (req) => new Response(req.method === 'HEAD' ? null : '<!DOCTYPE html><html><body>home</body></html>', { status: 200, headers: { 'content-type': 'text/html', etag: '"x"' } }) };
    const ctx = (method, env) => ({ request: new Request('https://hardpangolf.com/', { method }), env: Object.assign({ ASSETS: assets }, env || {}) });
    test('buildOf: the first 12 of the sha, lower-case; dev when Pages set nothing or something that is not a sha', () => {
        assert.equal(FD.buildOf({ CF_PAGES_COMMIT_SHA: SHA }), 'abcdef123456');
        assert.equal(FD.buildOf({ CF_PAGES_COMMIT_SHA: 'ABCDEF1234567' }), 'abcdef123456');
        assert.equal(FD.buildOf({}), 'dev'); assert.equal(FD.buildOf(null), 'dev'); assert.equal(FD.buildOf({ CF_PAGES_COMMIT_SHA: 'not a sha' }), 'dev');
    });
    test('GET /: X-HardPan-Page home, X-HardPan-Build, Server-Timing build;desc, the body still the page', async () => {
        const r = await FD.serveHomepage(ctx('GET', { CF_PAGES_COMMIT_SHA: SHA }));
        assert.equal(r.status, 200);
        assert.equal(r.headers.get('X-HardPan-Page'), 'home');
        assert.equal(r.headers.get(FD.BUILD_HEADER), 'abcdef123456');
        assert.match(r.headers.get('Server-Timing') || '', /(^|,\s*)build;desc="abcdef123456"(,|$)/);
        assert.match(await r.text(), /home/);
    });
    test('HEAD /: the same headers and no body (what the page asks for)', async () => {
        const r = await FD.serveHomepage(ctx('HEAD', { CF_PAGES_COMMIT_SHA: SHA }));
        assert.equal(r.status, 200);
        assert.equal(r.headers.get(FD.BUILD_HEADER), 'abcdef123456');
        assert.equal(await r.text(), '');
    });
    test('no sha: build dev on both headers (a local run never reloads itself)', async () => {
        const r = await FD.serveHomepage(ctx('GET'));
        assert.equal(r.headers.get(FD.BUILD_HEADER), 'dev');
        assert.match(r.headers.get('Server-Timing') || '', /build;desc="dev"/);
    });
    test('the app answer (serveApp) carries no build header: this is the homepage\'s mechanism only', async () => {
        const r = await FD.serveApp(ctx('GET', { CF_PAGES_COMMIT_SHA: SHA }));
        assert.equal(r.headers.get('X-HardPan-Page'), 'app');
        assert.equal(r.headers.get(FD.BUILD_HEADER), null);
        assert.equal(r.headers.get('Server-Timing'), null);
    });
});

describe('2. source: the check in site-fresh.js (its own file: site-features.js keeps its promise that it sends nothing anywhere)', () => {
    const block = read('site-fresh.js');
    assert.ok(block.length > 1000, 'the file exists');
    test('the homepage loads it, after site-features.js; site-features.js itself has no fetch', () => {
        assert.match(read('hardpan-home.html'), /<script src="\/site-features\.js" defer><\/script>\n<script src="\/site-fresh\.js" defer><\/script>/);
        assert.doesNotMatch(read('site-features.js'), /\bfetch\(/);
        assert.equal((block.match(/\bfetch\(/g) || []).length, 1, 'one request in the file: the HEAD');
    });
    test('listens for the tab coming to the front, never polls, asks with a HEAD and no-store, reloads', () => {
        assert.match(block, /document\.addEventListener\('visibilitychange', check\)/);
        assert.match(block, /window\.addEventListener\('pageshow', function \(ev\) \{ if \(ev\.persisted\)/);
        assert.match(block, /window\.addEventListener\('online'/);
        assert.match(block, /method: 'HEAD', cache: 'no-store'/);
        assert.match(block, /r\.headers\.get\('X-HardPan-Build'\)/);
        assert.match(block, /serverTiming/);
        assert.match(block, /location\.reload\(\)/, 'positive: the reload is there');
        assert.doesNotMatch(block, /setInterval|setTimeout/, 'no polling: the page asks only when it comes back to the front');
        assert.match(block, /now - last < 60000/, 'at most once a minute');
    });
    test('the reload waits while the viewer or a sheet is open, and a dev or empty build never reloads', () => {
        assert.match(block, /if \(\(fvEl && !fvEl\.hidden\) \|\| document\.querySelector\('\.sheet:not\(\[hidden\]\)'\)\) \{ last = 0; return; \}/);
        assert.match(block, /if \(!b \|\| b === 'dev'\) return;/);
        assert.match(block, /if \(!loaded\) \{ loaded = b; return; \}/, 'the first answer is the baseline where serverTiming is not readable');
    });
});

// ---------------------------------------------------------------------------
// 3. Chrome. The server stamps `/` the way the Function does (build from a variable the test moves) and counts the GETs of `/`.
// ---------------------------------------------------------------------------
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CAN = fs.existsSync(CHROME) && typeof WebSocket === 'function';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webp': 'image/webp', '.mp4': 'video/mp4', '.jpg': 'image/jpeg' };
const state = { build: 'aaaaaaaaaaaa', gets: 0, heads: 0 };
function serve() {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
            if (p === '/') {
                if (req.method === 'HEAD') state.heads++; else state.gets++;
                const h = { 'Content-Type': 'text/html; charset=utf-8', 'X-HardPan-Page': 'home', 'X-HardPan-Build': state.build, 'Server-Timing': 'build;desc="' + state.build + '"', 'Cache-Control': 'public, max-age=0, must-revalidate' };
                res.writeHead(200, h);
                res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(path.join(ROOT, 'hardpan-home.html')));
                return;
            }
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
            res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
            res.end(fs.readFileSync(f));
        });
        srv.listen(0, '127.0.0.1', () => resolve(srv));
    });
}
class Tab {
    async open() {
        this.profile = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hp-fresh-'));
        this.port = 9400 + Math.floor(Math.random() * 400);
        this.chrome = spawn(CHROME, ['--headless=new', '--use-mock-keychain', '--remote-debugging-port=' + this.port, '--user-data-dir=' + this.profile, '--window-size=1400,1000', '--hide-scrollbars', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
        let list = null;
        for (let i = 0; i < 60 && !list; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + this.port + '/json', (r) => { let b = ''; r.on('data', (d) => b += d); r.on('end', () => res(JSON.parse(b))); }).on('error', rej)); } catch (e) { await sleep(250); } }
        const page = list.find((t) => t.type === 'page');
        this.ws = new WebSocket(page.webSocketDebuggerUrl);
        this.id = 0; this.pending = new Map(); this.errors = [];
        this.ws.addEventListener('message', (ev) => {
            const d = JSON.parse(ev.data);
            if (d.id && this.pending.has(d.id)) { this.pending.get(d.id)(d); this.pending.delete(d.id); }
            if (d.method === 'Runtime.exceptionThrown') this.errors.push(JSON.stringify(d.params.exceptionDetails).slice(0, 200));
        });
        await new Promise((r) => this.ws.addEventListener('open', r));
        await this.send('Runtime.enable'); await this.send('Page.enable');
        await this.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    }
    send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const i = ++this.id; this.pending.set(i, resolve);
            this.ws.send(JSON.stringify({ id: i, method, params }));
            setTimeout(() => { if (this.pending.has(i)) { this.pending.delete(i); reject(new Error(method + ' timed out')); } }, 30000);
        });
    }
    async eval(expression) {
        const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
        return r.result.result.value;
    }
    async go(url) { await this.send('Page.navigate', { url }); await sleep(1500); }
    // The tab "comes back": headless Chrome does not change document.visibilityState for Page.setWebLifecycleState
    // (measured here: frozen then active fired nothing, 0 HEADs), so the trigger is the connection coming back - the
    // browser's own `online` event on window, which the page listens to beside visibilitychange and pageshow. Same code path.
    async backAndFront() {
        await this.send('Network.enable');
        await this.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); await sleep(300);
        await this.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); await sleep(1500);
    }
    async clickEl(sel) {
        const r = await this.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({ block: 'center', behavior: 'instant' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
        await sleep(300);
        await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
        await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
        await sleep(600);
    }
    async close() { try { this.ws.close(); } catch (e) { /* closed */ } try { this.chrome.kill(); } catch (e) { /* gone */ } try { fs.rmSync(this.profile, { recursive: true, force: true }); } catch (e) { /* tmp */ } }
}

describe('3. in Chrome: the tab comes back to the front after a new deploy and the page loads again', { skip: !CAN && 'no Chrome' }, () => {
    let srv, base, tab;
    before(async () => { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port; tab = new Tab(); await tab.open(); });
    after(async () => { if (tab) await tab.close(); if (srv) srv.close(); });

    test('3.1 arrived cold at /: the page remembers build A from Server-Timing; nothing is asked while it sits in front', async () => {
        state.build = 'aaaaaaaaaaaa'; state.gets = 0; state.heads = 0;
        await tab.go(base + '/');
        assert.equal(await tab.eval('window.__hpLoadedBuild()'), 'aaaaaaaaaaaa');
        await sleep(1500);
        assert.equal(state.gets, 1); assert.equal(state.heads, 0, 'no HEAD while the tab is in front');
    });
    test('3.2 control: back and front with the build unchanged: one HEAD, no reload', async () => {
        await tab.backAndFront();
        assert.equal(state.heads, 1, 'one HEAD on coming to the front');
        assert.equal(state.gets, 1, 'no reload: the build is the same');
        assert.equal(await tab.eval('window.__hpLoadedBuild()'), 'aaaaaaaaaaaa');
    });
    test('3.3 a new build is live and the tab comes to the front: the page loads again, once, and remembers build B', async () => {
        state.build = 'bbbbbbbbbbbb';
        // the once-a-minute throttle: the control just asked; move the clock the way a visitor returning later would
        await tab.eval('(() => { const d = Date.now; Date.now = () => d() + 61000; return true; })()');
        await tab.backAndFront();
        await sleep(2000);
        assert.equal(state.gets, 2, 'the page loaded again once (GETs of /)');
        assert.equal(await tab.eval('window.__hpLoadedBuild()'), 'bbbbbbbbbbbb');
        assert.deepEqual(tab.errors, []);
    });
    test('3.4 control: the viewer is open (a real click on a tile) when a newer build is live: no reload while it is open', async () => {
        await tab.clickEl('.glance-tiles button.gt');
        assert.equal(await tab.eval('!document.getElementById("fv").hidden'), true, 'positive: the viewer opened');
        state.build = 'cccccccccccc';
        await tab.eval('(() => { const d = Date.now; Date.now = () => d() + 61000; return true; })()');
        await tab.backAndFront();
        await sleep(1500);
        assert.equal(state.gets, 2, 'no reload with the viewer open');
        assert.equal(await tab.eval('!document.getElementById("fv").hidden'), true, 'the viewer is still open');
    });
});
