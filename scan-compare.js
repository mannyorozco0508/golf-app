// ============================================================================
// SCORECARD SCAN CHECK - THE COMPARE (SK, ADVISOR-20261114-1527)
//
// The organizer photographs a group's paper card on the Desk; the LIVE scanner
// (POST /api/scorecard-scan) reads it. This file compares what the scanner read
// with what the app holds for that group, hole by hole, and says what is left
// to resolve. It reads and returns plain data: no page, no database, no fetch.
// The page (tournament.html) writes a "Use card" choice through the existing
// score corrector, never through anything here.
//
// Plain ES5 in the card-is-in.js / scorecard-validate.js wrapper: a browser
// sees window.ScanCompare, Node sees module.exports.
//
// THE CONFIDENCE CUT. CONFIDENCE_CUT = 0.85, the same number the scanner's own
// validator (scorecard-validate.js MIN_CONFIDENCE) uses for an amber cell, so
// the check and the scanner never disagree about what "unsure" means. A digit
// read with confidence BELOW the cut, that differs from the app, is "unsure"
// (amber, "check the photo"); at or above the cut it is a plain match or
// mismatch. A low-confidence digit that EQUALS the app's is a match: the app
// already holds that number and there is nothing for the organizer to choose.
//
// NAME MATCHING (a card row -> a golfer on the record), three tiers, in order:
//   1 exact          the scanner's name is the record's name, as typed
//   2 loose          the same ignoring case, spaces and full stops
//   3 first+initial  first names equal and the last name starts with the same
//                    letter ("Dana R" or "Dana R." is Dana Ruiz)
// A row that fits TWO golfers at the first tier it fits is "not matched" -
// never guessed. Two golfers who share a first name and a last initial (Dana
// Ruiz, Dana Reed) are therefore told apart only by a full name; "Dana R" on
// the card matches neither and shows as "card row N: not matched". Two rows
// that fit the same golfer at the same tier: neither is matched; a row that
// fits a golfer an earlier tier already matched is not matched either. A team
// card may list its golfers in any order; the order never matters, only the
// names.
//
// A SCRAMBLE CARD is one row for the team: the page passes one record player
// named for the team with the team's golfers as aliases, so a row written
// under any of their names is that team's row.
// ============================================================================
(function () {
    'use strict';

    var CONFIDENCE_CUT = 0.85;

    function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }
    function norm(s) { return String(s === undefined || s === null ? '' : s).toLowerCase().replace(/\./g, ' ').replace(/\s+/g, ' ').trim(); }
    function words(s) { return norm(s).split(' ').filter(Boolean); }
    // The scanner answers "UNKNOWN:<as written>" for a row it could not put a
    // known name to (its schema says so); the part after the colon is the row.
    function scanName(s) { var t = String(s === undefined || s === null ? '' : s); return /^UNKNOWN:/i.test(t) ? t.replace(/^UNKNOWN:\s*/i, '') : t; }

    function fits(tier, written, name) {
        if (tier === 1) return String(written).trim() === String(name).trim() && String(name).trim() !== '';
        if (tier === 2) return norm(written) !== '' && norm(written) === norm(name);
        var w = words(written), n = words(name);
        if (w.length < 2 || n.length < 2) return false;
        return w[0] === n[0] && w[w.length - 1].charAt(0) === n[n.length - 1].charAt(0);
    }
    function namesOf(p) { return [p.name].concat(Array.isArray(p.aliases) ? p.aliases : []).filter(function (x) { return typeof x === 'string' && x.trim(); }); }

    // scanNames: the card rows' names in card order. players: [{ name, aliases? }].
    // -> { byRow: [{ player: index | -1, how: 'exact'|'loose'|'first+initial'|'ambiguous'|'duplicate'|'none' }],
    //      byPlayer: [rowIndex | -1] }
    function matchNames(scanNames, players) {
        var rows = (scanNames || []).map(scanName);
        var ps = players || [];
        var byRow = rows.map(function () { return { player: -1, how: 'none' }; });
        var settled = rows.map(function () { return false; });
        var claimed = ps.map(function () { return false; });
        var HOW = { 1: 'exact', 2: 'loose', 3: 'first+initial' };
        [1, 2, 3].forEach(function (tier) {
            var want = {};   // player index -> rows that fit it uniquely at this tier
            rows.forEach(function (w, ri) {
                if (settled[ri]) return;
                // Ambiguity is judged against EVERY golfer, claimed or not: a row
                // that could be two people is not anyone's.
                var cands = [];
                ps.forEach(function (p, pi) { if (namesOf(p).some(function (n) { return fits(tier, w, n); })) cands.push(pi); });
                if (cands.length > 1) { byRow[ri] = { player: -1, how: 'ambiguous' }; settled[ri] = true; return; }
                if (cands.length === 1) (want[cands[0]] = want[cands[0]] || []).push(ri);
            });
            Object.keys(want).forEach(function (k) {
                var pi = Number(k), list = want[k];
                if (list.length > 1 || claimed[pi]) {
                    list.forEach(function (ri) { byRow[ri] = { player: -1, how: 'duplicate' }; settled[ri] = true; });
                    return;
                }
                byRow[list[0]] = { player: pi, how: HOW[tier] };
                settled[list[0]] = true;
                claimed[pi] = true;
            });
        });
        var byPlayer = ps.map(function () { return -1; });
        byRow.forEach(function (r, ri) { if (r.player >= 0) byPlayer[r.player] = ri; });
        return { byRow: byRow, byPlayer: byPlayer };
    }

    function writtenTotalOf(row, holeCount) {
        if (!row) return null;
        if (isInt(row.written_total)) return row.written_total;
        if (isInt(row.written_out) && isInt(row.written_in)) return row.written_out + row.written_in;
        if (holeCount === 9) return isInt(row.written_out) ? row.written_out : (isInt(row.written_in) ? row.written_in : null);
        return null;
    }

    // One cell. card/app are a score or null; conf is the scanner's confidence.
    function cellStatus(card, app, conf, cut) {
        var c = isInt(card) && card > 0 ? card : null;
        var a = isInt(app) && app > 0 ? app : null;
        if (c === null && a === null) return 'empty';
        if (c === null || a === null) return 'missing';
        if (c === a) return 'match';
        return (typeof conf === 'number' ? conf : 0) < cut ? 'unsure' : 'mismatch';
    }

    // THE COMPARE.
    //   input.scan     the scanner's result: { players: [{ name, holes:[{hole,score,confidence}], written_out, written_in, written_total }] }
    //   input.players  the record's golfers for this card, in record order: [{ key, name, aliases? }]
    //   input.holes    the round's hole numbers
    //   input.app      { <key>: { <hole>: score } } read the way the board reads them
    //   input.cut      optional; CONFIDENCE_CUT otherwise
    //   input.at       optional timestamp, stored as is
    // -> the stored check: { at, holes, rows: { <key>: { name, row, how, h: { h<n>: { card, app, status, conf } },
    //                        writtenTotal, appTotal } }, unmatched: [{ row, asWritten }], writtenTotal, appTotal, verdict }
    // (h<n> keys, not numbers: the database turns numeric keys into an array.)
    function compareCard(input) {
        var i = input || {};
        var cut = typeof i.cut === 'number' ? i.cut : CONFIDENCE_CUT;
        var scanRows = (i.scan && Array.isArray(i.scan.players)) ? i.scan.players : [];
        var players = Array.isArray(i.players) ? i.players : [];
        var holes = (Array.isArray(i.holes) ? i.holes : []).filter(isInt).slice().sort(function (a, b) { return a - b; });
        var app = i.app || {};
        var m = matchNames(scanRows.map(function (r) { return r && r.name; }), players);
        var rows = {};
        players.forEach(function (p, pi) {
            var ri = m.byPlayer[pi];
            var sr = ri >= 0 ? scanRows[ri] : null;
            var byHole = {};
            if (sr && Array.isArray(sr.holes)) sr.holes.forEach(function (c) { if (c && isInt(c.hole)) byHole[c.hole] = c; });
            var mine = app[p.key] || {};
            var h = {}, appTotal = 0, appAny = false;
            holes.forEach(function (n) {
                var c = byHole[n];
                var card = c && isInt(c.score) && c.score > 0 ? c.score : null;
                var conf = c && typeof c.confidence === 'number' && isFinite(c.confidence) ? c.confidence : 0;
                var a = mine[n] !== undefined ? mine[n] : mine[String(n)];
                a = isInt(Number(a)) && Number(a) > 0 ? Number(a) : null;
                if (a !== null) { appTotal += a; appAny = true; }
                var cell = { status: sr ? cellStatus(card, a, conf, cut) : (a === null ? 'empty' : 'missing') };
                if (card !== null) cell.card = card;
                if (a !== null) cell.app = a;
                if (card !== null) cell.conf = Math.round(conf * 100) / 100;
                h['h' + n] = cell;
            });
            rows[p.key] = {
                name: p.name,
                row: ri >= 0 ? ri + 1 : 0,
                how: ri >= 0 ? m.byRow[ri].how : 'not on card',
                h: h,
                writtenTotal: writtenTotalOf(sr, holes.length),
                appTotal: appAny ? appTotal : null
            };
        });
        var unmatched = [];
        m.byRow.forEach(function (r, ri) {
            if (r.player === -1) unmatched.push({ row: ri + 1, asWritten: String(scanName(scanRows[ri] && (scanRows[ri].row_label_as_written || scanRows[ri].name)) || '').slice(0, 60), why: r.how });
        });
        var check = { holes: holes, rows: rows, unmatched: unmatched };
        if (i.at !== undefined) check.at = i.at;
        var wt = 0, wtAny = false, at = 0, atAny = false;
        Object.keys(rows).forEach(function (k) {
            if (isInt(rows[k].writtenTotal)) { wt += rows[k].writtenTotal; wtAny = true; }
            if (isInt(rows[k].appTotal)) { at += rows[k].appTotal; atAny = true; }
        });
        check.writtenTotal = wtAny ? wt : null;
        check.appTotal = atAny ? at : null;
        check.verdict = verdictOf(check);
        return check;
    }

    // THE APP'S NUMBER AFTER A CHOICE: "Use card" puts the card's digit on the
    // app, so the totals check reads the card's digit for that hole from then on.
    function effectiveApp(cell) {
        if (!cell) return null;
        if (cell.choice === 'card' && isInt(cell.card)) return cell.card;
        return isInt(cell.app) ? cell.app : null;
    }

    // EVERYTHING LEFT TO LOOK AT, in card order. Each issue:
    //   { id, kind: 'mismatch'|'unsure'|'missing'|'total'|'absent'|'row', key, name, hole?, card?, app?, conf?,
    //     written?, appTotal?, row?, asWritten?, choice, canUseCard }
    // kind 'total': the card's written total differs from the app's total for
    //   that golfer (after any Use card). Keep app is the only answer: there is
    //   no hole to write.
    // kind 'absent': a golfer on the record with no row on the card.
    // kind 'row': a card row that matched nobody ("card row 3: not matched").
    function issuesOf(check) {
        var out = [];
        if (!check || !check.rows) return out;
        var holes = Array.isArray(check.holes) ? check.holes : [];
        Object.keys(check.rows).forEach(function (key) {
            var r = check.rows[key] || {};
            var h = r.h || {};
            if (!r.row) {
                out.push({ id: key + '|absent', kind: 'absent', key: key, name: r.name, choice: r.absentChoice || null, canUseCard: false });
                return;
            }
            holes.forEach(function (n) {
                var c = h['h' + n];
                if (!c || c.status === 'match' || c.status === 'empty') return;
                out.push({ id: key + '|h' + n, kind: c.status, key: key, name: r.name, hole: n,
                    card: isInt(c.card) ? c.card : null, app: isInt(c.app) ? c.app : null, conf: c.conf,
                    choice: c.choice || null, canUseCard: isInt(c.card) && c.card > 0 });
            });
            if (isInt(r.writtenTotal)) {
                var sum = 0, any = false;
                holes.forEach(function (n) { var v = effectiveApp(h['h' + n]); if (v !== null) { sum += v; any = true; } });
                var appTotal = any ? sum : null;
                if (appTotal !== r.writtenTotal) {
                    out.push({ id: key + '|total', kind: 'total', key: key, name: r.name, written: r.writtenTotal, appTotal: appTotal,
                        choice: r.totalChoice || null, canUseCard: false });
                }
            }
        });
        (check.unmatched || []).forEach(function (u, i) {
            out.push({ id: 'row' + (u && u.row), kind: 'row', row: u && u.row, asWritten: u && u.asWritten, choice: (u && u.choice) || null, canUseCard: false, index: i });
        });
        return out;
    }

    // match: nothing to look at. unsure: only amber cells. mismatch: anything else.
    function verdictOf(check) {
        var list = issuesOf(check);
        if (!list.length) return 'match';
        return list.every(function (x) { return x.kind === 'unsure'; }) ? 'unsure' : 'mismatch';
    }

    // Records a choice on a COPY: 'card' (Use card - the page has written the
    // digit through the corrector) or 'app' (Keep app). Use card is refused
    // where there is no card digit to use.
    function choose(check, issueId, choice) {
        if (choice !== 'card' && choice !== 'app') return check;
        var c = JSON.parse(JSON.stringify(check || {}));
        var hit = issuesOf(c).filter(function (x) { return x.id === issueId; })[0];
        if (!hit) return check;
        if (choice === 'card' && !hit.canUseCard) return check;
        if (hit.kind === 'absent') c.rows[hit.key].absentChoice = choice;
        else if (hit.kind === 'total') c.rows[hit.key].totalChoice = choice;
        else if (hit.kind === 'row') c.unmatched[hit.index].choice = choice;
        else c.rows[hit.key].h['h' + hit.hole].choice = choice;
        return c;
    }

    function openIssues(check) { return issuesOf(check).filter(function (x) { return !x.choice; }); }
    function isVerified(check) { return !!(check && check.rows) && openIssues(check).length === 0; }

    // The Desk's tiles. cards: [{ key, check: <stored check> | null }].
    function fieldSummary(cards) {
        var list = Array.isArray(cards) ? cards : [];
        var s = { cards: list.length, verified: 0, withMismatches: 0, toScan: 0, open: 0, matched: 0, allVerified: false };
        list.forEach(function (c) {
            if (!c || !c.check || !c.check.rows) { s.toScan++; return; }
            var open = openIssues(c.check).length;
            if (issuesOf(c.check).length === 0) s.matched++;
            if (open === 0) s.verified++; else { s.withMismatches++; s.open += open; }
        });
        s.allVerified = s.cards > 0 && s.verified === s.cards;
        return s;
    }

    var api = {
        CONFIDENCE_CUT: CONFIDENCE_CUT,
        matchNames: matchNames,
        cellStatus: cellStatus,
        compareCard: compareCard,
        issuesOf: issuesOf,
        openIssues: openIssues,
        verdictOf: verdictOf,
        choose: choose,
        isVerified: isVerified,
        fieldSummary: fieldSummary
    };
    if (typeof window !== 'undefined') window.ScanCompare = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
