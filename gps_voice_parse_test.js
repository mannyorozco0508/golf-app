// ============================================================================
// URGENT-066 #4 - VOICE SCORING: THE GRAMMAR (gps-voice-parse.js), pure. The words -> ONE score to
// confirm, or ONE question back. Never a guess. Made-up golfers ("Test ..."); nothing is written.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-voice-parse.js'))) { console.log('Consumer tree: no voice scoring - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('./gps-voice-parse.js');

const G = [
    { id: '101', name: 'Manny Test' }, { id: '102', name: 'Mike Smith' }, { id: '103', name: 'Dave Jones' },
    { id: '104', name: 'Mike Brown' }, { id: '105', name: 'Chip Lee' }, { id: '106', name: 'Will Test' }, { id: '107', name: 'Jack Test' }
];
const PARS = { 1: 4, 2: 5, 3: 3, 7: 4, 9: 5, 17: 3, 18: 4 };
const C = (o) => Object.assign({ hole: 7, par: 4, golfers: G, me: '101', prev: { '101': 6, '103': 4 }, parOf: (n) => PARS[n] || 4, holes: Array.from({ length: 18 }, (_, i) => i + 1) }, o || {});
const score = (t, o) => { const r = P.parse(t, C(o)); assert.equal(r.kind, 'score', JSON.stringify(t) + ' -> ' + JSON.stringify(r)); return r; };
const asks = (t, reason, o) => { const r = P.parse(t, C(o)); assert.equal(r.kind, 'ask', JSON.stringify(t) + ' should ask, got ' + JSON.stringify(r)); if (reason) assert.equal(r.reason, reason, JSON.stringify(t) + ': ' + JSON.stringify(r)); assert.ok(r.ask && r.ask.length > 5, 'a question to ask'); return r; };
const is = (t, strokes, putts, who, hole, o) => {
    const r = score(t, o);
    assert.equal(r.strokes, strokes, t + ' strokes'); assert.equal(r.putts, putts, t + ' putts');
    assert.equal(r.golfer.id, who || '101', t + ' golfer'); assert.equal(r.hole, hole || 7, t + ' hole');
    return r;
};

test("Manny's examples: \"put me down for a 5, two putts\"", () => {
    const r = is('Put me down for a 5, two putts', 5, 2);
    assert.equal(r.rel, 'bogey');
    is('put me down for a five two putts', 5, 2);
    is('Put me down for a 5. Two putts.', 5, 2);
    is('put me down for 5 with 2 putts', 5, 2);
});

test('numbers: digits, words, "a 5"', () => {
    for (const [t, n] of [['5', 5], ['five', 5], ['a 5', 5], ['a four', 4], ['I got a 6', 6], ['seven', 7], ['ten', 10], ['an eight', 8], ['score 3', 3], ['twelve', 12]]) is(t, n, null);
});

test('golf words, relative to the hole’s par', () => {
    for (const [t, n] of [['par', 4], ['bogey', 5], ['bogie', 5], ['birdie', 3], ['eagle', 2], ['double bogey', 6], ['double', 6], ['triple bogey', 7], ['triple', 7],
        ['quad', 8], ['albatross', 1], ['double eagle', 1], ['even par', 4], ['one over', 5], ['two over par', 6], ['one under', 3], ['I parred it', 4], ['birdied', 3], ['bogeyed', 5],
        ['made par', 4], ['hole in one', 1], ['an ace', 1]]) is(t, n, null);
    assert.equal(score('hole in one').rel, 'hole in one');
    // par 5 hole
    is('birdie', 4, null, '101', 7, { par: 5 });
    is('bogey on 9', 6, null, '101', 9);   // hole 9 is a par 5 (parOf)
    is('birdie on 17', 2, null, '101', 17);
});

test('putts: "two putts", "2-putt", "one putt", "three jack", "no putts", "chipped in"', () => {
    is('five two putts', 5, 2);
    is('a 5, 2-putt', 5, 2);
    is('4 one putt', 4, 1);
    is('two putt par', 4, 2);
    is('par with two putts', 4, 2);
    is('three jack bogey', 5, 3);
    is('3 putted for a 6', 6, 3);
    is('no putts, a 3', 3, 0);
    is('chipped in for birdie', 3, 0);
    is('double bogey 2 putts', 6, 2);
    is('1 putt birdie', 3, 1);
});

test('golfers: names, "for Mike", possessive, "me" / "I" / nobody = this phone', () => {
    is('bogey for Dave', 5, null, '103');
    is('Dave got a 5', 5, null, '103');
    is("Dave's 6", 6, null, '103');
    is('give Dave a double', 6, null, '103');
    is('put Dave down for a 5 on 9 two putts', 5, 2, '103', 9);
    is('four for Dave', 4, null, '103');
    is('Mike Smith 5', 5, null, '102');
    is('Mike Brown bogey two putts', 5, 2, '104');
    is('5 for Mike Brown', 5, null, '104');
    is('jones 4', 4, null, '103');                 // a last name
    is('me 4', 4, null);
    is('I made a 4', 4, null);
    is('my score is 6', 6, null);
    is('DAVE 5', 5, null, '103');                  // case
});

test('names that are everyday words need a marker (Chip, Will, Jack)', () => {
    is('Chip got a 3', 3, null, '105');
    is('a 3 for chip', 3, null, '105');
    is("chip's 4", 4, null, '105');
    is('chip in for birdie', 3, 0, '101');         // chipping in, not Chip
    is('I will take a 5', 5, null, '101');         // not Will
    is('will got a 6', 6, null, '106');
    asks('three jack', 'no-score');                // 3 putts (golf talk), not Jack
    is('Jack got a 4', 4, null, '107');
    is('a 4 for jack, two putts', 4, 2, '107');
});

