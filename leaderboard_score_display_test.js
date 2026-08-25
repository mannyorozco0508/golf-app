// ============================================================================
// LEADERBOARD — GROSS AND NET TOGETHER
//
// WHAT WAS WRONG
//
// renderBoard() computed BOTH gross and net for every golfer and then displayed
// neither. It showed a single "To Par" for whichever basis the Net/Gross toggle
// happened to be on, so checking the app against a paper card meant flipping the
// toggle back and forth and holding one number in your head. The data was
// already there; the renderer dropped it on the floor.
//
// WHAT CHANGED
//
//   Pos · Player · Score · To Par · Thru
//
// with Score stacking gross over net. Gross is primary because that is what is
// written on the card in front of you; net sits under it because that is the
// number the money is decided on.
//
// Stacked rather than columned on purpose: six columns at 390px squeezes the
// player name, and the Receipt scorecard already establishes gross-over-net, so
// the two screens now agree.
//
// THE TOGGLE STILL RANKS - IT NO LONGER HIDES. It drives sort order and the
// To Par basis, and is relabelled "Ranking: Net / Gross" so nobody expects a
// score to disappear.
//
// NO NEW ARITHMETIC. r.gross and r.net come from renderBoard()'s single pass
// through the canonical getStrokes/parseHcp pair. This is presentation only.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const PAGE = 'leaderboard.html';
const DEPS = ['money-engine.js','action-model.js'];
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

const NAMES = ['Marty','Scott','Carp','Randy','Manny','Matt B','Lance','Kopp',
               'Marcus','Rocco','Matt H','Jeremy'];
const HCP = [9,7,2,9,0,8,3,6,9,13,12,12];

// `grouped` picks the grouped renderer; 12 golfers gives three foursomes.
function boot({ scoring = 'net', grouped = false, n = 12, thru = 18 } = {}) {
    const sb = loadHtmlInlineScript(PAGE, DEPS);
    const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
    const ps = NAMES.slice(0,n).map((name,i)=>({ id:101+i, name, hcp:String(HCP[i]) }));
    const sc = {};
    ps.forEach((p,pi)=>cd.forEach((h,hi)=>{
        if (h.hole > thru) return;
        sc['p'+p.id+'_h'+h.hole] = h.par + ((pi*3+hi*5)%4) - 1;
    }));
    vm.runInContext(`
        currentBoardData = ${JSON.stringify({ players: ps, courseData: cd, scores: sc, gameFormat: 'stroke' })};
        activeView = 'individual';
        groupViewMode = '${grouped ? 'group' : 'flat'}';
        activeScoring = '${scoring}';
        renderBoard();
    `, sb);
    return { sb, html: () => sb.document.getElementById('board-content').innerHTML,
             run: c => vm.runInContext(c, sb) };
}

// Pulls one row per golfer straight out of the rendered markup.
function rows(html) {
    const out = [];
    const re = /<td class="player-name">([^<]+)<span class="player-hcp">HCP: (\d+)<\/span><\/td>\s*<td class="score-cell"><span class="score-gross">(\d+)<\/span><span class="score-net">Net (\d+)<\/span><\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td>(\d+)<\/td>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        out.push({ name: m[1], hcp: +m[2], gross: +m[3], net: +m[4],
                   toPar: m[5].replace(/<[^>]*>/g, ''), thru: +m[6] });
    }
    return out;
}
const toParNum = s => s === 'E' ? 0 : parseInt(s, 10);

// ============================================================================

describe('BOTH SCORES ARE VISIBLE AT ONCE', () => {

    test('every golfer shows a gross total', () => {
        const r = rows(boot().html());
        assert.equal(r.length, 12);
        r.forEach(x => assert.ok(x.gross > 0, `${x.name} has no gross`));
    });

    test('every golfer shows a net total', () => {
        rows(boot().html()).forEach(x => assert.ok(x.net > 0, `${x.name} has no net`));
    });

    test('gross and net appear together, in one cell, without switching modes', () => {
        const html = boot().html();
        assert.match(html, /<span class="score-gross">\d+<\/span><span class="score-net">Net \d+<\/span>/);
        assert.equal((html.match(/score-cell/g) || []).length, 12);
    });

    test('gross is the primary number, net the secondary one', () => {
        const src = read(PAGE);
        const gross = /\.score-gross \{([^}]*)\}/.exec(src)[1];
        const net = /\.score-net \{([^}]*)\}/.exec(src)[1];
        const gSize = parseFloat(/font-size:\s*([\d.]+)rem/.exec(gross)[1]);
        const nSize = parseFloat(/font-size:\s*([\d.]+)rem/.exec(net)[1]);
        assert.ok(gSize > nSize, 'gross must lead');
        assert.ok(nSize >= 0.78, 'but net must still be readable on a phone; got ' + nSize);
        assert.ok(!/var\(--text-muted\)/.test(net), 'net must not be muted into invisibility');
    });

    test('the net figure agrees with the handicap shown beside it', () => {
        // Par 72 over 18 holes; a golfer off N should be N shots better on net.
        rows(boot().html()).forEach(x => {
            assert.equal(x.gross - x.net, x.hcp,
                `${x.name}: gross ${x.gross} - net ${x.net} should equal HCP ${x.hcp}`);
        });
    });

    test('a golfer who has not started shows no score, and does not break the row', () => {
        const html = boot({ thru: 0 }).html();
        assert.ok(!/score-cell/.test(html), 'nothing to show yet');
        NAMES.slice(0,12).forEach(n => assert.ok(html.includes(n), `${n} must still be listed`));
    });
});

