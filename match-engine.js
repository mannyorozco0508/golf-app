// ============================================================================
// match-engine.js — THE ONE calculateMatchEngine
//
// Hole-by-hole match play: who is up, by how much, which segments are still
// live, which have closed, what each is worth, and the money that changes hands
// if the round ended right now. Match Play, Nassau (three independent wagers),
// Best Ball, Scramble and Ryder Cup all settle through this one function.
//
// WHY IT IS ITS OWN FILE (v218).
//
// It used to live in money-engine.js, and index.html and stats.html each carried
// an inline copy. An inline <script> parses AFTER the external ones, so on the
// scorecard and on Stats the PAGE's copy was the one that ran - and the copies
// had drifted:
//   · both pages wrapped the winner's name in escapeHtml() inside the engine
//   · index.html built and returned a `pressesByHole` that nothing ever read
//   · stats.html's return dropped t1Players and t2Players
// Three copies of the function that decides who pays whom, and no test could see
// which one a given screen used. Measured before deleting: 3 copies, 13 fixtures,
// 0 disagreements beyond those three fields - so the drift had not yet cost a
// golfer money. It was going to.
//
// stats.html did not load money-engine.js at all, so canonicalising by pointing
// it at money-engine.js would have meant 67KB of engine for one function, with
// ten more duplicates still sitting in the page. handicap.js is the precedent:
// when Batch 3 hit this same wall it gave the shared functions a file of their
// own rather than making a page swallow the whole engine. This is that move.
//
// THE ESCAPING IS NOT HERE, ON PURPOSE. The page copies escaped finalResult and
// left t1Name, t2Name and holeWinner raw in the same render - index.html:9262
// escaped the closed-match arm of a ternary and left the live arm open, both
// into the same innerHTML. Escaping inside the engine cannot reach the team
// names, so it was a half-applied guard that read like a complete one. This
// function returns PLAIN TEXT and every caller escapes at the sink, where it can
// cover the names too.
//
// DEPENDS ON handicap.js: getStrokes, parseHcp, allocateMatchStrokes,
// matchHandicapBaseline, matchRelativeHandicaps, isRelativeMatchFormat. Load it
// first. Nothing here runs at load time; it declares one function.
//
// GUARDED BY match_engine_parity_test.js: exactly one declaration in the repo,
// the recorded arithmetic of 13 fixtures, and - if a page copy is ever
// reintroduced - an automatic full-return comparison against this file.
// ============================================================================

// ============================================================================
// RELATIVE MATCH-PLAY HANDICAPS - ONE BASELINE FOR THE WHOLE MATCH
// ============================================================================
// The lowest Playing Handicap among EVERY golfer in the match plays off zero, and
// every other golfer - INCLUDING THE LOWEST GOLFER'S OWN PARTNER - receives the
// arithmetic difference from that single baseline, allocated from stroke index 1
// upward. There is exactly ONE baseline per match. It is never recomputed per
// team, per Nassau segment, or per press.
//
// 2v2 worked example, 5 and 12 against 8 and 17:
//   baseline = 5  ->  5 plays off 0, 12 receives 7, 8 receives 3, 17 receives 12
// The 12 is the 5's own partner and still receives 7. That is the intended rule:
// team membership does not decide the baseline, the field of the match does.
//
// parseHcp stores a plus handicap as a negative (+2 -> -2), so the differential is
// plain arithmetic and needs no special case: +2, 3, 7, 10 gives a baseline of -2
// and relative handicaps of 0, 5, 9, 12. The ordinary course-based plus-handicap
// giveback that starts at SI 18 belongs to stroke-play net scoring and is
// deliberately NOT used here; getStrokes() keeps it, untouched.





