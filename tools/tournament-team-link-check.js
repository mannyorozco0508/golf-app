#!/usr/bin/env node
// ============================================================================
// WHAT THE ORGANIZER IS TOLD ABOUT THE TEAM LINKS MUST MATCH WHAT THEY DO.
//
// tournament.html says, beside the links, in normal type:
//
//     "Send each team ONLY their own link. They can only enter their own
//      team's scores."
//
// The second sentence is false. The team number is a URL parameter and nothing
// checks who holds it, so a volunteer sent team 1's link reaches team 7's card
// by editing one character.
//
// THE SENTENCE IS BOUND TO EDITABILITY, NOT TO A PROXY. This check does not
// assert against a group count, a rules file, or a comment - it OPENS two team
// links, COUNTS the inputs a golfer could actually type into on each, and only
// then asks whether the organizer's screen is telling the truth about them.
// That is the lesson from the round-share note: a sentence about who can write
// must be measured by writing, or by the presence of somewhere to write.
//
// WHY BOTH ARMS. Measuring only team 1 proves nothing - of course your own link
// opens your own card. The claim is about what a holder CANNOT reach, so the
// check has to reach for something else and report what it found.
//
// THE POSITIVE ARM MATTERS TOO. A page that rendered no inputs at all would
// satisfy "you cannot edit another team" trivially, and would also be broken.
// So team 1 must be editable for the team-7 result to mean anything, and the
// gate refuses to grade otherwise.
//
// SINCE THE SCORECARD-LOCK WAVE (2026-10-06) IT MEASURES THE WRITE, NOT THE
// INPUTS. Changing &team= on a link still opens an editable card - the page
// cannot know the key is wrong - so counting editable inputs would report the
// old reach forever. Each card is now opened with the page's REAL Firebase SDK
// against a database emulator running the REAL rules (tools/lib/db-emulator.js),
// a score is typed into the first hole box, and the check reads what the
// SERVER holds and what the card says. Team 1's link must save; the same link
// with team=7 must be refused, show "Not saved", and never "Saved".
//
//   node tools/tournament-team-link-check.js
//
//   exit 0   the screen's description matches what the links measurably do
//   exit 1   the screen claims a protection the links do not have
//   exit 2   could not run, or a card rendered nothing. NOTHING PROVEN.
// ============================================================================

const path = require('path');
const crypto = require('crypto');
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const { startEmulator } = require('./lib/db-emulator.js');
const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };

const PARS = [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4];
const course = PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: ((i * 7) % 18) + 1 }));

// Eight teams, so team 7 is a real team a link can be pointed at - not a
// missing one, which would refuse for the wrong reason.
const teams = {};
for (let t = 1; t <= 8; t++) {
    // players are an ARRAY OF NAME STRINGS - what saveTournament and
    // saveNewTeam both store. An earlier fixture used objects here and every
    // row rendered "[object Object]", which looked like a rendering defect and
    // was not.
    teams['team' + t] = {
        num: t, name: 'Team ' + t,
        players: ['P' + t + 'a', 'P' + t + 'b', 'P' + t + 'c', 'P' + t + 'd'],
        handicap: String(t % 18), startingHole: String(t)
    };
}
const db = {
    tournaments: {
        LINK01: {
            name: 'Charity Scramble', format: 'scramble', courseName: 'Tidewater',
            activeCourseKey: 'tidewater', courseData: course, entryFee: '100',
            teams: teams, scores: {}, createdAt: 1, courseIndexSynthetic: false,
            // OWNED (re-armed Wave 1, A3): the links block and the sentence beside
            // it are the organizer handout, hidden for anyone but the owner.
            ownerUid: 'u-org'
        }
    },
    // LOCKED: every team has a key and the lock is on, as a new event is born.
    tournamentKeys: { LINK01: { on: true, t: Object.fromEntries(Object.keys(teams).map((k) => [k, crypto.randomBytes(16).toString('hex')])) } },
    events: {}, trips: {}, global_courses: {}
};

// Types a score into the first hole box the way a scorekeeper does, then the
// probe reads what the CARD says about it (save-state) after the server answers.
// WAITS FOR THE BOX rather than a fixed 3.5 s: against the emulator the first
// snapshot can take longer, and a fixed wait made one sweep run report "no hole
// box" on a card that rendered a moment later. Measured: the FIRST SDK
// connection to a freshly started emulator can take well over 6 s.
const TYPE = `(function tryType(n) {
  var i = document.querySelector('#holes-list input');
  if (!i && n > 0) return setTimeout(function () { tryType(n - 1); }, 250);
  window.__typed = !!i;
  if (i) { i.value = '4'; i.dispatchEvent(new Event('change', { bubbles: true })); }
})(80);`;
const SAVE_PROBE = `(() => JSON.stringify({ typed: !!window.__typed, text: (document.body.innerText || '').slice(0, 300),
  saveState: (document.getElementById('save-state') || {}).innerText || '' }))()`;
