// ============================================================================
// URGENT-011 (013-11, Manny: YES) - "I'M THE ORGANIZER" IN THE JOINING SHEET
//
// The "Are you the organizer? Paste your organizer link" box sat at the top of
// the scorecard, so every golfer on the bare link read it above their scores.
// It now lives in the "How are you joining this round?" sheet behind an
// "I'm the organizer" row; the box opens only when that row is tapped.
//
// The organizer's recovery path (organizer_link_share_test.js, incl. its real
// Chrome arm) still works, now through the row. This file pins who does NOT see
// it: a golfer who arrives with a group, a spectator, and anybody after
// "Just watching" - and the organizer whose doors are already open.
// ============================================================================
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const SRC = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
const run = (sb, e) => vm.runInContext(e, sb);
const J = v => JSON.parse(JSON.stringify(v));
const TOKEN = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
const CD = makeCourseData(18);
// HardPan only: the row and the move sit in GPS blocks, so the Consumer build's
// index.html stays byte-identical to the pinned pre-GPS one (gps_flag_test.js).
const GPS_SKIP = /function openOrganizerClaim\(/.test(SRC) ? {} : { skip: 'Consumer tree: the "I\'m the organizer" row is HardPan (GPS) only' };

function round(ownerUid) {
    const r = wizardSavedRound({ code: 'ORG1', courseData: CD, thru: 9, ownerUid });
    r.organizerToken = TOKEN;
    return r;
}
const tick = () => new Promise(r => setTimeout(r, 40));
async function scorecard(data, search, opts) {
    const sb = loadHtmlInlineScript('index.html', [], Object.assign({ search: search || '?game=org1', localStorage: true }, opts || {}));
    run(sb, "['group-filter-container', 'group-links-panel', 'organizer-claim-mount', 'group-pick-overlay', 'group-pick-body'].forEach(function (id) { document.__mount(document.getElementById(id)); });");
    await tick();
    sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/ORG1').cb({ val: () => J(data), exists: () => true });
    return sb;
}
const html = (sb, id) => String(run(sb, "(document.getElementById('" + id + "') || {}).innerHTML || ''"));
const shown = sb => String(run(sb, "document.getElementById('group-pick-overlay').style.display || ''")) === 'flex';
const rowOnclick = (sb, role) => {
    const m = new RegExp('<button[^>]*data-role="' + role + '"[^>]*onclick="([^"]+)"').exec(html(sb, 'group-pick-body'));
    return m ? m[1] : null;
};
const STUCK = () => round('a-different-browser');   // the token is on the round; this device is not the owner

describe('URGENT-011: the box is in the joining sheet, not on the card', GPS_SKIP, () => {
    test('#organizer-claim-mount is inside #group-pick-overlay and nowhere above the card', () => {
        // the Consumer line sits commented out in a GPS:ELSE ("// <div id=...>") inside an
        // HTML comment; only the live element counts
        const live = SRC.split('\n').map((l, i) => [l, i]).filter(([l]) => /id="organizer-claim-mount"/.test(l) && !/^\s*\/\//.test(l));
        assert.equal(live.length, 1, 'one live mount');
        const at = SRC.indexOf(live[0][0]);
        const overlay = SRC.indexOf('id="group-pick-overlay"');
        const overlayEnd = SRC.indexOf('<!-- WHICH GOLFER ARE YOU?', overlay);
        assert.ok(overlay > 0 && at > overlay && at < overlayEnd, 'the mount sits in the "How are you joining this round?" sheet');
        assert.ok(at > SRC.indexOf('id="view-mode-toggle"'), 'not at the top of the scorecard card');
    });
    test('the stuck organizer on the bare link: the sheet offers "I\'m the organizer"; the box opens only on that tap', async () => {
        const sb = await scorecard(STUCK());
        assert.ok(shown(sb), 'the sheet is up (multi-group bare link)');
        assert.match(html(sb, 'group-pick-body'), /data-role="organizer"[^>]*>I&#39;m the organizer|data-role="organizer"[^>]*>I'm the organizer/);
        assert.equal(html(sb, 'organizer-claim-mount'), '', 'not before the tap');
        run(sb, rowOnclick(sb, 'organizer'));
        assert.match(html(sb, 'organizer-claim-mount'), /Are you the organizer\? Paste your organizer link\./);
        assert.match(html(sb, 'organizer-claim-mount'), /<input id="oc-input"/);
        // and the paste still unlocks the doors, with the row gone from the sheet
        run(sb, "document.getElementById('oc-input').value = '" + TOKEN + "';");
        assert.equal(run(sb, 'submitOrganizerClaim()'), 'ok');
        assert.match(html(sb, 'group-filter-container'), /Edit round setup/);
        assert.equal(html(sb, 'organizer-claim-mount'), '');
        assert.equal(rowOnclick(sb, 'organizer'), null, 'the row goes once the doors are open');
        assert.equal(J(sb.__dbWrites).length, 0);
    });
    test('a golfer who arrives WITH A GROUP: no sheet, no row, no box - even if the open is forced', async () => {
        const sb = await scorecard(STUCK(), '?game=org1&group=2');
        assert.ok(!shown(sb));
        assert.equal(rowOnclick(sb, 'organizer'), null);
        run(sb, 'openOrganizerClaim();');
        assert.equal(html(sb, 'organizer-claim-mount'), '');
    });
    test('after "Just watching": the sheet closes and the box never shows; a reload does not bring it back', async () => {
        const sb = await scorecard(STUCK());
        run(sb, rowOnclick(sb, 'organizer'));                 // even with the box opened first
        assert.match(html(sb, 'organizer-claim-mount'), /oc-input/);
        run(sb, rowOnclick(sb, 'watching'));
        assert.ok(!shown(sb));
        assert.equal(html(sb, 'organizer-claim-mount'), '', 'Just watching clears the box');
        sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/ORG1').cb({ val: () => J(STUCK()), exists: () => true });
        assert.equal(html(sb, 'organizer-claim-mount'), '', 'the next snapshot does not bring it back');
        // a fresh arrival on the same device: the stored "watching" answer means no sheet
        const again = await scorecard(STUCK(), '?game=org1', { seedStorage: { golfapp_role_ORG1: 'watching' } });
        assert.ok(!shown(again));
        assert.equal(html(again, 'organizer-claim-mount'), '');
        assert.equal(rowOnclick(again, 'organizer'), null);
    });
    test('the organizer whose doors are already open is not offered the row', async () => {
        const sb = await scorecard(round('anon-stub'));
        assert.match(html(sb, 'group-filter-container'), /Edit round setup/);
        assert.equal(rowOnclick(sb, 'organizer'), null);
        assert.equal(html(sb, 'organizer-claim-mount'), '');
    });
    test('a round with no organizer token: no row (nothing to check a paste against)', async () => {
        const d = STUCK(); delete d.organizerToken;
        const sb = await scorecard(d);
        assert.equal(rowOnclick(sb, 'organizer'), null);
    });
    test('a SPECTATOR (?spectate=1): no sheet, no row, no box', async () => {
        const sb = await scorecard(STUCK(), '?game=org1&spectate=1');
        assert.ok(!shown(sb));
        assert.equal(rowOnclick(sb, 'organizer'), null);
        run(sb, 'openOrganizerClaim();');
        assert.equal(html(sb, 'organizer-claim-mount'), '');
    });
});
