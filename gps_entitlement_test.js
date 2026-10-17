// ============================================================================
// HARDPAN GPS PRO - THE APP STORE ENTITLEMENT AND THE PAYWALL (gps-store-iap, 2026-10-17)
//
// App Store Guideline 3.1.1: GPS Pro is sold through StoreKit only (RevenueCat's
// Capacitor plugin), behind HARDPAN_GPS_CONFIG.iap. This file holds:
//   - the old URL tier switch is gone from every shipped file, tool and doc;
//   - flag off: not one purchase call, and Pro is the build's paywall switch;
//   - flag on, the plugin stubbed: active -> Pro, inactive -> Free; Restore calls
//     restorePurchases and reads again; a cancel or an error leaves Free with one
//     sentence; no plugin / no key never throws;
//   - the paywall: every disclosure Apple asks for, Subscribe, Restore Purchases,
//     the Terms and Privacy links - and never "soon".
// The browser check is tools/gps-check.js (the free, clear, iap and iapon arms).
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = __dirname;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ON = fs.existsSync(path.join(ROOT, 'gps-entitlement.js'));
const skip = ON ? false : 'Consumer tree: no GPS Pro';
// Spelled in two halves so this file does not trip its own scan.
const OLD_SWITCH = 'gps' + 'tier';

// The module in a sandbox: a window, a config, and (optionally) a stubbed plugin.
function load(config, stub) {
    const store = {};
    const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const sb = { localStorage, JSON, Object, Math, Number, String, Date, Promise, RegExp, isFinite, setTimeout };
    sb.window = sb;
    sb.HARDPAN_GPS_CONFIG = config;
    if (stub) sb.Capacitor = { isNativePlatform: () => true, Plugins: { Purchases: stub } };
    vm.createContext(sb);
    vm.runInContext(read('gps-entitlement.js'), sb);
    return { E: sb.HardPanEntitlement, sb, store };
}
const ON_CFG = { iap: true, revenueCatKey: 'appl_TEST', iapEntitlement: 'gps_pro', iapProduct: 'com.rattlegolf.app.gps.yearly' };
// RevenueCat's documented calls, recorded. active: is gps_pro in entitlements.active.
function stub(o) {
    o = Object.assign({ active: false, buy: 'ok', restoreActive: null }, o);
    const calls = [];
    const info = () => ({ entitlements: { active: o.active ? { gps_pro: { identifier: 'gps_pro', isActive: true } } : {}, all: {} } });
    const pkg = { identifier: '$rc_annual', packageType: 'ANNUAL', product: { identifier: 'com.rattlegolf.app.gps.yearly', title: 'HardPan GPS Pro', priceString: '$1.23', price: 1.23, subscriptionPeriod: 'P1Y', introPrice: { price: 0, priceString: '$0.00', period: 'P1W', cycles: 1, periodUnit: 'WEEK', periodNumberOfUnits: 1 } } };
    const P = {
        calls, state: o,
        configure: (a) => { calls.push(['configure', a]); return Promise.resolve(); },
        addCustomerInfoUpdateListener: () => { calls.push(['listen']); return Promise.resolve('id'); },
        getCustomerInfo: () => { calls.push(['getCustomerInfo']); return Promise.resolve({ customerInfo: info() }); },
        getOfferings: () => { calls.push(['getOfferings']); return Promise.resolve({ current: { identifier: 'default', annual: pkg, availablePackages: [pkg] }, all: {} }); },
        purchasePackage: (a) => {
            calls.push(['purchasePackage', a && a.aPackage && a.aPackage.product.identifier]);
            if (o.buy === 'cancel') return Promise.reject({ code: '1', userCancelled: true, message: 'Purchase was cancelled.' });
            if (o.buy === 'error') return Promise.reject({ code: '2', message: 'There was a problem with the App Store.' });
            if (o.buy === 'pending') return Promise.reject({ code: '20', message: 'The payment is pending.' });
            o.active = true;
            return Promise.resolve({ productIdentifier: pkg.product.identifier, customerInfo: info() });
        },
        restorePurchases: () => { calls.push(['restorePurchases']); if (o.restoreActive != null) o.active = o.restoreActive; return Promise.resolve({ customerInfo: info() }); },
    };
    return P;
}
const cb = (fn) => new Promise((res) => fn(res));
const names = (P) => P.calls.map((c) => c[0]);

