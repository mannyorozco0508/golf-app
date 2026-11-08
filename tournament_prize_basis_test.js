// ============================================================================
// PRIZE RESULTS ARE THE SAME ON EVERY PHONE (audit #1, 2026-11-07) - STRICT lane
//
// THE DEFECT. tournament.html fills the prize calculator from
//     cachedLeaderboardRows = resolveLeaderboardView(currentData, lbRoundId).rows
// where lbRoundId is the board tab the VIEWER tapped. On a multi-round event a
// phone on "Round 1" and a phone on "Event" show two different prize lists for
// one event; on a multi-round TEAM event the Event tab shows "No scores yet"
// with every team posted. Section 1 reproduces that from the engine itself.
//
// THE LOGIC. resolvePrizeView(data) - tournament-engine.js - takes the data
// only (arity 1: it CANNOT take a tab or a flight). Basis = data.payoutBasis
// ('event' | round id), else the event total when the engine can compute one,
// else nothing (never a list invented from a round nobody chose).
//
// WIRED (2026-11-08, mockup A1 approved). Section 5 used to pin the unwired
// state; it was flipped deliberately and now asserts the wiring, each slice
// with a positive assertion. Section 6 is the USER PATH in mini-dom: each
// "phone" is a fresh realm fed through the page's own value listener, tabs
// are tapped by running the onclick the page rendered, and no render
// function is called by name.
//
// WHAT THIS CANNOT PROVE: layout, or anything only a browser shows (mini-dom
// does not parse static markup, so the every-phone sentence is invisible
// here). tools/tournament-prize-basis-check.js is two cold Chrome pages read
// with innerText; tools/tournament-prize-basis-rules-check.js is the owner
// write against the LIVE rules in the database emulator.
//
// WIRING WAVE COUNTS (final run of this file): 22 tests / 22 pass / 0 fail.
// BASELINE against c3b7a139 (tournament-nov7-build; tournament.html sha
// 8e7736af47183984, unwired), this file as it stands: 22 tests / 12 pass /
// 10 fail. The 12 that pass there: sections 1-4 (11, engine + payouts.js pin,
// unchanged by the wiring) and 6 "a signed-in stranger ..." (1, vacuous on the
// base: no control and no save function exist there). 11 + 1 = 12; 12 + 10 = 22.
// WIRING CONTROLS (tournament.html mutated, restored by sha 9f630bc5 each time):
//   C1 prize rows from the viewer's tab again         -> 5 fail here (+2 re-pins)
//   C2 prize render moved back into the row renderer  -> 1 fail (source pin only;
//      INERT on screen - applyManageGate re-renders the list on every snapshot)
//   C3 save without the owner check                   -> 2 fail
//   C4 unavailable basis lists rows anyway            -> 2 fail
//   C5 watcher label never shown                      -> 2 fail
//   C6 basis control shown to everyone                -> 2 fail
//   C7 no choice highlighted                          -> 1 fail
//   C8 single-round shows the control                 -> 1 fail
//   C9 every-phone sentence changed                   -> 0 fail here (static
//      markup; caught by the Chrome check, arm 1)
//
// PRE-WIRING COUNTS (logic wave, kept for the record): 12 tests / 12 pass / 0 fail.
// BASELINE against pre-build tournaments-nov7-build a838f5a0 (tournament-engine.js
// sha 3626301cf0c2a614, no resolvePrizeView): 12 tests / 4 pass / 8 fail. The 4
// that pass there are the defect reproduction (2), the payouts.js pin (1) and
// the pre-approval source pin (1) - they describe today, by design. 4 + 8 = 12.
// NEGATIVE CONTROLS (tournament-engine.js mutated, restored by sha each time):
//   C1 resolvePrizeView takes a 2nd argument as the basis (tab leaks back) -> 1 fail
//   C2 nothing saved on a team multi-round falls back to the LAST round   -> 1 fail
//   C3 a saved basis is ignored (always event)                            -> 3 fail
//   C4 a deleted saved round is not refused                               -> 1 fail
//   (engine restored by sha 2dc65c94 after each)
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const engine = loadJsFile('tournament-engine.js');
const plain = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));

