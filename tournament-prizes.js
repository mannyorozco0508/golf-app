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

    function settingsOf(data) {
        var s = (data && data.prizeSettings) || {};
        return { perSkin: amountOf(s.perSkin), carryover: s.carryover !== false, perContest: amountOf(s.perContest) };
    }

    // Flights in the order the board's flight filter shows them.
    function flightIds(data) {
        var f = (data && data.flights) || {};
        return Object.keys(f).filter(function (k) { return f[k]; }).sort(function (a, b) {
            return ((f[a].createdAt || 0) - (f[b].createdAt || 0)) || String(f[a].name || '').localeCompare(String(f[b].name || ''));
        });
    }

    // PLACES. prize = resolvePrizeView(data): the saved basis, never a tab. With
    // flights, one ranking per flight from the engine on that same basis; the
    // amounts are the calculator's, and allocatePlacePayouts splits ties exactly
    // as it does for the overall list. A place inside the count with no amount is
    // a Trophy row; ranks past the count are not rows (the calculator's filter).
    function placeGroups(data, prize, spots) {
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
    function skinsSummary(data, settings) {
        var st = settings || settingsOf(data);
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
        if (multi) return out;
        var C = root.TournamentContests;
        C.contestList(data || {}).forEach(function (c) {
            var e = c.winner ? (((entries || {})[c.key] || {})[c.winner] || null) : null;
            if (!e) { out.open.push({ hole: c.hole, kind: c.kind }); return; }
            out.rows.push({ hole: c.hole, kind: c.kind, key: contestOwnerKey(data, c.winner), name: String(e.name || ''),
                value: C.valueText(e), amount: st.perContest });
        });
        out.total = round2(out.rows.length * st.perContest);
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
                                skins: h.skins, carriedIn: h.carriedIn, amount: round2(h.skins * sk.perSkin) };
                        }) };
                }) },
            contests: { perContest: sum.contests.perContest, multi: sum.contests.multi, total: sum.contests.total,
                rows: sum.contests.rows.map(function (c) { return { hole: c.hole, kind: c.kind, key: c.key, name: c.name, value: c.value, amount: c.amount }; }) },
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
        amountText: amountText, shortWord: shortWord, shortText: shortText, settingsOf: settingsOf, flightIds: flightIds, placeGroups: placeGroups,
        skinsSummary: skinsSummary, contestOwnerKey: contestOwnerKey, contestsSummary: contestsSummary,
        summary: summary, hostOf: hostOf, recordFor: recordFor, posted: posted, myResults: myResults
    };
    root.TournamentPrizes = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
