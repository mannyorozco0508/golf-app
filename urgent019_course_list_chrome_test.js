// ============================================================================
// URGENT-019 - THE COURSE & TEES SCREEN PICKS THE COURSE THAT WORKS, IN REAL CHROME (phone GPS mode).
//
// Manny, 2:47 AM on the Cmd+R build: Talking Stick (from NEAR YOU) "isn't mapped"; Papago "doesn't
// have a scorecard". On the phone the GPS is GolfAPI's (osm off, live on): the directory's
// "Talking Stick Golf Club (Piipaash)" has no GPS there and no tees, the app's GolfAPI
// "Talking Stick Golf Club (South - Piipaash)" has both - and NEAR YOU never listed it (the course
// list was worked out before the GPS course files were in, and kept). Papago has no card at all.
//   1  at Talking Stick: the GolfAPI course is picked (✓ GPS, its tees); the directory twin is gone
//      from NEAR YOU; O'odham (no GolfAPI twin) stays, without ✓ GPS.
//   2  Papago: Start GPS says so and offers "Enter the pars ›" - not a dead end, no endless "Loading".
// Synthetic course data only (the GolfAPI file is licensed for the app, never the repo).
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
const TEE = (name, y, r, sl) => ({ name, rating: r, slope: sl, parTotal: 71, totalYards: y, holes: CD.map((h) => ({ par: h.par, yardage: Math.round(y / 18) })) });
const ID = '990000000000000001';
const GC = { ['gapi_' + ID]: { name: 'Talking Stick Golf Club (South - Piipaash)', data: CD, tees: { male: [TEE('Black', 6800, 72.6, 129), TEE('Gold', 6400, 70.6, 124), TEE('Jade', 5800, 68.0, 115)] },
    location: { city: 'Scottsdale', state: 'AZ', latitude: 33.539874, longitude: -111.870432 } } };
// The app's GolfAPI file, as the iOS build ships it (shape only, made-up numbers).
const GAPI = { v: 1, built: 'test', links: {}, courses: { [ID]: { id: ID, club: 'Talking Stick Golf Club', course: 'South - Piipaash', city: 'Scottsdale', state: 'AZ', lat: 33.539874, lng: -111.870432, holes: 18,
    // hole 1's tee and green (made-up points on the course): ✓ GPS needs a green within 2 km (URGENT-022)
    h: { 1: { g: { f: [33.5445, -111.8690], c: [33.5444, -111.8691], b: [33.5443, -111.8692] }, t: { b: [33.5467, -111.8663], f: [33.5460, -111.8678] } } } } } };
// 086 (Manny, Oct 26): "✓ GPS" needs a green on EVERY hole - the made-up hole 1 stands for holes 2-18 too.
for (let i = 2; i <= 18; i++) GAPI.courses[ID].h[i] = GAPI.courses[ID].h[1];
// Phone GPS mode: GolfAPI is the GPS (gps-live on), as on the iOS build.
const PHONE = "Object.defineProperty(window, 'HardPanGpsLive', { configurable: true, get: function () { return { on: function () { return true; } }; }, set: function () {} });"
    + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';';
const X = (e) => ({ expression: e });
const ROWS = "JSON.stringify({ head: (document.querySelector('#sf-course')||{}).innerText||'', key: document.getElementById('course-select').value, rows: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-course]'), function (b) { return b.getAttribute('data-sf-course') + ' | ' + b.innerText.replace(/\\n/g,' | '); }), tees: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-tee]'), function(b){return b.innerText.split('\\n')[0];}), text: (document.getElementById('sf')||{}).innerText||'' })";
const open = (lat, lon, more) => arriveCold({ url: fileUrl('admin.html', 'start=quick'), db: { events: {}, global_courses: GC, trips: {}, tournaments: {}, organizers: {} }, settleMs: 2500, viewport: { width: 393, height: 852 },
    preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + PHONE + "try{sessionStorage.setItem('hardpan_simple_flow','gps');}catch(e){}", steps: [
        { cdp: { method: 'Emulation.setGeolocationOverride', params: { latitude: lat, longitude: lon, accuracy: 10 } } },
        { cdp: { method: 'Browser.grantPermissions', params: { permissions: ['geolocation'] } } },
        { sleep: 2500 }, X("(function(){ var b=document.querySelector('[data-sf=relocate]'); if(b) b.click(); return 'relocate'; })()"),
        { waitFor: "document.querySelectorAll('#sf [data-sf-course]').length > 0 || !!document.querySelector('#sf [data-sf-playing]')", timeout: 40000 }, { sleep: 3000 }, X(ROWS),
        // 076 (option A): the course he is at is the PLAYING card alone - Change shows NEAR YOU (the rows below)
        X("(function(){ var b=document.querySelector('#sf-course [data-sf=change]'); if(b) b.click(); return b ? 'change' : 'no card'; })()"), { sleep: 1000 }, X(ROWS)].concat(more || []) });
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));

