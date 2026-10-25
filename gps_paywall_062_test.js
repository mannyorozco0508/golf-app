// ============================================================================
// URGENT-062: THE GOLF GPS PAYWALL ON STOREKIT 2 (PhoneBridge HardPanStore)
//
//   - the switch: gps-config.js paywall stays FALSE in the repo -> GPS on, no store asked
//     (an install never locks Manny out); GPS_PAYWALL=1 turns it on in a build copy only;
//   - the entitlement states (none / trial / paid / expired / cancelled / unknown product);
//   - NEVER LOCK A ROUND IN PROGRESS: the round pass (a trial that ends mid-round, the app
//     reopened mid-round), and nothing ever takes GPS away from a mounted round;
//   - trial end, restore (none / found), buy (founding vs regular product);
//   - the founding vs regular price display, the door tag and the Profile line words.
// The native side (StoreKit 2 against HardPan.storekit) is gps-beta/ios/App/AppStoreKitTests.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const os = require('os');
const { execFileSync } = require('child_process');
const ROOT = __dirname;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ON = fs.existsSync(path.join(ROOT, 'gps-entitlement.js'));
const skip = ON ? false : 'Consumer tree: no GPS';

const F = 'com.rattlegolf.app.gpsmap.founding.yearly', R = 'com.rattlegolf.app.gpsmap.yearly';
const DAY = 86400000;
const CFG = { iap: true, paywall: true, iapStore: 'storekit', iapEntitlement: 'gps_map', iapProduct: R, iapFoundingProduct: F, revenueCatKey: '' };

