// ============================================================================
// URGENT-066 #4 - VOICE SCORING, THE iOS SIDE (static checks; the Simulator build compiles it -
// see the 066-4 report): the local HardPanVoice plugin and the Siri App Intents are in the App
// target and registered, the two permission strings are in the GPS app's Info.plist (and nowhere in
// the Consumer app), speech is on the phone whenever the phone supports it, no new capability or
// entitlement is needed (App Intents, not SiriKit), and the intents reach the page only through the
// plugin and never save a score by themselves.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const IOS = path.join(ROOT, 'gps-beta/ios/App');
if (!fs.existsSync(path.join(IOS, 'PhoneBridge/HardPanVoicePlugin.swift'))) { console.log('Consumer tree: no voice scoring - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const read = (f) => fs.readFileSync(path.join(IOS, f), 'utf8');

test('the plugin and the intents are compiled into the App target, and the bridge registers the plugin', () => {
    const pbx = read('App.xcodeproj/project.pbxproj');
    const appSources = pbx.slice(pbx.indexOf('504EC3001FED79650016851F /* Sources */ = {'), pbx.indexOf('AA0220000000000000000010 /* Sources */ = {'));
    for (const f of ['HardPanVoicePlugin.swift in Sources', 'HardPanVoiceIntents.swift in Sources']) {
        assert.ok(appSources.includes(f), f + ' in the App target');
        assert.equal(pbx.split(f).length - 1, 2, f + ': one build file, used once');
    }
    assert.match(read('PhoneBridge/HardPanBridgeViewController.swift'), /registerPluginInstance\(HardPanVoicePlugin\(\)\)/);
    const plug = read('PhoneBridge/HardPanVoicePlugin.swift');
    assert.match(plug, /jsName = "HardPanVoice"/);
    for (const m of ['available', 'requestPermission', 'start', 'stop', 'cancel', 'intentReply', 'held', 'clearHeld'])
        assert.match(plug, new RegExp('CAPPluginMethod\\(name: "' + m + '"'), m);
    // no new package: nothing added to package.json or the SPM package for voice
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'), /speech|voice/i);
    assert.doesNotMatch(read('CapApp-SPM/Package.swift'), /Speech|Voice/);
});

test('the permission strings: microphone + speech, plain words, in the GPS app only', () => {
    const plist = read('App/Info.plist');
    const mic = /<key>NSMicrophoneUsageDescription<\/key>\s*<string>([^<]+)<\/string>/.exec(plist);
    const sp = /<key>NSSpeechRecognitionUsageDescription<\/key>\s*<string>([^<]+)<\/string>/.exec(plist);
    assert.ok(mic && sp, 'both strings');
    assert.match(mic[1], /only while you hold or tap the voice button/);
    assert.match(mic[1], /Nothing is recorded or kept/);
    assert.match(sp[1], /on your iPhone when your iPhone supports it/);
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'ios/App/App/Info.plist'), 'utf8'), /NSMicrophone|NSSpeech/, 'the Consumer app asks for neither');
});

test('speech recognition: on the phone whenever it can be; the microphone only between start and stop; nothing kept', () => {
    const plug = read('PhoneBridge/HardPanVoicePlugin.swift');
    assert.match(plug, /supportsOnDeviceRecognition/);
    assert.match(plug, /requiresOnDeviceRecognition = true/);
    assert.match(plug, /SFSpeechAudioBufferRecognitionRequest/);
    assert.match(plug, /\.allowBluetooth/, 'AirPods’ microphone');
    assert.match(plug, /engine\.stop\(\)/); assert.match(plug, /removeTap\(onBus: 0\)/); assert.match(plug, /setActive\(false/);
    assert.match(plug, /withTimeInterval: 10/, 'never listens more than 10 s');
    assert.doesNotMatch(plug, /AVAudioRecorder|AVAudioFile|write\(to|FileManager|URLSession/);
});

test('Siri: App Intents (iOS 16+), the score through the page, an honest answer when the page is asleep - no SiriKit entitlement', () => {
    const it = read('PhoneBridge/HardPanVoiceIntents.swift');
    assert.match(it, /import AppIntents/);
    assert.match(it, /@available\(iOS 16\.0, \*\)\s*struct HardPanScoreIntent: AppIntent/);
    assert.match(it, /@available\(iOS 16\.0, \*\)\s*struct HardPanYardageIntent: AppIntent/);
    assert.match(it, /struct HardPanShortcuts: AppShortcutsProvider/);
    assert.match(it, /\\\(\.applicationName\)/);
    assert.match(it, /VoiceIntentRelay\.shared\.ask\(kind: "score"/);
    assert.match(it, /paused while the phone is locked or HardPan is in the background/);
    assert.match(it, /VoiceIntentRelay\.shared\.hold\(words: words\)/);
    assert.doesNotMatch(it, /saveScore|scores\/|Firebase|Database/, 'Siri never saves a score itself');
    for (const f of ['App/App.entitlements', 'App/AppRelease.entitlements']) assert.doesNotMatch(read(f), /siri/i, f + ': App Intents need no Siri entitlement');
    assert.doesNotMatch(read('App/Info.plist'), /NSSiriUsageDescription/, 'no SiriKit permission prompt');
    const plug = read('PhoneBridge/HardPanVoicePlugin.swift');
    assert.match(plug, /hasListeners\("voiceIntent"\)/);
    assert.match(plug, /asyncAfter\(deadline: \.now\(\) \+ timeout\)/, 'a page that never answers times out');
    assert.match(plug, /2 \* 3600 \* 1000/, 'held words expire after 2 hours');
});

test('the Lock Screen numbers for Siri: numbers only, cleared when the activity ends', () => {
    const la = read('PhoneBridge/HardPanLiveActivityPlugin.swift');
    assert.match(la, /static var snapshot: \[String: Any\] = \[:\]/);
    assert.match(la, /HardPanLiveActivityPlugin\.snapshot = \[:\]/);
    // state holds hole / par / front / mid / back / unit / playsDelta / fromTee / thru / money - the green's points live in `green`, never in the snapshot
    assert.match(la, /var s = state; s\["round"\] = roundCode/);
});
