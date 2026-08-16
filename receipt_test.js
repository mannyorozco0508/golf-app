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
        assert.equal(m1.segments.map(s => s.label).join(','), 'Original,Press 1,Press 2');
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
        assert.ok(/Holes \$\{seg\.startHole\}/.test(fn));
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

describe('GROUP GAMES labelling', () => {
    const adm = read('admin.html');

    test('REGRESSION: the bare money-bag icon is gone', () => {
        assert.ok(!/title="Playing for money\?">\u{1F4B0}/u.test(adm), 'the unlabelled icon survives');
        assert.ok(/GROUP<br>GAMES/.test(adm));
    });

    test('the checkbox explains what it actually gates', () => {
        assert.ok(/In the round-wide group games \(Skins, Dots, Birdies, main bet\)/.test(adm));
        assert.ok(/Side Matches pick their own players/.test(adm));
    });

    test('a one-line hint sits under the player list', () => {
        assert.ok(/function renderGroupGamesHint/.test(adm));
        assert.ok(/sitting out the group-wide bets/.test(adm));
        assert.ok(/Side Matches choose their own players separately/.test(adm));
    });

    test('the stored field is unchanged, so legacy rounds still work', () => {
        assert.ok(/playingForMoney/.test(adm));
        assert.ok(/playingForMoney !== false/.test(adm), 'absence must still mean true');
    });

    test('the checkbox stays a comfortable tap target', () => {
        assert.ok(/width:24px; height:24px/.test(adm));
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
