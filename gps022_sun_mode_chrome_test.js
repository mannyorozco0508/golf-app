// ============================================================================
// 022 SUN MODE (Manny, option C of ~/Desktop/claude-code-reports/022/mockup-sun-mode.png), IN REAL CHROME.
//
// Tools > Display: Standard | Sun | Auto (Sun during daylight at the course), per phone, default Auto.
//   1  Sun, layouts D and C, at iPhone SE / 15 / Pro Max: black panels with white outlines, the MIDDLE
//      number ~30% bigger than Standard, F / B yellow (#ffe600), a white Enter score, yellow-ringed
//      distance bubbles - and EVERY visible text on a panel at WCAG AAA (7:1) or better; nothing on
//      the Plays-like pill (URGENT-023).
//   2  Auto: Sun at noon at the course, Standard at night - worked out on the phone (sunrise / sunset
//      from the course's point), nothing asked of the network.
//   3  The Tools sheet's Display row sets it, and it is kept on the phone.
// Screenshots (SUN_SHOTS=dir): Standard vs Sun, with and without a sun-glare layer.
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

const CODE = 'SUN022';
const SHOTS = process.env.SUN_SHOTS || '';
const r = wizardSavedRound({ code: CODE, golfers: 1, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Manny'],
    overrides: { activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', groupSizeOverrides: { 0: 1 } } });
delete r.moneyPool; r.additionalGames = {}; r.additionalGameInstances = {}; r.sideMatches = {}; r.scores = {};
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,devPro:true});}});})();";
// The golfer on hole 1's tee area at Caledonia, a fix every second.
const GEO = "(function(){ try { Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:function(ok){ var f=function(){ok({coords:{latitude:33.4504,longitude:-79.1537,accuracy:5},timestamp:Date.now()});}; setTimeout(f,50); var t=setInterval(f,1000); return t; }, clearWatch:function(t){clearInterval(t);}, getCurrentPosition:function(ok){ok({coords:{latitude:33.4504,longitude:-79.1537,accuracy:5},timestamp:Date.now()});}}}); } catch(e){} })();";
const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO
    + "try{localStorage.setItem('golfapp_me_" + CODE + "','101');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');}catch(e){}";
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const SIZES = { SE: [375, 667], '15': [393, 852], ProMax: [430, 932] };

// Every visible text on a panel: its colour against the first solid background under it.
const CONTRAST = "(function(){ function rgb(s){ var m=/rgba?\\(([^)]+)\\)/.exec(s||''); if(!m) return null; var p=m[1].split(',').map(function(x){return parseFloat(x);}); return { r:p[0], g:p[1], b:p[2], a:p.length>3?p[3]:1 }; }"
    + " function lum(c){ var f=function(v){ v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4); }; return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b); }"
    + " function bg(e){ for (var x=e; x && x!==document.body; x=x.parentElement){ var c=rgb(getComputedStyle(x).backgroundColor); if (c && c.a>=0.85) return c; } return null; }"
    + " var out=[]; var root=document.getElementById('gps-overlay'); var all=root.querySelectorAll('.gps-ld-head *, .gps-ld-rail *, .gps-ld-bottom *, .gps-ld-plays *, .gps-lc-top *, .gps-panel *, .gps-pill-to, .gps-pill-on');"
    + " Array.prototype.forEach.call(all, function(e){ if (!e.offsetParent) return; var cs=getComputedStyle(e); if (cs.visibility==='hidden' || cs.opacity==='0') return;"
    + " var own=Array.prototype.some.call(e.childNodes, function(n){ return n.nodeType===3 && n.textContent.trim(); }); if (!own) return; var b=bg(e); if (!b) return; var f=rgb(cs.color); if (!f) return;"
    + " var L1=lum(f), L2=lum(b), ratio=(Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05); out.push({ t: e.textContent.trim().slice(0,18), cls: String(e.className).slice(0,30), ratio: Math.round(ratio*10)/10, fg: cs.color, bg: 'rgb('+b.r+','+b.g+','+b.b+')' }); });"
    + " return JSON.stringify(out); })()";
