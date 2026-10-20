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
// Dobson's shared record as it is shaped: tees.male / tees.female, each tee { name, rating, slope, parTotal, totalYards, holes }.
const TEE = (name, y, r, sl) => ({ name, rating: r, slope: sl, parTotal: 72, totalYards: y, holes: CD.map((h) => ({ par: h.par, yardage: Math.round(y / 18) })) });
const TEES = { male: [TEE('Back', 6586, 71.1, 123), TEE('DRGA Tournament Tee', 6394, 70.2, 121), TEE('White', 6187, 69.0, 118), TEE('Red', 5645, 66.9, 112)],
    female: [TEE('White', 6187, 74.6, 129), TEE('Red', 5645, 71.4, 120)] };
const DB = (ev) => ({ events: ev || {}, global_courses: { gca_zgkynkan: { name: 'Dobson Ranch Golf Course', data: CD, tees: TEES } }, trips: {}, tournaments: {}, organizers: {} });
const SHOT = (name) => (process.env.SF_SHOTS ? [{ shot: require('path').join(process.env.SF_SHOTS, name), viewportOnly: true }] : []);
const TEEROWS = "JSON.stringify({ tees: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-tee]'), function (b) { return b.innerText.replace(/\\n/g, ' | ') + (b.classList.contains('sf-sel') ? ' *' : ''); }) })";
const BASE = 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true });
const OFF = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{features:Object.assign({},v&&v.features,{simpleFlow:false})});}});})();";
// URGENT-016: the 3-step Games & Bets setup ships behind features.simpleGames (off); these tests turn it on.
const GAMES_ON = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{features:Object.assign({},v&&v.features,{simpleGames:true})});}});})();";
const X = (e) => ({ expression: e });
// REAL TYPING (URGENT-013 5:17 PM): keys through DevTools Input, as a keyboard sends them.
const TYPE = (text) => ({ cdp: { method: 'Input.insertText', params: { text } } });
const ENTER = [{ cdp: { method: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r' } } },
    { cdp: { method: 'Input.dispatchKeyEvent', params: { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 } } }, { sleep: 120 }];
const FOCUS = "(function(){ var a = document.activeElement; return 'F:' + (a ? (a.id || (a.getAttribute('data-sf-tname') ? 'name' : a.getAttribute('data-sf-thcp') ? 'hcp' : a.tagName)) + ':' + (a.closest && a.closest('#sf') ? 'in' : 'out') : 'none'); })()";
const TO_PLAYERS = [
    { cdp: { method: 'Emulation.setGeolocationOverride', params: { latitude: 33.3759, longitude: -111.8778, accuracy: 10 } } },
    { cdp: { method: 'Browser.grantPermissions', params: { permissions: ['geolocation'] } } },
    { tap: '[data-hp-act="snew"]' },
    { waitFor: "/game=/.test(location.search) && !!document.querySelector('#sf [data-sf-tee]')", timeout: 30000 }, { sleep: 500 },
    { tap: '[data-sf="next"]' }, { sleep: 300 }];
const SUM = "JSON.stringify({ sum: (document.getElementById('sf-summary') || {}).innerText || '', rows: document.querySelectorAll('#player-list .player-row').length })";

const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const SF = "JSON.stringify({ h1: (document.querySelector('#sf h1') || {}).textContent, text: (document.getElementById('sf') || {}).innerText || '' })";
const WRITES = "JSON.stringify({ writes: (window.__coldWrites || []).filter(function (w) { return /^events\\//.test(w.path); }).map(function (w) { var v = w.value || {}; return { op: w.op, path: w.path, players: (v.players || []).map(function (p) { return [p.name, p.hcp, p.flight || null]; }), groups: v.groupSizeOverrides, pool: v.moneyPool || null, inst: Object.keys(v.additionalGameInstances || {}).map(function (k) { return v.additionalGameInstances[k]; }), side: Object.keys(v).filter(function (k) { return /^sideMatches\\//.test(k); }).map(function (k) { return v[k]; }), course: v.courseName, scores: v.scores || null }; }), last: localStorage.getItem('hardpan_last_round') })";

describe('017 Simpler HardPan: Home and the 3-step New round', () => {
    test('New round: 3 steps with the 20-golfer paste (Add initial), Start in ONE tap, share sheet, Done opens your group on the GPS', { timeout: 150000 }, async () => {
        const r = await arriveCold({ url: fileUrl('home.html', ''), db: DB(), settleMs: 2000, viewport: { width: 393, height: 852 }, preScript: BASE + GAMES_ON, steps: [
            { cdp: { method: 'Emulation.setGeolocationOverride', params: { latitude: 33.3759, longitude: -111.8778, accuracy: 10 } } },
            { cdp: { method: 'Browser.grantPermissions', params: { permissions: ['geolocation'] } } },
            X("JSON.stringify({ home: document.getElementById('v-simple').innerText })"), ...SHOT('v2-home.png'),
            { tap: '[data-hp-act="snew"]' },
            { waitFor: "/game=/.test(location.search) && !!document.querySelector('#sf [data-sf-tee]')", timeout: 30000 }, { sleep: 800 }, X(SF), X(TEEROWS), ...SHOT('v2-course-tees.png'),
            { tap: '[data-sf="next"]' }, { sleep: 300 }, { tap: '[data-sf-pmode="paste"]' }, { sleep: 200 },
            X("(function(){ var t = document.getElementById('sf-paste'); t.value = " + JSON.stringify(PASTE) + "; t.dispatchEvent(new Event('input', { bubbles: true })); return 'pasted'; })()"),
            { tap: '[data-sf="pastedone"]' },
            { waitFor: "/20 golfers/.test(document.getElementById('sf').innerText)", timeout: 8000 }, { sleep: 300 }, X(SF), ...SHOT('v2-players.png'),
            { tap: '[data-sf="next"]' }, { sleep: 300 }, X(SF),   // refused: the same names
            X("(function(){ var out = []; ['Matt S', 'Mike R'].forEach(function (v) { var i = document.querySelector('[data-sf-rename]'); if (!i) return; i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); out.push(v); }); return out.join(','); })()"),
            { sleep: 300 }, X(SF),
            { tap: '[data-sf="next"]' }, { sleep: 300 },
            { tap: '[data-sf-game="weekly"]' }, { tap: '[data-sf-game="skins"]' }, { tap: '[data-sf-game="nassau"]' }, { sleep: 300 }, X(SF), ...SHOT('v2-games.png'),
            { tap: '[data-sf="start"]' },
            { waitFor: "!!document.getElementById('sf-code')", timeout: 20000 }, { sleep: 500 }, X(SF), X(WRITES),
            { tap: '[data-sf="done"]' }, { sleep: 800 },
            X("JSON.stringify({ done: location.href.split('/').pop() })")] });
        assert.equal(r.ok, true, r.reason);
        const [home, s1, tees, s2, refused, fixed, s3, sheet, w, done] = J(r);
        assert.match(home.home, /GPS\nYardages for your round[\s\S]*Games & Bets\nSet up the group, games and money[\s\S]*Join with a code · Trip · History/, 'the two doors, then the slim row');
        assert.equal(s1.h1, 'Where are you playing?');
        assert.match(s1.text, /^‹\nGames & Bets/);
        // URGENT-022: ✓ GPS only when the map would draw it (here: the web's settings, no GPS data) - one rule.
        assert.match(s1.text, /Dobson Ranch Golf Course\n0\.0 mi · (✓ GPS · )?Change/, 'the closest course, picked');
        // URGENT-013: the tee NAMES (the first look showed the gender: Men, Men, Men, Men, Women, Women),
        // Men/Women small, yards, rating / slope; the women's White and Red (same yards) not repeated.
        // (polish 029 #11: the first-time tee is a middle one - White here - not the tips.)
        assert.deepEqual(tees.tees, ['Back | Men | 6,586 yds | 71.1 / 123', 'DRGA Tournament | Men | 6,394 yds | 70.2 / 121', 'White | Men | 6,187 yds | 69.0 / 118 *', 'Red | Men | 5,645 yds | 66.9 / 112']);
        assert.match(s2.text, /Tees\nWhite for all · Mix/);   // polish 029 #11: the middle tee
        assert.match(s1.text, /Start\nHole 1\nHole 10\nShotgun/);
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
        // Each group's first hole is a picker now (Manny's OK, 2026-10-19 - its value is held in
        // gps018_share_holes_chrome_test.js); the row reads the names, then the holes.
        assert.match(sheet.text, /Group 1\nSkeens, Bob, Manny, Paul · \nHole 1\nHole 2\n/);
        assert.match(sheet.text, /Group 5\nCrone, Todd, Mike, Jim · \nHole 1\nHole 2\n/);
        assert.match(sheet.text, /Show QR codes/);
        assert.match(sheet.text, /Done · open the (GPS|card)/);   // the card when the map has no GPS for the course (URGENT-022: one rule)
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
        // 2.0 polish #7: "Again" is offered for a FINISHED round only (an unfinished one is Resume's),
        // labelled by its day - this phone never opened it, so "Last round" - and "8 golfers".
        const FIN = JSON.parse(JSON.stringify(SRC)); CD.forEach((h) => FIN.players.forEach((p) => { FIN.scores['p' + p.id + '_h' + h.hole] = h.par; }));
        const r = await arriveCold({ url: fileUrl('home.html', ''), db: DB({ SALW01: FIN }), settleMs: 2000, viewport: { width: 393, height: 852 },
            preScript: BASE + GAMES_ON + "try{localStorage.setItem('lastRoomCode','SALW01');}catch(e){}", steps: [
                { waitFor: "!!document.querySelector('[data-hp-act=\"ssame\"]')", timeout: 10000 },
                X("JSON.stringify({ same: document.getElementById('hs-same').innerText })"),
                { tap: '[data-hp-act="ssame"]' },
                { waitFor: "/copyFrom=SALW01/.test(location.search) && /What are you/.test((document.querySelector('#sf h1') || {}).textContent || '')", timeout: 30000 }, { sleep: 500 }, X(SF),
                { tap: '[data-sf="start"]' },
                { waitFor: "!!document.getElementById('sf-code')", timeout: 20000 }, X(WRITES)] });
        assert.equal(r.ok, true, r.reason);
        const [home, s3, w] = J(r);
        assert.match(home.same, /LAST ROUND\nDobson Ranch Golf Course · 8 golfers · Weekly Game\n↻\nAgain/);
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

    test('Players, Type names: 4 golfers typed one by one with Enter - the keyboard never leaves; the paste box keeps Enter as a new line; a pasted 4', { timeout: 120000 }, async () => {
        const steps = TO_PLAYERS.concat([{ shot: process.env.SF_SHOTS ? require('path').join(process.env.SF_SHOTS, 'v2-players-type-empty.png') : '/dev/null', viewportOnly: true }].filter(() => !!process.env.SF_SHOTS), [{ tap: '[data-sf-tname]' }]);
        [['Skeens', '2.0'], ['Bob', '5.0'], ['Manny', '+2.0'], ['Paul', '4.0']].forEach(([n, h]) => {
            steps.push(TYPE(n.slice(0, 2)), X(FOCUS), TYPE(n.slice(2)), X(FOCUS), ...ENTER, X(FOCUS), TYPE(h), ...ENTER, X(FOCUS));
        });
        steps.push({ sleep: 400 }, X(SUM), ...SHOT('v2-players-type.png'),
            { tap: '[data-sf-pmode="paste"]' }, { sleep: 200 }, { tap: '#sf-paste' }, TYPE('Glenn 12'), ...ENTER, X(FOCUS), TYPE('Marty 9'), ...ENTER, TYPE('Scott 6'), X(FOCUS),
            X("JSON.stringify({ box: document.getElementById('sf-paste').value })"),
            X("(function(){ var t = document.getElementById('sf-paste'); t.value = 'Glenn 12.0/B\\nMarty 9.0/B\\nScott 6.0/B\\nEddie 12.0/B'; t.dispatchEvent(new Event('input', { bubbles: true })); return 'set'; })()"),
            { tap: '[data-sf="pastedone"]' }, { sleep: 300 }, X(SUM), ...SHOT('v2-players-paste.png'));
        const r = await arriveCold({ url: fileUrl('home.html', ''), db: DB(), settleMs: 2000, viewport: { width: 393, height: 852 }, preScript: BASE + GAMES_ON, steps });
        assert.equal(r.ok, true, r.reason);
        const focus = r.value.filter((v) => typeof v === 'string' && /^F:/.test(v));
        const [typed, box, pasted] = J(r);
        // per golfer: mid-name, name typed, Enter -> HCP, Enter -> the next golfer's name (a new row)
        assert.deepEqual(focus.slice(0, 16), ['F:name:in', 'F:name:in', 'F:hcp:in', 'F:name:in', 'F:name:in', 'F:name:in', 'F:hcp:in', 'F:name:in', 'F:name:in', 'F:name:in', 'F:hcp:in', 'F:name:in', 'F:name:in', 'F:name:in', 'F:hcp:in', 'F:name:in']);
        assert.match(typed.sum, /4 golfers · 1 group/);
        assert.match(typed.sum, /Handicaps\n✓ all 4/);
        assert.deepEqual(focus.slice(16), ['F:sf-paste:in', 'F:sf-paste:in'], 'Enter in the paste box is a new line; the box keeps the keyboard');
        assert.equal(box.box, 'Glenn 12\nMarty 9\nScott 6');
        assert.match(pasted.sum, /4 golfers · 1 group/);
        assert.match(pasted.sum, /Flights\nA 0\nB 4|Flights\nA 0\nB 4/);
    });

    test('Players, mixed: paste 16, then type 4 more - the summary counts 20 and the saved round has 20', { timeout: 150000 }, async () => {
        const sixteen = PASTE.replace('Matt 12.0/B', 'Matt K 12.0/B').split('\n').slice(0, 19).join('\n');   // four groups of four (one Matt with his initial)
        const steps = TO_PLAYERS.concat([{ tap: '[data-sf-pmode="paste"]' }, { sleep: 200 },
            X("(function(){ var t = document.getElementById('sf-paste'); t.value = " + JSON.stringify(sixteen) + "; t.dispatchEvent(new Event('input', { bubbles: true })); return 'set'; })()"),
            { tap: '[data-sf="pastedone"]' }, { sleep: 300 }, X(SUM),
            { tap: '[data-sf-pmode="type"]' }, { sleep: 300 }, { tap: '[data-sf="addgolfer"]' }, { sleep: 200 }]);
        [['Crone', '10.0'], ['Todd', '14.0'], ['Mike R', '6.0'], ['Jim', '12.0']].forEach(([n, h], i) => {
            steps.push(TYPE(n), ...ENTER, TYPE(h));
            if (i < 3) steps.push(...ENTER);
        });
        steps.push({ sleep: 400 }, X(FOCUS), X(SUM), { tap: '[data-sf="next"]' }, { sleep: 300 }, X(SF), { tap: '[data-sf="start"]' }, { sleep: 1500 }, X(SF),
            { waitFor: "!!document.getElementById('sf-code')", timeout: 20000 }, X(WRITES));
        const r = await arriveCold({ url: fileUrl('home.html', ''), db: DB(), settleMs: 2000, viewport: { width: 393, height: 852 }, preScript: BASE + GAMES_ON, steps });
        assert.equal(r.ok, true, r.reason);
        const [p16, p20, games, sheet, w] = J(r);
        assert.equal(games.h1, "What are you playing?");
        assert.match(sheet.text, /Round ready/);
        assert.match(p16.sum, /16 golfers · 4 groups/);
        assert.match(p20.sum, /20 golfers · 5 groups/);
        assert.equal(w.writes.length, 1);
        assert.equal(w.writes[0].players.length, 20);
        assert.deepEqual(w.writes[0].players.slice(16).map((p) => p[0] + ' ' + p[1]), ['Crone 10', 'Todd 14', 'Mike R 6', 'Jim 12']);
    });

    test('GPS door: the same Course & Tees screen, "Start GPS" saves you as the golfer and opens the map', { timeout: 90000 }, async () => {
        const r = await arriveCold({ url: fileUrl('home.html', ''), db: DB(), settleMs: 2000, viewport: { width: 393, height: 852 }, preScript: BASE, steps: [
            { cdp: { method: 'Emulation.setGeolocationOverride', params: { latitude: 33.3759, longitude: -111.8778, accuracy: 10 } } },
            { cdp: { method: 'Browser.grantPermissions', params: { permissions: ['geolocation'] } } },
            { tap: '[data-hp-act="sgpsdoor"]' },
            { waitFor: "/game=/.test(location.search) && !!document.querySelector('#sf [data-sf-tee]')", timeout: 30000 }, { sleep: 600 }, X(SF),
            { tap: '#sf [data-sf-tee]', nth: 2 }, { sleep: 200 }, X(TEEROWS),
            { tap: '[data-sf="startgps"]' },
            { waitFor: "/index\\.html/.test(location.pathname)", timeout: 20000 },
            X("JSON.stringify({ at: location.href.split('/').pop(), tee: localStorage.getItem('hardpan_last_tee_gca_zgkynkan') })")] });
        assert.equal(r.ok, true, r.reason);
        const [s1, tees, end] = J(r);
        assert.match(s1.text, /^‹\nGPS\nWhere are you playing\?/);
        assert.match(s1.text, /Start Round/);
        assert.doesNotMatch(s1.text, /Next: Players/);
        assert.ok(tees.tees[2].endsWith('*'), 'White picked: ' + tees.tees[2]);
        assert.match(end.at, /^index\.html\?game=\w+&group=1&me=\d+$/, 'straight to the round (the map), as its golfer');
        assert.equal(end.tee, 'White', 'the last-used tee is remembered for this course');
    });

    test('URGENT-017: Start GPS fills in this phone\'s golfer\'s own saved handicap (+2.0), not a blank / 0', { timeout: 90000 }, async () => {
        const SNAP = JSON.stringify({ at: Date.now() - 86400000, data: { players: [{ id: 101, name: 'Skeens', hcp: '2.0' }, { id: 102, name: 'Manny', hcp: '+2.0' }] } });
        // The round page's stub does not carry the save across the hop, so the Start tap is held
        // on Round Setup (the save itself is Round Setup's own) and the golfer row is read there.
        const HOLD = "window.__holdSave = true;";
        const r = await arriveCold({ url: fileUrl('home.html', ''), db: DB(), settleMs: 2000, viewport: { width: 393, height: 852 },
            preScript: BASE + HOLD + "try{localStorage.setItem('golfapp_snap_v1_OLD002'," + JSON.stringify(SNAP) + ");localStorage.setItem('golfapp_me_OLD002','102');}catch(e){}", steps: [
                { cdp: { method: 'Emulation.setGeolocationOverride', params: { latitude: 33.3759, longitude: -111.8778, accuracy: 10 } } },
                { cdp: { method: 'Browser.grantPermissions', params: { permissions: ['geolocation'] } } },
                { tap: '[data-hp-act="sgpsdoor"]' },
                { waitFor: "/game=/.test(location.search) && !!document.querySelector('#sf [data-sf-tee]')", timeout: 30000 }, { sleep: 600 },
                X("(function(){ window.saveSettings = function () { window.__held = Array.prototype.map.call(document.querySelectorAll('#player-list .player-row'), function (r) { return [(r.querySelector('.p-name-input') || {}).value, (r.querySelector('.p-hcp-input') || {}).value]; }); return Promise.resolve(); }; return 'held'; })()"),
                { tap: '[data-sf="startgps"]' },
                { waitFor: "!!window.__held", timeout: 15000 },
                X("JSON.stringify({ my: HardPanDoors.myHcp(), rows: window.__held })")] });
        assert.equal(r.ok, true, r.reason);
        const [w] = J(r);
        assert.equal(w.my, '+2.0');
        assert.deepEqual(w.rows.filter((x) => x[0]), [[w.rows[0][0], '+2.0']], 'the golfer row carries +2.0: ' + JSON.stringify(w.rows));
    });

    test('URGENT-015: the course picked before Round Setup finishes loading holds, and Start GPS waits for a slow card (Dobson shaped as live)', { timeout: 90000 }, async () => {
        // global_courses/gca_zgkynkan as it is live: name, source, location, tees, data (18 holes).
        const LIVE = { name: 'Dobson Ranch Golf Course', source: { provider: 'golfcourseapi', id: 1 }, location: { city: 'Mesa', state: 'AZ' },
            data: CD.map((h) => ({ hcpIndex: h.hcpIndex, hole: h.hole, par: h.par })), tees: TEES };
        // The phone's position answers at once; the round read (events/<new code>) and the card read are slow,
        // as on a phone's first open of the preview.
        const SLOW = "(function(){var d0=firebase.database; firebase.database=function(){var d=d0.apply(this,arguments); if(d.__slow) return d; d.__slow=1; var r=d.ref; d.ref=function(p){var x=r.call(d,p), o=x.once; var ms=/^events\\//.test(String(p)) ? 2500 : /^global_courses\\/gca_/.test(String(p)) ? 3000 : 0; if(ms) x.once=function(){var a=arguments; return new Promise(function(res,rej){ setTimeout(function(){ o.apply(x,a).then(res,rej); }, ms); }); }; return x}; return d}})();";
        const r = await arriveCold({ url: fileUrl('home.html', ''), db: { events: {}, global_courses: { gca_zgkynkan: LIVE }, trips: {}, tournaments: {}, organizers: {} }, settleMs: 1500, viewport: { width: 393, height: 852 }, preScript: BASE + SLOW, steps: [
            { cdp: { method: 'Emulation.setGeolocationOverride', params: { latitude: 33.3759, longitude: -111.8778, accuracy: 10 } } },
            { cdp: { method: 'Browser.grantPermissions', params: { permissions: ['geolocation'] } } },
            { tap: '[data-hp-act="sgpsdoor"]' },
            { waitFor: "/game=/.test(location.search) && !!document.querySelector('[data-sf=\"startgps\"]') && !!document.getElementById('course-select').value", timeout: 30000 },
            X("JSON.stringify({ early: document.getElementById('course-select').value })"),
            { tap: '[data-sf="startgps"]' },
            { waitFor: "/index\\.html/.test(location.pathname) || /no hole card|Course card problem|No scorecard/.test(document.body.innerText)", timeout: 40000 },
            X("JSON.stringify({ at: location.pathname.split('/').pop(), text: /index/.test(location.pathname) ? '' : document.body.innerText.slice(0, 300) })")] });
        assert.equal(r.ok, true, r.reason);
        const [early, end] = J(r);
        assert.equal(early.early, 'gca_zgkynkan', 'the closest GPS course is picked before the round load lands');
        assert.equal(end.at, 'index.html', 'Start GPS opened the map, no "Course card problem": ' + end.text);
    });

    test('URGENT-015: a tap on the Course & Tees screen never swaps the picked course for another record with the same name (no tee list, "no hole card")', { timeout: 90000 }, async () => {
        const LIVE = { name: 'Dobson Ranch Golf Course', source: { provider: 'golfcourseapi', id: 1 }, location: { city: 'Mesa', state: 'AZ' },
            data: CD.map((h) => ({ hcpIndex: h.hcpIndex, hole: h.hole, par: h.par })), tees: TEES };
        // A second shared record with the very same name and no card (an older import) - Round Setup's
        // page-wide click handler resolves the typed name to the LAST record that carries it.
        const db = { events: {}, global_courses: { gca_zgkynkan: LIVE, zz_dobson_old: { name: 'Dobson Ranch Golf Course' } }, trips: {}, tournaments: {}, organizers: {} };
        const r = await arriveCold({ url: fileUrl('home.html', ''), db, settleMs: 1500, viewport: { width: 393, height: 852 }, preScript: BASE, steps: [
            { cdp: { method: 'Emulation.setGeolocationOverride', params: { latitude: 33.3759, longitude: -111.8778, accuracy: 10 } } },
            { cdp: { method: 'Browser.grantPermissions', params: { permissions: ['geolocation'] } } },
            { tap: '[data-hp-act="sgpsdoor"]' },
            { waitFor: "/game=/.test(location.search) && !!document.querySelector('#sf [data-sf-tee]')", timeout: 30000 }, { sleep: 500 },
            { tap: '#sf [data-sf-tee]', nth: 1 }, { sleep: 400 },
            X("JSON.stringify({ key: document.getElementById('course-select').value, tees: document.querySelectorAll('#sf [data-sf-tee]').length })"),
            { tap: '[data-sf="startgps"]' },
            { waitFor: "/index\\.html/.test(location.pathname) || /no hole card|Course card problem|No scorecard/.test(document.body.innerText)", timeout: 30000 },
            X("JSON.stringify({ at: location.pathname.split('/').pop() })")] });
        assert.equal(r.ok, true, r.reason);
        const [afterTap, end] = J(r);
        assert.deepEqual(afterTap, { key: 'gca_zgkynkan', tees: 4 });
        assert.equal(end.at, 'index.html');
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

// URGENT-015 (live walk): on the round, the card side shows ONE GPS button - the bottom bar's - and
// it opens the map. The heading's "📍 GPS" pill (front-door.js placeGpsPill) is the old flow's.
describe('017 round page: one GPS button', () => {
    const ROUND = wizardSavedRound({ code: 'ONEGPS', golfers: 4, ownerUid: 'anon-cold', thru: 2, courseData: CD,
        overrides: { activeCourseKey: 'gca_zgkynkan', courseName: 'Dobson Ranch Golf Course' } });
    const COUNT = "JSON.stringify({ gps: Array.prototype.filter.call(document.querySelectorAll('button'), function (b) { return /GPS/.test(b.textContent) && b.offsetParent !== null && getComputedStyle(b).visibility !== 'hidden'; }).map(function (b) { return b.id || b.className || b.textContent.trim(); }), side: (window.HardPanGps && typeof HardPanGps.side === 'function') ? HardPanGps.side() : null, stored: localStorage.getItem('hardpan_round_side') })";
    for (const off of [false, true]) {
        test(off ? 'switch off: the heading pill is still there (old flow)' : 'simpleFlow: exactly one GPS button on the card (the bar\'s), and it opens the map', { timeout: 90000 }, async () => {
            const r = await arriveCold({ url: fileUrl('index.html', 'game=ONEGPS&group=1'), db: DB({ ONEGPS: ROUND }), settleMs: 4000, viewport: { width: 393, height: 852 },
                preScript: BASE + (off ? OFF : 'window.__simpleFlow = true;') + "try{localStorage.setItem('hardpan_round_side','bets|ONEGPS');}catch(e){}", steps: [
                    { sleep: 2500 }, X(COUNT),
                    ...(off ? [] : [{ tap: '[data-hp-bar="gps"]' }, { sleep: 2500 }, X(COUNT)])] });
            assert.equal(r.ok, true, r.reason);
            const [card, after] = J(r);
            if (off) { assert.ok(card.gps.includes('fd-gps-btn'), JSON.stringify(card)); return; }
            assert.equal(card.gps.length, 1, 'one GPS button on the card: ' + JSON.stringify(card));
            assert.ok(!card.gps.includes('fd-gps-btn'));
            assert.equal(after.side, 'gps', 'the bar\'s GPS opened the map: ' + JSON.stringify(after));
        });
    }
});
