// ============================================================================
// GET /api/course-search?q=<term>
//
// Cloudflare Pages routes this file to that URL by its filename. The rule it
// applies lives in _lib.js, shared with the detail route - see the note there on
// why there is one builder rather than a copy in each.
//
// THIS FILE IS DELIBERATELY THIN. Everything it does is translate an HTTP
// request into the handler's arguments and the handler's answer back into a
// Response. If logic accumulates here it will accumulate in the detail route
// too, differently, and the two will drift.
// ============================================================================

import { handleSearch, toResponse } from './_lib.js';

export async function onRequestGet(context) {
    const url = new URL(context.request.url);
    return toResponse(await handleSearch({
        q: url.searchParams.get('q'),
        // CF-Connecting-IP is set by Cloudflare's edge and cannot be spoofed by
        // a client header, which is what makes the per-IP cap worth having.
        ip: context.request.headers.get('CF-Connecting-IP'),
        env: context.env || {},
        // OPTIONAL-CHAINED. A missing binding must become a reason in the
        // handler, not a TypeError here - a route that throws returns
        // Cloudflare's 1101 and the caller learns nothing.
        kv: context.env && context.env.GOLFCOURSE_KV
    }));
}
