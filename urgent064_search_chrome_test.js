// ============================================================================
// 064 SEARCH - IN REAL CHROME (phone GPS mode).
//
// Manny, typed in Claude Code: "Goldendale: fix A (show OSM-only courses as 'Not set up yet · Add this
// course'); apply to Starfire too."
//   1  Goldendale: search shows "Goldendale Golf Club · Not set up yet · Add this course" (city under the
//      name, no ✓ GPS, no "Tap to load"); a tap opens Round Setup's Add a course with the name filled
//      in (and the city shown); nothing written to the database.
//   2  any OpenStreetMap-only course (one from another state's list, picked from the app's own list).
//   3  a course we have (Papago) still shows ✓ GPS exactly once - no "Not set up yet" twin.
//   4  Starfire from NEAR YOU: GolfAPI's two courses at one club (King 18 + Mulligan, Scottsdale) and our
//      row's city guess (Paradise Valley): "Starfire Golf Club has 2 courses. Which one?" - King 18
//      first, then Mulligan 9 - never "isn't in our course data"; nothing kept as a 30-day miss (an old
//      mark from before is not trusted either); King 18 tapped: pulled with NO ourKey (no gps_links
//      write), its card is the pick, its tees listed.
// The Cloud Functions are stood in by a fetch stand-in (gpsSearch answers the SAVED Starfire answer;
// gpsCourse's server write is done by the stand-in, path recorded). No network, no GolfAPI call.
// Synthetic course cards only.
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
const KING_ID = '0121160834025376', MULL_ID = '0111744455094783703';
const KING_REC = { name: 'Starfire Golf Club (King 18)', data: CD, tees: { male: [TEE('Blue', 6400, 70.5, 124), TEE('White', 6000, 68.9, 118)] }, location: { city: 'Scottsdale', state: 'AZ', latitude: 33.5893, longitude: -111.9116 } };
// gps_search/starfire_golf_club, saved Oct 23 (064-6d, read-only copy).
const SAVED = {
    'Starfire Golf Club': [
        { id: KING_ID, club: 'Starfire Golf Club', course: 'King 18', name: 'Starfire Golf Club (King 18)', city: 'Scottsdale', state: 'AZ', holes: 18, gps: true, cached: false },
        { id: MULL_ID, club: 'Starfire Golf Club', course: 'Mulligan', name: 'Starfire Golf Club (Mulligan)', city: 'Scottsdale', state: 'AZ', holes: 9, gps: true, cached: false }],
};
// THE CLOUD FUNCTIONS, STOOD IN AT fetch (gps-live's own find / course run for real): counts each call.
const FUNCS = "(function(){ window.__fn = []; var of = window.fetch; var SAVED = " + JSON.stringify(SAVED) + ", KING = " + JSON.stringify(KING_REC) + ";"
    + " window.fetch = function (u, init) { var m = /cloudfunctions\\.net\\/(gps\\w+)$/.exec(String(u)); if (!m) return of.apply(this, arguments);"
    + "  var data = JSON.parse(init.body).data; window.__fn.push([m[1], data]); var res;"
    + "  if (m[1] === 'gpsSearch') res = Promise.resolve({ status: 'ok', results: SAVED[data.name] || [] });"
    + "  else if (m[1] === 'gpsCourse' && data.courseId === '" + KING_ID + "') res = firebase.database().ref('global_courses/gapi_" + KING_ID + "').set(KING).then(function () { return { status: 'ready', cardKey: 'gapi_" + KING_ID + "', course: { id: '" + KING_ID + "', h: { '1': { green: [[33.5900, -111.9100]], tee: [33.5880, -111.9120] } } } }; });"
    + "  else res = Promise.resolve({ status: 'nogps' });"
    + "  return res.then(function (r) { return new Promise(function (ok) { setTimeout(function () { ok({ json: function () { return Promise.resolve({ result: r }); } }); }, 300); }); }); };"
    + " setInterval(function () { try { var a = firebase.auth().currentUser; if (a && !a.getIdToken) a.getIdToken = function () { return Promise.resolve('stand-in'); }; } catch (e) {} }, 100);"
    + "})();"
    + "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{liveTest:true});}});})();";
