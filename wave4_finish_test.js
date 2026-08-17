const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const settle = loadHtmlInlineScript('settlement.html', ['money-engine.js', 'action-model.js', 'settlement-engine.js']);
const ZERO = 0.005;
const netOf = r => { const o = {}; Object.keys(r.netByName).forEach(k => o[k] = r.netByName[k].net); return o; };
const sumOf = r => Object.values(netOf(r)).reduce((s, v) => s + v, 0);

const PRODUCTION = ['admin.html', 'index.html', 'skins.html', 'settlement.html', 'stats.html',
    'trip.html', 'sidematches.html', 'leaderboard.html', 'instructions.html',
    'action-model.js', 'bet-strip.js', 'money-engine.js'];

// The representative stacked round.
function stacked(opts) {
    const o = opts || {};
    const cd = makeCourseData(18);
    const p = makePlayers(['Marty', 'John', 'Manny', 'Steve'], [2, 6, 10, 14]);
    p[0].team = 'Team 1'; p[1].team = 'Team 1';
    p[2].team = 'Team 2'; p[3].team = 'Team 2';
    const scores = {};
    cd.forEach((h, i) => p.forEach((pl, pi) => {
        if (o.missing && pi === 2 && h.hole === 12) return;
        scores[`p${pl.id}_h${h.hole}`] = h.par + (pi === 0 && i % 4 === 0 ? -1 : (pi === 3 ? 2 : pi === 2 ? 1 : 0));
    }));
    const data = {
        gameFormat: 'nassau', players: p, courseData: cd, scores,
        nassauStake: 20, nassauScoring: 'net', nassauPressRule: '2down',
        additionalGames: {
            skins: { enabled: true, skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross' },
            dots: { enabled: true, dotPointVal: 2, startHole: o.dotsStart || 1 }
        },
        dots: { h4: { [`p${p[0].id}`]: ['birdie'] }, h11: { [`p${p[1].id}`]: ['sandy'] } },
        birdieGameEnabled: true, birdieUnitVal: 5, birdieScoringType: 'gross',
        sideMatches: {
            sm1: {
                format: 'stroke', scoring: 'gross', overallStake: 50, holeStake: 0,
                tieRule: 'push', overallMode: 'stroke', segment: 'full',
                teamAIds: [String(p[0].id)], teamBIds: [String(p[1].id)]
            },
            sm2: {
                format: 'match', scoring: 'gross', stake: 25, pressRule: 'none',
                teamAIds: [String(p[2].id)], teamBIds: [String(p[3].id)]
            }
        }
    };
    if (o.legacyKP) {
        data.kpGameEnabled = true;
        data.kpBuyIn = 10;
        data.kpWinners = { h7: String(p[0].id) };
    }
    return { data, cd, scores, players: p };
}

// ---------------------------------------------------------------------------
describe('DOLLAR GAME — retired from the active product', () => {
    test('no page offers a way to turn it on', () => {
        assert.ok(!/enable-kpgame/.test(read('admin.html')), 'the setup toggle is still there');
        assert.ok(!/kpGameEnabled:/.test(read('admin.html')), 'admin still saves the flag');
    });

    test('no page offers a way to record a KP winner', () => {
        ['skins.html', 'index.html'].forEach(f => {
            assert.ok(!/markKPWinner|clearKPWinner|kpWinners\//.test(read(f)),
                `${f} can still write a KP winner`);
        });
    });

    test('the duplicate winner-picker is gone from both places it lived', () => {
        assert.ok(!/renderKPGame\b/.test(read('skins.html')));
        assert.ok(!/renderKPGameTally/.test(read('index.html')));
    });

    test('the scorecard no longer computes or shows KP', () => {
        const idx = read('index.html');
        assert.ok(!/function calculateKPGameTotals\b/.test(idx), 'the presenter engine is still present');
        assert.ok(!/kpgame-payout-container/.test(idx));
        assert.ok(!/showKP/.test(idx));
    });

    test('Results, Stats and print no longer show a KP section', () => {
        ['settlement.html', 'stats.html'].forEach(f =>
            assert.ok(!/Dollar Game \/ KPs/.test(read(f)), `${f} still renders a KP section`));
        assert.ok(!/Dollar Game \(KP\) ledger/.test(read('index.html')), 'the print ledger is still there');
    });

    test('the in-app guide no longer lists it as a supported game', () => {
        assert.ok(!/Dollar Game \(KPs\)/.test(read('instructions.html')));
    });

    test('it was actually removed, not just hidden behind CSS', () => {
        ['admin.html', 'skins.html', 'index.html'].forEach(f => {
            const s = read(f);
            assert.ok(!/kp-buyin|kpgame-card|kp-content/.test(s), `${f} still carries KP markup`);
        });
    });

    test('NO ORPHAN REFERENCES — the only KP code left is the documented legacy reader', () => {
        // Comments are stripped first: a note explaining WHY the feature is gone is
        // documentation, not an orphan reference.
        const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        const offenders = [];
        PRODUCTION.forEach(f => {
            if (/kpGameEnabled|kpWinners|kpBuyIn|calculateKPGameTotals/.test(stripComments(read(f)))) offenders.push(f);
        });
        assert.deepEqual(offenders.join(','), '',
            `active KP references remain in: ${offenders.join(', ')}`);
        // settlement-engine.js is intentionally excluded above and asserted below.
        assert.ok(/calculateKPGameTotalsForSettle/.test(read('settlement-engine.js')));
    });
});

describe('LEGACY KP DATA — history stays accurate, nothing new can be created', () => {
    test('the surviving reader is clearly marked as retired and legacy-only', () => {
        const se = read('settlement-engine.js');
        // The note sits directly above the declaration. indexOf finds the reference
        // inside the header comment first, so search from the actual declaration.
        const idx = se.indexOf('    function calculateKPGameTotalsForSettle(data, courseData) {');
        const note = se.slice(Math.max(0, idx - 1600), idx);
        assert.ok(/RETIRED FEATURE/.test(note), 'the compatibility path must be labelled');
        assert.ok(/Do not re-expose it in UI/.test(note));
        assert.ok(/silently rewrite/.test(note), 'the reason it survives must be stated');
    });

    test('REGRESSION: an old round that played KP still settles to its original money', () => {
        // Settlement is always recomputed from raw data - no final money is stored - so
        // deleting the engine would silently rewrite what a group actually settled on.
        const legacy = stacked({ legacyKP: true });
        const plain = stacked();
        const withKP = netOf(settle.computeCombinedNetTotals(legacy.data, legacy.cd, legacy.scores));
        const without = netOf(settle.computeCombinedNetTotals(plain.data, plain.cd, plain.scores));
        const moved = Object.keys(withKP).some(k => Math.abs(withKP[k] - (without[k] || 0)) > ZERO);
        assert.ok(moved, 'historical KP money must still be counted for an old round');
    });

    test('a legacy KP round is still zero-sum', () => {
        const { data, cd, scores } = stacked({ legacyKP: true });
        assert.ok(Math.abs(sumOf(settle.computeCombinedNetTotals(data, cd, scores))) < ZERO);
    });

    test('a round created TODAY has no KP flag, so it contributes nothing', () => {
        const { data, cd, scores } = stacked();
        assert.equal(data.kpGameEnabled, undefined);
        const kp = settle.calculateKPGameTotalsForSettle(data, cd);
        assert.deepEqual(Object.keys(kp.money).join(','), '', 'a new round must not reach the legacy path');
    });

    test('stray legacy kp fields never crash a page or produce NaN', () => {
        const { data, cd, scores } = stacked();
        [{ kpGameEnabled: true }, { kpWinners: { h7: 'nobody' } }, { kpBuyIn: 10 },
        { kpGameEnabled: true, kpBuyIn: 5, kpWinners: {} }].forEach(junk => {
            const d = Object.assign({}, data, junk);
            const r = settle.computeCombinedNetTotals(d, cd, scores);
            Object.values(r.netByName).forEach(v => assert.ok(!isNaN(v.net), 'NaN leaked from legacy data'));
            assert.ok(Math.abs(sumOf(r)) < ZERO, 'legacy junk broke zero-sum');
        });
    });

    test('a legacy KP round still contributes correctly to a Trip', () => {
        const a = stacked({ legacyKP: true });
        const b = stacked();
        const r1 = netOf(settle.computeCombinedNetTotals(a.data, a.cd, a.scores));
        const r2 = netOf(settle.computeCombinedNetTotals(b.data, b.cd, b.scores));
        const trip = {};
        [r1, r2].forEach(r => Object.keys(r).forEach(k => { trip[k] = (trip[k] || 0) + r[k]; }));
        assert.ok(Math.abs(Object.values(trip).reduce((s, v) => s + v, 0)) < ZERO);
    });
});

// ---------------------------------------------------------------------------
describe('FINISH ROUND — money first, from the canonical engine only', () => {
    function finish(opts) {
        const sb = loadHtmlInlineScript('index.html',
            ['action-model.js', 'money-engine.js', 'settlement-engine.js', 'bet-strip.js']);
        const { data } = stacked(opts);
        vm.runInContext(`currentData = ${JSON.stringify(data)};` +
            `window.__scFilteredPlayers = currentData.players;` +
            `renderIncompleteWarning(); renderFinishRoundMoney();`, sb);
        const txt = id => {
            const el = sb.document.getElementById(id);
            return el ? el.innerHTML.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
        };
        return {
            title: sb.document.getElementById('fr-money-title').textContent,
            warn: txt('fr-incomplete-warning'),
            money: txt('fr-final-money'),
            pays: txt('fr-who-pays-who')
        };
    }

    test('a completed round shows every player\'s final money without a single extra tap', () => {
        const out = finish();
        assert.equal(out.title, 'Final Money');
        ['Marty', 'John', 'Manny', 'Steve'].forEach(n =>
            assert.ok(out.money.includes(n), `${n} missing from final money`));
        assert.match(out.money, /\$\d/);
    });

    test('Who Pays Who is rendered right below it, also with no extra tap', () => {
        assert.match(finish().pays, /→/);
    });

    test('the money shown equals the canonical settlement exactly', () => {
        const { data, cd, scores } = stacked();
        const canonical = netOf(settle.computeCombinedNetTotals(data, cd, scores));
        const out = finish();
        // Settlement is whole dollars now, so the modal prints "$55" not "$55.00".
        Object.keys(canonical).forEach(k => {
            const name = k.charAt(0).toUpperCase() + k.slice(1);
            if (Math.abs(canonical[k]) > ZERO) {
                const amt = String(Math.abs(canonical[k]));
                assert.ok(out.money.includes(amt), `${name}'s $${amt} is not what the modal shows`);
            }
        });
    });

    test('Who Pays Who equals the canonical simplified debts', () => {
        const { data, cd, scores } = stacked();
        const tx = settle.computeCombinedNetTotals(data, cd, scores).transactions;
        const out = finish();
        tx.forEach(t => {
            assert.ok(out.pays.includes(t.from) && out.pays.includes(t.to));
            assert.ok(out.pays.includes(String(t.amount)), `$${t.amount} missing from Who Pays Who`);
        });
    });

    test('the modal defines NO money math of its own', () => {
        const idx = read('index.html');
        const fn = idx.slice(idx.indexOf('function renderFinishRoundMoney'), idx.indexOf('function findMissingScores'));
        assert.ok(/computeCombinedNetTotals/.test(fn), 'it must use the canonical engine');
        ['simplifyDebts(', 'calculateMatchEngine(', 'computeSkinsSettlementNet('].forEach(bad =>
            assert.ok(!fn.includes(bad), `${bad} must not be called directly from the modal`));
    });

    test('a round with no money says so plainly rather than showing an empty box', () => {
        const sb = loadHtmlInlineScript('index.html',
            ['action-model.js', 'money-engine.js', 'settlement-engine.js', 'bet-strip.js']);
        const cd = makeCourseData(18);
        const p = makePlayers(['A', 'B'], [0, 0]);
        const scores = {};
        cd.forEach(h => p.forEach(pl => { scores[`p${pl.id}_h${h.hole}`] = h.par; }));
        const data = { gameFormat: 'stroke', players: p, courseData: cd, scores };
        vm.runInContext(`currentData = ${JSON.stringify(data)}; window.__scFilteredPlayers = currentData.players; renderFinishRoundMoney();`, sb);
        assert.match(sb.document.getElementById('fr-final-money').innerHTML, /No money changed hands/);
    });

    test('the duplicate bet breakdown was removed in favour of the Receipt', () => {
        // It cloned the live status panel and the score list. The Receipt now carries the
        // full press timeline AND the scorecard, so this was a strictly worse copy of
        // both - and it made golfers wonder which screen held the real money.
        const idx = read('index.html');
        const code = idx.replace(/<!--[\s\S]*?-->/g, '')
            .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
        assert.ok(!/View Bet Breakdown/.test(code), 'the duplicate breakdown is back');
        assert.ok(!/fr-breakdown/.test(code), 'the panel itself must be gone');
        assert.ok(/Round Receipt/.test(code), 'the Receipt must be the detail route');
    });
});

describe('FINISH ROUND — money integrity', () => {
    test('the displayed totals sum to zero', () => {
        const { data, cd, scores } = stacked();
        assert.ok(Math.abs(sumOf(settle.computeCombinedNetTotals(data, cd, scores))) < ZERO);
    });

    test('Who Pays Who moves exactly what the ledger says', () => {
        const { data, cd, scores } = stacked();
        const r = settle.computeCombinedNetTotals(data, cd, scores);
        const paid = {};
        r.transactions.forEach(t => {
            paid[t.from] = (paid[t.from] || 0) - t.amount;
            paid[t.to] = (paid[t.to] || 0) + t.amount;
        });
        const byName = netOf(r);
        Object.keys(byName).forEach(k => {
            const name = r.netByName[k].name;
            assert.ok(Math.abs((paid[name] || 0) - byName[k]) < 0.02, `${name} does not reconcile`);
        });
    });

    test('presses, side matches and a mid-round game are all included exactly once', () => {
        const a = stacked();
        const b = stacked({ dotsStart: 9 });
        const withFull = netOf(settle.computeCombinedNetTotals(a.data, a.cd, a.scores));
        const withRanged = netOf(settle.computeCombinedNetTotals(b.data, b.cd, b.scores));
        assert.ok(Object.keys(withFull).some(k => Math.abs(withFull[k] - withRanged[k]) > ZERO),
            'the Wave 3 range must still change the result');
        assert.ok(Math.abs(Object.values(withRanged).reduce((s, v) => s + v, 0)) < ZERO);
    });

    test('removing KP did not disturb any other game', () => {
        const { data, cd, scores } = stacked();
        const noBirdie = Object.assign({}, data, { birdieGameEnabled: false });
        [data, noBirdie].forEach(d =>
            assert.ok(Math.abs(sumOf(settle.computeCombinedNetTotals(d, cd, scores))) < ZERO));
    });
});

// ---------------------------------------------------------------------------
describe('INCOMPLETE SCORES — no dead end, and no invented money', () => {
    function finish(opts) {
        const sb = loadHtmlInlineScript('index.html',
            ['action-model.js', 'money-engine.js', 'settlement-engine.js', 'bet-strip.js']);
        const { data } = stacked(opts);
        vm.runInContext(`currentData = ${JSON.stringify(data)};` +
            `window.__scFilteredPlayers = currentData.players;` +
            `renderIncompleteWarning(); renderFinishRoundMoney();`, sb);
        return {
            title: sb.document.getElementById('fr-money-title').textContent,
            warn: sb.document.getElementById('fr-incomplete-warning').innerHTML
        };
    }

    test('the missing score is named, with the hole and the golfer', () => {
        const out = finish({ missing: true });
        assert.match(out.warn, /1 score still missing/);
        assert.match(out.warn, /Hole 12/);
        assert.match(out.warn, /Manny/);
    });

    test('unsettled money is NEVER labelled final', () => {
        assert.equal(finish({ missing: true }).title, 'Money So Far \u2014 Not Final');
        assert.equal(finish().title, 'Final Money');
    });

    test('the warning explains that some wagers cannot be decided yet', () => {
        assert.match(finish({ missing: true }).warn, /not a final settlement/);
    });

    test('there is a direct route back to each missing score', () => {
        assert.match(finish({ missing: true }).warn, /jumpToMissingHole\(12\)/);
        const idx = read('index.html');
        const fn = idx.slice(idx.indexOf('function jumpToMissingHole'), idx.indexOf('function jumpToMissingHole') + 250);
        assert.ok(/currentViewedHole = hole/.test(fn), 'it must actually navigate to the hole');
    });

    test('REGRESSION: the last hole always offers an end-of-round action', () => {
        // One picked-up ball used to leave a group standing on 18 with a Next button
        // that led nowhere - at the exact moment they most wanted an answer.
        const idx = read('index.html');
        assert.ok(/const nextBtnHtml = isLastHole/.test(idx), 'Finish is still gated on a complete card');
        assert.ok(/Finish \\u2014 Check Scores|Finish — Check Scores/.test(idx),
            'an incomplete card needs its own wording');
    });

    test('no missing score is ever treated as a par, a zero, or anything else', () => {
        const idx = read('index.html');
        const fn = idx.slice(idx.indexOf('function findMissingScores'), idx.indexOf('function renderIncompleteWarning'));
        // It may only ever RECORD a gap. Substituting a par, a zero or a default would
        // fabricate a score and therefore fabricate money.
        assert.ok(/missing\.push/.test(fn));
        assert.ok(!/= h\.par|scores\[[^\]]+\] =/.test(fn), 'a missing score must never be written or defaulted');
    });

    test('a complete round shows no warning at all', () => {
        assert.equal(finish().warn, '');
    });
});

