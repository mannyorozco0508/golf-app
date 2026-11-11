// ============================================================================
// WHO GETS THE HOMEPAGE AT hardpangolf.com/ AND WHO GETS THE WEB APP
// (website-d, Manny Nov 10: "make hardpangolf.com show the 27A homepage and
// move the web app to hardpangolf.com/app. Every existing round/scorer/team/
// trip link must still open the web app directly.")
//
// THE RULE, in one line: the homepage is served ONLY for a bare `/` - no query
// at all, or a query made of nothing but ad/analytics tracking tags. Any other
// query at `/` is an app link (?game=, &group=, ?k=, ?tourney=, ?trip=,
// ?season=, ?mode=signIn&oobCode=, ?fresh=1, anything we have not thought of)
// and gets the web app exactly as before. Unknown means app, never homepage:
// a golfer holding a link must never land on a sales page.
//
// TRACKING TAGS. A Facebook, Google or newsletter click on the plain address
// arrives as /?fbclid=... or /?utm_source=... - that visitor typed or clicked
// "hardpangolf.com", so they get the homepage. None of these names is read by
// any page of the app (grep: no page reads utm_*, fbclid, gclid or ref).
//
// HASHES never reach the server, so they cannot be classified here. The app
// reads nothing from location.hash (grep: no page does), so a /#x visit is
// the homepage, where #features / #pricing are the homepage's own anchors.
//
// This file has no onRequest export, so Pages makes no route of it.
// ============================================================================

export const TRACKING_PARAM = /^(utm_[a-z0-9_]*|fbclid|gclid|gbraid|wbraid|dclid|msclkid|mc_cid|mc_eid|igshid|ttclid|twclid|li_fat_id|yclid|_ga|_gl|ref)$/i;

// The response header that marks a homepage answer. sw.js reads it: a response
// carrying it is never stored in the app cache, so the cached app shell under
// `/` can never be overwritten by the homepage (website-d, CACHE_VERSION v394).
export const PAGE_HEADER = 'X-HardPan-Page';

// The static file Pages serves for the homepage (Pretty URLs: /hardpan-home is
// hardpan-home.html with a 200; /hardpan-home.html would 308).
export const HOMEPAGE_ASSET = '/hardpan-home';
// The static file Pages serves for the app shell: `/` on the ASSET server is
// index.html (the asset server never runs a Function, so this is not a loop).
export const APP_ASSET = '/';

// true when a query string carries nothing an app page would read.
export function isHomepageQuery(search) {
    const s = String(search || '').replace(/^\?/, '');
    if (!s) return true;
    // "/?" and "/?&" hold no parameter at all, and are a bare visit too.
    for (const [name] of new URLSearchParams(s)) {
        if (!TRACKING_PARAM.test(name)) return false;
    }
    return true;
}

// true for exactly the bare-`/` visit that gets the homepage.
export function isHomepageVisit(url) {
    let u;
    try { u = new URL(url); } catch (e) { return false; }
    return u.pathname === '/' && isHomepageQuery(u.search);
}

async function fromAssets(context, assetPath, pageName) {
    const env = context.env || {};
    if (!env.ASSETS || typeof env.ASSETS.fetch !== 'function') return null;
    const target = new URL(assetPath, context.request.url);
    const res = await env.ASSETS.fetch(new Request(target.toString(), {
        method: context.request.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: context.request.headers
    }));
    // 304 IS AN ANSWER, NOT A FAILURE. A returning browser revalidates `/` with
    // If-None-Match; the asset server compares it with THIS file's ETag and
    // says 304 when the copy the browser holds is this file. Treating that as
    // "cannot read the homepage" served the app instead - measured in Chrome on
    // wrangler pages dev: the second visit to `/` opened the app.
    if (!res || (res.status !== 200 && res.status !== 304)) return null;
    const headers = new Headers(res.headers);
    headers.set(PAGE_HEADER, pageName);
    if (res.status === 304) return new Response(null, { status: 304, statusText: res.statusText, headers });
    return new Response(context.request.method === 'HEAD' ? null : res.body, {
        status: 200, statusText: res.statusText, headers
    });
}

// The homepage, served at the visitor's own address (200, the bar stays `/`).
// null when it cannot be read - the caller then serves the app, never a 404.
export function serveHomepage(context) {
    return fromAssets(context, HOMEPAGE_ASSET, 'home');
}

// The web app (index.html), served at the visitor's own address.
export function serveApp(context) {
    return fromAssets(context, APP_ASSET, 'app');
}
