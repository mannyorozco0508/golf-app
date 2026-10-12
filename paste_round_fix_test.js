// ============================================================================
// HARDPAN - "PASTE THE WHOLE ROUND" LANDS (gps-paste-fix, 2026-10-12)
//
// Muse's report: Read it parsed 32 golfers, Confirm said nothing, Review & Save
// showed one golfer. Confirm used to clear the list and hand the text to Paste
// Player List to read AGAIN, returning silently if that read found nobody; and it
// left a draft for a later "Fill it in". Now Confirm writes the golfers, groups and
// games itself, checks they landed, and opens Review & Save. tools/paste-round-check.js
// drives it in Chrome with Muse's exact text.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'setup-paste-ui.js'));
const skip = ON ? false : 'Consumer tree: no paste';
const P = ON ? require('./trip-setup-paste.js') : null;
const U = ON ? require('./setup-paste-ui.js') : null;
const T32 = ON ? read('tools/fixtures/paste-round-32.txt') : '';

test('Muse’s text: 8 groups of 4, 32 golfers, every handicap, a game on every group', { skip }, () => {
    const d = P.parseSetupPaste(T32, { year: 2026 }).days[0];
    assert.deepEqual(d.groups.map((g) => g.players.length), [4, 4, 4, 4, 4, 4, 4, 4]);
    assert.deepEqual(d.groups.map((g) => g.games.map((x) => x.type).join()), ['nassau', 'wolf', 'skins', 'vegas', 'bestball', 'scramble', 'bbb', 'stableford']);
    assert.ok(d.groups.every((g) => g.players.every((p) => /^\d+$/.test(p.hcp))));
    const c = P.parseSetupPaste(T32.replace(/ \((\d+)\)/g, ', $1'), { year: 2026 }).days[0];
    assert.deepEqual(c.groups.map((g) => g.players.map((p) => p.name + ' ' + p.hcp).join()), d.groups.map((g) => g.players.map((p) => p.name + ' ' + p.hcp).join()), '"Name, 12" reads the same as "Name (12)"');
});

test('"Name, 12" is a handicap; commas still separate golfers', { skip }, () => {
    const t = (s) => P.tspPlayersLine(s).players.map((p) => p.name + ':' + p.hcp).join(' | ');
    assert.equal(t('Manny Orozco, 12'), 'Manny Orozco:12');
    assert.equal(t('Manny, 8, Jimmy, 11'), 'Manny:8 | Jimmy:11');
    assert.equal(t('Manny 8, Jimmy 11'), 'Manny:8 | Jimmy:11');
    assert.equal(t('Manny, 8 vs Tom, 4'), 'Manny:8 | Tom:4');
    assert.equal(t('Marty +2, Lance 14'), 'Marty:+2 | Lance:14');
});

test('near-duplicate names are flagged and both kept; never merged', { skip }, () => {
    assert.deepEqual(U.nearDupes(['Zach Corrano', 'Zach Carrano', 'Derrick Doncaster', 'Derrick J Doncaster', 'Rob Bresnan', 'Ryan Bresnan', 'Bill Saley', 'Billy Saley']).map((x) => x.a + '/' + x.b),
        ['Zach Corrano/Zach Carrano', 'Derrick Doncaster/Derrick J Doncaster', 'Bill Saley/Billy Saley']);
    assert.deepEqual(U.nearDupes(['Al Secondi', 'Al Secondi']).map((x) => x.same), [true]);
    assert.deepEqual(U.nearDupes(['Jim Secondi', 'Rob Secondi', 'James Secondi']), [], 'brothers are not one golfer');
});

test('one format per round: groups on different formats set none and list each as not set up; one for all sets it', { skip }, () => {
    const d = P.parseSetupPaste(T32, { year: 2026 }).days[0];
    const rf = U.roundFormat(d);
    assert.equal(rf.set, null);
    assert.deepEqual(rf.notSet.map((x) => x.label + ' ' + x.group), ['Wolf Group 2', 'Best Ball Group 5', 'Scramble Group 6', 'Stableford Group 8']);
    const one = P.parseSetupPaste('GROUP 1 - WOLF $1\nA Able (1)\nB Baker (2)\nC Cole (3)\nD Dunn (4)', { year: 2026 }).days[0];
    assert.equal(U.roundFormat(one).set, 'wolf');
});

test('Round Setup: Confirm writes the round itself, checks it landed, opens Review & Save; failures are said and logged', { skip }, () => {
    const a = read('admin.html');
    const conf = a.slice(a.indexOf('function spRoundConfirm('), a.indexOf('function spRoundSideMatchesForSave('));
    assert.ok(!/commitPastedPlayers|paste-players-textarea|setDraft|spDraftOffer|queueBets/.test(conf), 'no second parse, no draft, no Fill it in');
    assert.match(conf, /rows\.forEach\(\(p\) => appendPlayerFrom\(p, false, rows\.length\)\);/);
    assert.match(conf, /if \(landed !== rows\.length\) throw new Error\('only ' \+ landed \+ ' of ' \+ rows\.length \+ ' golfers landed on the list'\);/);
    assert.match(conf, /spArriveMoney\(WIZARD_STEP_OF\.action\);/, 'the Money step is filled now');
    assert.match(conf, /goToWizardStep\(WIZARD_STEP_OF\.review\);/, 'ready to play: Review & Save');
    assert.match(conf, /\} catch \(e\) \{ spRoundFail\('Confirm', e\); \}/);
    const rd = a.slice(a.indexOf('function spRoundRead('), a.indexOf('function spRoundConfirm('));
    assert.match(rd, /\} catch \(e\) \{ spRoundFail\('Read it', e\); \}/);
    assert.match(rd, /Paste the round into the box first\./);
    assert.match(a, /console\.error\('\[paste the whole round\] ' \+ where \+ ' failed:', e\)/);
    assert.match(a, /if \(typeof spRoundSideMatchesForSave === 'function'\) Object\.assign\(payload, spRoundSideMatchesForSave\(\)\);/, 'team Nassaus in the round’s own Save');
    const flag = require('./tools/gps-flag.js');
    assert.ok(!/spRound|HardPanSetupPaste/.test(flag.applyFlag(a, false)), 'HardPan only');
});
