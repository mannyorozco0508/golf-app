// ============================================================================
// GPS IS PAID: THE PAYWALL, THE FOUNDING WINDOW, THE ONE GATE (paid launch:
// Manny, mailbox 007, 2026-10-17)
//
// v2.0: ALL of GPS is the "GPS Map" subscription (com.rattlegolf.app.gpsmap.yearly,
// entitlement gps_map): a 7-day free trial, then auto-renewing yearly. No free GPS
// tier. This file holds, without a browser:
//   - the paywall's required words: "Start 7-day free trial", the STORE's price with
//     the founding wording while the window is open and the standard wording after,
//     the auto-renew / cancel sentence, the trial line, Restore Purchases, Terms of
//     Use + Privacy Policy, "Not now" - and no price that did not come from StoreKit;
//   - the founding config: gps_meta/config read best-effort, absent / unreadable =
//     open, foundingCap default 1000 (gps-config.js);
//   - the course line ("Caledonia: 18/18 ✓");
//   - the gate: entitled -> go; not -> the paywall (or, quiet, no); the store's answer
//     pending -> it waits; the flag on with no entitlement module -> no GPS;
//   - no "free GPS" / "free yardage" wording in the shipped GPS files.
// The browser sweep of every entry point is tools/gps-paywall-check.js.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = __dirname;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ON = fs.existsSync(path.join(ROOT, 'gps-view.js'));
const skip = ON ? false : 'Consumer tree: no GPS';

const RENEW = 'Renews automatically each year unless cancelled at least 24 hours before the end of the current period. Manage or cancel in Settings > Apple ID > Subscriptions.';
const STORE = { fromStore: true, title: 'GPS Map', price: '$24.99', period: '1-year', trial: '7-day' };

// gps-view.js in a sandbox: a window, a config, and optionally an entitlement.
function view(config, ent) {
    const sb = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, sessionStorage: { getItem: () => null, setItem() {} },
        JSON, Object, Math, Number, String, Date, Promise, RegExp, isFinite, setTimeout, clearTimeout, navigator: {} };
    sb.window = sb;
    sb.HARDPAN_GPS_CONFIG = config || {};
    if (ent) sb.HardPanEntitlement = ent;
    vm.createContext(sb);
    vm.runInContext(read('gps-view.js'), sb);
    return sb;
}
const all = (t) => [t.title, t.course, t.buy, t.founding, t.price, t.product, t.length, t.trial, t.renew].join(' | ');

test('the paywall: Start 7-day free trial, the store price with the FOUNDING wording while the window is open', { skip }, () => {
    const V = view({}).HardPanGps;
    const t = V.paywallText(STORE, { open: true, cap: 1000 });
    assert.strictEqual(t.buy, 'Start 7-day free trial');
    assert.strictEqual(t.price, '$24.99/year founding price (locked while subscribed)');
    assert.strictEqual(t.priceSrc, 'store');
    assert.strictEqual(t.founding, 'Founding price · locked while subscribed · first 1,000 subscribers');
    assert.strictEqual(t.trial, '7-day free trial, then $24.99/year. Your Apple ID is charged when the trial ends unless you cancel at least 24 hours before.');
    assert.strictEqual(t.renew, RENEW);
    assert.strictEqual(t.length, '1-year subscription, renews automatically.');
    assert.strictEqual(t.title, 'GPS Map');
    assert.ok(!/soon/i.test(all(t)));
});

test('the paywall after the founding window: the standard "<price>/year" wording, no founding words', { skip }, () => {
    const V = view({}).HardPanGps;
    const t = V.paywallText(STORE, { open: false, cap: 1000 });
    assert.strictEqual(t.price, '$24.99/year');
    assert.strictEqual(t.founding, '');
    assert.ok(!/founding/i.test(all(t)), all(t));
    assert.strictEqual(t.buy, 'Start 7-day free trial');
    assert.match(t.trial, /^7-day free trial, then \$24\.99\/year\. /);
    // Another store, another currency: whatever StoreKit says, as it says it.
    assert.strictEqual(V.paywallText(Object.assign({}, STORE, { price: '34,99 €' }), { open: false }).price, '34,99 €/year');
});

