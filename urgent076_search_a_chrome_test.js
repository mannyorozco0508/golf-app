// ============================================================================
// URGENT-076 - COURSE SEARCH, OPTION A "SEARCH TAKES OVER" - IN REAL CHROME (phone GPS mode).
// Manny, Oct 26 12:50 AM: "once I type in a course I don't need to see the nearby courses... Once I
// select the course, it needs to be up top. It's confusing when I see other courses when I'm searching."
//   1  Box empty: NEAR YOU exactly as before ("You're here", closest first, ✓ GPS).
//   2  1+ letters: NEAR YOU hidden; only "RESULTS FOR '<text>'" - best name match first, then closest,
//      a distance and ✓ GPS on each row; "Search more courses" and "Not listed? Add a course" under them.
//   3  A tapped result: the list and the box go away; the green PLAYING card (name, town, distance,
//      ✓ GPS, Change) on top, TEES right under it, then Start Round. No other course on screen.
//   4  Change: the box back with its text, focused (keyboard up); empty box -> NEAR YOU again.
//   5  Auto-picked at a course: the same card, "You're here".
//   6  Games & Bets' course picker is unchanged.
// The Cloud Functions are stood in at fetch (saved answers). No network, no GolfAPI call. Synthetic cards.
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
// gpsSearch "bandon" - the LIVE answer of Oct 25 (as in urgent071), and 067's "arizona" answer.
const R = (id, course, gps, holes, club) => ({ id, club: club || 'Bandon Dunes Golf Resort', course, name: (club || 'Bandon Dunes Golf Resort') + ' (' + course + ')', city: 'Bandon', state: 'OR', holes: holes || 18, gps, cached: false });
const BANDON = [R('01214152103626290926', 'Bandon Crossings', true, 18, 'Bandon Crossings Golf Course'), R('012141521036241695493', 'Bandon Dunes', true), R('0121658411581759626', 'Bandon Preserve', true),
    R('012141521036311111134', 'Bandon Trails', true), R('012141521036345307035', 'Old McDonald', true), R('012141521036276501913', 'Pacific Dunes', true),
    R('0121591635972407933', 'Sheep Ranch', false), R('011141521036379837276', 'Bandon Face Rock', true, 9, 'Bandon Face Rock Golf Course')];
const ARIZONA = [
    { id: '670000000000000001', club: 'Arizona Golf Resort', course: 'Championship', name: 'Arizona Golf Resort (Championship)', city: 'Mesa', state: 'AZ', holes: 18, gps: true },
    { id: '670000000000000002', club: 'Arizona Grand Golf Course', course: 'Arizona Grand', name: 'Arizona Grand Golf Course (Arizona Grand)', city: 'Phoenix', state: 'AZ', holes: 18, gps: true },
    { id: '670000000000000003', club: 'Arizona National Golf Club', course: 'Arizona National', name: 'Arizona National Golf Club (Arizona National)', city: 'Tucson', state: 'AZ', holes: 18, gps: true },
    { id: '670000000000000004', club: 'Arizona Traditions Golf Club', course: '18-hole course', name: 'Arizona Traditions Golf Club (18-hole course)', city: 'Surprise', state: 'AZ', holes: 18, gps: true },
    { id: '670000000000000005', club: 'The Arizona Country Club', course: 'The Arizona Country Club', name: 'The Arizona Country Club (The Arizona Country Club)', city: 'Phoenix', state: 'AZ', holes: 18, gps: true }];
