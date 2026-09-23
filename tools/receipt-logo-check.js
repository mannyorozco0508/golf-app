#!/usr/bin/env node
// ============================================================================
// THE MARK IS ON THE PRINTED RECEIPT AND NOWHERE ON THE SCREEN
//
// settlement.html carries the brand mark (logo-mark.png, the lobby's own asset)
// inside buildReceiptHeader - display:none on screen, shown in @media print.
// mini-dom has no layout and no print media, so the two claims that matter are
// measured here, in Chrome, on a cold arrival with no page function called:
//
//   SCREEN   the mark is display:none and 0 x 0; the header, the course name and
//            the first card sit exactly where they sit on a page WITHOUT the
//            mark (HEAD~ or any build that lacks it - passed as --baseline
//            <file>, optional); the image is nonetheless already LOADED
//            (complete, 256 x 256), so print never waits on a fetch.
//   PRINT    (Emulation.setEmulatedMedia print) the mark is a 64 x 64 block,
//            centred, above the course name; the course name and the first card
//            move down by the mark's height plus its 6 px margin and nothing
//            else changes.
//   EXPORT   RattleExport._linesFrom on the export roots - what the native PDF
//            is built from - contains no "HardPan": innerText carries no alt
//            text, so the native PDF is text-only exactly as before. That is a
//            statement of fact, not a pass condition; see receipt_logo_test.js.
//
//   node tools/receipt-logo-check.js [--baseline settlement.__baseline.html]
//
//   exit 0   PASS
//   exit 1   FAIL - the JSON names the measurement
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const CD = []; for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const P = ['Ann A', 'Ben B', 'Cal C', 'Dee D'].map((n, i) => ({ id: 101 + i, name: n, hcp: '0' }));
const scores = {}; P.forEach((p, i) => CD.forEach(h => { scores['p' + p.id + '_h' + h.hole] = 4 + ((i === 0 && h.hole % 3 === 0) ? -1 : 0); }));
const ROUND = { eventName: 'Logo', courseName: 'Caledonia', activeCourseKey: 'x', gameFormat: 'skins', skinsBuyIn: 5, skinsPotFormat: 'gross',
    settlementMode: 'whole-dollar', courseData: CD, players: P, scores,
    sideMatches: { m: { format: 'match', scoring: 'gross', stake: 25, startHole: 1, createdAt: 1, teamAIds: ['101', '103'], teamBIds: ['102', '104'] } } };

const GEO = `(function(){ var q = s => document.querySelector(s);
  var r = el => { if (!el) return null; var b = el.getBoundingClientRect(); return [Math.round(b.x*10)/10, Math.round(b.y*10)/10, Math.round(b.width*10)/10, Math.round(b.height*10)/10]; };
  var img = q('.receipt-mark'); var head = q('#receipt-export-head');
  var roots = ['receipt-export-head','settle-content','money-pool-section','combined-settlement-summary','receipt-scorecard']
    .map(id => document.getElementById(id)).filter(el => el && (el.innerText||'').trim().length > 0);
  var lines = (window.RattleExport && window.RattleExport._linesFrom) ? window.RattleExport._linesFrom(roots) : null;
  return JSON.stringify({ media: matchMedia('print').matches ? 'print' : 'screen',
    img: img ? { display: getComputedStyle(img).display, rect: r(img), complete: img.complete, natural: [img.naturalWidth, img.naturalHeight], src: img.getAttribute('src') } : null,
    head: r(head), course: r(q('.receipt-head-course')), firstCard: r(q('.settle-card')), docH: document.documentElement.scrollHeight, scrollW: document.documentElement.scrollWidth,
    headText: head ? head.innerText : null, exportLines: lines ? lines.length : null, exportHasRattle: lines ? lines.some(l => /HardPan|Rattle Golf/.test(l)) : null }); })()`;

function bail(msg) { console.log(JSON.stringify({ result: 'COULD NOT RUN', reason: msg })); process.exit(2); }

async function arrive(page) {
    const r = await arriveCold({ url: fileUrl(page, 'game=LOGO1'), db: { events: { LOGO1: ROUND } },
        steps: [{ expression: GEO }, { media: 'print' }, { expression: GEO }], settleMs: 4000 });
    if (!r.ok) bail(page + ': ' + r.reason);
    const [screen, print] = r.value.map(v => JSON.parse(v));
    if (!screen.head || !screen.headText || screen.headText.length < 20) bail(page + ': the receipt header did not render - nothing was measured');
    return { screen, print };
}

(async () => {
    const baselineArg = process.argv.indexOf('--baseline');
    const baseline = baselineArg > 0 ? process.argv[baselineArg + 1] : null;
    const problems = [];
    const t = await arrive('settlement.html');
    const s = t.screen, p = t.print;
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

    // SCREEN
    if (!s.img) problems.push('screen: no .receipt-mark in the header');
    else {
        if (s.img.display !== 'none') problems.push('screen: the mark is ' + s.img.display + ', not display:none');
        if (!same(s.img.rect, [0, 0, 0, 0])) problems.push('screen: the mark takes space: ' + JSON.stringify(s.img.rect));
        if (!s.img.complete || s.img.natural[0] < 1) problems.push('screen: the mark is not loaded (complete ' + s.img.complete + ', natural ' + s.img.natural + ') - print would wait on a fetch');
        if (s.img.src !== 'logo-mark.png') problems.push('screen: src is ' + s.img.src + ', not the precached logo-mark.png');
    }
    if (s.scrollW > 390) problems.push('screen: horizontal overflow ' + s.scrollW);
    if (s.exportHasRattle !== false) problems.push('export: the native text lines carry the alt text (' + s.exportHasRattle + ')');

    // PRINT
    if (p.media !== 'print') bail('print media was not emulated');
    if (!p.img || p.img.display !== 'block') problems.push('print: the mark is not shown (' + (p.img && p.img.display) + ')');
    else {
        if (!same(p.img.rect.slice(2), [64, 64])) problems.push('print: the mark is ' + p.img.rect[2] + 'x' + p.img.rect[3] + ', not 64x64');
        const centre = p.img.rect[0] + p.img.rect[2] / 2, headCentre = p.head[0] + p.head[2] / 2;
        if (Math.abs(centre - headCentre) > 1) problems.push('print: the mark is not centred (' + centre + ' vs ' + headCentre + ')');
        if (p.course[1] < p.img.rect[1] + p.img.rect[3]) problems.push('print: the course name is not below the mark');
        if (Math.abs((p.course[1] - p.img.rect[1]) - 70) > 1) problems.push('print: the course name sits ' + (p.course[1] - p.img.rect[1]) + ' px below the mark\'s top, expected 70 (64 + 6)');
    }

    // BASELINE (optional): the screen must be where a page without the mark puts it.
    let base = null;
    if (baseline) {
        base = (await arrive(baseline)).screen;
        ['head', 'course', 'firstCard', 'docH', 'headText', 'exportLines'].forEach(k => {
            if (!same(base[k], s[k])) problems.push('screen vs baseline: ' + k + ' moved: ' + JSON.stringify(base[k]) + ' -> ' + JSON.stringify(s[k]));
        });
    }

    console.log(JSON.stringify({ result: problems.length ? 'FAIL' : 'PASS', problems, screen: s, print: p, baseline: base ? { head: base.head, course: base.course, firstCard: base.firstCard, docH: base.docH } : 'not supplied' }, null, 1));
    process.exit(problems.length ? 1 : 0);
})().catch(e => bail(String(e && e.stack || e)));
