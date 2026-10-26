// ============================================================================
// URGENT-079 - THE GOLFAPI COURSE ALWAYS WINS OVER ITS OPENSTREETMAP COPY - IN REAL CHROME (phone GPS mode).
// Manny, Oct 26 7:28 AM: "How do I not have Arizona Country Club? I literally live next to it." Typing "Arizo"
// showed OSM's "Arizona Country Club · 0.4 mi · Scottsdale · Not set up yet", and the tap opened the OSM copy
// (par-4 card, no tees). GolfAPI's "The Arizona Country Club" (Phoenix, ✓ GPS, 6 tees) was in the shared list,
// but placed 17 mi away in Mesa: a name-only record borrowed the point of a "same club" course ("arizona" =
// "Arizona Golf Resort").
//   1  At his house: the auto-pick / "You're here" PLAYING card is GolfAPI's course, ✓ GPS, with TEES; NEAR YOU
//      lists it first, "You're here", ✓ GPS.
//   2  "Arizo": ONE row for the course - GolfAPI's, first, ✓ GPS, 0 online searches; no OSM "Arizona Country Club";
//      OSM's "Arizona Golf Resort" (Mesa, a different course) still shows (no over-merge).
//   3  Never pulled (not in the list): saved-first uses the phone's cached "ariz" answer (0 calls) - the GolfAPI
//      row, ✓ GPS, no OSM twin; "arizona country club" online: the same.
//   4  The OSM row (when it is the only row) opens GolfAPI's course: the PLAYING card, ✓ GPS, TEES.
//   5  No over-merge: Talking Stick North + South, Starfire King 18 + Mulligan, Bandon's GolfAPI rows all stay;
//      an OSM-only course (Shortys, Elite Golf Schools) still shows.
// The Cloud Functions are stood in at fetch. No network, no GolfAPI call. Synthetic cards and points.
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
const SAVED = { ariz: ARIZ, arizona: ARIZ, 'arizona country club': AZCC, 'the arizona country club': AZCC, 'talking stick': TS, starfire: STARFIRE, bandon: BANDON };
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

test('at Manny\'s house: the auto-pick / "You\'re here" card is GolfAPI\'s The Arizona Country Club (✓ GPS, TEES); NEAR YOU lists it first, "You\'re here", ✓ GPS', { timeout: 150000 }, async () => {
    const r = await open(MANNY, [{ waitFor: "document.querySelectorAll('#sf [data-sf-tee]').length > 0", timeout: 20000 }, { sleep: 500 }, X(SNAP), CHANGE, { sleep: 700 }, X(SNAP)]);
    assert.equal(r.ok, true, r.reason);
    const [a, b] = J(r);
    assert.ok(a.card, 'the PLAYING card: ' + a.text);
    assert.equal(a.key, 'gapi_' + AZ_ID, 'the GolfAPI copy is the course picked');
    assert.equal(a.card.here, true, '"You\'re here"');
    assert.match(a.card.text, /The Arizona Country Club/);
    assert.match(a.card.text, /You’re here · Phoenix, AZ · [\d.]+ mi · ✓ GPS$/, a.card.text);
    assert.deepEqual(a.tees.map((t) => t.split(' ')[0]), ['Blue', 'White', 'Green'], 'its tees: ' + JSON.stringify(a.tees));
    assert.doesNotMatch(a.text, /OpenStreetMap|par 4 shown/, 'not the OSM copy');
    assert.match(b.rows[0], /^LOCAL The Arizona Country Club(?: \(The Arizona\))? \| You’re here · [\d.]+ mi · ✓ GPS$/, 'NEAR YOU first: ' + JSON.stringify(b.rows));
    assert.ok(mi(b.rows[0]) < 1, 'its own distance (not Mesa\'s 17 mi): ' + b.rows[0]);
    assert.equal(azRows(b.rows).length, 1, 'once: ' + JSON.stringify(b.rows));
});

