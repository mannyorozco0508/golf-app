#!/usr/bin/env node
// ============================================================================
// THE PUBLIC SKINS TAB, LAYOUT B, IN A REAL BROWSER (Manny's pick 2026-11-19).
//
// Cold arrival (tools/lib/cold-arrival.js): the Firebase bundles blocked, the record handed in, the page's own init,
// listener and render. A golfer (no sign-in) at 390 px. The only inputs are real taps by selector: the Leaderboard
// tab, the Skins sub-tab, then "Hole by hole ›". No page function is called. Text is innerText of #lb-skins-panel.
// What mini-dom cannot prove and this does: the filters and the table are laid out, and nothing in the panel runs
// past the 390 px viewport (every descendant's getBoundingClientRect().right <= 390, and no page-wide scroll).
// The record: helpers/prize-fixtures.js starkey(), created after 2026-11-19 16:00 UTC (carryover off), $20 a skin.
//   node tools/skins-tab-b-check.js [--shots <dir>]      exit 0 every check passed, 1 a check failed, 2 no browser
// ============================================================================
'use strict';
const path = require('path');
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const F = require('../helpers/prize-fixtures.js');

const rec = F.starkey({ createdAt: Date.UTC(2026, 10, 19, 17, 0, 0), prizeSettings: { perSkin: 20 } });
const db = { '.info': { connected: true }, tournaments: { STK: rec }, contestEntries: {}, events: {}, trips: {}, global_courses: {} };
const READ = { expression: `JSON.stringify((function () { var p = document.getElementById('lb-skins-panel'); var b = p.getBoundingClientRect();
  var over = [].slice.call(p.querySelectorAll('*')).filter(function (e) { var r = e.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 0.5; })
    .map(function (e) { return (e.id || e.className || e.tagName) + ':' + Math.round(e.getBoundingClientRect().right); });
  return { text: p.innerText, w: Math.round(b.width), h: Math.round(b.height), vw: window.innerWidth, scrollW: document.documentElement.scrollWidth, over: over }; })())` };
const shotsAt = (() => { const i = process.argv.indexOf('--shots'); return i > -1 ? process.argv[i + 1] : null; })();
const TOP = { expression: `document.getElementById('lb-subtabs').scrollIntoView(); 1` };

(async () => {
    const results = [];
    const check = (name, ok, detail) => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '\n     ' + String(detail || '').slice(0, 600))); };
    const run = await arriveCold({ url: fileUrl('tournament.html', 'tourney=STK'), db, settleMs: 2500, viewport: { width: 390, height: 844 },
        steps: [{ tap: '#tab-btn-leaderboard' }, { sleep: 400 }, { tap: '#lb-sub-skins' }, { sleep: 400 }, READ]
            .concat(shotsAt ? [TOP, { shot: path.join(shotsAt, 'skins-B-built-default.png'), viewportOnly: true }] : [])
            .concat([{ tap: '#lb-skins-holes' }, { sleep: 400 }, READ])
            .concat(shotsAt ? [TOP, { shot: path.join(shotsAt, 'skins-B-built-holes-open.png'), viewportOnly: true }] : []) });
    if (!run.ok) { console.log('NO BROWSER RUN: ' + run.reason); process.exit(2); }
    const reads = run.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
    const [a, b] = reads;
    console.log('--- default innerText ---\n' + a.text + '\n--- open innerText ---\n' + b.text + '\n---');
    check('the tab is laid out (non-zero box)', a.w > 300 && a.h > 150, JSON.stringify({ w: a.w, h: a.h }));
    check('default: header, Cascade first, Most skins with ranks and amounts', /Skins · Gross · No carryover · 6 won · \$20 credit a skin/.test(a.text)
        && /T1\s+Ana Diaz\s+1\s+\$20 credit/.test(a.text) && /Hole by hole ›\s*3 won · 15 tied/.test(a.text), a.text);
    check('default: the hole rows are collapsed', !/Tied · no skin/.test(a.text), a.text);
    check('Hole by hole opened by a real tap shows the rows', /Tied · no skin: holes 1–3, 5–8, 10–14, 16–18/.test(b.text) && /Skins total/.test(b.text), b.text);
    [['default', a], ['open', b]].forEach(([n, r]) => check(`${n}: nothing runs past ${r.vw} px`, r.vw === 390 && r.scrollW <= 390 && !r.over.length, JSON.stringify({ scrollW: r.scrollW, over: r.over })));
    const fails = results.filter((x) => !x).length;
    console.log('\n' + (results.length - fails) + ' / ' + results.length + ' PASS');
    process.exit(fails ? 1 : 0);
})();
