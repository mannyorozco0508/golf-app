// ============================================================================
// WHAT'S NEW: THE RELEASE ROWS LEAVE THE HOMEPAGE (Manny 2026-11-19, ADVISOR-20261119-0906 item 1, the part common to all
// three homepage mockups: "the homepage is too long").
//
// The three release rows of hardpan-home.html (New in 2.0.9, New in 2.0.8, New in 2.0.7, each with its cards, and the two
// "Also new" lists) moved byte for byte to whats-new.html, served at /whats-new as a Pretty URL (no _redirects row, no
// Function: the same way see-it.html is /see-it). Where they were, first inside #features, the homepage keeps one plain
// link, "What's new ›", to /whats-new. Nothing else on the homepage moved. Four 2.0.7 cards are still opened from the
// homepage by an at-a-glance tile or a scene picture (round tabs, green slope, green size, team card), so the homepage keeps
// them as viewer-only items (<div class="vx" hidden>, a [data-shot] each; site-features.js reads every [data-shot]) with the
// same picture and headline: without them those tiles would open nothing.
//
// 1. Source: the homepage has no release row and has the link (in the rows' old place); whats-new.html has the three
//    releases newest first, the same 8 cards (2 + 2 + 4) and the two Also new lists (7 + 5 items), the rows block identical
//    to the homepage's at d1a5e83a (sha256 pinned), a back link to /, the viewer and site-features.js; every picture it
//    names resolves to a file on disk; the four viewer-only items carry the same pictures as their cards and each is opened
//    by something on the homepage; served as a static page, not the app; the marketing words rules.
// 2. Chrome (390x844, then 900x800; the pages served by a tiny static server over this repo that does what Cloudflare's
//    Pretty URLs do; every action a real mouse event or key; nothing the page defines is called): a click on the homepage's
//    link lands on /whats-new; there the three rows render in order with their first pictures loaded; a card opens the
//    viewer on itself with the sharp picture loaded; Esc closes it; at 900 an arrow scrolls its row; the back link lands
//    on /; on the homepage the round-tabs tile still opens the viewer on its picture. No page error anywhere.
// WHAT IT CANNOT PROVE: Safari, a real Cloudflare edge (that /whats-new is served from whats-new.html is Cloudflare's
//    documented Pretty URLs behaviour, the same one /see-it already relies on in production), pinch zoom.
//
// BASELINE against pre-build d1a5e83a (hardpan-home.html with the three rows; no whats-new.html),
// this exact file copied into a git-archive export of that tree: 2 pass / 9 fail / 0 cancelled of 11. The two that pass:
// 1.8 (no rewrite row, no Function, not blocked, not in the shell: all true of a page that does not exist yet) and 2.3
// (the round-tabs tile opened the viewer then because the 2.0.7 row itself was on the homepage). 2 + 9 = 11.
// On the build: 11 pass / 0 fail / 0 cancelled of 11.
// NEGATIVE CONTROLS (run by hand 2026-11-19, each file copied to the scratchpad first and restored by cp, sha printed
// beside RESTORED-OK):
//   A. the homepage's <div class="vx" hidden> block deleted: 9 / 2 (1.5, and 2.3: the round-tabs tile opens nothing).
//   B. one card (#f-ring-aside) deleted from whats-new.html: 7 / 4 (1.3 count + block sha, 1.4 picture count, 2.1 rows
//      2,1,4, 2.2 the viewer reads "New in 2.0.8 · 1 / 1").
//   C. the homepage's What's new link deleted: 8 / 3 (1.1; 2.1 has no link to click; 2.2 then starts on the homepage, a
//      knock-on of 2.1, not an independent catch).
// ============================================================================
'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = __dirname;
const exists = (f) => fs.existsSync(path.join(ROOT, f));
const read = (f) => (exists(f) ? fs.readFileSync(path.join(ROOT, f), 'utf8') : '');
const stripComments = (h) => h.replace(/<!--[\s\S]*?-->/g, '');
const home = stripComments(read('hardpan-home.html'));
const wnRaw = read('whats-new.html');
const wn = stripComments(wnRaw);
const textOf = (h) => String(h).replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&rsquo;/g, '’').replace(/&amp;/g, '&').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
const sectionOf = (h) => (/<section class="feat" id="features">\n([\s\S]*?)\n<\/section>/.exec(h) || ['', ''])[1];
const cardsOf = (h) => [...h.matchAll(/<li class="fc" id="([^"]+)" data-key="([^"]+)">([\s\S]*?)<\/li>/g)].map((m) => ({ id: m[1], key: m[2], body: m[3], img: (/<img\b[^>]*>/.exec(m[3]) || [''])[0] }));
const RELEASES = [
    ['g-update', 'New in 2.0.9', ['f-red-under', 'f-ask-red'], 0],
    ['g-update208', 'New in 2.0.8', ['f-smooth-slope', 'f-ring-aside'], 7],
    ['g-new', 'New in 2.0.7', ['f-round-tabs', 'f-green-slope', 'f-green-size', 'f-team-card'], 5]
];
// sha256 of the 20 lines of hardpan-home.html at d1a5e83a from <div class="grp" id="g-update"> up to <div class="grp" id="g-play">
// (git show d1a5e83a:hardpan-home.html | sed -n 680,699p | shasum -a 256): the rows as they were, every card exactly.
const ROWS_SHA = '68a6edce3e1dc6a14c57ee0c453790ffccf7f133899de49612843b6f630c291a';
const VX = ['round-tabs', 'green-slope', 'green-size', 'team-card'];
const MONEY = /\$\s?\d|\b(bet|bets|betting|wager\w*|gambl\w*|pool|pools|pot|pots|buy-?ins?|stake|stakes|cash|venmo|paypal|prize money|payouts?)\b/i;
const COMPETITORS = /18birdies|swingu|golfshot|hole19|arccos|golflogix|thegrint|\bgrint\b|golfpad|shot ?scope|golf ?genius|live ?tourney|vpar|golfstatus|bluegolf|eventcaddy/i;

