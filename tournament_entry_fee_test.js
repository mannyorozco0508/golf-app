// ONE ENTRY FEE, THE VENUE FROM THE COURSE, THE GREEN NOTE (Manny 2026-11-11,
// "fix before merge"), reached the way an organizer reaches them: arrive cold
// (tools/lib/cold-arrival.js) at 390x844, signed in, real keystrokes and taps;
// no page function is called. The course proxy is replaced per test (the
// provider's own answer for Papago, or not configured).
//
//  1 create, scramble: the per control reads per team; tap per golfer, $50,
//    pick Papago, a team, Save: the record has entryFee 50, entryFeePer
//    'golfer' and venue 'Papago Golf Course' (the picked course); the event's
//    Event details show the fee, per golfer active, the venue filled in
//  2 create, individual: the per control is hidden; Save writes entryFeePer
//    'golfer' (there are no teams to charge)
//  3 an owned team event with entryFee 400 and no entryFeePer (every record
//    before today): Event details read per team; the Desk line says per team;
//    tapping per golfer writes entryFeePer 'golfer' and nothing else
//  4 the note is green when a real card loads (online), amber for the
//    placeholder; one fee box on the create form and one under Event details
//  5 money = base: payouts.js, tournament-engine.js, handicap.js are main
//    97698412 byte for byte
//
// Baseline against phase2 b181ec1a (before the fix): all 5 tests: 1 PASS / 4 FAIL.
// The 1 is test 5. With the fix: all 5 tests: 5 PASS / 0 FAIL.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const F = require('./helpers/app-card-fixtures.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const empty = () => ({ tournaments: {}, events: {}, trips: {}, global_courses: {} });
const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const holes = (order) => order.map((si, i) => ({ par: PARS[i], yardage: 380, handicap: si }));
const SI_BLUE = [7, 13, 17, 1, 5, 11, 15, 9, 3, 8, 14, 18, 2, 6, 12, 16, 10, 4];
const PAPAGO = { id: 'hpag0kx6', club_name: 'Papago Golf Course', course_name: 'Papago Golf Course', location: { city: 'Phoenix', state: 'AZ' }, tees: { male: 1 } };
const DETAIL = Object.assign({}, PAPAGO, { tees: { male: [{ tee_name: 'Blue', course_rating: 72.4, slope_rating: 131, total_yards: 6800, par_total: 72, holes: holes(SI_BLUE) }] } });
const proxy = (search, detail) => `(function () { const real = window.fetch; const J = (o) => Promise.resolve(new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const literal = (q, list) => (list || []).filter((c) => { const hay = ((c.club_name || '') + ' ' + (c.course_name || '')).toLowerCase(); return q.toLowerCase().split(/\\s+/).every((w) => hay.indexOf(w) !== -1); });
    window.fetch = function (u, o) { const s = String(u);
        if (/\\/api\\/course-search/.test(s)) { const q = decodeURIComponent(s.split('q=')[1] || ''); const ans = ${JSON.stringify(search)}; return J(ans.status === 'ok' ? { status: 'ok', courses: literal(q, ans.courses) } : ans); }
        if (/\\/api\\/course\\//.test(s)) return J(${JSON.stringify(detail)});
        return real.apply(this, arguments); }; })();`;
