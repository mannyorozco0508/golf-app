// ============================================================================
// URGENT-038 part 2 "Cleanup" - 2.0 POLISH #20 / #23 / #25 / #32, IN REAL CHROME (iPhone 15 size,
// phone GPS mode, simple flow). Stub db only, synthetic 2-golfer rounds ("Test Alpha" / "Test Bravo").
//
//   #20  Round settings › 👥 Golfers opens ON ITS OWN - a full screen above the map and the score
//        sheet, titled Golfers - and its controls are labelled (Flight, Group). The web page's
//        Players sheet is still the old card.
//   #23  The Round Menu footer names Home's row (Join, Trip, History, My stats) and links plain
//        Home - no "Home › More" (Home has no More).
//   #25  The PLAYING WITH coach card shows on the first tee and is gone once the group has a hole
//        on the card; TODAY'S GAMES does not list Stroke Play as a game in a GPS-only round.
//   #32  Round Complete: one main button "View results" + "Done" (no "Skip Review"), and
//        "Both golfers have a complete card." for two. View results reaches the results.
//
// SHOTS=1 saves the screens to ~/Desktop/claude-code-reports/038/cleanup/.
// ============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-round.js'))) { console.log('Consumer tree: no simple-flow round - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const SHOT_DIR = path.join(os.homedir(), 'Desktop', 'claude-code-reports', '038', 'cleanup');
async function shot(j, name) {
    if (!process.env.SHOTS) return;
    try { fs.mkdirSync(SHOT_DIR, { recursive: true }); await j.shot(path.join(SHOT_DIR, name + '.png')); } catch (e) {}
}
const NASSAU = { M1: { format: 'nassau', scoring: 'net', teamAIds: ['101'], teamBIds: ['102'], startHole: 1, createdAt: 1, frontStake: 5, backStake: 5, overallStake: 5, pressRule: 'none' } };
const round = (code, thru, sides) => {
    const r = wizardSavedRound({ code, golfers: 2, ownerUid: 'anon-cold', thru, flights: false, names: ['Test Alpha', 'Test Bravo'],
        overrides: { activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', groupSizeOverrides: { 0: 2 } } });
    delete r.moneyPool; r.additionalGames = {}; r.additionalGameInstances = {}; r.sideMatches = {}; r.gameFormat = 'stroke';
    if (!thru) r.scores = {};
    if (sides) r.sideMatches = JSON.parse(JSON.stringify(sides));
    return r;
};
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,devPro:true});}});})();";
const GEO = "(function(){ try { Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:function(ok){ var f=function(){ok({coords:{latitude:33.4528,longitude:-79.1547,accuracy:5},timestamp:Date.now()});}; setTimeout(f,50); var t=setInterval(f,1000); return t;}, getCurrentPosition:function(ok){ok({coords:{latitude:33.4528,longitude:-79.1547,accuracy:5},timestamp:Date.now()});}, clearWatch:function(t){clearInterval(t);}}}); } catch(e){} })();";
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function start(code, thru, opt) {
    const side = (opt && opt.side) || 'gps';
    const pre = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO
        + "try{localStorage.setItem('golfapp_me_" + code + "','101');sessionStorage.setItem('groupPickDismissed:" + code + "','1');"
        + "localStorage.setItem('hardpan_round_side','" + side + "|" + code + "');}catch(e){}";
    const j = await openJourney({ db: { events: { [code]: round(code, thru, opt && opt.sides) }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} },
        viewport: { width: 393, height: 852 }, webgl: true, preScript: pre });
    await j.goto(fileUrl('index.html', 'game=' + code + '&group=1&me=101'), 300);
    const ev = (x) => j.evaluate(x);
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) { if (await ev("!!(window.HardPanGps && HardPanGps.side && typeof currentData !== 'undefined' && currentData && currentData.players)")) break; await sleep(250); }
    await sleep(1200);
    const click = async (sel) => { assert.ok(await ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.click(); return true;})()'), 'no ' + sel); await sleep(400); };
    return { j, ev, click };
}

