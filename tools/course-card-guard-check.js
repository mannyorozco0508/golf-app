#!/usr/bin/env node
// ============================================================================
// THE TWO CARD GUARDS, ON THE PAGE A GOLFER USES (hotfix, 2026-10-07)
//
// course_card_guard_test.js holds the builder; this holds SAVE, cold, at 390px:
// open setup on a round, go back to the course step, type a course, tap its row
// in the real picker, walk forward with the wizard's own Next buttons, press
// Save & Start Round - and read what Save wrote, what it said, and the button.
// Like course-picker-search-check.js it clicks the page's elements and calls no
// page function. Two visits in one browser profile, the second with the live
// shallow probe blocked: that is how a phone holds name-only stubs (round
// ZNBLP8), and a one-visit check passes on a broken page.
//
// ARMS
//   built-in  Caledonia (a built-in with a shared stub): Save writes 18 holes.
//   no-card   Zed Links, an import whose card never loads: Save REFUSES with
//             "...has no hole card yet...", writes NOTHING to the round, and the
//             button comes back enabled with its own label.
//   resave    a round that already has its card, saved again untouched: Save
//             writes it - a round WITH holes is never stopped.
//   guard 2 alone - the same no-card and built-in arms against a copy of the page
//             with GUARD 1 switched off: Save still refuses the empty card (GUARD 2
//             is a real second wall), and Caledonia still saves (it is not a wall
//             that refuses everything).
//
//   node tools/course-card-guard-check.js   exit 0 = all held, 1 = one broke, 2 = could not run
// ============================================================================
'use strict';
const { arriveCold, fileUrl, REPO_ROOT } = require('./lib/cold-arrival.js');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const sb = {};
vm.runInNewContext(fs.readFileSync(path.join(REPO_ROOT, 'course-data.js'), 'utf8') + ';this.p=coursePresets;', sb);
const CODE = 'GUARDCHK';

function dbFor(withCard) {
    const round = { eventName: 'Saturday', courseName: 'Tri-Mountain Golf Course', activeCourseKey: 'swwa_trimountain',
        gameFormat: 'stroke', players: [{ id: 101, name: 'Dale Whitmore', hcp: '3', playingForMoney: true }], settlementMode: 'whole-dollar' };
    if (withCard) round.courseData = JSON.parse(JSON.stringify(sb.p.swwa_trimountain.data));
    return { events: { [CODE]: round }, trips: {}, tournaments: {},
        global_courses: {
            caledonia: { name: 'Caledonia Golf & Fish Club', data: JSON.parse(JSON.stringify(sb.p.caledonia.data)) },
            // An import whose card does not exist on the server: it can never load.
            gca_zzguard: { name: 'Zed Links' },
        } };
}

function drive(query, rowRe) {
    return `
(function () {
  window.__trace = [];
  var step = ${query ? 0 : 3}, tries = 0;
  var vis = function (el) { return !!(el && (el.offsetParent !== null || el.getClientRects().length > 0)); };
  var iv = setInterval(function () {
    if (++tries > 400) { window.__trace.push('TIMEOUT at ' + step); clearInterval(iv); return; }
    try {
      var input = document.getElementById('course-search-input');
      if (step === 0) {
        if (vis(input)) { window.__trace.push('picker'); step = 1; return; }
        for (var b = 7; b >= 2; b--) { var back = document.getElementById('wizard-back-' + b);
          if (vis(back) && !back.disabled) { back.click(); return; } }
        return;
      }
      if (step === 1) { input.focus(); input.value = ${JSON.stringify(query || '')}; input.dispatchEvent(new Event('input', { bubbles: true })); step = 2; return; }
      if (step === 2) {
        var row = [].slice.call(document.querySelectorAll('#course-dropdown .custom-select-option'))
          .filter(function (r) { return ${rowRe}.test((r.innerText || r.textContent || '').trim()); })[0];
        if (!row) return;
        row.click(); window.__trace.push('picked ' + (row.innerText || '').trim()); step = 3; return;
      }
      if (step === 3) {
        var save = document.getElementById('main-save-btn');
        if (vis(save) && !save.disabled) { window.__labelBefore = save.innerText; save.click(); window.__trace.push('saved'); step = 4; clearInterval(iv); return; }
        for (var n = 1; n <= 6; n++) { var nx = document.getElementById('wizard-next-' + n);
          if (vis(nx) && !nx.disabled) { nx.click(); return; } }
      }
    } catch (e) { window.__trace.push('threw ' + (e && e.message)); clearInterval(iv); }
  }, 120);
})();`;
}

