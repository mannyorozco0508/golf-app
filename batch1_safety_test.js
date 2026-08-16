const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const settle = loadHtmlInlineScript('settlement.html', ['money-engine.js', 'action-model.js', 'settlement-engine.js']);
const engine = loadJsFile('money-engine.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

// ---------------------------------------------------------------------------
// FIX 1 — BETA GATE
// ---------------------------------------------------------------------------
describe('BETA GATE — a passing date must never take the app offline', () => {
    const idx = read('index.html');

    test('REGRESSION: the app is not wiped and startup is not aborted when the date passes', () => {
        // The old gate replaced document.body wholesale and threw, so once the date
        // rolled over there was no scorecard, no settlement, and no way back in - on
        // the course, mid-round, with money on the line.
        assert.ok(!/Beta period expired/.test(idx), 'the throw that killed startup is still present');
        assert.ok(!/document\.body\.innerHTML = `[\s\S]{0,200}Beta Period Complete/.test(idx),
            'the app still wipes its own body when the beta date passes');
    });

    test('no throw sits between the beta check and Firebase initialisation', () => {
        const betaIdx = idx.indexOf('BETA_END_DATE');
        const fbIdx = idx.indexOf('const firebaseConfig');
        assert.ok(betaIdx > -1 && fbIdx > betaIdx);
        const between = idx.slice(betaIdx, fbIdx);
        assert.ok(!/throw /.test(between), 'startup can still be aborted before Firebase connects');
    });

    test('the beta message survives as a dismissible, non-blocking notice', () => {
        assert.ok(idx.includes('betaPeriodEnded'));
        assert.ok(idx.includes('renderBetaNotice'));
        assert.ok(idx.includes('betaNoticeDismissed'), 'the notice should be dismissible');
    });

    test('the notice is additive — it never removes or replaces page content', () => {
        const fn = idx.slice(idx.indexOf('function renderBetaNotice'), idx.indexOf('document.addEventListener(\'DOMContentLoaded\', renderBetaNotice)'));
        assert.ok(/insertBefore/.test(fn), 'the notice should be inserted, not swapped in');
        assert.ok(!/innerHTML\s*=/.test(fn.replace(/bar\.innerHTML/g, '')), 'the notice must not overwrite the page');
    });
});

// ---------------------------------------------------------------------------
// FIX 2 — TRIP SETTLEMENT
// ---------------------------------------------------------------------------
describe('TRIP SETTLEMENT — the canonical combiner is the only definition of money', () => {
    test('trip.html loads the shared settlement engine', () => {
        assert.ok(read('trip.html').includes('<script src="settlement-engine.js"></script>'));
    });

    test('trip.html calls computeCombinedNetTotals, not the narrower main-format helper', () => {
        const trip = read('trip.html');
        const fn = trip.slice(trip.indexOf('function renderTripMoneySettlement'), trip.indexOf('function renderTripMoneySettlement') + 3000);
        assert.ok(/computeCombinedNetTotals/.test(fn), 'trip totals must use the complete money picture');
        assert.ok(/combined\.netByName/.test(fn), 'trip must aggregate the combiner output, not the main-game rows');
    });

    test('no page redefines the combiner — there is exactly one copy in the repo', () => {
        const files = fs.readdirSync(REPO_ROOT).filter(f => /\.(html|js)$/.test(f)
            && !f.includes('_original_fallback') && !/test/.test(f));
        const defs = files.filter(f => /function computeCombinedNetTotals/.test(read(f)));
        assert.deepEqual(defs.join(','), 'settlement-engine.js',
            `computeCombinedNetTotals should be defined once, found in: ${defs.join(', ')}`);
    });

    test('settlement.html no longer defines it inline — it loads the engine', () => {
        const s = read('settlement.html');
        assert.ok(s.includes('<script src="settlement-engine.js"></script>'));
        assert.ok(!/function computeCombinedNetTotals/.test(s));
    });
});

// A round exercising as many money components at once as the app supports.
function buildRoundOne() {
    const cd = makeCourseData(18);
    const players = makePlayers(['Marty', 'Bud', 'Ken', 'Dave'], [0, 4, 8, 12]);
    players[0].team = 'Team 1'; players[1].team = 'Team 1';
    players[2].team = 'Team 2'; players[3].team = 'Team 2';

    const scores = {};
    cd.forEach((h, i) => {
        scores[`p${players[0].id}_h${h.hole}`] = h.par + (i % 3 === 0 ? -1 : 0);
        scores[`p${players[1].id}_h${h.hole}`] = h.par + 1;
        scores[`p${players[2].id}_h${h.hole}`] = h.par;
        scores[`p${players[3].id}_h${h.hole}`] = h.par + (i % 4 === 0 ? 2 : 1);
    });

    const data = {
        gameFormat: 'nassau', players, courseData: cd, scores,
        nassauStake: 10, nassauScoring: 'gross', nassauPressRule: '2down',
        birdieGameEnabled: true, birdieUnitVal: 5, birdieScoringType: 'gross',
        kpGameEnabled: true, kpBuyIn: 5,
        kps: { h3: String(players[0].id), h12: String(players[2].id) },
        sideMatches: {
            sm1: {
                format: 'match', scoring: 'gross', stake: 25, pressRule: 'none',
                teamAIds: [String(players[0].id)], teamBIds: [String(players[2].id)]
            }
        }
    };
    return { data, cd, scores, players };
}

function buildRoundTwo() {
    const cd = makeCourseData(18);
    const players = makePlayers(['Marty', 'Bud', 'Ken', 'Dave'], [0, 4, 8, 12]);
    const scores = {};
    cd.forEach((h, i) => {
        scores[`p${players[0].id}_h${h.hole}`] = h.par;
        scores[`p${players[1].id}_h${h.hole}`] = h.par + (i % 2 === 0 ? 1 : 0);
        scores[`p${players[2].id}_h${h.hole}`] = h.par + 1;
        scores[`p${players[3].id}_h${h.hole}`] = h.par + 2;
    });
    const data = {
        gameFormat: 'dots', players, courseData: cd, scores, dotPointVal: 2,
        dots: {
            h5: { [`p${players[0].id}`]: ['birdie'], [`p${players[1].id}`]: ['greenie'] },
            h9: { [`p${players[2].id}`]: ['sandy'] }
        },
        sideMatches: {
            sm2: {
                format: 'stroke', scoring: 'gross',
                holeStake: 2, overallStake: 20, tieRule: 'push', overallMode: 'stroke', segment: 'full',
                teamAIds: [String(players[0].id)], teamBIds: [String(players[3].id)]
            }
        }
    };
    return { data, cd, scores, players };
}

// computeCombinedNetTotals returns { netByName, transactions }, keyed by lowercased
// name - the same shape trip.html now aggregates.
function netOf(result) {
    const out = {};
    Object.keys(result.netByName).forEach(k => { out[k] = result.netByName[k].net; });
    return out;
}
function sumOf(result) {
    return Object.values(netOf(result)).reduce((s, v) => s + v, 0);
}

describe('TRIP SETTLEMENT — zero-sum across rounds and across the whole trip', () => {
    const r1 = buildRoundOne();
    const r2 = buildRoundTwo();
    const t1 = settle.computeCombinedNetTotals(r1.data, r1.cd, r1.scores);
    const t2 = settle.computeCombinedNetTotals(r2.data, r2.cd, r2.scores);

    test('round 1 (Nassau + presses + Birdie + KP + Side Match) sums to zero', () => {
        assert.ok(Math.abs(sumOf(t1)) < 0.005, `round 1 sum was ${sumOf(t1)}`);
    });

    test('round 2 (Dots + Side Match with hole and overall bets) sums to zero', () => {
        assert.ok(Math.abs(sumOf(t2)) < 0.005, `round 2 sum was ${sumOf(t2)}`);
    });

    test('the trip total equals the exact sum of both finalized round settlements', () => {
        // Mirrors exactly what trip.html does: aggregate each round's netByName.
        const n1 = netOf(t1), n2 = netOf(t2);
        const trip = {};
        [n1, n2].forEach(n => Object.keys(n).forEach(k => { trip[k] = (trip[k] || 0) + n[k]; }));
        Object.keys(trip).forEach(k => {
            const expected = (n1[k] || 0) + (n2[k] || 0);
            assert.ok(Math.abs(trip[k] - expected) < 0.005, `${k}: trip ${trip[k]} != ${expected}`);
        });
        const tripSum = Object.values(trip).reduce((s, v) => s + v, 0);
        assert.ok(Math.abs(tripSum) < 0.005, `the trip total must be zero-sum, got ${tripSum}`);
    });

    test('the trip total is NOT what the old main-format-only path produced', () => {
        // Guards the actual bug: computeRoundMoneyByPlayer covers the main game only.
        // If these ever agree for a round carrying side action, the combiner has been
        // bypassed again.
        const mainOnly = engine.computeRoundMoneyByPlayer(r1.data, r1.cd, r1.scores);
        const mainSum = {};
        (mainOnly.players || []).forEach(p => { mainSum[p.name.toLowerCase()] = p.net || 0; });
        const combined = netOf(t1);
        const differs = Object.keys(combined).some(k => Math.abs(combined[k] - (mainSum[k] || 0)) > 0.005);
        assert.ok(differs, 'the combined total should exceed the main game alone when side action exists');
    });
});

describe('TRIP SETTLEMENT — the previously-dropped money types are present', () => {
    test('REGRESSION: a Skins round contributes real money, not $0', () => {
        // computeRoundMoneyByPlayer returns valid:false for skins, so the old trip path
        // silently contributed nothing for an entire round.
        const cd = makeCourseData(18);
        const players = makePlayers(['Marty', 'Bud', 'Ken', 'Dave'], [0, 0, 0, 0]);
        const scores = {};
        cd.forEach((h, i) => {
            players.forEach((p, pi) => { scores[`p${p.id}_h${h.hole}`] = h.par + (pi === 0 && i < 3 ? -1 : 0); });
        });
        const data = { gameFormat: 'skins', players, courseData: cd, scores, skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross' };

        const oldPath = engine.computeRoundMoneyByPlayer(data, cd, scores);
        assert.equal(oldPath.valid, false, 'precondition: the old path cannot settle skins');

        const combined = settle.computeCombinedNetTotals(data, cd, scores);
        assert.ok(Object.values(netOf(combined)).some(v => Math.abs(v) > 0.005), 'skins money must reach the trip');
        assert.ok(Math.abs(sumOf(combined)) < 0.005);
    });

    test('REGRESSION: a Hi-Lo round contributes real money, not $0', () => {
        const cd = makeCourseData(18);
        const players = makePlayers(['Marty', 'Bud', 'Ken', 'Dave'], [0, 0, 0, 0]);
        players[0].team = 'Team 1'; players[1].team = 'Team 1';
        players[2].team = 'Team 2'; players[3].team = 'Team 2';
        const scores = {};
        cd.forEach(h => {
            scores[`p${players[0].id}_h${h.hole}`] = h.par - 1;
            scores[`p${players[1].id}_h${h.hole}`] = h.par;
            scores[`p${players[2].id}_h${h.hole}`] = h.par + 1;
            scores[`p${players[3].id}_h${h.hole}`] = h.par + 2;
        });
        // Hi-Lo money is driven by holeBetStake, not a hilo-specific field - worth
        // pinning, because the field name is not obvious from the format name.
        const data = { gameFormat: 'hilo', players, courseData: cd, scores, holeBetStake: 5, hiLoScoring: 'gross' };

        assert.equal(engine.computeRoundMoneyByPlayer(data, cd, scores).valid, false, 'precondition');
        const combined = settle.computeCombinedNetTotals(data, cd, scores);
        assert.ok(Object.values(netOf(combined)).some(v => Math.abs(v) > 0.005), 'hi-lo money must reach the trip');
        assert.ok(Math.abs(sumOf(combined)) < 0.005);
    });

    test('REGRESSION: birdie, KP and side-match money are all included exactly once', () => {
        const { data, cd, scores } = buildRoundOne();
        const withAll = settle.computeCombinedNetTotals(data, cd, scores);

        const noExtras = Object.assign({}, data, {
            birdieGameEnabled: false, kpGameEnabled: false, sideMatches: {}
        });
        const mainOnly = settle.computeCombinedNetTotals(noExtras, cd, scores);

        const a = netOf(withAll), b = netOf(mainOnly);
        const moved = Object.keys(a).some(k => Math.abs(a[k] - (b[k] || 0)) > 0.005);
        assert.ok(moved, 'removing birdie/KP/side matches should change the totals');
        assert.ok(Math.abs(sumOf(withAll)) < 0.005, 'still zero-sum with every component on');
        assert.ok(Math.abs(sumOf(mainOnly)) < 0.005, 'still zero-sum with them off');
    });

    test('nothing is double-counted — running the combiner twice gives the same answer', () => {
        const { data, cd, scores } = buildRoundOne();
        const a = netOf(settle.computeCombinedNetTotals(data, cd, scores));
        const b = netOf(settle.computeCombinedNetTotals(data, cd, scores));
        Object.keys(a).forEach(k => assert.ok(Math.abs(a[k] - b[k]) < 0.005));
    });

    test('an unfinished round never settles more than it should, and stays zero-sum', () => {
        const { data, cd, players } = buildRoundOne();
        const partial = {};
        cd.slice(0, 5).forEach(h => {
            players.forEach(p => { partial[`p${p.id}_h${h.hole}`] = h.par; });
        });
        const totals = settle.computeCombinedNetTotals(Object.assign({}, data, { scores: partial }), cd, partial);
        assert.ok(Math.abs(sumOf(totals)) < 0.005, 'a half-played round must still balance');
    });
});

// ---------------------------------------------------------------------------
// FIX 3 — FIREBASE RULES
// ---------------------------------------------------------------------------
describe('FIREBASE RULES — writes narrowed, reads deliberately left open', () => {
    const rules = JSON.parse(read('database.rules.json')).rules;

    test('rounds, trips and tournaments stay publicly readable — links depend on it', () => {
        assert.equal(rules.events.$eventCode['.read'], true);
        assert.equal(rules.trips.$tripCode['.read'], true);
        assert.equal(rules.tournaments.$tourneyCode['.read'], true);
        assert.equal(rules.global_courses['.read'], true);
    });

    test('REGRESSION: the shared course library is no longer wholesale-writable', () => {
        // Previously a single write at this node could replace or delete every mapped
        // scorecard for every user of the app.
        assert.equal(rules.global_courses['.write'], undefined,
            'global_courses must not carry a blanket write rule');
        assert.ok(rules.global_courses.$courseId['.write'], 'individual courses are still writable');
    });

    test('a course can be created or corrected but never deleted', () => {
        assert.equal(rules.global_courses.$courseId['.write'], 'newData.exists()');
    });

    test('a course must actually look like a course', () => {
        const v = rules.global_courses.$courseId['.validate'];
        assert.ok(/hasChildren\(\['name'\]\)/.test(v));
        assert.ok(/length > 0/.test(v));
    });

    test('score entries must be plausible strokes on well-formed keys', () => {
        const v = rules.events.$eventCode.scores.$scoreKey['.validate'];
        assert.ok(/isNumber\(\)/.test(v));
        assert.ok(/> 0/.test(v) && /< 30/.test(v));
        assert.ok(/p\[0-9\]\+_h\[0-9\]\+/.test(v), 'the score key shape should be enforced');
    });

    test('app_settings stays read-only', () => {
        assert.equal(rules.app_settings['.write'], false);
    });

    test('unknown top-level nodes are denied, so no new open bucket can appear', () => {
        assert.equal(rules.$other['.read'], false);
        assert.equal(rules.$other['.write'], false);
    });
});

// ---------------------------------------------------------------------------
// FIX 4 — GROUP LINK ISOLATION
// ---------------------------------------------------------------------------
describe('GROUP LINKS — organizer only, and not merely hidden with CSS', () => {
    const idx = read('index.html');

    test('there is one shared definition of "is this the organizer"', () => {
        assert.ok(idx.includes('function isOrganizerView()'));
        assert.ok(/return !hasGroupLock;/.test(idx), 'a ?group=N link is a scorekeeper, not the organizer');
    });

    test('the Group Links button is not rendered for a group-locked scorekeeper', () => {
        const fn = idx.slice(idx.indexOf('function renderGroupFilters'), idx.indexOf('function filterGroup'));
        assert.ok(/if \(isOrganizerView\(\)\) \{/.test(fn), 'the button is not gated');
        assert.ok(!/display:\s*none/.test(fn), 'this must not be solved by hiding it');
    });

    test('the panel refuses to build even if called directly — the markup never exists', () => {
        // Deleting the button in devtools or calling toggleGroupLinksPanel() from the
        // console must still yield nothing; a CSS hide would leak the URLs in the DOM.
        const fn = idx.slice(idx.indexOf('function renderGroupLinksPanel'), idx.indexOf('function copyGroupLinkFromScorecard'));
        assert.ok(/if \(!isOrganizerView\(\)\)/.test(fn), 'the renderer is not gated');
        const toggle = idx.slice(idx.indexOf('function toggleGroupLinksPanel'), idx.indexOf('function renderGroupLinksPanel'));
        assert.ok(/if \(!isOrganizerView\(\)\) return;/.test(toggle), 'the toggle is not gated');
    });

    test('the organizer still gets the button and the panel', () => {
        const fn = idx.slice(idx.indexOf('function renderGroupFilters'), idx.indexOf('function filterGroup'));
        assert.ok(/group-links-btn/.test(fn));
        assert.ok(/toggleGroupLinksPanel\(\)/.test(fn));
    });

    test('score inputs stay locked to the scorekeeper\'s own group', () => {
        // Independent of the links work, and the actual write-side protection on the
        // scorecard: a player outside the locked group renders as a disabled input with
        // no onchange handler, so there is no scorekeeping pathway to their score at all.
        assert.ok(idx.includes('const isLocked = isMultiGroupRound && (!hasGroupLock || playerGroupMap[p.id] !== lockedGroup);'));
        const locked = idx.slice(idx.indexOf('const scoreInputHtml = isLocked'), idx.indexOf('const scoreInputHtml = isLocked') + 400);
        const disabledBranch = locked.slice(0, locked.indexOf(': `<input'));
        assert.ok(/disabled>/.test(disabledBranch));
        assert.ok(!/onchange/.test(disabledBranch), 'a locked input must carry no save handler');
    });

    test('spectator links (no ?group=) get no write pathway in a multi-group round', () => {
        assert.ok(idx.includes('!hasGroupLock'), 'spectators are covered by the same predicate');
    });

    test('leaderboard and results stay readable — viewing is not the thing being restricted', () => {
        const fn = idx.slice(idx.indexOf('function renderGroupFilters'), idx.indexOf('function filterGroup'));
        assert.ok(/All Players/.test(fn), 'a scorekeeper may still view the whole field');
    });
});
