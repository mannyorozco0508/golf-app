// ============================================================================
// 100a - SAME FIRST NAME, RECEIPT / BETS / SIDE-MATCH WORDS (text only)
//
// Receipt and Bets lines are cut from the first word of a name, so "Test Ann" v
// "Test Cal" read "Test by 2 strokes" and two Mikes read "Mike by 2". The app
// already has the answer - text-safe.js golferShortName via roundDataForDisplay
// (the round's display copy, never saved) - and most screens already use it.
// 100a hands it to the three presenters that did not: stats.html's per-bet
// lines, index.html's press-correction snapshot, and gps-bet.js's preview words.
// Money is never read from the display copy's names, so no figure moves.
// ============================================================================
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const sb = { console, Math, Object, Array, String, Number, JSON, isNaN, parseInt, parseFloat, Date, Set, Map };
vm.createContext(sb);
['text-safe.js', 'handicap.js', 'match-engine.js', 'money-engine.js', 'action-model.js',
 'pool-engine.js', 'settlement-engine.js', 'hilo-engine.js', 'side-match-lines.js', 'bet-strip.js']
    .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
const plain = (v) => JSON.parse(JSON.stringify(v));
const nbsp = (s) => String(s).replace(/ /g, ' ');
const cd18 = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));

function round(players, lowId) {
    const scores = {};
    players.forEach(p => cd18.forEach(h => { scores[`p${p.id}_h${h.hole}`] = p.id === lowId ? 4 : 5; }));
    // 2 strokes: only holes 1-2 differ.
    cd18.slice(2).forEach(h => players.forEach(p => { scores[`p${p.id}_h${h.hole}`] = 4; }));
    return { gameFormat: 'stroke', players, courseData: cd18, scores,
             sideMatches: { m1: { format: 'stroke', scoring: 'gross', teamAIds: [String(players[0].id)],
                 teamBIds: [String(players[1].id)], startHole: 1, createdAt: 1, holeStake: 0,
                 overallStake: 10, overallMode: 'stroke', segment: 'full' } } };
}
function words(data) {
    const shown = sb.roundDataForDisplay(data);
    const rc = plain(sb.buildSideMatchReceipts(shown, cd18, data.scores).find(r => r.matchId === 'm1'));
    const row = plain(sb.buildSideActionRows(shown, cd18, data.scores, shown.players, null).find(r => r.key === 'm1'));
    const lines = plain(sb.sideMatchBetLines(rc, { complete: true }));
    const raw = plain(sb.buildSideMatchReceipts(data, cd18, data.scores).find(r => r.matchId === 'm1'));
    return { result: nbsp(rc.segments[0].result), label: nbsp(row.label), money: nbsp(lines[0].moneyText),
             net: rc.net, rawNet: raw.net };
}

test('two Mikes: "Mike S by 2 strokes", Bets "Mike S vs Mike T", money unchanged', () => {
    const w = words(round([{ id: 1, name: 'Mike S', hcp: '0' }, { id: 2, name: 'Mike T', hcp: '0' }], 1));
    assert.equal(w.result, 'Mike S by 2 strokes');
    assert.equal(w.label, 'Mike S vs Mike T');
    assert.equal(w.money, 'Mike S +$10');
    assert.equal(w.net, 10); assert.equal(w.rawNet, w.net);
});

test('"Test Ann" v "Test Cal", Cal lower: "Test C. by 2 strokes", paid to Cal', () => {
    const w = words(round([{ id: 101, name: 'Test Ann', hcp: '0' }, { id: 103, name: 'Test Cal', hcp: '0' }], 103));
    assert.equal(w.result, 'Test C. by 2 strokes');
    assert.equal(w.label, 'Test A. vs Test C.');
    assert.equal(w.money, 'Test C. +$10');
    assert.equal(w.net, -10); assert.equal(w.rawNet, w.net);
});

test('distinct first names: words exactly as before (first name alone)', () => {
    const data = round([{ id: 1, name: 'Ann Alpha', hcp: '0' }, { id: 2, name: 'Cal Bravo', hcp: '0' }], 2);
    assert.equal(sb.roundDataForDisplay(data), data, 'no collision -> the same object back');
    const w = words(data);
    assert.equal(w.result, 'Cal by 2 strokes');
    assert.equal(w.label, 'Ann vs Cal');
});

test('the three presenters hand receipts the display copy (text only)', () => {
    assert.match(read('stats.html'), /buildSideMatchReceipts\(\(typeof roundDataForDisplay === 'function'\) \? roundDataForDisplay\(data\) : data,/);
    assert.match(read('index.html'), /buildSideMatchReceipts\(\(typeof roundDataForDisplay === 'function'\) \? roundDataForDisplay\(data\) : data, courseData, savedScores\)\.forEach\(rc =>/);
    const gb = read('gps-bet.js');
    assert.match(gb, /var dw = \(typeof roundDataForDisplay === 'function'\) \? roundDataForDisplay\(d2\) : d2;/);
    assert.match(gb, /buildSideActionRows\(dw, cd, dw\.scores/);
    assert.match(gb, /buildSideMatchReceipts\(dw, cd, dw\.scores/);
    // Money in the gps-bet preview still reads the real round, never the display copy.
    assert.match(gb, /computeCombinedNetTotals\(d2, cd, d2\.scores \|\| \{\}\)/);
});