// ---------------------------------------------------------------------------
describe('EARLY-FINALIZED WAGERS — announced once, then out of the way', () => {
    const BS = (() => {
        const sb = loadJsFile('action-model.js');
        ['money-engine.js', 'bet-strip.js'].forEach(f => vm.runInContext(read(f), sb, { filename: f }));
        return sb;
    })();

    // Marty and John win every hole, so the Nassau front nine closes well before 9.
    function blowout() {
        const cd = makeCourseData(18);
        const p = makePlayers(['Marty', 'John', 'Manny', 'Steve'], [0, 0, 0, 0]);
        p[0].team = 'Team 1'; p[1].team = 'Team 1';
        p[2].team = 'Team 2'; p[3].team = 'Team 2';
        const scores = {};
        cd.slice(0, 8).forEach(h => p.forEach((pl, pi) => {
            scores[`p${pl.id}_h${h.hole}`] = h.par + (pi < 2 ? -1 : 1);
        }));
        return {
            cd, p, scores,
            data: {
                gameFormat: 'nassau', players: p, courseData: cd, scores,
                nassauStake: 20, nassauScoring: 'gross', nassauPressRule: 'none'
            }
        };
    }

    test('a wager that closes before hole 18 is reported as settled, not silently dropped', () => {
        const { data, cd, scores, p } = blowout();
        const settledRows = BS.buildSettledRows(data, cd, scores, p);
        assert.ok(settledRows.length > 0, 'the front nine closed and produced no settled row');
        assert.ok(settledRows.every(r => r.tone === 'final'));
    });

    test('a settled row keeps its result and its stake so it stays inspectable', () => {
        const { data, cd, scores, p } = blowout();
        const row = BS.buildSettledRows(data, cd, scores, p)[0];
        assert.ok(row.status.length > 0);
        assert.equal(row.stakeText, '$20');
    });

    test('a round with nothing finished yet produces no settled rows', () => {
        const { data, cd, p } = blowout();
        assert.equal(BS.buildSettledRows(data, cd, {}, p).length, 0);
    });

    test('the scorecard announces each finished wager exactly once', () => {
        const idx = read('index.html');
        assert.ok(/acknowledgedFinals/.test(idx));
        const fn = idx.slice(idx.indexOf('const flash = settled.filter'), idx.indexOf('const flash = settled.filter') + 300);
        assert.ok(/acknowledgedFinals\[r\.key\] = true/.test(fn), 'it would announce on every render');
    });

    test('the announcement state holds no money — a refresh cannot corrupt settlement', () => {
        const idx = read('index.html');
        const at = idx.indexOf('const acknowledgedFinals');
        const decl = idx.slice(Math.max(0, at - 400), at + 200);
        assert.ok(/in-memory only/.test(decl), 'this must be documented as display state');
        assert.ok(!/db\.ref[\s\S]{0,80}acknowledgedFinals/.test(idx), 'it must never be persisted');
    });

    test('settled wagers collapse into their own section rather than disappearing', () => {
        const idx = read('index.html');
        assert.ok(/Already Settled/.test(idx));
        assert.ok(/settled-wrap/.test(idx));
    });
});

