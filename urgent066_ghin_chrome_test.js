// ============================================================================
// URGENT-066 #3 - "POST TO GHIN" AFTER A ROUND, IN REAL CHROME (cold arrival: the Results
// page a golfer lands on after Finish, nothing invoked from outside, nothing written - the
// firebase stand-in counts writes).
//
//   FINAL ROUND, a phone (iPhone user agent): the card is on the Receipt, after Settle up;
//     a real TAP on "Post to GHIN" goes to GHIN's universal link (the GHIN app when it is
//     installed, the App Store when not - ghin_button_test.js models both from GHIN's own
//     files); "Post on ghin.com instead" goes to ghin.com's posting. 393x852, 375x667, 430x932:
//     the card fits (no sideways scroll, the button at least 44 px tall, inside the screen).
//   FINAL ROUND, a computer: one link, ghin.com's posting.
//   A ROUND STILL IN PLAY: no card.
//   SHARE RECEIPT never carries the card. The switch off (ghinButton: false): no card.
// GHIN_SHOTS=<dir> also writes a phone screenshot per size.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'ghin-post.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const SHOTS = process.env.GHIN_SHOTS || '';
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
        steps, settleMs: 1500, preScript: PRE + '\n' + CATCH + '\n' + (opts.ua ? UA(opts.ua) : '') + '\n' + (opts.off ? OFF : '') });
    assert.ok(res.ok, code + ': ' + res.reason);
    const vals = res.value.filter((v) => typeof v === 'string' && /^[[{]/.test(v)).map((v) => JSON.parse(v));
    return { look: vals[0], opened: opts.tap ? vals[1] : null };
}

const SIZES = [{ width: 393, height: 852 }, { width: 375, height: 667 }, { width: 430, height: 932 }];
for (const vp of SIZES) {
    test('final round, phone ' + vp.width + 'x' + vp.height + ': the card after Settle up; a real tap opens GHIN\'s universal link; the web link opens ghin.com posting', { timeout: 120000 }, async () => {
        const shot = SHOTS ? path.join(SHOTS, 'chrome-ghin-card-' + vp.width + 'x' + vp.height + '.png') : null;
        const { look, opened } = await visit({ data: round(18), ua: IPHONE, viewport: vp, tap: true, web: true, scrollTo: true, shot });
        assert.ok(look.finalChip, 'positive: the Receipt is the final one');
        assert.ok(look.card, 'the Post to GHIN card is on a final round');
        assert.match(look.text, /Post your score to GHIN/);
        assert.match(look.text, /not affiliated with the USGA or GHIN/);
        assert.equal(look.btn.text, 'Post to GHIN');
        assert.equal(look.btn.href, 'https://www.ghin.com/overview/');
        assert.equal(look.btn.target, '_blank', 'handed to iOS (UIApplication.open), which gives a universal link to the app');
        assert.equal(look.web.href, 'https://www.ghin.com/post-score');
        assert.ok(look.btn.rect.h >= 44, 'tap target ' + look.btn.rect.h);
        assert.ok(look.btn.rect.left >= 0 && look.btn.rect.right <= look.innerW, 'inside the screen: ' + JSON.stringify(look.btn.rect));
        assert.ok(look.btn.rect.top >= 0 && look.btn.rect.bottom <= look.innerH, 'scrolled into view: ' + JSON.stringify(look.btn.rect));
        assert.ok(look.scrollW <= look.innerW, 'no sideways scroll ' + look.scrollW + ' > ' + look.innerW);
        const at = look.order.indexOf('ghin-mount');
        assert.ok(at > look.order.indexOf('combined-settlement-summary') && look.order.indexOf('combined-settlement-summary') >= 0, 'after Settle up: ' + look.order.join(' > '));
        assert.deepEqual(opened.map((o) => o.href), ['https://www.ghin.com/overview/', 'https://www.ghin.com/post-score'], 'what the two taps opened');
        assert.equal(look.shared, true, 'positive: Share receipt was there to press');
        assert.equal(look.exportHasCard, false, 'Share never carries the GHIN card');
        assert.equal(look.writes, 0, 'nothing written');
    });
}

test('final round, a computer: one link, ghin.com posting', { timeout: 120000 }, async () => {
    const { look, opened } = await visit({ data: round(18), tap: true });
    assert.ok(look.card);
    assert.equal(look.btn.href, 'https://www.ghin.com/post-score');
    assert.equal(look.web, null);
    assert.deepEqual(opened.map((o) => o.href), ['https://www.ghin.com/post-score']);
    assert.equal(look.writes, 0);
});

test('a round still in play (9 of 18 holes): no card', { timeout: 120000 }, async () => {
    const { look } = await visit({ code: 'U66LIV', data: round(9), ua: IPHONE });
    assert.equal(look.finalChip, false, 'positive: the Receipt is not final');
    assert.equal(look.card, false, 'no Post to GHIN before the round is over');
    assert.equal(look.writes, 0);
});

test('the switch off (ghinButton: false): no card on a final round', { timeout: 120000 }, async () => {
    const { look } = await visit({ code: 'U66OFF', data: round(18), ua: IPHONE, off: true });
    assert.ok(look.finalChip, 'positive: final');
    assert.equal(look.card, false);
});
