// ============================================================================
// WITH NO SIGNAL, HOME OFFERS THE ROUND YOU ARE ON (2026-10-06)
//
// Home is the consumer start_url, so a Home Screen icon opens it - and offline
// the only thing it could offer was "Resume ABCD": a six-character code that
// tells a golfer nothing about which round it is, with no way back to their own
// group's card except the picker.
//
// WHAT THE ROWS NEED, AND WHERE EACH PART COMES FROM:
//   the course    the stored snapshot (the record knows its own course)
//   N waiting     the durable queue, counted per round code
//   the group     ONLY the URL ever knew it, so the snapshot records it at save
//                 time; a resume link without it sends a scorekeeper who has
//                 been on Group 2 all afternoon back through the group picker
//
// THE DECISIONS LIVE IN offline-queue.js, so this file drives them directly and
// then checks that admin.html paints what they return rather than deciding
// anything again. tools/offline-read-pages-check.js opens Home with no signal
// in Chrome, which is the half a unit test cannot do.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Q = require('./offline-queue.js');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

const ADMIN = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');

// A store shaped like localStorage, INCLUDING key(i) and length - which is how
// the round list is found at all, and the reason a Map with only get/set would
// have proved nothing.
function store() {
    const m = new Map();
    return {
        getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
        setItem: (k, v) => { m.set(String(k), String(v)); },
        removeItem: (k) => { m.delete(String(k)); },
        key: (i) => [...m.keys()][i],
        get length() { return m.size; },
        raw: m
    };
}
const round = (course, n) => ({ eventName: 'Saturday', courseName: course,
    players: Array.from({ length: n || 4 }, (_, i) => ({ id: 101 + i, name: 'G' + i })),
    scores: {}, gameFormat: 'stroke' });

describe('1. WHAT HOME CAN OFFER FROM THE PHONE ALONE', () => {

    test('a round opened on this phone is listed with its course and its group', () => {
        const s = store();
        Q.saveSnapshot(s, 'ABCD', round('Dobson Ranch'), { group: 2 });
        const list = Q.localRounds(s);
        assert.equal(list.length, 1);
        assert.equal(list[0].code, 'ABCD');
        assert.equal(list[0].courseName, 'Dobson Ranch');
        assert.equal(list[0].group, 2, 'the group is the one thing only the URL knew');
        assert.equal(Q.resumeHref(list[0]), 'index.html?game=ABCD&group=2');
        assert.match(Q.resumeLabel(list[0]), /Resume Dobson Ranch/);
    });

    test('and the count of unsent edits is per ROUND, not a total', () => {
        const s = store();
        Q.saveSnapshot(s, 'ABCD', round('Dobson Ranch'), { group: 2 });
        Q.saveSnapshot(s, 'WXYZ', round('Camas Meadows'), { group: 1 });
        for (let h = 1; h <= 3; h++) {
            Q.enqueue(s, { path: 'events/ABCD/scores/p101_h' + h, type: 'set', value: 4,
                           coalesceKey: 'a' + h });
        }
        Q.enqueue(s, { path: 'events/WXYZ/scores/p101_h1', type: 'set', value: 5, coalesceKey: 'w1' });
        const byCode = {};
        Q.localRounds(s).forEach((r) => { byCode[r.code] = r; });
        assert.equal(byCode.ABCD.waiting, 3);
        assert.equal(byCode.WXYZ.waiting, 1, 'the other round took this round’s count');
        assert.match(Q.resumeLabel(byCode.ABCD), /Dobson Ranch · 3 waiting/);
        // NOTHING WAITING, NOTHING CLAIMED: a synced round says just the course.
        Q.clear(s);
        assert.doesNotMatch(Q.resumeLabel(Q.localRounds(s)[0]), /waiting/);
    });

    test('newest first, because that is the round they are on', () => {
        const s = store();
        Q.saveSnapshot(s, 'OLD1', round('Old Course'), { group: 1 });
        const bumped = JSON.parse(s.getItem(Q.SNAPSHOT_PREFIX + 'OLD1'));
        bumped.at = 1000;                       // an hour ago
        s.setItem(Q.SNAPSHOT_PREFIX + 'OLD1', JSON.stringify(bumped));
        Q.saveSnapshot(s, 'NEW1', round('New Course'), { group: 3 });
        assert.deepEqual(Q.localRounds(s).map((r) => r.code), ['NEW1', 'OLD1']);
    });

    test('a round with no group resumes to the bare link, not to &group=null', () => {
        const s = store();
        Q.saveSnapshot(s, 'BARE', round('Somewhere'), null);
        assert.equal(Q.resumeHref(Q.localRounds(s)[0]), 'index.html?game=BARE');
    });

    test('and re-saving a round KEEPS the group it already had', () => {
        // The scorecard saves on every snapshot, and an organizer who opens the
        // same round from a link WITHOUT ?group= must not wipe the group this
        // phone has been scoring - that would quietly send the next resume
        // through the picker.
        const s = store();
        Q.saveSnapshot(s, 'ABCD', round('Dobson Ranch'), { group: 2 });
        Q.saveSnapshot(s, 'ABCD', round('Dobson Ranch'), null);
        assert.equal(Q.localRounds(s)[0].group, 2);
    });
});

