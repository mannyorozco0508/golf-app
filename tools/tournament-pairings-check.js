#!/usr/bin/env node
// ============================================================================
// THE PAIRINGS SHEET, ON PAPER: does the page hide everything but the sheet
// when print media applies, and is every golfer on it exactly once?
//
// tournament_pairings_print_test.js proves the CONTENT of the sheet under
// mini-dom, where innerHTML is a string. It cannot see @media print. The three
// rules at tournament.html <style> key on body.printing-results and were
// written for the results sheet; that they hide the manage screen when THIS
// sheet is the one on the page is a layout fact, and only a browser has
// layout. So this arrives cold, clicks the page's own Print Pairings button,
// switches the emulated media to print, and measures rects.
//
// A DEVICE CHECK MAY NOT CALL A FUNCTION THE PAGE DEFINES. The only thing this
// file does to the page is dispatch a click on the button a starter would
// press. window.print is replaced BEFORE any page script runs - a headless
// print dialog would hang the check - and that replacement is the one thing
// here that is not what a user does; it is recorded in the output.
//
//   node tools/tournament-pairings-check.js
//
//   exit 0   under print media only the sheet has a rect, and it names every
//            golfer in the stand-in record exactly once, with the HOLE NOT
//            SET count the record implies
//   exit 1   something else is visible on paper, a golfer is missing or
//            doubled, or the count is wrong
//   exit 2   could not run, or the button was not found. NOTHING PROVEN.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const course = PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: ((i * 7) % 18) + 1 }));

// Twenty teams on a shotgun: more than eighteen, so two holes carry a wave
// letter; two teams left with NO hole so the count at the top is 2 and the
// rows say HOLE NOT SET twice. Every golfer name is unique and shares no
// substring with any other or with a word on the sheet.
const NATO = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Gamma', 'Hotel', 'India',
    'Juliet', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra',
    'Tango', 'Uniform', 'Victor', 'Whiskey', 'Xray', 'Yankee', 'Zulu', 'Amber', 'Basil', 'Cedar',
    'Dune', 'Ember', 'Fern', 'Grove', 'Heath', 'Iris', 'Jade', 'Kelp', 'Larch', 'Moss', 'Nettle',
    'Olive', 'Pine', 'Quill', 'Reed', 'Sage', 'Thorn', 'Umber', 'Vale', 'Wren', 'Yarrow',
    'Aspen', 'Birch', 'Clove', 'Dill', 'Elm', 'Flax', 'Gorse', 'Hazel', 'Ivory', 'Juniper',
    'Kale', 'Lotus', 'Maple', 'Nutmeg', 'Oak', 'Poppy', 'Quince', 'Rowan', 'Sorrel', 'Tulip',
    'Ursa', 'Violet', 'Willow', 'Yew', 'Zinnia', 'Acacia', 'Bay', 'Cactus', 'Daisy', 'Elder'];
const NAMES = NATO.slice(0, 80).map((n, i) => 'G' + String(i + 1).padStart(2, '0') + ' ' + n);
const teams = {};
for (let t = 1; t <= 20; t++) {
    let hole = t <= 18 ? String(t) : String(t - 18) + 'A';   // 19 -> 1A, 20 -> 2A
    if (t === 7 || t === 13) hole = '';                          // two teams unplaced
    teams['team' + t] = {
        num: t, name: 'Team ' + t, handicap: '0', startingHole: hole,
        players: NAMES.slice((t - 1) * 4, t * 4)
    };
}
const CODE = 'PAIR01';
const db = {
    tournaments: {
        [CODE]: {
            name: 'Shotgun Scramble', format: 'scramble', courseName: 'Tidewater',
            activeCourseKey: 'tidewater', courseData: course, entryFee: '0',
            teams, scores: {}, createdAt: 1, courseIndexSynthetic: false, startType: 'shotgun'
        }
    },
    events: {}, trips: {}, global_courses: {}
};

// Replaced before any page script: a real print dialog never returns in
// headless Chrome. Counted, so the check can say the button reached it.
const PRE = `window.__prints = 0; window.print = function () { window.__prints++; };`;

const CLICK = `
(() => {
  // Since the auth wave the print buttons live on the Leaderboard tab. A legacy
  // record lands on Setup, so tap the tab a starter would before pressing Print.
  const lb = Array.prototype.slice.call(document.querySelectorAll('.top-nav-item')).find(x => /Leaderboard/.test(x.textContent || ''));
  if (lb) lb.click();
  const btn = Array.prototype.slice.call(document.querySelectorAll('button'))
    .find(b => /Print Pairings/.test(b.textContent || ''));
  if (!btn) return JSON.stringify({ found: false });
  const r = btn.getBoundingClientRect();
  btn.click();
  return JSON.stringify({ found: true, buttonVisibleOnScreen: r.width > 0 && r.height > 0,
    prints: window.__prints, bodyClass: document.body.className });
})()`;

