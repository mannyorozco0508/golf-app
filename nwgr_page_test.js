// ============================================================================
// THE NW GOLF REPORT LANDING (/nwgr, nwgr.html): landing B, a PREVIEW (Manny 2026-11-17 21:5x)
//
// What the page must keep: the lockup to /, the code card (NWGR) and the first-month-free line BOTH tagged COMING
// until the offer code exists, Apple then Google badges with the store URLs the homepage uses, the one real GPS
// screen (plays-like) with its caption, the three feature lines, prices ONLY through site-pricing.js slots whose
// text equals what the fill computes, the footer's real pages and the hardpangolf.com/nwgr line. Nothing on the
// page says $ of its own, a betting word, cash, Venmo or PayPal, "Coming soon", "only", or a competitor's name.
// A static page: no site-features.js, no Firebase, no sw.js. noindex while it is a preview.
//
// TESTS: 10 (8 source + 2 Chrome). BASELINE against pre-build main fc9680e7 (no nwgr.html), measured with Chrome:
// 1 PASS / 9 FAIL / 0 cancelled. 1 + 9 = 10. Tests 1-7 fail (the page is not there), 9 and 10 fail (404: a failed
// load), and test 8 passes by construction (nothing on main mentions nwgr - it guards the OTHER files, not this page).
// On preview-nwgr with the page: 10 / 0 (without Chrome the 2 Chrome tests are skipped: 8 / 0 / 2 skipped).
//
// NEGATIVE CONTROLS (restored by cp from a saved copy, sha RESTORED-OK):
//   C1 "$24.99" typed into the caption (outside a slot)                tests 4, 5, 7 CAUGHT
//   C2 the COMING tag taken off the offer line                          tests 2, 9 CAUGHT
//   C3 the Google badge moved before the Apple badge in the hero        test 3 CAUGHT
//   C4 the screenshot path changed to a file that does not exist         test 5 CAUGHT
//   C5 "Coming soon" typed into the fine print                           test 7 CAUGHT
//   C6 the pro-headline slot's text changed to "$29.99/yr"                test 4 CAUGHT
//
// Chrome: the same CDP harness as hardpan_home_scenes_test.js (--use-mock-keychain: without it Chrome on this Mac
// waits on the login keychain for any http navigation). A cold arrival: the page is served from this tree by a tiny
// static server, navigated to as a visitor would, and nothing on the page is called by name.
// ============================================================================
'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
const { spawn } = require('child_process');

