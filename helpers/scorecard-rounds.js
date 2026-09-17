// The rounds the scorecard-rows extraction is proved on - every shape the
// Receipt's Full Scorecard renders: 18 holes with and without net mattering,
// a 12-golfer pool round, a front-nine-only and a back-nine-only course, a
// course with a missing stroke index, a name that needs escaping, an unscored
// golfer. Shared by the capture script (at HEAD) and scorecard_rows_test.js
// (against today), so the two cannot drift apart.
const { makeCourseData, makePlayers } = require('./fixtures.js');
const { linkedRounds } = require('./trip-weekly-rounds.js');

const CD = makeCourseData(18);
const P4 = makePlayers(['Ann A', 'Ben <B>', 'Cal C', 'Dee D'], [0, 0, 0, 0], 101);

function twoVtwo({ thruBy = [18, 18, 18, 18], verified = false, blank = null, extra = {} } = {}) {
    const scores = {};
    P4.forEach((p, i) => CD.forEach(h => { if (h.hole <= thruBy[i]) scores['p' + p.id + '_h' + h.hole] = h.par + ((i === 0 && h.hole % 3 === 0) ? -1 : 0) + ((i === 2 && h.hole === 5) ? -2 : 0); }));
    if (blank) delete scores[blank];
    const d = { eventName: 'Measure', players: P4, courseData: CD, scores, gameFormat: 'stroke', settlementMode: 'whole-dollar',
        sideMatches: { m: { format: 'match', scoring: 'gross', stake: 25, startHole: 1, createdAt: 1, teamAIds: ['101', '103'], teamBIds: ['102', '104'] } } };
    if (verified) d.scoresVerified = { verified: true, verifiedAt: 1, verifiedBy: 'round' };
    return Object.assign(d, extra);
}
const NAMES12 = ['Marty', 'Scott', 'Carp', 'Randy', 'Manny', 'Matt B', 'Lance', 'Kopp', 'Marcus', 'Rocco', 'Matt H', 'Jeremy'];
function poolRound({ thru = 18 } = {}) {
    const cd = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
    const ps = NAMES12.map((n, i) => ({ id: 101 + i, name: n, hcp: '9', playingForMoney: true }));
    const sc = {};
    ps.forEach((p, pi) => cd.forEach((h, hi) => { if (h.hole <= thru) sc['p' + p.id + '_h' + h.hole] = 4 + ((pi + hi) % 3) - 1; }));
    return { eventName: 'KP', players: ps, courseData: cd, scores: sc, gameFormat: 'stroke', settlementMode: 'whole-dollar',
        kpWinners: { h3: '101', h7: '105', h12: '109', h16: '102' }, kpConfirmed: { confirmed: true },
        moneyPool: { enabled: true, buyIn: 40, kp: { amount: 100, holes: [3, 7, 12, 16] }, net: { amount: 70, places: [57.142857, 42.857143] }, skins: { mode: 'remainder', scoring: 'net', carryOver: false } } };
}
// Net matters: handicaps AND a net pool.
function netRound() {
    const ps = makePlayers(['Ann A', 'Ben B', 'Cal C', 'Dee D'], [4, 9, 12, 0], 101);
    const scores = {};
    ps.forEach((p, i) => CD.forEach(h => { scores['p' + p.id + '_h' + h.hole] = h.par + ((i + h.hole) % 4 === 0 ? -1 : (h.hole % 5 === 0 ? 1 : 0)); }));
    return { eventName: 'Net', players: ps, courseData: CD, scores, gameFormat: 'stroke', settlementMode: 'whole-dollar',
        moneyPool: { enabled: true, buyIn: 20, net: { amount: 60, places: [100] }, kp: { amount: 0, holes: [] }, skins: { mode: 'none' } } };
}
function nineOnly(front) {
    const cd = CD.filter(h => front ? h.hole <= 9 : h.hole > 9);
    const ps = makePlayers(['Ann A', 'Ben B'], [0, 0], 101);
    const scores = {};
    ps.forEach((p, i) => cd.forEach(h => { scores['p' + p.id + '_h' + h.hole] = h.par + (i === 0 && h.hole % 2 === 0 ? -1 : 0); }));
    return { eventName: front ? 'Front' : 'Back', players: ps, courseData: cd, scores, gameFormat: 'stroke' };
}
function missingIndex() {
    const cd = CD.map(h => (h.hole === 4 ? { hole: 4, par: h.par } : h));
    const ps = makePlayers(['Ann A', 'Ben B'], [6, 0], 101);
    const scores = {};
    ps.forEach((p) => cd.forEach(h => { scores['p' + p.id + '_h' + h.hole] = h.par; }));
    delete scores.p102_h9;
    return { eventName: 'Missing', players: ps, courseData: cd, scores, gameFormat: 'stroke', settlementMode: 'whole-dollar',
        moneyPool: { enabled: true, buyIn: 20, net: { amount: 40, places: [100] }, kp: { amount: 0, holes: [] }, skins: { mode: 'none' } } };
}

function rounds() {
    const linked = linkedRounds();
    return {
        caledonia: linked[0].data,
        trueBlue: linked[1].data,
        twoVtwo: twoVtwo(),
        twoVtwoBlank: twoVtwo({ blank: 'p104_h12', thruBy: [18, 18, 18, 9] }),
        pool: poolRound(),
        poolThru9: poolRound({ thru: 9 }),
        net: netRound(),
        frontOnly: nineOnly(true),
        backOnly: nineOnly(false),
        missingIndex: missingIndex(),
        nobodyStarted: Object.assign(twoVtwo(), { scores: {} })
    };
}

module.exports = { rounds, CD };
