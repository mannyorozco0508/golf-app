// ============================================================================
// MAIN POOL SETTLEMENT PARITY — the cents may not move
//
// A fixed corpus of Main Pool rounds, pinned to the exact per-player cents that
// computeMoneyPool() produced on main at cb2fc06, BEFORE any of the Main Pool
// work began. Everything since - the previewCourseData extraction, the pool
// restore fix, KP auto-fill, the allocation display, the Main Pool rename - is
// setup, presentation or persistence. None of it may move a single cent.
//
// The corpus deliberately covers the paths where money behaves differently
// rather than seven variations of the same round: preset and custom net payouts,
// remainder and fixed and absent skins buckets, whole-dollar and cents rounds,
// a scoped participant list, and all three KP states - confirmed, unresolved,
// and cancelled - because unresolved money is WITHHELD rather than refunded and
// cancelled money flows into the remainder instead.
//
// If a figure below changes, stop. Either a money rule genuinely changed, in
// which case it needs saying out loud, or something that was supposed to be
// cosmetic was not.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadJsFile } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const P = makePlayers(['Al', 'Bo', 'Cy', 'Di', 'Ed', 'Fi'], [0, 4, 9, 14, 2, 18]);
const CD = makeCourseData(18);
function scores(offsets) {
    const s = {};
    P.forEach((p, i) => CD.forEach(h => {
        s[`p${p.id}_h${h.hole}`] = h.par + offsets[i % offsets.length] + (h.hole % 3 === 0 ? 1 : 0);
    }));
    return s;
}
const base = { players: P, courseData: CD, scores: scores([0, 1, 2, 3, 1, 4]) };
const kpW = { h4: String(P[0].id), h9: String(P[2].id), h14: String(P[1].id) };

const CORPUS = {
    '01 preset net, remainder skins, KP confirmed': Object.assign({}, base, {
        moneyPool: { enabled: true, buyIn: 40, kp: { amount: 100, holes: [4, 9, 14] },
            net: { amount: 100, places: [50, 30, 20] }, skins: { mode: 'remainder', scoring: 'net', carryOver: true } },
        kpWinners: kpW, kpConfirmed: { confirmed: true } }),
    '02 custom net, fixed skins, gross': Object.assign({}, base, {
        moneyPool: { enabled: true, buyIn: 50, kp: { amount: 60, holes: [4, 14] },
            net: { payoutMode: 'custom', amounts: [40, 30] }, skins: { mode: 'fixed', amount: 170, scoring: 'gross', carryOver: false } },
        kpWinners: kpW, kpConfirmed: { confirmed: true } }),
    '03 KP unresolved (money withheld)': Object.assign({}, base, {
        moneyPool: { enabled: true, buyIn: 40, kp: { amount: 100, holes: [4, 9, 14] },
            net: { amount: 100, places: [60, 40] }, skins: { mode: 'remainder', scoring: 'net', carryOver: true } } }),
    '04 KP cancelled, remainder absorbs it': Object.assign({}, base, {
        moneyPool: { enabled: true, buyIn: 40, kp: { amount: 100, holes: [4, 9] },
            net: { amount: 100, places: [100] }, skins: { mode: 'remainder', scoring: 'net', carryOver: true } },
        kpCancelled: { cancelled: true } }),
    '05 no skins bucket, whole-dollar round': Object.assign({}, base, {
        settlementMode: 'whole-dollar',
        moneyPool: { enabled: true, buyIn: 30, kp: { amount: 60, holes: [4, 9, 14] },
            net: { amount: 120, places: [50, 30, 20] }, skins: { mode: 'none' } },
        kpWinners: kpW, kpConfirmed: { confirmed: true } }),
    '06 scoped participants (participantIds honoured)': Object.assign({}, base, {
        moneyPool: { enabled: true, buyIn: 40,
            participantIds: [String(P[0].id), String(P[1].id), String(P[2].id), String(P[3].id)],
            kp: { amount: 40, holes: [4] }, net: { amount: 60, places: [60, 40] },
            skins: { mode: 'remainder', scoring: 'net', carryOver: true } },
        kpWinners: kpW, kpConfirmed: { confirmed: true } }),
    '07 no winner declared on a KP hole': Object.assign({}, base, {
        moneyPool: { enabled: true, buyIn: 40, kp: { amount: 100, holes: [4, 9] },
            net: { amount: 100, places: [50, 30, 20] }, skins: { mode: 'remainder', scoring: 'net', carryOver: true } },
        kpWinners: { h4: String(P[0].id) }, kpNoWinner: { h9: true }, kpConfirmed: { confirmed: true } })
};