// ---- 1. THE OLD SWITCH IS GONE ---------------------------------------------------
test('no URL tier switch anywhere: shipped files, tools, docs, tests', () => {
    const hits = [];
    const scan = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach((d) => {
        const rel = path.join(dir, d.name);
        if (d.isDirectory()) { if (['tools', 'docs', 'helpers', 'lib'].includes(d.name) || dir !== '.') scan(rel); return; }
        if (!/\.(js|html|md|json|ts)$/.test(d.name) || rel.includes('node_modules')) return;
        const t = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        if (t.indexOf(OLD_SWITCH) !== -1) hits.push(rel);
    });
    scan('.');
    assert.deepStrictEqual(hits, [], 'the old tier switch is still named in ' + hits.join(', '));
    if (!ON) return;
    // The phone's old value is never READ - only cleared once.
    const v = read('gps-view.js');
    assert.ok(!/getItem\('hardpan_gps_tier'\)/.test(v), 'gps-view.js reads the old tier value');
    assert.ok(/removeItem\('hardpan_gps_tier'\)/.test(v), 'the old value is cleared');
    assert.ok(!/__hpTest|location\.search[^\n]*(pro|tier)/i.test(v + read('gps-entitlement.js')), 'no test hook / URL path to Pro in shipped code');
});

// ---- 2. FLAG OFF ------------------------------------------------------------------
test('flag off (the shipped config): no purchase call at all, and Pro is the paywall switch', { skip }, async () => {
    const c = {}; vm.runInNewContext(read('gps-config.js'), { window: c });
    const cfg = c.HARDPAN_GPS_CONFIG;
    assert.strictEqual(cfg.iap, false, 'iap is OFF in the repo');
    assert.strictEqual(cfg.revenueCatKey, '', 'no RevenueCat key in the repo');
    assert.ok(!/sk_[A-Za-z0-9]/.test(read('gps-config.js')), 'never a RevenueCat secret key');
    assert.strictEqual(cfg.iapEntitlement, 'gps_pro');
    assert.strictEqual(cfg.iapProduct, 'com.rattlegolf.app.gps.yearly');
    assert.ok(/PLAN ONLY/.test(read('gps-config.js')), 'the ids are marked plan only');
    const P = stub({ active: true });
    const { E } = load(Object.assign({}, cfg, { revenueCatKey: 'appl_TEST' }), P);
    await new Promise((r) => setTimeout(r, 20));
    assert.strictEqual(E.enabled(), false);
    assert.strictEqual(E.isPro(), false, 'flag off: the entitlement is never asked, even with one');
    assert.strictEqual(E.known(), true);
    const r1 = await cb(E.purchase), r2 = await cb(E.restore), o = await cb(E.offer), p = await cb(E.refresh);
    assert.strictEqual(r1.pro, false); assert.strictEqual(r2.pro, false); assert.strictEqual(o.fromStore, false); assert.strictEqual(p, false);
    assert.deepStrictEqual(P.calls, [], 'flag off: the plugin was called');
    // hasGpsPro with the flag off: exactly the paywall switch, as before.
    const v = read('gps-view.js');
    const fn = v.slice(v.indexOf('function hasGpsPro('), v.indexOf('}', v.indexOf('if (cfg().paywall !== true) return true;')) + 1);
    assert.ok(/if \(iapOn\(\)\) return entitlement\(\)\.isPro\(\) === true;\s*if \(cfg\(\)\.paywall !== true\) return true;\s*return false;/.test(fn), fn);
});

