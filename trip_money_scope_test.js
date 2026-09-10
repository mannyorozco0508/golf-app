// ============================================================================
// A HAND-WRITTEN SENTENCE ABOUT WHAT THE TRIP TOTAL CONTAINS IS IMPOSSIBLE,
// NOT MERELY ABSENT.
//
// This has now cost the project twice with the same sentence.
//
//   FIRST: the money card's FOOTER said "Main-format bets only for now - Side
//   Games, Side Matches, and one-off Side Bets aren't included yet." It was
//   false; the trip sums computeCombinedNetTotals, which counts all of them. A
//   group reading it settles their side matches SEPARATELY, on top of a total
//   that already contains them, and pays twice. trip_money_truth_test.js was
//   written, the footer was rebuilt from TRIP_TOTAL_INCLUDES, and the list is
//   held against every label the engine can emit. That guard is good and stays.
//
//   SECOND: THE LIE MOVED. The section HEADER still says "Nets every linked
//   round's main-format bet into one final who pays who list" - a static <p> in
//   markup, which the guard does not reach. So the panel now opens with a false
//   sentence in normal type and closes with the true one in the smallest type
//   on the page.
//
// WHY THE OLD GUARD COULD NOT SEE IT. Its positive half asserts the file
// mentions TRIP_TOTAL_INCLUDES somewhere - which proves the identifier exists,
// not that every scope claim derives from it. Its negative half is a blacklist
// of two exact historical strings, and the header's wording escapes both. One
// whitelisted element plus two blacklisted phrases has no notion of "every
// sentence on this page that makes a scope claim".
//
// ============================================================================
// HOW "MONEY-SCOPE PROSE" IS DEFINED, AND WHY IT CANNOT CATCH THE TRUE ONE
// ============================================================================
//
// TWO PARTS, AND THE FIRST DOES THE REAL WORK.
//
// 1. LOCATION. This reads MARKUP ONLY - <script> and <style> blocks, HTML
//    comments and on* handlers are stripped out first. The true sentence is
//    BUILT AT RUNTIME from TRIP_TOTAL_INCLUDES and never appears in markup, so
//    it is exempt by CONSTRUCTION rather than by wording. That matters: a
//    reworded lie cannot buy the same exemption by imitating the true
//    sentence's phrasing, because phrasing is not what grants it.
//
//    Measured, for the record: the true sentence IS a scope claim by the
//    vocabulary below. It passes only because it is not in markup.
//
// 2. VOCABULARY. A markup line is a scope claim when it names a MONEY SOURCE
//    and carries a SCOPE VERB. Both, on the same line.
//
//    Verb stems are matched regardless of polarity - includ(e|es|ed|ing) rather
//    than "includes" - because a denial is a claim too. "The Birdie Pool isn't
//    included yet" is the same defect as "the Birdie Pool is included", and an
//    earlier draft of this regex missed it by looking for the literal string
//    "not included". Same for "excluded" against "excludes".
//
//    REQUIRING BOTH is what keeps it off legitimate copy. "Copies
//    course/format/side games from that round" names a money source and is not
//    a claim about the total - it describes duplicating a round's setup. It has
//    no scope verb, so it passes. That line is real and it is in the page.
//
// THE DEFINITION IS ITSELF TESTED, below, against eight reworded lies that must
// all be caught and eight real lines from this page that must not be. A guard
// whose rule nobody checked is a guard nobody can trust to have been widened
// correctly later.
//
// WHAT THIS FILE DOES NOT COVER: whether the surfaces that show a trip total
// actually RENDER the sentence. A source scan passes on a page that builds it
// and never prints it, and the recap card and the share text do exactly that
// today - they show a settlement with no scope sentence at all. That needs a
// browser: tools/trip-money-scope-check.js.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { decodeEscapes } = require('./helpers/decode-escapes.js');

const PAGE = 'trip.html';

// A money source is any thing that can put a dollar into a golfer's trip total.
// Kept deliberately wider than TRIP_TOTAL_INCLUDES: the list is what the total
// DOES contain, this is what a sentence might CLAIM about it.
const MONEY_SOURCE = /main[- ]format|main game|main bet|side game|side match|press(es)?\b|birdie pool|\bKPs?\b|main pool|skins|nassau|wager|stakes?\b/i;

// A scope verb asserts what is or is not counted. Stems, not conjugations, and
// polarity-blind on purpose - see the header.
const SCOPE_VERB = /\bnets?\b|\bcount(s|ed|ing)?\b|\binclud(e|es|ed|ing)\b|\bcover(s|ed|ing)?\b|\btotal(s|led|ing)?\b|\bsums?\b|\bonly\b|\bexclud(e|es|ed|ing)\b|leaves? out|\bignor(e|es|ed)\b|adds? up/i;

const isScopeClaim = (line) => MONEY_SOURCE.test(line) && SCOPE_VERB.test(line);

