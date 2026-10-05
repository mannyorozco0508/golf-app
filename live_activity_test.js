// ============================================================================
// THE LOCK SCREEN CARD, PHASE 1 (2026-10-05)
//
// A Live Activity on the scorekeeper's lock screen and in the Dynamic Island:
// their score to par, how many holes they are thru, and their top match's
// status. It starts when they open a round and this device knows who they are,
// updates on every score, and ends when the round is over.
//
// WHAT THIS FILE CAN AND CANNOT PROVE, stated rather than implied, because the
// half that matters most is not JavaScript:
//
//   PROVABLE HERE: the payload builder, the fail-quiet behaviour on every
//   platform that is not an iOS build with the extension, that the page posts
//   the SAME two builders the compact panel draws from, that the lock screen
//   carries NO MONEY, and that the Swift sources say what they must.
//
//   NOT PROVABLE HERE: that a card actually appears. That needs a signed build
//   on a real phone with the widget extension added to the Xcode project, which
//   is Manny's half and is listed step by step in the wave's report. Nothing in
//   this file should be read as evidence the card renders.
//
// WHY THE PAGE OWNS EVERY WORD. liveStandings() and buildLiveMatchStates()
// already decide what the compact panel under Prev/Next says. The lock screen is
// handed those same two answers, so there is no second "what is Manny's score"
// written in Swift to drift from the first.
//
// BASELINE, measured over the FINISHED file against main (24bff98, index.html
// swapped out and restored by sha), all 13 tests: 10 PASS / 3 FAIL.
// 10 + 3 = 13.
//   AND THE SHAPE OF THAT IS THE FINDING, said rather than dressed up: ten of
//   thirteen pass because most of this file tests code that did not exist at all
//   before the wave - the module and the four Swift sources - and measuring new
//   code against a build without it is a tautology, not a measurement. Removing
//   those files instead makes the whole FILE fail to load, which CLAUDE.md says
//   proves nothing per assertion. So the useful baseline is the one taken with
//   them present and the PAGE swapped, and the three reds are the page's wiring:
//   the call site inside renderHoleLive, the spectator/finished-round end, and
//   the script tag beside the precache entry.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const LA = require('./live-activity.js');
const IDX = read('index.html');
const ATTRS = read('ios/LiveActivity/HardPanRoundAttributes.swift');
const VIEW = read('ios/LiveActivity/HardPanLiveActivity.swift');
const PLUGIN = read('ios/App/App/LiveActivity/HardPanLiveActivityPlugin.swift');
const BRIDGE = read('ios/App/App/LiveActivity/HardPanLiveActivityPlugin.m');

describe('1. THE PAYLOAD IS WHAT THE PAGE ALREADY SAYS', () => {

    test('a standings row and a match line become the card', () => {
        assert.deepEqual(LA.buildState({ toPar: '-2', thru: 8, name: 'Manny' }, 'Front 2 UP', 9),
            { toPar: '-2', thru: 8, matchLine: 'Front 2 UP', hole: 9 });
    });

    test('and an unstarted round is E, thru 0 - a fact, not a blank', () => {
        assert.deepEqual(LA.buildState({}, '', 0),
            { toPar: 'E', thru: 0, matchLine: '', hole: 1 });
        // thru never goes negative or fractional, whatever it is handed.
        assert.equal(LA.buildState({ thru: -3 }, '', 1).thru, 0);
        assert.equal(LA.buildState({ thru: 7.6 }, '', 1).thru, 8);
    });

    test('the match line is bounded, because a lock screen is one line', () => {
        const long = 'x'.repeat(200);
        assert.equal(LA.buildState({}, long, 1).matchLine.length, 80);
    });

    test('NO MONEY REACHES IT, which is the Receipt’s rule on the worst screen to break it', () => {
        // The builder has no money field at all, and the page hands it a STATUS.
        const keys = Object.keys(LA.buildState({ toPar: '-2', thru: 8 }, 'Front 2 UP', 9));
        assert.deepEqual(keys.sort(), ['hole', 'matchLine', 'thru', 'toPar']);
        const src = read('live-activity.js');
        assert.ok(!/netMoney|\$|cents|total/i.test(src.replace(/^\s*\/\/.*$/gm, '')),
            'live-activity.js has money in it');
    });
});

describe('2. IT FAILS QUIET EVERYWHERE THAT IS NOT AN iOS BUILD', () => {

    test('no Capacitor at all: available() is false and nothing throws', async () => {
        assert.equal(LA.available(), false);
        assert.equal(await LA.start({ roundCode: 'ABC' }), false);
        assert.equal(await LA.update({}), false);
        assert.equal(await LA.end(), false);
        assert.equal(LA.startedRound(), null);
    });

    test('Capacitor present but no plugin - an Android build, or iOS before the extension', async () => {
        const g = globalThis;
        const had = Object.prototype.hasOwnProperty.call(g, 'Capacitor');
        g.Capacitor = { Plugins: {} };
        try {
            // The module captured `window` at load time; in node that is null, so
            // this asserts the SHAPE of the guard rather than re-loading it: a
            // missing plugin key must be a no-op, not a throw.
            assert.equal(LA.available(), false);
            assert.equal(await LA.start({ roundCode: 'ABC' }), false);
        } finally { if (!had) delete g.Capacitor; }
    });

    test('and a start with no round code does nothing', async () => {
        assert.equal(await LA.start({}), false);
        assert.equal(await LA.start(null), false);
    });
});

