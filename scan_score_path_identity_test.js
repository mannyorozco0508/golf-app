// ============================================================================
// 088-3: THE SCORE SCAN IS BYTE-FOR-BYTE THE SAME AFTER COURSE MODE (080).
//
// The score path of POST /api/scorecard-scan is run twice with the same stubbed
// Gemini answers, the same KV and the same clock: once through main's _scan.js
// (9eab1533, taken from git into a temp folder) and once through this branch's.
// Every answer, every KV key and value, every log line and every byte sent to
// Gemini must match. No network: an unexpected URL fails the test.
// Skipped (not failed) only where git cannot show the base commit.
//
// RE-PINNED 2026-11-15 from 9eab1533 to dddb9565 (merged main) with Manny's
// per-file OK ("OK scan limit", 2026-11-15, the event-day scan allowance,
// SCAN-ALLOWANCE-PROPOSAL.md). What changed in the score path, on purpose: a
// body carrying event:{code} now reads tournaments/<code>/{ownerUid,eventDate,
// scoringModel,teams|players} as the caller and, for the event's owner on the
// event's UTC day or the day after, counts the scan under scan:event:<code>:<day>
// with the field size as the cap (floor PER_DAY, ceiling EVENT_DAY_MAX) instead
// of the account's scan:day:<uid>:<day> and 30. A body WITHOUT event is held
// byte-for-byte identical to dddb9565 below, and the last test pins that the
// event body is exactly where the two diverge - so the re-pin is not a blank
// cheque: a second divergence turns the no-event comparison red again.
// ============================================================================
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const { webcrypto } = require('crypto');
const { REPO_ROOT } = require('./helpers/load-script.js');

const BASE = 'dddb9565';   // was 9eab1533; re-pinned 2026-11-15, see the header
let OLD = null, NEW = null, skip = '';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-identity-'));
before(async () => {
    try {
        const show = (f) => execFileSync('git', ['show', BASE + ':' + f], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        fs.mkdirSync(path.join(tmp, 'functions', 'api'), { recursive: true });
        fs.writeFileSync(path.join(tmp, 'functions', 'api', '_scan.js'), show('functions/api/_scan.js'));
        fs.writeFileSync(path.join(tmp, 'scorecard-validate.js'), show('scorecard-validate.js'));
        fs.writeFileSync(path.join(tmp, 'course-card-validate.js'), show('course-card-validate.js'));   // dddb9565's _scan.js imports it (080 course mode)
        fs.writeFileSync(path.join(tmp, 'package.json'), fs.readFileSync(path.join(REPO_ROOT, 'package.json')));
    } catch (e) { skip = 'git cannot show ' + BASE; return; }
    OLD = await import(pathToFileURL(path.join(tmp, 'functions', 'api', '_scan.js')).href);
    NEW = await import(pathToFileURL(path.join(REPO_ROOT, 'functions', 'api', '_scan.js')).href);
});
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} });

const PROJECT = 'golfapp-9fb21';
const NOW = new Date('2026-10-26T18:00:00Z');
const clock = { date: () => new Date(NOW) };
const IMAGE = { mimeType: 'image/jpeg', data: Buffer.from('not really a jpeg').toString('base64') };
const PAR = [4, 4, 3, 5, 4, 4, 5, 3, 4, 4, 3, 5, 4, 3, 4, 5, 4, 4];
const ROUND = { holes: 18, par: PAR, course: 'Test Links', players: [{ name: 'Test Golfer A' }, { name: 'Test Golfer B' }] };

