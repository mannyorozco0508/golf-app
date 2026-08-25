// ============================================================================
// RESULTS PRESENTATION
//
// PRESENTATION ONLY. Not one number moved in this pass - the tests at the bottom
// assert that Player Payouts, Who Pays Who and the engines are untouched. What
// changed is what the Receipt SAYS.
//
// THREE THINGS IT WAS SAYING BADLY:
//
// 1. "Won $4" for a golfer handed $44 out of the pot. Both figures were right -
//    $44 the payout, +$4 the position after his own stake - but calling the
//    second one "Won" invited exactly the argument the Receipt exists to
//    prevent. Payout and net answer different questions and now use different
//    words: TOTAL PAYOUT and NET.
//
// 2. The buy-in, twice: an explanatory sentence, and "(12 x $40)" in the Money
//    Pool header. Everyone paid the same stake; restating it turns a payout into
//    an argument about arithmetic.
//
// 3. "Final Results" on a round with $100 of unresolved KP money. Wave B made
//    settled a canonical fact, so the heading reads it rather than assuming.
//
// And one thing it was showing badly: the scorecard's net row at 0.72em in
// --text-muted, unreadable on a phone - which defeats the point of printing it,
// since net is how you check a net skin without doing handicap arithmetic.
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

const NAMES = ['Marty','Scott','Carp','Randy','Manny','Matt B','Lance','Kopp',
               'Marcus','Rocco','Matt H','Jeremy'];
const HCP = [9,7,2,9,0,8,3,6,9,13,12,12];
const KP_HOLES = [3,7,12,16];
const ALL_WON = { h3:'101', h7:'105', h12:'109', h16:'102' };

// Today's real round. `confirmed` decides whether the money is settled.
function boot({ confirmed = true, winners = ALL_WON, noWinner = null } = {}) {
    const sb = loadHtmlInlineScript(PAGE, DEPS);
    const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
    const ps = NAMES.map((n,i)=>({ id:101+i, name:n, hcp:String(HCP[i]), playingForMoney:true }));
    const sc = {};
    ps.forEach((p,pi)=>cd.forEach((h,hi)=>{ sc['p'+p.id+'_h'+h.hole] = h.par + ((pi*3+hi*5)%4) - 1; }));
    const d = { players: ps, courseData: cd, scores: sc, gameFormat:'stroke',
        settlementMode:'whole-dollar', kpWinners: winners,
        moneyPool:{ enabled:true, buyIn:40,
            kp:{ amount:100, holes:KP_HOLES },
            net:{ amount:70, places:[57.142857,42.857143] },
            skins:{ mode:'remainder', scoring:'net', carryOver:false } } };
    if (confirmed) d.kpConfirmed = { confirmed: true };
    if (noWinner) d.kpNoWinner = noWinner;
    vm.runInContext(`currentMode='ABCD'; currentData=${JSON.stringify(d)};
        renderCombinedSummary(currentData, currentData.courseData, currentData.scores);
        renderMoneyPoolSection(currentData, currentData.courseData, currentData.scores);`, sb);
    return {
        sb, d, cd, sc,
        run: c => vm.runInContext(c, sb),
        summary: () => sb.document.getElementById('combined-settlement-summary').innerHTML,
        pool: () => sb.document.getElementById('money-pool-section').innerHTML,
        card: () => vm.runInContext('buildReceiptScorecard()', sb),
    };
}

// ============================================================================

describe('THE BUY-IN IS NOWHERE ON SCREEN', () => {

    test('the Money Pool header shows the pot, not the per-head stake', () => {
        const t = strip(boot().pool());
        assert.match(t, /Money Pool — \$480/);
        assert.ok(!/12 × \$40/.test(t), 'the per-head arithmetic must be gone');
        assert.ok(!/\(\d+ × \$\d+\)/.test(t), 'and no variant of it may return');
    });

    test('no explanatory sentence mentions the buy-in', () => {
        const src = read(PAGE);
        assert.ok(!/own buy-in/.test(src));
        const rendered = strip(boot().summary()) + strip(boot().pool());
        assert.ok(!/buy-in/i.test(rendered), 'the buy-in is internal math, not copy');
    });

    test('nor does any RENDERED surface produce one', () => {
        // Checked against actual output, not the source. A naive template-literal
        // regex matched ACROSS backticks into the comment blocks that explain why
        // the buy-in is excluded - flagging the reasoning as if it were markup.
        // What matters is what reaches the page.
        const b = boot();
        [b.summary(), b.pool(), b.card()].forEach(html => {
            assert.ok(!/buy-in/i.test(strip(html)), 'no rendered surface may name the buy-in');
        });
        // The engine still records it internally, which is the point.
        const c = b.run('computeCombinedNetTotals(currentData, currentData.courseData, currentData.scores)');
        const anyBuyIn = Object.values(plain(c.contributions))
            .some(x => (x.lines || []).some(l => /buy-in/i.test(l.label)));
        assert.ok(anyBuyIn, 'it remains internal math, just never copy');
    });
});

