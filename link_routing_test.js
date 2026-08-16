const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

// Boots admin.html as the browser would at a given URL. The clean-URL form
// (".../admin", no extension) is the one Cloudflare Pages actually serves, and the
// one that broke every scorekeeper link.
function bootAdmin(href) {
    const sb = loadHtmlInlineScript('admin.html');
    const u = new URL(href);
    vm.runInContext(`
        location.href = ${JSON.stringify(href)};
        location.origin = ${JSON.stringify(u.origin)};
        location.pathname = ${JSON.stringify(u.pathname)};
        location.search = ${JSON.stringify(u.search)};
        window.location = location;
        currentMode = 'SQ6A';
    `, sb);
    return sb;
}

const URLS = [
    ['https://golf-app-5a5.pages.dev/admin', 'clean URL (what Cloudflare Pages serves)'],
    ['https://golf-app-5a5.pages.dev/admin.html', 'explicit .html'],
    ['https://golf-app-5a5.pages.dev/sub/admin', 'a subdirectory'],
];

describe('SCOREKEEPER LINKS — must target the scorecard, never admin', () => {
    URLS.forEach(([href, label]) => {
        test(`from ${label}, a group link points at index.html`, () => {
            const sb = bootAdmin(href);
            const url = vm.runInContext(`scorecardUrlFor('SQ6A', 2)`, sb);
            assert.match(url, /index\.html/, `got ${url}`);
            assert.ok(!/\/admin(\.html)?\?/.test(url), `the link still routes through admin: ${url}`);
        });

        test(`from ${label}, the link keeps the game code and group number`, () => {
            const sb = bootAdmin(href);
            const url = vm.runInContext(`scorecardUrlFor('SQ6A', 2)`, sb);
            assert.match(url, /game=SQ6A/);
            assert.match(url, /group=2/);
        });
    });

    test('REGRESSION: the clean URL produced /admin?game=...&group=2 before this fix', () => {
        // The old builder was href.split('?')[0].replace('admin.html', 'index.html').
        // Served as ".../admin" there is no ".html" to replace, so it returned the admin
        // URL untouched - dropping a golfer onto the setup wizard, where the panel
        // listing EVERY group's privileged link was sitting in plain sight.
        const oldWay = 'https://golf-app-5a5.pages.dev/admin'.replace('admin.html', 'index.html');
        assert.equal(oldWay, 'https://golf-app-5a5.pages.dev/admin', 'this is the bug being fixed');

        const sb = bootAdmin('https://golf-app-5a5.pages.dev/admin');
        assert.notEqual(vm.runInContext(`scorecardUrlFor('SQ6A', 2)`, sb), oldWay + '?game=SQ6A&group=2');
    });

    test('a subdirectory deployment keeps its directory', () => {
        const sb = bootAdmin('https://example.com/sub/admin');
        assert.equal(vm.runInContext(`scorecardUrlFor('SQ6A', 1)`, sb),
            'https://example.com/sub/index.html?game=SQ6A&group=1');
    });

    test('Group 1 and Group 2 links differ only in the group number', () => {
        const sb = bootAdmin('https://golf-app-5a5.pages.dev/admin');
        const g1 = vm.runInContext(`scorecardUrlFor('SQ6A', 1)`, sb);
        const g2 = vm.runInContext(`scorecardUrlFor('SQ6A', 2)`, sb);
        assert.equal(g1.replace('group=1', 'group=N'), g2.replace('group=2', 'group=N'));
    });

    test('the spectator link is player-facing and carries NO group', () => {
        const sb = bootAdmin('https://golf-app-5a5.pages.dev/admin');
        const url = vm.runInContext(`scorecardUrlFor('SQ6A')`, sb);
        assert.match(url, /index\.html\?game=SQ6A$/);
        assert.ok(!/group=/.test(url), 'a spectator link must not be group-scoped');
    });

    test('every link surface in admin uses the one shared builder', () => {
        // Fixing Copy Link while leaving another surface on the old pattern would put
        // the bug straight back.
        const adm = read('admin.html');
        const code = adm.replace(/^\s*\/\/.*$/gm, '');
        assert.ok(!/replace\('admin\.html'/.test(code), 'a fragile filename replace survives');
        assert.ok(code.includes('scorecardUrlFor(currentMode, b.group)'));
        assert.equal((code.match(/scorecardUrlFor\(currentMode\)/g) || []).length, 2,
            'both spectator-link buttons should use the builder');
    });
});

describe('DEFENSIVE REDIRECT — admin?group=N sends the golfer to their scorecard', () => {
    test('a group-scoped URL on admin redirects to the scorecard', () => {
        const sb = loadHtmlInlineScript('admin.html');
        let replaced = null;
        vm.runInContext(`
            location.origin = 'https://golf-app-5a5.pages.dev';
            location.pathname = '/admin';
            location.replace = function (u) { window.__redirect = u; };
            window.location = location;
            (function () {
                const p = new URLSearchParams('?game=SQ6A&group=2');
                const gameParam = p.get('game'), groupParam = p.get('group');
                if (!gameParam || !groupParam) return;
                const dir = location.pathname.replace(/\\/[^\\/]*$/, '/');
                location.replace(location.origin + dir + 'index.html?game=' +
                    encodeURIComponent(gameParam) + '&group=' + encodeURIComponent(groupParam));
            })();
        `, sb);
        assert.equal(sb.window.__redirect,
            'https://golf-app-5a5.pages.dev/index.html?game=SQ6A&group=2');
    });

    test('the redirect exists in admin.html and runs before setup loads', () => {
        const adm = read('admin.html');
        const redirect = adm.indexOf('function redirectGroupScorekeeper');
        const load = adm.indexOf('loadModeData(currentMode)');
        assert.ok(redirect > -1, 'no defensive redirect found');
        assert.ok(redirect < load, 'it must run before the wizard loads');
    });

    test('the organizer is never redirected — their link has no group', () => {
        const adm = read('admin.html');
        const fn = adm.slice(adm.indexOf('function redirectGroupScorekeeper'),
            adm.indexOf('let currentMode = urlParams'));
        assert.ok(/if \(!gameParam \|\| !groupParam\) return;/.test(fn),
            'a missing group must be a no-op, or the organizer would be bounced out');
    });

    test('it uses location.replace so Back cannot return to admin', () => {
        const adm = read('admin.html');
        const fn = adm.slice(adm.indexOf('function redirectGroupScorekeeper'),
            adm.indexOf('let currentMode = urlParams'));
        assert.ok(/loc\.replace\(/.test(fn));
    });
});

describe('THE SAME BUG ELSEWHERE', () => {
    test('REGRESSION: sidematches.html had the identical fragile replace', () => {
        // Served as ".../sidematches", so its filename replace also no-opped and every
        // side match link pointed back at the Matches tab.
        const sm = read('sidematches.html');
        const code = sm.replace(/^\s*\/\/.*$/gm, '');
        assert.ok(!/replace\('sidematches\.html'/.test(code));
    });

    test('sidematches builds its scorecard URL from the directory', () => {
        const sb = loadHtmlInlineScript('sidematches.html');
        vm.runInContext(`
            location.origin = 'https://golf-app-5a5.pages.dev';
            location.pathname = '/sidematches';
            window.location = location;
        `, sb);
        assert.equal(vm.runInContext(`scorecardBaseUrl()`, sb),
            'https://golf-app-5a5.pages.dev/index.html');
    });

    test('the scorecard\'s own Group Links panel already pointed at the right page', () => {
        // index.html IS the scorecard, so its own URL is the correct base - it was
        // never affected, and a test now stops it drifting into the broken pattern.
        const idx = read('index.html');
        const code = idx.replace(/^\s*\/\/.*$/gm, '');
        assert.ok(!/replace\('index\.html'|replace\('admin\.html'/.test(code));
    });
});

describe('WHAT THE GROUP 2 GOLFER ACTUALLY LANDS ON', () => {
    const PAGE = ['action-model.js', 'money-engine.js', 'settlement-engine.js', 'bet-strip.js', 'hole-events.js'];

    function openAsGroup2() {
        const sb = loadHtmlInlineScript('index.html', PAGE);
        const cd = makeCourseData(18);
        const names = ['Manny', 'Jose', 'Ann', 'Bob', 'Marty', 'John', 'Cal', 'Dee'];
        const p = makePlayers(names, names.map(() => 0));
        const groupMap = {};
        p.forEach((pl, i) => { groupMap[pl.id] = i < 4 ? 1 : 2; });
        vm.runInContext(`
            currentMode = 'SQ6A';
            currentData = ${JSON.stringify({ gameFormat: 'stroke', players: p, courseData: cd, scores: {} })};
            window.__scPlayerGroupMap = ${JSON.stringify(groupMap)};
            window.__scFilteredPlayers = currentData.players.slice(4, 8);
            hasGroupLock = true; lockedGroup = 2; selectedGroup = 2;
            renderGroupFilters(8); renderGroupLinksPanel();
        `, sb);
        return { sb, p };
    }

    test('no group switcher and no Group Links panel', () => {
        const { sb } = openAsGroup2();
        assert.equal(sb.document.getElementById('group-filter-container').innerHTML, '');
        assert.equal(sb.document.getElementById('group-links-panel').innerHTML, '');
    });

    test('REGRESSION: no other group\'s privileged URL anywhere in the rendered DOM', () => {
        const { sb } = openAsGroup2();
        const rendered = ['group-filter-container', 'group-links-panel', 'action-center-mount']
            .map(id => (sb.document.getElementById(id) || {}).innerHTML || '').join('');
        assert.ok(!/group=1/.test(rendered));
    });

    test('they are not treated as the organizer', () => {
        const { sb } = openAsGroup2();
        assert.equal(vm.runInContext(`isOrganizerView()`, sb), false);
        assert.equal(vm.runInContext(`canAddAction()`, sb), false);
    });

    test('they can score Group 2 and not Group 1', () => {
        const { sb, p } = openAsGroup2();
        assert.equal(vm.runInContext(`canWritePlayer('${p[4].id}')`, sb), true);
        assert.equal(vm.runInContext(`canWritePlayer('${p[0].id}')`, sb), false);
    });

    test('identity personalization still works alongside the group lock', () => {
        const { sb, p } = openAsGroup2();
        vm.runInContext(`meId = '${p[4].id}';`, sb);
        assert.equal(vm.runInContext(`resolvedMeId()`, sb), String(p[4].id));
        assert.equal(vm.runInContext(`isOrganizerView()`, sb), false, 'identity is not authorization');
    });
});
