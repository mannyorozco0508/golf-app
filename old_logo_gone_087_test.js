// ============================================================================
// 087 THE OLD LOGO IS GONE AND CANNOT COME BACK (Manny, Oct 26 2026: "why is this
// logo there? ... this logo no longer exists.")
//
// The old HardPan mark - the dimpled ball / "ball on firm ground", the ball + pin
// icon, the ball + HARDPAN lockup and banner - is listed below by the SHA-256 of
// every file that carried it on main 9eab1533 and on the GPS line e690614f. This
// file fails if any of those bytes is shown or referenced by a page, a manifest,
// a shell / precache list, or sits anywhere in the repo outside the backup folder
// assets/brand/legacy/. It also fails if the HTML "HARDPAN" word banner returns.
//
// EXCEPTIONS (each one is Manny's call or another session's job, named here):
//  - logo-mark.png on the Tournaments pages: the Rattle Golf mark there stays
//    (Manny, Oct 26 2026: "leave it as Rattle Golf. No change."). It is in NO bundle or
//    offline cache (Manny OK, 6:43 PM); the website serves it from the root to that page only.
//  - android/: the Android session regenerates its launcher + Play icons (A2).
//  - ios/ and icon-1024.png on the website line (no gps-beta/): the App Store icon and
//    launch screen move with the store release line (W7), not with the website.
// Nothing else. hardpan-lockup.svg has NO exception (Manny's OK to stop shipping it).
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');
const exists = f => fs.existsSync(path.join(ROOT, f));
const GPS_LINE = exists('gps-beta');

