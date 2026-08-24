// ============================================================================
// BUNDLE MANIFEST INTEGRITY
//
// Two lists decide which files actually travel with the app:
//
//   sync-mobile-web.js  FILES_TO_SYNC  -> what gets copied into www/app/ for
//                                        the Capacitor (native) bundle
//   sw.js               SHELL_FILES    -> what gets cached for offline use
//
// Neither list is derived from anything. Both are hand-maintained arrays, and
// nothing in the app has ever checked them against reality. That is a bad
// property for a list whose failure mode is invisible.
//
// WHY THIS MATTERS MORE THAN A NORMAL MISSING-FILE BUG
//
// The engines are loaded as plain <script src> globals, and the call sites
// guard them:
//
//   settlement-engine.js:  if (typeof computeMoneyPoolNetByPlayerId === 'function')
//   index.html:            if (typeof computeMoneyPool !== 'function') return '';
//   settlement.html:       if (typeof computeMoneyPool !== 'function') { ...; return; }
//
// Those guards are correct defensive code, but they mean a missing engine file
// does not throw. It does not log. The Money Pool simply computes as zero and
// disappears from the scorecard banner, the receipt, and the settlement totals.
// Real buy-ins collected on the first tee, $0 in the app, no error anywhere.
// A crash would be safer than this, because a crash gets reported.
//
// THE RULE THIS FILE ENFORCES
//
//   If a manifest ships an HTML page, it must also ship every local script
//   that page loads.
//
// Stated that way it is self-maintaining: adding a page to a manifest pulls in
// its dependencies automatically, and adding a new <script src> to a page that
// is already shipped fails here until both manifests catch up. It also does not
// force anything extra into either list - sw.js deliberately omits the
// Tournament pages, so it is not required to carry tournament-engine.js.
//
// This test reads the real files and parses the real arrays. It does not keep
// its own copy of the expected list, because a hardcoded expected list is just
// a third hand-maintained array with the same failure mode as the first two.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = __dirname;

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

// --- parse the two manifests out of their source files ---------------------

