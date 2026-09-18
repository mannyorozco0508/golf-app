// ============================================================================
// QR CODES FOR TEAM SCORECARD LINKS (2026-09-18): the guard, the tee sheet, the
// inline QR beside each Share. Teams only - see the SEAMS block for groups.
//
// 1. THE GUARD (D). openShareModal used to do `new QRCode(...)` before opening the
//    modal. With the library missing that threw and the modal never opened: no
//    QR, no link, no Copy - measured in Chrome with the CDN blocked, and live
//    today for an organizer on bad wifi. Now the modal opens and shows the link
//    and Copy whatever happens to the QR; the QR is drawn only if QRCode is a
//    function and a failed draw leaves a sentence, not a hole. With the library
//    vendored (qrcode_vendor_test.js) this should never fire - which is exactly
//    why it exists.
//
// 2. THE TEE SHEET. A THIRD BUILDER handed to printSheet - not a second print
//    mechanism. One cell per team: the team name, "Hole N" when the start is
//    shotgun, the QR, and the URL in small type under it so a dead scanner can
//    still be typed. Error correction M and a cell >= 35 mm (an 83-character
//    team link is a 37x37 code at M; H would make it 49x49 and marginal at
//    small sizes). Every cell carries ITS OWN team's URL and nobody else's.
//
// 3. THE INLINE QR. Each row on the Leaderboard tab's Team Scorecard Links
//    carries a small QR beside its Share, drawn by the same guarded helper.
//
// HARNESS. mini-dom has no canvas, so the vendored library's draw throws inside
// the harness - which is what the guard's fallback is for, and what these tests
// see: the sentence, not the image. Images with real natural sizes, rects under
// print media, and a scannable module count are Chrome's job:
// tools/tournament-tee-qr-check.js.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const PAGE = 'tournament.html';
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const SRC = read(PAGE);
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const TEAMS = {
    team1: { num: 1, name: 'Eagles', players: ['Ann Alpha', 'Bo Bravo'], handicap: 0, startingHole: '1' },
    team2: { num: 2, name: 'Hawks', players: ['Cal Charlie', 'Dee Delta'], handicap: 3, startingHole: '10A' },
    team3: { num: 3, name: "O'Malley's Mob", players: ['Eli Echo'], handicap: 0, startingHole: '' }
};
const record = (o) => Object.assign({ name: 'Tee QR Scramble', format: 'scramble', courseName: 'Camas Meadows', courseData: COURSE, entryFee: 0,
    teams: JSON.parse(JSON.stringify(TEAMS)), startType: 'shotgun', createdAt: 1, ownerUid: 'u-org' }, o || {});
const ORGANIZER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };

function arrive(rec, user) {
    const sb = loadHtmlInlineScript(PAGE, [], { search: '?tourney=TEEQR' });
    sb.alert = () => {};
    if (user !== undefined) sb.__auth.setUser(user);
    const handlers = sb.__dbHandlers.filter((h) => h.event === 'value' && /tournaments\/TEEQR$/.test(h.path));
    assert.ok(handlers.length > 0, 'no value handler for the tournament');
    handlers.forEach((h) => h.cb({ val: () => JSON.parse(JSON.stringify(rec)), exists: () => true }));
    return sb;
}
const el = (sb, id) => sb.document.getElementById(id);
const html = (sb, id) => String((el(sb, id) || {}).innerHTML || '');
const text = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
const count = (hay, re) => (String(hay).match(re) || []).length;
const BASE = 'tournament-scorecard.html?tourney=TEEQR&team=';
const urlOf = (n) => new RegExp(BASE.replace(/[?&.]/g, '\\$&') + n + '(?![0-9])');

