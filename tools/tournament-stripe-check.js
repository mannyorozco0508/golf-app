#!/usr/bin/env node
// ============================================================================
// STRIPE PHASE 1 (TEST MODE), IN A BROWSER - cold, with a STUBBED callable.
//
// No real Stripe and no real Cloud Function: firebase.functions() is a stand-in
// injected before any page script (preScript), the same way cold-arrival.js
// stands in for the database. It records every call, says what the database
// had been written to AT THE MOMENT it was called, and answers from a plan.
// The page's own firebase-functions-compat.js is blocked, so the stand-in is
// the only functions SDK the page can find.
//
// A DEVICE CHECK MAY NOT CALL A FUNCTION THE PAGE DEFINES. Nothing here does.
// Each arm navigates to the URL a golfer or organizer lands on and then only
// taps, types (Input.insertText) and reads innerText / rects.
//
//   node tools/tournament-stripe-check.js            measure
//   node tools/tournament-stripe-check.js --shots    also write 390x844 @2x
//        screenshots to ~/Desktop/claude-mailbox-shared/tournaments/screens-stripe/
//
//   exit 0   every arm measured what the JSON lists
//   exit 1   a divergence the JSON names
//   exit 2   could not run. NOTHING PROVEN.
//
// WHAT THIS CANNOT PROVE: the real createEntryCheckout / refundEntry / webhook
// (the server helper's), the real rules (the fees and paidVia keys are not in
// this branch's database.rules.json), and the real Stripe page.
// ============================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = path.join(os.homedir(), 'Desktop', 'claude-mailbox-shared', 'tournaments', 'screens-stripe');
if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });
const shot = (name) => SHOTS ? [{ shot: path.join(SHOT_DIR, name), viewportOnly: true }] : [];

