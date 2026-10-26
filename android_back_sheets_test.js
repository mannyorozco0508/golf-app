// ============================================================================
// ANDROID HARDWARE BACK OVER THE 2.0 SHEETS (android-2.0, 024 C)
//   0.2 gave Back one layer per press for the screens it had (android_gps_fixes_test.js).
//   2.0 opens many more sheets over a page: sign-in and Profile, the needs-an-account ask,
//   Customize, voice, scan, the score sheet, Range, the launch-monitor entry, Mark shot,
//   shot history, Stats, My stats and its ask, the Strokes Gained explainer, the new-round
//   flow and its "End your round?" ask. One press now closes the TOPMOST of them, the way
//   its own Close / Not now / tap-outside does - never the page under it, never the app.
//   Each sheet is reached the way the hardware button reaches it: the App plugin's
//   backButton listener that front-door.js arms on Home. No page function is called here.
//   Add-on port (071b / 073): + 'confirm' (the app's "Are you sure?") and 'pars-start' (071b's pars sheet
//   in #sf). 41 tests, 41 pass. Controls: no 'confirm' row -> 39 / 2; no 'pars-start' row -> 39 / 2.
//   What this harness cannot prove: that each file's own isOpen() matches what is on a real
//   screen. That is the emulator pass (each sheet opened by tapping, then Back).
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'front-door.js'));
const skip = ON ? false : 'Consumer tree: no front doors';

function el(id, display, log) {
    const kids = {};
    const e = {
        id, style: { display: display === undefined ? '' : display }, innerHTML: '', children: [],
        classList: { contains: () => false, add() {}, remove() {}, toggle() {} },
        setAttribute() {}, getAttribute() { return null; }, addEventListener() {}, appendChild(x) { this.children.push(x); return x; },
        querySelector: sel => kids[sel] || null, querySelectorAll() { return []; }, closest() { return null; },
        click() { log.push('click:' + id); }, remove() { log.push('remove:' + id); },
        __kid(sel, k) { kids[sel] = k; return k; }
    };
    return e;
}

function homeOnAndroid(platform, open, extra) {
    const log = [];
    const listeners = {};
    const els = new Map();
    const docSel = {};
    const App = {
        addListener(name, fn) { (listeners[name] = listeners[name] || []).push(fn); return { remove() {} }; },
        minimizeApp() { log.push('minimizeApp'); },
        getLaunchUrl() { return Promise.resolve(undefined); }
    };
    const W = {
        Capacitor: { getPlatform: () => platform, isNativePlatform: () => platform !== 'web', Plugins: { Geolocation: {}, App } },
        location: { pathname: '/' + ((extra && extra.__page) || 'home.html'), search: '', href: (extra && extra.__page) || 'home.html', replace() {} },
        history: { back() { log.push('history.back'); } },
        navigator: { onLine: true },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        document: {
            readyState: 'complete',
            getElementById: id => els.get(id) || null,
            createElement: () => el('', '', log),
            querySelector: sel => docSel[sel] || null, querySelectorAll: () => [],
            addEventListener() {}, documentElement: el('html', '', log), head: el('head', '', log), body: el('body', '', log)
        },
        setTimeout() { return 0; }, clearTimeout() {}, addEventListener() {}, scrollTo() {}, console,
        URL, URLSearchParams, Promise, JSON, Math, Date, String, Number, Array, Object, RegExp, Error
    };
    W.window = W;
    if (extra) Object.assign(W, extra);
    // Home's Main view is on (nothing of Home's own is open).
    const views = (extra && extra.__views) || { main: true };
    Object.keys(views).forEach((v) => { const e = el('v-' + v, '', log); const on = new Set(views[v] ? ['on'] : []); e.classList.contains = c => on.has(c); e.classList.add = c => on.add(c); e.classList.remove = c => on.delete(c); e.classList.toggle = (c, f) => { const w = f === undefined ? !on.has(c) : !!f; if (w) on.add(c); else on.delete(c); return w; }; els.set('v-' + v, e); });
    // The 2.0 files' own APIs, each reporting closed unless the test opens it.
    const is = name => open.indexOf(name) !== -1;
    W.HardPanVoice = { isOpen: () => is('voice'), cancel: () => log.push('close:voice') };
    W.HardPanNeedsAccount = { isOpen: () => is('needs-account') };
    if (is('needs-account')) docSel['[data-hpna-scrim]'] = Object.assign(el('hpna-scrim', '', log), { click: () => log.push('close:needs-account') });
    W.HardPanAccountUI = { isOpen: () => (is('account') ? 'signin' : null), close: () => log.push('close:account') };
    if (is('scan')) els.set('hp-scan', el('hp-scan', '', log));
    W.HardPanScan = { close: () => log.push('close:scan') };
    if (is('sg-info')) { const o = el('hp-sg-info', '', log); o.__kid('button', Object.assign(el('got-it', '', log), { click: () => log.push('close:sg-info') })); els.set('hp-sg-info', o); }
    const my = el('hp-my-stats', is('my-stats') || is('my-stats-ask') ? '' : 'none', log);
    if (is('my-stats-ask')) my.__kid('.ms-ask', Object.assign(el('ms-ask', '', log), { remove: () => log.push('close:my-stats-ask') }));
    els.set('hp-my-stats', my);
    if (is('customize')) docSel['.hpf-sheet'] = el('hpf-sheet', '', log);
    W.HardPanFeatures = { closePanel: () => log.push('close:customize') };
    W.HardPanShotBag = { historyOpen: () => is('shot-history'), closeHistory: () => log.push('close:shot-history') };
    W.HardPanMark = { sheetOpen: () => is('mark'), closeSheet: () => log.push('close:mark') };
    W.HardPanLaunchEntry = { isOpen: () => is('launch-entry'), close: () => log.push('close:launch-entry') };
    W.HardPanRange = { isOpen: () => is('range'), close: () => log.push('close:range'), closeHome: () => log.push('close:range-home') };
    els.set('hp-range', el('hp-range', is('range-home') ? '' : 'none', log));
    els.set('hp-score-sheet', Object.assign(el('hp-score-sheet', is('score-sheet') ? '' : 'none', log), { click: () => log.push('close:score-sheet') }));
    W.HardPanGpsStats = { isOpen: () => is('stats'), close: () => log.push('close:stats'), closeMy: () => log.push('close:my-stats') };
    // The add-ons (071b / 073): the app's own "Are you sure?" and the Start pars sheet inside #sf.
    if (is('confirm')) { const u = el('ui-sheet', '', log); u.classList.contains = c => c === 'open'; u.__kid('#ui-sheet-no', Object.assign(el('ui-sheet-no', '', log), { click: () => log.push('close:confirm') })); els.set('ui-sheet', u); }
    if (is('pars-start')) { const sp = el('sf-pars', '', log); sp.__kid('[data-sf=parscancel]', Object.assign(el('parscancel', '', log), { click: () => log.push('close:pars-start') })); els.set('sf-pars', sp); }
    if (is('new-round-ask')) els.set('sf-ask', Object.assign(el('sf-ask', '', log), { click: () => log.push('close:new-round-ask') }));
    const sf = el('sf', is('new-round') ? '' : 'none', log);
    if (is('new-round')) { const b = Object.assign(el('sf-back', '', log), { click: () => log.push('close:new-round') }); sf.__kid('.sf-back', b); docSel['#sf .sf-back'] = b; }
    els.set('sf', sf);
    const sb = vm.createContext(W);
    vm.runInContext(read('front-door.js'), sb, { filename: 'front-door.js' });
    return { sb, log, press: () => (listeners.backButton || []).forEach(fn => fn({ canGoBack: true })), listeners };
}

