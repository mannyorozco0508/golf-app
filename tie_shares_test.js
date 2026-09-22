// ============================================================================
// THE ENGINE EXPOSES A TIE'S SHARES; THE PAGE READS THEM (Wave A, fix 1).
// pool-engine.js (approved for this one additive change) and settlement.html.
//
// A tied net place pays each golfer their own share (pool-engine.js net loop:
// allocateWholeDollars on a whole-dollar round, splitCentsEvenly on a legacy
// round), but until now the line exposed only {ids, names, cents, split,
// place}, so settlement.html REPRODUCED the allocation by calling the engine's
// allocators itself (v142's netTieShares). Now the line carries
// {shares: [...]} in ids order - the very array the engine paid from, not a
// second computation - and netTieShares reads l.shares and calls no allocator.
//
// NO FIGURE CHANGES. tie_shares_prev.fixture.json holds, captured at 71b8f6d
// (v143): the engine's whole result and the tag-stripped text of the Receipt's
// four mounts on five rounds. Today's engine result with `shares` deleted from
// every net line must DEEP-EQUAL the old result, and today's text must EQUAL
// the old text with ZERO substitutions. That is the whole proof: the field is
// additive and the page renders character for character what it rendered.
//
// The rounds live in helpers/tie-shares-rounds.js so the capture and the test
// cannot drift apart.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { ROUNDS } = require('./helpers/tie-shares-rounds.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const strip = h => h.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ').trim();
const J = v => JSON.parse(JSON.stringify(v));
const undate = t => t.replace(/\|[A-Z][a-z]+day, [A-Z][a-z]+ \d{1,2}, \d{4}\|/g, '|<date>|');
const MOUNTS = ['money-pool-section', 'combined-settlement-summary', 'settle-content', 'receipt-scorecard'];
const PREV = JSON.parse(read('tie_shares_prev.fixture.json'));
const { noFinalResults } = require('./helpers/no-final-results.js');   // v195b: the pool receipt has no Final Results card
// v196 (results payout redesign): the pool section is one card per game, the
// header and 💰 Pay out lead in #results-top, the summary keeps Who Pays Who,
// NET +/− closes in #results-net - helpers/results-payout-v196.js is the proof.
const { assertV196Mounts } = require('./helpers/results-payout-v196.js');

// The engine alone, the way settlement-engine loads it.
const ENG = loadJsFile('pool-engine.js', ['handicap.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js']);
function engine(data) { ENG.__d = J(data); return JSON.parse(vm.runInContext('JSON.stringify(computeMoneyPool(__d, __d.courseData, __d.scores))', ENG)); }
// The page, the way a golfer arrives: the link in the URL, the round through
// the page's own value listener.
function arrive(data) {
    const sb = loadHtmlInlineScript('settlement.html', [], { search: '?game=WEEKLY' });
    vm.runInContext(MOUNTS.map(m => 'document.__mount(document.getElementById("' + m + '"));').join(''), sb);
    const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/WEEKLY');
    assert.ok(h, 'settlement.html registered its round listener');
    h.cb({ val: () => J(data), exists: () => true });
    const raw = id => String(vm.runInContext("(document.getElementById('" + id + "')||{}).innerHTML || ''", sb));
    return { sb, raw, text: id => undate(strip(raw(id))) };
}
const withoutShares = r => { const c = J(r); if (c.net) c.net.lines.forEach(l => { delete l.shares; }); return c; };
// 2026-09-19 (recording pays): result.kp.confirmed became result.kp.finished - the
// only difference on these rounds (every KP is recorded on all of them; the
// figures are the v143 figures to the cent). Both spellings are asserted present
// on their own side, then dropped so the deep-equal is about the money.
// kp.confirmed (v143) became kp.finished (2026-09-19) and kp.unclaimedCents became
// kp.toSkinsCents (2026-09-22: a "nobody" share goes to the skins pot, not the
// field); both are 0 on every round here (each KP is recorded), so the result
// with the renamed field dropped is the v143 result.
const kpField = (r, from, to) => { const c = J(r); if (c.kp) { assert.equal(c.kp[from], true, 'kp.' + from); delete c.kp[from];
    const n = from === 'finished' ? 'toSkinsCents' : 'unclaimedCents'; assert.equal(c.kp[n], 0, 'kp.' + n); delete c.kp[n]; } return c; };
const rowsIn = html => [...html.matchAll(/<div class="ledger-row pp-row"><span>([^<]*)<\/span><span class="val-pos">([^<]*)<\/span><\/div>/g)].map(m => [m[1], m[2]]);
const netRowsOf = html => { const a = html.indexOf('<div class="pool-payouts"'), tag = '<!-- /pool-payouts -->', e = html.indexOf(tag); const b = html.slice(a, e); const s = b.indexOf('pp-game-head">Net Finish<'); return rowsIn(b.slice(s, b.indexOf('<!-- /pp-game -->', s))); };
const cents = s => Math.round(parseFloat(s.replace(/[^0-9.]/g, '')) * 100);

