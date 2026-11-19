// ============================================================================
// THE TOURNAMENT SHOWCASE for course decision makers (ADVISOR-20261118-1630 / 1633 / 1637 / 1641b; Manny's typed OK
// 2026-11-18 "OK deploy showcase H1 + B"). see-it.html, served at /see-it: layout B (Before / During / After tabs, the
// live board as a hero phone) in two parts a visitor picks (Tournaments & events / Everyday side games at your course);
// the door in from /tournaments (the hero band's button) and /organizers; the homepage band "See how our tournaments
// work" (H1, right under the hero).
//
// WHAT IS HELD. The words a course GM must never read here: a real client, course or golfer name, an event code,
// bet / pool / wager / gamble, a dollar figure outside a site-pricing slot, a competitor's name, "Coming soon" (the
// site says COMING). What must be there: the nine steps in order, the six COMING tags on what is not live, every
// picture a real file, the contact address as text, the doors and their address, the homepage band.
//
// BASELINE against pre-build main fc9680e7 (no see-it.html; tournament.html, organizers.html and hardpan-home.html
// without the doors and the band), this file copied there and run: 0 pass / 9 fail / 0 cancelled of 9.
// On the build: 9 / 0. (The mockup round of this file, with layouts A and B and three homepage placements, was
// 9 / 0 on preview-showcase bc11f344; this is the file for what was picked.)
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => { const p = path.join(REPO_ROOT, f); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; };
const PAGE = 'see-it.html';
const need = (h, f) => { assert.ok(h, f + ' exists'); return h; };
// Text as a reader sees it: tags, scripts and comments stripped.
const textOf = (html) => String(html).replace(/<!--[\s\S]*?-->/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&rsquo;|&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const REAL = /\bStarkey\b|\bScott\b|\bMitch\b|\bRunge\b|\bEmanuel\b|\bEmmanuel\b|\bEman\b|\bPacker\b|\bManny\b|\bOrozco\b|\bCascade\b|\bOlympic\b|Home Course|Agave|\bDuPont\b|Sedona/i;
const CODES = /\b(NA4EZB|KHPSL4|3MKUCF|P7S2BE|R7SK48|STK26|STARK7)\b/;
const MONEY = /\b(bet|bets|betting|wager\w*|gambl\w*|pool|pools|buy-?ins?|stake|stakes|cash|prize money|payout|pay-?outs?)\b/i;
const COMPETITORS = /18birdies|swingu|golfshot|hole19|arccos|golflogix|thegrint|\bgrint\b|golfpad|shot ?scope|golf ?genius|live ?tourney|vpar|golfstatus|bluegolf|eventcaddy/i;
const STEPS = ['Set up in minutes', 'Check-in and join with one code', 'Every golfer\'s phone: GPS and scoring', 'The live board, on every phone and the clubhouse TV', 'Skins and KPs, by flight', 'Paper cards welcome', 'Final results and the recap', 'Next to a typical tournament app', 'Run your next event on HardPan'];
// The homepage band: the one block this wave put on the live homepage.
const bandOf = (h) => (String(h).match(/<section class="seeband"[\s\S]*?<\/section>/) || [''])[0];

describe('the showcase page, /see-it', () => {
    test('1 see-it.html is its own page (a Pretty URL: no rewrite row, no Function), with the title, the sample event, the nine steps in order, the three tabs, the hero phone and tap-to-zoom', () => {
        const h = need(read(PAGE), PAGE);
        assert.match(h, /<title>See your tournament on HardPan<\/title>/);
        const t = textOf(h);
        assert.match(t, /Sample event: Your Club Invitational/);
        let at = 0;
        STEPS.forEach((s) => { const i = t.indexOf(s, at); assert.ok(i > -1, 'step "' + s + '" in order'); at = i; });
        assert.ok((h.match(/class="n">\d<\/span>/g) || []).length >= 9, 'nine numbered steps');
        assert.match(h, /id="tab-before"[\s\S]*id="tab-during"[\s\S]*id="tab-after"/);
        assert.match(h, /id="hero-phone"/);
        assert.match(h, /id="zoom"[^>]*role="dialog"/);
        assert.match(h, /data-big="\/media\//);
        assert.match(h, /<script src="\/site-pricing\.js\?v=[0-9a-f]{8}"><\/script>/);
        assert.ok(!/see-it/.test(read('_redirects')), 'no rewrite row for the showcase');
        assert.ok(!/see-it/.test(read('_routes.json')), 'no Function in front of it');
        assert.ok(!fs.existsSync(path.join(REPO_ROOT, 'see-it-a.html')) && !fs.existsSync(path.join(REPO_ROOT, 'see-it-b.html')) && !fs.existsSync(path.join(REPO_ROOT, 'home-h1.html')), 'the mockup files did not ship');
    });
    test('2 the two parts a visitor picks; each view is a link by ?tab= (never the hash); no league promise', () => {
        const h = need(read(PAGE), PAGE);
        assert.match(h, /id="part-events"[\s\S]{0,200}Tournaments &amp; events/);
        assert.match(h, /id="part-everyday"[\s\S]{0,120}Everyday side games/);
        assert.match(h, /<h2 class="ph2">Everyday side games at your course<\/h2>/);
        ['A side game set up in seconds', 'Join with a code, friends join free', 'The board, live for the group', 'GPS on the tee, for every golfer', 'Paper cards for the older crowd'].forEach((x) => assert.ok(textOf(h).includes(x), x));
        assert.match(h, /id="panel-everyday"/);
        assert.match(h, /var names = \['before', 'during', 'after', 'everyday'\]/);
        assert.match(h, /new URLSearchParams\(location\.search\)\.get\('tab'\)/);
        assert.ok(!/location\.hash|hashchange/.test(h), 'the page never reads the hash');
        assert.ok(!/league/i.test(textOf(h)));
        assert.match(h, /<span data-price="free-golfers">5<\/span> golfers scores free, forever/);
    });
    test('3 no real client, course or golfer name, no event code, no competitor, no betting word, no "Coming soon", no dollar figure outside a price slot - on the page and in the homepage band', () => {
        const home = need(read('hardpan-home.html'), 'hardpan-home.html');
        assert.ok(bandOf(home).length > 200, 'positive: the band was found');
        for (const [f, h] of [[PAGE, need(read(PAGE), PAGE)], ['the homepage band', bandOf(home)]]) {
            const t = textOf(h);
            assert.ok(!REAL.test(t), f + ': a real name: ' + (t.match(REAL) || [])[0]);
            assert.ok(!CODES.test(h), f + ': an event code');
            assert.ok(!COMPETITORS.test(h), f + ': a competitor named');
            assert.ok(!MONEY.test(t), f + ': a betting / money word: ' + (t.match(MONEY) || [])[0]);
            assert.ok(!/coming soon/i.test(t), f + ': "Coming soon"');
            const noSlots = h.replace(/<[^>]*data-price="[^"]*"[^>]*>[^<]*<\/[a-z]+>/g, '');
            assert.ok(!/\$\s?\d/.test(textOf(noSlots)), f + ': a dollar figure outside a price slot');
        }
    });
    test('4 what is not live is tagged COMING: event-day GPS for the field, a group\'s own game inside the event (the step and the table), Turn in our card, Venmo at sign-up, the everyday paper card; what is live carries no tag', () => {
        const h = need(read(PAGE), PAGE);
        assert.equal((h.match(/<span class="cmg"[^>]*>COMING<\/span>/g) || []).length, 6);
        assert.match(h, /COMING<\/span> HardPan GPS free for the whole field on event day\./);
        assert.match(h, /COMING<\/span> Turn in our card:/);
        assert.match(h, /On the way <span class="cmg"[^>]*>COMING<\/span>/);
        assert.match(h, /Venmo or PayPal handle on the sign-up page; Pay beside each winner <span class="cmg"[^>]*>COMING<\/span>/);
        assert.match(h, /COMING<\/span><h3>Paper cards for the older crowd<\/h3>/);
        assert.match(h, /Paper cards read by a scanner at the scoring table<\/td><td class="typ">Not found<\/td><td class="hp">&#10003; Included\. The Desk scan, live/);
        assert.ok(!/Set up in minutes[\s\S]{0,400}COMING/.test(h), 'set-up carries no tag');
    });
    test('5 every picture is a real file in the tree, with width and alt; the scan and turn-in captures are compressed webp', () => {
        const h = need(read(PAGE), PAGE);
        const srcs = [...h.matchAll(/<img [^>]*src="(\/[^"]+)"/g)].map((m) => m[1]).concat([...h.matchAll(/data-big="(\/[^"]+)"/g)].map((m) => m[1]));
        assert.ok(srcs.length >= 20, 'at least twenty captures');
        srcs.forEach((s) => assert.ok(fs.existsSync(path.join(REPO_ROOT, s)), s + ' is in the tree'));
        [...h.matchAll(/<img [^>]*>/g)].forEach((m) => {
            const tag = m[0];
            if (/id="zoom-img"/.test(tag)) return;   // the overlay's image is filled on tap
            assert.match(tag, /\balt="[^"]+"/, 'alt on ' + tag.slice(0, 60));
            assert.match(tag, /\bwidth="\d+"/, 'width on ' + tag.slice(0, 60));
        });
        ['scan-result-phone-400.webp', 'scan-result-phone-800.webp', 'turnin-check-phone-400.webp', 'turnin-check-phone-800.webp'].forEach((n) => {
            const p = path.join(REPO_ROOT, 'media', 'home', n);
            assert.ok(fs.existsSync(p) && fs.statSync(p).size < 120 * 1024, n + ' is a webp under 120 KB');
        });
    });
    test('6 the comparison names no one, the contact address is text, no green or red colour class, the footer links are tap targets', () => {
        const h = need(read(PAGE), PAGE);
        assert.match(textOf(h), /no one is named/);
        assert.match(h, /<b id="contact-address">support@rattlegolf\.com<\/b>/);
        assert.match(h, /id="run-an-event" href="\/tournaments"/);
        assert.ok(!/class="[^"]*\b(green|red)\b[^"]*"/.test(h));
        assert.match(h, /footer a \{[^}]*min-height:44px/);
    });
});

describe('the doors in', () => {
    test('7 the Tournaments front page: the See-it button closes the hero band, first thing above the fold, 52 px, to /see-it; the cache moved (tournament.html is a shell file)', () => {
        const h = need(read('tournament.html'), 'tournament.html');
        assert.match(h, /<a class="tourney-hero-cta" id="see-it-btn" href="\/see-it">See what your tournament will look like &rsaquo;<\/a>\s*<\/div>\s*<\/header>/);
        assert.match(h, /\.tourney-hero-cta \{[^}]*min-height: 52px/);
        const beforeHero = h.slice(h.indexOf('<div class="container" id="setup-screen">'), h.indexOf('<header class="tourney-hero"'));
        assert.ok(h.indexOf('<header class="tourney-hero"') > 0 && !/<a |<button/.test(beforeHero), 'nothing tappable above the band');
        assert.match(read('sw.js'), /Moved to v422-2\.0 \(the showcase/);
    });
    test('8 the Organizers page: the door beside Run an event, to /see-it', () => {
        const h = need(read('organizers.html'), 'organizers.html');
        assert.match(h, /<a class="btn ghost" id="see-it" href="\/see-it">See what your event will look like &rsaquo;<\/a>/);
    });
    test('9 the homepage: the band "See how our tournaments work" right under the hero, the sub line, ONE See it button (56 px) to /see-it', () => {
        const h = need(read('hardpan-home.html'), 'hardpan-home.html');
        assert.match(h, /id="open-web-app"[^>]*>[^<]*<\/a>\s*<\/section>\s*<!-- SEE HOW OUR TOURNAMENTS WORK[\s\S]*?-->\s*<section class="seeband" id="see-it"/, 'right under the hero');
        const band = bandOf(h);
        assert.match(band, /<h2 id="see-it-h">See how our tournaments work<\/h2>/);
        assert.match(band, /Running an event\? Here&rsquo;s what your day looks like on HardPan/);
        assert.equal((h.match(/href="\/see-it"/g) || []).length, 1, 'one button');
        assert.match(band, /<a class="btn-see" id="see-it-go" href="\/see-it">See it &rsaquo;<\/a>/);
        assert.match(h, /\.btn-see \{[^}]*min-height:56px/);
    });
});
