// ============================================================================
// HARDPAN TOURNAMENTS - CONTEST HOLES (E2, approved "as mocked" 2026-11-09)
//
// Closest to the pin (kp) and long drive (ld). ONE builder for the two pages
// that show contests: tournament-scorecard.html (the golfer's prompt, E2a/E2b,
// and the board, E2c) and tournament.html (the organizer's Contest holes, E2d,
// and the recap, E4c). Pure: no DOM, no database. Both pages call it, so the
// board a golfer reads and the list the organizer confirms are one ranking.
//
// DATA (EVENT-COMMS-PLAN.md section 2):
//   tournaments/<code>/contests/h<N> = { kind: 'kp'|'ld', fairwayOnly?, allowGps, winner?, lockedAt? }
//                                      owner-written
//   contestEntries/<code>/h<N>/<entryKey> = { name, team, kind, inches | yards, by, accFt?, at }
//   contestProofs/<code>/h<N>/<entryKey>  = { who, k, t }   (the score-proof shape)
// entryKey: team<N>_p<i> on a team card, the player id (p...) on a group card.
//
// NO LATITUDE OR LONGITUDE IS EVER WRITTEN. An entry carries a distance and a
// time, and ENTRY_FIELDS is the whole list of what it may carry; the rules
// refuse any other key ($other: false). tournament_contest_no_coordinate_test.js
// is the guard. The web marks nothing by GPS (typed only): see the scorecard.
//
// NOTHING IS PAID IN THE APP. No amount, no pool, no saveKpLeader, no
// pool-engine. A contest's prize is whatever the organizer announces.
// ============================================================================
(function (root) {
    'use strict';

    var KIND_LABEL = { kp: 'Closest to the pin', ld: 'Long drive' };
    var KIND_ICON = { kp: '⛳', ld: '🏌️' };
    var KP_MAX_IN = 1200;            // 100 ft: the rules' bound
    var LD_MIN_YD = 50, LD_MAX_YD = 450;
    // Every key an entry may carry. Nothing here can hold a position.
    var ENTRY_FIELDS = ['name', 'team', 'kind', 'inches', 'yards', 'by', 'accFt', 'at'];

    function holeKey(n) { return 'h' + Number(n); }
    function holeNum(key) { var m = /^h(\d+)$/.exec(String(key || '')); return m ? Number(m[1]) : null; }

    // The event's contest holes, in hole order, with the par from the card.
    function contestList(data) {
        var c = (data && data.contests) || {};
        var course = (data && data.courseData) || [];
        return Object.keys(c).filter(function (k) {
            return holeNum(k) && c[k] && (c[k].kind === 'kp' || c[k].kind === 'ld');
        }).map(function (k) {
            var n = holeNum(k), h = course.filter(function (x) { return Number(x.hole) === n; })[0] || {};
            return { key: k, hole: n, kind: c[k].kind, fairwayOnly: c[k].fairwayOnly === true,
                allowGps: c[k].allowGps !== false, winner: c[k].winner || null,
                lockedAt: c[k].lockedAt || null, par: h.par || null, yards: h.yards || null };
        }).sort(function (a, b) { return a.hole - b.hole; });
    }
    function contestFor(data, hole) {
        return contestList(data).filter(function (x) { return x.hole === Number(hole); })[0] || null;
    }

    // ---- distances ------------------------------------------------------------
    function feetInchesText(inches) {
        var n = Math.max(0, Math.round(Number(inches) || 0));
        return Math.floor(n / 12) + ' ft ' + (n % 12) + ' in';
    }
    function yardsText(y) { return Math.round(Number(y) || 0) + ' yds'; }
    function valueText(e) {
        if (!e) return '';
        return e.kind === 'ld' ? yardsText(e.yards) : feetInchesText(e.inches);
    }
    function wholeOrNull(v) {
        if (v === '' || v === null || v === undefined) return null;
        var n = Number(v);
        return (isFinite(n) && n >= 0 && n % 1 === 0) ? n : NaN;
    }
    // Typed feet + inches -> whole inches, or null when it is not a KP the rules take.
    function kpInches(ft, inch) {
        var f = wholeOrNull(ft), i = wholeOrNull(inch);
        if (f === null && i === null) return null;
        if (isNaN(f) || isNaN(i)) return null;
        f = f || 0; i = i || 0;
        if (i > 11) return null;
        var total = f * 12 + i;
        return total <= KP_MAX_IN ? total : null;
    }
    function ldYards(y) {
        var n = wholeOrNull(y);
        if (n === null || isNaN(n)) return null;
        return (n >= LD_MIN_YD && n <= LD_MAX_YD) ? n : null;
    }

    // ---- the ranking ------------------------------------------------------------
    // KP: shortest first. Long drive: longest first. A tie keeps the earlier entry.
    function ranked(entries, kind) {
        var list = Object.keys(entries || {}).map(function (k) {
            return Object.assign({ key: k }, entries[k]);
        }).filter(function (e) {
            return e.kind === kind && (kind === 'ld' ? isFinite(Number(e.yards)) : isFinite(Number(e.inches)));
        });
        list.sort(function (a, b) {
            var d = kind === 'ld' ? Number(b.yards) - Number(a.yards) : Number(a.inches) - Number(b.inches);
            return d !== 0 ? d : (Number(a.at) || 0) - (Number(b.at) || 0);
        });
        return list;
    }

    // "11 of 18 teams through": the cards that have scored this hole.
    function throughCount(data, hole) {
        var s = (data && data.scores) || {}, n = Number(hole);
        var teams = (data && data.teams) || {}, players = (data && data.players) || {};
        var scored = function (prefix) {
            return Object.keys(s).some(function (k) {
                return (k === prefix + '_h' + n || (k.indexOf(prefix + '_p') === 0 && /_h(\d+)$/.exec(k) && Number(/_h(\d+)$/.exec(k)[1]) === n)) && Number(s[k]) > 0;
            });
        };
        var tk = Object.keys(teams).filter(function (k) { return teams[k]; });
        if (tk.length) {
            return { done: tk.filter(function (k) { return scored('team' + teams[k].num); }).length, total: tk.length, noun: 'teams' };
        }
        var pk = Object.keys(players).filter(function (k) { return players[k] && !players[k].withdrawn; });
        return { done: pk.filter(function (k) { return Number(s[k + '_h' + n]) > 0; }).length, total: pk.length, noun: 'golfers' };
    }

    // The team label the board prints beside a name ("Team 4"); a group card has none.
    function teamLabel(data, team) {
        var m = /^team(\d+)$/.exec(String(team || ''));
        if (!m) return '';
        var t = ((data && data.teams) || {})['team' + m[1]];
        return (t && t.name) || ('Team ' + m[1]);
    }

    // ---- the write ------------------------------------------------------------------
    // ONE multi-path update: the entry and, on a keyed link, its proof - the
    // score-proof shape, so the rules check the key exactly as they do for a
    // score. t and at are the server's time (the rules require t === now).
    function entryRecord(o, timestamp) {
        var e = { name: String(o.name || '').slice(0, 60), team: String(o.team), kind: o.kind, by: 'typed', at: timestamp };
        if (o.kind === 'ld') e.yards = o.yards; else e.inches = o.inches;
        return e;
    }
    function entryUpdate(o, timestamp) {
        var hk = holeKey(o.hole);
        var out = {};
        out['contestEntries/' + o.code + '/' + hk + '/' + o.entryKey] = entryRecord(o, timestamp);
        if (o.k) out['contestProofs/' + o.code + '/' + hk + '/' + o.entryKey] = { who: o.who, k: o.k, t: timestamp };
        return out;
    }

    // ---- the recap's winners -------------------------------------------------------
    // Only a hole the organizer confirmed ("Make winner") has a winner here.
    function confirmedWinners(data, entriesByHole) {
        return contestList(data).filter(function (c) { return c.winner; }).map(function (c) {
            var e = ((entriesByHole || {})[c.key] || {})[c.winner];
            return e ? { hole: c.hole, kind: c.kind, name: e.name, value: valueText(e) } : null;
        }).filter(Boolean);
    }

    var api = {
        KIND_LABEL: KIND_LABEL, KIND_ICON: KIND_ICON, ENTRY_FIELDS: ENTRY_FIELDS,
        KP_MAX_IN: KP_MAX_IN, LD_MIN_YD: LD_MIN_YD, LD_MAX_YD: LD_MAX_YD,
        holeKey: holeKey, holeNum: holeNum, contestList: contestList, contestFor: contestFor,
        feetInchesText: feetInchesText, yardsText: yardsText, valueText: valueText,
        kpInches: kpInches, ldYards: ldYards, ranked: ranked, throughCount: throughCount,
        teamLabel: teamLabel, entryRecord: entryRecord, entryUpdate: entryUpdate,
        confirmedWinners: confirmedWinners
    };
    root.TournamentContests = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
