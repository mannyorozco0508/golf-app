// REVIEW & SAVE SHOWS GROUPS, FLIGHTS AND THE TEE (URGENT-009 / 013-8), IN REAL CHROME.
//
// After pasting Manny's 20 (five foursomes, A 10 / B 10) the Review's PLAYERS section said only
// "20 added" - not the groups, not the flights, not which tee. Now it says "Groups 5 × 4",
// "Flights A 10 · B 10" and "Tee Blue". Display only. The paste and the step tap are real input;
// the Review is read as innerText, the way a golfer reads it. Stub db only.
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const CD = makeCourseData(18);
const TEES = { male: [{ name: 'Blue', slope: 130, rating: 71.2, parTotal: 72 }, { name: 'White', slope: 125, rating: 69.5, parTotal: 72 }] };
const round = (extra) => Object.assign({
    eventName: 'Mon', roundDay: 'Mon', courseName: 'Test Links', activeCourseKey: 'comm_links', gameFormat: 'stroke', courseData: CD,
    ownerUid: 'anon-cold', organizerToken: 'a'.repeat(32), scores: {}, settlementMode: 'whole-dollar', startingHole: 1, groupSizeOverrides: {},
    teeRating: { teeKey: 'male:0', teeName: 'Blue', slope: 130, courseRating: 71.2, par: 72, allowance: 100 },
    players: [{ id: 101, name: 'Me', hcp: '0', team: 'Team 1', squad: 'red', playingForMoney: true }] }, extra || {});
const DB = (code, r) => ({ events: { [code]: r }, global_courses: { comm_links: { name: 'Test Links', data: CD, tees: TEES } }, trips: {}, tournaments: {}, organizers: {} });
const TWENTY = ['Manny Orozco 9', 'Joe Russo 6', 'Randy Tate 18', 'Mike Lane 21', 'Tom Hill 4', 'Sam Diaz 8', 'Lou Park 16', 'Vic Cruz 24', 'Al Moss 3', 'Ray Kim 10',
    'Ed Fox 15', 'Gus Bell 20', 'Hal Ruiz 7', 'Ike Shaw 5', 'Jim Ward 17', 'Kip Lowe 22', 'Len Ortiz 2', 'Max Reed 11', 'Ned Gray 19', 'Otto Dunn 14'];
const PASTE20 = TWENTY.map((l, i) => (i % 4 < 2 ? 'A' : 'B') + ' · ' + l + (i % 4 === 3 && i < 19 ? '\n' : '')).join('\n');
const LOOK = `JSON.stringify({ step: typeof currentWizardStep !== 'undefined' ? currentWizardStep : null,
    text: ((document.getElementById('wizard-review-summary') || {}).innerText || '').replace(/\\s+/g, ' ').trim() })`;

async function review(code, r, paste) {
    const steps = [{ sleep: 1500 }];
    if (paste) steps.push({ tap: 'button[onclick="openPastePlayersModal()"]' }, { sleep: 400 },
        { tap: '#paste-players-textarea' }, { cdp: { method: 'Input.insertText', params: { text: paste } } }, { sleep: 500 },
        { tap: '#paste-players-commit-btn' }, { sleep: 800 });
    steps.push({ tap: '[onclick="goToWizardStep(7)"]' }, { sleep: 800 }, { expression: LOOK });
    const res = await arriveCold({ url: fileUrl('admin.html', 'game=' + code + '&step=players'), db: DB(code, r), settleMs: 3000, viewport: { width: 393, height: 852 },
        preScript: 'window.__hardpanDoors = true;', steps });
    assert.equal(res.ok, true, res.reason);
    return JSON.parse(res.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').pop());
}

describe('Review & Save, PLAYERS section', () => {
    test('after pasting 20 in five foursomes with flights: Groups 5 × 4, Flights A 10 · B 10, Tee Men · Blue', { timeout: 120000 }, async () => {
        const v = await review('REVB01', round(), PASTE20);
        assert.equal(v.step, 7, 'on the Review');
        assert.match(v.text, /Players 20 added/);
        assert.match(v.text, /Groups 5 × 4/, v.text);
        assert.match(v.text, /Flights A 10 · B 10/, v.text);
        assert.match(v.text, /Tee Men · Blue Edit/, v.text);
    });
    test('uneven groups list their sizes; flights off says nothing about flights', { timeout: 120000 }, async () => {
        const PL = ['Ann', 'Ben', 'Cal', 'Dee', 'Eve', 'Fay', 'Gus', 'Hal', 'Ivy'].map((n, i) => ({ id: 101 + i, name: n, hcp: String(i), team: 'Team 1', squad: 'red', playingForMoney: true }));
        const v = await review('REVB02', round({ players: PL, groupSizeOverrides: { 0: 5 } }), null);
        assert.match(v.text, /Groups 2 groups \(5, 4\)/, v.text);
        assert.doesNotMatch(v.text, /Flights/);
    });
});
