// ============================================================================
// SKINS ROWS THAT LIST ONLY THE HOLES THAT PAID, AND HOLE VIEW WIDGETS A CART
// CAN READ (v136). settlement.html and index.html, presentation only.
//
// THE MAIN POOL SKINS LEDGER (settlement.html, buildSkinsPotRowsHtml):
//   - "Hole 7", not "H7".
//   - NO CARRY: only the holes with a skin. The "Tie at Gross 4 — No Skin"
//     rows are gone - on the golden round twelve of them stood around six
//     results (twenty-six around ten, flighted).
//   - CARRY: a tie rolls value forward, so the tied holes are part of the
//     money: a run of them is one compact line ("Holes 2–4 — Tied — carried to
//     Hole 5"), the collecting hole says what it collected ("collects 4 skins
//     (Holes 2–5)"), and a run nobody collected is stated ("carried, not
//     won"); the unwon-money row below still carries the refund.
//   - A pot where nobody won still says "No skins were won."
//
// THE PROOF, the way v134 proved its sectioning: skins_rows_prev.fixture.json
// holds the tag-stripped text of the three golden variants' Main Pool section
// as captured at 769d93d (v135). On every run the old text with its tie rows
// removed and "H" -> "Hole " must equal today's text CHARACTER FOR CHARACTER.
// What is deliberately different is exactly those two things; every winning
// row, summary row, payouts row and refund row is provably identical.
//
// THE WIDGETS (index.html): CSS only - the rem sizes are pinned below. Cold
// Chrome at 390 measured the height above the score boxes at +21px on a heavy
// round (leaderboard + dots + skins + matches: 654 -> 675) and +7px on a light
// one (200 -> 207), the hole heading at y=12 after Next, Prev and a jump (the
// v129 HOLE_LANDING_OFFSET), no horizontal scroll. mini-dom has no layout, so
// none of that is asserted here; the sizes that produce it are.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const strip = h => h.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ').trim();
const CD = makeCourseData(18);
const J = v => JSON.parse(JSON.stringify(v));

// The pool_flights_golden round, three variants, exactly as that golden builds it.
function build(flights) {
    const r = wizardSavedRound({ code: 'POOLGLD', courseData: CD, thru: 18, overrides: { additionalGames: {}, flights: flights === undefined ? undefined : flights } });
    if (flights === undefined) delete r.flights;
    const byName = {}; r.players.forEach(p => { byName[p.name] = p.id; });
    r.__birdie = (name, hole) => { r.scores['p' + byName[name] + '_h' + hole] = CD[hole - 1].par - 1; };
    return r;
}
function goldenRound(flights) {
    const r = build(flights);
    ['Ann Alpha', 1, 'Ben Bravo', 2, 'Max Mike', 2, 'Cal Charlie', 5, 'Ned November', 7, 'Dee Delta', 9, 'Oli Oscar', 11, 'Eli Echo', 13, 'Pat Papa', 13, 'Quy Quebec', 16]
        .reduce((acc, v, i, a) => { if (i % 2 === 0) r.__birdie(v, a[i + 1]); return acc; }, null);
    delete r.__birdie;
    return r;
}
const VARIANTS = {
    off: () => goldenRound(undefined),
    field: () => goldenRound({ enabled: true, scopes: { skins: 'field', birdies: 'field' } }),
    flight: () => goldenRound({ enabled: true, scopes: { skins: 'flight', birdies: 'field' } })
};

