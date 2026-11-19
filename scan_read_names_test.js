// ============================================================================
// SCAN A: /api/scorecard-scan reads the golfers' names off the card when no names are sent (Manny 2026-11-19: "make
// /api/scorecard-scan read the golfer names off the card when no names are sent (app Scan our card)"). round.players
// absent or [] = readNames; any non-empty list = the named scan, exactly as before (the Desk scan and the card turn-in
// always send their golfers, so they must not change).
//
// What is held: the request check (absent / [] reads names; a named list unchanged, an empty name still refused);
// the prompt and the schema for a no-names scan; the validator (every row its own golfer, no unmatched / player-count
// failure, a read with no rows is a hard failure, more than 8 rows too, UNKNOWN: stripped); the whole handler end to
// end with a STUBBED Gemini answering the Advisor's answer key for card-flat.jpg (James 82, Harry 80, Tom 75, Peter
// 86); and that a NAMED request is the same request it was.
//
// THE NAMED PATH, measured against main 7c44310e's scorecard-validate.js (git show, the two required side by side):
// responseSchema (no argument, false, undefined), buildPrompt on 3 named rounds, validateScan + needsRetry on 5
// synthetic reads and on the 4 real handwritten reads in helpers/fixtures/scan-handwritten-reads.json (Papago x2,
// Legacy x2): identical, 20 of 20. scorecard_scan_server_test.js, scorecard_validate_test.js, tournament_card_check_
// test.js and tournament_card_turn_in_test.js run unchanged.
//
// WHAT THIS CANNOT PROVE: whether the real model reads card-flat.jpg right. That needs the Gemini key on this Mac
// (~/.hardpan/gemini.key) and scan-test/scan-a/run.mjs, or the preview deployed and the photo sent to it.
//
// BASELINE against main 7c44310e (this file run against 7c44310e's _scan.js and scorecard-validate.js, the branch's
// restored after): 3 pass / 5 fail of 8. The 3 green there hold for the old code too: 0 (the card's own arithmetic),
// 3 (the named prompt and schema) and 7 (a named request). On preview-scan-names: 8 / 0.
// NEGATIVE CONTROLS (each file copied to the scratchpad first, restored by cp, sha re-checked RESTORED-OK _scan.js
// d8d6461ab43bcde5, scorecard-validate.js a3e7ea4d6cd8c7a7): K1 readBody refuses a no-names round -> 6/2 (1, 6);
// K2 the prompt ignores readNames -> 6/2 (2, 6); K3 the validator matches no-name rows against an empty list -> 5/3 (4, 5, 6).
// ============================================================================
const { test, describe, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const { webcrypto } = require('crypto');
const { REPO_ROOT } = require('./helpers/load-script.js');
const V = require('./scorecard-validate.js');

let S = null, loadError = null;
before(async () => { try { S = await import(pathToFileURL(path.join(REPO_ROOT, 'functions', 'api', '_scan.js')).href); } catch (e) { loadError = e; } });
const need = () => { if (loadError) assert.fail('could not load the scan handler: ' + loadError.message); };

// THE ANSWER KEY (claude-mailbox/inbox/URGENT-ADVISOR-20261119-0155), checked against card-flat.jpg itself: the digits
// below are the card's. The PAR row is the card's printed one (36 / 35 = 71). TOTALS are what the golfers WROTE:
// James's IN (39) and TOT (82) and Harry's IN (41) and TOT (80) are the pen's arithmetic and do not match their own
// digits (James's back nine adds to 40, total 83; Harry's to 40, total 79). A right scan returns the digits AND the
// written figures as written, and flags those two back nines: that is the validator doing its job, not a misread.
const PAR = [4, 4, 4, 3, 4, 5, 3, 5, 4, 4, 3, 4, 4, 5, 3, 4, 3, 5];
const KEY = {
    James: [5, 5, 4, 4, 4, 6, 5, 6, 4, 4, 3, 5, 3, 7, 4, 5, 4, 5],
    Harry: [3, 4, 3, 3, 5, 7, 3, 6, 5, 5, 4, 5, 3, 4, 4, 5, 4, 6],
    Tom: [5, 4, 4, 3, 4, 5, 3, 5, 4, 5, 3, 3, 4, 5, 4, 5, 5, 4],
    Peter: [4, 4, 6, 5, 4, 6, 3, 6, 5, 5, 3, 3, 4, 6, 5, 7, 4, 6]
};
const TOTALS = { James: [43, 39, 82], Harry: [39, 41, 80], Tom: [37, 38, 75], Peter: [43, 43, 86] };
const sum = (a) => a.reduce((s, x) => s + x, 0);
const keyRead = () => ({ players: Object.keys(KEY).map((n) => ({ name: n, row_label_as_written: n, holes: KEY[n].map((s, i) => ({ hole: i + 1, score: s, confidence: 0.95 })), written_out: TOTALS[n][0], written_in: TOTALS[n][1], written_total: TOTALS[n][2] })), notes: '' });
const ROUND_NO_NAMES = { holes: 18, par: PAR, course: '' };
const NAMED = { holes: 18, par: PAR, players: [{ name: 'James' }, { name: 'Harry' }, { name: 'Tom' }, { name: 'Peter' }] };

describe('the answer key itself', () => {
    test('0 the card: par 36 / 35; every front nine adds to its written OUT; Tom and Peter add up everywhere; James (IN 40 vs written 39, TOT 83 vs 82) and Harry (IN 40 vs 41, TOT 79 vs 80) do not', () => {
        assert.equal(sum(PAR.slice(0, 9)), 36); assert.equal(sum(PAR.slice(9)), 35);
        for (const n of Object.keys(KEY)) assert.equal(sum(KEY[n].slice(0, 9)), TOTALS[n][0], n + ' out');
        for (const n of ['Tom', 'Peter']) { assert.equal(sum(KEY[n].slice(9)), TOTALS[n][1]); assert.equal(sum(KEY[n]), TOTALS[n][2]); }
        assert.deepEqual([sum(KEY.James.slice(9)), sum(KEY.James)], [40, 83]);
        assert.deepEqual([sum(KEY.Harry.slice(9)), sum(KEY.Harry)], [40, 79]);
        // the circles: Harry 3 on the par-4 1st and 4 on the par-5 14th, Tom 4 on the par-5 18th: birdies, digits inside
        assert.deepEqual([KEY.Harry[0] - PAR[0], KEY.Harry[13] - PAR[13], KEY.Tom[17] - PAR[17]], [-1, -1, -1]);
    });
});

describe('the request check', () => {
    const IMG = { mimeType: 'image/jpeg', data: Buffer.from('jpeg').toString('base64') };
    test('1 players absent, null or [] -> readNames, no players passed on; a named list -> no readNames, the list as before; an empty name or 9 golfers still refused', () => {
        need();
        for (const players of [undefined, null, []]) {
            const r = Object.assign({}, ROUND_NO_NAMES); if (players !== undefined) r.players = players;
            const b = S.readBody({ image: IMG, round: r });
            assert.ok(!b.error, JSON.stringify(b));
            assert.equal(b.round.readNames, true);
            assert.deepEqual(b.round.players, []);
        }
        const named = S.readBody({ image: IMG, round: NAMED });
        assert.equal(named.round.readNames, undefined, 'a named round carries no readNames key at all');
        assert.deepEqual(named.round.players.map((p) => p.name), ['James', 'Harry', 'Tom', 'Peter']);
        assert.deepEqual(S.readBody({ image: IMG, round: Object.assign({}, NAMED, { players: [{ name: ' ' }] }) }), { error: 'bad_request' });
        assert.deepEqual(S.readBody({ image: IMG, round: Object.assign({}, NAMED, { players: Array.from({ length: 9 }, (_, i) => ({ name: 'P' + i })) }) }), { error: 'bad_request' });
        assert.deepEqual(S.readBody({ image: IMG, round: Object.assign({}, NAMED, { players: 'James' }) }), { error: 'bad_request' });
        assert.deepEqual(S.readBody({ image: IMG, round: { holes: 18, players: [] } }), { error: 'bad_request' }, 'par is still required');
    });
});

describe('the prompt and the schema', () => {
    test('2 no names: the prompt says the players are not known and to read every scored row, skip the printed rows (tees, Par, Handicap), keep circles as the digit inside; the schema asks for the name as written', () => {
        const p = V.buildPrompt(Object.assign({ readNames: true, players: [] }, ROUND_NO_NAMES));
        assert.match(p, /The players are NOT known in advance\. Read them off the card\./);
        assert.match(p, /one entry for every row on the card where a golfer wrote scores, top to bottom, at most 8/);
        assert.match(p, /Do NOT return the printed rows: hole numbers, yardages or tee rows \(colour names such as Black, White, Blue\), Par, Handicap/);
        assert.match(p, /A circle or square drawn around a digit is a birdie or bogey mark: the digit inside is the score\./);
        assert.match(p, /crossed out, scribbled over or struck through is NOT the score/);
        assert.doesNotMatch(p, /known players above|There are \d+ players/);
        assert.equal(V.responseSchema(true).properties.players.items.properties.name.description, 'the name or initials exactly as written on the card');
    });
    test('3 a named round: the prompt and the schema are the named ones (the list, the mapping rule, the known-names description), with no read-names line', () => {
        const p = V.buildPrompt(NAMED);
        assert.match(p, /There are 4 players, in this order:\n1\. James\n2\. Harry\n3\. Tom\n4\. Peter/);
        assert.match(p, /Map each handwritten name or initials to one of the known players above/);
        assert.doesNotMatch(p, /NOT known in advance|Do NOT return the printed rows|birdie or bogey mark/);
        assert.equal(V.responseSchema().properties.players.items.properties.name.description, "must be one of the known names, or 'UNKNOWN:<as written>'");
        assert.deepEqual(V.responseSchema(false), V.responseSchema());
    });
});

describe('the validator with no names', () => {
    const ctx = () => Object.assign({ readNames: true, players: [] }, ROUND_NO_NAMES);
    test('4 the card read right: four golfers named as written, every front nine ok, Tom and Peter ok everywhere, James\'s and Harry\'s back nines flagged against what they wrote, and NO retry (the pen\'s sums, not the read)', () => {
        const v = V.validateScan({ ok: true, value: keyRead() }, ctx());
        assert.deepEqual(v.rows.map((r) => r.name), ['James', 'Harry', 'Tom', 'Peter']);
        assert.ok(v.rows.every((r) => r.match === 'read' && r.nines.front === 'ok'));
        assert.deepEqual(v.rows.map((r) => r.nines.back), ['mismatch', 'mismatch', 'ok', 'ok']);
        assert.deepEqual(v.rows.map((r) => r.sums.total), [83, 79, 75, 86]);
        assert.deepEqual(v.hard.map((h) => h.code + ':' + h.row + ':' + h.nine), ['sum_mismatch:0:in', 'sum_mismatch:0:total', 'sum_mismatch:1:in', 'sum_mismatch:1:total']);
        assert.deepEqual(v.missingPlayers, []);
        assert.equal(V.needsRetry(v), false, 'a pen mismatch alone never earns the Pro call');
    });
    test('5 nothing read is a hard failure (and earns the one retry); more than 8 rows is a player-count failure; UNKNOWN: is stripped from a name; a wrong digit still trips the nine', () => {
        const none = V.validateScan({ ok: true, value: { players: [], notes: '' } }, ctx());
        assert.deepEqual(none.hard.map((h) => h.code), ['no_players']);
        assert.equal(V.needsRetry(none), true);
        const nine = keyRead(); for (let i = 0; i < 5; i++) nine.players.push(JSON.parse(JSON.stringify(nine.players[i % 4])));
        assert.ok(V.validateScan({ ok: true, value: nine }, ctx()).hard.some((h) => h.code === 'player_count' && h.expected === 8));
        const unk = keyRead(); unk.players[3].name = 'UNKNOWN: Pete';
        assert.equal(V.validateScan({ ok: true, value: unk }, ctx()).rows[3].name, 'Pete');
        const wrong = keyRead(); wrong.players[2].holes[3].score = 4;   // a misread: Tom's 4th is a 3 on the card
        const w = V.validateScan({ ok: true, value: wrong }, ctx());
        assert.ok(w.hard.some((h) => h.code === 'sum_mismatch' && h.row === 2 && h.nine === 'out'), 'the written OUT catches a misread digit');
    });
});

// ---- the handler end to end, Gemini stubbed --------------------------------------------------------------------
const PROJECT = 'golfapp-9fb21';
const NOW = new Date('2026-11-19T09:00:00Z');
let KEYS = null;
before(async () => {
    const pair = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    KEYS = { pair, jwk: Object.assign({ kid: 'kid-1', alg: 'RS256', use: 'sig' }, await webcrypto.subtle.exportKey('jwk', pair.publicKey)) };
});
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function idToken() {
    const t = Math.floor(NOW.getTime() / 1000);
    const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'kid-1', typ: 'JWT' }));
    const p = b64u(JSON.stringify({ iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, sub: 'app-golfer-1', iat: t - 60, exp: t + 3000, auth_time: t - 60, firebase: { sign_in_provider: 'anonymous' } }));
    return h + '.' + p + '.' + b64u(await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', KEYS.pair.privateKey, Buffer.from(h + '.' + p)));
}
function fakeKV() { const m = new Map(); return { m, get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, String(v)); } }; }
function stub(answers) {
    const sent = [];
    const fn = async (url, init) => {
        const u = String(url);
        const reply = (status, json) => ({ ok: status < 300, status, headers: { get: () => null }, json: async () => json });
        if (u.startsWith('https://www.googleapis.com/service_accounts/v1/jwk/')) return reply(200, { keys: [KEYS.jwk] });
        if (/firebaseio\.com\/organizers\//.test(u)) return reply(200, null);
        if (/generativelanguage\.googleapis\.com/.test(u)) { sent.push(JSON.parse(init.body)); const a = answers.shift(); assert.ok(a, 'an unexpected model call'); return reply(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(a) }] } }], usageMetadata: {} }); }
        assert.fail('unexpected network call ' + u);
    };
    fn.sent = sent;
    return fn;
}
async function scan(round, answers) {
    const fetch = stub(answers);
    const out = await S.handleScan({ env: { GEMINI_API_KEY: 'stub' }, kv: fakeKV(), fetch, clock: { date: () => new Date(NOW) }, log: () => {},
        body: { image: { mimeType: 'image/jpeg', data: Buffer.from('card').toString('base64') }, round }, authorization: 'Bearer ' + await idToken() });
    return { out, sent: fetch.sent };
}
beforeEach(() => { if (S) S.resetKeyCache(); });

