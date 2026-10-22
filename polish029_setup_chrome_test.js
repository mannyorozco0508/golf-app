// ============================================================================
// POLISH 029 (setup) IN REAL CHROME, phone size (393x852; 375x667 for the layout shots).
//   #5   The GPS door with NO SIGNAL stays on Course & Tees: an offline line, never the old Road
//        Trip / Game Day lobby or its red "not started"; each resumable round once, no finished
//        round. The course and tee can be picked; when the signal is back the round's code is
//        asked for by itself and the new round's page opens on the picked course.
//   #11  First time at a course: a MIDDLE tee (White at a Papago-shaped course), not the tips; TEES
//        right under the picked course, above NEAR YOU.
//   #35  The start chips read "Hole 1 · Hole 10 · Shotgun".
//   #1   The golfer is saved on the round's picked tee (no per-golfer tee copied from anywhere);
//        Game Day's golfer row shows the round's tee, not Black.
//   #3   Round Ready's Retire box is unchecked and writes nothing until it is ticked.
// Stub db only (the journey harness), synthetic course data only. After-shots go to
// ~/Desktop/claude-code-reports/029/fixed/.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
if (!fs.existsSync(path.join(__dirname, 'simple-flow.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const SHOTS = path.join(os.homedir(), 'Desktop/claude-code-reports/029/fixed');
const PAP = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: i === 0 ? 5 : 4, hcpIndex: i + 1 }));
const TEE = (name, y, r, sl) => ({ name, rating: r, slope: sl, parTotal: 73, totalYards: y, holes: PAP.map((h) => ({ par: h.par, yardage: Math.round(y / 18) })) });
// Papago's real tee list (029 shot 04): Black is the tips; White is the middle plain tee.
const PAPAGO = { name: 'Papago Golf Club', data: PAP,
    tees: { male: [TEE('Black', 7419, 75.0, 130), TEE('Black/Blue', 7125, 73.2, 127), TEE('Blue', 6884, 72.0, 125), TEE('Blue/White', 6662, 71.0, 123),
                   TEE('White', 6475, 70.1, 120), TEE('White/Green', 6074, 68.2, 117), TEE('Green', 5830, 66.9, 115), TEE('Gold', 5435, 65.0, 111)] },
    location: { city: 'Phoenix', state: 'AZ', latitude: 33.4560, longitude: -111.9480 } };
// URGENT-060: the golfer ON Papago (its course point) - only within ~0.5 mi is a course auto-picked.
const HERE = { latitude: 33.4578, longitude: -111.9603, accuracy: 10 };
const GEO = "try{ navigator.geolocation.getCurrentPosition = function (ok) { setTimeout(function(){ ok({ coords: " + JSON.stringify(HERE) + " }); }, 50); }; }catch(e){}";
// NO SIGNAL, as the phone reports it: navigator.onLine false while localStorage u29off = 1, and the
// code check (code-issuer.js) times out the way it does with no socket.
const OFFLINE = "(function(){ var off = function(){ try { return localStorage.getItem('u29off') === '1'; } catch (e) { return false; } };"
    + " try { Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: function () { return !off(); } }); } catch (e) {}"
    + " document.addEventListener('DOMContentLoaded', function () { var real = window.issueUniqueCode; if (typeof real !== 'function') return;"
    + "  window.issueUniqueCode = function (o) { if (off()) { window.__mintRefused = (window.__mintRefused || 0) + 1; return new Promise(function (_, no) { setTimeout(function () { var e = new Error('timed out'); e.code = 'timeout'; no(e); }, 300); }); } return real(o); }; });"
    + "})();";
