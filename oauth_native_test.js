// ============================================================================
// THE NATIVE HALF OF ONE-TAP SIGN-IN: WHAT THE iOS SHELL ACTUALLY LINKS AND CALLS
//
// oauth_signin_test.js owns the DECISION TABLE - link vs sign in, and the notes.
// This file owns the WIRING, which is the half that cannot be seen from the web
// preview: in the Capacitor shell a popup has no window to open, so Continue with
// Apple and Continue with Google go through @capacitor-firebase/authentication and
// the native Apple and Google SDKs instead.
//
// FOUR THINGS HAVE TO AGREE, and each of them has already been wrong once in this
// repo or in the plugin's own defaults:
//
//   1. THE PLUGIN REACHES iOS AND NOT ANDROID. iOS links by an explicit allowlist
//      (capacitor.config.ts ios.includePlugins). Android was on the Capacitor
//      default until this wave, and the default would have written
//      capacitor-firebase-authentication into capacitor.build.gradle on the next
//      sync - a plugin whose Android half needs google-services.json and the
//      com.google.gms.google-services gradle plugin, neither of which this repo
//      has. So Android gained an allowlist naming the three it already had.
//      native_plugin_allowlist_test.js holds the three-way agreement; the tests
//      here assert the OAuth-specific side of it: iOS yes, Android no.
//
//   2. THE SEAM CALLS METHODS THE INSTALLED PLUGIN HAS. nativeCredential() in
//      oauth-signin.js was written from the README before the package was
//      installed. The tests below read node_modules/@capacitor-firebase/
//      authentication/dist/esm/definitions.d.ts and hold the method names and the
//      AuthCredential field names against what the seam actually reads, so a
//      plugin upgrade that renames one fails here rather than on a device.
//
//   3. skipNativeAuth IS TRUE IN BOTH PLACES, and that is the whole uid guarantee.
//      With native persistence on, the native SDK creates its own signed-in user
//      and the anonymous organizer is gone - taking the rounds already set up on
//      this device, the free trial and a founder pass with it. The config sets it
//      and every call passes it (SignInOptions.skipNativeAuth, since plugin 1.1.0,
//      overrides the config value).
//
//   4. GOOGLE'S CALLBACK CAN GET BACK IN. Google Sign-In returns through a custom
//      URL scheme that IS the REVERSED_CLIENT_ID from GoogleService-Info.plist, so
//      Info.plist has to carry it and the scene has to forward the open-URL event.
//      SceneDelegate.swift already forwards openURLContexts to
//      SceneDelegateProxy.shared - the Capacitor 8 scene equivalent of the
//      AppDelegate snippet the plugin README shows - and this file pins that.
//
// WHY GoogleService-Info.plist IS COMMITTED, IN A PUBLIC REPO, DELIBERATELY.
// Nothing in it is a secret: Firebase documents these values as public, every copy
// of the App Store binary carries the file inside it, and this repo already
// publishes the SAME project's apiKey, projectId and databaseURL in index.html.
// What protects the project is the RTDB rules published on 2026-09-29 and the
// providers' own allowlists, never the obscurity of a config file. Ignoring it
// would buy nothing and cost the thing that actually hurts - a tree that either
// fails the build outright (it is a Resources build input) or, with the reference
// dropped, produces a binary where FirebaseApp.configure() is skipped
// (FirebaseAuthentication.swift:30 logs "Firebase was not configured" and returns)
// and Continue with Google is dead, found by a user after review. So the test below
// asserts no ignore rule ever starts matching it, with a positive control so the
// checker cannot be silently inert.
//
// MEASURED IN A REAL BUILD, not inferred from the trait declaration. Debug
// simulator build of ios/App at 2026-09-30, `xcodebuild ... build` = BUILD
// SUCCEEDED, then App.app/App.debug.dylib:
//     FirebaseAuthenticationPlugin 152   FilesystemPlugin 24   SharePlugin 6
//     GIDSignIn 34   GoogleSignIn 8          <- positive controls, all non-zero
//     FBSDK 0   FacebookCore 0   AppPlugin 0 <- and no facebook .o or .bundle
//                                                anywhere in Build/Products
// Facebook IS fetched into DerivedData/SourcePackages (the plugin declares the
// dependency unconditionally) and is never compiled or linked, because the Facebook
// trait is off. Fetched is not linked; the dylib is the fact.
//
// WHAT THIS FILE CANNOT PROVE. It cannot sign anybody in. Nothing here reaches
// Apple or Google, and a green run says the wiring is declared, not that a tap
// works - only Cmd+R on the device says that. It also reads Info.plist and the
// pbxproj rather than the built .app; the by-hand archive check in
// native_plugin_allowlist_test.js is the counterpart for that, and the dylib
// numbers above are how it was done for this plugin.
//
// THE BASELINE, all 35 tests, measured against 254b3c8 in a clean worktree with
// node_modules symlinked in - the commit where oauth-signin.js and its popup path
// exist and NO native wiring does (the plugin is not a dependency there, no
// allowlist entry, no traits, no URL-scheme tool, and the failure path still
// swallows its error code):
//
//     17 PASS / 18 FAIL
//
// The 18 reds: the plugin is not a dependency (1), the iOS/Android allowlists (1),
// the Google trait in Package.swift (1) and in the config (1), skipNativeAuth in
// both places (1), the ios/.gitignore note (1), the URL-scheme tool existing (1)
// and its four behaviours (4), the Sign in with Apple entitlement (1), and the six
// in the last block - the unmapped code on screen, the two native-only messages,
// adoptCredential, the adopt using the error's credential, the rethrow-and-log, and
// the log carrying no token.
//
// The 17 greens are honest but earn less: the six behavioural nativeCredential
// tests pass because that function was already written at 254b3c8 against the
// README, the three definitions.d.ts tests pass because the symlinked node_modules
// is today's plugin either way, three of the diagnosis tests were already true (see
// that block), and five are things 254b3c8 genuinely already had right - the
// Android gradle has no firebase project, the scene forwards openURLContexts,
// nothing ignored the plist, Info.plist carried no stale scheme, and the pbxproj
// and entitlements agreed. Those last five would each go red on the change they
// name.
//
// ONE TEST IS EXPECTED RED UNTIL MANNY FINISHES THE XCODE STEP:
// "Sign in with Apple is on the App target". Adding the capability in Xcode writes
// ios/App/App/App.entitlements and points the pbxproj at it; until those are
// committed, native Apple sign-in cannot work, and a guard that went green anyway
// would be hiding the one step a device build depends on.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
// A vm sandbox is another realm: deepStrictEqual on an object built in there
// fails "same structure, not reference-equal". Compare the JSON, not the object.
const plain = v => JSON.parse(JSON.stringify(v));
const has = f => fs.existsSync(path.join(REPO_ROOT, f));

