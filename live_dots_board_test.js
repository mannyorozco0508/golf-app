// ============================================================================
// LIVE DOTS LEADERBOARD + KP HOLE HISTORY
//
// The question this answers on the tee is "who is winning the junk, and what for" -
// which the to-par board cannot answer and should not try to.
//
// ONE ENGINE. Totals and the itemised awards come out of a single calcDotsEngine()
// call, the same call settlement uses. A live card claiming six dots while the
// receipt pays seven would be worse than no card, so parity is asserted directly
// rather than assumed.
//
// WHOLE FIELD, DELIBERATELY. Every other widget on that row scopes to
// __scFilteredPlayers because they describe the group being scored. Dots does not:
// calcDotsEngine settles across data.players. Following convenience instead of the
// engine would put a different player set on screen from the one being paid.
//
// WON KP vs CURRENT KP. A chip reading "KP 8" means this golfer WON hole 8's KP.
// What the next KP is currently WORTH is a separate question, answered by
// kpLiveLineHtml(). Blending them would make both meaningless.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const IDX = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
const DEPS = ['handicap.js', 'score-marks.js', 'money-engine.js', 'action-model.js',
    'settlement-engine.js', 'bet-strip.js', 'hole-events.js'];
const engine = loadJsFile('money-engine.js');

const P = ['Manny', 'John', 'Steve', 'Mike'].map((n, i) => ({
    id: 101 + i, name: n, hcp: '0', playingForMoney: true, group: 1
}));
// Par 3s on 2, 8, 11, 14.
const CD = Array.from({ length: 18 }, (_, i) => ({
    hole: i + 1, par: [2, 8, 11, 14].includes(i + 1) ? 3 : 4, hcpIndex: i + 1
}));
const full = () => { const s = {}; P.forEach(p => CD.forEach(h => { s[`p${p.id}_h${h.hole}`] = h.par; })); return s; };

function data(extra, scores) {
    return Object.assign({
        gameFormat: 'dots', players: P, courseData: CD, scores: scores || full(),
        dotPointVal: 5, dots: {},
        additionalGameInstances: { d: { format: 'dots', enabled: true, startHole: 1, createdAt: 1 } }
    }, extra || {});
}