let KEYS = null;
before(async () => {
    const pair = await webcrypto.subtle.generateKey(
        { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        true, ['sign', 'verify']);
    const jwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
    KEYS = { pair, jwk: Object.assign({ kid: 'kid-1', alg: 'RS256', use: 'sig' }, jwk) };
});
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function idToken() {
    const t = Math.floor(NOW.getTime() / 1000);
    const header = b64u(JSON.stringify({ alg: 'RS256', kid: 'kid-1', typ: 'JWT' }));
    const payload = b64u(JSON.stringify({ iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, sub: 'test-uid-088',
        iat: t - 60, exp: t + 3000, auth_time: t - 60, firebase: { sign_in_provider: 'anonymous' } }));
    const sig = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', KEYS.pair.privateKey, Buffer.from(header + '.' + payload));
    return header + '.' + payload + '.' + b64u(sig);
}
function fakeKV(seed) {
    const m = new Map(Object.entries(seed || {}));
    return { m, get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, String(v)); } };
}
function cardJson(off2) {
    const row = (name, off) => {
        const holes = PAR.map((p, i) => ({ hole: i + 1, score: p + off, confidence: 0.99 }));
        const out = holes.slice(0, 9).reduce((s, c) => s + c.score, 0), inn = holes.slice(9).reduce((s, c) => s + c.score, 0);
        return { name, row_label_as_written: name, holes, written_out: out, written_in: inn, written_total: out + inn };
    };
    return JSON.stringify({ players: [row('Test Golfer A', 0), row('Test Golfer B', off2 || 1)], notes: '' });
}
const gem = (text) => ({ status: 200, json: { candidates: [{ content: { parts: [{ text }] } }],
    usageMetadata: { promptTokenCount: 1800, candidatesTokenCount: 900, thoughtsTokenCount: 0 } } });
function stubFetch(script) {
    const calls = [];
    const fn = async (url, init) => {
        const u = String(url);
        calls.push({ url: u, body: init && init.body, headers: init && init.headers });
        const reply = (r) => ({ ok: r.status >= 200 && r.status < 300, status: r.status, headers: { get: () => 'max-age=3600' }, json: async () => r.json });
        if (u.startsWith('https://www.googleapis.com/service_accounts/')) return reply({ status: 200, json: { keys: [KEYS.jwk] } });
        if (u.startsWith('https://golfapp-9fb21-default-rtdb.firebaseio.com/organizers/')) return reply({ status: 200, json: script.pass || null });
        // The event-day allowance's reads (this branch only; dddb9565 never makes them).
        const tr = /firebaseio\.com\/tournaments\/([^/]+)\/([A-Za-z]+)\.json\?/.exec(u);
        if (tr && script.tourney) {
            const v = script.tourney[tr[2]];
            const json = v === undefined ? null : (/shallow=true/.test(u) && v && typeof v === 'object'
                ? Object.fromEntries(Object.keys(v).map((k) => [k, true])) : v);
            return reply({ status: 200, json });
        }
        const g = /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/([^:]+):generateContent$/.exec(u);
        if (g) {
            const which = /pro/.test(decodeURIComponent(g[1])) ? 'pro' : 'flash';
            const next = (script[which] || []).shift();
            if (!next) assert.fail('unexpected ' + which + ' call');
            return reply(next);
        }
        assert.fail('unexpected network call to ' + u);
    };
    fn.calls = calls;
    return fn;
}
const ENV = { GEMINI_API_KEY: 'stub-key-for-tests', SCAN_MODEL: 'gemini-3.8-flash', SCAN_RETRY_MODEL: 'gemini-3.1-pro-preview' };

async function runBoth(name, scriptFn, opts) {
    const o = opts || {};
    const res = [];
    for (const S of [OLD, NEW]) {
        S.resetKeyCache();
        const fetch = stubFetch(scriptFn());
        const kv = fakeKV(o.seed);
        const logs = [];
        const out = await S.handleScan({ env: ENV, kv, fetch, clock, log: (l) => logs.push(l.replace(/"ms":\d+/g, '"ms":0')),
            body: o.body || { image: IMAGE, round: ROUND }, authorization: o.auth === undefined ? 'Bearer ' + await idToken() : o.auth });
        res.push({ out, kv: [...kv.m.entries()].sort(), logs, sent: fetch.calls.map((c) => [c.url, c.body || null]) });
    }
    assert.deepEqual(res[1].out, res[0].out, name + ': the answer');
    assert.deepEqual(res[1].kv, res[0].kv, name + ': the KV counters');
    assert.deepEqual(res[1].logs, res[0].logs, name + ': the log lines');
    assert.deepEqual(res[1].sent, res[0].sent, name + ': every byte sent');
    return res[1];
}