function mem() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, m }; }
// The HardPanStore plugin, stubbed with its documented answers. st: the status it reports.
function sk(o) {
    o = Object.assign({ st: { active: false, state: 'none' }, buy: 'pro', eligible: true, founding: true, restoreSt: null }, o);
    const calls = [];
    const P = {
        calls, o,
        addListener: (ev, fn) => { calls.push(['addListener', ev]); P.push = fn; return Promise.resolve({ remove() {} }); },
        products: (a) => { calls.push(['products', a.ids]); const list = [{ id: R, title: 'GPS Map', price: '$34.99', period: 'P1Y', trial: 'P1W', introEligible: o.eligible }];
            if (o.founding) list.push({ id: F, title: 'GPS Map', price: '$24.99', period: 'P1Y', trial: 'P1W', introEligible: o.eligible }); return Promise.resolve({ products: list }); },
        status: (a) => { calls.push(['status', a.ids]); return Promise.resolve(o.st); },
        purchase: (a) => { calls.push(['purchase', a.id]);
            if (o.buy === 'pro') o.st = { active: true, productId: a.id, expires: Date.now() + (o.eligible ? 7 : 365) * DAY, willRenew: true, trial: o.eligible, state: 'subscribed' };
            return Promise.resolve({ outcome: o.buy, status: o.st }); },
        restore: () => { calls.push(['restore']); if (o.restoreSt) o.st = o.restoreSt; return Promise.resolve({ status: o.st }); }
    };
    return P;
}
// RevenueCat's Capacitor plugin (@revenuecat/purchases-capacitor), stubbed with its documented shapes:
// CustomerInfo.entitlements.active.gps_map = EntitlementInfo { isActive, willRenew, periodType,
// productIdentifier, expirationDate, expirationDateMillis }. e: that entitlement, or null.
function rc(o) {
    o = Object.assign({ e: null, buy: 'ok', eligible: 2, founding: true, restoreE: undefined }, o);
    const calls = [];
    const info = () => ({ entitlements: { active: o.e ? { gps_map: Object.assign({ identifier: 'gps_map', isActive: true }, o.e) } : {}, all: {} } });
    const prod = (id, price) => ({ identifier: id, title: 'GPS Map', priceString: price, subscriptionPeriod: 'P1Y', introPrice: { price: 0, priceString: '$0.00', period: 'P1W', periodUnit: 'WEEK', periodNumberOfUnits: 1, cycles: 1 } });
    const reg = { identifier: '$rc_annual', packageType: 'ANNUAL', product: prod(R, '$34.99') };
    const fnd = { identifier: 'founding', packageType: 'CUSTOM', product: prod(F, '$24.99') };
    const ent = (id, trial, days) => ({ productIdentifier: id, periodType: trial ? 'TRIAL' : 'NORMAL', willRenew: true, expirationDateMillis: Date.now() + days * DAY, expirationDate: new Date(Date.now() + days * DAY).toISOString() });
    const P = {
        calls, o,
        configure: (a) => { calls.push(['configure', a]); return Promise.resolve(); },
        addCustomerInfoUpdateListener: (fn) => { calls.push(['listen']); P.push = (e) => { o.e = e; fn(info()); }; return Promise.resolve('l'); },
        getCustomerInfo: () => { calls.push(['getCustomerInfo']); return Promise.resolve({ customerInfo: info() }); },
        getOfferings: () => { calls.push(['getOfferings']); const pk = o.founding ? [reg, fnd] : [reg]; return Promise.resolve({ current: { identifier: 'default', annual: reg, availablePackages: pk }, all: {} }); },
        checkTrialOrIntroductoryPriceEligibility: (a) => { calls.push(['eligibility', a.productIdentifiers]); const m = {}; a.productIdentifiers.forEach((id) => { m[id] = { status: o.eligible }; }); return Promise.resolve(m); },
        purchasePackage: (a) => { const id = a.aPackage.product.identifier; calls.push(['purchasePackage', id]);
            if (o.buy === 'cancel') return Promise.reject({ code: '1', userCancelled: true });
            o.e = ent(id, o.eligible === 2, o.eligible === 2 ? 7 : 365); o.eligible = 1;
            return Promise.resolve({ productIdentifier: id, customerInfo: info() }); },
        restorePurchases: () => { calls.push(['restorePurchases']); if (o.restoreE !== undefined) o.e = o.restoreE; return Promise.resolve({ customerInfo: info() }); }
    };
    P.ent = ent;
    return P;
}
const RCFG = Object.assign({}, CFG, { iapStore: 'revenuecat', revenueCatKey: 'appl_TEST' });
function ent(config, plugin, ls, purchases) {
    const sb = { localStorage: ls || mem(), JSON, Object, Math, Number, String, Date, Promise, RegExp, isFinite, setTimeout, clearTimeout };
    sb.window = sb; sb.HARDPAN_GPS_CONFIG = config;
    if (plugin || purchases) sb.Capacitor = { Plugins: Object.assign({}, plugin ? { HardPanStore: plugin } : {}, purchases ? { Purchases: purchases } : {}) };
    vm.createContext(sb); vm.runInContext(read('gps-entitlement.js'), sb);
    return { E: sb.HardPanEntitlement, sb };
}
function view(config, E, ls) {
    const sb = { localStorage: ls || mem(), sessionStorage: { getItem: () => null, setItem() {} },
        JSON, Object, Math, Number, String, Date, Promise, RegExp, isFinite, setTimeout, clearTimeout, navigator: {} };
    sb.window = sb; sb.HARDPAN_GPS_CONFIG = config;
    if (E) sb.HardPanEntitlement = E;
    vm.createContext(sb); vm.runInContext(read('gps-view.js'), sb);
    return sb.HardPanGps;
}
const cb = (fn, ...a) => new Promise((res) => fn(res, ...a));
const tick = () => new Promise((r) => setTimeout(r, 15));
const plain = (x) => JSON.parse(JSON.stringify(x));

// ---- THE SWITCH ---------------------------------------------------------------------
test('the repo keeps the paywall OFF: GPS on, and with the switch off no store is ever asked', { skip }, async () => {
    const c = {}; vm.runInNewContext(read('gps-config.js'), { window: c });
    const cfg = c.HARDPAN_GPS_CONFIG;
    assert.strictEqual(cfg.paywall, false, 'paywall must stay false in the repo (an install never locks GPS)');
    // RevenueCat for 2.0 (Manny, Oct 24); the key stays empty in the repo, never a secret key.
    assert.strictEqual(cfg.iapStore, 'revenuecat');
    assert.strictEqual(cfg.revenueCatKey, '');
    assert.ok(!/sk_[A-Za-z0-9]/.test(read('gps-config.js')));
    assert.strictEqual(cfg.iapProduct, R); assert.strictEqual(cfg.iapFoundingProduct, F);
    assert.strictEqual(cfg.foundingCap, 1000, 'the founding cap: one number in gps-config.js');
    // Off: GPS on, even with the store saying "no subscription".
    const P = sk({}), RC = rc({});
    const { E } = ent(cfg, P, null, RC);
    await tick();
    assert.deepStrictEqual(P.calls, [], 'paywall off: not one store call at launch');
    assert.deepStrictEqual(RC.calls, [], 'paywall off: RevenueCat never configured or asked');
    assert.strictEqual(view(cfg, E).hasGpsPro(), true);
    assert.strictEqual(view(Object.assign({}, cfg, { iap: true }), null).hasGpsPro(), true, 'off: no entitlement module needed');
    assert.strictEqual(E.statusLine(), null, 'off: no Profile line');
    // On: the store decides.
    assert.strictEqual(view(Object.assign({}, cfg, { paywall: true }), E).hasGpsPro(), false);
    assert.strictEqual(view({ iap: false, paywall: true }).hasGpsPro(), false, 'on with no store at all: GPS off');
});

