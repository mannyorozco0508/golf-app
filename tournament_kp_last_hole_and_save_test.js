// ============================================================================
// CLOSEST TO THE PIN: THE LAST HOLE, AND A MARK THAT NEVER DROPS SILENTLY
// (Home Course readiness sim 2026-11-20; ADVISOR go 2026-11-20 "Go on both KP fixes (preview only)").
//
// 1. THE LAST HOLE. A shotgun group that starts on 7 finishes on 6. When the last hole
//    in a card's play order is a contest hole, the prompt used to vanish when the last
//    score went in (the card has no next hole). It now stays until the golfers enter or
//    tap "Not on the green". A group mid-round still sees its next hole.
// 2. A SAVED MARK IS READ BACK. After the write is acknowledged the card reads the
//    entry's own path. Missing or different: it sends once more, then shows
//    "Not saved yet - tap to retry", and the chip says "not saved yet" instead of a tick.
//    No answer in 8 s (no signal) shows the same retry button.
//
// THE USER PATH, in mini-dom: the golfer opens their group or team link
// (?tourney=..&group=..&k=.. / &team=..), the page's own listeners fire with the event
// and its entries, and every tap runs the onclick the page rendered. No page function
// is called by name. The read-back is the harness's once(): it answers from
// sandbox.__dbReads, so "stored" and "missing" are both set by the test.
// WHAT THE HARNESS CANNOT PROVE: whether a real database client answers that read
// from its own cache. In a browser it may; the read then catches a mark missing or
// different after the acknowledgement, not a server that misreported one.
//
// BASELINE (final file, 9 tests) against main 3eb7bf77 (tournament-scorecard.html sha 69217b2b0a68, swapped in
// and restored by sha 3253da895a68 RESTORED-OK): 3 PASS / 6 FAIL. L1, L2, L4 (no last-hole prompt to see or skip)
// and S2, S3, S4 (no read-back) fail. L3 (mid-round, the next hole), S1 (a stored mark says Saved after one write)
// and S5 (a refused write is not retried) pass, as they should: they describe what does not change. 3 + 6 = 9.
// After: 9 / 0.
// CONTROLS (each restored by copying the saved file back, sha 3253da895a68 RESTORED-OK every time):
//   C1 no last-hole candidate          -> L1 L2 L4 fail (6 / 3)
//   C2 the read-back always says yes   -> S2 S3 S4 fail (6 / 3)
//   C3 no automatic resend             -> S2 S4 fail    (7 / 2)
//   C4 a pending mark does not hold the prompt -> S3 fails (8 / 1)
//   C5 a refused write treated as no signal    -> S5 fails (8 / 1)
// NOT PROVED HERE: the 8-second "no answer" path (CONTEST_SLOW_MS). mini-dom has no clock to advance; the
// Home Course sim's offline group exercises a held write in Chrome.
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

const CARD = 'tournament-scorecard.html';
const PARS = [4, 4, 4, 3, 5, 3, 4, 5, 4, 5, 4, 3, 4, 3, 4, 5, 4, 4];   // The Home Course: 4, 6, 12, 14 are par 3s
const COURSE = PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: i + 1 }));
const K = 'b'.repeat(32);
const clone = (o) => JSON.parse(JSON.stringify(o));
const settle = async (n) => { for (let i = 0; i < (n || 6); i++) await new Promise((r) => setImmediate(r)); };

