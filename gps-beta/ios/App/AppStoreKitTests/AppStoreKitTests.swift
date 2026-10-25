// AppStoreKitTests.swift - the Golf GPS subscription under StoreKit Test (URGENT-062).
//
// Hosted in the App (TEST_HOST), so the StoreKit test session below IS the store the app's
// HardPanStore plugin talks to - local, from App/HardPan.storekit (a resource of THIS bundle
// only, never of the app): no App Store Connect, no agreement, no network, nothing charged.
//
//   StoreLogic*   HardPanStore (the plugin's StoreKit 2 code) against SKTestSession: the two
//                 products and prices, the 7-day trial, buy, restore, expire, cancel.
//   testInAppFlow the real app (its web view) with the paywall ON (a GPS_PAYWALL=1 build;
//                 skipped otherwise): GPS door -> paywall -> trial -> badge / Profile line ->
//                 a round -> the trial expires MID-ROUND and the round keeps GPS (also after
//                 the app reopens) -> a new round asks -> Restore (none) -> buy -> cancel ->
//                 restore after a purchase elsewhere. With SHOT_DIR set (TEST_RUNNER_SHOT_DIR),
//                 it asks the host for a Simulator screenshot at each step (req-/ack- files).
//
// Run: xcodebuild test -project App.xcodeproj -scheme App -destination '<simulator>'
// A devicectl install never runs this, and never uses HardPan.storekit.

import XCTest
import StoreKit
import StoreKitTest
import WebKit
@testable import App

let FOUNDING = "com.rattlegolf.app.gpsmap.founding.yearly"
let REGULAR = "com.rattlegolf.app.gpsmap.yearly"
let IDS = [REGULAR, FOUNDING]

class StoreBase: XCTestCase {
    var session: SKTestSession!
    override func setUpWithError() throws {
        let url = try XCTUnwrap(Bundle(for: StoreBase.self).url(forResource: "HardPan", withExtension: "storekit"), "HardPan.storekit is in the test bundle")
        session = try SKTestSession(contentsOf: url)
        session.resetToDefaultState()
        session.disableDialogs = true
        session.clearTransactions()
    }
    override func tearDown() { session?.clearTransactions() }
    // StoreKit Test needs a moment after a new session before it answers (RevenueCat's tests wait too).
    func settle() async throws {
        try await Task.sleep(nanoseconds: 1_500_000_000)
        for _ in 0..<10 {
            let n = (try? await Product.products(for: IDS).count) ?? 0
            if n == IDS.count { return }
            print("062FLOW products not ready (\(n))")
            try await Task.sleep(nanoseconds: 1_000_000_000)
        }
    }
    func st() async -> [String: Any] { await HardPanStore.status(ids: IDS) }
    var settled = false
    func product(_ id: String) async throws -> Product {
        if !settled { try await settle(); settled = true }
        let p = try await Product.products(for: [id]).first; return try XCTUnwrap(p, id)
    }
}

final class StoreLogicTests: StoreBase {
    func testProductsPricesAndTrial() async throws {
        let f = await HardPanStore.describe(try await product(FOUNDING))
        let r = await HardPanStore.describe(try await product(REGULAR))
        XCTAssertEqual(f["price"] as? String, "$24.99"); XCTAssertEqual(r["price"] as? String, "$34.99")
        XCTAssertEqual(f["period"] as? String, "P1Y"); XCTAssertEqual(r["period"] as? String, "P1Y")
        XCTAssertEqual(f["trial"] as? String, "P1W"); XCTAssertEqual(r["trial"] as? String, "P1W")
        XCTAssertEqual(f["introEligible"] as? Bool, true)
    }

    func testStartTrialIsActiveTrialFounding() async throws {
        let none = await st()
        XCTAssertEqual(none["active"] as? Bool, false)
        let out = try await HardPanStore.buy(try await product(FOUNDING))
        XCTAssertEqual(out, "pro")
        let s = await st()
        XCTAssertEqual(s["active"] as? Bool, true); XCTAssertEqual(s["trial"] as? Bool, true)
        XCTAssertEqual(s["productId"] as? String, FOUNDING); XCTAssertEqual(s["willRenew"] as? Bool, true)
        let exp = Double(try XCTUnwrap(s["expires"] as? Int64)) / 1000
        XCTAssertEqual(exp - Date().timeIntervalSince1970, 7 * 86400, accuracy: 3600, "the trial ends in 7 days")
        // One trial per Apple ID per group: the regular product offers no second trial.
        let r = await HardPanStore.describe(try await product(REGULAR))
        XCTAssertEqual(r["introEligible"] as? Bool, false)
    }

