// SIMPLER HARDPAN (mailbox 017, features.simpleFlow), IN REAL CHROME, every step a real tap.
//
//   Home: four doors + Resume. Same as last week (lime, the last round's course · golfers ·
//   games), + New round, Join with a code (one box), Just GPS, the IN PROGRESS card, More.
//   New round: Step 1 Course (the closest course picked, ✓ GPS) -> Step 2 Players (Manny's
//   URGENT-004 paste: 20 golfers, 5 groups, A 10 / B 10, two Matts and two Mikes -> Add
//   initial) -> Step 3 Games (Weekly Game, Skins, Nassau) -> Start round ▶, ONE tap: the
//   round is Round Setup's own save (its record shape), then the share sheet, then Done opens
//   the organizer's own group (never "How are you joining?") on the GPS.
//   Same as last week lands on Step 3 with last week's games, and Start saves a NEW round.
//   Switch off: today's Home and Round Setup exactly. Stub db only.
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'simple-flow.js'))) { console.log('Consumer tree: no HardPan Home / simple flow - skipped.'); process.exit(0); }
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');

const CD = makeCourseData(18);
const PASTE = ['Skeens 2.0/A', 'Bob 5.0/A', 'Manny +2.0/A', 'Paul 4.0/A', '', 'Glenn 12.0/B', 'Marty 9.0/B', 'Scott 6.0/B', 'Eddie 12.0/B', '',
    'Carl 6.0/A', 'Matt 8.0/B', 'Jeremy 14.0/B', 'Matt 12.0/B', '', 'Kopp 6.0/A', 'Tim 1.0/A', 'Dalen +2.0/A', 'Mike 4.0/A', '',
    'Crone 10.0/B', 'Todd 14.0/B', 'Mike 6.0/A', 'Jim 12.0/B'].join('\n');
const POOL = { enabled: true, buyIn: 40, kp: { amount: 100, holes: [3, 7, 12, 16] }, net: { amount: 100, places: [60, 40] }, skins: { mode: 'remainder', scoring: 'net', carryOver: false } };
const NAMES = ['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta', 'Eli Echo', 'Fay Foxtrot', 'Gus Golf', 'Hal Hotel'];
const SRC = wizardSavedRound({ code: 'SALW01', golfers: 8, names: NAMES, ownerUid: 'anon-cold', thru: 9, courseData: CD,
    overrides: { activeCourseKey: 'gca_zgkynkan', courseName: 'Dobson Ranch Golf Course', groupSizeOverrides: { 0: 4, 1: 4 }, moneyPool: POOL } });
const DB = (ev) => ({ events: ev || {}, global_courses: { gca_zgkynkan: { name: 'Dobson Ranch Golf Course', data: CD } }, trips: {}, tournaments: {}, organizers: {} });
const BASE = 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true });
const OFF = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{features:Object.assign({},v&&v.features,{simpleFlow:false})});}});})();";
const X = (e) => ({ expression: e });
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const SF = "JSON.stringify({ h1: (document.querySelector('#sf h1') || {}).textContent, text: (document.getElementById('sf') || {}).innerText || '' })";
const WRITES = "JSON.stringify({ writes: (window.__coldWrites || []).filter(function (w) { return /^events\\//.test(w.path); }).map(function (w) { var v = w.value || {}; return { op: w.op, path: w.path, players: (v.players || []).map(function (p) { return [p.name, p.hcp, p.flight || null]; }), groups: v.groupSizeOverrides, pool: v.moneyPool || null, inst: Object.keys(v.additionalGameInstances || {}).map(function (k) { return v.additionalGameInstances[k]; }), side: Object.keys(v).filter(function (k) { return /^sideMatches\\//.test(k); }).map(function (k) { return v[k]; }), course: v.courseName, scores: v.scores || null }; }), last: localStorage.getItem('hardpan_last_round') })";

