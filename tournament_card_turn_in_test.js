// ============================================================================
// CARD TURN-IN FROM A GOLFER'S PHONE (C, ADVISOR-20261118-1533, Manny's pick
// 2026-11-18): the group's scoring link scans the paper card and sends the read
// to the organizer; the Desk lists it under "Cards turned in" and APPROVES it
// into the board through the score corrector. Nothing reaches the leaderboard
// or the side games without Approve.
//
// HOW EACH TEST ARRIVES. The GOLFER: tournament-scorecard.html?tourney=STK26&
// group=g2, the page's OWN listener fired with the record, then TAPS - the
// onclick of the element a person touches, read from the markup the page
// rendered - and the CAMERA as the static file input's own onchange with a
// picked file. The ORGANIZER: tournament.html?tourney=STK26 signed in as the
// owner, the Desk tab tapped, the same way. No test names a render function
// the page defines. fetch is stood in for and answers BOTH functions in their
// live response shapes: /api/scorecard-scan (functions/api/_scan.js) and
// /api/card-turn-in (functions/api/_turnin.js); what the pages sent is kept.
//
// "THROUGH THE CORRECTOR". Approve must write by calling the page's own
// corrector (correctPlayerScore / correctTeamPlayerScore / correctTeamScore):
// the three globals are wrapped with a recorder that then calls the original,
// so the write still happens through the original code (the same device as
// tournament_card_check_test.js). An Approve that wrote the score path itself
// would leave the recorder empty: O3 goes red.
//
// WHAT mini-dom CANNOT PROVE, said plainly: innerHTML is a string (the grid is
// read as markup); no layout; the real camera, canvas and JPEG size are not
// exercised; the static input's click() is not a real camera. tools/card-turn-
// in-cold.js arrives cold in headless Chrome for those and takes the screenshots.
//
// BASELINE against pre-build main fc9680e7 (the two pages as they stand there, no
// scan-grid.js), this file copied there and run, the FINAL file:
//   16 tests, 1 pass / 15 fail / 0 cancelled (2026-11-18 17:1x, + G7 and P1 for saved photos, ADVISOR-1704:
//   18 tests, re-measured on fc9680e7 with the final file: 1 pass / 17 fail). The 1 is O5 (a visitor never asks
//   the function), true of a page with no turn-in at all. G1 and G5 are red there
//   too: they read #turnin-card, which the old page does not have.
//   On preview-card-turnin: 18 / 0.
// NEGATIVE CONTROLS, run 2026-11-18 on the FINAL pages (each copied to the scratchpad first,
// restored by cp from that copy, sha re-checked: RESTORED-OK d6837e043017ffd6 / 08843526906f7a81):
//   K1 Approve writes db.ref(tournaments/<code>/scores/..).set itself, not the corrector -> 15/1, O3 red
//   K2 the golfer's Send writes the card's scores to the record as well               -> 14/2, G3 + G4 red
//   K3 BOTH owner gates dropped (renderCardCheck's and turnInSync's canManage)         -> 15/1, O5 red
//   K3b turnInSync's gate alone dropped -> 16/0, INERT, as expected: renderCardCheck empties the
//       Desk for a visitor before it ever reaches turnInSync; the second gate is belt and braces
//   K4 the switch no longer gates the golfer's card                                   -> 15/1, G1 red
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const ORG = 'tournament.html', CARD = 'tournament-scorecard.html';
const ORG_HTML = fs.readFileSync(path.join(REPO_ROOT, ORG), 'utf8');
const CARD_HTML = fs.readFileSync(path.join(REPO_ROOT, CARD), 'utf8');
const CODE = 'STK26';
const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false, getIdToken: () => Promise.resolve('org-token') };
const clone = (o) => JSON.parse(JSON.stringify(o));
async function settle(n) { for (let i = 0; i < (n || 10); i++) await new Promise((r) => setImmediate(r)); }

