// ============================================================================
// EAGLE VALUE + GREENIE CARRYOVER
//
// Two rules landed together, and both change what a completed round is worth:
//
//   - an eagle is 2 dots, not 1
//   - an unclaimed par 3 rolls its greenie onto the next par 3
//
// The carry is opt in per round. A MISSING FLAG MEANS OFF, and that is the single
// most important assertion in this file: settlement recomputes from stored scores
// every time a round is opened, so a default of ON would silently re-settle every
// round played before the rule existed.
//
// The eagle change has no such escape hatch - it is a value correction and applies
// retroactively by decision. It is asserted here so that is a recorded choice
// rather than something discovered later in a receipt.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadJsFile, loadHtmlInlineScript } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const P = [{ id: 101, name: 'A' }, { id: 102, name: 'B' }, { id: 103, name: 'C' }];
P.forEach(p => { p.hcp = '0'; p.playingForMoney = true; });

// Par 3s on 4, 8, 13, 17 — four of them, so a pot can ride three times.
const COURSE = Array.from({ length: 18 }, (_, i) => ({
    hole: i + 1,
    par: [4, 8, 13, 17].includes(i + 1) ? 3 : 4,
    hcpIndex: i + 1
}));

function fullCard() {
    const s = {};
    P.forEach(p => COURSE.forEach(h => { s[`p${p.id}_h${h.hole}`] = h.par; }));
    return s;
}

const engine = loadJsFile('money-engine.js');
const dots = (data, scores) => engine.calcDotsEngine(
    Object.assign({ players: P }, data), COURSE, scores || fullCard()
).totals;

// ---------------------------------------------------------------------------
describe('EAGLE IS TWO DOTS', () => {
    test('the value table is snake -1, eagle 2, everything else 1', () => {
        assert.equal(engine.dotUnitValue('snake'), -1);
        assert.equal(engine.dotUnitValue('eagle'), 2);
        ['greenie', 'sandy', 'barkie', 'polie', 'birdie'].forEach(d => {
            assert.equal(engine.dotUnitValue(d), 1);
        });
    });

    test('NEGATIVE CONTROL — an eagle and a birdie must not be worth the same', () => {
        assert.notEqual(engine.dotUnitValue('eagle'), engine.dotUnitValue('birdie'));
    });

    test('an eagle pays 2 units', () => {
        assert.equal(dots({ dots: { h5: { p101: ['eagle'] } } })[101], 2);
    });

    test('a legacy birdie+eagle pair pays 2, never 3', () => {
        assert.equal(dots({ dots: { h5: { p101: ['eagle', 'birdie'] } } })[101], 2);
        assert.equal(dots({ dots: { h5: { p101: ['birdie', 'eagle'] } } })[101], 2);
    });

    test('normalizeDotList never mutates the caller\'s stored array', () => {
        const stored = ['birdie', 'eagle', 'sandy'];
        assert.deepEqual(engine.normalizeDotList(stored), ['eagle', 'sandy']);
        assert.deepEqual(stored, ['birdie', 'eagle', 'sandy'],
            'dot lists come straight off Firebase and are shared with the renderer');
    });

    test('an eagle alongside a snake nets +1', () => {
        assert.equal(dots({ dots: { h5: { p101: ['eagle', 'snake'] } } })[101], 1);
    });
});

// ---------------------------------------------------------------------------
describe('GREENIE CARRYOVER — a missing flag means OFF', () => {
    test('a round saved before this rule existed settles exactly as it did', () => {
        assert.equal(dots({ dots: { h8: { p101: ['greenie'] } } })[101], 1);
    });

    test('greenieCarryover: false is honoured', () => {
        assert.equal(dots({ greenieCarryover: false, dots: { h8: { p101: ['greenie'] } } })[101], 1);
    });

    test('NEGATIVE CONTROL — on and off must not agree', () => {
        const d = { h8: { p101: ['greenie'] } };
        assert.notEqual(dots({ dots: d })[101],
            dots({ greenieCarryover: true, dots: d })[101]);
    });

    test('the setup wizard writes the flag explicitly on every new round', () => {
        const admin = read('admin.html');
        assert.ok(/greenieCarryover: greenieCarryover,/.test(admin),
            'the flag must be persisted, or new rounds inherit the legacy OFF default');
        assert.ok(/id="greenie-carryover"/.test(admin), 'the wizard needs the control');
        assert.ok(/checked \(data\.greenieCarryover === true\)/.test(admin.replace(/\.checked = /g, 'checked ')),
            'reopening an old round must show the box UNCHECKED');
    });
});

