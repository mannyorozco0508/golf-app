// ============================================================================
// A POT-ONLY TRIP DOES NOT INVENT WHO OWES WHO (2026-09-24)
//
// The money card already hid Who Pays Who when the only money that moved was
// the pot (hasPlayerToPlayerSettlement). The recap card and the share text
// did not. They read simplifyDebts' pairings out of cachedMoneyTransactions,
// which the card filled even when it refused to print them.
//
// MEASURED on one finished 12-golfer Weekly Game before the fix:
//   card:  Marty +$17 … Jeremy -$9, and no "Who Pays Who"
//   paste: "Rocco owes Marty $9" and nine more debts nobody has
// simplifyDebts still produces that $9. The paste must not.
//
// A side match on the same week is the other arm: those debts are real, and
// the paste must still say who owes who. A round with no money at all must
// still say everyone is settled, not the pot sentence.
//
// HARNESS. mini-dom does not fire an onclick, so this calls shareRecap and
// openTripRecap — the functions the buttons name — after the same renderers
// refreshTripComputations calls. It does not prove a finger on a phone. It
// does prove the text those buttons hand to the share sheet.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const strip = (h) => h.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ').trim();
const DEPS = ['match-engine.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js', 'pool-engine.js', 'score-marks.js'];

const NAMES = ['Marty', 'Scott', 'Carp', 'Randy', 'Manny', 'Matt B', 'Lance', 'Kopp', 'Marcus', 'Rocco', 'Matt H', 'Jeremy'];
const POT_NOTE = 'Nobody pays another golfer. This money moved through the pot.';
// The pairings simplifyDebts built from this round, measured before the paste
// stopped publishing them. The paste must not contain any of these sentences.
const INVENTED = [
    'Rocco owes Marty $9',
    'Matt H owes Marty $8',
    'Jeremy owes Manny $9',
    'Kopp owes Scott $8',
];
const NETS = [
    'Marty +$17', 'Manny +$17', 'Marcus +$17', 'Scott +$16',
    'Carp -$8', 'Randy -$8', 'Matt B -$8', 'Lance -$8', 'Kopp -$8',
    'Rocco -$9', 'Matt H -$9', 'Jeremy -$9',
];

function poolRound({ side = false } = {}) {
    const cd = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
    const ps = NAMES.map((n, i) => ({ id: 101 + i, name: n, hcp: '9', playingForMoney: true }));
    const sc = {};
    ps.forEach((p, pi) => cd.forEach((h, hi) => { sc['p' + p.id + '_h' + h.hole] = 4 + ((pi + hi) % 3) - 1; }));
    const d = {
        players: ps, courseData: cd, scores: sc, gameFormat: 'stroke', settlementMode: 'whole-dollar',
        kpWinners: { h3: '101', h7: '105', h12: '109', h16: '102' },
        kpConfirmed: { confirmed: true },
        moneyPool: {
            enabled: true, buyIn: 40,
            kp: { amount: 100, holes: [3, 7, 12, 16] },
            net: { amount: 70, places: [57.142857, 42.857143] },
            skins: { mode: 'remainder', scoring: 'net', carryOver: false },
        },
    };
    if (side) {
        d.sideMatches = {
            m1: { format: 'match', scoring: 'net', stake: 50, startHole: 1, createdAt: 1, teamAIds: ['101'], teamBIds: ['103'] },
        };
    }
    return d;
}

function evenRound() {
    const cd = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
    const ps = ['Ann', 'Ben'].map((n, i) => ({ id: 101 + i, name: n, hcp: '0', playingForMoney: true }));
    const sc = {};
    ps.forEach(p => cd.forEach(h => { sc['p' + p.id + '_h' + h.hole] = 4; }));
    return { players: ps, courseData: cd, scores: sc, gameFormat: 'stroke', settlementMode: 'whole-dollar' };
}

function boot(data, name) {
    const sb = loadHtmlInlineScript('trip.html', DEPS);
    const linked = [{ code: 'CAL', label: 'Caledonia', countsTowardTrip: true, data }];
    sb.navigator.share = (opts) => { sb.window.__shared = opts; return Promise.resolve(); };
    vm.runInContext(`tripData = { name: ${JSON.stringify(name)} };
        cachedRoundResults = ${JSON.stringify(linked)};
        cachedCountedResults = cachedRoundResults;
        recomputeTripGate();
        renderCumulativeLeaderboard();
        renderTripMoneySettlement();
        renderTripAwards();
        openTripRecap();
        shareRecap();`, sb);
    const share = String((sb.window.__shared && sb.window.__shared.text) || '');
    return {
        sb,
        money: strip(sb.document.getElementById('trip-money-settlement').innerHTML),
        recap: strip(sb.document.getElementById('trip-recap-card').innerHTML),
        share,
        invented: JSON.parse(vm.runInContext(
            'JSON.stringify(simplifyDebts(Object.fromEntries((cachedTripTotals.once || []).map(v => [v.name, v.net]))))', sb)),
        tx: JSON.parse(vm.runInContext('JSON.stringify(cachedMoneyTransactions)', sb)),
        pot: vm.runInContext('cachedTripPotOnly', sb),
    };
}

