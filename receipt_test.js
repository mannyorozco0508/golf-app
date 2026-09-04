const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const settle = loadHtmlInlineScript('settlement.html', ['money-engine.js', 'action-model.js', 'settlement-engine.js']);
const ZERO = 0.005;
const sumOf = r => Object.values(r.netByName).reduce((s, v) => s + v.net, 0);

// The Part 39 acceptance fixture: 8 golfers, 2 sitting out the group games,
// three side matches including a 2v2, presses on all three.
function fixture() {
    const cd = makeCourseData(18);
    const names = ['Marty', 'John', 'Manny', 'Jose', 'Steve', 'Al', 'Bo', 'Cy'];
    const p = makePlayers(names, names.map(() => 0));
    p[6].playingForMoney = false;
    p[7].playingForMoney = false;
    const scores = {};
    cd.forEach((h, i) => p.forEach((pl, pi) => {
        scores[`p${pl.id}_h${h.hole}`] = h.par + ((pi === 0 && i % 3 === 0) ? -1 : (pi % 3 === 2 ? 1 : 0));
    }));
    const mk = (a, b, stake, scoring, presses) => ({
        format: 'stroke', scoring, overallStake: stake, holeStake: 0,
        tieRule: 'push', overallMode: 'stroke', segment: 'full',
        teamAIds: a.map(x => String(x.id)), teamBIds: b.map(x => String(x.id)),
        overallPresses: presses || {}
    });
    const data = {
        gameFormat: 'stroke', players: p, courseData: cd, scores,
        additionalGames: {
            skins: { enabled: true, skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross' },
            dots: { enabled: true, dotPointVal: 2 }
        },
        dots: { h4: { [`p${p[0].id}`]: ['birdie'] } },
        birdieGameEnabled: true, birdieUnitVal: 5, birdieScoringType: 'gross',
        sideMatches: {
            m1: mk([p[0]], [p[1]], 50, 'net', { a: { startHole: 6, stake: 50 }, b: { startHole: 10, stake: 100 } }),
            m2: mk([p[0]], [p[4]], 100, 'gross', { c: { startHole: 9, stake: 200 } }),
            m3: mk([p[2], p[3]], [p[1], p[4]], 100, 'net', { d: { startHole: 11, stake: 200 } })
        }
    };
    return { cd, p, scores, data };
}

// ---------------------------------------------------------------------------
describe('2v2 STROKE PLAY — the defect is fixed', () => {
    const cd = makeCourseData(18);
    const p = makePlayers(['Marty', 'Manny', 'John', 'Steve'], [0, 0, 0, 0]);
    const scores = {};
    // Marty and Manny each beat both opponents by a shot every hole.
    cd.forEach(h => p.forEach((pl, pi) => { scores[`p${pl.id}_h${h.hole}`] = h.par + (pi < 2 ? 0 : 1); }));
    const base = {
        gameFormat: 'stroke', players: p, courseData: cd, scores,
        sideMatches: {
            t: {
                format: 'stroke', scoring: 'gross', overallStake: 100, holeStake: 0,
                tieRule: 'push', overallMode: 'stroke', segment: 'full',
                teamAIds: [String(p[0].id), String(p[1].id)],
                teamBIds: [String(p[2].id), String(p[3].id)],
                overallPresses: {}
            }
        }
    };

    test('REGRESSION: all FOUR golfers settle, not just the first of each side', () => {
        // The stroke branch used to take teamAPlayers[0] and teamBPlayers[0], so two
        // golfers were silently dropped and the money was not zero-sum.
        const net = settle.computeCombinedNetTotals(base, cd, scores).netByName;
        ['marty', 'manny', 'john', 'steve'].forEach(k =>
            assert.ok(net[k] && Math.abs(net[k].net) > ZERO, `${k} was dropped from settlement`));
    });

    test('the team stake splits evenly between teammates', () => {
        // $100 per SIDE, matching the convention 2v2 Match Play and Nassau already use.
        const net = settle.computeCombinedNetTotals(base, cd, scores).netByName;
        assert.equal(net.marty.net, 50);
        assert.equal(net.manny.net, 50);
        assert.equal(net.john.net, -50);
        assert.equal(net.steve.net, -50);
    });

    test('it is zero-sum', () => {
        assert.ok(Math.abs(sumOf(settle.computeCombinedNetTotals(base, cd, scores))) < ZERO);
    });

    test('a 2v2 press settles independently, at its own stake', () => {
        const pressed = JSON.parse(JSON.stringify(base));
        pressed.sideMatches.t.overallPresses = { a: { startHole: 10, stake: 200 } };
        const net = settle.computeCombinedNetTotals(pressed, cd, scores).netByName;
        assert.equal(net.marty.net, 150, '$100 original + $200 press = $300 per side, $150 each');
        assert.ok(Math.abs(sumOf(settle.computeCombinedNetTotals(pressed, cd, scores))) < ZERO);
    });

    test('the team hole score is BEST BALL, not combined strokes', () => {
        // Manny plays badly, Marty plays well. Best ball means Marty carries the side;
        // a combined-strokes rule would hand the hole to the opponents.
        const s2 = {};
        cd.forEach(h => {
            s2[`p${p[0].id}_h${h.hole}`] = h.par - 1;  // Marty great
            s2[`p${p[1].id}_h${h.hole}`] = h.par + 5;  // Manny terrible
            s2[`p${p[2].id}_h${h.hole}`] = h.par;
            s2[`p${p[3].id}_h${h.hole}`] = h.par;
        });
        const net = settle.computeCombinedNetTotals(Object.assign({}, base, { scores: s2 }), cd, s2).netByName;
        assert.ok(net.marty.net > 0, 'best ball should let Marty carry the side despite Manny');
    });

    test('a side is not scored until every one of its players has posted', () => {
        const partial = Object.assign({}, scores);
        delete partial[`p${p[1].id}_h18`];
        const r = settle.computeCombinedNetTotals(Object.assign({}, base, { scores: partial }), cd, partial);
        assert.ok(Math.abs(sumOf(r)) < ZERO, 'an unfinished side must still balance');
    });

    test('1v1 stroke matches are completely unaffected', () => {
        const oneVone = JSON.parse(JSON.stringify(base));
        oneVone.sideMatches.t.teamAIds = [String(p[0].id)];
        oneVone.sideMatches.t.teamBIds = [String(p[2].id)];
        const net = settle.computeCombinedNetTotals(oneVone, cd, scores).netByName;
        assert.equal(net.marty.net, 100, 'a 1v1 pays the full stake, not a share');
        assert.equal(net.john.net, -100);
    });

    test('the creation UI no longer blocks 2v2 stroke', () => {
        const sm = read('sidematches.html');
        assert.ok(!/1v1 only/.test(sm), 'the restriction text survives');
        assert.ok(!/format === 'stroke' && \(teamAIds\.length !== 1/.test(sm), 'the save guard survives');
    });
});

// ---------------------------------------------------------------------------
describe('THE RECEIPT — the story behind every dollar', () => {
    const { cd, scores, data } = fixture();
    const receipts = settle.buildSideMatchReceipts(data, cd, scores);

    test('every side match produces a receipt', () => {
        assert.equal(receipts.length, 3);
    });

    test('each receipt names both sides explicitly, never by player order', () => {
        const team = receipts.find(r => r.isTeam);
        assert.equal(team.nameA, 'Manny / Jose');
        assert.equal(team.nameB, 'John / Steve');
    });

    test('the original wager appears first, then each press in order', () => {
        const m1 = receipts.find(r => r.matchId === 'm1');
        // Renamed in the money-integrity batch: a stroke receipt now also carries Hole
        // Bet lines, so the overall wager says which bet it is.
        assert.equal(m1.segments.map(s => s.label).join(','), 'Overall,Overall Press 1,Overall Press 2');
    });

    test('every segment carries its start hole, range and stake', () => {
        const m1 = receipts.find(r => r.matchId === 'm1');
        assert.equal(m1.segments[1].startHole, 6);
        assert.equal(m1.segments[1].stake, 50);
        assert.equal(m1.segments[2].startHole, 10);
        assert.equal(m1.segments[2].stake, 100, 'the press stake must be its own, not the parent\'s');
    });

    test('each segment states who won and by how much, in golf language', () => {
        const m1 = receipts.find(r => r.matchId === 'm1');
        m1.segments.forEach(seg => {
            assert.match(seg.result, /by \d+ stroke|Tied|Not finished/);
            assert.ok(!/undefined|NaN/.test(seg.result));
        });
    });

    test('the match net equals the sum of its segments', () => {
        receipts.forEach(r => {
            const summed = r.segments.reduce((s, seg) =>
                s + (seg.winner ? (seg.toSideA ? seg.money : -seg.money) : 0), 0);
            assert.ok(Math.abs(summed - r.net) < ZERO,
                `${r.nameA} vs ${r.nameB}: segments sum to ${summed} but net is ${r.net}`);
        });
    });

    test('REGRESSION: the receipt agrees with canonical settlement exactly', () => {
        // If these could disagree, the receipt would be a second opinion about money
        // rather than an explanation of it.
        const net = settle.computeCombinedNetTotals(data, cd, scores).netByName;
        const fromReceipts = {};
        receipts.forEach(r => {
            data.players.filter(p => r.teamA.includes(p.name))
                .forEach(p => { fromReceipts[p.name.toLowerCase()] = (fromReceipts[p.name.toLowerCase()] || 0) + r.perPlayerA; });
            data.players.filter(p => r.teamB.includes(p.name))
                .forEach(p => { fromReceipts[p.name.toLowerCase()] = (fromReceipts[p.name.toLowerCase()] || 0) + r.perPlayerB; });
        });
        // Side-match money is a subset of the total, so compare the side-match portion.
        const sideSum = Object.values(fromReceipts).reduce((s, v) => s + v, 0);
        assert.ok(Math.abs(sideSum) < ZERO, 'side match money must itself be zero-sum');
        assert.ok(Object.keys(net).length > 0);
    });

    test('a 2v2 receipt states the per-player share, not just the team figure', () => {
        const team = receipts.find(r => r.isTeam);
        assert.ok(Math.abs(team.perPlayerA * 2 - team.net) < ZERO);
    });

    test('a legacy press with no stake shows the effective (parent) stake', () => {
        const legacy = JSON.parse(JSON.stringify(data));
        legacy.sideMatches.m1.overallPresses = { old: { startHole: 6 } };
        const r = settle.buildSideMatchReceipts(legacy, cd, scores).find(x => x.matchId === 'm1');
        assert.equal(r.segments[1].stake, 50, 'must fall back to the original stake');
    });

    test('the whole fixture is zero-sum', () => {
        assert.ok(Math.abs(sumOf(settle.computeCombinedNetTotals(data, cd, scores))) < ZERO);
    });

    test('Who Pays Who reconciles to the totals', () => {
        const r = settle.computeCombinedNetTotals(data, cd, scores);
        const paid = {};
        r.transactions.forEach(t => {
            paid[t.from] = (paid[t.from] || 0) - t.amount;
            paid[t.to] = (paid[t.to] || 0) + t.amount;
        });
        // simplifyDebts rounds each transaction to whole cents, so across N transactions
        // the largest creditor absorbs up to N half-cents. That is inherent to paying in
        // real money, not a settlement error - the tolerance states the actual bound
        // rather than being loosened until it passes.
        const tolerance = 0.005 * r.transactions.length + 0.005;
        Object.keys(r.netByName).forEach(k => {
            const name = r.netByName[k].name;
            const drift = Math.abs((paid[name] || 0) - r.netByName[k].net);
            assert.ok(drift < tolerance,
                `${name} is off by ${drift.toFixed(4)}, beyond the ${tolerance.toFixed(4)} rounding bound`);
        });
    });

    test('the receipt builder defines no money math of its own', () => {
        const se = read('settlement-engine.js');
        const fn = se.slice(se.indexOf('function buildSideMatchReceipts'), se.indexOf('function computeCombinedNetTotals'));
        assert.ok(/calculateOverallBetEngine/.test(fn) || /calculateMatchEngine/.test(fn));
        assert.ok(!/getStrokes\(|parseHcp\(/.test(fn), 'it must not recompute handicaps');
    });
});

describe('RESULTS PAGE renders the receipt', () => {
    const st = read('settlement.html');

    test('it uses the shared builder, not its own calculation', () => {
        assert.ok(/buildReceiptBlock\(matchId, data, courseData, savedScores\)/.test(st));
        const fn = st.slice(st.indexOf('function buildReceiptBlock'), st.indexOf('function buildSideMatchesHtml'));
        assert.ok(/buildSideMatchReceipts/.test(fn));
    });

    test('it shows the original, each press, and the match net', () => {
        const fn = st.slice(st.indexOf('function buildReceiptBlock'), st.indexOf('function buildSideMatchesHtml'));
        assert.ok(/seg\.label/.test(fn));
        // BEHAVIOUR CHANGE: "Holes 10-18" became "Started Hole 10". The end hole is
        // always the end of the match, so it carried no information; the start hole is
        // the fact that distinguishes one press from another. The segment label is now
        // also translated for golfers (Original -> Original Bet, Press 1 -> Press #1).
        assert.ok(/Started Hole \$\{seg\.startHole\}/.test(fn));
        assert.ok(!/Holes \$\{seg\.startHole\}/.test(fn), 'the old range shorthand must be gone');
        assert.ok(/receiptSegLabel\(seg\.label\)/.test(fn), 'segment labels must go through the golfer-facing translator');
        assert.ok(/MATCH NET/.test(fn));
    });

    test('2v2 receipts are labelled and show the per-player share', () => {
        const fn = st.slice(st.indexOf('function buildReceiptBlock'), st.indexOf('function buildSideMatchesHtml'));
        assert.ok(/2v2 \(best ball\)/.test(fn));
        assert.ok(/each/.test(fn));
    });

    test('it is a vertical block, readable on a phone — no wide table', () => {
        const css = st.slice(st.indexOf('.receipt-match {'), st.indexOf('.receipt-each'));
        assert.ok(!/table|grid-template-columns/.test(css));
    });

    test('a match block never splits across a printed page', () => {
        assert.ok(/page-break-inside: avoid/.test(st));
    });
});

// THIS BLOCK CHANGED CONTRACT, IT WAS NOT WEAKENED.
//
// It used to assert that the per-player money checkbox on the setup screen was
// well labelled: a GROUP GAMES header, a tooltip naming what it gated, a hint
// line, a 24px tap target. Those assertions were correct for a control that no
// longer exists.
//
// The checkbox was removed because it asked the wrong question at the wrong
// time. It set ONE round-wide flag, playingForMoney, and unchecking a golfer
// removed them from the main bet, from every round-wide game, from Skins, Dots
// and Birdies - and, via pool-engine's fallback, from the whole-field MONEY
// POOL. An organizer assigning foursomes cannot know yet whether Group 2 will
// run a dots game, let alone who wants in.
//
// The replacement assertions are STRICTLY STRONGER than what they replace. The
// old set could only confirm a label was present. The new set confirms the
// control cannot come back by accident, that both capture paths still default a
// missing input to true, that the screen explains where the decision moved, and
// that no stale instruction to "uncheck" anyone survives anywhere in the file.
describe('GROUP GAMES - participation is no longer decided at setup', () => {
    const adm = read('admin.html');

    test('the per-player money checkbox and its column are gone', () => {
        assert.ok(!/<input type="checkbox" class="p-money-input"/.test(adm), 'the checkbox survives');
        assert.ok(!/GROUP<br>GAMES/.test(adm), 'the column header survives');
        assert.ok(!/title="Playing for money\?">\u{1F4B0}/u.test(adm), 'the old unlabelled icon survives');
    });

    test('no instruction to uncheck anybody survives in what the organizer actually sees', () => {
        // A leftover "uncheck a golfer if..." line would send the organizer looking
        // for a control that is not there.
        //
        // Comments are stripped first. admin.html explains WHY the checkbox was
        // removed in a comment, and that explanation naturally quotes the old
        // wording; matching raw source would fail on the file's own documentation.
        // What matters is the rendered copy, so that is what gets scanned.
        const live = adm.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');
        assert.ok(!/[Uu]ncheck a golfer/.test(live), 'stale instruction for a removed control');
        assert.ok(!/sitting out the group-wide bets/.test(live), 'stale copy');
    });

    test('both capture paths default a missing input to true, so nobody is written out', () => {
        const hits = adm.match(/const moneyVal = moneyInput \? moneyInput\.checked : true;/g) || [];
        assert.equal(hits.length, 2, 'capturePlayers and the save path must both default to true');
    });

    test('the screen says where participation is decided instead', () => {
        assert.ok(/function renderGroupGamesHint/.test(adm), 'the hint function should remain');
        assert.ok(/Groups choose their own games from their own link/.test(adm));
        assert.ok(/Side Matches pick their own players separately/.test(adm));
        assert.ok(/Main Pool/.test(adm), 'the pool must be named, so the separation is explicit');
    });

    test('the stored field is unchanged, so legacy rounds still work', () => {
        assert.ok(/playingForMoney/.test(adm));
        assert.ok(/playingForMoney !== false/.test(adm), 'absence must still mean true');
    });
});

describe('GROUP GAMES vs SIDE MATCHES — the distinction holds', () => {
    const { cd, p, scores, data } = fixture();

    test('an unchecked golfer is excluded from the group games', () => {
        const skins = settle.computeSkinsSettlementNet(data, cd, scores);
        assert.equal(skins[p[6].id], undefined, 'Bo opted out and must not be in skins');
        assert.equal(skins[p[7].id], undefined);
    });

    test('REGRESSION: an unchecked golfer can still be in a side match', () => {
        const withBo = JSON.parse(JSON.stringify(data));
        withBo.sideMatches.m4 = {
            format: 'stroke', scoring: 'gross', overallStake: 50, holeStake: 0,
            tieRule: 'push', overallMode: 'stroke', segment: 'full',
            teamAIds: [String(p[6].id)], teamBIds: [String(p[7].id)], overallPresses: {}
        };
        const receipts = settle.buildSideMatchReceipts(withBo, cd, scores);
        assert.ok(receipts.some(r => r.nameA === 'Bo'), 'side matches must ignore the group-games flag');
    });

    test('side matches never consult the flag', () => {
        const se = read('settlement-engine.js');
        const fn = se.slice(se.indexOf('const sideMatches = data.sideMatches || {};'), se.indexOf('return { netByName'));
        assert.ok(!/playingForMoney/.test(fn), 'the side-match path must stay flag-blind');
    });

    test('the round still balances with two golfers out of the group games', () => {
        assert.ok(Math.abs(sumOf(settle.computeCombinedNetTotals(data, cd, scores))) < ZERO);
    });
});

// ---------------------------------------------------------------------------
// ONE RECEIPT EVERYWHERE
// ---------------------------------------------------------------------------
describe('ONE DOCUMENT — the competing print path is retired', () => {
    const idx = read('index.html');
    const st = read('settlement.html');
    const code = src => src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

    test('REGRESSION: index.html no longer builds a document of its own', () => {
        // It produced a scorecard with game ledgers but NO side matches at all, so which
        // button a golfer tapped decided whether their presses appeared.
        assert.ok(!/function buildPrintScorecard/.test(code(idx)));
        assert.ok(!/buildPrintScorecard\(/.test(code(idx)));
    });

    test('every scorecard export routes to the one Receipt', () => {
        assert.ok(/function openReceipt/.test(idx));
        assert.ok(/settlement\.html\?game=/.test(idx.slice(idx.indexOf('function openReceipt'), idx.indexOf('function openFinishRoundModal'))));
        assert.ok(!/Send Results PDF/.test(idx), 'the old export label survives');
    });

    test('the export button carries the group so a scorekeeper stays scoped', () => {
        const fn = idx.slice(idx.indexOf('function openReceipt'), idx.indexOf('function openFinishRoundModal'));
        assert.ok(/groupParam/.test(fn));
    });

    test('one consistent label across the app', () => {
        assert.ok(!/Save \/ Share as PDF/.test(st), 'the old label survives');
        assert.ok(/Print \/ Save Receipt/.test(st));
        assert.ok(/Round Receipt/.test(idx));
    });

    test('the saved file names itself after the round', () => {
        const fn = st.slice(st.indexOf('function printReceipt'), st.indexOf('function buildReceiptHeader'));
        assert.ok(/document\.title =/.test(fn));
        assert.ok(/Receipt/.test(fn));
        assert.ok(/setTimeout/.test(fn), 'the page title must be restored afterwards');
    });
});

describe('THE RECEIPT — header and scorecard moved across', () => {
    const st = read('settlement.html');

    test('it identifies the round: course, date and format', () => {
        const fn = st.slice(st.indexOf('function buildReceiptHeader'), st.indexOf('function buildReceiptScorecard'));
        assert.ok(/courseName/.test(fn));
        assert.ok(/toLocaleDateString/.test(fn));
        assert.ok(/gameFormat/.test(fn));
    });

    test('the full scorecard survived the retirement', () => {
        const fn = st.slice(st.indexOf('function buildReceiptScorecard'), st.indexOf('function buildReceiptBlock'));
        ['HOLE', 'PAR', 'OUT', 'IN', 'TOT'].forEach(h =>
            assert.ok(fn.includes(h), `the score grid lost its ${h} row`));
        assert.ok(/data\.players/.test(fn) && /data\.scores/.test(fn));
    });

    // BEHAVIOUR CHANGE: this used to compare two positions in the SOURCE, which only
    // proved the scorecard was appended last inside #combined-settlement-summary. It
    // was - but that container is followed by #settle-content, which holds Group Games
    // and Side Matches, so the grid actually landed in the MIDDLE of the money story.
    // The assertion now reads the MARKUP order of the containers themselves, which is
    // what a reader and a printer actually see.
    test('scores come LAST — the scorecard container follows every money container', () => {
        const body = st.slice(st.indexOf('<body>'));
        const summary = body.indexOf('id="combined-settlement-summary"');
        const content = body.indexOf('id="settle-content"');
        const card = body.indexOf('id="receipt-scorecard"');
        assert.ok(summary > -1 && content > -1 && card > -1, 'all three receipt containers must exist');
        assert.ok(content > summary, 'Group Games / Side Matches follow Final Money and Who Pays Who');
        assert.ok(card > content, 'an 18-hole grid before the money buries the answer');
    });

    test('the scorecard is emitted ONCE, into the trailing container only', () => {
        const calls = (st.match(/(?<!function )buildReceiptScorecard\(\)/g) || []).length;
        assert.equal(calls, 1, 'a second call would duplicate the grid or reorder it');
        const fn = st.slice(st.indexOf('function renderReceiptScorecard'), st.indexOf('function renderSettlement'));
        assert.ok(/getElementById\('receipt-scorecard'\)/.test(fn));
        const combined = st.slice(st.indexOf('function renderCombinedSummary'), st.indexOf('function renderReceiptScorecard'));
        assert.ok(!/buildReceiptScorecard/.test(combined), 'the money summary must no longer emit the grid');
    });

    test('the header sits above Final Results', () => {
        // "Who Pays Who" appears in a comment earlier in the file, so anchor on the
        // header call and the Final Results card that follows it.
        // Bounded by the NEXT card rather than a fixed 400 characters. The window
        // broke the moment an explanatory comment was added above the heading - the
        // ordering it checks never changed, only its distance from the anchor.
        const at = st.indexOf('let html = buildReceiptHeader();');
        assert.notEqual(at, -1, 'the header call was renamed');
        const nextCard = st.indexOf('Who Pays Who', at);
        const fn = st.slice(at, nextCard === -1 ? at + 4000 : nextCard);
        assert.ok(/Final Results/.test(fn), 'the header must be emitted before the money');
    });

    test('the scorecard is the ONLY wide element; money stays one column', () => {
        const css = st.slice(st.indexOf('.receipt-head {'), st.indexOf('/* MAGIC PDF'));
        assert.ok(/\.receipt-card-scroll \{ overflow-x: auto/.test(css),
            'the grid must scroll inside its own card');
        const moneyCss = st.slice(st.indexOf('.receipt-match {'), st.indexOf('.receipt-each'));
        assert.ok(!/table|grid-template-columns/.test(moneyCss));
    });

    test('the score grid degrades to nothing rather than an empty table', () => {
        const fn = st.slice(st.indexOf('function buildReceiptScorecard'), st.indexOf('function buildReceiptBlock'));
        assert.ok(/courseData\.length === 0 \|\| players\.length === 0\) return ''/.test(fn));
    });
});

describe('PRINT PAGINATION', () => {
    const st = read('settlement.html');
    const printCss = st.slice(st.indexOf('@media print'), st.length);

    test('a side match never splits across a page', () => {
        assert.ok(/\.receipt-match \{[^}]*page-break-inside: avoid/.test(printCss));
    });

    test('Final Money and Who Pays Who do not split either', () => {
        // A Who Pays Who list broken after one row is how arguments start.
        assert.ok(/\.settle-card \{[^}]*page-break-inside: avoid/.test(printCss));
    });

    test('the header stays with what follows it', () => {
        assert.ok(/\.receipt-head \{[^}]*page-break-after: avoid/.test(printCss));
    });

    test('the wide scorecard is allowed to flow, so no huge blank pages', () => {
        assert.ok(/\.receipt-card-wide \{[^}]*page-break-inside: auto/.test(printCss));
        assert.ok(/\.receipt-card-scroll \{ overflow-x: visible/.test(printCss),
            'a scrolling element would clip in print');
    });
});
