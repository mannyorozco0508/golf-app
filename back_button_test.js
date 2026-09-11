// ============================================================================
// THE HARDWARE BACK BUTTON CLOSES WHAT IS ON TOP, AND NOTHING ELSE
//
// On Android the app is a single Activity holding one WebView. Capacitor 8 core
// has no back-press code at all; with @capacitor/app installed and no listener,
// a press is "webView.goBack() if there is history, else nothing". Neither of
// those is what a golfer means when they press back with the Dots modal open on
// hole 7 - they mean "close this".
//
// pwa-boot.js owns the press. window.GolfBack is a registry of probes, each
// "is this open?" + "close it", walked in ONE precedence order on every page
// that loads the file:
//
//   P1  a sub-state inside an open modal   -> its own back  (page-registered)
//   P2  a modal overlay on screen          -> close it       (generic, overridable)
//   P3  the ⋯ More popover                 -> close it       (generic)
//   P5  the setup wizard past its first step -> previous step (admin registers)
//   P6  nothing open -> history.back() if the WebView can, else minimizeApp()
//
// P4 - the inline sheets (press panel, add-action, KP entry, hole picker, group
// links, the Cup join panel) - is DEFERRED to a later wave and is not here.
//
// ONE LAYER PER PRESS. The first open probe acts and the walk stops. A press
// that closed the popover AND the modal beneath it would be two taps' worth of
// dismissal for one gesture, and the golfer would not know which they lost.
//
// EVERY TEST OPENS THE LAYER THE WAY A GOLFER DOES - the page's own control,
// pressed through the onclick the page rendered or shipped - and then calls
// GolfBack.press(), which is exactly what the Capacitor listener calls. No open
// function and no close function is named in a test body; the wizard is walked
// with its own Next buttons and the Round Ready screen is reached by pressing
// Save & Start Round.
//
// WHAT MINI-DOM CANNOT PROVE. Whether Capacitor delivers the press at all, what
// canGoBack holds, and that minimizeApp() backgrounds the Activity. Those need
// the emulator. The listener is proven armed against a stand-in
// Capacitor.Plugins.App here; the wiring from a physical key to that listener is
// Capacitor's, not ours. Static overlays are seeded into the tree by
// helpers/load-script.js with their class and id, the same way <select> and
// <details> already are; their inner markup is still a string.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const roster = n => Array.from({ length: n }, (_, i) =>
    ({ id: 101 + i, name: 'Golfer ' + String.fromCharCode(65 + i), hcp: '10' }));
const CODE = 'BK01';

// A golfer's tap: the onclick attribute of a control, found in markup the page
// rendered or shipped, run as the browser would run it.
function tap(sb, markup, pattern) {
    const m = pattern.exec(markup);
    assert.ok(m, 'the control a golfer taps is not in the markup: ' + pattern);
    vm.runInContext('(function () { ' + m[1] + ' }).call({ innerHTML: "" })', sb);
    return m[1];
}
// Every rendered mount on the page, joined - for controls whose mount a test
// should not have to know.
const rendered = sb => [...sb.__elementRegistry.values()].map(e => e.innerHTML || '').join('\n');
const shown = (sb, id) => {
    const el = sb.document.getElementById(id);
    return el.classList.contains('open') || (!!el.style.display && el.style.display !== 'none');
};
const press = (sb, opts) => vm.runInContext('GolfBack.press(' + JSON.stringify(opts || {}) + ')', sb);
const run = (sb, c) => vm.runInContext(c, sb);

// ---- realms, arrived at the way a golfer does --------------------------------
function arrive(sb, data) {
    const hs = sb.__dbHandlers.filter(h => h.event === 'value');
    assert.ok(hs.length > 0, 'the page registered no value handler');
    hs.forEach(h => h.cb({ val: () => data, exists: () => true }));
}

