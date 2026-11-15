// ============================================================================
// THE SCORECARD SHEET, MEASURED IN CHROME (LB-FINAL, Manny 2026-11-14).
//
// tournament.html is opened cold through tools/lib/cold-arrival.js with the
// two-course fixture; the page's own init renders the board; a real click on a
// row opens the sheet. What is measured, because mini-dom has no layout:
//   1 at 390x844 the sheet is a bottom half-sheet: visible, its bottom at the
//     viewport's bottom, its top below the middle of the screen is NOT required
//     (a long card may need more), but it must leave the board's title visible
//     (top > 80px) and never exceed the viewport;
//   2 at 1280x800 it is a right-side panel: left edge past 800px, full height.
// Nothing here calls a page function; the tap is a click on the row.
//
// BASELINE against main e1312cf2: 2 tests - 0 pass / 2 fail (no sheet element).
// With the build: 2 pass / 0 fail.
// ============================================================================
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const F = require('./helpers/two-round-fixture.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const READ = { expression: `JSON.stringify((function () {
  var ov = document.getElementById('lb-sheet'); var sh = ov ? ov.querySelector('.lb-sheet') : null;
  var r = sh ? sh.getBoundingClientRect() : null;
  return { open: !!ov && /\\bopen\\b/.test(ov.className), name: (document.getElementById('lb-sheet-name') || {}).textContent || '',
    rect: r ? { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) } : null,
    vw: window.innerWidth, vh: window.innerHeight,
    bodyText: (sh ? (sh.innerText || '') : '').replace(/\\s+/g, ' ').slice(0, 120) };
})())` };
const click = (sel) => ({ expression: `(function(){ var e = document.querySelector('${sel}'); if (e) e.click(); return !!e; })()` });
async function go(viewport) {
    const r = await arriveCold({ url: fileUrl('tournament.html', 'tourney=STK'), db: F.db(), auth: OWNER, viewport, settleMs: 2500,
        steps: [{ tap: '#tab-btn-leaderboard' }, { sleep: 500 }, click('.lb-row.lb-event[data-entry="pA"]'), { sleep: 400 }, READ] });
    assert.ok(r.ok, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v))[0];
}

test('1 phone 390x844: a click on Ana opens a bottom sheet inside the viewport', async () => {
    const a = await go({ width: 390, height: 844 });
    assert.ok(a.open, 'the sheet opened');
    assert.equal(a.name, 'Ana Diaz');
    assert.ok(a.rect, 'measured');
    assert.equal(a.rect.bottom, a.vh, 'anchored to the bottom');
    assert.ok(a.rect.top > 80 && a.rect.top < a.vh, 'a sheet, not a full page: top ' + a.rect.top);
    assert.equal(a.rect.left, 0); assert.equal(a.rect.right, a.vw);
    assert.match(a.bodyText, /Ana Diaz/);
});

test('2 laptop 1280x800: the same sheet is a right-side panel', async () => {
    const a = await go({ width: 1280, height: 800 });
    assert.ok(a.open && a.rect, 'opened and measured');
    assert.ok(a.rect.left >= 800, 'on the right: left ' + a.rect.left);
    assert.equal(a.rect.right, a.vw);
    assert.equal(a.rect.top, 0); assert.equal(a.rect.bottom, a.vh);
    assert.equal(a.rect.w, 420);
});
