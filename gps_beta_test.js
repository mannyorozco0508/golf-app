// ============================================================================
// HARDPAN GPS (com.rattlegolf.gpsbeta) - THE MERGED APP'S PROMISES, PINNED
// Build 4 on, 0.2 (2026-10-09). Build 3 (yardage-only, no database) is the git
// tag gps-beta-b3 and is rebuilt from there.
//
// The SAME TestFlight app (no new app, no new bundle id), now the full app:
//   - THE CONSUMER APP EXACTLY, PLUS GPS: tools/build-gps-app.js ships the
//     SHARED_SHELL + CONSUMER_SHELL lists read from sync-mobile-web.js, with the
//     GPS flag on - so home, setup, players, bets, the scorecard, sign-in and the
//     Firebase web SDK (the same database) are the Consumer app's own files.
//   - ITS OWN APP: bundle com.rattlegolf.gpsbeta, "HardPan GPS", team A2Z95T64UU,
//     0.2 (4), When-In-Use location only, Sign in with Apple and push entitlements,
//     the Consumer app's five native plugins plus Geolocation, Google but no
//     Facebook, and an Archive that refuses a Firebase config for another bundle.
//   - The Consumer app's ios/ and sync-mobile-web.js are not touched (their own
//     tests pin them; sync-mobile-web.js still refuses GPS_ENABLED=1).
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const BETA = path.join(ROOT, 'gps-beta');
const ON = fs.existsSync(BETA) && fs.existsSync(path.join(ROOT, 'gps-view.js'));
const skip = ON ? false : 'no gps-beta in this tree';
const read = (f) => fs.readFileSync(path.join(BETA, f), 'utf8');

test('the app is the Consumer app plus GPS: the same declared lists, GPS on, nothing restated', { skip }, () => {
    const b = fs.readFileSync(path.join(ROOT, 'tools', 'build-gps-app.js'), 'utf8');
    assert.ok(/declaredList\('SHARED_SHELL'\)\.concat\(declaredList\('CONSUMER_SHELL'\)\)\.concat\(GPS\)/.test(b), 'the Consumer lists, from sync-mobile-web.js');
    assert.ok(/gpsFlag\.applyFlag\(fs\.readFileSync\(src, 'utf8'\), true, file\)/.test(b), 'GPS on');
    assert.ok(!/ios\/App\/App\/Info\.plist|path\.join\(ROOT, 'ios'/.test(b), 'never writes the Consumer app\'s ios/');
    // The yardage-only page and its trip cards are gone from this tree (tag gps-beta-b3).
    assert.ok(!fs.existsSync(path.join(BETA, 'index.html')) && !fs.existsSync(path.join(BETA, 'trip-cards.js')));
    assert.ok(!fs.existsSync(path.join(ROOT, 'tools', 'build-gps-beta.js')));
    // The Consumer app's own sync still refuses to build GPS.
    assert.ok(/GPS_ENABLED=1 refused/.test(fs.readFileSync(path.join(ROOT, 'sync-mobile-web.js'), 'utf8')));
});

test('its own app: bundle id, name, team, 0.2 (4), entitlements, Firebase guard', { skip }, () => {
    const cap = JSON.parse(read('capacitor.config.json'));
    assert.strictEqual(cap.appId, 'com.rattlegolf.gpsbeta');
    assert.strictEqual(cap.appName, 'HardPan GPS');
    assert.deepStrictEqual(cap.ios.includePlugins, ['@capacitor/filesystem', '@capacitor/share', '@capacitor-firebase/authentication',
        '@capacitor/push-notifications', '@capacitor-firebase/messaging', '@capacitor/geolocation'], 'the Consumer app\'s five plus Geolocation');
    assert.deepStrictEqual(cap.experimental.ios.spm.packageTraits['@capacitor-firebase/authentication'], ['Google'], 'no Facebook SDK');
    assert.strictEqual(cap.plugins.FirebaseAuthentication.skipNativeAuth, true, 'the JS layer owns the session, as in the Consumer app');
    const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
    assert.strictEqual((pbx.match(/PRODUCT_BUNDLE_IDENTIFIER = com\.rattlegolf\.gpsbeta;/g) || []).length, 2);
    assert.strictEqual((pbx.match(/DEVELOPMENT_TEAM = A2Z95T64UU;/g) || []).length, 2);
    assert.strictEqual((pbx.match(/MARKETING_VERSION = 0\.2;/g) || []).length, 2);
    assert.strictEqual((pbx.match(/CURRENT_PROJECT_VERSION = 4;/g) || []).length, 2, 'build 4 (the merged app)');
    assert.ok(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/.test(pbx) && /CODE_SIGN_ENTITLEMENTS = App\/AppRelease\.entitlements;/.test(pbx));
    assert.ok(/GoogleService-Info\.plist in Resources/.test(pbx), 'the Firebase iOS config ships in the app');
    assert.ok(/Firebase config is for this app/.test(pbx) && /CONFIGURATION\}\\" = \\"Release\\"/.test(pbx) && /Print BUNDLE_ID/.test(pbx), 'an Archive refuses a config for another bundle');
    ['App.entitlements', 'AppRelease.entitlements'].forEach((e) => {
        const x = read('ios/App/App/' + e);
        assert.ok(/com\.apple\.developer\.applesignin/.test(x) && /aps-environment/.test(x), e);
    });
    assert.ok(/didRegisterForRemoteNotificationsWithDeviceToken/.test(read('ios/App/App/AppDelegate.swift')), 'push tokens reach the plugin');
    const plist = read('ios/App/App/Info.plist');
    assert.ok(/<key>NSLocationWhenInUseUsageDescription<\/key>\s*<string>[^<]{40,}<\/string>/.test(plist), 'a clear When-In-Use reason');
    assert.ok(!/NSLocationAlways/.test(plist), 'never Always');
    assert.ok(/<key>CFBundleDisplayName<\/key>\s*<string>HardPan GPS<\/string>/.test(plist));
    assert.ok(!/HardPan GPS Beta/.test(plist), 'the old name is gone');
    assert.ok(/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/.test(plist));
    const pm = read('ios/App/App/PrivacyInfo.xcprivacy');
    assert.ok(/<key>NSPrivacyTracking<\/key>\s*<false\/>/.test(pm) && /NSPrivacyCollectedDataTypeEmailAddress/.test(pm), 'no tracking; sign-in data declared');
    const pkg = read('ios/App/CapApp-SPM/Package.swift');
    assert.ok(/CapacitorGeolocation/.test(pkg) && /CapacitorFirebaseAuthentication", path: [^\n]*traits: \["Google"\]/.test(pkg) && !/acebook/.test(pkg));
});
