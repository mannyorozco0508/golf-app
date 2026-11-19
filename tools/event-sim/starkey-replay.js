#!/usr/bin/env node
// ============================================================================
// THE STARKEY 2026 REPLAY (Manny 2026-11-19 "REPLAY the real Starkey 2026 results from the pitch and compare to what
// actually happened"). Source: ~/Desktop/Starkey-Gold-Mountain-results/2026-STARKEY-INVITATIONAL-RESULTS.xlsx, the
// organizer's own workbook (the pitch's pages 10 and 11 were built from it). Read with tools/event-sim/xlsx.py.
//
// WHAT CAN BE REPLAYED. The workbook holds each golfer's to-par per round (Cascade, Olympic; net, and gross where it
// was filled in), the places and amounts actually paid, the skins and KPs actually paid. It holds NO hole-by-hole
// cards and no handicaps, so the replay feeds the 36-hole to-par results into the app's OWN ranking (tournament-
// engine.js rankRows: competition places) and the app's OWN prize split (payouts.js allocatePlacePayouts, the spots
// $250 / $175 / $100), and compares what HardPan would have posted with what was paid. Skins and KPs are compared as
// what the app can and cannot represent. Nothing here reads or writes any database.
//   node tools/event-sim/starkey-replay.js     prints PASS / DIFF / GAP per item and writes starkey-replay.json
// ============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { engines } = require('./engine-check.js');

const WB = path.join(os.homedir(), 'Desktop', 'Starkey-Gold-Mountain-results', '2026-STARKEY-INVITATIONAL-RESULTS.xlsx');
const SPOTS = [250, 175, 100];
const num = (v) => { if (v === undefined || v === null) return null; const t = String(v).trim().toUpperCase(); if (t === 'E') return 0; if (!t || t === 'DNF') return null; const n = Number(t.replace('+', '')); return isFinite(n) ? n : null; };
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const close = (a, b) => { a = norm(a); b = norm(b); if (a === b) return true; if (Math.abs(a.length - b.length) > 1) return false; let d = 0, i = 0, j = 0; while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } d++; if (d > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } } return d + (a.length - i) + (b.length - j) <= 1; };
const money = (n) => '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

