// ============================================================================
// SIGN-UP C, "Event page with sign-up" (Manny's pick 2026-11-21; mockup
// signup-desk.html option C and "The same in every option"). Individual events.
//
//   Event page  ?register=CODE is the event's page: HardPan Tournaments, the
//               name, When / Where / Format / Entry fee / Prizes / Benefiting
//               from the public record (no host line: the record has no host),
//               then the form. Phone stays REQUIRED.
//   Spots       with a field size (tournaments/<code>/signup/cap) and a seat list
//               the rules let it read (signupSeats/<code>), "58 of 72 spots
//               taken"; a full field switches the button to "Join the waiting
//               list" - the same sign-up - and the confirmation names the place.
//   The write   registration + seat in ONE update (both the server time). Under
//               the LIVE rules (no signupSeats) the seat read is refused: no
//               spots line, the registration alone, no place claimed. A read
//               that answers but a write that is refused falls back the same way.
//   The Desk    one list: every sign-up marked "Signed up online", the golfers
//               added on Setup in the same list, no Approve on an individual
//               event. The organizer's page adds each sign-up the order puts in
//               the field - one write per sign-up, never twice, never for a
//               waitlisted or removed one. Waiting list in sign-up order with
//               Move into the field. Remove takes the golfer out. The field size
//               input and the sign-up switch on Setup; Close sign-up now on the Desk.
//   Team events are UNCHANGED (Approve with the team chooser): C5 holds that.
//
// HOW EACH TEST ARRIVES. Through the URL a person opens: the golfer at
// ?register=SPR (the page's own once() read answers with the record), the
// organizer at ?tourney=SPR signed in as the owner (the page's OWN listeners
// fired with the record and the registrations). Every action is a TAP - the
// onclick / onchange text of the element a person touches, read from the
// markup the page rendered (or the static markup for the form), run with
// `this` bound. No test calls a page function by name. The first test of each
// surface is its DEFAULT state (nothing touched but the arrival).
//
// THE TWO RULE STATES are the harness's "server": PROPOSAL answers the seat
// read with the seats it holds and keeps every seat a write sends; LIVE refuses
// the seat read and any write naming signupSeats (PERMISSION_DENIED), as the
// published 2.1.0 rules do. That the rules really behave that way is proved in
// the emulator by tools/signup-c-rules-emulator-check.js, not here.
//
// WHAT mini-dom CANNOT PROVE: innerHTML is a string (rendered markup is read as
// markup); no layout (the 390 px look and innerText are measured in Chrome,
// screenshots in claude-mailbox-shared/tournaments/signup-c/); a static
// value="" is not parsed (each input is set by the test, as a person types).
//
// BASELINE (CLAUDE.md count rule; FINAL file, FINAL run): against
// preview-golfer-codes 86111c11 (tournament.html sha256 3f21f142641ca3eb...,
// written into the worktree by `git show 86111c11:tournament.html`, the build
// copied back from the scratchpad and checked by sha 23f8e77b3043):
// 18 tests - 3 pass / 15 fail (3 + 15 = 18). The 3 that pass are guards that
// must STAY green: B1 (no phone, no write - true before this wave too), B7 (a
// team event's confirmation unchanged) and C5 (a team event keeps Approve and
// writes nothing into the field by itself).
// After the build (preview-signup-c, tournament.html sha256 23f8e77b3043...):
// 18 tests - 18 pass / 0 fail.
//
// NEGATIVE CONTROLS (tournament.html mutated, saved to the scratchpad first and
// put back by cp, sha 23f8e77b3043 printed beside RESTORED-OK each time),
// pass / fail of the 18:
//    1 syncSignupField never writes                   13 / 5  C1 C2 C3 C4 C4b
//    2 the seat dropped from the sign-up               15 / 3  B2 B3 B5
//    3 no fallback after a refused combined write      17 / 1  B5
//    4 the spots line drawn without a seat read        16 / 2  B4 B5
//    5 a removed sign-up not remembered                17 / 1  C4b
//      (INERT on the first measurement: C4 alone was covered twice over, by the
//      added mark. C4b - a removed WAITING-LIST golfer, never added - closes it.)
//    6 the field size ignored by the Desk order        16 / 2  C3 C4b
//    7 the added mark cleared after a confirmed write  17 / 1  C2
//      (INERT first: C2 re-fired the stale list before the write settled. C2
//      now waits for the server's yes.)
//    8 the place counted without the field             16 / 2  B2 B3
//    9 Approve back on individual events               15 / 3  C1 C2 C3
//   10 phone not required                              17 / 1  B1
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { decodeEscapes } = require('./helpers/decode-escapes.js');

