// ============================================================================
// SCORECARD SCAN - the shared validator (scorecard-validate.js), held to
// section 7 of grok/CLAUDE-HANDOFF-scorecard-scan-2026-10-24.md.
//
// The server uses this to decide on the one Pro retry; the app uses it to paint
// the confirm grid. If a rule here is wrong, both are wrong the same way -
// which is the point of one file, and why every rule has a test.
//
// SPEED FIX A (Manny's typed OK 2026-11-16, 'no Pro retry for sum mismatches; still retry
// low-confidence cells'): a sum mismatch alone earns no retry; a mismatched nine with a
// doubted cell adds hard 'unsure_nine' and does; too_many_suspect counts unsureCount (the
// model's own doubts), not the amber a wrong written total paints. BASELINE against main
// 832204f0 (the validator before the fix): 38 pass / 9 fail of 47, measured with this file
// copied there after the last test was written; 47 / 0 on the branch. NEGATIVE CONTROLS
// (restored by sha): needsRetry back to any hard failure -> 7 red here + 2 in the server
// guard; the threshold counting the amber nine again -> 8 + 2; unsure_nine never pushed ->
// 1 + 4; the total-branch unsure_nine removed -> 1 + 0.
// THE CROSSED-OUT RULE (Manny's typed OK 2026-11-16, event list item 4): one prompt line, pinned by the last
// test of "the prompt carries the round context". BASELINE against main fd15f9f6: 47 pass / 1 fail of 48;
// 48 / 0 on preview-scan-desk. CONTROL K7 (the line deleted): 1 red, restored by sha.
// REWRITTEN DIGITS (2026-11-17, Manny typed in the tournaments tab: "On a branch, no deploy: improve crossed-out/rewritten
// digit reading (both test cards must pass)"): the per-cell `other`, the swap the pen decides (resolveRewrites), amber-
// not-unsure, applyRewrites, focusFor and buildPrompt(ctx, focus); the prompt's two-digit sentence replaces the Nov 16 one.
// 61 tests. BASELINE against main 4cf836a4's scorecard-validate.js (the pre-build file, measured after the last test was
// written): 47 pass / 14 fail; 61 / 0 on preview-scan-rewrite. NEGATIVE CONTROLS (each restored by sha from a saved
// copy; reds here + in scorecard_scan_server_test + in scan_score_path_identity_test): the swap never taken -> 6 + 1 + 1;
// 'rewritten' counted as unsure -> 4 + 2 + 0; the FOCUS block never appended -> 1 + 1 + 1.
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { REPO_ROOT } = require('./helpers/load-script.js');
const V = require(path.join(REPO_ROOT, 'scorecard-validate.js'));

const PAR18 = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];   // 36 / 36
const SI18 = [7, 1, 17, 3, 11, 5, 15, 9, 13, 8, 2, 18, 4, 12, 6, 16, 10, 14];
const ROUND = {
    holes: 18, par: PAR18, strokeIndex: SI18, course: 'Test Links', tee: 'White',
    players: [{ name: 'Manny Orozco', handicap: 12 }, { name: 'Dave Smith', handicap: 18 }, { name: 'Test Golfer' }]
};

// A clean card: each player shoots par + offset on every hole, totals written.
function cleanRow(name, offset, opts) {
    const o = opts || {};
    const holes = PAR18.map((p, i) => ({ hole: i + 1, score: p + offset, confidence: 0.99 }));
    const out = holes.slice(0, 9).reduce((s, c) => s + c.score, 0);
    const inn = holes.slice(9).reduce((s, c) => s + c.score, 0);
    return Object.assign({ name, row_label_as_written: name, holes, written_out: out, written_in: inn, written_total: out + inn }, o);
}
function card(rows) { return V.parseModelOutput(JSON.stringify({ players: rows, notes: '' })); }
const reasonsAt = (v, row, hole) => v.rows[row].cells[hole].reasons;
const codes = (v) => v.hard.map((h) => h.code);

describe('the one constant and the shapes', () => {
    test('free scans are ONE constant, 3', () => {
        assert.equal(V.SCAN_FREE_LIMIT, 3);
    });
    test('the responseSchema matches handoff section 6', () => {
        const s = V.responseSchema();
        assert.equal(s.type, 'OBJECT');
        assert.deepEqual(s.required, ['players']);
        const p = s.properties.players.items;
        assert.deepEqual(p.required, ['name', 'holes', 'written_out', 'written_in', 'written_total']);
        assert.deepEqual(p.properties.holes.items.required, ['hole', 'score', 'confidence']);
        assert.equal(p.properties.holes.items.properties.score.type, 'INTEGER');
        assert.equal(p.properties.holes.items.properties.score.nullable, true);
        ['written_out', 'written_in', 'written_total'].forEach((k) => assert.equal(p.properties[k].nullable, true, k));
        assert.equal(s.properties.notes.type, 'STRING');
    });
    test('loads as a classic browser script too (window.ScorecardValidate)', () => {
        const sb = { window: {} };
        vm.runInNewContext(fs.readFileSync(path.join(REPO_ROOT, 'scorecard-validate.js'), 'utf8'), sb);
        assert.equal(typeof sb.window.ScorecardValidate.validateScan, 'function');
        assert.equal(sb.window.ScorecardValidate.SCAN_FREE_LIMIT, 3);
    });
});