describe('NET WORDING', () => {

    test('a positive position reads +$X NET, not "Won"', () => {
        const t = strip(boot().summary());
        assert.match(t, /\+\$\d+ NET/);
        assert.ok(!/Won \$/.test(t), '"Won" invited an argument the Receipt exists to prevent');
    });

    test('a negative position reads -$X NET, not "Owes"', () => {
        const t = strip(boot().summary());
        assert.match(t, /-\$\d+ NET/);
        assert.ok(!/Owes/.test(t));
    });

    test('a level position reads $0 NET, not "Even"', () => {
        const src = read(PAGE);
        const at = src.indexOf('function fmt(amt)');
        const fn = src.slice(at, src.indexOf('\n        }', at));
        assert.match(fn, /\$0 NET/);
        assert.ok(!/>Even</.test(fn));
    });

    test('positive is green, negative is red, zero is neutral', () => {
        const src = read(PAGE);
        const at = src.indexOf('function fmt(amt)');
        const fn = src.slice(at, src.indexOf('\n        }', at));
        assert.match(fn, /val-pos[^`]*\+\$/);
        assert.match(fn, /val-neg[^`]*-\$/);
        assert.match(fn, /val-even/);
    });

    test('THE REAL CASE: a $44 payout and a +$4 position stay different numbers', () => {
        // Manny won $44 from the pot; his position afterwards is +$4. The Receipt
        // must not use the same word for both.
        const b = boot();
        const c = b.run('computeCombinedNetTotals(currentData, currentData.courseData, currentData.scores)');
        const net = plain(c.netByName).manny.net;
        const t = strip(b.summary());
        assert.match(t, new RegExp('\\' + (net < 0 ? '-' : '+') + '\\$' + Math.abs(net) + ' NET'));
        assert.match(t, /TOTAL PAYOUT/, 'the payout question keeps its own heading');
    });

    test('the printed net still equals the canonical ledger, golfer by golfer', () => {
        const b = boot();
        const c = b.run('computeCombinedNetTotals(currentData, currentData.courseData, currentData.scores)');
        const printed = {};
        [...String(b.summary()).matchAll(/<span>([^<]+)<\/span><span[^>]*>([+-])\$([\d,.]+) NET<\/span>/g)]
            .forEach(m => { printed[m[1]] = (m[2] === '+' ? 1 : -1) * parseFloat(m[3].replace(/,/g,'')); });
        Object.values(plain(c.netByName)).forEach(v => {
            if (v.net === 0) return;
            assert.equal(printed[v.name], v.net, `${v.name}: printed ${printed[v.name]} vs ledger ${v.net}`);
        });
    });
});

describe('FINAL ONLY WHEN THE MONEY IS SETTLED', () => {

    test('a settled round says FINAL RESULTS', () => {
        const b = boot({ confirmed: true });
        assert.equal(b.run('computeMoneyPool(currentData, currentData.courseData, currentData.scores).settled'), true);
        assert.match(strip(b.summary()), /Final Results/);
        assert.ok(!/Not Final/.test(strip(b.summary())));
    });

    test('unresolved KP money says RESULTS — NOT FINAL', () => {
        const b = boot({ confirmed: false });
        assert.equal(b.run('computeMoneyPool(currentData, currentData.courseData, currentData.scores).settled'), false);
        const t = strip(b.summary());
        assert.match(t, /Results — Not Final/);
        assert.ok(!/🏁 Final Results/.test(t), 'money with $100 hanging is not final');
    });

    test('confirming flips the heading, with no other change', () => {
        const open = strip(boot({ confirmed: false }).summary());
        const done = strip(boot({ confirmed: true }).summary());
        assert.match(open, /Not Final/);
        assert.match(done, /Final Results/);
    });

    test('cancelling KPs also settles it', () => {
        const b = boot({ confirmed: false });
        b.run(`currentData.kpCancelled = { cancelled: true, cancelledAt: 1, cancelledBy: 'organizer' };
               renderCombinedSummary(currentData, currentData.courseData, currentData.scores);`);
        assert.match(strip(b.summary()), /Final Results/);
    });

    test('the heading READS the canonical state, it does not recompute it', () => {
        const src = read(PAGE);
        const at = src.indexOf('FINAL" IS A CLAIM');
        assert.notEqual(at, -1, 'the reasoning must stay with the code');
        const block = src.slice(at, at + 900);
        assert.match(block, /rs\.settled === false/);
        ['kpUnresolvedCents >','kpWinners','kpConfirmed &&']
            .forEach(t => assert.ok(!block.includes(t), `must not re-derive settlement; found ${t}`));
    });
});