const TRAILS = BANDON[3];
const TRAILS_REC = { name: TRAILS.name, data: CD, tees: { male: [{ name: 'Green', rating: 71, slope: 127, parTotal: 72, totalYards: 6300, holes: CD.map((h) => ({ par: h.par, yardage: 350 })) }] }, location: { city: 'Bandon', state: 'OR', latitude: 43.1782, longitude: -124.3856 } };
const FUNCS = "(function(){ window.__fn = []; var of = window.fetch; var SAVED = { bandon: " + JSON.stringify(BANDON) + ", arizona: " + JSON.stringify(ARIZONA) + " }, TREC = " + JSON.stringify(TRAILS_REC) + ";"
    + " window.fetch = function (u, init) { var s = String(u); if (/interpreter/.test(s)) return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ elements: [] }); } });"
    + "  var m = /cloudfunctions\\.net\\/(gps\\w+)$/.exec(s); if (!m) return of.apply(this, arguments);"
    + "  var data = JSON.parse(init.body).data; window.__fn.push([m[1], data]); var res;"
    + "  if (m[1] === 'gpsSearch') res = Promise.resolve({ status: 'ok', results: SAVED[data.name] || [] });"
    + "  else if (m[1] === 'gpsCourse' && data.courseId === '" + TRAILS.id + "') res = firebase.database().ref('global_courses/gapi_" + TRAILS.id + "').set(TREC).then(function () { return { status: 'ready', cardKey: 'gapi_" + TRAILS.id + "', course: { id: '" + TRAILS.id + "', h: { '1': { g: { c: [43.18, -124.386] }, t: { b: [43.178, -124.3856] } } } } }; });"
    + "  else res = Promise.resolve({ status: 'nogps' });"
    + "  return res.then(function (r) { return new Promise(function (ok) { setTimeout(function () { ok({ json: function () { return Promise.resolve({ result: r }); } }); }, 300); }); }); };"
    + " setInterval(function () { try { var a = firebase.auth().currentUser; if (a && !a.getIdToken) a.getIdToken = function () { return Promise.resolve('stand-in'); }; } catch (e) {} }, 100);"
    + "})();"
    + "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{liveTest:true});}});})();";
const X = (e) => ({ expression: e });
// Types into the box as it is (never clicks Change itself: Change is what is tested).
const TYPE = (v) => X("(function(){ var i=document.getElementById('sf-q'); if(!i) return 'NO BOX'; i.focus(); i.value=" + JSON.stringify(v) + "; i.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()");
const CHANGE = X("(function(){ var b=document.querySelector('#sf-course [data-sf=change]'); if(b) b.click(); return b ? 'change' : 'NO CHANGE'; })()");
const TAP = (sel) => X("(function(){ var b=document.querySelector(" + JSON.stringify(sel) + "); if(b) b.click(); return b ? 'tapped' : 'NO ROW'; })()");
// The screen: its sections in order, every course row, the card, the box, where TEES and Start Round sit.
const SNAP = "JSON.stringify((function(){ var sf=document.getElementById('sf'), q=document.getElementById('sf-q'), card=document.querySelector('#sf [data-sf-playing]'), h1=sf.querySelector('h1');"
    + " var rows=Array.prototype.map.call(sf.querySelectorAll('[data-sf-course], [data-sf-web], [data-sf-osm]'), function(b){ return (b.getAttribute('data-sf-osm') != null ? 'OSM ' : b.getAttribute('data-sf-web') ? 'WEB ' : 'LOCAL ') + b.innerText.replace(/\\n/g,' | ') + (b.classList.contains('sf-sel') ? ' [picked]' : ''); });"
    + " var order=Array.prototype.map.call(sf.querySelectorAll('.sf-h, [data-sf-playing], .sf-row, #sf-more, [data-sf=fullcourse], [data-sf=startgps], [data-sf=next]'), function(n){ return n.classList.contains('sf-h') ? 'H:' + n.textContent : n.hasAttribute('data-sf-playing') ? 'CARD' : n.hasAttribute('data-sf-tee') ? 'TEE' : n.id === 'sf-more' ? 'MORE' : n.getAttribute('data-sf') === 'fullcourse' ? 'NOTLISTED' : /startgps|next/.test(n.getAttribute('data-sf')||'') ? 'START' : 'ROW'; });"
    + " return { key: document.getElementById('course-select').value, box: q ? { value: q.value, focused: document.activeElement === q } : null, rows: rows, order: order, text: sf.innerText,"
    + "  card: card ? { text: card.innerText.replace(/\\n/g,' | '), here: card.getAttribute('data-sf-playing-here') === '1', first: !!(h1 && (h1.nextElementSibling === card || (h1.nextElementSibling && h1.nextElementSibling.contains(card)))), bg: getComputedStyle(card).backgroundColor } : null,"
    + "  fn: (window.__fn||[]).map(function(c){ return c[0] + ':' + (c[1].name || c[1].courseId); }) }; })())";
