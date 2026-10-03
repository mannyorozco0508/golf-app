// ============================================================================
// THE SENDER - ONE BUILDER, AND IT HOLDS THE ONLY SECRET IN THE FEATURE
//
// Firebase is on SPARK, so there are no Cloud Functions. This is the Cloudflare
// Pages Function that calls FCM HTTP v1 on the app's behalf, with the service
// account JSON in the Pages encrypted environment - FCM_SERVICE_ACCOUNT.
//
// THE SECRET IS NEVER IN THE BROWSER, for the same measured reason the course
// proxy's key is not: this repo's root is served publicly by Cloudflare Pages -
// /package.json and /build-shell.js both return 200 - so any file in the tree is
// a downloadable URL. The credential lives only in the Pages environment and
// only this Worker ever sees it.
//
// AND IT HOLDS NO PRODUCT LOGIC. What to say, to whom and how often is
// push-notify.js, which is pure and tested in plain node. This file signs a JWT,
// exchanges it for a token, and posts a message. If a decision ever appears
// here, it is a decision that cannot be tested without a credential.
//
// INERT WITHOUT THE SECRET, deliberately and visibly: with FCM_SERVICE_ACCOUNT
// unset every route answers { status: 'unavailable', reason: 'not_configured' }
// and spends nothing. That is the state TODAY - Manny's checklist steps 4 and 5
// create it - and the app must behave exactly as it does now until then.
//
// ---------------------------------------------------------------------------
// WHY A JWT BY HAND RATHER THAN THE FIREBASE ADMIN SDK
// ---------------------------------------------------------------------------
//
// The Admin SDK is a Node library: it wants crypto, streams and a filesystem,
// none of which a Worker has. Workers DO have WebCrypto, and FCM HTTP v1 wants
// exactly one thing from us - an OAuth2 access token obtained from a signed JWT.
// That is forty lines of SubtleCrypto and no dependency, which is also why this
// cannot drift out of date with a package version.
//
// THE PRIVATE KEY IS PKCS#8 PEM in the service-account JSON, which is what
// SubtleCrypto.importKey takes directly - no conversion, which is the one place
// a hand-rolled signer usually goes wrong.
// ============================================================================

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
// FCM HTTP v1 answers 404 UNREGISTERED and 400 INVALID_ARGUMENT for a token that
// is gone. Those are the two that mean "stop sending to this device", and the
// caller is told so it can drop the token rather than retry for ever.
const DEAD_TOKEN_CODES = [404, 400];

const unavailable = (reason) => ({ status: 'unavailable', reason });

// ---------------------------------------------------------------------------
// EVERY MISSING BINDING IS A REASON, NEVER A CRASH. A route that throws returns
// Cloudflare's 1101 at HTTP 500, which is not a shape a caller can interpret -
// the course proxy learned that with a missing KV namespace.
export function readServiceAccount(env) {
    const raw = env && env.FCM_SERVICE_ACCOUNT;
    if (typeof raw !== 'string' || !raw.trim()) return null;
    let sa;
    try { sa = JSON.parse(raw); } catch (e) { return null; }
    if (!sa || typeof sa !== 'object') return null;
    if (typeof sa.client_email !== 'string' || !sa.client_email) return null;
    if (typeof sa.private_key !== 'string' || !sa.private_key) return null;
    if (typeof sa.project_id !== 'string' || !sa.project_id) return null;
    return sa;
}

const b64url = (bytes) => {
    let s = '';
    const a = new Uint8Array(bytes);
    for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlText = (text) => b64url(new TextEncoder().encode(text));

// PKCS#8 PEM -> an ArrayBuffer SubtleCrypto will import. The \n in a JSON string
// is a real newline by the time JSON.parse is done, so nothing here unescapes.
function pemToBuffer(pem) {
    const body = String(pem).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    const bin = atob(body);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
}

export async function accessToken(sa, deps) {
    const d = deps || {};
    const doFetch = d.fetch || globalThis.fetch;
    const subtle = d.subtle || (globalThis.crypto && globalThis.crypto.subtle);
    const now = Math.floor((d.now || Date.now()) / 1000);
    if (!subtle) return { error: 'no_crypto' };

    const header = b64urlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64urlText(JSON.stringify({
        iss: sa.client_email, scope: FCM_SCOPE, aud: GOOGLE_TOKEN_URL,
        iat: now, exp: now + 3600
    }));
    let sig;
    try {
        const key = await subtle.importKey('pkcs8', pemToBuffer(sa.private_key),
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
        sig = await subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(header + '.' + claim));
    } catch (e) { return { error: 'bad_key' }; }

    let res;
    try {
        res = await doFetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion='
                + header + '.' + claim + '.' + b64url(sig)
        });
    } catch (e) { return { error: 'network' }; }
    if (!res || !res.ok) return { error: 'auth_rejected' };
    let body;
    try { body = await res.json(); } catch (e) { return { error: 'auth_rejected' }; }
    if (!body || typeof body.access_token !== 'string') return { error: 'auth_rejected' };
    return { token: body.access_token };
}