// ---------------------------------------------------------------------------
describe('GREENIE CARRYOVER — the pot', () => {
    const ON = { greenieCarryover: true };

    test('one unclaimed par 3 makes the next one worth 2', () => {
        assert.equal(dots(Object.assign({ dots: { h8: { p101: ['greenie'] } } }, ON))[101], 2);
    });

    test('three unclaimed par 3s make the fourth worth 4', () => {
        assert.equal(dots(Object.assign({ dots: { h17: { p101: ['greenie'] } } }, ON))[101], 4);
    });

    test('claiming resets the pot to 1', () => {
        const t = dots(Object.assign({
            dots: { h4: { p101: ['greenie'] }, h8: { p102: ['greenie'] } }
        }, ON));
        assert.equal(t[101], 1);
        assert.equal(t[102], 1);
    });

    test('two players on the same par 3 are each paid the full pot', () => {
        const t = dots(Object.assign({
            dots: { h8: { p101: ['greenie'], p102: ['greenie'] } }
        }, ON));
        assert.equal(t[101], 2);
        assert.equal(t[102], 2);
    });

    test('the final par 3 unclaimed kills the pot — nobody is paid', () => {
        const t = dots(Object.assign({ dots: {} }, ON));
        P.forEach(p => assert.equal(t[p.id], 0));
        const map = engine.greenieCarryMap(
            Object.assign({ players: P, dots: {} }, ON), COURSE, fullCard(), P);
        assert.equal(map.riding, 5, 'the pot is alive but was never awarded');
    });

    test('a greenie on a par 4 stays flat at 1 and never touches the pot', () => {
        const t = dots(Object.assign({
            dots: { h5: { p101: ['greenie'] }, h8: { p102: ['greenie'] } }
        }, ON));
        assert.equal(t[101], 1);
        assert.equal(t[102], 2);
    });

    test('par 3s before the game start hole are outside the pot', () => {
        assert.equal(dots(Object.assign({
            startHole: 8, dots: { h13: { p101: ['greenie'] } }
        }, ON))[101], 2);
    });
});

// ---------------------------------------------------------------------------
describe('GREENIE CARRYOVER — a pending hole never advances the pot', () => {
    const ON = { greenieCarryover: true };

    test('a half-entered par 3 leaves the next one at 1, not 2', () => {
        const partial = fullCard();
        delete partial['p103_h4'];
        assert.equal(dots(Object.assign({ dots: { h8: { p101: ['greenie'] } } }, ON), partial)[101], 1);
    });

    test('NEGATIVE CONTROL — the pot corrects the moment the last score lands', () => {
        const d = Object.assign({ dots: { h8: { p101: ['greenie'] } } }, ON);
        const partial = fullCard();
        delete partial['p103_h4'];
        assert.equal(dots(d, partial)[101], 1);
        assert.equal(dots(d, fullCard())[101], 2);
    });

    test('a blank string counts as not entered', () => {
        const scores = fullCard();
        scores['p103_h4'] = '';
        assert.equal(dots(Object.assign({ dots: { h8: { p101: ['greenie'] } } }, ON), scores)[101], 1);
    });

    test('pending under-states rather than over-states', () => {
        const partial = fullCard();
        [4, 8, 13].forEach(h => delete partial[`p103_h${h}`]);
        const t = dots(Object.assign({ dots: { h17: { p101: ['greenie'] } } }, ON), partial);
        assert.equal(t[101], 1, 'nothing has resolved, so nothing has carried');
    });
});