const PAPAGO = [33.4560, -111.9480], AWAY_AZ = [33.4300, -112.5800];   // AWAY_AZ: no course within 0.5 mi
// A course of ours with GPS and a card (as in urgent060): the app's GolfAPI file holds Talking Stick South.
const ID = '990000000000000001';
const TEE = (name, y, r, sl) => ({ name, rating: r, slope: sl, parTotal: 71, totalYards: y, holes: CD.map((h) => ({ par: h.par, yardage: Math.round(y / 18) })) });
const GC = { ['gapi_' + ID]: { name: 'Talking Stick Golf Club (South - Piipaash)', data: CD, tees: { male: [TEE('Black', 6800, 72.6, 129), TEE('Gold', 6400, 70.6, 124), TEE('Jade', 5800, 68.0, 115)] },
    location: { city: 'Scottsdale', state: 'AZ', latitude: 33.539874, longitude: -111.870432 } } };
const GAPI = { v: 1, built: 'test', links: {}, courses: { [ID]: { id: ID, club: 'Talking Stick Golf Club', course: 'South - Piipaash', city: 'Scottsdale', state: 'AZ', lat: 33.539874, lng: -111.870432, holes: 18,
    h: { 1: { g: { f: [33.5445, -111.8690], c: [33.5444, -111.8691], b: [33.5443, -111.8692] }, t: { b: [33.5467, -111.8663], f: [33.5460, -111.8678] } } } } } };
// 086 (Manny, Oct 26): "✓ GPS" needs a green on EVERY hole - the made-up hole 1 stands for holes 2-18 too.
for (let i = 2; i <= 18; i++) GAPI.courses[ID].h[i] = GAPI.courses[ID].h[1];
const AT_TS = [33.5399, -111.8704];   // on Talking Stick South
const open = (at, steps, flow, vp) => arriveCold({ url: fileUrl('admin.html', 'start=quick'), db: { events: {}, global_courses: GC, trips: {}, tournaments: {}, organizers: {} }, settleMs: 2500, viewport: vp || { width: 393, height: 852 },
    preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + FUNCS + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';' + "try{sessionStorage.setItem('hardpan_simple_flow'," + JSON.stringify(flow || 'gps') + ");}catch(e){}"
        + "if (/admin\\.html$/.test(location.pathname)) document.addEventListener('DOMContentLoaded', function () { var s = document.createElement('script'); s.src = 'gps-live.js'; document.head.appendChild(s); });", steps: [
        { cdp: { method: 'Emulation.setGeolocationOverride', params: { latitude: at[0], longitude: at[1], accuracy: 10 } } },
        { cdp: { method: 'Browser.grantPermissions', params: { permissions: ['geolocation'] } } },
        { sleep: 2500 }, X("(function(){ var b=document.querySelector('[data-sf=relocate]'); if(b) b.click(); return 'relocate'; })()"),
        { waitFor: "!!window.HardPanGpsLive && (document.querySelectorAll('#sf [data-sf-course]').length > 0 || !!document.querySelector('#sf [data-sf-playing]') || /You’re here/.test((document.getElementById('sf')||{}).innerText||''))", timeout: 40000 }, { sleep: 1500 }].concat(steps) });
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const mi = (t) => { const m = /([\d.]+) mi/.exec(t); return m ? Number(m[1]) : null; };
const alone = (s, what) => {
    assert.ok(s.card, what + ': the PLAYING card is on screen: ' + s.text);
    assert.equal(s.card.first, true, what + ': the card is at the TOP (right under the title)');
    assert.match(s.card.text, /^PLAYING \| Change \| /, what + ': "PLAYING" and "Change" on the card: ' + s.card.text);
    assert.equal(s.card.bg, 'rgb(15, 76, 58)', what + ': the card is green');
    assert.deepEqual(s.rows, [], what + ': no other course on screen');
    assert.equal(s.box, null, what + ': no search box');
    assert.doesNotMatch(s.text, /NEAR YOU|RESULTS|LAST PLAYED/, what + ': no lists');
    const iCard = s.order.indexOf('CARD'), iTees = s.order.indexOf('H:TEES'), iTee = s.order.indexOf('TEE'), iStart = s.order.indexOf('START');
    assert.ok(iCard === 0 && iTees === 1 && iTee === 2 && iStart > iTee, what + ': the card, then TEES right under it, then Start Round: ' + JSON.stringify(s.order));
    assert.ok(s.order.indexOf('NOTLISTED') > iTee, what + ': "Not listed? Add a course" kept (only add): ' + JSON.stringify(s.order));
};

