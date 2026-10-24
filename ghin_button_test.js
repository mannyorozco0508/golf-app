// ============================================================================
// URGENT-066 #3 - "POST TO GHIN" AFTER A ROUND, AND THE GHIN / USGA WORDS AUDIT.
//
//   1. THE LINKS. ghin-post.js's pure parts in a sandbox: on a phone (the app, or a phone
//      browser) the button is GHIN's own universal link; on a computer, ghin.com's posting.
//   2. INSTALLED / NOT INSTALLED, STUBBED. iOS's universal-link choice is modelled from
//      GHIN's OWN published files (ghin_links.fixture.json, fetched 2026-10-24): the
//      apple-app-site-association's claimed paths and ghin.com's mobile redirect rule.
//      Installed -> the GHIN app takes the link. Absent -> Safari loads ghin.com, whose
//      script sends an iPhone to the GHIN App Store page.
//   3. NOTHING SENT: no network, no database, no storage, no credentials in the file; no
//      URL scheme guessed into Info.plist.
//   4. WIRING: the Results page (GPS block, with the Send pill), the shell lists, the switch.
//   5. THE WORDS AUDIT: every string the HardPan app ships is read for "Handicap Index",
//      "WHS", "Course Handicap", "Slope Rating", "GHIN", "USGA". Only the listed factual
//      ones may stay (each with its reason); a new one fails here.
// The Chrome half (the button on a finished round's Receipt, not on a live one; the PDF
// never carries it; nothing written): urgent066_ghin_chrome_test.js.
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ON = fs.existsSync(path.join(ROOT, 'ghin-post.js'));
const skip = ON ? false : 'Consumer tree: no ghin-post.js';
const FX = ON ? JSON.parse(read('ghin_links.fixture.json')) : null;

