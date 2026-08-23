// ============================================================================
// MINI-DOM — a live element tree for the test harness
//
// WHY THIS EXISTS
//
// The old stub answered every DOM question with a shape rather than a fact:
// querySelectorAll() returned [], createElement() handed back one shared object,
// appendChild() did nothing, and Element.remove() did not exist at all.
//
// That let a real bug ship. "+ Add New Player" overflowed the JavaScript stack on a
// phone - updateCount() -> refreshMultiGroupMoneyRule() -> handleFormatChange() ->
// renderPlayerList() -> updateCount() - and passed 1330 tests, because with an empty
// querySelectorAll('.player-row') the render loop had nothing to iterate and the
// recursion terminated on the first pass. The harness could not see the bug because
// the harness had no rows.
//
// WHY NOT jsdom
//
// jsdom is 7 MB unpacked with a large dependency tree; linkedom is ~0.9 MB. Either
// would be MORE faithful than this file. They were rejected because this repo is
// edited by hand through GitHub's web editor on an iPad - a new dependency means
// committing package-lock.json churn by hand - and because the project has kept a
// deliberate zero-extra-test-dependency rule (targaryen, for Firebase rules, is the
// only one). The DOM surface the app actually touches is small and enumerable: four
// selector shapes and about a dozen element APIs, all listed below. If the app ever
// needs real layout, real events or real HTML parsing, swap this for jsdom rather
// than growing it.
//
// WHAT IT DELIBERATELY DOES NOT DO
//
//   - parse HTML. innerHTML is stored as a string; it does not build child nodes.
//     Tests drive the tree through createElement/appendChild, which is what the
//     production render functions do anyway.
//   - lay anything out, or implement CSS, visibility or hit-testing.
//   - dispatch real events. click() invokes registered listeners directly.
//
// Selector support is limited to what production actually queries:
//   .class          #id            tag
//   #id .class      tag.class      [attr]        :not([attr])
// ============================================================================

let AUTO = 0;

function parseSimple(sel) {
    // one compound selector -> { tag, id, classes[], attrs[], notAttrs[] }
    const out = { tag: null, id: null, classes: [], attrs: [], notAttrs: [] };
    let s = sel;
    // :not([attr]) first, so its brackets aren't eaten by the attribute pass
    s = s.replace(/:not\(\[([^\]]+)\]\)/g, (_, a) => { out.notAttrs.push(a.split('=')[0]); return ''; });
    s = s.replace(/\[([^\]]+)\]/g, (_, a) => { out.attrs.push(a.split('=')[0]); return ''; });
    const m = s.match(/^([a-zA-Z][\w-]*)?/);
    if (m && m[1]) { out.tag = m[1].toLowerCase(); s = s.slice(m[1].length); }
    s.split(/(?=[.#])/).forEach(part => {
        if (!part) return;
        if (part[0] === '.') out.classes.push(part.slice(1));
        else if (part[0] === '#') out.id = part.slice(1);
    });
    return out;
}

function matchesSimple(node, sim) {
    if (sim.tag && node.tagName.toLowerCase() !== sim.tag) return false;
    if (sim.id && node.id !== sim.id) return false;
    if (sim.classes.some(c => !node.classList.contains(c))) return false;
    if (sim.attrs.some(a => !node.hasAttribute(a))) return false;
    if (sim.notAttrs.some(a => node.hasAttribute(a))) return false;
    return true;
}

class MiniNode {
    constructor(tag) {
        this.tagName = String(tag || 'div').toUpperCase();
        this.children = [];
        this.parentNode = null;
        this._attrs = {};
        this._id = '';
        this._class = '';
        this._html = '';
        this.textContent = '';
        this.value = '';
        this.checked = false;
        this.style = {};
        this.dataset = {};
        this._listeners = {};
        this._uid = ++AUTO;

        const self = this;
        this.classList = {
            add(...cs) { cs.forEach(c => { if (c && !self._classes().includes(c)) self.className = (self._class + ' ' + c).trim(); }); },
            remove(...cs) { self.className = self._classes().filter(x => !cs.includes(x)).join(' '); },
            toggle(c, force) {
                const has = self._classes().includes(c);
                const want = (force === undefined) ? !has : !!force;
                if (want) this.add(c); else this.remove(c);
                return want;
            },
            contains(c) { return self._classes().includes(c); }
        };
    }

