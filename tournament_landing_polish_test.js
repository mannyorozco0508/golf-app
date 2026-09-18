// ============================================================================
// THE TOURNAMENT LANDING POLISH IS PRESENTATION ONLY - PROVED, NOT PROMISED.
//
// The wave (2026-09-16) gives /tournament a hero band (imagery under a dark
// overlay, the "Rattle / Tournaments" wordmark, one line of copy), moves the
// organizer sign-in below it as a compact card, gives the format picker visual
// weight and restyles the name / course / entry-fee fields. Nothing about what
// the page DOES may change: same ids, same handlers, same save payload, same
// sign-in behaviour, same gate.
//
// HOW THAT IS HELD, the way every presentation wave since v136 has been held:
//
//   1. The setup screen's tag-stripped TEXT before the wave is captured in
//      tournament_landing_prev.fixture.json and pinned by sha. Today's text must
//      equal the old text with EXACTLY the deliberate substitutions listed in
//      DELIBERATE below - a fourth change, however small, is red.
//   2. Every id the scripts read, and every inline handler the user taps, is
//      asserted present exactly once and byte-identical.
//   3. The behaviour is driven the way a user drives it, as far as mini-dom
//      allows: the card's own onclick string from the markup is what runs, the
//      save is the page's own saveTournament, the sign-in panel is what the
//      page's own auth listener renders.
//
// WHAT MINI-DOM CANNOT PROVE HERE, AND WHERE IT IS PROVED INSTEAD. Layout: that
// the hero is a band and not a 0x0 box, that the grid is one column on a phone
// and two on a tablet, that nothing overflows sideways, that the sign-in card
// sits BELOW the hero on screen. mini-dom has no layout and parses no static
// class or style, so `.active` on the Scramble card in the markup is invisible
// to it. tools/tournament-landing-check.js measures all of that in headless
// Chrome, cold, calling no page function.
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');
const { decodeEscapes } = require('./helpers/decode-escapes.js');

const PAGE = 'tournament.html';
const FIXTURE = 'tournament_landing_prev.fixture.json';
// sha256 of the fixture as captured at ad28d3f (v159). Re-pin only with a note
// saying which wave moved the baseline and why.
const FIXTURE_SHA = '081813cd';
const HERO_LINE = 'Live scoring + registration for charity, member-guest, and club events.';

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const sha8 = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);
const strip = (x) => x.replace(/<[^>]+>/g, '|').replace(/[\s|]*\|[\s|]*/g, '|').replace(/\s+/g, ' ').trim();

// The setup screen: from its container to the register screen's, comments out.
function setupRegion(html) {
    const a = html.indexOf('<div class="container" id="setup-screen">');
    const b = html.indexOf('<div class="container" id="register-screen"');
    assert.ok(a > 0 && b > a, 'the setup screen or the register screen is not where it was');
    return html.slice(a, b).replace(/<!--[\s\S]*?-->/g, '');
}
const styleOf = (html) => html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

// EXACTLY what the wave changed in the setup screen's text. Each `from` must occur
// once in the baseline; applying all three must give today's text.
const DELIBERATE = [
    {
        // FIRST, and it must stay first: the baseline's opening token is the
        // toggle's label, and the trophy substitution below begins on the very
        // next token - applied in this order, the trophy `from` is still intact
        // when its turn comes. (Dark mode left the Tournament product on
        // 2026-09-18, Option B: the shared golfapp-theme key decided it.)
        why: 'the dark-mode toggle is gone from the setup screen',
        from: '|\u{1F319} Dark Mode|',
        to: '|'
    },
    {
        why: 'the trophy glyph, the bare title and the old subtitle become the hero band',
        from: '|🏆|Tournament|Multi-team events with a shared leaderboard — built for benefit tournaments, member-guests, and club events.|',
        to: '|Rattle|/|Tournaments|' + HERO_LINE + '|'
    },
    {
        why: 'the Individual card gets the same icon slot as the other three instead of an emoji inside its name',
        from: '|🏌️ Individual Stroke Play|',
        to: '|🏌️|Individual Stroke Play|'
    },
    {
        why: 'the entry fee box carries a currency adornment beside the input',
        from: '|Entry Fee per Team ($, optional)|',
        to: '|Entry Fee per Team ($, optional)|$|'
    }
];