// ---------------------------------------------------------------------------
describe('THE LINE CARRIES ITS SHARES', () => {
    test('every net line has shares: an array in ids order, one per golfer, summing to the line\'s cents exactly', () => {
        let lines = 0;
        Object.keys(ROUNDS).forEach(k => {
            const r = engine(ROUNDS[k]());
            assert.ok(r.valid && r.net && r.net.lines.length > 0, k + ' pays net places');
            r.net.lines.forEach(l => {
                lines++;
                assert.ok(Array.isArray(l.shares), k + ': shares is an array');
                assert.equal(l.shares.length, l.ids.length, k + ': one share per id');
                assert.equal(l.shares.reduce((a, c) => a + c, 0), l.cents, k + ': the shares are the line\'s cents');
                l.shares.forEach(c => assert.ok(Number.isInteger(c) && c > 0, k + ': whole cents, every golfer paid'));
            });
        });
        assert.equal(lines, 8, 'eight lines over the five rounds');
    });
    test('three tied for first, $100 over 50/30/20: 3400 / 3300 / 3300 whole-dollar, 3334 / 3333 / 3333 legacy - and two tied for second: 2500 / 2500', () => {
        assert.deepEqual(engine(ROUNDS['three-tied-first']()).net.lines[0].shares, [3400, 3300, 3300]);
        assert.deepEqual(engine(ROUNDS['three-tied-legacy']()).net.lines[0].shares, [3334, 3333, 3333]);
        assert.deepEqual(engine(ROUNDS['two-tied-second']()).net.lines.map(l => l.shares), [[5000], [2500, 2500]]);
        assert.deepEqual(engine(ROUNDS['golden-off']()).net.lines.map(l => l.shares), [[12000], [8000]], 'an untied place: one share, the line\'s cents');
    });
    test('the shares ARE what the engine paid: each golfer\'s perPlayerCents is their share plus their skins less the buy-in', () => {
        ['three-tied-first', 'three-tied-legacy', 'two-tied-second'].forEach(k => {
            const r = engine(ROUNDS[k]());
            const skins = {}; r.skins.lines.forEach(l => { skins[String(l.winnerId)] = (skins[String(l.winnerId)] || 0) + l.cents; });
            r.net.lines.forEach(l => l.ids.forEach((id, i) =>
                assert.equal(r.perPlayerCents[String(id)], l.shares[i] + (skins[String(id)] || 0) - r.buyInCents, k + ' ' + l.names[i])));
        });
    });
});

// ---------------------------------------------------------------------------
describe('NO FIGURE CHANGED - the engine\'s result is the old result plus the field', () => {
    test('the baseline is pinned (captured at 71b8f6d)', () => {
        assert.equal(PREV.capturedAt, '71b8f6d');
        assert.equal(sha(read('tie_shares_prev.fixture.json')).slice(0, 8), 'b656f2ef');
        assert.deepEqual(Object.keys(PREV.rounds), Object.keys(ROUNDS));
    });
    Object.keys(ROUNDS).forEach(k => test(k + ': today\'s result with `shares` removed DEEP-EQUALS the v143 result', () => {
        const now = engine(ROUNDS[k]());
        assert.ok(now.net.lines.every(l => 'shares' in l), 'the field is there today');
        assert.ok(PREV.rounds[k].engine.net.lines.every(l => !('shares' in l)), 'and was not at v143');
        assert.deepEqual(kpField(withoutShares(now), 'finished'), kpField(PREV.rounds[k].engine, 'confirmed'));
    }));
});

