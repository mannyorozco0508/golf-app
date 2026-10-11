// ============================================================================
// HARDPAN - BINGO BANGO BONGO + VEGAS ON SCREEN (gps-games)
//
// extra-games-ui.js in a sandbox: the scorecard card and its three taps, the
// settlement card, the Round Setup editor (golfers, teams, $, flip), and the two
// guards on Round Setup's save (no stale BBB points, a copy starts with none).
// Then the wiring: each page loads it inside a GPS block, and nothing outside
// one names it - so the Consumer build and every older app never see it.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'extra-games-ui.js'));
const skip = ON ? false : 'Consumer tree: no extra games';
function sandbox() {
    const sb = { JSON, Object, Math, Number, String, Date, Array, isNaN };
    sb.window = sb;
    vm.createContext(sb);
    ['bbb-engine.js', 'vegas-engine.js', 'extra-games-ui.js'].forEach((f) => vm.runInContext(read(f), sb));
    return sb.HardPanExtraGames;
}
const players = [{ id: 11, name: 'Ann Able' }, { id: 12, name: 'Bob Baker' }, { id: 13, name: 'Cal Cole' }, { id: 14, name: 'Dee Dunn' }];
const CD = [{ hole: 1, par: 4 }, { hole: 2, par: 5 }];

test('scorecard: one card per game; BBB shows points + $ and, for a scorer, the hole\'s three taps; a tap writes one point', { skip }, () => {
    const X = sandbox();
    const data = { players, courseData: CD, scores: { p11_h1: 4, p12_h1: 5, p13_h1: 5, p14_h1: 6 }, additionalGameInstances: {
        b: { format: 'bbb', bbbPointVal: 1, createdAt: 1, points: { h1: { bingo: 11, bango: 11, bongo: 12 } } },
        v: { format: 'vegas', vegasPointVal: 1, createdAt: 2, vegasTeamA: ['11', '12'], vegasTeamB: ['13', '14'] },
        off: { format: 'bbb', enabled: false }, sk: { format: 'skins', skinsBuyIn: 5 } } };
    const writes = [];
    const h = X.liveHtml(data, { hole: 2, canTap: () => true, write: (p, v) => { writes.push([p, v]); return Promise.resolve(); }, online: () => true });
    assert.equal((h.match(/class="lm-card exg-card"/g) || []).length, 2, 'off and skins are not drawn');
    assert.match(h, /Ann Able<\/span><span class="ld-total">2 pts · \+\$5/);
    assert.match(h, /HOLE 2 — tap who won each point/);
    assert.equal((h.match(/data-exg-kind="bingo"/g) || []).length, 4);
    assert.match(h, /Ann &amp; Bob v Cal &amp; Dee/);
    assert.match(h, /Ann &amp; Bob \+11 pts · \+\$11 each/);
    const el = (attrs) => ({ getAttribute: (k) => attrs[k] });
    X.tapFrom(el({ 'data-exg-game': 'b', 'data-exg-kind': 'bango', 'data-exg-hole': '2', 'data-exg-pid': '13', 'aria-pressed': 'false' }));
    X.tapFrom(el({ 'data-exg-game': 'b', 'data-exg-kind': 'bingo', 'data-exg-hole': '1', 'data-exg-pid': '11', 'aria-pressed': 'true' }));
    X.tapFrom(el({ 'data-exg-game': 'b/../x', 'data-exg-kind': 'bingo', 'data-exg-hole': '1', 'data-exg-pid': '11' }));
    assert.deepEqual(writes, [['b/points/h2/bango', 13], ['b/points/h1/bingo', null]], 'set, clear; a bad id writes nothing');
    const ro = X.liveHtml(data, { hole: 2, canTap: () => false });
    assert.ok(!/exg-taps/.test(ro), 'a spectator sees the card, not the taps');
});

test('settlement: its own card and who-pays-whom, said to be separate from Who Pays Who', { skip }, () => {
    const X = sandbox();
    const data = { players, additionalGameInstances: {
        b: { format: 'bbb', bbbPointVal: 2, participantIds: ['11', '12', '13'], points: { h1: { bingo: 11, bango: 11, bongo: 12 } } },
        v: { format: 'vegas', vegasPointVal: 0.5, vegasTeamA: ['11', '12'], vegasTeamB: ['13', '14'] } } };
    const h = X.settleHtml(data, CD, { p11_h1: 4, p12_h1: 5, p13_h1: 5, p14_h1: 6 });
    assert.match(h, /Bingo Bango Bongo · \$2\/pt/);
    assert.match(h, /Cal Cole pays Ann Able<\/span><span>\$6/);
    assert.match(h, /Ann Able \u00b7 2 pts<\/span><span>\+\$6<\/span>.*Bob Baker \u00b7 1 pt<\/span><span>\$0<\/span>.*Cal Cole \u00b7 0 pts<\/span><span>\u2212\$6/);
    assert.match(h, /Cal Cole pays Ann Able<\/span><span>\$5\.50/);
    assert.match(h, /1 hole \u00b7 11 pts/);
    assert.match(h, /Vegas · \$0\.50\/pt/);
    assert.match(h, /Dee Dunn pays Bob Baker<\/span><span>\$5\.50/);
    assert.equal((h.match(/Settle this game separately/g) || []).length, 2);
    assert.match(h, /Ann Able: 2 pts x 3 golfers \u2212 3 total = \+3 x \$2 = \+\$6\./, 'BBB worked example');
    assert.match(h, /Hole 1: Ann &amp; Bob 45 v Cal &amp; Dee 56 \u2192 Ann &amp; Bob \+11\./, 'Vegas worked example: a hole');
    assert.match(h, /Round: Ann &amp; Bob \+11 pts x \$0\.50 = \$5\.50 to EACH of Ann &amp; Bob; Cal &amp; Dee each pay it\./);
    assert.equal(X.settleHtml({ players, additionalGameInstances: { v: { format: 'vegas', vegasTeamA: ['11'] } } }, CD, {}), '', 'an unfinished Vegas setup settles nothing');
});