const PLUGIN_ID = '@capacitor-firebase/authentication';
const DEFS = 'node_modules/@capacitor-firebase/authentication/dist/esm/definitions.d.ts';
const CONFIG = 'capacitor.config.ts';
const SWIFT = 'ios/App/CapApp-SPM/Package.swift';
const GRADLE = 'android/app/capacitor.build.gradle';
const SEAM = 'oauth-signin.js';
const INFO = 'ios/App/App/Info.plist';
const GS = 'ios/App/App/GoogleService-Info.plist';
const SCENE = 'ios/App/App/SceneDelegate.swift';
const PBX = 'ios/App/App.xcodeproj/project.pbxproj';
const TOOL = 'tools/ios-google-urlscheme.js';

// ===========================================================================
describe('THE PLUGIN REACHES iOS AND DELIBERATELY NOT ANDROID', () => {

    test('it is a real dependency, not a README reference', () => {
        const pkg = JSON.parse(read('package.json'));
        assert.ok((pkg.dependencies || {})[PLUGIN_ID],
            PLUGIN_ID + ' is not in package.json dependencies - the seam would fall back to the popup on iOS forever');
        assert.ok(has(DEFS), DEFS + ' is missing - npm install has not run, so nothing below is measuring the installed plugin');
    });

    test('iOS allowlists it; Android allowlists the three it already had and not this one', () => {
        const src = read(CONFIG);
        const list = p => {
            const block = new RegExp(p + ':\\s*\\{([\\s\\S]*?)\\n\\s*\\}').exec(src);
            const inner = block && /includePlugins:\s*\[([^\]]*)\]/.exec(block[1]);
            return inner ? [...inner[1].matchAll(/'([^']+)'/g)].map(m => m[1]) : null;
        };
        const ios = list('ios');
        const android = list('android');
        assert.ok(ios && ios.includes(PLUGIN_ID), 'ios.includePlugins must name ' + PLUGIN_ID);
        assert.ok(android, 'android.includePlugins is missing - Android is back on the default, and the next cap sync android links a plugin whose Android half needs google-services.json');
        assert.deepEqual(android.slice().sort(), ['@capacitor/app', '@capacitor/filesystem', '@capacitor/share'],
            'the Android list must stay the three that were already linked');
        assert.ok(!android.includes(PLUGIN_ID), 'Android must not link the auth plugin until it has google-services.json and the gradle plugin');
    });

    test('the gradle cap sync wrote agrees: no firebase authentication project on Android', () => {
        const g = read(GRADLE);
        assert.ok(/implementation project\(':capacitor-share'\)/.test(g),
            'no capacitor-share project line - this is not the generated gradle, so the negative below proves nothing');
        assert.ok(!/firebase/i.test(g),
            'capacitor.build.gradle links a firebase project - run npx cap sync android and check the allowlist');
    });

    test('Package.swift links it with the Google trait and nothing enables Facebook', () => {
        const s = read(SWIFT);
        const line = /\.package\(name:\s*"CapacitorFirebaseAuthentication"[^\n]*/.exec(s);
        assert.ok(line, 'CapacitorFirebaseAuthentication is not in Package.swift - run npx cap sync ios');
        assert.ok(/traits:\s*\[\s*"Google"\s*\]/.test(line[0]),
            'the plugin must be linked with traits: ["Google"] - the plugin default enables Google AND Facebook: ' + line[0]);
        assert.ok(!/Facebook/i.test(s), 'Facebook must not appear in Package.swift');
        assert.ok(/swift-tools-version:\s*6\.1/.test(s),
            'traits need swift-tools-version 6.1 - set experimental.ios.spm.swiftToolsVersion');
    });

    test('the config asks for exactly the Google trait', () => {
        const src = read(CONFIG);
        const traits = /packageTraits:\s*\{([\s\S]*?)\}/.exec(src);
        assert.ok(traits, 'experimental.ios.spm.packageTraits is gone - cap sync goes back to the plugin defaults, which include Facebook');
        assert.ok(new RegExp("'" + PLUGIN_ID + "':\\s*\\['Google'\\]").test(traits[1]),
            "packageTraits must be { '" + PLUGIN_ID + "': ['Google'] }: " + traits[1]);
    });
});