describe('parseModelOutput: a bad shape is a failure, never a crash', () => {
    test('not JSON', () => assert.deepEqual(V.parseModelOutput('{nope'), { ok: false, error: 'not_json' }));
    test('empty string (a blocked answer)', () => assert.equal(V.parseModelOutput('').ok, false));
    test('no players array', () => assert.equal(V.parseModelOutput('{"notes":"x"}').error, 'bad_shape'));
    test('a hole without a number', () => {
        assert.equal(V.parseModelOutput({ players: [{ name: 'A', holes: [{ score: 4 }] }] }).error, 'bad_shape');
    });
    test('missing written totals become null; missing confidence becomes 0', () => {
        const r = V.parseModelOutput({ players: [{ name: 'A', holes: [{ hole: 1, score: 4 }] }] });
        assert.equal(r.ok, true);
        assert.equal(r.value.players[0].written_out, null);
        assert.equal(r.value.players[0].holes[0].confidence, 0);
    });
    test('an unparseable card validates as parse_error, which earns the retry', () => {
        const v = V.validateScan(V.parseModelOutput('garbage'), ROUND);
        assert.deepEqual(codes(v), ['parse_error']);
        assert.equal(V.needsRetry(v), true);
        assert.deepEqual(v.missingPlayers, ['Manny Orozco', 'Dave Smith', 'Test Golfer']);
    });
});

describe('a clean card passes', () => {
    test('no hard failures, no suspect cells, sums verified', () => {
        const v = V.validateScan(card([cleanRow('Manny Orozco', 1), cleanRow('Dave Smith', 2), cleanRow('Test Golfer', 0)]), ROUND);
        assert.equal(v.ok, true, JSON.stringify(v.hard));
        assert.equal(v.suspectCount, 0);
        assert.equal(V.needsRetry(v), false);
        assert.equal(v.rows[0].sums.out, 45);
        assert.equal(v.rows[0].sums.in, 45);
        assert.equal(v.rows[0].sums.total, 90);
        assert.deepEqual(v.rows[0].nines, { front: 'ok', back: 'ok' });
        assert.deepEqual(v.missingPlayers, []);
    });
    test('no written totals: nines are unchecked, not failed', () => {
        const rows = [cleanRow('Manny Orozco', 0, { written_out: null, written_in: null, written_total: null }),
            cleanRow('Dave Smith', 0), cleanRow('Test Golfer', 0)];
        const v = V.validateScan(card(rows), ROUND);
        assert.equal(v.ok, true);
        assert.deepEqual(v.rows[0].nines, { front: 'unchecked', back: 'unchecked' });
    });
});

describe('cell rules', () => {
    const base = () => [cleanRow('Manny Orozco', 0, { written_out: null, written_in: null, written_total: null }),
        cleanRow('Dave Smith', 0), cleanRow('Test Golfer', 0)];
    const one = (hole, patch, extra) => {
        const rows = base();
        Object.assign(rows[0].holes[hole - 1], patch);
        if (extra) Object.assign(rows[0], extra);
        return V.validateScan(card(rows), ROUND);
    };
    test('null score is suspect (blank)', () => assert.deepEqual(reasonsAt(one(3, { score: null }), 0, 3), ['blank']));
    test('non-integer is suspect', () => assert.ok(reasonsAt(one(3, { score: 4.5 }), 0, 3).includes('not_integer')));
    test('zero is out of range', () => assert.ok(reasonsAt(one(3, { score: 0 }), 0, 3).includes('out_of_range')));
    test('par + 6 is allowed by the range rule; par + 7 is not', () => {
        const ok = one(7, { score: 3 + 6 }, { name: 'Test Golfer' });   // hole 7 par 3, no handicap known
        assert.ok(!reasonsAt(ok, 0, 7).includes('out_of_range'));
        const bad = one(7, { score: 3 + 7 });
        assert.ok(reasonsAt(bad, 0, 7).includes('out_of_range'));
    });
    test('a 1 on a par 4 or par 5 is flagged; a 1 on a par 3 is not', () => {
        assert.ok(reasonsAt(one(1, { score: 1 }), 0, 1).includes('ace_on_par_4'));
        assert.ok(reasonsAt(one(2, { score: 1 }), 0, 2).includes('ace_on_par_5'));
        assert.deepEqual(reasonsAt(one(3, { score: 1 }), 0, 3), []);
    });
    test('above net double bogey + 3 is flagged when the handicap is known', () => {
        // Manny, handicap 12, hole 1 (par 4, SI 7): 1 stroke. NDB = 4+2+1 = 7; +3 = 10.
        assert.deepEqual(reasonsAt(one(1, { score: 10 }), 0, 1), []);
        // Hole 9 (par 4, SI 13): no stroke for a 12. NDB+3 = 9, under par+6.
        assert.deepEqual(reasonsAt(one(9, { score: 9 }), 0, 9), []);
        assert.deepEqual(reasonsAt(one(9, { score: 10 }), 0, 9), ['above_net_double_plus_3']);
        // Hole 3 (par 3, SI 17): no stroke for a 12. NDB+3 = 8.
        assert.deepEqual(reasonsAt(one(3, { score: 9 }), 0, 3), ['above_net_double_plus_3']);
    });
    test('the net double bogey rule is skipped with no handicap (no false amber)', () => {
        const rows = base();
        rows[2].holes[0].score = 10;   // Test Golfer, par 4, no handicap: 10 = par+6
        rows[2].written_out = null; rows[2].written_total = null;
        const v = V.validateScan(card(rows), ROUND);
        assert.deepEqual(reasonsAt(v, 2, 1), []);
    });
    test('confidence under 0.85 is suspect; 0.85 itself is not', () => {
        assert.deepEqual(reasonsAt(one(5, { confidence: 0.84 }), 0, 5), ['low_confidence']);
        assert.deepEqual(reasonsAt(one(5, { confidence: 0.85 }), 0, 5), []);
    });
    test('up to 3 suspect cells: no retry; a 4th is a hard failure', () => {
        const rows = base();
        [1, 2, 3].forEach((h) => { rows[0].holes[h - 1].confidence = 0.5; });
        const three = V.validateScan(card(rows), ROUND);
        assert.equal(three.suspectCount, 3);
        assert.equal(three.ok, false);
        assert.equal(V.needsRetry(three), false);
        rows[0].holes[3].confidence = 0.5;
        const four = V.validateScan(card(rows), ROUND);
        assert.ok(codes(four).includes('too_many_suspect'));
        assert.deepEqual(four.hard.find((h) => h.code === 'too_many_suspect'), { code: 'too_many_suspect', count: 4 });
        assert.equal(V.needsRetry(four), true);
    });
    test('the 4-cell threshold counts the model\'s own doubts, never the amber a wrong written total paints', () => {
        const rows = base();
        rows[0].written_out += 1;           // nine cells amber from the pen alone
        const v = V.validateScan(card(rows), ROUND);
        assert.equal(v.suspectCount, 9);    // the app still paints all nine
        assert.equal(v.unsureCount, 0);
        assert.ok(!codes(v).includes('too_many_suspect'));
        rows[0].holes[9].confidence = 0.5; rows[0].holes[10].confidence = 0.5; rows[0].holes[11].confidence = 0.5;
        assert.ok(!codes(V.validateScan(card(rows), ROUND)).includes('too_many_suspect'), '3 doubts + 9 amber: under the threshold');
        rows[0].holes[12].confidence = 0.5;
        const v4 = V.validateScan(card(rows), ROUND);
        assert.deepEqual(v4.hard.find((h) => h.code === 'too_many_suspect'), { code: 'too_many_suspect', count: 4 });
        assert.equal(V.needsRetry(v4), true);
    });
});

