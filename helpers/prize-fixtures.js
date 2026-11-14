// ============================================================================
// Fixtures for the PO prize build (tournament_prizes_cards_test.js,
// tournament_prizes_chrome_test.js and the before/after screenshots).
//
// starkey()  the mockup's event: Starkey Cup, Round 1 Cascade, Round 2 Olympic,
//            8 golfers in A and B flights, owner u-org. Every hole is halved at
//            par except the skins the mockup shows: Cascade 4 Ray (3, par 4),
//            8 tied at 4 by Ana and Sam (carried), 9 Ana (4, par 5, carried
//            from 8), 15 Dana (2, par 3); Olympic 3 Mia (3, par 4), 11 Sam
//            (3, par 5 - an eagle), 16 Joe (3, par 4). Hole 18 is halved in both
//            rounds. Extra bogeys sit on halved holes only, never on fewer than
//            two golfers' par, so they move the totals and never a skin.
// oneDay()   a one-round golfer event (Papago), 4 golfers in two flights, KP on
//            7 and 13 and a long drive on 18, all three confirmed winners.
// ============================================================================
const PAR = [4, 4, 4, 4, 3, 4, 3, 4, 5, 4, 5, 4, 3, 4, 3, 4, 4, 5];
const CD = PAR.map((par, i) => ({ hole: i + 1, par, hcpIndex: i + 1 }));
const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };

const P = {
    pA: ['Ana Diaz', 'fA'], pS: ['Sam Ortiz', 'fA'], pJ: ['Joe Fox', 'fA'], pM: ['Mia Chen', 'fA'],
    pL: ['Lee Park', 'fB'], pD: ['Dana Ruiz', 'fB'], pK: ['Kim Vo', 'fB'], pR: ['Ray Diaz', 'fB'],
};
// [round, hole, player, score]
const SKINS = {
    r1: [[4, 'pR', 3], [9, 'pA', 4], [15, 'pD', 2]],
    r2: [[3, 'pM', 3], [11, 'pS', 3], [16, 'pJ', 3]],
};
// Bogeys per golfer per round, on halved holes (never 8, never a skins hole).
const BOGEYS = {
    r1: { pA: 0, pS: 1, pJ: 2, pM: 3, pL: 2, pD: 3, pK: 4, pR: 3 },
    r2: { pA: 0, pS: 3, pJ: 3, pM: 2, pL: 3, pD: 4, pK: 5, pR: 4 },
};
const FREE = [1, 2, 5, 6, 7, 10, 12, 13, 14, 17];

function roundScores(rid) {
    const s = {};
    const ids = Object.keys(P);
    ids.forEach((pid) => CD.forEach((h) => { s[`${pid}_h${h.hole}`] = h.par; }));
    SKINS[rid].forEach(([hole, pid, sc]) => { s[`${pid}_h${hole}`] = sc; });
    if (rid === 'r1') ids.forEach((pid) => { if (pid !== 'pA' && pid !== 'pS') s[`${pid}_h8`] = 5; });
    // Spread each golfer's bogeys over the free holes, rotating the start so no
    // hole loses more than five of its eight pars.
    ids.forEach((pid, i) => {
        for (let b = 0; b < BOGEYS[rid][pid]; b++) {
            const hole = FREE[(i + b * 3) % FREE.length];
            s[`${pid}_h${hole}`] = CD[hole - 1].par + 1;
        }
    });
    return s;
}

function starkey(extra) {
    const players = {};
    Object.keys(P).forEach((id, i) => { players[id] = { id, name: P[id][0], handicap: '0', flightId: P[id][1] }; });
    const rnd = (id, name, courseName, at) => ({ id, name, status: 'closed', format: 'individual', scoringMode: 'gross',
        courseName, courseData: CD, courseIndexSynthetic: false, createdAt: at, scoringGroups: {}, scores: roundScores(id) });
    return Object.assign({
        name: 'Starkey Cup', eventModel: 'round-v1', scoringModel: 'player-v1', format: 'individual', ownerUid: OWNER.uid,
        eventDate: '2026-06-06', courseName: 'Cascade', venue: 'Cascade', courseData: CD, createdAt: 1, entryFee: 0,
        payoutSpots: [100, 60, 40], payoutBasis: 'event',
        flights: { fA: { id: 'fA', name: 'A Flight', createdAt: 1 }, fB: { id: 'fB', name: 'B Flight', createdAt: 2 } },
        players, rounds: { r1: rnd('r1', 'Cascade', 'Cascade Golf Course', 10), r2: rnd('r2', 'Olympic', 'Olympic Course', 20) },
    }, extra || {});
}

function oneDay(extra) {
    const names = { pA: ['Ana Diaz', 'fA'], pS: ['Sam Ortiz', 'fA'], pD: ['Dana Ruiz', 'fB'], pL: ['Lee Park', 'fB'] };
    const players = {};
    Object.keys(names).forEach((id) => { players[id] = { id, name: names[id][0], handicap: '0', flightId: names[id][1] }; });
    const scores = {};
    Object.keys(names).forEach((pid) => CD.forEach((h) => { scores[`${pid}_h${h.hole}`] = h.par; }));
    scores.pA_h2 = 3;  // Ana's skin
    scores.pS_h5 = 4;  // Sam bogey (halved hole stays halved: three pars)
    scores.pL_h6 = 5; scores.pL_h10 = 5;
    scores.pD_h6 = 5;
    return Object.assign({
        name: 'Papago Classic', scoringModel: 'player-v1', format: 'individual', ownerUid: OWNER.uid, scoringMode: 'gross',
        eventDate: '2026-11-21', courseName: 'Papago', courseData: CD, courseIndexSynthetic: false, createdAt: 1, entryFee: 0,
        payoutSpots: [80, 40],
        flights: { fA: { id: 'fA', name: 'A Flight', createdAt: 1 }, fB: { id: 'fB', name: 'B Flight', createdAt: 2 } },
        players, scores,
        contests: { h7: { kind: 'kp', allowGps: true, winner: 'pS' }, h13: { kind: 'kp', allowGps: true, winner: 'pD' }, h18: { kind: 'ld', allowGps: true, winner: 'pL' } },
    }, extra || {});
}
// contestEntries/<code>: a group card keys an entry by the golfer's player id.
function oneDayEntries() {
    return {
        h7: { pS: { name: 'Sam Ortiz', team: 'pS', kind: 'kp', inches: 73, by: 'typed', at: 1 }, pA: { name: 'Ana Diaz', team: 'pA', kind: 'kp', inches: 90, by: 'typed', at: 2 } },
        h13: { pD: { name: 'Dana Ruiz', team: 'pD', kind: 'kp', inches: 44, by: 'typed', at: 1 } },
        h18: { pL: { name: 'Lee Park', team: 'pL', kind: 'ld', yards: 287, by: 'typed', at: 1 } },
    };
}

module.exports = { PAR, CD, OWNER, starkey, oneDay, oneDayEntries };
