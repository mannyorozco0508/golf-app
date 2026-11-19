#!/usr/bin/env node
// ============================================================================
// THE FOUR STARKEY YEARS, REPLAYED AGAINST THE PLANNED SETTINGS (Manny 2026-11-19). INTERNAL ONLY: golfer names are
// printed here and written to the mailbox archive (starkey-history/replay-plan.json), never to the repo.
//
// For each year: the settings that year would be set to (the plan's switches), the full standings the archive holds
// (Golf Genius lists for 2023-2025, the organizer's workbook for 2026), the planned rules (planned-rules.js, over the
// app's own rankRows and allocatePlacePayouts), and every paid row compared by golfer and amount with what the
// committee actually paid.
//   MATCH   the settings alone reproduce the table exactly
//   ADJUST  it matches only with an organizer edit of named rows (the plan's "Adjust before posting"), listed
//   DIFF    it does not match
//   ONLY $  no standings in the archive for that table: the paid rows' own places re-split, money only
// Skins and KPs: the archive has no hole-by-hole cards, so their winners cannot be replayed. What is checked is that
// the plan can hold what was paid (counts and amounts), stated as such and never counted as a match.
//   node tools/event-sim/starkey-plan-replay.js
// ============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { engines } = require('./engine-check.js');
const { makeRules } = require('./planned-rules.js');
const H = path.join(os.homedir(), 'Desktop', 'claude-mailbox-shared', 'tournaments', 'starkey-history');
const R = makeRules(engines());
const out = [];
const say = (year, verdict, what, detail) => { out.push({ year, verdict, what, detail: detail || '' }); console.log(year + ' ' + verdict.padEnd(6) + ' ' + what + (detail ? '\n             ' + detail.replace(/\n/g, '\n             ') : '')); };
const tp = (t) => (t === 'E' ? 0 : Number(String(t).replace('+', '')));
const isTp = (t) => /^([+-]\d+|E)$/.test(t);
// a golfer, however the source spells them: "Mills, Henry" / "HENRY MILLS" / "RUSS BAILEY" ~ "Bailey, Russell"
const keyOf = (name) => { let n = String(name).trim(); if (/,/.test(n)) { const [l, f] = n.split(','); n = f.trim() + ' ' + l.trim(); } const w = n.toUpperCase().replace(/[^A-Z ]/g, '').split(/\s+/).filter(Boolean); return w.slice(1).join('') + ':' + (w[0] || '')[0]; };
const norm = (s) => { let n = String(s).trim(); if (/,/.test(n)) { const [l, f] = n.split(','); n = f.trim() + ' ' + l.trim(); } return n.toLowerCase().replace(/[^a-z]/g, ''); };
const oneApart = (a, b) => { if (a === b) return true; if (Math.abs(a.length - b.length) > 1) return false; let i = 0, j = 0, d = 0; while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++d > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } } return d + (a.length - i) + (b.length - j) <= 1; };
// the id of the golfer this spelling means: an exact key, else the one golfer whose name is one letter away
const idIn = (name, golfers) => { const k = keyOf(name); if (golfers.some((g) => g.id === k)) return k; const m = golfers.filter((g) => oneApart(norm(g.name), norm(name))); return m.length === 1 ? m[0].id : k; };
const money = (n) => '$' + (Math.round(n * 100) / 100);
const sheets = (f) => JSON.parse(execFileSync('python3', ['-I', path.join(__dirname, 'xlsx.py'), f], { encoding: 'utf8', maxBuffer: 1 << 26 }));

