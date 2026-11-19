// ============================================================================
// FULL-EVENT SIMULATION: THE ANSWER KEY, computed independently. It shares NO code with tournament-engine.js, skins.js,
// tournament-contests.js, tournament-prizes.js or payouts.js: every rule below is written from the rule as stated (the
// engines' header comments and the product decisions), so a mistake in an engine cannot also be a mistake here.
//
// THE RULES, as stated:
//   net        strokes received per hole by stroke index: floor(h / 18) + (SI <= h % 18); a plus handicap gives one back
//              on the (plus) easiest holes (SI > 18 - plus). Net counts strokes on the holes actually played.
//   board      every golfer not withdrawn, with at least one posted hole; to par = net - par of the holes played.
//              Competition ranking: equal to-par share a place, the next place skips (1, T2, T2, 4).
//   places     per flight, the spots [100, 60, 40]: a tied group takes the spots it occupies and splits them evenly;
//              a tie across the last paid spot splits only what falls inside the paid range.
//   skins      gross; entrants = golfers not withdrawn with at least one posted score; a hole counts once EVERY entrant
//              has posted it; the unique low score wins it; a tie carries (carryover on) to the next hole won outright;
//              a hole somebody has not posted stops the count there (it and everything after wait).
//   contests   KP shortest distance, long drive longest; a tie keeps the earlier entry; a withdrawn golfer is out.
// ============================================================================
'use strict';

function strokesOn(handicap, si) {
    const t = String(handicap === undefined || handicap === null ? '' : handicap).trim();
    const n = t.startsWith('+') ? -Math.abs(parseFloat(t.slice(1))) : (parseFloat(t) || 0);
    if (n >= 0) return Math.floor(n / 18) + (si <= n % 18 ? 1 : 0);
    return si > 18 - Math.abs(n) ? -1 : 0;
}

// posted: { <pid>: { <hole>: gross } } - only what is on the server now.
// players: { <pid>: { name, handicap, flightId, status? } }
function board(course, players, posted) {
    const rows = [];
    Object.keys(players).forEach((pid) => {
        const p = players[pid];
        if (p.status === 'withdrawn') return;
        const card = posted[pid] || {};
        let gross = 0, thru = 0, parPlayed = 0, recv = 0;
        course.forEach((h) => {
            const v = card[h.hole];
            if (!(v >= 1 && v <= 30)) return;
            gross += v; thru++; parPlayed += h.par; recv += strokesOn(p.handicap, h.hcpIndex);
        });
        if (!thru) return;
        rows.push({ pid, name: p.name, flightId: p.flightId || null, gross, thru, net: gross - recv, toPar: gross - recv - parPlayed });
    });
    return rows;
}
function ranked(rows) {
    const r = rows.slice().sort((a, b) => a.toPar - b.toPar || a.pid.localeCompare(b.pid));
    let place = 0;
    r.forEach((row, i) => { place = (i > 0 && r[i - 1].toPar === row.toPar) ? r[i - 1].place : i + 1; row.place = place; });
    r.forEach((row) => { row.label = (r.filter((x) => x.place === row.place).length > 1 ? 'T' : '') + row.place; });
    return r;
}
function places(rows, spots) {
    const out = [];
    const byPlace = {};
    rows.forEach((r) => { (byPlace[r.place] = byPlace[r.place] || []).push(r); });
    Object.keys(byPlace).map(Number).sort((a, b) => a - b).forEach((place) => {
        const grp = byPlace[place];
        let sum = 0;
        for (let pos = place; pos < place + grp.length; pos++) if (pos <= spots.length) sum += spots[pos - 1];
        if (sum > 0) grp.forEach((r) => out.push({ pid: r.pid, name: r.name, place, label: r.label, amount: sum / grp.length }));
    });
    return out;
}
function skins(course, players, posted, carryover) {
    const entrants = Object.keys(players).filter((pid) => players[pid].status !== 'withdrawn' && Object.keys(posted[pid] || {}).length > 0);
    const holes = course.map((h) => h.hole).sort((a, b) => a - b);
    const won = [];
    let carry = 0, stopped = false, tied = [], pending = [];
    holes.forEach((hole) => {
        if (stopped) { pending.push(hole); return; }
        const scores = entrants.map((pid) => [pid, (posted[pid] || {})[hole]]);
        if (scores.some(([, v]) => !(v >= 1 && v <= 30))) { pending.push(hole); if (carryover) stopped = true; return; }
        const low = Math.min(...scores.map(([, v]) => v));
        const at = scores.filter(([, v]) => v === low);
        if (at.length === 1) { won.push({ hole, pid: at[0][0], score: low, skins: 1 + carry, carriedIn: carry }); carry = 0; }
        else { tied.push(hole); if (carryover) carry++; }
    });
    return { entrants: entrants.length, won, tied, pending, carriedNotWon: carry };
}
function contests(defs, entries, players) {
    const out = {};
    Object.keys(defs).forEach((key) => {
        const hole = Number(key.replace('h', ''));
        const kind = defs[key].kind;
        const list = (entries[hole] || []).filter((e) => (players[e.pid] || {}).status !== 'withdrawn');
        const value = (e) => (kind === 'ld' ? e.yards : e.inches);
        const best = list.slice().sort((a, b) => (kind === 'ld' ? value(b) - value(a) : value(a) - value(b)) || a.order - b.order)[0];
        out[hole] = best ? { hole, kind, pid: best.pid, value: value(best) } : { hole, kind, pid: null };
    });
    return out;
}

// THE WHOLE KEY for a state of the event.
function compute(o) {
    const rows = board(o.course, o.players, o.posted);
    const field = ranked(rows);
    const flights = {};
    Object.keys(o.flights).forEach((fid) => { flights[fid] = ranked(rows.filter((r) => r.flightId === fid).map((r) => Object.assign({}, r))); });
    const prizePlaces = {};
    Object.keys(flights).forEach((fid) => { prizePlaces[fid] = places(flights[fid], o.spots); });
    const sk = skins(o.course, o.players, o.posted, o.carryover);
    const ct = contests(o.contestDefs, o.contestEntries, o.players);
    const totals = {};
    const add = (pid, amt, why) => { if (!pid) return; const t = totals[pid] = totals[pid] || { pid, name: o.players[pid].name, amount: 0, lines: [] }; t.amount += amt; t.lines.push(why); };
    Object.keys(prizePlaces).forEach((fid) => prizePlaces[fid].forEach((p) => add(p.pid, p.amount, o.flights[fid] + ' ' + p.label)));
    sk.won.forEach((w) => add(w.pid, w.skins * o.perSkin, 'skin ' + w.hole + (w.skins > 1 ? ' x' + w.skins : '')));
    Object.keys(ct).forEach((h) => add(ct[h].pid, o.perContest, (ct[h].kind === 'kp' ? 'KP ' : 'LD ') + h));
    return { field, flights, prizePlaces, skins: sk, contests: ct, totals };
}

module.exports = { compute, strokesOn, board, ranked, places, skins, contests };
