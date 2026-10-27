// ============================================================================
// 088-3 (080): "📷 Scan the scorecard" IN REAL CHROME, every step a tap, fake scan-server answers only.
//   1  The 071b pars sheet (Shortys, an OpenStreetMap stand-in card, Skins NET): the button + "3 of 3 free
//      course scans left"; the scan comes back AMBER (par 8 on hole 7, HCP 11 twice / 4 missing, total 76):
//      "Use" is off; the golfer fixes two boxes; "Use" fills the TYPED boxes; Save and start -> the round's
//      card = the scanned pars + men's HCP, exactly as typing gives; NOTHING written to global_courses (the
//      shared publish is OFF); on this phone: the Ladies' HCP + the tee yards (Shortys has no tees), no
//      rating / slope; "2 of 3 free course scans left".
//   2  Round Setup's Add a course grid (the "Type the pars and indexes" link, the name changed to a
//      made-up "Mesa Verde Links"): scan -> grid -> Use fills the 36 boxes; the typed grid check passes.
//      Pictures (COURSESCAN_SHOTS=<dir>, VIEW088=<w>x<h>): button, amber grid, filled.
//   3  Out of free course scans / offline: plain words, Type them instead; offline sends nothing.
// The scan server, Cloud Functions and OpenStreetMap are stood in at fetch. Nothing reaches a database.
// ============================================================================
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'simple-flow.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const CD = makeCourseData(18);
// gpsSearch "bandon" - the LIVE answer, Oct 25 2026 10:52 AM (read through the existing function).
const R = (id, course, gps, holes, club) => ({ id, club: club || 'Bandon Dunes Golf Resort', course, name: (club || 'Bandon Dunes Golf Resort') + ' (' + course + ')', city: 'Bandon', state: 'OR', holes: holes || 18, gps, cached: false });
const BANDON = [R('01214152103626290926', 'Bandon Crossings', true, 18, 'Bandon Crossings Golf Course'), R('012141521036241695493', 'Bandon Dunes', true), R('0121658411581759626', 'Bandon Preserve', true),
    R('012141521036311111134', 'Bandon Trails', true), R('012141521036345307035', 'Old McDonald', true), R('012141521036276501913', 'Pacific Dunes', true),
    R('0121591635972407933', 'Sheep Ranch', false), R('011141521036379837276', 'Bandon Face Rock', true, 9, 'Bandon Face Rock Golf Course')];
