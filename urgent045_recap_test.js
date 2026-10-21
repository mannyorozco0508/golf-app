// ============================================================================
// URGENT-045 #4 - THE ROUND RECAP PICTURE: the pure layout (round-recap.js).
//
// layout(record) decides every string and shape; it must only ever PLACE the
// strings it was handed (the Receipt's), never make a number of its own. The
// Chrome half (urgent045_recap_chrome_test.js) proves the record is the Receipt.
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

function load() {
    const win = { location: { search: '?game=U45NAS' }, localStorage: { getItem: () => null } };
    win.window = win;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'round-recap.js'), 'utf8'), { window: win, URLSearchParams, Date, JSON, Math, String, Number, Array, Error, Promise });
    return win.HardPanRecap;
}
const H = load();
// the module runs in its own realm: compare by value
const same = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, m);

const holes = (a) => a.map((v) => ({ v: String(v), mark: '' }));
function record(names) {
    const front = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'OUT'], back = ['10', '11', '12', '13', '14', '15', '16', '17', '18', 'IN', 'TOT'];
    const col = (l) => ({ label: l, sec: /OUT|IN|TOT/.test(l) });
    const golfers = names.map((n, i) => ({ name: n, hcp: String(10 + i), net: String(67 + i) }));
    return {
        code: 'U45NAS', course: 'Papago Golf Club', date: 'Tuesday, October 20, 2026', city: 'Phoenix, AZ', chips: ['White tees', 'Stroke Play', 'Final'],
        card: { golfers, hasNet: true, nines: [
            { cols: front.map(col), par: ['5', '4', '4', '3', '4', '4', '4', '3', '5', '36'], rows: golfers.map(() => holes([5, 5, 5, 4, 3, 5, 4, 6, 4, 41])) },
            { cols: back.map(col).concat([{ label: 'NET', sec: true, net: true }]), par: ['5', '3', '4', '4', '4', '3', '5', '4', '4', '36', '72', ''],
                rows: golfers.map((g) => holes([5, 4, 4, 4, 4, 3, 5, 5, 4, 38, 79]).concat([{ v: g.net, mark: '', net: true }])) }] },
        games: [{ head: 'Nassau · Test A v Test B · $5 / $5 / $5', rows: [{ left: 'Front 9 · All square', right: '$0 · halved', tone: 'mut' }, { left: 'Back 9 · Test A 3&2', right: 'Test A +$5', tone: 'pos' }],
            total: { left: 'Match net', right: 'Test A +$10' }, why: 'Test A won 2 bets ($10)' }],
        money: { kind: 'settle', head: 'Settle up', rows: [{ left: 'Test B → Test A', right: '$10' }], meta: 'One payment settles everything' }
    };
}

test('the layout places only the strings it was handed - no number of its own', () => {
    const rec = record(['Test A', 'Test B']);
    const m = H.layout(rec);
    assert.ok(m && m.width === 1080 && m.height > 1000);
    const given = new Set();
    const add = (s) => { if (s !== undefined && s !== null && s !== '') given.add(String(s)); };
    add(rec.course); add(rec.date + ' · ' + rec.city); rec.chips.forEach(add);
    rec.card.golfers.forEach((g) => { add(g.name); add(g.hcp); });
    rec.card.nines.forEach((n) => { n.cols.forEach((c) => add(c.label)); n.par.forEach(add); n.rows.forEach((r) => r.forEach((c) => add(c.v))); });
    rec.games.forEach((g) => { add(g.head); g.rows.forEach((r) => { add(r.left); add(r.right); }); add(g.total.left); add(g.total.right); add(g.why); });
    add(rec.money.head.toUpperCase()); rec.money.rows.forEach((r) => { add(r.left); add(r.right); }); add(rec.money.meta);
    const labels = new Set(['HARDPAN', 'ROUND RECAP', 'SCORECARD', 'WHO WON WHAT', 'HOLE', 'Par', 'HardPan · Round U45NAS']);
    const texts = m.ops.filter((o) => o.op === 'text').map((o) => o.text);
    assert.ok(texts.length > 60, 'positive: the picture has its text');
    texts.forEach((t) => assert.ok(given.has(t) || labels.has(t), 'a string the Receipt did not give: ' + JSON.stringify(t)));
    // and everything given that matters is drawn
    ['Papago Golf Club', 'Test A', 'Test B', '41', '38', '79', '67', '68', 'Test A +$10', '$10', 'Test B → Test A'].forEach((s) => assert.ok(texts.includes(s), 'drawn: ' + s));
});

test('#2: "Test A" / "Test B" stay whole; long names step the font down before anything is cut', () => {
    const m = H.layout(record(['Test A', 'Test B']));
    const names = m.ops.filter((o) => o.role === 'name').map((o) => o.text);
    same(names, ['Test A', 'Test B', 'Test A', 'Test B']);
    const long = H.layout(record(['Christopher Montgomery A', 'Christopher Montgomery B']));
    const ln = long.ops.filter((o) => o.role === 'name');
    assert.ok(/(2[0-6])px/.test(ln[0].font), 'the font stepped down: ' + ln[0].font);
    const f = H._nameFont(H._approxMeasure, ['Test A', 'Test B'], 200);
    assert.equal(f.size, 28, 'short names keep the full size');
});

test('two nines: front ends at OUT, back carries IN / TOT / NET; NET is the record\'s, not a sum', () => {
    const m = H.layout(record(['Test A', 'Test B']));
    const net = m.ops.filter((o) => o.role === 'net').map((o) => o.text);
    same(net, ['67', '68']);
    const heads = m.ops.filter((o) => o.role === 'colhead').map((o) => o.text);
    same(heads.slice(0, 11), ['HOLE', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'OUT']);
    same(heads.slice(-4), ['18', 'IN', 'TOT', 'NET']);
});

test('no record, no picture; a tall field scales down under the iOS canvas limit', () => {
    assert.equal(H.layout(null), null);
    assert.equal(H.layout({ course: 'X', card: null }), null);
    assert.equal(H._scaleFor({ width: 1080, height: 3000 }), 2);
    const s = H._scaleFor({ width: 1080, height: 9000 });
    assert.ok(s < 2 && 1080 * s * 9000 * s <= 16000001, 'scaled: ' + s);
});

test('a long game line wraps to two lines; the amount is never cut', () => {
    const rec = record(['Test A', 'Test B']);
    rec.games = [{ head: 'Skins — Flight A · $198 · 6 golfers', rows: [{ left: 'Hole 1 — Jim — Gross 3 — collects 2 skins (Holes 1–1) and then some more words to wrap', right: '$22', tone: 'pos' }], total: null, why: '' }];
    const m = H.layout(rec);
    const lines = m.ops.filter((o) => o.role === 'game-line');
    assert.equal(lines.length, 2, 'two lines');
    same(m.ops.filter((o) => o.role === 'game-money').map((o) => o.text), ['$22']);
});