test('auto-picked at a course: the PLAYING card says "You\'re here" (alone at the top, TEES, Start Round); Change: the box, focused, empty -> NEAR YOU with that course "You\'re here"', { timeout: 150000 }, async () => {
    const r = await open(AT_TS, [{ waitFor: "document.querySelectorAll('#sf [data-sf-tee]').length > 0", timeout: 20000 }, { sleep: 500 }, X(SNAP), CHANGE, { sleep: 600 }, X(SNAP)]);
    assert.equal(r.ok, true, r.reason);
    const [a, b] = J(r);
    alone(a, 'auto-picked');
    assert.equal(a.card.here, true);
    assert.match(a.card.text, /\| South - Piipaash \| You’re here · Talking Stick Golf Club · Scottsdale, AZ · [\d.]+ mi · ✓ GPS$/, 'name, then You\'re here · town · distance · ✓ GPS: ' + a.card.text);
    assert.match(a.order.slice(-1)[0], /START/);
    assert.ok(b.box && b.box.focused && b.box.value === '', 'Change: the box, empty, focused (keyboard up): ' + JSON.stringify(b.box));
    assert.equal(b.card, null, 'Change: the card is gone');
    assert.equal(b.order[0], 'H:NEAR YOU', 'empty box: NEAR YOU first: ' + JSON.stringify(b.order));
    assert.match(b.rows[0], /^LOCAL Talking Stick Golf Club \(South - Piipaash\) \| You’re here · [\d.]+ mi · ✓ GPS \[picked\]$/, 'NEAR YOU exactly as before: ' + JSON.stringify(b.rows));
});

test('typing 1+ letters hides NEAR YOU: only "RESULTS FOR \'<text>\'", best match first then closest, a distance and ✓ GPS on each row; "Not listed?" under them', { timeout: 150000 }, async () => {
    const r = await open(PAPAGO, [CHANGE, { sleep: 500 }, X(SNAP), TYPE('p'), { sleep: 700 }, X(SNAP), TYPE('Arizona country club'), { waitFor: "document.querySelectorAll('#sf [data-sf-web]').length >= 5", timeout: 15000 }, { sleep: 600 }, X(SNAP)]);
    assert.equal(r.ok, true, r.reason);
    const [empty, one, s] = J(r);
    assert.match(empty.text, /NEAR YOU/, 'empty box: NEAR YOU');
    assert.doesNotMatch(one.text, /NEAR YOU|LAST PLAYED/, '1 letter: NEAR YOU hidden: ' + one.text.slice(0, 300));
    assert.equal(one.order[0], "H:RESULTS FOR 'p'", JSON.stringify(one.order));
    assert.doesNotMatch(s.text, /NEAR YOU|LAST PLAYED|PLAYING/, 'typing: nothing but the results (the picked course is not shown either)');
    assert.equal(s.order[0], "H:RESULTS FOR 'Arizona country club'");
    assert.match(s.rows[0], /^WEB The Arizona Country Club \| Phoenix, AZ \| [\d.]+ mi · ✓ GPS$/, 'best name match first: ' + JSON.stringify(s.rows));
    s.rows.forEach((t) => { if (!/Arizona National/.test(t)) assert.ok(mi(t) != null, 'a distance: ' + t); });
    s.rows.filter((t) => /^WEB /.test(t)).forEach((t) => assert.match(t, /✓ GPS/, '✓ GPS: ' + t));
    const rest = s.rows.slice(1).map(mi).filter((d) => d != null);
    assert.deepEqual(rest, rest.slice().sort((x, y) => x - y), 'then the closest first: ' + JSON.stringify(s.rows));
    assert.ok(s.order.lastIndexOf('ROW') < s.order.indexOf('NOTLISTED'), '"Not listed? Add a course" under the results: ' + JSON.stringify(s.order));
});