describe('POT ONLY: the paste matches the card', () => {
    const b = boot(poolRound(), 'Myrtle Week');

    test('the arithmetic still wants Rocco to pay Marty $9', () => {
        assert.ok(b.invented.length > 0, 'a pot with winners produces pairings');
        const hit = b.invented.find(t => t.from === 'Rocco' && t.to === 'Marty');
        assert.equal(hit && hit.amount, 9);
    });

    test('the card shows the nets and the pot sentence, and no pay list', () => {
        assert.match(b.money, /Net Across the Trip/);
        assert.ok(b.money.includes(POT_NOTE), b.money.slice(0, 240));
        NETS.forEach(line => assert.ok(b.money.includes(line.split(' ')[0]), line));
        assert.match(b.money, /Marty\|\+\$17/);
        assert.ok(!/Who Pays Who/.test(b.money), b.money.slice(0, 200));
        assert.equal(b.pot, true);
        assert.deepEqual(b.tx, []);
    });

    test('the share sheet the button opens carries the nets and none of the invented debts', () => {
        assert.match(b.share, /^🚐 Myrtle Week — Trip Recap\n/);
        assert.ok(b.share.includes('💵 FINAL SETTLEMENT\n' + POT_NOTE + '\n'));
        NETS.forEach(line => assert.ok(b.share.includes(line + '\n'), 'missing ' + line + '\n' + b.share));
        INVENTED.forEach(line => assert.ok(!b.share.includes(line), line));
        assert.ok(!/\bowes\b/.test(b.share), b.share);
        assert.ok(b.share.includes('Includes the main game'));
    });

    test('the recap card says the same thing', () => {
        assert.ok(b.recap.includes(POT_NOTE), b.recap.slice(0, 400));
        assert.match(b.recap, /Marty\|\+\$17/);
        assert.match(b.recap, /Jeremy\|\-\$9/);
        assert.ok(!/owes/.test(b.recap));
        assert.ok(!/→/.test(b.recap), b.recap);
    });
});

describe('A SIDE MATCH STILL PRINTS WHO PAYS WHO', () => {
    const b = boot(poolRound({ side: true }), 'Side Week');

    test('the paste names a real debt and does not use the pot sentence', () => {
        assert.equal(b.pot, false);
        assert.ok(b.tx.length > 0);
        assert.match(b.money, /Who Pays Who/);
        assert.ok(!b.money.includes(POT_NOTE));
        assert.match(b.share, / owes /);
        assert.ok(!b.share.includes(POT_NOTE));
        const first = b.tx[0];
        assert.ok(b.share.includes(first.from + ' owes ' + first.to + ' $' + first.amount));
    });
});

describe('NO MONEY: still "everyone is settled", not the pot sentence', () => {
    const b = boot(evenRound(), 'Quiet Week');

    test('nothing moved, so nobody is told the pot paid', () => {
        assert.equal(b.pot, false);
        assert.deepEqual(b.tx, []);
        assert.deepEqual(b.invented, []);
        assert.match(b.share, /Everyone's settled up — no money changes hands\./);
        assert.ok(!b.share.includes(POT_NOTE));
        assert.match(b.recap, /settled up/);
        assert.ok(!b.recap.includes(POT_NOTE));
    });
});

describe('THE BUTTON AND THE CACHE ARE THE SAME SENTENCE', () => {
    const src = read('trip.html');

    test('Share Trip Recap calls shareRecap, and the load path renders the money', () => {
        assert.match(src, /onclick="shareRecap\(\)"/);
        assert.match(src, /Share Trip Recap \(Text\)/);
        const refresh = src.slice(src.indexOf('function refreshTripComputations'), src.indexOf('\n    function ', src.indexOf('function refreshTripComputations') + 40));
        assert.ok(refresh.length > 400, 'refresh slice collapsed: ' + refresh.length);
        assert.match(refresh, /renderTripMoneySettlement\(\)/);
    });

    test('the paste withholds the pay list unless a golfer owes a golfer', () => {
        const at = src.indexOf('function buildShareRecapText');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 40));
        assert.ok(fn.length > 800, 'share slice collapsed: ' + fn.length);
        assert.match(fn, /cachedTripPotOnly/);
        assert.match(fn, /TRIP_POT_PAID_NOTE|tripPotTotalsPlain\(\)/);
        const renderAt = src.indexOf('function renderTripMoneySettlement()');
        const render = src.slice(renderAt, src.indexOf('\n    function ', renderAt + 40));
        assert.ok(render.length > 3000, 'render slice collapsed: ' + render.length);
        assert.match(render, /cachedMoneyTransactions = \(!blocked && playerPays\) \? transactions : \[\]/);
        assert.match(render, /hasPlayerToPlayerSettlement\(tripContributions\)/);
    });
});
