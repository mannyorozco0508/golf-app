// ============================================================================
// THE WEEKLY GAME'S CODE ASKS WHICH GROUP (013 setup sims, 2026-10-18)
//
// Round Ready says "One link for the whole round - each golfer picks their group
// when they open it. Or tell them the code ...: pick your group." Home's Join made
// that code - and that pasted link - a read-only spectator with no group sheet, so
// golfers who joined a 5-group weekly game by its code could not keep score.
// Now a bare code / bare round link on a round with more than one group opens the
// round's own link (index.html?game=CODE), where the scorecard asks "How are you
// joining this round?". A one-group round, a leaderboard link and ?spectate=1 are
// still spectators; CODE 2 / CODE-G-KEY / a group link are unchanged.
// Chrome: tools/sim/setup-games-first.js (C paths), tools/join-stuck-check.js.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ON = fs.existsSync(path.join(__dirname, 'front-door.js'));
const skip = ON ? false : 'Consumer tree: no front doors';

function doors() {
    const noop = () => {};
    const store = { getItem: () => null, setItem: noop, removeItem: noop };
    const W = { localStorage: store, sessionStorage: store, location: { search: '', pathname: '/home.html', hash: '', href: '' },
        document: { addEventListener: noop, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], readyState: 'complete',
            createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop }), head: { appendChild: noop }, body: { appendChild: noop, classList: { add: noop, remove: noop, contains: () => false } } },
        addEventListener: noop, setTimeout, clearTimeout, navigator: {} };
    W.window = W;
    vm.createContext(W);
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'grouping.js'), 'utf8'), W);
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'front-door.js'), 'utf8'), W);
    return W.HardPanDoors;
}
const round = (n, gso) => ({ players: Array.from({ length: n }, (_, i) => ({ id: 101 + i, name: 'G' + i })), groupSizeOverrides: gso || {} });

test('a bare code on a 20-golfer, 5-group round opens the group sheet, not a spectator', { skip }, () => {
    const D = doors();
    const j = D.joinTarget('yw75z5');
    assert.strictEqual(D.joinHref(j, round(20)), 'index.html?game=YW75Z5');
});

test('the pasted whole-round link (no group) does the same', { skip }, () => {
    const D = doors();
    assert.strictEqual(D.joinHref(D.joinTarget('https://golf-app-5a5.pages.dev/index.html?game=YW75Z5'), round(20)), 'index.html?game=YW75Z5');
    assert.strictEqual(D.joinHref(D.joinTarget('https://golf-app-5a5.pages.dev/?game=YW75Z5'), round(8)), 'index.html?game=YW75Z5');
});

test('still a spectator: a one-group round, a leaderboard link, an explicit spectate=1', { skip }, () => {
    const D = doors();
    assert.strictEqual(D.joinHref(D.joinTarget('ABCD12'), round(4)), 'index.html?game=ABCD12&spectate=1');
    assert.strictEqual(D.joinHref(D.joinTarget('https://x.dev/leaderboard.html?game=YW75Z5'), round(20)), 'index.html?game=YW75Z5&spectate=1');
    assert.strictEqual(D.joinHref(D.joinTarget('https://x.dev/index.html?game=YW75Z5&spectate=1'), round(20)), 'index.html?game=YW75Z5&spectate=1');
});

// 100b (Manny's 099 answer 4): a join that names a group now also asks "who are you" on the card (&askme=1).
test('group forms are unchanged: CODE 2, CODE-G-KEY, a group link (+ askme, 100b)', { skip }, () => {
    const D = doors();
    assert.strictEqual(D.joinHref(D.joinTarget('YW75Z5 2'), round(20)), 'index.html?game=YW75Z5&group=2&askme=1');
    assert.strictEqual(D.joinHref(D.joinTarget('YW75Z5-3-K7Q9XM'), round(20)), 'index.html?game=YW75Z5&group=3&sk=K7Q9XM&askme=1');
    assert.strictEqual(D.joinHref(D.joinTarget('https://x.dev/index.html?game=YW75Z5&group=4'), round(20)), 'index.html?game=YW75Z5&group=4&askme=1');
});

test('the groups come from the round (groupSizeOverrides): six golfers in threes is two groups', { skip }, () => {
    const D = doors();
    assert.strictEqual(D.joinHref(D.joinTarget('SIXER1'), round(6, { 0: 3 })), 'index.html?game=SIXER1');
});