test('GPS_PAYWALL=1 turns it on in the BUILT copy only (and drops the dev switch); a plain build stays off', { skip }, () => {
    const a = fs.mkdtempSync(path.join(os.tmpdir(), 'gps062-')), b = fs.mkdtempSync(path.join(os.tmpdir(), 'gps062p-'));
    try {
        execFileSync(process.execPath, [path.join(ROOT, 'tools/build-gps-app.js')], { env: Object.assign({}, process.env, { GPS_APP_DEST: a, GPS_DEV_PRO: '1', GPS_PAYWALL: '' }), stdio: 'ignore' });
        execFileSync(process.execPath, [path.join(ROOT, 'tools/build-gps-app.js')], { env: Object.assign({}, process.env, { GPS_APP_DEST: b, GPS_DEV_PRO: '1', GPS_PAYWALL: '1' }), stdio: 'ignore' });
        const ca = fs.readFileSync(path.join(a, 'gps-config.js'), 'utf8'), cb2 = fs.readFileSync(path.join(b, 'gps-config.js'), 'utf8');
        assert.ok(!/paywall = true/.test(ca) && /devPro = true/.test(ca), 'the dev build: paywall off, dev switch on');
        assert.ok(/window\.HARDPAN_GPS_CONFIG\.paywall = true;/.test(cb2) && !/devPro = true/.test(cb2), 'the paywall build: on, no dev switch');
        const s = {}; vm.runInNewContext(cb2, { window: s }); assert.strictEqual(s.HARDPAN_GPS_CONFIG.paywall, true);
    } finally { fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true }); }
});

// ---- ENTITLEMENT STATES -------------------------------------------------------------
test('entitlement states from StoreKit: none, trial, paid, expired, cancelled, a product that is not ours', { skip }, async () => {
    const now = Date.now();
    const cases = [
        ['none', { active: false }, false],
        ['trial', { active: true, productId: F, expires: now + 7 * DAY, willRenew: true, trial: true }, true],
        ['paid regular', { active: true, productId: R, expires: now + 300 * DAY, willRenew: true, trial: false }, true],
        ['expired date', { active: true, productId: F, expires: now - 1000, willRenew: true, trial: false }, false],
        ['cancelled, period running', { active: true, productId: F, expires: now + 30 * DAY, willRenew: false, trial: false }, true],
        ['not our product', { active: true, productId: 'com.other.thing', expires: now + DAY }, false],
        ['garbage', null, false]
    ];
    for (const [name, st, want] of cases) {
        const { E } = ent(CFG, sk({ st }));
        await cb(E.refresh);
        assert.strictEqual(E.isPro(), want, name);
        assert.strictEqual(E.known(), true, name);
        const s = E.subscription();
        if (want) { assert.ok(s && s.active, name); } else { assert.ok(!s || !s.active, name); }
    }
    const t = ent(CFG, sk({ st: cases[1][1] })).E; await cb(t.refresh);
    assert.deepStrictEqual(plain(t.subscription()), { active: true, productId: F, expires: cases[1][1].expires, willRenew: true, trial: true, founding: true });
    // In memory only: nothing about the subscription is kept on the phone.
    const ls = mem(); const k = ent(CFG, sk({ st: cases[1][1] }), ls).E; await cb(k.refresh);
    assert.deepStrictEqual(Object.keys(ls.m), []);
    // A store with no plugin: no entitlement, never a throw.
    const n = ent(CFG, null).E; assert.strictEqual(await cb(n.refresh), false);
});

