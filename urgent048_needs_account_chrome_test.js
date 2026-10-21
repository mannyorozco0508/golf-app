// ============================================================================
// URGENT-048 part 3 - THE NEEDS-AN-ACCOUNT PROMPT ON SETTLE UP, IN REAL CHROME.
//
// A finished round (tools/extra-games-backcompat.js's, as tools/venmo-check.js
// uses it) opened cold on settlement.html as Ann (?me=11), with stand-ins for
// 048 part 2 (HardPanAuth) and part 1 (HardPanAccountUI) - tools/lib/hp-auth-stub.js.
// Real taps only. The rule under test: a NUDGE, NEVER A WALL.
//   1. Signed out: Pay with Venmo -> the sheet ("Sign in to use Venmo", the why,
//      Sign in, Not now, the "keeps working" note; no words for staking money)
//      -> Not now -> the Venmo link is followed (not stopped) with the exact href;
//      the sheet is gone. Pay with Venmo again -> no sheet, the link opens as
//      today. Mark paid -> no sheet (once per round per feature), the tick is
//      written exactly as today.
//   2. Signed out, Mark paid first -> the sheet -> Not now -> the tick is written.
//   3. Signed out -> Mark paid -> Sign in -> openSignIn() is called; once
//      HardPanAuth reports signed in, the promise resolves 'signin' and the tick
//      is written.
//   4. Signed in -> Pay with Venmo opens directly, Mark paid writes directly, no sheet.
//   5. No sign-in on the page (no HardPanAuth): no sheet, exactly today.
// At 393x852 and 375x667. Screens -> HPNA_SHOTS=<dir> (optional).
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-config.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { round } = require('./tools/extra-games-backcompat.js');
const { authStub } = require('./tools/lib/hp-auth-stub.js');

const SHOTS = process.env.HPNA_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

function db() {
    const base = round(true);
    base.date = '2026-10-20';
    base.courseName = 'Dobson Ranch';
    base.venmo = { 12: 'bob-baker-1', 13: 'cal-cole' };
    base.cashapp = { 13: 'CalCash' };
    return { events: { XGBACK: base }, global_courses: {}, trips: {}, tournaments: {} };
}
// Every link click, as the browser sees it AFTER every page listener (window, bubble):
// prevented = the page stopped it; otherwise the browser follows it.
const REC = "window.__hpErr = []; addEventListener('error', function (e) { window.__hpErr.push(String(e.message || e)); });"
    + "addEventListener('unhandledrejection', function (e) { window.__hpErr.push('rejection: ' + String(e.reason && e.reason.message || e.reason)); });"
    + "window.__clicks = []; window.addEventListener('click', function (e) { var a = e.target && e.target.closest && e.target.closest('a[href]'); if (a) window.__clicks.push({ href: a.getAttribute('href'), prevented: e.defaultPrevented, inSheet: !!a.closest('.hpna-root') }); });"
    + "window.__opens = []; window.open = function (u) { window.__opens.push(String(u)); return null; };"
    + "window.__answers = []; (function () { var t = setInterval(function () { var N = window.HardPanNeedsAccount; if (!N || N.__wrapped) return; var p = N.prompt; N.prompt = function (o) { var r = p.call(N, o); r.then(function (v) { window.__answers.push(v); }); return r; }; N.__wrapped = true; clearInterval(t); }, 5); })();";
const LOOK = `JSON.stringify({
  sheet: !!document.querySelector('.hpna-sheet'),
  sheetText: (document.querySelector('.hpna-sheet') || {}).innerText || '',
  title: (document.querySelector('.hpna-t') || {}).innerText || '',
  noHref: (document.querySelector('.hpna-root a[data-hpna-no]') || { getAttribute: function () { return null; } }).getAttribute('href'),
  venmoHref: (document.querySelector('#vm-mount a.vm-venmo') || { getAttribute: function () { return null; } }).getAttribute('href'),
  clicks: window.__clicks, opens: window.__opens, answers: window.__answers, errs: window.__hpErr,
  opened: window.__hpAuth ? window.__hpAuth.opened : null,
  ticks: (window.__coldWrites || []).filter(function (w) { return /settleUp/.test(w.path); }).map(function (w) { return w.path + '=' + JSON.stringify(w.value && w.value.by); }),
  paidRows: document.querySelectorAll('#vm-mount .vm-row.vm-done').length,
  hasNA: !!window.HardPanNeedsAccount })`;
const look = { expression: LOOK };

async function run(vp, pre, steps) {
    const r = await arriveCold({ url: fileUrl('settlement.html', 'game=XGBACK&me=11'), db: db(), settleMs: 3500, viewport: vp,
        preScript: REC + (pre || ''), blockUrls: ['*venmo.com*', '*cash.app*'], steps });
    if (!r.ok) throw new Error(r.reason);
    return r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
}
const shot = (name, vp) => SHOTS ? [{ shot: path.join(SHOTS, name + '-' + vp.width + 'x' + vp.height + '.png'), viewportOnly: true }] : [];
const NO_WORDS = /\bbets?\b|\bbetting\b|\bwagers?\b|\bgambl/i;