test('"Search more courses" and "Not listed? Add a course" sit under the results (a saved match: 0 calls, Search more asks once)', { timeout: 150000 }, async () => {
    const r = await open(AWAY_AZ, [TYPE('Papago'), { sleep: 3500 }, X(SNAP), TAP('#sf-more'), { sleep: 2500 }, X(SNAP)]);
    assert.equal(r.ok, true, r.reason);
    const [s, more] = J(r);
    assert.ok(s.rows.some((t) => /^LOCAL Papago/.test(t)), JSON.stringify(s.rows));
    const iMore = s.order.indexOf('MORE'), iNot = s.order.indexOf('NOTLISTED'), iLast = s.order.lastIndexOf('ROW');
    assert.ok(iMore > iLast && iNot > iMore, 'the rows, then Search more, then Not listed: ' + JSON.stringify(s.order));
    // 079b (Manny, Oct 26: YES): the one exception - our "Papago Golf Club" row has no card in this fixture, so its club is
    // asked ONCE by name (gpsSearch "Papago Golf Club"); the typed text itself is still never searched (0 calls).
    const club = (f) => f.filter((x) => x !== 'gpsSearch:Papago Golf Club');
    assert.deepEqual(club(s.fn), [], '0 calls for the typed text');
    assert.ok(s.fn.filter((x) => x === 'gpsSearch:Papago Golf Club').length <= 1, 'the club asked at most once: ' + JSON.stringify(s.fn));
    assert.deepEqual(club(more.fn), ['gpsSearch:papago'], 'Search more: one call');
    assert.doesNotMatch(more.text, /NEAR YOU/);
});

test('a tapped result is ALONE at the top: the PLAYING card (name, town, distance, ✓ GPS, Change), TEES under it, Start Round - no other course; Change brings back the box with its text, focused; an empty box brings back NEAR YOU', { timeout: 150000 }, async () => {
    const r = await open(AWAY_AZ, [X(SNAP), TYPE('Talking Stick'), { sleep: 2000 }, X(SNAP), TAP('#sf [data-sf-course="gapi_' + ID + '"]'), { waitFor: "document.querySelectorAll('#sf [data-sf-tee]').length > 0", timeout: 20000 }, { sleep: 500 }, X(SNAP),
        CHANGE, { sleep: 800 }, X(SNAP), TYPE(''), { sleep: 800 }, X(SNAP)]);
    assert.equal(r.ok, true, r.reason);
    const [e0, t0, p, c, e] = J(r);
    assert.equal(e0.order.indexOf('START'), -1, 'no course picked: no Start Round: ' + JSON.stringify(e0.order));
    assert.equal(t0.order.indexOf('START'), -1, 'typing: no Start Round: ' + JSON.stringify(t0.order));
    assert.match(t0.rows.join('\n'), /^LOCAL South - Piipaash \| Talking Stick Golf Club · Scottsdale, AZ \| [\d.]+ mi · ✓ GPS$/m, '076 long names (our course, the GolfAPI file\'s club / course): ' + JSON.stringify(t0.rows));
    alone(p, 'picked from search');
    assert.equal(p.card.here, false, 'not at it: no "You\'re here"');
    assert.match(p.card.text, /\| South - Piipaash \| Talking Stick Golf Club · Scottsdale, AZ · [\d.]+ mi · ✓ GPS$/, p.card.text);
    assert.ok(c.box && c.box.value === 'Talking Stick' && c.box.focused, 'Change: the box with "Talking Stick", focused: ' + JSON.stringify(c.box));
    assert.equal(c.order[0], "H:RESULTS FOR 'Talking Stick'", JSON.stringify(c.order));
    assert.equal(c.order.indexOf('START'), -1, 'Change, the text back: the results list, no Start Round');
    assert.doesNotMatch(c.text, /NEAR YOU|PLAYING/);
    assert.equal(e.order[0], 'H:NEAR YOU', 'box cleared: NEAR YOU again: ' + JSON.stringify(e.order));
    assert.ok(e.order.indexOf('START') > 0, 'box empty, a course held: Start Round as before: ' + JSON.stringify(e.order));
    assert.doesNotMatch(e.text, /RESULTS/);
});

