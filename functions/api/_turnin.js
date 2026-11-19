// ============================================================================
// CARD TURN-IN (C, ADVISOR-20261118-1533, Manny's pick 2026-11-18): a group's
// paper card, photographed on a GOLFER's phone, waits here for the organizer.
//
// WHY A FUNCTION AND NOT THE EVENT RECORD. The live rules (HANDOFF, "The rule,
// published by hand") let a code-holder write ONE SCORE KEY at a time on an
// event and nothing else; every other child of tournaments/<code> is the
// owner's. A turn-in is not a score - nothing may reach the leaderboard until
// the organizer taps Approve - so the golfer's phone has nowhere on the record
// to put it. It goes to the scanner's own KV (SCAN_KV, the binding scorecard-
// scan already counts in), under turnin:<CODE>:<card>, with the sender, the
// time and the state as the key's METADATA and the scanner's read (and the
// photo) as the value. The organizer's Desk lists the keys (one list call,
// metadata only), fetches a read when it opens a card, and APPROVES by writing
// the scores itself, on tournament.html, through the same corrector the Desk
// scan uses - this file never writes a score anywhere.
//
// WHO MAY DO WHAT (the Firebase ID token in Authorization: Bearer, verified by
// _scan.js verifyIdToken; anonymous sessions verify too - a golfer on a
// scoring link is one):
//   send      anyone signed in, when tournaments/<code>/cardTurnIn is true
//             (the organizer's switch) and the event exists. 3 a minute.
//   status    anyone: the card's state, sender and times. Never the read, the
//             photo or the sender's uid.
//   list      the event's OWNER only (tournaments/<code>/ownerUid, read as the
//             caller, the way _scan.js eventAllowance does).
//   read      the owner: one card's scanner read.
//   photo     the owner: one card's JPEG.
//   approve   the owner: the state becomes approved (the scores are written by
//   decline   the page, not here); decline: declined. The golfer's card polls
//             status and says which.
//
// INERT: no KV binding answers not_configured and spends nothing. No Gemini
// key is needed - nothing here calls a model. KV is the Pages project's own:
// no rules, no service account. Values live 21 days (expirationTtl); the
// photo at most ~600 KB (the JPEG the page already shrinks for the scanner).
//
// ANSWERS   { status: 'ok', ... }  200
//           { status: 'refused', reason }  sign_in 401 | not_owner 403 |
//             turnin_off 403 | no_event 404 | bad_request 400 | too_big 413 |
//             rate_limited 429 | no_card 404
//           { status: 'unavailable', reason: 'network' | 'upstream_error' } 503
//           { status: 'not_configured' } 503
// ============================================================================
import { verifyIdToken, DEFAULT_PROJECT_ID, DEFAULT_DB_URL } from './_scan.js';

export const TTL_SECONDS = 21 * 24 * 3600;
export const SENDS_PER_MINUTE = 3;
export const MAX_SCAN_CHARS = 60000;      // the scanner's JSON for one card is ~6-10 KB
export const MAX_PHOTO_CHARS = 900000;    // base64 ~660 KB; the page sends at most about 600 KB
export const MAX_BY = 60;
export const CODE_RE = /^[A-Z0-9]{4,8}$/;
export const CARD_RE = /^(?:[A-Za-z0-9_-]{1,40}~)?(?:team[0-9]{1,3}|[A-Za-z0-9_-]{1,40})$/;   // tournament.html's sk: [<round>~]team<N> | <group id>

const STATUS_CODE = { sign_in: 401, not_owner: 403, turnin_off: 403, no_event: 404, no_card: 404, bad_request: 400, too_big: 413, rate_limited: 429 };
const refused = (reason) => ({ status: 'refused', reason });
const unavailable = (reason) => ({ status: 'unavailable', reason });

export const cardKey = (code, sk) => 'turnin:' + code + ':' + sk;
export const photoKey = (code, sk) => 'turninphoto:' + code + ':' + sk;
export const minuteKey = (uid, d) => 'turnin:min:' + uid + ':' + d.toISOString().slice(0, 16);

