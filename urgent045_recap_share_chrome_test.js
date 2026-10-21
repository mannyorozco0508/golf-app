// ============================================================================
// URGENT-045 #4b - SHARE RECAP: THE BUTTONS, THE SHARE SHEET, SAVE TO PHOTOS, IN REAL CHROME.
//
// The picture is round-recap.js (045-recap, its own test). This file proves the way to it:
//   1. The #31 Receipt of a finished round has "Share recap" BESIDE "Share receipt" (both on
//      screen, neither clipped) at 393x852 and 375x667; an unfinished Receipt has neither.
//   2. NATIVE (a stub Capacitor bridge: Filesystem + Share recording every call): a tap writes
//      ONE PNG to CACHE (base64, PNG magic, the picture's own size) and hands exactly that file
//      to Share.share - the iOS share sheet, whose "Save Image" is Save to Photos. A dismissed
//      sheet is not an error.
//   3. WEB: navigator.share gets one image/png File; with no Web Share, a .png download.
//   4. HOME > HISTORY: a finished round's row has a Recap action (an unfinished one does not),
//      the rows themselves are unchanged (Results / Resume), and the action opens the Receipt
//      with ?recap=1, which shares the picture by itself on the phone.
// LOCATION GUARD: no geolocation call and no request off the phone on any of these pages.
// DISPLAY ONLY: the firebase stub records writes; this asserts there are none.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-config.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl, REPO_ROOT } = require('./tools/lib/cold-arrival.js');
const { openJourney } = require('./tools/lib/journey.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const OUT = path.join(process.env.HOME || '', 'Desktop', 'claude-code-reports', '045', 'recap-share', 'chrome');
const SAVE = process.env.U045_SHOTS === '1';
if (SAVE) fs.mkdirSync(OUT, { recursive: true });

const PAR = [5, 4, 4, 3, 4, 4, 4, 3, 5, 5, 3, 4, 4, 4, 3, 5, 4, 4];
const HCP = [15, 17, 3, 13, 11, 1, 7, 9, 5, 18, 12, 16, 2, 4, 6, 8, 10, 14];
const CD = PAR.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: HCP[i] }));
function round(thru) {
    const A = [5, 5, 5, 4, 3, 5, 4, 6, 4, 5, 4, 4, 4, 4, 3, 5, 5, 4];
    const B = [4, 4, 4, 5, 3, 4, 5, 4, 4, 4, 5, 4, 4, 4, 3, 5, 4, 4];
    const scores = {};
    A.slice(0, thru).forEach((s, i) => { scores['p101_h' + (i + 1)] = s; });
    B.slice(0, thru).forEach((s, i) => { scores['p102_h' + (i + 1)] = s; });
    return { eventName: 'Single Round', courseName: 'Papago Golf Club', activeCourseKey: 'az_papago', gameFormat: 'stroke',
        settlementMode: 'whole-dollar', teeRating: { teeKey: 'male:1', teeName: 'Men · White', slope: 125, courseRating: 70.9, par: 72, allowance: 100 },
        courseData: CD, scores,
        players: [{ id: 101, name: 'Test A', hcp: '12', playingForMoney: true }, { id: 102, name: 'Test B', hcp: '5', playingForMoney: true }],
        sideMatches: { '-U045share': { format: 'nassau', scoring: 'net', stake: 5, frontStake: 5, backStake: 5, overallStake: 5, pressRule: 'none',
            startHole: 1, createdAt: 1792000000000, teamAIds: ['101'], teamBIds: ['102'] } } };
}
const FIN = round(18), PRG = round(4);
const DB = () => ({ events: { U45SHR: FIN, U45PRG: PRG }, global_courses: { az_papago: { name: 'Papago Golf Club', location: { city: 'Phoenix', state: 'AZ' } } },
    trips: {}, organizers: {}, tournaments: {} });