test('price text ONLY from StoreKit: no store price -> "the App Store shows the price", never a number', { skip }, () => {
    const V = view({ iapPriceFallback: '$9.99 per year' }).HardPanGps;
    for (const o of [null, { fromStore: false }, { fromStore: true, price: '', trial: '7-day' }]) {
        for (const open of [true, false]) {
            const t = V.paywallText(o, { open, cap: 1000 });
            assert.strictEqual(t.price, 'The App Store shows the price before you confirm.');
            assert.strictEqual(t.priceSrc, 'none');
            assert.ok(!/\$|\d+\.\d\d/.test([t.price, t.trial, t.buy, t.product].join(' ')), all(t));
            assert.strictEqual(t.buy, 'Start 7-day free trial');
            assert.match(t.trial, /^7-day free trial, then the yearly price the App Store shows\. Your Apple ID is charged when the trial ends unless you cancel at least 24 hours before\.$/);
            assert.strictEqual(t.renew, RENEW);
        }
    }
    // The old config fallback price is gone from the shipped config and the code.
    assert.ok(!/iapPriceFallback/.test(read('gps-config.js')) && !/iapPriceFallback/.test(read('gps-view.js')));
    // No price literal anywhere in the paywall's code.
    const v = read('gps-view.js');
    const pw = v.slice(v.indexOf('// ---- THE PAYWALL AND THE GATE'), v.indexOf('// ---- NO PULL-DOWN ON GPS'));
    assert.ok(pw.length > 2000 && /function sheetText\(/.test(pw), 'positive: the paywall section was found');
    assert.ok(!/\$\s?\d|\d+\.\d\d\s*(\/|per)\s*year/.test(pw), 'a price is written into the paywall code');
    // A store product with NO free introductory offer: no trial words (never promise one).
    const n = V.paywallText({ fromStore: true, price: '$34.99', trial: null }, { open: false });
    assert.strictEqual(n.buy, 'Subscribe'); assert.strictEqual(n.trial, ''); assert.strictEqual(n.price, '$34.99/year');
});

test('the paywall markup: the trial button first, Restore Purchases, Terms of Use + Privacy Policy links, Not now', { skip }, () => {
    const v = read('gps-view.js');
    const m = v.slice(v.indexOf('var PW_MARKUP'), v.indexOf('var PW_CSS'));
    assert.ok(m.length > 300, 'positive: the paywall markup was found');
    assert.ok(/<button type="button" class="gps-sheet-buy">Start 7-day free trial<\/button>/.test(m));
    assert.ok(/<button type="button" class="gps-sheet-restore">Restore Purchases<\/button>/.test(m));
    assert.ok(/class="gps-sheet-terms"[^>]*>Terms of Use</.test(m) && /class="gps-sheet-privacy"[^>]*>Privacy Policy</.test(m));
    assert.ok(/<button type="button" class="gps-sheet-close">Not now<\/button>/.test(m));
    ['gps-sheet-course', 'gps-sheet-founding', 'gps-sheet-price', 'gps-sheet-trial', 'gps-sheet-renew', 'gps-sheet-length', 'gps-sheet-product'].forEach((c) => assert.ok(m.includes(c), c));
    assert.ok(m.indexOf('gps-sheet-buy') < m.indexOf('gps-sheet-price'), 'the trial button is the primary, first action');
    // The links are the config's Terms (terms.html) and Privacy (privacy.html) pages.
    const c = {}; vm.runInNewContext(read('gps-config.js'), { window: c });
    assert.match(c.HARDPAN_GPS_CONFIG.iapTermsUrl, /^https:\/\/[^/]+\/terms\.html$/);
    assert.match(c.HARDPAN_GPS_CONFIG.iapPrivacyUrl, /^https:\/\/[^/]+\/privacy\.html$/);
    assert.ok(/'\.gps-sheet-terms'[\s\S]{0,300}iapTermsUrl/.test(v) && /iapPrivacyUrl/.test(v));
    // Not inside the GPS side any more: the paywall is its own sheet over the page.
    const markup = v.slice(v.indexOf('var MARKUP'), v.indexOf('var TOGGLE_H'));
    assert.ok(markup.length > 1000 && /gps-yardbox|gps-big/.test(markup), 'positive: the GPS side markup was found');
    assert.ok(!/gps-sheet|gps-get-pro|gps-basic/.test(markup), 'a paywall / free screen is still inside the GPS side');
});

test('the founding window: gps_meta/config wins; absent or unreadable = open; foundingCap default 1000', { skip }, () => {
    const V = view({ foundingCap: 1000 }).HardPanGps;
    const d = JSON.parse(JSON.stringify(V.foundingFrom(null)));
    assert.deepStrictEqual(d, { open: true, cap: 1000, src: 'default' });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(V.foundingFrom({ foundingOpen: false }))), { open: false, cap: 1000, src: 'server' });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(V.foundingFrom({ foundingOpen: true, foundingCap: 1500 }))), { open: true, cap: 1500, src: 'server' });
    // Garbage is the default, never "closed".
    for (const g of ['x', 7, { foundingOpen: 'no' }, { foundingCap: -3 }, []]) assert.strictEqual(V.foundingFrom(g).open, true, JSON.stringify(g));
    // The cap is easy to change: gps-config.js foundingCap (the server's wins).
    assert.strictEqual(view({ foundingCap: 250 }).HardPanGps.foundingFrom(null).cap, 250);
    assert.strictEqual(view({}).HardPanGps.foundingFrom(null).cap, 1000);
    const c = {}; vm.runInNewContext(read('gps-config.js'), { window: c });
    assert.strictEqual(c.HARDPAN_GPS_CONFIG.foundingCap, 1000);
    // The read: best effort, gps_meta/config, a short timeout, never a write.
    const v = read('gps-view.js');
    const fn = v.slice(v.indexOf('function founding('), v.indexOf('function courseLine('));
    assert.ok(/ref\('gps_meta\/config'\)\.once\('value'\)/.test(fn) && /FOUNDING_MS/.test(fn), fn);
    assert.ok(!/\.(set|update|push|transaction)\(/.test(fn), 'the founding read writes');
    assert.ok(/var FOUNDING_MS = \d{3,4};/.test(v));
});

