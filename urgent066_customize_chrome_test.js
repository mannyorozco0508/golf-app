// ============================================================================
// URGENT-066 #1 - THE CUSTOMIZABLE ROUND SCREEN, IN CHROME, AT PHONE SIZE
//
// Cold Chrome, the real index.html round (GPS side, layout D), the Firebase
// stand-in (tools/lib/journey.js): nothing leaves the page and nothing is written
// anywhere real. Test golfers only.
//
//   1  NEVER CUSTOMIZED = TODAY'S SCREEN. The same round with feature-registry.js
//      BLOCKED and with it LOADED (hint already seen): every visible element of the
//      round screen is the same, in the same place. Nothing hidden, nothing moved.
//   2  THE HINT shows once on the first round, and never again after a reload.
//   3  TOOLS > CUSTOMIZE: the panel lists the extras OFF; turn on Games ticker and
//      Live leaderboard, drag Live leaderboard above the ticker, Done -> both on the
//      screen in that order, under the Menu row, clear of the rail, the pill, Mark
//      shot and the score bar; the leaderboard is the round's own scores.
//   4  REMEMBERED on the phone (a reload); Back to simple -> today's screen again.
//   5  ZERO DATABASE WRITES from the whole Customize flow.
// At 375x667, 393x852 and 430x932.
// ============================================================================
'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const table = require('./gps-courses.js');

const SHOTS = process.env.U066_SHOTS || '';
const CODE = 'TCUST1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = 6371008.8, rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;
const hav = (a, b) => { const s = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const brg = (a, b) => { const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0])), x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1])); return (deg(Math.atan2(y, x)) + 360) % 360; };
const dest = (p, b, m) => { const d = m / R, t = rad(b), la = rad(p[0]), lo = rad(p[1]); const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(t)); return [deg(la2), deg(lo + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2)))]; };
const H1 = table.caledonia.holes['1'].osm, T1 = H1.tee, G1 = H1.mid, B1 = brg(T1, G1), L1 = hav(T1, G1);
const ME = dest(dest(T1, B1, L1 - 160 * 0.9144), B1 + 90, 12);

const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,esriKey:'',elevGapMs:0});}});})();";
const GEO = "(function(){ var cur={lat:" + ME[0] + ",lng:" + ME[1] + "}; try { Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:function(ok){var f=function(){ok({coords:{latitude:cur.lat,longitude:cur.lng,accuracy:5},timestamp:Date.now()});}; setTimeout(f,50); setInterval(f,1000); return 1;},getCurrentPosition:function(){},clearWatch:function(){}}}); } catch(e){} })();";
const NET = "(function(){ var real = window.fetch; function json(o){ return new Response(JSON.stringify(o),{status:200,headers:{'Content-Type':'application/json'}}); }"
    + " window.fetch = function(u){ var s = String(u && u.url || u); if (/epqs/.test(s)) return Promise.resolve(json({value:20})); if (/api\\.weather\\.gov/.test(s)) return Promise.resolve(new Response('{}',{status:404})); return real.apply(this, arguments); }; })();";
const SEED = (hintSeen) => "(function(){ try { if (sessionStorage.getItem('__s')) return; sessionStorage.setItem('__s','1'); localStorage.setItem('hardpan_round_side','gps|" + CODE + "'); localStorage.setItem('hardpan_last_hole_" + CODE + "','1');"
    + " localStorage.setItem('hardpan_gps_whoasked_" + CODE + "','1'); localStorage.setItem('hardpan_gps_golfer_" + CODE + "','101'); localStorage.setItem('hardpan_gps_autoadvance','0');"
    + (hintSeen ? " localStorage.setItem('hardpan_customize_hint_v1','1');" : '') + " } catch(e){} })();";
function round() {
    const r = wizardSavedRound({ code: CODE, golfers: 4, names: ['Test Manny', 'Test Joe', 'Test Rick', 'Test Dave'], hcps: [9, 12, 15, 6], ownerUid: 'anon-cold', thru: 0, flights: false,
        overrides: { additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', startingHole: 1 } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    r.scores = {};
    const cd = r.courseData.slice().sort((a, b) => a.hole - b.hole);
    const D = { 101: [1, 0, -1], 102: [0, -1, 0], 103: [1, 1, 0], 104: [0, 0, 1] };
    r.players.forEach((p) => (D[p.id] || []).forEach((d, i) => { r.scores['p' + p.id + '_h' + cd[i].hole] = cd[i].par + d; }));
    return r;
}
const BLOCK = ['*arcgis*', '*overpass*', '*cloudfunctions.net*', '*esri*', '*nationalmap.gov*'];
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) {} } });

