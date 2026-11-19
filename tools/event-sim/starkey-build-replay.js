#!/usr/bin/env node
// ============================================================================
// THE FOUR STARKEY YEARS THROUGH THE BUILT PLACE RULES (Manny 2026-11-19, layout B, places 1-7). INTERNAL ONLY:
// golfer names are printed here and written to the mailbox (starkey-history/replay-build.json), never the repo.
//
// starkey-plan-replay.js tested the PLAN (planned-rules.js, a model). This feeds the same official standings into the
// BUILT code: tournament-prizes.js placeTables from a checkout (default ~/golf-app-tournaments-places), with the real
// payouts.js allocatePlacePayouts and the real tournament-engine.js rankRows. The rules are set the way an organizer
// would set them on the Prizes tab (prizeSettings.places). What is stood in, and only this: the archive has no
// hole-by-hole cards, so the engine's leaderboard calls are answered with each year's official to-par standings,
// ranked by the engine's own rankRows (competition places).
//   node tools/event-sim/starkey-build-replay.js [checkout]
// ============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const P = require('./starkey-plan-replay.js');
const ROOT = process.argv[2] || path.join(os.homedir(), 'golf-app-tournaments-places');
const out = [];
const say = (year, verdict, what, detail) => { out.push({ year, verdict, what, detail: detail || '' }); console.log(year + ' ' + verdict.padEnd(6) + ' ' + what + (detail ? '\n             ' + detail : '')); };
const money = (n) => '$' + (Math.round(n * 100) / 100);

