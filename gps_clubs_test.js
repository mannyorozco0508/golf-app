// ============================================================================
// HARDPAN GPS - MY CLUB DISTANCES + THE CLUB SUGGESTION (008, switch clubs)
//
// gps-shots.js HardPanGpsBag in a sandbox (the phone's storage only): the median of
// the last 10 per club with outliers dropped, the suggestion (the shortest club that
// still gets there, else the longest), per golfer, edit / reset - and how gps-view.js
// uses it (never in tournament mode, nothing leaves the phone).
// tools/gps-clubs-check.js marks a shot and reads the suggestion in headless Chrome.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'gps-shots.js'));
const skip = ON ? false : 'Consumer tree: no GPS';
function sandbox() {
    const store = {};
    const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const sb = { localStorage, JSON, Object, Math, Number, String, Date, isFinite };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(read('gps-shots.js'), sb);
    return { B: sb.HardPanGpsBag, store };
}

test('a club\'s number: the median of the last 10, outliers (outside 1.5 x IQR) dropped', { skip }, () => {
    const { B } = sandbox();
    assert.equal(B.clubAverage([]), null);
    assert.equal(B.clubAverage([158]).yd, 158);
    assert.equal(B.clubAverage([150, 160]).yd, 155, 'two: their middle');
    assert.deepEqual(JSON.parse(JSON.stringify(B.clubAverage([150, 152, 155, 158, 160, 300]))), { yd: 155, n: 5, of: 6 }, 'a 300-yard 7-iron (a flyer, a wrong club) is left out');
    assert.equal(B.clubAverage([60, 150, 152, 155, 158, 160]).yd, 155, 'a chunked one too');
    // The window is the last 10: an old, short season is forgotten.
    const old = [120, 120, 121, 122, 120];
    assert.equal(B.clubAverage(old.concat([150, 151, 152, 153, 154, 155, 156, 157, 158, 159])).yd, 155);
    assert.equal(B.clubAverage([150, 'x', -4, null, 160]).yd, 155, 'junk ignored');
});

test('the suggestion: the shortest club that gets there (>= the distance); none does - the longest; nothing in the bag - none', { skip }, () => {
    const { B } = sandbox();
    const bag = { '6i': { yd: 170 }, '7i': { yd: 158 }, '8i': { yd: 147 }, '9i': { yd: 136 } };
    assert.equal(B.suggestClub(bag, 150).club, '7i');
    assert.equal(B.suggestClub(bag, 158).club, '7i', 'exactly 158: the 7-iron');
    assert.equal(B.suggestClub(bag, 158.4).club, '6i');
    assert.equal(B.suggestClub(bag, 140).club, '8i');
    assert.equal(B.suggestClub(bag, 100).club, '9i', 'shorter than every club: the shortest');
    assert.equal(B.suggestClub(bag, 230).club, '6i', 'longer than every club: the closest (the longest)');
    assert.equal(B.suggestClub(bag, 150).name, '7-iron');
    assert.equal(B.suggestClub({}, 150), null);
    assert.equal(B.suggestClub(bag, null), null);
});

test('per golfer, on the phone only (yards, never a position): add, your own number wins, reset one, reset all', { skip }, () => {
    const { B, store } = sandbox();
    [150, 160, 158].forEach((y) => B.add('Manny Orozco', '7i', y));
    B.add('Joe Russo', '7i', 140);
    assert.equal(B.bag('Manny Orozco')['7i'].yd, 158);
    assert.equal(B.bag('manny  orozco')['7i'].n, 3, 'the same golfer, however the name is spaced');
    assert.equal(B.bag('Joe Russo')['7i'].yd, 140, 'each golfer their own bag');
    assert.equal(B.add('Manny Orozco', 'Putter', 30), false, 'not a club in the bag');
    assert.equal(B.add('Manny Orozco', '7i', 900), false, 'not a golf shot');
    B.set('Manny Orozco', '7i', 162);
    assert.deepEqual(JSON.parse(JSON.stringify(B.bag('Manny Orozco')['7i'])), { yd: 162, n: 3, set: true });
    B.set('Manny Orozco', '5w', 210);
    assert.equal(B.bag('Manny Orozco')['5w'].yd, 210, 'a club with no shots can be typed in');
    B.set('Manny Orozco', '7i', null);
    assert.equal(B.bag('Manny Orozco')['7i'].yd, 158, 'cleared: back to the shots');
    B.reset('Manny Orozco', '7i');
    assert.equal(B.bag('Manny Orozco')['7i'], undefined);
    B.resetAll('Manny Orozco');
    assert.deepEqual(Object.keys(B.bag('Manny Orozco')), []);
    assert.equal(B.bag('Joe Russo')['7i'].yd, 140, 'reset all is one golfer');
    assert.deepEqual(Object.keys(store), ['hardpan_bag_v1'], 'one key');
    assert.ok(!/lat|lng|\[\s*-?\d+\.\d{4,}/.test(store.hardpan_bag_v1), 'no coordinates stored: ' + store.hardpan_bag_v1);
});

test('gps-view: behind its switch; never in tournament mode; plays-like center, or the moved target; kept on the phone (no live rule)', { skip }, () => {
    const v = read('gps-view.js');
    assert.ok(/HardPanFeature\('clubs'\)/.test(v));
    ['gps-suggest gps-float" data-feature="clubs"', 'gps-bagask gps-float" data-feature="clubs"', 'gps-bag gps-float gps-scroll-ok" data-feature="clubs"', 'gps-my-bag" data-feature="clubs"']
        .forEach((m) => assert.ok(v.indexOf(m) !== -1, m));
    assert.ok(/if \(!bagSwitch\(\)\) Array\.prototype\.forEach\.call\(el\.querySelectorAll\('\[data-feature="clubs"\]'\)/.test(v), 'switch off: removed');
    assert.ok(/if \(!S \|\| !bagSwitch\(\) \|\| tournament\(\)/.test(v), 'no "Which club?" in tournament mode');
    assert.ok(/if \(bagSwitch\(\) && !tournament\(\) && S\.pro/.test(v), 'no suggestion in tournament mode');
    assert.ok(/var moved = !!\(S\.targetMoved && S\.target\), to = moved \? S\.target : aimAt\(r\);/.test(v) && /playsTo\(moved \? S\.target : null\)/.test(v), 'plays-like to the center, or to the moved target');
    assert.ok(/'Suggested: ' \+ sg\.name \+ ' \(your ' \+ bagShown\(sg\.yd\) \+ '\)'/.test(v), '"Suggested: 7-iron (your 158)"');
    assert.ok(/bagAsk\(m \/ G\.M_PER_YD\);/.test(v), 'asked after the measured shot');
    const sec = v.slice(v.indexOf('// ---- MY CLUB DISTANCES'), v.indexOf('// ONE TAP (gps-features): the shot, here'));
    assert.ok(sec.length > 500 && !/\.ref\(|\.set\(|\.update\(|fetch\(/.test(sec.replace(/B\.set\(/g, '')), 'nothing written to the database or sent');
    // The live rules have no per-golfer path a phone may write this to (pushPrefs/<uid> takes bets / hype only).
    const rules = JSON.parse(read('database.rules.json')).rules;
    assert.equal(rules.pushPrefs.$uid.$other['.validate'], false);
    assert.ok(!rules.player_clubs && !rules.users, 'no per-user path for a bag in the live rules (the report names the rule needed)');
});