const SHEETS = ['confirm', 'pars-start', 'voice', 'needs-account', 'account', 'scan', 'sg-info', 'my-stats-ask', 'customize', 'shot-history', 'mark',
    'launch-entry', 'range', 'range-home', 'score-sheet', 'stats', 'my-stats', 'new-round-ask', 'new-round'];

describe('ANDROID: one Back press closes the top 2.0 sheet, and only that', () => {
    for (const name of SHEETS) {
        test(name + ': Back closes it, the app stays open', { skip }, () => {
            const h = homeOnAndroid('android', [name]);
            assert.ok((h.listeners.backButton || []).length === 1, 'Home arms one Back listener');
            h.press();
            assert.deepEqual(h.log, ['close:' + name]);
        });
    }
    test('topmost first: with the voice sheet over the score sheet, one press closes voice only', { skip }, () => {
        const h = homeOnAndroid('android', ['score-sheet', 'voice']);
        h.press();
        assert.deepEqual(h.log, ['close:voice']);
    });
    test('the ask before the flow: "End your round?" over the new-round flow closes the ask only', { skip }, () => {
        const h = homeOnAndroid('android', ['new-round', 'new-round-ask']);
        h.press();
        assert.deepEqual(h.log, ['close:new-round-ask']);
    });
    test('add-ons: the app\'s "Are you sure?" (073 End round) over the score sheet closes the ask only - its cancel, never yes', { skip }, () => {
        const h = homeOnAndroid('android', ['score-sheet', 'confirm']);
        h.press();
        assert.deepEqual(h.log, ['close:confirm']);
    });
    test('add-ons: 071b\'s pars sheet inside the new-round flow is its "Not now", not the flow\'s own back', { skip }, () => {
        const h = homeOnAndroid('android', ['new-round', 'pars-start']);
        h.press();
        assert.deepEqual(h.log, ['close:pars-start']);
    });
    test('nothing open on Home Main: Back minimises the app, as in 0.2', { skip }, () => {
        const h = homeOnAndroid('android', []);
        h.press();
        assert.deepEqual(h.log, ['minimizeApp']);
    });
});

