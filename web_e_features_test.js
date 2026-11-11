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
//   4. Try the GPS: the Esri + OpenStreetMap credit, a demo label, the hole's
//      tee-to-middle distance from the picture's scale matches the hole's own
//      OSM line (140 m = 153 y), and the script never asks for a location.
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
    'Play': ['Every yard. Every hole.', 'Hit the number it plays.', 'Know what you can carry.', 'Miss on the right side.', 'No signal? Still every yard.', 'Your real carries.'],
    'Games': ['Set up the game in one sentence.', 'Every game your group plays.', 'Score the whole group in one tap.', 'Every game, as it happens.', 'The final word, ready to share.', 'Who owes who, done.'],
    'Your group': ['Same game. Same code. Every week.', 'Talk to the round.', 'Same group? One tap.', 'One board for the whole trip.', 'Every round you’ve played.'],
    'Organize': ['Run the day from your phone.', 'A tournament in four questions.', 'Join the tournament.', 'Every group. One board.', 'Prizes, sorted.'],
    'Get better': ['See where shots go.', 'Practice what costs you.', 'Ask what it plays.']
};
// $, betting words, and price shapes (a number per month/year, "free trial" days).
const MONEY = /\$|\b(bet|bets|betting|wager\w*|gambl\w*|pot|pots|buy-?ins?|stake|stakes|dollars?|bucks|price|prices|priced)\b|\d+\s*\/\s*(mo|month|yr|year)\b|\bper (month|year)\b/i;

