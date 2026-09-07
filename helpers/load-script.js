// ============================================================================
// Test helper — loads production code AS-IS into a sandboxed vm context and
// hands back its top-level functions/consts for testing.
//
// Zero production files are modified to make this work. For .html files, this
// extracts the inline <script>...</script> text (same technique used
// throughout manual verification this session) and runs it in a vm context
// with minimal stub globals (document, window, navigator, db) so functions
// that don't touch those globals still execute correctly, even though they
// live inside a much larger DOM/Firebase-dependent file.
// ============================================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createDocument } = require('./mini-dom.js');

const REPO_ROOT = path.join(__dirname, '..');

// Minimal stand-ins so loading a whole <script> block doesn't throw just because
// *other* functions in that file reference document/window/db. Unlike a single shared
// stub element, getElementById here returns a DISTINCT, PERSISTENT element per id — so
// a test can pre-set specific values (document.getElementById('foo').value = '10')
// before calling a real production render function, and that function's own
// document.getElementById('foo') call sees the same value. This is what makes it
// possible to test logic that's embedded inside a DOM-dependent function (like trip.html's
// renderPrizePayouts) without modifying production code to expose it separately.
// A LIVE element tree (helpers/mini-dom.js) rather than a set of shapes.
//
// The previous stub answered every question with a placeholder: querySelectorAll()
// returned [], createElement() handed back one shared object, appendChild() did
// nothing, and Element.remove() did not exist. Production code therefore never really
// ran - and an infinite-recursion bug in the "Add New Player" click path passed 1330
// tests, because with no .player-row elements the render loop it recursed through had
// nothing to iterate.
//
// The guarantee the old harness made is preserved exactly: getElementById returns a
// DISTINCT, PERSISTENT element per id, so a test can pre-set a value and the
// production function it calls sees the same object. What is new is that the tree is
// real - appended children exist, selectors find them, and removing one removes it.
function makeStubSandbox() {
    const documentStub = createDocument();
    const elementRegistry = documentStub.__registry;
    const captured = [];
    const dbStub = {
        ref(p) {
            // push() returns a FULL reference, as real Firebase does. It used to hand
            // back { key: 'TEST' } only, so any production path that pushed and then
            // set - logAuditEntry() does exactly that, and saveScore() calls it -
            // died on "logRef.set is not a function". Nothing was wrong with the
            // production code; the stub simply could not model it, which made
            // saveScore() untestable. Strictly more capable than before: callers that
            // only read .key are unaffected.
            const ref = {
                key: 'TEST',
                // CAPTURED, NOT DISCARDED. Pages register their value handler at load;
                // throwing it away meant a test could only approximate the arrival by
                // hand-writing a listener, which is not the code production runs.
                // sandbox.__dbHandlers lets a test fire the page's OWN callback.
                on(ev, cb) {
                    if (typeof cb === 'function') captured.push({ path: p, event: ev, cb: cb });
                },
                once() { return Promise.resolve({ val() { return null; }, exists() { return false; } }); },
                set() { return Promise.resolve(); }, update() { return Promise.resolve(); },
                remove() { return Promise.resolve(); },
                push() { return ref; }
            };
            return ref;
        }
    };
    const sandbox = {
        document: documentStub,
        window: {},
        navigator: { clipboard: { writeText() { return Promise.resolve(); } }, share: undefined },
        // setTimeout was absent, so ANY code path with a deferred UI reset - the
        // "Copied" button label, for instance - threw inside its own .then() and
        // silently fell through to the catch branch. That made every clipboard copy
        // look like it had failed. Real timers, so deferred work behaves as it does
        // in a browser.
        setTimeout, clearTimeout, setInterval, clearInterval,
        location: { search: '', href: 'https://golf-app-5a5.pages.dev/index.html', pathname: '/index.html' },
        localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
        // A REAL one, unlike the localStorage stub above. sessionStorage is used to
        // remember UI state that must survive a re-render or a reload, so a test
        // that cannot read back what production wrote proves nothing about it.
        // localStorage is deliberately left as-is: dozens of suites already run
        // against its no-op behaviour and giving it memory could change them.
        sessionStorage: (() => {
            const mem = new Map();
            return {
                getItem: k => (mem.has(String(k)) ? mem.get(String(k)) : null),
                setItem: (k, v) => { mem.set(String(k), String(v)); },
                removeItem: k => { mem.delete(String(k)); },
                clear: () => { mem.clear(); }
            };
        })(),
        firebase: { initializeApp() {}, database() { return dbStub; } },
        db: dbStub,
        alert() {}, confirm() { return true; }, prompt() { return null; },
        URLSearchParams: URLSearchParams,
        console: console,
        Math: Math, Date: Date, Array: Array, Object: Object, JSON: JSON,
        Set: Set, Map: Map,
        __elementRegistry: elementRegistry, // exposed so tests can inspect rendered output directly
        __dbHandlers: captured,             // the value handlers the page registered
    };
    sandbox.window = sandbox;
    return sandbox;
}

