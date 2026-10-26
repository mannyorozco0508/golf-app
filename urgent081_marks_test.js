// ============================================================================
// URGENT-081 (Manny, 2026-10-26), the GPS app: the bogey square and the double
// square (score-marks-hp.js, since gps-marks 2026-10-16) take the circles' colour
// and line weight on every hole-by-hole card; the hole-difficulty row reads "HCP"
// (US) instead of "SI" (UK), and the pars entry's index box says HCP.
//   GROSS vs par only, par plain, net row plain, circles unchanged.
//   DISPLAY ONLY: score-marks.js (protected) byte-identical, no score, money,
//   data key or settlement code touched.
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { rounds } = require('./helpers/scorecard-rounds.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha8 = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO_ROOT, f))).digest('hex').slice(0, 8);
const SM = require('./score-marks.js');
const HP = require('./score-marks-hp.js');
const me = loadJsFile('money-engine.js', ['handicap.js']);
global.getStrokes = me.getStrokes; global.parseHcp = me.parseHcp;
const SR = require('./scorecard-rows.js');
const hpRing = (s, p) => HP.scoreMarkClass(s, p).trim();
const circlesOnly = (s, p) => SM.scoreMarkClass(s, p).trim();

describe('THE RULE (unchanged since gps-marks; held here for 081)', () => {
    test('every score 1-12 on par 3-6: circles = score-marks.js, +1 square, +2 and worse double square, par plain', () => {
        [3, 4, 5, 6].forEach(par => {
            for (let s = 1; s <= 12; s++) {
                const got = hpRing(s, par);
                if (s < par) assert.equal(got, circlesOnly(s, par));
                else if (s === par) assert.equal(got, '');
                else if (s === par + 1) assert.equal(got, 'mark-bogey');
                else assert.equal(got, 'mark-double');
            }
        });
        ['', null, 0, 'x'].forEach(v => assert.equal(hpRing(v, 4), ''));
    });
    test('score-marks.js (protected) is byte-identical to 19953f7f', () => {
        assert.equal(sha8('score-marks.js'), '02f972d6');
    });
});

describe('THE CARDS: HCP label, net plain, numbers unchanged', () => {
    const PARS = [5, 4, 4, 3, 5, 4, 3, 4, 5];
    const courseData = PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: [5, 3, 13, 11, 15, 9, 17, 1, 7][i] }));
    const G = [3, 3, 5, 5, 8, 4, 2, 4, 6];   // eagle birdie bogey double triple par birdie par bogey
    const scores = {}; G.forEach((g, i) => { scores['p101_h' + (i + 1)] = g; });
    const players = [{ id: 101, name: 'Marco Diaz', hcp: '10' }];
    test('the board\'s expanded card: marks on the right holes, the net row plain, HCP not SI', () => {
        const html = SR.scorecardStackedHtml({ courseData, scores, players, showNet: true, ringOf: hpRing });
        const rows = html.split('</tr>');
        const gross = rows.find(r => r.includes('>Marco<'));
        const net = rows.find(r => r.includes('>net<'));
        const cls = [...gross.matchAll(/<td(?: class="([^"]*)")?>([^<]*)<\/td>/g)].map(m => (m[1] || '') + ':' + m[2]);
        assert.deepEqual(cls.slice(1, 10), ['mark-eagle:3', 'mark-birdie:3', 'mark-bogey:5', 'mark-double:5', 'mark-double:8', ':4', 'mark-birdie:2', ':4', 'mark-bogey:6']);
        assert.ok(!/mark-/.test(net));
        assert.match(html, /<th class="rt-name">HCP<\/th>/);
        assert.ok(!/>SI</.test(html));
    });
    test('NUMBERS UNCHANGED: every captured round, with and without the squares, same text', () => {
        const R = rounds();
        Object.keys(R).forEach(k => {
            const d = R[k];
            const o = ring => ({ courseData: d.courseData, scores: d.scores, players: d.players, showNet: true, ringOf: ring });
            const strip = h => h.replace(/ class="mark-[a-z]+"/g, '');
            assert.equal(strip(SR.scorecardRowsHtml(o(hpRing))), strip(SR.scorecardRowsHtml(o(circlesOnly))), k);
            assert.equal(strip(SR.scorecardStackedHtml(o(hpRing))), strip(SR.scorecardStackedHtml(o(circlesOnly))), k);
        });
    });
});

