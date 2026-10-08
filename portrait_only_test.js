// ============================================================================
// PORTRAIT ONLY, EVERYWHERE (Build 12, 2026-10-08)
//
// Manny's instruction: portrait only, always, iPhone and iPad and Android, no
// landscape anywhere.
//
// WHY IT NEEDS A GUARD rather than one edit. The orientation lists live in two
// files that nothing else in this repo reads, in formats nothing else uses -
// an Info.plist array and an Android manifest attribute - and `npx cap sync`
// rewrites parts of both. A landscape entry creeping back would show up as a
// rotated scorecard on somebody's phone and nowhere else, and iPad has its OWN
// list which is the one that is easy to forget: it carried FOUR orientations
// including upside-down.
//
// WHAT THIS DOES NOT CLAIM. It reads the configuration, not a device. Nothing
// here proves iOS honours it; that is Manny's rotation test on the build.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const PLIST = 'ios/App/App/Info.plist';
const MANIFEST = 'android/app/src/main/AndroidManifest.xml';

// The <array> under a given <key>, as a list of its <string> values.
function orientationsFor(key) {
    const s = read(PLIST);
    const at = s.indexOf('<key>' + key + '</key>');
    if (at === -1) return null;
    const open = s.indexOf('<array>', at);
    const close = s.indexOf('</array>', open);
    if (open === -1 || close === -1) return null;
    return [...s.slice(open, close).matchAll(/<string>([^<]+)<\/string>/g)].map((m) => m[1]);
}

describe('1. iOS IS PORTRAIT ON BOTH DEVICE FAMILIES', () => {

    test('the iPhone list is portrait and nothing else', () => {
        const got = orientationsFor('UISupportedInterfaceOrientations');
        assert.ok(got, 'UISupportedInterfaceOrientations is gone from Info.plist');
        assert.deepEqual(got, ['UIInterfaceOrientationPortrait'],
            'the iPhone orientation list is not portrait-only');
    });

    test('and so is the iPad list, which is the one that is easy to forget', () => {
        // It carried four, upside-down included, while the iPhone list carried
        // three - so a fix applied to one and not the other would look done.
        const got = orientationsFor('UISupportedInterfaceOrientations~ipad');
        assert.ok(got, 'UISupportedInterfaceOrientations~ipad is gone from Info.plist');
        assert.deepEqual(got, ['UIInterfaceOrientationPortrait'],
            'the iPad orientation list is not portrait-only');
    });

    test('the word Landscape appears nowhere in Info.plist', () => {
        // The belt: a new key with a landscape value in it would pass both
        // assertions above and still rotate.
        assert.doesNotMatch(read(PLIST), /Landscape/,
            'Info.plist still mentions Landscape somewhere');
    });
});

describe('2. ANDROID IS PORTRAIT TOO', () => {

    test('MainActivity is pinned to portrait', () => {
        const s = read(MANIFEST);
        const at = s.indexOf('android:name=".MainActivity"');
        assert.notEqual(at, -1, 'MainActivity is gone from the manifest');
        // The activity's own tag, from its name to the end of the opening tag.
        const tag = s.slice(s.lastIndexOf('<activity', at), s.indexOf('>', at) + 1);
        assert.ok(tag.length > 40, 'the activity tag did not slice - this test is guarding nothing');
        assert.match(tag, /android:screenOrientation="portrait"/,
            'MainActivity has no portrait lock: ' + tag.replace(/\s+/g, ' '));
    });

    test('and nothing in the manifest asks for landscape or sensor rotation', () => {
        assert.doesNotMatch(read(MANIFEST), /screenOrientation="(landscape|sensor|fullSensor|user|behind|sensorLandscape|reverseLandscape)"/,
            'something in the manifest still allows rotation');
    });
});