// WHAT A MODULE NEEDS BEFORE IT CAN RUN.
//
// money-engine.js and settlement-engine.js call the handicap family as plain
// globals - parseHcp inside calcWolfEngine, getStrokes inside calculateMatchEngine,
// and so on. In the browser they are never loaded without handicap.js, because
// every page that loads one loads the other. A test realm holding money-engine.js
// alone therefore does not describe production, and used to only appear to work
// because money-engine.js carried its own copy of the family.
//
// Declared here, once, rather than in forty test files.
const MODULE_PREREQS = {
    'money-engine.js': ['handicap.js'],
    'settlement-engine.js': ['handicap.js'],
    // computeTournamentPayouts() calls allocatePlacePayouts() as a global, exactly
    // as it does in the browser where both tournament pages load payouts.js first.
    // tournament-engine.js calls allocatePlacePayouts() for prize money and
    // getStrokes()/parseHcp() for individual net allocation, all as plain globals -
    // exactly as it does in the browser, where both tournament pages load them first.
    'tournament-engine.js': ['handicap.js', 'payouts.js'],
    // ryder-cup.js calls parseHcp for the Foursomes allowance and
    // calculateMatchEngine for Four-Ball, both as plain globals, exactly as the
    // browser supplies them. Without them the Foursomes path throws
    // ReferenceError and - far worse - ryderFourBallState bails at its first
    // line and returns a SILENT null, so a Four-Ball test passes having computed
    // nothing at all.
    'ryder-cup.js': ['handicap.js', 'money-engine.js'],
};

// Loads a plain, standalone .js file (money-engine.js, tournament-engine.js,
// course-data.js) — these already run at global scope with no DOM/Firebase
// references, so no extraction is needed, just execution in a sandbox.
//
// dependencies:  EXTRA modules to load first, on top of the prerequisites above.
// options.only:  load ONLY what is listed, ignoring the prerequisites. For the
//                deliberately-crippled realms that prove a module fails loudly
//                without its dependency - the one case where a realm should NOT
//                describe production.
function loadJsFile(relativePath, dependencies, options) {
    const fullPath = path.join(REPO_ROOT, relativePath);
    const code = fs.readFileSync(fullPath, 'utf8');
    const sandbox = makeStubSandbox();
    vm.createContext(sandbox);
    const before = (options && options.only)
        ? (dependencies || [])
        : (MODULE_PREREQS[relativePath] || []).concat(
              (dependencies || []).filter(d => !(MODULE_PREREQS[relativePath] || []).includes(d)));
    before.forEach(dep => vm.runInContext(
        fs.readFileSync(path.join(REPO_ROOT, dep), 'utf8'), sandbox, { filename: dep }));
    vm.runInContext(code, sandbox, { filename: relativePath });
    attachDomHelpers(sandbox);
    return sandbox;
}

// Convenience helpers for driving a real production function that reads/writes stubbed
// DOM elements directly — set('some-id', '10') before calling a function, get('some-id')
// to read back whatever it wrote (e.g. rendered HTML) afterward.
function attachDomHelpers(sandbox) {
    sandbox.__setElement = (id, value) => {
        const el = sandbox.document.getElementById(id);
        el.value = value;
        return el;
    };
    sandbox.__getElement = (id) => sandbox.document.getElementById(id);
}

// Extracts the inline <script>...</script> block(s) from an .html file and runs the
// combined text in a sandbox — used for money logic that still lives inside a page
// rather than a shared engine file. If that page loads shared engines via
// <script src="...">, pass their relative paths in `dependencies` so they're loaded
// into the SAME sandbox first, in order — exactly mirroring real browser load order,
// since e.g. trip.html's computeTripPointsRace calls getStrokes/parseHcp from
// money-engine.js rather than duplicating them.
// THE PAGE'S OWN <script src> TAGS, when a test does not name them.
//
// Tests used to hand-declare every shared file a page needed, and most of them
// declared none at all - which was fine only for as long as the logic under test
// happened to live inline. The moment a duplicated function moved into a shared
// module, eighty-five call sites across forty-six suites started throwing
// ReferenceError, because the harness was describing a page that no longer
// existed.
//
// So the list is now derived from the page itself, always, and anything a test
// names is loaded IN ADDITION rather than instead. A realm therefore describes
// production by default and cannot silently fall behind it again the next time a
// function moves into a shared module.
//
// A test that genuinely needs a realm missing something - the crippled-dependency
// tests that prove a page fails loudly rather than computing $0 - passes
// { only: true } and gets exactly what it asked for.
//
// The two Firebase vendor files are skipped. They are 190KB of browser SDK, every
// page loads them, and no test has ever wanted them - makeStubSandbox() supplies a
// firebase stub instead. pwa-boot.js is skipped for the same reason: it registers
// a service worker, which is not a thing a page realm should do.
const VENDOR_SKIP = /firebase-(app|database)-compat\.js$|^pwa-boot\.js$/;

