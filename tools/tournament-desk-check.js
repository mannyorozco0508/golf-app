#!/usr/bin/env node
// ============================================================================
// THE DESK, IN CHROME, AT EVENT-DAY SIZE: 142 signups, real taps, a snapshot
// landing mid-search.
//
// tournament_desk_2c_test.js drives the same rules in mini-dom. This check opens
// tournament.html?tourney=OWNED1 COLD as the owner (tools/lib/cold-arrival.js)
// with the many-entry fixture (helpers/registration-desk-fixture.js) and does
// what an organizer does, by real CDP taps and keystrokes - it calls nothing the
// page defines:
//
//   - taps the Desk tab: the panel has a rect, the counts and chips are on
//     screen, 142 rows are listed, the search box is OUTSIDE #registration-list
//   - taps "Approve into field" on Ben (e001): the stub records the team set and
//     the entry update; when the snapshot comes back the row reads "In the field"
//   - taps the search box and TYPES "g7@example": one row
//   - a NEW SIGNUP LANDS while the search is typed (the stub delivers the next
//     snapshot): the text is still in the box, the row count is still one, the
//     counts and chips moved to 143. This is the failure the recon predicted -
//     a renderer that rebuilds the search box with the list wipes it.
//   - deletes the search, taps the Unpaid chip: 73 rows; taps Ben's Paid box:
//     the stub records { paid: true, paidAt }; the snapshot comes back and Ben
//     leaves the Unpaid list; the Paid chip reads 71
//   - INDIV1 (individual, $100): the fees line carries the total; Approve mints
//     a player record
//   - signed out: no Desk tab, no Desk panel, no registrant on screen
//   - OWNED2 (2026-09-18, the state badges): the SAME 142 signups on the
//     fixture's teams (deskTeams(): the Eagles, the Hawks - a NAMED team of one -
//     and "Team 3", a default-named team of one). At 390 px: no horizontal
//     overflow, every row a payment badge with a rect, e130 "In the field" +
//     "Needs a team", e120 (Hawks) no Needs badge, four badge backgrounds all
//     different, badge text >= 11 px; the sixth chip "Needs a team 1" tapped
//     shows one row, e130. "Scannable on a phone" is the ask; this is what
//     measures it. On INDIV1 there is no sixth chip.
//
// EXIT 0 PASS, 1 FAIL, 2 could not run.
// ============================================================================
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const { deskEntries, deskTeams, TOTALS } = require('../helpers/registration-desk-fixture.js');

const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const course = PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: ((i * 7) % 18) + 1 }));
const teams = { team1: { num: 1, name: 'Eagles', players: ['Ann Alpha', 'Bo Bravo'], handicap: 0 }, team2: { num: 2, name: 'Hawks', players: ['Cal Charlie'], handicap: 0 } };
const owned = { name: 'Desk Scramble', format: 'scramble', courseName: 'Tidewater', activeCourseKey: 'tidewater', courseData: course, entryFee: 400, teams, createdAt: 1, ownerUid: 'u-org', courseIndexSynthetic: false };
const indiv = { name: 'Desk Stroke', format: 'individual', scoringModel: 'player-v1', scoringMode: 'gross', courseName: 'Tidewater', activeCourseKey: 'tidewater', courseData: course, entryFee: 100, teams: {}, players: {}, createdAt: 1, ownerUid: 'u-org', courseIndexSynthetic: false };
const TEAM_REGS = deskEntries('team'), INDIV_REGS = deskEntries('individual');
// OWNED2: the same event on the fixture's teams (the singleton "Team 3" exists
// here, so Ben's approval on OWNED1 - which must mint team3 - keeps its own record).
const owned2 = Object.assign({}, owned, { name: 'Desk Scramble Two', teams: deskTeams() });
const db = { tournaments: { OWNED1: owned, OWNED2: owned2, INDIV1: indiv }, registrations: { OWNED1: TEAM_REGS, OWNED2: TEAM_REGS, INDIV1: INDIV_REGS }, events: {}, trips: {}, global_courses: {} };
const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };

