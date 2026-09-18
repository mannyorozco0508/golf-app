#!/usr/bin/env node
// ============================================================================
// QR CODES FOR TEAM SCORECARD LINKS, IN CHROME: the codes are drawn from the
// vendored library, the modal survives without it, and the tee sheet has its
// codes AT THE INSTANT IT IS PRINTED.
//
// THE FAULT THE FIRST VERSION OF THIS CHECK HAD (2026-09-18). It measured the
// sheet 800 ms after the tap, under emulated print media, and passed: every
// cell had an <img> with a data: src and a natural size. Manny printed the same
// sheet from the real dialog and every QR cell was blank. Print is a SNAPSHOT
// at window.print(); the library sets the <img> src asynchronously (a probe
// image's onload), the page called window.print() synchronously in the same
// task, and the canvas that did have the pixels was display:none. The check
// had measured a moment the user never sees.
//
// AND THE FAULT ITS SECOND VERSION HAD. It required a rect at the print
// instant, while #tournament-print-view is display:none under screen media
// (only the @media print block shows it) - so nothing in the sheet could ever
// have a rect at that instant, and a data-URI <img> fix was judged by a bar it
// could not reach for the wrong reason as well as the right one. Now the
// instant is judged on the element's OWN computed display up the ancestor
// chain to the view (exclusive); the rects come from the print-media pass.
//
// WHY ONLY A CANVAS CAN PASS THE INSTANT (Chromium main, read 2026-09-18):
// ChromeClient::Print wraps the scripted print in a ScopedPagePauser
// (core/page/chrome_client.cc:277-282); a paused frame freezes its fetcher
// kStrict (core/frame/local_frame.cc:3476-3484, SetContextPaused); a data-URL
// image load is a POSTED TASK (platform/loader/fetch/resource_loader.cc:
// 1308-1315) that defers itself under a freeze (:1453-1459); the preview is
// rendered inside the nested loop (components/printing/renderer/
// print_render_frame_helper.cc:2798-2811), inside that pause. Measured here:
// a data-URI <img> has naturalWidth 0 in the task that sets it, however it is
// set. Only pixels already PAINTED at the call - a <canvas> bitmap - are on
// the paper. The page draws into its own canvas synchronously and appends it.
//
// So the stubbed window.print CAPTURES THE CELLS AT THE INSTANT IT IS CALLED -
// canvas presence, width and own display, img src length and naturalWidth,
// and the canvas's toDataURL - and this file asserts, per cell, at least one
// element with pixels whose own display chain is not hidden at that instant.
// The emulated-print-media measurement (manage screen hidden, rects) is taken
// against that same snapshot: the sheet may not change between print() and
// the probe, and the probe re-reads each cell's bitmap to prove it did not.
// The same at-print capture runs for the pairings and results sheets: they
// carry no images today, and the assertion holds vacuously - if either ever
// grows one, the check is already there.
//
// And each cell's BITMAP (canvas.toDataURL, not a src attribute) is compared
// byte for byte to one the probe builds itself from the cell's printed URL
// with the same library, size and level - a cell carrying another team's
// bitmap fails even though its text is right. (new QRCode is the library, not
// the page; deterministic for the same input.)
//
// tournament_tee_qr_test.js drives the rules in mini-dom (no canvas there).
// This opens tournament.html?tourney=TEEQR cold, signed out, three teams,
// shotgun:
//   1. inline codes on the Leaderboard tab (a rect, a drawn PNG, left of Share)
//   2. the modal with the library (drawn) and without it (opens anyway)
//   3. the tee sheet at the print instant, then under print media
//   4. the pairings and results sheets at their print instants (no images)
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

// window.print is stubbed so the dialog never opens; it CAPTURES the sheet's
// images at the instant it is called - the instant the real dialog snapshots.
const PRE = `window.__prints = []; window.__errs = []; window.addEventListener('error', function (e) { window.__errs.push(String(e.message)); });
window.print = function () {
  var view = document.getElementById('tournament-print-view');
  // OWN display up to (not including) the view: the view itself is display:none
  // under screen media and only print media shows it - that is the rect pass's
  // to prove. What is judged here is whether the page hid the pixels.
  var shown = function (el) { if (!el) return false; for (var n = el; n && n !== view; n = n.parentElement) { var cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
  var cells = Array.from(view.querySelectorAll('.tee-qr')).map(function (box) {
    var i = box.querySelector('img'), cv = box.querySelector('canvas'); var bitmap = null;
    try { bitmap = cv ? cv.toDataURL('image/png') : null; } catch (e) { bitmap = 'toDataURL threw: ' + e.message; }
    return { canvas: !!cv, canvasW: cv ? cv.width : null, canvasShown: shown(cv), canvasClass: cv ? cv.className : null,
             imgSrcLen: i ? i.src.length : -1, imgData: !!(i && /^data:image\\/png/.test(i.src)), imgNatural: i ? i.naturalWidth : null, imgShown: shown(i),
             text: box.innerText.trim(), bitmap: bitmap };
  });
  var images = Array.from(view.querySelectorAll('img, canvas')).map(function (el) { return { tag: el.tagName, shown: shown(el), srcLen: el.src ? el.src.length : null, natural: el.naturalWidth, w: el.width }; });
  window.__prints.push({ t: performance.now(), cells: cells, images: images, printing: document.body.classList.contains('printing-results') });
};`;

