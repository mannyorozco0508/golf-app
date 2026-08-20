// ============================================================================
// ACTION PAGE COVERAGE
//
// Money can arrive from three stores: the legacy main game (gameFormat), stacked
// games (additionalGameInstances), and side matches. The Action page used to read
// only the third.
//
// Two bugs followed. A $50 Match created during setup settled, showed in Live
// Action and printed on the Receipt while being invisible on the page a golfer
// opens to see their bets. And a Skins game created ON the Action page saved into
// additionalGameInstances and then vanished from that same page.
//
// THE RULE THIS FILE ENFORCES: if it affects money, it is visible on Action.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const J = JSON.stringify;
const CD = makeCourseData(18);
const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const DEPS = ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js'];

// Renders the REAL Action page list and hands back its HTML.
function renderAction(data) {
    const sb = loadHtmlInlineScript('sidematches.html', DEPS);
    vm.runInContext(`
        currentData = ${J(data)};
        renderSideMatches();
        window.__h = document.getElementById('sidematches-list').innerHTML;
    `, sb);
    return sb.window.__h;
}
const titles = h => [...h.matchAll(/class="sm-card-title">([^<]*)</g)].map(m => m[1].trim());
const keys = h => [...h.matchAll(/data-action-key="([^"]+)"/g)].map(m => m[1]);
const sideCards = h => (h.match(/Remove Match/g) || []).length;

function field(n, groups) {
    const names = ['Marty', 'Manny', 'John', 'Steve', 'Stan', 'Greg', 'Tony', 'James', 'Jose', 'Ryan', 'Dave', 'Rocco'];
    const P = makePlayers(names.slice(0, n), Array.from({ length: n }, (_, i) => String(i * 2)));
    P.forEach((p, i) => {
        p.playingForMoney = true;
        p.group = groups > 1 ? Math.floor(i / (n / groups)) + 1 : 1;
        p.team = i % 2 === 0 ? 'Team 1' : 'Team 2';
    });
    const S = {};
    CD.forEach((h, i) => P.forEach((p, pi) => { S[`p${p.id}_h${h.hole}`] = h.par + ((i + pi) % 4 === 0 ? -1 : pi % 3); }));
    return { P, S, id: k => String(P[k].id) };
}

// ---------------------------------------------------------------------------
describe('THE REPORTED BUG — a setup wager going missing', () => {
    const { P, S, id } = field(8, 2);
    const data = {
        gameFormat: 'match', matchStake: 50, matchScoring: 'net', matchPressRule: 'none',
        players: P, courseData: CD, scores: S,
        sideMatches: {
            s1: { format: 'stroke', scoring: 'net', teamAIds: [id(0)], teamBIds: [id(2)], overallStake: 20, overallMode: 'stroke', segment: 'full', tieRule: 'carry', startHole: 1, createdAt: 1 },
            s2: { format: 'match', scoring: 'net', stake: 50, pressRule: 'none', teamAIds: [id(0), id(3)], teamBIds: [id(1), id(2)], startHole: 1, createdAt: 2 },
            s3: { format: 'stroke', scoring: 'gross', teamAIds: [id(0)], teamBIds: [id(4)], overallStake: 100, overallMode: 'stroke', segment: 'full', tieRule: 'carry', startHole: 8, createdAt: 3 }
        }
    };

    test('the original round wager is visible alongside the new ones', () => {
        const h = renderAction(data);
        assert.ok(/Match Play/.test(h), 'the $50 Match created during setup must appear');
        assert.equal(sideCards(h), 3, 'and all three added wagers must still render');
    });

    test('the round wager is READ-ONLY — no edit or remove', () => {
        const h = renderAction(data);
        assert.ok(/Created with the round/.test(h), 'it must say where it came from');
        const mainCard = h.slice(h.indexOf('data-action-key="main"'), h.indexOf('data-action-key="main"') + 600);
        assert.ok(!/Remove Match|deleteSideMatch/.test(mainCard),
            'removing it would mean rewriting gameFormat on a saved round');
    });

    test('a cross-group wager states which holes it covers', () => {
        assert.ok(/H8/.test(renderAction(data)), 'a mid-round bet must show its range');
    });

    test('a Stroke Play round is NOT listed as a wager', () => {
        // How the round is scored is not money, and listing it would be noise.
        const h = renderAction({ gameFormat: 'stroke', players: P, courseData: CD, scores: S, sideMatches: data.sideMatches });
        assert.ok(!/data-action-key="main"/.test(h));
    });
});

