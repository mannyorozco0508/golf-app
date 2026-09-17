// The trips the trip-identity wave is proved on, shared by the capture script
// (at HEAD) and trip_identity_test.js (against today) so they cannot drift.
//
//   clean      two rounds, four full names, no collision, no mapping - the
//              "byte-identical to today" trip
//   weekly     the two real Weekly Game rounds (helpers/trip-weekly-rounds.js)
//   mikes      two rounds: "Mike" on Day 1, "Mike H" on Day 2 - form B (bare
//              first name vs first + initial) - and a "Matt B" / "Matt B." pair
//              across the same two rounds - form A (punctuation)
//   sameKey    two rounds with an exact "Mike" in each: the invisible case, no
//              collision signal, the roster's "in 2 of 2 rounds" tell
//   oneRound   one round only
const { linkedRounds } = require('./trip-weekly-rounds.js');
const cd18 = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));

function roundOf(label, names, tweak, extra) {
    const players = names.map((n, i) => ({ id: 101 + i, name: n, hcp: String(i * 2), playingForMoney: true }));
    const scores = {};
    players.forEach(p => cd18.forEach(h => { scores['p' + p.id + '_h' + h.hole] = 4; }));
    if (tweak) tweak(scores);
    return Object.assign({ eventName: label, roundDay: label, courseName: 'Caledonia', gameFormat: 'stroke',
        courseData: cd18, players, scores, settlementMode: 'whole-dollar' }, extra || {});
}
const SIDE = { sideMatches: { m1: { format: 'match', scoring: 'net', stake: 50, startHole: 1, createdAt: 1, teamAIds: ['101'], teamBIds: ['102'] } } };
const SIDE2 = { sideMatches: { m2: { format: 'match', scoring: 'net', stake: 50, startHole: 1, createdAt: 1, teamAIds: ['101'], teamBIds: ['104'] } } };
function linked(rounds) {
    return rounds.map((r, i) => ({ code: 'R' + i, label: r.eventName, countsTowardTrip: true, data: r }));
}
function trips() {
    const w = linkedRounds();
    return {
        clean: linked([
            roundOf('Day 1', ['Marty Sharp', 'Carp Dean', 'Lance Webb', 'Zach Hill'], s => { s.p101_h1 = 3; s.p101_h3 = 3; s.p102_h7 = 11; }, SIDE),
            roundOf('Day 2', ['Marty Sharp', 'Carp Dean', 'Lance Webb', 'Zach Hill'], s => { s.p101_h2 = 3; s.p104_h9 = 2; })
        ]),
        weekly: [{ code: 'W0', label: 'Monday', countsTowardTrip: true, data: w[0].data },
                 { code: 'W1', label: 'Monday 2', countsTowardTrip: true, data: w[1].data }],
        // Money on BOTH days for the Mike seat (101): Day 1 Mike beats Matt B $50,
        // Day 2 Mike H beats Zach $50 - so one golfer nets +$100 and two people
        // net +$50 each, which is what the answer decides.
        mikes: linked([
            roundOf('Day 1', ['Mike', 'Matt B', 'Lance Webb', 'Zach Hill'], s => { s.p101_h1 = 3; s.p101_h3 = 3; s.p102_h7 = 11; }, SIDE),
            roundOf('Day 2', ['Mike H', 'Matt B.', 'Lance Webb', 'Zach Hill'], s => { s.p101_h2 = 3; s.p101_h5 = 2; s.p101_h9 = 3; s.p104_h7 = 9; }, SIDE2)
        ]),
        sameKey: linked([
            roundOf('Day 1', ['Mike', 'Carp Dean', 'Lance Webb', 'Zach Hill'], s => { s.p101_h1 = 3; s.p101_h3 = 3; s.p102_h7 = 11; }, SIDE),
            roundOf('Day 2', ['Mike', 'Carp Dean', 'Lance Webb', 'Zach Hill'], s => { s.p101_h2 = 3; s.p101_h5 = 2; s.p101_h9 = 3; s.p104_h7 = 9; }, SIDE2)
        ]),
        oneRound: linked([
            roundOf('Day 1', ['Marty Sharp', 'Carp Dean', 'Lance Webb', 'Zach Hill'], s => { s.p101_h1 = 3; s.p102_h7 = 11; }, SIDE)
        ])
    };
}
module.exports = { trips, roundOf, linked, cd18 };
