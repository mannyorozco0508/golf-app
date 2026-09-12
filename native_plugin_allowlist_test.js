// ============================================================================
// THE iOS TARGET LINKS THE PLUGINS iOS WAS GIVEN, NOT THE ONES package.json HAS.
//
// WHAT HAPPENED. The Android wave added @capacitor/app to package.json for the
// hardware back button - a deliberate choice, committed in
// android/app/capacitor.build.gradle. Capacitor links every plugin in
// package.json to every platform on sync, so the next `npx cap sync ios`, run
// in an unrelated tree to keep the web bundle fresh, rewrote the TRACKED
// ios/App/CapApp-SPM/Package.swift to link CapacitorApp: two lines, one
// .package and one .product. It was noticed in `git status`, reverted by hand,
// and would otherwise have ridden into whichever commit came next, from
// whoever ran the sync, with nothing in the suite to say so.
//
// On iOS the plugin is inert for this app - its only caller is GolfBack in
// pwa-boot.js, whose backButton event never fires there and whose minimizeApp
// is `call.unimplemented()` - so nothing would have broken. That is what makes
// it the dangerous kind of drift: the iOS binary starts carrying code no iOS
// path needs, and no screen changes.
//
// THE FIX IS THE ALLOWLIST in capacitor.config.ts: ios.includePlugins names
// exactly the plugins iOS links, and Capacitor's CLI reads it ahead of the
// package.json scan (node_modules/@capacitor/cli/dist/plugin.js). Android is
// deliberately left on the default. This file holds the three places that
// must agree - the config, the file cap sync writes for iOS, and the file it
// writes for Android - against one declaration each.
//
// ============================================================================
// WHAT THIS FILE CANNOT PROVE - READ BEFORE TRUSTING IT
// ============================================================================
//
// IT READS THE FILE cap sync WRITES, NOT THE BINARY Xcode PRODUCES. Package.swift
// is the declaration; the archive is the fact. A Package.swift that names two
// plugins and an App binary that links three is possible if somebody edits the
// pbxproj or adds a package by hand in Xcode, and nothing here would see it.
//
// THE BY-HAND CHECK, for an archive - how build 24 was confirmed clean on
// 2026-09-11, so the next person measures rather than invents:
//
//   1. Find the archive:  ~/Library/Developer/Xcode/Archives/<date>/*.xcarchive
//      and read ApplicationProperties:CFBundleVersion from its Info.plist so
//      you know which build you are holding.
//   2. Plugins are STATICALLY LINKED into the App executable, not shipped as
//      frameworks - Frameworks/ holds only Capacitor.framework and
//      Cordova.framework. So run:
//          strings "<archive>/Products/Applications/App.app/App" \
//            | grep -c AppPlugin
//   3. RUN THE POSITIVE CONTROL FIRST. The same command with FilesystemPlugin
//      and SharePlugin must return non-zero (build 24: 8 and 2). If the
//      plugins you KNOW are linked are not visible, `strings` is not seeing
//      the plugin symbols and a zero for AppPlugin means nothing.
//   4. Only then does a zero for AppPlugin / CapacitorApp mean it is absent.
//      Build 24: AppPlugin 0, CapacitorApp 0, FilesystemPlugin 8, SharePlugin 2.
//
// Also not proven here: that includePlugins is honoured by the CLI version
// installed. That was measured once - after the allowlist landed, `npx cap
// sync ios` left Package.swift byte-identical and wrote a packageClassList
// of [FilesystemPlugin, SharePlugin] - and a CLI upgrade should be followed
// by the same measurement, not by trusting this suite.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

// ---------------------------------------------------------------------------
// THE DECLARATIONS. package.json id -> the SPM product name Capacitor writes.
// Adding a plugin to iOS means adding it HERE and to ios.includePlugins, and
// then letting cap sync write Package.swift; the three must then agree.
// ---------------------------------------------------------------------------
const IOS_PLUGINS = {
    '@capacitor/filesystem': 'CapacitorFilesystem',
    '@capacitor/share': 'CapacitorShare'
};
// Android links all three, on the default, on purpose. The gradle project
// name is what capacitor.build.gradle writes.
const ANDROID_PLUGINS = ['capacitor-app', 'capacitor-filesystem', 'capacitor-share'];
// Products every CapApp-SPM target carries regardless of plugins, and the
// Android twin: capacitor.settings.gradle includes ':capacitor-android' - the
// platform runtime - beside the plugins, and it is not one.
const CORE_PRODUCTS = ['Capacitor', 'Cordova'];
const CORE_ANDROID = ['capacitor-android'];

const SWIFT = 'ios/App/CapApp-SPM/Package.swift';
const GRADLE = 'android/app/capacitor.build.gradle';
const SETTINGS = 'android/capacitor.settings.gradle';
const CONFIG = 'capacitor.config.ts';

