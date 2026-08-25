// ============================================================================
// FINISH ROUND — WAVE A
//
// TWO DEFECTS, ONE OF WHICH TOOK THE SCREEN DOWN.
//
// 1. DEAD MOUNTS. openFinishRoundModal() wrote to fr-full-results and
//    fr-player-list. Both had been removed from the markup when the Receipt took
//    over the press timeline and the scorecard; the writes to them were not. In a
//    browser getElementById returns null, .innerHTML throws, and every statement
//    after it - including the display='flex' that actually shows the modal - never
//    runs. Confirmed on-device: Finish Round did not open.
//
//    The whole suite missed this. helpers/load-script.js returns a distinct
//    PERSISTENT element for ANY id, by design, so that tests can pre-set values a
//    production function then reads. The cost is that a MISSING node is invisible:
//    calling openFinishRoundModal() in the harness reports success while the real
//    page throws. So the first test below does not use the DOM at all - it parses
//    the markup and the function source as text and checks that every id written
//    to is actually present. That is the only kind of assertion that could have
//    caught this.
//
// 2. FABRICATED TOTALS. The modal computed its own gross and net:
//
//        if (v > 0) gross += parseInt(v, 10);        // guarded
//        strokesOff += getStrokes(h.hcpIndex, ...);  // NOT guarded
//
//    Gross counted the holes played; the handicap deducted all eighteen. A golfer
//    who walked in after seventeen holes rendered as "Gross 96 / Net 83" on the
//    screen an organizer uses to check scores before paying people, with nothing
//    saying the card was short.
//
// Both are fixed by consuming computePlayerRoundTotals() from settlement-engine.js,
// which guards the stroke accrual and returns net === null unless the round is
// complete.
//
// SCOPE NOTE: the mount check here is deliberately limited to
// openFinishRoundModal(). A whole-app dead-mount audit is its own batch.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const PAGE = 'index.html';
const DEPS = ['action-model.js','money-engine.js','pool-engine.js','settlement-engine.js',
              'score-marks.js','bet-strip.js','hole-events.js'];
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

const PAR = [4,5,4,4,4,3,4,3,4, 4,3,4,4,4,4,3,5,4];
const IDX = [15,13,1,3,11,5,9,17,7, 12,6,2,16,8,14,18,4,10];
const NAMES = ['Avery','Blake','Casey','Devon','Ellis','Finley',
               'Gray','Harper','Indigo','Jordan','Kendall','Logan'];

// 12 golfers, 3 groups of 4. `short` maps a name to how many holes they posted.
function boot({ short = {}, hcps = null, n = 12 } = {}) {
    const sb = loadHtmlInlineScript(PAGE, DEPS);
    const cd = PAR.map((p,i) => ({ hole:i+1, par:p, hcpIndex:IDX[i] }));
    const ps = NAMES.slice(0,n).map((name,i) => ({
        id: 101+i, name, hcp: String(hcps ? hcps[i] : 9), playingForMoney: true }));
    const groupOf = id => Math.floor((Number(id)-101)/4)+1;
    const sc = {};
    ps.forEach((p,pi) => cd.forEach((h,hi) => {
        const cap = short[p.name];
        if (cap !== undefined && h.hole > cap) return;
        sc['p'+p.id+'_h'+h.hole] = h.par + ((pi+hi) % 3) - 1;
    }));
    const gm = {}; ps.forEach(p => { gm[String(p.id)] = groupOf(p.id); });

    vm.runInContext(`
        currentMode = 'ABCD';
        currentData = ${JSON.stringify({ players: ps, courseData: cd, scores: sc, gameFormat: 'stroke' })};
        window.__scPlayerGroupMap = ${JSON.stringify(gm)};
        // A GROUP LINK context on purpose: review must still show the whole field.
        window.__scFilteredPlayers = currentData.players.slice(0, 4);
        hasGroupLock = true; lockedGroup = 1;
    `, sb);

    return {
        sb, ps, cd, sc,
        render: () => vm.runInContext('renderFinishRoundReview();', sb),
        html: () => sb.document.getElementById('fr-player-list').innerHTML,
        run: c => vm.runInContext(c, sb),
    };
}
const strip = h => h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');

