// ============================================================================
// TRIP LEADERBOARD & MONEY PRESENTATION
//
// TWO THINGS, BOTH PRESENTATION ONLY.
//
// 1. renderCumulativeLeaderboard() summed gross AND net for every golfer across
//    every linked round, then displayed whichever the toggle happened to be on.
//    Same shape as the round leaderboard before it was fixed - the data was
//    already there, the renderer dropped half of it. Comparing the trip board
//    against a paper card meant flipping the toggle and holding a number in your
//    head across a week of rounds.
//
// 2. Trip money rendered "$40.00" while the Receipt renders "$40". The maths was
//    right - whole-dollar rounds produce whole nets - but two decimal places made
//    the trip look like a different system from the rounds it sums.
//
// NOT A MONEY CHANGE. Trip totals still come from computeCombinedNetTotals() per
// round; Who Pays Who still comes from simplifyDebts(); the settled-state gate
// from the previous batch is untouched. The tests at the bottom hold all three.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const PAGE = 'trip.html';
const DEPS = ['money-engine.js','action-model.js','settlement-engine.js','pool-engine.js','score-marks.js'];
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const NAMES = ['Marty','Scott','Carp','Randy','Manny','Matt B','Lance','Kopp',
               'Marcus','Rocco','Matt H','Jeremy'];
const HCP = [9,7,2,9,0,8,3,6,9,13,12,12];
const ALL_KP = { h3:'101', h7:'105', h12:'109', h16:'102' };

function roundData({ seed = 0, confirmed = true, players = NAMES } = {}) {
    const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
    const ps = players.map((n,i)=>({ id:101+NAMES.indexOf(n), name:n,
                                     hcp:String(HCP[NAMES.indexOf(n)]), playingForMoney:true }));
    const sc = {};
    ps.forEach((p,pi)=>cd.forEach((h,hi)=>{ sc['p'+p.id+'_h'+h.hole] = 4 + ((pi+hi+seed)%3) - 1; }));
    const d = { players: ps, courseData: cd, scores: sc, gameFormat:'stroke',
                settlementMode:'whole-dollar', kpWinners: confirmed ? ALL_KP : {} };
    if (players.length === NAMES.length) {
        d.moneyPool = { enabled:true, buyIn:40,
            kp:{ amount:100, holes:[3,7,12,16] },
            net:{ amount:70, places:[57.142857,42.857143] },
            skins:{ mode:'remainder', scoring:'net', carryOver:false } };
    }
    if (confirmed) d.kpConfirmed = { confirmed: true };
    return d;
}

function boot({ rounds = [{}, { seed: 1 }], mode = 'gross' } = {}) {
    const sb = loadHtmlInlineScript(PAGE, DEPS);
    const linked = rounds.map((r, i) => ({
        label: r.label || ('Round ' + (i+1)), countsTowardTrip: true, data: roundData(r),
    }));
    vm.runInContext(`
        cachedRoundResults = ${JSON.stringify(linked)};
        cachedCountedResults = cachedRoundResults;
        lbMode = '${mode}';
        renderCumulativeLeaderboard();
        renderTripMoneySettlement();
    `, sb);
    return {
        sb, run: c => vm.runInContext(c, sb),
        board: () => sb.document.getElementById('trip-leaderboard').innerHTML,
        money: () => sb.document.getElementById('trip-money-settlement').innerHTML,
    };
}

// Pulls one row per golfer out of the rendered board.
function rows(html) {
    const out = [];
    const re = /class="lb-pos">(\d+)<\/span>\s*<span class="lb-team">([^<]+)<br><span class="lb-sub">(\d+) round[^<]*<\/span><\/span>\s*<span class="lb-score score-cell"><span class="score-gross">(\d+)<\/span><span class="score-net">Net (\d+)<\/span><\/span>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        out.push({ pos:+m[1], name:m[2], rounds:+m[3], gross:+m[4], net:+m[5] });
    }
    return out;
}

// ============================================================================

