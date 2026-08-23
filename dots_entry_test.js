// ============================================================================
// DOTS / JUNK — SCORECARD ENTRY
//
// The engine, the storage and the settlement for Dots were all correct. What was
// missing was a way to record one: the "+ Add Dots" control was gated on
// gameFormat === 'dots', so a Dots game created through Action - which lives in
// additionalGameInstances - never drew a button anywhere on the scorecard.
//
// These tests drive the real render functions through the live DOM harness, so a
// control that stops appearing fails here rather than on a golf course.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const J = JSON.stringify;
const CD = makeCourseData(18);
const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

const ENG = (() => {
    const sb = loadJsFile('money-engine.js');
    ['action-model.js', 'settlement-engine.js', 'bet-strip.js'].forEach(f =>
        vm.runInContext(read(f), sb, { filename: f }));
    return sb;
})();
const call = c => { vm.runInContext(`window.__r = (function(){ ${c} })();`, ENG); return ENG.window.__r; };

function field(n) {
    const names = ['Marty', 'Manny', 'John', 'Steve', 'Stan', 'Greg', 'Tony', 'James'];
    const hcps = ['8', '4', '15', '0', '6', '12', '20', '1'];
    const P = makePlayers(names.slice(0, n), hcps.slice(0, n));
    P.forEach((p, i) => { p.playingForMoney = true; p.group = i < 4 ? 1 : 2; });
    const S = {};
    CD.forEach(h => P.forEach(p => { S[`p${p.id}_h${h.hole}`] = h.par; }));
    return { P, S, id: k => String(P[k].id) };
}

// Loads index.html with a live DOM and the given round data, then renders Hole View.
function scorecard(data, hole) {
    const sb = loadHtmlInlineScript('index.html',
        ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js',
            'bet-strip.js', 'hole-events.js']);
    vm.runInContext(`
        currentData = ${J(data)};
        currentViewedHole = ${hole};
        document.__mount(document.getElementById('hole-view-card'));
        document.__mount(document.getElementById('scorecard-body'));
        renderScorecard();          // builds the table Hole View reads from
        renderHoleView();
        window.__hv = document.getElementById('hole-view-card').innerHTML;
        window.__rows = document.querySelectorAll('.hv-player-row').length;
    `, sb);
    return { sb, html: sb.window.__hv, rows: sb.window.__rows };
}

const dotsRound = (extra) => {
    const { P, S, id } = field(4);
    return Object.assign({
        gameFormat: 'stroke', players: P, courseData: CD, scores: S,
        additionalGameInstances: {
            d: { format: 'dots', enabled: true, startHole: 1, createdAt: 1, dotPointVal: 5 }
        }
    }, extra || {}, { players: P, courseData: CD, scores: S, __P: P, __id: id });
};

