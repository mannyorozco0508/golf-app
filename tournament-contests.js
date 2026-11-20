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
                lockedAt: c[k].lockedAt || null, par: h.par || null, yards: h.yards || null,
                winners: winnersOf(c[k]), locks: (c[k].locks && typeof c[k].locks === 'object') ? c[k].locks : {} };
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

    // ---- withdrawn ----------------------------------------------------------------
    // The same marker the engine reads (tournament-engine.js isWithdrawn): a golfer
    // the organizer withdrew carries players/<pid>/status = 'withdrawn'. Their
    // contest mark stays stored (un-withdraw brings it back) but is never ranked,
    // so it can neither lead the board nor be offered for "Make winner".
    // Found by the full-event simulation, 2026-11-19: a withdrawn golfer's KP led
    // hole 3 and was the one confirmed.
    function withdrawnKey(data, key) {
        var players = (data && data.players) || {};
        var p = players[key];
        if (p) return p.status === 'withdrawn';
        var m = /^team(\d+)_/.exec(String(key || ''));
        if (!m) return false;
        var teams = (data && data.teams) || {};
        return Object.keys(teams).some(function (k) { var t = teams[k]; return t && String(t.num) === m[1] && t.status === 'withdrawn'; });
    }

    // ---- CONTESTS PER ROUND (Starkey settings 12, "Round 1 / Round 2 / Both"; Manny 2026-11-19) ----------
    // A two-round event plays each hole twice, so its contest holes live on the ROUND:
    //   tournaments/<code>/rounds/<rid>/contests/h<N>      the same shape as tournaments/<code>/contests/h<N>
    //   contestEntries/<code>/r/<rid>/h<N>/<entryKey>       contestProofs/<code>/r/<rid>/h<N>/<entryKey>
    // A one-round event (rid null) keeps every path it has always had. The round paths need the round blocks of
    // the proposed rules change (not yet published).
    function paths(code, rid) {
        return rid
            ? { contests: 'tournaments/' + code + '/rounds/' + rid + '/contests', entries: 'contestEntries/' + code + '/r/' + rid, proofs: 'contestProofs/' + code + '/r/' + rid }
            : { contests: 'tournaments/' + code + '/contests', entries: 'contestEntries/' + code, proofs: 'contestProofs/' + code };
    }
    // What contestList / rankedGroups / winnerUpdate read for one round: the round's course and handicaps (the
    // engine's roundView), its contest holes, and the event's players, flights and prize settings.
    function contestView(data, rid) {
        var multi = typeof root.isMultiRound === 'function' && root.isMultiRound(data || {});
        if (!rid || !multi) return data || {};
        var rv = (typeof root.roundView === 'function' && root.roundView(data, rid)) || {};
        var r = ((data && data.rounds) || {})[rid] || {};
        return Object.assign({}, rv, { contests: r.contests || {}, prizeSettings: data.prizeSettings, roundId: rid, roundName: r.name || '' });
    }
    // The entries of one round (or of the event) out of the contestEntries/<code> snapshot.
    function entriesFor(all, rid) { return rid ? (((all || {}).r || {})[rid] || {}) : (all || {}); }

    // ---- KP SETTINGS 12-13 (Starkey settings, Manny 2026-11-19 "then KPs 12-13 (rules publish later, my OK)") ----
    // prizeSettings/kps = { perFlight: true|false, ties: 'earlier'|'share' }. Absent = today: one winner for the
    // field, a tie keeps the earlier mark.
    // A contest hole may then carry  winners: { <entryKey>: true }  and  locks: { <flightId>|'all': time }  beside
    // the single winner / lockedAt it has always had. ONE winner for the field with no share still writes
    // winner + lockedAt, exactly as before, which the live rules accept; winners / locks need the rules change
    // proposed in outbox (TOURN-...-kp-rules-PROPOSAL), not yet published.
    function kpRulesOf(data) {
        var k = (data && data.prizeSettings && data.prizeSettings.kps) || {};
        return { perFlight: k.perFlight === true, ties: k.ties === 'share' ? 'share' : 'earlier' };
    }
    function winnersOf(raw) {
        var w = raw && raw.winners && typeof raw.winners === 'object' ? Object.keys(raw.winners).filter(function (k) { return raw.winners[k] === true; }) : [];
        if (!w.length && raw && raw.winner) w = [raw.winner];
        return w;
    }
    // The flight an entry counts in: its golfer's (a player id), or its team's (team<N>_p<i>).
    function flightOfKey(data, key) {
        var p = ((data && data.players) || {})[key];
        if (p) return p.flightId || null;
        var m = /^team(\d+)_/.exec(String(key || ''));
        if (!m) return null;
        var teams = (data && data.teams) || {};
        var t = Object.keys(teams).map(function (k) { return teams[k]; }).filter(function (x) { return x && String(x.num) === m[1]; })[0];
        return (t && t.flightId) || null;
    }
    // 'all' when the event has one winner a hole; the flight (or 'none') when it has one a flight.
    function groupOfKey(data, key) { return kpRulesOf(data).perFlight ? (flightOfKey(data, key) || 'none') : 'all'; }
    function lockedFor(c, groupId) { return !!(c && (c.lockedAt || ((c.locks || {})[groupId || 'all']))); }
    // The ranked entries of one hole, in groups: one group, or one per flight in the board's flight order.
    function rankedGroups(entries, kind, data) {
        var all = ranked(entries, kind, data);
        if (!kpRulesOf(data).perFlight) return [{ id: 'all', name: '', rows: all }];
        var f = (data && data.flights) || {};
        var ids = Object.keys(f).filter(function (k) { return f[k]; }).sort(function (a, b) { return ((f[a].createdAt || 0) - (f[b].createdAt || 0)) || String(f[a].name || '').localeCompare(String(f[b].name || '')); });
        var out = ids.map(function (id) { return { id: id, name: f[id].name || 'Flight', rows: all.filter(function (r) { return flightOfKey(data, r.key) === id; }) }; });
        var none = all.filter(function (r) { return ids.indexOf(flightOfKey(data, r.key)) === -1; });
        if (none.length) out.push({ id: 'none', name: 'No flight', rows: none });
        return out;
    }
    var sameMark = function (a, b) { return a.kind === b.kind && (a.kind === 'ld' ? Number(a.yards) === Number(b.yards) : Number(a.inches) === Number(b.inches)); };
    // MAKE WINNER, as one update relative to tournaments/<code>/contests/<hole>. The legacy write when it can be
    // (one winner for the field, no share): { winner, lockedAt }. Otherwise winners/<key> for the pick (and, when
    // ties share, every entry in the same group with the same mark) and locks/<group>.
    function winnerUpdate(data, c, entries, entryKey, timestamp) {
        var R = kpRulesOf(data);
        var gid = groupOfKey(data, entryKey);
        var grp = rankedGroups(entries, c.kind, data).filter(function (x) { return x.id === gid; })[0] || { rows: [] };
        var me = grp.rows.filter(function (r) { return r.key === entryKey; })[0];
        var picks = R.ties === 'share' && me ? grp.rows.filter(function (r) { return sameMark(r, me); }).map(function (r) { return r.key; }) : [entryKey];
        if (!R.perFlight && picks.length === 1) {
            var legacy = { winner: entryKey, lockedAt: timestamp };
            (c.winners || []).forEach(function (k) { if (k !== c.winner) legacy['winners/' + k] = null; });
            Object.keys(c.locks || {}).forEach(function (k) { legacy['locks/' + k] = null; });
            if (Object.keys(c.locks || {}).length) legacy['winners/' + entryKey] = null;
            return legacy;
        }
        var u = {};
        var grpOf = function (k) { return R.perFlight ? (flightOfKey(data, k) || 'none') : 'all'; };
        // A hole won the old way (winner + lockedAt) is carried into the new shape first: its winner becomes
        // winners/<key> with its group's lock, so another flight's pick never un-wins it.
        if (c.winner) {
            u.winner = null; u.lockedAt = null;
            if (grpOf(c.winner) !== gid) { u['winners/' + c.winner] = true; u['locks/' + grpOf(c.winner)] = c.lockedAt || timestamp; }
        }
        (c.winners || []).forEach(function (k) { if (picks.indexOf(k) === -1 && grpOf(k) === gid) u['winners/' + k] = null; });
        picks.forEach(function (k) { u['winners/' + k] = true; });
        u['locks/' + gid] = timestamp;
        return u;
    }
    // CLEAR: the legacy pair, or the group's winners and its lock.
    function clearWinnerUpdate(data, c, groupId) {
        var u = { winner: null, lockedAt: null };
        (c.winners || []).forEach(function (k) { if ((kpRulesOf(data).perFlight ? (flightOfKey(data, k) || 'none') : 'all') === groupId) u['winners/' + k] = null; });
        u['locks/' + (groupId || 'all')] = null;
        return u;
    }

    // ---- the ranking ------------------------------------------------------------
    // KP: shortest first. Long drive: longest first. A tie keeps the earlier entry.
    // data (the event record) is how a withdrawn golfer is left out; both pages pass it.
    function ranked(entries, kind, data) {
        var list = Object.keys(entries || {}).map(function (k) {
            return Object.assign({ key: k }, entries[k]);
        }).filter(function (e) {
            return e.kind === kind && !withdrawnKey(data, e.key) && (kind === 'ld' ? isFinite(Number(e.yards)) : isFinite(Number(e.inches)));
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
        var pk = Object.keys(players).filter(function (k) { return players[k] && !withdrawnKey(data, k); });
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
        var p = paths(o.code, o.round || null);
        var out = {};
        out[p.entries + '/' + hk + '/' + o.entryKey] = entryRecord(o, timestamp);
        if (o.k) out[p.proofs + '/' + hk + '/' + o.entryKey] = { who: o.who, k: o.k, t: timestamp };
        return out;
    }

    // ---- the recap's winners -------------------------------------------------------
    // Only a hole the organizer confirmed ("Make winner") has a winner here.
    function confirmedWinners(data, entriesByHole) {
        var out = [];
        var multi = typeof root.isMultiRound === 'function' && root.isMultiRound(data || {});
        var rids = multi ? Object.keys((data && data.rounds) || {}).sort(function (a, b) { return ((data.rounds[a] || {}).createdAt || 0) - ((data.rounds[b] || {}).createdAt || 0); }) : [null];
        rids.forEach(function (rid) {
            var view = contestView(data, rid), ent = entriesFor(entriesByHole, rid);
            contestList(view).forEach(function (c) {
                c.winners.forEach(function (k) {
                    var e = (ent[c.key] || {})[k];
                    if (e) out.push({ hole: c.hole, kind: c.kind, name: e.name, value: valueText(e), round: rid ? (view.roundName || 'Round') : '' });
                });
            });
        });
        return out;
    }

    var api = {
        KIND_LABEL: KIND_LABEL, KIND_ICON: KIND_ICON, ENTRY_FIELDS: ENTRY_FIELDS,
        KP_MAX_IN: KP_MAX_IN, LD_MIN_YD: LD_MIN_YD, LD_MAX_YD: LD_MAX_YD,
        holeKey: holeKey, holeNum: holeNum, contestList: contestList, contestFor: contestFor,
        feetInchesText: feetInchesText, yardsText: yardsText, valueText: valueText,
        kpInches: kpInches, ldYards: ldYards, ranked: ranked, withdrawnKey: withdrawnKey, throughCount: throughCount,
        teamLabel: teamLabel, entryRecord: entryRecord, entryUpdate: entryUpdate,
        confirmedWinners: confirmedWinners, paths: paths, contestView: contestView, entriesFor: entriesFor, kpRulesOf: kpRulesOf, winnersOf: winnersOf, flightOfKey: flightOfKey,
        groupOfKey: groupOfKey, lockedFor: lockedFor, rankedGroups: rankedGroups, winnerUpdate: winnerUpdate, clearWinnerUpdate: clearWinnerUpdate
    };
    root.TournamentContests = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
