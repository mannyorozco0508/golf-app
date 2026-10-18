// ============================================================================
// ANDROID GPS FIXES 1-4 (android-gps, 2026-10-17) - and that iOS did not move.
//
// Every fix is gated on Capacitor.getPlatform() === 'android'. Each block below runs
// the SAME production file twice, once as Android and once as iOS, and asserts both
// halves: the Android change happens, and the iOS behaviour is what it was before.
//
//   1. LOCATION ASKS ONCE, FOR PRECISE. Near you asked with enableHighAccuracy:false,
//      which on Android grants approximate only (a fix 2 km off), so the map asked
//      again to upgrade. Its 15 s clock also ran while the permission dialog was up.
//   2. NO APPLE / GOOGLE ON ANDROID. Both left the app for Chrome and the button sat
//      on "Opening..." for ever. Email is the only way in, and it is shown at once.
//   3. NO NOTIFICATIONS CARD ON ANDROID. Android has no push.
//   4. BACK CLOSES ONE LAYER. One press on Add a game used to leave the round.
//
// HOW EACH IS REACHED. front-door.js and pwa-boot.js decide Android-or-not at parse
// time, so they run here in a small hand-built window (below) whose Capacitor says
// android or ios BEFORE the file is read - and the back button is pressed through
// the listener the file itself registered with the App plugin, not by calling the
// file's functions. admin.html runs in the repo's mini-dom realm and is reached
// through the Account link's own onclick.
//
// WHAT THIS CANNOT PROVE. No real permission dialog, GPS fix, WebView or back key
// exists here; the emulator QA in docs/FOR-IOS-SESSION.md's companion report is the
// arrival check for those. mini-dom does not parse static style attributes, so the
// email card's visibility is read from the page's own emailFallbackShown flag.
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'front-door.js'));
const skip = ON ? false : 'Consumer tree: no front doors';

// ---- a small window ---------------------------------------------------------------
function el(id, display) {
    const classes = new Set();
    return {
        id, style: { display: display === undefined ? '' : display }, innerHTML: '', children: [],
        classList: {
            contains: c => classes.has(c), add: c => classes.add(c), remove: c => classes.delete(c),
            toggle: (c, on) => { const want = on === undefined ? !classes.has(c) : !!on; if (want) classes.add(c); else classes.delete(c); return want; }
        },
        setAttribute() {}, getAttribute() { return null; }, addEventListener() {}, appendChild(x) { this.children.push(x); return x; },
        querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; }
    };
}
function windowFor(platform, page, extra) {
    const els = new Map();
    const timers = [];
    let now = 0;
    const calls = [];
    const listeners = {};
    const geo = (extra && extra.geo) || {};
    const App = {
        addListener(name, fn) { calls.push('App.addListener:' + name); (listeners[name] = listeners[name] || []).push(fn); return { remove() {} }; },
        minimizeApp() { calls.push('App.minimizeApp'); },
        getLaunchUrl() { calls.push('App.getLaunchUrl'); return Promise.resolve((extra && extra.launchUrl) ? { url: extra.launchUrl } : undefined); }
    };
    const W = {
        Capacitor: {
            getPlatform: () => platform,
            isNativePlatform: () => platform !== 'web',
            Plugins: { Geolocation: geo, App }
        },
        location: { pathname: '/' + page, search: '', href: page, replace(u) { calls.push('replace:' + u); } },
        history: { back() { calls.push('history.back'); } },
        navigator: { onLine: true },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        sessionStorage: (() => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })(),
        document: {
            readyState: 'complete',
            getElementById: id => els.get(id) || null,
            createElement: () => el(''),
            querySelector: () => null, querySelectorAll: () => [],
            addEventListener() {}, documentElement: el('html'), head: el('head'), body: el('body')
        },
        setTimeout(fn, ms) { const t = { fn, at: now + (ms || 0), id: timers.length + 1 }; timers.push(t); return t.id; },
        clearTimeout(id) { const t = timers.find(x => x.id === id); if (t) t.fn = null; },
        addEventListener() {}, scrollTo() {}, console,
        URL, URLSearchParams, Promise, JSON, Math, Date, String, Number, Array, Object, RegExp, Error
    };
    W.window = W;
    if (extra && extra.GolfBack) W.GolfBack = extra.GolfBack;
    const sb = vm.createContext(W);
    sb.__els = els; sb.__calls = calls; sb.__listeners = listeners; sb.__el = el;
    // Fake time: run every timer due by `ms` from now.
    sb.__advance = (ms) => { now += ms; timers.filter(t => t.fn && t.at <= now).forEach(t => { const f = t.fn; t.fn = null; f(); }); };
    return sb;
}
const load = (sb, file) => vm.runInContext(read(file), sb, { filename: file });
const flush = () => new Promise(r => setImmediate(r));
async function settle() { for (let i = 0; i < 8; i++) await flush(); }
const pressBack = sb => (sb.__listeners.backButton || []).forEach(fn => fn({ canGoBack: true }));