const LOOK = "(function(){ var o=document.getElementById('gps-overlay'); var mid=o.querySelector('.gps-ld .gps-ld-top .gps-num-mid .gps-big') || o.querySelector('.gps-lc .gps-lc-nums .gps-num-mid .gps-big') || o.querySelector('.gps-num-mid .gps-big');"
    + " var f=o.querySelector('.gps-num-f .gps-big'), top=o.querySelector('.gps-ld-top') || o.querySelector('.gps-panel'), sb=o.querySelector('.gps-scorebox'), bub=o.querySelector('.gps-pill-to');"
    + " var cs=function(e,p){ return e ? getComputedStyle(e)[p] : null; };"
    + " return JSON.stringify({ sun: o.classList.contains('gps-sun'), body: document.body.classList.contains('hp-sun'), layout: HardPanGps.layout(), midSize: parseFloat(cs(mid,'fontSize')), midColor: cs(mid,'color'), fColor: cs(f,'color'),"
    + " topBg: cs(top,'backgroundColor'), topBorder: cs(top,'borderTopColor') + ' ' + cs(top,'borderTopWidth'), score: cs(sb,'backgroundColor'), bubBorder: bub ? cs(bub,'borderTopColor') + ' ' + cs(bub,'borderTopWidth') : null }); })()";
const OVER = "(function(){ var p=document.querySelector('#gps-overlay .gps-ld-plays'); if(!p || !p.offsetParent) return JSON.stringify({ pill:false, hits:[] }); var r=p.getBoundingClientRect(), hits=[];"
    + " Array.prototype.forEach.call(document.querySelectorAll('#gps-overlay button, #gps-overlay .gps-banner, #hp-card-bet'), function(e){ if (e===p || p.contains(e) || e.contains(p) || !e.offsetParent) return; var cs=getComputedStyle(e); if (cs.visibility==='hidden') return;"
    + " var q=e.getBoundingClientRect(); if (q.width<2||q.height<2) return; var x=Math.min(r.right,q.right)-Math.max(r.left,q.left), y=Math.min(r.bottom,q.bottom)-Math.max(r.top,q.top); if (x>2&&y>2) hits.push(String(e.className).slice(0,40)); }); return JSON.stringify({ pill:true, hits:hits }); })()";
const GLARE = "(function(on){ var g=document.getElementById('__glare'); if(!on){ if(g) g.remove(); return 0; } if(!g){ g=document.createElement('div'); g.id='__glare'; g.style.cssText='position:fixed;inset:0;z-index:99999;pointer-events:none;background:radial-gradient(circle at 30% 20%, rgba(255,255,255,.62), rgba(255,255,255,.42) 60%, rgba(255,255,255,.34));'; document.body.appendChild(g);} return 1; })";

let j;
const ev = async (x) => j.evaluate(x);
const shot = async (name) => { if (SHOTS) { await sleep(400); await j.shot(path.join(SHOTS, name + '.png')); } };
async function size(w, h) { await j.cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true }); await sleep(1200); }

before(async () => {
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    j = await openJourney({ db: { events: { [CODE]: r }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} }, viewport: { width: 393, height: 852 }, webgl: true, preScript: PRE });
    await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1&me=101'), 5000);
    for (let i = 0; i < 20 && (await ev('window.HardPanGps && HardPanGps.side && HardPanGps.side()')) !== 'gps'; i++) await sleep(500);
    await sleep(3000);
});
after(async () => { if (j) await j.close(); });

test('default is Auto, and the Tools sheet\'s Display row sets Standard / Sun / Auto (kept on the phone)', { timeout: 60000 }, async () => {
    assert.equal(await ev('HardPanGps.display()'), 'auto');
    await ev("HardPanGps.openTools ? HardPanGps.openTools() : 0");
    await sleep(600);
    const row = await ev("JSON.stringify(Array.prototype.map.call(document.querySelectorAll('#gps-overlay [data-ts-seg=display] button'), function(b){ return b.textContent + (b.classList.contains('on') ? '*' : ''); }))");
    assert.deepEqual(JSON.parse(row), ['Standard', 'Sun', 'Auto*']);
    await ev("document.querySelector('#gps-overlay [data-ts-seg=display] [data-v=sun]').click()");
    await sleep(300);
    assert.equal(await ev("localStorage.getItem('hardpan_display')"), 'sun');
    assert.equal(await ev('HardPanGps.sunOn()'), true);
    await ev("document.querySelector('#gps-overlay [data-ts-seg=display] [data-v=standard]').click()");
    await sleep(300);
    assert.equal(await ev('HardPanGps.sunOn()'), false);
    await ev("(function(){ var b=document.querySelector('#gps-overlay .gps-ts-back'); if (b) b.click(); return 1; })()");
});

