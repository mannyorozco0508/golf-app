// The event as it must END in the database if every phone, the Desk and the turn-in did their job: the truth cards
// (fixture.cards) for every golfer, minus what a withdrawn golfer never posted, plus the late add, the withdrawal,
// the contest entries in the order the schedule makes them. The browser run reads the emulator and compares to this.
'use strict';
const F = require('./fixture.js');

// group N plays hole H at step ((H - N + 18) % 18) + 1
const stepOf = (groupNum, hole) => ((hole - groupNum + 18) % 18) + 1;

function finalState() {
    const b = F.build();
    const rec = JSON.parse(JSON.stringify(b.record));
    const late = F.LATE;
    const lp = b.players.find((p) => p.id === late.pid);
    rec.players[late.pid] = { id: late.pid, name: late.name, handicap: late.handicap, flightId: late.flightId, addedAt: 5000 };
    rec.scoringGroups[late.group].playerIds = rec.scoringGroups[late.group].playerIds.concat([late.pid]);
    rec.players[F.WITHDRAW.pid].status = 'withdrawn';
    const posted = {};
    Object.keys(rec.players).forEach((pid) => {
        const card = b.cards[pid];
        const gid = Object.keys(rec.scoringGroups).find((g) => rec.scoringGroups[g].playerIds.indexOf(pid) !== -1);
        const n = Number(gid.slice(1));
        posted[pid] = {};
        F.COURSE.forEach((h) => {
            if (pid === F.WITHDRAW.pid && stepOf(n, h.hole) > F.WITHDRAW.afterHoles) return;
            posted[pid][h.hole] = card[h.hole - 1];
        });
    });
    // contest entries, in the order they are made (the step, then the order listed within a step)
    const groupOf = (pid) => Number(Object.keys(rec.scoringGroups).find((g) => rec.scoringGroups[g].playerIds.indexOf(pid) !== -1).slice(1));
    const entries = {};
    Object.keys(F.CONTEST_ENTRIES).forEach((hole) => {
        entries[hole] = F.CONTEST_ENTRIES[hole].map((e, i) => {
            const step = stepOf(groupOf(e[0]), Number(hole));
            const o = { pid: e[0], order: step * 100 + i, step };
            if (e.length === 3) o.inches = e[1] * 12 + e[2]; else o.yards = e[1];
            return o;
        });
    });
    return { b, rec, posted, entries, stepOf, groupOf };
}

function keyInput(s, posted) {
    const flights = {}; Object.keys(s.rec.flights).forEach((f) => { flights[f] = s.rec.flights[f].name; });
    return { course: F.COURSE, players: s.rec.players, posted: posted || s.posted, flights, spots: F.PAYOUT_SPOTS, carryover: true,
        perSkin: F.PER_SKIN, perContest: F.PER_CONTEST, contestDefs: s.rec.contests, contestEntries: s.entries };
}

module.exports = { finalState, keyInput, stepOf };
