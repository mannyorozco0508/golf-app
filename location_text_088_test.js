// ============================================================================
// 088 item 2 (078 "ADDED Oct 26"): THE APP'S LOCATION PERMISSION TEXT MATCHES
// THE LIVE PRIVACY PAGE.
//
// The live privacy page (main 9eab1533, privacy.html "Your location") says
// background location is used only while a round's Lock Screen view is on,
// stays on the phone, and stops when it ends. The Lock Screen view
// (PhoneBridge/HardPanLiveActivityPlugin.swift startLocation) really does keep
// location running while the phone is locked (UIBackgroundModes location,
// allowsBackgroundLocationUpdates) - so the old "It never tracks you in the
// background" was untrue, and the When-In-Use text's "only while the app is
// open" was too: the app only ever asks for When In Use, so THAT is the
// sentence iOS shows in the dialog.
//
// This pins both new sentences and fails on the old ones.
// ============================================================================
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PLIST = path.join(__dirname, 'gps-beta', 'ios', 'App', 'App', 'Info.plist');
const plist = fs.readFileSync(PLIST, 'utf8');
const value = (key) => {
    const m = new RegExp('<key>' + key + '</key>\\s*<string>([^<]*)</string>').exec(plist);
    return m ? m[1] : null;
};

const ALWAYS = "HardPan GPS uses your location to show yardages to the green. In the background it is used only while a round's Lock Screen view is on, stays on your phone, and stops when the round ends.";
const WHEN_IN_USE = "HardPan GPS uses your location to show yardages to the green while the app is open, and while a round's Lock Screen view is on. It stays on your phone unless you choose to set a green where you are standing.";

test('NSLocationAlwaysAndWhenInUseUsageDescription says what the privacy page says', () => {
    assert.equal(value('NSLocationAlwaysAndWhenInUseUsageDescription'), ALWAYS);
});

test('NSLocationWhenInUseUsageDescription (the one iOS shows: the app asks When In Use only) is true too', () => {
    assert.equal(value('NSLocationWhenInUseUsageDescription'), WHEN_IN_USE);
});

test('the old untrue sentences are gone', () => {
    assert.ok(!/never tracks you in the background/i.test(plist), 'the old Always text');
    assert.ok(!/uses your location only while the app is open/i.test(plist), 'the old When-In-Use text');
    assert.ok(!/only uses your location while the app is open/i.test(plist));
});

test('short enough for the dialog (both under 220 characters)', () => {
    assert.ok(ALWAYS.length < 220 && WHEN_IN_USE.length < 220, ALWAYS.length + ' / ' + WHEN_IN_USE.length);
});

test('the claims match the code: background location exists only through the Lock Screen view, and no Always request', () => {
    // If either of these ever changes, the sentences above stop being true.
    assert.ok(/UIBackgroundModes[\s\S]*<string>location<\/string>/.test(plist), 'background location mode (for the Lock Screen view)');
    const swiftDir = path.join(__dirname, 'gps-beta', 'ios', 'App', 'PhoneBridge');
    const bg = fs.readdirSync(swiftDir).filter((f) => f.endsWith('.swift'))
        .filter((f) => /allowsBackgroundLocationUpdates\s*=\s*true/.test(fs.readFileSync(path.join(swiftDir, f), 'utf8')));
    assert.deepEqual(bg, ['HardPanLiveActivityPlugin.swift'], 'only the Lock Screen view turns on background updates');
    const all = fs.readdirSync(swiftDir).map((f) => fs.readFileSync(path.join(swiftDir, f), 'utf8')).join('\n');
    assert.ok(!/requestAlwaysAuthorization/.test(all), 'the app never asks for Always');
});

test('NEGATIVE CONTROL: the matcher really rejects the old text', () => {
    const old = '<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>\n\t<string>HardPan GPS only uses your location while the app is open, to show your yardages to the green. It never tracks you in the background.</string>';
    const m = /<key>NSLocationAlwaysAndWhenInUseUsageDescription<\/key>\s*<string>([^<]*)<\/string>/.exec(old);
    assert.notEqual(m[1], ALWAYS);
    assert.ok(/never tracks you in the background/i.test(old));
});