// This phone's rounds: Dobson unfinished (thru 5, 2 scores waiting) - also the Resume pointer - and
// Papago FINISHED (thru 18).
function round(code, course, key, thru) {
    const r = wizardSavedRound({ code, golfers: 1, ownerUid: 'anon-cold', thru, flights: false, names: ['Test A'], courseData: PAP,
        overrides: { activeCourseKey: key, courseName: course, groupSizeOverrides: { 0: 1 } } });
    delete r.moneyPool; delete r.sideMatches; r.gameFormat = 'stroke';
    return r;
}
const DOB = round('TC47A7', 'Dobson Ranch Golf Course', 'gca_dobson', 5), FIN = round('95MFW4', 'Papago Golf Club (Papago)', 'az_papago', 18);
const Q = [6, 7].map((h, i) => ({ id: 'op' + i, path: 'events/TC47A7/scores/p101_h' + h, type: 'set', value: 4, coalesceKey: null, ts: Date.now() - 1000 + i, v: 'v' + i, tries: 0 }));
const SEED = "try{ if (!localStorage.getItem('u29seed')) { localStorage.setItem('u29seed','1');"
    + " localStorage.setItem('golfapp_snap_v1_TC47A7', " + JSON.stringify(JSON.stringify({ at: Date.now() - 60000, data: DOB, meta: { group: '1' } })) + ");"
    + " localStorage.setItem('golfapp_snap_v1_95MFW4', " + JSON.stringify(JSON.stringify({ at: Date.now() - 3600000, data: FIN, meta: { group: '1' } })) + ");"
    + " localStorage.setItem('golfapp_wq_v1', " + JSON.stringify(JSON.stringify(Q)) + ");"
    + " localStorage.setItem('lastRoomCode', 'TC47A7');"
    + " localStorage.setItem('hardpan_last_round', JSON.stringify({ code: 'TC47A7', at: Date.now() - 60000, course: 'Dobson Ranch Golf Course', group: '1' })); } }catch(e){}";

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) {} } });
async function open(extraDb, vp) {
    const j = await openJourney({ db: Object.assign({ events: {}, global_courses: { az_papago: PAPAGO }, trips: {}, organizers: {}, tournaments: {} }, extraDb || {}),
        viewport: vp || { width: 393, height: 852 }, webgl: true, preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + GEO + OFFLINE + SEED });
    journeys.push(j);
    try { await j.cdp('Browser.grantPermissions', { permissions: ['geolocation'] }); await j.cdp('Emulation.setGeolocationOverride', HERE); } catch (e) {}
    return j;
}
const ev = (j, x) => j.evaluate(x);
async function until(j, expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 10000)) { try { if (await ev(j, expr)) return true; } catch (e) {} await sleep(150); } return false; }
async function click(j, sel) { assert.ok(await ev(j, '(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.click(); return true;})()'), 'no ' + sel); }
const KEY = "document.getElementById('course-select').value";
const TEE_ON = "(function(){ var b = document.querySelector('#sf .sf-tee.sf-sel .n'); return b ? b.textContent : ''; })()";
const SCREEN = "JSON.stringify((function(){ var sf = document.getElementById('sf'), t = sf ? sf.innerText : ''; var tw = document.getElementById('ui-toast-wrap');"
    + " return { open: !!sf && sf.style.display !== 'none', text: t, offline: (document.getElementById('sf-offline') || {}).innerText || '',"
    + " resume: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-resume]'), function (a) { return a.getAttribute('data-sf-resume') + ' ' + a.innerText.replace(/\\n/g, ' | '); }),"
    + " toast: tw ? tw.innerText : '', btn: (document.querySelector('#sf [data-sf=retrycode].sf-cta') || {}).innerText || '', at: location.pathname.split('/').pop() + location.search,"
    + " chips: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-start]'), function (b) { return b.textContent; }) }; })())";

