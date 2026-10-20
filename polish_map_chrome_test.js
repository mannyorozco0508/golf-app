// ============================================================================
// 2.0 POLISH - THE MAP ITEMS (#8, #12, #13, #14, #15, #17, #18, #19, #22), IN REAL CHROME,
// iPhone 15 size (393x852) with the iPhone's safe areas (59 top / 34 bottom), and 375x667 for
// the layout items. Stub db only, synthetic rounds, the app's bundled OSM greens (Caledonia).
//   #8   the map's ▤ Card opens the 18-hole grid (Full Card); the "Final results are in" pop-up
//        never opens by itself in a map round (it is Finish's) - Enter score is the hole view again.
//   #12  Round settings' "Full setup ›" stays inside the sheet (wrapped).
//   #13  a solid band under the status bar: the card sheet, Course & Tees, the Game Day wizard
//        (which opens at the top).
//   #14  the card's last line clears the bottom bar.
//   #15  the grab handle is the card sheet's own header row, never over its content.
//   #17  F / C / B never sit on top of each other (the pins only - no new labels).
//   #18  the wind reads "7 mph · gusts 17".
//   #19  the toast on the map is clear of the Plays-like pill.
//   #22  the Round Menu title wraps and drops a "(Name)" that repeats the course name.
// Shots: ~/Desktop/claude-code-reports/029/fixed/<item>-after.png (when that folder exists).
// ============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-round.js'))) { console.log('Consumer tree: no simple-flow round - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const SHOTS = path.join(os.homedir(), 'Desktop/claude-code-reports/029/fixed');
const shot = async (j, name) => { if (fs.existsSync(SHOTS)) { try { await j.shot(path.join(SHOTS, name)); } catch (e) {} } };
const TOP = 59, BOTTOM = 34;

const round = (code, thru, name) => {
    const r = wizardSavedRound({ code, golfers: 2, ownerUid: 'anon-cold', thru, flights: false, names: ['Test Alpha', 'Test Bravo'],
        overrides: { activeCourseKey: 'caledonia', courseName: name || 'Caledonia Golf & Fish Club (Caledonia)', groupSizeOverrides: { 0: 2 } } });
    delete r.moneyPool; r.additionalGames = {}; r.additionalGameInstances = {}; r.sideMatches = {};
    if (!thru) r.scores = {};
    return r;
};
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,devPro:true});}});})();";
const GEO = "(function(){ try { Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:function(ok){ var f=function(){ok({coords:{latitude:33.4528,longitude:-79.1547,accuracy:5},timestamp:Date.now()});}; setTimeout(f,50); var t=setInterval(f,1000); return t;}, getCurrentPosition:function(ok){ok({coords:{latitude:33.4528,longitude:-79.1547,accuracy:5},timestamp:Date.now()});}, clearWatch:function(t){clearInterval(t);}}}); } catch(e){} })();";
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) {} } });
async function until(j, expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 10000)) { try { if (await j.evaluate(expr)) return true; } catch (e) {} await sleep(200); } return false; }
async function insets(j) { try { await j.cdp('Emulation.setSafeAreaInsetsOverride', { insets: { top: TOP, topMax: TOP, bottom: BOTTOM, bottomMax: BOTTOM, left: 0, leftMax: 0, right: 0, rightMax: 0 } }); return true; } catch (e) { return false; } }
const R = (sel) => "(function(){var e=document.querySelector(" + JSON.stringify(sel) + "); if(!e) return null; var r=e.getBoundingClientRect(); return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height};})()";
const rect = async (j, sel) => JSON.parse(await j.evaluate('JSON.stringify(' + R(sel) + ')'));

async function startRound(code, thru, opts) {
    const o = opts || {};
    const pre = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO
        + "try{localStorage.setItem('golfapp_me_" + code + "','101');sessionStorage.setItem('groupPickDismissed:" + code + "','1');"
        + "localStorage.setItem('hardpan_round_side','gps|" + code + "');}catch(e){}";
    const j = await openJourney({ db: { events: { [code]: round(code, thru, o.name) }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} }, viewport: { width: 393, height: 852 }, webgl: true, preScript: pre });
    journeys.push(j);
    const safe = await insets(j);
    await j.goto(fileUrl('index.html', 'game=' + code + '&group=1&me=101'), 300);
    assert.ok(await until(j, "!!window.HardPanGps && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-pin-mid')", 30000), 'the map with its pins');
    await sleep(1500);
    return { j, safe };
}

