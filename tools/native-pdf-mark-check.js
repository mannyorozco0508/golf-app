#!/usr/bin/env node
// ============================================================================
// THE SHARE-SHEET PDF CARRIES THE MARK, AND THE MARK IS RIGHT
//
// native-export.js embeds logo-mark.png in the iOS PDF as a JPEG image object,
// flattened on white from the <img class="receipt-mark"> settlement.html already
// holds (Route B, v153). Three things only a real page and a real PDF renderer
// can prove, measured here:
//
//   THE IMAGE  the real "Print / Save Receipt" button, with the exporter's
//              entry recorded, hands over roots that contain the decoded mark;
//              _markFrom returns JPEG bytes (SOI FF D8, EOI FF D9), 256 x 256,
//              read from the page's own element - the check counts network
//              requests for logo-mark.png during the export: zero.
//   THE PDF    the XObject dictionary is well-formed (/Width /Height /DCTDecode,
//              /Length == the bytes between stream and endstream), the xref
//              offsets point at "N 0 obj" for every object, page 1 carries the
//              /XObject resource and the "cm /Im1 Do" prelude and no other page
//              does; the text rows are IDENTICAL to the PDF built without the
//              mark, in order; page 1 holds 49 rows, the rest 54.
//   THE PIXELS macOS PDFKit renders the file (qlmanage); inside the mark's box
//              the corners are white (the black-under-alpha hazard) and the R's
//              stroke is the mark's own dark green; the header sits below.
//
//   node tools/native-pdf-mark-check.js
//
//   exit 0   PASS
//   exit 1   FAIL - the JSON names the measurement
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const { linkedRounds } = require('../helpers/trip-weekly-rounds.js');

const R = linkedRounds()[0].data;
const PROBE = `(function(){ var captured = null; window.RattleExport.exportOrPrint = function (o) { captured = o; return Promise.resolve({ path: 'captured' }); };
  var reqBefore = performance.getEntriesByType('resource').filter(e => /logo-mark\\.png/.test(e.name)).length;
  var btn = Array.from(document.querySelectorAll('button')).find(x => /Print \\/ Save Receipt/.test(x.innerText)); if (!btn) return JSON.stringify({ error: 'no print button' }); btn.click();
  if (!captured || !captured.roots) return JSON.stringify({ error: 'nothing captured' });
  var lines = RattleExport._linesFrom(captured.roots); var mark = RattleExport._markFrom(captured.roots);
  var withMark = RattleExport._buildPdf(captured.title, lines, mark); var without = RattleExport._buildPdf(captured.title, lines);
  var reqAfter = performance.getEntriesByType('resource').filter(e => /logo-mark\\.png/.test(e.name)).length;
  var img = document.querySelector('img.receipt-mark');
  return JSON.stringify({ lines: lines.length, mark: mark ? { bytes: mark.data.length, w: mark.w, h: mark.h, soi: mark.data.charCodeAt(0) === 0xFF && mark.data.charCodeAt(1) === 0xD8, eoi: mark.data.charCodeAt(mark.data.length - 2) === 0xFF && mark.data.charCodeAt(mark.data.length - 1) === 0xD9 } : null,
    img: img ? { complete: img.complete, natural: [img.naturalWidth, img.naturalHeight], src: img.getAttribute('src') } : null, markRequestsDuringExport: reqAfter - reqBefore,
    withMark: btoa(withMark), without: btoa(without) }); })()`;

function bail(msg) { console.log(JSON.stringify({ result: 'COULD NOT RUN', reason: msg })); process.exit(2); }
const rowsOf = pdf => pdf.split(/\d+ 0 obj\n<< \/Length \d+ >>\nstream\n/).slice(1).map(s => (s.split('\nendstream')[0].match(/\((?:\\.|[^\\)])*\) Tj/g) || []));