describe('THE BASELINE is what it was, and today differs from it by exactly the deliberate changes', () => {
    const fixture = JSON.parse(read(FIXTURE));

    test('the fixture is pinned by sha, and is not empty', () => {
        assert.equal(sha8(read(FIXTURE)), FIXTURE_SHA,
            'tournament_landing_prev.fixture.json changed. It is the setup screen BEFORE the polish '
            + 'wave; if a later wave legitimately moves the baseline, re-capture, re-pin, and say so.');
        assert.ok(fixture.text.length > 1500, 'the baseline text is suspiciously short: ' + fixture.text.length);
        assert.ok(fixture.text.includes('|Tournament Name|') && fixture.text.includes('|2-Man Best Ball|'),
            'the baseline is not the setup screen');
    });

    test('every deliberate substitution names text that WAS there, exactly once', () => {
        DELIBERATE.forEach((d) => {
            assert.equal(fixture.text.split(d.from).length - 1, 1,
                `"${d.from}" must occur exactly once in the baseline (${d.why})`);
        });
    });

    test('today\'s setup screen text == baseline + the deliberate substitutions, nothing else', () => {
        let expected = fixture.text;
        DELIBERATE.forEach((d) => { expected = expected.replace(d.from, d.to); });
        const today = strip(decodeEscapes(setupRegion(read(PAGE))));
        assert.equal(today, expected,
            'the setup screen says something the wave did not mean to change. Every word a golfer '
            + 'or organizer reads on this screen is either the pre-wave word or one of the three '
            + 'listed in DELIBERATE.');
    });
});

