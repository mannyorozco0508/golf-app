// ============================================================================
// THE CARD AND BOARD TABS' SKINS LEDGERS FOLLOW THE RECEIPT (v137).
// index.html (the live skins panel + the live KP status) and leaderboard.html
// (the LIVE SKINS board). Presentation only.
//
// THE RULES, the Receipt's (v136):
//   1. "Hole 7", never "H7".
//   2. NO CARRY: only the holes that paid a skin are rows.
//      CARRY: the tied holes are part of the money - a run is one compact
//      line in the Receipt's own wording ("Holes 2–4 — Tied — carried to
//      Hole 5", a single one "Hole 6 — Tied at Gross 4 — carried to Hole 7",
//      "carried, not won" at the end), and the collecting row says
//      "collects N skins (Holes a–b)". Mid-round a run is "carried to" the
//      hole still waiting.
//   3. WAITING rows stay - "waiting on Group 3" is live information.
//   4. A panel or flight with nothing won still says so.
//
// THE PROOF, the way v136 proved the Receipt: card_skins_prev.fixture.json
// holds the tag-stripped text of index.liveMount and leaderboard.liveSkins
// for the six golden rounds (live_skins x3, pool_flights x3) as captured at
// 2751857 (v136). The old text with its tie rows removed and "H" -> "Hole "
// must equal today's text CHARACTER FOR CHARACTER. Today's text is taken
// from the re-captured golden fixtures, which the two golden suites assert
// byte-for-byte against a fresh render on every run - so the chain is: fresh
// render == fixture, fixture == transformed previous text.
//
// ONE WORDING. The three ledgers are three page-local builders (settlement.html
// is off-limits to this wave, so the Receipt's could not be lifted into a
// shared file yet); the literals they share are pinned here so they cannot
// drift apart in the meantime.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makePlayers, makeCourseData } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const strip = h => h.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ').trim();
const CD = makeCourseData(18);
const J = v => JSON.parse(JSON.stringify(v));

// ---------------------------------------------------------------------------
describe('THE PROOF — six rounds, two surfaces: the old text minus its tie rows, H -> Hole, IS the new text', () => {
    const PREV = JSON.parse(read('card_skins_prev.fixture.json'));
    const ls = JSON.parse(read('live_skins_golden.fixture.json'));
    const pf = JSON.parse(read('pool_flights_golden.fixture.json'));
    const now = {};
    Object.keys(ls.rounds).forEach(k => { now['live_skins:' + k] = { indexLiveMount: strip(ls.rounds[k].html['index.liveMount']), leaderboardLiveSkins: strip(ls.rounds[k].html['leaderboard.liveSkins']) }; });
    Object.keys(pf.variants).forEach(k => { now['pool_flights:' + k] = { indexLiveMount: strip(pf.variants[k].html['index.liveMount']), leaderboardLiveSkins: strip(pf.variants[k].html['leaderboard.liveSkins']) }; });
    const tIndex = t => t.replace(/\|H\d+ — Tie at (Gross|Net) \d+ — No Skin(?=\|)/g, '').replace(/\|Latest: H(\d+)/g, '|Latest: Hole $1').replace(/\|H(\d+) — /g, '|Hole $1 — ');
    const tBoard = t => t.replace(/\|Hole \d+ — No Skin · Tie at (Gross|Net) \d+(?=\|)/g, '');

    test('the previous capture is pinned, so the proof cannot drift with the fixture', () => {
        assert.equal(sha(PREV.rounds['live_skins:flat-main'].indexLiveMount).slice(0, 8), '1bd5c8e9');
        assert.equal(sha(PREV.rounds['pool_flights:flight'].leaderboardLiveSkins).slice(0, 8), '83c589dc');
        assert.match(PREV.rounds['live_skins:flat-main'].indexLiveMount, /\|Latest: H11 — Eli\|H18 — Waiting on 8 golfers\|/);
        assert.match(PREV.rounds['live_skins:flat-main'].leaderboardLiveSkins, /Hole 2 — No Skin · Tie at Gross 3/);
    });

    Object.keys(PREV.rounds).forEach(k => {
        test(k + ': index.liveMount', () => {
            const before = PREV.rounds[k].indexLiveMount, after = now[k].indexLiveMount;
            assert.ok((before.match(/No Skin/g) || []).length >= 11, 'the old text had the tie rows');
            assert.equal(after, tIndex(before));
            assert.doesNotMatch(after, /No Skin/);
            assert.doesNotMatch(after, /\|H\d+ — |: H\d+ /);
            assert.equal((after.match(/— Skin(?=\|)/g) || []).length, (before.match(/— Skin(?=\|)/g) || []).length, 'every skin row is still there');
            assert.equal((after.match(/Waiting on/g) || []).length, (before.match(/Waiting on/g) || []).length, 'every waiting row is still there');
        });
        test(k + ': leaderboard.liveSkins', () => {
            const before = PREV.rounds[k].leaderboardLiveSkins, after = now[k].leaderboardLiveSkins;
            assert.ok((before.match(/No Skin/g) || []).length >= 11);
            assert.equal(after, tBoard(before));
            assert.doesNotMatch(after, /No Skin/);
            assert.equal((after.match(/Waiting for/g) || []).length, (before.match(/Waiting for/g) || []).length);
        });
    });
});