// Group 7 starts on hole 7, so its play order is 7..18, 1..6 and its last hole is 6.
function groupEvent(o) {
    const players = { p25: { id: 'p25', name: 'Gabe Tate', handicap: '8', addedAt: 1 }, p26: { id: 'p26', name: 'Hope Ray', handicap: '16', addedAt: 2 } };
    const scores = {};
    const played = (o && o.played) || [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6];
    played.forEach((h) => { scores['p25_h' + h] = PARS[h - 1]; scores['p26_h' + h] = PARS[h - 1] + 1; });
    return Object.assign({ name: 'Home Course Invitational', format: 'individual', scoringModel: 'player-v1', courseName: 'The Home Course',
        courseData: COURSE, createdAt: 1, ownerUid: 'u-org', startType: 'shotgun', players, scores,
        scoringGroups: { g07: { name: 'Group 7', startingHole: '7', playerIds: ['p25', 'p26'], createdAt: 1 } },
        contests: { h4: { kind: 'kp' }, h6: { kind: 'kp' } } }, (o && o.rec) || {});
}
// A team card on its first contest hole (team 2 starts on 1, has played 1-3; next is 4).
function teamEvent() {
    const scores = {}; [1, 2, 3].forEach((h) => { scores['team2_h' + h] = PARS[h - 1]; });
    return { name: 'Home Course Scramble', format: 'scramble', courseName: 'The Home Course', courseData: COURSE, createdAt: 1, ownerUid: 'u-org',
        startType: 'shotgun', scores, teams: { team2: { num: 2, name: 'Team 2', players: ['Al Lopez', 'Jo Kim'], startingHole: 1 } },
        contests: { h4: { kind: 'kp' } } };
}
function fire(sb, re, value) {
    const hs = sb.__dbHandlers.filter((h) => h.event === 'value' && re.test(h.path));
    assert.ok(hs.length > 0, 'the page registered no listener on ' + re);
    hs.forEach((h) => h.cb({ val: () => clone(value), exists: () => value != null }));
}
function arrive(rec, search, entries) {
    const sb = loadHtmlInlineScript(CARD, [], { search });
    const make = sb.document.createElement.bind(sb.document);
    sb.document.createElement = (tag) => { const n = make(tag); if (String(tag).toLowerCase() === 'template') n.content = { querySelectorAll: () => [] }; return n; };
    fire(sb, /^tournaments\/HC1$/, rec);
    fire(sb, /^contestEntries\/HC1$/, entries || {});
    return sb;
}
const groupCard = (o, entries) => arrive(groupEvent(o), `?tourney=HC1&group=g07&k=${K}`, entries);
const el = (sb, id) => sb.document.getElementById(id);
const shown = (sb) => ((el(sb, 'contest-prompt').style || {}).display || '') !== 'none';
const html = (sb) => String(el(sb, 'contest-prompt').innerHTML || '');
const plain = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
function tap(sb, pick) {
    const tag = (html(sb).match(/<(button|span|a)\b[^>]*>/g) || []).find(pick);
    assert.ok(tag, 'nothing to tap');
    const m = /\bonclick="([^"]*)"/.exec(tag);
    assert.ok(m, 'no onclick: ' + tag);
    const ds = {}; tag.replace(/\bdata-([a-z-]+)="([^"]*)"/g, (_, k, v) => { ds[k] = v; });
    sb.__tapEl = { dataset: ds };
    return vm.runInContext('(function () { return ' + m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'") + ' }).call(__tapEl)', sb);
}
const byId = (id) => (t) => new RegExp('\\bid="' + id + '"').test(t);
const entryWrites = (sb) => sb.__dbWrites.filter((w) => w.op === 'update' && w.value && Object.keys(w.value).some((k) => /^contestEntries\//.test(k)));
// Pick a golfer, type a distance, tap Save: the golfer's own taps.
function enter(sb, entry, ft, inch) {
    tap(sb, (t) => new RegExp('data-entry="' + entry + '"').test(t));
    el(sb, 'cp-ft').value = ft; el(sb, 'cp-in').value = inch;
    tap(sb, byId('cp-save'));
}
const stored = (inches, name) => ({ name, team: 'p25', kind: 'kp', inches, by: 'typed', at: 1 });

describe('L. THE LAST HOLE PLAYED IS A CONTEST HOLE', () => {
    test('L1 a shotgun group that finished on hole 6 (a KP hole) still gets the hole-6 prompt', () => {
        const sb = groupCard();
        assert.equal(shown(sb), true, 'the prompt shows');
        assert.match(plain(html(sb)), /Hole 6 · Closest to the pin/);
        assert.match(html(sb), /data-entry="p25"/, 'positive: Gabe can be picked');
    });
    test('L2 one golfer has entered: the prompt stays for the other; both entered: it goes', () => {
        const one = groupCard(undefined, { h6: { p25: stored(40, 'Gabe Tate') } });
        assert.equal(shown(one), true);
        assert.match(html(one), /data-entry="p26"/, 'Hope can still enter');
        const both = groupCard(undefined, { h6: { p25: stored(40, 'Gabe Tate'), p26: Object.assign(stored(90, 'Hope Ray'), { team: 'p26' }) } });
        assert.equal(shown(both), false, 'all entered');
    });
    test('L3 a group still mid-round is on its next hole, not its last: thru 3, the prompt is hole 4, never hole 6', () => {
        const sb = groupCard({ played: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3] });
        assert.match(plain(html(sb)), /Hole 4 · Closest to the pin/, 'positive: the next hole');
        assert.doesNotMatch(plain(html(sb)), /Hole 6/);
    });
    test('L4 "Not on the green" on the last hole: the prompt goes and stays gone', () => {
        const sb = groupCard();
        assert.match(plain(html(sb)), /Hole 6/, 'positive');
        tap(sb, byId('cp-skip'));
        assert.equal(shown(sb), false);
        fire(sb, /^contestEntries\/HC1$/, {});
        assert.equal(shown(sb), false, 'a later snapshot does not bring it back');
    });
});

describe('S. A SAVED MARK IS READ BACK', () => {
    test('S1 stored: one write, the read-back finds it, "✓ Saved"', async () => {
        const sb = groupCard({ played: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4] });
        assert.match(plain(html(sb)), /Hole 4 · Closest to the pin/, 'positive: hole 4 (just played) is the prompt');
        sb.__dbReads = { 'contestEntries/HC1/h4/p25': stored(100, 'Gabe Tate') };
        enter(sb, 'p25', '8', '4');
        await settle();
        assert.equal(entryWrites(sb).length, 1, 'one write');
        assert.match(plain(html(sb)), /✓ Saved: Gabe 8 ft 4 in/);
    });
    test('S2 missing after the write: sent once more, then "Not saved yet - tap to retry"; never "Saved"', async () => {
        const sb = groupCard({ played: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4] });
        sb.__dbReads = {};
        enter(sb, 'p25', '8', '4');
        await settle();
        assert.equal(entryWrites(sb).length, 2, 'the first send and one retry');
        const t = plain(html(sb));
        assert.match(t, /Not saved yet - tap to retry/);
        assert.doesNotMatch(t, /Saved:/);
        assert.match(html(sb), /id="cp-retry"/, 'the message is a button');
    });
    test('S3 the local copy shows the mark but the read does not: the chip says "not saved yet", not a tick, and the prompt stays', async () => {
        const sb = groupCard({ played: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4] });
        sb.__dbReads = {};
        enter(sb, 'p25', '8', '4');
        await settle();
        fire(sb, /^contestEntries\/HC1$/, { h4: { p25: stored(100, 'Gabe Tate'), p26: Object.assign(stored(90, 'Hope Ray'), { team: 'p26' }) } });
        assert.equal(shown(sb), true, 'the prompt stays although both golfers appear entered');
        const t = plain(html(sb));
        assert.match(t, /Gabe · 8 ft 4 in · not saved yet/);
        assert.doesNotMatch(t, /Gabe ✓/);
    });
    test('S4 tap retry once it is stored: a third write, then "✓ Saved", and the prompt moves on', async () => {
        const sb = groupCard({ played: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4] });
        sb.__dbReads = {};
        enter(sb, 'p25', '8', '4');
        await settle();
        sb.__dbReads = { 'contestEntries/HC1/h4/p25': stored(100, 'Gabe Tate') };
        tap(sb, byId('cp-retry'));
        await settle();
        assert.equal(entryWrites(sb).length, 3);
        assert.match(plain(html(sb)), /✓ Saved: Gabe 8 ft 4 in/);
    });
    test('S5 a refused write is not retried and keeps its own sentence', async () => {
        const sb = arrive(teamEvent(), `?tourney=HC1&team=2&k=${K}`, {});
        assert.match(plain(html(sb)), /Hole 4 · Closest to the pin/, 'positive: the team card is on hole 4');
        sb.__dbRefuse = () => Object.assign(new Error('denied'), { code: 'PERMISSION_DENIED' });
        enter(sb, 'team2_p0', '3', '1');
        await settle();
        assert.equal(entryWrites(sb).length, 1, 'no retry');
        assert.match(plain(html(sb)), /Not saved — this link can't enter for this card/);
        assert.doesNotMatch(html(sb), /id="cp-retry"/);
    });
});
