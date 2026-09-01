// ============================================================================
// DOT VISIBILITY ON THE SCORECARD
//
// Junk was recorded correctly and settled correctly, but a golfer scanning a hole
// could not SEE it next to the score that earned it. The Full Card had an
// indicator, gated on gameFormat === 'dots' - the same mistake that once hid the
// entry button, so a Dots game created through Action lit nothing up.
//
// One shared builder now feeds both cards, and the rule it encodes is exact:
// one red pip per POSITIVE unit, snakes shown as snakes. Snake is worth -1 in
// calcDotsEngine, so painting it red would tell a golfer the opposite of what it
// costs them.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const J = JSON.stringify;
const CD = makeCourseData(18);
const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const IDX = read('index.html');
const DEPS = ['score-marks.js', 'money-engine.js', 'action-model.js',
    'settlement-engine.js', 'bet-strip.js', 'hole-events.js'];

const ENG = (() => {
    const sb = loadJsFile('money-engine.js');
    ['action-model.js', 'settlement-engine.js', 'bet-strip.js'].forEach(f =>
        vm.runInContext(read(f), sb, { filename: f }));
    return sb;
})();
const call = c => { vm.runInContext(`window.__r = (function(){ ${c} })();`, ENG); return ENG.window.__r; };

function field(n) {
    const P = makePlayers(['Marty', 'Manny', 'John', 'Steve', 'Stan', 'Greg', 'Tony', 'James'].slice(0, n),
        ['8', '4', '15', '0', '6', '12', '20', '1'].slice(0, n));
    P.forEach((p, i) => { p.playingForMoney = true; p.group = i < 4 ? 1 : 2; });
    const S = {};
    CD.forEach(h => P.forEach(p => { S[`p${p.id}_h${h.hole}`] = h.par; }));
    return { P, S, id: k => String(P[k].id) };
}

const pips = list => {
    const sb = loadHtmlInlineScript('index.html', DEPS);
    vm.runInContext(`window.__o = dotIndicatorHtml(${J(list)});`, sb);
    return sb.window.__o;
};
const countRed = h => (String(h).match(/\uD83D\uDD34/g) || []).length;
const countSnake = h => (String(h).match(/\uD83D\uDC0D/g) || []).length;

// ---------------------------------------------------------------------------
describe('THE RED-DOT RULE', () => {
    test('one red pip per positive unit', () => {
        assert.equal(countRed(pips(['birdie'])), 1);
        assert.equal(countRed(pips(['birdie', 'sandy'])), 2);
        assert.equal(countRed(pips(['birdie', 'sandy', 'greenie'])), 3);
        assert.equal(countRed(pips(['greenie', 'sandy', 'barkie', 'polie'])), 4);
    });

    test('SNAKE is never a red pip — it costs a unit', () => {
        const h = pips(['snake']);
        assert.equal(countRed(h), 0, 'a red dot would read as a gain');
        assert.equal(countSnake(h), 1);
    });

    test('mixed junk shows both, and only the positives are red', () => {
        const h = pips(['birdie', 'sandy', 'snake']);
        assert.equal(countRed(h), 2);
        assert.equal(countSnake(h), 1);
    });

    test('several snakes are all shown, not collapsed to one', () => {
        assert.equal(countSnake(pips(['snake', 'snake'])), 2);
    });

    test('no junk renders nothing at all', () => {
        assert.equal(pips([]), '');
        assert.equal(pips(null), '');
    });

    test('the pip count always equals the stored positive UNITS, not the dot count', () => {
        // An eagle is two units, so it paints two pips. The pips are a reading aid for
        // the money; one pip per tap would have understated an eagle by half.
        const units = d => (d === 'eagle' ? 2 : 1);
        [['birdie'], ['birdie', 'sandy'], ['snake'], ['birdie', 'snake'],
        ['eagle', 'sandy', 'snake'], ['snake', 'snake', 'birdie'], ['eagle']].forEach(list => {
            const h = pips(list);
            const expected = list.filter(d => d !== 'snake').reduce((s, d) => s + units(d), 0);
            assert.equal(countRed(h), expected, J(list));
            assert.equal(countSnake(h), list.filter(d => d === 'snake').length, J(list));
        });
    });

    test('an eagle paints two pips and a birdie paints one', () => {
        assert.equal(countRed(pips(['eagle'])), 2);
        assert.equal(countRed(pips(['birdie'])), 1);
    });

    test('a legacy birdie+eagle pair paints two pips, never three', () => {
        assert.equal(countRed(pips(['birdie', 'eagle'])), 2);
    });

    test('the net value is exposed for anyone who taps or hovers', () => {
        assert.match(pips(['birdie', 'sandy', 'snake']), /title="\+1 dot"/);
        assert.match(pips(['snake']), /title="-1 dot"/);
    });

    test('THE INDICATOR AGREES WITH SETTLEMENT', () => {
        // If these ever diverge the golfer is being shown a lie about their money.
        const f = field(4);
        const dots = {
            h3: { [`p${f.id(0)}`]: ['birdie', 'sandy'], [`p${f.id(2)}`]: ['greenie'] },
            h9: { [`p${f.id(1)}`]: ['snake'] }
        };
        const d = {
            gameFormat: 'stroke', players: f.P, courseData: CD, scores: f.S, dots,
            additionalGameInstances: { dt: { format: 'dots', enabled: true, startHole: 1, dotPointVal: 5 } }
        };
        const units = call(`return calcDotsEngine(${J(d)}, ${J(CD)}, ${J(f.S)}).totals;`);
        // Rebuild each player's total from what the pips display.
        const shown = {};
        Object.keys(dots).forEach(hk => Object.keys(dots[hk]).forEach(pk => {
            const h = pips(dots[hk][pk]);
            const pid = pk.slice(1);
            shown[pid] = (shown[pid] || 0) + countRed(h) - countSnake(h);
        }));
        Object.keys(shown).forEach(pid =>
            assert.equal(shown[pid], units[pid], `player ${pid}: display ${shown[pid]} vs engine ${units[pid]}`));
    });
});

