// ============================================================================
// LEGACY MAIN WAGER — RENDERED RECEIPT
//
// The previous batch taught settlement-engine.js to describe the round's own
// Match or Nassau as a virtual side match, with its full press history. It
// verified the BUILDER and stopped there. settlement.html never called it - it
// read data.sideMatches directly and returned early when that map was empty - so
// the improvement was built and thrown away, and the Receipt still printed one
// line with no presses, no start holes and no match net.
//
// EVERY TEST HERE RENDERS THE ACTUAL PAGE. Asserting on a builder's return value
// is what let a half-wired fix be reported as delivered; a test that never draws
// the Receipt cannot notice the Receipt ignoring its inputs.
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
const ENG = (() => {
    const sb = loadJsFile('money-engine.js');
    ['action-model.js', 'settlement-engine.js'].forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
})();
const call = c => { vm.runInContext(`window.__r = (function(){ ${c} })();`, ENG); return ENG.window.__r; };

// Renders the REAL Receipt and hands back its containers.
function render(d) {
    const sb = loadHtmlInlineScript('settlement.html',
        ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js']);
    vm.runInContext(`
        currentData = ${J(d)};
        renderCombinedSummary(currentData, currentData.courseData, currentData.scores);
        renderSettlement(currentData);
        renderReceiptScorecard();
        window.__a = document.getElementById('combined-settlement-summary').innerHTML;
        window.__b = document.getElementById('settle-content').innerHTML;
        window.__c = document.getElementById('receipt-scorecard').innerHTML;`, sb);
    return { top: sb.window.__a, mid: sb.window.__b, card: sb.window.__c };
}
const ledger = d => call(`
    var o = computeCombinedNetTotals(${J(d)}, ${J(CD)}, ${J(d.scores)});
    var n = {}; Object.keys(o.netByName).forEach(function(k){ n[o.netByName[k].name] = o.netByName[k].net; });
    return { net: n, tx: o.transactions };`);
const printedFinal = top => {
    const out = {};
    [...String(top).matchAll(/<span>([^<]+)<\/span><span[^>]*>([+-])\$([\d.]+) NET<\/span>/g)]
        .forEach(m => { out[m[1]] = (m[2] === '+' ? 1 : -1) * parseFloat(m[3]); });
    return out;
};

function duel() {
    const P = makePlayers(['Marty', 'Manny'], ['5', '5']);
    P.forEach((p, i) => { p.playingForMoney = true; p.team = i === 0 ? 'Team 1' : 'Team 2'; });
    const S = {};
    CD.forEach((h, i) => {
        S[`p${P[0].id}_h${h.hole}`] = h.par + (i % 4 === 0 ? 0 : 1);
        S[`p${P[1].id}_h${h.hole}`] = h.par;
    });
    return { P, S, id: k => String(P[k].id) };
}
function four() {
    const P = makePlayers(['Marty', 'Manny', 'Rocco', 'Steve'], ['5', '5', '10', '0']);
    P.forEach((p, i) => { p.playingForMoney = true; p.team = i % 2 === 0 ? 'Team 1' : 'Team 2'; });
    const S = {};
    CD.forEach((h, i) => P.forEach((p, pi) => { S[`p${p.id}_h${h.hole}`] = h.par + ((i + pi) % 3 === 0 ? 0 : 1); }));
    return { P, S, id: k => String(P[k].id) };
}

const F = duel();
const PRESSES = { a: { baseId: '18', startHole: 5 }, b: { baseId: '18', startHole: 9 }, c: { baseId: '18', startHole: 13 } };
const LEGACY = {
    gameFormat: 'match', matchStake: 50, matchScoring: 'net', matchPressRule: 'manual',
    matchPresses: PRESSES, courseName: 'Caledonia', players: F.P, courseData: CD, scores: F.S
};

// ---------------------------------------------------------------------------
describe('THE LEGACY MAIN WAGER IS RENDERED IN FULL', () => {
    test('the press history reaches the page, not just the builder', () => {
        const r = render(LEGACY);
        assert.equal((r.mid.match(/Press #/g) || []).length, 3, 'all three presses must print');
    });

    test('each segment states its start hole', () => {
        const r = render(LEGACY);
        assert.match(r.mid, /Started Hole 1/);
        assert.match(r.mid, /Started Hole 5/);
        assert.match(r.mid, /Started Hole 9/);
        assert.match(r.mid, /Started Hole 13/);
    });

    test('a MATCH NET is printed', () => {
        assert.match(render(LEGACY).mid, /MATCH NET/);
    });

    test('the wager names both sides', () => {
        assert.match(render(LEGACY).mid, /Marty vs Manny/);
    });

    test('THE REGRESSION: the builder is actually consulted', () => {
        // The bug was structural - the page read data.sideMatches and bailed out. This
        // asserts the page asks the shared helper instead of deciding for itself.
        const st = read('settlement.html');
        const fn = st.slice(st.indexOf('function buildSideMatchesHtml'), st.indexOf('function buildSideMatchesHtml') + 1600);
        assert.ok(/legacyMainAsSideMatch\(data\)/.test(fn), 'the page must ask the shared helper');
        assert.ok(/sideMatches\.__main = mainWager/.test(fn));
        assert.ok(!/const sideMatches = data\.sideMatches \|\| \{\};\s*\n\s*const matchIds/.test(fn),
            'reading the raw map and returning early is what discarded the block');
    });
});

// ---------------------------------------------------------------------------
describe('THE DUPLICATE CARD IS GONE', () => {
    test('no "Final Payout Settlement" card anywhere', () => {
        const r = render(LEGACY);
        assert.ok(!/Final Payout Settlement/.test(r.top + r.mid + r.card),
            'one bet described twice is how a golfer stops trusting the number');
    });

    test('the wager is described exactly ONCE', () => {
        const r = render(LEGACY);
        assert.equal((String(r.top + r.mid).match(/Marty vs Manny/g) || []).length, 1);
        assert.equal((r.mid.match(/MATCH NET/g) || []).length, 1);
    });

    test('the old card is removed from the source, not merely hidden', () => {
        const st = read('settlement.html');
        const live = st.split('\n').filter(l => l.indexOf('//') < 0).join('\n');
        assert.ok(!/settle-header">\uD83D\uDCB5 Final Payout Settlement/.test(live));
    });

    test('per-player totals are still available above', () => {
        // Nothing was lost by removing the card: Final Results and Who Pays Who carry
        // the same information, per golfer rather than per team.
        const r = render(LEGACY);
        assert.match(r.top, /Final Results/);
        assert.match(r.top, /Who Pays Who/);
        const printed = printedFinal(r.top);
        assert.ok(Object.keys(printed).length >= 2, 'both golfers must still be listed');
    });
});

// ---------------------------------------------------------------------------
describe('MONEY PARITY ON THE RENDERED PAGE', () => {
    test('Final Results equal the ledger', () => {
        const r = render(LEGACY);
        const led = ledger(LEGACY).net;
        const printed = printedFinal(r.top);
        Object.keys(led).forEach(n => {
            if (led[n] === 0) return;
            assert.equal(printed[n], led[n], `${n}: Receipt ${printed[n]} vs ledger ${led[n]}`);
        });
    });

    test('the printed MATCH NET equals the ledger', () => {
        const r = render(LEGACY);
        const led = ledger(LEGACY).net;
        const m = /MATCH NET[^$]*\$(\d+)/.exec(r.mid);
        assert.ok(m, 'no MATCH NET printed');
        const winner = Object.keys(led).find(n => led[n] > 0);
        assert.equal(parseInt(m[1], 10), led[winner], 'the block must agree with the money');
    });

    test('Who Pays Who reconstructs the printed Final Results', () => {
        const r = render(LEGACY);
        const printed = printedFinal(r.top);
        const tx = [...String(r.top).matchAll(/<span>([^<]+) → ([^<]+)<\/span><span[^>]*>\$([\d.]+)<\/span>/g)]
            .map(m => ({ from: m[1], to: m[2], amount: parseFloat(m[3]) }));
        const rb = {}; Object.keys(printed).forEach(n => { rb[n] = 0; });
        tx.forEach(t => { rb[t.from] -= t.amount; rb[t.to] += t.amount; });
        Object.keys(printed).forEach(n => assert.equal(rb[n], printed[n], n));
    });

    test('the round stays zero-sum', () => {
        assert.equal(Object.values(ledger(LEGACY).net).reduce((a, b) => a + b, 0), 0);
    });
});

// ---------------------------------------------------------------------------
describe('ACTION WAGERS ARE UNCHANGED', () => {
    const ACTION = {
        gameFormat: 'stroke', players: F.P, courseData: CD, scores: F.S,
        sideMatches: {
            m: {
                format: 'match', scoring: 'net', stake: 50, pressRule: 'manual', presses: PRESSES,
                teamAIds: [F.id(0)], teamBIds: [F.id(1)], startHole: 1, createdAt: 1
            }
        }
    };

    test('it renders exactly as before', () => {
        const r = render(ACTION);
        assert.equal((r.mid.match(/Press #/g) || []).length, 3);
        assert.match(r.mid, /MATCH NET/);
        assert.ok(!/Final Payout Settlement/.test(r.top + r.mid));
    });

    test('an Action wager and the same legacy wager settle identically', () => {
        assert.equal(J(ledger(ACTION).net), J(ledger(LEGACY).net));
    });

    test('both now EXPLAIN the wager identically too', () => {
        const a = render(ACTION).mid, l = render(LEGACY).mid;
        assert.equal((a.match(/Press #/g) || []).length, (l.match(/Press #/g) || []).length);
        assert.equal(/Started Hole/.test(a), /Started Hole/.test(l));
        assert.equal(/MATCH NET/.test(a), /MATCH NET/.test(l));
    });
});

// ---------------------------------------------------------------------------
describe('NOTHING IS INVENTED', () => {
    test('a Stroke Play round shows no wager block', () => {
        const r = render({ gameFormat: 'stroke', players: F.P, courseData: CD, scores: F.S });
        assert.ok(!/Marty vs Manny/.test(r.mid), 'how a round is scored is not a bet');
        assert.ok(!/MATCH NET/.test(r.mid));
        assert.ok(!/Final Payout Settlement/.test(r.top + r.mid));
        assert.match(r.mid, /No money bets were set up/);
    });

    test('a $0 main stake shows no wager block', () => {
        const r = render({ gameFormat: 'match', matchStake: 0, matchScoring: 'net', players: F.P, courseData: CD, scores: F.S });
        assert.ok(!/MATCH NET/.test(r.mid));
    });

    test('Skins, Dots, Stableford, Wolf and Hi-Lo gain no match-play block', () => {
        const g = four();
        [['skins', { skinsBuyIn: 10, skinsCarryOver: true, skinsPotFormat: 'gross' }],
        ['dots', { dotPointVal: 5 }],
        ['stableford', { stablefordPointVal: 1 }],
        ['wolf', { wolfPointVal: 2 }],
        ['hilo', { hiloStake: 20 }]].forEach(([fmt, extra]) => {
            const d = Object.assign({ gameFormat: fmt, players: g.P, courseData: CD, scores: g.S }, extra);
            const r = render(d);
            assert.ok(!/MATCH NET/.test(r.mid), `${fmt} gained a match-play block`);
            assert.equal(Object.values(ledger(d).net).reduce((a, b) => a + b, 0), 0, `${fmt} not zero-sum`);
        });
    });
});

// ---------------------------------------------------------------------------
describe('NASSAU AND TEAM WAGERS', () => {
    const g = four();
    const NAS = { gameFormat: 'nassau', nassauStake: 20, nassauScoring: 'net', nassauPressRule: 'none', players: g.P, courseData: CD, scores: g.S };

    test('Front 9, Back 9 and Total all render', () => {
        const r = render(NAS);
        assert.match(r.mid, /Front 9/);
        assert.match(r.mid, /Back 9/);
        assert.match(r.mid, /Total/);
        assert.ok(!/Final Payout Settlement/.test(r.top + r.mid));
    });

    test('a team wager names both sides rather than implying a 1v1', () => {
        const r = render(NAS);
        assert.match(r.mid, /\//, 'a team side must list both golfers');
    });

    test('the printed net matches the summed ledger', () => {
        const r = render(NAS);
        const led = ledger(NAS).net;
        const teamSum = Object.keys(led).filter(n => led[n] > 0).reduce((a, n) => a + led[n], 0);
        const m = /MATCH NET[^$]*\$(\d+)/.exec(r.mid);
        assert.ok(m);
        assert.equal(parseInt(m[1], 10), teamSum);
    });
});

// ---------------------------------------------------------------------------
describe('MAIN AND SIDE TOGETHER', () => {
    const BOTH = Object.assign({}, LEGACY, {
        sideMatches: {
            s: { format: 'match', scoring: 'net', stake: 20, pressRule: 'none', teamAIds: [F.id(0)], teamBIds: [F.id(1)], startHole: 1, createdAt: 1 }
        }
    });

    test('both wagers render, each once', () => {
        const r = render(BOTH);
        assert.equal((r.mid.match(/MATCH NET/g) || []).length, 2, 'one block per wager');
    });

    test('the money is not double-counted', () => {
        const led = ledger(BOTH).net;
        assert.equal(Object.values(led).reduce((a, b) => a + b, 0), 0);
        // $50 main + $150 presses + $20 side = $220 to the winner.
        assert.equal(Math.max(...Object.values(led)), 220);
    });

    test('Final Results still equal the ledger', () => {
        const r = render(BOTH);
        const led = ledger(BOTH).net;
        const printed = printedFinal(r.top);
        Object.keys(led).forEach(n => { if (led[n] !== 0) assert.equal(printed[n], led[n], n); });
    });
});

// ---------------------------------------------------------------------------
describe('PROTECTED — display only', () => {
    test('the money path never consults the display helper', () => {
        const se = read('settlement-engine.js');
        const fn = se.slice(se.indexOf('function computeCombinedNetTotals'), se.indexOf('function computeCombinedNetTotals') + 3000);
        assert.ok(!/legacyMainAsSideMatch/.test(fn));
    });

    test('money-engine.js gained nothing', () => {
        assert.ok(!/legacyMainAsSideMatch|buildSideMatchesHtml/.test(read('money-engine.js')));
    });

    test('the Receipt still recalculates nothing of its own', () => {
        const st = read('settlement.html');
        assert.ok(!/function legacyMainAsSideMatch/.test(st),
            'the page must consume the shared helper, not clone it');
        assert.equal((read('settlement-engine.js').match(/function legacyMainAsSideMatch/g) || []).length, 1);
    });

    test('there is still one canonical print path', () => {
        assert.equal((read('settlement.html').match(/function printReceipt/g) || []).length, 1);
    });
});