// Under print media. Rects, not display: an element can be display:block and
// 0x0, which is why this is not a mini-dom test.
const MEASURE = `
(() => {
  const sheet = document.getElementById('tournament-print-view');
  const sr = sheet ? sheet.getBoundingClientRect() : { width: 0, height: 0 };
  const visible = [];
  Array.prototype.slice.call(document.body.querySelectorAll('*')).forEach(el => {
    // The sheet, its contents, and its ANCESTORS - #manage-screen is the box
    // the sheet lives in, and a box with a visible child has a rect. What must
    // be gone is every sibling on the way up.
    if (sheet && (el === sheet || sheet.contains(el) || el.contains(sheet))) return;
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) visible.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''));
  });
  const text = sheet ? (sheet.innerText || '') : '';
  const li = sheet ? Array.prototype.slice.call(sheet.querySelectorAll('li')).map(x => (x.innerText || '').trim()) : [];
  return JSON.stringify({
    sheetRect: { w: sr.width, h: sr.height },
    outsideVisible: visible,
    liTexts: li,
    holeNotSet: (text.match(/HOLE NOT SET/g) || []).length,
    countLine: (text.match(/\\d+ teams? (has|have) no starting hole/) || [null])[0],
    totals: (text.match(/\\d+ teams \\u00b7 \\d+ golfers/) || [null])[0],
    header: text.split('\\n').slice(0, 4),
    prints: window.__prints
  });
})()`;

(async () => {
    const bail = (why, extra) => {
        console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2));
        process.exit(2);
    };

    const r = await arriveCold({
        url: fileUrl('tournament.html', 'tourney=' + CODE), db, preScript: PRE, settleMs: 7000,
        steps: [{ expression: CLICK }, { media: 'print' }, { expression: MEASURE }, { media: '' }]
    });
    if (!r.ok) bail('the page did not run: ' + r.reason);
    let click, m;
    try { click = JSON.parse(r.value[0]); m = JSON.parse(r.value[1]); }
    catch (e) { bail('non-JSON from the page', r.value); }
    if (!click.found) bail('no button labelled Print Pairings on the manage screen');
    if (!click.buttonVisibleOnScreen) bail('the button exists but has no rect on screen - a starter cannot press it', click);

    const failures = [];
    // POSITIVE CONTROL FIRST: the sheet itself must have a rect, or "nothing
    // else is visible" is true of a blank page.
    if (!(m.sheetRect.w > 0 && m.sheetRect.h > 0)) {
        failures.push('under print media the sheet has no rect - nothing would print');
    }
    if (click.prints !== 1) {
        failures.push('the click reached window.print ' + click.prints + ' times, expected 1');
    }
    if (m.outsideVisible.length) {
        failures.push('under print media ' + m.outsideVisible.length + ' element(s) outside the sheet still have a rect: '
            + JSON.stringify(m.outsideVisible.slice(0, 12)));
    }
    // EVERY GOLFER ONCE. The multiset of <li> texts against the record.
    const expected = NAMES.slice().sort();
    const got = m.liTexts.slice().sort();
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
        const missing = expected.filter(n => !got.includes(n));
        const extra = got.filter(n => !expected.includes(n));
        failures.push('the printed golfers are not the record: missing ' + JSON.stringify(missing)
            + ', extra ' + JSON.stringify(extra) + ', printed ' + got.length + ' of ' + expected.length);
    }
    if (m.holeNotSet !== 2) failures.push('HOLE NOT SET appears ' + m.holeNotSet + ' times, two teams have no hole');
    if (!/^2 teams have no starting hole$/.test(m.countLine || '')) failures.push('count line wrong: ' + JSON.stringify(m.countLine));
    if (m.totals !== '20 teams · 80 golfers') failures.push('totals wrong: ' + JSON.stringify(m.totals));

    const verdict = failures.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({
        verdict, failures,
        measured: {
            buttonVisibleOnScreen: click.buttonVisibleOnScreen, printsReached: click.prints,
            bodyClassAfterClick: click.bodyClass,
            underPrintMedia: { sheetRect: m.sheetRect, elementsOutsideSheetWithRect: m.outsideVisible.length },
            golfersPrinted: m.liTexts.length, golfersInRecord: NAMES.length,
            holeNotSet: m.holeNotSet, countLine: m.countLine, totals: m.totals, header: m.header
        },
        notWhatAUserDoes: 'window.print replaced before load, so the dialog cannot hang the check'
    }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => {
    console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String((e && e.message) || e) }, null, 2));
    process.exit(2);
});
