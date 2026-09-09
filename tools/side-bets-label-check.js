#!/usr/bin/env node
// ============================================================================
// TWO LABELS, READ OFF THE SCREEN.
//
//   "Add Action"  -> "Side Bets"      what the golfer taps to start a wager
//   "Cross Group" -> "Any Group"      the Matches card, and every sentence that
//                                     explains why a group link may not do a thing
//
// DISPLAY TEXT ONLY. Not one data key, function, class or element id moves. The
// stored shape of a side match is `sideMatches/{pushKey}` carrying
// `{ format, scoring, teamAIds, teamBIds, startHole, createdAt, scope, ... }` and
// `scope` is the literal string 'cross'. Renaming any of that would orphan the
// side bets in every round that already exists, which is a data migration wearing
// a copy change's clothes.
//
// READ, NOT GREPPED. Every label assertion below is made against innerText or
// textContent of an element in a page that loaded itself, on a cold arrival, after
// pressing the page's own controls. A source scan would pass on markup nothing
// renders and would say nothing about which of the three states a button is in.
//
// AND THREE CONTROLS, because a copy change that quietly moved a key would look
// exactly like this one from the screen:
//
//   THE WRITE      a cross-group side bet created through the UI, and the payload
//                  captured off the stub. Hand-checked field by field.
//   THE MONEY      a writer-shaped round that ALREADY holds cross-group side
//                  matches still renders and settles, to hand-computed figures.
//   THE NAMES      every function, class and id that carries the old words is
//                  asserted BY NAME to still exist.
//
//   node tools/side-bets-label-check.js
//
//   exit 0   the words changed and nothing else did
//   exit 1   a divergence the JSON names
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const { openJourney, fileUrl: jUrl } = require('./lib/journey.js');

const TOKEN = 'orgtok1';
const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });

const NAMES = ['Al Green', 'Bo Diaz', 'Cy Young', 'Di Marco',
               'Ed Fox', 'Fi Lane', 'Gus Hall', 'Hal Reed'];

// `holes` matters more than it looks. canAddAction() is gated on a FUTURE HOLE
// still existing - action-model.js disables it once the round is over - so a
// fixture with all 18 scored renders no Add control at all and every label
// assertion below would have had nothing to read. The first version of this check
// did exactly that and bailed, which is the harness working: exit 2, nothing
// proven, rather than a green run on an empty screen.
function roundOf(count, extra, holes) {
    const players = NAMES.slice(0, count).map((n, i) => ({
        id: 101 + i, name: n, hcp: '0', playingForMoney: true,
        team: (i % 4) < 2 ? 'Team 1' : 'Team 2' }));
    const scores = {};
    players.forEach((p, i) => CD.slice(0, holes === undefined ? 9 : holes).forEach(h => {
        scores['p' + p.id + '_h' + h.hole] = (i % 2 === 0) ? 4 : 5; }));
    return Object.assign({
        eventName: 'Club Day', courseName: 'Camas Meadows',
        activeCourseKey: 'swwa_camasmeadows', gameFormat: 'stroke', courseData: CD,
        players: players, scores: scores, organizerToken: TOKEN,
        settlementMode: 'whole-dollar', kpConfirmed: { confirmed: true },
    }, extra || {});
}

// A ROUND THAT ALREADY HOLDS CROSS-GROUP SIDE MATCHES, shaped exactly as
// sidematches.html writes them: a push key under sideMatches, scope 'cross'.
//
// HAND-COMPUTED. Eight golfers, groups of four. Even-indexed ids (101,103,105,107)
// play 4 every hole = gross 72; odd ids play 5 = gross 90. Every handicap is 0, so
// net equals gross. Match play, 18 holes, one side wins every hole.
//
//   xg1  101 (72) v 106 (90)   Group 1 v Group 2, $20 match  -> 101 +20, 106 -20
//   xg2  103 (72) v 108 (90)   Group 1 v Group 2, $20 match  -> 103 +20, 108 -20
//
// Total moved: $40, and the ledger is zero-sum.
const CROSS_BETS = {
    xg1: { format: 'match', scoring: 'net', teamAIds: ['101'], teamBIds: ['106'],
           stake: 20, pressRule: 'none', startHole: 1, createdAt: 1, scope: 'cross' },
    xg2: { format: 'match', scoring: 'net', teamAIds: ['103'], teamBIds: ['108'],
           stake: 20, pressRule: 'none', startHole: 1, createdAt: 2, scope: 'cross' },
};