const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const course = PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: ((i * 7) % 18) + 1 }));
const FEES_ON = { entryFeeCents: 10000, collectByCard: true, allowCash: true };
const base = {
    name: 'Rattle Classic', format: 'scramble', courseName: 'Papago', activeCourseKey: 'papago',
    courseData: course, entryFee: 0, createdAt: 1, ownerUid: 'u-org',
    eventDate: '2026-11-21', startTime: '08:00', startType: 'shotgun',
    teams: { team1: { num: 1, name: 'Team 1', players: ['Ann Alpha'], handicap: 0 } }
};
const NOV12 = new Date(2026, 10, 12, 10, 0, 0).getTime();
const deskEvent = Object.assign({}, base, {
    format: 'individual', scoringModel: 'player-v1', teams: null, fees: FEES_ON,
    players: { p1: { id: 'p1', name: 'Al Lopez', handicap: '12', addedAt: 2 } }
});
const deskRegs = {
    e1: { fullName: 'Al Lopez', email: 'al@example.com', phone: '6025550142', createdAt: 1, paid: true, paidAt: 5, paidVia: 'stripe', ref: 'pi_1', amountCents: 10000, approvedAt: 6, playerId: 'p1' },
    e2: { fullName: 'Sam Ortiz', email: 'sam@example.com', phone: '6025550143', createdAt: 2, paid: true, paidAt: 5, paidVia: 'cash' },
    e3: { fullName: 'Jo Kim', email: 'jo@example.com', phone: '6025550144', createdAt: 3 },
    e4: { fullName: 'Pat Reyes', email: 'pat@example.com', phone: '6025550145', createdAt: 4, paid: false, paidVia: 'stripe', ref: 'pi_4', amountCents: 10000, refundedAt: NOV12, refundCents: 10000, refundRef: 're_4' },
    e5: { fullName: 'Dee Nguyen', email: 'dee@example.com', phone: '6025550146', createdAt: 5, paid: true, paidVia: 'stripe', ref: 'pi_5', amountCents: 10000, refundPendingAt: 7 },
    e6: { fullName: 'Lee Park', email: 'lee@example.com', phone: '6025550147', createdAt: 6, paid: true, paidVia: 'stripe', ref: 'pi_6', amountCents: 10000, disputedAt: 8 }
};
const dayScores = {};
[1, 2, 3].forEach((h) => { dayScores['team1_h' + h] = PARS[h - 1] - 1; });
[1, 2, 3, 4, 5].forEach((h) => { dayScores['team3_h' + h] = PARS[h - 1] - 1; });
const dayEvent = Object.assign({}, base, {
    name: 'Day Scramble', payoutSpots: [600, 250], scores: dayScores,
    teams: {
        team1: { num: 1, name: 'Team 7', players: ['Ann Alpha', 'Bo Bravo'], handicap: 0 },
        team2: { num: 2, name: 'Team 15', players: ['Cal Charlie'], handicap: 0 },
        team3: { num: 3, name: 'Team 9', players: ['Dee Delta'], handicap: 0 }
    }
});
const db = {
    tournaments: {
        PLAIN1: base,                                                            // no fees node: today's page
        CARD1: Object.assign({}, base, { fees: FEES_ON }),
        NOCARD1: Object.assign({}, base, { fees: { entryFeeCents: 10000, collectByCard: false, allowCash: true } }),
        DESK1: deskEvent,
        PLAINDESK: Object.assign({}, deskEvent, { fees: null }),
        DAY1: dayEvent
    },
    registrations: {
        CARD1: { eBack: { fullName: 'Al Lopez', email: 'al@example.com', phone: '6025550142', createdAt: 1 } },
        DESK1: deskRegs,
        PLAINDESK: { e2: { fullName: 'Sam Ortiz', email: 'sam@example.com', phone: '6025550143', createdAt: 2, paid: true, paidAt: 5 }, e3: { fullName: 'Jo Kim', email: 'jo@example.com', phone: '6025550144', createdAt: 3 } },
        DAY1: { d1: { fullName: 'Ann Alpha', email: 'a@example.com', phone: '602-555-0100', createdAt: 1, teamNum: 1, approvedAt: 2, paid: true } }
    },
    payments: { allowedOwners: { 'u-org': true } },
    events: {}, trips: {}, global_courses: {}
};
const dbNotAllowed = Object.assign({}, db, { payments: { allowedOwners: {} } });

// THE STAND-IN CALLABLE. plan: { name: [ { ok: {...} } | { reason: '...' } ] };
// the last step of a list repeats. A createEntryCheckout url is decorated with
// the entry id it was asked for and whether that entry's registration write had
// ALREADY been recorded when the callable ran - so the order is read from the
// request the page made, which survives the navigation.
function fnStub(plan) {
    return `(function () {
      window.__fnCalls = [];
      var PLAN = ${JSON.stringify(plan)};
      window.firebase.functions = function () { return { httpsCallable: function (name) { return function (data) {
        var writes = (window.__coldWrites || []).map(function (w) { return w.op + ' ' + w.path; });
        window.__fnCalls.push({ name: name, data: data, writesBefore: writes });
        var q = PLAN[name] || [];
        var step = q.length > 1 ? q.shift() : q[0];
        if (!step) { var x = new Error('no plan'); x.code = 'functions/internal'; return Promise.reject(x); }
        if (step.reason !== undefined) { var e = new Error('refused'); e.code = 'functions/failed-precondition'; e.details = { reason: step.reason }; return Promise.reject(e); }
        var out = JSON.parse(JSON.stringify(step.ok || {}));
        if (name === 'createEntryCheckout' && out.url) {
          var wrote = writes.indexOf('set registrations/' + data.code + '/' + data.entryId) !== -1 ? 1 : 0;
          out.url = out.url + '?entry=' + encodeURIComponent(data.entryId) + '&wroteFirst=' + wrote + '&code=' + encodeURIComponent(data.code);
        }
        return Promise.resolve({ data: out });
      }; } }; };
    })();`;
}
const BLOCK = ['*firebase-functions-compat.js'];