test('Round Setup editor: add, $ per point, BBB golfers, Vegas teams A -> B -> out (2 each), birdie flip, remove; BBB points never touched', { skip }, () => {
    const X = sandbox();
    const map = { sk: { format: 'skins', skinsBuyIn: 5 } };
    assert.ok(X.editorAct(map, players, 'add', 'bbb'));
    assert.ok(X.editorAct(map, players, 'add', 'vegas'));
    const [b, v] = Object.keys(map).filter((k) => k !== 'sk');
    assert.deepEqual([map[b].format, map[b].bbbPointVal, map[b].participantIds], ['bbb', 1, ['11', '12', '13', '14']]);
    assert.deepEqual([map[v].vegasTeamA, map[v].vegasTeamB, map[v].vegasBirdieFlip], [['11', '12'], ['13', '14'], false]);
    map[b].points = { h1: { bingo: 11 } };
    X.editorAct(map, players, 'amt', b, '2'); X.editorAct(map, players, 'bbbp', b, '14');
    assert.deepEqual([map[b].bbbPointVal, map[b].participantIds, map[b].points.h1.bingo], [2, ['11', '12', '13'], 11]);
    X.editorAct(map, players, 'vside', v, '12');   // A -> B (B full: stays out)
    assert.deepEqual([map[v].vegasTeamA, map[v].vegasTeamB], [['11'], ['13', '14']]);
    X.editorAct(map, players, 'vside', v, '14');   // B -> out
    X.editorAct(map, players, 'vside', v, '12');   // out -> A
    X.editorAct(map, players, 'vside', v, '14');   // out -> B
    assert.deepEqual([map[v].vegasTeamA, map[v].vegasTeamB, map[v].participantIds], [['11', '12'], ['13', '14'], ['11', '12', '13', '14']]);
    X.editorAct(map, players, 'flip', v);
    assert.equal(map[v].vegasBirdieFlip, true);
    const html = X.editorHtml(map, players);
    assert.match(html, /\+ 🎯 Bingo Bango Bongo/); assert.match(html, /Birdie flips the other team/);
    X.editorAct(map, players, 'remove', v);
    assert.deepEqual(Object.keys(map).sort(), [b, 'sk'].sort(), 'skins untouched');
    assert.equal(X.editorAct(map, players, 'remove', 'sk'), false, 'the editor cannot touch a skins game');
});

test('Round Setup save guards: held BBB points follow the round; a copied round starts with none', { skip }, () => {
    const X = sandbox();
    const held = { b: { format: 'bbb', points: { h1: { bingo: 11 } } }, d: { format: 'dots', x: 1 } };
    X.freshPoints(held, { b: { format: 'bbb', points: { h1: { bingo: 11 }, h2: { bongo: 12 } } }, d: { format: 'dots', x: 2 } });
    assert.deepEqual(held.b.points, { h1: { bingo: 11 }, h2: { bongo: 12 } });
    assert.equal(held.d.x, 1, 'only BBB points follow');
    X.dropPoints(held);
    assert.ok(!('points' in held.b));
});

test('wiring: scorecard, settlement and Round Setup load it in GPS blocks; Quick start has BBB + Vegas; nothing outside a block names it', { skip }, () => {
    const flag = require('./tools/gps-flag.js');
    ['index.html', 'settlement.html', 'admin.html'].forEach((f) => {
        const s = read(f);
        ['bbb-engine.js', 'vegas-engine.js', 'extra-games-ui.js'].forEach((js) => assert.ok(s.includes('<script src="' + js + '"></script>'), f + ' loads ' + js));
        assert.ok(!/HardPanExtraGames|bbb-engine|vegas-engine|extra-games-ui|exgRender|exgAfterLoad/.test(flag.applyFlag(s, false)), f + ': all inside GPS blocks');
    });
    const admin = read('admin.html');
    assert.match(admin, /onclick="gpsApplyTemplate\('bbb'\)">\$1 Bingo Bango Bongo</);
    assert.match(admin, /onclick="gpsApplyTemplate\('vegas'\)">\$1 Vegas</);
    assert.match(admin, /if \(typeof exgAfterLoad === 'function'\) exgAfterLoad\(!!copyFromCode\);/);
    assert.match(read('index.html'), /const rest = \[dotsBoard, ryder, skins, matches, points, hilo, strokeBets\];\n\s*\/\/ GPS:BEGIN[\s\S]{0,300}rest\.splice\(1, 0, window\.HardPanExtraGames\.liveHtml\(/, 'the cards join the grid inside the GPS block; the Consumer line is untouched');
    assert.match(read('index.html'), /requireOnlineForMoney\('POINT NOT SAVED'/);
    assert.match(read('settlement.html'), /HardPanExtraGames\.settleHtml\(data, courseData, savedScores\)/);
});