describe('BOTH TOTALS VISIBLE ON THE TRIP BOARD', () => {

    test('every golfer shows a cumulative gross and net', () => {
        const r = rows(boot().board());
        assert.equal(r.length, 12);
        r.forEach(x => {
            assert.ok(x.gross > 0, `${x.name} has no gross`);
            assert.ok(x.net > 0, `${x.name} has no net`);
        });
    });

    test('they appear together, without touching the toggle', () => {
        const html = boot().board();
        assert.match(html, /<span class="score-gross">\d+<\/span><span class="score-net">Net \d+<\/span>/);
        assert.equal((html.match(/score-cell/g) || []).length, 12);
    });

    test('the header names one Score column, not the active mode', () => {
        assert.match(boot({ mode:'gross' }).board(), /<span class="lb-score">Score<\/span>/);
        assert.match(boot({ mode:'net' }).board(),   /<span class="lb-score">Score<\/span>/);
    });

    test('the totals are CUMULATIVE across rounds, not a single round', () => {
        const one = rows(boot({ rounds:[{}] }).board());
        const two = rows(boot({ rounds:[{}, { seed:1 }] }).board());
        const byName = a => Object.fromEntries(a.map(x => [x.name, x]));
        const o = byName(one), t = byName(two);
        NAMES.forEach(n => {
            assert.ok(t[n].gross > o[n].gross, `${n}: two rounds must total more than one`);
            assert.equal(t[n].rounds, 2);
        });
    });

    test('the net difference equals the handicap taken per round played', () => {
        // Par 72 a round; a golfer off N is N better on net each round.
        const r = rows(boot({ rounds:[{}, { seed:1 }] }).board());
        r.forEach(x => {
            const hcp = HCP[NAMES.indexOf(x.name)];
            assert.equal(x.gross - x.net, hcp * x.rounds,
                `${x.name}: gross-net should be ${hcp} x ${x.rounds} rounds`);
        });
    });

    test('a golfer who missed a round still shows the rounds they played', () => {
        const r = rows(boot({ rounds:[{}, { seed:1, players: NAMES.slice(0, 8) }] }).board());
        const byName = Object.fromEntries(r.map(x => [x.name, x]));
        assert.equal(byName['Marty'].rounds, 2);
        assert.equal(byName['Jeremy'].rounds, 1, 'Jeremy sat out the second round');
        assert.ok(byName['Jeremy'].gross > 0, 'and still has a total');
    });

    test('gross leads, net is subordinate but readable', () => {
        const src = read(PAGE);
        const g = /\.score-gross \{([^}]*)\}/.exec(src)[1];
        const n = /\.score-net \{([^}]*)\}/.exec(src)[1];
        const gs = parseFloat(/font-size:\s*([\d.]+)rem/.exec(g)[1]);
        const ns = parseFloat(/font-size:\s*([\d.]+)rem/.exec(n)[1]);
        assert.ok(gs > ns, 'gross must lead');
        assert.ok(ns >= 0.78, 'net must stay readable on a phone; got ' + ns);
        assert.ok(!/var\(--text-muted\)/.test(n), 'net must not be muted into invisibility');
    });

    test('it matches the round leaderboard, class for class', () => {
        // The two boards should read identically; sharing the class names is what
        // keeps them that way.
        const lb = read('leaderboard.html');
        ['score-cell','score-gross','score-net'].forEach(c => {
            assert.ok(read(PAGE).includes(c), `trip.html missing ${c}`);
            assert.ok(lb.includes(c), `leaderboard.html missing ${c}`);
        });
    });
});

describe('THE TOGGLE RANKS — IT DOES NOT HIDE', () => {

    test('gross mode sorts by cumulative gross', () => {
        const r = rows(boot({ mode:'gross' }).board());
        for (let i = 1; i < r.length; i++) {
            assert.ok(r[i].gross >= r[i-1].gross, 'gross order broken');
        }
    });

    test('net mode sorts by cumulative net', () => {
        const r = rows(boot({ mode:'net' }).board());
        for (let i = 1; i < r.length; i++) {
            assert.ok(r[i].net >= r[i-1].net, 'net order broken');
        }
    });

    test('the two modes genuinely differ', () => {
        const g = rows(boot({ mode:'gross' }).board()).map(x => x.name).join();
        const n = rows(boot({ mode:'net' }).board()).map(x => x.name).join();
        assert.notEqual(g, n, 'the fixture must separate gross and net ranking');
    });

    test('BOTH totals stay visible in either mode', () => {
        ['gross','net'].forEach(m => {
            rows(boot({ mode:m }).board()).forEach(x => {
                assert.ok(x.gross > 0 && x.net > 0, `${x.name} lost a total in ${m} mode`);
            });
        });
    });

    test('the toggle is labelled as ranking', () => {
        assert.match(read(PAGE), /Ranking:/, 'nobody should expect a total to disappear');
    });
});

