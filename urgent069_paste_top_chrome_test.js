// ============================================================================
// 069 B - "PASTE A LIST" AT THE TOP OF PLAYERS. Real Chrome, 393x852, the app's doors.
//
// Manny, Oct 25: "Paste a list box: move it to the top of Players." The Games & Bets Players step had
// its "📋 Paste Player List" control below every golfer row. It is now the first control of the step,
// under the step's subtitle - the same button, the same box, the same commit. Nothing removed.
//
//   1  Games & Bets > Same as last week > Players: Paste Player List is the first control, above the
//      golfer list, Add New Player and the rest; nothing that was on the step is gone
//   2  Games & Bets > Game Day > a new round > Players: the same, at the top
//   3  the box from the top, 4, 8 and 20 names: each name a golfer, the golfers already there kept
//   4  068's list pasted into a Name box still becomes golfers (the top box moved nothing there)
//   5  simple flow's Players: "Paste a list" is already its first control (no change), 8 names pasted
// Stub db only, "Test" golfers only.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'simple-flow.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');

const CD = makeCourseData(18);
const HAVE = ['Test Marty', 'Test Manny', 'Test Paul', 'Test Glenn'];
const MON = wizardSavedRound({ code: 'MONTST', golfers: 4, names: HAVE, ownerUid: 'anon-cold', thru: 18, courseData: CD,
    overrides: { activeCourseKey: 'comm_links', courseName: 'Talking Stick Golf Club' } });
const DB = () => ({ events: { MONTST: MON }, global_courses: { comm_links: { name: 'Talking Stick Golf Club', data: CD } }, trips: {}, organizers: {}, tournaments: {} });
const golfers = (n) => Array.from({ length: n }, (_, i) => ({ name: 'Test P' + String(i + 1).padStart(2, '0'), hcp: String((i * 5) % 21) }));
const asLines = (gs) => gs.map((g) => g.name + ' ' + g.hcp).join('\n');
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const ROWS = "JSON.stringify(Array.from(document.querySelectorAll('#player-list .player-row')).map(function (r) { return [r.querySelector('.p-name-input').value, r.querySelector('.p-hcp-input').value]; }))";
// The Players step's controls, in page order, and where the paste control sits.
const LAYOUT = "JSON.stringify((function(){ var st = document.getElementById('wizard-step-5'); var b = st.querySelector('button[onclick=\"openPastePlayersModal()\"]');"
    + " var all = Array.from(st.querySelectorAll('button, #player-list, h3')).filter(function (e) { return !e.closest('.modal-overlay') && !e.closest('#sp-round-modal') && !e.closest('#player-list .player-row') && !e.closest('#flights-block'); });"
    + " var r = b.getBoundingClientRect(), pl = document.getElementById('player-list').getBoundingClientRect();"
    + " return { active: st.classList.contains('active'), first: all[0] === b, prevIsSub: !!(b.previousElementSibling && b.previousElementSibling.classList.contains('wizard-step-sub')),"
    + "  aboveList: r.bottom <= pl.top, text: b.innerText.trim(), shown: r.height > 0, count: st.querySelectorAll('button[onclick=\"openPastePlayersModal()\"]').length,"
    + "  order: all.map(function (e) { return e.id ? '#' + e.id : (e.innerText || '').trim().split('\\n')[0].slice(0, 30); }) }; })())";
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) {} } });

async function sameAsLastWeek() {
    const j = await openJourney({ db: DB(), viewport: { width: 393, height: 852 },
        preScript: "window.__hardpanDoors = true; try { localStorage.setItem('lastRoomCode','MONTST'); } catch (e) {}" + iapStub({ active: true }) });
    journeys.push(j);
    await j.goto(fileUrl('admin.html', 'start=lobby'), 2500);
    await j.tap('#gl-same');
    await j.tap('#ui-sheet-yes');
    for (let i = 0; i < 40; i++) { if (await j.evaluate("/step=players/.test(location.search) && document.querySelectorAll('#player-list .player-row').length === 4")) break; await sleep(250); }
    await sleep(500);
    return j;
}
async function pasteFromTop(j, text) {
    assert.ok(await j.tap('#wizard-step-5 [data-hp-paste-top]'), 'the top Paste Player List is on screen and tappable');
    await sleep(400);
    assert.equal(await j.evaluate("document.activeElement && document.activeElement.id"), 'paste-players-textarea', 'the same Paste Player List box opened');
    await j.cdp('Input.insertText', { text });
    await sleep(300);
    await j.tap('#paste-players-commit-btn');
    await sleep(700);
}

test('Same as last week > Players: Paste Player List is the first control, above the golfers; nothing gone', { timeout: 120000 }, async () => {
    const j = await sameAsLastWeek();
    const L = JSON.parse(await j.evaluate(LAYOUT));
    assert.equal(L.active, true, 'on Players');
    assert.equal(L.first, true, 'the first control of the step: ' + JSON.stringify(L.order));
    assert.equal(L.prevIsSub, true, 'right under the step subtitle');
    assert.equal(L.aboveList, true, 'above the golfer rows');
    assert.equal(L.text, '📋 Paste Player List');
    assert.equal(L.count, 1, 'one Paste Player List - moved, not copied');
    for (const want of ['#player-list', '➕ Add New Player', '#sp-round-btn', '#my-groups-btn', '🧮 Preview Handicap Strokes', '#wizard-back-5', '#wizard-next-5'])
        assert.ok(L.order.includes(want), want + ' is still on the step: ' + JSON.stringify(L.order));
    assert.ok(L.order.indexOf('#player-list') < L.order.indexOf('➕ Add New Player'), 'the rest keeps its order');
});

