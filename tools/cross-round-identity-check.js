#!/usr/bin/env node
// ============================================================================
// DOES A CUP NAME THE SAME GOLFERS ON A ROUND IT DID NOT CREATE?
//
// ARRIVES COLD. Two rounds are put in the database - a host holding the Cup, and
// a second round pointing at it - and the scorecard is opened on the SECOND one.
// The page loads its own scripts, fetches the host round through its own
// loadRyderHostCup, and resolves the Cup through its own resolver. Nothing is
// invoked from outside.
//
// The away round deliberately lists the same four golfers IN A DIFFERENT ORDER.
// Player ids are per-round and positional, so without translation the Cup's ids
// name different people and both sides swap - silently.
//
// AND IT MUST REFUSE WHEN IT CANNOT BE SURE. Two further arrivals check that:
//   placeholder names  the app saves a blank name field as "Player 3", so two
//                      rounds of unnamed golfers carry identical names. Matching
//                      on those pairs people by position all over again.
//   duplicate names    two golfers called Mike cannot be told apart.
// Both must land on 'identity-unresolved' and be unusable, not on a Cup naming
// whoever happened to line up.
//
//   node tools/cross-round-identity-check.js
//
//   exit 0   PASS
//   exit 1   FAIL - the JSON says which arrival broke
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });

const HOST_PLAYERS = [
    { id: 101, name: 'Marty Sharp', hcp: '8' }, { id: 102, name: 'Manny Orozco', hcp: '4' },
    { id: 103, name: 'Lance Webb', hcp: '15' }, { id: 104, name: 'Zach Hill', hcp: '0' }];
// The SAME four golfers, entered in a different order - all it takes to break
// positional ids.
const AWAY_PLAYERS = [
    { id: 101, name: 'Zach Hill', hcp: '0' }, { id: 102, name: 'Lance Webb', hcp: '15' },
    { id: 103, name: 'Manny Orozco', hcp: '4' }, { id: 104, name: 'Marty Sharp', hcp: '8' }];
const PLACEHOLDERS = [
    { id: 101, name: 'Player 1', hcp: '0' }, { id: 102, name: 'Player 2', hcp: '0' },
    { id: 103, name: 'Player 3', hcp: '0' }, { id: 104, name: 'Player 4', hcp: '0' }];
const TWO_MIKES = [
    { id: 101, name: 'Mike', hcp: '0' }, { id: 102, name: 'Mike', hcp: '0' },
    { id: 103, name: 'Lance Webb', hcp: '15' }, { id: 104, name: 'Zach Hill', hcp: '0' }];

const CUP = {
    v: 1, name: 'Myrtle Cup',
    sides: { A: { id: 'A', name: 'Rattle' }, B: { id: 'B', name: 'Chaos' } },
    members: { '101': 'A', '102': 'A', '103': 'B', '104': 'B' },
    sessions: { d1s2: { id: 'd1s2', day: 1, order: 2, format: 'fourball', label: 'Day 1 Four-Ball' } },
    matches: {
        m1: { id: 'm1', sessionId: 'd1s2', format: 'fourball', scoring: 'net',
              sideA: 'A', sideB: 'B', playersA: ['101', '102'], playersB: ['103', '104'] }
    }
};

const scoresFor = players => {
    const s = {};
    players.forEach(p => CD.forEach(h => { s['p' + p.id + '_h' + h.hole] = 4; }));
    return s;
};

function rounds(hostPlayers, awayPlayers) {
    return {
        HOST: { eventName: 'Day 1 Foursomes', gameFormat: 'stroke', players: hostPlayers,
                courseData: CD, scores: scoresFor(hostPlayers), ryderCup: CUP,
                ryderCupRef: { host: 'HOST', sessionId: 'd1s2' } },
        AWAY: { eventName: 'Day 1 Four-Ball', gameFormat: 'stroke', players: awayPlayers,
                courseData: CD, scores: scoresFor(awayPlayers),
                ryderCupRef: { host: 'HOST', sessionId: 'd1s2' } }
    };
}