function wire(d) {
    const env = d.env || {};
    return {
        kv: d.kv || env.SCAN_KV || env.GOLFCOURSE_KV || null,
        doFetch: d.fetch || ((...a) => globalThis.fetch(...a)),
        now: d.clock && d.clock.date ? d.clock.date() : new Date(),
        subtle: d.subtle || (globalThis.crypto && globalThis.crypto.subtle),
        log: typeof d.log === 'function' ? d.log : (line) => { try { console.log(line); } catch (e) {} },
        projectId: env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID,
        dbUrl: String(env.FIREBASE_DB_URL || DEFAULT_DB_URL).replace(/\/+$/, '')
    };
}

// One child of the event, read AS the caller (public reads need no auth; the
// token rides along so a future narrowing of .read still works for the caller).
async function readChild(w, code, child, idToken) {
    let res;
    try {
        res = await w.doFetch(w.dbUrl + '/tournaments/' + encodeURIComponent(code) + '/' + child + '.json?auth=' + encodeURIComponent(idToken),
            { signal: AbortSignal.timeout(5000) });
    } catch (e) { return { fail: true }; }
    if (!res || !res.ok) return { fail: true };
    try { return { value: await res.json() }; } catch (e) { return { fail: true }; }
}

// The scanner's read, as the page received it (result.players[...]). Kept
// small and shaped: rows with a name and up to 18 hole cells of small ints.
export function cleanScan(scan) {
    if (!scan || typeof scan !== 'object' || !Array.isArray(scan.players)) return null;
    if (scan.players.length < 1 || scan.players.length > 8) return null;
    const int = (v) => (Number.isInteger(v) ? v : null);
    const players = [];
    for (const p of scan.players) {
        if (!p || typeof p !== 'object') return null;
        const row = { name: String(p.name === undefined || p.name === null ? '' : p.name).slice(0, 80), holes: [] };
        if (p.row_label_as_written !== undefined && p.row_label_as_written !== null) row.row_label_as_written = String(p.row_label_as_written).slice(0, 80);
        if (!Array.isArray(p.holes) || p.holes.length > 18) return null;
        for (const c of p.holes) {
            if (!c || typeof c !== 'object') return null;
            const hole = int(c.hole);
            if (hole === null || hole < 1 || hole > 18) return null;
            const cell = { hole };
            const score = int(c.score);
            if (score !== null && score >= 1 && score <= 30) cell.score = score;
            else if (c.score !== null && c.score !== undefined) return null;
            else cell.score = null;
            cell.confidence = typeof c.confidence === 'number' && isFinite(c.confidence) ? Math.max(0, Math.min(1, Math.round(c.confidence * 100) / 100)) : 0;
            row.holes.push(cell);
        }
        ['written_out', 'written_in', 'written_total'].forEach((k) => { const v = int(p[k]); row[k] = v !== null && v >= 0 && v <= 300 ? v : null; });
        players.push(row);
    }
    const out = { players };
    if (typeof scan.notes === 'string' && scan.notes) out.notes = scan.notes.slice(0, 300);
    return out;
}

export function readSend(body) {
    const b = body && typeof body === 'object' ? body : null;
    if (!b) return { error: 'bad_request' };
    const code = String(b.code || '').toUpperCase();
    if (!CODE_RE.test(code)) return { error: 'bad_request' };
    const sk = String(b.sk || '');
    if (!CARD_RE.test(sk)) return { error: 'bad_request' };
    if (b.scan && JSON.stringify(b.scan).length > MAX_SCAN_CHARS) return { error: 'too_big' };
    const scan = cleanScan(b.scan);
    if (!scan) return { error: 'bad_request' };
    const by = String(b.by === undefined || b.by === null ? '' : b.by).trim().slice(0, MAX_BY);
    let photo = null;
    if (b.photo !== undefined && b.photo !== null) {
        if (typeof b.photo !== 'string') return { error: 'bad_request' };
        photo = b.photo.replace(/^data:image\/jpeg;base64,/, '').replace(/\s+/g, '');
        if (photo.length > MAX_PHOTO_CHARS) return { error: 'too_big' };
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(photo) || !photo) return { error: 'bad_request' };
    }
    return { code, sk, scan, by, photo };
}

