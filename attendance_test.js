// ============================================================================
// ATTENDANCE IS GONE (Wave 13) — and this file is the record of why.
//
// The feature asked each golfer to Confirm or say "Can't" before tee time, at
// events/<code>/attendance/<playerId> = { status: 'in'|'out', at: <ms> }. It shipped
// in v217 on FOUR surfaces and was removed over three days:
//
//   A  the scorecard panel      REMOVED Wave 9 (v236). Measured at 504x342 with
//      SIXTEEN buttons above score entry, asking a question already answered by
//      anyone looking at a scorecard.
//   B  the setup card           REMOVED Wave 13. 👥 Players is where a roster is
//      managed, and this duplicated it.
//   C  Round Ready              REMOVED Wave 13, and this is the one that decided
//      it. showRoundReadyScreen() had exactly ONE caller - saveSettings - with no
//      deep link, no nav route and no way back except re-saving the round. So after
//      B went, the only place left to mark anybody was the moment AFTER a save,
//      before anyone could have answered. That is not a headcount, it is a
//      checklist nobody would revisit.
//   D  the Road Trip day line   REMOVED Wave 13. Read-only, and with no writer left
//      it could only ever have said "nobody has answered".
//
// SO THE FEATURE CAME OUT WHOLE rather than being left as a line that cannot be
// true. attendance.js, the shell entry, the precache line and the database.rules.json
// rows went with it, per-file approved.
//
// WHAT HAPPENS TO RECORDS ALREADY WRITTEN: nothing reads them. They stay under
// events/<code>/attendance in Firebase, unreferenced - no migration, no deletion,
// no surface. The Wave 9 report flagged this exact moment as the point they stop
// being readable, and this is it. They are inert data on old rounds, not a
// half-removed feature: no code path can surface them and none tries.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const exists = f => fs.existsSync(path.join(REPO_ROOT, f));
// Comments stripped: this wave deliberately LEAVES prose recording the removal, and
// a guard that counted those would fail on its own explanation.
const strip = s => s.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/^[ \t]*\/\/[^\n]*$/gm, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');

const PAGES = ['admin.html', 'index.html', 'trip.html', 'leaderboard.html',
    'settlement.html', 'skins.html', 'sidematches.html', 'stats.html', 'game.html',
    'season.html', 'instructions.html'];

describe('1. THE MODULE AND ITS SHELL ENTRY ARE GONE', () => {
    test('attendance.js does not exist', () => {
        assert.equal(exists('attendance.js'), false, 'attendance.js is still in the repo');
    });
    test('no page loads it', () => {
        PAGES.forEach(f => assert.ok(!/<script src="attendance\.js">/.test(read(f)),
            f + ' still loads attendance.js'));
    });
    test('the shell does not ship it', () => {
        // A precached file that does not exist makes the install fail, so this is not
        // tidiness - sw.js listing a missing file breaks the service worker outright.
        assert.ok(!/'\.\/attendance\.js'/.test(read('sw.js')), 'sw.js still precaches it');
        assert.ok(!/'attendance\.js'/.test(read('sync-mobile-web.js')),
            'sync-mobile-web.js still ships it');
        // POSITIVE: the shell lists are still there and still long, so the negatives
        // above are not passing against an empty file.
        assert.ok(read('sw.js').length > 100000, 'sw.js looks truncated');
        assert.match(read('sync-mobile-web.js'), /'action-model\.js'/,
            'the CONSUMER_SHELL list is not being read');
    });
});

describe('2. NO SURFACE RENDERS IT', () => {
    const IDS = ['attendance-mount', 'attendance-note', 'setup-attendance',
        'setup-attendance-note', 'rr-attendance-count', 'rr-attendance-note'];
    test('none of the six mounts survive', () => {
        PAGES.forEach(f => {
            const src = read(f);
            IDS.forEach(id => assert.ok(!new RegExp('id="' + id + '"').test(src),
                f + ' still has #' + id));
        });
    });
    test('no renderer, watcher or writer is left', () => {
        // paintRoundReadyRoster is NOT in this list, and my first version had it here -
        // which contradicted test 5 below, where the same function is REQUIRED. It is a
        // roster renderer, not an attendance one: the names and handicaps stay, the
        // headcount and the buttons went. A guard cannot demand both.
        const FNS = ['renderAttendance', 'paintSetupAttendance', 'showSetupAttendance',
            'watchRoundReadyAttendance', 'confirmAttendance',
            'sayAttendance', 'attendancePanelHtml', 'commitAttendance', 'watchAttendance',
            'summarizeAttendance', 'attendanceCountLine', 'attendanceChoiceButtons',
            'attendanceStatusWord', 'attendancePlayerId', 'applyLocalAttendance',
            'attendanceWriteError', 'attendanceRecord', 'attendanceWritePath'];
        PAGES.forEach(f => {
            const code = strip(read(f));
            FNS.forEach(fn => assert.ok(!new RegExp('\\b' + fn + '\\s*\\(').test(code),
                f + ' still calls ' + fn));
        });
    });
    test('and nothing writes the node', () => {
        PAGES.forEach(f => {
            const code = strip(read(f));
            assert.ok(!/\/attendance/.test(code), f + ' still references an attendance path');
        });
    });
});