// ---------------------------------------------------------------------------
describe('THE BUG — the entry control must appear for an ACTION-created Dots game', () => {
    test('an Action-created Dots game shows + DOT in Hole View', () => {
        const d = dotsRound();
        const { html } = scorecard(d, 3);
        assert.match(html, /hv-dots-btn/, 'the control must render');
        assert.match(html, /\+ DOT/, 'and say what it does');
        assert.match(html, /openDotsModal\(3\)/, 'wired to the existing modal, for this hole');
    });

    test('a LEGACY main-format Dots round still shows it', () => {
        const { P, S } = field(4);
        const { html } = scorecard({ gameFormat: 'dots', dotPointVal: 5, players: P, courseData: CD, scores: S }, 3);
        assert.match(html, /hv-dots-btn/);
        assert.match(html, /openDotsModal\(3\)/);
    });

    test('a round with NO Dots game shows nothing', () => {
        const { P, S } = field(4);
        const { html } = scorecard({ gameFormat: 'stroke', players: P, courseData: CD, scores: S }, 3);
        assert.ok(!/hv-dots-btn/.test(html), 'no Dots game means no Dots control');
        assert.ok(!/openDotsModal/.test(html));
    });

    test('a DISABLED Dots instance shows nothing', () => {
        const d = dotsRound();
        d.additionalGameInstances.d.enabled = false;
        assert.ok(!/hv-dots-btn/.test(scorecard(d, 3).html));
    });

    test('detection asks the canonical normalizer, not gameFormat', () => {
        const src = read('index.html');
        const fn = src.slice(src.indexOf('function activeDotsGame'), src.indexOf('const DOT_TYPES'));
        assert.ok(/getRoundGames\(currentData\)/.test(fn), 'must use the shared model');
        assert.ok(/g\.format === 'dots'/.test(fn));
        assert.ok(!/additionalGameInstances\[/.test(fn), 'no hand-rolled storage decoding');
    });
});

// ---------------------------------------------------------------------------
describe('CONFIRMATION — the golfer must see the tap landed', () => {
    // HARNESS LIMITATION, stated plainly: the per-golfer dot line renders inside the
    // Hole View player rows, which renderHoleView() builds by reading CELLS out of the
    // scorecard table. renderScorecard() writes that table with innerHTML, and the
    // mini-DOM stores innerHTML as a string without parsing it into nodes - a limit
    // documented in helpers/mini-dom.js. So the rows have no cells here and the line
    // cannot be asserted through a real render.
    //
    // What IS verified through real rendering below: the control appears, is wired to
    // the right hole, and its COUNT reflects exactly the stored dots - which exercises
    // the same currentData.dots lookup the per-player line uses. The line's markup is
    // pinned by source assertion, and flagged for the real-device pass.
    test('the per-golfer line is generated from the same stored data', () => {
        const src = read('index.html');
        // The whole Hole View dots section: the lookup, the per-row line, and the button.
        const start = src.indexOf('const dotsGame = activeDotsGame();');
        const fn = src.slice(start, src.indexOf("html += '<div id=\"whoami-mount\"></div>'", start));
        assert.ok(/currentData\.dots\[`h\$\{holeNum\}`\]/.test(fn), 'reads this hole only');
        assert.ok(/hv-dot-line/.test(fn));
        assert.ok(/if \(mine\.length\)/.test(fn), 'a golfer with no dots renders nothing');
        assert.ok(/mine\.map\(dotLabel\)\.join/.test(fn), 'multiple dots read as a list');
    });

    test('the button counts the dots on this hole', () => {
        const d = dotsRound();
        d.dots = { h3: { [`p${d.__id(0)}`]: ['birdie', 'sandy'], [`p${d.__id(2)}`]: ['greenie'] } };
        const { html } = scorecard(d, 3);
        assert.match(html, /Dots \(3\)/, 'two golfers, three dots');
        assert.match(html, /has-dots/, 'and the button reads as filled');
    });

    test('dots from another hole do not leak into this one', () => {
        const d = dotsRound();
        d.dots = { h5: { [`p${d.__id(0)}`]: ['birdie'] } };
        const { html } = scorecard(d, 3);
        assert.ok(!/hv-dot-line/.test(html), 'hole 3 has no dots');
        assert.match(html, /\+ DOT/, 'and the button reads empty');
    });

    test('editing to remove one dot updates the control immediately', () => {
        const d = dotsRound();
        d.dots = { h3: { [`p${d.__id(0)}`]: ['birdie', 'sandy'] } };
        assert.match(scorecard(d, 3).html, /Dots \(2\)/);
        // Exactly what reopening the modal, deselecting Sandy and saving produces.
        d.dots = { h3: { [`p${d.__id(0)}`]: ['birdie'] } };
        assert.match(scorecard(d, 3).html, /Dots \(1\)/, 'the removal must show at once');
    });
});

// ---------------------------------------------------------------------------
describe('THE DOTS MODAL — reused, not rebuilt', () => {
    test('the categories are unchanged', () => {
        const src = read('index.html');
        const block = src.slice(src.indexOf('const DOT_TYPES'), src.indexOf('const DOT_TYPES') + 500);
        ['greenie', 'sandy', 'barkie', 'polie', 'birdie', 'eagle', 'snake']
            .forEach(t => assert.ok(block.includes(`'${t}'`), `${t} must remain`));
    });

    test('there is still exactly ONE dots entry system', () => {
        const src = read('index.html');
        assert.equal((src.match(/function openDotsModal/g) || []).length, 1);
        assert.equal((src.match(/function saveDots/g) || []).length, 1);
    });

    test('DOUBLE TAP cannot duplicate a dot — the modal toggles by index', () => {
        const sb = loadHtmlInlineScript('index.html',
            ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js',
                'bet-strip.js', 'hole-events.js']);
        vm.runInContext(`
            // Real signature: toggleDot(chipElement, playerId, dotId)
            var chip = document.createElement('button');
            tempDots = {};
            toggleDot(chip, '101', 'birdie');
            toggleDot(chip, '101', 'birdie');   // second tap removes
            window.__a = JSON.stringify(tempDots['p101'] || []);
            toggleDot(chip, '101', 'birdie');
            toggleDot(chip, '101', 'birdie');
            toggleDot(chip, '101', 'birdie');   // odd number of taps -> present once
            window.__b = JSON.stringify(tempDots['p101'] || []);
        `, sb);
        assert.equal(sb.window.__a, '[]', 'tapping twice toggles off');
        assert.equal(sb.window.__b, '["birdie"]', 'and never stores it twice');
    });

    test('saveDots writes to the existing per-hole path', () => {
        const src = read('index.html');
        const fn = src.slice(src.indexOf('function saveDots'), src.indexOf('function endAndClearRound'));
        assert.ok(/dots\/h\$\{currentDotHole\}/.test(fn), 'storage format is unchanged');
        assert.ok(/canWritePlayer/.test(fn), 'cross-group protection intact');
    });
});