const PAGE = 'tournament.html';
const HTML = fs.readFileSync(path.join(REPO_ROOT, PAGE), 'utf8');
const CODE = 'SPR';
const ORGANIZER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const TS = { '.sv': 'timestamp' };
const clone = (o) => JSON.parse(JSON.stringify(o));
const settle = () => new Promise((r) => setTimeout(r, 15));
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const RAY = { id: 'p1', name: 'Ray Holt', handicap: '8.1', addedAt: 1, flightId: 'f1' };

function event(extra) {
    return Object.assign({ name: 'Spring Invitational', ownerUid: 'u-org', format: 'individual', scoringModel: 'player-v1', scoringMode: 'net',
        courseName: 'Papago Golf Course', venue: 'The Home Course', courseData: COURSE, createdAt: 1, eventDate: '2026-04-18', startTime: '08:00',
        startType: 'shotgun', entryFee: 45, payoutSpots: [300, 150, 0], beneficiary: 'Hope Foundation',
        flights: { f1: { name: 'A Flight', createdAt: 1 }, f2: { name: 'B Flight', createdAt: 2 } }, players: { p1: clone(RAY) } }, extra || {});
}
function teamEvent(extra) {
    return Object.assign({ name: 'Spring Scramble', ownerUid: 'u-org', format: 'scramble', courseName: 'Papago Golf Course', courseData: COURSE, createdAt: 1,
        entryFee: 400, teams: { team1: { num: 1, name: 'Eagles', players: ['Ann Alpha'], handicap: 0 } } }, extra || {});
}
// n anonymous seats already on the list, older than anyone who signs up here.
function seats(n) { const o = {}; for (let i = 1; i <= n; i++) o['eseat' + String(i).padStart(3, '0')] = 1000 + i; return o; }

// ---- TAPS -------------------------------------------------------------------
function tagsOf(markup) { return markup.match(/<(button|a|input|span|select)\b[^>]*>/g) || []; }
function handlerOf(markup, pick, attr) {
    const tag = tagsOf(markup).find(pick);
    if (!tag) return null;
    const m = new RegExp('\\b' + (attr || 'onclick') + '="([^"]*)"').exec(tag);
    return m ? m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&') : null;
}
function tap(sb, markup, pick, thisObj, attr) {
    const code = handlerOf(markup, pick, attr);
    assert.ok(code, 'nothing to tap in that markup');
    sb.__tapEl = thisObj || {};
    vm.runInContext('(function () { ' + code + ' }).call(__tapEl)', sb);
}
const has = (re) => (tag) => re.test(tag);
const byId = (id) => has(new RegExp('\\bid="' + id + '"'));
const el = (sb, id) => sb.document.getElementById(id);
const html = (sb, id) => String((el(sb, id) || {}).innerHTML || '');
const shown = (sb, id) => ((el(sb, id).style || {}).display || '') !== 'none';
const plain = (s) => decodeEscapes(String(s)).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const deny = () => Object.assign(new Error('PERMISSION_DENIED: Permission denied'), { code: 'PERMISSION_DENIED' });
// #reg-done's parts, read out of its markup (mini-dom does not parse innerHTML into children).
const part = (sb, id) => { const m = new RegExp('id="' + id + '"[^>]*>([\\s\\S]*?)</(div|p)>').exec(html(sb, 'reg-done')); return m ? plain(m[1]) : ''; };
const namesSeats = (w) => /^signupSeats\//.test(String(w.path || '')) || (w.op === 'update' && Object.keys(w.value || {}).some((k) => /^signupSeats\//.test(k)));

