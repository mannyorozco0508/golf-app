// ============================================================================
// LANDING PAGE FAN CHECK (tournaments.html, Manny 2026-11-14 "C with B's phones").
// Opens the page the way a visitor does (a URL, nothing called) in headless Chrome at
// 390x844 and 1400x900 and MEASURES the "During the round" band:
//   phone  - the three fanned phones all sit inside the 390px frame (no clipping), the GPS
//            phone (.p2) is in front and overlaps both neighbours, and no caption overlaps
//            the TV frame
//   desktop - the three captions sit above the TV frame (none hidden under it), the fan
//            is centred in the band
// Usage: node tools/landing-fan-check.js BASE_URL   (e.g. http://127.0.0.1:8799 from
// `npx wrangler pages dev . --port 8799`). Exit 0 = every measure held, 1 = a measure
// failed (printed), 2 = the page did not open. Prints JSON of what it measured.
// mini-dom cannot run this (no layout): Chrome only. Run by hand after touching the band.
// ============================================================================
'use strict';
const { arriveCold } = require('./lib/cold-arrival.js');
const BASE = process.argv[2];
if (!BASE) { console.error('usage: node tools/landing-fan-check.js http://127.0.0.1:8799'); process.exit(2); }
const MEASURE = `(function(){
  var R = function (sel) { var e = document.querySelector(sel); if (!e) return null; var b = e.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom), w: Math.round(b.width) }; };
  var z = function (sel) { var e = document.querySelector(sel); return e ? Number(getComputedStyle(e).zIndex) || 0 : null; };
  var vis = function (sel) { var e = document.querySelector(sel); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; };
  return JSON.stringify({ vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth,
    p1: R('.D .fan .p1'), p2: R('.D .fan .p2'), p3: R('.D .fan .p3'), z1: z('.D .fan .p1'), z2: z('.D .fan .p2'), z3: z('.D .fan .p3'),
    cap1: vis('.D .fan .p1 .cap') ? R('.D .fan .p1 .cap') : null, cap2: vis('.D .fan .p2 .cap') ? R('.D .fan .p2 .cap') : null, cap3: vis('.D .fan .p3 .cap') ? R('.D .fan .p3 .cap') : null,
    tv: R('.D .band .desk'), band: R('.D .band') });
})()`;
async function at(width, height) {
    const r = await arriveCold({ url: BASE + '/tournaments', db: {}, viewport: { width, height }, settleMs: 1500, steps: [{ expression: MEASURE }] });
    if (!r.ok) return { ok: false, reason: r.reason };
    const v = (r.value || []).find((x) => typeof x === 'string' && x[0] === '{');
    return v ? JSON.parse(v) : { ok: false, reason: 'no measure' };
}
const overlapX = (a, b) => a && b && a.l < b.r && b.l < a.r;
(async () => {
    const fails = [];
    const ph = await at(390, 844);
    if (!ph.p1 || !ph.p2 || !ph.p3 || !ph.tv) fails.push('phone: band parts missing ' + JSON.stringify(ph).slice(0, 200));
    else {
        if (ph.sw > 390) fails.push('phone: the page is wider than the frame: ' + ph.sw);
        [ph.p1, ph.p2, ph.p3].forEach((p, i) => { if (p.l < 0 || p.r > 390) fails.push('phone: phone ' + (i + 1) + ' leaves the frame ' + JSON.stringify(p)); });
        if (!(ph.z2 > ph.z1 && ph.z2 > ph.z3)) fails.push('phone: GPS not in front z=' + [ph.z1, ph.z2, ph.z3]);
        if (!(overlapX(ph.p2, ph.p1) && overlapX(ph.p2, ph.p3))) fails.push('phone: not a fan (the GPS phone does not overlap its neighbours)');
        if (ph.p1.b > ph.tv.t || ph.p3.b > ph.tv.t || ph.p2.b > ph.tv.t) fails.push('phone: a phone runs into the TV frame');
        if (ph.cap2 && ph.cap2.b > ph.tv.t) fails.push('phone: the GPS caption sits under the TV frame');
    }
    const dk = await at(1400, 900);
    if (!dk.p1 || !dk.p2 || !dk.p3 || !dk.tv) fails.push('desktop: band parts missing ' + JSON.stringify(dk).slice(0, 200));
    else {
        [dk.cap1, dk.cap2, dk.cap3].forEach((c, i) => { if (!c) fails.push('desktop: caption ' + (i + 1) + ' not shown'); else if (c.b > dk.tv.t) fails.push('desktop: caption ' + (i + 1) + ' hidden under the TV frame (' + c.b + ' > ' + dk.tv.t + ')'); });
        if (!(dk.z2 > dk.z1 && dk.z2 > dk.z3)) fails.push('desktop: GPS not in front');
        const mid = (dk.p2.l + dk.p2.r) / 2, bmid = (dk.band.l + dk.band.r) / 2;
        if (Math.abs(mid - bmid) > 24) fails.push('desktop: the fan is off centre by ' + Math.round(mid - bmid) + 'px');
        [dk.p1, dk.p3].forEach((p, i) => { if (p.l < dk.band.l || p.r > dk.band.r) fails.push('desktop: side phone ' + (i ? 3 : 1) + ' leaves the band'); });
    }
    console.log(JSON.stringify({ phone: ph, desktop: dk, fails }, null, 0));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e && e.message); process.exit(2); });
