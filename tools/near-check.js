#!/usr/bin/env node
// ============================================================================
// NEAR YOU + THE QUICK-START'S QUESTIONS (gps-oct15, 2026-10-15)
//
//   node tools/near-check.js
//
// Manny, standing at Thistle: Thistle was not listed and Pine Lakes (21 mi) was first.
// Cold Chrome, the app (window.__hardpanDoors, GPS live), the app's GolfAPI file
// (golfapi/gps-golfapi.js - the app build only; without it this check cannot run).
//   1  At Thistle: "You're at Thistle Golf Club" on top (Sunset Beach, NC; no "(NC - 27 Hole)");
//      the rest nearest first, within 25 mi, at most 8, GPS READY a badge only.
//   2  At Pine Lakes and at Tri Mountain (WA): the course you are at is first.
//   3  Tap Thistle: "Which nines?" (Round Setup's list + "9 holes only"), Start on 1 / 10, the tee,
//      Tournament mode -> the round written as Round Setup would: "Thistle Golf Club (MacKay /
//      Stewart)", the card remapped (front odd, back even), startingHole 10, the tee, tournamentMode.
//   4  "9 holes only": "Thistle Golf Club (MacKay Only)", 9 holes, Start on hidden (hole 1).
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const HERE = path.join(__dirname, '..');
const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
const GA = path.join(HERE, 'golfapi', 'gps-golfapi.js');
if (!fs.existsSync(GA)) { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why: 'golfapi/gps-golfapi.js is not on this machine' })); process.exit(2); }
const GADATA = fs.readFileSync(GA, 'utf8');
const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});addEventListener('unhandledrejection',function(e){window.__e.push('rej '+String(e.reason&&e.reason.message||e.reason))});";
const APP = 'window.__hardpanDoors = true; window.__freshPhone = true;';
const LIVE = "(function(){ var c0; Object.defineProperty(window, 'HARDPAN_GPS_CONFIG', { configurable: true, get: function () { return c0; }, set: function (v) { c0 = v; if (v) v.liveTest = true; } }); })();";
const GEO = (lat, lng) => "try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function () { return 1; }, getCurrentPosition: function (ok) { setTimeout(function () { ok({ coords: { latitude: " + lat + ", longitude: " + lng + ", accuracy: 5 } }); }, 10); }, clearWatch: function () {} } }); var q0 = navigator.permissions.query.bind(navigator.permissions); navigator.permissions.query = function (d) { return d && d.name === 'geolocation' ? Promise.resolve({ state: 'granted' }) : q0(d); }; } catch (e) {}";
const KEEP = "(function(){var t=setInterval(function(){if(!window.__coldWrites)return;clearInterval(t);var p=window.__coldWrites.push;window.__coldWrites.push=function(w){try{if(w&&/^events\\/[^/]+$/.test(w.path)){localStorage.setItem('__fdWrite',JSON.stringify(w));localStorage.setItem('__fdWrites',String(Number(localStorage.getItem('__fdWrites')||0)+1));}}catch(e){}return p.apply(this,arguments);};},0);})();";
const TEES = { male: [{ name: 'Blue', slope: 131, rating: 71.4, parTotal: 72 }, { name: 'White', slope: 124, rating: 69.2, parTotal: 72 }] };
const DB = () => ({ events: {}, global_courses: { thistle_27: { name: 'Thistle Golf Club (NC - 27 Hole)', tees: TEES } }, trips: {}, organizers: {}, tournaments: {} });
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const go = async (o) => { const r = await arriveCold(Object.assign({ settleMs: 3000, viewport: { width: 390, height: 844 } }, o)); if (!r.ok) throw new Error(r.reason); return r; };
const NEAR = "JSON.stringify({ view: (document.querySelector('.hp-view.on')||{}).id, at: (function(){ var a = document.querySelector('#hp-near-list .hp-at'); return a ? a.innerText.replace(/\\s+/g, ' ').trim() : null; })(), rows: Array.prototype.map.call(document.querySelectorAll('#hp-near-list .hp-row'), function (b) { return b.innerText.replace(/\\s+/g, ' ').trim(); }), e: window.__e })";
const PLACES = { thistle: [33.90436, -78.54354], pinelakes: null, trimountain: [45.8338, -122.6869] };

