// ============================================================================
// DOMAIN SWITCH: hardpangolf.com/tournaments, AND tournaments.rattlegolf.com -> hardpangolf.com
// (Manny 2026-11-15 5:41 PM: "for tournaments we can do hardpangolf.com/tournaments would be a good address";
// ADVISOR-20261115-1742 part 2, built locally 2026-11-15 ~20:30 on branch local-domain-switch; the cutover needs its own OK)
//
// WHAT CHANGES
//   _redirects:   /tournaments and /tournaments/ -> tournament.html, 200, address kept, query carried (the /home pattern).
//   _routes.json: /tournament, /tournament-scorecard, /tournament-tv, /tournaments, /tournaments/ now pass through
//                 Functions so the middleware sees them; on hardpangolf.com they fall through next() to the static files.
//   functions/_middleware.js oldHostRedirect(): on Host tournaments.rattlegolf.com (and hosts under it) a 301 to the
//                 SAME path + query on https://hardpangolf.com; `/`, /index, /index.html -> /tournaments; /api/*,
//                 /__/auth/*, /__/firebase/* are left alone (a push, a scan or a sign-in in flight completes).
//   hardpan-home.html: the three doors (#hero-start-tournament, #start-tournament, #run-an-event) -> /tournaments.
//   NOT renamed: /tournament, /tournament-scorecard, /tournament-tv (every printed QR, share link and Stripe return URL).
//   NOT changed: tournament.html, tournament-tv.html, tournament-scorecard.html (so no cache bump), sw.js, any rule.
//
// HARNESS. The same Pages model web_d_homepage_root_test.js uses: a static server that applies _redirects and Pretty
// URLs, the middleware with next() -> the route's Function (index.js for `/`) -> static. Requests carry the host under
// test in the URL and the Host header. What this cannot prove: Cloudflare's own routing of _routes.json and _redirects
// (tools/tournament-host-check.js / the wrangler probe measure that over HTTP) and DNS.
//
// BASELINE against origin/main 2f732bb3 (this exact file copied there, final run): 2 pass / 13 fail of 15 (the two that
// pass describe what must NOT change: the old addresses on hardpangolf.com, and `/`, `/?tourney=`, /admin on both hosts).
// Here: 15 pass / 0 fail.
// NEGATIVE CONTROL (run by hand 2026-11-15, restored by cp from a scratchpad copy, sha printed RESTORED-OK): the two lines
// `const moved = oldHostRedirect(context.request); if (moved) return moved;` removed from onRequest: 10 pass / 5 fail
// (1.3 and the four old-host 301 tests fail; the hardpangolf.com tests and the two helper-level tests still pass, as they must).
// ============================================================================
'use strict';
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(ROOT, f));
const RULES = read('_redirects').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/));
const ROUTES = JSON.parse(read('_routes.json'));
const OLD = 'https://tournaments.rattlegolf.com';
const NEW = 'https://hardpangolf.com';

