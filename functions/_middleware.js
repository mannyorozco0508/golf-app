// ============================================================================
// NON-SITE FILES ANSWER 404 (tfweb-2, Manny, Oct 26)
//
// The Pages project serves the repo ROOT as the site, so every committed file
// was a public URL: /package.json, /CLAUDE.md, /database.rules.json, every
// *_test.js, /tools/..., /helpers/..., /ios/..., /android/... (measured live,
// all 200). This middleware answers 404 for those, and calls next() for
// everything else - the pages, the engine scripts, the icons, the manifests,
// sw.js, assets/ and /api/*.
//
// WHY A MIDDLEWARE + _routes.json, AND NOT A BUILD STEP OR _redirects
//   - A build step that copies only the site into an output dir would need the
//     Pages project's build settings changed in the dashboard (a live config
//     change, outside this branch), and a file missed by the copy would break
//     the site. This moves nothing: the site is served exactly as before.
//   - _redirects cannot answer 404 (only 200 rewrites and 3xx), and a rewrite to
//     a missing file lands on the SPA fallback (index.html, 200).
//   - _routes.json (repo root) limits where Functions run: "/" and "/api/*" as
//     before, plus ONLY the blocked patterns. Every other static file never
//     invokes a Function, so nothing about the site's speed or cost changes.
//     The list here and the include list there are pinned to each other by
//     site_block_tfweb2_test.js.
// ============================================================================

import { isHomepageQuery, serveApp } from './_front-door.js';
import { isTournamentsRequest } from './index.js';

// Top-level folders that are not the site (some exist only on other branches).
export const BLOCKED_DIRS = [
    'tools', 'helpers', 'docs', 'scripts', 'android', 'ios', 'gps-beta',
    'firebase-functions', 'functions', 'stripe-functions', 'test-runs', 'dist', 'www',
    'node_modules', '.github', '.wrangler', '.git'
];

// Top-level files that are not the site.
export const BLOCKED_FILES = [
    'package.json', 'package-lock.json', 'firebase.json', 'build-shell.js',
    'sync-mobile-web.js', 'global_courses_snapshot.json', 'capacitor.config.ts',
    '.gitignore',
    // HELD OFF THE SITE until Stripe is live (Manny, Nov 10 2026): the
    // entry-fee refund page describes card payments that are not live yet.
    // The file stays in the repo; take these two lines out to put it back.
    'refunds', 'refunds.html'
];

// Top-level file patterns that are not the site.
export const BLOCKED_PATTERNS = [
    /_test\.js$/i,            // the test files
    /\.test\.js$/i,
    /\.fixture\.json$/i,      // test fixtures
    /\.tests-data\.json$/i,
    /^database\.rules.*\.json$/i,   // rules (live and rollback copies)
    /\.rules$/i,              // storage.rules (E4 photo wall, 2026-11-09)
    /\.md$/i,                 // notes and plans
    /\.mjs$/i,
    /\.ts$/i,
    /\.swift$/i,
    /^\./                     // dot-files
];

export function isBlockedPath(pathname) {
    let p = String(pathname || '/');
    try { p = decodeURIComponent(p); } catch (e) { /* keep it raw */ }
    p = p.replace(/\/{2,}/g, '/');
    const parts = p.split('/').filter(Boolean);
    if (!parts.length) return false;
    const first = parts[0].toLowerCase();
    if (parts.length > 1 || p.endsWith('/')) {
        if (BLOCKED_DIRS.includes(first)) return true;
    }
    if (parts.length === 1) {
        if (BLOCKED_DIRS.includes(first)) return true;   // /tools, /ios
        if (BLOCKED_FILES.includes(first)) return true;
        if (BLOCKED_PATTERNS.some((re) => re.test(parts[0]))) return true;
    }
    return false;
}

export function notFound() {
    return new Response('Not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }
    });
}

