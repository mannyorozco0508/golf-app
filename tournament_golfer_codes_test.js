// ============================================================================
// GOLFER CODES, layout A "Codes on the Desk" (Manny's pick 2026-11-19/20;
// mockup golfer-codes option A). Individual events only.
//
//   Desk      a code per golfer (6 characters, A-Z and 2-9 without 0/O/1/I,
//             unique in the event), made on first need and written by the
//             owner to tournamentKeys/<code>/c/<pid>; a chip ("Not used yet" /
//             "Opened <time>" from joins/<group>/<pid> / "Reissued <time>");
//             Text it (an sms: link carrying the personal link, the link also
//             shown as text); Reissue (one write, a new code); Print code sheet.
//   Golfer    the personal link = the group's watch link + &me=<pid>&c=<CODE>:
//             "Hi <first name>", the That's me join written once, nothing
//             written to tournamentKeys; once results are posted, a door to
//             My results carrying the code.
//   After     My results opened by that link, results posted, the 58A offer
//             on: the first-year price from site-pricing.js (eventOffer) beside
//             the regular yearly price (pro.yearly). tournament.html types no
//             price.
//
// HOW EACH TEST ARRIVES. Through the URL a person opens: the organizer's
// ?tourney=CODE signed in as the owner, the golfer's personal link, the My
// results link the card hands out. The page's OWN listeners are fired with a
// record (and, for the owner, tournamentKeys); every action is a TAP - the
// onclick text of the element a person touches, read from the markup the page
// rendered, run with `this` bound. No test names a page function. The first
// test of each surface is its DEFAULT (nothing touched but the arrival).
//
// WHAT mini-dom CANNOT PROVE: innerHTML is a string, so rendered markup is
// read as markup; there is no layout or CSS (a row can be "rendered" and
// 0x0); sms: does nothing here. The 390 px look, real taps and innerText were
// checked in headless Chrome by tools/golfer-codes-check.js (cold arrival).
// The rules are not in this file: that the owner may write tournamentKeys/<c>/c
// and anyone may write joins/<entry>/<pid> = { name, at } is the live rules as
// the brief states them, not re-proved here.
//
// BASELINE (CLAUDE.md count rule; FINAL file, FINAL run): against main
// 3eb7bf77 (tournament.html sha256 6c47220d6b0eb086..., the pre-build
// tournament.html, tournament-scorecard.html, site-pricing.js,
// hardpan-home.html and see-it.html written into the worktree by `git show`,
// the built ones copied back from the scratchpad and checked by sha):
// 15 tests - 4 pass / 11 fail (4 + 11 = 15). The 4 that pass are the
// default-state guards that must STAY green: A6 (a team event shows no
// codes), A7 (a stranger / no keys yet: no code), B4 (an &me= that names
// nobody on the card, and a team link: the watch card as before) and C3 (no
// offer without posted results, the link's code, 58A, the slot, or on a team
// event).
// After the build (preview-golfer-codes, tournament.html sha256
// 065e76d5d345ae56...): 15 tests - 15 pass / 0 fail.
//
// NEGATIVE CONTROLS (each a mutation of the built file, saved to the
// scratchpad first and put back by cp, sha printed beside RESTORED-OK),
// measured on the final file (tournament.html 065e76d5...): pass / fail of the 15
//   1 ensureGolferCodes never writes (return at its top)      14 / 1  A1
//   2 the code alphabet allows I/O/0/1                         14 / 1  A1
//     (A3 also goes red when the random new code happens to hold one of
//     them: 13 / 2 on the first measurement, 14 / 1 on the final one)
//   3 Reissue writes the SAME code                             14 / 1  A3
//   4 the personal link drops &me=                             13 / 2  A4 A5
//   5 the card's auto That's me removed                        13 / 2  B1 B2
//   6 the offer ignores the 58A switch                         14 / 1  C3
//   7 the offer shows a typed first-year price, not the slot   13 / 2  C1 C3
//   8 the codes card not gated on an individual event          15 / 0  INERT,
//     and harmless: a team record carries no players node, so the card has
//     no rows and draws nothing either way. A6 guards the screen, not the gate.
//   9 the codes card not gated on tournamentKeys having arrived 14 / 1  A7
//     (it would mint fresh codes over codes it had not read yet)
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { decodeEscapes } = require('./helpers/decode-escapes.js');

