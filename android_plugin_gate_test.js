// ============================================================================
// ANDROID: AN EXTRA SHOWS ONLY WHEN ITS PLUGIN IS REALLY IN THE APP (android-2.0, 024 A3)
//   Capacitor.registerPlugin('X') hands back a stand-in for a plugin the app does not have;
//   every call on it fails "not implemented". On iOS the plugins are in the app, so the old
//   check (plugin() non-null) was right there. On Android it would have shown a mic button,
//   a Lock Screen switch and a Notifications section that do nothing.
//   The rule on Android: Capacitor.isPluginAvailable(name), or the extra is not there.
//   Scan already did this (gps-scan-client.js nativeCameraHere); voice and the Lock Screen
//   row now do too, and the Customize panel has no NOTIFICATIONS section on Android (no
//   push until 024 D2). Each Android change has an iOS-unchanged test beside it.
//   What this harness can prove: what each file decides from the platform it is told.
//   The Customize section is checked through the registry's openPanel() (what Tools >
//   Customize calls); the tap path itself is the emulator smoke run (024 A4).
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ON = fs.existsSync(path.join(__dirname, 'gps-voice.js'));
const skip = ON ? false : 'Consumer tree: no GPS files';
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

// A Capacitor that behaves like the real bridge: registerPlugin always returns an object.
function cap(platform, installed) {
    const have = new Set(installed || []);
    return {
        getPlatform: () => platform,
        isNativePlatform: () => platform !== 'web',
        isPluginAvailable: (n) => have.has(n),
        registerPlugin: (n) => ({ stub: n, available: () => Promise.reject(new Error('"' + n + '" plugin is not implemented on ' + platform)) }),
        Plugins: {}
    };
}
function sandbox(platform, installed) {
    const store = {};
    const sb = {
        localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
        addEventListener() {}, JSON, Object, Math, Number, String, Date, Promise, RegExp, Array, isFinite, setTimeout, clearTimeout, console
    };
    sb.window = sb;
    if (platform) sb.Capacitor = cap(platform, installed);
    sb.HardPanFeatureQueue = [];
    vm.createContext(sb);
    return sb;
}

describe('voice: the mic shows only where HardPanVoice is in the app', () => {
    const voiceDef = (sb) => { vm.runInContext(read('gps-voice.js'), sb); return sb.HardPanFeatureQueue.filter((d) => d && d.id === 'voice')[0]; };
    test('ANDROID without the plugin: not available (no dead mic button)', { skip }, () => {
        const d = voiceDef(sandbox('android', []));
        assert.ok(d, 'the voice extra registers');
        assert.equal(d.available(), false);
    });
    test('ANDROID once the plugin is in the app (024 D4): available', { skip }, () => {
        assert.equal(voiceDef(sandbox('android', ['HardPanVoice'])).available(), true);
    });
    test('iOS UNCHANGED: available through registerPlugin, as before', { skip }, () => {
        assert.equal(voiceDef(sandbox('ios', [])).available(), true);
    });
    test('the web: never', { skip }, () => {
        assert.equal(voiceDef(sandbox(null)).available(), false);
    });
});

describe('Lock Screen yardages: the row shows only where HardPanLiveActivity is in the app', () => {
    const la = (sb) => { vm.runInContext(read('gps-live-activity.js'), sb); return sb.HardPanLiveActivity; };
    test('ANDROID without the plugin: here() is false', { skip }, () => {
        assert.equal(la(sandbox('android', [])).here(), false);
    });
    test('ANDROID with the plugin (024 D5): here() is true', { skip }, () => {
        assert.equal(la(sandbox('android', ['HardPanLiveActivity'])).here(), true);
    });
    test('iOS UNCHANGED: here() is true through registerPlugin', { skip }, () => {
        assert.equal(la(sandbox('ios', [])).here(), true);
    });
    test('gps-view.js shows the row on iOS as before, and on Android only through here()', { skip }, () => {
        const src = read('gps-view.js');
        const line = src.split('\n').filter((l) => /sw\('lockscreen'/.test(l));
        assert.equal(line.length, 1, 'one Lock Screen switch line');
        assert.match(line[0], /isNative\(\) && \(!androidApp\(\) \|\| \(typeof LAs\.here === 'function' && LAs\.here\(\)\)\)/);
        assert.match(src, /function androidApp\(\) \{ try \{ return isNative\(\) && window\.Capacitor\.getPlatform\(\) === 'android'; \}/);
    });
});

describe('Customize: no NOTIFICATIONS section on Android (no push until 024 D2)', () => {
    const { createDocument } = require('./helpers/mini-dom.js');
    function panelHtml(platform) {
        const sb = sandbox(platform, []);
        sb.document = createDocument();
        sb.HARDPAN_GPS_CONFIG = { features: {} };
        sb.HardPanGpsStats = { quick: {} };
        sb.firebase = { auth: () => ({ currentUser: { uid: 'u-test', isAnonymous: false } }), database: () => ({ ref: () => ({ once: () => new Promise(() => {}), on() {}, off() {} }) }) };
        sb.innerHeight = 852;
        vm.runInContext('var document = window.document;', sb);
        vm.runInContext(read('feature-registry.js'), sb);
        sb.HardPanFeatures.openPanel();
        const sheets = [];
        const walk = (n) => { if (!n) return; if (n.className && /hpf-panel/.test(n.className)) sheets.push(n); (n.children || n.childNodes || []).forEach(walk); };
        walk(sb.document.body || sb.document.documentElement);
        return sheets.map((s) => s.innerHTML).join('');
    }
    test('ANDROID: the panel opens with its extras and no NOTIFICATIONS', { skip }, () => {
        const h = panelHtml('android');
        assert.match(h, /EXTRAS ON YOUR ROUND SCREEN/, 'the panel is there (positive)');
        assert.ok(!/NOTIFICATIONS/.test(h), 'no notifications section on Android');
        assert.ok(!/Round results/.test(h));
    });
    test('iOS UNCHANGED: the NOTIFICATIONS section is there', { skip }, () => {
        const h = panelHtml('ios');
        assert.match(h, /EXTRAS ON YOUR ROUND SCREEN/);
        assert.match(h, /NOTIFICATIONS/);
    });
});