(async () => {
    const fails = [], report = {};
    const f = (c, m) => { if (!c) fails.push(m); };
    // Pine Lakes' point: the app's GolfAPI club.
    global.window = global; require(GA);
    const pl = window.HardPanGolfApi.courses[window.HardPanGolfApi.links.pinelakes];
    PLACES.pinelakes = [pl.lat, pl.lng];
    const mi = (row) => { const m = / ([\d.]+) mi/.exec(row); return m ? Number(m[1]) : null; };

    const at = async (where) => {
        const [lat, lng] = PLACES[where];
        const r = await go({ url: fileUrl('home.html', '') + '#gps', db: DB(), preScript: APP + ERR + LIVE + GEO(lat, lng) + GADATA, steps: [{ sleep: 3500 }, { expression: NEAR }] });
        return J(r)[0];
    };
    // 1 + 2
    for (const [where, want] of [['thistle', /^Thistle Golf Club /], ['pinelakes', /^Pine Lakes/], ['trimountain', /^Tri[- ]Mountain/i]]) {
        const n = await at(where);
        report[where] = n;
        const first = n.at ? n.at.replace(/^YOU.RE AT /, '') : n.rows[0];
        f(first && want.test(first), where + ': the course you are at is not first: ' + JSON.stringify([n.at, n.rows.slice(0, 3)]));
        const ds = n.rows.map(mi).filter((x) => x != null);
        f(ds.every((d, i) => i === 0 || d >= ds[i - 1]), where + ': not nearest first: ' + JSON.stringify(ds));
        f(ds.every((d) => d <= 25) && n.rows.length <= 8, where + ': more than 25 mi or more than 8: ' + JSON.stringify(ds));
        if (n.e && n.e.length) fails.push(where + ': errors ' + n.e.join(' | '));
    }
    const t = report.thistle;
    f(t.at && /^YOU.RE AT Thistle Golf Club Sunset Beach, NC · [\d.]+ mi GPS READY$/.test(t.at), '1: the "You\'re at" card: ' + JSON.stringify(t.at));
    f(!t.rows.some((r) => /27 Hole/.test(r)), '1: the directory note "(NC - 27 Hole)" is still shown');

    // 3 + 4: the quick-start's questions, then the round as written.
    const start = (front, back, ten, tourney) => [{ sleep: 3500 },
        { expression: "(function(){ document.querySelector('#hp-near-list .hp-at [data-hp-course]').click(); return 'tap'; })()" }, { sleep: 1500 },
        { expression: "JSON.stringify({ sheet: document.getElementById('hp-opts').innerText.replace(/\\s+/g, ' '), front: Array.prototype.map.call(document.querySelectorAll('#hp-o-front option'), function (o) { return o.textContent; }), back: Array.prototype.map.call(document.querySelectorAll('#hp-o-back option'), function (o) { return o.textContent; }), tees: Array.prototype.map.call(document.querySelectorAll('#hp-o-tee option'), function (o) { return o.textContent; }) })" },
        { expression: "(function(){ var f = document.getElementById('hp-o-front'), b = document.getElementById('hp-o-back'); f.value = '" + front + "'; f.dispatchEvent(new Event('change')); b.value = '" + back + "'; b.dispatchEvent(new Event('change')); " + (ten ? "document.querySelector('[data-o-start=\"10\"]').click(); " : '') + (tourney ? "document.getElementById('hp-o-tourney').checked = true; " : '') + "return JSON.stringify({ startShown: getComputedStyle(document.getElementById('hp-o-startbox')).display !== 'none' }); })()" },
        { expression: "(function(){ document.querySelector('#hp-opts [data-o=\"go\"]').click(); return 'go'; })()" }, { sleep: 6000 },
        { expression: "JSON.stringify({ url: document.URL.split('/').pop(), w: [JSON.parse(localStorage.getItem('__fdWrite') || '{}').value || {}] })" }];
    let r = await go({ url: fileUrl('home.html', '') + '#gps', db: DB(), preScript: APP + ERR + LIVE + KEEP + GEO(...PLACES.thistle) + GADATA, steps: start('mackay', 'stewart', true, true) });
    const [q0, q1, q2] = J(r);
    const w = q2.w[0] || {};
    report.quick = { sheet: q0.sheet.slice(0, 300), front: q0.front, back: q0.back, tees: q0.tees, name: w.courseName, start: w.startingHole, tee: w.teeRating, tourney: w.tournamentMode, card: (w.courseData || []).map((h) => h.hcpIndex) };
    f(/Which nines\?/.test(q0.sheet) && q0.front.length === 3 && q0.back.length === 4 && /9 holes only/.test(q0.back[3]) && /Start on/.test(q0.sheet) && /Tournament mode/.test(q0.sheet), '3: the questions (nines, 9 holes only, Start on, Tournament mode): ' + JSON.stringify(q0));
    f(q0.tees.length === 3 && /^Blue · 71\.4 \/ 131$/.test(q0.tees[0]), '3: the tee list (the course record\'s rated tees): ' + JSON.stringify(q0.tees));
    f(w.courseName === 'Thistle Golf Club (MacKay / Stewart)' && w.activeCourseKey === 'thistle_27', '3: the name / key: ' + JSON.stringify([w.courseName, w.activeCourseKey]));
    f((w.courseData || []).length === 18 && w.courseData.slice(0, 9).every((h) => h.hcpIndex % 2 === 1) && w.courseData.slice(9).every((h) => h.hcpIndex % 2 === 0), '3: the card is not remapped like Round Setup (front odd, back even): ' + JSON.stringify(report.quick.card));
    f(w.courseData && w.courseData[0].par === 4 && w.courseData[6].par === 5 && w.courseData[12].par === 5, '3: the card is not MacKay then Stewart: ' + JSON.stringify((w.courseData || []).map((h) => h.par)));
    f(w.startingHole === 10 && w.tournamentMode === true && w.teeRating && w.teeRating.teeName === 'Blue' && w.teeRating.slope === 131 && w.teeRating.courseRating === 71.4, '3: start 10 / tee / tournament: ' + JSON.stringify([w.startingHole, w.teeRating, w.tournamentMode]));
    f(/^index\.html\?game=/.test(q2.url), '3: the round did not open: ' + q2.url);
    r = await go({ url: fileUrl('home.html', '') + '#gps', db: DB(), preScript: APP + ERR + LIVE + KEEP + GEO(...PLACES.thistle) + GADATA, steps: start('mackay', 'none', false, false) });
    const [, n1, n2] = J(r);
    const w9 = n2.w[0] || {};
    report.nine = { name: w9.courseName, holes: (w9.courseData || []).length, start: w9.startingHole, startShown: n1.startShown, tourney: w9.tournamentMode };
    f(w9.courseName === 'Thistle Golf Club (MacKay Only)' && (w9.courseData || []).length === 9 && w9.startingHole === 1 && n1.startShown === false && w9.tournamentMode === undefined, '4: 9 holes only: ' + JSON.stringify(report.nine));

    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