// Pages' static layer: _redirects (200 = rewrite), Pretty URLs, the SPA fallback to index.html.
function staticServe(urlStr) {
    const u = new URL(urlStr);
    const p = u.pathname;
    const rule = RULES.find(([from]) => from === p);
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
    return file('index.html');
}
function file(name) { return new Response('FILE:' + name, { status: 200, headers: { 'content-type': 'text/html' } }); }
const routeMatch = (rule, p) => new RegExp('^' + rule.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(p);
const routed = (p) => ROUTES.include.some((r) => routeMatch(r, p)) && !ROUTES.exclude.some((r) => routeMatch(r, p));

let MW, IDX, APPFN;
before(async () => {
    MW = await import(pathToFileURL(path.join(ROOT, 'functions', '_middleware.js')).href);
    IDX = await import(pathToFileURL(path.join(ROOT, 'functions', 'index.js')).href);
    APPFN = await import(pathToFileURL(path.join(ROOT, 'functions', 'app', '[[path]].js')).href);
});
function handlerFor(pathname) {
    if (pathname === '/') return IDX.onRequest;
    if (pathname === '/app' || pathname.startsWith('/app/')) return APPFN.onRequest;
    return null;
}
// One hop through Pages for a URL whose host is the host under test (URL and Host header agree, as in production).
async function hop(urlStr, hostHeader) {
    const request = new Request(urlStr, { headers: { host: hostHeader || new URL(urlStr).host } });
    const pathname = new URL(urlStr).pathname;
    if (!routed(pathname)) return staticServe(urlStr);
    const env = { ASSETS: { fetch: async (req) => staticServe(typeof req === 'string' ? req : req.url) } };
    const route = handlerFor(pathname);
    return MW.onRequest({ request, env, next: async () => (route ? route({ request, env, next: async () => staticServe(urlStr) }) : staticServe(urlStr)) });
}
async function see(urlStr, hostHeader) {
    const res = await hop(urlStr, hostHeader);
    return { status: res.status, location: res.headers.get('location'), cache: res.headers.get('cache-control'), page: res.headers.get('X-HardPan-Page'), body: res.status === 200 ? await res.text() : '' };
}

describe('1. the files', () => {
    test('_redirects: the two /tournaments rewrites to tournament.html with a 200, after the two /home rules, nothing else', () => {
        assert.deepEqual(RULES, [['/home', '/hardpan-home', '200'], ['/home/', '/hardpan-home', '200'], ['/tournaments', '/tournament', '200'], ['/tournaments/', '/tournament', '200']]);
        assert.ok(exists('tournament.html'));
    });
    test('_routes.json: the tournament pages pass through Functions (the middleware must see the old host); /admin, /home and /* still do not; under the cap', () => {
        ['/tournament', '/tournament-scorecard', '/tournament-tv', '/tournaments', '/tournaments/'].forEach((p) => assert.ok(routed(p), p));
        ['/admin', '/home', '/hardpan-home', '/sidematches', '/media/screens/gps-400.webp'].forEach((p) => assert.ok(!routed(p), p + ' must stay static'));
        assert.ok(ROUTES.include.length + ROUTES.exclude.length <= 100);
    });
    test('the middleware exports the switch, and index.js says its own 302 is now unreachable', () => {
        const mw = read('functions/_middleware.js');
        assert.match(mw, /export function oldHostRedirect\(request\)/);
        assert.match(mw, /const moved = oldHostRedirect\(context\.request\);\n\s+if \(moved\) return moved;/);
        assert.match(mw, /OLD_HOST_KEEP = \['\/api\/', '\/__\/auth\/', '\/__\/firebase\/'\]/);
        assert.match(read('functions/index.js'), /DOMAIN SWITCH \(2026-11-15\)[\s\S]*unreachable in production/);
    });
    test('the homepage doors go to /tournaments; the three tournament shell pages and sw.js are untouched against origin/main (no cache bump)', () => {
        const h = read('hardpan-home.html');
        assert.match(h, /id="hero-start-tournament" href="\/organizers">/, 'the hero door is the organizer landing (ADVISOR-20261115-2017), whose buttons go to /tournaments');
        ['start-tournament', 'run-an-event'].forEach((id) => assert.match(h, new RegExp('id="' + id + '" href="/tournaments">'), id));
        assert.equal([...read('organizers.html').matchAll(/href="\/tournaments"/g)].length, 3, 'the organizer landing: three buttons to /tournaments');
        assert.doesNotMatch(h, /href="\/tournament"/);
        let base = 'origin/main';
        try { execFileSync('git', ['rev-parse', '--verify', '-q', base], { cwd: ROOT, stdio: 'ignore' }); } catch (e) { base = null; }
        if (!base) { test.skip ? null : null; return; }
        execFileSync('git', ['diff', '--quiet', base, '--', 'tournament.html', 'tournament-tv.html', 'tournament-scorecard.html', 'sw.js', 'build-shell.js'], { cwd: ROOT });
    });
});

describe('2. hardpangolf.com, the new front door', () => {
    test('/tournaments serves tournament.html with a 200 and no redirect (the address bar keeps /tournaments)', async () => {
        const r = await see(NEW + '/tournaments');
        assert.equal(r.status, 200); assert.equal(r.location, null); assert.equal(r.body, 'FILE:tournament.html');
    });
    test('/tournaments/?register=ABCD and /tournaments?tourney=R7SK48&k=x carry the query into tournament.html', async () => {
        for (const q of ['/tournaments/?register=ABCD', '/tournaments?tourney=R7SK48&k=x']) {
            const r = await see(NEW + q);
            assert.equal(r.status, 200, q); assert.equal(r.body, 'FILE:tournament.html', q);
        }
    });
    test('the old addresses still work unchanged on hardpangolf.com: /tournament?tourney=, /tournament-scorecard?, /tournament-tv?', async () => {
        for (const [q, f] of [['/tournament?tourney=R7SK48&k=x', 'tournament.html'], ['/tournament-scorecard?tourney=R7SK48&team=1', 'tournament-scorecard.html'], ['/tournament-tv?tourney=R7SK48', 'tournament-tv.html']]) {
            const r = await see(NEW + q);
            assert.equal(r.status, 200, q); assert.equal(r.location, null, q); assert.equal(r.body, 'FILE:' + f, q);
        }
    });
    test('a bare / is still the homepage, /?tourney= and /admin are still the app, on hardpangolf.com and on pages.dev', async () => {
        for (const host of [NEW, 'https://golf-app-5a5.pages.dev']) {
            const home = await see(host + '/');
            assert.equal(home.status, 200); assert.equal(home.body, 'FILE:hardpan-home.html', host + ' /');
            const app = await see(host + '/?tourney=R7SK48');
            assert.equal(app.status, 200); assert.equal(app.body, 'FILE:index.html', host + ' /?tourney=');
            const admin = await see(host + '/admin');
            assert.equal(admin.status, 200); assert.equal(admin.body, 'FILE:admin.html', host + ' /admin');
        }
    });
});

describe('3. tournaments.rattlegolf.com, the old host: a 301 to the same place on hardpangolf.com', () => {
    test('/ , /index, /index.html, /app (query kept) -> https://hardpangolf.com/tournaments', async () => {
        for (const [p, q] of [['/', ''], ['/index', '?register=ABCD'], ['/index.html', '?tourney=R7SK48&k=x'], ['/', '?utm_source=x'], ['/app', '?tourney=R7SK48'], ['/app/', '']]) {
            const r = await see(OLD + p + q);
            assert.equal(r.status, 301, p + q);
            assert.equal(r.location, NEW + '/tournaments' + q, p + q);
        }
    });
    test('every product page keeps its path and query: /tournament, /tournament-scorecard, /tournament-tv, /tournaments', async () => {
        for (const q of ['/tournament?tourney=R7SK48&k=abc', '/tournament-scorecard?tourney=R7SK48&team=3&k=abc', '/tournament-tv?tourney=R7SK48&checkin=1', '/tournaments', '/tournaments/?register=ABCD']) {
            const r = await see(OLD + q);
            assert.equal(r.status, 301, q);
            assert.equal(r.location, NEW + q, q);
            assert.equal(r.body, '', 'no body behind a 301');
        }
    });
    test('a host under the old name and a Host header against localhost (wrangler / curl -H) redirect the same way', async () => {
        const a = await see('https://pr-123.tournaments.rattlegolf.com/tournament?tourney=R7SK48');
        assert.equal(a.status, 301); assert.equal(a.location, NEW + '/tournament?tourney=R7SK48');
        const b = await see('http://127.0.0.1:8799/tournament-tv?tourney=R7SK48', 'tournaments.rattlegolf.com');
        assert.equal(b.status, 301); assert.equal(b.location, NEW + '/tournament-tv?tourney=R7SK48');
    });
    test('the 301 is bounded (one hour) so a rollback is not trapped by a forever cache', async () => {
        const r = await see(OLD + '/tournament?tourney=R7SK48');
        assert.equal(r.status, 301);
        assert.match(r.cache || '', /max-age=3600/);
    });
    test('/api/*, /__/auth/* and /__/firebase/* are NOT redirected on the old host (a push, a scan or a sign-in in flight completes there)', async () => {
        for (const p of ['/api/course-search?q=papago', '/__/auth/handler?x=1', '/__/firebase/init.json']) {
            const req = new Request(OLD + p, { headers: { host: 'tournaments.rattlegolf.com' } });
            assert.equal(MW.oldHostRedirect(req), null, p);
        }
        // and the API path really falls through the middleware to its own route
        const r = await MW.onRequest({ request: new Request(OLD + '/api/course-search?q=papago', { headers: { host: 'tournaments.rattlegolf.com' } }), env: {}, next: async () => new Response('API', { status: 200 }) });
        assert.equal(r.status, 200); assert.equal(await r.text(), 'API');
    });
    test('the Consumer app is never served on the old host: /admin, /sidematches and /index.html?game= all leave for hardpangolf.com', async () => {
        for (const q of ['/admin', '/sidematches?game=TEST', '/index.html?game=TEST&group=1']) {
            const req = new Request(OLD + q, { headers: { host: 'tournaments.rattlegolf.com' } });
            const r = MW.oldHostRedirect(req);
            assert.ok(r && r.status === 301, q + ' would be served on the old host');
            assert.match(r.headers.get('location'), /^https:\/\/hardpangolf\.com\//, q);
        }
    });
    test('hardpangolf.com and pages.dev are never redirected by the switch', async () => {
        for (const u of [NEW + '/tournament?tourney=R7SK48', 'https://golf-app-5a5.pages.dev/tournament-tv?tourney=R7SK48', 'https://preview-x.golf-app-5a5.pages.dev/tournaments']) {
            assert.equal(MW.oldHostRedirect(new Request(u, { headers: { host: new URL(u).host } })), null, u);
        }
    });
});