for (const vp of [{ width: 393, height: 852 }, { width: 375, height: 667 }]) {
    const tag = vp.width + 'x' + vp.height;

    test(tag + ' signed out: Pay with Venmo -> the prompt -> Not now -> the link still opens; at most once per round', async () => {
        const [a0, a1, a2, a3, a4] = await run(vp, authStub({ signedIn: false }), [
            look,
            { tap: '#vm-mount a.vm-venmo' }, { sleep: 400 }, look, ...shot('prompt-over-settle-up', vp),
            { tap: '.hpna-root [data-hpna-no]' }, { sleep: 400 }, look,
            { tap: '#vm-mount a.vm-venmo' }, { sleep: 400 }, look,
            { tap: '#vm-mount [data-vm-paid]' }, { sleep: 500 }, look]);
        assert.ok(a0.hasNA, 'hp-needs-account.js is on the page');
        assert.ok(a0.venmoHref && /^https:\/\/venmo\.com\/u\/bob-baker-1\?txn=pay/.test(a0.venmoHref), 'fixture: Ann has Pay with Venmo: ' + a0.venmoHref);
        assert.equal(a0.sheet, false);
        // The tap was stopped (only this once) and the sheet is up, as previewed.
        assert.ok(a1.sheet, 'the prompt is up');
        assert.equal(a1.title, 'Sign in to use Venmo');
        assert.match(a1.sheetText, /So the money goes to the right person, and your friends see it’s really you\./);
        assert.match(a1.sheetText, /Sign in/); assert.match(a1.sheetText, /Not now/);
        assert.match(a1.sheetText, /your round, GPS and games on this phone keep working/);
        assert.ok(!NO_WORDS.test(a1.sheetText), 'no staking words on the sheet: ' + a1.sheetText);
        assert.deepEqual(a1.clicks, [{ href: a0.venmoHref, prevented: true, inSheet: false }]);
        assert.equal(a1.noHref, a0.venmoHref, 'Not now is the same Venmo link');
        // Not now: the link is followed, the sheet goes, the answer is 'notnow'.
        assert.equal(a2.sheet, false);
        assert.deepEqual(a2.clicks[1], { href: a0.venmoHref, prevented: false, inSheet: true }, 'Not now opens the Venmo link');
        assert.deepEqual(a2.answers, ['notnow']);
        // Again: no sheet; the page's own link opens as today.
        assert.equal(a3.sheet, false, 'once per round');
        assert.deepEqual(a3.clicks[2], { href: a0.venmoHref, prevented: false, inSheet: false });
        // Mark paid: same feature, same round - no sheet, the tick is written as today.
        assert.equal(a4.sheet, false);
        assert.equal(a4.ticks.length, 1, 'Mark paid wrote once: ' + JSON.stringify(a4.ticks));
        assert.match(a4.ticks[0], /^events\/XGBACK\/settleUp\/[^=]+="11"$/);
        assert.equal(a4.paidRows, 1);
        assert.deepEqual(a4.errs, []);
        assert.equal(a4.opened, 0, 'never sent to sign-in');
    });

    test(tag + ' signed out: Mark paid -> the prompt -> Not now -> Mark paid behaves as today', async () => {
        const [b1, b2] = await run(vp, authStub({ signedIn: false }), [
            { tap: '#vm-mount [data-vm-paid]' }, { sleep: 400 }, look,
            { tap: '.hpna-root [data-hpna-no]' }, { sleep: 500 }, look]);
        assert.ok(b1.sheet); assert.deepEqual(b1.ticks, [], 'nothing written while the sheet is up');
        assert.equal(b2.sheet, false);
        assert.deepEqual(b2.answers, ['notnow']);
        assert.equal(b2.ticks.length, 1); assert.match(b2.ticks[0], /="11"$/);
        assert.equal(b2.paidRows, 1);
        assert.deepEqual(b2.opens, [], 'no link opened for Mark paid');
        assert.deepEqual(b2.errs, []);
    });

    test(tag + ' signed out: Mark paid -> Sign in -> openSignIn, resolves "signin" once signed in, then the tick', async () => {
        const [c1, c2, c3] = await run(vp, authStub({ signedIn: false }), [
            { tap: '#vm-mount [data-vm-paid]' }, { sleep: 400 }, look,
            { tap: '.hpna-root [data-hpna-in]' }, { sleep: 300 }, look,
            { expression: 'window.__hpAuth.set(true)' }, { sleep: 400 }, look]);
        assert.ok(c1.sheet);
        assert.equal(c2.sheet, false); assert.equal(c2.opened, 1, 'HardPanAccountUI.openSignIn() called');
        assert.deepEqual(c2.answers, [], 'not resolved before signed in'); assert.deepEqual(c2.ticks, []);
        assert.deepEqual(c3.answers, ['signin']);
        assert.equal(c3.ticks.length, 1); assert.deepEqual(c3.errs, []);
    });

    test(tag + ' signed in: no prompt; the link and Mark paid as today', async () => {
        const [d1, d2] = await run(vp, authStub({ signedIn: true }), [
            { tap: '#vm-mount a.vm-venmo' }, { sleep: 400 }, look,
            { tap: '#vm-mount [data-vm-paid]' }, { sleep: 500 }, look]);
        assert.equal(d1.sheet, false);
        assert.equal(d1.clicks.length, 1); assert.equal(d1.clicks[0].prevented, false);
        assert.equal(d2.sheet, false); assert.equal(d2.ticks.length, 1);
        assert.deepEqual(d2.answers, []); assert.deepEqual(d2.errs, []);
    });

    test(tag + ' no sign-in on the page (no HardPanAuth): no prompt, exactly today', async () => {
        const [e1, e2] = await run(vp, '', [
            { tap: '#vm-mount a.vm-venmo' }, { sleep: 400 }, look,
            { tap: '#vm-mount [data-vm-paid]' }, { sleep: 500 }, look]);
        assert.equal(e1.sheet, false); assert.equal(e1.clicks[0].prevented, false);
        assert.equal(e2.sheet, false); assert.equal(e2.ticks.length, 1); assert.deepEqual(e2.errs, []);
    });
}
