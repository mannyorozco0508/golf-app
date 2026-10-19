// EVERY ROUND MENU BUTTON DOES SOMETHING YOU CAN SEE (mailbox 015), IN REAL CHROME.
//
// "🔗 Group Links" in the Round Menu did nothing a golfer could see: it opened the
// SCOREKEEPER LINKS panel on the page BEHIND the open sheet. Now the panel lives in the
// sheet under its button. And so no other button can go quiet the same way, this taps
// EVERY visible button in the open Round Menu, one fresh page each, and reads the screen
// before and after the way a golfer does: what is under a grid of points on the phone
// (element, its words, its colours), the address, and any dialog. A tap that changes none
// of that is a dead button. Links are not tapped (they leave the page): each must have a
// real href. The one button already showing its state (Hole View on the Hole View) is
// exempt. Organizer on a two-group round (past the group picker); stub db only.
'use strict';
// HardPan only for now: the Consumer index.html is pinned byte for byte (gps_flag_test.js), so
// the Group Links fix is in a GPS block and the Consumer build still has the dead button.
if (!require('fs').existsSync(require('path').join(__dirname, 'gps-view.js'))) { console.log('Consumer tree (GPS_ENABLED=0): Round Menu fix is HardPan-only - skipped.'); process.exit(0); }
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');

const W = 390, H = 844, CODE = 'MENUBTN', TOK = 'a'.repeat(32);
const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: i % 5 === 3 ? 3 : 4, hcpIndex: i });
const PLAYERS = ['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta', 'Eve Echo', 'Fay Fox', 'Gus Golf', 'Hal Hotel']
    .map((n, i) => ({ id: 101 + i, name: n, hcp: String(2 + i), playingForMoney: true }));
const ROUND = { eventName: 'Saturday Game', courseName: 'Dobson Ranch', players: PLAYERS, gameFormat: 'stroke', courseData: CD,
    scores: {}, settlementMode: 'whole-dollar', ownerUid: 'anon-cold', organizerToken: TOK, groupSizeOverrides: { 0: 4, 1: 4 } };
const URL = fileUrl('index.html', 'game=' + CODE + '&organizer=' + TOK);
// The organizer on a two-group round already answered "How are you joining?" this session.
// TODAY'S Round Menu (the old flow): 017's simpleFlow is turned off on this phone - the new 6-tile
// menu has its own test (gps017_round_chrome_test.js).
const NO_PICKER = "try { sessionStorage.setItem('groupPickDismissed:" + CODE + "', '1'); localStorage.setItem('hardpan_simple_flow', 'off'); } catch (e) {}";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VISIBLE = `function vis(e) { var r = e.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) return false;
    for (var x = e; x && x !== document.documentElement; x = x.parentElement) { var c = getComputedStyle(x); if (c.display === 'none' || c.visibility === 'hidden') return false; } return true; }`;
const LIST = `(function () { ${VISIBLE}
    return JSON.stringify(Array.prototype.filter.call(document.querySelectorAll('#round-sheet-body button, #round-sheet-body a'), vis).map(function (e) {
        return { tag: e.tagName, text: (e.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60), href: e.getAttribute('href'),
                 current: /\\bactive\\b/.test(e.className) || e.getAttribute('aria-pressed') === 'true' };
    })); })()`;
// What the phone shows: a grid of points, each the element on top there, its words and colours.
const SCREEN = `(function () { var out = [location.href, document.documentElement.className, String((window.__DIALOGS || []).length)];
    for (var y = 12; y < innerHeight; y += 36) for (var x = 12; x < innerWidth; x += 54) {
        var e = document.elementFromPoint(x, y); if (!e) { out.push('-'); continue; } var c = getComputedStyle(e);
        out.push(e.tagName + '#' + e.id + ':' + String(e.innerText || '').slice(0, 40) + ':' + c.backgroundColor + ':' + c.color); }
    return out.join('|'); })()`;

let j;
async function arriveWithMenuOpen() {
    await j.goto(URL, 3200);
    await j.tap('#round-sheet-handle');
    await sleep(600);
    assert.equal(await j.evaluate("document.getElementById('round-sheet').classList.contains('open')"), true, 'the Round Menu opens');
}