// ============================================================================

describe('THE MOUNTS THE MODAL WRITES TO MUST EXIST', () => {

    // Text-level, not DOM-level. The harness cannot see a missing node.
    function modalSource() {
        const src = read(PAGE);
        const start = src.indexOf('function openFinishRoundModal');
        assert.notEqual(start, -1, 'openFinishRoundModal was renamed or removed');
        const end = src.indexOf('\n    function ', start + 10);
        return src.slice(start, end === -1 ? src.length : end);
    }
    const markupIds = () => new Set([...read(PAGE).matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));

    test('every getElementById target in openFinishRoundModal is present in the markup', () => {
        const ids = markupIds();
        const written = [...modalSource().matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]);
        assert.ok(written.length >= 3, 'expected the modal to address several elements');
        const missing = [...new Set(written)].filter(id => !ids.has(id));
        assert.deepEqual(missing, [],
            'openFinishRoundModal writes to elements that do not exist. In a browser '
            + 'getElementById returns null and .innerHTML throws, so the modal never opens: '
            + missing.join(', '));
    });

    test('the review renderer writes only to elements that exist', () => {
        const src = read(PAGE);
        const start = src.indexOf('function renderFinishRoundReview');
        assert.notEqual(start, -1);
        const fn = src.slice(start, src.indexOf('\n    function ', start + 10));
        const ids = markupIds();
        [...fn.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]).forEach(id => {
            assert.ok(ids.has(id), `renderFinishRoundReview writes to a missing element: ${id}`);
        });
    });

    test('the dead fr-full-results write is gone, and the element stays deleted', () => {
        // The Receipt replaced that panel deliberately; it is the WRITE that was
        // left behind, not the markup that should come back.
        const src = read(PAGE);
        assert.ok(!/getElementById\('fr-full-results'\)/.test(src),
            'the write to the removed fr-full-results panel must not return');
    });

    test('the modal reaches the line that actually shows it', () => {
        const src = read(PAGE);
        const start = src.indexOf('function openFinishRoundModal');
        const fn = src.slice(start, src.indexOf('\n    function ', start + 10));
        const showAt = fn.indexOf("getElementById('finish-round-modal-overlay').style.display = 'flex'");
        assert.notEqual(showAt, -1, 'the modal must still be shown');
        const ids = new Set([...read(PAGE).matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
        [...fn.slice(0, showAt).matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)]
            .map(m => m[1]).forEach(id => {
                assert.ok(ids.has(id),
                    `${id} is addressed before display='flex'; if it is null the modal never opens`);
            });
    });
});

describe('COMPLETE GOLFERS GET CORRECT TOTALS', () => {

    test('an 18-hole card shows gross and net', () => {
        const b = boot(); b.render();
        const t = strip(b.html());
        assert.match(t, /Avery/);
        assert.match(t, /Net \d+/);
        assert.ok(!/Avery Incomplete/.test(t));
    });

    test('the canonical helper agrees with a hand calculation', () => {
        const b = boot({ hcps: NAMES.map(() => 9) });
        const p = b.ps[0];
        const t = b.run(`computePlayerRoundTotals(currentData.players[0], currentData.courseData, currentData.scores)`);
        let gross = 0, strokes = 0;
        b.cd.forEach(h => {
            const v = b.sc['p'+p.id+'_h'+h.hole];
            if (v && v > 0) { gross += v; strokes += (h.hcpIndex <= 9 ? 1 : 0); }
        });
        assert.equal(t.complete, true);
        assert.equal(t.gross, gross);
        assert.equal(t.net, gross - strokes);
        assert.equal(t.holesPlayed, 18);
    });

    test('the rendered net matches the canonical net exactly', () => {
        const b = boot(); b.render();
        const t = b.run(`computePlayerRoundTotals(currentData.players[0], currentData.courseData, currentData.scores)`);
        assert.match(strip(b.html()), new RegExp('Avery ' + t.gross + ' Net ' + t.net));
    });
});

