// ============================================================================
// 2.1.1 INVITE, THE WEB SIDE (Advisor 2026-11-21 08:05; iOS hand-off
// ~/Desktop/claude-mailbox-shared/tournaments/IOS-20261121-0326-211-invite-website.md)
//
// WHAT IS GUARDED
//   1. The AASA claims /m/* for the app (A2Z95T64UU.com.rattlegolf.app), as the FIRST component, and keeps every
//      old exclude (/tournament-scorecard*, /tournament*, "*") after it in order - so tournament links and every
//      other path still open in the browser. Apple evaluates components in order; the first match decides.
//   2. GET /m/<CODE> on hardpangolf.com -> 302 /shared?game=<CODE> (upper-cased, the incoming query dropped,
//      never cached); anything that is not the app's code format -> 302 to the homepage. The code format is the
//      app's own: hp-email-link-open.js gameTarget on feat-211-invite dc80f142, /^\/m\/([A-Za-z0-9]{4,10})\/?$/.
//   3. The page that link lands on serves Open Graph / Twitter preview tags in its static <head> (crawlers run no
//      JS): title, one-line description, an absolute https image that exists in the repo as a 1200x630 PNG and is
//      not blocked by the middleware. No money words.
//
// HOW IT ARRIVES. Sections 2 and 3 go through a model of Pages the way a request does - _routes.json decides
// whether Functions run, then functions/_middleware.js, then the route's Function (functions/m/[[path]].js),
// then the static layer (_redirects, Pretty URLs, SPA fallback). The redirect is FOLLOWED to the page and the
// tags are read from the bytes that page serves. No page script is called. WHAT THIS CANNOT PROVE: Cloudflare's
// own routing (the wrangler probe measures that), iOS's AASA matching on a device, and how iMessage / WhatsApp
// render the card - those are device checks.
//
// TESTS: 12.
// BASELINE against main 0b8febf7 (this exact file copied there, final run):
//   2 pass / 10 fail / 0 cancelled.   2 + 10 = 12.
//   The 2 that pass describe what must NOT change: 1.2 (every old exclude still there, in order - the AASA at
//   0b8febf7 has exactly the three, and no /m/* to sit ahead of) and 2.6 (/shared, /admin and /tournament untouched).
//   2.5 is red there for a real reason: /m/* is not in _routes.json, so the old host's /m/ link never reaches the
//   middleware's 301 and falls to the SPA fallback.
// HERE (preview-invite-211): 12 pass / 0 fail.
// NEGATIVE CONTROLS: listed in the commit message (each restored by cp from a scratchpad copy, sha RESTORED-OK).
// ============================================================================
'use strict';
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = __dirname;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(ROOT, f));
const NEW = 'https://hardpangolf.com';
const OLD = 'https://tournaments.rattlegolf.com';

// The app's own matcher (feat-211-invite dc80f142, hp-email-link-open.js gameTarget), copied verbatim.
const APP_M_RE = /^\/m\/([A-Za-z0-9]{4,10})\/?$/;

// ---- Apple's AASA matching: components in order, first match decides; '*' any run, '?' one character ----------
const aasaMatch = (pattern, p) => new RegExp('^' + pattern.split('').map((c) => (c === '*' ? '.*' : (c === '?' ? '.' : c.replace(/[.+^${}()|[\]\\]/g, '\\$&')))).join('') + '$').test(p);
function aasaComponents() { return JSON.parse(read('.well-known/apple-app-site-association')).applinks.details[0].components; }
function opensApp(p) {
    const hit = aasaComponents().find((c) => aasaMatch(c['/'], p));
    return !!hit && hit.exclude !== true;
}

