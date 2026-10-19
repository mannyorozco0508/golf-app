// ============================================================================
// 013 HIGH #1, TWO-TEE START (Monday's 20-golfer round may use one): a group set to
// "Starts on Hole 10" on Round Ready opens on hole 10 - the card and GPS.
//
// Measured by tools/sim/setup-shapes.js (D-shotgun): START SCORING drew the round with
// no group (the "How are you joining?" sheet up) and stored hole 1 under
// hardpan_last_hole_<code>; Keep score for Group 4 then read that and opened Group 4 -
// off the 10th - on hole 1. The memory is now per group (hardpan_last_hole_<code>_g<N>),
// nothing is stored while the group sheet is up, and the old round-wide key is read
// only for a group that starts on the round's first hole.
//
// THE REOPEN IS A KILLED APP OPENED AGAIN (013 follow-up). Under load the reopen read
// g4=10 and no g1 key AT BOOT (measured with a boot-time read of localStorage): the first
// session's last writes (g4=11 from Next, g1=1) never reached disk. The app wrote 11 at
// once - the card's Next -> renderHoleView -> gpsFollowHoleView, synchronously; the step
// below waits on it. What lost it was the harness: arriveCold ends Chrome with a bare
// SIGTERM, and Chrome commits localStorage lazily, so an un-committed write dies with the
// process. A phone swiped away goes to the background first and its storage is written
// down; tools/sim/lib/phone.js kill() models exactly that (visibility hidden, a graceful
// Browser.close, the process waited out), so the kill/reopen here uses it.
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const ON = fs.existsSync(path.join(__dirname, 'gps-view.js'));
const skip = ON ? false : 'Consumer tree: no GPS, no last-hole memory';
const CODE = 'TWOTEE', B9 = 'BACKNN';
function round(code, extra) {
    const r = wizardSavedRound({ code, golfers: 20, ownerUid: 'anon-cold', thru: 0, flights: false,
        overrides: Object.assign({ additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club',
            groupSizeOverrides: { 0: 4, 1: 4, 2: 4, 3: 4, 4: 4 } }, extra || {}) });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    r.scores = {};
    return r;
}
const DB = { events: { [CODE]: round(CODE, { startingHole: 1, groupStartingHoles: { 4: 10, 5: 10 } }), [B9]: round(B9, { startingHole: 10 }) },
    global_courses: {}, trips: {}, organizers: {}, tournaments: {} };
const PRE = 'window.__hardpanDoors = true;' + iapStub({ active: true });
const ST = "JSON.stringify({ url: document.URL.replace(/^.*\\//, ''), card: typeof currentViewedHole !== 'undefined' ? currentViewedHole : null, gps: window.HardPanGps && HardPanGps.hole ? HardPanGps.hole() : null, side: window.HardPanGps && HardPanGps.side ? HardPanGps.side() : null, keys: Object.keys(localStorage).filter(function (k) { return /^hardpan_last_hole_/.test(k); }).sort().map(function (k) { return k + '=' + localStorage.getItem(k); }) })";
const GPS = { expression: "(function(){ var b = document.getElementById('fd-gps-btn'); if (b) b.click(); return 'gps'; })()" };
const CARD = { expression: "(function(){ if (window.HardPanGps && HardPanGps.showSide) HardPanGps.showSide('bets'); return 'card'; })()" };
const PICK = (g) => ({ expression: "(function(){ var b = Array.prototype.filter.call(document.querySelectorAll('#group-pick-overlay button'), function (x) { return /Keep score for Group " + g + "\\b/.test(x.innerText); })[0]; if (!b) return 'no button'; b.click(); return 'picked'; })()" });
const GO = (q) => ({ expression: "(function(){ location.href = 'index.html?" + q + "'; return 'go'; })()" });
const NEXT = { expression: "(function(){ var b = Array.prototype.filter.call(document.querySelectorAll('.hole-view-nav-btn'), function (x) { return /Next/.test(x.textContent); })[0]; if (b) b.click(); return 'next'; })()" };
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));