describe('sums against what was written', () => {
    const rows = () => [cleanRow('Manny Orozco', 0), cleanRow('Dave Smith', 0), cleanRow('Test Golfer', 0)];
    test('OUT mismatch flags every cell of the front nine, and only that nine', () => {
        const r = rows();
        r[0].holes[4].score = 5;   // read a 5 where the card says 4; written OUT still 36
        const v = V.validateScan(card(r), ROUND);
        // OUT is wrong, so the written TOTAL cannot prove the front either;
        // the back nine proved itself and stays clean.
        assert.deepEqual(v.hard.filter((h) => h.code === 'sum_mismatch'),
            [{ code: 'sum_mismatch', row: 0, nine: 'out' }, { code: 'sum_mismatch', row: 0, nine: 'total' }]);
        for (let h = 1; h <= 9; h++) assert.ok(reasonsAt(v, 0, h).includes('check_this_nine'), 'hole ' + h);
        for (let h = 10; h <= 18; h++) assert.ok(!v.rows[0].cells[h].suspect, 'hole ' + h);
        assert.equal(v.rows[0].nines.front, 'mismatch');
        // Every digit read at 0.99: the mismatch is the pen's, and it earns no retry (Manny's OK 2026-11-16, speed fix A).
        assert.equal(V.needsRetry(v), false);
        assert.equal(v.unsureCount, 0);
        assert.ok(!codes(v).includes('unsure_nine'));
        // The wrong cell is among the flagged ones: no wrong cell left unflagged.
        assert.equal(v.rows[0].cells[5].suspect, true);
    });
    test('a mismatched nine that holds a cell the model doubted DOES earn the retry (unsure_nine)', () => {
        const r = rows();
        r[0].holes[4].score = 5;
        r[0].holes[4].confidence = 0.6;
        const v = V.validateScan(card(r), ROUND);
        assert.deepEqual(codes(v).filter((c) => c !== 'sum_mismatch'), ['unsure_nine']);
        assert.deepEqual(v.hard.find((h) => h.code === 'unsure_nine'), { code: 'unsure_nine', row: 0, nine: 'out' });
        assert.equal(v.unsureCount, 1);
        assert.equal(V.needsRetry(v), true);
        // The doubt has to sit IN the mismatched nine: a doubted cell on the clean back nine is one amber cell, no retry.
        const r2 = rows();
        r2[0].holes[4].score = 5;
        r2[0].holes[12].confidence = 0.6;
        const v2 = V.validateScan(card(r2), ROUND);
        assert.ok(!codes(v2).includes('unsure_nine'));
        assert.equal(V.needsRetry(v2), false);
    });
    test('a wrong written TOTAL over an unchecked nine with a doubted cell earns the retry too', () => {
        const r = rows();
        r[0].written_out = null;            // no OUT written: the front nine is unchecked
        r[0].written_total = 73;            // the total disagrees (holes add to 72)
        r[0].holes[2].confidence = 0.5;     // and a front-nine digit was doubted
        const v = V.validateScan(card(r), ROUND);
        assert.ok(codes(v).includes('sum_mismatch'));
        assert.deepEqual(v.hard.find((h) => h.code === 'unsure_nine'), { code: 'unsure_nine', row: 0, nine: 'total' });
        assert.equal(V.needsRetry(v), true);
        r[0].holes[2].confidence = 0.99;    // no doubt: the pen added wrong, no retry
        const v2 = V.validateScan(card(r), ROUND);
        assert.ok(codes(v2).includes('sum_mismatch'));
        assert.equal(V.needsRetry(v2), false);
    });
    test('IN mismatch flags the back nine', () => {
        const r = rows();
        r[1].written_in = 37;
        const v = V.validateScan(card(r), ROUND);
        assert.equal(v.rows[1].nines.back, 'mismatch');
        for (let h = 10; h <= 18; h++) assert.ok(v.rows[1].cells[h].suspect);
        for (let h = 1; h <= 9; h++) assert.ok(!v.rows[1].cells[h].suspect);
    });
    test('a blank cell can never match a written nine', () => {
        const r = rows();
        r[0].holes[0].score = null;
        r[0].written_out = 36 - 4;   // even if the remaining digits add up
        const v = V.validateScan(card(r), ROUND);
        assert.equal(v.rows[0].nines.front, 'mismatch');
    });
    test('TOTAL mismatch with no OUT/IN written flags the whole card', () => {
        const r = rows();
        r[0].written_out = null; r[0].written_in = null; r[0].written_total = 73;
        const v = V.validateScan(card(r), ROUND);
        assert.ok(v.hard.some((h) => h.code === 'sum_mismatch' && h.nine === 'total'));
        for (let h = 1; h <= 18; h++) assert.ok(reasonsAt(v, 0, h).includes('check_total'));
    });
    test('TOTAL wrong but both nines verified: the pen added wrong, no cell flagged', () => {
        const r = rows();
        r[0].written_total = 73;
        const v = V.validateScan(card(r), ROUND);
        assert.equal(v.rows[0].totalWrittenWrong, true);
        assert.ok(!codes(v).includes('sum_mismatch'));
        assert.equal(v.suspectCount, 0);
    });
});

