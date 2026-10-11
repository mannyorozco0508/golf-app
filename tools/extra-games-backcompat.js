#!/usr/bin/env node
// ============================================================================
// BINGO BANGO BONGO + VEGAS: AN OLDER APP READING SUCH A ROUND (gps-games)
//
//   node tools/extra-games-backcompat.js <tree> [<tree> ...]
//
// Each <tree> is a checkout of some build's code: GPS beta build 12 (3ac10d9),
// the live web app (main), and this branch. For each tree, the SAME round is
// opened cold in Chrome twice - once as it is (A), once with a Bingo Bango Bongo
// and a Vegas game added (B) - on the scorecard, Action, leaderboard, skins and
// settlement pages. Nothing on a page is called; only the data differs.
//
// An OLD tree passes when, on every page, B reads EXACTLY like A (the new games
// are invisible to it: every other game opens, scores and settles the same), and
// neither threw. THIS tree passes when every page is error-free, settlement's
// Who Pays Who is unchanged, and the two new cards are there.
//
// Also checked in the source of each tree: getRoundGames skips a format it does
// not know, and Round Setup writes back an instance it does not own unchanged.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const IDS = [11, 12, 13, 14];
const NAMES = ['Ann Able', 'Bob Baker', 'Cal Cole', 'Dee Dunn'];
const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const CD = PARS.map((par, i) => ({ hole: i + 1, par, hcpIndex: ((i * 7) % 18) + 1 }));

function round(withNew) {
    const players = IDS.map((id, i) => ({ id, name: NAMES[i], hcp: [4, 9, 12, 18][i], group: 1, playingForMoney: true }));
    const scores = {};
    CD.forEach((h, hi) => IDS.forEach((id, pi) => { scores['p' + id + '_h' + h.hole] = h.par + ((hi + pi) % 5 === 0 ? -1 : (hi * (pi + 1)) % 3); }));
    const d = {
        ownerUid: 'anon-cold', courseName: 'Backcompat Links', gameFormat: 'stroke', players, courseData: CD, scores,
        sideMatches: {
            s1: { format: 'match', scoring: 'net', stake: 10, pressRule: 'none', teamAIds: ['11'], teamBIds: ['12'], startHole: 1, createdAt: 1 },
            s2: { format: 'match', scoring: 'net', stake: 5, pressRule: 'none', teamAIds: ['11', '13'], teamBIds: ['12', '14'], startHole: 1, createdAt: 2 }
        },
        additionalGameInstances: {
            sk1: { format: 'skins', enabled: true, skinsBuyIn: 5, skinsPotFormat: 'gross', skinsScoring: 'gross', skinsCarryOver: true, startHole: 1 }
        }
    };
    if (withNew) {
        const points = {};
        CD.forEach((h, i) => { points['h' + h.hole] = { bingo: IDS[i % 4], bango: IDS[(i + 1) % 4], bongo: IDS[(i * 3) % 4] }; });
        d.additionalGameInstances.xgbbb = { format: 'bbb', enabled: true, startHole: 1, createdAt: 3, bbbPointVal: 1, participantIds: IDS.map(String), points };
        d.additionalGameInstances.xgvegas = { format: 'vegas', enabled: true, startHole: 1, createdAt: 4, vegasPointVal: 1, vegasBirdieFlip: true,
            vegasTeamA: ['11', '12'], vegasTeamB: ['13', '14'], participantIds: IDS.map(String) };
    }
    return d;
}

const PAGES = ['index.html', 'sidematches.html', 'leaderboard.html', 'skins.html', 'settlement.html'];
const ERRS = "window.__xgErr = []; addEventListener('error', function (e) { window.__xgErr.push(String(e.message || e)); }); addEventListener('unhandledrejection', function (e) { window.__xgErr.push('rejection: ' + String(e.reason && e.reason.message || e.reason)); });";
const PROBE = `JSON.stringify({ errs: window.__xgErr || [], text: document.body ? document.body.innerText : '',
  who: (function () { var t = document.body ? document.body.innerText : ''; var i = t.search(/Who Pays Who/i); if (i < 0) return ''; var w = t.slice(i, i + 600); var j = w.slice(1).search(/[\\uD83C-\\uD83E]/) + 1; return j < 1 ? w : w.slice(0, j); })() })`;

// Volatile bits that differ between two loads of the same round.
function norm(t) { return String(t).replace(/\b\d{1,2}:\d{2}\s?(AM|PM)?\b/gi, '#:#').replace(/\b(just now|\d+\s?(s|sec|min|m) ago)\b/gi, '~').replace(/[ \t]+/g, ' ').trim(); }

