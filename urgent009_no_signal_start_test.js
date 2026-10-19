// ============================================================================
// URGENT-009 (013-16, MEDIUM): OFFLINE "Start a round" SAYS THERE IS NO SIGNAL.
//
// Measured by tools/sim/setup-shapes.js E-airplane: with airplane mode on,
// Start a round landed on the lobby saying "ROUND NOT CREATED ... Try again",
// with no word about signal. A new round needs its code checked against the
// server, so it cannot start offline - the copy now says so plainly:
// "No signal - try again when you have a connection." ONLY when the page knows
// (the round's own socket .info/connected is false, or navigator.onLine is
// false); a timeout on a live socket keeps the existing words, which must not
// blame the network (code_issuer_timeout_test.js).
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
// GPS-ONLY BY DESIGN: this code lives in GPS:BEGIN/END blocks (admin.html, index.html) and GPS
// files (front-door.js, home.html), so a Consumer tree (tools/gps-flag-tree.js) skips these cases
// and checks instead that none of it is left in the Consumer build.
const GPS = fs.existsSync(path.join(REPO_ROOT, 'gps-view.js'));
const GPS_ONLY = GPS ? {} : { skip: 'Consumer tree: GPS-only (GPS blocks / GPS files)' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function lobby(o) {
    const sb = loadHtmlInlineScript('admin.html', [], { search: '', beforeRun: (s) => { s.location.pathname = '/admin.html'; if (o && o.offline) s.navigator.onLine = false; } });
    const src = read('code-issuer.js').split('opts.timeoutMs || 8000').join('opts.timeoutMs || 80');
    vm.runInContext(src, sb);
    if (o && o.socket !== undefined) sb.__dbHandlers.filter((h) => h.path === '.info/connected').forEach((h) => h.cb({ val: () => o.socket }));
    vm.runInContext(`
        window.__alerts = []; window.alert = function (m) { window.__alerts.push(String(m)); }; uiRefuse = alert; uiFail = alert; uiToast = alert;
        window.__navigated = null; try { Object.defineProperty(window.location, 'href', { set: function (v) { window.__navigated = v; }, get: function () { return 'x'; }, configurable: true }); } catch (e) {}
        db.ref = function (p) { return { once: function () { return new Promise(function () {}); }, set: function () { return Promise.resolve(); }, update: function () { return Promise.resolve(); } }; };
        var el = document.createElement('div'); el.id = 'hw-quick'; var desc = document.createElement('div'); desc.className = 'hw-desc'; desc.innerHTML = 'Playing today?'; el.appendChild(desc); document.__mount(el);
    `, sb);
    return sb;
}

describe('Start a round with no signal', () => {
    test('the socket says it is down: "No signal - try again when you have a connection", once, nothing started', Object.assign({ timeout: 3000 }, GPS_ONLY), async () => {
        const sb = lobby({ socket: false });
        vm.runInContext("selectHomeWidget('quick')", sb);
        await wait(300);
        assert.equal(sb.__alerts.length, 1, JSON.stringify(sb.__alerts));
        assert.match(sb.__alerts[0], /^📴 No signal — try again when you have a connection\./);
        assert.match(sb.__alerts[0], /not started/);
        assert.ok(!/saved on this phone/.test(sb.__alerts[0]), 'it is not saved: a round cannot start without a code');
        assert.equal(sb.__navigated, null);
    });
    test('the phone says it is offline: the same words', Object.assign({ timeout: 3000 }, GPS_ONLY), async () => {
        const sb = lobby({ offline: true });
        vm.runInContext("selectHomeWidget('quick')", sb);
        await wait(300);
        assert.match(sb.__alerts[0], /No signal/);
    });
    test('a timeout on a live socket (signal unknown) keeps the existing words and blames nothing', { timeout: 3000 }, async () => {
        const sb = lobby({ socket: true });
        vm.runInContext("selectHomeWidget('quick')", sb);
        await wait(300);
        assert.equal(sb.__alerts.length, 1);
        assert.match(sb.__alerts[0], /NOT CREATED/);
        assert.ok(!/signal|network/i.test(sb.__alerts[0]));
    });
});

test('Consumer build: no "No signal" Start-a-round words are left in admin.html', { skip: GPS ? 'HardPan tree: covered above' : false }, () => {
    assert.ok(!/No signal - try again when you have a connection/.test(read('admin.html')));
});
