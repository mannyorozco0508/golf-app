// URGENT-016 - THE GPS DOOR, AND THE GAMES DOOR BACK TO THE ORIGINAL SETUP, IN REAL CHROME (iPhone 15 size).
//
//   1  GPS door: Home -> "Where are you playing?" with NO flash of the old lobby ("HARDPAN / What
//      are you setting up?") - sampled every frame on both hops (admin.html?start=quick, then
//      ?game=CODE): the lobby is never on screen, the cover shows the same title.
//   2  NEAR YOU with a course already picked (the closest, Dobson): the picked course on top,
//      highlighted, and 6+ nearby courses right under it (distance, ✓ GPS); a tap on one switches
//      the course in place.
//   3  Location denied: YOUR COURSES (this phone's own) instead of an empty list.
//   4  Games & Bets: the ORIGINAL setup - Round Setup's lobby, "What are you setting up?" with
//      Road Trip / Game Day, no 3-step screen, no session mark (features.simpleGames off).
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'simple-flow.js'))) { console.log('Consumer tree: no HardPan Home / simple flow - skipped.'); process.exit(0); }
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const CD = makeCourseData(18);
const TEE = (name, y, r, sl) => ({ name, rating: r, slope: sl, parTotal: 72, totalYards: y, holes: CD.map((h) => ({ par: h.par, yardage: Math.round(y / 18) })) });
const TEES = { male: [TEE('Back', 6586, 71.1, 123), TEE('White', 6187, 69.0, 118), TEE('Red', 5645, 66.9, 112)], female: [TEE('Red', 5645, 71.4, 120)] };
const DB = () => ({ events: {}, global_courses: { gca_zgkynkan: { name: 'Dobson Ranch Golf Course', data: CD, tees: TEES } }, trips: {}, tournaments: {}, organizers: {} });
const BASE = 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true });
// Every frame of every page: is the old lobby on screen? (its lead line laid out, not hidden, and
// nothing of the new screen over it). Kept in sessionStorage across the hops.
const FRAMES = "(function(){ if (!/admin\\.html$/.test(location.pathname)) return; var n = 0; (function f(){ try {"
    + " var l = document.querySelector('.lobby-lead'), sf = document.getElementById('sf');"
    + " var covered = sf && getComputedStyle(sf).display !== 'none';"
    + " var on = l && l.getBoundingClientRect().height > 0 && getComputedStyle(l).visibility !== 'hidden' && !covered;"
    + " var k = 'u16_frames'; var o = JSON.parse(sessionStorage.getItem(k) || '{}'); var pg = location.search.indexOf('game=') !== -1 ? 'game' : 'start';"
    + " o[pg] = o[pg] || { frames: 0, lobby: 0 }; o[pg].frames++; if (on) o[pg].lobby++; sessionStorage.setItem(k, JSON.stringify(o)); } catch (e) {}"
    + " if (++n < 400) requestAnimationFrame(f); })(); })();";
const X = (e) => ({ expression: e });
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const HERE = [{ cdp: { method: 'Emulation.setGeolocationOverride', params: { latitude: 33.3759, longitude: -111.8778, accuracy: 10 } } },
    { cdp: { method: 'Browser.grantPermissions', params: { permissions: ['geolocation'] } } }];
const STEP1 = "JSON.stringify({ text: (document.getElementById('sf') || {}).innerText || '', key: document.getElementById('course-select').value,"
    + " head: (document.querySelector('#sf-course') || {}).innerText || '', headSel: !!document.querySelector('#sf-course.sf-sel'),"
    + " near: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-course]'), function (b) { return b.innerText.replace(/\\n/g, ' | '); }),"
    + " order: (function(){ var t = (document.getElementById('sf') || {}).innerText || ''; return [t.indexOf('NEAR YOU'), t.indexOf('TEES')]; })() })";