test('Game Day > a new round > Players: Paste Player List at the top too', { timeout: 120000 }, async () => {
    const j = await openJourney({ db: DB(), viewport: { width: 393, height: 852 }, preScript: "window.__hardpanDoors = true;" + iapStub({ active: true }) });
    journeys.push(j);
    await j.goto(fileUrl('admin.html', 'start=lobby'), 2500);
    await j.tap('#gl-gameday');
    await j.tap('#ui-sheet-yes');
    for (let i = 0; i < 60; i++) { if (await j.evaluate("/game=/.test(location.search) && document.querySelectorAll('.wizard-step').length > 0 && typeof goToWizardStep === 'function'")) break; await sleep(250); }
    await sleep(1500);
    await j.evaluate("goToWizardStep(5)");
    await sleep(600);
    const L = JSON.parse(await j.evaluate(LAYOUT));
    assert.deepEqual([L.active, L.first, L.prevIsSub, L.aboveList, L.shown], [true, true, true, true, true], JSON.stringify(L));
    const gs = golfers(8);
    await pasteFromTop(j, asLines(gs));
    const rows = JSON.parse(await j.evaluate(ROWS));
    assert.deepEqual(rows.filter((r) => r[0]).slice(-8), gs.map((g) => [g.name, g.hcp]), '8 names, 8 golfers: ' + JSON.stringify(rows));
});

test('the box from the top: 4, 8 and 20 names - each name a golfer, the 4 already there kept', { timeout: 300000 }, async () => {
    for (const n of [4, 8, 20]) {
        const j = await sameAsLastWeek();
        const gs = golfers(n);
        await pasteFromTop(j, asLines(gs));
        const rows = JSON.parse(await j.evaluate(ROWS));
        assert.equal(rows.length, 4 + n, n + ' pasted -> ' + (4 + n) + ' golfers: ' + JSON.stringify(rows));
        assert.deepEqual(rows.slice(0, 4).map((r) => r[0]), HAVE, 'the golfers already there, first and unchanged');
        assert.deepEqual(rows.slice(4), gs.map((g) => [g.name, g.hcp]));
        assert.equal(await j.evaluate("String(document.getElementById('player-count').textContent)"), String(4 + n));
        await j.close();
    }
});

test('068 still works: a list pasted into a Name box becomes golfers', { timeout: 120000 }, async () => {
    const j = await sameAsLastWeek();
    await j.evaluate("(function(){ addNewPlayerAndRefresh(); var a = document.querySelectorAll('#player-list .p-name-input'); var t = a[a.length - 1]; t.focus(); var dt = new DataTransfer(); dt.setData('text/plain', " + JSON.stringify(asLines(golfers(8))) + "); t.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()");
    await sleep(600);
    const rows = JSON.parse(await j.evaluate(ROWS));
    assert.equal(rows.length, 12);
    assert.deepEqual(rows.slice(4), golfers(8).map((g) => [g.name, g.hcp]));
});

test('simple flow Players: "Paste a list" is already its first control; 8 names pasted -> 8 golfers', { timeout: 150000 }, async () => {
    const GAMES_ON = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{features:Object.assign({},v&&v.features,{simpleGames:true})});}});})();";
    const j = await openJourney({ db: { events: {}, global_courses: { gca_zgkynkan: { name: 'Dobson Ranch Golf Course', data: CD } }, trips: {}, tournaments: {}, organizers: {} }, viewport: { width: 393, height: 852 },
        preScript: "window.__hardpanDoors = true; window.__freshPhone = true;" + iapStub({ active: true }) + GAMES_ON });
    journeys.push(j);
    try { await j.cdp('Browser.grantPermissions', { permissions: ['geolocation'], origin: 'file://' }); } catch (e) {}
    try { await j.cdp('Emulation.setGeolocationOverride', { latitude: 33.3759, longitude: -111.8778, accuracy: 10 }); } catch (e) {}
    await j.goto(fileUrl('home.html', ''), 2500);
    await j.tap('[data-hp-act="snew"]');
    for (let i = 0; i < 120; i++) { if (await j.evaluate("/game=/.test(location.search) && !!document.querySelector('#sf [data-sf-tee]')")) break; await sleep(250); }
    await sleep(500);
    await j.tap('[data-sf="next"]');
    await sleep(500);
    const first = await j.evaluate("(function(){ var b = document.querySelector('#sf button, #sf textarea, #sf input'); var seg = document.querySelector('#sf .sf-seg'); return seg && seg.contains(document.querySelector('#sf [data-sf-pmode=paste]')) && Array.from(document.querySelectorAll('#sf [data-sf-pmode], #sf [data-sf-tname], #sf textarea, #sf [data-sf=addgolfer]'))[0] === document.querySelector('#sf [data-sf-pmode=paste]') ? 'paste first' : 'no'; })()");
    assert.equal(first, 'paste first');
    assert.ok(await j.tap('[data-sf-pmode="paste"]'));
    await sleep(400);
    assert.ok(await j.tap('#sf-paste'));
    await j.cdp('Input.insertText', { text: asLines(golfers(8)) });
    await sleep(200);
    await j.tap('[data-sf="pastedone"]');
    await sleep(700);
    const rows = JSON.parse(await j.evaluate(ROWS));
    assert.deepEqual(rows.filter((r) => r[0]), golfers(8).map((g) => [g.name, g.hcp]), JSON.stringify(rows));
});
