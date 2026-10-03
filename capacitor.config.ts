import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rattlegolf.app',
  // DISPLAY NAME is HardPan in the repo. Do not archive or upload a new iOS
  // binary while 1.0.3 is in review — that binary still says Rattle Golf.
  // Update the App Store Connect listing and archive the next build only
  // after 1.0.3 clears. The bundle id stays com.rattlegolf.app forever.
  appName: 'HardPan',
  webDir: 'www/app',
  ios: {
    // THE iOS TARGET LINKS EXACTLY THESE, AND NOTHING ELSE package.json GAINS.
    //
    // By default `npx cap sync` links every package.json dependency that
    // carries a "capacitor" field to every platform. @capacitor/app was added
    // for the Android hardware back button; the next `cap sync ios` wrote
    // CapacitorApp into ios/App/CapApp-SPM/Package.swift, a tracked file, in
    // a tree that had nothing to do with Android - measured 2026-09-11 and
    // reverted by hand. On iOS the plugin's only Consumer caller is GolfBack
    // in pwa-boot.js, whose two entry points (backButton, minimizeApp) never
    // fire or are unimplemented there.
    //
    // This is an ALLOWLIST: a plugin added for either platform reaches iOS
    // only when it is named here, deliberately. Android stays on the default
    // and links all three, because that side was chosen and committed in
    // android/app/capacitor.build.gradle. native_plugin_allowlist_test.js
    // holds this list, Package.swift and the gradle against each other.
    // @capacitor-firebase/authentication joins for ONE-TAP SIGN-IN (Wave 33). In
    // the shell a popup has no window to open, so Continue with Apple and Continue
    // with Google need the native Apple and Google SDKs. It is named here
    // deliberately, like the other two.
    // @capacitor/push-notifications joins for WAVE 39: you're in, final results, a
    // bet challenge, a press offered, and hype. Five notifications, all of which
    // have to come from outside the phone, so all of them need a token and a
    // sender.
    //
    // @capacitor/local-notifications WAS HERE AND IS GONE. It did one job - a
    // 30-minute tee-time reminder - and that was removed on Manny's call before
    // it shipped. The plugin came out with it rather than being left linked: an
    // unused third-party SDK in the binary is exactly what the Facebook trait
    // exclusion below exists to prevent, and leaving it would mean shipping a
    // notification permission the app never uses.
    //
    // INERT UNTIL MANNY'S SETUP EXISTS. Push needs the APNs key in Firebase and
    // the Push Notifications capability in Xcode; without them register() fires
    // registrationError and the app carries on exactly as it does today.
    includePlugins: ['@capacitor/filesystem', '@capacitor/share', '@capacitor-firebase/authentication',
                     '@capacitor/push-notifications']
  },
  // ANDROID IS NOW AN ALLOWLIST TOO, AND THE REASON IS THIS WAVE'S PLUGIN.
  //
  // Android was deliberately left on the Capacitor default - link every plugin in
  // package.json - because all three of the plugins that existed were wanted there.
  // @capacitor-firebase/authentication is the first one that is NOT: its Android half
  // needs google-services.json and the com.google.gms.google-services gradle plugin,
  // neither of which this repo has, so the next `npx cap sync android` would have
  // written capacitor-firebase-authentication into capacitor.build.gradle and broken
  // the Android build for a feature Android does not ship yet.
  //
  // Naming the three that were already there changes NOTHING about what Android
  // links: after adding this, `npx cap sync android` left capacitor.build.gradle and
  // capacitor.settings.gradle byte-identical - measured 2026-09-30, and that is the
  // point of the list. When Android does get one-tap sign-in, it gets google-services
  // .json, the gradle plugin, and a fourth entry here, together, on purpose.
  // ANDROID DOES NOT GET THE WAVE 39 PLUGINS YET, for the same reason it does not
  // get the auth plugin: push on Android needs google-services.json and the
  // com.google.gms.google-services gradle plugin, neither of which this repo has,
  // so naming them would break the Android build for a feature Android does not
  // ship. When Android gets push, it gets the json, the gradle plugin and the
  // entries here together, on purpose.
  android: {
    includePlugins: ['@capacitor/app', '@capacitor/filesystem', '@capacitor/share']
  },
  // SPM TRAITS: GOOGLE YES, FACEBOOK NO (Wave 33).
  //
  // @capacitor-firebase/authentication ships GoogleSignIn AND the Facebook SDK
  // behind DEFAULT package traits, so a plain sync links Facebook into the binary -
  // an unused third-party SDK, which is exactly what the review reply says this app
  // does not have. Listing traits REPLACES the defaults, so naming Google alone
  // excludes Facebook. The plugin README documents this; it needs Capacitor CLI
  // 8.3.0+ (this project is on 8.5.1) and Xcode 16.3+ for Swift 6.1, which is what
  // bumping swiftToolsVersion asks for.
  //
  // Verify after a sync: ios/App/CapApp-SPM/Package.swift should carry
  // traits: ["Google"] on the plugin, and nothing facebook-ios-sdk should appear in
  // Package.resolved after Xcode resolves. native_plugin_allowlist_test.js holds it.
  experimental: {
    ios: {
      spm: {
        swiftToolsVersion: '6.1',
        packageTraits: {
          '@capacitor-firebase/authentication': ['Google']
        }
      }
    }
  },
  plugins: {
    FirebaseAuthentication: {
      // ONLY the two providers offered. Naming them is not decoration: the plugin
      // ships Facebook support behind a default SPM trait, and an unused third-party
      // SDK in the binary is exactly what the review reply says this app does not
      // have. See ios/App/CapApp-SPM/Package.swift after a sync - if Facebook is in
      // there, it has to come out before an archive.
      providers: ['apple.com', 'google.com'],
      // THE JS LAYER OWNS THE SESSION, and this is the whole uid guarantee: with
      // native persistence off, the native SDK does not create its own signed-in
      // user, so the anonymous organizer is still there to be LINKED and the rounds,
      // the free trial and a founder pass stay on the same uid. oauth-signin.js also
      // passes skipNativeAuth per call; this is the same decision at config level.
      skipNativeAuth: true
    }
  }
};

export default config;