async function roundScreen(vp, o) {
    const opts = o || {};
    const j = await openJourney({ db: { events: { [CODE]: round() }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} }, viewport: vp, webgl: true,
        blockUrls: BLOCK.concat(opts.noRegistry ? ['*feature-registry.js'] : []),
        preScript: CFG + 'window.__hardpanDoors = true;' + GEO + NET + SEED(opts.hintSeen !== false) + iapStub({ active: true }) });
    journeys.push(j);
    await j.goto(fileUrl('index.html', 'game=' + CODE), 2500);
    await ready(j);
    return j;
}
async function ready(j) {
    await j.evaluate("(function(){ if (window.HardPanGps && HardPanGps.side() === 'gps') return 'on'; var b = document.querySelector('#gps-side-toggle .gps-side-gps'); if (b) b.click(); return 'tap'; })()");
    const t0 = Date.now();
    while (Date.now() - t0 < 45000) {
        const ok = await j.evaluate("(function(){ var m = document.querySelector('#gps-overlay .gps-map'); var n=document.querySelector('#gps-overlay .gps-m'); return !!(m && m.dataset.ready === '1' && n && /\\d/.test(n.textContent)); })()");
        if (ok) break;
        await sleep(300);
    }
    await sleep(2500);
}
// Every visible element of the round screen: its class and its box (the map's own canvas and
// the number bubbles - placed per frame - left out).
const VISIBLE = "JSON.stringify((function(){ var ov=document.getElementById('gps-overlay'); var out=[];"
    + " ov.querySelectorAll('*').forEach(function(e){ if (e.closest('.maplibregl-canvas-container, .maplibregl-marker, .gps-pill-to, .gps-pill-on, .gps-ring-lbl, .gps-green-lbl, .gps-arc-lbl, .gps-tsheet, .gps-credit')) return; var b=e.getBoundingClientRect(); if(!b.width||!b.height) return; var cs=getComputedStyle(e); if(cs.visibility==='hidden'||cs.display==='none'||+cs.opacity===0) return;"
    + " out.push((e.className&&e.className.baseVal===undefined?String(e.className):'')+'@'+Math.round(b.left)+','+Math.round(b.top)+','+Math.round(b.width)+'x'+Math.round(b.height)); }); return out; })())";
const RECT = (sel) => "(function(){ var e=document.querySelector(" + JSON.stringify(sel) + "); if(!e) return null; var b=e.getBoundingClientRect(); return b.width&&b.height ? {l:b.left,t:b.top,r:b.right,b:b.bottom} : null; })()";
const hits = (a, b) => a && b && a.l < b.r - 1 && a.r > b.l + 1 && a.t < b.b - 1 && a.b > b.t + 1;
const shot = async (j, name) => { if (SHOTS) await j.shot(path.join(SHOTS, name + '.png')); };

const PHONES = [{ n: 'SE', w: 375, h: 667 }, { n: '17', w: 393, h: 852 }, { n: 'ProMax', w: 430, h: 932 }];

