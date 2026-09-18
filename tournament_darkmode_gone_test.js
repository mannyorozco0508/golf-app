// ============================================================================
// DARK MODE IS GONE FROM THE TOURNAMENT PRODUCT (Option B, 2026-09-18).
//
// WHY. Both tournament pages read and wrote the SAME localStorage key the nine
// Consumer pages use - 'golfapp-theme' - on the same origin. Hiding the toggle
// would have left every golfer who set dark on the round app looking at dark
// tournament pages with no control to change them: worse than today. So the
// FEATURE goes - the buttons, toggleTheme(), the load-time read, the relabel,
// the html.dark-mode palettes, the two leader-row overrides, the two toggle
// rules - and the palette stays: :root and every var() are the page's only
// colours, not theming decoration.
//
// THE KEY IS NEVER TOUCHED. No read, no write, no remove. Consumer is mid-
// review and a tournament page that deleted the key would flip a golfer's
// Consumer setting on the same device. A test here pins that neither page so
// much as MENTIONS the key, and that admin.html still does - the boundary.
//
// SAME WAVE, NOT A DARK-MODE REGRESSION: --warn-text, --warn-bg and
// --warn-border were used on tournament.html and defined nowhere on it, in
// BOTH themes, since before this wave (the net-refused warning inherited its
// parent's colour; the paste-flagged block had no background or border). They
// now carry the Consumer values (admin.html / trip.html). --card-bg at the
// paste-players modal was a typo for --bg-card - the one use is corrected and
// nothing is aliased.
//
// HARNESS. helpers/mini-dom.js: the html element's classList is real; the
// opt-in localStorage (seedStorage) is installed before the page runs, so a
// load-time read WOULD see 'dark' - that is the control that proves the read
// is gone. Rects are Chrome's job: tools/tournament-landing-check.js.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const PAGES = ['tournament.html', 'tournament-scorecard.html'];
const styleOf = (src) => src.slice(src.indexOf('<style>'), src.indexOf('</style>'));
const rootOf = (src) => { const s = styleOf(src); const a = s.indexOf(':root'); const b = s.indexOf('}', a); return s.slice(a, b); };
const WARN = { '--warn-bg': '#fff4e5', '--warn-border': '#e08a00', '--warn-text': '#7a4a00' };

PAGES.forEach((PAGE) => {
    describe(`${PAGE}: the feature is gone, the palette stays`, () => {
        const SRC = read(PAGE);

        test('POSITIVE: :root still defines the palette and the page still draws with it', () => {
            const root = rootOf(SRC);
            assert.match(root, /--brand-green:\s*#0f4c3a/);
            assert.match(root, /--bg-card:\s*#ffffff/);
            assert.ok((SRC.match(/var\(--brand-green\)/g) || []).length >= 10, 'var(--brand-green) is used all over the page');
        });

        test('no html.dark-mode rule, no leader-row dark override, no toggle rule', () => {
            assert.doesNotMatch(SRC, /html\.dark-mode/, 'a dark palette or override is back');
            assert.doesNotMatch(SRC, /\.theme-toggle-btn/, 'a toggle rule is back');
            assert.doesNotMatch(SRC, /#2b2712/, 'the leader row\'s dark amber is back');
        });

        test('no toggle button, no toggleTheme, no "Dark Mode" / "Light Mode" label', () => {
            assert.doesNotMatch(SRC, /theme-toggle-btn|toggleTheme|Dark Mode|Light Mode/);
        });

        test('the page never mentions golfapp-theme - no read, no write, no remove, not even a comment', () => {
            assert.doesNotMatch(SRC, /golfapp-theme/);
            // The page's own keys (lastTournamentCode) are its business; what it
            // must never do is clear storage wholesale, which would take the
            // Consumer key with it.
            assert.doesNotMatch(SRC, /localStorage\.(removeItem|clear)\(/, 'nothing on this page removes browser storage');
        });

        test('a device holding golfapp-theme = dark arrives LIGHT, and the key is left exactly as it was', () => {
            const sb = loadHtmlInlineScript(PAGE, [], { localStorage: true, seedStorage: { 'golfapp-theme': 'dark' } });
            assert.ok(!sb.document.documentElement.classList.contains('dark-mode'), 'the load-time read is back');
            assert.equal(sb.localStorage.getItem('golfapp-theme'), 'dark', 'the key must be untouched');
            assert.equal(typeof sb.toggleTheme, 'undefined');
        });
    });
});

describe('THE BOUNDARY: Consumer keeps its dark mode and its key', () => {
    test('admin.html still reads and writes golfapp-theme and still has html.dark-mode', () => {
        const a = read('admin.html');
        assert.match(a, /localStorage\.(get|set)Item\('golfapp-theme'/);
        assert.match(a, /html\.dark-mode\s*\{/);
    });
});

describe('THE UNDEFINED VARIABLES, DEFINED (tournament.html only - the scorecard never used them)', () => {
    const SRC = read('tournament.html');
    const root = rootOf(SRC);

    test('--warn-bg, --warn-border, --warn-text are in :root with the Consumer values', () => {
        Object.entries(WARN).forEach(([k, v]) => {
            assert.match(root, new RegExp(k.replace(/-/g, '\\-') + ':\\s*' + v + ';'), k + ' must be ' + v);
            assert.match(read('admin.html'), new RegExp(k.replace(/-/g, '\\-') + ':\\s*' + v + ';'), 'the Consumer value drifted from ' + v);
        });
    });

    test('the three sites still use them: the net warning, the multi-round net line, the paste-flagged block', () => {
        assert.match(SRC, /id="ind-net-warning"[^>]*color:var\(--warn-text\)/);
        assert.match(SRC, /netWasRefused\(r\)[^\n]*color:var\(--warn-text\)/);
        assert.match(SRC, /paste-flagged-line[^\n]*background:var\(--warn-bg\); border:1px solid var\(--warn-border\)[^\n]*color:var\(--warn-text\)/);
    });

    test('--card-bg is gone: the paste-players modal card uses --bg-card, and nothing aliases it', () => {
        assert.doesNotMatch(SRC, /--card-bg/, 'the typo is back, or it was aliased');
        assert.match(SRC, /id="paste-players-modal"[\s\S]{0,200}background:var\(--bg-card\)/);
    });

    test('every var() the page uses is defined in :root', () => {
        const used = new Set([...SRC.matchAll(/var\((--[a-z-]+)\)/g)].map((m) => m[1]));
        const defined = new Set([...root.matchAll(/(--[a-z-]+):/g)].map((m) => m[1]));
        const missing = [...used].filter((v) => !defined.has(v));
        assert.deepEqual(missing, [], 'used but never defined');
    });
});

describe('THE CACHES MOVED', () => {
    test('build-shell tournament-v44 and sw.js v169 - both pages are in sw.js SHELL_FILES', () => {
        assert.match(read('build-shell.js'), /cacheName: 'tournament-v44-no-dark-mode'/);
        assert.match(read('sw.js'), /const CACHE_VERSION = 'golfapp-v169-tournament-light';/);
        assert.match(read('sw.js'), /'\.\/tournament\.html',\s*\n\s*'\.\/tournament-scorecard\.html'/);
    });
    test('HANDOFF says the variables were undefined in both themes before this wave', () => {
        const h = read('HANDOFF.md');
        const at = h.indexOf('## Dark mode is gone from the Tournament product');
        assert.ok(at > 0, 'no section');
        const s = h.slice(at, at + 5000);
        assert.match(s, /golfapp-theme/);
        assert.match(s, /not a dark-mode regression/i);
        assert.match(s, /both themes/i);
    });
});
