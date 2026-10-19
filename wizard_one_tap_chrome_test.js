// ONE TAP ON "Review & Save" IS REVIEW (mailbox 015), IN REAL CHROME.
//
// Manny's real round: 20 golfers from a pasted list (two Matts, two Mikes), flights A/B,
// the Weekly Game with skins per flight, Dobson. On Money his FIRST tap on "Review & Save"
// left him on Money with the page jumped; the second went through. The cause, measured
// here: a Money field still had the keyboard up. The press took focus from it, the keyboard
// closed, the taller screen clamped the scroll (the button is near the bottom of a long
// page) and the button moved ~300px out from under the finger before it lifted - so the
// release was on something else and no click happened.
//
// The keyboard is modelled the way a phone does it: the screen is shorter while a field has
// focus, and it grows back the moment the field loses focus. Every tap is a real
// Input.dispatchMouseEvent press and release. Stub db only; both trees (an existing round
// opens on Review in both, and Money is reached by the Review's own "Edit").
'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const F = require('./tools/sim/lib/fixtures.js');

const W = 393, H = 852, KB = 330;
const CODE = 'ONETAP';
const players = F.NAMES.map((n, i) => ({ id: 101 + i, name: n, hcp: F.HCP[i], flight: F.FLIGHT[i], team: 'Team 1', squad: 'red', playingForMoney: true }));
const db = F.server();
db.events[CODE] = {
    eventName: 'Weekly', roundDay: 'Weekly', courseName: F.DOBSON.name, activeCourseKey: 'gca_zgkynkan', courseData: F.DOBSON.data,
    gameFormat: 'stroke', ownerUid: 'anon-cold', organizerToken: 'a'.repeat(32), scores: {}, settlementMode: 'whole-dollar',
    startingHole: 1, groupSizeOverrides: { 0: 4, 1: 4, 2: 4, 3: 4, 4: 4 }, players,
    flights: { enabled: true, scopes: { skins: 'flight', birdies: 'flight' }, skinsSplit: 'even' },
    moneyPool: { enabled: true, buyIn: 40, kp: { amount: 100, holes: [] }, net: { amount: 100, places: [50, 30, 20] }, skins: { mode: 'remainder' } }
};

let j;
const step = () => j.evaluate('currentWizardStep');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const metrics = (h) => j.cdp('Emulation.setDeviceMetricsOverride', { width: W, height: h, deviceScaleFactor: 2, mobile: true });

async function toMoney() {
    if (await step() !== 7) { await j.tap('#wizard-next-6'); await sleep(500); }
    assert.equal(await step(), 7, 'on Review before going back to Money');
    assert.ok(await j.tap('.wizard-edit-link[onclick="goToWizardStep(6)"]'), 'Review has an Edit for Money');
    await sleep(600);
    assert.equal(await step(), 6, 'on Money');
    assert.match(await j.evaluate("document.getElementById('wizard-next-6').textContent"), /Review & Save/);
}

// Type into a Money field (keyboard up), scroll to the bottom as a thumb does, then press
// "Review & Save" and release at the same point. `forceShift`: the page moves under the
// finger whatever happens to the field; otherwise only when the field loses focus.
async function keyboardTap(field, forceShift) {
    await j.tap(field);
    await j.cdp('Input.insertText', { text: '0' });
    await metrics(H - KB); await sleep(200);
    await j.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)'); await sleep(200);
    const pt = JSON.parse(await j.evaluate("(function () { var r = document.getElementById('wizard-next-6').getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), top: Math.round(r.top) }); })()"));
    await j.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    const lostFocus = await j.evaluate('document.activeElement !== document.querySelector(' + JSON.stringify(field) + ')');
    if (lostFocus || forceShift) { await metrics(H); await sleep(150); }
    const moved = await j.evaluate("Math.round(document.getElementById('wizard-next-6').getBoundingClientRect().top)");
    await j.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await sleep(700);
    await metrics(H); await sleep(150);
    return { lostFocus, moved, pt };
}

describe('Round Setup Money: one tap on "Review & Save" opens Review (Manny\'s Weekly Game round)', () => {
    before(async () => {
        j = await openJourney({ db, viewport: { width: W, height: H }, preScript: 'window.__hardpanDoors = true;' });
        await j.goto(fileUrl('admin.html', 'game=' + CODE), 3500);
    });
    after(async () => { if (j) await j.close(); });

    test('a plain tap', { timeout: 60000 }, async () => {
        await toMoney();
        await j.tap('#wizard-next-6'); await sleep(500);
        assert.equal(await step(), 7);
        assert.match(await j.text('#wizard-review-summary'), /Weekly Game/);
    });

    test('with the keyboard up on the buy-in: the press does not close it under the finger, one tap is Review', { timeout: 60000 }, async () => {
        await toMoney();
        const r = await keyboardTap('#mp-buyin', false);
        assert.equal(r.lostFocus, false, 'the press took focus from the field - the keyboard closes mid-tap and the button moves');
        assert.equal(await step(), 7, 'still on Money after one tap: ' + JSON.stringify(r));
        assert.equal(await j.evaluate("document.activeElement && document.activeElement.id === 'mp-buyin'"), false, 'the field is let go once Review opens');
    });

    test('the page moves under the finger anyway (KP holes): the tap that started on the button is still that button', { timeout: 60000 }, async () => {
        await toMoney();
        const r = await keyboardTap('#mp-kp-holes', true);
        assert.ok(Math.abs(r.moved - r.pt.top) > 100, 'the button moved out from under the finger: ' + JSON.stringify(r));
        assert.equal(await step(), 7, 'one tap: ' + JSON.stringify(r));
        assert.equal(j.consoleErrors.length, 0, JSON.stringify(j.consoleErrors));
    });
});