function scriptsDeclaredBy(html) {
    return [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)]
        .map(m => m[1].replace(/^\.\//, ''))
        .filter(src => src.endsWith('.js') && !src.includes('//') && !src.includes('/'))
        .filter(src => !VENDOR_SKIP.test(src))
        .filter(src => fs.existsSync(path.join(REPO_ROOT, src)))
        // A page may name the same file twice; load it once, in first-seen order.
        .filter((src, i, all) => all.indexOf(src) === i);
}

// dependencies:  EXTRA files to load on top of the page's own script tags.
// options.only:   load ONLY the listed files, ignoring the page's tags. Used by
//                 the deliberately-crippled tests that prove a page fails loudly
//                 when a shared module is missing - the one situation where a
//                 realm should NOT describe production.
function loadHtmlInlineScript(relativePath, dependencies, options) {
    const fullPath = path.join(REPO_ROOT, relativePath);
    const html = fs.readFileSync(fullPath, 'utf8');
    const extra = dependencies || [];
    dependencies = (options && options.only)
        ? extra
        : scriptsDeclaredBy(html).concat(extra.filter(d => !scriptsDeclaredBy(html).includes(d)));
    const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    if (matches.length === 0) {
        throw new Error(`No inline <script> block found in ${relativePath}`);
    }
    const inlineCode = matches.map(m => m[1]).join('\n');

    const sandbox = makeStubSandbox();
    // THE PAGE'S OWN QUERY STRING. Pages read `const urlParams = new
    // URLSearchParams(window.location.search)` at load, so a param-dependent path -
    // ?setup=ryder, ?group=, ?add=1 - cannot be reached once the script has run.
    // Setting it here lets a test ARRIVE the way a browser does, rather than
    // reshaping production so a test can call into it.
    if (options && options.search) {
        sandbox.location.search = String(options.search);
    }
    // A REAL localStorage, OPT-IN. The stub above is a deliberate no-op and must
    // stay one: dozens of suites already run against its forgetfulness, and giving
    // every page memory could change them. But a test about WHEN something is
    // remembered cannot be written against a store that forgets everything - it
    // would pass whether the write happened or not. Opted into per test, and
    // installed BEFORE the page script runs, so a write on load is visible.
    if (options && options.localStorage) {
        const mem = new Map();
        sandbox.localStorage = {
            getItem: k => (mem.has(String(k)) ? mem.get(String(k)) : null),
            setItem: (k, v) => { mem.set(String(k), String(v)); },
            removeItem: k => { mem.delete(String(k)); },
            clear: () => { mem.clear(); }
        };
        if (options.seedStorage) {
            Object.keys(options.seedStorage).forEach(k =>
                mem.set(String(k), String(options.seedStorage[k])));
        }
    }
    vm.createContext(sandbox);

    // Seed every <select id="..."> from the page's own markup, with its options.
    // Production code legitimately reads, adds to and removes from sel.options; with
    // a generic div stub that threw, so any UI logic touching a dropdown was
    // untestable. Reading the tags from the real page keeps the harness honest
    // rather than requiring each test to describe its own controls.
    const selectRe = /<select\b([^>]*\bid="([^"]+)"[^>]*)>([\s\S]*?)<\/select>/gi;
    let sel;
    while ((sel = selectRe.exec(html)) !== null) {
        sandbox.document.__declare(sel[2], 'select', sel[3]);
    }

    // <details id="..."> carries its default state in the markup, and whether a
    // block starts open or collapsed is exactly the kind of thing a test needs to
    // read. Without this every details element answered `open: undefined`, so the
    // markup default was invisible and a test could only see what JS had set.
    const detailsRe = /<details\b([^>]*\bid="([^"]+)"[^>]*)>/gi;
    let det;
    while ((det = detailsRe.exec(html)) !== null) {
        const el = sandbox.document.__declare(det[2], 'details');
        el.open = /\bopen\b/.test(det[1]);
    }

    dependencies.forEach(depPath => {
        const depCode = fs.readFileSync(path.join(REPO_ROOT, depPath), 'utf8');
        vm.runInContext(depCode, sandbox, { filename: depPath });
    });

    try {
        vm.runInContext(inlineCode, sandbox, { filename: relativePath });
    } catch (e) {
        // Many of these files run top-level code on load (event listeners, initial
        // renders) that legitimately needs real DOM/Firebase — that's expected and
        // fine, since we only care that the specific functions we test are defined.
        // Only real syntax errors should actually break a test that uses this loader.
        if (e instanceof SyntaxError) throw e;
    }
    attachDomHelpers(sandbox);
    return sandbox;
}

module.exports = { loadJsFile, loadHtmlInlineScript, REPO_ROOT, MODULE_PREREQS };
