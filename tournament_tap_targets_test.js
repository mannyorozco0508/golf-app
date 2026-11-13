// TAP TARGETS ON THE ORGANIZER PAGE, bug-hunt #14 (2026-11-12, Manny OK): every
// small control the hunt measured gets a hit area of at least 44 x 32 CSS px,
// by padding or a hit extension, with the look as it was. Measured the way an
// organizer reaches each one: arrive cold as the owner (tools/lib/cold-arrival.js,
// stand-in database, real headless Chrome) at 390x844, tap Setup, scroll to the
// control, tap a chip to open the move sheet, tap Edit on a team under four,
// tap Contests. No page function is called.
//
// mini-dom cannot prove any of this: getBoundingClientRect() is all zeros
// there. Only Chrome measures a hit area.
//
//  1 the walk finds every control VISIBLE (positive: n >= 1 for each) and each
//    measures width >= 44 and height >= 32:
//      start-type labels (Tee Time, Shotgun), the start-type toggle, a golfer
//      chip, the Sign out link, a flight's delete x, a sponsor's x, + Add golfer
//      (edit names), the move sheet's close x, the start-links QR and Send
//      buttons, the Contests tab's GPS toggle
//  2 the team card's Why? on tournament-scorecard.html (golfer, iPhone width)
//  3 money = base
//
// Baseline against main 5041dd9b (tournament.html + tournament-scorecard.html
// swapped in by cp, restored by sha): all 3 tests: 1 PASS / 2 FAIL (tests 1
// and 2: every control found, all twelve under 32 px tall). With the
// build on preview-bug14: 3 PASS / 0 FAIL.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const F = require('./helpers/app-card-fixtures.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const MIN_W = 44, MIN_H = 32;
function ownerDb() {
    const db = F.scrambleDb({ ownerUid: 'u-org' });
    db.tournaments.SCR.sponsors = { event: { name: 'Desert Ridge Auto' }, holes: { '7': { name: 'Sun Devil Dental' } } };
    db.tournaments.SCR.flights = { fX: { id: 'fX', name: 'X Flight', createdAt: 1 } };   // no teams in it: delete enabled
    db.payments = { allowedOwners: { 'u-org': true } };
    db.tournamentKeys = { SCR: { on: true, t: { team1: F.KEY4, team2: F.KEY4, team3: F.KEY4, team4: F.KEY4, team5: F.KEY4 } } };
    return db;
}
// The hit area is the element's own box; a ::before extension that reaches past
// the box is not counted here, so a pass means the box itself is big enough.
const R = (label, sel) => ({ expression: `(function(){ var els=[].slice.call(document.querySelectorAll(${JSON.stringify(sel)})).filter(function(e){ var r=e.getBoundingClientRect(); return r.width>0&&r.height>0; }); var e=els[0]; if(!e) return JSON.stringify({label:${JSON.stringify(label)}, n:0}); var r=e.getBoundingClientRect(); return JSON.stringify({label:${JSON.stringify(label)}, w:Math.round(r.width*10)/10, h:Math.round(r.height*10)/10, n:els.length}); })()` });
const sc = (sel) => ({ expression: `(function(){ var e=document.querySelector(${JSON.stringify(sel)}); if(e) e.scrollIntoView({block:'center'}); return !!e; })()` });
const parse = (r) => (r.value || []).filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));

test('1 the organizer page: every named control found, each at least 44 x 32', async () => {
    const steps = [
        { tap: '#tab-btn-setup' }, { sleep: 400 },
        sc('#start-type-label-normal'), R('start-type label Tee Time', '#start-type-label-normal'), R('start-type label Shotgun', '#start-type-label-shotgun'), R('start-type toggle', 'label.toggle-switch:has(#start-type-switch)'),   // the label takes the tap; the 24 px slider inside is the look
        sc('.golfer-chip'), R('golfer chip', '.golfer-chip'),
        sc('#signed-in-as-setup, #signed-in-as'), R('Sign out link', '#signed-in-as a, #signed-in-as-setup a'),
        sc('#flights-list'), R('flight delete x', '.flight-del'),
        sc('#sponsors-setup'), R('sponsor x', '.sp-x'),
        sc('#start-links-list'), R('start-links QR button', '#start-links-list .sl-qr'), R('start-links Send button', '#start-links-list .sl-send'),
        // Edit on a team under four golfers (the fixture's Team 1), the way the organizer taps it.
        { tap: '.team-edit[data-team="1"]' }, { sleep: 300 }, R('+ Add golfer', '#te-add'),
        { tap: '.golfer-chip' }, { sleep: 300 }, R('move-sheet close x', '#move-sheet .close-modal'),
        { tap: '#move-sheet .close-modal' }, { sleep: 200 },
        { tap: '#tab-btn-contests' }, { sleep: 400 }, sc('#contest-gps-toggle'), R('contest GPS toggle', '#contest-gps-toggle')
    ];
    const r = await arriveCold({ url: fileUrl('tournament.html', 'tourney=SCR'), db: ownerDb(), auth: OWNER, viewport: { width: 390, height: 844 }, settleMs: 3500, steps });
    assert.ok(r.ok, r.reason);
    const rows = parse(r);
    assert.equal(rows.length, 12, 'twelve controls measured');
    const small = [];
    rows.forEach((o) => {
        assert.ok(o.n >= 1, 'positive: ' + o.label + ' is on screen');
        if (!(o.w >= MIN_W && o.h >= MIN_H)) small.push(o.label + ' ' + o.w + 'x' + o.h);
    });
    assert.deepEqual(small, [], 'under 44 x 32: ' + small.join(', '));
});

test('2 the team card\'s Why? (golfer, 390 wide)', async () => {
    const db = Object.assign(F.scrambleDb({ ownerUid: 'u-org' }), { tournamentKeys: { SCR: { on: true, t: { team4: F.KEY4 } } } });
    const r = await arriveCold({ url: fileUrl('tournament-scorecard.html', 'tourney=SCR&team=4&k=' + F.KEY4), db, auth: { uid: 'u-golfer', isAnonymous: true }, viewport: { width: 390, height: 844 }, settleMs: 3000, steps: [R('card Why?', '#getapp-why')] });
    assert.ok(r.ok, r.reason);
    const [o] = parse(r);
    assert.ok(o.n >= 1, 'positive: Why? is on screen');
    assert.ok(o.w >= MIN_W && o.h >= MIN_H, 'Why? hit area ' + o.w + 'x' + o.h);
});

test('3 money = base', () => {
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
    assert.equal(sha('payouts.js'), 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    assert.equal(sha('tournament-engine.js'), '1c659c46d0f91ca3dc61beb231e1356ea0a572fd7c3c40399399d36e2ff89f57');
    assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b83a10491e822ece946203d2bbb11264962e7d888a7b450f17');
});
