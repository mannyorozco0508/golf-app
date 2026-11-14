// ============================================================================
// SCORECARD SCAN CHECK ON THE DESK (SK, ADVISOR-20261114-1527): Manny's pick A
// (Scan card per team or group row -> that card's grid) with B's review list
// (Verify cards: every open mismatch across the field).
//
// HOW EACH TEST ARRIVES. ?tourney=CODE as the organizer (signed in, the
// record's ownerUid), the page's OWN listener fired with the record, then
// TAPS: the onclick of the element a person touches, read from the markup the
// page rendered (data-* attributes become this.dataset, as a browser has
// them), and the CAMERA as the file input's own onchange from the static
// markup with a picked file. No test names a render function the page
// defines. The browser pieces mini-dom does not have - FileReader, Image, a
// canvas, fetch - are stood in for, and fetch answers with a scripted scan
// in the LIVE scanner's response shape (functions/api/_scan.js: status ok,
// result.players[{ name, holes[{hole,score,confidence}], written_* }]).
//
// "THROUGH THE CORRECTOR". Use card must write by calling the page's own
// corrector (correctPlayerScore / correctTeamPlayerScore / correctTeamScore,
// the Setup tab's "Correct a scorecard"). The test wraps those three globals
// with a recorder that then calls the original, so the write still happens
// through the original code and the test sees that it was the corrector that
// made it. A Use card that wrote the score path itself would make the same
// database write and leave the recorder empty: D2/D5/D6 go red.
//
// WHAT mini-dom CANNOT PROVE, said plainly: innerHTML is a string (the grid
// is read as markup, not as cells on a screen); no layout (the grid could
// overflow 390 px); the file input's accept/capture attributes are static
// markup nothing parses here; the real camera, the real canvas downscale and
// the JPEG's size are not exercised. tools/card-check-cold.js arrives cold in
// headless Chrome for those: the input exists with accept="image/*" and
// capture="environment", a real JPEG goes through the real canvas, the grid
// renders inside 390 px, and the photographs are in claude-mailbox-shared/
// tournaments/build-sk/.
//
// THE RULES ARE NOT A QUESTION HERE: tournaments/<code> is the owner's to write
// in database.rules.json and in the live copy read for this build, so
// cardChecks and cardsVerified need no new rule. R1 holds the repo rules to
// that with targaryen.
//
// NEGATIVE CONTROLS (copied to the scratchpad first, restored by sha):
//   K1 Use card writes db.ref(tournamentScorePath(...)).set(card) itself
//      instead of calling the corrector              -> D2, D5, D6 red
//   K2 the Desk gate dropped (renderCardCheck ignores canManage) -> A3 red
//   K3 the "All N verified" write skips the every-card-scanned test
//      (allVerified replaced by withMismatches === 0)  -> D3 red
// Run 2026-11-14, each restored by sha (RESTORED-OK 76bc59483655190a).
// K1 also leaves D1-D4 green: Keep app writes no score and D4 refuses before
// any write, so neither can tell the two paths apart; that is expected.
//
// BASELINE (the FINAL file): against preview-batch 5033e24b (tournament.html
// sha256 0eace6a0 6eea514a..., no scan-compare.js), the page swapped in by cp
// and restored by sha: 16 tests, 3 pass / 13 fail. The 3 that pass hold for
// a page with no scan check at all and must STAY green: A1 (a Desk before
// any score shows nothing new and writes nothing), A3 (a visitor gets no
// Scan card) and R1 (the repo rules already let the owner write both keys and
// refuse anyone else). After the build (tournament.html sha256 76bc5948
// 3655190a...): 16 tests, 16 pass / 0 fail.
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const PAGE = 'tournament.html';
const HTML = fs.readFileSync(path.join(REPO_ROOT, PAGE), 'utf8');
const CODE = 'STK26';
const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false, getIdToken: () => Promise.resolve('test-token') };
const clone = (o) => JSON.parse(JSON.stringify(o));
async function settle(n) { for (let i = 0; i < (n || 8); i++) await new Promise((r) => setImmediate(r)); }