test('"Arizo" (saved-first, no online search): ONE row for the course - GolfAPI\'s, first, ✓ GPS; no OSM "Arizona Country Club"; OSM "Arizona Golf Resort" (Mesa) still shows', { timeout: 150000 }, async () => {
    const r = await open(MANNY, [{ waitFor: "!!document.querySelector('#sf [data-sf-playing]')", timeout: 20000 }, CHANGE, { sleep: 600 }, TYPE('Arizo'), { sleep: 3500 }, X(SNAP)]);
    assert.equal(r.ok, true, r.reason);
    const [s] = J(r);
    assert.match(s.rows[0], /^LOCAL The Arizona \| The Arizona Country Club · Phoenix, AZ \| [\d.]+ mi · ✓ GPS$|^LOCAL The Arizona Country Club \| Phoenix, AZ \| [\d.]+ mi · ✓ GPS$/, 'GolfAPI\'s row first: ' + JSON.stringify(s.rows));
    assert.equal(azRows(s.rows).length, 1, 'ONE row for Arizona Country Club: ' + JSON.stringify(s.rows));
    assert.deepEqual(osmAzcc(s.rows), [], 'no OSM copy');
    assert.ok(s.rows.some((x) => /^OSM Arizona Golf Resort \| [\d.]+ mi · Mesa, AZ/.test(x)), 'a different course (Mesa) is not merged: ' + JSON.stringify(s.rows));
    assert.deepEqual(s.fn, [], '0 online searches');
    // the tap: the GolfAPI course with its tees
    const t = await open(MANNY, [{ waitFor: "!!document.querySelector('#sf [data-sf-playing]')", timeout: 20000 }, CHANGE, { sleep: 600 }, TYPE('Arizo'), { sleep: 3500 },
        TAP('#sf [data-sf-course="gapi_' + AZ_ID + '"]'), { waitFor: "document.querySelectorAll('#sf [data-sf-tee]').length > 0", timeout: 20000 }, { sleep: 500 }, X(SNAP)]);
    assert.equal(t.ok, true, t.reason);
    const [p] = J(t);
    assert.equal(p.key, 'gapi_' + AZ_ID);
    assert.match(p.card.text, /✓ GPS$/);
    assert.equal(p.tees.length, 3);
});

test('never pulled: saved-first shows the phone\'s cached "ariz" GolfAPI row (0 calls, ✓ GPS) and no OSM twin; "arizona country club" online: the same; its tap = GolfAPI\'s card with tees', { timeout: 200000 }, async () => {
    const r = await open(AWAY, [CHANGE, { sleep: 300 }, TYPE('Arizo'), { sleep: 3500 }, X(SNAP)], { pulled: false, seed: SEED('ariz', ARIZ) });
    assert.equal(r.ok, true, r.reason);
    const [s] = J(r);
    assert.equal(azRows(s.rows).length, 1, 'ONE row: ' + JSON.stringify(s.rows));
    assert.match(azRows(s.rows)[0], /^WEB .*Arizona Country Club.*✓ GPS$/, 'the GolfAPI row: ' + JSON.stringify(s.rows));
    assert.deepEqual(s.fn, [], '0 online searches (the cached shorter answer)');
    const r2 = await open(AWAY, [CHANGE, { sleep: 300 }, TYPE('arizona country club'), { waitFor: "document.querySelectorAll('#sf [data-sf-web]').length >= 1", timeout: 15000 }, { sleep: 800 }, X(SNAP),
        TAP('#sf [data-sf-web="' + AZ_ID + '"]'), { waitFor: "document.querySelectorAll('#sf [data-sf-tee]').length > 0", timeout: 25000 }, { sleep: 600 }, X(SNAP)], { pulled: false });
    assert.equal(r2.ok, true, r2.reason);
    const [o, p] = J(r2);
    assert.equal(azRows(o.rows).length, 1, 'ONE row: ' + JSON.stringify(o.rows));
    assert.match(o.rows[0], /^WEB .*✓ GPS$/, 'GolfAPI first: ' + JSON.stringify(o.rows));
    assert.deepEqual(osmAzcc(o.rows), []);
    assert.equal(p.key, 'gapi_' + AZ_ID, 'pulled: ' + p.text);
    assert.match(p.card.text, /The Arizona/);
    assert.equal(p.tees.length, 3, JSON.stringify(p.tees));
});