describe('names', () => {
    test('initials, first name, last name, a nickname and one pen slip all match', () => {
        const players = [{ name: 'Manny Orozco' }, { name: 'Dave Smith', nicknames: ['Smitty'] }, { name: 'Robert Jones' }, { name: 'Chris Lee' }];
        const m = V.matchNames([
            { name: 'UNKNOWN:MO', row_label_as_written: 'MO' },
            { name: 'UNKNOWN:Smitty', row_label_as_written: 'Smitty' },
            { name: 'UNKNOWN:Jones', row_label_as_written: 'Jones' },
            { name: 'UNKNOWN:Chrs', row_label_as_written: 'Chrs' }
        ], players);
        assert.deepEqual(m.map((x) => x.index), [0, 1, 2, 3]);
        assert.ok(m.every((x) => x.match === 'fuzzy'));
    });
    test('the exact known name the model returned is an exact match', () => {
        const m = V.matchNames([{ name: 'Dave Smith', row_label_as_written: 'DS' }], ROUND.players);
        assert.deepEqual(m, [{ index: 1, match: 'exact' }]);
    });
    test('no duplicates: two rows claiming one golfer -> the second is a duplicate', () => {
        const rows = [cleanRow('Manny Orozco', 0), cleanRow('Manny Orozco', 0), cleanRow('Test Golfer', 0)];
        const v = V.validateScan(card(rows), ROUND);
        assert.equal(v.rows[0].index, 0);
        assert.equal(v.rows[1].match, 'duplicate');
        assert.ok(codes(v).includes('duplicate_name'));
        assert.deepEqual(v.missingPlayers, ['Dave Smith']);
        assert.equal(V.needsRetry(v), true);
    });
    test('an unmatched name is a hard failure and its cells are suspect', () => {
        const rows = [cleanRow('Manny Orozco', 0), cleanRow('UNKNOWN:Zed', 0, { row_label_as_written: 'Zed' }), cleanRow('Test Golfer', 0)];
        const v = V.validateScan(card(rows), ROUND);
        assert.ok(codes(v).includes('unmatched_name'));
        assert.ok(reasonsAt(v, 1, 1).includes('unmatched_name'));
        assert.deepEqual(v.missingPlayers, ['Dave Smith']);
    });
    test('two-letter guesses do not prefix-match by accident', () => {
        assert.equal(V.nameScore('Ma', { name: 'Manny Orozco' }), 0);
        assert.equal(V.nameScore('', { name: 'Manny Orozco' }), 0);
    });
    test('player count must match the round', () => {
        const v = V.validateScan(card([cleanRow('Manny Orozco', 0), cleanRow('Dave Smith', 0)]), ROUND);
        assert.ok(v.hard.some((h) => h.code === 'player_count' && h.found === 2 && h.expected === 3));
        assert.deepEqual(v.missingPlayers, ['Test Golfer']);
    });
});

