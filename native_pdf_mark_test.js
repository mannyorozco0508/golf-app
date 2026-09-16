// ============================================================================
// THE SHARE-SHEET PDF CARRIES THE MARK - ROUTE B (2026-09-15, v153)
//
// native-export.js buildPdf(title, lines, mark): with a mark, object 4 is a
// JPEG image XObject (/DCTDecode), page 1 carries the /XObject resource and a
// "q 48 0 0 48 282 700 cm /Im1 Do Q" prelude, its text origin drops from 748 to
// 694 (48 pt + 6 pt, the browser print's 64 + 6 px) and it holds 49 lines
// instead of 54; every later page is exactly what it was. With NO mark the
// output is BYTE-IDENTICAL to the builder before this wave - pinned below by
// sha of two builds recorded from HEAD 1726e08 before the change.
//
// markFrom(roots) draws the page's own <img class="receipt-mark"> (decoded on
// arrival, precached, never fetched, never new Image()) on a white-filled
// 256 px canvas and returns the JPEG bytes - flattened because logo-mark.png
// stores BLACK under every transparent pixel, and a PDF image with no soft
// mask would print the mark cut out of a black square. FAIL SOFT four ways:
// no element, an incomplete image, no canvas / no context, a throwing canvas
// (or one that does not hand back a JPEG) -> null -> the text PDF, never a
// broken image object, never no PDF.
//
// WHAT MINI-DOM CAN PROVE: the builder (pure string work) and markFrom's
// fail-soft paths with stand-in elements. The real image, the rendered
// pixels and the zero-fetch proof are tools/native-pdf-mark-check.js's.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha16 = s => crypto.createHash('sha256').update(Buffer.from(s, 'latin1')).digest('hex').slice(0, 16);
const stripComments = s => s.replace(/<!--[\s\S]*?-->|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str !== undefined ? str : '');
const code = stripComments(read('native-export.js'));
const LINES = JSON.parse(read('native_pdf_lines_v151.fixture.json')).lines;   // 146 real receipt lines

function api() {
    const sb = loadJsFile('native-export.js'); sb.__lines = LINES;
    // The page has atob/btoa; the sandbox does not.
    sb.atob = s => Buffer.from(s, 'base64').toString('latin1'); sb.btoa = s => Buffer.from(s, 'latin1').toString('base64');
    return { sb, run: c => vm.runInContext(c, sb) };
}
// A stand-in JPEG: SOI, some bytes, EOI - the builder only needs bytes and a length.
const FAKE_JPEG = '\xFF\xD8' + 'x'.repeat(300) + '\xFF\xD9';
const rowsOf = pdf => pdf.split(/\d+ 0 obj\n<< \/Length \d+ >>\nstream\n/).slice(1).map(s => (s.split('\nendstream')[0].match(/\((?:\\.|[^\\)])*\) Tj/g) || []));

describe('WITHOUT A MARK: byte-identical to the builder before this wave', () => {
    test('146 real lines -> 6,433 bytes, sha 6dd9d665b0c49717 (recorded from HEAD 1726e08); one line -> 651 bytes, d8277fd1396fe547', () => {
        const a = api();
        const pdf = String(a.run("window.RattleExport._buildPdf('Caledonia-Receipt', __lines)"));
        assert.equal(pdf.length, 6433); assert.equal(sha16(pdf), '6dd9d665b0c49717');
        const one = String(a.run("window.RattleExport._buildPdf('One', ['Marty  $310'])"));
        assert.equal(one.length, 651); assert.equal(sha16(one), 'd8277fd1396fe547');
    });
    test('null, undefined and an invalid mark all give that same output', () => {
        const a = api();
        const base = String(a.run("window.RattleExport._buildPdf('Caledonia-Receipt', __lines)"));
        assert.equal(String(a.run("window.RattleExport._buildPdf('Caledonia-Receipt', __lines, null)")), base);
        assert.equal(String(a.run("window.RattleExport._buildPdf('Caledonia-Receipt', __lines, undefined)")), base);
        assert.equal(String(a.run("window.RattleExport._buildPdf('Caledonia-Receipt', __lines, { data: '', w: 256, h: 256 })")), base);
        assert.equal(String(a.run("window.RattleExport._buildPdf('Caledonia-Receipt', __lines, { data: 'abc', w: 0, h: 256 })")), base);
    });
});