describe('017 Simpler HardPan: Home and the 3-step New round', () => {
    test('New round: 3 steps with the 20-golfer paste (Add initial), Start in ONE tap, share sheet, Done opens your group on the GPS', { timeout: 150000 }, async () => {
        const r = await arriveCold({ url: fileUrl('home.html', ''), db: DB(), settleMs: 2000, viewport: { width: 393, height: 852 }, preScript: BASE, steps: [
            { cdp: { method: 'Emulation.setGeolocationOverride', params: { latitude: 33.3759, longitude: -111.8778, accuracy: 10 } } },
            { cdp: { method: 'Browser.grantPermissions', params: { permissions: ['geolocation'] } } },
            X("JSON.stringify({ home: document.getElementById('v-simple').innerText })"),
            { tap: '[data-hp-act="snew"]' },
            { waitFor: "/game=/.test(location.search) && !!document.getElementById('sf-course')", timeout: 30000 }, { sleep: 800 }, X(SF),
            { tap: '[data-sf="next"]' }, { sleep: 300 },
            X("(function(){ var t = document.getElementById('sf-paste'); t.value = " + JSON.stringify(PASTE) + "; t.dispatchEvent(new Event('input', { bubbles: true })); return 'pasted'; })()"),
            { waitFor: "/20 golfers/.test(document.getElementById('sf').innerText)", timeout: 8000 }, { sleep: 300 }, X(SF),
            { tap: '[data-sf="next"]' }, { sleep: 300 }, X(SF),   // refused: the same names
            X("(function(){ var out = []; ['Matt S', 'Mike R'].forEach(function (v) { var i = document.querySelector('[data-sf-rename]'); if (!i) return; i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); out.push(v); }); return out.join(','); })()"),
            { sleep: 300 }, X(SF),
            { tap: '[data-sf="next"]' }, { sleep: 300 },
            { tap: '[data-sf-game="weekly"]' }, { tap: '[data-sf-game="skins"]' }, { tap: '[data-sf-game="nassau"]' }, { sleep: 300 }, X(SF),
            { tap: '[data-sf="start"]' },
            { waitFor: "!!document.getElementById('sf-code')", timeout: 20000 }, { sleep: 500 }, X(SF), X(WRITES),
            { tap: '[data-sf="done"]' }, { sleep: 800 },
            X("JSON.stringify({ done: location.href.split('/').pop() })")] });
        assert.equal(r.ok, true, r.reason);
        const [home, s1, s2, refused, fixed, s3, sheet, w, done] = J(r);
        assert.match(home.home, /Same as last week|New round/);
        assert.match(home.home, /\+ New round[\s\S]*Join with a code[\s\S]*Just GPS \(no games\)[\s\S]*MORE[\s\S]*Trip[\s\S]*History[\s\S]*How it works/);
        assert.equal(s1.h1, 'Where are you playing?');
        assert.match(s1.text, /Dobson Ranch Golf Course\n0\.0 mi · ✓ GPS/, 'the closest course, picked, with the GPS badge');
        assert.match(s1.text, /Start\nHole 1\n10\nShotgun/);
        assert.match(s2.text, /20 golfers · 5 groups/);
        assert.match(s2.text, /Flights\nA 10\nB 10/);
        assert.match(s2.text, /Handicaps\n✓ all 20/);
        assert.match(s2.text, /Two golfers named Matt\. Add initial/);
        assert.match(s2.text, /Two golfers named Mike\. Add initial/);
        assert.equal(refused.h1, 'Who’s playing?', 'Next with two Matts stays on Players');
        assert.doesNotMatch(fixed.text, /golfers named/);
        assert.equal(s3.h1, 'What are you playing?');
        assert.match(s3.text, /Weekly Game\n\$40/);
        assert.match(s3.text, /Nassau\n\$5 a bet/);
        assert.match(sheet.text, /Round ready/);
        assert.match(sheet.text, /Group 1\nSkeens, Bob, Manny, Paul · Hole 1/);
        assert.match(sheet.text, /Group 5\nCrone, Todd, Mike, Jim · Hole 1/);
        assert.match(sheet.text, /Show QR codes/);
        assert.match(sheet.text, /Done · open the GPS/);
        assert.equal(w.writes.length, 1, 'ONE save - no Review page: ' + JSON.stringify(w.writes.map((x) => x.path)));
        const saved = w.writes[0];
        assert.equal(saved.players.length, 20);
        assert.deepEqual(saved.players.filter((p) => p[2] === 'B').length, 10);
        assert.ok(saved.players.some((p) => p[0] === 'Matt S') && saved.players.some((p) => p[0] === 'Mike R'));
        assert.deepEqual(saved.groups, { 0: 4, 1: 4, 2: 4, 3: 4, 4: 4 });
        assert.equal(saved.course, 'Dobson Ranch Golf Course');
        assert.equal(saved.pool.enabled, true);
        assert.equal(saved.pool.buyIn, 40);
        assert.equal(saved.inst.length, 1);
        assert.equal(saved.inst[0].format, 'skins');
        assert.equal(saved.side.length, 1);
        assert.equal(saved.side[0].format, 'nassau');
        assert.deepEqual([saved.side[0].frontStake, saved.side[0].backStake, saved.side[0].overallStake], [5, 5, 5]);
        assert.equal(saved.side[0].scope, 'group');
        const code = /events\/(\w+)/.exec(saved.path)[1];
        assert.equal(JSON.parse(w.last).code, code);
        assert.match(done.done, new RegExp('^index\\.html\\?game=' + code + '&group=1&me=\\d+$'), 'your own group: no "How are you joining?"');
    });

    test('Same as last week: Home shows course · golfers · games; lands on Step 3 filled in; Start saves a NEW round', { timeout: 120000 }, async () => {
        const r = await arriveCold({ url: fileUrl('home.html', ''), db: DB({ SALW01: SRC }), settleMs: 2000, viewport: { width: 393, height: 852 },
            preScript: BASE + "try{localStorage.setItem('lastRoomCode','SALW01');}catch(e){}", steps: [
                { waitFor: "!!document.querySelector('[data-hp-act=\"ssame\"]')", timeout: 10000 },
                X("JSON.stringify({ same: document.getElementById('hs-same').innerText })"),
                { tap: '[data-hp-act="ssame"]' },
                { waitFor: "/copyFrom=SALW01/.test(location.search) && /What are you/.test((document.querySelector('#sf h1') || {}).textContent || '')", timeout: 30000 }, { sleep: 500 }, X(SF),
                { tap: '[data-sf="start"]' },
                { waitFor: "!!document.getElementById('sf-code')", timeout: 20000 }, X(WRITES)] });
        assert.equal(r.ok, true, r.reason);
        const [home, s3, w] = J(r);
        assert.match(home.same, /Same as last week\nDobson Ranch Golf Course · 8 golfers · Weekly Game/);
        assert.match(s3.text, /Weekly Game\n\$40/);
        assert.equal(w.writes.length, 1);
        assert.notEqual(w.writes[0].path, 'events/SALW01', 'a NEW round');
        assert.deepEqual(w.writes[0].players.map((p) => p[0]), NAMES);
        assert.equal(w.writes[0].pool.buyIn, 40);
        assert.equal(w.writes[0].scores, null, 'no scores come across');
    });

    test('Join box takes CODE, CODE G, a link and a scorekeeper code; IN PROGRESS resumes offline from the phone\'s copy', { timeout: 90000 }, async () => {
        const SNAP = JSON.stringify({ at: Date.now(), data: SRC, meta: null });
        const NOSIGNAL = "(function(){var d0=firebase.database; firebase.database=function(){var d=d0.apply(this,arguments); if(d.__nosig) return d; d.__nosig=1; var r=d.ref; d.ref=function(p){var x=r.call(d,p); if(/^events/.test(String(p))) x.once=function(){return new Promise(function(){})}; return x}; return d}})();";
        const r = await arriveCold({ url: fileUrl('home.html', ''), db: DB({ SALW01: SRC }), settleMs: 2000, viewport: { width: 393, height: 852 },
            preScript: BASE + "try{localStorage.setItem('golfapp_snap_v1_SALW01'," + JSON.stringify(SNAP) + ");localStorage.setItem('hardpan_last_round', JSON.stringify({code:'SALW01',at:Date.now(),course:'Dobson Ranch'}));}catch(e){}" + NOSIGNAL, steps: [
                { sleep: 1200 },
                X("JSON.stringify({ prog: document.getElementById('hs-progress').innerText, forms: ['SALW01', 'salw01 2', 'https://golf-app-5a5.pages.dev/index.html?game=SALW01&group=2', 'SALW01-1-ABCD'].map(function (t) { var j = HardPanDoors.joinTarget(t); return j ? HardPanDoors.joinHref(j, { players: new Array(8).fill({}), groupSizeOverrides: { 0: 4, 1: 4 } }) : null; }) })"),
                { tap: '[data-hp-act="sjoinopen"]' }, X("(function(){ document.getElementById('hs-code').value = 'salw01 2'; return 'typed'; })()")] });
        assert.equal(r.ok, true, r.reason);
        const [s] = J(r);
        assert.match(s.prog, /IN PROGRESS\nDobson Ranch Golf Course · Thru 9\nResume ›/);
        assert.deepEqual(s.forms, ['index.html?game=SALW01', 'index.html?game=SALW01&group=2', 'index.html?game=SALW01&group=2', 'index.html?game=SALW01&group=1&sk=ABCD']);
    });

    test('switch off: today\'s Home (two doors) and Round Setup\'s own wizard - no 3-step screen', { timeout: 90000 }, async () => {
        const r = await arriveCold({ url: fileUrl('home.html', ''), db: DB(), settleMs: 2000, viewport: { width: 393, height: 852 }, preScript: BASE + OFF, steps: [
            { sleep: 800 }, X("JSON.stringify({ main: document.getElementById('v-main').classList.contains('on'), simple: document.getElementById('v-simple').classList.contains('on') })"),
            X("HardPanHome.show('games'); 'games'"), { tap: '[data-hp-act="start"]' },
            { waitFor: "/game=/.test(location.search) && document.querySelectorAll('.wizard-step').length > 0", timeout: 20000 }, { sleep: 2000 },
            X("JSON.stringify({ sf: !!document.getElementById('sf'), mark: sessionStorage.getItem('hardpan_simple_flow'), admin: getComputedStyle(document.getElementById('admin-screen')).display })")] });
        assert.equal(r.ok, true, r.reason);
        const [home, setup] = J(r);
        assert.deepEqual(home, { main: true, simple: false });
        assert.deepEqual(setup, { sf: false, mark: null, admin: 'block' });
    });
});
