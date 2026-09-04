// ============================================================================
// RESULTS HAS TWO JOBS
//
// DURING THE ROUND it answers three questions: who is leading, who has won
// skins, what is still outstanding. AFTER the round it is the settlement
// receipt. Trying to be both produced the screen device QA found at hole five -
// a $480 accounting statement, pending-dollar rows for holes nobody had played,
// and "Waiting on..." for all thirteen remaining holes.
//
// THE STATE RULE, and why `settled` alone was not enough:
//
//   scores complete   every participant has posted every hole, via
//                     computePlayerRoundTotals() - the canonical per-golfer
//                     helper from the Finish Round work, asked of everybody.
//   money settled     pool-engine's `settled`: unresolved KP confirmed or
//                     cancelled.
//
// FINAL requires BOTH. A round five holes in with no KP money reports
// settled === true, and on that basis the page used to render the entire
// receipt while the group was still on the front nine.
//
// NO NEW MATH. Standings come from computeNetToParStandings() - the same
// function the scorecard ticker and Leaderboard tab call, so all three surfaces
// rank identically. Skins come from computeSkinsHoleLedger(). Not one dollar
// figure appears while the round is live.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const DEPS = ['score-marks.js','money-engine.js','action-model.js','settlement-engine.js','pool-engine.js'];

const NAMES = ['Marty','Scott','Carp','Randy','Manny','Matt B','Lance','Kopp',
               'Marcus','Rocco','Matt H','Jeremy'];

// The production Main Pool shape from captureMoneyPool(): Net Finish, KP, Net Skins.
const MONEY_POOL = {
    enabled: true, buyIn: 40,
    kp: { amount: 100, holes: [3,7,12,16] },
    net: { amount: 70, places: [57.142857, 42.857143] },
    skins: { mode: 'remainder', scoring: 'net', carryOver: false },
};

function results({ thru = [5,5,5], confirmed = false, pool = MONEY_POOL,
                   side = false, tweak = null } = {}) {
    const sb = loadHtmlInlineScript('settlement.html', DEPS);
    const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
    const ps = NAMES.map((n,i)=>({ id:101+i, name:n, hcp:'0', playingForMoney:true }));
    const sc = {};
    ps.forEach((p,pi)=>{
        const g = Math.floor(pi/4);
        cd.forEach(h => { if (h.hole <= thru[g]) sc['p'+p.id+'_h'+h.hole] = 4; });
    });
    sc['p103_h1'] = 3;   // Carp
    sc['p102_h2'] = 3;   // Scott
    sc['p103_h3'] = 3;   // Carp
    sc['p110_h5'] = 3;   // Rocco   (hole 4 level = tie)
    if (tweak) tweak(sc);
    const d = { players: ps, courseData: cd, scores: sc, gameFormat:'stroke',
                settlementMode:'whole-dollar' };
    if (pool) d.moneyPool = pool;
    if (confirmed) { d.kpWinners = { h3:'101', h7:'105', h12:'109', h16:'102' };
                     d.kpConfirmed = { confirmed: true }; }
    if (side) d.sideMatches = { m1:{ format:'match', scoring:'net', stake:50,
        startHole:1, createdAt:1, teamAIds:['101'], teamBIds:['103'] } };
    vm.runInContext(`currentMode='ABCD'; currentData=${JSON.stringify(d)};
        renderCombinedSummary(currentData, currentData.courseData, currentData.scores);`, sb);
    return {
        sb, run: c => vm.runInContext(c, sb),
        html: () => sb.document.getElementById('combined-settlement-summary').innerHTML,
        text: () => strip(sb.document.getElementById('combined-settlement-summary').innerHTML),
    };
}
const LIVE  = { thru:[5,5,5], confirmed:false };
const FINAL = { thru:[18,18,18], confirmed:true };

// ============================================================================

describe('LIVE MODE — A GOLF SUMMARY', () => {

    test('an unfinished round renders LIVE RESULTS', () => {
        const t = results(LIVE).text();
        assert.match(t, /LIVE RESULTS/);
        assert.ok(!/Final Results/.test(t));
    });

    test('THRU comes from the official point, not this device\u2019s hole', () => {
        assert.match(results({ thru:[5,5,5] }).text(), /THRU 5/);
        assert.match(results({ thru:[6,6,4] }).text(), /THRU 4/, 'the slowest group sets it');
    });

    test('a round with every score in but KP unresolved is STILL live', () => {
        // settled === false, so the money is not final even though the golf is done.
        const t = results({ thru:[18,18,18], confirmed:false }).text();
        assert.match(t, /LIVE RESULTS/);
    });

    test('a round with holes missing is live even when settled === true', () => {
        // The failure that made `settled` alone insufficient: no KP money means
        // settled === true from hole one.
        const noKp = JSON.parse(JSON.stringify(MONEY_POOL));
        noKp.kp = { amount: 0, holes: [] };
        noKp.net = { amount: 170, places: [57.142857, 42.857143] };
        const b = results({ thru:[5,5,5], pool: noKp });
        assert.equal(b.run('computeMoneyPool(currentData, currentData.courseData, currentData.scores).settled'), true);
        assert.match(b.text(), /LIVE RESULTS/, 'five holes played is not a finished round');
    });
});

