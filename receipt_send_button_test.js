// ============================================================================
// SEND RESULTS - THE RECEIPT'S ONE BUTTON MOVES TO THE TITLE ROW AND SAYS SEND
//
// settlement.html's export control was "📄 Print / Save Receipt", a full-width
// .btn-primary rendered as the second child of #combined-settlement-summary
// (v152: one button, not two). In the native app it opens the iOS share sheet -
// Messages, Mail, AirDrop - and that is what people do with it. Nobody prints.
//
// THE WAVE (2026-09-16), presentation only, no engine:
//   - the button renders into #receipt-actions, the right-hand cell of a new
//     .title-row grid that holds #main-title; the title keeps its centre and its
//     vertical position (the grid is 1fr auto 1fr, the h2's margin moved to the row)
//   - it is a small pill (.receipt-send), font-size half the title's, not the
//     full-width .btn-primary
//   - it says "📤 Send"
//   - it is STILL absent while the round is live (v149), still ONE button (v152),
//     still calls printReceipt(), whose roots list is unchanged and never
//     includes the button
//
// HOW "NOTHING ELSE CHANGED" IS HELD. receipt_send_prev.fixture.json is the
// tag-stripped text of every mount on the Results screen at 54a15f2, for a
// finished round and a live one. Today's screen must equal it with EXACTLY one
// substitution: the button's token leaves the summary mount and the new label
// appears in the actions mount. The live capture must be identical, actions
// mount included (empty).
//
// WHAT MINI-DOM CANNOT PROVE: the pill's rect, the font sizes, "level with the
// title on the right". tools/receipt-send-check.js measures those in Chrome.
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');
const { decodeEscapes } = require('./helpers/decode-escapes.js');

const PAGE = 'settlement.html';
const FIXTURE = 'receipt_send_prev.fixture.json';
const FIXTURE_SHA = '3b7289b0';
// The button's token as the capture holds it. Removing it leaves the summary's
// two neighbouring cells as '| | |' - the same two bars the cell sat between.
const OLD_TOKEN = '|📄 Print / Save Receipt|';
const OLD_TOKEN_GONE = '|';
const LABEL = '📤 Send';   // shortened from "Send Results" the same day: on a 390px phone the longer pill made the title wrap

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha8 = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO_ROOT, f))).digest('hex').slice(0, 8);
const DEPS = ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js', 'pool-engine.js'];
const strip0 = h => h.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ').trim();
const TODAY = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const norm = t => t.split('|' + TODAY + '|').join('|<today>|');

const CD = makeCourseData(18);
const P4 = makePlayers(['Ann A', 'Ben B', 'Cal C', 'Dee D'], [0, 0, 0, 0], 101);
function round(thru) {
    const scores = {};
    P4.forEach((p, i) => CD.forEach(h => { if (h.hole <= thru) scores['p' + p.id + '_h' + h.hole] = h.par + ((i === 0 && h.hole % 3 === 0) ? -1 : 0); }));
    return { eventName: 'Weekend Round', players: P4, courseData: CD, scores, gameFormat: 'stroke', settlementMode: 'whole-dollar',
        sideMatches: { m: { format: 'match', scoring: 'gross', stake: 25, startHole: 1, createdAt: 1, teamAIds: ['101', '103'], teamBIds: ['102', '104'] } } };
}
// The page's own render sequence, as the snapshot handler runs it.
function arrive(d) {
    const sb = loadHtmlInlineScript(PAGE, DEPS);
    vm.runInContext(`currentMode='ABCD'; currentData=${JSON.stringify(d)};
        renderMoneyPoolSection(currentData, currentData.courseData, currentData.scores);
        renderCombinedSummary(currentData, currentData.courseData, currentData.scores);
        renderSettlement(currentData); renderReceiptScorecard();`, sb);
    return sb;
}
const raw = (sb, id) => { const el = sb.document.getElementById(id); return el ? el.innerHTML : ''; };
const mounts = sb => ({
    pool: norm(strip0(raw(sb, 'money-pool-section'))), summary: norm(strip0(raw(sb, 'combined-settlement-summary'))),
    settle: norm(strip0(raw(sb, 'settle-content'))), scorecard: norm(strip0(raw(sb, 'receipt-scorecard'))), actions: norm(strip0(raw(sb, 'receipt-actions')))
});
const buttonsIn = html => (html.match(/onclick="printReceipt\(\)"/g) || []).length;

