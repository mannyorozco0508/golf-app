// ============================================================================
// /api/card-turn-in  (C, ADVISOR-20261118-1533)
//
// A group's paper card, scanned on a golfer's phone, on its way to the
// organizer's Desk. Every rule lives in _turnin.js; this file is thin, like
// scorecard-scan.js.
//
//   POST  { action: 'send', code, sk, scan, by?, photo? }   anyone signed in, switch on
//   POST  { action: 'approve' | 'decline', code, sk }        the owner
//   GET   ?code=&sk=                 the card's state (anyone)
//   GET   ?code=                     the event's cards (owner)
//   GET   ?code=&sk=&read=1          one card's scanner read (owner)
//   GET   ?code=&sk=&photo=1         one card's JPEG (owner)
// Header: Authorization: Bearer <Firebase ID token>
// ============================================================================

import { handleTurnIn, toResponse } from './_turnin.js';
import { corsHeadersFor, preflightResponse } from './_lib.js';

export async function onRequestOptions(context) {
    return preflightResponse(context.request, ['GET', 'POST']);
}

function authOf(req) {
    return req && req.headers && typeof req.headers.get === 'function' ? req.headers.get('Authorization') : null;
}

export async function onRequestGet(context) {
    const req = context.request;
    let query = {};
    try { query = Object.fromEntries(new URL(req.url).searchParams.entries()); } catch (e) { query = {}; }
    return toResponse(await handleTurnIn({ env: context.env || {}, method: 'GET', query, authorization: authOf(req) }), { headers: corsHeadersFor(req) });
}

export async function onRequestPost(context) {
    const req = context.request;
    let body = null;
    try { body = await req.json(); } catch (e) { body = null; }
    return toResponse(await handleTurnIn({ env: context.env || {}, method: 'POST', body, authorization: authOf(req) }), { headers: corsHeadersFor(req) });
}