// ---------------------------------------------------------------------------
// A round arrives the way it does on a phone: the page loads with the link and
// the round comes through the listener it registered. The ledger sits behind
// the page's own "show hole-by-hole" toggle; a second snapshot after the toggle
// state is set re-renders it the way a live update would.
function cardPanel(data, opts) {
    const ix = loadHtmlInlineScript('index.html', [], { search: '?game=CARD7' + ((opts && opts.group) ? '&group=' + opts.group : '') });
    vm.runInContext('document.__mount(document.getElementById("live-skins-mount")); document.__mount(document.getElementById("hole-view-card"));', ix);
    const h = ix.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/CARD7');
    assert.ok(h, 'index.html registered its round listener');
    h.cb({ val: () => J(data), exists: () => true });
    if (opts && opts.open) { vm.runInContext('liveSkinsOpen = true;', ix); h.cb({ val: () => J(data), exists: () => true }); }
    return String(vm.runInContext("document.getElementById('live-skins-mount').innerHTML", ix));
}
function boardPanel(data) {
    const lb = loadHtmlInlineScript('leaderboard.html', [], { search: '?game=CARD7' });
    vm.runInContext("document.__mount(document.getElementById('live-skins-mount'));", lb);
    const h = lb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/CARD7');
    assert.ok(h, 'leaderboard.html registered its round listener');
    h.cb({ val: () => J(data), exists: () => true });
    return String(vm.runInContext("document.getElementById('live-skins-mount').innerHTML || ''", lb));
}
// Eight golfers, two groups. Scores through `thru` per golfer index; birdies by spec.
function round(o) {
    const P = makePlayers(['Avery', 'Blake', 'Casey', 'Drew', 'Ellis', 'Finn', 'Gray', 'Hollis'], [0, 0, 0, 0, 0, 0, 0, 0]);
    const scores = {};
    P.forEach((p, i) => CD.forEach(h => { if (h.hole <= (o.thru ? o.thru[i] : 18)) scores[`p${p.id}_h${h.hole}`] = h.par; }));
    Object.keys(o.birdies || {}).forEach(k => { const [pi, hole] = k.split('_').map(Number); scores[`p${P[pi].id}_h${hole}`] = CD[hole - 1].par - 1; });
    return { eventName: 'Card Skins', players: P, courseData: CD, scores, gameFormat: 'skins', skinsBuyIn: 5, skinsPotFormat: 'gross',
        skinsCarryOver: !!o.carry, settlementMode: 'whole-dollar', skinsRounding: 'odd-dollar' };
}

describe('CARD TAB — a no-carry round mid-play: only paid holes plus waiting rows', () => {
    const data = round({ thru: [14, 14, 14, 14, 12, 12, 12, 12], birdies: { '0_1': 1, '4_3': 1, '2_9': 1 } });

    test('the compact card: Latest and Waiting say "Hole", and nothing says H-something', () => {
        const t = strip(cardPanel(data));
        assert.match(t, /Latest: Hole 9 — Casey/);
        assert.match(t, /Hole 13 — Waiting on Group 2/);
        assert.doesNotMatch(t, /\bH\d+ /);
    });

    test('the ledger: three paid holes, the waiting holes, no tie row', () => {
        const t = strip(cardPanel(data, { open: true }));
        assert.match(t, /\|Hole 1 — Avery — Gross 3 — Skin\|/);
        assert.match(t, /\|Hole 3 — Ellis — Gross 2 — Skin\|/);
        assert.match(t, /\|Hole 9 — Casey — Gross 3 — Skin\|/);
        assert.equal((t.match(/— Skin\|/g) || []).length, 3);
        assert.doesNotMatch(t, /No Skin/);
        assert.doesNotMatch(t, /Tie/);
        assert.match(t, /\|Hole 13 — Waiting on Group 2\|Hole 14 — Waiting on Group 2\|Hole 15 — Waiting on Groups 1, 2\|/, 'every waiting hole, naming the group');
        assert.equal((t.match(/Waiting on/g) || []).length, 1 + 6, 'the summary line plus holes 13-18');
    });

    test('the Board: the same three, the FIRST waiting hole only, no tie row', () => {
        const t = strip(boardPanel(data));
        assert.match(t, /Hole 1 — Avery · Gross 3/);
        assert.match(t, /Hole 9 — Casey · Gross 3/);
        assert.doesNotMatch(t, /No Skin/);
        assert.equal((t.match(/Hole \d+ — [A-Z][a-z]+ · /g) || []).length, 3);
        assert.match(t, /Hole 13 — Waiting for Group 2/);
        assert.equal((t.match(/Waiting for/g) || []).length, 1);
    });
});

