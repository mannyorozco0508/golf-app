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
function leagueConfig(trip) {
    var l = trip && trip.league;
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
        manual: l.manual || {}
    };
}

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
function leagueRoundMatches(round, calc, holesFor) {
    var data = (round && round.data) || {};
    var byId = {};
    (data.players || []).forEach(function (p) { if (p && p.id != null) byId[String(p.id)] = p; });
    var sms = data.sideMatches || {};
    var out = [];
    Object.keys(sms).sort(function (a, b) { return ((sms[a] || {}).createdAt || 0) - ((sms[b] || {}).createdAt || 0) || (a < b ? -1 : 1); }).forEach(function (smId) {
        var sm = sms[smId];
        if (!sm || sm.format !== 'nassau') return;
        var aIds = (sm.teamAIds || []).map(String), bIds = (sm.teamBIds || []).map(String);
        if (aIds.length !== 2 || bIds.length !== 2) return;            // the league is 2 v 2
        var a = aIds.map(function (id) { return byId[id] && byId[id].name; }), b = bIds.map(function (id) { return byId[id] && byId[id].name; });
        if (a.concat(b).some(function (n) { return !n; })) return;
        var res = null;
        try { res = calc ? calc(sm, data) : null; } catch (e) { res = null; }
        var holes = holesFor ? holesFor(sm, data) : (data.courseData || []);
        out.push({ id: round.code + '~' + smId, round: round.code, label: round.label || round.code, group: sm.ownerGroup || null,
            a: a, b: b, seg: leagueSegments(res, holes, data.scores || {}, aIds, bIds), source: 'nassau' });
    });
    return out;
}

// ---- EVERY MATCH OF THE TRIP, overrides applied --------------------------------------
// rounds: [{ code, label, data }] in trip order. A round set up AFTER it was played still
// counts: the results are read from its scores whenever the league is drawn.
function leagueMatches(rounds, cfg, calc, holesFor) {
    if (!cfg) return [];
    var all = [];
    (rounds || []).forEach(function (r) { all = all.concat(leagueRoundMatches(r, calc, holesFor)); });
    Object.keys(cfg.manual || {}).sort().forEach(function (id) {
        var m = cfg.manual[id];
        if (!m || !Array.isArray(m.a) || !Array.isArray(m.b) || !m.a.length || !m.b.length) return;
        var r = (rounds || []).filter(function (x) { return x.code === m.round; })[0];
        all.push({ id: 'manual~' + id, round: m.round || null, label: r ? (r.label || r.code) : (m.round || 'Round'), group: m.group || null,
            a: m.a.map(String), b: m.b.map(String), seg: { front: null, back: null, total: null }, source: 'manual' });
    });
    all.forEach(function (m) {
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
    LEAGUE_SEGS.forEach(function (seg) {
        var r = m.seg[seg], p = cfg.pts[seg];
        if (!r) { done = false; return; }
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
            row.matches.push({ id: m.id, label: m.label, group: m.group, side: r.side, partner: (r.side === 'A' ? m.a : m.b).filter(function (n) { return leagueKey(n) !== leagueKey(row.name); }),
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
function leagueState(trip, rounds, calc, holesFor) {
    var cfg = leagueConfig(trip);
    if (!cfg) return null;
    var players = leaguePlayers(cfg, rounds);
    var matches = leagueMatches(rounds, cfg, calc, holesFor);
    var rows = leagueStandings(matches, cfg, players);
    return { cfg: cfg, players: players, matches: matches, rows: rows, pay: leaguePayouts(rows, cfg) };
}

if (typeof window !== 'undefined') {
    window.HardPanLeagueEngine = { config: leagueConfig, matches: leagueMatches, roundMatches: leagueRoundMatches, segments: leagueSegments, matchFor: leagueMatchFor,
        standings: leagueStandings, payouts: leaguePayouts, players: leaguePlayers, state: leagueState, key: leagueKey, DEFAULTS: LEAGUE_DEFAULTS };
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { leagueConfig: leagueConfig, leagueMatches: leagueMatches, leagueRoundMatches: leagueRoundMatches, leagueSegments: leagueSegments, leagueMatchFor: leagueMatchFor,
        leagueStandings: leagueStandings, leaguePayouts: leaguePayouts, leaguePlayers: leaguePlayers, leagueState: leagueState, leagueKey: leagueKey, LEAGUE_DEFAULTS: LEAGUE_DEFAULTS };
}