// Records every set/update the page makes and keeps the registrations value
// callback so a later step can deliver "the next snapshot" the way the SDK would.
const PRE = `
(function () {
  window.__writes = []; window.__regCb = null;
  var database = window.firebase.database;
  window.firebase.database = function () {
    var real = database.apply(this, arguments);
    var ref = real.ref;
    real.ref = function (p) {
      var r = ref.call(this, p); var on = r.on, set = r.set, update = r.update;
      r.on = function (ev, cb) { if (ev === 'value' && /^registrations\\/[A-Z0-9]+$/.test(String(p))) window.__regCb = cb; return on.call(this, ev, cb); };
      r.set = function (v) { window.__writes.push({ op: 'set', path: String(p), value: JSON.parse(JSON.stringify(v)) }); return set.call(this, v); };
      r.update = function (v) { window.__writes.push({ op: 'update', path: String(p), value: JSON.parse(JSON.stringify(v)) }); return update.call(this, v); };
      return r;
    };
    return real;
  };
  window.__deliver = function (val) { if (!window.__regCb) return 'no callback'; window.__regCb({ val: function () { return val; }, exists: function () { return true; } }); return 'delivered'; };
})();`;

const PROBE = `(function () {
  var T = function (id) { var e = document.getElementById(id); return e ? e.innerText.replace(/\\s+/g, ' ').trim() : null; };
  var R = function (el) { if (!el) return null; var b = el.getBoundingClientRect(); return { top: Math.round(b.top), h: Math.round(b.height), w: Math.round(b.width) }; };
  var desk = document.getElementById('manage-tab-desk'), list = document.getElementById('registration-list'), search = document.getElementById('registration-search');
  var rows = list ? list.querySelectorAll('.reg-row') : [];
  var row = function (id) { var r = list && list.querySelector('.reg-row[data-entry-id="' + id + '"]'); return r ? { text: r.innerText.replace(/\\s+/g, ' ').trim(), checked: !!(r.querySelector('input[type=checkbox]') && r.querySelector('input[type=checkbox]').checked) } : null; };
  return JSON.stringify({
    deskTab: !!document.getElementById('tab-btn-desk'), deskTabRect: R(document.getElementById('tab-btn-desk')),
    deskDisplay: desk ? getComputedStyle(desk).display : 'absent', setupDisplay: (function () { var s = document.getElementById('manage-tab-setup'); return s ? getComputedStyle(s).display : 'absent'; })(),
    counts: T('registration-counts'), chips: T('registration-chips'), activeChip: (function () { var c = document.querySelector('.reg-chip.active'); return c ? c.innerText.trim() : null; })(),
    rows: rows.length, listRect: R(list), searchRect: R(search), searchValue: search ? search.value : null,
    searchOutsideList: !!(search && !search.closest('#registration-list')), chipsOutsideList: !!(document.getElementById('registration-chips') && !document.getElementById('registration-chips').closest('#registration-list')),
    e001: row('e001'), first: rows[0] ? rows[0].getAttribute('data-entry-id') : null, last: rows.length ? rows[rows.length - 1].getAttribute('data-entry-id') : null,
    dupMarks: list ? list.querySelectorAll('.reg-dup').length : 0,
    writes: window.__writes.slice(), bodyHasRegistrant: /Ben Bsurname1/.test(document.body.innerText)
  });
})()`;

const BACKSPACES = [];
for (let i = 0; i < 10; i++) {
    BACKSPACES.push({ cdp: { method: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 } } });
    BACKSPACES.push({ cdp: { method: 'Input.dispatchKeyEvent', params: { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 } } });
}
const deliver = (val) => ({ expression: `window.__deliver(${JSON.stringify(val)})` });

