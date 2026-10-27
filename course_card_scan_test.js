// ============================================================================
// 080 COURSE MODE of POST /api/scorecard-scan, with a STUBBED Gemini.
// No test here makes a network call: every fetch goes to the scripted stub,
// and an unexpected URL fails the test.
//
// Held: the course validator (good card passes; each mutation fails - the
// negative controls), the prompt never asks for rating/slope, the body
// allow-list, the ONE Pro retry only on a failed check (good / bad / retry),
// the course scans' own free counter (never scan:free:), and that a body
// without mode:'course' still takes the score path.
// ============================================================================
const { test, describe, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const { webcrypto } = require('crypto');
const { REPO_ROOT } = require('./helpers/load-script.js');

const C = require(path.join(REPO_ROOT, 'course-card-validate.js'));
let S = null;
before(async () => { S = await import(pathToFileURL(path.join(REPO_ROOT, 'functions', 'api', '_scan.js')).href); });

const PROJECT = 'golfapp-9fb21';
const NOW = new Date('2026-10-26T18:00:00Z');
const clock = { date: () => new Date(NOW) };
const IMAGE = { mimeType: 'image/jpeg', data: Buffer.from('not really a jpeg').toString('base64') };

// A made-up but consistent card (Test Links).
const sum = (a) => a.reduce((s, x) => s + x, 0);
const PAR = [4, 4, 3, 5, 4, 4, 5, 3, 4, 4, 3, 5, 4, 3, 4, 5, 4, 4];
const MEN = [17, 7, 11, 9, 1, 3, 13, 15, 5, 2, 14, 8, 10, 12, 18, 16, 4, 6];
const LADIES = [9, 5, 15, 1, 11, 7, 3, 17, 13, 6, 18, 2, 10, 12, 14, 8, 16, 4];
const tee = (name, yards) => ({ name, yards, written: { out: sum(yards.slice(0, 9)), in: sum(yards.slice(9)), total: sum(yards) } });
const BLUE = [325, 343, 166, 533, 417, 411, 522, 172, 395, 412, 173, 541, 353, 143, 320, 507, 374, 391];
const WHITE = [307, 301, 146, 469, 351, 378, 494, 150, 339, 372, 154, 509, 329, 114, 290, 432, 346, 377];
function card(mut) {
    const c = {
        course_name: 'Test Links', holes: 18,
        par: PAR.slice(), par_written: { out: 36, in: 36, total: 72 },
        hcp_men: MEN.slice(), hcp_ladies: LADIES.slice(),
        tees: [tee('Blue', BLUE.slice()), tee('White', WHITE.slice())],
        unsure: [], notes: ''
    };
    if (mut) mut(c);
    return c;
}
const check = (c, ctx) => C.validateCourse(C.parseCourseOutput(JSON.stringify(c)), ctx || { holes: 18 });
const codes = (v) => v.hard.map((h) => h.code);

describe('course-card-validate: good card passes, every mutation fails (negative controls)', () => {
    test('the good card passes with no hard or soft flags, ladies saved', () => {
        const v = check(card());
        assert.deepEqual(v.hard, []);
        assert.equal(v.ok, true);
        assert.equal(v.saveLadies, true);
        assert.equal(v.parTotal, 72);
        assert.equal(C.needsRetry(v), false);
    });
    const cases = [
        ['par 7', (c) => { c.par[6] = 7; c.par_written = { out: null, in: null, total: null }; }, 'par_range'],
        ['par 2', (c) => { c.par[2] = 2; c.par_written = { out: null, in: null, total: null }; }, 'par_range'],
        ['par null', (c) => { c.par[0] = null; }, 'par_range'],
        ['total par 76', (c) => { c.par = [5, 5, 4, 5, 4, 4, 5, 3, 4, 4, 3, 5, 4, 3, 4, 5, 4, 5]; c.par_written = { out: null, in: null, total: null }; }, 'par_total'],
        ['printed par OUT disagrees', (c) => { c.par_written.out = 35; }, 'par_written'],
        ['men HCP duplicate', (c) => { c.hcp_men[1] = 17; }, 'hcp_men'],
        ['men HCP 19', (c) => { c.hcp_men[0] = 19; }, 'hcp_men'],
        ['men HCP missing', (c) => { c.hcp_men = []; }, 'hcp_men'],
        ['ladies HCP duplicate', (c) => { c.hcp_ladies[0] = 5; }, 'hcp_ladies'],
        ['tee yard misread', (c) => { c.tees[0].yards[3] = 583; }, 'tee_written'],
        ['tee row too short', (c) => { c.tees[1].yards.pop(); }, 'hole_count'],
        ['no tees at all', (c) => { c.tees = []; }, 'hole_count']
    ];
    for (const [name, mut, code] of cases) {
        test(name + ' -> hard ' + code + ' (and earns the retry)', () => {
            const v = check(card(mut));
            assert.ok(codes(v).includes(code), name + ': ' + JSON.stringify(v.hard));
            assert.equal(C.needsRetry(v), true);
            assert.equal(v.ok, false);
        });
    }
    test('a bad ladies row is never saved, but the men row still validates', () => {
        const v = check(card((c) => { c.hcp_ladies[0] = 5; }));
        assert.equal(v.saveLadies, false);
        assert.ok(!codes(v).includes('hcp_men'));
    });
    test('no ladies row is fine: nothing to save, nothing failed', () => {
        const v = check(card((c) => { c.hcp_ladies = []; }));
        assert.deepEqual(v.hard, []);
        assert.equal(v.saveLadies, false);
    });
    test('soft only: odd yardage / unsure cell -> amber but no retry', () => {
        const v = check(card((c) => { c.unsure = [{ row: 'Blue', hole: 4 }]; }));
        assert.deepEqual(v.hard, []);
        assert.equal(v.suspectCount, 1);
        assert.equal(v.ok, false);
        assert.equal(C.needsRetry(v), false);
    });
    test('a 9-hole card uses 1..9 and 27-38', () => {
        const nine = { holes: 9, par: PAR.slice(0, 9), par_written: { out: 36, in: null, total: null },
            hcp_men: [9, 5, 3, 1, 8, 7, 2, 6, 4], hcp_ladies: [], tees: [{ name: 'Blue', yards: BLUE.slice(0, 9), written: { out: 3284 } }] };
        assert.deepEqual(check(nine, { holes: 9 }).hard, []);
        nine.hcp_men[0] = 10;
        assert.ok(codes(check(nine, { holes: 9 })).includes('hcp_men'));
    });
    test('not JSON / wrong shape -> parse_error', () => {
        assert.deepEqual(codes(C.validateCourse(C.parseCourseOutput('nope'))), ['parse_error']);
        assert.deepEqual(codes(C.validateCourse(C.parseCourseOutput('{"players":[]}'))), ['parse_error']);
    });
});

describe('the course prompt and schema', () => {
    test('asks for par, both HCP rows and tees; never for rating or slope', () => {
        const p = C.buildCoursePrompt({ holes: 18 });
        assert.match(p, /Par row/);
        assert.match(p, /hcp_men/);
        assert.match(p, /hcp_ladies/);
        assert.match(p, /BELOW the empty score boxes/);
        assert.match(p, /Ignore: course rating and slope/);
        const props = Object.keys(C.responseSchema().properties);
        assert.ok(!props.some((k) => /rating|slope/i.test(k)), props.join());
        const teeProps = Object.keys(C.responseSchema().properties.tees.items.properties);
        assert.deepEqual(teeProps.sort(), ['name', 'written', 'yards']);
    });
    test('the course name is the only free text that reaches the prompt', () => {
        assert.match(C.buildCoursePrompt({ holes: 18, name: 'Test Links' }), /Test Links/);
    });
});

// ---------------------------------------------------------------------------
// THE HANDLER, stubbed.
// ---------------------------------------------------------------------------
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
    const payload = b64u(JSON.stringify({ iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, sub: 'test-uid-080',
        iat: t - 60, exp: t + 3000, auth_time: t - 60, firebase: { sign_in_provider: 'anonymous' } }));
    const sig = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', KEYS.pair.privateKey, Buffer.from(header + '.' + payload));
    return header + '.' + payload + '.' + b64u(sig);
}
function fakeKV() {
    const m = new Map();
    return { m, get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, String(v)); } };
}
const gem = (obj, tok) => ({ status: 200, json: { candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] } }],
    usageMetadata: tok || { promptTokenCount: 1500, candidatesTokenCount: 600, thoughtsTokenCount: 900 } } });
