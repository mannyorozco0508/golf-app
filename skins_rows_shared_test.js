// ============================================================================
// ONE SHARED BUILDER, THREE CONSUMERS (v138). The skins hole rows - which holes
// are listed, how a carried run reads, what a collecting hole says it
// collected, "Hole 7" - are built ONCE, by buildSkinsLedgerRows() in
// live-skins.js, and rendered by settlement.html (the Receipt's Main Pool
// block), index.html (the scorecard's live skins ledger) and leaderboard.html
// (the live skins board). Each page keeps what is its own: markup, the
// Receipt's dollars, the waiting-row rule and wording.
//
// WHAT GENUINELY DIFFERED between the three page-local copies before this
// wave, and therefore stays per page:
//   - the waiting rows: the Card lists every waiting hole, "Waiting on
//     Group 1, 2" / "N to post"; the board lists the FIRST only, "Waiting for
//     Group 1" / "Groups 1, 2" / names / "the field"; the Receipt (a preview
//     only) lists them by golfer name / "N golfer(s)"
//   - the plain-win suffix: the Receipt and the Card say "— Skin"; the board
//     says nothing, and joins name and score with " · " not " — "
//   - "· value pending" on a carry win whose worth an unresolved hole still
//     decides: the Card only
//   - the dollars: the Receipt only
//   - the empty state: the Card's opened ledger and the board say "No skins
//     won yet."; the Receipt's summary says "No skins were won."
// Everything else - the run logic, the sentences, the label - is shared.
//
// THE PROOF, the way v136 and v137 did it: skins_rows_extract_prev.fixture.json
// holds the tag-stripped text of all three surfaces on five rounds, captured
// at d951a43 (v137) BEFORE the extraction. Today's text must equal it,
// character for character, with ONE difference the wave makes deliberately
// and states: on a carry round previewed MID-ROUND the Receipt used to say a
// run before a waiting hole was "carried, not won"; the Card and board said
// "carried to Hole 11" (the hole still waiting), which is the truth, and the
// shared builder says that on all three. A finished round is unaffected.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const strip = h => h.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ').trim();
const CD = makeCourseData(18);
const J = v => JSON.parse(JSON.stringify(v));

// ---------------------------------------------------------------------------
describe('THE BUILDER — live-skins.js buildSkinsLedgerRows', () => {
    const LS = loadJsFile('live-skins.js');
    const hole = (n, o) => Object.assign({ hole: n, official: true, state: 'skin', winner: { id: 1, name: 'Ann' }, low: 3, unitsWon: 1, valueKnown: true, missing: [], missingGroups: [] }, o);
    const tie = n => hole(n, { state: 'tie', winner: null, low: 4, unitsWon: 0 });
    const wait = (n, groups) => hole(n, { official: false, state: 'waiting', winner: null, low: null, unitsWon: null, valueKnown: false, missingGroups: groups || [2], missing: [{ id: 9, name: 'Zed', group: 2 }], requiredCount: 8, postedCount: 4 });

    test('no carry: a tie is not a row; a win is "Hole N" with its score and no suffix', () => {
        const rows = LS.buildSkinsLedgerRows({ carryOver: false, holes: [hole(1), tie(2), tie(3), hole(4, { low: 2 })] }, 'Gross');
        assert.equal(JSON.stringify(rows.map(r => r.kind)), JSON.stringify(['skin', 'skin']));
        assert.equal(rows[0].label, 'Hole 1'); assert.equal(rows[0].score, 'Gross 3'); assert.equal(rows[0].collected, '');
        assert.equal(rows[1].label, 'Hole 4'); assert.equal(rows[1].score, 'Gross 2');
    });

    test('carry: a run is one row in the words, and the collecting row says what it collected', () => {
        const rows = LS.buildSkinsLedgerRows({ carryOver: true, holes: [hole(1), tie(2), tie(3), tie(4), hole(5, { unitsWon: 4 }), tie(6), hole(7, { unitsWon: 2, low: 2 }), tie(8), tie(9)] }, 'Gross');
        assert.equal(JSON.stringify(rows.map(r => r.kind)), JSON.stringify(['skin', 'carry', 'skin', 'carry', 'skin', 'carry']));
        assert.equal(rows[1].text, 'Holes 2–4 — Tied — carried to Hole 5');
        assert.equal(JSON.stringify(rows[1].holes), '[2,3,4]'); assert.equal(rows[1].into, 5);
        assert.equal(rows[2].collected, ' — collects 4 skins (Holes 2–5)');
        assert.equal(rows[3].text, 'Hole 6 — Tied at Gross 4 — carried to Hole 7', 'a single carried hole names its score');
        assert.equal(rows[4].collected, ' — collects 2 skins (Holes 6–7)');
        assert.equal(rows[5].text, 'Holes 8–9 — Tied — carried, not won'); assert.equal(rows[5].into, null);
    });

    test('mid-round: a run before a waiting hole is carried TO that hole, and the waiting row carries its data', () => {
        const rows = LS.buildSkinsLedgerRows({ carryOver: true, holes: [hole(1), tie(2), tie(3), wait(4, [1, 3]), wait(5, [1, 3])] }, 'Net');
        assert.equal(JSON.stringify(rows.map(r => r.kind)), JSON.stringify(['skin', 'carry', 'waiting', 'waiting']));
        assert.equal(rows[1].text, 'Holes 2–3 — Tied — carried to Hole 4');
        assert.equal(rows[2].label, 'Hole 4'); assert.equal(JSON.stringify(rows[2].missingGroups), '[1,3]'); assert.equal(rows[2].missing[0].name, 'Zed');
        assert.equal(rows[2].requiredCount - rows[2].postedCount, 4);
        assert.ok(!rows.some(r => /not won/.test(r.text || '')));
    });

    test('nothing won: no rows at all (the page says so in its own words); a ledger of nothing: no rows', () => {
        assert.equal(LS.buildSkinsLedgerRows({ carryOver: false, holes: [tie(1), tie(2)] }, 'Gross').length, 0);
        assert.equal(LS.buildSkinsLedgerRows(null, 'Gross').length, 0);
    });

    test('names come back raw - the page escapes them, because the page owns the markup', () => {
        const rows = LS.buildSkinsLedgerRows({ carryOver: false, holes: [hole(1, { winner: { id: 1, name: "O'Brien <b>" } })] }, 'Gross');
        assert.equal(rows[0].winner.name, "O'Brien <b>");
        assert.ok(!('text' in rows[0]), 'a skin row is parts, not a sentence with a name baked in');
    });
});