const CARD = 'tournament-scorecard.html';
const PAGE = 'tournament.html';
const HTML = fs.readFileSync(path.join(REPO_ROOT, PAGE), 'utf8');
const CODE = 'STK';
const ORGANIZER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const clone = (o) => JSON.parse(JSON.stringify(o));
const TS = { '.sv': 'timestamp' };
const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const GROUPS = [['Ana Diaz', 'Joe Fox', 'Sam Ortiz', 'Mia Chen'], ['Tom Reyes', 'Eva Lin', 'Ben Cruz', 'Liz Moore'],
    ['Dana Ruiz', 'Lee Park', 'Kim Vo', 'Ray Diaz'], ['Matt Cole', 'Amy Shaw', 'Dan Ito', 'Pat Webb']];
const PIDS = [];
function groupEvent(extra) {
    const players = {}, groups = {};
    PIDS.length = 0;
    GROUPS.forEach((names, gi) => {
        const gid = 'g' + (gi + 1);
        groups[gid] = { name: 'Group ' + (gi + 1), playerIds: [], createdAt: gi + 1 };
        names.forEach((n, i) => { const pid = 'p' + (gi + 1) + String.fromCharCode(97 + i); players[pid] = { id: pid, name: n, handicap: '10', flightId: gi < 2 ? 'f1' : 'f2' }; groups[gid].playerIds.push(pid); PIDS.push(pid); });
    });
    return Object.assign({ name: 'Starkey Classic', ownerUid: 'u-org', courseName: 'Papago Golf Course', format: 'individual', scoringModel: 'player-v1',
        courseData: COURSE, players, scoringGroups: groups, flights: { f1: { name: 'Flight 1' }, f2: { name: 'Flight 2' } }, createdAt: 1, scores: {} }, extra || {});
}
function teamEvent() {
    const teams = {};
    GROUPS.forEach((p, i) => { teams['team' + (i + 1)] = { num: i + 1, name: 'Group ' + (i + 1), players: p.slice(), handicap: 0 }; });
    return { name: 'Starkey Classic', ownerUid: 'u-org', courseName: 'Papago Golf Course', format: 'bestball', courseData: COURSE, teams, createdAt: 1, scores: {} };
}
// Every golfer's code, as the owner's earlier visit wrote them.
const CODES = { p1a: 'K7M4QP', p1b: 'H2TX9C', p1c: 'W8NF3R', p1d: 'P3JD6L', p2a: 'A2B3C4', p2b: 'D5E6F7', p2c: 'G8H9J2', p2d: 'K3L4M5',
    p3a: 'N6P7Q8', p3b: 'R9S2T3', p3c: 'U4V5W6', p3d: 'X7Y8Z9', p4a: 'AB23CD', p4b: 'EF45GH', p4c: 'JK67LM', p4d: 'NP89QR' };
const keysWith = (codes, extra) => Object.assign({ on: true, g: { g1: 'c1'.repeat(16), g2: 'c2'.repeat(16), g3: 'c3'.repeat(16), g4: 'c4'.repeat(16) },
    c: Object.fromEntries(Object.keys(codes).map((p) => [p, { code: codes[p], issuedAt: 1763130000000 }])) }, extra || {});

