// ============================================================================
// ONE LINK, ONE CODE, THEN THE GOLFER PICKS THEIR GROUP (2026-09-20)
//
// A golfer arriving on a round with more than one group and no ?group= in the
// URL used to land in a silent spectator view: every card on screen, none of it
// writable, and no way to score their own four without going back to the text
// for the right link. Now the page asks - "Which group are you keeping score
// for?" - lists the foursomes by first name, and a tap navigates to
// ?game=CODE&group=N. The lock is unchanged: it is the URL, read once at load,
// and everything below it (canWritePlayer, the badge, the slice) is today's.
// "Just watching" keeps the spectator view for the people who came to look.
//
// TWO DOORS, SAME ROOM. The organizer sends ONE link - the round's own
// index.html?game=CODE - to the group chat; Round Ready now offers it as the
// headline thing to send, with the per-group rows underneath. And the lobby's
// join box takes the round code and lands on the same picker: it used to refuse
// to carry a group on the grounds that it would hand scorekeeper rights to
// anybody who knows the code, but anybody who knows the code can already type
// &group=3 into Safari and the rules permit any client to write any child of an
// existing round. The lock keeps four friends on their own card - a courtesy,
// not a wall - and refusing the group in the lobby only made the app worse than
// Safari for an honest golfer. A typed "ABCD 2" skips the picker.
//
// LOOK BEFORE IT LEAPS. The join box used to navigate first and find out later,
// so a mistyped code showed a golfer "No data found for this room. Waiting for
// Admin to save settings..." - a sentence written for an organizer's unsaved
// round. It now reads events/CODE through the issuer's timer first: no round,
// offline, or a letter no code can contain (I, O, 0, 1) is said INLINE under the
// field, and nothing navigates.
//
// HARNESS. mini-dom: the page's own value listener delivers the round the way a
// browser's snapshot does (helpers/scope-closed-round.js's arrive pattern); the
// picker's markup is a string, read as one. location.href is a stub, so the tap
// is proven by the URL it assigns and, separately, by loading a page at that URL
// and reading the lock the way index.html reads it. The tool
// tools/code-entry-check.js types into the real field in Chrome.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const strip = (h) => String(h || '').replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ').trim();
const tick = () => new Promise(r => setImmediate(r));
const NAMES = ['Marty Sharp', 'Scott Dean', 'Carp Webb', 'Randy Hill', 'Manny Orozco', 'Matt Bell',
               'Lance Webb', 'Kopp Jones', 'Marcus Lee', 'Rocco Ray', 'Matt Hall', 'Jeremy Fox'];

function round(n, overrides) {
    const cd = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
    const ps = NAMES.slice(0, n).map((name, i) => ({ id: 101 + i, name, hcp: '9', playingForMoney: true }));
    const d = { eventName: 'Monday', courseName: 'Camas Meadows', gameFormat: 'stroke', players: ps, courseData: cd, scores: {} };
    if (overrides) d.groupSizeOverrides = overrides;
    return d;
}

// ARRIVE the way a golfer does: the URL, then the page's own listener.
function arrive(query, data) {
    const sb = loadHtmlInlineScript('index.html', [], { search: query });
    vm.runInContext("document.__mount(document.getElementById('group-pick-overlay')); document.__mount(document.getElementById('group-pick-body'));", sb);
    const code = /game=([A-Z0-9]+)/.exec(query)[1];
    const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/' + code);
    if (!h) throw new Error('index.html registered no round listener');
    h.cb({ val: () => JSON.parse(JSON.stringify(data)), exists: () => true });
    return {
        sb,
        run: c => vm.runInContext(c, sb),
        overlayDisplay: () => String(vm.runInContext("document.getElementById('group-pick-overlay').style.display || ''", sb)),
        body: () => String(vm.runInContext("document.getElementById('group-pick-body').innerHTML || ''", sb)),
        href: () => String(vm.runInContext('location.href', sb)),
    };
}

