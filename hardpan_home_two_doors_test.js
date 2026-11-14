// ============================================================================
// TWO DOORS, OPTION B (Manny's pick; build on a preview, ADVISOR-20261114-1527,
// with ADVISOR-20261114-1248 / -1256). hardpangolf.com/ (hardpan-home.html):
//
//   - the hero keeps "Play it. Run it." and gains two buttons under it:
//     "I'm a golfer" scrolls to the app section (#app, store badges inside it)
//     and "I run events" goes to /tournaments;
//   - a slim Golfers | Organizers bar is pinned at the top while scrolling,
//     Golfers lit here. Its CSS is site-doors.css so the /tournaments landing
//     (preview-landing, unmerged) can link the same file and light Organizers;
//   - the header lockup is the mark + "HardPan Golf" over "GPS & GAMES"
//     (Manny 15:26), the mark being HardPan-icon-light.svg copied unchanged as
//     hardpan-golf-icon.svg (the repo's hardpan-icon.svg is the NIGHT mark);
//   - pricing shows ONLY what is live: the Founding line. Every other paid line
//     reads "see in app" (live-price check pending, Advisor 2026-11-14 15:27);
//     $7.99 and $49.99 never reach the page, in source or on screen;
//   - footer: "HardPan is a product of Rattle Golf LLC." Rattle nowhere else
//     on screen.
//
// HOW. Sections 1-2 read source. Section 3 serves the repo over a local http
// server (root-absolute /site-doors.css and /hardpan-golf-icon.svg do not load
// under file://) and opens hardpan-home.html in headless Chrome at 390x844 over
// CDP, touching nothing but a real mouse tap on "I'm a golfer" and a window
// scroll. Every assertion reads innerText, computed style or geometry; no page
// function is called. Not tools/lib/cold-arrival.js: its Chrome has no
// --use-mock-keychain, and on this Mac Page.navigate to an http origin hangs
// 30 s and times out (measured 2026-11-14, a one-line page too); file:// works
// there but cannot load the root-absolute stylesheet the pinned bar lives in.
// The Tab below is web_d_clip_hold_chrome_test.js's, with outside hosts mapped
// to nothing (no live traffic: the Esri tiles do not load, by design).
//
// WEBSITE vs 2.0.7 (ADVISOR-20261114-1558, same branch): section 1b. The
// 72R-A green slope section (#green-slope) is one <img> at /site/gps-green-slope.png
// tagged "coming in the next update"; the Desk card no longer claims check-in
// and the organizers panel says check-in and card payments are COMING; the GPS
// card names plays-like/wind and Lock Screen yardages as text lines.
//
// FINAL COUNTS (this file as it stands, 18 tests): with the build 18 pass /
// 0 fail. BASELINE against main e1312cf2 (hardpan-home.html sha256 c9e16823...
// copied in; site-doors.css, hardpan-golf-icon.svg and site/ moved out; all
// restored by sha): 1 pass / 17 fail = 18. The one pass is "no script from a
// third-party host": main had none either, which is the point of that guard.
// CONTROLS (27, each restored by sha from a saved copy, each red): golfer door
// -> #golfers (2), events door -> /tournament (1), Golfers not lit (3), bar not
// sticky (4), old lockup text (2), night mark in the light file (1), top Play
// badge elsewhere (1), GPS card loses green slope (1), footer legal line
// dropped (2), a third-party script (1), the monthly slot back (3), headline
// falls back to the yearly price (1), board scores not red (1), no
// scroll-margin under the bar (2), Rattle in the hero (2), slope picture moved
// (2), coming tag dropped (2), Desk claims check-in (1), organizer COMING line
// dropped (2), Lock Screen line dropped (1), the live GPS card says
// "Smooth" again (1); and on the re-pins: old footer
// wording -> marketing_home_test red, "/yr" headline -> marketing red, events
// door -> /tournament -> hardpan_home_52a_test red, the old Desk headline ->
// web_e_features_test red, the Trip Pass price slot back -> marketing red,
// Help out of the main nav -> marketing red.
// ============================================================================
'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');
const os = require('os');
const { decodeEscapes: decode } = require('./helpers/decode-escapes.js');

