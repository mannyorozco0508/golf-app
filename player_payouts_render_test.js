// ============================================================================
// PLAYER PAYOUTS — presentation only
//
// WHAT CHANGED, AND WHAT DELIBERATELY DID NOT
//
// The section used to be an accounting view: a Main Pool aggregate with the
// buy-in, the prizes and the refund indented beneath it, closing on FINAL NET.
// Correct, and not the question a golfer is asking. Carp winning $30 + $89 + $9
// read as "+$88" with a -$40 line above it.
//
// It now answers "what did I win, and what for?". Who Pays Who answers "what do
// I owe?" from the same canonical ledger - which is why removing the buy-in here
// loses nothing. It is still in the engine, still in every net balance, still in
// the transactions people settle from.
//
// NO MATH MOVED. These tests assert that twice over: the contribution model is
// byte-identical in shape, and Who Pays Who reconstructs the same balances it
// did before. The presenter only chooses which canonical lines to show.
//
// TWO EXCLUSIONS, for different reasons:
//   'Main Pool buy-in'  paid in, not won.
//   'Main Pool'         the AGGREGATE line, whose own notes carry the detail.
//                        Showing both would count the same money twice - which is
//                        why the total is summed from the lines actually printed.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const PAGE = 'settlement.html';
const DEPS = ['money-engine.js','action-model.js','pool-engine.js','settlement-engine.js','score-marks.js'];
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const PAR = [4,5,4,4,4,3,4,3,4, 4,3,4,4,4,4,3,5,4];
const IDX = [15,13,1,3,11,5,9,17,7, 12,6,2,16,8,14,18,4,10];
const FIELD = [
  ['Marty', 9,[5,5,4,4,4,3,5,3,5, 4,4,3,5,5,4,4,7,6]],
  ['Scott', 7,[4,4,5,5,7,4,4,3,5, 5,3,6,4,5,4,4,4,7]],
  ['Carp',  2,[3,5,3,4,5,3,5,2,5, 4,4,3,4,4,5,3,6,4]],
  ['Randy', 9,[5,9,4,4,4,6,6,2,6, 6,4,6,4,5,4,3,7,7]],
  ['Manny', 0,[4,5,4,4,4,3,5,3,4, 5,3,4,3,4,5,3,5,4]],
  ['Matt B',8,[5,7,5,4,6,3,5,2,5, 5,4,4,6,5,6,3,6,5]],
  ['Lance', 3,[4,5,4,4,4,3,5,3,4, 5,3,5,4,4,5,2,6,5]],
  ['Kopp',  6,[5,6,5,5,5,3,5,3,5, 4,4,4,5,6,4,3,4,6]],
  ['Marcus',9,[4,6,5,5,4,3,5,4,5, 4,3,4,5,4,5,3,4,5]],
  ['Rocco',13,[5,8,5,5,4,3,6,3,8, 5,6,5,5,5,6,7,10,7]],
  ['Matt H',12,[6,10,4,6,5,4,5,4,5, 4,5,4,5,5,5,3,5,9]],
  ['Jeremy',12,[7,5,4,4,6,3,5,5,5, 4,4,6,6,5,6,3,7,7]],
];

function boot({ kpWinners = {}, kpNoWinner = null, mode = 'whole-dollar', sideMatches = null } = {}) {
    const sb = loadHtmlInlineScript(PAGE, DEPS);
    const cd = PAR.map((p,i) => ({ hole:i+1, par:p, hcpIndex:IDX[i] }));
    const ps = FIELD.map(([name,hcp], i) => ({ id:101+i, name, hcp:String(hcp), playingForMoney:true }));
    const sc = {};
    FIELD.forEach((f,i) => f[2].forEach((v,hi) => { sc['p'+(101+i)+'_h'+(hi+1)] = v; }));
    const data = { players: ps, courseData: cd, scores: sc, gameFormat: 'stroke', kpWinners,
        // Payout DISPLAY tests, not KP tests: the KP result is decided so the section
        // renders a settled round. An unresolved KP would legitimately withhold money
        // and these assertions would be testing the wrong thing.
        kpConfirmed: { confirmed: true },
        kpNoWinner: kpNoWinner || { h3:true, h7:true, h12:true, h16:true },
        moneyPool: { enabled:true, buyIn:40,
            kp:{amount:100,holes:[3,7,12,16]},
            net:{amount:70,places:[57.142857,42.857143]},
            skins:{mode:'remainder',scoring:'net',carryOver:false} } };
    if (mode) data.settlementMode = mode;
    if (sideMatches) data.sideMatches = sideMatches;
    vm.runInContext(`currentMode='ABCD'; currentData=${JSON.stringify(data)};
        renderCombinedSummary(currentData, currentData.courseData, currentData.scores);`, sb);
    return {
        sb, data,
        html: () => sb.document.getElementById('combined-settlement-summary').innerHTML,
        run: c => vm.runInContext(c, sb),
    };
}