test('trial end: the store reports the change (or the period passes) -> no entitlement; a new round asks again', { skip }, async () => {
    const P = sk({ st: { active: true, productId: F, expires: Date.now() + 7 * DAY, willRenew: true, trial: true } });
    const { E } = ent(CFG, P);
    await cb(E.refresh);
    assert.strictEqual(E.isPro(), true);
    const seen = []; E.onChange((v) => seen.push(v));
    P.push({ active: false, state: 'expired' });           // Transaction.updates
    assert.strictEqual(E.isPro(), false); assert.deepStrictEqual(seen, [false]);
    const V = view(CFG, E);
    const got = [];
    V.requireGps({ quiet: true }, () => got.push('go'), () => got.push('no'));
    assert.deepStrictEqual(got, ['no'], 'a new round after the trial: not entitled');
    // The phone slept past the end: an expiry date in the past is never active.
    P.o.st = { active: true, productId: F, expires: Date.now() - 5, trial: true };
    await cb(E.refresh); assert.strictEqual(E.isPro(), false);
});

// ---- NEVER LOCK A ROUND IN PROGRESS ----------------------------------------------------
test('never lock a round in progress: the round pass keeps GPS for THIS round after the trial ends (and after a reopen)', { skip }, async () => {
    const P = sk({ st: { active: true, productId: F, expires: Date.now() + DAY, trial: true } });
    const ls = mem();
    const { E } = ent(CFG, P, ls);
    await cb(E.refresh);
    let V = view(CFG, E, ls);
    assert.strictEqual(V.hasGpsPro('ABC123'), true);
    V.grantRoundPass('ABC123');                            // what mounting a round with GPS does
    P.push({ active: false, state: 'expired' });            // the trial ends on hole 9
    assert.strictEqual(E.isPro(), false);
    assert.strictEqual(V.hasGpsPro('ABC123'), true, 'the round in progress keeps GPS');
    assert.strictEqual(V.hasGpsPro('ZZZ999'), false, 'any other round asks');
    V = view(CFG, E, ls);                                   // the app reopened mid-round
    assert.strictEqual(V.hasGpsPro('ABC123'), true, 'reopened mid-round: still GPS');
    assert.strictEqual(V.roundPass('ABC123', Date.now() + V.ROUND_PASS_MS + 1000), false, 'the pass ends (a round is a day)');
    // A second grant never moves the start forward.
    const at = JSON.parse(ls.m.hardpan_gps_round_pass).at;
    V.grantRoundPass('ABC123'); assert.strictEqual(JSON.parse(ls.m.hardpan_gps_round_pass).at, at);
    // Granted only while the paywall is on, and only by a round that HAD GPS.
    const ls2 = mem(); view(Object.assign({}, CFG, { paywall: false }), E, ls2).grantRoundPass('X1'); assert.deepStrictEqual(Object.keys(ls2.m), []);
    const v = read('gps-view.js');
    assert.ok(/pro: hasGpsPro\(opts\.eventCode\),[\s\S]{0,200}if \(S\.pro\) grantPass\(S\.eventCode\);/.test(v), 'mount grants the pass only when entitled');
    assert.ok(/S\.pro = true;\s*grantPass\(S\.eventCode\);/.test(v), 'becomePro grants it');
    // Nothing takes GPS away from a mounted round: S.pro is never set false, and the store's
    // "no" never reaches the round (onChange only acts on yes).
    assert.ok(!/S\.pro\s*=\s*false/.test(v) && !/pro:\s*false/.test(v));
    assert.ok(/E\.onChange\(function \(p\) \{ if \(p\) becomePro\(\); \}\)/.test(v));
});

// ---- RESTORE, BUY ---------------------------------------------------------------------
test('restore: nothing found -> one sentence; found (bought on another device) -> GPS', { skip }, async () => {
    const A = sk({});
    const a = ent(CFG, A).E;
    const r = await cb(a.restore);
    assert.strictEqual(r.pro, false); assert.strictEqual(r.outcome, 'none'); assert.strictEqual(r.message, 'No GPS Map subscription was found for this Apple ID.');
    const B = sk({ restoreSt: { active: true, productId: R, expires: Date.now() + 200 * DAY, willRenew: true } });
    const b = ent(CFG, B).E;
    const s = await cb(b.restore);
    assert.strictEqual(s.pro, true); assert.strictEqual(s.outcome, 'pro');
    assert.ok(B.calls.some((c) => c[0] === 'restore'));
    // A restore that fails: a sentence, never a throw.
    const C = sk({}); C.restore = () => Promise.reject(new Error('x'));
    const c = ent(CFG, C).E; const t = await cb(c.restore);
    assert.strictEqual(t.pro, false); assert.ok(/Restore did not go through/.test(t.message));
});