test('Bandon (online rows): typing still shows the GolfAPI ✓ GPS rows first; a tapped row loads as the card, then is the PLAYING card alone; Change -> "Bandon" and the same results, 0 more calls', { timeout: 150000 }, async () => {
    const r = await open(AWAY_AZ, [TYPE('Bandon'), { waitFor: "document.querySelectorAll('#sf [data-sf-web]').length >= 5", timeout: 15000 }, { sleep: 600 }, X(SNAP),
        TAP('#sf [data-sf-web="' + TRAILS.id + '"]'), { sleep: 100 }, X(SNAP), { waitFor: "document.querySelectorAll('#sf [data-sf-tee]').length > 0 && !document.querySelector('[data-sf=startgps][disabled]')", timeout: 20000 }, { sleep: 500 }, X(SNAP),
        CHANGE, { sleep: 1500 }, X(SNAP)]);
    assert.equal(r.ok, true, r.reason);
    const [t, busy, p, c] = J(r);
    assert.ok(t.rows.slice(0, 5).every((x) => /^WEB .*✓ GPS/.test(x)), 'the first 5 rows are GolfAPI ✓ GPS: ' + JSON.stringify(t.rows));
    // 076 long names: the course big, the resort + town small; the same name once (big) with just the town.
    assert.ok(t.rows.some((x) => /^WEB Bandon Preserve \| Bandon Dunes Golf Resort · Bandon, OR \| [\d,.]+ mi · ✓ GPS$/.test(x)), JSON.stringify(t.rows));
    assert.ok(t.rows.some((x) => /^WEB Pacific Dunes \| Bandon Dunes Golf Resort · Bandon, OR \| /.test(x)), JSON.stringify(t.rows));
    assert.ok(t.rows.some((x) => /^WEB Bandon Dunes Golf Resort \| Bandon, OR \| /.test(x)), 'club "Bandon Dunes Golf Resort" holds course "Bandon Dunes": once: ' + JSON.stringify(t.rows));
    assert.ok(t.rows.some((x) => /^WEB Bandon Crossings Golf Course \| Bandon, OR \| /.test(x)), JSON.stringify(t.rows));
    assert.equal(t.order.indexOf('START'), -1, 'typing: no Start Round');
    assert.doesNotMatch(t.text, /NEAR YOU/);
    assert.ok(busy.card && /Bandon Dunes Golf Resort/.test(busy.card.text), 'while it loads, the tapped course is the card: ' + busy.text.slice(0, 300));
    assert.deepEqual(busy.rows, [], 'no list while it loads');
    alone(p, 'online course picked');
    assert.equal(p.key, 'gapi_' + TRAILS.id);
    assert.match(p.card.text, /\| Bandon Trails \| Bandon Dunes Golf Resort · Bandon, OR · /, '076 long names: the course big, the resort + town small: ' + p.card.text);
    assert.ok(c.box && c.box.value === 'Bandon' && c.box.focused, JSON.stringify(c.box));
    assert.ok(c.rows.slice(0, 5).every((x) => /^WEB .*✓ GPS|^LOCAL .*Bandon/.test(x)) && c.rows.length >= 5, 'the results again: ' + JSON.stringify(c.rows));
    assert.equal(c.fn.filter((x) => /^gpsSearch/.test(x)).length, 1, 'Change: no new search: ' + JSON.stringify(c.fn));
});

test('the closest course Round Setup holds by itself (he is at none) is NOT a pick: the box, NEAR YOU exactly as today (that row picked, its tees under); a tap on it makes it the PLAYING card', { timeout: 150000 }, async () => {
    const r = await open([33.5600, -111.8704], [X("(function(){ selectCourse('gapi_" + ID + "', 'Talking Stick Golf Club (South - Piipaash)'); var i=document.getElementById('sf-q'); i.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()"),
        { waitFor: "document.querySelectorAll('#sf [data-sf-tee]').length > 0", timeout: 20000 }, { sleep: 600 }, X(SNAP), TAP('#sf [data-sf-course="gapi_' + ID + '"]'), { sleep: 1500 }, X(SNAP)]);
    assert.equal(r.ok, true, r.reason);
    const [a, b] = J(r);
    assert.equal(a.key, 'gapi_' + ID);
    assert.ok(a.box && a.card === null, 'no PLAYING card: ' + JSON.stringify(a.order));
    assert.equal(a.order[0], 'H:NEAR YOU', JSON.stringify(a.order));
    assert.ok(a.order.indexOf('H:TEES') > a.order.indexOf('ROW'), 'its tees under the list, as today: ' + JSON.stringify(a.order));
    assert.ok(a.order.indexOf('START') > a.order.indexOf('H:TEES'), 'Start Round as today (the held course): ' + JSON.stringify(a.order));
    alone(b, 'tapped');
});