describe('hole count', () => {
    test('a 9-hole read of an 18-hole round is a hard failure; missing cells are suspect', () => {
        const rows = [cleanRow('Manny Orozco', 0), cleanRow('Dave Smith', 0), cleanRow('Test Golfer', 0)];
        rows[0].holes = rows[0].holes.slice(0, 9);
        const v = V.validateScan(card(rows), ROUND);
        assert.ok(codes(v).includes('hole_count'));
        assert.deepEqual(reasonsAt(v, 0, 12), ['missing', 'check_this_nine', 'check_total']);
    });
    test('a hole the round does not play, or a repeated hole, is a wrong hole count', () => {
        const rows = [cleanRow('Manny Orozco', 0), cleanRow('Dave Smith', 0), cleanRow('Test Golfer', 0)];
        rows[0].holes.push({ hole: 19, score: 4, confidence: 1 });
        assert.ok(codes(V.validateScan(card(rows), ROUND)).includes('hole_count'));
        rows[0].holes.pop(); rows[0].holes.push({ hole: 3, score: 4, confidence: 1 });
        assert.ok(codes(V.validateScan(card(rows), ROUND)).includes('hole_count'));
    });
    test('a 9-hole round on the back nine expects holes 10-18 and checks IN only', () => {
        const round9 = Object.assign({}, ROUND, { holes: 9, startHole: 10, players: [{ name: 'Manny Orozco' }] });
        assert.deepEqual(V.expectedHoles(round9), [10, 11, 12, 13, 14, 15, 16, 17, 18]);
        const row = cleanRow('Manny Orozco', 0);
        row.holes = row.holes.slice(9); row.written_out = null; row.written_total = row.written_in;
        const v = V.validateScan(card([row]), round9);
        assert.equal(v.ok, true, JSON.stringify(v.hard));
        assert.deepEqual(v.rows[0].nines, { front: null, back: 'ok' });
        assert.equal(v.rows[0].sums.out, null);
    });
});

describe('the four LIVE handwritten reads of Nov 16 2026 (helpers/fixtures/scan-handwritten-reads.json)', () => {
    // Two cards (Papago, The Legacy), two live Flash reads each, every hole right against the Advisor's answer keys and
    // every cell at 0.99; the pens had added wrong (Manny OUT/TOT; James and Harry IN/TOT). Live, each cost a Pro retry
    // that was never kept. The mismatches must still reach the golfer; the retry must not fire.
    const fx = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'helpers/fixtures/scan-handwritten-reads.json'), 'utf8')).cases;
    const WRONG = { 'papago-1': [[0, 'out']], 'papago-2': [[0, 'out']], 'legacy-1': [[0, 'in'], [1, 'in']], 'legacy-2': [[0, 'in'], [1, 'in']] };
    Object.keys(fx).forEach((k) => {
        test(k + ': the wrong nines stay red and amber, no retry', () => {
            const c = fx[k];
            assert.equal(c.live.retried, true, 'positive: the live scan did retry before the fix');
            const v = V.validateScan(V.parseModelOutput(JSON.stringify(c.model)), c.round);
            WRONG[k].forEach(([row, nine]) => {
                assert.ok(v.hard.some((h) => h.code === 'sum_mismatch' && h.row === row && h.nine === nine), k + ' row ' + row + ' ' + nine);
                assert.equal(v.rows[row].nines[nine === 'out' ? 'front' : 'back'], 'mismatch');
                const holes = nine === 'out' ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [10, 11, 12, 13, 14, 15, 16, 17, 18];
                holes.forEach((h) => assert.equal(v.rows[row].cells[h].suspect, true, 'amber ' + h));
            });
            assert.equal(v.suspectCount, c.live.suspectCount, 'the amber count the app paints is unchanged');
            assert.equal(v.unsureCount, 0);
            assert.ok(!codes(v).includes('too_many_suspect'));
            assert.ok(!codes(v).includes('unsure_nine'));
            assert.equal(V.needsRetry(v), false);
            assert.equal(v.rows.filter((r) => r.match === 'exact').length, 4, 'all four cursive names matched');
        });
    });
    test('control: the same Papago read with one doubted digit inside the wrong nine retries', () => {
        const c = fx['papago-1'];
        const m = JSON.parse(JSON.stringify(c.model));
        m.players[0].holes[2].confidence = 0.5;
        const v = V.validateScan(V.parseModelOutput(JSON.stringify(m)), c.round);
        assert.ok(codes(v).includes('unsure_nine'));
        assert.equal(V.needsRetry(v), true);
    });
});

describe('the retry decision and the better read', () => {
    const clean = () => V.validateScan(card([cleanRow('Manny Orozco', 0), cleanRow('Dave Smith', 0), cleanRow('Test Golfer', 0)]), ROUND);
    test('no hard failure, no retry - even with a few amber cells', () => {
        assert.equal(V.needsRetry(clean()), false);
        assert.equal(V.needsRetry(null), false);
    });
    test('betterOf: fewer hard failures, then fewer suspects; a tie keeps the first', () => {
        const a = { hard: [{ code: 'x' }], suspectCount: 0 };
        const b = { hard: [], suspectCount: 5 };
        assert.equal(V.betterOf(a, b), 'second');
        assert.equal(V.betterOf(b, a), 'first');
        assert.equal(V.betterOf({ hard: [], suspectCount: 2 }, { hard: [], suspectCount: 1 }), 'second');
        assert.equal(V.betterOf({ hard: [], suspectCount: 1 }, { hard: [], suspectCount: 1 }), 'first');
        assert.equal(V.betterOf(a, null), 'first');
    });
    test('strokesOn: plain allocation for the plausibility ceiling only', () => {
        assert.equal(V.strokesOn(12, 7, 18), 1);
        assert.equal(V.strokesOn(12, 13, 18), 0);
        assert.equal(V.strokesOn(20, 1, 18), 2);
        assert.equal(V.strokesOn(20, 3, 18), 1);
        assert.equal(V.strokesOn(undefined, 1, 18), null);
    });
});

