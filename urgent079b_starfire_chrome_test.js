// ============================================================================
// URGENT-079b - STARFIRE'S GOLFAPI COURSES AS THEIR OWN ROWS (Manny, Oct 26: "show Starfire King 18 and Starfire
// Mulligan as their OWN two rows, King 18 first, NOT under 'Search more'").
//   1  "starfire": GolfAPI's King 18, then Mulligan (✓ GPS), then our "Starfire Golf Club · Tap to load" (kept, right
//      after them); ONE search for the club's name; a phone that has the answer: 0 searches, the same rows.
//   2  Nothing else moves: Talking Stick (2 courses) and "Arizo" as in 079; a course of ours WITH a card asks nothing.
// The Cloud Functions are stood in at fetch. No network, no GolfAPI call. Synthetic cards.
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
const AZ_ID = '012141520640060450343';
// GolfAPI's answer for "ariz" / "arizona" (the shape gpsSearch returns; synthetic ids except Arizona CC's).
const W = (id, club, course, city, gps) => ({ id, club, course, name: club + (course && course !== club ? ' (' + course + ')' : ''), city, state: 'AZ', holes: 18, gps: gps !== false, cached: true });
const ARIZ = [W('790000000000000001', 'Arizona Biltmore Golf Club', 'Adobe', 'Phoenix'), W('790000000000000002', 'Arizona Biltmore Golf Club', 'Links', 'Phoenix'),
    W('790000000000000003', 'Arizona Golf Resort', 'Championship', 'Mesa'), W('790000000000000004', 'Arizona Grand Golf Course', 'Arizona Grand', 'Phoenix'),
    W(AZ_ID, 'The Arizona Country Club', 'The Arizona', 'Phoenix')];
const AZCC = [W(AZ_ID, 'The Arizona Country Club', 'The Arizona', 'Phoenix')];
const TS = [W('012141520639939791440', 'Talking Stick Golf Club', 'South - Piipaash', 'Scottsdale'), W('01214152063997488954', 'Talking Stick Golf Club', 'North - O Odham', 'Scottsdale')];
const STARFIRE = [W('790000000000000011', 'Starfire Golf Club', 'King 18', 'Scottsdale'), W('790000000000000012', 'Starfire Golf Club', 'Mulligan', 'Scottsdale')];
const B = (id, course, gps, club) => ({ id, club: club || 'Bandon Dunes Golf Resort', course, name: (club || 'Bandon Dunes Golf Resort') + ' (' + course + ')', city: 'Bandon', state: 'OR', holes: 18, gps, cached: false });
const BANDON = [B('01214152103626290926', 'Bandon Crossings', true, 'Bandon Crossings Golf Course'), B('012141521036241695493', 'Bandon Dunes', true), B('0121658411581759626', 'Bandon Preserve', true),
    B('012141521036311111134', 'Bandon Trails', true), B('012141521036345307035', 'Old McDonald', true), B('012141521036276501913', 'Pacific Dunes', true), B('0121591635972407933', 'Sheep Ranch', false)];
const SAVED = { 'starfire golf club': STARFIRE, ariz: ARIZ, arizona: ARIZ, 'arizona country club': AZCC, 'the arizona country club': AZCC, 'talking stick': TS, starfire: STARFIRE, bandon: BANDON };
// GolfAPI's Arizona CC: the shared card (a NAME-ONLY list record on a normal load: no location) + its GPS record.
const AZ_REC = { name: 'The Arizona Country Club (The Arizona)', data: CD, tees: { male: [TEE('Blue', 6720, 72.4, 131), TEE('White', 6397, 70.9, 127), TEE('Green', 5930, 68.8, 120)] },
    source: { provider: 'golfapi', providerCourseId: AZ_ID } };