test('the OSM row, when it is the only copy on screen, opens GolfAPI\'s course (Scottsdale vs Phoenix, the same name): PLAYING card ✓ GPS with TEES, not the OSM par-4 card', { timeout: 200000 }, async () => {
    const r = await open(AWAY, [CHANGE, { sleep: 300 }, TYPE('Arizo'), { sleep: 3500 }, X(SNAP), TAP('#sf [data-sf-osm="61418760"]'),
        { waitFor: "document.querySelectorAll('#sf [data-sf-tee]').length > 0 || /OpenStreetMap|par 4/.test((document.getElementById('sf')||{}).innerText||'')", timeout: 30000 }, { sleep: 800 }, X(SNAP)], { pulled: false });
    assert.equal(r.ok, true, r.reason);
    const [s, p] = J(r);
    assert.equal(osmAzcc(s.rows).length, 1, 'never pulled, no answer on the phone: the OSM row is the course\'s row: ' + JSON.stringify(s.rows));
    assert.equal(p.key, 'gapi_' + AZ_ID, 'the GolfAPI copy is picked: ' + p.text);
    assert.doesNotMatch(p.text, /GPS from OpenStreetMap|par 4 shown/);
    assert.equal(p.tees.length, 3, JSON.stringify(p.tees));
    assert.deepEqual(p.pulls, [AZ_ID]);
});

test('no over-merge: Talking Stick North + South, Starfire King 18 + Mulligan, Bandon\'s GolfAPI rows stay; OSM-only courses (Shortys, Elite Golf Schools) still show', { timeout: 300000 }, async () => {
    const r = await open(AWAY, [CHANGE, { sleep: 300 }, TYPE('talking stick'), { sleep: 1500 }, X("(function(){var b=document.getElementById('sf-more'); if(b) b.click(); return 1;})()"), { waitFor: "document.querySelectorAll('#sf [data-sf-web], #sf [data-sf-course]').length >= 2", timeout: 15000 }, { sleep: 800 }, X(SNAP),
        TYPE('starfire'), { sleep: 1500 }, X("(function(){var b=document.getElementById('sf-more'); if(b) b.click(); return 1;})()"), { waitFor: "document.querySelectorAll('#sf [data-sf-web]').length >= 2", timeout: 15000 }, { sleep: 800 }, X(SNAP),
        TYPE('elite golf'), { sleep: 3000 }, X(SNAP)]);
    assert.equal(r.ok, true, r.reason);
    const [ts, sf, el] = J(r);
    assert.ok(ts.rows.some((x) => /South - Piipaash|Piipaash/.test(x)) && ts.rows.some((x) => /O.?Odham|North/.test(x)), 'Talking Stick: both courses: ' + JSON.stringify(ts.rows));
    assert.ok(sf.rows.some((x) => /King 18/.test(x)) && sf.rows.some((x) => /Mulligan/.test(x)), 'Starfire: both courses: ' + JSON.stringify(sf.rows));
    assert.ok(el.rows.some((x) => /^OSM Elite Golf Schools of Arizona/.test(x)), 'an OSM-only course still shows: ' + JSON.stringify(el.rows));
    const b = await open(BANDON_AT, [TYPE('bandon'), { waitFor: "document.querySelectorAll('#sf [data-sf-web]').length >= 5", timeout: 15000 }, { sleep: 800 }, X(SNAP), TYPE('shortys'), { sleep: 3000 }, X(SNAP)]);
    assert.equal(b.ok, true, b.reason);
    const [bd, sh] = J(b);
    ['Bandon Crossings', 'Bandon Dunes', 'Bandon Preserve', 'Bandon Trails', 'Old McDonald', 'Pacific Dunes', 'Sheep Ranch'].forEach((n) => assert.ok(bd.rows.some((x) => x.indexOf(n) !== -1), 'Bandon: ' + n + ' kept: ' + JSON.stringify(bd.rows)));
    assert.ok(sh.rows.some((x) => /^OSM Shortys/.test(x)), 'Shortys (OSM-only) still shows: ' + JSON.stringify(sh.rows));
});

