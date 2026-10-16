#!/usr/bin/env node
// ============================================================================
// TOURNAMENT MODE (gps-oct15, 2026-10-15) - Rules of Golf 4.3: distance only.
//
//   node tools/tournament-check.js
//
// Cold Chrome, the app (window.__hardpanDoors). Every weather / elevation request is counted
// (and refused), so "never fetched" is measured, not assumed.
//   1  A round the organizer set to tournament mode: no wind box, no plays-like, the TOURNAMENT
//      badge, no wind or elevation request at all; Tools says "On (set by the organizer)" and
//      tapping it does not turn it off - for the organizer, a scorekeeper and a spectator.
//   2  A round without it: the wind box (sticky manual wind, "Manual") and the wind request are
//      there; Tools > Tournament mode on this phone hides it and stops asking; off brings it back.
//   3  Distance stays: the front / middle / back numbers are on screen in tournament mode.
// ============================================================================
'use strict';
const path = require('path');
const HERE = path.join(__dirname, '..');
const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
const { wizardSavedRound } = require(path.join(HERE, 'helpers/wizard-saved-round.js'));
const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});addEventListener('unhandledrejection',function(e){window.__e.push('rej '+String(e.reason&&e.reason.message||e.reason))});";
const APP = 'window.__hardpanDoors = true; window.__freshPhone = true;';
// Count (and refuse) every weather / elevation request, whatever asks for it.
const COUNT = "window.__wx = []; (function(){ var f0 = window.fetch; window.fetch = function (u, o) { var s = String(u && u.url || u); if (/weather\\.gov|weatherkit|gpsWind|epqs|elevation|open-meteo/i.test(s)) { window.__wx.push(s.slice(0, 80)); return Promise.reject(new Error('blocked in the check')); } return f0.apply(this, arguments); }; })();";
// The app's GolfAPI file (the app build only): the course's point, so the live wind has somewhere to ask about.
const GA = path.join(HERE, 'golfapi', 'gps-golfapi.js');
if (!require('fs').existsSync(GA)) { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why: 'golfapi/gps-golfapi.js is not on this machine' })); process.exit(2); }
const GADATA = require('fs').readFileSync(GA, 'utf8');
const LIVE = "(function(){ var c0; Object.defineProperty(window, 'HARDPAN_GPS_CONFIG', { configurable: true, get: function () { return c0; }, set: function (v) { c0 = v; if (v) v.liveTest = true; } }); })();";
const DB = (ev) => ({ events: ev || {}, global_courses: {}, trips: {}, organizers: {}, tournaments: {} });
const CODE = 'TOURN1';
function round(owner, extra) {
    const r = wizardSavedRound({ code: CODE, golfers: 4, names: ['Ann Able', 'Ben Bravo', 'Cal Cole', 'Dee Dunn'], hcps: [1, 2, 3, 4], ownerUid: owner, thru: 0, flights: false,
        overrides: Object.assign({ additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club' }, extra || {}) });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    return r;
}
const today = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
const SEED = (more) => "(function(){ try { if (sessionStorage.getItem('__seeded')) return; sessionStorage.setItem('__seeded','1'); localStorage.setItem('hardpan_round_side', 'gps|" + CODE + "'); localStorage.setItem('hardpan_gps_whoasked_" + CODE + "', '1'); " + (more || '') + " } catch (e) {} })();";
const MANUAL = "localStorage.setItem('hardpan_wind_manual_v2', JSON.stringify({ day: '" + today() + "', course: 'caledonia', round: '" + CODE + "', hole: 1, mph: 12, toDeg: 90 }));";
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const go = async (o) => { const r = await arriveCold(Object.assign({ settleMs: 3500, viewport: { width: 390, height: 844 }, webgl: true }, o)); if (!r.ok) throw new Error(r.reason); return r; };
const OPEN_GPS = { expression: "(function(){ if (window.HardPanGps && HardPanGps.side && HardPanGps.side() === 'gps') return 'on'; var b = document.getElementById('fd-gps-btn'); if (b) b.click(); return 'tap'; })()" };
const vis = (sel) => "(function(){ var b = document.querySelector('#gps-overlay " + sel + "'); return !!(b && getComputedStyle(b).display !== 'none' && b.offsetParent !== null); })()";
const ST = "JSON.stringify({ t: HardPanGps.tournament(), wind: " + vis('.gps-wind') + ", windText: (document.querySelector('#gps-overlay .gps-wind')||{}).innerText || '', badge: " + vis('.gps-tourney') + ", plays: (document.querySelector('#gps-overlay .gps-plays')||{}).textContent || '', toggle: (document.querySelector('#gps-overlay .gps-tourney-toggle')||{}).textContent || '', fcb: (document.querySelector('#gps-overlay .gps-top')||{}).innerText || '', wx: window.__wx.length, e: window.__e })";
const TOGGLE = { expression: "(function(){ document.querySelector('#gps-overlay .gps-tourney-toggle').click(); return 'toggle'; })()" };

(async () => {
    const fails = [], report = {};
    const f = (c, m) => { if (!c) fails.push(m); };
    const errs = (x) => (x.e || []).filter((m) => !/reading 'ts'/.test(m));

    // 1: the organizer set it - organizer, scorekeeper (group link), spectator.
    for (const [who, q, owner] of [['organizer', '', 'anon-cold'], ['scorekeeper', '&group=1', 'someone-else'], ['spectator', '&spectate=1', 'someone-else']]) {
        const r = await go({ url: fileUrl('index.html', 'game=' + CODE + q), db: DB({ [CODE]: round(owner, { tournamentMode: true }) }), preScript: APP + ERR + LIVE + GADATA + COUNT + SEED(MANUAL), steps: [{ sleep: 2500 }, OPEN_GPS, { sleep: 6000 }, { expression: ST }, TOGGLE, { sleep: 800 }, { expression: ST }] });
        const [a, b] = J(r);
        report[who] = { before: a, afterTap: b };
        f(a.t === true && !a.wind && a.badge && !/plays/.test(a.plays), '1 ' + who + ': tournament round still shows wind / plays, or no badge: ' + JSON.stringify(a));
        f(a.wx === 0 && b.wx === 0, '1 ' + who + ': a weather / elevation request was made: ' + JSON.stringify([a.wx, b.wx]));
        f(/On \(set by the organizer\)/.test(a.toggle) && b.t === true && !b.wind, '1 ' + who + ': a golfer could turn the organizer\'s tournament mode off: ' + JSON.stringify([a.toggle, b.t, b.wind]));
        f(/CENTER/.test(a.fcb) && /\bF\b/.test(a.fcb) && /\bB\b/.test(a.fcb), '3 ' + who + ': the distances are gone too: ' + JSON.stringify(a.fcb));
        [a, b].forEach((x) => { if (errs(x).length) fails.push('1 ' + who + ': errors ' + errs(x).join(' | ')); });
    }

    // 2: no round setting - the phone's own switch.
    const r = await go({ url: fileUrl('index.html', 'game=' + CODE), db: DB({ [CODE]: round('anon-cold') }), preScript: APP + ERR + LIVE + GADATA + COUNT + SEED(MANUAL), steps: [{ sleep: 2500 }, OPEN_GPS, { sleep: 5000 }, { expression: ST },
        { expression: "(function(){ window.__wx.length = 0; return 'reset'; })()" }, TOGGLE, { sleep: 5000 }, { expression: ST }, TOGGLE, { sleep: 1500 }, { expression: ST }] });
    const [o0, o1, o2] = J(r);
    report.phone = { off: o0, on: o1, offAgain: o2 };
    f(o0.t === false && o0.wind && /Manual/.test(o0.windText) && !o0.badge && /Off$/.test(o0.toggle), '2: tournament OFF is not today\'s behaviour (wind box, sticky manual, the wind request): ' + JSON.stringify(o0));
    f(o1.t === true && !o1.wind && o1.badge && o1.wx === 0, '2: Tools > Tournament mode ON did not hide the wind / stop the requests: ' + JSON.stringify(o1));
    f(o2.t === false && o2.wind && /Manual/.test(o2.windText) && !o2.badge, '2: OFF again did not bring the wind (and the manual wind) back: ' + JSON.stringify(o2));
    [o0, o1, o2].forEach((x) => { if (errs(x).length) fails.push('2: errors ' + errs(x).join(' | ')); });

    // 2b: the counter works: no manual wind, tournament off -> the live wind IS asked for; on -> not.
    const r2 = await go({ url: fileUrl('index.html', 'game=' + CODE), db: DB({ [CODE]: round('anon-cold') }), preScript: APP + ERR + LIVE + GADATA + COUNT + SEED(), steps: [{ sleep: 2500 }, OPEN_GPS, { sleep: 5000 }, { expression: ST }] });
    const r3 = await go({ url: fileUrl('index.html', 'game=' + CODE), db: DB({ [CODE]: round('anon-cold', { tournamentMode: true }) }), preScript: APP + ERR + LIVE + GADATA + COUNT + SEED(), steps: [{ sleep: 2500 }, OPEN_GPS, { sleep: 5000 }, { expression: ST }] });
    const [l0] = J(r2), [l1] = J(r3);
    report.live = { off: l0.wx, on: l1.wx };
    f(l0.wx > 0 && l1.wx === 0, '2b: the live wind request (off: asked, on: never): ' + JSON.stringify(report.live));
    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
