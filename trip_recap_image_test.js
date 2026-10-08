// ============================================================================
// THE TRIP RECAP, AS AN IMAGE (Wave C, 2026-10-08)
//
// Manny: one tap, straight into the iOS share sheet, for the group chat.
// Standings, who owes who for the week, awards.
//
// WHAT WAS ALREADY THERE: the recap CARD (standings + settlement + awards, all
// computed) and a "Share Trip Recap (Text)" that copies plain text. The 📸
// button opened a card to SCREENSHOT. So the content was done and the image was
// not.
//
// WHY IT IS BUILT FROM THE RENDERED CARD, not from the engines again. This is
// native-export.js's rule and it is the right one: "the PDF is built by reading
// the ALREADY-RENDERED DOM - if the Receipt is wrong, the PDF is wrong in
// exactly the same way, which is the correct failure." A second path to the
// same numbers is how a $10 Nassau came to show $30 live against a Receipt that
// correctly paid $45. The image reads the card the golfer is looking at.
//
// SO THE PURE PART IS THE LAYOUT, and that is what is tested here: given the
// card's blocks, where does every line go, how tall is the image, and does
// anything fall off the right edge. The drawing itself needs a canvas and is
// measured in Chrome by tools/trip-recap-image-check.js, which taps the real
// button and decodes the PNG it produces.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadJsFile } = require('./helpers/load-script.js');

const box = () => loadJsFile('trip-recap-image.js', []);
const model = (blocks, opts) => {
    const sb = box();
    sb.B = blocks; sb.O = opts || {};
    return JSON.parse(vm.runInContext('JSON.stringify(tripRecapModel(B, O))', sb));
};

const BLOCKS = () => ([
    { head: null, title: '🧳 Myrtle Beach 2026' },
    { head: '🏆 STANDINGS · NET', rows: [
        { left: '1  James Secondi', right: '515' },
        { left: '2  Jake Saley', right: '527' },
        { left: '3  James Rahlston', right: '529' } ] },
    { head: '💵 WHO PAYS WHO', rows: [
        { left: 'Manny Orozco → Brian Blake', right: '$183' },
        { left: 'Joseph Bannon → Brian Blake', right: '$183' } ] },
    { head: '🏅 AWARDS', rows: [
        { left: '🐦 Most Birdies', right: 'Manny Orozco (23)' },
        { left: '🎭 Sandbagger of the Week', right: 'Gerry Doncaster' } ] }
]);

describe('1. EVERY LINE LANDS SOMEWHERE, AND THE IMAGE IS AS TALL AS ITS CONTENT', () => {

    test('the model carries a line for every row and every heading', () => {
        const m = model(BLOCKS());
        const kinds = m.lines.map(l => l.kind);
        assert.ok(kinds.includes('title'), 'no title line');
        assert.equal(kinds.filter(k => k === 'head').length, 3, 'expected three headings');
        assert.equal(kinds.filter(k => k === 'row').length, 7, 'expected seven rows');
        // POSITIVE CONTROL: the text actually travels, not just the shape.
        const text = m.lines.map(l => (l.left || '') + ' ' + (l.right || '')).join(' | ');
        assert.match(text, /James Secondi/);
        assert.match(text, /Brian Blake/);
        assert.match(text, /Most Birdies/);
    });

    test('every line is inside the canvas, top and bottom', () => {
        const m = model(BLOCKS());
        m.lines.forEach((l) => {
            assert.ok(l.y > 0, 'a line is above the top edge: ' + JSON.stringify(l));
            assert.ok(l.y < m.height, 'a line is below the bottom edge: ' + l.y + ' of ' + m.height);
        });
        // The height is DERIVED, so a long recap is not cropped.
        const tall = model(BLOCKS().concat([{ head: 'MORE', rows: Array.from({ length: 30 },
            (_, i) => ({ left: 'Row ' + i, right: '$' + i })) }]));
        assert.ok(tall.height > m.height + 500, 'thirty more rows did not make the image taller: '
            + m.height + ' -> ' + tall.height);
    });

    test('nothing is placed outside the side margins', () => {
        const m = model(BLOCKS());
        m.lines.forEach((l) => {
            assert.ok(l.x >= m.pad, 'a line starts left of the margin: ' + l.x);
            if (l.right !== undefined && l.right !== null && l.rightX !== undefined) {
                assert.ok(l.rightX <= m.width - m.pad,
                    'a right-hand value is past the right margin: ' + l.rightX + ' of ' + m.width);
            }
        });
    });

    test('a phone-shaped image: portrait, and wide enough to read', () => {
        const m = model(BLOCKS());
        assert.ok(m.width >= 1000, 'too narrow to read when iMessage scales it down: ' + m.width);
        assert.ok(m.height > m.width * 0.6, 'the card is not portrait: ' + m.width + 'x' + m.height);
    });
});

describe('2. IT REFUSES RATHER THAN DRAWING A LIE', () => {

    test('no blocks means no image', () => {
        assert.equal(model([]), null);
        assert.equal(model(null), null);
    });

    test('a card with a title but nothing in it is still refused', () => {
        // A recap with no standings and no money is a blank card with a trip
        // name on it, which is worse in a group chat than no image at all.
        assert.equal(model([{ head: null, title: 'Trip' }]), null);
    });

    test('and a blocked recap is never drawn', () => {
        // tripAttributionBlocked() already replaces the card with a refusal; the
        // image must not render that refusal as though it were a recap.
        assert.equal(model([{ head: null, title: 'Trip' },
                            { head: '⚠️ RECAP NOT SHOWN', rows: [{ left: 'two golfers share a name', right: '' }] }]),
                     null);
    });
});

describe('3. LONG NAMES ARE SHORTENED, NOT RUN OFF THE EDGE', () => {

    test('a very long row is truncated with an ellipsis', () => {
        const long = 'Bartholomew Fotheringay-Pemberton the Third → Christopher Alexander Cameron';
        const m = model([{ head: null, title: 'T' },
                         { head: 'WHO PAYS WHO', rows: [{ left: long, right: '$1,234' }] }]);
        const row = m.lines.find(l => l.kind === 'row');
        assert.ok(row.left.length < long.length, 'the long name was not shortened');
        assert.match(row.left, /…$/, 'a shortened name should end in an ellipsis');
        // AND THE AMOUNT SURVIVES WHOLE - it is the thing being settled.
        assert.equal(row.right, '$1,234');
    });

    test('a short row is left exactly as it is', () => {
        const m = model(BLOCKS());
        const row = m.lines.find(l => l.kind === 'row');
        assert.equal(row.left, '1  James Secondi', 'a short line was altered');
    });
});