test('buy: the founding product while its window is open, else the regular one; cancel / pending say so', { skip }, async () => {
    const A = sk({}); const a = ent(CFG, A).E;
    const r = await cb(a.purchase, { founding: true });
    assert.strictEqual(r.pro, true); assert.deepStrictEqual(A.calls.filter((c) => c[0] === 'purchase'), [['purchase', F]]);
    assert.strictEqual(a.subscription().founding, true);
    const B = sk({}); const b = ent(CFG, B).E;
    await cb(b.purchase, { founding: false });
    assert.deepStrictEqual(B.calls.filter((c) => c[0] === 'purchase'), [['purchase', R]]);
    for (const [k, want] of [['cancelled', 'Purchase cancelled. Nothing was charged.'], ['pending', /waiting for approval/], ['error', 'The purchase did not go through. Please try again.']]) {
        const Q = sk({ buy: k }); const q = ent(CFG, Q).E; const x = await cb(q.purchase, { founding: true });
        assert.strictEqual(x.pro, false, k);
        if (want instanceof RegExp) assert.match(x.message, want); else assert.strictEqual(x.message, want);
    }
    // The paywall asks for the product it is showing.
    const v = read('gps-view.js');
    assert.ok(/var t = sheetText\(PW\.offer, PW\.founding, null\);[\s\S]{0,400}\{ founding: !!t\.buyFounding \}/.test(v));
});

// ---- PRICES ---------------------------------------------------------------------------------
test('the founding vs regular price on the paywall: $24.99 founding then $34.99, or $34.99 alone', { skip }, async () => {
    const { E } = ent(CFG, sk({}));
    const o = plain(await cb(E.offer));
    assert.deepStrictEqual(o, { fromStore: true, title: 'GPS Map', price: '$34.99', period: '1-year', trial: '7-day', founding: { price: '$24.99', trial: '7-day' } });
    const V = view(CFG, E);
    const open = V.paywallText(o, { open: true, cap: 1000 });
    assert.strictEqual(open.buy, 'Start 7-day free trial');
    assert.strictEqual(open.price, '$24.99/year founding price (locked while subscribed)');
    assert.strictEqual(open.regular, 'After the first 1,000 subscribers: $34.99/year.');
    assert.strictEqual(open.founding, 'Founding price · locked while subscribed · first 1,000 subscribers');
    assert.strictEqual(open.trial, '7-day free trial, then $24.99/year. Your Apple ID is charged when the trial ends unless you cancel at least 24 hours before.');
    assert.strictEqual(open.buyFounding, true);
    assert.match(open.renew, /^Renews automatically each year/);
    assert.strictEqual(open.length, '1-year subscription, renews automatically.');
    // The window closed (the server says so): the regular price, no founding words.
    const closed = V.paywallText(o, { open: false, cap: 1000 });
    assert.strictEqual(closed.price, '$34.99/year'); assert.strictEqual(closed.founding, ''); assert.strictEqual(closed.regular, ''); assert.strictEqual(closed.buyFounding, false);
    assert.match(closed.trial, /^7-day free trial, then \$34\.99\/year\./);
    // The founding product taken off sale in App Store Connect (the store stops offering it): regular.
    const { E: E2 } = ent(CFG, sk({ founding: false }));
    const off = V.paywallText(plain(await cb(E2.offer)), { open: true, cap: 1000 });
    assert.strictEqual(off.price, '$34.99/year'); assert.strictEqual(off.founding, ''); assert.strictEqual(off.buyFounding, false);
    // The cap number shown follows the config / the server.
    assert.strictEqual(V.paywallText(o, { open: true, cap: 250 }).regular, 'After the first 250 subscribers: $34.99/year.');
    // The trial already used in the group: no trial words, "Subscribe".
    const { E: E3 } = ent(CFG, sk({ eligible: false }));
    const used = V.paywallText(plain(await cb(E3.offer)), { open: true, cap: 1000 });
    assert.strictEqual(used.buy, 'Subscribe'); assert.strictEqual(used.trial, ''); assert.strictEqual(used.price, '$24.99/year founding price (locked while subscribed)');
    // The markup carries the regular line; no price literal in the paywall code.
    const v = read('gps-view.js');
    assert.ok(/class="gps-sheet-regular gps-sheet-fine"/.test(v));
});

