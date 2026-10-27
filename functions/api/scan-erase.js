// ============================================================================
// POST /api/scan-erase
//
// 088 item 1: Delete account also erases the scorecard-scan counts. Deletes
// ONLY the signed-in caller's own counts (the uid comes from the verified
// Firebase ID token, never from the body). Every rule lives in _scan.js
// (handleScanErase); this file is thin, like scorecard-scan.js.
//
// Header: Authorization: Bearer <Firebase ID token>.  No body is read.
// Answers { status: 'erased', erased: <n> } | not_configured | refused sign_in
// ============================================================================

import { handleScanErase, toResponse } from './_scan.js';
import { corsHeadersFor, preflightResponse } from './_lib.js';

export async function onRequestOptions(context) {
    return preflightResponse(context.request, ['POST']);
}

export async function onRequestPost(context) {
    const req = context.request;
    const authorization = req && req.headers && typeof req.headers.get === 'function'
        ? req.headers.get('Authorization') : null;
    return toResponse(await handleScanErase({
        env: context.env || {},
        authorization: authorization
    }), { headers: corsHeadersFor(req) });
}