test('flag on with no plugin (the web, a check) or no key: Free, a sentence, never a throw', { skip }, async () => {
    for (const [cfg, P] of [[ON_CFG, null], [Object.assign({}, ON_CFG, { revenueCatKey: '' }), stub({ active: true })]]) {
        const { E } = load(cfg, P);
        assert.strictEqual(E.enabled(), true);
        const p = await cb(E.refresh);
        assert.strictEqual(p, false); assert.strictEqual(E.isPro(), false); assert.strictEqual(E.known(), true);
        const r = await cb(E.purchase);
        assert.strictEqual(r.pro, false); assert.strictEqual(r.outcome, 'unavailable'); assert.ok(/not available right now/.test(r.message));
        const s = await cb(E.restore);
        assert.strictEqual(s.pro, false); assert.ok(s.message.length > 10);
        if (P) assert.deepStrictEqual(P.calls, [], 'no key: the plugin is not configured');
    }
});

// ---- 3. FLAG ON, THE PLUGIN STUBBED -------------------------------------------------
test('flag on: an active gps_pro entitlement -> Pro; inactive -> Free (configure once, the public key only)', { skip }, async () => {
    const A = stub({ active: true });
    const a = load(ON_CFG, A);
    assert.strictEqual(a.E.known(), false, 'not known before the store answers');
    await cb(a.E.refresh);
    assert.strictEqual(a.E.isPro(), true);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(A.calls.filter((c) => c[0] === 'configure'))), [['configure', { apiKey: 'appl_TEST' }]], 'configured once, with nothing but the key');
    const I = stub({ active: false });
    const i = load(ON_CFG, I);
    await cb(i.E.refresh);
    assert.strictEqual(i.E.isPro(), false); assert.strictEqual(i.E.known(), true);
    // Another entitlement id active is not GPS Pro.
    const O = stub({ active: true });
    const o = load(Object.assign({}, ON_CFG, { iapEntitlement: 'something_else' }), O);
    await cb(o.E.refresh);
    assert.strictEqual(o.E.isPro(), false);
    assert.deepStrictEqual(Object.keys(a.store).concat(Object.keys(i.store)), [], 'nothing kept on the phone');
});

test('Restore calls restorePurchases and reads the entitlement again', { skip }, async () => {
    const P = stub({ active: false, restoreActive: true });
    const { E } = load(ON_CFG, P);
    await cb(E.refresh);
    assert.strictEqual(E.isPro(), false);
    const changes = []; E.onChange((v) => changes.push(v));
    const r = await cb(E.restore);
    assert.strictEqual(r.pro, true); assert.strictEqual(r.outcome, 'pro'); assert.strictEqual(E.isPro(), true);
    const n = names(P), at = n.lastIndexOf('restorePurchases');
    assert.ok(at !== -1 && n.indexOf('getCustomerInfo', at) > at, 'restorePurchases, then getCustomerInfo: ' + n.join(','));
    assert.deepStrictEqual(changes, [true], 'gps-view.js is told once');
    // Nothing to restore: Free, one sentence.
    const Q = stub({ active: false, restoreActive: false });
    const q = load(ON_CFG, Q);
    const s = await cb(q.E.restore);
    assert.strictEqual(s.pro, false); assert.strictEqual(s.outcome, 'none');
    assert.strictEqual(s.message, 'No GPS Pro subscription was found for this Apple ID.');
});