const X = (e) => ({ expression: e });
const TYPE = (v) => X("(function(){ var i=document.getElementById('sf-q'); if(!i){ var b=document.querySelector('[data-sf=change]'); if(b) b.click(); i=document.getElementById('sf-q'); } i.focus(); i.value=" + JSON.stringify(v) + "; i.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()");
const SF = "JSON.stringify({ key: document.getElementById('course-select').value, text: (document.getElementById('sf')||{}).innerText||'', box: (document.getElementById('sf-lookup')||{}).innerText||'',"
    + " osm: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-osm]'), function(b){ return b.innerText.replace(/\\n/g,' | '); }),"
    + " rows: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-course]'), function(b){ return b.getAttribute('data-sf-course') + ' ' + b.innerText.replace(/\\n/g,' | '); }),"
    + " web: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-web]'), function(b){ return b.innerText.replace(/\\n/g,' | '); }),"
    + " picks: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-lkpick]'), function(b){ return b.getAttribute('data-sf-lkpick') + ' ' + b.innerText.replace(/\\n/g,' | '); }),"
    + " tees: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-tee]'), function(b){return b.innerText.split('\\n')[0];}),"
    + " sfShown: (function(){ var s=document.getElementById('sf'); return !!s && getComputedStyle(s).display !== 'none' && s.style.visibility !== 'hidden'; })(),"
    + " form: (function(){ var f=document.getElementById('new-course-form'); return f ? getComputedStyle(f).display : null; })(), step1: (function(){ var s=document.getElementById('wizard-step-1'); return !!s && s.offsetParent !== null; })(),"
    + " name: (document.getElementById('new-course-name-input')||{}).value, where: (document.getElementById('sf-new-course-where')||{}).textContent || '', back: (document.getElementById('sf-return')||{}).textContent || '',"
    + " fn: window.__fn, look: window.__sfLook || [], mark: localStorage.getItem('hardpan_autolook_az_starfire'), writes: (window.__coldWrites||[]).map(function(w){ return w.op + ' ' + w.path; }),"
    + " start: (function(){ var b=document.querySelector('[data-sf=startgps]'); return b ? { text: b.innerText, disabled: b.disabled } : null; })() })";
const open = (at, steps, pre) => arriveCold({ url: fileUrl('admin.html', 'start=quick'), db: { events: {}, global_courses: {}, trips: {}, tournaments: {}, organizers: {} }, settleMs: 2500, viewport: { width: 393, height: 852 },
    preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + FUNCS + (pre || '') + "try{sessionStorage.setItem('hardpan_simple_flow','gps');}catch(e){}"
        + "if (/admin\\.html$/.test(location.pathname)) document.addEventListener('DOMContentLoaded', function () { var s = document.createElement('script'); s.src = 'gps-live.js'; document.head.appendChild(s); });", steps: [
        { cdp: { method: 'Emulation.setGeolocationOverride', params: { latitude: at[0], longitude: at[1], accuracy: 10 } } },
        { cdp: { method: 'Browser.grantPermissions', params: { permissions: ['geolocation'] } } },
        { sleep: 2500 }, X("(function(){ var b=document.querySelector('[data-sf=relocate]'); if(b) b.click(); return 'relocate'; })()"),
        { waitFor: "!!document.getElementById('sf-q') && !!window.HardPanGpsLive && document.querySelectorAll('#sf [data-sf-course]').length > 0", timeout: 40000 }, { sleep: 800 }].concat(steps) });
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const PAPAGO = [33.4560, -111.9480];
// A course of ours with GPS (as in urgent060): the app's GolfAPI file holds Talking Stick South.
const GAPI_ID = '990000000000000001';
const GAPI = { v: 1, built: 'test', links: {}, courses: { [GAPI_ID]: { id: GAPI_ID, club: 'Talking Stick Golf Club', course: 'South - Piipaash', city: 'Scottsdale', state: 'AZ', lat: 33.539874, lng: -111.870432, holes: 18,
    h: { 1: { g: { f: [33.5445, -111.8690], c: [33.5444, -111.8691], b: [33.5443, -111.8692] }, t: { b: [33.5467, -111.8663], f: [33.5460, -111.8678] } } } } } };
const AT_TS = [33.5399, -111.8704];
const nearStarfire = [33.5990, -111.9078];   // ~0.7 mi north of Starfire's point: listed, not "You're here"
const writesOf = (s) => s.writes.filter((w) => !/^set global_courses\/gapi_\d+$/.test(w));   // (the stand-in server's own write)