const READ = `JSON.stringify({ trace: window.__trace,
  notes: [].slice.call(document.querySelectorAll('.ui-note-refuse')).map(function (n) { return (n.innerText || '').trim(); }),
  save: (function () { var b = document.getElementById('main-save-btn'); return b ? { disabled: b.disabled, label: (b.innerText || '').trim(), before: (window.__labelBefore || '').trim() } : null; })(),
  writes: (window.__coldWrites || []).filter(function (w) { return /^events\\//.test(w.path); }).map(function (w) {
    var v = (w.value && typeof w.value === 'object') ? w.value : {};
    return { path: w.path, holes: Array.isArray(v.courseData) ? v.courseData.length : ('courseData' in v ? 'empty' : null), key: v.activeCourseKey }; }) })`;

async function arm(page, { query, rowRe, withCard }) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'card-guard-'));
    try {
        const db = dbFor(withCard);
        const warm = await arriveCold({ url: fileUrl(page, 'game=' + CODE), db, viewport: { width: 390, height: 844 }, settleMs: 5000, profileDir: profile, expression: '1' });
        if (!warm.ok) return { ran: false, reason: 'warm-up: ' + warm.reason };
        const r = await arriveCold({ url: fileUrl(page, 'game=' + CODE), db, viewport: { width: 390, height: 844 },
            blockUrls: ['*firebaseio.com*'], preScript: drive(query, rowRe), settleMs: 4000, profileDir: profile,
            steps: [{ sleep: 13000 }, { expression: READ }] });
        if (!r.ok) return { ran: false, reason: r.reason };
        const out = JSON.parse(r.value[r.value.length - 1]);
        out.ran = out.trace.includes('saved');
        return out;
    } finally { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }
}

(async () => {
    const fails = [];
    const NO_CARD = /has no hole card yet\. Check your signal and pick the course again, or tick .*Review \/ Edit Course Pars & Handicaps and type the pars\./;
    const ARMS = {
        builtin: { query: 'Caledonia', rowRe: '/^Caledonia Golf/', withCard: true },
        nocard: { query: 'Zed Links', rowRe: '/^Zed Links/', withCard: true },
        resave: { query: null, rowRe: 'null', withCard: true },
    };
    const res = {};
    for (const k of Object.keys(ARMS)) res[k] = await arm('admin.html', ARMS[k]);

    // GUARD 2 ALONE: a temp copy of the page with GUARD 1's refusal replaced by the
    // old empty build. Same arms. Removed afterwards.
    const src = fs.readFileSync(path.join(REPO_ROOT, 'admin.html'), 'utf8');
    const g1 = 'return { ...out, ok: false, reason: NO_HOLE_CARD };';
    if (src.split(g1).length === 2) {
        const tmp = 'admin_guard2only_tmp.html';
        fs.writeFileSync(path.join(REPO_ROOT, tmp), src.replace(g1, 'built = globalCourses[courseKey].data || [];'));
        try {
            res.g2nocard = await arm(tmp, ARMS.nocard);
            res.g2builtin = await arm(tmp, ARMS.builtin);
        } finally { fs.rmSync(path.join(REPO_ROOT, tmp), { force: true }); }
    } else {
        // A page without GUARD 1 cannot have it switched off; that absence is
        // itself the finding, and the arms above say what it costs.
        fails.push('GUARD 1 is not in admin.html (its line was not found exactly once)');
    }

    for (const k of Object.keys(res)) if (!res[k].ran) { console.log(JSON.stringify({ ran: false, arm: k, res: res[k] }, null, 1)); process.exit(2); }
    const saved = (r, n) => r.writes.some((w) => w.holes === n);
    if (!saved(res.builtin, 18)) fails.push('built-in: Caledonia did not save 18 holes: ' + JSON.stringify(res.builtin.writes));
    [['nocard', 'GUARD 1'], ['g2nocard', 'GUARD 2 alone']].forEach(([k, who]) => {
        const r = res[k];
        if (!r) return;
        if (!r.notes.some((n) => NO_CARD.test(n))) fails.push(who + ': no refusal on screen: ' + JSON.stringify(r.notes));
        if (r.writes.length) fails.push(who + ': the round was written: ' + JSON.stringify(r.writes));
        if (!r.save || r.save.disabled || r.save.label !== r.save.before) fails.push(who + ': Save did not come back: ' + JSON.stringify(r.save));
    });
    if (!saved(res.resave, 18)) fails.push('resave: a round WITH holes was not saved: ' + JSON.stringify(res.resave));
    if (res.resave.notes.length) fails.push('resave: a round with holes was refused: ' + JSON.stringify(res.resave.notes));
    if (res.g2builtin && !saved(res.g2builtin, 18)) fails.push('GUARD 2 alone: it also stopped a round with holes - a wall that refuses everything');

    const summary = Object.fromEntries(Object.entries(res).map(([k, r]) => [k, { notes: r.notes, writes: r.writes, save: r.save }]));
    summary.fails = fails;
    console.log(JSON.stringify(summary, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