// `format` defaults to stroke play; the Dots tests play Dots, because the Hole
// View dots button is rendered only when the round has a Dots game.
function scorecard(players, format) {
    const sb = loadHtmlInlineScript('index.html', ['pwa-boot.js'], { search: '?game=' + CODE });
    const scores = {};
    (players || roster(4)).forEach(p => CD.forEach(h => { scores['p' + p.id + '_h' + h.hole] = 4; }));
    arrive(sb, { gameFormat: format || 'stroke', players: players || roster(4), courseData: CD, scores,
                 organizerToken: 'tok1' });
    return sb;
}
// Next, seventeen times, through the button the page renders each time, so the
// Finish button appears the way it does on the 18th tee.
function walkToLastHole(sb) {
    for (let i = 0; i < 17; i++) {
        tap(sb, sb.document.getElementById('hole-view-card').innerHTML, /onclick="(goToAdjacentHole\(1\))"/);
    }
    return sb.document.getElementById('hole-view-card').innerHTML;
}

function matches(players, extra) {
    const sb = loadHtmlInlineScript('sidematches.html', ['pwa-boot.js'], { search: '?game=' + CODE });
    run(sb, 'alert = function () {}; confirm = function () { return true; };');
    const data = Object.assign({ gameFormat: 'stroke', players: players || roster(8), courseData: CD,
                                 scores: {} }, extra || {});
    arrive(sb, data);
    return sb;
}

function setup() {
    const sb = loadHtmlInlineScript('admin.html', ['pwa-boot.js'], { search: '?game=' + CODE });
    sb.crypto = require('crypto').webcrypto;
    run(sb, 'alert = function (m) { window.__alerts = (window.__alerts || []).concat([String(m)]); };');
    run(sb, 'window.__writes = []; db.ref = function (p) { return {'
        + ' set: function (v) { window.__writes.push({ p: p, v: v }); return Promise.resolve(); },'
        + ' update: function (v) { window.__writes.push({ p: p, v: v }); return Promise.resolve(); },'
        + ' once: function () { return Promise.resolve({ val: function () { return null; }, exists: function () { return false; } }); },'
        + ' on: function () {}, remove: function () { return Promise.resolve(); },'
        + ' push: function () { return { key: "k", set: function () { return Promise.resolve(); } }; } }; };');
    return sb;
}
const ADMIN = read('admin.html');
const step = sb => run(sb, 'currentWizardStep');
const firstStep = sb => run(sb, 'wizardFirstStep()');
// The organizer's own path from the format step: a format card, a course from the
// dropdown, then Next through the page's own buttons.
function walkWizard(sb, upToStep) {
    tap(sb, ADMIN, /onclick="(selectFormatCard\('stroke'\))"/);
    run(sb, "populateCourseDropdown('Caledonia')");
    const row = sb.document.getElementById('course-dropdown').children.find(c => /Caledonia/.test(c.textContent));
    assert.ok(row, 'the course dropdown offered no Caledonia row');
    row.onclick();
    while (step(sb) < upToStep) {
        const n = step(sb);
        tap(sb, ADMIN, new RegExp('onclick="(wizardNext\\(' + n + '\\))"'));
        assert.ok(step(sb) > n, 'Next did not advance from step ' + n);
    }
}

function trip(withRounds) {
    const sb = loadHtmlInlineScript('trip.html', ['pwa-boot.js']);
    run(sb, 'alert = function () {};');
    if (withRounds) {
        const ps = roster(4).map(p => Object.assign({}, p, { playingForMoney: true }));
        const sc = {}; ps.forEach(p => CD.forEach(h => { sc['p' + p.id + '_h' + h.hole] = 4; }));
        const rd = { players: ps, courseData: CD, scores: sc, settlementMode: 'whole-dollar' };
        run(sb, "currentTripCode = 'MYR1'; tripData = { name: 'Myrtle' };"
            + ' cachedRoundResults = ' + JSON.stringify([{ label: 'Caledonia', countsTowardTrip: true, data: rd }]) + ';'
            + ' cachedCountedResults = cachedRoundResults;'
            + ' renderCumulativeLeaderboard(); renderTripMoneySettlement(); renderTripAwards();');
    }
    return sb;
}
const TRIP = read('trip.html');