const PAR = [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4];
const CD = PAR.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: ((i * 7) % 18) + 1 }));
const sc = (pi, h) => PAR[h - 1] + ((pi + h) % 3 === 0 ? 1 : 0) - ((pi * 5 + h) % 13 === 0 ? 1 : 0);
const GROUPS = [
    ['Group 1', 1, ['Ana Diaz', 'Joe Fox', 'Sam Ortiz', 'Mia Chen']],
    ['Group 2', 3, ['Dana Ruiz', 'Lee Park', 'Kim Vo', 'Al Lopez']],
    ['Group 3', 5, ['Ray Diaz', 'Jo Park', 'Tom Reyes', 'Eva Lin']],
    ['Group 4', 7, ['Ben Cruz', 'Liz Moore', 'Nick Hall', 'Rosa Vega']]
];
// An individual event: four groups of four; Group 2 kept score on PAPER (no scores in the app).
function record(opts) {
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
            if (gid !== 'g2') PAR.forEach((_, i) => { scores[`${pid}_h${i + 1}`] = sc(ni, i + 1); });
        });
    });
    const rec = { name: 'Starkey Classic', scoringModel: 'player-v1', format: 'individual', ownerUid: 'u-org',
        eventDate: '2026-11-22', courseName: 'Papago Golf Course', courseData: CD, startType: 'shotgun',
        players, scoringGroups: groups, scores, createdAt: 1 };
    if (opts.turnIn !== false) rec.cardTurnIn = true;
    return rec;
}
// The scanner reading Group 2's card, every digit as the fixture's sc().
function scanOf(names, edit) {
    const rows = names.map((n, ni) => {
        const holes = PAR.map((_, i) => ({ hole: i + 1, score: sc(ni, i + 1), confidence: 0.97 }));
        return { name: n, row_label_as_written: n, holes, written_out: null, written_in: null, written_total: holes.reduce((s, c) => s + c.score, 0) };
    });
    if (edit) edit(rows);
    return rows;
}
const scanAnswer = (rows) => ({ status: 'ok', model: 'gemini-2.5-flash', retried: false, paid: false, freeScansLeft: null, result: { players: rows, notes: '' }, validation: {} });
const NOW = 1763500000000;
const cardOf = (over) => Object.assign({ sk: 'g2', by: 'Dana', at: NOW, state: 'sent', decidedAt: 0, photo: true }, over || {});