    _classes() { return String(this._class || '').split(/\s+/).filter(Boolean); }

    get id() { return this._id; }
    set id(v) { this._id = String(v == null ? '' : v); }
    get className() { return this._class; }
    set className(v) { this._class = String(v == null ? '' : v); }

    // innerHTML is a string here. Assigning '' is how production clears a list, so it
    // must genuinely drop the children - that is the behaviour Add Player depends on.
    get innerHTML() { return this._html; }
    set innerHTML(v) {
        this._html = String(v == null ? '' : v);
        if (this._html === '') { this.children.forEach(c => { c.parentNode = null; }); this.children = []; }
    }

    setAttribute(k, v) {
        this._attrs[k] = String(v);
        if (k === 'id') this.id = v;
        if (k === 'class') this.className = v;
        if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v);
    }
    getAttribute(k) {
        if (k === 'id') return this._id || null;
        if (k === 'class') return this._class || null;
        return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null;
    }
    hasAttribute(k) {
        if (k === 'id') return !!this._id;
        if (k === 'class') return !!this._class;
        if (k === 'disabled') return !!this.disabled || Object.prototype.hasOwnProperty.call(this._attrs, k);
        if (k === 'open') return !!this.open || Object.prototype.hasOwnProperty.call(this._attrs, k);
        return Object.prototype.hasOwnProperty.call(this._attrs, k);
    }
    removeAttribute(k) { delete this._attrs[k]; }

    appendChild(node) {
        if (!node) return node;
        if (node.parentNode) node.parentNode.removeChild(node);
        node.parentNode = this;
        this.children.push(node);
        return node;
    }
    // Production uses these to place group dividers and the sticky bar. Missing them
    // was a real gap - the tests below caught it.
    insertBefore(node, ref) {
        if (!node) return node;
        if (node.parentNode) node.parentNode.removeChild(node);
        node.parentNode = this;
        const i = ref ? this.children.indexOf(ref) : -1;
        if (i >= 0) this.children.splice(i, 0, node); else this.children.push(node);
        return node;
    }
    get firstChild() { return this.children[0] || null; }
    get lastChild() { return this.children[this.children.length - 1] || null; }

    // A <select>'s option list. Production code legitimately reads sel.options to
    // add, remove or relabel choices, and without this the stub returned undefined
    // and any such code threw inside the harness - which meant a whole class of
    // real UI behaviour could not be tested at all.
    //
    // Options declared in the page's static HTML arrive as innerHTML text rather
    // than as appended nodes, so both sources are merged: parsed <option> tags
    // first, then any element children appended since. Each parsed option is a real
    // MiniNode, so .remove() on it behaves the way production expects.
    get options() {
        if (this.tagName !== 'SELECT') return undefined;
        if (!this._parsedOptions || this._parsedOptionsFrom !== this._html) {
            const parsed = [];
            const re = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
            let m;
            while ((m = re.exec(this._html || '')) !== null) {
                const node = new MiniNode('option');
                const val = /value\s*=\s*"([^"]*)"/i.exec(m[1]);
                node.value = val ? val[1] : m[2].trim();
                node.textContent = m[2].trim();
                node.parentNode = this;
                parsed.push(node);
            }
            this._parsedOptions = parsed;
            this._parsedOptionsFrom = this._html;
        }
        const appended = this.children.filter(c => c.tagName === 'OPTION');
        const live = this._parsedOptions.filter(o => o.parentNode === this);
        return live.concat(appended);
    }
    get nextSibling() {
        if (!this.parentNode) return null;
        const i = this.parentNode.children.indexOf(this);
        return this.parentNode.children[i + 1] || null;
    }
    get previousSibling() {
        if (!this.parentNode) return null;
        const i = this.parentNode.children.indexOf(this);
        return i > 0 ? this.parentNode.children[i - 1] : null;
    }

    removeChild(node) {
        const i = this.children.indexOf(node);
        if (i >= 0) { this.children.splice(i, 1); node.parentNode = null; }
        else if (this._parsedOptions && this._parsedOptions.indexOf(node) >= 0) {
            // An <option> that came from the page's own markup rather than from
            // appendChild. Production calls opt.remove() on these, so detaching has
            // to work for them too or the option would silently survive.
            node.parentNode = null;
        }
        return node;
    }
    // The method the old stub was missing entirely.
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }

    insertAdjacentHTML(_pos, html) { this._html += String(html); }

    _walk(fn) { this.children.forEach(c => { fn(c); c._walk(fn); }); }

    querySelectorAll(selector) {
        const groups = String(selector).split(',').map(s => s.trim()).filter(Boolean);
        const hits = [];
        groups.forEach(group => {
            const parts = group.split(/\s+/).filter(Boolean).map(parseSimple);
            const last = parts[parts.length - 1];
            this._walk(node => {
                if (!matchesSimple(node, last)) return;
                // walk ancestors for the remaining (descendant) parts, right to left
                let idx = parts.length - 2, cur = node.parentNode;
                while (idx >= 0) {
                    let found = false;
                    while (cur) { if (matchesSimple(cur, parts[idx])) { found = true; cur = cur.parentNode; break; } cur = cur.parentNode; }
                    if (!found) return;
                    idx--;
                }
                if (hits.indexOf(node) < 0) hits.push(node);
            });
        });
        return hits;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }

    matches(selector) {
        return String(selector).split(',').some(s => matchesSimple(this, parseSimple(s.trim())));
    }
    closest(selector) {
        let cur = this;
        while (cur) { if (cur.matches && cur.matches(selector)) return cur; cur = cur.parentNode; }
        return null;
    }

    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
    removeEventListener(type, fn) {
        const l = this._listeners[type] || [];
        const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1);
    }
    // No real event model: listeners are invoked directly, then any inline onclick.
    click() {
        (this._listeners.click || []).forEach(fn => fn({ target: this, preventDefault() { }, stopPropagation() { } }));
        if (typeof this.onclick === 'function') this.onclick({ target: this });
    }
    focus() { }
    blur() { }
    scrollIntoView() { }
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }; }
}

