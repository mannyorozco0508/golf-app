// ============================================================================
// POINTS LEAGUE (HardPan, gps-league) - the week's individual points race.
//
// PURE. No DOM, no database. The trip page hands it the trip's rounds and the
// league's settings (trips/<code>/league); this says who has how many points and
// who gets paid. Plain var/function declarations, like trip-pots.js.
//
// THE RULES (defaults; every number is the organizer's to change):
//   Every round, each group plays 2 v 2 (partners change round to round). Points come
//   from that group's own 2 v 2 Nassau - its result READ, never changed, from the
//   ONE engine (match-engine.js calculateMatchEngine, net or gross as the Nassau was
//   set up): front 9 = 1 pt, back 9 = 1 pt, 18 = 1 pt to EACH golfer on the winning
//   side; a halve = half each. The organizer can set any segment by hand (A / B /
//   halved), or enter a match for a group that played no Nassau.
//   Standings: points over every round of the trip. Tiebreak: most matches won
//   (a match = more of its points than the other side), then shared.
//   Pot: buy-in x golfers in the league. Places (default 3, at 50 / 30 / 20 %) are paid
//   from it; golfers tied on a paid place split the places they cover.
//
// ITS OWN MONEY, SETTLED SEPARATELY. Nothing here feeds Who Pays Who or the trip
// money settlement; nothing in any money engine is called except the match engine,
// read-only, the way Side Bets calls it. All money in integer cents.
// ============================================================================

var LEAGUE_DEFAULTS = { buyIn: 20, pts: { front: 1, back: 1, total: 1 }, places: [50, 30, 20] };
var LEAGUE_SEGS = ['front', 'back', 'total'];
var LEAGUE_ENGINE_IDS = { front: 'F9', back: 'B9', total: '18' };

function leagueKey(name) { return String(name == null ? '' : name).trim().replace(/\s+/g, ' ').toLowerCase(); }