describe('CARD TAB — a carry round: carried runs in the Receipt\'s wording', () => {
    const data = round({ carry: true, birdies: { '0_1': 1, '2_5': 1, '4_7': 1, '7_16': 1 } });

    test('the ledger', () => {
        const t = strip(cardPanel(data, { open: true }));
        assert.match(t, /\|Hole 1 — Avery — Gross 3 — Skin\|/);
        assert.match(t, /\|Holes 2–4 — Tied — carried to Hole 5\|Hole 5 — Casey — Gross 3 — collects 4 skins \(Holes 2–5\)\|/);
        assert.match(t, /\|Hole 6 — Tied at Gross 4 — carried to Hole 7\|Hole 7 — Ellis — Gross 2 — collects 2 skins \(Holes 6–7\)\|/);
        assert.match(t, /\|Holes 8–15 — Tied — carried to Hole 16\|Hole 16 — Hollis — Gross 2 — collects 9 skins \(Holes 8–16\)\|/);
        assert.match(t, /\|Holes 17–18 — Tied — carried, not won\|/);
        assert.doesNotMatch(t, /No Skin/);
    });

    test('the Board, same words', () => {
        const t = strip(boardPanel(data));
        assert.match(t, /\|Holes 2–4 — Tied — carried to Hole 5\|Hole 5 — Casey · Gross 3 — collects 4 skins \(Holes 2–5\)\|/);
        assert.match(t, /\|Hole 6 — Tied at Gross 4 — carried to Hole 7\|/);
        assert.match(t, /\|Holes 17–18 — Tied — carried, not won\|/);
    });

    test('mid-round, an open run is carried to the hole still waiting', () => {
        const mid = round({ carry: true, thru: [10, 10, 10, 10, 9, 9, 9, 9], birdies: { '0_1': 1, '2_5': 1 } });
        const t = strip(cardPanel(mid, { open: true }));
        assert.match(t, /\|Holes 6–9 — Tied — carried to Hole 10\|Hole 10 — Waiting on Group 2\|/);
        assert.doesNotMatch(t, /carried, not won/, 'nothing is "not won" while holes are still open');
        const b = strip(boardPanel(mid));
        assert.match(b, /\|Holes 6–9 — Tied — carried to Hole 10\|Hole 10 — Waiting for Group 2\|/);
    });
});

describe('CARD TAB — a panel where nothing has been won still says so', () => {
    const data = round({ thru: [4, 4, 4, 4, 4, 4, 4, 4] });
    test('the card and its opened ledger', () => {
        assert.match(strip(cardPanel(data)), /No skins won yet\./);
        const t = strip(cardPanel(data, { open: true }));
        assert.match(t, /show hole-by-hole|hide hole-by-hole/);
        assert.match(t, /\|No skins won yet\.\|/);
        assert.match(t, /Hole 5 — Waiting on/, 'the waiting rows are still the live information');
        assert.doesNotMatch(t, /No Skin/);
    });
    test('the Board', () => {
        const t = strip(boardPanel(data));
        assert.match(t, /No skins won yet\./);
        assert.doesNotMatch(t, /No Skin/);
    });
    test('a finished no-carry round with every hole tied: the ledger is a sentence, not an empty box', () => {
        const t = strip(cardPanel(round({}), { open: true }));
        const ledger = t.slice(t.indexOf('hide hole-by-hole'));
        assert.ok(ledger.length > 20, 'the ledger is open');
        assert.match(ledger, /\|No skins won yet\.\|/, 'the LEDGER itself says so, not only the summary above it');
        assert.doesNotMatch(ledger, /Hole \d+ —/, 'eighteen ties: not one row');
        assert.doesNotMatch(t, /Waiting on/);
    });
});

// ---------------------------------------------------------------------------
// v138: the literal pins that held the three copies together are gone with the
// copies. The sentences live once, in live-skins.js (buildSkinsLedgerRows), and
// skins_rows_shared_test.js proves each page calls it and none redefines them.
describe('ONE WORDING — pinned in skins_rows_shared_test.js since v138; what stays here', () => {
    test('the live KP status says "Hole 3 ·"', () => {
        assert.match(read('index.html'), /'<div class="lnf-row"><span>Hole ' \+ l\.hole \+ ' \\u00B7 '/);
    });
    test('engines untouched (settlement.html was fenced for v137 only; v138 routes it through the shared builder)', () => {
        const h = f => sha(read(f)).slice(0, 8);
        assert.equal(h('settlement-engine.js'), 'adc3cd9f');
        assert.equal(h('pool-engine.js'), 'f4d7cdbb');
        assert.equal(h('money-engine.js'), '3c960947');
    });
});