const PAR = [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4];
const CD = PAR.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: ((i * 7) % 18) + 1 }));
const sc = (pi, h) => PAR[h - 1] + ((pi + h) % 3 === 0 ? 1 : 0) - ((pi * 5 + h) % 13 === 0 ? 1 : 0);
const GROUPS = [
    ['Group 1', 1, ['Ana Diaz', 'Joe Fox', 'Sam Ortiz', 'Mia Chen']],
    ['Group 2', 3, ['Dana Ruiz', 'Lee Park', 'Kim Vo', 'Al Lopez']],
    ['Group 3', 5, ['Ray Diaz', 'Jo Park', 'Tom Reyes', 'Eva Lin']],
    ['Group 4', 7, ['Ben Cruz', 'Liz Moore', 'Nick Hall', 'Rosa Vega']]
];
// An individual event: four groups of four, shotgun, every golfer through 18 unless scored:false.
function individual(opts) {
    opts = opts || {};
    const players = {}, groups = {}, scores = {};
    let k = 0;
    GROUPS.forEach(([name, hole, names], gi) => {
        const gid = 'g' + (gi + 1);
        groups[gid] = { name, startingHole: String(hole), playerIds: [], createdAt: gi + 1 };
        names.forEach((n, ni) => {
            k++;
            const pid = 'p' + String(k).padStart(2, '0');
            players[pid] = { id: pid, name: n, handicap: String(8 + k), addedAt: k };
            groups[gid].playerIds.push(pid);
            if (opts.scored !== false) PAR.forEach((_, i) => { scores[`${pid}_h${i + 1}`] = sc(ni, i + 1); });
        });
    });
    return { name: 'Starkey Classic', scoringModel: 'player-v1', format: 'individual', ownerUid: 'u-org',
        eventDate: '2026-11-22', courseName: 'Papago Golf Course', courseData: CD, startType: 'shotgun',
        players, scoringGroups: groups, scores, createdAt: 1 };
}
// The scanner reading a group's card: what the app holds, edited per test.
function scanOf(names, edit) {
    const rows = names.map((n, ni) => {
        const holes = PAR.map((_, i) => ({ hole: i + 1, score: sc(ni, i + 1), confidence: 0.97 }));
        return { name: n, row_label_as_written: n, holes, written_out: null, written_in: null, written_total: holes.reduce((s, c) => s + c.score, 0) };
    });
    if (edit) edit(rows);
    return { status: 'ok', model: 'gemini-2.5-flash', retried: false, paid: true, freeScansLeft: null, result: { players: rows, notes: '' }, validation: {} };
}
// Group 2's card: Dana's 7th reads 6 (the app has 5, par 5) and she wrote the card's own total;
// Kim Vo's 13th reads 6 at confidence 0.55 (the app has 5); everything else as the app.
const G2_SCAN = () => scanOf(GROUPS[1][2], (r) => {
    r[0].holes[6].score = 6; r[0].written_total += 1;
    r[2].holes[12].score = 6; r[2].holes[12].confidence = 0.55; r[2].written_total = null;
});