describe('1. source', () => {
    test('1.1 the homepage: no release row, no Also new list; one plain "What\'s new" link to /whats-new, first inside #features where the rows were', () => {
        const feat = (/<section class="feat" id="features">([\s\S]*?)<\/section>\s*<div class="fv"/.exec(home) || ['', ''])[1];
        assert.ok(feat.includes('<div class="grp" id="g-play">') && feat.includes('EVERYTHING IN THE APP'), 'positive: the homepage rows were found');
        assert.doesNotMatch(home, /id="g-update|id="g-new"|class="new207"|New in 2\.0\.\d|Also new in/, 'a release row is still on the homepage');
        assert.deepEqual(cardsOf(home).filter((c) => RELEASES.some((r) => r[2].includes(c.id))).map((c) => c.id), []);
        assert.equal((home.match(/href="\/whats-new"/g) || []).length, 1, 'one link');
        assert.match(feat, /^\s*<h2 class="ftitle">EVERYTHING IN THE APP<\/h2>\s*<p class="fsub">[^<]*<\/p>\s*<p class="wnlink"><a id="whats-new-link" href="\/whats-new">What&rsquo;s new &rsaquo;<\/a><\/p>\s*<div class="grp" id="g-play">/);
        assert.match(home, /\.wnlink a \{ display:inline-flex; align-items:center; min-height:44px;/, 'the link is a 44 px tap target');
    });
    test('1.2 whats-new.html: its own page with the title, a back link to the homepage, the heading, the viewer and site-features.js', () => {
        assert.ok(wn.length > 5000, 'whats-new.html exists');
        assert.match(wn, /<title>What&rsquo;s new in HardPan<\/title>/);
        assert.match(wn, /<a class="logo" href="\/"><img src="\/media\/home\/hardpan-golf-lockup\.png" alt="HardPan Golf"/);
        assert.match(wn, /<a class="back" id="back-home" href="\/">&lsaquo; Back to HardPan<\/a>/);
        assert.match(wn, /<h1>What&rsquo;s new<\/h1>/);
        assert.match(wn, /<div class="fv" id="fv" role="dialog" aria-modal="true" aria-labelledby="fv-title" hidden>/);
        assert.match(wn, /<script src="\/site-features\.js" defer><\/script>/);
        assert.doesNotMatch(wn, /2\.1\.0/, 'no 2.1.0 until it is in the stores');
    });
    test('1.3 the three releases newest first, the same 8 cards (2 + 2 + 4), the Also new lists (7 + 5), each row block exactly as the homepage had it', () => {
        const sec = sectionOf(wn);
        assert.ok(sec.length > 5000, 'positive: the rows were found');
        const at = RELEASES.map((r) => sec.indexOf('<div class="grp" id="' + r[0] + '">'));
        assert.ok(at[0] === 4 && at[1] > at[0] && at[2] > at[1], 'in order 2.0.9, 2.0.8, 2.0.7: ' + at.join(' '));
        RELEASES.forEach(([id, name, ids, also], i) => {
            const g = sec.slice(at[i], i < 2 ? at[i + 1] : sec.length);
            assert.match(g, new RegExp('<h2>' + name.replace(/\./g, '\\.') + '</h2><span class="gn">' + ids.length + ' &middot; swipe &rarr;</span>'));
            assert.deepEqual(cardsOf(g).map((c) => c.id), ids, name);
            assert.equal((/<div class="dots"[^>]*>([\s\S]*?)<\/div>/.exec(g)[1].match(/<i/g) || []).length, ids.length, name + ' dots');
            const list = (/<ul class="new207" aria-label="Also new in [^"]+">([\s\S]*?)<\/ul>/.exec(g) || ['', ''])[1];
            assert.equal((list.match(/<li>/g) || []).length, also, name + ' Also new');
        });
        assert.equal(cardsOf(sec).length, 8);
        assert.equal(crypto.createHash('sha256').update(sec + '\n').digest('hex'), ROWS_SHA, 'the rows are not byte for byte the ones the homepage had');
    });
    test('1.4 every picture whats-new.html names is a file on disk (each card a 400 + 940 WebP pair, its alt real)', () => {
        const refs = [...wn.matchAll(/\b(?:src|srcset|data-src|poster)="([^"]+)"/g)].map((m) => m[1]).filter((v) => !/^\/site-/.test(v))
            .flatMap((v) => v.split(',').map((x) => x.trim().split(' ')[0]));
        assert.equal(refs.length, 1 + 8 * 2 + 8, 'the lockup + each card\'s src and its two srcset files');
        refs.forEach((r) => { assert.match(r, /^\/media\//, r); assert.ok(exists(r.slice(1)) && fs.statSync(path.join(ROOT, r.slice(1))).size > 5000, r + ' is not a file'); });
        cardsOf(wn).forEach((c) => {
            assert.match(c.img, new RegExp('src="/media/screens/' + c.key + '-400\\.webp" srcset="/media/screens/' + c.key + '-400\\.webp 400w, /media/screens/' + c.key + '-940\\.webp 940w"'), c.id);
            assert.ok((/\balt="([^"]*)"/.exec(c.img) || ['', ''])[1].length >= 30, c.id + ' alt');
            assert.match(c.img, /loading="lazy"/);
        });
    });
    test('1.5 the homepage keeps the four 2.0.7 cards its tiles open as viewer-only items: hidden, the same picture and headline, each opened by something', () => {
        const vx = (/<div class="vx" hidden>([\s\S]*?)<\/div>/.exec(home) || ['', ''])[1];
        const items = [...vx.matchAll(/<span data-shot="([^"]+)" data-group="At a glance">(<img [^>]*>)<b>([^<]+)<\/b><\/span>/g)];
        assert.deepEqual(items.map((m) => m[1]), VX);
        const cards = cardsOf(wn);
        items.forEach(([, k, img, h]) => {
            const c = cards.find((x) => x.key === k);
            assert.ok(c, k + ' is a whats-new card');
            assert.equal(img, c.img.replace(/ sizes="[^"]*"/, ''), k + ': not the card\'s picture');
            assert.ok(c.body.includes('<h3>' + h + '</h3>'), k + ': not the card\'s headline');
            assert.ok(home.includes('data-open-key="' + k + '"'), 'positive: something on the homepage opens ' + k);
        });
        // every data-open-key on the homepage resolves: a row card, a sheet picture, or one of these four
        const known = new Set(cardsOf(home).map((c) => c.key).concat([...home.matchAll(/data-shot="([^"]+)"/g)].map((m) => m[1])));
        const keys = [...home.matchAll(/data-open-key="([^"]+)"/g)].map((m) => m[1]);
        assert.ok(keys.length >= 70);
        assert.deepEqual(keys.filter((k) => !known.has(k)), [], 'a tile or picture on the homepage opens nothing');
    });
    test('1.6 the release rows\' CSS moved with them: the homepage has no .new207 rule; whats-new.html has the homepage\'s rules for the rows, unchanged', () => {
        const homeAt = read('hardpan-home.html');
        assert.doesNotMatch(homeAt, /\.new207/);
        const was = '    .new207 li { font-size:14px; line-height:1.35; color:var(--ink); background:#fff; border:1px solid #e3dfd2; border-radius:12px; padding:8px 12px; }';
        assert.ok(wnRaw.includes(was), 'positive: the Also new rule');
        ['    .fc { flex:0 0 272px; scroll-snap-align:start; height:520px;', '    .ph { display:block; flex:0 0 auto; width:206px;', '    .row { list-style:none; display:flex; gap:12px; overflow-x:auto;', '    .fv-img { position:relative; height:100%;']
            .forEach((r) => { assert.ok(homeAt.includes(r), 'homepage: ' + r); assert.ok(wnRaw.includes(r), 'whats-new: ' + r); });
    });
    test('1.7 the marketing words: no betting or cash word, no dollar figure, no competitor, no "Coming soon", nothing in review', () => {
        const t = textOf(wn);
        assert.ok(t.length > 1500, 'positive: there is copy to judge');
        assert.doesNotMatch(t, MONEY, (t.match(MONEY) || [])[0]);
        assert.doesNotMatch(wn, COMPETITORS);
        assert.doesNotMatch(t, /coming soon|in review|not in the app yet|coming in 2\.0/i);
    });
    test('1.8 served as a static page, not the app: no _redirects row, no Function route, not blocked, not in the service worker shell or the native bundle', async () => {
        assert.doesNotMatch(read('_redirects'), /whats-new/);
        assert.doesNotMatch(read('_routes.json'), /whats-new/);
        const MW = await import(pathToFileURL(path.join(ROOT, 'functions', '_middleware.js')).href);
        assert.equal(MW.isBlockedPath('/whats-new'), false); assert.equal(MW.isBlockedPath('/whats-new.html'), false);
        assert.equal(MW.isBlockedPath('/whats_new_page_test.js'), true, 'positive: the middleware does block a test file');
        const sw = read('sw.js');
        const shell = sw.slice(sw.indexOf('const SHELL_FILES = ['), sw.indexOf('];', sw.indexOf('const SHELL_FILES = [')));
        assert.ok(shell.length > 200, 'positive: the shell list');
        assert.doesNotMatch(shell, /whats-new|hardpan-home|site-features/);
        assert.doesNotMatch(read('sync-mobile-web.js'), /whats-new/);
    });
});

// ---------------------------------------------------------------------------
// 2. Chrome. --use-mock-keychain / --password-store=basic: without them Chrome on this Mac can wait on the login keychain.
// ---------------------------------------------------------------------------
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CAN = fs.existsSync(CHROME) && typeof WebSocket === 'function';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp4': 'video/mp4', '.jpg': 'image/jpeg' };
function serve() {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
            if (p === '/') p = '/hardpan-home.html';
            if (!path.extname(p) && fs.existsSync(path.join(ROOT, p + '.html'))) p += '.html';   // Pretty URLs, as Cloudflare Pages serves them
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
            res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
            res.end(fs.readFileSync(f));
        });
        srv.listen(0, '127.0.0.1', () => resolve(srv));
    });
}
class Tab {
    async open() {
        this.profile = fs.mkdtempSync(path.join(require('os').tmpdir(), 'whats-new-'));
        this.port = 9550 + Math.floor(Math.random() * 300);
        this.chrome = spawn(CHROME, ['--headless=new', '--use-mock-keychain', '--password-store=basic', '--remote-debugging-port=' + this.port, '--user-data-dir=' + this.profile, '--window-size=1400,1000', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
        let list = null;
        for (let i = 0; i < 80 && !list; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + this.port + '/json', (r) => { let b = ''; r.on('data', (d) => b += d); r.on('end', () => res(JSON.parse(b))); }).on('error', rej)); } catch (e) { await sleep(250); } }
        this.ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
        this.id = 0; this.pending = new Map(); this.errors = [];
        this.ws.addEventListener('message', (ev) => {
            const d = JSON.parse(ev.data);
            if (d.id && this.pending.has(d.id)) { this.pending.get(d.id)(d); this.pending.delete(d.id); }
            if (d.method === 'Runtime.exceptionThrown') this.errors.push(JSON.stringify(d.params.exceptionDetails).slice(0, 200));
        });
        await new Promise((r) => this.ws.addEventListener('open', r));
        await this.send('Runtime.enable'); await this.send('Page.enable');
    }
    send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const i = ++this.id; this.pending.set(i, resolve);
            this.ws.send(JSON.stringify({ id: i, method, params }));
            setTimeout(() => { if (this.pending.has(i)) { this.pending.delete(i); reject(new Error(method + ' timed out')); } }, 30000);
        });
    }
    async metrics(w, h) { await this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 }); }
    async eval(expression) {
        const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
        return r.result.result.value;
    }
    async go(url) { await this.send('Page.navigate', { url }); await sleep(1500); }
    // a real mouse click on the element's centre, after bringing it on screen (a DOM call, not one of the page's functions)
    async click(sel) {
        const p = await this.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
        assert.ok(p, 'nothing to click: ' + sel);
        await sleep(250);
        for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await this.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
        await sleep(600);
    }
    async key(k) {
        for (const type of ['keyDown', 'keyUp']) await this.send('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: k === 'Escape' ? 27 : 0 });
        await sleep(300);
    }
    async close() { try { this.ws.close(); } catch (e) { /* closed */ } try { this.chrome.kill(); } catch (e) { /* gone */ } await sleep(300); try { fs.rmSync(this.profile, { recursive: true, force: true }); } catch (e) { /* left */ } }
}
const VIEWER = `(() => { const fv = document.getElementById('fv'); const t = document.getElementById('fv-track'); const i = Math.round(t.scrollLeft / Math.max(1, t.clientWidth));
    const im = t.querySelector('.fv-s[data-i="' + i + '"] img');
    return { open: !fv.hidden, n: document.getElementById('fv-n').textContent, title: document.getElementById('fv-title').textContent, img: im ? { src: im.currentSrc || im.src, ok: im.complete && im.naturalWidth > 0 } : null }; })()`;