// The stored settings, made whole. null when there is no league.
//   trips/<code>/league = { on, buyIn, players: [names] | null (= everyone),
//     pts: { front, back, total }, places: [%...], overrides: { <matchId>: { front, back,
//     total: 'A' | 'B' | 'H' | null } }, manual: { <id>: { round, group, a: [names],
//     b: [names] } }, at }
// THE POINTS GAME (gps-points, 2026-10-13): the same settings, held by a trip
// (trips/<code>/league) or by one round (events/<code>/pointsGame). Added:
//   rounds:    [codes] the rounds that count | null = every round of the trip (later ones too)
//   teamsMode: 'change' (each round's own 2 v 2 Nassaus, or entered by hand) |
//              'same'   (the same 2 v 2 sides every round: teams = [{ a: [n, n], b: [n, n] }],
//                        scored from each round's scores by the match engine)
//   scoring:   'net' | 'gross' for the same-teams matches (default net)
//   payMode:   'pct' (places = % of the pot) | 'usd' (placesUsd = $ per place, adding up to the pot)
function leagueConfig(trip) {
    var l = trip && (trip.league || trip.pointsGame);
    if (!l || l.on === false) return null;
    var num = function (v, d) { var n = Number(v); return isFinite(n) && n >= 0 ? n : d; };
    var pts = l.pts || {};
    var places = Array.isArray(l.places) ? l.places.map(function (p) { return num(p, 0); }).filter(function (p) { return p > 0; }) : LEAGUE_DEFAULTS.places.slice();
    return {
        buyIn: num(l.buyIn, LEAGUE_DEFAULTS.buyIn),
        players: Array.isArray(l.players) && l.players.length ? l.players.map(String) : null,
        pts: { front: num(pts.front, 1), back: num(pts.back, 1), total: num(pts.total, 1) },
        places: places,
        overrides: l.overrides || {},
        manual: l.manual || {},
        rounds: Array.isArray(l.rounds) && l.rounds.length ? l.rounds.map(String) : null,
        teamsMode: l.teamsMode === 'same' ? 'same' : 'change',
        teams: Array.isArray(l.teams) ? l.teams.filter(function (t) { return t && Array.isArray(t.a) && Array.isArray(t.b) && t.a.length && t.b.length; })
            .map(function (t) { return { a: t.a.map(String), b: t.b.map(String) }; }) : [],
        scoring: l.scoring === 'gross' ? 'gross' : 'net',
        payMode: l.payMode === 'usd' ? 'usd' : 'pct',
        placesUsd: Array.isArray(l.placesUsd) ? l.placesUsd.map(function (p) { return num(p, 0); }).filter(function (p) { return p > 0; }) : [],
        def: leagueRoundCfg(l.def, pts, num),
        perRound: Object.keys(l.perRound || {}).reduce(function (o, k) { o[k] = leagueRoundCfg(l.perRound[k], (l.def && l.def.pts) || pts, num); return o; }, {})
    };
}
// EACH ROUND ITS OWN FORMAT AND POINTS (Manny, 2026-10-13: "like a Ryder Cup but with individual
// standings"). format: 'fourball' (best ball 2 v 2) | 'foursomes' (alternate shot 2 v 2) |
// 'scramble' (2 v 2) | 'singles' (1 v 1). mode: 'nassau' (front / back / 18) | 'match' (18-hole
// match: win / halve points). Default: four-ball, Nassau-style, 1 / 1 / 1.
var LEAGUE_FORMATS = ['fourball', 'foursomes', 'scramble', 'singles'];
function leagueRoundCfg(r, pts, num) {
    r = r || {}; pts = (r.pts || pts) || {};
    num = num || function (v, d) { var n = Number(v); return isFinite(n) && n >= 0 ? n : d; };
    return { format: LEAGUE_FORMATS.indexOf(r.format) !== -1 ? r.format : 'fourball', mode: r.mode === 'match' ? 'match' : 'nassau',
        pts: { front: num(pts.front, 1), back: num(pts.back, 1), total: num(pts.total, 1) }, win: num(r.win, 2), halve: num(r.halve, 1) };
}
function leagueRoundOf(cfg, code) { return (cfg.perRound && cfg.perRound[code]) || cfg.def || leagueRoundCfg(null, cfg.pts); }
// The match engine can score these from each golfer's own scores; foursomes / scramble have one
// ball per side, so outside a Cup round their results are tapped in by the organizer.
function leagueEngineScores(format) { return format === 'fourball' || format === 'singles'; }

