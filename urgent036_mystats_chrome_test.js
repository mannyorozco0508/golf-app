// ============================================================================
// URGENT-036 #37 - MY STATS FROM A SMALL SAMPLE, IN REAL CHROME (393x852, iPhone 15 size).
//
// POLISH #37: one hole of putts showed "PUTTS / ROUND 36.0" and "GIR 100%". Under 9 holes of data
// My stats shows the sample - "2 putts", "1 of 1", each "from 1 hole" - never a per-round number or
// a percentage; with 9 or 18 holes it shows as before. Home -> My stats (the More line's link),
// GPS Map on (iap stub), one golfer's round on the phone (hardpan_qstats_v1_), synthetic data.
// Shots: $MYSTATS_SHOTS/<n>-holes.png when set.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-stats.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const PARS = [4, 4, 4, 4, 3, 5, 4, 3, 5, 4, 4, 5, 3, 4, 4, 3, 5, 4];
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false});}});})();";
const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});";
const seed = (n) => {
    const holes = {}, snap = {};
    PARS.forEach((p, k) => { snap[k + 1] = { s: k < n ? p : 0, par: p }; if (k < n) holes[k + 1] = Object.assign({ putts: 2 }, p >= 4 ? { fw: 'hit' } : {}); });
    const rec = { v: 1, code: 'MYS' + n, pid: '101', course: 'Papago Golf Club', at: Date.now(), me: true, holes, snap };
    return "try{localStorage.setItem('hardpan_qstats_v1_MYS" + n + "_p101', " + JSON.stringify(JSON.stringify(rec)) + ");}catch(e){}";
};
const MY = `JSON.stringify((function () {
  var p = document.getElementById('hp-my-stats'), t = {};
  if (p) Array.prototype.forEach.call(p.querySelectorAll('[data-ms]'), function (x) { var s = x.querySelector('.s'); t[x.getAttribute('data-ms')] = { k: x.querySelector('.k').textContent, v: x.querySelector('.v').textContent, from: s ? s.textContent : null }; });
  return { open: !!(p && p.style.display !== 'none' && p.getBoundingClientRect().height > 0), t: t, scrollW: document.documentElement.scrollWidth, e: window.__e };
})())`;
async function myStats(n) {
    const dir = process.env.MYSTATS_SHOTS;
    const steps = [{ sleep: 800 }, { tap: '.hp-view.on [data-hp-act="sstats"]' }, { sleep: 600 }, { expression: MY }];
    if (dir) steps.push({ shot: path.join(dir, n + '-holes.png'), viewportOnly: true });
    const r = await arriveCold({ url: fileUrl('home.html'), settleMs: 3500, viewport: { width: 393, height: 852 },
        preScript: seed(n) + CFG + 'window.__hardpanDoors = true;' + ERR + iapStub({ active: true }), steps });
    if (!r.ok) throw new Error(r.reason);
    return JSON.parse(r.value.find((v) => typeof v === 'string' && v.charAt(0) === '{'));
}
const none = (t) => Object.keys(t).forEach((k) => assert.equal(t[k].from, null, k + ' shows a sample line'));

test('1 hole: "2 putts", GIR / FIR "1 of 1", each "from 1 hole" - no 36.0, no 100%', async () => {
    const m = await myStats(1);
    assert.ok(m.open, 'My stats did not open'); assert.deepEqual(m.e, []);
    assert.deepEqual(m.t.putts, { k: 'Putts', v: '2 putts', from: 'from 1 hole' });
    assert.deepEqual(m.t.gir, { k: 'Greens (GIR)', v: '1 of 1', from: 'from 1 hole' });
    assert.deepEqual(m.t.fir, { k: 'Fairways (FIR)', v: '1 of 1', from: 'from 1 hole' });
    Object.keys(m.t).forEach((k) => assert.ok(!/36\.0|100%/.test(m.t[k].v), k + ': ' + m.t[k].v));
    assert.ok(m.scrollW <= 393, 'sideways scroll: ' + m.scrollW);
});
test('4 holes: "8 putts", "4 of 4", "from 4 holes"', async () => {
    const m = await myStats(4);
    assert.deepEqual(m.t.putts, { k: 'Putts', v: '8 putts', from: 'from 4 holes' });
    assert.deepEqual(m.t.gir, { k: 'Greens (GIR)', v: '4 of 4', from: 'from 4 holes' });
    assert.deepEqual(m.t.fir, { k: 'Fairways (FIR)', v: '4 of 4', from: 'from 4 holes' });
});
test('9 holes: as before - Putts / round 36.0, GIR 100%, no sample lines', async () => {
    const m = await myStats(9);
    assert.deepEqual(m.t.putts, { k: 'Putts / round', v: '36.0', from: null });
    assert.equal(m.t.gir.v, '100%'); assert.equal(m.t.fir.v, '100%'); none(m.t);
});
test('18 holes: as before - plus the scoring average', async () => {
    const m = await myStats(18);
    assert.deepEqual(m.t.putts, { k: 'Putts / round', v: '36.0', from: null });
    assert.equal(m.t.gir.v, '100%'); assert.equal(m.t.avg.v, '72.0'); none(m.t);
});
