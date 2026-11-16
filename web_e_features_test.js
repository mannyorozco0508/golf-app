// ============================================================================
// WEBSITE-E: THE HOMEPAGE FEATURE ROWS (Manny's picks 37B + 38C, Nov 10)
//
// "EVERYTHING IN THE APP" on hardpan-home.html is five rows of App-Store-style
// cards (Play 6, Games 6, Your group 5, Organize 5, Get better 3 = 25), each a
// caption on top (tag, headline, one line) over a phone frame holding a real
// screen (a sharp still, or a clip for the six features that have one). Under
// Play sits "Try the GPS", under Games "Try Just say it". site-features.js runs
// the rows, the full-screen viewer and the two try-it boxes.
//
// SOURCE-LEVEL, like marketing_home_test.js. The rendered page (viewer, clips,
// the two demos, no network) is web_e_features_chrome_test.js.
//
// WHAT IT PROVES
//   1. The 25 cards, in their groups and order (outbox/choices/37-38-NOTES.md),
//      each with a headline, one line, and a screen image with alt text whose
//      files exist (responsive WebP sizes, lazy, with width/height).
//   2. No money words and no prices in any card or in either try-it box (page
//      copy, the Just say it table, the demo script); no "IDEA" mockup tag;
//      "Coming soon" only on Offline maps and Ask caddie.
//   3. Clips: exactly the six cards with a clip have one, each muted, inline,
//      preload="none", no loop, its poster and file in the manifest.
//   4. Try the GPS: OPTION D (Nov 10): the map is an inline SVG drawn from
//      OpenStreetMap data only (course, water, greens, the hole's pin) on the
//      page's own z19 grid; credit "Map data © OpenStreetMap contributors"; no
//      Esri name or URL, no tile, no image and no outside URL anywhere in the
//      features section; a demo label; the hole's tee-to-middle distance from
//      the map's scale matches the hole's own OSM line (140 m = 153 y); the
//      script never asks for a location. (Was: 16 live Esri tiles, Nov 10.)
//   5. Try Just say it: says nothing is saved; the script has no fetch, XHR,
//      beacon, socket, storage or form submit; every canned card is the app's
//      own parser output (ask-hardpan.js on dev-204, when that branch is here).
//   6. Served as static files (not blocked, no Function), and not in the app's
//      service-worker shell or the native bundle.
//
// NEGATIVE CONTROLS (run by hand, each restored by cmp; see the website-e report).
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = __dirname;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(ROOT, f));
const stripComments = (h) => h.replace(/<!--[\s\S]*?-->/g, '');
const html = stripComments(read('hardpan-home.html'));
const JS = read('site-features.js');
const feat = (/<section class="feat" id="features">([\s\S]*?)<\/section>\s*<div class="fv"/.exec(html) || [])[1] || '';
// 2.0.8 site (Nov 15): the "Coming in 2.0.8" row was a section of its own just above #features while 2.0.8 was in review.
// 2.0.8 release re-pin: flip-to-released.sh moved it INTO #features as "New in 2.0.8" (#g-update), the first row, tags gone.
const update208 = (/<div class="grp" id="g-update">[\s\S]*?<\/div>(?=\n    <div class="grp" id="g-new">)/.exec(feat) || [''])[0];
// The 2.0.8 features: named ONLY in the New in 2.0.8 row (its two cards and its Also new list), nowhere else on the page.
// 2.0.9 site (web-209-coming, Nov 16): iOS 2.0.9 (1) is uploaded to App Store Connect (not yet in review). Its two
// golfer-visible changes (under par in red on every board, and the same red inside HardPan's sentences) sit in a
// "Coming in 2.0.9" row, a section of its own just above #features, tagged, exactly as #coming208 did. Release day:
// scratchpad/web209/flip-209-to-released.sh moves it in as "New in 2.0.9".
const coming209 = (/<section class="feat coming" id="coming209"[\s\S]*?<\/section>/.exec(html) || [''])[0];
const rawHome = read('hardpan-home.html');
// the raw block (its comment, the section, the end marker) and its CSS (.fsoon, and the commented .coming / .gsoon pair)
const block209 = (/<!-- 2\.0\.9 site \(web-209-coming[^\n]*\n(?:[^\n]*\n)*?<!-- \/2\.0\.9 coming -->\n/.exec(rawHome) || [''])[0];
const css209 = [(/    \.fsoon \{[^\n]*\n/.exec(rawHome) || [''])[0], (/    \/\* 2\.0\.9 site \(web-209-coming[\s\S]*?    \.gsoon \{[^\n]*\n/.exec(rawHome) || [''])[0]];
const rawHomeNo209 = css209.reduce((h, c) => h.replace(c, ''), rawHome.replace(block209, ''));
// The 2.0.9 features: named ONLY in the Coming in 2.0.9 row, never anywhere else on the page as available. (The 2.0.8
// row's own "Under par in red on the GPS screen." is 2.0.8's and is taken out with that row before this is matched.)
// The All-in / GPS v2 plans ladder is in the 2.0.9 code but behind a live switch that is off: never on the page.
const UNSHIPPED_209 = /red means under|replies read the same way|under[- ]par (numbers? )?(in|shows? in) red|\bin red\b|is red too|coming in 2\.0\.9|new in 2\.0\.9|2\.0\.9/i;
const PLANS_209 = /All[- ]in|GPS v2|plans? ladder/i;
const UNSHIPPED_208 = /\b1\s?m(etre|eter)? (lidar|slope)|smooth(er)? (green )?slope|Home Course|whole[- ]course|prefetch|target ring|ring steps aside|round card to share|shareable round|recap card|Instagram|lock[- ]screen|Dynamic Island|Live Activit|GPS paused|sponsor(ed)? (tee|hole)|presents the hole|course search|under par in red|in review/i;
const textOf = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ').replace(/&middot;/g, '·').replace(/&rsquo;/g, '’').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

// Every card: <li class="fc" ...> ... </li>
const cards = [];
for (const m of feat.matchAll(/<li class="fc" id="([^"]+)" data-key="([^"]+)">([\s\S]*?)<\/li>/g)) {
    const body = m[3];
    cards.push({ id: m[1], key: m[2], body,
        h: ((/<h3>([^<]*)<\/h3>/.exec(body) || [])[1] || '').replace(/&rsquo;/g, '’').replace(/&amp;/g, '&'),
        p: ((/<p>([^<]*)<\/p>/.exec(body) || [])[1] || ''),
        img: (/<img\b[^>]*>/.exec(body) || [''])[0],
        video: (/<video\b[^>]*>/.exec(body) || [null])[0],
        soon: (/<div class="fsoon">([^<]*)<\/div>/.exec(body) || [])[1] || null });
}
const groups = [...feat.matchAll(/<div class="grp" id="g-([a-z]+)">[\s\S]*?<h2>([^<]+)<\/h2>[\s\S]*?<ul class="row"[^>]*>([\s\S]*?)<\/ul>/g)]
    .map((m) => ({ id: m[1], name: m[2], n: (m[3].match(/<li class="fc"/g) || []).length }));

// The Just say it table, read out of the script exactly as the page runs it.
function sayTable() {
    const m = /var SAY = (\[[\s\S]*?\n    \]);/.exec(JS);
    assert.ok(m, 'the Just say it table is not in site-features.js');
    return JSON.parse(m[1]);
}

const HEADLINES = {
    // 2.0.8 release re-pin: the Coming in 2.0.8 row moved into #features as 'New in 2.0.8', first. Its slope card keeps
    // "Read the green."; the 2.0.7 slope card (the older, blockier drawing) was renamed "Slope on the green." the same day.
    'New in 2.0.8': ['Read the green.', 'Nothing covers the arrows.'],
    // 2.0.7 site update (web-207-site, Manny's standing rule 2026-11-14 15:57: what ships goes on the site in the same
    // release cycle, with real screenshots): a 'New in 2.0.7' row of four cards cut from the 2.0.7 App Store screenshots.
    'New in 2.0.7': ['Card, GPS, Games, Board.', 'Slope on the green.', 'How big is the green?', 'Your team card, in the app.'],
    'Play': ['Every yard. Every hole.', 'Hit the number it plays.', 'Know what you can carry.', 'Miss on the right side.', 'No signal? Still every yard.', 'Your real carries.'],
    'Games': ['Set up the game in one sentence.', 'Every game your group plays.', 'Score the whole group in one tap.', 'Every game, as it happens.', 'The final word, ready to share.', 'Who owes who, done.'],
    'Your group': ['Same game. Same code. Every week.', 'Talk to the round.', 'Same group? One tap.', 'One board for the whole trip.', 'Every round you’ve played.'],
    'Organize': ['Run the day from your phone.', 'A tournament in four questions.', 'Join the tournament.', 'Every group. One board.', 'Every flight, live.',
        // 52A batch 1 (2026-11-12): seven Tournaments cards
        'Every team gets its own link.', 'Your events, on any device.', 'Your card and the board, one link.', 'Closest to the pin, long drive.', 'Photos when the round is done.', 'A note on every card.', 'Sign-ups and check-in, one desk.'],   // card 22 reworded Nov 10 (was Prizes, sorted.)
    'Get better': ['See where shots go.', 'Practice what costs you.', 'Ask what it plays.']
};
// $, betting words, and price shapes (a number per month/year, "free trial" days).
const MONEY = /\$|\b(bet|bets|betting|wager\w*|gambl\w*|pot|pots|buy-?ins?|stake|stakes|dollars?|bucks|price|prices|priced)\b|\d+\s*\/\s*(mo|month|yr|year)\b|\bper (month|year)\b/i;

describe('1. the 25 cards', () => {
    test('five rows in order, 6 + 6 + 5 + 12 + 3 cards, right after the hero', () => {
        assert.deepEqual(groups.map((g) => g.name), Object.keys(HEADLINES));
        // 52A batch 1 re-pin (2026-11-12): Organize 5 -> 12, 32 cards.
        // 2.0.7 re-pin (2026-11-14): New in 2.0.7 (4) leads, 36 cards.
        // 2.0.8 release re-pin: New in 2.0.8 (2) leads, 38 cards.
        assert.deepEqual(groups.map((g) => g.n), [2, 4, 6, 6, 5, 12, 3]);
        assert.equal(cards.length, 38);
        const at = html.indexOf('id="features"');
        assert.ok(at > html.indexOf('class="wrap hero"') && at < html.indexOf('class="wrap split"'), 'the rows are not between the hero and the golfer/organizer panels');
        assert.match(html, /EVERYTHING IN THE APP/);
        groups.forEach((g) => assert.match(feat, new RegExp('<span class="gn">' + g.n + ' &middot; swipe &rarr;</span>'), g.name + ': no "N · swipe →"'));
    });

    // 2.0.8 site (Nov 15): the Coming in 2.0.8 row was outside #features (6 rows, 36 cards, manifest screens 36 + manifest.coming 2).
    // 2.0.8 release re-pin: the row is the first inside #features as New in 2.0.8; its two screens lead screens[] (38), manifest.coming is gone.
    test('2.0.8 release: the New in 2.0.8 row has 2 cards (real captures, first in the manifest) and 7 more named in its list', () => {
        assert.ok(update208.length > 500, 'positive: the New in 2.0.8 row is there, right above New in 2.0.7');
        const cs = [...update208.matchAll(/<li class="fc" id="([^"]+)" data-key="([^"]+)">([\s\S]*?)<\/li>/g)];
        assert.deepEqual(cs.map((m) => m[2]), ['smooth-slope', 'ring-aside']);
        assert.match(update208, /<span class="gn">2 &middot; swipe &rarr;<\/span>/);
        assert.equal((update208.match(/<div class="dots"[^>]*>(<i[^>]*><\/i>)+<\/div>/) || [''])[0].match(/<i/g).length, 2);
        const also = (/<ul class="new207" aria-label="Also new in 2\.0\.8">([\s\S]*?)<\/ul>/.exec(update208) || [])[1] || '';
        assert.equal((also.match(/<li>/g) || []).length, 7);   // Nov 15 3:22 PM re-pin: + the whole-course slope download (was in the old slope card's line)
        const manifest = JSON.parse(read('media/screens/manifest.json'));
        assert.equal(manifest.screens.length, 38, 'the two 2.0.8 screens are in screens[] (that is the #features list)');
        // 2.0.9 site (web-209-coming, Nov 16): manifest.coming is back, holding the two Coming in 2.0.9 screens (not screens[]).
        assert.deepEqual(manifest.coming.screens.map((s) => s.key), ['red-under', 'ask-red'], 'manifest.coming holds only the 2.0.9 screens');
        assert.deepEqual(manifest.screens.slice(0, 2).map((s) => s.key), cs.map((m) => m[2]), 'the 2.0.8 screens lead screens[]');
        cs.forEach((m) => {
            const body = m[3], img = (/<img\b[^>]*>/.exec(body) || [''])[0], k = m[2];
            assert.match(body, new RegExp('<button type="button" class="ph" data-open="' + k + '" aria-label="See [^"]+ full screen">'));
            assert.match(img, new RegExp('src="/media/screens/' + k + '-400\\.webp" srcset="/media/screens/' + k + '-400\\.webp 400w, /media/screens/' + k + '-940\\.webp 940w"'));
            assert.match(img, /\bwidth="940" height="(1896|1938)" loading="lazy"/);
            const alt = /\balt="([^"]*)"/.exec(img)[1];
            assert.ok(alt.length >= 30); assert.doesNotMatch(alt, /\bTest\b|\$/);
            const ms = manifest.screens.find((x) => x.key === k);
            assert.match(ms.captured, /scratchpad\/(shots208\/raw\/07-green-slope-55|green72r\/ring\/after-homecourse-6)\.png/, k + ': not a real capture');
            ms.files.forEach((f) => {
                const b = fs.readFileSync(path.join(ROOT, f.slice(1)));
                assert.equal(b.slice(0, 4).toString('latin1') + b.slice(8, 12).toString('latin1'), 'RIFFWEBP', f);
                assert.ok(b.length < 170 * 1024, f + ' is ' + b.length + ' bytes');
            });
        });
    });

    test('every card has its headline, one line, and a screen with alt text', () => {
        assert.deepEqual(cards.map((c) => c.h), [].concat(...Object.values(HEADLINES)));
        const ids = new Set();
        cards.forEach((c) => {
            assert.ok(!ids.has(c.id), c.id + ' twice'); ids.add(c.id);
            // 2.0.8 release re-pin: the smooth-slope card carries Manny's own line (OK via Advisor, Nov 15 3:22 PM; 136
            // characters, two sentences), shown and previewed in the Coming in 2.0.8 row before it moved in here. That
            // one card is allowed its line; every other card keeps the 20-90 bound.
            assert.ok(c.p.length >= 20 && c.p.length <= (c.key === 'smooth-slope' ? 140 : 90), c.h + ': the one line is "' + c.p + '"');
            assert.ok(/<span class="eb">[A-Z ]+<\/span>/.test(c.body), c.h + ': no tag');
            assert.ok(c.img, c.h + ': no screen image');
            const alt = (/\balt="([^"]*)"/.exec(c.img) || [])[1];
            assert.ok(alt && alt.length >= 30, c.h + ': alt text missing or too short ("' + alt + '")');
            assert.match(c.img, /\bloading="lazy"/, c.h + ': the image loads before it is near the screen');
            assert.match(c.img, /\bwidth="\d+" height="\d+"/, c.h + ': no width/height (the page would jump)');
            const files = [...c.img.matchAll(/\/media\/screens\/([a-z0-9-]+)\.webp/g)].map((m) => 'media/screens/' + m[1] + '.webp');
            assert.ok(files.length >= 1, c.h + ': not a WebP screen');
            files.forEach((f) => {
                assert.ok(exists(f), f + ' is missing');
                const b = fs.readFileSync(path.join(ROOT, f));
                assert.equal(b.slice(0, 4).toString('latin1') + b.slice(8, 12).toString('latin1'), 'RIFFWEBP', f + ' is not WebP');
                assert.ok(b.length < 170 * 1024, f + ' is ' + b.length + ' bytes');
            });
            // the old tile ids that tests and links use stay on their feature
        });
        ['f-gps', 'f-say', 'f-group', 'f-games', 'f-results', 'f-tourney', 'f-weekly', 'f-chat', 'f-bag'].forEach((id) => assert.ok(ids.has(id), id + ' is gone'));
        // a sharp screen: the large size is at least 2x a 390-wide phone's card. RE-CAPTURE re-pin (Nov 10):
        // every one of the 25 (was 24: the weekly-code card showed a 295 px poster until its re-capture).
        const wide = cards.filter((c) => Number(/\bwidth="(\d+)"/.exec(c.img)[1]) >= 780).length;
        // 52A batch 1 re-pin (2026-11-12): seven Tournaments cards joined the Organize row, each a 780-wide @2x capture.
        // 2.0.7 re-pin (2026-11-14): + the four New in 2.0.7 screens, 940 wide.
        // 2.0.8 release re-pin: + the two New in 2.0.8 screens, 940 wide.
        assert.equal(wide, 38, 'only ' + wide + ' of 38 screens are 2x or sharper');
    });

    // RE-CAPTURE (Nov 10): hazards, range, my-bag and weekly-code were re-shot from the 2.0.5 web app
    // (release-205) in headless Chrome at 390x844 @3x - 1170x2532, light sheets, demo golfer Sam. The older
    // files (a dark sheet, a cropped title, a 295 px poster; the three old -400 files as -400-superseded) stay in
    // media/screens/ and nothing serves them;
    // media/screens/manifest.json lists every screen and marks those files superseded.
    test('the four re-captured screens are the 3x captures; the screens manifest lists all 25 and marks the old files unused', () => {
        const manifest = JSON.parse(read('media/screens/manifest.json'));
        assert.equal(manifest.folder, '/media/screens/');
        assert.equal(manifest.screens.length, 38);   // 52A batch 1 re-pin (2026-11-12): 25 + 7 Tournaments screens; 2.0.7 re-pin (2026-11-14): + 4 New in 2.0.7; 2.0.8 release: + 2 New in 2.0.8
        assert.deepEqual(manifest.screens.map((s) => s.key), cards.map((c) => c.key), 'the manifest lists the cards in page order');
        ['hazards', 'range', 'my-bag', 'weekly-code', 'ask-caddie'].forEach((k) => {
            const c = cards.find((x) => x.key === k);
            assert.match(c.img, new RegExp('src="/media/screens/' + k + '-400\\.webp" srcset="/media/screens/' + k + '-400\\.webp 400w, /media/screens/' + k + '-1170\\.webp 1170w"'), k + ': not the 400 + 1170 pair');
            assert.match(c.img, /\bwidth="1170" height="2532"/, k + ': not a 390x844 @3x capture');
            const m = manifest.screens.find((s) => s.key === k);
            // RE-PINNED 2026-11-13 (website pics vs iOS 2.0.7, Manny by phone relay ADVISOR-1246): hazards and
            // ask-caddie are now 2.0.7 captures (release-207 895da9fc); range, my-bag, weekly-code stay 205.
            // RE-PINNED 2026-11-15 (web-208-pics, ADVISOR-20261115-1643): hazards and ask-caddie are 2.0.8 captures
            // (release-208 fa176a69, under par in red); the old entry stays under "previous".
            assert.ok(m && /release-20[5678]/.test(m.captured) && m.recaptured, k + ': the manifest does not say where it came from');
            assert.deepEqual(m.files, ['/media/screens/' + k + '-400.webp', '/media/screens/' + k + '-1170.webp']);
        });
        manifest.screens.forEach((s) => s.files.forEach((f) => assert.ok(exists(f.slice(1)), f + ' is missing')));
        // the superseded files: still here, listed, and served by no page
        const old = ['/media/screens/hazards-400-superseded.webp', '/media/screens/hazards-786.webp', '/media/screens/my-bag-400-superseded.webp', '/media/screens/my-bag-786.webp', '/media/screens/range-400-superseded.webp', '/media/screens/range-786.webp', '/media/screens/weekly-code-295.webp',
            // Re-pinned 2026-11-12 (Manny, preview-52a): Ask caddie re-captured on a real hole; its old pair kept, unserved.
            '/media/screens/ask-caddie-400-superseded.webp', '/media/screens/ask-caddie-786.webp'].sort();
        assert.deepEqual(manifest.superseded.map((s) => s.file).sort(), old);
        manifest.superseded.forEach((s) => { assert.ok(exists(s.file.slice(1)), s.file + ' was deleted'); assert.deepEqual(s.used_on, []); assert.match(s.unused_since, /re-capture/); });
        const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).concat(fs.readdirSync(path.join(ROOT, 'help')).map((f) => 'help/' + f)).filter((f) => f.endsWith('.html'));
        pages.forEach((f) => old.forEach((o) => assert.ok(!read(f).includes(o), f + ' still serves ' + o)));
        assert.ok(!/-786\.webp|-295\.webp|-superseded\.webp/.test(read('site-features.js')));
        // no "Test" golfer, no amount on the captures' alt text (the demo golfers are Sam, Josh, Bob, Paul)
        ['hazards', 'range', 'my-bag', 'weekly-code', 'ask-caddie'].forEach((k) => { const alt = /\balt="([^"]*)"/.exec(cards.find((x) => x.key === k).img)[1]; assert.doesNotMatch(alt, /\bTest\b|\$/, k); });
    });

    test('each card opens the viewer: the screen is a real button with a name', () => {
        cards.forEach((c) => assert.match(c.body, new RegExp('<button type="button" class="ph" data-open="' + c.key + '" aria-label="See [^"]+ full screen">'), c.h));
        assert.match(html, /<div class="fv" id="fv" role="dialog" aria-modal="true" aria-labelledby="fv-title" hidden>/);
        assert.match(html, /<script src="\/site-features\.js" defer><\/script>/);
    });
});