// ---- THE MATCHES OF ONE ROUND ---------------------------------------------------
// One per 2 v 2 Nassau in the round's Side Bets (sideMatches), read through the engine.
// calc(sm, data) is the caller's: the same calculateMatchEngine call Side Bets makes.
// A segment is decided once the engine closes it (won), or once every hole of it has
// been played by both sides with the match level (halved). Otherwise null (not yet).
function leagueSegments(calcOut, holes, scores, aIds, bIds) {
    var out = { front: null, back: null, total: null };
    if (!calcOut || !Array.isArray(calcOut.activeMatches)) return out;
    var played = function (h) {
        var has = function (ids) { return ids.some(function (id) { var v = scores && scores['p' + id + '_h' + h]; return v && Number(v) > 0; }); };
        return has(aIds) && has(bIds);
    };
    LEAGUE_SEGS.forEach(function (seg) {
        var m = calcOut.activeMatches.filter(function (x) { return x.id === LEAGUE_ENGINE_IDS[seg] && !x.pressNum; })[0];
        if (!m) return;
        if (m.closed) { out[seg] = m.status > 0 ? 'A' : 'B'; return; }
        var range = (holes || []).filter(function (h) { var n = Number(h.hole); return n >= m.startHole && n <= m.endHole; });
        if (range.length && range.every(function (h) { return played(h.hole); })) out[seg] = m.status > 0 ? 'A' : m.status < 0 ? 'B' : 'H';
    });
    return out;
}
function leagueRoundMatches(round, calc, holesFor, rc, ryder) {
    rc = rc || leagueRoundCfg();
    var data = (round && round.data) || {};
    var size = rc.format === 'singles' ? 1 : 2;
    // A CUP ROUND: its own matches, scored by the Ryder engine (four-ball, foursomes, singles).
    var cup = ryder ? ryder(round) : null;
    if (cup && cup.length) return cup.filter(function (c) { return c.a.length === c.b.length; }).map(function (c, i) {
        var seg = { front: null, back: null, total: c.total || null };
        if (rc.mode === 'nassau' && leagueEngineScores(c.format) && calc && c.aIds && c.bIds) {
            var sm = { format: 'nassau', teamAIds: c.aIds, teamBIds: c.bIds, scoring: c.scoring || 'net', startHole: 1 };
            var res = null; try { res = calc(sm, data); } catch (e) { res = null; }
            var sg = leagueSegments(res, holesFor ? holesFor(sm, data) : (data.courseData || []), data.scores || {}, c.aIds, c.bIds);
            seg.front = sg.front; seg.back = sg.back;
        }
        return { id: round.code + '~cup' + (c.id || i), round: round.code, label: round.label || round.code, group: null, a: c.a, b: c.b, seg: seg, source: 'cup', format: c.format };
    });
    var byId = {};
    (data.players || []).forEach(function (p) { if (p && p.id != null) byId[String(p.id)] = p; });
    var sms = data.sideMatches || {};
    var out = [];
    Object.keys(sms).sort(function (a, b) { return ((sms[a] || {}).createdAt || 0) - ((sms[b] || {}).createdAt || 0) || (a < b ? -1 : 1); }).forEach(function (smId) {
        var sm = sms[smId];
        if (!sm || (sm.format !== 'nassau' && sm.format !== 'match')) return;
        var aIds = (sm.teamAIds || []).map(String), bIds = (sm.teamBIds || []).map(String);
        if (aIds.length !== size || bIds.length !== size) return;      // 2 v 2, or 1 v 1 for singles
        var a = aIds.map(function (id) { return byId[id] && byId[id].name; }), b = bIds.map(function (id) { return byId[id] && byId[id].name; });
        if (a.concat(b).some(function (n) { return !n; })) return;
        var seg = { front: null, back: null, total: null };
        if (leagueEngineScores(rc.format)) {
            var res = null;
            try { res = calc ? calc(sm, data) : null; } catch (e) { res = null; }
            var holes = holesFor ? holesFor(sm, data) : (data.courseData || []);
            seg = leagueSegments(res, holes, data.scores || {}, aIds, bIds);
        }
        out.push({ id: round.code + '~' + smId, round: round.code, label: round.label || round.code, group: sm.ownerGroup || null,
            a: a, b: b, seg: seg, source: 'nassau' });
    });
    return out;
}

// SAME TEAMS EVERY ROUND: each pairing is a 2 v 2 Nassau in every chosen round where all
// four golfers played, scored from that round's scores by the same engine call (a stand-in
// Nassau the round never sees - nothing is written).
function leagueSameTeamMatches(round, cfg, calc, holesFor, rc) {
    rc = rc || leagueRoundCfg();
    var data = (round && round.data) || {};
    var idOf = {};
    (data.players || []).forEach(function (p) { if (p && p.name) idOf[leagueKey(p.name)] = String(p.id); });
    var out = [];
    // A singles round: each pairing's golfers play their opposite number (A1 v B1, A2 v B2).
    var pairs = [];
    (cfg.teams || []).forEach(function (t, i) {
        if (rc.format === 'singles') t.a.forEach(function (n, k) { if (t.b[k]) pairs.push({ a: [n], b: [t.b[k]], id: i + 's' + k }); });
        else pairs.push({ a: t.a, b: t.b, id: String(i) });
    });
    pairs.forEach(function (t) {
        var i = t.id;
        var aIds = t.a.map(function (n) { return idOf[leagueKey(n)]; }), bIds = t.b.map(function (n) { return idOf[leagueKey(n)]; });
        if (aIds.concat(bIds).some(function (x) { return !x; })) return;   // not all four in this round
        var sm = { format: 'nassau', teamAIds: aIds, teamBIds: bIds, scoring: cfg.scoring || 'net', startHole: 1 };
        var seg = { front: null, back: null, total: null };
        if (leagueEngineScores(rc.format)) {
            var res = null;
            try { res = calc ? calc(sm, data) : null; } catch (e) { res = null; }
            var holes = holesFor ? holesFor(sm, data) : (data.courseData || []);
            seg = leagueSegments(res, holes, data.scores || {}, aIds, bIds);
        }
        out.push({ id: round.code + '~team' + i, round: round.code, label: round.label || round.code, group: null,
            a: t.a.slice(), b: t.b.slice(), seg: seg, source: 'team' });
    });
    return out;
}

