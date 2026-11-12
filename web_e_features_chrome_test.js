// ============================================================================
// WEBSITE-E: THE FEATURE ROWS, THE VIEWER, A CLIP AND THE TWO DEMOS, IN REAL CHROME
//
// The homepage served by a tiny local static server over this repo, in headless
// Chrome at phone width (390x844). Every action is what a visitor does: a tap
// (a real mouse event at a point), a key, a scroll, the Back button. Nothing on
// the page is called.
//   1. 25 cards render, each with its headline and an image with alt text.
//   2. The viewer: a tap on a card opens it on that feature, the arrow key and a
//      swipe move between features (across rows), Esc closes it and focus goes
//      back to the card, and the Back button closes it too.
//   3. A clip (Results) plays once when its card is in view: seen mid-play, then
//      ended on its last frame and still there; with reduce motion, no clip loads.
//   4. Try the GPS (Nov 11, Manny): Esri World Imagery with the WEBSITE's key
//      (site-esri-config.js): the ONLY outside requests are the 16 keyed z19
//      ibasemaps tiles of the grid, each carrying that key, before or after a tap;
//      the "Powered by Esri" credit shows; a tap at a point shows the to-tap and
//      to-middle yards the map's scale gives for that point; no location is asked
//      for. (Was Option D, Nov 10: an OSM drawing and zero outside requests.)
//      Whether a tile actually draws depends on the network and on Esri's
//      referrer lock (hardpangolf.com only), so it is reported, not asserted.
//   5. Try Just say it: typing a sentence shows the app's setup card, a chip
//      shows another, an unknown sentence says so - and the page makes NO network
//      request and writes no storage while you do it.
//   6. No "IDEA" mockup tag and no money word in what a visitor reads.
// --use-mock-keychain: without it Chrome on this Mac waits on the login keychain
// for any http navigation (website-d, measured).
// WHAT IT CANNOT PROVE: Safari (iPhone or Mac) and a real Cloudflare edge; pinch
// zoom (the browser's own gesture, not emulated here).
// Negative controls: run by hand, each restored by cmp (website-e report).
// ============================================================================
'use strict';
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
    '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webp': 'image/webp' };

