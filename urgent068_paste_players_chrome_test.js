// ============================================================================
// URGENT-068 #2 - A PLAYER LIST PASTED INTO THE PLAYERS BOX, IN REAL CHROME (393x852, the app's doors).
//
// Manny, Games & Bets, the Monday game with Marty: copied a list of names, long-pressed the Players box,
// Paste - "nothing pastes". Games & Bets' Players step is the original setup (URGENT-016, 9b5e2426), whose
// player list is one-line Name boxes; a phone flattens the list's line breaks into spaces there, so the
// whole list became ONE golfer ("Test Ann 8 Test Bob 12 ...") that showed only its first letters.
// Now a list pasted into a Name box becomes golfers through Paste Player List's own commit.
//
//   1  Games & Bets > Same as last week (4 golfers) > Players > a REAL keyboard paste (the clipboard +
//      Cmd+V) of 4, 8 and 20 names into the empty Name box: 4 + N golfers, names and handicaps right,
//      the empty row dropped, the 4 already there kept, in order
//   2  a paste EVENT (what long-press > Paste fires) with a numbered "1. Name" list, and a one-line
//      "A, B, C, D" list: each name a golfer
//   3  ONE name pasted is the box's own paste, as before (no rows added)
//   4  the "📋 Paste Player List" box itself, typed into: unchanged, 8 names -> 8 golfers
//   5  simple flow's "Type names" Name box (features.simpleGames on): a pasted list of 8 -> 8 golfers
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
const golfers = (n) => Array.from({ length: n }, (_, i) => ({ name: 'Test G' + String(i + 1).padStart(2, '0'), hcp: String((i * 3) % 19) }));
const asLines = (gs) => gs.map((g) => g.name + ' ' + g.hcp).join('\n');
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const ROWS = "JSON.stringify(Array.from(document.querySelectorAll('#player-list .player-row')).map(function (r) { return [r.querySelector('.p-name-input').value, r.querySelector('.p-hcp-input').value]; }))";
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) {} } });

async function players(pre) {
    const j = await openJourney({ db: DB(), viewport: { width: 393, height: 852 },
        preScript: "window.__hardpanDoors = true; try { localStorage.setItem('lastRoomCode','MONTST'); } catch (e) {}" + iapStub({ active: true }) + (pre || '') });
    journeys.push(j);
    await j.goto(fileUrl('admin.html', 'start=lobby'), 2500);
    await j.tap('#gl-same');
    for (let i = 0; i < 40; i++) { if (await j.evaluate("/step=players/.test(location.search) && document.querySelectorAll('#player-list .player-row').length === 4")) break; await sleep(250); }
    assert.deepEqual(JSON.parse(await j.evaluate(ROWS)).map((r) => r[0]), HAVE, 'Same as last week landed on Players with the 4 golfers');
    try { await j.cdp('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: 'file://' }); } catch (e) {}
    return j;
}
// An empty row (Add New Player), tapped - the box a golfer pastes into.
async function emptyBox(j) {
    await j.evaluate("(function(){ addNewPlayerAndRefresh(); document.querySelectorAll('[data-pastehere]').forEach(function (x) { x.removeAttribute('data-pastehere'); }); var a = document.querySelectorAll('#player-list .p-name-input'); a[a.length - 1].setAttribute('data-pastehere', '1'); })()");
    await sleep(200);
    assert.ok(await j.tap('[data-pastehere]'), 'the empty Name box is on screen and tappable');
    await sleep(150);
    assert.equal(await j.evaluate("document.activeElement && document.activeElement.getAttribute('data-pastehere')"), '1', 'the Name box has the keyboard');
}
// A REAL paste: the text on the clipboard, then Cmd+V (Chrome's own paste command).
async function keyboardPaste(j, text) {
    assert.equal(await j.evaluate('navigator.clipboard.writeText(' + JSON.stringify(text) + ").then(function () { return 'ok'; }, function (e) { return String(e); })"), 'ok');
    await j.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'v', code: 'KeyV', modifiers: 4, windowsVirtualKeyCode: 86, commands: ['paste'] });
    await j.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', modifiers: 4, windowsVirtualKeyCode: 86 });
    await sleep(700);
}
// What long-press > Paste fires: a 'paste' event carrying the text.
async function pasteEvent(j, text) {
    await j.evaluate("(function(){ var t = document.activeElement; var dt = new DataTransfer(); dt.setData('text/plain', " + JSON.stringify(text) + "); t.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()");
    await sleep(500);
}

test('a real keyboard paste of 4, 8 and 20 names into a Name box: each name a golfer, the 4 already there kept', { timeout: 240000 }, async () => {
    for (const n of [4, 8, 20]) {
        const j = await players();
        const gs = golfers(n);
        await emptyBox(j);
        await keyboardPaste(j, asLines(gs));
        const rows = JSON.parse(await j.evaluate(ROWS));
        assert.equal(rows.length, 4 + n, n + ' pasted -> ' + (4 + n) + ' golfers (the empty row dropped): ' + JSON.stringify(rows));
        assert.deepEqual(rows.slice(0, 4).map((r) => r[0]), HAVE, 'the golfers already there, unchanged and first');
        assert.deepEqual(rows.slice(4), gs.map((g) => [g.name, g.hcp]), 'each pasted line is one golfer, its handicap in the HCP box');
        assert.equal(await j.evaluate("String(document.getElementById('player-count').textContent)"), String(4 + n));
        await j.close();
    }
});

