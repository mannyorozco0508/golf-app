// ============================================================================
// THE INDEPENDENT ARITHMETIC (URGENT-008, overnight sims).
//
// Written from the RULES, not by calling the app: no engine is loaded here and
// nothing in money-engine / settlement-engine / pool-engine is required. What a
// simulation compares the app's screens against:
//
//   strokesOn(si, hcp)      net strokes on a hole of stroke index si
//                           ("+2.0" gives a stroke BACK on the two easiest holes)
//   card(players, holes, scores)      gross / net / to-par per golfer
//   weekly(event, scores)   the Weekly Game (KP / net places / skins bucket),
//                           whole-dollar, per flight when the round says so
//   skinsWager(event, scores)          the stacked Skins game
//
// Rules, as documented for the organizer (Money step, Players step, Help):
//   - skins: lowest score on a hole wins it outright; a tie is no skin, or with
//     carry the hole's unit rides to the next decided hole; unwon money comes back
//     to the field in equal shares
//   - Weekly Game: everyone pays the buy-in; KP money split evenly over the KP
//     holes (whole dollars, the odd dollar to the earliest hole); net money paid
//     by place, ties share the places they cover; skins take the rest; flights
//     split the skins money (even: B gets half rounded down; headcount: by size)
//   - whole dollars: largest remainder, ties to the earlier position
// ============================================================================
'use strict';

function hcpNum(h) {
    const s = String(h == null ? '' : h).trim();
    if (!s) return 0;
    if (s[0] === '+') return -(parseFloat(s.slice(1)) || 0);
    const v = parseFloat(s);
    return isFinite(v) ? v : 0;
}
function strokesOn(si, hcp) {
    const h = typeof hcp === 'number' ? hcp : hcpNum(hcp);
    si = Number(si);
    if (h >= 0) {
        const full = Math.floor(h / 18);
        const rest = h - full * 18;
        return full + (si <= rest ? 1 : 0);
    }
    const plus = -h;
    // A plus golfer gives strokes back, the easiest hole (SI 18) first.
    const fullBack = Math.floor(plus / 18);
    const restBack = plus - fullBack * 18;
    return -(fullBack + (si > 18 - restBack ? 1 : 0));
}
const sc = (scores, pid, hole) => { const v = scores[`p${pid}_h${hole}`]; return v && Number(v) > 0 ? Number(v) : null; };

function card(players, holes, scores) {
    const out = {};
    players.forEach((p) => {
        let gross = 0, net = 0, par = 0, played = 0;
        holes.forEach((h) => {
            const g = sc(scores, p.id, h.hole);
            if (g == null) return;
            gross += g; net += g - strokesOn(h.hcpIndex, p.hcp); par += Number(h.par); played++;
        });
        out[p.id] = { name: p.name, gross, net, toPar: net - par, played };
    });
    return out;
}
function toParText(n) { return n === 0 ? 'E' : (n > 0 ? '+' + n : String(n)); }

// Largest remainder in whole dollars; ties go to the earlier position.
function wholeDollars(total, weights) {
    const sumW = weights.reduce((a, w) => a + w, 0);
    if (!weights.length || sumW <= 0) return weights.map(() => 0);
    const rows = weights.map((w, i) => { const ex = total * w / sumW; return { i, b: Math.floor(ex + 1e-9), f: ex - Math.floor(ex + 1e-9) }; });
    let left = total - rows.reduce((a, r) => a + r.b, 0);
    rows.slice().sort((a, b) => (b.f - a.f) || (a.i - b.i)).forEach((r) => { if (left > 0) { r.b++; left--; } });
    return rows.map((r) => r.b);
}

// One skins pass over the holes (in the order given). Returns [{hole, pid, units}], pending.
function skinsPass(players, holes, scores, key, carry) {
    const won = []; let units = 1;
    holes.forEach((h) => {
        const rows = players.map((p) => { const g = sc(scores, p.id, h.hole); return g == null ? null : { pid: String(p.id), v: key === 'gross' ? g : g - strokesOn(h.hcpIndex, p.hcp) }; }).filter(Boolean);
        if (!rows.length) return;
        const min = Math.min(...rows.map((r) => r.v));
        const at = rows.filter((r) => r.v === min);
        if (at.length === 1) { won.push({ hole: h.hole, pid: at[0].pid, units: carry ? units : 1 }); units = 1; }
        else if (carry) units++;
    });
    return { won, pending: carry && units > 1 ? units - 1 : 0 };
}

function moneyField(ev) { return (ev.players || []).filter((p) => p.playingForMoney !== false); }
function flightOf(p) { return p.flight === 'B' ? 'B' : 'A'; }