const PROBE = `(function () {
  var R = function (el) { if (!el) return null; var b = el.getBoundingClientRect(); return { top: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
  var img = function (box) { var i = box && box.querySelector('img'); return i ? { data: /^data:image\\/png/.test(i.src), nw: i.naturalWidth, nh: i.naturalHeight, rect: R(i) } : null; };
  var rows = Array.from(document.querySelectorAll('#team-links-list .team-link-row')).map(function (r) {
    var q = r.querySelector('.team-qr'); var b = r.querySelector('button');
    return { team: q ? q.getAttribute('data-team') : null, qrRect: R(q), img: img(q), text: q ? q.innerText.trim() : null, qrLeftOfShare: !!(q && b && q.getBoundingClientRect().right <= b.getBoundingClientRect().left + 1) };
  });
  var modal = document.getElementById('share-link-modal'); var box = document.getElementById('share-qr-box');
  var copy = Array.from(modal.querySelectorAll('button')).find(function (x) { return /Copy Link/.test(x.innerText); });
  // THE INDEPENDENT PNG: what the library draws for THIS cell's printed URL.
  var expected = function (url) { if (typeof QRCode !== 'function') return null; var d = document.createElement('div'); new QRCode(d, { text: url, width: 132, height: 132, correctLevel: QRCode.CorrectLevel.M }); var c = d.querySelector('canvas'); return c ? c.toDataURL('image/png') : null; };
  var cells = Array.from(document.querySelectorAll('#tournament-print-view .tee-cell')).map(function (c) {
    var url = (c.querySelector('.tee-url') || {}).innerText; var cv = c.querySelector('.tee-qr canvas'); var bitmap = null;
    try { bitmap = cv ? cv.toDataURL('image/png') : null; } catch (e) { bitmap = 'toDataURL threw: ' + e.message; }
    return { rect: R(c), name: (c.querySelector('.tee-name') || {}).innerText, hole: (c.querySelector('.tee-hole') || {}).innerText || null, url: url,
             canvas: cv ? { w: cv.width, h: cv.height, rect: R(cv), display: getComputedStyle(cv).display } : null, img: img(c.querySelector('.tee-qr')),
             qrText: (c.querySelector('.tee-qr') || {}).innerText, bitmap: bitmap, expected: url ? expected(url) : null };
  });
  return JSON.stringify({ lib: typeof QRCode, rows: rows, modal: { open: modal.classList.contains('open'), display: getComputedStyle(modal).display, title: (document.getElementById('share-modal-title') || {}).innerText, link: (document.getElementById('share-link-text') || {}).innerText, boxText: box ? box.innerText.trim() : null, img: img(box), copyRect: R(copy) },
    sheet: { rect: R(document.getElementById('tournament-print-view')), manageRect: R(document.getElementById('manage-tab-leaderboard')), cells: cells, header: (document.querySelector('#tournament-print-view h2') || {}).innerText },
    prints: window.__prints, errs: window.__errs });
})()`;
const findButton = (label, id) => ({ expression: `(function(){ var b = Array.from(document.querySelectorAll('button')).find(function (x) { return ${label}.test(x.innerText); }); if (!b) return 'no button ${id}'; b.id = '${id}'; return b.id; })()` });