// ===========================================================================
describe('1. THE GUARD: the share modal opens without the QR library', () => {
    test('QRCode undefined: the modal opens, the link and Copy are there, and the box says the QR is unavailable', () => {
        const sb = arrive(record(), ORGANIZER);
        sb.QRCode = undefined;
        sb.openShareModal('https://x.test/tournament-scorecard.html?tourney=TEEQR&team=1', 'Eagles');
        assert.ok(el(sb, 'share-link-modal').classList.contains('open'), 'the modal must open without the library');
        assert.equal(el(sb, 'share-link-text').textContent, 'https://x.test/tournament-scorecard.html?tourney=TEEQR&team=1');
        assert.match(String(el(sb, 'share-modal-title').textContent), /Eagles — Scorecard Link/);
        // mini-dom: textContent is a plain property, so the sentence is read there.
        assert.match(String(el(sb, 'share-qr-box').textContent || ''), /QR code unavailable — copy the link\./);
    });
    test('a draw that THROWS (this harness has no canvas) is caught: the modal still opens with the link', () => {
        const sb = arrive(record(), ORGANIZER);
        assert.equal(typeof sb.QRCode, 'function', 'the vendored library loads into the page (qrcode_vendor_test.js)');
        sb.openShareModal('https://x.test/tournament-scorecard.html?tourney=TEEQR&team=2', 'Hawks');
        assert.ok(el(sb, 'share-link-modal').classList.contains('open'));
        assert.equal(el(sb, 'share-link-text').textContent, 'https://x.test/tournament-scorecard.html?tourney=TEEQR&team=2');
    });
    test('the source: one guarded drawer, and openShareModal opens the modal AFTER drawing whatever happened', () => {
        assert.match(SRC, /function drawQrInto\(el, url, size, level\)/);
        const at = SRC.indexOf('function openShareModal(');
        const fn = SRC.slice(at, SRC.indexOf('\n    }', at));
        assert.doesNotMatch(fn, /new QRCode\(/, 'the modal must not construct the library itself');
        assert.match(fn, /drawQrInto\(/);
        assert.ok(fn.indexOf('drawQrInto(') < fn.indexOf("classList.add('open')"), 'draw, then open - and the open must not depend on the draw');
    });
});

// ===========================================================================
describe('2. THE TEE SHEET: a third builder through printSheet', () => {
    test('the button and the trigger: Print Tee Sheet -> printTournamentTeeSheet -> printSheet(buildTeeSheetPrintView); window.print in one place', () => {
        assert.match(SRC, /<button[^>]*onclick="printTournamentTeeSheet\(\)"[^>]*>[^<]*Tee Sheet/);
        assert.match(SRC, /function printTournamentTeeSheet\(\)\s*\{\s*printSheet\(buildTeeSheetPrintView\);\s*\}/);
        assert.equal(count(SRC, /window\.print\(\)/g), 1, 'still one print mechanism');
    });

    test('one cell per team, sorted by team number, each with ITS OWN team name and ITS OWN URL - and no other team\'s', () => {
        const sb = arrive(record(), ORGANIZER);
        let printed = 0; sb.print = () => { printed++; }; sb.addEventListener = () => {};
        sb.printTournamentTeeSheet();
        assert.equal(printed, 1, 'window.print reached through printSheet');
        // The URLs are HTML-escaped in the markup (&amp;); compare them unescaped.
        const sheet = html(sb, 'tournament-print-view').replace(/&amp;/g, '&');
        const cells = sheet.split('class="tee-cell"').slice(1);
        assert.equal(cells.length, 3, 'three teams, three cells');
        const names = ['Eagles', 'Hawks', "O'Malley's Mob"];
        cells.forEach((cell, i) => {
            const n = i + 1;
            assert.match(text(cell), new RegExp(names[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'cell ' + n + ' names its team');
            assert.match(cell, urlOf(n), 'cell ' + n + ' carries team ' + n + "'s URL");
            [1, 2, 3].filter((m) => m !== n).forEach((m) => assert.doesNotMatch(cell, urlOf(m), 'cell ' + n + " carries team " + m + "'s URL"));
            assert.match(cell, /class="tee-url"/, 'the URL is printed in small type under the code');
        });
    });

    test('shotgun: the starting hole is in the cell; a team with none shows HOLE NOT SET; tee times: no hole line at all', () => {
        const sb = arrive(record(), ORGANIZER);
        sb.print = () => {}; sb.addEventListener = () => {};
        sb.printTournamentTeeSheet();
        const cells = html(sb, 'tournament-print-view').split('class="tee-cell"').slice(1);
        assert.match(text(cells[0]), /Hole 1\b/);
        assert.match(text(cells[1]), /Hole 10A/);
        assert.match(text(cells[2]), /HOLE NOT SET/);
        const tee = arrive(record({ startType: 'teetime' }), ORGANIZER);
        tee.print = () => {}; tee.addEventListener = () => {};
        tee.printTournamentTeeSheet();
        const t = text(html(tee, 'tournament-print-view'));
        assert.doesNotMatch(t, /Hole \d|HOLE NOT SET/);
    });

    test('the header names the event and says what the sheet is for; the print class is added and removed', () => {
        const sb = arrive(record(), ORGANIZER);
        const listeners = []; sb.print = () => {}; sb.addEventListener = (ev, fn) => listeners.push({ ev, fn });
        sb.printTournamentTeeSheet();
        const t = text(html(sb, 'tournament-print-view'));
        assert.match(t, /Tee QR Scramble/);
        assert.match(t, /Scan to open your team's scorecard/);
        assert.ok(sb.document.body.classList.contains('printing-results'), 'the class the print CSS keys on');
        const after = listeners.find((l) => l.ev === 'afterprint');
        assert.ok(after, 'afterprint listener registered'); after.fn();
        assert.ok(!sb.document.body.classList.contains('printing-results'));
    });

    test('no teams: nothing prints and the organizer is told', () => {
        const sb = arrive(record({ teams: {} }), ORGANIZER);
        const alerts = []; sb.alert = (m) => alerts.push(String(m));
        let printed = 0; sb.print = () => { printed++; };
        sb.printTournamentTeeSheet();
        assert.equal(printed, 0);
        assert.ok(alerts.some((m) => /no teams/i.test(m)), JSON.stringify(alerts));
    });

    test('the QR in a cell is a SYNCHRONOUSLY PAINTED CANVAS the page owns, appended after innerHTML at error-correction M - never the async draw, never a data URI (source)', () => {
        // FIX C' (2026-09-18): the first version drew into the live cells with the
        // library, whose <img> src lands asynchronously; printSheet called
        // window.print() in the same task and the paper got blank cells. A data
        // URI <img> does not fix it: Chrome pauses the page for the print dialog
        // and defers the posted data-URL load with it (HANDOFF has the Chromium
        // file:line trail). Only pixels already painted at the call reach the
        // paper, so the builder asks qrBitmap() for a canvas of its own -
        // drawImage from the library's scratch canvas, synchronously - and
        // APPENDS it to the cell after innerHTML (a canvas serialised through
        // innerHTML or cloneNode loses its bitmap).
        const at = SRC.indexOf('function buildTeeSheetPrintView(');
        const fn = SRC.slice(at, SRC.indexOf('\n    function ', at + 30));
        assert.ok(fn.length > 200, 'the builder exists');
        assert.match(fn, /qrBitmap\(url, 132, qrLevelM\(\)\)/, 'a synchronous bitmap at M');
        assert.doesNotMatch(fn, /drawQrInto\(|new QRCode\(|qrDataUri\(|toDataURL/, 'the builder must not draw into the sheet after the fact, nor go through a data URI');
        assert.doesNotMatch(fn, /<img|<canvas/, 'no image element is serialised into the markup');
        assert.match(fn, /box\.appendChild\(bitmap\)/, 'the painted canvas is appended, after innerHTML');
        assert.ok(fn.indexOf('container.innerHTML = html') < fn.indexOf('box.appendChild(bitmap)'), 'appended AFTER innerHTML');
        const q = SRC.indexOf('function qrBitmap(url, size, level)');
        assert.ok(q > 0, 'qrBitmap exists');
        const qf = SRC.slice(q, SRC.indexOf('\n    }', q));
        assert.match(qf, /new QRCode\(scratch, opts\)/, 'the library draws into a scratch element');
        assert.match(qf, /own\.getContext\('2d'\)\.drawImage\(drawn, 0, 0\)/, 'the pixels are copied into a canvas the page owns - no library reference, so its later display flip touches nothing on the sheet');
        assert.match(qf, /own\.className = 'tee-qr-bitmap'/);
        assert.doesNotMatch(qf, /toDataURL/, 'no data URI on the print path');
        assert.match(SRC, /function qrLevelM\(\) \{ return [^}]*QRCode\.CorrectLevel\.M/, 'qrLevelM is M');
        assert.match(fn, /class="tee-cell"/);
        assert.match(SRC, /\.tee-cell\s*\{[^}]*width:\s*(3[5-9]|[4-9][0-9])mm/, 'a cell of at least 35 mm');
        assert.match(SRC, /\.tee-qr-bitmap\s*\{[^}]*width:\s*35mm/, 'the bitmap prints at 35 mm');
        assert.match(SRC, /\.tee-cell\s*\{[^}]*page-break-inside:\s*avoid/, 'a code is never split across pages');
        assert.doesNotMatch(SRC, /\.tee-qr canvas\s*\{/, 'the rule that hid the canvas must not come back');
        assert.doesNotMatch(SRC, /tee-qr-img|qrDataUri/, 'fix C (the data-URI img) is gone, not left beside the canvas');
    });

    test('qrBitmap: null without the library, null when the draw throws, and the builder falls back to the sentence in the MARKUP with no canvas', () => {
        const sb = arrive(record(), ORGANIZER);
        sb.QRCode = undefined;
        assert.equal(sb.qrBitmap('https://x.test/?tourney=TEEQR&team=1', 132, undefined), null);
        const sb2 = arrive(record(), ORGANIZER);
        assert.equal(typeof sb2.QRCode, 'function');
        // mini-dom has no canvas: the library's draw throws inside qrBitmap and it answers null.
        assert.equal(sb2.qrBitmap('https://x.test/?tourney=TEEQR&team=1', 132, sb2.qrLevelM()), null);
        sb2.print = () => {}; sb2.addEventListener = () => {};
        sb2.printTournamentTeeSheet();
        const sheet = html(sb2, 'tournament-print-view');
        assert.equal(count(sheet, /QR code unavailable — open the link\./g), 3, 'the sentence is in every cell\'s markup');
        assert.equal(count(sheet, /<canvas|<img/g), 0, 'no image element when there is no bitmap');
        assert.equal(count(sheet, /class="tee-qr" data-team="[123]"/g), 3, 'each cell is keyed to its team for the append');
    });
});

// ===========================================================================
describe('3. THE INLINE QR beside each Share on the Leaderboard tab', () => {
    test('every public team row carries a .team-qr keyed to its team, before its Share button', () => {
        const sb = arrive(record(), null);
        const list = html(sb, 'team-links-list');
        assert.equal(count(list, /class="team-qr"/g), 3, 'one QR box per team row');
        [1, 2, 3].forEach((n) => assert.match(list, new RegExp('class="team-qr" data-team="' + n + '"')));
        const row1 = list.slice(list.indexOf('data-team="1"') - 400, list.indexOf('data-team="2"'));
        assert.ok(row1.indexOf('class="team-qr"') < row1.indexOf('openShareModal('), 'the QR sits before the Share button in the row');
    });
    test('the Setup tab\'s editable cards do NOT carry a QR - the organizer\'s cards are for editing', () => {
        const sb = arrive(record(), ORGANIZER);
        assert.equal(count(html(sb, 'team-cards-list'), /class="team-qr"/g), 0);
    });
    test('renderTeamLinks draws each inline QR through the guarded helper (source), at M', () => {
        const at = SRC.indexOf('function renderTeamLinks(');
        const fn = SRC.slice(at, SRC.indexOf('\n    function ', at + 30));
        assert.match(fn, /querySelectorAll\('\.team-qr'\)/);
        assert.match(fn, /drawQrInto\([^)]*qrLevelM\(\)\)/);
    });
});

// ===========================================================================
describe('4. THE SEAMS', () => {
    test('HANDOFF: the vendoring, the guard, the sheet, and why groups are a different grid', () => {
        const h = read('HANDOFF.md');
        const at = h.indexOf('## QR codes for team scorecard links');
        assert.ok(at > 0, 'no section');
        const s = h.slice(at, at + 7000);
        assert.match(s, /qrcode\.min\.js/); assert.match(s, /MIT/); assert.match(s, /TOURNAMENT_SHELL/);
        assert.match(s, /QRCode is not defined/);
        assert.match(s, /CorrectLevel\.M|error.correction M/i);
        assert.match(s, /group/i); assert.match(s, /different grid/i);
    });
    test('both caches moved for the tee-QR wave (v47 / v172) and again for the canvas fix (v48 / v173), and have not moved back', () => {
        // Later tournament waves move both keys on; the Moved-to notes stay.
        assert.match(read('build-shell.js'), /Moved to v47\. QR codes for team scorecard links/);
        assert.match(read('build-shell.js'), /Moved to v48\. The tee sheet's QR is a canvas/);
        assert.match(read('sw.js'), /Moved to v172: QR codes for team scorecard links/);
        assert.match(read('sw.js'), /Moved to v173: the tee sheet's QR is a canvas/);
        const t = /cacheName: 'tournament-v(\d+)-/.exec(read('build-shell.js'));
        const c = /const CACHE_VERSION = 'golfapp-v(\d+)-/.exec(read('sw.js'));
        assert.ok(t && Number(t[1]) >= 48, 'tournament key at or past v48: ' + (t && t[0]));
        assert.ok(c && Number(c[1]) >= 173, 'consumer key at or past v173: ' + (c && c[0]));
    });
});