const TRAILS = BANDON[3];
const TRAILS_REC = { name: TRAILS.name, data: CD, tees: { male: [{ name: 'Green', rating: 71, slope: 127, parTotal: 72, totalYards: 6300, holes: CD.map((h) => ({ par: h.par, yardage: 350 })) }] }, location: { city: 'Bandon', state: 'OR', latitude: 43.1782, longitude: -124.3856 } };
// gpsSearch answers by MODE: 'live' (the saved answer), 'limit' (the server's 20-a-day), 'error'.
const FUNCS = (mode) => "(function(){ window.__fn = []; var of = window.fetch; var MODE = " + JSON.stringify(mode) + ", SAVED = { bandon: " + JSON.stringify(BANDON) + ", 'pacific dunes': " + JSON.stringify([BANDON[5]]) + ", 'old mcdonald': " + JSON.stringify([BANDON[4]]) + ", 'bandon trails': [], 'Bandon Trails': [] }, TREC = " + JSON.stringify(TRAILS_REC) + ";"
    + " window.__over = 0; window.fetch = function (u, init) { var s = String(u);"
    // OPENSTREETMAP (Overpass), stood in: Shortys' outline, then 3 holes whose lines end in their greens.
    + "  if (/interpreter/.test(s)) { window.__over++; var q = decodeURIComponent(String(init && init.body || '').replace(/^data=/, '')); var j;"
    + "   if (window.__fail504 > 0) { window.__fail504--; return Promise.resolve({ ok: false, status: 504, json: function () { return Promise.reject(new Error('html')); } }); }"
    + "   if (window.__overBusy) j = { elements: [], remark: 'runtime error: Query timed out in query at line 1 after 26 seconds.' };"
    + "   else if (window.__overNone) j = { elements: [] };"
    + "   else if (/leisure/.test(q)) j = { elements: [{ type: 'way', id: 1540940976, tags: { leisure: 'golf_course', name: 'Shortys' }, center: { lat: 43.1789, lon: -124.394 } }] };"
    + "   else { var el = []; for (var n = 1; n <= 3; n++) { var la = 43.1789 + n * 0.0015, lo = -124.394; el.push({ type: 'way', id: 900 + n, tags: { golf: 'hole', ref: String(n), par: '3' }, geometry: [{ lat: la, lon: lo }, { lat: la + 0.0008, lon: lo }] });"
    + "     var g = la + 0.0008, d = 0.00012; el.push({ type: 'way', id: 950 + n, tags: { golf: 'green' }, geometry: [{ lat: g - d, lon: lo - d }, { lat: g - d, lon: lo + d }, { lat: g + d, lon: lo + d }, { lat: g + d, lon: lo - d }, { lat: g - d, lon: lo - d }] }); }"
    + "     j = { osm3s: { timestamp_osm_base: '2026-10-25T00:00:00Z' }, elements: el }; }"
    + "   return new Promise(function (ok) { setTimeout(function () { ok({ ok: true, status: 200, json: function () { return Promise.resolve(j); } }); }, window.__overDelay || 0); }); }"
    + "  var m = /cloudfunctions\\.net\\/(gps\\w+)$/.exec(s); if (!m) return of.apply(this, arguments);"
    + "  var data = JSON.parse(init.body).data; window.__fn.push([m[1], data]); var res;"
    + "  if (m[1] === 'gpsSearch') res = Promise.resolve(MODE === 'live' ? { status: 'ok', results: SAVED[data.name] || [] } : MODE === 'findonly' ? (data.name === 'bandon tr' ? { status: 'error', results: [] } : { status: 'ok', results: SAVED[data.name] || [] }) : { status: MODE, results: [] });"
    + "  else if (m[1] === 'gpsCourse' && data.courseId === '" + TRAILS.id + "') res = firebase.database().ref('global_courses/gapi_" + TRAILS.id + "').set(TREC).then(function () { return { status: 'ready', cardKey: 'gapi_" + TRAILS.id + "', course: { id: '" + TRAILS.id + "', h: { '1': { g: { c: [43.18, -124.386] }, t: { b: [43.178, -124.3856] } } } } }; });"
    + "  else res = Promise.resolve({ status: 'nogps' });"
    + "  return res.then(function (r) { return new Promise(function (ok) { setTimeout(function () { ok({ json: function () { return Promise.resolve({ result: r }); } }); }, 300); }); }); };"
    + " setInterval(function () { try { var a = firebase.auth().currentUser; if (a && !a.getIdToken) a.getIdToken = function () { return Promise.resolve('stand-in'); }; } catch (e) {} }, 100);"
    + "})();"
    + "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{liveTest:true});}});})();";
const X = (e) => ({ expression: e });
const GAMES_ON = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{liveTest:true,features:Object.assign({},v&&v.features,{simpleGames:true})});}});})();";
const TYPE = (v) => X("(function(){ var i=document.getElementById('sf-q'); if(!i){ var b=document.querySelector('[data-sf=change]'); if(b) b.click(); i=document.getElementById('sf-q'); } i.focus(); i.value=" + JSON.stringify(v) + "; i.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()");
const TAP = (sel) => X("(function(){ var b=document.querySelector(" + JSON.stringify(sel) + "); if(b) b.click(); return b ? 'tapped' : 'NONE ' + " + JSON.stringify(sel) + "; })()");
const AT_BANDON = [43.1789, -124.3935], PORTLAND = [45.52, -122.68];
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
// Games & Bets: Next -> paste golfers -> Next -> a game (+ scoring) -> Start
const GAMES = (golfers, scoring) => [TAP('[data-sf="next"]'), { sleep: 600 }, TAP('[data-sf-pmode="paste"]'), { sleep: 300 },
    X("(function(){ var t=document.getElementById('sf-paste'); t.value=" + JSON.stringify(golfers) + "; t.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()"), TAP('[data-sf="pastedone"]'), { sleep: 600 },
    TAP('[data-sf="next"]'), { sleep: 600 }, TAP('[data-sf-game="skins"]'), { sleep: 300 }, TAP('[data-sf-scoring="' + scoring + '"]'), { sleep: 300 }, TAP('[data-sf="start"]'), { sleep: 1200 }];
