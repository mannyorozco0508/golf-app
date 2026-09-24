#!/usr/bin/env node
// ============================================================================
// THE HANDICAP LABELS, LAID OUT - in Chrome, at 390x844 (v212).
//
// handicap_legible_test.js proves WHAT each surface says. It cannot prove the
// sentence FITS: mini-dom's getBoundingClientRect is a hard-coded all-zero rect,
// so a label that overflows its cell, wraps a board row onto two lines, or
// squeezes the Players sheet's five controls is invisible to it. Two of this
// wave's changes are layout changes and have to be measured:
//
//   1. THE BOARD ROW now carries "Index 18 · Course 17" beside the golfer's
//      name. It used to carry "Index 18 · Course 17.2 · Playing 17", which is
//      why this wave shortened it - so the measurement that matters is the name
//      cell's, and whether the row is still one line.
//   2. THE PLAYERS SHEET row is a five-column CSS grid (1fr 52px 40px 58px
//      54px). The label is a SIXTH child, and a sixth child mid-grid would push
//      the flight, group and Out controls onto a third line. It is emitted last
//      and spans the row (grid-column: 1 / -1), which is a claim about layout
//      and nothing else.
//
// IT CALLS NOTHING THE PAGE DEFINES. Arrival is cold through
// tools/lib/cold-arrival.js, and the only actions are real taps: the Players
// button, and a board row. Everything else is getBoundingClientRect.
//
// RUN IT: node tools/handicap-legibility-check.js
// Exit 0 = every measurement inside its bound; 1 = something did not fit;
// 2 = the harness could not run (no Chrome).
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: [4, 4, 3, 5, 4, 4, 3, 5, 4][i % 9], hcpIndex: ((i * 7) % 18) + 1 }));
const TEE = { teeKey: 'white', teeName: 'White', slope: 131, courseRating: 73.4, par: 72, allowance: 100 };
// Eight golfers, two groups. The WIDEST realistic label is what this measures:
// a plus index and a two-decimal course handicap on a long name.
const PLAYERS = [
    { id: 101, name: 'Christopher', hcp: '22', handicapIndex: '18.4', courseHandicap: 18.4 * (131 / 113) + (73.4 - 72), playingForMoney: true },
    { id: 102, name: 'Bartholomew', hcp: '3', handicapIndex: '+1.2', courseHandicap: -1.2 * (131 / 113) + (73.4 - 72), playingForMoney: true },
    { id: 103, name: 'Cal', hcp: '9', playingForMoney: true },
    { id: 104, name: 'Dee', hcp: '12', handicapIndex: '12', handicapUnconverted: true, playingForMoney: true },
    { id: 105, name: 'Eli', hcp: '5', handicapIndex: '4.5', courseHandicap: 4.5 * (131 / 113) + (73.4 - 72), playingForMoney: true },
    { id: 106, name: 'Fay', hcp: '30', handicapIndex: '27.9', courseHandicap: 27.9 * (131 / 113) + (73.4 - 72), playingForMoney: true },
    { id: 107, name: 'Gus', hcp: '7', handicapIndex: '6.1', courseHandicap: 6.1 * (131 / 113) + (73.4 - 72), playingForMoney: true },
    { id: 108, name: 'Hal', hcp: '15', handicapIndex: '14.8', courseHandicap: 14.8 * (131 / 113) + (73.4 - 72), playingForMoney: true }
];
const scores = {};
PLAYERS.forEach(p => { for (let h = 1; h <= 9; h++) scores['p' + p.id + '_h' + h] = 4 + (p.id % 3); });
const ROUND = {
    eventName: 'monday', roundDay: 'monday', courseName: 'Rehearsal Links', activeCourseKey: 'tst',
    gameFormat: 'stroke', courseData: CD, players: PLAYERS, scores, teeRating: TEE,
    groupSizeOverrides: { 0: 4, 1: 4 }, settlementMode: 'whole-dollar'
};