const CARD_PROBE = `
(() => {
  const inputs = Array.prototype.slice.call(document.querySelectorAll('input'))
    .filter(i => i.type === 'number' || /hole-score/.test(i.className || ''));
  const body = (document.body.innerText || '');
  return JSON.stringify({
    rendered: body.length,
    inputs: inputs.length,
    editable: inputs.filter(i => !i.disabled && !i.readOnly).length,
    teamsNamed: [...new Set(body.match(/Team \\d+/g) || [])],
    refused: /Link Not Found|no group|Ask your organizer/i.test(body)
  });
})()`;

// The organizer's own screen, read the way a head pro reads it.
const ORGANIZER_PROBE = `
(() => {
  // Since the auth wave the scoring-link block lives on the Leaderboard tab,
  // beside the print buttons, so it stays open when the Setup tab is not
  // rendered. A legacy record lands on Setup, so tap the tab a user would.
  const lb = Array.prototype.slice.call(document.querySelectorAll('.top-nav-item')).find(x => /Leaderboard/.test(x.textContent || ''));
  if (lb) lb.click();
  const body = (document.body.innerText || '');
  const lines = body.split('\\n').map(s => s.trim()).filter(Boolean);
  const i = lines.findIndex(l => /Team Scorecard Links/i.test(l));
  return JSON.stringify({
    rendered: body.length,
    linksBlurb: i >= 0 ? (lines[i + 1] || '') : null,
    // The links exactly as the Share buttons hand them out.
    shareUrls: Array.prototype.slice.call(document.querySelectorAll('#team-links-list button[data-share-url]')).map(b => b.getAttribute('data-share-url')),
    everyLine: lines
  });
})()`;

async function look(page, query, probe, auth) {
    const r = await arriveCold({ url: fileUrl(page, query), db, expression: probe, settleMs: 7000, auth });
    if (!r.ok) return { ran: false, reason: r.reason };
    try { return { ran: true, ...JSON.parse(r.value) }; }
    catch (e) { return { ran: false, reason: 'non-JSON: ' + String(r.value).slice(0, 200) }; }
}