(async () => {
    const failures = [];
    const bail = (why, extra) => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2)); process.exit(2); };
    const J = (r, i) => { try { return JSON.parse(r.value[i]); } catch (e) { return null; } };

    // ---- with the library: inline codes, the modal, the tee sheet -----------------
    const a = await arriveCold({ url: fileUrl('tournament.html', 'tourney=TEEQR'), db, auth: 'signed-out', viewport: { width: 390, height: 844 }, preScript: PRE, settleMs: 4500, steps: [
        { tap: '#tab-btn-leaderboard' }, { sleep: 400 }, { expression: PROBE },                                            // 0-2 the list
        { tap: '#team-links-list .team-link-row:nth-child(2) button' }, { sleep: 500 }, { expression: PROBE },             // 3-5 Hawks' Share
        { expression: `document.getElementById('share-link-modal').classList.remove('open'); 'closed'` },                // 6
        findButton('/Print Tee Sheet/', 'tmp-tee-btn'),                                                                    // 7
        { tap: '#tmp-tee-btn' }, { media: 'print' }, { sleep: 300 }, { expression: PROBE }                                // 8-10 (media pushes nothing)
    ] });
    if (!a.ok) bail(a.reason);
    const missed = a.value.filter((v) => typeof v === 'string' && /^no (element|button)/.test(v));
    if (missed.length) bail('a step found nothing', missed);
    const list = J(a, 2), modal = J(a, 5), sheet = J(a, 10);
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

    // THE PRINT INSTANT - the only moment the paper sees.
    const prints = sheet.prints || [];
    if (prints.length !== 1) failures.push('tee sheet: window.print reached ' + prints.length + ' times, wanted 1');
    const snap = prints[0] || { cells: [], images: [] };
    if (!snap.printing) failures.push('tee sheet: body.printing-results was not set at the print instant');
    if (snap.cells.length !== 3) failures.push('tee sheet AT PRINT: ' + snap.cells.length + ' cells, wanted 3');
    const brief = (c) => JSON.stringify(Object.assign({}, c, { bitmap: c.bitmap ? c.bitmap.length + ' chars' : c.bitmap }));
    snap.cells.forEach((c, i) => {
        // Pixels the paper can have: a shown canvas with a bitmap, or a shown img
        // Chrome has already decoded (it never has, for a data URI set this task -
        // the img arm is kept so the assertion states the whole rule).
        const pixels = (c.canvasShown && c.canvasW > 0 && /^data:image\/png/.test(c.bitmap || '')) || (c.imgShown && c.imgData && c.imgNatural > 0);
        if (!pixels) failures.push('TEE SHEET CELL ' + (i + 1) + ' HAS NO VISIBLE PIXELS AT THE PRINT INSTANT: ' + brief(c));
    });
    // The sheet may not change between print() and the probe: the bitmap the
    // dialog snapshotted is the one on the page now.
    sheet.sheet.cells.forEach((c, i) => {
        const at = snap.cells[i];
        if (at && at.bitmap !== c.bitmap) failures.push('cell ' + (i + 1) + ': the bitmap changed after window.print() (print is a snapshot; the paper had the earlier one)');
    });

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
        // THE RECTS, under print media: the canvas is on the page at 35 mm.
        if (!c.canvas || !(c.canvas.w > 0)) failures.push('cell ' + n + ': no canvas under print media: ' + JSON.stringify(c.canvas));
        else if (c.canvas.display === 'none' || !c.canvas.rect || c.canvas.rect.w < 35 * MM - 1) failures.push('cell ' + n + ': the printed code is ' + JSON.stringify(c.canvas) + ', under 35 mm or hidden');
        if (c.img) failures.push('cell ' + n + ': carries an <img> as well - the sheet is print-only, one copy of the pixels');
        // THE CODE ENCODES THIS CELL'S URL: the canvas bitmap is byte-equal to one the probe drew itself from the printed URL.
        if (!c.expected) failures.push('cell ' + n + ': the probe could not build the expected PNG');
        else if (c.bitmap !== c.expected) failures.push('CELL ' + n + "'S BITMAP DOES NOT ENCODE ITS OWN URL (the PNG differs from one drawn from " + c.url + ')');
    });

    // ---- the pairings and results sheets at THEIR print instants ---------------
    for (const [label, re] of [['pairings', '/Print Pairings/'], ['results', '/Print \\/ Send Results/']]) {
        const p = await arriveCold({ url: fileUrl('tournament.html', 'tourney=TEEQR'), db, auth: 'signed-out', viewport: { width: 390, height: 844 }, preScript: PRE, settleMs: 4500, steps: [
            { tap: '#tab-btn-leaderboard' }, { sleep: 300 }, findButton(re, 'tmp-' + label), { tap: '#tmp-' + label }, { sleep: 200 }, { expression: `JSON.stringify({ prints: window.__prints, errs: window.__errs })` }
        ] });
        if (!p.ok) bail(label + ': ' + p.reason);
        const pm = p.value.filter((v) => typeof v === 'string' && /^no (element|button)/.test(v));
        if (pm.length) bail(label + ': a step found nothing', pm);
        const out = J(p, 5);
        if (!out || out.prints.length !== 1) failures.push(label + ': window.print reached ' + (out ? out.prints.length : '?') + ' times, wanted 1');
        else {
            const blank = out.prints[0].images.filter((im) => im.shown && !(im.natural > 0 || im.w > 0));
            if (blank.length) failures.push(label + ' sheet: ' + blank.length + ' visible image(s) with no pixels at the print instant: ' + JSON.stringify(blank));
            if (out.prints[0].cells.length) failures.push(label + ' sheet unexpectedly carries .tee-qr cells');
        }
    }

    // ---- WITHOUT the library: the modal must still open ---------------------------
    const b = await arriveCold({ url: fileUrl('tournament.html', 'tourney=TEEQR'), db, auth: 'signed-out', viewport: { width: 390, height: 844 }, preScript: PRE, settleMs: 4500, blockUrls: ['*qrcode.min.js'], steps: [
        { tap: '#tab-btn-leaderboard' }, { sleep: 400 }, { expression: PROBE },
        { tap: '#team-links-list .team-link-row:nth-child(1) button' }, { sleep: 500 }, { expression: PROBE },
        { expression: `document.getElementById('share-link-modal').classList.remove('open'); 'closed'` },
        findButton('/Print Tee Sheet/', 'tmp-tee-btn'), { tap: '#tmp-tee-btn' }, { sleep: 200 }, { expression: PROBE }
    ] });
    if (!b.ok) bail(b.reason);
    const off = J(b, 2), offModal = J(b, 5), offSheet = J(b, 10);
    if (!off || !offModal || !offSheet) bail('the no-library probe did not parse', b.value);
    if (off.lib !== 'undefined') failures.push('no-library arm: the library still loaded (blocking failed)');
    if (off.errs.length) failures.push('no-library arm: the page threw on arrival: ' + JSON.stringify(off.errs));
    off.rows.forEach((r, i) => { if (!/QR unavailable/.test(r.text || '')) failures.push('no-library row ' + (i + 1) + ': the inline box does not say so: ' + JSON.stringify(r.text)); });
    if (!offModal.modal.open || offModal.modal.display === 'none') failures.push('NO-LIBRARY: THE MODAL DID NOT OPEN - the pre-wave failure is back');
    if (!/tournament-scorecard\.html\?tourney=TEEQR&team=1$/.test(offModal.modal.link || '')) failures.push('no-library: the link is not shown: ' + offModal.modal.link);
    if (!offModal.modal.copyRect || offModal.modal.copyRect.h === 0) failures.push('no-library: the Copy button has no rect');
    if (offModal.modal.boxText !== 'QR code unavailable — copy the link.') failures.push('no-library: the QR box says ' + JSON.stringify(offModal.modal.boxText));
    if (offModal.errs.length) failures.push('no-library: the tap threw: ' + JSON.stringify(offModal.errs));
    // The sheet without the library: prints, with the sentence and the URL in every cell.
    if (!offSheet.prints || offSheet.prints.length !== 1) failures.push('no-library tee sheet: window.print reached ' + (offSheet.prints || []).length + ' times');
    offSheet.sheet.cells.forEach((c, i) => {
        if (!/QR code unavailable — open the link\./.test(c.qrText || '')) failures.push('no-library cell ' + (i + 1) + ': no fallback sentence: ' + JSON.stringify(c.qrText));
        if (!new RegExp('team=' + (i + 1) + '$').test(c.url || '')) failures.push('no-library cell ' + (i + 1) + ': URL ' + c.url);
    });
    if (offSheet.errs.length) failures.push('no-library sheet: threw: ' + JSON.stringify(offSheet.errs));

    const verdict = failures.length ? 'FAIL' : 'PASS';
    const report = { verdict, failures, measured: {
        withLibrary: { rows: list.rows.map((r) => ({ team: r.team, qr: r.qrRect, img: r.img && [r.img.nw, r.img.nh] })), modal: { open: modal.modal.open, img: modal.modal.img && [modal.modal.img.nw, modal.modal.img.nh] },
            atPrint: snap.cells.map((c) => ({ canvas: c.canvas, canvasW: c.canvasW, canvasShown: c.canvasShown, bitmapChars: c.bitmap ? c.bitmap.length : null, imgSrcLen: c.imgSrcLen, imgNatural: c.imgNatural, imgShown: c.imgShown })),
            sheet: sheet.sheet.cells.map((c) => ({ name: c.name, hole: c.hole, wMm: c.rect && Math.round(c.rect.w / MM), canvasPx: c.canvas && c.canvas.rect && c.canvas.rect.w, url: c.url, encodesOwnUrl: !!c.expected && c.bitmap === c.expected })) },
        withoutLibrary: { modalOpen: offModal.modal.open, link: offModal.modal.link, boxText: offModal.modal.boxText, copyRect: offModal.modal.copyRect, sheetCells: offSheet.sheet.cells.map((c) => c.qrText) }
    } };
    // stdout to a pipe is asynchronous on macOS: write, then exit in the callback.
    process.stdout.write(JSON.stringify(report, null, 2) + '\n', () => process.exit(failures.length ? 1 : 0));
})().catch((e) => { process.stdout.write(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String(e && e.stack || e) }, null, 2) + '\n', () => process.exit(2)); });