const waitImg = async (tab) => { let v; for (let i = 0; i < 30; i++) { v = await tab.eval(VIEWER); if (v.img && v.img.ok) break; await sleep(200); } return v; };

describe('2. Chrome: the way a visitor arrives', { skip: CAN ? false : 'no Chrome or no WebSocket' }, () => {
    let srv, base, tab;
    before(async () => { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port; tab = new Tab(); await tab.open(); });
    after(async () => { if (tab) await tab.close(); if (srv) { srv.closeAllConnections(); srv.close(); } });

    test('2.1 390x844: the homepage link lands on /whats-new; the three rows render newest first, no sideways scroll, each row\'s first picture loads', async () => {
        await tab.metrics(390, 844);
        await tab.go(base + '/');
        assert.equal(await tab.eval(`document.querySelectorAll('#features .grp').length`), 5, 'positive: the homepage rows rendered');
        await tab.click('#whats-new-link');
        await sleep(900);
        const r = await tab.eval(`(() => ({ path: location.pathname, h1: (document.querySelector('h1') || {}).innerText, rows: [...document.querySelectorAll('#features .grp')].map((g) => g.querySelector('h2').innerText + ':' + g.querySelectorAll('.fc').length),
            sideways: document.documentElement.scrollWidth > window.innerWidth, back: (document.getElementById('back-home') || {}).offsetHeight }))()`);
        assert.equal(r.path, '/whats-new');
        assert.equal(r.h1, 'What’s new');
        assert.deepEqual(r.rows, ['New in 2.0.9:2', 'New in 2.0.8:2', 'New in 2.0.7:4']);
        assert.equal(r.sideways, false);
        assert.ok(r.back >= 44, 'the back link is a 44 px target: ' + r.back);
        for (const id of ['f-red-under', 'f-smooth-slope', 'f-round-tabs']) {
            await tab.eval(`(document.getElementById('${id}').scrollIntoView({ block: 'center', behavior: 'instant' }), true)`);
            let ok = false;
            for (let i = 0; i < 25 && !ok; i++) { await sleep(200); ok = await tab.eval(`(() => { const im = document.querySelector('#${id} .ph img'); return im.complete && im.naturalWidth > 0; })()`); }
            assert.ok(ok, id + ': its picture did not load');
        }
        assert.deepEqual(tab.errors, []);
    });
    test('2.2 a card opens the viewer on itself with the sharp picture; the arrow moves on; Esc closes; at 900 an arrow scrolls its row; the back link lands on /', async () => {
        await tab.click('#f-smooth-slope .ph');
        let v = await waitImg(tab);
        assert.equal(v.open, true, 'the viewer did not open');
        assert.equal(v.n, 'New in 2.0.8 · 1 / 2'); assert.equal(v.title, 'Read the green.');
        assert.ok(v.img && v.img.ok && /smooth-slope-940\.webp$/.test(v.img.src), 'the sharp picture: ' + JSON.stringify(v.img));
        await tab.key('ArrowRight');
        v = await tab.eval(VIEWER);
        assert.equal(v.n, 'New in 2.0.8 · 2 / 2');
        await tab.key('Escape');
        v = await tab.eval(VIEWER);
        assert.equal(v.open, false, 'Esc did not close the viewer');
        await tab.metrics(900, 800);   // at 1280 the 4 cards of the 2.0.7 row fit and there is nothing to scroll (as on the homepage before)
        await tab.go(base + '/whats-new');
        const before0 = await tab.eval(`document.querySelector('#g-new .row').scrollLeft`);
        await tab.click('#g-new .ga[data-dir="1"]');
        await sleep(600);
        const after0 = await tab.eval(`document.querySelector('#g-new .row').scrollLeft`);
        assert.ok(before0 === 0 && after0 > 100, 'the arrow did not scroll the row: ' + before0 + ' -> ' + after0);
        await tab.click('#back-home');
        await sleep(900);
        assert.equal(await tab.eval('location.pathname'), '/');
        assert.deepEqual(tab.errors, []);
    });
    test('2.3 on the homepage the round-tabs tile still opens the viewer on its picture (a viewer-only item)', async () => {
        await tab.metrics(390, 844);
        await tab.go(base + '/');
        // Re-pinned 2026-11-19 homepage A (Manny's pick): round tabs is past the first 12 tiles now; a visitor taps See all first.
        await tab.click('#glance-more');
        await tab.click('.glance-tiles .gt[data-open-key="round-tabs"]');
        const v = await waitImg(tab);
        assert.equal(v.open, true, 'the tile opened nothing');
        assert.equal(v.title, 'Card, GPS, Games, Board.');
        assert.ok(v.img && v.img.ok && /round-tabs-940\.webp$/.test(v.img.src), JSON.stringify(v.img));
        await tab.key('Escape');
        assert.deepEqual(tab.errors, []);
    });
});