// Elements are persistent per id, exactly as the previous harness guaranteed: a test
// can set document.getElementById('foo').value before calling a production function
// and that function sees the same object. Ids that exist nowhere in the tree get a
// detached element so production code finds its controls, as it did before.
function createDocument() {
    const registry = new Map();
    const root = new MiniNode('body');
    root.id = '__root';

    const doc = {
        body: root,
        documentElement: new MiniNode('html'),
        createElement(tag) { return new MiniNode(tag); },
        createTextNode(t) { const n = new MiniNode('#text'); n.textContent = String(t); return n; },
        getElementById(id) {
            const inTree = root.querySelectorAll('#' + id)[0];
            if (inTree) return inTree;
            if (!registry.has(id)) {
                const el = new MiniNode('div');
                el.id = id;
                registry.set(id, el);
            }
            return registry.get(id);
        },
        // Declares that an id belongs to a particular tag, optionally with the inner
        // markup the page ships. Used by loadHtmlInlineScript to seed <select>
        // controls so production code that reads sel.options sees the real choices
        // instead of undefined. Never overwrites an element a test already touched.
        __declare(id, tag, innerHTML) {
            if (registry.has(id)) return registry.get(id);
            const el = new MiniNode(tag);
            el.id = id;
            if (innerHTML !== undefined) el._html = String(innerHTML);
            registry.set(id, el);
            return el;
        },
        querySelector(sel) { return root.querySelector(sel); },
        querySelectorAll(sel) { return root.querySelectorAll(sel); },
        addEventListener() { },
        removeEventListener() { },
        // Lets a test place a registered element into the live tree, so selector
        // queries can find it the way they would in a browser.
        __mount(el) { return root.appendChild(el); },
        __root: root,
        __registry: registry
    };
    return doc;
}

module.exports = { MiniNode, createDocument, parseSimple, matchesSimple };
