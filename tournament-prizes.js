// ============================================================================
// HARDPAN TOURNAMENTS - PRIZE RESULTS (PO build 2026-11-14,
// ADVISOR-20261114-1156-OK-build-final-set)
//
// ONE builder for the three pages that show prizes: tournament.html (the
// organizer's three cards, Post results, the recap and My results) and
// tournament-tv.html (the results page). Pure: no DOM, no database. It reads
// the engine's globals where the page loads them (resolvePrizeView,
// resolveLeaderboardView, allocatePlacePayouts, roundView, countableRoundIds,
// isMultiRound, competitorDisplayName, competitorCount) plus TournamentSkins
// (skins.js) and TournamentContests (tournament-contests.js). It computes no
// place or tie rule of its own: places are allocatePlacePayouts (payouts.js)
// over the engine's ranked rows, one call per flight.
//
// DATA, all on the event beside payoutSpots / payoutBasis (owner-written):
//   tournaments/<code>/prizeType      'credit' | 'cash'   absent = credit
//   tournaments/<code>/prizeSettings  { perSkin, carryover, perContest }
//   tournaments/<code>/prizeResults   what Post results saved (recordFor):
//     { v, postedAt, prizeType, host, basisTitle,
//       places: [{ flight, rows: [{ rank, key, name, toPar?, amount }] }],
//       skins: { perSkin, carryover, skins, total,
//                rounds: [{ name, won: [{ hole, par, key, name, score, skins, carriedIn, amount }], notWon, pending }] },
//       contests: { perContest, multi, rows: [{ hole, kind, key, name, value, amount }], total },
//       placeTotal, trophies, total, golfers }
//   key = the entry a prize belongs to: a player id on a golfer event, the
//   team key on a team event. My results (?me=<key>) reads by it.
//
// THE WORDS. Every amount reads "$60 pro shop credit", or "$60 cash" once the
// organizer picks the other half of the switch; a row under a heading that
// already names the word reads "$60 credit" / "$60 cash" (shortText). A place
// with no amount is a Trophy, whichever half is picked.
// ============================================================================
(function (root) {
    'use strict';

    var PRIZE_WORD = { credit: 'pro shop credit', cash: 'cash' };
    var g = function (name) { return typeof root[name] === 'function' ? root[name] : null; };

    function typeOf(data) { return data && data.prizeType === 'cash' ? 'cash' : 'credit'; }
    function wordOf(data) { return PRIZE_WORD[typeOf(data)]; }
    function wordCap(data) { var w = wordOf(data); return w.charAt(0).toUpperCase() + w.slice(1); }
    function amountOf(v) { var x = Number(v); return isFinite(x) && x >= 0 ? Math.round(x * 100) / 100 : 0; }
    function money(v) {
        var x = amountOf(v);
        return '$' + (x % 1 === 0 ? x.toLocaleString('en-US') : x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    }
    function amountText(v, data) { return amountOf(v) > 0 ? money(v) + ' ' + wordOf(data) : 'Trophy'; }
    // The row form, where a card already names the word: "$60 credit" / "$60 cash".
    function shortWord(data) { return typeOf(data) === 'credit' ? 'credit' : wordOf(data); }
    function shortText(v, data) { return amountOf(v) > 0 ? money(v) + ' ' + shortWord(data) : 'Trophy'; }
    function round2(x) { return Math.round(x * 100) / 100; }

    // CARRYOVER DEFAULTS TO OFF (Manny 2026-11-19 8:58 AM: "skins are RARELY carried over. Let's always default it
    // to no carry over", ADVISOR-20261119-0905). An event created from 2026-11-19 16:00 UTC (09:00 AZ) on, with no
    // carryover saved, plays without it. An event made before then with nothing saved keeps what it has always shown
    // (carryover on), so a running event's skins never change under it; a saved choice always wins.
    var CARRY_OFF_FROM = Date.UTC(2026, 10, 19, 16, 0, 0);
    function carryDefault(data) { return !(Number(data && data.createdAt) >= CARRY_OFF_FROM); }
    function settingsOf(data) {
        var s = (data && data.prizeSettings) || {};
        var carry = s.carryover === true ? true : (s.carryover === false ? false : carryDefault(data));
        return { perSkin: amountOf(s.perSkin), carryover: carry, perContest: amountOf(s.perContest) };
    }

    // Flights in the order the board's flight filter shows them.
    function flightIds(data) {
        var f = (data && data.flights) || {};
        return Object.keys(f).filter(function (k) { return f[k]; }).sort(function (a, b) {
            return ((f[a].createdAt || 0) - (f[b].createdAt || 0)) || String(f[a].name || '').localeCompare(String(f[b].name || ''));
        });
    }

    // ========================================================================
    // PLACE RULES (Starkey settings, places 1-7; Manny 2026-11-19: layout B,
    // "places 1-7 ... Preview only"). Saved on the event, owner-written:
    //   tournaments/<code>/prizeSettings/places = {
    //     on:       'gross' | 'net' | 'both'          absent = as the event is scored
    //     scope:    'event' | 'round' | 'both'        multi-round only; absent = payoutBasis, as before
    //     ties:     'split' | 'full'                  absent = split (allocatePlacePayouts, today's rule)
    //     rounding: 'cents' | 'dollar'                absent = cents; dollar = each share rounded DOWN
    //     onePrize: 'off' | 'gross' | 'larger'        absent = off; larger = the bigger prize, gross on an equal one
    //     within:   'event' | 'round'                 where one prize per golfer applies (multi-round)
    //     flights:  { <flightId>: { on?, spots? } }   a flight's own basis and place amounts
    //     edits:    { <tableKey>: { <entryKey>: { amount, note } } }   the organizer's adjust before posting
    //   }
    // NO places node = the old path, byte for byte: placeGroups below never
    // reaches this code (tournament_place_rules_test.js proves the two agree
    // when the node exists with nothing chosen). The split is still
    // allocatePlacePayouts (payouts.js, PROTECTED, shared with Trip Mode): this
    // wraps it, it never edits it. Ranking is the engine's own rows, on the
    // basis asked for (computeTournamentLeaderboard / roundViewOnBasis /
    // resolveLeaderboardView with { basis }).
    // ========================================================================
    var PLACE_ON = ['gross', 'net', 'both'], PLACE_SCOPE = ['event', 'round', 'both'];
    function pick(v, ok, d) { return ok.indexOf(v) !== -1 ? v : d; }
    function spotsList(raw) {
        var list = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? Object.keys(raw).sort(function (a, b) { return a - b; }).map(function (k) { return raw[k]; }) : null);
        return list ? list.slice(0, 20).map(amountOf) : null;
    }
    function placeRulesOf(data) {
        var p = data && data.prizeSettings && data.prizeSettings.places;
        if (!p || typeof p !== 'object') return null;
        var flights = {};
        Object.keys(p.flights || {}).forEach(function (fid) {
            var f = p.flights[fid] || {};
            flights[fid] = { on: pick(f.on, PLACE_ON, null), spots: spotsList(f.spots) };
        });
        return { on: pick(p.on, PLACE_ON, null), scope: pick(p.scope, PLACE_SCOPE, null),
            ties: pick(p.ties, ['split', 'full'], 'split'), rounding: pick(p.rounding, ['cents', 'dollar'], 'cents'),
            onePrize: pick(p.onePrize, ['off', 'gross', 'larger'], 'off'), within: pick(p.within, ['event', 'round'], 'event'),
            flights: flights, edits: (p.edits && typeof p.edits === 'object') ? p.edits : {} };
    }
    var BASIS_WORD = { gross: 'Gross', net: 'Net' };

    // One ranking for one table, on the basis asked for. 'as' = as the event is scored.
    function tableRows(data, scopeId, basis, fid) {
        var ctl = g('computeTournamentLeaderboard');
        var refusedNet = function (v) { var f = g('netWasRefused'); return basis === 'net' && f ? f(v) : false; };
        var NO_NET = 'Net places need a real scorecard (a stroke index) for this course.';
        if (scopeId === 'single') {
            var d = basis === 'as' ? data : Object.assign({}, data, { scoringMode: basis });
            if (refusedNet(d)) return { available: false, reason: NO_NET, rows: [] };
            return { available: true, rows: ctl(d, fid) };
        }
        if (scopeId === 'event') {
            var v = g('resolveLeaderboardView')(data, 'event', fid, basis === 'as' ? undefined : { basis: basis });
            return { available: !!v.available, reason: v.reason || '', rows: v.rows || [] };
        }
        var rv = basis === 'as' ? g('roundView')(data, scopeId) : g('roundViewOnBasis')(data, scopeId, basis);
        if (!rv) return { available: false, reason: 'That round is no longer part of this event.', rows: [] };
        if (refusedNet(rv)) return { available: false, reason: NO_NET, rows: [] };
        return { available: true, rows: ctl(rv, fid) };
    }

    // Competition ranks again after a golfer is taken out (one prize per golfer):
    // the engine's tie groups are kept, the numbers close up.
    function rerank(rows) {
        var out = [], prevOld = null, prevNew = 0;
        rows.forEach(function (r, i) {
            var nr = (i > 0 && r.rank === prevOld) ? prevNew : i + 1;
            prevOld = r.rank; prevNew = nr;
            out.push(Object.assign({}, r, { rank: nr }));
        });
        return out;
    }

    function allocateTable(rows, amounts, R) {
        var placesSet = amounts.some(function (v) { return v > 0; });
        if (!placesSet) return [];
        var scored = rerank(rows.filter(function (r) { return r.hasScores; }));
        var tieCount = {}; scored.forEach(function (r) { tieCount[r.rank] = (tieCount[r.rank] || 0) + 1; });
        var paid;
        if (R.ties === 'full') {
            paid = scored.filter(function (r) { return r.rank <= amounts.length; }).map(function (r) { return { rank: r.rank, entry: r, amount: amounts[r.rank - 1] || 0 }; });
        } else {
            paid = g('allocatePlacePayouts')(scored, amounts).filter(function (p) { return p.amount > 0 || p.rank <= amounts.length; });
        }
        return paid.map(function (p) {
            var amt = R.rounding === 'dollar' ? Math.floor(p.amount + 1e-9) : round2(p.amount);
            return { rank: p.rank, tied: tieCount[p.rank] > 1, key: String(p.entry.entryKey || ''), name: String(p.entry.teamName || p.entry.name || ''),
                toPar: typeof p.entry.toPar === 'number' ? p.entry.toPar : null, amount: amt };
        });
    }

    // Every table this event awards: flight x basis x scope, in that order.
    function placeTables(data, prize, spots) {
        var R = placeRulesOf(data);
        var out = { available: true, reason: '', title: '', byFlight: true, groups: [], unflighted: 0, ruled: true, rules: R };
        var multi = !!(g('isMultiRound') && g('isMultiRound')(data));
        var scopes;
        if (!multi) scopes = [{ id: 'single', title: '' }];
        else if (R.scope) {
            var rounds = data.rounds || {};
            var rs = (g('countableRoundIds') ? g('countableRoundIds')(data) : Object.keys(rounds)).map(function (rid) { return { id: rid, title: (rounds[rid] && rounds[rid].name) || 'Round' }; });
            var ev = [{ id: 'event', title: 'Event total' }];
            scopes = R.scope === 'event' ? ev : R.scope === 'round' ? rs : ev.concat(rs);
        } else if (prize && prize.available) scopes = [{ id: prize.basis, title: '' }];   // named by Prizes go by, as today
        else { out.available = false; out.reason = (prize && prize.reason) || ''; return out; }
        var fids = flightIds(data);
        var flights = fids.length ? fids : [null];
        if (!fids.length) out.byFlight = false;
        var base = (spots || []).map(amountOf);
        var tables = [];
        flights.forEach(function (fid) {
            var fo = (fid && R.flights[fid]) || {};
            var on = fo.on || R.on;
            var bases = on === 'both' ? ['gross', 'net'] : on ? [on] : ['as'];
            var amounts = fo.spots && fo.spots.some(function (v) { return v > 0; }) ? fo.spots : base;
            scopes.forEach(function (sc) {
                bases.forEach(function (b) {
                    var t = tableRows(data, sc.id, b, fid);
                    var title = [fid ? (data.flights[fid].name || 'Flight') : '', b === 'as' ? '' : BASIS_WORD[b], sc.title].filter(Boolean).join(' · ');
                    tables.push({ key: (fid || 'all') + '|' + b + '|' + sc.id, flightId: fid, basis: b, scope: sc.id, title: title,
                        available: t.available, reason: t.reason || '', rows: t.available ? t.rows : [], amounts: amounts });
                });
            });
        });
        // ONE PRIZE PER GOLFER: a golfer placing in more than one table of the same
        // flight (and, within 'round', the same round) keeps one prize; the others
        // are worked out again without them, until nothing changes.
        var excluded = {}; tables.forEach(function (t) { excluded[t.key] = {}; });
        var award = {};
        for (var pass = 0; pass < 25; pass++) {
            tables.forEach(function (t) {
                award[t.key] = allocateTable(t.rows.filter(function (r) { return !excluded[t.key][String(r.entryKey || '')]; }), t.amounts, R);
            });
            if (R.onePrize === 'off') break;
            var changed = false, buckets = {};
            tables.forEach(function (t) {
                var b = (t.flightId || 'all') + (R.within === 'round' ? '|' + t.scope : '');
                (buckets[b] = buckets[b] || []).push(t);
            });
            Object.keys(buckets).forEach(function (b) {
                var wins = {};
                buckets[b].forEach(function (t, ti) { award[t.key].forEach(function (r) { if (r.key) (wins[r.key] = wins[r.key] || []).push({ t: t, ti: ti, amount: r.amount }); }); });
                Object.keys(wins).forEach(function (k) {
                    var w = wins[k]; if (w.length < 2) return;
                    var keep = R.onePrize === 'gross'
                        ? (w.filter(function (x) { return x.t.basis === 'gross'; })[0] || w[0])
                        : w.slice().sort(function (a, c) { return (c.amount - a.amount) || ((a.t.basis === 'gross' ? 0 : 1) - (c.t.basis === 'gross' ? 0 : 1)) || (a.ti - c.ti); })[0];
                    w.forEach(function (x) { if (x !== keep) { excluded[x.t.key][k] = true; changed = true; } });
                });
            });
            if (!changed) break;
        }
        out.groups = tables.map(function (t) {
            var ed = R.edits[t.key] || {};
            var rows = award[t.key].map(function (r) {
                var e = ed[r.key];
                if (e && isFinite(Number(e.amount))) return Object.assign({}, r, { amount: amountOf(e.amount), edited: true, note: String(e.note || '').slice(0, 120) });
                return r;
            });
            return { flightId: t.flightId, name: t.title, key: t.key, basis: t.basis, scope: t.scope, available: t.available, reason: t.reason, rows: rows,
                field: t.rows.filter(function (r) { return r.hasScores; }).length };
        });
        return out;
    }

    // PLACES. prize = resolvePrizeView(data): the saved basis, never a tab. With
    // flights, one ranking per flight from the engine on that same basis; the
    // amounts are the calculator's, and allocatePlacePayouts splits ties exactly
    // as it does for the overall list. A place inside the count with no amount is
    // a Trophy row; ranks past the count are not rows (the calculator's filter).
    function placeGroups(data, prize, spots) {
        if (placeRulesOf(data)) return placeTables(data, prize, spots);   // the organizer chose place rules
        var out = { available: !!(prize && prize.available), reason: (prize && prize.reason) || '',
            title: (prize && prize.title) || '', byFlight: false, groups: [], unflighted: 0 };
        if (!out.available) return out;
        var amounts = (spots || []).map(amountOf);
        var placesSet = amounts.some(function (v) { return v > 0; });
        var allocate = g('allocatePlacePayouts');
        var rowsFor = function (rows) {
            var scored = (rows || []).filter(function (r) { return r.hasScores; });
            return allocate(scored, amounts).filter(function (p) {
                return p.amount > 0 || (placesSet && p.rank <= amounts.length);
            }).map(function (p) {
                return { rank: p.rank, key: String(p.entry.entryKey || ''), name: String(p.entry.teamName || p.entry.name || ''),
                    toPar: typeof p.entry.toPar === 'number' ? p.entry.toPar : null, amount: p.amount };
            });
        };
        var fids = flightIds(data);
        if (!fids.length) {
            out.groups = [{ flightId: null, name: '', rows: placesSet ? rowsFor(prize.rows) : [] }];
            return out;
        }
        var view = g('resolveLeaderboardView');
        var sel = prize.basis === 'single' ? null : prize.basis;
        out.byFlight = true;
        out.groups = fids.map(function (fid) {
            var v = view(data, sel, fid);
            return { flightId: fid, name: data.flights[fid].name || 'Flight', rows: placesSet && v.available ? rowsFor(v.rows) : [] };
        });
        var known = {};
        fids.forEach(function (f) { known[f] = true; });
        out.unflighted = (prize.rows || []).filter(function (r) { return r.hasScores && !known[r.flightId]; }).length;
        return out;
    }

    // SKINS, per round. A single-round record is its own round; a multi-round
    // event counts every round that is open or closed, in play order.
    // ========================================================================
    // SKINS RULES (Starkey settings 8-11; Manny 2026-11-19: "then skins 8-11",
    // "Net skins full handicap (editable)"). Saved on the event, owner-written:
    //   tournaments/<code>/prizeSettings/skins = {
    //     games:     { <gameId>: { name, flights?: { <flightId>: true }, basis: 'gross'|'net'|'both', share? } }
    //                absent = one game, the whole field, gross (today)
    //     value:     'each' | 'share'   each = prizeSettings.perSkin a skin (today); share = each game's
    //                share divided by every skin it gives out (gross and net, every round), down to the dollar
    //     allowance: 1 | 0.75 | 0.5     the share of a golfer's handicap net skins use; absent = 1 (full)
    //     onePerHole: true | false      true = a golfer who wins a hole's gross skin sits out its net skin,
    //                                   which goes to whoever is low among the rest (Starkey 2025)
    //   }
    // Net strokes are the engine's: getStrokes(stroke index, handicap x allowance),
    // the handicap the round's own view carries. skins.js still holds no handicap.
    // ========================================================================
    function skinRulesOf(data) {
        var s = data && data.prizeSettings && data.prizeSettings.skins;
        if (!s || typeof s !== 'object') return null;
        var games = [];
        Object.keys(s.games || {}).forEach(function (id) {
            var x = s.games[id]; if (!x || typeof x !== 'object') return;
            var fl = x.flights && typeof x.flights === 'object' ? Object.keys(x.flights).filter(function (k) { return x.flights[k]; }) : [];
            games.push({ id: id, name: String(x.name || '').slice(0, 40), flights: fl, basis: pick(x.basis, ['gross', 'net', 'both'], 'gross'),
                share: amountOf(x.share), createdAt: Number(x.createdAt) || 0 });
        });
        games.sort(function (a, b) { return (a.createdAt - b.createdAt) || a.id.localeCompare(b.id); });
        var al = Number(s.allowance);
        return { games: games, shareAll: amountOf(s.share), value: pick(s.value, ['each', 'share'], 'each'), allowance: (al === 0.75 || al === 0.5) ? al : 1, onePerHole: s.onePerHole === true };
    }
    var NET_SKINS_NO_SI = 'Net skins need a real scorecard (a stroke index) for this course.';
    var NET_SKINS_TEAMS = 'Net skins are for events scored golfer by golfer.';

    function ruledSkins(data, st, K) {
        var multi = g('isMultiRound') && g('isMultiRound')(data);
        var rv = g('roundView');
        var rounds = multi
            ? g('countableRoundIds')(data).map(function (rid) { return { id: rid, name: ((data.rounds || {})[rid] || {}).name || 'Round', view: rv(data, rid) }; }).filter(function (r) { return r.view; })
            : [{ id: null, name: '', view: data || {} }];
        var nameOf = g('competitorDisplayName') || function (p) { return (p && p.name) || ''; };
        var S = root.TournamentSkins;
        var games = K.games.length ? K.games : [{ id: 'all', name: '', flights: [], basis: 'gross', share: K.shareAll }];
        var named = games.length > 1 || games.some(function (x) { return x.name; });
        var getStrokes = g('getStrokes'), parseHcp = g('parseHcp'), netOk = g('netIsInPlay');
        var panels = [], gameOut = [];
        games.forEach(function (gm) {
            var bases = gm.basis === 'both' ? ['gross', 'net'] : [gm.basis];
            var mine = [];
            rounds.forEach(function (r) {
                var view = r.view;
                var players = view.players || {};
                var ent = S.entrantsFromRecord(view, nameOf).filter(function (e) {
                    if (!gm.flights.length) return true;
                    var p = players[e.id]; return !!p && gm.flights.indexOf(p.flightId) !== -1;
                });
                var isGolfers = !!(view.scoringModel === 'player-v1' || Object.keys(players).length);
                var netEnt = null, netReason = '';
                if (bases.indexOf('net') !== -1) {
                    if (!isGolfers || !getStrokes || !parseHcp) netReason = NET_SKINS_TEAMS;
                    else if (netOk && !netOk(Object.assign({}, view, { scoringMode: 'net' }))) netReason = NET_SKINS_NO_SI;
                    else netEnt = ent.map(function (e) {
                        var h = parseHcp((players[e.id] || {}).handicap);
                        h = isFinite(h) ? Math.round(h * K.allowance) : 0;
                        var strokes = {};
                        (view.courseData || []).forEach(function (x) { strokes[x.hole] = getStrokes(x.hcpIndex, h) || 0; });
                        return Object.assign({}, e, { strokes: strokes });
                    });
                }
                var opts = { carryover: st.carryover };
                var gross = bases.indexOf('gross') !== -1 ? S.computeSkins({ holes: view.courseData || [], entrants: ent }, Object.assign({ scoringBasis: 'gross' }, opts)) : null;
                var net = null;
                if (netEnt) {
                    var ex = {};
                    for (var pass = 0; pass < 20; pass++) {
                        net = S.computeSkins({ holes: view.courseData || [], entrants: netEnt }, Object.assign({ scoringBasis: 'net', excludeOnHole: ex }, opts));
                        if (!(K.onePerHole && gross)) break;
                        var grossWin = {}; gross.holes.forEach(function (x) { if (x.status === 'won') grossWin[x.hole] = x.winner; });
                        var more = false;
                        net.holes.forEach(function (x) { if (x.status === 'won' && grossWin[x.hole] === x.winner) { ex[x.hole] = (ex[x.hole] || []).concat([x.winner]); more = true; } });
                        if (!more) break;
                    }
                } else if (bases.indexOf('net') !== -1) {
                    net = { available: false, reason: netReason, carryover: st.carryover, holes: [], tally: {}, totals: { holesWon: 0, skins: 0, carried: 0, notWon: 0, pending: 0 } };
                }
                [['gross', gross], ['net', net]].forEach(function (p) {
                    if (!p[1]) return;
                    var title = [named ? (gm.name || 'Skins') : '', p[0] === 'net' || gm.basis === 'both' ? BASIS_WORD[p[0]] : '', r.name].filter(Boolean).join(' · ');
                    mine.push({ id: (r.id || 'r') + '|' + gm.id + '|' + p[0], name: title, game: gm.id, basis: p[0], result: p[1] });
                });
            });
            var n = mine.reduce(function (a, p) { return a + p.result.totals.skins; }, 0);
            var per = K.value === 'share' ? (n ? Math.floor(gm.share / n + 1e-9) : 0) : st.perSkin;
            mine.forEach(function (p) { p.perSkin = per; panels.push(p); });
            gameOut.push({ id: gm.id, name: gm.name, flights: gm.flights, basis: gm.basis, share: gm.share, skins: n, perSkin: per, total: round2(n * per) });
        });
        var skins = panels.reduce(function (a, p) { return a + p.result.totals.skins; }, 0);
        var pers = gameOut.map(function (x) { return x.perSkin; });
        return { perSkin: pers.every(function (v) { return v === pers[0]; }) ? pers[0] : 0, carryover: st.carryover, multi: !!multi, rounds: panels, skins: skins,
            carried: panels.reduce(function (a, p) { return a + p.result.totals.carried; }, 0),
            holesWon: panels.reduce(function (a, p) { return a + p.result.totals.holesWon; }, 0),
            total: round2(gameOut.reduce(function (a, x) { return a + x.total; }, 0)), games: gameOut, ruled: true, rules: K };
    }

    function skinsSummary(data, settings) {
        var st = settings || settingsOf(data);
        var K = skinRulesOf(data);
        if (K) return ruledSkins(data || {}, st, K);   // the organizer chose skins rules
        var multi = g('isMultiRound') && g('isMultiRound')(data);
        var rounds;
        if (multi) {
            var rv = g('roundView'), ids = g('countableRoundIds')(data), all = data.rounds || {};
            rounds = ids.map(function (rid) { return { id: rid, name: (all[rid] && all[rid].name) || 'Round', view: rv(data, rid) }; })
                .filter(function (r) { return r.view; });
        } else {
            rounds = [{ id: null, name: '', view: data || {} }];
        }
        var nameOf = g('competitorDisplayName') || function (p) { return (p && p.name) || ''; };
        var S = root.TournamentSkins;
        var out = rounds.map(function (r) {
            var res = S.computeSkins({ holes: r.view.courseData || [], entrants: S.entrantsFromRecord(r.view, nameOf) },
                { carryover: st.carryover, scoringBasis: 'gross' });
            return { id: r.id, name: r.name, result: res };
        });
        var skins = out.reduce(function (s, r) { return s + r.result.totals.skins; }, 0);
        var carried = out.reduce(function (s, r) { return s + r.result.totals.carried; }, 0);
        var won = out.reduce(function (s, r) { return s + r.result.totals.holesWon; }, 0);
        return { perSkin: st.perSkin, carryover: st.carryover, multi: !!multi, rounds: out, skins: skins,
            carried: carried, holesWon: won, total: round2(skins * st.perSkin) };
    }

    // Whose a contest entry is: team<N>_p<i> belongs to that team, a player id is the player.
    function contestOwnerKey(data, entryKey) {
        var m = /^team(\d+)_p\d+$/.exec(String(entryKey || ''));
        if (!m) return String(entryKey || '');
        var teams = (data && data.teams) || {};
        var tid = Object.keys(teams).filter(function (k) { return teams[k] && Number(teams[k].num) === Number(m[1]); })[0];
        return tid || '';
    }

    // KPs and long drives: the holes the organizer confirmed on the Contests tab
    // ("Make winner"). One-round events only, as the Contests tab is.
    function contestsSummary(data, entries, settings) {
        var st = settings || settingsOf(data);
        var multi = !!(g('isMultiRound') && g('isMultiRound')(data));
        var out = { multi: multi, perContest: st.perContest, rows: [], open: [], total: 0 };
        var C = root.TournamentContests;
        // KPs per round (settings 12): a two-round event's contest holes live on each round.
        var rids = multi ? (g('countableRoundIds') ? g('countableRoundIds')(data) : Object.keys(data.rounds || {})) : [null];
        rids.forEach(function (rid) {
        var view = C.contestView ? C.contestView(data, rid) : data;
        var ents = C.entriesFor ? C.entriesFor(entries, rid) : entries;
        var rname = rid ? (view.roundName || 'Round') : '';
        // KP settings 12-13: one winner a hole (as always), or one a flight; a shared tie splits the amount
        // between the winners of that flight (or of the field).
        var perFlight = C.kpRulesOf ? C.kpRulesOf(data).perFlight : false;
        var fl = (data && data.flights) || {};
        C.contestList(view || {}).forEach(function (c) {
            var ws = (c.winners || (c.winner ? [c.winner] : [])).filter(function (k) { return ((ents || {})[c.key] || {})[k]; });
            if (!ws.length) { out.open.push({ hole: c.hole, kind: c.kind, round: rname }); return; }
            var byGroup = {};
            ws.forEach(function (k) { var gid = perFlight ? (C.flightOfKey(data, k) || 'none') : 'all'; (byGroup[gid] = byGroup[gid] || []).push(k); });
            Object.keys(byGroup).forEach(function (gid) {
                var n = byGroup[gid].length;
                byGroup[gid].forEach(function (k) {
                    var e = ents[c.key][k];
                    var row = { hole: c.hole, kind: c.kind, key: contestOwnerKey(data, k), name: String(e.name || ''), value: C.valueText(e), amount: round2(st.perContest / n) };
                    if (rname) row.round = rname;
                    if (perFlight) row.flight = gid === 'none' ? 'No flight' : ((fl[gid] && fl[gid].name) || 'Flight');
                    if (n > 1) row.shared = n;
                    out.rows.push(row);
                });
            });
        });
        });
        out.total = round2(out.rows.reduce(function (a, r) { return a + r.amount; }, 0));
        return out;
    }

    function summary(data, entries, spots) {
        var d = data || {};
        var prize = g('resolvePrizeView')(d);
        var settings = settingsOf(d);
        var places = placeGroups(d, prize, spots);
        var skins = skinsSummary(d, settings);
        var contests = contestsSummary(d, entries, settings);
        var placeTotal = 0, trophies = 0;
        places.groups.forEach(function (gr) { gr.rows.forEach(function (r) { if (r.amount > 0) placeTotal += r.amount; else trophies++; }); });
        placeTotal = round2(placeTotal);
        return { prize: prize, places: places, skins: skins, contests: contests, placeTotal: placeTotal, trophies: trophies,
            total: round2(placeTotal + skins.total + contests.total) };
    }

    function hostOf(data) {
        var d = data || {};
        var v = String(d.venue || '').trim() || String(d.courseName || '').trim();
        if (v) return v;
        var rounds = d.rounds || {};
        var ids = (g('orderedRoundIds') ? g('orderedRoundIds')(d) : Object.keys(rounds));
        for (var i = 0; i < ids.length; i++) if (rounds[ids[i]] && rounds[ids[i]].courseName) return String(rounds[ids[i]].courseName);
        return '';
    }

    // What Post results saves. JSON-clean (no undefined); a null toPar is
    // dropped by the database, and posted() reads its absence as null.
    function recordFor(data, sum) {
        var sk = sum.skins;
        var rec = {
            v: 1, prizeType: typeOf(data), host: hostOf(data), basisTitle: sum.places.title || '',
            places: sum.places.groups.map(function (gr) {
                return { flight: gr.name || '', rows: gr.rows.map(function (r) {
                    var o = { rank: r.rank, key: r.key, name: r.name, amount: r.amount };
                    if (typeof r.toPar === 'number') o.toPar = r.toPar;
                    if (r.edited) { o.set = true; if (r.note) o.note = r.note; }   // the organizer's Adjust
                    return o;
                }) };
            }),
            skins: { perSkin: sk.perSkin, carryover: sk.carryover, skins: sk.skins, total: sk.total,
                rounds: sk.rounds.map(function (r) {
                    var owner = {};
                    Object.keys(r.result.tally).forEach(function (id) { owner[id] = r.result.tally[id].owner; });
                    return { name: r.name || '', notWon: r.result.totals.notWon, pending: r.result.totals.pending,
                        won: r.result.holes.filter(function (h) { return h.status === 'won'; }).map(function (h) {
                            return { hole: h.hole, par: h.par || 0, key: owner[h.winner] || h.winner, name: h.name, score: h.score,
                                skins: h.skins, carriedIn: h.carriedIn, amount: round2(h.skins * (typeof r.perSkin === 'number' ? r.perSkin : sk.perSkin)) };
                        }) };
                }) },
            contests: { perContest: sum.contests.perContest, multi: sum.contests.multi, total: sum.contests.total,
                rows: sum.contests.rows.map(function (c) { var o = { hole: c.hole, kind: c.kind, key: c.key, name: c.name, value: c.value, amount: c.amount }; if (c.flight) o.flight = c.flight; if (c.shared) o.shared = c.shared; if (c.round) o.round = c.round; return o; }) },
            placeTotal: sum.placeTotal, trophies: sum.trophies, total: sum.total,
            golfers: g('competitorCount') ? g('competitorCount')(data || {}) : 0
        };
        return JSON.parse(JSON.stringify(rec));
    }

    // The posted record, read back defensively: the database turns arrays with
    // gaps into objects and drops empty ones. null when nothing is posted.
    function list(x) {
        if (Array.isArray(x)) return x.filter(Boolean);
        if (x && typeof x === 'object') return Object.keys(x).sort(function (a, b) { return Number(a) - Number(b); }).map(function (k) { return x[k]; }).filter(Boolean);
        return [];
    }
    function posted(data) {
        var p = data && data.prizeResults;
        if (!p || typeof p !== 'object' || !p.postedAt) return null;
        var sk = p.skins || {}, ct = p.contests || {};
        var n = function (v) { var x = Number(v); return isFinite(x) ? x : 0; };
        return {
            postedAt: n(p.postedAt), host: String(p.host || ''), basisTitle: String(p.basisTitle || ''),
            places: list(p.places).map(function (gr) {
                return { flight: String(gr.flight || ''), rows: list(gr.rows).map(function (r) {
                    return { rank: n(r.rank), key: String(r.key || ''), name: String(r.name || ''),
                        toPar: typeof r.toPar === 'number' ? r.toPar : null, amount: amountOf(r.amount) };
                }) };
            }),
            skins: { perSkin: amountOf(sk.perSkin), carryover: sk.carryover !== false, skins: n(sk.skins), total: amountOf(sk.total),
                rounds: list(sk.rounds).map(function (r) {
                    return { name: String(r.name || ''), notWon: n(r.notWon), pending: n(r.pending), won: list(r.won).map(function (h) {
                        return { hole: n(h.hole), par: n(h.par) || null, key: String(h.key || ''), name: String(h.name || ''),
                            score: n(h.score), skins: n(h.skins), carriedIn: n(h.carriedIn), amount: amountOf(h.amount) };
                    }) };
                }) },
            contests: { perContest: amountOf(ct.perContest), multi: ct.multi === true, total: amountOf(ct.total),
                rows: list(ct.rows).map(function (c) {
                    return { hole: n(c.hole), kind: c.kind === 'ld' ? 'ld' : 'kp', key: String(c.key || ''), name: String(c.name || ''),
                        value: String(c.value || ''), amount: amountOf(c.amount) };
                }) },
            placeTotal: amountOf(p.placeTotal), trophies: n(p.trophies), total: amountOf(p.total), golfers: n(p.golfers)
        };
    }

    // One golfer's (or team's) share of the posted results.
    function myResults(post, key) {
        var out = { key: String(key || ''), name: '', places: [], skins: [], contests: [], total: 0, trophies: 0 };
        if (!post || !out.key) return out;
        post.places.forEach(function (gr) {
            gr.rows.forEach(function (r) {
                if (r.key !== out.key) return;
                out.places.push({ flight: gr.flight, rank: r.rank, toPar: r.toPar, amount: r.amount });
                if (r.amount > 0) out.total += r.amount; else out.trophies++;
                out.name = out.name || r.name;
            });
        });
        post.skins.rounds.forEach(function (rd) {
            rd.won.forEach(function (h) {
                if (h.key !== out.key) return;
                out.skins.push({ round: rd.name, hole: h.hole, par: h.par, score: h.score, skins: h.skins, carriedIn: h.carriedIn, name: h.name, amount: h.amount });
                out.total += h.amount;
            });
        });
        post.contests.rows.forEach(function (c) {
            if (c.key !== out.key) return;
            out.contests.push(c);
            out.total += c.amount;
            out.name = out.name || c.name;
        });
        out.total = round2(out.total);
        return out;
    }

    var api = {
        PRIZE_WORD: PRIZE_WORD, typeOf: typeOf, wordOf: wordOf, wordCap: wordCap, amountOf: amountOf, money: money,
        amountText: amountText, shortWord: shortWord, shortText: shortText, settingsOf: settingsOf, flightIds: flightIds, placeGroups: placeGroups, placeRulesOf: placeRulesOf, placeTables: placeTables, skinRulesOf: skinRulesOf,
        skinsSummary: skinsSummary, contestOwnerKey: contestOwnerKey, contestsSummary: contestsSummary,
        summary: summary, hostOf: hostOf, CARRY_OFF_FROM: CARRY_OFF_FROM, recordFor: recordFor, posted: posted, myResults: myResults
    };
    root.TournamentPrizes = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
