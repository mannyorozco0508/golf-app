// ============================================================================
// MOBILE KEYBOARD vs REQUIRED INPUT
//
// THE BUG THIS EXISTS TO PREVENT
//
// The Money Pool KP Holes field asked for "3, 9, 13, 17" and carried
// inputmode="numeric". On iOS that renders the number pad: ten digits and
// nothing else. No comma. The field therefore requested a format that could
// not physically be typed on the device every organizer actually uses.
//
// It survived because it works perfectly on a desktop keyboard, where
// inputmode is ignored entirely. Nothing in the markup was invalid, nothing
// threw, and no unit test on parsing would ever have caught it - the parser was
// always correct. The defect lived precisely in the gap between what the field
// asked for and what the keyboard could produce.
//
// So this file does not test parsing. It tests the RENDERED INPUT ATTRIBUTES,
// and it does so by a general rule rather than by naming one field:
//
//   If an input asks for a comma-separated list, its mobile keyboard must
//   include a comma.
//
// Stated that way it protects fields that do not exist yet. Any future
// "holes 3, 9, 13" or "players 1, 4, 7" input is covered the moment someone
// writes a placeholder for it.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO = __dirname;
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

// Every page a golfer or organizer can actually reach.
const PAGES = [
    'admin.html', 'index.html', 'leaderboard.html', 'settlement.html',
    'sidematches.html', 'skins.html', 'stats.html', 'trip.html',
    'tournament.html', 'tournament-scorecard.html',
];

// Keyboards with no comma key on iOS.
//
// numeric -> digits only
// decimal -> digits plus the locale decimal separator. In en-US that is a
//            period, so it is no help here either.
// tel     -> the phone pad: digits, +, *, #. No comma.
//
// type="number" and type="tel" have the same effect independently of inputmode,
// so both are checked.
const COMMA_LESS_INPUTMODES = ['numeric', 'decimal', 'tel'];
const COMMA_LESS_TYPES = ['number', 'tel'];

function parseInputs(html) {
    return [...html.matchAll(/<input\b[^>]*>/gi)].map((m) => {
        const tag = m[0];
        const attr = (name) => {
            const hit = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
            return hit ? hit[1] : null;
        };
        return {
            tag,
            id: attr('id'),
            type: (attr('type') || 'text').toLowerCase(),
            inputmode: (attr('inputmode') || '').toLowerCase(),
            placeholder: attr('placeholder') || '',
            pattern: attr('pattern') || '',
        };
    });
}

// A field asks for a list when its own placeholder demonstrates one: two numbers
// with a comma between them. Deliberately narrow - it reads the field's own
// stated example rather than guessing from nearby prose, so it cannot be fooled
// by a hint that happens to contain a comma for grammatical reasons.
function wantsCommaList(input) {
    return /\d\s*,\s*\d/.test(input.placeholder);
}

// ---------------------------------------------------------------------------

