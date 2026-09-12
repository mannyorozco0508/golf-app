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
//   node tools/tournament-team-link-check.js
//
//   exit 0   the screen's description matches what the links measurably do
//   exit 1   the screen claims a protection the links do not have
//   exit 2   could not run, or a card rendered nothing. NOTHING PROVEN.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

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
            teams: teams, scores: {}, createdAt: 1, courseIndexSynthetic: false
        }
    },
    events: {}, trips: {}, global_courses: {}
};

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
    everyLine: lines
  });
})()`;

async function look(page, query, probe) {
    const r = await arriveCold({ url: fileUrl(page, query), db, expression: probe, settleMs: 7000 });
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
function claimsExclusivity(sentence) {
    const cap = CAPABILITY.exec(sentence || '');
    if (!cap) return false;
    return PERSON.test(String(sentence).slice(Math.max(0, cap.index - 28), cap.index));
}

(async () => {
    const bail = (why, extra) => {
        console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2));
        process.exit(2);
    };

    const own = await look('tournament-scorecard.html', 'tourney=LINK01&team=1', CARD_PROBE);
    const other = await look('tournament-scorecard.html', 'tourney=LINK01&team=7', CARD_PROBE);
    const org = await look('tournament.html', 'tourney=LINK01', ORGANIZER_PROBE);
    if (!own.ran) bail('team 1 card did not run: ' + own.reason);
    if (!other.ran) bail('team 7 card did not run: ' + other.reason);
    if (!org.ran) bail('the organizer screen did not run: ' + org.reason);

    // ---- THE GATE ----
    if (own.editable === 0) {
        bail('a team opening its OWN link found nothing to type into, so "another team is '
           + 'editable" cannot mean anything and the page is broken for a different reason',
            { own });
    }
    if (org.linksBlurb === null) {
        bail('the organizer screen has no "Team Scorecard Links" section, so there is no '
           + 'sentence to hold against the measurement',
            { firstLines: (org.everyLine || []).slice(0, 25) });
    }

    const failures = [];
    const sentences = String(org.linksBlurb).split(/(?<=[.;!?])\s+/).filter(Boolean);
    const claiming = sentences.filter(claimsExclusivity);

    // ---- THE BINDING. Measured reach vs stated reach. ----
    if (other.editable > 0 && claiming.length > 0) {
        failures.push(`the organizer screen claims exclusivity - ${JSON.stringify(claiming)} - `
            + `while a link pointed at ANOTHER team opened ${other.editable} of ${other.inputs} `
            + `editable inputs on ${JSON.stringify(other.teamsNamed)}. Team 1's own link opened `
            + `${own.editable}. The sentence describes a protection the links do not have, and `
            + `it is read by the person deciding how carefully to send them.`);
    }
    if (other.editable === 0 && claiming.length === 0 && !other.refused) {
        failures.push('another team\'s link opened nothing AND the screen makes no claim - which '
            + 'may be right, but this check can no longer tell a locked link from a broken one. '
            + 'Look at it by hand.');
    }

    const verdict = failures.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({
        verdict, failures,
        measured: {
            ownLink: { editable: own.editable, of: own.inputs, teamsNamed: own.teamsNamed },
            otherTeamLink: { editable: other.editable, of: other.inputs, teamsNamed: other.teamsNamed },
        },
        organizerBlurb: org.linksBlurb,
        sentencesClaimingExclusivity: claiming
    }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => {
    console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String((e && e.message) || e) }, null, 2));
    process.exit(2);
});