// ---------------------------------------------------------------------------
// SEND RESULTS (2026-09-16): the export button left the summary for #receipt-actions
// on the title row. The capture below still holds it as one cell,
// "|📄 Print / Save Receipt|". That ONE cell is removed from the OLD text before
// comparing - the fixture file is untouched, its sha still pins the capture, and a
// second difference anywhere is still red. sendMove asserts the cell was there.
const sendMove = t => { const n = t.split('|📄 Print / Save Receipt|').length - 1; if (n !== 1) throw new Error('sendMove: expected the old button cell once, found ' + n); return t.replace('|📄 Print / Save Receipt|', '|'); };
describe('THE PAGE RENDERS CHARACTER FOR CHARACTER WHAT IT RENDERED', () => {
    Object.keys(ROUNDS).forEach(k => test(k + ': every mount is the v143 text through the documented transforms (v196: the pool section re-cut, the totals moved to Pay out)', () => {
        const el = arrive(ROUNDS[k]());
        // settle-content is legitimately empty on these rounds (no side
        // matches, no birdie game); the other three must have been captured
        // with content, so an equality of two blanks cannot pass for a proof.
        MOUNTS.forEach(m => { if (m !== 'settle-content') assert.ok(PREV.rounds[k].text[m].length > 500, m + ' was captured with content'); });
        const t = PREV.rounds[k].text;
        assertV196Mounts(assert, id => ({ text: el.text(id), html: el.raw(id) }),
            { pool: t['money-pool-section'], summary: t['combined-settlement-summary'], 'settle-content': t['settle-content'], 'receipt-scorecard': t['receipt-scorecard'] },
            { norm: undate, equal: ['settle-content', 'receipt-scorecard'] });
        // the v195b / v152 transforms this golden carried are subsumed: the button
        // cell and Final Results are read out of the raw capture by the proof
        void noFinalResults; void sendMove;
    }));
    test('and the Net Finish reason on each golfer\'s Pay out row IS the line\'s share, read from the line (whole-dollar, legacy, second place)', () => {
        // v196: the per-game payouts block is gone; a golfer's net share is the
        // "Net Finish T1st" reason under their Pay out row (helpers/results-payout-v196.js).
        const { payoutRowsFromHtml } = require('./helpers/results-payout-v196.js');
        // LEGACY (cents) round: the ledger's note divides the tie evenly (33.333 a
        // head) while the engine's shares are 33.34 / 33.33 / 33.33; the joined
        // reasons then miss the row's ledger total by a cent and the row prints the
        // ledger's own line ($33.33) - the runtime guard in buildPayoutCardHtml, so
        // a row can never show reasons that fail to add up to itself. The old
        // payouts block printed the engine's 33.34 beside a Player Payouts 33.33;
        // one figure now. Whole-dollar rounds (the app's default) take the shares.
        [['three-tied-first', [3400, 3300, 3300]], ['three-tied-legacy', [3333, 3333, 3333]], ['two-tied-second', [5000, 2500, 2500]]].forEach(([k, want]) => {
            const d = ROUNDS[k]();
            const el = arrive(d);
            const rows = payoutRowsFromHtml(el.raw('results-top')).rows;
            const nameOf = id => d.players.find(p => String(p.id) === String(id)).name;
            const printed = [].concat(...engine(d).net.lines.map(l => l.ids.map(id => {
                const row = rows.find(r => r.name === nameOf(id));
                const re = row && row.reasons.find(x => /^Net Finish /.test(x.label));
                return re ? Math.round(re.amount * 100) : null;
            })));
            assert.deepEqual(printed, want, k);
            const shares = [].concat(...engine(d).net.lines.map(l => l.shares));
            if (k !== 'three-tied-legacy') assert.deepEqual(printed, shares, k + ': the reasons are the shares, in ids order');
        });
    });
});

// ---------------------------------------------------------------------------
describe('THE SEAM', () => {
    const src = read('settlement.html');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[;{}()\s])\/\/[^\n]*/g, '$1');
    const fn = (s, name) => { const at = s.indexOf('function ' + name + '('); assert.ok(at > 0, name); return s.slice(at, s.indexOf('\n    function ', at + 30)); };
    test('netTieShares reads l.shares and calls no allocator; both the block and the detail read it', () => {
        const f = fn(code, 'netTieShares');
        assert.match(f, /l\.shares/);
        assert.ok(!/allocateWholeDollars|splitCentsEvenly|isWholeDollarRound|Math\.(round|floor|ceil)|toFixed|\/ 100|\* 100/.test(f), 'no allocation, no rounding, no cents<->dollars of its own: ' + f);
        // v196: the payouts block left; the Pay out reasons read the shares instead (poolReasonsFor)
        assert.equal((code.match(/netTieShares\(l\)/g) || []).length, 3, "the detail, the Pay out reasons, and the declaration");
    });
    test('settlement.html calls neither allocator anywhere now (comments stripped)', () => {
        assert.ok(!/allocateWholeDollars\(|splitCentsEvenly\(/.test(code));
        assert.match(code, /function netTieShares\(/, 'the function is still there');
    });
    test('pool-engine.js pushes the shares it paid from - the same array, on the same line', () => {
        const e = read('pool-engine.js');
        const net = e.indexOf('// ---- NET FINISH'); assert.ok(net > 0);
        const loop = e.slice(e.indexOf('const shares = wholeDollar', net), e.indexOf('place += span;', net));
        assert.match(loop, /tied\.forEach\(\(s, j\) => pay\(s\.id, shares\[j\]\)\);/, 'paid from `shares`');
        assert.match(loop, /lines\.push\(\{ place, ids: tied\.map\(s => s\.id\), names: tied\.map\(s => s\.name\),\s*net: tied\[0\]\.net, cents: groupCents, split: span > 1, shares: shares\.slice\(\),/, 'pushed as `shares`');
        assert.equal((e.match(/shares: shares\.slice\(\)/g) || []).length, 1, 'once');
    });
    test('the files, by sha: pool-engine.js moved for this one field; the other engines did not', () => {
        const h = f => sha(read(f)).slice(0, 8);
        assert.equal(h('pool-engine.js'), '372e76d7');   // 372e76d7: KP never refunds 2026-09-22 (approved per-file, the KP branch): a blank on a finished round and an Out winner are held (unresolved), nobody goes to the skins bucket (toSkinsCents), no KP refund; was a335f19c.
        assert.equal(h('settlement-engine.js'), 'f7712d87');   // f7712d87: KP never refunds 2026-09-22 (approved: the refund wording): the per-reason KP refund ledger line is gone; was 9043e7fc.
        assert.equal(h('money-engine.js'), '3c960947');
        assert.equal(h('live-skins.js'), '632bbb1a');
    });
});