// ---------------------------------------------------------------------------
describe('FULL CARD — review and correction still work', () => {
    test('the Full Card column appears for an Action-created Dots game', () => {
        const src = read('index.html');
        assert.ok(/const hasDotsGame = !!activeDotsGame\(\);/.test(src));
        assert.ok(/\|\| hasDotsGame;/.test(src), 'the column gate must include it');
        assert.ok(/if \(hasDotsGame\) \{/.test(src), 'and so must the per-hole cell');
    });

    test('the cell builder no longer keys off the main format', () => {
        const src = read('index.html');
        const fn = src.slice(src.indexOf('function buildMatchBetsCell'), src.indexOf('function buildPressSummaryText') + 1);
        assert.ok(!/o\.gameFormat === 'dots'/.test(fn), 'that gate is what hid the button');
    });

    test('the Full Card cell still renders a working control', () => {
        const sb = loadHtmlInlineScript('index.html',
            ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js',
                'bet-strip.js', 'hole-events.js']);
        vm.runInContext(`window.__c = buildMatchBetsCell({
            gameFormat: 'stroke', hole: 7, dots: { count: 2, allowed: true } });`, sb);
        assert.match(sb.window.__c, /openDotsModal\(7\)/);
        assert.match(sb.window.__c, /Dots \(2\)/);
    });

    test('a locked-out scorekeeper gets a disabled control, not a broken one', () => {
        const sb = loadHtmlInlineScript('index.html',
            ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js',
                'bet-strip.js', 'hole-events.js']);
        vm.runInContext(`window.__c = buildMatchBetsCell({
            gameFormat: 'stroke', hole: 7, dots: { count: 0, allowed: false } });`, sb);
        assert.match(sb.window.__c, /disabled/);
        assert.ok(!/onclick/.test(sb.window.__c), 'a disabled control must not stay tappable');
    });
});

// ---------------------------------------------------------------------------
describe('MULTI-GROUP AND PERSISTENCE', () => {
    test('an 8-player 2-group round still shows the control', () => {
        const { P, S } = field(8);
        const d = {
            gameFormat: 'stroke', players: P, courseData: CD, scores: S,
            additionalGameInstances: { d: { format: 'dots', enabled: true, startHole: 1, dotPointVal: 5 } }
        };
        const sb = loadHtmlInlineScript('index.html',
            ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js',
                'bet-strip.js', 'hole-events.js']);
        // A group-locked scorekeeper may write.
        vm.runInContext(`
            currentData = ${J(d)}; currentViewedHole = 3; hasGroupLock = true;
            window.__scFilteredPlayers = currentData.players.slice(0, 4);
            document.__mount(document.getElementById('hole-view-card'));
            renderHoleView();
            window.__hv = document.getElementById('hole-view-card').innerHTML;`, sb);
        assert.match(sb.window.__hv, /hv-dots-btn/);
        assert.ok(!/disabled/.test(sb.window.__hv), 'a locked scorekeeper can record');
    });

    test('a bare link on a multi-group round cannot record', () => {
        const { P, S } = field(8);
        const d = {
            gameFormat: 'stroke', players: P, courseData: CD, scores: S,
            additionalGameInstances: { d: { format: 'dots', enabled: true, startHole: 1, dotPointVal: 5 } }
        };
        const sb = loadHtmlInlineScript('index.html',
            ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js',
                'bet-strip.js', 'hole-events.js']);
        vm.runInContext(`
            currentData = ${J(d)}; currentViewedHole = 3; hasGroupLock = false;
            window.__scFilteredPlayers = currentData.players;
            document.__mount(document.getElementById('hole-view-card'));
            renderHoleView();
            window.__hv = document.getElementById('hole-view-card').innerHTML;`, sb);
        assert.match(sb.window.__hv, /disabled/);
    });

    test('PERSISTENCE: re-rendering from stored data shows the dots again', () => {
        const d = dotsRound();
        d.dots = { h3: { [`p${d.__id(0)}`]: ['birdie'] } };
        // Two independent renders, as navigating away and back would produce.
        assert.match(scorecard(d, 3).html, /Dots \(1\)/);
        assert.match(scorecard(d, 3).html, /Dots \(1\)/);
    });

    test('SCORE CORRECTION does not erase a manually entered dot', () => {
        const d = dotsRound();
        d.dots = { h3: { [`p${d.__id(0)}`]: ['birdie'] } };
        d.scores[`p${d.__id(0)}_h3`] = CD[2].par + 4;   // correct the gross score
        assert.match(scorecard(d, 3).html, /Dots \(1\)/,
            'manual junk is independent of gross score');
        // And the money still counts it.
        const units = call(`return calcDotsEngine(${J(d)}, ${J(CD)}, ${J(d.scores)}).totals;`);
        assert.equal(units[d.__id(0)], 1, 'the dot must still be worth a unit');
    });
});

