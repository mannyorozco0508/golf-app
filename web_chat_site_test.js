// ============================================================================
// WEB CHAT REACHES THE SITE AND NOTHING ELSE DOES (ADVISOR-1727). No browser.
//   1 every file this branch adds is either the one new site file (round-chat.js) or answers 404 (functions/_middleware.js);
//     package.json and CLAUDE.md stay 404
//   2 the pages load the chat in web mode, once; no app-only script, marker or Capacitor call reached the site
//   3 the service worker: precached once, version moved with its "Moved to" line, the shell list carries it
//   4 the money files are byte-for-byte origin/main 0d91206d
// ============================================================================
'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
let M = null;
before(async () => { M = await import(pathToFileURL(path.join(__dirname, 'functions', '_middleware.js')).href); });

test('1 added files: round-chat.js is the only new site file; package.json and CLAUDE.md stay 404', () => {
    const added = execFileSync('git', ['diff', '--name-only', '--diff-filter=A', '0d91206d'], { cwd: __dirname, encoding: 'utf8' }).split('\n').filter(Boolean)
        .concat(execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: __dirname, encoding: 'utf8' }).split('\n').filter(Boolean));
    assert.ok(added.includes('web_chat_site_test.js') || added.includes('round-chat.js'), 'the list is real (positive)');
    // Re-pinned 2026-11-10 (Tournaments phase 1, P1-e): the two app-link
    // association files are served on purpose (team links open the app), and
    // _headers is Cloudflare Pages' header config, like _routes.json. Any other
    // new served file still fails here.
    const P1E = ['.well-known/apple-app-site-association', '.well-known/assetlinks.json', '_headers'];
    const served = added.filter((f) => !M.isBlockedPath('/' + f) && !P1E.includes(f));
    assert.deepEqual(served, added.includes('round-chat.js') ? ['round-chat.js'] : [], 'served by the site');
    ['/package.json', '/CLAUDE.md', '/tools/sim/lib/emu-phone.js', '/web_chat_live_chrome_test.js', '/database.rules.json'].forEach((p) => assert.equal(M.isBlockedPath(p), true, p));
    assert.equal(M.isBlockedPath('/round-chat.js'), false, 'the chat itself is served');
});
test('2 the pages: web mode once; nothing app-only reached the site', () => {
    const tag = /<script src="round-chat\.js" data-hp-chat="web"><\/script>/g;
    ['index.html', 'leaderboard.html'].forEach((f) => {
        const h = read(f);
        assert.equal((h.match(tag) || []).length, 1, f + ': one web-mode include');
        assert.equal((h.match(/src="round-chat\.js"/g) || []).length, 1, f + ': no plain include');
        assert.doesNotMatch(h, /GPS:BEGIN|GPS:ELSE|src="gps-|src="hp-account-ui|src="simple-flow/, f + ': nothing from the app');
    });
    const rc = read('round-chat.js');
    assert.match(rc, /function appOn\(\) \{ return WEB \|\|/, 'the website has no gps-config.js: web mode is its own switch');
    assert.doesNotMatch(rc, /Capacitor|cordova|webkit\.messageHandlers/, 'no native call');
    ['gps-round.js', 'gps-config.js', 'gps-view.js', 'hp-account-ui.js', 'simple-flow.js'].forEach((f) => assert.equal(fs.existsSync(path.join(__dirname, f)), false, f + ' stays off main'));
});
test('3 the service worker and the shell list', () => {
    const sw = read('sw.js');
    assert.match(sw, /const CACHE_VERSION = 'golfapp-v410-2\.0';/);
    assert.match(sw, /\/\/ Moved to v382-2\.0 \(no self-serve seat move, Manny\): round-chat\.js/);
    assert.match(sw, /\/\/ Moved to v380-2\.0 \(web chat, ADVISOR-1727\): round-chat\.js/);
    assert.equal(sw.split("'./round-chat.js'").length - 1, 1, 'precached once');
    assert.ok(/const CONSUMER_SHELL = \[[\s\S]*?'round-chat\.js'[\s\S]*?\];/.test(read('sync-mobile-web.js')), 'in the Consumer shell');
});
test('4 money = base: the engines are origin/main 0d91206d byte for byte', () => {
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
    assert.equal(sha('settlement-engine.js'), '50ca7e5caa85607a48be82e2d97466af1be1dc217eb906d9b14283801248495d');
    assert.equal(sha('bet-strip.js'), 'f05d833c899837cbc157059cc4628e8dbd4443f29185cb3c391b50d94d9b48ec');
    assert.equal(sha('money-engine.js'), 'cfd3f365cc3b3c0634038491d28fca4b2cb16cfaf8d83c8fd684c20d3102bc27');
});

test('a pasted link with a space: ?game= is trimmed before any page reads it, the rest of the link kept', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, 'text-safe.js'), 'utf8');
    const head = src.slice(0, src.indexOf('})();') + 5);
    const run = (href) => { const box = { location: { href }, URL, history: { replaceState: (a, b, u) => { box.location.href = u; } } }; require('vm').runInNewContext(head, box); return new URL(box.location.href); };
    const u = run('https://hardpangolf.com/index.html?game=%204XGBQC%20&group=1');
    assert.equal(u.searchParams.get('game'), '4XGBQC');
    assert.equal(u.searchParams.get('group'), '1');
    assert.equal(run('https://hardpangolf.com/index.html?game=4XGBQC&group=1').href, 'https://hardpangolf.com/index.html?game=4XGBQC&group=1', 'a clean link is untouched');
});

test('the Players link is known on the live pretty URL (/leaderboard, no .html) as well as /leaderboard.html', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, 'round-chat.js'), 'utf8');
    const m = /var PLAYERS = WEB && \(function \(\) \{ try \{ return (.*?); \} catch/.exec(src);
    assert.ok(m, 'the PLAYERS line');
    const is = (pathname, search) => require('vm').runInNewContext(m[1], { W: { location: { pathname, search } } });
    assert.equal(is('/leaderboard', '?game=4XGBQC&players=1'), true);
    assert.equal(is('/leaderboard.html', '?game=4XGBQC&players=1'), true);
    assert.equal(is('/leaderboard/', '?game=4XGBQC&players=1'), true);
    assert.equal(is('/leaderboard', '?game=4XGBQC'), false, 'the plain Spectator link stays watch only');
    assert.equal(is('/index', '?game=4XGBQC&players=1'), false);
});

