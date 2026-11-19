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
//
// RE-PINNED AGAIN 2026-11-16 under Manny's "OK fix scanner" (ADVISOR-20261116-
// 1045-OK-fix-scanner): the configured Gemini 3 models now get a thinking cap
// ({ thinkingLevel: 'low' }; dddb9565 sent none for them, and the 3.8 Flash ran
// past the 25 s abort on every real card), and a call that hits its own abort
// answers 503 "timeout" instead of 504 "network" (Cloudflare serves its own page
// for a 504). The byte comparison below removes generationConfig.thinkingConfig
// from both sides and compares everything else as before; the two tests at the
// bottom pin those two divergences exactly, so a third one turns this red.
//
// RE-PINNED AGAIN 2026-11-16 23:5x under Manny's "OK merge scanner Desk (preview-scan-desk) + deploy" (item 4 of
// "OK build scanner event list 1-4 ... crossed-out rule"): one prompt sentence - a crossed-out digit is not the
// score - is removed from the prompt text before the byte comparison (sansStruck), and a test below pins that it
// is exactly one sentence, in one place, with the rest of the prompt identical. Any fourth divergence is red.
// (This file is not in the 106-file sweep list, which is how the branch's sweep missed it; measured on the merged
// tree before the push: 7 pass / 5 fail of 12 before this re-pin, 13 / 0 after it.)
//
// RE-PINNED A THIRD TIME 2026-11-16 under Manny's typed "OK scanner speed fix A
// (no Pro retry for sum mismatches; still retry low-confidence cells)". The
// change is in scorecard-validate.js, which this test takes from dddb9565 for
// the OLD side: a sum mismatch alone (the pen's arithmetic, every digit read
// with confidence) no longer earns the Pro retry; a mismatched nine that holds
// a doubted cell adds hard 'unsure_nine' and still does; the 4-cell threshold
// counts the model's own doubts (validation.unsureCount, a new field), not the
// amber a wrong written total paints. _scan.js itself did not change. So the
// comparison below removes validation.unsureCount from the NEW answer, and the
// three tests at the bottom pin the divergence exactly: a clean card and a
// doubted card stay identical in calls and counters; the pen's mismatch alone
// is two model calls on dddb9565 and one here, with the same sum_mismatch
// reported to the app on both. BASELINE against main 832204f0 (the validator before
// the fix): 10 pass / 2 fail of 12 (UNSURE COUNT and THE PEN'S MISMATCH ALONE red, as
// they describe the change); 12 / 0 on the branch.
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
        const reply = (r) => {
            if (r && r.throws) { const e = new Error('offline'); if (typeof r.throws === 'string') e.name = r.throws; throw e; }
            return { ok: r.status >= 200 && r.status < 300, status: r.status, headers: { get: () => 'max-age=3600' }, json: async () => r.json };
        };
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

// 2026-11-16: the thinking cap is the one allowed difference in a Gemini body (pinned below); the rest of the
// body, and every other request, still has to match byte for byte.
function sansThinking(url, body) {
    if (!body || !/generativelanguage/.test(url)) return body || null;
    const o = JSON.parse(body);
    if (o.generationConfig) delete o.generationConfig.thinkingConfig;
    return JSON.stringify(sansStruck(o));
}
// 2026-11-16 (the Desk scan, item 4 - Manny's typed OK "build scanner event list 1-4 ... crossed-out rule" and
// "OK merge scanner Desk"): ONE prompt sentence is the other allowed difference in a Gemini body (pinned below).
// It is removed from the prompt text before the byte comparison; any other change to the prompt is still red.
const STRUCK_RULE = '- A digit that is crossed out, scribbled over or struck through is NOT the score. The score is the digit written beside, above or over it. If you cannot tell which digit stands, return score null with low confidence.';
function sansStruck(o) {
    (o.contents || []).forEach((c) => (c.parts || []).forEach((p) => {
        if (typeof p.text === 'string') p.text = p.text.split('\n' + STRUCK_RULE).join('');
    }));
    return o;
}
// 2026-11-16 (speed fix A): validation.unsureCount is the one allowed difference in an answer (pinned below).
function sansUnsure(out) {
    if (!out || !out.validation || !('unsureCount' in out.validation)) return out;
    const o = JSON.parse(JSON.stringify(out)); delete o.validation.unsureCount; return o;
}
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
        res.push({ out: sansUnsure(out), kv: [...kv.m.entries()].sort(), logs, sent: fetch.calls.map((c) => [c.url, sansThinking(c.url, c.body)]) });
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
    // Re-pinned 2026-11-19 (SCAN A): players [] now reads the names off the card on the new code, so the bad body both
    // versions refuse is a player with an empty name.
    await runBoth('bad body', () => ({}), { body: { image: IMAGE, round: Object.assign({}, ROUND, { players: [{ name: '' }] }) } });
    await runBoth('mode score', () => ({ flash: [gem(cardJson())] }), { body: { mode: 'score', image: IMAGE, round: ROUND } });
});
t('NEGATIVE CONTROL: a different answer is caught by the comparison', async () => {
    await assert.rejects(runBoth('neg', (() => { let n = 0; return () => ({ flash: [gem(cardJson(n++ ? 2 : 1))] }); })()));
});

