// ============================================================================
// POST /api/push-send
//
// Cloudflare Pages routes this file to that URL by its filename. Every rule it
// applies lives in _push.js - see the note there on why the credential has a
// file of its own and why this route is thin.
//
// THIS FILE IS DELIBERATELY THIN, the same as /api/course-search: it translates
// an HTTP request into the handler's arguments and the handler's answer back
// into a Response. If logic accumulates here it accumulates somewhere that
// cannot be tested without a service-account key.
//
// WHAT CALLS IT. Not a browser. Whether to send is push-notify.js, which runs
// where the event happens; this route does the one thing a browser cannot: hold
// a credential. Until Manny's checklist steps 4 and 5 exist it answers
// not_configured and spends nothing, which is the whole point of shipping it
// inert.
//
// WHAT IT ACCEPTS (audit H5, 2026-10-16): Authorization: Bearer <Firebase ID
// token>, and a body of { template, params } - a template id from
// _push_templates.js and its small, checked parameters. No tokens, no words: the
// recipients' tokens are read by the server (the caller's own devices) and the
// words are the template's. A body that names other recipients is refused.
// ============================================================================

import { handleSend, toResponse } from './_push.js';
import { corsHeadersFor, preflightResponse } from './_lib.js';

// THE PREFLIGHT, AND IT IS NOT OPTIONAL. This route takes a POST with a JSON
// content-type, which the browser refuses to send until an OPTIONS has said it
// may. Without this export the preflight fell to the catch-all, came back 405,
// and the app could only report "Load failed" - fetch() gives a failed preflight
// no status and no body to read.
export async function onRequestOptions(context) {
    return preflightResponse(context.request, ['POST']);
}

export async function onRequestPost(context) {
    let body = null;
    // A BAD BODY IS A REASON, NOT A CRASH. A route that throws returns
    // Cloudflare's 1101 at HTTP 500, which is not a shape a caller can read.
    try { body = await context.request.json(); } catch (e) { body = null; }
    const d = body && typeof body === 'object' ? body : {};
    // ON EVERY ANSWER, INCLUDING THE REFUSALS. not_configured and no_device are
    // exactly the answers the app most needs to read, and a response a browser
    // will not let it read is indistinguishable from the network being down.
    const cors = { headers: corsHeadersFor(context.request) };
    const bearer = /^Bearer\s+(\S+)$/i.exec(String(context.request.headers.get('Authorization') || ''));
    return toResponse(await handleSend({
        env: context.env || {},
        idToken: bearer ? bearer[1] : null,
        template: d.template, params: d.params,
        roundCode: d.roundCode, recipients: d.recipients
    }), cors);
}