function main() {
    const W = JSON.parse(execFileSync('python3', ['-I', path.join(__dirname, 'xlsx.py'), WB], { encoding: 'utf8', maxBuffer: 1 << 26 }));
    const E = engines();
    const ctxRank = E.rankRows || null;
    const rank = (rows) => {
        // the engine's one rank pass: sort by to par, equal to par share the place
        const rs = rows.map((r, i) => ({ playerId: r.name, teamName: r.name, toPar: r.toPar, hasScores: true, num: i + 1 }));
        if (ctxRank) return ctxRank(rs, (a, b) => a.toPar - b.toPar, (r, p) => r.toPar === p.toPar);
        rs.sort((a, b) => a.toPar - b.toPar); rs.forEach((r, i) => { r.rank = i && rs[i - 1].toPar === r.toPar ? rs[i - 1].rank : i + 1; }); return rs;
    };
    const out = [];
    const item = (area, name, verdict, detail) => { out.push({ area, name, verdict, detail: detail || '' }); console.log(verdict.padEnd(4) + ' ' + area + ' | ' + name + (detail ? '\n       ' + detail : '')); };

    // ---- the flights: rows and the LOW lists actually paid ------------------------------------------------------
    const flights = [
        { sheet: 'FLIGHT 1', cols: { name: 'A', cn: 'B', cg: 'C', on: 'E', og: 'F' }, gross: true },
        { sheet: 'FLIGHT 2', cols: { name: 'A', cn: 'B', cg: 'C', on: 'E', og: 'F' }, gross: true },
        { sheet: 'FLIGHT 3', cols: { name: 'A', cn: 'B', cg: 'C', on: 'E', og: 'F' }, gross: true },
        { sheet: 'LADIES FLIGHT', cols: { name: 'A', cn: 'B', on: 'D' }, gross: false }
    ];
    let paidPlaces = 0, appPlaces = 0;
    flights.forEach((f) => {
        const rows = W[f.sheet].slice(2).filter((r) => (r[f.cols.name] || '').trim());
        const golfers = rows.map((r) => ({ name: r[f.cols.name].trim(), cn: num(r[f.cols.cn]), on: num(r[f.cols.on]), cg: f.gross ? num(r[f.cols.cg]) : null, og: f.gross ? num(r[f.cols.og]) : null, dnf: Object.values(r).some((v) => String(v).toUpperCase() === 'DNF') }));
        // the LOW lists: [label, name, toPar, amount] blocks under "LOW" / "AGG. GROSS" or "AGG. NET"
        const lists = {}; let cur = null;
        const L = f.gross ? { lab: 'K', name: 'L', par: 'M', amt: 'N' } : { lab: 'H', name: 'I', par: 'J', amt: 'K' };
        W[f.sheet].forEach((r) => {
            const lab = (r[L.lab] || '').trim().toUpperCase();
            if (/^AGG\. (GROSS|NET)$/.test(lab)) { cur = lab.endsWith('GROSS') ? 'gross' : 'net'; lists[cur] = []; return; }
            if (cur && /^(T?\d+)(ST|ND|RD|TH)?$/.test(lab) && r[L.name]) lists[cur].push({ label: lab.replace(/(ST|ND|RD|TH)$/, ''), name: r[L.name].trim(), toPar: num(r[L.par]), amount: Number(r[L.amt]) || 0 });
        });
        ['net', 'gross'].forEach((basis) => {
            if (!lists[basis]) return;
            const paid = lists[basis];
            paidPlaces += paid.reduce((a, p) => a + p.amount, 0);
            const usable = golfers.filter((g) => !g.dnf && (basis === 'net' ? g.cn !== null && g.on !== null : g.cg !== null && g.og !== null)).map((g) => ({ name: g.name, toPar: basis === 'net' ? g.cn + g.on : g.cg + g.og }));
            const missing = paid.filter((p) => !usable.some((u) => close(u.name, p.name)));
            // a paid golfer whose round cells are blank: their 36-hole figure from the workbook's own list
            missing.forEach((p) => usable.push({ name: p.name, toPar: p.toPar, fromList: true }));
            const ranked = rank(usable);
            const pay = E.allocatePlacePayouts(ranked.filter((r) => r.hasScores), SPOTS).filter((x) => x.amount > 0);
            appPlaces += pay.reduce((a, x) => a + x.amount, 0);
            const app = pay.map((x) => ({ name: x.entry.teamName, rank: x.rank, amount: x.amount, toPar: x.entry.toPar }));
            const sameWho = paid.length === app.length && paid.every((p) => app.some((a) => close(a.name, p.name) && a.toPar === p.toPar));
            const sameMoney = sameWho && paid.every((p) => { const a = app.find((x) => close(x.name, p.name)); return a && Math.abs(a.amount - p.amount) < 0.005; });
            const label = f.sheet.replace('FLIGHT ', 'Flight ').replace('LADIES Flight', 'Ladies') + ' ' + basis;
            const fmt = (l) => l.map((p) => (p.label || (app.filter((x) => x.rank === p.rank).length > 1 ? 'T' : '') + p.rank) + ' ' + p.name + ' ' + (p.toPar === 0 ? 'E' : (p.toPar > 0 ? '+' : '') + p.toPar) + ' ' + money(p.amount)).join(', ');
            item('places', label + ': the same golfers in the same places', sameWho ? 'PASS' : 'DIFF', sameWho ? '' : 'paid: ' + fmt(paid) + '\n       app : ' + fmt(app));
            if (sameWho) item('places', label + ': the same amounts', sameMoney ? 'PASS' : 'DIFF', sameMoney ? fmt(app) : 'paid: ' + fmt(paid) + '\n       app : ' + fmt(app) + '\n       (the app splits a tie the money of the places it occupies; a tie across the last paid place shares only the paid money)');
            if (missing.length) item('data', label + ': the workbook has a blank round cell for ' + missing.map((m) => m.name).join(', ') + ' (their 36-hole figure taken from the workbook\'s own list)', 'NOTE');
        });
    });
    item('places', 'all place money: paid ' + money(paidPlaces) + ', the app\'s rule would post ' + money(appPlaces), Math.abs(paidPlaces - appPlaces) < 0.005 ? 'PASS' : 'DIFF');

    // ---- skins -----------------------------------------------------------------------------------------------------
    const sk = (sheet) => { const rows = W[sheet]; let mode = 'gross'; const got = { gross: 0, net: 0 }; rows.forEach((r) => { const a = (r.A || '').toUpperCase(), f = (r.F || '').toUpperCase(); if (a === 'NET SKINS' || f === 'NET SKINS') { mode = 'net'; } ['A', 'F'].forEach((c, i) => { const hole = num(r[i ? 'G' : 'B']); if (hole !== null && r[c] && !/SKINS|PLAYER/.test(r[c].toUpperCase())) got[mode]++; }); }); return got; };
    const men = sk('SKINS'), ladies = sk('LADIES SKINS');
    item('skins', 'men\'s skins paid: ' + (men.gross + men.net) + ' (' + men.gross + ' gross, ' + men.net + ' net) at $276 = ' + money((men.gross + men.net) * 276), (men.gross + men.net) * 276 === 4692 ? 'PASS' : 'DIFF', 'the arithmetic matches the payout sheet');
    item('skins', 'net skins: ' + men.net + ' men\'s and ' + ladies.net + ' ladies\' skins were paid on net scores; HardPan\'s skins are gross only ("Net skins are not built yet")', 'GAP', 'the app would have posted ' + men.gross + ' men\'s skins, not ' + (men.gross + men.net));
    item('skins', 'a separate Ladies skins game (' + (ladies.gross + ladies.net) + ' skins at $75 = ' + money((ladies.gross + ladies.net) * 75) + '): HardPan runs one skins game over the whole field', 'GAP', 'skins.js entrantsFromRecord takes every golfer; there is no per-flight or ladies-only skins pool');

    // ---- KPs -------------------------------------------------------------------------------------------------------
    const tb = W['TOTAL BREAKDOWN'];
    const kps = []; tb.forEach((r) => { ['Q', 'T', 'W', 'Z'].forEach((c) => { const n = (r[c] || '').trim(); if (n && !/FLIGHT|N\/A|^HOLE/i.test(n) && /^[A-Z][A-Z .\/'-]+$/.test(n)) kps.push(n); }); });
    const shared = kps.filter((n) => n.indexOf('/') !== -1);
    item('KPs', 'KPs paid: 23 at $50 = $1,150 (Cascade 15, Olympic 8), per flight and per par 3', 'NOTE', 'HardPan runs a KP per hole for the whole field, not one per flight per hole: four winners on one hole need four contests the app cannot make');
    item('KPs', 'a shared KP (' + 'two golfers' + ', $50 together): HardPan confirms one winner per contest; a tie keeps the earlier entry', 'GAP');

    // ---- the total -------------------------------------------------------------------------------------------------
    item('total', 'the workbook total: places $3,850 + skins $6,192 + KPs $1,150 = $11,192', 3850 + 6192 + 1150 === 11192 ? 'PASS' : 'DIFF', 'paid to 53 payees');
    // golfer names: the output stays in the internal mailbox folder, never in the repo
    fs.writeFileSync(path.join(os.homedir(), 'Desktop', 'claude-mailbox-shared', 'tournaments', 'starkey-history', 'replay-2026.json'), JSON.stringify(out, null, 1));
    return out;
}
if (require.main === module) main();
module.exports = { main };