(async () => {
    const failures = [];
    const bail = (why, extra) => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2)); process.exit(2); };
    const J = (r, i) => { try { return JSON.parse(r.value[i]); } catch (e) { return null; } };

    // ---- TEAM EVENT, THE OWNER ---------------------------------------------
    const approved = JSON.parse(JSON.stringify(TEAM_REGS)); approved.e001 = Object.assign({}, approved.e001, { approvedAt: 9000, teamNum: 3 });
    const withNew = JSON.parse(JSON.stringify(approved)); withNew.e142 = { fullName: 'Zed Newcomer', email: 'zed@example.com', phone: '555-9142', createdAt: 6000 };
    const benPaid = JSON.parse(JSON.stringify(withNew)); benPaid.e001 = Object.assign({}, benPaid.e001, { paid: true, paidAt: 9500 });
    const t = await arriveCold({ url: fileUrl('tournament.html', 'tourney=OWNED1'), db, auth: OWNER, viewport: { width: 390, height: 844 }, preScript: PRE, settleMs: 6000, steps: [
        { expression: PROBE },                                                                   // 0 arrival: Setup shown, Desk tab present
        { tap: '#tab-btn-desk' }, { sleep: 250 }, { expression: PROBE },                          // 1-3 the desk
        { tap: '#registration-list .reg-row[data-entry-id="e001"] button' }, { sleep: 400 }, { expression: PROBE },  // 4-6 Approve
        deliver(approved), { sleep: 250 }, { expression: PROBE },                                 // 7-9 the snapshot back
        { tap: '#registration-search' }, { cdp: { method: 'Input.insertText', params: { text: 'g7@example' } } }, { sleep: 250 }, { expression: PROBE },  // 10-13 typed
        deliver(withNew), { sleep: 250 }, { expression: PROBE },                                  // 14-16 a signup lands mid-search
        ...BACKSPACES, { sleep: 250 }, { expression: PROBE },                                     // 17-38 cleared
        { tap: '.reg-chip', nth: 1 }, { sleep: 250 }, { expression: PROBE },                      // 39-41 Unpaid
        { tap: '#registration-list .reg-row[data-entry-id="e001"] input[type=checkbox]' }, { sleep: 400 }, { expression: PROBE },  // 42-44 Paid
        deliver(benPaid), { sleep: 250 }, { expression: PROBE },                                  // 45-47 the snapshot back
        { tap: '.reg-chip', nth: 2 }, { sleep: 250 }, { expression: PROBE }                       // 48-50 Paid chip
    ] });
    if (!t.ok) bail(t.reason);
    const taps = t.value.filter(v => typeof v === 'string' && /^no element/.test(v));
    if (taps.length) bail('a tap found no element', taps);
    const arrival = J(t, 0), desk = J(t, 3), afterApprove = J(t, 6), approvedBack = J(t, 9), typed = J(t, 13), midSearch = J(t, 16), cleared = J(t, 38), unpaid = J(t, 41), paidTap = J(t, 44), paidBack = J(t, 47), paidChip = J(t, 50);
    if (!arrival || !desk || !typed || !midSearch || !paidChip) bail('a probe did not parse', t.value.map(v => String(v).slice(0, 60)));

    if (!arrival.deskTab || !(arrival.deskTabRect && arrival.deskTabRect.w > 0)) failures.push('arrival: the Desk tab has no rect');
    if (arrival.deskDisplay !== 'none' || arrival.setupDisplay !== 'block') failures.push('arrival: Setup should be the shown tab: ' + JSON.stringify([arrival.setupDisplay, arrival.deskDisplay]));
    if (desk.deskDisplay !== 'block' || desk.setupDisplay !== 'none') failures.push('desk: tapping the tab did not show the Desk panel');
    if (desk.rows !== TOTALS.entries) failures.push('desk: ' + desk.rows + ' rows, wanted ' + TOTALS.entries);
    if (!/^142 signups · 70 paid · 14 in the field/.test(desk.counts || '')) failures.push('desk: first counts line: ' + desk.counts);
    if (!/70 paid golfers · \$400 per team · teams form at approval/.test(desk.counts || '')) failures.push('desk: the team fee line: ' + desk.counts);
    if (!/Shirts 28 S · 29 M · 29 L · 28 XL/.test(desk.counts || '') || !/Dinner guests 106 · 107 of 142 answered/.test(desk.counts || '')) failures.push('desk: dinner/shirt lines: ' + desk.counts);
    if (!/All 142/.test(desk.chips || '') || !/Unpaid 72/.test(desk.chips || '') || !/Not yet approved 128/.test(desk.chips || '')) failures.push('desk: chips: ' + desk.chips);
    if (!desk.searchRect || desk.searchRect.h === 0) failures.push('desk: the search box has no rect');
    if (!desk.searchOutsideList || !desk.chipsOutsideList) failures.push('desk: search or chips are INSIDE #registration-list');
    if (desk.first !== 'e000' || desk.last !== 'e141') failures.push('desk: sort: first ' + desk.first + ' last ' + desk.last);
    if (desk.dupMarks !== 4) failures.push('desk: ' + desk.dupMarks + ' duplicate marks, wanted 4');
    if (!desk.e001 || !/Approve into field/.test(desk.e001.text)) failures.push('desk: Ben has no Approve button: ' + JSON.stringify(desk.e001));

    const w1 = (afterApprove && afterApprove.writes) || [];
    const teamSet = w1.find(x => x.op === 'set' && x.path === 'tournaments/OWNED1/teams/team3');
    const mark = w1.find(x => x.op === 'update' && x.path === 'registrations/OWNED1/e001');
    if (!teamSet || !(teamSet.value.players && teamSet.value.players[0] === 'Ben Bsurname1')) failures.push('approve: no team3 set with Ben: ' + JSON.stringify(w1));
    if (!mark || mark.value.teamNum !== 3 || typeof mark.value.approvedAt !== 'number') failures.push('approve: the entry was not marked: ' + JSON.stringify(w1));
    if (!approvedBack || !approvedBack.e001 || !/In the field/.test(approvedBack.e001.text)) failures.push('approve: after the snapshot Ben does not read "In the field": ' + JSON.stringify(approvedBack && approvedBack.e001));
    if (approvedBack && !/Approved 15/.test(approvedBack.chips || '')) failures.push('approve: the Approved chip did not move to 15: ' + approvedBack.chips);

    if (typed.searchValue !== 'g7@example') failures.push('typed: the box holds ' + JSON.stringify(typed.searchValue));
    if (typed.rows !== 1) failures.push('typed: ' + typed.rows + ' rows for "g7@example", wanted 1');
    if (midSearch.searchValue !== 'g7@example') failures.push('MID-SEARCH SNAPSHOT WIPED THE BOX: ' + JSON.stringify(midSearch.searchValue));
    if (midSearch.rows !== 1) failures.push('mid-search: ' + midSearch.rows + ' rows after the snapshot, wanted 1');
    if (!/^143 signups/.test(midSearch.counts || '') || !/All 143/.test(midSearch.chips || '')) failures.push('mid-search: counts/chips did not move to 143: ' + midSearch.counts + ' | ' + midSearch.chips);
    if (cleared.searchValue !== '' || cleared.rows !== 143) failures.push('cleared: value ' + JSON.stringify(cleared.searchValue) + ', rows ' + cleared.rows);

    if (unpaid.activeChip !== 'Unpaid 73' || unpaid.rows !== 73) failures.push('unpaid chip: active ' + unpaid.activeChip + ', rows ' + unpaid.rows);
    if (unpaid.first !== 'e001') failures.push('unpaid: the first row should be Ben (e001): ' + unpaid.first);
    const w2 = (paidTap && paidTap.writes) || [];
    const paidWrite = w2.find(x => x.op === 'update' && x.path === 'registrations/OWNED1/e001' && x.value.paid === true);
    if (!paidWrite || typeof paidWrite.value.paidAt !== 'number') failures.push('paid: no { paid: true, paidAt } update for e001: ' + JSON.stringify(w2.slice(-3)));
    if (!paidTap.e001 || !paidTap.e001.checked) failures.push('paid: the box did not tick');
    if (paidBack.e001 !== null) failures.push('paid: after the snapshot Ben is still in the Unpaid list');
    if (paidBack.rows !== 72 || !/Paid 71/.test(paidBack.chips || '')) failures.push('paid: rows ' + paidBack.rows + ', chips ' + paidBack.chips);
    if (paidChip.activeChip !== 'Paid 71' || !paidChip.e001 || !paidChip.e001.checked || !/In the field/.test(paidChip.e001.text)) failures.push('paid chip: ' + JSON.stringify([paidChip.activeChip, paidChip.e001]));
    if (w2.some(x => /\/scores\//.test(x.path))) failures.push('a score path was written');

    // ---- INDIVIDUAL EVENT ----------------------------------------------------
    const i = await arriveCold({ url: fileUrl('tournament.html', 'tourney=INDIV1'), db, auth: OWNER, viewport: { width: 390, height: 844 }, preScript: PRE, settleMs: 6000, steps: [
        { tap: '#tab-btn-desk' }, { sleep: 250 }, { expression: PROBE },
        { tap: '#registration-list .reg-row[data-entry-id="e001"] button' }, { sleep: 400 }, { expression: PROBE }
    ] });
    if (!i.ok) bail(i.reason);
    const iDesk = J(i, 2), iApprove = J(i, 5);
    if (!iDesk) bail('individual probe did not parse', i.value);
    if (!/Fees collected \$7,000 · 70 paid × \$100/.test(iDesk.counts || '')) failures.push('individual: fees line: ' + iDesk.counts);
    if (/per team/.test(iDesk.counts || '')) failures.push('individual: the team sentence is on an individual event');
    if (iDesk.rows !== TOTALS.entries) failures.push('individual: rows ' + iDesk.rows);
    const w3 = (iApprove && iApprove.writes) || [];
    const player = w3.find(x => x.op === 'set' && /^tournaments\/INDIV1\/players\/p/.test(x.path));
    if (!player || player.value.name !== 'Ben Bsurname1') failures.push('individual approve: no player set: ' + JSON.stringify(w3));

    // ---- SIGNED OUT ------------------------------------------------------------
    const s = await arriveCold({ url: fileUrl('tournament.html', 'tourney=OWNED1'), db, auth: 'signed-out', viewport: { width: 390, height: 844 }, preScript: PRE, settleMs: 6000, expression: PROBE });
    if (!s.ok) bail(s.reason);
    const out = JSON.parse(s.value);
    if (out.deskTab) failures.push('signed out: the Desk tab exists');
    if (out.deskDisplay !== 'absent') failures.push('signed out: the Desk panel exists (' + out.deskDisplay + ')');
    if (out.bodyHasRegistrant) failures.push('signed out: a registrant name is on screen');

    // ---- SIGNED OUT, THEN THE OWNER SIGNS IN (record first) --------------------
    // The order the gate's re-insertion has to get right in a REAL DOM: Setup's
    // recorded next sibling is the Desk tab, itself removed. insertBefore on an
    // anchor that is not in the tree throws NotFoundError - mini-dom tolerates
    // it, so only this arm can prove the tabs come back in order.
    const NAV = `(function () { var b = document.querySelector('.top-nav-bar'); return JSON.stringify({ order: b ? Array.from(b.children).map(function (c) { return c.id; }) : null, setupDisplay: (function () { var s = document.getElementById('manage-tab-setup'); return s ? getComputedStyle(s).display : 'absent'; })(), deskPanel: !!document.getElementById('manage-tab-desk') }); })()`;
    const late = await arriveCold({ url: fileUrl('tournament.html', 'tourney=OWNED1'), db, auth: 'signed-out', viewport: { width: 390, height: 844 }, preScript: PRE, settleMs: 6000, steps: [
        { expression: NAV }, { expression: `window.__signInAs(${JSON.stringify(OWNER)})` }, { sleep: 400 }, { expression: NAV },
        { tap: '#tab-btn-desk' }, { sleep: 300 }, { expression: PROBE }
    ] });
    if (!late.ok) bail(late.reason);
    const before = JSON.parse(late.value[0]), after = JSON.parse(late.value[3]), lateDesk = J(late, 6);
    if (JSON.stringify(before.order) !== JSON.stringify(['tab-btn-leaderboard']) || before.deskPanel) failures.push('late sign-in: before, the nav should hold only Leaderboard: ' + JSON.stringify(before));
    if (JSON.stringify(after.order) !== JSON.stringify(['tab-btn-setup', 'tab-btn-desk', 'tab-btn-leaderboard'])) failures.push('late sign-in: the tabs did not come back in order: ' + JSON.stringify(after.order));
    if (after.setupDisplay !== 'block' || !after.deskPanel) failures.push('late sign-in: Setup not shown or Desk panel missing: ' + JSON.stringify(after));
    if (!lateDesk || lateDesk.rows !== TOTALS.entries || lateDesk.deskDisplay !== 'block') failures.push('late sign-in: the Desk does not list the field after sign-in: ' + JSON.stringify(lateDesk && [lateDesk.rows, lateDesk.deskDisplay]));

    // ---- THE STATE BADGES AT 390 px (OWNED2) --------------------------------------
    const BADGES = `(function () {
      var R = function (el) { if (!el) return null; var b = el.getBoundingClientRect(); return { top: Math.round(b.top), left: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height) }; };
      var list = document.getElementById('registration-list');
      var rows = Array.from(list ? list.querySelectorAll('.reg-row') : []);
      var badge = function (el) { var cs = getComputedStyle(el); return { cls: el.className.replace('reg-state ', ''), text: el.innerText.trim(), rect: R(el), bg: cs.backgroundColor, color: cs.color, fontPx: parseFloat(cs.fontSize) }; };
      var rowInfo = function (r) { return { id: r.getAttribute('data-entry-id'), rect: R(r), badges: Array.from(r.querySelectorAll('.reg-state')).map(badge), text: r.innerText.replace(/\\s+/g, ' ').trim() }; };
      var byId = function (id) { var r = list && list.querySelector('.reg-row[data-entry-id="' + id + '"]'); return r ? rowInfo(r) : null; };
      var chips = Array.from(document.querySelectorAll('.reg-chip')).map(function (c) { return { text: c.innerText.trim(), rect: R(c), active: c.classList.contains('active') }; });
      return JSON.stringify({
        rows: rows.length, scrollWidth: document.documentElement.scrollWidth, viewport: window.innerWidth,
        widest: rows.reduce(function (m, r) { return Math.max(m, r.getBoundingClientRect().width); }, 0),
        rowsWithPayBadge: rows.filter(function (r) { return r.querySelector('.reg-state-paid, .reg-state-unpaid'); }).length,
        rowsWithTwoPayBadges: rows.filter(function (r) { return r.querySelectorAll('.reg-state-paid, .reg-state-unpaid').length > 1; }).length,
        fieldBadges: list ? list.querySelectorAll('.reg-state-field').length : 0, needsBadges: list ? list.querySelectorAll('.reg-state-needs').length : 0,
        first6: rows.slice(0, 6).map(rowInfo), e130: byId('e130'), e120: byId('e120'), e001: byId('e001'),
        chips: chips, counts: (document.getElementById('registration-counts') || {}).innerText
      });
    })()`;
    const b = await arriveCold({ url: fileUrl('tournament.html', 'tourney=OWNED2'), db, auth: OWNER, viewport: { width: 390, height: 844 }, preScript: PRE, settleMs: 6000, steps: [
        { tap: '#tab-btn-desk' }, { sleep: 300 }, { expression: BADGES },                 // 0-2 the desk with badges
        { tap: '.reg-chip', nth: 5 }, { sleep: 300 }, { expression: BADGES }               // 3-5 the sixth chip
    ] });
    if (!b.ok) bail('OWNED2: ' + b.reason);
    const bt = b.value.filter(v => typeof v === 'string' && /^no element/.test(v));
    if (bt.length) bail('OWNED2: a tap found no element', bt);
    const bd = J(b, 2), bn = J(b, 5);
    if (!bd || !bn) bail('OWNED2: a probe did not parse', b.value.map(v => String(v).slice(0, 80)));
    if (bd.rows !== TOTALS.entries) failures.push('badges: rows ' + bd.rows);
    if (bd.scrollWidth > bd.viewport) failures.push('badges: THE PAGE SCROLLS SIDEWAYS at 390 px: scrollWidth ' + bd.scrollWidth);
    if (bd.widest > 390) failures.push('badges: a row is wider than the phone: ' + bd.widest);
    if (bd.rowsWithPayBadge !== TOTALS.entries) failures.push('badges: ' + bd.rowsWithPayBadge + ' rows carry a Paid/Unpaid badge, wanted ' + TOTALS.entries);
    if (bd.rowsWithTwoPayBadges !== 0) failures.push('badges: a row carries two payment badges');
    if (bd.fieldBadges !== TOTALS.inField) failures.push('badges: ' + bd.fieldBadges + ' In-the-field badges, wanted ' + TOTALS.inField);
    if (bd.needsBadges !== TOTALS.needsTeam) failures.push('badges: ' + bd.needsBadges + ' Needs-a-team badges, wanted ' + TOTALS.needsTeam);
    const allBadges = [].concat(...bd.first6.map(r => r.badges), (bd.e130 || { badges: [] }).badges, (bd.e120 || { badges: [] }).badges);
    allBadges.forEach(x => {
        if (!x.rect || x.rect.w < 30 || x.rect.h < 14) failures.push('badges: a badge has no readable rect: ' + JSON.stringify(x));
        if (!(x.fontPx >= 11)) failures.push('badges: text under 11 px: ' + JSON.stringify(x));
        if (x.rect && (x.rect.left < 0 || x.rect.left + x.rect.w > 390)) failures.push('badges: a badge is off the phone: ' + JSON.stringify(x));
    });
    const bgOf = (cls) => { const f = allBadges.find(x => x.cls === cls); return f ? f.bg : null; };
    const bgs = ['reg-state-unpaid', 'reg-state-paid', 'reg-state-field', 'reg-state-needs'].map(bgOf);
    if (bgs.some(x => !x || x === 'rgba(0, 0, 0, 0)')) failures.push('badges: a state has no background: ' + JSON.stringify(bgs));
    if (new Set(bgs).size !== 4) failures.push('badges: the four states do not have four backgrounds: ' + JSON.stringify(bgs));
    if (!bd.e130 || !/Paid/.test(bd.e130.text) || !bd.e130.badges.some(x => x.cls === 'reg-state-field') || !bd.e130.badges.some(x => x.cls === 'reg-state-needs' && x.text === 'Needs a team')) failures.push('badges: e130 (Team 3, alone) does not read Paid + In the field + Needs a team: ' + JSON.stringify(bd.e130));
    if (!bd.e120 || bd.e120.badges.some(x => x.cls === 'reg-state-needs') || !bd.e120.badges.some(x => x.cls === 'reg-state-field')) failures.push('badges: e120 (the Hawks, a named team of one) must NOT need a team: ' + JSON.stringify(bd.e120));
    if (!bd.e001 || !bd.e001.badges.some(x => x.cls === 'reg-state-unpaid' && x.text === 'Unpaid') || !/Approve into field/.test(bd.e001.text)) failures.push('badges: e001 does not read Unpaid with its Approve button: ' + JSON.stringify(bd.e001));
    if (bd.chips.length !== 6 || !bd.chips[5] || bd.chips[5].text !== 'Needs a team 1' || !bd.chips[5].rect || bd.chips[5].rect.w === 0) failures.push('badges: the sixth chip: ' + JSON.stringify(bd.chips));
    if (!/1 needs a team/.test(bd.counts || '')) failures.push('badges: the counts do not say 1 needs a team: ' + bd.counts);
    if (bn.rows !== 1 || !bn.e130 || !bn.chips[5] || !bn.chips[5].active) failures.push('needs chip: ' + bn.rows + ' rows, e130 ' + (bn.e130 ? 'shown' : 'missing') + ', active ' + JSON.stringify(bn.chips.filter(c => c.active).map(c => c.text)));
    if (iDesk && /Needs a team/.test(iDesk.chips || '')) failures.push('individual: a Needs-a-team chip on an event with no teams');

    const verdict = failures.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({ verdict, failures, measured: {
        badges: { scrollWidth: bd.scrollWidth, widestRowPx: bd.widest, backgrounds: bgs, e130: bd.e130 && bd.e130.badges.map(x => [x.text, x.rect && x.rect.w + 'x' + x.rect.h, x.fontPx]), e120: bd.e120 && bd.e120.badges.map(x => x.text), sixthChip: bd.chips[5], needsFilterRows: bn.rows, firstRow: bd.first6[0] },
        desk: { rows: desk.rows, listHeightPx: desk.listRect && desk.listRect.h, counts: desk.counts, chips: desk.chips, searchRect: desk.searchRect, dupMarks: desk.dupMarks },
        approve: { teamSet: teamSet && teamSet.path, mark: mark && mark.value, back: approvedBack && approvedBack.e001 && approvedBack.e001.text.slice(0, 60) },
        search: { typed: typed.rows, midSearchValue: midSearch.searchValue, midSearchRows: midSearch.rows, midSearchCounts: midSearch.counts && midSearch.counts.slice(0, 40) },
        paid: { write: paidWrite && paidWrite.value, unpaidRowsAfter: paidBack.rows, chipsAfter: paidBack.chips },
        individual: { counts: iDesk.counts, player: player && player.path },
        signedOut: { deskTab: out.deskTab, deskDisplay: out.deskDisplay },
        lateSignIn: { before: before.order, after: after.order, rows: lateDesk && lateDesk.rows }
    } }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch(e => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String(e && e.stack || e) }, null, 2)); process.exit(2); });