describe('THE SQUARES TAKE THE CIRCLES\' COLOUR AND LINE (was the number\'s own colour)', () => {
    test('leaderboard.html expanded card', () => {
        const s = read('leaderboard.html');
        assert.match(s, /\.sc-stack \.receipt-table td\.mark-bogey \{ box-shadow: inset 0 0 0 2px var\(--accent-red\); border-radius: 3px; \}/);
        assert.match(s, /\.sc-stack \.receipt-table td\.mark-double \{ box-shadow: inset 0 0 0 2px var\(--accent-red\), inset 0 0 0 3px var\(--bg-card\), inset 0 0 0 5px var\(--accent-red\); border-radius: 3px; \}/);
    });
    test('settlement.html Receipt: screen and print', () => {
        const s = read('settlement.html');
        assert.match(s, /\.receipt-table td\.mark-bogey, \.legend-bogey \{ box-shadow: inset 0 0 0 2px var\(--accent-red\); border-radius: 3px; \}/);
        assert.match(s, /\.receipt-table td\.mark-bogey, \.legend-bogey \{ box-shadow: inset 0 0 0 2px #c1121f !important;/);
        assert.ok(!/mark-(bogey|double)[^{]*\{[^}]*#1a1a1a/.test(s), 'no black box left');
    });
    test('index.html Card view + live score box: screen and print', () => {
        const s = read('index.html');
        assert.match(s, /\.score-input-wrapper\.mark-bogey::after \{ inset: 9px; box-shadow: inset 0 0 0 2px var\(--accent-red\); \}/);
        assert.match(s, /\.card-table td\.mark-bogey \{\s*box-shadow: inset 0 0 0 2px #c1121f !important;/);
        const marks = s.slice(s.indexOf('.receipt-table td.mark-bogey,'), s.indexOf('.receipt-table td.mark-double, .receipt-table td.mark-eagle { padding-left'));
        assert.ok(marks.length > 200 && !/1a1a1a/.test(marks), 'the screen rules are red');
    });
    test('shared.html, the GPS score button, the recap picture', () => {
        assert.match(read('shared.html'), /\.score-cell\.mark-bogey \{ box-shadow: inset 0 0 0 2px #e63946;/);
        assert.match(read('gps-view.js'), /\.gps-score-n\.mark-bogey\{box-shadow:inset 0 0 0 2px #c1121f;/);
        const rc = read('round-recap.js');
        assert.match(rc, /op: 'box', x: cxm - 20, y: cym - 20, w: 40, h: 40, color: C\.neg, w2: 2\.5 \}/);
        assert.match(rc, /op: 'box', x: cxm - 25, y: cym - 25, w: 50, h: 50, color: C\.neg, w2: 2\.5 \}/);
        assert.match(rc, /op: 'ring', cx: cxm, cy: cym, r: 21, color: C\.neg, w: 2\.5 \}/, 'the circles are what they were');
    });
});

describe('THE HCP LABEL ELSEWHERE', () => {
    test('tournament.html course card reads Hcp', () => {
        const s = read('tournament.html');
        assert.match(s, /'<tr><td>Hcp<\/td>' \+ nine\.map\(h => `<td>\$\{h\.hcpIndex\}<\/td>`\)/);
        assert.ok(!/<td>SI<\/td>/.test(s));
    });
    test('the pars entry (simple-flow.js, gps-bet.js): the index box says HCP; the data key is still si / hcpIndex', () => {
        ['simple-flow.js', 'gps-bet.js'].forEach(f => {
            const s = read(f);
            assert.match(s, /placeholder="HCP" aria-label="Hole HCP \(stroke index\)"/, f);
            assert.ok(!/placeholder="Index"/.test(s), f);
            assert.match(s, /hcpIndex: si/, f);
        });
    });
});
