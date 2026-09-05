// ============================================================================
// PLAYER PAYOUTS INTEGRITY
//
// Reproduces the Chambers Bay round from 4 Sep 2026 exactly - real pars, real
// stroke indexes, real scorecard, two Match Play side matches with auto presses
// - and asserts the Player Payouts panel describes the money the engines
// actually moved.
//
// WHAT WENT WRONG ON SCREEN. Final Results said Zach +$20 / Chris -$20 and Who
// Pays Who said Chris pays Zach $20, both correct. Directly underneath, Player
// Payouts said Zach +$60, Chris +$60, Don +$20, Steve +$60 - $200 of winnings
// in a round where $100 changed hands. Two defects stack to produce that:
//
//   1. buildSideMatchReceipts()'s Match Play / Nassau branch sets a segment's
//      `money` to the stake unconditionally and `toSideA: m.status > 0`. A
//      HALVED segment (status === 0) therefore books the full stake to side B.
//      money-engine.js's own accumulator adds nothing when status === 0, so the
//      receipt contradicts the engine it claims to read. The result string is
//      right - the Side Matches card prints "All square" - only the money is
//      wrong, which is why this survived visual review.
//
//   2. settlement.html's payout filter excludes only MAIN_POOL_LEDGER_LABEL as
//      an aggregate, so a "Side Match . A vs B" moving line prints alongside
//      the note lines that explain it. The same match is counted twice.
//
// The reconciler at settlement-engine.js proves MOVING lines sum to the net. It
// never checks that NOTE lines sum to the moving line they explain. That gap is
// what let this ship, and the notesReconcile test below closes it.
//
// NEGATIVE CONTROLS. Two tests exist purely so this suite cannot pass
// vacuously: fixtureHasHalvedSegments and fixtureHasDecidedSegments. If the
// fixture ever drifts to a scorecard with no all-square press, the assertions
// about halved segments would pass by having nothing to check. They fail loudly
// instead.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

const settle = loadHtmlInlineScript('settlement.html',
    ['money-engine.js', 'action-model.js', 'settlement-engine.js']);

const ZERO = 0.005;

// ---- THE ROUND ------------------------------------------------------------
// Chambers Bay, par 72 (36/36). Scores are the four cards as they appear in the
// Full Scorecard: Zach 73, Don 79, Chris 78, Steve 81.
const PAR = [4, 4, 3, 5, 4, 4, 4, 5, 3, 4, 4, 4, 5, 4, 3, 4, 3, 5];
const HCP = [3, 9, 15, 13, 5, 7, 1, 17, 11, 4, 8, 18, 14, 2, 16, 10, 6, 12];

const CARD = {
    Zach:  [4, 4, 3, 4, 4, 4, 5, 4, 3, 5, 4, 3, 5, 5, 4, 4, 3, 5],
    Don:   [5, 4, 4, 5, 5, 5, 4, 5, 4, 4, 4, 4, 5, 5, 4, 4, 3, 5],
    Chris: [5, 5, 4, 5, 4, 5, 4, 5, 4, 4, 5, 5, 5, 4, 3, 3, 3, 5],
    Steve: [6, 4, 5, 6, 4, 5, 4, 5, 5, 4, 5, 5, 4, 4, 3, 4, 3, 5]
};

function fixture() {
    const courseData = PAR.map((par, i) => ({ hole: i + 1, par, hcpIndex: HCP[i] }));
    const players = Object.keys(CARD).map((name, i) => ({
        id: 101 + i, name, hcp: '0', playingForMoney: true
    }));
    const scores = {};
    players.forEach(p => CARD[p.name].forEach((s, i) => { scores[`p${p.id}_h${i + 1}`] = s; }));

    const idOf = n => String(players.find(p => p.name === n).id);
    const match = (a, b, scoring) => ({
        format: 'match', scoring, stake: 20, pressRule: '2down',
        teamAIds: [idOf(a)], teamBIds: [idOf(b)], presses: {}
    });

    const data = {
        gameFormat: 'stroke', players, courseData, scores,
        sideMatches: {
            zc: match('Zach', 'Chris', 'net'),
            ds: match('Don', 'Steve', 'gross')
        }
    };
    return { data, courseData, scores, players };
}

const receipts = () => {
    const f = fixture();
    return settle.buildSideMatchReceipts(f.data, f.courseData, f.scores);
};

const settled = () => {
    const f = fixture();
    return settle.computeCombinedNetTotals(f.data, f.courseData, f.scores);
};

const allSegments = () => receipts().reduce((acc, r) => acc.concat(
    (r.segments || []).map(s => Object.assign({ match: `${r.nameA} vs ${r.nameB}` }, s))), []);

// A halved segment is identified by the engine's own words, not by our arithmetic,
// so these tests stay honest even if the money math changes underneath them.
const isHalved = s => /all square/i.test(s.result || '');