test('the course line: "Caledonia: 18/18 ✓", partial and none said plainly', { skip }, () => {
    const V = view({}).HardPanGps;
    assert.strictEqual(V.courseLine('Caledonia', 18, 18), 'Caledonia: 18/18 ✓');
    assert.strictEqual(V.courseLine('Thistle Golf Club (NC - 27 Hole)', 18, 18), 'Thistle Golf Club: 18/18 ✓');
    assert.strictEqual(V.courseLine('Pine Lakes', 2, 18), 'Pine Lakes: 2/18 holes with GPS');
    assert.strictEqual(V.courseLine('Pine Lakes', 0, 18), 'Pine Lakes: no holes with GPS yet');
    assert.strictEqual(V.courseLine('', 18, 18), '');
    assert.strictEqual(V.courseLine('X', 3, 0), '');
    const t = V.paywallText(STORE, { open: true }, { name: 'Caledonia', n: 9, of: 9 });
    assert.strictEqual(t.course, 'Caledonia: 9/9 ✓');
});

test('the one gate: entitled -> go; not -> the paywall (quiet: no); the store pending -> it waits', { skip }, async () => {
    const ent = (o) => Object.assign({ enabled: () => true, isPro: () => o.pro, known: () => o.known, onChange() {}, whenKnown(cb) { o.waiters.push(cb); } }, {}), st = (pro, known) => ({ pro, known, waiters: [] });
    let s = st(true, true), V = view({ iap: true }, ent(s)).HardPanGps, got = [];
    assert.strictEqual(V.requireGps({}, () => got.push('go'), () => got.push('no')), true);
    assert.deepStrictEqual(got, ['go']);
    s = st(false, true); V = view({ iap: true }, ent(s)).HardPanGps; got = [];
    V.requireGps({ quiet: true }, () => got.push('go'), () => got.push('no'));
    assert.deepStrictEqual(got, ['no'], 'quiet and not entitled: no, and no paywall');
    // Pending: nothing yet; the answer decides.
    s = st(false, false); V = view({ iap: true }, ent(s)).HardPanGps; got = [];
    V.requireGps({ quiet: true }, () => got.push('go'), () => got.push('no'));
    assert.deepStrictEqual(got, [], 'decided before the store answered');
    assert.strictEqual(s.waiters.length, 1);
    s.pro = true; s.known = true; s.waiters[0](true);
    assert.deepStrictEqual(got, ['go']);
    // The flag on but no entitlement module on the page: no GPS (fail closed).
    assert.strictEqual(view({ iap: true }).HardPanGps.hasGpsPro(), false);
    // The flag off (a build with no store): the build's own switch, as before.
    assert.strictEqual(view({ iap: false, paywall: false }).HardPanGps.hasGpsPro(), true);
    assert.strictEqual(view({ iap: false, paywall: true }).HardPanGps.hasGpsPro(), false);
});

