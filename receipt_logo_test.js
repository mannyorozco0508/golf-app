// ============================================================================
// THE MARK ON THE PRINTED RECEIPT (2026-09-15)
//
// The printed receipt is the one thing that leaves the app - paper, a saved
// PDF, a group chat - so buildReceiptHeader now carries the brand mark
// (logo-mark.png, the lobby's own asset). Print only: on screen the <img> is
// display:none and takes no space, so the page keeps its spacing to the pixel
// (tools/receipt-logo-check.js measures that in Chrome against a build without
// the mark); the element lives in the one header, so print needs no second
// header. Not a network fetch: the src is the bare precached file - sw.js lists
// it, sync-mobile-web.js ships it - so a receipt printed with no signal still
// carries it.
//
// WHAT THE NATIVE EXPORT GETS: nothing. native-export.js builds a text-only PDF
// (Helvetica, base-14, no image XObjects) from innerText of the export roots,
// and innerText carries no alt text. The native PDF is byte-for-byte what it
// was. Putting the mark in that PDF means an image object in the hand-rolled
// builder - its own paste, if wanted. This file states the fact so nobody
// reads the print path as proof of the native one.
//
// WHAT MINI-DOM CAN PROVE: the markup and the CSS. Geometry, print media and
// image loading are the device check's.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const stripComments = s => s.replace(/<!--[\s\S]*?-->|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str !== undefined ? str : '');
const PAGE = read('settlement.html');
const code = stripComments(PAGE);
const IMG = '<img class="receipt-mark" src="logo-mark.png" alt="Rattle Golf" width="64" height="64">';

describe('THE MARKUP: one header, the mark first in it, adjacent to the opening tag', () => {
    test('buildReceiptHeader emits the mark once, as the precached file, with alt text', () => {
        const at = code.indexOf('function buildReceiptHeader()');
        const fn = code.slice(at, code.indexOf('\n    function ', at + 30));
        assert.ok(fn.length > 800, 'the builder was sliced: ' + fn.length);
        assert.ok(fn.includes('<div class="receipt-head" id="receipt-export-head">' + IMG + '\n'), 'the mark sits against the opening tag so the tag-stripped text does not change');
        assert.equal((code.match(/receipt-mark/g) || []).length, 3, 'one in the builder, one screen rule, one print rule');
    });
    test('it is the lobby\'s asset - admin.html shows the same file - and nothing else on the page names an image', () => {
        assert.match(read('admin.html'), /<img src="logo-mark\.png" alt="Rattle Golf"/);
        assert.equal((code.match(/<img /g) || []).length, 1, 'the receipt has exactly one image');
    });
    test('a rendered header carries the tag, and its tag-stripped text is unchanged by it', () => {
        const sb = loadHtmlInlineScript('settlement.html', ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js', 'pool-engine.js']);
        vm.runInContext("currentMode='ABCD'; currentData={ courseName: 'Caledonia', gameFormat: 'stroke', players: [{id:101,name:'A'}] };", sb);
        const html = String(vm.runInContext('buildReceiptHeader()', sb));
        assert.ok(html.startsWith('<div class="receipt-head" id="receipt-export-head">' + IMG), html.slice(0, 160));
        const strip = h => h.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ').trim();
        assert.equal(strip(html), strip(html.replace(IMG, '')), 'an image contributes no text');
    });
});

describe('THE CSS: hidden on screen, 64 px and centred in print', () => {
    const printAt = PAGE.indexOf('@media print {');
    const screenCss = PAGE.slice(0, printAt), printCss = PAGE.slice(printAt);
    test('screen: display none, declared outside the print block', () => {
        assert.match(screenCss, /\.receipt-mark \{ display: none; \}/);
    });
    test('print: display block, 64 x 64, centred with 6 px under it, declared inside the print block', () => {
        assert.ok(printAt > 0, 'the print block exists');
        assert.match(printCss, /\.receipt-mark \{ display: block; width: 64px; height: 64px; margin: 0 auto 6px auto; \}/);
        assert.ok(!/\.receipt-mark \{ display: none/.test(printCss), 'the hide rule is not in the print block');
    });
});

describe('THE ASSET: precached, shipped natively, sharp at print resolution', () => {
    test('src is a bare relative path - no scheme, no host - and that file is in the sw.js precache and the native bundle', () => {
        const m = /<img class="receipt-mark" src="([^"]+)"/.exec(code);
        assert.ok(m, 'the mark is in the source');
        assert.equal(m[1], 'logo-mark.png');
        assert.ok(!/^[a-z]+:|^\/\//i.test(m[1]), 'not a network URL');
        assert.ok(read('sw.js').includes("'./logo-mark.png'"), 'precached');
        assert.ok(read('sync-mobile-web.js').includes("'logo-mark.png'"), 'in the native bundle');
        assert.ok(fs.existsSync(path.join(REPO_ROOT, 'logo-mark.png')));
    });
    test('the PNG is at least 300 dpi worth of the printed size: 64 CSS px x 300/96 = 200 px needed, 256 present, and it has alpha (no cream field on white paper)', () => {
        const buf = fs.readFileSync(path.join(REPO_ROOT, 'logo-mark.png'));
        const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
        const [, css] = /\.receipt-mark \{ display: block; width: (\d+)px/.exec(PAGE);
        const needed = Math.ceil(Number(css) * 300 / 96);
        assert.ok(w >= needed && h >= needed, `${w}x${h} is below the ${needed} px that 300 dpi needs at ${css} CSS px`);
        assert.equal(buf[25], 6, 'RGBA - the icon-512 alternative carries an opaque cream field');
    });
});

describe('THE NATIVE EXPORT: since v153 it carries the mark too - from this same element', () => {
    // Re-pinned 2026-09-15 (the mark, v153): v150 stated the native PDF was text
    // only and got nothing from the print-only <img>. native-export.js now reads
    // that very element (img.receipt-mark, already decoded) and embeds it as a
    // JPEG image object - native_pdf_mark_test.js and tools/native-pdf-mark-
    // check.js hold that. What this row guards now: the mark it reads IS this
    // page's element, and the text lines are still innerText-derived.
    test('native-export.js reads innerText, writes Helvetica text, and takes its image from img.receipt-mark', () => {
        const ne = stripComments(read('native-export.js'));
        assert.match(ne, /clone\.innerText/);
        assert.match(ne, /BaseFont \/Helvetica/);
        assert.match(ne, /root\.querySelector\('img\.receipt-mark'\)/, 'the same element this page carries');
        assert.match(ne, /\/Filter \/DCTDecode/);
    });
    test('the export roots are read by id, and the header is one of them - so the mark is inside what the exporter is handed', () => {
        assert.match(code, /const roots = \['receipt-export-head', 'settle-content', 'money-pool-section',\s*'combined-settlement-summary', 'receipt-scorecard'\]/);
    });
    test('the device check exists and says what it measures', () => {
        const t = read('tools/receipt-logo-check.js');
        assert.match(t, /Emulation\.setEmulatedMedia|media: 'print'/);
        assert.match(t, /exportHasRattle/);
        assert.match(t, /display:none/);
    });
});
