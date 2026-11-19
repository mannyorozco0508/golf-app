// ============================================================================
// HOMEPAGE A (Manny's pick 2026-11-19, mockup tournaments/site-sharpen/home-a): the order of hardpan-home.html,
// 12 at-a-glance tiles with "See all N" for the rest, and the "Good to know" questions after Pricing.
//
// 1. Source (comments stripped; user-facing copy matched after helpers/decode-escapes.js, per CLAUDE.md):
//    the sections by id in order, top, see-it, just-say-it, how, everything, features, compare, pricing, faq,
//    get-the-app; the 12 tiles first, in the mockup's order, all 41 still in the grid; the button's count is the
//    tile count; the six questions word for word; the Pro answer's numbers are site-pricing.js slots, no figure typed.
// 2. Chrome at 390x844 (mini-dom cannot hide by nth-child or measure anything): the visitor arrives and touches
//    nothing but the button. 12 tiles show, the rest are 0x0; a tap on "See all" shows all of them without moving
//    the tiles above it; a tap on a tile that was hidden opens the viewer on its picture; nothing is wider than 390.
//
// Every slice is checked for something that must be in it before anything is checked to be absent.
//
// BASELINE against 0e7e932f (hardpan-home.html before the move, sha256 c30ba526…, this file as finished):
//   9 tests: 2 pass / 7 fail (2 + 7 = 9). The two that pass hold what must NOT change: 1.2 (Just say it byte for byte)
//   and 2.3 (a tile past the first 12, round tabs, opens the viewer; every tile showed then). Red: 1.1, 1.3, 1.4, 1.5,
//   2.1, 2.2, 2.4. On the built page: 9 / 0.
// NEGATIVE CONTROLS (each restored from a saved copy by sha): the comparison block moved back above Just say it (1.1, 2.1
//   red); a typed $24.99/yr in the FAQ instead of the slot (1.5); the nth-child(n+13) hide rule removed (1.3, 2.1, 2.4);
//   the scrollBy that keeps Show fewer in place removed (2.4); "for good" changed to "forever" (1.4); the count line
//   removed and the label typed as 44 (1.3, 2.1).
// ============================================================================
'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { decodeEscapes } = require('./helpers/decode-escapes.js');

const ROOT = __dirname;
const raw = fs.readFileSync(path.join(ROOT, 'hardpan-home.html'), 'utf8');
const html = raw.replace(/<!--[\s\S]*?-->/g, '');
const body = html.slice(html.indexOf('<body>'));
// from the opening tag that carries `open` to its own </section> (no hand-written next-section name)
const section = (open) => { const a = body.indexOf(open); assert.ok(a >= 0, 'missing: ' + open); const b = body.indexOf('</section>', a); assert.ok(b > a); return body.slice(a, b + 10); };
// rendered words of a fragment: tags out, entities decoded, \u escapes decoded
const words = (h) => decodeEscapes(h.replace(/<[^>]+>/g, '')
    .replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘').replace(/&rsaquo;/g, '›').replace(/&lsaquo;/g, '‹')
    .replace(/&amp;/g, '&').replace(/&middot;/g, '·').replace(/&nbsp;/g, ' ')).replace(/\s+/g, ' ').trim();

const ORDER = ['top', 'see-it', 'just-say-it', 'how', 'everything', 'features', 'compare', 'pricing', 'faq', 'get-the-app'];
const TWELVE = ['gps', 'event-board', 'skins-tab', 'live-games', 'chat', 'scan-check', 'strokes-gained', 'weekly-code', 'trip', 'results', 'settle', 'play-again'];
const FAQ = [
    ['Is it free?', 'Free for one group of up to 5 golfers, for good. HardPan Pro adds the full GPS map, coaching and hosting for $24.99/yr.'],
    ['What if there’s no signal?', 'GPS and your card work with no signal; scores catch up when you’re back in range.'],
    ['Is it on Android?', 'Yes: iPhone and Android.'],
    ['How do round codes work?', 'Your round has a code. Friends type it or scan the QR and land on the same card.'],
    ['We keep paper cards. Okay?', 'Yes. Snap the card and the scanner reads every score; you check it before it posts.'],
    ['Does HardPan hold money?', 'No. It never holds, sends or takes a cut of money.']
];