// Parses the REAL presenter's output rather than re-implementing its filter, so
// a fix that only changes the engine still has to survive the panel a golfer reads.
function renderedPayouts() {
    const res = settled();
    const sorted = Object.keys(res.contributions)
        .map(k => ({ name: res.contributions[k].name, net: res.contributions[k].net }));
    const html = settle.buildPlayerLedgerHtml(res.contributions, sorted);
    const out = {};
    html.split('pl-name">').slice(1).forEach(block => {
        const name = block.slice(0, block.indexOf('<'));
        const m = /TOTAL PAYOUT<\/span><span[^>]*>([^<]*)/.exec(block);
        out[name] = m ? Number(String(m[1]).replace(/[^0-9.-]/g, '')) * (/-/.test(m[1]) ? -1 : 1) : null;
    });
    return out;
}

// ---------------------------------------------------------------------------
describe('NEGATIVE CONTROLS - this fixture must actually exercise the defect', () => {

    test('fixtureHasHalvedSegments: the round contains all-square segments', () => {
        // Zach v Chris presses at H5 and H17, Don v Steve presses at H4 and H16.
        // Without these, every halved-segment assertion below would pass by
        // checking nothing.
        const halved = allSegments().filter(isHalved);
        assert.ok(halved.length >= 4,
            `expected at least 4 all-square segments, found ${halved.length}`);
    });

    test('fixtureHasDecidedSegments: the round contains decided segments too', () => {
        // Zach 7&6, Zach 2&1, Chris 2&1, Don 2&1, Steve 2&1 - five legs that DO pay.
        const decided = allSegments().filter(s => !isHalved(s));
        assert.equal(decided.length, 5,
            `expected 5 decided segments, found ${decided.length}`);
    });

    test('the presses fired on the holes the app displayed', () => {
        // Compared as strings: the receipts are built inside the vm sandbox, so
        // their arrays carry a different realm's prototype and deepStrictEqual
        // rejects them on identity alone.
        const starts = {};
        receipts().forEach(r => { starts[`${r.nameA} vs ${r.nameB}`] =
            r.segments.map(s => s.startHole).join(','); });
        assert.equal(starts['Zach vs Chris'], '1,3,5,10,17');
        assert.equal(starts['Don vs Steve'], '1,4,12,16');
    });
});

// ---------------------------------------------------------------------------
describe('GUARD - money that is already correct must not move', () => {

    test('settled net is unchanged: Zach +20, Chris -20, Don and Steve square', () => {
        const c = settled().contributions;
        assert.equal(c.zach.net, 20);
        assert.equal(c.chris.net, -20);
        assert.equal(c.don.net, 0);
        assert.equal(c.steve.net, 0);
    });

    test('Who Pays Who still resolves to the single $20 transfer', () => {
        const tx = (settled().transactions || []).filter(t => Math.abs(t.amount) > ZERO);
        assert.equal(tx.length, 1);
        assert.equal(tx[0].amount, 20);
    });

    test('match results still read exactly as the Side Matches card prints them', () => {
        const byLabel = {};
        receipts().forEach(r => r.segments.forEach(s =>
            { byLabel[`${r.nameA} vs ${r.nameB} / ${s.label}`] = s.result; }));
        assert.equal(byLabel['Zach vs Chris / Overall Match'], 'Zach 7&6');
        assert.equal(byLabel['Zach vs Chris / Press 1'], 'Zach 2&1');
        assert.equal(byLabel['Zach vs Chris / Press 2'], 'All square');
        assert.equal(byLabel['Zach vs Chris / Press 3'], 'Chris 2&1');
        assert.equal(byLabel['Zach vs Chris / Press 4'], 'All square');
        assert.equal(byLabel['Don vs Steve / Overall Match'], 'Don 2&1');
        assert.equal(byLabel['Don vs Steve / Press 1'], 'All square');
        assert.equal(byLabel['Don vs Steve / Press 2'], 'Steve 2&1');
        assert.equal(byLabel['Don vs Steve / Press 3'], 'All square');
    });

    test('a halved segment names no winner - PASSES TODAY, and that is the point', () => {
        // Deliberately not filed under the defect suite: it is green before the fix
        // and green after it. It is here because it explains how the bug survived
        // review. `winner` and `result` were always right, so the Side Matches card
        // printed "All square" correctly while the `money` field beside it paid out
        // $20. Everything a human read was true; only the number the ledger consumed
        // was wrong.
        allSegments().filter(isHalved).forEach(s => {
            assert.equal(s.winner, null, `${s.match} / ${s.label} named a winner while all square`);
        });
    });
});

// ---------------------------------------------------------------------------
describe('DEFECT 1 - a halved segment pays nobody', () => {

    test('every all-square segment carries $0', () => {
        allSegments().filter(isHalved).forEach(s => {
            assert.ok(Math.abs(s.money) < ZERO,
                `${s.match} / ${s.label} (H${s.startHole}) is "${s.result}" but books $${s.money}`);
        });
    });

    test('a match receipt segments sum to that match net', () => {
        // The comment above buildSideMatchReceipts claims the segments sum to the
        // engine total "by construction". This is that claim, asserted.
        receipts().forEach(r => {
            const sum = (r.segments || []).reduce(
                (a, s) => a + (s.toSideA ? s.money : -s.money), 0);
            assert.ok(Math.abs(sum - r.net) < ZERO,
                `${r.nameA} vs ${r.nameB}: segments sum to ${sum} but net is ${r.net}`);
        });
    });
});

