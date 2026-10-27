// ============================================================================
// THE SCORECARD SCAN HANDLER - every rule behind POST /api/scorecard-scan
//
// URGENT-066 item 2 (handoff: grok/CLAUDE-HANDOFF-scorecard-scan-2026-10-24.md).
// The app sends one photo of a paper scorecard plus what the round already
// knows (holes, par, stroke index, player names). This reads the digits with
// Gemini 2.5 Flash under a strict JSON schema, validates the answer with the
// SAME function the app's confirm grid uses (../../scorecard-validate.js), and
// spends ONE retry on the Pro model only when that validation fails.
//
// Thin route, logic here - the same split as push-send.js / _push.js - so all
// of it is testable with a stubbed fetch and no key.
//
// ---------------------------------------------------------------------------
// SHIPPED INERT. With no GEMINI_API_KEY secret (or no KV binding to count free
// scans in) every request answers { status: 'not_configured' } BEFORE it reads
// the body, verifies anyone or spends anything. That is the state it deploys
// in until Manny adds the secret.
// ---------------------------------------------------------------------------
//
// THE ANSWERS (a caller can switch on `status`, then `reason`):
//   ok              { status:'ok', model, retried, result, validation, paid, freeScansLeft }
//   not_configured  503  no GEMINI_API_KEY, or no KV binding
//   refused         sign_in (401) | needs_pass (402) | rate_limited (429) |
//                   daily_limit (429) | monthly_cap (503)
//   unavailable     bad_request (400) | bad_image (400) | busy (503: Gemini 429) |
//                   upstream_error (502) | network (504)
//
// GATING (handoff section 9). A host with a live pass (organizers/<uid>/pass,
// the record organizer-gate.js and the RTDB rules already use) scans freely
// within the rate limits. Anyone else gets SCAN_FREE_LIMIT scans for their
// account, ONE constant, in scorecard-validate.js. A scan only counts against
// the free ones when it came back with a read - a network failure is not the
// golfer's fault.
//
// PRIVACY (handoff section 3). The photo is processed in memory and never
// stored or logged. The log line carries counts, latency, model, tokens and
// validation outcome only - no image bytes, no names, no account id.
// ============================================================================

import V from '../../scorecard-validate.js';
import C from '../../course-card-validate.js';   // 080 course mode

export const SCAN_FREE_LIMIT = V.SCAN_FREE_LIMIT;
export const COURSE_SCAN_FREE_LIMIT = C.COURSE_SCAN_FREE_LIMIT;   // its own, separate from the score scans
export const PER_MINUTE = 3;          // burst brake per account
export const PER_DAY = 30;            // per account per UTC day, paid or not
export const MONTHLY_CAP = 20000;     // global model calls a month; SCAN_MONTHLY_CAP overrides
export const MAX_IMAGE_CHARS = 3000000;   // base64 ~2.2 MB; the app sends 300-600 KB
export const DEFAULT_MODEL = 'gemini-2.5-flash';
export const DEFAULT_RETRY_MODEL = 'gemini-2.5-pro';
export const DEFAULT_PROJECT_ID = 'golfapp-9fb21';
export const DEFAULT_DB_URL = 'https://golfapp-9fb21-default-rtdb.firebaseio.com';
export const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

const STATUS_CODE = {
    not_configured: 503, sign_in: 401, needs_pass: 402, rate_limited: 429, daily_limit: 429,
    monthly_cap: 503, bad_request: 400, bad_image: 400, busy: 503, upstream_error: 502, network: 504
};
const notConfigured = () => ({ status: 'not_configured' });
const refused = (reason) => ({ status: 'refused', reason });
const unavailable = (reason) => ({ status: 'unavailable', reason });

// A clean positive integer or the default - the same rule as dailyCeiling in
// _lib.js: a typo in a dashboard field must not make the cap infinite or zero.
export function monthlyCap(env) {
    const raw = env && env.SCAN_MONTHLY_CAP;
    if (raw === null || raw === undefined) return MONTHLY_CAP;
    const t = String(raw).trim();
    if (!/^[0-9]+$/.test(t)) return MONTHLY_CAP;
    const n = parseInt(t, 10);
    return n > 0 ? n : MONTHLY_CAP;
}

