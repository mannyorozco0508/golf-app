// ============================================================================
// URGENT-060 - "WHERE ARE YOU PLAYING?" SHORTER, IN REAL CHROME (phone GPS mode). Manny, 5:25 PM.
//
// Under the search box, in this order:
//   1  NEAR YOU: only the 3 closest courses. Within ~0.5 mi of one, that course is first, auto-picked
//      and labelled "You're here". Farther than that from every course: no "You're here", nothing
//      auto-picked (a course picked before stays picked).
//   2  LAST PLAYED: 1 course, skipped when it is already one of the 3.
//   3  The picked course's tees, then Start Round.
// No longer list - the rest comes from search. Search, "Not listed? Add a course", the ✓ GPS badges
// and the distances are unchanged.
// Synthetic course data only for the GolfAPI course (the GolfAPI file is licensed, never the repo).
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'simple-flow.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const CD = makeCourseData(18);
const TEE = (name, y, r, sl) => ({ name, rating: r, slope: sl, parTotal: 71, totalYards: y, holes: CD.map((h) => ({ par: h.par, yardage: Math.round(y / 18) })) });
const ID = '990000000000000001';
const GC = { ['gapi_' + ID]: { name: 'Talking Stick Golf Club (South - Piipaash)', data: CD, tees: { male: [TEE('Black', 6800, 72.6, 129), TEE('Gold', 6400, 70.6, 124), TEE('Jade', 5800, 68.0, 115)] },
    location: { city: 'Scottsdale', state: 'AZ', latitude: 33.539874, longitude: -111.870432 } } };
const GAPI = { v: 1, built: 'test', links: {}, courses: { [ID]: { id: ID, club: 'Talking Stick Golf Club', course: 'South - Piipaash', city: 'Scottsdale', state: 'AZ', lat: 33.539874, lng: -111.870432, holes: 18,
    h: { 1: { g: { f: [33.5445, -111.8690], c: [33.5444, -111.8691], b: [33.5443, -111.8692] }, t: { b: [33.5467, -111.8663], f: [33.5460, -111.8678] } } } } } };
const PHONE = "Object.defineProperty(window, 'HardPanGpsLive', { configurable: true, get: function () { return { on: function () { return true; } }; }, set: function () {} });"
    + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';';
const AT_TS = [33.5399, -111.8704];      // on Talking Stick South
const AWAY = [33.4300, -112.5800];       // open desert west of Buckeye: farther than 0.5 mi from every course
const X = (e) => ({ expression: e });
// The screen, section by section: each row's key, its section, "You're here", highlighted; plus where TEES sits.
const SNAP = "JSON.stringify((function(){ var sf=document.getElementById('sf'), sec='', out={ key: document.getElementById('course-select').value, rows: [], order: [], tees: [], text: sf.innerText,"
    + " here: (HardPanCourse.near(window.__h || [0,0], 9)||[]).map(function(x){return [x.c.key, x.c.name, Math.round(x.d*100)/100];}),"
    + " notListed: !!sf.querySelector('[data-sf=fullcourse]') && /Not listed\\? Add a course/.test(sf.innerText), start: (function(){ var b=document.querySelector('[data-sf=startgps]'); return b ? { text: b.innerText, disabled: b.disabled } : null; })() };"
    + " Array.prototype.forEach.call(sf.querySelectorAll('.sf-h, [data-sf-course], [data-sf-tee]'), function(n){ if (n.classList.contains('sf-h')) { sec=n.textContent; out.order.push(sec); return; }"
    + " if (n.hasAttribute('data-sf-tee')) { out.tees.push(n.innerText.split('\\n')[0]); return; }"
    + " out.rows.push({ sec: sec, key: n.getAttribute('data-sf-course'), name: n.getAttribute('data-sf-name'), here: n.getAttribute('data-sf-here') === '1', yh: /You\\u2019re here/.test(n.innerText), sel: n.classList.contains('sf-sel'), s: (n.querySelector('.s')||{}).textContent||'' }); });"
    + " out.card = !!document.getElementById('sf-course'); return out; })())";