function load(cfg, extra) {
    const sb = Object.assign({ console, HARDPAN_GPS_CONFIG: cfg === undefined ? { ghinButton: true } : cfg, navigator: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)', maxTouchPoints: 0 } }, extra || {});
    sb.window = sb; vm.createContext(sb); vm.runInContext(read('ghin-post.js'), sb);
    return sb.HardPanGhin;
}
const UA = {
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
};

// ---- iOS's universal-link choice, from GHIN's own apple-app-site-association --------
function claimedBy(url) {
    const u = new URL(url);
    if (u.hostname !== 'www.ghin.com' && u.hostname !== 'ghin.com') return null;
    for (const d of FX.aasa.applinks.details) {
        for (const p of d.paths) {
            const re = new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
            if (re.test(u.pathname)) return d.appID;
        }
    }
    return null;
}
// Where a tap on `url` ends up, on an iPhone (ios) / an Android phone / a computer, with the
// GHIN app installed or not. Absent -> the browser loads ghin.com, and ghin.com's own
// redirect rule (the fixture's copy of it) runs.
function landsOn(url, opts) {
    const o = opts || {};
    if (o.device !== 'computer' && o.installed && claimedBy(url)) return 'app:' + claimedBy(url);
    const u = new URL(url), R = FX.redirect;
    if (u.hostname.endsWith('ghin.com') && new RegExp(R.pathTest).test(u.pathname)) {
        if (o.device === 'iphone') return R.ios;
        if (o.device === 'android') return R.android;
        if (R.desktopFor.some((k) => u.pathname.includes(k))) return R.desktop;
    }
    return url;   // the page itself (ghin.com's sign-in, then posting)
}

test('1. the links: GHIN\'s universal link on a phone, ghin.com posting on a computer', { skip }, () => {
    const G = load();
    assert.equal(G.APP_LINK, 'https://www.ghin.com/overview/');
    assert.equal(G.WEB_POST, 'https://www.ghin.com/post-score');
    assert.equal(G.APP_STORE, 'https://apps.apple.com/us/app/ghin/id491796218');
    assert.equal(G.target({ native: true }), G.APP_LINK, 'the HardPan app itself');
    assert.equal(G.target({ ua: UA.iphone }), G.APP_LINK, 'iPhone browser');
    assert.equal(G.target({ ua: UA.android }), G.APP_LINK, 'Android browser');
    assert.equal(G.target({ ua: UA.mac, touch: 5 }), G.APP_LINK, 'iPad (reports as a Mac, has touch)');
    assert.equal(G.target({ ua: UA.mac, touch: 0 }), G.WEB_POST, 'a Mac');
    assert.equal(G.target({ ua: UA.windows }), G.WEB_POST, 'a PC');
    // The fixture really is GHIN's: its app, its store id, the posting route in its site.
    assert.equal(FX.aasa.applinks.details[0].appID, '2Y3A4HK9TT.org.usga.ghinmobile');
    assert.ok(FX.webRoutes.includes(new URL(G.WEB_POST).pathname), 'post-score is a ghin.com route');
    assert.ok(G.APP_STORE.endsWith('id' + FX.appStore.id) && FX.redirect.ios.includes('id' + FX.appStore.id), 'one App Store id everywhere');
    G.CLAIMED.forEach((p) => assert.ok(claimedBy('https://www.ghin.com' + p + 'x'), p + ' is claimed by the GHIN app'));
});

test('2. GHIN app INSTALLED (stub): the button opens the GHIN app', { skip }, () => {
    const G = load();
    const href = G.target({ native: true });
    assert.equal(landsOn(href, { device: 'iphone', installed: true }), 'app:2Y3A4HK9TT.org.usga.ghinmobile');
    assert.equal(landsOn(href, { device: 'android', installed: true }), 'app:2Y3A4HK9TT.org.usga.ghinmobile');
    // "Post on ghin.com instead" never claims the app: it is the web page, app or not.
    assert.equal(claimedBy(G.WEB_POST), null, '/post-score is NOT a GHIN universal link');
    assert.equal(landsOn(G.WEB_POST, { device: 'iphone', installed: true }), G.WEB_POST);
});

test('2b. GHIN app ABSENT (stub): the button lands on the GHIN App Store page; ghin.com posting stays ghin.com', { skip }, () => {
    const G = load();
    const href = G.target({ native: true });
    const ios = landsOn(href, { device: 'iphone', installed: false });
    assert.equal(ios, 'https://itunes.apple.com/us/app/ghin-mobile/id491796218?mt=8', 'iPhone without GHIN: the App Store');
    assert.match(ios, /id491796218/);
    assert.match(landsOn(href, { device: 'android', installed: false }), /^https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.advancedmobile\.android\.ghin/);
    assert.equal(landsOn(G.WEB_POST, { device: 'iphone', installed: false }), G.WEB_POST, 'the web link is ghin.com posting');
    // A computer is given WEB_POST, never the /overview/ link (ghin.com sends that to a USGA info page).
    const pc = G.target({ ua: UA.windows });
    assert.equal(landsOn(pc, { device: 'computer' }), G.WEB_POST);
    assert.notEqual(landsOn(G.APP_LINK, { device: 'computer' }), G.APP_LINK, 'why: /overview/ on a computer is redirected away');
});

test('the card: the button, the web link on a phone, the words; off by the switch', { skip }, () => {
    const G = load();
    const h = G.cardHtml({ native: true });
    assert.match(h, /<a class="ghin-btn" id="ghin-post" href="https:\/\/www\.ghin\.com\/overview\/" target="_blank" rel="noopener">Post to GHIN<\/a>/);
    assert.match(h, /id="ghin-web" href="https:\/\/www\.ghin\.com\/post-score" target="_blank"[^>]*>Post on ghin\.com instead</);
    assert.match(h, /not affiliated with the USGA or GHIN/);
    assert.match(h, /Nothing is sent from HardPan/);
    const pc = G.cardHtml({ ua: UA.windows });
    assert.match(pc, /id="ghin-post" href="https:\/\/www\.ghin\.com\/post-score"/);
    assert.ok(!/ghin-web/.test(pc), 'a computer: one link (the button is already ghin.com)');
    assert.equal(G.enabled(), true);
    assert.equal(load({ ghinButton: false }).enabled(), false);
    assert.equal(load(null).enabled(), false, 'no config: off');
    // target=_blank is how the app hands a link to iOS (Capacitor WebViewDelegationHandler ->
    // UIApplication.shared.open), which is what lets iOS give a universal link to the GHIN app.
    const cap = path.join(ROOT, 'node_modules/@capacitor/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift');
    if (fs.existsSync(cap)) assert.match(fs.readFileSync(cap, 'utf8'), /createWebViewWith[\s\S]{0,400}UIApplication\.shared\.open/);
});

test('3. nothing sent: no network, no database, no storage, no credentials; no guessed URL scheme', { skip }, () => {
    const code = read('ghin-post.js').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(/HardPanGhin/.test(code), 'positive: the code is there');
    ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'firebase', '.ref(', 'localStorage', 'sessionStorage', 'indexedDB', 'password', 'token', 'api.ghin', 'ghin://', 'geolocation']
        .forEach((w) => assert.ok(!code.includes(w), 'ghin-post.js must not use ' + w));
    const plist = 'gps-beta/ios/App/App/Info.plist';
    if (fs.existsSync(path.join(ROOT, plist))) {
        const p = read(plist);
        assert.match(p, /CFBundleURLTypes/, 'positive: the real Info.plist');
        assert.ok(!/ghin/i.test(p), 'no GHIN scheme guessed into Info.plist (GHIN publishes none)');
    }
});

