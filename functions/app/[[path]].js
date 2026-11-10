// ============================================================================
// /app IS THE WEB APP (website-d, Manny Nov 10: "move the web app to
// hardpangolf.com/app")
//
// /app and /app?<anything> serve index.html with a 200, exactly what a plain
// `/` served before the homepage moved there: index.html reads its round from
// location.search, and with none it sends the visitor to admin.html (the
// "What are you setting up?" front door).
//
// /app/ and /app/<more> 308 to /app (query kept). index.html loads its scripts
// by RELATIVE path (gps-view.js, pwa-boot.js ...). At /app those resolve to
// /gps-view.js; at /app/ they would resolve to /app/gps-view.js, which does not
// exist, and Pages' single-page fallback would answer it with index.html - a
// page of HTML where a script was expected, and a blank app.
//
// WHY A FUNCTION AND NOT THE SPA FALLBACK. Today an unknown path such as /app
// already gets index.html, only because the repo has no 404.html (measured on
// the live site, Nov 10: /app, /app/ and /nonexistent all answer index.html).
// One 404.html added later would silently turn /app into a 404. This file
// makes /app a real route.
//
// NATIVE: the iOS/Android apps load index.html and admin.html from the bundle
// and never ask for /app. Nothing in the bundled pages links to /app.
// ============================================================================

import { serveApp } from '../_front-door.js';
import { isTournamentsRequest } from '../index.js';

export async function onRequest(context) {
    const url = new URL(context.request.url);
    // tournaments.rattlegolf.com does not deal with the Consumer app (Manny's
    // rule, functions/index.js): its /app goes to /tournament, query kept.
    if (isTournamentsRequest(context.request)) {
        const dest = new URL('/tournament', url);
        dest.search = url.search;
        return Response.redirect(dest.toString(), 302);
    }
    if (url.pathname !== '/app') {
        const dest = new URL('/app', url);
        dest.search = url.search;
        return Response.redirect(dest.toString(), 308);
    }
    const app = await serveApp(context);
    if (app) return app;
    // No asset binding (should not happen on Pages): the static fallback for
    // /app is index.html today, so hand it on rather than invent a page.
    if (typeof context.next === 'function') return context.next();
    return new Response('Not found', { status: 404 });
}