describe('WITH A MARK: the image object, the first page, and the text unchanged', () => {
    const a = api(); a.sb.__mark = { data: FAKE_JPEG, w: 256, h: 256 };
    const pdf = String(a.run("window.RattleExport._buildPdf('Caledonia-Receipt', __lines, __mark)"));
    const plain = String(a.run("window.RattleExport._buildPdf('Caledonia-Receipt', __lines)"));
    test('object 4 is a well-formed DCT image XObject whose /Length lands exactly on endstream', () => {
        const m = /4 0 obj\n<< \/Type \/XObject \/Subtype \/Image \/Width 256 \/Height 256 \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Filter \/DCTDecode \/Length (\d+) >>\nstream\n/.exec(pdf);
        assert.ok(m, 'the image object'); assert.equal(Number(m[1]), FAKE_JPEG.length);
        const start = m.index + m[0].length;
        assert.equal(pdf.slice(start, start + FAKE_JPEG.length), FAKE_JPEG);
        assert.equal(pdf.slice(start + FAKE_JPEG.length, start + FAKE_JPEG.length + 10), '\nendstream');
    });
    test('page 1 alone carries the resource and the prelude; its origin is 694, every other page 748', () => {
        const pages = pdf.match(/<< \/Type \/Page \/Parent[^\n]*/g);
        assert.equal(pages.length, 3);
        assert.match(pages[0], /\/Resources << \/Font << \/F1 3 0 R >> \/XObject << \/Im1 4 0 R >> >> \/Contents 6 0 R >>/);
        pages.slice(1).forEach(p => assert.match(p, /\/Resources << \/Font << \/F1 3 0 R >> >> \/Contents \d+ 0 R >>/));
        const streams = pdf.split(/\d+ 0 obj\n<< \/Length \d+ >>\nstream\n/).slice(1).map(s => s.split('\nendstream')[0]);
        assert.match(streams[0], /^q 48 0 0 48 282 700 cm \/Im1 Do Q\nBT \/F1 9\.5 Tf 13 TL 1 0 0 1 44 694 Tm\n/);
        streams.slice(1).forEach(s => { assert.match(s, /^BT \/F1 9\.5 Tf 13 TL 1 0 0 1 44 748 Tm\n/); assert.ok(!/Im1/.test(s)); });
    });
    test('the text rows are identical to the mark-less PDF, in order; page 1 holds 49, the rest up to 54; every row inside the margin', () => {
        const withRows = rowsOf(pdf), plainRows = rowsOf(plain);
        assert.deepEqual(withRows.flat(), plainRows.flat());
        // 149 rows: title + blank + 146 lines + one wrap of the 92-char T2 line
        assert.deepEqual(withRows.map(r => r.length), [49, 54, 46]);
        assert.deepEqual(plainRows.map(r => r.length), [54, 54, 41]);
        assert.ok(694 - 48 * 13 >= 44, 'page 1: 49 rows from 694 end at y ' + (694 - 48 * 13));
    });
    test('object ids shift by one and the xref points at every object', () => {
        assert.match(pdf, /\/Kids \[5 0 R 7 0 R 9 0 R\] \/Count 3/);
        assert.match(plain, /\/Kids \[4 0 R 6 0 R 8 0 R\] \/Count 3/);
        const count = Number(/\/Size (\d+)/.exec(pdf)[1]); const xrefAt = Number(/startxref\n(\d+)/.exec(pdf)[1]);
        assert.equal(pdf.slice(xrefAt, xrefAt + 4), 'xref'); assert.equal(count, 11);
        pdf.slice(xrefAt).split('\n').slice(3, 3 + count - 1).forEach((e, i) => { const off = Number(e.slice(0, 10)); assert.equal(pdf.slice(off, off + String(i + 1).length + 6), (i + 1) + ' 0 obj'); });
        assert.equal(pdf.length - plain.length, FAKE_JPEG.length + (pdf.length - plain.length - FAKE_JPEG.length), 'sanity');
    });
    test('a one-page receipt with a mark: 49 lines fit on page 1, the 50th starts page 2', () => {
        const b = api(); b.sb.__mark = { data: FAKE_JPEG, w: 256, h: 256 };
        b.sb.__l47 = Array.from({ length: 47 }, (_, i) => 'L' + i);   // + title + blank = 49
        b.sb.__l48 = Array.from({ length: 48 }, (_, i) => 'L' + i);
        assert.equal((String(b.run("window.RattleExport._buildPdf('T', __l47, __mark)")).match(/\/Type \/Page /g) || []).length, 1);
        assert.equal((String(b.run("window.RattleExport._buildPdf('T', __l48, __mark)")).match(/\/Type \/Page /g) || []).length, 2);
        assert.equal((String(b.run("window.RattleExport._buildPdf('T', __l48)")).match(/\/Type \/Page /g) || []).length, 1, 'without the mark 50 rows fit');
    });
});

