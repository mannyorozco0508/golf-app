// ============================================================================
// /api/<anything nothing else answers>
//
// Cloudflare routes this file to every /api path no more specific Function
// claims - AND to a method a specific Function does not export: a POST to
// course-search.js, which exports only onRequestGet, falls through to here.
// Measured 2026-09-12 in a scratch Pages project before this was written; the
// specific routes keep winning for the methods they export.
//
// Without this file an unmatched /api GET answered with index.html at 200
// (there is no 404.html, so Pages falls back to the SPA) and a wrong method
// answered 405 with no Allow. tools/api-404-check.js measures both over HTTP.
//
// THE PATH LIST BELOW IS LITERAL, AND THIS IS WHY. Pages derives routes from
// filenames, and a Worker has no filesystem at run time, so this file cannot
// ask which routes exist. What it CAN derive - and does - is the METHODS each
// route allows, from that route module's own exports: a module that gains
// onRequestPost updates its Allow header here by itself. The literal list is
// held against functions/api/ on disk by api_catchall_test.js, so a route
// added without a row here fails the suite rather than answering 405 for a
// method it exports. Thin, like the two routes: the rule is in _lib.js.
// ============================================================================

import { noSuchRoute, methodNotAllowed } from './_lib.js';
import * as courseSearch from './course-search.js';
import * as courseDetail from './course/[id].js';

// onRequestGet -> 'GET', onRequestPost -> 'POST', ...
const methodsOf = (mod) => Object.keys(mod)
    .filter((k) => /^onRequest[A-Z][a-z]+$/.test(k))
    .map((k) => k.replace('onRequest', '').toUpperCase())
    .sort();

// file: relative to functions/api/, as Pages sees it. matches: the segment
// array the catch-all received, exactly.
export const ROUTES = [
    { file: 'course-search.js', matches: (seg) => seg.length === 1 && seg[0] === 'course-search',
      methods: methodsOf(courseSearch) },
    { file: 'course/[id].js', matches: (seg) => seg.length === 2 && seg[0] === 'course' && seg[1].length > 0,
      methods: methodsOf(courseDetail) }
];

export async function onRequest(context) {
    const seg = Array.isArray(context.params && context.params.path) ? context.params.path
        : String((context.params && context.params.path) || '').split('/').filter(Boolean);
    const route = ROUTES.find((r) => r.matches(seg));
    // A real route reached the catch-all only because it does not export this
    // method - Pages would have answered from the module otherwise.
    if (route) return methodNotAllowed(route.methods);
    return noSuchRoute();
}
