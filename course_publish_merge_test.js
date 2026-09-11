// ============================================================================
// THE COURSE PUBLISH IS A MERGE, AND STAYS ONE.
//
// admin.html publishes the edited card to the shared course database. Today:
//
//     db.ref(`global_courses/${courseKey}`).set({ name, data })
//
// `.set()` REPLACES THE WHOLE NODE. That is harmless while a course record holds
// only name and data, and it is a silent deletion the moment a record holds
// anything else - imported tee sets, a street address, the provider id it came
// from. Measured cold in tools/course-publish-merge-check.js: a record seeded
// with ["data","location","name","source","tees"] came back as ["data","name"]
// after one ordinary save.
//
// AND IT CANNOT BE UNDONE. global_courses/$courseId carries
// ".write": "newData.exists()", so a client may create and overwrite but never
// delete. What the publish removes, no client can put back - recovery means
// importing the course again from the provider, spending the quota again, and
// hoping nobody saves in between.
//
// ---------------------------------------------------------------------------
// WHY BOTH HALVES, AND WHAT EACH ONE CANNOT SEE
// ---------------------------------------------------------------------------
//
// tools/course-publish-merge-check.js drives a real save in Chrome and reads the
// surviving record. It is the only thing that can prove the BEHAVIOUR. But it
// reaches the publish through one path - the custom-course box on the round
// wizard - and a second writer added later to another page would be invisible to
// it while destroying exactly the same data.
//
// This half reads source and holds every write to global_courses to the rule, so
// a new one is covered the day it is written. It cannot prove a merge actually
// merges; only the browser can do that. Neither half is optional.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PAGE = process.env.CPM_PAGE || 'admin.html';
const SRC = fs.readFileSync(path.join(__dirname, PAGE), 'utf8');

