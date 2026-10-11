// ============================================================================
// HardPan — BINGO BANGO BONGO (NEW ENGINE, gps-games, 2026-10-11)
//
// Three points on every hole:
//   Bingo  first ball on the green
//   Bango  closest to the pin once every ball is on the green
//   Bongo  first to hole out
// The scorekeeper taps who won each one; a point nobody won (or nobody tapped)
// is simply not awarded. Any group size, no handicaps.
//
// MONEY: $ per point, settled at the end, every golfer against every other:
// for each pair, the one with more points takes (difference x $). Summed, that is
//     net(i) = $ x (N x points(i) - total points)        N = golfers in the game
// which is zero-sum by construction.
//
// WORKED EXAMPLES (bbb_engine_test.js pins both):
//   1. $1/pt, 3 golfers, points A 10, B 5, C 3 (total 18):
//      A = 1 x (3x10 - 18) = +12, B = 1 x (15 - 18) = -3, C = 1 x (9 - 18) = -9.
//      Pairwise check: A-B 5, A-C 7, B-C 2 -> A +12, B -5+2 = -3, C -7-2 = -9.
//      Payments: C pays A $9, B pays A $3.
//   2. $2/pt, 4 golfers, points A 6, B 6, C 4, D 2 (total 18):
//      A = 2 x (24 - 18) = +12, B = +12, C = 2 x (16 - 18) = -4, D = 2 x (8 - 18) = -20.
//      Payments: D pays A $12, D pays B $8, C pays B $4.
//
// STORAGE (read only here): events/<round>/additionalGameInstances/<id> =
//   { format: 'bbb', enabled, participantIds: [ids], bbbPointVal: $,
//     points: { h1: { bingo: id, bango: id, bongo: id }, ... } }
// Older apps skip a format they do not know (action-model.js getRoundGames), so
// this game is invisible to them and changes nothing they settle.
//
// Pure: no Firebase, no DOM. Touches no other engine.
// ============================================================================
(function (root) {
    'use strict';

    var KINDS = ['bingo', 'bango', 'bongo'];

    function cents(x) { return Math.round(x * 100) / 100; }

    // The golfers in this game, in the round's order: participantIds when the game
    // names them, else the whole round.
    function bbbPlayers(cfg, roundPlayers) {
        var all = (roundPlayers || []).filter(Boolean);
        var ids = cfg && Array.isArray(cfg.participantIds) ? cfg.participantIds.map(String) : null;
        return ids ? all.filter(function (p) { return ids.indexOf(String(p.id)) !== -1; }) : all;
    }

    // { players, perPoint, points: { id: n }, holes: { n: { bingo, bango, bongo } },
    //   holesPlayed, totalPoints, net: { id: $ }, payments: [{ from, to, amount }] }
    function calculateBBB(cfg, roundPlayers) {
        var players = bbbPlayers(cfg, roundPlayers);
        var ids = players.map(function (p) { return String(p.id); });
        var perPoint = Math.max(0, Number(cfg && cfg.bbbPointVal) || 0);
        var pts = {}, holes = {}, total = 0, played = 0;
        ids.forEach(function (id) { pts[id] = 0; });
        var raw = (cfg && cfg.points) || {};
        Object.keys(raw).forEach(function (k) {
            var m = /^h(\d+)$/.exec(k);
            if (!m || !raw[k]) return;
            var h = {}, any = false;
            KINDS.forEach(function (kind) {
                var who = raw[k][kind];
                if (who == null || ids.indexOf(String(who)) === -1) return;   // not tapped, or not in this game
                h[kind] = String(who);
                pts[String(who)]++;
                total++;
                any = true;
            });
            if (any) { holes[Number(m[1])] = h; played++; }
        });
        var n = ids.length, net = {};
        ids.forEach(function (id) { net[id] = n > 1 ? cents(perPoint * (n * pts[id] - total)) : 0; });
        return { players: players, perPoint: perPoint, points: pts, holes: holes, holesPlayed: played,
            totalPoints: total, net: net, payments: settleNets(net, ids) };
    }

    // Fewest payments that square the nets: the biggest loser pays the biggest
    // winner, repeat. Ties keep the round's player order.
    function settleNets(net, order) {
        var ids = order || Object.keys(net);
        var win = ids.filter(function (id) { return net[id] > 0.004; }).map(function (id) { return { id: id, v: net[id] }; });
        var lose = ids.filter(function (id) { return net[id] < -0.004; }).map(function (id) { return { id: id, v: -net[id] }; });
        var by = function (a, b) { return b.v - a.v || ids.indexOf(a.id) - ids.indexOf(b.id); };
        var out = [];
        win.sort(by); lose.sort(by);
        var i = 0, j = 0;
        while (i < lose.length && j < win.length) {
            var amt = cents(Math.min(lose[i].v, win[j].v));
            if (amt > 0) out.push({ from: lose[i].id, to: win[j].id, amount: amt });
            lose[i].v = cents(lose[i].v - amt); win[j].v = cents(win[j].v - amt);
            if (lose[i].v <= 0.004) i++;
            if (win[j].v <= 0.004) j++;
        }
        return out;
    }

    var api = { BBB_KINDS: KINDS, bbbPlayers: bbbPlayers, calculateBBB: calculateBBB, settleNets: settleNets };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.HardPanBBB = api;
})(typeof window !== 'undefined' ? window : this);