function parseArrayLiteral(source, declaration, file) {
    const start = source.indexOf(declaration);
    assert.notEqual(start, -1, `Could not find "${declaration}" in ${file} - the manifest was renamed or restructured, so this test is no longer checking anything.`);
    const open = source.indexOf('[', start);
    const close = source.indexOf('];', open);
    assert.ok(open !== -1 && close !== -1, `Could not read the array literal for "${declaration}" in ${file}.`);
    const body = source.slice(open + 1, close);
    // Strip line comments so commented-out entries never count as shipped.
    const uncommented = body.replace(/\/\/[^\n]*/g, '');
    return [...uncommented.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1].replace(/^\.\//, ''));
}

function getSyncList() {
    return parseArrayLiteral(read('sync-mobile-web.js'), 'const FILES_TO_SYNC', 'sync-mobile-web.js');
}

function getShellList() {
    return parseArrayLiteral(read('sw.js'), 'const SHELL_FILES', 'sw.js');
}

// --- derive what each page actually needs ----------------------------------

// Local scripts only: same-directory .js files. Anything with a protocol or a
// path separator is a CDN/vendor script and is not ours to bundle.
function localScriptsFor(htmlFile) {
    const html = read(htmlFile);
    const refs = [...html.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/gi)].map((m) => m[1]);
    return [...new Set(
        refs
            .map((r) => r.replace(/^\.\//, ''))
            .filter((r) => r.endsWith('.js') && !r.includes('//') && !r.includes('/') && !r.includes(':'))
    )];
}

function auditManifest(manifest, label) {
    const pages = manifest.filter((f) => f.endsWith('.html'));
    const shipped = new Set(manifest);
    const gaps = [];
    pages.forEach((page) => {
        localScriptsFor(page).forEach((script) => {
            if (!shipped.has(script)) gaps.push(`${label} ships ${page} but not ${script} (which ${page} loads)`);
        });
    });
    return { pages, gaps };
}

// ============================================================================

describe('BUNDLE MANIFEST INTEGRITY - the app cannot ship a page without its engines', () => {

    test('the manifests are parseable and non-trivial', () => {
        const sync = getSyncList();
        const shell = getShellList();
        assert.ok(sync.length >= 10, `FILES_TO_SYNC parsed as only ${sync.length} entries - parsing is probably broken.`);
        assert.ok(shell.length >= 10, `SHELL_FILES parsed as only ${shell.length} entries - parsing is probably broken.`);
        assert.ok(sync.some((f) => f.endsWith('.html')), 'FILES_TO_SYNC should contain HTML pages.');
        assert.ok(shell.some((f) => f.endsWith('.html')), 'SHELL_FILES should contain HTML pages.');
    });

    test('every file in FILES_TO_SYNC exists at the repo root', () => {
        const missing = getSyncList().filter((f) => !fs.existsSync(path.join(REPO_ROOT, f)));
        assert.deepEqual(missing, [], `sync-mobile-web.js exits non-zero on a missing file, so this would break the Capacitor build outright: ${missing.join(', ')}`);
    });

    test('every file in SHELL_FILES exists at the repo root', () => {
        const missing = getShellList().filter((f) => !fs.existsSync(path.join(REPO_ROOT, f)));
        // This one is quieter and therefore worse: a 404 inside the install
        // handler degrades offline caching instead of failing a build.
        assert.deepEqual(missing, [], `sw.js lists files that do not exist, so they can never be cached: ${missing.join(', ')}`);
    });

    test('CAPACITOR BUNDLE: every page it ships also gets the scripts that page loads', () => {
        const { pages, gaps } = auditManifest(getSyncList(), 'FILES_TO_SYNC');
        assert.ok(pages.length >= 8, `Expected the native bundle to ship the real app, found only ${pages.length} pages.`);
        assert.deepEqual(gaps, [], `The native app would load these pages with missing engines:\n  - ${gaps.join('\n  - ')}`);
    });

    test('OFFLINE CACHE: every page it caches also gets the scripts that page loads', () => {
        const { pages, gaps } = auditManifest(getShellList(), 'SHELL_FILES');
        assert.ok(pages.length >= 8, `Expected the offline shell to cover the real app, found only ${pages.length} pages.`);
        assert.deepEqual(gaps, [], `On a course with no signal these pages would load without their engines:\n  - ${gaps.join('\n  - ')}`);
    });

    test('MONEY POOL SPECIFICALLY: pool-engine.js travels with every page that reads the pot', () => {
        // Called out on its own because this is the one whose absence is silent
        // rather than loud - see the header note. If this ever regresses, the
        // symptom in the field is "the pot vanished", with nothing in the
        // console and nothing on screen to explain it.
        const readers = ['admin.html', 'index.html', 'settlement.html']
            .filter((p) => localScriptsFor(p).includes('pool-engine.js'));
        assert.ok(readers.length > 0, 'No page loads pool-engine.js any more - if the Money Pool was removed, delete this test deliberately rather than letting it pass vacuously.');

        const sync = new Set(getSyncList());
        const shell = new Set(getShellList());
        readers.forEach((page) => {
            if (sync.has(page)) assert.ok(sync.has('pool-engine.js'), `${page} is in the native bundle but pool-engine.js is not - the Money Pool would silently pay $0.`);
            if (shell.has(page)) assert.ok(shell.has('pool-engine.js'), `${page} is cached offline but pool-engine.js is not - the Money Pool would silently pay $0 with no signal.`);
        });
    });

    test('the guards that make this failure silent are still in place (so the rule above stays necessary)', () => {
        // If someone later removes these guards, a missing engine starts
        // throwing loudly instead of paying zero. That would be a different
        // (better) failure mode, and this test file's framing would need
        // revisiting. Asserting it keeps the reasoning honest rather than
        // leaving a stale comment above.
        assert.match(read('settlement-engine.js'), /typeof computeMoneyPoolNetByPlayerId === 'function'/, 'settlement-engine.js no longer guards the pool call.');
        assert.match(read('index.html'), /typeof computeMoneyPool !== 'function'/, 'index.html no longer guards the pool banner.');
        assert.match(read('settlement.html'), /typeof computeMoneyPool !== 'function'/, 'settlement.html no longer guards the pool receipt section.');
    });

    test('the offline install handler caches file-by-file, not all-or-nothing', () => {
        // cache.addAll() is atomic: one 404 rejects the whole promise and
        // NOTHING gets cached. Paired with a swallowing .catch() that means a
        // single bad entry silently turns off offline support for the entire
        // app - which is precisely the situation this app cannot afford at a
        // remote course. Individual adds degrade gracefully instead.
        // Comments are stripped first. sw.js explains this hazard in a comment and
        // names the API while doing so; the assertion is about what the code calls,
        // not what the prose mentions, so matching raw text would fail on its own
        // documentation.
        const code = read('sw.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
        assert.doesNotMatch(code, /cache\.addAll\s*\(/, 'sw.js uses cache.addAll(), which is all-or-nothing: one missing file silently disables offline caching for every other file too.');
        assert.match(code, /cache\.add\s*\(/, 'sw.js should cache shell files individually with cache.add() so one failure costs one file.');
    });
});