test('Goldendale: "Goldendale Golf Club · Not set up yet · Add this course", no ✓ GPS; a tap opens Add a course with the name (and city) filled in; nothing written', { timeout: 150000 }, async () => {
    const r = await open(PAPAGO, [X(SF), TYPE('Goldendale'), { waitFor: "document.querySelectorAll('#sf [data-sf-osm]').length > 0 && !/Searching all courses/.test(document.getElementById('sf').innerText)", timeout: 15000 }, { sleep: 400 }, X(SF),
        X("(function(){ var b=document.querySelector('#sf [data-sf-osm][data-sf-name=\"Goldendale Golf Club\"]'); if(b) b.click(); return b ? 'tapped' : 'NO ROW'; })()"), { sleep: 1200 }, X(SF)]);
    assert.equal(r.ok, true, r.reason);
    const [before, s, add] = J(r);
    assert.equal(s.osm[0], 'Goldendale Golf Club | Goldendale, WA · Not set up yet · Add this course', 'first: ' + JSON.stringify(s.osm));
    assert.equal(s.osm.filter((t) => /Goldendale Golf Club/.test(t)).length, 1, 'once');
    const [nm, sub] = s.osm[0].split(' | ');
    assert.equal(nm + ' · ' + sub.replace(/^Goldendale, WA · /, ''), 'Goldendale Golf Club · Not set up yet · Add this course');
    assert.doesNotMatch(s.osm[0], /✓ GPS|Tap to load/, 'no GPS badge');
    assert.doesNotMatch(s.text, /No course found by that name/, 'found: not "No course found"');
    assert.deepEqual(s.fn.map((c) => c[0] + ':' + c[1].name), ['gpsSearch:goldendale'], 'the online search still asks (GolfAPI may have it) - the name only');
    assert.equal(add.sfShown, false, 'the GPS screen steps aside');
    assert.equal(add.step1, true, 'Round Setup\'s course step');
    assert.equal(add.form, 'block', 'Add a course is open');
    assert.equal(add.name, 'Goldendale Golf Club', 'the name filled in');
    assert.equal(add.where, 'Goldendale, WA · from OpenStreetMap', 'the city shown');
    assert.match(add.back, /back to New round/);
    assert.equal(add.key, '', 'nothing picked yet - the golfer adds it');
    assert.deepEqual(writesOf(add).slice(before.writes.length), [], 'no database write from search or the tap');
    assert.deepEqual(add.fn.map((c) => c[0]), ['gpsSearch'], 'no gpsCourse pull');
});

test('any OpenStreetMap-only course (one from the OR list, picked from the app\'s own list): the Add row, then Add a course with its name', { timeout: 150000 }, async () => {
    const PICK = "(function(){ var c=(HardPanCourse.osmOnly()||[]).filter(function(x){ return x.state==='OR' && /^[A-Za-z ]{8,40}$/.test(x.name) && x.city; })[0]; window.__osmPick=c; var i=document.getElementById('sf-q'); i.focus(); i.value=c.name; i.dispatchEvent(new Event('input',{bubbles:true})); return JSON.stringify({ pick: c }); })()";
    const r = await open(PAPAGO, [X(SF), X(PICK), { waitFor: "document.querySelectorAll('#sf [data-sf-osm]').length > 0 && !/Searching all courses/.test(document.getElementById('sf').innerText)", timeout: 15000 }, { sleep: 400 }, X(SF),
        X("(function(){ var b=Array.prototype.filter.call(document.querySelectorAll('#sf [data-sf-osm]'), function(x){ return x.getAttribute('data-sf-name')===window.__osmPick.name; })[0]; if(b) b.click(); return b ? 'tapped' : 'NO ROW'; })()"), { sleep: 1200 }, X(SF)]);
    assert.equal(r.ok, true, r.reason);
    const [before, p, s, add] = J(r);
    const c = p.pick;
    assert.ok(c && c.name && !c.key, 'a keyless OSM course: ' + JSON.stringify(c));
    const row = s.osm.filter((t) => t.indexOf(c.name + ' | ') === 0)[0];
    assert.ok(row, 'its row: ' + JSON.stringify(s.osm));
    assert.equal(row, c.name + ' | ' + c.city + ', OR · Not set up yet · Add this course');
    assert.ok(s.osm.length <= 5, 'at most 5 such rows');
    assert.equal(add.form, 'block');
    assert.equal(add.name, c.name);
    assert.equal(add.where, c.city + ', OR · from OpenStreetMap');
    assert.deepEqual(writesOf(add).slice(before.writes.length), [], 'no database write');
});