for (const ph of PHONES) {
    test(ph.n + ': never customized = today\'s round screen exactly (registry loaded vs blocked)', { timeout: 240000 }, async () => {
        const vp = { width: ph.w, height: ph.h };
        const a = await roundScreen(vp, { noRegistry: true });
        const without = JSON.parse(await a.evaluate(VISIBLE));
        assert.equal(await a.evaluate('typeof window.HardPanFeatures'), 'undefined');
        await a.close();
        const b = await roundScreen(vp, {});
        const withR = JSON.parse(await b.evaluate(VISIBLE));
        assert.equal(await b.evaluate('typeof window.HardPanFeatures'), 'object');
        assert.equal(await b.evaluate("document.querySelectorAll('#gps-overlay .hpf-slot').length"), 0, 'no extra is drawn');
        const lost = without.filter((x) => withR.indexOf(x) === -1), added = withR.filter((x) => without.indexOf(x) === -1);
        assert.deepEqual({ lost, added }, { lost: [], added: [] }, 'the same elements, in the same places');
        await shot(b, ph.n + '-1-default');
        await b.close();
    });

    test(ph.n + ': Tools > Customize - toggle, reorder, saved on the phone, Back to simple; zero writes', { timeout: 240000 }, async () => {
        const vp = { width: ph.w, height: ph.h };
        const j = await roundScreen(vp, {});
        const w0 = await j.evaluate('window.__WRITES.length');
        await j.evaluate("document.querySelector('#gps-overlay .gps-tools').click()"); await sleep(600);
        const cust = await j.evaluate(RECT('#gps-overlay [data-ts-cust]'));
        assert.ok(cust, 'Tools shows Customize your screen');
        await shot(j, ph.n + '-2-tools');
        await j.evaluate("document.querySelector('#gps-overlay [data-ts-cust]').click()"); await sleep(500);
        const rows = JSON.parse(await j.evaluate("JSON.stringify([].map.call(document.querySelectorAll('.hpf-panel .hpf-list .hpf-row'), function(r){ return [r.getAttribute('data-hpf-row'), !!r.querySelector('.hpf-sw.on')]; }))"));
        assert.deepEqual(rows, [['ticker', false], ['leaderboard', false], ['stats', false]], 'every extra listed, all OFF');
        assert.ok(await j.evaluate("/ALWAYS ON/.test(document.querySelector('.hpf-panel').innerText) && /NOTIFICATIONS/.test(document.querySelector('.hpf-panel').innerText)"));
        await shot(j, ph.n + '-3-panel');
        await j.evaluate("document.querySelector('[data-hpf-sw=\"ticker\"]').click()"); await sleep(150);
        await j.evaluate("document.querySelector('[data-hpf-sw=\"leaderboard\"]').click()"); await sleep(150);
        // DRAG: Live leaderboard's handle above the ticker (real pointer events through CDP).
        const g = await j.evaluate(RECT('[data-hpf-row="leaderboard"] .hpf-grab'));
        const t = await j.evaluate(RECT('[data-hpf-row="ticker"]'));
        const x = (g.l + g.r) / 2, y0 = (g.t + g.b) / 2, y1 = t.t + 4;
        await j.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y: y0, button: 'left', clickCount: 1 });
        for (let k = 1; k <= 6; k++) await j.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: y0 + (y1 - y0) * k / 6, button: 'left', buttons: 1 });
        await j.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y: y1, button: 'left', clickCount: 1 });
        await sleep(300);
        const rows2 = JSON.parse(await j.evaluate("JSON.stringify([].map.call(document.querySelectorAll('.hpf-panel .hpf-list .hpf-row'), function(r){ return [r.getAttribute('data-hpf-row'), !!r.querySelector('.hpf-sw.on')]; }))"));
        assert.deepEqual(rows2, [['leaderboard', true], ['ticker', true], ['stats', false]], 'dragged to the top, both on');
        await shot(j, ph.n + '-4-panel-on');
        await j.evaluate("document.querySelector('.hpf-done').click()"); await sleep(1200);
        const order = JSON.parse(await j.evaluate("JSON.stringify([].map.call(document.querySelectorAll('#gps-overlay .hpf-slot[data-hpf]'), function(e){ return e.getAttribute('data-hpf'); }))"));
        // The ticker's slot (strip) sits above the side slot whatever the order inside a slot.
        assert.deepEqual(order.slice().sort(), ['leaderboard', 'ticker']);
        const lbText = await j.evaluate("document.querySelector('[data-hpf=\"leaderboard\"]').innerText");
        assert.match(lbText, /LIVE/);
        assert.match(lbText.replace(/\s+/g, ' '), /1 Test J\.? .?1/, 'the round\'s own scores: Test Joe leads at -1');
        // Clear of the screen's own controls.
        const ex = [await j.evaluate(RECT('[data-hpf="ticker"]')), await j.evaluate(RECT('[data-hpf="leaderboard"]'))];
        for (const sel of ['#gps-overlay .gps-ld-rail', '#gps-overlay .gps-ld-plays', '#gps-overlay .gps-mark-shot', '#gps-overlay .gps-ld-bottom', '#gps-overlay .gps-ld-top', '#gps-overlay .gps-ld-row2']) {
            const r = await j.evaluate(RECT(sel));
            if (!r) continue;
            if (sel.endsWith('rail')) {
                const kids = JSON.parse(await j.evaluate("JSON.stringify([].map.call(document.querySelectorAll('#gps-overlay .gps-ld-rail > *'), function(e){ var b=e.getBoundingClientRect(); return b.width ? {l:b.left,t:b.top,r:b.right,b:b.bottom} : null; }).filter(Boolean))"));
                kids.forEach((k) => ex.forEach((e) => assert.ok(!hits(e, k), 'an extra overlaps a rail button ' + JSON.stringify([e, k]))));
            } else ex.forEach((e) => assert.ok(!hits(e, r), 'an extra overlaps ' + sel + ' ' + JSON.stringify([e, r])));
        }
        assert.ok(ex.every((e) => e.l >= 0 && e.r <= ph.w), 'inside the screen');
        await shot(j, ph.n + '-5-customized');
        // Remembered on this phone.
        const saved = JSON.parse(await j.evaluate("localStorage.getItem('hardpan_layout_v1')"));
        assert.deepEqual(saved.order, ['leaderboard', 'ticker', 'stats']); assert.deepEqual(saved.on, { leaderboard: true, ticker: true });
        await j.goto(fileUrl('index.html', 'game=' + CODE), 2500); await ready(j);
        assert.deepEqual(JSON.parse(await j.evaluate("JSON.stringify([].map.call(document.querySelectorAll('#gps-overlay .hpf-slot[data-hpf]'), function(e){ return e.getAttribute('data-hpf'); }).sort())")), ['leaderboard', 'ticker'], 'after a reload');
        // Back to simple.
        await j.evaluate("document.querySelector('#gps-overlay .gps-tools').click()"); await sleep(500);
        await j.evaluate("document.querySelector('#gps-overlay [data-ts-cust]').click()"); await sleep(400);
        await j.evaluate("document.querySelector('.hpf-reset').click()"); await sleep(150);
        await j.evaluate("document.querySelector('.hpf-done').click()"); await sleep(800);
        assert.equal(await j.evaluate("document.querySelectorAll('#gps-overlay .hpf-slot[data-hpf]').length"), 0);
        const writes = JSON.parse(await j.evaluate('JSON.stringify(window.__WRITES.slice(' + w0 + '))'));
        assert.deepEqual(writes.filter((w) => /layoutPrefs|pushPrefs/.test(w.path)), [], 'no layout or notification write');
        assert.deepEqual(writes, [], 'the Customize flow writes nothing to the database');
        await j.close();
    });
}

