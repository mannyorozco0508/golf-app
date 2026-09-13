// ============================================================================
// GAME CODES ARE 6 CHARACTERS
//
// A round, trip or tournament was identified by a 4-character code drawn from a
// 32-character alphabet: 1,048,576 possibilities. There is no listing endpoint -
// every db.ref call names a specific code - so an attacker must guess one at a
// time against a live database. But a million is a small number for a machine,
// and a hit grants full read and write to that round: scores, players, wagers.
//
// Six characters raises that to 1,073,741,824 - a 1,024x improvement - and needs
// no other change, because the entry fields already accept up to 6 and nothing
// in the app or the security rules assumes a length.
//
// SEVEN WAS REJECTED: every code input carries maxlength="6", so a 7-character
// code could be generated and linked but never typed. Joining, duplicating and
// trip-join would all silently truncate.
//
// NOTHING IS MIGRATED. Existing 4-character rounds, trips and tournaments still
// load and join exactly as before - joinRoom only rejects codes shorter than 2
// characters, and $eventCode / $tripCode / $tourneyCode are rules wildcards.
//
// Collisions are asserted STRUCTURALLY - alphabet size to the power of length -
// rather than by sampling. A statistical test of a random generator would be
// slow, flaky, and would prove less than the arithmetic does.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

const SAFE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

// The three generators, and how to reach each one.
// ONE GENERATOR NOW. admin.html, trip.html and tournament.html each carried a
// byte-identical copy of this loop and none of them checked whether the code was
// already in use. They are gone; code-issuer.js is the only source.
//
// THE ASSERTIONS BELOW GOT STRONGER, NOT WEAKER, BECAUSE OF THAT. Reading three
// copies could only ever ask "do these agree" - it could not test the generator
// against real output at volume, because each page-hosted copy had to be run
// inside its own vm with five engine dependencies loaded. One require() runs it
// 200,000 times in a second, so the sample is a thousand times larger, the
// alphabet is checked for UNIFORMITY rather than mere membership, and the
// rejection-sampling guarantee - which no source read can see - is measured.
const { generateCode } = require('./code-issuer.js');

// The page dependency lists the link tests still need in order to load a page's
// inline script. They no longer describe generators - there is one of those, in
// code-issuer.js - only what each page must have loaded to run at all.
const ADMIN_DEPS = ['money-engine.js','action-model.js','settlement-engine.js','pool-engine.js','score-marks.js'];
const TRIP_DEPS  = ['money-engine.js','action-model.js','settlement-engine.js'];

// Real output, at volume. This used to be 200 codes per page through a vm.
function generate(times) {
    const out = [];
    for (let i = 0; i < (times || 20000); i++) out.push(generateCode());
    return out;
}

// The one generator's own source, so length and alphabet can be read as written.
function generatorSource() {
    const src = read('code-issuer.js');
    assert.ok(src.length > 1000, 'code-issuer.js must exist and be the real file');
    return src;
}
const inputMaxLengths = () => {
    const found = [];
    ['admin.html','trip.html'].forEach(f => {
        const src = read(f);
        [...src.matchAll(/<input[^>]*id="([^"]*(?:room|trip)-input[^"]*)"[^>]*>/g)].forEach(m => {
            const ml = m[0].match(/maxlength="(\d+)"/);
            found.push({ file: f, id: m[1], max: ml ? Number(ml[1]) : null });
        });
    });
    return found;
};

// ============================================================================