describe('THE TOGGLE RANKS — IT DOES NOT HIDE', () => {

    test('NET mode sorts by net', () => {
        const r = rows(boot({ scoring: 'net' }).html());
        for (let i = 1; i < r.length; i++) {
            assert.ok(r[i].net >= r[i-1].net,
                `net order broken: ${r[i-1].name} ${r[i-1].net} then ${r[i].name} ${r[i].net}`);
        }
    });

    test('GROSS mode sorts by gross', () => {
        const r = rows(boot({ scoring: 'gross' }).html());
        for (let i = 1; i < r.length; i++) {
            assert.ok(r[i].gross >= r[i-1].gross,
                `gross order broken: ${r[i-1].name} ${r[i-1].gross} then ${r[i].name} ${r[i].gross}`);
        }
    });

    test('the two modes genuinely produce a different order', () => {
        // If they did not, the sort assertions above would prove nothing.
        const n = rows(boot({ scoring: 'net' }).html()).map(x => x.name).join();
        const g = rows(boot({ scoring: 'gross' }).html()).map(x => x.name).join();
        assert.notEqual(n, g, 'the fixture must separate net and gross ranking');
    });

    test('BOTH scores stay visible in gross mode', () => {
        rows(boot({ scoring: 'gross' }).html()).forEach(x => {
            assert.ok(x.gross > 0 && x.net > 0, `${x.name} lost a score in gross mode`);
        });
    });

    test('To Par follows the active ranking basis', () => {
        const net = rows(boot({ scoring: 'net' }).html());
        const gross = rows(boot({ scoring: 'gross' }).html());
        const byName = arr => Object.fromEntries(arr.map(x => [x.name, x]));
        const n = byName(net), g = byName(gross);
        NAMES.slice(0,12).forEach(name => {
            // par 72 over the full round
            assert.equal(toParNum(n[name].toPar), n[name].net - 72, `${name}: net To Par`);
            assert.equal(toParNum(g[name].toPar), g[name].gross - 72, `${name}: gross To Par`);
        });
    });

    test('the toggle is labelled as ranking, not visibility', () => {
        const src = read(PAGE);
        assert.match(src, /Ranking:/, 'nobody should expect a score to disappear');
        assert.match(src, /id="label-net"[^>]*>Net</);
        assert.match(src, /id="label-gross"[^>]*>Gross</);
    });

    test('switchScoring still drives the board', () => {
        const b = boot({ scoring: 'net' });
        const before = rows(b.html()).map(x => x.name).join();
        b.run("switchScoring('gross');");
        assert.notEqual(rows(b.html()).map(x => x.name).join(), before);
    });
});

describe('FLAT AND GROUPED BOARDS BEHAVE THE SAME', () => {

    test('the grouped board shows both scores too', () => {
        const r = rows(boot({ grouped: true }).html());
        assert.equal(r.length, 12, 'all three foursomes render');
        r.forEach(x => assert.ok(x.gross > 0 && x.net > 0, `${x.name} missing a score`));
    });

    test('grouped rows use the same shared cell', () => {
        const html = boot({ grouped: true }).html();
        assert.equal((html.match(/score-cell/g) || []).length, 12);
    });

    test('grouped ranking follows the toggle within each group', () => {
        const html = boot({ grouped: true, scoring: 'gross' }).html();
        assert.equal(rows(html).length, 12);
        // Groups are four apiece; each is independently ordered.
        const r = rows(html);
        [[0,4],[4,8],[8,12]].forEach(([a,b]) => {
            const grp = r.slice(a,b);
            for (let i = 1; i < grp.length; i++) {
                assert.ok(grp[i].gross >= grp[i-1].gross, 'group order broken');
            }
        });
    });

    test('ONE cell builder serves both boards', () => {
        const src = read(PAGE);
        assert.equal((src.match(/function scoreCellHtml/g) || []).length, 1,
            'two copies would drift apart');
        assert.equal((src.match(/\$\{scoreCellHtml\(r\)\}/g) || []).length, 2,
            'both the flat and grouped renderers must call it');
    });

    test('the flat header names the new column', () => {
        assert.match(boot().html(), /<th>Score<\/th>/);
    });
});

describe('NO NEW MATH, NO ENGINE TOUCHED', () => {

    test('the cell builder computes nothing', () => {
        const src = read(PAGE);
        const at = src.indexOf('function scoreCellHtml');
        const fn = src.slice(at, src.indexOf('\n    }', at));
        ['getStrokes(','parseHcp(','Math.round(','+ h.par','parseInt(']
            .forEach(t => assert.ok(!fn.includes(t), `the renderer must not calculate; found ${t}`));
        assert.match(fn, /r\.gross/);
        assert.match(fn, /r\.net/);
    });

    test('handicap allocation still happens exactly once, in renderBoard', () => {
        const src = read(PAGE);
        assert.equal((src.match(/getStrokes\(h\.hcpIndex, parseHcp\(p\.hcp\)\)/g) || []).length, 1,
            'a second allocation site could disagree with the first');
    });

    test('the leaderboard settles no money', () => {
        const src = read(PAGE);
        ['computeMoneyPool(','computeCombinedNetTotals(','allocateWholeDollars(','simplifyDebts(']
            .forEach(t => assert.ok(!src.includes(t), `the board must not settle money; found ${t}`));
    });

    test('no engine or settlement file carries board markup', () => {
        ['pool-engine.js','settlement-engine.js','money-engine.js','action-model.js']
            .forEach(f => assert.ok(!/score-cell|score-gross/.test(read(f)),
                `${f} must contain no leaderboard presentation`));
    });

    test('the handicap still sits under the player name', () => {
        assert.match(boot().html(), /<span class="player-hcp">HCP: \d+<\/span>/);
    });
});