// ---- THE DOOR TAG AND THE PROFILE LINE ----------------------------------------------------
test('the trial badge, the door tag and the Profile line: plain facts, no reminder, no cancel prompt', { skip }, async () => {
    const { E } = ent(CFG, sk({}));
    const at = (y, m, d) => new Date(y, m - 1, d, 12).getTime();
    const now = at(2026, 10, 24);
    assert.deepStrictEqual(plain(E.lineFor({ active: true, expires: at(2026, 10, 31), willRenew: true, trial: true }, now)), { line: 'Golf GPS · renews Oct 31, 2026', badge: 'Free trial', door: 'Free trial · 7 days left' });
    assert.deepStrictEqual(plain(E.lineFor({ active: true, expires: at(2026, 10, 25), willRenew: true, trial: true }, now)).door, 'Free trial · 1 day left');
    assert.deepStrictEqual(plain(E.lineFor({ active: true, expires: at(2027, 10, 21), willRenew: true, trial: false }, now)), { line: 'Golf GPS · renews Oct 21, 2027', badge: '', door: '' });
    assert.strictEqual(E.lineFor({ active: true, expires: at(2027, 10, 21), willRenew: false }, now).line, 'Golf GPS · ends Oct 21, 2027');
    assert.strictEqual(E.lineFor({ active: false }, now), null);
    const V = view(CFG, E);
    assert.deepStrictEqual(plain(V.doorTag(null, { fromStore: true, trial: '7-day', founding: { price: '$24.99', trial: '7-day' } })), { text: '7-day free trial', kind: 'offer' });
    assert.strictEqual(V.doorTag(null, { fromStore: true, trial: null, founding: null }), null, 'no trial left: no tag');
    assert.strictEqual(V.doorTag(null, { fromStore: false }), null, 'no store answer: no tag (never a promise)');
    assert.deepStrictEqual(plain(V.doorTag({ line: 'x', door: 'Free trial · 3 days left' })), { text: 'Free trial · 3 days left', kind: 'trial' });
    assert.strictEqual(V.doorTag({ line: 'Golf GPS · renews Oct 21, 2027', door: '' }), null, 'a subscriber: nothing');
    // The Profile sheet: one plain row, not a button, only from statusLine.
    const ui = read('hp-account-ui.js');
    const fn = ui.slice(ui.indexOf('function subLine('), ui.indexOf('function movedCount('));
    assert.ok(/E\.statusLine\(\)/.test(fn) && /<div class="hpa-li hpa-sub">/.test(fn) && !/<button/.test(fn) && !/data-hpa=/.test(fn), fn);
    assert.ok(/'<\/div>' \+ subLine\(\)/.test(ui));
    // No renewal reminder, no cancel prompt, no manage-subscriptions call anywhere new.
    const all = [read('gps-entitlement.js'), read('gps-view.js'), ui, read('gps-beta/ios/App/PhoneBridge/HardPanStorePlugin.swift')].join('\n');
    assert.ok(!/showManageSubscriptions|UNUserNotificationCenter|LocalNotifications|remind me/i.test(all));
});