// ---------------------------------------------------------------------------
describe('MONEY — unchanged, and still reconciling', () => {
    const { P, S, id } = field(4);
    const dots = { h5: { [`p${id(0)}`]: ['birdie', 'sandy'] }, h9: { [`p${id(2)}`]: ['greenie'] } };
    const data = {
        gameFormat: 'stroke', players: P, courseData: CD, scores: S, dots,
        additionalGameInstances: { d: { format: 'dots', enabled: true, startHole: 1, dotPointVal: 5 } }
    };

    test('settlement is zero-sum', () => {
        const out = call(`
            var o = computeCombinedNetTotals(${J(data)}, ${J(CD)}, ${J(S)});
            var n = {}; Object.keys(o.netByName).forEach(function(k){ n[o.netByName[k].name] = o.netByName[k].net; });
            var owed = 0; o.transactions.forEach(function(t){ owed += t.amount; });
            var won = 0; Object.keys(n).forEach(function(k){ if (n[k] > 0) won += n[k]; });
            return { net: n, owed: owed, won: won };`);
        assert.equal(Object.values(out.net).reduce((a, b) => a + b, 0), 0);
        assert.equal(out.owed, out.won, 'Who Pays Who must reconcile');
    });

    test('START HOLE scoping still applies to the money', () => {
        const mid = JSON.parse(J(data));
        mid.additionalGameInstances.d.startHole = 7;   // h5 dots fall outside
        const a = call(`return computeGameNetByPlayerId(getRoundGames(${J(data)}).find(function(g){ return g.format === 'dots'; }), ${J(CD)}, ${J(S)});`);
        const b = call(`return computeGameNetByPlayerId(getRoundGames(${J(mid)}).find(function(g){ return g.format === 'dots'; }), ${J(CD)}, ${J(S)});`);
        assert.notEqual(J(a), J(b), 'a later start hole must drop earlier dots');
    });

    test('LIVE ACTION reports the dots without new money code', () => {
        const rows = call(`return buildActionRows(${J(data)}, ${J(CD)}, ${J(S)}, ${J(P)}, null)
            .filter(function(r){ return r.key === 'd'; }).map(function(r){ return r.label + ': ' + r.status; });`);
        assert.equal(rows.length, 1);
        assert.match(rows[0], /Dots/);
    });

    test('the money engine was NOT touched', () => {
        const me = read('money-engine.js');
        assert.ok(/function calcDotsEngine/.test(me));
        assert.ok(/dotVal \* \(n \* units - totalUnits\)/.test(me), 'the dots formula is unchanged');
        assert.ok(!/activeDotsGame|hv-dots-btn/.test(me), 'no UI leaked into the engine');
    });
});

