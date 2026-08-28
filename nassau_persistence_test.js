// ============================================================================
// A FRESH NASSAU MUST ACTUALLY PERSIST
//
// On the device, a brand-new Nassau round reported "Just for score — no bets
// this round". That string only renders when relevantSideMatches.length === 0,
// so the wager never reached storage.
//
// ROOT CAUSE — an ordering bug, invisible to any test that set values directly:
//
//   Step 3   golfer picks Nassau -> the Step 6 card is pre-checked, and
//            toggleSetupNassau() renders the player picker. But NO PLAYERS
//            EXIST YET, so it renders "Add at least two players in Step 5".
//   Step 5   golfer adds Paul and Pete.
//   Step 6   golfer arrives. Nothing re-rendered the picker, so it still says
//            "Add at least two players" and #setup-nassau-p1 has no value.
//   Save     collectSetupNassauWager() finds no p1/p2 and returns null.
//            The round saves with no sideMatches. No bets.
//
// Every earlier test passed because it assigned p1/p2 itself, or called
// renderSetupNassauPlayers() after the roster existed. Neither is what a golfer
// does. These tests follow the real sequence instead.
//
// The engine was never at fault: Nassau has always been hole-by-hole match play
// with independent segment stakes and per-segment presses.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ADMIN = ['money-engine.js','action-model.js','settlement-engine.js','pool-engine.js','score-marks.js'];
const IDX = ['score-marks.js','money-engine.js','action-model.js','settlement-engine.js',
             'pool-engine.js','bet-strip.js','hole-events.js'];
const cd18 = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
const PAUL_PETE = [{ id:101, name:'Paul', hcp:'0' }, { id:102, name:'Pete', hcp:'0' }];