const SI = [12, 8, 14, 6, 2, 16, 4, 10, 18, 15, 13, 9, 5, 7, 3, 1, 17, 11];
const CD18 = SI.map((si, i) => ({ hole: i + 1, par: 4, hcpIndex: si }));
const fill = (key, v) => { const o = {}; CD18.forEach(h => { o[`${key}_h${h.hole}`] = v; }); return o; };
const round = (id, extra) => Object.assign({
    id, name: 'Round', status: 'open', createdAt: 1, format: 'individual', scoringMode: 'gross',
    courseName: 'Test GC', courseData: CD18, courseIndexSynthetic: false, scoringGroups: {}, scores: {},
}, extra || {});

// Ann wins Round 1, Bob wins Round 2, Ann wins the event: every basis has a different 1st.
function individualTwoRounds(extra) {
    return Object.assign({
        eventModel: 'round-v1', scoringModel: 'player-v1', name: 'Club Champ', entryFee: 20,
        players: { pA: { id: 'pA', name: 'Ann', handicap: '0' }, pB: { id: 'pB', name: 'Bob', handicap: '0' } },
        rounds: {
            r1: round('r1', { name: 'Saturday', status: 'closed', createdAt: 1,
                scores: Object.assign({}, fill('pA', 3), fill('pB', 5)) }),
            r2: round('r2', { name: 'Sunday', createdAt: 2,
                scores: Object.assign({}, fill('pA', 5), fill('pB', 4)) }),
        },
    }, extra || {});
}
// Team 1 wins Round 1, Team 2 wins Round 2. The engine refuses a combined team total.
function teamTwoRounds(extra) {
    return Object.assign({
        eventModel: 'round-v1', name: 'Scramble', entryFee: 100,
        teams: { team1: { num: 1, name: 'Alpha', players: ['A', 'B'], handicap: 0 },
                 team2: { num: 2, name: 'Bravo', players: ['C', 'D'], handicap: 0 } },
        rounds: {
            r1: round('r1', { name: 'Day 1', format: 'scramble', createdAt: 1,
                scores: Object.assign({}, fill('team1', 3), fill('team2', 4)) }),
            r2: round('r2', { name: 'Day 2', format: 'scramble', createdAt: 2,
                scores: Object.assign({}, fill('team1', 5), fill('team2', 4)) }),
        },
    }, extra || {});
}
const firstName = (rows) => (rows.find(r => r.rank === 1) || {}).teamName;
const money = (rows) => plain(engine.computeTournamentPayouts(rows, [300, 100]).map(p => [p.teamName, p.amount]));

describe('1. THE DEFECT, from the engine: the tab decides the prize rows today', () => {
    test('individual: Round 1 tab and Event tab rank a different 1st', () => {
        const d = individualTwoRounds();
        assert.equal(firstName(engine.resolveLeaderboardView(d, 'r1').rows), 'Ann');
        assert.equal(firstName(engine.resolveLeaderboardView(d, 'r2').rows), 'Bob');
        assert.notDeepEqual(money(engine.resolveLeaderboardView(d, 'r2').rows),
            money(engine.resolveLeaderboardView(d, 'event').rows), 'two tabs, two prize lists');
    });
    test('team: the Event tab has no rows at all while both rounds are scored', () => {
        const d = teamTwoRounds();
        assert.equal(engine.resolveLeaderboardView(d, 'event').rows.length, 0);
        assert.ok(engine.resolveLeaderboardView(d, 'r1').rows.filter(r => r.hasScores).length === 2,
            'positive: the round rows exist, so the empty Event list is the refusal, not missing data');
    });
});