describe('the prompt carries the round context (handoff section 5)', () => {
    const p = V.buildPrompt(Object.assign({}, ROUND, { players: [{ name: 'Manny Orozco', initials: 'MO' }, { name: 'Dave Smith' }] }));
    test('course, tee, holes, par, stroke index, names in order', () => {
        assert.match(p, /Test Links \(White tees\)/);
        assert.match(p, /plays 18 holes/);
        assert.match(p, /Par per hole: 1=4, 2=5, 3=3/);
        assert.match(p, /Stroke index per hole: 1=7, 2=1/);
        assert.match(p, /1\. Manny Orozco \(also written as: MO\)\n2\. Dave Smith/);
    });
    test('the reading rules', () => {
        assert.match(p, /ONLY the gross strokes/);
        assert.match(p, /Ignore putts, dots/);
        assert.match(p, /score null/);
        assert.match(p, /Never guess or invent/);
        assert.match(p, /exactly as written/);
    });
    test('the crossed-out rule, 2026-11-17 wording: a cell may hold two digits; the correction is the score; the struck one goes in other; unsure = null + other', () => {
        const i = p.indexOf('crossed out');
        assert.ok(i > 0, 'the rule is in the prompt');
        const rule = p.slice(p.lastIndexOf('\n', i) + 1, p.indexOf('\n', i));
        assert.match(rule, /^- A cell may hold TWO digits: an earlier one crossed out, scribbled over or written over, and the correction written beside, above or on top of it, often smaller or heavier\./);
        assert.match(rule, /The correction is the score; put the crossed-out digit in other \(null when the cell shows one digit\)/);
        assert.match(rule, /return score null with low confidence and the digit you doubt in other/);
        assert.ok(!/A digit that is crossed out, scribbled over or struck through is NOT the score/.test(p), 'the Nov 16 sentence is replaced, not kept beside the new one');
        assert.equal((p.match(/crossed out/g) || []).length, 1, 'one rule, once');
        assert.ok(p.indexOf('Ignore putts') < i, 'it follows the ignore-the-marks rule, so "circles" cannot be read as "ignore the rewrite"');
        assert.ok(!/FOCUS - a second/.test(p), 'the first read has no FOCUS block');
    });
    test('FOCUS (2026-11-17): buildPrompt(ctx, focus) appends the block naming each row, its holes and both figures; an empty focus changes nothing', () => {
        const CTX = Object.assign({}, ROUND, { players: [{ name: 'Manny Orozco', initials: 'MO' }, { name: 'Dave Smith' }] });
        assert.equal(V.buildPrompt(CTX, []), p);
        assert.equal(V.buildPrompt(CTX, null), p);
        const f = [{ name: 'Dave Smith', nine: 'out', holes: [1, 2, 3, 4, 5, 6, 7, 8, 9], written: 49, sum: 48 }, { name: 'Test Golfer', nine: 'in', holes: [10, 11, 12, 13, 14, 15, 16, 17, 18], written: 40, sum: 42 }];
        const q = V.buildPrompt(CTX, f);
        assert.equal(q.indexOf(p), 0, 'the first prompt, then the block');
        const block = q.slice(p.length);
        assert.match(block, /^\nFOCUS - a second, careful read\. The first read of these cells did not add up to what the pen wrote:\n/);
        assert.match(block, /- Dave Smith, holes 1-9: the written OUT is 49 but the digits read add to 48\. Look at each of these cells for a second digit/);
        assert.match(block, /- Test Golfer, holes 10-18: the written IN is 40 but the digits read add to 42\./);
        assert.match(block, /The correction is the score; the struck digit goes in other\./);
        assert.match(block, /Return the whole card again, every player and every hole, with these cells read again\.$/);
        assert.match(V.buildPrompt(CTX, [{ name: 'X', nine: 'total', holes: [1, 2], written: 9, sum: 8 }]), /the written TOTAL is 9 but the digits read add to 8/);
    });
});

