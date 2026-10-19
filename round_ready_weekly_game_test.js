// ROUND READY COUNTS THE WEEKLY GAME (URGENT-009 / 013-7).
//
// A round whose money was a Weekly Game pool (moneyPool) showed "Just keeping score — no side
// games" on Round Ready: the Action list counted the format's wager, stacked games, the Birdie Game
// and side matches, and a money pool is none of those. Display only - the line reads the saved
// moneyPool; no money logic changed.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');

const sb = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js']);
const el = (id) => sb.document.getElementById(id);
const PLAYERS = [{ name: 'Ann', hcp: '2' }, { name: 'Ben', hcp: '9' }];

test('a stroke round with only a Weekly Game: Action shows it, not "Just keeping score"', () => {
    sb.renderRoundReady({ eventName: 'Mon', courseName: 'Y', players: PLAYERS, gameFormat: 'stroke',
        moneyPool: { enabled: true, buyIn: 20, kp: { amount: 40, holes: [3] }, net: { amount: 200, places: [60, 40] }, skins: { mode: 'remainder' } } });
    assert.equal(el('rr-action-box').style.display, 'block');
    assert.equal(el('rr-noaction-box').style.display, 'none');
    assert.match(el('rr-action-text').innerHTML, /\$20 Weekly Game — KP · Net · Skins/);
    assert.match(el('rr-add-action-btn').innerHTML, /1 active/);
});

test('the saved-round fixture (Weekly Game + a skins game): both lines', () => {
    const r = wizardSavedRound({ golfers: 4, flights: false });
    sb.renderRoundReady(r);
    const t = el('rr-action-text').innerHTML;
    assert.match(t, /Weekly Game/);
    assert.match(t, /Skins/);
});

test('a pool that is switched off, or absent: no line, and the plain round still says it is just keeping score', () => {
    sb.renderRoundReady({ eventName: 'Mon', courseName: 'Y', players: PLAYERS, gameFormat: 'stroke', moneyPool: { enabled: false, buyIn: 20 } });
    assert.equal(el('rr-action-box').style.display, 'none');
    assert.equal(el('rr-noaction-box').style.display, 'block');
    sb.renderRoundReady({ eventName: 'Mon', courseName: 'Y', players: PLAYERS, gameFormat: 'stroke' });
    assert.equal(el('rr-noaction-box').style.display, 'block');
    assert.doesNotMatch(el('rr-action-text').innerHTML, /Weekly Game/);
});