describe('2. ONE BASIS: the data decides, never the viewer', () => {
    test('resolvePrizeView takes the data only (arity 1) - it cannot be handed a tab', () => {
        assert.equal(typeof engine.resolvePrizeView, 'function');
        assert.equal(engine.resolvePrizeView.length, 1);
    });
    test('single-round: exactly the overall board (no flight), as every phone computes it', () => {
        const d = { name: 'One day', format: 'scramble', courseData: CD18,
            teams: { team1: { num: 1, name: 'Alpha', players: ['A'], handicap: 0 }, team2: { num: 2, name: 'Bravo', players: ['B'], handicap: 0 } },
            scores: Object.assign({}, fill('team1', 4), fill('team2', 5)) };
        const v = engine.resolvePrizeView(d);
        assert.equal(v.available, true);
        assert.equal(v.basis, 'single');
        assert.deepEqual(plain(v.rows), plain(engine.computeTournamentLeaderboard(d)));
        assert.equal(firstName(v.rows), 'Alpha');
    });
    test('multi-round individual, nothing saved: the event total, for both "phones"', () => {
        const d = individualTwoRounds();
        const v = engine.resolvePrizeView(d);
        assert.equal(v.basis, 'event');
        assert.deepEqual(plain(v.rows), plain(engine.computeEventStandings(d).rows));
        assert.equal(firstName(v.rows), 'Ann');
        // The phone that had "Round 2" open and the phone on "Event" now agree to the cent.
        assert.deepEqual(money(engine.resolvePrizeView(d).rows), money(engine.resolveLeaderboardView(d, "event").rows));
        assert.ok(money(v.rows).some(([, amt]) => amt === 300), 'positive: real money is on the list');
    });
    test('a saved round basis pays that round, whichever tab is open', () => {
        const d = individualTwoRounds({ payoutBasis: 'r2' });
        const v = engine.resolvePrizeView(d);
        assert.equal(v.basis, 'r2');
        assert.equal(v.title, 'Sunday');
        assert.equal(firstName(v.rows), 'Bob');
    });
    test('a saved "event" basis pays the event total', () => {
        const v = engine.resolvePrizeView(individualTwoRounds({ payoutBasis: 'event' }));
        assert.equal(v.basis, 'event');
        assert.equal(firstName(v.rows), 'Ann');
    });
});

describe('3. NEVER AN INVENTED LIST', () => {
    test('team multi-round with nothing saved: no rows and a reason, not the last round', () => {
        const v = engine.resolvePrizeView(teamTwoRounds());
        assert.equal(v.available, false);
        assert.deepEqual(plain(v.rows), []);
        assert.match(v.reason, /Choose which result the prizes are paid on/);
    });
    test('team multi-round with a saved round: that round pays (Bravo wins Day 2)', () => {
        const v = engine.resolvePrizeView(teamTwoRounds({ payoutBasis: 'r2' }));
        assert.equal(v.available, true);
        assert.equal(firstName(v.rows), 'Bravo');
    });
    test('a saved round that was deleted refuses instead of quietly paying something else', () => {
        const v = engine.resolvePrizeView(individualTwoRounds({ payoutBasis: 'gone' }));
        assert.equal(v.available, false);
        assert.deepEqual(plain(v.rows), []);
        assert.match(v.reason, /no longer part of this event/);
    });
});

describe('4. PROTECTED', () => {
    test('payouts.js is byte-identical (the allocator is not this wave)', () => {
        const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO_ROOT, 'payouts.js'))).digest('hex');
        assert.equal(sha, 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    });
});