describe('2. words', () => {
    test('no money words or prices in any card or in either try-it box', () => {
        const t = textOf(feat);
        assert.ok(t.length > 2000, 'positive: there is copy to judge');
        assert.doesNotMatch(t, MONEY);
        const say = JSON.stringify(sayTable());
        assert.doesNotMatch(say, MONEY);
        assert.doesNotMatch(JS.replace(/\/\/[^\n]*/g, ''), /\$\s?\d|\b(bet|bets|wager|pot|buy-?in)\b/i, 'the demo script carries a money word');
        cards.forEach((c) => assert.doesNotMatch((/\balt="([^"]*)"/.exec(c.img) || [])[1], MONEY, c.h + ' alt'));
    });

    test('no IDEA mockup tag ships', () => {
        assert.doesNotMatch(read('hardpan-home.html'), /\bIDEA\b|class="tag abs"|mockup note/i);
        assert.doesNotMatch(JS, /\bIDEA\b/);
    });

    test('"Coming soon" is on no card: every card shown has shipped', () => {
        const soon = cards.filter((c) => c.soon).map((c) => [c.h, c.soon]);
        // Re-pinned 2026-11-12 (Manny): Ask caddie shipped (release-204 on, 2.0.6 live), so its tag is gone.
        // 2.0.7 site (Manny Nov 14): offline map download shipped (release-206/207 in both stores), so Offline maps' tag is gone too.
        assert.deepEqual(soon, []);
        assert.ok(cards.some((c) => c.h === 'No signal? Still every yard.'), 'positive: the Offline maps card is still there');
        assert.doesNotMatch(html, /coming soon/i, 'a Coming soon on the page');
    });

    // 2.0.7 re-pin (2026-11-14): the Season board ships in 2.0.7 (55A, What's New), so it may be named, in the
    // 'Also new in 2.0.7' list only; co-organizers stay out everywhere.
    // 2.0.7 site update (2026-11-14): only what is in a store build is shown. Built or being built on feature
    // branches, in NO store build yet, so never on the page as available: the smooth 1 m slope, the Home Course
    // bundle, slope on by default + whole-course prefetch, the target ring hiding while slope is on, the shareable
    // round card, the Android-twin lock screen.
    // 2.0.8 site (Nov 15): iOS 2.0.8 (1) went to Apple's review. Its features could be NAMED, but only inside the
    // "Coming in 2.0.8" row (#coming208), which sat above "EVERYTHING IN THE APP" and was tagged as coming.
    // 2.0.8 release re-pin: iOS 2.0.8 is on the App Store, so the row is "New in 2.0.8", the first row of #features
    // (#g-update), untagged. The same guard, moved with it: the 2.0.8 features are named ONLY in that row (its two
    // cards and its Also new list) and nowhere else on the page, and nothing on the page says coming / in review.
    test('2.0.8 release: the 2.0.8 features are named only in the New in 2.0.8 row, the first row of EVERYTHING IN THE APP', () => {
        assert.ok(update208.length > 500, 'positive: the New in 2.0.8 row is there');
        // 2.0.9 site re-pin: the Coming in 2.0.9 row (its UNDER PAR IN RED eyebrow) is taken out too; it is held by the 2.0.9 tests.
        const t = textOf(html.replace(update208, '').replace(coming209, ''));
        assert.ok(coming209.length > 1500, 'positive: the Coming in 2.0.9 row is there');
        assert.match(t, /New in 2\.0\.7/, 'positive: the 2.0.7 row is there');
        assert.match(t, /EVERYTHING IN THE APP/, 'positive: the slice still has the rest of the page');
        assert.doesNotMatch(t, UNSHIPPED_208);
        // the row sits inside EVERYTHING IN THE APP, first, right above New in 2.0.7; the old section is gone
        assert.equal(groups[0].id, 'update'); assert.equal(groups[0].name, 'New in 2.0.8'); assert.equal(groups[1].name, 'New in 2.0.7');
        assert.ok(feat.indexOf('id="g-update"') > feat.indexOf('EVERYTHING IN THE APP') && feat.indexOf('id="g-update"') < feat.indexOf('id="g-new"'));
        // 2.0.9 site re-pin: the Coming in 2.0.9 section reuses class="feat coming" / id="g-coming"; outside it, none.
        assert.doesNotMatch(html.replace(coming209, ''), /id="coming208"|class="feat coming"|id="g-coming"|coming208-tag/, 'the Coming in 2.0.8 section is still on the page');
    });

    test('2.0.8 release: the New in 2.0.8 row says new, carries no coming tag on the row or any card, and the green slope leads it', () => {
        const t = textOf(update208);
        assert.match(update208, /<h2>New in 2\.0\.8<\/h2>/);
        assert.match(update208, /<p class="gln">What changed in this update\.<\/p>/);
        assert.match(update208, /<ul class="new207" aria-label="Also new in 2\.0\.8">/);
        // the tags are gone, here and everywhere: nothing on the page says coming, in review, or not in the app yet
        assert.doesNotMatch(update208, /gsoon|fsoon|soon208/);
        // 2.0.9 site re-pin: the Coming in 2.0.9 block and its CSS bring the tag wording back on purpose; outside them, none.
        assert.ok(block209.length > 1500 && css209.every((c) => c.length > 50), 'positive: the 2.0.9 block and its CSS were found (else this guard would test nothing new)');
        assert.doesNotMatch(rawHomeNo209, /gsoon|fsoon|soon208|coming in 2\.0\.8|in review|Not in the app yet/i, 'coming wording left on the page (markup, CSS or comments)');
        // (the at-a-glance tiles may say COMING about Check-in / Scan check: that is not the 2.0.8 row's wording)
        assert.doesNotMatch(textOf(html.replace(coming209, '')), /coming in 2\.0\.8|coming in the next update|in review|not in the app yet/i);
        const cs = [...update208.matchAll(/<li class="fc" id="([^"]+)" data-key="([^"]+)">([\s\S]*?)<\/li>/g)];
        assert.equal(cs.length, 2);
        cs.forEach((m) => assert.match(m[3], /^<div class="cap"><span class="eb">/, m[1] + ': the caption does not start with its eyebrow (a tag is still there)'));
        // the green slope is the hero: the first card of the row (Manny, Nov 15 3:22 PM)
        assert.equal(cs[0][2], 'smooth-slope');
        assert.match(cs[0][3], /<span class="eb">GREEN SLOPE<\/span><h3>Read the green\.<\/h3><p>Slope from 1 m lidar, drawn smooth on the map: shading, contours and downhill arrows, with the putt read at the pin\. On by default\.<\/p>/);
        // the 2.0.7 slope card was renamed so the two headlines differ (the 2.0.8 one keeps "Read the green.")
        assert.equal(cards.filter((c) => c.h === 'Read the green.').length, 1);
        assert.match(feat, /<li class="fc" id="f-green-slope" data-key="green-slope"><div class="cap"><span class="eb">GREEN SLOPE<\/span><h3>Slope on the green\.<\/h3>/);
        assert.doesNotMatch(update208, /apps\.apple\.com|play\.google\.com/);
        // every 2.0.8 feature of WHATS-NEW-2.0.8.txt is named in the row (positive control for the guard above);
        // Lock Screen / Dynamic Island is iPhone-only and says so
        [/Slope from 1 m lidar, drawn smooth/, /On by default\./, /whole course’s slope saves/i, /The Home Course/, /target ring steps aside/, /round recap card/, /Messages or an Instagram story/,
            /Money stays off the card unless you switch it on\./, /Lock Screen and Dynamic Island yardages on iPhone/, /GPS paused/, /center number/, /sponsor tee card/, /Easier course search/, /Under par in red/]
            .forEach((re) => assert.match(t, re, String(re)));
        // the only money sentence allowed in the row is that one
        assert.doesNotMatch(t.replace('Money stays off the card unless you switch it on.', ''), /\b(money|settle|owes?)\b|\$/i);
        assert.doesNotMatch(t, MONEY);
    });

    // 2.0.9 site (web-209-coming, Nov 16): iOS 2.0.9 (1) is uploaded to App Store Connect, not yet released. Its two cards
    // sit in "Coming in 2.0.9" (#coming209), a section of its own above EVERYTHING IN THE APP, tagged on the row and on
    // each card "New · coming in the next update"; nothing in it says available, new in 2.0.9, or in review.
    test('2.0.9 coming: the Coming in 2.0.9 row sits above EVERYTHING IN THE APP with its two cards, real pictures at the pinned sizes, in manifest.coming', () => {
        assert.ok(coming209.length > 1500, 'positive: the Coming in 2.0.9 row is there');
        assert.match(coming209, /^<section class="feat coming" id="coming209" aria-label="Coming in 2\.0\.9">/);
        assert.match(coming209, /<div class="grp" id="g-coming">/);
        assert.match(coming209, /<h2>Coming in 2\.0\.9<\/h2>/);
        assert.match(coming209, /<span class="gn">2 &middot; swipe &rarr;<\/span>/);
        assert.equal((coming209.match(/<div class="dots"[^>]*>(<i[^>]*><\/i>)+<\/div>/) || [''])[0].match(/<i/g).length, 2);
        // outside #features, right above it, after the at-a-glance tiles
        assert.ok(!feat.includes('id="coming209"'), 'the Coming in 2.0.9 row moved into EVERYTHING IN THE APP');
        const at = html.indexOf('id="coming209"');
        assert.ok(at > html.indexOf('id="everything"') && at < html.indexOf('<section class="feat" id="features">'), 'the Coming in 2.0.9 row is not between the tiles and #features');
        assert.equal(html.indexOf('id="coming208"'), -1);
        const cs = [...coming209.matchAll(/<li class="fc" id="([^"]+)" data-key="([^"]+)">([\s\S]*?)<\/li>/g)];
        assert.deepEqual(cs.map((m) => [m[1], m[2]]), [['f-red-under', 'red-under'], ['f-ask-red', 'ask-red']]);
        assert.match(cs[0][3], /<span class="eb">UNDER PAR IN RED<\/span><h3>Red means under\.<\/h3><p>Every under-par number on the Receipt, the boards and the leaderboard shows in red\. Even and over par stay plain\. Birdies are still circles, bogeys squares\.<\/p>/);
        assert.match(cs[1][3], /<span class="eb">ASK HARDPAN<\/span><h3>HardPan&rsquo;s replies read the same way\.<\/h3><p>Ask who&rsquo;s winning - the under-par number inside the answer is red too\. Same on the live chip and the tournament card\.<\/p>/);
        // none of the 2.0.9 cards is inside #features (they move there on release day)
        assert.ok(!cards.some((c) => c.key === 'red-under' || c.key === 'ask-red'));
        // the pictures: real captures of the 2.0.9 build, 940 x 1910 and 400 x 813 WebP, listed in manifest.coming
        const manifest = JSON.parse(read('media/screens/manifest.json'));
        assert.deepEqual(manifest.coming.screens.map((s) => s.key), cs.map((m) => m[2]));
        assert.equal(manifest.screens.length, 38, 'the coming screens are not in screens[] (that is the #features list)');
        const webpSize = (b) => {
            const kind = b.slice(12, 16).toString('latin1');
            if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
            if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
            if (kind === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
            return null;
        };
        cs.forEach((m) => {
            const body = m[3], img = (/<img\b[^>]*>/.exec(body) || [''])[0], k = m[2];
            assert.match(body, new RegExp('<button type="button" class="ph" data-open="' + k + '" aria-label="See [^"]+ full screen">'));
            assert.match(img, new RegExp('src="/media/screens/' + k + '-400\\.webp" srcset="/media/screens/' + k + '-400\\.webp 400w, /media/screens/' + k + '-940\\.webp 940w"'));
            assert.match(img, /\bwidth="940" height="1910" loading="lazy"/);
            const alt = /\balt="([^"]*)"/.exec(img)[1];
            assert.ok(alt.length >= 30); assert.doesNotMatch(alt, /\bTest\b|\$/); assert.doesNotMatch(alt, MONEY);
            const ms = manifest.coming.screens.find((x) => x.key === k);
            assert.deepEqual(ms.files, ['/media/screens/' + k + '-400.webp', '/media/screens/' + k + '-940.webp']);
            assert.equal(ms.width, 940); assert.equal(ms.height, 1910);
            assert.match(ms.captured, /release-207 639f7c35/, k + ': not a capture of the 2.0.9 build');
            assert.match(ms.captured, /scratchpad\/(fbshots\/raw\/06-live-games|web209\/raw\/209-ask-red)\.png/, k + ': not a real capture');
            [[ms.files[0], [400, 813]], [ms.files[1], [940, 1910]]].forEach(([f, wh]) => {
                const b = fs.readFileSync(path.join(ROOT, f.slice(1)));
                assert.equal(b.slice(0, 4).toString('latin1') + b.slice(8, 12).toString('latin1'), 'RIFFWEBP', f);
                assert.deepEqual(webpSize(b), wh, f + ' is not ' + wh.join('x'));
                assert.ok(b.length < 170 * 1024, f + ' is ' + b.length + ' bytes');
            });
        });
    });

    test('2.0.9 coming: the row says coming on the row and on both cards, claims nothing is available or new, and its features are named nowhere else', () => {
        const t = textOf(coming209);
        assert.match(coming209, /<p class="gln"><span class="gsoon" id="coming209-tag">New &middot; coming in the next update<\/span>Not in the app yet\.<\/p>/, 'the row tag does not say coming');
        const cs = [...coming209.matchAll(/<li class="fc" id="([^"]+)" data-key="([^"]+)">([\s\S]*?)<\/li>/g)];
        assert.equal(cs.length, 2);
        cs.forEach((m) => assert.match(m[3], /^<div class="cap"><div class="fsoon">New &middot; coming in the next update<\/div><span class="eb">/, m[1] + ': no coming tag'));
        assert.equal((coming209.match(/New &middot; coming in the next update/g) || []).length, 3, 'the row tag + 2 card tags, exactly');
        // every "New" in the row is the tag's "New · coming in the next update"; never "New in 2.0.9", "available", "in review"
        assert.equal((t.match(/\bNew\b/g) || []).length, 3);
        assert.equal((t.match(/New · coming in the next update/g) || []).length, 3);
        assert.doesNotMatch(t, /new in 2\.0\.9|\b(available|out now|now live|download (it )?now|get it|in the app now|on the App Store|on Google Play|update now|in review)\b/i);
        assert.doesNotMatch(coming209, /apps\.apple\.com|play\.google\.com/);
        // the copy names what 2.0.9 changes (positive control for the guard below)
        [/Red means under\./, /under-par number on the Receipt, the boards and the leaderboard shows in red/, /Even and over par stay plain\./, /Birdies are still circles, bogeys squares\./,
            /HardPan’s replies read the same way\./, /the under-par number inside the answer is red too/, /live chip and the tournament card/]
            .forEach((re) => assert.match(t.replace(/&minus;/g, '−'), re, String(re)));
        // never green for under par, and no money in the row
        assert.doesNotMatch(t, /\bgreen\b/i);
        assert.doesNotMatch(t, MONEY);
        assert.doesNotMatch(t, /\b(settle|owes?|pool|payout|wager)\b|\$/i);
        // UNSHIPPED guard: the 2.0.9 features are coming, so they are named only inside #coming209 (the 2.0.8 row's own
        // "Under par in red on the GPS screen." shipped in 2.0.8 and is taken out with that row)
        const rest = textOf(html.replace(coming209, '').replace(update208, ''));
        assert.match(rest, /EVERYTHING IN THE APP/, 'positive: the slice still has the rest of the page');
        assert.doesNotMatch(rest, UNSHIPPED_209);
        // the All-in / GPS v2 plans ladder is in the 2.0.9 code behind a live switch that is off: not a feature, never named
        assert.doesNotMatch(textOf(html), PLANS_209);
        assert.doesNotMatch(rawHome, PLANS_209);
    });

    test('co-organizers and the season page stay out', () => {
        // 2.0.8 release re-pin: two Also new lists now sit inside #features (2.0.8 first, then 2.0.7); the soon208 class is gone.
        const lists = [...feat.matchAll(/<ul class="new207" aria-label="(Also new in 2\.0\.[78])">([\s\S]*?)<\/ul>/g)];
        assert.deepEqual(lists.map((m) => m[1]), ['Also new in 2.0.8', 'Also new in 2.0.7']);
        const also207 = lists[1][2];
        assert.match(textOf(also207), /Season board/, 'positive: the 2.0.7 list names the Season board');
        assert.doesNotMatch(textOf(lists.reduce((h, m) => h.replace(m[2], ''), feat)), /co-?organi[sz]er|season/i);
        lists.forEach((m) => assert.doesNotMatch(textOf(m[2]), /co-?organi[sz]er/i, m[1]));
    });
});