function serve() {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
            if (p === '/home' || p === '/') p = '/hardpan-home';
            let f = path.join(ROOT, p);
            if (!path.extname(f) && fs.existsSync(f + '.html')) f += '.html';
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
            const buf = fs.readFileSync(f);
            const type = TYPES[path.extname(f)] || 'application/octet-stream';
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
        this.profile = fs.mkdtempSync(path.join(require('os').tmpdir(), 'web-e-'));
        this.chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--use-mock-keychain', '--password-store=basic',
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
        this.id = 0; this.pending = new Map(); this.requests = [];
        this.ws.onmessage = (m) => {
            const d = JSON.parse(m.data);
            if (d.id && this.pending.has(d.id)) { this.pending.get(d.id)(d); this.pending.delete(d.id); }
            else if (d.method === 'Network.requestWillBeSent') this.requests.push(d.params.request.url);
        };
        await this.send('Page.enable');
        await this.send('Network.enable');
        // A spy, set before any page script: does anything ask for a location?
        await this.send('Page.addScriptToEvaluateOnNewDocument', { source:
            'window.__geo = 0; try { var g = navigator.geolocation; if (g) { g.getCurrentPosition = function () { window.__geo++; }; g.watchPosition = function () { window.__geo++; return 0; }; } } catch (e) {}' });
        await this.metrics(false);
    }
    metrics(reduce) {
        return Promise.all([
            this.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }),
            this.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduce ? 'reduce' : 'no-preference' }] })
        ]);
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
    // A real tap: mouse press and release at a point on the screen.
    async tap(x, y) {
        for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
            await this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
        }
        await sleep(250);
    }
    async tapEl(sel) {
        const r = await this.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({ block: 'center', inline: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
        await sleep(400);
        const r2 = await this.eval(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
        await this.tap(r2.x, r2.y);
        return r;
    }
    async key(key, code) {
        await this.send('Input.dispatchKeyEvent', Object.assign({ type: 'keyDown', key, code: code || key, windowsVirtualKeyCode: { Escape: 27, ArrowRight: 39, ArrowLeft: 37, Enter: 13 }[key] || 0 }, key === 'Enter' ? { text: '\r' } : {}));
        await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: code || key });
        await sleep(300);
    }
    async type(text) { await this.send('Input.insertText', { text }); await sleep(100); }
    async close() {
        try { this.ws.close(); } catch (e) { /* gone */ }
        const gone = new Promise((r) => { this.chrome.once('exit', r); setTimeout(r, 5000); });
        try { this.chrome.kill(); } catch (e) { /* gone */ }
        await gone;
        try { this.chrome.stderr.destroy(); } catch (e) { /* closed */ }
        try { fs.rmSync(this.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (e) { /* harmless */ }
    }
}

const VIEWER = `(() => { const fv = document.getElementById('fv'); return { open: !fv.hidden, n: document.getElementById('fv-n').textContent,
    title: document.getElementById('fv-title').textContent, focus: document.activeElement && (document.activeElement.id || document.activeElement.className),
    focusCard: document.activeElement && document.activeElement.closest('.fc') ? document.activeElement.closest('.fc').id : null }; })()`;

describe('website-e homepage in real Chrome', { skip: !CAN && 'Chrome is not installed' }, () => {
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

    test('32 cards render in five rows, each with its headline and a described screen', async () => {
        await tab.go(base + '/');
        const r = await tab.eval(`(() => { const cs = [...document.querySelectorAll('#features .fc')];
            return { n: cs.length, rows: [...document.querySelectorAll('#features .row')].map((r) => r.children.length),
              bad: cs.filter((c) => !c.querySelector('h3').textContent.trim() || !c.querySelector('p').textContent.trim() || !(c.querySelector('.ph img').alt || '').trim()).map((c) => c.id),
              sideways: document.documentElement.scrollWidth > window.innerWidth,
              text: document.body.innerText }; })()`);
        assert.equal(r.n, 32);   // 52A batch 1 re-pin (2026-11-12): Organize 5 -> 12
        assert.deepEqual(r.rows, [6, 6, 5, 12, 3]);
        assert.deepEqual(r.bad, []);
        assert.equal(r.sideways, false, 'the page scrolls sideways at 390');
        assert.doesNotMatch(r.text, /\bIDEA\b/, 'a mockup IDEA tag is on the page');
        const feat = await tab.eval(`document.getElementById('features').innerText`);
        assert.doesNotMatch(feat, /\$|\b(bet|bets|wager|pot|pots|buy-?in)\b/i, 'a money word in the feature rows or the demos');
        // the first card's screen really loads, sharp (a 2x source picked at least)
        await tab.eval(`document.querySelector('#f-gps').scrollIntoView({ block: 'center' }), true`);
        await sleep(800);
        const img = await tab.eval(`(() => { const i = document.querySelector('#f-gps .ph img'); return { done: i.complete && i.naturalWidth > 0, src: i.currentSrc, shown: i.getBoundingClientRect().width }; })()`);
        assert.ok(img.done && /\/media\/screens\/gps-(400|886)\.webp$/.test(img.src) && img.shown > 150, 'the GPS screen did not load: ' + JSON.stringify(img));
    });

    test('the viewer: tap opens it on that feature, arrows and a swipe move, Esc closes and focus returns, Back closes', async () => {
        await tab.go(base + '/');
        await tab.tapEl('#f-gps .ph');
        let v = await tab.eval(VIEWER);
        assert.equal(v.open, true, 'a tap on the card did not open the viewer');
        assert.equal(v.n, 'Play · 1 / 6'); assert.equal(v.title, 'Every yard. Every hole.');
        assert.equal(v.focus, 'fv-x', 'focus is not in the viewer');
        await tab.key('ArrowRight');
        v = await tab.eval(VIEWER);
        assert.equal(v.n, 'Play · 2 / 6'); assert.equal(v.title, 'Hit the number it plays.');
        const big = await tab.eval(`(() => { const li = document.querySelector('#fv-track .fv-s[data-i="1"] img'); return li ? { src: li.currentSrc, w: li.getBoundingClientRect().width } : null; })()`);
        assert.ok(big && /plays-like-940\.webp$/.test(big.src) && big.w > 250, 'the viewer does not show the sharp screen: ' + JSON.stringify(big));
        // a swipe: the track is scrolled the way a finger scrolls it, to the 7th slide (Games 1)
        await tab.eval(`(() => { const t = document.getElementById('fv-track'); t.scrollTo({ left: t.clientWidth * 6 }); return true; })()`);
        await sleep(700);
        v = await tab.eval(VIEWER);
        assert.equal(v.n, 'Games · 1 / 6', 'a swipe did not move to the next feature');
        assert.equal(v.title, 'Set up the game in one sentence.');
        await tab.key('Escape');
        v = await tab.eval(VIEWER);
        assert.equal(v.open, false, 'Esc did not close the viewer');
        assert.equal(v.focusCard, 'f-gps', 'focus did not go back to the card that opened it');
        // the phone's Back button
        const before = await tab.eval('location.href');
        await tab.tapEl('#f-results .ph');
        v = await tab.eval(VIEWER);
        assert.equal(v.open, true); assert.equal(v.n, 'Games · 5 / 6');
        await tab.eval('history.back(), true');
        await sleep(600);
        v = await tab.eval(VIEWER);
        assert.equal(v.open, false, 'Back did not close the viewer');
        assert.equal(await tab.eval('location.href'), before, 'Back left the page');
    });

    test('a clip plays once when its card is in view, then holds its last frame', async () => {
        await tab.go(base + '/');
        await tab.eval(`document.querySelector('#f-results').scrollIntoView({ block: 'center', inline: 'center' }), true`);
        const READ = `(() => { const v = document.querySelector('#f-results video'); return { t: v.currentTime, d: v.duration, ended: v.ended, paused: v.paused, state: v.getAttribute('data-clip'), loop: v.loop,
            still: getComputedStyle(document.querySelector('#f-results .ph img')).opacity, src: v.getAttribute('src') }; })()`;
        let mid = null, s;
        for (let i = 0; i < 70; i++) {
            await sleep(150);
            s = await tab.eval(READ);
            if (!mid && s.state === 'playing' && s.t > 0.3 && !s.ended) mid = s;
            if (s.ended) break;
        }
        assert.ok(mid, 'the clip was never seen mid-play');
        assert.equal(mid.still, '0', 'the still was not hidden while the clip played');
        await sleep(1500);
        s = await tab.eval(READ);
        assert.equal(s.loop, false);
        assert.equal(s.ended, true, 'the clip did not end and stay ended');
        assert.ok(Math.abs(s.t - s.d) < 0.1, 'not on the last frame: ' + s.t + ' of ' + s.d);
        assert.ok(s.src && s.state === 'playing', 'swapped back to the poster');
    });

    test('with reduce motion, no clip loads: the sharp stills stay', async () => {
        await tab.metrics(true);
        await tab.go(base + '/');
        for (const id of ['#f-gps', '#f-results', '#f-tourney']) { await tab.eval(`document.querySelector('${id}').scrollIntoView({ block: 'center', inline: 'center' }), true`); await sleep(500); }
        const r = await tab.eval(`[...document.querySelectorAll('#features video')].map((v) => v.getAttribute('src'))`);
        await tab.metrics(false);
        assert.ok(r.length === 6 && r.every((x) => !x), 'a clip loaded with reduce motion on: ' + JSON.stringify(r));
    });

    // Nov 11 (Manny): the box loads Esri World Imagery with the website's own key. Outside requests: exactly
    // the 16 keyed tiles of the grid (ibasemaps-api World_Imagery z19), each with the key from site-esri-config.js.
    const KEY = (/key: '([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'site-esri-config.js'), 'utf8')) || [])[1];
    const TILE = /^https:\/\/ibasemaps-api\.arcgis\.com\/arcgis\/rest\/services\/World_Imagery\/MapServer\/tile\/19\/(\d+)\/(\d+)\?token=(.+)$/;
    const mask = (list) => JSON.stringify(list.map((u) => u.replace(/token=[^&]+/, 'token=<KEY>')));
    test('Try the GPS: the Esri credit shows, the only outside requests are the 16 keyed tiles of the grid, a tap gives the yards for that point, no location is asked for', async () => {
        assert.ok(KEY, 'no key in site-esri-config.js');
        tab.requests = [];
        await tab.go(base + '/');
        const box = await tab.eval(`(() => { const m = document.getElementById('tg-map'); m.scrollIntoView({ block: 'center' }); return true; })()`);
        assert.ok(box);
        await sleep(2500);
        const outside = tab.requests.filter((u) => !u.startsWith(base) && !/^data:|^about:|^chrome/.test(u));
        const tiles = outside.filter((u) => TILE.test(u)), others = outside.filter((u) => !TILE.test(u));
        assert.deepEqual(others, [], 'the page made an outside request that is not an Esri tile: ' + mask(others));
        const grid = await tab.eval(`[...document.querySelectorAll('#tg-map .tile')].map((t) => t.dataset.y + '/' + t.dataset.x).sort()`);
        assert.equal(grid.length, 16, 'the box does not hold 16 tiles');
        const asked = [...new Set(tiles.map((u) => { const m = TILE.exec(u); return m[1] + '/' + m[2]; }))].sort();
        assert.deepEqual(asked, grid, 'the tiles requested are not the grid\'s 16');
        tiles.forEach((u) => assert.equal(decodeURIComponent(TILE.exec(u)[3]), KEY, 'a tile went out without the website key'));
        const d = await tab.eval(`(() => { const t = document.querySelector('#tg-map .tiles').getBoundingClientRect(), m = document.getElementById('tg-map').getBoundingClientRect();
            return { cover: Math.abs(t.width - m.width) < 2 && Math.abs(t.height - m.height) < 2, drawn: [...document.querySelectorAll('#tg-map .tile')].filter((i) => i.complete && i.naturalWidth > 0).length,
                missing: document.getElementById('tg-map').getAttribute('data-tiles'), hole: document.querySelector('#tg-map svg .o-hole').getBoundingClientRect().width > 20 }; })()`);
        assert.ok(d.cover && d.hole, 'the tiles or the hole outline are not on screen: ' + JSON.stringify(d));
        console.log('# tiles drawn locally: ' + d.drawn + ' of 16 (missing: ' + d.missing + ')');
        const credit = await tab.eval(`document.getElementById('try-gps').innerText`);
        assert.match(credit, /Powered by Esri · Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community · Hole outline © OpenStreetMap contributors/);
        assert.doesNotMatch(credit, /Map data © OpenStreetMap contributors|no outside requests/, 'the OSM-only wording is still on the box');
        assert.match(credit, /nothing leaves the page but the requests for the satellite picture, loaded live from Esri/);
        assert.match(credit, /Demo:/);
        // Tap at 50% across, 45% down the picture.
        const r = await tab.eval(`(() => { const m = document.getElementById('tg-map'), b = m.getBoundingClientRect();
            return { x: b.left + b.width * 0.5, y: b.top + b.height * 0.45, W: +m.dataset.w, H: +m.dataset.h, mpp: +m.dataset.mpp, you: m.dataset.you.split(',').map(Number), mid: m.dataset.mid.split(',').map(Number) }; })()`);
        assert.match(await tab.eval(`document.getElementById('tg-read').textContent`), /^From the tee: 153 y to the middle of the green\./);
        await tab.tap(r.x, r.y);
        const got = await tab.eval(`({ y: document.getElementById('tg-map').getAttribute('data-yards'), a: document.getElementById('tg-a').innerText, hidden: document.getElementById('tg-a').hidden, read: document.getElementById('tg-read').textContent, geo: window.__geo })`);
        const P = [r.W * 0.5, r.H * 0.45];
        const yd = (a, b) => Math.round(Math.hypot(a[0] - b[0], a[1] - b[1]) * r.mpp / 0.9144);
        const want = [yd(r.you, P), yd(P, r.mid)];
        // the scale: tee to the middle on this map is the hole's own OSM line, 140 m = 153 y (as before the tap)
        assert.equal(yd(r.you, r.mid), 153, 'tee to middle on the map is ' + yd(r.you, r.mid) + ' y, the hole is 153');
        const [a, b] = got.y.split(',').map(Number);
        assert.ok(Math.abs(a - want[0]) <= 1 && Math.abs(b - want[1]) <= 1, 'tap yards ' + got.y + ', the picture gives ' + want);
        assert.equal(got.hidden, false);
        assert.match(got.a, new RegExp('^' + a + ' y'));
        assert.match(got.read, new RegExp(a + ' y from you to the target, then ' + b + ' y'));
        assert.equal(got.geo, 0, 'the page asked for a location');
        assert.match(await tab.eval(`document.getElementById('tg-b').innerText`), new RegExp('^' + b + ' y\\s*to middle'), 'the to-middle number is not on screen');
        const after = tab.requests.filter((u) => !u.startsWith(base) && !/^data:|^about:|^chrome/.test(u) && !TILE.test(u));
        assert.deepEqual(after, [], 'the tap made an outside request: ' + mask(after));
    });

    test('Try Just say it: shows the setup card, makes no network request and stores nothing', async () => {
        await tab.go(base + '/');
        await tab.eval(`document.getElementById('try-say').scrollIntoView({ block: 'center' }), true`);
        await sleep(1500);   // let lazy images near it finish
        tab.requests = [];
        // type a sentence the way a visitor does
        await tab.tapEl('#ts-in');
        await tab.eval(`(() => { const i = document.getElementById('ts-in'); i.select(); return true; })()`);
        await tab.type('me vs josh nassau for fun');
        await tab.key('Enter');
        let out = await tab.eval(`document.getElementById('ts-out').innerText`);
        assert.match(out, /HERE’S WHAT I’LL SET UP\s+1 v 1 Nassau/);
        assert.match(out, /Sides\s+Sam vs Josh/); assert.match(out, /Amount\s+No amount/);
        await tab.tapEl('#try-say .chipb:nth-child(3)');
        out = await tab.eval(`document.getElementById('ts-out').innerText`);
        assert.match(out, /Skins/); assert.match(out, /Who’s in\s+Everyone \(4\)/);
        await tab.eval(`(() => { const i = document.getElementById('ts-in'); i.focus(); i.select(); return true; })()`);
        await tab.type('Wolf for twenty a hole');
        await tab.tapEl('#ts-form .go');
        out = await tab.eval(`document.getElementById('ts-out').innerText`);
        assert.match(out, /This demo only knows the sentences above/);
        const local = await tab.eval('({ ls: localStorage.length, ss: sessionStorage.length, cookie: document.cookie, url: location.href })');
        await sleep(500);
        const lazyImages = tab.requests.filter((u) => /\/media\/screens\/[a-z0-9-]+\.webp$/.test(u));
        // The Try the GPS box above may still be fetching its 16 keyed Esri tiles (Nov 11): those are allowed
        // here, nothing else is.
        const other = tab.requests.filter((u) => !lazyImages.includes(u) && !/^https:\/\/ibasemaps-api\.arcgis\.com\/arcgis\/rest\/services\/World_Imagery\/MapServer\/tile\/19\/\d+\/\d+\?token=/.test(u));
        assert.deepEqual(other, [], 'Just say it made a network request');
        assert.deepEqual([local.ls, local.ss, local.cookie], [0, 0, ''], 'Just say it stored something');
        assert.ok(!/[?#]/.test(local.url.replace(base, '')), 'the form navigated: ' + local.url);
        assert.match(await tab.eval(`document.getElementById('try-say').innerText`), /Nothing is saved and nothing is sent/);
    });
});