const V = require('./course-card-validate.js');

// ---- the made-up card and the fake scan server ----------------------------------------------------------
const sum = (a) => a.reduce((s, x) => s + x, 0);
const PAR = [4, 5, 3, 4, 4, 3, 4, 4, 5, 4, 4, 3, 5, 4, 3, 4, 4, 5];
const MEN = [7, 1, 15, 11, 3, 17, 9, 5, 13, 8, 2, 16, 4, 6, 18, 12, 14, 10];
const LADIES = [5, 1, 17, 9, 3, 15, 11, 7, 13, 6, 2, 18, 4, 8, 16, 12, 14, 10];
const YDS = { Blue: [402, 538, 176, 365, 421, 158, 389, 430, 512, 395, 441, 187, 545, 378, 166, 410, 388, 520] };
YDS.White = YDS.Blue.map((y) => y - 22); YDS.Red = YDS.Blue.map((y) => y - 80);
const tee = (name) => ({ name, yards: YDS[name].slice(), written: { out: sum(YDS[name].slice(0, 9)), in: sum(YDS[name].slice(9)), total: sum(YDS[name]) } });
const CARD = { course_name: null, holes: 18, par: PAR.slice(), par_written: { out: sum(PAR.slice(0, 9)), in: sum(PAR.slice(9)), total: sum(PAR) },
    hcp_men: MEN.slice(), hcp_ladies: LADIES.slice(), tees: [tee('Blue'), tee('White'), tee('Red')], unsure: [], notes: '' };
// what a Flash read with misreads looks like: par 8 on hole 7, HCP 11 on holes 4 and 13 (4 missing), the
// printed par OUT not printed (null) - so total par 76 and OUT 40 show as checks to make.
const AMBER = JSON.parse(JSON.stringify(CARD)); AMBER.par[6] = 8; AMBER.hcp_men[12] = 11; AMBER.par_written = { out: null, in: sum(PAR.slice(9)), total: null };
const ok = (c, left) => ({ http: 200, body: { status: 'ok', mode: 'course', model: 'gemini-3.8-flash', retried: false, paid: false, courseScansLeft: left,
    result: V.parseCourseOutput(JSON.stringify(c)).value, validation: V.validateCourse(V.parseCourseOutput(JSON.stringify(c)), { holes: 18 }) } });
const SCAN = (answers) => "(function(){ window.__hpScanCaptureStub = function () { window.__cams = (window.__cams||0) + 1; return { image: 'QUJD', width: 10, height: 10 }; };"
    + " window.__scanSent = []; var A = " + JSON.stringify(answers) + "; var of = window.fetch;"
    + " window.fetch = function (u, init) { if (/\\/api\\/scorecard-scan$/.test(String(u))) { window.__scanSent.push(JSON.parse(init.body)); var a = A.shift() || { http: 500, body: {} };"
    + "   return Promise.resolve({ ok: a.http === 200, status: a.http, text: function () { return Promise.resolve(JSON.stringify(a.body)); } }); } return of.apply(this, arguments); }; })();";