// ---------------------------------------------------------------------------
// The three surfaces, each page arriving the way it does: loaded with the link,
// the round through its own value listener.
function arrive(page, data, mounts, pre) {
    const sb = loadHtmlInlineScript(page, [], { search: '?game=XTRACT' });
    vm.runInContext(mounts.map(m => 'document.__mount(document.getElementById("' + m + '"));').join(''), sb);
    const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/XTRACT');
    assert.ok(h, page + ' registered its round listener');
    h.cb({ val: () => J(data), exists: () => true });
    if (pre) { vm.runInContext(pre, sb); h.cb({ val: () => J(data), exists: () => true }); }
    return sb;
}
function surfaces(data) {
    const st = arrive('settlement.html', data, ['money-pool-section']);
    const ix = arrive('index.html', data, ['live-skins-mount', 'hole-view-card'], 'liveSkinsOpen = true;');
    const lb = arrive('leaderboard.html', data, ['live-skins-mount']);
    return {
        receipt: strip(String(vm.runInContext("document.getElementById('money-pool-section').innerHTML", st))),
        card: strip(String(vm.runInContext("document.getElementById('live-skins-mount').innerHTML", ix))),
        board: strip(String(vm.runInContext("document.getElementById('live-skins-mount').innerHTML || ''", lb)))
    };
}
function pool(flights, carry, birdies, thru) {
    const r = wizardSavedRound({ code: 'XTRACT', courseData: CD, thru: thru || 18, overrides: { additionalGames: {}, flights: flights === undefined ? undefined : flights } });
    if (flights === undefined) delete r.flights;
    r.moneyPool.skins.carryOver = !!carry;
    const byName = {}; r.players.forEach(p => { byName[p.name] = p.id; });
    birdies.forEach(([name, h]) => { r.scores['p' + byName[name] + '_h' + h] = CD[h - 1].par - 1; });
    return r;
}
const FLIGHT = { enabled: true, scopes: { skins: 'flight', birdies: 'field' } };
const FOUR = [['Ann Alpha', 1], ['Cal Charlie', 5], ['Ned November', 7], ['Quy Quebec', 16]];
const TEN = [['Ann Alpha', 1], ['Ben Bravo', 2], ['Max Mike', 2], ['Cal Charlie', 5], ['Ned November', 7], ['Dee Delta', 9], ['Oli Oscar', 11], ['Eli Echo', 13], ['Pat Papa', 13], ['Quy Quebec', 16]];
const ROUNDS = {
    'no-carry': () => pool(undefined, false, FOUR),
    'carry': () => pool(undefined, true, FOUR),
    'nothing-won': () => pool(undefined, false, []),
    'flighted': () => pool(FLIGHT, false, TEN),
    'carry-mid-round': () => pool(undefined, true, [['Ann Alpha', 1], ['Cal Charlie', 5]], 10)
};


