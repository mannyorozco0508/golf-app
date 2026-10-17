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

    test('ActionCodeSettings are byte-for-byte the same on the website, iOS and Android (unchanged)', () => {
        const { loadJsFile } = require('./helpers/load-script.js');
        const sb = loadJsFile('email-link-auth.js', []);
        const url = 'https://golf-app-5a5.pages.dev/admin.html';
        const as = (cap) => { sb.Capacitor = sb.window.Capacitor = cap; return JSON.stringify(sb.emailLinkAuth.actionCodeSettings(url)); };
        const web = as(undefined);
        const ios = as({ getPlatform: () => 'ios', isNativePlatform: () => true, Plugins: {} });
        const android = as({ getPlatform: () => 'android', isNativePlatform: () => true, Plugins: {} });
        const before = JSON.stringify({ url, handleCodeInApp: true, iOS: { bundleId: 'com.rattlegolf.app' }, android: { packageName: 'com.rattlegolf.app', installApp: false } });
        assert.equal(web, before, 'the website ActionCodeSettings changed');
        assert.equal(ios, before, 'the iOS ActionCodeSettings changed');
        assert.equal(android, before);
    });

    test('the manifest hands /__/auth/links on the Firebase Hosting domain to MainActivity, autoVerify', () => {
        const m = read('android/app/src/main/AndroidManifest.xml');
        assert.match(m, /<intent-filter android:autoVerify="true">\s*<action android:name="android\.intent\.action\.VIEW" \/>\s*<category android:name="android\.intent\.category\.DEFAULT" \/>\s*<category android:name="android\.intent\.category\.BROWSABLE" \/>\s*<data android:scheme="https" android:host="golfapp-9fb21\.firebaseapp\.com" android:pathPrefix="\/__\/auth\/links" \/>\s*<\/intent-filter>/);
        const act = m.slice(m.indexOf('android:name=".MainActivity"'), m.indexOf('</activity>'));
        assert.ok(act.includes('android:pathPrefix="/__/auth/links"'), 'the filter is not on MainActivity');
    });
});