describe('1. source', () => {
    test('1.1 the sections, by id, top to bottom; the footer last; the What\'s new link still first inside #features', () => {
        const ids = [...body.matchAll(/<section [^>]*\bid="([^"]+)"/g)].map((m) => m[1]).filter((id) => ORDER.includes(id));
        assert.deepEqual(ids, ORDER);
        const at = ORDER.map((id) => body.indexOf('id="' + id + '"'));
        assert.ok(at.every((x, i) => x > 0 && (i === 0 || x > at[i - 1])), JSON.stringify(at));
        const foot = body.indexOf('<footer>');
        assert.ok(foot > at[at.length - 1], 'the footer is after Get the app');
        // #features holds a nested <section> (Try the GPS), so it runs to the viewer that follows it, not to the first </section>
        const feat = body.slice(body.indexOf('<section class="feat" id="features">'), body.indexOf('<div class="fv" id="fv"'));
        assert.ok(feat.length > 1000, 'positive: the features slice is there');
        assert.match(feat, /^<section class="feat" id="features">\s*<h2 class="ftitle">EVERYTHING IN THE APP<\/h2>\s*<p class="fsub">[^<]+<\/p>\s*<p class="wnlink"><a id="whats-new-link" href="\/whats-new">/);
        // the five carousels follow the tiles, in today's order
        const grps = [...feat.matchAll(/<div class="grp" id="(g-[a-z0-9]+)">/g)].map((m) => m[1]);
        assert.deepEqual(grps, ['g-play', 'g-games', 'g-group', 'g-organize', 'g-better']);
    });

    test('1.2 Just say it is the same section, byte for byte, with its two scripts right behind it', () => {
        const jsi = section('<section class="jsi" id="just-say-it"');
        assert.match(jsi, /<h2 id="jsi-h">Just say it\. We&rsquo;ll set it up\.<\/h2>/);
        assert.equal((jsi.match(/<button type="button" class="jsi-chip( on)?"/g) || []).length, 5);
        assert.equal(require('crypto').createHash('sha256').update(jsi).digest('hex').slice(0, 12), '87e292e98b2e');
        const after = body.slice(body.indexOf(jsi) + jsi.length, body.indexOf('<section class="how" id="how"'));
        assert.equal((after.match(/<script data-jsi>/g) || []).length, 2);
        assert.doesNotMatch(body, /class="jsi-try"|<form[^>]*jsi/, 'no typed Try box was built');
    });

    test('1.3 the tiles: the 12 first in the mockup order, all 41 still there, the rest hidden by the section state, one real button with the count', () => {
        const g = section('<section class="glance" id="everything"');
        assert.match(g, /^<section class="glance" id="everything" aria-labelledby="glance-h" data-tiles="few">/);
        const keys = [...g.matchAll(/<button type="button" class="gt" data-open-key="([^"]+)">/g)].map((m) => m[1]);
        assert.equal(keys.length, 41);
        assert.deepEqual(keys.slice(0, 12), TWELVE);
        assert.equal(new Set(keys).size, 41, 'no tile twice');
        const btn = /<button type="button" class="glance-more" id="glance-more" aria-expanded="false" aria-controls="everything"><span class="gm-l">See all <span id="glance-n">(\d+)<\/span> &rsaquo;<\/span><span class="gm-f">Show fewer &lsaquo;<\/span><\/button>/.exec(g);
        assert.ok(btn, 'the See all button');
        assert.equal(+btn[1], keys.length, 'the label\'s count is the number of tiles');
        assert.ok(g.indexOf(btn[0]) > g.lastIndexOf('class="gt"'), 'the button is under the grid');
        assert.ok(html.includes('.glance[data-tiles="few"] .glance-tiles .gt:nth-child(n+13) { display:none; }'), 'the 13th tile on is hidden while few');
        assert.match(html, /n\.textContent = String\(sec\.querySelectorAll\('\.glance-tiles \.gt'\)\.length\)/, 'the count is set from the tiles at load');
        assert.match(html, /<noscript><style>\.glance\[data-tiles="few"\] \.glance-tiles \.gt:nth-child\(n\+13\) \{ display:flex; \} \.glance-more \{ display:none; \}<\/style><\/noscript>/, 'with no script every tile shows');
    });

    test('1.4 Good to know: six questions after Pricing, the confirmed copy word for word', () => {
        const f = section('<section class="sec faq" id="faq"');
        assert.match(f, /<h2 class="h2" id="faq-h">Good to know<\/h2>/);
        const qa = [...f.matchAll(/<div class="qa"><h3>([\s\S]*?)<\/h3><p>([\s\S]*?)<\/p><\/div>/g)].map((m) => [words(m[1]), words(m[2])]);
        assert.equal(qa.length, 6);
        assert.deepEqual(qa, FAQ);
        const t = words(f);
        assert.ok(t.length > 300, 'positive: the section has its words');
        assert.doesNotMatch(t, /\b(bet\w*|wager\w*|gambl\w*|pool|cash|venmo|paypal|coming soon)\b/i);
        assert.doesNotMatch(t, /18Birdies|SwingU|Golfshot|Hole19|Arccos|GolfNow|Grint/i);
    });

    test('1.5 the Pro answer: its numbers are site-pricing.js slots, no figure typed outside one; what it names is on the Pro card', () => {
        const f = section('<section class="sec faq" id="faq"');
        const free = /<h3>Is it free\?<\/h3><p>([\s\S]*?)<\/p>/.exec(f)[1];
        assert.match(free, /up to <span data-price="free-golfers">5<\/span> golfers/);
        assert.match(free, /for <b data-price="pro-headline">\$[0-9.]+\/yr<\/b>\.$/);
        const unslotted = free.replace(/<(span|b) data-price="[^"]+">[^<]*<\/\1>/g, '');
        assert.ok(unslotted.includes('HardPan Pro adds'), 'positive: the sentence is still there with the slots taken out');
        assert.doesNotMatch(unslotted, /\$|\d/, 'a figure typed outside a slot');
        const pro = /<div class="pc hi"><span class="nm">HardPan Pro<\/span>([\s\S]*?)<\/div>/.exec(section('<section class="sec" id="pricing">'))[1];
        assert.match(pro, /Full GPS map, coaching, hosting\./, 'the Pro card still says what the answer quotes');
    });
});