// A small PNG reader (8-bit RGB/RGBA, non-interlaced) for the rendered page.
function pngPixels(buf) {
    let p = 8, w, h, ct, idat = [];
    while (p < buf.length) { const len = buf.readUInt32BE(p), t = buf.toString('ascii', p + 4, p + 8); if (t === 'IHDR') { w = buf.readUInt32BE(p + 8); h = buf.readUInt32BE(p + 12); ct = buf[p + 17]; } if (t === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len)); p += 12 + len; }
    const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(w * h * bpp);
    const paeth = (a, b, c) => { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
    for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        for (let x = 0; x < stride; x++) { const a = x >= bpp ? out[y * stride + x - bpp] : 0, up = y > 0 ? out[(y - 1) * stride + x] : 0, c = (y > 0 && x >= bpp) ? out[(y - 1) * stride + x - bpp] : 0; let v = row[x];
            if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1; else if (f === 4) v += paeth(a, up, c); out[y * stride + x] = v & 255; } }
    return { w, h, bpp, px: out, at: (x, y) => { const i = (y * w + x) * bpp; return [out[i], out[i + 1], out[i + 2]]; } };
}

(async () => {
    const problems = [];
    const r = await arriveCold({ url: fileUrl('settlement.html', 'game=RA'), db: { events: { RA: R } }, expression: PROBE, settleMs: 4000 });
    if (!r.ok) bail('settlement: ' + r.reason);
    const v = JSON.parse(r.value); if (v.error) bail(v.error);
    if (!v.img) bail('no img.receipt-mark on the page - nothing to embed, nothing measured');
    const withMark = Buffer.from(v.withMark, 'base64').toString('latin1'), without = Buffer.from(v.without, 'base64').toString('latin1');

    // THE IMAGE
    if (!v.mark) problems.push('image: _markFrom returned null (img complete ' + v.img.complete + ', natural ' + v.img.natural + ')');
    else { if (!(v.mark.soi && v.mark.eoi)) problems.push('image: not a JPEG (SOI ' + v.mark.soi + ', EOI ' + v.mark.eoi + ')'); if (v.mark.w !== 256 || v.mark.h !== 256) problems.push('image: ' + v.mark.w + 'x' + v.mark.h); if (v.mark.bytes < 5000 || v.mark.bytes > 40000) problems.push('image: ' + v.mark.bytes + ' bytes is not the 10-20 KB a flattened 256 px JPEG of the mark makes'); }
    if (v.img.src !== 'logo-mark.png') problems.push('image: src is ' + v.img.src);
    if (v.markRequestsDuringExport !== 0) problems.push('image: ' + v.markRequestsDuringExport + ' request(s) for logo-mark.png during the export - it must come from the decoded element');

    // THE PDF
    const m = /4 0 obj\n<< \/Type \/XObject \/Subtype \/Image \/Width (\d+) \/Height (\d+) \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Filter \/DCTDecode \/Length (\d+) >>\nstream\n/.exec(withMark);
    if (!m) problems.push('pdf: no well-formed image XObject as object 4');
    else { const start = m.index + m[0].length, len = Number(m[3]); const tail = withMark.slice(start + len, start + len + 10); if (tail !== '\nendstream') problems.push('pdf: /Length ' + len + ' does not land on endstream (got ' + JSON.stringify(tail) + ')'); if (withMark.charCodeAt(start) !== 0xFF || withMark.charCodeAt(start + 1) !== 0xD8) problems.push('pdf: the stream does not start with the JPEG SOI'); }
    const count = Number((/\/Size (\d+)/.exec(withMark) || [])[1]); const xrefAt = Number((/startxref\n(\d+)/.exec(withMark) || [])[1]);
    if (withMark.slice(xrefAt, xrefAt + 4) !== 'xref') problems.push('pdf: startxref does not point at xref');
    const entries = withMark.slice(xrefAt).split('\n').slice(3, 3 + count - 1);   // after 'xref', '0 N' and the free entry 0
    entries.forEach((e, i) => { const off = Number(e.slice(0, 10)); const id = i + 1; if (withMark.slice(off, off + String(id).length + 6) !== id + ' 0 obj') problems.push('pdf: xref entry ' + id + ' -> ' + off + ' is not "' + id + ' 0 obj" (' + JSON.stringify(withMark.slice(off, off + 12)) + ')'); });
    const pageObjs = withMark.match(/<< \/Type \/Page \/Parent[^\n]*/g) || [];
    if (!/\/XObject << \/Im1 4 0 R >>/.test(pageObjs[0] || '')) problems.push('pdf: page 1 lacks the XObject resource');
    if (pageObjs.slice(1).some(p => /XObject/.test(p))) problems.push('pdf: a later page carries the XObject resource');
    const streams = withMark.split(/\d+ 0 obj\n<< \/Length \d+ >>\nstream\n/).slice(1).map(s => s.split('\nendstream')[0]);
    if (!/^q 48 0 0 48 282 700 cm \/Im1 Do Q\nBT \/F1 9\.5 Tf 13 TL 1 0 0 1 44 694 Tm\n/.test(streams[0] || '')) problems.push('pdf: page 1 prelude/origin wrong: ' + JSON.stringify((streams[0] || '').slice(0, 80)));
    if (streams.slice(1).some(s => /Im1|cm/.test(s) || !/^BT \/F1 9\.5 Tf 13 TL 1 0 0 1 44 748 Tm\n/.test(s))) problems.push('pdf: a later page moved');
    // THE TEXT: identical rows, same order, with and without the mark
    const a = rowsOf(withMark).flat(), b = rowsOf(without).flat();
    if (JSON.stringify(a) !== JSON.stringify(b)) problems.push('pdf: the text rows differ with the mark (' + a.length + ' vs ' + b.length + ')');
    const perPage = rowsOf(withMark).map(x => x.length);
    if (perPage[0] !== 49 || perPage.slice(1, -1).some(n => n !== 54) || perPage.some(n => n > 54)) problems.push('pdf: rows per page ' + JSON.stringify(perPage) + ' (want 49, 54…, <=54)');

    // THE PIXELS
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mark-')); const pdfPath = path.join(dir, 'receipt.pdf'); fs.writeFileSync(pdfPath, Buffer.from(withMark, 'latin1'));
    let png = null; try { execSync('qlmanage -t -s 2400 -o ' + JSON.stringify(dir) + ' ' + JSON.stringify(pdfPath), { stdio: 'ignore' }); png = fs.readFileSync(path.join(dir, 'receipt.pdf.png')); } catch (e) { bail('PDFKit could not render the PDF (qlmanage): ' + e.message); }
    const im = pngPixels(png); const s = im.w / 612;   // page points -> pixels
    const pt = (x, y) => im.at(Math.round(x * s), Math.round(y * s));
    const box = { x: 282, y: 44 };   // the mark's box in page points, y from the top
    const corners = [[box.x + 1, box.y + 1], [box.x + 47, box.y + 1], [box.x + 1, box.y + 47], [box.x + 47, box.y + 47]].map(([x, y]) => pt(x, y));
    corners.forEach((c, i) => { if (c.some(ch => ch < 245)) problems.push('pixels: corner ' + i + ' of the mark box is ' + JSON.stringify(c) + ', not white - the black-under-alpha hazard'); });
    const stroke = pt(box.x + 18, box.y + 24);   // on the R
    if (!(stroke[0] < 60 && stroke[1] > 20 && stroke[1] < 90 && stroke[2] < 70 && stroke[1] > stroke[0])) problems.push('pixels: the R is ' + JSON.stringify(stroke) + ', not the mark\'s dark green');
    const beside = pt(box.x - 20, box.y + 24); if (beside.some(ch => ch < 245)) problems.push('pixels: the page beside the mark is ' + JSON.stringify(beside));
    // something dark below the mark where the header text starts (y 694 - 9.5 .. 694)
    let ink = 0; for (let x = 44; x < 200; x += 2) for (let y = 686; y < 696; y++) { const c = pt(x, y); if (c[0] < 120) ink++; }
    if (ink < 20) problems.push('pixels: no header text where it should start under the mark (ink ' + ink + ')');

    console.log(JSON.stringify({ result: problems.length ? 'FAIL' : 'PASS', problems, image: v.mark, img: v.img, markRequestsDuringExport: v.markRequestsDuringExport, pdf: { withMarkBytes: withMark.length, withoutBytes: without.length, rowsPerPage: perPage, objects: count - 1 }, pixels: { scale: Math.round(s * 100) / 100, corners, stroke, beside, headerInk: ink, render: path.join(dir, 'receipt.pdf.png') } }, null, 1));
    process.exit(problems.length ? 1 : 0);
})().catch(e => bail(String(e && e.stack || e)));
