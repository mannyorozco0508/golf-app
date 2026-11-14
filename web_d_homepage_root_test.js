// ============================================================================
// WEBSITE-D: hardpangolf.com/ IS THE HOMEPAGE, THE WEB APP IS /app, AND EVERY
// LINK THE APP HAS EVER HANDED OUT STILL OPENS THE APP (Manny, Nov 10).
//
// "make hardpangolf.com show the 27A homepage and move the web app to
//  hardpangolf.com/app. Every existing round/scorer/team/trip link (anything
//  with a code or ?k= etc.) must still open the web app directly ... Also
//  remove the moon Dark Mode button from the website to match the app."
//
// WHAT THIS FILE PROVES, AND HOW
//   1. THE LINK INVENTORY, through a model of the Pages pipeline built from the
//      repo's own files: _routes.json decides whether Functions run; then
//      functions/_middleware.js -> functions/index.js (/) or
//      functions/app/[[path]].js (/app, /app/*) with REAL Request objects; else
//      the static server (_redirects rules, Pretty URLs: x.html -> 308 /x,
//      /index -> 308 /, and the no-404.html single-page fallback, measured on
//      the live site). Redirects are followed. Every inventory URL must end on
//      the page it always opened; only a bare / (or tracking tags only) ends
//      on the homepage. The live emulation (wrangler pages dev) of the same
//      list is in WEB-D-HOMEPAGE-AT-ROOT.md - this file is not a server.
//   2. The service worker (sw.js) run in a vm, INSTALL and FETCH both, against
//      a fake network that answers like the new routing: a new install stores
//      the APP under /index.html, / and /app; an online bare / gets the
//      homepage and does not store it; offline, /?game=TEST opens the app even
//      after a plain / was visited online; an install whose index.html fetch
//      came back as the homepage stores nothing for it.
//   3. The Dark Mode button: every page that had it carries the same web gate;
//      the gate, run in a vm, marks the web light-only and leaves iOS
//      (capacitor://), Android (https://localhost) and Capacitor alone; each
//      page's own load-time theme read, run with golfapp-theme = dark, comes
//      out LIGHT on the web and DARK in the app.
//   4. Homepage links: the logo is /, the "open the web app" links are the app.
//
// It is NOT a browser. Rendered pages are screenshotted in
// outbox/web-d-shots/ (headless Chrome against wrangler pages dev).
//
// BASELINE (ffb344ea, live main): the inventory tests for bare / fail (/ is
// the app there), the /app and bare /index.html tests fail (no route; static
// 308 -> / ), the SW install/homepage tests fail, the theme gate tests fail;
// the app-link inventory passes there too - which is the point. Counts are in
// the report (WEB-D-HOMEPAGE-AT-ROOT.md), from the final run of this file.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

const ROOT = __dirname;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(ROOT, f));
const HOST = 'https://hardpangolf.com';

// ---------------------------------------------------------------------------
// A model of Cloudflare Pages for this repo.
const ROUTES = JSON.parse(read('_routes.json'));
const routeMatch = (rule, p) => new RegExp('^' + rule.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(p);
const routed = (p) => ROUTES.include.some((r) => routeMatch(r, p)) && !ROUTES.exclude.some((r) => routeMatch(r, p));
const REDIRECT_RULES = read('_redirects').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/));

