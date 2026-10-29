// ============================================================================
// 100b - THE OFFLINE PROOF (Manny's 099 list: "PROVE offline + Bet sends when signal returns";
// "Matches-page bets queue offline"). Real Chrome, the stub database (tools/lib/journey.js) and the
// app's own queue (offline-queue.js, localStorage golfapp_wq_v1). Nothing leaves the machine.
//
// "No signal" here is what a real phone sees: navigator.onLine is false and every database write
// stays PENDING (never lands, never fails) - the Firebase SDK's own behaviour with no socket.
//   1  + Bet (gps-bet.js write -> index.html durableWrite) and a + Game Nassau, made with no signal:
//      nothing reaches the database, both ops wait in the phone's queue.
//   2  Matches page (New Action -> Dots), made with no signal: queued too, the sheet closes and says
//      "Saved. Sends when you have signal."
//   3  The app is killed (a fresh page load) and opened again with the signal back: the scorecard's
//      drain SENDS all three - each lands once, at its own path; the queue is empty; the round shows them.
//   4  The Matches page's own drain: a Dots bet made offline there is sent by the page itself on the
//      'online' event, with no trip to the scorecard.
// ============================================================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const CODE = 'OFF100';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r = wizardSavedRound({ code: CODE, golfers: 4, ownerUid: 'org-not-me', thru: 0, flights: false, names: ['Manny O', 'Jim B', 'Dave K', 'Rob T'], hcps: [0, 0, 0, 0],
    overrides: { activeCourseKey: 'caledonia', courseName: 'Caledonia', eventName: 'Saturday Game', groupSizeOverrides: { 0: 4 } } });
delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed; r.additionalGames = {};
r.scores = {};
r.courseData.slice().sort((a, b) => a.hole - b.hole).slice(0, 6).forEach((h) => r.players.forEach((p) => { r.scores['p' + p.id + '_h' + h.hole] = h.par; }));
const ID = r.players.map((p) => String(p.id));
const DB = { events: { [CODE]: r }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} };
// NO SIGNAL (localStorage 'u100b_offline' = '1'): navigator.onLine false, every write pending.
const OFFLINE = `(function(){
  var off = function(){ try { return localStorage.getItem('u100b_offline') === '1'; } catch (e) { return false; } };
  try { Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: function(){ return !off(); } }); } catch (e) {}
  var fb = window.firebase; if (!fb || !fb.database) return;
  var db0 = fb.database;
  fb.database = function () {
    var d = db0.apply(this, arguments), ref0 = d.ref;
    d.ref = function (p) {
      var rf = ref0.call(d, p);
      ['set', 'update', 'remove'].forEach(function (m) {
        var f = rf[m];
        rf[m] = function () { if (off()) { (window.__HELD = window.__HELD || []).push(m + ' ' + p); return new Promise(function () {}); } return f.apply(rf, arguments); };
      });
      return rf;
    };
    return d;
  };
})();`;
const PRE = 'window.__hardpanDoors = true;' + iapStub({ active: true }) + OFFLINE
    + "try{localStorage.setItem('golfapp_me_" + CODE + "','" + ID[0] + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}";

let j;
const ev = (x) => j.evaluate(x);
const ROUND = `window.__DB.events['${CODE}']`;
const queue = async () => JSON.parse(await ev("JSON.stringify((JSON.parse(localStorage.getItem('golfapp_wq_v1') || '[]') || []).map(function(o){ return o.path; }))"));
const keys = { plusBet: null, game: null, dots: null };

before(async () => {
    j = await openJourney({ db: DB, viewport: { width: 402, height: 874 }, webgl: true, preScript: PRE });
    await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 4500);
    await ev("localStorage.setItem('u100b_offline','1'); window.dispatchEvent(new Event('offline')); 1");
});
after(async () => { if (j) await j.close(); });

test('with no signal: a + Bet match is kept in the phone\'s queue, not in the database', { timeout: 60000 }, async () => {
    assert.equal(await ev('navigator.onLine'), false);
    const k = await ev(`(function(){ var b = HardPanBet.buildBet({ game: 'match', picks: ['${ID[0]}', '${ID[1]}'], stake: 10, scoring: 'net', startHole: 7, press: '1down' }); if (b.refuse) return 'refused: ' + b.refuse; return HardPanBet.write(b, null).key; })()`);
    assert.ok(k && !/^refused/.test(k), String(k));
    keys.plusBet = 'events/' + CODE + '/sideMatches/' + k;
    await sleep(300);
    assert.equal(await ev(`!!((${ROUND}.sideMatches || {})['${k}'])`), false, 'nothing reached the database');
    assert.ok((await queue()).indexOf(keys.plusBet) > -1, 'the + Bet is in the queue');
});

