// ============================================================================
// tfweb-2 (Manny, Oct 26): NON-SITE FILES ANSWER 404 ON THE PUBLIC SITE.
//
// The Pages project serves the repo root, so /tools/..., /package.json,
// /CLAUDE.md, every *_test.js ... were public (measured live: 200). Now
// functions/_middleware.js answers 404 for them, and _routes.json runs
// Functions ONLY on "/", "/api/*" and those paths - every real page and asset
// is served as static, exactly as before.
//
// Pinned here, both ways:
//   ALLOWED - every page, every sw.js precache file, every product shell file
//     (sync-mobile-web.js), both manifests and their icons, every assets/ file
//     and /api/* are NEVER blocked.
//   BLOCKED - tools/, helpers/, ios/, android/, functions/ ... and the root
//     tests, fixtures, rules JSON, notes and build files ARE blocked, and
//     _routes.json actually sends each of them to the Function (a pattern the
//     Function knows but the routes file misses would still be served).
// ============================================================================
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const { REPO_ROOT } = require('./helpers/load-script.js');

let M = null;
before(async () => { M = await import(pathToFileURL(path.join(REPO_ROOT, 'functions', '_middleware.js')).href); });

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const tracked = execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const ROUTES = JSON.parse(read('_routes.json'));

// Pages _routes.json matching: '*' matches anything, slashes included.
const routeMatch = (rule, p) => new RegExp('^' + rule.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(p);
const routed = (p) => ROUTES.include.some((r) => routeMatch(r, p)) && !ROUTES.exclude.some((r) => routeMatch(r, p));

function swPrecache() {
    const m = /const SHELL_FILES = \[([\s\S]*?)\];/.exec(read('sw.js'));
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => '/' + x[1].replace(/^\.\//, ''));
}
function shell(name) {
    const m = new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];').exec(read('sync-mobile-web.js'));
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => '/' + x[1]);
}
const PAGES = ['/', '/index.html', '/game.html', '/admin.html', '/admin', '/leaderboard.html', '/settlement.html',
    '/shared.html', '/trip.html', '/season.html', '/stats.html', '/skins.html', '/sidematches.html', '/tournament.html',
    '/tournament', '/tournament-scorecard.html', '/privacy.html', '/terms.html', '/support.html', '/delete-account.html',
    '/instructions.html', '/manifest.json', '/tournament-manifest.json', '/sw.js', '/favicon-32.png', '/hardpan-icon.svg',
    '/hardpan-lockup-light.png', '/hardpan-print-mark.png', '/logo-mark.png', '/qrcode.min.js',
    '/firebase-app-compat.js', '/firebase-auth-compat.js', '/firebase-database-compat.js'];
