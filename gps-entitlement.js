// ============================================================================
// HARDPAN GPS MAP - THE APP STORE ENTITLEMENT (gps-store-iap, 2026-10-17;
// paid launch, Manny mailbox 007, 2026-10-17)
//
// Answers ONE question for gps-view.js hasGpsPro(): does this phone have GPS Map
// (an active 7-day free trial or a paid yearly subscription)? Games, scoring, bet
// tracking, joining, the scorecard, the leaderboard and settle up are always
// free; ALL of GPS is the paid part (App Store Guideline 3.1.1: sold through
// StoreKit only - "GPS Map", com.rattlegolf.app.gpsmap.yearly, an auto-renewing
// yearly subscription in the group "HardPan Plus", with a 7-day free trial as its
// introductory offer). Every part of GPS is paid.
//
// THE FLAG: HARDPAN_GPS_CONFIG.iap - ON for v2.0. On = the RevenueCat Capacitor
// plugin (@revenuecat/purchases-capacitor), read as
// window.Capacitor.Plugins.Purchases. No plugin or no key (the web, the checks,
// a build that has not linked it) = never a crash: NO entitlement, so the
// paywall, and it says so in one sentence when a purchase is tried. Off = this
// file does nothing (no plugin call, no network) and gps-view.js decides from
// HARDPAN_GPS_CONFIG.paywall.
//
// THERE IS NO TESTER OVERRIDE. The old URL tier switch (free | pro | clear) is gone: nothing
// in a URL, and nothing kept on the phone, can turn GPS on. The entitlement is the
// store's answer, held in memory only (the plugin keeps its own cache for
// offline launches). The checks stub the plugin itself.
//
// URGENT-062 - STOREKIT 2 IS THE STORE (HARDPAN_GPS_CONFIG.iapStore 'storekit'): our own
// PhoneBridge plugin HardPanStore (gps-beta/ios/App/PhoneBridge/HardPanStorePlugin.swift,
// window.Capacitor.Plugins.HardPanStore) - no new package. It answers with the subscription's
// own facts, which RevenueCat's CustomerInfo only partly carries: active, which product
// (founding or regular), the period's end (= the renewal date), auto-renew on or off, and
// whether this period is the free trial. Kept in memory only, like before. The RevenueCat
// path below stays, dormant (iapStore 'revenuecat'; its plugin and key are not in the app).
// THE PAYWALL SWITCH: nothing here asks any store at launch unless HARDPAN_GPS_CONFIG.paywall
// is true (gps-config.js) - an install with the paywall off never talks to the App Store.
//
// NO LOCATION, NO GOLFER DATA: the plugin is told nothing but the public SDK key.
// It talks to the App Store and RevenueCat about the purchase, nothing else.
//
// This file is HardPan only: sync-mobile-web.js's GPS_SHELL keeps it out of the
// Consumer, iOS and Android builds.
// ============================================================================
(function () {
    'use strict';

    function cfg() { return (typeof window !== 'undefined' && window.HARDPAN_GPS_CONFIG) || {}; }
    // The flag. Only a literal true turns it on.
    function enabled() { return cfg().iap === true; }
    // The ids (gps-config.js): the entitlement RevenueCat grants, and the App
    // Store product it is attached to.
    function entitlementId() { return String(cfg().iapEntitlement || 'gps_map'); }
    function productId() { return String(cfg().iapProduct || ''); }
    function plugin() {
        try {
            var C = window.Capacitor;
            return (C && C.Plugins && C.Plugins.Purchases) || null;
        } catch (e) { return null; }
    }
    // URGENT-062: which store. Only a literal 'storekit' picks StoreKit 2 (the shipped config).
    function storeKit() { return cfg().iapStore === 'storekit'; }
    function foundingId() { return String(cfg().iapFoundingProduct || ''); }
    function ids() { return [productId(), foundingId()].filter(function (x) { return !!x; }); }
    function skPlugin() {
        try {
            var C = window.Capacitor;
            return (C && C.Plugins && C.Plugins.HardPanStore) || null;
        } catch (e) { return null; }
    }

    // ---- STATE (memory only - never localStorage) ---------------------------
    var pro = false;          // the last answer the store gave
    // StoreKit 2 (062): the subscription's facts, from the store (memory only).
    // { active, productId, expires (ms), willRenew, trial, founding } or null.
    var sub = null;
    var known = false;        // has the store answered at all this launch?
    var started = null;       // the configure promise, once
    var listeners = [];
    var knownWaiters = [];    // whenKnown callbacks, run once the store has answered

    function answered() {
        known = true;
        var w = knownWaiters; knownWaiters = [];
        w.forEach(function (fn) { try { fn(pro); } catch (e) {} });
    }
    function set(next) {
        next = !!next;
        var first = !known;
        known = true;
        if (next !== pro) {
            pro = next;
            listeners.slice().forEach(function (fn) { try { fn(pro); } catch (e) {} });
        }
        if (first || knownWaiters.length) answered();
    }
    // RevenueCat CustomerInfo -> is the GPS Map entitlement active?
    function activeIn(info) {
        var act = info && info.entitlements && info.entitlements.active;
        var e = act && act[entitlementId()];
        return !!(e && e.isActive !== false);
    }
    // The plugin answers { customerInfo } (purchase, restore, getCustomerInfo).
    function infoOf(r) { return r && r.customerInfo ? r.customerInfo : r; }

    // Configure the SDK once. Resolves true when it is ready to be asked.
    function start() {
        if (started) return started;
        // DEV BUILD ONLY (mailbox 008): tools/build-gps-app.js with GPS_DEV_PRO=1 adds devPro to the
        // BUILT config (never the repo's), so Manny's Cmd+R build reaches GPS without a store. A
        // release build is built without it and stays behind the paywall.
        if (cfg().devPro === true) { set(true); started = Promise.resolve(false); return started; }
        if (storeKit()) {
            var K = skPlugin();
            if (!enabled() || !K) { started = Promise.resolve(false); return started; }
            started = Promise.resolve().then(function () {
                try {
                    // The store's own news: a renewal, an expiry, a purchase on another device,
                    // a refund, Ask to Buy approved - pushed by Transaction.updates.
                    if (typeof K.addListener === 'function') K.addListener('storeChange', function (st) { take(st); });
                } catch (e) {}
                return true;
            });
            return started;
        }
        var P = plugin(), key = String(cfg().revenueCatKey || '');
        if (!enabled() || !P || !key) { started = Promise.resolve(false); return started; }
        started = Promise.resolve().then(function () {
            return P.configure({ apiKey: key });
        }).then(function () {
            try {
                if (typeof P.addCustomerInfoUpdateListener === 'function') {
                    P.addCustomerInfoUpdateListener(function (info) { set(activeIn(infoOf(info))); });
                }
            } catch (e) {}
            return true;
        }, function () { return false; });
        return started;
    }

    // Ask the store again (launch, after Restore). cb(pro).
    function refresh(cb) {
        var done = function (v) { if (typeof cb === 'function') cb(v); };
        if (!enabled()) { done(false); return; }
        if (cfg().devPro === true) { set(true); done(true); return; }   // the dev build (see start)
        start().then(function (ok) {
            if (!ok) { set(false); return false; }
            if (storeKit()) return skPlugin().status({ ids: ids() }).then(function (st) { take(st); return pro; });
            return plugin().getCustomerInfo().then(function (r) { set(activeIn(infoOf(r))); return pro; });
        }).then(function () { done(pro); }, function () { answered(); done(pro); });
    }

    // ---- STOREKIT 2: THE SUBSCRIPTION'S FACTS (062) -----------------------------
    // The plugin's status -> sub, and the one answer. Pure apart from set(). An expiry date in
    // the past is not active, whatever else was said (a phone left asleep past its renewal
    // date asks again when it wakes - visibility, below).
    function subOf(st, now) {
        if (!st || typeof st !== 'object') return null;
        var exp = Number(st.expires) || 0;
        var known = ids();
        var id = String(st.productId || '');
        var active = st.active === true && (!exp || exp > (now == null ? Date.now() : now)) && (!id || known.indexOf(id) !== -1);
        return { active: active, productId: id, expires: exp || null, willRenew: st.willRenew !== false,
            trial: active && st.trial === true, founding: !!id && id === foundingId() };
    }
    function take(st) {
        sub = subOf(st);
        set(!!(sub && sub.active));
        watchExpiry();
        statusFns.slice().forEach(function (fn) { try { fn(); } catch (e) {} });
    }
    var statusFns = [];
    // A phone back from sleep, or the period's end passing while the app is open: ask again.
    var expTimer = null;
    function watchExpiry() {
        if (expTimer) { clearTimeout(expTimer); expTimer = null; }
        if (!sub || !sub.active || !sub.expires) return;
        var ms = sub.expires - Date.now() + 1000;
        if (ms > 0 && ms < 2147483000) expTimer = setTimeout(function () { refresh(); }, ms);
    }
    // ---- THE PROFILE LINE AND THE BADGE (062; Manny: no renewal reminder, no cancel prompt) --
    // "Golf GPS · renews Oct 21, 2027" - auto-renew off: "Golf GPS · ends <date>" (a fact, not
    // a prompt). Trial: the same line, plus the badge "Free trial". Pure (gps_storekit_062_test.js).
    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function dateText(ms) { var d = new Date(Number(ms)); if (!(ms > 0) || isNaN(d.getTime())) return ''; return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(); }
    function daysLeft(ms, now) { return Math.max(0, Math.ceil((Number(ms) - (now == null ? Date.now() : now)) / 86400000)); }
    function lineFor(s, now) {
        if (!s || !s.active) return null;
        var d = dateText(s.expires);
        var line = 'Golf GPS' + (d ? ' \u00b7 ' + (s.willRenew ? 'renews ' : 'ends ') + d : '');
        var badge = s.trial ? 'Free trial' : '';
        var left = s.trial && s.expires ? daysLeft(s.expires, now) : null;
        return { line: line, badge: badge, door: s.trial && left != null ? 'Free trial \u00b7 ' + left + (left === 1 ? ' day left' : ' days left') : '' };
    }

    // ---- THE OFFER: what the paywall shows ----------------------------------
    // From StoreKit (through RevenueCat): title, price string, period, trial.
    // { fromStore: false } when the store gave nothing - the paywall then says
    // the App Store shows the price before the golfer confirms (never a price
    // written into the app).
    // An ISO 8601 period ('P1Y', 'P1W', 'P7D') -> '1-year', '7-day'. A week is
    // said in days, the way the trial is sold ("7-day free trial").
    function periodText(iso) {
        var m = /^P(\d+)([DWMY])$/.exec(String(iso || ''));
        if (!m) return null;
        var n = Number(m[1]);
        if (m[2] === 'W') return (n * 7) + '-day';
        return n + '-' + { D: 'day', M: 'month', Y: 'year' }[m[2]];
    }
    function introPeriod(intro) {
        var p = periodText(intro.period);
        if (p) return p;
        var u = { DAY: 'D', WEEK: 'W', MONTH: 'M', YEAR: 'Y' }[String(intro.periodUnit || '')];
        return u ? periodText('P' + (Number(intro.periodNumberOfUnits) || 1) + u) : null;
    }
    function storeProduct(offerings) {
        var cur = offerings && offerings.current;
        if (!cur) return null;
        var pk = cur.annual || null, want = productId();
        (cur.availablePackages || []).forEach(function (p) {
            if (p && p.product && (!pk || (want && p.product.identifier === want))) pk = p;
        });
        return pk && pk.product ? { pkg: pk, product: pk.product } : null;
    }
    var offerCache = null;
    // StoreKit 2: both products from the store. -> the regular product's words, and
    // founding: { price, trial } when the store offers the founding product. introEligible
    // false: this Apple ID had its free trial in the group already - no trial words.
    function skOffer(r) {
        var list = (r && r.products) || [];
        var by = {}; list.forEach(function (p) { if (p && p.id) by[p.id] = p; });
        var reg = by[productId()], fnd = by[foundingId()];
        if (!reg && !fnd) return { fromStore: false };
        var base = reg || fnd;
        var tr = function (p) { return p && p.trial && p.introEligible !== false ? periodText(p.trial) : null; };
        return {
            fromStore: true,
            title: String(base.title || ''),
            price: reg ? String(reg.price || '') : '',
            period: periodText(base.period),
            trial: tr(base),
            founding: fnd ? { price: String(fnd.price || ''), trial: tr(fnd) } : null
        };
    }
    function offer(cb) {
        var none = { fromStore: false };
        if (!enabled()) { cb(none); return; }
        start().then(function (ok) {
            if (!ok) return none;
            if (storeKit()) return skPlugin().products({ ids: ids() }).then(skOffer);
            return plugin().getOfferings().then(function (o) {
                var sp = storeProduct(o && o.offerings ? o.offerings : o);
                if (!sp) return none;
                var pr = sp.product, intro = pr.introPrice || null;
                offerCache = sp;
                return {
                    fromStore: true,
                    title: String(pr.title || ''),
                    price: String(pr.priceString || ''),
                    period: periodText(pr.subscriptionPeriod),
                    // A free intro offer: price 0, e.g. P1W / P7D.
                    trial: intro && Number(intro.price) === 0 ? introPeriod(intro) : null
                };
            });
        }).then(function (r) { cb(r || none); }, function () { cb(none); });
    }

    // ---- BUY AND RESTORE ----------------------------------------------------
    // cb({ pro, outcome, message }): outcome 'pro' | 'cancelled' | 'pending' |
    // 'none' | 'error' | 'unavailable'. message: one plain sentence, or ''.
    var MSG = {
        cancelled: 'Purchase cancelled. Nothing was charged.',
        pending: 'Your purchase is waiting for approval. GPS Map turns on once it is approved.',
        none: 'No GPS Map subscription was found for this Apple ID.',
        error: 'The purchase did not go through. Please try again.',
        restoreError: 'Restore did not go through. Please try again.',
        unavailable: 'The App Store is not available right now. Please try again later.'
    };
    function cancelled(e) {
        // RevenueCat: userCancelled, or PURCHASE_CANCELLED_ERROR (code "1").
        return !!(e && (e.userCancelled === true || String(e.code) === '1' || /PURCHASE_CANCELLED/.test(String(e.code || ''))));
    }
    function pendingErr(e) { return !!(e && (String(e.code) === '20' || /PAYMENT_PENDING/.test(String(e.code || '')))); }
    function result(outcome, msgKey) { return { pro: pro, outcome: outcome, message: msgKey ? MSG[msgKey] : '' }; }

    // opts.founding: buy the founding product (the paywall says so only while the window is
    // open and the store offers it); else the regular one.
    function skPurchase(opts) {
        var id = opts && opts.founding && foundingId() ? foundingId() : productId();
        return skPlugin().purchase({ id: id, ids: ids() }).then(function (r) {
            r = r || {};
            if (r.status) take(r.status);
            if (r.outcome === 'cancelled') return result('cancelled', 'cancelled');
            if (r.outcome === 'pending') return result('pending', 'pending');
            if (r.outcome === 'unavailable') return result('unavailable', 'unavailable');
            return pro ? result('pro') : result('error', 'error');
        }, function () { return result('error', 'error'); });
    }
    function purchase(cb, opts) {
        if (!enabled()) { cb(result('unavailable', 'unavailable')); return; }
        start().then(function (ok) {
            if (!ok) return result('unavailable', 'unavailable');
            if (storeKit()) return skPurchase(opts);
            var go = function (sp) {
                if (!sp) return result('unavailable', 'unavailable');
                return plugin().purchasePackage({ aPackage: sp.pkg }).then(function (r) {
                    set(activeIn(infoOf(r)));
                    return pro ? result('pro') : result('error', 'error');
                }, function (e) {
                    if (cancelled(e)) return result('cancelled', 'cancelled');
                    if (pendingErr(e)) return result('pending', 'pending');
                    return result('error', 'error');
                });
            };
            if (offerCache) return go(offerCache);
            return plugin().getOfferings().then(function (o) { offerCache = storeProduct(o && o.offerings ? o.offerings : o); return go(offerCache); });
        }).then(function (r) { cb(r); }, function () { cb(result('error', 'error')); });
    }

    function restore(cb) {
        if (!enabled()) { cb(result('unavailable', 'unavailable')); return; }
        start().then(function (ok) {
            if (!ok) return result('unavailable', 'unavailable');
            // StoreKit 2: AppStore.sync() (the Apple ID may be asked to sign in), then the facts.
            if (storeKit()) return skPlugin().restore({ ids: ids() }).then(function (r) {
                take(r && r.status ? r.status : r);
                return pro ? result('pro') : result('none', 'none');
            }, function () { return result('error', 'restoreError'); });
            return plugin().restorePurchases().then(function (r) {
                set(activeIn(infoOf(r)));
                // Read it again from the store, so the answer is the store's own.
                return plugin().getCustomerInfo().then(function (r2) { set(activeIn(infoOf(r2))); }, function () {}).then(function () {
                    return pro ? result('pro') : result('none', 'none');
                });
            }, function () { return result('error', 'restoreError'); });
        }).then(function (r) { cb(r); }, function () { cb(result('error', 'restoreError')); });
    }

    var api = {
        enabled: enabled,
        // The one answer. Flag off: always false (gps-view.js does not ask).
        isPro: function () { return enabled() && pro; },
        // Has the store answered yet this launch? (the paywall waits for it)
        known: function () { return !enabled() || known; },
        // cb(pro) once the store has answered this launch (at once when it has, or
        // when the flag is off). ms: give up waiting after this long and answer with
        // what is known (no entitlement) - a store that never answers never leaves a
        // golfer on a blank screen.
        whenKnown: function (cb, ms) {
            if (typeof cb !== 'function') return;
            if (!enabled() || known) { cb(enabled() && pro); return; }
            var done = false, once = function () { if (done) return; done = true; cb(enabled() && pro); };
            knownWaiters.push(once);
            if (ms > 0) setTimeout(once, ms);
        },
        refresh: refresh, offer: offer, purchase: purchase, restore: restore,
        onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
        // 062: the subscription's facts (StoreKit 2; null before the store answers, with the
        // paywall off, or for a dev build), and the Profile line / trial badge built from them.
        subscription: function () { return sub && enabled() ? JSON.parse(JSON.stringify(sub)) : null; },
        statusLine: function (now) { return enabled() && cfg().paywall === true ? lineFor(sub, now) : null; },
        onStatus: function (fn) { if (typeof fn === 'function') statusFns.push(fn); },
        lineFor: lineFor, subOf: subOf, skOffer: skOffer, dateText: dateText,
        MSG: MSG
    };
    if (typeof window !== 'undefined') {
        window.HardPanEntitlement = api;
        // At launch, flag on AND the paywall on (062) only: ask the store once - and again when
        // the app comes back to the front (a period may have ended, or renewed, meanwhile).
        if (enabled() && cfg().paywall === true) {
            refresh();
            try { document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refresh(); }); } catch (e) {}
        }
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
