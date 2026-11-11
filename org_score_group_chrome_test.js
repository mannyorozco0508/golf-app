// ============================================================================
// THE ORGANIZER'S PICKED GROUP SCORES - IN REAL CHROME (2.0.4). tools/sim/lib/phone.js: a stand-in Firebase in the
// page, every Firebase / Google URL blocked - nothing reaches the live database. The stand-in does not enforce
// rules (what the rules take is org_score_rules_emulator_test.js); this file proves what the PAGE does.
//
// THE BUG. The owner of an 8-golfer round opens its BARE link (no ?group=) and taps "Score for: Group 1". canScoreBox
// unlocked the boxes; canWritePlayer still said "multi-group, no ?group= -> read-only", so saveScore went to
// rejectCrossGroupWrite, which only did console.warn. The typed 4 never reached the database and the box emptied on
// the next snapshot. Nothing on screen said so.
//
//   1  the owner, bare link, taps Group 1, types 4 on a Group 1 golfer: the write reaches the stand-in db, the box
//      still reads 4 after another phone's write arrives on the listener, no block warning
//   2  the same owner with Group 1 picked: a Group 2 golfer's box is locked; forced open and typed into (the DOM
//      attribute removed and the open box's onchange
//      given to it - a write path that skipped the lock), nothing is written; the console block line is kept
//   3  a SPECTATOR (signed in, not the owner) on the same bare link, with a stale "Group 1" pick left in this
//      phone's storage: the box is locked; forced open and typed into, nothing is written
//
// No step calls a page function: the taps, the typing and the db are the evidence; the page's own listener does the
// rest. (The one page-state read is the remembered pick in localStorage, to show the tap did what it says.)
// FINAL: 3 pass / 0 fail. NEGATIVE CONTROL (canWritePlayer's picked-group branch removed, index.html restored by
// sha after): 1 fails (no write, the box empties); 2 and 3 pass there, as they should - they guard what stays shut.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-round.js'))) { console.log('Consumer tree (GPS_ENABLED=0): no app side to test against - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Phone, Server, fileUrl } = require('./tools/sim/lib/phone.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAMES = ['Test Manny', 'Test Bob', 'Test Josh', 'Test Todd', 'Test Paul', 'Test Marcus', 'Test Ann', 'Test Ben'];
const CODE = 'ORGSC8';
function round() {
    const r = wizardSavedRound({ code: CODE, golfers: 8, ownerUid: 'u-org', thru: 0, flights: false, names: NAMES,
        overrides: { courseName: 'Test Course', eventName: 'Test Org Score', groupSizeOverrides: { 0: 4, 1: 4 }, additionalGames: {} } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed; r.scores = {};
    return r;
}
const server = () => new Server({ events: { [CODE]: round() }, gps_meta: { config: {} }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} });
const ORG = { uid: 'u-org', isAnonymous: false, email: 'u-org@test.hardpan.dev', displayName: 'Test Manny', providerData: [{ providerId: 'apple.com' }] };
const BOB = { uid: 'u-bob', isAnonymous: false, email: 'u-bob@test.hardpan.dev', displayName: 'Test Bob', providerData: [{ providerId: 'apple.com' }] };
const WARN = "(function(){ window.__warns = []; var w = console.warn; console.warn = function () { try { window.__warns.push(Array.prototype.map.call(arguments, String).join(' ')); } catch (e) {} return w.apply(console, arguments); }; })();";
const CARD = (me, stalePick) => "try{localStorage.setItem('golfapp_me_" + CODE + "','" + me + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');localStorage.setItem('hardpan_round_side','bets|" + CODE + "');"
    + (stalePick ? "localStorage.setItem('golfapp_org_group_" + CODE + "','1');" : '') + "}catch(e){}";
const PRE = (me, stalePick) => WARN + 'window.__hardpanDoors = true;' + iapStub({ active: true }) + CARD(me, stalePick);
const SEL = (pid, h) => '.score-input[data-player-id="' + pid + '"][data-hole="' + h + '"]';
const q = JSON.stringify;
const boxDisabled = (p, s) => p.eval('(function(){var i=document.querySelector(' + q(s) + ');return i?i.disabled:"no box";})()');
const boxValue = (p, s) => p.eval('(function(){var i=document.querySelector(' + q(s) + ');return i?i.value:null;})()');
const blur = (p, s) => p.eval('(function(){var i=document.querySelector(' + q(s) + ');if(i&&document.activeElement===i)i.blur();return 1;})()');
// FORCED OPEN: the locked box is given the open box's own markup (index.html renders an open box with
// onchange="saveScore(<id>, <hole>, this.value)"), i.e. a write path that skipped the lock - so the gate under it,
// canWritePlayer, is the only thing left to refuse. The test then types and blurs like a finger.
const forceOpen = (p, s, pid, h) => p.eval('(function(){var i=document.querySelector(' + q(s) + ');if(!i)return false;i.disabled=false;i.removeAttribute("disabled");i.setAttribute("onchange","saveScore(' + pid + ', ' + h + ', this.value)");return true;})()');
const scoreWrites = (p) => (p.writes || []).flatMap((w) => (w.path === '' && w.value && typeof w.value === 'object') ? Object.keys(w.value).map((k) => ({ path: k, value: w.value[k] })) : [w]).filter((w) => /\/scores(\/|$)/.test(w.path));

const phones = [];
async function launch(name, srv, auth, pre) {
    const p = await Phone.launch({ name: 'orgsc-' + name, server: srv, viewport: { width: 402, height: 874 }, settleMs: 5000, url: fileUrl('index.html', 'game=' + CODE), preScript: pre, auth });
    phones.push(p);
    await sleep(1500);
    return p;
}
after(async () => { for (const p of phones) { try { await p.close(); } catch (e) {} } });

test('1 the owner on a bare link picks Group 1 and his score reaches the db and survives a snapshot', { timeout: 90000 }, async () => {
    const srv = server();
    const p = await launch('owner-g1', srv, ORG, PRE('101', false));
    assert.equal(await boxDisabled(p, SEL(101, 1)), true, 'before a pick the box is locked (a bare multi-group link)');
    assert.equal(await p.tap({ sel: '#spectator-hint-banner .org-score-pick', text: /^Group 1$/ }), 'Group 1', 'the owner sees "Score for: Group 1"');
    await sleep(800);
    assert.equal(await p.eval("localStorage.getItem('golfapp_org_group_" + CODE + "')"), '1', 'the pick is remembered');
    assert.equal(await boxDisabled(p, SEL(101, 1)), false, 'the Group 1 box unlocked');
    assert.ok(await p.type(SEL(101, 1), '4'));
    await blur(p, SEL(101, 1));
    await sleep(800);
    // Another phone's write arrives on the round's listener -> the card re-renders from the db.
    await p.eval("window.__simApply('set', 'events/" + CODE + "/lastNudge', Date.now())");
    await sleep(3000);
    assert.equal(await boxValue(p, SEL(101, 1)), '4', 'the box kept the score through a snapshot');
    await p.sync();
    assert.equal(srv.read('events/' + CODE + '/scores/p101_h1'), 4, 'the score reached the db: ' + JSON.stringify(scoreWrites(p)));
    const warns = await p.json('window.__warns');
    assert.ok(!warns.some((w) => /Blocked a score write/.test(w)), 'no block: ' + JSON.stringify(warns));
});

test('2 the owner with Group 1 picked cannot write a Group 2 golfer', { timeout: 90000 }, async () => {
    const srv = server();
    const p = await launch('owner-g2', srv, ORG, PRE('101', false));
    assert.equal(await p.tap({ sel: '#spectator-hint-banner .org-score-pick', text: /^Group 1$/ }), 'Group 1');
    await sleep(800);
    assert.equal(await boxDisabled(p, SEL(101, 1)), false, 'positive control: Group 1 is open');
    assert.equal(await boxDisabled(p, SEL(105, 1)), true, 'a Group 2 box stays locked');
    assert.ok(await forceOpen(p, SEL(105, 1), 105, 1));
    assert.ok(await p.type(SEL(105, 1), '5'));
    await blur(p, SEL(105, 1));
    await sleep(1200);
    await p.sync();
    assert.equal(srv.read('events/' + CODE + '/scores/p105_h1'), null, 'no Group 2 write: ' + JSON.stringify(scoreWrites(p)));
    assert.equal(scoreWrites(p).length, 0);
    const warns = await p.json('window.__warns');
    assert.ok(warns.some((w) => /Blocked a score write/.test(w)), 'the console line is kept: ' + JSON.stringify(warns));
});

test('3 a spectator on the same bare link (a stale Group 1 pick on this phone) still writes nothing', { timeout: 90000 }, async () => {
    const srv = server();
    const p = await launch('spectator', srv, BOB, PRE('102', true));
    assert.equal(await p.find({ sel: '#spectator-hint-banner .org-score-pick', text: /^Group 1$/ }), null, 'a spectator is offered no "Score for"');
    assert.equal(await boxDisabled(p, SEL(101, 1)), true, 'the Group 1 box is locked for him');
    assert.ok(await forceOpen(p, SEL(101, 1), 101, 1));
    assert.ok(await p.type(SEL(101, 1), '4'));
    await blur(p, SEL(101, 1));
    await sleep(1200);
    await p.sync();
    assert.equal(srv.read('events/' + CODE + '/scores/p101_h1'), null, 'a spectator write landed: ' + JSON.stringify(scoreWrites(p)));
    assert.equal(scoreWrites(p).length, 0);
});