function calculateMatchEngine(players, courseData, savedScores, scoringType, gameFormat, pressRule, stake, holeBet, manualPresses, stakeConfig) {
    // THREE-STAKE NASSAU (authorized change).
    //
    // A real Nassau is three independent wagers - "$5 front, $5 back, $10 overall" -
    // and the app could only express one number for all three. stakeConfig carries
    // them; when it is absent EVERY segment falls back to `stake`, so a legacy round
    // settles to the cent exactly as before. No historical data is migrated.
    //
    //   stakeConfig = { F9: 5, B9: 5, '18': 10, autoPress: <amount>|null }
    //
    // AUTO-PRESS AMOUNT is its own setting, defaulting to the segment's own stake.
    // A press on the $5 front must never settle at the $10 overall stake - and a
    // manually enlarged press never cascades into later automatic ones, because the
    // golfers agreed to the house auto-press amount, not to that one-off escalation.
    const segCfg = stakeConfig || {};
    const baseStakeFor = id => {
        const v = segCfg[id];
        return (v === undefined || v === null || v === '') ? stake : Number(v);
    };
    // AUTO-PRESS AMOUNT, most specific wins:
    //   autoPress.F9 / .B9 / .18   a per-segment amount, if the players set one
    //   autoPress                  a single amount for every segment
    //   (neither)                  that segment's own stake - the default
    // Manual presses never reach here; they keep the amount the golfer typed.
    const autoPressStakeFor = id => {
        const ap = segCfg.autoPress;
        const blank = v => v === undefined || v === null || v === '';
        if (ap !== null && typeof ap === 'object') {
            if (!blank(ap[id])) return Number(ap[id]);
            return baseStakeFor(id);
        }
        return blank(ap) ? baseStakeFor(id) : Number(ap);
    };
    let teams = {};
    players.forEach(p => {
        let key = p.team || "Team 1";
        if (!teams[key]) teams[key] = [];
        teams[key].push(p);
    });

    const teamKeys = Object.keys(teams);
    if (teamKeys.length < 2) return null;

    let t1Key = teamKeys[0];
    let t2Key = teamKeys[1];
    let t1Players = teams[t1Key];
    let t2Players = teams[t2Key];

    let t1Name = t1Players.map(p => p.name.split(" ")[0]).join("/");
    let t2Name = t2Players.map(p => p.name.split(" ")[0]).join("/");

    let hasFront = courseData.some(h => h.hole <= 9);
    let hasBack = courseData.some(h => h.hole > 9);

    let activeMatches = [];
    if (gameFormat === 'nassau') {
        if (hasFront && hasBack) {
            activeMatches = [
                { id: 'F9', baseId: 'F9', startHole: 1, endHole: 9, status: 0, label: 'Front 9', triggers: 0, closed: false, pressNum: 0, stake: baseStakeFor('F9') },
                { id: 'B9', baseId: 'B9', startHole: 10, endHole: 18, status: 0, label: 'Back 9', triggers: 0, closed: false, pressNum: 0, stake: baseStakeFor('B9') },
                { id: '18', baseId: '18', startHole: 1, endHole: 18, status: 0, label: 'Total', triggers: 0, closed: false, pressNum: 0, stake: baseStakeFor('18') }
            ];
        } else if (hasFront) {
            activeMatches = [
                { id: 'F9', baseId: 'F9', startHole: 1, endHole: 9, status: 0, label: '9-Hole Match', triggers: 0, closed: false, pressNum: 0, stake: baseStakeFor('F9') }
            ];
        } else if (hasBack) {
            activeMatches = [
                { id: 'B9', baseId: 'B9', startHole: 10, endHole: 18, status: 0, label: '9-Hole Match', triggers: 0, closed: false, pressNum: 0, stake: baseStakeFor('B9') }
            ];
        }
    } else {
        let startH = hasFront ? 1 : 10;
        let endH = hasBack ? 18 : 9;
        activeMatches = [
            { id: '18', baseId: '18', startHole: startH, endHole: endH, status: 0, label: 'Overall Match', triggers: 0, closed: false, pressNum: 0 }
        ];
    }

    // ONE relative handicap table for the ENTIRE match, computed once here rather
    // than per hole. Presses reuse this table by construction - a press is another
    // wager over the SAME hole decisions, so it cannot find a new lowest golfer,
    // create a new baseline, or renumber stroke indexes from the press hole.
    const allMatchPlayers = t1Players.concat(t2Players);
    // A one-per-side match is always relative, whatever the format is labelled,
    // which preserves the already-committed singles contract byte for byte.
    const isSinglesMatch = t1Players.length === 1 && t2Players.length === 1;
    const useRelativeHcp = scoringType === 'net'
        && (isSinglesMatch || isRelativeMatchFormat(gameFormat));
    const matchBaseline = useRelativeHcp ? matchHandicapBaseline(allMatchPlayers) : 0;
    const relHcpById = useRelativeHcp ? matchRelativeHandicaps(allMatchPlayers) : {};
    // Gross play and non-match team formats keep exactly what they had before.
    const matchStrokesFor = (p, hcpIndex) => useRelativeHcp
        ? allocateMatchStrokes(relHcpById[String(p.id)] || 0, hcpIndex)
        : (scoringType === 'net' ? getStrokes(hcpIndex, parseHcp(p.hcp)) : 0);

    let pressCount = 0;
    let maxThru = 0;
    let holeLog = {};

    courseData.forEach(hole => {
        let hNum = hole.hole;
        let t1Best = 999, t2Best = 999;
        let t1Valid = false, t2Valid = false;

        // Strokes come from the ONE match-wide relative table built before this
        // loop. Every golfer in the match, on either side, is measured against the
        // same lowest handicap - see matchHandicapBaseline().
        t1Players.forEach(p => {
            let v = savedScores[`p${p.id}_h${hNum}`];
            if (v && v > 0) {
                let str = matchStrokesFor(p, hole.hcpIndex);
                let s = parseInt(v, 10) - str;
                if (s < t1Best) t1Best = s;
                t1Valid = true;
            }
        });

        t2Players.forEach(p => {
            let v = savedScores[`p${p.id}_h${hNum}`];
            if (v && v > 0) {
                let str = matchStrokesFor(p, hole.hcpIndex);
                let s = parseInt(v, 10) - str;
                if (s < t2Best) t2Best = s;
                t2Valid = true;
            }
        });

        if (t1Valid && t2Valid) {
            maxThru++;
            let diff = 0;
            if (t1Best < t2Best) diff = 1;
            else if (t2Best < t1Best) diff = -1;

            let holeWinner = diff === 1 ? t1Name : (diff === -1 ? t2Name : "Halved");
            let newPresses = [];

            activeMatches.forEach(m => {
                if (hNum >= m.startHole && hNum <= m.endHole && !m.closed) {
                    m.status += diff;

                    let hLeft = m.endHole - hNum;
                    if (Math.abs(m.status) > hLeft) {
                        m.closed = true;
                        let winnerName = m.status > 0 ? t1Name : t2Name;
                        m.finalResult = `${winnerName} ${Math.abs(m.status)}&${hLeft}`;
                    }

                    if (hNum < m.endHole) {
                        const threshold = pressRule === '2down' ? 2 : (pressRule === '1down' ? 1 : null);
                        const autoTrigger = threshold !== null && Math.abs(m.status) >= threshold;
                        // PER-PRESS STAKE (authorized change, Aug 2026).
                        //
                        // A manual press may carry its own dollar amount - "press you for
                        // $78" is a different bet from "press you for the same $200", and
                        // silently normalising it to the original stake moved real money to
                        // the wrong number. The matched manual press is looked up (not just
                        // detected) so its stored stake can ride on the segment it creates.
                        //
                        // AUTO presses never carry a stake here: the trigger rule invented
                        // them, nobody typed an amount, and they settle at the original
                        // stake exactly as before.
                        const manualPress = (manualPresses || []).find(mp => mp.baseId === m.baseId && mp.startHole === hNum + 1);
                        const manualTrigger = !!manualPress;

                        if ((autoTrigger || manualTrigger) && m.triggers === 0) {
                            m.triggers = 1;
                            pressCount++;

                            let existingPresses = activeMatches.filter(am => am.baseId === m.baseId && am.pressNum > 0).length + newPresses.filter(am => am.baseId === m.baseId).length;
                            let nextPressNum = existingPresses + 1;

                            newPresses.push({
                                id: `P${pressCount}`,
                                baseId: m.baseId,
                                // Stored ONLY when the golfer explicitly entered one. A press
                                // without a stake settles at the original wager, which keeps
                                // every legacy round to the cent.
                                // A manual press keeps the amount the golfer typed. An
                                // automatic one takes the segment's configured auto-press
                                // amount - NOT the parent's, so a manually enlarged press
                                // cannot silently escalate every press after it.
                                stake: (manualPress && manualPress.stake !== undefined && manualPress.stake !== null)
                                    ? manualPress.stake
                                    : (gameFormat === 'nassau' ? autoPressStakeFor(m.baseId) : undefined),
                                startHole: hNum + 1,
                                endHole: m.endHole,
                                status: 0,
                                label: `Press ${nextPressNum} (Hole ${hNum + 1})`,
                                triggers: 0,
                                closed: false,
                                pressNum: nextPressNum
                            });
                        }
                    }
                }
            });

            activeMatches = activeMatches.concat(newPresses);

            let f9 = activeMatches.find(m => m.id === 'F9');
            let b9 = activeMatches.find(m => m.id === 'B9');
            let t18 = activeMatches.find(m => m.id === '18');

            holeLog[hNum] = {
                holeWinner: holeWinner,
                f9Match: f9 ? f9.status : 0, f9Closed: f9 ? f9.closed : false, f9Res: f9 ? f9.finalResult : "",
                b9Match: b9 ? b9.status : 0, b9Closed: b9 ? b9.closed : false, b9Res: b9 ? b9.finalResult : "",
                totMatch: t18 ? t18.status : 0, totClosed: t18 ? t18.closed : false, totRes: t18 ? t18.finalResult : ""
            };
        }
    });

    let t1TotalMoney = 0;
    // Each segment settles at ITS stake. Base matches and auto presses never store
    // one, so segStake is the original wager for them - byte-for-byte the old
    // behaviour. Only a manual press that explicitly carried an amount differs.
    const segStake = m => (m.stake === undefined || m.stake === null) ? stake : m.stake;
    if (gameFormat === 'nassau') {
        activeMatches.forEach(m => {
            if (m.status > 0) t1TotalMoney += segStake(m);
            else if (m.status < 0) t1TotalMoney -= segStake(m);
        });
    } else {
        activeMatches.forEach(m => {
            if (holeBet > 0) {
                t1TotalMoney += m.status * holeBet;
            } else {
                if (m.status > 0) t1TotalMoney += segStake(m);
                else if (m.status < 0) t1TotalMoney -= segStake(m);
            }
        });
    }

    return { t1Name, t2Name, t1Players, t2Players, activeMatches, maxThru, holeLog, t1TotalMoney, pressCount,

             usesRelativeHandicap: useRelativeHcp, matchBaseline, relHcpById };
}