test('a paste event (long-press > Paste): a numbered list and a one-line comma list each become golfers', { timeout: 120000 }, async () => {
    const j = await players();
    await emptyBox(j);
    await pasteEvent(j, '1. Test Ann 8\n2. Test Bob 12\n3. Test Cal\n4. Test Dee 9\n5. Test Eve 15\n6. Test Fay 2\n7. Test Gus 11\n8. Test Hal 7');
    let rows = JSON.parse(await j.evaluate(ROWS));
    assert.deepEqual(rows.slice(4), [['Test Ann', '8'], ['Test Bob', '12'], ['Test Cal', ''], ['Test Dee', '9'], ['Test Eve', '15'], ['Test Fay', '2'], ['Test Gus', '11'], ['Test Hal', '7']]);
    await emptyBox(j);
    await pasteEvent(j, 'Test Ivy, Test Jon, Test Kim, Test Lou');
    rows = JSON.parse(await j.evaluate(ROWS));
    assert.deepEqual(rows.slice(12).map((r) => r[0]), ['Test Ivy', 'Test Jon', 'Test Kim', 'Test Lou']);
    assert.equal(rows.length, 16);
});

test('one name pasted is the box\'s own paste, as before - no golfers added', { timeout: 120000 }, async () => {
    const j = await players();
    await emptyBox(j);
    await keyboardPaste(j, 'Test Solo');
    const rows = JSON.parse(await j.evaluate(ROWS));
    assert.equal(rows.length, 5);
    assert.deepEqual(rows[4], ['Test Solo', '']);
});

test('the "📋 Paste Player List" box, typed into: unchanged - 8 names, 8 golfers', { timeout: 120000 }, async () => {
    const j = await players();
    assert.ok(await j.tap('button', /Paste Player List/));
    await sleep(400);
    assert.equal(await j.evaluate("document.activeElement && document.activeElement.id"), 'paste-players-textarea');
    const gs = golfers(8);
    await j.cdp('Input.insertText', { text: asLines(gs) });
    await sleep(300);
    assert.match(await j.evaluate("document.getElementById('paste-preview-summary').innerText"), /8 players ready to add/);
    await j.tap('#paste-players-commit-btn');
    await sleep(600);
    const rows = JSON.parse(await j.evaluate(ROWS));
    assert.deepEqual(rows.slice(4), gs.map((g) => [g.name, g.hcp]));
});

test('simple flow "Type names": a list of 8 pasted into a Name box -> 8 golfers', { timeout: 150000 }, async () => {
    const GAMES_ON = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{features:Object.assign({},v&&v.features,{simpleGames:true})});}});})();";
    const j = await openJourney({ db: { events: {}, global_courses: { gca_zgkynkan: { name: 'Dobson Ranch Golf Course', data: CD } }, trips: {}, tournaments: {}, organizers: {} }, viewport: { width: 393, height: 852 },
        preScript: "window.__hardpanDoors = true; window.__freshPhone = true; try { localStorage.setItem('hardpan_players_mode', 'type'); } catch (e) {}" + iapStub({ active: true }) + GAMES_ON });
    journeys.push(j);
    try { await j.cdp('Browser.grantPermissions', { permissions: ['geolocation', 'clipboardReadWrite', 'clipboardSanitizedWrite'], origin: 'file://' }); } catch (e) {}
    try { await j.cdp('Emulation.setGeolocationOverride', { latitude: 33.3759, longitude: -111.8778, accuracy: 10 }); } catch (e) {}
    await j.goto(fileUrl('home.html', ''), 2500);
    await j.tap('[data-hp-act="snew"]');
    for (let i = 0; i < 120; i++) { if (await j.evaluate("/game=/.test(location.search) && !!document.querySelector('#sf [data-sf-tee]')")) break; await sleep(250); }
    await sleep(500);
    await j.tap('[data-sf="next"]');
    await sleep(500);
    assert.ok(await j.tap('[data-sf-tname]'), 'the Type names Name box is there');
    const gs = golfers(8);
    await keyboardPaste(j, asLines(gs));
    const typed = JSON.parse(await j.evaluate("JSON.stringify(Array.from(document.querySelectorAll('#sf [data-sf-tname]')).map(function (i) { return i.value; }))"));
    assert.deepEqual(typed, gs.map((g) => g.name), 'the Type names list shows the 8 golfers');
    const rows = JSON.parse(await j.evaluate(ROWS));
    assert.deepEqual(rows, gs.map((g) => [g.name, g.hcp]), 'Round Setup holds the 8 golfers (the empty row dropped)');
});
