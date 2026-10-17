#!/usr/bin/env node
// ============================================================================
// "GAMES" ON THE GPS SCREEN STAYS IN THE ROUND (mailbox 002b, 2026-10-17)
//
//   node tools/games-button-check.js
//
// Manny: in a round opened GPS-first, "Games" went to home.html#games ("start a round") and
// asked for the course again. Cold Chrome, the app (window.__hardpanDoors).
//   1  A round with games, on GPS at hole 5: Games -> the same page, the card side, Today's
//      games in view, no course picker, no reload. The GPS button -> the map again, still hole 5.
//   2  A round with no games: Games -> this round's own Add a game (the same page).
//   3  The back "‹" -> the card side, the same page and hole; no way off the GPS screen drops
//      the round unless the golfer chose to leave (Pick another course is that choice).
// ============================================================================
'use strict';
const path = require('path');
const HERE = path.join(__dirname, '..');
const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
const { wizardSavedRound } = require(path.join(HERE, 'helpers/wizard-saved-round.js'));
const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});addEventListener('unhandledrejection',function(e){window.__e.push('rej '+String(e.reason&&e.reason.message||e.reason))});";
const APP = 'window.__hardpanDoors = true; window.__freshPhone = true;';
const DB = (ev) => ({ events: ev || {}, global_courses: {}, trips: {}, organizers: {}, tournaments: {} });
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
function round(code, extra) {
    const r = wizardSavedRound({ code, golfers: 4, names: ['Ann Able', 'Ben Bravo', 'Cal Cole', 'Dee Dunn'], hcps: [1, 2, 3, 4], ownerUid: 'anon-cold', thru: 0, flights: false,
        overrides: Object.assign({ additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club' }, extra || {}) });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    return r;
}
const SEED = (code) => "localStorage.setItem('hardpan_round_side', 'gps|" + code + "'); localStorage.setItem('hardpan_gps_whoasked_" + code + "', '1'); window.__loads = (Number(sessionStorage.getItem('__loads') || 0) + 1); sessionStorage.setItem('__loads', String(window.__loads));";
const ST = "JSON.stringify({ url: document.URL.split('/').pop(), loads: sessionStorage.getItem('__loads'), side: HardPanGps.side(), hole: HardPanGps.hole(), games: (function(){ var m = document.getElementById('todays-games-mount'); if (!m || !m.textContent.trim()) return null; var r = m.getBoundingClientRect(); return { text: m.innerText.slice(0, 60), inView: r.top < window.innerHeight && r.bottom > 0 }; })(), addGame: (function(){ var a = document.getElementById('fd-addgame'); return !!(a && a.style.display !== 'none'); })(), picker: !!document.querySelector('#v-gps.on, #hp-near-list'), e: window.__e })";
const go = async (o) => { const r = await arriveCold(Object.assign({ settleMs: 3000, viewport: { width: 390, height: 844 }, webgl: true }, o)); if (!r.ok) throw new Error(r.reason); return r; };
const CLICK = (sel) => ({ expression: "(function(){ var b = document.querySelector(" + JSON.stringify(sel) + "); if (!b) return 'missing ' + " + JSON.stringify(sel) + "; b.click(); return 'ok'; })()" });

(async () => {
    const fails = [], report = {};
    const f = (c, m) => { if (!c) fails.push(m); };
    // 1: a round with games (Nassau + skins), GPS at hole 5.
    let r = await go({ url: fileUrl('index.html', 'game=GBTN01'), db: DB({ GBTN01: round('GBTN01', { nassauStake: 5, skinsBuyIn: 5, gameFormat: 'nassau' }) }), preScript: APP + ERR + SEED('GBTN01'), steps: [{ sleep: 2500 },
        { expression: "(function(){ goToHole(5); return 'h5'; })()" }, { sleep: 800 }, CLICK('#fd-gps-btn'), { sleep: 1200 }, { expression: ST },
        CLICK('#gps-overlay .gps-door-games'), { sleep: 1200 }, { expression: ST },
        CLICK('#fd-gps-btn'), { sleep: 1200 }, { expression: ST },
        CLICK('#gps-overlay .gps-back'), { sleep: 800 }, { expression: ST }] });
    const [a0, a1, a2, a3] = J(r);
    report.withGames = [a0, a1, a2, a3].map((x) => [x.url, x.loads, x.side, x.hole, x.games && x.games.inView, x.addGame]);
    f(a0.side === 'gps' && a0.hole === 5, '1: did not start on GPS at hole 5: ' + JSON.stringify(a0));
    f(a1.url === a0.url && a1.loads === a0.loads && a1.side === 'bets' && a1.games && a1.games.inView && !a1.addGame, '1: Games did not show this round\'s games in place: ' + JSON.stringify(a1));
    f(a2.side === 'gps' && a2.hole === 5 && a2.loads === a0.loads, '1: the GPS button did not come back to the map on hole 5: ' + JSON.stringify(a2));
    f(a3.side === 'bets' && a3.url === a0.url && a3.hole === 5 && a3.loads === a0.loads, '3: back "‹" left the round: ' + JSON.stringify(a3));
    // 2: a round with no games.
    r = await go({ url: fileUrl('index.html', 'game=GBTN02'), db: DB({ GBTN02: round('GBTN02', { gameFormat: 'stroke', holeBetStake: 0, matchStake: 0, nassauStake: 0, skinsBuyIn: 0, birdieGameEnabled: false }) }), preScript: APP + ERR + SEED('GBTN02'), steps: [{ sleep: 2500 },
        CLICK('#fd-gps-btn'), { sleep: 1200 }, { expression: ST }, CLICK('#gps-overlay .gps-door-games'), { sleep: 1200 }, { expression: ST }] });
    const [b0, b1] = J(r);
    report.noGames = [b0, b1].map((x) => [x.url, x.side, x.games, x.addGame]);
    f(b1.url === b0.url && b1.loads === b0.loads && b1.addGame, '2: a round with no games: Games did not open this round\'s Add a game: ' + JSON.stringify(b1));
    [a0, a1, a2, a3, b0, b1].forEach((x) => (x.e || []).filter((m) => !/reading 'ts'/.test(m)).forEach((m) => fails.push('error: ' + m)));
    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
