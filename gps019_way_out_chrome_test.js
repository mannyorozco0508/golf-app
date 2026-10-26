// ============================================================================
// URGENT-019 - THE WAY OUT OF A GPS ROUND (features.simpleFlow), IN REAL CHROME, iPhone 15 size.
// Manny, 2:52 AM: stuck in a Talking Stick round, no way to switch courses or start over.
//   1  No scores yet: the GPS "‹" -> the Course & Tees screen for a NEW round (no lobby, no
//      setup steps); Dobson in NEAR YOU -> Start GPS -> the new round. Taps counted. Home then
//      offers the new round as Resume, never the empty Talking Stick one.
//   2  Scores in: Round Menu > "⛳ Change course" asks first; yes -> Course & Tees; Home still
//      offers the scored round as Resume (until a new one starts).
//   3  Round Menu > "🏠 Leave round › Home" -> Home -> Resume -> the GPS, on the same hole.
//   4  Round settings > QUICK EDITS has "⛳ Change course"; Tools > Other course is the same
//      Change course (no Full setup).
// Stub db only (the journey harness keeps writes across page hops).
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-round.js'))) { console.log('Consumer tree: no simple-flow round - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const CD = makeCourseData(18);
const TEE = (name, y, r, sl) => ({ name, rating: r, slope: sl, parTotal: 72, totalYards: y, holes: CD.map((h) => ({ par: h.par, yardage: Math.round(y / 18) })) });
const DOBSON = { name: 'Dobson Ranch Golf Course', data: CD, tees: { male: [TEE('Back', 6586, 71.1, 123), TEE('White', 6187, 69.0, 118)], female: [TEE('Red', 5645, 71.4, 120)] } };
function round(code, thru) {
    const r = wizardSavedRound({ code, golfers: 1, ownerUid: 'anon-cold', thru, flights: false, names: ['Manny'], courseData: CD,
        overrides: { activeCourseKey: 'az_talking_oodham', courseName: "Talking Stick Golf Club (O'odham)", groupSizeOverrides: { 0: 1 } } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed; delete r.sideMatches;
    r.additionalGameInstances = {}; r.additionalGames = {}; r.gameFormat = 'stroke';
    if (!thru) r.scores = {};
    return r;
}
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const PRE = (code) => 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true })
    + "try{ navigator.geolocation.getCurrentPosition = function (ok) { setTimeout(function(){ ok({ coords: { latitude: 33.5399, longitude: -111.8704, accuracy: 10 } }); }, 50); }; }catch(e){}"
    + "try{if(!sessionStorage.getItem('u19seed')){sessionStorage.setItem('u19seed','1');localStorage.setItem('golfapp_me_" + code + "','101');sessionStorage.setItem('groupPickDismissed:" + code + "','1');"
    + "localStorage.setItem('hardpan_last_round', JSON.stringify({ code: '" + code + "', at: Date.now(), course: \"Talking Stick Golf Club (O'odham)\" }));localStorage.setItem('lastRoomCode','" + code + "');"
    + "localStorage.setItem('hardpan_round_side','gps|" + code + "');}}catch(e){}";
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) {} } });
async function open(code, thru) {
    const j = await openJourney({ db: { events: { [code]: round(code, thru) }, global_courses: { gca_zgkynkan: DOBSON }, trips: {}, organizers: {}, tournaments: {} },
        viewport: { width: 393, height: 852 }, webgl: true, preScript: PRE(code) });
    journeys.push(j);
    try { await j.cdp('Browser.grantPermissions', { permissions: ['geolocation'] }); await j.cdp('Emulation.setGeolocationOverride', { latitude: 33.5399, longitude: -111.8704, accuracy: 10 }); } catch (e) {}
    await j.goto(fileUrl('index.html', 'game=' + code + '&group=1'), 4500);
    return j;
}
const ev = (j, x) => j.evaluate(x);
async function until(j, expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 10000)) { try { if (await ev(j, expr)) return true; } catch (e) {} await sleep(200); } return false; }
async function click(j, sel) { assert.ok(await ev(j, '(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.click(); return true;})()'), 'no ' + sel); }
const GEO = "(function(){ try { navigator.geolocation.getCurrentPosition = function (ok) { ok({ coords: { latitude: 33.5399, longitude: -111.8704, accuracy: 10 } }); }; } catch (e) {} return 1; })()";
async function toGps(j) {
    if (await ev(j, "window.HardPanGps && HardPanGps.side && HardPanGps.side() === 'gps'")) return;
    await ev(j, "(function(){ var b=document.querySelector('#hp-card-bet [data-hp-bar=gps]') || document.getElementById('fd-gps-btn'); if (b) b.click(); else HardPanGps.showSide('gps'); return 1; })()");
    assert.ok(await until(j, "HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-back')", 10000), 'the map is up');
}

