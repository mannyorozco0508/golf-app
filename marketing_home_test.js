// ============================================================================
// THE MARKETING PAGE LIVES AT /home, AND / STAYS THE APP (website-b,
// ADVISOR-20261108-0356, Manny picked design B)
//
// THE SPLIT CHOSEN: the marketing page ships at /home (a _redirects rewrite to
// hardpan-home.html). / is untouched: index.html, which sends a visit with no
// ?game= to the admin.html front door ("What are you setting up?"). Every game,
// group, tournament, sign-in and API path is served exactly as on c65b45bd.
//
// WHY NOT "MARKETING AT / FOR PLAIN VISITS" - section 4 below measures it. The
// worker's install fetches ./index.html, Cloudflare 308s that to / with NO
// query, so a plain-visit split at / would precache the MARKETING page as the
// app shell; offline, /?game=CODE falls back (ignoreSearch) to the cached / and
// a golfer at a course with no signal opens the marketing page, not the round.
//
// WHAT THIS FILE PROVES, AND HOW
//   1. The page: its links (Get the app, Run an event, footer), the store
//      placeholders, and that it carries no dollar figure of its own.
//   2. Prices: site-pricing.js against terms.html section 6 and (when the
//      dev-205 branch is in this repo) the app's gps-config.js / hp-pricing.js.
//      The page's every data-price slot is filled from it - run through the
//      page's own inline call, not by naming the slots by hand.
//   3. Routing: _redirects has only the /home rules and none can reach /, the
//      app pages, /api or /__/; _routes.json sends none of the new paths to a
//      Function; functions/index.js (the / Function) still calls next() for /,
//      /?game=, /?tourney= and still sends the Tournaments host to /tournament;
//      the middleware still proxies /__/auth/ and blocks nothing new.
//   4. The service worker: CACHE_VERSION and the shell list unchanged; offline,
//      /?game=TEST still opens the app after /home was visited; and a NEGATIVE
//      CONTROL showing the plain-visit split would have served the marketing
//      page to that same offline game link.
// It is NOT a browser. The rendered page, /?game=TEST and / on wrangler pages
// dev are screenshotted (outbox/website-b-shots/NOTES.md).
//
// BASELINE (c65b45bd, before this branch): hardpan-home.html, refunds.html,
// site-pricing.js and _redirects do not exist there, so sections 1-3 fail on
// a missing file; section 4's unchanged-worker tests pass there too, which is
// the point - nothing in sw.js moved. On website-b: 29 tests, 29 pass, 0 fail.
// Negative controls (9, each restored by sha): Run an event -> /admin (1 red),
// a $ figure in the page (2), founding price drift (2), / rewritten in
// _redirects (1), the plain-visit split in functions/index.js (3), the page
// added to the SW shell (1), refunds noindex removed (1), footer refund link
// dropped (1), Get the app pointed elsewhere (1).
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const { loadServiceWorker, ORIGIN } = require('./helpers/sw-harness.js');

const ROOT = __dirname;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(ROOT, f));
const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, '');
const stripScripts = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, '');

const PAGE = 'hardpan-home.html';

// Every <a ...> tag on the page, attributes parsed.
function anchors(html) {
    const out = [];
    const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html))) {
        const attrs = {};
        m[1].replace(/([a-zA-Z-]+)="([^"]*)"/g, (_, k, v) => { attrs[k] = v; return ''; });
        out.push({ attrs, text: m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() });
    }
    return out;
}