test('the gate is wired: showSide and the landing refuse GPS without GPS Map; the Home doors ask first', { skip }, () => {
    const v = read('gps-view.js');
    const ss = v.slice(v.indexOf('    function showSide('), v.indexOf('\n    function ', v.indexOf('    function showSide(') + 30));
    assert.ok(/side === 'gps' && !S\.pro/.test(ss) && /requireGps\(/.test(ss) && /return false;/.test(ss), 'showSide has the gate: ' + ss.slice(0, 600));
    assert.ok(ss.indexOf('requireGps(') < ss.indexOf("document.body.classList.toggle('gps-side-gps'"), 'the gate comes before GPS is shown');
    assert.ok(/quiet: quiet/.test(ss) && /o\.remember === false/.test(ss), 'a programmatic return is quiet');
    const land = v.slice(v.indexOf('    function land('), v.indexOf('\n    function ', v.indexOf('    function land(') + 30));
    assert.ok(/proPending\(\)/.test(land) && /whenKnown/.test(land) && /if \(!S\.pro\) \{ if \(storedSide\(\) === 'gps' && !sheetSeen\(\)\) showSide\('gps'\); return; \}/.test(land), land.slice(0, 800));
    assert.ok(/#gps-overlay\.gps-locked\{display:none !important;\}/.test(v) && /el\.classList\.toggle\('gps-locked', !S\.pro\)/.test(v), 'a locked GPS side is never drawn');
    assert.ok(/function prefetchCourseElevs\(\) \{\s*if \(!S \|\| !S\.pro/.test(v), 'no elevation fetched without GPS Map');
    assert.ok(/requireGps: requireGps/.test(v));
    // Home: the GPS door, #pick / #gps and a course pick ask the gate.
    const fd = read('front-door.js');
    assert.ok(/function gpsGate\(c, go, no\)/.test(fd) && /V\.requireGps\(/.test(fd));
    assert.ok(/if \(d === 'gps'\) \{ gpsGate\(homeCourse\(\)/.test(fd), 'the GPS door');
    const pick = fd.slice(fd.indexOf('function pickCourse('), fd.indexOf('function gpsGate('));
    assert.ok(/gpsGate\(/.test(pick) && /startRound\(/.test(pick) && pick.indexOf('gpsGate(') < pick.indexOf('startRound('), 'a course pick');
    const hs = fd.slice(fd.indexOf('function homeStart('), fd.indexOf('function mainDecor('));
    assert.ok((hs.match(/gpsGate\(homeCourse\(\)/g) || []).length === 2, '#pick and #gps');
    // home.html carries the gate (the entitlement, then gps-view.js) before front-door.js.
    const h = read('home.html');
    const e = h.indexOf('<script src="gps-entitlement.js"></script>'), g = h.indexOf('<script src="gps-view.js"></script>'), f = h.indexOf('<script src="front-door.js"></script>');
    assert.ok(h.indexOf('<script src="gps-config.js"></script>') < e && e < g && g < f, 'home.html script order');
});

test('the ids: iap ON, product com.rattlegolf.app.gpsmap.yearly, entitlement gps_map, no key in the repo', { skip }, () => {
    const c = {}; vm.runInNewContext(read('gps-config.js'), { window: c });
    const cfg = c.HARDPAN_GPS_CONFIG;
    assert.strictEqual(cfg.iap, true);
    assert.strictEqual(cfg.iapProduct, 'com.rattlegolf.app.gpsmap.yearly');
    assert.strictEqual(cfg.iapEntitlement, 'gps_map');
    assert.strictEqual(cfg.revenueCatKey, '');
    assert.ok(/'gps_map'/.test(read('gps-entitlement.js')), 'the entitlement default');
    // The old ids are gone from shipped code and checks.
    ['gps-config.js', 'gps-entitlement.js', 'gps-view.js', 'tools/gps-check.js', 'tools/lib/iap-stub.js'].forEach((f) => {
        const t = read(f);
        assert.ok(!/com\.rattlegolf\.app\.gps\.yearly/.test(t) && !/'gps_pro'/.test(t), f + ' still names an old id');
    });
});

test('no "free GPS" / "free yardage" wording in the shipped GPS files', { skip }, () => {
    // The course-data API's free quota (course-import-rules.js, trip-itinerary.js ...) and
    // Esri's free tier are NOT about GPS being free and are not scanned for.
    const FREE = /free\s+(gps|yardages?|front|numbers|tier of gps|version of gps|map)|gps\s+(is\s+|stays\s+|for\s+)?free|yardages?\s+(are\s+|stay\s+|is\s+)?(always\s+)?free|basic\s+yardages?|numbers[- ]only|\bfree:\s*the numbers|HardPan GPS Pro\b|GPS Pro\b/i;
    const files = ['gps-view.js', 'gps-config.js', 'gps-entitlement.js', 'front-door.js', 'home.html', 'index.html', 'instructions.html', 'support.html', 'admin.html', 'gps-live.js', 'gps-offline.js', 'gps-stats.js', 'gps-shots.js'];
    const hits = [];
    files.forEach((f) => {
        if (!fs.existsSync(path.join(ROOT, f))) return;
        read(f).split('\n').forEach((line, i) => { if (FREE.test(line)) hits.push(f + ':' + (i + 1) + ': ' + line.trim().slice(0, 120)); });
    });
    assert.deepStrictEqual(hits, [], hits.join('\n'));
    // Positive: the scan sees the files (the paid wording is there).
    assert.ok(/GPS Map/.test(read('gps-view.js')) && /7-day free trial/.test(read('gps-view.js')));
});