describe('5. WIRED (A1 approved 2026-11-08; this section pinned the unwired state until then)', () => {
    const SRC = () => fs.readFileSync(path.join(REPO_ROOT, 'tournament.html'), 'utf8');
    const body = (src, sig) => {
        const at = src.indexOf(sig);
        return at < 0 ? '' : src.slice(at, src.indexOf('\n    function ', at + 30));
    };
    test('the prize renderer asks resolvePrizeView(currentData) - data only, no tab, no flight', () => {
        const fn = body(SRC(), 'function renderPayoutResults()');
        assert.ok(fn.length > 200 && /computeTournamentPayouts\(prizeRows, spotAmounts\)/.test(fn),
            'positive: the slice is the prize renderer and it pays from prizeRows');
        const m = /const prize = resolvePrizeView\(([^)]*)\);/.exec(fn);
        assert.ok(m, 'the prize renderer does not call resolvePrizeView');
        assert.equal(m[1].replace(/\s/g, ''), 'currentData||{}');
        assert.match(fn, /const prizeRows = prize\.rows/);
    });
    test('no board view feeds the prize list any more', () => {
        const src = SRC();
        const lb = body(src, 'function renderLeaderboard()');
        assert.ok(lb.length > 200 && /resolveLeaderboardView\(currentData, lbRoundId, lbFlightId\)/.test(lb),
            'positive: the slice is the board renderer');
        assert.doesNotMatch(src, /cachedLeaderboardRows/);
        assert.match(lb, /\n        \}\n        renderPayoutSpotInputs\(\);\n    \}\n/,
            'the prize list is re-rendered after the board, refused or not, as the function\'s last line');
    });
    test('an unavailable basis shows its reason and returns before any row is built', () => {
        const fn = body(SRC(), 'function renderPayoutResults()');
        const at = fn.indexOf('if (!prize.available)');
        assert.ok(at > 0, 'no refusal branch');
        const branch = fn.slice(at, fn.indexOf('return;', at) + 7);
        assert.match(branch, /escapeHtml\(prize\.reason/);
        assert.ok(at < fn.indexOf('computeTournamentPayouts('), 'the refusal must come before the allocator');
    });
    test('the save is the owner\'s, one path, event or a round that exists', () => {
        const fn = body(SRC(), 'function setPayoutBasis(');
        assert.ok(fn.length > 50 && /db\.ref\(`tournaments\/\$\{currentCode\}\/payoutBasis`\)\.set\(v\)/.test(fn),
            'positive: setPayoutBasis writes payoutBasis');
        assert.match(fn, /!canManage\(\)/);
        assert.match(fn, /v !== 'event' && !\(currentData\.rounds \|\| \{\}\)\[v\]/);
    });
});

