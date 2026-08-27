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
    const dbStub = {
        ref() {
            // push() returns a FULL reference, as real Firebase does. It used to hand
            // back { key: 'TEST' } only, so any production path that pushed and then
            // set - logAuditEntry() does exactly that, and saveScore() calls it -
            // died on "logRef.set is not a function". Nothing was wrong with the
            // production code; the stub simply could not model it, which made
            // saveScore() untestable. Strictly more capable than before: callers that
            // only read .key are unaffected.
            const ref = {
                key: 'TEST',
                on() {}, once() { return Promise.resolve({ val() { return null; }, exists() { return false; } }); },
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
        firebase: { initializeApp() {}, database() { return dbStub; } },
        db: dbStub,
        alert() {}, confirm() { return true; }, prompt() { return null; },
        URLSearchParams: URLSearchParams,
        console: console,
        Math: Math, Date: Date, Array: Array, Object: Object, JSON: JSON,
        Set: Set, Map: Map,
        __elementRegistry: elementRegistry, // exposed so tests can inspect rendered output directly
    };
    sandbox.window = sandbox;
    return sandbox;
}

// Loads a plain, standalone .js file (money-engine.js, tournament-engine.js,
// course-data.js) — these already run at global scope with no DOM/Firebase
// references, so no extraction is needed, just execution in a sandbox.
function loadJsFile(relativePath) {
    const fullPath = path.join(REPO_ROOT, relativePath);
    const code = fs.readFileSync(fullPath, 'utf8');
    const sandbox = makeStubSandbox();
    vm.createContext(sandbox);
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
function loadHtmlInlineScript(relativePath, dependencies = []) {
    const fullPath = path.join(REPO_ROOT, relativePath);
    const html = fs.readFileSync(fullPath, 'utf8');
    const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    if (matches.length === 0) {
        throw new Error(`No inline <script> block found in ${relativePath}`);
    }
    const inlineCode = matches.map(m => m[1]).join('\n');

    const sandbox = makeStubSandbox();
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

module.exports = { loadJsFile, loadHtmlInlineScript, REPO_ROOT };
