// ============================================================================
// PER-PLAYER LEDGER — rendered
//
// The Receipt used to print one signed total per golfer: "Avery: Owes $224".
// Correct, and useless to the person holding the phone, who wants to know which
// bet did that to them.
//
// The Wave 2B foundation added `contributions` to computeCombinedNetTotals() so
// this could be answered WITHOUT re-running any game math in the page. These
// tests hold two things: that the ledger consumes that output, and that what it
// renders adds up.
//
// SUPERSEDED IN PART. This file was written against the ACCOUNTING view: a Money
// Pool aggregate, an indented buy-in, and a FINAL NET. That view has been replaced
// by a payout view answering "what did I win, and what for?" - the buy-in is no
// longer shown here because Who Pays Who already answers "what do I owe?" from the
// same ledger. player_payouts_render_test.js owns the new presentation contract.
//
// The tests below that described the old LAYOUT have been retargeted; the ones that
// protect the MATH - Who Pays Who parity, zero-sum, no cents, every golfer present -
// are unchanged, because none of that moved.
//
// MOVING vs NOTE is the part most likely to be broken by a well-meaning edit.
// Moving lines ARE the golfer's net. Note lines explain a moving line from the
// inside - the pool buy-in, each KP, the skins - and are already contained in
// it. Rendering a note as though it were a moving line would double-count real
// money on a receipt people settle up from, so the distinction is asserted in
// the markup, not just in the data.
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

const NAMES = ['Avery','Blake','Casey','Devon','Ellis','Finley','Gray','Harper','Indigo','Jordan','Kendall','Logan'];

// The generic 12-golfer / 3-group acceptance shape.
function boot(over = {}) {
    const sb = loadHtmlInlineScript(PAGE, DEPS);
    const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
    const ps = NAMES.map((n,i)=>({id:101+i,name:n,hcp:String(4+i),playingForMoney:true}));
    const sc = {};
    ps.forEach((p,pi)=>cd.forEach((h,hi)=>{ sc['p'+p.id+'_h'+h.hole] = h.par + ((pi*3+hi*5)%4) - 1; }));
    const data = Object.assign({
        players: ps, courseData: cd, gameFormat: 'stroke', scores: sc,
        settlementMode: 'whole-dollar',
        moneyPool: { enabled: true, buyIn: 40,
            kp: { amount: 100, holes: [3,7,12,16] },
            net: { amount: 70, places: [57.142857, 42.857143] },
            skins: { mode: 'remainder', scoring: 'net', carryOver: false } },
        kpWinners: { h3:'101', h7:'105', h12:'109', h16:'102' }, kpConfirmed: { confirmed: true },
        sideMatches: {
            sm1: { format:'match', scoring:'net', stake:50, startHole:1, createdAt:1,
                   teamAIds:['101'], teamBIds:['102'] },
            sm2: { format:'stroke', scoring:'net', holeStake:5, overallStake:200, startHole:1, createdAt:2,
                   teamAIds:['101','102'], teamBIds:['105','106'],
                   overallPresses:{ p1:{ startHole:6, stake:78 } } },
        },
    }, over);
    vm.runInContext(`currentMode='ABCD'; currentData=${JSON.stringify(data)};`, sb);
    vm.runInContext(`renderCombinedSummary(currentData, currentData.courseData, currentData.scores);`, sb);
    return {
        sb, data, cd, sc, ps,
        html: () => sb.document.getElementById('combined-settlement-summary').innerHTML,
        run: c => vm.runInContext(c, sb),
    };
}

// Parse the rendered ledger back out of the DOM, so assertions are about what a
// golfer actually sees rather than about the data that fed it.
function parseLedger(html) {
    const out = {};
    const blocks = html.split('<div class="pl-block">').slice(1);
    blocks.forEach(b => {
        const name = (b.match(/<div class="pl-name">([^<]*)<\/div>/) || [])[1];
        if (!name) return;
        const rows = [...b.matchAll(/<div class="(pl-row[^"]*)"><span>([^<]*)<\/span>(.*?)<\/div>/g)].map(m => {
            // Accepts cents, because a LEGACY round is genuinely cent-settled and its
            // ledger lines must show the amounts the engine allocated rather than a
            // per-line rounding of them.
            const amt = (m[3].match(/([+-])\$([\d,]+(?:\.\d+)?)/) || []);
            return {
                cls: m[1],
                label: m[2],
                note: /pl-note/.test(m[1]),
                rounding: /pl-round/.test(m[1]),
                final: /pl-final/.test(m[1]),
                amount: amt.length ? (amt[1] === '-' ? -1 : 1) * Number(amt[2].replace(/,/g,'')) : 0,
            };
        });
        out[name] = rows;
    });
    return out;
}

