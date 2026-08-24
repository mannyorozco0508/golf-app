// ============================================================================
// CONNECTIVITY SAFETY
//
// The rule this file protects, stated once:
//
//   A golfer must never be led to believe a money agreement was recorded when
//   it was not.
//
// Firebase Realtime Database on web buffers a write while disconnected and
// settles the promise only on server acknowledgement. Offline that promise
// never settles at all - so a press produces no PRESS CONFIRMED and no PRESS
// NOT SAVED. Silence. The golfer assumes it took, the in-memory buffer dies on
// the next reload, and a real agreement struck on a tee box vanishes with no
// record that it ever happened.
//
// That is why money writes are refused BEFORE Firebase sees them, and why the
// guard depends on nothing except navigator.onLine.
//
// Scores are treated differently on purpose: they can be re-entered from the
// paper card, so buffering one while the page stays open is a reasonable
// trade. What is not acceptable is implying the server has it, which is what
// the pending-write counter and the pill wording exist to prevent.
//
// The pwa-boot tests run the REAL file in a VM against mock browser globals
// rather than asserting on source strings, because a string assertion passes on
// code that does not work.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = __dirname;
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

// Pull the inline <script> bodies out of a page so they can be inspected as JS
// rather than as HTML soup.
function inlineJs(file) {
    const html = read(file);
    return [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n');
}

// Every manual money write in the app, and the page it lives on. "Manual" is
// the operative word: these are created by a human tapping a button to record
// an agreement, not derived from a score.
const MONEY_WRITE_SITES = [
    { file: 'index.html', fn: 'confirmSidePress', anchor: 'sideMatches/${key}/${node}`).push().key', what: 'side match press from the scorecard' },
    { file: 'index.html', fn: 'savePoolKp', anchor: "kpWinners/h' + hole", what: 'Money Pool KP winner' },
    { file: 'index.html', fn: 'confirmStrokePress', anchor: 'strokePresses/${pushKey}', what: 'stroke press' },
    { file: 'index.html', fn: 'confirmMatchPress', anchor: 'matchPresses/${pushKey}', what: 'match press' },
    { file: 'index.html', fn: 'pressMatchBet', anchor: '.set({ baseId, startHole: nextHole })', what: 'press from View All Action' },
    { file: 'index.html', fn: 'addAction', anchor: 'additionalGameInstances`).push().key', what: 'adding a betting game mid-round' },
    { file: 'index.html', fn: 'saveWolfCall', anchor: 'wolfCalls/h${hole}', what: 'Wolf call' },
    { file: 'index.html', fn: 'saveDots', anchor: 'dots/h${currentDotHole}', what: 'Dots for the hole' },
    { file: 'sidematches.html', fn: 'pressSideMatch', anchor: 'sideMatches/${matchId}/presses`).push().key', what: 'side match press' },
    { file: 'sidematches.html', fn: 'pressSideMatchHole', anchor: 'sideMatches/${matchId}/holePresses`).push().key', what: 'per-hole press' },
    { file: 'sidematches.html', fn: 'pressSideMatchOverall', anchor: 'sideMatches/${matchId}/overallPresses`).push().key', what: 'overall press' },
    // These three are not bets - they are the STAKES the bets are settled at.
    // A buy-in that silently fails to save is the same class of problem as a
    // press that silently fails to save.
    { file: 'skins.html', fn: 'saveBirdieConfig', anchor: 'birdieUnitVal: unitVal', what: 'dollars per birdie' },
    { file: 'skins.html', fn: 'saveSkinsConfig', anchor: 'skinsPotFormat: potFormat', what: 'skins pot format and buy-in' },
    { file: 'skins.html', fn: 'setSkinsCarryOver', anchor: 'skinsCarryOver`).set(val)', what: 'skins carry rule' },
];

// ---------------------------------------------------------------------------

describe('OFFLINE MONEY GUARD - no manual money write may reach Firebase while offline', () => {

    test('every money page defines the guard, and defines it without depending on any other file', () => {
        ['index.html', 'sidematches.html', 'skins.html'].forEach((f) => {
            const js = inlineJs(f);
            assert.match(js, /function requireOnlineForMoney\(/, `${f} has no requireOnlineForMoney().`);
            // The guard must test navigator.onLine directly. Routing it through
            // window.GolfNet would mean a failed pwa-boot.js load silently
            // removes the money check.
            const body = js.slice(js.indexOf('function requireOnlineForMoney('));
            const end = body.indexOf('\n    }');
            const fnBody = body.slice(0, end);
            assert.match(fnBody, /navigator\.onLine === false/, `${f}'s guard must read navigator.onLine directly.`);
            assert.doesNotMatch(fnBody, /GolfNet/, `${f}'s guard must not depend on pwa-boot.js - a money check that disappears when a script 404s is not a money check.`);
        });
    });

    test('every manual money write is guarded before the Firebase call', () => {
        MONEY_WRITE_SITES.forEach((site) => {
            const js = inlineJs(site.file);
            const at = js.indexOf(site.anchor);
            assert.notEqual(at, -1, `Could not locate the ${site.what} write in ${site.file} (anchor: ${site.anchor}). If it moved, this test is no longer checking anything.`);
            // Scan back only as far as the start of the ENCLOSING function.
            //
            // A fixed-size lookbehind is not good enough: these writes sit in
            // small functions packed close together, so a 700-character window
            // routinely reaches into the previous function and finds ITS guard.
            // A dropped guard then still passes, which is exactly the bug this
            // test exists to catch. Bounding at the function boundary means the
            // guard has to be inside the same function as the write.
            const fnStart = js.lastIndexOf('function ', at);
            assert.notEqual(fnStart, -1, `Could not find the function enclosing the ${site.what} write.`);
            const before = js.slice(fnStart, at);
            assert.match(before, /requireOnlineForMoney\(/, `${site.what} (${site.file}) is not guarded inside its own function. Offline this write buffers silently, produces neither a success nor a failure alert, and is lost on the next reload.`);
        });
    });

    test('the refusal wording is explicit about what did NOT happen', () => {
        const idx = inlineJs('index.html');
        const sm = inlineJs('sidematches.html');
        assert.match(idx, /'PRESS NOT SAVED', 'Reconnect before creating a press\.'/);
        assert.match(idx, /'KP NOT SAVED', 'Reconnect before recording the KP\.'/);
        assert.match(sm, /'PRESS NOT SAVED', 'Reconnect before creating a press\.'/);
        assert.match(idx, /You\\'re offline\./, 'The refusal must say why.');
    });

    test('the guard returns false offline and true online, and never throws', () => {
        // Executes the real extracted function rather than trusting the source.
        const js = inlineJs('index.html');
        const start = js.indexOf('function requireOnlineForMoney(');
        const src = js.slice(start, js.indexOf('\n    }', start) + 6);
        const alerts = [];
        const run = (onLine) => {
            const sandbox = { navigator: { onLine }, alert: (m) => alerts.push(m) };
            vm.createContext(sandbox);
            vm.runInContext(src + '\n;globalThis.__r = requireOnlineForMoney("PRESS NOT SAVED","Reconnect before creating a press.");', sandbox);
            return sandbox.__r;
        };
        assert.equal(run(false), false, 'Offline must refuse.');
        assert.equal(alerts.length, 1, 'Offline must tell the golfer.');
        assert.match(alerts[0], /PRESS NOT SAVED/);
        assert.match(alerts[0], /offline/i);
        assert.equal(run(true), true, 'Online must allow the write through.');
        assert.equal(alerts.length, 1, 'Online must not alert.');
        // A browser with no navigator.onLine support must not block play.
        assert.equal(run(undefined), true, 'An unknown connectivity state must fail open, not lock a golfer out of pressing.');
    });

    test('money math files were not touched by any of this', () => {
        ['money-engine.js', 'settlement-engine.js', 'pool-engine.js', 'action-model.js', 'bet-strip.js', 'hole-events.js', 'score-marks.js'].forEach((f) => {
            assert.doesNotMatch(read(f), /requireOnlineForMoney|navigator\.onLine|GolfNet/, `${f} must contain no connectivity logic. Money math does not know or care whether there is signal.`);
        });
    });
});

describe('SCORE WRITES - buffered, but never described as saved', () => {

    test('score writes are handed to the pending-write counter', () => {
        const js = inlineJs('index.html');
        const at = js.indexOf('function saveScore(');
        assert.notEqual(at, -1);
        const body = js.slice(at, at + 2000);
        assert.match(body, /GolfNet\.track\(/, 'saveScore must register its write so the pill can distinguish typed from acknowledged.');
        assert.match(body, /window\.GolfNet &&/, 'Tracking must be optional - a missing pwa-boot.js cannot be allowed to break score entry.');
    });

    test('scores are NOT blocked offline - they are re-creatable from the paper card', () => {
        const js = inlineJs('index.html');
        const at = js.indexOf('function saveScore(');
        const body = js.slice(at, at + 2000);
        assert.doesNotMatch(body, /requireOnlineForMoney/, 'Score entry must keep working through a dropped signal. Blocking it would be worse than the risk it avoids.');
    });

    test('nothing in the app claims a score is saved or synced on a local Firebase event', () => {
        // RTDB fires local events immediately, before the server has seen
        // anything. Treating one as confirmation is the exact failure this wave
        // exists to prevent.
        const boot = read('pwa-boot.js');
        assert.doesNotMatch(boot, /textContent = '[^']*\bSaved\b/, 'The pill must never say "Saved".');
        assert.doesNotMatch(boot, /textContent = '[^']*\bSynced\b/, 'The pill must never say "Synced".');
    });
});

// ---------------------------------------------------------------------------
// pwa-boot runtime
// ---------------------------------------------------------------------------

function loadBoot({ onLine = true, hasSW = true, protocol = 'https:', hostname = 'x.dev', capacitor = undefined, registerImpl, autoBoot = true } = {}) {
    const calls = [];
    const warnings = [];
    const winListeners = {};
    const navigator = { onLine };
    if (hasSW) {
        navigator.serviceWorker = { register: registerImpl || ((s, o) => { calls.push({ script: s, opts: o }); return Promise.resolve({ addEventListener: () => {} }); }) };
    }
    const bodyChildren = [];
    const body = {
        firstChild: null,
        insertBefore: (el) => { bodyChildren.unshift(el); return el; },
    };
    const makeEl = () => ({ style: { cssText: '' }, setAttribute: () => {}, textContent: '', id: '' });
    const sandbox = {
        window: { location: { protocol, hostname }, addEventListener: (t, f) => { (winListeners[t] = winListeners[t] || []).push(f); }, Capacitor: capacitor },
        navigator,
        document: { readyState: autoBoot ? 'complete' : 'loading', body, createElement: makeEl },
        console: { warn: (...a) => warnings.push(a.map(String).join(' ')), info: () => {} },
        module: { exports: {} },
        Promise, Math,
    };
    sandbox.window.navigator = navigator;
    sandbox.window.document = sandbox.document;
    vm.createContext(sandbox);
    vm.runInContext(read('pwa-boot.js'), sandbox);
    return { calls, warnings, winListeners, bodyChildren, api: sandbox.module.exports, net: sandbox.window.GolfNet, nav: navigator };
}

describe('PENDING-WRITE TRACKING', () => {

    test('counts up on write and down only on acknowledgement', async () => {
        const b = loadBoot();
        b.net._reset();
        let ack1, ack2;
        b.net.track(new Promise((r) => { ack1 = r; }));
        b.net.track(new Promise((r) => { ack2 = r; }));
        assert.equal(b.net.state().pending, 2, 'Both writes are in flight.');
        ack1();
        await new Promise((r) => setTimeout(r, 5));
        assert.equal(b.net.state().pending, 1, 'One acknowledged, one still outstanding - a boolean would have cleared here and lied.');
        ack2();
        await new Promise((r) => setTimeout(r, 5));
        assert.equal(b.net.state().pending, 0);
    });

    test('a rejected write also clears - it is no longer in flight either way', async () => {
        const b = loadBoot();
        b.net._reset();
        b.net.track(Promise.reject(new Error('permission denied')).catch(() => {}));
        await new Promise((r) => setTimeout(r, 5));
        assert.equal(b.net.state().pending, 0);
    });

    test('tracking a non-promise does not strand the counter above zero forever', () => {
        const b = loadBoot();
        b.net._reset();
        b.net.track(undefined);
        assert.equal(b.net.state().pending, 0, 'A stuck counter would arm the beforeunload prompt permanently.');
    });

    test('the counter never goes negative', async () => {
        const b = loadBoot();
        b.net._reset();
        const p = Promise.resolve();
        b.net.track(p);
        await new Promise((r) => setTimeout(r, 5));
        await new Promise((r) => setTimeout(r, 5));
        assert.equal(b.net.state().pending, 0);
    });
});

describe('BEFOREUNLOAD - warns only when something is genuinely unacknowledged', () => {

    test('silent when nothing is pending', () => {
        const b = loadBoot();
        b.net._reset();
        const e = { preventDefault: () => {}, returnValue: undefined };
        assert.equal(b.api._onBeforeUnload(e), undefined, 'An always-on prompt gets dismissed reflexively and then means nothing when it matters.');
        assert.equal(e.returnValue, undefined);
    });

    test('warns while a write is outstanding', () => {
        const b = loadBoot();
        b.net._reset();
        b.net.track(new Promise(() => {}));
        const e = { preventDefault: () => {}, returnValue: undefined };
        const msg = b.api._onBeforeUnload(e);
        assert.match(String(msg), /waiting to sync/i);
        assert.match(String(msg), /may lose them/i);
        assert.match(String(e.returnValue), /waiting to sync/i);
    });

    test('the handler is actually wired to the window on boot', () => {
        const b = loadBoot();
        assert.ok(b.winListeners.beforeunload && b.winListeners.beforeunload.length === 1, 'beforeunload must be registered exactly once.');
        assert.ok(b.winListeners.online && b.winListeners.online.length >= 1, 'The pill must react to reconnection.');
        assert.ok(b.winListeners.offline && b.winListeners.offline.length >= 1, 'The pill must react to signal loss.');
    });
});

describe('CONNECTIVITY PILL', () => {

    test('offline says keep the page open, because that is literally the guarantee', () => {
        const b = loadBoot({ onLine: false });
        const pill = b.bodyChildren[0];
        assert.ok(pill, 'The pill should be injected at the top of body.');
        assert.match(pill.textContent, /Offline/);
        assert.match(pill.textContent, /keep this page open/i, 'RTDB has no on-disk queue, so staying on the page IS the guarantee - the wording has to say so.');
    });

    test('offline with pending writes names the count', () => {
        // No _reset() here: it clears the listener list, which is where the
        // pill's own renderer lives. A fresh boot already starts at zero.
        const b = loadBoot({ onLine: false });
        b.net.track(new Promise(() => {}));
        b.net.track(new Promise(() => {}));
        const pill = b.bodyChildren[0];
        assert.match(pill.textContent, /2 changes waiting to sync/);
    });

    test('online and settled shows nothing at all', () => {
        const b = loadBoot({ onLine: true });
        const pill = b.bodyChildren[0];
        assert.equal(pill.style.display, 'none', 'A permanent green badge is noise on a phone held one-handed on a tee box.');
    });

    test('the pill is injected at the top of body, never into the scorecard hierarchy', () => {
        const b = loadBoot({ onLine: false });
        assert.equal(b.bodyChildren.length, 1);
        assert.equal(b.bodyChildren[0].id, 'golfnet-status');
        // The frozen contract: hole header, score boxes, then Prev/Next. The
        // pill sits above all of it, so navigation is never pushed away from
        // score entry.
        const html = read('index.html');
        assert.doesNotMatch(html, /golfnet-status/, 'The pill must not be hand-placed into the scorecard markup.');
    });
});

describe('SERVICE WORKER REGISTRATION - web only', () => {

    test('registers on the web build', () => {
        const b = loadBoot();
        assert.equal(b.calls.length, 1);
        assert.equal(b.calls[0].script, 'sw.js');
        assert.equal(b.calls[0].opts.scope, './');
    });

    test('refuses inside native Capacitor, by API and by protocol', () => {
        assert.equal(loadBoot({ capacitor: { isNativePlatform: () => true } }).calls.length, 0);
        assert.equal(loadBoot({ protocol: 'capacitor:' }).calls.length, 0);
        assert.equal(loadBoot({ capacitor: {} }).calls.length, 0, 'Capacitor present without isNativePlatform should still be treated as native.');
    });

    test('still registers when Capacitor reports a web platform', () => {
        assert.equal(loadBoot({ capacitor: { isNativePlatform: () => false } }).calls.length, 1);
    });

    test('a failing registration never reaches the golfer', async () => {
        const b = loadBoot({ registerImpl: () => Promise.reject(new Error('boom')) });
        await new Promise((r) => setTimeout(r, 5));
        assert.match(b.warnings.join(' '), /app continues normally/);
        const b2 = loadBoot({ registerImpl: () => { throw new Error('sync boom'); } });
        assert.match(b2.warnings.join(' '), /app continues normally/);
    });
});

describe('PWA ACTIVATION - manifest and boot script are wired into the shipped pages', () => {

    const ACTIVATED = ['index.html', 'admin.html', 'sidematches.html', 'skins.html'];

    ACTIVATED.forEach((f) => {
        test(`${f} links the manifest, sets theme-color, and loads pwa-boot.js exactly once`, () => {
            const html = read(f);
            assert.equal((html.match(/rel="manifest"/g) || []).length, 1, `${f} must link the manifest exactly once.`);
            assert.equal((html.match(/name="theme-color"/g) || []).length, 1, `${f} must set theme-color exactly once.`);
            assert.equal((html.match(/src="pwa-boot\.js"/g) || []).length, 1, `${f} must load pwa-boot.js exactly once.`);
            assert.match(html, /content="#0f4c3a"/);
            const head = html.slice(0, html.indexOf('</head>'));
            assert.match(head, /rel="manifest"/, `${f}'s manifest link must be in <head>.`);
        });
    });

    test('the manifest itself is valid and its icons exist', () => {
        const m = JSON.parse(read('manifest.json'));
        assert.equal(m.display, 'standalone');
        assert.ok(m.start_url && m.start_url.length > 0);
        assert.ok(m.icons && m.icons.length >= 2);
        m.icons.forEach((i) => assert.ok(fs.existsSync(path.join(REPO, i.src)), `${i.src} is referenced by the manifest but missing.`));
    });

    test('pwa-boot.js ships in both the offline shell and the native bundle', () => {
        assert.match(read('sw.js'), /'\.\/pwa-boot\.js'/, 'pwa-boot.js must be precached, or the pages that load it break offline.');
        assert.match(read('sync-mobile-web.js'), /'pwa-boot\.js'/, 'pwa-boot.js must ship in the Capacitor bundle, or the native pages 404 on it.');
    });
});