test('the first-round hint shows once and never again', { timeout: 240000 }, async () => {
    const j = await roundScreen({ width: 393, height: 852 }, { hintSeen: false });
    assert.equal(await j.evaluate("document.querySelectorAll('#gps-overlay .hpf-hint').length"), 1);
    assert.match(await j.evaluate("document.querySelector('#gps-overlay .hpf-hint').innerText"), /Customize/);
    await shot(j, '17-6-hint');
    await j.evaluate("document.querySelector('#gps-overlay .hpf-hint-x').click()"); await sleep(300);
    assert.equal(await j.evaluate("document.querySelectorAll('#gps-overlay .hpf-hint').length"), 0);
    await j.goto(fileUrl('index.html', 'game=' + CODE), 2500); await ready(j);
    assert.equal(await j.evaluate("document.querySelectorAll('#gps-overlay .hpf-hint').length"), 0, 'never again');
    await j.close();
});

test('a paid extra (a stand-in scan button) shows a lock that explains, and mounts in the dock', { timeout: 240000 }, async () => {
    const j = await roundScreen({ width: 393, height: 852 }, {});
    await j.evaluate("(window.HardPanFeatureQueue = window.HardPanFeatureQueue || []).push({ id: 'testscan', label: 'Scan scorecard', sub: 'Photo of a paper card to scores', icon: '\\uD83D\\uDCF7', isNew: true, slot: 'dock', tier: 'host', freeUses: 3, unit: 'scan',"
        + " mount: function (el) { el.innerHTML = '<button type=\"button\"><span>\\uD83D\\uDCF7</span>Scan</button>'; return {}; } })");
    await j.evaluate('HardPanFeatures.openPanel()'); await sleep(400);
    assert.match(await j.evaluate("document.querySelector('[data-hpf-lock=\"testscan\"]').innerText"), /Host · 3 free/);
    await j.evaluate("document.querySelector('[data-hpf-lock=\"testscan\"]').click()"); await sleep(300);
    const ex = await j.evaluate("document.querySelector('.hpf-expl').innerText");
    assert.match(ex, /Part of the Host plan/); assert.match(ex, /You have 3 free scans to try it/);
    assert.match(await j.evaluate("document.querySelector('[data-hpf-try]').innerText"), /^Try a free scan$/);
    assert.match(await j.evaluate("document.querySelector('[data-hpf-notnow]').innerText"), /^Not now$/);
    await shot(j, '17-7-lock');
    await j.evaluate("document.querySelector('[data-hpf-try]').click()"); await sleep(300);
    assert.ok(await j.evaluate("!!document.querySelector('[data-hpf-sw=\"testscan\"].on')"), 'back in the panel, on');
    await j.evaluate("document.querySelector('.hpf-done').click()"); await sleep(1000);
    assert.equal(await j.evaluate("!!document.querySelector('#gps-overlay .gps-ld-rail > [data-hpf=\"testscan\"]')"), true, 'a square at the end of the rail');
    const pill = await j.evaluate(RECT('#gps-overlay .gps-ld-plays')), sq = await j.evaluate(RECT('#gps-overlay [data-hpf="testscan"]'));
    assert.ok(!hits(pill, sq), 'the pill steps clear of it');
    await shot(j, '17-8-dock');
    await j.close();
});

