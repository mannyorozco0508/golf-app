// ============================================================================
// THE SENTENCES A GOLFER READS WHEN SOMETHING GOES WRONG.
//
// Copy that describes behaviour is behaviour - this repo has been burned by
// that twice, once by a trip money card that claimed not to count side matches
// while counting them, and once by a QR labelled "read-only" that was fully
// writable. Both times the code was right and the sentence lied.
//
// These six are pinned because a silent change to any of them costs something
// real:
//   the destructive control's label and confirm  - "End & Wipe" read as
//        "finish MY card" to a playing partner, which is how a scorekeeper
//        link came to carry a working delete
//   the save-state failure line                  - the only thing that tells a
//        golfer a score did not save
//   the pill and beforeunload wording            - a COUNT, never advice,
//        because the right action differs per failure
//   the Round Ready course-publish note          - two facts stated separately,
//        the reassuring one first
//   the Undo row failure sentence                - the card did not move AND
//        nothing was logged
//
// DELIBERATELY NOT EVERY STRING. The repo holds roughly a thousand glyph-
// bearing strings. Pinning them all produces a test that reddens on every
// cosmetic edit and gets re-pinned without being read, which teaches reflexive
// updating and is worse than no guard at all.
//
// EVERY ASSERTION GOES THROUGH decodeEscapes FIRST. A \uXXXX escape inside a
// <script> is legitimate JavaScript that resolves at runtime, so source and
// runtime can disagree about which characters are present while the page is
// perfectly correct. That gap hid the same defect twice in one week - the bin
// glyph on the destructive control, then this file's own Undo sentence. These
// pins are therefore satisfied by EITHER form, which is the point: they test
// the sentence, not the typing.
//
// EVERY PIN IS A POSITIVE MATCH on a specific phrase, so none of them can be
// satisfied by an empty slice or a file that failed to load.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { decodeEscapes } = require('./helpers/decode-escapes.js');

const read = (f) => decodeEscapes(fs.readFileSync(path.join(__dirname, f), 'utf8'));

const IDX = read('index.html');
const ADMIN = read('admin.html');
const BOOT = read('pwa-boot.js');

// Guards the guard: if a read ever returns nothing, every "must contain"
// below would still pass against an empty string.
function nonEmpty(name, src) {
    assert.ok(src.length > 5000, `${name} loaded only ${src.length} chars - every pin below would be vacuous`);
}

describe('USER-FACING COPY — the sentences a golfer reads when something fails', () => {

    test('the sources actually loaded', () => {
        nonEmpty('index.html', IDX);
        nonEmpty('admin.html', ADMIN);
        nonEmpty('pwa-boot.js', BOOT);
    });

    test('the destructive control says what it destroys, and for whom', () => {
        assert.match(IDX, /🗑️ Delete round for everyone/,
            'the button must carry the bin and say "for everyone" - a partner reading '
            + '"End & Wipe" at the turn took it to mean "finish MY card"');
        assert.doesNotMatch(IDX, /End & Wipe Round/,
            'the old wording is what made a shared destructive control look personal');
    });

    test('the destructive confirm names the round and the field', () => {
        assert.match(IDX, /Delete round \$\{currentMode\} for everyone\?/,
            'the confirm must name the round code and say "for everyone"');
        assert.match(IDX, /This erases all scores for all \$\{golferCount\} golfers/,
            'the golfer count comes from currentData.players.length, so the confirm '
            + 'states the real cost rather than a generic warning');
        assert.doesNotMatch(IDX, /🏁[^`'"]{0,40}(End|Wipe|Delete) (Current Game|round)/,
            'a chequered flag means "finished playing", which is the misreading being fixed');
    });

    test('the save-state line says what failed and what to do about it', () => {
        assert.match(IDX, /Could not save — check your signal and re-enter that hole/,
            'ported verbatim from tournament-scorecard.html; it names the ACTION, which '
            + 'is what the page-wide pill deliberately cannot do');
    });

    test('the pill states a count and never advises', () => {
        assert.match(BOOT, /' did not go through\.'/,
            'the pill holds a number and cannot know whether re-entering is the right action');
        assert.match(BOOT, /'Some changes did not go through\.'/,
            'beforeunload, same reason - "could not be saved" is false for a refused DELETE');
        // Comments in that file discuss re-entering on purpose, so only strings count.
        const strings = BOOT.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
            .match(/'[^']*'|"[^"]*"/g) || [];
        assert.deepEqual(strings.filter((s) => /re-?enter|try again|loses them/i.test(s)), [],
            'no advice in any pwa-boot string, ever');
    });

    test('the Round Ready note states two facts, reassurance first', () => {
        assert.match(ADMIN, /Your round is ready and uses the card you entered/,
            'the organizer\'s first question on any warning here is "is my round broken"');
        assert.match(ADMIN, /This round is not affected/);
        assert.match(ADMIN, /The shared course list did not update/,
            'and the thing that actually failed, stated separately');
        assert.match(ADMIN, /won't get your version of this course/,
            'true whether the course already existed or is new - "will still see the '
            + 'previous card" would be false for a new one');
    });

    test('the Undo row says the card did not move AND nothing was logged', () => {
        assert.match(IDX, /⚠️ Could not undo — the score did not change\. Nothing was logged\./,
            'both facts, because a golfer who reads only this sentence needs to know the '
            + 'audit trail is still honest');
    });

    test('the decoder makes both glyph forms equivalent to these pins', () => {
        // The whole reason this file decodes. Same sentence, both ways it can be
        // typed, one assertion - so a future author cannot hide a copy change
        // behind an escape, and cannot be tripped up by choosing one form.
        const RAW = "note.textContent = '⚠️ Could not undo — the score did not change. Nothing was logged.';";
        const ESC = 'note.textContent = ' + "'" + '\\u26A0\\uFE0F Could not undo \\u2014 the score did not change. Nothing was logged.' + "'" + ';';
        const re = /⚠️ Could not undo — the score did not change\. Nothing was logged\./;
        assert.match(decodeEscapes(RAW), re, 'the raw form must match');
        assert.match(decodeEscapes(ESC), re, 'the ESCAPED form must match the same assertion');
        assert.doesNotMatch(ESC, re,
            'and without decoding the escaped form does NOT match - which is exactly how '
            + 'this defect hid twice, and why every pin above decodes first');
    });
});