    func testBuyRegularAfterTheFoundingWindow() async throws {
        let bought = try await HardPanStore.buy(try await product(REGULAR))
        XCTAssertEqual(bought, "pro")
        let s = await st()
        XCTAssertEqual(s["active"] as? Bool, true); XCTAssertEqual(s["productId"] as? String, REGULAR)
    }

    func testCancelledPurchaseIsNotActive() async throws {
        session.failTransactionsEnabled = true
        session.failureError = .paymentCancelled
        let out = try? await HardPanStore.buy(try await product(FOUNDING))
        XCTAssertNotEqual(out, "pro")
        let s = await st()
        XCTAssertEqual(s["active"] as? Bool, false)
        session.failTransactionsEnabled = false
    }

    func testExpireEndsIt() async throws {
        _ = try await HardPanStore.buy(try await product(FOUNDING))
        let before = await st()
        XCTAssertEqual(before["active"] as? Bool, true)
        try session.expireSubscription(productIdentifier: FOUNDING)
        try await Task.sleep(nanoseconds: 1_500_000_000)
        let after = await st()
        XCTAssertEqual(after["active"] as? Bool, false, "expired = not active")
    }

    func testCancelAutoRenewKeepsItToTheEnd() async throws {
        _ = try await HardPanStore.buy(try await product(FOUNDING))
        let t = try XCTUnwrap(session.allTransactions().last)
        try session.disableAutoRenewForTransaction(identifier: t.identifier)
        try await Task.sleep(nanoseconds: 1_500_000_000)
        let s = await st()
        XCTAssertEqual(s["active"] as? Bool, true, "a cancelled subscription runs to the end of its period")
        XCTAssertEqual(s["willRenew"] as? Bool, false)
    }

    func testRestoreFindsAPurchaseMadeElsewhere() async throws {
        // A purchase on another device with the same Apple ID (outside this app).
        try await settle()
        try session.buyProduct(productIdentifier: FOUNDING)
        try await AppStore.sync()
        let s = await st()
        XCTAssertEqual(s["active"] as? Bool, true); XCTAssertEqual(s["productId"] as? String, FOUNDING)
    }
}

// ---- THE REAL APP, THE PAYWALL ON ------------------------------------------------------
final class InAppFlowTests: StoreBase {
    var shotDir: String? { let v = ProcessInfo.processInfo.environment["SHOT_DIR"]; return (v?.isEmpty == false) ? v : nil }
    var log: [String] = []

    @MainActor func webView() -> WKWebView? {
        func find(_ v: UIView) -> WKWebView? {
            if let w = v as? WKWebView { return w }
            for s in v.subviews { if let w = find(s) { return w } }
            return nil
        }
        for sc in UIApplication.shared.connectedScenes {
            guard let ws = sc as? UIWindowScene else { continue }
            for w in ws.windows { if let x = find(w) { return x } }
        }
        return nil
    }
    // JS in the page (an async function body: `return ...`, `await` allowed). nil on a page change.
    @MainActor func js(_ body: String) async -> Any? {
        guard let w = webView() else { return nil }
        do { let v = try await w.callAsyncJavaScript(body, arguments: [:], in: nil, contentWorld: .page); return v is NSNull ? nil : v } catch { return nil }
    }
    func until(_ what: String, _ body: String, _ secs: Double = 40) async -> Bool {
        let end = Date().addingTimeInterval(secs)
        while Date() < end {
            if let v = await js(body) as? Bool, v { return true }
            try? await Task.sleep(nanoseconds: 400_000_000)
        }
        XCTFail("timed out: \(what)"); return false
    }
    func text(_ body: String) async -> String { (await js(body) as? String) ?? "" }
    func note(_ s: String) { log.append(s); print("062FLOW " + s) }
    // Ask the host for a Simulator screenshot (simctl io); wait for it.
    func shot(_ name: String) async {
        note("shot " + name)
        guard let d = shotDir else { return }
        FileManager.default.createFile(atPath: d + "/req-" + name, contents: Data())
        let end = Date().addingTimeInterval(30)
        while Date() < end && !FileManager.default.fileExists(atPath: d + "/ack-" + name) { try? await Task.sleep(nanoseconds: 250_000_000) }
    }
    func home() async {
        _ = await js("location.href = 'home.html'; return true;")
        try? await Task.sleep(nanoseconds: 2_500_000_000)
        _ = await until("home", "return !!document.querySelector('.hp-door.gps.hs-door') && !!window.HardPanEntitlement;")
    }
    func refresh() async { _ = await js("return await new Promise(function (r) { HardPanEntitlement.refresh(r); });") }

