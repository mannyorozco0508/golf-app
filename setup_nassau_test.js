// ============================================================================
// NASSAU AT SETUP TIME — ONE SYSTEM, TWO ENTRY POINTS
//
// On the first tee the group already knows they are playing a $10/$10/$20 Nassau
// with 2-down auto presses. Making them create the round, start it, and then hunt
// through the live Action tab to configure the game they had already agreed on
// was friction for the ordinary case.
//
// So Nassau is now configurable in Step 6, "What's The Action?" - where money
// already lives. Step 3 stays "how we score the round"; a setup Nassau saves
// gameFormat 'stroke' underneath and writes a REAL modern wager to sideMatches.
// It does NOT resurrect the deprecated gameFormat:'nassau'.
//
// THE ARCHITECTURAL REQUIREMENT: one builder. buildNassauWagerPayload() in
// action-model.js is pure - no DOM, no database - and both entry points call it.
// Two hand-written payload builders would drift, and this project has already
// paid for exactly that: a per-press stake landed in money-engine.js and not in
// the three page copies, and a $10 Nassau with a $25 press showed $30 live while
// the Receipt correctly paid $45.
//
// AND THE DUPLICATION RISK: settlement-engine.js has legacyMainAsSideMatch(),
// which synthesises the round's main game into a wager-shaped receipt. If it
// fired on a setup-created Nassau the golfer would be billed twice. It returns
// null for 'stroke', so it cannot - but that is asserted here, not assumed.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const cd18 = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
const P2 = [{ id:101, name:'Marty', hcp:'0' }, { id:102, name:'Manny', hcp:'0' }];
const P4 = P2.concat([{ id:103, name:'Carp', hcp:'0' }, { id:104, name:'Scott', hcp:'0' }]);

const ADMIN_DEPS = ['money-engine.js','action-model.js','settlement-engine.js','pool-engine.js','score-marks.js'];
const SM_DEPS = ['money-engine.js','action-model.js','settlement-engine.js'];