// ---- EVERY MATCH OF THE TRIP, overrides applied --------------------------------------
// rounds: [{ code, label, data }] in trip order. A round set up AFTER it was played still
// counts: the results are read from its scores whenever the league is drawn.
function leagueMatches(rounds, cfg, calc, holesFor, ryder) {
    if (!cfg) return [];
    var all = [];
    (rounds || []).forEach(function (r) {
        var rc = leagueRoundOf(cfg, r.code);
        all = all.concat(cfg.teamsMode === 'same' ? leagueSameTeamMatches(r, cfg, calc, holesFor, rc) : leagueRoundMatches(r, calc, holesFor, rc, ryder));
    });
    Object.keys(cfg.manual || {}).sort().forEach(function (id) {
        var m = cfg.manual[id];
        if (!m || !Array.isArray(m.a) || !Array.isArray(m.b) || !m.a.length || !m.b.length) return;
        var r = (rounds || []).filter(function (x) { return x.code === m.round; })[0];
        all.push({ id: 'manual~' + id, round: m.round || null, label: r ? (r.label || r.code) : (m.round || 'Round'), group: m.group || null,
            a: m.a.map(String), b: m.b.map(String), seg: { front: null, back: null, total: null }, source: 'manual' });
    });
    all.forEach(function (m) {
        var rc = leagueRoundOf(cfg, m.round);
        m.format = m.format || rc.format; m.mode = rc.mode; m.ptsCfg = rc.mode === 'match' ? { win: rc.win, halve: rc.halve } : rc.pts;
        if (rc.mode === 'match') { m.seg.front = 'NA'; m.seg.back = 'NA'; }
        var o = (cfg.overrides || {})[m.id];
        m.set = {};
        LEAGUE_SEGS.forEach(function (seg) {
            var v = o && o[seg];
            if (v === 'A' || v === 'B' || v === 'H') { m.seg[seg] = v; m.set[seg] = true; }
        });
    });
    return all;
}

// What one golfer gets from one match: points, and the match's W / L / H once all three
// segments are decided.
function leagueMatchFor(m, cfg, name) {
    var k = leagueKey(name);
    var side = m.a.some(function (n) { return leagueKey(n) === k; }) ? 'A' : m.b.some(function (n) { return leagueKey(n) === k; }) ? 'B' : null;
    if (!side) return null;
    var mine = 0, theirs = 0, done = true;
    if (m.mode === 'match') {
        // 18-HOLE MATCH: win / halve points (e.g. 2 / 1), the 18 only.
        var t = m.seg.total, pc = m.ptsCfg || { win: 2, halve: 1 };
        if (!t) done = false;
        else if (t === 'H') { mine = pc.halve; theirs = pc.halve; }
        else if (t === side) mine = pc.win; else theirs = pc.win;
        return { side: side, pts: mine, against: theirs, result: !done ? null : t === 'H' ? 'H' : t === side ? 'W' : 'L' };
    }
    var ptsCfg = m.ptsCfg || cfg.pts;
    LEAGUE_SEGS.forEach(function (seg) {
        var r = m.seg[seg], p = ptsCfg[seg];
        if (!r) { done = false; return; }
        if (r === 'NA') return;
        if (r === 'H') { mine += p / 2; theirs += p / 2; }
        else if (r === side) mine += p;
        else theirs += p;
    });
    return { side: side, pts: mine, against: theirs, result: !done ? null : mine > theirs ? 'W' : mine < theirs ? 'L' : 'H' };
}