// The static server: what Pages answers for a path with NO Function involved.
// Body is 'FILE:<name>' so the test can say which page rendered.
function staticServe(urlStr) {
    const u = new URL(urlStr);
    const p = u.pathname;
    const rule = REDIRECT_RULES.find(([from]) => from === p);
    if (rule) {
        const [, to, code] = rule;
        if (code === '200') return staticServe(new URL(to + u.search, u).toString());
        return Response.redirect(new URL(to + u.search, u).toString(), Number(code));
    }
    if (p === '/') return file('index.html');
    if (p === '/index' || p === '/index.html') return Response.redirect(new URL('/' + u.search, u).toString(), 308);
    if (/\.html$/.test(p)) return Response.redirect(new URL(p.replace(/\.html$/, '') + u.search, u).toString(), 308);
    const f = p.replace(/^\//, '');
    if (f && exists(f + '.html') && !p.endsWith('/')) return file(f + '.html');
    if (f && exists(f) && fs.statSync(path.join(ROOT, f)).isFile()) return file(f);
    // No 404.html in the repo: Pages serves index.html for an unknown path
    // (measured live Nov 10: /app, /app/, /nonexistent-xyz all 200 index.html).
    return file('index.html');
}
function file(name) { return new Response('FILE:' + name, { status: 200, headers: { 'content-type': 'text/html' } }); }

let MW, IDX, APPFN, FD;
before(async () => {
    MW = await import(pathToFileURL(path.join(ROOT, 'functions', '_middleware.js')).href);
    IDX = await import(pathToFileURL(path.join(ROOT, 'functions', 'index.js')).href);
    APPFN = await import(pathToFileURL(path.join(ROOT, 'functions', 'app', '[[path]].js')).href);
    FD = await import(pathToFileURL(path.join(ROOT, 'functions', '_front-door.js')).href);
});

// The route a Function file owns (Pages file-based routing for this repo).
function handlerFor(pathname) {
    if (pathname === '/') return IDX.onRequest;
    if (pathname === '/app' || pathname.startsWith('/app/')) return APPFN.onRequest;
    return null;
}

// One hop through Pages.
async function pagesHop(urlStr, hostHeader) {
    const request = new Request(urlStr, { headers: { host: hostHeader || new URL(urlStr).host } });
    const pathname = new URL(urlStr).pathname;
    if (!routed(pathname)) return staticServe(urlStr);
    const env = { ASSETS: { fetch: async (req) => staticServe(typeof req === 'string' ? req : req.url) } };
    const route = handlerFor(pathname);
    const ctx = {
        request, env,
        next: async () => (route ? route({ request, env, next: async () => staticServe(urlStr) }) : staticServe(urlStr))
    };
    return MW.onRequest(ctx);
}

// Follow redirects; report the final address, the page and the marker header.
async function visit(pathAndQuery, hostHeader) {
    let url = new URL(pathAndQuery, HOST).toString();
    const hops = [];
    for (let i = 0; i < 6; i++) {
        const res = await pagesHop(url, hostHeader);
        if (res.status >= 300 && res.status < 400) {
            hops.push(res.status);
            url = new URL(res.headers.get('location'), url).toString();
            continue;
        }
        const body = await res.text();
        return { status: res.status, hops, final: url.replace(/^https?:\/\/[^/]+/, ''), page: body.replace(/^FILE:/, ''), marker: res.headers.get('x-hardpan-page') };
    }
    throw new Error('redirect loop at ' + url);
}

// ---------------------------------------------------------------------------
// THE INVENTORY. Every URL shape the app, the web pages and the tournament
// side hand out or have handed out (built from the share/link builders:
// product-links.js shareBaseUrl + admin.html playerPageUrl/scorecardUrlFor,
// index.html, leaderboard.html, sidematches.html, settlement.html,
// season.html, trip.html, tournament.html, qr-codes.js, push-boot.js,
// email-link-auth.js, weekly-rsvp.js, instructions.html ?from=). Cloudflare
// 308s every x.html to /x, so links in the wild carry both spellings, and
// index.html?game= became /?game= in every address bar that ever shared one.
const APP = 'index.html';
const INVENTORY = [
    // [url, page it must render]
    ['/?game=TEST', APP], ['/?game=TEST&group=1', APP], ['/?game=TEST&group=12', APP],
    ['/?game=TEST&organizer=1', APP], ['/?game=TEST&spectate=1', APP], ['/?game=TEST&players=1', APP],
    ['/?game=TEST&press=1', APP], ['/?game=TEST&me=2', APP], ['/?game', APP],
    ['/?tourney=TEST', APP], ['/?tourney=TEST&k=abc', APP], ['/?k=abc', APP], ['/?trip=TEST', APP],
    ['/?season=S1', APP], ['/?apiKey=x&mode=signIn&oobCode=abc&continueUrl=y&lang=en', APP],
    ['/?utm_source=sms&game=TEST', APP], ['/?fresh=1', APP], ['/?x=1', APP],
    ['/index.html', APP], ['/index', APP], ['/index.html?game=TEST', APP], ['/index.html?game=TEST&group=2', APP],
    ['/index?game=TEST&group=2', APP], ['/index.html?utm_source=x', APP],
    ['/app', APP], ['/app?game=TEST', APP], ['/app?game=TEST&group=3', APP], ['/app?utm_source=x', APP],
    ['/app/', APP], ['/app/?game=TEST&group=1', APP], ['/app/anything', APP],
    ['/admin', 'admin.html'], ['/admin.html', 'admin.html'], ['/admin?game=TEST', 'admin.html'],
    ['/admin.html?game=TEST&group=1', 'admin.html'], ['/admin.html?fresh=1', 'admin.html'],
    ['/admin.html?account=1', 'admin.html'], ['/admin.html?trip=TEST', 'admin.html'],
    ['/admin.html?season=S1', 'admin.html'], ['/admin.html?apiKey=x&mode=signIn&oobCode=abc', 'admin.html'],
    ['/leaderboard.html?game=TEST', 'leaderboard.html'], ['/leaderboard?game=TEST&group=1', 'leaderboard.html'],
    ['/settlement.html?game=TEST', 'settlement.html'], ['/sidematches.html?game=TEST', 'sidematches.html'],
    ['/skins.html?game=TEST', 'skins.html'], ['/stats.html?game=TEST', 'stats.html'],
    ['/shared.html?game=TEST', 'shared.html'], ['/game.html?game=TEST', 'game.html'],
    ['/season.html?season=S1', 'season.html'], ['/trip.html?trip=TEST', 'trip.html'], ['/trip?trip=TEST', 'trip.html'],
    ['/rsvp.html?w=TEST', 'rsvp.html'], ['/instructions.html?from=index.html&game=TEST', 'instructions.html'],
    ['/tournament', 'tournament.html'], ['/tournament.html?tourney=TEST', 'tournament.html'],
    ['/tournament.html?tourney=TEST&k=abc', 'tournament.html'], ['/tournament.html?register=TEST', 'tournament.html'],
    ['/tournament.html?trip=TEST', 'tournament.html'],
    ['/tournament-scorecard.html?tourney=TEST&team=1&k=abc', 'tournament-scorecard.html'],
    ['/home', 'hardpan-home.html'], ['/home/', 'hardpan-home.html']
];
const HOMEPAGE = [
    '/', '/?', '/?&', '/?utm_source=facebook&utm_medium=social&utm_campaign=x', '/?fbclid=IwAR0abc',
    '/?gclid=abc', '/?gbraid=a&wbraid=b', '/?msclkid=a', '/?ref=producthunt', '/?mc_cid=a&mc_eid=b', '/?_gl=a'
];

describe('1. THE LINK INVENTORY: every app link opens what it always opened; only a bare / is the homepage', () => {
    for (const [u, page] of INVENTORY) {
        test(u + '  ->  ' + page, async () => {
            const r = await visit(u);
            assert.equal(r.status, 200, u);
            assert.equal(r.page, page, u + ' rendered ' + r.page + ' (final ' + r.final + ')');
            assert.notEqual(r.marker, 'home', u + ' was marked as the homepage');
        });
    }
    for (const u of HOMEPAGE) {
        test(u + '  ->  the homepage, 200, the address stays', async () => {
            const r = await visit(u);
            assert.equal(r.status, 200);
            assert.deepEqual(r.hops, [], u + ' redirected');
            assert.equal(r.page, 'hardpan-home.html');
            assert.equal(r.marker, 'home', 'the homepage answer carries X-HardPan-Page: home (sw.js reads it)');
        });
    }

    test('the app at /app keeps the address /app (no redirect), marked app', async () => {
        const r = await visit('/app?game=TEST&group=2');
        assert.deepEqual(r.hops, []);
        assert.equal(r.final, '/app?game=TEST&group=2');
        assert.equal(r.marker, 'app');
    });
    test('/app/ is one 308 to /app, query kept (relative scripts would break under /app/)', async () => {
        const r = await visit('/app/?game=TEST&group=1');
        assert.deepEqual(r.hops, [308]);
        assert.equal(r.final, '/app?game=TEST&group=1');
    });
    test('/?game= is still served at its own address, no redirect (the link a golfer holds)', async () => {
        const r = await visit('/?game=TEST&group=1');
        assert.deepEqual(r.hops, []);
        assert.equal(r.final, '/?game=TEST&group=1');
        assert.equal(r.page, APP);
    });
    test('bare /index.html is the app with a 200 and no redirect (the SW install fetch and old bookmarks)', async () => {
        const r = await visit('/index.html');
        assert.deepEqual(r.hops, []);
        assert.equal(r.page, APP);
        assert.equal(r.marker, 'app');
    });
    test('/index.html?game= still 308s to /?game= exactly as before (no change for game links)', async () => {
        const r = await visit('/index.html?game=TEST&group=2');
        assert.deepEqual(r.hops, [308]);
        assert.equal(r.final, '/?game=TEST&group=2');
    });

    // Measured in Chrome on wrangler pages dev: the SECOND visit to / opened the
    // app. The browser revalidated with If-None-Match, the asset server said 304,
    // and the first draft took a non-200 as "no homepage" and served index.html.
    test('a returning browser (If-None-Match) gets 304 for the homepage it holds, and the homepage when it holds the app', async () => {
        const ETAG = { '/hardpan-home': '"home-etag"', '/': '"app-etag"' };
        const assets = { fetch: async (req) => {
            const p = new URL(req.url).pathname;
            const inm = req.headers.get('if-none-match');
            if (inm && inm === ETAG[p]) return new Response(null, { status: 304, headers: { etag: ETAG[p] } });
            return new Response('ASSET:' + p, { status: 200, headers: { etag: ETAG[p] || '"x"' } });
        } };
        const run = async (url, inm, fn) => {
            const request = new Request(HOST + url, { headers: inm ? { 'if-none-match': inm } : {} });
            return (fn || IDX.onRequest)({ request, env: { ASSETS: assets }, next: async () => new Response('STATIC-APP', { status: 200 }) });
        };
        const same = await run('/', '"home-etag"');
        assert.equal(same.status, 304, 'the homepage the browser holds is still current');
        assert.equal(same.headers.get('x-hardpan-page'), 'home');
        const held = await run('/', '"app-etag"');
        assert.equal(held.status, 200);
        assert.equal(await held.text(), 'ASSET:/hardpan-home', 'a browser holding the old app copy of / gets the homepage');
        const app = await run('/app', '"app-etag"', APPFN.onRequest);
        assert.equal(app.status, 304, '/app revalidates too');
        assert.equal(app.headers.get('x-hardpan-page'), 'app');
    });

    test('the Tournaments host: / and bare /index.html still go to /tournament; /app does too (never the Consumer app)', async () => {
        for (const u of ['/', '/?tourney=TEST', '/index.html', '/app', '/app?tourney=TEST']) {
            const r = await visit(u, 'tournaments.rattlegolf.com');
            assert.equal(r.page, 'tournament.html', u + ' on the Tournaments host rendered ' + r.page);
        }
        const q = await visit('/?tourney=TEST&k=abc', 'tournaments.rattlegolf.com');
        assert.equal(q.final, '/tournament?tourney=TEST&k=abc', 'the query rides along');
    });

    test('/__/auth/*, /__/firebase/* and /api/* are not the homepage or the app (the middleware proxies / the API answers)', () => {
        ['/__/auth/handler', '/__/auth/iframe', '/__/firebase/init.json'].forEach((p) => assert.equal(MW.isAuthProxyPath(p), true, p));
        assert.equal(FD.isHomepageVisit(HOST + '/__/auth/handler?apiKey=x'), false);
        assert.equal(FD.isHomepageVisit(HOST + '/api/course-search?q=ab'), false);
        assert.ok(routed('/__/auth/handler') && routed('/api/x'));
    });

    test('non-site files are still 404 (the block list did not move)', () => {
        ['/package.json', '/CLAUDE.md', '/functions/_front-door.js', '/functions/app/[[path]].js', '/refunds'].forEach((p) =>
            assert.equal(MW.isBlockedPath(p), true, p));
        ['/', '/app', '/index.html', '/index', '/home'].forEach((p) => assert.equal(MW.isBlockedPath(p), false, p));
    });
});

describe('1b. THE CLASSIFIER and the routing files', () => {
    test('tracking tags only = homepage; any other name = app (unknown means app)', () => {
        assert.equal(FD.isHomepageQuery(''), true);
        assert.equal(FD.isHomepageQuery('?utm_source=a&utm_term=b&fbclid=c'), true);
        ['?game=X', '?k=1', '?trip=T', '?tourney=T', '?season=S', '?mode=signIn&oobCode=x', '?utm_source=a&game=X',
            '?game', '?=x', '?group=1', '?organizer=1', '?REF2=x', '?utm'].forEach((q) =>
            assert.equal(FD.isHomepageQuery(q), false, q));
    });
    test('no app page reads a tracking tag (so treating them as the homepage loses nothing)', () => {
        const pages = fs.readdirSync(ROOT).filter((f) => /\.(html|js)$/.test(f) && !/_test\.js$|\.test\.js$|compat\.js$|\.min\.js$/.test(f));
        assert.ok(pages.includes('index.html'), 'positive: the page list was read');
        for (const f of pages) {
            const src = read(f);
            assert.doesNotMatch(src, /\.get\(\s*['"](utm_[a-z_]*|fbclid|gclid|ref)['"]\s*\)/, f + ' reads a tracking tag');
        }
    });
    test('no app page reads location.hash (so a hash at a bare / needs no forwarding to /app)', () => {
        const pages = fs.readdirSync(ROOT).filter((f) => /\.(html|js)$/.test(f) && !/_test\.js$|\.test\.js$|compat\.js$|\.min\.js$|^sw\.js$/.test(f));
        assert.ok(pages.length > 50);
        for (const f of pages) assert.doesNotMatch(read(f), /location\.hash|hashchange/, f + ' reads the hash');
    });
    test('_routes.json sends /, /app, /app/*, /index and /index.html to Functions, and nothing about /home', () => {
        ['/', '/app', '/app/*', '/index', '/index.html'].forEach((r) => assert.ok(ROUTES.include.includes(r), r));
        ['/home', '/home/*', '/hardpan-home', '/admin', '/tournament', '/*'].forEach((r) => assert.ok(!ROUTES.include.includes(r), r));
        assert.ok(ROUTES.include.length <= 100, 'Pages caps include+exclude at 100');
    });
    test('_redirects still holds only the two /home rewrites (no rule can reach /, /app or an app page)', () => {
        assert.deepEqual(REDIRECT_RULES, [['/home', '/hardpan-home', '200'], ['/home/', '/hardpan-home', '200']]);
    });
    test('the Function files exist where Pages routes them', () => {
        assert.ok(exists('functions/index.js'));
        assert.ok(exists('functions/app/[[path]].js'));
        assert.doesNotMatch(read('functions/_front-door.js'), /export (async )?function onRequest/, '_front-door.js must not become a route');
    });
});

// ---------------------------------------------------------------------------
// 2. THE SERVICE WORKER, install and fetch, against routing-aware fake network.
const SW_ORIGIN = 'https://hardpangolf.com';
function fakeRes(body, { url, redirected = false, page = null, status = 200 } = {}) {
    const headers = { get: (k) => (String(k).toLowerCase() === 'x-hardpan-page' ? page : null) };
    return {
        status, ok: status >= 200 && status < 300, statusText: '', body, url, redirected, headers,
        blob() { return Promise.resolve({ __body: body }); },
        clone() { return fakeRes(body, { url, redirected, page, status }); }
    };
}
// The NEW routing (website-d) as a network. `breakIndex` makes the index.html
// fetch answer the homepage, for the install refusal test.
function newNetwork(reqUrl, { breakIndex = false } = {}) {
    const u = new URL(reqUrl);
    if (u.pathname === '/index.html' && !u.search) {
        return breakIndex ? fakeRes('HOMEPAGE', { url: SW_ORIGIN + '/', redirected: true, page: 'home' })
            : fakeRes('APP', { url: reqUrl, page: 'app' });
    }
    if (u.pathname === '/' && FD.isHomepageQuery(u.search)) return fakeRes('HOMEPAGE', { url: reqUrl, page: 'home' });
    if (u.pathname === '/' || u.pathname === '/app') return fakeRes('APP', { url: reqUrl, page: u.pathname === '/app' ? 'app' : null });
    return fakeRes('FILE' + u.pathname, { url: reqUrl });
}
function loadSW({ online = true, seed = [], network = newNetwork, src } = {}) {
    const source = src || read('sw.js');
    const cacheName = /const CACHE_VERSION = '([^']+)'/.exec(source)[1];
    const stores = new Map([[cacheName, new Map(seed)]]);
    const listeners = {};
    const waits = [];
    class R {
        constructor(body, init) {
            const i = init || {};
            this.status = i.status === undefined ? 200 : i.status; this.statusText = i.statusText || '';
            this.ok = this.status >= 200 && this.status < 300;
            this.body = body && body.__body !== undefined ? body.__body : body;
            this.headers = i.headers && typeof i.headers.get === 'function' ? i.headers : { get: (k) => ((i.headers || {})[k] || null) };
            this.redirected = false; this.url = '';
        }
        blob() { return Promise.resolve({ __body: this.body }); }
        clone() { return new R({ __body: this.body }, this); }
    }
    class Q { constructor(input) { this.url = typeof input === 'string' ? new URL(input, SW_ORIGIN + '/').href : input.url; this.method = 'GET'; } }
    const cacheFor = (n) => ({ put: (req, res) => { stores.get(n).set(req.url, res); return Promise.resolve(); } });
    const sandbox = {
        self: { addEventListener: (t, f) => { listeners[t] = f; }, skipWaiting() {}, clients: { claim() {} }, location: { origin: SW_ORIGIN, href: SW_ORIGIN + '/sw.js' } },
        Response: R, Request: Q, URL,
        caches: {
            open: (n) => { if (!stores.has(n)) stores.set(n, new Map()); return Promise.resolve(cacheFor(n)); },
            keys: () => Promise.resolve([...stores.keys()]),
            delete: (n) => Promise.resolve(stores.delete(n)),
            match: (req, opts) => {
                const url = typeof req === 'string' ? req : req.url;
                for (const [, c] of stores) {
                    if (c.has(url)) return Promise.resolve(c.get(url));
                    if (opts && opts.ignoreSearch) for (const [k, v] of c) if (k.split('?')[0] === url.split('?')[0]) return Promise.resolve(v);
                }
                return Promise.resolve(undefined);
            }
        },
        console: { warn() {}, info() {} },
        fetch: (req) => {
            const url = typeof req === 'string' ? new URL(req, SW_ORIGIN + '/sw.js').href : req.url;
            return online ? Promise.resolve(network(url)) : Promise.reject(new TypeError('Failed to fetch'));
        },
        Promise, TypeError
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox);
    return {
        cache: () => stores.get(cacheName),
        install: async () => { listeners.install({ waitUntil: (p) => waits.push(p) }); await Promise.all(waits); },
        nav: async (url) => {
            let out;
            listeners.fetch({ request: { url, method: 'GET', mode: 'navigate', destination: 'document' }, respondWith: (p) => { out = p; } });
            const res = out ? await out : undefined;
            await new Promise((r) => setImmediate(r));
            return res;
        }
    };
}

describe('2. THE SERVICE WORKER: the app shell is the app, the homepage is never cached', () => {
    test('CACHE_VERSION is v394-2.0 with its "Moved to v394" line', () => {
        const src = read('sw.js');
        assert.match(src, /const CACHE_VERSION = 'golfapp-v412-2\.0';/);
        assert.match(src, /\/\/ Moved to v394-2\.0 \(website-d/);
        const shell = /const SHELL_FILES = \[([\s\S]*?)\];/.exec(src)[1];
        assert.match(shell, /'\.\/index\.html'/, 'positive: the slice is the shell list');
        assert.doesNotMatch(shell, /hardpan-home|'\.\/'|'\/'|'\.\/app'/, 'the homepage or a bare / joined the precache list');
    });

    test('4a: a NEW install stores the APP under /index.html, / and /app - never the homepage', async () => {
        const sw = loadSW();
        await sw.install();
        for (const k of ['/index.html', '/', '/app']) {
            const hit = sw.cache().get(SW_ORIGIN + k);
            assert.ok(hit, k + ' was not precached');
            assert.equal(hit.body, 'APP', k + ' holds ' + hit.body);
        }
        for (const [k, v] of sw.cache()) assert.notEqual(v.body, 'HOMEPAGE', k + ' holds the homepage');
    });

    test('4a: an install whose index.html fetch answers the HOMEPAGE stores nothing for it (and no /, /app alias)', async () => {
        const sw = loadSW({ network: (u) => newNetwork(u, { breakIndex: true }) });
        await sw.install();
        for (const k of ['/index.html', '/', '/app']) assert.equal(sw.cache().get(SW_ORIGIN + k), undefined, k + ' was stored');
        assert.ok(sw.cache().get(SW_ORIGIN + '/admin.html'), 'positive: the rest of the shell was still stored');
    });

    test('4b: an installed device visiting a bare / ONLINE gets the homepage, and the cached / stays the app', async () => {
        const sw = loadSW();
        await sw.install();
        const r = await sw.nav(SW_ORIGIN + '/');
        assert.equal(r.body, 'HOMEPAGE', 'an online bare / was not the homepage');
        assert.equal(sw.cache().get(SW_ORIGIN + '/').body, 'APP', 'the homepage overwrote the cached app at /');
        const t = await sw.nav(SW_ORIGIN + '/?utm_source=x');
        assert.equal(t.body, 'HOMEPAGE');
        assert.equal(sw.cache().get(SW_ORIGIN + '/?utm_source=x'), undefined, 'a tracking-tag homepage was cached under /');
    });

    test('4c: OFFLINE, /?game=TEST opens the cached app - after a plain / was visited online', async () => {
        const warm = loadSW();
        await warm.install();
        await warm.nav(SW_ORIGIN + '/');
        await warm.nav(SW_ORIGIN + '/?fbclid=x');
        await warm.nav(SW_ORIGIN + '/home');
        const cold = loadSW({ online: false, seed: [...warm.cache().entries()] });
        for (const u of ['/?game=TEST', '/?game=TEST&group=2', '/app?game=TEST', '/index.html?game=TEST&group=1', '/?tourney=T&k=1']) {
            const r = await cold.nav(SW_ORIGIN + u);
            assert.equal(r.body, 'APP', u + ' offline opened ' + r.body);
        }
        const bare = await cold.nav(SW_ORIGIN + '/');
        assert.equal(bare.body, 'APP', 'offline, a bare / falls back to the cached app (not a blank)');
    });

    test('4c: offline on a device that only ever opened a game link online still opens the app at /app', async () => {
        const warm = loadSW();
        await warm.install();
        await warm.nav(SW_ORIGIN + '/?game=ABCD&group=1');
        const cold = loadSW({ online: false, seed: [...warm.cache().entries()] });
        assert.equal((await cold.nav(SW_ORIGIN + '/app')).body, 'APP');
    });

    test('returning visitors: activate deletes EVERY older cache (v380 ... v393 and anything else), keeps only v394', async () => {
        const sw = loadSW({ seed: [] });
        const src = read('sw.js');
        assert.match(src, /self\.skipWaiting\(\)/, 'a new worker waits for every tab to close');
        assert.match(src, /self\.clients\.claim\(\)/, 'a new worker does not take over open pages');
        // Rebuild with old caches present, then activate.
        const names = ['golfapp-v380-2.0', 'golfapp-v383-2.0', 'golfapp-v385-2.0', 'golfapp-v393-2.0', 'golfapp-v331-new-logo'];
        const sandboxCaches = new Map(names.map((n) => [n, new Map([[SW_ORIGIN + '/', fakeRes('OLD ' + n, { url: SW_ORIGIN + '/' })]])]));
        const listeners = {};
        const waits = [];
        const ctx = { self: { addEventListener: (t, f) => { listeners[t] = f; }, skipWaiting() {}, clients: { claim() {} }, location: { origin: SW_ORIGIN, href: SW_ORIGIN + '/sw.js' } },
            caches: { keys: () => Promise.resolve([...sandboxCaches.keys()]), delete: (n) => Promise.resolve(sandboxCaches.delete(n)),
                open: (n) => { if (!sandboxCaches.has(n)) sandboxCaches.set(n, new Map()); return Promise.resolve({ put: () => Promise.resolve() }); } },
            URL, Promise, console: { warn() {} }, fetch: () => Promise.reject(new TypeError('offline')), Response: class {}, Request: class {} };
        vm.createContext(ctx); vm.runInContext(src, ctx);
        sandboxCaches.set('golfapp-v412-2.0', new Map());
        listeners.activate({ waitUntil: (p) => waits.push(p) });
        await Promise.all(waits);
        assert.deepEqual([...sandboxCaches.keys()], ['golfapp-v412-2.0']);
        assert.ok(sw, 'positive: the worker loads');
    });
    test('returning visitors: sw.js is never served from the HTTP cache (_headers no-cache, updateViaCache none)', () => {
        const h = read('_headers');
        assert.match(h, /^\/sw\.js\n  Cache-Control: no-cache$/m);
        assert.match(read('pwa-boot.js'), /register\('sw\.js', \{ scope: '\.\/', updateViaCache: 'none' \}\)/);
        assert.ok(!ROUTES.include.includes('/sw.js'), 'sw.js stays static (the header applies to static files)');
    });

    test('NEGATIVE CONTROL: the v393 worker (no homepage guard) DOES cache the homepage under /, and the offline game link opens it', async () => {
        // This is what a device keeps until v394 replaces it - the reason for the bump.
        const v393 = read('sw.js')
            .replace(/if \(isHomepageResponse\(response\)\) \{[\s\S]*?\n        \}\n/, '')
            .replace(/const CACHE_VERSION = '[^']+'/, "const CACHE_VERSION = 'golfapp-v393-2.0'");
        assert.notEqual(v393, read('sw.js'), 'positive: the guard was found and removed');
        const warm = loadSW({ src: v393, seed: [[SW_ORIGIN + '/', fakeRes('APP', { url: SW_ORIGIN + '/' })]] });
        await warm.nav(SW_ORIGIN + '/');
        const cold = loadSW({ src: v393, online: false, seed: [...warm.cache().entries()] });
        assert.equal((await cold.nav(SW_ORIGIN + '/?game=TEST')).body, 'HOMEPAGE');
    });
});

// ---------------------------------------------------------------------------
// 3. THE DARK MODE BUTTON
const THEME_PAGES = ['admin.html', 'game.html', 'index.html', 'instructions.html', 'leaderboard.html',
    'settlement.html', 'sidematches.html', 'skins.html', 'stats.html', 'trip.html'];
const GATE_RE = /<script>(\(function\(\)\{try\{var C=window\.Capacitor[\s\S]*?)<\/script>\s*<style>(html\.hp-web-light \.theme-toggle-btn\{display:none !important;\}[^<]*)<\/style>/;

function runGate(code, { protocol, hostname, port = '', capacitor }) {
    const classes = new Set();
    const win = { location: { protocol, hostname, port } };
    if (capacitor !== undefined) win.Capacitor = capacitor;
    const sb = { window: win, document: { documentElement: { classList: { add: (c) => classes.add(c), contains: (c) => classes.has(c), toggle() {} } } } };
    sb.window.document = sb.document;
    vm.createContext(sb);
    vm.runInContext(code, sb);
    return { web: classes.has('hp-web-light'), flag: win.hpWebLight, sb, classes };
}
// The page's own load-time theme read, cut from the page.
function themeInit(html) {
    const m = /\(function initTheme\(\) \{[\s\S]*?\}\)\(\);/.exec(html)
        || /if \(!window\.hpWebLight && localStorage\.getItem\('golfapp-theme'\) === 'dark'\)[^\n]*(\n[^\n]*\n\s*\})?/.exec(html);
    return m && m[0];
}

describe('3. NO DARK MODE BUTTON ON THE WEBSITE (the app keeps its own)', () => {
    const gates = THEME_PAGES.map((p) => [p, GATE_RE.exec(read(p))]);
    test('every page that had the button carries the same gate, first in <body>: after every <head> script, before the button', () => {
        // Not in <head>: a tag there ahead of pwa-boot.js / auth-boot.js / the
        // engines breaks the script-order guards (and a <style> ahead of the page's
        // own breaks the stylesheet slices) - measured on the first draft.
        for (const [p, m] of gates) {
            assert.ok(m, p + ' has no web light-only gate');
            const html = read(p);
            const at = html.indexOf(m[0]);
            assert.ok(at > html.indexOf('</head>'), p + ': gate is in <head>');
            assert.match(html.slice(html.indexOf('</head>'), at), /^<\/head>\s*<body[^>]*>\s*<!--[\s\S]*?-->\s*$/, p + ': gate is not the first thing in <body>');
            assert.ok(at < html.indexOf('class="theme-toggle-btn"'), p + ': gate comes after the button');
            assert.equal(m[1], gates[0][1][1], p + ' gate differs from admin.html');
        }
        assert.match(gates[0][1][2], /\.lobby-account-row\{justify-content:flex-end;\}/, 'Account stays on the right with the moon gone');
    });
    test('the gate: the website is light-only; iOS, Android and any Capacitor shell are not touched', () => {
        const code = gates[0][1][1];
        assert.deepEqual([runGate(code, { protocol: 'https:', hostname: 'hardpangolf.com' }).web,
            runGate(code, { protocol: 'https:', hostname: 'golf-app-5a5.pages.dev' }).web,
            runGate(code, { protocol: 'http:', hostname: '127.0.0.1', port: '8788' }).web,
            runGate(code, { protocol: 'http:', hostname: 'localhost', port: '8788' }).web], [true, true, true, true]);
        assert.equal(runGate(code, { protocol: 'capacitor:', hostname: 'localhost' }).web, false, 'iOS bundle');
        assert.equal(runGate(code, { protocol: 'https:', hostname: 'localhost' }).web, false, 'Android bundle (no Capacitor yet)');
        assert.equal(runGate(code, { protocol: 'https:', hostname: 'localhost', capacitor: { isNativePlatform: () => true } }).web, false);
        assert.equal(runGate(code, { protocol: 'https:', hostname: 'hardpangolf.com', capacitor: { isNativePlatform: () => false } }).web, true,
            'a web page that happens to load the Capacitor runtime is still the web');
    });
    for (const p of THEME_PAGES) {
        test(p + ': a saved golfapp-theme = dark comes out LIGHT on the web and DARK in the app; the key is not touched', () => {
            const html = read(p);
            const gate = GATE_RE.exec(html)[1];
            const init = themeInit(html);
            assert.ok(init && /golfapp-theme/.test(init), p + ': the load-time theme read was not found');
            const run = (loc) => {
                const g = runGate(gate, loc);
                const store = { 'golfapp-theme': 'dark' };
                g.sb.localStorage = { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } };
                vm.runInContext(init, g.sb);
                return { dark: g.classes.has('dark-mode'), key: store['golfapp-theme'] };
            };
            assert.deepEqual(run({ protocol: 'https:', hostname: 'hardpangolf.com' }), { dark: false, key: 'dark' }, p + ' on the web');
            assert.deepEqual(run({ protocol: 'capacitor:', hostname: 'localhost' }), { dark: true, key: 'dark' }, p + ' in the iOS app');
        });
    }
    test('the button and toggleTheme stay in the HTML (the app re-homes #theme-toggle-btn into its round sheet)', () => {
        for (const p of THEME_PAGES) {
            assert.match(read(p), /class="theme-toggle-btn"/, p);
            assert.match(read(p), /function toggleTheme\(\)/, p);
        }
    });
});

describe('4. LINKS THAT MEAN "HOME" OR "THE WEB APP"', () => {
    test('the homepage logo goes to / (it is the homepage now); /home still works', () => {
        assert.match(read('hardpan-home.html'), /<a class="logo" href="\/">/);
    });
    test('the homepage "open the web app" links go to the app front door, never to /', () => {
        const html = read('hardpan-home.html');
        const links = [...html.matchAll(/<a class="webapp"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
        assert.equal(links.length, 2, 'positive: both web-app links found');
        links.forEach((h) => assert.ok(h === '/admin' || h === '/app', h));
    });
    test('no page bundled into the native app links to /app (it would 404 inside the app)', () => {
        const sync = read('sync-mobile-web.js');
        const files = [...sync.matchAll(/'([a-z0-9-]+\.html)'/g)].map((m) => m[1]);
        assert.ok(files.includes('index.html'), 'positive: bundle list read');
        files.forEach((f) => exists(f) && assert.doesNotMatch(read(f), /["'`]\/app(\?|["'`])/, f));
    });
});