// A Geolocation stub that records every call and lets the test answer when it likes.
function geoStub(perm) {
    const log = [];
    let answerRequest = null;
    const g = {
        log,
        checkPermissions() { log.push(['checkPermissions']); return Promise.resolve(perm); },
        requestPermissions(o) { log.push(['requestPermissions', o]); return new Promise(r => { answerRequest = r; }); },
        getCurrentPosition(o) { log.push(['getCurrentPosition', o]); return Promise.resolve({ coords: { latitude: 33.45, longitude: -79.15 } }); },
        answer(st) { answerRequest(st); }
    };
    return g;
}

// ---------------------------------------------------------------------------
describe('1. LOCATION: Android asks once, for precise, and never times out under the dialog', () => {

    test('Android: one request for precise location, and the 15 s clock starts only after it is answered', { skip }, async () => {
        const geo = geoStub({ location: 'prompt', coarseLocation: 'prompt' });
        const sb = windowFor('android', 'home.html', { geo });
        load(sb, 'front-door.js');
        const got = [];
        sb.HardPanBack.position((p, why) => got.push([p, why]));
        await settle();
        assert.deepEqual(geo.log.map(c => c[0]), ['checkPermissions', 'requestPermissions'], 'it asks for permission first');
        assert.deepEqual(JSON.parse(JSON.stringify(geo.log[1][1])), { permissions: ['location'] }, 'precise (location), never coarseLocation alone');
        // The dialog is up for 40 s: nothing may give up meanwhile.
        sb.__advance(40000);
        await settle();
        assert.deepEqual(got, [], 'Near you timed out while the permission dialog was on screen');
        geo.answer({ location: 'granted', coarseLocation: 'granted' });
        await settle();
        const ask = geo.log.find(c => c[0] === 'getCurrentPosition');
        assert.ok(ask, 'after the grant it asks for the position');
        assert.equal(ask[1].enableHighAccuracy, true, 'the position is asked for at high accuracy');
        assert.deepEqual(JSON.parse(JSON.stringify(got)), [[[33.45, -79.15], null]]);
        assert.equal(geo.log.filter(c => c[0] === 'requestPermissions').length, 1, 'one prompt');
    });

    test('Android: already granted asks nothing; approximate chosen in the dialog still works; denied says denied', { skip }, async () => {
        const g1 = geoStub({ location: 'granted' });
        const s1 = windowFor('android', 'home.html', { geo: g1 });
        load(s1, 'front-door.js');
        s1.HardPanBack.position(() => {});
        await settle();
        assert.deepEqual(g1.log.map(c => c[0]), ['checkPermissions', 'getCurrentPosition'], 'no prompt when granted');

        const g2 = geoStub({ location: 'prompt' });
        const s2 = windowFor('android', 'home.html', { geo: g2 });
        load(s2, 'front-door.js');
        const got2 = [];
        s2.HardPanBack.position(p => got2.push(p));
        await settle();
        g2.answer({ location: 'denied', coarseLocation: 'granted' });
        await settle();
        assert.deepEqual(JSON.parse(JSON.stringify(got2)), [[33.45, -79.15]], 'a golfer who picks Approximate still gets Near you');

        const g3 = geoStub({ location: 'prompt' });
        const s3 = windowFor('android', 'home.html', { geo: g3 });
        load(s3, 'front-door.js');
        const got3 = [];
        s3.HardPanBack.position((p, why) => got3.push([p, why]));
        await settle();
        g3.answer({ location: 'denied', coarseLocation: 'denied' });
        await settle();
        assert.deepEqual(JSON.parse(JSON.stringify(got3)), [[null, 'denied']]);
        assert.ok(!g3.log.some(c => c[0] === 'getCurrentPosition'), 'denied asks for no position');
    });

    test('iOS UNCHANGED: no permission calls, low accuracy, and the clock starts at once', { skip }, async () => {
        const geo = geoStub({ location: 'prompt' });
        const sb = windowFor('ios', 'home.html', { geo });
        // The iOS path's getCurrentPosition never answers, so the 15 s clock is what ends it.
        geo.getCurrentPosition = (o) => { geo.log.push(['getCurrentPosition', o]); return new Promise(() => {}); };
        load(sb, 'front-door.js');
        const got = [];
        sb.HardPanBack.position((p, why) => got.push([p, why]));
        await settle();
        assert.deepEqual(geo.log.map(c => c[0]), ['getCurrentPosition'], 'iOS asks for permission through getCurrentPosition, as before');
        assert.deepEqual(JSON.parse(JSON.stringify(geo.log[0][1])), { enableHighAccuracy: false, timeout: 10000 });
        sb.__advance(15000);
        await settle();
        assert.deepEqual(JSON.parse(JSON.stringify(got)), [[null, 'timeout']], 'iOS still gives up at LOC_MS');
    });

    test('the map already asks at high accuracy on every platform (nothing to change there)', { skip }, () => {
        assert.match(read('gps-view.js'), /var GEO_OPTS = \{ enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 \};/);
    });
});