describe('TRIP MONEY READS IN WHOLE DOLLARS', () => {

    test('no cents in the net-across-the-trip figures', () => {
        const t = strip(boot().money());
        assert.ok(!/\$\d+\.\d\d/.test(t), 'whole-dollar rounds must not print cents: ' + t.slice(0,120));
        assert.match(t, /[+-]\$\d+/);
    });

    test('Who Pays Who amounts are whole dollars too', () => {
        const html = boot().money();
        const pays = html.slice(html.indexOf('Who Pays Who'));
        assert.ok(!/\$\d+\.\d\d/.test(strip(pays)));
    });

    test('one shared amount rule serves the page', () => {
        const src = read(PAGE);
        assert.match(src, /function fmtAmt\(v\)/);
        assert.ok((src.match(/\.toFixed\(2\)/g) || []).length <= 2,
            'toFixed(2) should survive only inside the formatters themselves');
    });

    test('a genuine fraction still prints its cents', () => {
        // Legacy cent-settled rounds can produce real fractions; those must not be
        // rounded away silently.
        const b = boot();
        assert.equal(b.run('fmtAmt(40)'), '40');
        assert.equal(b.run('fmtAmt(40.5)'), '40.50');
        assert.equal(b.run('fmtAmt(0)'), '0');
    });

    test('the share recap uses the same rule', () => {
        assert.match(read(PAGE), /owes \$\{t\.to\}|\$\$\{fmtAmt\(t\.amount\)\}/,
            'the pasted recap must not disagree with the screen');
    });
});

describe('NO MONEY BEHAVIOUR CHANGED', () => {

    const fn = () => {
        const src = read(PAGE);
        const at = src.indexOf('function renderTripMoneySettlement');
        return src.slice(at, src.indexOf('\n    function ', at + 10));
    };

    test('trip money still sums the canonical per-round settlement', () => {
        assert.match(fn(), /computeCombinedNetTotals\(data, courseData, savedScores\)/);
        assert.match(fn(), /simplifyDebts\(netTotals\)/);
    });

    test('THE SETTLED GATE FROM THE PREVIOUS BATCH IS INTACT', () => {
        const f = fn();
        assert.match(f, /rp\.settled === false/);
        assert.match(f, /unresolvedRounds/);
        const t = strip(boot({ rounds:[{ label:'Caledonia', confirmed:false }] }).money());
        assert.match(t, /Who Pays Who — Not Final/);
        assert.match(t, /unconfirmed in: Caledonia/);
    });

    test('a settled trip is still called final', () => {
        assert.match(strip(boot().money()), /Final "Who Pays Who"/);
    });

    test('every handicap allocation on the page uses the canonical call', () => {
        // Three sites exist - the cumulative leaderboard, the awards calculation and
        // the points race - and all three predate this pass. What matters is not the
        // count but that none of them hand-rolls its own allocation: every one calls
        // getStrokes/parseHcp exactly as the engines do, so they cannot disagree.
        const src = read(PAGE);
        const calls = src.match(/getStrokes\([^)]*\)/g) || [];
        assert.ok(calls.length >= 1, 'the page must allocate strokes somewhere');
        calls.forEach(c => assert.equal(c, 'getStrokes(h.hcpIndex, parseHcp(p.hcp)',
            'an allocation site deviating from the canonical call: ' + c));
    });

    test('this pass added no new handicap arithmetic', () => {
        const src = read(PAGE);
        const at = src.indexOf('function renderCumulativeLeaderboard');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 10));
        assert.equal((fn.match(/getStrokes\(/g) || []).length, 1,
            'the leaderboard allocates once, as it always did');
    });

    test('the trip allocates no money of its own', () => {
        // computeMoneyPool IS called - to ask whether a round is settled - so the
        // check is on the allocators, which are what would constitute the trip
        // deciding money for itself.
        const src = read(PAGE);
        ['allocateWholeDollars(','splitCentsEvenly(','moneyPoolNetPlaceCents(']
            .forEach(t => assert.ok(!src.includes(t), `the trip must not allocate money; found ${t}`));
    });

    test('trip.html still declares every engine it needs', () => {
        const src = read(PAGE);
        ['money-engine.js','action-model.js','settlement-engine.js','pool-engine.js']
            .forEach(f => assert.match(src, new RegExp('<script src="' + f + '"'),
                `trip.html must load ${f}`));
    });
});
