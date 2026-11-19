// ============================================================================
// FULL-EVENT SIMULATION: THE LOCAL SITE. Serves this checkout's pages at http://127.0.0.1:<port>/ (a phone's
// fetch('/api/...') then reaches this server, as it reaches Pages in production) and answers the two functions the
// paper cards use with THEIR OWN CODE:
//   /api/card-turn-in   functions/api/_turnin.js handleTurnIn, an in-memory KV
//   /api/scorecard-scan functions/api/_scan.js handleScan, an in-memory KV
// What is stood in, and only this:
//   - Gemini (no key on this Mac): a scan request is answered with the paper card the group really kept (the truth
//     cards), in Gemini's own response shape, so the scanner's validator, allowance and limits all run for real;
//   - Google's token keys: the emulator phones carry 'emu:<uid>:<provider>' tokens; this server re-signs each one as a
//     real RS256 Firebase-shaped ID token with a key it made at start and serves that key as the JWKS, so
//     verifyIdToken runs unchanged;
//   - the database the functions read (ownerUid, cardTurnIn, eventDate, the field): the EMULATOR, read as admin (the
//     children read are public on the live rules).
// Nothing here can reach the internet: every other URL the functions ask for throws.
// ============================================================================
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');
const { webcrypto } = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.woff2': 'font/woff2' };
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function memKV() {
    const m = new Map();
    return {
        m,
        get: async (k) => (m.has(k) ? m.get(k).value : null),
        getWithMetadata: async (k) => (m.has(k) ? { value: m.get(k).value, metadata: m.get(k).metadata || null } : { value: null, metadata: null }),
        put: async (k, v, o) => { m.set(k, { value: String(v), metadata: (o && o.metadata) || null }); },
        delete: async (k) => { m.delete(k); },
        list: async (o) => ({ keys: [...m.keys()].filter((k) => !o || !o.prefix || k.indexOf(o.prefix) === 0).map((k) => ({ name: k, metadata: m.get(k).metadata || null })), list_complete: true })
    };
}

async function start(o) {
    const S = await import(pathToFileURL(path.join(ROOT, 'functions', 'api', '_scan.js')).href);
    const T = await import(pathToFileURL(path.join(ROOT, 'functions', 'api', '_turnin.js')).href);
    const pair = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    const jwk = Object.assign({ kid: 'sim-1', alg: 'RS256', use: 'sig' }, await webcrypto.subtle.exportKey('jwk', pair.publicKey));
    const resign = async (auth) => {
        const m = /^Bearer\s+emu:([^:]+):(.+)$/.exec(String(auth || ''));
        if (!m) return auth;
        const t = Math.floor(Date.now() / 1000);
        const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'sim-1', typ: 'JWT' }));
        const p = b64u(JSON.stringify({ iss: 'https://securetoken.google.com/golfapp-9fb21', aud: 'golfapp-9fb21', sub: m[1], iat: t - 30, exp: t + 3000, auth_time: t - 30, firebase: { sign_in_provider: m[2] } }));
        return 'Bearer ' + h + '.' + p + '.' + b64u(await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, Buffer.from(h + '.' + p)));
    };
    const log = [];
    const reply = (status, json) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => json });
    const kvScan = memKV(), kvTurn = memKV();
    const fnFetch = async (url, init) => {
        const u = String(url);
        if (u.startsWith('https://www.googleapis.com/service_accounts/v1/jwk/')) return reply(200, { keys: [jwk] });
        const db = /^https:\/\/golfapp-9fb21-default-rtdb\.firebaseio\.com\/(.+?)\.json/.exec(u);
        if (db) { const v = await o.emu.read(db[1] + (/[?&]shallow=true/.test(u) ? '' : '')); const shallow = /[?&]shallow=true/.test(u) && v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).map((k) => [k, true])) : v; return reply(200, shallow); }
        if (/generativelanguage\.googleapis\.com/.test(u)) {
            const body = JSON.parse(init.body);
            const prompt = body.contents[0].parts[0].text;
            const read = o.scanAnswer(prompt);
            log.push({ at: Date.now(), ev: 'gemini-stand-in', rows: read.players.length });
            return reply(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(read) }] } }], usageMetadata: {} });
        }
        throw new Error('sim server: refused off-machine fetch ' + u);
    };
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://x');
        const send = (status, body, type) => { res.writeHead(status, { 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(body); };
        try {
            if (url.pathname === '/api/card-turn-in' || url.pathname === '/api/scorecard-scan') {
                let raw = ''; for await (const c of req) raw += c;
                const auth = await resign(req.headers.authorization);
                const d = { env: { GEMINI_API_KEY: 'sim-stand-in' }, fetch: fnFetch, log: () => {}, authorization: auth };
                let out;
                if (url.pathname === '/api/card-turn-in') out = await T.handleTurnIn(Object.assign(d, { kv: kvTurn, method: req.method, query: Object.fromEntries(url.searchParams.entries()), body: raw ? JSON.parse(raw) : null }));
                else out = await S.handleScan(Object.assign(d, { kv: kvScan, body: raw ? JSON.parse(raw) : null }));
                log.push({ at: Date.now(), path: url.pathname, method: req.method, status: out.status, reason: out.reason || '', action: raw ? (JSON.parse(raw).action || '') : (url.search || '') });
                return send(url.pathname === '/api/card-turn-in' ? T.statusFor(out) : S.statusFor(out), JSON.stringify(out));
            }
            let p = decodeURIComponent(url.pathname);
            if (p === '/' || p === '') p = '/tournament.html';
            if (!path.extname(p)) p += '.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return send(404, 'not found', 'text/plain');
            send(200, fs.readFileSync(f), TYPES[path.extname(f)] || 'application/octet-stream');
        } catch (e) { log.push({ at: Date.now(), error: String(e && e.message) }); send(500, JSON.stringify({ status: 'error', message: String(e && e.message) })); }
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    return { base: 'http://127.0.0.1:' + server.address().port, close: () => server.close(), log, kvTurn, kvScan };
}

module.exports = { start };
