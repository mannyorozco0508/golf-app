// ============================================================================
// SAVE & START ROUND WITH NO SOCKET TELLS THE TRUTH.
//
// MEASURED 2026-09-14 (cold Chrome, network cut at the browser, real SDK):
// tapping Save & Start Round offline held the button on "⏳ Saving..." for as
// long as the page lived; the update() promise never settles until a server
// response, and the SDK has no client-side timeout. But the write is NOT lost:
// with the page still open it landed 2.5 s after the network came back and
// the page finished normally (Round Ready, button restored). On a reload before
// that, the round was gone - and because the round save was tracked by nothing,
// the native app showed no pill and raised no reload warning: the round died
// silently.
//
// THE RULE.
//   TRACKED. The whole save chain - the round update and, on a trip round, the
//   trips/<trip>/rounds/<code> put it returns into - goes through
//   GolfNet.track(), so a buffered save is counted by the pill ("Waiting to
//   sync", "keep this page open") and by the beforeunload guard, on the web and
//   in the native shell alike.
//   HONEST BUTTON. "⏳ Saving..." for SAVE_SLOW_MS (3 s), then "⏳ Still saving
//   — keep this page open." The button stays disabled: the write is in flight
//   and a second tap must not double-write. A fast ack never shows the second
//   state; an ack after the threshold still restores the button and shows
//   Round Ready; a server rejection still alerts and restores.
//   NEVER "nothing was saved" while the SDK holds the promise. The read
//   timeouts (v131/v132) may say it - a read that never answers did nothing; a
//   buffered write is a promise the SDK intends to keep.
//   NOT navigator.onLine. Measured true throughout offline. The threshold is a
//   timer; the state is "not acked yet", not "offline".
//
// WHAT THE HARNESS PROVES. The page's own saveSettings, driven to the write
// with the minimum setup (a preset course), against a db whose update() is
// controlled: hung, acked after N ms, or rejected. Real timers, real threshold
// (3 s) - these rows take seconds on purpose; a shortened constant would test
// a different page. The pill text and the guard's answer are pwa-boot's own.
// Pixels and the real SDK are the probe's job (the report carries them).
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { decodeEscapes } = require('./helpers/decode-escapes.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ADMIN = read('admin.html');
const SLOW_MS = Number((ADMIN.match(/const SAVE_SLOW_MS = (\d+);/) || [])[1]) || 3000;   // 3000 until the page defines it (RED first)
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// A page at the wizard with a preset course chosen, whose db update() behaves
// as told: { ack: ms } resolves after ms, { reject: ms } rejects after ms,
// {} hangs. Reads hang (beforeRun), so the arrival loader adds nothing.
function pageReadyToSave(opts) {
    const o = opts || {};
    const sb = loadHtmlInlineScript('admin.html', ['pwa-boot.js'], {
        search: '?game=SAVE01' + (o.trip ? '&trip=TRIP01' : ''),
        beforeRun: (sandbox) => {
            sandbox.db.ref = () => ({ once: () => new Promise(() => {}), on: () => {}, set: () => Promise.resolve(), update: () => Promise.resolve(), push: () => ({ key: 'K1' }) });
        }
    });
    vm.runInContext(`
        window.__alerts = []; window.alert = function (m) { window.__alerts.push(String(m)); };
        window.__updates = []; window.__sets = []; window.__setsResolve = {};
        window.crypto = { getRandomValues: function (a) { for (var i = 0; i < a.length; i++) a[i] = (i * 37) & 255; return a; } };
        db.ref = function (p) { return {
            once: function () { return new Promise(function () {}); }, on: function () {},
            push: function () { return { key: 'K1' }; },
            update: function (v) { window.__updates.push(p); return new Promise(function (res, rej) {
                var o = ${JSON.stringify(o)};
                if (o.ack !== undefined) setTimeout(res, o.ack);
                else if (o.reject !== undefined) setTimeout(function () { rej(new Error('permission_denied')); }, o.reject);
            }); },
            set: function (v) { window.__sets.push(p); return new Promise(function (res) { window.__setsResolve[p] = res; ${o.tripAck !== undefined ? 'setTimeout(res, ' + o.tripAck + ');' : ''} }); }
        }; };
        ${o.native ? "document.documentElement.classList.add('is-native');" : ''}
        var key = Object.keys(coursePresets)[0];
        courseHiddenSelect.value = key; courseSearchInput.value = coursePresets[key].name;
        window.__btn = document.getElementById('main-save-btn'); window.__btn.innerText = '\uD83D\uDCBE Save & Start Round';   // the markup's label; mini-dom parses none
        window.__btnState = function () { return { text: window.__btn.innerText, disabled: window.__btn.disabled }; };
        window.__pill = function () { var el = document.getElementById('golfnet-status'); return el ? el.textContent : null; };
    `, sb);
    return sb;
}
const S = (sb) => sb.window.__btnState();
const save = (sb) => vm.runInContext('saveSettings(); window.__btnState()', sb);

describe('THE THRESHOLD is a named constant the page reads', () => {
    test('SAVE_SLOW_MS exists and is between 2 and 5 seconds', () => {
        assert.ok(SLOW_MS >= 2000 && SLOW_MS <= 5000, 'SAVE_SLOW_MS = ' + SLOW_MS);
    });
});

describe('TRACKED: a buffered save is counted by the pill and the guard, on both builds', () => {
    test('web: the save chain is under GolfNet - pending 1 while buffered, the pill says waiting to sync / keep this page open', { timeout: 4000 }, async () => {
        const sb = pageReadyToSave({});
        assert.equal(sb.window.GolfNet.state().pending, 0, 'nothing pending before the tap');
        const s0 = save(sb);
        assert.equal(JSON.stringify(sb.window.__updates), JSON.stringify(['events/SAVE01']), 'the round write was issued');
        assert.equal(sb.window.GolfNet.state().pending, 1, 'the save is tracked');
        // The pill's wording for pending > 0 is pwa-boot's; boot() (which wires
        // renderPill to the counter) runs on window load, which the harness does
        // not fire, so the sentence is pinned at its source here and read for real
        // in the Chrome probe: "🟡 Waiting to sync (1)…" / "keep this page open".
        const boot = read('pwa-boot.js');
        assert.match(boot, /Waiting to sync \(' \+ s\.pending \+ '\)/);
        assert.match(boot, /waiting to sync\. Keep this page open\./);
    });
    test('native shell: the same - the round save is tracked even though the course publish is a no-op there', { timeout: 4000 }, async () => {
        const sb = pageReadyToSave({ native: true });
        save(sb);
        assert.equal(sb.window.GolfNet.state().pending, 1);
        assert.ok(!sb.window.__updates.some(p => /global_courses/.test(p)), 'no publish natively: ' + JSON.stringify(sb.window.__updates));
    });
    test('the guard: with a tracked write pending, beforeunload answers with pwa-boot\'s own warning', () => {
        // pwa-boot.js in node exposes the guard and the counter it reads. The row
        // above proves the save increments that counter; this proves the counter
        // is what the guard reads - so a buffered save raises the reload warning.
        const boot = require(path.join(REPO_ROOT, 'pwa-boot.js'));
        boot.GolfNet._reset();
        assert.equal(boot._onBeforeUnload({}), undefined, 'nothing pending: no warning');
        boot.GolfNet.track(new Promise(() => {}));
        const msg = boot._onBeforeUnload({});
        assert.match(String(msg), /waiting to sync|may lose them/i, 'the guard fires: ' + msg);
        boot.GolfNet._reset();
    });
    test('a trip round: the chain that is tracked includes the trips put - pending stays 1 until the trips set acks', { timeout: 4000 }, async () => {
        const sb = pageReadyToSave({ trip: true, ack: 30 });
        save(sb);
        await wait(120);
        assert.equal(JSON.stringify(sb.window.__sets), JSON.stringify(['trips/TRIP01/rounds/SAVE01']), 'the trips put followed the ack');
        assert.equal(sb.window.GolfNet.state().pending, 1, 'still pending: the round acked, the trips put has not');
        assert.equal(S(sb).text, '⏳ Saving...', 'and the button still says saving');
        vm.runInContext("window.__setsResolve['trips/TRIP01/rounds/SAVE01']()", sb);
        await wait(50);
        assert.equal(sb.window.GolfNet.state().pending, 0, 'settled once both acked');
        assert.equal(S(sb).disabled, false);
    });
    test('the track wraps the promise the .then chain continues from (source pin)', () => {
        const at = ADMIN.indexOf('function saveSettings(');
        const fn = ADMIN.slice(at, ADMIN.indexOf('\n    function ', at + 30));
        assert.match(fn, /const saveChain = db\.ref\(`events\/\$\{currentMode\}`\)\.update\(payload\)\.then\(/);
        assert.match(fn, /GolfNet\.track\(saveChain\)/);
        assert.match(fn, /saveChain\.then\(\(\) => \{/);
    });
});

describe('HONEST BUTTON: Saving..., then Still saving - keep this page open; disabled throughout', () => {
    test('buffered: "Saving..." before the threshold, the honest state after it, disabled both times, no alert, no Round Ready', { timeout: SLOW_MS + 3000 }, async () => {
        const sb = pageReadyToSave({});
        const s0 = save(sb);
        assert.equal(JSON.stringify(s0), JSON.stringify({ text: '⏳ Saving...', disabled: true }));
        await wait(SLOW_MS - 500);
        assert.equal(JSON.stringify(S(sb)), JSON.stringify({ text: '⏳ Saving...', disabled: true }), 'not before the threshold');
        await wait(800);
        const s1 = S(sb);
        assert.equal(s1.disabled, true, 'STILL disabled - the write is in flight');
        assert.match(s1.text, /Still saving/i); assert.match(s1.text, /keep this page open/i);
        assert.equal(sb.window.__alerts.length, 0, 'no alert: nothing has failed');
        assert.notEqual(sb.document.getElementById('round-ready-screen').style.display, 'block', 'no Round Ready');
    });
    test('a fast ack (100 ms) never shows the honest state: restored and Round Ready, and the threshold timer is cleared', { timeout: SLOW_MS + 3000 }, async () => {
        const sb = pageReadyToSave({ ack: 100 });
        save(sb);
        await wait(250);
        assert.equal(S(sb).disabled, false, 'restored on ack');
        assert.equal(sb.document.getElementById('round-ready-screen').style.display, 'block');
        await wait(SLOW_MS + 200);
        assert.ok(!/Still saving/.test(S(sb).text), 'the threshold timer must not fire after the ack: ' + S(sb).text);
    });
    test('an ack AFTER the threshold still restores the button and shows Round Ready', { timeout: SLOW_MS + 4000 }, async () => {
        const sb = pageReadyToSave({ ack: SLOW_MS + 800 });
        save(sb);
        await wait(SLOW_MS + 300);
        assert.match(S(sb).text, /Still saving/, 'the honest state was shown');
        await wait(900);
        const s = S(sb);
        assert.equal(s.disabled, false, 'restored on the late ack');
        assert.equal(s.text, '💾 Save & Start Round');
        assert.equal(sb.document.getElementById('round-ready-screen').style.display, 'block', 'Round Ready');
        assert.equal(sb.window.GolfNet.state().pending, 0);
        assert.equal(sb.window.__alerts.length, 0);
    });
    test('a server rejection (after the threshold) still alerts "Save error" and restores', { timeout: SLOW_MS + 4000 }, async () => {
        const sb = pageReadyToSave({ reject: SLOW_MS + 300 });
        save(sb);
        await wait(SLOW_MS + 800);
        assert.equal(S(sb).disabled, false);
        assert.equal(sb.window.__alerts.length, 1);
        assert.match(sb.window.__alerts[0], /Save error: permission_denied/);
        assert.equal(sb.window.GolfNet.state().failed, 1, 'the pill counts the failure');
    });
});

describe('NO COPY ON THE SAVE PATH SAYS NOTHING WAS SAVED, and nothing gates on navigator.onLine', () => {
    test('saveSettings, decoded, never says "nothing was saved" / "not saved" / "not created"', () => {
        const at = ADMIN.indexOf('function saveSettings(');
        const fn = decodeEscapes(ADMIN.slice(at, ADMIN.indexOf('\n    function ', at + 30))).replace(/^\s*\/\/.*$/gm, '');   // comments explain the rule; the code must not say it
        assert.ok(!/nothing was saved|not saved|not created|wasn.t saved/i.test(fn), 'the save path must not claim a buffered write was lost');
        assert.ok(!/navigator\.onLine/.test(fn), 'the threshold is a timer, not an onLine check');
        assert.match(fn, /keep this page open/i, 'the honest state reuses pwa-boot\'s vocabulary');
        assert.match(fn, /SAVE_SLOW_MS/);
    });
    test('the honest state is the same sentence pwa-boot uses', () => {
        assert.match(read('pwa-boot.js'), /keep this page open/);
    });
});