// ---- STANDINGS -----------------------------------------------------------------------
// players: the league's golfers (names). Rank by points, then matches won; still tied =
// the same rank (shared).
function leagueStandings(matches, cfg, players) {
    var rows = (players || []).map(function (n) { return { name: n, pts: 0, w: 0, l: 0, h: 0, matches: [] }; });
    rows.forEach(function (row) {
        (matches || []).forEach(function (m) {
            var r = leagueMatchFor(m, cfg, row.name);
            if (!r) return;
            row.pts += r.pts;
            if (r.result === 'W') row.w++; else if (r.result === 'L') row.l++; else if (r.result === 'H') row.h++;
            row.matches.push({ id: m.id, label: m.label, group: m.group, side: r.side, format: m.format, mode: m.mode, partner: (r.side === 'A' ? m.a : m.b).filter(function (n) { return leagueKey(n) !== leagueKey(row.name); }),
                opponents: r.side === 'A' ? m.b : m.a, seg: m.seg, set: m.set || {}, pts: r.pts, result: r.result });
        });
    });
    rows.sort(function (x, y) { return (y.pts - x.pts) || (y.w - x.w) || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0); });
    rows.forEach(function (row, i) {
        var prev = rows[i - 1];
        row.rank = prev && prev.pts === row.pts && prev.w === row.w ? prev.rank : i + 1;
    });
    return rows;
}

// ---- THE POT AND WHO GETS PAID --------------------------------------------------------
// Pot = buy-in x golfers (cents). Each place = pot x its % (cents; the last paid place
// takes the rounding, so the places add up to the pot exactly). Golfers tied across
// places k..k+n-1 share those places' money evenly (the odd cent to the first listed).
// The %s must add up to 100, or nothing is paid out (said, not guessed).
function leaguePayouts(rows, cfg) {
    var n = (rows || []).length;
    var potC = Math.round(cfg.buyIn * 100) * n;
    if (cfg.payMode === 'usd') return leaguePayoutsUsd(rows, cfg, potC);
    var pct = cfg.places.slice(0, n);
    var sumPct = Math.round(cfg.places.reduce(function (a, b) { return a + b; }, 0) * 1000) / 1000;
    var out = { potCents: potC, placeCents: [], payCents: {}, valid: sumPct === 100, why: null };
    if (!out.valid) { out.why = 'The paid places add up to ' + sumPct + '%, not 100%'; return out; }
    if (n === 0) return out;
    // Fewer golfers than places: the places left over go back into the ones paid,
    // pro rata, so the whole pot is still paid out.
    var usedPct = pct.reduce(function (a, b) { return a + b; }, 0);
    var placeC = pct.map(function (p) { return Math.floor(potC * p / usedPct); });
    var left = potC - placeC.reduce(function (a, b) { return a + b; }, 0);
    for (var i = 0; left > 0; i = (i + 1) % placeC.length) { placeC[i]++; left--; }
    out.placeCents = placeC;
    var pos = 0;
    while (pos < n) {
        var end = pos;
        while (end + 1 < n && rows[end + 1].rank === rows[pos].rank) end++;
        var share = 0;
        for (var p = pos; p <= end; p++) share += placeC[p] || 0;
        var cnt = end - pos + 1, each = Math.floor(share / cnt), extra = share - each * cnt;
        for (var q = pos; q <= end; q++) out.payCents[rows[q].name] = each + (q - pos < extra ? 1 : 0);
        pos = end + 1;
    }
    return out;
}