function metaOf(m) {
    const o = m && typeof m === 'object' ? m : {};
    return {
        by: typeof o.by === 'string' ? o.by : '',
        at: Number(o.at) || 0,
        state: o.state === 'approved' || o.state === 'declined' ? o.state : 'sent',
        decidedAt: Number(o.decidedAt) || 0,
        photo: o.photo === true
    };
}
// What a golfer may see of a card: no uid, no read, no photo.
const publicOf = (sk, m) => Object.assign({ sk }, metaOf(m));

async function caller(d, w) {
    const auth = String(d.authorization || '');
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (!m) return { error: 'sign_in' };
    const who = await verifyIdToken(m[1].trim(), w);
    if (who.error) return who;
    return { uid: who.uid, token: m[1].trim() };
}
async function ownerCheck(w, code, who) {
    const owner = await readChild(w, code, 'ownerUid', who.token);
    if (owner.fail) return 'network';
    if (owner.value === null || owner.value === undefined) return 'no_event';
    return owner.value === who.uid ? null : 'not_owner';
}

export async function handleTurnIn(d) {
    const w = wire(d);
    if (!w.kv || typeof w.kv.list !== 'function' || typeof w.kv.getWithMetadata !== 'function') return { status: 'not_configured' };
    const q = d.query && typeof d.query === 'object' ? d.query : {};
    const method = String(d.method || 'POST').toUpperCase();
    const who = await caller(d, w);
    if (who.error === 'network') return unavailable('network');
    if (who.error) return refused('sign_in');

    if (method === 'GET') {
        const code = String(q.code || '').toUpperCase();
        if (!CODE_RE.test(code)) return refused('bad_request');
        const sk = q.sk === undefined || q.sk === null || q.sk === '' ? null : String(q.sk);
        if (sk !== null && !CARD_RE.test(sk)) return refused('bad_request');
        // STATUS: anyone with the code and the card. The golfer's "Waiting for the organizer".
        if (sk && !q.read && !q.photo) {
            let got;
            try { got = await w.kv.getWithMetadata(cardKey(code, sk)); } catch (e) { return unavailable('upstream_error'); }
            if (!got || got.value === null || got.value === undefined) return refused('no_card');
            return { status: 'ok', card: publicOf(sk, got.metadata) };
        }
        // Everything below is the owner's.
        const own = await ownerCheck(w, code, who);
        if (own === 'network') return unavailable('network');
        if (own) return refused(own);
        if (sk && q.photo) {
            let p;
            try { p = await w.kv.get(photoKey(code, sk)); } catch (e) { return unavailable('upstream_error'); }
            if (p === null || p === undefined) return refused('no_card');
            return { status: 'ok', sk, photo: String(p) };
        }
        if (sk) {
            let got;
            try { got = await w.kv.getWithMetadata(cardKey(code, sk)); } catch (e) { return unavailable('upstream_error'); }
            if (!got || got.value === null || got.value === undefined) return refused('no_card');
            let scan = null;
            try { scan = JSON.parse(String(got.value)).scan || null; } catch (e) { scan = null; }
            return { status: 'ok', card: Object.assign(publicOf(sk, got.metadata), { scan }) };
        }
        // LIST: one list call, metadata only - no reads, no photos.
        let listed;
        try { listed = await w.kv.list({ prefix: cardKey(code, ''), limit: 500 }); } catch (e) { return unavailable('upstream_error'); }
        const prefix = cardKey(code, '');
        const cards = ((listed && listed.keys) || [])
            .map((k) => ({ name: String(k.name || ''), metadata: k.metadata }))
            .filter((k) => k.name.indexOf(prefix) === 0)
            .map((k) => publicOf(k.name.slice(prefix.length), k.metadata))
            .sort((a, b) => a.at - b.at);
        return { status: 'ok', cards };
    }

    if (method !== 'POST') return refused('bad_request');
    const body = d.body && typeof d.body === 'object' ? d.body : null;
    if (!body) return refused('bad_request');
    const action = String(body.action || 'send');

    if (action === 'send') {
        const s = readSend(body);
        if (s.error) return refused(s.error);
        // Rate: 3 sends a minute per account, counted before anything is stored.
        let n = 0;
        try { n = parseInt((await w.kv.get(minuteKey(who.uid, w.now))) || '0', 10) || 0; } catch (e) { n = 0; }
        if (n >= SENDS_PER_MINUTE) return refused('rate_limited');
        const owner = await readChild(w, s.code, 'ownerUid', who.token);
        if (owner.fail) return unavailable('network');
        if (owner.value === null || owner.value === undefined) return refused('no_event');
        const sw = await readChild(w, s.code, 'cardTurnIn', who.token);
        if (sw.fail) return unavailable('network');
        if (sw.value !== true) return refused('turnin_off');
        const at = w.now.getTime();
        const meta = { by: s.by, at, state: 'sent', decidedAt: 0, photo: !!s.photo };
        try {
            await w.kv.put(minuteKey(who.uid, w.now), String(n + 1), { expirationTtl: 120 });
            // A re-send replaces the card's earlier read and photo (the golfer scanned again).
            await w.kv.put(cardKey(s.code, s.sk), JSON.stringify({ uid: who.uid, scan: s.scan }), { expirationTtl: TTL_SECONDS, metadata: meta });
            if (s.photo) await w.kv.put(photoKey(s.code, s.sk), s.photo, { expirationTtl: TTL_SECONDS });
            else if (typeof w.kv.delete === 'function') await w.kv.delete(photoKey(s.code, s.sk));
        } catch (e) { return unavailable('upstream_error'); }
        // Counts and the card, never the account id (the scanner's log rule).
        w.log(JSON.stringify({ ev: 'card_turnin', outcome: 'sent', code: s.code, sk: s.sk, photo: !!s.photo, rows: s.scan.players.length }));
        return { status: 'ok', card: publicOf(s.sk, meta) };
    }

    if (action === 'approve' || action === 'decline') {
        const code = String(body.code || '').toUpperCase();
        if (!CODE_RE.test(code)) return refused('bad_request');
        const sk = String(body.sk || '');
        if (!CARD_RE.test(sk)) return refused('bad_request');
        const own = await ownerCheck(w, code, who);
        if (own === 'network') return unavailable('network');
        if (own) return refused(own);
        let got;
        try { got = await w.kv.getWithMetadata(cardKey(code, sk)); } catch (e) { return unavailable('upstream_error'); }
        if (!got || got.value === null || got.value === undefined) return refused('no_card');
        const meta = Object.assign(metaOf(got.metadata), { state: action === 'approve' ? 'approved' : 'declined', decidedAt: w.now.getTime() });
        try { await w.kv.put(cardKey(code, sk), String(got.value), { expirationTtl: TTL_SECONDS, metadata: meta }); } catch (e) { return unavailable('upstream_error'); }
        w.log(JSON.stringify({ ev: 'card_turnin', outcome: meta.state, code, sk }));
        return { status: 'ok', card: publicOf(sk, meta) };
    }
    return refused('bad_request');
}

export function statusFor(out) {
    if (out.status === 'ok') return 200;
    if (out.status === 'not_configured') return 503;
    return STATUS_CODE[out.reason] || 503;
}
export function toResponse(out, init) {
    return new Response(JSON.stringify(out), {
        status: statusFor(out),
        headers: Object.assign({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, (init && init.headers) || {})
    });
}
