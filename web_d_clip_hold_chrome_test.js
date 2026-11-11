// ============================================================================
// A CLIP PLAYS ONCE AND HOLDS ITS LAST FRAME, IN REAL CHROME (website-d,
// Manny Nov 10: "play once and hold on the last frame ... so loops don't jump")
//
// The page a visitor opens (a Help topic page, and the homepage tile), served
// by a tiny local static server over this repo, in headless Chrome at phone
// width. Nothing on the page is called: the test scrolls the clip into view,
// exactly as a visitor does, and waits. site-clips.js loads it, plays it, and
// when it reaches the end it must STAY there:
//   - video.ended is true and currentTime is at the duration (the last frame);
//   - it is still the video on screen: src kept, data-clip "playing", a real
//     box (not swapped back to the poster by giveUp, not hidden);
//   - it did not restart (no `loop`, no JS replay while in view).
// --use-mock-keychain: without it, Chrome 157 on this Mac waits on the login
// keychain for any http navigation (measured Nov 10: every navigation hung,
// data: URLs did not).
//
// WHAT IT CANNOT PROVE: Safari's decoder (iOS Safari also honours ended and
// holds the last frame for a muted inline video, but that is not measured
// here); how the frame looks (the screenshots in outbox/web-d-shots do that).
//
// Negative control (run by hand, restored by cmp): `loop` put back on the
// gps-basics clip -> the Help test goes red (ended stays false).
// ============================================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = __dirname;
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CAN = fs.existsSync(CHROME) && typeof WebSocket === 'function';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.mp4': 'video/mp4',
    '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

function serve() {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
            if (p === '/home') p = '/hardpan-home';
            let f = path.join(ROOT, p);
            if (!path.extname(f) && fs.existsSync(f + '.html')) f += '.html';
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
            const buf = fs.readFileSync(f);
            const type = TYPES[path.extname(f)] || 'application/octet-stream';
            // Range support: Chrome streams media with Range requests.
            const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
            if (range) {
                const start = Number(range[1]);
                const end = range[2] ? Number(range[2]) : buf.length - 1;
                res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${buf.length}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
                res.end(buf.subarray(start, end + 1));
                return;
            }
            res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': buf.length });
            res.end(buf);
        });
        srv.listen(0, '127.0.0.1', () => resolve(srv));
    });
}

class Tab {
    async open() {
        this.profile = fs.mkdtempSync(path.join(require('os').tmpdir(), 'clip-hold-'));
        this.chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--use-mock-keychain',
            '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=0', '--user-data-dir=' + this.profile, 'about:blank'],
        { stdio: ['ignore', 'ignore', 'pipe'] });
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
    async go(url) { await this.send('Page.navigate', { url }); await sleep(1500); }
    async close() {
        try { this.ws.close(); } catch (e) { /* gone */ }
        const gone = new Promise((r) => { this.chrome.once('exit', r); setTimeout(r, 5000); });
        try { this.chrome.kill(); } catch (e) { /* gone */ }
        await gone;
        try { this.chrome.stderr.destroy(); } catch (e) { /* closed */ }
        try { fs.rmSync(this.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (e) { /* a temp dir left behind is harmless */ }
    }
}

// What a visitor's screen holds for one clip slot, read without calling any page function.
const READ = (sel) => `(() => { const v = document.querySelector(${JSON.stringify(sel)}); const r = v.getBoundingClientRect();
    return { ended: v.ended, paused: v.paused, t: v.currentTime, d: v.duration, src: v.getAttribute('src'), state: v.getAttribute('data-clip'),
        loop: v.loop, w: r.width, h: r.height, shown: getComputedStyle(v).display !== 'none' && getComputedStyle(v).visibility !== 'hidden',
        badge: v.parentNode.classList.contains('has-clip') }; })()`;

async function watchToEnd(tab, sel) {
    await tab.eval(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: 'center' }), true`);
    let s, sawPlaying = false;
    for (let i = 0; i < 60; i++) {   // up to 12 s; the clips are 3-4 s
        await sleep(200);
        s = await tab.eval(READ(sel));
        if (s.state === 'playing') sawPlaying = true;
        if (s.ended) break;
    }
    await sleep(1500);   // and it is STILL there a moment later (no restart)
    return { s: await tab.eval(READ(sel)), sawPlaying };
}

function assertHeld({ s, sawPlaying }, label) {
    assert.ok(sawPlaying, label + ': the clip never played (positive control)');
    assert.equal(s.loop, false, label + ': the video loops');
    assert.equal(s.ended, true, label + ': the clip did not end and stay ended (it restarted or never finished)');
    assert.ok(Number.isFinite(s.d) && s.d > 2 && s.d < 6, label + ': duration ' + s.d);
    assert.ok(Math.abs(s.t - s.d) < 0.1, label + ': currentTime ' + s.t + ' is not at the end ' + s.d);
    assert.ok(s.src && s.state === 'playing', label + ': the video was swapped back to its poster (src ' + s.src + ', ' + s.state + ')');
    assert.ok(s.shown && s.w > 50 && s.h > 100, label + ': the video is not on screen');
    assert.equal(s.badge, true, label + ': the clip badge went away');
}

describe('a clip plays once and holds its last frame (real Chrome)', { skip: !CAN && 'Chrome is not installed' }, () => {
    let srv, base, tab;
    before(async () => {
        srv = await serve();
        base = 'http://127.0.0.1:' + srv.address().port;
        tab = new Tab();
        await tab.open();
    });
    after(async () => {
        if (tab) await tab.close();
        if (srv) { srv.closeAllConnections(); srv.close(); }
    });

    test('Help: /help/gps-basics - gps.mp4 ends on its last frame and stays', async () => {
        await tab.go(base + '/help/gps-basics');
        assertHeld(await watchToEnd(tab, 'video[data-src="/media/clips/gps.mp4"]'), 'help/gps-basics');
    });

    test('Homepage: the Results card - results.mp4 ends on its last frame and stays', async () => {
        await tab.go(base + '/home');
        assertHeld(await watchToEnd(tab, '#f-results video'), 'home Results tile');
    });

    // website-e re-pin: the homepage's Just say it card is a still now (no clip slot), so
    // the poster-only slot is checked where one remains, Help's Start a round. Was: #f-say on /home.
    test('a slot with no clip file (Help: Start a round) keeps its poster: no src, marked missing', async () => {
        await tab.go(base + '/help/start-round');
        await tab.eval(`document.querySelector('video[data-src="/media/clips/start-round.mp4"]').scrollIntoView({ block: 'center' }), true`);
        let s;
        for (let i = 0; i < 25; i++) { await sleep(200); s = await tab.eval(READ('video[data-src="/media/clips/start-round.mp4"]')); if (s.state === 'missing') break; }
        assert.equal(s.state, 'missing', 'the missing clip was not given up');
        assert.equal(s.src, null, 'a broken player is left where the poster should show');
        assert.ok(s.shown && s.w > 50, 'the poster is not on screen');
    });
});
