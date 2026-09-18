#!/usr/bin/env node
// ============================================================================
// QR CODES FOR TEAM SCORECARD LINKS, IN CHROME (2026-09-18): the codes are
// drawn from the vendored library, the modal survives without it, the tee sheet
// is a sheet.
//
// tournament_tee_qr_test.js drives the rules in mini-dom, which has no canvas -
// so every QR there is the fallback sentence. This is the first check in the
// repo to see a QR at all: until this wave every tournament tool BLOCKED the
// library (it was a CDN script). It opens tournament.html?tourney=TEEQR cold
// (tools/lib/cold-arrival.js), signed out, on a three-team shotgun scramble:
//
//   1. THE INLINE CODES: on the Leaderboard tab each public team row has a
//      .team-qr with a rect and an <img> whose src is a data:image/png and
//      whose naturalWidth is > 0 - drawn, not a placeholder - and the row's
//      Share button is beside it.
//   2. THE MODAL, WITH THE LIBRARY: a real tap on a team's Share opens it with
//      a drawn image and the link text.
//   3. THE MODAL, WITHOUT THE LIBRARY (a second arrival with ./qrcode.min.js
//      blocked - the state the product was in offline): the tap OPENS the modal,
//      the link is there, the Copy button has a rect, and the QR box says
//      "QR code unavailable — copy the link." Before this wave the same tap
//      threw "QRCode is not defined" and the modal stayed closed.
//   4. THE TEE SHEET: a real tap on Print Tee Sheet, media switched to print;
//      the manage screen is hidden, the sheet has a rect, one .tee-cell per
//      team each at least 35 mm wide (>= 132 px at 96 dpi), each with a drawn
//      image, its team name, its hole (10A / HOLE NOT SET) and its own URL in
//      .tee-url; window.print was reached through printSheet.
//
// EXIT 0 PASS, 1 FAIL, 2 could not run.
// ============================================================================
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const TEAMS = {
    team1: { num: 1, name: 'Eagles', players: ['Ann Alpha', 'Bo Bravo'], handicap: 0, startingHole: '1' },
    team2: { num: 2, name: 'Hawks', players: ['Cal Charlie', 'Dee Delta'], handicap: 3, startingHole: '10A' },
    team3: { num: 3, name: "O'Malley's Mob", players: ['Eli Echo'], handicap: 0, startingHole: '' }
};
const rec = { name: 'Tee QR Scramble', format: 'scramble', courseName: 'Camas Meadows', courseData: COURSE, entryFee: 0, teams: TEAMS, startType: 'shotgun', createdAt: 1, ownerUid: 'u-org' };
const db = { tournaments: { TEEQR: rec }, global_courses: {} };
const MM = 96 / 25.4;   // CSS px per mm

// window.print is stubbed so the dialog never opens; the call is counted.
const PRE = `window.__prints = 0; window.print = function () { window.__prints++; }; window.__errs = []; window.addEventListener('error', function (e) { window.__errs.push(String(e.message)); });`;

const PROBE = `(function () {
  var R = function (el) { if (!el) return null; var b = el.getBoundingClientRect(); return { top: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
  var img = function (box) { var i = box && box.querySelector('img'); return i ? { data: /^data:image\\/png/.test(i.src), nw: i.naturalWidth, nh: i.naturalHeight, rect: R(i) } : null; };
  var rows = Array.from(document.querySelectorAll('#team-links-list .team-link-row')).map(function (r) {
    var q = r.querySelector('.team-qr'); var b = r.querySelector('button');
    return { team: q ? q.getAttribute('data-team') : null, qrRect: R(q), img: img(q), text: q ? q.innerText.trim() : null, qrLeftOfShare: !!(q && b && q.getBoundingClientRect().right <= b.getBoundingClientRect().left + 1) };
  });
  var modal = document.getElementById('share-link-modal'); var box = document.getElementById('share-qr-box');
  var copy = Array.from(modal.querySelectorAll('button')).find(function (x) { return /Copy Link/.test(x.innerText); });
  var cells = Array.from(document.querySelectorAll('#tournament-print-view .tee-cell')).map(function (c) {
    return { rect: R(c), name: (c.querySelector('.tee-name') || {}).innerText, hole: (c.querySelector('.tee-hole') || {}).innerText || null, url: (c.querySelector('.tee-url') || {}).innerText, img: img(c.querySelector('.tee-qr')), qrText: (c.querySelector('.tee-qr') || {}).innerText };
  });
  return JSON.stringify({ lib: typeof QRCode, rows: rows, modal: { open: modal.classList.contains('open'), display: getComputedStyle(modal).display, title: (document.getElementById('share-modal-title') || {}).innerText, link: (document.getElementById('share-link-text') || {}).innerText, boxText: box ? box.innerText.trim() : null, img: img(box), copyRect: R(copy) },
    sheet: { rect: R(document.getElementById('tournament-print-view')), manageRect: R(document.getElementById('manage-tab-leaderboard')), cells: cells, header: (document.querySelector('#tournament-print-view h2') || {}).innerText },
    prints: window.__prints, printing: document.body.classList.contains('printing-results'), errs: window.__errs });
})()`;