// ===========================================================================
describe('THE SEAM CALLS METHODS THE INSTALLED PLUGIN HAS', () => {

    test('signInWithApple and signInWithGoogle are on the plugin interface', () => {
        const d = read(DEFS);
        ['signInWithApple(', 'signInWithGoogle('].forEach(m =>
            assert.ok(d.includes(m), m + ' is not in the installed plugin definitions'));
        const seam = read(SEAM);
        assert.ok(/plugin\.signInWithGoogle/.test(seam) && /plugin\.signInWithApple/.test(seam),
            'the seam must call the two methods by those names');
    });

    test('AuthCredential declares the three fields the seam reads', () => {
        const d = read(DEFS);
        const block = /export interface AuthCredential \{([\s\S]*?)\n\}/.exec(d);
        assert.ok(block, 'AuthCredential is not in the installed definitions');
        ['idToken?: string;', 'accessToken?: string;', 'nonce?: string;'].forEach(f =>
            assert.ok(block[1].includes(f), 'AuthCredential no longer declares ' + f + ' - nativeCredential reads it'));
    });

    test('skipNativeAuth is a per-call option that overrides the config, in this version', () => {
        const d = read(DEFS);
        const opts = /export interface SignInOptions \{([\s\S]*?)\n\}/.exec(d);
        assert.ok(opts && /skipNativeAuth\?: boolean;/.test(opts[1]),
            'SignInOptions no longer carries skipNativeAuth - the per-call override in the seam is a no-op');
        assert.ok(/interface SignInWithOAuthOptions extends SignInOptions/.test(d),
            'SignInWithOAuthOptions must extend SignInOptions, or signInWithApple cannot take skipNativeAuth');
        assert.ok(/interface SignInWithGoogleOptions extends SignInWith(OAuth)?Options/.test(d),
            'SignInWithGoogleOptions must inherit the option too');
    });

    test('skipNativeAuth: true in the config AND on every call', () => {
        const cfg = read(CONFIG);
        const block = /FirebaseAuthentication:\s*\{([\s\S]*?)\n\s{4}\}/.exec(cfg);
        assert.ok(block, 'plugins.FirebaseAuthentication is not configured');
        assert.ok(/skipNativeAuth:\s*true/.test(block[1]),
            'skipNativeAuth must be true, or the native SDK signs in on its own and the anonymous uid - rounds, trial, founder pass - is gone');
        assert.ok(/providers:\s*\[\s*'apple\.com',\s*'google\.com'\s*\]/.test(block[1]),
            'providers must be exactly apple.com and google.com: ' + block[1]);
        const seam = read(SEAM);
        const calls = seam.match(/skipNativeAuth:\s*true/g) || [];
        assert.ok(calls.length >= 1, 'the seam must pass skipNativeAuth: true itself, not rely on the config');
    });
});