// v142 (WEEKLY GAME): the Results tab's pool section renamed its header, dropped
// the payouts block's title line and numbered the net payout rows. The captured
// text predates that; these three substitutions are exactly that wave's change,
// applied to the OLD text so this proof still holds character for character.
const v142 = t => {
    let out = t.replace('|🏆 Main Pool — ', '|🏆 Weekly Game — ').replace('|💵 PAYOUTS — hand out in this order', '');
    const a = out.indexOf('|Net Finish|'), b = out.indexOf('|KP|', a);
    if (a > -1 && b > a) {
        const seg = out.slice(a + '|Net Finish|'.length, b).split('|').filter(Boolean);   // name, $amount, name, $amount ...
        const rows = []; for (let i = 0; i + 1 < seg.length; i += 2) rows.push((i / 2 + 1) + ' · ' + seg[i] + '|' + seg[i + 1]);
        out = out.slice(0, a) + '|Net Finish|' + rows.join('|') + out.slice(b);
    }
    return out;
};


// 2026-09-19 (RECORDING PAYS): the KP ceremony left the Receipt. On this round
// hole 3 is recorded (Ann Alpha) and 7/12/16 are blank; every card is in on the
// captured rounds, so the recorded hole is paid and the blanks refund to the
// field ($30 across 23), and each refunded line says why. On the mid-round
// capture (thru 10) a blank is "not recorded yet" and its share is "in the
// pot". These substitutions are exactly that wave's change, applied to the OLD
// text - kp_settlement_test.js proves the behaviour, this proves nothing else
// in the text moved.
const kpWave = (t, live) => {
    let out = t
        .replace('|KP|KP not confirmed yet — $40 pending|📍 KP — $40 — NOT CONFIRMED|Hole 3: Ann Alpha — not confirmed|$10 pending|',
                 '|KP|Ann Alpha|$10|📍 KP — $40|Hole 3: Ann Alpha|$10|')
        .replace(/\|Hole (7|12|16): no winner recorded\|\$10 pending(?=\|)/g, (m, h) => live ? '|Hole ' + h + ': not recorded yet|$10 in the pot' : '|Hole ' + h + ': nobody recorded it|$10 back to the field')
        .replace('|⚠️ KP results not confirmed|$40 pending|', '|');
    if (!live) {
        // the $30 joins the field refund row: appended to an existing row's reasons and amount, or a new row at the end
        const m = out.match(/\|↩️ Refunded to the field \(([^)]*)\)\|\$(\d+) ÷ 23\|/);
        out = m ? out.replace(m[0], '|↩️ Refunded to the field (Unclaimed KP money refunded to the field. ' + m[1] + ')|$' + (Number(m[2]) + 30) + ' ÷ 23|')   // KP is allocated first, so its reason leads
                : out.replace(/\|$/, '|↩️ Refunded to the field (Unclaimed KP money refunded to the field.)|$30 ÷ 23|');
    }
    return out;
};
// 2026-09-22 (KP NEVER REFUNDS): layered on top of kpWave - helpers/kp-never-refunds.js
// says exactly what moves. The old text, plus that wave, plus this rule, IS today's text.
const { kpNeverRefunds } = require('./helpers/kp-never-refunds.js');
// v196 (results payout redesign): one card per game, the payouts block and the
// Skins Summary gone - helpers/results-payout-v196.js says exactly what moves.
const { poolV196 } = require('./helpers/results-payout-v196.js');

