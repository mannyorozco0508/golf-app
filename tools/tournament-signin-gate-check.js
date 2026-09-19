#!/usr/bin/env node
// ============================================================================
// THE SIGN-IN GATE ON tournament.html, IN A BROWSER: does the Setup tab have a
// rect, and for whom?
//
// tournament_signin_gate_test.js proves under mini-dom that the tab is removed
// from the DOM for a signed-out visitor of an OWNED tournament and kept for a
// LEGACY one. mini-dom has no layout, so it cannot say what a golfer SEES: a
// removed element and an element with display:block and 0x0 are the same to it.
// This arrives cold on both records, signed out - the cold-arrival stub's
// firebase.auth() is always signed out, which is exactly the state a golfer who
// followed a link is in - and measures getBoundingClientRect.
//
// A DEVICE CHECK MAY NOT CALL A FUNCTION THE PAGE DEFINES. Nothing here calls
// one. The Leaderboard tab is clicked by its label because the gate lands there
// itself; the click only confirms the board is reachable after the gate ran.
//
//   node tools/tournament-signin-gate-check.js
//
//   exit 0   owned record: no Setup tab, no Setup panel, board and print
//            buttons and scoring links all have rects, "Signed in as" absent,
//            no lock word on screen; legacy record (no ownerUid): NO Setup tab
//            or panel since 2026-09-18, the no-organizer line has a rect
//            exist and the tab has a rect
//   exit 1   a divergence the JSON names
//   exit 2   could not run. NOTHING PROVEN.
//
// THE TWO ARMS IT COULD NEVER MEASURE (2026-09-15): the harness now delivers
// an anonymous user by default and takes an `auth` option, so this ALSO
// arrives on the owned record
//   - as the ANONYMOUS visitor every golfer on this origin is (auth-boot on
//     the consumer pages, restored here by the SDK): must see the signed-out
//     page - no Setup tab, sign-in panel on screen, no "Signed in as";
//   - as the EMAIL organizer whose uid is the record's ownerUid: must see the
//     organizer page - the Setup tab with a rect, "Signed in as", no panel.
// The signed-out arm below is arrived with auth: 'signed-out' explicitly.
// Nothing here is about the database: the gate is a page-side guardrail, and
// this measures the page.
// ============================================================================

// RE-PINNED 2026-09-18 (Option B, "hide, not remove"): every "still exists" below
// was "the gate must REMOVE the tab". Removal froze every non-owner's leaderboard
// after the first snapshot (tools/tournament-live-board-check.js). The gate now
// HIDES: the pills and panels stay in the tree with NO RECT for a non-owner and
// a rect for the owner. So a gated element must EXIST and must NOT be visible;
// its absence from the tree is now the failure, because the value callback
// writes into it on every snapshot.
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const course = PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: ((i * 7) % 18) + 1 }));
const teams = {
    team1: { num: 1, name: 'Eagles', players: ['Ann Alpha', 'Bo Bravo'], handicap: '0', startingHole: '1' },
    team2: { num: 2, name: 'Hawks', players: ['Cal Charlie', 'Dee Delta'], handicap: '0', startingHole: '2' }
};
const base = { name: 'Gate Scramble', format: 'scramble', courseName: 'Tidewater', activeCourseKey: 'tidewater',
    courseData: course, entryFee: '0', teams, scores: { team1_h1: 4, team2_h1: 5 }, createdAt: 1, courseIndexSynthetic: false };
const players = { p0: { id: 'p0', name: 'Ann Alpha', handicap: '0' }, p1: { id: 'p1', name: 'Bo Bravo', handicap: '0' },
    p2: { id: 'p2', name: 'Cal Charlie', handicap: '0' }, p3: { id: 'p3', name: 'Dee Delta', handicap: '0' } };
const individual = { name: 'Gate Individual', format: 'individual', scoringModel: 'player-v1', scoringMode: 'gross',
    courseName: 'Tidewater', activeCourseKey: 'tidewater', courseData: course, entryFee: '0', teams: {}, players,
    scoringGroups: { g1: { id: 'g1', name: 'Group 1', playerIds: ['p0', 'p1'], startingHole: '1', createdAt: 10 },
                     g2: { id: 'g2', name: 'Group 2', playerIds: ['p2', 'p3'], startingHole: '2', createdAt: 20 } },
    scores: { p0_h1: 4, p2_h1: 5 }, createdAt: 1, courseIndexSynthetic: false };
const db = {
    tournaments: {
        OWNED1: Object.assign({}, base, { ownerUid: 'u-org' }),
        LEGACY1: Object.assign({}, base),
        OWNEDI1: Object.assign({}, individual, { ownerUid: 'u-org' })
    },
    events: {}, trips: {}, global_courses: {}
};

