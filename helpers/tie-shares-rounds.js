// The rounds tie_shares_test.js and its baseline capture share. Five rounds: the pool
// golden's off and flighted variants (untied places), three tied for FIRST on
// a whole-dollar round and on a legacy (cents) round, and two tied for SECOND.
const { makePlayers, makeCourseData } = require('./fixtures.js');
const { wizardSavedRound } = require('./wizard-saved-round.js');
const CD = makeCourseData(18);
function base(flights) {
    const r = wizardSavedRound({ code: 'WEEKLY', courseData: CD, thru: 18, overrides: { additionalGames: {}, flights: flights === undefined ? undefined : flights } });
    if (flights === undefined) delete r.flights;
    const byName = {}; r.players.forEach(p => { byName[p.name] = p.id; });
    r.__b = (name, hole) => { r.scores['p' + byName[name] + '_h' + hole] = CD[hole - 1].par - 1; };
    const id = i => String(r.players[i].id);
    r.kpWinners = { h3: id(0), h7: id(4), h12: id(8), h16: id(1) }; r.kpConfirmed = { confirmed: true, at: 1 };
    return r;
}
const GOLDEN = ['Ann Alpha', 1, 'Ben Bravo', 2, 'Max Mike', 2, 'Cal Charlie', 5, 'Ned November', 7, 'Dee Delta', 9, 'Oli Oscar', 11, 'Eli Echo', 13, 'Pat Papa', 13, 'Quy Quebec', 16];
function golden(flights) { const r = base(flights); for (let i = 0; i < GOLDEN.length; i += 2) r.__b(GOLDEN[i], GOLDEN[i + 1]); delete r.__b; return r; }
function threeTied() {
    const players = makePlayers(['Bobby Blue', 'Tommy Teal', 'Sammy Sage', 'Danny Dune', 'Eddie Elm', 'Frankie Fir', 'Gerry Gold', 'Harry Hill'], [0, 0, 0, 0, 0, 0, 0, 0]);
    const scores = {}; players.forEach(p => CD.forEach(h => { scores[`p${p.id}_h${h.hole}`] = h.par; }));
    [[0, 2], [1, 6], [2, 11]].forEach(([i, h]) => { scores[`p${players[i].id}_h${h}`] = CD[h - 1].par - 1; });
    scores[`p${players[3].id}_h5`] = CD[4].par + 1;
    return { eventName: 'Weekly', players, courseData: CD, scores, gameFormat: 'stroke', settlementMode: 'whole-dollar', skinsRounding: 'odd-dollar',
        moneyPool: { enabled: true, buyIn: 20, kp: { amount: 0, holes: [] }, net: { amount: 100, places: [50, 30, 20] }, skins: { mode: 'fixed', amount: 60, scoring: 'gross', carryOver: false } } };
}
function threeTiedLegacy() { const r = threeTied(); delete r.settlementMode; delete r.skinsRounding; return r; }
function twoTiedSecond() { const r = threeTied(); r.scores[`p${r.players[0].id}_h9`] = CD[8].par - 1; return r; }
const ROUNDS = { 'golden-off': () => golden(undefined), 'golden-flight': () => golden({ enabled: true, scopes: { skins: 'flight', birdies: 'field' } }), 'three-tied-first': threeTied, 'three-tied-legacy': threeTiedLegacy, 'two-tied-second': twoTiedSecond };
module.exports = { ROUNDS, CD };
