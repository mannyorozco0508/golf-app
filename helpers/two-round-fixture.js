// A two-course individual event for the board tests and the cold-arrival shots:
// Starkey Cup, Cascade (closed, every card complete) + Olympic (open, in play),
// eight golfers in two flights. Ana's cards are laid by hand so the rings on the
// opened row are real: Cascade 70 (-2) with birdies on 2 and 9, an eagle on 7,
// bogeys on 5 and 17; Olympic 36 (E) thru 9 with a birdie on 2, bogeys on 4, 6
// and 9, an eagle on 7. Everyone else gets an even spread, every hole 3 or more.
'use strict';
const CD = [...Array(18)].map((_, i) => ({ hole: i + 1, par: [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4][i], hcpIndex: i + 1 }));
const P = { pA: ['Ana Diaz', '4', 'fA'], pB: ['Joe Fox', '6', 'fA'], pC: ['Sam Ortiz', '2', 'fA'], pF: ['Mia Chen', '8', 'fA'],
    pD: ['Dana Ruiz', '15', 'fB'], pE: ['Lee Park', '14', 'fB'], pG: ['Kim Vo', '18', 'fB'], pH: ['Ray Diaz', '12', 'fB'] };
const ANA = [4, 4, 3, 4, 5, 3, 3, 4, 3, 4, 3, 5, 4, 4, 5, 3, 5, 4];
const ANA2 = [4, 4, 3, 5, 4, 4, 3, 4, 5];
const sc = (pid, list) => { const o = {}; list.forEach((v, i) => { if (v > 0) o[`${pid}_h${i + 1}`] = v; }); return o; };
const flat = (pid, total, n) => { const o = {}; const base = Math.floor(total / n); let extra = total - base * n; for (let h = 1; h <= n; h++) o[`${pid}_h${h}`] = base + (extra-- > 0 ? 1 : 0); return o; };
function record(opts) {
    const players = {}; Object.keys(P).forEach((id) => { players[id] = { id, name: P[id][0], handicap: P[id][1], flightId: P[id][2] }; });
    const r1 = Object.assign({}, sc('pA', ANA), flat('pB', 75, 18), flat('pC', 71, 18), flat('pF', 78, 18), flat('pD', 84, 18), flat('pE', 86, 18), flat('pG', 92, 18), flat('pH', 83, 18));
    const r2 = Object.assign({}, sc('pA', ANA2), flat('pB', 38, 9), flat('pC', 35, 8), flat('pF', 40, 7), flat('pD', 44, 9), flat('pE', 43, 8), flat('pG', 47, 6), flat('pH', 41, 9));
    const rnd = (name, courseName, status, at, scores) => ({ name, status, format: 'individual', scoringMode: 'gross', courseName, courseData: CD, createdAt: at, scores });
    return Object.assign({ name: 'Starkey Cup', eventModel: 'round-v1', scoringModel: 'player-v1', format: 'individual', ownerUid: 'u-org',
        eventDate: '2026-06-06', courseName: 'Cascade', courseData: CD,
        flights: { fA: { id: 'fA', name: 'A Flight', createdAt: 1 }, fB: { id: 'fB', name: 'B Flight', createdAt: 2 } },
        players, rounds: { r1: rnd('Cascade', 'Cascade Golf Course', 'closed', 10, r1), r2: rnd('Olympic', 'Olympic Course', 'open', 20, r2) } }, opts || {});
}
// The whole database a cold arrival needs, keyed STK.
const db = (opts) => ({ '.info': { connected: true }, tournaments: { STK: record(opts) } });
module.exports = { CD, P, ANA, ANA2, sc, flat, record, db };