// ---------------------------------------------------------------------------
describe('THE SKINS VANISHING REGRESSION', () => {
    const { P, S, id } = field(8, 2);

    // Exactly the shape saveFieldAction() writes when a golfer taps Add Action -> Skins.
    const asSaved = {
        gameFormat: 'stroke', players: P, courseData: CD, scores: S,
        additionalGameInstances: {
            k1: {
                format: 'skins', enabled: true, startHole: 6, createdAt: 1,
                skinsBuyIn: 10, skinsPotFormat: 'net', skinsScoring: 'net', skinsCarryOver: true,
                participantIds: [id(0), id(1), id(2)]
            }
        }
    };

    test('a Skins game created from Action is visible immediately after save', () => {
        const h = renderAction(asSaved);
        assert.ok(keys(h).includes('k1'), 'it must not vanish from the page that created it');
        assert.ok(/Skins/.test(h));
    });

    test('it names its participants and its start hole', () => {
        const h = renderAction(asSaved);
        assert.ok(/Marty/.test(h) && /Manny/.test(h) && /John/.test(h));
        assert.ok(!/Steve/.test(h), 'a golfer outside the wager must not be listed in it');
        assert.ok(/H6/.test(h));
    });

    test('two Skins games render separately, never collapsed into one row', () => {
        const two = JSON.parse(JSON.stringify(asSaved));
        two.additionalGameInstances.k2 = {
            format: 'skins', enabled: true, startHole: 1, createdAt: 2,
            skinsBuyIn: 20, skinsPotFormat: 'gross', skinsScoring: 'gross', skinsCarryOver: false,
            participantIds: [id(0), id(4), id(5), id(6)]
        };
        const h = renderAction(two);
        assert.equal(keys(h).filter(k => k === 'k1' || k === 'k2').length, 2);
        const t = titles(h).join(' | ');
        assert.ok(/\$10/.test(t) && /\$20/.test(t), `both stakes must show: ${t}`);
        assert.ok(/Carry Over/.test(t) && /No Carry/.test(t), 'their terms differ and must be readable');
    });

    test('a disabled instance is not listed', () => {
        const off = JSON.parse(JSON.stringify(asSaved));
        off.additionalGameInstances.k1.enabled = false;
        assert.ok(!keys(renderAction(off)).includes('k1'));
    });
});

// ---------------------------------------------------------------------------
describe('NO DUPLICATES, NO EMPTY SECTIONS', () => {
    const { P, S, id } = field(8, 2);

    test('every wager appears exactly once across all three stores', () => {
        const h = renderAction({
            gameFormat: 'nassau', nassauStake: 20, nassauScoring: 'net', nassauPressRule: 'none',
            players: P, courseData: CD, scores: S,
            additionalGameInstances: { g1: { format: 'skins', enabled: true, skinsBuyIn: 10, startHole: 1, createdAt: 1 } },
            sideMatches: { s1: { format: 'match', scoring: 'net', stake: 50, pressRule: 'none', teamAIds: [id(0)], teamBIds: [id(1)], startHole: 1, createdAt: 1 } }
        });
        const k = keys(h);
        assert.equal(new Set(k).size, k.length, `duplicate keys: ${k}`);
        assert.equal(k.length, 2, 'main + one stacked game');
        assert.equal(sideCards(h), 1);
    });

    test('a round with no action shows one empty state and nothing else', () => {
        const h = renderAction({ gameFormat: 'stroke', players: P, courseData: CD, scores: S });
        assert.ok(!/sm-card-title/.test(h), 'no empty main/skins/side sections');
        assert.equal(sideCards(h), 0);
        assert.ok(/No action yet/.test(h));
    });

    test('a legacy main game with no stake is not shown as money', () => {
        const h = renderAction({ gameFormat: 'match', players: P, courseData: CD, scores: S });
        assert.ok(!/data-action-key="main"/.test(h), 'a $0 match is not a wager');
    });
});

// ---------------------------------------------------------------------------
describe('GROUP COUNTS — one, two and three groups', () => {
    [[4, 1], [8, 2], [12, 3]].forEach(([n, groups]) => {
        test(`${groups} group${groups > 1 ? 's' : ''} / ${n} golfers: every wager renders`, () => {
            const { P, S, id } = field(n, groups);
            const data = {
                gameFormat: 'nassau', nassauStake: 20, nassauScoring: 'net', nassauPressRule: 'none',
                players: P, courseData: CD, scores: S,
                additionalGameInstances: {
                    g1: { format: 'skins', enabled: true, skinsBuyIn: 10, skinsPotFormat: 'net', skinsCarryOver: true, startHole: 1, createdAt: 1, participantIds: [id(0), id(1)] }
                },
                sideMatches: {
                    s1: { format: 'match', scoring: 'net', stake: 50, pressRule: 'none', teamAIds: [id(0)], teamBIds: [id(1)], startHole: 1, createdAt: 1 },
                    // cross-group where the field allows it
                    s2: { format: 'stroke', scoring: 'gross', teamAIds: [id(0)], teamBIds: [id(n - 1)], overallStake: 100, overallMode: 'stroke', segment: 'full', tieRule: 'carry', startHole: 1, createdAt: 2 }
                }
            };
            const h = renderAction(data);
            assert.equal(keys(h).length, 2, 'main + skins');
            assert.equal(sideCards(h), 2, 'both side matches');
            assert.equal(new Set(keys(h)).size, keys(h).length);
        });
    });
});