(async () => {
    const failures = [];
    const bail = (why, extra) => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2)); process.exit(2); };
    const J = (r, i) => { try { return JSON.parse(r.value[i]); } catch (e) { return null; } };

    // ---- with the library: inline codes, the modal, the sheet --------------------
    const a = await arriveCold({ url: fileUrl('tournament.html', 'tourney=TEEQR'), db, auth: 'signed-out', viewport: { width: 390, height: 844 }, preScript: PRE, settleMs: 4500, steps: [
        { tap: '#tab-btn-leaderboard' }, { sleep: 400 }, { expression: PROBE },                                            // 0-2 the list
        { tap: '#team-links-list .team-link-row:nth-child(2) button' }, { sleep: 500 }, { expression: PROBE },             // 3-5 Hawks' Share
        { expression: `document.getElementById('share-link-modal').classList.remove('open'); 'closed'` },
        { expression: `(function(){ var b = Array.from(document.querySelectorAll('button')).find(function (x) { return /Print Tee Sheet/.test(x.innerText); }); if (!b) return 'no button'; b.id = b.id || 'tmp-tee-btn'; return b.id; })()` },
        { tap: '#tmp-tee-btn' }, { sleep: 500 }, { media: 'print' }, { sleep: 300 }, { expression: PROBE }                 // 8-11 the sheet under print media (a media step pushes no value)
    ] });
    if (!a.ok) bail(a.reason);
    const missed = a.value.filter((v) => typeof v === 'string' && /^no (element|button)/.test(v));
    if (missed.length) bail('a step found nothing', missed);
    const list = J(a, 2), modal = J(a, 5), sheet = J(a, 11);
    if (!list || !modal || !sheet) bail('a probe did not parse', a.value.map((v) => String(v).slice(0, 60)));
    if (list.lib !== 'function') failures.push('the library did not load from ./qrcode.min.js (typeof QRCode = ' + list.lib + ')');
    if (list.errs.length) failures.push('page errors on arrival: ' + JSON.stringify(list.errs));
    if (list.rows.length !== 3) failures.push('rows: ' + list.rows.length + ', wanted 3');
    list.rows.forEach((r, i) => {
        if (r.team !== String(i + 1)) failures.push('row ' + i + ' keyed to team ' + r.team);
        if (!r.qrRect || r.qrRect.w < 60 || r.qrRect.h < 60) failures.push('row ' + (i + 1) + ': the inline QR box has no rect: ' + JSON.stringify(r.qrRect));
        if (!r.img || !r.img.data || !(r.img.nw > 0)) failures.push('row ' + (i + 1) + ': no drawn image (data: PNG with a natural size): ' + JSON.stringify(r.img));
        if (!r.qrLeftOfShare) failures.push('row ' + (i + 1) + ': the QR is not beside (left of) the Share button');
    });
    if (!modal.modal.open || modal.modal.display === 'none') failures.push('with the library: the modal did not open on a real tap');
    if (!/Hawks — Scorecard Link/.test(modal.modal.title || '')) failures.push('with the library: the modal title: ' + modal.modal.title);
    if (!/tournament-scorecard\.html\?tourney=TEEQR&team=2$/.test(modal.modal.link || '')) failures.push('with the library: the link text: ' + modal.modal.link);
    if (!modal.modal.img || !modal.modal.img.data || !(modal.modal.img.nw > 0)) failures.push('with the library: the modal QR is not a drawn image: ' + JSON.stringify(modal.modal.img));
    if (sheet.prints !== 1) failures.push('sheet: window.print reached ' + sheet.prints + ' times, wanted 1');
    if (!sheet.printing) failures.push('sheet: body.printing-results is not set while printing');
    if (!sheet.sheet.rect || sheet.sheet.rect.h === 0) failures.push('sheet: #tournament-print-view has no rect under print media');
    if (sheet.sheet.manageRect && sheet.sheet.manageRect.h > 0) failures.push('sheet: the Leaderboard panel is still on the page under print media');
    if (!/Tee QR Scramble/.test(sheet.sheet.header || '')) failures.push('sheet: the header does not name the event: ' + sheet.sheet.header);
    if (sheet.sheet.cells.length !== 3) failures.push('sheet: ' + sheet.sheet.cells.length + ' cells, wanted 3');
    const wantNames = ['Eagles', 'Hawks', "O'Malley's Mob"], wantHoles = ['Hole 1', 'Hole 10A', 'HOLE NOT SET'];
    sheet.sheet.cells.forEach((c, i) => {
        const n = i + 1;
        if (!c.rect || c.rect.w < 35 * MM - 1) failures.push('cell ' + n + ': ' + JSON.stringify(c.rect) + ' - narrower than 35 mm (' + Math.round(35 * MM) + ' px)');
        if (c.name !== wantNames[i]) failures.push('cell ' + n + ': name ' + JSON.stringify(c.name));
        if (c.hole !== wantHoles[i]) failures.push('cell ' + n + ': hole ' + JSON.stringify(c.hole) + ', wanted ' + wantHoles[i]);
        if (!new RegExp('tournament-scorecard\\.html\\?tourney=TEEQR&team=' + n + '$').test(c.url || '')) failures.push('cell ' + n + ': URL ' + JSON.stringify(c.url));
        [1, 2, 3].filter((m) => m !== n).forEach((m) => { if (new RegExp('team=' + m + '$').test(c.url || '')) failures.push('cell ' + n + " carries team " + m + "'s URL"); });
        if (!c.img || !c.img.data || !(c.img.nw > 0)) failures.push('cell ' + n + ': no drawn image: ' + JSON.stringify(c.img));
        if (c.img && c.img.rect && c.img.rect.w < 35 * MM - 1) failures.push('cell ' + n + ': the printed code is ' + c.img.rect.w + ' px wide, under 35 mm');
    });

    // ---- WITHOUT the library: the modal must still open ---------------------------
    const b = await arriveCold({ url: fileUrl('tournament.html', 'tourney=TEEQR'), db, auth: 'signed-out', viewport: { width: 390, height: 844 }, preScript: PRE, settleMs: 4500, blockUrls: ['*qrcode.min.js'], steps: [
        { tap: '#tab-btn-leaderboard' }, { sleep: 400 }, { expression: PROBE },
        { tap: '#team-links-list .team-link-row:nth-child(1) button' }, { sleep: 500 }, { expression: PROBE }
    ] });
    if (!b.ok) bail(b.reason);
    const off = J(b, 2), offModal = J(b, 5);
    if (!off || !offModal) bail('the no-library probe did not parse', b.value);
    if (off.lib !== 'undefined') failures.push('no-library arm: the library still loaded (blocking failed)');
    if (off.errs.length) failures.push('no-library arm: the page threw on arrival: ' + JSON.stringify(off.errs));
    off.rows.forEach((r, i) => { if (!/QR unavailable/.test(r.text || '')) failures.push('no-library row ' + (i + 1) + ': the inline box does not say so: ' + JSON.stringify(r.text)); });
    if (!offModal.modal.open || offModal.modal.display === 'none') failures.push('NO-LIBRARY: THE MODAL DID NOT OPEN - the pre-wave failure is back');
    if (!/tournament-scorecard\.html\?tourney=TEEQR&team=1$/.test(offModal.modal.link || '')) failures.push('no-library: the link is not shown: ' + offModal.modal.link);
    if (!offModal.modal.copyRect || offModal.modal.copyRect.h === 0) failures.push('no-library: the Copy button has no rect');
    if (offModal.modal.boxText !== 'QR code unavailable — copy the link.') failures.push('no-library: the QR box says ' + JSON.stringify(offModal.modal.boxText));
    if (offModal.errs.length) failures.push('no-library: the tap threw: ' + JSON.stringify(offModal.errs));

    const verdict = failures.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({ verdict, failures, measured: {
        withLibrary: { rows: list.rows.map((r) => ({ team: r.team, qr: r.qrRect, img: r.img && [r.img.nw, r.img.nh] })), modal: { open: modal.modal.open, img: modal.modal.img && [modal.modal.img.nw, modal.modal.img.nh] },
            sheet: { prints: sheet.prints, cells: sheet.sheet.cells.map((c) => ({ name: c.name, hole: c.hole, wPx: c.rect && c.rect.w, wMm: c.rect && Math.round(c.rect.w / MM), imgPx: c.img && c.img.rect && c.img.rect.w, url: c.url })) } },
        withoutLibrary: { modalOpen: offModal.modal.open, link: offModal.modal.link, boxText: offModal.modal.boxText, copyRect: offModal.modal.copyRect, rowText: off.rows.map((r) => r.text) }
    } }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String(e && e.stack || e) }, null, 2)); process.exit(2); });