// the save goes to the round page: keep the round's card + any shared-list write across it
const KEEP = "window.addEventListener('pagehide', function(){ try { var W2=(window.__coldWrites||[]); var w=W2.filter(function(x){ return /^events\\//.test(x.path) && x.value && x.value.courseData; }).map(function(x){ return (x.value.courseData||[]).map(function(h){ return h.par + '/' + h.hcpIndex; }).join(' '); }); if (w.length) sessionStorage.setItem('__088Card', w[0]); sessionStorage.setItem('__088Shared', JSON.stringify(W2.filter(function(x){ return /global_courses/.test(x.path); }).map(function(x){ return x.path; }))); } catch(e) {} });";
const VP088 = process.env.VIEW088 ? { width: Number(process.env.VIEW088.split('x')[0]), height: Number(process.env.VIEW088.split('x')[1]) } : { width: 393, height: 852 };
const SHOT88 = (name) => (process.env.COURSESCAN_SHOTS ? [{ shot: path.join(process.env.COURSESCAN_SHOTS, VP088.width + 'x' + VP088.height + '-' + name + '.png'), viewportOnly: true }] : []);
const open = (flow, answers, steps, pre) => arriveCold({ url: fileUrl('admin.html', 'start=quick'), db: { events: {}, global_courses: {}, trips: {}, tournaments: {}, organizers: {} }, settleMs: 2500, viewport: VP088,
    preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + SCAN(answers) + FUNCS('error') + GAMES_ON + KEEP + (pre || '') + "try{sessionStorage.setItem('hardpan_simple_flow'," + JSON.stringify(flow) + ");}catch(e){}", steps: [
        { cdp: { method: 'Emulation.setGeolocationOverride', params: { latitude: PORTLAND[0], longitude: PORTLAND[1], accuracy: 10 } } },
        { cdp: { method: 'Browser.grantPermissions', params: { permissions: ['geolocation'] } } },
        { sleep: 2500 }, X("(function(){ var b=document.querySelector('[data-sf=relocate]'); if(b) b.click(); return 'relocate'; })()"),
        { waitFor: "!!document.getElementById('sf-q') && document.querySelectorAll('#sf [data-sf-course]').length > 0", timeout: 40000 }, { sleep: 800 },
        TYPE('Shortys'), { sleep: 2500 }, { waitFor: "!!document.querySelector('#sf [data-sf-osm]')", timeout: 15000 }, { sleep: 300 },
        TAP('#sf [data-sf-osm][data-sf-name="Shortys"]'),
        { waitFor: "/^osm_/.test(document.getElementById('course-select').value) && /GPS from OpenStreetMap/.test((document.getElementById('sf-osmnote')||{}).innerText||'')", timeout: 40000 }, { sleep: 600 }].concat(steps) });

const S = "JSON.stringify({ sheet: !!document.getElementById('sf-pars'), btn: !!document.querySelector('#sf-pars [data-hcs=scan]'), left: (document.querySelector('.hcs-left')||{}).textContent||'',"
    + " grid: !!document.getElementById('hcs-grid'), state: window.HardPanCourseScan ? HardPanCourseScan.state() : null, amberN: document.querySelectorAll('#hcs-sheet input[data-hcs-amber=hard]').length,"
    + " amberCells: Array.prototype.map.call(document.querySelectorAll('#hcs-sheet input[data-hcs-amber=hard]'), function(i){ return i.getAttribute('data-hcs-cell'); }),"
    + " useOff: !!(document.getElementById('hcs-use')||{}).disabled, useText: (document.getElementById('hcs-use')||{}).textContent||'', list: (document.getElementById('hcs-amber')||{}).innerText||'', err: (document.getElementById('hcs-err')||{}).textContent||'',"
    + " again: !!document.querySelector('#hcs-sheet [data-hcs=again]'), typeBtn: !!document.querySelector('#hcs-sheet [data-hcs=type]'),"
    + " typedPar: Array.prototype.map.call(document.querySelectorAll('#sf-pars [data-sf-par]'), function(i){ return i.value; }).join(','), typedSi: Array.prototype.map.call(document.querySelectorAll('#sf-pars [data-sf-si]'), function(i){ return i.value; }).join(','),"
    + " scanned: !!document.getElementById('sf-pars-scanned'), sent: window.__scanSent || [], cams: window.__cams || 0, kept: localStorage.getItem('hardpan_course_card_scan_v1'),"
    + " card: (function(){ var w=(window.__coldWrites||[]).filter(function(x){ return /^events\\//.test(x.path) && x.value && x.value.courseData; }).map(function(x){ return (x.value.courseData||[]).map(function(h){ return h.par + '/' + h.hcpIndex; }).join(' '); }); return w[0] || sessionStorage.getItem('__088Card'); })(),"
    + " shared: (function(){ var a=(window.__coldWrites||[]).filter(function(x){ return /global_courses/.test(x.path); }).map(function(x){ return x.path; }); var b=JSON.parse(sessionStorage.getItem('__088Shared')||'[]'); return JSON.stringify(b.concat(a)); })(), page: location.pathname.split('/').pop(),"
    + " sharedNow: (window.__coldWrites||[]).filter(function(w){ return /global_courses/.test(w.path); }).map(function(w){ return w.path; }) })";