test('#20: Round settings › Golfers opens on its own, controls labelled Flight and Group', { timeout: 90000 }, async () => {
    const { j, ev, click } = await start('PC0020', 3, { side: 'bets' });
    try {
        await ev('HardPanRound.openSettings()');
        const t0 = Date.now();
        while (Date.now() - t0 < 6000 && !(await ev("!!document.querySelector('#hp-quick [data-hq=\"players\"]')"))) await sleep(200);
        await click('#hp-quick [data-hq="players"]');
        const s = JSON.parse(await ev("JSON.stringify((function(){ var el=document.getElementById('players-sheet'), c=el.querySelector('.ps-content').getBoundingClientRect(), hd=el.querySelector('.ps-head');"
            + " return { shown: el.style.display, own: el.classList.contains('ps-own'), z: Number(getComputedStyle(el).zIndex), gpsZ: Number(getComputedStyle(document.getElementById('gps-overlay')||document.body).zIndex)||0,"
            + " top: Math.round(c.top), left: Math.round(c.left), w: Math.round(c.width), h: Math.round(c.height), vw: innerWidth, vh: innerHeight, bg: getComputedStyle(el).backgroundColor,"
            + " title: document.getElementById('players-sheet-title').textContent, head: hd ? hd.innerText.replace(/\\s+/g,' ').trim() : '',"
            + " flightLabel: (el.querySelector('.ps-row .ps-flight')||{}).getAttribute ? el.querySelector('.ps-row .ps-flight').getAttribute('aria-label') : null,"
            + " rows: el.querySelectorAll('.ps-row').length, settings: document.getElementById('round-sheet').classList.contains('open') }; })())"));
        assert.equal(s.shown, 'flex', 'Golfers is open');
        assert.equal(s.own, true, 'its own screen in the app: ' + JSON.stringify(s));
        assert.ok(s.z > s.gpsZ, 'above the map and the score sheet: ' + JSON.stringify(s));
        assert.deepEqual([s.top, s.left, s.w, s.h], [0, 0, s.vw, s.vh], 'the whole screen, not a card on a sheet: ' + JSON.stringify(s));
        assert.ok(!/rgba\(0, 0, 0, 0\.6\)/.test(s.bg), 'a solid page, not a dim scrim: ' + s.bg);
        assert.match(s.title, /Golfers/);
        assert.match(s.head, /FLIGHT/i);
        assert.match(s.head, /GROUP/i);
        assert.equal(s.flightLabel, 'Flight');
        assert.equal(s.rows, 2);
        assert.equal(s.settings, false, 'Round settings closed behind it');
        await shot(j, '20-golfers-after');
        // Cancel goes back; Save still works through the sheet's own builder (unchanged).
        await ev('closePlayersSheet()');
        assert.equal(await ev("document.getElementById('players-sheet').style.display"), 'none');
    } finally { await j.close(); }
});

test('#20: the web page (no app) keeps the Players card, with the labels', { timeout: 90000 }, async () => {
    const { j, ev } = await start('PC0021', 3, { side: 'bets' });
    try {
        await ev("localStorage.setItem('hardpan_simple_flow','off'); 1");
        await ev('openPlayersSheet()');
        await sleep(300);
        const s = JSON.parse(await ev("JSON.stringify({ own: document.getElementById('players-sheet').classList.contains('ps-own'), title: document.getElementById('players-sheet-title').textContent, head: document.querySelector('#players-sheet .ps-head').innerText })"));
        assert.equal(s.own, false);
        assert.match(s.title, /Players/);
        assert.match(s.head, /FLIGHT/i);
    } finally { await j.close(); }
});

test('#23: the Round Menu footer says Home, links plain Home', { timeout: 90000 }, async () => {
    const { j, ev } = await start('PC0023', 3);
    try {
        await ev('HardPanRound.openMenu()');
        await sleep(500);
        const f = JSON.parse(await ev("JSON.stringify((function(){ var a=document.querySelector('#hp-sheet [data-hs-home]'); var all=document.getElementById('hp-sheet').innerText; return { text: a ? a.textContent : null, href: a ? a.getAttribute('href') : null, note: a ? a.parentNode.innerText : '', more: /Home\\s*›\\s*More/.test(all) }; })())"));
        assert.equal(f.text, 'Home');
        assert.equal(f.href, 'home.html');
        assert.match(f.note, /Join, Trip, History and My stats/);
        assert.equal(f.more, false, 'no "Home › More"');
        await ev("(function(){ var s=document.querySelector('#hp-sheet .hs-panel, #hp-sheet [class*=panel]') || document.getElementById('hp-sheet'); s.scrollTop = 9999; var a=document.querySelector('#hp-sheet [data-hs-home]'); if (a && a.scrollIntoView) a.scrollIntoView({block:'end'}); return 1; })()");
        await sleep(300);
        await shot(j, '23-menu-footer-after');
    } finally { await j.close(); }
});