// A bare realm holding only pwa-boot.js, with a stand-in for the native runtime.
function bootWith(capacitor) {
    const calls = { listeners: [], back: 0, minimized: 0 };
    const App = capacitor ? {
        addListener: (name, fn) => { calls.listeners.push({ name, fn }); return { remove() {} }; },
        minimizeApp: () => { calls.minimized++; return Promise.resolve(); },
        exitApp: () => { throw new Error('exitApp must not be called'); },
    } : undefined;
    const sandbox = {
        window: { location: { protocol: 'https:', hostname: 'localhost' }, addEventListener() {} },
        navigator: {},
        document: { readyState: 'loading', querySelectorAll: () => [], documentElement: { classList: { add() {} } } },
        history: { back: () => { calls.back++; } },
        console: { warn() {}, info() {} },
        module: { exports: {} },
        Promise,
    };
    if (App) sandbox.window.Capacitor = { isNativePlatform: () => true, Plugins: { App } };
    sandbox.window.navigator = sandbox.navigator;
    sandbox.window.document = sandbox.document;
    sandbox.window.history = sandbox.history;
    vm.createContext(sandbox);
    vm.runInContext(read('pwa-boot.js'), sandbox);
    return { calls, GolfBack: sandbox.window.GolfBack };
}

// ============================================================================
describe('THE MECHANISM', () => {

    // pwa-boot.js used to be `defer` everywhere, which runs it AFTER every inline
    // script - so a page registering a probe at load would have found no GolfBack
    // and, behind an `if (window.GolfBack)` guard, silently registered nothing.
    // The three pages that register load it synchronously, ahead of their own
    // script. The other three register nothing; defer is fine there because the
    // generic probes only need GolfBack to exist before the first tap.
    test('the three registering pages load pwa-boot.js synchronously, before their own script', () => {
        ['index.html', 'admin.html', 'sidematches.html'].forEach(f => {
            const src = read(f);
            const boot = src.indexOf('<script src="pwa-boot.js"></script>');
            const inline = src.indexOf('<script>');
            assert.ok(boot > -1, f + ' loads pwa-boot.js deferred or not at all - its GolfBack.register runs into nothing');
            assert.ok(boot < inline, f + ' loads pwa-boot.js after its own script');
            assert.match(src, /GolfBack\.register\(/, f + ' registers no probe');
        });
        ['settlement.html', 'trip.html', 'skins.html'].forEach(f => {
            assert.match(read(f), /<script src="pwa-boot\.js"/, f + ' does not load pwa-boot.js');
            assert.ok(!/GolfBack\.register\(/.test(read(f)), f + ' registers a probe but loads pwa-boot.js deferred');
        });
    });

    test('window.GolfBack has register and press, and the generic probes are in it', () => {
        const sb = scorecard();
        assert.equal(typeof run(sb, 'GolfBack.register'), 'function');
        assert.equal(typeof run(sb, 'GolfBack.press'), 'function');
        const names = run(sb, 'GolfBack.probes()');
        assert.ok(names.includes('modal'), 'the generic modal probe is missing: ' + names);
        assert.ok(names.includes('popover'), 'the generic popover probe is missing: ' + names);
    });

    test('with no window.Capacitor nothing is armed - the web build is unchanged', () => {
        const sb = scorecard();
        assert.equal(run(sb, 'typeof window.Capacitor'), 'undefined');
        assert.equal(run(sb, 'GolfBack.armed'), false);
        const b = bootWith(null);
        assert.equal(b.GolfBack.armed, false);
        assert.equal(b.calls.listeners.length, 0);
    });

    test('inside the native runtime a backButton listener is armed on Capacitor.Plugins.App', () => {
        const b = bootWith(true);
        assert.equal(b.GolfBack.armed, true);
        assert.deepEqual(b.calls.listeners.map(l => l.name), ['backButton']);
    });

    test('P6: nothing open and history behind -> history.back(); none behind -> minimizeApp(), never exitApp', () => {
        const b = bootWith(true);
        const fire = b.calls.listeners[0].fn;
        fire({ canGoBack: true });
        assert.equal(b.calls.back, 1, 'history.back was not called');
        assert.equal(b.calls.minimized, 0);
        fire({ canGoBack: false });
        assert.equal(b.calls.back, 1);
        assert.equal(b.calls.minimized, 1, 'minimizeApp was not called at the root');
    });

    test('a probe that throws cannot break the press: the walk continues', () => {
        const sb = scorecard();
        run(sb, "GolfBack.register({ name: 'broken', priority: 1, isOpen: function () { throw new Error('x'); }, close: function () {} });");
        tap(sb, read('index.html'), /onclick="(openHistoryModal\(\))"/);
        assert.equal(press(sb), 'modal');
        assert.equal(shown(sb, 'history-modal-overlay'), false);
    });
});

// ============================================================================
describe('P2 - A MODAL CLOSES ON ONE PRESS (index.html)', () => {

    test('History', () => {
        const sb = scorecard();
        tap(sb, read('index.html'), /onclick="(openHistoryModal\(\))"/);
        assert.equal(shown(sb, 'history-modal-overlay'), true, 'the modal did not open');
        assert.equal(press(sb), 'modal');
        assert.equal(shown(sb, 'history-modal-overlay'), false);
    });

    test('Dots, from the Hole View dots button', () => {
        const sb = scorecard(null, 'dots');
        tap(sb, sb.document.getElementById('hole-view-card').innerHTML, /onclick="(openDotsModal\(\d+\))"/);
        assert.equal(shown(sb, 'dots-modal'), true);
        assert.equal(press(sb), 'modal');
        assert.equal(shown(sb, 'dots-modal'), false);
    });

    test('Full Leaderboard, from the live widget', () => {
        const sb = scorecard();
        tap(sb, rendered(sb), /onclick="(openLiveBoard\(\))"/);
        assert.equal(shown(sb, 'live-board-overlay'), true);
        assert.equal(press(sb), 'modal');
        assert.equal(shown(sb, 'live-board-overlay'), false);
    });

    test('Finish Round on its Review state, from the 18th-hole button', () => {
        const sb = scorecard();
        const card = walkToLastHole(sb);
        tap(sb, card, /onclick="(openFinishRoundModal\(\))"/);
        assert.equal(shown(sb, 'finish-round-modal-overlay'), true);
        assert.equal(press(sb), 'modal');
        assert.equal(shown(sb, 'finish-round-modal-overlay'), false);
    });

    test('ONE LAYER PER PRESS: modal above popover - the modal goes, the popover stays', () => {
        const sb = scorecard();
        sb.document.getElementById('nav-more-menu-wrap').open = true;       // the golfer tapped ⋯ More
        tap(sb, read('index.html'), /onclick="(openHistoryModal\(\))"/);
        assert.equal(press(sb), 'modal');
        assert.equal(shown(sb, 'history-modal-overlay'), false);
        assert.equal(sb.document.getElementById('nav-more-menu-wrap').open, true, 'the popover was closed by the same press');
        assert.equal(press(sb), 'popover');
        assert.equal(sb.document.getElementById('nav-more-menu-wrap').open, false);
    });

    test('ONE LAYER PER PRESS: two overlays showing - one press closes exactly one', () => {
        const sb = scorecard(null, 'dots');
        tap(sb, read('index.html'), /onclick="(openHistoryModal\(\))"/);
        tap(sb, sb.document.getElementById('hole-view-card').innerHTML, /onclick="(openDotsModal\(\d+\))"/);
        assert.equal(press(sb), 'modal');
        const still = ['history-modal-overlay', 'dots-modal'].filter(id => shown(sb, id));
        assert.equal(still.length, 1, 'expected exactly one overlay left, got ' + still.length);
        assert.equal(press(sb), 'modal');
        assert.equal(['history-modal-overlay', 'dots-modal'].filter(id => shown(sb, id)).length, 0);
    });
});

// ============================================================================
describe('P1 - FINISH ROUND: a sub-state goes back to Review before the modal closes', () => {

    test('detail -> review -> closed, one press each', () => {
        const sb = scorecard();
        tap(sb, walkToLastHole(sb), /onclick="(openFinishRoundModal\(\))"/);
        tap(sb, sb.document.getElementById('fr-player-list').innerHTML, /onclick="(frOpenPlayer\(\d+\))"/);
        assert.notEqual(run(sb, 'frDetailPlayerId'), null, 'the detail view did not open');
        assert.equal(press(sb), 'finish-round-review');
        assert.equal(run(sb, 'frDetailPlayerId'), null, 'detail did not return to review');
        assert.equal(shown(sb, 'finish-round-modal-overlay'), true, 'the first press closed the whole modal');
        assert.equal(press(sb), 'modal');
        assert.equal(shown(sb, 'finish-round-modal-overlay'), false);
    });

    test('results -> review -> closed', () => {
        const sb = scorecard();
        tap(sb, walkToLastHole(sb), /onclick="(openFinishRoundModal\(\))"/);
        tap(sb, rendered(sb) + read('index.html'), /onclick="(frShowResults\(false\))"/);
        assert.equal(sb.document.getElementById('fr-state-results').style.display, '', 'results did not show');
        assert.equal(press(sb), 'finish-round-review');
        assert.equal(sb.document.getElementById('fr-state-results').style.display, 'none');
        assert.equal(shown(sb, 'finish-round-modal-overlay'), true);
        assert.equal(press(sb), 'modal');
        assert.equal(shown(sb, 'finish-round-modal-overlay'), false);
    });
});

// ============================================================================
describe('P3 - THE ⋯ MORE POPOVER', () => {
    ['settlement.html', 'skins.html', 'index.html', 'sidematches.html'].forEach(f => {
        test(f + ': open popover closes; a closed one is not a layer', () => {
            const sb = loadHtmlInlineScript(f, ['pwa-boot.js'], { search: '?game=' + CODE });
            const d = sb.document.getElementById('nav-more-menu-wrap');
            assert.equal(d.open, false, 'the popover starts open in the markup');
            assert.equal(press(sb), 'none', 'a closed popover was treated as a layer');
            d.open = true;
            assert.equal(press(sb), 'popover');
            assert.equal(d.open, false);
        });
    });
});

// ============================================================================
describe('sidematches.html', () => {

    test('P1: New Action owner step -> scope step; then the modal closes', () => {
        const sb = matches(roster(8));
        tap(sb, read('sidematches.html'), /onclick="(openSideMatchModal\(\))"/);
        assert.equal(shown(sb, 'sidematch-modal'), true);
        tap(sb, read('sidematches.html'), /onclick="(pickActionScope\('group'\))"/);
        assert.equal(sb.document.getElementById('sm-owner-step').style.display, 'block', 'the owner step did not show');
        assert.equal(press(sb), 'new-action-scope');
        assert.equal(sb.document.getElementById('sm-scope-step').style.display, 'block');
        assert.equal(sb.document.getElementById('sm-owner-step').style.display, 'none');
        assert.equal(shown(sb, 'sidematch-modal'), true, 'the step-back closed the modal');
        assert.equal(press(sb), 'modal');
        assert.equal(shown(sb, 'sidematch-modal'), false);
    });

    test('the FORM step closes the modal (no Back exists on that screen, so back does not invent one)', () => {
        const sb = matches(roster(8));
        tap(sb, read('sidematches.html'), /onclick="(openSideMatchModal\(\))"/);
        tap(sb, read('sidematches.html'), /onclick="(pickActionScope\('cross'\))"/);
        assert.equal(sb.document.getElementById('sm-form-step').style.display, 'block');
        assert.equal(press(sb), 'modal');
        assert.equal(shown(sb, 'sidematch-modal'), false);
        assert.equal(sb.document.getElementById('sm-scope-step').style.display, 'none', 'back moved to the scope step instead of closing');
    });

    test('single-group round: the modal opens on the form and one press closes it', () => {
        const sb = matches(roster(4));
        tap(sb, read('sidematches.html'), /onclick="(openSideMatchModal\(\))"/);
        assert.equal(sb.document.getElementById('sm-form-step').style.display, 'block');
        assert.equal(press(sb), 'modal');
        assert.equal(shown(sb, 'sidematch-modal'), false);
    });

    const SM = { sm1: { format: 'match', stake: 10, teamA: [101], teamB: [102], scope: 'group', ownerGroup: 1, startHole: 1 } };

    test('P2 override: the delete confirm closes AND pendingDeleteMatchId is cleared', () => {
        const sb = matches(roster(4), { sideMatches: SM });
        tap(sb, rendered(sb), /onclick="(deleteSideMatch\('sm1'\))"/);
        assert.equal(shown(sb, 'sidematch-delete-modal'), true, 'the delete confirm did not open');
        assert.equal(run(sb, 'pendingDeleteMatchId'), 'sm1');
        assert.equal(press(sb), 'modal');
        assert.equal(shown(sb, 'sidematch-delete-modal'), false);
        assert.equal(run(sb, 'pendingDeleteMatchId'), null, 'the pending id survived the press - the next Delete would remove the wrong match');
    });

    test('P2: the Any Group auto-pair preview closes', () => {
        const sb = matches(roster(8));
        tap(sb, rendered(sb) + read('sidematches.html'), /onclick="(openAutoPairModal\(\))"/);
        assert.equal(shown(sb, 'autopair-modal'), true);
        assert.equal(press(sb), 'modal');
        assert.equal(shown(sb, 'autopair-modal'), false);
    });

    test('NOT A LAYER: the Cup draft stays open - back never discards a half-built Cup', () => {
        const sb = matches(roster(8));
        tap(sb, rendered(sb), /onclick="(rcOpen\(\))"/);
        assert.equal(run(sb, 'rcDraft && rcDraft.__open'), true, 'the Cup editor did not open');
        assert.equal(press(sb), 'none');
        assert.equal(run(sb, 'rcDraft && rcDraft.__open'), true, 'the press discarded the Cup draft');
    });
});

// ============================================================================
describe('admin.html', () => {

    test('P5: the FIRST step does not step back', () => {
        const sb = setup();
        assert.equal(step(sb), firstStep(sb));
        assert.equal(press(sb), 'none');
        assert.equal(step(sb), firstStep(sb));
    });

    test('P5: a later step goes to the previous one, through the same neighbour rule as the Back button', () => {
        const sb = setup();
        walkWizard(sb, 5);
        assert.equal(step(sb), 5);
        assert.equal(press(sb), 'wizard-step');
        assert.equal(step(sb), 2, 'stroke play has no Format Settings, so back from Players is Round Length');
        assert.equal(press(sb), 'wizard-step');
        assert.equal(step(sb), 1);
        assert.equal(press(sb), 'wizard-step');
        assert.equal(step(sb), firstStep(sb));
        assert.equal(press(sb), 'none', 'the first step stepped back');
    });

    test('P2: the Paste Player List modal (class open) closes; the wizard does not move on the same press', async () => {
        const sb = setup();
        walkWizard(sb, 5);
        tap(sb, ADMIN, /onclick="(openPastePlayersModal\(\))"/);
        assert.equal(shown(sb, 'paste-players-modal'), true);
        assert.equal(press(sb), 'modal');
        assert.equal(shown(sb, 'paste-players-modal'), false);
        assert.equal(step(sb), 5, 'closing the modal also stepped the wizard back');
    });

    test('Round Ready, reached by pressing Save & Start Round, does NOT go back to the wizard', async () => {
        const sb = setup();
        walkWizard(sb, 7);
        tap(sb, ADMIN, /onclick="(saveSettings\(\))"/);
        await new Promise(r => setTimeout(r, 30));
        assert.deepEqual(JSON.parse(run(sb, 'JSON.stringify(window.__alerts || [])')), []);
        assert.equal(sb.document.getElementById('round-ready-screen').style.display, 'block', 'Save did not land on Round Ready');
        assert.equal(press(sb), 'none');
        assert.equal(sb.document.getElementById('round-ready-screen').style.display, 'block');
        assert.equal(sb.document.getElementById('admin-screen').style.display, 'none', 'the wizard came back');
    });

    test('NOT A LAYER: the Nassau and Main Pool checkbox panels stay open and ticked', () => {
        const sb = setup();
        walkWizard(sb, 6);
        const nas = sb.document.getElementById('setup-nassau-enabled'); nas.checked = true;
        tap(sb, ADMIN, /id="setup-nassau-enabled"[^>]*onchange="(toggleSetupNassau\(\))"/);
        const mp = sb.document.getElementById('mp-enabled'); mp.checked = true;
        tap(sb, ADMIN, /id="mp-enabled"[^>]*onchange="(mpToggle\(\))"/);
        assert.equal(sb.document.getElementById('setup-nassau-panel').style.display, 'block');
        assert.equal(sb.document.getElementById('mp-panel').style.display, 'block');
        assert.equal(press(sb), 'wizard-step', 'on step 6 a press is a wizard step back');
        assert.equal(sb.document.getElementById('setup-nassau-panel').style.display, 'block', 'the Nassau panel was closed');
        assert.equal(sb.document.getElementById('mp-panel').style.display, 'block', 'the Main Pool panel was closed');
        assert.equal(nas.checked, true); assert.equal(mp.checked, true);
    });
});

// ============================================================================
describe('trip.html', () => {

    test('P2: the recap overlay closes', () => {
        const sb = trip(true);
        tap(sb, TRIP, /onclick="(openTripRecap\(\))"/);
        assert.equal(shown(sb, 'trip-recap-overlay'), true, 'the recap did not open');
        assert.equal(press(sb), 'modal');
        assert.equal(shown(sb, 'trip-recap-overlay'), false);
    });

    test('NOT A LAYER: the Start a New Trip form stays open', () => {
        const sb = trip(false);
        tap(sb, TRIP, /onclick="(showCreateTripForm\(\))"/);
        assert.equal(sb.document.getElementById('create-trip-form').style.display, 'block');
        assert.equal(press(sb), 'none');
        assert.equal(sb.document.getElementById('create-trip-form').style.display, 'block');
    });
});

// ============================================================================
describe('NOTHING OPEN - the press falls through and touches nothing', () => {

    test('a fresh scorecard: Hole View stays Hole View, accordions and the action center are untouched', () => {
        const sb = scorecard();
        const before = {
            mode: run(sb, 'currentViewMode'),
            action: run(sb, 'actionCenterOpen'),
            breakdown: sb.document.getElementById('detailed-breakdown-wrapper').open,
            hole: run(sb, 'currentViewedHole'),
        };
        assert.equal(before.mode, 'hole');
        assert.equal(press(sb), 'none');
        assert.deepEqual({
            mode: run(sb, 'currentViewMode'),
            action: run(sb, 'actionCenterOpen'),
            breakdown: sb.document.getElementById('detailed-breakdown-wrapper').open,
            hole: run(sb, 'currentViewedHole'),
        }, before);
    });

    test('Full Card, chosen with its own button, is a mode and stays', () => {
        const sb = scorecard();
        tap(sb, read('index.html'), /id="view-mode-full-btn"[^>]*onclick="(setViewMode\('full'\))"/);
        assert.equal(run(sb, 'currentViewMode'), 'full');
        assert.equal(press(sb), 'none');
        assert.equal(run(sb, 'currentViewMode'), 'full');
    });

    test('an open accordion is not closed by a press', () => {
        const sb = scorecard();
        sb.document.getElementById('detailed-breakdown-wrapper').open = true;
        assert.equal(press(sb), 'none');
        assert.equal(sb.document.getElementById('detailed-breakdown-wrapper').open, true);
    });
});