// A sentence claiming the app PREVENTS something. Same shape as
// tournament_claims_test.js: a person-subject immediately before a capability
// verb. Kept deliberately narrow - this check is about one blurb, and the
// page-wide sweep lives in the unit test.
const PERSON = /\b(they|he|she|you|anyone|everyone|nobody|no one|players?|golfers?|teams?|volunteers?)\b/i;
const CAPABILITY = /\b(can|cannot|can't|could|able|unable|allowed|permitted|prevented|restricted)\b/i;
// POLARITY (Option A, 2026-09-16). "Anyone who has a link can score that card"
// is person + capability and promises NOTHING - it is the admission this check
// measured into the page. A claim of exclusivity also narrows: only, cannot,
// nobody... Same three-part rule as tournament_claims_test.js.
const RESTRICTION = /\b(only|cannot|can't|can not|unable|prevented|blocked|restricted|may not|must not|nobody|no one|never|not able|not allowed|not permitted)\b/i;
function personBeforeCapability(sentence) {
    const cap = CAPABILITY.exec(sentence || '');
    if (!cap) return false;
    return PERSON.test(String(sentence).slice(Math.max(0, cap.index - 28), cap.index));
}
function claimsExclusivity(sentence) {
    return personBeforeCapability(sentence) && RESTRICTION.test(sentence || '');
}
// The admission: a grant to anyone/everyone with no restriction. Bound the
// other way below - if another team's link ever stops being editable, this
// sentence becomes the lie.
function grantsToAnyone(sentence) {
    return personBeforeCapability(sentence) && /\b(anyone|everyone|anybody)\b/i.test(sentence || '') && !RESTRICTION.test(sentence || '');
}

(async () => {
    const bail = (why, extra) => {
        console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2));
        process.exit(2);
    };

    // ---- THE ORGANIZER'S SCREEN: the blurb, and team 1's link as handed out ----
    const org = await look('tournament.html', 'tourney=LINK01', ORGANIZER_PROBE, OWNER);
    if (!org.ran) bail('the organizer screen did not run: ' + org.reason);
    if (org.linksBlurb === null) {
        bail('the organizer screen has no "Team Scorecard Links" section, so there is no '
           + 'sentence to hold against the measurement',
            { firstLines: (org.everyLine || []).slice(0, 25) });
    }
    const team1Link = (org.shareUrls || []).find((u) => /[?&]team=1(&|$)/.test(u));
    if (!team1Link || !/[?&]k=[0-9a-f]{32}/.test(team1Link)) bail('the owner screen handed out no keyed link for team 1', org.shareUrls);
    const q1 = team1Link.split('?')[1];
    const q7 = q1.replace(/([?&]|^)team=1(&|$)/, '$1team=7$2');

    // ---- THE CARDS, AGAINST THE REAL RULES ----
    let emu;
    try { emu = await startEmulator({ rulesPath: path.join(__dirname, '..', 'database.rules.json'), port: 9473, ns: 'teamlink' }); }
    catch (e) { bail('could not start the emulator: ' + e.message); }
    await emu.admin('PUT', '', { tournaments: db.tournaments, tournamentKeys: db.tournamentKeys });
    // A BLANK LOAD IS RETRIED, AND SAID SO. On a loaded machine a headless
    // Chrome sometimes hands back a page that never loaded (0 characters, no
    // DOM) - measured 2 of 3 runs one evening with nine orphaned headless
    // Chromes from older sessions still running. That is not a card result,
    // so it is retried up to twice and the count is printed in the verdict.
    let retries = 0;
    const card = async (q) => {
        for (let i = 0; i < 3; i++) {
            const c = await cardOnce(q);
            if (!c.ran || c.rendered > 0) return c;
            retries++;
        }
        return cardOnce(q);
    };
    const cardOnce = async (q) => {
        const r = await arriveCold({ url: fileUrl('tournament-scorecard.html', q), emulator: emu.url, preScript: TYPE, settleMs: 16000,
            steps: [{ expression: CARD_PROBE }, { expression: SAVE_PROBE }] });
        if (!r.ok) return { ran: false, reason: r.reason };
        try { return Object.assign({ ran: true }, JSON.parse(r.value[0]), JSON.parse(r.value[1])); }
        catch (e) { return { ran: false, reason: 'non-JSON: ' + String(r.value).slice(0, 200) }; }
    };
    const own = await card(q1);
    const other = await card(q7);
    const stored = await emu.admin('GET', 'tournaments/LINK01/scores');
    emu.stop();
    if (!own.ran) bail('team 1 card did not run: ' + own.reason);
    if (!other.ran) bail('team 7 card did not run: ' + other.reason);
    if (!own.typed || !other.typed) bail('a card had no hole box to type into', { own, other });

    const failures = [];
    const ownSaved = !!(stored && stored.team1_h1 === 4);
    const otherSaved = !!(stored && stored.team7_h1 !== undefined);
    // ---- THE GATE: the positive arm ----
    if (!ownSaved) bail('team 1, on its OWN keyed link, did not save - so a refused team 7 proves nothing', { own, stored });

    // ---- THE MEASUREMENT: what the database did with the tampered link ----
    if (otherSaved) failures.push(`team 1's link with team=7 SAVED a score on team 7's card (server holds team7_h1=${stored.team7_h1})`);
    if (!/Not saved/.test(other.saveState)) failures.push('the refused card did not say "Not saved": ' + JSON.stringify(other.saveState));
    if (/Saved/.test(other.saveState.replace(/Not saved/g, ''))) failures.push('the refused card showed "Saved": ' + JSON.stringify(other.saveState));

    // ---- THE BINDING: the organizer's sentence against what was measured ----
    const sentences = String(org.linksBlurb).split(/(?<=[.;!?])\s+/).filter(Boolean);
    const claiming = sentences.filter(claimsExclusivity);
    const granting = sentences.filter(grantsToAnyone);
    if (otherSaved && claiming.length > 0) failures.push('the screen claims exclusivity ' + JSON.stringify(claiming) + ' while a tampered link saved');
    if (!ownSaved && granting.length > 0) failures.push('the screen says anyone with a link can score while a link\'s own card did not save');
    const verdict = failures.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({
        verdict, failures,
        measured: {
            ownLink: { query: q1.replace(/k=[0-9a-f]+/, 'k=<team1 key>'), saved: ownSaved, saveState: own.saveState, editable: own.editable },
            team1LinkPointedAtTeam7: { query: q7.replace(/k=[0-9a-f]+/, 'k=<team1 key>'), saved: otherSaved, saveState: other.saveState, editable: other.editable },
            serverScores: stored
        },
        emulatorOnlyTransform: emu.transformed + ' x registrations email regex',
        blankLoadsRetried: retries,
        organizerBlurb: org.linksBlurb,
        sentencesClaimingExclusivity: claiming,
        sentencesGrantingToAnyone: granting
    }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => {
    console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String((e && e.message) || e) }, null, 2));
    process.exit(2);
});