// Captured from main at cb2fc06, before any Main Pool work.
const PINNED = {
    "01 preset net, remainder skins, KP confirmed": {
        "totalPoolCents": 24000,
        "perPlayerCents": {
            "101": 8334,
            "102": 2333,
            "103": -667,
            "104": -4000,
            "105": -2000,
            "106": -4000
        },
        "refundCents": 0,
        "kpUnresolvedCents": 0
    },
    "02 custom net, fixed skins, gross": {
        "totalPoolCents": 30000,
        "perPlayerCents": {
            "101": 19000,
            "102": 1000,
            "103": -5000,
            "104": -5000,
            "105": -5000,
            "106": -5000
        },
        "refundCents": 0,
        "kpUnresolvedCents": 0
    },
    "03 KP unresolved (money withheld)": {
        "totalPoolCents": 24000,
        "perPlayerCents": {
            "101": 6000,
            "102": 0,
            "103": -4000,
            "104": -4000,
            "105": -4000,
            "106": -4000
        },
        "refundCents": 0,
        "kpUnresolvedCents": 10000
    },
    "04 KP cancelled, remainder absorbs it": {
        "totalPoolCents": 24000,
        "perPlayerCents": {
            "101": 20000,
            "102": -4000,
            "103": -4000,
            "104": -4000,
            "105": -4000,
            "106": -4000
        },
        "refundCents": 0,
        "kpUnresolvedCents": 0
    },
    "05 no skins bucket, whole-dollar round": {
        "totalPoolCents": 18000,
        "perPlayerCents": {
            "101": 5000,
            "102": 2600,
            "103": -1000,
            "104": -3000,
            "105": -600,
            "106": -3000
        },
        "refundCents": 0,
        "kpUnresolvedCents": 0
    },
    "06 scoped participants (participantIds honoured)": {
        "totalPoolCents": 16000,
        "perPlayerCents": {
            "101": 9600,
            "102": -1600,
            "103": -4000,
            "104": -4000
        },
        "refundCents": 0,
        "kpUnresolvedCents": 0
    },
    "07 no winner declared on a KP hole": {
        "totalPoolCents": 24000,
        "perPlayerCents": {
            "101": 10834,
            "102": -166,
            "103": -3167,
            "104": -3167,
            "105": -1167,
            "106": -3167
        },
        "refundCents": 5000,
        "kpUnresolvedCents": 0
    }
};

function settle(data) {
    const sb = loadJsFile('pool-engine.js', ['handicap.js', 'money-engine.js', 'settlement-engine.js']);
    sb.__d = data;
    const r = vm.runInContext('computeMoneyPool(__d, __d.courseData, __d.scores)', sb);
    const j = JSON.parse(JSON.stringify(r));
    return {
        totalPoolCents: j.totalPoolCents,
        perPlayerCents: j.perPlayerCents,
        refundCents: j.refund ? j.refund.cents : 0,
        kpUnresolvedCents: j.kpUnresolvedCents || 0
    };
}

describe('Main Pool settles to the same cents it always did', () => {

    Object.keys(CORPUS).forEach(name => {
        test(name, () => {
            assert.deepEqual(settle(CORPUS[name]), PINNED[name],
                'Settlement moved on: ' + name);
        });
    });

    // The engine's own stated invariant, checked independently of the pinned
    // figures so a corpus edited in both places cannot hide a leak.
    test('NO MONEY DISAPPEARS: prizes + refunds + withheld === the pot', () => {
        Object.keys(CORPUS).forEach(name => {
            const r = settle(CORPUS[name]);
            const paidOut = Object.values(r.perPlayerCents).reduce((a, b) => a + b, 0);
            // perPlayerCents is net of the buy-in, so the pot returns to zero once
            // every dollar has a destination. Withheld KP money is the deliberate
            // exception, and it is exactly the shortfall.
            assert.equal(paidOut + r.kpUnresolvedCents, 0,
                name + ': the ledger does not reconcile');
        });
    });
});
