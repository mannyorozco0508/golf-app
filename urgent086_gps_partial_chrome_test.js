// ============================================================================
// 086 (Manny, Oct 26) - "✓ GPS" ONLY WHEN EVERY HOLE HAS A GREEN - IN REAL CHROME (phone GPS mode).
// After Las Colinas (a course check control that turned out to have all 18 greens), Manny: "✓ GPS only
// when every hole has a green. Greens on some holes: GPS · N of 18 holes; those holes use 'Tap the middle
// of the green'. List, NEAR YOU, results and the PLAYING card, GolfAPI and OSM alike."
//   1  every hole has a green: the PLAYING card and NEAR YOU say "✓ GPS"
//   2  greens on holes 1-9 only: "GPS · 9 of 18 holes" on both - never "✓ GPS"
//   3  a GPS record with no greens at all: no mark (no ✓, no "GPS ·")
//   4  an online result not loaded on this phone yet keeps GolfAPI's own "✓ GPS" (Manny, Oct 26)
// The Cloud Functions are stood in at fetch. No network, no GolfAPI call. Synthetic card and points,
// in open desert (no other course within miles).
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'simple-flow.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const CD = makeCourseData(18);
const TEE = (name, y, r, sl) => ({ name, rating: r, slope: sl, parTotal: 72, totalYards: y, holes: CD.map((h) => ({ par: h.par, yardage: Math.round(y / 18) })) });
const ID = '086000000000000000077';
const AT = [33.4300, -112.5800];
const REC = { name: 'Fixture Mesa Golf Club', data: CD, tees: { male: [TEE('Blue', 6720, 72.4, 131), TEE('White', 6397, 70.9, 127)] },
    location: { city: 'Buckeye', state: 'AZ', latitude: AT[0], longitude: AT[1] }, source: { provider: 'golfapi', providerCourseId: ID } };
const hole = (i, green) => ({ t: { b: [AT[0] + i * 0.0006, AT[1] + i * 0.0004] }, g: green ? { c: [AT[0] + 0.0025 + i * 0.0006, AT[1] + i * 0.0004], f: [AT[0] + 0.0024 + i * 0.0006, AT[1] + i * 0.0004], b: [AT[0] + 0.0026 + i * 0.0006, AT[1] + i * 0.0004] } : {} });
const GPS = (greenUpTo) => { const h = {}; for (let i = 1; i <= 18; i++) h[i] = hole(i - 1, i <= greenUpTo); return { id: ID, club: 'Fixture Mesa Golf Club', course: 'Fixture Mesa', city: 'Buckeye', state: 'AZ', lat: AT[0], lng: AT[1], holes: 18, h }; };
const WEB = [{ id: '086000000000000000088', club: 'Fixture Online Golf Club', course: 'Fixture Online', name: 'Fixture Online Golf Club', city: 'Buckeye', state: 'AZ', holes: 18, gps: true, cached: true }];
const FUNCS = "(function(){ var of = window.fetch; var WEB = " + JSON.stringify(WEB) + ";"
    + " window.fetch = function (u, init) { var s = String(u); if (/interpreter|overpass/.test(s)) return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ elements: [] }); } });"
    + "  if (/firebaseio\\.com/.test(s)) return Promise.resolve(null);"
    + "  var m = /cloudfunctions\\.net\\/(gps\\w+)$/.exec(s); if (!m) return of.apply(this, arguments);"
    + "  var res = m[1] === 'gpsSearch' ? { status: 'ok', results: /online/i.test(JSON.parse(init.body).data.name) ? WEB : [] } : { status: 'nogps' };"
    + "  return new Promise(function (ok) { setTimeout(function () { ok({ json: function () { return Promise.resolve({ result: res }); } }); }, 200); }); };"
    + " setInterval(function () { try { var a = firebase.auth().currentUser; if (a && !a.getIdToken) a.getIdToken = function () { return Promise.resolve('stand-in'); }; } catch (e) {} }, 100);"
    + "})();"
    + "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{liveTest:true});}});})();";
const X = (e) => ({ expression: e });
const CHANGE = X("(function(){ var b=document.querySelector('#sf-course [data-sf=change]'); if(b) b.click(); return b ? 'change' : 'NO CHANGE'; })()");
const TYPE = (v) => X("(function(){ var i=document.getElementById('sf-q'); if(!i) return 'NO BOX'; i.focus(); i.value=" + JSON.stringify(v) + "; i.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()");
const SNAP = "JSON.stringify((function(){ var sf=document.getElementById('sf'), card=document.querySelector('#sf [data-sf-playing]');"
    + " var rows=Array.prototype.map.call(sf.querySelectorAll('[data-sf-course], [data-sf-web]'), function(b){ return (b.getAttribute('data-sf-web') ? 'WEB ' : 'LOCAL ') + b.innerText.replace(/\\n/g,' | '); });"
    + " return { key: document.getElementById('course-select').value, rows: rows, text: sf.innerText, card: card ? card.innerText.replace(/\\n/g,' | ') : null }; })())";
