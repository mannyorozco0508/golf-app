// ============================================================================
// 064 - NEAR YOU WHEN THE SHARED COURSE LIST LANDS LATE (the "az_papago 0.7 mi" Simulator row), REAL CHROME.
//
// On a fresh install Round Setup's shared course list (globalCourses: Papago's gapi_ record, its card and its
// GPS link) can land AFTER the phone's position. NEAR YOU was worked out once, from the directory row
// az_papago (no point of its own but the OSM one, no ✓ GPS, no "You're here"), and nothing worked it out
// again; the GPS keys read before the list was in missed Papago's GPS and were kept 6 hours.
// Now, when the list lands: NEAR YOU is Papago's own record - "You're here", ✓ GPS - with no tap.
// The list is held back 6 s by a stand-in around the stub database. Synthetic course data only.
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
const ID = '012141520636857668694';
const TEE = (name, y) => ({ name, rating: 71, slope: 125, parTotal: 72, totalYards: y, holes: CD.map((h) => ({ par: h.par, yardage: Math.round(y / 18) })) });
const REC = { name: 'Papago Golf Club (Papago)', data: CD, tees: { male: [TEE('Blue', 6800)] }, location: { city: 'Phoenix', state: 'AZ', latitude: 33.461251, longitude: -111.960768 } };
const GPS = { id: ID, club: 'Papago Golf Club', course: 'Papago', city: 'Phoenix', state: 'AZ', lat: 33.461251, lng: -111.960768, holes: 18,
    h: { 1: { g: { f: [33.4598, -111.9590], c: [33.4597, -111.9591], b: [33.4596, -111.9592] }, t: { b: [33.4620, -111.9610], f: [33.4615, -111.9605] } } } };
// 086 (Manny, Oct 26): "✓ GPS" needs a green on EVERY hole - the made-up hole 1 stands for holes 2-18 too.
for (let i = 2; i <= 18; i++) GPS.h[i] = GPS.h[1];
const LATE = (ms) => "(function(){ var hold = function () { var F = window.firebase; if (!F || !F.database || F.__late) return false; var od = F.database; F.database = function () { var d = od.apply(F, arguments), r = d.ref; return Object.assign({}, d, { ref: function (p) { var x = r.apply(d, arguments); if (String(p) === 'global_courses') { var o = x.once; x.once = function () { var a = arguments; window.__lateAsked = (window.__lateAsked || 0) + 1; return new Promise(function (res) { setTimeout(function () { res(o.apply(x, a)); }, " + ms + "); }); }; } return x; } }); }; F.__late = true; return true; };"
    + " if (!hold()) { var t = setInterval(function () { if (hold()) clearInterval(t); }, 5); } })();"
    + "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{liveTest:true});}});})();"
    + "try{ localStorage.removeItem('hardpan_course_index_v1'); }catch(e){}";
const X = (e) => ({ expression: e });
const NEAR = "JSON.stringify({ t: Date.now(), late: window.__lateAsked || 0, gc: Object.keys((typeof globalCourses !== 'undefined' && globalCourses) || {}), rows: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-course]'), function(b){ return b.getAttribute('data-sf-course') + ' | ' + b.innerText.replace(/\\n/g,' | '); }), key: document.getElementById('course-select').value,"
    + " card: (function(){ var c=document.querySelector('#sf [data-sf-playing]'); return c ? { key: c.getAttribute('data-sf-playing'), here: c.getAttribute('data-sf-playing-here') === '1', text: c.innerText.replace(/\\n/g,' | ') } : null; })() })";

test('the shared list lands 6 s late: NEAR YOU becomes Papago\'s own record - "You\'re here", ✓ GPS - with no tap', { timeout: 150000 }, async () => {
    const r = await arriveCold({ url: fileUrl('admin.html', 'start=quick'), db: { events: {}, global_courses: { ['gapi_' + ID]: REC }, gps_courses: { [ID]: GPS }, trips: {}, tournaments: {}, organizers: {} }, settleMs: 1500, viewport: { width: 393, height: 852 },
        preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + LATE(6000) + "try{sessionStorage.setItem('hardpan_simple_flow','gps');}catch(e){}"
            + "if (/admin\\.html$/.test(location.pathname)) document.addEventListener('DOMContentLoaded', function () { var s = document.createElement('script'); s.src = 'gps-live.js'; document.head.appendChild(s); });", steps: [
            { cdp: { method: 'Emulation.setGeolocationOverride', params: { latitude: 33.4612, longitude: -111.9604, accuracy: 10 } } },
            { cdp: { method: 'Browser.grantPermissions', params: { permissions: ['geolocation'] } } },
            X("(function(){ var b=document.querySelector('[data-sf=relocate]'); if(b) b.click(); return 'relocate'; })()"),
            { waitFor: "document.querySelectorAll('#sf [data-sf-course]').length > 0 || !!document.querySelector('#sf [data-sf-playing]')", timeout: 40000 }, X(NEAR),
            // 076 (option A): the course he is at is the PLAYING card, alone - it becomes Papago's own record, then Change shows NEAR YOU
            { waitFor: "!!document.querySelector('#sf [data-sf-playing=\"gapi_" + ID + "\"]') && /✓ GPS/.test(document.getElementById('sf').innerText)", timeout: 30000 }, { sleep: 800 }, X(NEAR),
            X("(function(){ var b=document.querySelector('#sf-course [data-sf=change]'); if(b) b.click(); return 1; })()"), { sleep: 1000 }, X(NEAR)] });
    assert.equal(r.ok, true, r.reason);
    const s = r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
    const [early, card, late] = s;
    assert.ok(card.card && card.card.here && /^PLAYING \| Change \| Papago Golf Club \| You’re here · Phoenix, AZ · [\d.]+ mi · ✓ GPS$/.test(card.card.text), '076: the PLAYING card: ' + JSON.stringify(card.card));
    assert.deepEqual(card.rows, [], '076: alone');
    assert.ok(early.late >= 1, 'the list was held back');
    assert.equal(early.gc.length, 0, 'NEAR YOU drawn before the list landed: ' + JSON.stringify(early));
    const pap = late.rows.filter((t) => /Papago/.test(t));
    assert.equal(pap.length, 1, 'one Papago row: ' + JSON.stringify(late.rows));
    assert.match(pap[0], new RegExp('^gapi_' + ID + ' \\| Papago Golf Club \\| You’re here · [\\d.]+ mi · ✓ GPS$'), pap[0]);
    assert.equal(late.key, 'gapi_' + ID, 'picked: the course he is at');
});