describe('LIVE STANDINGS — NET TO PAR', () => {

    test('the top 5 are shown, relative to par', () => {
        const t = results(LIVE).text();
        assert.match(t, /OVERALL — NET/);
        assert.match(t, /1 Carp -2/);
        const shown = NAMES.filter(n => t.includes(n));
        assert.ok(shown.length <= 6, 'a summary, not the whole field');
    });

    test('cumulative net strokes are NOT substituted for to-par', () => {
        const t = results(LIVE).text();
        assert.ok(!/Net \d\d/.test(t), '"Net 19" is meaningless at hole five');
        assert.match(t, /(-\d+|\+\d+|E)/);
    });

    test('tie positions are honest', () => {
        assert.match(results(LIVE).text(), /T2/);
    });

    test('View Full Leaderboard is offered', () => {
        const html = results(LIVE).html();
        assert.match(strip(html), /View Full Leaderboard/);
        assert.match(html, /href="leaderboard\.html\?game=ABCD"/);
    });

    test('the order matches the canonical helper exactly', () => {
        const m = loadJsFile('money-engine.js');
        const b = results(LIVE);
        const canon = b.run('computeNetToParStandings(currentData.players, currentData.courseData, currentData.scores, { basis: "net" })');
        const order = JSON.parse(JSON.stringify(canon)).filter(r => r.started).slice(0,5).map(r => r.name);
        const shown = [...b.html().matchAll(/class="lr-name">([^<]+)</g)].map(x => x[1]).slice(0, 5);
        assert.deepEqual(shown, order, 'Results must not rank differently from the Leaderboard');
    });
});

describe('LIVE SKINS — WINNERS ONLY', () => {

    test('official winners, counts and holes', () => {
        const t = results(LIVE).text();
        assert.match(t, /Carp 2 skins Holes 1, 3/);
        assert.match(t, /Scott 1 skin Hole 2/);
        assert.match(t, /Rocco 1 skin Hole 5/);
    });

    test('the tied hole is absent', () => {
        const t = results(LIVE).text();
        const skins = t.slice(t.indexOf('SKINS WON'));
        assert.ok(!/Hole 4/.test(skins));
        assert.ok(!/No Skin/.test(skins));
    });

    test('a TWO-WAY TIE produces no winner row at all', () => {
        // Sabotaging the tie filter left the suite green: in the base fixture the tied
        // hole has no `winner` either, so dropping the state check changed nothing. A
        // ledger can mark a hole tied AND name a low scorer, and that is the case the
        // filter exists for.
        const b = results({
            thru: [5,5,5],
            tweak: sc => { sc['p104_h4'] = 3; sc['p105_h4'] = 3; },   // two golfers share the low
        });
        const t = b.text();
        const skins = t.slice(t.indexOf('SKINS WON'));
        assert.ok(!/Hole 4/.test(skins), 'a shared low is not a skin');
        assert.ok(!/Randy|Manny/.test(skins), 'neither tied golfer may be credited');
        // The ledger reports the tie AND leaves winner null, so `!r.winner` already
        // excludes it and the `state === 'tie'` check is belt-and-braces rather than
        // load-bearing. Removing it changes no behaviour, which is why sabotaging it
        // could not be made to fail - stated here rather than dressed up as a control.
        const row = b.run(`(function () {
            var L = computeSkinsHoleLedger(currentData, currentData.courseData, currentData.scores,
                { groupOf: function (id) { return liveGroupOf(currentData, id); } });
            var l = (L.net || L.gross).holes.find(function (h) { return h.hole === 4; });
            return { state: l.state, hasWinner: !!l.winner };
        })()`);
        assert.equal(JSON.parse(JSON.stringify(row)).state, 'tie');
        assert.equal(JSON.parse(JSON.stringify(row)).hasWinner, false,
            'a tie carries no winner, which is what actually keeps it off the list');
    });

    test('golfers with no skins are absent', () => {
        const t = results(LIVE).text();
        const skins = t.slice(t.indexOf('SKINS WON'), t.indexOf('KP'));
        assert.ok(!/Jeremy|Matt H/.test(skins));
    });

    test('the official-through line is stated', () => {
        assert.match(results(LIVE).text(), /Official through Hole 5/);
    });

    test('no waiting-hole flood', () => {
        const t = results(LIVE).text();
        assert.ok(!/Waiting/.test(t), 'thirteen "waiting" rows is what we removed');
    });

    test('an honest empty state', () => {
        const t = results({ thru:[1,1,1], tweak: sc => { delete sc['p103_h1']; } }).text();
        assert.match(t, /No official skins yet/);
    });
});