const open = (gps, steps) => arriveCold({ url: fileUrl('admin.html', 'start=quick'), db: { events: {}, global_courses: { ['gapi_' + ID]: REC }, gps_courses: gps ? { [ID]: gps } : {}, gps_links: {}, trips: {}, tournaments: {}, organizers: {} },
    settleMs: 2500, viewport: { width: 393, height: 852 },
    preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + FUNCS + "try{sessionStorage.setItem('hardpan_simple_flow','gps');}catch(e){}"
        + "if (/admin\\.html$/.test(location.pathname)) document.addEventListener('DOMContentLoaded', function () { var s = document.createElement('script'); s.src = 'gps-live.js'; document.head.appendChild(s); });",
    steps: [
        { cdp: { method: 'Emulation.setGeolocationOverride', params: { latitude: AT[0], longitude: AT[1], accuracy: 10 } } },
        { cdp: { method: 'Browser.grantPermissions', params: { permissions: ['geolocation'] } } },
        { sleep: 2500 }, X("(function(){ var b=document.querySelector('[data-sf=relocate]'); if(b) b.click(); return 'relocate'; })()"),
        { waitFor: "!!window.HardPanGpsLive && (document.querySelectorAll('#sf [data-sf-course]').length > 0 || !!document.querySelector('#sf [data-sf-playing]'))", timeout: 40000 }, { sleep: 2500 }].concat(steps) });
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const mine = (rows) => rows.filter((x) => /^LOCAL Fixture Mesa/.test(x));

async function cardAndNear(gps) {
    const r = await open(gps, [{ waitFor: "!!document.querySelector('#sf [data-sf-playing]')", timeout: 20000 }, { sleep: 500 }, X(SNAP), CHANGE, { sleep: 800 }, X(SNAP)]);
    assert.equal(r.ok, true, r.reason);
    const [a, b] = J(r);
    assert.ok(a.card, 'the PLAYING card: ' + a.text);
    assert.equal(a.key, 'gapi_' + ID, 'the fixture course is picked: ' + a.key);
    assert.equal(mine(b.rows).length, 1, 'NEAR YOU lists it once: ' + JSON.stringify(b.rows));
    return { card: a.card, near: mine(b.rows)[0] };
}

test('1 every hole has a green: the PLAYING card and NEAR YOU say "✓ GPS"', { timeout: 150000 }, async () => {
    const { card, near } = await cardAndNear(GPS(18));
    assert.match(card, /You’re here · .* · ✓ GPS$/, card);
    assert.match(near, /✓ GPS$/, near);
    assert.doesNotMatch(card + near, /of 18 holes/);
});

test('2 greens on holes 1-9 only: "GPS · 9 of 18 holes" on the PLAYING card and NEAR YOU - never "✓ GPS"', { timeout: 150000 }, async () => {
    const { card, near } = await cardAndNear(GPS(9));
    assert.match(card, /You’re here · .* · GPS · 9 of 18 holes$/, card);
    assert.match(near, /GPS · 9 of 18 holes$/, near);
    assert.doesNotMatch(card + near, /✓ GPS/);
});

test('3 a GPS record with no greens at all: no mark - no "✓ GPS", no "GPS ·"', { timeout: 150000 }, async () => {
    const { card, near } = await cardAndNear(GPS(0));
    assert.doesNotMatch(card + ' ' + near, /✓ GPS|GPS ·/, card + ' / ' + near);
});

test('4 an online result not loaded on this phone keeps GolfAPI\'s own "✓ GPS"', { timeout: 150000 }, async () => {
    const r = await open(GPS(18), [{ waitFor: "!!document.querySelector('#sf [data-sf-playing]')", timeout: 20000 }, CHANGE, { sleep: 600 }, TYPE('fixture online'), { sleep: 4000 }, X(SNAP)]);
    assert.equal(r.ok, true, r.reason);
    const [s] = J(r);
    const web = s.rows.filter((x) => /^WEB .*Fixture Online/.test(x));
    assert.equal(web.length, 1, 'the online row: ' + JSON.stringify(s.rows));
    assert.match(web[0], /✓ GPS/, web[0]);
});
