// ============================================================================
// HardPan — VEGAS (NEW ENGINE, gps-games, 2026-10-11)
//
// Two teams of two. On each hole a team's two GROSS scores make a two-digit
// number, low score first (4 and 5 -> 45). The lower number wins the hole by
// the difference, in points. $ per point.
//
// RULES AS BUILT (the open questions are in the report; each is one switch here):
//   - A score of 10 or more goes FIRST: 4 and 10 -> 104 (not 410).
//   - Birdie flip (option, vegasBirdieFlip): a birdie or better by either player
//     on a team flips the OTHER team's number, high score first (45 -> 54).
//     Both teams birdie: nothing flips.
//   - A hole counts only once all four scores are in.
//   - Gross scores, no handicap strokes.
//   - Money: each golfer on the winning side wins (points x $); each golfer on
//     the losing side pays it. Partner pays partner's opposite: A1 -> B1, A2 -> B2.
//
// WORKED EXAMPLES (vegas_engine_test.js pins both):
//   1. $1/pt, par 4. Team A 4 + 5 = 45, Team B 5 + 6 = 56. A wins 11 points.
//      Over the round only that hole: A1 +$11, A2 +$11, B1 -$11, B2 -$11.
//   2. $0.50/pt, birdie flip on, par 4. Team A 3 + 6 (a birdie) = 36;
//      Team B 5 + 4 = 45, flipped by A's birdie -> 54. A wins 54 - 36 = 18 points.
//      Next hole, par 5: A 5 + 6 = 56, B 4 + 7 (B's birdie) = 47, A flipped -> 65:
//      B wins 65 - 47 = 18. Round: level, every golfer $0.
//
// STORAGE (read only here): events/<round>/additionalGameInstances/<id> =
//   { format: 'vegas', enabled, vegasTeamA: [id, id], vegasTeamB: [id, id],
//     participantIds: [all four], vegasPointVal: $, vegasBirdieFlip: bool }
// Older apps skip a format they do not know (action-model.js getRoundGames).
//
// Pure: no Firebase, no DOM. Touches no other engine.
// ============================================================================
(function (root) {
    'use strict';

    function cents(x) { return Math.round(x * 100) / 100; }

    // Two scores -> the team's number. flip: high score first.
    function vegasNumber(a, b, flip) {
        var lo = Math.min(a, b), hi = Math.max(a, b);
        // A 10+ always leads: "4 and 10" is 104 whichever way it is read.
        var first = hi >= 10 ? hi : (flip ? hi : lo), second = first === hi ? lo : hi;
        return Number(String(first) + String(second));
    }

    function teamOk(t) { return Array.isArray(t) && t.length === 2 && t[0] != null && t[1] != null && String(t[0]) !== String(t[1]); }

    function vegasValid(cfg) {
        if (!cfg || !teamOk(cfg.vegasTeamA) || !teamOk(cfg.vegasTeamB)) return false;
        var all = cfg.vegasTeamA.concat(cfg.vegasTeamB).map(String);
        return all.filter(function (id, i) { return all.indexOf(id) === i; }).length === 4;
    }

    // { valid, perPoint, holes: [{ hole, par, a, b, flipA, flipB, winner: 'A'|'B'|null, points }],
    //   pointsA (signed: + when A is ahead), net: { id: $ }, payments }
    function calculateVegas(cfg, courseData, scores) {
        var out = { valid: vegasValid(cfg), perPoint: Math.max(0, Number(cfg && cfg.vegasPointVal) || 0), holes: [], pointsA: 0, net: {}, payments: [] };
        if (!out.valid) return out;
        var A = cfg.vegasTeamA.map(String), B = cfg.vegasTeamB.map(String);
        var flipOn = !!cfg.vegasBirdieFlip, start = Number(cfg.startHole) || 1;
        var sc = scores || {};
        var get = function (id, h) { var v = parseInt(sc['p' + id + '_h' + h], 10); return v > 0 ? v : null; };
        (courseData || []).forEach(function (hd, i) {
            var h = hd && hd.hole != null ? Number(hd.hole) : i + 1;
            if (h < start) return;
            var par = hd && Number(hd.par);
            var a = A.map(function (id) { return get(id, h); }), b = B.map(function (id) { return get(id, h); });
            if (a.concat(b).some(function (v) { return v == null; })) return;
            var birdie = function (s) { return par > 0 && s.some(function (v) { return v <= par - 1; }); };
            var bA = flipOn && birdie(a), bB = flipOn && birdie(b);
            var flipB = bA && !bB, flipA = bB && !bA;
            var nA = vegasNumber(a[0], a[1], flipA), nB = vegasNumber(b[0], b[1], flipB);
            var row = { hole: h, par: par || null, a: nA, b: nB, flipA: flipA, flipB: flipB, winner: null, points: 0 };
            if (nA !== nB) { row.winner = nA < nB ? 'A' : 'B'; row.points = Math.abs(nA - nB); }
            out.pointsA += row.winner === 'A' ? row.points : (row.winner === 'B' ? -row.points : 0);
            out.holes.push(row);
        });
        var each = cents(out.pointsA * out.perPoint);
        A.forEach(function (id) { out.net[id] = each || 0; });
        B.forEach(function (id) { out.net[id] = -each || 0; });
        if (each > 0) out.payments = [{ from: B[0], to: A[0], amount: each }, { from: B[1], to: A[1], amount: each }];
        else if (each < 0) out.payments = [{ from: A[0], to: B[0], amount: -each }, { from: A[1], to: B[1], amount: -each }];
        return out;
    }

    var api = { vegasNumber: vegasNumber, vegasValid: vegasValid, calculateVegas: calculateVegas };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.HardPanVegas = api;
})(typeof window !== 'undefined' ? window : this);
