// HardPanStorePlugin.swift - the Golf GPS subscription through StoreKit 2 (URGENT-062).
// JS (gps-entitlement.js, HARDPAN_GPS_CONFIG.iapStore 'storekit') sees it as
// Capacitor.Plugins.HardPanStore:
//   products({ ids })      -> { products: [{ id, title, price, amount, currency, period, trial, introEligible }] }
//   status({ ids })        -> the subscription's facts (below)
//   purchase({ id, ids })  -> { outcome: 'pro' | 'cancelled' | 'pending' | 'unavailable' | 'error', status }
//   restore({ ids })       -> { status }   (AppStore.sync() - Restore Purchases)
//   event 'storeChange'    -> status        (Transaction.updates: renewals, expiry, refunds, Ask to Buy, other devices)
// status: { active, productId, expires (ms since 1970), willRenew, trial, state }
//   active    a verified, unrevoked, unexpired transaction for one of ids (the trial counts)
//   expires   the current period's end = the renewal date while auto-renew is on
//   willRenew Product.SubscriptionInfo.RenewalInfo.willAutoRenew (false = cancelled, runs to `expires`)
//   trial     this period is the introductory offer (the 7-day free trial)
// THE STORE: in a build run from Xcode with the App scheme, StoreKit answers from
// App/HardPan.storekit (local, no App Store Connect, no agreement, no account). In a build
// installed any other way (devicectl, TestFlight, the App Store) it answers from the App Store
// sandbox / production - which has no products until they exist in App Store Connect.
// NOTHING ABOUT THE GOLFER (no location, no name) is sent anywhere; StoreKit talks to Apple.
// No renewal reminder, no cancel prompt (Manny, 052 CHANGED 11:41 AM).

import Foundation
import Capacitor
import StoreKit

@objc(HardPanStorePlugin)
public class HardPanStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HardPanStorePlugin"
    public let jsName = "HardPanStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "products", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise)
    ]

    private var updates: Task<Void, Never>?
    private var lastIds: [String] = []

    override public func load() {
        // Every transaction the store sends while the app runs (a renewal, the trial converting,
        // an expiry or refund, a purchase approved later): finish it and tell the page.
        updates = Task.detached { [weak self] in
            for await result in Transaction.updates {
                if case .verified(let t) = result { await t.finish() }
                guard let self = self else { return }
                let ids = self.lastIds
                let st = await HardPanStore.status(ids: ids)
                self.notifyListeners("storeChange", data: st)
            }
        }
    }
    deinit { updates?.cancel() }

    private func ids(_ call: CAPPluginCall) -> [String] {
        let a = (call.getArray("ids") as? [String] ?? []).filter { !$0.isEmpty }
        if !a.isEmpty { lastIds = a }
        return a
    }

    @objc func products(_ call: CAPPluginCall) {
        let want = ids(call)
        Task {
            do {
                let list = try await Product.products(for: want)
                var out: [[String: Any]] = []
                for p in list { out.append(await HardPanStore.describe(p)) }
                call.resolve(["products": out])
            } catch {
                call.resolve(["products": [], "error": "\(error)"])
            }
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        let want = ids(call)
        Task { call.resolve(await HardPanStore.status(ids: want)) }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        let want = ids(call)
        guard let id = call.getString("id"), !id.isEmpty else { call.resolve(["outcome": "unavailable"]); return }
        Task {
            do {
                guard let p = try await Product.products(for: [id]).first else {
                    call.resolve(["outcome": "unavailable", "status": await HardPanStore.status(ids: want)]); return
                }
                let r = try await HardPanStore.buy(p)
                call.resolve(["outcome": r, "status": await HardPanStore.status(ids: want.isEmpty ? [id] : want)])
            } catch {
                call.resolve(["outcome": "error", "status": await HardPanStore.status(ids: want)])
            }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        let want = ids(call)
        Task {
            do { try await AppStore.sync() } catch {
                call.reject("restore failed"); return
            }
            call.resolve(["status": await HardPanStore.status(ids: want)])
        }
    }
}

// The StoreKit 2 work, free of Capacitor so the XCTest (AppStoreKitTests) calls it directly.
public enum HardPanStore {
    public static func isoPeriod(_ p: Product.SubscriptionPeriod?) -> String? {
        guard let p = p else { return nil }
        let u: String
        switch p.unit { case .day: u = "D"; case .week: u = "W"; case .month: u = "M"; case .year: u = "Y"; @unknown default: return nil }
        return "P\(p.value)\(u)"
    }

    public static func describe(_ p: Product) async -> [String: Any] {
        var d: [String: Any] = ["id": p.id, "title": p.displayName, "price": p.displayPrice,
                                "amount": NSDecimalNumber(decimal: p.price).doubleValue]
        if let c = p.priceFormatStyle.currencyCode as String? { d["currency"] = c }
        if let s = p.subscription {
            d["period"] = isoPeriod(s.subscriptionPeriod) ?? NSNull()
            if let intro = s.introductoryOffer, intro.paymentMode == .freeTrial {
                d["trial"] = isoPeriod(intro.period) ?? NSNull()
            } else { d["trial"] = NSNull() }
            d["introEligible"] = await s.isEligibleForIntroOffer
        }
        return d
    }

    // The facts for the newest verified entitlement among ids (the trial counts as active).
    public static func status(ids: [String]) async -> [String: Any] {
        var best: Transaction?
        for await r in Transaction.currentEntitlements {
            guard case .verified(let t) = r, t.revocationDate == nil else { continue }
            if !ids.isEmpty && !ids.contains(t.productID) { continue }
            if let e = t.expirationDate, e <= Date() { continue }
            if best == nil || (t.expirationDate ?? .distantPast) > (best!.expirationDate ?? .distantPast) { best = t }
        }
        guard let t = best else { return ["active": false, "state": "none"] }
        var willRenew = true
        var state = "subscribed"
        if let p = try? await Product.products(for: [t.productID]).first, let sub = p.subscription,
           let statuses = try? await sub.status {
            for s in statuses {
                guard case .verified(let ri) = s.renewalInfo, case .verified(let st) = s.transaction,
                      st.originalID == t.originalID else { continue }
                willRenew = ri.willAutoRenew
                switch s.state {
                case .subscribed: state = "subscribed"
                case .inGracePeriod: state = "grace"
                case .inBillingRetryPeriod: state = "retry"
                case .expired: state = "expired"
                case .revoked: state = "revoked"
                default: state = "\(s.state)"
                }
            }
        }
        var out: [String: Any] = ["active": state != "expired" && state != "revoked", "productId": t.productID,
                                  "willRenew": willRenew, "trial": t.offerType == .introductory, "state": state]
        if let e = t.expirationDate { out["expires"] = Int64(e.timeIntervalSince1970 * 1000) }
        return out
    }

    // One purchase: 'pro' | 'cancelled' | 'pending' | 'error'.
    public static func buy(_ p: Product) async throws -> String {
        switch try await p.purchase() {
        case .success(let v):
            guard case .verified(let t) = v else { return "error" }
            await t.finish()
            return "pro"
        case .userCancelled: return "cancelled"
        case .pending: return "pending"
        @unknown default: return "error"
        }
    }
}
