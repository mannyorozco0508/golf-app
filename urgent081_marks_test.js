// ============================================================================
// URGENT-081 (Manny, 2026-10-26): squares for bogeys on the hole-by-hole cards,
// and the hole-difficulty row reads "HCP" (US) instead of "SI" (UK).
//
//   bogey (+1)               a square
//   double bogey or worse    a double square
//   par                      nothing
//   birdie / eagle           the circles, exactly as before (score-marks.js, a
//                            protected file, is byte-identical and still answers
//                            only birdie / eagle)
//   GROSS vs par only. The net row stays plain. The site's navy for the squares (Manny), the
//   circles' 2px line. DISPLAY ONLY: no score, money, data key or settlement code moves.
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { rounds } = require('./helpers/scorecard-rounds.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha8 = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO_ROOT, f))).digest('hex').slice(0, 8);

const SM = require('./score-marks.js');
global.scoreMarkClass = SM.scoreMarkClass;
const me = loadJsFile('money-engine.js', ['handicap.js']);
global.getStrokes = me.getStrokes; global.parseHcp = me.parseHcp;
const SR = require('./scorecard-rows.js');

describe('THE RULE: gross vs par, squares above, circles below, nothing at par', () => {
    test('boxMarkClass: +1 a square, +2/+3/+4 a double square, par / under / blank nothing', () => {
        assert.equal(SR.boxMarkClass(5, 4), 'mark-bogey');
        assert.equal(SR.boxMarkClass(6, 4), 'mark-double');
        assert.equal(SR.boxMarkClass(7, 4), 'mark-double');
        assert.equal(SR.boxMarkClass(8, 4), 'mark-double');
        assert.equal(SR.boxMarkClass(4, 4), '');
        assert.equal(SR.boxMarkClass(3, 4), '');
        assert.equal(SR.boxMarkClass(2, 4), '');
        ['', null, undefined, 0, '0', 'x'].forEach(v => assert.equal(SR.boxMarkClass(v, 4), '', 'blank ' + JSON.stringify(v)));
        assert.equal(SR.boxMarkClass(5, null), '', 'no par, no mark');
        assert.equal(SR.boxMarkClass('5', '4'), 'mark-bogey', 'strings as the database stores them');
    });
    test('markWithBoxes: every score 1-12 on par 3, 4, 5, 6 - circles exactly score-marks.js\'s, squares only above par', () => {
        [3, 4, 5, 6].forEach(par => {
            for (let s = 1; s <= 12; s++) {
                const ring = SM.scoreMarkClass(s, par).trim();
                const got = SR.markWithBoxes(s, par);
                if (s < par) assert.equal(got, ring, `circle unchanged ${s} on ${par}`);
                else if (s === par) assert.equal(got, '', `par plain ${s} on ${par}`);
                else if (s === par + 1) assert.equal(got, 'mark-bogey', `bogey ${s} on ${par}`);
                else assert.equal(got, 'mark-double', `double+ ${s} on ${par}`);
            }
        });
    });
    test('score-marks.js (protected) is untouched: still circles only, and its bytes are main\'s', () => {
        assert.equal(SM.scoreMarkClass(5, 4), '');
        assert.equal(SM.scoreMarkClass(3, 4), ' mark-birdie');
        assert.equal(SM.scoreMarkClass(2, 4), ' mark-eagle');
        assert.equal(sha8('score-marks.js'), '02f972d6');
    });
});

describe('THE CARDS', () => {
    const PARS = [5, 4, 4, 3, 5, 4, 3, 4, 5];
    const courseData = PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: [5, 3, 13, 11, 15, 9, 17, 1, 7][i] }));
    // eagle, birdie, bogey, double, triple, par, birdie, par, bogey
    const G = [3, 3, 5, 5, 8, 4, 2, 4, 6];
    const scores = {}; G.forEach((g, i) => { scores['p101_h' + (i + 1)] = g; });
    const players = [{ id: 101, name: 'Marco Diaz', hcp: '10' }];

    test('the board\'s expanded card: the right mark on the right hole, the net row plain, HCP not SI', () => {
        const html = SR.scorecardStackedHtml({ courseData, scores, players, showNet: true, ringOf: SR.markWithBoxes });
        const rows = html.split('</tr>');
        const gross = rows.find(r => r.includes('>Marco<'));
        const net = rows.find(r => r.includes('>net<'));
        const cls = [...gross.matchAll(/<td(?: class="([^"]*)")?>([^<]*)<\/td>/g)].map(m => (m[1] || '') + ':' + m[2]);
        assert.deepEqual(cls.slice(1, 10), ['mark-eagle:3', 'mark-birdie:3', 'mark-bogey:5', 'mark-double:5', 'mark-double:8', ':4', 'mark-birdie:2', ':4', 'mark-bogey:6']);
        assert.ok(!/mark-/.test(net), 'the net row carries no mark');
        assert.match(html, /<th class="rt-name">HCP<\/th>/);
        assert.ok(!/>SI</.test(html));
    });
    test('the Receipt\'s line: the same marks, HCP, net plain', () => {
        const html = SR.scorecardRowsHtml({ courseData, scores, players, showNet: true, ringOf: SR.markWithBoxes });
        assert.match(html, /<th class="rt-name">HCP<\/th>/);
        assert.equal((html.match(/mark-bogey/g) || []).length, 2);
        assert.equal((html.match(/mark-double/g) || []).length, 2);
        assert.ok(!/class="rt-net"[^]*mark-/.test(html.slice(html.indexOf('rt-net'))), 'nothing marked after the net row starts');
    });
    test('NUMBERS UNCHANGED: with the squares and without them, every cell\'s text is the same', () => {
        const R = rounds();
        Object.keys(R).forEach(k => {
            const d = R[k];
            const opts = ring => ({ courseData: d.courseData, scores: d.scores, players: d.players, showNet: true, ringOf: ring });
            const before = SR.scorecardRowsHtml(opts((s, p) => SM.scoreMarkClass(s, p).trim()));
            const after = SR.scorecardRowsHtml(opts(SR.markWithBoxes));
            const strip = h => h.replace(/ class="mark-[a-z]+"/g, '');
            assert.equal(strip(after), strip(before), k);
            const stBefore = SR.scorecardStackedHtml(opts((s, p) => SM.scoreMarkClass(s, p).trim()));
            const stAfter = SR.scorecardStackedHtml(opts(SR.markWithBoxes));
            assert.equal(strip(stAfter), strip(stBefore), k + ' stacked');
        });
    });
});