const PROBE = `
(() => {
  const rect = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; };
  const visible = (sel) => { const r = rect(sel); return !!(r && r.w > 0 && r.h > 0); };
  const byText = (re) => Array.prototype.slice.call(document.querySelectorAll('button, a, span')).find(x => re.test(x.textContent || ''));
  const lb = byText(/Leaderboard/); if (lb) lb.click();
  const screen = (document.getElementById('manage-screen') || {}).innerText || '';
  return JSON.stringify({
    setupTab: { exists: !!document.getElementById('tab-btn-setup'), visible: visible('#tab-btn-setup'),
                active: !!(document.getElementById('tab-btn-setup') && document.getElementById('tab-btn-setup').classList.contains('active')) },
    setupPanel: { exists: !!document.getElementById('manage-tab-setup'), visible: visible('#manage-tab-setup') },
    deskTab: { exists: !!document.getElementById('tab-btn-desk'), visible: visible('#tab-btn-desk') },
    deskPanel: { exists: !!document.getElementById('manage-tab-desk'), visible: visible('#manage-tab-desk') },
    leaderboardTab: { visible: visible('#tab-btn-leaderboard') },
    board: { visible: visible('#leaderboard-list'), names: (document.getElementById('leaderboard-list') || {}).innerText || '' },
    noOwnerNote: { visible: visible('#lb-no-owner-note'), text: (document.getElementById('lb-no-owner-note') || {}).innerText || '' },
    printResults: !!(byText(/Print \\/ Send Results/) && byText(/Print \\/ Send Results/).getBoundingClientRect().height > 0),
    printPairings: !!(byText(/Print Pairings/) && byText(/Print Pairings/).getBoundingClientRect().height > 0),
    teamLinks: { visible: visible('#team-links-list'), shareButtons: document.querySelectorAll('#team-links-list button').length,
                 editableControls: document.querySelectorAll('#team-links-list input, #team-links-list select').length },
    teamCards: { exists: !!document.getElementById('team-cards-list'), visible: visible('#team-cards-list'),
                 handicapInputs: document.querySelectorAll('#team-cards-list input').length },
    groupLinks: { visible: visible('#group-links-list'), links: Array.prototype.slice.call(document.querySelectorAll('#group-links-list a')).filter(a => a.getBoundingClientRect().height > 0).map(a => (a.getAttribute('href') || '').replace(/^.*\\?/, '')) },
    editorVisible: visible('#scoring-groups-section'),
    signedInAs: ((document.getElementById('signed-in-as') || {}).innerText || '').trim(),
    signInPanel: visible('#signin-panel-manage'),
    lockWords: (screen.match(/\\b(Protected|Secure|Locked|Private)\\b/g) || [])
  });
})()`;

async function look(code, auth) {
    const r = await arriveCold({ url: fileUrl('tournament.html', 'tourney=' + code), db, expression: PROBE, settleMs: 7000, auth: auth === undefined ? 'signed-out' : auth });
    if (!r.ok) return { ran: false, reason: r.reason };
    try { return { ran: true, ...JSON.parse(r.value) }; } catch (e) { return { ran: false, reason: 'non-JSON: ' + String(r.value).slice(0, 200) }; }
}