// ---------------------------------------------------------------------------
// 2. Chrome. --use-mock-keychain + --password-store=basic: without them Chrome on this Mac waits on the keychain.
// ---------------------------------------------------------------------------
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CAN = fs.existsSync(CHROME) && typeof WebSocket === 'function';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webp': 'image/webp', '.mp4': 'video/mp4', '.jpg': 'image/jpeg' };
function serve() {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
            if (p === '/') p = '/hardpan-home.html';
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
        this.profile = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hp-layout-a-'));
        this.port = 9800 + Math.floor(Math.random() * 150);
        this.chrome = spawn(CHROME, ['--headless=new', '--use-mock-keychain', '--password-store=basic', '--remote-debugging-port=' + this.port, '--user-data-dir=' + this.profile, '--window-size=1200,1000', '--hide-scrollbars', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
        let list = null;
        for (let i = 0; i < 120 && !list; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + this.port + '/json', (r) => { let b = ''; r.on('data', (d) => b += d); r.on('end', () => res(JSON.parse(b))); }).on('error', rej)); } catch (e) { await sleep(250); } }
        assert.ok(list, 'Chrome did not come up');
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
    // scroll the element to the middle, let a smooth scroll settle, tap its centre with a real mouse event
    async tapEl(sel) {
        await this.eval(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: 'center', behavior: 'instant' })`);
        await sleep(400);
        const p = await this.eval(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2), w: b.width, h: b.height }; })()`);
        assert.ok(p.w > 0 && p.h > 0, sel + ' has no size: ' + JSON.stringify(p));
        for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await this.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
        await sleep(600);
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
const TILES = `(() => [...document.querySelectorAll('#everything .glance-tiles .gt')].map((b) => { const r = b.getBoundingClientRect(); return { k: b.getAttribute('data-open-key'), w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.top + scrollY) }; }))()`;

