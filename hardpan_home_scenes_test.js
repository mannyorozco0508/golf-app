// ============================================================================
// HOMEPAGE A: THE FOLD, THE SCENE SHEETS AND THE AT-A-GLANCE TILES (Manny's pick 2026-11-15 15:33,
// ADVISOR-20261115-1534; mockups tournaments/mockups-home/HP-homepage-ABC)
//
// hardpan-home.html's fold (F2, Manny's pick 2026-11-15 5:19 PM, ADVISOR-20261115-1720-OK-build-F2) is a fan of
// three real 2.0.8 phones with the HardPan Golf lockup on a cream plate over their top edge, then one line, two
// doors, the store badges and the web-app link; a sticky bar (small lockup, links, Get the app) slides in once the
// fold has scrolled past; under it five scene cards, each opening a sheet of that scene's
// pictures, and one tile per feature; a picture or a tile opens the full-screen viewer the rows
// already had (site-features.js). The rows, the viewer, pricing, Get the app and the footer are
// the ones main had. The old icon + two-line header is gone from this page (the lockup is the brand now;
// marketing_home_test.js keeps that header on the help pages).
//
// 1. Source: the fold's parts and their targets; every data-open-key resolves to a card the rows
//    have or to one of the five new pictures (media/home, each once, with a real alt and files on
//    disk matching its manifest); the tiles: 37 with a picture, 2 without one yet, 2 COMING; no
//    "$", no betting word, no Venmo in anything new; the rows and the 2.0.8 row are still there,
//    after the new sections; the new grid is NOT class "tiles" (that is the Try the GPS tile layer).
// 2. Chrome, 390x844 then 1280x800, the way a visitor arrives (the page served by a tiny static
//    server over this repo; every action a real mouse event or key; nothing on the page is called):
//    no page error, no sideways scroll, doors and badges above the fold, every tap target 44 px or
//    taller; a tap on a scene opens its sheet, a tap on a picture opens the viewer on it, Esc closes
//    the viewer and focus returns to the picture, Esc again closes the sheet and focus returns to the
//    scene; the TV picture gets the wide slide; a tile opens the viewer on the SAME item the row has
//    (Play · 1 / 6), not a copy; the Golfers door lands on #how; the map's tile layer still sits at 0.
// WHAT IT CANNOT PROVE: Safari, a real Cloudflare edge, pinch zoom.
// WHAT'S NEW RE-PIN (2026-11-19, ADVISOR-20261119-0906 item 1): the three release rows moved to whats-new.html; the homepage
// keeps a What's new link first inside #features, 32 row cards, and the four 2.0.7 cards its tiles open as viewer-only items
// (<div class="vx" hidden>); the viewer holds 32 + 12 + 4 slides. whats_new_page_test.js holds the move.
// BASELINE against pre-build main 55077321 (hardpan-home.html without the fold), measured with
// this exact file copied there: the file cannot load (the fold section is not on the page, so the module-level
// slice assertion throws: 1 fail, 0 of the 18 tests run); here: 24 pass / 0 fail (13 source + 11 Chrome).
// 2.8b (ADVISOR-20261116-1000, a scroll that begins on a tile must open nothing) against main 91d0f2b7, which opened on
// touchend: 0 pass / 1 fail ("a scroll opened something: gps, weekly-code, live-tv, scene weekly, scene tournaments"); here it passes.
// NEGATIVE CONTROLS (run by hand 2026-11-15, each restored by cp from a scratchpad copy, sha printed RESTORED-OK):
//   - site-features.js with the data-open-key handler emptied: 13 pass / 5 fail (2.2 to 2.6: no picture and no
//     tile opens the viewer, and the taps after them land on a page in the wrong state).
//   - the grid's class renamed back to .tiles (CSS + markup): 11 pass / 7 fail (1.10, 2.1, 2.2 to 2.5 and 2.7:
//     the map's tile layer gains the grid's margin and the tiles lose their columns).
// ============================================================================
'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = __dirname;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(ROOT, f));
const stripComments = (h) => h.replace(/<!--[\s\S]*?-->/g, '');
const html = stripComments(read('hardpan-home.html'));
const JS = read('site-features.js');
const CSS = (/<style>([\s\S]*?)<\/style>/.exec(html) || ['', ''])[1];
const body = html.slice(html.indexOf('<body>'));
const slice = (from, to) => { const a = body.indexOf(from), b = body.indexOf(to, a + 1); assert.ok(a >= 0 && b > a, from + ' .. ' + to); return body.slice(a, b); };
const fold = slice('<section class="wrap hero fold" id="top">', '</section>');
const how = slice('<section class="how" id="how"', '</section>');
const glance = slice('<section class="glance" id="everything"', '</section>');
const sheets = body.slice(body.indexOf('<div class="sheet" id="sheet-weekly"'), body.indexOf('<section class="glance"'));
const newParts = fold + how + sheets + glance;
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([a-z-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const cardKeys = [...body.matchAll(/<li class="fc" id="[^"]+" data-key="([^"]+)">/g)].map((m) => m[1]);
// WHAT'S NEW RE-PIN (2026-11-19, ADVISOR-20261119-0906 item 1): the three release rows moved to whats-new.html. Four of
// their cards (the 2.0.7 row) are still opened from this page by a tile and a sheet picture, so the homepage carries them
// as viewer-only items: <div class="vx" hidden> with a [data-shot] per card (site-features.js reads every [data-shot]).
const vxBlock = (/<div class="vx" hidden>([\s\S]*?)<\/div>/.exec(body) || ['', ''])[1];
const vxKeys = [...vxBlock.matchAll(/<span data-shot="([^"]+)" data-group="At a glance"><img [^>]*><b>[^<]+<\/b><\/span>/g)].map((m) => m[1]);
const shots = [...body.matchAll(/<button type="button" class="shot" data-open-key="([^"]+)" data-shot="([^"]+)" data-group="([^"]+)"( data-wide)?>([\s\S]*?)<\/button>/g)]
    .map((m) => ({ key: m[1], shot: m[2], group: m[3], wide: !!m[4], img: attrs(/<img\b[^>]*>/.exec(m[5])[0]), title: (/<b>([^<]*)<\/b>/.exec(m[5]) || [])[1] }));
const MONEY = /\$|\b(bet|bets|betting|wager\w*|gambl\w*|pot|pots|buy-?ins?|stake|stakes|dollars?|bucks|cash|venmo|paypal)\b/i;
// A data-price slot's text is a price from site-pricing.js (since 2026-11-16 the page carries it as text, bound to the
// fill by hardpan_home_price_test.js), so it is removed before the money scan: the scan is for a figure TYPED on the page.
const noSlotText = (h) => h.replace(/(<(\w+)[^>]*data-price="[^"]+"[^>]*>)[^<]*(<\/\2>)/g, '$1$3');
const textOf = (h) => noSlotText(h).replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');

describe('1. source: the fold, the scenes, the sheets, the tiles', () => {
    test('the fold: one line, two doors (Golfers -> #how, Organizers -> /organizers, the same id as before), badges Apple then Google, the web-app link', () => {
        assert.match(fold, /<h1 class="one">Every yard\. Every game\. One live board\.<\/h1>/);
        // ADVISOR-20261115-2017: Organizers -> the organizer landing (/organizers), never straight into the tool.
        assert.match(fold, /<a class="door go" id="door-golfers" href="#how">Golfers<\/a><a class="door org" id="hero-start-tournament" href="\/organizers">Organizers<\/a>/);
        assert.match(fold, /<img class="lk" src="\/media\/home\/hardpan-golf-lockup\.png" alt="HardPan Golf" width="1278" height="222">/);
        assert.ok(exists('media/home/hardpan-golf-lockup.png'));
        const apple = fold.indexOf('class="store-apple" href="https://apps.apple.com/app/id6808220335"'), google = fold.indexOf('class="store-google" href="https://play.google.com/store/apps/details?id=com.rattlegolf.app"');
        assert.ok(apple > 0 && google > apple, 'badges: Apple first, then Google');
        assert.match(fold, /<img src="\/app-store-badge\.svg" alt="Download on the App Store" width="132" height="44">/);
        assert.match(fold, /<img src="\/google-play-badge\.png" alt="Get it on Google Play" width="170" height="66">/);
        assert.match(fold, /<a class="webapp" id="open-web-app" href="\/admin">Have a round code\? Open the web app &rarr;<\/a>/);
        assert.doesNotMatch(body, /Play it\. Run it\./);
    });
    test('the fan: three real 2.0.8 phones (recap, the smooth slope, the event board), each a button into a sheet that exists, files on disk, real alts', () => {
        const fan = [...fold.matchAll(/<button type="button" class="fp ([lcr])" data-sheet="([a-z]+)"><img src="([^"]+)" srcset="([^"]+)" sizes="[^"]+" width="940" height="2040" alt="([^"]*)"><\/button>/g)];
        assert.deepEqual(fan.map((t) => t[1]), ['l', 'c', 'r']);
        assert.deepEqual(fan.map((t) => t[2]), ['weekly', 'gps', 'tournaments']);
        assert.deepEqual(fan.map((t) => t[3]), ['/media/home/round-recap-400.webp', '/media/screens/green-slope-400.webp', '/media/home/multi-group-board-400.webp']);
        fan.forEach((t) => { t[4].split(',').map((x) => x.trim().split(' ')[0]).forEach((f) => assert.ok(exists(f.slice(1)), f)); assert.ok(t[5].length >= 80, 'alt: ' + t[5]); assert.ok(body.includes('id="sheet-' + t[2] + '"'), 'no sheet ' + t[2]); });
        assert.match(fan[1][5], /ring hidden[\s\S]*\(−1\) with the under-par number in red/, 'the centre phone is the 2.0.8 slope frame');
        assert.doesNotMatch(fold, /class="mt|mosaic|weekly-results/);
    });
    test('five scenes in order, each a button into its sheet, each with a real picture', () => {
        const sc = [...how.matchAll(/<button type="button" class="scene( tvscene)?" data-sheet="([a-z]+)"><span class="dev( tv)?"><img src="([^"]+)" loading="lazy" decoding="async" alt="([^"]*)"><\/span><span class="tx"><b>([^<]*)<\/b><span>([^<]*)<\/span><span class="more">See more<\/span><\/span><\/button>/g)];
        assert.deepEqual(sc.map((m) => m[2]), ['weekly', 'club', 'trip', 'tournaments', 'gps']);
        assert.deepEqual(sc.map((m) => m[6]), ['Weekly game with your buddies', 'Men’s / women’s club day', 'Buddies trip', 'Tournaments and charity events', 'Just you and the GPS']);
        sc.forEach((m) => { assert.ok(exists(m[4].slice(1)), m[4]); assert.ok(m[5].length >= 60, 'alt: ' + m[5]); assert.ok(m[7].length > 30); });
        assert.ok(sc[1][1] && sc[1][3], 'the club day scene is the wide TV picture');
        assert.equal(sc.filter((m) => m[1]).length, 1);
    });
    test('the sheets: five dialogs, hidden on arrival, labelled, X button, 37 pictures + 2 notes', () => {
        const ds = [...sheets.matchAll(/<div class="sheet" id="sheet-([a-z]+)" role="dialog" aria-modal="true" aria-labelledby="sheet-\1-h" hidden>/g)].map((m) => m[1]);
        assert.deepEqual(ds, ['weekly', 'club', 'trip', 'tournaments', 'gps']);
        ds.forEach((d) => assert.ok(sheets.includes('<h3 id="sheet-' + d + '-h">'), d));
        assert.equal((sheets.match(/<button type="button" class="sh-x" aria-label="Close">/g) || []).length, 5);
        // 2026-11-19 (the COMING sweep, ADVISOR-20261119-0134): + the Desk scan check (live since 2026-11-16, v421) in the Tournaments sheet.
        assert.equal((sheets.match(/class="shot"/g) || []).length, 43);   // 2026-11-16: + check-in (2), the 36-hole board (2), skins, pairings (ADVISOR-20261116-0104)
        assert.equal((sheets.match(/<li class="note">/g) || []).length, 0, 'every note became a picture');
        assert.match(sheets, /data-shot="board36" data-group="Tournaments"[\s\S]*data-shot="board36-tv" data-group="Tournaments" data-wide[\s\S]*data-shot="skins-tab"[\s\S]*data-shot="pairings-tab"/);
        // check-in is live (rules 2026-11-16 00:30, CHECKIN_LIVE 00:43): its COMING note became two real pictures of the shipped pages
        assert.doesNotMatch(sheets, /COMING<\/span> Check-in/);
        assert.match(sheets, /data-shot="checkin-table" data-group="Tournaments"[\s\S]*data-shot="checkin-tv" data-group="Tournaments" data-wide/);
    });
    test('every data-open-key on the page is a card the rows have or one of the five new pictures', () => {
        const keys = [...body.matchAll(/data-open-key="([^"]+)"/g)].map((m) => m[1]);
        assert.ok(keys.length >= 70, keys.length);
        const known = new Set(cardKeys.concat(shots.map((s) => s.shot), vxKeys));
        // what's new re-pin: exactly the four 2.0.7 cards a tile or sheet still opens, none of them also a row card here
        assert.deepEqual(vxKeys, ['round-tabs', 'green-slope', 'green-size', 'team-card']);
        vxKeys.forEach((k) => { assert.ok(!cardKeys.includes(k), k + ' is a row card too'); assert.ok(keys.includes(k), 'positive: something opens ' + k); });
        keys.forEach((k) => assert.ok(known.has(k), 'nothing opens for ' + k));
        // 2.0.9 site (web-209-coming, Nov 16): + the two cards of the Coming in 2.0.9 row = 40; 2.0.9 release (Nov 17): the same two, now the New in 2.0.9 row inside #features.
        // what's new re-pin (2026-11-19): the 8 release cards (2.0.9: 2, 2.0.8: 2, 2.0.7: 4) moved to whats-new.html; 40 - 8 = 32.
        assert.equal(cardKeys.length, 32, 'the homepage rows hold the 32 cards of Play, Games, Your group, Organize and Get better');
    });
    test('the twelve pictures of media/home (+ scan-check 2026-11-19): each once, its group, a real alt, files on disk at the manifest\'s sizes, the three TV ones wide; no weekly-results (it shows amounts)', () => {
        assert.deepEqual(shots.map((s) => s.shot), ['round-recap', 'live-tv', 'live-board-phone', 'multi-group-board', 'board36', 'board36-tv', 'skins-tab', 'pairings-tab', 'checkin-table', 'checkin-tv', 'scan-check', 'gps-every-yard']);
        const man = JSON.parse(read('media/home/manifest.json'));
        assert.deepEqual(man.shots.map((s) => s.key).sort(), shots.map((s) => s.shot).sort());
        shots.forEach((s) => {
            assert.equal(s.key, s.shot);
            assert.ok(s.img.alt.length >= 80, s.shot + ' alt: ' + s.img.alt);
            const m = man.shots.find((x) => x.key === s.shot);
            assert.equal(s.img.width, String(m.width)); assert.equal(s.img.height, String(m.height));
            m.files.forEach((f) => assert.ok(exists(f.slice(1)) && fs.statSync(path.join(ROOT, f.slice(1))).size > 5000, f));
            const set = s.img.srcset.split(',').map((x) => x.trim().split(' ')[0]);
            assert.deepEqual(set, m.files, s.shot + ' srcset is the manifest\'s two files');
            assert.equal(s.wide, ['live-tv', 'checkin-tv', 'board36-tv'].includes(s.shot));
        });
        assert.deepEqual(shots.map((s) => s.group), ['Weekly game', 'Club day', 'Club day', 'Tournaments', 'Tournaments', 'Tournaments', 'Tournaments', 'Tournaments', 'Tournaments', 'Tournaments', 'Tournaments', 'GPS']);
        assert.ok(!exists('media/home/weekly-results-400.webp') && !exists('media/home/weekly-results-940.webp'));
        assert.match(man._about, /weekly-results[\s\S]*NOT used/);
    });
    test('the tiles: 41 with a picture into the viewer, none without one, none COMING (2026-11-19: Scan check is live and pictured; Check-in, the 36-hole board and Skins & pairings got their pictures 2026-11-16); the Founding line comes from site-pricing.js', () => {
        const pic = [...glance.matchAll(/<button type="button" class="gt" data-open-key="([^"]+)"><img src="([^"]+)" loading="lazy" decoding="async" alt=""><span>([^<]*)<\/span><\/button>/g)];
        assert.equal(pic.length, 41);
        pic.forEach((m) => assert.ok(exists(m[2].slice(1)), m[2]));
        assert.deepEqual([...glance.matchAll(/<span class="gt plain"><span class="ic">[^<]*<\/span><span>([^<]*)<small>picture coming<\/small><\/span><\/span>/g)].map((m) => m[1]), []);
        assert.ok(glance.includes('data-open-key="board36"><img src="/media/home/board36-400.webp"') && glance.includes('data-open-key="skins-tab"><img src="/media/home/skins-tab-400.webp"'), 'the two former picture-coming tiles carry their pictures');
        assert.deepEqual([...glance.matchAll(/<span class="gt soon"><span class="ic">[^<]*<\/span><span><small>COMING<\/small>([^<]*)<\/span><\/span>/g)].map((m) => m[1]), []);
        assert.ok(glance.includes('data-open-key="scan-check"><img src="/media/home/scan-result-phone-400.webp"'), 'positive: the Scan check tile carries its picture');
        assert.equal((glance.match(/class="gt/g) || []).length, 41);
        assert.match(glance, /<p class="strip"><a href="#pricing"><span data-price="pro-label">[^<]+<\/span> <b data-price="pro-headline">\$[0-9.]+\/yr<\/b> &middot; the first 1,000 golfers &middot; locked for as long as you stay subscribed\. Pricing &darr;<\/a><\/p>/);
        assert.doesNotMatch(glance, /class="soon"/, 'marketing_home_test.js reads class="soon" as the old Android tile');
    });
    test('nothing new says $, a betting word, cash, Venmo or PayPal; no "Coming soon"', () => {
        const t = textOf(newParts);
        assert.doesNotMatch(t, MONEY, (MONEY.exec(t) || [])[0]);
        assert.doesNotMatch(newParts, /Coming soon/i);
        assert.doesNotMatch(JS, /\$\d|venmo/i);
    });
    // 2.0.8 release re-pin: the Coming in 2.0.8 section (#coming208, between the tiles and #features) moved INTO #features as
    // its first row, "New in 2.0.8" (#g-update); the order is now tiles, #features (starting with #g-update), the viewer.
    // WHAT'S NEW RE-PIN (2026-11-19): the release rows left for whats-new.html; in their place, first inside #features, the What's new link.
    test('the rows, the What\'s new link (first inside #features) and the viewer are still there, after the new sections; the header is unchanged', () => {
        const iGlance = body.indexOf('id="everything"'), iFeat = body.indexOf('<section class="feat" id="features">'), iLink = body.indexOf('<p class="wnlink"><a id="whats-new-link" href="/whats-new">'), iPlay = body.indexOf('<div class="grp" id="g-play">'), iFv = body.indexOf('<div class="fv" id="fv"');
        assert.ok(iGlance > 0 && iFeat > iGlance && iLink > iFeat && iPlay > iLink && iFv > iPlay, [iGlance, iFeat, iLink, iPlay, iFv].join(' '));
        assert.doesNotMatch(body, /id="g-update|id="g-new"|<h2>New in 2\.0\./, 'a release row is still on the homepage');
        const wn = stripComments(read('whats-new.html'));
        const w9 = wn.indexOf('<div class="grp" id="g-update">'), w8 = wn.indexOf('<div class="grp" id="g-update208">'), w7 = wn.indexOf('<div class="grp" id="g-new">');
        assert.ok(w9 > 0 && w8 > w9 && w7 > w8, 'whats-new.html: 2.0.9, 2.0.8, 2.0.7 in that order: ' + [w9, w8, w7].join(' '));
        assert.equal(body.indexOf('id="coming208"'), -1, 'the Coming in 2.0.8 section is still on the page');
        // 2.0.9 release re-pin (Nov 17): the Coming in 2.0.9 section moved INTO #features as "New in 2.0.9" (#g-update, first);
        // the 2.0.8 row is #g-update208 right under it, then New in 2.0.7 (#g-new).
        assert.equal(body.indexOf('id="coming209"'), -1, 'the Coming in 2.0.9 section is still on the page');
        const i208b = body.indexOf('<div class="grp" id="g-update208">');
        assert.equal(i208b, -1, 'what\'s new re-pin: the 2.0.8 row is on whats-new.html, not here');
        assert.equal((body.match(/<div class="fv" id="fv"/g) || []).length, 1);
        assert.match(body, /<nav class="wrap toplinks" aria-label="Main">\s*<div class="links">/);
        assert.match(body, /<div class="stick" id="stick" aria-label="HardPan Golf">\s*<div class="wrap stick-in">\s*<a class="logo" href="\/"><img src="\/media\/home\/hardpan-golf-lockup\.png" alt="HardPan Golf" width="1278" height="222"><\/a>/);
        assert.equal((body.match(/id="nav-get-app"/g) || []).length, 1);
        assert.match(body, /<a class="btn lime" id="nav-get-app" href="#get-the-app">Get the app<\/a>/);
        assert.doesNotMatch(body, /<nav class="wrap top" |hardpan-icon\.svg" alt="" width="36"/, 'the old icon + two-line header is gone from the homepage');
        assert.ok(body.includes('id="pricing"') && body.includes('id="get-the-app"') && body.includes('<footer>'));
    });
    test('the grid is .glance-tiles, never .tiles (the Try the GPS map\'s tile layer); the new CSS keeps real sizes', () => {
        assert.equal((body.match(/class="tiles"/g) || []).length, 1, 'only the map has class="tiles"');
        assert.ok(body.includes('<div class="glance-tiles">'));
        const mine = CSS.slice(CSS.indexOf('HOMEPAGE A'));
        assert.ok(mine.length > 2000, 'the HOMEPAGE A CSS block');
        assert.doesNotMatch(mine, /(^|[^-\w])\.tiles\b/, 'a .tiles rule would move the map\'s tile layer');
        ['.door { display:flex; align-items:center; justify-content:center; min-height:52px;', '.door { min-height:48px;', '.gt { display:flex;', 'min-height:64px;', '.sh-x { width:44px; height:44px;', '.scene .tx .more { display:inline-flex; align-items:center; margin-top:12px; min-height:44px;', '.fold .lk { height:60px; }', '.fold .lk { position:absolute; left:50%; top:0;', '.stick { position:fixed;', '.stick.on { transform:none; }']
            .forEach((s) => assert.ok(mine.includes(s), s));
        assert.deepEqual(mine.match(/font-size:1[0-4](\.\d+)?px/g), ['font-size:11.5px'], 'text under 15 px: only the COMING / picture-coming tag (11.5 px, a label, not a sentence)');
    });
    test('site-features.js: the five pictures become viewer items with their key, data-open-key opens by key, data-sheet opens a sheet, the wide slide', () => {
        assert.ok(JS.includes("key: c.getAttribute('data-key')"), 'cards carry their key');
        assert.ok(JS.includes("document.querySelectorAll('[data-shot]')") && JS.includes("wide: b.hasAttribute('data-wide')"));
        assert.ok(JS.includes('function openKey(key, from)') && JS.includes("ev.target.closest('[data-open-key]')"));
        assert.ok(JS.includes("ev.target.closest('[data-sheet]')") && JS.includes('function closeSheet()') && JS.includes("if (ev.key === 'Escape' && fv.hidden && !fv.contains(ev.target)) closeSheet();"));
        assert.ok(JS.includes("(it.wide ? ' wide' : '')"));
        assert.ok(JS.includes("new IntersectionObserver(function (es) { es.forEach(function (e) { stick.classList.toggle('on', !e.isIntersecting && e.boundingClientRect.top < 0); }); }, { threshold: 0 }).observe(top);"), 'the sticky bar follows the fold');
        assert.ok(CSS.includes('.fv-img.wide { aspect-ratio:1400/844;'));
    });
});

describe('1b. organizers.html, the organizer landing (ADVISOR-20261115-2017): one way into the tool, real pictures, COMING tags, no event', () => {
    const org = stripComments(read('organizers.html'));
    test('the page: lockup to /, the buttons to /tournaments (three, nothing else goes there; the domain switch of 2026-11-16), badges Apple then Google, the price slots, no dollar figure of its own', () => {
        assert.match(org, /<a class="logo" href="\/"><img src="\/media\/home\/hardpan-golf-lockup\.png" alt="HardPan Golf"/);
        assert.deepEqual([...org.matchAll(/href="\/tournaments"/g)].length, 3);
        assert.match(org, /id="run-an-event" href="\/tournaments">Run an event/);
        assert.ok(org.indexOf('store-apple') < org.indexOf('store-google'));
        assert.match(org, /data-price="pro-label"[\s\S]*data-price="pro-headline"/);
        assert.doesNotMatch(textOf(org), /\$\d/, 'no dollar figure typed into the page');
        // this page names Venmo and PayPal on purpose (two COMING cards); every other money word stays out
        const MONEY_ORG = /\$|\b(bet|bets|betting|wager\w*|gambl\w*|pot|pots|buy-?ins?|stake|stakes|dollars?|bucks|cash)\b/i;
        assert.doesNotMatch(textOf(org), MONEY_ORG, (MONEY_ORG.exec(textOf(org)) || [])[0]);
        // "locked for as long as you stay subscribed" is the Founding price wording (the homepage strip says it too); the words that
        // may never appear in a UI string are protected / secure.
        assert.doesNotMatch(org, /R7SK48|Test 46A|NA4EZB|KHPSL4|3MKUCF|P7S2BE|VETDEMO|protected|secure\b/i);
        assert.doesNotMatch(org, /site-features\.js|firebase|sw\.js/i, 'a static page: no viewer script, no app plumbing');
    });
    test('every picture is a real file on disk; the two Venmo cards and check-in are tagged COMING; the 36-hole card has no picture and no tag', () => {
        const pics = [...org.matchAll(/<img src="(\/media\/[^"]+)"/g)].map((m) => m[1]);
        assert.equal(pics.length, 13, 'the lockup + 12 cards');
        pics.forEach((f) => assert.ok(exists(f.slice(1)), f));
        const cards = [...org.matchAll(/<div class="card( plain)?">([\s\S]*?)<\/div><\/div>/g)];
        assert.equal(cards.length, 12);
        const coming = cards.filter((c) => /class="cmg">COMING</.test(c[2])).map((c) => /<h2>([^<]*)<\/h2>/.exec(c[2])[1]);
        // 2026-11-19 (the COMING sweep): Venmo A has been live since its merge 167c65ec (2026-11-16); both cards lose the tag.
        assert.deepEqual(coming, []);   // 2026-11-16: check-in is live and pictured
        assert.ok(cards.some((c) => /<h2>Entry fees by Venmo or PayPal<\/h2>/.test(c[2])) && cards.some((c) => /<h2>Pay-outs from the results<\/h2>/.test(c[2])), 'positive: the two cards are still there');
        assert.match(org, /<div class="card"><div class="pic ci"><img src="\/media\/home\/board36-tv-700\.webp"[^>]*><\/div><div class="tx"><h2>36-hole events<\/h2>/);
    });
});

// ---------------------------------------------------------------------------
// 2. Chrome. --use-mock-keychain: without it Chrome on this Mac waits on the login keychain for any
// http navigation (website-d, measured). The page is scrolled with scrollIntoView (smooth on this
// page: html { scroll-behavior:smooth }), so a tap waits until the target stops moving.
// ---------------------------------------------------------------------------
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CAN = fs.existsSync(CHROME) && typeof WebSocket === 'function';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webp': 'image/webp', '.mp4': 'video/mp4', '.jpg': 'image/jpeg' };
function serve() {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
            if (p === '/') p = '/hardpan-home.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
            res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
            res.end(fs.readFileSync(f));
        });
        srv.listen(0, '127.0.0.1', () => resolve(srv));
    });
}
class Tab {
    async open() {
        this.profile = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hp-home-a-'));
        this.port = 9400 + Math.floor(Math.random() * 400);
        this.chrome = spawn(CHROME, ['--headless=new', '--use-mock-keychain', '--remote-debugging-port=' + this.port, '--user-data-dir=' + this.profile, '--window-size=1400,1000', '--hide-scrollbars', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
        let list = null;
        for (let i = 0; i < 60 && !list; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + this.port + '/json', (r) => { let b = ''; r.on('data', (d) => b += d); r.on('end', () => res(JSON.parse(b))); }).on('error', rej)); } catch (e) { await sleep(250); } }
        const page = list.find((t) => t.type === 'page');
        this.ws = new WebSocket(page.webSocketDebuggerUrl);
        this.id = 0; this.pending = new Map(); this.errors = [];
        this.ws.addEventListener('message', (ev) => {
            const d = JSON.parse(ev.data);
            if (d.id && this.pending.has(d.id)) { this.pending.get(d.id)(d); this.pending.delete(d.id); }
            if (d.method === 'Runtime.exceptionThrown') this.errors.push(JSON.stringify(d.params.exceptionDetails).slice(0, 200));
        });
        await new Promise((r) => this.ws.addEventListener('open', r));
        await this.send('Runtime.enable'); await this.send('Page.enable');
    }
    send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const i = ++this.id; this.pending.set(i, resolve);
            this.ws.send(JSON.stringify({ id: i, method, params }));
            setTimeout(() => { if (this.pending.has(i)) { this.pending.delete(i); reject(new Error(method + ' timed out')); } }, 30000);
        });
    }
    async metrics(w, h) { await this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 }); }
    async eval(expression) {
        const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
        return r.result.result.value;
    }
    async go(url) { await this.send('Page.navigate', { url }); await sleep(1500); }
    async tap(x, y) {
        for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
        await sleep(300);
    }
    // scroll the element to the middle, wait until it stops moving (smooth scroll), tap its centre
    async tapEl(sel) {
        await this.eval(`(() => { document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: 'center', inline: 'center' }); return true; })()`);
        let last = null, same = 0;
        for (let i = 0; i < 40 && same < 3; i++) {
            await sleep(100);
            const r = await this.eval(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]; })()`);
            if (last && r[0] === last[0] && r[1] === last[1]) same++; else same = 0;
            last = r;
        }
        const hit = await this.eval(`(() => { const e = document.elementFromPoint(${last[0]}, ${last[1]}); return e ? (e.closest(${JSON.stringify(sel)}) ? 'self' : e.tagName + '.' + e.className) : null; })()`);
        assert.equal(hit, 'self', sel + ' is covered by ' + hit + ' at ' + last.join(','));
        await this.tap(last[0], last[1]);
    }
    // a real finger: touch emulation on, touchStart/touchEnd at the point (no mouse events at all)
    async touchOn() { await this.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); }
    async fingerTap(sel) {
        await this.eval(`(() => { document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: 'center', behavior: 'instant' }); return true; })()`);
        await sleep(350);
        const p = await this.eval(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; })()`);
        await this.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
        await sleep(50);
        await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await sleep(350);
    }
    // a scroll that begins on the element: the finger lands on it, moves up `dy` px in a few steps, lifts (touch events only)
    async fingerSwipeUp(sel, dy) {
        await this.eval(`(() => { document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: 'center', behavior: 'instant' }); return true; })()`);
        await sleep(350);
        const p = await this.eval(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; })()`);
        await this.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
        for (let i = 1; i <= 6; i++) { await sleep(25); await this.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y - Math.round(dy * i / 6) }] }); }
        await sleep(25);
        await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await sleep(450);
    }
    async key(key) {
        await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: { Escape: 27 }[key] || 0 });
        await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key });
        await sleep(300);
    }
    async close() {
        try { this.ws.close(); } catch (e) { /* gone */ }
        const gone = new Promise((r) => { this.chrome.once('exit', r); setTimeout(r, 5000); });
        try { this.chrome.kill(); } catch (e) { /* gone */ }
        await gone;
        try { this.chrome.stderr.destroy(); } catch (e) { /* closed */ }
        try { fs.rmSync(this.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (e) { /* harmless */ }
    }
}
const STATE = `(() => { const fv = document.getElementById('fv'), open = document.querySelector('.sheet:not([hidden])'), a = document.activeElement;
    return { fv: !fv.hidden, n: document.getElementById('fv-n').textContent, title: document.getElementById('fv-title').textContent,
        wide: !!(fv.hidden ? null : document.querySelector('#fv-track .fv-s[data-i="' + (function () { const t = document.getElementById('fv-track'); return Math.round(t.scrollLeft / Math.max(1, t.clientWidth)); })() + '"] .fv-img.wide')),
        sheet: open ? open.id : null, sheetOpen: document.documentElement.classList.contains('sheet-open'),
        focus: a ? (a.id || a.className) : null, focusShot: !!(a && a.closest && a.closest('.shot')), focusScene: !!(a && a.closest && a.closest('.scene')), hash: location.hash }; })()`;

describe('2. in Chrome: the fold, then a visitor\'s taps', { skip: CAN ? false : 'Chrome or WebSocket not available' }, () => {
    let srv, base, tab;
    before(async () => { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port; tab = new Tab(); await tab.open(); });
    after(async () => { if (tab) await tab.close(); if (srv) srv.close(); });

    test('2.1 390x844: no page error, no sideways scroll, the line, both doors and both badges above the fold, every tap target 44 px or taller', async () => {
        await tab.metrics(390, 844);
        await tab.go(base + '/');
        assert.deepEqual(tab.errors, []);
        const m = await tab.eval(`(() => { const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), h: Math.round(b.height), w: Math.round(b.width) }; };
            const small = [...document.querySelectorAll('.door, .mt, .scene, .gt, .shot')].filter((e) => e.getBoundingClientRect().height < 44 && e.getBoundingClientRect().height > 0).map((e) => e.className);
            const text = [...document.querySelectorAll('.fold, .how, .glance')].flatMap((s) => [...s.querySelectorAll('h1, h2, p, b, span, a, button')]).filter((e) => e.children.length === 0 && e.textContent.trim() && !e.closest('.sheet') && !e.matches('small'))
                .map((e) => e.tagName + '.' + e.className + ':' + parseFloat(getComputedStyle(e).fontSize)).filter((x) => parseFloat(x.split(':').pop()) < 15);
            return { sw: document.documentElement.scrollWidth, h1: parseFloat(getComputedStyle(document.querySelector('h1.one')).fontSize), g: r('#door-golfers'), o: r('#hero-start-tournament'), badges: r('.fold .badges'), fan: r('.fan'), lk: r('.fold .lk'), lkTop: Math.round(document.querySelector('.fold .lk').getBoundingClientRect().top), fanTop: Math.round(document.querySelector('.fan').getBoundingClientRect().top), phones: document.querySelectorAll('.fp').length, stick: document.getElementById('stick').className, stickTop: Math.round(document.getElementById('stick').getBoundingClientRect().bottom), small, text }; })()`);
        assert.equal(m.sw, 390, 'sideways scroll');
        assert.ok(m.h1 >= 28, 'h1 ' + m.h1);
        assert.ok(m.g.h >= 44 && m.o.h >= 44 && m.g.b <= 844 && m.o.b <= 844, 'doors ' + JSON.stringify([m.g, m.o]));
        assert.ok(m.badges.b <= 844 && m.badges.h >= 44, 'badges ' + JSON.stringify(m.badges));
        // F2: the fan (three phones) comes first, the lockup plate overlaps its top edge, and in Safari's 714 px of page the doors
        // and the badges are still inside the fold (the F2 sheet measured badges ending at 712).
        assert.equal(m.phones, 3);
        assert.ok(m.fan.b < 714 && m.lk.t < m.fanTop + 10 && m.lk.b > m.fanTop, 'fan ' + JSON.stringify(m.fan) + ' lockup ' + JSON.stringify(m.lk) + ' fanTop ' + m.fanTop);
        assert.ok(m.lk.h >= 60 && m.lk.h <= 80, 'lockup plate height ' + m.lk.h);
        assert.ok(m.badges.b <= 714, 'badges end at ' + m.badges.b + ' (Safari fold 714)');
        assert.equal(m.stick, 'stick', 'the sticky bar is off on arrival'); assert.ok(m.stickTop <= 0, 'the sticky bar is off screen on arrival: ' + m.stickTop);
        assert.deepEqual(m.small, [], 'tap targets under 44 px');
        assert.deepEqual(m.text, [], 'text under 15 px');
    });
    test('2.2 a tap on the first scene opens its sheet (hidden before), focus on its X; a tap on the first picture opens the viewer on Round recap', async () => {
        let s = await tab.eval(STATE);
        assert.equal(s.sheet, null); assert.equal(s.fv, false);
        await tab.tapEl('.scene[data-sheet="weekly"]');
        s = await tab.eval(STATE);
        assert.equal(s.sheet, 'sheet-weekly'); assert.equal(s.sheetOpen, true); assert.equal(s.focus, 'sh-x');
        // every thumbnail in the sheet is drawn at the card shape (400:868), not at its file's height attribute (2040 px)
        const shapes = await tab.eval(`[...document.querySelectorAll('#sheet-weekly .shot img')].map((i) => { const b = i.getBoundingClientRect(); return Math.round(b.height / b.width * 100) / 100; })`);
        assert.ok(shapes.length === 8 && shapes.every((r) => r > 2.1 && r < 2.25), 'thumbnail height / width: ' + JSON.stringify(shapes));
        await tab.tapEl('#sheet-weekly .shot');
        s = await tab.eval(STATE);
        assert.equal(s.fv, true); assert.equal(s.title, 'Round recap'); assert.equal(s.n, 'Weekly game · 1 / 1'); assert.equal(s.wide, false);
        const big = await tab.eval(`(() => { const t = document.getElementById('fv-track'); const cur = Math.round(t.scrollLeft / Math.max(1, t.clientWidth)); const i = t.querySelector('.fv-s[data-i="' + cur + '"] img'); return i ? i.getAttribute('src') : null; })()`);
        assert.equal(big, '/media/home/round-recap-940.webp', 'the viewer shows the sharp file');
    });
    test('2.3 Esc closes the viewer and focus returns to the picture; Esc again closes the sheet and focus returns to the scene', async () => {
        await tab.key('Escape');
        let s = await tab.eval(STATE);
        assert.equal(s.fv, false); assert.equal(s.sheet, 'sheet-weekly'); assert.equal(s.focusShot, true, 'focus: ' + s.focus);
        await tab.key('Escape');
        s = await tab.eval(STATE);
        assert.equal(s.sheet, null); assert.equal(s.sheetOpen, false); assert.equal(s.focusScene, true, 'focus: ' + s.focus);
    });
    test('2.4 the club day scene opens its sheet; its first picture is the TV board on the wide slide; the X closes the sheet', async () => {
        await tab.tapEl('.scene[data-sheet="club"]');
        let s = await tab.eval(STATE);
        assert.equal(s.sheet, 'sheet-club');
        const tv = await tab.eval(`(() => { const b = document.querySelector('#sheet-club .wide .shot img').getBoundingClientRect(); return Math.round(b.height / b.width * 100) / 100; })()`);
        assert.ok(tv > 0.58 && tv < 0.63, 'the TV thumbnail is 16:9-ish (1400:844): ' + tv);
        await tab.tapEl('#sheet-club .shot');
        s = await tab.eval(STATE);
        assert.equal(s.fv, true); assert.equal(s.title, 'The board on the clubhouse TV'); assert.equal(s.n, 'Club day · 1 / 2'); assert.equal(s.wide, true);
        await tab.key('Escape');
        await tab.tapEl('#sheet-club .sh-x');
        s = await tab.eval(STATE);
        assert.equal(s.sheet, null); assert.equal(s.fv, false);
    });
    test('2.5 a tile opens the viewer on the SAME item the row has (Play · 1 / 6), not a copy; a sheet picture of a row card does too', async () => {
        await tab.tapEl('.gt[data-open-key="gps"]');
        let s = await tab.eval(STATE);
        assert.equal(s.fv, true); assert.equal(s.title, 'Every yard. Every hole.'); assert.equal(s.n, 'Play · 1 / 6');
        await tab.key('Escape');
        await tab.tapEl('.scene[data-sheet="trip"]');
        await tab.tapEl('#sheet-trip .shot[data-open-key="history"]');
        s = await tab.eval(STATE);
        assert.equal(s.fv, true); assert.equal(s.title, 'Every round you’ve played.'); assert.equal(s.n, 'Your group · 5 / 5');
        await tab.key('Escape'); await tab.key('Escape');
        s = await tab.eval(STATE);
        assert.equal(s.sheet, null);
        const slides = await tab.eval(`document.querySelectorAll('#fv-track .fv-s').length`);
        // 2.0.9 site (web-209-coming, Nov 16): + the two 2.0.9 cards (the viewer walks every .fc on the page); 2.0.9 release (Nov 17): the same two, now inside #features first.
        // what's new re-pin (2026-11-19): the 8 release cards left for whats-new.html; the 4 of them a tile still opens stay as viewer-only items: 32 + 12 + 4.
        assert.equal(slides, 32 + 12 + 4, 'the viewer holds the 32 row cards, the 12 media/home pictures (six added 2026-11-16, scan-check 2026-11-19) and the 4 viewer-only 2.0.7 cards, each once');
        // a phone of the fan is a door into its sheet too
        await tab.tapEl('.fp.c');
        s = await tab.eval(STATE);
        assert.equal(s.sheet, 'sheet-gps');
        await tab.key('Escape');
        s = await tab.eval(STATE);
        assert.equal(s.sheet, null);
    });
    test('2.5b scrolled past the fold, the sticky bar is on screen with the lockup and Get the app; back at the top it is gone', async () => {
        await tab.eval(`(() => { window.scrollTo(0, 1400); return true; })()`);
        await sleep(700);
        let b = await tab.eval(`(() => { const s = document.getElementById('stick'); const r = s.getBoundingClientRect(); const lk = s.querySelector('.logo img').getBoundingClientRect(); const g = document.getElementById('nav-get-app').getBoundingClientRect(); return { on: s.classList.contains('on'), top: Math.round(r.top), h: Math.round(r.height), lk: Math.round(lk.height), get: Math.round(g.height), getOn: g.right <= 390 && g.left > 0 }; })()`);
        assert.ok(b.on && b.top === 0 && b.h >= 44 && b.lk >= 28 && b.get >= 36 && b.getOn, JSON.stringify(b));
        await tab.eval(`(() => { window.scrollTo(0, 0); return true; })()`);
        await sleep(700);
        b = await tab.eval(`(() => { const s = document.getElementById('stick'); return { on: s.classList.contains('on'), bottom: Math.round(s.getBoundingClientRect().bottom) }; })()`);
        assert.ok(!b.on && b.bottom <= 0, JSON.stringify(b));
    });
    test('2.6 the Golfers door lands on #how; the Organizers door is /organizers', async () => {
        await tab.tapEl('#door-golfers');
        await sleep(600);
        const s = await tab.eval(STATE);
        assert.equal(s.hash, '#how');
        assert.equal(await tab.eval(`document.getElementById('hero-start-tournament').getAttribute('href')`), '/organizers');
        assert.deepEqual(tab.errors, []);
    });
    test('2.8 390x844 with a FINGER (touch events, no mouse): every tile with a picture opens the viewer on the right item (a still, or the clip with its poster for the six clip features), top to bottom; a touch on the X closes it (ADVISOR-20261115-2015)', async () => {
        await tab.metrics(390, 844);
        await tab.touchOn();
        await tab.go(base + '/');
        const keys = await tab.eval(`[...document.querySelectorAll('.glance-tiles .gt[data-open-key]')].map((b) => b.getAttribute('data-open-key'))`);
        assert.equal(keys.length, 41);
        const bad = [];
        for (const k of keys) {
            await tab.fingerTap('.glance-tiles .gt[data-open-key="' + k + '"]');
            const s = await tab.eval(STATE);
            const cur = await tab.eval(`(() => { const t = document.getElementById('fv-track'); const i = Math.round(t.scrollLeft / Math.max(1, t.clientWidth)); const li = t.querySelector('.fv-s[data-i="' + i + '"]'); const im = li && (li.querySelector('img') || li.querySelector('video')); return { i, img: im ? (im.getAttribute('src') || im.getAttribute('poster')) : null, w: im ? Math.round(im.getBoundingClientRect().width) : 0 }; })()`);
            if (!s.fv || !s.title || !cur.img || cur.w < 200) bad.push(k + ':' + JSON.stringify({ fv: s.fv, title: s.title, cur }));
            await tab.fingerTap('#fv-x');
            const c = await tab.eval(STATE);
            if (c.fv) bad.push(k + ': X did not close');
        }
        assert.deepEqual(bad, [], 'tiles that did not open on a finger tap: ' + bad.join(' | '));
        assert.deepEqual(tab.errors, []);
    });
    test('2.8b 390x844 with a FINGER: a scroll that begins on a tile or on a scene card scrolls the page and opens NOTHING (ADVISOR-20261116-1000: "swipe up to scroll down, it opens up the closest tile"); the same finger tapping the tile afterwards still opens it', async () => {
        await tab.metrics(390, 844);
        await tab.touchOn();
        await tab.go(base + '/');
        const keys = await tab.eval(`[...document.querySelectorAll('.glance-tiles .gt[data-open-key]')].map((b) => b.getAttribute('data-open-key'))`);
        const opened = [];
        for (const k of [keys[0], keys[Math.floor(keys.length / 2)], keys[keys.length - 1]]) {
            const sel = '.glance-tiles .gt[data-open-key="' + k + '"]';
            const before = await tab.eval('Math.round(window.scrollY)');
            await tab.fingerSwipeUp(sel, 160);
            const s = await tab.eval(STATE);
            const after = await tab.eval('Math.round(window.scrollY)');
            if (s.fv || s.sheet) opened.push(k + ':' + JSON.stringify({ fv: s.fv, sheet: s.sheet }));
            assert.ok(after > before, k + ': the swipe scrolled the page (' + before + ' -> ' + after + ')');
        }
        for (const d of ['weekly', 'tournaments']) {
            await tab.fingerSwipeUp('.scene[data-sheet="' + d + '"]', 160);
            const s = await tab.eval(STATE);
            if (s.fv || s.sheet) opened.push('scene ' + d + ':' + JSON.stringify({ fv: s.fv, sheet: s.sheet }));
        }
        assert.deepEqual(opened, [], 'a scroll opened something: ' + opened.join(' | '));
        // positive: the finger that only taps still opens the tile
        await tab.fingerTap('.glance-tiles .gt[data-open-key="' + keys[keys.length - 1] + '"]');
        const t = await tab.eval(STATE);
        assert.ok(t.fv && t.title, 'a tap on the last tile opens the viewer: ' + JSON.stringify(t));
        await tab.fingerTap('#fv-x');
        assert.deepEqual(tab.errors, []);
    });
    test('2.9 /organizers at 390x844: no sideways scroll, every button 44 px or taller, text 15 px or larger, a finger on Run an event goes to /tournaments (the domain switch of 2026-11-16)', async () => {
        await tab.metrics(390, 844);
        await tab.touchOn();
        await tab.go(base + '/organizers.html');
        const m = await tab.eval(`(() => { const small = [...document.querySelectorAll('.btn')].filter((e) => e.getBoundingClientRect().height < 44).length;
            const text = [...document.querySelectorAll('h1, h2, p, a, span')].filter((e) => e.children.length === 0 && e.textContent.trim() && !e.closest('footer') && !e.matches('.k, .cmg')).map((e) => parseFloat(getComputedStyle(e).fontSize)).filter((px) => px < 15).length;
            return { sw: document.documentElement.scrollWidth, small, text, h1: parseFloat(getComputedStyle(document.querySelector('h1')).fontSize), price: document.querySelector('[data-price="pro-headline"]').textContent }; })()`);
        assert.equal(m.sw, 390); assert.equal(m.small, 0); assert.equal(m.text, 0); assert.ok(m.h1 >= 28);
        assert.match(m.price, /^\$\d+\.\d\d\/yr$/, 'the price slot filled from site-pricing.js: ' + m.price);
        const under = await tab.eval(`(() => { document.getElementById('run-an-event').scrollIntoView({ block: 'center', behavior: 'instant' }); const b = document.getElementById('run-an-event').getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return { id: e && (e.id || e.tagName + '.' + e.className), href: e && e.closest('a') && e.closest('a').getAttribute('href'), rect: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] }; })()`);
        assert.equal(under.href, '/tournaments', 'under the finger: ' + JSON.stringify(under));
        // the finger's click reaches the link (recorded by a listener that also keeps the test on the page: the local server has no /tournaments route)
        await tab.eval(`(() => { window.__tapped = null; document.addEventListener('click', (ev) => { const a = ev.target.closest('a'); window.__tapped = a ? a.getAttribute('href') : 'none'; ev.preventDefault(); }, true); return true; })()`);
        await tab.fingerTap('#run-an-event');
        assert.equal(await tab.eval('window.__tapped'), '/tournaments', 'the finger\'s click did not reach Run an event (under the finger: ' + JSON.stringify(under) + ')');
        assert.deepEqual(tab.errors, []);
    });
    test('2.7 1280x800: no sideways scroll, the lockup 110 px over the fan (centre phone highest), the links row, the scenes 2 across, the tiles 6 across; the map\'s tile layer still at 0', async () => {
        await tab.metrics(1280, 800);
        await tab.go(base + '/');
        const m = await tab.eval(`(() => { const tops = (s) => [...document.querySelectorAll(s)].map((e) => Math.round(e.getBoundingClientRect().top));
            const row = (s, n) => new Set(tops(s).slice(0, n)).size === 1 && new Set(tops(s).slice(0, n + 1)).size === 2;
            const tl = document.querySelector('#tg-map .tiles'); const cs = getComputedStyle(tl);
            const fp = (s) => document.querySelector(s).getBoundingClientRect();
            return { sw: document.documentElement.scrollWidth, scenes2: row('.scene', 2), tiles6: row('.glance-tiles .gt', 6), mapTop: tl.offsetTop, mapMargin: cs.marginTop, mapDisplay: cs.display,
                lk: Math.round(fp('.fold .lk').height), centreTop: Math.round(fp('.fp.c').top), leftTop: Math.round(fp('.fp.l').top), rightTop: Math.round(fp('.fp.r').top), links: document.querySelector('.toplinks .links').getBoundingClientRect().height > 0 }; })()`);
        assert.equal(m.sw, 1280);
        assert.ok(m.scenes2 && m.tiles6, JSON.stringify(m));
        assert.ok(m.lk >= 110 && m.lk <= 130 && m.centreTop < m.leftTop && m.centreTop < m.rightTop && m.links, 'desktop fold: ' + JSON.stringify(m));
        assert.equal(m.mapTop, 0); assert.equal(m.mapMargin, '0px'); assert.equal(m.mapDisplay, 'block');
        assert.deepEqual(tab.errors, []);
    });
});