(async () => {
    const bail = (why, extra) => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2)); process.exit(2); };
    const owned = await look('OWNED1');
    const legacy = await look('LEGACY1');
    const ownedInd = await look('OWNEDI1');
    const anon = await look('OWNED1', 'anonymous');
    const organizer = await look('OWNED1', { uid: 'u-org', email: 'org@example.com', isAnonymous: false });
    if (!owned.ran) bail('the owned record did not run: ' + owned.reason);
    if (!legacy.ran) bail('the legacy record did not run: ' + legacy.reason);
    if (!ownedInd.ran) bail('the owned individual record did not run: ' + ownedInd.reason);
    if (!anon.ran) bail('the anonymous arm did not run: ' + anon.reason);
    if (!organizer.ran) bail('the organizer arm did not run: ' + organizer.reason);
    if (!owned.board.visible || !legacy.board.visible) bail('a leaderboard rendered nothing, so tab visibility cannot be held against anything', { owned, legacy });

    const failures = [];
    // The gated shape for a non-owner: in the tree, no rect. Absent = the freeze is back.
    const gated = (arm, who) => {
        ['setupTab', 'setupPanel', 'deskTab', 'deskPanel'].forEach((k) => {
            if (!arm[k].exists) failures.push(who + ': ' + k + ' was REMOVED from the tree - the gate must hide (the value callback writes into it on every snapshot)');
            if (arm[k].visible) failures.push(who + ': ' + k + ' has a rect for a non-owner');
        });
    };
    // OWNED, signed out
    gated(owned, 'owned (signed out)');
    if (!owned.leaderboardTab.visible) failures.push('owned: the Leaderboard tab has no rect');
    if (!/Eagles/.test(owned.board.names)) failures.push('owned: the board does not list the teams');
    if (!owned.printResults || !owned.printPairings) failures.push('owned: a print button has no rect signed out - printing must stay open');
    if (!owned.teamLinks.visible || owned.teamLinks.shareButtons < 2) failures.push('owned: the scoring links are not on screen signed out (' + owned.teamLinks.shareButtons + ' share buttons)');
    // THE LEAK v109 SHIPPED: the public link rows carried the editable handicap.
    if (owned.teamLinks.editableControls > 0) failures.push('owned: ' + owned.teamLinks.editableControls + ' editable control(s) on the PUBLIC scoring-link rows');
    if (owned.teamCards.visible) failures.push('owned: the team cards (Setup) have a rect for a signed-out visitor');
    // LEGACY (since the narrowing, 2026-09-18): no console on screen - the cards go with it.
    if (legacy.teamCards.visible) failures.push('legacy: the Setup team cards have a rect - the rules refuse every write on a record with no owner');
    if (legacy.teamLinks.editableControls > 0) failures.push('legacy: editable control(s) on the public scoring-link rows');
    if (owned.signedInAs) failures.push('owned: "Signed in as" rendered while signed out: ' + owned.signedInAs);
    if (!owned.signInPanel) failures.push('owned: no sign-in panel on screen for a signed-out visitor');
    if (owned.lockWords.length) failures.push('owned: lock words on screen: ' + JSON.stringify(owned.lockWords));
    // OWNED, INDIVIDUAL, signed out: the group links have rects, the editor does not exist
    gated(ownedInd, 'owned individual (signed out)');
    if (!ownedInd.groupLinks.visible || ownedInd.groupLinks.links.length < 2) failures.push('owned individual: the group scoring links are not on screen signed out: ' + JSON.stringify(ownedInd.groupLinks));
    if (!ownedInd.groupLinks.links.every(h => /tourney=OWNEDI1&group=g[12]$/.test(h))) failures.push('owned individual: a group link does not point at its group: ' + JSON.stringify(ownedInd.groupLinks.links));
    if (ownedInd.editorVisible) failures.push('owned individual: the group EDITOR has a rect signed out');
    if (ownedInd.lockWords.length) failures.push('owned individual: lock words on screen: ' + JSON.stringify(ownedInd.lockWords));
    // LEGACY, signed out - THE GRANDFATHER PROMISE IS WITHDRAWN (2026-09-18): the
    // narrowed rules freeze a record with no ownerUid, so the page offers no console
    // it cannot honour. One line on the Leaderboard says why; scores still save.
    gated(legacy, 'legacy (signed out)');
    if (!legacy.noOwnerNote.visible) failures.push('legacy: the no-organizer line has no rect');
    if (!/no organizer account/.test(legacy.noOwnerNote.text)) failures.push('legacy: the no-organizer line does not say so: ' + JSON.stringify(legacy.noOwnerNote.text));
    if (owned.noOwnerNote.visible) failures.push('owned: the no-organizer line is on screen for an owned record');
    if (legacy.lockWords.length) failures.push('legacy: lock words on screen: ' + JSON.stringify(legacy.lockWords));

    // ANONYMOUS visitor on the owned record: the signed-out page, exactly.
    gated(anon, 'anonymous');   // the hole 075c7a4 closed: an anonymous visitor is a non-owner
    if (anon.signedInAs) failures.push('anonymous: "Signed in as" rendered for an anonymous visitor: ' + anon.signedInAs);
    if (!anon.signInPanel) failures.push('anonymous: no sign-in panel on screen for an anonymous visitor');
    if (!anon.leaderboardTab.visible || !/Eagles/.test(anon.board.names)) failures.push('anonymous: the leaderboard is not on screen');
    if (anon.lockWords.length) failures.push('anonymous: lock words on screen: ' + JSON.stringify(anon.lockWords));
    // EMAIL ORGANIZER (uid === ownerUid): the organizer page.
    if (!organizer.setupTab.exists || !organizer.setupTab.visible) failures.push('organizer: the Setup tab is missing or has no rect for the owner');
    if (!organizer.setupPanel.exists) failures.push('organizer: the Setup panel is gone for the owner');   // no rect here: the probe tapped Leaderboard first
    if (!organizer.deskTab.exists || !organizer.deskTab.visible || !organizer.deskPanel.exists) failures.push('organizer: the Desk tab has no rect or its panel is gone for the owner');
    if (!/Signed in as org@example\.com/.test(organizer.signedInAs)) failures.push('organizer: "Signed in as" does not name the owner: ' + organizer.signedInAs);
    if (organizer.signInPanel) failures.push('organizer: the sign-in panel is still on screen for the owner');
    if (organizer.lockWords.length) failures.push('organizer: lock words on screen: ' + JSON.stringify(organizer.lockWords));

    console.log(JSON.stringify({
        verdict: failures.length ? 'FAIL' : 'PASS', failures,
        measured: { owned, legacy, ownedIndividual: ownedInd, anonymous: anon, organizer }
    }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String((e && e.message) || e) }, null, 2)); process.exit(2); });
