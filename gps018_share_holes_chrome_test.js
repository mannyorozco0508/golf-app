// ============================================================================
// URGENT-018 / Manny's OKs (2026-10-19), IN REAL CHROME, iPhone 15 size. Stub db only.
//   1  Shotgun: "let me change a group's hole on the share sheet" - the share step of a new
//      round with two groups: each group's first hole is a picker, written to
//      groupStartingHoles/<g> (the field the shotgun and the two-tee start already write).
//   2  "Just scores" (no GPS for the course) opens the CARD, from the GPS door too.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'simple-flow.js'))) { console.log('Consumer tree: no simple flow - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const CD = makeCourseData(18);
const TEE = (name, y, r, sl) => ({ name, rating: r, slope: sl, parTotal: 72, totalYards: y, holes: CD.map((h) => ({ par: h.par, yardage: Math.round(y / 18) })) });
const TEES = { male: [TEE('Back', 6586, 71.1, 123), TEE('White', 6187, 69.0, 118)], female: [TEE('Red', 5645, 71.4, 120)] };
const DB = () => ({ events: {}, global_courses: { gca_zgkynkan: { name: 'Dobson Ranch Golf Course', data: CD, tees: TEES } }, trips: {}, tournaments: {}, organizers: {} });
const BASE = 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true });
const GAMES_ON = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{features:Object.assign({},v&&v.features,{simpleGames:true})});}});})();";
const X = (e) => ({ expression: e });
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const HERE = [{ cdp: { method: 'Emulation.setGeolocationOverride', params: { latitude: 33.3759, longitude: -111.8778, accuracy: 10 } } },
    { cdp: { method: 'Browser.grantPermissions', params: { permissions: ['geolocation'] } } }];
const EIGHT = ['Ann 1', 'Ben 2', 'Cal 3', 'Dee 4', 'Eli 5', 'Fay 6', 'Gus 7', 'Hal 8'].join('\n');

test('share step: two groups, each with its own first hole - Group 2 off hole 7 is written to groupStartingHoles/2', { timeout: 150000 }, async () => {
    const r = await arriveCold({ url: fileUrl('home.html', ''), db: DB(), settleMs: 2000, viewport: { width: 393, height: 852 }, preScript: BASE + GAMES_ON, steps: [
        ...HERE,
        { tap: '[data-hp-act="snew"]' },
        { waitFor: "/game=/.test(location.search) && !!document.querySelector('#sf [data-sf-tee]')", timeout: 30000 }, { sleep: 500 },
        { tap: '[data-sf="next"]' }, { sleep: 300 }, { tap: '[data-sf-pmode="paste"]' }, { sleep: 200 },
        X("(function(){ var t = document.getElementById('sf-paste'); t.value = " + JSON.stringify(EIGHT) + "; t.dispatchEvent(new Event('input', { bubbles: true })); return 'pasted'; })()"),
        { tap: '[data-sf="pastedone"]' },
        { waitFor: "/8 golfers/.test(document.getElementById('sf').innerText)", timeout: 8000 },
        { tap: '[data-sf="next"]' }, { sleep: 300 },
        { tap: '[data-sf="start"]' },
        { waitFor: "!!document.getElementById('sf-code') && document.querySelectorAll('#sf [data-sf-ghole]').length === 2", timeout: 20000 }, { sleep: 300 },
        X("JSON.stringify({ picks: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-ghole]'), function (s) { return s.value; }) })"),
        X("(function(){ var s = document.querySelector('#sf [data-sf-ghole=\"2\"]'); s.value = '7'; s.dispatchEvent(new Event('change', { bubbles: true })); return 'set'; })()"),
        { sleep: 400 },
        X("JSON.stringify({ picks: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-ghole]'), function (s) { return s.value; }), writes: (window.__coldWrites || []).filter(function (w) { return /groupStartingHoles/.test(w.path); }).map(function (w) { return [w.path.replace(/^events\\/\\w+\\//, ''), w.value]; }), url: location.search })")] });
    assert.equal(r.ok, true, r.reason);
    const [first, after] = J(r);
    assert.deepEqual(first.picks, ['1', '1'], 'both off the round\'s hole');
    assert.deepEqual(after.picks, ['1', '7']);
    assert.deepEqual(after.writes, [['groupStartingHoles/2', 7]], 'one narrow write');
});

test('"Just scores": a course with no GPS opens the card (hardpan_round_side bets|), not the map', { timeout: 90000 }, async () => {
    const r = await arriveCold({ url: fileUrl('home.html', ''), db: DB(), settleMs: 2000, viewport: { width: 393, height: 852 },
        // No course has GPS on this phone: the doors' ready() answers no for every course.
        preScript: BASE + "(function(){ var t = setInterval(function () { if (window.HardPanDoors && HardPanDoors.ready && !HardPanDoors.__noGps) { var r0 = HardPanDoors.ready; HardPanDoors.ready = function () { return false; }; HardPanDoors.__noGps = 1; } }, 5); })();"
            // What the round page was handed, as it opens (before anything on it runs).
            + "if (/index\\.html$/.test(location.pathname)) { try { sessionStorage.setItem('u18_side_at_open', localStorage.getItem('hardpan_round_side') || ''); } catch (e) {} }", steps: [
            ...HERE,
            { tap: '[data-hp-act="sgpsdoor"]' },
            { waitFor: "/game=/.test(location.search) && !!document.querySelector('#sf [data-sf-tee]')", timeout: 30000 }, { sleep: 600 },
            { tap: '[data-sf="startgps"]' },
            { waitFor: "/index\\.html/.test(location.pathname)", timeout: 20000 },
            X("JSON.stringify({ side: sessionStorage.getItem('u18_side_at_open'), now: localStorage.getItem('hardpan_round_side') })")] });
    assert.equal(r.ok, true, r.reason);
    const [s] = J(r);
    assert.match(s.side, /^bets\|\w+$/, 'the card: ' + s.side);
});