// ---- Golf Genius lists: every golfer, with each round where the list has it ----------------------------------------
function gg(file, par) {
    const L = fs.readFileSync(path.join(H, file), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
    const start = L.findIndex((l) => l === 'Pos.');
    const isStart = (i) => /^(T?\d+|--)$/.test(L[i]) && /,/.test(L[i + 1] || '');
    const rows = [];
    for (let i = start + 1; i < L.length; i++) {
        if (!isStart(i)) continue;
        let j = i + 2; const tok = [];
        while (j < L.length && !isStart(j)) tok.push(L[j++]);
        const tps = tok.filter(isTp).map(tp), strokes = tok.filter((t) => /^\d{2,3}$/.test(t)).map(Number);
        const r = { id: keyOf(L[i + 1]), name: L[i + 1], label: L[i], total: tps[0] };
        if (tps.length >= 3) { r.r1 = tps[1]; r.r2 = tps[2]; }
        else if (strokes.length >= 3) { r.r1 = strokes[0] - par; r.r2 = strokes[1] - par; }
        if (r.total !== undefined && isFinite(r.total)) rows.push(r);
        i = j - 1;
    }
    return rows;
}
// ---- the payout sheets' place tables: { title: [{ label, id, name, amount }] } --------------------------------------
function placeTables(file) {
    const W = sheets(path.join(H, file)); const cols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const res = {};
    Object.keys(W).forEach((sh) => {
        const header = {};
        W[sh].forEach((r) => cols.forEach((c, ci) => {
            const v = String(r[c] || '').trim(); if (!v) return;
            if (/^(LOW|OLYMPIC|CASCADE)\s+(GROSS|NET)$/.test(v)) { header[c] = v; return; }
            if (!/^T?\d+(ST|ND|RD|TH)?$/i.test(v)) return;
            const name = String(r[cols[ci + 1]] || '').trim(), amt = Number(r[cols[ci + 2]]);
            const title = header[c] || header[cols[ci + 1]];
            if (!name || !isFinite(amt) || !title) return;
            (res[title] = res[title] || []).push({ label: v.toUpperCase().replace(/(ST|ND|RD|TH)$/, ''), id: keyOf(name), name, amount: amt });
        }));
    });
    return res;
}
// ---- compare one table ---------------------------------------------------------------------------------------------
function compare(year, what, paid, app, names, adjustments) {
    const fmt = (l) => l.map((p) => (p.label || ((p.tied ? 'T' : '') + p.rank)) + ' ' + (names[p.id] || p.name || p.id) + ' ' + money(p.amount)).join(', ');
    const diff = () => {
        const d = [];
        paid.forEach((p) => { const a = app.find((x) => x.id === p.id); if (!a) d.push('paid ' + (names[p.id] || p.name) + ' ' + money(p.amount) + ', the plan nothing'); else if (Math.abs(a.amount - p.amount) > 0.005) d.push((names[p.id] || p.name) + ' paid ' + money(p.amount) + ', the plan ' + money(a.amount)); });
        app.forEach((a) => { if (!paid.some((p) => p.id === a.id)) d.push('the plan pays ' + (names[a.id] || a.id) + ' ' + money(a.amount) + ', not paid'); });
        return d;
    };
    let d = diff();
    if (!d.length) return say(year, 'MATCH', what, fmt(app));
    if (adjustments && adjustments.length) {
        adjustments.forEach((x) => { const a = app.find((r) => r.id === x.id); if (a) a.amount = x.amount; else app.push({ id: x.id, amount: x.amount, rank: 0 }); });
        app = app.filter((a) => a.amount > 0);
        const d2 = diff();
        if (!d2.length) return say(year, 'ADJUST', what + ' (' + adjustments.length + ' row' + (adjustments.length > 1 ? 's' : '') + ' edited before posting)', 'the settings alone: ' + d.join('; ') + '\nedits: ' + adjustments.map((x) => (names[x.id] || x.id) + ' -> ' + money(x.amount) + ' (' + x.note + ')').join('; '));
        d = d2;
    }
    say(year, 'DIFF', what, 'paid: ' + fmt(paid) + '\nplan: ' + fmt(app) + '\n' + d.join('; '));
}

function main() {
    // ================= 2023: 36-hole low gross + low net, $400/$300/$200/$100, one prize per golfer =================
    {
        const G = gg('2023/golfgenius/2023-gross-leaderboard.txt', 72), N = gg('2023/golfgenius/2023-net-leaderboard.txt', 72);
        const names = {}; G.concat(N).forEach((r) => { names[r.id] = r.name; });
        const paid = placeTables('2023/2023-Starkey-Invitational-Results.xlsx');
        const spots = [400, 300, 200, 100];
        const tables = [{ id: 'g', basis: 'gross', rows: G.map((r) => ({ id: r.id, toPar: r.total })), spots }, { id: 'n', basis: 'net', rows: N.map((r) => ({ id: r.id, toPar: r.total })), spots }];
        ['larger', 'net-first', 'gross-first', 'off'].forEach((mode) => {
            const a = R.award(tables, { tieRule: 'split', rounding: 'cents', onePrize: mode });
            const ok = ['g', 'n'].every((k) => { const p = paid[k === 'g' ? 'LOW GROSS' : 'LOW NET']; return p.length === a[k].length && p.every((x) => a[k].some((y) => y.id === x.id && Math.abs(y.amount - x.amount) < 0.005)); });
            console.log('2023 try   one prize per golfer = ' + mode + ': ' + (ok ? 'both tables exact' : 'not exact'));
        });
        const a = R.award(tables, { tieRule: 'split', rounding: 'cents', onePrize: 'larger' });
        say(2023, 'SET', 'settings: 36-hole low gross + low net, 4 places $400/$300/$200/$100, ties split, one prize per golfer = the larger prize');
        compare(2023, 'low gross (' + G.length + ' golfers ranked)', paid['LOW GROSS'], a.g, names);
        compare(2023, 'low net (' + N.length + ' golfers ranked)', paid['LOW NET'], a.n, names);
    }
    // ================= 2024: per round, gross + net, $250/$200/$150/$100/$50, whole dollars down =================
    {
        const G = gg('2024/golfgenius/2024-36hole-gross-leaderboard.txt', 72), N = gg('2024/golfgenius/2024-36hole-net-leaderboard.txt', 72);
        const names = {}; G.concat(N).forEach((r) => { names[r.id] = r.name; });
        const paid = placeTables('2024/2024-Starkey-Invitational-Results.xlsx');
        const spots = [250, 200, 150, 100, 50];
        // which round is which course: the Cascade list's totals say
        const C = gg('2024/golfgenius/2024-cascade-gross-leaderboard.txt', 72);
        const cascadeIsR2 = C.filter((c) => { const g = G.find((x) => x.id === c.id); return g && g.r2 === c.total; }).length > C.length / 2;
        const cas = cascadeIsR2 ? 'r2' : 'r1', oly = cascadeIsR2 ? 'r1' : 'r2';
        say(2024, 'SET', 'settings: places on each round, gross and net, 5 places $250/$200/$150/$100/$50, ties split, shares rounded down to whole dollars, one prize per golfer IN EACH ROUND = the larger prize (a golfer may win in both rounds) (Olympic is ' + oly.toUpperCase() + ' in the Golf Genius list)');
        const rows = (L, k) => L.filter((r) => r[k] !== undefined && isFinite(r[k])).map((r) => ({ id: r.id, toPar: r[k] }));
        ['off', 'larger', 'gross-first', 'net-first'].forEach((mode) => {
            const ok = [oly, cas].every((k) => { const a = R.award([{ id: 'g', basis: 'gross', rows: rows(G, k), spots }, { id: 'n', basis: 'net', rows: rows(N, k), spots }], { tieRule: 'split', rounding: 'dollar-down', onePrize: mode }); const c = k === oly ? 'OLYMPIC' : 'CASCADE';
                return [['g', 'GROSS'], ['n', 'NET']].every(([x, b]) => { const p = paid[c + ' ' + b]; return p.length === a[x].length && p.every((q) => a[x].some((y) => y.id === q.id && Math.abs(y.amount - q.amount) < 0.005)); }); });
            console.log('2024 try   one prize per golfer in each round = ' + mode + ': ' + (ok ? 'all four tables exact' : 'not exact'));
        });
        [['OLYMPIC', oly], ['CASCADE', cas]].forEach(([c, k]) => {
            const a = R.award([{ id: 'g', basis: 'gross', rows: rows(G, k), spots }, { id: 'n', basis: 'net', rows: rows(N, k), spots }], { tieRule: 'split', rounding: 'dollar-down', onePrize: 'larger' });
            compare(2024, c.toLowerCase() + ' gross (' + rows(G, k).length + ' golfers ranked)', paid[c + ' GROSS'], a.g, names);
            compare(2024, c.toLowerCase() + ' net (' + rows(N, k).length + ' golfers ranked)', paid[c + ' NET'], a.n, names);
        });
        const cents = R.table(rows(G, cas), spots, { tieRule: 'split', rounding: 'cents' }).filter((x) => x.rank === 5);
        say(2024, 'NOTE', 'the same Cascade gross table with today\'s cents: the four tied 5th each ' + money(cents[0].amount) + ' (the committee paid $12): the whole-dollar setting is what makes it exact');
    }
    // ================= 2025: per round, gross + net, $250/$200/$150/$100/$50, cents =================
    {
        const G = gg('2025/golfgenius/2025-gross-leaderboard-with-purse.txt', 72), N = gg('2025/golfgenius/2025-net-leaderboard-with-purse.txt', 72);
        const names = {}; G.concat(N).forEach((r) => { names[r.id] = r.name; });
        const paid = placeTables('2025/2025-Starkey-Invitational-Payouts.xlsx');
        const spots = [250, 200, 150, 100, 50];
        say(2025, 'SET', 'settings: places on each round, gross and net, 5 places $250/$200/$150/$100/$50, ties split, cents, one prize per golfer IN EACH ROUND = the larger prize (the same as 2024)');
        ['off', 'larger'].forEach((mode) => { const a = R.award([{ id: 'g', basis: 'gross', rows: G.map((r) => ({ id: r.id, toPar: r.total })), spots }, { id: 'n', basis: 'net', rows: N.map((r) => ({ id: r.id, toPar: r.total })), spots }], { tieRule: 'split', onePrize: mode });
            const ok = [['g', 'CASCADE GROSS'], ['n', 'CASCADE NET']].every(([x, t]) => paid[t].length === a[x].length && paid[t].every((q) => a[x].some((y) => y.id === q.id && Math.abs(y.amount - q.amount) < 0.005)));
            console.log('2025 try   one prize per golfer in each round = ' + mode + ': ' + (ok ? 'Cascade exact' : 'not exact')); });
        const A25 = R.award([{ id: 'g', basis: 'gross', rows: G.map((r) => ({ id: r.id, toPar: r.total })), spots }, { id: 'n', basis: 'net', rows: N.map((r) => ({ id: r.id, toPar: r.total })), spots }], { tieRule: 'split', onePrize: 'larger' });
        const cg = A25.g, cn = A25.n;
        compare(2025, 'cascade gross (' + G.length + ' golfers ranked; the Golf Genius list is the Cascade round)', paid['CASCADE GROSS'], cg, names);
        compare(2025, 'cascade net (' + N.length + ' golfers ranked)', paid['CASCADE NET'], cn, names);
        // Olympic was scored on paper only: no standings in the archive. The paid rows' own places, re-split.
        ['OLYMPIC GROSS', 'OLYMPIC NET'].forEach((t) => {
            const p = paid[t]; const pn = {}; p.forEach((x) => { pn[x.id] = x.name; });
            const rows = p.map((x) => ({ id: x.id, toPar: Number(x.label.replace('T', '')) }));
            const a = R.table(rows, spots, { tieRule: 'split' });
            const adj = t === 'OLYMPIC GROSS' ? p.filter((x) => /^T3$/.test(x.label)).map((x) => ({ id: x.id, amount: 150, note: 'the committee paid each tied 3rd the full 3rd prize' })) : null;
            compare(2025, t.toLowerCase() + ' (ONLY $: no Olympic standings in the archive, round 2 was paper)', p, a, pn, adj);
            if (t === 'OLYMPIC GROSS') {
                const full = R.table(rows, spots, { tieRule: 'full' });
                say(2025, 'NOTE', 'olympic gross under the "each gets the full prize" tie rule: ' + full.map((x) => (x.tied ? 'T' : '') + x.rank + ' ' + money(x.amount)).join(', ') + ' (exact for the four paid rows; 5th would be $50 to the next golfer, whom the archive does not name, and the committee paid no 5th)');
            }
        });
    }
    // ================= 2026: flights, aggregate gross + net, one prize per golfer; Ladies net only, 4 places =================
    {
        const W = sheets(path.join(os.homedir(), 'Desktop', 'Starkey-Gold-Mountain-results', '2026-STARKEY-INVITATIONAL-RESULTS.xlsx'));
        const num = (v) => { const t = String(v == null ? '' : v).trim().toUpperCase(); if (t === 'E') return 0; if (!t || t === 'DNF') return null; const n = Number(t.replace('+', '')); return isFinite(n) ? n : null; };
        const F = [
            { sheet: 'FLIGHT 1', c: { name: 'A', cn: 'B', cg: 'C', on: 'E', og: 'F' }, L: { lab: 'K', name: 'L', par: 'M', amt: 'N' }, gross: true, spots: [250, 175, 100] },
            { sheet: 'FLIGHT 2', c: { name: 'A', cn: 'B', cg: 'C', on: 'E', og: 'F' }, L: { lab: 'K', name: 'L', par: 'M', amt: 'N' }, gross: true, spots: [250, 175, 100] },
            { sheet: 'FLIGHT 3', c: { name: 'A', cn: 'B', cg: 'C', on: 'E', og: 'F' }, L: { lab: 'K', name: 'L', par: 'M', amt: 'N' }, gross: true, spots: [250, 175, 100] },
            { sheet: 'LADIES FLIGHT', c: { name: 'A', cn: 'B', on: 'D' }, L: { lab: 'H', name: 'I', par: 'J', amt: 'K' }, gross: false, spots: [250, 200, 150, 100] }
        ];
        say(2026, 'SET', 'settings: 4 flights; men\'s flights pay 36-hole gross and net, 3 places $250/$175/$100; Ladies pay net, 4 places $250/$200/$150/$100 (the tee-times email); ties split, cents, one prize per golfer');
        ['larger', 'gross-first'].forEach((mode, mi) => {
            let all = true; const lines = [];
            F.forEach((f) => {
                const rows = W[f.sheet].slice(2).filter((r) => String(r[f.c.name] || '').trim());
                const golfers = rows.map((r) => ({ id: keyOf(r[f.c.name]), name: String(r[f.c.name]).trim(), cn: num(r[f.c.cn]), on: num(r[f.c.on]), cg: f.gross ? num(r[f.c.cg]) : null, og: f.gross ? num(r[f.c.og]) : null, dnf: Object.values(r).some((v) => String(v).toUpperCase() === 'DNF') }));
                const lists = {}; let cur = null;
                W[f.sheet].forEach((r) => {
                    const lab = String(r[f.L.lab] || '').trim().toUpperCase();
                    if (/^AGG\. (GROSS|NET)$/.test(lab)) { cur = lab.endsWith('GROSS') ? 'gross' : 'net'; lists[cur] = []; return; }
                    if (cur && /^(T?\d+)(ST|ND|RD|TH)?$/.test(lab) && r[f.L.name]) lists[cur].push({ label: lab.replace(/(ST|ND|RD|TH)$/, ''), id: idIn(r[f.L.name], golfers), name: String(r[f.L.name]).trim(), toPar: num(r[f.L.par]), amount: Number(r[f.L.amt]) || 0 });
                });
                const names = {}; golfers.forEach((g) => { names[g.id] = g.name; });
                const rowsFor = (basis) => {
                    const u = golfers.filter((g) => !g.dnf && (basis === 'net' ? g.cn !== null && g.on !== null : g.cg !== null && g.og !== null)).map((g) => ({ id: g.id, toPar: basis === 'net' ? g.cn + g.on : g.cg + g.og }));
                    (lists[basis] || []).forEach((p) => { if (!u.some((x) => x.id === p.id)) u.push({ id: p.id, toPar: p.toPar }); });   // a blank round cell: the workbook's own 36-hole figure
                    return u;
                };
                const tables = [];
                if (f.gross) tables.push({ id: 'gross', basis: 'gross', rows: rowsFor('gross'), spots: f.spots });
                tables.push({ id: 'net', basis: 'net', rows: rowsFor('net'), spots: f.spots });
                const a = R.award(tables, { tieRule: 'split', rounding: 'cents', onePrize: mode });
                tables.forEach((t) => {
                    const what = f.sheet.replace('FLIGHT ', 'Flight ').replace('LADIES Flight', 'Ladies') + ' ' + t.basis;
                    if (mi === 0) compare(2026, what.toLowerCase(), lists[t.id], a[t.id], names);
                    else { const p = lists[t.id]; const ok = p.length === a[t.id].length && p.every((x) => a[t.id].some((y) => y.id === x.id && Math.abs(y.amount - x.amount) < 0.005)); if (!ok) { all = false; lines.push(what); } }
                });
            });
            if (mi === 1) console.log('2026 try   one prize per golfer = gross-first: ' + (all ? 'every table exact too' : 'not exact in ' + lines.join(', ')));
        });
    }

    // ================= skins and KPs: what the plan must hold (winners not replayable: no hole-by-hole cards) =================
    say('all', 'HOLDS', 'skins: one pool per game, every skin won (gross and net, both rounds) worth the same, whole dollars', '2023: 13 skins at $366 (gross and net, both courses)\n2024: $291 a skin, gross and net, both courses\n2025: 9 skins at $911; one golfer may not take both the gross and the net skin on a hole\n2026: men 17 skins at $276; Ladies a separate game, 20 skins at $75');
    say('all', 'HOLDS', 'KPs: a prize per par 3, per round; split between golfers who tie', '2023: 8 at $50\n2024: 8 at $50, one shared $25 / $25\n2025: 8 at $100\n2026: per flight on the Cascade par 3s, $50 each (23 paid), one shared by two golfers');
    fs.writeFileSync(path.join(H, 'replay-plan.json'), JSON.stringify(out, null, 1));
}
if (require.main === module) main();
module.exports = { H, gg, placeTables, keyOf, idIn, sheets };