// $ PER PLACE (the Weekly game's "Exact dollar amounts"): the amounts must add up to the pot,
// to the cent, or nothing is paid. Ties split the places they cover, as above.
function leaguePayoutsUsd(rows, cfg, potC) {
    var n = (rows || []).length;
    var placeC = (cfg.placesUsd || []).map(function (d) { return Math.round(d * 100); });
    var sum = placeC.reduce(function (a, b) { return a + b; }, 0);
    var out = { potCents: potC, placeCents: placeC, payCents: {}, valid: sum === potC && placeC.length > 0, why: null };
    if (!out.valid) { out.why = 'The places add up to $' + (sum / 100) + ', not the $' + (potC / 100) + ' pot'; return out; }
    if (placeC.length > n) { out.valid = false; out.why = 'More paid places (' + placeC.length + ') than golfers (' + n + ')'; return out; }
    var pos = 0;
    while (pos < n) {
        var end = pos;
        while (end + 1 < n && rows[end + 1].rank === rows[pos].rank) end++;
        var share = 0;
        for (var p = pos; p <= end; p++) share += placeC[p] || 0;
        var cnt = end - pos + 1, each = Math.floor(share / cnt), extra = share - each * cnt;
        for (var q = pos; q <= end; q++) out.payCents[rows[q].name] = each + (q - pos < extra ? 1 : 0);
        pos = end + 1;
    }
    return out;
}

// The league's golfers: as set, or everyone in any round of the trip (by name, as the trip
// page matches golfers across rounds).
function leaguePlayers(cfg, rounds) {
    if (cfg && cfg.players) return cfg.players.slice();
    var seen = {}, out = [];
    (rounds || []).forEach(function (r) {
        ((r.data && r.data.players) || []).forEach(function (p) {
            var nm = p && String(p.name || '').trim();
            if (nm && !seen[leagueKey(nm)]) { seen[leagueKey(nm)] = 1; out.push(nm); }
        });
    });
    return out;
}

// Everything the screens draw, in one call.
function leagueState(trip, rounds, calc, holesFor, ryder) {
    var cfg = leagueConfig(trip);
    if (!cfg) return null;
    if (cfg.rounds) rounds = (rounds || []).filter(function (r) { return cfg.rounds.indexOf(String(r.code)) !== -1; });
    var players = leaguePlayers(cfg, rounds);
    var matches = leagueMatches(rounds, cfg, calc, holesFor, ryder);
    var rows = leagueStandings(matches, cfg, players);
    return { cfg: cfg, players: players, matches: matches, rows: rows, pay: leaguePayouts(rows, cfg) };
}

if (typeof window !== 'undefined') {
    window.HardPanLeagueEngine = { roundCfg: leagueRoundCfg, roundOf: leagueRoundOf, FORMATS: LEAGUE_FORMATS, sameTeamMatches: leagueSameTeamMatches, config: leagueConfig, matches: leagueMatches, roundMatches: leagueRoundMatches, segments: leagueSegments, matchFor: leagueMatchFor,
        standings: leagueStandings, payouts: leaguePayouts, players: leaguePlayers, state: leagueState, key: leagueKey, DEFAULTS: LEAGUE_DEFAULTS };
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { leagueRoundCfg: leagueRoundCfg, leagueRoundOf: leagueRoundOf, LEAGUE_FORMATS: LEAGUE_FORMATS, leagueSameTeamMatches: leagueSameTeamMatches, leaguePayoutsUsd: leaguePayoutsUsd, leagueConfig: leagueConfig, leagueMatches: leagueMatches, leagueRoundMatches: leagueRoundMatches, leagueSegments: leagueSegments, leagueMatchFor: leagueMatchFor,
        leagueStandings: leagueStandings, leaguePayouts: leaguePayouts, leaguePlayers: leaguePlayers, leagueState: leagueState, leagueKey: leagueKey, LEAGUE_DEFAULTS: LEAGUE_DEFAULTS };
}