const ROOT = __dirname;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const RAW = read('hardpan-home.html');
const HTML = RAW.replace(/<!--[\s\S]*?-->/g, '');
const APPLE = 'https://apps.apple.com/app/id6808220335';
const PLAY = 'https://play.google.com/store/apps/details?id=com.rattlegolf.app';

// The region from an element's open tag to the end of its section, by id.
function sectionById(id) {
    const at = HTML.indexOf('id="' + id + '"');
    if (at < 0) return '';
    const start = HTML.lastIndexOf('<section', at);
    const end = HTML.indexOf('</section>', at);
    return start >= 0 && end > at ? HTML.slice(start, end) : '';
}
const anchorById = (id) => (new RegExp('<a\\b[^>]*\\bid="' + id + '"[^>]*>([\\s\\S]*?)<\\/a>').exec(HTML) || []);

describe('1. SOURCE: doors, bar, lockup, badges, footer, scripts', () => {
    test('two buttons under the headline: I\'m a golfer -> #app, I run events -> /tournaments', () => {
        const hero = /<section class="wrap hero"[^>]*>([\s\S]*?)<\/section>/.exec(HTML);
        assert.ok(hero, 'positive: the hero section exists');
        assert.match(hero[1], /Play it\. Run it\./);
        const g = /<a\b[^>]*id="door-golfer"[^>]*>([\s\S]*?)<\/a>/.exec(hero[1]);
        const e = /<a\b[^>]*id="door-events"[^>]*>([\s\S]*?)<\/a>/.exec(hero[1]);
        assert.ok(g && e, 'both door buttons are in the hero');
        assert.match(g[0], /href="#app"/);
        assert.match(decode(g[1]), /^I'm a golfer/);
        assert.match(e[0], /href="\/tournaments"/);
        assert.match(decode(e[1]), /^I run events/);
        assert.ok(hero[1].indexOf('</h1>') < hero[1].indexOf('id="door-golfer"'), 'the buttons sit under the headline');
        assert.ok(hero[1].indexOf('id="door-golfer"') < hero[1].indexOf('id="door-events"'), 'golfer first');
    });

    test('the pinned bar: first thing in the body, Golfers lit (aria-current), Organizers -> /tournaments, sticky in site-doors.css', () => {
        const body = HTML.slice(HTML.indexOf('<body>') + 6).trimStart();
        assert.match(body, /^<nav class="door-bar"/, 'the bar is the first element of the body');
        const bar = /<nav class="door-bar"[^>]*>([\s\S]*?)<\/nav>/.exec(HTML)[1];
        assert.match(bar, /<a href="\/" aria-current="page">Golfers<\/a>/);
        assert.match(bar, /<a href="\/tournaments">Organizers<\/a>/);
        assert.match(HTML, /<link rel="stylesheet" href="\/site-doors\.css">/);
        const css = read('site-doors.css');
        assert.match(css, /\.door-bar\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/);
        assert.match(css, /\.door-bar a\[aria-current="page"\]\s*\{[^}]*background:/, 'the lit door has its own colour');
    });

    test('the lockup reads HardPan Golf / GPS & GAMES on the light mark, and links to /', () => {
        const logo = /<a class="logo" href="\/">([\s\S]*?)<\/a>/.exec(HTML);
        assert.ok(logo, 'positive: the lockup is an <a href="/">');
        assert.match(logo[1], /<img src="\/hardpan-golf-icon\.svg"/);
        assert.match(logo[1], /<span class="logo-1">HardPan Golf<\/span>/);
        assert.match(logo[1], /<span class="logo-2">GPS &amp; GAMES<\/span>/);
        assert.doesNotMatch(logo[1], /Golf GPS &amp; Games|HardPan:/, 'the old lockup text is back');
        // HardPan-icon-light.svg from /Users/manny/Desktop/HardPan-Logo, copied unchanged (sha256 1af1d948...).
        const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'hardpan-golf-icon.svg'))).digest('hex');
        assert.equal(sha, '1af1d948c4af7c89cedf2cca457db34e17eac9285bfc1bc3b765bd723b0859d6');
    });

    test('store badges at the top (inside #app) and at the bottom (#get-the-app), real links', () => {
        for (const id of ['app', 'get-the-app']) {
            const s = sectionById(id);
            assert.ok(s.length > 100, id + ': positive, the section exists');
            const a = /<a class="store-apple" href="([^"]+)"/.exec(s), g = /<a class="store-google" href="([^"]+)"/.exec(s);
            assert.ok(a && g, id + ': both badges');
            assert.equal(a[1], APPLE); assert.equal(g[1], PLAY);
        }
        assert.ok(HTML.indexOf('id="app"') < HTML.indexOf('id="features"'), '#app is the first band, above the feature rows');
    });

    test('the GPS card: course maps, distances to the green, green slope, the free trial', () => {
        const s = sectionById('app');
        assert.match(s, /id="gps-card"/);
        // "Green slope", not the brief's "Smooth green slope": the smooth 1 m shading is 72R-A, not in a store
        // build yet (ADVISOR-20261114-1558 standing rule), so it lives in #green-slope under its COMING tag.
        ['Course maps', 'Distances to the green', 'Green slope'].forEach((t) => assert.ok(s.includes('<li>' + t + '</li>'), t));
        assert.doesNotMatch(s, /smooth/i, 'the live GPS card claims the coming smooth slope');
        assert.match(s, /<span data-price="pro-trial-days"><\/span>-day free trial/, 'the trial days come from site-pricing.js');
    });

    test('the footer line, and Rattle nowhere else in the markup', () => {
        const foot = /<footer>([\s\S]*?)<\/footer>/.exec(HTML);
        assert.ok(foot);
        assert.match(foot[1], /HardPan is a product of Rattle Golf LLC\./);
        assert.doesNotMatch(HTML, /a Rattle Golf LLC app/);
        const outside = HTML.replace(/<script[\s\S]*?<\/script>/g, '').replace(foot[0], '').replace(/https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.rattlegolf\.app/g, '');
        assert.doesNotMatch(outside, /rattle/i, 'Rattle outside the legal footer');
    });

    test('no script from a third-party host (every src is the site\'s own)', () => {
        const srcs = [...HTML.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
        assert.ok(srcs.length >= 4, 'positive: the page\'s own scripts were read');
        srcs.forEach((s) => assert.match(s, /^\/[a-z0-9-]+\.js$/, s));
        const links = [...HTML.matchAll(/<link\b[^>]*\bhref="([^"]+)"/g)].map((m) => m[1]);
        links.forEach((h) => assert.match(h, /^\//, 'a stylesheet or icon from another host: ' + h));
    });
});

describe('1b. SOURCE: the site against the 2.0.7 stores (ADVISOR-20261114-1558)', () => {
    test('#green-slope: ONE <img> at /site/gps-green-slope.png, the whole section tagged coming in the next update', () => {
        const s = sectionById('green-slope');
        assert.ok(s.length > 100, 'positive: the section exists');
        const imgs = s.match(/<img\b[^>]*>/g) || [];
        assert.equal(imgs.length, 1, 'one picture, so the real capture replaces a file, not markup');
        assert.match(imgs[0], /src="\/site\/gps-green-slope\.png"/);
        assert.match(imgs[0], /alt="[^"]{40,}"/);
        assert.match(s, /<span class="soon-tag">COMING IN THE NEXT UPDATE<\/span>/);
        assert.ok(s.indexOf('soon-tag') < s.indexOf('<h2'), 'the tag sits above the section headline');
        const png = fs.readFileSync(path.join(ROOT, 'site/gps-green-slope.png'));
        assert.equal(png.readUInt32BE(16), 402); assert.equal(png.readUInt32BE(20), 828);
        assert.ok(HTML.indexOf('id="green-slope"') < HTML.indexOf('id="features"'), 'right under the app band');
    });

    test('nothing that is only on a preview is shown as available: check-in and card payments are COMING', () => {
        const desk = /<li class="fc" id="f-desk"[\s\S]*?<\/li>/.exec(HTML);
        assert.ok(desk, 'positive: the Desk card exists');
        assert.match(desk[0], /<h3>Sign-ups, one desk\.<\/h3>/);
        assert.doesNotMatch(desk[0], /check-in/i, 'the Desk card claims check-in, which is on a preview only');
        const org = /<div class="panel org" id="organizers">([\s\S]*?)<\/section>/.exec(HTML);
        assert.ok(org, 'positive: the organizers panel');
        assert.match(org[1], /<p class="org-soon">COMING: golfer check-in on event day, and entry fees paid by card\.<\/p>/);
        // the only other check-in mention on the page is that COMING line
        assert.equal((HTML.match(/check-in/gi) || []).length, 1);
    });

    test('the GPS card names the live GPS features without a picture as text lines', () => {
        const s = sectionById('app');
        ['Plays-like with wind and elevation', 'Yardages on the Lock Screen (iPhone)'].forEach((t) => assert.ok(s.includes('<li>' + t + '</li>'), t));
    });
});

describe('2. SOURCE: pricing shows only what is live', () => {
    test('the page source never carries $7.99 or $49.99, and has Founding + "see in app"', () => {
        assert.doesNotMatch(RAW, /7\.99|49\.99/);
        const p = sectionById('pricing');
        assert.match(p, /id="price-founding"[\s\S]*data-price="pro-headline"/, 'the Founding card and its one price slot');
        assert.match(p, /the first 1,000 golfers/);
        assert.ok((p.match(/see in app/g) || []).length >= 3, 'monthly, yearly-after-founding, Host Pro, Trip Pass');
        ['pro-yearly', 'pro-monthly', 'host-yearly', 'trip-pass"'].forEach((k) => assert.ok(!p.includes('data-price="' + k), k + ' slot is back on the page'));
    });

    test('run as written (site-pricing.js + the page\'s inline fill): $24.99 / year, and no other price text', () => {
        const slots = [];
        RAW.replace(/data-price="([^"]+)"/g, (_, k) => { slots.push({ key: k, textContent: '', getAttribute: () => k }); return ''; });
        const inline = /<script>\s*([\s\S]*?)<\/script>/.exec(RAW);
        const run = (tweak) => {
            slots.forEach((s) => { s.textContent = ''; });
            const sb = { window: {}, document: { querySelectorAll: (s) => (s === '[data-price]' ? slots : []) } };
            sb.window.document = sb.document;
            vm.createContext(sb);
            vm.runInContext(read('site-pricing.js'), sb);
            if (tweak) tweak(sb.window.HARDPAN_SITE_PRICING);
            vm.runInContext(inline[1], sb);
            return Object.fromEntries(slots.map((s) => [s.key, s.textContent]));
        };
        const open = run();
        assert.equal(open['pro-headline'], '$24.99 / year');
        assert.equal(open['pro-label'], 'Founding price');
        Object.values(open).forEach((v) => assert.doesNotMatch(v, /7\.99|49\.99|29\.99|14\.99/));
        // founding closed in site-pricing.js: the headline must not fall back to an unconfirmed yearly price
        const closed = run((P) => { P.pro.foundingOpen = false; });
        assert.equal(closed['pro-headline'], 'see in app');
        Object.values(closed).forEach((v) => assert.doesNotMatch(v, /7\.99|49\.99/));
    });
});