describe('THE HERO BAND', () => {
    const region = setupRegion(read(PAGE));
    const style = styleOf(read(PAGE));

    test('exists, carries the wordmark as three parts in order and the one line, byte-exact', () => {
        const at = region.indexOf('id="tourney-hero"');
        assert.ok(at > 0, 'no #tourney-hero on the setup screen');
        const hero = region.slice(at, region.indexOf('id="signin-panel-setup"'));
        assert.match(hero, />Rattle<\/span>\s*<span[^>]*>\/<\/span>\s*<span[^>]*>Tournaments<\/span>/,
            'the wordmark must read Rattle / Tournaments - parent brand, then the product');
        assert.ok(hero.includes('>' + HERO_LINE + '<'), 'the hero line is not byte-exact');
        assert.ok(!/\\u[0-9a-fA-F]{4}/.test(hero), 'a \\uXXXX escape in raw markup prints literally');
    });

    test('the old lobby header is gone from the setup screen (and only from there)', () => {
        assert.ok(!/class="lobby-logo">🏆</.test(region), 'the trophy lobby-logo is still on the setup screen');
        assert.ok(!/class="lobby-title">Tournament</.test(region), 'the bare "Tournament" title is still there');
        // The register screen keeps its own lobby header - that screen is not in this wave.
        const page = read(PAGE);
        assert.match(page, /class="lobby-title" id="reg-event-name"/, 'the register screen\'s header must be untouched');
    });

    test('the imagery is a local placeholder under assets/tournament-hero*, never a hotlink', () => {
        const urls = [...style.matchAll(/url\((['"]?)([^'")]+)\1\)/g)].map((m) => m[2]);
        const hero = urls.filter((u) => /tournament-hero/.test(u));
        assert.ok(hero.length >= 1, 'the stylesheet references no tournament-hero image: ' + JSON.stringify(urls));
        hero.forEach((u) => {
            assert.match(u, /^assets\/tournament-hero[^/]*$/, 'the hero image must live under assets/ as tournament-hero*: ' + u);
            assert.ok(fs.existsSync(path.join(__dirname, u)), 'the referenced placeholder is missing: ' + u);
            assert.ok(fs.statSync(path.join(__dirname, u)).size > 500, 'the placeholder is empty: ' + u);
        });
        assert.ok(!/url\((['"]?)https?:/.test(style), 'a stylesheet url() points at the network - no stock hotlinks');
        assert.ok(!/<img[^>]+src=(['"])https?:/.test(region), 'an <img> on the setup screen hotlinks');
    });

    test('the band paints its own dark ground under the image, so an unfetched image is a plain band, not a hole', () => {
        const rule = /\.tourney-hero-art\s*\{[^}]*\}/.exec(style);
        assert.ok(rule, 'no .tourney-hero-art rule');
        assert.match(rule[0], /background-color:\s*#[0-9a-fA-F]{3,8}/, 'the art layer needs a solid background-color fallback');
        assert.match(rule[0], /background-image:\s*url\(/, 'the art layer carries the image');
        assert.ok(/\.tourney-hero-shade\s*\{[^}]*(rgba\(|linear-gradient\()/.test(style), 'no dark overlay layer over the image');
    });

    test('the sign-in comes after the hero and before the first field; no dark-mode toggle anywhere on the screen (Option B, 2026-09-18)', () => {
        const i = (s) => { const k = region.indexOf(s); assert.ok(k >= 0, s + ' missing'); return k; };
        assert.ok(i('id="tourney-hero"') < i('id="signed-in-as-setup"'), 'the signed-in line must follow the hero');
        assert.ok(i('id="signed-in-as-setup"') < i('id="signin-panel-setup"'), 'then the sign-in panel');
        assert.ok(i('id="signin-panel-setup"') < i('id="t-name"'), 'then the first field');
        const hero = region.slice(i('id="tourney-hero"'), i('id="signed-in-as-setup"'));
        // POSITIVE: the band is still the band.
        assert.match(hero, /class="tourney-wordmark"/);
        assert.doesNotMatch(hero, /theme-toggle-btn|toggleTheme/, 'the toggle is back in the band');
        assert.equal((region.match(/onclick="toggleTheme\(\)"/g) || []).length, 0, 'no toggle on the setup screen');
    });
});

describe('THE FIELDS AND THE PICKER keep every id and every handler', () => {
    const region = setupRegion(read(PAGE));
    const once = (re, what) => assert.equal((region.match(re) || []).length, 1, what + ' must appear exactly once');

    test('the ids the scripts read', () => {
        ['t-name', 'course-search-input', 'course-dropdown', 'course-key', 'main-format-picker',
         'fmt-scramble', 'fmt-shamble', 'fmt-individual', 'fmt-bestball', 'shamble-count-group',
         'shamble-count-best', 'individual-setup-note', 'ind-net-warning', 't-entry-fee-label', 't-entry-fee',
         't-entry-fee-help', 'multi-round-toggle', 'teams-list', 'trip-context-banner', 'trip-context-name',
         'signed-in-as-setup', 'signin-panel-setup']
            .forEach((id) => once(new RegExp('id="' + id + '"', 'g'), '#' + id));
    });

    test('the inputs are the same inputs', () => {
        assert.match(region, /<input type="text" id="t-name" placeholder="e\.g\. Hope Foundation Golf Tournament">/);
        assert.match(region, /<input type="text" id="course-search-input" placeholder="-- Search \/ Select Golf Course --" autocomplete="off" oninput="filterCourseDropdown\(this\.value\)" onfocus="openCourseDropdown\(\)">/);
        assert.match(region, /<input type="hidden" id="course-key">/);
        assert.match(region, /<input type="number" id="t-entry-fee" value="0" min="0" placeholder="0">/);
        assert.match(region, /<label id="t-entry-fee-label">Entry Fee per Team \(\$, optional\)<\/label>/);
    });

    test('the four format cards keep their handlers, names and descriptions, and only those four sit in the picker', () => {
        const a = region.indexOf('id="main-format-picker"');
        const picker = region.slice(a, region.indexOf('id="shamble-count-group"'));
        [['scramble', 'Scramble', 'One team score per hole'],
         ['shamble', 'Shamble', 'Best drive, then play your own ball'],
         ['individual', 'Individual Stroke Play', 'Every golfer for themselves. Gross or Net, with flights and scoring groups.'],
         ['bestball', '2-Man Best Ball', 'Low ball of the pair counts']].forEach(([k, name, desc]) => {
            assert.match(picker, new RegExp('id="fmt-' + k + '" onclick="selectFormat\\(\'' + k + '\'\\)"'), 'fmt-' + k + ' handler');
            assert.ok(picker.includes('>' + name + '</div>'), 'fmt-' + k + ' name: ' + name);
            assert.ok(picker.includes('>' + desc + '</div>'), 'fmt-' + k + ' description');
        });
        assert.equal((picker.match(/onclick="selectFormat\(/g) || []).length, 4, 'four cards, four handlers');
        assert.match(picker, /id="fmt-scramble"[^>]*class="format-card active"|class="format-card active" id="fmt-scramble"/,
            'Scramble is still the default (active) card in the markup');
    });

    test('the save button and the shamble-count cards are untouched', () => {
        once(/onclick="saveTournament\(this\)"/g, 'the Save button');
        once(/onclick="setShambleCount\(1\)"/g, 'Best 1');
        once(/onclick="setShambleCount\(2\)"/g, 'Best 2');
    });

    test('no lock word on the setup screen, and no protection claim in the hero', () => {
        assert.ok(!/\b(Protected|Secure|Locked|Private)\b/.test(region), 'the restyle must not promise a lock');
    });
});

// ---------------------------------------------------------------------------
// BEHAVIOUR, driven as a user drives it as far as mini-dom allows.
// ---------------------------------------------------------------------------
const ORGANIZER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };

// The card's own onclick, read from the markup and run in the page's sandbox.
// mini-dom parses no static attribute, so this is the nearest thing to the tap.
function tapCard(sb, key) {
    const m = new RegExp('id="fmt-' + key + '" onclick="([^"]+)"').exec(read(PAGE));
    assert.ok(m, 'no onclick on fmt-' + key);
    vm.runInContext(m[1], sb);
}
function fillSetup(sb) {
    const d = sb.document;
    d.getElementById('t-name').value = 'Polished Event';
    // course search (2026-09-17): a course with no card anywhere is no longer
    // selected - the silent par-4 fallback is gone - so the fixture hands the page
    // a card for cameron the way one arrives: through its own global_courses
    // listener. Nothing here calls a renderer.
    const CAMERON = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
    sb.__dbHandlers.filter((h) => h.event === 'value' && /global_courses$/.test(h.path)).forEach((h) =>
        h.cb({ val: () => ({ cameron: { name: 'Cameron', data: CAMERON } }), exists: () => true }));
    sb.pickCourse('cameron', 'Cameron');
    const list = d.getElementById('teams-list'); d.body.appendChild(list);
    const card = d.createElement('div'); card.className = 'team-card';
    const name = d.createElement('input'); name.className = 'team-name-input'; name.value = 'Eagles';
    const names = d.createElement('div'); names.className = 'team-name-inputs';
    ['Ann Alpha', 'Bo Bravo'].forEach((n) => { const i = d.createElement('input'); i.value = n; names.appendChild(i); });
    const hcp = d.createElement('input'); hcp.className = 'team-handicap-input'; hcp.value = '0';
    card.appendChild(name); card.appendChild(names); card.appendChild(hcp); list.appendChild(card);
}
const creatingSets = (sb) => sb.__dbWrites.filter((x) => /^tournaments\/[A-Z0-9]+$/.test(x.path) && x.op === 'set');

describe('THE PICKER still writes the format it shows', () => {
    test('tapping a card marks it active and selects its format', () => {
        // mini-dom parses no static class, so the page's querySelectorAll over
        // '#main-format-picker .format-card' finds nothing here and the PREVIOUS
        // card's .active is never cleared in this harness. Exclusivity - one
        // active card at a time - is measured in Chrome by
        // tools/tournament-landing-check.js. What this proves: the tap reaches
        // selectFormat, the tapped card gains .active, and the format the save
        // will read is the one tapped.
        const sb = loadHtmlInlineScript(PAGE);
        ['bestball', 'individual', 'shamble', 'scramble'].forEach((k) => {
            tapCard(sb, k);
            assert.ok(sb.document.getElementById('fmt-' + k).classList.contains('active'), 'after tapping ' + k);
            assert.equal(vm.runInContext('selectedFormat', sb), k, 'selectedFormat after tapping ' + k);
        });
    });

    for (const k of ['bestball', 'shamble', 'individual']) {
        test(`signed in, pick ${k}, Save: the creating set() carries format "${k}"`, async () => {
            const sb = loadHtmlInlineScript(PAGE);
            sb.__auth.setUser(ORGANIZER);
            sb.alert = () => {};
            tapCard(sb, k);
            fillSetup(sb);   // individual reads the same cards as a field of names
            await sb.saveTournament();
            await new Promise((r) => setImmediate(r));
            const sets = creatingSets(sb);
            assert.equal(sets.length, 1, 'one creating set: ' + JSON.stringify(sb.__dbWrites.map((w) => w.path)));
            assert.equal(sets[0].value.format, k);
            assert.equal(sets[0].value.ownerUid, 'u-org');
        });
    }
});

describe('THE SIGN-IN behaves as before, in its new place', () => {
    test('signed out: the setup panel renders the same fields and the same button, and is visible', () => {
        const sb = loadHtmlInlineScript(PAGE);
        sb.__auth.setUser(null);
        const p = sb.document.getElementById('signin-panel-setup');
        assert.equal(p.style.display, 'block');
        assert.match(p.innerHTML, /id="signin-panel-setup-email"/);
        assert.match(p.innerHTML, /id="signin-panel-setup-password"/);
        assert.match(p.innerHTML, /onclick="signInNow\('signin-panel-setup'\)"/);
        assert.match(p.innerHTML, /Organizers sign in to set up and edit a tournament\. Golfers never need to/);
        assert.ok(!/\b(Protected|Secure|Locked|Private)\b/.test(p.innerHTML), 'no lock word in the sign-in card');
        assert.ok(!/style="[^"]*border:1px solid var\(--border-mid\)/.test(p.innerHTML),
            'the panel is styled by class now, not by the old inline border - the restyle must reach it');
        assert.match(p.innerHTML, /class="signin-card"/, 'the compact card class');
    });

    test('signed in: the setup panel hides and the "Signed in as" line names the organizer', () => {
        const sb = loadHtmlInlineScript(PAGE);
        sb.__auth.setUser(ORGANIZER);
        const p = sb.document.getElementById('signin-panel-setup');
        assert.equal(p.style.display, 'none');
        assert.equal(p.innerHTML, '');
        const who = sb.document.getElementById('signed-in-as-setup');
        const text = (el) => (el.textContent || '') + (el.children || []).map(text).join('');
        assert.match(text(who), /Signed in as org@example\.com/);
    });

    test('the sign-in button still calls the same SDK method with what was typed', () => {
        const sb = loadHtmlInlineScript(PAGE);
        sb.__auth.setUser(null);
        const calls = [];
        sb.firebase.auth().signInWithEmailAndPassword = (e, p) => { calls.push([e, p]); return Promise.resolve(); };
        sb.document.getElementById('signin-panel-setup-email').value = ' org@example.com ';
        sb.document.getElementById('signin-panel-setup-password').value = 'pw';
        sb.signInNow('signin-panel-setup');
        assert.deepEqual(calls, [['org@example.com', 'pw']]);
    });
});

describe('DARK MODE is gone from this page (Option B, 2026-09-18); the palette variables stay', () => {
    test('toggleTheme is not defined on the loaded page and nothing sets the class', () => {
        const sb = loadHtmlInlineScript(PAGE);
        const html = sb.document.documentElement;
        assert.ok(!html.classList.contains('dark-mode'));
        assert.equal(typeof sb.toggleTheme, 'undefined', 'the toggle handler is back');
        assert.throws(() => vm.runInContext('toggleTheme()', sb), /toggleTheme is not defined/);
    });

    test('the hero and the restyled controls use the theme variables or their own fixed dark palette - no hard-coded light colours on themed surfaces', () => {
        const style = styleOf(read(PAGE));
        const picker = /#main-format-picker \.format-card\s*\{[^}]*\}/.exec(style);
        assert.ok(picker, 'no picker card rule');
        assert.match(picker[0], /var\(--/, 'the picker card must be themed through variables');
        const card = /\.signin-card\s*\{[^}]*\}/.exec(style);
        assert.ok(card, 'no .signin-card rule');
        assert.match(card[0], /var\(--/, 'the sign-in card must be themed through variables');
        // There is no dark override any more, so the picker card must simply
        // not hard-code a light colour: the variables are its only palette.
        assert.ok(!/#main-format-picker \.format-card\s*\{[^}]*#fff/.test(style), 'a light hard-coded colour on the picker');
    });
});