// THE WEEKLY GAME, whole dollars. Returns { perPlayer: {pid: dollars}, held, notes }.
function weekly(ev, scores) {
    const pool = ev.moneyPool;
    if (!pool || !pool.enabled) return null;
    const field = (Array.isArray(pool.participantIds) && pool.participantIds.length)
        ? (ev.players || []).filter((p) => pool.participantIds.map(String).includes(String(p.id))) : moneyField(ev);
    const ids = field.map((p) => String(p.id));
    const buyIn = Number(pool.buyIn) || 0;
    const pot = buyIn * field.length;
    const per = {}; ids.forEach((id) => { per[id] = -buyIn; });
    // Holes IN THE ORDER PLAYED (from the round's first tee): a carried skin rides to the
    // next hole played, so on a round off the 10th the 18th carries to the 1st.
    const cd0 = (ev.courseData || []).slice().sort((a, b) => a.hole - b.hole);
    const st0 = Number(ev.startingHole || (cd0[0] && cd0[0].hole) || 1);
    const i0 = Math.max(0, cd0.findIndex((h) => Number(h.hole) === st0));
    const holes = cd0.slice(i0).concat(cd0.slice(0, i0));
    let refund = 0, held = 0;
    const notes = [];
    // KP
    let kpTotal = 0, kpToSkins = 0;
    const kp = pool.kp && Number(pool.kp.amount) > 0 && !(ev.kpCancelled && ev.kpCancelled.cancelled === true) ? pool.kp : null;
    const skinsOn = pool.skins && (pool.skins.mode === 'remainder' || (pool.skins.mode === 'fixed' && Number(pool.skins.amount) > 0));
    if (kp) {
        kpTotal = Math.round(Number(kp.amount));
        const kh = (kp.holes || []).map(Number).sort((a, b) => a - b);
        const shares = wholeDollars(kpTotal, kh.map(() => 1));
        kh.forEach((h, i) => {
            const w = (ev.kpWinners || {})['h' + h];
            const nobody = (ev.kpNoWinner || {})['h' + h] === true;
            if (w && ids.includes(String(w))) per[String(w)] += shares[i];
            else if (nobody && skinsOn) kpToSkins += shares[i];
            else { held += shares[i]; notes.push('KP h' + h + ' held'); }
        });
    }
    // NET PLACES (field-wide)
    let netTotal = 0;
    const net = pool.net;
    if (net) {
        let placeD;
        if (net.payoutMode === 'custom' && Array.isArray(net.amounts)) {
            const a = net.amounts.map(Number).filter((x) => isFinite(x) && x > 0);
            netTotal = a.reduce((s, x) => s + x, 0); placeD = wholeDollars(Math.round(netTotal), a);
        } else {
            netTotal = Number(net.amount) || 0; placeD = netTotal > 0 ? wholeDollars(Math.round(netTotal), (net.places || []).map(Number)) : [];
        }
        if (netTotal > 0) {
            const st = field.map((p) => {
                let n = 0, played = 0;
                holes.forEach((h) => { const g = sc(scores, p.id, h.hole); if (g != null) { n += g - strokesOn(h.hcpIndex, p.hcp); played++; } });
                return { id: String(p.id), name: p.name, net: n, played };
            }).filter((s) => s.played > 0).sort((a, b) => a.net - b.net || a.name.localeCompare(b.name));
            let paid = 0, place = 0, i = 0;
            while (i < st.length && place < placeD.length) {
                const tied = st.filter((s) => s.net === st[i].net);
                const money = placeD.slice(place, place + tied.length).reduce((a, b) => a + b, 0);
                if (money > 0) { const sh = wholeDollars(money, tied.map(() => 1)); tied.forEach((s, j) => { per[s.id] += sh[j]; }); paid += money; }
                i += tied.length; place += tied.length;
            }
            refund += Math.round(netTotal) - paid;
        }
    }
    // SKINS BUCKET
    const sk = pool.skins || { mode: 'none' };
    if (sk.mode === 'remainder' || sk.mode === 'fixed') {
        const amount = (sk.mode === 'fixed' ? Math.round(Number(sk.amount)) : pot - kpTotal - Math.round(netTotal)) + kpToSkins;
        const key = sk.scoring === 'gross' ? 'gross' : 'net';
        const carry = sk.carryOver === true;
        const perFlight = ev.flights && ev.flights.enabled === true && (ev.flights.scopes || {}).skins === 'flight';
        const slices = perFlight ? ['A', 'B'].map((f) => field.filter((p) => flightOf(p) === f)) : [field];
        let amounts;
        if (perFlight) {
            const nA = slices[0].length, nB = slices[1].length, n = nA + nB;
            const even = ev.flights.skinsSplit === 'even' && nA > 0 && nB > 0;
            const b = even ? Math.floor(amount / 2) : (n > 0 ? Math.floor(amount * nB / n) : 0);
            amounts = [amount - b, b];
        } else amounts = [amount];
        slices.forEach((pl, si) => {
            const r = skinsPass(pl, holes, scores, key, carry);
            // the odd dollar goes to the earliest HOLE (by number), as the Weekly Game says
            r.won.sort((a, b) => a.hole - b.hole);
            const totalU = r.won.reduce((a, w) => a + w.units, 0) + r.pending;
            let paid = 0;
            if (totalU > 0 && r.won.length && amounts[si] > 0) {
                const wts = r.won.map((w) => w.units); if (r.pending > 0) wts.push(r.pending);
                const al = wholeDollars(amounts[si], wts);
                r.won.forEach((w, k) => { per[w.pid] += al[k]; paid += al[k]; });
            }
            refund += amounts[si] - paid;
        });
    }
    if (refund > 0) { const sh = wholeDollars(refund, ids.map(() => 1)); ids.forEach((id, i) => { per[id] += sh[i]; }); }
    return { perPlayer: per, held, notes, pot };
}