// Markup only. Decoding first so a \uXXXX-escaped lie cannot hide from a
// negative assertion - the mirror of the rule for escapes that reach markup.
// KNOWN LIMIT, said out loud: HTML entities are NOT decoded, so a lie written
// as &#109;ain-format would pass. No such thing exists in the page today and
// inventing a second decoder for a hypothetical is not worth the surface.
function markupLines() {
    const raw = decodeEscapes(fs.readFileSync(path.join(__dirname, PAGE), 'utf8'));
    const stripped = raw
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/\son\w+="[^"]*"/gi, ' ');
    return stripped.replace(/<[^>]+>/g, '\n').split('\n')
        .map((s) => s.trim()).filter((s) => s.length > 2);
}

// Eight reworded lies. None is the historical string the old blacklist knows,
// which is the point - a blacklist of past wordings guards the past.
const REWORDED_LIES = [
    'Nets every linked round\'s main-format bet into one final "who pays who" list.',
    'Only the main bet from each round is counted here.',
    'Side matches are not included in this total.',
    'This total covers the main game and nothing else.',
    'Counts every wager on the trip.',
    'The Birdie Pool isn\'t included yet.',
    'Main format only for now - side games to come.',
    'Presses are excluded from the figure below.'
];

// Eight lines that are really in this page, or are the true sentence. None may
// be flagged, or the guard becomes something people route around.
const MUST_STAY_CLEAN = [
    'Copies course/format/side games from that round - handy for a 36-hole day.',
    'Settle up for real over Venmo - this is just the math.',
    'Trip Money Settlement',
    'Prize Payout Calculator',
    'set the pool and how many spots pay, and it maps straight onto the standings above.',
    'Standings, settlement, and awards in one message for the group chat.',
    'Totals across every linked round so far. Matches players by name across rounds.',
    'Tap Edit on any round anytime - add or drop players, change the format, adjust stakes.'
];

const TRUE_SENTENCE =
    'Includes the main game, side games, side matches and presses, the Birdie Pool, '
    + 'KPs and the Main Pool.';

describe('THE DEFINITION OF MONEY-SCOPE PROSE IS ITSELF TESTED', () => {

    test('every reworded lie is caught', () => {
        REWORDED_LIES.forEach((l) => assert.ok(isScopeClaim(l),
            'a scope claim walked past the rule: ' + l));
    });

    test('no legitimate line on this page is caught', () => {
        MUST_STAY_CLEAN.forEach((l) => assert.ok(!isScopeClaim(l),
            'the rule flagged copy that makes no claim about the total: ' + l));
    });

    test('BOTH halves are load-bearing', () => {
        // Source without verb, and verb without source. If either alone were
        // enough the rule would flag half the page or none of it.
        assert.ok(!isScopeClaim('Copies course/format/side games from that round.'),
            'a money source with no scope verb must not be a claim');
        assert.ok(!isScopeClaim('Totals across every linked round so far.'),
            'a scope verb with no money source must not be a claim');
        assert.ok(isScopeClaim('Counts every side match.'),
            'source plus verb must be a claim');
    });

    test('THE TRUE SENTENCE IS EXEMPT BY LOCATION, NOT BY WORDING', () => {
        // This is the property the whole design rests on. The true sentence IS
        // a scope claim; it survives only because it is built at runtime and
        // never lands in markup. If it were ever pasted into the page as static
        // text it SHOULD fail this guard, because then it could go stale.
        assert.ok(isScopeClaim(TRUE_SENTENCE),
            'the true sentence is not recognised as a scope claim, which would mean the '
            + 'rule is too narrow to catch a lie that imitates it');
        assert.ok(!markupLines().some((l) => l.includes('Includes the main game')),
            'the true sentence has been hard-coded into markup, where it can go stale - '
            + 'it must be built from TRIP_TOTAL_INCLUDES at runtime');
    });
});

describe('trip.html MARKUP MAKES NO CLAIM ABOUT WHAT THE TOTAL CONTAINS', () => {

    test('the stripped markup is substantial, so this cannot pass vacuously', () => {
        // A strip that ate the whole file would satisfy every negative
        // assertion below, forever.
        const lines = markupLines();
        assert.ok(lines.length > 30,
            `only ${lines.length} markup lines survived stripping - the guard below would be `
            + 'asserting against almost nothing');
        assert.ok(lines.some((l) => /Trip Money Settlement/.test(l)),
            'the money section heading is not in the stripped markup, so the strip removed '
            + 'the very region this guard exists to police');
    });

    test('no markup line says what the trip total does or does not count', () => {
        const offenders = markupLines().filter(isScopeClaim);
        assert.deepEqual(offenders, [],
            'markup makes a claim about what the trip total contains. That sentence is '
            + 'static: it cannot follow the engine, and this is the second time the same '
            + 'lie has been written here. Say it once, built from TRIP_TOTAL_INCLUDES, and '
            + 'let every surface render THAT.\n  ' + offenders.join('\n  '));
    });
});