// ---------------------------------------------------------------------------
describe('2 + 3. THE ACCOUNT SHEET: email only, and no notifications card, on Android', () => {
    const run = (sb, expr) => vm.runInContext(expr, sb);
    function accountSheet(platform) {
        const sb = loadHtmlInlineScript('admin.html', [], {
            beforeRun: s => {
                s.Capacitor = s.window.Capacitor = {
                    getPlatform: () => platform, isNativePlatform: () => true, Plugins: {}
                };
            }
        });
        run(sb, "window.firebase = { auth: function () { return { currentUser: null }; } };");
        // The golfer taps Account: the link's own onclick, read from the markup.
        const m = /id="account-link"[^>]*onclick="([^"]+)"/.exec(read('admin.html'));
        assert.ok(m, 'the Account link is not in the markup');
        run(sb, m[1]);
        return sb;
    }
    const disp = (sb, id) => run(sb, "document.getElementById('" + id + "').style.display");

    test('Android: no Apple, no Google, no "Use email instead" - the email card is the card', { skip }, () => {
        const sb = accountSheet('android');
        assert.ok(run(sb, "document.getElementById('account-modal').classList.contains('open')"), 'Account did not open');
        ['oauth-apple', 'oauth-google', 'oauth-email-toggle', 'oauth-lead', 'oauth-title']
            .forEach(id => assert.equal(disp(sb, id), 'none', id + ' is still drawn on Android'));
        assert.equal(run(sb, 'emailFallbackShown'), true, 'the email card is not shown on Android');
        assert.equal(disp(sb, 'oauth-link-card'), 'none', 'Link Apple / Link Google on Android');
        // The dead end itself: a tap that somehow arrives does nothing at all.
        run(sb, "oauthTap('google')");
        assert.ok(!/Opening/.test(run(sb, "document.getElementById('oauth-google').textContent")), 'Opening... on Android');
    });

    test('Android: no Notifications card', { skip }, () => {
        const sb = accountSheet('android');
        assert.equal(disp(sb, 'notify-card'), 'none');
    });

    test('iOS UNCHANGED: Apple, Google and "Use email instead" are drawn, the email card waits, the card shows', { skip }, () => {
        const sb = accountSheet('ios');
        ['oauth-apple', 'oauth-google', 'oauth-email-toggle', 'oauth-lead', 'oauth-title']
            .forEach(id => assert.notEqual(disp(sb, id), 'none', id + ' was hidden on iOS'));
        assert.equal(run(sb, 'emailFallbackShown'), false, 'iOS opened the email card by itself');
        assert.equal(disp(sb, 'notify-card'), 'block', 'iOS lost its Notifications card');
    });
});