describe('2. HOME PAINTS THEM, AND ONLY WITH NO SIGNAL', () => {

    function home({ online, rounds = [] }) {
        const sb = loadHtmlInlineScript('admin.html', [], { localStorage: true });
        // The module is the real one, loaded into the same sandbox the page runs
        // in, so the page calls the same code a browser would.
        vm.runInContext(fs.readFileSync(path.join(__dirname, 'offline-queue.js'), 'utf8'), sb);
        vm.runInContext('navigator.onLine = ' + (online ? 'true' : 'false') + ';', sb);
        rounds.forEach(([code, course, group, waiting, at]) => {
            vm.runInContext(`window.OfflineQueue.saveSnapshot(localStorage, ${JSON.stringify(code)},
                ${JSON.stringify(round(course))}, ${JSON.stringify(group ? { group } : null)});`, sb);
            if (at) {
                // Written back through the store, exactly as a save seconds
                // earlier would have left it.
                vm.runInContext(`(function () {
                    var k = window.OfflineQueue.SNAPSHOT_PREFIX + ${JSON.stringify(code)};
                    var o = JSON.parse(localStorage.getItem(k)); o.at = ${at};
                    localStorage.setItem(k, JSON.stringify(o));
                })();`, sb);
            }
            for (let i = 0; i < (waiting || 0); i++) {
                vm.runInContext(`window.OfflineQueue.enqueue(localStorage, { path: 'events/${code}/scores/p101_h${i + 1}',
                    type: 'set', value: 4, coalesceKey: '${code}${i}' });`, sb);
            }
        });
        vm.runInContext('renderOfflineRounds();', sb);
        const box = sb.document.getElementById('offline-rounds');
        return { sb, box, html: String(box.innerHTML || ''), shown: box.style.display };
    }

    test('OFFLINE: one row per round, course and count, linking to its own card', () => {
        const h = home({ online: false, rounds: [['ABCD', 'Dobson Ranch', 2, 3]] });
        assert.equal(h.shown, 'block', 'the rows are hidden with no signal, which is the only time they matter');
        assert.match(h.html, /Resume Dobson Ranch/);
        assert.match(h.html, /3 waiting/);
        assert.match(h.html, /href="index\.html\?game=ABCD&amp;group=2"/,
            'the tap does not carry the group: ' + h.html);
    });

    test('ONLINE: nothing at all, because Resume and the tiles are the right answer', () => {
        const h = home({ online: true, rounds: [['ABCD', 'Dobson Ranch', 2, 3]] });
        assert.equal(h.shown, 'none');
        assert.equal(h.html, '', 'a second list on Home online is just another card');
    });

    test('OFFLINE WITH NOTHING STORED: still nothing, not an empty box', () => {
        const h = home({ online: false, rounds: [] });
        assert.equal(h.shown, 'none');
        assert.equal(h.html, '');
    });

    test('newest first, four at most', () => {
        // STAMPED, because six saves in one millisecond is not a real phone and
        // a tie on `at` has no answer: the sort is stable, so tied rounds keep
        // storage order and the OLDEST four would win the cap. Real saves are
        // seconds apart - one per snapshot from the server - so the fixture says
        // so rather than relying on an order nothing defines.
        const h = home({ online: false, rounds: [
            ['AAAA', 'Course A', 1, 0, 1000], ['BBBB', 'Course B', 2, 1, 2000],
            ['CCCC', 'Course C', 3, 0, 3000], ['DDDD', 'Course D', 4, 0, 4000],
            ['EEEE', 'Course E', 1, 0, 5000], ['FFFF', 'Course F', 2, 0, 6000]] });
        assert.equal((h.html.match(/class="resume-link"/g) || []).length, 4,
            'six rounds would be six rows on a screen with no signal');
        // The last one touched is the one they are on, and the two oldest are
        // the ones that fall off.
        assert.ok(h.html.indexOf('Course F') < h.html.indexOf('Course E'), h.html);
        assert.doesNotMatch(h.html, /Course A|Course B/, 'the cap dropped the newest, not the oldest');
    });

    test('the page decides nothing itself - the label, the href and the list all come from the module', () => {
        const fn = ADMIN.slice(ADMIN.indexOf('function renderOfflineRounds'),
                               ADMIN.indexOf('\n    function ', ADMIN.indexOf('function renderOfflineRounds') + 30));
        assert.ok(fn.length > 200, 'the slice collapsed, so every assertion here is vacuous');
        assert.match(fn, /q\.localRounds\(localStorage\)/);
        assert.match(fn, /q\.resumeHref\(r\)/);
        assert.match(fn, /q\.resumeLabel\(r\)/);
        // No second definition of any of it in the page.
        assert.doesNotMatch(fn, /Resume ' \+|waiting/,
            'admin.html is writing its own version of the sentence');
        assert.match(fn, /escapeHtml\(/, 'a course name goes through escaping like every other name');
    });

    test('and Home is in the shell, or none of this can happen offline at all', () => {
        const sw = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
        assert.match(sw, /'\.\/admin\.html'/, 'Home is not precached');
        assert.match(sw, /'\.\/offline-queue\.js'/);
        // AND IT IS THE start_url, which is what a Home Screen icon opens.
        const build = fs.readFileSync(path.join(__dirname, 'build-shell.js'), 'utf8');
        assert.match(build, /startUrl: '\.\/admin\.html'/,
            'the consumer start_url moved, so the icon no longer lands on this screen');
        assert.match(ADMIN, /<script src="offline-queue\.js"><\/script>/);
    });
});

// ---------------------------------------------------------------------------
describe('3. WHAT HOME CALLS THE ROUND, AND WHAT IT SAYS WHEN OFFLINE', () => {

    function lobby({ online, lastRoom, snapshot }) {
        const sb = loadHtmlInlineScript('admin.html', [], { localStorage: true });
        vm.runInContext(fs.readFileSync(path.join(__dirname, 'offline-queue.js'), 'utf8'), sb);
        vm.runInContext('navigator.onLine = ' + (online ? 'true' : 'false') + ';', sb);
        if (lastRoom) vm.runInContext(`localStorage.setItem('lastRoomCode', ${JSON.stringify(lastRoom)});`, sb);
        if (snapshot) {
            vm.runInContext(`window.OfflineQueue.saveSnapshot(localStorage, ${JSON.stringify(lastRoom)},
                ${JSON.stringify(snapshot)}, { group: 1 });`, sb);
        }
        return sb;
    }

    test('RESUME SHOWS THE COURSE, not the six-character code', () => {
        // Manny on a phone: it read "Resume 9GB4J6". The code is the one thing
        // about a round a golfer never remembers.
        const sb = lobby({ online: true, lastRoom: '9GB4J6',
                           snapshot: round('Camas Meadows') });
        assert.equal(vm.runInContext("resumeBadgeText('9GB4J6')", sb), 'Camas Meadows');
    });

    test('and falls back to the code when no name was ever stored', () => {
        const sb = lobby({ online: true, lastRoom: '9GB4J6' });
        assert.equal(vm.runInContext("resumeBadgeText('9GB4J6')", sb), '9GB4J6',
            'a round saved before snapshots existed must still be resumable');
        // AND IT NEVER THROWS on a page where the module never loaded.
        const bare = loadHtmlInlineScript('admin.html', [], { localStorage: true });
        vm.runInContext("localStorage.setItem('lastRoomCode','ZZZZZZ');", bare);
        assert.equal(vm.runInContext("resumeBadgeText('ZZZZZZ')", bare), 'ZZZZZZ');
    });

    test('the event name is used when there is no course', () => {
        const sb = lobby({ online: true, lastRoom: 'ABCD1X',
                           snapshot: Object.assign(round(''), { eventName: 'Myrtle Day 2' }) });
        assert.equal(vm.runInContext("resumeBadgeText('ABCD1X')", sb), 'Myrtle Day 2');
    });

    test('AND HOME’S OFFLINE BANNER USES THE NEW WORDING, not "keep this page open"', () => {
        // Manny saw the old sentence on Home. The current tree does not produce
        // it - measured in Chrome - and the likeliest explanation is the Home
        // Screen icon's own cache, which iOS keeps separate from Safari's and
        // which was still on a version where Home did not load the queue at all.
        // This pins it so that explanation cannot become a regression hiding
        // behind a plausible story.
        const boot = fs.readFileSync(path.join(__dirname, 'pwa-boot.js'), 'utf8');
        assert.match(boot, /scores are saved on this phone\. Other changes need signal\./);
        // The old sentence survives ONLY for a page with no durable queue - the
        // tournament pages - and Home is not one of those any more.
        assert.match(ADMIN, /<script src="offline-queue\.js"><\/script>/,
            'Home stopped loading the queue, so its banner falls back to the old warning');
        const fn = boot.slice(boot.indexOf('function offlineSentence'),
                              boot.indexOf('\n    function ', boot.indexOf('function offlineSentence') + 30));
        assert.ok(fn.length > 100, 'the slice collapsed, so this assertion is vacuous');
        assert.match(fn, /if \(!hasDurableQueue\(\)\) \{/,
            'the old wording must be reachable only when there is genuinely no queue');
    });
});