test('no scores: GPS "‹" -> Course & Tees for a new round -> Dobson -> Start GPS; Home offers the new round, not the empty one', { timeout: 120000 }, async () => {
    const j = await open('TSNONE', 0);
    await toGps(j);
    let taps = 0;
    const back = JSON.parse(await ev(j, "(function(){ var b=document.querySelector('#gps-overlay .gps-back'); var r=b.getBoundingClientRect(); return JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top), vis: getComputedStyle(b).display !== 'none' }); })()"));
    assert.ok(back.vis && back.w >= 44 && back.x < 80 && back.y < 140, 'a "‹" top-left, 44px: ' + JSON.stringify(back));
    await click(j, '#gps-overlay .gps-back'); taps++;
    assert.ok(await until(j, "/admin\\.html/.test(location.pathname) && /game=/.test(location.search) && (!!document.querySelector('#sf [data-sf-course]') || !!document.querySelector('#sf [data-sf-playing]'))", 30000), 'Course & Tees for a new round');   // (076: at a course, its PLAYING card)
    const s1 = JSON.parse(await ev(j, "JSON.stringify({ h1: (document.querySelector('#sf h1')||{}).textContent, rows: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-course]'), function (b) { return b.getAttribute('data-sf-course'); }), code: new URLSearchParams(location.search).get('game') })"));
    assert.equal(s1.h1, 'Where are you playing?');
    assert.notEqual(s1.code, 'TSNONE');
    // Dobson: picked already (the closest GPS course with a card here) or one tap in the list.
    if (!(await ev(j, "document.getElementById('course-select').value === 'gca_zgkynkan'"))) {
        // URGENT-060: NEAR YOU is the 3 closest only - Dobson (12 mi from Talking Stick) comes from search.
        // 076 (option A): the course he is at is the PLAYING card, alone - Change brings back the box and NEAR YOU.
        if (await ev(j, "!!document.querySelector('#sf-course [data-sf=change]')")) { await click(j, '#sf-course [data-sf=change]'); await until(j, "!!document.getElementById('sf-q')", 5000); }
        if (!s1.rows.includes('gca_zgkynkan')) {
            await ev(j, "(function(){ var i=document.getElementById('sf-q'); i.value='dobson'; i.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()");
            assert.ok(await until(j, "!!document.querySelector('#sf [data-sf-course=\"gca_zgkynkan\"]')", 10000), 'Dobson found by search');
        }
        await click(j, '#sf [data-sf-course="gca_zgkynkan"]'); taps++;
    }
    assert.ok(await until(j, "document.getElementById('course-select').value === 'gca_zgkynkan' && !!document.querySelector('#sf [data-sf-tee]')", 15000), 'Dobson picked, its tees');
    await click(j, '[data-sf="startgps"]'); taps++;
    assert.ok(await until(j, "/index\\.html/.test(location.pathname) && new URLSearchParams(location.search).get('game') !== 'TSNONE'", 30000), 'the new round');
    const newCode = await ev(j, "new URLSearchParams(location.search).get('game')");
    await sleep(1500);
    console.log('TAPS (GPS ‹ ... Start GPS):', taps);
    assert.ok(taps <= 3, 'at most 3 taps incl. Start GPS: ' + taps);
    await j.goto(fileUrl('home.html', ''), 3500);
    const home = await ev(j, "(document.getElementById('hs-progress') || {}).innerText || ''");
    assert.match(home, /Dobson/, 'Resume = the new round: ' + home);
    assert.doesNotMatch(home, /Talking Stick/, 'the empty Talking Stick round is not offered');
    assert.ok(newCode);
});

