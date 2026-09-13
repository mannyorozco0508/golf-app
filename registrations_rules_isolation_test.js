// ============================================================================
// THE registrations RULES BLOCK IS THE THING REFUSING - proved with it switched
// off.
//
// WHY THIS FILE EXISTS. Every cannotRead / cannotWrite row under registrations/
// in security-rules.tests-data.json was GREEN BEFORE THE BLOCK EXISTED. The
// `$other` catch-all at the bottom of database.rules.json refuses everything it
// covers, so a registrations node with no rules of its own is already
// unreadable and unwritable. When the block landed the same rows stayed green,
// which proves nothing about the block: a refusal from `$other` and a refusal
// from the ownerUid clause look identical in a verdict table.
//
// CLAUDE.md: "Defence in depth has to be provable with the other rules switched
// off." So this file stubs the registrations block PERMISSIVE - the whole
// block replaced by {".read": true, ".write": true}, no validate - in a temp
// copy and runs the SAME data file. Every negative registrations row must go
// RED against the stub, which is the only way to show that each one is refused
// by the block and not by the catch-all. And the clean file must keep them
// green, so a block that refused everything could not satisfy this.
//
// A negative row that stays green against the permissive stub is INERT - it is
// being refused by something else - and gets fixed, not accepted.
//
// The row list is read from the data file, not typed here, so a row added
// later is covered without anyone remembering this file. The parser is the
// one from gca_provenance_rules_test.js, and the same lesson applies: it is
// proved live below by requiring the stub run to produce red rows at all.
// ============================================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = __dirname;
const TARGARYEN = path.join(REPO, 'node_modules', '.bin', 'targaryen');
const REAL_RULES = path.join(REPO, 'database.rules.json');
const DATA_PATH = path.join(REPO, 'security-rules.tests-data.json');

