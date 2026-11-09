// ============================================================================
// THE ORGANIZER IS NEVER A SPECTATOR ON HIS OWN ROUND (build 15, 2026-10-08)
//
// Manny on build 14, signed in as the owner of Myrtle Day 1, opening it through
// "Open a round you already have" - so a BARE link, no ?group=:
//
//   the spectator badge was gone and "Delete round for everyone" showed, so the
//   organizer gate recognised him,
//   but the Round Menu had NO "Edit Round Setup" - no way to reach Players to
//   set foursomes or tees,
//   and the scorecard said "Read-only. Ask the organizer for your group's link
//   to enter scores." To the organizer. About himself.
//
// THE CAUSE, and it is the same line twice. Both the badge and every score box
// were decided by POSITION ALONE:
//
//     const isMultiGroupRound = players.length > 4;
//     ... else if (isMultiGroupRound) -> "Spectator View (Read-Only)"
//     const isLocked = ... || (isMultiGroupRound && (!hasGroupLock || ...));
//
// No organizer check anywhere in either. On a round with more than four golfers
// and no ?group= in the URL, EVERY viewer was a spectator - the owner included.
// The delete control was right because it asks a different question; these two
// never asked it at all.
//
// WHAT THIS FILE HOLDS: the pure predicates. The screens are measured in
// tools/organizer-controls-check.js, which opens the real round as the real
// owner and reads what rendered.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const IDX = read('index.html');
// The function body, ending at the next top-level function - never a character
// count, which any edit above the claim invalidates.
function fnOf(name, src) {
    const s = src || IDX;
    const at = s.indexOf('function ' + name);
    if (at === -1) return null;
    const end = s.indexOf('\n    function ', at + 10);
    return s.slice(at, end === -1 ? s.length : end);
}

describe('1. THE SCORE BOXES ASK WHETHER HE IS THE ORGANIZER', () => {

    test('the lock is no longer position-only', () => {
        const src = IDX;
        const at = src.indexOf('const isLocked =');
        assert.notEqual(at, -1, 'the score-box lock is gone');
        const line = src.slice(at, src.indexOf(';', at) + 1);
        assert.match(line, /scorableByMe|organizerMayScore|canScoreBox/,
            'the lock still decides on group position alone: ' + line.replace(/\s+/g, ' '));
    });

    test('there is one predicate that answers "may I type in this box"', () => {
        const fn = fnOf('canScoreBox');
        assert.ok(fn, 'canScoreBox does not exist');
        assert.ok(fn.length > 150, 'canScoreBox did not slice - this test is guarding nothing');
        // A scorekeeper's group link, exactly as before.
        assert.match(fn, /hasGroupLock/, 'it ignores the scorekeeper group link');
        // AND the organizer's chosen group.
        assert.match(fn, /organizerScoreGroup/, 'it ignores the organizer’s chosen group');
        assert.match(fn, /canReachSetup\(\)/, 'it does not ask whether this device is the organizer');
    });

    test('the organizer picks which group he is scoring, and it is remembered', () => {
        const src = IDX;
        assert.match(src, /function setOrganizerScoreGroup/, 'there is no way to choose a group');
        const fn = fnOf('setOrganizerScoreGroup');
        assert.match(fn, /localStorage|setItem/,
            'the choice is not remembered, so a reload sends the organizer back to read-only');
        assert.match(fn, /renderScorecard\(\)/, 'choosing a group does not redraw the card');
    });
});

describe('2. AND HE IS NEVER TOLD TO ASK THE ORGANIZER', () => {

    test('the spectator badge and banner are gated on NOT being the organizer', () => {
        const src = IDX;
        const at = src.indexOf('const spectatorBanner');
        assert.notEqual(at, -1, 'the banner block is gone');
        const block = src.slice(at, at + 1800);
        assert.match(block, /canReachSetup\(\)/,
            'the spectator badge still shows without asking whether this is the organizer');
        // THE WORDS THEMSELVES must be unreachable for him: this is the sentence
        // Manny was shown about himself.
        assert.match(block, /Score for|scoringPicker|organizerScoreGroup/,
            'the organizer gets no way to score from the All Players view');
    });

    test('the read-only sentence still exists for somebody who really is read-only', () => {
        // The fix must not delete the message - a true spectator on a 24-golfer
        // round needs it, and a guard that only ever hides things would pass on
        // an app that says nothing to anyone.
        assert.match(IDX, /Ask the organizer for your group/,
            'the read-only sentence is gone entirely');
    });
});

