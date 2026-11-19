// ============================================================================
// SKINS CARRYOVER DEFAULTS TO OFF (Manny 2026-11-19 8:58 AM: "skins are RARELY
// carried over. Let's always default it to no carry over"; ADVISOR-20261119-0905).
//
// tournament-prizes.js settingsOf: an event created from 2026-11-19 16:00 UTC on
// with no carryover saved plays without it. An event made before then with nothing
// saved keeps carryover on (what it has always shown, so a running event's skins
// never change under it). A saved choice always wins. A tied hole with carryover
// off is "no skin" and nothing carries (skins.js, unchanged).
//
// THE USER PATH, in mini-dom: the organizer arrives at tournament.html and opens
// the Skins card with its own Open button; a golfer reads the Skins tab. Nothing
// is called by name. FIXTURE helpers/prize-fixtures.js starkey(): Cascade hole 8
// is tied at 4 (Ana and Sam), so carryover decides whether 9 takes two skins.
//
// BASELINE (final file, 5 tests) against main 2cc44b4d (tournament-prizes.js as
// deployed): 3 PASS / 2 FAIL. A1 and A3 fail there (a new event still defaulted
// on). A2 (an old event keeps on), B1 and B2 (a saved choice wins) pass, as they
// should: they describe what does NOT change. 3 + 2 = 5. After: 5 / 0.
// NEGATIVE CONTROL: the default put back to "on for everyone" -> A1, A3 fail;
// restored by copying the saved file back (sha printed beside RESTORED-OK).
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');
const F = require('./helpers/prize-fixtures.js');
const SRC = require('fs').readFileSync(require('path').join(__dirname, 'tournament.html'), 'utf8');

const NEW = Date.UTC(2026, 10, 19, 17, 0, 0), OLD = Date.UTC(2026, 10, 18, 12, 0, 0);
const plain = (v) => JSON.parse(JSON.stringify(v));
const text = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
function arrive(rec, user) {
    const sb = loadHtmlInlineScript('tournament.html', [], { search: '?tourney=STK' });
    sb.__dbHandlers.filter((h) => h.event === 'value' && /tournaments\/STK$/.test(h.path)).forEach((h) => h.cb({ val: () => plain(rec), exists: () => true }));
    if (user) sb.__auth.setUser(user);
    return sb;
}
function ownerCard(rec) {
    const sb = arrive(rec, F.OWNER);
    const m = /<button[^>]*id="prize-skins-open"[^>]*onclick="([^"]+)"/.exec(String(sb.document.getElementById('prize-card-skins').innerHTML));
    assert.ok(m, 'positive: the Skins card has its Open button');
    vm.runInContext(m[1], sb);
    return text(sb.document.getElementById('prize-card-skins').innerHTML);
}
const ev = (createdAt, ps) => F.starkey({ createdAt, prizeSettings: Object.assign({ perSkin: 20 }, ps || {}) });

describe('A. NOTHING SAVED: the event\'s age decides', () => {
    test('A1 a new event: carryover off, Cascade 8 is "no skin" and 9 takes one skin', () => {
        const t = ownerCard(ev(NEW));
        assert.match(t, /carryover off/);
        assert.match(t, /Cascade 3 skins · Olympic 3 skins → \$120/);
        assert.doesNotMatch(t, /carried to 9/);
    });
    test('A2 an event made before the change: carryover on, as it has always shown', () => {
        const t = ownerCard(ev(OLD));
        assert.match(t, /carryover on/);
        assert.match(t, /carried to 9/);
    });
    test('A3 a golfer\'s Skins tab on a new event says no carryover', () => {
        const sb = arrive(ev(NEW), null);
        // the tap: the Skins sub-tab button's own onclick, read from the page's static markup
        const m = /id="lb-sub-skins"[^>]*onclick="([^"]+)"/.exec(SRC);
        assert.ok(m, 'positive: the Skins sub-tab exists');
        vm.runInContext(m[1], sb);
        assert.match(text(sb.document.getElementById('lb-skins-panel').innerHTML), /carryover off/);
    });
});

describe('B. A SAVED CHOICE WINS', () => {
    test('B1 a new event the organizer set to carry over: on', () => {
        assert.match(ownerCard(ev(NEW, { carryover: true })), /carryover on/);
    });
    test('B2 an old event the organizer set to off: off', () => {
        assert.match(ownerCard(ev(OLD, { carryover: false })), /carryover off/);
    });
});
