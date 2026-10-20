// ============================================================================
// URGENT-018 (helper A) - EVERY GOLFER QUICK EDIT IN PLACE (features.simpleFlow), IN REAL
// CHROME, iPhone 15 size. Stub db only. The organizer, on the card of an 8-golfer round
// (two groups of four), with the map built behind it.
//
//   1  a tap on a golfer's name on the card -> Edit golfer (a sheet): RENAME
//   2  HCP with the + key (a plus handicap)
//   3  the golfer's own TEE (p.tee, as player-tees.js reads it)
//   4  MOVE to the other group (the Players sheet's own move rule)
//   5  OUT of the round, and back in (the Players sheet's own Out keys)
//   6  Round settings > Golfers: the list -> Edit -> back to the list; + Add golfer from it
//   7  a game that needs more golfers (Add a game > Vegas on a 1-golfer round): the Add golfer
//      sheet in place, not Round Setup's Players step
// Every one: the page never navigates (one navigation entry), no setup step on the page,
// the same hole, and ONE write through the builder the Players sheet uses.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-add-golfer.js'))) { console.log('Consumer tree: no golfer sheets - skipped.'); process.exit(0); }
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const CD = makeCourseData(18);
const TEE = (name, y, r, sl) => ({ name, rating: r, slope: sl, parTotal: 72, totalYards: y, holes: CD.map((h) => ({ par: h.par, yardage: Math.round(y / 18) })) });
const TEES = { male: [TEE('Copper', 6800, 72.5, 130), TEE('Blue', 6500, 71.0, 125), TEE('White', 6187, 69.0, 118)], female: [TEE('Red', 5645, 71.4, 120)] };
const COURSES = { gca_zgkynkan: { name: 'Dobson Ranch Golf Course', data: CD, tees: TEES } };
const plain = (r) => { delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed; delete r.sideMatches; r.additionalGameInstances = {}; r.additionalGames = {}; r.gameFormat = 'stroke'; r.skinsBuyIn = 0; r.holeBetStake = 0; r.birdieGameEnabled = false; return r; };
const ROUND = (code, n, names) => plain(wizardSavedRound({ code, golfers: n, ownerUid: 'anon-cold', thru: 3, flights: false, names, courseData: CD,
    overrides: { activeCourseKey: 'gca_zgkynkan', courseName: 'Dobson Ranch Golf Course', groupSizeOverrides: n > 4 ? { 0: 4, 1: 4 } : { 0: n },
        teeRating: { teeKey: 'male:2', teeName: 'White', slope: 118, courseRating: 69.0, par: 72 }, handicapBasis: 'as-entered' } }));
const PRE = (code) => 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true })
    + "try{localStorage.setItem('golfapp_me_" + code + "','101');sessionStorage.setItem('groupPickDismissed:" + code + "','1');}catch(e){}";
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const STATE = "JSON.stringify({ url: location.pathname.split('/').pop() + location.search, hole: window.HardPanGps ? HardPanGps.hole() : null,"
    + " sheet: (document.querySelector('#hp-addg.open h2') || {}).textContent || null, steps: !!document.querySelector('.wizard-step, #sf, .sf-bar, #admin-screen'),"
    + " nav: performance.getEntriesByType('navigation').length,"
    + " players: (currentData.players || []).map(function (p) { return { id: String(p.id), name: p.name, hcp: p.hcp, tee: p.tee ? p.tee.teeName : null, out: p.out === true, money: p.playingForMoney !== false }; }), groups: currentData.groupSizeOverrides })";

function harness(code, db) {
    const o = { j: null };
    o.ev = async (x) => o.j.evaluate(x);
    o.st = async () => JSON.parse(await o.ev(STATE));
    o.click = async (sel) => { assert.ok(await o.ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.click(); return true;})()'), 'no ' + sel); await sleep(250); };
    o.type = async (sel, v) => { assert.ok(await o.ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.value=' + JSON.stringify(v) + '; e.dispatchEvent(new Event("input",{bubbles:true})); return true;})()'), 'no ' + sel); };
    o.until = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 8000)) { if (await o.ev(expr)) return true; await sleep(150); } return false; };
    o.open = async () => {
        o.j = await openJourney({ db, viewport: { width: 393, height: 852 }, webgl: true, preScript: PRE(code) });
        await o.j.goto(fileUrl('index.html', 'game=' + code), 4500);
        await o.ev("(function(){ var b=(document.querySelector('#hp-card-bet [data-hp-bar=gps]') || document.getElementById('fd-gps-btn')); if(b) b.click(); return 1; })()");
        await sleep(2500);
        await o.ev("(function(){ var b=document.querySelector('[data-hp-bar=card]') || document.querySelector('[data-hp-gpsbar=card]'); if (b) b.click(); else HardPanGps.showSide('bets'); return 1; })()");
        await sleep(800);
    };
    // A golfer's name on the card (Hole View row, else the Full Card header).
    o.tapName = async (label) => {
        const ok = await o.ev('(function(){ var L=' + JSON.stringify(label) + ';'
            + " var hv=Array.prototype.filter.call(document.querySelectorAll('.hv-player-name'), function(e){ return e.firstChild && String(e.firstChild.nodeValue).trim()===L && e.getBoundingClientRect().height>0; })[0];"
            + " var th=Array.prototype.filter.call(document.querySelectorAll('th[data-player-name]'), function(e){ return e.getAttribute('data-player-name')===L; })[0];"
            + ' var t=hv||th; if(!t) return false; t.click(); return true; })()');
        assert.ok(ok, 'no golfer name "' + label + '" on the card');
        await sleep(350);
    };
    return o;
}
// The same page, the same hole, no setup step, and the sheet closed.
function inPlace(s, s0) {
    assert.equal(s.url, s0.url, 'no navigation');
    assert.equal(s.nav, 1, 'no reload');
    assert.equal(s.steps, false, 'no setup step on the page');
    assert.equal(s.hole, s0.hole, 'the same hole');
}