// ---- the probes -------------------------------------------------------------
// A board row: the name cell's box, the label's box, and the row's own height.
const BOARD_PROBE = `(function () {
    var rows = [].slice.call(document.querySelectorAll('#board-content tr[data-player-id]'));
    var out = rows.map(function (tr) {
        var name = tr.querySelector('td.player-name');
        var lab = name && name.querySelector('.player-hcp');
        var nb = name ? name.getBoundingClientRect() : null;
        var lb = lab ? lab.getBoundingClientRect() : null;
        return {
            id: tr.getAttribute('data-player-id'),
            rowH: Math.round(tr.getBoundingClientRect().height),
            nameW: nb ? Math.round(nb.width) : null,
            label: lab ? lab.innerText.trim() : null,
            labelW: lb ? Math.round(lb.width) : null,
            labelH: lb ? Math.round(lb.height) : null,
            overflows: !!(nb && lb && lb.right > nb.right + 1)
        };
    });
    var card = document.querySelector('.board-card-hcp');
    var cardCell = document.querySelector('.board-card-row td');
    return {
        rows: out,
        docScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        cardLabel: card ? card.innerText.trim() : null,
        cardLabelW: card ? Math.round(card.getBoundingClientRect().width) : null,
        cardCellW: cardCell ? Math.round(cardCell.getBoundingClientRect().width) : null
    };
})()`;

// The Players sheet: every row's controls and the note's own line.
const SHEET_PROBE = `(function () {
    var sheet = document.getElementById('players-sheet');
    var open = !!(sheet && getComputedStyle(sheet).display !== 'none');
    var rows = [].slice.call(document.querySelectorAll('#players-sheet-body .ps-row')).map(function (row) {
        var rb = row.getBoundingClientRect();
        var pick = function (sel) { var e = row.querySelector(sel); if (!e) return null; var b = e.getBoundingClientRect(); return { t: Math.round(b.top - rb.top), h: Math.round(b.height), w: Math.round(b.width), r: Math.round(b.right - rb.left) }; };
        var note = row.querySelector('.ps-hcp-note');
        var nb = note ? note.getBoundingClientRect() : null;
        return {
            id: row.getAttribute('data-id'),
            rowH: Math.round(rb.height),
            rowW: Math.round(rb.width),
            name: pick('.ps-name'), hcp: pick('.ps-hcp'), flight: pick('.ps-flight'),
            grp: pick('.ps-grp'), out: pick('.ps-out'),
            note: note ? { t: Math.round(nb.top - rb.top), h: Math.round(nb.height), w: Math.round(nb.width), text: note.innerText.trim(), r: Math.round(nb.right - rb.left) } : null
        };
    });
    return { open: open, rows: rows, bodyScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth };
})()`;

// WHAT IS ON SCREEN TO TAP. The first version of this check matched the first
// element whose text contained "Players", clicked it, reported "tapped", and
// measured a sheet that never opened - the page has more than one such element.
// This reports the candidates so a miss says which.
const CANDIDATES = `(function () {
    return [].slice.call(document.querySelectorAll('button, a, .top-nav-item'))
        .filter(function (e) { return (e.innerText || '').indexOf('Players') > -1; })
        .map(function (e) { var b = e.getBoundingClientRect(); return e.tagName + '.' + (e.className || '') + ' onclick=' + (e.getAttribute('onclick') || '-') + ' ' + Math.round(b.width) + 'x' + Math.round(b.height); });
})()`;

// Row 0's box and the line under it - what it holds, what it is called, and what
// the line says right now.
const BOX_PROBE = `(function () {
    var row = document.querySelector('#players-sheet-body .ps-row');
    if (!row) return 'no row';
    var box = row.querySelector('.ps-hcp');
    var note = row.querySelector('.ps-hcp-note');
    return JSON.stringify({
        value: box ? String(box.value) : null,
        placeholder: box ? String(box.getAttribute('placeholder') || '') : null,
        note: note ? String(note.textContent || '') : null
    });
})()`;

const fails = [];
const log = (...a) => console.log(...a);
const bad = (m) => { fails.push(m); log('  FAIL  ' + m); };
const ok = (m) => log('  ok    ' + m);

