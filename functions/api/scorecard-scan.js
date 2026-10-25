// ============================================================================
// POST /api/scorecard-scan
//
// URGENT-066 item 2. One photo of a paper scorecard in, the read scores and
// the shared validation out. Every rule lives in _scan.js; this file is thin,
// the same as push-send.js, so the logic is testable without a key.
//
// SHIPPED INERT: until GEMINI_API_KEY is a Pages secret this answers
// { status: 'not_configured' } and spends nothing.
//
// Body:   { image: { mimeType: 'image/jpeg', data: <base64> },
//           round: { holes, startHole?, par, strokeIndex?, players:[{name,...}], course?, tee? } }
// Header: Authorization: Bearer <Firebase ID token>
// ============================================================================

import { handleScan, toResponse } from './_scan.js';
import { corsHeadersFor, preflightResponse } from './_lib.js';

// A JSON POST with an Authorization header is preflighted; without this the
// app would only ever see "Load failed".
export async function onRequestOptions(context) {
    return preflightResponse(context.request, ['POST']);
}

export async function onRequestPost(context) {
    let body = null;
    try { body = await context.request.json(); } catch (e) { body = null; }
    const req = context.request;
    const authorization = req && req.headers && typeof req.headers.get === 'function'
        ? req.headers.get('Authorization') : null;
    const cors = { headers: corsHeadersFor(req) };
    return toResponse(await handleScan({
        env: context.env || {},
        body: body,
        authorization: authorization
    }), cors);
}
