#!/usr/bin/env node
// ============================================================================
// SCORE MARKS EVERYWHERE (gps-marks, 2026-10-16) - and the screenshots.
//
//   node tools/marks-check.js [<screenshot dir>]
//
// Cold Chrome, the app (HardPan). One golfer, Caledonia: hole 1 par (4 on a 4), hole 2 eagle
// (3 on a 5), hole 3 birdie (2 on a 3), hole 4 bogey (5 on a 4), hole 5 double or worse (7 on
// a 4).
//   1  The GPS score button: the number inside the card's own mark - plain / double circle /
//      circle / box / double box - and the button keeps its size; the shape fits inside it.
//   2  The live Full Scorecard: the same five marks on the same holes.
//   3  The Receipt (settlement.html): the same five, and the legend names them.
//   4  shared.html (the shared card): the same marks - its circles, and the boxes.
// Screenshots (with a directory): gps-hole1..5.png (the bottom of the GPS screen), card.png,
// receipt.png.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const HERE = path.join(__dirname, '..');
const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
const { wizardSavedRound } = require(path.join(HERE, 'helpers/wizard-saved-round.js'));
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : null;
const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});addEventListener('unhandledrejection',function(e){window.__e.push('rej '+String(e.reason&&e.reason.message||e.reason))});";
const APP = 'window.__hardpanDoors = true; window.__freshPhone = true;';
const CODE = 'MARKS1';
// The app's GolfAPI file (the app build only), so the screenshots show Caledonia, not the world map.
const GA = path.join(HERE, 'golfapi', 'gps-golfapi.js');
const GADATA = fs.existsSync(GA) ? fs.readFileSync(GA, 'utf8') + ";(function(){ var c0; Object.defineProperty(window, 'HARDPAN_GPS_CONFIG', { configurable: true, get: function () { return c0; }, set: function (v) { c0 = v; if (v) v.liveTest = true; } }); })();" : '';
const WANT = { 1: '', 2: 'eagle', 3: 'birdie', 4: 'bogey', 5: 'double' };
function round() {
    const r = wizardSavedRound({ code: CODE, golfers: 1, names: ['Manny Orozco'], hcps: [9], ownerUid: 'anon-cold', thru: 0, flights: false,
        overrides: { additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club' } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    const pars = [4, 5, 3, 4, 4];
    r.courseData.slice(0, 5).forEach((h, i) => { h.par = pars[i]; });
    const id = r.players[0].id;
    r.scores = { ['p' + id + '_h1']: 4, ['p' + id + '_h2']: 3, ['p' + id + '_h3']: 2, ['p' + id + '_h4']: 5, ['p' + id + '_h5']: 7 };
    return r;
}
const DB = () => ({ events: { [CODE]: round() }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} });
const SEED = "(function(){ try { if (sessionStorage.getItem('__seeded')) return; sessionStorage.setItem('__seeded','1'); localStorage.setItem('hardpan_round_side', 'gps|" + CODE + "'); } catch (e) {} })();";
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const go = async (o) => { const r = await arriveCold(Object.assign({ settleMs: 3500, viewport: { width: 390, height: 844 }, webgl: true }, o)); if (!r.ok) throw new Error(r.reason); return r; };
const BTN = "JSON.stringify({ hole: HardPanGps.hole(), text: (document.querySelector('#gps-overlay .gps-score')||{}).innerText, cls: (document.querySelector('#gps-overlay .gps-score-n')||{}).className || '', btn: (function(){ var b = document.querySelector('#gps-overlay .gps-score').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; })(), box: (function(){ var b = document.querySelector('#gps-overlay .gps-scorebox').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; })(), n: (function(){ var n = document.querySelector('#gps-overlay .gps-score-n'); if (!n) return null; var r = n.getBoundingClientRect(), p = document.querySelector('#gps-overlay .gps-score').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), inside: r.top >= p.top - 0.5 && r.bottom <= p.bottom + 0.5 && r.left >= p.left - 0.5 && r.right <= p.right + 0.5, fits: n.scrollWidth <= n.clientWidth + 1 && n.scrollHeight <= n.clientHeight + 1 }; })(), e: window.__e })";
const shot = (name) => OUT ? [{ shot: path.join(OUT, name) }] : [];

(async () => {
    const fails = [], report = {};
    const f = (c, m) => { if (!c) fails.push(m); };
    if (OUT) fs.mkdirSync(OUT, { recursive: true });

    // 1: the GPS button, hole by hole.
    const steps = [{ sleep: 2500 }, { expression: "(function(){ var b = document.getElementById('fd-gps-btn'); if (HardPanGps.side() !== 'gps' && b) b.click(); return 'gps'; })()" }, { sleep: 2500 }];
    for (let h = 1; h <= 5; h++) steps.push({ expression: "(function(){ goToHole(" + h + "); return 'h'; })()" }, { sleep: 700 }, { expression: BTN }, ...shot('gps-hole' + h + '.png'));
    let r = await go({ url: fileUrl('index.html', 'game=' + CODE), db: DB(), preScript: APP + ERR + GADATA + SEED, steps });
    const b = J(r);
    report.button = b.map((x) => [x.hole, x.text, x.cls, x.btn, x.n]);
    b.forEach((x, i) => {
        const h = i + 1, want = WANT[h];
        f(x.hole === h && x.text === String([4, 3, 2, 5, 7][i]), 'button hole ' + h + ': ' + JSON.stringify([x.hole, x.text]));
        f(want ? x.cls === 'gps-score-n mark-' + want : x.cls === 'gps-score-n', 'button hole ' + h + ': wants ' + (want || 'plain') + ', got "' + x.cls + '"');
        f(x.n && x.n.inside && x.n.fits, 'button hole ' + h + ': the mark is clipped or outside the button: ' + JSON.stringify(x.n));
        f(JSON.stringify(x.box) === JSON.stringify(b[0].box), 'button hole ' + h + ': the score box changed size: ' + JSON.stringify([x.box, b[0].box]));
        if (x.e && x.e.length) fails.push('button: errors ' + x.e.join(' | '));
    });
    // Crop the bottom of each GPS screenshot to the score box (the screenshot is 2x).
    if (OUT) b.forEach((x, i) => {
        const p = path.join(OUT, 'gps-hole' + (i + 1) + '.png');
        try {
            const H = Number((/pixelHeight: (\d+)/.exec(execFileSync('sips', ['-g', 'pixelHeight', p]).toString()) || [])[1]);
            // The overlay is pinned to the bottom of the (full-page) shot: its last 300 px are the score box row.
            if (H > 300) execFileSync('sips', ['-c', '300', '780', '--cropOffset', String(H - 300), '0', p, '--out', path.join(OUT, 'gps-button-hole' + (i + 1) + '.png')], { stdio: 'ignore' });
        } catch (e) {}
    });

    // 2: the live Full Scorecard.
    r = await go({ url: fileUrl('index.html', 'game=' + CODE), db: DB(), preScript: APP + ERR, steps: [{ sleep: 2500 }, { expression: "(function(){ setViewMode('full'); return 'full'; })()" }, { sleep: 1200 },
        { expression: "JSON.stringify({ cells: [1,2,3,4,5].map(function (h) { var i = document.querySelector('.score-input[data-hole=\"' + h + '\"]'); var w = i && i.closest('.score-input-wrapper'); return w ? (w.className.match(/mark-(\\w+)/) || [,''])[1] : 'none'; }), e: window.__e })" }, ...shot('card.png')] });
    const c = J(r)[0];
    report.card = c.cells;
    f(JSON.stringify(c.cells) === JSON.stringify(['', 'eagle', 'birdie', 'bogey', 'double']), 'Full Scorecard marks: ' + JSON.stringify(c.cells));

    // 3: the Receipt.
    r = await go({ url: fileUrl('settlement.html', 'game=' + CODE), db: DB(), preScript: ERR, steps: [{ sleep: 2000 },
        { expression: "JSON.stringify({ cells: (function(){ var row = Array.prototype.find.call(document.querySelectorAll('#receipt-scorecard tr'), function (t) { return /Manny/.test(t.innerText); }); if (!row) return null; var tds = Array.prototype.filter.call(row.querySelectorAll('td'), function (td) { return !/rt-name|rt-sec/.test(td.className); }); return tds.slice(0, 5).map(function (td) { return (td.className.match(/mark-(\\w+)/) || [,''])[1]; }); })(), legend: (document.querySelector('#receipt-scorecard .receipt-legend')||{}).innerText || '', e: window.__e })" },
        { expression: "(function(){ var s = document.getElementById('receipt-scorecard'); if (s) s.scrollIntoView(); return 'scroll'; })()" }, ...shot('receipt.png')] });
    const rc = J(r)[0];
    report.receipt = rc;
    f(JSON.stringify(rc.cells) === JSON.stringify(['', 'eagle', 'birdie', 'bogey', 'double']), 'Receipt marks: ' + JSON.stringify(rc.cells));
    f(/Birdie/.test(rc.legend) && /Eagle or better/.test(rc.legend) && /Bogey/.test(rc.legend) && /Double bogey or worse/.test(rc.legend), 'Receipt legend: ' + JSON.stringify(rc.legend));

    // 4: shared.html.
    r = await go({ url: fileUrl('shared.html', 'game=' + CODE), db: DB(), preScript: ERR, steps: [{ sleep: 2000 },
        { expression: "JSON.stringify({ cells: (function(){ var row = Array.prototype.find.call(document.querySelectorAll('tr'), function (t) { return /Manny/.test(t.innerText); }); if (!row) return null; var tds = row.querySelectorAll('td'); var out = []; for (var i = 1; i <= 5; i++) { var c = tds[i] && tds[i].querySelector('.score-cell'); out.push(!c ? 'none' : c.querySelector('.circle-2') ? 'eagle' : c.querySelector('.circle-1') ? 'birdie' : (c.className.match(/mark-(\\w+)/) || [,''])[1]); } return out; })(), e: window.__e })" }, ...shot('shared.png')] });
    const sh = J(r)[0];
    report.shared = sh;
    f(JSON.stringify(sh.cells) === JSON.stringify(['', 'eagle', 'birdie', 'bogey', 'double']), 'shared.html marks: ' + JSON.stringify(sh.cells));
    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