// ---- ARRIVAL, TAPS, THE CAMERA -----------------------------------------------
function arrive(rec, opts) {
    opts = opts || {};
    const sb = loadHtmlInlineScript(PAGE, [], { search: '?tourney=' + CODE + (opts.recap ? '&recap=1' : '') });
    if (opts.user !== null) sb.__auth.setUser(opts.user || OWNER);
    sb.__fetches = [];
    sb.__scanAnswer = opts.answer || null;
    sb.fetch = (url, init) => { sb.__fetches.push({ url, init }); const a = sb.__scanAnswer; return Promise.resolve({ status: 200, json: () => Promise.resolve(clone(a)) }); };
    // The browser's image pieces: a picked file reads as a data URL, the image
    // decodes at 4032 x 3024 (a phone photo), the canvas draws and encodes.
    sb.__canvases = [];
    sb.FileReader = class { readAsDataURL(f) { this.result = 'data:image/jpeg;base64,' + f.b64; setImmediate(() => this.onload()); } };
    sb.Image = class { set src(v) { this.naturalWidth = 4032; this.naturalHeight = 3024; setImmediate(() => this.onload()); } };
    const make = sb.document.createElement.bind(sb.document);
    sb.document.createElement = (t) => {
        if (t !== 'canvas') return make(t);
        const cv = { width: 0, height: 0, getContext: () => ({ drawImage() {} }), toDataURL: (type, q) => { cv.type = type; cv.q = q; return 'data:image/jpeg;base64,' + 'QUJD'.repeat(100000); } };
        sb.__canvases.push(cv);
        return cv;
    };
    fire(sb, new RegExp('^tournaments/' + CODE + '$'), rec);
    return sb;
}
function fire(sb, re, val) {
    const hs = sb.__dbHandlers.filter((h) => h.event === 'value' && re.test(h.path));
    assert.ok(hs.length > 0, 'no listener on ' + re);
    hs.forEach((h) => h.cb({ val: () => clone(val), exists: () => val !== null && val !== undefined }));
}
const el = (sb, id) => sb.document.getElementById(id);
const html = (sb, id) => String(el(sb, id).innerHTML || '');
const plain = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const unq = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
function tags(markup) { return markup.match(/<(button|a|input|span)\b[^>]*>/g) || []; }
function tap(sb, markup, pick) {
    const tag = tags(markup).find(pick);
    assert.ok(tag, 'nothing to tap in that markup');
    const on = /\bonclick="([^"]*)"/.exec(tag);
    assert.ok(on, 'the tag has an onclick');
    const dataset = {};
    tag.replace(/\bdata-([a-z]+)="([^"]*)"/g, (_, k, v) => { dataset[k] = unq(v); });
    sb.__tapEl = { dataset };
    vm.runInContext('(function () { ' + unq(on[1]) + ' }).call(__tapEl)', sb);
}
const deskTab = (sb) => tap(sb, HTML, (t) => /\bid="tab-btn-desk"/.test(t));
// The camera: the static input's own onchange, with the photo the phone took.
async function takePhoto(sb) {
    const tag = (HTML.match(/<input\b[^>]*\bid="cardcheck-file"[^>]*>/) || [])[0];
    assert.ok(tag, 'the file input is static markup');
    const on = /\bonchange="([^"]*)"/.exec(tag)[1];
    sb.__fileEl = { files: [{ name: 'card.jpg', type: 'image/jpeg', b64: 'UEhPVE8=' }], value: 'C:\\fakepath\\card.jpg' };
    vm.runInContext('(function () { ' + unq(on) + ' }).call(__fileEl)', sb);
    await settle(12);
}
const mine = (sb) => sb.__dbWrites.filter((w) => /\/(cardChecks|cardsVerified|scores)(\/|$)/.test(w.path));
function spyCorrector(sb) {
    const calls = [];
    ['correctPlayerScore', 'correctTeamPlayerScore', 'correctTeamScore'].forEach((fn) => {
        const orig = sb[fn];
        assert.equal(typeof orig, 'function', fn + ' is the page\'s corrector');
        sb[fn] = function () { calls.push([fn].concat([].slice.call(arguments))); return orig.apply(this, arguments); };
    });
    return calls;
}
const scanBtn = (sk) => (t) => /ck-scan/.test(t) && new RegExp('data-sk="' + sk + '"').test(t);

// ---- A. THE DESK -------------------------------------------------------------
describe('A. THE DESK, as the organizer arrives', () => {
    test('A1 DEFAULT before anyone scores: the Desk shows nothing new and nothing is written', () => {
        const sb = arrive(individual({ scored: false }));
        deskTab(sb);
        assert.equal(html(sb, 'cardcheck-wrap'), '', 'no card check before there is a score');
        assert.ok(!/Scan card/.test(html(sb, 'manage-tab-desk')));
        assert.equal(mine(sb).length, 0);
        assert.equal(sb.__fetches.length, 0);
    });

    test('A2 DEFAULT after the round, nothing scanned yet: tiles 4 cards / 0 verified / 0 with mismatches / 4 to scan, a Scan card on every group row, the day\'s allowance, nothing written', () => {
        const sb = arrive(individual());
        deskTab(sb);
        const w = html(sb, 'cardcheck-wrap');
        assert.match(w, /<b id="ck-tile-cards">4<\/b><span>cards<\/span>/);
        assert.match(w, /<b id="ck-tile-verified">0<\/b><span>verified<\/span>/);
        assert.match(w, /<b id="ck-tile-open">0<\/b><span>with mismatches<\/span>/);
        assert.match(w, /<b id="ck-tile-toscan">4<\/b><span>to scan<\/span>/);
        assert.equal((w.match(/>Scan card</g) || []).length, 4, 'one Scan card per group');
        assert.match(plain(w), /Group 2 · H3 Dana Ruiz, Lee Park, Kim Vo, Al Lopez not scanned Scan card/);
        assert.match(plain(w), /30 of 30 scans left today, counted on this phone\. The scanner allows 30 scans a day on this account and 3 a minute\./);
        assert.ok(!/verified at/.test(w), 'no verified line');
        assert.ok(!/Verify cards/.test(w), 'nothing to review');
        assert.equal(mine(sb).length, 0, 'arriving writes nothing');
        assert.ok(!/\$|cash|prize money/i.test(plain(w)), 'no money words');
    });

    test('A3 a visitor (not the owner) gets no Scan card: the Desk is not theirs and the card check is empty', () => {
        const sb = arrive(individual(), { user: { uid: 'someone-else', email: 'x@example.com', isAnonymous: false } });
        assert.equal(el(sb, 'tab-btn-desk').style.display, 'none', 'the Desk pill is hidden');
        assert.ok(!/Scan card/.test(html(sb, 'cardcheck-wrap')));
        assert.equal(mine(sb).length, 0);
    });
});

