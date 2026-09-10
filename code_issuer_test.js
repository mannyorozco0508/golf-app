// ============================================================================
// A CODE THAT ALREADY EXISTS MUST NOT BE HANDED OUT AGAIN.
//
// createRoom() generates six characters and navigates straight to them:
//
//     const newCode = generateRoomCode();
//     window.location.href = `admin.html?game=${newCode}&...`;
//
// Nothing is read. Nothing is reserved. Two organizers can land on one code,
// and the round save is db.ref(`events/${code}`).update(payload) - a MERGE, not
// an overwrite. Measured: B's payload replaces players and courseData but does
// NOT contain scores, so A's scores survive as ORPHANS keyed to player ids that
// are no longer in the roster. A's card empties mid-round while the data sits
// unreachable in the database, and A's side matches and audit log keep pointing
// at people who are not there.
//
// THE DEPLOYED RULES DO NOT CATCH THIS. Measured against database.rules.json:
// overwriting players on a scored round is ALLOWED, overwriting courseData is
// ALLOWED, replacing the whole round with set() is ALLOWED. Only a DELETE is
// refused. A collision is not a delete.
//
// TRIPS ARE WORSE. The batch builder writes trips/<code>/rounds/<roundCode> as
// MERGE keys, so a colliding trip code puts two unrelated groups' rounds into
// ONE trip - and trip settlement nets money across every round in a trip.
//
// THE ARITHMETIC SAYS THIS IS REMOTE: 32^6 is 1,073,741,824, so a new code hits
// an existing one about once in a million at a thousand existing codes. This
// file exists because the DAMAGE is disproportionate to the odds, not because
// the odds are alarming.
//
// WHY THE CHECK MUST HAPPEN AT GENERATION TIME. createRoom navigates BEFORE
// anything is written - the round does not exist until Save & Start Round, by
// which point the organizer has typed a roster. Checking at save time would
// mean discovering the collision after the work, and the wizard has nowhere to
// put that. The check belongs beside the generator.
//
// THIS FILE IS RED UNTIL code-issuer.js EXISTS. It was written first, and it
// pins the interface the next wave has to build:
//
//     issueUniqueCode({ db, root, generate, maxAttempts, reserved })
//       -> Promise<string>
//
//   db          anything with .ref(path).once('value') -> { exists() }
//   root        'events' | 'trips' | 'tournaments' - each checked against ITS
//               OWN node, because a round code colliding with a trip code is
//               not the same failure and must not be treated as one
//   generate    the code generator, injected so the test can force collisions
//   maxAttempts a BOUND. Exhausting it must reject, not loop and not proceed
//   reserved    optional Set for in-memory dedupe within one batch, so the
//               trip builder's existing layer keeps working alongside the
//               database check
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const MODULE = path.join(__dirname, 'code-issuer.js');

// A database stand-in. `present` is the set of codes that already exist, keyed
// by full path, so a test can put ABC in events and prove it is still free in
// trips - which is the whole point of checking each root separately.
function fakeDb(present) {
    const reads = [];
    return {
        reads,
        ref(p) {
            reads.push(p);
            return { once: () => Promise.resolve({ exists: () => present.has(p) }) };
        }
    };
}

// A generator that hands out a scripted sequence, so a collision is not left to
// chance. Falls back to a unique value once the script runs out.
function scripted(seq) {
    let i = 0;
    return () => (i < seq.length ? seq[i++] : 'FREE' + (i++));
}

function load() {
    if (!fs.existsSync(MODULE)) {
        assert.fail('code-issuer.js does not exist yet. This file was written first, '
            + 'and it pins the interface the fix has to build: '
            + 'issueUniqueCode({ db, root, generate, maxAttempts, reserved }).');
    }
    // Plain require: the module must work in node AND as a page <script>, the
    // way the other shared files do.
    return require(MODULE);
}