test('#17 F / C / B: zoomed out until the green is a dot, the three pins sit apart - F never under C; still just the letters', { timeout: 120000 }, async () => {
    const { j } = await startRound('PMAP17', 0);
    // A pinch out, as the golfer does it: the wheel over the map, several notches.
    // A pinch out over the green, as the golfer does it: the wheel on C, notch by notch, until the
    // three would crowd (the pins report a spread), at most 8 notches.
    for (let i = 0; i < 8; i++) {
        const c = JSON.parse(await j.evaluate("JSON.stringify(" + "(function(){var r=document.querySelector('#gps-overlay .gps-pin-mid').getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)};})()" + ")"));
        await j.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: Math.min(Math.max(c.x, 40), 350), y: Math.min(Math.max(c.y, 200), 700), deltaX: 0, deltaY: 300 });
        await sleep(700);
        if (await j.evaluate("!!document.querySelector('#gps-overlay .gps-pin[data-spread=\"1\"]')")) break;
    }
    await sleep(800);
    assert.ok(await j.evaluate("!!document.querySelector('#gps-overlay .gps-pin[data-spread=\"1\"]')"), 'zoomed out far enough that F / C / B would crowd');
    const pins = JSON.parse(await j.evaluate("JSON.stringify(['front','mid','back'].map(function(k){ var e=document.querySelector('#gps-overlay .gps-pin-'+k+':not(.gps-pin-draft)'); if(!e) return null; var r=e.getBoundingClientRect(); return { k:k, x:r.left+r.width/2, y:r.top+r.height/2, t:e.textContent }; }))"));
    assert.ok(pins.every(Boolean), 'F, C and B are drawn: ' + JSON.stringify(pins));
    assert.deepEqual(pins.map((p) => p.t), ['F', 'C', 'B'], 'the pins carry their letter only (URGENT-025)');
    for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
        const d = Math.hypot(pins[a].x - pins[b].x, pins[a].y - pins[b].y);
        assert.ok(d >= 19.5, pins[a].k + ' and ' + pins[b].k + ' are ' + d.toFixed(1) + ' px apart: ' + JSON.stringify(pins));
    }
    await shot(j, '17-after.png');
    // The pure rule: two pins on one point are pushed apart; pins already clear are left alone.
    const pure = JSON.parse(await j.evaluate("JSON.stringify([HardPanGps.pinSpread({ front:[100,100], mid:[100,100], back:[100,100] }), HardPanGps.pinSpread({ front:[100,160], mid:[100,100], back:[100,40] }), HardPanGps.pinSpread({ front:[100,105], mid:[100,100], back:[100,96] })])"));
    assert.deepEqual(pure[0], { front: [0, 22], mid: [0, 0], back: [0, -22] }, 'stacked: F down, B up');
    assert.deepEqual(pure[1], { front: [0, 0], mid: [0, 0], back: [0, 0] }, 'clear: nothing moves');
    assert.deepEqual(pure[2], { front: [0, 17], mid: [0, 0], back: [0, -18] }, 'close: along their own line, to 22 px');
});

test('#19 the toast on the map sits under the top bar, clear of the Plays-like pill; #18 the wind words', { timeout: 120000 }, async () => {
    const { j } = await startRound('PMAP19', 0);
    await j.evaluate("uiToast('Bet added: Test A vs Test B \\u00b7 $5 Nassau')");
    await sleep(500);
    const t = await rect(j, '.ui-toast-wrap .ui-toast') || await rect(j, '.ui-toast-wrap');
    const pill = await rect(j, '#gps-overlay .gps-ld-plays');
    const head = await rect(j, '#gps-overlay .gps-ld-top');
    assert.ok(t && t.h > 0, 'the toast shows');
    if (pill && pill.h > 0) assert.ok(t.b <= pill.t || t.t >= pill.b, 'the toast clears the Plays-like pill: ' + JSON.stringify({ t, pill }));
    if (head && head.h > 0) assert.ok(t.t >= head.b, 'and the top bar: ' + JSON.stringify({ t, head }));
    await shot(j, '19-after.png');
    // #18: the words the wind box writes (gps-view.js syncWind), the same expression.
    const src = fs.readFileSync(path.join(__dirname, 'gps-view.js'), 'utf8');
    const m = /txt\('\.gps-wind-mph', w\.mph === 0 \? 'Calm' : (.+?)\);\n/.exec(src);
    assert.ok(m, 'the wind line');
    // eslint-disable-next-line no-new-func
    const say = new Function('w', 'return ' + m[1] + ';');
    assert.equal(say({ mph: 7, gustMph: 17 }), '7 mph · gusts 17');
    assert.equal(say({ mph: 7 }), '7 mph');
});