// ---------------------------------------------------------------------------
describe('ZERO SUM holds under both rules', () => {
    function settle(data) {
        const t = dots(data);
        const n = P.length;
        const total = P.reduce((s, p) => s + t[p.id], 0);
        return P.map(p => 5 * (n * t[p.id] - total));
    }

    test('an eagle plus a carried greenie sums to zero', () => {
        assert.equal(settle({
            greenieCarryover: true,
            dots: { h5: { p101: ['eagle'] }, h13: { p102: ['greenie'] } }
        }).reduce((a, b) => a + b, 0), 0);
    });

    test('a snake against a big carry sums to zero', () => {
        assert.equal(settle({
            greenieCarryover: true,
            dots: { h17: { p101: ['greenie'] }, h9: { p103: ['snake'] } }
        }).reduce((a, b) => a + b, 0), 0);
    });

    test('every player earning the same carried greenie nets everyone zero', () => {
        const out = settle({
            greenieCarryover: true,
            dots: { h13: { p101: ['greenie'], p102: ['greenie'], p103: ['greenie'] } }
        });
        out.forEach(v => assert.equal(v, 0));
    });
});

// ---------------------------------------------------------------------------
// There is no shared-module system in this app. Four files carry the same tally
// body, and this is what stops them drifting.
describe('PARITY — every copy of the dots engine agrees', () => {
    const idx = loadHtmlInlineScript('index.html', ['handicap.js', 'score-marks.js']);
    const sts = loadHtmlInlineScript('stats.html', ['handicap.js']);

    const cases = [
        { name: 'empty', d: { dots: {} } },
        { name: 'flat greenie, carry off', d: { dots: { h8: { p101: ['greenie'] } } } },
        { name: 'carried greenie', d: { greenieCarryover: true, dots: { h17: { p101: ['greenie'] } } } },
        { name: 'eagle', d: { dots: { h5: { p101: ['eagle'] } } } },
        { name: 'legacy birdie+eagle', d: { dots: { h5: { p101: ['birdie', 'eagle'] } } } },
        { name: 'snake and junk', d: { dots: { h3: { p101: ['snake'], p102: ['sandy', 'barkie'] } } } },
        { name: 'mixed round', d: {
            greenieCarryover: true,
            dots: { h4: { p102: ['sandy'] }, h8: { p101: ['greenie'] },
                    h9: { p103: ['eagle'] }, h17: { p102: ['greenie'] } }
        } },
    ];

    cases.forEach(c => {
        test(`money-engine, index.html and stats.html agree — ${c.name}`, () => {
            const data = Object.assign({ players: P }, c.d);
            const scores = fullCard();
            assert.equal(typeof idx.calcDotsEngine, 'function', 'index.html must define calcDotsEngine');
            assert.equal(typeof sts.calcDotsEngine, 'function', 'stats.html must define calcDotsEngine');

            const a = engine.calcDotsEngine(data, COURSE, scores);
            const fromIdx = idx.calcDotsEngine(data, COURSE, scores);
            const fromSts = sts.calcDotsEngine(data, COURSE, scores);

            assert.deepEqual(fromIdx.totals, a.totals, `index.html disagrees on ${c.name}`);
            assert.deepEqual(fromSts.totals, a.totals, `stats.html disagrees on ${c.name}`);
            assert.deepEqual(fromIdx.greenieCarry, a.greenieCarry,
                `index.html disagrees on the carry map for ${c.name}`);
        });
    });

    test('all four copies carry the same value table', () => {
        ['money-engine.js', 'index.html', 'stats.html'].forEach(f => {
            const src = read(f);
            assert.ok(/if \(dotType === 'snake'\) return -1;/.test(src), `${f} lost the snake value`);
            assert.ok(/if \(dotType === 'eagle'\) return 2;/.test(src), `${f} lost the eagle value`);
        });
        const he = read('hole-events.js');
        assert.ok(/else if \(d === 'eagle'\) net \+= 2;/.test(he),
            'hole-events.js must announce an eagle as two dots');
    });

    test('a missing flag reads as OFF in every copy', () => {
        ['money-engine.js', 'index.html', 'stats.html'].forEach(f => {
            assert.ok(/data\.greenieCarryover === true/.test(read(f)),
                `${f} must require an explicit true`);
        });
    });
});
