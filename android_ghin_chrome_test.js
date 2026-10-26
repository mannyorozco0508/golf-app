// ============================================================================
// ANDROID: "POST TO GHIN" SAYS GOOGLE PLAY, IN REAL CHROME (android-2.0, 024 C)
//   The same cold arrival as urgent066_ghin_chrome_test.js (the Results page a golfer lands
//   on after Finish; nothing invoked from outside; the firebase stand-in counts writes), with
//   Capacitor saying it is the Android app. The card's words name Google Play, not the App
//   Store (GHIN's Android app, com.advancedmobile.android.ghin, read from ghin.com's own
//   assetlinks.json on 2026-10-25). The button and "Post on ghin.com instead" go where they
//   go on iOS: a real TAP is recorded, not followed. And the iPhone card is unchanged.
//   The harness below is copied from urgent066_ghin_chrome_test.js (PAR .. visit), unchanged,
//   so this file never edits the iOS check.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'ghin-post.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const PAR = [5, 4, 4, 3, 4, 4, 4, 3, 5, 5, 3, 4, 4, 4, 3, 5, 4, 4];
const HCP = [15, 17, 3, 13, 11, 1, 7, 9, 5, 18, 12, 16, 2, 4, 6, 8, 10, 14];
const CD = PAR.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: HCP[i] }));
// The urgent045 NASSAU round (synthetic, Test golfers, never written anywhere).
function round(holes) {
    const A = [5, 5, 5, 4, 3, 5, 4, 6, 4, 5, 4, 4, 4, 4, 3, 5, 5, 4];
    const B = [4, 4, 4, 5, 3, 4, 5, 4, 4, 4, 5, 4, 4, 4, 3, 5, 4, 4];
    const scores = {};
    A.slice(0, holes).forEach((s, i) => { scores['p101_h' + (i + 1)] = s; });
    B.slice(0, holes).forEach((s, i) => { scores['p102_h' + (i + 1)] = s; });
    return { eventName: 'Single Round', courseName: 'Papago Golf Club', activeCourseKey: 'az_papago', gameFormat: 'stroke',
        settlementMode: 'whole-dollar', teeRating: { teeKey: 'male:1', teeName: 'Men · White', slope: 125, courseRating: 70.9, par: 72, allowance: 100 },
        courseData: CD, scores,
        players: [{ id: 101, name: 'Test A', hcp: '12', playingForMoney: true }, { id: 102, name: 'Test B', hcp: '5', playingForMoney: true }],
        sideMatches: { '-U66nassau': { format: 'nassau', scoring: 'net', stake: 5, frontStake: 5, backStake: 5, overallStake: 5, pressRule: 'none',
            startHole: 1, createdAt: 1792000000000, teamAIds: ['101'], teamBIds: ['102'] } } };
}
const DB = (code, d) => ({ events: { [code]: d }, global_courses: { az_papago: { name: 'Papago Golf Club', location: { city: 'Phoenix', state: 'AZ' } } } });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
// A tap on a GHIN link is RECORDED and not followed (the test never leaves the page).
const CATCH = "window.__ghinOpened = []; document.addEventListener('click', function (e) { var a = e.target && e.target.closest && e.target.closest('#ghin-mount a'); if (a) { window.__ghinOpened.push({ id: a.id, href: a.href, target: a.target }); e.preventDefault(); } }, true);";
const UA = (ua) => "try { Object.defineProperty(navigator, 'userAgent', { get: function () { return '" + ua + "'; } }); Object.defineProperty(navigator, 'maxTouchPoints', { get: function () { return 5; } }); } catch (e) {}";
const OFF = "Object.defineProperty(window, 'HARDPAN_GPS_CONFIG', { configurable: true, get: function () { return window.__gCfg; }, set: function (v) { if (v) v.ghinButton = false; window.__gCfg = v; } });";
const PRE = 'window.__simpleFlow = true; try { localStorage.setItem("hardpan_simple_flow", "on"); } catch (e) {}';
const READY = "!!document.querySelector('#settle-content') && !/Calculating/.test(document.getElementById('settle-content').innerText) && !!document.querySelector('#receipt-scorecard')";
const LOOK = `(() => {
  const m = document.getElementById('ghin-mount'), card = document.getElementById('ghin-card');
  const b = document.getElementById('ghin-post'), w = document.getElementById('ghin-web');
  const r = (e) => { if (!e) return null; const x = e.getBoundingClientRect(); return { top: Math.round(x.top), bottom: Math.round(x.bottom), left: Math.round(x.left), right: Math.round(x.right), h: Math.round(x.height) }; };
  const kids = Array.from(document.getElementById('main-content').children).filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0);
  const order = kids.sort((a, c) => a.getBoundingClientRect().top - c.getBoundingClientRect().top).map((e) => e.id || e.className);
  let exportHasCard = null; const real = window.RattleExport; let cap = null;
  window.RattleExport = { exportOrPrint: (o) => { cap = o; return true; } };
  const share = document.querySelector('#hp-rc-foot:not([hidden]) .hp-rc-share') || document.querySelector('#receipt-actions .receipt-send');
  if (share) share.click();
  window.RattleExport = real;
  if (cap) exportHasCard = cap.roots.some((x) => /ghin-card|Post to GHIN/.test(x.innerHTML || ''));
  return JSON.stringify({ card: !!card, text: card ? card.innerText.replace(/\\s+/g, ' ').trim() : '', btn: b ? { href: b.href, target: b.target, rect: r(b), text: b.innerText.trim() } : null,
    web: w ? { href: w.href, target: w.target } : null, order, finalChip: /Final/.test((document.getElementById('receipt-export-head') || {}).innerText || ''),
    exportHasCard, shared: !!share, writes: (window.__coldWrites || []).length, scrollW: document.documentElement.scrollWidth, innerW: innerWidth, innerH: innerHeight });
})()`;