test('#5 #11 #35 #1: the GPS door with no signal stays on Course & Tees; the middle tee, under the course; the round saves the golfer on the picked tee', { timeout: 240000 }, async () => {
    // (the rounds are on the server too: Home drops a Resume pointer the server says is gone)
    const j = await open({ events: { TC47A7: DOB, '95MFW4': FIN } });
    await j.goto(fileUrl('home.html', ''), 2500);
    await ev(j, "localStorage.setItem('u29off', '1'); 1");
    await click(j, '[data-hp-act="sgpsdoor"]');
    assert.ok(await until(j, "/admin\\.html/.test(location.pathname) && !!document.getElementById('sf-offline')", 20000), 'the offline Course & Tees screen');
    // The code check is refused (no signal) - and the screen stays.
    assert.ok(await until(j, "(window.__mintRefused || 0) >= 1", 15000), 'the round code was asked for');
    await sleep(800);
    assert.ok(await until(j, KEY + " === 'az_papago' && !!document.querySelector('#sf [data-sf-tee]') && /White/.test(" + TEE_ON + ")", 20000), 'Papago picked, its tees, the middle tee');
    const s = JSON.parse(await ev(j, SCREEN));
    assert.equal(s.open, true);
    assert.match(s.at, /^admin\.html\?start=quick/, 'no round code: still the code-minting page');
    assert.match(s.offline, /No signal\. A new round needs one bar/);
    assert.doesNotMatch(s.toast, /not started/, 'the lobby\'s red "not started" showed: ' + s.toast);
    assert.match(s.text, /^‹?\s*GPS\s*\n?Where are you playing\?/m);
    assert.doesNotMatch(s.text, /Road Trip|What are you setting up/, 'the old lobby');
    assert.deepEqual(s.resume.map((r) => r.split(' ')[0]), ['TC47A7'], 'each unfinished round once, no finished round: ' + JSON.stringify(s.resume));
    assert.match(s.resume[0], /^TC47A7 Dobson Ranch \| Thru 7 · 2 waiting/);
    assert.match(s.btn, /^Start Round/);
    // URGENT-060 (was #11: TEES above NEAR YOU): NEAR YOU (the 3 closest, the picked course its first row),
    // then the picked course's TEES; the middle tee, not the tips.
    const ti = s.text.indexOf('TEES'), ni = s.text.indexOf('NEAR YOU'), ci = s.text.indexOf('Papago Golf Club');
    assert.ok(ni >= 0 && ni < ci && ci < ti, 'NEAR YOU, then the course, then TEES: ' + [ni, ci, ti]);
    assert.equal(await ev(j, TEE_ON), 'White');
    // #35
    assert.deepEqual(s.chips, ['Hole 1', 'Hole 10', 'Shotgun']);
    fs.mkdirSync(SHOTS, { recursive: true });
    await ev(j, "document.getElementById('sf').scrollTop = 0; 1"); await sleep(300);
    await j.shot(path.join(SHOTS, '5-after.png'));
    await ev(j, "(function(){ var t = document.querySelector('#sf .sf-tee.sf-sel'); if (t) t.scrollIntoView({ block: 'center' }); return 1; })()"); await sleep(300);
    await j.shot(path.join(SHOTS, '11-after.png'));
    await ev(j, "(function(){ var t = document.querySelector('#sf [data-sf-start]'); if (t) t.scrollIntoView({ block: 'center' }); return 1; })()"); await sleep(300);
    await j.shot(path.join(SHOTS, '35-after.png'));
    // The golfer taps Blue (offline) - carried into the round.
    await click(j, '#sf [data-sf-tee="male:2"]');
    assert.equal(await ev(j, TEE_ON), 'Blue');
    // Signal back: the code is asked for by itself, and the new round's page opens on Papago, Blue.
    await ev(j, "localStorage.setItem('u29off', '0'); window.dispatchEvent(new Event('online')); 1");
    assert.ok(await until(j, "/admin\\.html/.test(location.pathname) && /game=/.test(location.search) && !!document.querySelector('#sf [data-sf=startgps]') && " + KEY + " === 'az_papago' && /Blue/.test(" + TEE_ON + ")", 30000),
        'the new round page on Papago, Blue: ' + await ev(j, SCREEN));
    assert.equal(await ev(j, "!!document.getElementById('sf-offline')"), false, 'online: no offline line');
    // #1: Start Round; the round's tee is Blue and the golfer has no tee of their own (no Black).
    assert.ok(await until(j, "/^Start Round$/.test(document.querySelector('[data-sf=startgps]').innerText)", 20000), 'Start Round live');
    await click(j, '[data-sf="startgps"]');
    // The Dobson round in progress on this phone (thru 7): "End your Dobson round … start at Papago?" -> Start new.
    if (await until(j, "!!document.querySelector('#sf [data-sf=asknew]')", 5000)) await click(j, '#sf [data-sf="asknew"]');
    assert.ok(await until(j, "/index\\.html/.test(location.pathname) && (typeof currentData !== 'undefined' && !!currentData && !!currentData.players)", 30000), 'the round');
    const h = await j.harvest();
    const codes = Object.keys(h.events || {}).filter((c) => c !== 'TC47A7' && c !== '95MFW4');
    assert.equal(codes.length, 1, 'one new round written: ' + codes);
    const r = h.events[codes[0]];
    assert.equal(r.activeCourseKey, 'az_papago');
    assert.equal(r.teeRating.teeKey, 'male:2');
    assert.match(r.teeRating.teeName, /Blue$/);
    assert.equal(r.players.length, 1);
    assert.equal(r.players[0].tee, undefined, 'the golfer was saved on another tee: ' + JSON.stringify(r.players[0].tee));
});

test('#5 / #11 at 375x667: the offline screen and the tees fit (layout shots)', { timeout: 120000 }, async () => {
    const j = await open({ events: { TC47A7: DOB, '95MFW4': FIN } }, { width: 375, height: 667 });
    await j.goto(fileUrl('home.html', ''), 2500);
    await ev(j, "localStorage.setItem('u29off', '1'); 1");
    await click(j, '[data-hp-act="sgpsdoor"]');
    assert.ok(await until(j, "!!document.getElementById('sf-offline') && /White/.test(" + TEE_ON + ")", 30000), 'offline screen with the tees');
    const w = JSON.parse(await ev(j, "JSON.stringify({ sw: document.getElementById('sf').scrollWidth, cw: document.getElementById('sf').clientWidth })"));
    assert.ok(w.sw <= w.cw, 'no sideways scroll: ' + JSON.stringify(w));
    await ev(j, "document.getElementById('sf').scrollTop = 0; 1"); await sleep(300);
    await j.shot(path.join(SHOTS, '5-after-375.png'));
    await ev(j, "(function(){ var t = document.querySelector('#sf .sf-tee.sf-sel'); if (t) t.scrollIntoView({ block: 'center' }); return 1; })()"); await sleep(300);
    await j.shot(path.join(SHOTS, '11-after-375.png'));
});