test('with no signal: a + Game Nassau (the sheet\'s Start) is queued too', { timeout: 60000 }, async () => {
    assert.ok(await ev('!!window.HardPanGame && HardPanGame.open({})'), 'the + Game sheet opens');
    await ev(`document.querySelector('#hp-game [data-hg-pick="${ID[2]}"]').click()`); await sleep(150);
    const before = await queue();
    await ev(`document.querySelector('#hp-game [data-hg=start]').click()`); await sleep(400);
    const after = await queue();
    const added = after.filter((p) => before.indexOf(p) === -1);
    assert.equal(added.length, 1, JSON.stringify(added));
    assert.match(added[0], new RegExp('^events/' + CODE + '/sideMatches/'));
    keys.game = added[0];
    assert.equal(await ev(`Object.keys(${ROUND}.sideMatches || {}).length`), 0);
});

test('with no signal: the Matches page\'s New Action (Dots) is queued, the sheet closes and says so', { timeout: 90000 }, async () => {
    await j.goto(fileUrl('sidematches.html', 'game=' + CODE + '&group=1'), 3500);
    assert.equal(await ev('navigator.onLine'), false);
    const before = await queue();
    await ev("openSideMatchModal(); var f=document.getElementById('sm-format'); f.value='dots'; f.dispatchEvent(new Event('change',{bubbles:true})); 1");
    await sleep(300);
    await ev("(function(){ var s=document.getElementById('sm-field-stake'); s.value='2'; s.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()");
    await ev(`(function(){ var want = ${JSON.stringify(ID.slice(0, 2))}; Object.keys(fieldActionPick).forEach(function(k){ if (want.indexOf(k) === -1) toggleFieldActionPlayer(k); }); want.forEach(function(k){ if (!fieldActionPick[k]) toggleFieldActionPlayer(k); }); return Object.keys(fieldActionPick).join(','); })()`);
    await ev('saveSideMatch()'); await sleep(600);
    const after = await queue();
    const added = after.filter((p) => before.indexOf(p) === -1);
    assert.equal(added.length, 1, 'the Matches-page bet is in the queue: ' + JSON.stringify(after));
    assert.match(added[0], new RegExp('^events/' + CODE + '/additionalGameInstances/'));
    keys.dots = added[0];
    const t = await j.screenText();
    assert.match(t, /Saved\. Sends when you have signal\./);
    assert.equal(await ev(`Object.keys(${ROUND}.additionalGameInstances || {}).length`), 0, 'nothing reached the database');
});

test('the app is killed, then opened with the signal back: every queued bet is SENT, once, at its own path', { timeout: 90000 }, async () => {
    // Killed: a fresh page load (nothing in memory); the queue is all that is left on the phone.
    await ev("localStorage.setItem('u100b_offline','0'); 1");
    await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 6000);
    await sleep(2500);
    const db = await j.harvest();
    const ev0 = db.events[CODE];
    const at = (p) => p.replace('events/' + CODE + '/', '').split('/').reduce((n, k) => (n || {})[k], ev0);
    const pb = at(keys.plusBet), gm = at(keys.game), dt = at(keys.dots);
    assert.ok(pb, '+ Bet sent'); assert.equal(pb.format, 'match'); assert.equal(Number(pb.startHole), 7); assert.equal(pb.pressRule, '1down');
    assert.ok(gm, '+ Game sent'); assert.equal(gm.format, 'nassau'); assert.equal(Number(gm.startHole), 7);
    assert.ok(dt, 'Matches-page Dots sent'); assert.equal(dt.format, 'dots'); assert.deepEqual(dt.participantIds, ID.slice(0, 2));
    assert.equal(Object.keys(ev0.sideMatches).length, 2, 'no duplicates');
    assert.equal(Object.keys(ev0.additionalGameInstances).length, 1, 'no duplicates');
    assert.deepEqual(await queue(), [], 'the queue is empty');
    // The round on this phone has them (Bets / Settle up read currentData).
    const seen = JSON.parse(await ev('JSON.stringify({ sm: Object.keys(currentData.sideMatches || {}).length, gi: Object.keys(currentData.additionalGameInstances || {}).length, games: getRoundGames(currentData).map(function(g){ return g.format; }) })'));
    assert.equal(seen.sm, 2); assert.equal(seen.gi, 1);
    assert.ok(seen.games.indexOf('dots') > -1);
});

test('the Matches page sends its own queue when the signal returns (the online event), no scorecard needed', { timeout: 90000 }, async () => {
    await ev("localStorage.setItem('u100b_offline','1'); 1");
    await j.goto(fileUrl('sidematches.html', 'game=' + CODE + '&group=1'), 3500);
    const before = await queue();
    await ev("openSideMatchModal(); var f=document.getElementById('sm-format'); f.value='dots'; f.dispatchEvent(new Event('change',{bubbles:true})); 1");
    await sleep(300);
    await ev('saveSideMatch()'); await sleep(500);
    const added = (await queue()).filter((p) => before.indexOf(p) === -1);
    assert.equal(added.length, 1);
    await ev("localStorage.setItem('u100b_offline','0'); window.dispatchEvent(new Event('online')); 1");
    await sleep(1500);
    assert.deepEqual(await queue(), [], 'sent from the Matches page');
    const id = added[0].split('/').pop();
    assert.equal(await ev(`!!(${ROUND}.additionalGameInstances || {})['${id}']`), true);
});
