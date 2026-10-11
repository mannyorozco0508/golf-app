// ============================================================================
// PASTE THE WHOLE TRIP / ROUND - the parser (trip-setup-paste.js), pure.
// Group-chat text, a booking email, a numbered list: days, courses, tee times,
// groups, teams, handicaps, games (EXISTING types only; others flagged + skipped).
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const I = require('./trip-itinerary.js');
Object.assign(global, { tripItinParseLine: I.tripItinParseLine, tripItinTime: I.tripItinTime, tripItinCourse: I.tripItinCourse });
const P = require('./trip-setup-paste.js');
const parse = (t) => P.parseSetupPaste(t, { year: 2026 });
const names = (g) => g.players.map((p) => p.name);
const why = (r) => r.flags.map((f) => f.why);

test('A) group chat: days, groups, handicaps, the day\'s games; Wolf on the day line; a day with no groups is asked', () => {
    const r = parse(`Myrtle trip!!
Tue 10/13 Caledonia 8:24
group 1: Manny 8, Jimmy 11, Paul 3.5, Marty 9
group 2: Lance 14, Ben 6, Cal 12, Dee 20
games: $5 nassau, $2 skins
Wed 10/14 True Blue 9:10 - wolf $1 everyone`);
    assert.equal(r.days.length, 2);
    const [d1, d2] = r.days;
    assert.deepEqual([d1.date, d1.time, d1.courseName], ['2026-10-13', '08:24', 'Caledonia']);
    assert.deepEqual(d1.groups.map(names), [['Manny', 'Jimmy', 'Paul', 'Marty'], ['Lance', 'Ben', 'Cal', 'Dee']]);
    assert.deepEqual(d1.groups[0].players.map((p) => p.hcp), ['8', '11', '3.5', '9']);
    assert.deepEqual(d1.games.map((g) => g.type), ['nassau', 'skins'], 'a "games:" line is the whole day\'s');
    assert.deepEqual([d1.games[0].front, d1.games[0].back, d1.games[0].overall, d1.games[1].amount], [5, 5, 5, 2]);
    assert.deepEqual([d2.courseName, d2.games[0].type, d2.games[0].perPoint], ['True Blue', 'wolf', 1]);
    assert.ok(why(r).includes('No groups listed - use Day 1’s groups?'));
    assert.equal(why(r).filter((w) => /Who plays whom/.test(w)).length, 2, 'no teams in a foursome: the Nassau sides are asked');
    assert.equal(r.players.length, 8);
});

test('B) numbered email: full weekday names, en dashes, "(8)" handicaps, teams per foursome, 27-hole nines, "same groups"', () => {
    const r = parse(`1. Tuesday, October 13 – Caledonia Golf & Fish Club, 8:24 AM
   Foursome A: Manny (8) & Jimmy (11) vs Paul (3.5) & Marty (9) – $5 Nassau, best ball
   Foursome B: Lance, Ben, Cal, Dee – skins $2 carry
2. Thursday, October 15 – Thistle (McKay/Cameron), 10:00 AM – same groups`);
    const [d1, d2] = r.days;
    assert.equal(d1.courseName, 'Caledonia Golf & Fish Club');
    const a = d1.groups[0];
    assert.equal(a.label, 'Foursome A');
    assert.deepEqual(a.players.map((p) => p.hcp), ['8', '11', '3.5', '9']);
    assert.deepEqual(a.teams, [['Manny', 'Jimmy'], ['Paul', 'Marty']]);
    assert.deepEqual(a.games.map((g) => g.type), ['nassau', 'bestball']);
    assert.deepEqual([d1.groups[1].games[0].amount, d1.groups[1].games[0].carry], [2, true]);
    assert.deepEqual([d2.date, d2.time, d2.courseName, d2.nines], ['2026-10-15', '10:00', 'Thistle', ['McKay', 'Cameron']]);
    assert.deepEqual(d2.groups.map(names), d1.groups.map(names), 'same groups');
    assert.equal(d2.groups[0].games.length, 0, '...but not the first day\'s games');
    assert.ok(!why(r).some((w) => /Who plays whom/.test(w)), 'teams named: team vs team, nothing to ask');
});