describe('THE PROOF — three surfaces, five rounds: today\'s text is the pre-extraction text', () => {
    const PREV = JSON.parse(read('skins_rows_extract_prev.fixture.json'));
    test('the previous capture is pinned, so the proof cannot drift with the fixture', () => {
        assert.equal(sha(PREV.rounds['flighted'].receipt), '1276c8f4467a1937c39574a88b602b692ed0b40cb3511a2e0ac6289a4adaab3c', 'the v136 Receipt text');
        assert.equal(sha(PREV.rounds['carry'].card).slice(0, 8), 'e19a899d');
        assert.equal(sha(PREV.rounds['nothing-won'].board).slice(0, 8), 'ea526901');
        assert.match(PREV.rounds['carry'].receipt, /\|Holes 2–4 — Tied — carried to Hole 5\|Hole 5 — Cal Charlie — Gross 3 — collects 4 skins \(Holes 2–5\)\|\$49\|/);
    });
    ['no-carry', 'carry', 'nothing-won', 'flighted'].forEach(k => {
        const now = surfaces(ROUNDS[k]());
        ['receipt', 'card', 'board'].forEach(s => test(k + ' / ' + s + ': character for character', () => {
            assert.equal(now[s], s === 'receipt' ? poolV196(kpNeverRefunds(kpWave(v142(PREV.rounds[k][s]), false))) : PREV.rounds[k][s]);
            assert.ok(now[s].length > 40, 'not vacuous');
        }));
    });
    test('carry-mid-round: the Card and the board are unchanged; the Receipt\'s one open run now reads as theirs did', () => {
        const now = surfaces(ROUNDS['carry-mid-round']());
        assert.equal(now.card, PREV.rounds['carry-mid-round'].card);
        assert.equal(now.board, PREV.rounds['carry-mid-round'].board);
        const before = PREV.rounds['carry-mid-round'].receipt;
        assert.match(before, /\|Holes 6–10 — Tied — carried, not won\|Hole 11 — Waiting on/, 'what the Receipt said before');
        assert.equal(now.receipt, poolV196(kpNeverRefunds(kpWave(v142(before.replace('|Holes 6–10 — Tied — carried, not won|Hole 11 — Waiting on', '|Holes 6–10 — Tied — carried to Hole 11|Hole 11 — Waiting on')), true), { live: true })),
            'the ONE deliberate difference, and nothing else');
        assert.match(now.card, /\|Holes 6–10 — Tied — carried to Hole 11\|/, 'the sentence the Card already used');
    });
});

// ---------------------------------------------------------------------------
describe('THE SEAM — called by all three, defined once', () => {
    const PAGES = ['settlement.html', 'index.html', 'leaderboard.html'];
    test('live-skins.js defines the builder and exports it', () => {
        const src = read('live-skins.js');
        assert.match(src, /\nfunction buildSkinsLedgerRows\(L, basis\) \{/);
        assert.match(src, /module\.exports = \{ liveSkinsLedgerConfigs, liveSkinsLedgerEntries, buildSkinsLedgerRows \}/);
        ['carried to Hole ', 'carried, not won', ' — collects ', ' skins (Holes ', "'Tied at ' + basis", "'Tied'", "'Hole ' + ", "'Holes ' + "].forEach(l =>
            assert.ok(src.includes(l), 'the builder carries ' + JSON.stringify(l)));
    });
    PAGES.forEach(p => test(p + ' loads live-skins.js and calls buildSkinsLedgerRows; it defines no copy of the sentences', () => {
        const src = read(p);
        assert.match(src, /<script src="live-skins\.js"><\/script>/);
        const inline = src.replace(/<script src=[^>]*><\/script>/g, '');
        assert.match(inline, /buildSkinsLedgerRows\(L, basis(Label|Word)?\)/, 'the positive assertion: the builder is called');
        assert.doesNotMatch(inline, /function buildSkinsLedgerRows/, 'and not shadowed');
        ['carried to Hole', 'carried, not won', 'collects ', 'skins (Holes'].forEach(l =>
            assert.ok(!inline.includes(l), p + ' still carries a copy of ' + JSON.stringify(l)));
        assert.doesNotMatch(inline, /No Skin<\/(span|div)>/);
    }));
    test('what stays per page is per page: the waiting wording, the dollars, the suffix', () => {
        assert.match(read('settlement.html'), /Waiting on \$\{who\}/);
        assert.match(read('settlement.html'), /\$\(cents\)/);
        assert.match(read('index.html'), /value pending/);
        assert.match(read('leaderboard.html'), /Waiting for ' \+ esc\(who \|\| 'the field'\)/);
        assert.match(read('leaderboard.html'), /row\.score \+ row\.collected/, 'the board adds no "— Skin"');
        assert.match(read('settlement.html'), /row\.collected \|\| ' — Skin'/);
        assert.match(read('index.html'), /row\.collected \|\| ' — Skin'/);
    });
    test('the engines were not touched', () => {
        const h = f => sha(read(f)).slice(0, 8);
        assert.equal(h('settlement-engine.js'), 'f7712d87');   // f7712d87: KP never refunds 2026-09-22 (approved: the refund wording): the per-reason KP refund ledger line is gone; was 9043e7fc.
        // Wave A fix 1: pool-engine.js re-pinned - net lines now carry {shares}, the array the engine paid a tie from; additive, every figure unchanged (tie_shares_test.js).
        assert.equal(h('pool-engine.js'), '372e76d7');   // 372e76d7: KP never refunds 2026-09-22 (approved per-file, the KP branch): a blank on a finished round and an Out winner are held (unresolved), nobody goes to the skins bucket (toSkinsCents), no KP refund; was a335f19c.
        assert.equal(h('money-engine.js'), '3c960947');
    });
});