test('4. wiring: Results page GPS block, on with the Send pill; shell lists; the switch', { skip }, () => {
    const flag = require('./tools/gps-flag.js');
    const st = read('settlement.html');
    assert.ok(st.includes('<script src="ghin-post.js"></script>'));
    assert.match(st, /window\.HpRcpt\.share\(show\);[^\n]*\n\s*if \(window\.HardPanGhin\) \{ try \{ window\.HardPanGhin\.show\(show\); \} catch \(e\) \{\} \}/, 'on and off with the Send pill (setReceiptAction)');
    const consumer = flag.applyFlag(st, false);
    assert.ok(consumer.includes('function setReceiptAction'), 'positive: the consumer page is there');
    assert.ok(!/ghin-post|HardPanGhin/.test(consumer), 'settlement: HardPan only');
    assert.ok(read('sw.js').includes("'./ghin-post.js',"));
    assert.equal((read('sync-mobile-web.js').match(/'ghin-post\.js'/g) || []).length, 2);
    assert.match(read('gps-config.js'), /\n\s*ghinButton: true,/);
    // Manual handicap entry is as it was: the files that hold it never mention the button.
    ['handicap.js', 'handicap-labels.js'].forEach((f) => assert.ok(!/HardPanGhin|ghin-post/.test(read(f)), f));
});

// ---- 5. THE WORDS AUDIT ---------------------------------------------------------------
// The phrases in any case; the acronyms in capitals (the code's own 'ghin-index' value and the
// ghin-post.js file name are identifiers, never shown).
const TERMS = /[Hh]andicap [Ii]ndex|[Ww]orld [Hh]andicap [Ss]ystem|[Cc]ourse [Hh]andicap|[Ss]lope [Rr]ating|\bWHS\b|\bGHIN\b|\bUSGA\b/;
// FACTUAL ONES THAT STAY (each a question for Manny in the 066-3 report where noted).
// file -> [substring of the line, how many, why]
const ALLOWED = {
    'ghin-post.js': [['', 99, 'the button itself and its facts: GHIN\'s app / site, "not affiliated"']],
    'handicap.js': [['each Handicap Index is used as the Playing Handicap', 5, 'the golfer\'s OWN typed index, used as typed when the tee has no rating (Q: lower-case it?)']],
    'handicap-labels.js': [['Each Handicap Index is used as the Playing Handicap.', 1, 'fallback of the same sentence']],
    'admin.html': [['GHIN Index (adjust by tee)', 1, 'names the number the golfer types, their own GHIN index (Q: rename to "Index (adjust by tee)"?)'],
        ["name: 'GHIN index'", 1, 'the same choice in the setup tiles (Q)'],
        [": 'Handicap Index';", 1, 'unreachable fallback (handicap.js always defines handicapUnconvertedNote)']]
};
function shipped() {
    const s = read('sync-mobile-web.js');
    const list = (n) => { const m = new RegExp('const ' + n + ' = \\[([\\s\\S]*?)\\];').exec(s); return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]); };
    return [...new Set(list('SHARED_SHELL').concat(list('CONSUMER_SHELL'), list('GPS_SHELL')))]
        .filter((f) => /\.(js|html)$/.test(f) && !/^(firebase-.*|maplibre-gl|qrcode\.min|sw)\.js$/.test(f) && fs.existsSync(path.join(ROOT, f)));
}
// What a golfer can see: block / HTML comments and whole-line // comments removed, and a
// trailing " // ..." comment after code.
function visible(src) {
    return src.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ''))
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
        .split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l.replace(/([;,{}()\]])\s+\/\/\s.*$/, '$1')));
}
function hits() {
    const out = [];
    shipped().forEach((f) => visible(read(f)).forEach((l, i) => { if (TERMS.test(l)) out.push({ f, n: i + 1, l: l.trim() }); }));
    return out;
}