function runTargaryen(rulesPath) {
    try {
        // stderr piped, not inherited: the stubbed run is SUPPOSED to fail and
        // targaryen narrates every failure there in red.
        return { exitCode: 0, output: execFileSync(TARGARYEN, [rulesPath, DATA_PATH, '--verbose'],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
    } catch (e) {
        return { exitCode: e.status, output: (e.stdout || '') + (e.stderr || '') };
    }
}

// Every verdict row, in table order, as { path, op, auth, expect, got }. NOT
// keyed by path: the same path/op/auth triple appears more than once (two
// cannotWrite rows for nobody on the same entry differ only in payload), and
// a map would silently drop one.
const TICK = '\u2713';
const CROSS = '\u2716';
const stripAnsi = (s) => String(s).replace(/\u001b\[[0-9;]*m/g, '');
function verdictRows(output) {
    return stripAnsi(output).split('\n')
        .filter((l) => l.indexOf('\u2502') > -1)
        .map((l) => l.split('\u2502').map((c) => c.trim()).filter((c) => c !== ''))
        .filter((c) => c.length >= 5
            && [TICK, CROSS].indexOf(c[c.length - 2]) > -1
            && [TICK, CROSS].indexOf(c[c.length - 1]) > -1)
        .map((c) => ({ path: c[0], op: c[1], auth: c[2], expect: c[c.length - 2], got: c[c.length - 1] }));
}
const isReg = (r) => /^registrations(\/|$)/.test(r.path);
const label = (r) => `${r.path} ${r.op} ${r.auth} expect ${r.expect}`;

// The negative rows the DATA FILE declares under registrations/, counted
// independently of the table so the two can be held against each other.
function declaredRegistrationRows() {
    const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    let negative = 0, positive = 0;
    Object.entries(data.tests).forEach(([k, v]) => {
        if (!/^registrations(\/|$)/.test(k)) return;
        negative += (v.cannotRead || []).length + (v.cannotWrite || []).length;
        positive += (v.canRead || []).length + (v.canWrite || []).length;
    });
    return { negative, positive };
}

function buildPermissiveCopy() {
    const rules = JSON.parse(fs.readFileSync(REAL_RULES, 'utf8'));
    assert.ok(rules.rules.registrations, 'database.rules.json has no registrations block to stub');
    rules.rules.registrations = { '.read': true, '.write': true };
    const p = path.join(os.tmpdir(), 'registrations-permissive-' + process.pid + '.json');
    fs.writeFileSync(p, JSON.stringify(rules, null, 2));
    return p;
}

let CLEAN = null;
let STUBBED = null;
let STUB_PATH = null;

before(() => {
    CLEAN = runTargaryen(REAL_RULES);
    STUB_PATH = buildPermissiveCopy();
    STUBBED = runTargaryen(STUB_PATH);
});
after(() => { try { fs.unlinkSync(STUB_PATH); } catch (e) { /* already gone */ } });

describe('THE HARNESS IS REALLY RUNNING', () => {

    test('both runs produced a verdict table with every declared row in it', () => {
        const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
        const declared = Object.values(data.tests).reduce((n, v) =>
            n + ['canRead', 'cannotRead', 'canWrite', 'cannotWrite'].reduce((m, k) => m + (v[k] || []).length, 0), 0);
        assert.ok(declared >= 100, 'the data file declares ' + declared + ' rows; this file expects the full suite');
        assert.equal(verdictRows(CLEAN.output).length, declared, 'clean run: parsed rows != declared rows');
        assert.equal(verdictRows(STUBBED.output).length, declared, 'stubbed run: parsed rows != declared rows');
    });

    test('the real file is NOT the stub - its registrations block reads ownerUid', () => {
        // Guards the shortcut of making the real block permissive to get a red
        // control green, and the drift of a temp copy measuring something else.
        const real = JSON.parse(fs.readFileSync(REAL_RULES, 'utf8')).rules.registrations;
        assert.match(real.$code['.read'], /ownerUid/, 'registrations/$code .read no longer names ownerUid');
        assert.match(real.$code.$entryId['.write'], /ownerUid/, 'registrations/$code/$entryId .write no longer names ownerUid');
        const stub = JSON.parse(fs.readFileSync(STUB_PATH, 'utf8')).rules;
        assert.deepEqual(Object.keys(stub.registrations).sort(), ['.read', '.write']);
        assert.equal(stub.registrations['.read'], true);
        assert.equal(stub.registrations['.write'], true);
        // and NOTHING ELSE differs between the copy and the real file
        const realRest = JSON.parse(fs.readFileSync(REAL_RULES, 'utf8')).rules; delete realRest.registrations;
        const stubRest = stub; delete stubRest.registrations;
        assert.deepEqual(stubRest, realRest, 'the stub copy differs from the real file outside registrations');
    });

    test('THE PARSER FIRES: the permissive stub produced red rows at all', () => {
        assert.notEqual(STUBBED.exitCode, 0, 'a registrations block of true/true failed no scenario - targaryen is not evaluating it');
        const red = verdictRows(STUBBED.output).filter((r) => r.expect !== r.got);
        assert.ok(red.length > 0, 'the stub run has failures but the parser sees none - every assertion below is inert');
    });
});

describe('THE ISOLATION CONTROL - registrations refused BY the block, not by $other', () => {

    test('the CLEAN file is green on every row, registrations included', () => {
        const rows = verdictRows(CLEAN.output);
        const red = rows.filter((r) => r.expect !== r.got).map(label);
        assert.equal(red.length, 0, 'clean file red on:\n  ' + red.join('\n  '));
        assert.equal(CLEAN.exitCode, 0);
        const positives = rows.filter((r) => isReg(r) && r.expect === TICK);
        assert.ok(positives.length >= 3, 'no positive registrations rows: a block that refuses everything would pass the rest of this file');
    });

    test('EVERY negative registrations row goes RED with the block stubbed permissive', () => {
        const rows = verdictRows(STUBBED.output).filter(isReg);
        const negatives = rows.filter((r) => r.expect === CROSS);
        const declared = declaredRegistrationRows();
        assert.equal(negatives.length, declared.negative,
            'the table shows ' + negatives.length + ' negative registrations rows, the data file declares ' + declared.negative);
        const inert = negatives.filter((r) => r.got === CROSS).map(label);
        assert.equal(inert.length, 0,
            inert.length + ' negative row(s) STILL REFUSED with the block wide open - refused by something '
            + 'other than the registrations rules, so they prove nothing about them:\n  ' + inert.join('\n  '));
        const red = negatives.filter((r) => r.got === TICK);
        assert.equal(red.length, declared.negative, 'expected all ' + declared.negative + ' negative rows red, got ' + red.length);
    });

    test('the positive registrations rows stay green under the stub - the stub is permissive, not broken', () => {
        const rows = verdictRows(STUBBED.output).filter(isReg);
        const positives = rows.filter((r) => r.expect === TICK);
        assert.equal(positives.length, declaredRegistrationRows().positive);
        const red = positives.filter((r) => r.got !== TICK).map(label);
        assert.equal(red.length, 0, 'a permissive stub refused:\n  ' + red.join('\n  '));
    });

    test('and NO row outside registrations/ moved - the stub touched only its block', () => {
        const clean = verdictRows(CLEAN.output).filter((r) => !isReg(r));
        const stubbed = verdictRows(STUBBED.output).filter((r) => !isReg(r));
        assert.equal(stubbed.length, clean.length);
        const moved = stubbed.filter((r, i) => r.got !== clean[i].got).map(label);
        assert.equal(moved.length, 0, 'rows outside registrations changed verdict under the stub:\n  ' + moved.join('\n  '));
        assert.ok(clean.length >= 90, 'only ' + clean.length + ' rows outside registrations - the tournaments rows are missing');
    });
});