describe('THE ONE GENERATOR PRODUCES SIX CHARACTERS', () => {

    test(`every code is exactly ${CODE_LENGTH} characters, over 20,000 of them`, () => {
        const codes = generate();
        assert.equal(codes.length, 20000, 'the generator must actually run');
        const wrong = codes.filter(c => c.length !== CODE_LENGTH);
        assert.deepEqual(wrong, [], `${wrong.length} codes were not ${CODE_LENGTH} characters`);
    });

    test(`the written bound is ${CODE_LENGTH}, not just the output`, () => {
        // A generator that happened to return 6 characters some other way would
        // still be a change nobody intended.
        assert.match(generatorSource(), new RegExp('LENGTH = ' + CODE_LENGTH + ';'),
            'code-issuer.js must declare the length');
    });

    test('the maxlength on every code input still matches the length issued', () => {
        // Seven characters could be generated and linked but never typed.
        inputMaxLengths().forEach(f => {
            if (f.max === null) return;
            assert.ok(f.max >= CODE_LENGTH,
                `${f.file} #${f.id} has maxlength ${f.max} but codes are ${CODE_LENGTH}`);
        });
    });
});

describe('THE SAFE ALPHABET IS UNCHANGED, AND UNIFORM', () => {

    test('the alphabet is declared exactly once, character for character', () => {
        const src = generatorSource();
        const hits = [...src.matchAll(/ALPHABET = '([^']+)'/g)].map(m => m[1]);
        assert.equal(hits.length, 1, 'one declaration, or the copies are back');
        assert.equal(hits[0], SAFE_ALPHABET);
    });

    test('no page carries its own alphabet any more', () => {
        // The three inline copies are what this file used to compare. Their
        // absence is now the assertion.
        ['admin.html', 'trip.html', 'tournament.html'].forEach(f => {
            assert.doesNotMatch(read(f), new RegExp('chars = "' + SAFE_ALPHABET + '"'),
                f + ' still declares its own alphabet');
        });
    });

    test('20,000 codes emit only alphabet characters, and never I, O, 0 or 1', () => {
        const seen = new Set();
        generate().forEach(c => { for (const ch of c) seen.add(ch); });
        [...seen].forEach(ch => assert.ok(SAFE_ALPHABET.includes(ch),
            `unexpected character "${ch}"`));
        ['I', 'O', '0', '1'].forEach(ch => assert.ok(!seen.has(ch),
            `ambiguous character "${ch}" was emitted - a golfer reads these aloud`));
    });

    test('every one of the 32 characters actually appears', () => {
        // Membership is not enough: a generator that only ever emitted "A" would
        // pass the test above. This is what makes the alphabet real.
        const seen = new Set();
        generate().forEach(c => { for (const ch of c) seen.add(ch); });
        assert.equal(seen.size, SAFE_ALPHABET.length,
            `only ${seen.size} of ${SAFE_ALPHABET.length} characters were ever produced`);
    });

    test('the distribution is uniform, which modulo folding would not be', () => {
        // THE ASSERTION THAT COULD NOT EXIST BEFORE. code-issuer.js uses rejection
        // sampling rather than byte % 32; 256 is a whole multiple of 32 only by
        // luck, and folding would bias the alphabet the moment either number
        // changed. A biased code space is a smaller code space. No source read can
        // see this - it only shows up in output, at volume.
        const counts = {};
        const codes = generate();
        codes.forEach(c => { for (const ch of c) counts[ch] = (counts[ch] || 0) + 1; });
        const expected = (codes.length * CODE_LENGTH) / SAFE_ALPHABET.length;
        const worst = Math.max(...Object.values(counts).map(n => Math.abs(n - expected) / expected));
        assert.ok(worst < 0.10,
            `worst character deviates ${(worst * 100).toFixed(1)}% from uniform - `
            + 'that is the signature of modulo folding, not rejection sampling');
    });

    test('duplicates appear at the birthday rate, not more often', () => {
        // I FIRST WROTE THIS AS "zero duplicates" AND IT WAS WRONG. 20,000 draws
        // from 32^6 collide with probability ~17%, not the 0.019% I quoted - the
        // birthday probability is quadratic in n and I had the figure for 2,000
        // draws. That assertion would have failed roughly one run in six, and a
        // flaky test is worse than no test.
        //
        // The sound version: the EXPECTED number of duplicate pairs here is
        // n^2/2S = 0.186, so 0 or 1 is normal and 2 is unremarkable. A generator
        // drawing from a much smaller space than it claims - the signature of a
        // truncated alphabet or a broken loop - produces far more than that.
        const codes = generate();
        const dupes = codes.length - new Set(codes).size;
        assert.ok(dupes <= 5,
            `${dupes} duplicates in ${codes.length} draws; about 0.19 are expected, so this `
            + 'many means the generator is not drawing from 32^6');
    });
});

