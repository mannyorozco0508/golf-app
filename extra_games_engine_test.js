// ============================================================================
// HARDPAN - BINGO BANGO BONGO + VEGAS: the two NEW engines (gps-games)
//
// The settlement math with the worked examples from the engines' headers, the
// edge cases (untapped points, missing scores, 10+, both teams birdie), and the
// proof that no existing money file was touched: each is byte-identical to main.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ON = fs.existsSync(path.join(__dirname, 'bbb-engine.js'));
const skip = ON ? false : 'Consumer tree: no extra games';
const B = ON ? require('./bbb-engine.js') : null;
const V = ON ? require('./vegas-engine.js') : null;
const P = (ids) => ids.map((id) => ({ id, name: 'P' + id }));
// points on holes 1.. : each row [bingo, bango, bongo]
const pts = (rows) => rows.reduce((o, r, i) => { o['h' + (i + 1)] = { bingo: r[0], bango: r[1], bongo: r[2] }; return o; }, {});
const card = (pars) => pars.map((par, i) => ({ hole: i + 1, par }));
const sc = (h, a1, a2, b1, b2) => ({ ['p1_h' + h]: a1, ['p2_h' + h]: a2, ['p3_h' + h]: b1, ['p4_h' + h]: b2 });
const teams = { vegasTeamA: [1, 2], vegasTeamB: [3, 4] };

test('BBB example 1: $1/pt, A 10 B 5 C 3 -> A +12, B -3, C -9; C pays A $9, B pays A $3', { skip }, () => {
    const rows = [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 2, 2], [2, 2, 3], [3, 3, 2]];
    const r = B.calculateBBB({ bbbPointVal: 1, points: pts(rows) }, P([1, 2, 3]));
    assert.deepEqual(r.points, { 1: 10, 2: 5, 3: 3 });
    assert.deepEqual(r.net, { 1: 12, 2: -3, 3: -9 });
    assert.deepEqual(r.payments, [{ from: '3', to: '1', amount: 9 }, { from: '2', to: '1', amount: 3 }]);
});

test('BBB example 2: $2/pt, A 6 B 6 C 4 D 2 -> +12 +12 -4 -20; D pays A 12, D pays B 8, C pays B 4', { skip }, () => {
    const rows = [[1, 1, 1], [1, 1, 1], [2, 2, 2], [2, 2, 2], [3, 3, 3], [3, 4, 4]];
    const r = B.calculateBBB({ bbbPointVal: 2, points: pts(rows) }, P([1, 2, 3, 4]));
    assert.deepEqual(r.points, { 1: 6, 2: 6, 3: 4, 4: 2 });
    assert.deepEqual(r.net, { 1: 12, 2: 12, 3: -4, 4: -20 });
    assert.deepEqual(r.payments, [{ from: '4', to: '1', amount: 12 }, { from: '4', to: '2', amount: 8 }, { from: '3', to: '2', amount: 4 }]);
});

test('BBB: untapped points, golfers outside the game, a lone golfer, $0.25 cents, always zero-sum', { skip }, () => {
    const r = B.calculateBBB({ bbbPointVal: 0.25, participantIds: ['1', '2'], points: { h1: { bingo: 1, bango: 9, bongo: null }, h2: { bongo: 2 }, x: { bingo: 1 } } }, P([1, 2, 3]));
    assert.deepEqual(r.players.map((p) => p.id), [1, 2]);
    assert.deepEqual([r.totalPoints, r.holesPlayed], [2, 2], 'golfer 9 and the null are not points; "x" is not a hole');
    assert.deepEqual(r.net, { 1: 0, 2: 0 });
    const one = B.calculateBBB({ bbbPointVal: 5, points: pts([[1, 1, 1]]) }, P([1]));
    assert.deepEqual(one.net, { 1: 0 });
    const z = B.calculateBBB({ bbbPointVal: 0.25, points: pts([[1, 2, 3], [1, 1, 3], [4, 4, 4]]) }, P([1, 2, 3, 4]));
    assert.equal(Object.values(z.net).reduce((a, b) => a + b, 0), 0);
    assert.equal(B.calculateBBB(null, P([1, 2])).totalPoints, 0);
});

test('Vegas example 1: $1/pt, 45 v 56 -> A wins 11; A +$11 each, B -$11 each', { skip }, () => {
    const r = V.calculateVegas(Object.assign({ vegasPointVal: 1 }, teams), card([4, 4]), sc(1, 4, 5, 5, 6));
    assert.deepEqual(r.holes, [{ hole: 1, par: 4, a: 45, b: 56, flipA: false, flipB: false, winner: 'A', points: 11 }]);
    assert.deepEqual(r.net, { 1: 11, 2: 11, 3: -11, 4: -11 });
    assert.deepEqual(r.payments, [{ from: '3', to: '1', amount: 11 }, { from: '4', to: '2', amount: 11 }]);
});

