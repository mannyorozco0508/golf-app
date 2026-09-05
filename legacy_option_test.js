// ============================================================================
// ONE SELECTABLE NASSAU
//
// Step 3 offered the golfer TWO options both labelled "Nassau": the modern
// shortcut under "Player vs player", and the legacy gameFormat under "Legacy
// round types". Picking the second one lands on the deprecated single-stake
// Step 4 panel - which is exactly what happened during device QA, and made the
// modern implementation look broken when it was not.
//
// ROOT CAUSE: revealLegacyFormatOption() unhid the WHOLE legacy optgroup - all
// four formats - purely so the browser could represent one saved value. A round
// saved as legacy Nassau therefore also offered legacy Match, Skins and Dots as
// things the golfer could switch to.
//
// THE FIX: represent the saved value with a single dedicated option naming that
// round's own format. The four-option legacy group stays hidden permanently.
//
// WHY THIS SUITE PARSES THE REAL MARKUP: the mini-DOM lets any string be
// assigned to select.value, so a test could "select" an option that does not
// exist and pass. That is how the earlier suites went green while the device
// failed. What matters here is which options are OFFERED, so these tests read
// the actual <optgroup>/<option> structure out of admin.html.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const DEPS = ['handicap.js','money-engine.js','action-model.js','settlement-engine.js','pool-engine.js','score-marks.js'];
const cd18 = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
const TWO = [{ id:101, name:'Marty', hcp:'0' }, { id:102, name:'Manny', hcp:'0' }];

// Reads the Step 3 select out of admin.html as structure: which groups exist,
// which are hidden, and what each offers. No value can be invented here.
function parseFormatSelect(html) {
    const src = html !== undefined ? html : read('admin.html');
    const i = src.indexOf('<select id="game-format-select"');
    assert.ok(i > -1, 'the Step 3 select must exist');
    const j = src.indexOf('</select>', i);
    const blk = src.slice(i, j);
    return [...blk.matchAll(/<optgroup([^>]*)>([\s\S]*?)<\/optgroup>/g)].map(m => ({
        label: (m[1].match(/label="([^"]*)"/) || [])[1] || '',
        id: (m[1].match(/id="([^"]*)"/) || [])[1] || '',
        hidden: /display:\s*none/.test(m[1]),
        options: [...m[2].matchAll(/<option value="([^"]*)"[^>]*>([^<]*)</g)]
            .map(o => ({ value: o[1], text: o[2].trim() })),
    }));
}
const selectableOptions = (groups) => groups.filter(g => !g.hidden).flatMap(g => g.options);

// Loads a round through admin.html's own format block, then reports what the
// golfer would actually be able to choose.
function loadRound(gameFormat, { asCopy = false } = {}) {
    const sb = loadHtmlInlineScript('admin.html', DEPS);
    // The stub getElementById returns a synthetic element for ANY id, so asking it
    // about a dynamically created optgroup proves nothing - that is the same
    // false-green that let the device bug through. Instead, instrument the REAL
    // select and capture exactly what production appends to it.
    vm.runInContext(`
        window.__appendedGroup = null;
        (function(){
            var _ce = document.createElement;
            document.createElement = function(t){
                var e = _ce.call(document, t);
                e.__kids = [];
                var _a = e.appendChild;
                e.appendChild = function(c){ e.__kids.push(c); return _a ? _a.call(e, c) : c; };
                return e;
            };
            var sel = document.getElementById('game-format-select');
            var _sa = sel.appendChild;
            sel.appendChild = function(n){ window.__appendedGroup = n; return _sa ? _sa.call(sel, n) : n; };
            var _sr = sel.removeChild;
            sel.removeChild = function(n){ window.__appendedGroup = null; return _sr ? _sr.call(sel, n) : n; };
        })();
        alert = function(){};
        copyFromCode = ${asCopy ? "'SRC1'" : 'null'};
        collectWizardPlayers = function(){ return ${JSON.stringify(TWO)}; };
        var data = { gameFormat: '${gameFormat}' };
        if (data.gameFormat && document.getElementById("game-format-select")) {
            const isCopy = !!copyFromCode;
            const legacyWagerFormat = ['nassau','match','skins','dots'].includes(data.gameFormat);
            if (isCopy && legacyWagerFormat) {
                document.getElementById("game-format-select").value = 'stroke';
                showCopiedLegacyNotice(data.gameFormat);
                syncSetupNassauAvailability(); syncLegacyFormatBadge();
            } else {
                revealLegacyFormatOption(data.gameFormat);
                document.getElementById("game-format-select").value = data.gameFormat;
                if (!isCopy) showLegacyRoundNotice(data.gameFormat);
                syncSetupNassauAvailability(); syncLegacyFormatBadge();
            }
        }
        handleFormatChange();
    `, sb);
    const g = (e) => vm.runInContext(e, sb);
    const grp = g("window.__appendedGroup ? ({ id: window.__appendedGroup.id, label: window.__appendedGroup.label, opts: (window.__appendedGroup.__kids||[]).map(function(c){ return { value: c.value, text: c.textContent }; }) }) : null");
    const group = grp ? JSON.parse(JSON.stringify(grp)) : null;
    return {
        storedValue: g("document.getElementById('game-format-select').value"),
        // What production actually appended, captured from the real select.
        currentGroup: group,
        currentGroupHtml: group
            ? group.opts.map(o => '<option value="' + o.value + '">' + o.text + '</option>').join('')
            : '',
        currentGroupPresent: !!group,
        legacyGroupDisplay: g("(document.getElementById('legacy-format-group')||{style:{}}).style.display"),
        legacyPanel: g("(document.getElementById('nassau-settings')||{style:{}}).style.display"),
        badgeShown: g("(document.getElementById('legacy-format-badge')||{style:{}}).style.display === 'block'"),
        nassauBlocked: g("(document.getElementById('setup-nassau-enabled')||{}).disabled === true"),
    };
}