const SET_H = (p) => X('window.__h = [' + p[0] + ', ' + p[1] + ']; 1');
const steps0 = (p) => [
    { cdp: { method: 'Emulation.setGeolocationOverride', params: { latitude: p[0], longitude: p[1], accuracy: 10 } } },
    { cdp: { method: 'Browser.grantPermissions', params: { permissions: ['geolocation'] } } },
    { sleep: 2500 }, X("(function(){ var b=document.querySelector('[data-sf=relocate]'); if(b) b.click(); return 'relocate'; })()"),
    { waitFor: "document.querySelectorAll('#sf [data-sf-course]').length > 0 || !!document.querySelector('#sf [data-sf-playing]')", timeout: 40000 }, { sleep: 3000 }, SET_H(p), X(CARD),
    // 076 (option A): the course he is at is the PLAYING card alone; Change shows NEAR YOU (the screen checked below)
    X("(function(){ var b=document.querySelector('#sf-course [data-sf=change]'); if(b) b.click(); return 1; })()"), { sleep: 1000 }, X(SNAP)];
const CARD = "JSON.stringify({ card076: (function(){ var c=document.querySelector('#sf [data-sf-playing]'); return c ? { key: c.getAttribute('data-sf-playing'), here: c.getAttribute('data-sf-playing-here') === '1', text: c.innerText.replace(/\\n/g,' | '), rows: document.querySelectorAll('#sf [data-sf-course]').length, tees: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-tee]'), function(n){ return n.innerText.split('\\n')[0]; }) } : null; })() })";
const open = (p, more) => arriveCold({ url: fileUrl('admin.html', 'start=quick'), db: { events: {}, global_courses: GC, trips: {}, tournaments: {}, organizers: {} }, settleMs: 2500, viewport: { width: 393, height: 852 },
    preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + PHONE + "try{sessionStorage.setItem('hardpan_simple_flow','gps');}catch(e){}", steps: steps0(p).concat(more || []) });
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{' && v.indexOf('{"card076"') !== 0).map((v) => JSON.parse(v));
const CARDS = (r) => r.value.filter((v) => typeof v === 'string' && v.indexOf('{"card076"') === 0).map((v) => JSON.parse(v).card076);
const near = (s) => s.rows.filter((x) => x.sec === 'NEAR YOU');
// The position read again (as when he walks): the list is dropped and locate() runs on the redraw.
const RELOCATE = [X("(function(){ var S=HardPanSimpleFlow.state(); S.near=null; var i=document.getElementById('sf-q'); if(!i){ var cb=document.querySelector('#sf-course [data-sf=change]'); if(cb) cb.click(); i=document.getElementById('sf-q'); } i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})); return 'relocated'; })()"), { sleep: 3500 }, X(SNAP)];
// Set "last played" (this phone's last round) to a course, then redraw the screen by re-asking the position.
const LAST = (expr) => X("(function(){ var c=" + expr + "; if(!c) return 'NO COURSE'; localStorage.setItem('hardpan_last_round', JSON.stringify({ course: c[1] })); window.__last=c[0];"
    + " var i=document.getElementById('sf-q'); i.value='x'; i.dispatchEvent(new Event('input',{bubbles:true})); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})); return 'last '+c[0]; })()");

test('within 0.5 mi: NEAR YOU is the 3 closest only, the course he is at first, auto-picked, "You\'re here"; then its tees, Start Round; "Not listed?" stays', { timeout: 150000 }, async () => {
    const r = await open(AT_TS);
    assert.equal(r.ok, true, r.reason);
    const [s] = J(r), [card] = CARDS(r);
    // 076 (Manny, option A): the course he is at is first the green PLAYING card ALONE ("You're here"), its tees under it;
    // Change (box empty) shows NEAR YOU - the screen this test checked before, now without the tees under it.
    assert.ok(card && card.here && card.key === 'gapi_' + ID && card.rows === 0, '076: the PLAYING card, alone: ' + JSON.stringify(card));
    assert.deepEqual(card.tees, ['Black', 'Gold', 'Jade'], '076: its tees under the card');
    const n = near(s);
    assert.equal(n.length, 3, 'exactly 3 under NEAR YOU: ' + JSON.stringify(n));
    assert.equal(n[0].key, 'gapi_' + ID, 'the course he is at is first');
    assert.ok(n[0].here && n[0].yh && n[0].sel, 'labelled "You\'re here" and highlighted: ' + JSON.stringify(n[0]));
    assert.match(n[0].s, /^You’re here · 0\.\d mi · ✓ GPS$/, 'label, then the distance and ✓ GPS unchanged');
    assert.equal(s.key, 'gapi_' + ID, 'auto-picked');
    assert.equal(n.filter((x) => x.here).length, 1, 'one "You\'re here"');
    // the 3 are the 3 closest (the resolver's order, the one he is at first)
    const close = s.here.map((x) => x[0]), want = ['gapi_' + ID].concat(close.filter((k) => k !== 'gapi_' + ID)).slice(0, 3);
    assert.deepEqual(n.map((x) => x.key), want);
    assert.ok(s.here.length > 3, 'there were more courses nearby - they are no longer listed: ' + JSON.stringify(s.here));
    n.slice(1).forEach((x) => assert.match(x.s, /^\d+(\.\d)? mi/, 'distances still shown: ' + x.s));
    assert.deepEqual(s.order.filter((h) => h !== 'LAST PLAYED'), ['NEAR YOU'], '076: after Change, NEAR YOU (the tees are under the card) - no longer list: ' + JSON.stringify(s.order));
    assert.equal(s.card, false, 'the picked course is its highlighted row - not a second card');
    assert.ok(s.start && /Start Round/.test(s.start.text), 'Start Round');
    assert.ok(s.text.indexOf('NEAR YOU') < s.text.lastIndexOf('Not listed? Add a course'), 'order: NEAR YOU, Not listed');
    assert.equal(s.notListed, true, '"Not listed? Add a course" is still there');
});

test('farther than 0.5 mi from every course: no "You\'re here", nothing auto-picked; a course picked before stays picked', { timeout: 150000 }, async () => {
    const r = await open(AWAY, [
        X("(function(){ var b=document.querySelectorAll('#sf [data-sf-course]')[1]; if(!b) return 'NO ROW'; window.__tap=b.getAttribute('data-sf-course'); b.click(); return 'tapped'; })()"), { sleep: 1500 },
        ...RELOCATE]);
    assert.equal(r.ok, true, r.reason);
    const [s, s2] = J(r);
    assert.ok(s.here.length >= 3 && s.here[0][2] > 0.5, 'precondition: the closest course is farther than 0.5 mi: ' + JSON.stringify(s.here[0]));
    const n = near(s);
    assert.equal(n.length, 3, 'still the 3 closest: ' + JSON.stringify(n));
    assert.deepEqual(n.map((x) => x.key), s.here.slice(0, 3).map((x) => x[0]), 'closest first');
    assert.ok(!n.some((x) => x.here || x.yh), 'no "You\'re here"');
    assert.ok(!/You’re here/.test(s.text));
    assert.equal(s.key, '', 'nothing auto-picked');
    assert.ok(!s.rows.some((x) => x.sel), 'nothing highlighted');
    assert.equal(s.tees.length, 0, 'no tees until a course is picked');
    assert.equal(s.start, null, '076 (Manny): no course picked - no Start Round (it was there, off)');
    assert.equal(s.notListed, true);
    // a course picked before: the next position read keeps it
    const tapped = near(s)[1].key;
    assert.equal(s2.key, tapped, 'the course picked before stays picked: ' + s2.key);
    assert.ok(near(s2).some((x) => x.key === tapped && x.sel), 'and highlighted');
    assert.ok(!near(s2).some((x) => x.here), 'still no "You\'re here"');
});

test('LAST PLAYED: 1 course under NEAR YOU when it is not one of the 3; skipped when it is', { timeout: 150000 }, async () => {
    const r = await open(AT_TS, [
        LAST("(HardPanCourse.near(window.__h, 9)||[]).map(function(x){return [x.c.key, x.c.name];})[5]"), { sleep: 1500 }, X(SNAP),
        LAST("(HardPanCourse.near(window.__h, 9)||[]).map(function(x){return [x.c.key, x.c.name];}).filter(function(c){ return c[0] !== '" + 'gapi_' + ID + "'; })[0]"), { sleep: 1500 }, X(SNAP)]);
    assert.equal(r.ok, true, r.reason);
    const [, s, d] = J(r);
    const last = s.rows.filter((x) => x.sec === 'LAST PLAYED');
    assert.equal(last.length, 1, 'one LAST PLAYED course: ' + JSON.stringify(s.rows));
    assert.equal(last[0].key, s.here[5][0], 'the last round\'s course');
    assert.ok(!near(s).some((x) => x.key === last[0].key), 'not one of the 3');
    assert.ok(!last[0].sel, 'shown, not picked');
    assert.match(last[0].s, /\d mi/, 'with its distance');
    assert.deepEqual(s.order, ['NEAR YOU', 'LAST PLAYED'], 'NEAR YOU, LAST PLAYED (076: the tees are under the PLAYING card)');
    assert.equal(near(s).length, 3);
    // duplicate: the last round's course is one of the 3 -> no LAST PLAYED section
    assert.ok(near(d).some((x) => x.key === d.here.filter((c) => c[0] !== 'gapi_' + ID)[0][0]), 'precondition: that course is in NEAR YOU');
    assert.equal(d.rows.filter((x) => x.sec === 'LAST PLAYED').length, 0, 'skipped - already among the 3');
    assert.ok(!d.order.includes('LAST PLAYED'));
    assert.equal(near(d).length, 3);
});

test('search still finds the courses that dropped off NEAR YOU (and "Not listed? Add a course" is there)', { timeout: 150000 }, async () => {
    const r = await open(AT_TS, [
        X("(function(){ var c=(HardPanCourse.near(window.__h, 9)||[])[6]; window.__drop=c.c.key; var nm=(document.querySelector('#sf [data-sf-course]') && c.c.name)||''; var q=String(nm).split(' (')[0]; var i=document.getElementById('sf-q'); i.value=q; i.dispatchEvent(new Event('input',{bubbles:true})); return 'search '+q; })()"),
        { sleep: 1500 }, X("JSON.stringify({ drop: window.__drop, rows: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-course]'), function(b){ return b.getAttribute('data-sf-course'); }), text: document.getElementById('sf').innerText, notListed: !!document.querySelector('#sf [data-sf=fullcourse]') })"),
        X("(function(){ var b=document.querySelector('#sf [data-sf-course=\"'+window.__drop+'\"]'); if(!b) return 'NO ROW'; b.click(); return 'tapped'; })()"), { sleep: 2000 }, X(SNAP)]);
    assert.equal(r.ok, true, r.reason);
    const [s, f, after] = J(r);
    assert.ok(!near(s).some((x) => x.key === f.drop), 'precondition: that course dropped off NEAR YOU');
    assert.ok(f.rows.includes(f.drop), 'search finds it: ' + JSON.stringify(f.rows));
    assert.match(f.text, /RESULTS/);
    assert.equal(f.notListed, true, '"Not listed? Add a course" under the results too');
    assert.equal(after.key, f.drop, 'tapping it picks it');
    assert.equal(after.card, true, 'a course picked from search (in neither list) shows as the picked card above its tees');
    assert.equal(near(after).length, 0, '076: the picked course alone at the top - no NEAR YOU under it');
    assert.equal(after.notListed, false, '076: "Not listed?" sits under the results (one Change away), not under the PLAYING card');
});

test('on the far side of a big course (more than 0.5 mi from its point, next to its holes): still "You\'re here", picked; the distance shown is unchanged', { timeout: 150000 }, async () => {
    const FAR = [33.5500, -111.8640];   // ~0.8 mi from the course's point, ~0.25 mi from hole 1's tee
    const r = await open(FAR);
    assert.equal(r.ok, true, r.reason);
    const [s] = J(r);
    const n = near(s), me = s.here.filter((x) => x[0] === 'gapi_' + ID)[0];
    assert.ok(me && me[2] > 0.5, 'precondition: more than 0.5 mi from the course\'s point: ' + JSON.stringify(me));
    assert.equal(n.length, 3);
    assert.equal(n[0].key, 'gapi_' + ID, 'the course he is on is first');
    assert.ok(n[0].here && n[0].sel, '"You\'re here", picked: ' + JSON.stringify(n[0]));
    assert.match(n[0].s, /^You’re here · 0\.[6-9] mi · ✓ GPS$/, 'the distance to the course\'s point, as before: ' + n[0].s);
    assert.equal(s.key, 'gapi_' + ID);
    const [card] = CARDS(r);
    assert.ok(card && card.here, '076: the PLAYING card says "You\'re here": ' + JSON.stringify(card));
    assert.deepEqual(card.tees, ['Black', 'Gold', 'Jade']);
});