const hole = (i) => ({ t: { b: [33.4814 + i * 0.0004, -111.9580 + i * 0.0003] }, g: { c: [33.4836 + i * 0.0004, -111.9537 + i * 0.0003], f: [33.4835 + i * 0.0004, -111.9538 + i * 0.0003], b: [33.4837 + i * 0.0004, -111.9536 + i * 0.0003] } });
const AZ_GPS = { id: AZ_ID, club: 'The Arizona Country Club', course: 'The Arizona', city: 'Phoenix', state: 'AZ', lat: 33.4806, lng: -111.9599, holes: 18, h: {} };
for (let i = 1; i <= 18; i++) AZ_GPS.h[i] = hole(i - 1);
// (no hole data in a Mesa-side record: a course with no point of its own is never placed by name)
const FUNCS = (pulled) => "(function(){ window.__fn = []; var of = window.fetch; var SAVED = " + JSON.stringify(SAVED) + ", REC = " + JSON.stringify(AZ_REC) + ", GPS = " + JSON.stringify(AZ_GPS) + ";"
    + " window.fetch = function (u, init) { var s = String(u); if (/interpreter|overpass/.test(s)) return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ elements: [] }); } });"
    + "  if (/firebaseio\\.com/.test(s)) return Promise.resolve(null);"
    + "  var m = /cloudfunctions\\.net\\/(gps\\w+)$/.exec(s); if (!m) return of.apply(this, arguments);"
    + "  var data = JSON.parse(init.body).data; window.__fn.push([m[1], data]); var res;"
    + "  if (m[1] === 'gpsSearch') { var k = String(data.name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); res = Promise.resolve({ status: 'ok', results: SAVED[k] || [] }); }"
    + "  else if (m[1] === 'gpsCourse' && data.courseId === '" + AZ_ID + "') res = firebase.database().ref('global_courses/gapi_" + AZ_ID + "').set(Object.assign({ location: { city: 'Phoenix', state: 'AZ', latitude: 33.4806, longitude: -111.9599 } }, REC)).then(function () { return firebase.database().ref('gps_courses/" + AZ_ID + "').set(GPS); }).then(function () { return { status: 'ready', cardKey: 'gapi_" + AZ_ID + "', course: GPS }; });"
    + "  else res = Promise.resolve({ status: 'nogps' });"
    + "  return res.then(function (r) { return new Promise(function (ok) { setTimeout(function () { ok({ json: function () { return Promise.resolve({ result: r }); } }); }, 300); }); }); };"
    + " setInterval(function () { try { var a = firebase.auth().currentUser; if (a && !a.getIdToken) a.getIdToken = function () { return Promise.resolve('stand-in'); }; } catch (e) {} }, 100);"
    + "})();"
    + "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{liveTest:true});}});})();";
const X = (e) => ({ expression: e });
const TYPE = (v) => X("(function(){ var i=document.getElementById('sf-q'); if(!i) return 'NO BOX'; i.focus(); i.value=" + JSON.stringify(v) + "; i.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()");
const CHANGE = X("(function(){ var b=document.querySelector('#sf-course [data-sf=change]'); if(b) b.click(); return b ? 'change' : 'NO CHANGE'; })()");
const TAP = (sel) => X("(function(){ var b=document.querySelector(" + JSON.stringify(sel) + "); if(b) b.click(); return b ? 'tapped' : 'NO ROW'; })()");
const SNAP = "JSON.stringify((function(){ var sf=document.getElementById('sf'), card=document.querySelector('#sf [data-sf-playing]');"
    + " var rows=Array.prototype.map.call(sf.querySelectorAll('[data-sf-course], [data-sf-web], [data-sf-osm]'), function(b){ return (b.getAttribute('data-sf-osm') != null ? 'OSM ' : b.getAttribute('data-sf-web') ? 'WEB ' : 'LOCAL ') + b.innerText.replace(/\\n/g,' | '); });"
    + " var tees=Array.prototype.map.call(sf.querySelectorAll('[data-sf-tee]'), function(b){ return b.innerText.replace(/\\n/g,' '); });"
    + " return { key: document.getElementById('course-select').value, rows: rows, tees: tees, text: sf.innerText, card: card ? { text: card.innerText.replace(/\\n/g,' | '), here: card.getAttribute('data-sf-playing-here') === '1' } : null,"
    + "  fn: (window.__fn||[]).filter(function(c){ return c[0] === 'gpsSearch'; }).map(function(c){ return c[1].name; }), pulls: (window.__fn||[]).filter(function(c){ return c[0] === 'gpsCourse'; }).map(function(c){ return c[1].courseId; }) }; })())";