function engines() {
    const sb = { console, Math, Object, Array, String, Number, JSON, isNaN,
                 parseInt, parseFloat, Date, Set, Map };
    vm.createContext(sb);
    ['handicap.js','money-engine.js','action-model.js','pool-engine.js','settlement-engine.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}
function settle(gameFormat, wager) {
    const E = engines();
    const players = TWO.map((p,i) => Object.assign({}, p, { team: i ? 'Team 2':'Team 1' }));
    const scores = {};
    players.forEach(p => cd18.forEach(h => { scores['p'+p.id+'_h'+h.hole] = 4; }));
    scores.p101_h1 = 3; scores.p101_h2 = 3;
    const d = { players, courseData: cd18, scores, settlementMode: 'whole-dollar', gameFormat };
    if (wager) d.sideMatches = { n1: wager };
    if (gameFormat === 'nassau') {
        d.nassauStake = 20; d.nassauScoring = 'net'; d.nassauPressRule = 'none';
    }
    const receipts = E.buildSideMatchReceipts(d, cd18, scores);
    const vals = Object.values(E.computeCombinedNetTotals(d, cd18, scores).netByName);
    return {
        receipts: receipts.length,
        legacyMain: receipts.filter(r => r.__legacyMain).length,
        marty: (vals.find(v => v.name === 'Marty') || {}).net,
        sum: vals.reduce((a, v) => a + v.net, 0),
    };
}

const LEGACY_LABELS = { nassau: 'Nassau', match: 'Match Play', skins: 'Skins', dots: 'Dot Game' };

// ============================================================================

describe('A NEW ROUND OFFERS EXACTLY ONE NASSAU', () => {

    test('exactly one selectable option is labelled Nassau', () => {
        // The device failure in one assertion: two rows both saying "Nassau".
        const nassaus = selectableOptions(parseFormatSelect())
            .filter(o => /^nassau$/i.test(o.text));
        assert.equal(nassaus.length, 1,
            'the golfer must never be offered two options both called Nassau');
    });

    test('and its value is the modern token', () => {
        const n = selectableOptions(parseFormatSelect()).find(o => /^nassau$/i.test(o.text));
        assert.equal(n.value, 'nassau-modern');
    });

    test('it sits under a visible Player vs player group', () => {
        const g = parseFormatSelect().find(x => x.options.some(o => o.value === 'nassau-modern'));
        assert.ok(g, 'the modern Nassau must live in a group');
        assert.equal(g.hidden, false, 'that group must be visible');
        assert.match(g.label, /player/i);
    });

    test('the four-option legacy group no longer exists at all', () => {
        // OBSOLETE UI CONTRACT. The legacy Nassau editor and its hidden optgroup
        // were retired: a golfer configures Nassau once, in Step 6. Old rounds stay
        // readable, scoreable and settleable - proven in legacy_retirement_test.js -
        // they simply have no deprecated editor. What still matters is asserted here.
        assert.equal(parseFormatSelect().find(x => x.id === 'legacy-format-group'), undefined,
            'nothing can reveal what is not there');
    });

    ['nassau','match','skins','dots'].forEach(f => {
        test(`legacy ${f} is not generally selectable`, () => {
            const vals = selectableOptions(parseFormatSelect()).map(o => o.value);
            assert.ok(!vals.includes(f),
                'legacy ' + f + ' must not be a choice on a normal round');
        });
    });

    test('the normal option list is exactly what a golfer should see', () => {
        assert.deepEqual(selectableOptions(parseFormatSelect()).map(o => o.value),
            ['stroke','stableford','nassau-modern','bestball','scramble','ryder','hilo','wolf','ryder-cup']);
    });
});

// REMOVED: 'AN EXISTING LEGACY ROUND SHOWS ONLY ITS OWN FORMAT'.
// Those tests asserted a dedicated "This round's format" dropdown entry. That
// entry was itself a way of offering the retired format as a CHOICE, which is
// what the retirement removes. Old-round behaviour is now proven where it
// actually lives - data, engine, live presenter and settlement - in
// legacy_retirement_test.js.

describe('A COPIED LEGACY ROUND IS A NEW ROUND', () => {

    test('it normalizes to stroke', () => {
        assert.equal(loadRound('nassau', { asCopy: true }).storedValue, 'stroke');
    });

    test('and carries no legacy-current option', () => {
        const r = loadRound('nassau', { asCopy: true });
        assert.equal(r.currentGroupPresent, false,
            'the copy is not a legacy round, so nothing to represent');
        assert.equal(r.badgeShown, false);
    });

    test('so its modern Nassau is available', () => {
        assert.equal(loadRound('nassau', { asCopy: true }).nassauBlocked, false);
    });
});

describe('THE MODERN SHORTCUT IS UNAFFECTED', () => {

    function modern(stakes) {
        const src = read('admin.html');
        const defaults = ['setup-nassau-front','setup-nassau-back','setup-nassau-overall'].map(id => {
            const m = src.match(new RegExp('id="' + id + '"[^>]*value="([^"]*)"'));
            return { id, value: m ? m[1] : '' };
        });
        const sb = loadHtmlInlineScript('admin.html', DEPS);
        vm.runInContext(`
            alert = function(){};
            collectWizardPlayers = function(){ return ${JSON.stringify(TWO)}; };
            document.getElementById('game-format-select').value = 'nassau-modern';
            handleFormatChange();
            ${JSON.stringify(defaults)}.forEach(function(d){
                var e = document.getElementById(d.id); if (e && !e.value) e.value = d.value; });
            ${stakes ? `
            document.getElementById('setup-nassau-front').value = '${stakes[0]}';
            document.getElementById('setup-nassau-back').value = '${stakes[1]}';
            document.getElementById('setup-nassau-overall').value = '${stakes[2]}';` : ''}
            window.__w = collectSetupNassauWager();
            window.__stored = (function(){
                let g = normalizeGameFormatForSave(document.getElementById('game-format-select').value);
                if (!g) g = 'stroke';
                return g;
            })();
        `, sb);
        const w = vm.runInContext('window.__w', sb);
        return {
            stored: vm.runInContext('window.__stored', sb),
            legacyPanel: vm.runInContext("document.getElementById('nassau-settings').style.display", sb),
            checked: vm.runInContext("document.getElementById('setup-nassau-enabled').checked === true", sb),
            wager: w ? JSON.parse(JSON.stringify(w)) : null,
        };
    }

    test('choosing Nassau normally saves as stroke', () => {
        const r = modern();
        assert.equal(r.stored, 'stroke');
        assert.notEqual(r.stored, 'nassau');
        assert.notEqual(r.stored, 'nassau-modern');
    });

    test('and never opens the legacy Step 4 panel', () => {
        assert.notEqual(modern().legacyPanel, 'block');
    });

    test('Step 6 arrives open at the card defaults', () => {
        const r = modern();
        assert.equal(r.checked, true);
        assert.equal(r.wager.frontStake, 10);
        assert.equal(r.wager.backStake, 10);
        assert.equal(r.wager.overallStake, 20);
    });

    test('the three stakes stay independent', () => {
        const r = modern([10, 10, 50]);
        assert.equal(r.wager.frontStake, 10);
        assert.equal(r.wager.backStake, 10);
        assert.equal(r.wager.overallStake, 50);
    });

    test('it settles once, with no synthetic duplicate', () => {
        const r = settle('stroke', modern().wager);
        assert.equal(r.receipts, 1);
        assert.equal(r.legacyMain, 0);
        assert.equal(r.marty, 40);
        assert.equal(r.sum, 0);
    });
});

describe('MONEY IS UNCHANGED BY ANY OF THIS', () => {

    test('a legacy Nassau still settles exactly as before', () => {
        const r = settle('nassau', null);
        assert.equal(r.receipts, 1);
        assert.equal(r.marty, 40);
        assert.equal(r.sum, 0);
    });

    test('modern and legacy pay the same on equal terms', () => {
        const src = read('admin.html');
        const defaults = ['setup-nassau-front','setup-nassau-back','setup-nassau-overall'].map(id => {
            const m = src.match(new RegExp('id="' + id + '"[^>]*value="([^"]*)"'));
            return { id, value: m ? m[1] : '' };
        });
        const sb = loadHtmlInlineScript('admin.html', DEPS);
        vm.runInContext(`
            alert = function(){};
            collectWizardPlayers = function(){ return ${JSON.stringify(TWO)}; };
            document.getElementById('game-format-select').value = 'nassau-modern';
            handleFormatChange();
            ${JSON.stringify(defaults)}.forEach(function(d){
                var e = document.getElementById(d.id); if (e && !e.value) e.value = d.value; });
            window.__w = collectSetupNassauWager();
        `, sb);
        const w = JSON.parse(JSON.stringify(vm.runInContext('window.__w', sb)));
        assert.equal(settle('stroke', w).marty, settle('nassau', null).marty);
    });

    test('no engine or settlement file was touched', () => {
        ['settlement-engine.js','money-engine.js','pool-engine.js','action-model.js']
            .forEach(f => assert.ok(!read(f).includes('legacy-current-group'),
                f + ' must know nothing about a dropdown'));
    });
});
