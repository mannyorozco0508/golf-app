// ============================================================================
// THE PLANNED STARKEY SETTINGS, AS A MODEL (Manny 2026-11-19: "plan organizer settings to match Starkey exactly ...
// Re-run the 4 Starkey replays against the plan"). PLAN ONLY: no page loads this file and nothing is built. It is
// the arithmetic the plan proposes, written once so the replays can test the plan before any page is changed.
// Where the app already has the rule, the app's own code is used (rankRows, allocatePlacePayouts via engines()).
//
// THE SETTINGS IT MODELS (see outbox TOURN-...-starkey-settings-PLAN.md):
//   prize table   { id, basis: 'gross'|'net', scope: 'total'|'r1'|'r2', flight?, spots: [..] }
//   tieRule       'split'  tied golfers share the money of the places they fill (today's rule)
//                 'full'   each tied golfer gets the prize of the place they tied for; the places they fill are used up
//   rounding      'cents' (today) | 'dollar-down' (each share rounded down to a whole dollar)
//   onePrize      'off' (today) | 'gross-first' | 'net-first' | 'larger' (the bigger prize; gross on an equal prize)
//   adjustments   [{ table, id, amount, note }]: the organizer's edit of one row before posting, kept with its note
// ============================================================================
'use strict';

function makeRules(E) {
    // rows: [{ id, toPar }]; returns [{ id, toPar, rank, tied, amount }] for the paid rows only
    function table(rows, spots, o) {
        o = o || {};
        const rs = E.rankRows(rows.map((r, i) => ({ playerId: r.id, teamName: r.id, toPar: r.toPar, hasScores: true, num: i + 1 })), (a, b) => a.toPar - b.toPar, (r, p) => r.toPar === p.toPar);
        const count = (rank) => rs.filter((x) => x.rank === rank).length;
        let paid;
        if (o.tieRule === 'full') {
            paid = rs.filter((r) => r.rank <= spots.length).map((r) => ({ id: r.playerId, toPar: r.toPar, rank: r.rank, amount: spots[r.rank - 1] }));
        } else {
            paid = E.allocatePlacePayouts(rs, spots).filter((x) => x.amount > 0).map((x) => ({ id: x.entry.playerId, toPar: x.entry.toPar, rank: x.rank, amount: x.amount }));
        }
        paid.forEach((p) => { p.tied = count(p.rank) > 1; if (o.rounding === 'dollar-down') p.amount = Math.floor(p.amount + 1e-9); });
        return paid;
    }

    // tables: [{ id, basis, rows, spots }]; settings: { tieRule, rounding, onePrize }
    // One prize per golfer: a golfer who places in more than one table keeps one prize (by the setting) and is taken
    // out of the others, which are then paid again without them, until nothing changes.
    function award(tables, s) {
        const out = {}; const excluded = {}; tables.forEach((t) => { excluded[t.id] = new Set(); });
        for (let pass = 0; pass < 20; pass++) {
            tables.forEach((t) => { out[t.id] = table(t.rows.filter((r) => !excluded[t.id].has(r.id)), t.spots, s); });
            if (!s.onePrize || s.onePrize === 'off') break;
            const wins = {};
            tables.forEach((t) => out[t.id].forEach((p) => { (wins[p.id] = wins[p.id] || []).push({ t, amount: p.amount }); }));
            let changed = false;
            Object.keys(wins).forEach((id) => {
                const w = wins[id]; if (w.length < 2) return;
                let keep;
                if (s.onePrize === 'gross-first') keep = w.find((x) => x.t.basis === 'gross') || w[0];
                else if (s.onePrize === 'net-first') keep = w.find((x) => x.t.basis === 'net') || w[0];
                else keep = w.slice().sort((a, b) => (b.amount - a.amount) || ((a.t.basis === 'gross' ? 0 : 1) - (b.t.basis === 'gross' ? 0 : 1)))[0];
                w.forEach((x) => { if (x !== keep) { excluded[x.t.id].add(id); changed = true; } });
            });
            if (!changed) break;
        }
        return out;
    }

    // Skins money: one pool shared by every skin won (gross and net, both rounds), whole dollars down; the remainder
    // is what the organizer keeps or moves (Starkey 2026 moved the missing KPs' money into skins by hand).
    const skinValue = (pool, skins) => (skins ? Math.floor(pool / skins) : 0);

    return { table, award, skinValue };
}
module.exports = { makeRules };
