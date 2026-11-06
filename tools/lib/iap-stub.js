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
//   iapStub({ ..., three: true })        2.0: the offering has all three products - $rc_annual
//                                        ($49.99), a custom 'founding' package ($24.99/yr) and
//                                        $rc_monthly ($7.99/mo); purchasePackage records which one
//   iapStub({ ..., offerings: 'empty' })  2.0 (23): the store answers with no product (another storefront:
//                                        an offering with no packages); 'nocurrent' = no current offering;
//                                        'config' = RevenueCat's CONFIGURATION_ERROR (code "23", none of
//                                        the products could be fetched); 'reject' = every fetch fails
//                                        (offline, code "35"); 'rejectOnce' = the first fetch fails, the
//                                        next ones answer normally (Try again)
//   iapStub({ ..., transfer: true })     ADVISOR-0052: RevenueCat's "Transferring purchases seen on multiple App
//                                        User IDs" = "Transfer to new App User ID" (HardPan's setting). The Trip
//                                        Pass purchase records belong to ONE App User ID at a time (the phone's
//                                        Apple ID receipt): logIn of a never-seen id FROM an anonymous one aliases
//                                        (the purchases come along); logIn to a known id, or from another account,
//                                        leaves them with their owner; logOut = a NEW anonymous id;
//                                        restorePurchases or a purchase TRANSFERS every record to the current id
//                                        (the old one loses them). o.rcSeen = ids RevenueCat already knows.
//                                        __iap.txOf(id) = the records that id owns. Off (default): as before.
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
    // 2.0.1 (ADVISOR-0255): the trial words need the store to CONFIRM this account can have the trial. The stand-in
    // answers as the real stores do: the App Store's eligibility call (2 = eligible, 1 = had it) and, for Google Play,
    // each product's defaultOption with the free phase (Play lists only offers this account can have).
    // o.trialEligible: false = the account already had its trial (no free phase, status 1).
    const elig = o.trial && o.trialEligible !== false;
    const dopt = elig ? "{ id: 'trial-7d', freePhase: { billingPeriod: { unit: 'WEEK', value: 1, iso8601: 'P1W' }, price: { amountMicros: 0, formatted: 'Free' } } }" : "{ id: 'base', freePhase: null }";
    return `
(function () {
  // A trial started on one page is the phone's from then on (the store keeps it): kept
  // across page loads in this profile, as the real App Store account would.
  var kept = false; try { kept = localStorage.getItem('__iapActive') === '1'; } catch (e) {}
  var keptHost = false; try { keptHost = localStorage.getItem('__iapHost') === '1'; } catch (e) {}
  window.__iap = { calls: [], active: ${!!o.active} || kept, host: ${!!o.hostActive} || keptHost, buy: ${JSON.stringify(o.buy)}, listeners: [] };
  var I = window.__iap, SLOW = ${Number(o.slowMs) || 0};
  var keep = function () { try { if (I.active) localStorage.setItem('__iapActive', '1'); else localStorage.removeItem('__iapActive'); } catch (e) {} };
  // RevenueCat pushes a changed CustomerInfo (a subscription lapsing, renewed elsewhere).
  I.push = function (active) { I.active = !!active; keep(); I.listeners.forEach(function (fn) { try { fn(info()); } catch (e) {} }); return 'pushed ' + I.active; };
  var later = function (v) { return SLOW ? new Promise(function (r) { setTimeout(function () { r(v); }, SLOW); }) : Promise.resolve(v); };
  // PRICING 2.0.1: games_host (o.hostActive, or a Trip Pass / Host Pro bought here) next to gps_map.
  // ADVISOR-0052: who RevenueCat thinks is buying (o.rcUser = already logged in; null = anonymous), and the one-time
  // purchases (o.tripTx: a Trip Pass bought here is a purchase record only - no entitlement, as in RevenueCat;
  // o.tripAt: a Trip Pass bought earlier at that time).
  I.rcUser = ${JSON.stringify(o.rcUser || null)}; I.tx = ${o.tripAt ? `[{ productIdentifier: 'com.rattlegolf.app.games.trippass', purchaseDateMillis: ${Number(o.tripAt)}, transactionIdentifier: 't0' }]` : '[]'};
  // ADVISOR-0052 (o.transfer): who owns each purchase record ("Transfer to new App User ID"); off = no owner, as before.
  I.transfer = ${o.transfer ? 'true' : 'false'}; I.anonN = 1; I.anon = '$RCAnonymousID:sim1'; I.seen = {}; ${JSON.stringify(o.rcSeen || [])}.forEach(function (id) { I.seen[id] = true; });
  if (I.rcUser) I.seen[I.rcUser] = true;
  var cur = function () { return I.rcUser || I.anon; };
  if (I.transfer) I.tx.forEach(function (t) { t.owner = ${JSON.stringify(o.tripOwner || null)} || cur(); });
  var mine = function () { return I.tx.filter(function (t) { return !I.transfer || t.owner === cur(); }).map(function (t) { var c = {}; for (var k in t) if (k !== 'owner') c[k] = t[k]; return c; }); };
  var takeAll = function (why) { if (!I.transfer) return; I.tx.forEach(function (t) { if (t.owner !== cur()) { I.calls.push('transfer:' + why); t.owner = cur(); } }); };
  I.txOf = function (id) { return I.tx.filter(function (t) { return t.owner === id; }).length; };
  var info = function () { var a = {}; if (I.active) a.${ENTITLEMENT} = { identifier: '${ENTITLEMENT}', isActive: true }; if (I.host) a.games_host = { identifier: 'games_host', isActive: true }; return { entitlements: { active: a, all: {} }, nonSubscriptionTransactions: I.transfer ? mine() : I.tx.slice() }; };
  var HOST_IDS = ['com.rattlegolf.app.games.trippass', 'com.rattlegolf.app.games.host.yearly'];
  var hostOff = ${o.host ? 'true' : 'false'} ? { identifier: 'host', availablePackages: [
    { identifier: 'trip', packageType: 'CUSTOM', product: { identifier: HOST_IDS[0], title: 'Trip Pass', priceString: '$14.99', price: 14.99 } },
    { identifier: '$rc_annual', packageType: 'ANNUAL', product: { identifier: HOST_IDS[1], title: 'Host Pro', priceString: '$29.99', price: 29.99, subscriptionPeriod: 'P1Y' } }] } : null;
  var pkg = { identifier: '$rc_annual', packageType: 'ANNUAL', product: { identifier: '${PRODUCT}', title: 'GPS Map', priceString: ${JSON.stringify(o.three ? '$49.99' : (o.price || ''))}, price: 24.99, subscriptionPeriod: 'P1Y', introPrice: ${intro}, defaultOption: ${dopt} } };
  var extra = ${o.three ? 'true' : 'false'} ? [
    { identifier: 'founding', packageType: 'CUSTOM', product: { identifier: 'com.rattlegolf.app.gpsmap.founding.yearly', title: 'HardPan Pro Founding', priceString: '$24.99', price: 24.99, subscriptionPeriod: 'P1Y', introPrice: ${intro}, defaultOption: ${dopt} } },
    { identifier: '$rc_monthly', packageType: 'MONTHLY', product: { identifier: 'com.rattlegolf.app.gpsmap.monthly', title: 'HardPan Pro Monthly', priceString: '$7.99', price: 7.99, subscriptionPeriod: 'P1M', introPrice: ${intro}, defaultOption: ${dopt} } }] : [];
  I.bought = [];
  var P = {
    configure: function () { I.calls.push('configure'); return Promise.resolve(); },
    addCustomerInfoUpdateListener: function (fn) { I.calls.push('listen'); if (typeof fn === 'function') I.listeners.push(fn); return Promise.resolve('l'); },
    logIn: function (a) { I.calls.push('logIn:' + (a && a.appUserID)); var id = a && a.appUserID, created = false;
      if (I.transfer) { created = !I.seen[id]; if (created && !I.rcUser) I.tx.forEach(function (t) { if (t.owner === I.anon) t.owner = id; }); I.seen[id] = true; }
      I.rcUser = id; return Promise.resolve({ customerInfo: info(), created: created }); },
    logOut: function () { I.calls.push('logOut'); if (!I.rcUser) return Promise.reject({ code: '22', message: 'LogOut was called but the current user is anonymous.' }); I.rcUser = null; if (I.transfer) I.anon = '$RCAnonymousID:sim' + (++I.anonN); return Promise.resolve({ customerInfo: info() }); },
    isAnonymous: function () { I.calls.push('isAnonymous'); return Promise.resolve({ isAnonymous: !I.rcUser }); },
    getCustomerInfo: function () { I.calls.push('getCustomerInfo'); return later({ customerInfo: info() }); },
    getOfferings: function () { I.calls.push('getOfferings');
      var mode = ${JSON.stringify(o.offerings || '')}, n = I.calls.filter(function (c) { return c === 'getOfferings'; }).length;
      if (mode === 'empty') return Promise.resolve({ current: { identifier: 'default', availablePackages: [] }, all: {} });
      if (mode === 'nocurrent') return Promise.resolve({ current: null, all: {} });
      if (mode === 'config') return Promise.reject({ code: '23', message: 'None of the products registered in the RevenueCat dashboard could be fetched from App Store Connect.' });
      if (mode === 'reject' || (mode === 'rejectOnce' && n === 1)) return Promise.reject({ code: '35', message: 'The operation could not be completed (offline).' });
      var cur = { identifier: 'default', annual: pkg, availablePackages: [pkg].concat(extra) }; if (extra.length) cur.monthly = extra[1]; return Promise.resolve(hostOff ? { current: cur, all: { 'default': cur, host: hostOff } } : { current: cur }); },
    purchasePackage: function (a) { I.calls.push('purchasePackage'); try { I.bought.push(a.aPackage.product.identifier); localStorage.setItem('__iapBought', JSON.stringify(I.bought)); } catch (e) {} if (I.buy === 'cancel') return Promise.reject({ code: '1', userCancelled: true, message: 'cancelled' });
      takeAll('purchase');
      if (${o.tripTx ? 'true' : 'false'} && a.aPackage.product.identifier === HOST_IDS[0]) { I.tx.push({ productIdentifier: HOST_IDS[0], purchaseDateMillis: Date.now(), transactionIdentifier: 't' + I.tx.length }); if (I.transfer) I.tx[I.tx.length - 1].owner = cur(); return Promise.resolve({ productIdentifier: HOST_IDS[0], customerInfo: info() }); }
      if (HOST_IDS.indexOf(a.aPackage.product.identifier) >= 0) { I.host = true; try { localStorage.setItem('__iapHost', '1'); } catch (e) {} return Promise.resolve({ productIdentifier: a.aPackage.product.identifier, customerInfo: info() }); }
      I.active = true; keep(); return Promise.resolve({ productIdentifier: pkg.product.identifier, customerInfo: info() }); },
    restorePurchases: function () { I.calls.push('restorePurchases'); takeAll('restore'); return Promise.resolve({ customerInfo: info() }); },
    checkTrialOrIntroductoryPriceEligibility: function (a) { I.calls.push('eligibility'); var m = {}; ((a && a.productIdentifiers) || []).forEach(function (id) { m[id] = { status: ${o.trial ? (o.trialEligible === false ? 1 : 2) : 3} }; }); return Promise.resolve(m); }
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
