// ============================================================================
// THE MARKETING PAGE LIVES AT /home, AND / STAYS THE APP (website-b,
// ADVISOR-20261108-0356, Manny picked design B)
//
// THE SPLIT CHOSEN: the marketing page ships at /home (a _redirects rewrite to
// hardpan-home.html). / is untouched: index.html, which sends a visit with no
// ?game= to the admin.html front door ("What are you setting up?"). Every game,
// group, tournament, sign-in and API path is served exactly as on c65b45bd.
//
// WHY NOT "MARKETING AT / FOR PLAIN VISITS" - section 4 below measures it. The
// worker's install fetches ./index.html, Cloudflare 308s that to / with NO
// query, so a plain-visit split at / would precache the MARKETING page as the
// app shell; offline, /?game=CODE falls back (ignoreSearch) to the cached / and
// a golfer at a course with no signal opens the marketing page, not the round.
//
// WHAT THIS FILE PROVES, AND HOW
//   1. The page: its links (Get the app, Run an event, footer), the filled
//      store badges (the real App Store link on Apple's official artwork, an
//      Android "Coming soon" tile that is not a link), the filled refund page,
//      and that the page carries no dollar figure of its own.
//   2. Prices: site-pricing.js against terms.html section 6 and (when the
//      dev-205 branch is in this repo) the app's gps-config.js / hp-pricing.js.
//      The page's every data-price slot is filled from it - run through the
//      page's own inline call, not by naming the slots by hand.
//   3. Routing: _redirects has only the /home rules and none can reach /, the
//      app pages, /api or /__/; _routes.json sends none of the new paths to a
//      Function; functions/index.js (the / Function) still calls next() for /,
//      /?game=, /?tourney= and still sends the Tournaments host to /tournament;
//      the middleware still proxies /__/auth/ and blocks nothing new.
//   4. The service worker: CACHE_VERSION and the shell list unchanged; offline,
//      /?game=TEST still opens the app after /home was visited; and a NEGATIVE
//      CONTROL showing the plain-visit split would have served the marketing
//      page to that same offline game link.
// It is NOT a browser. The rendered page, /?game=TEST and / on wrangler pages
// dev are screenshotted (outbox/website-b-shots/NOTES.md).
//
// BASELINE (c65b45bd, before this branch): hardpan-home.html, refunds.html,
// site-pricing.js and _redirects do not exist there, so sections 1-3 fail on
// a missing file; section 4's unchanged-worker tests pass there too, which is
// the point - nothing in sw.js moved. On website-b f5fb0852: 29/29. After the
// placeholder fill: 32 tests, 32 pass, 0 fail. Fill negative controls (6, each
// restored): Play as a link with Google's wording (2 red), one App Store link
// back to #get-the-app (1), the badge recolored (1), a 48-hour deadline on the
// refund page (1), a [blank] back on it (1), the Android tile before Apple (1).
// Negative controls (9, each restored by sha): Run an event -> /admin (1 red),
// a $ figure in the page (2), founding price drift (2), / rewritten in
// _redirects (1), the plain-visit split in functions/index.js (3), the page
// added to the SW shell (1), refunds noindex removed (1), footer refund link
// dropped (1), Get the app pointed elsewhere (1).
//
// WEBSITE-C (Manny's picks 27A + 28A, the Play badge, side-games wording). Four
// tests above were re-pinned for what Manny asked to change - each says so:
// the footer (Help first), 3 App Store badges (a hero row), and the two Android
// tests, now "Google's official badge, linked" instead of "Coming soon, not a
// link". Section 5 is new. Counts: 23272a8c 32/32; on website-c's tree before
// the re-pin 28 pass / 4 fail (exactly those four). After: 41 tests, 41 pass,
// 0 fail (33 in sections 1-4, of which one is new: the Play badge file; 8 in 5).
// Website-c negative controls (4, each 1 red, restored by sha): "bet" in a Help
// page, a missing clip keeping its src, the Play link pointed elsewhere, the
// Play badge drawn smaller than Apple's.
//
// WEBSITE-D (Manny Nov 10: "make hardpangolf.com show the 27A homepage and move
// the web app to hardpangolf.com/app"). The split section 4 warned about is now
// DONE, and the trap it measured is closed in sw.js v394 instead of avoided:
// the homepage answer is marked X-HardPan-Page: home and never cached, and the
// install stores the app shell under /index.html, / and /app. Re-pinned here,
// each saying so: the / Function test (a bare / and /#x are now the homepage;
// every app query still falls through), "no Function knows about the
// marketing page" (functions/_front-door.js now names it on purpose; the rule
// that remains is that only a BARE / reaches it), and CACHE_VERSION v394-2.0.
// The full link inventory, the SW install/online/offline tests and their
// negative controls live in web_d_homepage_root_test.js.
//
// WEBSITE-E (Manny's picks 37B + 38C, Nov 10): the nine tiles became 25 cards in
// five rows (web_e_features_test.js + web_e_features_chrome_test.js check them).
// Re-pinned here, each saying so: the "Coming soon" test (two feature cards say it
// on purpose, in <div class="fsoon">; Android never does), the grid test (now the
// five rows), the clip-slot and badge counts (home 6, was 9), and the manifest test
// (four homepage-only slots are marked unused_since website-e). site-features.js
// joins the "static, not the app shell" test. Before the re-pin, the website-e page
// failed exactly six tests here (measured); after it, all pass.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const { loadServiceWorker, ORIGIN } = require('./helpers/sw-harness.js');

const ROOT = __dirname;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(ROOT, f));
const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, '');
const stripScripts = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, '');

const PAGE = 'hardpan-home.html';

// Every <a ...> tag on the page, attributes parsed.
function anchors(html) {
    const out = [];
    const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html))) {
        const attrs = {};
        m[1].replace(/([a-zA-Z-]+)="([^"]*)"/g, (_, k, v) => { attrs[k] = v; return ''; });
        out.push({ attrs, text: m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() });
    }
    return out;
}

