// ============================================================================
// THE TOURNAMENT SHOWCASE for course decision makers (ADVISOR-20261118-1630 + 1633 + 1637, Manny 2026-11-18:
// "when golf course decision makers look at my website, I want them to visualize what it'll look like for their
// tournaments"). MOCKUPS on preview-showcase: two layouts (see-it-a.html: the scroll story; see-it-b.html: Before /
// During / After tabs with a hero phone), the See-it button first above the fold on /tournaments (tournament.html's
// hero band) and a door on /organizers, the three homepage heading placements (home-h1/h2/h3.html), and the
// address: a Pretty URL of its own, /see-it (no rewrite row; /tournaments/see-it is the other option).
//
// WHAT IS HELD. The words a course GM must never read here: Starkey, Scott and the other real names the pitch
// carried, any real event code, bet / pool / wager / gamble, a dollar figure outside a site-pricing slot, a
// competitor's name, "Coming soon" (the site says COMING). What must be there: the nine steps in order, the COMING
// tags on what is not live (event-day GPS for the field, a group's own game in the event, Turn in our card, Venmo),
// every picture a real file in the tree, the contact address as text, the entry button on /tournaments and
// /organizers pointing at /tournaments/see-it, and the rows that serve it.
//
// BASELINE against pre-build main fc9680e7 (none of the mockup files exist there; tournament.html and organizers.html
// without the button): 0 pass / 9 fail / 0 cancelled of 9. On preview-showcase: 9 / 0.
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => { const p = path.join(REPO_ROOT, f); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; };
const PAGES = ['see-it-a.html', 'see-it-b.html'];
const HOME = ['home-h1.html', 'home-h2.html', 'home-h3.html'];
// Text as a reader sees it: tags, scripts and comments stripped.
const textOf = (html) => String(html).replace(/<!--[\s\S]*?-->/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&rsquo;|&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const REAL = /\bStarkey\b|\bScott\b|\bMitch\b|\bRunge\b|\bEmanuel\b|\bEmmanuel\b|\bEman\b|\bPacker\b|\bManny\b|\bOrozco\b|\bCascade\b|\bOlympic\b|Home Course|Agave|\bDuPont\b|Sedona/i;
const CODES = /\b(NA4EZB|KHPSL4|3MKUCF|P7S2BE|R7SK48|STK26|STARK7)\b/;
const MONEY = /\b(bet|bets|betting|wager\w*|gambl\w*|pool|pools|buy-?ins?|stake|stakes|cash|prize money|payout|pay-?outs?)\b/i;
const COMPETITORS = /18birdies|swingu|golfshot|hole19|arccos|golflogix|thegrint|\bgrint\b|golfpad|shot ?scope|golf ?genius|live ?tourney|vpar|golfstatus|bluegolf|eventcaddy/i;
const STEPS = ['Set up in minutes', 'Check-in and join with one code', 'Every golfer\'s phone: GPS and scoring', 'The live board, on every phone and the clubhouse TV', 'Skins and KPs, by flight', 'Paper cards welcome', 'Final results and the recap', 'Next to a typical tournament app', 'Run your next event on HardPan'];

describe('the two showcase layouts', () => {
    test('1 both pages exist, are their own pages (not routes), carry the title, the sample event, the nine steps in order and tap-to-zoom', () => {
        for (const f of PAGES) {
            const h = read(f);
            assert.ok(h, f + ' exists');
            assert.match(h, /<title>See your tournament on HardPan<\/title>/);
            const t = textOf(h);
            assert.match(t, /Sample event: Your Club Invitational/);
            let at = 0;
            STEPS.forEach((s) => { const i = t.indexOf(s, at); assert.ok(i > -1, f + ': step "' + s + '" in order'); at = i; });
            assert.ok((h.match(/class="n">\d<\/span>/g) || []).length >= 9, f + ': nine numbered steps');
            assert.match(h, /id="zoom"[^>]*role="dialog"/, f + ': the zoom overlay');
            assert.match(h, /data-big="\/media\//, f + ': phones carry their big capture');
            assert.match(h, /<script src="\/site-pricing\.js\?v=[0-9a-f]{8}"><\/script>/, f + ': the versioned price file');
        }
        assert.match(read('see-it-b.html'), /id="tab-before"[\s\S]*id="tab-during"[\s\S]*id="tab-after"/, 'B: the three tabs');
        assert.match(read('see-it-b.html'), /id="hero-phone"/, 'B: the hero phone');
        // Part two (ADVISOR-1641b): a visitor picks Tournaments & events or Everyday side games; generic, no course named.
        for (const f of PAGES) {
            const h = read(f);
            assert.match(h, /id="part-events"[\s\S]{0,200}Tournaments &amp; events/, f + ': the first part');
            assert.match(h, /id="part-everyday"[\s\S]{0,120}Everyday side games/, f + ': the second part');
            assert.match(h, /<h2 class="ph2">Everyday side games at your course<\/h2>/);
            ['A side game set up in seconds', 'Join with a code, friends join free', 'The board, live for the group', 'GPS on the tee, for every golfer', 'Paper cards for the older crowd'].forEach((t) => assert.ok(textOf(h).includes(t), f + ': ' + t));
            assert.ok(!/league/i.test(textOf(h)), f + ': no league promise (on hold)');
            assert.match(h, /<span data-price="free-golfers">5<\/span> golfers scores free, forever/);
        }
        assert.match(read('see-it-b.html'), /id="panel-everyday"/, 'B: the everyday panel');
        assert.match(read('see-it-b.html'), /var names = \['before', 'during', 'after', 'everyday'\]/);
    });
    test('2 no real client, course or golfer name, no event code, no competitor, no betting word, no "Coming soon", no dollar figure outside a price slot, on either layout or the homepage mockups', () => {
        // The homepage mockups are the live homepage plus one inserted block: only the block is this wave's text.
        const inserted = (h) => (h.match(/<section class="seeband"[\s\S]*?<\/section>|<div class="seecta"[\s\S]*?<\/div>|<div class="seebar"[\s\S]*?<\/div><\/div>/g) || []).join(' ');
        for (const f of PAGES.concat(HOME)) {
            const h = read(f);
            assert.ok(h, f + ' exists');
            const t = HOME.includes(f) ? textOf(inserted(h)) : textOf(h);
            if (HOME.includes(f)) assert.ok(t.length > 40, f + ': the inserted block was found');
            assert.ok(!REAL.test(t), f + ': a real name on the page: ' + (t.match(REAL) || [])[0]);
            assert.ok(!CODES.test(h), f + ': an event code on the page');
            assert.ok(!COMPETITORS.test(h), f + ': a competitor named');
            assert.ok(!MONEY.test(t), f + ': a betting / money word: ' + (t.match(MONEY) || [])[0]);
            assert.ok(!/coming soon/i.test(t), f + ': "Coming soon" (the site says COMING)');
            // a dollar figure may stand only inside a data-price slot
            const noSlots = h.replace(/<[^>]*data-price="[^"]*"[^>]*>[^<]*<\/[a-z]+>/g, '');
            assert.ok(!/\$\s?\d/.test(textOf(noSlots)), f + ': a dollar figure outside a price slot');
        }
    });
    test('3 what is not live is tagged COMING on both layouts: event-day GPS for the field, a group\'s own game inside the event, Turn in our card, Venmo at sign-up; what is live carries no tag', () => {
        for (const f of PAGES) {
            const h = read(f);
            const coming = (h.match(/<span class="cmg"[^>]*>COMING<\/span>/g) || []).length;
            assert.equal(coming, 6, f + ': six COMING tags (GPS free on event day, the group\'s own game twice - the step and the table -, Turn in our card, Venmo, the everyday paper card)');
            assert.match(h, /COMING<\/span><h3>Paper cards for the older crowd<\/h3>/, f + ': the everyday scan is not live');
            assert.match(h, /COMING<\/span> HardPan GPS free for the whole field on event day\./);
            assert.match(h, /COMING<\/span> Turn in our card:/);
            assert.match(h, /On the way <span class="cmg"[^>]*>COMING<\/span>/);
            assert.match(h, /Venmo or PayPal handle on the sign-up page; Pay beside each winner <span class="cmg"[^>]*>COMING<\/span>/);
            // the live rows of the table say Included; the Desk scan is live
            assert.match(h, /Paper cards read by a scanner at the scoring table<\/td><td class="typ">Not found<\/td><td class="hp">&#10003; Included\. The Desk scan, live/);
            assert.ok(!/Set up in minutes[\s\S]{0,400}COMING/.test(h), f + ': set-up carries no tag');
        }
    });
    test('4 every picture is a real file in the tree, with width, height and alt; the new scan and turn-in captures are the compressed webp copies', () => {
        for (const f of PAGES) {
            const h = read(f);
            const srcs = [...h.matchAll(/<img [^>]*src="(\/[^"]+)"/g)].map((m) => m[1]).concat([...h.matchAll(/data-big="(\/[^"]+)"/g)].map((m) => m[1]));
            assert.ok(srcs.length >= 16, f + ': at least sixteen captures');
            srcs.forEach((s) => assert.ok(fs.existsSync(path.join(REPO_ROOT, s)), f + ': ' + s + ' is in the tree'));
            [...h.matchAll(/<img [^>]*>/g)].forEach((m) => {
                const tag = m[0];
                if (/id="zoom-img"/.test(tag)) return;   // the overlay's image is filled on tap; empty until then
                assert.match(tag, /\balt="[^"]+"/, f + ': alt on ' + tag.slice(0, 60));
                assert.match(tag, /\bwidth="\d+"/, f + ': width on ' + tag.slice(0, 60));
            });
            assert.match(h, /\/media\/home\/scan-result-phone-400\.webp/);
            assert.match(h, /\/media\/home\/turnin-check-phone-400\.webp/);
        }
        ['scan-result-phone-400.webp', 'scan-result-phone-800.webp', 'turnin-check-phone-400.webp', 'turnin-check-phone-800.webp'].forEach((n) => {
            const p = path.join(REPO_ROOT, 'media', 'home', n);
            assert.ok(fs.existsSync(p) && fs.statSync(p).size < 120 * 1024, n + ' is a webp under 120 KB');
        });
    });
    test('5 the comparison names no one, the contact address is text, the colour rule holds (no green or red colour classes on the page; red only on the captures), the footer links are tap targets', () => {
        for (const f of PAGES) {
            const h = read(f);
            const t = textOf(h);
            assert.match(t, /no one is named/);
            assert.match(h, /<b id="contact-address">support@rattlegolf\.com<\/b>/);
            assert.match(h, /id="run-an-event" href="\/tournaments"/);
            assert.ok(!/class="[^"]*\b(green|red)\b[^"]*"/.test(h), f + ': no green/red colour class');
            assert.match(h, /footer a \{[^}]*min-height:44px/);
        }
    });
});

describe('the doors in: /tournaments, /organizers, the homepage mockups, the address rows', () => {
    test('6 the Tournaments front page: the See-it button is in the hero band, first thing above the fold, 52 px, pointing at /tournaments/see-it', () => {
        const h = read('tournament.html');
        assert.match(h, /<a class="tourney-hero-cta" id="see-it-btn" href="\/see-it">See what your tournament will look like &rsaquo;<\/a>\s*<\/div>\s*<\/header>/);
        assert.match(h, /\.tourney-hero-cta \{[^}]*min-height: 52px/);
        const hero = h.slice(h.indexOf('<header class="tourney-hero"'), h.indexOf('</header>'));
        assert.ok(/see-it-btn/.test(hero), 'inside the hero');
        const beforeHero = h.slice(h.indexOf('<div class="container" id="setup-screen">'), h.indexOf('<header class="tourney-hero"'));
        assert.ok(!/<a |<button/.test(beforeHero), 'nothing tappable above the band');
    });
    test('7 the Organizers page: the door beside Run an event', () => {
        const h = read('organizers.html');
        assert.match(h, /<a class="btn ghost" id="see-it" href="\/see-it">See what your event will look like &rsaquo;<\/a>/);
        assert.ok(!/href="\/">Back to the homepage/.test(h.slice(h.indexOf('<div class="cta">'), h.indexOf('</div>', h.indexOf('<div class="cta">')))), 'the homepage link gave its place to the door');
    });
    test('8 the address: the showcase is its own Pretty URL (/see-it, the mockups /see-it-a and /see-it-b); _redirects is untouched (marketing_home_test pins it to the two rewrites)', () => {
        const r = read('_redirects');
        assert.ok(!/see-it/.test(r), 'no rewrite row for the showcase');
        assert.match(r, /^\/tournaments\s+\/tournament\s+200$/m, 'the existing row is untouched');
        assert.ok(fs.existsSync(path.join(REPO_ROOT, 'see-it-a.html')) && fs.existsSync(path.join(REPO_ROOT, 'see-it-b.html')));
        const routes = read('_routes.json');
        assert.ok(!/see-it/.test(routes), 'no Function in front of the showcase');
    });
    test('9 the homepage heading mockups: "See how our tournaments work" (Manny\'s pick), the sub line, one See it button to /tournaments/see-it; H1 a band under the hero, H2 inside the hero beside the badges, H3 a bar shown on scroll; the rest of the page is the live homepage', () => {
        const live = read('hardpan-home.html');
        for (const f of HOME) {
            const h = read(f);
            assert.ok(h, f);
            assert.match(textOf(h), /See how our tournaments work/);
            assert.match(h, /href="\/see-it">See it &rsaquo;<\/a>/);
            assert.equal((h.match(/href="\/see-it"/g) || []).length, 1, f + ': one button');
            assert.ok(h.length > live.length, f + ': the live page plus the mockup');
        }
        assert.match(read('home-h1.html'), /<\/section>\s*<!-- H1 \(mockup\): the band\. -->\s*<section class="seeband" id="see-it"/);
        assert.match(read('home-h1.html'), /Running an event\? Here&rsquo;s what your day looks like on HardPan/);
        assert.match(read('home-h2.html'), /<div class="seecta" id="see-it">[\s\S]{0,400}<div class="badges hb">/);
        assert.match(read('home-h3.html'), /<div class="seebar" id="seebar">/);
        assert.match(read('home-h3.html'), /window\.scrollY > 400/);
    });
});