// ---------------------------------------------------------------------------
// THE MESSAGE. Built from a decision push-notify.js already made, so this
// function reads `copy` and never composes a sentence.
//
// apns-collapse-id IS THE DEDUPE KEY. Two sends of the same logical event -
// a retry, a double write - replace each other on the phone instead of stacking,
// which is the belt to the sender's own braces.
export function fcmMessage(token, decided, extra) {
    const copy = decided && decided.copy;
    if (!token || !copy || !copy.body) return null;
    const data = {};
    Object.keys(extra || {}).forEach((k) => {
        // FCM data values must be strings. A number here is a 400 from Google.
        if (extra[k] !== null && extra[k] !== undefined) data[k] = String(extra[k]);
    });
    if (decided.dedupeKey) data.dedupeKey = String(decided.dedupeKey);
    if (decided.channel) data.channel = String(decided.channel);
    // ACTIONS TRAVEL AS DATA, NOT AS A CATEGORY WE INVENT. The app registers its
    // own category for accept/decline; sending an unknown one shows no buttons
    // and loses nothing.
    if (copy.actions && copy.actions.length) data.actions = copy.actions.join(',');
    return {
        message: {
            token: token,
            notification: { title: copy.title || '', body: copy.body },
            data: data,
            apns: {
                headers: Object.assign(
                    { 'apns-priority': '10' },
                    decided.dedupeKey ? { 'apns-collapse-id': String(decided.dedupeKey).slice(0, 64) } : {}
                ),
                payload: { aps: Object.assign({ sound: 'default' },
                    copy.actions && copy.actions.length ? { category: 'HARDPAN_OFFER' } : {}) }
            }
        }
    };
}

// ONE SEND, AND A DEAD TOKEN IS REPORTED AS DEAD. 404 UNREGISTERED and 400
// INVALID_ARGUMENT mean "stop sending here", so the caller drops the token
// instead of retrying it every round for ever.
export async function sendOne(sa, token, decided, extra, deps) {
    const d = deps || {};
    const doFetch = d.fetch || globalThis.fetch;
    const msg = fcmMessage(token, decided, extra);
    if (!msg) return { sent: false, reason: 'no_message' };
    const auth = d.accessToken || await accessToken(sa, d);
    if (auth.error) return { sent: false, reason: auth.error };
    let res;
    try {
        res = await doFetch('https://fcm.googleapis.com/v1/projects/' + sa.project_id + '/messages:send', {
            method: 'POST',
            headers: { authorization: 'Bearer ' + auth.token, 'content-type': 'application/json' },
            body: JSON.stringify(msg)
        });
    } catch (e) { return { sent: false, reason: 'network' }; }
    if (res && res.ok) return { sent: true, reason: 'ok' };
    const status = res ? res.status : 0;
    if (DEAD_TOKEN_CODES.indexOf(status) !== -1) return { sent: false, reason: 'dead_token', dead: true };
    return { sent: false, reason: 'upstream_error', status: status };
}

// The route's whole job, so POST /api/push-send stays as thin as
// /api/course-search is.
export async function handleSend(d) {
    const sa = readServiceAccount(d.env);
    if (!sa) return unavailable('not_configured');
    if (!d.decided || !d.decided.send) return unavailable('nothing_to_send');
    const tokens = (d.tokens || []).filter((t) => typeof t === 'string' && t);
    if (!tokens.length) return unavailable('no_device');

    // ONE AUTH FOR THE WHOLE FAN-OUT. A person with a phone and a watch is two
    // sends and must not be two token exchanges.
    const auth = await accessToken(sa, d);
    if (auth.error) return unavailable(auth.error);

    const results = [];
    for (let i = 0; i < tokens.length; i++) {
        results.push(Object.assign({ token: tokens[i].slice(0, 12) + '...' },
            await sendOne(sa, tokens[i], d.decided, d.extra, Object.assign({}, d, { accessToken: auth }))));
    }
    return {
        status: 'ok',
        sent: results.filter((r) => r.sent).length,
        dead: results.filter((r) => r.dead).map((r) => r.token),
        results: results
    };
}

export function toResponse(out, init) {
    return new Response(JSON.stringify(out), {
        status: (init && init.status) || (out.status === 'ok' ? 200 : 503),
        headers: Object.assign({
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store'
        }, (init && init.headers) || {})
    });
}
