// ============================================================================
// KP RULES - Starkey settings 12-13 on ONE-ROUND events (Manny 2026-11-19: "then
// KPs 12-13 (rules publish later, my OK)", "Preview only"). STRICT lane.
//
//   12  one winner a hole for the field (today) / one per flight
//   13  two marks the same: the earlier wins (today) / they share the prize
//
// Saved as prizeSettings/kps = { perFlight, ties }. One winner for the field with
// no share still writes { winner, lockedAt } exactly as before - the write the
// LIVE rules accept. A flight's winner or a shared tie writes winners/<key> and
// locks/<flight|all>, which the live rules REFUSE until the proposed rules change
// is published (outbox TOURN-...-kp-rules-PROPOSAL; tools/kp-rules-emulator-check.js
// runs these writes against the live rules and the proposal). Rounds (KPs on a
// multi-round event) are not in this file.
//
// THE USER PATH, in mini-dom: the organizer arrives at tournament.html?tourney=..
// and taps the Contests tab; a golfer arrives on their team's scoring link. Taps
// run the onclick the page rendered. No render function is called by name.
//
// BASELINE (final file, 13 tests) against preview-starkey-places 9d4a22c2 (the
// skins build, before KPs: tournament.html, tournament-contests.js,
// tournament-prizes.js, tournament-scorecard.html swapped in, restored by sha):
// 3 PASS / 10 FAIL. The 3 that pass are today's behaviour, true there by
// definition: A1 (one winner, winner + lockedAt), D2 (the earlier mark wins), E1
// (a golfer whose flight is undecided is asked). 3 + 10 = 13. After: 13 / 0.
// NEGATIVE CONTROLS (restored by copying the saved files back; contests
// 640c1dfbd25a and tournament.html 8a4d04779a2b printed beside RESTORED-OK):
//   1. perFlight ignored                           -> 5 fail, C1-C4 E2
//   2. share ignored                               -> 1 fail, D1
//   3. an old-style winner dropped on conversion   -> 1 fail, C3
//   4. a shared amount not split                   -> 1 fail, D3
//   5. the prompt ignores a flight's lock          -> 1 fail, E2
//   6. Make winner always the old write            -> 3 fail, C2 C3 D1
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const F = require('./helpers/prize-fixtures.js');