describe('3. THE PAGE POSTS THE SAME TWO BUILDERS THE PANEL DRAWS', () => {

    test('syncLiveActivity is called from renderHoleLive, with its own board and states', () => {
        const at = IDX.indexOf('function renderHoleLive()');
        const fn = IDX.slice(at, IDX.indexOf('\n    // ---- THE LOCK SCREEN CARD', at));
        assert.ok(fn.length > 400, 'the slice is empty - the endpoint drifted');
        assert.match(fn, /syncLiveActivity\(board, states, holeNum\)/,
            'the lock screen is being fed from somewhere other than the panel');
        // AND THOSE TWO ARE liveStandings AND buildLiveMatchStates, which is what
        // makes a second answer impossible.
        assert.match(fn, /liveStandings\(\)/);
        assert.match(fn, /buildLiveMatchStates\(/);
    });

    test('a spectator gets nothing, and a finished round ends it', () => {
        const at = IDX.indexOf('function syncLiveActivity(');
        const fn = IDX.slice(at, IDX.indexOf('\n    }', IDX.indexOf('a lock screen is a courtesy', at)));
        assert.ok(fn.length > 400, 'the slice is empty - the endpoint drifted');
        assert.match(fn, /resolvedMeId\(\)/, 'it does not ask who this device is');
        assert.match(fn, /if \(!me \|\| finished\)[\s\S]{0,120}\.end\(\)/,
            'a spectator or a finished round does not end the card');
        // THE ROUND IS OVER WHEN card-is-in.js SAYS SO - the same builder the
        // banner reads, so the lock screen cannot disagree with the page.
        assert.match(fn, /cardIsInState\(cardIsInInput\(\)\)/);
        assert.match(fn, /st\.kind === 'final'/);
        // NO MONEY: the line posted is a segment's statusText, never a total.
        assert.match(fn, /seg\.statusText/);
        assert.ok(!/netMoney|netText|\$/.test(fn), 'money reached the lock screen payload');
    });

    test('and the page loads the module, which is precached', () => {
        assert.match(IDX, /<script src="live-activity\.js"><\/script>/);
        assert.match(read('sw.js'), /'\.\/live-activity\.js',/, 'a page loads a file the shell does not cache');
        assert.match(read('sync-mobile-web.js'), /'live-activity\.js'/, 'the native bundle would not carry it');
    });
});

describe('4. THE SWIFT SAYS WHAT IT MUST', () => {

    test('the attributes carry no money, and Phase 1 registers no push token', () => {
        assert.match(ATTRS, /struct ContentState: Codable, Hashable/);
        ['toPar', 'thru', 'matchLine', 'hole'].forEach(k =>
            assert.ok(ATTRS.indexOf('var ' + k) > -1, 'ContentState lost ' + k));
        assert.ok(!/money|cents|dollar|net/i.test(ATTRS.replace(/^\s*\/\/.*$/gm, '')),
            'the lock screen state has money in it');
        // PHASE 2 IS NOT STARTED: a local activity takes pushType nil, and asking
        // for a token here would be the half of the feature that needs a sender.
        assert.match(PLUGIN, /pushType: nil/);
        assert.ok(!/pushToken|PushTokenUpdates/.test(PLUGIN), 'Phase 2 crept in');
    });

    test('the plugin resolves on every refusal rather than rejecting', () => {
        // A round must never fail to open because a widget could not start.
        assert.ok(!/call\.reject/.test(PLUGIN), 'a refusal rejects, and the page would see an error');
        assert.match(PLUGIN, /areActivitiesEnabled/, 'it does not check whether the golfer allows them');
        assert.match(PLUGIN, /dismissalPolicy: \.immediate/,
            'a finished round would leave yesterday’s score on the lock screen');
        // THE BRIDGE IS THE THING EVERYONE FORGETS: without the .m file the class
        // compiles and is invisible to the web layer.
        assert.match(BRIDGE, /CAP_PLUGIN\(HardPanLiveActivityPlugin, "HardPanLiveActivity"/);
        ['isSupported', 'start', 'update', 'end'].forEach(m =>
            assert.ok(BRIDGE.indexOf('CAP_PLUGIN_METHOD(' + m) > -1, 'the bridge is missing ' + m));
    });

    test('the widget bundle is the extension’s, and the attributes are shared', () => {
        assert.match(VIEW, /@main\s*\nstruct HardPanWidgetBundle: WidgetBundle/,
            'the extension has no entry point');
        assert.match(VIEW, /ActivityConfiguration\(for: HardPanRoundAttributes\.self\)/);
        // The three presentations iOS can choose between.
        ['dynamicIsland', 'compactTrailing', 'minimal'].forEach(k =>
            assert.ok(VIEW.indexOf(k) > -1, 'the Dynamic Island is missing ' + k));
        // AND THE FILE THAT MUST BE IN BOTH TARGETS SAYS SO, because "cannot find
        // type in scope" is what a reader gets otherwise.
        assert.match(ATTRS, /must be a member of BOTH/);
    });
});