// ===========================================================================
// BEHAVIOURAL. A fake plugin and a fake firebase, so what nativeCredential
// BUILDS is the assertion rather than the shape of its source.
// ===========================================================================
describe('nativeCredential BUILDS THE RIGHT CREDENTIAL, OR NOTHING', () => {

    function seamWith(plugin, opts) {
        const o = opts || {};
        const sandbox = loadJsFile(SEAM);
        const made = [];
        sandbox.firebase = {
            auth: {
                GoogleAuthProvider: {
                    credential: (idToken, accessToken) => {
                        made.push({ kind: 'google', idToken, accessToken });
                        return { kind: 'google', idToken, accessToken };
                    }
                },
                OAuthProvider: function (id) {
                    this.credential = (arg) => {
                        made.push({ kind: 'oauth', id, arg });
                        return { kind: 'oauth', id, arg };
                    };
                }
            }
        };
        sandbox.window.Capacitor = plugin ? { Plugins: { FirebaseAuthentication: plugin } } : undefined;
        if (o.brokenCapacitor) {
            Object.defineProperty(sandbox.window, 'Capacitor', { get() { throw new Error('boom'); } });
        }
        return { o: sandbox.oauthSignin, made };
    }

    test('Google: idToken and accessToken go to GoogleAuthProvider.credential', async () => {
        const seen = [];
        const { o, made } = seamWith({
            signInWithGoogle: (opts) => { seen.push(opts); return Promise.resolve({ credential: { idToken: 'gid', accessToken: 'gacc', providerId: 'google.com' } }); },
            signInWithApple: () => Promise.resolve({})
        });
        const cred = await o.nativeCredential('google');
        assert.deepEqual(plain(made), [{ kind: 'google', idToken: 'gid', accessToken: 'gacc' }]);
        assert.equal(cred.kind, 'google');
        assert.deepEqual(plain(seen), [{ skipNativeAuth: true }],
            'the call must pass skipNativeAuth: true, or the native SDK takes the session and the anonymous uid is lost');
    });

    test('Apple: idToken and the RAW nonce go to OAuthProvider(apple.com).credential', async () => {
        const seen = [];
        const { o, made } = seamWith({
            signInWithGoogle: () => Promise.resolve({}),
            signInWithApple: (opts) => { seen.push(opts); return Promise.resolve({ credential: { idToken: 'aid', nonce: 'raw-nonce', providerId: 'apple.com' } }); }
        });
        const cred = await o.nativeCredential('apple');
        assert.equal(made.length, 1);
        assert.equal(made[0].kind, 'oauth');
        assert.equal(made[0].id, 'apple.com');
        assert.equal(made[0].arg.idToken, 'aid');
        assert.equal(made[0].arg.rawNonce, 'raw-nonce',
            'Apple rejects the credential unless the raw nonce is passed back beside the id token');
        assert.equal(cred.kind, 'oauth');
        assert.deepEqual(plain(seen), [{ skipNativeAuth: true }]);
    });

    test('no idToken is nothing, not a broken credential', async () => {
        const { o, made } = seamWith({
            signInWithGoogle: () => Promise.resolve({ credential: { accessToken: 'only-this' } }),
            signInWithApple: () => Promise.resolve({})
        });
        assert.equal(await o.nativeCredential('google'), null);
        assert.deepEqual(plain(made), [], 'nothing may be built from a credential with no id token');
    });

    test('no plugin at all is null, synchronously - that is the web path', () => {
        const { o } = seamWith(null);
        assert.equal(o.nativeCredential('google'), null);
        assert.equal(o.nativeCredential('apple'), null);
    });

    test('a plugin missing the method is null, not a TypeError', () => {
        const { o } = seamWith({ signInWithGoogle: 'not a function' });
        assert.equal(o.nativeCredential('google'), null);
        assert.equal(o.nativeCredential('apple'), null);
    });

    test('a throwing Capacitor global is null, not an exception through signIn', () => {
        const { o } = seamWith(null, { brokenCapacitor: true });
        assert.equal(o.nativeCredential('google'), null);
    });
});

