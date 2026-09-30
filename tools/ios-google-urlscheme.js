#!/usr/bin/env node
// ============================================================================
// PUT THE GOOGLE URL SCHEME IN Info.plist, FROM GoogleService-Info.plist
//
// WHY THIS IS A SCRIPT AND NOT A TYPED-IN VALUE. Google Sign-In on iOS comes back
// through a custom URL scheme, and the scheme IS the REVERSED_CLIENT_ID out of
// GoogleService-Info.plist. Both files are committed (see the note in
// ios/.gitignore for why the config file is not a secret), but the two have to
// AGREE, and typing a reversed client id by hand into Info.plist is a
// one-character-wrong-and-sign-in-silently-fails job. So it is copied, not typed.
//
// Drop GoogleService-Info.plist into ios/App/App/ and run this. It reads the
// REVERSED_CLIENT_ID, writes it into Info.plist as a CFBundleURLTypes entry, and
// does nothing if it is already there. Idempotent, so running it twice is safe and
// so is running it after every `npx cap sync ios`.
//
//   node tools/ios-google-urlscheme.js
//     exit 0  written, or already present
//     exit 1  GoogleService-Info.plist missing, or no REVERSED_CLIENT_ID in it
//             NOTHING was written - this is not a pass
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

// --root <dir> points the two paths at a fixture tree instead of the repo, so
// oauth_native_test.js can drive BOTH arms - missing plist and present plist -
// without needing the real file to be absent or present. Nothing else uses it.
const rootArg = process.argv.indexOf('--root');
const REPO = rootArg > -1 && process.argv[rootArg + 1]
    ? path.resolve(process.argv[rootArg + 1])
    : path.join(__dirname, '..');
const GS = path.join(REPO, 'ios/App/App/GoogleService-Info.plist');
const INFO = path.join(REPO, 'ios/App/App/Info.plist');

function bail(msg) {
    console.error('ios-google-urlscheme: ' + msg);
    console.error('NOTHING was written.');
    process.exit(1);
}

if (!fs.existsSync(GS)) {
    bail('ios/App/App/GoogleService-Info.plist is not there.\n'
        + '  Firebase console -> Project settings -> your iOS app (com.rattlegolf.app)\n'
        + '  -> GoogleService-Info.plist -> Download, then drag it into ios/App/App/ in\n'
        + '  Xcode with "Copy items if needed" ticked and the App target checked.');
}
const gs = fs.readFileSync(GS, 'utf8');
const m = /<key>REVERSED_CLIENT_ID<\/key>\s*<string>([^<]+)<\/string>/.exec(gs);
if (!m) bail('GoogleService-Info.plist has no REVERSED_CLIENT_ID. That key only exists\n'
    + '  once Google sign-in is enabled for the iOS app - re-download the file.');
const scheme = m[1].trim();
if (!/^com\.googleusercontent\.apps\./.test(scheme)) {
    bail('REVERSED_CLIENT_ID does not look like one: ' + scheme);
}

if (!fs.existsSync(INFO)) bail('ios/App/App/Info.plist is not there.');
let info = fs.readFileSync(INFO, 'utf8');
if (info.indexOf(scheme) > -1) {
    console.log('already there: ' + scheme);
    process.exit(0);
}

const BLOCK = '\t<key>CFBundleURLTypes</key>\n'
    + '\t<array>\n'
    + '\t\t<dict>\n'
    + '\t\t\t<key>CFBundleURLSchemes</key>\n'
    + '\t\t\t<array>\n'
    + '\t\t\t\t<string>' + scheme + '</string>\n'
    + '\t\t\t</array>\n'
    + '\t\t</dict>\n'
    + '\t</array>\n';

if (/<key>CFBundleURLTypes<\/key>/.test(info)) {
    // An existing array: add one scheme to the FIRST dict rather than a second
    // CFBundleURLTypes key, which iOS would ignore.
    info = info.replace(/(<key>CFBundleURLTypes<\/key>\s*<array>\s*<dict>[\s\S]*?<key>CFBundleURLSchemes<\/key>\s*<array>)/,
        '$1\n\t\t\t\t<string>' + scheme + '</string>');
} else {
    const at = info.lastIndexOf('</dict>');
    if (at < 0) bail('Info.plist has no closing </dict>.');
    info = info.slice(0, at) + BLOCK + info.slice(at);
}
fs.writeFileSync(INFO, info);
console.log('wrote the Google URL scheme into Info.plist: ' + scheme);