describe('the Round Menu: every button does something visible', () => {
    let items = [];
    before(async () => {
        j = await openJourney({ db: { events: { [CODE]: ROUND }, trips: {} }, viewport: { width: W, height: H }, preScript: 'window.__hardpanDoors = true;' + NO_PICKER });
        await arriveWithMenuOpen();
        items = JSON.parse(await j.evaluate(LIST));
    });
    after(async () => { if (j) await j.close(); });

    test('the menu has its buttons (Group Links among them) and every link goes somewhere', () => {
        const buttons = items.filter((x) => x.tag === 'BUTTON');
        assert.ok(buttons.length >= 6, JSON.stringify(items));
        assert.ok(buttons.some((b) => /Group Links/.test(b.text)), 'no Group Links on a two-group round: ' + JSON.stringify(buttons.map((b) => b.text)));
        for (const a of items.filter((x) => x.tag === 'A')) {
            assert.ok(a.href && a.href !== '#' && !/^javascript:/i.test(a.href), 'a link that goes nowhere: ' + a.text + ' -> ' + a.href);
        }
    });

    test('"🔗 Group Links" opens SCOREKEEPER LINKS in the menu, on screen, with each group\'s link', { timeout: 60000 }, async () => {
        await arriveWithMenuOpen();
        assert.ok(await j.tap('#round-sheet-body button', /Group Links/), 'Group Links tapped');
        await sleep(500);
        const r = JSON.parse(await j.evaluate(`(function () { var p = document.getElementById('group-links-panel'); var r = p.getBoundingClientRect();
            var top = document.elementFromPoint(r.left + r.width / 2, Math.min(r.top + 20, innerHeight - 2));
            return JSON.stringify({ inSheet: !!p.closest('#round-sheet-body'), shown: getComputedStyle(p).display !== 'none', onScreen: r.top < innerHeight && r.bottom > 0,
                onTop: !!(top && p.contains(top)), text: p.innerText.replace(/\\s+/g, ' ') }); })()`));
        assert.equal(r.shown, true, 'the panel did not open');
        assert.equal(r.inSheet, true, 'the panel opened outside the menu, behind it');
        assert.equal(r.onScreen && r.onTop, true, 'the panel is not on screen where the golfer is looking: ' + JSON.stringify(r));
        assert.match(r.text, /Scorekeeper Links/i);
        assert.match(r.text, /Group 1[\s\S]*Group 2/);
    });

    test('each button, tapped on a fresh page, changes what the phone shows', { timeout: 300000 }, async () => {
        const buttons = items.filter((x) => x.tag === 'BUTTON');
        // Delete last: it may remove the round the others need.
        buttons.sort((a, b) => (/Delete/.test(a.text) ? 1 : 0) - (/Delete/.test(b.text) ? 1 : 0));
        const dead = [];
        for (const b of buttons) {
            if (b.current) continue;   // already showing its state (Hole View on the Hole View)
            await arriveWithMenuOpen();
            const idx = JSON.parse(await j.evaluate(LIST)).filter((x) => x.tag === 'BUTTON').findIndex((x) => x.text === b.text);
            if (idx === -1) { dead.push(b.text + ' (gone on a fresh page)'); continue; }
            const pt = JSON.parse(await j.evaluate(`(function () { ${VISIBLE} var els = Array.prototype.filter.call(document.querySelectorAll('#round-sheet-body button, #round-sheet-body a'), vis).filter(function (e) { return e.tagName === 'BUTTON'; });
                var e = els[${idx}]; e.scrollIntoView({ block: 'center' }); return JSON.stringify(1); })()`));
            assert.ok(pt);
            await sleep(250);
            const at = JSON.parse(await j.evaluate(`(function () { ${VISIBLE} var els = Array.prototype.filter.call(document.querySelectorAll('#round-sheet-body button, #round-sheet-body a'), vis).filter(function (e) { return e.tagName === 'BUTTON'; });
                var r = els[${idx}].getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }); })()`));
            const before = await j.evaluate(SCREEN);
            for (const type of ['mousePressed', 'mouseReleased']) await j.cdp('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 });
            await sleep(900);
            let afterShot = null;
            try { afterShot = await j.evaluate(SCREEN); } catch (e) { afterShot = 'navigated'; }
            if (afterShot === before) dead.push(b.text);
        }
        assert.deepEqual(dead, [], 'Round Menu buttons that changed nothing on screen: ' + dead.join(', '));
    });
});