const MANNY = [33.4900, -111.9520];        // Manny's house: OSM's Arizona CC point 0.4 mi, GolfAPI's holes within 0.5 mi
const AWAY = [33.4300, -112.5800];         // no course within miles
const BANDON_AT = [43.1500, -124.3000];    // near Bandon, on no course
const SEED = (k, rows) => "try{localStorage.setItem('hardpan_websearch_" + k + "', JSON.stringify({ at: Date.now(), results: " + JSON.stringify(rows) + " }));}catch(e){}";
const open = (at, steps, opts) => {
    opts = opts || {};
    const gc = Object.assign(opts.pulled === false ? {} : { ['gapi_' + AZ_ID]: AZ_REC }, opts.gc || {});
    const gps = Object.assign(opts.pulled === false || opts.noGps ? {} : { [AZ_ID]: AZ_GPS }, opts.gps || {});
    return arriveCold({ url: fileUrl('admin.html', 'start=quick'), db: { events: {}, global_courses: gc, gps_courses: gps, gps_links: {}, trips: {}, tournaments: {}, organizers: {} }, settleMs: 2500, viewport: { width: 393, height: 852 },
        preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + FUNCS() + (opts.seed || '') + "try{sessionStorage.setItem('hardpan_simple_flow','gps');}catch(e){}"
            + "if (/admin\\.html$/.test(location.pathname)) document.addEventListener('DOMContentLoaded', function () { var s = document.createElement('script'); s.src = 'gps-live.js'; document.head.appendChild(s); });", steps: [
            { cdp: { method: 'Emulation.setGeolocationOverride', params: { latitude: at[0], longitude: at[1], accuracy: 10 } } },
            { cdp: { method: 'Browser.grantPermissions', params: { permissions: ['geolocation'] } } },
            { sleep: 2500 }, X("(function(){ var b=document.querySelector('[data-sf=relocate]'); if(b) b.click(); return 'relocate'; })()"),
            { waitFor: "!!window.HardPanGpsLive && (document.querySelectorAll('#sf [data-sf-course]').length > 0 || !!document.querySelector('#sf [data-sf-playing]'))", timeout: 40000 }, { sleep: 2500 }].concat(steps) });
};
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const osmAzcc = (rows) => rows.filter((x) => /^OSM Arizona Country Club /.test(x));
const azRows = (rows) => rows.filter((x) => /Arizona Country Club/.test(x));
const mi = (t) => { const m = /([\d.]+) mi/.exec(t); return m ? Number(m[1]) : null; };


const rowsOf = (s, re) => s.rows.filter((x) => re.test(x));
test('"starfire": GolfAPI\'s King 18 then Mulligan as their own rows (✓ GPS), our "Starfire Golf Club · Tap to load" right after them; one search for the club; 0 when the phone has the answer', { timeout: 200000 }, async () => {
    const r = await open(AWAY, [CHANGE, { sleep: 300 }, TYPE('starfire'), { waitFor: "document.querySelectorAll('#sf [data-sf-web]').length >= 2", timeout: 15000 }, { sleep: 800 }, X(SNAP)]);
    assert.equal(r.ok, true, r.reason);
    const [s] = J(r);
    const st = rowsOf(s, /Starfire|King 18|Mulligan/);
    assert.match(st[0], /^WEB King 18 \| Starfire Golf Club · Scottsdale, AZ \| .*✓ GPS$/, 'King 18 first: ' + JSON.stringify(s.rows));
    assert.match(st[1], /^WEB Mulligan \| Starfire Golf Club · Scottsdale, AZ \| .*✓ GPS$/, 'Mulligan second: ' + JSON.stringify(s.rows));
    assert.match(st[2], /^LOCAL Starfire Golf Club \| /, 'our row kept, right after them (only add): ' + JSON.stringify(s.rows));
    assert.equal(st.length, 3);
    assert.doesNotMatch(s.text, /Search more courses[\s\S]*King 18/, 'not under Search more');
    assert.deepEqual(s.fn, ['Starfire Golf Club'], 'one search, for the club');
    const k = await open(AWAY, [CHANGE, { sleep: 300 }, TYPE('starfire'), { waitFor: "document.querySelectorAll('#sf [data-sf-web]').length >= 2", timeout: 15000 }, { sleep: 800 }, X(SNAP)],
        { seed: "try{localStorage.setItem('hardpan_webclub_starfire', JSON.stringify({ at: Date.now(), results: " + JSON.stringify(STARFIRE) + " }));}catch(e){}" });
    assert.equal(k.ok, true, k.reason);
    const [c] = J(k);
    assert.deepEqual(rowsOf(c, /Starfire|King 18|Mulligan/).map((x) => x.split(' |')[0]), ['WEB King 18', 'WEB Mulligan', 'LOCAL Starfire Golf Club']);
    assert.deepEqual(c.fn, [], 'the phone\'s answer: 0 searches');
});

test('nothing else moves: "Arizo" at Manny\'s house - one GolfAPI row first, 0 searches (the Biltmore "Tap to load" rows only START with the text: no club search)', { timeout: 200000 }, async () => {
    const r = await open(MANNY, [{ waitFor: "!!document.querySelector('#sf [data-sf-playing]')", timeout: 20000 }, CHANGE, { sleep: 600 }, TYPE('Arizo'), { sleep: 3500 }, X(SNAP)]);
    assert.equal(r.ok, true, r.reason);
    const [a] = J(r);
    assert.match(a.rows[0], /The Arizona Country Club.*✓ GPS$/, JSON.stringify(a.rows));
    assert.deepEqual(a.fn, []);
    assert.ok(a.rows.some((x) => /^LOCAL Adobe \| Arizona Biltmore/.test(x)), 'the Biltmore rows as before: ' + JSON.stringify(a.rows));
});