// ============================================================================
// 6. THE USER PATH (mini-dom). Each "phone" is a fresh page realm: the record is
// handed to the page's OWN value listener, a tab is tapped by running the
// onclick the page itself rendered, and nothing here calls a render function by
// name. What this CANNOT prove: layout, or what is visible on a real screen -
// mini-dom has no layout and innerHTML is a string. That half is
// tools/tournament-prize-basis-check.js, two cold Chrome pages, innerText.
// ============================================================================
describe('6. USER PATH: every phone shows the same prize list, whatever tab it is on', () => {
    const vm = require('vm');
    const { loadHtmlInlineScript } = require('./helpers/load-script.js');
    const CODE = 'PRIZE1';
    const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
    const STRANGER = { uid: 'u-who', email: 'who@example.com', isAnonymous: false };
    const owned = (d) => Object.assign(d, { ownerUid: OWNER.uid, courseName: 'Test GC', courseData: CD18, createdAt: 1, payoutSpots: [300, 100] });
    function arrive(rec, user) {
        const sb = loadHtmlInlineScript('tournament.html', [], { search: '?tourney=' + CODE });
        sb.__dbHandlers.filter((x) => x.event === 'value' && new RegExp('tournaments/' + CODE + '$').test(x.path))
            .forEach((x) => x.cb({ val: () => JSON.parse(JSON.stringify(rec)), exists: () => true }));
        if (user) sb.__auth.setUser(user);
        return sb;
    }
    const el = (sb, id) => sb.document.getElementById(id);
    const html = (sb, id) => String(el(sb, id).innerHTML || '');
    // Tap the rendered button whose label is `label` inside #id: run ITS onclick.
    function tap(sb, id, label) {
        const re = /<button[^>]*onclick="([^"]+)"[^>]*>([^<]*)<\/button>/g;
        let m, hit = null;
        while ((m = re.exec(html(sb, id)))) if (m[2] === label) hit = m[1];
        assert.ok(hit, `no "${label}" button rendered in #${id}`);
        vm.runInContext(hit, sb);
    }

    test('nothing saved: the phone on "Sunday" and the phone on "Event" show the same money', () => {
        const a = arrive(owned(individualTwoRounds()), null);
        const b = arrive(owned(individualTwoRounds()), null);
        const boardBefore = html(a, 'leaderboard-list');
        tap(a, 'lb-round-filter', 'Sunday');
        assert.notEqual(html(a, 'leaderboard-list'), boardBefore, 'positive: the tab tap really moved phone A\'s board');
        assert.notEqual(html(a, 'leaderboard-list'), html(b, 'leaderboard-list'), 'positive: the two boards differ');
        assert.equal(html(a, 'payout-results'), html(b, 'payout-results'), 'two phones, two prize lists');
        assert.match(html(b, 'payout-results'), /1st — Ann<\/span><span class="val-pos">\$300\.00/, 'positive: money is on the list');
    });
    test('a watcher sees "Paid on Event total" and the every-phone note, no control', () => {
        const sb = arrive(owned(individualTwoRounds()), null);
        assert.equal(el(sb, 'payout-basis-label').style.display, 'block');
        assert.equal(html(sb, 'payout-basis-label'), 'Paid on <b>Event total</b>');
        assert.equal(el(sb, 'payout-basis-note').style.display, 'block');
        assert.equal(el(sb, 'payout-basis-control').style.display, 'none');
        assert.equal(html(sb, 'payout-basis-control'), '');
    });
    test('saved on Sunday: both phones pay Sunday (Bob), and say so, whichever tab is open', () => {
        const rec = () => owned(individualTwoRounds({ payoutBasis: 'r2' }));
        const a = arrive(rec(), null), b = arrive(rec(), null);
        tap(a, 'lb-round-filter', 'Saturday');
        assert.equal(html(a, 'payout-results'), html(b, 'payout-results'));
        assert.match(html(a, 'payout-results'), /1st — Bob<\/span><span class="val-pos">\$300\.00/);
        assert.equal(html(a, 'payout-basis-label'), 'Paid on <b>Sunday</b>');
    });
    test('team event, nothing saved: the reason, never a list', () => {
        const sb = arrive(owned(teamTwoRounds()), null);
        assert.match(html(sb, 'payout-results'), /Choose which result the prizes are paid on\./);
        assert.doesNotMatch(html(sb, 'payout-results'), /\$\d/);
        assert.equal(el(sb, 'payout-basis-label').style.display, 'none');
        tap(sb, 'lb-round-filter', 'Day 1');
        assert.doesNotMatch(html(sb, 'payout-results'), /\$\d/, 'tapping a round must not invent a list');
    });
    test('the organizer sees "Results are paid on" with every choice, and a tap saves payoutBasis', () => {
        const sb = arrive(owned(individualTwoRounds()), OWNER);
        const ctl = html(sb, 'payout-basis-control');
        assert.equal(el(sb, 'payout-basis-control').style.display, 'block');
        assert.match(ctl, /Results are paid on/);
        assert.match(ctl, /class="on"[^>]*>Event total</, 'nothing saved and the event total computes: Event total is on');
        assert.deepEqual((ctl.match(/>([^<>]+)<\/button>/g) || []).map((x) => x.slice(1, -9)), ['Event total', 'Saturday', 'Sunday']);
        tap(sb, 'payout-basis-control', 'Sunday');
        const w = sb.__dbWrites.filter((x) => /payoutBasis/.test(x.path));
        assert.deepEqual(plain(w), [{ path: 'tournaments/PRIZE1/payoutBasis', op: 'set', value: 'r2' }]);
    });
    test('a signed-in stranger gets no control, and the save refuses them', () => {
        const sb = arrive(owned(individualTwoRounds()), STRANGER);
        assert.equal(html(sb, 'payout-basis-control'), '');
        assert.match(html(sb, 'payout-results'), /\$300\.00/, 'positive: the stranger still sees the prize list');
        try { vm.runInContext("setPayoutBasis('r2')", sb); } catch (e) { /* no such function is also no write */ }
        assert.deepEqual(sb.__dbWrites.filter((x) => /payoutBasis/.test(x.path)), []);
    });
    test('single-round event: no control, label or note - and the list still pays', () => {
        const d = owned({ name: 'One day', format: 'scramble',
            teams: { team1: { num: 1, name: 'Alpha', players: ['A'], handicap: 0 }, team2: { num: 2, name: 'Bravo', players: ['B'], handicap: 0 } },
            scores: Object.assign({}, fill('team1', 4), fill('team2', 5)) });
        const sb = arrive(d, OWNER);
        ['payout-basis-control', 'payout-basis-label', 'payout-basis-note'].forEach((id) =>
            assert.equal(el(sb, id).style.display, 'none', id + ' is showing on a single-round event'));
        const w = arrive(d, null);
        assert.match(html(w, 'payout-results'), /1st — Alpha<\/span><span class="val-pos">\$300\.00/);
    });
});