test('#8 Card is the 18-hole grid - the last score posts on the map, Card opens the grid, no results pop-up; Enter score is the hole again', { timeout: 150000 }, async () => {
    const { j } = await startRound('PMAP08', 17);
    // The 18th scores post while the map is up (the pop-up used to open behind it).
    await j.evaluate("HardPanGps.setHole ? 0 : 0");
    await j.evaluate("(function(){ (currentData.players||[]).forEach(function(p){ saveScore(p.id, 18, 4); }); return 1; })()");
    await sleep(1500);
    assert.equal(await j.evaluate("HardPanGps.side()"), 'gps', 'still on the map');
    await j.evaluate("document.querySelector('#gps-overlay .gps-side-bets').click()");
    await sleep(900);
    const s = JSON.parse(await j.evaluate("JSON.stringify({ side: HardPanGps.side(), mode: currentViewMode, full: getComputedStyle(document.getElementById('full-card-container')).display, hole: getComputedStyle(document.getElementById('hole-view-container')).display, pop: (document.getElementById('card-in-popup')||{style:{}}).style.display, sheet: document.body.classList.contains('hp-card-sheet'), cap: document.querySelector('#gps-overlay .gps-side-bets .gps-cap').textContent })"));
    assert.equal(s.cap, 'Card');
    assert.equal(s.side, 'bets', 'the card is up');
    assert.equal(s.mode, 'full', 'the Full Card');
    assert.equal(s.full, 'block', 'the 18-hole grid shows');
    assert.equal(s.hole, 'none', 'not the one-hole sheet');
    assert.notEqual(s.pop, 'flex', 'no "Final results are in" pop-up');
    const cells = await j.evaluate("document.querySelectorAll('#full-card-container .score-input').length");
    assert.ok(cells >= 36, 'hole by hole for both golfers: ' + cells);
    await shot(j, '08-after.png');
    // The Round Menu's Card tile: the same grid.
    await j.evaluate("HardPanGps.showSide('gps')"); await sleep(400);
    await j.evaluate("setViewMode('hole')"); await j.evaluate("HardPanGps.showSide('gps')"); await sleep(300);
    await j.evaluate("HardPanRound.openMenu()"); await sleep(400);
    await j.evaluate("document.querySelector('#hp-sheet [data-hs-tile=card]').click()"); await sleep(700);
    assert.equal(await j.evaluate('currentViewMode'), 'full', 'the menu Card tile is the grid too');
    // Enter score (the card's bar): the hole view, a box for this hole.
    await j.evaluate('HardPanRound.enterScore()'); await sleep(500);
    assert.equal(await j.evaluate('currentViewMode'), 'hole', 'Enter score is the hole view');
    // Finish still opens the pop-up (it is Finish's).
    await j.evaluate('openCardInPopup()'); await sleep(300);
    assert.equal(await j.evaluate("document.getElementById('card-in-popup').style.display"), 'flex', 'Finish opens it');
    await j.evaluate('closeCardInPopup()');
});

test('#13 #14 #15 the card sheet: a solid band under the status bar, the handle in its own row, the last line above the bottom bar', { timeout: 150000 }, async () => {
    const { j, safe } = await startRound('PMAP13', 3);
    await j.evaluate("HardPanGps.showSide('bets')");
    assert.ok(await until(j, "document.body.classList.contains('hp-card-sheet') && document.body.classList.contains('hp-sf-card')", 8000), 'the card sheet over the map');
    await sleep(800);
    await shot(j, '15-after-top.png');
    // #15: the handle is the sheet's first row (it scrolls with it), the strip's own is gone.
    const grab = JSON.parse(await j.evaluate("JSON.stringify({ before: getComputedStyle(document.getElementById('main-content'), '::before').width, strip: getComputedStyle(document.getElementById('hp-strip-grab')).display })"));
    assert.equal(grab.before, '44px', 'the handle row in the sheet');
    assert.equal(grab.strip, 'none', 'no fixed handle over the content');
    // #13: the band (the inset's height, solid).
    const band = JSON.parse(await j.evaluate("JSON.stringify({ h: getComputedStyle(document.getElementById('hp-strip'), '::before').height, bg: getComputedStyle(document.getElementById('hp-strip'), '::before').backgroundColor })"));
    if (safe) assert.equal(band.h, TOP + 'px', 'the band is the safe area: ' + JSON.stringify(band));
    assert.equal(band.bg, 'rgb(11, 15, 12)', 'solid');
    // #14: scrolled to the end, the card's last line is above the bar.
    await j.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)'); await sleep(600);
    const last = JSON.parse(await j.evaluate("(function(){ var mc=document.getElementById('main-content'), kids=[].slice.call(mc.querySelectorAll('*')).filter(function(e){ var r=e.getBoundingClientRect(); return r.height>0 && r.width>0 && getComputedStyle(e).visibility!=='hidden' && !e.closest('#round-sheet'); }); var b=Math.max.apply(null, kids.map(function(e){ return e.getBoundingClientRect().bottom; })); var bar=document.getElementById('hp-card-bet').getBoundingClientRect(); return JSON.stringify({ last: b, bar: bar.top }); })()"));
    assert.ok(last.last <= last.bar + 1, 'the card ends above the bar: ' + JSON.stringify(last));
    await shot(j, '14-after.png');
    await j.evaluate('window.scrollTo(0, 400)'); await sleep(400);
    await shot(j, '13-card-after.png');
    await shot(j, '15-after.png');
});