const RECT = `(sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }`;
const txt = (sel) => `((document.querySelector(${JSON.stringify(sel)}) || {}).innerText || '')`;
const REG_PROBE = `(() => { const vis = ${RECT}; return JSON.stringify({
    pay: vis('#reg-pay'), submit: vis('#reg-submit'), feeBox: vis('#reg-fee-box'), cash: vis('#reg-cash-line'),
    payText: ${txt('#reg-pay')}, feeText: ${txt('#reg-fee-box')}, screen: ${txt('#register-screen')},
    checkout: vis('#reg-checkout') ? ${txt('#reg-checkout')} : '', status: ${txt('#reg-status')},
    calls: (window.__fnCalls || []).map(c => ({ name: c.name, data: c.data })) }); })()`;
const type = (sel, text) => [{ tap: sel }, { cdp: { method: 'Input.insertText', params: { text } } }];

async function run(name, opts) {
    const r = await arriveCold(Object.assign({ settleMs: 6000, blockUrls: BLOCK }, opts));
    if (!r.ok) return { name, ran: false, reason: r.reason, dialogs: r.dialogs };
    const values = (r.value || []).filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
    return { name, ran: true, values, requests: r.requests, raw: r.value };
}

(async () => {
    const out = {}; const failures = [];
    const check = (ok, msg) => { if (!ok) failures.push(msg); };
    const ownerAuth = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };

    // A. DEFAULT STATE: no fees node -> today's form, no pay surface.
    const a = await run('A-default', { url: fileUrl('tournament.html', 'register=PLAIN1'), db, preScript: fnStub({}), steps: [{ expression: REG_PROBE }] });
    out.A = a;
    if (a.ran) { const v = a.values[0];
        check(v.submit && !v.pay && !v.feeBox && !v.cash, 'A: no-fees form must show Sign up only: ' + JSON.stringify(v));
        check(!/Pay entry fee|Entry fee|Card payments/.test(v.screen), 'A: pay words on a no-fees form');
        check(/Sign up/.test(v.screen), 'A: positive - Sign up is on screen'); }
    // A2. collectByCard false -> the same, even with a fee set.
    const a2 = await run('A2-nocard', { url: fileUrl('tournament.html', 'register=NOCARD1'), db, preScript: fnStub({}), steps: [{ expression: REG_PROBE }] });
    out.A2 = a2;
    if (a2.ran) { const v = a2.values[0];
        check(v.submit && !v.pay && !v.feeBox, 'A2: collectByCard false must not show the pay button: ' + JSON.stringify(v)); }

    // B. M2a: fee from cents, pay writes the signup FIRST, then the callable, then location.
    const b = await run('B-pay', { url: fileUrl('tournament.html', 'register=CARD1'), db, navigatesAway: true,
        preScript: fnStub({ createEntryCheckout: [{ ok: { url: 'https://checkout.stripe.test/c/pay' } }] }),
        steps: [{ expression: REG_PROBE }, ...(SHOTS ? [{ expression: "document.getElementById('reg-cash-line').scrollIntoView({ block: 'end' }); 'scrolled'" }] : []), ...shot('M2a-register-pay.png'),
            ...type('#reg-name', 'Al Lopez'), ...type('#reg-email', 'al@example.com'), ...type('#reg-phone', '(602) 555-0142'),
            { tap: '#reg-pay' }, { sleep: 2500 }] });
    out.B = { ran: b.ran, reason: b.reason, first: b.values && b.values[0], checkoutRequests: (b.requests || []).filter((u) => /checkout\.stripe\.test/.test(u)) };
    if (b.ran) { const v = b.values[0];
        check(v.pay && v.feeBox && v.cash && !v.submit, 'B: card form must show the pay button, fee box and cash line: ' + JSON.stringify(v));
        check(v.payText.indexOf('Pay entry fee $100.00') === 0, 'B: pay button text: ' + v.payText);
        check(/\$100\.00/.test(v.feeText) && /Rattle Golf LLC/.test(v.feeText), 'B: fee box: ' + v.feeText);
        const req = out.B.checkoutRequests[0] || '';
        check(/wroteFirst=1/.test(req), 'B: the callable must run AFTER the registration write: ' + req);
        check(/code=CARD1/.test(req) && /entry=e/.test(req), 'B: the callable got code and entryId: ' + req); }

    // C. Every refusal reason -> its sentence, on the Registered . Unpaid panel.
    const REASONS = ['not-found', 'already-paid', 'not-collecting', 'not-allowed-owner', 'too-many-attempts', 'bad-fee'];
    // The order is chosen so Pay again stays on screen between taps: the three
    // reasons that remove it come last.
    const ORDER = ['too-many-attempts', 'not-found', 'bad-fee', 'already-paid'];
    const c = await run('C-reasons', { url: fileUrl('tournament.html', 'register=CARD1&entry=eBack&checkout=cancel'), db,
        preScript: fnStub({ createEntryCheckout: ORDER.map((r) => ({ reason: r })) }),
        steps: [{ expression: REG_PROBE }, ...shot('M2c-cancel-unpaid.png'),
            ...ORDER.flatMap(() => [{ tap: '#reg-pay-again' }, { sleep: 400 }, { expression: REG_PROBE }])] });
    out.C = c;
    if (c.ran) {
        const v0 = c.values[0];
        check(/Registered · Unpaid/.test(v0.checkout) && /Pay again/.test(v0.checkout), 'C: cancel shows Registered · Unpaid with Pay again: ' + v0.checkout);
        const seen = c.values.slice(1).map((v) => v.checkout);
        check(seen.length === ORDER.length, 'C: one panel per tap, got ' + seen.length);
        out.C.sentences = seen.map((s, i) => ORDER[i] + ' => ' + s.split('\n').filter((l) => /\./.test(l)).slice(-2).join(' | '));
        const sentence = { 'too-many-attempts': /Too many payment attempts/, 'not-found': /couldn't find your sign-up/, 'bad-fee': /isn't set up right/, 'already-paid': /already paid/ };
        ORDER.forEach((r, i) => check(sentence[r].test(seen[i] || ''), 'C: reason ' + r + ' did not show its sentence: ' + seen[i]));
        check(!/Pay again/.test(seen[ORDER.length - 1] || ''), 'C: already-paid must not offer Pay again');
    }
    // C2. the two "not taking cards" reasons, each on its own arrival.
    for (const r of ['not-collecting', 'not-allowed-owner']) {
        const cc = await run('C2-' + r, { url: fileUrl('tournament.html', 'register=CARD1&entry=eBack&checkout=cancel'), db,
            preScript: fnStub({ createEntryCheckout: [{ reason: r }] }), steps: [{ tap: '#reg-pay-again' }, { sleep: 400 }, { expression: REG_PROBE }] });
        out['C2-' + r] = cc.ran ? cc.values[0].checkout : cc.reason;
        if (cc.ran) check(/pay the organizer at the course/.test(cc.values[0].checkout) && !/Pay again/.test(cc.values[0].checkout), 'C2: ' + r + ': ' + cc.values[0].checkout);
    }
    out.reasonsCovered = REASONS;

    // D. M2c done: waits on the RECORD. A cash paid is not Paid; paid+stripe is.
    const recPath = 'registrations/CARD1/eBack';
    const d = await run('D-done', { url: fileUrl('tournament.html', 'register=CARD1&entry=eBack&checkout=done'), db, preScript: fnStub({}),
        steps: [{ expression: REG_PROBE },
            { deliver: { path: recPath, value: Object.assign({}, db.registrations.CARD1.eBack, { paid: true, paidVia: 'cash' }) } }, { sleep: 200 }, { expression: REG_PROBE },
            { deliver: { path: recPath, value: Object.assign({}, db.registrations.CARD1.eBack, { paid: true, paidVia: 'stripe', amountCents: 10000, ref: 'pi_x' }) } }, { sleep: 200 }, { expression: REG_PROBE },
            ...shot('M2c-registered-paid.png')] });
    out.D = d;
    if (d.ran) { const [v0, v1, v2] = d.values;
        const deliveries = d.raw.filter((x) => x && typeof x === 'object' && 'listeners' in x);
        check(deliveries.every((x) => x.listeners > 0 && x.threw.length === 0), 'D: a delivery reached no listener or threw: ' + JSON.stringify(deliveries));
        check(/Payment processing/.test(v0.checkout), 'D: arrival shows Payment processing: ' + v0.checkout);
        check(/Payment processing/.test(v1.checkout) && !/registered · Paid/.test(v1.checkout), 'D: paidVia cash must NOT read as Paid: ' + v1.checkout);
        check(/You're registered · Paid/.test(v2.checkout) && /\$100\.00 paid by card/.test(v2.checkout) && /Shotgun 8:00 AM/.test(v2.checkout), 'D: paid by stripe shows Paid: ' + v2.checkout); }

    // E. M3 Desk with fees, as the owner.
    const DESK_PROBE = `(() => { const list = document.getElementById('registration-list');
        const row = (id) => list.querySelector('.reg-row[data-entry-id="' + id + '"]');
        const r = (id) => { const el = row(id); return el ? { text: el.innerText, undo: !!el.querySelector('.reg-undo-btn'), refund: !!el.querySelector('.reg-refund-btn'), cash: !!el.querySelector('.reg-cash-btn'), box: !!el.querySelector('input[type=checkbox]') } : null; };
        return JSON.stringify({ tiles: ${txt('#pay-tiles')}, note: ${txt('#pay-note')}, chips: ${txt('#registration-chips')},
          e1: r('e1'), e2: r('e2'), e3: r('e3'), e4: r('e4'), e5: r('e5'), e6: r('e6'),
          checkboxes: list.querySelectorAll('input[type=checkbox]').length, refunds: list.querySelectorAll('.reg-refund-btn').length,
          sheet: (document.getElementById('refund-sheet').classList.contains('open') ? ${txt('#refund-sheet-body')} : ''),
          writes: (window.__coldWrites || []).map(w => w.op + ' ' + w.path + ' ' + JSON.stringify(w.value === undefined ? null : w.value)),
          calls: (window.__fnCalls || []).map(c => c.name + ' ' + JSON.stringify(c.data)) }); })()`;
    const e = await run('E-desk', { url: fileUrl('tournament.html', 'tourney=DESK1'), db, auth: ownerAuth, settleMs: 7000,
        preScript: fnStub({ refundEntry: [{ ok: { status: 'pending' } }] }),
        steps: [{ tap: '#tab-btn-desk' }, { sleep: 300 }, { expression: DESK_PROBE }, ...shot('M3-desk.png'),
            { tap: '.reg-row[data-entry-id="e3"] .reg-cash-btn' }, { sleep: 300 }, { expression: DESK_PROBE },
            { tap: '.reg-row[data-entry-id="e1"] .reg-refund-btn' }, { sleep: 300 }, { expression: DESK_PROBE }, ...shot('M3-refund-sheet.png'),
            { tap: '#refund-confirm' }, { sleep: 500 }, { expression: DESK_PROBE }, ...shot('M3-remove-from-field.png'),
            { tap: '#refund-remove-yes' }, { sleep: 400 }, { expression: DESK_PROBE }] });
    out.E = e.ran ? { values: e.values.map((v) => ({ tiles: v.tiles, note: v.note, chips: v.chips, sheet: v.sheet, writes: v.writes, calls: v.calls })) } : e;
    if (e.ran) { const [v0, v1, v2, v3, v4] = e.values;
        check(/\$100\s*card \(1\)/.test(v0.tiles) && /\$100\s*cash \(1\)/.test(v0.tiles) && /\$100\s*unpaid \(1\)/.test(v0.tiles), 'E: tiles from cents: ' + JSON.stringify(v0.tiles));
        check(/absorbed by Rattle Golf/.test(v0.note) && /1 refund: \$100\./.test(v0.note), 'E: card-fee note: ' + v0.note);
        check(/All 6/.test(v0.chips) && /Card 1/.test(v0.chips) && /Cash 1/.test(v0.chips) && /Unpaid 1/.test(v0.chips) && /Refunded 3/.test(v0.chips), 'E: filters: ' + v0.chips);
        check(/Paid \(Stripe\) \$100/.test(v0.e1.text) && v0.e1.refund && !v0.e1.undo && !v0.e1.box && !v0.e1.cash, 'E: Stripe row: Refund, no Undo, no checkbox: ' + JSON.stringify(v0.e1));
        check(/Paid \(cash\)/.test(v0.e2.text) && v0.e2.undo && !v0.e2.refund, 'E: cash row has Undo: ' + JSON.stringify(v0.e2));
        check(/Unpaid/.test(v0.e3.text) && v0.e3.cash, 'E: unpaid row has Mark cash paid: ' + JSON.stringify(v0.e3));
        check(/Refunded \$100 · Nov 12/.test(v0.e4.text) && !v0.e4.undo && !v0.e4.refund && !v0.e4.cash, 'E: refunded row: ' + JSON.stringify(v0.e4));
        check(/Refund pending/.test(v0.e5.text) && !v0.e5.refund && !v0.e5.undo, 'E: refund pending row: ' + JSON.stringify(v0.e5));
        check(/Disputed/.test(v0.e6.text) && !v0.e6.refund && !v0.e6.undo, 'E: disputed row: ' + JSON.stringify(v0.e6));
        check(v0.checkboxes === 0 && v0.refunds === 1, 'E: no Paid checkbox with fees on; exactly one Refund: ' + v0.checkboxes + '/' + v0.refunds);
        const cashWrite = v1.writes.filter((w) => /registrations\/DESK1\/e3/.test(w));
        check(cashWrite.length === 1 && /"paid":true/.test(cashWrite[0]) && /"paidVia":"cash"/.test(cashWrite[0]) && /"paidAt":\d+/.test(cashWrite[0]), 'E: Mark cash paid writes paid/paidAt/paidVia cash: ' + JSON.stringify(cashWrite));
        check(/Refund Al Lopez \$100\.00\?/.test(v2.sheet), 'E: refund sheet: ' + v2.sheet);
        check(v3.calls.length === 1 && /refundEntry \{"code":"DESK1","entryId":"e1"\}/.test(v3.calls[0]), 'E: refundEntry called once with code+entryId: ' + JSON.stringify(v3.calls));
        check(/Also remove from the field\?/.test(v3.sheet), 'E: asks Also remove from the field?: ' + v3.sheet);
        const before = v3.writes.length, after = v4.writes.slice(before);
        check(v3.writes.length === v1.writes.length, 'E: the refund itself wrote nothing from the page: ' + JSON.stringify(v3.writes.slice(v1.writes.length)));
        check(after.length === 1 && /set tournaments\/DESK1\/players\/p1\/status "withdrawn"/.test(after[0]), 'E: yes = one owner write, withdrawn: ' + JSON.stringify(after));
        check(v4.sheet === '', 'E: the sheet closes after yes'); }

    // F. Desk with NO fees: exactly today's controls.
    const f = await run('F-plaindesk', { url: fileUrl('tournament.html', 'tourney=PLAINDESK'), db, auth: ownerAuth, settleMs: 7000, preScript: fnStub({}),
        steps: [{ tap: '#tab-btn-desk' }, { sleep: 300 }, { expression: `JSON.stringify({ desk: ${txt('#manage-tab-desk')}, boxes: document.querySelectorAll('#registration-list input[type=checkbox]').length, tiles: !!document.getElementById('pay-tiles'), btns: document.querySelectorAll('#registration-list .reg-pay-btn').length })` }] });
    out.F = f.ran ? f.values[0] : f;
    if (f.ran) { const v = f.values[0];
        check(v.boxes === 2 && !v.tiles && v.btns === 0 && /Tick Paid when you have the cash/.test(v.desk), 'F: no-fees desk must be today\'s: ' + JSON.stringify(v)); }

    // G. Non-owner: no desk, no Refund anywhere on screen.
    const g = await run('G-visitor', { url: fileUrl('tournament.html', 'tourney=DESK1'), db, auth: 'signed-out', settleMs: 7000, preScript: fnStub({}),
        steps: [{ expression: `JSON.stringify({ refunds: Array.from(document.querySelectorAll('.reg-refund-btn')).filter(b => b.getBoundingClientRect().width > 0).length, board: ${txt('#manage-tab-leaderboard')}, day: ${txt('#event-day-panel')}, fees: ${txt('#entry-fees-block')} })` }] });
    out.G = g.ran ? g.values[0] : g;
    if (g.ran) { const v = g.values[0];
        check(v.refunds === 0 && v.day === '' && v.fees === '', 'G: a visitor sees no Refund, no event-day panel, no fees card: ' + JSON.stringify(v));
        check(/Rattle Classic/.test(v.board), 'G: positive - the visitor does see the board'); }

    // H. M4 fees card: allow-listed owner, then not allow-listed.
    const FEES_PROBE = `JSON.stringify({ card: ${txt('#entry-fees-block')}, toggle: !!document.getElementById('fees-card'), err: ${txt('#fees-error')},
        writes: (window.__coldWrites || []).filter(w => /fees/.test(w.path)).map(w => w.op + ' ' + w.path + ' ' + JSON.stringify(w.value === undefined ? null : w.value)) })`;
    const selectAll = { cdp: { method: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 4, commands: ['selectAll'] } } };
    const h = await run('H-fees', { url: fileUrl('tournament.html', 'tourney=CARD1'), db, auth: ownerAuth, settleMs: 7000, preScript: fnStub({}),
        steps: [{ expression: FEES_PROBE }, { tap: '#entry-fees-block' }, ...shot('M4-entry-fees.png'),
            { tap: '#fees-dollars' }, selectAll, { cdp: { method: 'Input.insertText', params: { text: '85.555' } } }, { tap: '#ev-name' }, { sleep: 300 }, { expression: FEES_PROBE },
            { tap: '#fees-dollars' }, selectAll, { cdp: { method: 'Input.insertText', params: { text: '85.50' } } }, { tap: '#ev-name' }, { sleep: 300 }, { expression: FEES_PROBE }] });
    out.H = h.ran ? h.values : h;
    if (h.ran) { const [v0, v1, v2] = h.values;
        check(v0.toggle && /STRIPE CONNECTED/.test(v0.card) && /TEST MODE/.test(v0.card) && /Collect entry fees by card/.test(v0.card), 'H: allow-listed owner sees the card toggle: ' + v0.card);
        check(/from \$1\.00 to \$1,000\.00|dollars and cents/.test(v1.err) && v1.writes.length === 0, 'H: 85.555 refused, nothing written: ' + JSON.stringify(v1));
        check(v2.writes.length === 1 && /"entryFeeCents":8550/.test(v2.writes[0]), 'H: 85.50 stored as 8550 cents: ' + JSON.stringify(v2.writes)); }
    const h2 = await run('H2-notallowed', { url: fileUrl('tournament.html', 'tourney=CARD1'), db: dbNotAllowed, auth: ownerAuth, settleMs: 7000, preScript: fnStub({}),
        steps: [{ expression: FEES_PROBE }, { tap: '#entry-fees-block' }, ...shot('M4-entry-fees-coming-soon.png')] });
    out.H2 = h2.ran ? h2.values[0] : h2;
    if (h2.ran) { const v = h2.values[0];
        check(!v.toggle && /Card payments coming soon/.test(v.card) && !/STRIPE CONNECTED/.test(v.card), 'H2: not allow-listed: no toggle, coming soon: ' + v.card);
        check(/Entry fees/.test(v.card), 'H2: positive - the card is there'); }

    // I. M1 web part: the event-day panel, owner, on the board. Team 7 was
    // last seen moving 41 minutes ago - seeded in the page's own storage key.
    const seed = `try { localStorage.setItem('hpEventDaySeen:DAY1', JSON.stringify({ team1: { thru: 3, at: Date.now() - 41 * 60 * 1000 } })); } catch (e) {}`;
    const i = await run('I-day', { url: fileUrl('tournament.html', 'tourney=DAY1'), db, auth: ownerAuth, settleMs: 7000, preScript: fnStub({}) + seed,
        steps: [{ tap: '#tab-btn-leaderboard' }, { sleep: 300 }, { expression: `JSON.stringify({ day: ${txt('#event-day-panel')}, sms: (document.querySelector('#event-day-panel a.day-text') || {}).href || '', prizes: ${txt('#payout-results')} })` }, ...shot('M1-event-day.png')] });
    out.I = i.ran ? i.values[0] : i;
    if (i.ran) { const v = i.values[0];
        check(/2 of 3 teams posting/.test(v.day) && /1 quiet 40\+ min/.test(v.day) && /Team 7 · last score/.test(v.day) && /Team 15 · no scores yet/.test(v.day), 'I: scores by team: ' + v.day);
        check(/1st Team 9\s*\$600\.00/.test(v.day) && /2nd Team 7\s*\$250\.00/.test(v.day), 'I: prize summary from the saved spots: ' + v.day);
        check(/1 of 1 in the field · 1 paid · 0 unpaid/.test(v.day), 'I: desk counts: ' + v.day);
        check(/^sms:6025550100$/.test(v.sms), 'I: Text team uses the team\'s registration phone: ' + v.sms); }

    // K. M6: the HardPan Tournaments bar on both pages, Rattle Golf as the company line.
    const BAR_PROBE = `JSON.stringify({ bar: ${txt('#hp-brand')}, w: Math.round((document.getElementById('hp-brand') || { getBoundingClientRect: () => ({ width: 0 }) }).getBoundingClientRect().width), title: document.title })`;
    const k1 = await run('K-landing', { url: fileUrl('tournament.html', ''), db, preScript: fnStub({}), steps: [{ expression: BAR_PROBE }, ...shot('M6-landing.png')] });
    const k2 = await run('K-scorecard', { url: fileUrl('tournament-scorecard.html', 'tourney=CARD1&team=1'), db, preScript: fnStub({}), steps: [{ expression: BAR_PROBE }, ...shot('M6-scorecard.png')] });
    out.K = [k1.ran ? k1.values[0] : k1, k2.ran ? k2.values[0] : k2];
    [k1, k2].forEach((k) => { if (k.ran) { const v = k.values[0];
        check(/HardPan Tournaments/.test(v.bar) && /by Rattle Golf/.test(v.bar) && v.w > 300, k.name + ': the bar: ' + JSON.stringify(v));
        check(v.title === 'Rattle Golf Tournaments', k.name + ': the tab title is unchanged: ' + v.title); } });

    const verdict = failures.length ? 'DIVERGENCE' : 'OK';
    const notRun = Object.entries(out).filter(([, v]) => v && v.ran === false);
    if (notRun.length) { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', notRun }, null, 2)); process.exit(2); }
    console.log(JSON.stringify({ verdict, failures, shots: SHOTS ? SHOT_DIR : null, out }, null, 2));
    process.exit(failures.length ? 1 : 0);
})();