const SIMPLE = 'window.__simpleFlow = true; try { localStorage.setItem("hardpan_simple_flow", "on"); } catch (e) {}';
// Every geolocation ask is recorded (the guard asserts none).
const GEO = 'window.__geo = 0; try { var __g = navigator.geolocation; if (__g) { __g.getCurrentPosition = function () { window.__geo++; }; __g.watchPosition = function () { window.__geo++; return 1; }; } } catch (e) {}';
// THE STUB SHARE PLUGIN: the native bridge's own shape (Capacitor.Plugins, no registerPlugin).
// The PNG is checked in the page (magic + IHDR size) so megabytes are not shipped back.
const NATIVE = `window.__fs = []; window.__share = []; window.__dismiss = false;
window.Capacitor = { isNativePlatform: function () { return true; }, getPlatform: function () { return 'ios'; }, Plugins: {
  Filesystem: {
    writeFile: function (o) { var b = ''; try { b = atob(String(o.data).slice(0, 44)); } catch (e) {}
      var u32 = function (i) { return ((b.charCodeAt(i) << 24) >>> 0) + (b.charCodeAt(i + 1) << 16) + (b.charCodeAt(i + 2) << 8) + b.charCodeAt(i + 3); };
      window.__fs.push({ path: o.path, directory: o.directory, b64: /^[A-Za-z0-9+/]+=*$/.test(String(o.data)), len: String(o.data).length,
        png: b.slice(1, 4) === 'PNG' && b.charCodeAt(0) === 0x89 && b.slice(12, 16) === 'IHDR', w: u32(16), h: u32(20) });
      return Promise.resolve({ uri: 'file:///stub-cache/' + o.path }); },
    getUri: function (o) { return Promise.resolve({ uri: 'file:///stub-cache/' + o.path }); } },
  Share: { share: function (o) { window.__share.push(o); return window.__dismiss ? Promise.reject(new Error('Share canceled')) : Promise.resolve({ activityType: 'stub' }); } } } };`;
const WEBSHARE = `window.__wshare = [];
Object.defineProperty(navigator, 'canShare', { configurable: true, value: function (d) { return !!(d && d.files && d.files.length); } });
Object.defineProperty(navigator, 'share', { configurable: true, value: function (d) { var f = d.files[0];
  window.__wshare.push({ n: d.files.length, name: f.name, type: f.type, size: f.size, title: d.title }); return Promise.resolve(); } });`;
const NOSHARE = `Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
window.__dl = []; (function () { var c = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () {
  if (this.download) { window.__dl.push({ name: this.download, png: /^data:image\\/png;base64,/.test(this.href) }); return; } return c.call(this); }; })();`;

const READY = "!!document.querySelector('#receipt-scorecard table') && !!document.querySelector('#hp-rc-scores table') && !!document.querySelector('#hp-rc-foot:not([hidden]) .hp-rc-recap')";
const FOOT = `JSON.stringify((() => { const f = document.getElementById('hp-rc-foot');
  const b = Array.from(f ? f.querySelectorAll('button') : []).map((x) => { const r = x.getBoundingClientRect();
    return { cls: x.className, t: x.innerText.replace(/\\s+/g, ' ').trim(), l: r.left, r: r.right, top: r.top, w: r.width, h: r.height, clip: x.scrollWidth > x.clientWidth + 1 }; });
  return { hidden: !f || f.hidden, b, vw: innerWidth, scrollW: document.documentElement.scrollWidth, recaps: document.querySelectorAll('.hp-rc-recap').length }; })())`;
const STATE = "JSON.stringify({ fs: window.__fs || null, share: window.__share || null, wshare: window.__wshare || null, dl: window.__dl || null, geo: window.__geo, writes: (window.__coldWrites || window.__WRITES || []).length, label: ((document.querySelector('.hp-rc-recap-t') || {}).textContent || ''), href: location.href, dialogs: document.querySelectorAll('.ui-dialog, [role=alertdialog]').length })";

function parse(res) { return res.value.filter((x) => typeof x === 'string' && x[0] === '{').map((x) => JSON.parse(x)); }
function local(requests) { return (requests || []).filter((u) => !/^(file|data|blob|chrome|about):/.test(u)); }