const OLD = {
    '0516cf2b6fc2da395a0507a5d4eda2f9231361c48819b5b5a374b6e0950f7f67': 'gps-e690614f ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-20pt@1x.png',
    '0d578336ab24b78ee7e50947c53caf95dd71849a80e8a51c74a24c4d2c2f4c41': 'main android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png',
    '12f5f94eddf00b47ab3732375700678eadd856fa2314bfc95a322890befb2fef': 'main android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png',
    '170eb921f23b42f11abcb80d2de7d1d65905f670af9db0ccce160a0f5d10942a': 'gps-e690614f ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-29pt@1x.png',
    '23cd2d1d823c8e6c6f544ea374c467eb4e7e9d1361e4365419773ae93e673947': 'gps-e690614f icon-1024.png',
    '2ab5e7af4ecfe9948233e277d705b53fae780054ab82ac0d7c0c3e08012dab65': 'gps-e690614f ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-60pt@3x.png',
    '2f35d487a3b9539179a07f6909e4552d35aa6373016fe528937b004283e75509': 'main android/app/src/main/res/mipmap-xhdpi/ic_launcher.png',
    '300cf9f2ff551ccd3aa45dc64d933ca9a53a0830d312cd2906cbb1f6ec801ddd': 'main android/app/src/main/res/mipmap-hdpi/ic_launcher.png',
    '3330ab520f7d0da6fb37e8774fe736c51d6d681bb7b409b9d0808b5e6fc02dc1': 'main icon-1024.png',
    '39e824bb6297e9cc2bfb5aafc98067b15c1ebebf04ca4d71eb1b1f6bcfc8bfa0': 'gps-e690614f ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-83.5pt@2x.png',
    '499eb4c4f80258ca64d8a90bc27a378d7428dc1a9cc1b0d2963577979ff3e9fb': 'gps-e690614f icon-192.png',
    '4cd5250a36c874e973615a460082ede1277e30f444d28cbe3fce44ef829e8064': 'main android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png',
    '4e6b922a1971d9bf98f2321adeb0b4a990b03400a26ffc23f774ee8368a2755b': 'gps-e690614f ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-40pt@2x.png',
    '50c7b7c463021e8b017bc0e248af3a54a84629f2490d54c2f17f413f037408cc': 'main icon-192.png',
    '54910e4f7955b61ad1a2bd794909797b86acfc9b4e6f25c44e198730114823ce': 'gps-e690614f favicon-32.png',
    '55e4ee5c6ca06df9cae7a64a11bc0f92593d91a962a244a053dfe41e0c97bbca': 'main favicon-32.png',
    '5fd6924427a4c8959eca59ce15a39d981a54dee2579b0078fb0789e9d2816a24': 'main logo-mark.png',
    '6c31b2a9457bf7736b00376df9bd0114975214f7f55da075147786d3e0f62d9e': 'main android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png',
    '70944081a8a6bc200faf20a52de649f3159fe9c84b04a79ad3c9a325eab5da12': 'main ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png',
    '80a8b58d142cf08f290647a33360705fef48be546b710962962eaa8d90b3b355': 'gps-e690614f ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-40pt@3x.png',
    '84b76758a5fb254f95e57a0b232b708ea62eafc20351ba51f17213245927b573': 'main android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png',
    '953be2cd7a5e3fa1490290564fcb83659bfec4808fac88e5bcf8fb383aa90dd7': 'gps-e690614f ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-29pt@3x.png',
    '97c90a239624fee22d0ae141a4f4d13f90873d3ad273f8fa543e5ffa30c1463b': 'main assets/brand/hardpan-lockup.svg',
    '9bd14d56f563d8eb097bbc2aa940cbf73711c49c4c59009ece4c59b12d673f2e': 'gps-e690614f ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-20pt@2x.png',
    '9c500c7ce7e733a24c7494d8346888d211b3ed37ca81f1fa978d79346f331092': 'main android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png',
    'a365c0ce97060e3791011b29713c8ef4b21d6a5eeed92ddfd9915a51423bba99': 'gps-e690614f icon-512.png',
    'a7b999bfa45602b301e6c74405a92170d7c47e10b59df2b41fe87d735ad5cf79': 'gps-e690614f ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-76pt@1x.png',
    'aa86072bba39f03df57810e9514e628358821607eaef8c76f0b67ca468825d20': 'gps-e690614f ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-20pt@3x.png',
    'bb7a2922f9dccd6a91d53172eaf04f807623a50338b07d78486b1cacf0718c61': 'main android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png',
    'c55b42df8fb05fe5b00ae059932e91b7d4eb316ab37e4ec5d4c05980ca672823': 'main android/app/src/main/ic_launcher-playstore.png',
    'dc916f6379dd67b06fdd216a6114797c04163162c498b855b6d054320279f53d': 'main android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png',
    'dd76337ed182bacea3ce948c4d12eb2ee2f657157f768893e7080d9626a37eff': 'main android/app/src/main/res/mipmap-mdpi/ic_launcher.png',
    'e118285edff6d8c1289b371165e191d58c80d1d3e122770af2589e7fee0a539c': 'main android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png',
    'e6410932694dee44c325c8a100d874823977d1cd460500aea20de57fff238728': 'gps-e690614f ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-76pt@2x.png',
    'e9887d8e3959e8b8b0dda6d0136127bc9f60df16124dd4659b29a76847fad3e2': 'main android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png',
    'eb537777c7e0f814c5b7c68849ba09d4217bcaac2b8404841b7f522f5e3c9068': 'main android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png',
    'ed5c8db10db21ea96b5aadb793b740848a2d2d45a4c2f3f36106f4719374d294': 'main assets/brand/hardpan-icon.svg',
    'f26defbfde770fee18524d1f34e9589512de3e82610329ffd7e854def4d3f0f6': 'gps-e690614f ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-29pt@2x.png',
    'f74f99db0c06fb321ee21e6821ca23d1b4bc2cca166ccbc0c9938f9fac7e2da9': 'main android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png',
    'f9a9150f1a02840f1ad685697f90524b3431c433c6a5cb61e0db8a59ad3154e4': 'main icon-512.png',
};