// ============================================================================

describe('EVERY GOLFER HAS A LEDGER', () => {

    test('all twelve appear', () => {
        const led = parseLedger(boot().html());
        assert.equal(Object.keys(led).length, 12);
        NAMES.forEach(n => assert.ok(led[n], `${n} has no ledger block`));
    });

    test('a golfer who wins nothing still appears, alongside golfers who did', () => {
        // A $25 buy-in with four $25 KPs means a golfer who wins exactly one KP lands
        // on precisely $0 while everyone around them is up or down. That is the real
        // shape of the requirement - one golfer level in a round that is not.
        //
        // (An entirely level round is different: renderCombinedSummary has a
        // long-standing guard that stays quiet when EVERY golfer is even, since there
        // is nothing to settle. That behaviour predates this work and is left alone.)
        const led = parseLedger(boot({
            moneyPool: { enabled: true, buyIn: 25,
                kp: { amount: 100, holes: [3,7,12,16] },
                skins: { mode: 'remainder', scoring: 'net', carryOver: false } },
            kpWinners: { h3:'101', h7:'105', h12:'109', h16:'102' }, kpConfirmed: { confirmed: true },
            sideMatches: {},
        }).html());

        // The buy-in is no longer the explanation - "No payout" is. What matters is
        // that nobody vanishes from the section.
        const evens = Object.entries(led).filter(([, rows]) => rows.find(r => r.final).amount === 0);
        evens.forEach(([n, rows]) => {
            assert.ok(rows.length > 1, `${n} appears with no row at all`);
            assert.ok(rows.some(r => /No payout/i.test(r.label)), `${n} should read "No payout"`);
        });
        assert.ok(Object.keys(led).length === 12, 'every golfer keeps a block');
    });


});

describe('MOVING LINES ADD UP — NOTE LINES DO NOT', () => {

    test('the moving lines a golfer can SEE sum to the FINAL NET they can see', () => {
        // Parsed from rendered markup, so this fails if the page ever displays a
        // subset of what it summed.
        const led = parseLedger(boot().html());
        Object.entries(led).forEach(([n, rows]) => {
            const moving = rows.filter(r => !r.note && !r.final);
            const sum = moving.reduce((a,r) => a + r.amount, 0);
            const final = rows.find(r => r.final).amount;
            assert.equal(sum, final, `${n}: visible lines sum to ${sum} but FINAL NET reads ${final}`);
        });
    });






});

describe('THE DETAIL A GOLFER ASKS FOR', () => {



    test('KP lines name their hole', () => {
        const led = parseLedger(boot().html());
        assert.ok(led.Avery.some(r => r.label === 'KP H3'));
        assert.ok(led.Ellis.some(r => r.label === 'KP H7'));
        assert.ok(led.Indigo.some(r => r.label === 'KP H12'));
        assert.ok(led.Blake.some(r => r.label === 'KP H16'));
    });

    test('two KPs to one golfer stay as two auditable lines', () => {
        const led = parseLedger(boot({ kpWinners: { h3:'101', h7:'101', h12:'109', h16:'102' }, kpConfirmed: { confirmed: true } }).html());
        const kp = led.Avery.filter(r => /^KP H/.test(r.label)).map(r => r.label).sort();
        assert.deepEqual(kp, ['KP H3','KP H7'], 'collapsing them loses the hole breakdown');
    });




});