test('TRICKY: "for" / "four", "to" / "two", run-together numbers, two numbers', () => {
    is('put me down for 5', 5, null);              // "for" is never a 4
    is('for a 4', 4, null);
    is('four', 4, null);
    is('for four', 4, null);
    asks('for for Dave', 'no-score');              // a recognizer stammer: no number at all
    asks('to putts', 'putts-number');              // "to" is never a 2
    const r = asks('52 putts', 'putts-range');     // "5, 2 putts" run together
    assert.match(r.ask, /a 5 with 2 putts/);
    asks('a 52', 'score-range');
    asks('5 6', 'two-scores');
    asks('a five then a six', 'two-scores');
    is('5 5', 5, null);                            // said twice: the same number
    asks('2 putts', 'no-score');
    asks('two putts for Dave', 'no-score');
});

test('TRICKY: never guess - hedges, conflicts and impossible putts ask', () => {
    for (const t of ['a 5 or 6', 'maybe a 5', 'I think a 5', 'not a 5, a 6', 'actually a 6', 'probably bogey', 'about a 5', 'wait a 5'])
        asks(t, 'hedge');
    asks('birdie 5', 'conflict');
    is('bogey 5', 5, null);                        // agrees with par 4
    asks('par 5', 'par-mismatch');                 // hole 7 is a par 4
    is('par 4', 4, null);
    asks('double par', 'double-par');
    asks('2 putts on a 2', 'putts-too-many');
    asks('a 3 four putts', 'putts-too-many');
    asks('bogey', 'no-par', { par: null, parOf: () => null });
    is('hole in one', 1, null, '101', 7, { par: null, parOf: () => null });   // an ace needs no par
    asks('birdie bogey', 'two-scores');
    asks('two putts three putts 5', 'two-putts');
    asks('a 0', 'score-range');
    asks('twenty five', 'two-scores');
});

test('TRICKY: who - unknown names, two Mikes, two golfers, "me" and a name', () => {
    const two = asks('Mike got a 5', 'which-golfer');
    assert.deepEqual(two.choices.map((c) => c.id), ['102', '104']);
    asks('for Mike a 4', 'which-golfer');
    const bob = asks('Bob got a 5', 'unknown-golfer');
    assert.match(bob.ask, /Bob/);
    asks('a 5 for Bobby', 'unknown-golfer');
    asks('Dave and Mike Smith 4', 'two-golfers');
    asks('Dave and Mike 4', 'two-golfers');
    asks('I got a 5 for Dave', 'who');
    asks('we all made par', 'who');
    asks('him 5', 'who');
    // no "me" known and several golfers: who?
    const w = asks('a 5', 'who', { me: null });
    assert.equal(w.choices.length, G.length);
    // one golfer in the round: that golfer
    is('a 5', 5, null, '9', 7, { me: null, golfers: [{ id: '9', name: 'Solo Test' }] });
});

test('holes: "on 7", "hole 9", "on the 9th", "the seventeenth"; a hole the round lacks asks', () => {
    is('5 on 9', 5, null, '101', 9);
    is('hole 9 a 5', 5, null, '101', 9);
    is('on hole 3 a par', 3, null, '101', 3);
    is('five on the 9th', 5, null, '101', 9);
    is('a 3 on the seventeenth', 3, null, '101', 17);
    is('the eighteenth bogey', 5, null, '101', 18);
    asks('a 5 on 19', 'hole-range', { holes: Array.from({ length: 18 }, (_, i) => i + 1) });
    asks('a 5 on 3 on 4', 'two-holes');
    asks('a 5', 'which-hole', { hole: null });
    is('5 on 7 two putts', 5, 2);               // "on 7" then putts
});

test('"same as last hole"', () => {
    is('same as last hole', 6, null);
    is('same as last hole for Dave', 4, null, '103');
    is('same again two putts', 6, 2);
    asks('same as last hole for Mike Smith', 'no-last');
});

test('yardage and cancel', () => {
    for (const t of ["what's my yardage", 'whats my yardage', 'how far', 'how far to the green', 'distance to the pin', 'yardage'])
        assert.equal(P.parse(t, C()).kind, 'yardage', t);
    for (const t of ['cancel', 'never mind', 'nevermind', 'forget it', 'stop'])
        assert.equal(P.parse(t, C()).kind, 'cancel', t);
    asks('', 'empty'); asks('   ', 'empty'); asks(null, 'empty');
    asks('hello there', 'no-score');
});

test('summary: the words read back', () => {
    assert.equal(P.summary(score('a 5 two putts'), { me: '101' }), 'You, a 5 (bogey) on hole 7, 2 putts');
    assert.equal(P.summary(score('birdie for Dave one putt'), { me: '101' }), 'Dave, a 3 (birdie) on hole 7, 1 putt');
    assert.equal(P.summary(score('a 5 on 9'), { me: '101' }), 'You, a 5 (par) on hole 9');
    assert.equal(P.summary({ kind: 'ask' }), '');
});

test('the grammar is pure: no network, storage, position or time', () => {
    const src = fs.readFileSync(path.join(__dirname, 'gps-voice-parse.js'), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|localStorage|geolocation|watchPosition|getCurrentPosition|firebase|\.ref\(|Date\.now|Math\.random|sendBeacon|WebSocket/);
    // the same words always give the same answer
    assert.deepEqual(P.parse('bogey for Dave two putts', C()), P.parse('bogey for Dave two putts', C()));
});