test('#22 the Round Menu title: the whole name, wrapped, no repeated "(Caledonia)"; #12 "Full setup ›" inside the sheet (393 and 375 wide)', { timeout: 150000 }, async () => {
    const { j } = await startRound('PMAP22', 0, 'Caledonia Golf & Fish Club (Caledonia)');
    for (const [w, h] of [[393, 852], [375, 667]]) {
        await j.cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 3, mobile: true }); await sleep(500);
        await j.evaluate('HardPanRound.openMenu()'); await sleep(500);
        const t = JSON.parse(await j.evaluate("(function(){ var e=document.querySelector('#hp-sheet .hs-course'); return JSON.stringify({ text: e.textContent, sw: e.scrollWidth, cw: e.clientWidth, ws: getComputedStyle(e).whiteSpace }); })()"));
        assert.equal(t.text, 'Caledonia Golf & Fish Club', 'the repeat is dropped');
        assert.ok(t.sw <= t.cw + 1 && t.ws !== 'nowrap', 'never cut off: ' + JSON.stringify(t));
        await shot(j, '22-after-' + w + '.png');
        await j.evaluate('HardPanRound.closeSheet(true)'); await sleep(300);
        await j.evaluate('HardPanRound.openSettings()'); await sleep(900);
        const f = JSON.parse(await j.evaluate("(function(){ var a=document.querySelector('#round-sheet-body a[data-hp-full=\"1\"]'), b=document.getElementById('round-sheet-body'); if(!a) return 'null'; a.scrollIntoView({block:'center'}); var r=a.getBoundingClientRect(), s=b.getBoundingClientRect(); return JSON.stringify({ r: r.right, l: r.left, sr: s.right, sl: s.left, vw: innerWidth, text: a.textContent }); })()"));
        assert.ok(f, 'Full setup is there');
        assert.ok(f.r <= f.sr + 0.5 && f.r <= f.vw && f.l >= f.sl - 0.5, 'inside the sheet at ' + w + ': ' + JSON.stringify(f));
        await sleep(300);
        await shot(j, '12-after-' + w + '.png');
        await j.evaluate("typeof toggleRoundSheet === 'function' && toggleRoundSheet(false)"); await sleep(300);
    }
    // The rule: only a suffix that repeats the name goes.
    const tidy = JSON.parse(await j.evaluate("JSON.stringify(['Papago Golf Club (Papago)', 'Aguila Golf Club (Championship)', 'Talking Stick Golf Club (South - Piipaash)', 'Papago Golf Club'].map(HardPanRound.tidyCourse))"));
    assert.deepEqual(tidy, ['Papago Golf Club', 'Aguila Golf Club (Championship)', 'Talking Stick Golf Club (South - Piipaash)', 'Papago Golf Club']);
});