function wire(d) {
    const env = d.env || {};
    return {
        env,
        key: typeof env.GEMINI_API_KEY === 'string' && env.GEMINI_API_KEY.trim() ? env.GEMINI_API_KEY.trim() : null,
        // Its own namespace if bound; otherwise the course proxy's, which already
        // exists in production. Keys are prefixed scan: so they never collide.
        kv: d.kv || env.SCAN_KV || env.GOLFCOURSE_KV || null,
        doFetch: d.fetch || ((...a) => globalThis.fetch(...a)),   // never store fetch bare: Workers throw "Illegal invocation" when it is called as w.doFetch()
        now: d.clock && d.clock.date ? d.clock.date() : new Date(),
        subtle: d.subtle || (globalThis.crypto && globalThis.crypto.subtle),
        log: typeof d.log === 'function' ? d.log : (line) => { try { console.log(line); } catch (e) {} },
        model: env.SCAN_MODEL || DEFAULT_MODEL,
        retryModel: env.SCAN_RETRY_MODEL || DEFAULT_RETRY_MODEL,
        projectId: env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID,
        dbUrl: String(env.FIREBASE_DB_URL || DEFAULT_DB_URL).replace(/\/+$/, ''),
        cap: monthlyCap(env)
    };
}

// ---------------------------------------------------------------------------
// THE REQUEST BODY. Refused for free, before anyone is verified.
// ---------------------------------------------------------------------------
export function readBody(body) {
    const b = body && typeof body === 'object' ? body : null;
    if (!b) return { error: 'bad_request' };
    const img = b.image && typeof b.image === 'object' ? b.image : null;
    if (!img || typeof img.data !== 'string') return { error: 'bad_image' };
    let data = img.data.replace(/^data:[^;,]+;base64,/, '').replace(/\s+/g, '');
    const mime = String(img.mimeType || 'image/jpeg').toLowerCase();
    if (IMAGE_TYPES.indexOf(mime) === -1) return { error: 'bad_image' };
    if (!data || data.length > MAX_IMAGE_CHARS || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return { error: 'bad_image' };
    const r = b.round && typeof b.round === 'object' ? b.round : null;
    if (!r || (r.holes !== 9 && r.holes !== 18)) return { error: 'bad_request' };
    if (!Array.isArray(r.players) || r.players.length < 1 || r.players.length > 8) return { error: 'bad_request' };
    if (!r.players.every((p) => p && typeof p.name === 'string' && p.name.trim() && p.name.length <= 60)) return { error: 'bad_request' };
    if (!Array.isArray(r.par) && !(r.par && typeof r.par === 'object')) return { error: 'bad_request' };
    // Only the fields the prompt and the validator read go any further - an
    // app that sends more cannot leak more to the model.
    const round = {
        holes: r.holes,
        startHole: r.startHole === 10 ? 10 : 1,
        expectedHoles: Array.isArray(r.expectedHoles) ? r.expectedHoles.filter(Number.isInteger) : undefined,
        par: r.par,
        strokeIndex: r.strokeIndex,
        course: typeof r.course === 'string' ? r.course.slice(0, 120) : '',
        tee: typeof r.tee === 'string' ? r.tee.slice(0, 40) : '',
        players: r.players.map((p) => ({
            name: p.name.trim(),
            initials: typeof p.initials === 'string' ? p.initials.slice(0, 6) : undefined,
            nicknames: Array.isArray(p.nicknames) ? p.nicknames.filter((x) => typeof x === 'string').slice(0, 4) : undefined,
            handicap: Number.isInteger(p.handicap) ? p.handicap : undefined
        }))
    };
    return { image: { mimeType: mime, data }, round };
}

// ---------------------------------------------------------------------------
// WHO IS ASKING. A Firebase Auth ID token in Authorization: Bearer, verified
// here against Google's securetoken keys (RS256; aud = project, iss =
// securetoken.google.com/<project>). Anonymous accounts verify too - they are
// how HardPan works without sign-in - and get the same free scans.
// ---------------------------------------------------------------------------
let jwksCache = null;   // { keys, until }
export function resetKeyCache() { jwksCache = null; }

function b64urlBytes(s) {
    const t = String(s).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(t + '==='.slice((t.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}
function b64urlJson(s) { return JSON.parse(new TextDecoder().decode(b64urlBytes(s))); }

async function signingKeys(doFetch, nowMs) {
    if (jwksCache && jwksCache.until > nowMs) return jwksCache.keys;
    let res;
    try { res = await doFetch(JWKS_URL, { signal: AbortSignal.timeout(5000) }); } catch (e) { return null; }
    if (!res || !res.ok) return null;
    let body;
    try { body = await res.json(); } catch (e) { return null; }
    if (!body || !Array.isArray(body.keys)) return null;
    let maxAge = 3600;
    try {
        const cc = res.headers && typeof res.headers.get === 'function' ? res.headers.get('cache-control') : '';
        const m = /max-age=(\d+)/.exec(cc || '');
        if (m) maxAge = Math.min(parseInt(m[1], 10), 6 * 3600);
    } catch (e) {}
    jwksCache = { keys: body.keys, until: nowMs + maxAge * 1000 };
    return body.keys;
}

export async function verifyIdToken(token, w) {
    if (typeof token !== 'string' || token.split('.').length !== 3) return { error: 'sign_in' };
    const [h, p, s] = token.split('.');
    let header, claims;
    try { header = b64urlJson(h); claims = b64urlJson(p); } catch (e) { return { error: 'sign_in' }; }
    if (!header || header.alg !== 'RS256' || !header.kid) return { error: 'sign_in' };
    const now = Math.floor(w.now.getTime() / 1000);
    if (!claims || claims.aud !== w.projectId || claims.iss !== 'https://securetoken.google.com/' + w.projectId) return { error: 'sign_in' };
    if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128) return { error: 'sign_in' };
    if (!(claims.exp > now) || !(claims.iat <= now + 300)) return { error: 'sign_in' };
    if (claims.auth_time !== undefined && !(claims.auth_time <= now + 300)) return { error: 'sign_in' };
    if (!w.subtle) return { error: 'sign_in' };
    const keys = await signingKeys(w.doFetch, w.now.getTime());
    if (!keys) return { error: 'network' };
    const jwk = keys.find((k) => k && k.kid === header.kid);
    if (!jwk) return { error: 'sign_in' };
    try {
        const key = await w.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
        const ok = await w.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(s), new TextEncoder().encode(h + '.' + p));
        if (!ok) return { error: 'sign_in' };
    } catch (e) { return { error: 'sign_in' }; }
    const fb = claims.firebase || {};
    return { uid: claims.sub, anonymous: fb.sign_in_provider === 'anonymous' };
}

// ---------------------------------------------------------------------------
// IS THIS A PAID HOST? organizers/<uid>/pass is readable by its owner only, so
// the Worker reads it AS the caller, with the caller's own ID token - no
// service account, no new rule, no write. Any failure to read is "not paid",
// which falls back to the free scans rather than to unlimited.
// ---------------------------------------------------------------------------
export async function hasLivePass(w, uid, idToken) {
    let res;
    try {
        res = await w.doFetch(w.dbUrl + '/organizers/' + encodeURIComponent(uid) + '/pass.json?auth=' + encodeURIComponent(idToken),
            { signal: AbortSignal.timeout(5000) });
    } catch (e) { return false; }
    if (!res || !res.ok) return false;
    let pass;
    try { pass = await res.json(); } catch (e) { return false; }
    return !!(pass && typeof pass.expiresAt === 'number' && pass.expiresAt > w.now.getTime());
}

// ---------------------------------------------------------------------------
// COUNTERS (KV). Incremented BEFORE the model call, like the course proxy's -
// a call that dies in flight was still billed. KV is eventually consistent, so
// two scans in the same second can both slip under a limit; the monthly cap
// is the backstop that makes that harmless.
// ---------------------------------------------------------------------------
const readCount = async (kv, key) => parseInt((await kv.get(key)) || '0', 10) || 0;
async function bump(kv, key, ttl) {
    const n = (await readCount(kv, key)) + 1;
    await kv.put(key, String(n), ttl ? { expirationTtl: ttl } : undefined);
    return n;
}
export const freeKey = (uid) => 'scan:free:' + uid;
export const courseFreeKey = (uid) => 'scan:course:' + uid;   // 080: never touches scan:free:
export const minuteKey = (uid, d) => 'scan:min:' + uid + ':' + d.toISOString().slice(0, 16);
export const dayKey = (uid, d) => 'scan:day:' + uid + ':' + d.toISOString().slice(0, 10);
export const monthKey = (d) => 'scan:month:' + d.toISOString().slice(0, 7);

// ---------------------------------------------------------------------------
// ONE GEMINI CALL. Strict JSON via responseMimeType + responseSchema,
// temperature 0. Thinking is capped: off on 2.5 Flash, the minimum-ish on 2.5
// Pro (which cannot turn it off). Other model families get no thinkingConfig.
// ---------------------------------------------------------------------------
export function geminiRequest(model, image, round) {
    const generationConfig = {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: V.responseSchema()
    };
    if (/^gemini-2\.5-flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
    else if (/^gemini-2\.5-pro/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 512 };
    return {
        contents: [{ role: 'user', parts: [
            { text: V.buildPrompt(round) },
            { inline_data: { mime_type: image.mimeType, data: image.data } }
        ] }],
        generationConfig
    };
}

// `spec` (080 course mode) swaps the request and the parser; without it this
// is exactly the score call.
export async function callGemini(w, model, image, round, spec) {
    let res;
    try {
        res = await w.doFetch(GEMINI_BASE + encodeURIComponent(model) + ':generateContent', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': w.key },
            body: JSON.stringify(spec ? spec.request(model, image, round) : geminiRequest(model, image, round)),
            signal: AbortSignal.timeout(/pro/.test(model) ? 45000 : 25000)
        });
    } catch (e) { return { error: 'network' }; }
    if (!res) return { error: 'upstream_error' };
    if (res.status === 429) return { error: 'busy' };
    if (!res.ok) {
        // Why Google refused, as codes only (Manny OK'd this logging Oct 25): the HTTP status,
        // Google's error.status word and its ErrorInfo reason enums (e.g. API_KEY_INVALID,
        // SERVICE_DISABLED, API_KEY_HTTP_REFERRER_BLOCKED). Never the message text, body or key.
        const upstream = { http: res.status };
        try {
            const eb = await res.json();
            const e = eb && eb.error;
            if (e && typeof e.status === 'string') upstream.status = e.status.slice(0, 40);
            const reasons = (e && Array.isArray(e.details) ? e.details : [])
                .map((d) => d && typeof d.reason === 'string' ? d.reason.slice(0, 60) : null)
                .filter((r) => r && /^[A-Z0-9_]+$/.test(r));
            if (reasons.length) upstream.reasons = reasons.slice(0, 3);
        } catch (e) { /* no JSON body: the HTTP status is enough */ }
        return { error: 'upstream_error', upstream };
    }
    let body;
    try { body = await res.json(); } catch (e) { return { error: 'upstream_error' }; }
    const u = (body && body.usageMetadata) || {};
    const tokens = {
        input: u.promptTokenCount || 0,
        output: u.candidatesTokenCount || 0,
        thinking: u.thoughtsTokenCount || 0
    };
    const parts = body && body.candidates && body.candidates[0] && body.candidates[0].content
        && Array.isArray(body.candidates[0].content.parts) ? body.candidates[0].content.parts : [];
    const text = parts.map((x) => (x && typeof x.text === 'string' ? x.text : '')).join('');
    // A blocked or empty answer is still an ANSWER - it parses to an error and
    // validates as a failure, which is what earns the one retry.
    return { parsed: spec ? spec.parse(text) : V.parseModelOutput(text), tokens };
}

// ---------------------------------------------------------------------------
export async function handleScan(d) {
    const w = wire(d);
    // INERT FIRST: nothing read, verified or spent.
    if (!w.key || !w.kv) return notConfigured();
    // 080: { mode: 'course' } is the course-card scan. Anything else is the
    // score scan below, unchanged.
    if (d.body && typeof d.body === 'object' && d.body.mode === 'course') return handleCourseScan(w, d);

    const body = readBody(d.body);
    if (body.error) return unavailable(body.error);

    const auth = String(d.authorization || '');
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (!m) return refused('sign_in');
    const who = await verifyIdToken(m[1].trim(), w);
    if (who.error === 'network') return unavailable('network');
    if (who.error) return refused('sign_in');

    const paid = await hasLivePass(w, who.uid, m[1].trim());
    let freeUsed = 0;
    if (!paid) {
        freeUsed = await readCount(w.kv, freeKey(who.uid));
        if (freeUsed >= SCAN_FREE_LIMIT) return refused('needs_pass');
    }

    if (await readCount(w.kv, minuteKey(who.uid, w.now)) >= PER_MINUTE) return refused('rate_limited');
    if (await readCount(w.kv, dayKey(who.uid, w.now)) >= PER_DAY) return refused('daily_limit');
    const mk = monthKey(w.now);
    if (await readCount(w.kv, mk) >= w.cap) return refused('monthly_cap');
    await bump(w.kv, minuteKey(who.uid, w.now), 120);
    await bump(w.kv, dayKey(who.uid, w.now), 2 * 24 * 3600);
    await bump(w.kv, mk, 40 * 24 * 3600);

    const started = Date.now();
    const first = await callGemini(w, w.model, body.image, body.round);
    if (first.error) {
        w.log(JSON.stringify({ ev: 'scorecard_scan', outcome: first.error, model: w.model, ms: Date.now() - started, upstream: first.upstream }));
        return unavailable(first.error);
    }
    let pick = { model: w.model, parsed: first.parsed, validation: V.validateScan(first.parsed, body.round) };
    const tokens = [Object.assign({ model: w.model }, first.tokens)];
    let retried = false;

    // ONE retry, on Pro, only for a hard validation failure, and only if the
    // monthly cap still has room for it. Never a second.
    if (V.needsRetry(pick.validation) && await readCount(w.kv, mk) < w.cap) {
        retried = true;
        await bump(w.kv, mk, 40 * 24 * 3600);
        const second = await callGemini(w, w.retryModel, body.image, body.round);
        if (!second.error) {
            tokens.push(Object.assign({ model: w.retryModel }, second.tokens));
            const v2 = V.validateScan(second.parsed, body.round);
            if (V.betterOf(pick.validation, v2) === 'second') pick = { model: w.retryModel, parsed: second.parsed, validation: v2 };
        }
    }

    // A read that did not even parse has nothing to show on the confirm grid.
    if (!pick.parsed.ok) {
        w.log(JSON.stringify({ ev: 'scorecard_scan', outcome: 'unreadable', retried, ms: Date.now() - started, tokens }));
        return unavailable('upstream_error');
    }

    let freeScansLeft = null;
    if (!paid) {
        const used = await bump(w.kv, freeKey(who.uid));   // no TTL: free scans are per account, for good
        freeScansLeft = Math.max(0, SCAN_FREE_LIMIT - used);
    }
    w.log(JSON.stringify({
        ev: 'scorecard_scan', outcome: 'ok', model: pick.model, retried, paid,
        ms: Date.now() - started, tokens,
        hard: pick.validation.hard.map((x) => x.code), suspect: pick.validation.suspectCount,
        players: pick.validation.rows.length
    }));
    return {
        status: 'ok',
        model: pick.model,
        retried,
        paid,
        freeScansLeft,
        result: pick.parsed.value,
        validation: pick.validation
    };
}

// ============================================================================
// 080 COURSE MODE: a photo of a blank printed card -> par, men's + ladies'
// HCP rows, tee names + per-hole yardages (never rating / slope). Same auth,
// rate limits and monthly cap as the score scan; its OWN free allowance
// (scan:course:<uid>, COURSE_SCAN_FREE_LIMIT). The body is an allow-list:
// the image, an optional course name and the hole count - no location.
// ============================================================================
export function readCourseBody(body) {
    const b = body && typeof body === 'object' ? body : null;
    if (!b) return { error: 'bad_request' };
    const img = b.image && typeof b.image === 'object' ? b.image : null;
    if (!img || typeof img.data !== 'string') return { error: 'bad_image' };
    const data = img.data.replace(/^data:[^;,]+;base64,/, '').replace(/\s+/g, '');
    const mime = String(img.mimeType || 'image/jpeg').toLowerCase();
    if (IMAGE_TYPES.indexOf(mime) === -1) return { error: 'bad_image' };
    if (!data || data.length > MAX_IMAGE_CHARS || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return { error: 'bad_image' };
    const c = b.course && typeof b.course === 'object' ? b.course : {};
    const holes = c.holes === undefined ? 18 : c.holes;
    if (holes !== 9 && holes !== 18) return { error: 'bad_request' };
    return { image: { mimeType: mime, data }, course: { holes, name: typeof c.name === 'string' ? c.name.trim().slice(0, 120) : '' } };
}

export function courseGeminiRequest(model, image, course) {
    const generationConfig = { temperature: 0, responseMimeType: 'application/json', responseSchema: C.responseSchema() };
    if (/^gemini-2\.5-flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
    else if (/^gemini-2\.5-pro/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 512 };
    return {
        contents: [{ role: 'user', parts: [
            { text: C.buildCoursePrompt(course) },
            { inline_data: { mime_type: image.mimeType, data: image.data } }
        ] }],
        generationConfig
    };
}
export const COURSE_SPEC = { request: courseGeminiRequest, parse: (t) => C.parseCourseOutput(t) };

async function handleCourseScan(w, d) {
    const body = readCourseBody(d.body);
    if (body.error) return unavailable(body.error);

    const auth = String(d.authorization || '');
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (!m) return refused('sign_in');
    const who = await verifyIdToken(m[1].trim(), w);
    if (who.error === 'network') return unavailable('network');
    if (who.error) return refused('sign_in');

    const paid = await hasLivePass(w, who.uid, m[1].trim());
    if (!paid && await readCount(w.kv, courseFreeKey(who.uid)) >= COURSE_SCAN_FREE_LIMIT) return refused('needs_pass');

    if (await readCount(w.kv, minuteKey(who.uid, w.now)) >= PER_MINUTE) return refused('rate_limited');
    if (await readCount(w.kv, dayKey(who.uid, w.now)) >= PER_DAY) return refused('daily_limit');
    const mk = monthKey(w.now);
    if (await readCount(w.kv, mk) >= w.cap) return refused('monthly_cap');
    await bump(w.kv, minuteKey(who.uid, w.now), 120);
    await bump(w.kv, dayKey(who.uid, w.now), 2 * 24 * 3600);
    await bump(w.kv, mk, 40 * 24 * 3600);

    const started = Date.now();
    const first = await callGemini(w, w.model, body.image, body.course, COURSE_SPEC);
    if (first.error) {
        w.log(JSON.stringify({ ev: 'course_scan', outcome: first.error, model: w.model, ms: Date.now() - started, upstream: first.upstream }));
        return unavailable(first.error);
    }
    let pick = { model: w.model, parsed: first.parsed, validation: C.validateCourse(first.parsed, body.course) };
    const tokens = [Object.assign({ model: w.model }, first.tokens)];
    let retried = false;

    // ONE Pro retry, only when a check failed and the cap has room. Never a second.
    if (C.needsRetry(pick.validation) && await readCount(w.kv, mk) < w.cap) {
        retried = true;
        await bump(w.kv, mk, 40 * 24 * 3600);
        const second = await callGemini(w, w.retryModel, body.image, body.course, COURSE_SPEC);
        if (!second.error) {
            tokens.push(Object.assign({ model: w.retryModel }, second.tokens));
            const v2 = C.validateCourse(second.parsed, body.course);
            if (C.betterOf(pick.validation, v2) === 'second') pick = { model: w.retryModel, parsed: second.parsed, validation: v2 };
        }
    }

    if (!pick.parsed.ok) {
        w.log(JSON.stringify({ ev: 'course_scan', outcome: 'unreadable', retried, ms: Date.now() - started, tokens }));
        return unavailable('upstream_error');
    }

    let courseScansLeft = null;
    if (!paid) {
        const used = await bump(w.kv, courseFreeKey(who.uid));   // no TTL, like the score scans
        courseScansLeft = Math.max(0, COURSE_SCAN_FREE_LIMIT - used);
    }
    w.log(JSON.stringify({
        ev: 'course_scan', outcome: 'ok', model: pick.model, retried, paid,
        ms: Date.now() - started, tokens,
        hard: pick.validation.hard.map((x) => x.code), soft: pick.validation.suspectCount,
        tees: pick.parsed.value.tees.length
    }));
    return {
        status: 'ok',
        mode: 'course',
        model: pick.model,
        retried,
        paid,
        courseScansLeft,
        result: pick.parsed.value,
        validation: pick.validation
    };
}

export function statusFor(out) {
    if (out.status === 'ok') return 200;
    if (out.status === 'not_configured') return 503;
    return STATUS_CODE[out.reason] || 503;
}

export function toResponse(out, init) {
    return new Response(JSON.stringify(out), {
        status: statusFor(out),
        headers: Object.assign({
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store'
        }, (init && init.headers) || {})
    });
}