// ---------------------------------------------------------------------------
describe('4. BACK: one layer per press on Android; nothing armed on iOS', () => {

    function home(platform, gps) {
        const sb = windowFor(platform, 'home.html');
        ['v-main', 'v-gps', 'v-games'].forEach(id => sb.__els.set(id, sb.__el(id)));
        sb.__els.get('v-gps').classList.add('on');            // the golfer is on GPS-1
        if (gps) sb.HardPanGps = gps;
        load(sb, 'front-door.js');
        return sb;
    }

    test('Home on Android: each press closes the top layer, then GPS-1 goes to Main, then Main minimises', { skip }, () => {
        const sb = home('android');
        assert.ok(sb.__calls.includes('App.addListener:backButton'), 'Home armed no back button');
        const share = sb.__el('fd-share', ''); const opts = sb.__el('hp-opts', 'flex');
        sb.__els.set('fd-share', share); sb.__els.set('hp-opts', opts);
        pressBack(sb);
        assert.equal(opts.style.display, 'none', 'the Start options sheet closes first');
        assert.equal(share.style.display, '', 'and only it');
        pressBack(sb);
        assert.equal(share.style.display, 'none', 'then Share');
        assert.ok(!sb.__calls.includes('App.minimizeApp'));
        pressBack(sb);
        assert.ok(sb.__els.get('v-main').classList.contains('on'), 'GPS-1 goes back to Main');
        assert.ok(!sb.__calls.includes('App.minimizeApp'), 'GPS-1 must not leave the app');
        pressBack(sb);
        assert.ok(sb.__calls.includes('App.minimizeApp'), 'Main is where a press leaves the app');
    });

    test('Add a game: one press closes Add a game only - the round is not left', { skip }, () => {
        const sb = windowFor('android', 'index.html', { GolfBack: undefined });
        const probes = [];
        sb.GolfBack = { register: p => { probes.push(p); return true; } };
        load(sb, 'front-door.js');
        const fd = probes.find(p => p.name === 'front-door-sheet');
        assert.ok(fd && fd.priority === 1, 'no front-door-sheet probe at priority 1 on a GolfBack page');
        assert.ok(probes.find(p => p.name === 'gps' && p.priority === 4), 'no GPS probe at priority 4');
        const ag = sb.__el('fd-addgame', '');
        sb.__els.set('fd-addgame', ag);
        assert.equal(fd.isOpen(), true);
        fd.close();
        assert.equal(ag.style.display, 'none', 'Add a game did not close');
        assert.equal(fd.isOpen(), false, 'nothing else is claimed');
    });

    test('the GPS map: its sheets first, then the map back to the card - through gps-view.js', { skip }, () => {
        const layers = ['wind', 'map'];
        const gps = { backLayer: () => layers[0] || null, back: () => layers.shift() };
        const sb = home('android', gps);
        sb.__els.get('v-gps').classList.remove('on'); sb.__els.get('v-main').classList.add('on');
        pressBack(sb); assert.deepEqual(layers, ['map'], 'the wind sheet closes first');
        pressBack(sb); assert.deepEqual(layers, [], 'then the map');
        assert.ok(!sb.__calls.includes('App.minimizeApp'));
        const src = read('gps-view.js');
        ["['.gps-wind-sheet', 'wind', function () { closeWindSheet(); }]", "['.gps-addgame', 'add-game', function () { closeAddGame(); }]",
            "if (layer === 'map') { S.userChoseSide = true; showSide('bets'); return layer; }"]
            .forEach(s => assert.ok(src.includes(s), 'gps-view.js: ' + s));
    });

    test('iOS UNCHANGED: front-door.js arms nothing and registers nothing', { skip }, () => {
        const sb = home('ios');
        assert.ok(!sb.__calls.some(c => /^App\.addListener/.test(c)), 'iOS got a back listener');
        const s2 = windowFor('ios', 'index.html');
        const probes = [];
        s2.GolfBack = { register: p => { probes.push(p); return true; } };
        load(s2, 'front-door.js');
        assert.deepEqual(probes, [], 'iOS got back probes');
    });

    // pwa-boot.js: what an empty press does at a page's top level.
    function boot(platform, page) {
        const sb = windowFor(platform, page);
        load(sb, 'pwa-boot.js');
        return sb;
    }
    test('Android: a page Home opens goes to Home; a screen opened from a round goes back', { skip }, () => {
        const sb = boot('android', 'index.html');
        assert.equal(sb.GolfBack.press({ canGoBack: true }), 'home');
        assert.equal(sb.location.href, 'home.html');
        assert.ok(!sb.__calls.includes('history.back'), 'the round went back through history');
        const s2 = boot('android', 'settlement.html');
        assert.equal(s2.GolfBack.press({ canGoBack: true }), 'history');
        const s3 = boot('android', 'admin.html');
        assert.equal(s3.GolfBack.press({ canGoBack: false }), 'home');
        assert.ok(!s3.__calls.includes('App.minimizeApp'), 'only Home minimises on Android');
    });
    test('iOS UNCHANGED: history.back() when it can, minimise when it cannot', { skip }, () => {
        const sb = boot('ios', 'index.html');
        assert.equal(sb.GolfBack.press({ canGoBack: true }), 'history');
        const s2 = boot('ios', 'index.html');
        assert.equal(s2.GolfBack.press({ canGoBack: false }), 'minimize');
    });

    test('the Setup Coach and the Round Menu register only on Android', { skip }, () => {
        const a = read('admin.html'), i = read('index.html');
        assert.match(a, /if \(window\.GolfBack && isAndroidShell\(\)\) window\.GolfBack\.register\(\{\s*name: 'coach-step', priority: 5,[\s\S]{0,260}close: function \(\) \{ coachBack\(\); \}/);
        assert.match(i, /window\.Capacitor\.getPlatform\(\) === 'android'\) window\.GolfBack\.register\(\{\s*name: 'round-sheet', priority: 3,[\s\S]{0,220}close: function \(\) \{ toggleRoundSheet\(false\); \}/);
    });
});

// ---------------------------------------------------------------------------
// G3 (job 003): auth-boot.js's zero-delay start ran before the page's inline
// initializeApp on Android, fb.auth() threw "no Firebase App", authReady rejected,
// and admin.html refused setup to the round's own creator.
describe('G3. AUTH BOOT: Android tries again after load; iOS fails as before', () => {
    function bootAuth(platform) {
        const sb = windowFor(platform, 'admin.html');
        sb.document.readyState = 'loading';
        const onLoad = [];
        sb.addEventListener = (name, fn) => { if (name === 'load') onLoad.push(fn); };
        let initialized = false;
        const auth = {
            onAuthStateChanged(cb) { cb(null); return () => {}; },
            signInAnonymously: () => Promise.resolve({ user: { uid: 'anon-9' } })
        };
        sb.firebase = {
            auth() {
                if (!initialized) throw Object.assign(new Error("No Firebase App '[DEFAULT]' has been created"), { code: 'app/no-app' });
                return auth;
            }
        };
        load(sb, 'auth-boot.js');
        return { sb, onLoad, init: () => { initialized = true; } };
    }

    test('Android: "no Firebase App" waits for load, then signs in - authReady resolves', { skip }, async () => {
        const { sb, onLoad, init } = bootAuth('android');
        sb.__advance(0);                         // the zero-delay start, mid-parse
        await settle();
        assert.equal(sb.authBootState.status, 'pending', 'it gave up before the page loaded');
        assert.equal(onLoad.length, 1, 'no second try was armed for load');
        init();                                  // the page's inline initializeApp has run
        sb.document.readyState = 'complete';
        onLoad.forEach(f => f());
        sb.__advance(0);
        await settle();
        assert.equal(sb.authBootState.status, 'signed-in');
        assert.equal(await sb.authReady, 'anon-9');
    });

    test('iOS UNCHANGED: the same error fails at once, as "auth-unavailable"', { skip }, async () => {
        const { sb, onLoad } = bootAuth('ios');
        sb.__advance(0);
        await settle();
        assert.equal(sb.authBootState.status, 'failed');
        assert.equal(sb.authBootState.reason, 'auth-unavailable');
        assert.equal(onLoad.length, 0, 'iOS armed a retry');
        await assert.rejects(sb.authReady);
    });
});

// ---------------------------------------------------------------------------
describe('5. THE STATUS BAR: Android only, native, no page CSS changed', () => {
    test('SystemBars does no inset handling; MainActivity pads the WebView between the bars', () => {
        const cfg = read('capacitor.config.ts');
        assert.match(cfg, /SystemBars: \{\s*insetsHandling: 'disable'\s*\}/);
        const m = read('android/app/src/main/java/com/rattlegolf/app/MainActivity.java');
        assert.match(m, /ViewCompat\.setOnApplyWindowInsetsListener\(frame,/);
        assert.match(m, /v\.setPadding\(bars\.left, bars\.top, bars\.right, Math\.max\(bars\.bottom, ime\.bottom\)\);/);
        assert.match(m, /\.setInsets\(types, Insets\.NONE\)/, 'the WebView must see zero insets, not consumed ones');
    });
    test('iOS UNCHANGED: Capacitor iOS reads no insetsHandling key', () => {
        const ios = path.join(__dirname, 'node_modules', '@capacitor', 'ios');
        if (!fs.existsSync(ios)) return;
        const hit = [];
        const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p); else if (/\.(swift|m|h)$/.test(e.name) && /insetsHandling/.test(fs.readFileSync(p, 'utf8'))) hit.push(p);
        });
        walk(ios);
        assert.deepEqual(hit, [], 'an iOS source reads insetsHandling, so the config key reaches iOS');
    });
});

// ---------------------------------------------------------------------------
// JOB 006 (from the 005 plan): an email sign-in link opens the app on Android.
describe('B. APP LINKS: the email sign-in link opens the app on Android only', () => {
    const KEY = 'K', CODE = 'TESTCODE123';
    const inner = 'https://golfapp-9fb21.firebaseapp.com/__/auth/action?apiKey=' + KEY + '&mode=signIn&oobCode=' + CODE
        + '&continueUrl=https://golf-app-5a5.pages.dev/admin.html&lang=en';
    const wrapper = 'https://golfapp-9fb21.firebaseapp.com/__/auth/links?link=' + encodeURIComponent(inner);
    const want = 'admin.html?apiKey=' + KEY + '&mode=signIn&oobCode=' + CODE
        + '&continueUrl=https%3A%2F%2Fgolf-app-5a5.pages.dev%2Fadmin.html&lang=en&account=1';

    test('Android, warm start: appUrlOpen with the link reopens admin.html with its own sign-in query, once', { skip }, () => {
        const sb = windowFor('android', 'home.html');
        sb.__els.set('v-main', sb.__el('v-main')); sb.__els.get('v-main').classList.add('on');
        load(sb, 'front-door.js');
        const open = sb.__listeners.appUrlOpen || [];
        assert.equal(open.length, 1, 'no appUrlOpen listener on Android');
        open[0]({ url: wrapper });
        assert.equal(sb.location.href, want, 'the link did not go to the existing email-link finish');
        sb.location.href = 'home.html';
        open[0]({ url: wrapper });
        assert.equal(sb.location.href, 'home.html', 'the same code was handled twice');
    });

    test('Android, cold start: getLaunchUrl carries the link the same way', { skip }, async () => {
        const sb = windowFor('android', 'home.html', { launchUrl: wrapper });
        sb.__els.set('v-main', sb.__el('v-main')); sb.__els.get('v-main').classList.add('on');
        load(sb, 'front-door.js');
        await settle();
        assert.ok(sb.__calls.includes('App.getLaunchUrl'));
        assert.equal(sb.location.href, want);
    });

    test('Android: anything that is not a sign-in link on our host is ignored', { skip }, () => {
        const sb = windowFor('android', 'home.html');
        load(sb, 'front-door.js');
        const t = sb.HardPanLinks.target;
        assert.equal(t('https://golfapp-9fb21.firebaseapp.com/__/auth/handler?x=1'), null);
        assert.equal(t('https://evil.example.com/__/auth/links?link=' + encodeURIComponent(inner)), null);
        assert.equal(t('https://golfapp-9fb21.firebaseapp.com/__/auth/links?link=' + encodeURIComponent(inner.replace('golfapp-9fb21.firebaseapp.com', 'evil.example.com'))), null, 'our host wrapping a foreign inner link');
        assert.equal(t('https://golfapp-9fb21.firebaseapp.com/__/auth/links?link=' + encodeURIComponent(inner.replace('mode=signIn', 'mode=resetPassword'))), null);
        assert.equal(t('http://golfapp-9fb21.firebaseapp.com/__/auth/links?link=' + encodeURIComponent(inner)), null);
        assert.equal(t(inner), want, 'the inner action link alone is accepted too');
    });

    test('iOS UNCHANGED: no appUrlOpen listener, no getLaunchUrl', { skip }, () => {
        const sb = windowFor('ios', 'home.html', { launchUrl: wrapper });
        load(sb, 'front-door.js');
        assert.equal((sb.__listeners.appUrlOpen || []).length, 0);
        assert.ok(!sb.__calls.includes('App.getLaunchUrl'));
    });

    test('ActionCodeSettings: Android = the old settings; website and iOS = the old settings minus `android` (job 009)', () => {
        const { loadJsFile } = require('./helpers/load-script.js');
        const sb = loadJsFile('email-link-auth.js', []);
        const url = 'https://golf-app-5a5.pages.dev/admin.html';
        const as = (cap) => { sb.Capacitor = sb.window.Capacitor = cap; return JSON.stringify(sb.emailLinkAuth.actionCodeSettings(url)); };
        const web = as(undefined);
        const ios = as({ getPlatform: () => 'ios', isNativePlatform: () => true, Plugins: {} });
        const android = as({ getPlatform: () => 'android', isNativePlatform: () => true, Plugins: {} });
        const old = { url, handleCodeInApp: true, iOS: { bundleId: 'com.rattlegolf.app' }, android: { packageName: 'com.rattlegolf.app', installApp: false } };
        const withoutAndroid = Object.assign({}, old); delete withoutAndroid.android;
        assert.equal(android, JSON.stringify(old), 'the Android app must send exactly the old settings');
        assert.equal(web, JSON.stringify(withoutAndroid), 'the website: the old settings minus android, nothing else');
        assert.equal(ios, JSON.stringify(withoutAndroid), 'iOS: the old settings minus android, nothing else');
    });

    test('the manifest hands /__/auth/links on the Firebase Hosting domain to MainActivity, autoVerify', () => {
        const m = read('android/app/src/main/AndroidManifest.xml');
        assert.match(m, /<intent-filter android:autoVerify="true">\s*<action android:name="android\.intent\.action\.VIEW" \/>\s*<category android:name="android\.intent\.category\.DEFAULT" \/>\s*<category android:name="android\.intent\.category\.BROWSABLE" \/>\s*<data android:scheme="https" android:host="golfapp-9fb21\.firebaseapp\.com" android:pathPrefix="\/__\/auth\/links" \/>\s*<\/intent-filter>/);
        const act = m.slice(m.indexOf('android:name=".MainActivity"'), m.indexOf('</activity>'));
        assert.ok(act.includes('android:pathPrefix="/__/auth/links"'), 'the filter is not on MainActivity');
    });
});

// ---------------------------------------------------------------------------
// 012. NO TRIAL, NO PASS, NO APPLE OR GOOGLE IN THE ANDROID ACCOUNT WORDS (job 012).
// The Play listing promises no trial and sells nothing; the Android app signs in by
// email alone. admin.html is reached the way a golfer reaches it: the page's own load
// renders the standing line (its own loadOrganizerStanding, with the real
// organizer-gate.js and only the record read stubbed), and the Account link's own
// onclick opens the sheet. account-exit.js is read as Android or iOS before it parses.
// CANNOT PROVE: mini-dom does not parse static text, so the iOS lead is checked as
// "untouched" plus the markup itself; email-link-auth.js's notes are NOT changed
// (a frozen-hash file, held for Manny's per-file OK) and nothing here covers them.
// BASELINE (whole file, 31 tests): against pre-012 admin.html b5850e00020f and account-exit.js
// 5d1c7fc39dfe, 27 pass / 4 fail - the 4 are this block's Android tests; its 3 iOS/web tests pass
// before and after, as they must (24 older + 3 = 27). After the change: 31 / 0.
// ---------------------------------------------------------------------------
describe('012. THE ANDROID ACCOUNT WORDS: no trial, no pass, email only', () => {
    const run = (sb, expr) => vm.runInContext(expr, sb);
    const NO_PROMISE = /trial|founder|\bpass\b/i;
    function arrive(platform) {
        const sb = loadHtmlInlineScript('admin.html', [], {
            beforeRun: s => {
                s.Capacitor = s.window.Capacitor = { getPlatform: () => platform, isNativePlatform: () => true, Plugins: {} };
                vm.runInContext(read('organizer-gate.js'), s, { filename: 'organizer-gate.js' });
                // A live trial, one day in: the record a new organizer has.
                s.window.organizerGate.readStanding = () => Promise.resolve({ firstSeenAt: Date.now() - 86400000 });
            }
        });
        return sb;
    }
    const openAccount = sb => {
        run(sb, "window.firebase = { auth: function () { return { currentUser: null }; } };");
        const m = /id="account-link"[^>]*onclick="([^"]+)"/.exec(read('admin.html'));
        assert.ok(m, 'the Account link is not in the markup');
        run(sb, m[1]);
    };
    const txt = (sb, id) => run(sb, "document.getElementById('" + id + "').textContent");

    test('Android: the trial / pass line is empty on the lobby, Review and Round Ready', { skip }, async () => {
        const sb = arrive('android');
        await flush(); await flush();
        ['lobby-standing', 'wz-standing', 'rr-standing'].forEach(id => assert.equal(txt(sb, id), '', id + ' speaks on Android'));
    });

    test('iOS and the website too since job 021: the same arrival is empty on all three (the line is retired everywhere)', { skip }, async () => {
        for (const platform of ['ios', 'web']) {
            const sb = arrive(platform);
            await flush(); await flush();
            ['lobby-standing', 'wz-standing', 'rr-standing'].forEach(id => assert.equal(txt(sb, id), '', id + ' speaks on ' + platform));
        }
    });

    test('Android: the signed-out email lead promises no trial or pass', { skip }, async () => {
        const sb = arrive('android');
        await flush();
        openAccount(sb);
        const lead = txt(sb, 'email-link-lead');
        assert.match(lead, /exists only on this phone\. Email yourself a link/, 'the Android lead was not written');
        assert.ok(!NO_PROMISE.test(lead), 'the Android lead promises: ' + lead);
    });

    test('iOS UNCHANGED: the lead is left to its markup, which still names the trial and the pass', { skip }, async () => {
        const sb = arrive('ios');
        await flush();
        openAccount(sb);
        assert.equal(txt(sb, 'email-link-lead'), '', 'iOS had its lead rewritten');
        assert.match(read('admin.html'), /<p id="email-link-lead">This browser's organizer account exists only here\. Email yourself a link &mdash; the free trial and a founder pass stay with the rounds already set up on it\.<\/p>/);
    });

    test('the signed-in lead: Android says "the same email"; the iOS sentence is the old one, byte for byte', () => {
        const src = read('admin.html');
        assert.match(src, /isAndroidShell\(\)\s*\? 'Signed in\. To put this same organizer on another phone or browser, sign out here first and then sign in over there with the same email\.'/);
        assert.match(src, /: 'Signed in\. To put this same organizer on another phone or browser, sign out here first and then sign in over there with the same Apple ID, Google account or email\.'\);/);
    });

    function exitWords(platform) {
        const sb = windowFor(platform, 'admin.html');
        if (platform === 'web') delete sb.Capacitor;
        load(sb, 'account-exit.js');
        return sb.accountExit;
    }
    const linked = { uid: 'u1', isAnonymous: false, email: 'golfer@example.com',
        providerData: [{ providerId: 'apple.com' }, { providerId: 'google.com' }, { providerId: 'password' }] };

    test('Android: sign-out and delete warnings say "the same email", trial-free, and no providers are named', { skip }, () => {
        const a = exitWords('android');
        ['signOutWarn', 'deleteWarn2', 'founderWarn'].forEach(k => {
            assert.match(a.WORDS[k], /the same email/, k + ' was not rewritten');
            assert.ok(!/Apple|Google/.test(a.WORDS[k]), k + ' still names Apple or Google');
        });
        ['signOutWarn', 'deleteWarn2', 'founderMaybe', 'founderUnknown'].forEach(k =>
            assert.ok(!/trial/i.test(a.WORDS[k]), k + ' raises a trial on Android'));
        assert.equal(a.describeAccount(linked), 'Signed in as golfer@example.com');
    });

    test('iOS and the website UNCHANGED: every word identical to each other and to the old text', { skip }, () => {
        const i = exitWords('ios'), w = exitWords('web');
        assert.deepEqual(Object.assign({}, i.WORDS), Object.assign({}, w.WORDS));
        assert.match(i.WORDS.signOutWarn, /the same Apple ID, Google account or email\.$/);
        assert.match(i.WORDS.founderMaybe, /^If this account has a founder pass or a running free trial/);
        assert.equal(i.describeAccount(linked), 'Signed in as golfer@example.com (Apple and Google and email)');
        assert.equal(w.describeAccount(linked), 'Signed in as golfer@example.com (Apple and Google and email)');
    });
});