const PROBE = `
(() => {
  const res = (typeof ryderResolution === 'function') ? ryderResolution() : null;
  const out = { status: res ? res.status : null,
                usable: res ? ryderResolutionUsable(res) : null,
                problems: res && res.identityProblems
                    ? res.identityProblems.map(p => p.type) : [] };

  // WHAT THE GOLFER ACTUALLY SEES. A correct refusal that says nothing is the
  // defect this whole thread started on, so the rendered card is read here rather
  // than the resolution object - and it is read off the page, wherever the page
  // decided to put it, not from a renderer called by name.
  const cardEl = Array.from(document.querySelectorAll('.rc-card'))[0];
  out.cardOnScreen = !!(cardEl && cardEl.getClientRects().length > 0
      && cardEl.getBoundingClientRect().height > 0);
  out.cardText = cardEl
      ? (cardEl.textContent || '').replace(/\\s+/g, ' ').trim() : '';
  if (res && res.cup && ryderResolutionUsable(res)) {
    const cfg = ryderCupConfig(res.cup);
    const byId = {};
    (currentData.players || []).forEach(p => { byId[String(p.id)] = p.name; });
    const r = ryderMatchRoster(cfg.matches.m1);
    out.sideA = r.a.map(i => byId[i] || ('#' + i));
    out.sideB = r.b.map(i => byId[i] || ('#' + i));
  }
  return JSON.stringify(out);
})()`;

function bail(msg) {
    console.error('cross-round-identity-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

(async () => {
    const problems = [];
    const report = {};

    // 1. The real case: the Cup must name the same golfers on the away round.
    const good = await arriveCold({ url: fileUrl('index.html', 'game=AWAY'),
        rounds: rounds(HOST_PLAYERS, AWAY_PLAYERS), expression: PROBE, settleMs: 4000 });
    if (!good.ok) bail(good.reason);
    report.translated = JSON.parse(good.value);
    if (report.translated.status !== 'referenced')
        problems.push('the away round did not resolve its Cup (' + report.translated.status + ')');
    if (JSON.stringify(report.translated.sideA) !== JSON.stringify(['Marty Sharp', 'Manny Orozco']))
        problems.push('side A is ' + JSON.stringify(report.translated.sideA)
                      + ' - the Cup named the wrong golfers');
    if (JSON.stringify(report.translated.sideB) !== JSON.stringify(['Lance Webb', 'Zach Hill']))
        problems.push('side B is ' + JSON.stringify(report.translated.sideB));

    // 2. Placeholder names cannot identify anyone and must refuse.
    const ph = await arriveCold({ url: fileUrl('index.html', 'game=AWAY'),
        rounds: rounds(PLACEHOLDERS, PLACEHOLDERS), expression: PROBE, settleMs: 4000 });
    if (!ph.ok) bail(ph.reason);
    report.placeholders = JSON.parse(ph.value);
    if (report.placeholders.status !== 'identity-unresolved')
        problems.push('placeholder names resolved to a Cup instead of refusing ('
                      + report.placeholders.status + ')');
    if (report.placeholders.usable)
        problems.push('a Cup built on "Player 1..4" was treated as usable');
    // A REFUSAL THAT SAYS NOTHING IS THE DEFECT, not the fix.
    if (!report.placeholders.cardOnScreen)
        problems.push('the golfer is shown nothing at all where a Cup should be');
    if (!/no name/i.test(report.placeholders.cardText))
        problems.push('the card does not say the names are the problem: "'
                      + report.placeholders.cardText + '"');
    if (!/HOST/.test(report.placeholders.cardText))
        problems.push('the card does not say which round to fix');
    if (!/scoring is unaffected/i.test(report.placeholders.cardText))
        problems.push('the golfer is not told they can still score');

    // 3. Two golfers with one name cannot be told apart.
    const dup = await arriveCold({ url: fileUrl('index.html', 'game=AWAY'),
        rounds: rounds(TWO_MIKES, TWO_MIKES), expression: PROBE, settleMs: 4000 });
    if (!dup.ok) bail(dup.reason);
    report.duplicates = JSON.parse(dup.value);
    if (report.duplicates.status !== 'identity-unresolved')
        problems.push('duplicate names resolved by guessing ('
                      + report.duplicates.status + ')');
    if (report.duplicates.usable)
        problems.push('a Cup with two golfers called Mike was treated as usable');
    if (!/tell them apart/i.test(report.duplicates.cardText))
        problems.push('the card does not explain the duplicate: "'
                      + report.duplicates.cardText + '"');
    if (!/Mike/.test(report.duplicates.cardText))
        problems.push('the card does not name the ambiguous golfer');
    // The working case must NOT apologise for itself.
    if (/no name|tell them apart|would not load/i.test(report.translated.cardText || ''))
        problems.push('a Cup that resolved fine is showing a refusal message');

    report.problems = problems;
    report.verdict = problems.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
