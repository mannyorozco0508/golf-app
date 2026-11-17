// ============================================================================
// tools/health-check.mjs - the hourly health check of hardpangolf.com, with a
// STUBBED fetch. No test here reaches the network; an unexpected URL fails.
//
// Held: the five checks pass on a healthy site and produce the one OK line; each
// check's failure (a dash in a price slot, a site-pricing.js tag that does not
// match the served file, no CACHE_VERSION, /tournaments not 200, a scan that is
// not ok, a course scan with no tees, sign-in refused) turns the line into FAIL
// naming the check, writes the alert text ending "for Advisor", and keeps the
// other checks' details; a changed sw version is noted, not failed; and NO
// SECRET (api key, refresh token, id token) ever reaches the line, the alert or
// the state. 2026-11-17 (Manny: "hourly health check ..."). Baseline: a new
// file against a tree without tools/health-check.mjs cannot load (0 pass / 0
// fail / all cancelled). 19 tests, 19 / 0 on preview-health. NEGATIVE CONTROLS (tools/health-check.mjs
// mutated, restored by sha from a saved copy): a dash counted as filled -> 2 red; the site-pricing.js hash never
// compared -> 1; no alert text on a failure -> 11; the id token written into the line -> 7; failures ignored (ok
// always true) -> 13.
// ============================================================================
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const { createHash } = require('crypto');
const { REPO_ROOT } = require('./helpers/load-script.js');

let H = null;
before(async () => { H = await import(pathToFileURL(path.join(REPO_ROOT, 'tools', 'health-check.mjs')).href); });

const SECRETS = { apiKey: 'AIza-test-api-key-XYZ', refreshToken: 'refresh-token-SECRET-123' };
const ID_TOKEN = 'eyJ-id-token-SECRET-456';
const PRICING = "var P = { pro: { founding: '$24.99' } };";
const HASH8 = createHash('sha256').update(PRICING).digest('hex').slice(0, 8);
function home(opts) {
    const o = opts || {};
    const slot = (k, v) => `<span data-price="${k}">${v}</span>`;
    return `<!doctype html><html><body>${slot('pro-headline', o.headline === undefined ? '$24.99/yr' : o.headline)}${slot('compare-others', '$99.99/yr')}${slot('free-golfers', '5')}<script src="/site-pricing.js?v=${o.tag || HASH8}"></script></body></html>`;
}
const SW = "// sw\nconst CACHE_VERSION = 'golfapp-v421-2.0';\n";
const TOURN = '<!doctype html><html><head><title>HardPan Tournaments</title></head><body>HardPan Tournaments</body></html>';
const scanOk = () => ({ status: 'ok', model: 'gemini-3.8-flash', retried: false, result: { players: [{}, {}, {}, {}] }, validation: { hard: [] } });
const courseOk = () => ({ status: 'ok', retried: false, result: { tees: [{ name: 'Blue' }, { name: 'White' }] } });

