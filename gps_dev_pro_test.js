// ============================================================================
// THE DEV SWITCH AND THE 008 FEATURE SWITCHES (mailbox 008, 2026-10-18)
//   GPS_DEV_PRO=1 node tools/build-gps-app.js makes Manny's Cmd+R build count as subscribed, so he
//   can beta-test the GPS features while the store isn't set up. It must exist ONLY in such a
//   build: never in the repo's gps-config.js, never in a plain build. Each 008 feature reads its
//   own switch (HardPanFeature), on unless set exactly false.
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
function ent(config) {
    const sb = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, JSON, Object, Math, Number, String, Date, Promise, RegExp, isFinite, setTimeout, clearTimeout };
    sb.window = sb; sb.HARDPAN_GPS_CONFIG = config;
    vm.createContext(sb); vm.runInContext(read('gps-entitlement.js'), sb);
    return sb.HardPanEntitlement;
}
test('the repo config has NO dev switch, and iap stays on', () => {
    const c = read('gps-config.js');
    assert.ok(!/devPro\s*[:=]/.test(c), 'devPro must never be in the repo config');
    assert.match(c, /iap: true/);
});
test('a dev-switched config counts as subscribed at once; without it, no store = not subscribed', async () => {
    const dev = ent({ iap: true, devPro: true, revenueCatKey: '' });
    const v = await new Promise((r) => dev.refresh(r));
    assert.strictEqual(v, true); assert.strictEqual(dev.isPro(), true);
    const rel = ent({ iap: true, revenueCatKey: '' });
    const w = await new Promise((r) => rel.refresh(r));
    assert.strictEqual(w, false); assert.strictEqual(rel.isPro(), false);
});
test('the build writes the switch only with GPS_DEV_PRO=1', () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'gpsbuild-')), dev = fs.mkdtempSync(path.join(os.tmpdir(), 'gpsbuild-dev-'));
    try {
        execFileSync(process.execPath, [path.join(__dirname, 'tools/build-gps-app.js')], { env: Object.assign({}, process.env, { GPS_APP_DEST: plain, GPS_DEV_PRO: '' }), stdio: 'ignore' });
        execFileSync(process.execPath, [path.join(__dirname, 'tools/build-gps-app.js')], { env: Object.assign({}, process.env, { GPS_APP_DEST: dev, GPS_DEV_PRO: '1' }), stdio: 'ignore' });
        assert.ok(!/devPro/.test(fs.readFileSync(path.join(plain, 'gps-config.js'), 'utf8')), 'a plain build has no dev switch');
        assert.match(fs.readFileSync(path.join(dev, 'gps-config.js'), 'utf8'), /NEVER ARCHIVE THIS BUILD\.\nwindow\.HARDPAN_GPS_CONFIG\.devPro = true;/);
    } finally { fs.rmSync(plain, { recursive: true, force: true }); fs.rmSync(dev, { recursive: true, force: true }); }
});
test('HardPanFeature: every 008 switch exists and is on; exactly false turns one off', () => {
    const sb = { }; sb.window = sb; vm.createContext(sb); vm.runInContext(read('gps-config.js'), sb);
    ['autoAdvance', 'quickStats', 'hazards', 'clubs', 'flyover', 'pathTarget', 'hpIndex', 'osmPath'].forEach((n) => assert.strictEqual(sb.HardPanFeature(n), true, n));
    sb.HARDPAN_GPS_CONFIG.features.hazards = false;
    assert.strictEqual(sb.HardPanFeature('hazards'), false);
});