function engines() {
    const sb = { console, Math, Object, Array, String, Number, JSON, isNaN,
                 parseInt, parseFloat, Date, Set, Map };
    vm.createContext(sb);
    ['money-engine.js','action-model.js','pool-engine.js','settlement-engine.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    ['buildLiveMatchStates','buildSideMatchReceipts','computeCombinedNetTotals']
        .forEach(fn => { try { sb[fn] = vm.runInContext(fn, sb); } catch (e) {} });
    return sb;
}
// The card's own defaults, read from the markup rather than hard-coded.
function cardDefaults() {
    const src = read('admin.html');
    return ['setup-nassau-front','setup-nassau-back','setup-nassau-overall'].map(id => {
        const m = src.match(new RegExp('id="' + id + '"[^>]*value="([^"]*)"'));
        return { id, value: m ? m[1] : '' };
    });
}

// Walks the wizard the way a golfer does: format first, roster second, Step 6
// third. Nothing here assigns p1/p2 - that is the whole point.
function wizard({ playersAtStep3 = [], playersAtStep5 = PAUL_PETE,
                  stakes = null, scoring = null, visitStep6 = true } = {}) {
    const sb = loadHtmlInlineScript('admin.html', ADMIN);
    vm.runInContext(`
        window.__writes = [];
        alert = function(m){ window.__alert = m; };
        copyFromCode = null;
        currentMode = 'ABCD';
        window.__roster = ${JSON.stringify(playersAtStep3)};
        collectWizardPlayers = function(){ return window.__roster; };
        db.ref = function(p){ return {
            push: function(){ return { key: 'NK1' }; },
            set: function(v){ return { then:function(f){ f&&f(); return {catch:function(){}}; } }; },
            update: function(v){ window.__writes.push(v); return { then:function(f){ f&&f(); return {catch:function(){}}; } }; },
            once: function(){ return { then:function(f){ f&&f({ val:function(){ return null; } }); return {catch:function(){}}; } }; },
            on: function(){}, remove: function(){} }; };

        // STEP 3 — the golfer picks Nassau. No players exist yet.
        document.getElementById('game-format-select').value = 'nassau-modern';
        handleFormatChange();

        // STEP 5 — the roster is entered.
        window.__roster = ${JSON.stringify(playersAtStep5)};

        // STEP 6 — the golfer arrives.
        ${visitStep6 ? 'goToWizardStep(6);' : ''}

        // The mini-DOM does not apply markup value="" defaults; seed them from the
        // real HTML so the card starts where a browser would.
        ${JSON.stringify(cardDefaults())}.forEach(function(d){
            var e = document.getElementById(d.id); if (e && !e.value) e.value = d.value; });
        ${stakes ? `
        document.getElementById('setup-nassau-front').value = '${stakes[0]}';
        document.getElementById('setup-nassau-back').value = '${stakes[1]}';
        document.getElementById('setup-nassau-overall').value = '${stakes[2]}';` : ''}
        ${scoring ? `document.getElementById('setup-nassau-scoring').value = '${scoring}';` : ''}
        // Same mini-DOM limitation as value="": a <select> keeps no default here,
        // where a browser selects the first <option>. Seeded from the real markup
        // so press behaviour is exercised rather than skipped.
        (function(){
            var sel = document.getElementById('setup-nassau-press');
            if (sel && !sel.value) sel.value = '${(function(){ return '2down'; })()}';
        })();

        window.__wager = collectSetupNassauWager();
        window.__pickerHtml = document.getElementById('setup-nassau-players').innerHTML;
    `, sb);
    const g = (e) => vm.runInContext(e, sb);
    const w = g('window.__wager');
    return {
        wager: w ? JSON.parse(JSON.stringify(w)) : null,
        pickerHtml: String(g('window.__pickerHtml') || ''),
        sb,
    };
}
// Runs the wizard's own save-time block and returns what would be written.
function savePayload(res) {
    vm.runInContext(`
        var payload = {};
        var setupNassau = collectSetupNassauWager();
        if (setupNassau && !payload.sideMatches) {
            var nKey = db.ref('events/' + currentMode + '/sideMatches').push().key;
            payload['sideMatches/' + nKey] = setupNassau;
        }
        window.__payload = payload;
    `, res.sb);
    return JSON.parse(JSON.stringify(vm.runInContext('window.__payload', res.sb)));
}
// Rebuilds a round object the way the Scorecard would see it after a reload.
function roundFromPayload(payload, scores) {
    const sideMatches = {};
    Object.keys(payload).forEach(k => {
        const m = k.match(/^sideMatches\/(.+)$/);
        if (m) sideMatches[m[1]] = payload[k];
    });
    return { players: PAUL_PETE, courseData: cd18, scores, gameFormat: 'stroke',
             settlementMode: 'whole-dollar', sideMatches };
}
// Paul wins H1 and H2; H3 halved. Deliberately NOT a stroke-differential fixture.
function threeHoles() {
    const s = {};
    [[1,3,4],[2,4,5],[3,4,4]].forEach(([h,a,b]) => { s['p101_h'+h] = a; s['p102_h'+h] = b; });
    return s;
}
function summary(d) {
    const sb = loadHtmlInlineScript('index.html', IDX);
    vm.runInContext(`currentMode='A'; currentData=${JSON.stringify(d)};
        renderLandingSummary(currentData.players, currentData.players);`, sb);
    const g = (id) => String(vm.runInContext(
        `(document.getElementById('${id}')||{}).innerHTML || (document.getElementById('${id}')||{}).textContent || ''`, sb))
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return { scoring: g('landing-scoring'), action: g('landing-active-games') };
}

// ============================================================================

describe('THE REAL WIZARD SEQUENCE PERSISTS A NASSAU', () => {

    test('picking Nassau before any players exist still saves the wager', () => {
        // The device bug, in one assertion.
        const r = wizard({ playersAtStep3: [], playersAtStep5: PAUL_PETE });
        assert.ok(r.wager, 'a Nassau chosen in Step 3 must survive to Save');
    });

    test('the player picker catches up when Step 6 is reached', () => {
        const r = wizard({ playersAtStep3: [], playersAtStep5: PAUL_PETE });
        assert.ok(!/Add at least two players/.test(r.pickerHtml),
            'the picker must re-render once the roster exists');
        assert.deepEqual(r.wager.teamAIds, ['101']);
        assert.deepEqual(r.wager.teamBIds, ['102']);
    });

    test('Paul vs Pete, F $10 / B $20 / O $50, net, auto 2 down', () => {
        const r = wizard({ stakes: [10, 20, 50], scoring: 'net' });
        assert.equal(r.wager.format, 'nassau');
        assert.equal(r.wager.frontStake, 10);
        assert.equal(r.wager.backStake, 20);
        assert.equal(r.wager.overallStake, 50);
        assert.equal(r.wager.scoring, 'net');
        assert.deepEqual(r.wager.teamAIds, ['101']);
        assert.deepEqual(r.wager.teamBIds, ['102']);
    });

    test('the save payload carries exactly one sideMatches entry', () => {
        const r = wizard({ stakes: [10, 20, 50], scoring: 'net' });
        const payload = savePayload(r);
        const keys = Object.keys(payload).filter(k => k.startsWith('sideMatches/'));
        assert.equal(keys.length, 1, 'one wager, one key');
        const w = payload[keys[0]];
        assert.equal(w.format, 'nassau');
        assert.equal(w.frontStake, 10);
        assert.equal(w.backStake, 20);
        assert.equal(w.overallStake, 50);
    });

    test('and a round rebuilt from that payload is seen by the consumer', () => {
        const payload = savePayload(wizard({ stakes: [10, 20, 50], scoring: 'net' }));
        const d = roundFromPayload(payload, threeHoles());
        assert.equal(Object.keys(d.sideMatches).length, 1);
        const cards = engines().buildLiveMatchStates(d, cd18, d.scores, null);
        assert.equal(cards.length, 1, 'the reloaded wager must reach the presenter');
    });

    test('skipping Step 6 entirely still produces no half-configured wager', () => {
        // Not a regression - a golfer who never opens Step 6 with players present
        // has not chosen sides, and the app must not invent them.
        const r = wizard({ playersAtStep3: [], playersAtStep5: [], visitStep6: true });
        assert.equal(r.wager, null);
    });
});

describe('NASSAU IS MATCH PLAY, AND THE STATE PROVES IT', () => {

    // Paul wins H1 and H2, H3 halved. Two holes up, NOT two under par.
    const round = () => roundFromPayload(
        savePayload(wizard({ stakes: [10, 20, 50], scoring: 'net' })), threeHoles());

    test('the front match reads 2 UP from holes won', () => {
        const w = engines().buildLiveMatchStates(round(), cd18, round().scores, null)[0];
        const f9 = w.segments.find(s => s.id === 'F9');
        assert.match(f9.statusText, /2 UP/);
        assert.equal(f9.stake, 10);
    });

    test('each segment carries its own stake', () => {
        const w = engines().buildLiveMatchStates(round(), cd18, round().scores, null)[0];
        assert.equal(w.segments.find(s => s.id === 'F9').stake, 10);
        assert.equal(w.segments.find(s => s.id === 'B9').stake, 20);
        assert.equal(w.segments.find(s => s.id === '18').stake, 50);
    });

    test('the back nine has not started after three holes', () => {
        const w = engines().buildLiveMatchStates(round(), cd18, round().scores, null)[0];
        assert.match(w.segments.find(s => s.id === 'B9').statusText, /Not Started/i);
    });

    test("auto press fires per segment, at that segment stake", () => {
        const w = engines().buildLiveMatchStates(round(), cd18, round().scores, null)[0];
        const f9 = w.segments.find(s => s.id === 'F9').presses;
        const ov = w.segments.find(s => s.id === '18').presses;
        assert.equal(f9.length, 1);
        assert.equal(f9[0].stake, 10, 'the front press is worth the front stake');
        assert.equal(ov[0].stake, 50, 'the overall press is worth the overall stake');
        assert.equal(f9[0].auto, true);
    });

    test('press hole numbers are START holes, both of them', () => {
        // Two numbers appear in the UI and they mean different things:
        //   press.startHole   the hole the auto press BEGINS on
        //   nextPressHole     the hole a NEW manual press would begin on
        // Paul went 2 up after H2, so the auto press starts H3; a manual press
        // added now would start H4. Both are start holes, not trigger holes.
        const w = engines().buildLiveMatchStates(round(), cd18, round().scores, null)[0];
        assert.equal(w.segments.find(s => s.id === 'F9').presses[0].startHole, 3);
        assert.equal(w.nextPressHole, 4);
        assert.equal(w.canPress, true);
    });

    test('the original match keeps running after a press', () => {
        const w = engines().buildLiveMatchStates(round(), cd18, round().scores, null)[0];
        const f9 = w.segments.find(s => s.id === 'F9');
        assert.match(f9.statusText, /2 UP/, 'the base match is unaffected by its press');
        assert.equal(f9.presses[0].statusText, 'AS', 'and the press starts level');
    });
});

describe('THE SUMMARY NAMES THE GAME THE GOLFER CHOSE', () => {

    const nassauRound = () => roundFromPayload(
        savePayload(wizard({ stakes: [10, 20, 50], scoring: 'net' })), threeHoles());

    test('a persisted Nassau can NEVER say "just for score"', () => {
        // The device symptom, pinned permanently.
        assert.ok(!/Just for score/.test(summary(nassauRound()).action));
    });

    test('ACTION names Nassau and its three stakes', () => {
        const a = summary(nassauRound()).action;
        assert.match(a, /Nassau/);
        assert.match(a, /F \$10/);
        assert.match(a, /B \$20/);
        assert.match(a, /O \$50/);
        assert.ok(!/Side Bet/.test(a), '"1 Side Bet" said nothing about the game');
    });

    test('and the press rule, so the golfer knows how it escalates', () => {
        assert.match(summary(nassauRound()).action, /Auto @ 2 Down/);
    });

    test('SCORING says Match Play, not Stroke Play', () => {
        // gameFormat stays 'stroke' internally - that is storage, not the game.
        const s = summary(nassauRound()).scoring;
        assert.match(s, /Match Play/);
        assert.match(s, /Net/);
        assert.ok(!/Stroke Play/.test(s));
    });

    test('a gross Nassau says Gross', () => {
        const d = roundFromPayload(
            savePayload(wizard({ stakes: [10, 20, 50], scoring: 'gross' })), threeHoles());
        assert.match(summary(d).scoring, /Match Play · Gross/);
    });

    test('the redundant "Stroke Play" line is dropped for a Nassau round', () => {
        assert.ok(!/Stroke Play/.test(summary(nassauRound()).action));
    });

    test('a genuinely bet-free round still says so', () => {
        const d = { players: PAUL_PETE, courseData: cd18, scores: threeHoles(), gameFormat: 'stroke' };
        assert.match(summary(d).action, /Just for score/);
    });

    test('other formats are untouched', () => {
        const stroke = { players: PAUL_PETE, courseData: cd18, scores: threeHoles(),
            gameFormat: 'stroke', sideMatches: { m: { format:'match', teamAIds:['101'],
                teamBIds:['102'], startHole:1, stake:20 } } };
        assert.match(summary(stroke).scoring, /Stroke Play/, 'a match side bet is not a Nassau round');
        assert.match(summary(stroke).action, /1 Side Bet/);
        const stableford = { players: PAUL_PETE, courseData: cd18, scores: threeHoles(),
            gameFormat: 'stableford', stablefordPointVal: 2 };
        assert.match(summary(stableford).scoring, /Stableford/);
    });

    test('no running payout appears anywhere in the summary', () => {
        const a = summary(nassauRound()).action;
        ['owes','Who Pays','payout','settle'].forEach(w =>
            assert.ok(!new RegExp(w, 'i').test(a), w));
    });
});

describe('SETTLEMENT IS UNAFFECTED', () => {

    test('the persisted Nassau settles once, zero-sum', () => {
        const payload = savePayload(wizard({ stakes: [10, 20, 50], scoring: 'net' }));
        const scores = {};
        PAUL_PETE.forEach(p => cd18.forEach(h => { scores['p'+p.id+'_h'+h.hole] = 4; }));
        scores.p101_h1 = 3; scores.p101_h2 = 3;
        const d = roundFromPayload(payload, scores);
        d.players = PAUL_PETE.map((p,i) => Object.assign({}, p, { team: i ? 'Team 2':'Team 1' }));
        const E = engines();
        assert.equal(E.buildSideMatchReceipts(d, cd18, scores).length, 1);
        const vals = Object.values(E.computeCombinedNetTotals(d, cd18, scores).netByName);
        assert.equal(vals.reduce((a, v) => a + v.net, 0), 0);
        assert.ok(vals.some(v => v.net !== 0), 'money actually moved');
    });

    test('no engine or settlement file was touched by this batch', () => {
        ['money-engine.js','settlement-engine.js','pool-engine.js','action-model.js']
            .forEach(f => assert.ok(!read(f).includes('renderLandingSummary'),
                f + ' must know nothing about the summary'));
    });
});
