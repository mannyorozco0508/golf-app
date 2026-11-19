#!/usr/bin/env node
// ============================================================================
// STARKEY HISTORY REPLAY, 2023-2026 (ADVISOR-20261119-0301; Grok's files in claude-mailbox-shared/tournaments/
// starkey-history/<year>/). INTERNAL ONLY: golfer names are printed here for the comparison and never leave this
// folder (no site, no screenshot, no pitch). No database is read or written.
//
// TWO QUESTIONS PER YEAR, both answered with the app's OWN code (engine-check.js loads the same files the pages do):
//   1. RANKING. The official Golf Genius leaderboards (2023-2025: every golfer's to-par) re-ranked with the engine's
//      rankRows (competition places, equal to-par share the place): does every place label match?
//   2. MONEY. Every place block in the year's payout sheet (who, which place, how much) re-split with payouts.js
//      allocatePlacePayouts over that year's spot schedule: does the app pay what the committee paid?
//   Plus what the year's format needed that the app cannot do (from the summary and the sheets).
//   node tools/event-sim/starkey-history.js
// ============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { engines } = require('./engine-check.js');
const H = path.join(os.homedir(), 'Desktop', 'claude-mailbox-shared', 'tournaments', 'starkey-history');
const E = engines();
const out = [];
const item = (year, area, name, verdict, detail) => { out.push({ year, area, name, verdict, detail: detail || '' }); console.log(String(year) + ' ' + verdict.padEnd(4) + ' ' + area + ' | ' + name + (detail ? '\n          ' + detail : '')); };
const tp = (t) => (t === 'E' ? 0 : Number(String(t).replace('+', '')));

// ---- 1. Golf Genius leaderboards -----------------------------------------------------------------------------
function ggBoard(file) {
    const lines = fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
    const start = lines.findIndex((l) => /^Pos\.$/.test(l));
    const rows = [];
    for (let i = start + 1; i < lines.length; i++) {
        if (!/^(T?\d+|--)$/.test(lines[i]) || !/,/.test(lines[i + 1] || '')) continue;
        let j = i + 2;
        if (!/^([+-]\d+|E)$/.test(lines[j])) j++;   // a club line
        if (!/^([+-]\d+|E)$/.test(lines[j])) continue;
        rows.push({ label: lines[i], name: lines[i + 1], toPar: tp(lines[j]) });
    }
    return rows;
}
function rankingCheck(year, title, file) {
    if (!fs.existsSync(file)) return;
    const rows = ggBoard(file);
    const eligible = rows.filter((r) => r.label !== '--');
    const ranked = E.rankRows(eligible.map((r, i) => ({ playerId: r.name, toPar: r.toPar, hasScores: true, num: i + 1 })), (a, b) => a.toPar - b.toPar, (r, p) => r.toPar === p.toPar);
    const lab = (r) => (ranked.filter((x) => x.rank === r.rank).length > 1 ? 'T' : '') + r.rank;
    const bad = ranked.filter((r) => { const g = eligible.find((x) => x.name === r.playerId); return g.label !== lab(r); });
    item(year, 'ranking', title + ': ' + eligible.length + ' golfers re-ranked by the app, every place label the same' + (rows.length - eligible.length ? ' (' + (rows.length - eligible.length) + ' shown "--" by Golf Genius: left out of the places)' : ''), bad.length ? 'DIFF' : 'PASS', bad.slice(0, 4).map((r) => r.playerId + ' GG ' + eligible.find((x) => x.name === r.playerId).label + ' app ' + lab(r)).join('; '));
}