const ROOT = __dirname;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(ROOT, f));
const stripComments = (h) => h.replace(/<!--[\s\S]*?-->/g, '');
const PAGE = 'nwgr.html';
const page = exists(PAGE) ? stripComments(read(PAGE)) : '';
const body = page.slice(page.indexOf('<body>'));
const hero = body.slice(body.indexOf('<section class="wrap hero"'), body.indexOf('</section>'));
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([a-z-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
// A data-price slot's text is a price from site-pricing.js (bound to the fill in test 4), so it is removed before the
// money scan: the scan is for a figure TYPED on the page.
const noSlotText = (h) => h.replace(/(<(\w+)[^>]*data-price="[^"]+"[^>]*>)[^<]*(<\/\2>)/g, '$1$3');
const textOf = (h) => noSlotText(h).replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
const MONEY = /\$|\b(bet|bets|betting|wager\w*|gambl\w*|pot|pots|buy-?ins?|stake|stakes|dollars?|bucks|cash|venmo|paypal|prize\w*)\b/i;
const COMPETITORS = /18birdies|swingu|golfshot|hole19|arccos|golflogix|thegrint|grint\b|golfpad|shot ?scope/i;
const APP_STORE_URL = 'https://apps.apple.com/app/id6808220335';
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.rattlegolf.app';

// site-pricing.js, run as the browser would, to know what each slot's text must be.
function pricing() {
    const w = {};
    vm.runInNewContext(read('site-pricing.js'), { window: w });
    return w.HARDPAN_SITE_PRICING;
}

describe('1. source: nwgr.html, landing B', () => {
    test('1. the page exists, is served at /nwgr by Pages (not a Function route), lockup to /, title and description, noindex while a preview', () => {
        assert.ok(exists(PAGE), 'nwgr.html is missing');
        const routes = JSON.parse(read('_routes.json'));
        assert.ok(!routes.include.some((r) => r === '/nwgr' || r === '/nwgr/*'), '/nwgr would run the Function');
        assert.ok(!exists('_redirects') || !/nwgr/.test(read('_redirects')), 'a redirect rule for /nwgr');
        assert.match(page, /<title>HardPan for NW Golf Report golfers<\/title>/);
        assert.match(page, /<meta name="description" content="HardPan for NW Golf Report golfers: [^"]+">/);
        assert.match(page, /<meta name="robots" content="noindex">/, 'noindex while it is a preview');
        assert.match(body, /<a class="logo" href="\/"><img src="\/media\/home\/hardpan-golf-lockup\.png" alt="HardPan Golf" width="1278" height="222"><\/a>/);
        assert.match(hero, /@nwgolfreport\s*&nbsp;&times;&nbsp;\s*HardPan/, 'the kicker');
        assert.match(hero, /<h1><small>Welcome<\/small>NW Golf Report golfers<\/h1>/);
    });

    test('2. the code card says NWGR, and BOTH the code and the first-month-free line carry a COMING tag; the fine print says the code is not live yet', () => {
        const card = /<div class="code" id="code"[^>]*>([\s\S]*?)<\/div>\s*<div class="badges"/.exec(hero);
        assert.ok(card, 'the code card');
        assert.match(card[1], /<div class="use">Use code<\/div>/);
        assert.match(card[1], /<div class="cd" id="offer-code">NWGR<\/div>/);
        assert.match(card[1], /<div class="offer" id="offer-line">Your first month free with the code, then the founding price\. <span class="cmg">COMING<\/span><\/div>/);
        assert.match(card[1], /The code is not live yet\./);
        assert.equal([...body.matchAll(/class="cmg">COMING</g)].length, 1, 'one COMING tag, on the offer line (the code and the offer are one card)');
        assert.doesNotMatch(body, /Placeholder code/, 'Manny: the code is NWGR, not a placeholder');
    });

    test('3. badges: Apple then Google, twice (hero and end), the homepage URLs and badge files; Get HardPan in the nav goes to the hero badges', () => {
        const sets = [...body.matchAll(/<div class="badges"( id="get")?>([\s\S]*?)<\/div>/g)];
        assert.equal(sets.length, 2, 'two badge rows');
        assert.equal(sets[0][1], ' id="get"', 'the hero badges are #get');
        sets.forEach((s) => {
            const a = [...s[2].matchAll(/<a class="(store-apple|store-google)" href="([^"]+)" data-store="(apple|google)"><img src="([^"]+)" alt="([^"]+)" width="\d+" height="\d+"><\/a>/g)];
            assert.equal(a.length, 2, 'two badge links: ' + s[2].slice(0, 120));
            assert.deepEqual(a.map((m) => m[1]), ['store-apple', 'store-google'], 'Apple first');
            assert.deepEqual(a.map((m) => m[2]), [APP_STORE_URL, PLAY_URL]);
            assert.deepEqual(a.map((m) => m[4]), ['/app-store-badge.svg', '/google-play-badge.png']);
            assert.deepEqual(a.map((m) => m[5]), ['Download on the App Store', 'Get it on Google Play']);
        });
        ['app-store-badge.svg', 'google-play-badge.png', 'hardpan-icon.svg', 'media/home/hardpan-golf-lockup.png'].forEach((f) => assert.ok(exists(f), f));
        assert.match(body, /<a class="btn lime" id="top-get-app" href="#get">Get HardPan<\/a>/);
    });

    test('4. prices only through site-pricing.js slots, each slot\'s text equal to what the fill computes; no dollar figure typed outside a slot', () => {
        const P = pricing();
        const want = {
            'pro-label': P.pro.foundingOpen ? 'Founding price' : 'Yearly',
            'pro-headline': (P.pro.foundingOpen ? P.pro.founding : P.pro.yearly) + '/yr',
            'pro-yearly': P.pro.yearly,
            'pro-trial-days': String(P.pro.trialDays),
            'free-golfers': String(P.freeGolfers)
        };
        const slots = [...body.matchAll(/<(\w+)[^>]*data-price="([^"]+)"[^>]*>([^<]*)<\/\1>/g)].map((m) => ({ key: m[2], text: m[3] }));
        assert.ok(slots.length >= 6, 'positive: the slots are there (' + slots.length + ')');
        slots.forEach((s) => { assert.ok(want[s.key] !== undefined, 'a slot the fill does not know: ' + s.key); assert.equal(s.text, want[s.key], 'slot ' + s.key); });
        ['pro-label', 'pro-headline', 'pro-yearly', 'pro-trial-days', 'free-golfers'].forEach((k) => assert.ok(slots.some((s) => s.key === k), 'slot ' + k + ' missing'));
        assert.match(body, /data-price="pro-headline">[^<]*<\/span> for the first 1,000 golfers\. No end date\. After that, <span data-price="pro-yearly">[^<]*<\/span>\/yr\. <span style="white-space:nowrap"><span data-price="pro-trial-days">[^<]*<\/span>-day<\/span> free trial\./, 'the price sentence');
        assert.doesNotMatch(textOf(body), /\$\s?[0-9]/, 'a dollar figure typed outside a slot');
        assert.match(body, /<script src="\/site-pricing\.js\?v=[0-9a-f]{8}"><\/script>/, 'the versioned pricing script');
        assert.match(body, /if \(typeof window\.HardPanSitePricingFill === 'function'\) window\.HardPanSitePricingFill\(document\);/);
    });

    test('5. landing B: the one GPS screen is the real plays-like capture (both sizes on disk), captioned as the pitch says; the three feature lines', () => {
        const img = /<div class="phone"><img ([^>]*)><\/div>\s*<p class="cap">([^<]*)<\/p>/.exec(body);
        assert.ok(img, 'the phone picture + caption');
        const a = attrs(img[1]);
        assert.equal(a.src, '/media/screens/plays-like-400.webp');
        assert.equal(a.srcset, '/media/screens/plays-like-400.webp 400w, /media/screens/plays-like-940.webp 940w');
        ['media/screens/plays-like-400.webp', 'media/screens/plays-like-940.webp'].forEach((f) => assert.ok(exists(f), f));
        assert.match(a.alt, /Plays like 141 yards/, 'a real alt of the real screen');
        assert.equal(img[2], 'Wind and elevation in one number, on a satellite map.');
        const feats = [...body.matchAll(/<li><span class="n">(\d)<\/span><div><b>([^<]*)<\/b>/g)].map((m) => m[2]);
        assert.deepEqual(feats, ['Yardages to the green and hazards on a satellite map', 'Wind and elevation in one plays-like number', 'Group side games with scoring and settle up']);
        assert.equal([...body.matchAll(/<img /g)].length, 1 + 1 + 4, 'the lockup, the screen, four badges: nothing else');
        [...body.matchAll(/<img src="(\/media\/[^"]+)"/g)].forEach((m) => assert.ok(exists(m[1].slice(1)), m[1]));
    });

    test('6. the footer: hardpangolf.com/nwgr, the four real pages, the trademark line; the money sentence', () => {
        const foot = /<footer>([\s\S]*?)<\/footer>/.exec(body);
        assert.ok(foot);
        assert.match(foot[1], /<div class="url">hardpangolf\.com\/nwgr<\/div>/);
        const hrefs = [...foot[1].matchAll(/<a href="([^"]+)">/g)].map((m) => m[1]);
        assert.deepEqual(hrefs, ['/help', '/support', '/privacy', '/terms']);
        hrefs.forEach((h) => assert.ok(exists(h.slice(1) + '.html'), h + ' has no page'));
        assert.match(foot[1], /Apple, the Apple logo and App Store are trademarks of Apple Inc\./);
        assert.match(foot[1], /Google Play and the Google Play logo are trademarks of Google LLC\./);
        assert.match(body, /It never holds or moves money\./);
    });

    test('7. words that may not be on the page: $ outside a slot, betting words, cash, Venmo, PayPal, prizes, "Coming soon", "only", a competitor, a test event code', () => {
        const t = textOf(body);
        assert.ok(/NW Golf Report golfers/.test(t), 'positive: the text was read');
        assert.doesNotMatch(t, MONEY, (MONEY.exec(t) || [])[0]);
        assert.doesNotMatch(body, /Coming soon/i);
        assert.doesNotMatch(t, /\bonly\b/i, 'no "only" claims');
        assert.doesNotMatch(t, COMPETITORS, (COMPETITORS.exec(t) || [])[0]);
        assert.doesNotMatch(page, /R7SK48|Test 46A|NA4EZB|KHPSL4|3MKUCF|P7S2BE|VETDEMO/i);
        assert.doesNotMatch(page, /site-features\.js|firebase|sw\.js|site-clips\.js|site-esri/i, 'a static page: no viewer script, no app plumbing');
    });

    test('8. not a shell file, not in the native bundle, not a Function route; the homepage still has no link to it (a campaign page)', () => {
        assert.doesNotMatch(read('sw.js'), /nwgr/);
        assert.doesNotMatch(read('sync-mobile-web.js'), /nwgr/);
        assert.doesNotMatch(read('_routes.json'), /nwgr/);
        assert.doesNotMatch(stripComments(read('hardpan-home.html')), /nwgr/i);
    });
});

// ---------------------------------------------------------------------------
// 2. Chrome, a cold arrival at /nwgr.
// ---------------------------------------------------------------------------
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CAN = fs.existsSync(CHROME) && typeof WebSocket === 'function';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webp': 'image/webp' };
function serve() {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
            if (p === '/nwgr') p = '/nwgr.html';   // Pages' Pretty URL
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
        this.profile = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hp-nwgr-'));
        this.port = 9400 + Math.floor(Math.random() * 400);
        this.chrome = spawn(CHROME, ['--headless=new', '--use-mock-keychain', '--remote-debugging-port=' + this.port, '--user-data-dir=' + this.profile, '--window-size=1400,1000', '--hide-scrollbars', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
        let list = null;
        for (let i = 0; i < 60 && !list; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + this.port + '/json', (r) => { let b = ''; r.on('data', (d) => b += d); r.on('end', () => res(JSON.parse(b))); }).on('error', rej)); } catch (e) { await sleep(250); } }
        const pg = list.find((t) => t.type === 'page');
        this.ws = new WebSocket(pg.webSocketDebuggerUrl);
        this.id = 0; this.pending = new Map(); this.errors = []; this.failed = [];
        this.ws.addEventListener('message', (ev) => {
            const d = JSON.parse(ev.data);
            if (d.id && this.pending.has(d.id)) { this.pending.get(d.id)(d); this.pending.delete(d.id); }
            if (d.method === 'Runtime.exceptionThrown') this.errors.push(JSON.stringify(d.params.exceptionDetails).slice(0, 200));
            if (d.method === 'Network.loadingFailed') this.failed.push(d.params.errorText);
            if (d.method === 'Network.responseReceived' && d.params.response.status >= 400) this.failed.push(d.params.response.status + ' ' + d.params.response.url);
        });
        await new Promise((r) => this.ws.addEventListener('open', r));
        await this.send('Runtime.enable'); await this.send('Page.enable'); await this.send('Network.enable');
    }
    send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const i = ++this.id; this.pending.set(i, resolve);
            this.ws.send(JSON.stringify({ id: i, method, params }));
            setTimeout(() => { if (this.pending.has(i)) { this.pending.delete(i); reject(new Error(method + ' timed out')); } }, 30000);
        });
    }
    async metrics(w, h) { await this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 }); }
    async eval(expression) {
        const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
        return r.result.result.value;
    }
    async go(url) { this.errors = []; this.failed = []; await this.send('Page.navigate', { url }); await sleep(1500); }
    async close() { try { this.ws.close(); } catch (e) {} try { this.chrome.kill('SIGKILL'); } catch (e) {} try { fs.rmSync(this.profile, { recursive: true, force: true }); } catch (e) {} }
}
const MEASURE = `(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), h: Math.round(b.height), w: Math.round(b.width) }; };
    const small = [...document.querySelectorAll('a.btn, .badges a, footer a')].filter((e) => e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 44).map((e) => e.className || e.textContent);
    // the COMING chip is the site's 11.5 px label (hardpan-home.html .clipchip / organizers.html .cmg), not reading text
    const text = [...document.querySelectorAll('h1, p, b, span, a, div')].filter((e) => e.children.length === 0 && e.textContent.trim() && !e.closest('footer') && !e.matches('.cmg')).map((e) => e.tagName + '.' + e.className + ':' + parseFloat(getComputedStyle(e).fontSize)).filter((x) => parseFloat(x.split(':').pop()) < 13);
    const img = document.querySelector('.phone img');
    return { sw: document.documentElement.scrollWidth, h1: r('h1'), code: r('#offer-code'), offer: r('#offer-line'), badges: r('#get'), phone: r('.phone'), price: r('.price'), small, text,
        headline: document.querySelector('[data-price="pro-headline"]').textContent, coming: document.querySelectorAll('.cmg').length, imgOk: !!(img && img.complete && img.naturalWidth > 0), nav: r('#top-get-app') }; })()`;

