// A GPS-FIRST ROUND'S LONE "Me" AND A PASTED FIELD (mailbox 013, 2026-10-18), IN REAL CHROME.
//
// A round started from the GPS door has one golfer: the phone's owner, "Me", HCP 0. Manny then
// pastes his whole weekly field - himself in it, by name - into Round Setup's Players step
// (Games -> KP pool / Weekly game -> "Add your golfers first"). The paste APPENDED: 21 golfers,
// "Me" alone in a group of one ahead of the five pasted foursomes, flight A, and one more $40 in
// the pot. Now the preview offers "I'm in this list - replace "Me"", ticked when the list is a
// group or more; ticked, the field is exactly the paste. A short paste (three friends) leaves it
// unticked and "Me" stays. Every step a real tap or keystroke.
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const CD = makeCourseData(18);
const round = () => ({
    eventName: 'GPS round', roundDay: 'GPS round', courseName: 'Test Links', activeCourseKey: 'comm_links', gameFormat: 'stroke', courseData: CD,
    ownerUid: 'anon-cold', organizerToken: 'a'.repeat(32), scores: {}, settlementMode: 'whole-dollar', startingHole: 1, groupSizeOverrides: {},
    players: [{ id: 101, name: 'Me', hcp: '0', team: 'Team 1', squad: 'red', playingForMoney: true }]
});
const DB = (code) => ({ events: { [code]: round() }, global_courses: { comm_links: { name: 'Test Links', data: CD } }, trips: {}, tournaments: {}, organizers: {} });
const TWENTY = ['Manny Orozco 9', 'Joe Russo 6', 'Randy Tate 18', 'Mike Lane 21', 'Tom Hill 4', 'Sam Diaz 8', 'Lou Park 16', 'Vic Cruz 24', 'Al Moss 3', 'Ray Kim 10',
    'Ed Fox 15', 'Gus Bell 20', 'Hal Ruiz 7', 'Ike Shaw 5', 'Jim Ward 17', 'Kip Lowe 22', 'Len Ortiz 2', 'Max Reed 11', 'Ned Gray 19', 'Otto Dunn 14'];
const FLIGHT = (i) => (i % 4 < 2 ? 'A' : 'B');
const PASTE20 = TWENTY.map((l, i) => FLIGHT(i) + ' · ' + l + (i % 4 === 3 && i < 19 ? '\n' : '')).join('\n');
const READ = `JSON.stringify({
    offer: (function () { var c = document.getElementById('paste-replace-me'); return c ? { checked: c.checked, text: c.parentNode.textContent } : null; })(),
    rows: Array.prototype.map.call(document.querySelectorAll('#player-list .player-row'), function (r) { var f = r.querySelector('.p-flight-input'); return [(r.querySelector('.p-name-input') || {}).value, f ? f.getAttribute('data-flight') : null]; }),
    groups: typeof groupSizeOverrides !== 'undefined' ? groupSizeOverrides : null })`;
async function pasteInto(code, text, untick) {
    const steps = [{ sleep: 1500 },
        { tap: 'button[onclick="openPastePlayersModal()"]' }, { sleep: 400 },
        { tap: '#paste-players-textarea' }, { cdp: { method: 'Input.insertText', params: { text } } }, { sleep: 500 },
        { expression: READ }];
    if (untick) steps.push({ tap: '#paste-replace-me' }, { sleep: 200 });
    steps.push({ tap: '#paste-players-commit-btn' }, { sleep: 700 }, { expression: READ });
    const r = await arriveCold({ url: fileUrl('admin.html', 'game=' + code + '&step=players'), db: DB(code), settleMs: 3000, viewport: { width: 393, height: 852 },
        preScript: 'window.__hardpanDoors = true;', steps });
    assert.equal(r.ok, true, r.reason);
    const out = r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
    assert.equal(out.length, 2, JSON.stringify(r.value));
    return out;
}

describe('a GPS-first round ("Me") + the whole field pasted', () => {
    test('20 pasted in 5 groups with flights: the offer is ticked, the field is exactly the 20, 5 foursomes, A 10 / B 10', { timeout: 90000 }, async () => {
        const [pre, post] = await pasteInto('PMEA01', PASTE20, false);
        assert.ok(pre.offer, 'the preview offers to replace "Me"');
        assert.equal(pre.offer.checked, true);
        assert.match(pre.offer.text, /I.m in this list/);
        assert.match(pre.offer.text, /20 golfers, not 21/);
        assert.equal(post.rows.length, 20, JSON.stringify(post.rows));
        assert.deepEqual(post.rows.map((x) => x[0]), TWENTY.map((l) => l.replace(/ \d+$/, '')));
        assert.ok(post.rows.every((x, i) => x[1] === FLIGHT(i)), JSON.stringify(post.rows));
        assert.deepEqual(post.groups, { 0: 4, 1: 4, 2: 4, 3: 4, 4: 4 });
    });
    test('unticked, "Me" stays as golfer 1 (the old behaviour, by choice)', { timeout: 90000 }, async () => {
        const [, post] = await pasteInto('PMEA02', PASTE20, true);
        assert.equal(post.rows.length, 21);
        assert.equal(post.rows[0][0], 'Me');
    });
    test('three friends pasted (no "Me" in it, a foursome): offered UNticked, "Me" kept - the organizer is not dropped', { timeout: 90000 }, async () => {
        const [pre, post] = await pasteInto('PMEA03', 'Joe Russo 6\nRandy Tate 18\nMike Lane 21', false);
        assert.ok(pre.offer, 'still offered');
        assert.equal(pre.offer.checked, false);
        assert.deepEqual(post.rows.map((x) => x[0]), ['Me', 'Joe Russo', 'Randy Tate', 'Mike Lane']);
    });
});