const TOURNAMENT_PAGES = ['tournament.html', 'tournament-scorecard.html'];
function allowed(file, by) {
    // 087 6:43 PM (Manny OK): no longer for the shell / bundle - only the Tournaments page's own reference
    // and the root file the website serves to it.
    if (file === 'logo-mark.png' && (!by || TOURNAMENT_PAGES.includes(by))) return 'Rattle Golf tournament mark (Manny: leave)';
    if (/^android\//.test(file)) return 'Android session (A2)';
    if (!GPS_LINE && (/^ios\//.test(file) || file === 'icon-1024.png')) return 'store release line (W7)';
    return null;
}

describe('THE OLD MARK IS NOWHERE', () => {
    test('the list is real: 40 old files, and the backups in assets/brand/legacy are among them', () => {
        assert.equal(Object.keys(OLD).length, 40);
        const legacy = execFileSync('git', ['ls-files', 'assets/brand/legacy'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(f => /\.(png|svg)$/.test(f));
        assert.ok(legacy.length >= 5, 'the backup copies are missing: ' + legacy.join(', '));
        legacy.forEach(f => assert.ok(OLD[sha(f)], f + ' is in legacy but is not one of the old files'));
    });

    test('no tracked image outside assets/brand/legacy carries the old bytes', () => {
        const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n')
            .filter(f => /\.(png|svg|jpe?g|ico|webp)$/i.test(f) && !/^assets\/brand\/legacy\//.test(f) && exists(f));
        assert.ok(files.length > 20, 'the scan saw almost nothing');
        const bad = files.filter(f => OLD[sha(f)] && !allowed(f));
        assert.deepEqual(bad.map(f => f + ' = old ' + OLD[sha(f)]), []);
    });

    test('no page shows or links the old mark (img, icon, apple-touch-icon)', () => {
        const pages = fs.readdirSync(ROOT).filter(f => /\.html$/.test(f));
        assert.ok(pages.length > 10);
        const bad = [];
        pages.forEach(p => {
            const src = read(p);
            for (const m of src.matchAll(/(?:src|href)="([^"#?:]+\.(?:png|svg|jpe?g|ico|webp))"/g)) {
                const f = m[1].replace(/^\.\//, '');
                if (!exists(f)) continue;
                if (OLD[sha(f)] && !allowed(f, p)) bad.push(p + ' -> ' + f + ' (old ' + OLD[sha(f)] + ')');
            }
        });
        assert.deepEqual(bad, []);
    });

    test('no manifest icon is the old mark', () => {
        ['manifest.json', 'tournament-manifest.json'].filter(exists).forEach(m => {
            JSON.parse(read(m)).icons.forEach(i => {
                const f = i.src.replace(/^\.\//, '');
                assert.ok(!OLD[sha(f)], m + ' icon ' + f + ' is the old mark');
            });
        });
    });

    test('no shell or precache list ships the old mark, and hardpan-lockup.svg ships nowhere', () => {
        const sw = read('sw.js');
        const shell = sw.slice(sw.indexOf('const SHELL_FILES'), sw.indexOf('];', sw.indexOf('const SHELL_FILES')));
        const sync = read('sync-mobile-web.js');
        const entries = [...shell.matchAll(/'\.\/([^']+)'/g), ...sync.matchAll(/'([^'\/]+\.(?:png|svg))'/g)].map(m => m[1]);
        assert.ok(entries.length > 10);
        entries.filter(exists).forEach(f => assert.ok(!OLD[sha(f)], f + ' ships the old mark'));
        assert.ok(!entries.includes('logo-mark.png'), 'logo-mark.png (the old ball) ships in a bundle or the offline cache again');
        assert.ok(!/hardpan-lockup\.svg'/.test(shell), 'sw.js precaches the old lockup');
        assert.ok(!/'hardpan-lockup\.svg'/.test(sync), 'the native bundle ships the old lockup');
        assert.ok(!exists('hardpan-lockup.svg'), 'the old lockup is back at the root');
        if (GPS_LINE) {
            const b = read('tools/build-gps-app.js');
            assert.ok(!/hardpan-lockup\.svg/.test(b) || /legacy/.test(b), 'the GPS build names the old lockup');
        }
    });

    test('the HTML "HARDPAN" word banner is gone from every page', () => {
        fs.readdirSync(ROOT).filter(f => /\.html$/.test(f)).forEach(p => {
            const src = read(p);
            assert.ok(!/class="(?:lobby|brand)-word">HARDPAN</.test(src), p + ' shows the old HARDPAN word banner');
        });
    });
});