const CELL = (k, v) => X("(function(){ var i=document.querySelector('#hcs-sheet [data-hcs-cell=\"" + k + "\"]'); if(!i) return 'NONE " + k + "'; i.focus(); i.value=" + JSON.stringify(String(v)) + "; i.dispatchEvent(new Event('input',{bubbles:true})); return 'set " + k + "'; })()");

test('071b pars sheet: scan -> AMBER grid -> fix -> Use fills the typed boxes -> Save and start = the typed save; shared OFF writes nothing', { timeout: 240000 }, async () => {
    const r = await open('new', [ok(AMBER, 2)], GAMES('Glenn 12\nMarty 4', 'net').concat([X(S)]).concat([
        { tap: '#sf-pars [data-hcs=scan]' }, { waitFor: "!!document.getElementById('hcs-grid')", timeout: 15000 }, { sleep: 300 }, X(S),
        CELL('par:7', 4), CELL('hcp_men:13', 4), { sleep: 200 }, X(S),
        X("(function(){ document.getElementById('hcs-use').scrollIntoView({ block: 'center' }); return 1; })()"), { sleep: 200 },
        { tap: '#hcs-use' }, { sleep: 400 }, X(S),
        X("(function(){ var b=document.querySelector('[data-sf=\"parssave\"]'); b.scrollIntoView({ block: 'center' }); return 1; })()"), { sleep: 200 },
        { tap: '[data-sf="parssave"]' },
        { waitFor: "(window.__coldWrites||[]).some(function(w){ return /^events\\//.test(w.path) && w.value && (w.value.courseData||[]).length; }) || !!sessionStorage.getItem('__088Card')", timeout: 40000 }, { sleep: 1500 }, X(S)]));
    assert.equal(r.ok, true, r.reason);
    const [before, amber, fixed, filled, done] = J(r);
    if (process.env.DEBUG088) console.log(JSON.stringify([fixed, filled, done].map((x) => x && Object.assign({}, x, { kept: undefined }))));
    // the button, before any tap: nothing sent, camera never opened
    assert.equal(before.sheet, true); assert.equal(before.btn, true);
    assert.equal(before.left, '3 of 3 free course scans left');
    assert.equal(before.cams, 0); assert.deepEqual(before.sent, []);
    // the request: { mode, image, course } only
    assert.equal(amber.cams, 1);
    assert.equal(amber.sent.length, 1);
    assert.deepEqual(Object.keys(amber.sent[0]).sort(), ['course', 'image', 'mode']);
    assert.deepEqual(amber.sent[0].course, { holes: 18, name: 'Shortys' });
    // AMBER: par 8 on 7, HCP 11 twice, total 76 -> Use is off
    assert.ok(amber.amberCells.includes('par:7'), JSON.stringify(amber.amberCells));
    assert.ok(amber.amberCells.includes('hcp_men:4') && amber.amberCells.includes('hcp_men:13'));
    assert.match(amber.list, /Hole 7: a par of 3, 4, 5 or 6 \(read as 8\)/);
    assert.match(amber.list, /index 11 is on holes 4 and 13/);
    assert.match(amber.list, /index 4 is missing/);
    assert.match(amber.list, /Total par 76: a course is par 60.75/);
    assert.equal(amber.useOff, true);
    assert.equal(amber.left, '2 of 3 free course scans left');
    // fixed -> Use on
    assert.equal(fixed.amberN, 0, JSON.stringify(fixed.amberCells)); assert.equal(fixed.useOff, false);
    assert.match(fixed.useText, /Use these pars and indexes/);
    // Use filled the TYPED boxes, nothing saved yet
    assert.equal(filled.grid, false);
    assert.equal(filled.typedPar, PAR.join(',')); assert.equal(filled.typedSi, MEN.join(','));
    assert.equal(filled.scanned, true);
    assert.equal(filled.card, null);
    // Save and start: the round's card = the scanned card, through the typed save
    assert.equal(done.card, PAR.map((p, i) => p + '/' + MEN[i]).join(' '));
    assert.equal(done.shared, '[]', 'shared publish OFF: no global_courses write');
    // on this phone: Ladies' + the tee yards (Shortys had no tees); no rating / slope
    const kept = JSON.parse(done.kept).osm_w1540940976;
    assert.deepEqual(kept.hcpLadies, LADIES);
    assert.deepEqual(kept.tees.male.map((t) => t.name), ['Blue', 'White', 'Red']);
    assert.deepEqual(kept.tees.male[0].holes.map((h) => h.yardage), YDS.Blue);
    assert.ok(!/rating|slope/i.test(done.kept));
});