const LANDING = "JSON.stringify((function(){ var b=document.getElementById('round-landing-summary'); var tg=document.getElementById('todays-games-mount'); return { landing: b ? getComputedStyle(b).display : 'gone', games: tg ? tg.innerText : '' }; })())";
test('#25: the coach card shows on the first tee, and is gone once a hole is on the card', { timeout: 90000 }, async () => {
    const a = await start('PC0025', 0, { side: 'bets' });
    try {
        const s = JSON.parse(await a.ev(LANDING));
        assert.notEqual(s.landing, 'none', 'first tee: the coach card is there');
        assert.ok(!/Stroke Play/.test(s.games), 'no Stroke Play under TODAY\'S GAMES: ' + s.games);
        // A hole on the card for both: gone.
        await a.ev("currentData.scores = { p101_h1: 4, p102_h1: 5 }; renderLandingSummary(window.__scFilteredPlayers || currentData.players, currentData.players); 1");
        assert.equal(JSON.parse(await a.ev(LANDING)).landing, 'none', 'after hole 1: gone');
        // One golfer only on hole 1: still the first hole.
        assert.equal(await a.ev("landingPastFirstHole(currentData.players, { scores: { p101_h1: 4 } })"), false);
        assert.equal(await a.ev("landingPastFirstHole(currentData.players, { scores: { p101_h10: 4, p102_h10: 4 } })"), true, 'a shotgun group\'s first hole counts');
        assert.equal(await a.ev("landingPastFirstHole(currentData.players, { scores: {} })"), false);
    } finally { await a.j.close(); }
    // Manny's shot: a finished GPS round with a Nassau side bet.
    const b = await start('PC0026', 18, { side: 'bets', sides: NASSAU });
    try {
        const s = JSON.parse(await b.ev(LANDING));
        assert.equal(s.landing, 'none', 'a finished round: no PLAYING WITH card');
        assert.match(s.games, /1 side match/, 'the side bet is still listed: ' + s.games);
        assert.ok(!/Stroke Play/.test(s.games), 'no Stroke Play under TODAY\'S GAMES: ' + s.games);
        await b.ev("(function(){ var m=document.getElementById('todays-games-mount'); if (m && m.scrollIntoView) m.scrollIntoView({block:'center'}); return 1; })()");
        await sleep(300);
        await shot(b.j, '25-card-sheet-after');
    } finally { await b.j.close(); }
});

test('#32: Round Complete - one main button "View results" + Done, "Both golfers"', { timeout: 90000 }, async () => {
    const { j, ev, click } = await start('PC0032', 18, { side: 'bets' });
    try {
        await ev('openFinishRoundModal()');
        await sleep(600);
        const s = JSON.parse(await ev("JSON.stringify((function(){ var ov=document.getElementById('finish-round-modal-overlay'); var vis=function(e){ return !!e && e.offsetParent !== null && getComputedStyle(e).display !== 'none'; };"
            + " var btns=Array.prototype.filter.call(ov.querySelectorAll('button'), vis).map(function(b){return b.textContent.trim();});"
            + " return { open: ov.style.display, note: document.getElementById('fr-review-note').textContent, btns: btns, skip: vis(document.getElementById('fr-skip-btn')) }; })())"));
        assert.equal(s.open, 'flex');
        assert.equal(s.note, 'Both golfers have a complete card.');
        assert.equal(s.skip, false, 'no Skip Review');
        const exits = s.btns.filter((t) => /results|done/i.test(t));
        assert.deepEqual(exits, ['View results', 'Done'], 'one main button + Done: ' + JSON.stringify(s.btns));
        await shot(j, '32-round-complete-after');
        await click('#fr-confirm-btn');
        await sleep(500);
        assert.equal(await ev("document.getElementById('fr-state-results').style.display !== 'none'"), true, 'View results shows the results');
    } finally { await j.close(); }
});