describe('1. the 25 cards', () => {
    test('five rows in order, 6 + 6 + 5 + 5 + 3 cards, right after the hero', () => {
        assert.deepEqual(groups.map((g) => g.name), Object.keys(HEADLINES));
        assert.deepEqual(groups.map((g) => g.n), [6, 6, 5, 5, 3]);
        assert.equal(cards.length, 25);
        const at = html.indexOf('id="features"');
        assert.ok(at > html.indexOf('class="wrap hero"') && at < html.indexOf('class="wrap split"'), 'the rows are not between the hero and the golfer/organizer panels');
        assert.match(html, /EVERYTHING IN THE APP/);
        groups.forEach((g) => assert.match(feat, new RegExp('<span class="gn">' + g.n + ' &middot; swipe &rarr;</span>'), g.name + ': no "N · swipe →"'));
    });

    test('every card has its headline, one line, and a screen with alt text', () => {
        assert.deepEqual(cards.map((c) => c.h), [].concat(...Object.values(HEADLINES)));
        const ids = new Set();
        cards.forEach((c) => {
            assert.ok(!ids.has(c.id), c.id + ' twice'); ids.add(c.id);
            assert.ok(c.p.length >= 20 && c.p.length <= 90, c.h + ': the one line is "' + c.p + '"');
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
        assert.equal(wide, 25, 'only ' + wide + ' of 25 screens are 2x or sharper');
    });

    // RE-CAPTURE (Nov 10): hazards, range, my-bag and weekly-code were re-shot from the 2.0.5 web app
    // (release-205) in headless Chrome at 390x844 @3x - 1170x2532, light sheets, demo golfer Sam. The older
    // files (a dark sheet, a cropped title, a 295 px poster; the three old -400 files as -400-superseded) stay in
    // media/screens/ and nothing serves them;
    // media/screens/manifest.json lists every screen and marks those files superseded.
    test('the four re-captured screens are the 3x captures; the screens manifest lists all 25 and marks the old files unused', () => {
        const manifest = JSON.parse(read('media/screens/manifest.json'));
        assert.equal(manifest.folder, '/media/screens/');
        assert.equal(manifest.screens.length, 25);
        assert.deepEqual(manifest.screens.map((s) => s.key), cards.map((c) => c.key), 'the manifest lists the cards in page order');
        ['hazards', 'range', 'my-bag', 'weekly-code'].forEach((k) => {
            const c = cards.find((x) => x.key === k);
            assert.match(c.img, new RegExp('src="/media/screens/' + k + '-400\\.webp" srcset="/media/screens/' + k + '-400\\.webp 400w, /media/screens/' + k + '-1170\\.webp 1170w"'), k + ': not the 400 + 1170 pair');
            assert.match(c.img, /\bwidth="1170" height="2532"/, k + ': not a 390x844 @3x capture');
            const m = manifest.screens.find((s) => s.key === k);
            assert.ok(m && /release-205/.test(m.captured) && m.recaptured, k + ': the manifest does not say where it came from');
            assert.deepEqual(m.files, ['/media/screens/' + k + '-400.webp', '/media/screens/' + k + '-1170.webp']);
        });
        manifest.screens.forEach((s) => s.files.forEach((f) => assert.ok(exists(f.slice(1)), f + ' is missing')));
        // the superseded files: still here, listed, and served by no page
        const old = ['/media/screens/hazards-400-superseded.webp', '/media/screens/hazards-786.webp', '/media/screens/my-bag-400-superseded.webp', '/media/screens/my-bag-786.webp', '/media/screens/range-400-superseded.webp', '/media/screens/range-786.webp', '/media/screens/weekly-code-295.webp'];
        assert.deepEqual(manifest.superseded.map((s) => s.file).sort(), old);
        manifest.superseded.forEach((s) => { assert.ok(exists(s.file.slice(1)), s.file + ' was deleted'); assert.deepEqual(s.used_on, []); assert.match(s.unused_since, /re-capture/); });
        const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).concat(fs.readdirSync(path.join(ROOT, 'help')).map((f) => 'help/' + f)).filter((f) => f.endsWith('.html'));
        pages.forEach((f) => old.forEach((o) => assert.ok(!read(f).includes(o), f + ' still serves ' + o)));
        assert.ok(!/-786\.webp|-295\.webp|-superseded\.webp/.test(read('site-features.js')));
        // no "Test" golfer, no amount on the captures' alt text (the demo golfers are Sam, Josh, Bob, Paul)
        ['hazards', 'range', 'my-bag', 'weekly-code'].forEach((k) => { const alt = /\balt="([^"]*)"/.exec(cards.find((x) => x.key === k).img)[1]; assert.doesNotMatch(alt, /\bTest\b|\$/, k); });
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

    test('"Coming soon" is on Offline maps and Ask caddie, and nowhere else', () => {
        const soon = cards.filter((c) => c.soon).map((c) => [c.h, c.soon]);
        assert.deepEqual(soon, [['No signal? Still every yard.', 'COMING SOON · iPHONE 2.0.5'], ['Ask what it plays.', 'COMING SOON']]);
        const rest = html.replace(/<div class="fsoon">[^<]*<\/div>/g, '');
        assert.doesNotMatch(rest, /coming soon/i, 'a Coming soon outside those two cards');
    });

    test('co-organizers and the season page stay out', () => {
        assert.doesNotMatch(textOf(feat), /co-?organi[sz]er|season/i);
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
    test('a real satellite hole with the Esri and OpenStreetMap credit, labelled as a demo', () => {
        assert.ok(map, 'no map');
        assert.match(feat, /<p class="cred">Powered by Esri &middot; Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community &middot; Hole outline &copy; OpenStreetMap contributors<\/p>/);
        assert.match(feat, /<p class="tnote">Demo: [^<]*does not ask for your location, and nothing leaves the page\./);
        assert.ok(exists('media/screens/try-gps-dobson-7.webp'));
        assert.match(feat, /Dobson Ranch &middot; Hole 7 &middot; Par 3/);
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
        assert.match(sw, /const CACHE_VERSION = 'golfapp-v395-2\.0';/);
    });
    test('first load stays light: nothing in the rows loads eagerly', () => {
        assert.doesNotMatch(feat, /<img(?![^>]*loading="lazy")[^>]*>/, 'an image in the rows loads up front');
        assert.doesNotMatch(feat, /<video(?![^>]*preload="none")[^>]*>/, 'a clip loads up front');
        assert.doesNotMatch(html, /<link[^>]+rel="preload"[^>]+media\//);
    });
});
