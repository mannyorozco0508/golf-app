// ============================================================================
// SCORECARD SCAN - the shared validator (scorecard-validate.js), held to
// section 7 of grok/CLAUDE-HANDOFF-scorecard-scan-2026-10-24.md.
//
// The server uses this to decide on the one Pro retry; the app uses it to paint
// the confirm grid. If a rule here is wrong, both are wrong the same way -
// which is the point of one file, and why every rule has a test.
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
        assert.equal(V.needsRetry(four), true);
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
        assert.equal(V.needsRetry(v), true);
        // The wrong cell is among the flagged ones: no wrong cell left unflagged.
        assert.equal(v.rows[0].cells[5].suspect, true);
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
});
