// ============================================================================
// HARDPAN TOURNAMENTS - SKINS (the prize screen's Skins card, PO build 2026-11-14)
//
// One pure counter: no DOM, no database, no handicap. tournament.html calls it
// for the organizer's Skins card and for the numbers it posts; nothing else
// computes a skin for a tournament. (live-skins.js is the Consumer app's money
// game and is not this.)
//
// INPUT
//   round    { holes: [{ hole, par }], entrants: [{ id, name, owner?, scores: { <hole>: gross } }] }
//            entrantsFromRecord(view) builds `entrants` from the record shape the
//            board already reads: <playerId>_h<N> on a golfer event, team<N>_h<N>
//            on a scramble, team<N>_p<i>_h<N> per golfer on best ball / shamble.
//   options  { carryover: true | false, scoringBasis: 'gross' }
//
// THE RULES
//   1. Holes are taken in hole-number order, 1 to 18, whatever hole a group
//      started on.
//   2. Only entrants with at least one posted score are in the game. A score is
//      a whole number from 1 to 30 (what the database rules accept); anything
//      else is "not posted".
//   3. A hole is decided when every entrant in the game has posted it. The
//      UNIQUE low gross score wins the skin. Two or more on the low score: a tie,
//      nobody wins that hole.
//   4. Carryover ON: a tied hole's skin carries to the next hole. The next hole
//      won outright takes its own skin plus every skin carried into it (one hole
//      carried in = 2 skins). Carryover OFF: a tied hole's skin is simply not won.
//   5. A tie on the LAST hole carries nowhere: that skin, and anything carried
//      into it, is not won by anybody.
//   6. A hole somebody has not posted is PENDING. Carryover OFF: only that hole
//      waits. Carryover ON: that hole and every hole after it wait, because a
//      carry could still change hands there; nothing past it is guessed.
//   7. Net (Starkey settings 8-11, Manny 2026-11-19): scoringBasis 'net' is
//      computed ONLY when every entrant carries strokes: { <hole>: n }, worked
//      out by the caller from the engine's own getStrokes (this file still knows
//      no handicap). A hole's net score is gross minus that hole's strokes.
//      Without strokes, 'net' is refused with a reason, as before, rather than
//      computed on gross scores.
//   8. options.excludeOnHole { <hole>: [ids] }: those entrants still had to post
//      the hole, but are left out of who wins it (one skin per golfer per hole:
//      the gross winner sits out that hole's net skin).
//
// OUTPUT
//   { available, reason, carryover, holes: [row], tally: { <id>: { id, name, owner, skins, holes: [n] } },
//     totals: { holesWon, skins, carried, notWon, pending } }
//   row = { hole, par, status: 'won' | 'tied' | 'pending', winner, name, score,
//           skins, carriedIn, tiedIds, carriesTo, notWon }
//   skins      on a won hole: 1 + carriedIn. 0 otherwise.
//   carriedIn  skins that arrived from earlier tied holes (carryover on).
//   carriesTo  on a tied hole with carryover on: the hole the skin went to.
//   notWon     skins that ended on this hole with nobody winning them.
//
// NO MONEY HERE. The page multiplies skins by the organizer's credit per skin.
// Negative controls for each rule are recorded in tournament_skins_test.js.
// ============================================================================
(function (root) {
    'use strict';

    var SCORE_MIN = 1, SCORE_MAX = 30;
    var NET_REASON = 'Net skins are not built yet: they need each golfer’s handicap strokes on every hole. Skins here are gross.';

    function postedScore(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return (isFinite(n) && n % 1 === 0 && n >= SCORE_MIN && n <= SCORE_MAX) ? n : null;
    }

    function holeList(holes) {
        var seen = {};
        return (holes || []).map(function (h) {
            return { hole: Number(h && h.hole), par: Number(h && h.par) || null };
        }).filter(function (h) {
            if (!(h.hole >= 1 && h.hole % 1 === 0) || seen[h.hole]) return false;
            seen[h.hole] = true;
            return true;
        }).sort(function (a, b) { return a.hole - b.hole; });
    }

    function computeSkins(round, options) {
        var opt = options || {};
        var basis = opt.scoringBasis || 'gross';
        var carryover = opt.carryover !== false;
        var empty = { available: false, reason: null, carryover: carryover, holes: [], tally: {},
            totals: { holesWon: 0, skins: 0, carried: 0, notWon: 0, pending: 0 } };
        if (basis !== 'gross' && basis !== 'net') { empty.reason = NET_REASON; return empty; }

        var holes = holeList(round && round.holes);
        var entrants = ((round && round.entrants) || []).filter(function (e) {
            if (!e || !e.id) return false;
            var s = e.scores || {};
            return Object.keys(s).some(function (k) { return postedScore(s[k]) !== null; });
        });
        if (basis === 'net' && (!entrants.length || entrants.some(function (e) { return !e.strokes || typeof e.strokes !== 'object'; }))) {
            empty.reason = NET_REASON; return empty;
        }
        var exclude = opt.excludeOnHole || {};
        var scoreOf = function (e, hole) {
            var g = postedScore((e.scores || {})[hole]);
            if (g === null || basis !== 'net') return g;
            var k = Number((e.strokes || {})[hole]);
            return g - (isFinite(k) ? k : 0);
        };
        var tally = {};
        entrants.forEach(function (e) {
            tally[e.id] = { id: e.id, name: e.name || '', owner: e.owner || e.id, skins: 0, holes: [] };
        });
        var nameOf = {};
        entrants.forEach(function (e) { nameOf[e.id] = e.name || ''; });

        var rows = [];
        var carry = 0, blocked = false;
        var totals = { holesWon: 0, skins: 0, carried: 0, notWon: 0, pending: 0 };
        holes.forEach(function (h, i) {
            var last = i === holes.length - 1;
            var row = { hole: h.hole, par: h.par, status: 'pending', winner: null, name: '', score: null,
                skins: 0, carriedIn: carryover ? carry : 0, tiedIds: [], carriesTo: null, notWon: 0 };
            var posted = entrants.map(function (e) { return { id: e.id, s: scoreOf(e, h.hole) }; });
            if (blocked || !entrants.length || posted.some(function (p) { return p.s === null; })) {
                if (carryover && entrants.length) blocked = true;
                totals.pending++;
                rows.push(row);
                return;
            }
            var out = exclude[h.hole] || [];
            var inPlay = posted.filter(function (p) { return out.indexOf(p.id) === -1; });
            var low = Math.min.apply(null, inPlay.map(function (p) { return p.s; }));
            var atLow = inPlay.filter(function (p) { return p.s === low; });
            row.score = low;
            if (atLow.length === 1) {
                var id = atLow[0].id;
                row.status = 'won';
                row.winner = id;
                row.name = nameOf[id];
                row.skins = 1 + row.carriedIn;
                tally[id].skins += row.skins;
                tally[id].holes.push(h.hole);
                totals.holesWon++;
                totals.skins += row.skins;
                totals.carried += row.carriedIn;
                carry = 0;
            } else {
                row.status = 'tied';
                row.tiedIds = atLow.map(function (p) { return p.id; });
                if (carryover && !last) {
                    carry += 1;
                    row.carriesTo = holes[i + 1].hole;
                } else {
                    row.notWon = 1 + row.carriedIn;
                    totals.notWon += row.notWon;
                    carry = 0;
                }
            }
            rows.push(row);
        });
        return { available: true, reason: null, carryover: carryover, holes: rows, tally: tally, totals: totals };
    }

    // ENTRANTS FROM THE RECORD SHAPE THE BOARD READS. `view` is a single-round
    // record or roundView(data, roundId): { scoringModel, players, teams, format,
    // courseData, scores }. nameOf(player) names a golfer (the page passes the
    // engine's competitorDisplayName); without it the stored name is used.
    // `owner` is who the skin belongs to on My results: the player id on a
    // golfer event, the team key on a team event.
    function entrantsFromRecord(view, nameOf) {
        var v = view || {};
        var scores = v.scores || {};
        var name = typeof nameOf === 'function' ? nameOf : function (p) { return (p && p.name) || ''; };
        var holes = holeList(v.courseData);
        var read = function (prefix) {
            var s = {};
            holes.forEach(function (h) {
                var x = postedScore(scores[prefix + '_h' + h.hole]);
                if (x !== null) s[h.hole] = x;
            });
            return s;
        };
        var gone = function (e) { return !!e && e.status === 'withdrawn'; };
        if (v.scoringModel === 'player-v1') {
            var players = v.players || {};
            return Object.keys(players).filter(function (pid) { return players[pid] && !gone(players[pid]); })
                .map(function (pid) { return { id: pid, owner: pid, name: name(players[pid]), scores: read(pid) }; });
        }
        var teams = v.teams || {};
        var format = v.format || 'scramble';
        var out = [];
        Object.keys(teams).forEach(function (tid) {
            var t = teams[tid];
            if (!t || !t.num || gone(t)) return;
            var tname = t.name || ('Team ' + t.num);
            if (format === 'scramble') {
                out.push({ id: tid, owner: tid, name: tname, scores: read('team' + t.num) });
                return;
            }
            (t.players || []).forEach(function (p, i) {
                out.push({ id: tid + '_p' + i, owner: tid, name: String(p || '').trim() || (tname + ' golfer ' + (i + 1)), team: tname, scores: read('team' + t.num + '_p' + i) });
            });
        });
        return out;
    }

    // The ring a hole score wears (index.html's .mark-birdie / .mark-eagle, and
    // the square for bogey): '' at par or with no par.
    function scoreMark(score, par) {
        var s = Number(score), p = Number(par);
        if (!isFinite(s) || !(p > 0)) return '';
        var d = s - p;
        if (d <= -2) return 'eagle';
        if (d === -1) return 'birdie';
        if (d === 1) return 'bogey';
        if (d >= 2) return 'double';
        return '';
    }

    var api = { computeSkins: computeSkins, entrantsFromRecord: entrantsFromRecord, scoreMark: scoreMark,
        postedScore: postedScore, NET_REASON: NET_REASON };
    root.TournamentSkins = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