// ---------------------------------------------------------------------------
describe('COVERAGE PARITY — Action / Live / Settlement / Receipt', () => {
    const ENG = (() => {
        const sb = loadJsFile('money-engine.js');
        ['action-model.js', 'settlement-engine.js', 'bet-strip.js'].forEach(f =>
            vm.runInContext(read(f), sb, { filename: f }));
        return sb;
    })();
    const call = c => { vm.runInContext(`window.__r = (function(){ ${c} })();`, ENG); return ENG.window.__r; };

    const { P, S, id } = field(8, 2);
    const data = {
        gameFormat: 'match', matchStake: 50, matchScoring: 'net', matchPressRule: 'none',
        players: P, courseData: CD, scores: S,
        additionalGameInstances: {
            g1: { format: 'skins', enabled: true, skinsBuyIn: 10, skinsPotFormat: 'net', skinsScoring: 'net', skinsCarryOver: true, startHole: 1, createdAt: 1, participantIds: [id(0), id(1), id(2)] }
        },
        sideMatches: {
            s1: { format: 'match', scoring: 'net', stake: 50, pressRule: 'none', teamAIds: [id(0)], teamBIds: [id(4)], startHole: 1, createdAt: 1 }
        }
    };

    test('every money-bearing wager is on the Action page', () => {
        const h = renderAction(data);
        assert.ok(keys(h).includes('main'), 'legacy main game');
        assert.ok(keys(h).includes('g1'), 'stacked skins');
        assert.equal(sideCards(h), 1, 'side match');
    });

    test('the same wagers reach Live Action, settlement and the Receipt', () => {
        const live = call(`return buildActionRows(${J(data)}, ${J(CD)}, ${J(S)}, ${J(P)}, null).map(function(r){ return r.key; });`);
        assert.ok(live.includes('main') && live.includes('g1'), 'round games in Live Action');
        // Side matches deliberately render through the scorecard's My Matches surface,
        // not through buildActionRows - two jobs, two surfaces.
        const recs = call(`return buildSideMatchReceipts(${J(data)}, ${J(CD)}, ${J(S)}).length;`);
        assert.equal(recs, 1, 'side match on the Receipt');
        const money = call(`
            var o = computeCombinedNetTotals(${J(data)}, ${J(CD)}, ${J(S)});
            var t = 0; Object.keys(o.netByName).forEach(function(k){ t += o.netByName[k].net; });
            return { total: t, rows: Object.keys(o.netByName).length };
        `);
        assert.equal(money.total, 0, 'settlement stays zero-sum');
        assert.ok(money.rows > 0, 'and actually paid somebody');
    });

    test('SETTLEMENT NON-REGRESSION: this was a display change only', () => {
        // The renderer must not appear anywhere in the money path.
        ['money-engine.js', 'settlement-engine.js', 'action-model.js'].forEach(f => {
            assert.ok(!/buildRoundGameCards|renderSideMatches|sm-card-title/.test(read(f)),
                `${f} gained display code`);
        });
    });
});

// ---------------------------------------------------------------------------
describe('THE RENDERER USES THE CANONICAL NORMALIZER', () => {
    const sm = read('sidematches.html');
    const fn = sm.slice(sm.indexOf('function buildRoundGameCards'), sm.indexOf('function renderSideMatches'));

    test('it asks getRoundGames rather than decoding storage by hand', () => {
        assert.ok(/getRoundGames\(currentData\)/.test(fn));
        assert.ok(!/additionalGameInstances\[/.test(fn), 'no hand-rolled storage decoding');
        assert.ok(!/data\.gameFormat ===/.test(fn));
    });

    test('it degrades safely if the round model has not loaded', () => {
        assert.ok(/typeof getRoundGames !== 'function'/.test(fn));
        assert.ok(/catch \(e\) \{ return ''; \}/.test(fn), 'a render error must not blank the page');
    });

    test('side matches keep their own untouched renderer', () => {
        assert.ok(/matchIds\.sort/.test(sm), 'the existing side match loop must remain');
        assert.ok(/list\.innerHTML = roundGameCards \+ html;/.test(sm), 'round games are prepended, not merged in');
    });
});