// ---------------------------------------------------------------------------
// The UI must never promise a field the maths does not settle. That rule has not
// changed; what changed is the maths. Phase 1 scoped Dots settlement to
// participantIds, and Group Action now writes them - so the honest wording is no
// longer "field-wide", it is "this group".
describe('DOTS STATES ITS ACTUAL FIELD', () => {
    const sm = read('sidematches.html');

    test('no participant picker is offered for Dots', () => {
        // Still true, and still deliberate: a group Dots game IS the whole foursome,
        // so there is nothing to tick. Skins is the participant-scoped one.
        const fn = sm.slice(sm.indexOf('function onSideMatchFormatChange'), sm.indexOf('function renderFieldActionForm'));
        assert.ok(/\(format === 'skins'\) \? 'block' : 'none'/.test(fn),
            'the participant picker is Skins-only');
    });

    test('the setup names the group whose dots game it is', () => {
        assert.ok(/Group \$\{actionOwnerGroup\}\\u2019s dots game/.test(sm),
            'a multi-group round must say which group the dots game belongs to');
        assert.ok(/don\\u2019t count and cost nothing here/.test(sm),
            'and must say plainly that other groups\' dots do not count');
    });

    test('a one-group round still says everyone plays', () => {
        // Nothing changed for Marty Monday: one foursome IS the field.
        assert.ok(/Everyone playing/.test(sm));
        assert.ok(/everyone playing/.test(sm), 'and the format list says it too');
    });

    test('the amount is named per DOT, not as a buy-in', () => {
        assert.ok(/\$ per dot/.test(sm), 'calling it a buy-in would misstate the money');
    });

    test('the ENGINE now honours participantIds — but the UI still creates field-wide Dots', () => {
        // THIS TEST WAS INVERTED IN PHASE 1, DELIBERATELY.
        //
        // It used to assert that participantIds had NO effect on Dots money, and it
        // carried a tripwire: "if this ever differs, Dots became scoped and the
        // field-wide wording must change." Phase 1 scoped the maths at the
        // orchestration layer, so the tripwire fired exactly as designed.
        //
        // The wording above is still HONEST, which is why those tests are untouched:
        // saveFieldAction writes only dotPointVal for Dots and never participantIds,
        // and no participant picker is rendered for it. So every Dots game a golfer
        // can actually create today still plays across the whole field.
        //
        // What changed is that the engine is now READY for a scoped Dots game. The
        // picker that would create one is Phase 3 work, and the "everyone plays"
        // copy must be revisited in the same batch that ships it.
        const { P, S, id } = field(4);
        const dots = { h5: { [`p${id(0)}`]: ['birdie'] } };
        const mk = parts => {
            const cfg = { format: 'dots', enabled: true, startHole: 1, dotPointVal: 5 };
            if (parts) cfg.participantIds = parts;
            return { gameFormat: 'stroke', players: P, courseData: CD, scores: S, dots, additionalGameInstances: { d: cfg } };
        };
        const wide = call(`return computeGameNetByPlayerId(getRoundGames(${J(mk(null))}).find(function(g){ return g.format === 'dots'; }), ${J(CD)}, ${J(S)});`);
        const scoped = call(`return computeGameNetByPlayerId(getRoundGames(${J(mk([id(0), id(1)]))}).find(function(g){ return g.format === 'dots'; }), ${J(CD)}, ${J(S)});`);

        // Unscoped is unchanged: all four golfers, exactly as before Phase 1.
        assert.equal(Object.keys(wide).length, 4, 'an unscoped Dots game must still be field-wide');

        // Scoped now genuinely narrows the pot to the two named golfers.
        assert.equal(Object.keys(scoped).length, 2, 'participantIds must now scope Dots money');
        assert.notEqual(J(wide), J(scoped), 'scoping must change the money, or the fix did nothing');

        // Both remain zero-sum.
        assert.equal(Object.values(wide).reduce((a, b) => a + b, 0), 0);
        assert.equal(Object.values(scoped).reduce((a, b) => a + b, 0), 0);
    });

    test('Dots now writes participantIds on a multi-group round, and the copy changed with it', () => {
        // THIS TEST WAS INVERTED IN THE GROUP ACTION BATCH, DELIBERATELY.
        //
        // Its previous form asserted Dots wrote NO participantIds, carrying the
        // tripwire "if Dots ever starts writing participantIds, the field-wide
        // wording must change with it." Group Action made that happen, and the
        // wording above changed in the same batch - which is exactly what the
        // tripwire was for.
        const fn = sm.slice(sm.indexOf('function saveFieldAction'), sm.indexOf('let pendingDeleteMatchId'));
        const elseBranch = fn.slice(fn.indexOf('} else {'));
        assert.ok(/entry\.dotPointVal = stake;/.test(elseBranch));
        assert.ok(/entry\.participantIds = groupIds;/.test(elseBranch),
            'a group dots game must name its field');
        assert.ok(/if \(isMultiGroupRound\(\)\)/.test(elseBranch),
            'and must record nothing on a one-group round, keeping those rounds identical');
    });
});