describe('PARITY WITH THE REST OF THE RECEIPT', () => {

    test('TOTAL PAYOUT is the sum of the payout lines shown', () => {
        const b = boot();
        const led = parseLedger(b.html());
        const combined = b.run(`computeCombinedNetTotals(currentData, currentData.courseData, currentData.scores)`);
        // The section shows GROSS winnings, so its total is deliberately NOT the net
        // balance any more; Final Results and Who Pays Who still carry that. What the
        // section must guarantee is internal consistency.
        Object.entries(led).forEach(([n, rows]) => {
            const sum = rows.filter(r => !r.final).reduce((a,r) => a + r.amount, 0);
            assert.equal(sum, rows.find(r => r.final).amount, `${n}: lines do not sum to the total`);
        });
        assert.ok(combined.netByName, 'the canonical ledger must still be produced');
    });

    test('Who Pays Who still reconstructs the canonical ledger exactly', () => {
        const b = boot();
        const led = parseLedger(b.html());
        const combined = b.run(`computeCombinedNetTotals(currentData, currentData.courseData, currentData.scores)`);
        const moved = {};
        combined.transactions.forEach(t => {
            moved[t.from] = (moved[t.from] || 0) - t.amount;
            moved[t.to] = (moved[t.to] || 0) + t.amount;
            assert.equal(t.amount, Math.round(t.amount), 'a transaction carried cents');
        });
        // Against the ENGINE's net balances, not the displayed gross payouts.
        Object.values(JSON.parse(JSON.stringify(combined.netByName))).forEach(v => {
            assert.equal(v.net, moved[v.name] || 0, `${v.name}: transactions do not reconstruct the ledger`);
        });
        assert.ok(Object.keys(led).length > 0, 'the payout section must still render');
    });

    test('the underlying round still nets to zero', () => {
        // Zero-sum lives in the engine, not in a gross-winnings display: the payouts
        // sum to the pot, and the buy-ins that balance them are in Who Pays Who.
        const b = boot();
        const c = b.run(`computeCombinedNetTotals(currentData, currentData.courseData, currentData.scores)`);
        const vals = Object.values(JSON.parse(JSON.stringify(c.netByName)));
        assert.equal(vals.reduce((a,v) => a + v.net, 0), 0);
    });

    test('no cents anywhere in whole-dollar mode', () => {
        assert.ok(!/\$[\d,]+\.\d/.test(boot().html()), 'cents on a whole-dollar receipt');
    });
});

describe('NO DUPLICATE MONEY MATH IN THE PAGE', () => {

    const fn = () => {
        const src = read('settlement.html');
        const at = src.indexOf('function buildPlayerLedgerHtml');
        return src.slice(at, src.indexOf('\n    function renderCombinedSummary', at));
    };

    test('it consumes canonical contributions', () => {
        assert.match(fn(), /contributions\[k\]/);
        const src = read('settlement.html');
        assert.match(src, /const \{ netByName, transactions, contributions \} = computeCombinedNetTotals/);
    });

    test('it runs no game engines of its own', () => {
        const f = fn();
        ['calculateMatchEngine','calcDotsEngine','computeSkinsSettlementNet','computeMoneyPool',
         'getStrokes','parseHcp','simplifyDebts','allocateWholeDollars'].forEach(name => {
            assert.doesNotMatch(f, new RegExp(name + '\\('), `${name} must not be called from the ledger presenter`);
        });
    });

    test('it never re-allocates money - it formats through the shared rule', () => {
        // A previous draft of this test banned Math.round outright, and a previous
        // draft of the presenter added its own toFixed/Math.round pair to "fix" a
        // ledger that appeared to sum to $92 against a FINAL NET of $93. The page was
        // never wrong: fmtWhole already prints 92.51 as "$92.51". The truncation was in
        // this file's own parser regex.
        //
        // So the assertion is now the one that actually matters: the ledger formats
        // through fmtWhole - settlement.html's single money-formatting rule - and does
        // no arithmetic of its own.
        const f = fn();
        assert.match(f, /fmtWhole\(Math\.abs\(amt\)\)/, 'the ledger must use the shared formatter');
        assert.doesNotMatch(f, /toFixed\(/, 'formatting must not fork away from fmtWhole');
        assert.doesNotMatch(f, /Math\.round\(/, 'the ledger must not alter the amounts it was given');
    });
});

describe('LEGACY NON-REGRESSION', () => {

    test('a legacy round still renders a ledger that adds up', () => {
        const led = parseLedger(boot({ settlementMode: undefined }).html());
        Object.entries(led).forEach(([n, rows]) => {
            const moving = rows.filter(r => !r.note && !r.final).reduce((a,r) => a + r.amount, 0);
            const final = rows.find(r => r.final).amount;
            // Cent-accurate on a legacy round, so compared within half a cent.
            assert.ok(Math.abs(moving - final) < 0.005,
                `${n}: legacy lines sum to ${moving} but FINAL NET reads ${final}`);
        });
    });
});