function stubFetch(script) {
    const calls = [];
    const fn = async (url, init) => {
        const u = String(url);
        calls.push({ url: u, init });
        const reply = (r) => ({ ok: r.status >= 200 && r.status < 300, status: r.status,
            headers: { get: () => 'max-age=3600' }, json: async () => r.json });
        if (u.startsWith('https://www.googleapis.com/service_accounts/')) return reply({ status: 200, json: { keys: [KEYS.jwk] } });
        if (u.startsWith('https://golfapp-9fb21-default-rtdb.firebaseio.com/organizers/')) return reply({ status: 200, json: script.pass || null });
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
    fn.gemini = () => calls.filter((c) => c.url.includes('generativelanguage'));
    return fn;
}
const ENV = { GEMINI_API_KEY: 'stub-key-for-tests', SCAN_MODEL: 'gemini-3.8-flash', SCAN_RETRY_MODEL: 'gemini-3.1-pro-preview' };
const COURSE_BODY = { mode: 'course', image: IMAGE, course: { holes: 18, name: 'Test Links' } };
async function scan(script, extra) {
    const e = extra || {};
    const fetch = stubFetch(script);
    const kv = e.kv || fakeKV();
    const logs = [];
    const out = await S.handleScan({ env: ENV, kv, fetch, clock, log: (l) => logs.push(l),
        body: e.body || COURSE_BODY, authorization: 'Bearer ' + await idToken() });
    return { out, fetch, kv, logs };
}
beforeEach(() => { if (S) S.resetKeyCache(); });

describe('course mode in the handler (fake Gemini: good / bad / retry)', () => {
    test('GOOD: one Flash call, no retry, the course schema + prompt were sent', async () => {
        const { out, fetch, kv, logs } = await scan({ flash: [gem(card())] });
        assert.equal(out.status, 'ok');
        assert.equal(out.mode, 'course');
        assert.equal(out.retried, false);
        assert.equal(out.model, 'gemini-3.8-flash');
        assert.equal(out.courseScansLeft, 2);
        assert.equal(out.validation.saveLadies, true);
        assert.equal(fetch.gemini().length, 1);
        const sent = JSON.parse(fetch.gemini()[0].init.body);
        assert.deepEqual(sent.generationConfig.responseSchema, C.responseSchema());
        assert.match(sent.contents[0].parts[0].text, /BLANK printed golf scorecard/);
        assert.equal(fetch.gemini()[0].init.headers['x-goog-api-key'], 'stub-key-for-tests');
        assert.ok(!fetch.gemini()[0].url.includes('key='), 'the key never goes in a URL');
        assert.equal(kv.m.get('scan:course:test-uid-080'), '1');
        assert.equal(kv.m.has('scan:free:test-uid-080'), false, 'a course scan never uses a score scan');
        const line = JSON.parse(logs[0]);
        assert.equal(line.ev, 'course_scan');
        assert.ok(!logs[0].includes('stub-key-for-tests'));
    });
    test('BAD then RETRY better: Flash fails a check, Pro fixes it, Pro read kept', async () => {
        const bad = card((c) => { c.hcp_men[1] = 17; });
        const { out, fetch, logs } = await scan({ flash: [gem(bad)], pro: [gem(card())] });
        assert.equal(out.retried, true);
        assert.equal(out.model, 'gemini-3.1-pro-preview');
        assert.deepEqual(out.validation.hard, []);
        assert.equal(fetch.gemini().length, 2);
        assert.equal(JSON.parse(logs[0]).tokens.length, 2);
    });
    test('BAD then RETRY worse: the Flash read is kept, never a third call', async () => {
        const bad = card((c) => { c.hcp_men[1] = 17; });
        const worse = card((c) => { c.hcp_men[1] = 17; c.par[0] = 9; });
        const { out, fetch } = await scan({ flash: [gem(bad)], pro: [gem(worse)] });
        assert.equal(out.retried, true);
        assert.equal(out.model, 'gemini-3.8-flash');
        assert.equal(fetch.gemini().length, 2);
    });
    test('NEGATIVE CONTROL: a soft-only read does NOT spend a Pro call', async () => {
        const { out, fetch } = await scan({ flash: [gem(card((c) => { c.unsure = [{ row: 'par', hole: 3 }]; }))] });
        assert.equal(out.retried, false);
        assert.equal(fetch.gemini().length, 1);
    });
    test('unparseable twice -> unavailable, and no course scan is used up', async () => {
        const { out, kv } = await scan({ flash: [gem('not json')], pro: [gem('still not')] });
        assert.deepEqual(out, { status: 'unavailable', reason: 'upstream_error' });
        assert.equal(kv.m.has('scan:course:test-uid-080'), false);
    });
    test('its own 3 free: the 4th course scan needs a pass, even with score scans unused', async () => {
        const kv = fakeKV();
        kv.m.set('scan:course:test-uid-080', '3');
        const { out, fetch } = await scan({}, { kv });
        assert.deepEqual(out, { status: 'refused', reason: 'needs_pass' });
        assert.equal(fetch.gemini().length, 0);
    });
    test('used-up SCORE scans do not block a course scan', async () => {
        const kv = fakeKV();
        kv.m.set('scan:free:test-uid-080', '3');
        const { out } = await scan({ flash: [gem(card())] }, { kv });
        assert.equal(out.status, 'ok');
    });
    test('the course body is an allow-list; 9 or 18 only', () => {
        const r = S.readCourseBody({ mode: 'course', image: IMAGE, course: { holes: 18, name: 'X', lat: 1, lng: 2 }, players: ['A'] });
        assert.deepEqual(Object.keys(r.course).sort(), ['holes', 'name']);
        assert.deepEqual(S.readCourseBody({ mode: 'course', image: IMAGE, course: { holes: 12 } }), { error: 'bad_request' });
        assert.deepEqual(S.readCourseBody({ mode: 'course' }), { error: 'bad_image' });
    });
    test('no mode -> the score path (a course-only body is refused as a score body)', async () => {
        const fetch = stubFetch({});
        const out = await S.handleScan({ env: ENV, kv: fakeKV(), fetch, clock, body: { image: IMAGE, course: { holes: 18 } }, authorization: 'Bearer x' });
        assert.deepEqual(out, { status: 'unavailable', reason: 'bad_request' });
        assert.equal(fetch.calls.length, 0);
    });
});

// 088-3: the privacy page says what a COURSE-card scan sends (deployed with the server).
describe('privacy page: the course-card scan sentence', () => {
    test('names what is sent and what is not', () => {
        const html = require('fs').readFileSync(path.join(REPO_ROOT, 'privacy.html'), 'utf8');
        const li = (/<li><strong>Scanning a course's printed card\.<\/strong>[^<]*<\/li>/.exec(html) || [''])[0];
        assert.ok(li, 'the course-card sentence is on the page');
        assert.match(li, /Only that photo, the course name and the number of holes/);
        assert.match(li, /No player names, scores, handicaps or location are sent/);
        assert.match(li, /photo is not stored/);
        assert.match(li, /own free count/);
    });
});
