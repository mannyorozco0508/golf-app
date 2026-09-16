// ============================================================================
// THE RECEIPT HEADER PRINTS ONCE (2026-09-15, v152)
//
// printReceipt's export roots named 'receipt-export-head' AND
// 'combined-settlement-summary', and the header element IS the first child of
// the summary (buildReceiptHeader() renders inside renderCombinedSummary's
// settled branch), so the shared PDF carried the course / date / format twice
// - lines 0-2 and 46-48 of the 146-line v151 receipt.
//
// THE CHANGE, settlement.html only: the first root stays (the header belongs
// at the top, and the money's order - side matches, pool, settlement - stays
// what it has always been); the summary is exported as its PARTS, minus the
// header and minus the print button. Nothing renders differently: the
// screen's four mounts are the receipt_final_prev.fixture.json baseline still
// (receipt_final_test.js, 25/25) and the browser print path never reads the
// roots at all - window.print() prints the page.
//
// PROVED IN CHROME by tools/native-pdf-lines-check.js: the real button pressed
// with the exporter's entry recorded; 143 lines == v151's 146 with 46-48
// removed; the v150 stream minus its second header == today's stream; header
// at [0] only; roots [head, settle-content, pool, three cards, scorecard].
// WHAT MINI-DOM CAN PROVE: the seams, and that the browser branch ignores roots.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha8 = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO_ROOT, f))).digest('hex').slice(0, 8);
const stripComments = s => s.replace(/<!--[\s\S]*?-->|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str !== undefined ? str : '');
const page = stripComments(read('settlement.html'));
const fn = () => { const at = page.indexOf('function printReceipt()'); return page.slice(at, page.indexOf('\n    function ', at + 30)); };

describe('THE FIXTURE: v151 carried the header twice', () => {
    const v = JSON.parse(read('native_pdf_lines_v151.fixture.json'));
    test('captured at e7d1e67 through the real button: 146 lines, header at 0-2 and 46-48, five id roots', () => {
        assert.equal(sha8('native_pdf_lines_v151.fixture.json'), '416b5b20');
        assert.equal(v.capturedAt, 'e7d1e67'); assert.equal(v.lines.length, 146);
        assert.deepEqual(v.lines.slice(0, 3), v.lines.slice(46, 49));
        assert.deepEqual(v.rootIds, ['receipt-export-head', 'settle-content', 'money-pool-section', 'combined-settlement-summary', 'receipt-scorecard']);
    });
});

describe('THE SEAMS', () => {
    test('the summary is exported as its parts, minus the header and the button; the header stays the first root; the order of the rest is unchanged', () => {
        const f = fn();
        assert.ok(f.length > 800, 'printReceipt was sliced');
        assert.match(f, /const summary = document\.getElementById\('combined-settlement-summary'\);/);
        assert.match(f, /Array\.from\(summary\.children\)\.filter\(el => el\.id !== 'receipt-export-head' && el\.tagName !== 'BUTTON'\)/);
        assert.match(f, /const roots = \['receipt-export-head', 'settle-content', 'money-pool-section',\s*'combined-settlement-summary', 'receipt-scorecard'\]/);
        assert.match(f, /\.flatMap\(el => \(el && el\.id === 'combined-settlement-summary'\) \? summaryParts : \[el\]\)/);
        assert.match(f, /\.filter\(el => el && \(el\.innerText \|\| ''\)\.trim\(\)\.length > 0\);/);
    });
    test('the header is still rendered inside the summary, first, once - the screen did not move', () => {
        const at = page.indexOf('let html = buildReceiptHeader();');
        assert.ok(at > 0, 'the settled branch opens with the header');
        assert.equal((page.match(/buildReceiptHeader\(\)/g) || []).length, 2, 'one definition, one call');
        assert.equal((page.match(/id="receipt-export-head"/g) || []).length, 1);
    });
    test('the browser print path never reads the roots: window.print() prints the page', () => {
        const ne = stripComments(read('native-export.js'));
        const at = ne.indexOf('if (!native && !bridge) {'); const browser = ne.slice(at, ne.indexOf('return Promise.resolve({ path: \'browser\' });', at));
        assert.ok(browser.length > 100 && browser.length < 1200, 'the browser branch was sliced: ' + browser.length);
        assert.match(browser, /window\.print\(\);/);
        assert.ok(!/roots|linesFrom|buildPdf/.test(browser), 'no root is read on the browser path');
    });
    test('the device check presses the real button and pins the header at line 0 only', () => {
        const t = read('tools/native-pdf-lines-check.js');
        ['Print \\\\/ Save Receipt/.test(x.innerText)', 'btn.click()', "headerAt[0] !== 0", 'V151.lines.slice(0, 46).concat(V151.lines.slice(49))', "!r.rootIds.includes('combined-settlement-summary')"].forEach(s => assert.ok(t.includes(s), 'missing ' + s));
    });
});