for (const lay of ['d', 'c']) {
    for (const [nm, [w, h]] of Object.entries(SIZES)) {
        test(`Sun, layout ${lay.toUpperCase()}, ${nm}: black + white outlines, bigger MIDDLE, yellow F/B, white Enter score, yellow-ringed bubbles; every panel text >= 7:1; Plays-like pill clear`, { timeout: 90000 }, async () => {
            await size(w, h);
            await ev(`HardPanGps.setLayout('${lay}')`);
            await sleep(1500);
            await ev("HardPanGps.setDisplay('standard')");
            await sleep(700);
            const std = JSON.parse(await ev(LOOK));
            assert.equal(std.sun, false);
            await shot(`${lay}-${nm}-standard`);
            await ev(GLARE + '(true)'); await shot(`${lay}-${nm}-standard-glare`); await ev(GLARE + '(false)');
            await ev("HardPanGps.setDisplay('sun')");
            await sleep(700);
            const sun = JSON.parse(await ev(LOOK));
            assert.equal(sun.sun, true); assert.equal(sun.body, true);
            assert.equal(sun.layout, lay);
            assert.equal(sun.topBg, 'rgb(0, 0, 0)', 'solid black panel');
            assert.match(sun.topBorder, /^rgb\(255, 255, 255\) 2px$/, 'white outline: ' + sun.topBorder);
            assert.equal(sun.midColor, 'rgb(255, 255, 255)');
            assert.ok(sun.midSize >= std.midSize * 1.25, `the MIDDLE ~30% bigger: ${std.midSize}px -> ${sun.midSize}px`);
            if (sun.fColor) assert.equal(sun.fColor, 'rgb(255, 230, 0)', 'F / B yellow');
            if (sun.score) assert.equal(sun.score, 'rgb(255, 255, 255)', 'a white Enter score');
            if (sun.bubBorder) assert.match(sun.bubBorder, /^rgb\(255, 230, 0\) 3px$/, 'yellow-ringed bubbles: ' + sun.bubBorder);
            const texts = JSON.parse(await ev(CONTRAST));
            assert.ok(texts.length >= 6, 'texts measured: ' + texts.length);
            const low = texts.filter((t) => t.ratio < 7);
            assert.deepEqual(low, [], 'WCAG AAA (7:1) on every panel text: ' + JSON.stringify(low));
            const ov = JSON.parse(await ev(OVER));
            assert.deepEqual(ov.hits, [], 'nothing on the Plays-like pill: ' + JSON.stringify(ov.hits));
            if (nm === '15') fs.writeFileSync(path.join(SHOTS || require('os').tmpdir(), `contrast-${lay}.json`), JSON.stringify(texts, null, 1));
            await shot(`${lay}-${nm}-sun`);
            await ev(GLARE + '(true)'); await shot(`${lay}-${nm}-sun-glare`); await ev(GLARE + '(false)');
        });
    }
}

test('Auto: Sun at noon at the course, Standard at night - worked out on the phone (no network)', { timeout: 60000 }, async () => {
    await size(393, 852);
    await ev("HardPanGps.setLayout('d')");
    await sleep(800);
    // Caledonia (33.45, -79.15): noon EDT = 16:00 UTC; 11 PM EDT = 03:00 UTC.
    await ev("window.__hpSunNow = Date.UTC(2026, 9, 20, 16, 0); HardPanGps.setDisplay('auto'); 1");
    await sleep(500);
    assert.equal(await ev('HardPanGps.sunOn()'), true, 'noon: Sun');
    await shot('auto-day');
    await ev("window.__hpSunNow = Date.UTC(2026, 9, 21, 3, 0); HardPanGps.setDisplay('auto'); 1");
    await sleep(500);
    assert.equal(await ev('HardPanGps.sunOn()'), false, 'night: Standard');
    await shot('auto-night');
    // The almanac itself: Caledonia, Oct 20 - sunrise ~11:25 UTC (7:25 EDT), sunset ~22:40 UTC (6:40 EDT).
    const h = JSON.parse(await ev('JSON.stringify(HardPanGps.sunHours(33.45, -79.15, new Date(Date.UTC(2026, 9, 20, 12))))'));
    assert.ok(h.rise > 11 && h.rise < 11.8, 'sunrise ' + h.rise);
    assert.ok(h.set > 22.3 && h.set < 23.1, 'sunset ' + h.set);
    await ev("delete window.__hpSunNow; HardPanGps.setDisplay('auto'); 1");
});