// Renders the REAL widget.
function board(extra, scores) {
    const sb = loadHtmlInlineScript('index.html', DEPS);
    vm.runInContext(`
        currentMode = 'A';
        currentData = ${JSON.stringify(data(extra, scores))};
        currentViewedHole = 1;
        window.__scFilteredPlayers = currentData.players;
        window.__html = renderDotsWidgetHtml();
    `, sb);
    return sb.window.__html || '';
}
const strip = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const chips = h => [...h.matchAll(/class="ld-chip[^"]*">([^<]+)</g)].map(m => m[1].trim());
const rowOrder = h => [...h.matchAll(/class="ld-name">([^<]+)</g)].map(m => m[1]);
const totals = h => [...h.matchAll(/class="ld-total">([^<]+)</g)].map(m => m[1].trim());

// ---------------------------------------------------------------------------
describe('WHEN THE BOARD APPEARS AT ALL', () => {
    test('no Dots game means no card', () => {
        const sb = loadHtmlInlineScript('index.html', DEPS);
        const d = data(); delete d.additionalGameInstances; d.gameFormat = 'stroke';
        vm.runInContext(`currentData = ${JSON.stringify(d)}; window.__h = renderDotsWidgetHtml();`, sb);
        assert.equal(sb.window.__h, '', 'an empty card in an ordinary round is just clutter');
    });

    test('Dots active with no dots yet still lists everyone at 0', () => {
        const h = board();
        assert.match(h, /LIVE DOTS/);
        assert.equal(rowOrder(h).length, 4, 'the game is running; show it');
        assert.deepEqual(totals(h), ['0 dots', '0 dots', '0 dots', '0 dots']);
        assert.deepEqual(chips(h), [], 'no invented chips');
    });
});

// ---------------------------------------------------------------------------
describe('TOTALS COME FROM THE ENGINE', () => {
    test('singular and plural are both correct', () => {
        const one = board({ dots: { h4: { p101: ['birdie'] } } });
        assert.match(one, /1 dot</, 'one dot, not "1 dots"');
        const two = board({ dots: { h4: { p101: ['birdie'] }, h6: { p101: ['sandy'] } } });
        assert.match(two, /2 dots</);
    });

    test('a snake subtracts, and reads correctly at -1', () => {
        const h = board({ dots: { h4: { p101: ['snake'] } } });
        assert.match(h, /-1 dot</, 'magnitude one is singular');
    });

    test('sorted by units, highest first', () => {
        const h = board({ dots: {
            h4: { p102: ['birdie'] },
            h5: { p103: ['birdie'], p101: ['birdie'] },
            h6: { p101: ['sandy'] }, h7: { p101: ['barkie'] }
        } });
        assert.deepEqual(rowOrder(h), ['Manny', 'John', 'Steve', 'Mike']);
        assert.deepEqual(totals(h), ['3 dots', '1 dot', '1 dot', '0 dots']);
    });

    test('ties fall back to the round\'s own player order, deterministically', () => {
        const d = { dots: { h4: { p103: ['birdie'], p102: ['birdie'] } } };
        assert.deepEqual(rowOrder(board(d)), rowOrder(board(d)), 'stable across renders');
        // John (index 1) precedes Steve (index 2) at equal units.
        assert.deepEqual(rowOrder(board(d)).slice(0, 2), ['John', 'Steve']);
    });

    test('NEGATIVE CONTROL — totals are not hardcoded; they track the engine', () => {
        const d = { dots: { h4: { p101: ['birdie'] } } };
        const live = totals(board(d))[0];
        const canonical = engine.calcDotsEngine(data(d), CD, full()).totals[101];
        assert.equal(live, canonical + ' dot');
    });
});

// ---------------------------------------------------------------------------
describe('EVERY AWARD CARRIES ITS HOLE NUMBER', () => {
    test('a KP on hole 2 reads "KP 2"', () => {
        assert.deepEqual(chips(board({ dots: { h2: { p101: ['greenie'] } } })), ['KP 2']);
    });

    test('two KPs stay two chips — never collapsed to "2 KPs"', () => {
        const h = board({ dots: { h2: { p101: ['greenie'] }, h8: { p101: ['greenie'] } } });
        assert.deepEqual(chips(h), ['KP 2', 'KP 8']);
        assert.ok(!/2 KPs/.test(strip(h)), 'the hole history is the useful part');
    });

    test('mixed award types each keep their hole', () => {
        const h = board({ dots: { h2: { p101: ['greenie'] }, h5: { p101: ['birdie'] } } });
        assert.deepEqual(chips(h), ['KP 2', 'Birdie 5']);
    });

    test('every dot type renders a readable label with a hole', () => {
        const h = board({ dots: {
            h3: { p101: ['sandy'] }, h4: { p101: ['barkie'] }, h5: { p101: ['polie'] },
            h6: { p101: ['eagle'] }, h7: { p101: ['snake'] }
        } });
        assert.deepEqual(chips(h), ['Sandy 3', 'Barkie 4', 'Polie 5', 'Eagle 6', 'Snake 7']);
    });

    test('chips are ordered by hole ascending, so a round reads top to bottom', () => {
        const h = board({ dots: {
            h12: { p101: ['birdie'] }, h2: { p101: ['greenie'] }, h6: { p101: ['sandy'] }
        } });
        assert.deepEqual(chips(h), ['KP 2', 'Sandy 6', 'Birdie 12']);
    });

    test('two awards on ONE hole use a canonical order, not insertion order', () => {
        const a = board({ dots: { h2: { p101: ['birdie', 'greenie'] } } });
        const b = board({ dots: { h2: { p101: ['greenie', 'birdie'] } } });
        assert.deepEqual(chips(a), chips(b), 'Firebase key order must not reshuffle the UI');
        assert.deepEqual(chips(a), ['KP 2', 'Birdie 2']);
    });

    test('different golfers keep separate histories', () => {
        const h = board({ dots: { h2: { p101: ['greenie'] }, h8: { p102: ['greenie'] } } });
        assert.deepEqual(chips(h), ['KP 2', 'KP 8']);
        assert.deepEqual(rowOrder(h).slice(0, 2), ['Manny', 'John']);
    });
});

// ---------------------------------------------------------------------------
describe('A CARRIED KP IS WORTH ITS UNITS', () => {
    test('a 2-unit KP adds 2 to the total but stays one clean chip', () => {
        const h = board({ greenieCarryover: true, dots: { h8: { p101: ['greenie'] } } });
        assert.match(h, /2 dots</, 'hole 2 was unwon, so hole 8 paid two units');
        assert.deepEqual(chips(h), ['KP 8'], 'the history stays scannable');
    });

    test('a 3-unit KP adds 3', () => {
        const h = board({ greenieCarryover: true, dots: { h11: { p101: ['greenie'] } } });
        assert.match(h, /3 dots</);
        assert.deepEqual(chips(h), ['KP 11']);
    });

    test('NEGATIVE CONTROL — the carried KP is not counted as a flat 1', () => {
        const on = board({ greenieCarryover: true, dots: { h8: { p101: ['greenie'] } } });
        const off = board({ dots: { h8: { p101: ['greenie'] } } });
        assert.notEqual(totals(on)[0], totals(off)[0]);
        assert.equal(totals(off)[0], '1 dot');
    });

    test('with carryovers OFF a KP is one unit, as it always was', () => {
        assert.equal(totals(board({ dots: { h8: { p101: ['greenie'] } } }))[0], '1 dot');
    });
});

// ---------------------------------------------------------------------------
describe('WON KP IS NOT CURRENT KP', () => {
    test('the board shows history; it never quotes a live price', () => {
        const h = board({ greenieCarryover: true, dots: { h8: { p101: ['greenie'] } } });
        assert.ok(!/each|riding|\$/.test(strip(h)),
            'money and riding units belong to the hole banner, not the history');
    });

    test('the live value still lives in its own presenter', () => {
        const code = IDX.replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
        assert.match(code, /function kpLiveLineHtml/);
        const at = code.indexOf('function renderDotsWidgetHtml');
        assert.ok(!code.slice(at, at + 3000).includes('kpLiveLineHtml('),
            'the two concepts must not be blended into one string');
    });
});

// ---------------------------------------------------------------------------
describe('IT RECOMPUTES FROM SOURCE, ALWAYS', () => {
    test('a live update in the SAME session re-derives, never remembers', () => {
        // Two separate renders in two sandboxes cannot catch a cache that lives for the
        // life of the page - which is exactly the shape a stale-summary bug takes when
        // Firebase pushes an update. One sandbox, two renders, data changed in between.
        const sb = loadHtmlInlineScript('index.html', DEPS);
        vm.runInContext(`
            currentMode = 'A';
            currentData = ${JSON.stringify(data({ dots: { h4: { p101: ['birdie'] }, h6: { p101: ['sandy'] } } }))};
            window.__first = renderDotsWidgetHtml();
            currentData.dots = { h4: { p101: ['birdie'] } };   // the sandy was removed
            window.__second = renderDotsWidgetHtml();
            currentData.dots = { h4: { p101: ['birdie'] }, h9: { p102: ['eagle'] } };
            window.__third = renderDotsWidgetHtml();
        `, sb);
        assert.deepEqual(chips(sb.window.__first), ['Birdie 4', 'Sandy 6']);
        assert.deepEqual(chips(sb.window.__second), ['Birdie 4'], 'the removed dot must be gone');
        // chips() reads every row in board order, and the eagle is two units - so John
        // now sorts above Manny and his chip comes first.
        assert.deepEqual(chips(sb.window.__third), ['Eagle 9', 'Birdie 4'], 'and a new one must appear');
        assert.deepEqual(rowOrder(sb.window.__third).slice(0, 2), ['John', 'Manny']);
        assert.match(sb.window.__third, /2 dots</, "John's eagle counts two");
    });

    test('removing a dot removes its chip', () => {
        assert.deepEqual(chips(board({ dots: { h4: { p101: ['birdie'] } } })), ['Birdie 4']);
        assert.deepEqual(chips(board({ dots: { h4: {} } })), []);
    });

    test('moving a dot to another golfer moves the chip', () => {
        const a = board({ dots: { h2: { p101: ['greenie'] } } });
        const b = board({ dots: { h2: { p102: ['greenie'] } } });
        assert.equal(rowOrder(a)[0], 'Manny');
        assert.equal(rowOrder(b)[0], 'John');
    });

    test('removing a KP winner restores the carry downstream', () => {
        const won = board({ greenieCarryover: true, dots: { h2: { p101: ['greenie'] }, h8: { p102: ['greenie'] } } });
        const removed = board({ greenieCarryover: true, dots: { h2: {}, h8: { p102: ['greenie'] } } });
        assert.match(won, /1 dot</);
        assert.match(removed, /2 dots</, 'hole 2 unwon means hole 8 paid two');
    });

    test('a score correction that completes a hole updates the units', () => {
        const partial = full();
        delete partial['p104_h2'];
        const d = { greenieCarryover: true, dots: { h8: { p101: ['greenie'] } } };
        assert.equal(totals(board(d, partial))[0], '1 dot', 'hole 2 not finished by the field');
        assert.equal(totals(board(d))[0], '2 dots');
    });

    test('no cached summary — the widget calls the engine each render', () => {
        const at = IDX.indexOf('function renderDotsWidgetHtml');
        const fn = IDX.slice(at, at + 3000);
        assert.match(fn, /calcDotsEngine\(currentData/, 'recomputed, never remembered');
    });
});

// ---------------------------------------------------------------------------
describe('SCOPE FOLLOWS THE ENGINE, NOT CONVENIENCE', () => {
    test('the board uses the whole field, exactly as Dots settles', () => {
        const at = IDX.indexOf('function renderDotsWidgetHtml');
        const fn = IDX.slice(at, at + 3000);
        assert.match(fn, /currentData && currentData\.players/);
        const code = fn.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
        assert.ok(!/__scFilteredPlayers/.test(code),
            'group scoping here would describe a different game from the one being paid');
    });

    test('the to-par board keeps its group scoping — the two legitimately differ', () => {
        const fn = IDX.slice(IDX.indexOf('function liveStandings'), IDX.indexOf('function liveStandings') + 1800);
        assert.match(fn, /window\.__scFilteredPlayers/);
    });

    test('a second group\'s golfers appear, because Dots pays them too', () => {
        const wide = P.concat([{ id: 105, name: 'Guest', hcp: '0', playingForMoney: true, group: 2 }]);
        const sb = loadHtmlInlineScript('index.html', DEPS);
        const d = data({ dots: { h4: { p105: ['birdie'] } } });
        d.players = wide;
        vm.runInContext(`
            currentData = ${JSON.stringify(d)};
            window.__scFilteredPlayers = currentData.players.slice(0, 4);
            window.__h = renderDotsWidgetHtml();
        `, sb);
        assert.match(sb.window.__h, /Guest/, 'settled by Dots, so shown by Dots');
    });
});

// ---------------------------------------------------------------------------
describe('SETTLEMENT PARITY', () => {
    const CASES = {
        'plain birdie': { dots: { h4: { p101: ['birdie'] } } },
        'carried KP': { greenieCarryover: true, dots: { h8: { p101: ['greenie'] } } },
        'three carries': { greenieCarryover: true, dots: { h11: { p102: ['greenie'] } } },
        'snake and junk': { dots: { h3: { p101: ['snake'], p102: ['sandy', 'barkie'] } } },
        'mixed round': { greenieCarryover: true, dots: {
            h2: { p101: ['greenie'] }, h5: { p102: ['birdie'] },
            h8: { p103: ['greenie'] }, h9: { p101: ['eagle'] } } },
    };
    Object.keys(CASES).forEach(name => {
        test(`the board and settlement agree on units — ${name}`, () => {
            const d = CASES[name];
            const canonical = engine.calcDotsEngine(data(d), CD, full()).totals;
            const shown = board(d);
            const order = rowOrder(shown);
            const nums = totals(shown).map(t => parseInt(t, 10));
            order.forEach((nm, i) => {
                const pl = P.find(x => x.name === nm);
                assert.equal(nums[i], canonical[pl.id], `${nm} disagrees with settlement`);
            });
        });
    });
});

// ---------------------------------------------------------------------------
describe('MONEY DID NOT MOVE', () => {
    const money = d => engine.computeRoundMoneyByPlayer(
        Object.assign(data(d), { players: P.slice(0, 4) }), CD, full()).players.map(x => x.net);
    const g = h => ({ h: h });
    test('the Part 2 fixtures are untouched', () => {
        assert.deepEqual(money({ dots: { h8: { p101: ['greenie'] } } }), [15, -5, -5, -5]);
        assert.deepEqual(money({ greenieCarryover: true, dots: { h8: { p101: ['greenie'] } } }), [30, -10, -10, -10]);
        assert.deepEqual(money({ greenieCarryover: true, dots: { h11: { p101: ['greenie'] } } }), [45, -15, -15, -15]);
        assert.deepEqual(money({ greenieCarryover: true, dots: { h8: { p101: ['greenie'] }, h11: { p102: ['greenie'] } } }), [25, 5, -15, -15]);
        assert.ok(g);
    });
    test('every fixture is zero-sum', () => {
        [{ dots: { h8: { p101: ['greenie'] } } },
         { greenieCarryover: true, dots: { h11: { p101: ['greenie'] } } }].forEach(d => {
            assert.equal(money(d).reduce((a, b) => a + b, 0), 0);
        });
    });
});

// ---------------------------------------------------------------------------
describe('ONE PRESENTER, AND THE LAYOUT HOLDS', () => {
    test('there is exactly one Dots summary builder', () => {
        assert.equal((IDX.match(/function renderDotsWidgetHtml/g) || []).length, 1);
        const code = IDX.replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
        assert.equal((code.match(/renderDotsWidgetHtml\(/g) || []).length, 2,
            'one definition, one call site — the shared grid carries it to both mounts');
    });

    test('both scorecard views receive it through the Part 3 mounts', () => {
        assert.match(IDX, /const TICKER_MOUNTS = \['live-ticker-mount', 'fc-ticker-mount'\]/);
        assert.match(IDX, /'<div class="lw-grid">' \+ board \+ dotsBoard/);
    });

    test('it does not replace the to-par board', () => {
        assert.match(IDX, /const board = renderLeaderWidgetHtml\(\)/);
        assert.match(IDX, /board \|\| skins \|\| matches \|\| points \|\| hilo \|\| strokeBets \|\| dotsBoard/);
    });

    test('the card lives outside the score table, so cells cannot move', () => {
        const at = IDX.indexOf('id="full-card-container"');
        const before = IDX.slice(at, IDX.indexOf('<table class="card-table">', at));
        assert.match(before, /id="fc-ticker-mount"/);
    });

    test('long names ellipsis rather than pushing the total off a phone', () => {
        const css = IDX.replace(/\/\*[\s\S]*?\*\//g, '');
        const name = /\.ld-name\s*\{[^}]*\}/.exec(css);
        assert.ok(name, '.ld-name must be styled');
        assert.match(name[0], /min-width:\s*0/, 'without this a flex child refuses to shrink');
        assert.match(name[0], /text-overflow:\s*ellipsis/);
        const total = /\.ld-total\s*\{[^}]*\}/.exec(css);
        assert.match(total[0], /white-space:\s*nowrap/, 'the count must never wrap');
    });

    test('many chips wrap instead of scrolling the page sideways', () => {
        const css = IDX.replace(/\/\*[\s\S]*?\*\//g, '');
        const rule = /\.ld-chips\s*\{[^}]*\}/.exec(css);
        assert.ok(rule);
        assert.match(rule[0], /flex-wrap:\s*wrap/);
    });

    test('a long name and eight awards still render one row', () => {
        const wide = P.slice();
        wide[0] = Object.assign({}, P[0], { name: 'Bartholomew Featherstonehaugh III' });
        const sb = loadHtmlInlineScript('index.html', DEPS);
        const d = data({ dots: { h2: { p101: ['greenie'] }, h3: { p101: ['sandy'] },
            h4: { p101: ['barkie'] }, h5: { p101: ['polie'] }, h6: { p101: ['birdie'] },
            h8: { p101: ['greenie'] }, h9: { p101: ['eagle'] }, h12: { p101: ['birdie'] } } });
        d.players = wide;
        vm.runInContext(`currentData = ${JSON.stringify(d)}; window.__h = renderDotsWidgetHtml();`, sb);
        const h = sb.window.__h;
        assert.equal((h.match(/class="ld-head"/g) || []).length, 4, 'one head row per golfer');
        assert.equal(chips(h).length, 8);
    });
});

// ---------------------------------------------------------------------------
describe('PART 3 IS NOT REOPENED', () => {
    test('the nav anchor still measures geometry and knows nothing about Dots', () => {
        const fn = IDX.slice(IDX.indexOf('function withNavAnchor'),
            IDX.indexOf('function withNavAnchor') + 2600);
        assert.match(fn, /getBoundingClientRect\(\)\.top - before/);
        assert.ok(!/ld-row|ld-chips|renderDotsWidgetHtml|LIVE DOTS/.test(fn),
            'a taller board is just a bigger delta — never a hardcoded offset');
        assert.ok(!/setTimeout/.test(fn));
    });

    test('navigation still routes through the anchor', () => {
        assert.match(IDX, /withNavAnchor\(renderHoleView\)/);
    });
});