async function visit(opts) {
    const code = opts.code || 'U66GHN';
    const steps = [{ waitFor: READY, timeout: 20000 }, { sleep: 600 }];
    if (opts.scrollTo) steps.push({ expression: "(() => { const e = document.getElementById('ghin-card'); if (e) e.scrollIntoView({ block: 'center' }); return !!e; })()" }, { sleep: 300 });
    steps.push({ expression: LOOK });
    if (opts.tap) { steps.push({ tap: '#ghin-post' }, { sleep: 200 }); if (opts.web) steps.push({ tap: '#ghin-web' }, { sleep: 200 }); steps.push({ expression: 'JSON.stringify(window.__ghinOpened || [])' }); }
    if (opts.shot) steps.push({ expression: "(() => { const e = document.getElementById('ghin-card'); if (e) e.scrollIntoView({ block: 'center' }); return 1; })()" }, { sleep: 300 }, { shot: opts.shot, viewportOnly: true });
    const res = await arriveCold({ url: fileUrl('settlement.html', 'game=' + code), db: DB(code, opts.data), viewport: opts.viewport || { width: 393, height: 852 },
        steps, settleMs: 1500, preScript: (opts.android ? ANDROID_APP + '\n' : '') + PRE + '\n' + CATCH + '\n' + (opts.ua ? UA(opts.ua) : '') + '\n' + (opts.off ? OFF : '') });
    assert.ok(res.ok, code + ': ' + res.reason);
    const vals = res.value.filter((v) => typeof v === 'string' && /^[[{]/.test(v)).map((v) => JSON.parse(v));
    return { look: vals[0], opened: opts.tap ? vals[1] : null };
}

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const ANDROID_APP = "window.Capacitor = { getPlatform: function () { return 'android'; }, isNativePlatform: function () { return true; }, Plugins: {} };";

test('ANDROID app, final round: the card says Google Play; Post to GHIN and ghin.com go where they go on iOS; nothing written', { timeout: 120000 }, async () => {
    const r = await visit({ code: 'A24GHN', data: round(18), ua: ANDROID_UA, tap: true, web: true, android: true });
    assert.ok(r.look.card, 'the card is on the Receipt');
    assert.match(r.look.text, /This opens the GHIN app, or Google Play if you don’t have it\. You post there\./);
    assert.ok(!/App Store/.test(r.look.text), 'no App Store on Android: ' + r.look.text);
    assert.equal(r.look.btn.href, 'https://www.ghin.com/overview/');
    assert.equal(r.look.web.href, 'https://www.ghin.com/post-score');
    assert.deepEqual(r.opened.map((o) => [o.id, o.href, o.target]), [['ghin-post', 'https://www.ghin.com/overview/', '_blank'], ['ghin-web', 'https://www.ghin.com/post-score', '_blank']]);
    assert.equal(r.look.writes, 0, 'nothing written');
});

test('iOS UNCHANGED: the iPhone card still says the App Store', { timeout: 120000 }, async () => {
    const r = await visit({ code: 'A24GHI', data: round(18), ua: IPHONE });
    assert.ok(r.look.card);
    assert.match(r.look.text, /This opens the GHIN app, or the App Store if you don’t have it\. You post there\./);
    assert.ok(!/Google Play/.test(r.look.text));
});
