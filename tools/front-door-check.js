#!/usr/bin/env node
// ============================================================================
// TWO FRONT DOORS, THE WAY A GOLFER MEETS THEM (gps-doors; Manny's mockups)
//
//   node tools/front-door-check.js
//
// Cold Chrome; window.__hardpanDoors stands in for "this is the app" (the doors
// show only in Capacitor). A reopen is a reload with the session cleared (the
// harness keeps no storage between launches). Positions come from a stand-in
// sensor at Caledonia's first tee.
//   1  Home in the app is home.html: Main - GPS (green) and Games & Bets (navy)
//      cards, "Have a game code?", "Sign in", "We'll remember your pick".
//   2  Games -> Games-1 (Start a round, code, Trips & Cups, Build a trip); the
//      reopen goes straight there. Join: a wrong code is said; a right one opens.
//      Start a round -> the lobby's own new-round path (a fresh code).
//   3  Games door in a round: no location; the green GPS button asks for it.
//   4  GPS door: GPS-1 - search finds Caledonia (GPS READY), Near you lists it
//      with miles; a tap starts an ordinary round (one golfer) on GPS; Recent.
//   5  GPS-2 in a round: Score, + Game, the Games chip; + Game opens GPS-4 with
//      the round's golfers and the four quick starts; Skins opens Round Setup's
//      Money with a Skins game added for this round.
//   6  GPS-3: the card of a no-money round offers Add a player / Add a game.
//   7  trip.html#build opens the trip builder.
//   8  The HardPan web pages (no app flag): no door anywhere.
// ============================================================================
'use strict';
const path = require('path');
const HERE = path.join(__dirname, '..');
const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
const { wizardSavedRound } = require(path.join(HERE, 'helpers/wizard-saved-round.js'));
const CAL = [33.450384, -79.153438];
const GEO = "window.__geo = 0; try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function () { window.__geo++; return 1; }, getCurrentPosition: function (ok) { window.__geo++; setTimeout(function () { ok({ coords: { latitude: " + CAL[0] + ", longitude: " + CAL[1] + ", accuracy: 5 } }); }, 10); }, clearWatch: function () {} } }); } catch (e) {} try { var q0 = navigator.permissions.query.bind(navigator.permissions); navigator.permissions.query = function (d) { return d && d.name === 'geolocation' ? Promise.resolve({ state: 'prompt' }) : q0(d); }; } catch (e) {}";
const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});addEventListener('unhandledrejection',function(e){window.__e.push('rej '+String(e.reason&&e.reason.message||e.reason))});";
const APP = 'window.__hardpanDoors = true; window.__freshPhone = true;';
const KEEP = "(function(){var t=setInterval(function(){if(!window.__coldWrites)return;clearInterval(t);var p=window.__coldWrites.push;window.__coldWrites.push=function(w){try{if(w&&/^events\\/[^/]+$/.test(w.path)){localStorage.setItem('__fdWrite',JSON.stringify(w));localStorage.setItem('__fdWrites',String(Number(localStorage.getItem('__fdWrites')||0)+1));}}catch(e){}return p.apply(this,arguments);};},0);})();";
// GPS LIVE STAND-IN: the Cloud Functions answer as the test says (gpsSearch / gpsCourse).
const LIVE = (search, course) => "(function(){ var c0; Object.defineProperty(window, 'HARDPAN_GPS_CONFIG', { configurable: true, get: function () { return c0; }, set: function (v) { c0 = v; if (v) v.liveTest = true; } }); var f0 = window.fetch; window.fetch = function (u, o) { u = String(u); if (/gpsSearch$/.test(u)) return Promise.resolve({ json: function () { return Promise.resolve({ result: " + JSON.stringify(search) + " }); } }); if (/gpsCourse$/.test(u)) return Promise.resolve({ json: function () { return Promise.resolve({ result: " + JSON.stringify(course) + " }); } }); return f0.apply(this, arguments); }; })();";
const TOKEN = "(function(){ var u = firebase.auth().currentUser; if (u && !u.getIdToken) u.getIdToken = function () { return Promise.resolve('test-token'); }; return u ? 'token' : 'no user'; })()";
const DB = (ev) => ({ events: ev || {}, global_courses: {}, trips: {}, organizers: {}, tournaments: {} });
function round(code) {
    const r = wizardSavedRound({ code: code || 'FDRND1', golfers: 2, names: ['Ann Able', 'Bob Baker'], hcps: [9, 12], ownerUid: 'anon-cold', thru: 0, flights: false,
        overrides: { additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club' } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    return r;
}
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const go = async (o) => { const r = await arriveCold(Object.assign({ settleMs: 3500, viewport: { width: 390, height: 844 } }, o)); if (!r.ok) throw new Error(r.reason); return r; };
const VIEW = "JSON.stringify({ url: document.URL, view: (document.querySelector('.hp-view.on')||{}).id || null, e: window.__e })";

(async () => {
    const fails = [], report = {};
    const f = (cond, msg) => { if (!cond) fails.push(msg); };

    // 1 + 2: Home, Main, Games, reopen, join, start.
    let r = await go({ url: fileUrl('admin.html', ''), db: DB({ FDRND1: round() }), preScript: APP + ERR, steps: [
        { sleep: 1500 },
        { expression: "JSON.stringify({ url: document.URL, view: (document.querySelector('.hp-view.on')||{}).id, gps: (function(){var b=document.querySelector('#v-main .hp-door.gps');return b?[b.innerText.replace(/\\s+/g,' '), getComputedStyle(b).backgroundColor]:null})(), games: (function(){var b=document.querySelector('#v-main .hp-door.games');return b?[b.innerText.replace(/\\s+/g,' '), getComputedStyle(b).backgroundColor]:null})(), text: document.getElementById('v-main').innerText, e: window.__e })" },
        { tap: '#v-main .hp-door.games' }, { sleep: 400 },
        { expression: "JSON.stringify({ view: (document.querySelector('.hp-view.on')||{}).id, door: localStorage.getItem('hardpan_front_door'), text: document.getElementById('v-games').innerText })" },
        { expression: "(function(){ sessionStorage.clear(); location.href = 'home.html'; return 'reopen'; })()" }, { sleep: 2500 },
        { expression: "JSON.stringify({ url: document.URL, view: (document.querySelector('.hp-view.on')||{}).id || null, last: Array.prototype.map.call(document.querySelectorAll('#v-main .hp-door.last'), function (b) { return b.classList.contains('games') ? 'games' : 'gps'; }), tag: (function(){ var t = document.querySelector('#v-main .hp-door.games .hp-last'); return t ? getComputedStyle(t).display : null; })(), e: window.__e })" },
        { tap: '#v-main .hp-door.games' }, { sleep: 400 },
        { expression: "(function(){ document.getElementById('hp-code').value = 'ZZZZZZ'; return 'typed'; })()" }, { tap: '#v-games [data-hp-act="join"]' }, { sleep: 800 },
        { expression: "JSON.stringify({ msg: document.getElementById('hp-code-msg').innerText })" },
        { expression: "(function(){ document.getElementById('hp-code').value = 'fdrnd1'; return 'typed'; })()" }, { tap: '#v-games [data-hp-act="join"]' }, { sleep: 2500 },
        { expression: "JSON.stringify({ url: document.URL })" }] });
    const [m1, g1, reo, bad, good] = J(r);
    report.main = { url: m1.url, view: m1.view, gps: m1.gps, games: m1.games }; report.games = { view: g1.view, door: g1.door }; report.reopen = reo.view; report.join = { bad: bad.msg, good: good.url };
    f(/home\.html$/.test(m1.url) && m1.view === 'v-main', '1: Home in the app did not open home.html Main: ' + m1.url + ' ' + m1.view);
    f(m1.gps && /GPS/.test(m1.gps[0]) && /Pick a course/.test(m1.gps[0]) && m1.gps[1] === 'rgb(15, 76, 58)', '1: the GPS card (green #0f4c3a): ' + JSON.stringify(m1.gps));
    f(m1.games && /Games & Bets/.test(m1.games[0]) && /Start or join a game/.test(m1.games[0]) && m1.games[1] === 'rgb(29, 53, 87)', '1: the Games & Bets card (navy #1d3557): ' + JSON.stringify(m1.games));
    f(/Have a game code\?/.test(m1.text) && /Sign in/.test(m1.text) && /We'll remember your pick/.test(m1.text), '1: Main text');
    f(g1.view === 'v-games' && g1.door === 'games', '2: Games did not open Games-1 / remember');
    ['+ Start a round', 'Have a game code?', 'TRIPS & CUPS', 'Build a trip from one paste', 'No location needed here.'].forEach((t) => f(g1.text.indexOf(t) !== -1, '2: Games-1 lacks "' + t + '"'));
    f(reo.view === 'v-main' && reo.last.join() === 'games' && reo.tag !== 'none', '2: the reopen must open MAIN with Games & Bets highlighted: ' + JSON.stringify(reo));
    f(/No round with the code ZZZZZZ/.test(bad.msg), '2: a wrong code was not said: ' + bad.msg);
    f(/index\.html\?game=FDRND1$/.test(good.url), '2: Join did not open the round: ' + good.url);
    if (m1.e.length) fails.push('1: errors ' + m1.e.join(' | '));
    r = await go({ url: fileUrl('home.html', '') + '#games', db: DB(), preScript: APP + ERR + "try{localStorage.setItem('hardpan_front_door','games')}catch(e){}", steps: [
        { tap: '#v-games [data-hp-act="start"]' }, { sleep: 4500 }, { expression: "JSON.stringify({ url: document.URL, quick: !!document.getElementById('fd-quick') })" }] });
    report.start = J(r)[0];
    f(/admin\.html\?game=[A-Z0-9]+&eventType=quick/.test(report.start.url) && !report.start.quick, '2: Start a round is not the ordinary new round: ' + JSON.stringify(report.start));

    // 3: Games door in a round.
    r = await go({ url: fileUrl('index.html', 'game=FDRND1&group=1'), db: DB({ FDRND1: round() }), settleMs: 8000, webgl: true, preScript: APP + GEO + ERR + "try{localStorage.setItem('hardpan_front_door','games')}catch(e){}", steps: [
        { expression: "JSON.stringify({ geo: window.__geo, btn: !!document.getElementById('fd-gps-btn'), btnBg: document.getElementById('fd-gps-btn') ? getComputedStyle(document.getElementById('fd-gps-btn')).backgroundColor : null, strip: !!document.getElementById('fd-gps3'), e: window.__e })" },
        { tap: '#fd-gps-btn' }, { sleep: 2500 },
        { expression: "JSON.stringify({ geo: window.__geo, gps: document.body.classList.contains('gps-side-gps'), side: window.HardPanGps && HardPanGps.side ? HardPanGps.side() : null, mounted: window.HardPanGps && HardPanGps.isMounted ? HardPanGps.isMounted() : null, btnTop: document.getElementById('fd-gps-btn') ? document.getElementById('fd-gps-btn').getBoundingClientRect().top : null })" }] });
    const [g3a, g3b] = J(r);
    report.gamesRound = { before: g3a, after: g3b };
    f(g3a.geo === 0, '3: the Games door asked for location before GPS was tapped');
    f(g3a.btn && g3a.btnBg === 'rgb(15, 76, 58)', '3: no green GPS button in the scorecard header');
    f(g3b.geo > 0 && g3b.gps, '3: the green GPS button did not open GPS: ' + JSON.stringify(g3b));
    f(g3a.strip, '6: no GPS-3 strip on a no-money round');
    if (g3a.e.length) fails.push('3: errors ' + g3a.e.join(' | '));

    // 4: GPS door: GPS-1; a GPS READY course goes STRAIGHT to the round on GPS (never Round
    // Setup) - tapped twice, still one round; Recent; the reopen is Main with GPS highlighted.
    r = await go({ url: fileUrl('home.html', ''), db: DB(), settleMs: 2500, preScript: APP + GEO + ERR + KEEP, steps: [
        { expression: "(function(){ localStorage.removeItem('__fdWrites'); return 'reset'; })()" },
        { tap: '#v-main .hp-door.gps' }, { sleep: 3500 },
        { expression: "JSON.stringify({ view: (document.querySelector('.hp-view.on')||{}).id, near: Array.prototype.map.call(document.querySelectorAll('#hp-near-list .hp-row'), function (b) { return b.innerText.replace(/\\s+/g,' '); }).slice(0,3), text: document.getElementById('v-gps').innerText.slice(0,300) })" },
        { expression: "(function(){ var i = document.getElementById('hp-q'); i.value = 'Caled'; i.dispatchEvent(new Event('input', { bubbles: true })); return 'typed'; })()" }, { sleep: 300 },
        { expression: "JSON.stringify({ results: Array.prototype.map.call(document.querySelectorAll('#hp-results-list .hp-row'), function (b) { return b.innerText.replace(/\\s+/g,' '); }) })" },
        { expression: "(function(){ var b = document.querySelector('#hp-results-list [data-hp-course=\"caledonia\"]'); b.click(); b.click(); return 'double tap'; })()" }, { sleep: 6000 },
        { expression: "JSON.stringify({ url: document.URL, side: localStorage.getItem('hardpan_round_side'), write: localStorage.getItem('__fdWrite'), writes: Number(localStorage.getItem('__fdWrites')||0), requests: performance.getEntriesByType('navigation').map(function(x){return x.name;}), e: window.__e })" },
        { expression: "(function(){ sessionStorage.clear(); location.href = 'home.html'; return 'reopen'; })()" }, { sleep: 3500 },
        { expression: "JSON.stringify({ view: (document.querySelector('.hp-view.on')||{}).id, last: Array.prototype.map.call(document.querySelectorAll('#v-main .hp-door.last'), function (b) { return b.classList.contains('gps') ? 'gps' : 'games'; }) })" },
        { tap: '#v-main .hp-door.gps' }, { sleep: 2500 },
        { expression: "JSON.stringify({ recent: Array.prototype.map.call(document.querySelectorAll('#hp-recent-list .hp-row'), function (b) { return b.innerText.replace(/\\s+/g,' '); }) })" }] });
    const [p1, p2, p3, p4, p5] = J(r);
    report.gps1 = { view: p1.view, near: p1.near, results: p2.results.slice(0, 3) };
    f(p1.view === 'v-gps' && /Where are you playing\?/.test(p1.text) && /NEAR YOU/.test(p1.text), '4: GPS-1 not shown: ' + JSON.stringify(p1));
    f(p1.near.length && /Caledonia/.test(p1.near[0]) && /GPS READY/.test(p1.near[0]) && / mi/.test(p1.near[0]), '4: Near you does not list Caledonia first with miles and GPS READY: ' + JSON.stringify(p1.near));
    f(p2.results.length && /Caledonia Golf & Fish Club/.test(p2.results[0]) && /GPS READY/.test(p2.results[0]), '4: search did not find Caledonia: ' + JSON.stringify(p2.results));
    const w = p3.write ? JSON.parse(p3.write) : null, code = w && w.path.split('/')[1];
    report.gpsStart = { url: p3.url, side: p3.side, code, writes: p3.writes, key: w && w.value.activeCourseKey, holes: w && (w.value.courseData || []).length, players: w && (w.value.players || []).map((p) => p.name), course: w && w.value.courseName, e: p3.e };
    f(w && w.op === 'set' && w.value.activeCourseKey === 'caledonia' && (w.value.courseData || []).length === 18 && (w.value.players || []).length === 1 && /Caledonia/.test(w.value.courseName || '') && w.value.ownerUid, '4: the GPS round was not written with the caledonia key, its card and one golfer: ' + JSON.stringify(report.gpsStart));
    f(p3.writes === 1, '4: a double tap made ' + p3.writes + ' rounds');
    f(code && new RegExp('index\\.html\\?game=' + code + '$').test(p3.url) && p3.side === 'gps|' + code, '4: the course tap did not go straight to the round on GPS (Round Setup in between?): ' + JSON.stringify(report.gpsStart));
    f(p4.view === 'v-main' && p4.last.join() === 'gps', '4: the reopen must be Main with GPS highlighted: ' + JSON.stringify(p4));
    f(p5.recent.length && /Caledonia/.test(p5.recent[0]), '4: Caledonia not under Recent: ' + JSON.stringify(p5));
    if (p3.e.length) fails.push('4: errors ' + p3.e.join(' | '));

    // 4b: NOT SET UP YET: "Setting up GPS for ..." -> the course pulled -> the round on GPS.
    const GAPI = { name: 'Prestwick Country Club', data: Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: [4, 4, 3, 5][i % 4], hcpIndex: i + 1 })), location: { city: 'Myrtle Beach', state: 'SC' } };
    r = await go({ url: fileUrl('home.html', '#gps'), db: Object.assign(DB(), { global_courses: { gapi_999: GAPI } }), settleMs: 3000,
        preScript: APP + GEO + ERR + KEEP + LIVE({ status: 'ok', results: [{ id: '999', name: 'Prestwick Country Club', city: 'Myrtle Beach', state: 'SC', gps: true }] }, { status: 'ready', course: { id: '999', name: 'Prestwick Country Club', holes: [] } }), steps: [
        { sleep: 1500 }, { expression: TOKEN },
        { expression: "(function(){ var i = document.getElementById('hp-q'); i.value = 'Prestwick'; i.dispatchEvent(new Event('input', { bubbles: true })); return 'typed'; })()" }, { sleep: 300 },
        { expression: "JSON.stringify({ results: Array.prototype.map.call(document.querySelectorAll('#hp-results-list .hp-row'), function (b) { return b.innerText.replace(/\\s+/g,' '); }) })" },
        { expression: "(function(){ document.querySelector('#hp-results-list [data-hp-course=\"prestwick\"]').click(); return JSON.stringify({ title: document.querySelector('#hp-setup .hp-su-title').textContent }); })()" }, { sleep: 5000 },
        { expression: "JSON.stringify({ url: document.URL, write: localStorage.getItem('__fdWrite'), side: localStorage.getItem('hardpan_round_side'), setup: (document.getElementById('hp-setup')||{}).innerText || '', e: window.__e })" }] });
    const [n1, n2, n3] = J(r);
    const nw = n3.write ? JSON.parse(n3.write) : null, ncode = nw && nw.path.split('/')[1];
    report.notSetUp = { results: n1.results.slice(0, 2), first: n2.title, url: n3.url, key: nw && nw.value.activeCourseKey, holes: nw && (nw.value.courseData || []).length, setup: n3.setup, e: n3.e };
    f(n1.results.length && /Prestwick/.test(n1.results[0]) && /SET UP/.test(n1.results[0]), '4b: Prestwick should read SET UP (not bundled): ' + JSON.stringify(n1.results));
    f(/Setting up GPS for Prestwick Country Club/.test(n2.title), '4b: no "Setting up GPS for ..." screen: ' + n2.title);
    f(nw && nw.value.activeCourseKey === 'gapi_999' && (nw.value.courseData || []).length === 18 && ncode && new RegExp('index\\.html\\?game=' + ncode + '$').test(n3.url) && n3.side === 'gps|' + ncode, '4b: the pulled course did not become the round on GPS: ' + JSON.stringify(report.notSetUp));

    // 4c: setup fails (the day's limit): the reason, Play without GPS, Try another course - no dead end.
    r = await go({ url: fileUrl('home.html', '#gps'), db: DB(), settleMs: 3000,
        preScript: APP + GEO + ERR + KEEP + LIVE({ status: 'limit' }, { status: 'limit' }), steps: [
        { sleep: 1500 }, { expression: TOKEN },
        { expression: "(function(){ var i = document.getElementById('hp-q'); i.value = 'Prestwick'; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#hp-results-list [data-hp-course=\"prestwick\"]').click(); return 'tap'; })()" }, { sleep: 2500 },
        { expression: "JSON.stringify({ shown: getComputedStyle(document.getElementById('hp-setup')).display, title: document.querySelector('#hp-setup .hp-su-title').textContent, why: document.querySelector('#hp-setup .hp-su-why').textContent, buttons: Array.prototype.map.call(document.querySelectorAll('#hp-setup .hp-su-acts button'), function (b) { return getComputedStyle(b).display === 'none' ? '' : b.textContent; }).filter(Boolean) })" },
        { tap: '#hp-setup [data-hp-su="another"]' }, { sleep: 300 },
        { expression: "JSON.stringify({ shown: getComputedStyle(document.getElementById('hp-setup')).display, view: (document.querySelector('.hp-view.on')||{}).id })" },
        { expression: "(function(){ var i = document.getElementById('hp-q'); i.value = 'Prestwick'; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#hp-results-list [data-hp-course=\"prestwick\"]').click(); return 'tap again'; })()" }, { sleep: 2500 },
        { tap: '#hp-setup [data-hp-su="nogps"]' }, { sleep: 5000 },
        { expression: "JSON.stringify({ url: document.URL, side: localStorage.getItem('hardpan_round_side'), write: localStorage.getItem('__fdWrite') })" }] });
    const [l1, l2, l3] = J(r);
    const lw = l3.write ? JSON.parse(l3.write) : null, lcode = lw && lw.path.split('/')[1];
    report.limit = { fail: l1, back: l2, playWithout: { url: l3.url, side: l3.side, key: lw && lw.value.activeCourseKey } };
    f(l1.shown !== 'none' && /Could not set up GPS/.test(l1.title) && /5 new GPS courses today/.test(l1.why) && l1.buttons.join('|') === 'Play without GPS (scorecard)|Try another course', '4c: the limit failure is not explained with both ways out: ' + JSON.stringify(l1));
    f(l2.shown === 'none' && l2.view === 'v-gps', '4c: Try another course did not return to the course list');
    f(lw && lw.value.activeCourseKey === 'prestwick' && lcode && new RegExp('index\\.html\\?game=' + lcode + '$').test(l3.url) && l3.side === 'bets|' + lcode, '4c: Play without GPS did not open the round on the scorecard: ' + JSON.stringify(report.limit.playWithout));

    // 4d: ALWAYS THE LIGHT THEME, with the phone in dark mode; and Resume for a round in progress.
    const rp = round('FDRND2'); rp.scores = { p101_h1: 4, p102_h1: 5, p101_h2: 3 };
    r = await go({ url: fileUrl('home.html', ''), db: DB({ FDRND2: rp }), settleMs: 3000,
        preScript: APP + ERR + "try{localStorage.setItem('hardpan_last_round', JSON.stringify({ code: 'FDRND2', at: Date.now(), course: '' }));}catch(e){}", steps: [
        { cdp: { method: 'Emulation.setEmulatedMedia', params: { features: [{ name: 'prefers-color-scheme', value: 'dark' }] } } },
        { expression: "location.reload(), 'reload'" }, { sleep: 3000 },
        { expression: "JSON.stringify({ dark: matchMedia('(prefers-color-scheme: dark)').matches, bg: getComputedStyle(document.body).backgroundColor, text: getComputedStyle(document.body).color, resume: (document.querySelector('#hp-resume .hp-resume')||{}).textContent || '' })" },
        { tap: '#hp-resume .hp-resume' }, { sleep: 1500 }, { expression: "JSON.stringify({ url: document.URL })" }] });
    const [d1, d2] = J(r);
    report.dark = d1; report.resume = d2.url;
    f(d1.dark && d1.bg === 'rgb(240, 244, 242)' && d1.text === 'rgb(26, 26, 26)', '4d: home.html followed dark mode: ' + JSON.stringify(d1));
    f(/Resume Caledonia Golf & Fish Club · thru 2/.test(d1.resume), '4d: no "Resume <course>" for the round in progress: ' + d1.resume);
    f(/index\.html\?game=FDRND2$/.test(d2.url), '4d: Resume did not open the round: ' + d2.url);

    // 5: GPS-2 + GPS-4 in a round.
    r = await go({ url: fileUrl('index.html', 'game=FDRND1&group=1'), db: DB({ FDRND1: round() }), settleMs: 4000, webgl: true, preScript: APP + GEO + ERR + "try{localStorage.setItem('hardpan_front_door','gps');localStorage.setItem('hardpan_round_side','gps|FDRND1')}catch(e){}", steps: [
        { tap: '#fd-gps-btn' }, { sleep: 3000 },
        { expression: "JSON.stringify({ add: !!document.querySelector('#gps-overlay .gps-door-add') && document.querySelector('#gps-overlay .gps-door-add').style.display !== 'none', games: !!document.querySelector('#gps-overlay .gps-door-games') && document.querySelector('#gps-overlay .gps-door-games').style.display !== 'none', cap: (document.querySelector('#gps-overlay .gps-side-bets .gps-cap')||{}).textContent, score: !!document.querySelector('#gps-overlay .gps-score') })" },
        { expression: "(function(){ document.querySelector('#gps-overlay .gps-door-add').click(); return 'add'; })()" }, { sleep: 400 },
        { expression: "JSON.stringify({ sheet: getComputedStyle(document.querySelector('#gps-overlay .gps-addgame')).display, players: Array.prototype.map.call(document.querySelectorAll('#gps-overlay .gps-ag-players span'), function (s) { return s.textContent; }), quick: Array.prototype.map.call(document.querySelectorAll('#gps-overlay .gps-ag-grid button'), function (b) { return b.innerText.replace(/\\s+/g,' '); }), more: document.querySelector('#gps-overlay .gps-addgame').innerText.indexOf('Full game setup') !== -1 && document.querySelector('#gps-overlay .gps-addgame').innerText.indexOf('Not now') !== -1 })" },
        { expression: "(function(){ document.querySelector('#gps-overlay [data-ag-tpl=\"skins\"]').click(); return 'skins'; })()" }, { sleep: 1500 },
        { expression: "JSON.stringify({ url: document.URL })" }] });
    const [s1, s2, s3] = J(r);
    report.gps2 = s1; report.gps4 = { sheet: s2.sheet, players: s2.players, quick: s2.quick, url: s3.url };
    f(s1.add && s1.games && s1.cap === 'Score' && s1.score, '5: GPS-2 lacks Score / + Game / the Games chip: ' + JSON.stringify(s1));
    f(s2.sheet !== 'none' && s2.players.join() === 'Ann,Bob' && s2.quick.length === 4 && /Nassau\s*\$5 front/.test(s2.quick[0]) && s2.more, '5: GPS-4 sheet: ' + JSON.stringify(s2));
    f(/admin\.html\?game=FDRND1&tpl=skins$/.test(s3.url), '5: Skins did not open Round Setup for the round: ' + s3.url);
    r = await go({ url: fileUrl('admin.html', 'game=FDRND1&tpl=skins'), db: DB({ FDRND1: round() }), settleMs: 5000, preScript: APP + ERR, steps: [
        { sleep: 2500 }, { expression: "JSON.stringify({ step: typeof currentWizardStep !== 'undefined' ? currentWizardStep : null, money: typeof WIZARD_STEP_OF !== 'undefined' ? WIZARD_STEP_OF.action : null, skins: typeof skinsInstances !== 'undefined' ? skinsInstances.map(function (s) { return s.skinsBuyIn; }) : null, e: window.__e })" }] });
    report.tplSkins = J(r)[0];
    f(report.tplSkins.step === report.tplSkins.money && (report.tplSkins.skins || []).join() === '2', '5: Skins quick start did not land on Money with a $2 Skins game: ' + JSON.stringify(report.tplSkins));

    // 6b: BACK FROM THE BACKGROUND after more than an hour: Main again, like a launch.
    r = await go({ url: fileUrl('index.html', 'game=FDRND1&group=1'), db: DB({ FDRND1: round() }), settleMs: 4000, preScript: APP + ERR, steps: [
        { expression: "(function(){ var v = 'hidden'; Object.defineProperty(document, 'visibilityState', { configurable: true, get: function () { return v; } }); document.dispatchEvent(new Event('visibilitychange')); localStorage.setItem('hardpan_bg_at', String(Date.now() - 2 * 3600 * 1000)); v = 'visible'; document.dispatchEvent(new Event('visibilitychange')); return 'back after 2h'; })()" }, { sleep: 2500 },
        { expression: "JSON.stringify({ url: document.URL, view: (document.querySelector('.hp-view.on')||{}).id || null })" }] });
    report.background = J(r)[0];
    f(/home\.html$/.test(report.background.url) && report.background.view === 'v-main', '6b: back from 2h in the background did not open Main: ' + JSON.stringify(report.background));
    // 6c: a LAUNCH (index.html with no round) never draws the scorecard on the way.
    r = await go({ url: fileUrl('index.html', ''), db: DB(), settleMs: 2500, preScript: APP + ERR, steps: [{ expression: "JSON.stringify({ url: document.URL, view: (document.querySelector('.hp-view.on')||{}).id || null })" }] });
    report.launch = J(r)[0];
    f(/home\.html$/.test(report.launch.url) && report.launch.view === 'v-main', '6c: a launch did not land on the doors: ' + JSON.stringify(report.launch));

    // 7: trip.html#build.
    r = await go({ url: fileUrl('trip.html', '') + '#build', db: DB(), preScript: APP + ERR, steps: [{ sleep: 800 }, { expression: "JSON.stringify({ form: getComputedStyle(document.getElementById('create-trip-form')).display, open: !!(document.getElementById('tb-card')||{}).open })" }] });
    report.build = J(r)[0];
    f(report.build.form !== 'none' && report.build.open, '7: trip.html#build did not open the trip builder: ' + JSON.stringify(report.build));

    // 8: the web pages (no app flag).
    r = await go({ url: fileUrl('admin.html', ''), db: DB({ FDRND1: round() }), preScript: ERR, steps: [{ expression: "JSON.stringify({ url: document.URL, lobby: getComputedStyle(document.getElementById('lobby-screen')).display })" }] });
    report.webAdmin = J(r)[0];
    f(/admin\.html$/.test(report.webAdmin.url) && report.webAdmin.lobby !== 'none', '8: the web lobby moved: ' + JSON.stringify(report.webAdmin));
    r = await go({ url: fileUrl('index.html', 'game=FDRND1&group=1'), db: DB({ FDRND1: round() }), settleMs: 5000, webgl: true, preScript: ERR + "window.__freshPhone=true;", steps: [{ expression: "JSON.stringify({ btn: !!document.getElementById('fd-gps-btn'), strip: !!document.getElementById('fd-gps3'), add: !!(document.querySelector('#gps-overlay .gps-door-add') && document.querySelector('#gps-overlay .gps-door-add').style.display !== 'none'), cap: (document.querySelector('#gps-overlay .gps-side-bets .gps-cap')||{}).textContent || null })" }] });
    report.webRound = J(r)[0];
    f(!report.webRound.btn && !report.webRound.strip && !report.webRound.add && report.webRound.cap !== 'Score', '8: the web scorecard / GPS screen shows door controls: ' + JSON.stringify(report.webRound));

    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
