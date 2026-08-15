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

const REPO_ROOT = path.join(__dirname, '..');

// Minimal stand-ins so loading a whole <script> block doesn't throw just because
// *other* functions in that file reference document/window/db. Unlike a single shared
// stub element, getElementById here returns a DISTINCT, PERSISTENT element per id — so
// a test can pre-set specific values (document.getElementById('foo').value = '10')
// before calling a real production render function, and that function's own
// document.getElementById('foo') call sees the same value. This is what makes it
// possible to test logic that's embedded inside a DOM-dependent function (like trip.html's
// renderPrizePayouts) without modifying production code to expose it separately.
function makeStubSandbox() {
    const elementRegistry = new Map();
    function getOrCreateElement(id) {
        if (!elementRegistry.has(id)) {
            elementRegistry.set(id, {
                id, value: '', textContent: '', innerHTML: '', style: {}, checked: false,
                classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
                addEventListener() {}, appendChild() {},
                querySelector() { return getOrCreateElement(id + '__child'); },
                querySelectorAll() { return []; }
            });
        }
        return elementRegistry.get(id);
    }

    const documentStub = {
        getElementById(id) { return getOrCreateElement(id); },
        querySelector() { return getOrCreateElement('__anonymous'); },
        querySelectorAll() { return []; },
        addEventListener() {},
        createElement() { return getOrCreateElement('__created'); },
        documentElement: { classList: { add() {}, remove() {}, contains() { return false; } } }
    };
    const dbStub = {
        ref() {
            return {
                on() {}, once() { return Promise.resolve({ val() { return null; }, exists() { return false; } }); },
                set() { return Promise.resolve(); }, update() { return Promise.resolve(); },
                remove() { return Promise.resolve(); }, push() { return { key: 'TEST' }; }
            };
        }
    };
    const sandbox = {
        document: documentStub,
        window: {},
        navigator: { clipboard: { writeText() { return Promise.resolve(); } }, share: undefined },
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