// THE STACKED SKINS GAME (a buy-in per golfer; gross / net / split pot; carry or not).
// cfg: { buyIn, mode: 'split'|'gross'|'net', carry, order: holes in play order }
function skinsWager(ev, scores, cfg) {
    const field = moneyField(ev);
    const perFlight = ev.flights && ev.flights.enabled === true && (ev.flights.scopes || {}).skins === 'flight';
    const slices = perFlight ? ['A', 'B'].map((f) => field.filter((p) => flightOf(p) === f)) : [field];
    const per = {}; field.forEach((p) => { per[String(p.id)] = 0; });
    const holes = cfg.order || ev.courseData || [];
    const b = Number(cfg.buyIn) || 0;
    slices.forEach((pl) => {
        if (!pl.length) return;
        const halves = cfg.mode === 'split' ? [['gross', cfg.carry ? b / 2 : Math.ceil(b / 2)], ['net', cfg.carry ? b / 2 : Math.floor(b / 2)]]
            : [[cfg.mode === 'gross' ? 'gross' : 'net', b]];
        halves.forEach(([key, each]) => {
            const r = skinsPass(pl, holes, scores, key, cfg.carry);
            if (!r.won.length) return;                       // no skin: nobody pays
            const pot = each * pl.length;
            if (!cfg.carry) {
                // whole dollars: the odd dollars to the earliest skins
                const base = Math.floor(pot / r.won.length); let extra = pot - base * r.won.length;
                r.won.forEach((w) => { per[w.pid] += base + (extra > 0 ? 1 : 0); if (extra > 0) extra--; });
                pl.forEach((p) => { per[String(p.id)] -= each; });
            } else {
                const v = pot / holes.length;
                r.won.forEach((w) => { per[w.pid] += w.units * v; });
                if (r.pending) pl.forEach((p) => { per[String(p.id)] += r.pending * v / pl.length; });
                pl.forEach((p) => { per[String(p.id)] -= each; });
            }
        });
    });
    return { perPlayer: per };
}

// The receipt's whole-dollar nets (its stated convention, mirrored): each rounded, then
// a dollar at a time moved until they sum to target - whoever gained most from rounding
// gives it back (or lost most gets it), ties by name; never past 0 / the exact's floor-ceil.
function roundNets(exact, target, names) {
    const rows = Object.keys(exact).map((k) => ({ k, name: (names && names[k]) || k, exact: exact[k], r: Math.round(exact[k]) }));
    rows.forEach((x) => { x.drift = x.r - x.exact; });
    let total = rows.reduce((a, x) => a + x.r, 0) - Math.round(target || 0);
    let guard = Math.abs(total) + rows.length + 10;
    while (Math.abs(total) > 0.0001 && guard-- > 0) {
        const take = total > 0;
        const c = rows.filter((x) => take ? x.r - 1 >= Math.min(0, Math.floor(x.exact)) : x.r + 1 <= Math.max(0, Math.ceil(x.exact)));
        const pool = c.length ? c : rows;
        pool.sort((a, b) => take ? (b.drift - a.drift) || a.name.localeCompare(b.name) : (a.drift - b.drift) || a.name.localeCompare(b.name));
        pool[0].r += take ? -1 : 1; pool[0].drift = pool[0].r - pool[0].exact; total += take ? -1 : 1;
    }
    const out = {}; rows.forEach((x) => { out[x.k] = x.r; }); return out;
}

// DOTS: each dot is a unit (an eagle 2 and it replaces a birdie on the same hole; a snake -1);
// everyone pays the dot's earner: value x (n x mine - all units). Greenies carry only when
// the round says so (not modelled here: the sims leave greenie carry off).
function dots(ev, value) {
    const field = moneyField(ev);
    const units = {}; field.forEach((p) => { units[String(p.id)] = 0; });
    Object.keys(ev.dots || {}).forEach((hk) => {
        const byP = ev.dots[hk] || {};
        Object.keys(byP).forEach((pk) => {
            const id = pk.replace(/^p/, '');
            if (!(id in units)) return;
            let list = Array.isArray(byP[pk]) ? byP[pk].slice() : [];
            if (list.includes('eagle') && list.includes('birdie')) list = list.filter((d) => d !== 'birdie');
            list.forEach((d) => { units[id] += d === 'snake' ? -1 : (d === 'eagle' ? 2 : 1); });
        });
    });
    const n = field.length, sum = Object.values(units).reduce((a, b) => a + b, 0);
    const per = {}; Object.keys(units).forEach((id) => { per[id] = value * (n * units[id] - sum); });
    return { perPlayer: per, units };
}

module.exports = { dots, hcpNum, strokesOn, card, toParText, wholeDollars, skinsPass, weekly, skinsWager, roundNets };
