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
//
// RE-PINNED FOR THE BETS/MATCHES SPLIT (v135). "Action" is now two tabs with two
// jobs: the Bets tab (skins.html) is where a group watches every wager - round
// games as status rows, matches in full - and the Matches tab (sidematches.html)
// is where matches are built, naming the round games in one line. So the rule
// reads: every money-bearing wager is on the BARE-LINK Bets tab, and the
// Matches tab names it. Both pages are rendered the way a golfer arrives: the
// page loads with the link and the round comes through its own listener.
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

// Renders BOTH real pages on the bare link and hands back their HTML: the Bets
// tab's games rows and match cards, and the Matches tab's list. A page's render
// is reached through the value listener it registered, never called by name.
function arriveWith(page, data) {
    const sb = loadHtmlInlineScript(page, [], { search: '?game=ABCD' });
    const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/ABCD');
    h.cb({ val: () => data, exists: () => true });
    return sb;
}
function renderAction(data) {
    const bets = arriveWith('skins.html', data);
    const sm = arriveWith('sidematches.html', data);
    const el = (sb, id) => String(sb.document.getElementById(id).innerHTML || '');
    // The Bets tab is the surface every wager must reach; the Matches list is
    // appended so a side match's Remove control (Matches-only) is still countable.
    return el(bets, 'bets-games') + el(bets, 'bets-matches') + '\n<!-- matches -->\n' + el(sm, 'sidematches-list');
}
const titles = h => [...h.matchAll(/data-game-key="[^"]+">\s*<span>([^<]*)</g)].map(m => m[1].trim());
const keys = h => [...h.matchAll(/data-game-key="([^"]+)"/g)].map(m => m[1]);
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
        const mainCard = h.slice(h.indexOf('data-game-key="main"'), h.indexOf('data-game-key="main"') + 600);
        assert.ok(/Match Play/.test(mainCard), 'the row names the wager');
        assert.ok(!/Remove Match|deleteSideMatch|onclick=/.test(mainCard),
            'removing it would mean rewriting gameFormat on a saved round');
    });

    test('a cross-group wager states which holes it covers', () => {
        assert.ok(/H8/.test(renderAction(data)), 'a mid-round bet must show its range');
    });

    test('a Stroke Play round is NOT listed as a wager', () => {
        // How the round is scored is not money, and listing it would be noise.
        const h = renderAction({ gameFormat: 'stroke', players: P, courseData: CD, scores: S, sideMatches: data.sideMatches });
        assert.ok(!/data-game-key="main"/.test(h));
        assert.ok(!/id="sm-round-games"/.test(h.slice(h.indexOf('<!-- matches -->'))), 'nor named on Matches');
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
        const games = h.slice(0, h.indexOf('<!-- matches -->'));
        assert.ok(/Marty/.test(games) && /Manny/.test(games) && /John/.test(games));
        assert.ok(!/Steve/.test(games), 'a golfer outside the wager must not be listed in it');
        assert.ok(/H6/.test(games));
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
        assert.equal(keys(h).length, 0, 'no empty main/skins sections');
        assert.ok(!/bets-match-/.test(h));
        assert.equal(sideCards(h), 0);
        assert.ok(/No action yet/.test(h));
    });

    test('a legacy main game with no stake is not shown as money', () => {
        const h = renderAction({ gameFormat: 'match', players: P, courseData: CD, scores: S });
        assert.ok(!/data-game-key="main"/.test(h), 'a $0 match is not a wager');
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
        // BEHAVIOUR CHANGE (legacy receipt parity): the round's own Match wager now gets
        // a detailed receipt block too, described as a virtual side match through the SAME
        // builder. It used to print one summary line with no presses or start holes while
        // an identical Action wager printed its whole history. This fixture has a $50 main
        // Match plus one side match, so it produces two blocks, not one.
        const recs = call(`return buildSideMatchReceipts(${J(data)}, ${J(CD)}, ${J(S)}).map(function(r){ return r.matchId; });`);
        assert.equal(recs.length, 2, 'the main wager and the side match both get a block');
        assert.ok(recs.includes('__main'), 'the round wager must be explained, not just settled');
        assert.equal(recs.filter(function (k) { return k !== '__main'; }).length, 1, 'side match on the Receipt');
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
            assert.ok(!/buildRoundGamesPointer|renderSideMatches|renderBets|bets-game/.test(read(f)),
                `${f} gained display code`);
        });
    });
});

// ---------------------------------------------------------------------------
describe('THE RENDERER USES THE CANONICAL NORMALIZER', () => {
    const sm = read('sidematches.html');
    const sk = read('skins.html');
    const slice = (src, start) => {
        const at = src.indexOf(start);
        assert.ok(at > -1, start);
        return src.slice(at, src.indexOf('\n    function ', at + 30));
    };
    const pointer = slice(sm, 'function buildRoundGamesPointer()');
    const bets = slice(sk, 'function renderBets()');

    test('both pages ask getRoundGames rather than decoding storage by hand', () => {
        [pointer, bets].forEach(fn => {
            assert.ok(/getRoundGames\(currentData\)/.test(fn));
            assert.ok(!/additionalGameInstances\[/.test(fn), 'no hand-rolled storage decoding');
            assert.ok(!/data\.gameFormat ===/.test(fn));
        });
        assert.ok(/buildActionRows\(currentData/.test(bets), 'the Bets rows are the presenter\'s');
    });

    test('the Matches pointer degrades safely if the round model has not loaded', () => {
        assert.ok(/typeof getRoundGames !== 'function'/.test(pointer));
        assert.ok(/catch \(e\) \{ return ''; \}/.test(pointer), 'a render error must not blank the page');
    });

    test('side matches keep their own renderer on Matches, with the pointer prepended', () => {
        assert.ok(/visibleIds\.sort/.test(sm), 'the side match loop must remain');
        assert.ok(/list\.innerHTML = roundGamesLine \+ html;/.test(sm), 'round games are named first, not merged in');
    });
});