describe('3. EDIT ROUND SETUP IS IN THE ROUND MENU, AT THE TOP', () => {

    test('there is a mount for it and the Round Menu owns it first', () => {
        const src = IDX;
        assert.match(src, /id="setup-entry-mount"/, 'no Round Menu entry for setup');
        const at = src.indexOf('var ROUND_SHEET_BLOCKS = [');
        assert.notEqual(at, -1, 'the Round Menu block list is gone');
        const list = src.slice(at, src.indexOf('];', at));
        const ids = [...list.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
        assert.ok(ids.length > 5, 'the block list did not parse');
        assert.equal(ids[0], 'setup-entry-mount',
            'Edit Round Setup is not the FIRST thing in the Round Menu: ' + JSON.stringify(ids.slice(0, 3)));
    });

    test('it is rendered, and only for the organizer', () => {
        const fn = fnOf('renderSetupEntry');
        assert.ok(fn, 'renderSetupEntry does not exist');
        assert.match(fn, /canReachSetup\(\)/, 'the setup entry is offered to everybody');
        assert.match(fn, /Edit Round Setup/i, 'the button does not say what it is');
        // AND IT IS CALLED. A render function nothing calls is this project's
        // most repeated defect.
        assert.match(IDX, /renderSetupEntry\(\);/, 'renderSetupEntry is never called');
    });
});

// ---- 4. AND THE WRITE GATE AGREES WITH THE BOXES (2.0.4) -------------------
// canScoreBox unlocked the organizer's picked group on a bare link; canWritePlayer
// never asked, so every score he typed was refused by rejectCrossGroupWrite with
// only a console line. The Chrome proof is org_score_group_chrome_test.js; this is
// the predicate. NEGATIVE CONTROL: with the picked-group branch removed from
// canWritePlayer, 4a and 4b go red (4c and 4d hold there - they guard what stays shut).
describe('4. canWritePlayer HONOURS THE ORGANIZER\'S PICKED GROUP', () => {
    const vm = require('vm');
    const { loadHtmlInlineScript } = require('./helpers/load-script.js');
    const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');
    const PAGE = ['action-model.js', 'match-engine.js', 'money-engine.js', 'settlement-engine.js', 'bet-strip.js', 'hole-events.js'];

    test('4a the gate consults organizerScoreGroup() and the organizer gate, by group', () => {
        const raw = fnOf('canWritePlayer');
        // CODE ONLY: the comment above the branch names organizerScoreGroup() too, and a
        // comment must not be what keeps this green.
        const fn = raw && raw.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
        assert.ok(fn && fn.length > 300, 'canWritePlayer did not slice - this test is guarding nothing');
        assert.match(fn, /organizerScoreGroup\(\)/, 'canWritePlayer ignores the organizer’s picked group');
        assert.match(fn, /canReachSetup\(\)/, 'canWritePlayer does not ask whether this device is the organizer');
        assert.match(fn, /playerGroupOf\(playerId\)/, 'the pick is not limited to that group’s golfers');
        // Every existing gate is still there, ahead of it.
        assert.match(fn, /roundSuperseded\(\)/);
        assert.match(fn, /hpSpectating\(\)/);
        assert.match(fn, /hpKeyState !== 'none' && hpKeyState !== 'ok'/);
        assert.match(fn, /frOrganizerEditContext && hasOrganizerAuthority\(\)/);
        assert.ok(!/meId/.test(fn), 'scoring scope must not come from personal identity');
    });

    function boot(isOrganizer, pick) {
        const sb = loadHtmlInlineScript('index.html', PAGE, { localStorage: true });   // a real store: the pick is remembered
        const names = ['Manny', 'Jose', 'Ann', 'Bob', 'Marty', 'John', 'Cal', 'Dee'];
        const p = makePlayers(names, names.map(() => 0));
        const map = {}; p.forEach((pl, i) => { map[pl.id] = i < 4 ? 1 : 2; });
        vm.runInContext(`
            currentMode = 'ORG8';
            currentData = ${JSON.stringify({ gameFormat: 'stroke', players: p, courseData: makeCourseData(18), scores: {} })};
            window.__scPlayerGroupMap = ${JSON.stringify(map)};
            hasGroupLock = false; lockedGroup = null;
            canReachSetup = function () { return ${!!isOrganizer}; };
            try { localStorage.removeItem(organizerScoreGroupKey()); } catch (e) {}
            ${pick ? `try { localStorage.setItem(organizerScoreGroupKey(), '${pick}'); } catch (e) {}` : ''}
        `, sb);
        return { sb, p, can: (id) => vm.runInContext(`canWritePlayer('${id}')`, sb), box: (id) => vm.runInContext(`canScoreBox('${id}', window.__scPlayerGroupMap, true)`, sb) };
    }

    test('4b the organizer with Group 1 picked writes Group 1 - the same answer the box gives', () => {
        const b = boot(true, 1);
        b.p.slice(0, 4).forEach((pl) => {
            assert.equal(b.box(pl.id), true, 'positive control: the box is open');
            assert.equal(b.can(pl.id), true, pl.name + ': the box is open but the write is refused');
        });
    });

    test('4c ... and not Group 2', () => {
        const b = boot(true, 1);
        b.p.slice(4).forEach((pl) => { assert.equal(b.can(pl.id), false, pl.name); assert.equal(b.box(pl.id), false); });
    });

    test('4d a spectator - no organizer gate - writes nothing, even with a pick left in storage; no pick, nothing', () => {
        const s = boot(false, 1);
        s.p.forEach((pl) => assert.equal(s.can(pl.id), false, 'spectator wrote ' + pl.name));
        const o = boot(true, null);
        o.p.forEach((pl) => assert.equal(o.can(pl.id), false, 'organizer with no pick wrote ' + pl.name));
    });
});
