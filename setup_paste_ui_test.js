// ============================================================================
// PASTE THE WHOLE TRIP / ROUND - drafts and the pages (setup-paste-ui.js + glue).
// What the existing flows are fed must be what THEIR parsers read; a day's draft
// puts one 1v1 Nassau in Round Setup and the rest on Side Matches; Build Trip's
// codes find their days; nothing in the glue saves or writes the database.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'setup-paste-ui.js'));
const skip = ON ? false : 'Consumer tree: no HardPan paste';
const I = require('./trip-itinerary.js');
Object.assign(global, { tripItinParseLine: I.tripItinParseLine, tripItinTime: I.tripItinTime, tripItinCourse: I.tripItinCourse });
const P = require('./trip-setup-paste.js');
const R = require('./roster-paste.js');
function ui() {
    const store = {};
    global.window = { localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } };
    delete require.cache[require.resolve('./setup-paste-ui.js')];
    return { S: require('./setup-paste-ui.js'), store };
}
const TRIP = `Tue 10/13 Caledonia 8:24
Foursome A: Manny 8 & Jimmy 11 vs Paul 3.5 & Marty 9
Foursome B: Lance 14, Ben 6, Cal 12, Dee 20 - skins $2 carry
games: $5 nassau
Thu 10/15 Thistle (McKay/Cameron) 10:00 - wolf $1 everyone`;

test('the itinerary box gets lines its OWN parser reads back: dates, courses, 27-hole nines, tee times', { skip }, () => {
    const { S } = ui();
    const plan = P.parseSetupPaste(TRIP, { year: 2026 });
    const text = S.itineraryText({ days: plan.days });
    const back = I.tripItinParse(text, { year: 2026 });
    assert.deepEqual(back.map((r) => [r.date, r.time, r.courseName, r.nines || null]), [['2026-10-13', '08:24', 'Caledonia', null], ['2026-10-15', '10:00', 'Thistle', ['McKay', 'Cameron']]]);
});

test('the golfers box gets a roster the roster parser reads back: groups, handicaps', { skip }, () => {
    const { S } = ui();
    const d = P.parseSetupPaste(TRIP, { year: 2026 }).days[0];
    const back = R.parsePlayerPasteText(S.rosterText(d));
    assert.deepEqual(back.groups, [4, 4]);
    assert.deepEqual(back.validPlayers.map((p) => p.name + ' ' + p.hcp), ['Manny 8', 'Jimmy 11', 'Paul 3.5', 'Marty 9', 'Lance 14', 'Ben 6', 'Cal 12', 'Dee 20']);
});

test('a day\'s draft: Round Setup takes ONE 1v1 Nassau; team vs team and the other foursomes go to Side Matches; Skins with its golfers', { skip }, () => {
    const { S } = ui();
    const d = P.parseSetupPaste(TRIP, { year: 2026 }).days[0];
    d.groups[0].nassau = S.nassauSides(d.groups[0]);
    d.groups[1].nassau = { a: ['Lance', 'Ben'], b: ['Cal', 'Dee'], how: 'picked' };
    const dr = S.dayDraft(d);
    assert.equal(dr.nassau, null, 'no 1v1 here');
    assert.deepEqual(dr.bets.map((b) => [b.group, b.a, b.b, b.front]), [['Foursome A', ['Manny', 'Jimmy'], ['Paul', 'Marty'], 5], ['Foursome B', ['Lance', 'Ben'], ['Cal', 'Dee'], 5]]);
    assert.deepEqual(dr.skins, [{ amount: 2, carry: true, players: ['Lance', 'Ben', 'Cal', 'Dee'] }]);
    const one = P.parseSetupPaste('Manny 8 vs Jimmy 11 $5 nassau press', { year: 2026 }).days[0];
    one.groups[0].nassau = S.nassauSides(one.groups[0]);
    const d1 = S.dayDraft(one);
    assert.deepEqual([d1.nassau.a, d1.nassau.b, d1.nassau.press, d1.bets.length], [['Manny'], ['Jimmy'], 'manual', 0], '1v1 -> Round Setup');
    const w = S.dayDraft(P.parseSetupPaste(TRIP, { year: 2026 }).days[1]);
    assert.deepEqual(w.format, { type: 'wolf', label: 'Wolf', perPoint: 1 });
});

test('Build Trip\'s round codes find their days (date + tee time), on this phone; the pending list is cleared', { skip }, () => {
    const { S, store } = ui();
    const plan = P.parseSetupPaste(TRIP, { year: 2026 });
    S.savePending({ days: plan.days });
    const n = S.bindCodes([{ teeDate: '2026-10-15', teeClock: '10:00' }, { teeDate: '2026-10-13', teeClock: '08:24' }], ['CODE15', 'CODE13']);
    assert.equal(n, 2);
    assert.equal(S.draftFor('CODE13').courseName, 'Caledonia');
    assert.equal(S.draftFor('CODE15').format.type, 'wolf');
    assert.equal(store.hardpan_paste_pending_v1, undefined);
    S.queueBets('CODE13', [{ a: ['A'], b: ['B'] }]);
    assert.equal(S.betsFor('CODE13').length, 1);
    S.setBets('CODE13', []);
    assert.equal(S.betsFor('CODE13').length, 0);
});

test('the pages: HardPan-only blocks; Build Trip binds the codes; nothing in the glue saves a round or writes the database', { skip }, () => {
    const flag = require('./tools/gps-flag.js');
    const t = read('trip.html'), a = read('admin.html'), sm = read('sidematches.html');
    assert.ok(/roundCodes\.push\(await issueUniqueCode[\s\S]{0,200}\/\/ GPS:BEGIN[\s\S]{0,200}HardPanSetupPaste\.bindCodes\(roundConfigs, roundCodes\)/.test(t));
    [['trip.html', t, /spTrip|setup-paste/], ['admin.html', a, /spDraft|spRound|spArrive|setup-paste/], ['sidematches.html', sm, /spBets|spFillBet|setup-paste/]].forEach(([f, src, re]) => {
        assert.ok(re.test(src), f + ': positive');
        assert.ok(!re.test(flag.applyFlag(src, false, f)), f + ': none of it in the Consumer app');
    });
    const glue = a.slice(a.indexOf('let spPendingMoney'), a.indexOf('// NOTHING FROM THE PREVIOUS FORMAT'))
        + sm.slice(sm.indexOf('function spBetsOffer'), sm.indexOf('function openSideMatchModal'))
        + t.slice(t.indexOf('function spTripRead'), t.indexOf('function applyItinerary'));
    assert.ok(glue.length > 3000, 'positive: the glue was found');
    assert.ok(!/db\.ref|\.update\(|saveSideMatch\(|saveRound|commitRound|wizardSave/.test(glue), 'fills the screens; the organizer saves');
    assert.ok(/appendPlayerFrom\(p, false, all\.length\)/.test(a) && /captureCurrentPlayerInputs\(\)/.test(a), 'a trip round keeps each golfer\'s row (and id)');
});