// The scripted fetch: a map of URL -> reply (or a function of init). Unexpected URL -> the test fails.
function stub(over) {
    const o = over || {};
    const calls = [];
    const reply = (status, body, isJson) => ({ ok: status >= 200 && status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), json: async () => (isJson ? body : JSON.parse(body)) });
    const f = async (url, init) => {
        calls.push({ url, init: init || {} });
        const u = String(url);
        if (u === 'https://hardpangolf.com/sw.js') return reply(o.swStatus || 200, o.sw === undefined ? SW : o.sw);
        if (u === 'https://hardpangolf.com/tournaments') return reply(o.tournStatus || 200, o.tourn === undefined ? TOURN : o.tourn);
        if (u === 'https://hardpangolf.com/') return reply(o.homeStatus || 200, o.home === undefined ? home() : o.home);
        if (u === 'https://hardpangolf.com/site-pricing.js') return reply(200, o.pricing === undefined ? PRICING : o.pricing);
        if (u.startsWith('https://securetoken.googleapis.com/v1/token?key=')) {
            assert.equal(u, 'https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(SECRETS.apiKey));
            assert.match(String(init.body), /grant_type=refresh_token&refresh_token=refresh-token-SECRET-123/);
            return o.tokenFail ? reply(400, { error: { message: 'INVALID_REFRESH_TOKEN' } }, true) : reply(200, { id_token: ID_TOKEN, expires_in: '3600' }, true);
        }
        if (u === 'https://hardpangolf.com/api/scan-erase') { assert.equal(init.headers.authorization, 'Bearer ' + ID_TOKEN); return reply(200, o.erase || { status: 'erased', erased: 3 }, true); }
        if (u === 'https://hardpangolf.com/api/scorecard-scan') {
            assert.equal(init.headers.authorization, 'Bearer ' + ID_TOKEN);
            const isCourse = /"mode":"course"/.test(String(init.body));
            return isCourse ? reply(200, o.course || courseOk(), true) : reply(200, o.scan || scanOk(), true);
        }
        assert.fail('unexpected URL ' + u);
    };
    f.calls = calls;
    return f;
}
const BODIES = { score: JSON.stringify({ image: { mimeType: 'image/jpeg', data: 'AAAA' }, round: { holes: 18 } }), course: JSON.stringify({ mode: 'course', image: { mimeType: 'image/jpeg', data: 'AAAA' }, course: { holes: 18 } }) };
const NOW = new Date('2026-11-17T09:05:00Z');   // 02:05 AZ
const run = (over, extra) => H.runHealth(Object.assign({ fetch: stub(over), secrets: SECRETS, bodies: BODIES, now: NOW, state: {} }, extra || {}));
const noSecrets = (s) => { for (const v of [SECRETS.apiKey, SECRETS.refreshToken, ID_TOKEN]) assert.ok(!String(s).includes(v), 'a secret leaked: ' + v.slice(0, 6)); };

describe('the healthy site: one OK line', () => {
    test('all five pass; the line names each; the stamp is Arizona time; no alert; state records the sw version', async () => {
        const f = stub(); const r = await H.runHealth({ fetch: f, secrets: SECRETS, bodies: BODIES, now: NOW, state: {} });
        assert.equal(r.ok, true);
        assert.equal(r.alert, null);
        assert.match(r.line, /^2026-11-17 02:05 AZ \| Tournaments-health \| OK: sw golfapp-v421-2\.0 · \/tournaments 200 · price band 3 slots filled, site-pricing\.js v[0-9a-f]{8} matches · scan score ok \d+\.\d s \(gemini-3\.8-flash, no retry; hard 0\) · course ok \d+\.\d s, 2 tees \| NEEDS MANNY: no$/);
        assert.deepEqual(r.state, { at: '2026-11-17 02:05', ok: true, sw: 'golfapp-v421-2.0', streak: 0, fails: [] });
        noSecrets(r.line); noSecrets(JSON.stringify(r.state));
        const urls = f.calls.map((c) => c.url);
        assert.deepEqual(urls.filter((u) => u.startsWith('https://hardpangolf.com')), ['https://hardpangolf.com/sw.js', 'https://hardpangolf.com/tournaments', 'https://hardpangolf.com/', 'https://hardpangolf.com/site-pricing.js', 'https://hardpangolf.com/api/scan-erase', 'https://hardpangolf.com/api/scorecard-scan', 'https://hardpangolf.com/api/scorecard-scan']);
        assert.equal(f.calls.filter((c) => /securetoken/.test(c.url)).length, 1, 'one sign-in');
    });
    test('the erase comes before the score scan, and the course scan sends mode course', async () => {
        const f = stub(); await H.runHealth({ fetch: f, secrets: SECRETS, bodies: BODIES, now: NOW, state: {} });
        const posts = f.calls.filter((c) => c.init.method === 'POST' && /hardpangolf/.test(c.url));
        assert.deepEqual(posts.map((c) => c.url.replace('https://hardpangolf.com', '')), ['/api/scan-erase', '/api/scorecard-scan', '/api/scorecard-scan']);
        assert.ok(!/"mode":"course"/.test(String(posts[1].init.body))); assert.match(String(posts[2].init.body), /"mode":"course"/);
    });
    test('a changed sw version since the last run is NOTED in the OK line, not failed', async () => {
        const r = await run({}, { state: { at: '2026-11-17 01:05', ok: true, sw: 'golfapp-v420-2.0', streak: 0 } });
        assert.equal(r.ok, true);
        assert.match(r.line, /sw golfapp-v421-2\.0 \(was golfapp-v420-2\.0\)/);
    });
    test('the Arizona stamp: UTC-7 all year (no DST)', () => {
        assert.equal(H.stampAZ(new Date('2026-07-04T06:30:00Z')), '2026-07-03 23:30');
        assert.equal(H.stampAZ(new Date('2026-01-01T07:00:00Z')), '2026-01-01 00:00');
    });
});