function allowedList() {
    const icons = [];
    for (const mf of ['manifest.json', 'tournament-manifest.json']) {
        for (const ic of (JSON.parse(read(mf)).icons || [])) icons.push('/' + ic.src.replace(/^\.?\//, ''));
    }
    const assets = tracked.filter((f) => f.startsWith('assets/')).map((f) => '/' + f);
    const shells = shell('SHARED_SHELL').concat(shell('CONSUMER_SHELL'), shell('TOURNAMENT_SHELL'));
    return [...new Set(PAGES.concat(swPrecache(), shells, icons, assets))];
}
const BLOCKED = ['/tools/my-rounds-backfill.js', '/tools/lib/journey.js', '/tools', '/tools/', '/helpers/load-script.js',
    '/ios/App/App/Info.plist', '/android/build.gradle', '/functions/api/_scan.js', '/functions/index.js',
    '/functions/_middleware.js', '/docs/x.md', '/gps-beta/x.js', '/firebase-functions/index.js', '/scripts/x.sh',
    '/node_modules/targaryen/package.json', '/.github/workflows/x.yml', '/package.json', '/package-lock.json',
    '/firebase.json', '/build-shell.js', '/sync-mobile-web.js', '/global_courses_snapshot.json', '/capacitor.config.ts',
    '/.gitignore', '/CLAUDE.md', '/HANDOFF.md', '/database.rules.json', '/database.rules.stage1.json',
    '/money_engine_test.js', '/round-ready.test.js', '/unstarted_round.fixture.json', '/security-rules.tests-data.json',
    '/x.mjs', '/x.swift', '/%74ools/api-404-check.js', '//tools/api-404-check.js', '/tool%73/lib/journey.js'];

describe('tfweb-2 site block: what the site needs is never blocked', () => {
    test('every page, sw.js precache file, product shell file, manifest icon and assets/ file is allowed', () => {
        const allow = allowedList();
        assert.ok(allow.length >= 100, 'only ' + allow.length + ' allowed paths collected');
        const hit = allow.filter((p) => M.isBlockedPath(p));
        assert.deepEqual(hit, []);
    });
    test('every sw.js precache file and every shell file exists in the repo (so it is really served)', () => {
        const missing = swPrecache().concat(shell('SHARED_SHELL'), shell('CONSUMER_SHELL'), shell('TOURNAMENT_SHELL'))
            .filter((p) => p !== '/' && !fs.existsSync(path.join(REPO_ROOT, p)));
        assert.deepEqual(missing, []);
    });
    test('/api/* is never blocked, and the middleware passes it (and every allowed page) to next()', async () => {
        for (const p of ['/api/scan-erase', '/api/scorecard-scan', '/api/course-search', '/api/course/abc', '/api/push-send', '/']) {
            assert.equal(M.isBlockedPath(p), false, p);
            let nexted = false;
            const r = await M.onRequest({ request: new Request('https://hardpangolf.com' + p), next: () => { nexted = true; return new Response('ok'); } });
            assert.equal(nexted, true, p);
            assert.equal(r.status, 200);
        }
    });
    test('every tracked root site file (html/js/png/svg/manifests) outside the block rules stays allowed', () => {
        const root = tracked.filter((f) => !f.includes('/') && /\.(html|js|png|svg|json)$/.test(f));
        const site = root.filter((f) => !/(_test\.js|\.test\.js|\.fixture\.json|\.tests-data\.json)$/.test(f)
            && !/^database\.rules/.test(f) && !M.BLOCKED_FILES.includes(f));
        assert.ok(site.length > 60, site.length + ' site files');
        assert.deepEqual(site.filter((f) => M.isBlockedPath('/' + f)), []);
    });
});

describe('tfweb-2 site block: the non-site files answer 404', () => {
    test('every listed non-site path is blocked and answers 404 (no-store, noindex), never next()', async () => {
        for (const p of BLOCKED) {
            assert.equal(M.isBlockedPath(p), true, p);
            let nexted = false;
            const r = await M.onRequest({ request: new Request('https://hardpangolf.com' + p), next: () => { nexted = true; return new Response('leak'); } });
            assert.equal(nexted, false, p);
            assert.equal(r.status, 404, p);
            assert.equal(r.headers.get('Cache-Control'), 'no-store');
            assert.equal(r.headers.get('X-Robots-Tag'), 'noindex');
        }
    });
    test('every tracked file under tools/ helpers/ ios/ android/ functions/, and every root test/fixture/rules/notes file, is blocked AND routed', () => {
        const nonSite = tracked.filter((f) => /^(tools|helpers|ios|android|functions)\//.test(f)
            || (!f.includes('/') && /(_test\.js|\.test\.js|\.fixture\.json|\.tests-data\.json|\.md|\.mjs|\.ts)$/.test(f))
            || /^database\.rules.*\.json$/.test(f)
            || ['package.json', 'package-lock.json', 'firebase.json', 'build-shell.js', 'sync-mobile-web.js', 'global_courses_snapshot.json', '.gitignore'].includes(f));
        assert.ok(nonSite.length > 500, nonSite.length + ' non-site files');
        assert.deepEqual(nonSite.filter((f) => !M.isBlockedPath('/' + f)), [], 'blocked by the Function');
        assert.deepEqual(nonSite.filter((f) => !routed('/' + f)), [], 'sent to the Function by _routes.json');
    });
    test('the encoded / double-slash spellings are routed to the Function too', () => {
        for (const p of ['/%74ools/api-404-check.js', '//tools/api-404-check.js', '/tool%73/lib/journey.js']) assert.ok(routed(p), p);
    });
});

describe('tfweb-2 _routes.json', () => {
    test('version 1, within the 100-rule limit, keeps "/" and "/api/*" (functions/index.js and the API)', () => {
        assert.equal(ROUTES.version, 1);
        assert.ok(ROUTES.include.length + ROUTES.exclude.length <= 100);
        assert.ok(ROUTES.include.includes('/'));
        assert.ok(ROUTES.include.includes('/api/*'));
        assert.ok(ROUTES.include.every((r) => r.length <= 100 && r.startsWith('/')));
        assert.deepEqual(Object.keys(ROUTES).sort(), ['exclude', 'include', 'version']);
    });
    test('every BLOCKED_DIR and BLOCKED_FILE has its route', () => {
        for (const d of M.BLOCKED_DIRS) { assert.ok(ROUTES.include.includes('/' + d), d); assert.ok(ROUTES.include.includes('/' + d + '/*'), d + '/*'); }
        for (const f of M.BLOCKED_FILES) assert.ok(routed('/' + f), f);
    });
    test('every function file is still reachable: its route is "/" or under "/api/"', () => {
        const fnFiles = tracked.filter((f) => f.startsWith('functions/') && !/\/_[^/]*$/.test(f));
        for (const f of fnFiles) {
            const route = f === 'functions/index.js' ? '/' : '/' + f.replace(/^functions\//, '').replace(/\.js$/, '');
            assert.ok(route === '/' || route.startsWith('/api/'), f + ' -> ' + route);
            assert.ok(routed(route.replace(/\[\[?[^\]]+\]\]?/g, 'x')), route);
        }
    });
    test('NEGATIVE CONTROL: the site pages are NOT routed to a Function (served static, as before)', () => {
        const pages = PAGES.filter((p) => p !== '/');
        assert.deepEqual(pages.filter(routed), []);
        assert.deepEqual(swPrecache().filter((p) => p !== '/' && routed(p)), []);
    });
});