// Parses the rendered payout blocks back out of the DOM.
function parse(html) {
    const at = html.indexOf('Player Payouts');
    const seg = html.slice(at, html.indexOf('\uD83E\uDD1D', at));   // stop at Who Pays Who
    const out = {};
    seg.split('<div class="pl-block">').slice(1).forEach(b => {
        const name = (b.match(/pl-name">([^<]*)</) || [])[1];
        if (!name) return;
        out[name] = [...b.matchAll(/<div class="(pl-row[^"]*)"><span>([^<]*)<\/span>(.*?)<\/div>/g)].map(m => {
            const amt = m[3].match(/([+-])?\$([\d,]+(?:\.\d+)?)/);
            return {
                label: m[2],
                final: /pl-final/.test(m[1]),
                amount: amt ? (amt[1] === '-' ? -1 : 1) * Number(amt[2].replace(/,/g,'')) : 0,
            };
        });
    });
    return out;
}

// ============================================================================

describe('THE BUY-IN IS GONE FROM THE GOLFER-FACING VIEW', () => {

    test('"Main Pool buy-in" no longer appears', () => {
        assert.ok(!/Main Pool buy-in/.test(boot().html()),
            'nobody needs reminding they paid the same $40 everyone else did');
    });

    test('"FINAL NET" is gone from this section', () => {
        const html = boot().html();
        const seg = html.slice(html.indexOf('Player Payouts'), html.indexOf('\uD83E\uDD1D'));
        assert.ok(!/FINAL NET/.test(seg));
    });

    test('"TOTAL PAYOUT" closes every golfer', () => {
        const led = parse(boot().html());
        assert.equal(Object.keys(led).length, 12);
        Object.entries(led).forEach(([n, rows]) => {
            const f = rows.filter(r => r.final);
            assert.equal(f.length, 1, `${n} should have exactly one total`);
            assert.equal(f[0].label, 'TOTAL PAYOUT');
        });
    });

    test('the aggregate Main Pool line is not shown alongside its own detail', () => {
        const led = parse(boot().html());
        Object.entries(led).forEach(([n, rows]) => {
            assert.ok(!rows.some(r => r.label === 'Main Pool'),
                `${n}: showing the aggregate and its notes would count the same money twice`);
        });
    });
});

describe('TOTALS EQUAL WHAT IS PRINTED', () => {

    test('every TOTAL PAYOUT is the sum of the lines above it', () => {
        const led = parse(boot().html());
        Object.entries(led).forEach(([n, rows]) => {
            const sum = rows.filter(r => !r.final).reduce((a,r) => a + r.amount, 0);
            const total = rows.find(r => r.final).amount;
            assert.equal(sum, total, `${n}: lines sum to ${sum} but the total reads ${total}`);
        });
    });

    test('every displayed component is money coming TO the golfer', () => {
        const led = parse(boot().html());
        Object.entries(led).forEach(([n, rows]) => {
            rows.filter(r => !r.final).forEach(r => {
                if (r.label === 'No payout') return;
                assert.ok(r.amount > 0, `${n}: "${r.label}" is not a payout`);
            });
        });
    });

    test('TODAY\'S ROUND: the acceptance figures', () => {
        const led = parse(boot().html());
        const total = n => led[n].find(r => r.final).amount;
        assert.equal(total('Carp'), 128);     // 30 + 89 + 9
        assert.equal(total('Marcus'), 92);    // 40 + 44 + 8
        assert.equal(total('Scott'), 54);     // 45 + 9
        assert.equal(total('Manny'), 52);     // 44 + 8
        assert.equal(total('Lance'), 52);
        assert.equal(total('Rocco'), 52);
    });
});