test('C) one round: a weekday without a date is asked; "/" pairs and "vs"; auto press; everyone skins; Vegas skipped', () => {
    const r = parse(`Sat at Dobson 7:30
Manny 8 / Jimmy 11 vs Paul 4 / Marty 9   $10 nassau auto press
skins $5 everyone
vegas $1 a point`);
    const d = r.days[0];
    assert.deepEqual([d.date, d.weekday, d.time, d.courseName], [null, 'Sat', '07:30', 'Dobson']);
    const g = d.groups[0];
    assert.deepEqual(g.teams, [['Manny', 'Jimmy'], ['Paul', 'Marty']]);
    const n = g.games.find((x) => x.type === 'nassau');
    assert.deepEqual([n.front, n.back, n.overall, n.press], [10, 10, 10, 'auto']);
    assert.ok(g.games.some((x) => x.type === 'skins' && x.amount === 5 && x.everyone));
    const sk = r.flags.find((f) => f.level === 'skip');
    assert.match(sk.why, /"vegas" is not a game in this app - skipped/);
    assert.ok(why(r).some((w) => /Sat has no date/.test(w)));
});

test('messy text: bullets, emoji, "and", blank lines between groups, flights, a $5/5/10 Nassau, unknown games, odd lines', () => {
    const r = parse(`⛳️ Saturday game!!!
• Sat 10/17 Dobson Ranch 7:30 am
Manny 8
Jimmy (11)
B Paul 3.5
Marty +2

Lance 14 and Ben 6
- $5/5/10 nassau press
- bingo bango bongo
- snake $2
call me if you can't make it`);
    const d = r.days[0];
    assert.equal(d.courseName, 'Dobson Ranch');
    assert.deepEqual(d.groups.map(names), [['Manny', 'Jimmy', 'Paul', 'Marty'], ['Lance', 'Ben']], 'a blank line starts a group');
    assert.deepEqual(d.groups[0].players.map((p) => p.hcp), ['8', '11', '3.5', '+2']);
    assert.equal(d.groups[0].players[2].flight, 'B');
    const n = d.groups[1].games.find((x) => x.type === 'nassau');
    assert.deepEqual([n.front, n.back, n.overall, n.press], [5, 5, 10, 'manual']);
    assert.equal(r.flags.filter((f) => f.level === 'skip').length, 2, 'bingo bango bongo and snake skipped');
    assert.ok(r.flags.some((f) => /call me/.test(f.text) && /Not understood/.test(f.why)), 'chatter is shown, not guessed at');
});

test('checks a golfer wants: two handicaps for one name, a golfer in two groups, a group of 6, a Nassau with no amount', () => {
    const r = parse(`Fri 10/16 Man O War 9:00
Group 1: Manny 8, Jimmy 11, Paul 3, Marty 9, Lance 14, Ben 6
Group 2: Manny 9, Cal 12
nassau`);
    const w = why(r);
    assert.ok(w.some((x) => /Group 1 has 6 golfers/.test(x)));
    assert.ok(w.some((x) => /Manny is in two groups on the same day/.test(x)));
    assert.ok(w.some((x) => /Manny has two handicaps \(8 and 9\)/.test(x)));
    assert.ok(w.some((x) => /Nassau with no amount/.test(x)));
});

test('only EXISTING game types come out; the unknown list is skipped, never mapped to something close', () => {
    const g = P.tspGames('$5 nassau, skins $2 no carry, wolf $1, best ball, scramble, stableford, hi-lo, team match, stroke play, birdie game $1, greenies $2, vegas $1, rabbit');
    assert.deepEqual(g.games.map((x) => x.type), ['nassau', 'skins', 'wolf', 'bestball', 'scramble', 'stableford', 'hilo', 'ryder', 'stroke', 'birdie', 'dots']);
    assert.equal(g.games[1].carry, false);
    assert.deepEqual(g.flags.map((f) => f.level), ['skip', 'skip']);
});
