// Counts the tests a suite file REGISTERS, without running one of them.
//
// Why this exists: `grep -c "test("` is not a count. landing_focus_test.js has 14
// test( declarations and registers 16, because one forEach generates three. A guard
// that reconciles a stated baseline against a guessed count is the same defect it is
// trying to catch, one level up.
//
// How: `node:test` is swapped for a stand-in before the file is loaded. describe()
// runs its body, so tests nested inside it register; test()/it() only increment a
// counter and NEVER call the body, so nothing the file measures actually runs - no
// Chrome, no fixtures, no network. Hooks (before/after/...) register and never fire.
//
// Run as a child process: `node helpers/count-tests.js <file>` prints the count on
// stdout and exits 0, or prints the failure on stderr and exits 1. Loading a suite
// file mutates globals, so counting several files in one process is not safe.
'use strict';

function install() {
    const Module = require('module');
    let count = 0;
    const noop = function () { };
    const api = {};
    const runBody = (name, fn) => {
        // describe(name, fn) or describe(name, opts, fn)
        const body = typeof fn === 'function' ? fn : (typeof name === 'function' ? name : null);
        if (body) body.call({});
    };
    api.describe = function (name, a, b) { runBody(name, typeof a === 'function' ? a : b); };
    api.suite = api.describe;
    api.describe.only = api.describe; api.describe.skip = noop; api.describe.todo = noop;
    api.test = function () { count += 1; };
    api.test.only = api.test; api.test.skip = api.test; api.test.todo = api.test;
    api.it = api.test;
    api.before = noop; api.after = noop; api.beforeEach = noop; api.afterEach = noop;
    api.mock = { fn: () => noop, method: noop, restoreAll: noop, reset: noop };
    api.default = api;

    const orig = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'node:test' || request === 'test') return api;
        return orig.apply(this, arguments);
    };
    return () => count;
}

if (require.main === module) {
    const path = require('path');
    const target = process.argv[2];
    if (!target) { process.stderr.write('usage: count-tests.js <suite file>\n'); process.exit(1); }
    const read = install();
    try {
        require(path.resolve(target));
    } catch (e) {
        process.stderr.write('could not load ' + target + ': ' + (e && e.message) + '\n');
        process.exit(1);
    }
    process.stdout.write(String(read()) + '\n');
    process.exit(0);
}

module.exports = { install };