describe('INCOMPLETE GOLFERS ARE NEVER SHOWN AS FINISHED', () => {

    test('a 17-hole card is labelled incomplete, with the count', () => {
        const b = boot({ short: { Logan: 17 } }); b.render();
        const t = strip(b.html());
        assert.match(t, /Logan Incomplete \u2014 17 of 18 holes posted/);
    });

    test('an incomplete golfer is given no net at all', () => {
        const b = boot({ short: { Logan: 17 } });
        const t = b.run(`computePlayerRoundTotals(
            currentData.players.find(function (p) { return p.name === 'Logan'; }),
            currentData.courseData, currentData.scores)`);
        assert.equal(t.complete, false);
        assert.equal(t.holesPlayed, 17);
        assert.equal(t.net, null, 'a partial net is not a smaller answer, it is a wrong one');
        assert.equal(t.gross, null, 'and there is no final gross either');
        assert.ok(t.grossSoFar > 0, 'what WAS played is still reported, honestly labelled');
    });

    test('THE ROCCO CASE: 17 holes off 13 must not render as a finished round', () => {
        // The exact shape that reached the screen: seventeen holes posted, a full
        // eighteen holes of handicap deducted, presented as a completed round.
        const sb = loadHtmlInlineScript(PAGE, DEPS);
        const cd = PAR.map((p,i) => ({ hole:i+1, par:p, hcpIndex:IDX[i] }));
        const g = [5,8,5,5,4,3,6,3,8, 5,6,5,5,5,6,7,10,null];
        const sc = {}; g.forEach((v,i) => { if (v !== null) sc['p101_h'+(i+1)] = v; });
        vm.runInContext(`
            currentMode='A';
            currentData=${JSON.stringify({ players:[{id:101,name:'Rocco',hcp:'13'}], courseData:cd, scores:sc })};
            window.__scPlayerGroupMap={"101":3};
        `, sb);
        const t = vm.runInContext(`computePlayerRoundTotals(currentData.players[0], currentData.courseData, currentData.scores)`, sb);
        assert.equal(t.holesPlayed, 17);
        assert.equal(t.complete, false);
        assert.equal(t.net, null);
        assert.equal(t.grossSoFar, 96);
        assert.equal(t.strokesSoFar < 13, true, 'strokes must accrue only on holes played');

        vm.runInContext('renderFinishRoundReview();', sb);
        const txt = strip(sb.document.getElementById('fr-player-list').innerHTML);
        assert.match(txt, /Rocco Incomplete \u2014 17 of 18 holes posted/);
        assert.ok(!/Net 83/.test(txt), 'the fabricated net must not appear');
    });

    test('NO unconditional 18-hole stroke deduction survives anywhere', () => {
        const src = read(PAGE);
        assert.ok(!/if \(v > 0\) gross \+= parseInt\(v, 10\);\s*\n\s*if \(isNet\) strokesOff \+= getStrokes/.test(src),
            'the guarded-gross / unguarded-strokes pair must be gone');
        assert.ok(!/strokesOff/.test(src), 'the whole inline calculation should be gone');
        const eng = read('settlement-engine.js');
        const fn = eng.slice(eng.indexOf('function computePlayerRoundTotals'));
        assert.match(fn, /if \(v && v > 0\) \{[\s\S]*?strokesSoFar \+=/,
            'strokes must accrue inside the posted-score guard');
    });

    test('the review header counts the incomplete cards', () => {
        const b = boot({ short: { Logan: 17, Kendall: 12 } }); b.render();
        const note = strip(b.sb.document.getElementById('fr-review-note').innerHTML);
        assert.match(note, /2 golfers still incomplete/);
    });

    test('a fully complete field says so', () => {
        const b = boot(); b.render();
        assert.match(strip(b.sb.document.getElementById('fr-review-note').innerHTML),
                     /All 12 golfers have a complete card/);
    });
});

describe('WHOLE-FIELD REVIEW', () => {

    test('all 12 golfers appear even from a Group 1 link', () => {
        const b = boot(); b.render();
        const t = strip(b.html());
        NAMES.forEach(n => assert.match(t, new RegExp('\\b' + n + '\\b'), `${n} missing from review`));
    });

    test('all three groups are headed', () => {
        const b = boot(); b.render();
        const t = strip(b.html());
        assert.match(t, /Group 1/); assert.match(t, /Group 2/); assert.match(t, /Group 3/);
    });

    test('the review ignores the filtered-player scoping used elsewhere', () => {
        const b = boot();
        b.run(`window.__scFilteredPlayers = currentData.players.slice(0, 4);`);
        b.render();
        const t = strip(b.html());
        assert.match(t, /Ellis/, 'a Group 2 golfer must appear');
        assert.match(t, /Indigo/, 'a Group 3 golfer must appear');
    });

    test('missing-score detection also covers the whole field', () => {
        const b = boot({ short: { Indigo: 16 } });   // Group 3, not the locked group
        const missing = b.run('findMissingScores()');
        assert.ok(missing.length >= 2, 'a missing card in another foursome must still be found');
        assert.ok(JSON.parse(JSON.stringify(missing)).some(m => m.player.name === 'Indigo'));
    });

    test('a golfer with no group still appears', () => {
        const b = boot();
        b.run(`delete window.__scPlayerGroupMap['112'];`);
        b.render();
        const t = strip(b.html());
        assert.match(t, /Unassigned/);
        assert.match(t, /Logan/);
    });
});

describe('WRITE ISOLATION IS UNCHANGED', () => {

    test('canWritePlayer still refuses another group from a locked link', () => {
        const b = boot();
        assert.equal(b.run(`canWritePlayer(101)`), true,  'own group must remain writable');
        assert.equal(b.run(`canWritePlayer(105)`), false, 'Group 2 must stay blocked');
        assert.equal(b.run(`canWritePlayer(109)`), false, 'Group 3 must stay blocked');
    });

    test('saveScore still gates on canWritePlayer', () => {
        const src = read(PAGE);
        const at = src.indexOf('function saveScore(');
        const fn = src.slice(at, at + 400);
        assert.match(fn, /if \(!canWritePlayer\(playerId\)\) return rejectCrossGroupWrite\(playerId\);/,
            'the write guard must be the first thing saveScore does');
    });

    test('the review renderer performs no writes', () => {
        const src = read(PAGE);
        const start = src.indexOf('function renderFinishRoundReview');
        const fn = src.slice(start, src.indexOf('\n    function ', start + 10));
        ['db.ref', 'saveScore(', '.set(', '.remove(', '.update('].forEach(t => {
            assert.ok(!fn.includes(t), `review must be read-only; found ${t}`);
        });
    });
});

describe('NO DUPLICATE HANDICAP MATH IN THE MODAL', () => {

    const reviewFn = () => {
        const src = read(PAGE);
        const start = src.indexOf('function renderFinishRoundReview');
        return src.slice(start, src.indexOf('\n    function ', start + 10));
    };

    test('the renderer consumes the canonical helper', () => {
        assert.match(reviewFn(), /computePlayerRoundTotals\(/);
    });

    test('it does not compute strokes or totals itself', () => {
        const fn = reviewFn();
        assert.ok(!/getStrokes\(/.test(fn), 'no second handicap allocator');
        assert.ok(!/parseHcp\(/.test(fn), 'no second handicap parser');
        assert.ok(!/gross \+=|strokes \+=/.test(fn), 'no second total accumulator');
    });

    test('the canonical helper itself uses the canonical primitives', () => {
        const eng = read('settlement-engine.js');
        const fn = eng.slice(eng.indexOf('function computePlayerRoundTotals'));
        const body = fn.slice(0, fn.indexOf('\n    }'));
        assert.match(body, /getStrokes\(h\.hcpIndex, hcp\)/);
        assert.match(body, /parseHcp\(/);
    });

    test('the helper is additive - existing settlement exports are untouched', () => {
        const eng = read('settlement-engine.js');
        ['computeSkinsSettlementNet','computeCombinedNetTotals','computeSkinsHoleLedger',
         'roundNetTotalsToWholeDollars'].forEach(f => {
            assert.ok(eng.includes('function ' + f), `${f} must still exist in settlement-engine.js`);
        });
        // simplifyDebts lives in money-engine.js, not here - asserting it against the
        // wrong file was a bug in this test, not a missing export.
        assert.ok(read('money-engine.js').includes('function simplifyDebts'),
            'simplifyDebts must still exist in money-engine.js');
    });
});