describe('THE BASELINE, and today differs from it by exactly the move and the label', () => {
    const prev = JSON.parse(read(FIXTURE));
    test('the fixture is the one captured at 54a15f2', () => {
        assert.equal(sha8(FIXTURE), FIXTURE_SHA);
        assert.ok(prev.finished.summary.includes(OLD_TOKEN), 'the capture carries the old button where it was');
        assert.equal(prev.finished.actions, '', 'no actions mount existed at capture');
        assert.equal(prev.live.actions, '');
        assert.ok(!prev.live.summary.includes('Print / Save'), 'the live capture never had a button');
    });
    test('finished: every mount equals the capture, except the button token has left the summary and the label sits in actions', () => {
        const today = mounts(arrive(round(18)));
        const expected = Object.assign({}, prev.finished, {
            summary: prev.finished.summary.replace(OLD_TOKEN, OLD_TOKEN_GONE),
            actions: '|' + LABEL + '|'
        });
        assert.equal(prev.finished.summary.split(OLD_TOKEN).length - 1, 1, 'the old token occurs once in the capture');
        assert.deepEqual(today, expected);
    });
    test('live: every mount identical to the capture, actions included (empty) - the button stays away mid-round', () => {
        assert.deepEqual(mounts(arrive(round(9))), prev.live);
    });
});

describe('THE BUTTON on the title row, right side, finished only, once', () => {
    test('markup: #main-title and #receipt-actions are the two cells of .title-row, title first', () => {
        const src = read(PAGE);
        const row = /<div class="title-row" id="title-row">\s*<h2 class="event-title" id="main-title">[^<]*<\/h2>\s*<div id="receipt-actions" class="receipt-actions"><\/div>\s*<\/div>/.exec(src);
        assert.ok(row, 'the title row is not title-then-actions');
        assert.equal((src.match(/id="receipt-actions"/g) || []).length, 1);
    });
    test('finished: one button, in #receipt-actions, none inside the summary, the small pill class and the label', () => {
        const sb = arrive(round(18));
        const actions = raw(sb, 'receipt-actions');
        assert.equal(buttonsIn(actions), 1, 'exactly one export button in the actions mount');
        assert.equal(buttonsIn(raw(sb, 'combined-settlement-summary')), 0, 'the summary no longer carries it (v152: one button, not two)');
        assert.equal(buttonsIn(raw(sb, 'settle-content')) + buttonsIn(raw(sb, 'money-pool-section')) + buttonsIn(raw(sb, 'receipt-scorecard')), 0);
        assert.match(actions, /<button class="receipt-send" onclick="printReceipt\(\)">/, 'the pill class, not .btn-primary');
        assert.ok(!/btn-primary/.test(actions), 'not the full-width primary treatment');
        assert.equal(strip0(decodeEscapes(actions)), '|' + LABEL + '|');
    });
    test('live: the actions mount is empty, and so is every other mount of a button', () => {
        const sb = arrive(round(9));
        assert.equal(raw(sb, 'receipt-actions'), '');
        assert.equal(buttonsIn(raw(sb, 'combined-settlement-summary')), 0);
    });
    test('a round that goes back to live after being finished clears the mount (no stale button)', () => {
        const sb = arrive(round(18));
        assert.equal(buttonsIn(raw(sb, 'receipt-actions')), 1);
        vm.runInContext(`currentData=${JSON.stringify(round(9))}; renderCombinedSummary(currentData, currentData.courseData, currentData.scores);`, sb);
        assert.equal(raw(sb, 'receipt-actions'), '');
    });
    test('the label is written once in the page source, decoded, and the old label is gone', () => {
        const src = decodeEscapes(read(PAGE)).replace(/\/\/[^\n]*/g, '').replace(/<!--[\s\S]*?-->/g, '');
        assert.equal((src.match(/📤 Send<\/button>/g) || []).length, 1, 'one label, in one place');
        assert.equal((src.match(/Send Results/g) || []).length, 0, 'the wide label is gone');
        assert.equal((src.match(/Print \/ Save Receipt/g) || []).length, 0, 'the old label is gone from code (comments may still tell the history)');
    });
});

