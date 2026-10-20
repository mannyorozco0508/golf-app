// ============================================================================
// URGENT-030: THE COURSE LINE on the GPS top bar, IN REAL CHROME (Manny, option A of
// ~/Desktop/claude-code-reports/029/mockup-course-name.png).
//   Layouts D (the top yardage bar) and C (the yardage panel), Standard and Sun, at iPhone SE / 15 / Pro Max:
//   1  a thin divider and ONE centred line "Caledonia Golf & Fish Club · Pawleys Island, SC" (city / state
//      from the course's global_courses location), ~11px semibold, #b9c4b5 (white in Sun), one line, … when long;
//   2  the bar grows by no more than the line's own height (the map controls move down no more than that);
//   3  nothing overlaps it and the yardages are never cut off;
//   4  nothing else in the bar changed (the same children, URGENT-025's clean map: no other label / banner).
// Screenshots (SHOTS=dir).
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-round.js'))) { console.log('Consumer tree: no GPS - skipped.'); process.exit(0); }
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const CODE = 'TCL030';
const SHOTS = process.env.SHOTS || '';
const r = wizardSavedRound({ code: CODE, golfers: 1, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Manny'],
    overrides: { activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', groupSizeOverrides: { 0: 1 } } });
delete r.moneyPool; r.additionalGames = {}; r.additionalGameInstances = {}; r.sideMatches = {}; r.scores = {};
const GC = { caledonia: { name: 'Caledonia Golf & Fish Club', location: { city: 'Pawleys Island', state: 'SC', country: 'United States', latitude: 33.4524363, longitude: -79.155027 } } };
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,devPro:true});}});})();";
const GEO = "(function(){ try { Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:function(ok){ var f=function(){ok({coords:{latitude:33.4504,longitude:-79.1537,accuracy:5},timestamp:Date.now()});}; setTimeout(f,50); var t=setInterval(f,1000); return t; }, clearWatch:function(t){clearInterval(t);}, getCurrentPosition:function(ok){ok({coords:{latitude:33.4504,longitude:-79.1537,accuracy:5},timestamp:Date.now()});}}}); } catch(e){} })();";
const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO
    + "try{localStorage.setItem('golfapp_me_" + CODE + "','101');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');}catch(e){}";
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const SIZES = { SE: [375, 667], '15': [393, 852], ProMax: [430, 932] };
const WANT = 'Caledonia Golf & Fish Club · Pawleys Island, SC';

// The line, its bar, and everything that must stay clear of it.
const LOOK = "(function(){ var o=document.getElementById('gps-overlay'), e=o.querySelector('.gps-ld-course, .gps-lc-course'); if(!e) return JSON.stringify({ none:true });"
    + " var bar=e.parentNode, cs=getComputedStyle(e), b=e.getBoundingClientRect(), br=bar.getBoundingClientRect();"
    + " var hits=[]; Array.prototype.forEach.call(o.querySelectorAll('button, .gps-num, .gps-ld-par, .gps-ld-fb, .gps-ld-row2 > *, .gps-ld-rail > *, .gps-lc-plays, .gps-lc-acts, .gps-banner'), function(x){ if (x===e || x.contains(e) || !x.offsetParent) return; var q=x.getBoundingClientRect(); if (q.width<2||q.height<2) return;"
    + "   var w=Math.min(b.right,q.right)-Math.max(b.left,q.left), h=Math.min(b.bottom,q.bottom)-Math.max(b.top,q.top); if (w>1&&h>1) hits.push(String(x.className).slice(0,40)); });"
    + " var cut=[]; Array.prototype.forEach.call(o.querySelectorAll('.gps-num .gps-big, .gps-num .gps-m, .gps-ld-par span, .gps-hole-num'), function(x){ if (!x.offsetParent) return; if (x.scrollWidth > x.clientWidth + 1 && getComputedStyle(x).overflow !== 'visible') cut.push(x.className + ':' + x.textContent); var q=x.getBoundingClientRect(); if (q.right > br.right + 1 || q.left < br.left - 1) cut.push(x.className + ' outside the bar'); });"
    + " return JSON.stringify({ text: e.textContent, title: e.getAttribute('title'), size: parseFloat(cs.fontSize), weight: cs.fontWeight, color: cs.color, ws: cs.whiteSpace, ov: cs.textOverflow, h: b.height, lh: parseFloat(cs.lineHeight),"
    + "   cx: (b.left+b.right)/2, barCx: (br.left+br.right)/2, inBar: b.left>=br.left-1 && b.right<=br.right+1 && b.bottom<=br.bottom+1, divider: cs.borderTopWidth + ' ' + cs.borderTopStyle, barH: br.height, barBottom: br.bottom,"
    + "   kids: Array.prototype.map.call(bar.children, function(k){ return String(k.className).split(' ')[0]; }), hits: hits, cut: cut, railTop: (function(){ var x=o.querySelector('.gps-ld-rail'); return x ? x.getBoundingClientRect().top : null; })() }); })()";
// The same bar with the line taken out of it: what it measured before 030.
const BAR = "(function(){ var o=document.getElementById('gps-overlay'), bar=o.querySelector('.gps-ld .gps-ld-top') || o.querySelector('.gps-lc .gps-panel'), rail=o.querySelector('.gps-ld-rail');"
    + " return JSON.stringify({ barH: bar.getBoundingClientRect().height, railTop: rail && rail.offsetParent ? rail.getBoundingClientRect().top : null }); })()";
