#!/usr/bin/env node
// ============================================================================
// THE HOMEPAGE PICTURE VIEWER'S TAP-TO-ZOOM, IN A REAL BROWSER (ADVISOR-20261119-1045).
// Manny tapped the Skins picture ("Hope Foundation Classic", the two-round guard's stand-in event) on his iPhone
// and saw it cut off on the right. Reproduced: the zoom doubled the picture from its top-left corner, so a tap in
// the middle left the right half off screen with no hint it could be dragged.
// Cold arrival (tools/lib/cold-arrival.js) on the homepage served over local http, at 390x664 (Safari's visible
// area on a 390x844 iPhone): open the Skins tile, then one real tap on the RIGHT part of the picture. Checks:
//   1. after the tap, the spot tapped is still on screen (the zoom kept it under the finger)
//   2. the caption says how to look around and how to fit again
//   3. a second tap fits the picture back, whole, and the caption is back
//   node tools/viewer-zoom-check.js [--shots <dir>]   exit 0 pass, 1 fail, 2 no browser
// ============================================================================
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { arriveCold } = require('./lib/cold-arrival.js');
const ROOT = path.join(__dirname, '..');
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.jpg': 'image/jpeg' };
const READ = { expression: `JSON.stringify((function(){ var box=[].slice.call(document.querySelectorAll('.fv-img')).filter(function(b){var r=b.getBoundingClientRect(); return r.width>100 && r.left>=0 && r.right<=innerWidth+1 && b.querySelector('img[src*="skins-tab"],img[srcset*="skins-tab"]');})[0];
  if(!box) return {none:true}; var r=box.getBoundingClientRect(), img=box.querySelector('img').getBoundingClientRect();
  return { box:[Math.round(r.left),Math.round(r.right)], img:[Math.round(img.left),Math.round(img.right)], zoom:box.classList.contains('zoom'), sl:Math.round(box.scrollLeft), cap:(document.querySelector('.fv-cap small')||{}).innerText||'' }; })())` };
(async () => {
    const i = process.argv.indexOf('--shots'), shots = i > -1 ? process.argv[i + 1] : null;
    const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p === '/') p = '/hardpan-home.html'; if (!path.extname(p)) p += '.html';
        const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
        r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const url = 'http://127.0.0.1:' + srv.address().port + '/';
    // the tap point: three quarters across the picture, a third down (the title row)
    const TAP = { expression: `(function(){ var box=[].slice.call(document.querySelectorAll('.fv-img')).filter(function(b){var r=b.getBoundingClientRect(); return r.width>100 && r.left>=0 && r.right<=innerWidth+1 && b.querySelector('img[src*="skins-tab"],img[srcset*="skins-tab"]');})[0]; var r=box.getBoundingClientRect(); window.__tapAt={x:Math.round(r.left+r.width*0.75), y:Math.round(r.top+r.height*0.33)}; return JSON.stringify(window.__tapAt); })()` };
    const a = await arriveCold({ url, db: {}, settleMs: 2000, viewport: { width: 390, height: 664 },
        steps: [{ expression: "document.querySelector('.gt[data-open-key=\"skins-tab\"]').click(); 1" }, { sleep: 900 }, READ, TAP] });
    // then a second arrival taps that point for real (Input events), twice: zoom, then fit
    if (!a.ok) { console.log('NO BROWSER RUN: ' + a.reason); srv.close(); process.exit(2); }
    const before = JSON.parse(a.value[2]), at = JSON.parse(a.value[3]);
    const tapSteps = (n) => Array.from({ length: n }, () => [{ cdp: { method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 } } }, { cdp: { method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 } } }, { sleep: 500 }]).flat();
    const b = await arriveCold({ url, db: {}, settleMs: 2000, viewport: { width: 390, height: 664 },
        steps: [{ expression: "document.querySelector('.gt[data-open-key=\"skins-tab\"]').click(); 1" }, { sleep: 900 }].concat(tapSteps(1), [READ], shots ? [{ shot: path.join(shots, 'viewer-zoom-after.png'), viewportOnly: true }] : [], tapSteps(1), [READ]) });
    srv.close();
    if (!b.ok) { console.log('NO BROWSER RUN: ' + b.reason); process.exit(2); }
    const reads = b.value.filter((v) => /^\{"box"|^\{"none"/.test(String(v))).map((v) => JSON.parse(v));
    const z = reads[0], fit = reads[1];
    const res = [];
    const check = (name, ok, d) => { res.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  ' + JSON.stringify(d))); };
    check('before: the picture is whole on screen', before.img && before.img[0] >= 0 && before.img[1] <= 391, before);
    check('after a tap at ' + JSON.stringify(at) + ': zoomed, and the spot tapped is still on the picture on screen (scrolled to it)', z && z.zoom && z.sl > 0, z);
    check('the caption says how to look around and fit again', z && /Drag to look around · tap again to fit/.test(z.cap), z && z.cap);
    check('a second tap fits it back, whole, and the caption is back', fit && !fit.zoom && fit.img[0] >= 0 && fit.img[1] <= 391 && /Pinch or tap to zoom/.test(fit.cap), fit);
    const fails = res.filter((x) => !x).length;
    console.log('\n' + (res.length - fails) + ' / ' + res.length + ' PASS');
    process.exit(fails ? 1 : 0);
})();