// ---- 2. the payout sheets: place blocks -----------------------------------------------------------------------
function sheets(file) { return JSON.parse(execFileSync('python3', ['-I', path.join(__dirname, 'xlsx.py'), file], { encoding: 'utf8', maxBuffer: 1 << 26 })); }
function placeBlocks(rows) {
    const cols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const blocks = {}; const header = {};
    rows.forEach((r) => {
        cols.forEach((c, ci) => {
            const v = String(r[c] || '').trim();
            if (!v) return;
            const isLabel = /^T?\d+(ST|ND|RD|TH)?$/i.test(v);
            // a place table's title: LOW GROSS, LOW NET, OLYMPIC GROSS, CASCADE NET ... (never skins, KPs or payouts)
            if (!isLabel && /^(LOW|OLYMPIC|CASCADE)\s+(GROSS|NET)$/.test(v)) { header[c] = v; return; }
            if (!isLabel) return;
            const name = String(r[cols[ci + 1]] || '').trim(), amt = Number(r[cols[ci + 2]]);
            if (!name || !isFinite(amt)) return;
            const title = header[c] || header[cols[ci + 1]];   // 2024 writes the title over the name column
            if (!title) return;
            const key = title + '@' + c;
            (blocks[key] = blocks[key] || []).push({ label: v.toUpperCase().replace(/(ST|ND|RD|TH)$/, ''), name, amount: amt });
        });
    });
    return blocks;
}
function moneyCheck(year, file, spots) {
    const W = sheets(file);
    let paid = 0, app = 0;
    Object.keys(W).forEach((sh) => {
        const blocks = placeBlocks(W[sh]);
        Object.keys(blocks).forEach((k) => {
            const b = blocks[k];
            if (b.length < 2) return;
            const rows = b.map((p, i) => ({ teamName: p.name, rank: Number(p.label.replace('T', '')), num: i }));
            const pay = E.allocatePlacePayouts(rows, spots);
            const diffs = b.map((p) => { const a = pay.find((x) => x.entry.teamName === p.name); return { p, a: a ? a.amount : 0 }; }).filter((d) => Math.abs(d.a - d.p.amount) > 0.005);
            const sumPaid = b.reduce((s, p) => s + p.amount, 0), sumApp = pay.reduce((s, x) => s + x.amount, 0);
            paid += sumPaid; app += sumApp;
            item(year, 'money', k.replace(/@[A-Z]$/, '') + ': ' + b.map((p) => p.label + ' ' + p.amount).join(', ') + ' (spots ' + spots.join('/') + ')', diffs.length ? 'DIFF' : 'PASS', diffs.map((d) => d.p.label + ' ' + d.p.name + ' paid ' + d.p.amount + ', the app ' + (Math.round(d.a * 100) / 100)).join('; '));
        });
    });
    return { paid, app };
}

function main() {
    // spot schedules: the untied places in each year's own sheet
    const Y = {
        2023: { spots: [400, 300, 200, 100], wb: '2023/2023-Starkey-Invitational-Results.xlsx', gg: [['36-hole gross', '2023/golfgenius/2023-gross-leaderboard.txt'], ['36-hole net', '2023/golfgenius/2023-net-leaderboard.txt']],
            gaps: ['net skins (paid on both courses; the app\'s skins are gross only)', 'low gross AND low net places in the same event (the app posts one place list, on the event\'s basis)', 'Golf Genius left winners out of the net list ("--"): the app has no one-prize-per-golfer rule'] },
        2024: { spots: [250, 200, 150, 100, 50], wb: '2024/2024-Starkey-Invitational-Results.xlsx', gg: [['36-hole gross', '2024/golfgenius/2024-36hole-gross-leaderboard.txt'], ['36-hole net', '2024/golfgenius/2024-36hole-net-leaderboard.txt'], ['Cascade gross', '2024/golfgenius/2024-cascade-gross-leaderboard.txt'], ['Cascade net', '2024/golfgenius/2024-cascade-net-leaderboard.txt']],
            gaps: ['places on EACH round (Cascade and Olympic, gross and net): the app posts one place list per event on one basis (a round or the event total)', 'net skins', 'a shared KP (two golfers tied, $25 each): the app confirms one winner per contest', 'whole-dollar rounding: a four-way T5 of $50 was paid $12 each; the app keeps $12.50'] },
        2025: { spots: [250, 200, 150, 100, 50], wb: '2025/2025-Starkey-Invitational-Payouts.xlsx', gg: [['gross (one round)', '2025/golfgenius/2025-gross-leaderboard-with-purse.txt'], ['net (one round)', '2025/golfgenius/2025-net-leaderboard-with-purse.txt']],
            gaps: ['places on each round, gross and net', 'net skins, and "one golfer cannot win both the gross and the net skin on a hole"', 'round 2 on paper cards only (the Desk scan covers this today)', 'the Olympic cards were printed with Cascade hole data by mistake: the app prints the card from the course record, so the round would carry the right course'] },
        2026: { spots: [250, 175, 100], wb: null, gg: [],   // the 2026 money: starkey-replay.js (flighted sheets of their own)
            gaps: ['flights with low gross AND low net per flight, one prize per golfer (gross first)', 'net skins', 'a separate Ladies skins game', 'KPs per flight per par 3', 'a shared KP'] }
    };
    const totals = {};
    Object.keys(Y).forEach((year) => {
        const y = Y[year];
        y.gg.forEach(([title, f]) => rankingCheck(year, title, path.join(H, f)));
        if (y.wb && fs.existsSync(path.join(H, y.wb))) totals[year] = moneyCheck(year, path.join(H, y.wb), y.spots);
        y.gaps.forEach((g) => item(year, 'format', g, 'GAP'));
    });
    Object.keys(totals).forEach((y) => item(y, 'money', 'all place money in the sheet: paid ' + totals[y].paid + ', the app\'s split ' + (Math.round(totals[y].app * 100) / 100), Math.abs(totals[y].paid - totals[y].app) < 0.005 ? 'PASS' : 'DIFF'));
    // golfer names: the output stays in the internal mailbox folder, never in the repo
    fs.writeFileSync(path.join(H, 'replay-history.json'), JSON.stringify(out, null, 1));
}
main();
