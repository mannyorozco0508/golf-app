// The trip the Wave A fix 2 capture and trip_weekly_game_test.js share: two
// linked 12-golfer Weekly Game rounds (a KP $100 / Net $70 / skins-remainder
// pool, every KP confirmed), the first with a $50 side match, so the money
// card, the recap card and the share text all render with the total's sentence.
const NAMES = ['Marty', 'Scott', 'Carp', 'Randy', 'Manny', 'Matt B', 'Lance', 'Kopp', 'Marcus', 'Rocco', 'Matt H', 'Jeremy'];
const POOL = { enabled: true, buyIn: 40, kp: { amount: 100, holes: [3, 7, 12, 16] }, net: { amount: 70, places: [57.142857, 42.857143] }, skins: { mode: 'remainder', scoring: 'net', carryOver: false } };
function roundData({ seed = 0, side = false } = {}) {
    const cd = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
    const ps = NAMES.map((n, i) => ({ id: 101 + i, name: n, hcp: '9', playingForMoney: true }));
    const sc = {};
    ps.forEach((p, pi) => cd.forEach((h, hi) => { sc['p' + p.id + '_h' + h.hole] = 4 + ((pi + hi + seed) % 3) - 1; }));
    sc['p101_h2'] = 2; sc['p103_h5'] = 9;
    const d = { players: ps, courseData: cd, scores: sc, settlementMode: 'whole-dollar', moneyPool: POOL,
        kpWinners: { h3: '101', h7: '105', h12: '109', h16: '102' }, kpConfirmed: { confirmed: true } };
    if (side) d.sideMatches = { m1: { format: 'match', scoring: 'net', stake: 50, startHole: 1, createdAt: 1, teamAIds: ['101'], teamBIds: ['103'] } };
    return d;
}
function linkedRounds() {
    return [{ label: 'Caledonia', countsTowardTrip: true, data: roundData({ seed: 0, side: true }) },
            { label: 'True Blue', countsTowardTrip: true, data: roundData({ seed: 1 }) }];
}
const DEPS = ['money-engine.js', 'action-model.js', 'settlement-engine.js', 'pool-engine.js', 'score-marks.js'];
module.exports = { linkedRounds, DEPS };