// ---------------------------------------------------------------------------
describe('WAVE 2 / WAVE 3 BEHAVIOUR IS PRESERVED', () => {
    test('Today\'s Action still shows main, additional and side action', () => {
        const idx = read('index.html');
        ['Main Game', 'Also Playing', 'Side Action'].forEach(h => assert.ok(idx.includes(h)));
    });

    test('Add Action and its organizer gate survive', () => {
        const idx = read('index.html');
        assert.ok(/\+ ADD ACTION/.test(idx));
        const fn = idx.slice(idx.indexOf('function canAddAction'), idx.indexOf('function addActionStartHole'));
        assert.ok(/isOrganizerView\(\)/.test(fn));
    });

    test('mid-round ranges still settle correctly', () => {
        const { data, cd, scores } = stacked({ dotsStart: 9 });
        assert.ok(Math.abs(sumOf(settle.computeCombinedNetTotals(data, cd, scores))) < ZERO);
    });

    test('REGRESSION: the scorecard loads EVERY engine settlement-engine.js depends on', () => {
        // settlement-engine.js calls computeRoundMoneyByPlayer and simplifyDebts, and
        // index.html carries inline copies of neither. Without money-engine.js the modal
        // threw on every round and told the golfer to check another tab. Asserted as a
        // dependency ORDER so the graph, not just the presence of a tag, is protected.
        const idx = read('index.html');
        ['money-engine.js', 'action-model.js', 'settlement-engine.js'].forEach(f =>
            assert.ok(idx.includes(`<script src="${f}"></script>`), `${f} is not loaded`));
        const tagAt = f => idx.indexOf(`<script src="${f}"></script>`);
        assert.ok(tagAt('money-engine.js') < tagAt('settlement-engine.js'),
            'money-engine.js must load first');
        assert.ok(tagAt('action-model.js') < tagAt('settlement-engine.js'));
    });

    test('REGRESSION: the scorecard\'s match engine returns the canonical shape', () => {
        // index.html declares its own calculateMatchEngine, which SHADOWS the one in
        // money-engine.js. Omitting t1Players/t2Players crashed computeRoundMoneyByPlayer
        // outright the first time the scorecard asked for settlement.
        const idx = read('index.html');
        assert.ok(/return \{ t1Name, t2Name, t1Players, t2Players, activeMatches/.test(idx),
            'the shadowing copy must match the canonical return shape');
    });
});