describe('LIVE KP — A STATUS LINE, NOT A LEDGER', () => {

    test('it is one concise line', () => {
        assert.match(results(LIVE).text(), /4 KPs today · none confirmed yet/);
    });

    test('no pending-dollar rows', () => {
        const t = results(LIVE).text();
        assert.ok(!/pending/i.test(t));
        assert.ok(!/no winner recorded/i.test(t));
    });

    test('it reflects recorded KPs truthfully', () => {
        const b = results({ thru:[5,5,5], tweak: null });
        b.run(`currentData.kpWinners = { h3: '101', h7: '105' };
               renderCombinedSummary(currentData, currentData.courseData, currentData.scores);`);
        assert.match(strip(b.html()), /4 KPs today · 2 of 4 recorded/);
    });
});

describe('LIVE MODE SHOWS NO MONEY AT ALL', () => {

    const banned = ['Player Payouts','Who Pays Who','Final Ledger','TOTAL PAYOUT',
                    'Main Pool','Skins Pot','buy-in','Print / Save'];

    banned.forEach(w => {
        test(`"${w}" is absent while the round is live`, () => {
            assert.ok(!new RegExp(w, 'i').test(results(LIVE).text()),
                `${w} belongs to the finished round`);
        });
    });

    test('not a single dollar sign', () => {
        assert.ok(!/\$/.test(results(LIVE).html()));
    });

    test('no full scorecard', () => {
        assert.ok(!/receipt-table|>HOLE</.test(results(LIVE).html()));
    });

    test('no per-player buy-in arithmetic', () => {
        assert.ok(!/\(\d+ × \$\d+\)/.test(results(LIVE).text()));
    });
});

describe('FINAL MODE KEEPS THE RECEIPT', () => {

    test('a completed, settled round renders Final Results', () => {
        const t = results(FINAL).text();
        assert.match(t, /Final Results/);
        assert.ok(!/LIVE RESULTS/.test(t));
    });

    test('Player Payouts return', () => {
        assert.match(results(FINAL).text(), /Player Payouts/);
        assert.match(results(FINAL).text(), /TOTAL PAYOUT/);
    });

    test('skin dollar values return', () => {
        // The Skins Pot itemisation lives in the money-pool section, a separate mount
        // rendered by renderMoneyPoolSection(); what this card must show is money.
        assert.ok(/\$/.test(results(FINAL).html()), 'money belongs here');
        assert.match(results(FINAL).text(), /NET/, 'net positions are stated');
    });

    test('KP detail returns', () => {
        assert.match(results(FINAL).text(), /KP/);
    });

    test('Print / Save PDF returns', () => {
        assert.match(results(FINAL).text(), /Print \/ Save PDF/);
    });

    test('POOL-ONLY still suppresses Who Pays Who', () => {
        assert.ok(!/Who Pays Who/.test(results(FINAL).text()));
    });

    test('a genuine side match still allows Who Pays Who', () => {
        assert.match(results({ thru:[18,18,18], confirmed:true, side:true }).text(), /Who Pays Who/);
    });

    test('and the buy-in still never appears', () => {
        const t = results(FINAL).text();
        assert.ok(!/buy-in/i.test(t));
        assert.ok(!/\(\d+ × \$\d+\)/.test(t));
    });
});

describe('NO DUPLICATE MATH', () => {

    const fn = () => {
        const src = read('settlement.html');
        const at = src.indexOf('function buildLiveResultsHtml');
        return src.slice(at, src.indexOf('\n    // ---- IS THE ROUND', at));
    };

    test('standings come from the shared helper', () => {
        assert.match(fn(), /computeNetToParStandings\(data\.players \|\| \[\], courseData, savedScores/);
    });

    test('skins come from the canonical ledger', () => {
        assert.match(fn(), /computeSkinsHoleLedger\(data, courseData, savedScores/);
    });

    test('it allocates nothing and resolves nothing', () => {
        const f = fn();
        ['getStrokes(','parseHcp(','allocateWholeDollars(','splitCentsEvenly(','simplifyDebts(']
            .forEach(t => assert.ok(!f.includes(t), `live Results must not calculate; found ${t}`));
    });

    test('completion uses the existing per-golfer helper', () => {
        const src = read('settlement.html');
        const at = src.indexOf('function roundScoresComplete');
        const f = src.slice(at, src.indexOf('\n    function moneyIsSettled', at));
        assert.match(f, /computePlayerRoundTotals\(p, holes, savedScores\)\.complete === true/);
        assert.match(f, /players\.every/, 'every participant, not a sample');
    });

    test('finality reads pool-engine, it does not re-derive it', () => {
        const src = read('settlement.html');
        const at = src.indexOf('function moneyIsSettled');
        const f = src.slice(at, src.indexOf('\n    function renderCombinedSummary', at));
        assert.match(f, /r\.settled === false/);
        ['kpWinners','kpConfirmed &&','kpUnresolvedCents >']
            .forEach(t => assert.ok(!f.includes(t), `must not re-derive settlement; found ${t}`));
    });

    test('no engine learned about this split', () => {
        ['pool-engine.js','settlement-engine.js','money-engine.js']
            .forEach(f => assert.ok(!/LIVE RESULTS|buildLiveResultsHtml/.test(read(f)),
                `${f} must not carry presentation state`));
    });
});