// ============================================================================
// /__/auth/ AND /__/firebase/ ARE FIREBASE'S, FORWARDED (web-signin-redirect,
// 2026-11-07). Firebase's "Best practices for using signInWithRedirect on
// browsers that block third-party storage access", OPTION 3: "forward GET and
// POST requests from https://<app domain>/__/auth/ to
// https://<project>.firebaseapp.com/__/auth/", transparently - "this cannot be
// done via a 302 Redirect". admin.html sets authDomain to this host on
// hardpangolf.com and golf-app-5a5.pages.dev, so the sign-in handler and its
// iframe are FIRST-PARTY and Safari / Chrome storage partitioning no longer
// loses the redirect result. /__/firebase/ (init.json) is forwarded too, so the
// handler finds the project's config on the same origin it runs on.
//
// Only these two prefixes, only to the one project's own firebaseapp.com host
// (a fixed origin - nothing in the request picks where it goes), GET/HEAD/POST
// only, never cached, and redirects are handed back to the browser untouched
// (Google's and Apple's sign-in pages are where they point). Before this the
// paths fell through to the SPA fallback (index.html, 200 - measured live).
// ============================================================================
export const AUTH_PROXY_ORIGIN = 'https://golfapp-9fb21.firebaseapp.com';
export const AUTH_PROXY_PREFIXES = ['/__/auth/', '/__/firebase/'];
const AUTH_PROXY_METHODS = ['GET', 'HEAD', 'POST', 'OPTIONS'];
// Hop-by-hop and Cloudflare's own headers are not the browser's to forward.
const AUTH_PROXY_DROP = ['host', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'cf-worker',
    'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade'];

export function isAuthProxyPath(pathname) {
    const p = String(pathname || '');
    return AUTH_PROXY_PREFIXES.some((x) => p.startsWith(x)) && !/(^|\/)\.\.(\/|$)/.test(p) && !/%2e%2e/i.test(p);
}

export function authProxyTarget(requestUrl) {
    const u = new URL(requestUrl);
    return AUTH_PROXY_ORIGIN + u.pathname + u.search;
}

export async function authProxy(request, fetchImpl) {
    const method = String(request.method || 'GET').toUpperCase();
    if (!AUTH_PROXY_METHODS.includes(method)) {
        return new Response('Method not allowed', { status: 405, headers: { Allow: AUTH_PROXY_METHODS.join(', '), 'Cache-Control': 'no-store' } });
    }
    const headers = new Headers(request.headers);
    AUTH_PROXY_DROP.forEach((h) => headers.delete(h));
    const init = { method, headers, redirect: 'manual' };
    if (method === 'POST') init.body = await request.arrayBuffer();   // Apple posts its answer (form_post)
    const res = await (fetchImpl || fetch)(authProxyTarget(request.url), init);
    const out = new Headers(res.headers);
    out.set('Cache-Control', 'no-store');
    return new Response(method === 'HEAD' ? null : res.body, { status: res.status, statusText: res.statusText, headers: out });
}

// BARE /index.html AND /index ARE THE APP, NOT THE HOMEPAGE (website-d).
// Pages' Pretty URLs 308 /index.html to `/`, and a bare `/` is now the
// homepage - so a bookmark of hardpangolf.com/index.html, or the service
// worker's own install fetch of ./index.html, would have landed on the
// homepage. These two spellings with no app query get index.html straight
// from the asset server (200, no redirect). WITH an app query they are left
// alone: /index.html?game=X 308s to /?game=X as it always has, and `/` with
// that query is the app (functions/index.js). On the Tournaments host they are
// left alone too: there the 308 lands on `/`, which goes to /tournament.
export function isBareAppDocument(url) {
    let u;
    try { u = new URL(url); } catch (e) { return false; }
    return (u.pathname === '/index.html' || u.pathname === '/index') && isHomepageQuery(u.search);
}

export async function onRequest(context) {
    if (isBareAppDocument(context.request.url) && !isTournamentsRequest(context.request)) {
        const app = await serveApp(context);
        if (app) return app;
    }
    let pathname = '/';
    try { pathname = new URL(context.request.url).pathname; } catch (e) { /* treat as / */ }
    if (isAuthProxyPath(pathname)) return authProxy(context.request);
    if (isBlockedPath(pathname)) return notFound();
    return context.next();
}