// The two divergences the 2026-11-16 re-pin allows ("OK fix scanner"), pinned exactly.
t('THE THINKING CAP: dddb9565 sent the configured 3.8 Flash / 3.1 Pro no thinkingConfig; this branch sends { thinkingLevel: "low" } on both calls, and nothing else in the body moves', async () => {
    const bodies = [];
    for (const S of [OLD, NEW]) {
        S.resetKeyCache();
        const fetch = stubFetch({ flash: [gem('not json')], pro: [gem(cardJson())] });
        await S.handleScan({ env: ENV, kv: fakeKV(), fetch, clock, log: () => {}, body: { image: IMAGE, round: ROUND }, authorization: 'Bearer ' + await idToken() });
        bodies.push(fetch.calls.filter((c) => /generativelanguage/.test(c.url)).map((c) => JSON.parse(c.body)));
    }
    assert.equal(bodies[0].length, 2); assert.equal(bodies[1].length, 2);
    bodies[0].forEach((b) => assert.equal(b.generationConfig.thinkingConfig, undefined, 'dddb9565: no cap for a 3.x model'));
    bodies[1].forEach((b) => assert.deepEqual(b.generationConfig.thinkingConfig, { thinkingLevel: 'low' }, 'this branch: a level'));
    bodies[1].forEach((b, i) => { const a = sansStruck(JSON.parse(JSON.stringify(b))); delete a.generationConfig.thinkingConfig; assert.deepEqual(a, bodies[0][i], 'the rest of the body (less the crossed-out sentence, pinned below) is identical'); });
});
t('THE CROSSED-OUT RULE: dddb9565\'s prompt has no struck-digit sentence; this branch\'s has exactly one, right after the Ignore-putts line, and the rest of the prompt is identical', async () => {
    const texts = [];
    for (const S of [OLD, NEW]) {
        S.resetKeyCache();
        const fetch = stubFetch({ flash: [gem(cardJson())] });
        await S.handleScan({ env: ENV, kv: fakeKV(), fetch, clock, log: () => {}, body: { image: IMAGE, round: ROUND }, authorization: 'Bearer ' + await idToken() });
        const b = JSON.parse(fetch.calls.filter((c) => /generativelanguage/.test(c.url))[0].body);
        texts.push(b.contents[0].parts.filter((p) => typeof p.text === 'string').map((p) => p.text).join('\n'));
    }
    assert.equal(texts[0].split(STRUCK_RULE).length - 1, 0, 'dddb9565: no such sentence');
    assert.equal(texts[1].split(STRUCK_RULE).length - 1, 1, 'this branch: exactly one');
    assert.match(texts[1], /anything that is not the stroke count\.\n- A digit that is crossed out/, 'placed right after the Ignore-putts line');
    assert.equal(texts[1].split('\n' + STRUCK_RULE).join(''), texts[0], 'the rest of the prompt is identical');
});
t('THE TIMEOUT ANSWER: a Flash call hitting its abort was 504 network on dddb9565 and is 503 timeout here; a plain network failure is still network on both', async () => {
    const outs = {};
    for (const [label, S] of [['old', OLD], ['new', NEW]]) {
        for (const kind of ['TimeoutError', true]) {
            S.resetKeyCache();
            const fetch = stubFetch({ flash: [{ throws: kind }] });
            const out = await S.handleScan({ env: ENV, kv: fakeKV(), fetch, clock, log: () => {}, body: { image: IMAGE, round: ROUND }, authorization: 'Bearer ' + await idToken() });
            outs[label + ':' + kind] = [out, S.statusFor(out)];
        }
    }
    assert.deepEqual(outs['old:TimeoutError'], [{ status: 'unavailable', reason: 'network' }, 504]);
    assert.deepEqual(outs['new:TimeoutError'], [{ status: 'unavailable', reason: 'timeout' }, 503]);
    assert.deepEqual(outs['old:true'], [{ status: 'unavailable', reason: 'network' }, 504]);
    assert.deepEqual(outs['new:true'], [{ status: 'unavailable', reason: 'network' }, 504]);
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
    assert.deepEqual(sansUnsure(res[1].out), res[0].out);
});