describe('CODE ISSUER — a code in use is never handed out again', () => {

    test('the module exists and exports issueUniqueCode', () => {
        const m = load();
        assert.equal(typeof m.issueUniqueCode, 'function',
            'the shared issuer is the whole point - three copies of a generator with no '
            + 'check is what created this');
    });

    test('a free code is returned unchanged, and the right node was read', async () => {
        const m = load();
        const db = fakeDb(new Set());
        const code = await m.issueUniqueCode({ db, root: 'events', generate: scripted(['AAAAAA']) });
        assert.equal(code, 'AAAAAA');
        assert.deepEqual(db.reads, ['events/AAAAAA'],
            'exactly one existence read, against the root it was asked for');
    });

    test('a code that already exists is rejected and regenerated', async () => {
        const m = load();
        const db = fakeDb(new Set(['events/TAKEN1', 'events/TAKEN2']));
        const code = await m.issueUniqueCode({
            db, root: 'events', generate: scripted(['TAKEN1', 'TAKEN2', 'FREE01'])
        });
        assert.equal(code, 'FREE01', 'it must skip both taken codes');
        assert.deepEqual(db.reads, ['events/TAKEN1', 'events/TAKEN2', 'events/FREE01'],
            'each candidate is checked in turn');
    });

    test('the retry is BOUNDED, and exhausting it rejects rather than proceeding', async () => {
        const m = load();
        // Every code exists. A bound-less implementation hangs here forever.
        const db = { ref: () => ({ once: () => Promise.resolve({ exists: () => true }) }) };
        await assert.rejects(
            () => m.issueUniqueCode({ db, root: 'events', generate: () => 'ZZZZZZ', maxAttempts: 5 }),
            (err) => {
                assert.ok(err instanceof Error);
                assert.match(String(err.message), /code/i,
                    'the error has to say what could not be issued');
                return true;
            },
            'exhausting the bound must REJECT. Returning a colliding code anyway would be '
            + 'worse than no check at all, because the caller would believe it was checked.');
    });

    test('the bound is honoured exactly, not approximately', async () => {
        const m = load();
        let tries = 0;
        const db = { ref: () => ({ once: () => Promise.resolve({ exists: () => true }) }) };
        await m.issueUniqueCode({
            db, root: 'events', maxAttempts: 3,
            generate: () => { tries++; return 'ZZZZZZ'; }
        }).catch(() => {});
        assert.equal(tries, 3, `generated ${tries} times for maxAttempts 3`);
    });

    test('each root is checked against ITS OWN node', async () => {
        const m = load();
        // ABC123 is taken in events. It must still be free for a trip: a round
        // code colliding with a trip code is not a collision at all.
        const db = fakeDb(new Set(['events/ABC123']));
        const trip = await m.issueUniqueCode({ db, root: 'trips', generate: scripted(['ABC123']) });
        assert.equal(trip, 'ABC123', 'events and trips are different namespaces');
        assert.deepEqual(db.reads, ['trips/ABC123'], 'and only the trips node was read');
    });

    test('tournaments are checked too, against tournaments/', async () => {
        const m = load();
        const db = fakeDb(new Set(['tournaments/TAKEN1']));
        const code = await m.issueUniqueCode({
            db, root: 'tournaments', generate: scripted(['TAKEN1', 'FREE01'])
        });
        assert.equal(code, 'FREE01');
        assert.ok(db.reads.every((p) => p.startsWith('tournaments/')),
            'a tournament must never be checked against events/');
    });

    test('an unknown root is refused rather than guessed at', async () => {
        const m = load();
        const db = fakeDb(new Set());
        await assert.rejects(
            () => m.issueUniqueCode({ db, root: 'hacked_data', generate: scripted(['AAAAAA']) }),
            /root/i,
            'the three roots are the three that exist; a typo must not silently check nothing');
    });
});

describe('CODE ISSUER — the in-memory layer the trip builder already has', () => {

    test('a reserved code is skipped even when the database says it is free', async () => {
        const m = load();
        // trip.html:831 dedupes within one build with a Set. That layer must keep
        // working: the database cannot know about codes this batch has issued but
        // not yet written.
        const db = fakeDb(new Set());
        const code = await m.issueUniqueCode({
            db, root: 'trips', reserved: new Set(['DUPE01']),
            generate: scripted(['DUPE01', 'FREE01'])
        });
        assert.equal(code, 'FREE01',
            'the batch has already issued DUPE01 and has not written it yet - the database '
            + 'says free and it is not');
    });

    test('BOTH layers hold together', async () => {
        const m = load();
        // First candidate collides in the database, second collides in memory,
        // third is genuinely free. Either layer alone would hand out a duplicate.
        const db = fakeDb(new Set(['trips/INDB01']));
        const code = await m.issueUniqueCode({
            db, root: 'trips', reserved: new Set(['INMEM1']),
            generate: scripted(['INDB01', 'INMEM1', 'FREE01'])
        });
        assert.equal(code, 'FREE01');
    });

    test('the issuer adds what it issues to the reserved set', async () => {
        const m = load();
        const db = fakeDb(new Set());
        const reserved = new Set();
        const a = await m.issueUniqueCode({ db, root: 'trips', reserved, generate: scripted(['AAAAAA']) });
        assert.ok(reserved.has(a),
            'otherwise the caller has to remember, and trip.html builds five rounds in a loop');
        const b = await m.issueUniqueCode({
            db, root: 'trips', reserved, generate: scripted(['AAAAAA', 'BBBBBB'])
        });
        assert.equal(b, 'BBBBBB', 'the second call must not reissue the first code');
    });
});

describe('CODE ISSUER — the callers use it, at GENERATION time', () => {

    const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

    test('all three pages load the shared module', () => {
        ['admin.html', 'trip.html', 'tournament.html'].forEach((f) => {
            assert.match(read(f), /<script src="code-issuer\.js"><\/script>/,
                `${f} must load the shared issuer rather than keep its own generator`);
        });
    });

    test('createRoom issues a checked code before it navigates', () => {
        // THE ORDERING IS THE POINT. createRoom navigates before anything is
        // written, so a save-time check would find the collision after the
        // organizer has typed a roster.
        const src = read('admin.html');
        const at = src.indexOf('function createRoom');
        assert.notEqual(at, -1, 'createRoom must still exist');
        const body = src.slice(at, src.indexOf('\n    }', at));
        assert.match(body, /issueUniqueCode/,
            'createRoom must ask the issuer, not the bare generator');
        assert.ok(body.indexOf('issueUniqueCode') < body.indexOf('location.href'),
            'the check has to complete BEFORE the navigation, or it is not a check');
    });

    test('the trip builder and the tournament creator use it too', () => {
        assert.match(read('trip.html'), /issueUniqueCode/,
            'both the batch builder and the blank-trip path');
        assert.match(read('tournament.html'), /issueUniqueCode/);
    });

    test('no page keeps a private generator that skips the check', () => {
        // Three byte-identical copies with no check is what caused this. One
        // definition, or the next edit fixes two of three.
        ['admin.html', 'trip.html', 'tournament.html'].forEach((f) => {
            const src = read(f);
            assert.doesNotMatch(src, /chars\.charAt\(Math\.floor\(Math\.random\(\)/,
                `${f} still contains its own inline generator loop`);
        });
    });
});
