// ============================================================================
// THE FORMAT GALLERY — SQUARE TILES, AND A PAGE THAT STARTS BELOW THE CLOCK
//
// Two corrections that both came off one real-iPhone walkthrough.
//
// 1. LAYOUT. The first cut was full-width rows. They worked, and they read as a
//    settings form: nine stacked rectangles to scroll past before Ryder Cup. The
//    gallery is now two columns of near-square tiles that borrow the Road Trip /
//    Game Day home-widget language, with Ryder Cup full width beneath. The copy
//    had to shrink to menu labels for that to fit - the tiles are a menu, not a
//    rules explanation.
//
// 2. SAFE AREA. The screenshot showed the wizard header under the iPhone clock.
//    The audit found the real cause: this app had NO safe-area handling anywhere -
//    no env(safe-area-inset-*), no viewport-fit - while Capacitor lays the web
//    view out edge to edge on iOS. Never a format-screen bug. Every Consumer page
//    in the native bundle had it, and every one is fixed here.
//
// NEITHER TOUCHES BEHAVIOUR. No workflow, no format value, no routing, no engine.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ADMIN = read('admin.html');
const DEPS = ['money-engine.js', 'action-model.js', 'settlement-engine.js', 'pool-engine.js', 'score-marks.js'];

const STANDARD = ['stroke', 'stableford', 'nassau-modern', 'bestball',
    'scramble', 'hilo', 'wolf', 'ryder'];
const ALL = STANDARD.concat(['ryder-cup']);

// Every page Capacitor actually ships. Taken from sync-mobile-web.js CONSUMER_SHELL
// so a page added to the bundle later cannot quietly skip the safe area.
const NATIVE_PAGES = ['admin.html', 'index.html', 'leaderboard.html', 'settlement.html',
    'sidematches.html', 'skins.html', 'stats.html', 'trip.html',
    'instructions.html', 'shared.html'];

function wizard(format) {
    const sb = loadHtmlInlineScript('admin.html', DEPS);
    vm.runInContext(`
        alert = function(){};
        collectWizardPlayers = function(){ return []; };
        renderPlayerList = function(){};
        renderStackedGames = function(){};
        loadAdditionalGames = function(){};
        updateBetExplainers = function(){};
        document.getElementById('game-format-select').value = '${format}';
    `, sb);
    return sb;
}
const run = (sb, expr) => vm.runInContext(expr, sb);

const cssBlock = (sel) => {
    const i = ADMIN.indexOf(sel + ' {');
    assert.notEqual(i, -1, 'missing rule: ' + sel);
    return ADMIN.slice(i, ADMIN.indexOf('}', i));
};

// ============================================================================
describe('TWO COLUMNS OF TILES, NOT A LIST', () => {

    test('the gallery is a two-column grid', () => {
        assert.match(cssBlock('.fmt-grid'), /grid-template-columns: 1fr 1fr/);
    });

    test('a tile is centered and composed like a home widget, not a row', () => {
        const css = cssBlock('.fmt-card');
        assert.match(css, /text-align: center/);
        assert.match(css, /flex-direction: column/);
        assert.ok(!/text-align: left/.test(css), 'a list row is left-aligned; a tile is not');
    });

    test('and it is near square rather than short and wide', () => {
        // At 360px - the narrowest phone supported - a column is
        // (360 - 24 body - 40 container - 10 gap) / 2 = 143px.
        const col360 = (360 - 24 - 40 - 10) / 2;
        const h = Number(cssBlock('.fmt-card').match(/min-height: (\d+)px/)[1]);
        assert.ok(h >= col360 * 0.85 && h <= col360 * 1.15,
            `tile ${h}px against a ${col360}px column is not near square`);
    });

    test('it borrows the home-widget language rather than inventing one', () => {
        const home = cssBlock('.home-widget');
        const tile = cssBlock('.fmt-card');
        [/border: 2px solid var\(--border-mid\)/, /border-radius: 12px/,
            /background: var\(--bg-card\)/, /text-align: center/,
            /flex-direction: column/, /justify-content: center/]
            .forEach((re) => {
                assert.match(home, re, 'home widget baseline moved: ' + re);
                assert.match(tile, re, 'tile diverged from the home widgets: ' + re);
            });
    });

    test('selected reads the same way it does on the home screen', () => {
        assert.match(cssBlock('.home-widget.active'), /border-color: var\(--brand-green\)/);
        assert.match(cssBlock('.fmt-card.selected'), /border-color: var\(--brand-green\)/);
        assert.match(cssBlock('.fmt-card.selected'), /background: var\(--nassau-box-bg\)/);
    });

    test('the category headings are gone', () => {
        assert.ok(!ADMIN.includes('fmt-group-head'), 'the separators added rows, not meaning');
        ['Everyone plays their own ball', 'Player vs player', 'Team formats',
            'Multi-session competition'].forEach((h) => {
            assert.ok(!ADMIN.includes('>' + h + '<'), 'heading still rendered: ' + h);
        });
    });
});