test('Groups 4-5 on Hole 10: Keep score for Group 4 opens the card and GPS on 10; Group 1 on 1; a reopen keeps each group\'s hole; a back-nine round is unchanged', { skip, timeout: 240000 }, async () => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'twotee-'));
    const profile2 = fs.mkdtempSync(path.join(os.tmpdir(), 'twotee-kill-'));
    try {
        // 1. START SCORING (no group): the sheet is up. Group 4 -> 10 on the card and on GPS;
        //    Next -> 11. Group 1 -> 1.
        let r = await arriveCold({ url: fileUrl('index.html', 'game=' + CODE), db: DB, settleMs: 4500, webgl: true, profileDir: profile, preScript: PRE, steps: [
            { expression: ST },
            PICK(4), { sleep: 4500 }, { expression: ST },
            GPS, { sleep: 3000 }, { expression: ST },
            CARD, { sleep: 600 }, NEXT, { waitFor: "localStorage.getItem('hardpan_last_hole_" + CODE + "_g4') === '11'", timeout: 8000 }, { expression: ST },
            GO('game=' + CODE + '&group=1'), { sleep: 4500 }, { expression: ST },
            GPS, { sleep: 3000 }, { expression: ST },
            { waitFor: "localStorage.getItem('hardpan_last_hole_" + CODE + "_g1') === '1' && localStorage.getItem('hardpan_last_hole_" + CODE + "_g4') === '11'", timeout: 8000 },
        ] });
        assert.equal(r.ok, true, r.reason);
        const [s0, g4, g4gps, g4next, g1, g1gps] = J(r);
        assert.ok(!s0.keys.some((k) => /=1$/.test(k)), 'hole 1 stored while "How are you joining?" was up: ' + s0.keys);
        assert.equal(g4.card, 10, 'Group 4 card: ' + JSON.stringify(g4));
        assert.equal(g4gps.side, 'gps'); assert.equal(g4gps.gps, 10, 'Group 4 GPS: ' + JSON.stringify(g4gps));
        assert.equal(g4next.card, 11);
        assert.equal(g1.card, 1, 'Group 1 card: ' + JSON.stringify(g1));
        assert.equal(g1gps.gps, 1, 'Group 1 GPS: ' + JSON.stringify(g1gps));
        // 2. Killed and opened again: a phone with Group 4's card on 11, swiped away and reopened.
        const { Phone, Server } = require('./tools/sim/lib/phone.js');
        const ph = await Phone.launch({ name: 'g4', server: new Server(DB), preScript: PRE + "try { if (!localStorage.getItem('hardpan_round_side')) localStorage.setItem('hardpan_round_side', 'bets'); } catch (e) {}",
            profileDir: profile2, webgl: true, viewport: { width: 393, height: 852 }, url: fileUrl('index.html', 'game=' + CODE + '&group=4'), settleMs: 4500 });
        await ph.eval(NEXT.expression);
        assert.ok(await ph.waitFor("localStorage.getItem('hardpan_last_hole_" + CODE + "_g4') === '11'", 8000), 'Next did not store 11');
        await ph.eval("(function(){ location.href = 'index.html?game=" + CODE + "&group=1'; return 1; })()");
        await new Promise((res) => setTimeout(res, 4500));
        const before = JSON.parse(await ph.eval(ST));
        await ph.kill();
        await ph.reopen(fileUrl('index.html', 'game=' + CODE + '&group=4'), 4500);
        const re4 = JSON.parse(await ph.eval(ST));
        await ph.eval("(function(){ location.href = 'index.html?game=" + CODE + "&group=1'; return 1; })()");
        await new Promise((res) => setTimeout(res, 4500));
        const re1 = JSON.parse(await ph.eval(ST));
        await ph.close();
        assert.equal(before.card, 1, 'Group 1 before the kill: ' + JSON.stringify(before));
        assert.equal(re4.card, 11, 'Group 4 after reopen: ' + JSON.stringify(re4));
        assert.equal(re1.card, 1, 'Group 1 after reopen: ' + JSON.stringify(re1));
        assert.ok(re4.keys.some((k) => k === 'hardpan_last_hole_' + CODE + '_g4=11'), re4.keys.join());
        // 3. A phone mid-round before this change (the round-wide key, hole 5): Group 1 (off the
        //    1st) still resumes on 5; Group 5 (off the 10th) never takes it.
        r = await arriveCold({ url: fileUrl('index.html', 'game=' + CODE + '&group=1'), db: DB, settleMs: 4500, webgl: true,
            preScript: PRE + "try { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', 1); localStorage.setItem('hardpan_last_hole_" + CODE + "', '5'); } } catch (e) {}", steps: [
            { expression: ST }, GO('game=' + CODE + '&group=5'), { sleep: 4500 }, { expression: ST }] });
        assert.equal(r.ok, true, r.reason);
        const [old1, old5] = J(r);
        assert.equal(old1.card, 5, 'Group 1 with the old key: ' + JSON.stringify(old1));
        assert.equal(old5.card, 10, 'Group 5 with the old key: ' + JSON.stringify(old5));
        // 4. A back-nine start (all on 10): no group, then Group 2 - both on 10, card and GPS.
        r = await arriveCold({ url: fileUrl('index.html', 'game=' + B9), db: DB, settleMs: 4500, webgl: true, preScript: PRE, steps: [
            PICK(2), { sleep: 4500 }, { expression: ST }, GPS, { sleep: 3000 }, { expression: ST }] });
        assert.equal(r.ok, true, r.reason);
        const [b2, b2gps] = J(r);
        assert.equal(b2.card, 10, 'back nine, Group 2: ' + JSON.stringify(b2));
        assert.equal(b2gps.gps, 10, 'back nine, Group 2 GPS: ' + JSON.stringify(b2gps));
    } finally { for (const d of [profile, profile2]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} } }
});