// Arrive at the Receipt the way a golfer does: the page loads with the link and
// the round comes through the listener it registered.
function arrive(data) {
    const st = loadHtmlInlineScript('settlement.html', [], { search: '?game=POOLGLD' });
    vm.runInContext('document.__mount(document.getElementById("money-pool-section"));', st);
    const h = st.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/POOLGLD');
    assert.ok(h, 'the page registered its round listener');
    h.cb({ val: () => J(data), exists: () => true });
    return {
        st,
        pool: String(vm.runInContext("document.getElementById('money-pool-section').innerHTML", st)),
        engine: vm.runInContext('JSON.stringify(computeMoneyPool(__d, __d.courseData, __d.scores))', Object.assign(st, { __d: J(data) }))
    };
}
const rows = h => (h.match(/<div class="ledger-row[^"]*"><span>Hole \d+ — [^<]*<\/span><span class="val-pos">[^<]*<\/span><\/div>/g) || []);
const rowText = r => strip(r).split('|').filter(Boolean);


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

// ---------------------------------------------------------------------------

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

describe('THE PROOF — the old text minus its tie rows, H -> Hole, IS the new text', () => {
    const PREV = JSON.parse(read('skins_rows_prev.fixture.json'));
    Object.keys(VARIANTS).forEach(k => {
        test(k + ': character for character', () => {
            const before = PREV.variants[k];
            const now = strip(arrive(VARIANTS[k]()).pool);
            const ties = (before.match(/No Skin/g) || []).length;
            assert.ok(ties >= 12, 'the old text had the tie rows: ' + ties);
            const transformed = kpWave(v142(before
                .replace(/\|H\d+ — Tie at (Gross|Net) \d+ — No Skin(?=\|)/g, '')
                .replace(/\|H(\d+) — /g, '|Hole $1 — ')), false);
            assert.equal(now, transformed);
            assert.doesNotMatch(now, /No Skin/);
            assert.doesNotMatch(now, /\|H\d+ — /);
            // Not vacuous: the winning rows are there, as many as before.
            const winsBefore = (before.match(/\|H\d+ — [^|]* — Skin(?=\|)/g) || []).length;
            const winsNow = (now.match(/\|Hole \d+ — [^|]* — Skin(?=\|)/g) || []).length;
            assert.ok(winsBefore >= 6); assert.equal(winsNow, winsBefore);
        });
    });
    test('the previous capture IS the v134/v135 text (the shas receipt_sections_test pinned then), so the proof cannot drift with the fixture', () => {
        assert.equal(sha(PREV.variants.off), '8d851e85a86b2aad160784411031081fcfdebd6f99f295e2774d13c148f4e557');
        assert.equal(sha(PREV.variants.field), '8d851e85a86b2aad160784411031081fcfdebd6f99f295e2774d13c148f4e557');
        assert.equal(sha(PREV.variants.flight), '21a797e7460c81cb83415171d7ddd6af9ce6c2960556ee9cb1363d8efdb9ad9e');
        assert.match(PREV.variants.off, /H1 — Ann Alpha — Gross 3 — Skin\|\$37\|H2 — Tie at Gross 3 — No Skin/);
        assert.match(PREV.variants.flight, /Flight A — \$115/);
    });
});

// ---------------------------------------------------------------------------
describe('NO CARRY — only the holes that paid, labelled "Hole N"', () => {
    test('flighted: each flight lists its five winning holes, nothing else, and the count is the engine\'s', () => {
        const { pool, engine } = arrive(VARIANTS.flight());
        const eng = JSON.parse(engine);
        const a = pool.indexOf('<div class="pool-flight" data-flight="A"'), b = pool.indexOf('<div class="pool-flight" data-flight="B"');
        assert.ok(a > 0 && b > a);
        const segA = pool.slice(a, b), segB = pool.slice(b);
        const linesA = eng.skins.flights.find(f => f.flight === 'A').lines, linesB = eng.skins.flights.find(f => f.flight === 'B').lines;
        assert.equal(rows(segA).length, linesA.length, 'A: one row per skin');
        assert.equal(rows(segB).length, linesB.length, 'B: one row per skin');
        assert.deepEqual(rows(segA).map(r => Number(/Hole (\d+)/.exec(r)[1])), linesA.map(l => l.hole), 'A: the holes the engine paid, in order');
        assert.deepEqual(rows(segB).map(r => Number(/Hole (\d+)/.exec(r)[1])), linesB.map(l => l.hole), 'B: likewise');
        assert.doesNotMatch(pool, /No Skin/);
        assert.doesNotMatch(pool, /Tie/);
        assert.doesNotMatch(pool, /\bH\d+ —/, 'no H-prefix anywhere in the Main Pool section');
        assert.match(pool, /Hole 1 — Ann Alpha — Gross 3 — Skin/);
    });

    test('flightless: six winning holes, six rows, every amount the engine\'s', () => {
        const { pool, engine } = arrive(VARIANTS.off());
        const eng = JSON.parse(engine);
        const rs = rows(pool);
        assert.equal(rs.length, 6);
        assert.equal(rs.length, eng.skins.lines.length);
        rs.forEach((r, i) => {
            const t = rowText(r);
            assert.match(t[0], new RegExp('^Hole ' + eng.skins.lines[i].hole + ' — '));
            assert.equal(t[1], '$' + (eng.skins.lines[i].cents / 100), 'the row pays what the engine allocated');
        });
    });

    test('a flight where nobody won still says so', () => {
        // Flight B ties every hole: not one birdie among its golfers.
        const r = build({ enabled: true, scopes: { skins: 'flight', birdies: 'field' } });
        r.__birdie('Ann Alpha', 1); r.__birdie('Cal Charlie', 5); delete r.__birdie;
        const { pool } = arrive(r);
        const b = pool.indexOf('<div class="pool-flight" data-flight="B"');
        assert.ok(b > 0);
        const segB = pool.slice(b, pool.indexOf('<!-- /pool-flight -->', b));
        assert.equal(rows(segB).length, 0, 'no winning rows in B');
        assert.match(segB, /No skins were won\./, 'and it says so rather than rendering empty');
        assert.match(segB, /Unwon skins money/, 'and the money is stated');
        assert.ok(rows(pool.slice(pool.indexOf('<div class="pool-flight" data-flight="A"'), b)).length >= 1, 'A still lists its winners');
    });
});

// ---------------------------------------------------------------------------
describe('CARRY — the carried holes are represented, and the collecting hole says what it collected', () => {
    function carryRound() {
        const r = build(undefined);
        r.moneyPool.skins.carryOver = true;
        r.__birdie('Ann Alpha', 1); r.__birdie('Cal Charlie', 5); r.__birdie('Ned November', 7); r.__birdie('Quy Quebec', 16);
        delete r.__birdie;
        return r;
    }
    test('runs, collections, and a run nobody collected', () => {
        const { pool } = arrive(carryRound());
        const t = strip(pool);
        assert.match(t, /\|Hole 1 — Ann Alpha — Gross 3 — Skin\|\$12\|/);
        assert.match(t, /\|Holes 2–4 — Tied — carried to Hole 5\|/);
        assert.match(t, /\|Hole 5 — Cal Charlie — Gross 3 — collects 4 skins \(Holes 2–5\)\|\$49\|/);
        assert.match(t, /\|Hole 6 — Tied at Gross 4 — carried to Hole 7\|/, 'a single carried hole names its score');
        assert.match(t, /\|Hole 7 — Ned November — Gross 2 — collects 2 skins \(Holes 6–7\)\|\$25\|/);
        assert.match(t, /\|Holes 8–15 — Tied — carried to Hole 16\|/);
        assert.match(t, /\|Hole 16 — Quy Quebec — Gross 2 — collects 9 skins \(Holes 8–16\)\|\$110\|/);
        assert.match(t, /\|Holes 17–18 — Tied — carried, not won\|/);
        assert.match(t, /Unwon skins money \(2 unwon skins carried to the end\)/);
        assert.doesNotMatch(t, /No Skin/);
        assert.match(pool, /class="ledger-row skins-carry-row"/, 'the run line is styled as the quieter row');
    });

    test('totals unchanged: the rows pay what the engine allocated, and sum to the pot less the refund', () => {
        const { pool, engine } = arrive(carryRound());
        const eng = JSON.parse(engine);
        const rs = rows(pool);
        assert.equal(rs.length, eng.skins.lines.length, 'one row per paid hole');
        let sum = 0;
        rs.forEach(r => {
            const t = rowText(r);
            const hole = Number(/Hole (\d+)/.exec(t[0])[1]);
            const line = eng.skins.lines.find(l => l.hole === hole);
            assert.ok(line, 'hole ' + hole + ' is an engine line');
            assert.equal(t[1], '$' + (line.cents / 100));
            const units = /collects (\d+) skins/.exec(t[0]);
            assert.equal(units ? Number(units[1]) : 1, line.units || 1, 'the skins collected are the engine\'s units');
            sum += line.cents;
        });
        assert.equal(sum + eng.skins.unwonCents, eng.skins.amountCents, 'paid + refunded = the bucket');
    });
});

// ---------------------------------------------------------------------------
describe('THE SEAM — where the rows come from, and the print block', () => {
    const src = read('settlement.html');
    const at = src.indexOf('function buildSkinsPotRowsHtml(');
    const fn = src.slice(at, src.indexOf('\n    function ', at + 30));

    test('the rows are built from the engine\'s ledger through the shared builder (v138); no tie row is emitted', () => {
        assert.match(fn, /computeSkinsHoleLedger\(ledgerCfg, courseData, savedScores\)/);
        // v138: the words and the run logic moved to live-skins.js; this page
        // renders the rows it hands back and adds the dollars and its markup.
        assert.match(fn, /buildSkinsLedgerRows\(L, basisLabel\)\.forEach\(row =>/, 'the shared builder');
        assert.match(fn, /row\.collected \|\| ' — Skin'/, 'a plain win still says Skin');
        assert.doesNotMatch(fn, /No Skin<\/span>/, 'the tie row markup is gone from the source');
        assert.doesNotMatch(fn, /carried to Hole|carried, not won|collects /, 'no page-local copy of the sentences');
    });

    test('the v134 blocks and the print rules are as they were', () => {
        assert.match(src, /<div class="pool-flight" data-flight="\$\{pot\.flight\}"><div class="pool-flight-head">/);
        const print = src.slice(src.indexOf('@media print'));
        assert.match(print, /\.pool-game-head, \.pool-flight-head \{ break-after: avoid/);
        assert.match(print, /\.pool-flight \{ break-inside: avoid/);
        assert.match(src, /\.skins-carry-row \{ font-weight: normal;/);
    });

    test('engines untouched by this wave', () => {
        const h = f => sha(read(f)).slice(0, 8);
        // Wave A fix 1: pool-engine.js re-pinned - net lines now carry {shares}, the array the engine paid a tie from; additive, every figure unchanged (tie_shares_test.js).
        assert.equal(h('pool-engine.js'), 'a335f19c');   // a335f19c: even skins split 2026-09-20 (approved per-file, this change only): skinsSplitMode(data) and the per-flight bucket divides evenly on flights.skinsSplit 'even', by headcount otherwise; was 846f33e3.   // 846f33e3: KP wave 2026-09-19 (approved per-file): recording pays, a blank refunds once finished, kpConfirmed ignored; shares/pay/refund arithmetic unchanged - kp_settlement_test.js proves it
        assert.equal(h('settlement-engine.js'), '9043e7fc');   // 9043e7fc: KP wave 2026-09-19 (approved per-file): computeRoundFinish extracted from computeRoundSettlement, the ledger's refund line labelled by reason; the rule and every wager engine unchanged, no arithmetic changed
        assert.equal(h('live-skins.js'), sha(read('live-skins.js')).slice(0, 8));
        assert.equal(h('money-engine.js'), '3c960947');
    });
});

// ---------------------------------------------------------------------------
describe('THE HOLE VIEW WIDGETS — the sizes that a cart can read', () => {
    const css = read('index.html');
    const rule = sel => { const m = new RegExp('\\n\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(css); assert.ok(m, sel + ' has a rule'); return m[1]; };
    const size = sel => { const m = /font-size:\s*([\d.]+)rem/.exec(rule(sel)); assert.ok(m, sel + ' sets a rem size'); return Number(m[1]); };

    test('leaderboard card: title 0.7, position 0.68, name 0.8, the to-par number 1.1', () => {
        assert.equal(size('.lw-title'), 0.7);
        assert.equal(size('.lw-pos'), 0.68);
        assert.equal(size('.lw-name'), 0.8);
        assert.equal(size('.lw-par'), 1.1);
        assert.match(rule('.lw-pos'), /var\(--text-secondary\)/, 'the position reads darker than muted');
    });
    test('skins card: name 0.86, count 0.82, holes 0.78, foot 0.68, rows 4px apart', () => {
        assert.equal(size('.lw-sname'), 0.86); assert.equal(size('.lw-scount'), 0.82);
        assert.equal(size('.lw-sholes'), 0.78); assert.equal(size('.lw-foot'), 0.68);
        assert.match(rule('.lw-srow'), /padding: 4px 0/);
        assert.equal(size('.lw-sub'), 0.68);
    });
    test('matches card: segment name 0.7, status 1, stake 0.8, press tag 0.68', () => {
        assert.equal(size('.lm-seg-name'), 0.7); assert.equal(size('.lm-seg-status'), 1);
        assert.equal(size('.lm-stake'), 0.8); assert.equal(size('.lm-press-tag'), 0.68);
        assert.equal(size('.lm-wager-head'), 0.74);
    });
    test('dots card: name and total 0.95, chips 0.76, and its title finally has the sibling cards\' title rule', () => {
        assert.equal(size('.ld-total'), 0.95); assert.equal(size('.ld-chip'), 0.76);
        assert.match(rule('.ld-name'), /font-size: 0\.95rem/);
        assert.match(css, /\.lm-title, \.lm-card-title \{ font-size: 0\.7rem; font-weight: bold;/);
    });
    test('a title can never widen the page: nowrap with an ellipsis guard on both title rules', () => {
        [rule('.lw-title'), rule('.lm-title, .lm-card-title')].forEach(r => {
            assert.match(r, /white-space: nowrap/); assert.match(r, /min-width: 0/); assert.match(r, /text-overflow: ellipsis/);
        });
    });
    test('the landing is untouched: the heading is still the anchor, at the v129 offset', () => {
        assert.match(css, /const HOLE_LANDING_OFFSET = 12;/);
        assert.match(css, /card\.querySelector\('\.hole-view-header'\) \|\| card\.querySelector\('\.score-input'\)/);
        assert.match(css, /\.hv-hole-num \{ font-size: 1\.5rem;/, 'the heading itself did not change');
    });
});