async function look(tree, page, data) {
    const { arriveCold, fileUrl } = require(path.join(tree, 'tools/lib/cold-arrival.js'));
    const r = await arriveCold({ url: fileUrl(page, 'game=XGBACK'), db: { events: { XGBACK: data }, global_courses: {}, trips: {}, tournaments: {} },
        settleMs: 4000, viewport: { width: 390, height: 844 }, preScript: ERRS, steps: [{ expression: PROBE }] });
    if (!r.ok) return { fail: r.reason };
    return JSON.parse(r.value[0]);
}

function sourceChecks(tree) {
    const read = (f) => fs.readFileSync(path.join(tree, f), 'utf8');
    const out = [];
    const am = read('action-model.js');
    if (!/if \(!isAdditionalGameFormat\(format\)\) return;/.test(am)) out.push('action-model.js: getRoundGames does not skip unknown instance formats');
    if (/['"](bbb|vegas)['"]/.test(am)) out.push('action-model.js names bbb/vegas (it would settle them)');
    const ad = read('admin.html');
    if (!/if \(cfg\.format !== 'skins'\) \{ foreignGameInstances\[id\] = JSON\.parse\(JSON\.stringify\(cfg\)\); return; \}/.test(ad)) out.push('admin.html: Round Setup does not hold unknown instances');
    if (!/Object\.keys\(foreignGameInstances\)\.forEach\(id => \{ out\[id\] = JSON\.parse\(JSON\.stringify\(foreignGameInstances\[id\]\)\); \}\);/.test(ad)) out.push('admin.html: Round Setup does not write unknown instances back');
    return out;
}

module.exports = { round };
if (require.main === module) (async () => {
    const trees = process.argv.slice(2).map((t) => path.resolve(t));
    if (!trees.length) { console.error('usage: node tools/extra-games-backcompat.js <tree> [<tree> ...]'); process.exit(2); }
    const fails = [];
    const report = {};
    for (const tree of trees) {
        const isNew = fs.existsSync(path.join(tree, 'extra-games-ui.js'));
        const name = path.basename(tree) + (isNew ? ' (new games)' : ' (old)');
        report[name] = {};
        sourceChecks(tree).forEach((f) => fails.push(name + ': ' + f));
        for (const page of PAGES) {
            if (!fs.existsSync(path.join(tree, page))) continue;
            const A = await look(tree, page, round(false));
            const B = await look(tree, page, round(true));
            const tag = name + ' ' + page;
            if (process.env.XG_DUMP === page) console.log('==== ' + tag + ' A ====\n' + (A.text || A.fail) + '\n==== B ====\n' + (B.text || B.fail));
            if (A.fail || B.fail) { fails.push(tag + ': did not load: ' + (A.fail || B.fail)); continue; }
            if (A.errs.length) fails.push(tag + ': errors without the new games: ' + A.errs.join(' | '));
            if (B.errs.length) fails.push(tag + ': errors WITH the new games: ' + B.errs.join(' | '));
            if (A.text.length < 200) fails.push(tag + ': page rendered almost nothing (' + A.text.length + ' chars)');
            const same = norm(A.text) === norm(B.text);
            if (!isNew && !same) {
                const a = norm(A.text).split('\n'), b = norm(B.text).split('\n');
                const i = a.findIndex((l, k) => l !== b[k]);
                fails.push(tag + ': the page reads differently with the new games, line ' + i + ': "' + (a[i] || '').slice(0, 80) + '" vs "' + (b[i] || '').slice(0, 80) + '"');
            }
            if (isNew && page === 'settlement.html') {
                if (norm(A.who) !== norm(B.who)) fails.push(tag + ': Who Pays Who changed with the new games');
                if (!/Bingo Bango Bongo/i.test(B.text) || !/Vegas/i.test(B.text)) fails.push(tag + ': the two new settlement cards are missing');
                if (!/Settle this game separately/i.test(B.text)) fails.push(tag + ': the cards do not say to settle separately');
            }
            if (isNew && page === 'index.html' && !(/BINGO BANGO BONGO/.test(B.text) && /VEGAS/.test(B.text))) fails.push(tag + ': the scorecard has no BBB / Vegas card');
            report[name][page] = { chars: A.text.length, identical: same, errsA: A.errs.length, errsB: B.errs.length };
        }
    }
    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})();