describe('each failure turns the line into FAIL, names the check, keeps the rest, and writes the alert', () => {
    const expectFail = (r, name, re) => {
        assert.equal(r.ok, false);
        assert.match(r.line, new RegExp('\\| Tournaments-health \\| FAIL \\(' + name + '\\): '));
        assert.match(r.line, re);
        assert.match(r.line, / \| NEEDS MANNY: look at the health alert for Advisor$/);
        assert.ok(r.alert, 'an alert text');
        assert.match(r.alert, /^# HEALTH ALERT - hardpangolf\.com - 2026-11-17 02:05 AZ/);
        assert.match(r.alert, new RegExp('Failed: ' + name + '\\.'));
        assert.match(r.alert, /for Advisor$/);
        noSecrets(r.line); noSecrets(r.alert); noSecrets(JSON.stringify(r.state));
    };
    test('PRICE: a dash in a slot', async () => {
        const r = await run({ home: home({ headline: '–' }) });
        expectFail(r, 'price', /1 slot\(s\) blank or a dash: pro-headline/);
        assert.match(r.line, /rest: sw golfapp-v421-2\.0 · \/tournaments 200 · scan score ok/);
    });
    test('PRICE: an empty slot and a plain hyphen both count as a dash', async () => {
        assert.equal((await run({ home: home({ headline: '' }) })).ok, false);
        assert.equal((await run({ home: home({ headline: ' - ' }) })).ok, false);
        assert.equal((await run({ home: home({ headline: '$24.99/yr' }) })).ok, true);
    });
    test('PRICE: the site-pricing.js tag does not match the served file', async () => {
        const r = await run({ home: home({ tag: 'deadbeef' }) });
        expectFail(r, 'price', /site-pricing\.js tag v=deadbeef does not match the served file/);
    });
    test('PRICE: no slots at all / no versioned tag / homepage 500', async () => {
        assert.match((await run({ home: '<html><body>nothing</body></html>' })).line, /FAIL \(price\): homepage has no data-price slots/);
        assert.match((await run({ home: home().replace(/<script[^>]*><\/script>/, '') })).line, /no versioned site-pricing\.js tag/);
        assert.match((await run({ homeStatus: 500 })).line, /FAIL \(price\): homepage HTTP 500/);
    });
    test('SW: no CACHE_VERSION / HTTP 404', async () => {
        expectFail(await run({ sw: '// nothing here' }), 'sw', /sw\.js has no CACHE_VERSION/);
        expectFail(await run({ swStatus: 404, sw: '' }), 'sw', /sw\.js HTTP 404/);
    });
    test('TOURNAMENTS: 500, and a 200 that is not the Tournaments page', async () => {
        expectFail(await run({ tournStatus: 500 }), 'tourn', /\/tournaments HTTP 500/);
        expectFail(await run({ tourn: '<html><body>Access denied</body></html>' }), 'tourn', /200 but not the Tournaments page/);
    });
    test('SCAN: status unavailable, needs_pass, the wrong player count', async () => {
        expectFail(await run({ scan: { status: 'unavailable', reason: 'upstream_error' } }), 'score', /scan score HTTP 200 status unavailable upstream_error/);
        expectFail(await run({ scan: { status: 'refused', reason: 'needs_pass' } }), 'score', /status refused needs_pass/);
        expectFail(await run({ scan: { status: 'ok', result: { players: [{}, {}] }, validation: { hard: [] } } }), 'score', /players 2/);
    });
    test('COURSE: no tees / status unavailable; the score check still passes beside it', async () => {
        const r = await run({ course: { status: 'ok', result: { tees: [] } } });
        expectFail(r, 'course', /course HTTP 200 status ok tees 0/);
        assert.match(r.line, /rest: .*scan score ok/);
        expectFail(await run({ course: { status: 'unavailable', reason: 'timeout' } }), 'course', /status unavailable timeout/);
    });
    test('SIGN-IN refused: both scan checks fail, named, and the refresh token is nowhere in the output', async () => {
        const r = await run({ tokenFail: true });
        expectFail(r, 'score, course', /sign-in: token HTTP 400; not run/);
    });
    test('ERASE refused: the probe does not scan, both named', async () => {
        const f = stub({ erase: { status: 'refused', reason: 'sign_in' } });
        const r = await H.runHealth({ fetch: f, secrets: SECRETS, bodies: BODIES, now: NOW, state: {} });
        expectFail(r, 'score, course', /scan-erase HTTP 200 refused; not run \(erase failed\)/);
        assert.equal(f.calls.filter((c) => c.url.endsWith('/api/scorecard-scan')).length, 0, 'no scan after a failed erase');
    });
    test('no probe.json / bodies: the scan checks say so, the site checks still run', async () => {
        const r = await H.runHealth({ fetch: stub(), secrets: null, bodies: null, now: NOW, state: {} });
        expectFail(r, 'score, course', /scan probe not set up/);
        assert.match(r.line, /rest: sw golfapp-v421-2\.0 · \/tournaments 200 · price band 3 slots filled/);
    });
    test('a thrown fetch (network down) is a named failure, not a crash', async () => {
        const inner = stub(); const f = async (url, init) => { if (/sw\.js/.test(String(url))) throw Object.assign(new Error('offline'), { name: 'TypeError' }); return inner(url, init); };
        const r = await H.runHealth({ fetch: f, secrets: SECRETS, bodies: BODIES, now: NOW, state: {} });
        expectFail(r, 'sw', /FAIL \(sw\): sw: offline/);
    });
    test('consecutive failures count up in the state and the alert; an OK resets the streak', async () => {
        const r1 = await run({ swStatus: 404, sw: '' }, { state: { at: '2026-11-17 01:05', ok: false, streak: 2, sw: 'golfapp-v421-2.0' } });
        assert.equal(r1.state.streak, 3);
        assert.match(r1.alert, /Previous run: 2026-11-17 01:05 AZ, FAIL\. Consecutive failures: 3\./);
        const r2 = await run({}, { state: r1.state });
        assert.equal(r2.state.streak, 0);
    });
});

describe('the pieces', () => {
    test('priceSlots reads every data-price slot with its text', () => {
        assert.deepEqual(H.priceSlots(home()), [{ key: 'pro-headline', text: '$24.99/yr' }, { key: 'compare-others', text: '$99.99/yr' }, { key: 'free-golfers', text: '5' }]);
    });
    test('the install script writes an hourly LaunchAgent (StartInterval 3600) that runs the copied script, and loads only with --load', () => {
        const sh = require('fs').readFileSync(path.join(REPO_ROOT, 'tools', 'health', 'install.sh'), 'utf8');
        assert.match(sh, /<key>StartInterval<\/key><integer>3600<\/integer>/);
        assert.match(sh, /health-check\.mjs/);
        assert.match(sh, /if \[\[ "\$1" == "--load" \]\]; then .*launchctl bootstrap/);
        assert.match(sh, /--unload/);
    });
});