test('StoreKit 2 in PhoneBridge stays (unused): registered; RevenueCat the one package added; the .storekit file in the test bundle only, and in the App scheme', { skip }, () => {
    const vc = read('gps-beta/ios/App/PhoneBridge/HardPanBridgeViewController.swift');
    assert.ok(/registerPluginInstance\(HardPanStorePlugin\(\)\)/.test(vc));
    const sw = read('gps-beta/ios/App/PhoneBridge/HardPanStorePlugin.swift');
    assert.ok(/jsName = "HardPanStore"/.test(sw) && /Transaction\.currentEntitlements/.test(sw) && /AppStore\.sync\(\)/.test(sw) && /Transaction\.updates/.test(sw));
    // The ONE package added (Manny's approved exception, Oct 24): RevenueCat, pinned, in the iOS build.
    const pj = JSON.parse(read('gps-beta/package.json'));
    assert.strictEqual(pj.dependencies['@revenuecat/purchases-capacitor'], '13.7.3', 'pinned exactly');
    assert.ok(JSON.parse(read('gps-beta/capacitor.config.json')).ios.includePlugins.includes('@revenuecat/purchases-capacitor'));
    assert.ok(/RevenuecatPurchasesCapacitor/.test(read('gps-beta/ios/App/CapApp-SPM/Package.swift')));
    const sk2 = JSON.parse(read('gps-beta/ios/App/App/HardPan.storekit'));
    const subs = sk2.subscriptionGroups[0].subscriptions;
    const by = Object.fromEntries(subs.map((s) => [s.productID, s]));
    assert.strictEqual(by[F].displayPrice, '24.99'); assert.strictEqual(by[R].displayPrice, '34.99');
    for (const s of subs) {
        assert.strictEqual(s.recurringSubscriptionPeriod, 'P1Y'); assert.strictEqual(s.type, 'RecurringSubscription');
        assert.strictEqual(s.introductoryOffer.paymentMode, 'free'); assert.strictEqual(s.introductoryOffer.subscriptionPeriod, 'P1W');
        assert.strictEqual(s.subscriptionGroupID, sk2.subscriptionGroups[0].id, 'one group: one trial per Apple ID');
    }
    const pbx = read('gps-beta/ios/App/App.xcodeproj/project.pbxproj');
    const appRes = pbx.slice(pbx.indexOf('504EC3021FED79650016851F /* Resources */ = {'), pbx.indexOf('};', pbx.indexOf('504EC3021FED79650016851F /* Resources */ = {')));
    assert.ok(!/HardPan\.storekit/.test(appRes), 'the .storekit file is never in the app bundle');
    assert.ok(/HardPan\.storekit in Resources/.test(pbx) && /HardPanStorePlugin\.swift in Sources/.test(pbx));
    const scheme = read('gps-beta/ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme');
    assert.ok(/<StoreKitConfigurationFileReference\s+identifier = "\.\.\/\.\.\/App\/HardPan\.storekit">/.test(scheme));
    assert.ok(/BlueprintName = "AppStoreKitTests"/.test(scheme));
});

// ---- REVENUECAT FOR 2.0 (Manny, Oct 24) -------------------------------------------------
test('RevenueCat: no key -> no entitlement, never configured, never a throw; with the paywall off GPS stays on', { skip }, async () => {
    const P = rc({ e: { productIdentifier: F, periodType: 'TRIAL', expirationDateMillis: Date.now() + DAY } });
    const noKey = Object.assign({}, RCFG, { revenueCatKey: '' });
    const { E } = ent(noKey, null, null, P);
    assert.strictEqual(await cb(E.refresh), false); assert.strictEqual(E.isPro(), false); assert.strictEqual(E.known(), true);
    assert.strictEqual((await cb(E.purchase, { founding: true })).outcome, 'unavailable');
    assert.strictEqual((await cb(E.offer)).fromStore, false);
    assert.deepStrictEqual(P.calls, [], 'no key: RevenueCat is not configured');
    assert.strictEqual(view(Object.assign({}, noKey, { paywall: false }), E).hasGpsPro(), true, 'paywall off: GPS on');
    assert.strictEqual(view(noKey, E).hasGpsPro(), false, 'paywall on, no key: the paywall (never GPS by accident)');
    // Not even the plugin on the page (the web): the same.
    assert.strictEqual(await cb(ent(RCFG, null).E.refresh), false);
});

test('RevenueCat: the same facts as StoreKit - trial, founding vs regular, renewal date, auto-renew', { skip }, async () => {
    const exp = Date.now() + 7 * DAY;
    const P = rc({ e: { productIdentifier: F, periodType: 'TRIAL', willRenew: true, expirationDateMillis: exp } });
    const { E } = ent(RCFG, null, null, P);
    await cb(E.refresh);
    assert.deepStrictEqual(plain(P.calls[0]), ['configure', { apiKey: 'appl_TEST' }], 'configured with the public key only');
    assert.deepStrictEqual(plain(E.subscription()), { active: true, productId: F, expires: exp, willRenew: true, trial: true, founding: true });
    assert.strictEqual(E.statusLine().badge, 'Free trial'); assert.match(E.statusLine().line, /^Golf GPS · renews /);
    // ISO date only (no millis), the regular product, an Android ":baseplan" suffix.
    const iso = new Date(Date.now() + 200 * DAY).toISOString();
    const Q = rc({ e: { productIdentifier: R + ':yearly', periodType: 'NORMAL', willRenew: false, expirationDate: iso } });
    const q = ent(RCFG, null, null, Q).E; await cb(q.refresh);
    assert.deepStrictEqual(plain(q.subscription()), { active: true, productId: R, expires: Date.parse(iso), willRenew: false, trial: false, founding: false });
    assert.match(q.statusLine().line, /^Golf GPS · ends /, 'auto-renew off: "ends", a fact, not a prompt');
    assert.strictEqual(q.statusLine().badge, '');
});

