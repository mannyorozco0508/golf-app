// ============================================================================
// THE APP STORE, STUBBED FOR THE BROWSER CHECKS (paid launch, 2026-10-17)
//
// v2.0 ships HARDPAN_GPS_CONFIG.iap ON: ALL of GPS needs the "GPS Map" entitlement
// (a 7-day free trial or the yearly subscription), and with no purchase plugin or
// no RevenueCat key a phone has none - the paywall. A check that tests a GPS
// FEATURE therefore runs as a subscriber, the way a paying golfer's phone does:
// window.Capacitor.Plugins.Purchases answers with RevenueCat's documented calls,
// and the page's config gets a stand-in key (the shipped key is empty). Nothing in
// the page is told it is a check - there is no test hook in shipped code.
//
//   iapStub({ active: true })            a subscriber (trial or paid): GPS opens
//   iapStub({ active: false })           no trial, no subscription: the paywall
//   iapStub({ active: false, buy: 'cancel' | 'ok' })   what "Start 7-day free trial" does
//   iapStub({ ..., price: null })        the store gives no price
//   iapStub({ ..., slowMs: 1500 })       the store's first answer arrives late
//   window.__iap.push(false)             RevenueCat reports the subscription lapsed
//
// window.__iap records every plugin call ({ calls, active, buy }) and can be
// changed mid-check (window.__iap.buy = 'ok').
//
// Isn't a native platform (isNativePlatform false) and keeps any Capacitor
// stand-in already on the page, so nothing else in the page changes.
// ============================================================================
'use strict';

const PRODUCT = 'com.rattlegolf.app.gpsmap.yearly';
const ENTITLEMENT = 'gps_map';

function iapStub(o) {
    o = Object.assign({ active: true, buy: 'ok', price: '$24.99', trial: true, slowMs: 0, key: true }, o || {});
    const intro = o.trial ? "{ price: 0, priceString: '$0.00', period: 'P1W', cycles: 1, periodUnit: 'WEEK', periodNumberOfUnits: 1 }" : 'null';
    return `
(function () {
  // A trial started on one page is the phone's from then on (the store keeps it): kept
  // across page loads in this profile, as the real App Store account would.
  var kept = false; try { kept = localStorage.getItem('__iapActive') === '1'; } catch (e) {}
  window.__iap = { calls: [], active: ${!!o.active} || kept, buy: ${JSON.stringify(o.buy)}, listeners: [] };
  var I = window.__iap, SLOW = ${Number(o.slowMs) || 0};
  var keep = function () { try { if (I.active) localStorage.setItem('__iapActive', '1'); else localStorage.removeItem('__iapActive'); } catch (e) {} };
  // RevenueCat pushes a changed CustomerInfo (a subscription lapsing, renewed elsewhere).
  I.push = function (active) { I.active = !!active; keep(); I.listeners.forEach(function (fn) { try { fn(info()); } catch (e) {} }); return 'pushed ' + I.active; };
  var later = function (v) { return SLOW ? new Promise(function (r) { setTimeout(function () { r(v); }, SLOW); }) : Promise.resolve(v); };
  var info = function () { return { entitlements: { active: I.active ? { ${ENTITLEMENT}: { identifier: '${ENTITLEMENT}', isActive: true } } : {}, all: {} } }; };
  var pkg = { identifier: '$rc_annual', packageType: 'ANNUAL', product: { identifier: '${PRODUCT}', title: 'GPS Map', priceString: ${JSON.stringify(o.price || '')}, price: 24.99, subscriptionPeriod: 'P1Y', introPrice: ${intro} } };
  var P = {
    configure: function () { I.calls.push('configure'); return Promise.resolve(); },
    addCustomerInfoUpdateListener: function (fn) { I.calls.push('listen'); if (typeof fn === 'function') I.listeners.push(fn); return Promise.resolve('l'); },
    getCustomerInfo: function () { I.calls.push('getCustomerInfo'); return later({ customerInfo: info() }); },
    getOfferings: function () { I.calls.push('getOfferings'); return Promise.resolve({ current: { identifier: 'default', annual: pkg, availablePackages: [pkg] } }); },
    purchasePackage: function () { I.calls.push('purchasePackage'); if (I.buy === 'cancel') return Promise.reject({ code: '1', userCancelled: true, message: 'cancelled' }); I.active = true; keep(); return Promise.resolve({ productIdentifier: pkg.product.identifier, customerInfo: info() }); },
    restorePurchases: function () { I.calls.push('restorePurchases'); return Promise.resolve({ customerInfo: info() }); }
  };
  var C = window.Capacitor || (window.Capacitor = { isNativePlatform: function () { return false; } });
  C.Plugins = C.Plugins || {};
  C.Plugins.Purchases = P;
  ${o.key ? `// The shipped config's RevenueCat key is empty: a stand-in, set as the config is assigned
  // (composed with any stand-in config the check already put there).
  var patch = function (v) { if (v && typeof v === 'object' && !v.revenueCatKey) v.revenueCatKey = 'CHECK'; return v; };
  var d = Object.getOwnPropertyDescriptor(window, 'HARDPAN_GPS_CONFIG');
  if (d && (d.get || d.set)) {
    var g0 = d.get, s0 = d.set;
    Object.defineProperty(window, 'HARDPAN_GPS_CONFIG', { configurable: true, get: function () { return patch(g0 ? g0.call(window) : undefined); }, set: function (v) { if (s0) s0.call(window, patch(v)); } });
  } else {
    var c0 = d ? patch(d.value) : undefined;
    Object.defineProperty(window, 'HARDPAN_GPS_CONFIG', { configurable: true, get: function () { return c0; }, set: function (v) { c0 = patch(v); } });
  }` : ''}
})();`;
}

module.exports = { iapStub, PRODUCT, ENTITLEMENT };