describe('2. in Chrome: a cold arrival at /nwgr', { skip: CAN ? false : 'Chrome or WebSocket not available' }, () => {
    let srv, base, tab;
    before(async () => { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port; tab = new Tab(); await tab.open(); });
    after(async () => { if (tab) await tab.close(); if (srv) srv.close(); });

    test('9. 390x844: no page error, nothing failed to load, no sideways scroll; the headline, the code, the COMING offer line and both badges above the fold; the real screen drawn; tap targets 44 px', async () => {
        await tab.metrics(390, 844);
        await tab.go(base + '/nwgr');
        assert.deepEqual(tab.errors, []);
        assert.deepEqual(tab.failed, [], 'failed loads');
        const m = await tab.eval(MEASURE);
        assert.equal(m.sw, 390, 'sideways scroll');
        assert.ok(m.h1 && m.h1.b <= 844, 'h1 ' + JSON.stringify(m.h1));
        assert.ok(m.code && m.code.b <= 844 && m.code.h >= 36, 'code ' + JSON.stringify(m.code));
        assert.ok(m.offer && m.offer.b <= 844, 'offer line ' + JSON.stringify(m.offer));
        assert.ok(m.badges && m.badges.b <= 844 && m.badges.h >= 44, 'badges ' + JSON.stringify(m.badges));
        assert.equal(m.coming, 1, 'one COMING tag rendered');
        assert.equal(m.headline, '$24.99/yr', 'the slot after the fill');
        assert.ok(m.imgOk, 'the GPS screen loaded');
        assert.ok(m.nav && m.nav.h >= 44, 'nav button ' + JSON.stringify(m.nav));
        assert.deepEqual(m.small, [], 'tap targets under 44 px');
        assert.deepEqual(m.text, [], 'text under 13 px');
    });

    test('10. 1280x800: no error, no sideways scroll, the screen beside the lines, the code card and badges above the fold', async () => {
        await tab.metrics(1280, 800);
        await tab.go(base + '/nwgr');
        assert.deepEqual(tab.errors, []);
        assert.deepEqual(tab.failed, []);
        const m = await tab.eval(MEASURE);
        assert.equal(m.sw, 1280, 'sideways scroll');
        assert.ok(m.badges && m.badges.b <= 800, 'badges ' + JSON.stringify(m.badges));
        assert.ok(m.code && m.code.b <= 800, 'code ' + JSON.stringify(m.code));
        assert.ok(m.phone && m.phone.w >= 280 && m.phone.w <= 320, 'phone ' + JSON.stringify(m.phone));
        assert.ok(m.imgOk);
    });
});