describe('iOS UNCHANGED: no Back listener at all', () => {
    test('iOS: front-door.js arms nothing, whatever is open', { skip }, () => {
        const h = homeOnAndroid('ios', ['voice', 'account']);
        assert.equal((h.listeners.backButton || []).length, 0);
    });
});

describe('the names the Back table relies on still exist in each file', () => {
    // A rename in one of these files would leave Back calling nothing; this goes red instead.
    const need = {
        'gps-voice.js': [/isOpen: function \(\) \{ return st\.open; \}/, /cancel: cancel/],
        'hp-needs-account.js': [/isOpen: function \(\) \{ return !!open; \}/, /data-hpna-scrim/],
        'hp-account-ui.js': [/close: close,/, /isOpen: function \(\) \{ return open; \}/],
        'gps-scan-grid.js': [/var ID = 'hp-scan';/, /close: close,/],
        'gps-stats.js': [/o\.id = 'hp-sg-info'/, /ok\.onclick = function \(\) \{ o\.remove\(\); \};/, /page\.id = 'hp-my-stats';/, /closeMy: closeMy/, /isOpen: function \(\) \{ return !!\(sheet/, /wrap\.id = 'hp-score-sheet';/, /if \(t === ss\.wrap\) \{ ssClose\(\); return; \}/],
        'feature-registry.js': [/closePanel: closePanel/, /sh\.className = 'hpf-sheet hpf-small'/],
        'gps-shot-bag.js': [/closeHistory: histClose, historyOpen: function/],
        'gps-mark-distance.js': [/closeSheet: function \(\) \{ st\.sheet = false; paint\(\); \}/, /sheetOpen: function/],
        'gps-bushnell.js': [/var api = \{ open: open, close: close, isOpen: isOpen/],
        'gps-range.js': [/var api = \{ open: open, close: close, isOpen: isOpen/, /closeHome: closeHome/, /box\.id = 'hp-range'/],
        'simple-flow.js': [/<div id="sf-ask" data-sf="askclose"/, /class="sf-back" data-sf="back"/, /e\.id = 'sf';/]
    };
    for (const f of Object.keys(need)) {
        test(f, { skip }, () => { const src = read(f); need[f].forEach(re => assert.match(src, re)); });
    }
});

describe('ANDROID: the map in a 2.0 round leaves Back to the round (no map <-> card loop)', () => {
    // Measured on the emulator (2026-10-25): with 0.2's "map -> card" layer AND gps-round.js's own
    // round Back (the screen before, then the Round Menu), Back went map -> card -> map forever.
    // On a round page front-door.js registers its probes with pwa-boot's GolfBack; these are read
    // the way pwa-boot reads them (isOpen), and nothing of the page is called.
    function probesOn(opts) {
        const probes = [];
        const gps = { backLayer: () => opts.layer, back: () => 'x' };
        const extra = { __page: 'index.html', GolfBack: { register: (p) => { probes.push(p); return true; } }, HardPanGps: gps };
        if (opts.round) { extra.HardPanRound = { openMenu() {} }; extra.HardPanBet = { on: () => true }; }
        homeOnAndroid('android', [], extra);
        return probes.reduce((o, p) => { o[p.name] = p; return o; }, {});
    }
    test('2.0 round on: the map is the round\'s (the GPS probe stands aside)', { skip }, () => {
        const p = probesOn({ layer: 'map', round: true });
        assert.ok(p.gps, 'front-door registers its GPS probe');
        assert.equal(p.gps.isOpen(), false);
    });
    test('2.0 round on: a GPS sheet over the map still closes here (wind)', { skip }, () => {
        assert.equal(probesOn({ layer: 'wind', round: true }).gps.isOpen(), true);
    });
    test('no 2.0 round Back (0.2 screens): the map still goes to the card here', { skip }, () => {
        assert.equal(probesOn({ layer: 'map', round: false }).gps.isOpen(), true);
    });
});

describe('ANDROID: Back on the 2.0 Home minimises the app (not the old Home screen first)', () => {
    // Measured on the emulator (2026-10-25): 2.0's Home is v-simple (the simpleFlow switch); 0.2's code
    // only knew v-main, so the first Back on Home showed the old v-main screen.
    test('2.0 Home (v-simple on): one Back minimises', { skip }, () => {
        const h = homeOnAndroid('android', [], { HardPanFeature: (n) => n === 'simpleFlow', __views: { simple: true, main: false } });
        h.press();
        assert.deepEqual(h.log, ['minimizeApp']);
    });
    test('2.0 Home switch on, but another Home view showing (v-main): Back returns to v-simple, app stays', { skip }, () => {
        const h = homeOnAndroid('android', [], { HardPanFeature: (n) => n === 'simpleFlow', __views: { simple: false, main: true } });
        h.press();
        assert.ok(!h.log.includes('minimizeApp'), JSON.stringify(h.log));
    });
});