describe('THE DETAIL WORTH KEEPING IS KEPT', () => {

    test('Net Finish appears with its place', () => {
        const led = parse(boot().html());
        assert.ok(led.Marcus.some(r => /^Net Finish/.test(r.label) && r.amount === 40));
        assert.ok(led.Carp.some(r => /^Net Finish/.test(r.label) && r.amount === 30));
    });

    test('skins appear with their count', () => {
        const led = parse(boot().html());
        assert.ok(led.Carp.some(r => /Skins \u00B7 2 skins/.test(r.label) && r.amount === 89));
        assert.ok(led.Manny.some(r => /Skins \u00B7 1 skin\b/.test(r.label) && r.amount === 44));
    });

    test('refunds appear', () => {
        const led = parse(boot().html());
        assert.ok(led.Marty.some(r => /refund/i.test(r.label) && r.amount > 0));
    });

    test('a KP winner sees their KP hole', () => {
        const led = parse(boot({ kpWinners: { h3:'101', h7:'105', h12:'109', h16:'102' }, kpConfirmed: { confirmed: true } }).html());
        assert.ok(led.Marty.some(r => /^KP H3/.test(r.label) && r.amount === 25),
            'KP is app-managed pool money and belongs in the payout view');
    });

    test('a side-match win is shown; a side-match loss is not', () => {
        const b = boot({ sideMatches: { sm: { format:'match', scoring:'net', stake:50,
            startHole:1, createdAt:1, teamAIds:['103'], teamBIds:['101'] } } });
        const led = parse(b.html());
        const winner = Object.entries(led).find(([, rows]) => rows.some(r => /^Side Match/.test(r.label)));
        assert.ok(winner, 'the golfer who won it must see it');
        assert.ok(winner[1].find(r => /^Side Match/.test(r.label)).amount > 0);
        Object.entries(led).forEach(([n, rows]) => rows.filter(r => !r.final)
            .forEach(r => assert.ok(r.amount > 0 || r.label === 'No payout',
                `${n}: a loss is not a payout and belongs in Who Pays Who`)));
    });
});

describe('A GOLFER WHO WON NOTHING', () => {

    function noWinners() {
        // Every KP claimed, so nothing refunds; only prize winners receive anything.
        return boot({ kpWinners: { h3:'103', h7:'103', h12:'103', h16:'103' }, kpConfirmed: { confirmed: true } });
    }

    test('shows no payout and no loss figure', () => {
        const led = parse(noWinners().html());
        const empty = Object.entries(led).filter(([, rows]) =>
            rows.find(r => r.final).amount === 0);
        assert.ok(empty.length > 0, 'this fixture must produce at least one golfer with nothing');
        empty.forEach(([n, rows]) => {
            assert.ok(rows.some(r => r.label === 'No payout'), `${n} should read "No payout"`);
            rows.forEach(r => assert.ok(r.amount >= 0, `${n}: no negative figure may appear here`));
        });
    });

    test('no -$40 anywhere in the section', () => {
        const html = noWinners().html();
        const seg = html.slice(html.indexOf('Player Payouts'), html.indexOf('\uD83E\uDD1D'));
        assert.ok(!/-\$40/.test(seg), 'the buy-in must not reappear as a loss');
    });
});