test('Talking Stick: the GolfAPI course is picked (✓ GPS, Black / Gold / Jade); its directory twin is not listed; O\'odham stays without ✓ GPS', { timeout: 120000 }, async () => {
    const r = await open(33.5399, -111.8704);
    assert.equal(r.ok, true, r.reason);
    const [card, s] = J(r);
    assert.equal(card.key, 'gapi_' + ID);
    assert.match(card.head, /^PLAYING\nChange\nSouth - Piipaash\nYou’re here · Talking Stick Golf Club · Scottsdale, AZ · 0\.0 mi · ✓ GPS$/, '076: the PLAYING card');
    assert.deepEqual(card.rows, [], '076: alone');
    assert.deepEqual(card.tees, ['Black', 'Gold', 'Jade']);
    assert.equal(s.key, 'gapi_' + ID);
    // URGENT-060: the picked course is the first NEAR YOU row, "You're here" (no second card).
    assert.match(s.rows[0], /^gapi_990000000000000001 \| Talking Stick Golf Club \(South - Piipaash\) \| You’re here · 0\.0 mi · ✓ GPS$/);
    assert.ok(!s.rows.some((x) => /^az_talking_piipaash /.test(x)), 'the directory twin is gone: ' + JSON.stringify(s.rows));
    const ood = s.rows.filter((x) => /^az_talking_oodham /.test(x))[0];
    assert.ok(ood && !/✓ GPS/.test(ood), 'O\'odham listed, honestly without ✓ GPS: ' + JSON.stringify(s.rows));
});

test('Papago (no card, no online lookup here): said plainly - Pick another course · Request this course · small "Enter pars yourself"; never an endless "Loading"', { timeout: 120000 }, async () => {
    const r = await open(33.4560, -111.9480, [
        X("(function(){ var b=document.querySelector('#sf [data-sf-course=\"az_papago\"]'); if(!b) return 'NO ROW'; b.click(); return 'tapped'; })()"), { sleep: 1500 },
        X("(function(){ var b=document.querySelector('[data-sf=\"startgps\"]'); if(b) b.click(); return 'start'; })()"),
        { waitFor: "/isn.t in our course data yet/.test((document.getElementById('sf-lookup')||{}).innerText||'')", timeout: 45000 }, X(ROWS),
        { tap: '[data-sf="enterpars"]' }, { sleep: 800 },
        X("JSON.stringify({ away: getComputedStyle(document.getElementById('sf')).display === 'none', ret: !!document.getElementById('sf-return'), step: typeof currentWizardStep !== 'undefined' ? currentWizardStep : null })")]);
    assert.equal(r.ok, true, r.reason);
    const [, s0, s, away] = J(r);   // (076: the first snapshot is before the Change step - no card here)
    assert.ok(!/✓ GPS/.test(s0.rows.filter((x) => /^az_papago /.test(x))[0] || ''), 'Papago never shows ✓ GPS');
    assert.equal(s.key, 'az_papago');
    assert.match(s.text, /Papago Golf Club isn’t in our course data yet\.\nPick another course\nRequest this course\nEnter pars yourself/);
    assert.ok(!/Enter the pars ›/.test(s.text), 'no big "Enter the pars" button');
    assert.doesNotMatch(s.text, /Loading the course card/);
    assert.equal(away.away, true, '"Enter pars yourself" still opens Round Setup\'s own course card');
    assert.equal(away.ret, true, 'with the way back to Start');
});
