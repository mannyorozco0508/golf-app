import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rattlegolf.app',
  // DISPLAY NAME HELD while iOS 1.0.3 is Waiting for Review as Rattle Golf.
  // The consumer web brand is HardPan (manifest.json, the lobby, share
  // titles). After 1.0.3 is released, set appName to 'HardPan' in the same
  // commit that changes ios/App/App/Info.plist CFBundleDisplayName and
  // android/.../strings.xml app_name, then archive the next build. Changing
  // it during review would make a resubmitted binary disagree with the
  // listing. The bundle id stays com.rattlegolf.app forever.
  appName: 'Rattle Golf',
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
    includePlugins: ['@capacitor/filesystem', '@capacitor/share']
  }
};

export default config;