const HIDE = (on) => on
    ? "(function(){ var e=document.querySelector('#gps-overlay .gps-ld-course, #gps-overlay .gps-lc-course'); if (!e) return 0; window.__cl={ e:e, p:e.parentNode, n:e.nextSibling }; e.parentNode.removeChild(e); try { HardPanGps.setDisplay(HardPanGps.display()); } catch(x){} return 1; })()"
    : "(function(){ var c=window.__cl; if (!c) return 0; c.p.insertBefore(c.e, c.n); window.__cl=null; try { HardPanGps.setDisplay(HardPanGps.display()); } catch(x){} return 1; })()";

let j;
const ev = async (x) => j.evaluate(x);
const shot = async (name) => { if (SHOTS) { await sleep(400); await j.shot(path.join(SHOTS, name + '.png')); } };
async function size(w, h) { await j.cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true }); await sleep(1200); }

before(async () => {
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    j = await openJourney({ db: { events: { [CODE]: r }, global_courses: GC, trips: {}, organizers: {}, tournaments: {} }, viewport: { width: 393, height: 852 }, webgl: true, preScript: PRE });
    await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1&me=101'), 5000);
    for (let i = 0; i < 20 && (await ev('window.HardPanGps && HardPanGps.side && HardPanGps.side()')) !== 'gps'; i++) await sleep(500);
    for (let i = 0; i < 20 && (await ev('HardPanGps.courseLineNow()')) !== WANT; i++) await sleep(500);
});
after(async () => { if (j) await j.close(); });

for (const lay of ['d', 'c']) {
    for (const disp of ['standard', 'sun']) {
        for (const [nm, [w, h]] of Object.entries(SIZES)) {
            test(`layout ${lay.toUpperCase()}, ${disp}, ${nm}: one centred course line under a divider, the bar no taller than the line, nothing over it, yardages whole`, { timeout: 90000 }, async () => {
                await size(w, h);
                await ev(`HardPanGps.setLayout('${lay}')`);
                await ev(`HardPanGps.setDisplay('${disp}')`);
                await sleep(1500);
                const a = JSON.parse(await ev(LOOK));
                assert.ok(!a.none, 'the course line is there');
                assert.equal(a.text, WANT);
                assert.equal(a.title, WANT);
                assert.ok(a.size >= 10.5 && a.size <= 11.5, 'about 11px: ' + a.size);
                assert.ok(Number(a.weight) >= 600, 'semibold: ' + a.weight);
                assert.equal(a.color, disp === 'sun' ? 'rgb(255, 255, 255)' : 'rgb(185, 196, 181)');
                assert.equal(a.ws, 'nowrap'); assert.equal(a.ov, 'ellipsis');
                assert.ok(a.h <= a.lh + 4, 'one line: ' + a.h + 'px');
                assert.ok(Math.abs(a.cx - a.barCx) <= 2, 'centred in the bar: ' + a.cx + ' vs ' + a.barCx);
                assert.ok(a.inBar, 'inside its bar');
                assert.match(a.divider, /^1px solid$/);
                assert.deepEqual(a.hits, [], 'nothing over the line: ' + JSON.stringify(a.hits));
                assert.deepEqual(a.cut, [], 'the yardages whole: ' + JSON.stringify(a.cut));
                if (lay === 'd') assert.deepEqual(a.kids, ['gps-back', 'gps-hole-btn', 'gps-ld-div', 'gps-num', 'gps-ld-fb', 'gps-ld-par', 'gps-ld-course'], 'nothing else in the bar');
                await shot(`${lay}-${disp}-${nm}`);
                // Without the line: the bar (and the rail / map under it) moves up by no more than the line's height.
                await ev(HIDE(true)); await sleep(700);
                const b = JSON.parse(await ev(BAR));
                await ev(HIDE(false)); await sleep(700);
                const a2 = JSON.parse(await ev(BAR));
                assert.equal(a2.barH, a.barH, 'back as it was');
                assert.ok(a.barH - b.barH <= a.lh + 0.5, `the bar grew ${a.barH - b.barH}px for a ${a.lh}px line`);
                if (lay === 'd' && a.railTop != null && b.railTop != null) assert.ok(a.railTop - b.railTop <= a.lh + 0.5, `the controls moved ${a.railTop - b.railTop}px`);
            });
        }
    }
}

test('a long name: still one line, cut with …, the yardages untouched', { timeout: 60000 }, async () => {
    await size(375, 667);
    await ev("HardPanGps.setLayout('d')"); await ev("HardPanGps.setDisplay('standard')");
    await sleep(1200);
    const x = JSON.parse(await ev("(function(){ var e=document.querySelector('#gps-overlay .gps-ld-course'); e.textContent='Talking Stick · Piipaash (South) · Scottsdale, AZ · a very long extra bit of text'; var b=e.getBoundingClientRect(), cs=getComputedStyle(e);"
        + " return JSON.stringify({ h: b.height, lh: parseFloat(cs.lineHeight), over: e.scrollWidth > e.clientWidth, ov: cs.textOverflow }); })()"));
    assert.ok(x.over, 'longer than the bar');
    assert.equal(x.ov, 'ellipsis');
    assert.ok(x.h <= x.lh + 4, 'one line: ' + x.h);
    const a = JSON.parse(await ev(LOOK));
    assert.deepEqual(a.cut, []);
    await shot('d-standard-SE-long');
    await ev("HardPanGps.setDisplay('standard')");
});