test('Add a course (the "Type the pars and indexes" link): scan fills Round Setup\'s 36 boxes; its own grid check passes', { timeout: 240000 }, async () => {
    const GRID = "JSON.stringify({ par: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18].map(function(h){ return document.getElementById('c-par-'+h).value; }).join(','), hcp: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18].map(function(h){ return document.getElementById('c-hcp-'+h).value; }).join(','), check: validateCourseGrid().ok, filled: (document.getElementById('hcs-admin-filled')||{}).textContent||'', btn: !!document.getElementById('hcs-scan-addcourse') && document.getElementById('hcs-scan-addcourse').offsetParent !== null, shared: (window.__coldWrites||[]).filter(function(w){ return /global_courses/.test(w.path); }).length })";
    const r = await open('gps', [ok(AMBER, 1)], [TAP('[data-sf="osmpars"]'), { sleep: 900 },
        X("(function(){ var i=document.getElementById('new-course-name-input'); i.value='Mesa Verde Links'; return i.value; })()"),
        TAP('#new-course-form .wizard-btn-next'), { sleep: 900 },
        X("(function(){ var b=document.getElementById('hcs-scan-addcourse'); if (b) b.scrollIntoView({ block: 'center' }); return 1; })()"), { sleep: 300 }, X(GRID)].concat(SHOT88('1-scan-button')).concat([
        { tap: '#hcs-scan-addcourse' }, { waitFor: "!!document.getElementById('hcs-grid')", timeout: 15000 }, { sleep: 300 }, X(S)]).concat(SHOT88('2-check-grid-amber')).concat([
        CELL('par:7', 4), CELL('hcp_men:13', 4), { sleep: 200 }, X("(function(){ var b=document.getElementById('hcs-use'); b.scrollIntoView({ block: 'center' }); return 1; })()"), { sleep: 200 }]).concat(SHOT88('3-check-grid-fixed')).concat([
        { tap: '#hcs-use' }, { sleep: 500 }, X("(function(){ var b=document.getElementById('hcs-admin-filled'); if (b) b.scrollIntoView({ block: 'start' }); return 1; })()"), { sleep: 300 }, X(GRID)]).concat(SHOT88('4-filled-add-a-course')));
    assert.equal(r.ok, true, r.reason);
    const [before, grid, after] = J(r);
    assert.equal(before.btn, true, 'the button shows on the Add a course grid');
    assert.equal(before.check, false, 'an empty grid does not pass (typed path unchanged)');
    assert.equal(grid.grid, true); assert.equal(grid.useOff, true);
    assert.deepEqual(grid.sent[0].course, { holes: 18, name: 'Mesa Verde Links' });
    assert.equal(after.par, PAR.join(',')); assert.equal(after.hcp, MEN.join(','));
    assert.equal(after.check, true, 'the typed grid check passes on the scanned card');
    assert.match(after.filled, /Filled from your scan/);
    assert.equal(after.shared, 0);
});