async function receipt(code, vp, pre, extra, shot) {
    const steps = [{ waitFor: code === 'U45PRG' ? "!!document.getElementById('hp-rc-foot')" : READY, timeout: 20000 }, { sleep: 500 }]
        .concat(SAVE && shot ? [{ shot: path.join(OUT, shot), viewportOnly: true }] : [])
        .concat([{ expression: FOOT }], extra || [], [{ expression: STATE }]);
    const res = await arriveCold({ url: fileUrl('settlement.html', 'game=' + code), db: DB(), viewport: vp, settleMs: 1500, preScript: SIMPLE + GEO + (pre || ''), steps });
    assert.ok(res.ok, code + ': ' + res.reason);
    const v = parse(res);
    return { foot: v.find((x) => 'b' in x), state: v.filter((x) => 'fs' in x).pop(), requests: res.requests };
}
const TAP = [{ expression: "document.querySelector('#hp-rc-foot .hp-rc-recap').click(), 1" }];

for (const vp of [{ width: 393, height: 852 }, { width: 375, height: 667 }]) {
    const tag = vp.width + 'x' + vp.height;
    test('Receipt ' + tag + ': "Share recap" beside "Share receipt"; a tap writes ONE PNG to CACHE and opens the share sheet with it', { timeout: 120000 }, async () => {
        const { foot, state, requests } = await receipt('U45SHR', vp, NATIVE,
            TAP.concat([{ waitFor: '(window.__share || []).length > 0', timeout: 20000 }, { sleep: 300 }]), 'receipt-' + tag + '.png');
        assert.equal(foot.hidden, false);
        assert.equal(foot.recaps, 1, 'one Share recap');
        assert.deepEqual(foot.b.map((b) => b.cls), ['hp-rc-recap', 'hp-rc-share'], 'Share recap, then Share receipt');
        const [rc, rs] = foot.b;
        assert.match(rc.t, /^Share recap Text it · Save Image$/, 'labelled: the share sheet\'s Save Image is Save to Photos');
        assert.equal(rs.t, 'Share receipt', '#31\'s button unchanged');
        assert.ok(Math.abs(rc.top - rs.top) < 1 && rc.r <= rs.l, 'side by side');
        foot.b.forEach((b) => { assert.ok(b.l >= 0 && b.r <= foot.vw, b.t + ' on screen'); assert.ok(b.h >= 54, b.t + ' a thumb-sized button'); assert.equal(b.clip, false, b.t + ' not clipped'); });
        assert.ok(foot.scrollW <= foot.vw, 'no sideways scroll');
        // THE SHARE: one PNG written to CACHE, that same file handed to the share sheet.
        assert.equal(state.fs.length, 1, 'one file written');
        const f = state.fs[0];
        assert.equal(f.directory, 'CACHE');
        assert.match(f.path, /^hardpan-recap-papago-golf-club-u45shr\.png$/);
        assert.ok(f.b64 && f.png, 'base64 PNG bytes (no data: prefix)');
        assert.ok(f.w >= 1080 && f.h > 1000, 'the recap picture: ' + f.w + 'x' + f.h);
        assert.equal(state.share.length, 1, 'the share sheet, once');
        assert.deepEqual(state.share[0].files, ['file:///stub-cache/' + f.path], 'the written PNG is the file shared');
        assert.equal(state.label, 'Share recap', 'the button reads Share recap again');
        assert.equal(state.writes, 0, 'nothing written to the round');
        assert.equal(state.geo, 0, 'no location asked');
        assert.deepEqual(local(requests), [], 'nothing leaves the phone');
    });
}

test('Receipt: a dismissed share sheet is a choice - no error, the button is back', { timeout: 120000 }, async () => {
    const { state } = await receipt('U45SHR', { width: 393, height: 852 }, NATIVE + 'window.__dismiss = true;',
        TAP.concat([{ waitFor: '(window.__share || []).length > 0', timeout: 20000 }, { sleep: 500 }]));
    assert.equal(state.share.length, 1);
    assert.equal(state.dialogs, 0, 'no error sheet');
    assert.equal(state.label, 'Share recap');
});