// Every engine in one context, loaded in production order.
function engines() {
    const sb = { console, Math, Object, Array, String, Number, JSON, isNaN,
                 parseInt, parseFloat, Date, Set, Map };
    vm.createContext(sb);
    ['money-engine.js','action-model.js','pool-engine.js','settlement-engine.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}

// Drives admin.html's Step 6 fields and returns what it would write.
function setupWager({ players = P2, front = 10, back = 10, overall = 20,
                      press = '2down', scoring = 'net', autoMode = 'same',
                      autoAmount = '', pickA = null, pickB = null } = {}) {
    const sb = loadHtmlInlineScript('admin.html', ADMIN_DEPS);
    vm.runInContext(`
        alert=function(){};
        collectWizardPlayers=function(){ return ${JSON.stringify(players)}; };
        document.getElementById('setup-nassau-enabled').checked = true;
        toggleSetupNassau();
        document.getElementById('setup-nassau-front').value='${front}';
        document.getElementById('setup-nassau-back').value='${back}';
        document.getElementById('setup-nassau-overall').value='${overall}';
        document.getElementById('setup-nassau-press').value='${press}';
        document.getElementById('setup-nassau-scoring').value='${scoring}';
        document.getElementById('setup-nassau-autopress-mode').value='${autoMode}';
        document.getElementById('setup-nassau-autopress').value='${autoAmount}';
        toggleSetupNassauAutoAmount();
        ${pickA ? `document.getElementById('setup-nassau-p1').value='${pickA}';` : ''}
        ${pickB ? `document.getElementById('setup-nassau-p2').value='${pickB}';` : ''}
        window.__w = collectSetupNassauWager();
    `, sb);
    const out = vm.runInContext('window.__w', sb);
    return out ? JSON.parse(JSON.stringify(out)) : null;
}

// Drives sidematches.html's real saveSideMatch() and captures the payload.
function actionWager({ front = 10, back = 10, overall = 20, press = '2down',
                       scoring = 'net', autoMode = 'same', autoAmount = '' } = {}) {
    const sb = loadHtmlInlineScript('sidematches.html', SM_DEPS);
    vm.runInContext(`
        window.__w=[]; alert=function(){};
        db.ref=function(p){return {push:function(){return {key:'K1'};},
            set:function(v){window.__w.push(v); return {then:function(f){f&&f(); return {catch:function(){}};}};},
            remove:function(){},on:function(){},
            once:function(){return {then:function(f){f&&f({val:function(){return null;}}); return {catch:function(){}};}};}};};
        currentMode='ABCD'; isOrganizerView=function(){return true;};
        sidematchPickState={'101':'a','102':'b'};
        currentData={players:${JSON.stringify(P2)},courseData:${JSON.stringify(cd18)},scores:{}};
        document.getElementById('sm-format').value='nassau'; onSideMatchFormatChange();
        document.getElementById('sm-front-stake').value='${front}';
        document.getElementById('sm-back-stake').value='${back}';
        document.getElementById('sm-overall-stake').value='${overall}';
        document.getElementById('sm-press-rule').value='${press}';
        document.getElementById('sm-scoring').value='${scoring}';
        document.getElementById('sm-autopress-mode').value='${autoMode}';
        document.getElementById('sm-autopress-stake').value='${autoAmount}';
        saveSideMatch();
    `, sb);
    const w = JSON.parse(JSON.stringify(vm.runInContext('window.__w', sb)));
    return w[0] || null;
}

// Everything except createdAt, which is a timestamp and legitimately differs.
const SHAPE = ['format','scoring','teamAIds','teamBIds','startHole','frontStake',
               'backStake','overallStake','autoPressStake','pressRule','stake'];
const shapeOf = (p) => SHAPE.reduce((o,k) => (o[k] = p[k], o), {});

function roundWith(wager, thru = 18) {
    const sc = {};
    P2.forEach(p => cd18.forEach(h => { if (h.hole <= thru) sc['p'+p.id+'_h'+h.hole] = 4; }));
    [[1,101],[2,101]].forEach(([h,w]) => { if (h <= thru) sc['p'+w+'_h'+h] = 3; });
    return { players: P2, courseData: cd18, scores: sc, gameFormat: 'stroke',
             settlementMode: 'whole-dollar', sideMatches: { n1: wager } };
}

// ============================================================================

describe('STEP 6 OFFERS NASSAU — AND STEP 3 STAYS SCORING', () => {

    test('the Nassau card lives in Step 6, What\u2019s The Action', () => {
        const src = read('admin.html');
        const step6 = src.indexOf("Step 6: What&#39;s The Action?") >= 0
            ? src.indexOf("Step 6: What&#39;s The Action?") : src.indexOf('Step 6');
        const card = src.indexOf('id="setup-nassau-box"');
        assert.ok(card > -1, 'the Step 6 Nassau card must exist');
        assert.ok(card > step6, 'and it must sit inside Step 6, where money already lives');
    });

    test('it is labelled as the game, not as architecture', () => {
        const src = read('admin.html');
        assert.match(src, /Match Play \u00b7 Front \/ Back \/ Overall/);
    });

    test('Step 3 still hides the deprecated Nassau round type', () => {
        assert.match(read('admin.html'),
            /<optgroup label="Legacy round types[^"]*" id="legacy-format-group" style="display:none;">/);
    });

    test('a setup Nassau does NOT write gameFormat nassau', () => {
        const w = setupWager();
        assert.equal(w.format, 'nassau', 'the WAGER is a nassau');
        const src = read('admin.html');
        // The only format the wizard saves comes from the select, which never offers
        // nassau for a new round.
        assert.ok(!/gameFormat:\s*['"]nassau['"]/.test(src),
            'no code path hard-codes the deprecated round format');
    });

    test('the wager is written to the standard sideMatches location', () => {
        assert.match(read('admin.html'), /sideMatches\/\$\{nKey\}/,
            'no setup-only database path');
        assert.match(read('admin.html'), /events\/\$\{currentMode\}\/sideMatches/);
    });
});

describe('ONE BUILDER, TWO ENTRY POINTS', () => {

    test('buildNassauWagerPayload exists once, in action-model.js', () => {
        const defs = ['action-model.js','admin.html','sidematches.html','money-engine.js']
            .filter(f => /function buildNassauWagerPayload\(/.test(read(f)));
        assert.deepEqual(defs, ['action-model.js'], 'exactly one implementation');
    });

    test('both entry points call it', () => {
        assert.match(read('admin.html'), /buildNassauWagerPayload\(\{/);
        assert.match(read('sidematches.html'), /buildNassauWagerPayload\(\{/);
    });

    test('it is pure — no DOM, no database', () => {
        const src = read('action-model.js');
        const at = src.indexOf('function buildNassauWagerPayload');
        const fn = src.slice(at, at + 2000);
        ['document.', 'db.ref', '.set(', 'getElementById']
            .forEach(t => assert.ok(!fn.includes(t), 'builder must stay pure; found ' + t));
    });

    test('$10/$10/$20 produces identical payloads from setup and Action', () => {
        assert.deepEqual(shapeOf(setupWager()), shapeOf(actionWager()));
    });

    test('$5/$50/$10 gross produces identical payloads', () => {
        const opts = { front: 5, back: 50, overall: 10, scoring: 'gross' };
        assert.deepEqual(shapeOf(setupWager(opts)), shapeOf(actionWager(opts)));
    });

    test('a custom auto-press amount produces identical payloads', () => {
        const opts = { autoMode: 'custom', autoAmount: 25 };
        assert.deepEqual(shapeOf(setupWager(opts)), shapeOf(actionWager(opts)));
    });
});

describe('THE PAYLOAD IS EXACT', () => {

    test('$10/$10/$20, net, 2-down, same-as-segment', () => {
        assert.deepEqual(shapeOf(setupWager()), {
            format: 'nassau', scoring: 'net',
            teamAIds: ['101'], teamBIds: ['102'], startHole: 1,
            frontStake: 10, backStake: 10, overallStake: 20,
            autoPressStake: null, pressRule: '2down', stake: 20,
        });
    });

    test('the three stakes stay independent', () => {
        const w = setupWager({ front: 5, back: 50, overall: 10 });
        assert.equal(w.frontStake, 5);
        assert.equal(w.backStake, 50);
        assert.equal(w.overallStake, 10);
    });

    test('gross basis persists', () => {
        assert.equal(setupWager({ scoring: 'gross' }).scoring, 'gross');
    });

    test('a custom auto amount persists; same-as-segment stays null', () => {
        assert.equal(setupWager({ autoMode: 'custom', autoAmount: 25 }).autoPressStake, 25);
        assert.equal(setupWager({ autoMode: 'same' }).autoPressStake, null);
    });

    test('press rule persists', () => {
        assert.equal(setupWager({ press: '1down' }).pressRule, '1down');
        assert.equal(setupWager({ press: 'none' }).pressRule, 'none');
    });
});

describe('WHO IS IN IT', () => {

    test('two players default to each other — no extra taps', () => {
        const w = setupWager({ players: P2 });
        assert.deepEqual(w.teamAIds, ['101']);
        assert.deepEqual(w.teamBIds, ['102']);
    });

    test('four players are NOT guessed', () => {
        // Inventing a pairing would settle money between people who never agreed.
        assert.equal(setupWager({ players: P4 }), null,
            'an unpicked larger field must produce no wager');
    });

    test('four players work once the golfer picks', () => {
        const w = setupWager({ players: P4, pickA: '101', pickB: '103' });
        assert.deepEqual(w.teamAIds, ['101']);
        assert.deepEqual(w.teamBIds, ['103']);
    });

    test('the same player on both sides produces nothing', () => {
        assert.equal(setupWager({ players: P4, pickA: '101', pickB: '101' }), null);
    });

    test('Nassau unchecked produces nothing', () => {
        const sb = loadHtmlInlineScript('admin.html', ADMIN_DEPS);
        vm.runInContext(`alert=function(){};
            collectWizardPlayers=function(){return ${JSON.stringify(P2)};};
            window.__w = collectSetupNassauWager();`, sb);
        assert.equal(vm.runInContext('window.__w', sb), null);
    });
});

describe('IT REACHES THE LIVE SURFACES AND SETTLES ONCE', () => {

    test('the Scorecard widget shows it with the right stakes', () => {
        const E = engines();
        const d = roundWith(setupWager(), 2);
        const st = E.buildLiveMatchStates(d, cd18, d.scores, null)[0];
        assert.ok(st, 'a setup-created Nassau must reach the presenter');
        assert.equal(st.segments.find(s => s.id === 'F9').stake, 10);
        assert.equal(st.segments.find(s => s.id === '18').stake, 20);
    });

    test('auto presses use each segment\u2019s own amount', () => {
        const E = engines();
        const d = roundWith(setupWager(), 2);
        const st = E.buildLiveMatchStates(d, cd18, d.scores, null)[0];
        assert.equal(st.segments.find(s => s.id === 'F9').presses[0].stake, 10);
        assert.equal(st.segments.find(s => s.id === '18').presses[0].stake, 20);
    });

    test('the PRESS deep-link targets it', () => {
        const E = engines();
        const d = roundWith(setupWager(), 6);
        const st = E.buildLiveMatchStates(d, cd18, d.scores, null)[0];
        assert.equal(st.wagerId, 'n1');
        assert.equal(st.canPress, true);
    });

    test('MANDATORY: legacyMainAsSideMatch does not duplicate it', () => {
        // A stroke round carries no main wager, so the synthetic receipt must not
        // appear beside the real one. Two receipts here would mean double billing.
        const E = engines();
        const d = roundWith(setupWager(), 18);
        const receipts = E.buildSideMatchReceipts(d, cd18, d.scores);
        assert.equal(receipts.length, 1, 'exactly one Nassau receipt');
        assert.equal(receipts.filter(r => r.__legacyMain).length, 0,
            'no synthetic main-game duplicate');
    });

    test('settlement counts the wager once and conserves', () => {
        const E = engines();
        const d = roundWith(setupWager(), 18);
        const c = E.computeCombinedNetTotals(d, cd18, d.scores);
        const vals = Object.values(c.netByName);
        assert.equal(vals.find(v => v.name === 'Marty').net, 40);
        assert.equal(vals.reduce((a, v) => a + v.net, 0), 0);
    });
});

describe('NOTHING ELSE MOVED', () => {

    test('Action → Add Wager → Nassau still works', () => {
        const w = actionWager();
        assert.equal(w.format, 'nassau');
        assert.equal(w.frontStake, 10);
        assert.equal(w.overallStake, 20);
    });

    test('the side-match press writer is untouched', () => {
        const src = read('sidematches.html');
        assert.equal((src.match(/presses\/\$\{pushKey\}`\)\.set/g) || []).length, 1);
        assert.match(src, /stake: amt/);
    });

    test('no new Firebase location was invented', () => {
        assert.match(read('admin.html'), /events\/\$\{currentMode\}\/sideMatches/,
            'the standard location only');
    });

    test('legacy round support and copyFrom normalization remain', () => {
        const src = read('admin.html');
        assert.match(src, /function showLegacyRoundNotice\(/);
        assert.match(src, /function showCopiedLegacyNotice\(/);
        assert.match(src, /\['nassau', 'match', 'skins', 'dots'\]\.includes\(data\.gameFormat\)/);
    });

    test('there is still exactly one Nassau settlement implementation', () => {
        const defs = ['money-engine.js','settlement-engine.js','action-model.js']
            .filter(f => /function calculateMatchEngine\(/.test(read(f)));
        assert.deepEqual(defs, ['money-engine.js']);
    });
});