test('Subscribe: the yearly package is bought -> Pro; cancel / error / pending leave Free with one sentence', { skip }, async () => {
    const P = stub({ active: false, buy: 'ok' });
    const { E } = load(ON_CFG, P);
    const r = await cb(E.purchase);
    assert.strictEqual(r.pro, true); assert.strictEqual(E.isPro(), true);
    assert.deepStrictEqual(P.calls.filter((c) => c[0] === 'purchasePackage'), [['purchasePackage', 'com.rattlegolf.app.gps.yearly']]);
    const want = { cancel: ['cancelled', 'Purchase cancelled. Nothing was charged.'], error: ['error', 'The purchase did not go through. Please try again.'], pending: ['pending', /waiting for approval/] };
    for (const k of Object.keys(want)) {
        const Q = stub({ active: false, buy: k });
        const q = load(ON_CFG, Q);
        const x = await cb(q.E.purchase);
        assert.strictEqual(x.pro, false, k); assert.strictEqual(q.E.isPro(), false, k);
        assert.strictEqual(x.outcome, want[k][0], k);
        if (want[k][1] instanceof RegExp) assert.match(x.message, want[k][1]); else assert.strictEqual(x.message, want[k][1]);
        assert.ok(/^[A-Z][^.]*\.(\s[A-Z][^.]*\.)?$/.test(x.message), 'one plain sentence or two: ' + x.message);
    }
    // A plugin that throws outright: still Free, still a sentence.
    const T = stub({ active: false }); T.getOfferings = () => { throw new Error('boom'); };
    const t = load(ON_CFG, T);
    const y = await cb(t.E.purchase);
    assert.strictEqual(y.pro, false); assert.ok(y.message.length > 10);
});

test('the offer: title, price, 1-year period and the 7-day free trial come from StoreKit', { skip }, async () => {
    const { E } = load(ON_CFG, stub({}));
    const o = await cb(E.offer);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(o)), { fromStore: true, title: 'HardPan GPS Pro', price: '$1.23', period: '1-year', trial: '7-day' });
});

// ---- 4. THE PAYWALL ---------------------------------------------------------------
function viewApi() {
    const sb = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, JSON, Object, Math, Number, String, Date, Promise, RegExp, isFinite, setTimeout, clearTimeout, navigator: {} };
    sb.window = sb;
    sb.HARDPAN_GPS_CONFIG = { iapPriceFallback: '' };
    vm.createContext(sb);
    vm.runInContext(read('gps-view.js'), sb);
    return sb;
}
const RENEW = 'Renews automatically each year unless cancelled at least 24 hours before the end of the current period. Manage or cancel in Settings > Apple ID > Subscriptions.';
test('the paywall text: every required disclosure, with the store price - or the marked fallback', { skip }, () => {
    const sb = viewApi();
    const V = sb.HardPanGps;
    const all = (t) => [t.title, t.price, t.length, t.trial, t.renew].join(' ');
    const s = V.paywallText({ fromStore: true, title: 'HardPan GPS Pro', price: '$1.23', period: '1-year', trial: '7-day' });
    assert.strictEqual(s.priceSrc, 'store');
    ['HardPan GPS Pro', '$1.23 per year', '1-year subscription', '7-day free trial', 'charged $1.23 when the trial ends', RENEW].forEach((w) => assert.ok(all(s).includes(w), w + ' | ' + all(s)));
    // No store price, no fallback: no made-up price.
    const n = V.paywallText({ fromStore: false });
    assert.strictEqual(n.priceSrc, 'none');
    assert.ok(!/\$/.test(all(n)) && /shown by the App Store/.test(n.price) && n.renew === RENEW && /7-day free trial/.test(n.trial) && /1-year/.test(n.length));
    // The config fallback, ONLY when the store gave none, and marked.
    sb.HARDPAN_GPS_CONFIG = { iapPriceFallback: '$4.56 per year' };
    const f = V.paywallText({ fromStore: false });
    assert.strictEqual(f.priceSrc, 'config'); assert.strictEqual(f.price, '$4.56 per year');
    assert.strictEqual(V.paywallText({ fromStore: true, price: '$1.23' }).priceSrc, 'store', 'the store price wins');
    [s, n, f].forEach((t) => assert.ok(!/soon/i.test(all(t))));
});