test('Receipt (web): navigator.share gets one image/png File', { timeout: 120000 }, async () => {
    const { state, requests } = await receipt('U45SHR', { width: 393, height: 852 }, WEBSHARE,
        TAP.concat([{ waitFor: '(window.__wshare || []).length > 0', timeout: 20000 }]));
    assert.equal(state.wshare.length, 1);
    const s = state.wshare[0];
    assert.equal(s.n, 1); assert.equal(s.type, 'image/png'); assert.match(s.name, /^hardpan-recap-.*\.png$/); assert.ok(s.size > 10000, 'a real picture');
    assert.equal(state.geo, 0); assert.deepEqual(local(requests), []);
});

test('Receipt (web, no Web Share): the PNG downloads', { timeout: 120000 }, async () => {
    const { state } = await receipt('U45SHR', { width: 375, height: 667 }, NOSHARE,
        TAP.concat([{ waitFor: '(window.__dl || []).length > 0', timeout: 20000 }]));
    assert.equal(state.dl.length, 1); assert.ok(state.dl[0].png); assert.match(state.dl[0].name, /\.png$/);
});

test('Receipt: a round still in play has no Share recap on screen', { timeout: 120000 }, async () => {
    const { foot } = await receipt('U45PRG', { width: 393, height: 852 }, NATIVE, [{ sleep: 1500 }, { expression: FOOT }]);
    assert.equal(foot.hidden, true, 'the foot (both shares) stays off until the round is final');
});

// ---- HOME > HISTORY --------------------------------------------------------------------------
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) {} } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(j, expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 10000)) { try { if (await j.evaluate(expr)) return true; } catch (e) {} await sleep(150); } return false; }
const SEED = "try{if(!sessionStorage.getItem('rsseed')){sessionStorage.setItem('rsseed','1');var now=Date.now();"
    + "localStorage.setItem('golfapp_snap_v1_U45SHR', JSON.stringify({ at: now - 86400000, data: " + JSON.stringify(FIN) + ", meta: { group: null } }));"
    + "localStorage.setItem('golfapp_snap_v1_U45PRG', JSON.stringify({ at: now - 60000, data: " + JSON.stringify(PRG) + ", meta: { group: null } }));"
    + "localStorage.setItem('hardpan_round_seen_v1', JSON.stringify({ U45SHR: now - 86400000, U45PRG: now - 60000 }));"
    + "localStorage.setItem('lastRoomCode','U45SHR');}}catch(e){}";

