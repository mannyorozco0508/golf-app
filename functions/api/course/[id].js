// ============================================================================
// GET /api/course/<id>
//
// The bracketed filename is Cloudflare's dynamic-segment convention: the path
// segment arrives as context.params.id.
//
// A SEARCH DOES NOT CARRY TEE DATA. The API's own spec says so - search returns
// only a COUNT of tee boxes per grouping, and the full tee sets with their
// ratings, slopes and 18-hole arrays need this second request. That is why an
// import costs two of thirty-five per course, and why the search result's tee
// count is worth showing: a course with no tee data can be skipped for free.
//
// Thin for the same reason as the search route. The rule is in _lib.js.
// ============================================================================

import { handleDetail, toResponse } from '../_lib.js';

export async function onRequestGet(context) {
    return toResponse(await handleDetail({
        id: context.params.id,
        ip: context.request.headers.get('CF-Connecting-IP'),
        env: context.env || {},
        // OPTIONAL-CHAINED. A missing binding must become a reason in the
        // handler, not a TypeError here - a route that throws returns
        // Cloudflare's 1101 and the caller learns nothing.
        kv: context.env && context.env.GOLFCOURSE_KV
    }));
}