test('Vegas example 2: $0.50, birdie flip: 36 v 54 (A +18), then 65 v 47 (B +18) -> level, $0', { skip }, () => {
    const s = Object.assign(sc(1, 3, 6, 5, 4), sc(2, 5, 6, 4, 7));
    const r = V.calculateVegas(Object.assign({ vegasPointVal: 0.5, vegasBirdieFlip: true }, teams), card([4, 5]), s);
    assert.deepEqual(r.holes.map((h) => [h.a, h.b, h.winner, h.points]), [[36, 54, 'A', 18], [65, 47, 'B', 18]]);
    assert.deepEqual(r.net, { 1: 0, 2: 0, 3: 0, 4: 0 });
    assert.deepEqual(r.payments, []);
    const off = V.calculateVegas(Object.assign({ vegasPointVal: 0.5 }, teams), card([4, 5]), s);
    assert.deepEqual(off.holes.map((h) => [h.a, h.b]), [[36, 45], [56, 47]], 'flip off: low first always');
});

test('Vegas: 10+ leads, both birdie = no flip, a hole counts only with all 4 scores, start hole, bad teams', { skip }, () => {
    assert.equal(V.vegasNumber(4, 10, false), 104);
    assert.equal(V.vegasNumber(10, 4, true), 104);
    assert.equal(V.vegasNumber(5, 5, true), 55);
    const both = V.calculateVegas(Object.assign({ vegasPointVal: 1, vegasBirdieFlip: true }, teams), card([4]), sc(1, 3, 5, 3, 6));
    assert.deepEqual([both.holes[0].a, both.holes[0].b, both.holes[0].points], [35, 36, 1]);
    const part = V.calculateVegas(Object.assign({ vegasPointVal: 1 }, teams), card([4, 4]), Object.assign(sc(1, 4, 4, 4, 4), { p1_h2: 4, p2_h2: 5, p3_h2: 6 }));
    assert.deepEqual(part.holes.map((h) => [h.hole, h.winner]), [[1, null]], 'tie pays nobody; hole 2 waits for the fourth score');
    const late = V.calculateVegas(Object.assign({ vegasPointVal: 1, startHole: 2 }, teams), card([4, 4]), Object.assign(sc(1, 4, 5, 9, 9), sc(2, 4, 4, 4, 5)));
    assert.deepEqual(late.holes.map((h) => h.hole), [2]);
    assert.equal(V.calculateVegas({ vegasTeamA: [1, 2], vegasTeamB: [2, 3], vegasPointVal: 1 }, card([4]), {}).valid, false);
    assert.equal(V.calculateVegas({ vegasTeamA: [1], vegasTeamB: [3, 4] }, card([4]), {}).valid, false);
});

// NO EXISTING MONEY FILE CHANGED. Each hash is the file on main (387cf89) - and
// on gps-features - byte for byte. The new games live in their own files only.
const UNCHANGED = {
    'money-engine.js': '12bfa41c2c8e6b8abfd397fbffb9b8606428a9229a605b87ad30fc0f7b51dbf0',
    'settlement-engine.js': '6ddd4c8676cd880203fd9fc1bb81a48ad05275887002c6aa45d6d5a561105118',
    'payouts.js': 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8',
    'match-engine.js': '42bb272d11814cafba0d9ad48322b1b14fbbbfab6677268ce231787f347e7fde',
    'pool-engine.js': '372e76d7d5c41c38a905e395e6a748411ebeb0f5c12769bf827d29776cd69507',
    'aloha-bet.js': '3a2ec9e85d2f07aa4826734ba52bd91d9bbe687f34c3364bbeda0c29388be700',
    'ryder-cup.js': '0b4e3f9059ad29a86af23f8a3b814f0393da396e87dae0fc6ccaa66848060433',
    'side-match-lines.js': 'eaf067c7d2ca94dc70c619bd2af1195dde1a10e40fed0d1132b3e464cb1445ab',
    'live-skins.js': '632bbb1a1dd3078a9ba79755581c0f44e46acca8bac94c37ea29f3b156ac4e1b',
    'trip-pots.js': '3d1b2506d3a716ced0f086996043e8f6736ff766db16e732eba60f80167e08a0',
    'tournament-engine.js': '3626301cf0c2a61438c5d8e566ffbc0094f8b980968f9c45d2e11fc2a426996c',
    'action-model.js': '399ba26f0025b8d18fb240968c0922e7de8d7a22b616ac936cd4afa76ffd771b',
    'helpers/side-match-cards.js': 'dd02985ef9a151b72c28554b525eebc01cfe33e6402f31a03c3ddace1df106f8'
};
test('the existing money engines, settlement, side bets and game catalog are byte-identical to main', () => {
    Object.keys(UNCHANGED).forEach((f) => {
        const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
        assert.equal(h, UNCHANGED[f], f + ' changed');
    });
    const src = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
    assert.ok(!/['"](bbb|vegas)['"]/.test(src('action-model.js')), 'not in ADDITIONAL_GAME_CATALOG: old and new settlement skip them alike');
    if (ON) ['bbb-engine.js', 'vegas-engine.js'].forEach((f) => assert.ok(!/firebase|db\.ref|fetch\(|document\./.test(src(f).replace(/^\s*\/\/.*$/gm, '')), f + ' is pure'));
});