test('a GolfAPI course whose own point isn\'t known yet is never placed by a "same club" course: no Mesa point (search may measure it to the SAME-named course, 067), its OSM copy hidden, and OSM "Arizona Golf Resort" (Mesa) is not hidden by it', { timeout: 150000 }, async () => {
    const r = await open(MANNY, [CHANGE, { sleep: 300 }, TYPE('Arizo'), { sleep: 3500 }, X(SNAP)], { noGps: true });
    assert.equal(r.ok, true, r.reason);
    const [s] = J(r);
    const az = s.rows.filter((x) => /^LOCAL The Arizona/.test(x));
    assert.equal(az.length, 1, JSON.stringify(s.rows));
    assert.ok(mi(az[0]) == null || mi(az[0]) < 1, 'never Mesa\'s 17 mi: ' + az[0]);
    assert.deepEqual(osmAzcc(s.rows), [], 'GolfAPI wins: its OSM copy (the same name) is not drawn');
    assert.ok(s.rows.some((x) => /^OSM Arizona Golf Resort \| [\d.]+ mi · Mesa, AZ/.test(x)), 'Mesa\'s course still shows: ' + JSON.stringify(s.rows));
});

test('Bandon Dunes pulled (a GolfAPI course of the list): "bandon" still shows GolfAPI\'s Trails / Preserve / Pacific Dunes with ✓ GPS (one online search), not their OSM "Not set up yet" copies; Shortys (OSM-only) stays', { timeout: 200000 }, async () => {
    const BD = '012141521036241695493', bh = (i) => ({ t: { b: [43.1878 + i * 0.001, -124.3910] }, g: { c: [43.1890 + i * 0.001, -124.3915] } });
    const BD_GPS = { id: BD, club: 'Bandon Dunes Golf Resort', course: 'Bandon Dunes', city: 'Bandon', state: 'OR', lat: 43.1879, lng: -124.3903, holes: 18, h: {} };
    for (let i = 1; i <= 18; i++) BD_GPS.h[i] = bh(i - 1);
    const BD_REC = { name: 'Bandon Dunes Golf Resort (Bandon Dunes)', data: CD, tees: { male: [TEE('Black', 6700, 74, 140), TEE('Green', 6200, 71, 130)] } };
    const r = await open(BANDON_AT, [TYPE('bandon'), { waitFor: "document.querySelectorAll('#sf [data-sf-web]').length >= 4", timeout: 20000 }, { sleep: 800 }, X(SNAP)], { gc: { ['gapi_' + BD]: BD_REC }, gps: { [BD]: BD_GPS } });
    assert.equal(r.ok, true, r.reason);
    const [s] = J(r);
    ['Bandon Trails', 'Bandon Preserve', 'Pacific Dunes', 'Old McDonald'].forEach((n) => assert.ok(s.rows.some((x) => /^WEB /.test(x) && x.indexOf(n) !== -1 && /✓ GPS$/.test(x)), n + ': GolfAPI\'s row: ' + JSON.stringify(s.rows)));
    assert.ok(!s.rows.some((x) => /^OSM Bandon (Trails|Preserve)\b/.test(x)), 'no OSM copies of GolfAPI courses: ' + JSON.stringify(s.rows));
    assert.ok(s.rows.some((x) => /^LOCAL Bandon Dunes/.test(x)), 'the pulled Bandon Dunes once');
    assert.ok(s.rows.some((x) => /^OSM Shortys/.test(x)), 'Shortys (OSM-only) still shows: ' + JSON.stringify(s.rows));
    assert.deepEqual(s.fn, ['bandon'], 'one online search');
});