const plain = (v) => JSON.parse(JSON.stringify(v));
const TS = { '.sv': 'timestamp' };
const ORG_HTML = fs.readFileSync(path.join(REPO_ROOT, 'tournament.html'), 'utf8');
const text = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
function fire(sb, re, value) {
    const hs = sb.__dbHandlers.filter((h) => h.event === 'value' && re.test(h.path));
    assert.ok(hs.length > 0, 'no listener on ' + re);
    hs.forEach((h) => h.cb({ val: () => plain(value), exists: () => value != null }));
}
const el = (sb, id) => sb.document.getElementById(id);
const html = (sb, id) => String(el(sb, id).innerHTML || '');
function tapStr(sb, markup, pick) {
    const tags = markup.match(/<(button|span)\b[^>]*>/g) || [];
    const tag = tags.find(pick);
    assert.ok(tag, 'nothing to tap');
    const m = /\bonclick="([^"]*)"/.exec(tag);
    const ds = {};
    tag.replace(/\bdata-([a-z-]+)="([^"]*)"/g, (_, k, v) => { ds[k] = v.replace(/&amp;/g, '&'); });
    sb.__tapEl = { dataset: ds };
    return vm.runInContext('(function () { return ' + m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'") + ' }).call(__tapEl)', sb);
}
const contestWrites = (sb) => plain(sb.__dbWrites.filter((w) => /\/contests\/h\d+$/.test(w.path))).map((w) => [w.path.replace(/^tournaments\/\w+\/contests\//, ''), w.op, w.value]);

// ONE-DAY EVENT (helpers/prize-fixtures.js oneDay): A Flight Ana, Sam; B Flight Dana, Lee. Hole 7 is a KP.
const ENTRIES = { h7: {
    pS: { name: 'Sam Ortiz', team: 'pS', kind: 'kp', inches: 73, by: 'typed', at: 1 },
    pA: { name: 'Ana Diaz', team: 'pA', kind: 'kp', inches: 90, by: 'typed', at: 2 },
    pD: { name: 'Dana Ruiz', team: 'pD', kind: 'kp', inches: 50, by: 'typed', at: 3 },
    pL: { name: 'Lee Park', team: 'pL', kind: 'kp', inches: 60, by: 'typed', at: 4 } } };
function day(kps, h7) {
    const r = F.oneDay({ prizeSettings: Object.assign({ perContest: 50 }, kps ? { kps } : {}) });
    r.contests = { h7: Object.assign({ kind: 'kp', allowGps: true }, h7 || {}) };
    return r;
}
function owner(rec, entries) {
    const sb = loadHtmlInlineScript('tournament.html', [], { search: '?tourney=ONE' });
    sb.__auth.setUser(F.OWNER);
    fire(sb, /^tournaments\/ONE$/, rec);
    fire(sb, /^contestEntries\/ONE$/, entries || ENTRIES);
    tapStr(sb, ORG_HTML, (t) => /\bid="tab-btn-contests"/.test(t));
    return sb;
}
const entriesText = (sb) => text(html(sb, 'contest-entries'));
const makeWinner = (sb, key) => tapStr(sb, html(sb, 'contest-entries'), (t) => new RegExp(`data-entry="${key}"`).test(t) && /makeContestWinner/.test(t));

describe('A. THE DEFAULT STATE: one winner for the field, the earlier mark wins', () => {
    test('A1 the entries are one list, best first; Make winner writes winner + lockedAt, as the live rules accept', async () => {
        const sb = owner(day(null));
        assert.match(entriesText(sb), /^Hole 7 entries Dana Ruiz 4 ft 2 in Make winner Remove Lee Park 5 ft 0 in Make winner Remove Sam Ortiz 6 ft 1 in/);
        makeWinner(sb, 'pD');
        assert.deepEqual(contestWrites(sb), [['h7', 'update', { winner: 'pD', lockedAt: TS }]]);
    });
    test('A2 the card\'s KP sentences say so (with flights, the per-flight choice is offered)', () => {
        const t = text(html(owner(day(null)), 'prize-rules-card'));
        assert.match(t, /Closest to the pin and long drive One winner a hole for the field \. Change/);
        assert.match(t, /Two marks the same: the earlier mark wins\. Change/);
    });
});

describe('B. THE ORGANIZER\'S TAPS write the KP rule, owner only', () => {
    test('B1 One per flight and They share the prize each write one field', () => {
        const sb = owner(day(null));
        tapStr(sb, html(sb, 'prize-rules-card'), (t) => /togglePlaceRule\('kpflight'\)/.test(t));
        tapStr(sb, html(sb, 'prize-rules-card'), (t) => /setKpRule\('perFlight'/.test(t) && /data-v="yes"/.test(t));
        tapStr(sb, html(sb, 'prize-rules-card'), (t) => /togglePlaceRule\('kpties'\)/.test(t));
        tapStr(sb, html(sb, 'prize-rules-card'), (t) => /setKpRule\('ties'/.test(t) && /data-v="share"/.test(t));
        assert.deepEqual(plain(sb.__dbWrites.filter((w) => /prizeSettings\/kps/.test(w.path))).map((w) => [w.path, w.value]),
            [['tournaments/ONE/prizeSettings/kps/perFlight', true], ['tournaments/ONE/prizeSettings/kps/ties', 'share']]);
    });
    test('B2 a stranger cannot write either', () => {
        const sb = loadHtmlInlineScript('tournament.html', [], { search: '?tourney=ONE' });
        sb.__auth.setUser({ uid: 'u-who', email: 'who@example.com', isAnonymous: false });
        fire(sb, /^tournaments\/ONE$/, day(null));
        vm.runInContext("setKpRule('perFlight', 'yes'); setKpRule('ties', 'share')", sb);
        assert.deepEqual(plain(sb.__dbWrites.filter((w) => /prizeSettings\/kps/.test(w.path))), []);
    });
});

describe('C. ONE WINNER PER FLIGHT', () => {
    test('C1 the entries are listed per flight, each flight best first', () => {
        assert.match(entriesText(owner(day({ perFlight: true }))), /^Hole 7 entries A Flight Sam Ortiz 6 ft 1 in Make winner Remove Ana Diaz 7 ft 6 in Make winner Remove B Flight Dana Ruiz 4 ft 2 in Make winner Remove Lee Park 5 ft 0 in/);
    });
    test('C2 Make winner in B Flight writes winners/pD and locks only B Flight', () => {
        const sb = owner(day({ perFlight: true }));
        makeWinner(sb, 'pD');
        assert.deepEqual(contestWrites(sb), [['h7', 'update', { 'winners/pD': true, 'locks/fB': TS }]]);
    });
    test('C3 a hole already won the old way keeps that winner when another flight is decided', () => {
        const sb = owner(day({ perFlight: true }, { winner: 'pS', lockedAt: 5 }));
        makeWinner(sb, 'pD');
        assert.deepEqual(contestWrites(sb), [['h7', 'update', { winner: null, lockedAt: null, 'winners/pS': true, 'locks/fA': 5, 'winners/pD': true, 'locks/fB': TS }]]);
    });
    test('C4 a flight\'s winner shows "Winner ✓" in that flight only; the KPs card pays each flight\'s winner the full amount', () => {
        const sb = owner(day({ perFlight: true }, { winners: { pS: true, pD: true }, locks: { fA: 5, fB: 6 } }));
        assert.match(entriesText(sb), /A Flight Sam Ortiz 6 ft 1 in Winner ✓ Ana Diaz 7 ft 6 in Make winner Remove B Flight Dana Ruiz 4 ft 2 in Winner ✓ Lee Park/);
        const k = text(html(sb, 'prize-card-kps'));
        assert.match(k, /7 Sam Ortiz A Flight · closest · 6 ft 1 in \$50 credit/);
        assert.match(k, /7 Dana Ruiz B Flight · closest · 4 ft 2 in \$50 credit/);
    });
});

describe('D. A SHARED TIE', () => {
    const TIE = { h7: Object.assign({}, ENTRIES.h7, { pA: { name: 'Ana Diaz', team: 'pA', kind: 'kp', inches: 50, by: 'typed', at: 5 } }) };
    test('D1 with share on, Make winner on one of two equal marks makes both winners (one for the field)', () => {
        const sb = owner(day({ ties: 'share' }), TIE);
        makeWinner(sb, 'pD');
        assert.deepEqual(contestWrites(sb), [['h7', 'update', { 'winners/pD': true, 'winners/pA': true, 'locks/all': TS }]]);
    });
    test('D2 without share, the same tap makes only the earlier mark the winner (today\'s rule)', () => {
        const sb = owner(day(null), TIE);
        makeWinner(sb, 'pD');
        assert.deepEqual(contestWrites(sb), [['h7', 'update', { winner: 'pD', lockedAt: TS }]]);
    });
    test('D3 a shared win reads "Winner ✓ · shared" and the KPs card splits the amount: $25 each', () => {
        const sb = owner(day({ ties: 'share' }, { winners: { pD: true, pA: true }, locks: { all: 5 } }), TIE);
        assert.match(entriesText(sb), /Dana Ruiz 4 ft 2 in Winner ✓ · shared Ana Diaz 4 ft 2 in Winner ✓ · shared/);
        const k = text(html(sb, 'prize-card-kps'));
        assert.match(k, /7 Dana Ruiz closest · 4 ft 2 in · shared \$25 credit/);
        assert.match(k, /7 Ana Diaz closest · 4 ft 2 in · shared \$25 credit/);
    });
});

describe('E. THE GOLFER\'S PROMPT on a team link (team 4 in A Flight, next hole 7)', () => {
    const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 5, 3, 4, 4, 3, 4, 5];
    const COURSE = PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: i + 1 }));
    const K4 = 'a'.repeat(32);
    function teamEvent(h7, kps) {
        const scores = {}; [4, 5, 6].forEach((h) => { scores['team4_h' + h] = PARS[h - 1]; });
        return { name: 'Rattle Classic', format: 'scramble', courseName: 'Papago', courseData: COURSE, createdAt: 1, ownerUid: 'u-org', startType: 'shotgun', scores,
            flights: { fA: { id: 'fA', name: 'A Flight', createdAt: 1 }, fB: { id: 'fB', name: 'B Flight', createdAt: 2 } },
            prizeSettings: { kps: kps || { perFlight: true } },
            teams: { team4: { num: 4, name: 'Team 4', players: ['Al Lopez', 'Jo Kim'], startingHole: 4, flightId: 'fA' }, team7: { num: 7, name: 'Team 7', players: ['Dee Nguyen'], startingHole: 7, flightId: 'fB' } },
            contests: { h7: Object.assign({ kind: 'kp', allowGps: true }, h7 || {}) } };
    }
    function card(rec) {
        const sb = loadHtmlInlineScript('tournament-scorecard.html', [], { search: `?tourney=CT1&team=4&k=${K4}` });
        const make = sb.document.createElement.bind(sb.document);
        sb.document.createElement = (tag) => { const n = make(tag); if (String(tag).toLowerCase() === 'template') n.content = { querySelectorAll: () => [] }; return n; };
        fire(sb, /^tournaments\/CT1$/, rec);
        fire(sb, /^contestEntries\/CT1$/, {});
        return sb;
    }
    const shown = (sb) => ((el(sb, 'contest-prompt').style || {}).display || '') !== 'none';
    test('E1 B Flight decided on hole 7: team 4 (A Flight) is still asked', () => {
        const sb = card(teamEvent({ winners: { team7_p0: true }, locks: { fB: 5 } }));
        assert.equal(shown(sb), true);
        assert.match(text(html(sb, 'contest-prompt')), /Hole 7 · Closest to the pin/);
    });
    test('E2 A Flight decided on hole 7: team 4 is not asked', () => {
        const sb = card(teamEvent({ winners: { team4_p0: true }, locks: { fA: 5 } }));
        assert.equal(shown(sb), false);
    });
});