describe('3. clips', () => {
    const manifest = JSON.parse(read('media/clips/manifest.json'));
    const CLIPS = { 'f-gps': 'gps', 'f-allgames': 'add-a-game', 'f-group': 'group-scoring', 'f-games': 'games-live-board', 'f-results': 'results', 'f-tourney': 'tournaments' };
    test('exactly the six features with a clip play one; the others are stills', () => {
        const withClip = cards.filter((c) => c.video);
        assert.deepEqual(Object.fromEntries(withClip.map((c) => [c.id, /data-src="\/media\/clips\/([a-z-]+)\.mp4"/.exec(c.video)[1]])), CLIPS);
        withClip.forEach((c) => {
            const v = c.video;
            ['muted', 'playsinline'].forEach((k) => assert.match(v, new RegExp('\\b' + k + '\\b'), c.h + ' ' + k));
            assert.match(v, /preload="none"/, c.h + ': the clip downloads before it is near');
            assert.doesNotMatch(v, /\bloop\b|autoplay|controls|(?<![-\w])src="/, c.h + ': the clip must start from data-src, in view, once');
            const name = /data-src="\/media\/clips\/([a-z-]+)\.mp4"/.exec(v)[1];
            assert.ok(exists('media/clips/' + name + '.mp4'), name + '.mp4 missing');
            assert.ok(manifest.clips.some((m) => m.file === name + '.mp4'), name + ' not in the manifest');
            assert.doesNotMatch(v, /poster=/, c.h + ': a hidden poster would download up front (the card\'s sharp <img> is the still)');
            assert.match(c.body, new RegExp('<img [^>]*/media/screens/' + c.key + '-'), c.h + ': no sharp still under the clip');
            assert.match(c.body, /<span class="clipchip">&#9654; clip 0:0\d<\/span>/, c.h + ': no clip chip in the caption');
        });
    });
    test('a card with a clip shows its sharp still until the clip plays (the still hides only on has-clip)', () => {
        assert.match(html, /\.ph \.s\.has-clip img \{ opacity:0; \}/);
        assert.match(read('site-clips.js'), /v\.parentNode\.classList\.add\('has-clip'\)/);
    });
});

describe('4. Try the GPS', () => {
    const map = (/<div class="map" id="tg-map"[^>]*>/.exec(feat) || [''])[0];
    const num = (k) => (/data-[a-z]+/.test(k) ? (new RegExp(k + '="([^"]+)"').exec(map) || [])[1] : null);
    // Nov 11 (Manny): Esri World Imagery loaded live with the WEBSITE's own key (site-esri-config.js),
    // credited "Powered by Esri". Was (Option D, Nov 10): an inline OpenStreetMap SVG, no outside request.
    const CFG = read('site-esri-config.js');
    const KEY = (/key: '([^']+)'/.exec(CFG) || [])[1];
    test('Esri World Imagery with the Esri credit, labelled as a demo; the OpenStreetMap drawing is gone', () => {
        assert.ok(map, 'no map');
        assert.match(feat, /<p class="cred">Powered by Esri &middot; Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community &middot; Hole outline &copy; OpenStreetMap contributors<\/p>/);
        assert.match(feat, /<p class="tnote">Demo: [^<]*does not ask for your location, and nothing leaves the page but the requests for the satellite picture, loaded live from Esri\./);
        assert.match(feat, /Dobson Ranch &middot; Hole 7 &middot; Par 3/);
        assert.doesNotMatch(feat, /<svg class="osm"/, 'the OSM drawing is back');
    });
    test('the key: the website\'s own key lives in site-esri-config.js and NOWHERE else in the repo; it is not the app\'s key', () => {
        assert.ok(KEY && KEY.length > 40, 'no key in site-esri-config.js');
        assert.match(CFG, /tiles: 'https:\/\/ibasemaps-api\.arcgis\.com\/arcgis\/rest\/services\/World_Imagery\/MapServer\/tile\/\{z\}\/\{y\}\/\{x\}\?token=\{key\}'/);
        const holders = [];
        const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach((e) => {
            const r = d ? d + '/' + e.name : e.name;
            if (e.isDirectory()) { if (!/^(\.git|node_modules|gps-beta|android|ios)$/.test(e.name)) walk(r); return; }
            let t; try { t = fs.readFileSync(path.join(ROOT, r), 'latin1'); } catch (er) { return; }
            if (t.includes(KEY)) holders.push(r);
        });
        walk('');
        assert.deepEqual(holders, ['site-esri-config.js'], 'the website key is in more than one file');
        if (fs.existsSync(path.join(ROOT, 'gps-config.js'))) assert.ok(!read('gps-config.js').includes(KEY), 'the website key is the app key');
        // the homepage loads the config before site-features.js (both deferred, so in this order)
        assert.match(html, /<script src="\/site-esri-config\.js" defer><\/script>\n<script src="\/site-features\.js" defer><\/script>/);
    });
    test('16 z19 tiles on the page\'s own grid at the hole; no tile URL in the HTML (site-features.js builds it from the config); no other outside URL', () => {
        const tl = /<div class="tiles" data-z="(\d+)" data-ox="([\d.]+)" data-oy="([\d.]+)" data-tile="256" role="img" aria-label="Satellite picture of hole 7 at Dobson Ranch[^"]*Esri World Imagery, loaded live\.">([\s\S]*?)<\/div>/.exec(feat);
        assert.ok(tl, 'no tiles');
        const Z = Number(tl[1]), OX = Number(tl[2]), OY = Number(tl[3]);
        assert.equal(Z, 19);
        const lon = OX / (256 * Math.pow(2, Z)) * 360 - 180, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * OY / (256 * Math.pow(2, Z))))) * 180 / Math.PI;
        assert.ok(Math.abs(lat - 33.3718) < 0.0006 && Math.abs(lon + 111.8683) < 0.0006, 'the grid origin is not at the hole: ' + lat + ',' + lon);
        const ims = [...tl[4].matchAll(/<img class="tile" data-y="(\d+)" data-x="(\d+)" style="left:(-?[\d.]+)%;top:(-?[\d.]+)%" width="256" height="256" loading="lazy" decoding="async" alt="">/g)];
        assert.equal(ims.length, 16, '16 tiles expected');
        ims.forEach((m) => {
            // each tile sits where the grid puts it: (x*256 - OX) / 610, (y*256 - OY) / 780
            const L = (Number(m[2]) * 256 - OX) / 610 * 100, T = (Number(m[1]) * 256 - OY) / 780 * 100;
            assert.ok(Math.abs(L - Number(m[3])) < 0.01 && Math.abs(T - Number(m[4])) < 0.01, 'tile ' + m[1] + '/' + m[2] + ' is off the grid');
        });
        assert.doesNotMatch(tl[4], /src=|https?:/, 'a tile URL (or a key) is in the HTML');
        // site-features.js builds the URL from the config, with the key, at z19
        assert.match(JS, /var cfg = window\.HP_SITE_ESRI, tiles = map\.querySelectorAll\('\.tile'\);/);
        assert.match(JS, /im\.src = cfg\.tiles\.replace\('\{z\}', '19'\)\.replace\('\{y\}', im\.getAttribute\('data-y'\)\)\.replace\('\{x\}', im\.getAttribute\('data-x'\)\)\s*\.replace\('\{key\}', encodeURIComponent\(cfg\.key\)\);/);
        assert.doesNotMatch(JS, /arcgisonline|server\.arcgisonline/i, 'the keyless public tile host is back');
        // the saved picture: deleted (Manny typed "OK delete saved Esri picture", Nov 10) and served by nothing
        const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).concat(fs.readdirSync(path.join(ROOT, 'help')).filter((f) => f.endsWith('.html')).map((f) => 'help/' + f));
        pages.forEach((f) => assert.ok(!read(f).includes('try-gps-dobson-7'), f + ' still serves the saved picture'));
        assert.ok(!/try-gps-dobson-7/.test(JS + read('site-clips.js') + read('sw.js')));
        const man = JSON.parse(read('media/screens/manifest.json'));
        assert.equal(man.try_gps.file, null); assert.match(man.try_gps.deleted, /OK delete saved Esri picture/);
        assert.ok(!fs.existsSync(path.join(ROOT, 'media/screens/try-gps-dobson-7.webp')), 'the saved Esri picture is back on disk');
        // no outside URL anywhere in the whole features section
        const outside = [...feat.matchAll(/\b(?:src|href|data-src|poster|xlink:href|srcset)="([^"]*https?:[^"]*)"/g)].map((m) => m[1]);
        assert.deepEqual(outside, [], 'an outside URL in the features section');
        assert.doesNotMatch(feat, /https?:\/\//, 'an outside URL in the features section');
    });
    test('the yards: tee to the middle of the green measured on the picture is the hole\'s own 140 m (153 y)', () => {
        const mpp = Number(num('data-mpp')), you = num('data-you').split(',').map(Number), mid = num('data-mid').split(',').map(Number);
        // Web Mercator z19 at Dobson Ranch (33.371 N): 156543.03392 * cos(lat) / 2^19 m per pixel.
        assert.ok(Math.abs(mpp - 156543.03392 * Math.cos(33.371 * Math.PI / 180) / Math.pow(2, 19)) < 1e-4, 'the scale is not z19 at this latitude');
        const yds = Math.hypot(you[0] - mid[0], you[1] - mid[1]) * mpp / 0.9144;
        assert.ok(Math.abs(yds - 153) <= 3, 'tee to middle is ' + yds.toFixed(1) + ' y on the picture, the OSM line says 153');
        assert.match(feat, /From the tee: 153 y to the middle of the green\./);
        assert.match(JS, /Math\.hypot\(a\[0\] - b\[0\], a\[1\] - b\[1\]\) \* MPP \/ 0\.9144/, 'the tap uses the same scale');
    });
    test('the page never asks for a location', () => {
        assert.doesNotMatch(JS + read('site-clips.js') + html, /geolocation|getCurrentPosition|watchPosition/);
    });
});