// ============================================================================
describe('RYDER CUP IS THE FEATURED TILE', () => {

    test('it spans the row', () => {
        assert.match(cssBlock('.fmt-card-featured'), /grid-column: 1 \/ -1/);
    });

    test('and stands taller than a standard tile', () => {
        const std = Number(cssBlock('.fmt-card').match(/min-height: (\d+)px/)[1]);
        const feat = Number(cssBlock('.fmt-card-featured').match(/min-height: (\d+)px/)[1]);
        assert.ok(feat > std, 'the competition mode should not be the same size as a format');
    });

    test('only Ryder Cup is featured', () => {
        assert.equal((ADMIN.match(/class="fmt-card fmt-card-featured"/g) || []).length, 1);
        assert.match(ADMIN, /class="fmt-card fmt-card-featured" id="fmt-card-ryder-cup"/);
    });

    test('it carries the session line the standard tiles do not', () => {
        assert.equal((ADMIN.match(/<span class="fmt-sub">/g) || []).length, 1);
        assert.match(ADMIN, /Foursomes \u00b7 Four-Ball \u00b7 Singles/);
    });

    test('the eight standard formats are plain tiles', () => {
        STANDARD.forEach((f) => {
            const i = ADMIN.indexOf('id="fmt-card-' + f + '"');
            const openTag = ADMIN.lastIndexOf('<button', i);
            assert.ok(!ADMIN.slice(openTag, i).includes('fmt-card-featured'), f + ' must not be featured');
        });
    });
});

// ============================================================================
describe('TILE COPY IS A MENU, NOT A RULEBOOK', () => {

    const descs = () => (ADMIN.match(/<span class="fmt-desc">([^<]*)<\/span>/g) || [])
        .map((m) => m.replace(/<[^>]+>/g, '').trim());

    test('every tile has exactly one short helper line', () => {
        const d = descs();
        assert.equal(d.length, ALL.length, 'one description per tile, on one line each');
        d.forEach((t) => assert.ok(t.length <= 34, 'too long for a tile: "' + t + '"'));
    });

    test('no description wraps onto a second source line any more', () => {
        // The old copy ran to two and three lines of prose. If one comes back the
        // regex above stops matching it, so this pins the shape explicitly.
        assert.ok(!/<span class="fmt-desc">[^<]*\n/.test(ADMIN),
            'a multi-line description is a rules explanation, not a menu label');
    });

    test('the names are short enough for a 143px column', () => {
        const names = (ADMIN.match(/<span class="fmt-name">([^<]*)<\/span>/g) || [])
            .map((m) => m.replace(/<[^>]+>/g, '').trim());
        assert.equal(names.length, ALL.length);
        names.forEach((n) => assert.ok(n.length <= 12, 'name too long for a tile: "' + n + '"'));
        assert.ok(names.includes('Stroke Play'), 'the parenthetical long name is gone');
        // The hidden <select> keeps its own long option text so a round saved before
        // the tiles existed still selects its format. What must not come back is the
        // long name ON A TILE.
        const grid = ADMIN.slice(ADMIN.indexOf('id="format-card-grid"'),
            ADMIN.indexOf('<select id="game-format-select"'));
        assert.ok(!grid.includes('Individual (Stroke Play)'));
    });

    test('the tiles still say which Ryder is which', () => {
        assert.ok(descs().includes('Team vs. team, one bet'));
        assert.ok(descs().includes('Classic team competition'));
    });
});