for (const vp of [{ width: 393, height: 852 }, { width: 375, height: 667 }]) {
    const tag = vp.width + 'x' + vp.height;
    test('Home > History ' + tag + ': a finished round has a Recap action that opens the Receipt and the share sheet', { timeout: 150000 }, async () => {
        const j = await openJourney({ db: DB(), viewport: vp, webgl: true,
            preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + SEED + SIMPLE + GEO + NATIVE });
        journeys.push(j);
        await j.goto(fileUrl('home.html'), 2500);
        assert.ok(await j.tap('[data-hp-act="shistory"]'), 'History link');
        assert.ok(await until(j, "document.querySelectorAll('#hp-history-list [data-hp-hist]').length === 2"), 'the list');
        await sleep(600);
        const h = JSON.parse(await j.evaluate(`JSON.stringify((() => {
          const rows = Array.from(document.querySelectorAll('#hp-history-list [data-hp-hist]')).map((b) => ({ code: b.getAttribute('data-hp-hist'), text: b.innerText.replace(/\\s+/g, ' ').trim(), w: b.getBoundingClientRect().width }));
          const rc = Array.from(document.querySelectorAll('#hp-history-list [data-hp-recap]')).map((b) => { const r = b.getBoundingClientRect(); return { code: b.getAttribute('data-hp-recap'), t: b.innerText.trim(), l: r.left, r: r.right, h: r.height, label: b.getAttribute('aria-label') }; });
          return { rows, rc, vw: innerWidth, scrollW: document.documentElement.scrollWidth, nested: document.querySelectorAll('button button').length }; })())`));
        assert.deepEqual(h.rows.map((r) => r.code), ['U45PRG', 'U45SHR'], 'the rows, as before');
        assert.match(h.rows[0].text, /Thru 4 Resume ›$/);
        assert.match(h.rows[1].text, /Final · Low: Test B \d+ Results ›$/);
        assert.deepEqual(h.rc.map((r) => r.code), ['U45SHR'], 'Recap on the finished round only');
        assert.equal(h.rc[0].t, 'Recap'); assert.match(h.rc[0].label, /^Share recap of Papago Golf Club$/);
        assert.ok(h.rc[0].r <= h.vw && h.rc[0].h >= 54, 'on screen, thumb-sized');
        assert.ok(h.rows[1].w > 200, 'the row keeps its width');
        assert.equal(h.nested, 0, 'no button inside a button');
        assert.ok(h.scrollW <= h.vw, 'no sideways scroll');
        if (SAVE) await j.shot(path.join(OUT, 'history-' + tag + '.png'));
        await j.evaluate("document.querySelector('[data-hp-recap=\"U45SHR\"]').click()");
        assert.ok(await until(j, "/settlement\\.html$/.test(location.pathname) && /game=U45SHR/.test(location.search) && /recap=1/.test(location.search)", 10000), 'the Receipt, ?recap=1');
        assert.ok(await until(j, '(window.__share || []).length === 1', 25000), 'the share sheet opened by itself (native)');
        const s = JSON.parse(await j.evaluate(STATE));
        assert.equal(s.fs.length, 1); assert.ok(s.fs[0].png); assert.equal(s.fs[0].directory, 'CACHE');
        assert.deepEqual(s.share[0].files, ['file:///stub-cache/' + s.fs[0].path]);
        assert.equal(s.geo, 0, 'no location asked');
        assert.equal(s.writes, 0, 'nothing written');
        await sleep(1500);
        assert.equal(JSON.parse(await j.evaluate(STATE)).share.length, 1, 'shared once, not again');
    });
}

test('Receipt ?recap=1 in a browser: no auto share (a tap is needed), the button is pulsed', { timeout: 120000 }, async () => {
    const res = await arriveCold({ url: fileUrl('settlement.html', 'game=U45SHR&recap=1'), db: DB(), viewport: { width: 393, height: 852 }, settleMs: 1500,
        preScript: SIMPLE + GEO + WEBSHARE, steps: [{ waitFor: "!!document.querySelector('.hp-rc-recap.hp-rc-pulse')", timeout: 20000 }, { sleep: 800 }, { expression: STATE }] });
    assert.ok(res.ok, res.reason);
    const s = parse(res).pop();
    assert.equal(s.wshare.length, 0);
});

test('History row action and the Receipt block: no data, network or location API', () => {
    const html = fs.readFileSync(path.join(REPO_ROOT, 'settlement.html'), 'utf8');
    const m = html.match(/window\.HpRecapShare = \(function \(\) \{([\s\S]*?)\n    \}\)\(\);/);
    assert.ok(m, 'the share block');
    assert.doesNotMatch(m[1], /geolocation|fetch\(|XMLHttpRequest|sendBeacon|WebSocket|firebase|\.ref\(|\.set\(|\.update\(|localStorage\.setItem|money|settle/i);
    const fd = fs.readFileSync(path.join(REPO_ROOT, 'front-door.js'), 'utf8');
    const r = fd.match(/function recapHref\(code, g\) \{([\s\S]*?)\n    \}/);
    assert.ok(r); assert.match(r[1], /^\s*return 'settlement\.html\?game=' \+ encodeURIComponent\(code\)/);
    assert.match(html, /<!-- GPS:BEGIN -->[\s\S]*window\.HpRecapShare[\s\S]*<!-- GPS:END -->/, 'HardPan only (the GPS block)');
});