describe('THE PICKER, ON ARRIVAL', () => {
    test('a bare link on a twelve-golfer round asks which group, names the foursomes, and offers to just watch', () => {
        const a = arrive('?game=MNDY2', round(12));
        assert.equal(a.overlayDisplay(), 'flex', 'the picker is up');
        const t = strip(a.body());
        assert.match(t, /Group 1 · Marty, Scott, Carp, Randy/);
        // v194: the Board's names - two Matts in the round, so Matt B. and Matt H.
        assert.match(t, /Group 2 · Manny, Matt B\., Lance, Kopp/);
        assert.match(t, /Group 3 · Marcus, Rocco, Matt H\., Jeremy/);
        // the question and the watching option are static markup (mini-dom does
        // not parse static children into innerHTML) - read from the source
        const src = read('index.html');
        const at = src.indexOf('id="group-pick-overlay"');
        const overlay = src.slice(at, src.indexOf('<!-- Dot Game Modal -->', at));
        assert.match(overlay, /Which group are you keeping score for\?/);
        assert.match(overlay, /onclick="dismissGroupPick\(\)">Just watching</);
        assert.equal((a.body().match(/onclick="pickGroup\(\d+\)"/g) || []).length, 3, 'one button per group');
    });

    test('a foursome never sees it', () => {
        const a = arrive('?game=FRSM', round(4));
        assert.notEqual(a.overlayDisplay(), 'flex');
        assert.equal(a.body(), '');
    });

    test('a group link never sees it - the lock is already decided', () => {
        const a = arrive('?game=MNDY2&group=2', round(12));
        assert.notEqual(a.overlayDisplay(), 'flex');
        assert.equal(a.run('hasGroupLock'), true);
    });

    test('a tap navigates to ?game=CODE&group=N, keeping the other params', () => {
        const a = arrive('?game=MNDY2&me=105', round(12));
        a.run('pickGroup(2)');
        const u = new URL(a.href(), 'https://golf-app-5a5.pages.dev/');
        assert.equal(u.pathname, '/index.html');
        assert.equal(u.searchParams.get('game'), 'MNDY2');
        assert.equal(u.searchParams.get('group'), '2');
        assert.equal(u.searchParams.get('me'), '105', 'nothing else in the URL is dropped');
    });

    test('and THAT URL produces exactly the lock a group link produces today', () => {
        const a = arrive('?game=MNDY2', round(12));
        a.run('pickGroup(2)');
        const dest = new URL(a.href(), 'https://golf-app-5a5.pages.dev/');
        const b = arrive(dest.search, round(12));
        assert.equal(b.run('hasGroupLock'), true);
        assert.equal(b.run('lockedGroup'), 2);
        assert.equal(b.run("canWritePlayer('105')"), true, 'Manny, group 2, is theirs to score');
        assert.equal(b.run("canWritePlayer('101')"), false, 'Marty, group 1, is not');
        assert.deepEqual(JSON.parse(b.run('JSON.stringify(window.__scFilteredPlayers.map(p => p.id))')), [105, 106, 107, 108]);
        assert.notEqual(b.overlayDisplay(), 'flex');
    });

    test('"Just watching" closes it and leaves the spectator view; it stays closed for this round in this session', () => {
        const a = arrive('?game=MNDY2', round(12));
        assert.equal(a.overlayDisplay(), 'flex');
        a.run('dismissGroupPick()');
        assert.equal(a.overlayDisplay(), 'none');
        assert.equal(a.run('hasGroupLock'), false, 'no lock was manufactured');
        assert.equal(a.run("canWritePlayer('101')"), false, 'still a spectator');
        // a second snapshot (a score landing somewhere) must not re-open it
        const h = a.sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/MNDY2');
        h.cb({ val: () => round(12), exists: () => true });
        assert.equal(a.overlayDisplay(), 'none');
        assert.equal(a.run("sessionStorage.getItem('groupPickDismissed:MNDY2')"), '1');
    });

    test('A REGROUPED ROUND: the picker names the foursomes as they are NOW, read at the moment of joining', () => {
        // 12 golfers regrouped 3/3/3/3 by the wizard's size overrides: group 2 is
        // golfers 4-6, not 5-8. A link with a stale N would be wrong; the picker
        // cannot be, because it reads the boundaries the page just computed.
        const a = arrive('?game=MNDY2', round(12, { 0: 3, 1: 3, 2: 3, 3: 3 }));
        const t = strip(a.body());
        assert.match(t, /Group 1 · Marty, Scott, Carp\|/);
        assert.match(t, /Group 2 · Randy, Manny, Matt B\.\|/);   // v194
        assert.match(t, /Group 4 · Rocco, Matt H\., Jeremy/);   // v194
        assert.equal((a.body().match(/pickGroup\(/g) || []).length, 4);
    });

    test('the lock itself did not move: one URL read, one predicate, the gate index.html always used', () => {
        const src = read('index.html');
        assert.match(src, /let hasGroupLock = urlParams\.get\('group'\) !== null;/);
        assert.match(src, /const isMultiGroupRound = players\.length > 4;/);
        const at = src.indexOf('function pickGroup(');
        const fn = src.slice(at, src.indexOf('\n    }', at));
        assert.doesNotMatch(fn, /hasGroupLock\s*=|lockedGroup\s*=|selectedGroup\s*=/, 'the tap navigates; it does not set the lock in place');
        assert.match(fn, /window\.location\.href = /);
    });
});

// ============================================================================

function lobby(reads) {
    const sb = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js', 'code-issuer.js', 'grouping.js']);
    sb.__dbReads = reads || {};
    vm.runInContext("alert = function (m) { window.__said = (window.__said || []).concat([String(m)]); }; uiRefuse = function (m) { window.__said = (window.__said || []).concat([String(m)]); }; uiFail = function (m) { window.__said = (window.__said || []).concat([String(m)]); }; uiToast = function (m) { window.__said = (window.__said || []).concat([String(m)]); };"
        + " location = { href: 'https://golf-app-5a5.pages.dev/admin.html', origin: 'https://golf-app-5a5.pages.dev', pathname: '/admin.html' }; window.location = location;"
        + " navigator.onLine = true; document.__mount(document.getElementById('join-code-refusal'));"
        // record every once() read so a refusal can prove it asked nothing
        + " (function () { var realRef = db.ref.bind(db); db.ref = function (p) { var r = realRef(p); var o = r.once.bind(r); r.once = function () { (window.__onceReads = window.__onceReads || []).push(p); return o.apply(r, arguments); }; return r; }; })();", sb);
    return {
        sb,
        type: v => vm.runInContext(`document.getElementById('join-code-input').value = ${JSON.stringify(v)};`, sb),
        go: async () => { await vm.runInContext('openRoundByCode();', sb); await tick(); await tick(); },
        href: () => String(vm.runInContext('location.href', sb)),
        refusal: () => String(vm.runInContext("document.getElementById('join-code-refusal').textContent || ''", sb)).trim(),
        refusalShown: () => String(vm.runInContext("document.getElementById('join-code-refusal').style.display || ''", sb)),
        said: () => JSON.parse(vm.runInContext('JSON.stringify(window.__said || [])', sb)),
        // the standing line's one read of organizers/<uid> at load (2026-09-20) is
        // not a code lookup; the refusals below are about the code field's reads
        reads: () => JSON.parse(vm.runInContext('JSON.stringify(window.__onceReads || [])', sb)).filter(p => !/^organizers\//.test(p)),
    };
}
const LOBBY_HREF = 'https://golf-app-5a5.pages.dev/admin.html';

describe('THE JOIN BOX LOOKS BEFORE IT LEAPS', () => {
    test('a real code on a twelve-golfer round opens the scorecard bare - the picker takes it from there', async () => {
        const l = lobby({ 'events/MNDY2A': round(12) });
        l.type('mndy2a'); await l.go();
        assert.equal(l.href(), 'index.html?game=MNDY2A');
        assert.equal(l.refusal(), '');
    });
    test('THE TYPED SHORTCUT: "ABCD 2" skips the picker - a space, a slash or a dash between the code and the group', async () => {
        for (const typed of ['MNDY2A 2', 'mndy2a/2', 'MNDY2A-2', ' mndy2a  2 ']) {
            const l = lobby({ 'events/MNDY2A': round(12) });
            l.type(typed); await l.go();
            assert.equal(l.href(), 'index.html?game=MNDY2A&group=2', JSON.stringify(typed));
        }
    });
    test('the shortcut cannot be mistaken for a longer code: "MNDY2A2" is the code MNDY2A2, not group 2', async () => {
        const l = lobby({ 'events/MNDY2A2': round(4) });
        l.type('MNDY2A2'); await l.go();
        assert.equal(l.href(), 'index.html?game=MNDY2A2');
    });
    test('a shortcut group the round does not have opens the picker instead', async () => {
        const l = lobby({ 'events/MNDY2A': round(12) });
        l.type('MNDY2A 7'); await l.go();
        assert.equal(l.href(), 'index.html?game=MNDY2A', 'bare - the picker shows the three groups that exist');
    });
    test('a pasted group link still keeps its group, checked the same way', async () => {
        const l = lobby({ 'events/MNDY2A': round(12) });
        l.type('https://golf-app-5a5.pages.dev/index.html?game=MNDY2A&group=3'); await l.go();
        assert.equal(l.href(), 'index.html?game=MNDY2A&group=3');
    });

    test('REFUSAL 1 - no round: said inline, nothing navigates, no dialog', async () => {
        const l = lobby({});
        l.type('ZZZZZZ'); await l.go();
        assert.equal(l.href(), LOBBY_HREF, 'stayed on the lobby');
        assert.equal(l.refusalShown(), 'block');
        assert.equal(l.refusal(), 'No round with the code ZZZZZZ — check it with your organizer.');
        assert.deepEqual(l.said(), [], 'no alert()');
    });
    test('REFUSAL 2 - a letter no code can contain (I, O, 0, 1): said before any read', async () => {
        for (const [typed, shown] of [['ABCIEF', 'ABCIEF'], ['ABC0EF', 'ABC0EF'], ['abcoef', 'ABCOEF'], ['AB1CEF', 'AB1CEF']]) {
            const l = lobby({ 'events/ABCIEF': round(4) });
            l.type(typed); await l.go();
            assert.equal(l.href(), LOBBY_HREF, typed);
            assert.equal(l.refusal(), 'That code has a letter no round code uses (I, O, 0 or 1) — check it with your organizer.', typed);
            assert.deepEqual(l.reads(), [], typed + ': no database read for a code that cannot exist');
        }
    });
    test('REFUSAL 3 - offline: said without a read, nothing navigates into a blank card', async () => {
        const l = lobby({ 'events/MNDY2A': round(12) });
        vm.runInContext('navigator.onLine = false;', l.sb);
        l.type('MNDY2A'); await l.go();
        assert.equal(l.href(), LOBBY_HREF);
        assert.equal(l.refusal(), 'Can’t check that code right now — try again when you have signal.');
        assert.deepEqual(l.reads(), []);
    });
    test('REFUSAL 3b - the read times out (a bar of signal, no throughput): the same sentence', async () => {
        const l = lobby({ 'events/MNDY2A': round(12) });
        vm.runInContext("readWithTimeout = function () { const e = new Error('slow'); e.code = 'timeout'; return Promise.reject(e); };", l.sb);
        l.type('MNDY2A'); await l.go();
        assert.equal(l.href(), LOBBY_HREF);
        assert.equal(l.refusal(), 'Can’t check that code right now — try again when you have signal.');
    });
    test('an empty field is still refused, inline now', async () => {
        const l = lobby({});
        l.type(''); await l.go();
        assert.equal(l.href(), LOBBY_HREF);
        assert.equal(l.refusal(), 'Enter the game code your organizer sent.');
    });
    test('a refusal clears the moment a good code opens', async () => {
        const l = lobby({ 'events/MNDY2A': round(12) });
        l.type('ZZZZZZ'); await l.go();
        assert.notEqual(l.refusal(), '');
        l.type('MNDY2A'); await l.go();
        assert.equal(l.refusal(), '');
        assert.equal(l.refusalShown(), 'none');
    });
    test('the lobby comment tells the truth about the lock now', () => {
        const src = read('admin.html');
        const at = src.indexOf('function openRoundByCode(');
        const above = src.slice(at - 2600, at);
        assert.doesNotMatch(above, /hand scorekeeper rights over another foursome to anybody who knows the code/);
        const flat = above.replace(/\n\s*\/\/ ?/g, ' ');   // the comment, unwrapped
        assert.match(flat, /a courtesy, not a wall/);
        assert.match(flat, /worse than Safari/);
        assert.match(above, /readWithTimeout/, 'the read goes through the issuer\'s timer');
    });
    test('the note under the field says what a typed code gives you now', () => {
        const src = read('admin.html');
        const at = src.indexOf('id="join-code-note"');
        const note = src.slice(src.indexOf('>', at) + 1, src.indexOf('</p>', at)).replace(/\s+/g, ' ').trim();
        assert.equal(note, 'Type the code your organizer sent. On a round with more than four golfers you pick your group next.');
    });
});

// ============================================================================

describe('ROUND READY: ONE LINK IS THE HEADLINE THING TO SEND', () => {
    function ready(n, overrides) {
        const sb = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js', 'code-issuer.js', 'grouping.js']);
        vm.runInContext("document.__mount(document.getElementById('rr-links-box')); currentMode = 'MNDY2A'; location = { href: 'https://golf-app-5a5.pages.dev/admin.html', origin: 'https://golf-app-5a5.pages.dev', pathname: '/admin.html' }; window.location = location;", sb);
        sb.__d = round(n, overrides);
        vm.runInContext('renderRoundReadyLinks(__d);', sb);
        return String(vm.runInContext("document.getElementById('rr-links-box').innerHTML", sb));
    }
    test('twelve golfers: the round\'s own link first, then the per-group rows', () => {
        const h = ready(12);
        const t = strip(h);
        assert.match(t, /Send this link to everyone/);
        assert.match(t, /One link for the whole round — each golfer picks their group when they open it\. Or tell them the code MNDY2A: in the app, tap Open and pick your group\./);
        assert.match(h, /copyRoundLink\('https:\/\/golf-app-5a5\.pages\.dev\/index\.html\?game=MNDY2A'\)/, 'the bare round link, copyable - its own copier (2026-09-20; copyGroupLink(url, 0) said "Group 0")');
        assert.ok(h.indexOf('rr-round-link') < h.indexOf('class="group-link-row"'), 'headline first');
        assert.match(t, /Or send each group its own link/);
        assert.equal((h.match(/class="group-link-row"/g) || []).length, 3, 'the per-group rows are still there, one each');
        assert.match(h, /game=MNDY2A&group=3/);
    });
    test('a foursome: unchanged - one group, one link, no headline', () => {
        const h = ready(4);
        assert.doesNotMatch(h, /rr-round-link|Send this link to everyone/);
        assert.equal((h.match(/class="group-link-row"/g) || []).length, 1);
        assert.match(h, /game=MNDY2A&group=1/);
    });
    test('the headline is not a .group-link-row, so the field-coverage measurement (tools/round-share-check.js) counts what it always counted', () => {
        // RE-PINNED 2026-09-20: the first version sliced up to the first
        // 'group-link-row' - which was INSIDE the headline's own class list
        // ("group-link-row rr-round-link-row"), so the slice was empty and the
        // negative vacuous. The headline row shipped with the counted class and
        // tools/round-share-check.js failed on it. Positive assertion first now.
        const h = ready(12);
        const head = h.slice(h.indexOf('rr-round-link'), h.indexOf('Or send each group'));
        assert.match(head, /class="rr-round-link-row"/, 'the headline row exists');
        assert.doesNotMatch(head, /group-link-row/);
    });
});