test('#13 the Game Day wizard opens at the top, its step dots below the status bar band', { timeout: 120000 }, async () => {
    const code = 'PMAPGD';
    // A new code, nothing written yet - where Game Day (createRoom) lands.
    const j = await openJourney({ db: { events: {}, global_courses: {}, trips: {}, organizers: {}, tournaments: {} }, viewport: { width: 393, height: 852 }, preScript: 'window.__hardpanDoors = true;' });
    journeys.push(j);
    const safe = await insets(j);
    await j.goto(fileUrl('admin.html', 'game=' + code + '&eventType=quick'), 3500);
    await sleep(1200);
    const s = JSON.parse(await j.evaluate("JSON.stringify({ y: window.scrollY, dots: document.getElementById('wizard-progress').getBoundingClientRect().top, band: getComputedStyle(document.body, '::before').height, step: typeof currentWizardStep !== 'undefined' ? currentWizardStep : null })"));
    if (safe) assert.equal(s.band, TOP + 'px', 'the band: ' + JSON.stringify(s));
    assert.equal(s.y, 0, 'the wizard opens at the top: ' + JSON.stringify(s));
    assert.ok(s.dots >= (safe ? TOP : 0), 'the step dots are below the status bar: ' + JSON.stringify(s));
    await shot(j, '13-gameday-after.png');
    // Moving between steps scrolls the dots in BELOW the band (scroll-margin), not under it.
    await j.evaluate('window.scrollTo(0, 600)');
    await j.evaluate('goToWizardStep(currentWizardStep)'); await sleep(1200);
    const d2 = await j.evaluate("document.getElementById('wizard-progress').getBoundingClientRect().top");
    assert.ok(d2 >= (safe ? TOP : 0) - 1, 'step dots after a step change: ' + d2);
});

test('#13 #22 Course & Tees: a solid band under the status bar; the picked course without a repeated "(Papago)"', { timeout: 150000 }, async () => {
    const PAP = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
    const TEE = (name, y, r, sl) => ({ name, rating: r, slope: sl, parTotal: 72, totalYards: y, holes: PAP.map((h) => ({ par: h.par, yardage: Math.round(y / 18) })) });
    const PAPAGO = { name: 'Papago Golf Club (Papago)', data: PAP, tees: { male: [TEE('Back', 7068, 73.3, 132), TEE('Middle', 6500, 70.9, 125), TEE('Forward', 5900, 68.0, 117)] },
        location: { city: 'Phoenix', state: 'AZ', latitude: 33.4560, longitude: -111.9480 } };
    const HERE = { latitude: 33.4560, longitude: -111.9480, accuracy: 10 };
    const geo = "try{ navigator.geolocation.getCurrentPosition = function (ok) { setTimeout(function(){ ok({ coords: " + JSON.stringify(HERE) + " }); }, 50); }; }catch(e){}";
    const j = await openJourney({ db: { events: {}, global_courses: { az_papago: PAPAGO }, trips: {}, organizers: {}, tournaments: {} }, viewport: { width: 393, height: 852 }, webgl: true,
        preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + geo });
    journeys.push(j);
    try { await j.cdp('Browser.grantPermissions', { permissions: ['geolocation'] }); await j.cdp('Emulation.setGeolocationOverride', HERE); } catch (e) {}
    const safe = await insets(j);
    await j.goto(fileUrl('home.html', ''), 2500);
    await j.evaluate("document.querySelector('[data-hp-act=\"sgpsdoor\"]').click()");
    assert.ok(await until(j, "/admin\\.html/.test(location.pathname) && !!document.getElementById('sf')", 30000), 'Course & Tees');
    if (!(await until(j, "document.getElementById('course-select') && document.getElementById('course-select').value === 'az_papago'", 6000))) await j.evaluate("(function(){var b=document.querySelector('#sf [data-sf-course=\"az_papago\"]'); if(b) b.click(); return 1;})()");
    assert.ok(await until(j, "!!document.querySelector('#sf #sf-course') && !!document.querySelector('#sf [data-sf-tee]')", 15000), 'Papago picked, its tees');
    const name = await j.evaluate("document.querySelector('#sf #sf-course .n').textContent");
    assert.equal(name, 'Papago Golf Club', 'no repeated "(Papago)"');
    const band = JSON.parse(await j.evaluate("JSON.stringify({ h: getComputedStyle(document.getElementById('sf'), '::before').height, bg: getComputedStyle(document.getElementById('sf'), '::before').backgroundColor, pos: getComputedStyle(document.getElementById('sf'), '::before').position })"));
    if (safe) assert.equal(band.h, TOP + 'px', JSON.stringify(band));
    assert.equal(band.pos, 'fixed');
    assert.equal(band.bg, 'rgb(242, 244, 239)', 'solid, the page colour');
    await j.evaluate("document.getElementById('sf').scrollTop = 260"); await sleep(400);
    await shot(j, '13-coursetees-after.png');
});