describe('NOTHING BEHIND THE VIEW CHANGED', () => {

    test('the contribution model still carries the buy-in', () => {
        const b = boot();
        const c = b.run(`computeCombinedNetTotals(currentData, currentData.courseData, currentData.scores)`);
        Object.values(plain(c.contributions)).forEach(x => {
            assert.ok(x.lines.some(l => /buy-in/i.test(l.label)),
                `${x.name}: the engine must still record the buy-in`);
        });
    });

    test('net balances are untouched by the display change', () => {
        const b = boot();
        const c = b.run(`computeCombinedNetTotals(currentData, currentData.courseData, currentData.scores)`);
        // Carp's NET is still 88 (128 won less the 40 paid in) even though the
        // section now shows 128. Two questions, two answers, one ledger.
        assert.equal(plain(c.netByName).carp.net, 88);
        assert.equal(Object.values(plain(c.netByName)).reduce((a,v) => a + v.net, 0), 0);
    });

    test('Who Pays Who still reconstructs every balance exactly', () => {
        const b = boot();
        const c = b.run(`computeCombinedNetTotals(currentData, currentData.courseData, currentData.scores)`);
        const moved = {};
        plain(c.transactions).forEach(t => {
            moved[t.from] = (moved[t.from] || 0) - t.amount;
            moved[t.to] = (moved[t.to] || 0) + t.amount;
            assert.equal(t.amount, Math.round(t.amount), 'a transaction carried cents');
        });
        Object.values(plain(c.netByName)).forEach(v => {
            assert.equal(v.net, moved[v.name] || 0, `${v.name}: transactions must still reconcile`);
        });
        // The ENGINE still reconciles, which is what this test protects. The SECTION
        // is no longer rendered for this fixture: it is a Money-Pool-only round, where
        // nobody owes another golfer anything - everyone paid the pot and the pot paid
        // the winners. Asserting the section's presence here was asserting the bug.
        assert.ok(!/Who Pays Who/.test(b.html()),
            'a pool-only round must not invent player-to-player debts');
    });

    test('the pool still reconciles and stays whole-dollar', () => {
        const b = boot();
        const p = b.run(`computeMoneyPool(currentData, currentData.courseData, currentData.scores)`);
        assert.equal(p.totalPoolCents, 48000);
        assert.equal(p.kp.amountCents + p.net.amountCents + p.skins.amountCents, 48000);
        assert.equal(Object.values(plain(p.perPlayerCents)).reduce((a,b2) => a + b2, 0), 0);
    });

    test('a legacy round still renders and still totals correctly', () => {
        const led = parse(boot({ mode: null }).html());
        assert.equal(Object.keys(led).length, 12);
        Object.entries(led).forEach(([n, rows]) => {
            const sum = rows.filter(r => !r.final).reduce((a,r) => a + r.amount, 0);
            assert.ok(Math.abs(sum - rows.find(r => r.final).amount) < 0.005, `${n} does not add up`);
        });
    });
});

describe('NO PAYOUT ARITHMETIC IN THE PRESENTER', () => {

    const fn = () => {
        const src = read(PAGE);
        const at = src.indexOf('function buildPlayerLedgerHtml');
        return src.slice(at, src.indexOf('\n    function ', at + 10));
    };

    test('it consumes canonical contributions', () => {
        assert.match(fn(), /contributions\[k\]/);
        assert.match(read(PAGE), /const \{ netByName, transactions, contributions \} = computeCombinedNetTotals/);
    });

    test('it runs no engines and allocates nothing', () => {
        const f = fn();
        ['computeMoneyPool(','computeCombinedNetTotals(','allocateWholeDollars(','splitCentsEvenly(',
         'simplifyDebts(','getStrokes(','parseHcp('].forEach(t =>
            assert.ok(!f.includes(t), `the presenter must not compute money; found ${t}`));
    });

    test('the only arithmetic is summing the lines it prints', () => {
        const f = fn();
        assert.match(f, /total \+= l\.amount;/, 'the total must be the sum of what is displayed');
        assert.ok(!/Math\.round\(/.test(f), 'the engine already allocated; rounding again could disagree');
        assert.ok(!/toFixed\(/.test(f), 'formatting must stay in the shared fmtWhole rule');
    });

    test('the exclusions are explicit and narrow', () => {
        const f = fn();
        assert.match(f, /buy-in/i, 'the buy-in exclusion must be deliberate and findable');
        // PINNED TO THE CONSTANT, NOT THE WORD. The label is produced by
        // settlement-engine and consumed here and in hasPlayerToPlayerSettlement.
        // A literal string in any one of those three is exactly the drift that makes
        // the Receipt invent golfer-to-golfer debts, so matching a literal here would
        // pass on the broken arrangement.
        assert.match(f, /label === MAIN_POOL_LEDGER_LABEL/, 'and so must the aggregate exclusion');
    });
});