test('#1 Game Day: the new golfer row shows the round\'s tee (White), not Black; #3 the Retire box is unchecked and writes nothing', { timeout: 120000 }, async () => {
    const old = round('OLD1AA', 'Papago Golf Club', 'az_papago', 5);
    const j = await open({ events: { OLD1AA: old } });
    await j.goto(fileUrl('admin.html', 'game=NEWGD1&eventType=quick'), 3000);
    await ev(j, "localStorage.setItem('golfapp_saved_rounds', JSON.stringify([{ code: 'OLD1AA', at: Date.now() - 60000 }])); 1");
    const up = await until(j, "typeof selectCourse === 'function' && typeof goToWizardStep === 'function' && document.getElementById('admin-screen').style.display !== 'none'", 20000);
    assert.ok(up, 'Round Setup: ' + await ev(j, "JSON.stringify({ at: location.href, a: (document.getElementById('admin-screen') || {style:{}}).style.display, l: (document.getElementById('lobby-screen') || {style:{}}).style.display, t: document.body ? document.body.innerText.slice(0, 300) : '' })"));
    // Game Day: a golfer row first (built on the default, the tips), then the course's White tee.
    await ev(j, "selectCourse('az_papago', 'Papago Golf Club'); 1");
    assert.ok(await until(j, "document.getElementById('tee-rating-select').options.length === 8", 15000), 'Papago tees');
    await ev(j, "(function(){ var s = document.getElementById('tee-rating-select'); s.value = 'male:4'; applySelectedTee(); goToWizardStep(WIZARD_STEP_OF.players); return 1; })()");
    await sleep(600);
    const rows = JSON.parse(await ev(j, "JSON.stringify(Array.prototype.map.call(document.querySelectorAll('#player-list .player-row'), function (r) { var s = r.querySelector('.p-tee-input'); return { v: s && s.value, short: (r.querySelector('.p-tee-short') || {}).textContent }; }))"));
    assert.ok(rows.length >= 1, 'a golfer row');
    rows.forEach((r) => { assert.equal(r.v, 'male:4', 'the row is on ' + r.short + ', not the round\'s White'); assert.equal(r.short, 'White'); });
    await ev(j, "(function(){ var r = document.querySelector('#player-list .player-row'); if (r) r.scrollIntoView({ block: 'center' }); return 1; })()"); await sleep(300);
    await j.shot(path.join(SHOTS, '1-after.png'));
    // #3: Round Ready for a new round on the same course, same day, same golfer.
    await ev(j, "(function(){ document.getElementById('admin-screen').style.display = 'none'; document.getElementById('lobby-screen').style.display = 'none'; document.getElementById('round-ready-screen').style.display = 'block';"
        + " window.__retire = null; offerRetire('NEWGD1', { players: [{ id: 101, name: 'Test A' }], activeCourseKey: 'az_papago', courseName: 'Papago Golf Club' }, 'anon-cold').then(function (c) { window.__retire = c || 'none'; }); return 1; })()");
    assert.ok(await until(j, "window.__retire !== null", 10000));
    const rr = JSON.parse(await ev(j, "JSON.stringify({ code: window.__retire, html: document.getElementById('rr-retire').innerHTML, box: (document.getElementById('rr-retire-box') || {}).checked })"));
    assert.equal(rr.code, 'OLD1AA');
    assert.equal(rr.box, false, 'the Retire box is pre-checked');
    let h = await j.harvest();
    assert.equal((h.events.OLD1AA || {}).supersededBy, undefined, 'supersededBy written before the tick');
    await ev(j, "(function(){ var b = document.getElementById('rr-retire-box'); b.scrollIntoView({ block: 'center' }); return 1; })()"); await sleep(300);
    await j.shot(path.join(SHOTS, '3-after.png'));
    await click(j, '#rr-retire-box');
    await sleep(500);
    h = await j.harvest();
    assert.equal(h.events.OLD1AA.supersededBy, 'NEWGD1', 'the tick writes it');
    await click(j, '#rr-retire-box');   // untick: cleared
    await sleep(500);
    h = await j.harvest();
    assert.ok(!h.events.OLD1AA.supersededBy, 'the untick clears it');
    // Another course today: not offered.
    await ev(j, "window.__retire = null; offerRetire('NEWGD1', { players: [{ id: 101, name: 'Test A' }], activeCourseKey: 'gca_dobson', courseName: 'Dobson Ranch' }, 'anon-cold').then(function (c) { window.__retire = c || 'none'; }); 1");
    assert.ok(await until(j, "window.__retire !== null", 10000));
    assert.equal(await ev(j, 'window.__retire'), 'none', 'offered for a round on another course');
});
