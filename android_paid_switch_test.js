// ============================================================================
// ANDROID: GPS IS FREE UNTIL PLAY BILLING (android-2.0, 024 A3; Manny, 2026-10-24)
//   Billing goes through RevenueCat, and until that step lands on Android GPS stays free
//   there: iap false, paywall false, Android only. iOS keeps iap: true, and every other
//   setting, exactly as the repo writes them.
//   gps-config.js ends with the Android block; it fixes both values, so even a
//   GPS_PAYWALL=1 build (which appends "paywall = true" after it) cannot lock GPS on Android.
//   What this harness can prove: the config each platform reads, and what the entitlement
//   module does with it at load. It cannot prove the GPS screen opens on a phone; that is
//   the emulator smoke run (024 A4).
// ============================================================================
'use strict';
const test0 = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const os = require('os');
const { execFileSync } = require('child_process');
const ON = fs.existsSync(path.join(__dirname, 'gps-entitlement.js'));
const test = (n, f) => test0(n, { skip: ON ? false : 'Consumer tree: no GPS files' }, f);
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

function phone(platform, configSrc) {
    const sb = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, JSON, Object, Math, Number, String, Date, Promise, RegExp, isFinite, setTimeout, clearTimeout };
    sb.window = sb;
    sb.document = { addEventListener() {}, visibilityState: 'visible' };
    if (platform) sb.Capacitor = { getPlatform: () => platform, isNativePlatform: () => platform !== 'web', Plugins: {} };
    vm.createContext(sb);
    vm.runInContext(configSrc, sb);
    vm.runInContext(read('gps-entitlement.js'), sb);
    return sb;
}
const plain = (sb) => JSON.parse(JSON.stringify(sb.HARDPAN_GPS_CONFIG));

test('the repo still writes iap: true (the Android switch is not a repo change for iOS)', () => {
    assert.match(read('gps-config.js'), /\n    iap: true, iapEntitlement: 'gps_map'/);
});

test('iOS UNCHANGED: the config iOS reads is the one the web reads, iap true, and the store is on', () => {
    const ios = phone('ios', read('gps-config.js')), web = phone(null, read('gps-config.js'));
    assert.strictEqual(ios.HARDPAN_GPS_CONFIG.iap, true, 'iOS keeps iap: true');
    assert.strictEqual(ios.HARDPAN_GPS_CONFIG.paywall, false, 'iOS reads the repo paywall (false; only a GPS_PAYWALL=1 build turns it on)');
    assert.deepStrictEqual(plain(ios), plain(web), 'every setting iOS reads is the repo value');
    assert.strictEqual(ios.HardPanEntitlement.enabled(), true, 'the iOS store path is on');
});

test('ANDROID: iap false and paywall false, and the store is never asked', () => {
    const a = phone('android', read('gps-config.js'));
    assert.strictEqual(a.HARDPAN_GPS_CONFIG.iap, false);
    assert.strictEqual(a.HARDPAN_GPS_CONFIG.paywall, false);
    assert.strictEqual(a.HardPanEntitlement.enabled(), false, 'no purchase plugin is ever called on Android');
    assert.strictEqual(a.HardPanEntitlement.known(), true, 'nothing to wait for: the GPS gate never holds');
    // Everything else Android reads is the repo's.
    const ios = plain(phone('ios', read('gps-config.js'))), and = plain(a);
    delete ios.iap; delete ios.paywall; delete and.iap; delete and.paywall;
    assert.deepStrictEqual(and, ios, 'only iap and paywall differ on Android');
});

test('a GPS_PAYWALL=1 build: iOS gets the paywall, Android still cannot be locked', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gpsbuild-paywall-'));
    try {
        execFileSync(process.execPath, [path.join(__dirname, 'tools/build-gps-app.js')], { env: Object.assign({}, process.env, { GPS_APP_DEST: out, GPS_PAYWALL: '1', GPS_DEV_PRO: '' }), stdio: 'ignore' });
        const built = fs.readFileSync(path.join(out, 'gps-config.js'), 'utf8');
        assert.ok(built.indexOf('HARDPAN_GPS_CONFIG.paywall = true;') > built.indexOf('GPS IS FREE UNTIL PLAY BILLING'), 'the build appends the paywall line after the Android block');
        assert.ok(built.indexOf('GPS IS FREE UNTIL PLAY BILLING') > 0, 'the Android block is in the build');
        const ios = phone('ios', built), a = phone('android', built);
        assert.strictEqual(ios.HARDPAN_GPS_CONFIG.paywall, true, 'positive control: the paywall build does turn it on for iOS');
        assert.strictEqual(ios.HardPanEntitlement.known(), false, 'iOS waits for the store');
        assert.strictEqual(a.HARDPAN_GPS_CONFIG.paywall, false, 'Android stays free');
        assert.strictEqual(a.HARDPAN_GPS_CONFIG.iap, false);
        assert.strictEqual(a.HardPanEntitlement.statusLine(Date.now()), null, 'no trial line on Android');
    } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