test('the paywall sheet: Subscribe, Restore Purchases, Terms + Privacy links; flag off = one sentence, no buy button; never "soon"', { skip }, () => {
    const v = read('gps-view.js');
    const sheet = v.slice(v.indexOf("'<div class=\"gps-sheet\""), v.indexOf("var TOGGLE_H"));
    assert.ok(sheet.length > 200, 'positive: the sheet markup was found');
    assert.ok(/<button type="button" class="gps-sheet-buy">Subscribe<\/button>/.test(sheet));
    assert.ok(/<button type="button" class="gps-sheet-restore">Restore Purchases<\/button>/.test(sheet));
    assert.ok(/class="gps-sheet-terms"[^>]*>Terms of Use</.test(sheet) && /class="gps-sheet-privacy"[^>]*>Privacy Policy</.test(sheet));
    assert.ok(!/disabled/.test(sheet), 'no disabled placeholder button');
    assert.ok(!/soon/i.test(sheet) && !/soon/i.test(v.slice(v.indexOf('THE UPGRADE SHEET'), v.indexOf('NO PULL-DOWN ON GPS'))), 'the paywall never says soon');
    // Both purchase buttons and the links sit inside the iap-only block.
    const iap = sheet.slice(sheet.indexOf('gps-sheet-iap'), sheet.indexOf('gps-sheet-close'));
    ['gps-sheet-buy', 'gps-sheet-restore', 'gps-sheet-terms', 'gps-sheet-privacy', 'gps-sheet-price', 'gps-sheet-trial', 'gps-sheet-renew'].forEach((c) => assert.ok(iap.includes(c), c));
    // Flag off: the iap block hidden, the one sentence shown.
    const sync = v.slice(v.indexOf('function syncSheet('), v.indexOf('function sheetBusy('));
    assert.ok(/show\('\.gps-sheet-off', !on\)/.test(sync) && /show\('\.gps-sheet-iap', on\)/.test(sync) && /if \(!on\) return;/.test(sync));
    assert.ok(/var SHEET_OFF = "HardPan GPS Pro isn\\u2019t available in this build\.";/.test(v));
    // The links: the config's Terms (terms.html) and Privacy (privacy.html) pages.
    const c = {}; vm.runInNewContext(read('gps-config.js'), { window: c });
    assert.match(c.HARDPAN_GPS_CONFIG.iapTermsUrl, /^https:\/\/[^/]+\/terms\.html$/);
    assert.match(c.HARDPAN_GPS_CONFIG.iapPrivacyUrl, /^https:\/\/[^/]+\/privacy\.html$/);
    assert.ok(/'\.gps-sheet-terms'[\s\S]{0,200}iapTermsUrl/.test(v) && /iapPrivacyUrl/.test(v));
    // The sheet never opens for Pro, nor before the store has answered.
    assert.ok(/if \(!S\.pro && !sheetSeen\(\) && !proPending\(\)\) openSheet\(\);/.test(v));
    // A purchase / restore that says Pro turns the full screen on at once.
    assert.ok(/E\.onChange\(function \(p\) \{ if \(p\) becomePro\(\); \}\)/.test(v));
});

test('registered like every GPS file: GPS_SHELL, the Consumer GPS block, the precache, index.html before gps-view.js', { skip }, () => {
    const sync = read('sync-mobile-web.js');
    const list = (name) => [...(new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];').exec(sync)[1]).matchAll(/'([^']+)'/g)].map((m) => m[1]);
    assert.ok(list('GPS_SHELL').includes('gps-entitlement.js'));
    assert.ok(list('CONSUMER_SHELL').includes('gps-entitlement.js'));
    assert.ok(/'\.\/gps-entitlement\.js',\s*\n\s*\/\/ GPS:END/.test(read('sw.js')));
    const html = read('index.html');
    const e = html.indexOf('<script src="gps-entitlement.js"></script>');
    assert.ok(e > html.indexOf('<script src="gps-config.js"></script>') && e < html.indexOf('<script src="gps-view.js"></script>'));
    assert.ok(html.lastIndexOf('<!-- GPS:BEGIN -->', e) > html.lastIndexOf('<!-- GPS:END -->', e), 'inside a GPS block');
    // The plugin is not linked into an iOS target until Manny installs it (planned, not done).
    assert.ok(!/purchases-capacitor/.test(read('capacitor.config.ts')) && !/purchases-capacitor/.test(read('package.json')));
});