describe('POST /api/scorecard-scan, Gemini stubbed', () => {
    test('6 no names sent, the model reads the card right: status ok, ONE model call (no retry), the read-names prompt and schema went out; James, Harry, Tom, Peter with their 72 digits and their written totals 82 / 80 / 75 / 86', async () => {
        need();
        const { out, sent } = await scan(ROUND_NO_NAMES, [keyRead()]);
        assert.equal(out.status, 'ok', JSON.stringify(out));
        assert.equal(sent.length, 1, 'no retry');
        assert.match(sent[0].contents[0].parts[0].text, /The players are NOT known in advance/);
        assert.equal(sent[0].generationConfig.responseSchema.properties.players.items.properties.name.description, 'the name or initials exactly as written on the card');
        assert.deepEqual(out.result.players.map((p) => [p.name, p.written_total]), [['James', 82], ['Harry', 80], ['Tom', 75], ['Peter', 86]]);
        assert.deepEqual(out.result.players.map((p) => p.holes.map((c) => c.score)), [KEY.James, KEY.Harry, KEY.Tom, KEY.Peter]);
        assert.deepEqual(out.validation.missingPlayers, []);
        assert.deepEqual(out.validation.rows.map((r) => r.nines.back), ['mismatch', 'mismatch', 'ok', 'ok'], 'the two pen errors are shown, not hidden');
    });
    test('7 a NAMED request (what the Desk and the card turn-in send): the named prompt and schema go out, unchanged', async () => {
        need();
        const { out, sent } = await scan(NAMED, [keyRead()]);
        assert.equal(out.status, 'ok');
        assert.equal(sent[0].contents[0].parts[0].text, V.buildPrompt(S.readBody({ image: { mimeType: 'image/jpeg', data: 'AAAA' }, round: NAMED }).round));
        assert.match(sent[0].contents[0].parts[0].text, /There are 4 players, in this order/);
        assert.deepEqual(sent[0].generationConfig.responseSchema, V.responseSchema());
    });
});