// ---- the network stand-in: both functions, by URL and method ----------------
function wireFetch(sb, script) {
    sb.__fetches = [];
    sb.fetch = (url, init) => {
        const u = String(url), method = ((init && init.method) || 'GET').toUpperCase();
        let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) { body = null; }
        sb.__fetches.push({ url: u, method, init, body });
        let a = null;
        if (u.indexOf('/api/scorecard-scan') !== -1) a = script.scan;
        else if (u.indexOf('/api/card-turn-in') !== -1) {
            if (method === 'POST') a = body && body.action === 'send' ? (script.send || { status: 'ok', card: cardOf({ by: body.by || '', photo: !!body.photo }) })
                : { status: 'ok', card: cardOf({ state: body.action === 'approve' ? 'approved' : 'declined', decidedAt: NOW + 60000 }) };
            else if (/[?&]photo=1/.test(u)) a = script.photo || { status: 'ok', sk: 'g2', photo: 'UEhPVE9CWVRFUw==' };
            else if (/[?&]read=1/.test(u)) a = script.read || { status: 'ok', card: cardOf({ scan: { players: scanOf(GROUPS[1][2]), notes: '' } }) };
            else if (/[?&]sk=/.test(u)) a = script.status || { status: 'ok', card: cardOf() };
            else a = script.list || { status: 'ok', cards: [] };
        }
        if (typeof a === 'function') a = a(u, body);
        return Promise.resolve({ status: 200, json: () => Promise.resolve(clone(a)) });
    };
}
// The browser's image pieces: a picked file reads as a data URL, the image decodes at a phone's size, the canvas encodes.
function wireCamera(sb) {
    sb.FileReader = class { readAsDataURL(f) { this.result = 'data:image/jpeg;base64,' + f.b64; setImmediate(() => this.onload()); } };
    sb.Image = class { set src(v) { this.naturalWidth = 4032; this.naturalHeight = 3024; setImmediate(() => this.onload()); } };
    const make = sb.document.createElement.bind(sb.document);
    sb.document.createElement = (t) => {
        if (t !== 'canvas') return make(t);
        return { width: 0, height: 0, getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,' + 'QUJD'.repeat(50000) };
    };
}
function fire(sb, re, val) {
    const hs = sb.__dbHandlers.filter((h) => h.event === 'value' && re.test(h.path));
    assert.ok(hs.length > 0, 'no listener on ' + re);
    hs.forEach((h) => { try { h.cb({ val: () => clone(val), exists: () => val !== null && val !== undefined }); } catch (e) { if (!/querySelectorAll|content|scrollIntoView/.test(String(e.message))) throw e; } });
}
const el = (sb, id) => sb.document.getElementById(id);
const html = (sb, id) => String((el(sb, id) || {}).innerHTML || '');
const plain = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|’/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const unq = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
function tags(markup) { return markup.match(/<(button|a|input|span|label)\b[^>]*>/g) || []; }
function tap(sb, markup, pick, attr) {
    const tag = tags(markup).find(pick);
    assert.ok(tag, 'nothing to tap in that markup');
    const on = new RegExp('\\b' + (attr || 'onclick') + '="([^"]*)"').exec(tag);
    assert.ok(on, 'the tag has an ' + (attr || 'onclick'));
    const dataset = {};
    tag.replace(/\bdata-([a-z]+)="([^"]*)"/g, (_, k, v) => { dataset[k] = unq(v); });
    sb.__tapEl = { dataset, checked: !/\schecked(?=[\s>])/.test(tag) };   // a checkbox tap flips it (the attribute, not this.checked in the handler)
    vm.runInContext('(function () { ' + unq(on[1]) + ' }).call(__tapEl)', sb);
}
async function camera(sb, inputId, HTML) {
    const tag = (HTML.match(new RegExp('<input\\b[^>]*\\bid="' + inputId + '"[^>]*>')) || [])[0];
    assert.ok(tag, 'the file input is static markup');
    const on = /\bonchange="([^"]*)"/.exec(tag)[1];
    sb.__fileEl = { files: [{ name: 'card.jpg', type: 'image/jpeg', b64: 'UEhPVE8=' }], value: 'C:\\fakepath\\card.jpg' };
    vm.runInContext('(function () { ' + unq(on) + ' }).call(__fileEl)', sb);
    await settle(16);
}
const scoreWrites = (sb) => sb.__dbWrites.filter((w) => /\/scores(\/|$)/.test(w.path) || (w.op === 'update' && Object.keys(w.value || {}).some((k) => /\/scores\//.test(k))));
const checkWrites = (sb) => sb.__dbWrites.filter((w) => /\/cardChecks(\/|$)/.test(w.path));
const turnInCalls = (sb) => sb.__fetches.filter((f) => f.url.indexOf('/api/card-turn-in') !== -1);
const scanCalls = (sb) => sb.__fetches.filter((f) => f.url.indexOf('/api/scorecard-scan') !== -1);

// ---- THE GOLFER --------------------------------------------------------------
function golfer(rec, opts) {
    opts = opts || {};
    const sb = loadHtmlInlineScript(CARD, [], { search: '?tourney=' + CODE + '&group=g2' + (opts.watch ? '&watch=1' : ''), localStorage: true });
    // The anonymous session a scoring link runs as (auth-boot on the consumer pages); the
    // stub's own user has no getIdToken, and the token is what the two functions are sent.
    sb.__auth.setUser({ uid: 'anon-golfer', isAnonymous: true, email: null, getIdToken: () => Promise.resolve('golfer-token') });
    wireFetch(sb, opts.script || { scan: scanAnswer(scanOf(GROUPS[1][2])) });
    wireCamera(sb);
    fire(sb, new RegExp('^tournaments/' + CODE + '$'), rec);
    return sb;
}
describe('G. the golfer: Turn in our card on the group\'s scoring link', () => {
    test('G1 the organizer\'s switch off (an event made before today): no card on the page, no function asked, nothing written', () => {
        const sb = golfer(record({ turnIn: false }));
        assert.equal(el(sb, 'turnin-card').style.display, 'none');
        assert.equal(html(sb, 'turnin-card'), '');
        assert.equal(sb.__fetches.length, 0);
        assert.equal(sb.__dbWrites.length, 0);
    });
    test('G2 the switch on: the card offers "Turn in our card"; the camera -> ONE signed scan request with this group\'s round and event:{code}; the check screen draws Group 2\'s 72 digits, names matched, totals matched, Send - and writes NO score', async () => {
        const sb = golfer(record());
        assert.equal(el(sb, 'turnin-card').style.display, 'block');
        let w = html(sb, 'turnin-card');
        assert.match(plain(w), /Turn in our card/);
        assert.match(plain(w), /Kept score on paper\? After your last hole, photograph the card here\. The organizer checks it before it goes on the leaderboard\./);
        assert.ok(/id="turnin-start"[^>]*onclick="turnInStart\('camera'\)"[^>]*>📷 Take a photo</.test(w), 'Take a photo');
        assert.ok(/id="turnin-photos"[^>]*onclick="turnInStart\('photos'\)"[^>]*>Choose from Photos</.test(w), 'Choose from Photos (ADVISOR-20261118-1704)');
        tap(sb, w, (t) => /id="turnin-start"/.test(t));
        await camera(sb, 'turnin-file', CARD_HTML);
        const scans = scanCalls(sb);
        assert.equal(scans.length, 1, 'one scan request');
        const req = scans[0];
        assert.equal(req.method, 'POST');
        assert.match(req.init.headers.Authorization, /^Bearer /);
        assert.equal(req.body.image.mimeType, 'image/jpeg');
        assert.ok(!/^data:/.test(req.body.image.data), 'bare base64');
        assert.deepEqual(req.body.event, { code: CODE });
        assert.equal(req.body.round.holes, 18);
        assert.deepEqual(req.body.round.players.map((p) => p.name), GROUPS[1][2]);
        assert.equal(req.body.round.par[1], 4);
        assert.equal(req.body.round.strokeIndex[1], 1);
        w = html(sb, 'turnin-card');
        assert.match(plain(w), /Group 2 · check the card/);
        assert.equal((w.match(/<td class="ck-m">/g) || []).length, 72, 'every digit the card has and the app does not: dotted ink');
        assert.equal((w.match(/class="ck-x"|class="ck-u"/g) || []).length, 0);
        assert.equal((w.match(/<table class="ck-grid">/g) || []).length, 2, 'two nines');
        assert.match(plain(w), /✓ Names matched to Group 2/);
        assert.match(plain(w), /✓ Totals match the card/);
        assert.ok(/id="turnin-send"[^>]*onclick="turnInSend\(\)"/.test(w), 'Send to the organizer');
        assert.ok(/id="turnin-again"[^>]*onclick="turnInAgain\(\)"/.test(w), 'Scan again');
        assert.match(plain(w), /Nothing goes on the leaderboard until the organizer approves it\. Keep the paper card\./);
        assert.equal(scoreWrites(sb).length, 0, 'the golfer\'s page writes no score for a turn-in');
        assert.equal(turnInCalls(sb).length, 0, 'nothing sent yet');
    });
    test('G3 Send: ONE POST to /api/card-turn-in with action send, the code, sk g2, the scanner\'s read, the sender and the photo; then "Waiting for the organizer"; still NO score written; the state remembered on this phone', async () => {
        const sb = golfer(record());
        tap(sb, html(sb, 'turnin-card'), (t) => /id="turnin-start"/.test(t));
        await camera(sb, 'turnin-file', CARD_HTML);
        let w = html(sb, 'turnin-card');
        tap(sb, w, (t) => /ti-chip/.test(t) && /data-name="Dana Ruiz"/.test(t));
        w = html(sb, 'turnin-card');
        assert.ok(/ti-chip on"[^>]*data-name="Dana Ruiz"/.test(w), 'Dana picked as the sender');
        tap(sb, w, (t) => /id="turnin-send"/.test(t));
        await settle(16);
        const sends = turnInCalls(sb).filter((f) => f.method === 'POST');
        assert.equal(sends.length, 1, 'one send');
        const b = sends[0].body;
        assert.equal(b.action, 'send');
        assert.equal(b.code, CODE);
        assert.equal(b.sk, 'g2');
        assert.equal(b.by, 'Dana Ruiz');
        assert.equal(b.scan.players.length, 4);
        assert.equal(b.scan.players[0].holes.length, 18);
        assert.ok(typeof b.photo === 'string' && b.photo.length > 1000 && !/^data:/.test(b.photo), 'the JPEG, bare base64');
        assert.match(sends[0].init.headers.Authorization, /^Bearer /);
        w = html(sb, 'turnin-card');
        assert.match(plain(w), /CARD SENT/);
        assert.match(plain(w), /Waiting for the organizer/);
        assert.match(plain(w), /Group 2 card · sent by Dana/);
        assert.match(plain(w), /Waiting for OK/);
        assert.match(plain(w), /Keep the paper card until you see it on the leaderboard\./);
        assert.equal(scoreWrites(sb).length, 0, 'no score written by the golfer');
        assert.equal(sb.__dbWrites.length, 0, 'nothing written to the record at all');
        assert.equal(sb.localStorage.getItem('hp-turnin:STK26:g2') !== null, true, 'remembered for a reload');
        assert.equal(JSON.parse(sb.localStorage.getItem('hp-turnin:STK26:g2')).state, 'sent');
    });
    test('G4 the organizer approves: the card asks the function for its state and reads "On the leaderboard"; declined reads "Please bring the card to the desk"', async () => {
        for (const state of ['approved', 'declined']) {
            const sb = golfer(record(), { script: { scan: scanAnswer(scanOf(GROUPS[1][2])), status: { status: 'ok', card: cardOf({ state, decidedAt: NOW + 60000 }) } } });
            tap(sb, html(sb, 'turnin-card'), (t) => /id="turnin-start"/.test(t));
            await camera(sb, 'turnin-file', CARD_HTML);
            tap(sb, html(sb, 'turnin-card'), (t) => /id="turnin-send"/.test(t));
            await settle(20);
            const polls = turnInCalls(sb).filter((f) => f.method === 'GET');
            assert.equal(polls.length, 1, 'one state read right after the send');
            assert.match(polls[0].url, /\/api\/card-turn-in\?code=STK26&sk=g2$/);
            const w = plain(html(sb, 'turnin-card'));
            if (state === 'approved') { assert.match(w, /CARD APPROVED/); assert.match(w, /On the leaderboard/); assert.match(w, /Leaderboard/); }
            else { assert.match(w, /CARD NOT USED/); assert.match(w, /Please bring the card to the desk/); assert.match(w, /Scan it again/); }
            assert.equal(scoreWrites(sb).length, 0);
        }
    });
    test('G5 never on the watch link; a scanner refusal is its own sentence and nothing is sent', async () => {
        const watch = golfer(record(), { watch: true });
        assert.equal(el(watch, 'turnin-card').style.display, 'none');
        assert.equal(watch.__fetches.length, 0);
        const sb = golfer(record(), { script: { scan: { status: 'refused', reason: 'daily_limit' } } });
        tap(sb, html(sb, 'turnin-card'), (t) => /id="turnin-start"/.test(t));
        await camera(sb, 'turnin-file', CARD_HTML);
        const w = plain(html(sb, 'turnin-card'));
        assert.match(w, /The scanner has reached today's limit for this event\. Hand the card in at the desk\./);
        assert.match(w, /Turn in our card/, 'back to the button');
        assert.equal(turnInCalls(sb).length, 0);
        assert.equal(scoreWrites(sb).length, 0);
    });
    test('G7 saved photos (ADVISOR-20261118-1704): the second input has no capture attribute and takes two; two picked photos become ONE scan request with one JPEG; the same check screen follows', async () => {
        assert.match(CARD_HTML, /<input type="file" id="turnin-pick" accept="image\/&#42;" multiple style="display:none;" onchange="turnInPicked\(this\)">/);
        assert.ok(!/id="turnin-pick"[^>]*capture/.test(CARD_HTML), 'no capture: the phone offers its photo library');
        const sb = golfer(record());
        tap(sb, html(sb, 'turnin-card'), (t) => /id="turnin-photos"/.test(t));
        const on = /\bonchange="([^"]*)"/.exec((CARD_HTML.match(/<input\b[^>]*\bid="turnin-pick"[^>]*>/) || [])[0])[1];
        sb.__fileEl = { files: [{ name: 'front.jpg', type: 'image/jpeg', b64: 'RlJPTlQ=' }, { name: 'back.jpg', type: 'image/jpeg', b64: 'QkFDSw==' }, { name: 'third.jpg', type: 'image/jpeg', b64: 'WA==' }], value: '' };
        vm.runInContext('(function () { ' + unq(on) + ' }).call(__fileEl)', sb);
        await settle(20);
        assert.equal(scanCalls(sb).length, 1, 'one scan for the two photos');
        assert.equal(scanCalls(sb)[0].body.image.mimeType, 'image/jpeg');
        assert.match(plain(html(sb, 'turnin-card')), /Group 2 · check the card/);
        assert.equal(scoreWrites(sb).length, 0);
    });
    test('G6 a doubtful card: a row the scanner could not name and a low-confidence digit are said in plain words; the golfer can still send and the organizer decides', async () => {
        const rows = scanOf(GROUPS[1][2], (r) => { r[3].name = 'UNKNOWN: Somebody'; r[3].row_label_as_written = 'Somebody'; r[0].holes[6].confidence = 0.4; r[1].written_total += 2; });
        const sb = golfer(record(), { script: { scan: scanAnswer(rows) } });
        tap(sb, html(sb, 'turnin-card'), (t) => /id="turnin-start"/.test(t));
        await camera(sb, 'turnin-file', CARD_HTML);
        const w = plain(html(sb, 'turnin-card'));
        assert.match(w, /3 of 4 names matched to Group 2 · 1 row on the card not matched\. The organizer sorts out the rest\./);
        assert.match(w, /Lee: the total written on the card does not match the holes\. The organizer decides\./);
        assert.match(w, /1 number the scanner was not sure about\. The organizer checks it against the photo\./);
        assert.ok(/id="turnin-send"/.test(html(sb, 'turnin-card')), 'Send is still offered');
    });
});

// ---- THE ORGANIZER -----------------------------------------------------------
function organizer(rec, opts) {
    opts = opts || {};
    const sb = loadHtmlInlineScript(ORG, [], { search: '?tourney=' + CODE });
    if (opts.user !== null) sb.__auth.setUser(opts.user || OWNER);
    wireFetch(sb, opts.script || {});
    fire(sb, new RegExp('^tournaments/' + CODE + '$'), rec);
    return sb;
}
const deskTab = (sb) => tap(sb, ORG_HTML, (t) => /\bid="tab-btn-desk"/.test(t));
function spyCorrector(sb) {
    const calls = [];
    ['correctPlayerScore', 'correctTeamPlayerScore', 'correctTeamScore'].forEach((fn) => {
        const orig = sb[fn];
        assert.equal(typeof orig, 'function', fn + ' is the page\'s corrector');
        sb[fn] = function () { calls.push([fn].concat([].slice.call(arguments))); return orig.apply(this, arguments); };
    });
    return calls;
}
describe('O. the organizer: the switch and the Cards turned in queue on the Desk', () => {
    test('O1 switch off: the Desk shows the switch, unchecked, no queue, no function asked; the tap writes tournaments/<code>/cardTurnIn = true and the queue appears, "No card has been turned in yet"', async () => {
        const sb = organizer(record({ turnIn: false }));
        deskTab(sb);
        await settle();
        let w = html(sb, 'cardcheck-wrap');
        assert.ok(/id="ti-switch-box"(?![^>]* checked)[^>]*onchange="turnInSetSwitch\(this\.checked\)"/.test(w), 'the switch, off');
        assert.match(plain(w), /Card turn-in from a golfer's phone Off\. Turn it on and any golfer on a group's scoring link can photograph the paper card after the last hole and send it to this Desk for your OK\./);
        assert.ok(!/id="ti-queue"/.test(w), 'no queue while off');
        assert.equal(turnInCalls(sb).length, 0, 'the function is not asked while the switch is off');
        tap(sb, w, (t) => /id="ti-switch-box"/.test(t), 'onchange');
        await settle();
        const sw = sb.__dbWrites.filter((x) => /\/cardTurnIn$/.test(x.path));
        assert.deepEqual(sw.map((x) => [x.op, x.value]), [['set', true]]);
        assert.equal(scoreWrites(sb).length, 0);
        w = html(sb, 'cardcheck-wrap');
        assert.ok(/id="ti-switch-box"[^>]*\bchecked\b/.test(w), 'the switch reads on');
        assert.match(plain(w), /On\. Any golfer on a group's scoring link can photograph the paper card after the last hole and send it here\. Nothing reaches the leaderboard until you approve it\./);
        const lists = turnInCalls(sb).filter((f) => f.method === 'GET');
        assert.equal(lists.length, 1, 'one list call');
        assert.match(lists[0].url, /\/api\/card-turn-in\?code=STK26$/);
        assert.match(lists[0].init.headers.Authorization, /^Bearer org-token$/);
        assert.match(plain(w), /Cards turned in/);
        assert.match(plain(w), /No card has been turned in yet\./);
    });
    test('O2 a card waiting: the Desk lists "Group 2 · sent by Dana" as New, fetches its read, and Open draws the grid (72 to fill), the totals line, Approve · 72 holes, See photo, Decline', async () => {
        const sb = organizer(record(), { script: { list: { status: 'ok', cards: [cardOf()] } } });
        deskTab(sb);
        await settle(16);
        const gets = turnInCalls(sb).filter((f) => f.method === 'GET');
        assert.deepEqual(gets.map((g) => g.url.replace(/^.*\?/, '')), ['code=STK26', 'code=STK26&sk=g2&read=1'], 'the list, then the read of the new card');
        let w = html(sb, 'cardcheck-wrap');
        assert.match(plain(w), /Cards turned in · 1 waiting/);
        assert.match(plain(w), /Group 2 sent by Dana/);
        assert.ok(/ti-pill ti-new">New</.test(w));
        assert.ok(!/id="ti-grid"/.test(w), 'closed until Open');
        tap(sb, w, (t) => /ti-open/.test(t) && /data-sk="g2"/.test(t));
        await settle();
        w = html(sb, 'cardcheck-wrap');
        assert.ok(/id="ti-grid"/.test(w), 'the grid');
        assert.equal((w.match(/<td class="ck-m">/g) || []).length, 72);
        assert.match(plain(w), /72 holes to fill from the card\. Totals match the card\./);
        assert.ok(/ti-approve"[^>]*data-sk="g2"[^>]*onclick="turnInApprove\(this\.dataset\.sk\)"[^>]*>Approve · 72 holes to the board</.test(w));
        assert.ok(/ti-photo-btn"[^>]*data-sk="g2"/.test(w), 'See photo (the card came with one)');
        assert.ok(/ti-decline"[^>]*data-sk="g2"/.test(w));
        assert.equal(scoreWrites(sb).length, 0, 'opening writes nothing');
        assert.equal(checkWrites(sb).length, 0);
    });
    test('O3 Approve: 72 scores through the corrector, the check stored at cardChecks/g2, ONE POST approve, the row reads On the leaderboard, the Desk says the card is verified', async () => {
        const sb = organizer(record(), { script: { list: { status: 'ok', cards: [cardOf()] } } });
        const calls = spyCorrector(sb);
        deskTab(sb);
        await settle(16);
        tap(sb, html(sb, 'cardcheck-wrap'), (t) => /ti-open/.test(t) && /data-sk="g2"/.test(t));
        await settle();
        tap(sb, html(sb, 'cardcheck-wrap'), (t) => /ti-approve/.test(t));
        await settle(16);
        assert.equal(calls.length, 72, '72 holes through the corrector');
        assert.ok(calls.every((c) => c[0] === 'correctPlayerScore' && c[1] === 'g2'), 'each to this group, through correctPlayerScore');
        const dana = calls.filter((c) => c[2] === 'p05');
        assert.equal(dana.length, 18);
        assert.equal(dana.find((c) => c[3] === 1)[4], sc(0, 1), 'Dana\'s 1st: the card\'s digit');
        assert.equal(scoreWrites(sb).length, 72, '72 score writes reached the record');
        const checks = checkWrites(sb);
        assert.ok(checks.length >= 1 && checks.every((c) => c.path === `tournaments/${CODE}/cardChecks/g2`), 'the check stored under the card');
        const last = checks[checks.length - 1].value;
        assert.equal(Object.keys(last.rows).length, 4);
        assert.ok(!JSON.stringify(last).includes('base64'), 'no photo stored');
        const posts = turnInCalls(sb).filter((f) => f.method === 'POST');
        assert.deepEqual(posts.map((p) => p.body), [{ action: 'approve', code: CODE, sk: 'g2' }]);
        const w = html(sb, 'cardcheck-wrap');
        assert.ok(/ti-pill ti-ok">On the leaderboard</.test(w));
        assert.match(plain(w), /Group 2: the card is on the board and verified\./);
        assert.ok(!/ti-approve/.test(w), 'no second Approve');
    });
    test('O4 Decline: ONE POST decline, no score written, no check stored, the row reads Declined', async () => {
        const sb = organizer(record(), { script: { list: { status: 'ok', cards: [cardOf()] } } });
        const calls = spyCorrector(sb);
        deskTab(sb);
        await settle(16);
        tap(sb, html(sb, 'cardcheck-wrap'), (t) => /ti-open/.test(t) && /data-sk="g2"/.test(t));
        await settle();
        tap(sb, html(sb, 'cardcheck-wrap'), (t) => /ti-decline/.test(t));
        await settle(16);
        assert.equal(calls.length, 0);
        assert.equal(scoreWrites(sb).length, 0);
        assert.equal(checkWrites(sb).length, 0);
        const posts = turnInCalls(sb).filter((f) => f.method === 'POST');
        assert.deepEqual(posts.map((p) => p.body), [{ action: 'decline', code: CODE, sk: 'g2' }]);
        assert.ok(/ti-pill ti-no">Declined</.test(html(sb, 'cardcheck-wrap')));
    });
    test('O5 a visitor (not the owner), the switch on and a card waiting: the Desk is not theirs - the function is never asked and nothing is drawn', async () => {
        const sb = organizer(record(), { user: { uid: 'u-else', email: 'else@example.com', isAnonymous: false, getIdToken: () => Promise.resolve('else-token') }, script: { list: { status: 'ok', cards: [cardOf()] } } });
        await settle();
        assert.equal(turnInCalls(sb).length, 0);
        assert.equal(html(sb, 'cardcheck-wrap'), '');
        const anon = organizer(record(), { user: { uid: 'anon-1', isAnonymous: true, email: null }, script: { list: { status: 'ok', cards: [cardOf()] } } });
        await settle();
        assert.equal(turnInCalls(anon).length, 0);
    });
    test('O6 See photo fetches the JPEG once, shows it beside the grid, and never writes it anywhere', async () => {
        const sb = organizer(record(), { script: { list: { status: 'ok', cards: [cardOf()] } } });
        deskTab(sb);
        await settle(16);
        tap(sb, html(sb, 'cardcheck-wrap'), (t) => /ti-open/.test(t) && /data-sk="g2"/.test(t));
        await settle();
        tap(sb, html(sb, 'cardcheck-wrap'), (t) => /ti-photo-btn/.test(t));
        await settle();
        const photos = turnInCalls(sb).filter((f) => /photo=1/.test(f.url));
        assert.equal(photos.length, 1);
        let w = html(sb, 'cardcheck-wrap');
        assert.ok(/id="ti-photo"[^>]*>\s*<img src="data:image\/jpeg;base64,UEhPVE9CWVRFUw=="/.test(w), 'the photo on screen');
        assert.ok(/ti-photo-btn"[^>]*>Hide photo</.test(w));
        tap(sb, w, (t) => /ti-photo-btn/.test(t));
        await settle();
        assert.equal(turnInCalls(sb).filter((f) => /photo=1/.test(f.url)).length, 1, 'not fetched twice');
        assert.ok(!/id="ti-photo"/.test(html(sb, 'cardcheck-wrap')));
        assert.ok(!JSON.stringify(sb.__dbWrites).includes('base64'), 'no write carries the photo');
    });
    test('O7 a multi-round event whose round is closed: Approve is refused with a sentence, nothing written, no POST', async () => {
        const rec = record();
        const r1 = { name: 'Saturday', status: 'closed', courseData: CD, scoringGroups: rec.scoringGroups, scores: rec.scores, createdAt: 1 };
        const multi = Object.assign({}, rec, { eventModel: 'round-v1', rounds: { r1 } });   // tournament-engine ROUND_MODEL (as D4 of the card check guard)
        delete multi.scores; delete multi.courseData;
        const sb = organizer(multi, { script: { list: { status: 'ok', cards: [cardOf({ sk: 'r1~g2' })] }, read: { status: 'ok', card: cardOf({ sk: 'r1~g2', scan: { players: scanOf(GROUPS[1][2]), notes: '' } }) } } });
        const calls = spyCorrector(sb);
        deskTab(sb);
        await settle(16);
        let w = html(sb, 'cardcheck-wrap');
        assert.match(plain(w), /Group 2 sent by Dana/);
        tap(sb, w, (t) => /ti-open/.test(t) && /data-sk="r1~g2"/.test(t));
        await settle();
        tap(sb, html(sb, 'cardcheck-wrap'), (t) => /ti-approve/.test(t));
        await settle(16);
        assert.equal(calls.length, 0);
        assert.equal(scoreWrites(sb).length, 0);
        assert.equal(checkWrites(sb).length, 0);
        assert.equal(turnInCalls(sb).filter((f) => f.method === 'POST').length, 0);
        assert.match(plain(html(sb, 'cardcheck-wrap')), /This round is not open\. Open it in Setup to approve the card\./);
    });
});

describe('P. the organizer scans from saved photos too', () => {
    test('P1 every not-scanned row offers Scan card and From Photos; From Photos opens the input with no capture attribute; a picked photo is read by the same scanner and stored as that card\'s check', async () => {
        assert.match(ORG_HTML, /<input type="file" id="cardcheck-pick" accept="image\/&#42;" multiple style="display:none;" onchange="cardCheckPicked\(this\)">/);
        assert.ok(!/id="cardcheck-pick"[^>]*capture/.test(ORG_HTML));
        const sb = organizer(record({ turnIn: false }), { script: { scan: scanAnswer(scanOf(GROUPS[1][2])) } });
        wireCamera(sb);
        deskTab(sb);
        await settle();
        const w = html(sb, 'cardcheck-wrap');
        assert.equal((w.match(/class="btn-outline ck-pick"/g) || []).length, 4, 'one per group');
        assert.ok(/ck-pick" data-sk="g2" onclick="cardCheckScan\(this\.dataset\.sk, 'photos'\)">From Photos</.test(w));
        tap(sb, w, (t) => /ck-pick/.test(t) && /data-sk="g2"/.test(t));
        await camera(sb, 'cardcheck-pick', ORG_HTML);
        assert.equal(scanCalls(sb).length, 1);
        assert.equal(checkWrites(sb).length, 1);
        assert.equal(checkWrites(sb)[0].path, 'tournaments/STK26/cardChecks/g2');
        assert.equal(scoreWrites(sb).length, 0, 'a scan writes no score until Use the whole card');
    });
});

describe('S. the pieces every arrival relies on', () => {
    test('S1 both pages load scan-compare.js and scan-grid.js; the Desk\'s grid comes from scan-grid.js alone; the scorecard page carries the static turn-in input with the camera attributes', () => {
        for (const page of [ORG_HTML, CARD_HTML]) {
            assert.match(page, /<script src="scan-compare\.js"><\/script>/);
            assert.match(page, /<script src="scan-grid\.js"><\/script>/);
        }
        const fnAt = ORG_HTML.indexOf('function cardCheckGridHtml(c)');
        const fn = ORG_HTML.slice(fnAt, ORG_HTML.indexOf('\n    function ', fnAt + 30));
        assert.ok(fnAt > 0 && /ScanGrid\.gridHtml\(/.test(fn), 'the Desk delegates to scan-grid.js');
        assert.ok(!/<table class="ck-grid">/.test(fn), 'and draws no table of its own');
        assert.match(CARD_HTML, /<input type="file" id="turnin-file" accept="image\/&#42;" capture="environment" style="display:none;" onchange="turnInPicked\(this\)">/);
        const sync = fs.readFileSync(path.join(REPO_ROOT, 'sync-mobile-web.js'), 'utf8');
        assert.match(sync, /'scan-grid\.js'/, 'scan-grid.js is in the tournament shell');
        const sw = fs.readFileSync(path.join(REPO_ROOT, 'sw.js'), 'utf8');
        assert.match(sw, /'\.\/scan-grid\.js'/, 'and precached');
        assert.match(sw, /const CACHE_VERSION = 'golfapp-v423-2\.0';/, 'the cache moved: both pages are shell files');
    });
    test('S2 no money, no cash, no competitor words on either side of the turn-in; under par red only (the ring classes come from one place)', () => {
        const SG = require(path.join(REPO_ROOT, 'scan-grid.js'));
        const slice = (src, from, to) => { const i = src.indexOf(from); const j = src.indexOf(to, i + 10); assert.ok(i > 0 && j > i, from); return src.slice(i, j); };
        const org = slice(ORG_HTML, '// ---- CARDS TURNED IN (C,', '// ---- THE REGISTRATION DESK');
        const card = slice(CARD_HTML, '// ---- TURN IN OUR CARD (C,', "// ---- E1a: THE ORGANIZER'S NOTES");
        for (const s of [org, card]) {
            assert.ok(/Approve|Send to the organizer/.test(s), 'positive: the block is the one meant');
            assert.ok(!/\$\s?\d|\b(bet|bets|wager|pot|cash|venmo|paypal|prize)\b/i.test(s), 'no money words');
            assert.ok(!/18birdies|golfshot|hole19|thegrint|swingu/i.test(s));
            assert.ok(!/green/i.test(s.replace(/brand-green|var\(--green\)/g, '')), 'no green/red score coding words');
        }
        assert.equal(SG.mark(3, 4), ' birdie'); assert.equal(SG.mark(2, 4), ' eagle'); assert.equal(SG.mark(5, 4), ' bogey'); assert.equal(SG.mark(6, 4), ' double'); assert.equal(SG.mark(4, 4), '');
        assert.equal(SG.mark(null, 4), '');
    });
    test('S3 the function never writes a score: functions/api/_turnin.js has no database write and no score path', () => {
        const src = fs.readFileSync(path.join(REPO_ROOT, 'functions', 'api', '_turnin.js'), 'utf8');
        assert.ok(/kv\.put\(/.test(src), 'positive: it stores in KV');
        assert.ok(!/method:\s*['"](PUT|PATCH|POST|DELETE)['"]/.test(src));
        assert.ok(!/\/scores\//.test(src));
    });
});
