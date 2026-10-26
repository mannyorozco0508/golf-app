// ============================================================================
// 073 - THE SHOT LOG KNOWS ITS ROUND: a marked shot's record carries the round's code (text, never a
// position), End round - don't save takes out THAT round's records only, and a record from before 073
// (no code) or from any other round is left exactly as it was.
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const GPS = fs.existsSync(path.join(__dirname, 'gps-shot-log.js'));
function sandbox() {
    const mem = new Map();
    const sb = { localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }, Math, Date, JSON, Object, Array };
    sb.window = sb; vm.createContext(sb);
    ['gps-geo.js', 'gps-wind-learn.js', 'gps-shot-log.js', 'gps-mark-chips.js'].forEach((f) => { if (fs.existsSync(path.join(__dirname, f))) vm.runInContext(read(f), sb, { filename: f }); });
    sb.mem = mem;
    return sb;
}
const M = 0.9144;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) * M;   // 1 unit = 1 yard
const bearing = () => 0;

test('073: a closed shot’s record carries the round code; the record never holds a position', GPS ? {} : { skip: 'Consumer tree' }, () => {
    const S = sandbox();
    const T = S.HardPanMarkChips.create({ dist, bearing, now: () => 5000 });
    T.mark([0, 0], { hole: 3, green: [0, 300], course: 'Papago Golf Club', golfer: 'Ray Ortiz', club: '7i', round: 'RAYO73' });
    const out = T.mark([0, 160], { hole: 3, green: [0, 300], course: 'Papago Golf Club', golfer: 'Ray Ortiz', noOpen: true });
    assert.equal(out.closed.counted, true);
    assert.equal(out.closed.record.round, 'RAYO73');
    const shots = S.HardPanShotLog.list({ golfer: 'Ray Ortiz' });
    assert.equal(shots.length, 1);
    assert.equal(shots[0].round, 'RAYO73');
    assert.equal(JSON.stringify(shots[0]).match(/"p"|lat|lng/), null);
    // Without a round (an older caller) the record has no round field at all - exactly as before 073.
    const T2 = S.HardPanMarkChips.create({ dist, bearing, now: () => 6000 });
    T2.mark([0, 0], { hole: 4, green: [0, 300], course: 'Papago Golf Club', golfer: 'Ray Ortiz', club: '8i' });
    const o2 = T2.mark([0, 140], { hole: 4, green: [0, 300], course: 'Papago Golf Club', golfer: 'Ray Ortiz', noOpen: true });
    assert.equal('round' in o2.closed.record, false);
    assert.equal('round' in S.HardPanShotLog.list({ golfer: 'Ray Ortiz' }).filter((s) => s.club === '8i')[0], false);
});

test('073: removeRound takes out that round’s records only; everything else is byte-identical', GPS ? {} : { skip: 'Consumer tree' }, () => {
    const S = sandbox();
    const L = S.HardPanShotLog;
    L.add({ club: '7i', carry: 151, golfer: 'Ray Ortiz', date: 1000 });                       // before 073: no round
    L.add({ club: '8i', carry: 140, golfer: 'Ray Ortiz', date: 2000, round: 'OTHER1' });       // another round
    L.add({ club: '7i', carry: 175, golfer: 'Ray Ortiz', date: 3000, round: 'RAYO73' });       // this round
    L.add({ club: 'PW', carry: 120, golfer: 'Dan Kim', date: 4000, round: 'RAYO73' });         // this round, another golfer on this phone
    const keep = L.list({ golfer: 'Ray Ortiz' }).filter((s) => s.round !== 'RAYO73');
    assert.equal(L.removeRound('rayo73'), 2);
    assert.deepEqual(L.list({ golfer: 'Ray Ortiz' }), keep);
    assert.deepEqual(L.list({ golfer: 'Dan Kim' }), []);
    const before = S.mem.get(L.KEY);
    assert.equal(L.removeRound('NOPE99'), 0);
    assert.equal(S.mem.get(L.KEY), before, 'nothing to remove: not even rewritten');
    // A bad code is never kept.
    L.add({ club: '9i', carry: 130, golfer: 'Ray Ortiz', date: 5000, round: '<script>' });
    assert.equal('round' in L.list({ golfer: 'Ray Ortiz', club: '9i' })[0], false);
});