// ---------------------------------------------------------------------------
describe('1. THE PAGE: links, placeholders, no prices of its own', () => {
    const html = stripComments(read(PAGE));
    const a = anchors(html);

    test('it is the marketing page, not the app', () => {
        // Full name (Nov 10): the title and the footer say "HardPan: Golf GPS & Games"; the footer keeps
        // "a Rattle Golf LLC app". Was: <title>HardPan Golf</title> and a "HardPan Golf" footer.
        assert.match(html, /<title>HardPan: Golf GPS &amp; Games<\/title>/);
        assert.match(html, /<footer>[\s\S]*?<b style="color:#fff">HardPan: Golf GPS &amp; Games<\/b> &middot; a Rattle Golf LLC app &middot; Scottsdale, AZ<\/div>[\s\S]*?<\/footer>/);
        // 41A (Manny, Nov 11): the header shows the full name on two lines, "HardPan:" over "Golf GPS & Games".
        // Was: "HardPan Golf" on one line. Same header on help.html and help/*.html.
        const HDR41 = /<a class="logo" href="[^"]*"><img src="\/hardpan-icon\.svg" alt="" width="36" height="36"><span class="logo-name"><span class="logo-1">HardPan:<\/span><span class="logo-2">Golf GPS &amp; Games<\/span><\/span><\/a>/;
        assert.match(html, HDR41);
        assert.doesNotMatch(html, /<a class="logo"[^>]*>[\s\S]{0,120}HardPan Golf<\/a>/, 'header still says HardPan Golf');
        // the help pages share the footer: same full name there
        ['help.html'].concat(fs.readdirSync(path.join(ROOT, 'help')).filter((f) => f.endsWith('.html')).map((f) => 'help/' + f)).forEach((f) => {
            assert.match(read(f), /<b style="color:#fff">HardPan: Golf GPS &amp; Games<\/b> &middot; a Rattle Golf LLC app &middot; Scottsdale, AZ/, f + ': footer is not the full name');
            assert.match(read(f), HDR41, f + ': header is not the 41A two-line name');
        });
        assert.match(html, /Play it\. Run it\./);
        // Not the scorecard, not the front door: no Firebase, no app script.
        assert.doesNotMatch(html, /firebase|auth-boot|pwa-boot|sw\.js/i,
            'the marketing page loads app plumbing; it is meant to be a static page');
    });

    test('"Get the app" goes to the store badges section', () => {
        const nav = a.find((x) => x.attrs.id === 'nav-get-app');
        assert.ok(nav, 'the Get the app button is gone');
        assert.equal(nav.text, 'Get the app');
        assert.equal(nav.attrs.href, '#get-the-app');
        const sec = /<section[^>]*id="get-the-app"[^>]*>([\s\S]*?)<\/section>/.exec(html);
        assert.ok(sec, 'there is no #get-the-app section for the button to land on');
        assert.match(sec[1], /data-store="apple"/);
        assert.match(sec[1], /data-store="google"/);
    });

    test('"Run an event" goes to the tournament organizer page', () => {
        const run = a.find((x) => x.attrs.id === 'run-an-event');
        assert.ok(run, 'the Run an event button is gone');
        assert.match(run.text, /^Run an event/);
        assert.equal(run.attrs.href, '/tournament');
        assert.ok(exists('tournament.html'), '/tournament has no page behind it');
    });

    test('the footer links to support, privacy, terms and the refund policy, all real pages', () => {
        const foot = /<footer>([\s\S]*?)<\/footer>/.exec(html);
        assert.ok(foot);
        const hrefs = anchors(foot[1]).map((x) => x.attrs.href);
        // website-c: Help joins the footer, first (28A).
        // Nov 10 (Manny): the refund link is held off until Stripe is live.
        assert.deepEqual(hrefs, ['/help', '/support', '/privacy', '/terms']);
        hrefs.forEach((h) => assert.ok(exists(h.slice(1) + '.html'), h + ' has no page'));
    });

    const APP_STORE_URL = 'https://apps.apple.com/app/id6808220335';

    test('every App Store badge is the real store link, with Apple\'s official artwork', () => {
        const apple = a.filter((x) => x.attrs['data-store'] === 'apple');
        // website-c: a third row under the hero (27A).
        assert.equal(apple.length, 3, 'one App Store badge under the hero, one in the golfers card, one in Get the app');
        apple.forEach((b) => {
            assert.equal(b.attrs.href, APP_STORE_URL, 'an App Store badge points somewhere else');
            assert.equal(b.attrs['data-todo'], undefined, 'a filled badge still carries its placeholder marker');
        });
        const imgs = html.match(/<img[^>]*src="\/app-store-badge\.svg"[^>]*>/g) || [];
        assert.equal(imgs.length, 3, 'each App Store link shows the official badge image');
        imgs.forEach((t) => {
            assert.match(t, /alt="Download on the App Store"/);
            assert.ok(Number(/height="(\d+)"/.exec(t)[1]) >= 40, 'Apple: at least 40 px high on screen');
        });
        assert.match(html, /\.store-apple img \{[^}]*height:(4[0-9]|[5-9]\d)px;[^}]*width:auto;/, 'the badge must keep its own aspect, >= 40 px');
        assert.match(html, /are trademarks of Apple Inc\./, 'the Apple trademark credit is gone');
    });

    test('the badge file is Apple\'s artwork unchanged (no redraw, no recolor)', () => {
        const svg = fs.readFileSync(path.join(ROOT, 'app-store-badge.svg'));
        const sha = require('crypto').createHash('sha256').update(svg).digest('hex');
        assert.equal(sha, 'a26fc5b38380272c92e9019a2eb8b45542a66814b3e2b203772db8904b9fb99f',
            'app-store-badge.svg is not the file Apple\'s badge service served (black, en-us)');
        assert.doesNotMatch(String(svg), /<script|href=|foreignObject/i);
    });

    // website-c (Manny 2026-11-10): Android is public. The "Coming soon" tile is
    // replaced everywhere by Google's official badge, linking to the Play listing.
    const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.rattlegolf.app';

    test('no hand-drawn store badge is left, and no "Coming soon" Android tile anywhere on the site', () => {
        assert.doesNotMatch(html, /class="badge"/, 'a hand-drawn badge is back');
        assert.doesNotMatch(html, /class="soon"|data-todo="play-store-url"/, 'the Android placeholder tile is back');
        // website-e re-pin (Manny's 37B pick): two FEATURE cards say "Coming soon" on purpose
        // (Offline maps, Ask caddie), each in its own <div class="fsoon">. Android never does.
        ['hardpan-home.html', 'help.html', 'support.html', 'refunds.html', 'terms.html', 'privacy.html'].forEach((f) =>
            assert.doesNotMatch(stripComments(read(f)).replace(/<div class="fsoon">COMING SOON(?: · iPHONE 2\.0\.5)?<\/div>/g, ''), /Coming soon/i, f + ' still says Android is coming soon'));
        // Re-pinned 2026-11-12 (Manny): Ask caddie shipped, its tag is gone; Offline maps keeps one.
        assert.equal((read('hardpan-home.html').match(/<div class="fsoon">/g) || []).length, 1, 'positive: the one feature card');
    });

    test('every Google Play badge is Google\'s official artwork, linking to the Play listing, after Apple\'s', () => {
        const g = a.filter((x) => x.attrs['data-store'] === 'google');
        assert.equal(g.length, 3, 'one Google Play badge beside each App Store badge');
        g.forEach((b) => assert.equal(b.attrs.href, PLAY_URL, 'a Play badge points somewhere else'));
        const imgs = html.match(/<img[^>]*src="\/google-play-badge\.png"[^>]*>/g) || [];
        assert.equal(imgs.length, 3);
        imgs.forEach((t) => assert.match(t, /alt="Get it on Google Play"/));
        const groups = html.split(/<div class="badges(?: hb)?">/).slice(1);
        assert.equal(groups.length, 3);
        groups.forEach((gr) => {
            const ap = gr.indexOf('data-store="apple"'), go = gr.indexOf('data-store="google"');
            assert.ok(ap >= 0 && go > ap, 'Apple comes first in every badge row');
        });
        assert.match(html, /Google Play and the Google Play logo are trademarks of Google LLC\./, 'Google\'s trademark line');
    });

    test('the Play badge file is Google\'s PNG unchanged, and its black badge is drawn the same 44 px as Apple\'s', () => {
        const png = fs.readFileSync(path.join(ROOT, 'google-play-badge.png'));
        const sha = require('crypto').createHash('sha256').update(png).digest('hex');
        assert.equal(sha, 'f72611e2df8e88204009fd896d05d5e8e83c77009c63943bbffa169559934849',
            'google-play-badge.png is not en_badge_web_generic.png as play.google.com serves it');
        assert.equal(png.readUInt32BE(16), 646); assert.equal(png.readUInt32BE(20), 250);
        // The PNG's opaque badge is 168 of its 250 px high (41 px clear space top and
        // bottom, measured). Drawn 65.5 px high, the badge itself is 65.5 * 168/250 = 44.0 px.
        const m = /\.store-google img \{[^}]*height:([\d.]+)px;[^}]*width:auto;[^}]*margin:-([\d.]+)px;/.exec(html);
        assert.ok(m, 'the Play badge size rule is gone');
        assert.ok(Math.abs(Number(m[1]) * 168 / 250 - 44) < 0.25, 'the black Play badge is not 44 px high');
        assert.ok(Math.abs(Number(m[2]) - Number(m[1]) * 41 / 250) < 0.1, 'the pull-in is not the PNG\'s own clear space');
    });

    test('the page has no dollar figure of its own (prices come from site-pricing.js)', () => {
        const visible = stripScripts(html);
        assert.doesNotMatch(visible, /\$\s?\d/, 'a hard-coded price is back in the page');
        assert.ok((visible.match(/data-price="/g) || []).length >= 8, 'the price slots are gone');
        assert.match(html, /<script src="\/site-pricing\.js"><\/script>/);
    });

    test('the refund page is filled: no data-todo, no blanks, dated, still noindex until the live OK', () => {
        const r = read('refunds.html');
        const body = stripComments(r);
        assert.doesNotMatch(body, /data-todo/, 'a placeholder marker is left on the refund page');
        assert.doesNotMatch(body, /class="blank"|\[[^\]]*\]|DRAFT/, 'a blank or the draft banner is left');
        assert.match(body, /Last updated (January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, 20\d\d/);
        assert.match(r, /<meta name="robots" content="noindex">/, 'noindex goes only with the typed live OK');
        assert.match(body, /mailto:support@rattlegolf\.com/, 'the site\'s support contact');
        assert.match(body, /cancellation deadline shown on the event's sign-up page/);
        assert.match(body, /cancels the event/);
        assert.match(body, /weather/);
        assert.match(body, /rescheduled/);
        assert.match(body, /Charged twice|duplicate/i);
        assert.match(body, /card you paid with/);
        assert.match(body, /5 to 10 business days/);
        assert.match(body, /not guaranteed/);
        assert.match(body, /App Store or Google Play[\s\S]*Apple or Google handles those refunds/);
        // The outline leaves these to Manny: no made-up deadline, no fee kept.
        assert.doesNotMatch(body, /\d+\s*-?\s*hours?\b/i, 'an invented hour deadline');
        assert.doesNotMatch(body, /deduct|processing fee|fee is kept|non-refundable/i, 'a fee deduction nobody decided');
        assert.doesNotMatch(body, /\$\s?\d/, 'a dollar figure');
    });
});

// ---------------------------------------------------------------------------
describe('2. PRICES: one config, the same as the app and the terms', () => {
    let P, fill;
    before(() => {
        const sb = { window: {} };
        vm.createContext(sb);
        vm.runInContext(read('site-pricing.js'), sb);
        P = sb.window.HARDPAN_SITE_PRICING;
        fill = sb.window.HardPanSitePricingFill;
    });

    test('site-pricing.js matches terms.html section 6 (the legal page on this site)', () => {
        const t = read('terms.html');
        assert.match(t, new RegExp('Founding Yearly:</strong> \\' + P.pro.founding + ' per year'));
        assert.match(t, new RegExp('Yearly:</strong> \\' + P.pro.yearly + ' per year'));
        assert.match(t, new RegExp('Monthly:</strong> \\' + P.pro.monthly + ' per month'));
        assert.match(t, new RegExp(P.pro.trialDays + '-day free trial'));
    });

    test('site-pricing.js matches the app config (dev-205 gps-config.js / hp-pricing.js), when that branch is here', (t) => {
        let cfg, hp;
        try {
            cfg = execFileSync('git', ['show', 'dev-205:gps-config.js'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
            hp = execFileSync('git', ['show', 'dev-205:hp-pricing.js'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        } catch (e) { t.skip('dev-205 is not in this clone'); return; }
        const fb = /iapFallbackPrices:\s*\{\s*founding:\s*'([^']+)',\s*yearly:\s*'([^']+)',\s*monthly:\s*'([^']+)'\s*\}/.exec(cfg);
        const host = /iapHostFallbackPrices:\s*\{\s*trip:\s*'([^']+)',\s*host:\s*'([^']+)'\s*\}/.exec(cfg);
        assert.ok(fb && host, 'the app config moved its prices; re-read where they live');
        assert.deepEqual([P.pro.founding, P.pro.yearly, P.pro.monthly], [fb[1], fb[2], fb[3]]);
        assert.deepEqual([P.tripPass.price, P.host.yearly], [host[1], host[2]]);
        const free = /var FREE_GOLFERS = (\d+);/.exec(hp);
        assert.ok(free);
        assert.equal(P.freeGolfers, Number(free[1]));
    });

    test('the page, run as written, fills every price slot (no slot left as a dash)', () => {
        // The page's OWN inline call, not a hand-named list of slots.
        const html = read(PAGE);
        const slots = [];
        html.replace(/data-price="([^"]+)"/g, (_, k) => { slots.push({ key: k, textContent: '', getAttribute: () => k }); return ''; });
        const inline = /<script>\s*([\s\S]*?)<\/script>/.exec(html);
        assert.ok(inline && /HardPanSitePricingFill\(document\)/.test(inline[1]), 'the page no longer fills its prices');
        const sb = { window: {}, document: { querySelectorAll: (s) => (s === '[data-price]' ? slots : []) } };
        sb.window.document = sb.document;
        vm.createContext(sb);
        vm.runInContext(read('site-pricing.js'), sb);
        vm.runInContext(inline[1], sb);
        assert.ok(slots.length >= 8);
        slots.forEach((s) => assert.notEqual(s.textContent, '–', 'slot ' + s.key + ' has no value'));
        const by = Object.fromEntries(slots.map((s) => [s.key, s.textContent]));
        assert.equal(by['pro-headline'], P.pro.founding + '/yr');
        assert.equal(by['trip-pass'], P.tripPass.price);
        assert.equal(by['free-golfers'], '5');
    });

    test('founding closed -> the yearly price, never a stale founding one', () => {
        const slots = [{ getAttribute: () => 'pro-headline', textContent: '' }, { getAttribute: () => 'pro-label', textContent: '' }];
        const sb = { window: {}, document: { querySelectorAll: () => slots } };
        vm.createContext(sb);
        vm.runInContext(read('site-pricing.js'), sb);
        sb.window.HARDPAN_SITE_PRICING.pro.foundingOpen = false;
        sb.window.HardPanSitePricingFill(sb.document);
        assert.equal(slots[0].textContent, P.pro.yearly + '/yr');
        assert.equal(slots[1].textContent, 'Yearly');
    });
});

// ---------------------------------------------------------------------------
// The one rule a _redirects line must never break: it cannot reach /, the app
// pages, a game or tournament link, /api or the sign-in proxy.
const APP_PATHS = /^\/($|index|admin|tournament|leaderboard|settlement|sidematches|skins|stats|game|trip|season|shared|instructions|start\b)/i;
function redirectsProblems(text) {
    const rules = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/));
    const bad = [];
    rules.forEach(([from, to, code]) => {
        if (APP_PATHS.test(from)) bad.push(from + ' rewrites an app path');
        if (/^\/(__|api)(\/|$)/.test(from)) bad.push(from + ' is the sign-in proxy or the API');
        if (/[*?:]/.test(from)) bad.push(from + ' is a wildcard/placeholder/query rule');
        if (to !== '/hardpan-home' || code !== '200') bad.push(from + ' -> ' + to + ' ' + code + ' is not the marketing rewrite');
    });
    return { rules, bad };
}

describe('3. ROUTING: / and every app link are served as before', () => {
    let IDX, MW;
    before(async () => {
        IDX = await import(pathToFileURL(path.join(ROOT, 'functions', 'index.js')).href);
        MW = await import(pathToFileURL(path.join(ROOT, 'functions', '_middleware.js')).href);
    });
    const ctx = (url, host) => {
        let nexts = 0;
        return {
            nexts: () => nexts,
            request: new Request(url, { headers: { host: host || new URL(url).host } }),
            next: async () => { nexts += 1; return new Response('STATIC', { status: 200 }); }
        };
    };

    test('_redirects holds only the /home rewrite, and nothing that reaches the app', () => {
        const { rules, bad } = redirectsProblems(read('_redirects'));
        assert.deepEqual(rules.map((r) => r[0]), ['/home', '/home/']);
        assert.deepEqual(bad, []);
        assert.ok(exists(PAGE), 'the rewrite target is missing');
    });

    test('NEGATIVE CONTROL: the checker refuses the rules that would break the app', () => {
        [
            '/  /hardpan-home  200',            // the plain-visit split, done the blunt way
            '/index.html  /hardpan-home  200',
            '/admin  /hardpan-home  200',
            '/*  /hardpan-home  200',
            '/__/auth/*  /hardpan-home  200',
            '/api/x  /hardpan-home  200',
            '/start  /admin  200'                // aliases are a later, separate decision
        ].forEach((line) => assert.notDeepEqual(redirectsProblems(line).bad, [], line + ' was accepted'));
    });

    test('_routes.json sends none of the new paths to a Function (static, no cost), and keeps / and /__/auth/*', () => {
        const inc = JSON.parse(read('_routes.json')).include;
        ['/home', '/home/*', '/hardpan-home', '/site-pricing.js', '/app-store-badge.svg'].forEach((p) =>
            assert.ok(!inc.includes(p), p + ' now runs a Function'));
        assert.ok(inc.includes('/'));
        assert.ok(inc.includes('/__/auth/*'));
        assert.ok(inc.includes('/__/firebase/*'));
    });

    // website-d re-pin: '/' and '/#x' left this list - a bare / is the homepage now.
    for (const p of ['/?game=TEST', '/?game=TEST&group=1', '/?tourney=TEST', '/?trip=TEST', '/?k=abc', '/?game=TEST#x']) {
        test('the / Function hands ' + p + ' to the static app (index.html), as before', async () => {
            const c = ctx('https://hardpangolf.com' + p);
            const res = await IDX.onRequest(c);
            assert.equal(c.nexts(), 1, p + ' did not fall through to index.html');
            assert.equal(await res.text(), 'STATIC');
        });
    }

    test('the Tournaments host still goes to /tournament (query kept)', async () => {
        const c = ctx('https://tournaments.rattlegolf.com/?tourney=TEST');
        const res = await IDX.onRequest(c);
        assert.equal(res.status, 302);
        assert.equal(res.headers.get('location'), 'https://tournaments.rattlegolf.com/tournament?tourney=TEST');
        assert.equal(c.nexts(), 0);
    });

    // website-d re-pin: the split IS wired at / now, in one place.
    test('only a BARE / reaches the marketing page: _front-door.js names it, the middleware does not', async () => {
        assert.match(read(path.join('functions', '_front-door.js')), /HOMEPAGE_ASSET = '\/hardpan-home'/);
        assert.doesNotMatch(read(path.join('functions', '_middleware.js')), /hardpan-home|marketing|\/home\b/i);
        const assets = { fetch: async (req) => new Response('ASSET:' + new URL(req.url).pathname, { status: 200 }) };
        for (const [p, want] of [['/', 'ASSET:/hardpan-home'], ['/#x', 'ASSET:/hardpan-home'], ['/?utm_source=x', 'ASSET:/hardpan-home'], ['/?game=TEST', 'STATIC']]) {
            const c = ctx('https://hardpangolf.com' + p);
            c.env = { ASSETS: assets };
            const res = await IDX.onRequest(c);
            assert.equal(await res.text(), want, p);
        }
    });

    test('the sign-in proxy paths are untouched and the new pages are not blocked', () => {
        assert.equal(MW.isAuthProxyPath('/__/auth/handler'), true);
        assert.equal(MW.isAuthProxyPath('/__/auth/iframe'), true);
        assert.equal(MW.isAuthProxyPath('/__/firebase/init.json'), true);
        assert.equal(MW.AUTH_PROXY_ORIGIN, 'https://golfapp-9fb21.firebaseapp.com');
        ['/home', '/hardpan-home', '/site-pricing.js', '/app-store-badge.svg', '/', '/admin', '/tournament'].forEach((p) =>
            assert.equal(MW.isBlockedPath(p), false, p + ' answers 404'));
    });

    // Nov 10 (Manny): "Hold the refunds page (and any footer/links to it) off the
    // site until Stripe is live." The file stays; the middleware answers 404.
    test('the refund page is held off the site: 404 at every spelling, and no page links to it', () => {
        ['/refunds', '/refunds/', '/refunds.html', '/Refunds', '/refunds%2Ehtml'].forEach((p) =>
            assert.equal(MW.isBlockedPath(p), true, p + ' is still served'));
        const inc = JSON.parse(read('_routes.json')).include;
        ['/refunds', '/refunds/', '/refunds.html'].forEach((p) => assert.ok(inc.includes(p), p + ' never reaches the block'));
        const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).concat(fs.readdirSync(path.join(ROOT, 'help')).map((f) => 'help/' + f));
        pages.filter((f) => f !== 'refunds.html').forEach((f) =>
            assert.doesNotMatch(read(f), /href="\/refunds/, f + ' still links to the refund page'));
        assert.equal(MW.isBlockedPath('/package.json'), true, 'positive control: the block list still blocks');
    });

    test('the app front door and the PWA starts are where they were', () => {
        assert.equal(JSON.parse(read('manifest.json')).start_url, './admin.html');
        assert.equal(JSON.parse(read('tournament-manifest.json')).start_url, './tournament.html');
        assert.match(read('index.html'), /if \(!currentMode\) \{\s*window\.location\.href = "admin\.html";/,
            'index.html no longer sends a visit with no ?game= to the front door');
        assert.match(read('admin.html'), /What are you setting up\?/);
    });
});

// ---------------------------------------------------------------------------
describe('4. THE SERVICE WORKER: unchanged, and the app still opens offline', () => {
    const SW = path.join(ROOT, 'sw.js');
    const nav = (url) => ({ url, method: 'GET', mode: 'navigate', destination: 'document' });
    const src = read('sw.js');

    test('CACHE_VERSION and the shell list did not move (no shell file changed)', () => {
        // v393-2.0 (Nov 10): moved for How it works + Trip Settlement, not for the marketing pages.
        // website-d re-pin: v394-2.0, moved FOR the homepage at / (see sw.js "Moved to v394").
        // Re-pinned 2026-11-11: v397-2.0, icon B moved it.
        assert.match(src, /const CACHE_VERSION = 'golfapp-v410-2\.0';/);
        const shell = src.slice(src.indexOf('const SHELL_FILES = ['), src.indexOf('];', src.indexOf('const SHELL_FILES = [')));
        assert.match(shell, /'\.\/index\.html'/, 'positive: the slice holds the shell list');
        assert.doesNotMatch(shell, /hardpan-home|refunds|site-pricing|app-store-badge/, 'the marketing page joined the app shell');
        const sync = read('sync-mobile-web.js');
        // Re-pinned 2026-11-12 (Manny OK, 58A): site-pricing.js is no longer a marketing-only
        // file - tournament.html and tournament-scorecard.html read it for the offer's renewal
        // price, so it sits in TOURNAMENT_SHELL (build-shell refused dist/tournament without it).
        // The marketing page, the refund page and the store badges still stay out.
        assert.doesNotMatch(sync, /hardpan-home|refunds\.html|app-store-badge/, 'the marketing page joined the native bundle');
        const tshell = sync.slice(sync.indexOf('const TOURNAMENT_SHELL = ['), sync.indexOf('];', sync.indexOf('const TOURNAMENT_SHELL = [')));
        assert.match(tshell, /'tournament\.html'/, 'positive: the slice holds the tournament shell list');
        assert.match(tshell, /'site-pricing\.js'/, 'site-pricing.js rides in the tournament shell (Manny OK 2026-11-12)');
        const cshell = sync.slice(sync.indexOf('const CONSUMER_SHELL = ['), sync.indexOf('];', sync.indexOf('const CONSUMER_SHELL = [')));
        assert.match(cshell, /'admin\.html'/, 'positive: the slice holds the consumer shell list');
        assert.doesNotMatch(cshell, /site-pricing/, 'the consumer bundle does not carry the price table');
    });

    test('the worker still leaves /__/auth/ to the network', async () => {
        const sw = loadServiceWorker(SW, { online: true });
        const r = await sw.request(nav(ORIGIN + '/__/auth/handler?x=1'));
        assert.equal(r.handled, false);
    });

    test('offline, /?game=TEST opens the app after /home was visited online', async () => {
        const warm = loadServiceWorker(SW, { online: true });
        await warm.request(nav(ORIGIN + '/home'));          // the marketing page, first
        await warm.request(nav(ORIGIN + '/'));              // the app at /, as every visitor gets it
        const cold = loadServiceWorker(SW, { online: false, seed: [...warm.cache().entries()] });
        const r = await cold.request(nav(ORIGIN + '/?game=TEST'));
        assert.equal(r.handled, true);
        assert.equal(r.response.body, 'NETWORK:' + ORIGIN + '/', 'the game link did not get the cached app page');
        assert.doesNotMatch(String(r.response.body), /\/home/, 'the game link got the marketing page offline');
    });

    test('NEGATIVE CONTROL: with marketing at plain /, the same offline game link gets the marketing page', async () => {
        // What the plain-visit split would leave in the cache: the worker's
        // install fetches ./index.html, Cloudflare 308s it to / (no query), and
        // a plain / is the marketing page - so / is cached as MARKETING.
        const marketing = { status: 200, ok: true, body: 'MARKETING', url: ORIGIN + '/', redirected: false,
            headers: { get: () => null }, blob: () => Promise.resolve({ __body: 'MARKETING' }), clone() { return this; } };
        const cold = loadServiceWorker(SW, { online: false, seed: [[ORIGIN + '/', marketing]] });
        const r = await cold.request(nav(ORIGIN + '/?game=TEST'));
        assert.equal(r.response.body, 'MARKETING',
            'if this ever fails the worker no longer falls back to the cached / for a game link - re-measure the split');
    });

    test('a /home never opened offline is the No connection card, not the app or a blank', async () => {
        const sw = loadServiceWorker(SW, { online: false, seed: [] });
        const r = await sw.request(nav(ORIGIN + '/home'));
        assert.equal(r.response.status, 503);
        assert.match(String(r.response.body), /No connection/);
    });
});

// ---------------------------------------------------------------------------
// 5. WEBSITE-C: the feature grid (27A), Help (28A), the clip slots, the wording.
// Source-level, like sections 1-3. The rendered pages (clip slots falling back
// to their posters on a missing file, the badges' measured 44 px, no sideways
// scroll at 393) were measured in headless Chrome; shots and numbers in
// outbox/website-c-shots/ and the website-c report.
// ---------------------------------------------------------------------------
describe('5. WEBSITE-C: feature grid, Help pages, clip slots, side-games wording', () => {
    const home = stripComments(read(PAGE));
    const HELP_TOPICS = ['start-round', 'add-golfers', 'score-your-group', 'add-a-game',
        'run-a-tournament', 'join-with-a-code', 'gps-basics', 'erase-a-round'];
    const helpPages = ['help.html'].concat(HELP_TOPICS.map((t) => 'help/' + t + '.html'));
    const videos = (h) => h.match(/<video\b[^>]*>/g) || [];
    const manifest = JSON.parse(read('media/clips/manifest.json'));
    const manifestFiles = manifest.clips.map((c) => '/media/clips/' + c.file);

    // website-e re-pin (Manny's picks 37B + 38C): the nine tiles became 25 cards in five
    // rows; six of them carry a clip, the rest a sharp still. The full card checks are
    // web_e_features_test.js. Was: nine tiles, each a clip slot.
    test('the homepage has "EVERYTHING IN THE APP" with the five rows of cards, right after the hero', () => {
        const at = home.indexOf('id="features"');
        assert.ok(at > home.indexOf('class="wrap hero"') && at < home.indexOf('class="wrap split"'), 'the rows are not between the hero and the panels');
        assert.match(home, /EVERYTHING IN THE APP/);
        const sec = /<section class="feat" id="features">([\s\S]*?)<\/section>\s*<div class="fv"/.exec(home)[1];
        assert.deepEqual((sec.match(/<div class="grp" id="g-[a-z]+">\s*<div class="ghd"><h2>([^<]*)<\/h2>/g) || []).map((t) => />([^<]*)<\/h2>/.exec(t)[1]),
            ['Play', 'Games', 'Your group', 'Organize', 'Get better']);
        assert.equal((sec.match(/<li class="fc"/g) || []).length, 32);   // 52A batch 1 re-pin (2026-11-12): Organize 5 -> 12
        assert.equal(videos(sec).length, 6, 'the six features with a clip');
    });

    // website-d re-pin (Manny "keep option 1"): no `loop` - a clip plays once and
    // holds its last frame. Was: muted, looping, inline.
    test('every clip slot is muted, plays once (no loop), inline, loads nothing up front, has a poster and a clip in the manifest', () => {
        const all = [PAGE].concat(helpPages);
        let n = 0;
        all.forEach((f) => videos(stripComments(read(f))).forEach((v) => {
            n += 1;
            ['muted', 'playsinline'].forEach((k) => assert.match(v, new RegExp('\\b' + k + '\\b'), f + ' ' + k));
            assert.doesNotMatch(v, /\bloop\b/, f + ': a looping clip jumps back to its first frame');
            assert.match(v, /preload="none"/, f + ': a clip would download before it is seen');
            assert.doesNotMatch(v, /(?<![-\w])src="|autoplay|controls/, f + ': the clip must start from data-src, in view, with no player chrome');
            // website-e re-pin: a homepage card's still is its own sharp <img> (media/screens/), drawn
            // over the video until the clip plays; a poster attribute there would download ~40 KB per
            // card up front for a picture nobody sees. Help keeps its posters. Was: a poster on every slot.
            if (f === PAGE) { assert.doesNotMatch(v, /poster=/, f + ': a hidden poster downloads up front'); return; }
            const poster = /poster="\/(media\/posters\/[a-z0-9-]+\.jpg)"/.exec(v);
            assert.ok(poster, f + ': no poster');
            assert.ok(exists(poster[1]), poster[1] + ' is missing');
            const size = fs.statSync(path.join(ROOT, poster[1])).size;
            assert.ok(size < 60 * 1024, poster[1] + ' is ' + size + ' bytes, over 60 KB');
            const clip = /data-src="(\/media\/clips\/[a-z0-9-]+\.mp4)"/.exec(v);
            assert.ok(clip && manifestFiles.includes(clip[1]), f + ': ' + (clip && clip[1]) + ' is not in media/clips/manifest.json');
        }));
        assert.equal(n, 6 + 8 + 8, 'home 6 (website-e: the clip cards; was 9 tiles) + help list 8 + one per topic page');
        all.forEach((f) => assert.match(read(f), /<script src="\/site-clips\.js" defer><\/script>/, f + ' does not load the clip script'));
    });

    // website-e re-pin: the four homepage-only slots (just-say-it, weekly-code, chat,
    // my-bag-stats) are no longer on any page - their cards show stills. They stay in the
    // manifest, marked unused_since website-e, with their posters. Was: every entry used.
    test('the clips manifest names every expected file with a length; an entry no page uses says so', () => {
        assert.equal(manifest.folder, '/media/clips/');
        const used = new Set();
        [PAGE].concat(helpPages).forEach((f) => videos(read(f)).forEach((v) => used.add(/data-src="([^"]+)"/.exec(v)[1])));
        [...used].forEach((u) => assert.ok(manifestFiles.includes(u), u + ' is not in the manifest'));
        const unused = manifest.clips.filter((c) => !used.has('/media/clips/' + c.file));
        assert.deepEqual(unused.map((c) => c.file).sort(), ['chat.mp4', 'just-say-it.mp4', 'my-bag-stats.mp4', 'weekly-code.mp4']);
        unused.forEach((c) => { assert.equal(c.unused_since, 'website-e', c.file); assert.deepEqual(c.used_on, [], c.file); assert.ok(exists(c.poster.slice(1)), c.poster); });
        manifest.clips.filter((c) => used.has('/media/clips/' + c.file)).forEach((c) => assert.ok(c.seconds >= 2 && c.seconds <= 10 && c.used_on.length >= 1, c.file));
    });

    test('site-clips.js: loads in view, pauses out of view, keeps the poster when a clip is missing, honours reduce motion', () => {
        const js = read('site-clips.js');
        assert.match(js, /new IntersectionObserver/);
        assert.match(js, /v\.src = v\.getAttribute\('data-src'\)/, 'positive: the clip is loaded from data-src');
        assert.match(js, /else if [^\n]{0,120}v\.pause\(\)/, 'a clip that leaves the screen is not paused');
        assert.match(js, /addEventListener\('error', function \(\) \{ giveUp\(v\); \}\)/);
        assert.match(js, /function giveUp\(v\) \{[\s\S]*?removeAttribute\('src'\)[\s\S]*?\}/, 'a missing clip leaves a broken player');
        assert.match(js, /prefers-reduced-motion: reduce/);
        assert.match(js, /p\.catch\(/, 'a refused autoplay throws');
    });

    test('Help: a topic list, and one page per topic with its own link, a clip slot and 3-5 steps', () => {
        const list = stripComments(read('help.html'));
        const links = anchors(list).map((x) => x.attrs.href).filter((h) => /^\/help\//.test(h));
        assert.deepEqual(links, HELP_TOPICS.map((t) => '/help/' + t));
        HELP_TOPICS.forEach((t) => {
            const h = stripComments(read('help/' + t + '.html'));
            assert.match(h, /<a class="crumb" href="\/help">/, t + ': no way back to the list');
            assert.equal(videos(h).length, 1, t);
            const steps = (/<ol class="st">([\s\S]*?)<\/ol>/.exec(h) || [, ''])[1].match(/<li>/g) || [];
            assert.ok(steps.length >= 3 && steps.length <= 5, t + ' has ' + steps.length + ' steps');
        });
        // spot-check the steps are the ones Manny approved (CHOICES-27-29-STEPS.md)
        assert.match(read('help/score-your-group.html'), /Tap <b>Save · Next hole ›<\/b>\. One tap saves the whole group/);
        assert.match(read('help/erase-a-round.html'), /<b>🗑️ Erase this round for everyone<\/b>/);
    });

    test('Help is linked from the homepage nav and footer, and from the support and refund pages', () => {
        assert.ok(anchors(/<nav[\s\S]*?<\/nav>/.exec(home)[0]).some((x) => x.attrs.href === '/help'), 'nav');
        assert.match(read('support.html'), /<a href="\/help">Help<\/a>/);
        assert.match(read('refunds.html'), /<a href="\/help">Help<\/a>/);
        helpPages.forEach((f) => assert.match(read(f), /href="\/home#get-the-app"/, f + ': Get the app goes nowhere'));
    });

    test('no betting words in the marketing and Help copy (side-games wording)', () => {
        const BET = /\b(bet|bets|betting|wager\w*|gambl\w*|pot|pots|buy-?ins?)\b|money for bets/i;
        [PAGE, 'support.html', 'refunds.html'].concat(helpPages).forEach((f) => {
            const visible = stripScripts(stripComments(read(f))).replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
            assert.ok(visible.length > 400, f + ': positive - the page has copy to judge');
            assert.doesNotMatch(visible, BET, f);
        });
        assert.match(home, /Side games, just for fun/);
    });

    // WEBSITE-D (Manny Nov 10, "Clips: use the 11 now"): the 7 website clips
    // from clips-205/web are in media/clips/; the other 7 stay poster-only.
    // website-d, "keep option 1": just-say-it.mp4 is NOT shipped (it was the
    // add-a-game cut; the tile keeps its own still). Six clips.
    const CUT = { 'gps.mp4': 3, 'add-a-game.mp4': 4, 'group-scoring.mp4': 3,
        'games-live-board.mp4': 3, 'results.mp4': 3.5, 'tournaments.mp4': 3.5 };
    test('website-d: the 6 cut clips are in media/clips (MP4, under 400 KB), the 8 others are not', () => {
        manifest.clips.forEach((c) => {
            const f = path.join('media', 'clips', c.file);
            if (c.file in CUT) {
                assert.ok(exists(f), c.file + ' is missing');
                const buf = fs.readFileSync(path.join(ROOT, f));
                assert.equal(buf.slice(4, 8).toString('latin1'), 'ftyp', c.file + ' is not an MP4');
                assert.ok(buf.length > 50 * 1024 && buf.length < 400 * 1024, c.file + ' is ' + buf.length + ' bytes');
                assert.equal(c.seconds, CUT[c.file], c.file + ': manifest seconds');
            } else {
                assert.ok(!exists(f), c.file + ' exists but was not in the cut set (its poster should show)');
            }
        });
        assert.equal(Object.keys(CUT).length, 6);
        assert.equal(manifest.clips.find((c) => c.file === 'just-say-it.mp4').seconds, 6, 'just-say-it keeps its planned length (poster only)');
        assert.doesNotMatch(manifest._about, /^[^.]*Not yet cut: each will be cut/, 'the about line still says nothing is cut');
        Object.keys(CUT).forEach((f) => assert.ok(manifest._about.includes(f.replace('.mp4', '')), f + ' not named in _about'));
        assert.match(manifest._about, /Poster only \(not cut, or held back\): just-say-it/);
    });
    test('website-d: each cut clip has a poster made from its first frame at the clip aspect (295x640 JPEG); just-say-it keeps its still', () => {
        // sha256 (first 16 hex) of each poster as made on website-d: AVAssetImageGenerator
        // at time 0 with zero tolerance, then sips to 295x640 JPEG. A re-cut clip needs a
        // new poster AND a new pin here, on purpose.
        // RE-PINNED 2026-11-13 (website pics vs iOS 2.0.7, Manny by phone relay ADVISOR-1246):
        // tournaments.mp4 re-cut from the 2.0.7 home (the organizer's Desert Classic card); its
        // poster is the re-cut clip's own first frame (sharp, 295x640 JPEG q82).
        // gps.mp4 and group-scoring.mp4 re-cut the same way (the 2.0.7 map with the tabs line); their posters
        // are their first frames; games-live-board.mp4 the same (the stake-free Games sheet, then the Board tab).
        const posterSha = (buf) => require('crypto').createHash('sha256').update(buf).digest('hex').slice(0, 16);
        posterSha.FIRST_FRAME = { 'gps': 'cf2efd65f78e71e8', 'add-a-game': '3494edfa101d9586', 'group-scoring': 'e2e4a6caecaabf90',
            'games-live-board': '48f19b8bd81e8495', 'results': '847620f41248eb7e', 'tournaments': '94852db0fdaf4cc1' };
        posterSha.KEPT = { 'just-say-it': '7bcb59a6ecafe3b8' };
        Object.keys(CUT).forEach((f) => {
            const name = f.replace('.mp4', '');
            const buf = fs.readFileSync(path.join(ROOT, 'media', 'posters', name + '.jpg'));
            assert.equal(buf[0], 0xff, name + ' poster is not a JPEG'); assert.equal(buf[1], 0xd8);
            const sof = buf.indexOf(Buffer.from([0xff, 0xc0]));
            assert.ok(sof > 0, name + ': positive - a baseline JPEG frame header');
            assert.deepEqual([buf.readUInt16BE(sof + 7), buf.readUInt16BE(sof + 5)], [295, 640], name + ' poster is not 295x640 (the clip aspect)');
            assert.equal(posterSha(buf), posterSha.FIRST_FRAME[name], name + ' poster is not the first-frame poster');
        });
        assert.equal(posterSha(fs.readFileSync(path.join(ROOT, 'media', 'posters', 'just-say-it.jpg'))), posterSha.KEPT['just-say-it'], 'the Just say it still changed');
    });
    test('website-d: every play badge on a page matches its clip length in the manifest (whole seconds)', () => {
        const secs = Object.fromEntries(manifest.clips.map((c) => [c.file, c.seconds]));
        let n = 0;
        [PAGE].concat(helpPages).forEach((f) => {
            for (const m of read(f).matchAll(/data-src="\/media\/clips\/([a-z0-9-]+\.mp4)"[^>]*><\/video><span class="cb">&#9654; 0:(\d\d)</g)) {
                n += 1;
                assert.equal(Number(m[2]), Math.floor(secs[m[1]] + 0.5), f + ': ' + m[1] + ' badge 0:' + m[2]);
            }
        });
        assert.equal(n, 6 + 8 + 8, 'positive: every badge was read (website-e: 6 homepage clip cards, was 9 tiles)');
    });
    test('website-d: the clips are served (not blocked, not routed to a Function)', async () => {
        const MW = await import(pathToFileURL(path.join(ROOT, 'functions', '_middleware.js')).href);
        const inc = JSON.parse(read('_routes.json')).include;
        Object.keys(CUT).forEach((f) => {
            assert.equal(MW.isBlockedPath('/media/clips/' + f), false, f + ' answers 404');
            assert.ok(!inc.some((r) => r === '/media/*' || r === '/media/clips/*' || r === '/*.mp4'), 'clips run a Function');
        });
        assert.equal(MW.isBlockedPath('/media/clips/manifest.json'), false);
    });

    test('the new pages and media are static: no Function, no rewrite, not in the app shell or the native bundle', () => {
        const inc = JSON.parse(read('_routes.json')).include;
        ['/help', '/help/*', '/media/*', '/site-clips.js', '/site-features.js', '/google-play-badge.png'].forEach((p) => assert.ok(!inc.includes(p), p));
        assert.deepEqual(redirectsProblems(read('_redirects')).rules.map((r) => r[0]), ['/home', '/home/']);
        const shell = read('sw.js');
        assert.doesNotMatch(shell.slice(shell.indexOf('const SHELL_FILES = ['), shell.indexOf('];', shell.indexOf('const SHELL_FILES = ['))),
            /help|media\/|site-clips|site-features|google-play-badge/);
        assert.doesNotMatch(read('sync-mobile-web.js'), /help\.html|media\/|site-clips|site-features|google-play-badge/);
    });
});