test('RevenueCat: trial start (founding), buy regular, cancel, restore none / found, expire mid-round keeps the round', { skip }, async () => {
    // Trial on the founding product.
    const A = rc({}); const a = ent(RCFG, null, null, A).E;
    const r = await cb(a.purchase, { founding: true });
    assert.strictEqual(r.pro, true); assert.deepStrictEqual(A.calls.filter((c) => c[0] === 'purchasePackage'), [['purchasePackage', F]]);
    assert.strictEqual(a.subscription().trial, true); assert.strictEqual(a.subscription().founding, true);
    // Regular when the founding window is closed.
    const B = rc({}); const b = ent(RCFG, null, null, B).E;
    await cb(b.purchase, { founding: false });
    assert.deepStrictEqual(B.calls.filter((c) => c[0] === 'purchasePackage'), [['purchasePackage', R]]);
    // Founding product not offered: the regular package even when asked for founding.
    const C = rc({ founding: false }); const c = ent(RCFG, null, null, C).E;
    await cb(c.purchase, { founding: true });
    assert.deepStrictEqual(C.calls.filter((x) => x[0] === 'purchasePackage'), [['purchasePackage', R]]);
    // Cancelled purchase.
    const D = rc({ buy: 'cancel' }); const d = ent(RCFG, null, null, D).E;
    const x = await cb(d.purchase, { founding: true });
    assert.strictEqual(x.pro, false); assert.strictEqual(x.message, 'Purchase cancelled. Nothing was charged.');
    // Restore: nothing, then a purchase made elsewhere.
    const G = rc({}); const g = ent(RCFG, null, null, G).E;
    const n = await cb(g.restore); assert.strictEqual(n.outcome, 'none');
    G.o.restoreE = G.ent(F, false, 300);
    const y = await cb(g.restore); assert.strictEqual(y.pro, true); assert.strictEqual(g.subscription().founding, true);
    // Expire mid-round: RevenueCat pushes CustomerInfo without gps_map; this round keeps GPS.
    const H = rc({ e: { productIdentifier: F, periodType: 'TRIAL', expirationDateMillis: Date.now() + DAY } });
    const ls = mem(); const h = ent(RCFG, null, ls, H).E; await cb(h.refresh);
    const V = view(RCFG, h, ls);
    V.grantRoundPass('RND1');
    H.push(null);
    assert.strictEqual(h.isPro(), false); assert.strictEqual(h.subscription(), null); assert.strictEqual(h.statusLine(), null);
    assert.strictEqual(V.hasGpsPro('RND1'), true, 'the round in progress keeps GPS');
    assert.strictEqual(V.hasGpsPro('NEW1'), false, 'a new round asks');
});

test('RevenueCat: the paywall prices - $24.99 founding then $34.99, $34.99 alone, no second trial', { skip }, async () => {
    const { E } = ent(RCFG, null, null, rc({}));
    const o = plain(await cb(E.offer));
    assert.deepStrictEqual(o, { fromStore: true, title: 'GPS Map', price: '$34.99', period: '1-year', trial: '7-day', founding: { price: '$24.99', trial: '7-day' } });
    const V = view(RCFG, E);
    const t = V.paywallText(o, { open: true, cap: 1000 });
    assert.strictEqual(t.price, '$24.99/year founding price (locked while subscribed)');
    assert.strictEqual(t.regular, 'After the first 1,000 subscribers: $34.99/year.');
    assert.strictEqual(t.buy, 'Start 7-day free trial'); assert.strictEqual(t.buyFounding, true);
    assert.strictEqual(V.paywallText(o, { open: false, cap: 1000 }).price, '$34.99/year');
    const off = plain(await cb(ent(RCFG, null, null, rc({ founding: false })).E.offer));
    assert.strictEqual(off.founding, null);
    assert.strictEqual(V.paywallText(off, { open: true, cap: 1000 }).price, '$34.99/year', 'founding not offered: regular');
    const used = plain(await cb(ent(RCFG, null, null, rc({ eligible: 1 })).E.offer));
    assert.strictEqual(used.trial, null); assert.strictEqual(V.paywallText(used, { open: true }).buy, 'Subscribe');
});