describe('EXISTING FOUR-CHARACTER CODES STILL WORK', () => {

    // THE TYPED-CODE PATH IS GONE. joinRoom and its field were removed once it was
    // confirmed that nobody has ever typed a code - a golfer arrives on a link the
    // organizer sends. So the length rule this used to guard no longer exists, and
    // the guarantee moved to the path that DOES: the link.
    //
    // The link path applies no length rule at all, which is why a legacy round
    // still opens. That is asserted directly below by opening one, rather than by
    // reading a validator that is no longer there.
    test('the link path applies no length rule to a code', () => {
        ['admin.html', 'index.html'].forEach(f => {
            const src = read(f);
            assert.match(src, /urlParams\.get\('game'\)/, f + ' stopped reading the link');
            const at = src.indexOf("urlParams.get('game')");
            const near = src.slice(Math.max(0, at - 300), at + 300);
            assert.ok(!/length\s*[<>!=]==?\s*\d/.test(near),
                f + ' gates the link on a code length: ' + near.slice(250, 350));
        });
    });

    ['ABCD', 'WXYZ', 'QRST'].forEach(code => {
        test(`a legacy 4-character link "${code}" still opens its round`, () => {
            // The real path, and a stronger check than the old one: this opens the
            // page the way a golfer does and reads what round it decided it is on,
            // rather than asking a validator whether it would have allowed it.
            const sb = loadHtmlInlineScript('admin.html', ADMIN_DEPS.concat(['code-issuer.js']),
                { search: '?game=' + code });
            assert.equal(vm.runInContext('currentMode', sb), code,
                'a 4-character link must still open its round');
        });

        test(`and the scorecard opens on "${code}" too`, () => {
            const sb = loadHtmlInlineScript('index.html',
                ['score-marks.js', 'money-engine.js', 'action-model.js',
                 'settlement-engine.js', 'pool-engine.js', 'bet-strip.js',
                 'hole-events.js', 'ryder-cup.js'], { search: '?game=' + code });
            assert.equal(vm.runInContext('currentMode', sb), code);
        });
    });

    test('no code-entry path requires exactly four characters', () => {
        ['admin.html','trip.html','tournament.html','index.html'].forEach(f => {
            const src = read(f);
            assert.ok(!/code[^\n]{0,40}length === 4|length !== 4[^\n]{0,20}code/i.test(src),
                f + ' must not pin code length to 4');
        });
    });

    test('the security rules keep code paths as wildcards', () => {
        // $eventCode / $tripCode / $tourneyCode accept any key, so neither the old
        // nor the new length is constrained server-side. No rules change needed.
        const rules = read('database.rules.json');
        ['$eventCode','$tripCode','$tourneyCode'].forEach(w =>
            assert.ok(rules.includes(w), w + ' must remain a wildcard'));
        assert.ok(!/\$eventCode[^\n]*matches\(/.test(rules),
            'no charset or length constraint may be added to the code segment');
    });
});

describe('SIX-CHARACTER CODES SURVIVE EVERY ENTRY PATH', () => {

    test('every code input accepts at least six characters', () => {
        const inputs = inputMaxLengths();
        // ONE now. The round join field went, then the duplicate field went - both
        // for the same reason, that nobody ever typed a code. Joining a TRIP is the
        // only code still typed anywhere, by someone who has it in front of them.
        assert.ok(inputs.length >= 1, 'expected the trip input');
        assert.ok(!inputs.some(i => i.id === 'join-room-input'),
            'the round join field is back');
        assert.ok(!inputs.some(i => i.id === 'duplicate-room-input'),
            'the duplicate field is back');
        inputs.forEach(i => assert.ok(i.max === null || i.max >= CODE_LENGTH,
            i.file + ' #' + i.id + ' has maxlength=' + i.max +
            ' and would truncate a ' + CODE_LENGTH + '-character code'));
    });

    test('a generated round code survives the round trip through a link', () => {
        // Generate a code the way createRoom does, put it in a link the way the
        // organizer shares it, and open that link. A truncation anywhere in that
        // chain opens the wrong round, or none.
        const gen = loadHtmlInlineScript('admin.html', ADMIN_DEPS.concat(['code-issuer.js']));
        vm.runInContext('window.__code = generateCode();', gen);
        const code = String(vm.runInContext('window.__code', gen));
        assert.equal(code.length, CODE_LENGTH);
        const sb = loadHtmlInlineScript('admin.html', ADMIN_DEPS.concat(['code-issuer.js']),
            { search: '?game=' + code + '&eventType=quick' });
        assert.equal(vm.runInContext('currentMode', sb), code,
            'the whole code did not survive the link');
    });

    // The duplicate BUTTON is gone; the prefill it drove is not. A code still has
    // to survive the copyFrom link intact, or a new round is built from the wrong
    // old one - so the guarantee moved to the link, exactly as the join one did.
    test('a generated code survives the copyFrom link unchanged', () => {
        const gen = loadHtmlInlineScript('admin.html', ADMIN_DEPS.concat(['code-issuer.js']));
        vm.runInContext('window.__code = generateCode();', gen);
        const code = String(vm.runInContext('window.__code', gen));
        assert.equal(code.length, CODE_LENGTH);
        // Open the link a duplicate produces and read what the page decided the
        // SOURCE round is. A truncation here builds the new round from a different
        // old one, or from nothing.
        const sb = loadHtmlInlineScript('admin.html', ADMIN_DEPS.concat(['code-issuer.js']),
            { search: '?game=NEWRND&copyFrom=' + code });
        assert.equal(vm.runInContext('copyFromCode', sb), code,
            'the source code did not survive the copyFrom link');
    });

    test('a generated trip code fits the trip join field', () => {
        const codes = generate(20);
        codes.forEach(c => assert.equal(c.length, CODE_LENGTH));
        const tripMax = inputMaxLengths().find(i => i.id === 'join-trip-input');
        assert.ok(tripMax && tripMax.max >= CODE_LENGTH, 'the trip field must hold it');
    });

    test('generated links carry the entire code', () => {
        // A truncating link builder would produce a URL that silently opens the
        // wrong round, which is worse than failing outright.
        const sb = loadHtmlInlineScript('admin.html', ADMIN_DEPS.concat(['code-issuer.js']));
        vm.runInContext(`
            var code = generateCode();
            window.__code = code;
            window.__url = 'admin.html?game=' + code + '&eventType=quick';
        `, sb);
        const code = String(vm.runInContext('window.__code', sb));
        const url = String(vm.runInContext('window.__url', sb));
        assert.ok(url.includes('game=' + code));
        assert.equal(url.match(/game=([A-Z0-9]+)/)[1], code, 'no truncation');
    });
});

describe('KEYSPACE, ARITHMETICALLY', () => {

    test('the alphabet is 32 characters with the ambiguous ones removed', () => {
        assert.equal(SAFE_ALPHABET.length, 32);
        ['I','O','0','1'].forEach(c => assert.ok(!SAFE_ALPHABET.includes(c), c));
    });

    test('six characters is 1,073,741,824 combinations', () => {
        // Structural, not statistical: sampling a random generator would be slow
        // and flaky, and would prove less than this arithmetic.
        assert.equal(Math.pow(SAFE_ALPHABET.length, CODE_LENGTH), 1073741824);
    });

    test('that is 1,024 times the old four-character space', () => {
        const before = Math.pow(SAFE_ALPHABET.length, 4);
        const after = Math.pow(SAFE_ALPHABET.length, CODE_LENGTH);
        assert.equal(before, 1048576);
        assert.equal(after / before, 1024);
    });

    test('generated codes are not trivially repetitive', () => {
        // Not a randomness proof - just a guard against a generator that returns a
        // constant, which the length tests alone would not catch.
        const codes = generate(200);
        assert.ok(new Set(codes).size > 150,
            'expected mostly distinct codes, got ' + new Set(codes).size + ' of 200');
    });
});

describe('NOTHING ELSE MOVED', () => {

    // RETIRED, AND SAYING SO RATHER THAN SOFTENING IT.
    //
    // This asserted that the six-character wave changed ONLY the loop bound -
    // that Math.floor(Math.random() * chars.length) was still there, character
    // for character, in each of the three generators. Both halves of that point
    // are now historical: there is one generator, not three, and it deliberately
    // no longer uses Math.random. Keeping the assertion would mean pinning an
    // implementation this wave replaced on purpose; loosening it to still pass
    // would be pretending it had checked something.
    //
    // What survives is the invariant it was really protecting - that the way a
    // code is drawn does not change by accident - so it is asserted against the
    // implementation that exists now.
    test('the one generator draws from crypto, with rejection sampling', () => {
        const src = generatorSource();
        assert.match(src, /getRandomValues/,
            'codes must come from crypto, not Math.random - a code grants full read '
            + 'and write to a round and the app has no accounts behind it');
        assert.match(src, /if \(b >= limit\) continue;/,
            'rejection sampling, not modulo: folding a byte with % would bias the '
            + 'alphabet, and a biased code space is a smaller code space');
        assert.doesNotMatch(src, /% ALPHABET\.length\)\s*;\s*\n?\s*\}\s*$/,
            'the modulo that remains is inside the accepted branch only');
        // Math.random survives ONLY as the no-crypto fallback. COMMENTS STRIPPED
        // FIRST: the file explains at length why crypto replaced Math.random, and
        // counting that prose as code is the same mistake as matching a glyph
        // against an escape - four of the five occurrences are the explanation.
        const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
        assert.equal((code.match(/Math\.random/g) || []).length, 1,
            'Math.random must appear exactly once in live code, in the fallback');
    });

    test('organizerToken generation is untouched', () => {
        const src = read('admin.html');
        assert.match(src, /function makeOrganizerToken/);
        assert.match(src, /new Uint8Array\(16\)/, 'still 128 bits of crypto randomness');
    });

    test('no Firebase, rules or auth change', () => {
        // Written as "the rules never mention auth" when this batch landed, and
        // true until the rules wave of 2026-09-12 gave tournaments an ownerUid
        // and registrations an owner-only read, with Manny's approval of that
        // exact diff. The claim this batch makes is narrower and still holds:
        // code generation put no auth anywhere. So the assertion is now that
        // `auth` appears ONLY in the three expressions that wave approved.
        const rules = JSON.parse(read('database.rules.json')).rules;
        const authSites = (function walk(n, p, out) {
            Object.entries(n || {}).forEach(([k, v]) => {
                if (typeof v === 'string') { if (/auth/.test(v)) out.push(p + '/' + k); }
                else if (v && typeof v === 'object') walk(v, p + '/' + k, out);
            });
            return out;
        })(rules, '', []);
        assert.deepEqual(authSites.sort(), [
            '/registrations/$code/$entryId/.write',
            '/registrations/$code/.read',
            '/tournaments/$tourneyCode/ownerUid/.validate'
        ], 'auth reached a rule outside the approved rules wave: ' + JSON.stringify(authSites));
        ['money-engine.js','settlement-engine.js','pool-engine.js','action-model.js']
            .forEach(f => assert.ok(!read(f).includes('generateRoomCode'),
                f + ' must know nothing about code generation'));
    });
});