// ===========================================================================
describe('GoogleService-Info.plist IS COMMITTED, AND Info.plist AGREES WITH IT', () => {

    const ignored = (rel) => {
        const r = spawnSync('git', ['check-ignore', '-q', rel], { cwd: REPO_ROOT });
        return r.status === 0;
    };

    test('no ignore rule matches it - and the checker is live', () => {
        // POSITIVE CONTROL FIRST. ios/.gitignore really does ignore the generated
        // capacitor.config.json; if that comes back "not ignored", check-ignore is
        // not working and the assertion below would pass on any file.
        assert.equal(ignored('ios/App/App/capacitor.config.json'), true,
            'git check-ignore did not report the generated capacitor.config.json as ignored - the checker is not working, so the next assertion proves nothing');
        assert.equal(ignored('ios/App/App/GoogleService-Info.plist'), false,
            'something now ignores GoogleService-Info.plist. It is committed on purpose - nothing in it is secret, it ships inside every binary, and a tree without it either fails the build or ships with Firebase unconfigured. See the note in ios/.gitignore.');
    });

    test('the decision is written down where the next person edits', () => {
        const gi = read('ios/.gitignore');
        assert.ok(/GoogleService-Info\.plist IS DELIBERATELY NOT IGNORED/.test(gi),
            'ios/.gitignore must carry the note saying why the file is committed - otherwise the next person adds the line back');
    });

    test('Info.plist carries the REVERSED_CLIENT_ID when the plist is there, and no stale one when it is not', () => {
        const info = read(INFO);
        const schemes = [...info.matchAll(/<string>(com\.googleusercontent\.apps\.[^<]+)<\/string>/g)].map(m => m[1]);
        if (!has(GS)) {
            // BOTH ARMS ASSERT. Absent plist: Info.plist must not carry a scheme
            // nobody can check, which is how a wrong or retired client id survives.
            assert.deepEqual(schemes, [],
                'Info.plist carries a Google URL scheme but GoogleService-Info.plist is not in the tree - nothing can check it. Add the plist, or take the scheme out.');
            assert.ok(/<key>CFBundleIdentifier<\/key>/.test(info), 'not an Info.plist - the check above proves nothing');
            return;
        }
        const want = /<key>REVERSED_CLIENT_ID<\/key>\s*<string>([^<]+)<\/string>/.exec(read(GS));
        assert.ok(want, 'GoogleService-Info.plist has no REVERSED_CLIENT_ID - Google sign-in is not enabled for the iOS app, so re-download it');
        assert.ok(schemes.includes(want[1].trim()),
            'Info.plist does not carry the REVERSED_CLIENT_ID from GoogleService-Info.plist - run node ' + TOOL + '. Google sign-in returns through that URL scheme and fails silently without it. Found: ' + JSON.stringify(schemes));
    });
});

// ===========================================================================
// THE TOOL, DRIVEN BOTH WAYS on a fixture tree, so the arms do not depend on
// whether the real plist happens to be in the working copy.
// ===========================================================================
describe('tools/ios-google-urlscheme.js COPIES THE SCHEME, LOUDLY OR NOT AT ALL', () => {

    const SCHEME = 'com.googleusercontent.apps.123456789012-abcdefghijklmnop';
    const PLAIN_INFO = '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n\t<key>CFBundleIdentifier</key>\n\t<string>com.rattlegolf.app</string>\n</dict>\n</plist>\n';

    function fixture(withPlist, info) {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsi-'));
        fs.mkdirSync(path.join(root, 'ios/App/App'), { recursive: true });
        fs.writeFileSync(path.join(root, INFO), info === undefined ? PLAIN_INFO : info);
        if (withPlist) {
            fs.writeFileSync(path.join(root, GS),
                '<plist><dict>\n<key>CLIENT_ID</key><string>123456789012-abcdefghijklmnop.apps.googleusercontent.com</string>\n'
                + '<key>REVERSED_CLIENT_ID</key><string>' + SCHEME + '</string>\n</dict></plist>\n');
        }
        return root;
    }
    function run(root) {
        const r = spawnSync('node', [path.join(REPO_ROOT, TOOL), '--root', root], { encoding: 'utf8' });
        return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), info: fs.readFileSync(path.join(root, INFO), 'utf8') };
    }

    test('it is there and it is a node script', () => {
        assert.ok(has(TOOL), TOOL + ' is missing - the scheme would have to be typed in by hand');
        assert.ok(/REVERSED_CLIENT_ID/.test(read(TOOL)));
    });

    test('no plist: exit 1, the download and drag instructions, and NOTHING written', () => {
        const root = fixture(false);
        const r = run(root);
        assert.equal(r.code, 1, 'a missing plist must fail, not quietly succeed');
        assert.ok(/Firebase console/.test(r.out) && /Copy items if needed/.test(r.out),
            'the failure must say where to download it and where to drag it: ' + r.out);
        assert.equal(r.info, PLAIN_INFO, 'Info.plist must be untouched when the plist is missing');
    });

    test('plist present: the scheme lands in a CFBundleURLTypes entry', () => {
        const root = fixture(true);
        const r = run(root);
        assert.equal(r.code, 0, r.out);
        assert.ok(/<key>CFBundleURLTypes<\/key>/.test(r.info), 'no CFBundleURLTypes written: ' + r.info);
        assert.ok(new RegExp('<key>CFBundleURLSchemes</key>\\s*<array>\\s*<string>' + SCHEME.replace(/\./g, '\\.') + '</string>').test(r.info),
            'the scheme is not inside CFBundleURLSchemes: ' + r.info);
        assert.ok(/<\/dict>\s*<\/plist>/.test(r.info), 'the plist must still close properly: ' + r.info);
    });

    test('running it twice changes nothing and says so', () => {
        const root = fixture(true);
        const first = run(root);
        const second = run(root);
        assert.equal(second.code, 0);
        assert.equal(second.info, first.info, 'the second run must be a no-op - it runs after every cap sync ios');
        assert.ok(/already there/.test(second.out), 'the second run should say it is already there: ' + second.out);
        assert.equal((first.info.match(/CFBundleURLTypes/g) || []).length, 1, 'exactly one CFBundleURLTypes key');
    });

    test('an existing CFBundleURLTypes array gains a scheme rather than a second key', () => {
        const withOne = PLAIN_INFO.replace('</dict>\n</plist>',
            '\t<key>CFBundleURLTypes</key>\n\t<array>\n\t\t<dict>\n\t\t\t<key>CFBundleURLSchemes</key>\n\t\t\t<array>\n\t\t\t\t<string>hardpan</string>\n\t\t\t</array>\n\t\t</dict>\n\t</array>\n</dict>\n</plist>');
        const root = fixture(true, withOne);
        const r = run(root);
        assert.equal(r.code, 0, r.out);
        assert.equal((r.info.match(/CFBundleURLTypes/g) || []).length, 1,
            'iOS reads only the first CFBundleURLTypes - a second key would lose one of the schemes');
        assert.ok(/<string>hardpan<\/string>/.test(r.info), 'the existing scheme must survive');
        assert.ok(r.info.includes(SCHEME), 'the Google scheme must be added');
    });
});