const PROVIDER = proxy({ status: 'ok', courses: [PAPAGO] }, { status: 'ok', course: DETAIL });
const NOT_CONFIGURED = proxy({ status: 'unavailable', reason: 'not_configured' }, { status: 'unavailable', reason: 'not_configured' });
const CARRY = `(function () { try {
    var saved = JSON.parse(sessionStorage.getItem('__efw') || '[]');
    saved.forEach(function (x) { var r = firebase.database().ref(x.path); if (x.op === 'set') r.set(x.value); else if (x.op === 'update') r.update(x.value); });
    window.__coldWrites = [];
    window.addEventListener('pagehide', function () { try { sessionStorage.setItem('__efw', JSON.stringify(saved.concat(window.__coldWrites || []))); } catch (e) {} });
} catch (e) {} })();`;
const READ = { expression: `JSON.stringify((function () {
  var $ = function (s) { return document.querySelector(s); };
  var shown = function (e) { if (!e) return false; if (getComputedStyle(e).display === 'none') return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var t = function (s) { var e = $(s); return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  var on = function (s) { var b = $(s + ' button.on'); return b ? b.dataset.per : null; };
  var bg = function (s) { var e = $(s); return e ? getComputedStyle(e).backgroundColor : null; };
  return { tPerShown: shown($('#t-fee-per')), tPer: on('#t-fee-per'), tLabel: t('#t-entry-fee-label'), feeBoxes: document.querySelectorAll('#setup-screen input[type="number"][id$="entry-fee"], #setup-screen #t-entry-fee').length,
    evPerShown: shown($('#ev-fee-per')), evPer: on('#ev-fee-per'), evFee: ($('#ev-fee') || {}).value || '', evVenue: ($('#ev-venue') || {}).value || '', evFeeBoxes: document.querySelectorAll('#event-details-block input[type="number"]').length,
    desk: t('#registration-counts'), note: shown($('#course-note')) ? t('#course-note') : '', noteOk: !!($('#course-note') && $('#course-note').classList.contains('ok')), noteBg: bg('#course-note'),
    manage: shown($('#manage-screen')), writes: (window.__coldWrites || []).map(function (w) { return { op: w.op, path: w.path, value: w.value }; }) };
})())` };
const CARRIED = { expression: `(function () { try { return JSON.stringify({ carried: JSON.parse(sessionStorage.getItem('__efw') || '[]'), search: location.search }); } catch (e) { return 'no storage'; } })()` };
const PICK = [{ tap: '#course-search-input' }, { cdp: { method: 'Input.insertText', params: { text: 'pap' } } }, { sleep: 250 }, { tap: '#course-dropdown .custom-select-option' }, { sleep: 700 }];
const FILL = (name) => ({ expression: `(function () { document.getElementById('t-name').value = ${JSON.stringify(name)}; document.getElementById('t-entry-fee').value = '50';
    var p = document.querySelector('#teams-list .team-card .team-name-inputs input'); if (!p) return 'no team input'; p.value = 'Al Lopez'; return 'filled'; })()` });
