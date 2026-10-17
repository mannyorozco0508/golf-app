#!/usr/bin/env node
// ============================================================================
// A GAME THAT NEEDS MORE GOLFERS ASKS FOR THEM FIRST (URGENT-001, 2026-10-17)
//
//   node tools/players-first-check.js
//
// Manny: in a GPS-first round (one golfer, "Me"), Add a game -> "KP pool / Weekly game"
// went straight to Round Setup's Money step with nobody to put in the pool. One browser,
// the journey stand-in (writes carry from page to page), the app's front door on.
//   1  1 golfer, GPS on hole 5 -> KP pool -> Round Setup on PLAYERS with "Add your golfers
//      first, then we'll set up KP pool / Weekly game." -> add 3 -> Save golfers -> the
//      Money step, same code, the Weekly Game section open -> Save -> back on the round,
//      GPS, hole 5.
//   2  the same for Nassau (a QUICK START): Players first -> back on the round with the
//      Nassau $ / who-plays-whom sheet open, the new golfers in it.
//   3  a 4-golfer round: KP pool goes straight to the Money step (no Players detour).
// ============================================================================
'use strict';
const path = require('path');
const HERE = path.join(__dirname, '..');
const { openJourney, fileUrl } = require(path.join(HERE, 'tools/lib/journey.js'));
const { wizardSavedRound } = require(path.join(HERE, 'helpers/wizard-saved-round.js'));
const PRE = "window.__hardpanDoors = true; window.__freshPhone = true; window.__e = []; addEventListener('error', function (e) { window.__e.push(String(e.message) + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno); });";
function round(code, names) {
    const r = wizardSavedRound({ code, golfers: names.length, names, hcps: names.map((_, i) => i + 2), ownerUid: 'anon-cold', thru: 0, flights: false,
        overrides: { additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', gameFormat: 'stroke', holeBetStake: 0, matchStake: 0, nassauStake: 0, skinsBuyIn: 0, birdieGameEnabled: false } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    return r;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ST = "JSON.stringify({ url: document.URL.split('/').pop(), step: typeof currentWizardStep !== 'undefined' ? currentWizardStep : null, need: (document.getElementById('fd-need') || {}).innerText || null, pool: !!(document.getElementById('mp-enabled') || {}).checked, side: window.HardPanGps && HardPanGps.side ? HardPanGps.side() : null, hole: window.HardPanGps && HardPanGps.hole ? HardPanGps.hole() : null, sheet: (function(){ var a = document.getElementById('fd-addgame'); return a && a.style.display !== 'none' ? a.innerText.slice(0, 200) : null; })(), e: window.__e || [], ls: localStorage.getItem('hardpan_round_side'), dlg: (window.__DIALOGS || []).map(function (d) { return String(d && (d.message || d.text || d)).slice(0, 160); }) })";
async function state(j) { return JSON.parse(await j.evaluate(ST)); }
async function waitFor(j, test, ms) { const t0 = Date.now(); let s; while (Date.now() - t0 < (ms || 15000)) { try { s = await state(j); if (test(s)) return s; } catch (e) { /* navigating */ } await sleep(400); } return s; }
async function onGpsAt(j, code, hole) {
    await j.goto(fileUrl('index.html', 'game=' + code), 3500);
    await j.evaluate("(function(){ localStorage.setItem('hardpan_gps_whoasked_" + code + "', '1'); goToHole(" + hole + "); var b = document.getElementById('fd-gps-btn'); if (b) b.click(); return 1; })()");
    await sleep(1500);
}
async function addGolfers(j, names) {
    for (const n of names) {
        await j.evaluate('addNewPlayerAndRefresh()');
        await sleep(250);
        const k = await j.evaluate("document.querySelectorAll('#player-list .p-name-input').length");
        await j.setValue('#player-list .p-name-input', n, { index: k - 1 });
    }
}

(async () => {
    const fails = [], report = {};
    const f = (c, m) => { if (!c) fails.push(m); };
    const errs = (s, tag) => (s && s.e || []).filter((m) => !/reading 'ts'/.test(m)).forEach((m) => fails.push(tag + ' error: ' + m));

    // 1: KP pool, one golfer.
    let j = await openJourney({ db: { events: { PF1KP1: round('PF1KP1', ['Me']) }, trips: {}, global_courses: {}, organizers: {}, tournaments: {} }, preScript: PRE, webgl: true });
    try {
        await onGpsAt(j, 'PF1KP1', 5);
        const s0 = await state(j);
        f(s0.side === 'gps' && s0.hole === 5, '1: not on GPS hole 5 to start: ' + JSON.stringify(s0));
        await j.evaluate('HardPanDoors.openAddGame()');
        await sleep(400);
        await j.click('#fd-addgame [data-ag-all="kp"]');
        const s1 = await waitFor(j, (s) => /admin\.html/.test(s.url) && s.need, 15000);
        report.kp = [s1.url, s1.step, s1.need && s1.need.split('\n')[0]];
        f(/admin\.html\?game=PF1KP1&step=players$/.test(s1.url), '1: KP did not open Players first: ' + s1.url);
        f(s1.step === 5, '1: not on the Players step: ' + s1.step);
        f(/Add your golfers first, then we.ll set up KP pool \/ Weekly game\./.test(s1.need || ''), '1: the line: ' + s1.need);
        await addGolfers(j, ['Ben Bravo', 'Cal Cole', 'Dee Dunn']);
        await j.click('#fd-need .fd-need-go');
        const s2 = await waitFor(j, (s) => /step=money/.test(s.url) && s.step === 6, 20000);
        report.kpMoney = [s2.url, s2.step, s2.pool];
        f(/admin\.html\?game=PF1KP1&step=money&pool=1$/.test(s2.url) && s2.step === 6, '1: Players save did not go on to the KP setup: ' + JSON.stringify(s2));
        f(s2.pool, '1: the Weekly Game section is not open');
        const saved = j.db.events && j.db.events.PF1KP1;
        await j.harvest();
        const ps = ((j.db.events.PF1KP1 || {}).players || []).filter((p) => p && p.name).map((p) => p.name);
        report.kpPlayers = ps;
        f(ps.length === 4, '1: the golfers were not saved to the same round: ' + JSON.stringify(ps));
        void saved;
        // A pool that balances, as the golfer types it: 4 x $40 = $160; $60 KPs, $60 net, skins the rest.
        await j.setValue('#mp-kp-amount', '60');
        await j.setValue('#mp-net-amount', '60');
        await j.evaluate('saveSettings()');
        const s3 = await waitFor(j, (s) => /index\.html\?game=PF1KP1$/.test(s.url) && s.hole != null, 20000);
        report.kpBack = [s3.url, s3.ls, s3.hole];
        // Back on the round, the hole it was on, and GPS still the side remembered for it (the
        // headless browser does not auto-land on GPS on ANY reopen - the same on gps-features
        // 0fbe241 - so the remembered side is what is checked; a phone opens on it).
        f(/index\.html\?game=PF1KP1$/.test(s3.url) && s3.ls === 'gps|PF1KP1' && s3.hole === 5, '1: the game save did not come back to the round on GPS, hole 5: ' + JSON.stringify(s3));
        [s0, s1, s2, s3].forEach((s) => errs(s, '1'));
    } finally { await j.close(); }

    // 2: Nassau quick start, one golfer.
    j = await openJourney({ db: { events: { PF1NA1: round('PF1NA1', ['Me']) }, trips: {}, global_courses: {}, organizers: {}, tournaments: {} }, preScript: PRE, webgl: true });
    try {
        await onGpsAt(j, 'PF1NA1', 7);
        await j.evaluate('HardPanDoors.openAddGame()');
        await sleep(400);
        await j.click('#fd-addgame [data-ag-q="nassau"]');
        const s1 = await waitFor(j, (s) => /admin\.html/.test(s.url) && s.need, 15000);
        report.nassau = [s1.url, s1.need && s1.need.split('\n')[0]];
        f(/step=players$/.test(s1.url) && /set up Nassau\./.test(s1.need || ''), '2: Nassau did not open Players first: ' + JSON.stringify(s1));
        await addGolfers(j, ['Ben Bravo']);
        await j.click('#fd-need .fd-need-go');
        const s2 = await waitFor(j, (s) => /index\.html\?game=PF1NA1$/.test(s.url) && s.sheet, 20000);
        report.nassauBack = [s2.url, s2.side, s2.hole, s2.sheet && s2.sheet.replace(/\s+/g, ' ').slice(0, 90)];
        f(s2.sheet && /Nassau/.test(s2.sheet) && /Ben/.test(s2.sheet), '2: back on the round without the Nassau sheet and the new golfer: ' + JSON.stringify(s2));
        f(s2.hole === 7 && s2.ls === 'gps|PF1NA1', '2: not the same hole / side: ' + JSON.stringify([s2.hole, s2.ls]));
        [s1, s2].forEach((s) => errs(s, '2'));
    } finally { await j.close(); }

    // 3: four golfers: straight in.
    j = await openJourney({ db: { events: { PF1FR1: round('PF1FR1', ['Ann Able', 'Ben Bravo', 'Cal Cole', 'Dee Dunn']) }, trips: {}, global_courses: {}, organizers: {}, tournaments: {} }, preScript: PRE, webgl: true });
    try {
        await onGpsAt(j, 'PF1FR1', 3);
        await j.evaluate('HardPanDoors.openAddGame()');
        await sleep(400);
        await j.click('#fd-addgame [data-ag-all="kp"]');
        const s1 = await waitFor(j, (s) => /admin\.html/.test(s.url) && s.step === 6, 20000);
        report.four = [s1.url, s1.step, s1.need, s1.pool];
        f(/step=money&pool=1$/.test(s1.url) && s1.step === 6 && !s1.need, '3: a 4-golfer round did not go straight to the KP setup: ' + JSON.stringify(s1));
        errs(s1, '3');
    } finally { await j.close(); }

    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