// Comments describe intent and quote the old code on purpose - admin.html's own
// comment block above the publish contains the words "A BARE .set()". Scanning
// raw source would match that and report a defect in a corrected file.
// LINE COMMENTS FIRST: CLAUDE.md records a stripper that took block comments
// first and ate 51,000 characters because a line comment contained a '*/'-like
// sequence. The [^:] guard keeps 'https://' from starting a comment.
function stripComments(s) {
    return String(s)
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
        .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

const CODE = stripComments(SRC);

// Every db.ref('global_courses/...') call site that mutates, with the method it
// used. Discovered rather than listed, so a second writer joins this test by
// existing.
function globalCourseWrites(code) {
    const out = [];
    const re = /db\.ref\(\s*[`'"]global_courses\/([^`'"]*)[`'"]\s*\)\s*\.\s*(set|update|remove|push)\s*\(/g;
    let m;
    while ((m = re.exec(code)) !== null) {
        out.push({ target: m[1], method: m[2], at: m.index });
    }
    return out;
}

describe('THE RULE KNOWS A WRITE FROM PROSE ABOUT ONE', () => {

    // admin.html really contains the sentence "A BARE .set() UNTIL NOW" in the
    // comment above the publish. If the scan read comments, a correctly merged
    // page would still report a .set().
    test('a comment quoting the old call is not a call', () => {
        const prose = `
            // A BARE .set() UNTIL NOW. Nothing observed this promise.
            db.ref(\`global_courses/\${courseKey}\`).update({ name, data });`;
        const found = globalCourseWrites(stripComments(prose));
        assert.equal(found.length, 1, 'expected exactly one real call, got ' + JSON.stringify(found));
        assert.equal(found[0].method, 'update',
            'the commented-out .set was read as the live call');
    });

    test('a real .set IS caught', () => {
        const found = globalCourseWrites(stripComments(
            'db.ref(`global_courses/${k}`).set({ name, data });'));
        assert.equal(found.length, 1);
        assert.equal(found[0].method, 'set');
    });

    test('a write to a different root is not this rule\'s business', () => {
        assert.deepEqual(globalCourseWrites(stripComments(
            'db.ref(`events/${code}`).set({ a: 1 });')), []);
    });

    test('a READ is not a write', () => {
        assert.deepEqual(globalCourseWrites(stripComments(
            "db.ref('global_courses').on('value', cb);")), []);
    });
});

describe('THE SCAN CAN SEE THE PUBLISH AT ALL', () => {

    // POSITIVE FIRST. Every assertion below is "no write does X", and every one
    // of them is true of a file in which the scan found nothing. That is
    // CLAUDE.md's empty-slice failure, and this is the assertion that prevents it.
    test('the publish call site is found', () => {
        const writes = globalCourseWrites(CODE);
        assert.ok(writes.length > 0,
            `no global_courses write was found in ${PAGE}. Every assertion below would pass `
            + 'against an empty list, so this guard would be protecting nothing.');
        assert.ok(writes.some((w) => /\$\{courseKey\}/.test(w.target)),
            'the publish keyed on ${courseKey} is not among the writes found: '
            + JSON.stringify(writes));
    });

    test('the publish is still gated on the custom-course edit', () => {
        // If this gate disappears, every save republishes and the blast radius of
        // a wrong method goes from "golfers who edit a card" to "everyone".
        assert.match(CODE, /if\s*\(\s*preview\.isEditing\s*\)/,
            'the publish is no longer gated on preview.isEditing');
    });
});

describe('NO PUBLISH REPLACES THE WHOLE COURSE RECORD', () => {

    test('every global_courses write is a merge, not an overwrite', () => {
        const offenders = globalCourseWrites(CODE).filter((w) => w.method === 'set');
        assert.deepEqual(offenders.map((w) => w.target), [],
            'a course publish uses .set(), which replaces the whole node and silently deletes '
            + 'every child it does not name - tees, location, source. Measured: a record seeded '
            + 'with ["data","location","name","source","tees"] came back ["data","name"]. '
            + 'global_courses/$courseId is ".write": "newData.exists()", so no client can put '
            + 'back what this removes.\n  ' + JSON.stringify(offenders));
    });

    test('nothing removes a course record, because the rules refuse it anyway', () => {
        // A .remove() here cannot succeed - the deployed rule requires
        // newData.exists() - so one would be a write that always fails, and the
        // organizer would be told nothing useful.
        const removes = globalCourseWrites(CODE).filter((w) => w.method === 'remove');
        assert.deepEqual(removes, [],
            'a client attempts to delete a course record. The deployed rules refuse that, so '
            + 'it can only ever fail.');
    });

    test('the publish payload is exactly name and data', () => {
        // An .update() only protects the children it does NOT name. Widening the
        // payload silently re-acquires the overwrite for whatever was added.
        const at = CODE.indexOf('global_courses/${courseKey}');
        assert.ok(at > 0, 'the publish call site moved; this assertion is reading the wrong region');
        const region = CODE.slice(at, at + 320);
        assert.match(region, /name\s*:/, 'the publish no longer writes name');
        assert.match(region, /data\s*:/, 'the publish no longer writes data');
        const keys = [...region.matchAll(/^\s*([a-zA-Z_$][\w$]*)\s*:/gm)].map((m) => m[1]);
        assert.deepEqual(keys.sort(), ['data', 'name'],
            'the publish payload carries keys beyond name and data: ' + JSON.stringify(keys)
            + '. Each extra key is overwritten wholesale on every save, which is the defect '
            + 'this file exists to prevent, one child at a time.');
    });
});

describe('BOTH WRITE SITES ARE COVERED - THE PUBLISH AND THE IMPORT', () => {

    // THERE ARE TWO WRITERS TO global_courses NOW, and the assertions above were
    // written when there was one. `indexOf` finds the FIRST occurrence, so
    // whichever site appears earlier in the file would silently become the only
    // one checked - and the other could carry a `.set()`, or a payload that
    // overwrites a child it does not name, with nothing to notice.
    //
    // The method rule already covers every site, because it DISCOVERS them. The
    // payload rule did not, and this block is that gap closed.

    const siteFor = (keyExpr) => {
        const at = CODE.indexOf('global_courses/' + keyExpr);
        return at > -1 ? CODE.slice(at, at + 420) : null;
    };
    const payloadKeys = (region) =>
        [...region.matchAll(/^\s*([a-zA-Z_$][\w$]*)\s*:/gm)].map((m) => m[1]).sort();

    test('there are exactly the two write sites we know about', () => {
        const writes = globalCourseWrites(CODE);
        const targets = [...new Set(writes.map((w) => w.target))].sort();
        assert.deepEqual(targets, ['${courseKey}', '${importKey}'],
            'the set of global_courses write targets changed. Every one of them needs a payload '
            + 'rule below, or it is a write nothing checks - into a node no client can delete.\n'
            + '  found: ' + JSON.stringify(targets));
    });

    test('the ROUND PUBLISH still writes exactly name and data', () => {
        const region = siteFor('${courseKey}');
        assert.ok(region, 'the round publish site is gone');
        assert.deepEqual(payloadKeys(region), ['data', 'name'],
            'the publish payload grew. .update() only protects the children it does NOT name, '
            + 'so every key added here is a child it starts overwriting wholesale - which is '
            + 'the defect this file exists for, re-acquired one field at a time.');
    });

    test('the IMPORT writes the record buildImportRecord produced, not a hand-built one', () => {
        const region = siteFor('${importKey}');
        assert.ok(region, 'the import write site was not found');

        // NOT A LITERAL KEY LIST, and the difference matters. An earlier version
        // of this asserted the import payload was inline with exactly five named
        // keys - which is a constraint on how the code is WRITTEN, not on what it
        // does, and it would have forced the record to be assembled at the call
        // site rather than by the builder that course_import_test.js pins.
        //
        // The shape is already guarded there, by calling buildImportRecord and
        // checking what comes back. What THIS file uniquely protects is that the
        // write goes through that builder rather than around it - a second,
        // hand-assembled payload is how the two would drift.
        assert.match(region, /buildImportRecord\(|importRecord\b|\brec\b/,
            'the import write does not hand over a record built by buildImportRecord. A '
            + 'payload assembled at the call site is a second definition of the record shape, '
            + 'and the one in course_import_test.js would stop describing what is written.');
    });

    test('BOTH sites use .update, neither uses .set', () => {
        const writes = globalCourseWrites(CODE);
        const bad = writes.filter((w) => w.method !== 'update');
        assert.deepEqual(bad, [],
            'a global_courses write is not a merge: ' + JSON.stringify(bad));
        assert.equal(writes.length >= 2, true,
            'fewer than two write sites found, so "both are covered" is true of one');
    });
});

describe('THE UNTRIMMED SEAM SURVIVES', () => {

    // A nine-hole round must not shorten or rename the course for everyone else.
    // The behaviour is measured in the cold check; this pins the seam that makes
    // it possible, so a refactor cannot quietly publish the trimmed card.
    test('the publish writes the UNTRIMMED card', () => {
        const at = CODE.indexOf('global_courses/${courseKey}');
        const region = CODE.slice(at, at + 320);
        assert.match(region, /preview\.untrimmed/,
            'the publish no longer writes preview.untrimmed. preview.data is the card AFTER the '
            + 'front/back-nine trim - publishing it would shorten the shared course to nine '
            + 'holes for every future group.');
        assert.ok(!/preview\.data\b/.test(region),
            'the publish region references preview.data, the trimmed card');
    });

    test('previewCourseData still distinguishes the two', () => {
        assert.match(CODE, /out\.untrimmed\s*=\s*built/,
            'previewCourseData no longer captures the untrimmed card, so there is no seam left '
            + 'for the publish to use');
    });
});