const t = (name, fn) => test(name, async (ctx) => { if (skip) { ctx.skip(skip); return; } await fn(); });

t('good score card: one Flash call, identical in every byte', async () => {
    const r = await runBoth('good', () => ({ flash: [gem(cardJson())] }));
    assert.equal(r.out.status, 'ok');
    assert.equal(r.sent.filter((s) => s[0].includes('generativelanguage')).length, 1);
});
t('a failed check -> the one Pro retry, identical', async () => {
    const r = await runBoth('retry', () => ({ flash: [gem('not json')], pro: [gem(cardJson())] }));
    assert.equal(r.out.retried, true);
});
t('out of free score scans, identical (and no Gemini call)', async () => {
    const r = await runBoth('needs_pass', () => ({}), { seed: { 'scan:free:test-uid-088': '3' } });
    assert.deepEqual(r.out, { status: 'refused', reason: 'needs_pass' });
});
t('used-up COURSE scans never block a score scan (score path ignores scan:course:)', async () => {
    const r = await runBoth('course counter', () => ({ flash: [gem(cardJson())] }), { seed: { 'scan:course:test-uid-088': '3' } });
    assert.equal(r.out.status, 'ok');
});
t('no sign-in / bad body, identical', async () => {
    await runBoth('no auth', () => ({}), { auth: '' });
    await runBoth('bad body', () => ({}), { body: { image: IMAGE, round: Object.assign({}, ROUND, { players: [] }) } });
    await runBoth('mode score', () => ({ flash: [gem(cardJson())] }), { body: { mode: 'score', image: IMAGE, round: ROUND } });
});
t('NEGATIVE CONTROL: a different answer is caught by the comparison', async () => {
    await assert.rejects(runBoth('neg', (() => { let n = 0; return () => ({ flash: [gem(cardJson(n++ ? 2 : 1))] }); })()));
});

// The one divergence the 2026-11-15 re-pin allows, pinned so it cannot widen
// unnoticed: event:{code} from the event's owner on event day. dddb9565 drops the
// key in readBody, reads nothing from tournaments/ and counts the account's day;
// this branch reads the event and counts the event's day. Both still answer ok.
t('WITH event:{code} the two diverge exactly as intended (dddb9565: ignored; this branch: the event allowance)', async () => {
    const PASS = { kind: 'season', expiresAt: NOW.getTime() + 86400000 };
    const tourney = { ownerUid: 'test-uid-088', eventDate: '2026-10-26', scoringModel: 'player-v1',
        players: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [('p' + (i + 1)), { name: 'x' }])) };
    const body = { image: IMAGE, round: ROUND, event: { code: 'STARK7' } };
    const res = [];
    for (const S of [OLD, NEW]) {
        S.resetKeyCache();
        const fetch = stubFetch({ pass: PASS, tourney, flash: [gem(cardJson())] });
        const kv = fakeKV();
        const out = await S.handleScan({ env: ENV, kv, fetch, clock, log: () => {}, body, authorization: 'Bearer ' + await idToken() });
        res.push({ out, keys: [...kv.m.keys()].sort(), reads: fetch.calls.filter((c) => c.url.includes('/tournaments/')).length });
    }
    assert.equal(res[0].out.status, 'ok'); assert.equal(res[1].out.status, 'ok');
    assert.equal(res[0].reads, 0, 'dddb9565 never reads the event');
    assert.equal(res[1].reads, 4, 'this branch reads ownerUid, eventDate, scoringModel and the players keys');
    assert.deepEqual(res[0].keys.filter((k) => /^scan:(day|event):/.test(k)), ['scan:day:test-uid-088:2026-10-26']);
    assert.deepEqual(res[1].keys.filter((k) => /^scan:(day|event):/.test(k)), ['scan:event:STARK7:2026-10-26']);
    // Everything that is not the day counter is still identical.
    assert.deepEqual(res[1].keys.filter((k) => !/^scan:(day|event):/.test(k)), res[0].keys.filter((k) => !/^scan:(day|event):/.test(k)));
    assert.deepEqual(res[1].out, res[0].out);
});