// ---------------------------------------------------------------------------
describe('THE INDICATOR IS SHARED, NOT DUPLICATED', () => {
    test('exactly one builder exists', () => {
        assert.equal((IDX.match(/function dotIndicatorHtml/g) || []).length, 1);
    });

    test('the Full Card no longer keys off the main format', () => {
        // Comments stripped first: this must assert on CODE, not on the prose that
        // explains which gate was removed.
        const region = IDX.slice(IDX.indexOf('let earnedDotsHtml'), IDX.indexOf('const markClass'))
            .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
        assert.ok(!/gameFormat === 'dots'/.test(region),
            'that gate is what hid the indicator for an Action-created Dots game');
        assert.ok(/if \(hasDotsGame\)/.test(region));
        assert.ok(/dotIndicatorHtml\(dotsForPlayerHole\(p\.id, h\.hole\), h\.hole\)/.test(region),
            'the Full Card must use the shared builder, and pass the hole so a carried greenie paints its real value');
    });

    test('Hole View puts the pips with the SCORE, not in a paragraph below', () => {
        const region = IDX.slice(IDX.indexOf('let pipHtml'), IDX.indexOf('let pipHtml') + 700);
        assert.ok(/dotIndicatorHtml\(holeDotsNow/.test(region));
        assert.ok(/hv-player-cell">\$\{cells\[i\] \? cells\[i\]\.innerHTML : ''\}\$\{pipHtml\}/.test(IDX),
            'the pips belong inside the score cell');
    });

    test('the written labels remain available under the name', () => {
        assert.ok(/hv-dot-line/.test(IDX), 'Birdie / Sandy detail must still be readable');
    });

    test('no Dots game means no indicator anywhere', () => {
        const region = IDX.slice(IDX.indexOf('let pipHtml'), IDX.indexOf('let pipHtml') + 400);
        assert.ok(/if \(dotsGame\)/.test(region), 'gated on an active game');
    });
});

// ---------------------------------------------------------------------------
describe('LIVE vs FINAL — an unfinished wager is never shown as won', () => {
    const f = field(4);

    test('a live wager reports money AT STAKE, not won', () => {
        const partial = {};
        CD.filter(h => h.hole <= 9).forEach(h => f.P.forEach(p => { partial[`p${p.id}_h${h.hole}`] = h.par + (p.id === f.P[0].id ? -1 : 0); }));
        const d = {
            gameFormat: 'stroke', players: f.P, courseData: CD, scores: partial,
            sideMatches: { a: { format: 'stroke', scoring: 'net', teamAIds: [f.id(0)], teamBIds: [f.id(1)], overallStake: 50, overallMode: 'stroke', segment: 'full', tieRule: 'carry', startHole: 1, createdAt: 1 } }
        };
        const rows = call(`return buildSideActionRows(${J(d)}, ${J(CD)}, ${J(partial)}, ${J(f.P)}, null);`);
        assert.equal(rows.length, 1);
        rows.forEach(r => assert.ok(!(r.atStake > 0 && r.finished),
            'money still at stake must never be labelled final'));
    });

    test('across every simulated round, nothing live reads as final', () => {
        // Guards the rule generally rather than in one fixture.
        [['stroke', 50], ['match', 50]].forEach(([fmt, stake]) => {
            const d = {
                gameFormat: 'stroke', players: f.P, courseData: CD, scores: f.S,
                sideMatches: {
                    a: fmt === 'stroke'
                        ? { format: 'stroke', scoring: 'net', teamAIds: [f.id(0)], teamBIds: [f.id(1)], overallStake: stake, overallMode: 'stroke', segment: 'full', tieRule: 'carry', startHole: 1, createdAt: 1 }
                        : { format: 'match', scoring: 'net', stake, pressRule: 'none', teamAIds: [f.id(0)], teamBIds: [f.id(1)], startHole: 1, createdAt: 1 }
                }
            };
            const bad = call(`
                var rows = buildSideActionRows(${J(d)}, ${J(CD)}, ${J(f.S)}, ${J(f.P)}, null);
                return rows.filter(function(r){ return r.atStake > 0 && r.finished; }).length;`);
            assert.equal(bad, 0, `${fmt} showed a live wager as final`);
        });
    });
});

// ---------------------------------------------------------------------------
describe('DOTS IN THE RECEIPT', () => {
    const f = field(4);
    const dots = { h5: { [`p${f.id(0)}`]: ['birdie', 'sandy'] }, h11: { [`p${f.id(1)}`]: ['snake'] } };
    const d = {
        gameFormat: 'stroke', courseName: 'Caledonia', players: f.P, courseData: CD, scores: f.S, dots,
        additionalGameInstances: { dt: { format: 'dots', enabled: true, startHole: 1, createdAt: 1, dotPointVal: 5 } }
    };

    function receipt() {
        const sb = loadHtmlInlineScript('settlement.html',
            ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js']);
        vm.runInContext(`
            currentData = ${J(d)};
            renderCombinedSummary(currentData, currentData.courseData, currentData.scores);
            renderSettlement(currentData); renderReceiptScorecard();
            window.__a = document.getElementById('combined-settlement-summary').innerHTML;
            window.__b = document.getElementById('settle-content').innerHTML;`, sb);
        return { top: sb.window.__a, mid: sb.window.__b };
    }

    test('the Dots game is itemised', () => {
        assert.match(receipt().mid, /Dots/, 'the golfer must see where the money came from');
    });

    test('RECEIPT MONEY PARITY: printed Final Results equal the ledger', () => {
        const r = receipt();
        const led = call(`
            var o = computeCombinedNetTotals(${J(d)}, ${J(CD)}, ${J(f.S)});
            var n = {}; Object.keys(o.netByName).forEach(function(k){ n[o.netByName[k].name] = o.netByName[k].net; });
            return n;`);
        const printed = {};
        [...String(r.top).matchAll(/<span>([^<]+)<\/span><span[^>]*>([+-])\$([\d.]+) NET<\/span>/g)]
            .forEach(m => { printed[m[1]] = (m[2] === '+' ? 1 : -1) * parseFloat(m[3]); });
        Object.keys(led).forEach(n => {
            if (led[n] === 0) return;
            assert.equal(printed[n], led[n], `${n}: Receipt ${printed[n]} vs ledger ${led[n]}`);
        });
    });

    test('Who Pays Who reconstructs the printed Final Results', () => {
        const r = receipt();
        const printed = {};
        [...String(r.top).matchAll(/<span>([^<]+)<\/span><span[^>]*>([+-])\$([\d.]+) NET<\/span>/g)]
            .forEach(m => { printed[m[1]] = (m[2] === '+' ? 1 : -1) * parseFloat(m[3]); });
        const tx = [...String(r.top).matchAll(/<span>([^<]+) → ([^<]+)<\/span><span[^>]*>\$([\d.]+)<\/span>/g)]
            .map(m => ({ from: m[1], to: m[2], amount: parseFloat(m[3]) }));
        const rb = {}; Object.keys(printed).forEach(n => { rb[n] = 0; });
        tx.forEach(t => { rb[t.from] -= t.amount; rb[t.to] += t.amount; });
        Object.keys(printed).forEach(n => assert.equal(rb[n], printed[n], n));
    });

    test('there is still only ONE Dots calculation', () => {
        // The Receipt must not grow its own.
        const st = read('settlement.html');
        assert.ok(!/function calcDotsEngine/.test(st), 'the Receipt must consume canonical results');
        assert.equal((read('money-engine.js').match(/function calcDotsEngine/g) || []).length, 1);
    });
});

// ---------------------------------------------------------------------------
describe('PROTECTED — display only', () => {
    test('no engine gained display code', () => {
        ['money-engine.js', 'settlement-engine.js', 'action-model.js', 'bet-strip.js'].forEach(fn => {
            assert.ok(!/dotIndicatorHtml|dot-pips|dotsForPlayerHole/.test(read(fn)),
                `${fn} gained scorecard display code`);
        });
    });

    test('the dots formula is untouched', () => {
        const me = read('money-engine.js');
        // Dot VALUES now live in dotUnitValue rather than inline in the tally loop,
        // but the two invariants are the same ones: a snake costs a unit, and the
        // payout is zero-sum across the field.
        assert.ok(/if \(dotType === 'snake'\) return -1;/.test(me),
            'snake must still subtract a unit');
        assert.ok(/if \(dotType === 'eagle'\) return 2;/.test(me),
            'an eagle must be worth two units');
        assert.ok(/dotVal \* \(n \* units - totalUnits\)/.test(me));
    });
});