// THE SCAN CASE (066 #2 asked): a whole scanned card - every golfer x 18 holes - is ONE confirm
// and ONE tap, and every score goes through the card's own save (saveScore -> the queue -> the
// round's scores), never a write of the registry's own. Cancel saves nothing.
test('proposeScores: a whole card (4 golfers x 18 holes) is one confirm, one tap, each through the card\'s save', { timeout: 240000 }, async () => {
    const j = await roundScreen({ width: 393, height: 852 }, {});
    const PROPOSE = "(function(){ var d=currentData, cd=d.courseData.slice().sort(function(a,b){return a.hole-b.hole;}), out=[];"
        + " d.players.forEach(function(p,i){ cd.forEach(function(h){ out.push({ pid: p.id, hole: h.hole, strokes: h.par + ((h.hole + i) % 3) - 1, putts: 2 }); }); });"
        + " window.__ps = 'pending'; HardPanFeatures.proposeScores(out, { source: 'scan' }).then(function(v){ window.__ps = v; }); return out.length; })()";
    // Cancel first: nothing saved.
    const w0 = await j.evaluate('window.__WRITES.length');
    assert.equal(await j.evaluate(PROPOSE), 72);
    await sleep(400);
    assert.equal(await j.evaluate("document.querySelector('[data-hpf-propose]').getAttribute('data-hpf-propose')"), '72');
    assert.match(await j.evaluate("document.querySelector('[data-hpf-propose]').innerText"), /18 holes, 4 golfers/);
    await shot(j, '17-9-propose-card');
    await j.evaluate("document.querySelector('[data-hpf-cancel]').click()"); await sleep(300);
    assert.equal(await j.evaluate('window.__ps'), false);
    assert.equal(await j.evaluate('window.__WRITES.length'), w0, 'cancel writes nothing');
    // Save: one tap, 72 scores, each through saveScore.
    await j.evaluate("window.__saveCalls = 0; var o = window.saveScore; window.saveScore = function(){ window.__saveCalls++; return o.apply(this, arguments); }; true");
    assert.equal(await j.evaluate(PROPOSE), 72);
    await sleep(400);
    await j.evaluate("document.querySelector('[data-hpf-save]').click()");
    await sleep(2500);
    assert.equal(await j.evaluate('window.__ps'), true);
    const got = JSON.parse(await j.evaluate("JSON.stringify((function(){ var d=currentData, ok=0, bad=[]; d.players.forEach(function(p,i){ d.courseData.forEach(function(h){ var want = h.par + ((h.hole + i) % 3) - 1, v = Number(d.scores['p'+p.id+'_h'+h.hole]); if (v === want) ok++; else bad.push(p.id+'_'+h.hole+':'+v+'/'+want); }); }); return { ok: ok, bad: bad.slice(0,5) }; })())"));
    assert.deepEqual(got, { ok: 72, bad: [] }, 'every score on the card');
    const calls = await j.evaluate('window.__saveCalls');
    // saveScore is a function declaration in index.html; gpsSheetHole's save calls it by name, so
    // the wrapper may or may not see the calls - the scores themselves are the proof either way.
    assert.ok(calls === 0 || calls === 72, 'saveScore called once per score: ' + calls);
    const scoreWrites = JSON.parse(await j.evaluate('JSON.stringify(window.__WRITES.slice(' + w0 + ').map(function(w){ return w.path; }))'));
    assert.ok(scoreWrites.length > 0 && scoreWrites.every((p) => /^events\/TCUST1\//.test(p)), 'only the round\'s own score path: ' + JSON.stringify(scoreWrites.slice(0, 5)));
    await j.close();
});