// The divergence the 2026-11-16 speed fix A re-pin allows (Manny's typed OK), pinned exactly.
function penCard(doubt) {
    const j = JSON.parse(cardJson());
    j.players[0].written_out += 1;                       // the pen added wrong on golfer A's front nine; every digit 0.99
    if (doubt) j.players[0].holes[2].confidence = 0.5;   // ...and the model doubted one digit in that nine
    return JSON.stringify(j);
}
async function both(script, label) {
    const res = [];
    for (const S of [OLD, NEW]) {
        S.resetKeyCache();
        const fetch = stubFetch(script());
        const kv = fakeKV();
        const out = await S.handleScan({ env: ENV, kv, fetch, clock, log: () => {}, body: { image: IMAGE, round: ROUND }, authorization: 'Bearer ' + await idToken() });
        res.push({ out, gemini: fetch.calls.filter((c) => /generativelanguage/.test(c.url)).length, keys: [...kv.m.entries()].sort() });
    }
    return res;
}
t('UNSURE COUNT: this branch answers validation.unsureCount (a number); dddb9565 did not; a clean card differs in nothing else', async () => {
    const [old, neu] = await both(() => ({ flash: [gem(cardJson())] }));
    assert.equal(old.out.validation.unsureCount, undefined);
    assert.equal(neu.out.validation.unsureCount, 0);
    assert.deepEqual(sansUnsure(neu.out), old.out);
});
t("THE PEN'S MISMATCH ALONE: dddb9565 spent the Pro call, this branch does not; both tell the app the nine does not add up", async () => {
    const [old, neu] = await both(() => ({ flash: [gem(penCard(false))], pro: [gem(penCard(false))] }));
    assert.equal(old.gemini, 2); assert.equal(old.out.retried, true);
    assert.equal(neu.gemini, 1); assert.equal(neu.out.retried, false);
    for (const r of [old, neu]) {
        assert.equal(r.out.status, 'ok');
        assert.ok(r.out.validation.hard.some((h) => h.code === 'sum_mismatch' && h.row === 0 && h.nine === 'out'), 'sum_mismatch reported');
        assert.equal(r.out.validation.rows[0].nines.front, 'mismatch');
        for (let h = 1; h <= 9; h++) assert.equal(r.out.validation.rows[0].cells[h].suspect, true, 'amber ' + h);
    }
    assert.ok(old.out.validation.hard.some((h) => h.code === 'too_many_suspect'), 'dddb9565 counted the amber nine toward the retry');
    assert.ok(!neu.out.validation.hard.some((h) => h.code === 'too_many_suspect'), 'this branch does not');
    assert.deepEqual(old.out.result, neu.out.result, 'the same read goes to the app');
    // The only counter that moves is the global month total: dddb9565 bumped it for the Pro call it made; this branch did not.
    const month = (r) => Number((r.keys.find((k) => /^scan:month:/.test(k[0])) || [0, 0])[1]);
    assert.equal(month(old), month(neu) + 1, 'one model call fewer in the month total');
    assert.deepEqual(neu.keys.filter((k) => !/^scan:month:/.test(k[0])), old.keys.filter((k) => !/^scan:month:/.test(k[0])), 'every other counter identical');
});
t('A DOUBTED DIGIT IN THE WRONG NINE: both sides still spend the one Pro call; this branch names it unsure_nine', async () => {
    const [old, neu] = await both(() => ({ flash: [gem(penCard(true))], pro: [gem(cardJson())] }));
    assert.equal(old.gemini, 2); assert.equal(neu.gemini, 2);
    assert.equal(old.out.retried, true); assert.equal(neu.out.retried, true);
    assert.equal(old.out.model, neu.out.model, 'the better Pro read is kept on both');
    assert.deepEqual(sansUnsure(neu.out), old.out, 'the kept Pro read is clean on both, so the answers match');
    assert.deepEqual(neu.keys, old.keys);
});