// ---------------------------------------------------------------------------
// 3. CHROME, cold, 390x844, over http.
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.mp4': 'video/mp4' };
let server, base;
before(async () => {
    server = http.createServer((req, res) => {
        const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        const f = path.join(ROOT, p === '/' ? 'hardpan-home.html' : p);
        if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
        fs.createReadStream(f).pipe(res);
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = 'http://127.0.0.1:' + server.address().port;
});
after(() => server && server.close());

class Tab {
    async open(w, h) {
        this.profile = fs.mkdtempSync(path.join(os.tmpdir(), 'two-doors-'));
        this.chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--use-mock-keychain',
            '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--remote-debugging-port=0', '--user-data-dir=' + this.profile, 'about:blank'],
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
        await this.send('Emulation.setDeviceMetricsOverride', { width: w || 390, height: h || 844, deviceScaleFactor: 2, mobile: (w || 390) < 700 });
        return this;
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
    async go(url) { await this.send('Page.navigate', { url }); await sleep(1800); }
    // A real tap: the element's centre on screen, mouse press and release (it must already be on screen).
    async tapEl(sel) {
        const p = await this.eval(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
        for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await this.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
        return p;
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

const READ = `JSON.stringify((function () {
  var q = function (s) { return document.querySelector(s); };
  var r = function (e) { if (!e) return null; var b = e.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), l: Math.round(b.left), r: Math.round(b.right), h: Math.round(b.height) }; };
  var bar = q('.door-bar'), lit = q('.door-bar a[aria-current="page"]');
  var foot = q('footer'), g = q('#door-golfer'), e = q('#door-events');
  return { y: Math.round(window.scrollY), hash: location.hash, vw: window.innerWidth, vh: window.innerHeight, sw: document.scrollingElement.scrollWidth,
    bar: r(bar), barText: bar ? bar.innerText.replace(/\\s+/g, ' ').trim() : null, lit: lit ? lit.innerText : null, barPos: bar ? getComputedStyle(bar).position : null,
    golfer: r(g), events: r(e), golferText: g ? g.innerText : null, eventsText: e ? e.innerText : null,
    app: r(q('#app')), apple: r(q('#app .store-apple img')), google: r(q('#app .store-google img')),
    logo: q('.logo') ? q('.logo').innerText.replace(/\\s+/g, ' ').trim() : null, logoImg: q('.logo img') ? q('.logo img').naturalWidth : -1,
    pricing: q('#pricing') ? q('#pricing').innerText.replace(/\\s+/g, ' ') : null,
    body: document.body.innerText, footer: foot ? foot.innerText : null,
    slope: q('#green-slope') ? q('#green-slope').innerText.replace(/\\s+/g, ' ') : null, slopeImg: (function () { var i = q('#green-slope img'); if (!i) return null; i.loading = 'eager'; return i.getAttribute('src'); })(),
    org: q('#organizers') ? q('#organizers').innerText : null,
    under: Array.prototype.map.call(document.querySelectorAll('.board .row b'), function (b) { return [b.innerText, getComputedStyle(b).color]; }) };
})())`;
const visit = async (fn) => {
    const tab = await new Tab().open();
    try { await tab.go(base + '/'); return await fn(tab); } finally { await tab.close(); }
};
const read$ = async (tab) => JSON.parse(await tab.eval(READ));

describe('3. CHROME, arrive at / (390x844), touch nothing but the tap', () => {
    test('arrival: the bar on top with Golfers lit, the lockup, both doors on the first screen, no sideways scroll', async () => {
        const a = await visit(read$);
        assert.equal(a.barText, 'Golfers Organizers');
        assert.equal(a.lit, 'Golfers');
        assert.equal(a.barPos, 'sticky', 'site-doors.css loaded');
        assert.equal(a.bar.t, 0);
        assert.ok(a.bar.h >= 40 && a.bar.h <= 52, 'a slim bar: ' + a.bar.h);
        assert.equal(a.logo, 'HardPan Golf GPS & GAMES');
        assert.ok(a.logoImg > 0, 'the mark loaded');
        assert.ok(a.sw <= a.vw, 'scrollWidth ' + a.sw);
        assert.ok(a.golfer && a.events, 'positive: both doors drew');
        assert.ok(a.golfer.b <= a.vh && a.events.b <= a.vh, 'both doors on the first screen: ' + JSON.stringify([a.golfer, a.events]));
        assert.ok(a.golfer.h >= 44 && a.events.h >= 44, 'thumb-size doors');
        assert.match(a.golferText, /^I'm a golfer/); assert.match(a.eventsText, /^I run events/);
    });

    test('a real tap on "I\'m a golfer" lands the app section under the bar, both badges on screen', async () => {
        const a = await visit(async (tab) => { await tab.tapEl('#door-golfer'); await sleep(1500); return read$(tab); });
        assert.equal(a.hash, '#app');
        assert.ok(a.y > 200, 'the page scrolled: ' + a.y);
        assert.equal(a.bar.t, 0, 'the bar stayed pinned');
        assert.ok(a.app.t >= a.bar.b - 2 && a.app.t <= a.bar.b + 24, 'the section starts just under the bar: ' + JSON.stringify([a.bar, a.app]));
        [a.apple, a.google].forEach((b) => assert.ok(b && b.t >= a.bar.b && b.b <= a.vh, 'a badge is on screen: ' + JSON.stringify(b)));
    });

    test('scrolled to the footer: the bar is still pinned at the top; the footer line; Rattle only there', async () => {
        const a = await visit(async (tab) => { await tab.eval('window.scrollTo(0, document.scrollingElement.scrollHeight), true'); await sleep(800); return read$(tab); });
        assert.ok(a.y > 3000, 'positive: scrolled far down: ' + a.y);
        assert.equal(a.bar.t, 0);
        assert.equal(a.lit, 'Golfers');
        assert.match(a.footer, /HardPan is a product of Rattle Golf LLC\./);
        assert.equal((a.body.match(/Rattle/g) || []).length, 1, 'Rattle on screen outside the footer line');
    });

    test('rendered pricing: $24.99 / year Founding, "see in app", never $7.99 / $49.99 anywhere on screen', async () => {
        const a = await visit(read$);
        assert.match(a.pricing, /\$24\.99 \/ year/);
        assert.match(a.pricing, /Founding price/);
        assert.match(a.pricing, /the first 1,000 golfers/);
        assert.match(a.pricing, /see in app/);
        assert.doesNotMatch(a.body, /7\.99|49\.99/);
    });

    test('rendered: the green-slope section says COMING IN THE NEXT UPDATE and its picture loads; the organizer COMING line', async () => {
        const a = await visit(async (tab) => { await tab.eval("document.getElementById('green-slope').scrollIntoView(), true"); await sleep(1200);
            const r = await read$(tab); r.nw = await tab.eval("document.querySelector('#green-slope img').naturalWidth"); return r; });
        assert.match(a.slope, /COMING IN THE NEXT UPDATE/);
        assert.match(a.slope, /See which way the green breaks/);
        assert.equal(a.slopeImg, '/site/gps-green-slope.png');
        assert.equal(a.nw, 402, 'the picture loaded');
        assert.match(a.org, /COMING: golfer check-in on event day, and entry fees paid by card\./);
    });

    test('the example board\'s under-par scores are red', async () => {
        const a = await visit(read$);
        assert.ok(a.under.length >= 3, 'positive: the board rows drew');
        a.under.forEach(([t, c]) => { assert.match(t, /^−\d+$/); assert.equal(c, 'rgb(192, 57, 43)', t + ' is ' + c); });
    });
});