describe('URGENT-016: the GPS door', () => {
    test('GPS: Home -> "Where are you playing?" with no frame of the old lobby; NEAR YOU (6+) under the picked course; a tap switches it', { timeout: 120000 }, async () => {
        const r = await arriveCold({ url: fileUrl('home.html', ''), db: DB(), settleMs: 2000, viewport: { width: 393, height: 852 }, preScript: BASE + FRAMES, steps: [
            ...HERE,
            { tap: '[data-hp-act="sgpsdoor"]' },
            { waitFor: "/game=/.test(location.search) && !!document.querySelector('#sf [data-sf-tee]') && document.querySelectorAll('#sf [data-sf-course]').length > 0", timeout: 30000 }, { sleep: 800 },
            X(STEP1),
            X("JSON.stringify({ frames: JSON.parse(sessionStorage.getItem('u16_frames') || '{}'), cover: document.documentElement.classList.contains('sf-pre') })"),
            { tap: '#sf [data-sf-course]', nth: 0 }, { sleep: 1200 }, X(STEP1)] });
        assert.equal(r.ok, true, r.reason);
        const [s1, fr, after] = J(r);
        assert.match(s1.text, /^‹\nGPS\nWhere are you playing\?/);
        // the old lobby never on screen, on either hop - and the hop page was drawn (sampled) at all
        assert.ok(fr.frames.start && fr.frames.start.frames > 0, 'the start=quick hop was sampled: ' + JSON.stringify(fr.frames));
        assert.equal(fr.frames.start.lobby, 0, 'the old lobby flashed on the code-minting hop: ' + JSON.stringify(fr.frames));
        assert.equal(fr.frames.game.lobby, 0, 'the old lobby flashed on the round page: ' + JSON.stringify(fr.frames));
        assert.equal(fr.cover, false, 'the cover is lifted once the screen is up');
        // the picked course on top, highlighted; its TEES right under it, then NEAR YOU (polish 029 #11,
        // Manny: the tees sat under 8 NEAR YOU rows, below the fold); 6+ others
        assert.equal(s1.key, 'gca_zgkynkan');
        assert.match(s1.head, /Dobson Ranch Golf Course\n0\.0 mi · (✓ GPS · )?Change/);   // ✓ GPS = what the map draws (URGENT-022)
        assert.equal(s1.headSel, true);
        assert.ok(s1.order[1] > 0 && s1.order[1] < s1.order[0], 'polish #11: the TEES sit under the picked course, above NEAR YOU: ' + JSON.stringify(s1.order));
        assert.ok(s1.near.length >= 6, 'at least 6 nearby courses: ' + JSON.stringify(s1.near));
        assert.ok(s1.near.every((t) => !/^Dobson Ranch Golf Course \|/.test(t)), 'the picked course is not repeated in the list');
        assert.ok(s1.near.every((t) => / mi/.test(t)), 'each row shows its distance: ' + JSON.stringify(s1.near));
        // (✓ GPS badges: only what the map draws - the course check covers them on the phone's rules.)
        // a tap on a nearby course switches it in place
        assert.notEqual(after.key, 'gca_zgkynkan', 'the tap switched the course');
        assert.equal(after.head.split('\n')[0], s1.near[0].split(' | ')[0]);
        assert.ok(after.near.some((t) => /^Dobson Ranch Golf Course \|/.test(t)), 'Dobson is back in the list');
    });

    test('GPS, location denied: YOUR COURSES (this phone\'s own) instead of an empty list', { timeout: 90000 }, async () => {
        const r = await arriveCold({ url: fileUrl('home.html', ''), db: DB(), settleMs: 2000, viewport: { width: 393, height: 852 },
            preScript: BASE + "try{localStorage.setItem('hardpan_last_tee_gca_zgkynkan','White');}catch(e){}", steps: [
                { cdp: { method: 'Browser.setPermission', params: { permission: { name: 'geolocation' }, setting: 'denied' } } },
                { tap: '[data-hp-act="sgpsdoor"]' },
                { waitFor: "/game=/.test(location.search) && /YOUR COURSES|Couldn.t get your location/.test(((document.getElementById('sf') || {}).innerText || ''))", timeout: 40000 }, { sleep: 500 },
                X(STEP1)] });
        assert.equal(r.ok, true, r.reason);
        const [s1] = J(r);
        assert.match(s1.text, /NEAR YOU\nLocation is off for this page/);
        assert.match(s1.text, /YOUR COURSES\nDobson Ranch Golf Course/);
    });

    test('Games & Bets: the ORIGINAL setup - "What are you setting up?" Road Trip / Game Day, no 3-step screen', { timeout: 90000 }, async () => {
        const r = await arriveCold({ url: fileUrl('home.html', ''), db: DB(), settleMs: 2000, viewport: { width: 393, height: 852 }, preScript: BASE, steps: [
            { tap: '[data-hp-act="snew"]' },
            { waitFor: "/admin\\.html/.test(location.pathname) && !!document.querySelector('.lobby-lead') && document.querySelector('.lobby-lead').getBoundingClientRect().height > 0", timeout: 20000 }, { sleep: 1500 },
            X("JSON.stringify({ at: location.href.split('/').pop(), lobby: document.getElementById('lobby-screen').innerText, sf: !!document.getElementById('sf'), mark: sessionStorage.getItem('hardpan_simple_flow'), cover: document.documentElement.classList.contains('sf-pre') })"),
            { tap: '#hw-quick' },
            { waitFor: "/game=/.test(location.search) && document.querySelectorAll('.wizard-step').length > 0", timeout: 20000 }, { sleep: 2000 },
            X("JSON.stringify({ sf: !!document.getElementById('sf') && getComputedStyle(document.getElementById('sf')).display !== 'none', admin: getComputedStyle(document.getElementById('admin-screen')).display })")] });
        assert.equal(r.ok, true, r.reason);
        const [lobby, wiz] = J(r);
        assert.equal(lobby.at, 'admin.html?start=lobby');
        assert.match(lobby.lobby, /What are you setting up\?[\s\S]*Road Trip[\s\S]*Game Day/);
        assert.deepEqual([lobby.sf, lobby.mark, lobby.cover], [false, null, false]);
        assert.deepEqual(wiz, { sf: false, admin: 'block' }, 'Game Day opens the original wizard');
    });
});