// ---------------------------------------------------------------------------
// PARSERS. Each returns what it found; the checks below decide. Kept as
// functions of a STRING so the negative control can feed them a fixture
// rather than a temp file.
// ---------------------------------------------------------------------------
function swiftPackages(src) {
    // .package(name: "CapacitorShare", path: "../../../node_modules/@capacitor/share")
    return [...src.matchAll(/\.package\(name:\s*"([^"]+)",\s*path:\s*"[^"]*node_modules\/([^"]+)"\)/g)]
        .map((m) => ({ product: m[1], id: m[2] }));
}
function swiftProducts(src) {
    // .product(name: "CapacitorShare", package: "CapacitorShare")
    return [...src.matchAll(/\.product\(name:\s*"([^"]+)",\s*package:\s*"[^"]+"\)/g)].map((m) => m[1]);
}
function gradleProjects(src) {
    return [...src.matchAll(/implementation project\(':([^']+)'\)/g)].map((m) => m[1]);
}
function settingsIncludes(src) {
    return [...src.matchAll(/^include ':([^']+)'/gm)].map((m) => m[1]);
}
function configIncludePlugins(src, platform) {
    const block = new RegExp(platform + ':\\s*\\{([\\s\\S]*?)\\n\\s*\\}').exec(src);
    if (!block) return null;
    const list = /includePlugins:\s*\[([^\]]*)\]/.exec(block[1]);
    if (!list) return null;
    return [...list[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}
function packageDeps() {
    const pkg = JSON.parse(read('package.json'));
    return Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {});
}

// The iOS check, as a function of the Package.swift source, so it can be run
// on the real file AND on the accident.
function iosViolations(src) {
    const out = [];
    const pkgs = swiftPackages(src);
    const products = swiftProducts(src).filter((p) => !CORE_PRODUCTS.includes(p));
    const want = Object.entries(IOS_PLUGINS).map(([id, product]) => ({ product, id }));
    // POSITIVE FIRST. An empty slice satisfies every "must not contain"
    // forever; the declared plugins being PRESENT is what proves the parser
    // read a real Package.swift.
    if (pkgs.length === 0) out.push('no .package(name:, path: node_modules/...) entries parsed - empty or unrecognised Package.swift');
    CORE_PRODUCTS.forEach((c) => {
        if (!swiftProducts(src).includes(c)) out.push(`core product ${c} missing - not a CapApp-SPM Package.swift`);
    });
    want.forEach((w) => {
        if (!pkgs.some((p) => p.product === w.product && p.id === w.id)) out.push(`declared iOS plugin ${w.product} (${w.id}) is not linked`);
        if (!products.includes(w.product)) out.push(`declared iOS plugin ${w.product} has no .product line`);
    });
    pkgs.forEach((p) => {
        if (!IOS_PLUGINS[p.id]) out.push(`${p.product} (${p.id}) is linked into iOS but not declared - a cap sync added it`);
    });
    products.forEach((p) => {
        if (!Object.values(IOS_PLUGINS).includes(p)) out.push(`product ${p} is in the iOS target but not declared`);
    });
    return out;
}

// THE MEASURED ACCIDENT, verbatim: what `npx cap sync ios` wrote on
// 2026-09-11 with @capacitor/app in package.json and no allowlist. The two
// added lines are marked. This is the fixture the negative control runs on.
const ACCIDENT = read(SWIFT)
    .replace(
        '        .package(name: "CapacitorFilesystem", path: "../../../node_modules/@capacitor/filesystem"),',
        '        .package(name: "CapacitorApp", path: "../../../node_modules/@capacitor/app"),\n'          // added
        + '        .package(name: "CapacitorFilesystem", path: "../../../node_modules/@capacitor/filesystem"),')
    .replace(
        '                .product(name: "CapacitorFilesystem", package: "CapacitorFilesystem"),',
        '                .product(name: "CapacitorApp", package: "CapacitorApp"),\n'                       // added
        + '                .product(name: "CapacitorFilesystem", package: "CapacitorFilesystem"),');

// ===========================================================================
describe('THE PARSERS READ REAL FILES', () => {

    test('Package.swift yields the declared plugins and both core products', () => {
        const src = read(SWIFT);
        assert.ok(swiftPackages(src).length >= 2, 'fewer than two .package entries parsed: ' + JSON.stringify(swiftPackages(src)));
        CORE_PRODUCTS.forEach((c) => assert.ok(swiftProducts(src).includes(c), c + ' must be a product of the target'));
    });

    test('the gradle files yield a plugin list', () => {
        assert.ok(gradleProjects(read(GRADLE)).length >= 1, 'no implementation project() lines parsed');
        assert.ok(settingsIncludes(read(SETTINGS)).length >= 1, 'no include lines parsed');
    });

    test('capacitor.config.ts yields an iOS includePlugins list', () => {
        const list = configIncludePlugins(read(CONFIG), 'ios');
        assert.ok(Array.isArray(list) && list.length >= 1, 'ios.includePlugins not found - the allowlist is gone and cap sync is back to linking everything');
    });

    test('the accident fixture differs from the real file in exactly the two added lines', () => {
        const real = read(SWIFT).split('\n');
        const acc = ACCIDENT.split('\n');
        assert.equal(acc.length, real.length + 2, 'the fixture must add two lines, no more');
        const added = acc.filter((l) => !real.includes(l));
        assert.deepEqual(added.map((l) => l.trim()), [
            '.package(name: "CapacitorApp", path: "../../../node_modules/@capacitor/app"),',
            '.product(name: "CapacitorApp", package: "CapacitorApp"),'
        ]);
    });
});

// ===========================================================================
describe('iOS LINKS EXACTLY THE DECLARED PLUGINS', () => {

    test('Package.swift agrees with IOS_PLUGINS, in both directions', () => {
        assert.deepEqual(iosViolations(read(SWIFT)), []);
    });

    test('an empty Package.swift is a failure, not a pass', () => {
        assert.ok(iosViolations('').length > 0, 'an empty slice must not satisfy the check');
    });

    test('NEGATIVE CONTROL: the measured accident - CapacitorApp added by cap sync - fails', () => {
        const v = iosViolations(ACCIDENT);
        assert.ok(v.some((s) => /CapacitorApp \(@capacitor\/app\) is linked into iOS but not declared/.test(s)),
            'the exact Package.swift cap sync wrote on 2026-09-11 must be caught: ' + JSON.stringify(v));
    });
});

// ===========================================================================
describe('THE ALLOWLIST NAMES EXACTLY THE PACKAGE IDS BEHIND IOS_PLUGINS', () => {

    test('ios.includePlugins == Object.keys(IOS_PLUGINS)', () => {
        const list = configIncludePlugins(read(CONFIG), 'ios');
        assert.deepEqual(list.slice().sort(), Object.keys(IOS_PLUGINS).sort(),
            'capacitor.config.ts ios.includePlugins and this file disagree about what iOS links - fix both, then run cap sync ios');
    });

    test('every allowlisted id is a real package.json dependency', () => {
        const deps = packageDeps();
        configIncludePlugins(read(CONFIG), 'ios').forEach((id) =>
            assert.ok(deps[id], `${id} is allowlisted for iOS but not in package.json - cap sync would ignore it`));
    });

    test('@capacitor/app is in package.json and deliberately NOT allowlisted for iOS', () => {
        // This is the whole reason the allowlist exists. If iOS is ever meant to
        // link it, that is a decision: add it to IOS_PLUGINS and to the config
        // together, and say why in the commit.
        assert.ok(packageDeps()['@capacitor/app'], '@capacitor/app left package.json - Android lost its back button, or this test is stale');
        assert.ok(!configIncludePlugins(read(CONFIG), 'ios').includes('@capacitor/app'));
        assert.ok(!IOS_PLUGINS['@capacitor/app']);
    });

    test('Android is on the default: no android.includePlugins, no global includePlugins', () => {
        const src = read(CONFIG);
        assert.equal(configIncludePlugins(src, 'android'), null, 'android.includePlugins was added - that side is deliberately on the default');
        // A top-level includePlugins would silently govern Android too.
        const topLevel = src.replace(/ios:\s*\{[\s\S]*?\n\s*\}/, '');
        assert.ok(!/includePlugins/.test(topLevel), 'a global includePlugins would apply to Android as well');
    });
});

// ===========================================================================
describe('ANDROID LINKS EXACTLY THE DECLARED PLUGINS', () => {

    test('capacitor.build.gradle agrees with ANDROID_PLUGINS', () => {
        assert.deepEqual(gradleProjects(read(GRADLE)).slice().sort(), ANDROID_PLUGINS.slice().sort());
    });

    test('capacitor.settings.gradle includes the same projects, plus the runtime', () => {
        const inc = settingsIncludes(read(SETTINGS));
        CORE_ANDROID.forEach((c) => assert.ok(inc.includes(c), c + ' must be included - not a Capacitor settings file'));
        assert.deepEqual(inc.filter((p) => !CORE_ANDROID.includes(p)).sort(), ANDROID_PLUGINS.slice().sort());
    });

    test('every Android plugin has its package.json twin', () => {
        const deps = packageDeps();
        ANDROID_PLUGINS.forEach((p) => {
            const id = '@' + p.replace('-', '/');
            assert.ok(deps[id], `${p} is linked on Android but ${id} is not in package.json`);
        });
    });

    test('Android really does link the plugin iOS refuses - the two sides are meant to differ', () => {
        // Without this, IOS_PLUGINS == ANDROID_PLUGINS would pass every check
        // above and the allowlist would be guarding nothing.
        assert.ok(ANDROID_PLUGINS.includes('capacitor-app'));
        assert.ok(!Object.values(IOS_PLUGINS).includes('CapacitorApp'));
    });
});