test('Games & Bets\' course picker is unchanged: the box and NEAR YOU with the picked row and its tees under; 1 letter keeps NEAR YOU; "RESULTS"; a pick keeps the box; no PLAYING card', { timeout: 150000 }, async () => {
    const r = await open(AT_TS, [{ sleep: 1500 }, X(SNAP), TYPE('T'), { sleep: 700 }, X(SNAP), TYPE('Talking Stick'), { sleep: 1500 }, X(SNAP), TAP('#sf [data-sf-course="gapi_' + ID + '"]'), { sleep: 1500 }, X(SNAP)], 'new');
    assert.equal(r.ok, true, r.reason);
    const [a, one, s, p] = J(r);
    assert.ok(a.box, 'the box is there');
    assert.equal(a.card, null, 'no PLAYING card');
    assert.equal(a.order[0], 'H:NEAR YOU');
    assert.match(a.rows[0], /^LOCAL Talking Stick Golf Club \(South - Piipaash\) \| You’re here .*\[picked\]$/, JSON.stringify(a.rows));
    assert.ok(a.order.indexOf('H:TEES') > a.order.indexOf('ROW'), 'tees under the list: ' + JSON.stringify(a.order));
    assert.match(one.text, /NEAR YOU/, '1 letter: NEAR YOU kept (2 letters search there)');
    assert.equal(s.order[0], 'H:RESULTS', JSON.stringify(s.order));
    assert.equal(s.card, null);
    assert.ok(p.box && p.card === null && p.rows.length > 0, 'a pick keeps the box and the list (no PLAYING card): ' + JSON.stringify(p.order));
});

test('long names fit a small phone (375x667): every result and the PLAYING card - no text cut off, nothing wider than the screen; a generic course name ("18-hole course") stays small under its club', { timeout: 150000 }, async () => {
    const FIT = "JSON.stringify(Array.prototype.map.call(document.querySelectorAll('#sf .sf-row, #sf .sf-row .n, #sf .sf-row .sf-sub, #sf .sf-row .s, #sf [data-sf-playing], #sf [data-sf-playing] .n, #sf [data-sf-playing] .s'), function(e){ var r=e.getBoundingClientRect(); return { t: e.innerText.slice(0,60), over: e.scrollWidth > e.clientWidth + 1, right: Math.round(r.right), vw: window.innerWidth }; }).filter(function(x){ return x.over || x.right > x.vw; }))";
    const r = await open(AWAY_AZ, [TYPE('Bandon'), { waitFor: "document.querySelectorAll('#sf [data-sf-web]').length >= 5", timeout: 15000 }, { sleep: 600 }, X(SNAP), X(FIT),
        TYPE('Arizona'), { sleep: 2500 }, TAP('#sf-more'), { waitFor: "document.querySelectorAll('#sf [data-sf-web]').length >= 5", timeout: 15000 }, { sleep: 600 }, X(SNAP), X(FIT),
        TYPE('Bandon'), { sleep: 1500 }, TAP('#sf [data-sf-web="0121658411581759626"]'), { sleep: 200 }, X(SNAP), X(FIT)], 'gps', { width: 375, height: 667 });
    assert.equal(r.ok, true, r.reason);
    const v = r.value.filter((x) => typeof x === 'string' && /^[[{]/.test(x)).map((x) => JSON.parse(x));
    const [b, bFit, a, aFit, p, pFit] = v;
    assert.ok(b.rows.length >= 8, JSON.stringify(b.rows));
    assert.deepEqual(bFit, [], 'Bandon results fit');
    assert.ok(a.rows.some((x) => /^WEB Arizona Traditions Golf Club \| 18-hole course · Surprise, AZ \| /.test(x)), JSON.stringify(a.rows));
    assert.ok(a.rows.some((x) => /^WEB Championship \| Arizona Golf Resort · Mesa, AZ \| /.test(x)), JSON.stringify(a.rows));
    assert.ok(a.rows.some((x) => /^WEB The Arizona Country Club \| Phoenix, AZ \| /.test(x)), JSON.stringify(a.rows));
    assert.deepEqual(aFit, [], 'Arizona results fit');
    assert.ok(p.card && /^PLAYING \| Change \| Bandon Preserve \| Bandon Dunes Golf Resort · Bandon, OR/.test(p.card.text), 'the PLAYING card (loading): ' + JSON.stringify(p.card));
    assert.deepEqual(pFit, [], 'the card fits');
});
