// ============================================================================
// URGENT-035 - THE COURSE SEARCH BOX TYPES LIKE ANY TEXT BOX, IN REAL CHROME AT 4x CPU THROTTLE.
//
// Manny, 6:05 PM (b3911f4): "When I'm typing in the course name it's really hard to type… there's
// like a stutter". GPS door > "Where are you playing?" > Search courses.
// THE CAUSE: 250 ms after a letter the WHOLE screen was redrawn (innerHTML), the search box with it -
// the box being typed in was thrown away for a new one, focused again and its cursor put at the end
// (and again when the online search said "Searching all courses…" and when its answer came).
// Now the box is never redrawn: everything around it is.
//   1  "Aguila Golf" typed key by key (real key events): every letter lands, in order; the cursor
//      stays at the end; the same box all the way (never replaced, never loses focus); per-letter
//      time measured; ONE online search ('aguila'), after the pause.
//   2  the local list filters while typing (no pause needed).
//   3  the cursor never jumps: a letter typed mid-word stays mid-word, the cursor after it.
//   4  a stale online answer ('agui', slow) never overwrites a newer one ('aguila').
// gps-live stood in (the real ones are our Cloud Functions); its search calls are counted.
// Synthetic course data only.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'simple-flow.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const AG = [{ id: '888001', club: 'Aguila Golf Course', course: 'Aguila Golf Course', name: 'Aguila Golf Course', city: 'Laveen', state: 'AZ', holes: 18, gps: true }];
const STALE = [{ id: '888999', club: 'Stale Agui Club', course: 'Stale Agui Club', name: 'Stale Agui Club', city: 'Nowhere', state: 'AZ', holes: 18, gps: false }];
// search(q): 'agui' answers late (2.5 s) with a stale row; anything else answers in 300 ms. Counted.
const LIVE = "(function(){ var real; window.__searches = []; Object.defineProperty(window, 'HardPanGpsLive', { configurable: true, get: function () { return real && Object.assign({}, real, {"
    + " on: function () { return true; },"
    + " find: function (name) { return Promise.resolve({ status: 'none', tried: [name] }); },"
    + " search: function (q) { window.__searches.push(q); var slow = q === 'agui'; var hits = slow ? " + JSON.stringify(STALE) + " : /aguila/.test(q) ? " + JSON.stringify(AG) + " : [];"
    + "   return new Promise(function (ok) { setTimeout(function () { ok({ status: 'ok', results: hits }); }, slow ? 2500 : 300); }); },"
    + " course: function () { return Promise.resolve({ status: 'none' }); } }); },"
    + " set: function (v) { real = v; } }); })();"
    + "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{liveTest:true});}});})();";
const X = (e) => ({ expression: e });
// The probe: the box at the start, every frame checks it is the same box, still focused, cursor at the end;
// per key: keydown (its own timestamp, so time waiting behind other work counts) to the frame after it.
const PROBE = X("(function(){ var q = document.getElementById('sf-q'); var k = window.__k = { q0: q, lat: [], vals: [], replaced: 0, blurred: 0, cursorOff: 0, frames: 0, long: 0, longMs: 0 };"
    + " document.addEventListener('keydown', function (ev) { if (ev.target.id !== 'sf-q') return; var t0 = ev.timeStamp; requestAnimationFrame(function () { setTimeout(function () { k.lat.push(Math.round(performance.now() - t0)); }, 0); }); }, true);"
    + " document.addEventListener('input', function (ev) { if (ev.target.id === 'sf-q') k.vals.push(ev.target.value); }, true);"
    + " try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { if (k.on) { k.long++; k.longMs += e.duration; } }); }).observe({ type: 'longtask' }); } catch (e) {}"
    + " (function f() { if (k.on) { k.frames++; if (!k.q0.isConnected || document.getElementById('sf-q') !== k.q0) k.replaced++; else if (document.activeElement !== k.q0) k.blurred++; else if (k.q0.selectionStart !== k.q0.value.length && !k.mid) k.cursorOff++; } requestAnimationFrame(f); })();"
    + " return 'probe'; })()");
const ON = (v) => X('window.__k.on = ' + v + '; 1');
const KEY = (c) => [{ cdp: { method: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: c, text: c, unmodifiedText: c } } }, { cdp: { method: 'Input.dispatchKeyEvent', params: { type: 'keyUp', key: c } } }];
const TYPE = (s, gap) => [].concat(...s.split('').map((c) => KEY(c).concat({ sleep: gap })));
const READ = X("JSON.stringify((function(){ var k = window.__k, q = document.getElementById('sf-q'); var lat = k.lat.slice().sort(function(a,b){return a-b;});"
    + " return { value: q.value, sel: q.selectionStart, same: q === k.q0, focused: document.activeElement === q, vals: k.vals, replaced: k.replaced, blurred: k.blurred, cursorOff: k.cursorOff, frames: k.frames,"
    + " lat: k.lat, med: lat[Math.floor(lat.length / 2)], p90: lat[Math.floor(lat.length * 0.9)], max: lat[lat.length - 1], long: k.long, longMs: Math.round(k.longMs), searches: window.__searches,"
    + " rows: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-course]'), function(b){ return b.innerText.split('\\n')[0]; }),"
    + " webRows: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-web]'), function(b){ return b.innerText.split('\\n')[0]; }), results: /RESULTS/.test(document.getElementById('sf').innerText) }; })())");