// ---- B. THE SCAN AND THE RESULT --------------------------------------------
describe('B. Scan card -> the photo -> the LIVE scanner -> the card\'s grid', () => {
    test('B1 the request: POST /api/scorecard-scan with the ID token, a JPEG of at most about 600 KB, and the group\'s round - 18 holes, par, stroke index, its four names and handicaps', async () => {
        const sb = arrive(individual(), { answer: G2_SCAN() });
        deskTab(sb);
        tap(sb, html(sb, 'cardcheck-wrap'), scanBtn('g2'));
        await takePhoto(sb);
        assert.equal(sb.__fetches.length, 1);
        const f = sb.__fetches[0];
        assert.equal(f.url, '/api/scorecard-scan');
        assert.equal(f.init.method, 'POST');
        assert.equal(f.init.headers.Authorization, 'Bearer test-token');
        const body = JSON.parse(f.init.body);
        assert.equal(body.image.mimeType, 'image/jpeg');
        assert.ok(/^[A-Za-z0-9+/]+=*$/.test(body.image.data), 'bare base64, no data: prefix');
        assert.ok(body.image.data.length * 0.75 <= 600 * 1024, 'at most about 600 KB');
        const cv = sb.__canvases[0];
        assert.equal(Math.max(cv.width, cv.height), 1600, 'the 4032 px photo is drawn at 1600 px on its long side');
        assert.equal(cv.type, 'image/jpeg');
        assert.deepEqual(Object.keys(body.round).sort(), ['course', 'expectedHoles', 'holes', 'par', 'players', 'startHole', 'strokeIndex', 'tee']);
        assert.equal(body.round.holes, 18);
        assert.equal(body.round.par['7'], 5);
        assert.equal(body.round.strokeIndex['2'], 8);
        assert.deepEqual(body.round.players, [{ name: 'Dana Ruiz', handicap: 13 }, { name: 'Lee Park', handicap: 14 }, { name: 'Kim Vo', handicap: 15 }, { name: 'Al Lopez', handicap: 16 }]);
        assert.ok(!/u-org|org@example/.test(f.init.body), 'no account id or email in the body');
    });

    test('B2 the result: Group 2\'s grid with the red "6 app 5" on Dana\'s 7th, the amber "6? app 5" on Kim\'s 13th, ink ticks elsewhere, the issues with Use card / Keep app (View photo beside the amber one), and the check stored with no photo and no uid', async () => {
        const sb = arrive(individual(), { answer: G2_SCAN() });
        deskTab(sb);
        tap(sb, html(sb, 'cardcheck-wrap'), scanBtn('g2'));
        await takePhoto(sb);
        const w = html(sb, 'cardcheck-wrap');
        assert.match(w, /id="ck-card-title">Group 2 · card check</);
        assert.match(w, /<td class="ck-x"><span>6<\/span><small>app 5<\/small><\/td>/, 'the mismatch: card digit in red, the app\'s under it');
        assert.match(w, /<td class="ck-u"><span>6\?<\/span><small>app 5<\/small><\/td>/, 'the unsure digit in amber');
        assert.equal((w.match(/class="ck-x"/g) || []).length, 1);
        assert.equal((w.match(/class="ck-u"/g) || []).length, 1);
        assert.match(w, /<td class="ck-mk">✓<\/td>/, 'a nine that matches gets the plain tick');
        assert.ok(!/ck-mk[^>]*style="[^"]*green|class="[^"]*green/.test(w), 'the tick is never green');
        const issues = plain(w.slice(w.indexOf('<div id="ck-issues">')));
        assert.match(issues, /^Hole 7 · Dana Ruiz: card 6, app 5 Use card \(6\) Keep app \(5\) Dana Ruiz: the card's total says 78, the app adds to 77 Keep app Hole 13 · Kim Vo: reads 6\?, app 5\. Check the photo\. Use card \(6\) Keep app \(5\) View photo Use card writes that hole through the score corrector/);
        const st = mine(sb);
        assert.equal(st.length, 1, 'one write: the check');
        assert.equal(st[0].path, `tournaments/${CODE}/cardChecks/g2`);
        assert.equal(st[0].op, 'set');
        const v = st[0].value;
        assert.deepEqual(Object.keys(v).sort(), ['appTotal', 'at', 'holes', 'rows', 'unmatched', 'verdict', 'writtenTotal']);
        assert.equal(v.verdict, 'mismatch');
        assert.deepEqual(clone(v.rows.p05.h.h7), { status: 'mismatch', card: 6, app: 5, conf: 0.97 });
        assert.deepEqual(clone(v.rows.p07.h.h13), { status: 'unsure', card: 6, app: 5, conf: 0.55 });
        assert.ok(!/u-org|base64|data:image|UEhPVE8|photo/i.test(JSON.stringify(v)), 'no photo and no uid stored');
        // the photo is on the screen only, from memory
        tap(sb, html(sb, 'cardcheck-wrap'), (t) => /ck-photo-btn/.test(t));
        assert.match(html(sb, 'cardcheck-wrap'), /<img id="ck-photo-img" src="data:image\/jpeg;base64,/);
        assert.match(plain(html(sb, 'cardcheck-wrap')), /kept on this screen only, until the page is closed/);
        assert.equal(mine(sb).length, 1, 'viewing the photo writes nothing');
    });

    test('B3 the scanner\'s daily limit: its own sentence, "30 scans a day on this account", and nothing stored', async () => {
        const sb = arrive(individual(), { answer: { status: 'refused', reason: 'daily_limit' } });
        deskTab(sb);
        tap(sb, html(sb, 'cardcheck-wrap'), scanBtn('g1'));
        await takePhoto(sb);
        assert.match(plain(html(sb, 'cardcheck-wrap')), /That is the scanner’s limit: 30 scans a day on this account\./);
        assert.equal(mine(sb).length, 0);
    });

    test('B4 the scanner not switched on (not_configured) says so; nothing stored, nothing counted', async () => {
        const sb = arrive(individual(), { answer: { status: 'not_configured' } });
        deskTab(sb);
        tap(sb, html(sb, 'cardcheck-wrap'), scanBtn('g1'));
        await takePhoto(sb);
        assert.match(plain(html(sb, 'cardcheck-wrap')), /The card scanner is not switched on yet\./);
        assert.equal(mine(sb).length, 0);
    });
});