// ---------------------------------------------------------------------------
describe('DEFECT 2 - the breakdown must reconcile to the money it explains', () => {

    test('notesReconcile: each golfer note lines sum to their moving side-match line', () => {
        // The existing reconciler proves MOVING lines sum to the net. Nothing
        // proved NOTE lines sum to the line they sit under. This is that check.
        const c = settled().contributions;
        Object.values(c).forEach(person => {
            const moving = person.lines
                .filter(l => !l.note && /^Side Match/.test(l.label))
                .reduce((a, l) => a + l.amount, 0);
            const notes = person.lines
                .filter(l => l.note)
                .reduce((a, l) => a + l.amount, 0);
            assert.ok(Math.abs(moving - notes) < ZERO,
                `${person.name}: side-match total ${moving} but detail sums to ${notes}`);
        });
    });

    test('the panel never prints a side-match rollup beside its own detail', () => {
        // ASSERTED ON RENDERED OUTPUT, DELIBERATELY. An earlier draft of this test
        // demanded the LEDGER hold only one or the other, which is wrong: the
        // rollup is the money-moving line that Final Results and Who Pays Who are
        // computed from, and removing it would break settled money. Both lines
        // belong in the ledger. Only one of them belongs on screen.
        const res = settled();
        const sorted = Object.keys(res.contributions)
            .map(k => ({ name: res.contributions[k].name, net: res.contributions[k].net }));
        const html = settle.buildPlayerLedgerHtml(res.contributions, sorted);
        assert.ok(!/Side Match \u00B7[^<]*<\/span><span class="val-/.test(html),
            'a Side Match rollup printed with a dollar amount alongside its detail lines');
    });

    test('the match name still appears, as a sub-header over its detail', () => {
        // The rollup was carrying the match identity. Dropping it must not leave a
        // golfer in two matches staring at two identical "Overall Match" rows.
        const res = settled();
        const sorted = Object.keys(res.contributions)
            .map(k => ({ name: res.contributions[k].name, net: res.contributions[k].net }));
        const html = settle.buildPlayerLedgerHtml(res.contributions, sorted);
        assert.ok(/pl-group"><span>Zach vs Chris<\/span>/.test(html),
            'Zach vs Chris did not head its own detail lines');
        assert.ok(/pl-group"><span>Don vs Steve<\/span>/.test(html),
            'Don vs Steve did not head its own detail lines');
    });
});

// ---------------------------------------------------------------------------
describe('THE PANEL - what a golfer actually reads', () => {

    test('TOTAL PAYOUT matches what each golfer won', () => {
        // Zach won the overall ($20) and Press 1 ($20). Chris won Press 3 ($20).
        // Don won the overall ($20). Steve won Press 2 ($20). Nothing else paid.
        assert.deepEqual(renderedPayouts(), { Zach: 40, Chris: 20, Don: 20, Steve: 20 });
    });

    test('payouts across the field equal the stakes actually decided', () => {
        // Five decided legs at $20. Money won must equal money lost, or the panel
        // is describing dollars that never existed.
        const paid = Object.values(renderedPayouts()).reduce((a, v) => a + v, 0);
        assert.equal(paid, 100);
    });
});

// ---------------------------------------------------------------------------
describe('CONTROL - the stroke branch was already right and stays right', () => {

    test('a tied stroke side match books $0, not the stake', () => {
        // buildSideMatchReceipts derives stroke money from seg.p1Money. This is the
        // behaviour the match branch is being brought into line with, pinned so a
        // fix cannot regress the branch that was correct.
        const courseData = PAR.map((par, i) => ({ hole: i + 1, par, hcpIndex: HCP[i] }));
        const players = [
            { id: 201, name: 'Ann', hcp: '0', playingForMoney: true },
            { id: 202, name: 'Bob', hcp: '0', playingForMoney: true }
        ];
        const scores = {};
        players.forEach(p => courseData.forEach(h => { scores[`p${p.id}_h${h.hole}`] = h.par; }));
        const data = {
            gameFormat: 'stroke', players, courseData, scores,
            sideMatches: {
                t: {
                    format: 'stroke', scoring: 'gross', overallStake: 20, holeStake: 0,
                    tieRule: 'push', overallMode: 'stroke', segment: 'full',
                    teamAIds: ['201'], teamBIds: ['202'], overallPresses: {}
                }
            }
        };
        const rec = settle.buildSideMatchReceipts(data, courseData, scores)[0];
        assert.ok(rec, 'no receipt produced for the stroke match');
        rec.segments.forEach(s => assert.ok(Math.abs(s.money) < ZERO,
            `tied stroke segment "${s.label}" booked $${s.money}`));
        assert.equal(rec.net, 0);
    });
});