// ===========================================================================
describe('THE CALLBACK AND THE CAPABILITY', () => {

    test('the scene forwards openURLContexts, which is how the Google callback gets in', () => {
        const s = read(SCENE);
        assert.ok(/func scene\(_ scene: UIScene, openURLContexts/.test(s),
            'SceneDelegate no longer handles openURLContexts - Google sign-in would open Safari and never come back');
        assert.ok(/SceneDelegateProxy\.shared\.scene\(scene, openURLContexts:/.test(s),
            'the event must be forwarded to SceneDelegateProxy.shared, which is where Capacitor 8 dispatches it to plugins');
        assert.ok(/CAPBridgeViewController/.test(s), 'not the app SceneDelegate - the checks above prove nothing');
    });

    test('Sign in with Apple is on the App target', () => {
        // EXPECTED RED until the Xcode step is done and committed: ticking
        // "Sign in with Apple" under Signing & Capabilities writes
        // ios/App/App/App.entitlements and points the pbxproj at it. Without the
        // entitlement the native Apple call fails on the device, and a guard that
        // passed anyway would be hiding the one step a device build depends on.
        const candidates = ['ios/App/App/App.entitlements', 'ios/App/App.entitlements'];
        const found = candidates.filter(has);
        assert.ok(found.length > 0,
            'no entitlements file. In Xcode: App target -> Signing & Capabilities -> + Capability -> Sign in with Apple, then commit ios/App/App/App.entitlements and the pbxproj.');
        const ent = read(found[0]);
        assert.ok(/com\.apple\.developer\.applesignin/.test(ent),
            found[0] + ' has no com.apple.developer.applesignin key');
        assert.ok(/CODE_SIGN_ENTITLEMENTS/.test(read(PBX)),
            'the entitlements file exists but the pbxproj does not reference it - Xcode would build without it');
    });

    test('the pbxproj and the entitlements file agree in both directions', () => {
        const pbx = read(PBX);
        const refs = /CODE_SIGN_ENTITLEMENTS = ([^;]+);/.exec(pbx);
        const candidates = ['ios/App/App/App.entitlements', 'ios/App/App.entitlements'];
        const found = candidates.filter(has);
        assert.ok(/objectVersion/.test(pbx), 'not a pbxproj - the checks below prove nothing');
        if (refs) {
            assert.ok(found.length > 0,
                'the pbxproj sets CODE_SIGN_ENTITLEMENTS = ' + refs[1].trim() + ' but no entitlements file is in the tree - the build fails on a fresh clone');
        } else {
            assert.equal(found.length, 0,
                'an entitlements file is committed but nothing references it - Xcode ignores it and Apple sign-in fails at runtime: ' + found.join(', '));
        }
    });
});

// ===========================================================================
// WHY THIS BLOCK EXISTS, and it is not a hypothetical.
//
// 2026-09-30, Manny's iPhone, Xcode Cmd+R: the Apple sheet appeared, Face ID
// completed, the app came back and the status line said "Could not finish
// sign-in. Nothing changed - try again, or use email instead." - the generic
// message, with no code in it. The founder pass was still on screen, so the uid
// was intact and nothing had been half-written. But which failure it was could
// not be recovered from the device: the shell has no visible console, the error
// was caught, and the code - the one fact that identifies it - was discarded.
//
// Two things changed, and both are tested below rather than described.
//
//   1. messageFor ENDS AN UNRECOGNISED ERROR WITH ITS CODE. Every failure the
//      path expects is mapped to a plain sentence with no code in it, so a code
//      appearing on screen means the mapping is missing a case.
//
//   2. THE ADOPT FALLBACK USES THE CREDENTIAL ON THE ERROR. Firebase attaches a
//      credential to credential-already-in-use and
//      account-exists-with-different-credential. The popup path never re-presents
//      a credential, because the SDK mints a fresh one each time; the native path
//      built one itself and handed the SAME object to signInWithCredential after
//      the link had already consumed it. That is the one structural difference
//      between the two paths on this branch, and this is the suspect for the
//      failure above - Apple and Google were both signed in on the web preview
//      earlier that day, so the credential genuinely WAS already in use and the
//      adopt branch is exactly the branch that ran.
//
// STILL NOT PROVEN HERE: which code the device actually produced. Nothing in this
// repo can produce a real Apple idToken, so the fix above is the one structural
// defect found by reading, and the code on screen after the next Cmd+R is what
// settles it. Guessing which of the two mattered would be inventing a measurement.
//
// MEASURED for this block on its own, against d5e86f7 - oauth-signin.js exactly as
// it shipped to the phone that failed: 3/9 green, six red. (The file's own baseline,
// in the checked form, is the 35-test figure at the top.) The three already-green
// are the ones asserting behaviour that was right before this fix: a mapped code
// shows a plain sentence with no code appended, an error carrying no code at all
// still gets the bare sentence, and the adopt path with NO credential on the error
// already worked - it fell through to the credential we presented, which is the
// case the old code handled by accident rather than on purpose.
// ===========================================================================
describe('A FAILURE SAYS WHICH FAILURE, AND ADOPTING USES THE RIGHT CREDENTIAL', () => {

    // A firebase stand-in with a callable auth(), which is what signIn needs.
    function fakeSeam(opts) {
        const o = opts || {};
        const calls = [];
        const sandbox = loadJsFile(SEAM);
        const anon = { uid: 'anon-1', isAnonymous: true, email: null };
        const adopted = { uid: 'web-uid-9', isAnonymous: false, email: 'a@b.com' };
        const user = {
            uid: anon.uid, isAnonymous: true, email: null,
            linkWithCredential: (cred) => {
                calls.push({ fn: 'linkWithCredential', cred: cred });
                if (o.linkError) return Promise.reject(o.linkError);
                return Promise.resolve({ user: { uid: anon.uid, isAnonymous: false, email: 'a@b.com' } });
            },
            linkWithPopup: () => { calls.push({ fn: 'linkWithPopup' }); return Promise.resolve({ user: anon }); }
        };
        const auth = {
            currentUser: o.noUser ? null : user,
            signInWithCredential: (cred) => {
                calls.push({ fn: 'signInWithCredential', cred: cred });
                if (o.signInError) return Promise.reject(o.signInError);
                return Promise.resolve({ user: adopted });
            },
            signInWithPopup: () => { calls.push({ fn: 'signInWithPopup' }); return Promise.resolve({ user: adopted }); }
        };
        const authFn = () => auth;
        authFn.GoogleAuthProvider = function () { this.addScope = () => {}; };
        authFn.GoogleAuthProvider.credential = (idToken, accessToken) => ({ built: 'google', idToken, accessToken });
        authFn.OAuthProvider = function (id) {
            this.providerId = id;
            this.addScope = () => {};
            this.credential = (arg) => ({ built: 'apple', arg });
        };
        sandbox.firebase = { auth: authFn };
        sandbox.window.Capacitor = o.plugin ? { Plugins: { FirebaseAuthentication: o.plugin } } : undefined;
        const logged = [];
        sandbox.console = { error: (m) => logged.push(String(m)), log: () => {}, warn: () => {} };
        return { o: sandbox.oauthSignin, calls, logged };
    }
    const applePlugin = {
        signInWithApple: () => Promise.resolve({ credential: { idToken: 'aid', nonce: 'raw', providerId: 'apple.com' } }),
        signInWithGoogle: () => Promise.resolve({ credential: { idToken: 'gid', accessToken: 'gacc', providerId: 'google.com' } })
    };
    const err = (code, extra) => Object.assign(new Error(code), { code: code }, extra || {});

    test('an unmapped code is ON SCREEN, appended to the generic sentence', () => {
        const { o } = fakeSeam({});
        const msg = o.messageFor(err('auth/invented-for-this-test'));
        assert.ok(msg.indexOf(o.notes.generic) === 0, 'the sentence must still lead: ' + msg);
        assert.ok(/\(auth\/invented-for-this-test\)$/.test(msg),
            'an error the mapping does not know must end with its code, or a device failure is unrecoverable: ' + msg);
    });

    test('a MAPPED code shows a plain sentence with no code in it', () => {
        const { o } = fakeSeam({});
        const cancelled = o.messageFor(err('auth/popup-closed-by-user'));
        assert.equal(cancelled, o.notes.cancelled, 'a known failure must not leak a code');
        assert.ok(!/\(auth\//.test(cancelled));
        assert.ok(!/\(auth\//.test(o.messageFor(err('auth/operation-not-allowed'))));
    });

    test('an error with no code at all still gets the bare sentence', () => {
        const { o } = fakeSeam({});
        assert.equal(o.messageFor(new Error('nothing useful')), o.notes.generic);
        assert.equal(o.messageFor(null), o.notes.generic);
    });

    test('the native-only failures say what they are: a rejected token, and no signal', () => {
        const { o } = fakeSeam({});
        const bad = o.messageFor(err('auth/invalid-credential'));
        assert.equal(o.messageFor(err('auth/missing-or-invalid-nonce')), bad,
            'a nonce mismatch and a rejected token are the same story to the golfer');
        assert.ok(/token was rejected/.test(bad), bad);
        assert.ok(!/\(auth\//.test(bad), 'it is mapped, so no code is appended');
        assert.ok(/No connection/.test(o.messageFor(err('auth/network-request-failed'))));
    });

    test('adoptCredential prefers the credential Firebase put on the error', () => {
        const { o } = fakeSeam({});
        const fresh = { built: 'from-firebase' };
        const presented = { built: 'ours' };
        assert.equal(o.adoptCredential(err('auth/credential-already-in-use', { credential: fresh }), presented), fresh);
        assert.equal(o.adoptCredential(err('auth/credential-already-in-use'), presented), presented,
            'a provider that attaches nothing must still adopt, with what we presented');
    });

    test('NATIVE ADOPT: the second sign-in gets the error credential, not the consumed one', async () => {
        const fresh = { built: 'fresh-from-firebase' };
        const { o, calls } = fakeSeam({
            plugin: applePlugin,
            linkError: err('auth/credential-already-in-use', { credential: fresh })
        });
        const out = await o.signIn('apple');
        assert.deepEqual(calls.map(c => c.fn), ['linkWithCredential', 'signInWithCredential'],
            'link first, then adopt');
        assert.equal(calls[0].cred.built, 'apple', 'the link is presented the credential we built from the plugin');
        assert.equal(calls[1].cred, fresh,
            'the adopt must use the credential on the error - re-presenting a consumed Apple credential is the suspected device failure');
        assert.equal(out.note, o.notes.adopted, 'and the golfer is told the trial was not copied');
        assert.equal(out.preserved, false);
    });

    test('NATIVE ADOPT without a credential on the error still adopts', async () => {
        const { o, calls } = fakeSeam({
            plugin: applePlugin,
            linkError: err('auth/credential-already-in-use')
        });
        const out = await o.signIn('apple');
        assert.equal(calls.length, 2);
        assert.equal(calls[1].cred.built, 'apple', 'falls back to what we presented');
        assert.equal(out.note, o.notes.adopted);
    });

    test('a failure that is NOT an adopt signal is rethrown with its code, and logged once', async () => {
        const { o, calls, logged } = fakeSeam({
            plugin: applePlugin,
            linkError: err('auth/invalid-credential')
        });
        let caught = null;
        try { await o.signIn('apple'); } catch (e) { caught = e; }
        assert.ok(caught, 'it must reject rather than resolve on a failure');
        assert.equal(caught.code, 'auth/invalid-credential', 'the code must survive for messageFor');
        assert.deepEqual(calls.map(c => c.fn), ['linkWithCredential'], 'no silent second attempt');
        assert.equal(logged.length, 1, 'exactly one log line, so the Xcode console shows it once: ' + JSON.stringify(logged));
        assert.ok(/auth\/invalid-credential/.test(logged[0]), logged[0]);
        assert.ok(/apple/.test(logged[0]), 'and which button it was: ' + logged[0]);
    });

    test('the log carries no token, ever', async () => {
        const { o, logged } = fakeSeam({
            plugin: {
                signInWithApple: () => Promise.resolve({ credential: { idToken: 'SECRET-ID-TOKEN', nonce: 'SECRET-NONCE' } }),
                signInWithGoogle: () => Promise.resolve({})
            },
            linkError: err('auth/invalid-credential')
        });
        try { await o.signIn('apple'); } catch (e) { /* expected */ }
        assert.equal(logged.length, 1);
        assert.ok(!/SECRET-ID-TOKEN/.test(logged[0]), 'an id token must never reach a log: ' + logged[0]);
        assert.ok(!/SECRET-NONCE/.test(logged[0]), logged[0]);
    });
});
