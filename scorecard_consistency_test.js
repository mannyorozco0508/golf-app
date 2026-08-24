const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const PAGE = ['action-model.js', 'money-engine.js', 'settlement-engine.js', 'bet-strip.js', 'hole-events.js'];

// The exact round from the bug report: 4 golfers, 2 groups, stroke play, skins, dots,
// birdie game, two 1v1 stroke side matches, one press.
function build() {
    const cd = makeCourseData(18);
    const p = makePlayers(['Marty', 'John', 'Manny', 'Jose'], [0, 0, 0, 0]);
    const scores = {};
    cd.slice(0, 7).forEach((h, i) => p.forEach((pl, pi) => {
        scores[`p${pl.id}_h${h.hole}`] = h.par + (pi === 0 && i % 2 === 0 ? -1 : pi % 2);
    }));
    const data = {
        gameFormat: 'stroke', players: p, courseData: cd, scores,
        additionalGames: {
            skins: { enabled: true, skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross' },
            dots: { enabled: true, dotPointVal: 10 }
        },
        dots: { h4: { [`p${p[2].id}`]: ['birdie', 'greenie'] } },
        birdieGameEnabled: true, birdieUnitVal: 5, birdieScoringType: 'gross',
        sideMatches: {
            mj: {
                format: 'stroke', scoring: 'gross', overallStake: 50, holeStake: 0,
                tieRule: 'push', overallMode: 'stroke', segment: 'full',
                teamAIds: [String(p[0].id)], teamBIds: [String(p[1].id)],
                overallPresses: { a: { startHole: 5, stake: 100 } }
            },
            mm: {
                format: 'stroke', scoring: 'gross', overallStake: 50, holeStake: 0,
                tieRule: 'push', overallMode: 'stroke', segment: 'full',
                teamAIds: [String(p[0].id)], teamBIds: [String(p[2].id)]
            }
        }
    };
    return { cd, p, data };
}

// Renders a real view. groupLocked=false is the organizer / All Players view; true is
// the ?group=1 scorekeeper view. Both go through the SAME render functions - that is
// the thing being asserted.
function render(groupLocked) {
    const sb = loadHtmlInlineScript('index.html', PAGE);
    const { p, data } = build();
    const gmap = {};
    p.forEach((pl, i) => { gmap[pl.id] = i < 2 ? 1 : 2; });
    vm.runInContext(`
        currentData = ${JSON.stringify(data)};
        window.__scPlayerGroupMap = ${JSON.stringify(gmap)};
        window.__scFilteredPlayers = ${groupLocked ? 'currentData.players.slice(0,2)' : 'currentData.players'};
        hasGroupLock = ${groupLocked}; lockedGroup = ${groupLocked ? 1 : 'null'};
        selectedGroup = ${groupLocked ? 1 : "'all'"};
        currentViewedHole = 7; meId = '${p[0].id}'; actionCenterOpen = true;
        // Match cards collapse by default now, so open them - this is what a golfer does
        // when he wants the press detail, and it is where the PRESS button lives.
        Object.keys(currentData.sideMatches || {}).forEach(k => expandedMatches[k] = true);
        groupGamesOpen = true;
        renderActionCenter(); renderHoleRecap(); renderGroupFilters(4); renderGroupLinksPanel();
    `, sb);
    const g = id => { const e = sb.document.getElementById(id); return e ? e.innerHTML : ''; };
    return {
        filters: g('group-filter-container'),
        links: g('group-links-panel'),
        recap: g('hole-recap-mount'),
        action: g('action-center-mount'),
        all: ['group-filter-container', 'group-links-panel', 'hole-recap-mount',
            'action-center-mount', 'bet-strip-mount'].map(g).join('')
    };
}

describe('RETIRED UI CANNOT RENDER IN ANY VIEW', () => {
    const idx = read('index.html');
    const RETIRED = [
        ['LIVE ACTION dashboard', 'live-action-box'],
        ['LIVE ACTION builder', 'buildLiveActionSummary'],
        ['LIVE ACTION renderer', 'renderLiveActionSummary'],
        ['side-match callout', 'side-match-callout'],
        ['old Skins panel', 'skins-live-container'],
        ['Skins panel renderer', 'renderSkinsLiveBox'],
        ['Birdie row in group scores', 'combined-tally-row'],
        ['Birdie row renderer', 'renderCombinedTally'],
        ['permanent 1-18 strip', 'hole-jump-nav'],
        ['1-18 strip renderer', 'renderHoleJumpNav']
    ];

    RETIRED.forEach(([label, token]) => {
        test(`${label} does not exist in the source at all`, () => {
            // Not hidden, not organizer-gated, not behind a media query - absent. A
            // component that still exists can still come back.
            assert.ok(!idx.includes(token), `${token} is still present`);
        });
    });

    test('no organizer-only branch resurrects any of them', () => {
        RETIRED.forEach(([, token]) => {
            assert.ok(!new RegExp(`isOrganizerView[^;]{0,200}${token}`).test(idx));
        });
    });

    test('neither rendered view contains them', () => {
        [render(false), render(true)].forEach(view => {
            RETIRED.forEach(([label, token]) => {
                assert.ok(!view.all.includes(token), `${label} rendered`);
            });
            assert.ok(!/LIVE ACTION/.test(view.all), 'a second dashboard appeared');
        });
    });
});

describe('ORGANIZER AND SCOREKEEPER SHARE ONE SCORECARD', () => {
    const org = render(false);
    const sk = render(true);

    test('the hole recap is byte-identical in both views', () => {
        assert.equal(org.recap, sk.recap);
    });

    test('Today\'s Action is byte-identical apart from organizer-only controls', () => {
        const strip = h => h.replace(/<button[^>]*add-action-btn[^>]*>[\s\S]*?<\/button>/g, '');
        assert.equal(strip(org.action), strip(sk.action),
            'the two views are rendering different betting UIs');
    });

    test('both views show the same section headings', () => {
        ['Group Games', 'Group Games', 'Group Games', 'My Matches'].forEach(h => {
            assert.ok(org.action.includes(h), `organizer missing ${h}`);
            assert.ok(sk.action.includes(h), `scorekeeper missing ${h}`);
        });
    });

    test('PERMISSIONS differ, not the design', () => {
        assert.ok(/ADD ACTION/.test(org.action), 'organizer should get Add Action');
        assert.ok(!/ADD ACTION/.test(sk.action), 'a scorekeeper should not');
        assert.ok(/All Players/.test(org.filters), 'organizer keeps the group selector');
        assert.equal(sk.filters, '', 'a locked scorekeeper gets no selector');
    });

    test('a scorekeeper still cannot reach any other group link', () => {
        assert.equal(sk.links, '');
        assert.ok(!/group=2/.test(sk.all));
    });
});

describe('ONE BET, ONE STATUS LOCATION', () => {
    [['organizer', false], ['scorekeeper', true]].forEach(([label, locked]) => {
        const view = render(locked);
        const count = (needle) => (view.all.match(new RegExp(needle, 'g')) || []).length;

        test(`${label}: each side match appears exactly once`, () => {
            assert.equal(count('vs John'), 1);
            assert.equal(count('vs Manny'), 1);
        });

        test(`${label}: Skins, Dots and Birdie each appear exactly once`, () => {
            assert.equal(count('Skins'), 1);
            assert.equal(count('Dots'), 1);
            assert.equal(count('Birdie Game'), 1);
        });

        test(`${label}: the press sits under its own parent match`, () => {
            assert.ok(/mc-press/.test(view.action));
            assert.ok(/Started Hole 5/.test(view.action));
            const mjAt = view.action.search(/vs John/);
            const pressAt = view.action.indexOf('mc-press');
            assert.ok(pressAt > mjAt, 'the press must follow its parent');
        });

        test(`${label}: each eligible 1v1 stroke match has its own PRESS button`, () => {
            assert.equal(count('mc-press-btn'), 2, 'two matches, two buttons');
        });
    });
});

describe('CURRENT GROUP SCORES HOLDS GOLF SCORES ONLY', () => {
    const idx = read('index.html');

    test('the ticker box carries no betting money', () => {
        const start = idx.indexOf('class="live-ticker-box"');
        const box = idx.slice(start, idx.indexOf('</div>', idx.indexOf('ticker-status-val')));
        ['birdie', 'Birdie', 'skins', 'Skins', 'combined-tally'].forEach(t =>
            assert.ok(!box.includes(t), `${t} is back in the standings box`));
    });

    test('Birdie money lives in Today\'s Action instead', () => {
        assert.ok(/Birdie Game/.test(render(false).action));
    });
});

describe('HOLE NAVIGATION', () => {
    const idx = read('index.html');

    test('the jump grid replaced the permanent strip and still works', () => {
        assert.ok(/toggleHolePicker\(\)/.test(idx));
        assert.ok(/hole-jump-open/.test(idx));
        assert.ok(/function jumpToHole/.test(idx));
        assert.ok(/function buildHolePickerHtml/.test(idx));
    });

    test('the grid wraps, so no hole can hide under a panel', () => {
        const css = idx.slice(idx.indexOf('.hole-picker {'), idx.indexOf('.hole-picker {') + 300);
        assert.ok(/flex-wrap: wrap/.test(css));
    });
});

describe('READING ORDER — scores before bets', () => {
    const idx = read('index.html');

    // BEHAVIOUR CHANGE: navigation moved up to sit directly under scoring.
    test('hole -> scores -> navigation -> recap -> action', () => {
        const recap = idx.indexOf(`html += '<div id="hole-recap-mount"></div>'`);
        const action = idx.indexOf(`html += '<div id="action-center-mount"></div>'`);
        const nav = idx.indexOf('html += navRowHtml;');
        const rows = idx.indexOf('class="hv-player-row"');
        assert.ok(rows > -1 && nav > rows, 'navigation must follow the score rows');
        assert.ok(nav < recap && recap < action, 'panels are read after scoring and Next');
        assert.equal((idx.match(/html \+= navRowHtml;/g) || []).length, 1, 'exactly one nav row');
    });

    test('score inputs keep full-size touch targets', () => {
        const css = idx.slice(idx.indexOf('.score-input {'), idx.indexOf('.score-input {') + 400);
        const m = /(width|height):\s*(\d+)px/.exec(css);
        if (m) assert.ok(parseInt(m[2], 10) >= 40, 'score boxes must stay easy to tap');
    });
});

describe('SERVICE WORKER — the actual cause of the stale iPad build', () => {
    const sw = read('sw.js');

    test('REGRESSION: the cache key is no longer the original v1', () => {
        // It never moved through this entire project. Network-first fetches fresh files
        // online, but an installed iOS PWA paints from cache first, and nothing under an
        // unchanged key is ever invalidated - so a device kept rendering markup that had
        // been deleted from the repo weeks earlier.
        assert.ok(!/CACHE_VERSION = 'golfapp-v1'/.test(sw), 'the cache key was never bumped');
        assert.ok(/CACHE_VERSION = '[^']+'/.test(sw));
    });

    test('activate deletes every older cache', () => {
        assert.ok(/keys\.filter\(\(key\) => key !== CACHE_VERSION\)/.test(sw));
        assert.ok(/caches\.delete\(key\)/.test(sw));
    });

    test('every shared engine the scorecard needs is precached', () => {
        ['money-engine.js', 'settlement-engine.js', 'action-model.js',
            'bet-strip.js', 'hole-events.js'].forEach(f =>
                assert.ok(sw.includes(f), `${f} is not precached - index.html cannot render without it`));
    });

    test('every page the scorecard links to is precached', () => {
        ['index.html', 'admin.html', 'sidematches.html', 'trip.html', 'settlement.html']
            .forEach(f => assert.ok(sw.includes(f), `${f} missing from the shell`));
    });

    test('it stays network-first, so a deploy still wins when online', () => {
        // This used to assert the literal source string
        // `.catch(() => caches.match(request))`. That pinned one specific
        // implementation rather than the rule it was protecting, and it broke
        // the moment the offline fallback grew a named function - even though
        // the behaviour it cared about was unchanged.
        //
        // Rewritten to assert the actual contract, and deliberately tightened
        // while doing so: it is no longer enough for a cache read to appear
        // somewhere in the file. Inside the fetch handler, the network attempt
        // must come FIRST, and every cache read must sit after it on the
        // failure path. That is a strictly stronger guarantee than the old
        // string match, which would have happily passed a cache-first handler
        // that merely happened to contain the expected line somewhere.
        assert.ok(/Network-first/i.test(sw));

        const handler = sw.slice(sw.indexOf("addEventListener('fetch'"));
        assert.ok(handler.length > 0, 'no fetch handler found in sw.js');

        // Anchored to respondWith, not to the first mention of fetch anywhere in
        // the handler. Anchoring on `fetch(request)` alone is not enough: a
        // cache-first handler written as `caches.match(req).then(hit => hit ||
        // fetch(request))` still contains that substring, so the scan would
        // start inside the cache-first expression and find nothing wrong. The
        // question is specifically what the FIRST thing respondWith reaches for
        // is, so that is what gets measured.
        const respondAt = handler.indexOf('event.respondWith(');
        assert.ok(respondAt !== -1, 'the fetch handler must call event.respondWith');
        const body = handler.slice(respondAt);

        const firstFetch = body.indexOf('fetch(request)');
        const firstRead = body.indexOf('caches.match(');
        assert.ok(firstFetch !== -1, 'the fetch handler must attempt the network');
        assert.ok(firstRead === -1 || firstFetch < firstRead,
            'the cache must remain a fallback, never the first choice - respondWith reaches for the cache before the network');

        const catchAt = body.indexOf('.catch(');
        assert.ok(catchAt !== -1, 'the network attempt must have a failure path');
        assert.ok(catchAt > firstFetch, 'the failure path must come after the network attempt');

        // And the network response must still be what gets returned when online.
        assert.ok(/\.then\(\(response\) =>/.test(body), 'the online path must return the live network response');
    });
});

describe('MONEY UNTOUCHED', () => {
    ['money-engine.js', 'settlement-engine.js', 'action-model.js'].forEach(f => {
        test(`${f} contains no rendering code`, () => {
            assert.ok(!/renderActionCenter|renderHoleRecap|sideRow|buildActionRows/.test(read(f)));
        });
    });
});

// ---------------------------------------------------------------------------
// PHONE FIRST
// ---------------------------------------------------------------------------
describe('PHONE FIRST — layout at real device widths', () => {
    const idx = read('index.html');
    const css = (idx.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || []).join('\n');

    // The widths that actually matter: Android 360, iPhone 390/393, iPhone Plus/Pro Max
    // 430, iPad portrait 768/820, iPad landscape 1024.
    const PHONE = [360, 375, 390, 393, 412, 430];
    const TABLET = [768, 820, 1024];

    function ruleFor(selector) {
        const m = new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`).exec(css);
        return m ? m[1] : '';
    }
    function px(body, prop) {
        const m = new RegExp(`(?<!-)${prop}:\\s*(\\d+)px`).exec(body);
        return m ? parseInt(m[1], 10) : null;
    }

    test('REGRESSION: score boxes meet the 44px touch minimum on BOTH axes', () => {
        // They were 44x40 - fine to look at, under target to hit. This is the control a
        // golfer taps most, one-handed, walking, in sunlight.
        const r = ruleFor('score-input-wrapper');
        assert.ok(px(r, 'width') >= 44, `score box width is ${px(r, 'width')}px`);
        assert.ok(px(r, 'height') >= 44, `score box height is ${px(r, 'height')}px`);
    });

    test('Prev / Next stay finger-sized and cannot be squeezed', () => {
        const r = ruleFor('hole-view-nav-btn');
        assert.ok(px(r, 'min-height') >= 44, 'nav buttons must stay tappable at 360px');
        assert.ok(/min-width:\s*0/.test(r), 'they must be allowed to shrink rather than overflow');
    });

    test('no fixed width above 360px can force horizontal page scroll', () => {
        const offenders = [];
        const re = /\.([a-z0-9-]+)\s*\{([^}]*)\}/g;
        let m;
        while ((m = re.exec(css))) {
            const name = m[1], body = m[2];
            // The Full Card grid is deliberately wide and scrolls inside its own wrapper.
            if (name === 'card-table') continue;
            const w = /(?<!max-)(?<!min-)width:\s*(\d+)px/.exec(body);
            const mw = /min-width:\s*(\d+)px/.exec(body);
            [w, mw].forEach(v => { if (v && parseInt(v[1], 10) > 360) offenders.push(`${name}:${v[1]}px`); });
        }
        assert.deepEqual(offenders.join(','), '', `these can overflow a 360px phone: ${offenders.join(', ')}`);
    });

    test('the wide Full Card grid scrolls inside its wrapper, not the page', () => {
        assert.ok(/overflow-x:\s*auto/.test(ruleFor('card-table-wrapper')));
    });

    test('long action labels truncate instead of widening the row', () => {
        const r = ruleFor('ar-name');
        assert.ok(/text-overflow:\s*ellipsis/.test(r));
        assert.ok(/min-width:\s*0/.test(r), 'a flex child needs min-width:0 to be allowed to shrink');
    });

    PHONE.forEach(w => {
        test(`${w}px: single column, no side rail`, () => {
            // The rail only exists above the one breakpoint, so every phone width is
            // guaranteed one column without needing a per-device rule.
            const m = /@media \(min-width: (\d+)px\) \{\s*\.round-body-layout \{ display: flex/.exec(css);
            assert.ok(m, 'the rail breakpoint is missing');
            assert.ok(w < parseInt(m[1], 10), `${w}px would get a side rail`);
        });
    });

    TABLET.forEach(w => {
        test(`${w}px: rail only where the scorecard stays comfortably wide`, () => {
            const m = /@media \(min-width: (\d+)px\) \{\s*\.round-body-layout \{ display: flex/.exec(css);
            const bp = parseInt(m[1], 10);
            // .status-panel is declared twice: once outside the query and once inside it.
            // The rail width lives on the one inside, so read the query block directly.
            const block = new RegExp(`@media \\(min-width: ${bp}px\\) \\{([\\s\\S]*?)\\n        \\}`).exec(css)[1];
            const railWidth = parseInt(/flex:\s*0 0 (\d+)px/.exec(block)[1], 10);
            if (w >= bp) {
                const remaining = w - Number(railWidth) - 18;
                assert.ok(remaining >= 600,
                    `at ${w}px the scorecard would only get ${remaining}px`);
            } else {
                assert.ok(true, 'stacks, which is the correct fallback');
            }
        });
    });

    test('there is ONE layout breakpoint, not a pile of one-off queries', () => {
        const layoutQueries = (css.match(/@media \((?:min|max)-width/g) || []).length;
        assert.ok(layoutQueries <= 2, `${layoutQueries} width-based media queries - consolidate`);
    });

    test('print and reduced-motion rules survived the cleanup', () => {
        assert.ok(/@media print/.test(css));
        assert.ok(/prefers-reduced-motion/.test(css));
    });
});

describe('PHONE FIRST — the press flow fits a narrow viewport', () => {
    const idx = read('index.html');
    const css = (idx.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || []).join('\n');

    test('press amount buttons wrap rather than overflow', () => {
        const row = /\.pp-amount-row\s*\{([^}]*)\}/.exec(css)[1];
        assert.ok(/flex-wrap:\s*wrap/.test(row));
    });

    test('press buttons stay finger-sized', () => {
        const btn = /\.pp-amount-btn\s*\{([^}]*)\}/.exec(css)[1];
        const h = /min-height:\s*(\d+)px/.exec(btn);
        assert.ok(h && parseInt(h[1], 10) >= 44);
    });

    test('the Add Action sheet uses a 3-up grid that fits 360px', () => {
        const row = /\.aa-amount-row\s*\{([^}]*)\}/.exec(css)[1];
        assert.ok(/repeat\(3, 1fr\)/.test(row), 'fixed columns would overflow');
    });

    test('REGRESSION: no blocking dialogs anywhere in the press flow', () => {
        const code = idx.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
        assert.ok(!/\bprompt\(/.test(code), 'prompt() fails silently in an installed PWA');
        const press = code.slice(code.indexOf('function confirmSidePress'), code.indexOf('function toggleActionCenter'));
        assert.ok(!/\bconfirm\(/.test(press));
    });

    test('the hole jump grid wraps to fit any phone', () => {
        const picker = /\.hole-picker\s*\{([^}]*)\}/.exec(css)[1];
        assert.ok(/flex-wrap:\s*wrap/.test(picker));
        const btn = /\.hole-pick-btn\s*\{([^}]*)\}/.exec(css)[1];
        const w = parseInt(/width:\s*(\d+)px/.exec(btn)[1], 10);
        // 6 per row at 360px minus padding, with gaps.
        assert.ok(w * 6 + 5 * 6 < 340, `${w}px buttons will not fit six across a 360px phone`);
    });
});