test('a course we have with GPS (Talking Stick South) still shows ✓ GPS exactly once - no "Not set up yet" twin', { timeout: 150000 }, async () => {
    const r = await open(AT_TS, [TYPE('Talking Stick'), { sleep: 2500 }, X(SF)], 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';');
    assert.equal(r.ok, true, r.reason);
    const [s] = J(r);
    const ts = s.rows.filter((t) => /Talking Stick/.test(t) && /South/.test(t));
    assert.equal(ts.length, 1, 'one Talking Stick South row: ' + JSON.stringify(s.rows));
    assert.equal((ts[0].match(/✓ GPS/g) || []).length, 1, '✓ GPS once: ' + ts[0]);
    assert.equal(s.osm.filter((t) => /Talking Stick/.test(t)).length, 0, 'no OSM twin: ' + JSON.stringify(s.osm));
    assert.equal(s.web.filter((t) => /Talking Stick/.test(t)).length, 0);
    const results = s.text.split('RESULTS\n')[1].split('Not listed?')[0];   // (the picked course's own head below says ✓ GPS too)
    assert.equal((results.match(/✓ GPS/g) || []).length, 1, 'one ✓ GPS in the results: ' + JSON.stringify(results));
});

test('Starfire from NEAR YOU: one club, two courses, our city guess wrong -> "Which one?" (King 18 first, Mulligan 9) - not "isn\'t in our course data"; no 30-day miss; King 18 loads', { timeout: 180000 }, async () => {
    // An old-style 30-day mark from before (a bare number - the wrongly kept "ambiguous"): not trusted.
    const OLD = "try{localStorage.setItem('hardpan_autolook_az_starfire', String(Date.now() - 3600000));}catch(e){}";
    const r = await open(nearStarfire, [X(SF),
        X("(function(){ var b=document.querySelector('#sf [data-sf-course=\"az_starfire\"]'); if(b) b.click(); return b ? 'tapped' : 'NO ROW'; })()"),
        { waitFor: "document.querySelectorAll('#sf [data-sf-lkpick]').length > 0", timeout: 15000 }, { sleep: 300 }, X(SF),
        // Pick another course, then Starfire again: asked again (nothing kept as a miss), the same choice.
        X("(function(){ var b=document.querySelector('#sf-lookup [data-sf=change]'); if(b) b.click(); return 1; })()"), { sleep: 600 }, TYPE('starfire'), { sleep: 1500 },
        X("(function(){ var b=document.querySelector('#sf [data-sf-course=\"az_starfire\"]'); if(b) b.click(); return b ? 'tapped' : 'NO ROW'; })()"),
        { waitFor: "document.querySelectorAll('#sf [data-sf-lkpick]').length > 0", timeout: 15000 }, { sleep: 300 }, X(SF),
        X("(function(){ var b=document.querySelector('#sf [data-sf-lkpick=\"" + KING_ID + "\"]'); if(b) b.click(); return b ? 'tapped' : 'NO ROW'; })()"),
        { waitFor: "document.getElementById('course-select').value === 'gapi_" + KING_ID + "' && document.querySelectorAll('#sf [data-sf-tee]').length > 0", timeout: 20000 }, { sleep: 800 }, X(SF)], OLD);
    assert.equal(r.ok, true, r.reason);
    const [near, s, again, king] = J(r);
    assert.ok(near.rows.some((t) => /^az_starfire Starfire Golf Club \| .*Tap to load/.test(t)), 'Starfire in NEAR YOU, "Tap to load": ' + JSON.stringify(near.rows));
    assert.equal(s.box.split('\n')[0], 'Starfire Golf Club has 2 courses. Which one?');
    assert.deepEqual(s.picks, [KING_ID + ' King 18 | 18 holes · ✓ GPS', MULL_ID + ' Mulligan 9 | 9 holes · ✓ GPS'], 'King 18 first, then Mulligan 9');
    assert.doesNotMatch(s.text, /isn.t in our course data/);
    assert.equal(s.mark, null, 'no 30-day miss kept');
    assert.equal(s.look.length, 1, 'the old mark was not trusted: looked up');
    // (Round Setup's own GPS finder underneath also asks once on a pick - as before; the function's 30-day cache answers it)
    assert.ok(s.fn.length >= 1 && s.fn.every((c) => c[0] === 'gpsSearch' && JSON.stringify(c[1]) === '{"name":"Starfire Golf Club"}'), 'searched by name only: ' + JSON.stringify(s.fn));
    assert.equal(again.look.length, 2, 'asked again - the choice is not a 30-day miss');
    assert.equal(again.picks.length, 2);
    assert.equal(again.mark, null);
    const pulls = king.fn.filter((c) => c[0] === 'gpsCourse');
    assert.deepEqual(pulls.map((c) => c[1]), [{ courseId: KING_ID }], 'King 18 pulled once, no ourKey (no gps_links write)');
    assert.equal(king.key, 'gapi_' + KING_ID, 'its card is the pick');
    assert.deepEqual(king.tees, ['Blue', 'White']);
    assert.equal(king.start && king.start.disabled, false, 'Start Round is live');
    assert.deepEqual(writesOf(king), [], 'the page wrote nothing itself');
});