// ============================================================================
describe('NOTHING ABOUT BEHAVIOUR MOVED', () => {

    test('every format value and its routing survive the restyle', () => {
        ALL.forEach((f) => {
            assert.equal(ADMIN.split('data-format="' + f + '"').length - 1, 1, f);
            assert.equal(ADMIN.split("selectFormatCard('" + f + "')").length - 1, 1, f);
        });
        const found = (ADMIN.match(/data-format="([^"]+)"/g) || []).map((m) => m.slice(13, -1));
        assert.deepEqual(found.slice().sort(), ALL.slice().sort());
    });

    test('Team Match is still the legacy money format', () => {
        const sb = wizard('stroke');
        run(sb, "selectFormatCard('ryder');");
        assert.equal(run(sb, "document.getElementById('game-format-select').value"), 'ryder');
        assert.equal(run(sb, "normalizeGameFormatForSave('ryder')"), 'ryder');
    });

    test('Ryder Cup is still the new Cup action', () => {
        const sb = wizard('stroke');
        run(sb, "selectFormatCard('ryder-cup');");
        assert.equal(run(sb, "document.getElementById('game-format-select').value"), 'ryder-cup');
        assert.equal(run(sb, "normalizeGameFormatForSave('ryder-cup')"), 'stroke');
    });

    test('tapping a tile still selects and advances in one tap', () => {
        const sb = wizard('stroke');
        run(sb, 'goToWizardStep(wizardFirstStep());');
        assert.equal(run(sb, 'currentWizardStep'), 3);
        run(sb, "selectFormatCard('hilo');");
        assert.equal(run(sb, "document.getElementById('game-format-select').value"), 'hilo');
        assert.equal(run(sb, 'currentWizardStep'), 1);
    });

    test('exactly one tile is selected at a time', () => {
        const sb = wizard('stroke');
        run(sb, "selectFormatCard('scramble');");
        const on = ALL.filter((f) =>
            run(sb, `document.getElementById('fmt-card-${f}').getAttribute('aria-checked')`) === 'true');
        assert.deepEqual(on, ['scramble']);
        run(sb, "selectFormatCard('wolf');");
        const on2 = ALL.filter((f) =>
            run(sb, `document.getElementById('fmt-card-${f}').getAttribute('aria-checked')`) === 'true');
        assert.deepEqual(on2, ['wolf']);
    });
});

// ============================================================================
describe('THE GALLERY FITS 360, 390 AND 430', () => {

    // Widths the grid actually has to survive. body padding 12px each side,
    // .container padding 20px each side, 10px gap between the two columns.
    const column = (vw) => (vw - 24 - 40 - 10) / 2;

    [360, 390, 430].forEach((vw) => {
        test(`a column at ${vw}px is wide enough for the longest label`, () => {
            const col = column(vw);
            assert.ok(col >= 140, `${vw}px gives only ${col}px per column`);
            // ~6.5px per character at 0.92rem bold is the practical fit for a name;
            // the longest is "Stroke Play" and "Best Ball" at 11 and 9.
            const longest = Math.max(...(ADMIN.match(/<span class="fmt-name">([^<]*)<\/span>/g) || [])
                .map((m) => m.replace(/<[^>]+>/g, '').trim().length));
            assert.ok(longest * 6.5 <= col - 16, `longest name needs ${longest * 6.5}px in ${col - 16}px`);
        });
    });

    test('the tiles are sized by the grid, never by fixed pixels', () => {
        const css = cssBlock('.fmt-card');
        assert.match(css, /width: 100%/);
        assert.match(css, /max-width: 100%/);
        assert.match(css, /box-sizing: border-box/);
        assert.ok(!/min-width/.test(css));
        assert.ok(!/width: \d+px/.test(css));
    });

    test('long words break rather than widening a column', () => {
        assert.match(cssBlock('.fmt-name'), /overflow-wrap: anywhere/);
        assert.match(cssBlock('.fmt-desc'), /overflow-wrap: anywhere/);
    });

    test('the grid itself cannot scroll sideways', () => {
        const css = cssBlock('.fmt-grid');
        assert.ok(!/overflow-x/.test(css));
        assert.ok(!/min-width/.test(css));
    });
});