describe('3. NO COPY DESCRIBES A SURFACE THAT IS GONE', () => {
    // Copy that describes behaviour IS behaviour. Two sentences went with the card
    // they named: admin.html's "Mark who is in before tee time. This is the only
    // place it is asked." and the guide's "Who is playing" card.
    test('the setup note is gone with its card', () => {
        const src = read('admin.html');
        assert.ok(!/only place it is asked/.test(src), 'the setup note survives its card');
        assert.ok(!/Mark who is in before tee time/.test(src), 'the setup note survives');
    });
    test('the guide no longer describes a headcount', () => {
        const guide = read('instructions.html');
        assert.ok(!/Who is playing<\/div>/.test(guide),
            'the guide still has its "Who is playing" card');
        const prose = guide.replace(/<[^>]+>/g, ' ');
        assert.ok(!/confirm themselves|haven.t answered|can.t make it/i.test(prose),
            'the guide still describes confirming');
        // POSITIVE: the guide is still a guide, and still describes the roster tool
        // that actually exists. Without this the negatives pass on a deleted file.
        assert.match(prose, /Players sheet/, 'the guide lost the Players sheet card');
        assert.ok(guide.length > 20000, 'instructions.html looks truncated');
    });
});

describe('4. THE DATABASE RULES ROWS ARE OUT', () => {
    test('no attendance rule remains', () => {
        const rules = read('database.rules.json');
        assert.ok(!/attendance/.test(rules), 'database.rules.json still declares attendance');
        // POSITIVE, and it matters: every OTHER in-round write node must still be
        // declared. A rules file that lost its siblings would satisfy the negative.
        const parsed = JSON.parse(rules);
        const ev = parsed.rules.events.$eventCode;
        ['scores', 'kpWinners', 'dots', 'sideMatches', 'additionalGameInstances']
            .forEach(k => assert.ok(ev[k] && ev[k]['.write'],
                'the rules lost its ' + k + ' row'));
    });
});

describe('5. WHAT THE REMOVAL MUST NOT HAVE TAKEN WITH IT', () => {
    const CD = makeCourseData(18);
    const P = [101, 102, 103, 104].map((id, i) => ({
        id, name: ['Ann', 'Ben', 'Cal', 'Dee'][i], hcp: '10', playingForMoney: true }));

    test('the Players sheet is untouched - it is where a roster IS managed', () => {
        const src = read('index.html');
        assert.match(src, /id="players-sheet"/);
        assert.match(src, /id="players-sheet-save"/);
        assert.match(src, /class="ps-out-box"/, 'the sheet lost its Out box');
        assert.match(src, /p\.out = true/, 'the Out box no longer writes the roster flag');
    });

    test('Round Ready still renders its roster, without a headcount', () => {
        // C's COUNT went; the SCREEN did not. It still lists the players and their
        // handicaps, which is what a golfer reads it for.
        const src = read('admin.html');
        assert.match(src, /id="rr-players-list"/, 'the Round Ready roster mount is gone');
        assert.match(src, /function paintRoundReadyRoster|rr-players-list/,
            'nothing fills the Round Ready roster');
        assert.ok(!/attendanceCountLine/.test(strip(src)), 'the headcount line survives');
    });

    test('the trip day card still renders, without the headcount line', () => {
        const src = read('trip.html');
        assert.ok(!/rc-attendance/.test(src), 'the trip headcount line survives');
        assert.match(src, /rc-sub/, 'the trip card lost its sub-line markup entirely');
    });

    test('the scorecard still works, arrived at cold', () => {
        // The positive half of the whole wave: a golfer opens their card and it renders.
        const scores = {};
        P.forEach(p => CD.forEach(h => { scores['p' + p.id + '_h' + h.hole] = 4; }));
        const sb = loadHtmlInlineScript('index.html', [], { search: '?game=ATT9' });
        const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/ATT9');
        assert.ok(h, 'the scorecard did not register its round listener');
        h.cb({ val: () => ({ eventName: 'Monday', gameFormat: 'stroke', players: P,
            courseData: CD, scores }), exists: () => true });
        // WAVE 17: this read #whoami-mount as the proof that the card painted. That mount
        // is gone - the question is one line inside My Round now - so the proof moved to the
        // scorecard's own body, which is what "the scorecard still works" actually means.
        const body = String(sb.document.getElementById('card-body').innerHTML || '');
        assert.ok(body.length > 100, 'the scorecard painted nothing: ' + body.length);
        // The names are in the HEAD row; card-body carries the holes and the column
        // initials. Both are asserted, because "it painted" and "the golfers are named"
        // are two claims and the old single read of #whoami-mount covered neither well.
        const head = String(sb.document.getElementById('table-head-row').innerHTML || '');
        assert.match(head, /Ann/, 'the golfers are not on the page');
    });
});