// ---- D. USE CARD / KEEP APP ------------------------------------------------
describe('D. Use card goes through the corrector; Keep app writes no score', () => {
    async function scanned() {
        const sb = arrive(individual(), { answer: G2_SCAN() });
        deskTab(sb);
        tap(sb, html(sb, 'cardcheck-wrap'), scanBtn('g2'));
        await takePhoto(sb);
        return sb;
    }
    test('D1 Keep app on the unsure 13th: the choice is stored, no score is written, the hole shows the app\'s 5', async () => {
        const sb = await scanned();
        const n = sb.__dbWrites.length;
        tap(sb, html(sb, 'cardcheck-wrap'), (t) => /ck-keep/.test(t) && /data-issue="p07\|h13"/.test(t));
        const ws = sb.__dbWrites.slice(n).filter((w) => /cardChecks|scores|cardsVerified/.test(w.path));
        assert.equal(ws.length, 1);
        assert.equal(ws[0].path, `tournaments/${CODE}/cardChecks/g2`);
        assert.equal(ws[0].value.rows.p07.h.h13.choice, 'app');
        assert.ok(!sb.__dbWrites.slice(n).some((w) => /\/scores\//.test(w.path)), 'no score written');
        assert.match(plain(html(sb, 'cardcheck-wrap')), /Hole 13 · Kim Vo: reads 6\?, app 5\. Check the photo\. Kept the app/);
    });

    test('D2 Use card on Dana\'s 7th: the corrector writes 6 to her score, the choice is stored, and the total issue closes', async () => {
        const sb = await scanned();
        const calls = spyCorrector(sb);
        const n = sb.__dbWrites.length;
        tap(sb, html(sb, 'cardcheck-wrap'), (t) => /ck-use/.test(t) && /data-issue="p05\|h7"/.test(t));
        assert.deepEqual(calls, [['correctPlayerScore', 'g2', 'p05', 7, 6, undefined]], 'the corrector, with the group, the golfer, the hole and the card digit');
        const ws = sb.__dbWrites.slice(n);
        const score = ws.filter((w) => /\/scores\//.test(w.path));
        assert.deepEqual(score.map((w) => [w.path, w.op, w.value]), [[`tournaments/${CODE}/scores/p05_h7`, 'set', 6]]);
        const check = ws.filter((w) => /cardChecks/.test(w.path)).pop();
        assert.equal(check.value.rows.p05.h.h7.choice, 'card');
        const left = plain(html(sb, 'cardcheck-wrap'));
        assert.match(left, /Hole 7 · Dana Ruiz: card 6, app 5 Used the card \(6\)/);
        assert.ok(!/the card's total says/.test(left), 'the total agrees once the card\'s digit is on the app');
    });

    test('D3 every issue answered: the card reads verified and the Desk tile counts it', async () => {
        const sb = await scanned();
        tap(sb, html(sb, 'cardcheck-wrap'), (t) => /ck-use/.test(t) && /data-issue="p05\|h7"/.test(t));
        tap(sb, html(sb, 'cardcheck-wrap'), (t) => /ck-keep/.test(t) && /data-issue="p07\|h13"/.test(t));
        assert.match(plain(html(sb, 'cardcheck-wrap')), /✓ Group 2: verified, 72 holes checked · 2 resolved/);
        tap(sb, html(sb, 'cardcheck-wrap'), (t) => /\bid="ck-back"/.test(t));
        const w = html(sb, 'cardcheck-wrap');
        assert.match(w, /<b id="ck-tile-verified">1<\/b>/);
        assert.match(w, /<b id="ck-tile-toscan">3<\/b>/);
        assert.ok(!sb.__dbWrites.some((x) => /cardsVerified/.test(x.path)), 'three cards still to scan: no verified line');
    });

    test('D4 a multi-round event whose round is closed: Use card is refused with a sentence and nothing is written', async () => {
        const rec = individual();
        rec.eventModel = 'round-v1';   // tournament-engine ROUND_MODEL: a multi-round event
        rec.rounds = { r1: { name: 'Round 1', status: 'closed', createdAt: 1, courseData: CD, scoringGroups: rec.scoringGroups, scores: rec.scores } };
        delete rec.scores; delete rec.courseData;
        const sb = arrive(rec, { answer: G2_SCAN() });
        deskTab(sb);
        tap(sb, html(sb, 'cardcheck-wrap'), scanBtn('r1~g2'));
        await takePhoto(sb);
        assert.equal(mine(sb).length, 1, 'the check is stored (the round is the event\'s, it can be read)');
        assert.equal(mine(sb)[0].path, `tournaments/${CODE}/cardChecks/r1~g2`);
        const calls = spyCorrector(sb);
        const n = sb.__dbWrites.length;
        tap(sb, html(sb, 'cardcheck-wrap'), (t) => /ck-use/.test(t) && /data-issue="p05\|h7"/.test(t));
        assert.deepEqual(calls, []);
        assert.equal(sb.__dbWrites.length, n);
        assert.match(plain(html(sb, 'cardcheck-wrap')), /This round is not open\. Open it in Setup to use the card’s score\./);
    });

    test('D5 best ball, the paper card in another order: rows go by name, and Use card writes that golfer\'s own slot through correctTeamPlayerScore', async () => {
        const team = { name: 'Birdie Hunters', num: 3, players: ['Dana Ruiz', 'Lee Park', 'Kim Vo', 'Al Lopez'] };
        const scores = {};
        team.players.forEach((_, i) => PAR.forEach((__, h) => { scores[`team3_p${i}_h${h + 1}`] = sc(i, h + 1); }));
        const rec = { name: 'Starkey Classic', format: 'bestball', ownerUid: 'u-org', courseName: 'Papago Golf Course', courseData: CD,
            teams: { team3: team, team1: { name: 'Team 1', num: 1, players: ['Ana Diaz', 'Joe Fox'] } }, scores, createdAt: 1 };
        const answer = scanOf(team.players, (r) => { r[2].holes[4].score = 7; r[2].written_total = null; });
        answer.result.players.reverse();   // the card lists Al, Kim, Lee, Dana
        const sb = arrive(rec, { answer });
        deskTab(sb);
        assert.match(plain(html(sb, 'cardcheck-wrap')), /Birdie Hunters Dana Ruiz, Lee Park, Kim Vo, Al Lopez not scanned Scan card/);
        tap(sb, html(sb, 'cardcheck-wrap'), scanBtn('team3'));
        await takePhoto(sb);
        const body = JSON.parse(sb.__fetches[0].init.body);
        assert.deepEqual(body.round.players.map((p) => p.name), ['Dana Ruiz', 'Lee Park', 'Kim Vo', 'Al Lopez']);
        assert.match(plain(html(sb, 'cardcheck-wrap')), /Hole 5 · Kim Vo: card 7, app \d/);
        const calls = spyCorrector(sb);
        const n = sb.__dbWrites.length;
        tap(sb, html(sb, 'cardcheck-wrap'), (t) => /ck-use/.test(t) && /data-issue="p2\|h5"/.test(t));
        assert.deepEqual(calls, [['correctTeamPlayerScore', 3, 2, 5, 7, undefined]]);
        assert.deepEqual(sb.__dbWrites.slice(n).filter((w) => /\/scores\//.test(w.path)).map((w) => [w.path, w.value]), [[`tournaments/${CODE}/scores/team3_p2_h5`, 7]]);
    });

    test('D6 a scramble: one team row (the team\'s names sent as nicknames), Use card writes the team\'s hole through correctTeamScore', async () => {
        const team = { name: 'Birdie Hunters', num: 3, players: ['Dana Ruiz', 'Lee Park'] };
        const scores = {};
        PAR.forEach((_, h) => { scores[`team3_h${h + 1}`] = sc(0, h + 1); });
        const rec = { name: 'Starkey Scramble', format: 'scramble', ownerUid: 'u-org', courseName: 'Papago Golf Course', courseData: CD,
            teams: { team3: team }, scores, createdAt: 1 };
        const answer = scanOf(['Birdie Hunters'], (r) => { r[0].holes[0].score = 3; r[0].written_total = null; });
        const sb = arrive(rec, { answer });
        deskTab(sb);
        tap(sb, html(sb, 'cardcheck-wrap'), scanBtn('team3'));
        await takePhoto(sb);
        const body = JSON.parse(sb.__fetches[0].init.body);
        assert.deepEqual(body.round.players, [{ name: 'Birdie Hunters', nicknames: ['Dana Ruiz', 'Lee Park'] }]);
        const calls = spyCorrector(sb);
        const n = sb.__dbWrites.length;
        tap(sb, html(sb, 'cardcheck-wrap'), (t) => /ck-use/.test(t) && /data-issue="team\|h1"/.test(t));
        assert.deepEqual(calls, [['correctTeamScore', 3, 1, 3, undefined]]);
        assert.deepEqual(sb.__dbWrites.slice(n).filter((w) => /\/scores\//.test(w.path)).map((w) => [w.path, w.value]), [[`tournaments/${CODE}/scores/team3_h1`, 3]]);
    });
});

// ---- E. VERIFY CARDS AND THE VERIFIED LINE ----------------------------------
describe('E. Verify cards (the field\'s list) and "All N cards verified"', () => {
    test('E1 three cards verified and one with an open mismatch: Verify cards lists it; answering it writes cardsVerified { count, at, by } and the Desk and the recap say "All 4 cards verified at <time>"', async () => {
        const rec = individual();
        // the scan of every group, stored earlier today: g1, g3, g4 all match; g2 has Dana's 7th open
        const SC = require('./scan-compare.js');
        const players = (gi) => GROUPS[gi][2].map((n, i) => ({ key: 'p' + String(gi * 4 + i + 1).padStart(2, '0'), name: n }));
        const app = (gi) => { const o = {}; players(gi).forEach((p, i) => { o[p.key] = {}; PAR.forEach((_, h) => { o[p.key][h + 1] = sc(i, h + 1); }); }); return o; };
        const holes = PAR.map((_, i) => i + 1);
        rec.cardChecks = {};
        [0, 1, 2, 3].forEach((gi) => {
            const scan = scanOf(GROUPS[gi][2], gi === 1 ? (r) => { r[0].holes[6].score = 6; r[0].written_total = null; } : null).result;
            rec.cardChecks['g' + (gi + 1)] = SC.compareCard({ scan, players: players(gi), holes, app: app(gi), at: Date.now() - 60000 });
        });
        const sb = arrive(rec);
        deskTab(sb);
        let w = html(sb, 'cardcheck-wrap');
        assert.match(w, /<b id="ck-tile-verified">3<\/b>/);
        assert.match(w, /<b id="ck-tile-open">1<\/b><span>with mismatches<\/span>/);
        assert.match(plain(w), /Group 2 · H3 Dana Ruiz, Lee Park, Kim Vo, Al Lopez 1 to resolve Review Scan again/);
        tap(sb, w, (t) => /\bid="ck-review-open"/.test(t));
        w = html(sb, 'cardcheck-wrap');
        assert.match(plain(w), /^‹ Desk Verify cards 4 of 4 read · 3 of 4 cards match/);
        assert.match(plain(html(sb, 'cardcheck-wrap').slice(w.indexOf('ck-review-list'))), /Group 2 · Hole 7 · Dana Ruiz: card 6, app 5 Use card \(6\) Keep app \(5\)/);
        assert.ok(!/ck-photo-btn/.test(w), 'no Photo after a reload: the photo was never stored');
        const n = sb.__dbWrites.length;
        tap(sb, w, (t) => /ck-keep/.test(t) && /data-issue="p05\|h7"/.test(t));
        const ver = sb.__dbWrites.slice(n).filter((x) => /cardsVerified/.test(x.path));
        assert.equal(ver.length, 1);
        assert.equal(ver[0].path, `tournaments/${CODE}/cardsVerified`);
        assert.deepEqual(Object.keys(ver[0].value).sort(), ['at', 'by', 'count']);
        assert.equal(ver[0].value.count, 4);
        assert.equal(ver[0].value.by, 'organizer');
        assert.ok(Math.abs(ver[0].value.at - Date.now()) < 5000);
        assert.match(plain(html(sb, 'cardcheck-wrap')), /✓ All 4 cards verified at \d{1,2}:\d{2} (AM|PM) Shown on the Desk and the recap\./);
        tap(sb, html(sb, 'cardcheck-wrap'), (t) => /\bid="ck-back"/.test(t));
        assert.match(html(sb, 'cardcheck-wrap'), /<div class="ck-verified" id="ck-verified">✓ All 4 cards verified at \d{1,2}:\d{2} (AM|PM)<\/div>/);
        // the recap, as anyone opens it, with the record that now holds the line
        const rc = loadHtmlInlineScript(PAGE, [], { search: '?tourney=' + CODE + '&recap=1' });
        fire(rc, new RegExp('^tournaments/' + CODE + '$'), Object.assign(clone(rec), { cardsVerified: ver[0].value }));
        assert.match(el(rc, 'recap-verified').textContent, /^All 4 cards verified at \d{1,2}:\d{2} (AM|PM)$/);
        assert.equal(el(rc, 'recap-verified').style.display, 'block');
    });
    test('E2 the recap of an event never checked shows no verified line', () => {
        const rc = loadHtmlInlineScript(PAGE, [], { search: '?tourney=' + CODE + '&recap=1' });
        fire(rc, new RegExp('^tournaments/' + CODE + '$'), individual());
        assert.equal(el(rc, 'recap-verified').style.display, 'none');
        assert.equal(el(rc, 'recap-verified').textContent, '');
    });
});

// ---- R. THE RULES ------------------------------------------------------------
describe('R. the repo rules already give both keys to the owner alone', () => {
    test('R1 targaryen on database.rules.json: the owner may write cardChecks/<card> and cardsVerified; a stranger and an anonymous visitor may not', () => {
        const targaryen = require('targaryen');
        const rules = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'database.rules.json'), 'utf8'));
        const data = { tournaments: { [CODE]: { ownerUid: 'u-org', name: 'Starkey Classic' } } };
        const db = targaryen.database(rules, data).with({ debug: false });
        const owner = db.as({ uid: 'u-org', token: { email: 'org@example.com', firebase: { sign_in_provider: 'password' } } });
        const other = db.as({ uid: 'u-x', token: { email: 'x@example.com', firebase: { sign_in_provider: 'password' } } });
        const anon = db.as({ uid: 'anon', token: { firebase: { sign_in_provider: 'anonymous' } } });
        const check = { at: 1, holes: [1], rows: { p05: { name: 'Dana Ruiz', row: 1, how: 'exact', h: { h1: { status: 'match', card: 4, app: 4, conf: 0.97 } } } }, verdict: 'match' };
        const v = { count: 4, at: 1, by: 'organizer' };
        assert.equal(owner.write(`tournaments/${CODE}/cardChecks/g2`, check).allowed, true);
        assert.equal(owner.write(`tournaments/${CODE}/cardsVerified`, v).allowed, true);
        assert.equal(other.write(`tournaments/${CODE}/cardChecks/g2`, check).allowed, false);
        assert.equal(other.write(`tournaments/${CODE}/cardsVerified`, v).allowed, false);
        assert.equal(anon.write(`tournaments/${CODE}/cardsVerified`, v).allowed, false);
    });
});