    func testInAppFlow() async throws {
        executionTimeAllowance = 1500
        // The page must be up, and this build's paywall ON (GPS_PAYWALL=1) - else nothing to test here.
        try await settle()
        for i in 0..<30 {
            if i == 3 { _ = await js("location.href = 'home.html'; return true;") }
            let w = await MainActor.run { self.webView() != nil }
            let href = await js("return location.href + ' ent=' + (typeof window.HardPanEntitlement);")
            note("page: webView=\(w) \(String(describing: href))")
            if let h = href as? String, h.contains("ent=object") { break }
            try? await Task.sleep(nanoseconds: 2_000_000_000)
        }
        _ = await until("app page", "return !!window.HardPanEntitlement;", 60)
        let on = await js("return !!(window.HARDPAN_GPS_CONFIG && HARDPAN_GPS_CONFIG.paywall === true && HARDPAN_GPS_CONFIG.iapStore === 'storekit');") as? Bool
        try XCTSkipUnless(on == true, "this build's paywall is off (build with GPS_PAYWALL=1 to run the in-app flow)")
        _ = await js("try { localStorage.removeItem('hardpan_gps_round_pass'); sessionStorage.clear(); } catch (e) {} return true;")

        // 1. A golfer with no trial: the GPS door says "7-day free trial".
        await home(); await refresh()
        _ = await until("door offer tag", "var t = document.querySelector('.hs-gps-tag'); return !!t && t.getAttribute('data-tag') === 'offer';")
        let tag0 = await text("return document.querySelector('.hs-gps-tag').textContent;")
        XCTAssertEqual(tag0, "7-day free trial")
        await shot("01-gps-door-no-subscription")

        // 2. The door -> the paywall: founding $24.99, then $34.99, the Apple terms.
        _ = await js("document.querySelector('[data-hp-act=sgpsdoor]').click(); return true;")
        _ = await until("paywall price", "var p = document.querySelector('#gps-paywall .gps-sheet-price'); return !!p && /24\\.99/.test(p.textContent);")
        let pw = await text("return document.querySelector('#gps-paywall .gps-sheet-card').innerText;")
        note("paywall: " + pw.replacingOccurrences(of: "\n", with: " | "))
        for want in ["Start 7-day free trial", "$24.99/year founding price", "After the first 1,000 subscribers: $34.99/year.", "1-year subscription, renews automatically.",
                     "7-day free trial, then $24.99/year.", "Renews automatically each year", "Restore Purchases", "Terms of Use", "Privacy Policy", "Not now"] {
            XCTAssertTrue(pw.contains(want), "paywall says: " + want)
        }
        await shot("02-paywall")
        _ = await js("var c = document.querySelector('#gps-paywall .gps-sheet-card'); c.scrollTop = c.scrollHeight; return true;")
        try? await Task.sleep(nanoseconds: 600_000_000)
        await shot("03-paywall-terms")

        // 3. Start the trial (StoreKit test: confirmed, no charge) -> on to the course screen.
        _ = await js("document.querySelector('#gps-paywall .gps-sheet-buy').click(); return true;")
        // The paywall closes and the door goes on to the course screen (admin.html - no entitlement module there).
        _ = await until("on to the course screen", "return /admin\\.html/.test(location.pathname) || !!document.getElementById('sf');")
        try? await Task.sleep(nanoseconds: 3_000_000_000)
        await shot("04-trial-started-course")

        // 4. The trial badge on the door, and the Profile line.
        await home()
        _ = await until("trial active", "return HardPanEntitlement.isPro() === true;")
        var sub = await js("return HardPanEntitlement.subscription();") as? [String: Any] ?? [:]
        note("after trial: \(sub)")
        XCTAssertEqual(sub["trial"] as? Bool, true); XCTAssertEqual(sub["founding"] as? Bool, true)
        _ = await until("door trial tag", "var t = document.querySelector('.hs-gps-tag'); return !!t && t.getAttribute('data-tag') === 'trial';")
        let tag = await text("return document.querySelector('.hs-gps-tag').textContent;")
        XCTAssertTrue(tag.hasPrefix("Free trial \u{00b7} "), tag)
        await shot("05-trial-badge-door")
        _ = await js("HardPanAccountUI.openProfile(); return true;")
        _ = await until("profile line", "return !!document.querySelector('[data-hpa-sub]');")
        let line = await text("return document.querySelector('[data-hpa-sub]').innerText;")
        note("profile: " + line)
        XCTAssertTrue(line.hasPrefix("Golf GPS \u{00b7} renews "), line); XCTAssertTrue(line.contains("Free trial"), line)
        await shot("06-profile-line-trial")
        _ = await js("var x = document.querySelector('[data-hpa=close]'); if (x) x.click(); return true;")

        // 5. A round with GPS (named "Test 062 ..."), then the trial ends MID-ROUND.
        _ = await js("document.querySelector('[data-hp-act=sgpsdoor]').click(); return true;")
        _ = await until("course list", "return document.querySelectorAll('#sf [data-sf-course]').length > 0;", 90)
        try? await Task.sleep(nanoseconds: 6_000_000_000)
        let name = "Test 062 storekit midround"
        _ = await js("""
            var nm = '\(name)';
            var s = document.getElementById('round-day-select'); if (s) { var o = document.createElement('option'); o.value = nm; o.textContent = nm; s.appendChild(o); s.value = nm; s.dispatchEvent(new Event('change', { bubbles: true })); }
            var b = document.querySelector('#player-list .p-name-input'); if (!b && window.addNewPlayerAndRefresh) { addNewPlayerAndRefresh(); b = document.querySelector('#player-list .p-name-input'); }
            if (b) { b.value = 'Test 062'; b.dispatchEvent(new Event('input', { bubbles: true })); }
            return true;
            """)
        _ = await until("Start GPS ready", "var b = document.querySelector('[data-sf=startgps]'); return !!b && !b.disabled;", 90)
        _ = await js("document.querySelector('[data-sf=startgps]').click(); return true;")
        _ = await until("the map", "return !!(window.HardPanGps && HardPanGps.isMounted && HardPanGps.isMounted() && HardPanGps.side() === 'gps');", 90)
        try? await Task.sleep(nanoseconds: 6_000_000_000)
        let code = await text("return (location.search.match(/game=(\\w+)/) || [])[1] || (window.currentData && currentData.code) || '';")
        note("ROUND CODE " + code + " (" + name + ")")
        await shot("07-round-on-gps-in-trial")

        try session.expireSubscription(productIdentifier: FOUNDING)
        try? await Task.sleep(nanoseconds: 1_500_000_000)
        await refresh()
        _ = await until("trial over", "return HardPanEntitlement.isPro() === false;")
        let still = await js("return { side: HardPanGps.side(), map: HardPanGps.canMap(), pro: HardPanGps.hasGpsPro(), pass: HardPanGps.roundPass() };") as? [String: Any] ?? [:]
        note("trial ended mid-round: \(still)")
        XCTAssertEqual(still["side"] as? String, "gps"); XCTAssertEqual(still["map"] as? Bool, true); XCTAssertEqual(still["pass"] as? Bool, true)
        let pwMid = await js("var p = document.getElementById('gps-paywall'); return p && p.style.display !== 'none' ? true : null;")
        XCTAssertNil(pwMid, "no paywall mid-round")
        await shot("08-trial-ended-mid-round-still-gps")
        // The app reopened mid-round (the page reloads): the round still has GPS.
        _ = await js("location.reload(); return true;")
        try? await Task.sleep(nanoseconds: 4_000_000_000)
        _ = await until("map after reopen", "return !!(window.HardPanGps && HardPanGps.isMounted && HardPanGps.isMounted() && HardPanGps.canMap() && HardPanGps.side() === 'gps');", 90)
        try? await Task.sleep(nanoseconds: 5_000_000_000)
        await shot("09-reopened-mid-round-still-gps")

        // 6. A NEW round after the trial: the paywall, no second trial ("Subscribe").
        await home(); await refresh()
        _ = await js("try { sessionStorage.removeItem('hardpan_gps_sheet_seen'); } catch (e) {} document.querySelector('[data-hp-act=sgpsdoor]').click(); return true;")
        _ = await until("paywall again", "var p = document.querySelector('#gps-paywall .gps-sheet-buy'); return !!p && p.offsetParent !== null && p.textContent === 'Subscribe';")
        await shot("10-new-round-paywall-subscribe")
        // Restore with nothing active: one sentence.
        _ = await js("document.querySelector('#gps-paywall .gps-sheet-restore').click(); return true;")
        _ = await until("restore none", "var m = document.querySelector('#gps-paywall .gps-sheet-msg'); return !!m && /No GPS Map subscription was found/.test(m.textContent);")
        await shot("11-restore-nothing-found")

        // 7. Buy (the founding price, paid at once - no trial left).
        _ = await js("document.querySelector('#gps-paywall .gps-sheet-buy').click(); return true;")
        _ = await until("paywall closed after buy", "var p = document.getElementById('gps-paywall'); return !p || p.style.display === 'none' || /admin\\.html/.test(location.pathname);")
        await home()
        _ = await until("paid", "return HardPanEntitlement.isPro() === true;")
        sub = await js("return HardPanEntitlement.subscription();") as? [String: Any] ?? [:]
        note("after buy: \(sub)")
        XCTAssertEqual(sub["trial"] as? Bool, false); XCTAssertEqual(sub["founding"] as? Bool, true)
        _ = await js("HardPanAccountUI.openProfile(); return true;")
        _ = await until("profile paid", "var e = document.querySelector('[data-hpa-sub]'); return !!e && !/Free trial/.test(e.innerText);")
        note("profile paid: " + (await text("return document.querySelector('[data-hpa-sub]').innerText;")))
        let tagPaid = await js("return document.querySelector('.hs-gps-tag') ? true : null;")
        XCTAssertNil(tagPaid, "no door tag for a subscriber")
        await shot("12-profile-line-paid")

        // 8. Cancel (auto-renew off, as in Settings): the line says when it ends. No prompt anywhere.
        let t = try XCTUnwrap(session.allTransactions().last)
        try session.disableAutoRenewForTransaction(identifier: t.identifier)
        try? await Task.sleep(nanoseconds: 1_500_000_000)
        await refresh()
        _ = await js("var x = document.querySelector('[data-hpa=close]'); if (x) x.click(); HardPanAccountUI.openProfile(); return true;")
        _ = await until("profile ends", "var e = document.querySelector('[data-hpa-sub]'); return !!e && /\\u00b7 ends /.test(e.innerText);")
        note("profile cancelled: " + (await text("return document.querySelector('[data-hpa-sub]').innerText;")))
        let proCancelled = await js("return HardPanEntitlement.isPro();") as? Bool
        XCTAssertTrue(proCancelled == true, "still active to the end of the period")
        await shot("13-profile-line-cancelled")
        _ = await js("var x = document.querySelector('[data-hpa=close]'); if (x) x.click(); return true;")

        // 9. Expired, then bought on another device: Restore finds it.
        try session.expireSubscription(productIdentifier: FOUNDING)
        try? await Task.sleep(nanoseconds: 1_500_000_000)
        await refresh()
        _ = await until("expired", "return HardPanEntitlement.isPro() === false;")
        try session.buyProduct(productIdentifier: REGULAR)
        _ = await js("try { sessionStorage.removeItem('hardpan_gps_sheet_seen'); } catch (e) {} HardPanGps.requireGps({}, function () { window.__go = 1; }, function () {}); return true;")
        _ = await until("paywall for restore", "var p = document.querySelector('#gps-paywall'); return !!p && p.style.display !== 'none';")
        _ = await js("document.querySelector('#gps-paywall .gps-sheet-restore').click(); return true;")
        _ = await until("restored", "return HardPanEntitlement.isPro() === true && window.__go === 1;")
        sub = await js("return HardPanEntitlement.subscription();") as? [String: Any] ?? [:]
        note("after restore: \(sub)")
        XCTAssertEqual(sub["productId"] as? String, REGULAR)
        await shot("14-restored")
        note("FLOW DONE")
    }
}