describe('2. Chrome at 390x844: the way a visitor arrives', { skip: CAN ? false : 'Chrome or WebSocket not available' }, () => {
    let srv, base, tab;
    before(async () => {
        srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port; tab = new Tab(); await tab.open();
        await tab.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
        await tab.send('Page.navigate', { url: base + '/' }); await sleep(2500);
    });
    after(async () => { if (tab) await tab.close(); if (srv) srv.close(); });

    test('2.1 arrived: the sections in order on screen, 12 tiles with a size and the rest with none, the button reads See all 41, nothing past 390 px', async () => {
        const ys = await tab.eval(`${JSON.stringify(ORDER)}.map((id) => { const e = document.getElementById(id); return e ? Math.round(e.getBoundingClientRect().top + scrollY) : -1; })`);
        assert.ok(ys.every((y, i) => y >= 0 && (i === 0 || y > ys[i - 1])), 'on screen: ' + JSON.stringify(ys));
        const t = await tab.eval(TILES);
        assert.equal(t.length, 41);
        assert.deepEqual(t.filter((x) => x.w > 0 && x.h > 0).map((x) => x.k), TWELVE);
        const b = await tab.eval(`(() => { const b = document.getElementById('glance-more'); const r = b.getBoundingClientRect(); return { text: b.innerText.trim(), exp: b.getAttribute('aria-expanded'), h: Math.round(r.height) }; })()`);
        assert.deepEqual([b.text, b.exp], ['See all 41 ›', 'false']);
        assert.ok(b.h >= 44, 'the button is thumb-size: ' + b.h);
        const wide = await tab.eval(`(() => ({ sw: document.documentElement.scrollWidth, past: [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > 390.5 && !e.closest('.row, .fv, .sheet, [hidden], .vx, .jsi-chips, #tg-map'); }).map((e) => e.tagName + '.' + e.className).slice(0, 5) }))()`);
        assert.equal(wide.sw, 390);
        assert.deepEqual(wide.past, []);
        const faq = await tab.eval(`document.getElementById('faq').innerText`);
        assert.match(faq, /Good to know/);
        assert.match(faq, /HardPan Pro adds the full GPS map, coaching and hosting for \$24\.99\/yr\./, 'the slot is filled on screen');
        assert.deepEqual(tab.errors, []);
    });

    test('2.2 a tap on See all shows all 41 in place: the 12 do not move, the button says Show fewer and aria-expanded is true', async () => {
        const before12 = (await tab.eval(TILES)).slice(0, 12).map((x) => x.y);
        await tab.tapEl('#glance-more');
        const t = await tab.eval(TILES);
        assert.equal(t.filter((x) => x.w > 0 && x.h > 0).length, 41);
        assert.deepEqual(t.slice(0, 12).map((x) => x.y), before12, 'the first 12 moved');
        const b = await tab.eval(`(() => { const b = document.getElementById('glance-more'); return [b.innerText.trim(), b.getAttribute('aria-expanded')]; })()`);
        assert.deepEqual(b, ['Show fewer ‹', 'true']);
    });

    test('2.3 a tile that was hidden opens the viewer on its own picture', async () => {
        await tab.tapEl('#everything .gt[data-open-key="round-tabs"]');
        await sleep(600);
        const v = await tab.eval(`(() => ({ open: !document.getElementById('fv').hidden, title: document.getElementById('fv-title').textContent }))()`);
        assert.deepEqual(v, { open: true, title: 'Card, GPS, Games, Board.' });
        await tab.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await tab.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
        await sleep(400);
        assert.equal(await tab.eval(`document.getElementById('fv').hidden`), true);
    });

    test('2.4 Show fewer hides the rest again and keeps the button where it was on screen', async () => {
        await tab.eval(`document.getElementById('glance-more').scrollIntoView({ block: 'center', behavior: 'instant' })`);
        await sleep(400);
        assert.equal((await tab.eval(TILES)).filter((x) => x.w > 0 && x.h > 0).length, 41, 'positive: it was open');
        const p = await tab.eval(`(() => { const r = document.getElementById('glance-more').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), top: Math.round(r.top) }; })()`);
        for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await tab.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
        await sleep(600);
        assert.equal((await tab.eval(TILES)).filter((x) => x.w > 0 && x.h > 0).length, 12);
        const top = await tab.eval(`Math.round(document.getElementById('glance-more').getBoundingClientRect().top)`);
        assert.ok(Math.abs(top - p.top) <= 2, 'the button jumped from ' + p.top + ' to ' + top);
        assert.equal(await tab.eval(`document.getElementById('glance-more').getAttribute('aria-expanded')`), 'false');
        assert.deepEqual(tab.errors, []);
    });
});