// ---- A model of Pages ----------------------------------------------------------------------------------------
const RULES = read('_redirects').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/));
const ROUTES = JSON.parse(read('_routes.json'));
const routeMatch = (rule, p) => new RegExp('^' + rule.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(p);
const routed = (p) => ROUTES.include.some((r) => routeMatch(r, p)) && !ROUTES.exclude.some((r) => routeMatch(r, p));
function file(name) { return new Response(fs.readFileSync(path.join(ROOT, name)), { status: 200, headers: { 'content-type': 'text/html', 'X-Served-File': name } }); }
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
    if (/\.html$/.test(p)) return Response.redirect(new URL(p.replace(/\.html$/, '') + u.search, u).toString(), 308);
    const f = p.replace(/^\//, '');
    if (f && exists(f + '.html') && !p.endsWith('/')) return file(f + '.html');
    if (f && exists(f) && fs.statSync(path.join(ROOT, f)).isFile()) return file(f);
    return file('index.html');   // no 404.html: the SPA fallback
}
let MW = null, IDX = null, MFN = null, MFN_ERR = null;
before(async () => {
    MW = await import(pathToFileURL(path.join(ROOT, 'functions', '_middleware.js')).href);
    IDX = await import(pathToFileURL(path.join(ROOT, 'functions', 'index.js')).href);
    try { MFN = await import(pathToFileURL(path.join(ROOT, 'functions', 'm', '[[path]].js')).href); } catch (e) { MFN_ERR = e; }
});
function handlerFor(pathname) {
    if (pathname === '/') return IDX.onRequest;
    if (pathname.startsWith('/m/') && MFN) return MFN.onRequest;
    return null;
}
async function hop(urlStr) {
    const request = new Request(urlStr, { headers: { host: new URL(urlStr).host } });
    const pathname = new URL(urlStr).pathname;
    if (!routed(pathname)) return staticServe(urlStr);
    const route = handlerFor(pathname);
    const env = { ASSETS: { fetch: async (req) => staticServe(typeof req === 'string' ? req : req.url) } };
    return MW.onRequest({ request, env, next: async () => (route ? route({ request, env, next: async () => staticServe(urlStr) }) : staticServe(urlStr)) });
}
// Follow redirects the way a browser or a link-preview crawler does; return every hop and the final page.
async function arrive(urlStr) {
    const hops = [];
    let cur = urlStr;
    for (let i = 0; i < 6; i++) {
        const res = await hop(cur);
        const loc = res.headers.get('location');
        hops.push({ url: cur, status: res.status, location: loc, cache: res.headers.get('cache-control') });
        if (res.status >= 300 && res.status < 400 && loc) { cur = new URL(loc, cur).toString(); continue; }
        return { hops, final: cur, status: res.status, served: res.headers.get('X-Served-File'), body: await res.text() };
    }
    throw new Error('redirect loop from ' + urlStr);
}

// ---- Head tags as served -------------------------------------------------------------------------------------
function headMetas(html) {
    const head = (/<head>([\s\S]*?)<\/head>/i.exec(html) || [, ''])[1].replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
    const out = {};
    for (const m of head.matchAll(/<meta\s+([^>]*?)\/?>/gi)) {
        const attrs = {};
        for (const a of m[1].matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)) attrs[a[1].toLowerCase()] = a[2];
        const key = attrs.property || attrs.name;
        if (key && 'content' in attrs) out[key] = attrs.content;
    }
    return out;
}
function pngSize(rel) {
    const b = fs.readFileSync(path.join(ROOT, rel));
    assert.equal(b.slice(0, 8).toString('hex'), '89504e470d0a1a0a', rel + ' is not a PNG');
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

describe('1. the AASA', () => {
    test('1.1 valid JSON, the one app ID, /m/* is the FIRST component and claims (no exclude); it is the only claim', () => {
        const j = JSON.parse(read('.well-known/apple-app-site-association'));
        assert.equal(j.applinks.details.length, 1);
        assert.deepEqual(j.applinks.details[0].appIDs, ['A2Z95T64UU.com.rattlegolf.app']);
        const comps = aasaComponents();
        assert.equal(comps[0]['/'], '/m/*', 'the first component');
        assert.notEqual(comps[0].exclude, true, '/m/* must claim');
        assert.deepEqual(comps.filter((c) => c.exclude !== true).map((c) => c['/']), ['/m/*'], 'exactly one claim');
    });
    test('1.2 every old exclude is still there, still exclude, in its old order, after /m/*', () => {
        const comps = aasaComponents();
        const OLD_EXCLUDES = ['/tournament-scorecard*', '/tournament*', '*'];
        const idx = OLD_EXCLUDES.map((p) => comps.findIndex((c) => c['/'] === p && c.exclude === true));
        idx.forEach((i, k) => assert.ok(i >= 0, 'missing exclude ' + OLD_EXCLUDES[k]));
        assert.deepEqual([...idx].sort((a, b) => a - b), idx, 'old order kept');
        const mAt = comps.findIndex((c) => c['/'] === '/m/*');
        if (mAt >= 0) idx.forEach((i) => assert.ok(i > mAt, 'an exclude ahead of /m/* would swallow it'));
        assert.equal(comps[comps.length - 1]['/'], '*', 'the catch-all exclude is last');
    });
    test('1.3 Apple order: /m/<CODE> opens the app; tournament, team, watch, home, app and auth paths stay in the browser', () => {
        ['/m/ABC123', '/m/abc123', '/m/K7Q2ZX/'].forEach((p) => assert.ok(opensApp(p), 'should open the app: ' + p));
        ['/tournament-scorecard', '/tournament-scorecard.html', '/tournament', '/tournaments', '/tournament-tv', '/', '/app',
            '/index.html', '/admin', '/shared', '/shared.html', '/hardpan-home', '/__/auth/handler', '/__/auth/links', '/m', '/mx/ABC123']
            .forEach((p) => assert.ok(!opensApp(p), 'must stay in the browser: ' + p));
    });
});

describe('2. /m/<CODE> in a browser', () => {
    test('2.1 _routes.json sends /m/* to Functions and _redirects has no /m rule; the Function exists', () => {
        assert.ok(routed('/m/ABC123'), '/m/ABC123 is not routed to Functions');
        assert.ok(ROUTES.include.length + ROUTES.exclude.length <= 100, 'Pages caps the routes file at 100 rules');
        assert.ok(!RULES.some(([from]) => /^\/m(\/|$)/.test(from)), 'a _redirects rule for /m');
        assert.ok(MFN, 'functions/m/[[path]].js did not load: ' + (MFN_ERR && MFN_ERR.message));
        assert.equal(typeof MFN.onRequest, 'function');
    });
    test('2.2 a valid code: one 302 to /shared?game=<CODE> upper-cased, query dropped, never cached, landing on shared.html', async () => {
        const a = await arrive(NEW + '/m/abc123?utm_source=x&k=secret');
        assert.equal(a.hops[0].status, 302);
        assert.equal(a.hops[0].location, NEW + '/shared?game=ABC123');
        assert.equal(a.hops[0].cache, 'no-store');
        assert.equal(a.final, NEW + '/shared?game=ABC123');
        assert.equal(a.status, 200);
        assert.equal(a.served, 'shared.html', 'the round link lands on the live scorecard');
        assert.match(a.body, /urlParams\.get\('game'\)/, 'positive: it is the page that reads ?game=');
    });
    test('2.3 every code the app accepts redirects with that code (4..10 letters/digits, trailing slash allowed)', async () => {
        for (const code of ['ABCD', 'K7Q2ZX', 'abc123', 'A1B2C3D4E5']) {
            for (const tail of ['', '/']) {
                const p = '/m/' + code + tail;
                assert.ok(APP_M_RE.test(p), 'fixture: the app accepts ' + p);
                const a = await arrive(NEW + p);
                assert.equal(a.hops[0].status, 302, p);
                assert.equal(a.hops[0].location, NEW + '/shared?game=' + code.toUpperCase(), p);
            }
        }
    });
    test('2.4 anything else under /m/ goes to the homepage (302), never to /shared, and the app would refuse it too', async () => {
        const BAD = ['/m/', '/m/ABC', '/m/ABCDEFGHIJK', '/m/ABC-12', '/m/AB%20C1', '/m/%3Cscript%3E', '/m/ABC123/extra', '/m/..%2Fadmin', '/m/ABC12%C3%A9'];
        for (const p of BAD) {
            assert.ok(!APP_M_RE.test(p), 'fixture: the app refuses ' + p);
            const a = await arrive(NEW + p);
            assert.equal(a.hops[0].status, 302, p);
            assert.equal(a.hops[0].location, NEW + '/', p + ' -> the homepage');
            assert.ok(!a.hops.some((h) => /shared/.test(h.location || '')), p + ' reached /shared');
        }
    });
    test('2.5 on the old tournament host /m/<CODE> is one 301 to the same path on hardpangolf.com (the middleware)', async () => {
        const res = await hop(OLD + '/m/ABC123');
        assert.equal(res.status, 301);
        assert.equal(res.headers.get('location'), NEW + '/m/ABC123');
    });
    test('2.6 nothing else moved: /shared?game=X serves shared.html with no redirect; /admin and /tournament are not redirected', async () => {
        const s = await arrive(NEW + '/shared?game=ABC123');
        assert.equal(s.hops.length, 1, 'no redirect on /shared');
        assert.equal(s.served, 'shared.html');
        const ad = await arrive(NEW + '/admin');
        assert.equal(ad.hops.length, 1);
        assert.equal(ad.served, 'admin.html');
        const t = await arrive(NEW + '/tournament?tourney=ABCD');
        assert.equal(t.hops.length, 1);
        assert.equal(t.served, 'tournament.html');
    });
});

describe('3. the link preview, read from the page the link lands on', () => {
    let tags = null;
    before(async () => { tags = headMetas((await arrive(NEW + '/m/K7Q2ZX')).body); });
    test('3.1 og:title, og:description, og:type, og:site_name and the Twitter card are in the served <head>', () => {
        assert.match(tags['og:title'] || '', /HardPan/, 'og:title names HardPan');
        assert.ok((tags['og:description'] || '').length >= 20, 'a one-line description');
        assert.ok((tags['og:description'] || '').length <= 160, 'one line, not a paragraph');
        assert.equal(tags['og:type'], 'website');
        assert.equal(tags['og:site_name'], 'HardPan Golf');
        assert.equal(tags['twitter:card'], 'summary_large_image');
        assert.equal(tags['twitter:title'], tags['og:title']);
        assert.equal(tags['twitter:description'], tags['og:description']);
    });
    test('3.2 the image: absolute https on hardpangolf.com, a 1200x630 PNG in the repo, served (not blocked, no Function)', () => {
        const img = tags['og:image'] || '';
        assert.match(img, /^https:\/\/hardpangolf\.com\/[^?#]+\.png$/, 'og:image ' + img);
        assert.equal(tags['twitter:image'], img);
        const rel = new URL(img).pathname.replace(/^\//, '');
        assert.ok(exists(rel), rel + ' is not in the repo');
        assert.deepEqual(pngSize(rel), { w: 1200, h: 630 });
        assert.equal(tags['og:image:width'], '1200');
        assert.equal(tags['og:image:height'], '630');
        assert.equal(MW.isBlockedPath('/' + rel), false, 'the middleware would 404 the image');
        assert.ok(!routed('/' + rel), 'the image would run a Function');
    });
    test('3.3 the preview words: no money, bet or pool words, no amounts, no competitor names', () => {
        const words = ['og:title', 'og:description', 'twitter:title', 'twitter:description', 'description', 'og:image:alt'].map((k) => tags[k] || '').join(' | ');
        assert.ok(words.length > 40, 'positive: the words were read');
        assert.ok(!/\$|\bbets?\b|\bbetting\b|\bpool\b|\bcash\b|\bwagers?\b|\bpayouts?\b|\bmoney\b|\bstakes?\b|\bowes?\b/i.test(words), words);
        assert.ok(!/18Birdies|Golfshot|Grint|Hole19|SwingU|GolfNow|Arccos|Garmin/i.test(words), words);
    });
});