// A multi-group round with no pot and no wagers renders NO Action Centre at all -
// renderActionCenter returns early on `totalBets === 0 && !hasPool`. The pool is
// what puts the group-action link on screen to be read.
const POOL = { moneyPool: { enabled: true, buyIn: 20, net: { amount: 40, places: [60, 40] },
    skins: { mode: 'remainder', scoring: 'net', carryOver: false } } };

const db = { events: {
    ONE:   roundOf(4, null, 9),                          // one foursome, holes left
    MANY:  roundOf(8, POOL, 9),                          // two foursomes, holes left
    BETS:  roundOf(8, { sideMatches: CROSS_BETS }, 18),   // finished, and already wagered
} };

const PRE = `
(function () {
  window.print = function () {};
  window.__alerts = [];
  window.alert = function (m) { window.__alerts.push(String(m)); };
  window.confirm = function () { return true; };
})();`;

function bail(msg) {
    console.error('side-bets-label-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

// ---------------------------------------------------------------------------
// index.html - the Action Centre. Opened with the page's own toggle.
// ---------------------------------------------------------------------------
const IDX_PROBE = `
(() => {
  const out = {};
  const byH = (sel, re) => Array.from(document.querySelectorAll(sel))
      .find(e => re.test(e.getAttribute('onclick') || ''));
  const txt = e => (e && e.innerText ? e.innerText : '').replace(/\\s+/g, ' ').trim();

  for (let i = 0; i < 3 && !/settled yet/i.test(txt(document.getElementById('action-center-mount'))); i++) {
    const t = byH('button', /toggleActionCenter/);
    if (!t) break;
    t.click();
  }
  const mount = document.getElementById('action-center-mount');
  out.mountText = txt(mount);
  // The control itself, by CLASS - the class name is one of the things that must
  // NOT have moved, so reading through it is a second assertion for free.
  const btn = mount ? mount.querySelector('.add-action-btn') : null;
  out.addControlText = txt(btn);
  out.addControlTag = btn ? btn.tagName.toLowerCase() : null;
  out.addControlHref = btn ? btn.getAttribute('href') : null;

  // THE SHEET, opened by pressing that control when it is the organizer's button.
  if (btn && btn.tagName.toLowerCase() === 'button') {
    btn.click();
    const panel = document.querySelector('.add-action-panel');
    out.sheetTitle = panel ? txt(panel.querySelector('.aa-title')) : null;
    out.sheetPresent = !!panel;
  }
  return JSON.stringify(out);
})()`;

// ---------------------------------------------------------------------------
// sidematches.html - the Matches card, the modal, and the refusal sentences.
// ---------------------------------------------------------------------------
const SM_PROBE = `
(() => {
  const out = {};
  const txt = e => (e && e.innerText ? e.innerText : '').replace(/\\s+/g, ' ').trim();
  const byH = (sel, re) => Array.from(document.querySelectorAll(sel))
      .find(e => re.test(e.getAttribute('onclick') || ''));

  const card = document.getElementById('sidematches-card');
  out.cardHeading = card ? txt(card.querySelector('h3')) : null;
  const add = card ? byH('#sidematches-card button', /openSideMatchModal/) : null;
  out.addButtonText = txt(add);

  // THE MODAL, through the page's own button.
  if (add) add.click();
  out.modalTitle = txt(document.getElementById('sm-modal-title'));
  const scopeStep = document.getElementById('sm-scope-step');
  out.scopeStepShown = scopeStep ? getComputedStyle(scopeStep).display !== 'none' : null;
  out.scopeChoices = Array.from(document.querySelectorAll('.sm-scope-choice')).map(txt);

  // THE ANCHOR WARNING, which only a group link can produce: choose Across Groups,
  // then select two golfers from OTHER foursomes.
  if (typeof pickActionScope === 'function' && out.scopeStepShown) {
    const cross = byH('.sm-scope-choice', /pickActionScope\\('cross'\\)/);
    if (cross) cross.click();
  }
  out.modalTitleAtForm = txt(document.getElementById('sm-modal-title'));
  // THE ROSTER IS NOT CHECKBOXES. It is .player-pick-badge tiles calling
  // pickPlayerForSide(id, 'a'|'b'). The first version of this probe ticked
  // input[type=checkbox] inside the modal, found only the gross/net and tie-rule
  // switches, selected nobody, and read back a null warning - which looks exactly
  // like "the app renders no warning". That is the wrong finding to report, and it
  // is the reason this comment exists.
  const badges = Array.from(document.querySelectorAll('#sidematch-modal .player-pick-badge'));
  out.badgeCount = badges.length;
  const tap = (id, side) => {
    const h = "pickPlayerForSide('" + id + "', '" + side + "')";
    const b = badges.find(x => (x.getAttribute('onclick') || '').indexOf(h) >= 0);
    if (b) b.click();
    return !!b;
  };
  // 105 and 106 are BOTH in Group 2. On a Group 1 link that is a wager with no
  // Group 1 golfer in it, which is exactly what the anchor rule refuses.
  out.picked = [tap('105', 'a'), tap('106', 'b')];
  // THE ESCAPE THAT ATE EVERY 's'. This probe is a Node TEMPLATE LITERAL, so a bare
  // \\s in it collapses to a plain s before the browser ever sees it - the regex
  // became /s+/g and replaced every letter s with a space. The indicator read
  // "Thi  i  Group 1's link,  o a cro -group wager", the /needs at least one Group/
  // test failed, and the check reported that the app renders no anchor warning at
  // all. It renders one. Double-escaped, and these two fields stay so the next
  // person can see the raw string rather than only the verdict.
  out.actionScopeNow = (typeof actionScope !== 'undefined') ? actionScope : 'undefined';
  out.isOrganizer = (typeof isOrganizerView === 'function') ? isOrganizerView() : 'n/a';
  out.indicatorRaw = (() => { const e = document.getElementById('sm-team-size-indicator');
      return e ? (e.textContent || '').replace(/\\s+/g, ' ').trim() : null; })();
  out.warningText = (() => {
    const el = document.getElementById('sm-team-size-indicator');
    const t = el ? (el.textContent || '').replace(/\\s+/g, ' ').trim() : '';
    return /needs at least one Group/i.test(t) ? t : null;
  })();

  // THE AUTO-PAIR REFUSAL, through the page's own button, on a group link.
  const ap = byH('button', /openAutoPairModal/);
  out.autoPairButton = !!ap;
  if (ap) ap.click();
  out.alerts = (window.__alerts || []).slice();
  return JSON.stringify(out);
})()`;

// ---------------------------------------------------------------------------
// settlement.html - the money on a round that already holds cross-group bets.
// ---------------------------------------------------------------------------
const SETTLE_PROBE = `
(() => {
  const txt = id => { const e = document.getElementById(id);
      return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  return JSON.stringify({ summary: txt('combined-settlement-summary'),
      body: (document.body.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 1400) });
})()`;

// ---------------------------------------------------------------------------
// THE NAMES. Source-level, and deliberately so: this is the one assertion that is
// ABOUT the source rather than about the screen.
// ---------------------------------------------------------------------------
const MUST_STILL_EXIST = {
    'index.html': ['function canAddAction', 'function openAddAction', 'function closeAddAction',
        'function buildAddActionPanelHtml', 'function addActionStartHole',
        'function canAddGroupAction', 'function addGroupActionLabel', 'function addGroupActionHref',
        'function rejectCrossGroupWrite', 'add-action-btn', 'add-action-panel', 'aa-title', 'aa-cancel'],
    'sidematches.html': ['function crossGroupWagerIsAnchored', 'function crossGroupAnchorWarning',
        'function pickActionScope', 'function openSideMatchModal', 'function openAutoPairModal',
        'id="sidematches-card"', 'id="sm-modal-title"', 'sm-scope-choice',
        "actionScope === 'cross'", 'events/${currentMode}/sideMatches'],
    'admin.html': ['id="rr-add-action-btn"', 'rr-add-action-btn'],
};

(async () => {
    const problems = [];
    const report = {};

    const cold = async (page, query, expr, label) => {
        const r = await arriveCold({ url: fileUrl(page, query), db: db,
            expression: expr, preScript: PRE, settleMs: 5000 });
        if (!r.ok) bail(label + ': ' + r.reason);
        try { return JSON.parse(r.value); } catch (e) { bail(label + ': unreadable probe output'); }
    };

    // ---- THE SCREENS ---------------------------------------------------
    const idxOrganizer = await cold('index.html', 'game=ONE&organizer=' + TOKEN, IDX_PROBE, 'index organizer');
    const idxGroupLink = await cold('index.html', 'game=MANY&group=1', IDX_PROBE, 'index group link');
    const smOrganizer  = await cold('sidematches.html', 'game=MANY&organizer=' + TOKEN, SM_PROBE, 'sidematches organizer');
    const smGroupLink  = await cold('sidematches.html', 'game=MANY&group=1', SM_PROBE, 'sidematches group link');
    const settled      = await cold('settlement.html', 'game=BETS', SETTLE_PROBE, 'settlement');

    report.rendered = { idxOrganizer, idxGroupLink, smOrganizer, smGroupLink };

    // A RUN THAT RENDERED NOTHING MEASURED NOTHING.
    if (!idxOrganizer.mountText) bail('the Action Centre rendered nothing on index.html');
    if (!idxOrganizer.addControlText) bail('no .add-action-btn control rendered for the organizer');
    if (!smOrganizer.cardHeading) bail('the Matches card rendered no heading');
    if (!smOrganizer.addButtonText) bail('the Matches card rendered no add button');

    // WORD BOUNDARIES, AND THEY ARE NOT DECORATION. "across groups" CONTAINS
    // "cross group" as a substring - a-<cross> <group>s - so an unanchored
    // /cross[- ]?group/ matches the picker's own "Across Groups", which is a string
    // this wave deliberately left alone. A sweep of the other Consumer pages
    // reported a stale label on skins.html on exactly that basis; the page says
    // "even across groups" and nothing else. That is the substring-versus-word trap
    // this repo has now paid for three times, and it produces a CONFIDENT WRONG
    // FAILURE, which is worse than a missed one.
    const noOldWords = s => !/\badd\s*action\b/i.test(String(s || ''))
                         && !/\bcross[- ]?group/i.test(String(s || ''));

    const A = {
        // ---- CHANGE 1, read off each surface -------------------------------
        indexOrganizerButtonReadsSideBets: /SIDE BETS/i.test(idxOrganizer.addControlText),
        indexOrganizerButtonIsAButton: idxOrganizer.addControlTag === 'button',
        indexSheetTitleReadsSideBets: /side bets/i.test(String(idxOrganizer.sheetTitle || '')),
        indexSheetActuallyOpened: idxOrganizer.sheetPresent === true,
        // The group-locked variant is the SAME control in its other state, and it
        // said "+ ADD GROUP 1 ACTION" - the words split across the group number.
        indexGroupLinkLabelReadsSideBets: /SIDE BETS/i.test(idxGroupLink.addControlText),
        indexGroupLinkStillNamesTheGroup: /GROUP 1/i.test(idxGroupLink.addControlText),
        indexGroupLinkIsStillALink: idxGroupLink.addControlTag === 'a'
            && /sidematches\.html/.test(String(idxGroupLink.addControlHref || '')),
        sidematchesAddButtonReadsSideBets: /SIDE BETS/i.test(smOrganizer.addButtonText),
        sidematchesModalTitleReadsSideBets: /side bets/i.test(String(smOrganizer.modalTitle || '')),

        // ---- CHANGE 2 -------------------------------------------------------
        matchesCardHeadingReadsAnyGroup: /any group/i.test(String(smOrganizer.cardHeading || '')),
        matchesCardHeadingKeepsSideMatches: /side matches/i.test(String(smOrganizer.cardHeading || '')),
        anchorWarningReadsAnyGroup: smGroupLink.warningText === null
            ? false : /any group/i.test(smGroupLink.warningText),
        autoPairRefusalReadsAnyGroup: (smGroupLink.alerts || []).some(a => /any group/i.test(a)),

        // ---- AND THE OLD WORDS ARE GONE FROM EVERY SURFACE READ -------------
        noOldWordsOnTheActionCentre: noOldWords(idxOrganizer.mountText),
        noOldWordsOnTheGroupLinkCentre: noOldWords(idxGroupLink.mountText),
        noOldWordsOnTheMatchesCard: noOldWords(smOrganizer.cardHeading)
            && noOldWords(smOrganizer.addButtonText) && noOldWords(smOrganizer.modalTitle),
        noOldWordsInTheGroupLinkAlerts: (smGroupLink.alerts || []).every(noOldWords),
        noOldWordsInTheAnchorWarning: noOldWords(smGroupLink.warningText),
    };

    // ---- CONTROL: THE MONEY ON AN EXISTING CROSS-GROUP ROUND -------------
    // Hand-computed above: 101 +$20, 103 +$20, 106 -$20, 108 -$20.
    const body = String(settled.body || '');
    report.settlement = { summary: settled.summary, bodyHead: body.slice(0, 400) };
    if (!/\$\d/.test(body)) bail('settlement.html printed no money at all, so nothing about it was measured');
    Object.assign(A, {
        crossGroupBetsStillSettle: /Al Green/.test(body) && /Fi Lane/.test(body),
        crossGroupMoneyIsTheHandFigure:
            /Al Green[^A-Za-z]{0,18}\+?\$20\b/.test(body) && /Cy Young[^A-Za-z]{0,18}\+?\$20\b/.test(body),
        crossGroupLosersAreTheHandFigure:
            /Fi Lane[^A-Za-z]{0,18}[-\u2212]\$20\b/.test(body) && /Hal Reed[^A-Za-z]{0,18}[-\u2212]\$20\b/.test(body),
    });

    // ---- CONTROL: THE NAMES ---------------------------------------------
    const missingNames = [];
    Object.keys(MUST_STILL_EXIST).forEach(file => {
        const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
        MUST_STILL_EXIST[file].forEach(needle => {
            if (!src.includes(needle)) missingNames.push(file + ': ' + needle);
        });
    });
    A.nothingWasRenamed = missingNames.length === 0;
    report.missingNames = missingNames;

    // ---- CONTROL: THE WRITE ---------------------------------------------
    // A cross-group side bet created through the page's own controls, and the
    // payload read back off the stub.
    const j = await openJourney({ db: JSON.parse(JSON.stringify(db)) });
    let written = null, writeErr = null;
    try {
        await j.goto(jUrl('sidematches.html', 'game=MANY&organizer=' + TOKEN), 3000);
        await j.evaluate(PRE);
        await j.evaluate(`(() => { const b = Array.from(document.querySelectorAll('button'))
            .find(x => /openSideMatchModal/.test(x.getAttribute('onclick')||'')); if (b) b.click(); return !!b; })()`);
        await j.evaluate(`(() => { const c = Array.from(document.querySelectorAll('.sm-scope-choice'))
            .find(x => /pickActionScope\\('cross'\\)/.test(x.getAttribute('onclick')||'')); if (c) c.click(); return !!c; })()`);
        // 101 (Group 1) against 106 (Group 2) - a genuine cross-group 1v1.
        await j.evaluate(`(() => {
            const set = (id, v) => { const e = document.getElementById(id); if (!e) return false;
                e.value = v; e.dispatchEvent(new Event('change',{bubbles:true})); return true; };
            set('sm-format','match'); set('sm-scoring','net'); set('sm-stake','20');
            set('sm-press-rule','none');
            // The page's own roster tiles, tapped the way a golfer taps them.
            const badges = Array.from(document.querySelectorAll('#sidematch-modal .player-pick-badge'));
            const tap = (id, side) => {
                const h = "pickPlayerForSide('" + id + "', '" + side + "')";
                const b = badges.find(x => (x.getAttribute('onclick') || '').indexOf(h) >= 0);
                if (b) b.click();
                return !!b;
            };
            return JSON.stringify({ badges: badges.length, a: tap('101','a'), b: tap('106','b') }); })()`);
        await j.evaluate(`(() => { const s = Array.from(document.querySelectorAll('button'))
            .find(x => /saveSideMatch/.test(x.getAttribute('onclick')||'')); if (s) s.click(); return !!s; })()`);
        const d = await j.harvest();
        const sm = ((d.events || {}).MANY || {}).sideMatches || {};
        const fresh = Object.keys(sm).filter(k => k !== 'xg1' && k !== 'xg2');
        written = fresh.length ? sm[fresh[0]] : null;
    } catch (e) { writeErr = String(e && e.message || e); }
    finally { await j.close(); }
    report.write = { payload: written, error: writeErr };

    // HAND-CHECKED, FIELD BY FIELD. This is the shape sidematches.html has always
    // written: a push key under sideMatches, scope the literal 'cross'.
    Object.assign(A, {
        theWriteStillHappens: !!written,
        theWriteKeepsTheScopeKey: !!written && written.scope === 'cross',
        theWriteKeepsTheTeamKeys: !!written && Array.isArray(written.teamAIds)
            && Array.isArray(written.teamBIds),
        theWriteKeepsFormatAndScoring: !!written && written.format === 'match'
            && written.scoring === 'net',
        theWriteKeepsTheStake: !!written && Number(written.stake) === 20,
        theWriteCarriesNoRenamedKey: !!written
            && !Object.keys(written).some(k => /sidebet|anygroup|any_group/i.test(k)),
    });

    Object.keys(A).forEach(k => { if (!A[k]) problems.push(k + ': FAILED'); });

    report.handComputed = {
        bets: 'xg1 101 v 106 $20 match; xg2 103 v 108 $20 match',
        gross: 'even ids 72, odd ids 90, all hcp 0, so net = gross',
        expected: { 'Al Green (101)': '+$20', 'Cy Young (103)': '+$20',
                    'Fi Lane (106)': '-$20', 'Hal Reed (108)': '-$20', total: '$40 moved, zero-sum' },
    };
    report.assertions = A;
    report.problems = problems;
    report.verdict = problems.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