test('out of free course scans, then offline: plain words + Type them instead; offline sends nothing', { timeout: 240000 }, async () => {
    const r = await open('new', [{ http: 402, body: { status: 'refused', reason: 'needs_pass' } }], GAMES('Glenn 12\nMarty 4', 'net').concat([
        { tap: '#sf-pars [data-hcs=scan]' }, { waitFor: "!!document.getElementById('hcs-err')", timeout: 15000 }, X(S),
        { tap: '#hcs-sheet [data-hcs=type]' }, { sleep: 300 }, X(S),
        X("(function(){ Object.defineProperty(navigator, 'onLine', { configurable: true, get: function(){ return false; } }); return 'offline'; })()"),
        { tap: '#sf-pars [data-hcs=scan]' }, { waitFor: "!!document.getElementById('hcs-err')", timeout: 15000 }, X(S)]));
    assert.equal(r.ok, true, r.reason);
    const [out, closed, off] = J(r);
    assert.match(out.err, /used your free course scans\. Type the pars and indexes instead\./);
    assert.equal(out.again, false, 'no Scan again when out of free scans'); assert.equal(out.typeBtn, true);
    assert.equal(closed.grid, false); assert.equal(closed.sheet, true, 'back on the typed sheet');
    assert.equal(closed.left, 'You’ve used your 3 free course scans');
    assert.equal(closed.typedPar, ',,,,,,,,,,,,,,,,,', 'typed boxes untouched');
    assert.match(off.err, /Scanning needs signal/);
    assert.equal(off.sent.length, 1, 'offline: no second request');
});

// A TEE WHOSE 18 YARDAGES DON'T ADD UP TO ITS PRINTED TOTAL (Manny, Oct 26): shown AMBER for the
// golfer to fix - never a block. "Use" stays on and nothing is re-sent. Negative control: on
// 5f8f3d1d (the button as first built) the same card turned "Use" off.
test('a tee total that does not add up: amber + named, Use stays ON, one request, Use fills the typed boxes', { timeout: 240000 }, async () => {
    const TEEBAD = JSON.parse(JSON.stringify(CARD)); TEEBAD.tees[0].written.total += 10;
    const SOFT = "JSON.stringify({ soft: Array.prototype.map.call(document.querySelectorAll('#hcs-sheet [data-hcs-amber=soft]'), function(i){ return i.getAttribute('data-hcs-cell') || i.textContent; }) })";
    const r = await open('new', [ok(TEEBAD, 2)], GAMES('Glenn 12\nMarty 4', 'net').concat([
        { tap: '#sf-pars [data-hcs=scan]' }, { waitFor: "!!document.getElementById('hcs-grid')", timeout: 15000 }, { sleep: 300 }, X(S), X(SOFT),
        X("(function(){ document.getElementById('hcs-use').scrollIntoView({ block: 'center' }); return 1; })()"), { sleep: 200 },
        { tap: '#hcs-use' }, { sleep: 400 }, X(S)]));
    assert.equal(r.ok, true, r.reason);
    const [grid, soft, filled] = J(r);
    assert.equal(grid.sent.length, 1, 'one request - the app never re-asks');
    assert.equal(grid.amberN, 0, 'no box blocks: ' + JSON.stringify(grid.amberCells));
    assert.ok(soft.soft.length >= 1, 'the tee total is amber: ' + JSON.stringify(soft.soft));
    assert.match(grid.list, /1 box to check:/);
    assert.match(grid.list, /Blue TOTAL adds to 6,821 yds but the card says 6,831/);
    assert.equal(grid.useOff, false, 'Use stays on');
    assert.match(grid.useText, /Use these pars and indexes/);
    assert.equal(filled.grid, false);
    assert.equal(filled.typedPar, PAR.join(',')); assert.equal(filled.typedSi, MEN.join(','));
});
