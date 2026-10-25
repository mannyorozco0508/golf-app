// ============================================================================
// HARDPAN GPS MAP - THE APP STORE ENTITLEMENT (gps-store-iap, 2026-10-17; paid launch,
// Manny mailbox 007, 2026-10-17)
//
// App Store Guideline 3.1.1: GPS Map (ALL of GPS) is sold through StoreKit only
// (RevenueCat's Capacitor plugin), behind HARDPAN_GPS_CONFIG.iap - ON for v2.0. This
// file holds:
//   - the old URL tier switch is gone from every shipped file, tool and doc;
//   - the shipped config: iap ON, an empty key -> no entitlement (the paywall), not
//     one plugin call, never a throw; flag off: not one purchase call;
//   - flag on, the plugin stubbed: gps_map active -> GPS, inactive -> none; Restore
//     calls restorePurchases and reads again; a cancel or an error leaves none with one
//     sentence; no plugin / no key never throws; whenKnown waits for the first answer;
//   - the paywall sheet's two faces (store / no store) and that it never opens for a
//     subscriber. Its words are gps_paywall_test.js.
// The browser checks: tools/gps-check.js (free, clear, iap, iapon) and
// tools/gps-paywall-check.js (every entry point).
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
const ON_CFG = { iap: true, revenueCatKey: 'appl_TEST', iapEntitlement: 'gps_map', iapProduct: 'com.rattlegolf.app.gpsmap.yearly' };
// RevenueCat's documented calls, recorded. active: is gps_map in entitlements.active.
function stub(o) {
    o = Object.assign({ active: false, buy: 'ok', restoreActive: null }, o);
    const calls = [];
    const info = () => ({ entitlements: { active: o.active ? { gps_map: { identifier: 'gps_map', isActive: true } } : {}, all: {} } });
    const pkg = { identifier: '$rc_annual', packageType: 'ANNUAL', product: { identifier: 'com.rattlegolf.app.gpsmap.yearly', title: 'GPS Map', priceString: '$1.23', price: 1.23, subscriptionPeriod: 'P1Y', introPrice: { price: 0, priceString: '$0.00', period: 'P1W', cycles: 1, periodUnit: 'WEEK', periodNumberOfUnits: 1 } } };
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

// ---- 2. THE SHIPPED CONFIG (iap ON, no key) AND FLAG OFF ----------------------------
test('the shipped config: iap ON, the GPS Map ids, an EMPTY key -> no entitlement, no plugin call, no throw', { skip }, async () => {
    const c = {}; vm.runInNewContext(read('gps-config.js'), { window: c });
    const cfg = c.HARDPAN_GPS_CONFIG;
    assert.strictEqual(cfg.iap, true, 'iap is ON for v2.0');
    assert.strictEqual(cfg.revenueCatKey, '', 'no RevenueCat key in the repo');
    assert.ok(!/sk_[A-Za-z0-9]/.test(read('gps-config.js')), 'never a RevenueCat secret key');
    assert.strictEqual(cfg.iapEntitlement, 'gps_map');
    assert.strictEqual(cfg.iapProduct, 'com.rattlegolf.app.gpsmap.yearly');
    const P = stub({ active: true });
    const { E } = load(cfg, P);
    const p = await cb(E.refresh);
    assert.strictEqual(E.enabled(), true);
    assert.strictEqual(p, false); assert.strictEqual(E.isPro(), false, 'no key: no entitlement, even with one on the account');
    assert.strictEqual(E.known(), true, 'answered (no) at once - the paywall, never a wait');
    assert.deepStrictEqual(P.calls, [], 'no key: the plugin is never configured or asked');
    const r = await cb(E.purchase);
    assert.strictEqual(r.pro, false); assert.strictEqual(r.outcome, 'unavailable');
});

test('flag off: no purchase call at all, and GPS follows the build\'s paywall switch', { skip }, async () => {
    const P = stub({ active: true });
    const { E } = load(Object.assign({}, ON_CFG, { iap: false }), P);
    await new Promise((r) => setTimeout(r, 20));
    assert.strictEqual(E.enabled(), false);
    assert.strictEqual(E.isPro(), false, 'flag off: the entitlement is never asked, even with one');
    assert.strictEqual(E.known(), true);
    const r1 = await cb(E.purchase), r2 = await cb(E.restore), o = await cb(E.offer), p = await cb(E.refresh);
    assert.strictEqual(r1.pro, false); assert.strictEqual(r2.pro, false); assert.strictEqual(o.fromStore, false); assert.strictEqual(p, false);
    assert.deepStrictEqual(P.calls, [], 'flag off: the plugin was called');
    // hasGpsPro (URGENT-062): the build's paywall switch first (off = GPS on, no store asked);
    // on: the entitlement (or this round's pass - a round in progress is never locked);
    // on with no store = no GPS.
    const v = read('gps-view.js');
    const fn = v.slice(v.indexOf('function hasGpsPro('), v.indexOf('}', v.indexOf('function hasGpsPro(')) + 1);
    assert.ok(/if \(cfg\(\)\.paywall !== true\) return true;\s*if \(iapOn\(\)\) return entitlement\(\)\.isPro\(\) === true \|\| roundPass\(code\);\s*return false;/.test(fn), fn);
});

test('whenKnown: answers once the store has, or after its timeout - never twice', { skip }, async () => {
    const A = stub({ active: true });
    const a = load(ON_CFG, A);
    const got = [];
    a.E.whenKnown((v) => got.push(v), 5000);
    assert.deepStrictEqual(got, [], 'not before the store answers');
    await cb(a.E.refresh);
    await new Promise((r) => setTimeout(r, 10));
    assert.deepStrictEqual(got, [true]);
    a.E.whenKnown((v) => got.push('again ' + v));
    assert.deepStrictEqual(got, [true, 'again true'], 'known: at once');
    // A store that never answers: the timeout answers "no entitlement", once.
    const H = stub({}); H.configure = () => new Promise(() => {});
    const h = load(ON_CFG, H);
    const g2 = [];
    h.E.whenKnown((v) => g2.push(v), 30);
    await new Promise((r) => setTimeout(r, 80));
    assert.deepStrictEqual(g2, [false]);
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
test('flag on: an active gps_map entitlement -> GPS; inactive -> none (configure once, the public key only)', { skip }, async () => {
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
    // Another entitlement id active is not GPS Map.
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
    assert.strictEqual(s.message, 'No GPS Map subscription was found for this Apple ID.');
});

test('Subscribe: the yearly package is bought -> Pro; cancel / error / pending leave Free with one sentence', { skip }, async () => {
    const P = stub({ active: false, buy: 'ok' });
    const { E } = load(ON_CFG, P);
    const r = await cb(E.purchase);
    assert.strictEqual(r.pro, true); assert.strictEqual(E.isPro(), true);
    assert.deepStrictEqual(P.calls.filter((c) => c[0] === 'purchasePackage'), [['purchasePackage', 'com.rattlegolf.app.gpsmap.yearly']]);
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
    assert.deepStrictEqual(JSON.parse(JSON.stringify(o)), { fromStore: true, title: 'GPS Map', price: '$1.23', period: '1-year', trial: '7-day' });
});

// ---- 4. THE PAYWALL SHEET ------------------------------------------------------------
// Its words: gps_paywall_test.js. Here: its two faces, and it never opens for a subscriber.
test('the paywall sheet: the store face (trial, Restore, Terms + Privacy) or, with no store, one sentence; never for a subscriber; never "soon"', { skip }, () => {
    const v = read('gps-view.js');
    const sheet = v.slice(v.indexOf('var PW_MARKUP'), v.indexOf('var PW_CSS'));
    assert.ok(sheet.length > 300, 'positive: the sheet markup was found');
    assert.ok(!/disabled/.test(sheet), 'no disabled placeholder button');
    assert.ok(!/soon/i.test(sheet) && !/soon/i.test(v.slice(v.indexOf('THE PAYWALL AND THE GATE'), v.indexOf('NO PULL-DOWN ON GPS'))), 'the paywall never says soon');
    // The purchase buttons and the links sit inside the store-only block.
    const iap = sheet.slice(sheet.indexOf('gps-sheet-iap'), sheet.indexOf('gps-sheet-close'));
    ['gps-sheet-buy', 'gps-sheet-restore', 'gps-sheet-terms', 'gps-sheet-privacy', 'gps-sheet-price', 'gps-sheet-trial', 'gps-sheet-renew'].forEach((c) => assert.ok(iap.includes(c), c));
    // Flag off: the store block hidden, the one sentence shown.
    const paint = v.slice(v.indexOf('function paintSheet('), v.indexOf('function openPaywall('));
    assert.ok(/pshow\('\.gps-sheet-off', !on\)/.test(paint) && /pshow\('\.gps-sheet-iap', on\)/.test(paint) && /if \(!on\) return;/.test(paint));
    assert.ok(/var SHEET_OFF = "GPS Map isn\\u2019t available in this build\.";/.test(v));
    // Never for a subscriber: the gate goes straight on when entitled, and waits while the
    // store's first answer is pending.
    const gate = v.slice(v.indexOf('function requireGps('), v.indexOf('function roundCourseName('));
    assert.ok(/if \(hasGpsPro\(\)\) \{ yes\(\); return true; \}/.test(gate) && /if \(proPending\(\)\) \{ entitlement\(\)\.whenKnown\(decide, PENDING_MS\); return false; \}/.test(gate), gate);
    // A trial / restore that says yes unlocks GPS at once.
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