// ============================================================================
describe('EVERY NATIVE PAGE STARTS BELOW THE STATUS BAR', () => {

    test('the bundle list this suite guards is still the shipped one', () => {
        const sync = read('sync-mobile-web.js');
        NATIVE_PAGES.forEach((p) => assert.ok(sync.includes("'" + p + "'"), p + ' left the bundle'));
    });

    test('viewport-fit=cover is declared — env() reports 0 without it', () => {
        NATIVE_PAGES.forEach((p) => {
            assert.match(read(p), /<meta name="viewport"[^>]*viewport-fit=cover/, p);
        });
    });

    test('and the root is inset by the real top safe area', () => {
        NATIVE_PAGES.forEach((p) => {
            const src = read(p);
            assert.match(src, /html \{[^}]*padding-top: env\(safe-area-inset-top, 0px\)/, p);
            assert.match(src, /html \{[^}]*padding-bottom: env\(safe-area-inset-bottom, 0px\)/, p);
            assert.match(src, /html \{[^}]*padding-left: env\(safe-area-inset-left, 0px\)/, p);
            assert.match(src, /html \{[^}]*padding-right: env\(safe-area-inset-right, 0px\)/, p);
            assert.match(src, /html \{[^}]*box-sizing: border-box/, p);
        });
    });

    test('the inset is added to each page, never a hardcoded number', () => {
        NATIVE_PAGES.forEach((p) => {
            const src = read(p);
            const rule = src.slice(src.indexOf('html {'), src.indexOf('}', src.indexOf('html {')));
            assert.ok(!/padding-top: \d+px/.test(rule), p + ': a fixed inset fits exactly one phone');
            assert.ok(!/44px|47px|48px|54px|59px/.test(rule), p + ': status-bar height hardcoded');
        });
    });

    test('left and right insets use border-box, so landscape cannot overflow', () => {
        NATIVE_PAGES.forEach((p) => {
            const src = read(p);
            const i = src.indexOf('html {');
            assert.ok(src.slice(i, src.indexOf('}', i)).includes('box-sizing: border-box'), p);
        });
    });

    test('the header is inset, not hidden', () => {
        // The fix must never have been "move the header out of the way".
        assert.match(ADMIN, /id="wiz-n-format"/);
        assert.match(ADMIN, /What Are We Playing\?/);
        assert.ok(!/\.wizard-step-title \{[^}]*display: none/.test(ADMIN));
    });

    test('fixed overlays get their own guard, because fixed ignores root padding', () => {
        [['admin.html', '.modal-overlay', 20], ['index.html', '.modal-overlay', 12],
            ['sidematches.html', '.modal-overlay', 12], ['trip.html', '.recap-overlay', 10]]
            .forEach(([p, sel, floor]) => {
                const src = read(p);
                const re = new RegExp(sel.replace('.', '\\.')
                    + ' \\{\\s*padding-top: max\\(' + floor + 'px, env\\(safe-area-inset-top, 0px\\)\\)');
                assert.match(src, re, p + ' ' + sel);
            });
    });

    test('a page with no inset is unchanged — every value falls back to 0px', () => {
        NATIVE_PAGES.forEach((p) => {
            const src = read(p);
            const envs = src.match(/env\(safe-area-inset-[a-z]+\)/g) || [];
            assert.equal(envs.length, 0, p + ': every env() needs an explicit 0px fallback');
        });
    });
});