test('5. words audit: no "Handicap Index" / "WHS" / "Course Handicap" / "Slope Rating" / "GHIN" / "USGA" on anything we work out', { skip }, () => {
    const files = shipped();
    assert.ok(files.length > 100 && files.includes('admin.html') && files.includes('ghin-post.js'), 'positive: the shipped list (' + files.length + ')');
    const all = hits();
    assert.ok(all.some((h) => h.f === 'ghin-post.js'), 'positive: the scan sees the button\'s own "GHIN"');
    const used = {};
    const bad = all.filter((h) => {
        const rules = ALLOWED[h.f] || [];
        const r = rules.find((x) => h.l.includes(x[0]));
        if (!r) return true;
        const k = h.f + '|' + r[0]; used[k] = (used[k] || 0) + 1;
        return used[k] > r[1];
    });
    assert.deepEqual(bad.map((h) => h.f + ':' + h.n + ' ' + h.l.slice(0, 160)), [], 'a GHIN / USGA word on our own number');
    // Each allowance is really used (a fixed line drops out of the list, it does not linger).
    Object.keys(ALLOWED).forEach((f) => ALLOWED[f].forEach((r) => { if (r[1] !== 99) assert.equal(used[f + '|' + r[0]], r[1], f + ': ' + r[0]); }));
});

test('5b. the seven fixes, each in its new words', { skip }, () => {
    assert.ok(read('handicap-labels.js').includes("'Playing handicaps (est.) are worked out from each golfer’s index: '"));
    assert.ok(!/Course Handicaps are converted from GHIN/.test(read('handicap-labels.js')));
    assert.ok(read('admin.html').includes("'Type each index; the app works out each playing handicap (est.) from the tee.'"));
    assert.ok(read('setup-coach-gate.js').includes("'Each index becomes a playing handicap from the tee, so without one the strokes are guesses.'"));
    assert.ok(read('index.html').includes("' \\u00B7 Handicap' : ' \\u00B7 Scratch'"));
    assert.ok(!/WHS handicap/.test(read('index.html')));
    assert.ok(read('sidematches.html').includes("'>Handicap \\u2014 foursomes allowance</option>'"));
    assert.ok(!read('sidematches.html').includes('WHS Foursomes allowance</option>'));
    const hp = read('hp-index.js');
    assert.ok(hp.includes('(with fewer rounds, fewer count), to one decimal'));
    assert.ok(!/World Handicap System/.test(hp.slice(hp.indexOf('var HOW ='), hp.indexOf('var WORDS ='))), 'the shown explainer');
    assert.ok(hp.indexOf('var HOW =') > 0 && hp.indexOf('var WORDS =') > hp.indexOf('var HOW ='), 'positive: the slice exists');
    const ins = read('instructions.html');
    assert.ok(ins.includes('rounds on tees with a course rating and slope (best 8 of your last 20, fewer rounds use fewer).'), 'instructions: the HardPan Index card');
    assert.ok(!/World Handicap System/.test(ins));
    assert.ok(hp.includes("'HardPan Index (unofficial)'"), 'our own number keeps its own name (question for Manny, not changed)');
});

test('5c. the audit really catches one (negative control on a copy)', { skip }, () => {
    const lines = visible("var a = 'x';\n// a WHS comment is fine\nreturn ' \\u00B7 WHS handicap';  // and a trailing GHIN note\n");
    assert.ok(!TERMS.test(lines[1]), 'a comment is not shown');
    assert.ok(TERMS.test(lines[2]), 'a shown string is caught');
    assert.ok(!/GHIN note/.test(lines[2]), 'the trailing comment is dropped');
});