describe('URGENT-018 helper A: golfer edits in place (8 golfers, two groups)', () => {
    const CODE = 'EDG018';
    const NAMES = ['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta', 'Eli Echo', 'Fay Foxtrot', 'Gus Golf', 'Hal Hotel'];
    const H = harness(CODE, { events: { [CODE]: ROUND(CODE, 8, NAMES) }, global_courses: COURSES, trips: {}, organizers: {}, tournaments: {} });
    let s0;
    before(async () => { await H.open(); s0 = await H.st(); });
    after(async () => { if (H.j) await H.j.close(); });
    const label = async (name) => H.ev("(function(){ var p=currentData.players.filter(function(x){return x.name===" + JSON.stringify(name) + ";})[0]; return golferLabel(p) || p.name; })()");

    test('a tap on a golfer\'s name on the card -> Edit golfer; RENAME saves in place', { timeout: 60000 }, async () => {
        await H.tapName(await label('Ann Alpha'));
        let s = await H.st();
        assert.equal(s.sheet, 'Edit golfer');
        inPlace(s, s0);
        assert.equal(await H.ev("document.getElementById('ag-name').value"), 'Ann Alpha');
        await H.type('#ag-name', 'Annie Alpha');
        await H.click('#hp-addg [data-ag="saveedit"]');
        assert.ok(await H.until("currentData.players.some(function(p){return p.name==='Annie Alpha';}) && !document.querySelector('#hp-addg.open')"), 'renamed and closed');
        s = await H.st();
        inPlace(s, s0);
        assert.equal(s.players.length, 8);
    });

    test('HCP with the + key: a plus handicap', { timeout: 60000 }, async () => {
        await H.tapName(await label('Ben Bravo'));
        await H.click('#hp-addg [data-ag="plus"]');
        await H.type('#ag-hcp', '1.5');
        await H.click('#hp-addg [data-ag="saveedit"]');
        assert.ok(await H.until("currentData.players.some(function(p){return p.name==='Ben Bravo' && p.hcp==='+1.5';})"), 'Ben is +1.5');
        inPlace(await H.st(), s0);
    });

    test('the golfer\'s own TEE: stored on the golfer (p.tee), the handicap as entered untouched', { timeout: 60000 }, async () => {
        const before = (await H.st()).players.filter((p) => p.name === 'Cal Charlie')[0];
        await H.tapName(await label('Cal Charlie'));
        assert.ok(await H.until("!!document.querySelector('#hp-addg [data-ag-tee=\"male:1\"]')"), 'the tee rows');
        assert.match(await H.ev("document.querySelector('#hp-addg [data-ag-tee].on').innerText"), /^White/, 'the round\'s tee is his now');
        await H.click('#hp-addg [data-ag-tee="male:1"]');
        await H.click('#hp-addg [data-ag="saveedit"]');
        assert.ok(await H.until("currentData.players.some(function(p){return p.name==='Cal Charlie' && p.tee && p.tee.teeName==='Blue';})"), 'Cal on Blue');
        const s = await H.st(), cal = s.players.filter((p) => p.name === 'Cal Charlie')[0];
        assert.equal(cal.hcp, before.hcp, 'as entered: the tee is recorded, the number stays');
        inPlace(s, s0);
        // Back to the round's tee: p.tee removed.
        await H.tapName(await label('Cal Charlie'));
        assert.match(await H.ev("document.querySelector('#hp-addg [data-ag-tee].on').innerText"), /^Blue/);
        await H.click('#hp-addg [data-ag-tee="male:2"]');
        await H.click('#hp-addg [data-ag="saveedit"]');
        assert.ok(await H.until("currentData.players.some(function(p){return p.name==='Cal Charlie' && !p.tee;})"), 'Cal back on the round\'s tee');
    });

    test('MOVE to the other group: Group 2 grows, Group 1 shrinks, in place', { timeout: 60000 }, async () => {
        await H.tapName(await label('Dee Delta'));
        await H.click('#hp-addg [data-ag-group="2"]');
        await H.click('#hp-addg [data-ag="saveedit"]');
        assert.ok(await H.until("JSON.stringify(currentData.groupSizeOverrides)==='{\"0\":3,\"1\":5}' || JSON.stringify(currentData.groupSizeOverrides)==='[3,5]'"), 'groups 3 + 5: ' + JSON.stringify((await H.st()).groups));
        const s = await H.st();
        assert.equal(s.players[7].name, 'Dee Delta', 'Dee at the end of Group 2');
        inPlace(s, s0);
    });

    test('OUT of the round (the Players sheet\'s own Out), and back in', { timeout: 60000 }, async () => {
        await H.tapName(await label('Eli Echo'));
        await H.click('#hp-addg [data-ag="out"]');
        assert.match(await H.ev("document.getElementById('hp-addg').innerText"), /scores stay/);
        await H.click('#hp-addg [data-ag="saveedit"]');
        assert.ok(await H.until("currentData.players.some(function(p){return p.name==='Eli Echo' && p.out===true && p.playingForMoney===false;})"), 'Eli out');
        inPlace(await H.st(), s0);
        await H.tapName(await label('Eli Echo'));
        await H.click('#hp-addg [data-ag="in"]');
        await H.click('#hp-addg [data-ag="saveedit"]');
        assert.ok(await H.until("currentData.players.some(function(p){return p.name==='Eli Echo' && p.out!==true && p.playingForMoney===true;})"), 'Eli back in');
    });

    test('Round settings > Golfers: the list -> Edit -> back to the list; + Add golfer from it', { timeout: 60000 }, async () => {
        assert.equal(await H.ev('HardPanAddGolfer.openGolfers()'), true);
        await sleep(300);
        assert.equal((await H.st()).sheet, 'Golfers');
        assert.equal(await H.ev("document.querySelectorAll('#hp-addg [data-ag-edit]').length"), 8);
        assert.match(await H.ev("document.getElementById('hp-addg').innerText"), /GROUP 1[\s\S]*GROUP 2/);
        const fay = await H.ev("currentData.players.filter(function(p){return p.name==='Fay Foxtrot';})[0].id");
        await H.click('#hp-addg [data-ag-edit="' + fay + '"]');
        assert.equal((await H.st()).sheet, 'Edit golfer');
        await H.type('#ag-hcp', '9');
        await H.click('#hp-addg [data-ag="saveedit"]');
        assert.ok(await H.until("currentData.players.some(function(p){return p.name==='Fay Foxtrot' && p.hcp==='9';}) && ((document.querySelector('#hp-addg.open h2')||{}).textContent==='Golfers')"), 'saved, back on the list');
        await H.click('#hp-addg [data-ag="toadd"]');
        assert.equal((await H.st()).sheet, 'Add golfer');
        await H.type('#ag-name', 'Ivy India');
        await H.type('#ag-hcp', '14');
        await H.click('#hp-addg [data-ag="save"]');
        assert.ok(await H.until("currentData.players.length===9 && ((document.querySelector('#hp-addg.open h2')||{}).textContent==='Golfers') && document.querySelectorAll('#hp-addg [data-ag-edit]').length===9"), 'added, back on the list with 9');
        await H.click('#hp-addg [data-ag="close"]');
        inPlace(await H.st(), s0);
    });
});

describe('URGENT-018 helper A: a game that needs more golfers', () => {
    const CODE = 'EDG019';
    const H = harness(CODE, { events: { [CODE]: ROUND(CODE, 1, ['Manny']) }, global_courses: COURSES, trips: {}, organizers: {}, tournaments: {} });
    let s0;
    before(async () => { await H.open(); s0 = await H.st(); });
    after(async () => { if (H.j) await H.j.close(); });

    test('Add a game > Vegas on a 1-golfer round: the Add golfer sheet in place (why it is asking), not Round Setup', { timeout: 60000 }, async () => {
        await H.ev('HardPanDoors.openAddGame()');
        await sleep(500);
        assert.ok(await H.until("!!document.querySelector('[data-ag-all=\"vegas\"]')", 4000), 'the Add a game list');
        await H.click('[data-ag-all="vegas"]');
        await sleep(400);
        const s = await H.st();
        assert.equal(s.sheet, 'Add golfer');
        inPlace(s, s0);
        assert.match(await H.ev("document.getElementById('hp-addg').innerText"), /needs 4 golfers - add 3 more/);
        await H.click('#hp-addg [data-ag="close"]');
    });
});