// ---- TAPS AND LISTENERS (the one-scorer test's helpers) --------------------
function tagsOf(markup) { return markup.match(/<(button|a|input|span)\b[^>]*>/g) || []; }
function handlerOf(markup, pick) {
    const tag = tagsOf(markup).find(pick);
    if (!tag) return null;
    const m = /\bonclick="([^"]*)"/.exec(tag);
    return m ? { code: m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'), tag } : null;
}
function attrsOf(tag) {
    const o = {};
    tag.replace(/\b(data-[a-z-]+|href)="([^"]*)"/g, (_, k, v) => { o[k === 'href' ? 'href' : k.slice(5).replace(/-([a-z])/g, (x, c) => c.toUpperCase())] = v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'); });
    return o;
}
function tap(sb, markup, pick) {
    const h = handlerOf(markup, pick);
    assert.ok(h, 'nothing to tap in that markup');
    sb.__tapEl = { dataset: attrsOf(h.tag) };
    vm.runInContext('(function () { ' + h.code + ' }).call(__tapEl)', sb);
}
const has = (re) => (tag) => re.test(tag);
const byId = (id) => has(new RegExp('\\bid="' + id + '"'));
function fire(sb, re, val) {
    const hs = sb.__dbHandlers.filter((h) => h.event === 'value' && re.test(h.path));
    assert.ok(hs.length > 0, 'no listener on ' + re);
    hs.forEach((h) => h.cb({ val: () => clone(val), exists: () => val !== null && val !== undefined }));
}
const el = (sb, id) => sb.document.getElementById(id);
const shownInline = (sb, id) => ((el(sb, id).style || {}).display || '') !== 'none';
const html = (sb, id) => String((el(sb, id) || {}).innerHTML || '');
const plain = (s) => decodeEscapes(String(s)).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/’/g, "'").replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const codeWrites = (sb) => sb.__dbWrites.filter((w) => /tournamentKeys\/STK\/c\b/.test(w.path) || (w.op === 'update' && Object.keys(w.value || {}).some((k) => /^tournamentKeys\/STK\/c\//.test(k))));
const keyWrites = (sb) => sb.__dbWrites.filter((w) => /tournamentKeys/.test(w.path) || (w.op === 'update' && Object.keys(w.value || {}).some((k) => /tournamentKeys/.test(k))));
const row = (markup, pid) => {
    const at = markup.indexOf('<div class="scd-row gc-row" data-pid="' + pid + '">');
    assert.ok(at !== -1, 'row ' + pid);
    const next = markup.indexOf('<div class="scd-row gc-row"', at + 10);
    return markup.slice(at, next === -1 ? undefined : next);
};

// The organizer: signed in as the owner, the record and (when given) the keys land.
function owner(record, keys, opts) {
    const sb = loadHtmlInlineScript(PAGE, [], { search: '?tourney=' + CODE, beforeRun(s) { s.crypto = require('crypto').webcrypto; } });
    sb.__auth.setUser((opts && opts.user) || ORGANIZER);
    fire(sb, new RegExp('^tournaments/' + CODE + '$'), record);
    if (keys !== undefined) fire(sb, new RegExp('^tournamentKeys/' + CODE + '$'), keys);
    const regs = sb.__dbHandlers.filter((h) => h.event === 'value' && /^registrations\/STK$/.test(h.path));
    if (regs.length) fire(sb, /^registrations\/STK$/, (opts && opts.regs) || {});
    return sb;
}
const deskTab = (sb) => tap(sb, HTML, byId('tab-btn-desk'));
const personal = (pid, code, gid) => `/tournament-scorecard.html?tourney=STK&group=${gid}&watch=1&me=${pid}&c=${code}`;

describe('A. THE DESK (the organizer)', () => {
    test('A1 DEFAULT: the owner opens the Desk on an individual event with no codes yet -> ONE update writes a unique 6-character code for every golfer; once it is back, each row shows its code and "Not used yet"', () => {
        const sb = owner(groupEvent(), keysWith({}));
        assert.equal(codeWrites(sb).length, 0, 'nothing is written before the Desk is opened');
        deskTab(sb);
        const ws = codeWrites(sb);
        assert.equal(ws.length, 1, 'one update');
        assert.equal(ws[0].op, 'update');
        const v = ws[0].value;
        assert.deepEqual(Object.keys(v).sort(), PIDS.map((p) => 'tournamentKeys/STK/c/' + p).sort());
        const codes = Object.values(v).map((x) => x.code);
        codes.forEach((c) => assert.match(c, CODE_RE));
        assert.equal(new Set(codes).size, 16, 'unique within the event');
        Object.values(v).forEach((x) => assert.deepEqual(Object.keys(x).sort(), ['code', 'issuedAt']));
        Object.values(v).forEach((x) => assert.deepEqual(clone(x.issuedAt), TS));
        assert.ok(!sb.__dbWrites.some((w) => /^tournaments\//.test(w.path) && /code/i.test(JSON.stringify(w.value || ''))), 'no code goes to the public record');
        // the write comes back on the owner-only node
        const back = {}; Object.keys(v).forEach((k) => { back[k.split('/').pop()] = v[k].code; });
        fire(sb, /^tournamentKeys\/STK$/, keysWith(back));
        assert.equal(codeWrites(sb).length, 1, 'nothing more to write');
        const d = html(sb, 'golfer-codes');
        assert.equal(shownInline(sb, 'golfer-codes'), true);
        assert.match(plain(d), /^Golfer codes Print code sheet 16 golfers · 0 opened · 16 not yet /);
        assert.equal(plain(row(d, 'p3c')).split(' Text it')[0], `Kim Vo ${back.p3c} Not used yet Flight 2 · Group 3`);
        assert.equal((d.match(/class="scd-row gc-row"/g) || []).length, 16);
        assert.doesNotMatch(plain(d), /lock|locked|one use|one phone|switched off|old code off|verified/i, 'nothing claims enforcement');
    });
    test('A2 the chip reads the joins: "Opened <time>" after the golfer\'s open; "Reissued <time>" after a Reissue until a newer open', () => {
        const opened = 1763132280000, reissued = 1763133000000;
        const rec = groupEvent({ joins: { g3: { p3c: { name: 'Kim Vo', at: opened } }, g1: { p1a: { name: 'Ana Diaz', at: reissued + 60000 } } } });
        const keys = keysWith(CODES);
        keys.c.p3d = { code: CODES.p3d, issuedAt: reissued, reissued: true };
        keys.c.p1a = { code: CODES.p1a, issuedAt: reissued, reissued: true };
        const sb = owner(rec, keys);
        deskTab(sb);
        assert.equal(codeWrites(sb).length, 0, 'every golfer has a code: nothing written');
        const d = html(sb, 'golfer-codes');
        const t = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        assert.match(plain(row(d, 'p3c')), new RegExp('^Kim Vo U4V5W6 Opened ' + t(opened).replace(/\s/g, ' ') + ' '));
        assert.match(row(d, 'p3c'), /class="gc-chip gc-open"/);
        assert.match(plain(row(d, 'p3d')), new RegExp('^Ray Diaz X7Y8Z9 Reissued ' + t(reissued).replace(/\s/g, ' ') + ' '));
        assert.match(plain(row(d, 'p1a')), /^Ana Diaz K7M4QP Opened /, 'an open after the reissue reads Opened');
        assert.match(plain(row(d, 'p2a')), /^Tom Reyes A2B3C4 Not used yet /);
        assert.match(plain(d), / 16 golfers · 2 opened · 14 not yet /);
    });
    test('A3 Reissue beside Kim Vo -> ONE write to tournamentKeys/STK/c/p3c: a new code, different from the old, marked reissued; nothing else', () => {
        const sb = owner(groupEvent(), keysWith(CODES));
        deskTab(sb);
        const before = sb.__dbWrites.length;
        tap(sb, row(html(sb, 'golfer-codes'), 'p3c'), has(/class="btn-outline gc-reissue"/));
        const ws = sb.__dbWrites.slice(before);
        assert.equal(ws.length, 1);
        assert.deepEqual([ws[0].op, ws[0].path], ['set', 'tournamentKeys/STK/c/p3c']);
        assert.match(ws[0].value.code, CODE_RE);
        assert.notEqual(ws[0].value.code, CODES.p3c);
        assert.ok(!Object.values(CODES).includes(ws[0].value.code), 'unique within the event');
        assert.deepEqual(clone(ws[0].value), { code: ws[0].value.code, issuedAt: TS, reissued: true });
    });
    test('A4 Text it: an sms: link whose body carries the golfer\'s personal link (with the phone from their signup), and the same link as text', () => {
        const regs = { e1: { fullName: 'Kim Vo', phone: '(480) 555-0142', playerId: 'p3c', createdAt: 1 } };
        const sb = owner(groupEvent(), keysWith(CODES), { regs });
        deskTab(sb);
        const r = row(html(sb, 'golfer-codes'), 'p3c');
        const a = tagsOf(r).find(has(/class="btn-outline gc-text"/));
        assert.ok(a, 'a Text it link');
        const href = attrsOf(a).href;
        assert.match(href, /^sms:4805550142\?&body=/);
        const body = decodeURIComponent(href.split('&body=')[1]);
        assert.ok(body.endsWith(personal('p3c', 'U4V5W6', 'g3')), body);
        assert.match(body, /^Kim, your card for Starkey Classic: https?:\/\//);
        const url = body.slice(body.indexOf('http'));
        assert.equal(plain(/<div class="gc-link">([^<]*)<\/div>/.exec(r)[1]), url, 'the link is on the row as text');
        assert.doesNotMatch(url, /[?&]k=/, 'the personal link never carries the scorer key');
        // no signup phone: the sms: link opens with no number
        const r2 = row(html(sb, 'golfer-codes'), 'p1a');
        assert.match(attrsOf(tagsOf(r2).find(has(/gc-text/))).href, /^sms:\?&body=/);
    });
    test('A5 Print code sheet builds one sheet for the field: name, flight, group, code, personal link; one print call', () => {
        const sb = owner(groupEvent(), keysWith(CODES));
        deskTab(sb);
        let prints = 0;
        sb.print = () => { prints++; };
        tap(sb, html(sb, 'golfer-codes'), byId('gc-print'));
        assert.equal(prints, 1);
        const sheet = html(sb, 'tournament-print-view');
        assert.equal((sheet.match(/class="gc-print-row"/g) || []).length, 16);
        assert.match(plain(sheet), /^Starkey Classic Golfer codes · 16 golfers · each link opens that golfer's group card Name Flight Group Code Personal link /);
        const kim = sheet.slice(sheet.lastIndexOf('<tr class="gc-print-row"', sheet.indexOf('>Kim Vo<')), sheet.indexOf('</tr>', sheet.indexOf('>Kim Vo<')));
        assert.ok(plain(kim).startsWith('Kim Vo Flight 2 Group 3 U4V5W6 http'), plain(kim));
        assert.ok(plain(kim).endsWith(personal('p3c', 'U4V5W6', 'g3')));
    });
    test('A6 a team event: no codes card, and no code is written', () => {
        const sb = owner(teamEvent(), { on: true, t: { team1: 'b1'.repeat(16) } });
        deskTab(sb);
        assert.equal(html(sb, 'golfer-codes'), '');
        assert.equal(codeWrites(sb).length, 0);
        assert.ok(/Scorers/.test(html(sb, 'scorer-desk')), 'positive: the Desk did render (its Scorers card is there)');
    });
    test('A7 a stranger, and the owner before tournamentKeys arrives: the page never renders a code (codes come only from tournamentKeys)', () => {
        const visitor = loadHtmlInlineScript(PAGE, [], { search: '?tourney=' + CODE });
        fire(visitor, /^tournaments\/STK$/, groupEvent());
        assert.equal(html(visitor, 'golfer-codes'), '');
        assert.equal(visitor.__dbHandlers.filter((h) => /^tournamentKeys/.test(h.path)).length, 0, 'a visitor does not even ask for the keys');
        const early = owner(groupEvent(), undefined);
        deskTab(early);
        assert.equal(html(early, 'golfer-codes'), '');
        assert.equal(codeWrites(early).length, 0, 'no code is made before the codes already held are known');
        assert.ok(/Scorers/.test(html(early, 'scorer-desk')), 'positive: the Desk did render');
        Object.values(CODES).forEach((c) => assert.ok(!html(early, 'manage-tab-desk').includes(c)));
    });
});

// The golfer's card: arrive on the link, the record lands.
function card(query, record, opts) {
    opts = opts || {};
    const sb = loadHtmlInlineScript(CARD, [], { search: '?' + query, localStorage: true, beforeRun(s) { if (opts.seed) Object.keys(opts.seed).forEach((k) => s.localStorage.setItem(k, opts.seed[k])); } });
    const make = sb.document.createElement.bind(sb.document);
    sb.document.createElement = (tag) => { const n = make(tag); if (String(tag).toLowerCase() === 'template') n.content = { querySelectorAll: () => [] }; return n; };
    fire(sb, new RegExp('^tournaments/' + CODE + '$'), record);
    return sb;
}
const KIM = 'tourney=STK&group=g3&watch=1&me=p3c&c=U4V5W6';
const POSTED = { v: 1, postedAt: 1763140000000, prizeType: 'credit', host: 'Papago', basisTitle: 'Net',
    places: [{ flight: 'Flight 2', rows: [{ rank: 1, key: 'p3c', name: 'Kim Vo', amount: 50, toPar: -3 }, { rank: 2, key: 'p3a', name: 'Dana Ruiz', amount: 0, toPar: -1 }] }],
    skins: { perSkin: 0, carryover: false, skins: 0, total: 0, rounds: [] }, contests: { perContest: 0, multi: false, total: 0, rows: [] },
    placeTotal: 50, trophies: 1, total: 50, golfers: 16 };

describe('B. THE GOLFER\'S PERSONAL LINK', () => {
    test('B1 DEFAULT: Kim opens her link -> "Hi Kim", her viewer card, ONE join write (joins/g3/p3c = { name, at }), nothing to tournamentKeys; a second snapshot writes nothing more', () => {
        const sb = card(KIM, groupEvent());
        assert.equal(shownInline(sb, 'sc-me'), true);
        assert.equal(plain(html(sb, 'sc-me')), "Hi Kim You're in Starkey Classic · Flight 2 · Group 3");
        assert.deepEqual(clone(sb.__dbWrites.map((w) => [w.op, w.path, w.value])), [['set', 'tournaments/STK/joins/g3/p3c', { name: 'Kim Vo', at: TS }]]);
        assert.equal(keyWrites(sb).length, 0);
        assert.equal(shownInline(sb, 'sc-join'), false, 'no name list: the link knows who she is');
        assert.equal(plain(html(sb, 'scoring-for')), "You're Kim Vo · watching Group 3 Not you?");
        assert.equal(shownInline(sb, 'sc-gps'), true, 'the GPS door, as the viewer card has it');
        assert.doesNotMatch(plain(html(sb, 'sc-me')), /results/i, 'no results door before posting');
        fire(sb, /^tournaments\/STK$/, groupEvent({ joins: { g3: { p3c: { name: 'Kim Vo', at: 1763132280000 } } } }));
        assert.equal(sb.__dbWrites.length, 1, 'the join is written once');
        assert.equal(plain(html(sb, 'sc-me')), "Hi Kim You're in Starkey Classic · Flight 2 · Group 3");
    });
    test('B2 results posted: the greeting gains "See my results", a link to My results carrying her id and her code', () => {
        const sb = card(KIM, groupEvent({ prizeResults: POSTED }));
        const m = html(sb, 'sc-me');
        assert.match(plain(m), /^Hi Kim You're in Starkey Classic · Flight 2 · Group 3 Results are posted\. See my results$/);
        const a = tagsOf(m).find(byId('sc-me-results'));
        assert.equal(attrsOf(a).href, 'tournament.html?tourney=STK&recap=1&me=p3c&c=U4V5W6');
        assert.equal(sb.__dbWrites.length, 1, 'still just the join');
    });
    test('B3 the phone remembers her (That\'s me stored): back on the link, no second join write; the greeting stands', () => {
        const seed = { hp_join_STK_g3: JSON.stringify({ slot: 'p3c', name: 'Kim Vo' }) };
        const sb = card(KIM, groupEvent(), { seed });
        assert.equal(sb.__dbWrites.length, 0);
        assert.equal(plain(html(sb, 'sc-me')), "Hi Kim You're in Starkey Classic · Flight 2 · Group 3");
    });
    test('B4 a link whose &me= names nobody on this card, or a team link: the card is the watch card as before (the name list), no greeting, nothing written', () => {
        const sb = card('tourney=STK&group=g3&watch=1&me=p1a&c=K7M4QP', groupEvent());
        assert.equal(sb.__dbWrites.length, 0);
        assert.equal(shownInline(sb, 'sc-join'), true);
        assert.match(plain(html(sb, 'sc-join')), /^Group 3 · Tap your own name\./);
        assert.ok(!el(sb, 'sc-me') || html(sb, 'sc-me') === '');
        const t = card('tourney=STK&team=3&watch=1&me=p3c', teamEvent());
        assert.equal(t.__dbWrites.length, 0);
        assert.match(plain(html(t, 'sc-join')), /Tap your own name/, 'positive: the team watch card rendered');
    });
});

// My results: the link the card hands out.
function results(query, record, opts) {
    opts = opts || {};
    const sb = loadHtmlInlineScript(PAGE, [], { search: '?' + query, beforeRun(s) { if (opts.slot) s.HARDPAN_SITE_PRICING.eventOffer = opts.slot; if (opts.ua) s.navigator = { userAgent: opts.ua }; } });
    fire(sb, /^tournaments\/STK$/, record);
    return sb;
}
const OFFER_ON = { on: true, code: 'HERO2026', endsAt: '2099-01-31' };

describe('C. AFTER THE EVENT: My results, then the offer', () => {
    test('C1 results posted, the 58A offer on, opened by her link: her results, then "Keep HardPan" with the first-year price FROM THE SLOT beside the regular yearly price, and the redeem link', () => {
        const sb = results('tourney=STK&recap=1&me=p3c&c=U4V5W6', groupEvent({ prizeResults: POSTED, offer: OFFER_ON }));
        const P = sb.HARDPAN_SITE_PRICING;
        assert.equal(P.eventOffer, '$19.99', 'the slot in site-pricing.js');
        assert.match(plain(html(sb, 'my-results-card')), /^Places 1st · Flight 2 -3 Net \$50 credit/, 'her results first');
        const o = html(sb, 'my-results-offer');
        assert.match(plain(o), new RegExp('^Keep HardPan \\' + P.eventOffer + ' your first year Regular price \\' + P.pro.yearly + '/yr Tournament players: 7 days free, then \\' + P.eventOffer + ' your first year, then '));
        assert.match(o, /id="mr-offer-redeem" href="https:\/\/apps\.apple\.com\/redeem\?ctx=offercodes&amp;id=6808220335&amp;code=HERO2026"/);
        assert.ok(HTML.indexOf('id="my-results-card"') < HTML.indexOf('id="my-results-offer"'), 'the offer sits after the results');
        // the price is the slot's, not typed: another value in the slot shows on the card
        const moved = results('tourney=STK&recap=1&me=p3c&c=U4V5W6', groupEvent({ prizeResults: POSTED, offer: OFFER_ON }), { slot: '$17.77' });
        assert.match(plain(html(moved, 'my-results-offer')), /^Keep HardPan \$17\.77 your first year Regular price/);
        assert.doesNotMatch(decodeEscapes(HTML), /19\.99/, 'tournament.html types no first-year price');
        assert.doesNotMatch(plain(o), /\b(cash|bet|pool|wager|pot|prize|winnings)\b/i);
    });
    test('C2 on an Android phone: the Android sentence, no redeem link', () => {
        const sb = results('tourney=STK&recap=1&me=p3c&c=U4V5W6', groupEvent({ prizeResults: POSTED, offer: OFFER_ON }), { ua: 'Mozilla/5.0 (Linux; Android 16; Pixel 9)' });
        const o = html(sb, 'my-results-offer');
        assert.match(plain(o), /Android: founding price \$24\.99\/yr in HardPan\. The tournament price arrives with the next app update\.$/);
        assert.doesNotMatch(o, /apps\.apple\.com\/redeem/);
    });
    test('C3 no offer: before results are posted, without her link\'s code, with 58A off, with no slot (a stale site-pricing.js), on a team event', () => {
        const cases = [
            ['tourney=STK&recap=1&me=p3c&c=U4V5W6', groupEvent({ offer: OFFER_ON }), {}],
            ['tourney=STK&recap=1&me=p3c', groupEvent({ prizeResults: POSTED, offer: OFFER_ON }), {}],
            ['tourney=STK&recap=1&me=p3c&c=U4V5W6', groupEvent({ prizeResults: POSTED }), {}],
            ['tourney=STK&recap=1&me=p3c&c=U4V5W6', groupEvent({ prizeResults: POSTED, offer: { on: false, code: 'HERO2026' } }), {}],
            ['tourney=STK&recap=1&me=team3&c=U4V5W6', Object.assign(teamEvent(), { prizeResults: Object.assign({}, POSTED, { places: [{ flight: '', rows: [{ rank: 1, key: 'team3', name: 'Group 3', amount: 50 }] }] }), offer: OFFER_ON }), {}]
        ];
        cases.forEach(([q, rec], i) => {
            const sb = results(q, rec);
            assert.equal(html(sb, 'my-results-offer'), '', 'case ' + i);
            assert.ok(html(sb, 'my-results-card').length > 0, 'positive: My results rendered, case ' + i);
        });
        const stale = loadHtmlInlineScript(PAGE, [], { search: '?tourney=STK&recap=1&me=p3c&c=U4V5W6', beforeRun(s) { delete s.HARDPAN_SITE_PRICING.eventOffer; } });
        fire(stale, /^tournaments\/STK$/, groupEvent({ prizeResults: POSTED, offer: OFFER_ON }));
        assert.equal(html(stale, 'my-results-offer'), '');
    });
    test('C4 the slot: site-pricing.js carries eventOffer, the homepage\'s versioned tag still matches the file, and no golfer-codes copy claims a code is checked', () => {
        const src = fs.readFileSync(path.join(REPO_ROOT, 'site-pricing.js'), 'utf8');
        assert.match(src, /eventOffer: '\$19\.99',/);
        const sha8 = require('crypto').createHash('sha256').update(fs.readFileSync(path.join(REPO_ROOT, 'site-pricing.js'))).digest('hex').slice(0, 8);
        ['hardpan-home.html', 'see-it.html'].forEach((f) => assert.match(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'), new RegExp('site-pricing\\.js\\?v=' + sha8), f));
        const fnAt = HTML.indexOf('function renderGolferCodes');
        assert.ok(fnAt > 0, 'positive: the Desk renderer exists');
        const fn = HTML.slice(fnAt, HTML.indexOf('\n    function ', fnAt + 30));
        assert.match(fn, /Golfer codes/, 'positive: the slice holds the card');
        assert.doesNotMatch(decodeEscapes(fn), /locked|one use|one phone|old code off|stops working|verified/i);
    });
});
