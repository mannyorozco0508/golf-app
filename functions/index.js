// ============================================================================
// /  on Host: tournaments.rattlegolf.com  ->  /tournament
//
// One Cloudflare Pages project (golf-app-5a5) still hosts both products. The
// custom hostname says Tournaments; until this file existed, `/` on that host
// was index.html — the Consumer Live Scorecard. Manny's rule: this hostname
// does not deal with the consumer app. `/tournament` stays the product path.
//
// WHY THIS FILE, AND NOT _redirects OR A CLIENT SCRIPT
//
// Pages `_redirects` cannot match on Host, so a rule here would send EVERY
// hostname's `/` to `/tournament`, including golf-app-5a5.pages.dev and
// rattlegolf.com. A script in index.html would paint the Consumer shell first
// and would not show up in `curl -I`. functions/index.js is the Pages mapping
// for `/` and nothing else: /api, /tournament, /admin, every static asset
// keep their existing files. Consumer `/` on any other host calls next() and
// the static index.html is served as before.
//
// `/index.html` is not this Function's route. Cloudflare Pretty URLs 308 it
// to `/`, which then lands here. The path check below still treats /index
// and /index.html as the Consumer default document so a future middleware
// copy of this rule cannot redirect /tournament into a loop.
//
// Cache keys. This file is not a shell HTML page. sw.js is network-first, so
// an online visit to `/` on the custom host reaches this Function without a
// golfapp-v* bump. tournament.html is unchanged, so tournament-v* stays.
//
// THE ENTRY POINT PAGES INVOKES IS onRequest. Tests drive that, not a helper.
//
// WEBSITE-D (Manny, Nov 10): a BARE `/` on any other host is now the 27A
// homepage (hardpan-home.html, 200, the address bar stays `/`). "Bare" is
// decided in _front-door.js: no query, or only tracking tags (utm_*, fbclid,
// gclid, ref ...). EVERY other `/` - /?game=, /?game=&group=, /?tourney=,
// /?trip=, /?k=, /?mode=signIn&oobCode=, any query at all - still calls next()
// and gets index.html exactly as before. The web app's own address is /app
// (functions/app/[[path]].js). If the homepage file cannot be read, `/` falls
// back to the app, never to an error page.
// ============================================================================

import { isHomepageVisit, serveHomepage } from './_front-door.js';

const TOURNAMENTS_HOST = 'tournaments.rattlegolf.com';

function hostnamesOf(request) {
    const out = [];
    try {
        out.push(new URL(request.url).hostname);
    } catch (e) { /* ignore a malformed url and still read Host */ }
    // Honour Host so `curl -H "Host: tournaments.rattlegolf.com"` against
    // wrangler pages dev (request.url is localhost) still redirects.
    // Production sets request.url to the custom host, so the two agree there.
    const headers = request && request.headers;
    const raw = headers && typeof headers.get === 'function'
        ? (headers.get('host') || headers.get('Host'))
        : '';
    if (raw) out.push(String(raw).split(':')[0]);
    return out;
}

function isTournamentsHost(host) {
    const h = String(host || '').toLowerCase();
    return h === TOURNAMENTS_HOST || h.endsWith('.' + TOURNAMENTS_HOST);
}

// Also read by _middleware.js (bare /index.html) and app/[[path]].js (/app):
// on the Tournaments host neither may serve the Consumer app (website-d).
export function isTournamentsRequest(request) {
    return hostnamesOf(request).some(isTournamentsHost);
}

function isConsumerDefaultDocument(pathname) {
    const p = String(pathname || '/');
    return p === '/' || p === '/index' || p === '/index.html' || p === '/index.htm';
}

function shouldRedirectToTournament(request) {
    if (!hostnamesOf(request).some(isTournamentsHost)) return false;
    try {
        return isConsumerDefaultDocument(new URL(request.url).pathname);
    } catch (e) {
        return false;
    }
}

function redirectToTournament(request) {
    const dest = new URL('/tournament', request.url);
    try {
        dest.search = new URL(request.url).search;
    } catch (e) { /* keep /tournament with no query */ }
    return Response.redirect(dest.toString(), 302);
}

export async function onRequest(context) {
    const request = context.request;
    if (shouldRedirectToTournament(request)) {
        return redirectToTournament(request);
    }
    if (isHomepageVisit(request.url)) {
        const home = await serveHomepage(context);
        if (home) return home;
    }
    if (typeof context.next === 'function') return context.next();
    // Pages always provides next() so `/` can fall through to index.html.
    // If it is missing we must not invent the Consumer page.
    return new Response('Not found', { status: 404 });
}