// 2026-11-17 (Manny, typed in the tournaments tab: "On a branch, no deploy: improve crossed-out/rewritten digit reading
// (both test cards must pass)"). The two synthetic rewrite cards (s04, s11) read the struck digit; see the header of
// scorecard-validate.js. Held here: the schema's `other`, the parse, the swap the pen decides (one cell, two cells, not
// taken when it does not add up, TOT-only cards), amber-not-unsure, applyRewrites for the app, focusFor.
describe('REWRITTEN DIGITS: other, the swap the pen decides, focusFor', () => {
    const R1 = Object.assign({}, ROUND, { players: [ROUND.players[0]] });   // one golfer, so player_count stays quiet
    const rowWith = (name, offset, mut, written) => {
        const r = cleanRow(name, offset);
        mut(r.holes);
        if (written) Object.assign(r, written);
        return r;
    };
    const sumOf = (holes, from, to) => holes.slice(from, to).reduce((s, c) => s + c.score, 0);
    test('the schema carries other per cell (INTEGER, nullable), not required', () => {
        const cell = V.responseSchema().properties.players.items.properties.holes.items;
        assert.deepEqual(cell.properties.other, { type: 'INTEGER', nullable: true, description: 'a second digit visible in the same cell: the crossed-out, scribbled-over or overwritten one; null when the cell shows one digit' });
        assert.deepEqual(cell.required, ['hole', 'score', 'confidence']);
    });
    test('parse: other is carried when it is a whole number, null otherwise', () => {
        const r = cleanRow('Manny Orozco', 0); r.holes[5].other = 5; r.holes[6].other = '7'; r.holes[7].other = 4.5;
        const v = card([r]).value.players[0].holes;
        assert.equal(v[5].other, 5); assert.equal(v[6].other, null); assert.equal(v[7].other, null); assert.equal(v[0].other, null);
    });
    test('THE SWAP: hole 6 reads 4 with other 5, the OUT needs the 5 -> score 5, other 4, swapped, reasons [rewritten], the nine ok, no hard, not unsure, no retry', () => {
        const r = rowWith('Manny Orozco', 0, (h) => { h[5].score = 4; h[5].other = 5; });   // par 4 on 6: the truth is 5
        r.written_out = sumOf(r.holes, 0, 9) + 1; r.written_total = r.written_out + r.written_in;
        const v = V.validateScan(card([r]), R1);
        const c = v.rows[0].cells[6];
        assert.deepEqual([c.score, c.other, c.swapped, c.reasons, c.suspect], [5, 4, true, ['rewritten'], true]);
        assert.deepEqual(v.rows[0].nines, { front: 'ok', back: 'ok' });
        assert.deepEqual(v.hard, []);
        assert.equal(v.suspectCount, 1); assert.equal(v.unsureCount, 0);
        assert.equal(V.needsRetry(v), false);
        assert.equal(v.rows[0].sums.out, r.written_out, 'the sums are the resolved sums');
    });
    test('the model read it right already (score 5, other 4) and the nine adds up: amber [rewritten], no swap, nothing hard', () => {
        const r = rowWith('Manny Orozco', 0, (h) => { h[5].score = 5; h[5].other = 4; });
        r.written_out = sumOf(r.holes, 0, 9); r.written_total = r.written_out + r.written_in;
        const v = V.validateScan(card([r]), R1);
        const c = v.rows[0].cells[6];
        assert.deepEqual([c.score, c.other, c.swapped, c.reasons], [5, 4, false, ['rewritten']]);
        assert.deepEqual(v.hard, []); assert.equal(v.unsureCount, 0);
    });
    test('NOT TAKEN: the other does not make the nine add up -> the score stands, the nine is a mismatch, every cell amber, still no Pro retry', () => {
        const r = rowWith('Manny Orozco', 0, (h) => { h[5].score = 4; h[5].other = 7; });
        r.written_out = sumOf(r.holes, 0, 9) + 1; r.written_total = r.written_out + r.written_in;
        const v = V.validateScan(card([r]), R1);
        const c = v.rows[0].cells[6];
        assert.deepEqual([c.score, c.other, c.swapped], [4, 7, false]);
        assert.deepEqual(c.reasons, ['rewritten', 'check_this_nine', 'check_total'], 'the OUT and the TOT both disagree');
        assert.equal(v.rows[0].nines.front, 'mismatch');
        assert.deepEqual(codes(v), ['sum_mismatch', 'sum_mismatch']);
        assert.equal(V.needsRetry(v), false, 'a rewrite is not a doubt: no Pro');
    });
    test('TWO cells: neither alone adds up, both together do -> both swapped', () => {
        const r = rowWith('Manny Orozco', 0, (h) => { h[1].score = 5; h[1].other = 6; h[5].score = 4; h[5].other = 5; });   // truths 6 and 5: +2
        r.written_out = sumOf(r.holes, 0, 9) + 2; r.written_total = r.written_out + r.written_in;
        const v = V.validateScan(card([r]), R1);
        assert.equal(v.rows[0].cells[2].swapped, true); assert.equal(v.rows[0].cells[6].swapped, true);
        assert.equal(v.rows[0].cells[2].score, 6); assert.equal(v.rows[0].cells[6].score, 5);
        assert.equal(v.rows[0].nines.front, 'ok'); assert.deepEqual(v.hard, []);
    });
    test('ONE of two: when a single swap already adds up, only that one is taken (the other stays amber, unswapped)', () => {
        const r = rowWith('Manny Orozco', 0, (h) => { h[1].score = 5; h[1].other = 6; h[5].score = 5; h[5].other = 4; });
        r.written_out = sumOf(r.holes, 0, 9) + 1; r.written_total = r.written_out + r.written_in;
        const v = V.validateScan(card([r]), R1);
        assert.equal(v.rows[0].cells[2].swapped, true); assert.equal(v.rows[0].cells[6].swapped, false);
        assert.equal(v.rows[0].nines.front, 'ok');
    });
    test('the back nine against the IN, and a TOT-only card (no OUT / IN written) against the TOTAL', () => {
        const r = rowWith('Manny Orozco', 0, (h) => { h[12].score = 4; h[12].other = 6; });   // hole 13, par 5: truth 6
        r.written_in = sumOf(r.holes, 9, 18) + 2; r.written_total = r.written_out + r.written_in;
        const v = V.validateScan(card([r]), R1);
        assert.equal(v.rows[0].cells[13].score, 6); assert.equal(v.rows[0].nines.back, 'ok'); assert.deepEqual(v.hard, []);
        const t = rowWith('Manny Orozco', 0, (h) => { h[12].score = 4; h[12].other = 6; });
        t.written_out = null; t.written_in = null; t.written_total = sumOf(t.holes, 0, 18) + 2;
        const w = V.validateScan(card([t]), R1);
        assert.equal(w.rows[0].cells[13].score, 6); assert.deepEqual(w.hard, []); assert.equal(w.rows[0].totalWrittenWrong, undefined);
    });
    test('a nine with a blank is left alone (no sum to judge); a nine the pen did not total is left alone', () => {
        const r = rowWith('Manny Orozco', 0, (h) => { h[0].score = null; h[5].score = 4; h[5].other = 5; });
        r.written_out = 40; r.written_total = null;
        const v = V.validateScan(card([r]), R1);
        assert.equal(v.rows[0].cells[6].swapped, false); assert.equal(v.rows[0].cells[6].score, 4);
        const u = rowWith('Manny Orozco', 0, (h) => { h[5].score = 4; h[5].other = 5; });
        u.written_out = null; u.written_in = null; u.written_total = null;
        assert.equal(V.validateScan(card([u]), R1).rows[0].cells[6].swapped, false);
    });
    test('amber, never unsure: four rewrites on one card do not reach too_many_suspect and earn no retry; a low-confidence cell still does', () => {
        const r = rowWith('Manny Orozco', 0, (h) => { [1, 3, 5, 7].forEach((i) => { h[i].other = h[i].score + 1; }); });
        const v = V.validateScan(card([r]), R1);
        assert.equal(v.suspectCount, 4); assert.equal(v.unsureCount, 0);
        assert.ok(!codes(v).includes('too_many_suspect')); assert.equal(V.needsRetry(v), false);
        const d = rowWith('Manny Orozco', 0, (h) => { h[5].other = 5; h[5].confidence = 0.4; });
        const w = V.validateScan(card([d]), R1);
        assert.deepEqual(reasonsAt(w, 0, 6), ['low_confidence', 'rewritten']);
        assert.equal(w.unsureCount, 1);
    });
    test('applyRewrites: the result the app reads carries the swapped score and the struck digit; the parsed value is untouched; a pure copy', () => {
        const r = rowWith('Manny Orozco', 0, (h) => { h[5].score = 4; h[5].other = 5; });
        r.written_out = sumOf(r.holes, 0, 9) + 1; r.written_total = r.written_out + r.written_in;
        const parsed = card([r]); const before = JSON.stringify(parsed.value);
        const v = V.validateScan(parsed, R1);
        const out = V.applyRewrites(parsed.value, v);
        assert.deepEqual(out.players[0].holes[5], { hole: 6, score: 5, confidence: 0.99, other: 4 });
        assert.deepEqual(out.players[0].holes[4], { hole: 5, score: 4, confidence: 0.99, other: null });
        assert.equal(JSON.stringify(parsed.value), before, 'input untouched');
        assert.notEqual(out, parsed.value); assert.equal(out.players[0].name, 'Manny Orozco'); assert.equal(out.players[0].written_out, r.written_out);
        assert.equal(V.applyRewrites(null, v), null);
    });
    test('focusFor: every mismatched nine after the swaps, with the pen figure and the digits sum; a clean card and a swapped card give none; TOT-only cards give the total', () => {
        const clean = V.validateScan(card([cleanRow('Manny Orozco', 0)]), R1);
        assert.deepEqual(V.focusFor(clean, R1), []);
        const r = rowWith('Manny Orozco', 0, (h) => { h[5].score = 4; h[5].other = 5; });
        r.written_out = sumOf(r.holes, 0, 9) + 1; r.written_total = r.written_out + r.written_in;
        assert.deepEqual(V.focusFor(V.validateScan(card([r]), R1), R1), [], 'the swap settled it');
        const m = cleanRow('Manny Orozco', 0); m.written_out += 1; m.written_total += 1;
        const d = cleanRow('Dave Smith', 1); d.written_in += 2; d.written_total += 2;
        const f = V.focusFor(V.validateScan(card([m, d]), ROUND), ROUND);
        assert.deepEqual(f, [
            { name: 'Manny Orozco', nine: 'out', holes: [1, 2, 3, 4, 5, 6, 7, 8, 9], written: m.written_out, sum: m.written_out - 1 },
            { name: 'Dave Smith', nine: 'in', holes: [10, 11, 12, 13, 14, 15, 16, 17, 18], written: d.written_in, sum: d.written_in - 2 }
        ]);
        const t = cleanRow('Manny Orozco', 0); t.written_out = null; t.written_in = null; t.written_total += 1;
        assert.deepEqual(V.focusFor(V.validateScan(card([t]), R1), R1), [{ name: 'Manny Orozco', nine: 'total', holes: ROUND.par.map((_, i) => i + 1), written: t.written_total, sum: t.written_total - 1 }]);
        assert.deepEqual(V.focusFor(null, ROUND), []);
    });
});
