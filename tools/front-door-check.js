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
//   5  GPS-2 in a round: Score, + Game, the Games chip; + Game (and ≡ Round Menu >
//      Add a game) opens the one Add a game sheet: Quick start sets the $ and the
//      golfers / teams (the 2v2 picker) then opens that game's normal setup filled
//      in (Side Bets for a Nassau, Round Setup's Money for the others); All games
//      lists every game, each to its normal setup; Paste the whole round; Paste a
//      multi-round match opens the trip builder with today as Day 1.
//   6  GPS-3: the card of a no-money round offers Add a player / Add a game.
//   7  trip.html#build opens the trip builder.
//   8  The HardPan web pages (no app flag): no door anywhere.
//   9  Never stuck: location that never answers -> Tap to retry; GPS-1 breaking -> the
//      light retry card, which reloads Home.
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
    f(/index\.html\?game=FDRND1&spectate=1$/.test(good.url), '2: Join did not open the round: ' + good.url);
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
        { expression: "(function(){ var b = document.querySelector('#hp-results-list [data-hp-course=\"caledonia\"]'); b.click(); b.click(); var go = document.querySelector('#hp-opts [data-o=\"go\"]'); if (go) { go.click(); go.click(); } return 'double tap'; })()" }, { sleep: 6000 },
        { expression: "JSON.stringify({ url: document.URL, side: localStorage.getItem('hardpan_round_side'), write: localStorage.getItem('__fdWrite'), writes: Number(localStorage.getItem('__fdWrites')||0), requests: performance.getEntriesByType('navigation').map(function(x){return x.name;}), e: window.__e })" },
        { expression: "(function(){ sessionStorage.clear(); location.href = 'home.html'; return 'reopen'; })()" }, { sleep: 3500 },
        { expression: "JSON.stringify({ view: (document.querySelector('.hp-view.on')||{}).id, last: Array.prototype.map.call(document.querySelectorAll('#v-main .hp-door.last'), function (b) { return b.classList.contains('gps') ? 'gps' : 'games'; }) })" },
        // With a round in progress GPS goes back to it (gps-ui-fixes); the picker is "Pick another course".
        { expression: "(function(){ location.hash = 'pick'; location.reload(); return 'pick'; })()" }, { sleep: 3000 },
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
        { expression: "(function(){ document.querySelector('#hp-results-list [data-hp-course=\"prestwick\"]').click(); var go = document.querySelector('#hp-opts [data-o=\"go\"]'); if (go) { go.click(); go.click(); } return JSON.stringify({ title: document.querySelector('#hp-setup .hp-su-title').textContent }); })()" }, { sleep: 5000 },
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
        { expression: "(function(){ var i = document.getElementById('hp-q'); i.value = 'Prestwick'; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#hp-results-list [data-hp-course=\"prestwick\"]').click(); var go = document.querySelector('#hp-opts [data-o=\"go\"]'); if (go) { go.click(); go.click(); } return 'tap'; })()" }, { sleep: 2500 },
        { expression: "JSON.stringify({ shown: getComputedStyle(document.getElementById('hp-setup')).display, title: document.querySelector('#hp-setup .hp-su-title').textContent, why: document.querySelector('#hp-setup .hp-su-why').textContent, buttons: Array.prototype.map.call(document.querySelectorAll('#hp-setup .hp-su-acts button'), function (b) { return getComputedStyle(b).display === 'none' ? '' : b.textContent; }).filter(Boolean) })" },
        { tap: '#hp-setup [data-hp-su="another"]' }, { sleep: 300 },
        { expression: "JSON.stringify({ shown: getComputedStyle(document.getElementById('hp-setup')).display, view: (document.querySelector('.hp-view.on')||{}).id })" },
        { expression: "(function(){ var i = document.getElementById('hp-q'); i.value = 'Prestwick'; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#hp-results-list [data-hp-course=\"prestwick\"]').click(); var go = document.querySelector('#hp-opts [data-o=\"go\"]'); if (go) { go.click(); go.click(); } return 'tap again'; })()" }, { sleep: 2500 },
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

    // 5: GPS-2 + GPS-4 in a round (4 golfers): + opens the ONE Add a game sheet - Quick
    // start (Nassau / Skins / Vegas / BBB), Paste, All games; ≡ Round Menu has the same.
    const R4 = () => { const x = wizardSavedRound({ code: 'FDRND4', golfers: 4, names: ['Manny Orozco', 'Joe Russo', 'Mike Dunn', 'Dave Kirk'], hcps: [12, 8, 15, 10], ownerUid: 'anon-cold', thru: 0, flights: false,
        overrides: { additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club' } }); delete x.moneyPool; delete x.kpWinners; delete x.kpConfirmed; return x; };
    const ID4 = {}; R4().players.forEach((p) => { ID4[p.name.split(' ')[0]] = String(p.id); });
    const SHEET = "JSON.stringify({ open: !!document.getElementById('fd-addgame') && document.getElementById('fd-addgame').style.display !== 'none', bg: document.getElementById('fd-addgame') ? getComputedStyle(document.getElementById('fd-addgame')).backgroundColor : null, text: document.getElementById('fd-addgame') ? document.getElementById('fd-addgame').innerText : '', quick: Array.prototype.map.call(document.querySelectorAll('#fd-addgame [data-ag-q]'), function (b) { return b.getAttribute('data-ag-q'); }), all: Array.prototype.map.call(document.querySelectorAll('#fd-addgame [data-ag-all]'), function (b) { return b.getAttribute('data-ag-all'); }), cta: (document.getElementById('fd-ag-cta')||{}).textContent || null, ctaOff: !!(document.getElementById('fd-ag-cta')||{}).disabled, url: document.URL, e: window.__e })";
    const CLICK = (sel) => ({ expression: "(function(){ var b = document.querySelector(" + JSON.stringify(sel) + "); if (!b) return 'missing " + sel.replace(/"/g, '') + "'; b.click(); return 'tap'; })()" });
    const PICK = (first) => CLICK('#fd-addgame [data-ag-pick="' + ID4[first] + '"]');
    const IDX = APP + GEO + ERR + "try{localStorage.setItem('hardpan_front_door','gps');localStorage.setItem('hardpan_round_side','gps|FDRND4')}catch(e){}";
    r = await go({ url: fileUrl('index.html', 'game=FDRND4&group=1'), db: DB({ FDRND4: R4() }), settleMs: 4000, webgl: true, preScript: IDX, steps: [
        { tap: '#fd-gps-btn' }, { sleep: 3000 },
        { expression: "JSON.stringify({ add: !!document.querySelector('#gps-overlay .gps-door-add') && document.querySelector('#gps-overlay .gps-door-add').style.display !== 'none', games: !!document.querySelector('#gps-overlay .gps-door-games') && document.querySelector('#gps-overlay .gps-door-games').style.display !== 'none', cap: (document.querySelector('#gps-overlay .gps-side-bets .gps-cap')||{}).textContent, score: !!document.querySelector('#gps-overlay .gps-score') })" },
        CLICK('#gps-overlay .gps-door-add'), { sleep: 400 }, { expression: SHEET },                         // 1 the sheet
        CLICK('#fd-addgame [data-ag-q="vegas"]'), { sleep: 200 }, { expression: SHEET },                    // 2 Vegas: pre-filled 1+2 v 3+4
        PICK('Joe'), { sleep: 100 }, { expression: SHEET },                                                 // 3 Joe un-picked: Manny & Mike v Dave
        PICK('Joe'), CLICK('#fd-addgame [data-ag-swap]'), CLICK('#fd-addgame [data-ag-amt="2"]'), { sleep: 100 }, { expression: SHEET },   // 4 Joe -> B; swap; $2
        CLICK('#fd-ag-cta'), { sleep: 1500 }, { expression: "JSON.stringify({ url: document.URL })" }] });
    const [s1, a1, a2, a3, a4, a5] = J(r);
    report.gps2 = s1; report.addGame = { sheet: a1.open, quick: a1.quick, all: a1.all, vegas: [a2.text.match(/Team A:[^\n]*/), a2.text.match(/Team B:[^\n]*/), a3.text.match(/Team A:[^\n]*/), a4.text.match(/Team A:[^\n]*/), a4.cta].map(String), url: a5.url };
    f(s1.add && s1.games && s1.cap === 'Score' && s1.score, '5: GPS-2 lacks Score / + Game / the Games chip: ' + JSON.stringify(s1));
    f(a1.open && a1.bg === 'rgb(240, 244, 242)' && /Manny · Joe · Mike · Dave/.test(a1.text) && a1.quick.join() === 'nassau,skins,vegas,bbb', '5: + did not open the Add a game sheet (light, golfers, 4 quick starts): ' + JSON.stringify([a1.open, a1.bg, a1.quick, a1.text.slice(0, 120)]));
    f(/Paste the whole round/.test(a1.text) && /Paste a multi-round match \/ trip/.test(a1.text), '5: the sheet lacks the two pastes');
    ['points', 'nassau', 'match', 'strokebet', 'skins', 'vegas', 'bbb', 'wolf', 'dots', 'nines', 'kp', 'presses', 'side', 'bestball', 'stableford', 'scramble', 'hilo', 'ryder', 'cup'].forEach((g) => f(a1.all.indexOf(g) !== -1, '5: All games lacks ' + g));
    f(/Team A: Manny Orozco & Joe Russo/.test(a2.text) && /Team B: Mike Dunn & Dave Kirk/.test(a2.text), '5: Vegas was not pre-filled 1+2 v 3+4: ' + a2.text.slice(0, 400));
    f(/Team A: Manny Orozco & Mike Dunn/.test(a3.text) && /Team B: Dave Kirk & __/.test(a3.text) && a3.ctaOff, '5: un-picking Joe did not move the rest up (or Add was not held): ' + a3.text.slice(0, 400));
    f(/Team A: Dave Kirk & Joe Russo/.test(a4.text) && /Team B: Manny Orozco & Mike Dunn/.test(a4.text) && /Add Vegas · \$2 a point/.test(a4.cta) && !a4.ctaOff, '5: re-pick + Swap + $2: ' + JSON.stringify([a4.text.slice(0, 400), a4.cta]));
    const wantIds = [ID4.Dave, ID4.Joe, ID4.Manny, ID4.Mike].join('%2C');
    f(new RegExp('admin\\.html\\?game=FDRND4&tpl=vegas&amt=2&ids=' + wantIds + '$').test(a5.url), '5: Add Vegas did not open Round Setup with the $ and teams: ' + a5.url);
    r = await go({ url: fileUrl('admin.html', 'game=FDRND4&tpl=vegas&amt=2&ids=' + wantIds), db: DB({ FDRND4: R4() }), settleMs: 5000, preScript: APP + ERR, steps: [
        { sleep: 2500 }, { expression: "JSON.stringify({ step: currentWizardStep, money: WIZARD_STEP_OF.action, v: Object.values(foreignGameInstances).filter(function (x) { return x.format === 'vegas'; }), ed: (document.getElementById('exg-editor')||{}).innerText || '', e: window.__e })" }] });
    report.tplVegas = J(r)[0];
    const vg = report.tplVegas.v[0] || {};
    f(report.tplVegas.step === report.tplVegas.money && report.tplVegas.v.length === 1 && vg.vegasPointVal === 2 && vg.vegasTeamA.join() === [ID4.Dave, ID4.Joe].join() && vg.vegasTeamB.join() === [ID4.Manny, ID4.Mike].join()
        && /Team A: Dave & Joe/.test(report.tplVegas.ed) && /Swap teams/.test(report.tplVegas.ed), '5: Money did not get the Vegas as set: ' + JSON.stringify([report.tplVegas.step, vg, report.tplVegas.ed.slice(0, 300), report.tplVegas.e]));
    f(!report.tplVegas.e.length, '5: Round Setup errors ' + report.tplVegas.e.join(' | '));

    // 5b: ≡ ROUND MENU -> Add a game; Nassau $10 2 v 2 -> Side Bets' Add form, filled in.
    r = await go({ url: fileUrl('index.html', 'game=FDRND4&group=1'), db: DB({ FDRND4: R4() }), settleMs: 4000, preScript: APP + ERR, steps: [
        { expression: "JSON.stringify({ menu: Array.prototype.map.call(document.querySelectorAll('#round-sheet-body #fd-menu-games button'), function (b) { return b.textContent; }) })" },
        CLICK('#fd-menu-games [data-fdm="add"]'), { sleep: 300 }, { expression: SHEET },
        CLICK('#fd-addgame [data-ag-q="nassau"]'), CLICK('#fd-addgame [data-ag-amt="10"]'), { sleep: 100 }, { expression: SHEET },
        // The queue is read as Add is tapped (Side Bets takes it off on arrival).
        { expression: "(function(){ var s0 = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (/^hardpan_paste_bets_v1_/.test(k)) s0.call(sessionStorage, '__q', v); return s0.apply(this, arguments); }; document.getElementById('fd-ag-cta').click(); return 'tap'; })()" }, { sleep: 1500 },
        { expression: "JSON.stringify({ url: document.URL, q: sessionStorage.getItem('__q') })" }] });
    const [rm0, rm1, rm2, rm3] = J(r);
    report.menu = { items: rm0.menu, sheet: rm1.open, nassau: rm2.cta, url: rm3.url, queued: rm3.q };
    f(rm0.menu.join('|') === '➕ Add a game|📋 Paste the whole round|🗓️ Paste a multi-round match', '5b: the Round Menu lacks the three items: ' + JSON.stringify(rm0.menu));
    f(rm1.open, '5b: ≡ Add a game did not open the sheet');
    f(/Team A: Manny Orozco & Joe Russo/.test(rm2.text) && /Add Nassau · \$10 each/.test(rm2.cta), '5b: Nassau config: ' + JSON.stringify([rm2.cta, rm2.text.slice(0, 300)]));
    const qb = JSON.parse(rm3.q || '{}').bets || [];
    f(/sidematches\.html\?game=FDRND4&hpfill=1$/.test(rm3.url) && qb.length === 1 && qb[0].a.join() === 'Manny Orozco,Joe Russo' && qb[0].b.join() === 'Mike Dunn,Dave Kirk' && qb[0].front === 10 && qb[0].overall === 10, '5b: Add Nassau did not hand Side Bets the bet: ' + JSON.stringify([rm3.url, qb]));
    r = await go({ url: fileUrl('sidematches.html', 'game=FDRND4&hpfill=1'), db: DB({ FDRND4: R4() }), settleMs: 5000, preScript: APP + ERR + "try{localStorage.setItem('hardpan_paste_bets_v1_FDRND4'," + JSON.stringify(rm3.q || '') + ")}catch(e){}", steps: [
        { sleep: 1500 }, { expression: "JSON.stringify({ modal: getComputedStyle(document.getElementById('sidematch-modal')).display, fmt: document.getElementById('sm-format').value, front: document.getElementById('sm-front-stake').value, picks: typeof sidematchPickOrder !== 'undefined' ? sidematchPickOrder.map(String) : null, left: localStorage.getItem('hardpan_paste_bets_v1_FDRND4'), e: window.__e })" }] });
    report.smFill = J(r)[0];
    f(report.smFill.modal === 'flex' && report.smFill.fmt === 'nassau' && Number(report.smFill.front) === 10 && (report.smFill.picks || []).join() === [ID4.Manny, ID4.Joe, ID4.Mike, ID4.Dave].join() && !report.smFill.left && !report.smFill.e.length,
        '5b: Side Bets did not open the Nassau filled in: ' + JSON.stringify(report.smFill));

    // 5c: Skins $5, Dave out, no carry; All games rows; the two pastes.
    r = await go({ url: fileUrl('index.html', 'game=FDRND4&group=1'), db: DB({ FDRND4: R4() }), settleMs: 4000, preScript: APP + ERR, steps: [
        { expression: "HardPanDoors.openAddGame() && 'open'" }, CLICK('#fd-addgame [data-ag-q="skins"]'), CLICK('#fd-addgame [data-ag-in="' + ID4.Dave + '"]'), CLICK('#fd-addgame [data-ag-amt="5"]'), CLICK('#fd-addgame [data-ag-carry]'), { sleep: 100 }, { expression: SHEET },
        CLICK('#fd-ag-cta'), { sleep: 1500 }, { expression: "JSON.stringify({ url: document.URL })" }] });
    const [k1, k2] = J(r);
    f(/Add Skins · \$5 a skin/.test(k1.cta) && new RegExp('tpl=skins&amt=5&ids=' + [ID4.Manny, ID4.Joe, ID4.Mike].join('%2C') + '&carry=0$').test(k2.url), '5c: Skins quick start: ' + JSON.stringify([k1.cta, k2.url]));
    r = await go({ url: fileUrl('admin.html', 'game=FDRND4&tpl=skins&amt=5&ids=' + [ID4.Manny, ID4.Joe, ID4.Mike].join('%2C') + '&carry=0'), db: DB({ FDRND4: R4() }), settleMs: 5000, preScript: APP + ERR, steps: [
        { sleep: 2500 }, { expression: "JSON.stringify({ step: currentWizardStep, money: WIZARD_STEP_OF.action, sk: skinsInstances.map(function (s) { return { b: s.skinsBuyIn, c: s.skinsCarryOver, p: s.participantIds }; }), e: window.__e })" }] });
    report.tplSkins = J(r)[0];
    const sk = report.tplSkins.sk[0] || {};
    f(report.tplSkins.step === report.tplSkins.money && report.tplSkins.sk.length === 1 && Number(sk.b) === 5 && sk.c === false && (sk.p || []).map(String).join() === [ID4.Manny, ID4.Joe, ID4.Mike].join(), '5c: Money did not get the Skins as set: ' + JSON.stringify(report.tplSkins));
    r = await go({ url: fileUrl('admin.html', 'game=FDRND1&tpl=skins'), db: DB({ FDRND1: round() }), settleMs: 5000, preScript: APP + ERR, steps: [
        { sleep: 2500 }, { expression: "JSON.stringify({ step: currentWizardStep, money: WIZARD_STEP_OF.action, skins: skinsInstances.map(function (s) { return s.skinsBuyIn; }), e: window.__e })" }] });
    report.tplSkinsPlain = J(r)[0];
    f(report.tplSkinsPlain.step === report.tplSkinsPlain.money && (report.tplSkinsPlain.skins || []).join() === '2', '5c: a plain Skins template is no longer $2: ' + JSON.stringify(report.tplSkinsPlain));
    const ALL = { match: /sidematches\.html\?game=FDRND4&add=1&fmt=match$/, bestball: /admin\.html\?game=FDRND4&fmt=bestball$/, kp: /admin\.html\?game=FDRND4&step=money$/, wolf: /admin\.html\?game=FDRND4&tpl=wolf$/, presses: /sidematches\.html\?game=FDRND4$/ };
    report.allGames = {};
    for (const id of Object.keys(ALL)) {
        r = await go({ url: fileUrl('index.html', 'game=FDRND4&group=1'), db: DB({ FDRND4: R4() }), settleMs: 3500, preScript: APP + ERR, steps: [
            { expression: "HardPanDoors.openAddGame() && 'open'" }, CLICK('#fd-addgame [data-ag-all="' + id + '"]'), { sleep: 1200 }, { expression: "JSON.stringify({ url: document.URL })" }] });
        report.allGames[id] = J(r)[0].url.split('/').pop();
        f(ALL[id].test(J(r)[0].url), '5c: All games > ' + id + ' went to ' + J(r)[0].url);
    }
    r = await go({ url: fileUrl('sidematches.html', 'game=FDRND4&add=1&fmt=match'), db: DB({ FDRND4: R4() }), settleMs: 5000, preScript: APP + ERR, steps: [
        { sleep: 1000 }, { expression: "JSON.stringify({ modal: getComputedStyle(document.getElementById('sidematch-modal')).display, fmt: document.getElementById('sm-format').value, e: window.__e })" }] });
    report.smMatch = J(r)[0];
    f(report.smMatch.modal === 'flex' && report.smMatch.fmt === 'match' && !report.smMatch.e.length, '5c: Match play did not open Side Bets on Match play: ' + JSON.stringify(report.smMatch));
    r = await go({ url: fileUrl('admin.html', 'game=FDRND4&fmt=bestball'), db: DB({ FDRND4: R4() }), settleMs: 5000, preScript: APP + ERR, steps: [
        { sleep: 2500 }, { expression: "JSON.stringify({ step: currentWizardStep, fmtStep: WIZARD_STEP_OF.format, sel: (document.querySelector('.fmt-card.selected, .fmt-card[aria-pressed=\"true\"], .fmt-card.active')||{}).id || null, e: window.__e })" }] });
    report.fmtBestBall = J(r)[0];
    f(report.fmtBestBall.step === report.fmtBestBall.fmtStep && report.fmtBestBall.sel === 'fmt-card-bestball' && !report.fmtBestBall.e.length, '5c: Best ball did not open the Format step with Best Ball picked: ' + JSON.stringify(report.fmtBestBall));
    // The two pastes. A multi-round match: the trip builder, today = Day 1, this course, these golfers.
    r = await go({ url: fileUrl('index.html', 'game=FDRND4&group=1'), db: DB({ FDRND4: R4() }), settleMs: 3500, preScript: APP + ERR, steps: [
        { expression: "HardPanDoors.openAddGame() && 'open'" }, CLICK('#fd-addgame [data-ag-go="paste"]'), { sleep: 1200 }, { expression: "JSON.stringify({ url: document.URL })" }] });
    report.pasteRound = J(r)[0].url.split('/').pop();
    f(/admin\.html\?game=FDRND4&paste=1$/.test(J(r)[0].url), '5c: Paste the whole round went to ' + J(r)[0].url);
    r = await go({ url: fileUrl('index.html', 'game=FDRND4&group=1'), db: DB({ FDRND4: R4() }), settleMs: 3500, preScript: APP + ERR, steps: [
        { expression: "HardPanDoors.openAddGame() && 'open'" }, CLICK('#fd-addgame [data-ag-go="trip"]'), { sleep: 2500 },
        { expression: "JSON.stringify({ url: document.URL, box: (document.getElementById('tb-box')||{}).value || '', note: (document.getElementById('fd-tb-note')||{}).innerText || '', open: !!(document.getElementById('tb-card')||{}).open, e: window.__e })" },
        { expression: "(function(){ HardPanTripBuilderUI.read(); var S = HardPanTripBuilderUI._state(); return JSON.stringify({ days: S.plan.days.length, golfers: S.plan.golfers, course: S.plan.days[0] && S.plan.days[0].courseKey, review: document.getElementById('tb-review').innerText.slice(0, 300) }); })()" }] });
    const [t1, t2] = J(r);
    report.tripPaste = { url: t1.url.split('/').pop(), box: t1.box, note: t1.note, read: t2 };
    f(/trip\.html#build$/.test(t1.url) && t1.open && /^TRIP: Caledonia trip\nDAY 1 - \w{3} \w{3} \d+ - Caledonia Golf\nGroup 1: Manny Orozco & Joe Russo vs Mike Dunn & Dave Kirk\n$/.test(t1.box) && /FDRND4/.test(t1.note) && /new round/.test(t1.note), '5c: the multi-round paste did not open the builder filled in: ' + JSON.stringify(t1));
    f(t2.days === 1 && t2.course === 'caledonia' && t2.golfers.join() === 'Manny Orozco,Joe Russo,Mike Dunn,Dave Kirk', '5c: the builder did not read Day 1 back: ' + JSON.stringify(t2));

    // 9: NEVER STUCK (gps-doors-black). a) Location that never answers (the first-launch
    // prompt left up): after LOC_MS, "Couldn't get your location yet" + Tap to retry; the
    // retry with location answering lists Near you. b) GPS-1 throwing: the retry card, not a
    // half-drawn screen. c) The retry card reloads Home.
    const HANG = "window.__geoAnswer = false; try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function () { return 1; }, clearWatch: function () {}, getCurrentPosition: function (ok) { if (window.__geoAnswer) setTimeout(function () { ok({ coords: { latitude: " + CAL[0] + ", longitude: " + CAL[1] + ", accuracy: 5 } }); }, 10); } } }); } catch (e) {}";
    r = await go({ url: fileUrl('home.html', ''), db: DB(), settleMs: 2500, preScript: APP + HANG + ERR, steps: [
        { tap: '#v-main .hp-door.gps' }, { sleep: 4000 },
        { expression: "JSON.stringify({ near: document.getElementById('hp-near-list').innerText, ms: HardPanDoors.LOC_MS })" },
        { sleep: 12500 },
        { expression: "JSON.stringify({ near: document.getElementById('hp-near-list').innerText, retry: !!document.querySelector('#hp-near-list [data-hp-retry]'), view: (document.querySelector('.hp-view.on')||{}).id })" },
        { expression: "(function(){ window.__geoAnswer = true; document.querySelector('#hp-near-list [data-hp-retry]').click(); return 'retry'; })()" }, { sleep: 2500 },
        { expression: "JSON.stringify({ near: document.getElementById('hp-near-list').innerText, e: window.__e })" }] });
    const [h0, h1, h2] = J(r);
    report.locHang = { waiting: h0.near, after: h1.near, retried: h2.near.slice(0, 120) };
    f(/Finding courses near you/.test(h0.near) && h0.ms === 15000, '9a: while location is unanswered, GPS-1 should say it is finding courses: ' + JSON.stringify(h0));
    f(/Couldn’t get your location yet/.test(h1.near) && h1.retry && h1.view === 'v-gps', '9a: no "Tap to retry" after the location wait: ' + JSON.stringify(h1));
    f(/Caledonia/.test(h2.near) && !h2.e.length, '9a: Tap to retry did not list Near you once location answered: ' + JSON.stringify(h2));
    r = await go({ url: fileUrl('home.html', ''), db: DB(), settleMs: 2500, preScript: APP + GEO + ERR + "Object.defineProperty(window, 'HardPanGpsCourses', { configurable: true, get: function () { throw new Error('test: GPS-1 broke'); }, set: function () {} });", steps: [
        { tap: '#v-main .hp-door.gps' }, { sleep: 1500 },
        { expression: "JSON.stringify({ stuck: !!document.getElementById('fd-stuck') && getComputedStyle(document.getElementById('fd-stuck')).display !== 'none', text: (document.getElementById('fd-stuck')||{}).innerText || '', bg: document.getElementById('fd-stuck') ? getComputedStyle(document.getElementById('fd-stuck')).backgroundColor : null })" },
        { expression: "(function(){ document.querySelector('#fd-stuck button').click(); return 'tap'; })()" }, { sleep: 2000 },
        { expression: "JSON.stringify({ url: document.URL, view: (document.querySelector('.hp-view.on')||{}).id || null })" }] });
    const [st0, st1] = J(r);
    report.stuck = { card: st0.text.replace(/\n/g, ' | '), after: st1 };
    f(st0.stuck && /Tap to retry/.test(st0.text) && st0.bg === 'rgb(240, 244, 242)', '9b: GPS-1 breaking did not show the light retry card: ' + JSON.stringify(st0));
    f(/home\.html$/.test(st1.url) && st1.view === 'v-main', '9c: Tap to retry did not reload Home: ' + JSON.stringify(st1));

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