// ---------------------------------------------------------------------------
describe('1. THE PAGE: links, placeholders, no prices of its own', () => {
    const html = stripComments(read(PAGE));
    const a = anchors(html);

    test('it is the marketing page, not the app', () => {
        assert.match(html, /<title>HardPan Golf<\/title>/);
        assert.match(html, /Play it\. Run it\./);
        // Not the scorecard, not the front door: no Firebase, no app script.
        assert.doesNotMatch(html, /firebase|auth-boot|pwa-boot|sw\.js/i,
            'the marketing page loads app plumbing; it is meant to be a static page');
    });

    test('"Get the app" goes to the store badges section', () => {
        const nav = a.find((x) => x.attrs.id === 'nav-get-app');
        assert.ok(nav, 'the Get the app button is gone');
        assert.equal(nav.text, 'Get the app');
        assert.equal(nav.attrs.href, '#get-the-app');
        const sec = /<section[^>]*id="get-the-app"[^>]*>([\s\S]*?)<\/section>/.exec(html);
        assert.ok(sec, 'there is no #get-the-app section for the button to land on');
        assert.match(sec[1], /data-store="apple"/);
        assert.match(sec[1], /data-store="google"/);
    });

    test('"Run an event" goes to the tournament organizer page', () => {
        const run = a.find((x) => x.attrs.id === 'run-an-event');
        assert.ok(run, 'the Run an event button is gone');
        assert.match(run.text, /^Run an event/);
        assert.equal(run.attrs.href, '/tournament');
        assert.ok(exists('tournament.html'), '/tournament has no page behind it');
    });

    test('the footer links to support, privacy, terms and the refund policy, all real pages', () => {
        const foot = /<footer>([\s\S]*?)<\/footer>/.exec(html);
        assert.ok(foot);
        const hrefs = anchors(foot[1]).map((x) => x.attrs.href);
        assert.deepEqual(hrefs, ['/support', '/privacy', '/terms', '/refunds']);
        hrefs.forEach((h) => assert.ok(exists(h.slice(1) + '.html'), h + ' has no page'));
    });

    test('every store badge is a marked placeholder until its real link is filled', () => {
        const badges = a.filter((x) => x.attrs['data-store']);
        assert.equal(badges.length, 4, 'two badges in the golfers card, two in Get the app');
        badges.forEach((b) => {
            const want = b.attrs['data-store'] === 'apple' ? 'app-store-url' : 'play-store-url';
            if (b.attrs['data-todo']) {
                // A placeholder points at the section, never at a guessed store url.
                assert.equal(b.attrs['data-todo'], want);
                assert.equal(b.attrs.href, '#get-the-app');
            } else {
                // Filled: the real store, and the marker removed with it.
                const re = want === 'app-store-url' ? /^https:\/\/apps\.apple\.com\// : /^https:\/\/play\.google\.com\//;
                assert.match(b.attrs.href, re, 'a filled badge points somewhere that is not its store');
            }
        });
    });

    test('the page has no dollar figure of its own (prices come from site-pricing.js)', () => {
        const visible = stripScripts(html);
        assert.doesNotMatch(visible, /\$\s?\d/, 'a hard-coded price is back in the page');
        assert.ok((visible.match(/data-price="/g) || []).length >= 8, 'the price slots are gone');
        assert.match(html, /<script src="\/site-pricing\.js"><\/script>/);
    });

    test('the refund policy page exists and says it is a draft', () => {
        const r = read('refunds.html');
        assert.match(r, /DRAFT - Manny to approve/);
        assert.match(r, /<meta name="robots" content="noindex">/, 'an unapproved policy must not be indexed');
        assert.match(r, /data-todo="refund-policy-text"/);
    });
});

// ---------------------------------------------------------------------------
describe('2. PRICES: one config, the same as the app and the terms', () => {
    let P, fill;
    before(() => {
        const sb = { window: {} };
        vm.createContext(sb);
        vm.runInContext(read('site-pricing.js'), sb);
        P = sb.window.HARDPAN_SITE_PRICING;
        fill = sb.window.HardPanSitePricingFill;
    });

    test('site-pricing.js matches terms.html section 6 (the legal page on this site)', () => {
        const t = read('terms.html');
        assert.match(t, new RegExp('Founding Yearly:</strong> \\' + P.pro.founding + ' per year'));
        assert.match(t, new RegExp('Yearly:</strong> \\' + P.pro.yearly + ' per year'));
        assert.match(t, new RegExp('Monthly:</strong> \\' + P.pro.monthly + ' per month'));
        assert.match(t, new RegExp(P.pro.trialDays + '-day free trial'));
    });

    test('site-pricing.js matches the app config (dev-205 gps-config.js / hp-pricing.js), when that branch is here', (t) => {
        let cfg, hp;
        try {
            cfg = execFileSync('git', ['show', 'dev-205:gps-config.js'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
            hp = execFileSync('git', ['show', 'dev-205:hp-pricing.js'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        } catch (e) { t.skip('dev-205 is not in this clone'); return; }
        const fb = /iapFallbackPrices:\s*\{\s*founding:\s*'([^']+)',\s*yearly:\s*'([^']+)',\s*monthly:\s*'([^']+)'\s*\}/.exec(cfg);
        const host = /iapHostFallbackPrices:\s*\{\s*trip:\s*'([^']+)',\s*host:\s*'([^']+)'\s*\}/.exec(cfg);
        assert.ok(fb && host, 'the app config moved its prices; re-read where they live');
        assert.deepEqual([P.pro.founding, P.pro.yearly, P.pro.monthly], [fb[1], fb[2], fb[3]]);
        assert.deepEqual([P.tripPass.price, P.host.yearly], [host[1], host[2]]);
        const free = /var FREE_GOLFERS = (\d+);/.exec(hp);
        assert.ok(free);
        assert.equal(P.freeGolfers, Number(free[1]));
    });

    test('the page, run as written, fills every price slot (no slot left as a dash)', () => {
        // The page's OWN inline call, not a hand-named list of slots.
        const html = read(PAGE);
        const slots = [];
        html.replace(/data-price="([^"]+)"/g, (_, k) => { slots.push({ key: k, textContent: '', getAttribute: () => k }); return ''; });
        const inline = /<script>\s*([\s\S]*?)<\/script>/.exec(html);
        assert.ok(inline && /HardPanSitePricingFill\(document\)/.test(inline[1]), 'the page no longer fills its prices');
        const sb = { window: {}, document: { querySelectorAll: (s) => (s === '[data-price]' ? slots : []) } };
        sb.window.document = sb.document;
        vm.createContext(sb);
        vm.runInContext(read('site-pricing.js'), sb);
        vm.runInContext(inline[1], sb);
        assert.ok(slots.length >= 8);
        slots.forEach((s) => assert.notEqual(s.textContent, '–', 'slot ' + s.key + ' has no value'));
        const by = Object.fromEntries(slots.map((s) => [s.key, s.textContent]));
        assert.equal(by['pro-headline'], P.pro.founding + '/yr');
        assert.equal(by['trip-pass'], P.tripPass.price);
        assert.equal(by['free-golfers'], '5');
    });

    test('founding closed -> the yearly price, never a stale founding one', () => {
        const slots = [{ getAttribute: () => 'pro-headline', textContent: '' }, { getAttribute: () => 'pro-label', textContent: '' }];
        const sb = { window: {}, document: { querySelectorAll: () => slots } };
        vm.createContext(sb);
        vm.runInContext(read('site-pricing.js'), sb);
        sb.window.HARDPAN_SITE_PRICING.pro.foundingOpen = false;
        sb.window.HardPanSitePricingFill(sb.document);
        assert.equal(slots[0].textContent, P.pro.yearly + '/yr');
        assert.equal(slots[1].textContent, 'Yearly');
    });
});

// ---------------------------------------------------------------------------
// The one rule a _redirects line must never break: it cannot reach /, the app
// pages, a game or tournament link, /api or the sign-in proxy.
const APP_PATHS = /^\/($|index|admin|tournament|leaderboard|settlement|sidematches|skins|stats|game|trip|season|shared|instructions|start\b)/i;
function redirectsProblems(text) {
    const rules = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/));
    const bad = [];
    rules.forEach(([from, to, code]) => {
        if (APP_PATHS.test(from)) bad.push(from + ' rewrites an app path');
        if (/^\/(__|api)(\/|$)/.test(from)) bad.push(from + ' is the sign-in proxy or the API');
        if (/[*?:]/.test(from)) bad.push(from + ' is a wildcard/placeholder/query rule');
        if (to !== '/hardpan-home' || code !== '200') bad.push(from + ' -> ' + to + ' ' + code + ' is not the marketing rewrite');
    });
    return { rules, bad };
}

describe('3. ROUTING: / and every app link are served as before', () => {
    let IDX, MW;
    before(async () => {
        IDX = await import(pathToFileURL(path.join(ROOT, 'functions', 'index.js')).href);
        MW = await import(pathToFileURL(path.join(ROOT, 'functions', '_middleware.js')).href);
    });
    const ctx = (url, host) => {
        let nexts = 0;
        return {
            nexts: () => nexts,
            request: new Request(url, { headers: { host: host || new URL(url).host } }),
            next: async () => { nexts += 1; return new Response('STATIC', { status: 200 }); }
        };
    };

    test('_redirects holds only the /home rewrite, and nothing that reaches the app', () => {
        const { rules, bad } = redirectsProblems(read('_redirects'));
        assert.deepEqual(rules.map((r) => r[0]), ['/home', '/home/']);
        assert.deepEqual(bad, []);
        assert.ok(exists(PAGE), 'the rewrite target is missing');
    });

    test('NEGATIVE CONTROL: the checker refuses the rules that would break the app', () => {
        [
            '/  /hardpan-home  200',            // the plain-visit split, done the blunt way
            '/index.html  /hardpan-home  200',
            '/admin  /hardpan-home  200',
            '/*  /hardpan-home  200',
            '/__/auth/*  /hardpan-home  200',
            '/api/x  /hardpan-home  200',
            '/start  /admin  200'                // aliases are a later, separate decision
        ].forEach((line) => assert.notDeepEqual(redirectsProblems(line).bad, [], line + ' was accepted'));
    });

    test('_routes.json sends none of the new paths to a Function (static, no cost), and keeps / and /__/auth/*', () => {
        const inc = JSON.parse(read('_routes.json')).include;
        ['/home', '/home/*', '/hardpan-home', '/refunds', '/site-pricing.js'].forEach((p) =>
            assert.ok(!inc.includes(p), p + ' now runs a Function'));
        assert.ok(inc.includes('/'));
        assert.ok(inc.includes('/__/auth/*'));
        assert.ok(inc.includes('/__/firebase/*'));
    });

    for (const p of ['/', '/?game=TEST', '/?game=TEST&group=1', '/?tourney=TEST', '/?trip=TEST', '/#x']) {
        test('the / Function hands ' + p + ' to the static app (index.html), as before', async () => {
            const c = ctx('https://hardpangolf.com' + p);
            const res = await IDX.onRequest(c);
            assert.equal(c.nexts(), 1, p + ' did not fall through to index.html');
            assert.equal(await res.text(), 'STATIC');
        });
    }

    test('the Tournaments host still goes to /tournament (query kept)', async () => {
        const c = ctx('https://tournaments.rattlegolf.com/?tourney=TEST');
        const res = await IDX.onRequest(c);
        assert.equal(res.status, 302);
        assert.equal(res.headers.get('location'), 'https://tournaments.rattlegolf.com/tournament?tourney=TEST');
        assert.equal(c.nexts(), 0);
    });

    test('no Function knows about the marketing page (the split is not wired at /)', () => {
        ['index.js', '_middleware.js'].forEach((f) =>
            assert.doesNotMatch(read(path.join('functions', f)), /hardpan-home|marketing|\/home\b/i, f));
    });

    test('the sign-in proxy paths are untouched and the new pages are not blocked', () => {
        assert.equal(MW.isAuthProxyPath('/__/auth/handler'), true);
        assert.equal(MW.isAuthProxyPath('/__/auth/iframe'), true);
        assert.equal(MW.isAuthProxyPath('/__/firebase/init.json'), true);
        assert.equal(MW.AUTH_PROXY_ORIGIN, 'https://golfapp-9fb21.firebaseapp.com');
        ['/home', '/hardpan-home', '/refunds', '/site-pricing.js', '/', '/admin', '/tournament'].forEach((p) =>
            assert.equal(MW.isBlockedPath(p), false, p + ' answers 404'));
        assert.equal(MW.isBlockedPath('/package.json'), true, 'positive control: the block list still blocks');
    });

    test('the app front door and the PWA starts are where they were', () => {
        assert.equal(JSON.parse(read('manifest.json')).start_url, './admin.html');
        assert.equal(JSON.parse(read('tournament-manifest.json')).start_url, './tournament.html');
        assert.match(read('index.html'), /if \(!currentMode\) \{\s*window\.location\.href = "admin\.html";/,
            'index.html no longer sends a visit with no ?game= to the front door');
        assert.match(read('admin.html'), /What are you setting up\?/);
    });
});

// ---------------------------------------------------------------------------
describe('4. THE SERVICE WORKER: unchanged, and the app still opens offline', () => {
    const SW = path.join(ROOT, 'sw.js');
    const nav = (url) => ({ url, method: 'GET', mode: 'navigate', destination: 'document' });
    const src = read('sw.js');

    test('CACHE_VERSION and the shell list did not move (no shell file changed)', () => {
        assert.match(src, /const CACHE_VERSION = 'golfapp-v384-2\.0';/);
        const shell = src.slice(src.indexOf('const SHELL_FILES = ['), src.indexOf('];', src.indexOf('const SHELL_FILES = [')));
        assert.match(shell, /'\.\/index\.html'/, 'positive: the slice holds the shell list');
        assert.doesNotMatch(shell, /hardpan-home|refunds|site-pricing/, 'the marketing page joined the app shell');
        const sync = read('sync-mobile-web.js');
        assert.doesNotMatch(sync, /hardpan-home|refunds\.html|site-pricing/, 'the marketing page joined the native bundle');
    });

    test('the worker still leaves /__/auth/ to the network', async () => {
        const sw = loadServiceWorker(SW, { online: true });
        const r = await sw.request(nav(ORIGIN + '/__/auth/handler?x=1'));
        assert.equal(r.handled, false);
    });

    test('offline, /?game=TEST opens the app after /home was visited online', async () => {
        const warm = loadServiceWorker(SW, { online: true });
        await warm.request(nav(ORIGIN + '/home'));          // the marketing page, first
        await warm.request(nav(ORIGIN + '/'));              // the app at /, as every visitor gets it
        const cold = loadServiceWorker(SW, { online: false, seed: [...warm.cache().entries()] });
        const r = await cold.request(nav(ORIGIN + '/?game=TEST'));
        assert.equal(r.handled, true);
        assert.equal(r.response.body, 'NETWORK:' + ORIGIN + '/', 'the game link did not get the cached app page');
        assert.doesNotMatch(String(r.response.body), /\/home/, 'the game link got the marketing page offline');
    });

    test('NEGATIVE CONTROL: with marketing at plain /, the same offline game link gets the marketing page', async () => {
        // What the plain-visit split would leave in the cache: the worker's
        // install fetches ./index.html, Cloudflare 308s it to / (no query), and
        // a plain / is the marketing page - so / is cached as MARKETING.
        const marketing = { status: 200, ok: true, body: 'MARKETING', url: ORIGIN + '/', redirected: false,
            headers: { get: () => null }, blob: () => Promise.resolve({ __body: 'MARKETING' }), clone() { return this; } };
        const cold = loadServiceWorker(SW, { online: false, seed: [[ORIGIN + '/', marketing]] });
        const r = await cold.request(nav(ORIGIN + '/?game=TEST'));
        assert.equal(r.response.body, 'MARKETING',
            'if this ever fails the worker no longer falls back to the cached / for a game link - re-measure the split');
    });

    test('a /home never opened offline is the No connection card, not the app or a blank', async () => {
        const sw = loadServiceWorker(SW, { online: false, seed: [] });
        const r = await sw.request(nav(ORIGIN + '/home'));
        assert.equal(r.response.status, 503);
        assert.match(String(r.response.body), /No connection/);
    });
});