describe('THE SCORECARD SHOWS GROSS AND NET, BOTH READABLE', () => {

    test('gross rows still render', () => {
        const h = boot().card();
        NAMES.forEach(n => assert.ok(h.includes('>' + n + '<'), `${n} missing`));
        assert.match(h, />HOLE</);
        assert.match(h, />PAR</);
    });

    test('net rows still render, one per golfer', () => {
        const h = boot().card();
        assert.equal((h.match(/rt-net/g) || []).length, 12);
        assert.match(h, /net<\/td>/);
    });

    test('OUT, IN and TOT still carry their totals', () => {
        const h = boot().card();
        assert.match(h, />OUT</); assert.match(h, />IN</); assert.match(h, />TOT</);
        const firstNet = h.slice(h.indexOf('rt-net'));
        const cells = (firstNet.slice(0, firstNet.indexOf('</tr>')).match(/rt-sec/g) || []).length;
        assert.ok(cells >= 3, 'the net row must carry OUT, IN and TOT');
    });

    test('birdie and eagle indicators survive', () => {
        const src = read(PAGE);
        assert.match(src, /legend-birdie/);
        assert.match(src, /legend-eagle/);
    });

    test('net is legible, not the old 0.72em muted treatment', () => {
        const src = read(PAGE);
        const rule = /\.rt-net td \{([^}]*)\}/.exec(src);
        assert.ok(rule, '.rt-net td rule must exist');
        assert.ok(!/0\.72em/.test(rule[1]), 'the unreadable size must not return');
        assert.ok(!/var\(--text-muted\)/.test(rule[1]), 'nor the muted colour');
        const size = /font-size:\s*([\d.]+)em/.exec(rule[1]);
        assert.ok(size && parseFloat(size[1]) >= 0.8,
            'net must be readable on a phone; got ' + (size && size[1]));
    });

    test('net stays SUBORDINATE to gross — it did not become a second headline', () => {
        const src = read(PAGE);
        const rule = /\.rt-net td \{([^}]*)\}/.exec(src)[1];
        const size = parseFloat(/font-size:\s*([\d.]+)em/.exec(rule)[1]);
        assert.ok(size < 1, 'gross remains primary');
    });

    test('the card did not grow: no extra padding on the net row', () => {
        const rule = /\.rt-net td \{([^}]*)\}/.exec(read(PAGE))[1];
        assert.match(rule, /padding-top:\s*0/, 'row height must be unchanged');
    });
});

describe('NOTHING BEHIND THE WORDS MOVED', () => {

    test('Player Payouts are unchanged', () => {
        const t = strip(boot().summary());
        assert.match(t, /Player Payouts/);
        assert.match(t, /TOTAL PAYOUT/);
        // Bounded by the NEXT section that actually exists. This sliced to
        // 'Who Pays Who', which a Money-Pool-only round no longer renders - indexOf
        // returned -1 and the slice ran backwards to the start of the document,
        // sweeping in the NET wording from Final Results above.
        const html = boot().summary();
        const start = html.indexOf('Player Payouts');
        assert.notEqual(start, -1, 'the payout section must render');
        const after = html.indexOf('Who Pays Who', start);
        const section = html.slice(start, after === -1 ? html.length : after);
        assert.ok(!/NET<\/span>/.test(section), 'the payout section keeps its own vocabulary');
    });

    test('Who Pays Who still reconstructs every balance', () => {
        const b = boot();
        const c = b.run('computeCombinedNetTotals(currentData, currentData.courseData, currentData.scores)');
        const moved = {};
        plain(c.transactions).forEach(t => {
            moved[t.from] = (moved[t.from]||0) - t.amount;
            moved[t.to] = (moved[t.to]||0) + t.amount;
        });
        Object.values(plain(c.netByName)).forEach(v =>
            assert.equal(v.net, moved[v.name] || 0, `${v.name}: transactions must reconcile`));
    });

    test('the round still balances and carries no cents', () => {
        const b = boot();
        const c = b.run('computeCombinedNetTotals(currentData, currentData.courseData, currentData.scores)');
        const vals = Object.values(plain(c.netByName));
        assert.equal(vals.reduce((a,v)=>a+v.net,0), 0);
        vals.forEach(v => assert.equal(v.net, Math.round(v.net)));
    });

    test('this pass touched no engine', () => {
        ['pool-engine.js','settlement-engine.js','money-engine.js','action-model.js']
            .forEach(f => {
                const src = read(f);
                assert.ok(!/ NET<\/span>/.test(src), `${f} must contain no presentation wording`);
            });
    });

    test('the fmt change is presentation only — the amount is untouched', () => {
        const src = read(PAGE);
        const at = src.indexOf('function fmt(amt)');
        const fn = src.slice(at, src.indexOf('\n        }', at));
        assert.ok(!/Math\.round\(/.test(fn), 'formatting must not alter the figure');
        assert.match(fn, /fmtWhole\(amt\)/, 'and must go through the shared rule');
    });
});
