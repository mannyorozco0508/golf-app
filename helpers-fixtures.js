// Shared, deterministic test fixtures — used across every test file so the
// same course/player shapes don't get hand-rolled slightly differently in
// each suite.

function makeCourseData(numHoles = 18) {
    const pars = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
    const hcpOrder = [7, 13, 17, 1, 9, 3, 15, 5, 11, 8, 14, 18, 2, 10, 4, 16, 6, 12];
    let cd = [];
    for (let h = 1; h <= numHoles; h++) {
        cd.push({ hole: h, par: pars[(h - 1) % pars.length], hcpIndex: hcpOrder[(h - 1) % hcpOrder.length] });
    }
    return cd;
}

// WARNING: if you need players from more than one makePlayers() call in the same test
// (e.g. building two "teams" separately before merging), you MUST pass a distinct
// `startId` to each call — otherwise both calls restart at id 101 and their score keys
// (p101_hN) will silently collide and overwrite each other. This exact mistake broke a
// real test during development (see side-matches.test.js's git history / test comments).
// The safe pattern is almost always ONE makePlayers() call with everyone in it, then
// assign teams/squads afterward if needed.
function makePlayers(names, hcps, startId = 101) {
    return names.map((name, i) => ({
        id: startId + i, name, hcp: String(hcps ? (hcps[i] || 0) : 0),
        team: i % 2 === 0 ? 'Team 1' : 'Team 2', squad: i % 2 === 0 ? 'red' : 'blue',
        playingForMoney: true
    }));
}

// Distributes `total` gross strokes across `holes` holes (default 18), front-loading
// any remainder so the exact total is hit — used to build realistic score lines
// without hand-typing 18 numbers per player in every test.
function genScores(total, holes = 18) {
    const base = Math.floor(total / holes);
    let arr = Array(holes).fill(base);
    let remainder = total - base * holes;
    for (let i = 0; i < holes && remainder > 0; i++) { arr[i]++; remainder--; }
    return arr;
}

// Builds a savedScores map (p{id}_h{hole}) from a { playerName: totalGrossScore } map,
// generating an even score distribution across all of courseData's holes.
function buildScores(players, courseData, totalsByName, holesPlayed) {
    let scores = {};
    players.forEach(p => {
        if (!(p.name in totalsByName)) return;
        const arr = genScores(totalsByName[p.name], holesPlayed || courseData.length);
        const n = holesPlayed || courseData.length;
        for (let i = 0; i < n; i++) {
            scores[`p${p.id}_h${courseData[i].hole}`] = arr[i];
        }
    });
    return scores;
}

module.exports = { makeCourseData, makePlayers, genScores, buildScores };