// One realm with the app's own files, then the leaderboard answered from `STAND[scope][basis][flight]`.
function realm(STAND) {
    const ctx = { console, Math, Date, JSON, Object, Array, Number, String, isFinite, parseInt, parseFloat };
    ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
    vm.createContext(ctx);
    ['handicap.js', 'payouts.js', 'tournament-engine.js', 'skins.js', 'tournament-contests.js', 'tournament-prizes.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
    const rank = (rows) => vm.runInContext('rankRows', ctx)(rows.map((r, i) => ({ entryKey: r.id, playerId: r.id, teamName: r.name || r.id, toPar: r.toPar, hasScores: true, num: i + 1 })), (a, b) => a.toPar - b.toPar, (r, p) => r.toPar === p.toPar);
    const get = (scope, basis, fid) => rank(((STAND[scope] || {})[basis] || {})[fid || 'all'] || []);
    ctx.isMultiRound = (d) => !!d.rounds;
    ctx.countableRoundIds = (d) => Object.keys(d.rounds || {});
    ctx.netWasRefused = () => false;
    ctx.roundView = (d, rid) => ({ __scope: rid, __basis: 'as' });
    ctx.roundViewOnBasis = (d, rid, b) => ({ __scope: rid, __basis: b });
    ctx.resolveLeaderboardView = (d, sel, fid, o) => ({ available: true, rows: get('event', (o && o.basis) || 'as', fid) });
    ctx.computeTournamentLeaderboard = (d, fid) => (d.__scope ? get(d.__scope, d.__basis, fid) : get('single', d.scoringMode, fid));
    return ctx;
}
function compare(year, what, paid, got, names, edited) {
    const fmt = (l) => l.map((p) => (names[p.id || p.key] || p.name || p.key) + ' ' + money(p.amount)).join(', ');
    const d = [];
    paid.forEach((p) => { const a = got.find((x) => x.key === p.id); if (!a) d.push('paid ' + (names[p.id] || p.name) + ' ' + money(p.amount) + ', the build nothing'); else if (Math.abs(a.amount - p.amount) > 0.005) d.push((names[p.id] || p.name) + ' paid ' + money(p.amount) + ', the build ' + money(a.amount)); });
    got.forEach((a) => { if (!paid.some((p) => p.id === a.key)) d.push('the build pays ' + (names[a.key] || a.name) + ' ' + money(a.amount) + ', not paid'); });
    if (d.length) return say(year, 'DIFF', what, 'paid: ' + fmt(paid) + '\nbuild: ' + fmt(got) + '\n' + d.join('; '));
    say(year, edited ? 'ADJUST' : 'MATCH', what + (edited ? ' (' + edited + ' rows set with Adjust)' : ''), fmt(got));
}
function run(year, data, STAND, checks) {
    const ctx = realm(STAND);
    const res = ctx.TournamentPrizes.placeTables(data, { available: true, basis: 'event' }, data.payoutSpots);
    checks.forEach(([key, title, paid, names, edited]) => {
        const g = res.groups.find((x) => x.key === key);
        if (!g) return say(year, 'DIFF', title, 'the build made no table ' + key + '; it made ' + res.groups.map((x) => x.key).join(', '));
        compare(year, title + '  [' + g.name + ']', paid, g.rows, names, edited);
    });
}
const rowsOf = (L, k) => L.filter((r) => r[k] !== undefined && isFinite(r[k])).map((r) => ({ id: r.id, name: r.name, toPar: r[k] }));

function main() {
    // 2023 -----------------------------------------------------------------------------------------------------
    {
        const G = P.gg('2023/golfgenius/2023-gross-leaderboard.txt', 72), N = P.gg('2023/golfgenius/2023-net-leaderboard.txt', 72);
        const names = {}; G.concat(N).forEach((r) => { names[r.id] = r.name; });
        const paid = P.placeTables('2023/2023-Starkey-Invitational-Results.xlsx');
        const S = { single: { gross: { all: rowsOf(G, 'total') }, net: { all: rowsOf(N, 'total') } } };
        say(2023, 'SET', 'Places go by gross and net · ties split · to the cent · one prize per golfer: the larger prize · 1st $400 2nd $300 3rd $200 4th $100');
        run(2023, { payoutSpots: [400, 300, 200, 100], prizeSettings: { places: { on: 'both', onePrize: 'larger' } } }, S,
            [['all|gross|single', 'low gross', paid['LOW GROSS'], names], ['all|net|single', 'low net', paid['LOW NET'], names]]);
        say(2023, 'NOTE', 'the same with one prize per golfer: gross first (Manny\'s default)');
        run(2023, { payoutSpots: [400, 300, 200, 100], prizeSettings: { places: { on: 'both', onePrize: 'gross' } } }, S,
            [['all|gross|single', 'low gross', paid['LOW GROSS'], names], ['all|net|single', 'low net', paid['LOW NET'], names]]);
    }
    // 2024 -----------------------------------------------------------------------------------------------------
    {
        const G = P.gg('2024/golfgenius/2024-36hole-gross-leaderboard.txt', 72), N = P.gg('2024/golfgenius/2024-36hole-net-leaderboard.txt', 72);
        const names = {}; G.concat(N).forEach((r) => { names[r.id] = r.name; });
        const paid = P.placeTables('2024/2024-Starkey-Invitational-Results.xlsx');
        const S = { r1: { gross: { all: rowsOf(G, 'r1') }, net: { all: rowsOf(N, 'r1') } }, r2: { gross: { all: rowsOf(G, 'r2') }, net: { all: rowsOf(N, 'r2') } } };
        say(2024, 'SET', 'Places go by gross and net · places are for each round · ties split · down to the dollar · one prize per golfer: gross first, in each round · $250/$200/$150/$100/$50');
        run(2024, { payoutSpots: [250, 200, 150, 100, 50], rounds: { r1: { name: 'Olympic' }, r2: { name: 'Cascade' } },
            prizeSettings: { places: { on: 'both', scope: 'round', rounding: 'dollar', onePrize: 'gross', within: 'round' } } }, S,
            [['all|gross|r1', 'olympic gross', paid['OLYMPIC GROSS'], names], ['all|net|r1', 'olympic net', paid['OLYMPIC NET'], names],
                ['all|gross|r2', 'cascade gross', paid['CASCADE GROSS'], names], ['all|net|r2', 'cascade net', paid['CASCADE NET'], names]]);
    }
    // 2025 -----------------------------------------------------------------------------------------------------
    {
        const G = P.gg('2025/golfgenius/2025-gross-leaderboard-with-purse.txt', 72), N = P.gg('2025/golfgenius/2025-net-leaderboard-with-purse.txt', 72);
        const names = {}; G.concat(N).forEach((r) => { names[r.id] = r.name; });
        const paid = P.placeTables('2025/2025-Starkey-Invitational-Payouts.xlsx');
        paid['OLYMPIC GROSS'].concat(paid['OLYMPIC NET']).forEach((p) => { names[p.id] = names[p.id] || p.name; });
        // Olympic: paper only, no standings in the archive; the paid rows' own places stand in (money only)
        const olyRows = (t) => paid[t].map((p) => ({ id: p.id, name: p.name, toPar: Number(p.label.replace('T', '')) }));
        const S = { r1: { gross: { all: rowsOf(G, 'total') }, net: { all: rowsOf(N, 'total') } }, r2: { gross: { all: olyRows('OLYMPIC GROSS') }, net: { all: olyRows('OLYMPIC NET') } } };
        const edits = {}; paid['OLYMPIC GROSS'].filter((p) => p.label === 'T3').forEach((p) => { edits[p.id] = { amount: 150, note: 'committee call' }; });
        say(2025, 'SET', 'as 2024, to the cent; Olympic gross\'s two tied 3rd set to $150 with Adjust (the committee\'s call)');
        run(2025, { payoutSpots: [250, 200, 150, 100, 50], rounds: { r1: { name: 'Cascade' }, r2: { name: 'Olympic' } },
            prizeSettings: { places: { on: 'both', scope: 'round', onePrize: 'gross', within: 'round', edits: { 'all|gross|r2': edits } } } }, S,
            [['all|gross|r1', 'cascade gross', paid['CASCADE GROSS'], names], ['all|net|r1', 'cascade net', paid['CASCADE NET'], names],
                ['all|gross|r2', 'olympic gross (money only)', paid['OLYMPIC GROSS'], names, Object.keys(edits).length], ['all|net|r2', 'olympic net (money only)', paid['OLYMPIC NET'], names]]);
    }
    // 2026 -----------------------------------------------------------------------------------------------------
    {
        const W = P.sheets(path.join(os.homedir(), 'Desktop', 'Starkey-Gold-Mountain-results', '2026-STARKEY-INVITATIONAL-RESULTS.xlsx'));
        const num = (v) => { const t = String(v == null ? '' : v).trim().toUpperCase(); if (t === 'E') return 0; if (!t || t === 'DNF') return null; const n = Number(t.replace('+', '')); return isFinite(n) ? n : null; };
        const FL = [['f1', 'FLIGHT 1', { name: 'A', cn: 'B', cg: 'C', on: 'E', og: 'F' }, { lab: 'K', name: 'L', par: 'M', amt: 'N' }, true],
            ['f2', 'FLIGHT 2', { name: 'A', cn: 'B', cg: 'C', on: 'E', og: 'F' }, { lab: 'K', name: 'L', par: 'M', amt: 'N' }, true],
            ['f3', 'FLIGHT 3', { name: 'A', cn: 'B', cg: 'C', on: 'E', og: 'F' }, { lab: 'K', name: 'L', par: 'M', amt: 'N' }, true],
            ['fL', 'LADIES FLIGHT', { name: 'A', cn: 'B', on: 'D' }, { lab: 'H', name: 'I', par: 'J', amt: 'K' }, false]];
        const S = { single: { gross: {}, net: {} } }; const names = {}; const lists = {};
        FL.forEach(([fid, sheet, c, L, gross]) => {
            const golfers = W[sheet].slice(2).filter((r) => String(r[c.name] || '').trim()).map((r) => ({ id: P.keyOf(r[c.name]), name: String(r[c.name]).trim(), cn: num(r[c.cn]), on: num(r[c.on]), cg: gross ? num(r[c.cg]) : null, og: gross ? num(r[c.og]) : null, dnf: Object.values(r).some((v) => String(v).toUpperCase() === 'DNF') }));
            golfers.forEach((g) => { names[g.id] = g.name; });
            let cur = null; lists[fid] = {};
            W[sheet].forEach((r) => {
                const lab = String(r[L.lab] || '').trim().toUpperCase();
                if (/^AGG\. (GROSS|NET)$/.test(lab)) { cur = lab.endsWith('GROSS') ? 'gross' : 'net'; lists[fid][cur] = []; return; }
                if (cur && /^(T?\d+)(ST|ND|RD|TH)?$/.test(lab) && r[L.name]) lists[fid][cur].push({ label: lab, id: P.idIn(r[L.name], golfers), name: String(r[L.name]).trim(), toPar: num(r[L.par]), amount: Number(r[L.amt]) || 0 });
            });
            ['gross', 'net'].forEach((b) => {
                if (b === 'gross' && !gross) return;
                const u = golfers.filter((g) => !g.dnf && (b === 'net' ? g.cn !== null && g.on !== null : g.cg !== null && g.og !== null)).map((g) => ({ id: g.id, name: g.name, toPar: b === 'net' ? g.cn + g.on : g.cg + g.og }));
                (lists[fid][b] || []).forEach((p) => { if (!u.some((x) => x.id === p.id)) u.push({ id: p.id, name: p.name, toPar: p.toPar }); });
                S.single[b][fid] = u;
            });
        });
        const data = (op) => ({ payoutSpots: [250, 175, 100],
            flights: { f1: { name: 'Flight 1', createdAt: 1 }, f2: { name: 'Flight 2', createdAt: 2 }, f3: { name: 'Flight 3', createdAt: 3 }, fL: { name: 'Ladies', createdAt: 4 } },
            prizeSettings: { places: { on: 'both', onePrize: op, flights: { fL: { on: 'net', spots: [250, 200, 150, 100] } } } } });
        const checks = [];
        FL.forEach(([fid, sheet, c, L, gross]) => { (gross ? ['gross', 'net'] : ['net']).forEach((b) => checks.push([fid + '|' + b + '|single', sheet.toLowerCase() + ' ' + b, lists[fid][b], names])); });
        say(2026, 'SET', 'four flights · Places go by gross and net · Ladies: net, its own 1st $250 2nd $200 3rd $150 4th $100 · men $250/$175/$100 · ties split · one prize per golfer: gross first');
        run(2026, data('gross'), S, checks);
        say(2026, 'NOTE', 'the same with one prize per golfer: the larger prize');
        run(2026, data('larger'), S, checks);
    }
    fs.writeFileSync(path.join(P.H, 'replay-build.json'), JSON.stringify(out, null, 1));
}
main();