// ---- THE GOLFER ---------------------------------------------------------------
// rules: 'proposal' | 'live' | 'read-only' (the read answers, a seat write is refused)
function golfer(record, rules, startSeats) {
    const server = { seats: clone(startSeats || {}), clock: 5000 };
    const sb = loadHtmlInlineScript(PAGE, [], { search: '?register=' + CODE, beforeRun(s) {
        s.__dbReads = { ['tournaments/' + CODE]: clone(record) };
        const ref = s.db.ref;
        s.db.ref = (p) => {
            const r = ref(p);
            if (String(p) === 'signupSeats/' + CODE) {
                r.once = () => rules === 'live' ? Promise.reject(deny())
                    : Promise.resolve({ val: () => (Object.keys(server.seats).length ? clone(server.seats) : null), exists: () => Object.keys(server.seats).length > 0 });
            }
            return r;
        };
        s.__dbRefuse = (p, op, v) => {
            const w = { path: p, op, value: v };
            if (!namesSeats(w)) return null;
            if (rules !== 'proposal') return deny();
            Object.keys(v).filter((k) => /^signupSeats\//.test(k)).forEach((k) => { server.seats[k.split('/').pop()] = ++server.clock; });
            return null;
        };
    } });
    sb.__server = server;
    return sb;
}
function fill(sb, phone) {
    el(sb, 'reg-name').value = 'Kim Vo';
    el(sb, 'reg-email').value = 'kim@example.com';
    el(sb, 'reg-phone').value = phone === undefined ? '(602) 555-0143' : phone;
}
const signUp = (sb) => tap(sb, HTML, byId('reg-submit'));
const signupWrites = (sb) => sb.__dbWrites.filter((w) => /^registrations\//.test(String(w.path || '')) || namesSeats(w)
    || (w.op === 'update' && Object.keys(w.value || {}).some((k) => /^registrations\//.test(k))));

// ---- THE ORGANIZER ------------------------------------------------------------
function fire(sb, re, val) {
    const hs = sb.__dbHandlers.filter((h) => h.event === 'value' && re.test(h.path));
    assert.ok(hs.length > 0, 'no listener on ' + re);
    hs.forEach((h) => h.cb({ val: () => clone(val), exists: () => val !== null && val !== undefined }));
}
function organizer(record, regs) {
    const sb = loadHtmlInlineScript(PAGE, [], { search: '?tourney=' + CODE, beforeRun(s) { s.crypto = require('crypto').webcrypto; } });
    sb.__auth.setUser(ORGANIZER);
    fire(sb, new RegExp('^tournaments/' + CODE + '$'), record);
    fire(sb, new RegExp('^registrations/' + CODE + '$'), regs || {});
    return sb;
}
const REGS = {
    ekim0001: { fullName: 'Kim Vo', email: 'kim@example.com', phone: '602-555-0143', createdAt: 2001, ghinOrHandicap: '22.0' },
    edana002: { fullName: 'Dana Ruiz', email: 'dana@example.com', phone: '602-555-0144', createdAt: 2002, ghinOrHandicap: '14.2' },
    elee0003: { fullName: 'Lee Park', email: 'lee@example.com', phone: '602-555-0145', createdAt: 2003 }
};
// The field writes: an update that writes a player record AND an entry's playerId.
const fieldWrites = (sb) => sb.__dbWrites.filter((w) => w.op === 'update' && Object.keys(w.value || {}).some((k) => new RegExp('^tournaments/' + CODE + '/players/').test(k))
    && Object.keys(w.value || {}).some((k) => /\/playerId$/.test(k)));
const entryOf = (w) => Object.keys(w.value).find((k) => /\/playerId$/.test(k)).split('/')[2];
const deskTab = (sb) => tap(sb, HTML, byId('tab-btn-desk'));
const rowOf = (markup, id) => {
    const at = markup.lastIndexOf('<div', markup.indexOf('data-entry-id="' + id + '"'));
    assert.ok(markup.indexOf('data-entry-id="' + id + '"') !== -1, 'row ' + id);
    const next = markup.indexOf('<div class="reg-row', at + 10);
    const head = markup.indexOf('<p class="reg-grp"', at + 10);
    const end = [next, head].filter((x) => x !== -1).sort((a, b) => a - b)[0];
    return markup.slice(at, end === undefined ? undefined : end);
};
// The registrations as they come back once the page's own field writes land.
function landed(sb, regs) {
    const out = clone(regs);
    fieldWrites(sb).forEach((w) => { const id = entryOf(w); if (out[id]) { out[id].approvedAt = 3000; out[id].playerId = w.value[`registrations/${CODE}/${id}/playerId`]; } });
    return out;
}
function recordAfter(sb, record) {
    const out = clone(record);
    fieldWrites(sb).forEach((w) => Object.keys(w.value).filter((k) => /\/players\//.test(k)).forEach((k) => { out.players[k.split('/').pop()] = w.value[k]; }));
    return out;
}

// =============================================================================
describe('A. THE EVENT PAGE (a golfer opens the link)', () => {
    test('A1 DEFAULT: HardPan Tournaments, the name, and When / Where / Format / Entry fee / Prizes / Benefiting from the record; the form is open', async () => {
        const sb = golfer(event(), 'proposal');
        await settle();
        const screen = HTML.slice(HTML.indexOf('<div class="container" id="register-screen"'), HTML.indexOf('<div id="reg-form">'));
        assert.match(screen, /<p class="ev-brand">HardPan Tournaments<\/p>/, 'the brand line, in the static markup');
        assert.equal(el(sb, 'reg-event-name').textContent, 'Spring Invitational');
        assert.equal(plain(html(sb, 'reg-event-sub')),
            'When Sat, Apr 18, 2026 · Shotgun 8:00 AM Where The Home Course Format Individual Stroke Play · Net · 2 flights Entry fee $45 per golfer Prizes Pro shop credit Benefiting Hope Foundation');
        assert.doesNotMatch(plain(html(sb, 'reg-event-sub')), /Hosted|cash/i, 'no host the record does not hold; no cash prize wording');
        assert.equal(shown(sb, 'reg-form'), true);
        assert.equal(shown(sb, 'reg-closed'), false);
        assert.equal(el(sb, 'reg-submit').textContent, 'Sign up');
        assert.equal(shown(sb, 'reg-spots'), false, 'no field size on this record: nothing to count');
    });
    test('A2 the prize switch on its other position draws no Prizes row; no places set, none either; a team fee reads per team; no fee, no fee row', async () => {
        const other = golfer(event({ prizeType: 'cash' }), 'proposal'); await settle();
        const t = plain(html(other, 'reg-event-sub'));
        assert.match(t, /^When Sat, Apr 18, 2026/, 'positive: the facts are there');
        assert.doesNotMatch(t, /Prizes|cash/i);
        const none = golfer(event({ payoutSpots: null, entryFee: 0 }), 'proposal'); await settle();
        assert.equal(plain(html(none, 'reg-event-sub')), 'When Sat, Apr 18, 2026 · Shotgun 8:00 AM Where The Home Course Format Individual Stroke Play · Net · 2 flights Benefiting Hope Foundation');
        const team = golfer(teamEvent(), 'proposal'); await settle();
        assert.equal(plain(html(team, 'reg-event-sub')), 'Where Papago Golf Course Format Scramble Entry fee $400 per team');
    });
    test('A3 the organizer switched sign-up off: the form is gone and the page says so', async () => {
        const sb = golfer(event({ signup: { open: false, cap: 72 } }), 'proposal'); await settle();
        assert.equal(shown(sb, 'reg-form'), false);
        assert.equal(shown(sb, 'reg-closed'), true);
        assert.equal(el(sb, 'reg-closed').textContent, 'Sign-up for this event is closed. The organizer closed it; text them if you hoped to play.');
        assert.equal(plain(html(sb, 'reg-event-sub')).slice(0, 4), 'When', 'positive: the facts still show');
    });
});

// =============================================================================
describe('B. SIGNING UP', () => {
    test('B1 the phone is required: no phone -> the page asks for one and writes NOTHING (positive: with it, one write)', async () => {
        const sb = golfer(event({ signup: { cap: 72 } }), 'proposal', seats(10)); await settle();
        const alerts = []; sb.alert = (m) => alerts.push(String(m));
        fill(sb, '');
        signUp(sb); await settle();
        assert.equal(signupWrites(sb).length, 0, JSON.stringify(sb.__dbWrites));
        assert.deepEqual(alerts, ['Give a phone number we can reach you at.']);
        fill(sb);
        signUp(sb); await settle();
        assert.equal(signupWrites(sb).length, 1, 'with a phone, the sign-up is sent');
    });
    test('B2 PROPOSAL, 58 of 72: the spots line, then ONE update carrying the registration and its seat (both the server time); "You\'re in, Kim", spot 59 of 72', async () => {
        const sb = golfer(event({ signup: { cap: 72 } }), 'proposal', seats(57)); await settle();
        assert.equal(shown(sb, 'reg-spots'), true);
        assert.equal(el(sb, 'reg-spots-text').textContent, '58 of 72 spots taken');
        assert.equal(el(sb, 'reg-spots-bar').style.width, '81%');
        assert.equal(el(sb, 'reg-submit').textContent, 'Sign up');
        fill(sb); signUp(sb); await settle();
        const w = signupWrites(sb);
        assert.equal(w.length, 1, 'one write: ' + JSON.stringify(w));
        assert.equal(w[0].op, 'update');
        const keys = Object.keys(w[0].value).sort();
        assert.equal(keys.length, 2);
        const id = keys[0].split('/').pop();
        assert.deepEqual(keys, [`registrations/${CODE}/${id}`, `signupSeats/${CODE}/${id}`], 'the same entry id on both paths');
        assert.deepEqual(clone(w[0].value[`signupSeats/${CODE}/${id}`]), TS, 'the seat is the server time and nothing else');
        const r = w[0].value[`registrations/${CODE}/${id}`];
        assert.deepEqual(clone(r.createdAt), TS);
        assert.deepEqual(Object.keys(r).sort(), ['createdAt', 'email', 'fullName', 'phone']);
        assert.equal(shown(sb, 'reg-done'), true);
        assert.equal(shown(sb, 'reg-form'), false);
        assert.equal(part(sb, 'reg-done-hello'), "You're in, Kim Spring Invitational · Sat, Apr 18, 2026");
        assert.equal(part(sb, 'reg-done-line'), "You're spot 59 of 72. Your group and your own link come before the day.");
        assert.match(html(sb, 'reg-done'), /id="reg-done-ics" href="data:text\/calendar;charset=utf-8,[^"]*DTSTART%3A20260418T080000/, 'Add to my calendar: the event at 8:00 AM');
        assert.doesNotMatch(html(sb, 'reg-done'), /\b[A-HJ-NP-Z2-9]{6}\b(?![^<]*>)/, 'no golfer code is shown (the golfer cannot read one)');
    });
    test('B3 a FULL field (72 of 72): the line says so, the button is "Join the waiting list", the card button is not offered; the golfer is told their place on the waiting list', async () => {
        const rec = event({ signup: { cap: 72 }, fees: { entryFeeCents: 4500, collectByCard: true, allowCash: true } });
        const sb = golfer(rec, 'proposal', seats(73)); await settle();
        assert.equal(el(sb, 'reg-spots-text').textContent, '72 of 72 spots taken. The field is full: you can join the waiting list.');
        assert.equal(el(sb, 'reg-spots-bar').style.width, '100%');
        assert.equal(el(sb, 'reg-submit').textContent, 'Join the waiting list');
        assert.equal(shown(sb, 'reg-submit'), true);
        assert.equal(shown(sb, 'reg-pay'), false, 'no card payment for a golfer who is not in the field');
        assert.equal(shown(sb, 'reg-cash-line'), false);
        fill(sb); signUp(sb); await settle();
        assert.equal(signupWrites(sb).length, 1);
        assert.equal(part(sb, 'reg-done-hello'), "You're on the waiting list, Kim Spring Invitational · Sat, Apr 18, 2026");
        // 1 golfer in the field + 73 seats ahead = 74 taken; Kim is the 75th: number 3 on the waiting list.
        assert.equal(part(sb, 'reg-done-line'), "You're number 3 on the waiting list. If a spot opens, the organizer's Desk moves golfers in from the waiting list in sign-up order.");
    });
    test('B4 LIVE RULES (the seat read is refused): no spots line, "Sign up", the registration ALONE (one set, today\'s write), and no place is claimed', async () => {
        const sb = golfer(event({ signup: { cap: 72 } }), 'live', seats(71)); await settle();
        assert.equal(shown(sb, 'reg-spots'), false);
        assert.equal(el(sb, 'reg-submit').textContent, 'Sign up');
        fill(sb); signUp(sb); await settle();
        const w = signupWrites(sb);
        assert.equal(w.length, 1, JSON.stringify(w));
        assert.equal(w[0].op, 'set');
        assert.match(w[0].path, new RegExp('^registrations/' + CODE + '/e[a-z0-9]+$'));
        assert.equal(typeof w[0].value.createdAt, 'number', 'the page\'s own time, as today');
        assert.equal(sb.__dbWrites.filter(namesSeats).length, 0, 'nothing names signupSeats');
        assert.equal(part(sb, 'reg-done-hello'), "You're signed up, Kim Spring Invitational · Sat, Apr 18, 2026");
        const line = part(sb, 'reg-done-line');
        assert.equal(line, "You're on the organizer's Desk. It puts you in the field, or on the waiting list if the field is already full; the organizer can tell you which.");
        assert.doesNotMatch(line, /spot \d|number \d|of 72/);
    });
    test('B5 the read answers but the combined write is REFUSED: the same entry id goes again ALONE, the spots line comes down, no place claimed', async () => {
        const sb = golfer(event({ signup: { cap: 72 } }), 'read-only', seats(20)); await settle();
        assert.equal(shown(sb, 'reg-spots'), true, 'positive: the line was up before the write');
        fill(sb); signUp(sb); await settle();
        const w = signupWrites(sb);
        assert.equal(w.length, 2, JSON.stringify(w));
        assert.equal(w[0].op, 'update');
        assert.equal(w[1].op, 'set');
        const id = Object.keys(w[0].value).find((k) => /^registrations\//.test(k)).split('/').pop();
        assert.equal(w[1].path, `registrations/${CODE}/${id}`, 'the same entry: one registration, never two');
        assert.equal(shown(sb, 'reg-spots'), false, 'a count it can no longer keep is taken down');
        assert.equal(part(sb, 'reg-done-hello'), "You're signed up, Kim Spring Invitational · Sat, Apr 18, 2026");
        assert.doesNotMatch(plain(html(sb, 'reg-done')), /spot \d|number \d/);
    });
    test('B6 no field size (every event made before today): no spots line, the single registration write, "You\'re in, Kim" without a spot number', async () => {
        const sb = golfer(event(), 'proposal', seats(5)); await settle();
        assert.equal(shown(sb, 'reg-spots'), false);
        fill(sb); signUp(sb); await settle();
        const w = signupWrites(sb);
        assert.equal(w.length, 1);
        assert.equal(w[0].op, 'set');
        assert.equal(sb.__dbWrites.filter(namesSeats).length, 0);
        const done = plain(html(sb, 'reg-done'));
        assert.ok(/You're in, Kim/.test(done) || /signed up/.test(plain(html(sb, 'reg-status'))), 'a confirmation was shown: ' + done);
        assert.doesNotMatch(done, /spot \d/);
    });
    test('B7 a TEAM event keeps today\'s confirmation: the organizer still places the golfer on a team', async () => {
        const sb = golfer(teamEvent(), 'proposal'); await settle();
        fill(sb); signUp(sb); await settle();
        assert.equal(signupWrites(sb).length, 1);
        assert.match(html(sb, 'reg-status'), /Thanks — you are signed up\. The organizer will see this and add you to the field\./);
        assert.notEqual(((el(sb, 'reg-done').style || {}).display || 'none'), 'block');
    });
});

// =============================================================================
describe('C. THE DESK (the organizer)', () => {
    test('C1 DEFAULT: two sign-ups, no field size -> the page itself writes each into the field, ONE update apiece (Approve\'s write + signupId); the Desk is one list, "Signed up online", no Approve', () => {
        const regs = { ekim0001: REGS.ekim0001, edana002: REGS.edana002 };
        const sb = organizer(event(), regs);
        const w = fieldWrites(sb);
        assert.equal(w.length, 2, JSON.stringify(sb.__dbWrites.map((x) => x.path + ' ' + JSON.stringify(x.value)).slice(-4)));
        assert.deepEqual(w.map(entryOf).sort(), ['edana002', 'ekim0001']);
        const kim = w.find((x) => entryOf(x) === 'ekim0001').value;
        assert.deepEqual(Object.keys(kim).sort(), [`registrations/${CODE}/ekim0001/approvedAt`, `registrations/${CODE}/ekim0001/playerId`, `tournaments/${CODE}/players/pekim0001`]);
        const p = kim[`tournaments/${CODE}/players/pekim0001`];
        assert.deepEqual({ id: p.id, name: p.name, handicap: p.handicap, signupId: p.signupId }, { id: 'pekim0001', name: 'Kim Vo', handicap: '22.0', signupId: 'ekim0001' });
        assert.equal(typeof p.addedAt, 'number');
        assert.equal(kim[`registrations/${CODE}/ekim0001/playerId`], 'pekim0001');
        deskTab(sb);
        const list = html(sb, 'registration-list');
        assert.equal((list.match(/Signed up online/g) || []).length, 2);
        assert.doesNotMatch(list, /Approve into field|approveRegistration/);
        assert.doesNotMatch(html(sb, 'manage-tab-desk') + html(sb, 'registration-chips'), /Approve/);
        assert.match(plain(rowOf(list, 'ekim0001')), /^Kim Vo .*Signed up online .*(In the field|Adding to the field)/);
        assert.match(list, /data-player-id="p1"><span class="reg-name">Ray Holt<\/span><span class="reg-state reg-state-field">In the field<\/span><span class="reg-meta">Hcp 8\.1 · A Flight · Added on Setup/, 'the golfer added on Setup is on the same list');
        assert.equal(plain(html(sb, 'registration-chips')).replace(/ Photos \d+$/, ''), 'All 2 Unpaid 2 Paid 0 In the field 2 Waiting list 0');
        assert.equal(el(sb, 'registration-desk-note').textContent, 'Tick Paid when you have the cash. Golfers who sign up go straight into the field.');
        assert.match(plain(html(sb, 'registration-link-row')), /^Golfers open this link to sign up\. They go straight onto the Desk and into the field; the Desk tab is where you tick Paid\./);
    });
    test('C2 NEVER TWICE: the writes confirmed, then the same list again (not caught up), the record again, then the list as it lands -> still one write per sign-up', async () => {
        const regs = { ekim0001: REGS.ekim0001, edana002: REGS.edana002 };
        const sb = organizer(event(), regs);
        assert.equal(fieldWrites(sb).length, 2, 'positive: both were written');
        await settle();   // the server said yes; a page that forgets what it wrote on success would write again below
        fire(sb, /^registrations\/SPR$/, regs);
        fire(sb, /^tournaments\/SPR$/, event());
        deskTab(sb);
        fire(sb, /^registrations\/SPR$/, landed(sb, regs));
        fire(sb, /^tournaments\/SPR$/, recordAfter(sb, event()));
        assert.equal(fieldWrites(sb).length, 2);
        assert.match(plain(rowOf(html(sb, 'registration-list'), 'ekim0001')), /Signed up online In the field/);
    });
    test('C3 FIELD SIZE 3, one golfer already in: Kim and Dana go in, Lee is "Waiting list · 1" with Move into the field (no write for Lee); the tiles; Move into the field writes Lee once', () => {
        const rec = event({ signup: { cap: 3 } });
        const sb = organizer(rec, REGS);
        assert.deepEqual(fieldWrites(sb).map(entryOf).sort(), ['edana002', 'ekim0001'], 'Lee is not added');
        fire(sb, /^tournaments\/SPR$/, recordAfter(sb, rec));
        fire(sb, /^registrations\/SPR$/, landed(sb, REGS));
        deskTab(sb);
        assert.equal(fieldWrites(sb).length, 2);
        const list = html(sb, 'registration-list');
        assert.match(list, /<p class="reg-grp" id="desk-wait-head">Waiting list · 1<\/p>/);
        const lee = rowOf(list, 'elee0003');
        assert.match(plain(lee), /^Lee Park .*Signed up online Waiting list · 1 Move into the field/);
        assert.ok(list.indexOf('desk-wait-head') > list.indexOf('data-player-id="p1"'), 'the waiting list comes after the field');
        assert.equal(plain(html(sb, 'signup-desk-bar')), '3 golfers in the field 3 of 3 0 spots left 1 waiting 2 signed up online Close sign-up now');
        assert.match(el(sb, 'registration-desk-note').textContent, /up to 3; the rest wait in sign-up order\.$/);
        tap(sb, lee, has(/class="btn-outline reg-move"/));
        const w = fieldWrites(sb);
        assert.equal(w.length, 3);
        assert.equal(entryOf(w[2]), 'elee0003');
        fire(sb, /^registrations\/SPR$/, landed(sb, REGS));
        assert.equal(fieldWrites(sb).length, 3, 'once');
    });
    test('C4 REMOVE takes the golfer out (sign-up + player in ONE update, then the seat); a stale list cannot bring them back; the spot that opened goes to the first on the waiting list', () => {
        const rec = event({ signup: { cap: 3 } });
        const sb = organizer(rec, REGS);
        const after = recordAfter(sb, rec);
        const back = landed(sb, REGS);
        fire(sb, /^tournaments\/SPR$/, after);
        fire(sb, /^registrations\/SPR$/, back);
        deskTab(sb);
        const asked = []; sb.confirm = (m) => { asked.push(String(m)); return true; };
        const before = sb.__dbWrites.length;
        tap(sb, rowOf(html(sb, 'registration-list'), 'ekim0001'), has(/class="btn-outline reg-remove"/));
        assert.equal(asked.length, 1);
        assert.match(asked[0], /^Remove Kim Vo\?\n\nThey come off the Desk and out of the field\./);
        const rm = sb.__dbWrites.slice(before).filter((w) => w.op === 'update');
        assert.equal(rm.length, 1, JSON.stringify(sb.__dbWrites.slice(before)));
        assert.deepEqual(clone(rm[0].value), { [`registrations/${CODE}/ekim0001`]: null, [`tournaments/${CODE}/players/pekim0001`]: null });
        return settle().then(() => {
            assert.ok(sb.__dbWrites.some((w) => w.op === 'remove' && w.path === `signupSeats/${CODE}/ekim0001`), 'the seat goes after');
            // a stale list (still holding Kim, not in the field) and the record without her
            fire(sb, /^registrations\/SPR$/, Object.assign(clone(back), { ekim0001: REGS.ekim0001 }));
            const noKim = clone(after); delete noKim.players.pekim0001;
            fire(sb, /^tournaments\/SPR$/, noKim);
            const adds = fieldWrites(sb).map(entryOf);
            assert.equal(adds.filter((x) => x === 'ekim0001').length, 1, 'Kim is never written again');
            assert.equal(adds.filter((x) => x === 'elee0003').length, 1, 'the spot that opened goes to Lee, the first on the waiting list');
            assert.equal(html(sb, 'registration-list').indexOf('data-entry-id="ekim0001"'), -1, 'Kim is not on the Desk');
        });
    });
    test('C4b a REMOVED waiting-list golfer stays removed: a spot that opens later, with a stale list still holding them, goes to the next in line', async () => {
        const regs = Object.assign(clone(REGS), { emax0004: { fullName: 'Max Ito', email: 'max@example.com', phone: '602-555-0146', createdAt: 2004 } });
        const rec = event({ signup: { cap: 3 } });
        const sb = organizer(rec, regs);
        const after = recordAfter(sb, rec), back = landed(sb, regs);
        fire(sb, /^tournaments\/SPR$/, after);
        fire(sb, /^registrations\/SPR$/, back);
        deskTab(sb);
        assert.match(html(sb, 'registration-list'), /Waiting list · 2/, 'positive: Lee and Max wait');
        sb.confirm = () => true;
        tap(sb, rowOf(html(sb, 'registration-list'), 'elee0003'), has(/class="btn-outline reg-remove"/));
        await settle();
        fire(sb, /^registrations\/SPR$/, back);                 // stale: Lee still there
        const noRay = clone(after); delete noRay.players.p1;     // Ray taken out on Setup: one spot opens
        fire(sb, /^tournaments\/SPR$/, noRay);
        const adds = fieldWrites(sb).map(entryOf);
        assert.equal(adds.filter((x) => x === 'elee0003').length, 0, 'Lee is never written into the field');
        assert.equal(adds.filter((x) => x === 'emax0004').length, 1, 'the spot goes to Max');
    });
    test('C5 a TEAM event is unchanged: Approve into field with the team chooser, and the page writes nothing into the field by itself', () => {
        const sb = organizer(teamEvent(), { ekim0001: REGS.ekim0001 });
        deskTab(sb);
        const list = html(sb, 'registration-list');
        assert.match(list, /onclick="approveRegistration\('ekim0001'\)">Approve into field</);
        assert.match(list, /<select id="reg-dest-ekim0001">/);
        assert.equal(sb.__dbWrites.filter((w) => w.op === 'update' && Object.keys(w.value || {}).some((k) => /\/teams\/|\/players\//.test(k))).length, 0);
        assert.doesNotMatch(list, /Signed up online/);
    });
    test('C6 THE FIELD SIZE INPUT and the switch (Setup > Registration), and Close sign-up now (Desk): each one write to tournaments/<code>/signup', () => {
        const sb = organizer(event(), {});
        const setup = HTML.slice(HTML.indexOf('<div id="registration-section"'), HTML.indexOf('<h3>🚀 Starting Holes</h3>'));
        assert.match(setup, /<input type="number" id="signup-cap"[^>]*onchange="setSignupCap\(this\.value\)">/);
        assert.equal(shown(sb, 'signup-cap-wrap'), true);
        assert.equal(el(sb, 'signup-cap').value, '', 'no size yet: the box is empty ("No limit")');
        assert.equal(el(sb, 'signup-open-switch').checked, true, 'taking sign-ups by default');
        const writes = () => sb.__dbWrites.filter((w) => new RegExp('^tournaments/' + CODE + '/signup').test(String(w.path || '')));
        tap(sb, setup, byId('signup-cap'), { value: '72' }, 'onchange');
        tap(sb, setup, byId('signup-cap'), { value: 'lots' }, 'onchange');
        tap(sb, setup, byId('signup-cap'), { value: '' }, 'onchange');
        tap(sb, setup, byId('signup-open-switch'), { checked: false }, 'onchange');
        assert.deepEqual(writes().map((w) => [w.op, w.path, w.value]), [
            ['set', `tournaments/${CODE}/signup/cap`, 72],
            ['remove', `tournaments/${CODE}/signup/cap`, null],
            ['set', `tournaments/${CODE}/signup/open`, false]]);
        fire(sb, /^tournaments\/SPR$/, event({ signup: { cap: 72 } }));
        assert.equal(el(sb, 'signup-cap').value, '72', 'the box shows the saved size');
        deskTab(sb);
        tap(sb, html(sb, 'signup-desk-bar'), byId('desk-signup-toggle'));
        assert.deepEqual(writes().slice(-1).map((w) => [w.op, w.path, w.value]), [['set', `tournaments/${CODE}/signup/open`, false]]);
        fire(sb, /^tournaments\/SPR$/, event({ signup: { cap: 72, open: false } }));
        assert.match(plain(html(sb, 'signup-desk-bar')), /sign-up closed .*Open sign-up again$/);
    });
});

// =============================================================================
describe('D. THE CAP IS THE DESK\'S, NOT THE RULES\'', () => {
    test('D1 the page says so where the order is kept (a comment a reader of signupCapOf meets), and the seat is written only beside a registration', () => {
        const at = HTML.indexOf('function signupCapOf(');
        assert.ok(at > 0, 'positive: the function exists');
        const head = HTML.slice(HTML.lastIndexOf('// ===== SIGN-UP C', at), at);
        assert.match(head, /NOTHING IN THE RULES ENFORCES\s*\/\/\s*THE CAP: rules cannot count\./);
        const sub = HTML.slice(HTML.indexOf('function submitRegistration()'), HTML.indexOf('\n    function ', HTML.indexOf('function submitRegistration()') + 30));
        assert.match(sub, /\[`signupSeats\/\$\{code\}\/\$\{entryId\}`\]: firebase\.database\.ServerValue\.TIMESTAMP/);
        assert.equal((HTML.match(/signupSeats\/\$\{code\}\/\$\{entryId\}`\]/g) || []).length, 1, 'one seat writer, in the sign-up');
    });
});