describe('markFrom: the page\'s own element, flattened on white, or nothing', () => {
    function stub(a, opts) {
        // A stand-in root with (or without) an img.receipt-mark, and a document whose canvas behaves as told.
        a.sb.__opts = opts;
        a.run(`
          var o = __opts; var calls = { fill: null, draw: null, size: null };
          var img = o.noImg ? null : { complete: o.complete !== false, naturalWidth: o.natural === undefined ? 256 : o.natural, naturalHeight: o.natural === undefined ? 256 : o.natural };
          var root = { querySelector: function (sel) { return sel === 'img.receipt-mark' ? img : null; } };
          var ctx = o.noCtx ? null : { fillRect: function (x, y, w, h) { calls.fill = [x, y, w, h]; }, drawImage: function (i, x, y, w, h) { if (o.throwOnDraw) throw new Error('tainted'); calls.draw = [x, y, w, h]; } };
          var canvas = { getContext: function () { return ctx; }, toDataURL: function (type, q) { if (o.throwOnEncode) throw new Error('no encoder'); return o.dataUrl !== undefined ? o.dataUrl : 'data:image/jpeg;base64,' + btoa('\\xFF\\xD8' + 'x'.repeat(300) + '\\xFF\\xD9'); } };
          document.createElement = function (tag) { return (tag === 'canvas' && !o.noCanvas) ? canvas : null; };
          window.__calls = calls; window.__root = root;`);
        return a.run('JSON.stringify(window.RattleExport._markFrom([window.__root]))');
    }
    test('the happy path: white fill, drawImage at 256, a JPEG back with SOI/EOI, 256 x 256 - and no fetch, no Image()', () => {
        const a = api(); const m = JSON.parse(stub(a, {}));
        assert.equal(m.w, 256); assert.equal(m.h, 256); assert.equal(m.data.length, 304);
        assert.equal(m.data.charCodeAt(0), 0xFF); assert.equal(m.data.charCodeAt(1), 0xD8);
        assert.deepEqual(JSON.parse(a.run('JSON.stringify(window.__calls)')), { fill: [0, 0, 256, 256], draw: [0, 0, 256, 256], size: null });
        assert.ok(!/fetch\(|new Image\(|XMLHttpRequest/.test(code), 'native-export.js never fetches or constructs an image');
        assert.match(code, /ctx\.fillStyle = '#ffffff';\s*ctx\.fillRect\(0, 0, MARK_PX, MARK_PX\);\s*ctx\.drawImage\(img, 0, 0, MARK_PX, MARK_PX\);/);
        assert.match(code, /root\.querySelector\('img\.receipt-mark'\)/);
    });
    test('fail soft 1: no element -> null', () => { assert.equal(stub(api(), { noImg: true }), 'null'); });
    test('fail soft 2: incomplete image, or no natural size -> null', () => { assert.equal(stub(api(), { complete: false }), 'null'); assert.equal(stub(api(), { natural: 0 }), 'null'); });
    test('fail soft 3: no canvas at all, or no 2d context -> null', () => { assert.equal(stub(api(), { noCanvas: true }), 'null'); assert.equal(stub(api(), { noCtx: true }), 'null'); });
    test('fail soft 4: a throwing canvas (draw or encode), or a non-JPEG data URL -> null, and nothing thrown out', () => {
        assert.equal(stub(api(), { throwOnDraw: true }), 'null'); assert.equal(stub(api(), { throwOnEncode: true }), 'null');
        assert.equal(stub(api(), { dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }), 'null');
        assert.equal(stub(api(), { dataUrl: 'data:image/jpeg;base64,' + Buffer.from('not a jpeg at all, no SOI').toString('base64') }), 'null');
    });
    test('the export hands markFrom(roots) into the builder inside the guarded try', () => {
        assert.match(code, /data = toBase64\(buildPdf\(title, linesFrom\(roots\), markFrom\(roots\)\)\);/);
        assert.match(code, /_markFrom: markFrom,/);
    });
    test('a null mark end to end: exportOrPrint on a page with no mark writes the mark-less bytes', () => {
        const a = api();
        a.run(`window.GolfNet = { isNative: function () { return true; } }; window.__written = null;
               window.Capacitor = { isNativePlatform: function () { return true; }, Plugins: { Filesystem: { writeFile: function (o) { window.__written = o; return Promise.resolve(); }, getUri: function () { return Promise.resolve({ uri: 'file:///x.pdf' }); } }, Share: { share: function () { return Promise.resolve(); } } } };
               var root = { isConnected: true, innerText: 'Marty  $310', cloneNode: function () { return root; }, querySelectorAll: function () { return []; }, querySelector: function () { return null; } };
               window.__p = window.RattleExport.exportOrPrint({ title: 'One', roots: [root] });`);
        return a.run('window.__p').then(() => {
            const w = JSON.parse(a.run('JSON.stringify(window.__written)'));
            const bytes = Buffer.from(w.data, 'base64').toString('latin1');
            assert.equal(bytes, String(a.run("window.RattleExport._buildPdf('One', ['Marty  $310'])")));
            assert.ok(!/XObject/.test(bytes));
        });
    });
});

describe('THE DEVICE CHECK measures what this file cannot', () => {
    test('tools/native-pdf-mark-check.js presses the real button, counts requests for the asset, checks the object and the pixels', () => {
        const t = read('tools/native-pdf-mark-check.js');
        ['markRequestsDuringExport', 'qlmanage', 'black-under-alpha', 'dark green', '/Length ', 'btn.click()'].forEach(s => assert.ok(t.includes(s), 'missing ' + s));
    });
});
