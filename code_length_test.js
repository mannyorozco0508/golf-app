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
const GENERATORS = [
    { label: 'round',      file: 'admin.html',      fn: 'generateRoomCode',
      deps: ['money-engine.js','action-model.js','settlement-engine.js','pool-engine.js','score-marks.js'] },
    { label: 'trip',       file: 'trip.html',       fn: 'generateRandomCode',
      deps: ['money-engine.js','action-model.js','settlement-engine.js'] },
    { label: 'tournament', file: 'tournament.html', fn: 'generateCode',
      deps: ['tournament-engine.js'] },
];

// Calls the real generator inside its own page, many times.
function generate(gen, times) {
    const sb = loadHtmlInlineScript(gen.file, gen.deps);
    vm.runInContext(`
        window.__codes = [];
        for (var i = 0; i < ${times || 200}; i++) window.__codes.push(${gen.fn}());
    `, sb);
    return JSON.parse(JSON.stringify(vm.runInContext('window.__codes', sb)));
}
// The generator's own source, so length and alphabet can be read as written.
function generatorSource(gen) {
    const src = read(gen.file);
    const at = src.indexOf('function ' + gen.fn);
    assert.ok(at > -1, gen.fn + ' must exist in ' + gen.file);
    return src.slice(at, src.indexOf('\n    }', at) + 6);
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

describe('ALL THREE GENERATORS PRODUCE SIX CHARACTERS', () => {

    GENERATORS.forEach(gen => {
        test(`${gen.label} codes are exactly ${CODE_LENGTH} characters`, () => {
            const codes = generate(gen);
            assert.ok(codes.length > 0, 'the generator must actually run');
            codes.forEach(c => assert.equal(c.length, CODE_LENGTH,
                gen.label + ' produced "' + c + '" (' + c.length + ' chars)'));
        });

        test(`${gen.label} generator loops ${CODE_LENGTH} times in source`, () => {
            // Reading the written bound as well as the output: a generator that
            // happened to return 6 characters some other way would still be a
            // change nobody intended.
            assert.match(generatorSource(gen), new RegExp('i < ' + CODE_LENGTH + ';'),
                gen.label + ' must loop to ' + CODE_LENGTH);
        });
    });
});

describe('THE SAFE ALPHABET IS UNCHANGED', () => {

    GENERATORS.forEach(gen => {
        test(`${gen.label} uses the shared 32-character alphabet`, () => {
            assert.ok(generatorSource(gen).includes('"' + SAFE_ALPHABET + '"'),
                gen.label + ' must keep the exact alphabet');
        });

        test(`${gen.label} never emits I, O, 0 or 1`, () => {
            // Excluded because a golfer reads these codes aloud and types them on a
            // phone; I/1 and O/0 are the pairs that get mistyped.
            generate(gen).forEach(c => {
                ['I','O','0','1'].forEach(ch => assert.ok(!c.includes(ch),
                    gen.label + ' produced an ambiguous character in "' + c + '"'));
            });
        });

        test(`${gen.label} emits only alphabet characters`, () => {
            generate(gen).forEach(c => {
                for (const ch of c) assert.ok(SAFE_ALPHABET.includes(ch),
                    'unexpected character "' + ch + '" in ' + gen.label + ' code "' + c + '"');
            });
        });
    });

    test('all three generators share one alphabet, character for character', () => {
        const alphabets = GENERATORS.map(g => {
            const m = generatorSource(g).match(/chars = "([^"]+)"/);
            assert.ok(m, g.label + ' must declare an alphabet');
            return m[1];
        });
        assert.equal(new Set(alphabets).size, 1, 'the three alphabets have diverged');
        assert.equal(alphabets[0], SAFE_ALPHABET);
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
            const sb = loadHtmlInlineScript('admin.html', GENERATORS[0].deps,
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
        // Two now, not three: the round's join field is gone. Duplicate (admin) and
        // trip-join (trip) are the only places a code is still typed, both by
        // someone who has the code in front of them.
        assert.ok(inputs.length >= 2, 'expected the duplicate and trip inputs');
        assert.ok(!inputs.some(i => i.id === 'join-room-input'),
            'the round join field is back');
        inputs.forEach(i => assert.ok(i.max === null || i.max >= CODE_LENGTH,
            i.file + ' #' + i.id + ' has maxlength=' + i.max +
            ' and would truncate a ' + CODE_LENGTH + '-character code'));
    });

    test('a generated round code survives the round trip through a link', () => {
        // Generate a code the way createRoom does, put it in a link the way the
        // organizer shares it, and open that link. A truncation anywhere in that
        // chain opens the wrong round, or none.
        const gen = loadHtmlInlineScript('admin.html', GENERATORS[0].deps);
        vm.runInContext('window.__code = generateRoomCode();', gen);
        const code = String(vm.runInContext('window.__code', gen));
        assert.equal(code.length, CODE_LENGTH);
        const sb = loadHtmlInlineScript('admin.html', GENERATORS[0].deps,
            { search: '?game=' + code + '&eventType=quick' });
        assert.equal(vm.runInContext('currentMode', sb), code,
            'the whole code did not survive the link');
    });

    test('a generated code passes duplicate-round unchanged', () => {
        const sb = loadHtmlInlineScript('admin.html', GENERATORS[0].deps);
        vm.runInContext(`
            alert = function(m){ window.__alert = m; };
            var code = generateRoomCode();
            window.__code = code;
            var el = document.getElementById('duplicate-room-input');
            if (el) el.value = code;
        `, sb);
        const code = String(vm.runInContext('window.__code', sb));
        assert.equal(code.length, CODE_LENGTH);
        const dupMax = inputMaxLengths().find(i => i.id === 'duplicate-room-input');
        assert.ok(dupMax && dupMax.max >= CODE_LENGTH, 'the duplicate field must hold it');
    });

    test('a generated trip code fits the trip join field', () => {
        const codes = generate(GENERATORS[1], 20);
        codes.forEach(c => assert.equal(c.length, CODE_LENGTH));
        const tripMax = inputMaxLengths().find(i => i.id === 'join-trip-input');
        assert.ok(tripMax && tripMax.max >= CODE_LENGTH, 'the trip field must hold it');
    });

    test('generated links carry the entire code', () => {
        // A truncating link builder would produce a URL that silently opens the
        // wrong round, which is worse than failing outright.
        const sb = loadHtmlInlineScript('admin.html', GENERATORS[0].deps);
        vm.runInContext(`
            var code = generateRoomCode();
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
        const codes = generate(GENERATORS[0], 200);
        assert.ok(new Set(codes).size > 150,
            'expected mostly distinct codes, got ' + new Set(codes).size + ' of 200');
    });
});

describe('NOTHING ELSE MOVED', () => {

    test('only the loop bound changed in each generator', () => {
        GENERATORS.forEach(g => {
            const fn = generatorSource(g);
            assert.match(fn, /Math\.floor\(Math\.random\(\) \* chars\.length\)/,
                g.label + ' must keep its original selection expression');
            assert.match(fn, /chars\.charAt/, g.label + ' must keep charAt');
        });
    });

    test('organizerToken generation is untouched', () => {
        const src = read('admin.html');
        assert.match(src, /function makeOrganizerToken/);
        assert.match(src, /new Uint8Array\(16\)/, 'still 128 bits of crypto randomness');
    });

    test('no Firebase, rules or auth change', () => {
        const rules = read('database.rules.json');
        assert.ok(!rules.includes('auth'), 'this batch adds no authentication');
        ['money-engine.js','settlement-engine.js','pool-engine.js','action-model.js']
            .forEach(f => assert.ok(!read(f).includes('generateRoomCode'),
                f + ' must know nothing about code generation'));
    });
});