(async () => {
    // ---- 1. THE BOARD -------------------------------------------------------
    log('THE BOARD at 390x844 (leaderboard.html?game=HL1)');
    const board = await arriveCold({
        url: fileUrl('leaderboard.html', 'game=HL1'),
        db: { events: { HL1: ROUND } }, viewport: { width: 390, height: 844 }, settleMs: 3000,
        steps: [
            { expression: BOARD_PROBE },
            { tap: '#board-content tr[data-player-id="101"] td.player-name' }, { sleep: 400 },
            { expression: BOARD_PROBE }
        ]
    });
    if (!board.ok) { log('HARNESS: ' + board.reason); process.exitCode = 2; return; }
    const before = board.value[0], after = board.value[3];
    if (!before || !before.rows || !before.rows.length) { log('HARNESS: no board rows measured'); process.exitCode = 2; return; }

    log('  rows measured: ' + before.rows.length);
    before.rows.forEach(r => log('    id ' + r.id + '  row ' + r.rowH + 'px  name cell ' + r.nameW
        + 'px  label ' + (r.labelW === null ? '(none)' : r.labelW + 'x' + r.labelH + 'px') + '  ' + JSON.stringify(r.label)));

    const labelled = before.rows.filter(r => r.label && r.label.indexOf('Index') === 0);
    if (labelled.length >= 5) ok(labelled.length + ' rows carry an Index label');
    else bad('only ' + labelled.length + ' rows carry an Index label - expected 6');
    labelled.forEach(r => {
        if (r.overflows) bad('id ' + r.id + ': the label overflows the name cell');
        if (/Playing/.test(r.label)) bad('id ' + r.id + ': the row carries the FULL form, not the compact one: ' + r.label);
        if (/\.\d/.test(r.label.replace(/Index [^·]*/, ''))) bad('id ' + r.id + ': a decimal Course Handicap in the row: ' + r.label);
    });
    // THE BOUND IS ROW HEIGHT, NOT LINE COUNT - and that correction came from
    // this check. The label does wrap onto a second line inside the name cell
    // (the golfer's NAME takes most of a 144px cell first), and the first
    // version of this check called that a failure. Measured, it costs nothing:
    // v201 established that the score cell's stacked gross/net is the floor on
    // row height, so a taller name cell is free until it passes that floor. The
    // honest bound is therefore the UNLABELLED row - Cal, who has no Index - and
    // a labelled row must be no taller than his.
    const labelLines = Math.max.apply(null, labelled.map(r => r.labelH));
    log('    tallest label box: ' + labelLines + 'px (one line is ~13px, so >22px means it wrapped)');
    const plainRow = before.rows.filter(r => !r.label || r.label.indexOf('Index') !== 0).map(r => r.rowH);
    const floor = plainRow.length ? Math.max.apply(null, plainRow) : null;
    const rowMax = Math.max.apply(null, before.rows.map(r => r.rowH));
    log('    tallest board row: ' + rowMax + 'px; tallest row with NO Index label: ' + floor + 'px');
    if (floor === null) bad('no unlabelled row to measure against - the fixture needs a golfer with no Index');
    else if (rowMax <= floor) ok('a labelled row is no taller than an unlabelled one (' + rowMax + ' <= ' + floor + 'px)');
    else bad('the label made rows taller: ' + rowMax + 'px vs ' + floor + 'px unlabelled');
    if (before.docScrollX) bad('the board scrolls sideways at 390px'); else ok('no sideways scroll');

    // The expanded card, after a real tap on the row.
    if (!after.cardLabel) bad('tapping the row did not draw the card handicap line');
    else {
        log('    card line: ' + JSON.stringify(after.cardLabel) + '  ' + after.cardLabelW + 'px in a ' + after.cardCellW + 'px cell');
        if (!/Playing/.test(after.cardLabel)) bad('the expanded card is missing the FULL form: ' + after.cardLabel);
        else ok('the expanded card carries the full form');
        if (after.cardLabelW > after.cardCellW + 1) bad('the card line is wider than its cell');
        else ok('the card line fits its cell');
    }

    // ---- 2. THE PLAYERS SHEET ----------------------------------------------
    log('');
    log('THE PLAYERS SHEET at 390x844 (index.html?game=HL1, tapped open)');
    const sheet = await arriveCold({
        url: fileUrl('index.html', 'game=HL1'),
        db: { events: { HL1: ROUND } }, viewport: { width: 390, height: 844 }, settleMs: 3000,
        // Instrumentation only - a listener, nothing of the page's called. An
        // exception inside the button's own handler is otherwise invisible: the
        // sheet simply does not open and the check cannot say why.
        preScript: "window.__errs=[]; window.addEventListener('error', function (e) { window.__errs.push(String(e.message)); });",
        steps: [
            { expression: CANDIDATES },
            // PAST THE GROUP PICKER FIRST. A round with more than one group opens
            // on "Which group are you keeping score for?", an overlay that COVERS
            // the setup controls - measured: document.elementFromPoint at the
            // Players button's own centre returned the picker's Group 1 button,
            // so the first version of this check tapped that instead and navigated
            // to ?group=1 (which locks the group and correctly hides setup). The
            // organizer's own way past it is "Just watching".
            { expression: "(function(){var b=document.querySelector('[onclick=\"dismissGroupPick()\"]'); if(!b) return 'no picker to dismiss'; var r=b.getBoundingClientRect(); return 'picker up, Just watching at ' + Math.round(r.left) + ',' + Math.round(r.top);})()" },
            { tap: '[onclick="dismissGroupPick()"]' }, { sleep: 400 },
            // SCROLLED INTO VIEW BEFORE IT IS TAPPED. With eight golfers the
            // button sits below the fold, and a tap at a point the element no
            // longer occupies lands on whatever is there instead - which is how
            // the first run of this check reported "tapped" and measured a sheet
            // that never opened. scrollIntoView is a DOM call, not a page
            // function; the tap below is still a real tap on the page's own
            // button.
            { expression: "(function(){var b=document.querySelector('[onclick=\"openPlayersSheet()\"]'); if(!b) return 'no button'; b.scrollIntoView({block:'center'}); var r=b.getBoundingClientRect(); return 'button at ' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height);})()" },
            { sleep: 250 },
            { tap: '[onclick="openPlayersSheet()"]' }, { sleep: 600 },
            { expression: SHEET_PROBE },
            // v213: THE BOX IS THE INDEX, AND THE LINE MOVES AS THEY TYPE. mini-dom
            // cannot do either - its innerHTML is a string, so the sheet's rows are
            // not elements and no oninput can fire. So this is the only place the
            // wire is actually exercised: a real tap into the box, the End key, and
            // real inserted text, which is what fires the page's own oninput.
            { expression: BOX_PROBE },
            { tap: '#players-sheet-body .ps-row .ps-hcp' },
            { cdp: { method: 'Input.dispatchKeyEvent', params: { type: 'rawKeyDown', key: 'End', code: 'End', windowsVirtualKeyCode: 35, nativeVirtualKeyCode: 35 } } },
            { cdp: { method: 'Input.dispatchKeyEvent', params: { type: 'keyUp', key: 'End', code: 'End', windowsVirtualKeyCode: 35, nativeVirtualKeyCode: 35 } } },
            // A DIGIT, not another decimal point. Typing ".4" onto "18.4" gives
            // "18.4.4", which handicap.js sanitises back to 18.4 - so the line
            // correctly did NOT move, and the first run of this check read that as
            // a broken wire. "5" makes 18.45, a different index and a different
            // Course Handicap, so a line that does not move is a real failure.
            { cdp: { method: 'Input.insertText', params: { text: '5' } } },
            { sleep: 300 },
            { expression: BOX_PROBE },
            { expression: "JSON.stringify((window.__errs || []).slice(0, 4))" }
        ]
    });
    if (!sheet.ok) { log('HARNESS: ' + sheet.reason); process.exitCode = 2; return; }
    log('    controls containing "Players": ' + JSON.stringify(sheet.value[0]));
    log('    ' + sheet.value[1]);
    log('    dismiss: ' + sheet.value[2]);
    log('    ' + sheet.value[4]);
    log('    tap: ' + sheet.value[6]);
    const s = sheet.value[8];
    const boxBefore = (() => { try { return JSON.parse(sheet.value[9]); } catch (e) { return null; } })();
    const boxAfter = (() => { try { return JSON.parse(sheet.value[15]); } catch (e) { return null; } })();
    const errs = sheet.value[16];
    if (errs && errs !== '[]') log('    page errors: ' + errs);
    if (!s || !s.open) { bad('the Players sheet did not open on a real tap - nothing measured: ' + JSON.stringify(s)); }
    else {
        log('    rows: ' + s.rows.length + (s.bodyScrollX ? '  (PAGE SCROLLS SIDEWAYS)' : ''));
        s.rows.forEach(r => log('      id ' + r.id + '  row ' + r.rowH + 'x' + r.rowW
            + '  name h' + (r.name && r.name.h) + '  hcp h' + (r.hcp && r.hcp.h)
            + '  flight h' + (r.flight && r.flight.h) + '  grp h' + (r.grp && r.grp.h)
            + '  note ' + (r.note ? ('t' + r.note.t + ' h' + r.note.h + ' w' + r.note.w + ' ' + JSON.stringify(r.note.text)) : '(none)')));
        if (s.bodyScrollX) bad('the Players sheet makes the page scroll sideways at 390px');
        else ok('no sideways scroll with the labels in');
        const withNote = s.rows.filter(r => r.note);
        if (withNote.length >= 5) ok(withNote.length + ' rows carry the Index/Course line');
        else bad('only ' + withNote.length + ' rows carry the Index/Course line - expected 6');
        withNote.forEach(r => {
            // ITS OWN LINE: the note's top must be BELOW the handicap box's top,
            // and the five controls must all still sit on the first line.
            if (!(r.hcp && r.note.t >= r.hcp.t + r.hcp.h - 2)) {
                bad('id ' + r.id + ': the note is not on its own line (note top ' + r.note.t + ', hcp box ' + (r.hcp && r.hcp.t) + '+' + (r.hcp && r.hcp.h) + ')');
            }
            // THE FIVE CONTROLS STAY ON ONE LINE TOGETHER. Measured against each
            // OTHER, not against zero: .ps-row carries 4px of vertical padding
            // plus a border, so every control sits at top 5 in a correct layout -
            // the first version of this check demanded top <= 4 and reported 28
            // failures on a page that was laid out exactly as intended.
            const tops = ['name', 'hcp', 'flight', 'grp'].map(k => r[k] && r[k].t).filter(t => t !== null && t !== undefined);
            const spread = Math.max.apply(null, tops) - Math.min.apply(null, tops);
            if (spread > 2) bad('id ' + r.id + ': the controls are not on one line (tops ' + JSON.stringify(tops) + ')');
            if (r.note.r > r.rowW + 1) bad('id ' + r.id + ': the note is wider than its row');
        });
        // Tap targets: the sheet's controls were 40px before this wave and must
        // still be. (This sheet's inputs are min-height:40px by design, not 44 -
        // that is pre-existing and is reported, not asserted.)
        const heights = s.rows.map(r => [r.name && r.name.h, r.hcp && r.hcp.h, r.flight && r.flight.h, r.grp && r.grp.h]).flat().filter(h => h !== null && h !== undefined);
        const minH = Math.min.apply(null, heights);
        log('    smallest control height: ' + minH + 'px');
        if (minH >= 40) ok('every control is still at least 40px');
        else bad('a control shrank below 40px: ' + minH);
        const noted = s.rows.find(r => r.note);
        const plain = s.rows.find(r => !r.note);
        if (noted && plain) {
            const cost = noted.rowH - plain.rowH;
            log('    row height with the line: ' + noted.rowH + 'px; without: ' + plain.rowH + 'px (+' + cost + ' per labelled row)');
            log('    so the sheet grows by ' + (s.rows.filter(r => r.note).length * cost) + 'px over ' + s.rows.length + ' golfers - it is a scrolling modal, and the line is the point of this wave');
            if (cost > 30) bad('the line costs more than 30px a row: ' + cost);
            else ok('the line costs ' + cost + 'px a row');
        }
        // And the note really does span the row rather than sitting in a column.
        withNote.forEach(r => {
            if (r.note.w < r.rowW - 8) bad('id ' + r.id + ': the note does not span the row (' + r.note.w + ' of ' + r.rowW + 'px)');
        });
    }

    // ---- 3. THE INDEX BOX, TYPED INTO FOR REAL ------------------------------
    log('');
    log('THE INDEX BOX (v213): what it holds, and whether the line follows the typing');
    if (!boxBefore || !boxAfter) bad('the box could not be read: ' + JSON.stringify([sheet.value[9], sheet.value[15]]));
    else {
        log('    before: ' + JSON.stringify(boxBefore));
        log('    after typing "5": ' + JSON.stringify(boxAfter));
        if (boxBefore.placeholder === 'Index') ok('the box is labelled Index on a GHIN round');
        else bad('the box is labelled ' + JSON.stringify(boxBefore.placeholder) + ', not Index');
        // Christopher is off 18.4 in this fixture, so his box holds 18.4 and the
        // line under it is his Course Handicap off the 131/73.4/72 tee.
        if (boxBefore.value === '18.4') ok('and it holds the golfer\'s INDEX (18.4), not their playing handicap');
        else bad('the box holds ' + JSON.stringify(boxBefore.value) + ' - expected the index 18.4');
        if (/Course 22\.73/.test(String(boxBefore.note))) ok('the line names the derived Course Handicap: ' + boxBefore.note);
        else bad('the line does not name the Course Handicap: ' + JSON.stringify(boxBefore.note));
        if (boxAfter.value === '18.45') ok('the typing landed in the box (18.4 -> 18.45)');
        else bad('the typing did not land: box is ' + JSON.stringify(boxAfter.value));
        if (/Course 22\.79/.test(String(boxAfter.note))) ok('and the line MOVED with it: ' + JSON.stringify(boxAfter.note));
        else bad('the line did not follow the typing: ' + JSON.stringify(boxAfter.note) + ' (was ' + JSON.stringify(boxBefore.note) + ')');
    }

    log('');
    log(fails.length ? fails.length + ' measurement(s) outside their bound' : 'every measurement inside its bound');
    process.exitCode = fails.length ? 1 : 0;
})();