const SAVE = [{ tap: 'button.btn-primary[onclick^="saveTournament"]' }, { sleep: 3500 }];
const objs = (r) => r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
const created = (c) => {
    const w = c.carried.find((x) => x.op === 'update' && x.path === '' && Object.keys(x.value).some((k) => /^tournaments\/[A-Z2-9]{6}$/.test(k)));
    assert.ok(w, 'the creating write: ' + JSON.stringify(c.carried.map((x) => x.path)));
    return w.value[Object.keys(w.value).find((k) => /^tournaments\//.test(k))];
};

test('1 create, scramble: per team by default; per golfer tapped, $50, Papago, Save -> entryFee 50, entryFeePer golfer, venue from the course; Event details show them', async () => {
    const r = await arriveCold({ url: fileUrl('tournament.html', 'app=1'), db: empty(), auth: OWNER, settleMs: 3000, preScript: PROVIDER + CARRY,
        steps: [READ, { tap: '#t-fee-per button[data-per="golfer"]' }, { sleep: 100 }, READ].concat(PICK, [FILL('Hope Foundation Scramble')], SAVE, [READ, CARRIED]) });
    assert.ok(r.ok, r.reason);
    const [a, b, d] = objs(r);
    const c = JSON.parse(r.value.filter((v) => typeof v === 'string' && v[0] === '{').pop());
    assert.equal(a.tLabel, 'ENTRY FEE ($, OPTIONAL)', 'innerText carries the label\'s text-transform: no "per Team" in the label');
    assert.equal(a.tPerShown, true); assert.equal(a.tPer, 'team', 'a scramble fee is per team until the organizer says otherwise');
    assert.equal(a.feeBoxes, 1, 'one fee box on the create form');
    assert.equal(b.tPer, 'golfer');
    const rec = created(c);
    assert.equal(rec.entryFee, 50);
    assert.equal(rec.entryFeePer, 'golfer');
    assert.equal(rec.venue, 'Papago Golf Course', 'the venue is the picked course');
    assert.equal(d.manage, true, 'landed on the event');
    assert.equal(d.evFee, '50'); assert.equal(d.evPer, 'golfer'); assert.equal(d.evPerShown, true);
    assert.equal(d.evVenue, 'Papago Golf Course', 'filled in, editable');
    assert.equal(d.evFeeBoxes, 1, 'one fee box under Event details');
});

test('2 create, individual: the per control is hidden; the record says per golfer', async () => {
    const r = await arriveCold({ url: fileUrl('tournament.html', 'app=1'), db: empty(), auth: OWNER, settleMs: 3000, preScript: PROVIDER + CARRY,
        steps: [{ tap: '#fmt-individual' }, { sleep: 150 }, READ].concat(PICK, [FILL('Club Championship')], SAVE, [CARRIED]) });
    assert.ok(r.ok, r.reason);
    const [a] = objs(r);
    assert.equal(a.tPerShown, false, 'no teams to charge');
    const c = JSON.parse(r.value.filter((v) => typeof v === 'string' && v[0] === '{').pop());
    const rec = created(c);
    assert.equal(rec.entryFeePer, 'golfer');
    assert.equal(rec.venue, 'Papago Golf Course');
});

test('3 a team event with entryFee 400 and no entryFeePer: per team everywhere; tapping per golfer writes entryFeePer only', async () => {
    const db = F.scrambleDb({ ownerUid: 'u-org', entryFee: 400 });
    db.registrations = { SCR: { e1: { name: 'Al Lopez', paid: true, approvedAt: 1, teamNum: 4 }, e2: { name: 'Jo Kim', paid: false, approvedAt: 1, teamNum: 4 } } };
    const r = await arriveCold({ url: fileUrl('tournament.html', 'tourney=SCR'), db, auth: OWNER, settleMs: 3000,
        steps: [READ, { tap: '#tab-btn-desk' }, { sleep: 300 }, READ, { tap: '#tab-btn-setup' }, { sleep: 200 }, { tap: '#ev-fee-per button[data-per="golfer"]' }, { sleep: 200 }, READ] });
    assert.ok(r.ok, r.reason);
    const [a, b, d] = objs(r);
    assert.equal(a.evFee, '400'); assert.equal(a.evPer, 'team', 'a record from before today means per team');
    assert.match(b.desk, /\$400 per team/, 'the Desk line follows the per');
    assert.deepEqual(d.writes, [{ op: 'set', path: 'tournaments/SCR/entryFeePer', value: 'golfer' }]);
});

test('4 the note is green when a real card loads, amber for the placeholder', async () => {
    const ok = await arriveCold({ url: fileUrl('tournament.html', 'app=1'), db: empty(), auth: OWNER, settleMs: 3000, preScript: PROVIDER, steps: PICK.concat([READ]) });
    assert.ok(ok.ok, ok.reason);
    const [g] = objs(ok);
    assert.match(g.note, /^Scorecard loaded online: Papago Golf Course/);
    assert.equal(g.noteOk, true, 'green');
    const no = await arriveCold({ url: fileUrl('tournament.html', 'app=1'), db: empty(), auth: OWNER, settleMs: 3000, preScript: NOT_CONFIGURED, steps: PICK.concat([READ]) });
    assert.ok(no.ok, no.reason);
    const [p] = objs(no);
    assert.match(p.note, /Pars are set to 4/);
    assert.equal(p.noteOk, false, 'amber');
    assert.notEqual(g.noteBg, p.noteBg, 'two different backgrounds, measured');
});

test('5 money = base: the engines are main 97698412 byte for byte', () => {
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
    assert.equal(sha('payouts.js'), 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    assert.equal(sha('tournament-engine.js'), '1c659c46d0f91ca3dc61beb231e1356ea0a572fd7c3c40399399d36e2ff89f57');
    assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b83a10491e822ece946203d2bbb11264962e7d888a7b450f17');
});