test('scores in: Round Menu > Change course asks first; yes -> Course & Tees; Home still offers the scored round', { timeout: 120000 }, async () => {
    const j = await open('TSSCORE', 3);
    await toGps(j);
    await ev(j, 'HardPanRound.openMenu()');
    await sleep(400);
    const menu = await ev(j, "document.getElementById('hp-sheet').innerText");
    assert.match(menu, /⛳ Change course[\s\S]*this one stays in History[\s\S]*🏠 Leave round › Home/);
    await click(j, '#hp-sheet [data-hs="change-course"]');
    assert.ok(await until(j, "!!document.getElementById('ui-sheet-yes')", 4000), 'it asks first');
    assert.match(await ev(j, "document.getElementById('ui-sheet').innerText"), /Start a new round at another course\?[\s\S]*stays in History/);
    assert.match(await ev(j, 'location.search'), /game=TSSCORE/, 'nothing moved before the answer');
    await click(j, '#ui-sheet-yes');
    assert.ok(await until(j, "/admin\\.html/.test(location.pathname) && !!document.querySelector('#sf h1')", 30000), 'Course & Tees');
    await j.goto(fileUrl('home.html', ''), 3500);
    assert.match(await ev(j, "(document.getElementById('hs-progress') || {}).innerText || ''"), /Talking Stick[\s\S]*Thru 3/, 'the scored round is still Resume');
});

test('Leave round > Home > Resume: back on the GPS, the same hole', { timeout: 120000 }, async () => {
    const j = await open('TSLEAVE', 3);
    await toGps(j);
    await ev(j, 'HardPanGps.setHole(5)');
    await sleep(800);
    const h0 = await ev(j, 'HardPanGps.hole()');
    await ev(j, 'HardPanRound.openMenu()');
    await sleep(300);
    await click(j, '#hp-sheet [data-hs="leave"]');
    assert.ok(await until(j, "/home\\.html/.test(location.pathname) && !!document.querySelector('#hs-progress [data-hp-open]')", 15000), 'Home with Resume');
    await click(j, '#hs-progress [data-hp-open]');
    assert.ok(await until(j, "/index\\.html/.test(location.pathname) && /game=TSLEAVE/.test(location.search) && typeof currentViewedHole !== 'undefined'", 20000), 'Resume opens the same round');
    await sleep(2500);
    // The round reopens on the side it was left on through the GPS's own landing rule (land()); the
    // harness's map does not auto-land, so the side is checked as stored and the map is opened once.
    assert.equal(await ev(j, "localStorage.getItem('hardpan_round_side')"), 'gps|TSLEAVE', 'left on the GPS - reopens on the GPS');
    assert.equal(await ev(j, 'currentViewedHole'), h0, 'the card is on the same hole');
    await toGps(j);
    await sleep(800);
    assert.equal(await ev(j, 'HardPanGps.hole()'), h0, 'the map is on the same hole');
});

test('Round settings QUICK EDITS has Change course; Tools > Other course is Change course (no Full setup)', { timeout: 120000 }, async () => {
    const j = await open('TSTOOLS', 0);
    await toGps(j);
    await ev(j, 'HardPanRound.openSettings()');
    assert.ok(await until(j, "!!document.querySelector('#hp-quick [data-hq=\"course\"]')", 5000), 'QUICK EDITS: Change course');
    await ev(j, "(function(){ if (typeof toggleRoundSheet === 'function') toggleRoundSheet(false); return 1; })()");
    await ev(j, "(function(){ var b=document.querySelector('#gps-overlay .gps-pick-course'); if (b) b.click(); return !!b; })()");
    assert.ok(await until(j, "/admin\\.html/.test(location.pathname) && !!document.querySelector('#sf h1')", 30000), 'Other course -> Course & Tees for a new round');
    assert.doesNotMatch(await ev(j, 'location.search'), /game=TSTOOLS/, 'a new round, not Full setup of this one');
});