// ---------------------------------------------------------------------------
// 015. THE DAY-22 WALL AND THE SIGN-IN NOTES, ANDROID WORDS (job 015).
// The wall is reached the way a golfer reaches it: the wizard's own Save, the round
// write refused, the uid's own record read back 22 days on. The sign-in note is
// reached by ARRIVING on the email-link URL; the page finishes it by itself.
// window.Capacitor exists before any script parses (helpers/load-script.js
// beforeScripts), as it does in the native shell.
// CANNOT PROVE: the refusal itself (that is the live rules; wave2_rules_test.js holds
// the rules file, including EXPIRED1 - an expired owner still edits an existing round).
// JOB 021 SUPERSEDES THE WALL HALF: the wall is gone on every platform (the live rules have
// no 21-day window). The two wall tests below now hold that a refused day-22 save says its
// own error on android, ios and web alike. The sign-in-note half is unchanged.
// BASELINE (whole file, 35 tests): against pre-015 email-link-auth.js e5ae7c217885 and
// organizer-gate.js 4042160ee3dd, 33 pass / 2 fail - the 2 are this block's Android tests;
// its 2 iOS/web tests pass before and after (31 older + 2 = 33). After the change: 35 / 0.
// ---------------------------------------------------------------------------
describe('015/021. No wall on any platform; the Android sign-in notes name no trial or pass', () => {
    const DAY = 86400000;
    const settle = () => new Promise(r => setTimeout(r, 30));
    const DENIED = () => Object.assign(new Error('PERMISSION_DENIED: Permission denied'), { code: 'PERMISSION_DENIED' });
    const cap = platform => s => {
        if (platform !== 'web') s.Capacitor = s.window.Capacitor = { getPlatform: () => platform, isNativePlatform: () => true, Plugins: {} };
    };
    const SELLS = /\$|\d+\.\d\d|trial|\bpass(es)?\b|purchase|\bbuy\b|price|subscri|on sale/i;

    async function wallFor(platform) {
        const sb = loadHtmlInlineScript('admin.html', ['pwa-boot.js'], { search: '?game=GATE01', beforeScripts: cap(platform) });
        vm.runInContext(`
            window.__alerts = []; window.alert = function (m) { window.__alerts.push(String(m)); }; uiRefuse = alert; uiFail = alert; uiToast = alert;
            window.crypto = { getRandomValues: function (a) { for (var i = 0; i < a.length; i++) a[i] = (i * 37) & 255; return a; } };
            var key = Object.keys(coursePresets)[0];
            courseHiddenSelect.value = key; courseSearchInput.value = coursePresets[key].name;
            window.__btn = document.getElementById('main-save-btn'); window.__btn.innerText = '💾 Save & Start Round';
        `, sb);
        sb.__dbRefuse = (p) => (p === 'events/GATE01' ? DENIED() : null);
        sb.__dbReads = { 'organizers/anon-stub': { firstSeenAt: Date.now() - 22 * DAY } };
        // The golfer presses Save & Start Round: the button's own handler.
        vm.runInContext('saveSettings();', sb);
        for (let i = 0; i < 20; i++) await settle();
        return sb.window.__alerts;
    }

    test('Android, day 22, Save refused: its own error, nothing priced, no wall (job 021)', { skip }, async () => {
        const alerts = await wallFor('android');
        assert.equal(alerts.length, 1, JSON.stringify(alerts));
        assert.match(alerts[0], /^Save error: PERMISSION_DENIED/);
        assert.ok(!SELLS.test(alerts[0]), 'the refusal sells or prices something: ' + alerts[0]);
    });

    test('iOS and the website: the same refusal says the same thing - no wall there either (job 021)', { skip }, async () => {
        const ios = await wallFor('ios'), web = await wallFor('web');
        assert.equal(ios.length, 1); assert.equal(JSON.stringify(ios), JSON.stringify(web));
        assert.match(ios[0], /^Save error: PERMISSION_DENIED/);
        assert.ok(!/free trial has ended|\$29\.99|\$19\.99/.test(ios[0]));
    });

    const LINK = '?apiKey=test-key&oobCode=oob-wave1&mode=signIn&lang=en';
    async function arriveOnLink(platform) {
        const sb = loadHtmlInlineScript('admin.html', [], {
            search: LINK, localStorage: true,
            seedStorage: { golfapp_email_for_sign_in: 'marty@example.com', golfapp_email_link_uid: 'anon-stub' },
            beforeScripts: cap(platform),
            beforeRun(s) {
                s.firebase.auth.EmailAuthProvider = { credentialWithLink(email, url) { return { email, url, providerId: 'password' }; } };
                const user = s.firebase.auth().currentUser;
                user.linkWithCredential = (cred) => { user.isAnonymous = false; user.email = cred.email; return Promise.resolve({ user: { uid: user.uid, isAnonymous: false, email: cred.email } }); };
            }
        });
        for (let i = 0; i < 40; i++) await settle();
        return sb;
    }

    test('Android: arriving on the link signs in and the note on screen names no trial or pass', { skip }, async () => {
        const sb = await arriveOnLink('android');
        const shown = sb.document.getElementById('email-link-status').textContent;
        assert.equal(shown, 'Signed in. This is the same organizer account. Rounds you already set up stay yours.');
        const e = sb.emailLinkAuth;
        [e.NOTE_PRESERVED, e.NOTE_ADOPTED, e.NOTE_FRESH, e.NOTE_SENT].forEach(n => {
            assert.ok(n && n.length > 5, 'a note is empty');
            assert.ok(!/trial|founder|\bpass\b/i.test(n), 'Android note: ' + n);
        });
    });

    test('iOS and the website UNCHANGED: the same arrival shows the old note; all four notes identical on both', { skip }, async () => {
        const ios = await arriveOnLink('ios'), web = await arriveOnLink('web');
        assert.equal(ios.document.getElementById('email-link-status').textContent,
            'Signed in. This is the same organizer account, so the free trial and a founder pass stay with you. Rounds you already set up stay yours.');
        ['NOTE_PRESERVED', 'NOTE_ADOPTED', 'NOTE_FRESH', 'NOTE_SENT'].forEach(k => assert.equal(ios.emailLinkAuth[k], web.emailLinkAuth[k], k));
        assert.match(ios.emailLinkAuth.NOTE_SENT, /leave the free trial and a founder pass behind\.$/);
    });
});