describe('5. Try Just say it', () => {
    test('it says nothing is saved, and the script sends and stores nothing', () => {
        assert.match(feat, /Nothing is saved and nothing is sent: this demo runs only on this page\./);
        assert.doesNotMatch(JS, /\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|document\.cookie|\.submit\(\)|import\(/);
        assert.match(JS, /form\.addEventListener\('submit', function \(ev\) \{ ev\.preventDefault\(\);/, 'the form must never really submit');
        assert.doesNotMatch(feat, /<form[^>]*\baction=/);
    });
    test('the first card is on the page before any script runs, and every table card has a sentence chip', () => {
        const T = sayTable();
        assert.ok(T.length >= 4);
        assert.match(feat, new RegExp('<div class="out" id="ts-out" aria-live="polite">[\\s\\S]*?<div class="ak-ct">' + T[0].title + '</div>'));
        T.forEach((r) => {
            assert.ok(feat.includes('data-say="' + r.text.replace(/&/g, '&amp;') + '"'), r.text + ': no chip');
            assert.ok(r.says.length >= 1 && r.lines.length >= 3);
            assert.ok(r.lines.some((l) => l[0] === 'Amount' && l[1] === 'No amount'), r.text + ': every demo game is for no amount');
        });
    });
    test('each canned card is exactly what the app\'s parser builds (dev-204 ask-hardpan.js), when that branch is here', (t) => {
        let src;
        try { src = execFileSync('git', ['show', 'dev-204:ask-hardpan.js'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); }
        catch (e) { t.skip('dev-204 is not in this repo'); return; }
        const mod = { exports: {} };
        new Function('module', 'exports', 'window', 'document', src)(mod, mod.exports, undefined, undefined);
        const A = mod.exports;
        const ctx = { players: [{ id: 'p1', name: 'Sam' }, { id: 'p2', name: 'Josh' }, { id: 'p3', name: 'Bob' }, { id: 'p4', name: 'Paul' }], meId: 'p1', holes: Array.from({ length: 18 }, (_, i) => i + 1), nowHole: 4 };
        sayTable().forEach((r) => {
            [r.text].concat(r.says).forEach((s) => {
                const p = A.askParse(s, ctx);
                assert.equal(p.kind, 'game', s);
                assert.deepEqual(p.missing, [], s + ': the app would ask for more');
                assert.equal(p.title, r.title, s);
                assert.deepEqual(p.lines.map((l) => [l.label, l.value]), r.lines, s);
            });
        });
    });
});

describe('6. served, static, not the app', () => {
    test('the screens and the script are served as static files (not blocked, no Function)', async () => {
        const MW = await import(pathToFileURL(path.join(ROOT, 'functions', '_middleware.js')).href);
        const inc = JSON.parse(read('_routes.json')).include;
        const files = fs.readdirSync(path.join(ROOT, 'media', 'screens'));
        assert.ok(files.length >= 45, 'positive: the screens are there');
        files.forEach((f) => assert.equal(MW.isBlockedPath('/media/screens/' + f), false, f + ' would answer 404'));
        assert.equal(MW.isBlockedPath('/site-features.js'), false);
        ['/media/*', '/media/screens/*', '/site-features.js', '/*.webp', '/*.js'].forEach((r) => assert.ok(!inc.includes(r), r + ' runs a Function'));
    });
    test('not in the app\'s service-worker shell or the native bundle; the worker version did not move', () => {
        const sw = read('sw.js');
        const shell = sw.slice(sw.indexOf('const SHELL_FILES = ['), sw.indexOf('];', sw.indexOf('const SHELL_FILES = [')));
        assert.ok(shell.length > 200, 'positive: the shell list was found');
        assert.doesNotMatch(shell, /site-features|media\/|hardpan-home/);
        assert.doesNotMatch(read('sync-mobile-web.js'), /site-features|media\/screens/);
        // Re-pinned 2026-11-11: v397-2.0, icon B moved it.
        assert.match(sw, /const CACHE_VERSION = 'golfapp-v420-2\.0';/);
    });
    test('first load stays light: nothing in the rows loads eagerly', () => {
        assert.doesNotMatch(feat, /<img(?![^>]*loading="lazy")[^>]*>/, 'an image in the rows loads up front');
        assert.doesNotMatch(feat, /<video(?![^>]*preload="none")[^>]*>/, 'a clip loads up front');
        assert.doesNotMatch(html, /<link[^>]+rel="preload"[^>]+media\//);
    });
});