describe('THE SIZE, as far as the stylesheet says it', () => {
    const style = read(PAGE).slice(read(PAGE).indexOf('<style>'), read(PAGE).indexOf('</style>'));
    test('the title is 1.4rem and the pill is 0.7rem - half', () => {
        assert.match(style, /\.event-title \{[^}]*font-size: 1\.4rem/);
        const pill = /\.receipt-send \{[^}]*\}/.exec(style);
        assert.ok(pill, 'no .receipt-send rule');
        assert.match(pill[0], /font-size: 0\.7rem/);
        assert.ok(!/width: 100%/.test(pill[0]), 'the pill must not be full width');
    });
    test('the row is a 1fr auto 1fr grid with the title in the middle and the actions at the right end', () => {
        assert.match(style, /\.title-row \{[^}]*grid-template-columns: 1fr auto 1fr/);
        assert.match(style, /\.title-row \.event-title \{[^}]*grid-column: 2/);
        assert.match(style, /\.title-row \.receipt-actions \{[^}]*grid-column: 3[^}]*justify-self: end/);
    });
    test('on phones the pill drops under the title: a measured breakpoint, one column below it, and an empty mount takes no row', () => {
        // Option 3 (2026-09-16). 282px of title + 2 x (67px pill + 8px gap) = 432px of
        // content = a 488px viewport is where the title is still centred beside the
        // pill; from 487px down the row is one column. tools/receipt-send-check.js
        // measures both sides of that edge; this pins the rule that makes it so.
        const m = /@media \(max-width: 487px\) \{([\s\S]*?)\n        \}/.exec(style);
        assert.ok(m, 'no @media (max-width: 487px) block for the title row');
        assert.match(m[1], /\.title-row \{ grid-template-columns: 1fr;/, 'one column on phones');
        assert.match(m[1], /\.title-row \.event-title \{ grid-column: 1; \}/, 'the title takes the column');
        assert.match(m[1], /\.title-row \.receipt-actions \{ grid-column: 1; justify-self: end; \}/, 'the pill beneath it, right-aligned');
        assert.match(style, /\.title-row \.receipt-actions:empty \{ display: none; \}/, 'an empty mount (live round) must take no row and no gap');
    });

    test('the pill is hidden in print, like the button before it', () => {
        const print = style.slice(style.indexOf('@media print'));
        assert.match(print, /\.receipt-actions[^{]*\{ display: none !important; \}|\.receipt-actions,[\s\S]{0,200}display: none !important/);
    });
});

describe('BOTH EXPORT PATHS fire from the new position, with the same roots', () => {
    function pressed(native) {
        const sb = arrive(round(18));
        const printed = [];
        sb.window.print = () => printed.push(true);
        if (native) sb.window.GolfNet = { isNative: () => true };
        let captured = null;
        const real = sb.window.RattleExport;
        sb.window.RattleExport = { exportOrPrint: o => { captured = o; return real ? real.exportOrPrint(o) : true; } };
        // The button's own onclick, from the rendered markup.
        const m = /<button class="receipt-send" onclick="([^"]+)">/.exec(raw(sb, 'receipt-actions'));
        assert.ok(m, 'no button to press');
        vm.runInContext(m[1], sb);
        return { sb, printed, captured };
    }
    // WHAT THESE TWO PROVE, AND WHAT THEY CANNOT. The pill's onclick reaches
    // printReceipt(), printReceipt() reaches RattleExport.exportOrPrint with a
    // title and a roots array, and the browser path ends in window.print() while
    // the native path does not. The roots' CONTENT cannot be read here: mini-dom
    // parses no innerHTML, so every root's innerText is empty and printReceipt's
    // own emptiness filter drops them all (measured: [] in this harness). The
    // five roots, their order, their money and the button's absence from them
    // are measured in Chrome by tools/receipt-export-check.js (rootCount,
    // exportMoney == screenMoney) and tools/native-pdf-lines-check.js.
    test('browser: the press reaches the exporter with a titled roots array, and window.print() runs', () => {
        const r = pressed(false);
        assert.ok(r.captured, 'exportOrPrint was not reached');
        assert.ok(Array.isArray(r.captured.roots));
        assert.match(String(r.captured.title), /-Receipt$/);
        assert.equal(r.printed.length, 1, 'the browser path must end in window.print()');
    });
    test('native: the same call, and window.print() is NOT called', () => {
        const r = pressed(true);
        assert.ok(r.captured);
        assert.ok(Array.isArray(r.captured.roots));
        assert.equal(r.printed.length, 0, 'native must not reach window.print()');
    });
    test('the roots list in printReceipt is unchanged: the same five ids, in the same order', () => {
        const src = read(PAGE);
        assert.ok(src.includes("const roots = ['receipt-export-head', 'settle-content', 'money-pool-section',\n                       'combined-settlement-summary', 'receipt-scorecard']"), 'the roots list moved or changed');
        assert.ok(src.includes("el.id !== 'receipt-export-head' && el.tagName !== 'BUTTON'"), 'the button filter on the summary parts stays');
        assert.ok(!/'receipt-actions'/.test(src.slice(src.indexOf('function printReceipt'), src.indexOf('function printReceipt') + 4000)), 'the actions mount is never a root');
    });
});
