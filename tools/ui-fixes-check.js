#!/usr/bin/env node
// ============================================================================
// MANNY'S PHONE FIXES (gps-ui-fixes, 2026-10-13), THE WAY HE MEETS THEM
//
//   node tools/ui-fixes-check.js
//
// Cold Chrome, window.__hardpanDoors = the app, a stand-in location he can walk.
//   1  Mark shot = a measure: tap 1 "📍 0 yds", the yards from that spot live as he walks,
//      tap 2 "Shot: N yds" and that spot is the new start; nothing saved.
//   2  The yardage box: BACK on top, FRONT under it.
//   3  The bottom bar: "‹" before "Hole N · …"; once his score is in, "Hole 1 · 4".
//   4  Zoom on the LEFT edge, half way down.
//   5  GPS from Games goes back to the round in progress (GPS side); the course picker only
//      without one, or from Tools › "Pick another course" (home.html#pick).
//   6  The Add a game sheet scrolls over the GPS screen (the map's own touch hold lets it).
//   7  Games home lists every trip this phone has opened, + "Open a trip" by code.
//   8  The trip page shows the Points game setup to the signed-in owner of the trip's rounds
//      (no organizer link), and not to another account.
//   9  Near you: a course whose shared record has no city gets it from the GolfAPI data.
// ============================================================================
'use strict';
const path = require('path');
const HERE = path.join(__dirname, '..');
const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
const { wizardSavedRound } = require(path.join(HERE, 'helpers/wizard-saved-round.js'));
const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});addEventListener('unhandledrejection',function(e){window.__e.push('rej '+String(e.reason&&e.reason.message||e.reason))});";
const APP = 'window.__hardpanDoors = true; window.__freshPhone = true;';
const TEE = [33.450384, -79.153438];
// A location he can walk: window.__walk(lat, lon) moves him.
const WALK = "window.__geoCbs = []; window.__pos = " + JSON.stringify(TEE) + "; window.__walk = function (a, b) { window.__pos = [a, b]; window.__geoCbs.forEach(function (cb) { try { cb({ coords: { latitude: a, longitude: b, accuracy: 4 } }); } catch (e) {} }); }; try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { window.__geoCbs.push(ok); setTimeout(function () { ok({ coords: { latitude: window.__pos[0], longitude: window.__pos[1], accuracy: 4 } }); }, 10); return window.__geoCbs.length; }, getCurrentPosition: function (ok) { setTimeout(function () { ok({ coords: { latitude: window.__pos[0], longitude: window.__pos[1], accuracy: 4 } }); }, 10); }, clearWatch: function () {} } }); } catch (e) {} try { var q0 = navigator.permissions.query.bind(navigator.permissions); navigator.permissions.query = function (d) { return d && d.name === 'geolocation' ? Promise.resolve({ state: 'granted' }) : q0(d); }; } catch (e) {}";
const OSM = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false});}});})();";
const DB = (ev, extra) => Object.assign({ events: ev || {}, global_courses: {}, trips: {}, organizers: {}, tournaments: {} }, extra || {});
function round(code, golfers, names, score) {
    const r = wizardSavedRound({ code, golfers, names, hcps: names.map(() => 9), ownerUid: 'anon-cold', thru: 0, flights: false,
        overrides: { additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club' } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    if (score) r.scores = Object.assign({}, r.scores || {}, score(r));
    return r;
}
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const go = async (o) => { const r = await arriveCold(Object.assign({ settleMs: 4000, viewport: { width: 390, height: 844 } }, o)); if (!r.ok) throw new Error(r.reason); return r; };
const GPSREAD = "JSON.stringify({ mark: (document.querySelector('#gps-overlay .gps-mark-shot')||{}).textContent || null, markOn: !!document.querySelector('#gps-overlay .gps-mark-shot') && document.querySelector('#gps-overlay .gps-mark-shot').style.display !== 'none', score: (document.querySelector('#gps-overlay .gps-score')||{}).textContent || null, msg: (document.querySelector('#gps-overlay .gps-flash, #gps-overlay .gps-msg')||{}).textContent || '', shots: (function(){ try { return Object.keys(localStorage).filter(function(k){ return /shot/i.test(k); }).length; } catch(e) { return -1; } })(), e: window.__e })";

(async () => {
    const fails = [], report = {};
    const f = (c, m) => { if (!c) fails.push(m); };
    const one = round('UIRND1', 1, ['Manny Orozco'], (r) => ({ ['p' + r.players[0].id + '_h1']: 4 }));
    const IDX = APP + WALK + OSM + ERR + "try{localStorage.setItem('hardpan_round_side','gps|UIRND1')}catch(e){}";

    // 1-4, 6: the GPS screen.
    let r = await go({ url: fileUrl('index.html', 'game=UIRND1&gpstier=pro'), db: DB({ UIRND1: one }), webgl: true, settleMs: 5000, preScript: IDX, steps: [
        { sleep: 2500 },
        { expression: "JSON.stringify({ side: window.HardPanGps && HardPanGps.side(), bTop: (document.querySelector('#gps-overlay .gps-num-b')||{getBoundingClientRect:function(){return{}}}).getBoundingClientRect().top, fTop: (document.querySelector('#gps-overlay .gps-num-f')||{getBoundingClientRect:function(){return{}}}).getBoundingClientRect().top, order: Array.prototype.map.call(document.querySelectorAll('#gps-overlay .gps-fb .gps-lbl'), function(x){ return x.textContent; }).join(''), zoom: (function(){ var z = document.querySelector('#gps-overlay .gps-zoom'); if (!z) return null; var b = z.getBoundingClientRect(); return { l: b.left, mid: b.top + b.height / 2, vh: innerHeight, shown: getComputedStyle(z).display !== 'none' }; })(), prev: !!document.querySelector('#gps-overlay .gps-scorebox .gps-score-prev'), pick: (document.querySelector('#gps-overlay .gps-pick-course')||{style:{}}).style.display, e: window.__e })" },
        { expression: GPSREAD },
        { tap: '#gps-overlay .gps-mark-shot' }, { sleep: 300 }, { expression: GPSREAD },                                     // tap 1: 0 yds
        { expression: "(function(){ __walk(33.451284, -79.153438); return 'walked ~109 yds'; })()" }, { sleep: 400 }, { expression: GPSREAD },   // live
        { tap: '#gps-overlay .gps-mark-shot' }, { sleep: 300 }, { expression: GPSREAD },                                     // tap 2: Shot
        { expression: "(function(){ __walk(33.451734, -79.153438); return 'walked ~55 more'; })()" }, { sleep: 4300 }, { expression: GPSREAD },  // new start
        // The round opens on hole 2 (hole 1 is scored): ‹ back to hole 1, › on to hole 2.
        { tap: '#gps-overlay .gps-score-prev' }, { sleep: 500 }, { expression: GPSREAD },
        { tap: '#gps-overlay .gps-score-next' }, { sleep: 500 }, { expression: GPSREAD },
        // 6: the Add a game sheet over the GPS screen scrolls; the map stays held.
        { expression: "(function(){ HardPanDoors.openAddGame(); var sh = document.getElementById('fd-addgame'); var row = sh.querySelector('[data-ag-all=\"cup\"]'); var t1 = new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [] }); row.dispatchEvent(t1); var t2 = new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [] }); document.getElementById('gps-overlay').dispatchEvent(t2); sh.scrollTop = 9999; return JSON.stringify({ sheetHeld: t1.defaultPrevented, mapHeld: t2.defaultPrevented, scrolls: sh.scrollHeight > sh.clientHeight, top: sh.scrollTop, last: !!sh.querySelector('[data-ag-all=\"cup\"]') }); })()" }] });
    const g = J(r);
    report.gps = { layout: g[0], start: g[1].mark, tap1: g[2].mark, walked: g[3].mark, tap2: [g[4].mark, g[4].msg], after: g[5].mark, scoreBefore: g[1].score, prev: g[6].score, next: g[7].score, sheet: g[8] };
    f(g[0].side === 'gps', '0: did not land on GPS: ' + JSON.stringify(g[0]));
    f(g[0].order === 'BF' && g[0].bTop < g[0].fTop, '2: the yardage box is not BACK over FRONT: ' + JSON.stringify([g[0].order, g[0].bTop, g[0].fTop]));
    f(g[0].zoom && g[0].zoom.shown && g[0].zoom.l < 20 && Math.abs(g[0].zoom.mid - g[0].zoom.vh / 2) < 30, '4: zoom is not on the left edge half way down: ' + JSON.stringify(g[0].zoom));
    f(g[0].prev && g[0].pick === '', '3/5: no "‹" in the score bar, or no "Pick another course" in Tools: ' + JSON.stringify([g[0].prev, g[0].pick]));
    f(g[1].markOn && /Mark shot/.test(g[1].mark), '1: Mark shot is not on the GPS screen: ' + JSON.stringify(g[1]));
    f(/^📍 0 yds$/.test(g[2].mark), '1: tap 1 is not "0 yds": ' + g[2].mark);
    const walked = Number((/(\d+) yds/.exec(g[3].mark) || [])[1]);
    f(walked >= 105 && walked <= 112, '1: the yards did not follow him live: ' + g[3].mark);
    f(/^Shot: 1(0[5-9]|1[0-2]) yds$/.test(g[4].mark), '1: tap 2 is not "Shot: N yds": ' + JSON.stringify([g[4].mark, g[4].msg]));
    const again = Number((/(\d+) yds/.exec(g[5].mark) || [])[1]);
    f(again >= 50 && again <= 60, '1: the second spot is not the new start: ' + g[5].mark);
    f(g[1].shots === g[5].shots, '1: Mark shot saved something: ' + JSON.stringify([g[1].shots, g[5].shots]));
    f(g[1].score === 'Hole 2 · Enter Score', '3: the bar on the unscored hole: ' + g[1].score);
    f(g[6].score === 'Hole 1 · 4' && g[7].score === 'Hole 2 · Enter Score', '3: ‹ back to hole 1 shows his score ("Hole 1 · 4"), › on to hole 2: ' + JSON.stringify([g[6].score, g[7].score]));
    const sh = g[8];
    f(!sh.sheetHeld && sh.mapHeld && sh.scrolls && sh.top > 0 && sh.last, '6: the Add a game sheet does not scroll over the GPS screen: ' + JSON.stringify(g[8]));
    f(!g[7].e.length, 'GPS screen errors: ' + g[7].e.join(' | '));

    // 5: GPS from Games: back to the round in progress; the picker without one, or #pick.
    const LR = "try{localStorage.setItem('hardpan_last_round', JSON.stringify({ code: 'UIRND1', at: Date.now() - 600000, course: 'Caledonia' }));}catch(e){}";
    r = await go({ url: fileUrl('home.html', '') + '#games', db: DB({ UIRND1: one }), preScript: APP + WALK + ERR + LR, steps: [{ sleep: 1500 },
        { expression: "(function(){ document.querySelector('#v-games [data-hp-door=\"gps\"]').click(); return 'tap'; })()" }, { sleep: 1500 },
        { expression: "JSON.stringify({ url: document.URL, side: localStorage.getItem('hardpan_round_side') })" }] });
    const g5 = J(r)[0];
    f(/index\.html\?game=UIRND1$/.test(g5.url) && g5.side === 'gps|UIRND1', '5: GPS from Games did not go back to the round on GPS: ' + JSON.stringify(g5));
    r = await go({ url: fileUrl('home.html', '') + '#pick', db: DB({ UIRND1: one }), preScript: APP + WALK + ERR + LR, steps: [{ sleep: 1500 }, { expression: "JSON.stringify({ url: document.URL, view: (document.querySelector('.hp-view.on')||{}).id || null })" }] });
    const g5b = J(r)[0];
    f(/home\.html#pick$/.test(g5b.url) && g5b.view === 'v-gps', '5: "Pick another course" did not show the picker: ' + JSON.stringify(g5b));
    r = await go({ url: fileUrl('home.html', ''), db: DB({}), preScript: APP + WALK + ERR, steps: [{ sleep: 1500 }, { expression: "(function(){ document.querySelector('#v-main [data-hp-door=\"gps\"]').click(); return 'tap'; })()" }, { sleep: 1500 }, { expression: "JSON.stringify({ url: document.URL, view: (document.querySelector('.hp-view.on')||{}).id || null })" }] });
    const g5c = J(r)[0];
    f(/home\.html$/.test(g5c.url) && g5c.view === 'v-gps', '5: with no round in progress GPS should show the picker: ' + JSON.stringify(g5c));
    report.gpsDoor = [g5, g5b, g5c];

    // 7: Games home lists every trip this phone has opened.
    const trips = { TRIPA1: { name: 'Myrtle Beach 2026', createdAt: 1, rounds: { UIRND1: { label: 'Day 1', date: '2026-10-13' } } }, TRIPB2: { name: 'Boys Trip', createdAt: 1, rounds: {} }, TRIPC3: { name: 'Club Cup', createdAt: 1, rounds: {} } };
    r = await go({ url: fileUrl('home.html', '') + '#games', db: DB({ UIRND1: one }, { trips }), preScript: APP + ERR + "try{localStorage.setItem('hardpan_trips_v1', JSON.stringify(['TRIPB2','TRIPA1'])); localStorage.setItem('lastTripCode','TRIPC3');}catch(e){}", steps: [{ sleep: 2000 },
        { expression: "JSON.stringify({ rows: Array.prototype.map.call(document.querySelectorAll('#hp-trip-card [data-hp-trip]'), function(b){ return b.getAttribute('data-hp-trip') + ':' + b.querySelector('.n').textContent; }), code: !!document.getElementById('hp-trip-code') })" }] });
    const g7 = J(r)[0];
    report.trips = g7;
    f(g7.rows.join('|') === 'TRIPB2:Boys Trip|TRIPA1:Myrtle Beach 2026|TRIPC3:Club Cup' && g7.code, '7: Games home trips: ' + JSON.stringify(g7));
    r = await go({ url: fileUrl('trip.html', 'trip=TRIPA1&organizer=tokA'), db: DB({ UIRND1: one }, { trips: Object.assign({}, trips, { TRIPA1: Object.assign({}, trips.TRIPA1, { organizerToken: 'tokA' }) }) }), preScript: APP + ERR, steps: [{ sleep: 1500 },
        { expression: "JSON.stringify({ list: localStorage.getItem('hardpan_trips_v1'), tok: localStorage.getItem('hardpan_trip_tokens_v1') })" }] });
    const g7b = J(r)[0];
    f(JSON.parse(g7b.list || '[]')[0] === 'TRIPA1' && JSON.parse(g7b.tok || '{}').TRIPA1 === 'tokA', '7: opening a trip did not put it on the list (with its organizer link): ' + JSON.stringify(g7b));

    // 8: the trip page's Points game - the signed-in owner of the trip's rounds, no organizer link.
    const owned = round('UIRND2', 4, ['Manny Orozco', 'Joe Russo', 'Mike Dunn', 'Dave Kirk']); owned.ownerUid = 'manny-uid';
    const tripDb = DB({ UIRND2: owned }, { trips: { TRIPD4: { name: 'Myrtle Beach 2026', createdAt: 1, organizerToken: 'secret', rounds: { UIRND2: { label: 'Day 1', addedAt: 1 } } } } });
    const SEC = "JSON.stringify({ sec: (document.getElementById('league-section')||{style:{}}).style.display, card: (document.getElementById('league-card')||{}).innerText || '', e: window.__e })";
    r = await go({ url: fileUrl('trip.html', 'trip=TRIPD4'), db: tripDb, auth: { uid: 'manny-uid', email: 'm@example.com' }, preScript: APP + ERR, steps: [{ sleep: 2500 }, { expression: SEC }] });
    const g8 = J(r)[0];
    f(g8.sec !== 'none' && /Set up a Points game/.test(g8.card) && !g8.e.length, '8: the owner of the trip\'s rounds sees no Points game setup: ' + JSON.stringify(g8));
    r = await go({ url: fileUrl('trip.html', 'trip=TRIPD4'), db: tripDb, auth: { uid: 'someone-else' }, preScript: APP + ERR, steps: [{ sleep: 2500 }, { expression: SEC }] });
    const g8b = J(r)[0];
    f(g8b.sec === 'none', '8: another account sees the Points game setup: ' + JSON.stringify(g8b));
    report.trip = [g8.card.slice(0, 120), g8b.sec];

    // 9: Near you: the city from the GolfAPI data when the shared record has none.
    const GA = "window.HardPanGolfApi = { v: 1, links: { trueblue: 'GA1' }, courses: { GA1: { id: 'GA1', club: 'True Blue Golf Club', city: 'Pawleys Island', state: 'SC' } } };";
    r = await go({ url: fileUrl('home.html', '') + '#pick', db: DB({}), preScript: APP + WALK + ERR + GA, steps: [{ sleep: 3500 },
        { expression: "JSON.stringify({ rows: Array.prototype.map.call(document.querySelectorAll('#hp-near-list .hp-row'), function(b){ return b.innerText.replace(/\\s+/g,' '); }) })" }] });
    const g9 = J(r)[0];
    report.near = g9.rows;
    f(g9.rows.some((x) => /True Blue/.test(x) && /Pawleys Island, SC/.test(x)), '9: True Blue has no city / state in Near you: ' + JSON.stringify(g9.rows));

    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