const open = (steps) => arriveCold({ url: fileUrl('admin.html', 'start=quick'), db: { events: {}, global_courses: {}, trips: {}, tournaments: {}, organizers: {} }, settleMs: 2500, viewport: { width: 393, height: 852 },
    preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + LIVE + "try{sessionStorage.setItem('hardpan_simple_flow','gps');}catch(e){}"
        + "if (/admin\\.html$/.test(location.pathname)) document.addEventListener('DOMContentLoaded', function () { var s = document.createElement('script'); s.src = 'gps-live.js'; document.head.appendChild(s); });", steps: [
        { cdp: { method: 'Emulation.setGeolocationOverride', params: { latitude: 33.4560, longitude: -111.9480, accuracy: 10 } } },
        { cdp: { method: 'Browser.grantPermissions', params: { permissions: ['geolocation'] } } },
        { waitFor: "!!document.getElementById('sf-q') && !!window.HardPanGpsLive && document.querySelectorAll('#sf [data-sf-course]').length > 0", timeout: 40000 }, { sleep: 1500 },
        { cdp: { method: 'Emulation.setCPUThrottlingRate', params: { rate: 4 } } },
        { tap: '#sf-q' }, { sleep: 300 }, PROBE, ON(true)].concat(steps) });
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const GAP = Number(process.env.U035_GAP || 250);   // ms between letters (thumb typing on a phone)

test('"Aguila Golf" key by key at 4x throttle: every letter in order, cursor at the end, the same box, one online search', { timeout: 150000 }, async () => {
    const r = await open(TYPE('Aguila Golf', GAP).concat({ sleep: 2500 }, ON(false), READ));
    assert.equal(r.ok, true, r.reason);
    const [s] = J(r);
    console.log('# 035 typing (4x CPU, ' + GAP + ' ms/letter): per-letter ms median ' + s.med + ', p90 ' + s.p90 + ', max ' + s.max + ' | long tasks ' + s.long + ' (' + s.longMs + ' ms) | box replaced in ' + s.replaced + ' frames, blurred ' + s.blurred + ', cursor off ' + s.cursorOff + ' | searches ' + JSON.stringify(s.searches));
    const want = 'Aguila Golf'.split('').map((c, i, a) => a.slice(0, i + 1).join(''));
    assert.deepEqual(s.vals, want, 'every letter lands, in order');
    assert.equal(s.value, 'Aguila Golf');
    assert.equal(s.same, true, 'the same input element: never re-rendered');
    assert.equal(s.replaced, 0, 'the box was never swapped out while typing');
    assert.equal(s.focused, true);
    assert.equal(s.blurred, 0, 'never lost focus');
    assert.equal(s.cursorOff, 0, 'the cursor stayed at the end');
    assert.equal(s.sel, 11);
    assert.deepEqual(s.searches, ['aguila'], 'online: one call, after the pause ("golf" dropped)');
    assert.deepEqual(s.webRows, ['Aguila Golf Course']);
});

test('the local list filters while typing, without waiting for a pause', { timeout: 120000 }, async () => {
    // 120 ms a letter: no pause at all until the end. The list is Papago's after "Pap", before the pause.
    const r = await open(TYPE('Pap', 120).concat({ sleep: 60 }, READ, TYPE('ago', 120), { sleep: 60 }, READ, ON(false)));
    assert.equal(r.ok, true, r.reason);
    const [pap, papago] = J(r);
    for (const s of [pap, papago]) {
        assert.equal(s.results, true, 'RESULTS drawn while typing: ' + s.value);
        assert.ok(s.rows.length > 0 && s.rows.every((t) => /papago/i.test(t)), 'only Papago rows: ' + JSON.stringify(s.rows));
    }
    assert.equal(papago.same, true);
    assert.deepEqual(papago.searches, [], 'Papago is local: no online search');
});

test('the cursor never jumps: a letter typed mid-word stays there, the cursor after it', { timeout: 120000 }, async () => {
    const r = await open(TYPE('Encanto', 150).concat({ sleep: 1200 }, X("window.__k.mid = 1; var q = document.getElementById('sf-q'); q.setSelectionRange(2, 2); 1"),
        KEY('x'), { sleep: 1500 }, KEY('y'), { sleep: 1500 }, ON(false), READ));
    assert.equal(r.ok, true, r.reason);
    const [s] = J(r);
    assert.equal(s.value, 'Enxycanto', 'letters typed mid-word land mid-word');
    assert.equal(s.sel, 4, 'the cursor stays right after them');
    assert.equal(s.same, true);
});

test('a stale online answer never overwrites a newer one', { timeout: 120000 }, async () => {
    // 'agui' is asked first and answers late (2.5 s); 'aguila' is asked after and answers first.
    const r = await open(TYPE('agui', 120).concat({ sleep: 1100 }, TYPE('la', 120), { sleep: 4500 }, ON(false), READ));
    assert.equal(r.ok, true, r.reason);
    const [s] = J(r);
    assert.deepEqual(s.searches, ['agui', 'aguila']);
    assert.deepEqual(s.webRows, ['Aguila Golf Course'], 'the newer answer stands');
    assert.equal(s.same, true);
});