describe('THE PAGES', () => {
    test('leaderboard.html: the card asks markWithBoxes; the squares are the site\'s navy (--brand-navy), 2px like the circles', () => {
        const src = read('leaderboard.html');
        assert.match(src, /const ringOf = ScorecardRows\.markWithBoxes/);
        assert.match(src, /\.sc-stack \.receipt-table td\.mark-bogey \{ box-shadow: inset 0 0 0 2px var\(--brand-navy\);/);
        assert.match(src, /\.sc-stack \.receipt-table td\.mark-double \{ box-shadow: inset 0 0 0 2px var\(--brand-navy\), inset 0 0 0 3px var\(--bg-card\), inset 0 0 0 5px var\(--brand-navy\);/);
        assert.match(src, /--brand-navy: #1d3557;/); assert.match(src, /--brand-navy: #4a7bb5;/, 'a dark-mode navy exists');
        // the circles' own rules are still there, word for word
        assert.match(src, /\.sc-stack \.receipt-table td\.mark-birdie \{ box-shadow: inset 0 0 0 2px var\(--accent-red\); border-radius: 50%; \}/);
    });
    test('settlement.html: markWithBoxes, screen + print squares, the legend names them; the circles\' legend stays', () => {
        const src = read('settlement.html');
        assert.match(src, /ScorecardRows\.markWithBoxes\(score, par\)/);
        assert.match(src, /\.receipt-table td\.mark-bogey \{ box-shadow: inset 0 0 0 2px var\(--brand-navy\)/);
        assert.match(src, /\.receipt-table td\.mark-double, \.receipt-table td\.mark-eagle \{ padding-left: 7px; padding-right: 7px; \}/, 'the eagle and double rings get room (Manny, 081)');
        assert.match(src, /\.receipt-table td\.mark-bogey, \.legend-bogey \{\s*box-shadow: inset 0 0 0 2px #1d3557 !important/);
        assert.match(src, /<span class="legend-dot legend-birdie"><\/span> Birdie/);
        assert.match(src, /<span class="legend-dot legend-eagle"><\/span> Eagle or better/);
        assert.match(src, /legend-bogey"><\/span> Bogey/);
        assert.match(src, /legend-double"><\/span> Double bogey or worse/);
    });
    test('the Receipt really renders squares (settlement.html in the harness)', () => {
        const sb = loadHtmlInlineScript('settlement.html', []);
        const d = rounds().net;
        vm.runInContext(`currentMode='ABCD'; currentData=${JSON.stringify(d)}; renderReceiptScorecard();`, sb);
        const html = sb.document.getElementById('receipt-scorecard').innerHTML;
        assert.match(html, /mark-(bogey|double)|mark-(birdie|eagle)/);
        assert.match(html, /<th class="rt-name">HCP<\/th>/);
    });
    test('index.html Card view: the bogey / double squares are navy 2px, inside the score box', () => {
        const src = read('index.html');
        assert.match(src, /\.shape-box-1 \{ top: 9px; left: 9px; right: 9px; bottom: 9px; border: 2px solid var\(--brand-navy\); border-radius: 3px; \}/);
        assert.match(src, /\.shape-box-2 \{ top: 5px; left: 5px; right: 5px; bottom: 5px; border: 2px solid var\(--brand-navy\); border-radius: 3px; \}/);
        // the elements themselves are drawn as before: gross vs par
        assert.match(src, /if \(grossDiff === 1\) \{\s*shapeHtml = `<div class="shape-box-1"><\/div>`;/);
    });
    test('shared.html (the live link card): a square for a bogey, a double square for worse', () => {
        const src = read('shared.html');
        assert.match(src, /\} else if \(diff === 1\) \{\s*shape = `<div class="box-1"><\/div>`;/);
        assert.match(src, /\} else if \(diff >= 2\) \{\s*shape = `<div class="box-1"><\/div><div class="box-2"><\/div>`;/);
        assert.match(src, /\.box-1 \{[^}]*border: 2px solid #1d3557/);
    });
    test('tournament.html course card: the row reads Hcp, not SI; the values are still hcpIndex', () => {
        const src = read('tournament.html');
        assert.match(src, /'<tr><td>Hcp<\/td>' \+ nine\.map\(h => `<td>\$\{h\.hcpIndex\}<\/td>`\)/);
        assert.ok(!/<td>SI<\/td>/.test(src));
    });
});