describe('MOBILE KEYBOARD - a field must not ask for characters its keypad lacks', () => {

    test('no shipped input requests a comma-separated list behind a comma-less keypad', () => {
        const offenders = [];
        PAGES.forEach((page) => {
            parseInputs(read(page)).filter(wantsCommaList).forEach((inp) => {
                if (COMMA_LESS_INPUTMODES.includes(inp.inputmode)) {
                    offenders.push(`${page} #${inp.id || '(no id)'} placeholder "${inp.placeholder}" has inputmode="${inp.inputmode}" - that keypad has no comma key`);
                }
                if (COMMA_LESS_TYPES.includes(inp.type)) {
                    offenders.push(`${page} #${inp.id || '(no id)'} placeholder "${inp.placeholder}" has type="${inp.type}" - that keypad has no comma key`);
                }
                if (inp.pattern && /^\^?\[0-9\]/.test(inp.pattern)) {
                    offenders.push(`${page} #${inp.id || '(no id)'} placeholder "${inp.placeholder}" has a digits-only pattern "${inp.pattern}" which rejects the commas it asks for`);
                }
            });
        });
        assert.deepEqual(offenders, [], `A field is asking for input its own keyboard cannot produce:\n  - ${offenders.join('\n  - ')}`);
    });

    test('the rule is actually finding fields - it is not passing vacuously', () => {
        // A rule that matches nothing passes forever and protects nothing. At least
        // one comma-list field must exist, or this file has quietly stopped working.
        const found = PAGES.flatMap((p) => parseInputs(read(p)).filter(wantsCommaList).map((i) => `${p}#${i.id}`));
        assert.ok(found.length >= 1, 'No comma-separated field was detected at all - the detector is broken, not the app.');
        assert.ok(found.includes('admin.html#mp-kp-holes'), 'KP Holes should be detected as a comma-list field.');
    });

    test('KP Holes specifically renders a keyboard that can type its own placeholder', () => {
        const kp = parseInputs(read('admin.html')).find((i) => i.id === 'mp-kp-holes');
        assert.ok(kp, 'The KP Holes field must exist.');
        assert.equal(kp.type, 'text', 'type=number would strip the commas as it was typed.');
        assert.ok(!COMMA_LESS_INPUTMODES.includes(kp.inputmode),
            `inputmode="${kp.inputmode}" gives a keypad with no comma - the organizer cannot type "3, 9, 13, 17".`);
    });

    test('the single-number money fields keep their numeric keypads', () => {
        // The fix must not turn the whole setup screen into a QWERTY keyboard. Buy-in,
        // KP amount and net payouts each take ONE number and should stay fast to type.
        const inputs = parseInputs(read('admin.html'));
        ['mp-buyin', 'mp-kp-amount', 'mp-net-amount', 'mp-skins-amount'].forEach((id) => {
            const f = inputs.find((i) => i.id === id);
            assert.ok(f, `${id} should exist.`);
            assert.ok(['numeric', 'decimal'].includes(f.inputmode),
                `${id} takes a single number and should keep its numeric keypad; got inputmode="${f.inputmode}".`);
        });
    });

    test('score entry keeps its numeric keypad too', () => {
        assert.match(read('index.html'), /inputmode="numeric" pattern="\[0-9\]\*" class="score-input"/,
            'Score boxes take one number and must stay on the number pad.');
    });
});

describe('KP HOLES PARSING - unchanged, and indifferent to spacing', () => {

    // The exact expression from admin.html's capture path. Extracted rather than
    // retyped, so this cannot drift from what actually runs.
    function kpParserFromSource() {
        const adm = read('admin.html');
        const at = adm.indexOf("document.getElementById('mp-kp-holes').value.split(',')");
        assert.notEqual(at, -1, 'The KP holes capture expression moved - this test is no longer checking the real parser.');
        const snippet = adm.slice(at, at + 200);
        assert.match(snippet, /\.map\(x => parseInt\(x\.trim\(\), 10\)\)/,
            'trim() is what makes spaces after commas acceptable.');
        assert.match(snippet, /\.filter\(x => x > 0\)/);
        return (value) => value.split(',').map((x) => parseInt(x.trim(), 10)).filter((x) => x > 0);
    }

    test('"3,9,13,17" and "3, 9, 13, 17" produce the identical result', () => {
        const parse = kpParserFromSource();
        const tight = parse('3,9,13,17');
        const spaced = parse('3, 9, 13, 17');
        assert.deepEqual(tight, [3, 9, 13, 17]);
        assert.deepEqual(spaced, [3, 9, 13, 17]);
        assert.deepEqual(tight, spaced, 'Spacing must never change the holes.');
    });

    test('ragged real-world spacing still parses', () => {
        const parse = kpParserFromSource();
        assert.deepEqual(parse('3 ,9 , 13,  17'), [3, 9, 13, 17]);
        assert.deepEqual(parse(' 4, 14 '), [4, 14]);
    });

    test('empty and junk entries are dropped rather than becoming hole 0', () => {
        const parse = kpParserFromSource();
        assert.deepEqual(parse(''), []);
        assert.deepEqual(parse('3,,9'), [3, 9], 'A stray double comma must not create a phantom hole.');
        assert.deepEqual(parse('3, x, 9'), [3, 9]);
    });

    test('validation against the real scorecard is untouched', () => {
        // The 1-18 requirement is enforced by pool-engine against the ACTUAL course
        // holes, which is stronger than a range check - it rejects hole 19 on an
        // 18-hole course and hole 12 on a nine-holer alike. Nothing in this fix
        // touches it, and this asserts it is still there.
        const pe = read('pool-engine.js');
        assert.match(pe, /KP hole \$\{h\} is not on this course\./);
        assert.match(pe, /if \(new Set\(holes\.map\(Number\)\)\.size !== holes\.length\)/,
            'duplicate KP holes must still be rejected');
        assert.match(pe, /KP has money on it but no KP holes chosen\./);
    });
});
