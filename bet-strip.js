// ============================================================================
// GolfApp — Bet Strip Model
//
// Builds the compact "MAIN | P1 | P2 | P3" status strip that sits next to score
// entry on the scorecard, plus the press button's eligibility and start hole.
//
// This file contains NO betting mathematics of its own. It is a pure presenter:
// it calls the already-tested engines in money-engine.js (calculateMatchEngine,
// calculateStrokePressSet) and turns their output into short, phone-sized
// strings. If a number here is ever wrong, the bug is in money-engine.js, not
// in this file — that separation is deliberate and must be preserved.
//
// Loaded by index.html via <script src="bet-strip.js"></script>, after
// money-engine.js. Plain global functions, no module system, matching the rest
// of the codebase.
// ============================================================================

// The highest hole number on which every relevant player already has a score.
//
// This is the single most important function in this file. The press start hole
// MUST be derived from the highest hole actually PLAYED, never from a count of
// completed holes: scores can legitimately be entered out of order (someone
// picks up and posts later), and a shotgun-start group's first hole may be 10.
// Counting completed holes and adding 1 produces a press that retroactively
// swallows holes the group already finished — real money on holes already known.
function lastPlayedHoleFor(playerGroups, courseData, savedScores) {
    let last = 0;
    (courseData || []).forEach(h => {
        const everyGroupHasAScore = playerGroups.every(group =>
            group.length > 0 && group.some(p => {
                const v = savedScores[`p${p.id}_h${h.hole}`];
                return v && v > 0;
            })
        );
        if (everyGroupHasAScore && h.hole > last) last = h.hole;
    });
    return last;
}

// The last hole of the round, whatever the round actually is (9, 18, back nine only).
function finalHoleOf(courseData) {
    let max = 0;
    (courseData || []).forEach(h => { if (h.hole > max) max = h.hole; });
    return max;
}

// Match Play / Nassau wording. Never used for Stroke Play.
function matchStatusWords(status, t1Name, t2Name, closed, finalResult) {
    if (closed && finalResult) return finalResult;
    if (status === 0) return 'ALL SQUARE';
    return `${status > 0 ? t1Name : t2Name} ${Math.abs(status)} UP`;
}

// Stroke Play wording. Never used for Match Play. Lower total wins, so a
// NEGATIVE difference means p1 is ahead.
function strokeStatusWords(p1Total, p2Total, holesCompleted, p1Name, p2Name) {
    if (holesCompleted === 0) return 'NOT STARTED';
    const diff = p1Total - p2Total;
    if (diff === 0) return 'TIED';
    return `${diff < 0 ? p1Name : p2Name} +${Math.abs(diff)}`;
}

function shortName(name) {
    return String(name || '').split(' ')[0];
}

// Which formats genuinely support pressing. Anything not listed here shows no
// strip and no press button — we never invent a press concept for a format that
// doesn't have one (Skins, Wolf, Dots, Stableford, Hi-Lo, plain Stroke Play).
const PRESSABLE_MATCH_FORMATS = ['match', 'nassau', 'bestball', 'scramble', 'ryder'];

function isPressableFormat(data) {
    const gameFormat = data.gameFormat || 'stroke';
    if (gameFormat === 'match' && data.matchScoringStyle === 'stroke') return true;
    return PRESSABLE_MATCH_FORMATS.includes(gameFormat);
}

// ---------------------------------------------------------------------------
// buildBetStrip
//
// scopedPlayers: the players in the current scorekeeper's group (or all players
// when nobody is group-locked). The strip deliberately shows only wagers that
// involve the golfer's own group — a golfer entering scores should not be shown
// fourteen unrelated bets from other foursomes. The full picture stays on the
// Bets / Live Action page.
// ---------------------------------------------------------------------------
function buildBetStrip(data, courseData, savedScores, scopedPlayers) {
    const empty = {
        eligible: false, mode: null, chips: [], canPress: false, nextPressHole: null,
        currentStake: 0, pressCount: 0, liveCount: 0, lockedCount: 0,
        t1Name: '', t2Name: '', sideBets: { total: 0, live: 0 }, reason: ''
    };

    const gameFormat = data.gameFormat || 'stroke';
    const holes = (courseData || []).slice().sort((a, b) => a.hole - b.hole);
    const scores = savedScores || {};
    const players = (scopedPlayers || data.players || []).filter(p => p.playingForMoney !== false);

    if (!isPressableFormat(data)) {
        return Object.assign({}, empty, { reason: `The ${gameFormat} format doesn't use presses.` });
    }
    if (holes.length === 0) {
        return Object.assign({}, empty, { reason: 'No course data yet.' });
    }

    const finalHole = finalHoleOf(holes);

    // ---------------- STROKE PLAY 1v1 ----------------
    if (gameFormat === 'match' && data.matchScoringStyle === 'stroke') {
        if (players.length !== 2) {
            return Object.assign({}, empty, { reason: 'Stroke Play 1v1 needs exactly 2 players.' });
        }
        const stake = data.matchStake || 0;
        if (stake <= 0) {
            return Object.assign({}, empty, { reason: 'No money on this round.' });
        }

        const scoringType = data.matchScoring || 'net';
        const presses = data.strokePresses ? Object.values(data.strokePresses) : [];
        const set = calculateStrokePressSet(players, holes, scores, scoringType, stake, presses);
        if (!set) return Object.assign({}, empty, { reason: 'Waiting for scores.' });

        const n1 = shortName(set.p1.name), n2 = shortName(set.p2.name);
        const chips = [];

        function strokeChip(key, short, calc, chipStake, startHole) {
            const live = !calc.roundComplete;
            const statusText = strokeStatusWords(calc.p1Total, calc.p2Total, calc.holesCompleted, n1, n2);
            const diff = calc.p1Total - calc.p2Total;
            let tone = 'even';
            if (calc.roundComplete) tone = 'final';
            else if (calc.holesCompleted === 0) tone = 'idle';
            else if (diff !== 0) tone = diff < 0 ? 'up' : 'down';

            let moneyLine, resultLine;
            if (calc.roundComplete) {
                const winner = calc.winner ? shortName(calc.winner === set.p1.id ? set.p1.name : set.p2.name) : null;
                resultLine = winner ? `${winner} won` : 'Tied — nobody pays';
                moneyLine = winner ? `+$${chipStake}` : '$0';
            } else {
                resultLine = statusText === 'NOT STARTED' ? 'Not started yet' : statusText.replace(/^(\S+) \+(\d+)$/, '$1 leads by $2');
                moneyLine = `$${chipStake} AT STAKE`;
            }

            chips.push({
                key, short, statusText, tone, closed: calc.roundComplete, stake: chipStake,
                detail: {
                    title: key === 'MAIN' ? 'Main Bet' : `Press ${short.replace('P', '')}`,
                    rangeText: `H${startHole}\u2013${finalHole}`,
                    startHole, stake: chipStake, live,
                    stateLabel: live ? '\uD83D\uDFE2 LIVE' : '\uD83D\uDD12 FINAL',
                    statusLine: resultLine,
                    moneyLine,
                    thruText: calc.holesCompleted > 0 ? `Thru ${calc.holesCompleted} of ${calc.totalHoles}` : ''
                }
            });
        }

        const firstHole = holes[0].hole;
        strokeChip('MAIN', 'MAIN', set.original, stake, firstHole);
        set.pressResults.forEach(pr => strokeChip(`P${pr.pressNum}`, `P${pr.pressNum}`, pr, pr.stake, pr.startHole));

        const lastPlayed = lastPlayedHoleFor([[players[0]], [players[1]]], holes, scores);
        const nextPressHole = lastPlayed + 1;
        const alreadyPressedHere = set.pressResults.some(pr => pr.startHole === nextPressHole);
        const canPress = !set.original.roundComplete && nextPressHole <= finalHole && !alreadyPressedHere;

        return {
            eligible: true, mode: 'stroke', t1Name: n1, t2Name: n2, chips,
            canPress, nextPressHole: canPress ? nextPressHole : null,
            currentStake: stake,
            pressCount: set.pressResults.length,
            liveCount: chips.filter(c => !c.closed).length,
            lockedCount: chips.filter(c => c.closed).length,
            sideBets: countSideBets(data, players),
            reason: ''
        };
    }

    // ---------------- MATCH PLAY / NASSAU / TEAM FORMATS ----------------
    const scoringType = data.nassauScoring || data.matchScoring || 'net';
    const pressRule = gameFormat === 'nassau' ? (data.nassauPressRule || 'none') : (data.matchPressRule || 'none');
    const stake = gameFormat === 'nassau' ? (data.nassauStake || 0) : (data.matchStake || 0);
    const holeBet = data.holeBetStake || 0;

    if (stake <= 0 && holeBet <= 0) {
        return Object.assign({}, empty, { reason: 'No money on this round.' });
    }

    const teamPlayers = players.map(p => Object.assign({}, p, { team: p.team || 'Team 1' }));
    const distinctTeams = {};
    teamPlayers.forEach(p => { distinctTeams[p.team] = true; });
    if (Object.keys(distinctTeams).length < 2) {
        return Object.assign({}, empty, { reason: 'Needs two sides to make a match.' });
    }

    const manualPresses = data.matchPresses ? Object.values(data.matchPresses) : [];
    const calc = calculateMatchEngine(teamPlayers, holes, scores, scoringType, gameFormat, pressRule, stake, holeBet, manualPresses);
    if (!calc || !calc.activeMatches || calc.activeMatches.length === 0) {
        return Object.assign({}, empty, { reason: 'Waiting for scores.' });
    }

    const chips = [];
    const bases = calc.activeMatches.filter(m => m.pressNum === 0);
    const presses = calc.activeMatches.filter(m => m.pressNum > 0).slice().sort((a, b) => a.startHole - b.startHole);

    function matchChip(m, short, titleText) {
        const statusText = matchStatusWords(m.status, calc.t1Name, calc.t2Name, m.closed, m.finalResult);
        let tone = 'even';
        if (m.closed) tone = 'final';
        else if (m.status > 0) tone = 'up';
        else if (m.status < 0) tone = 'down';

        const chipStake = holeBet > 0 ? Math.abs(m.status * holeBet) : stake;
        let moneyLine, stateLabel;
        if (m.closed) {
            stateLabel = '\uD83D\uDD12 FINAL';
            moneyLine = m.status === 0 ? '$0' : `+$${chipStake}`;
        } else {
            stateLabel = '\uD83D\uDFE2 LIVE';
            moneyLine = holeBet > 0 ? `$${holeBet}/hole \u2014 $${chipStake} AT STAKE` : `$${stake} AT STAKE`;
        }

        chips.push({
            key: m.id, short, statusText, tone, closed: m.closed, stake: chipStake,
            detail: {
                title: titleText,
                rangeText: `H${m.startHole}\u2013${m.endHole}`,
                startHole: m.startHole, stake: chipStake, live: !m.closed,
                stateLabel,
                statusLine: m.closed && m.finalResult ? m.finalResult : statusText,
                moneyLine,
                thruText: calc.maxThru > 0 ? `Thru ${calc.maxThru}` : ''
            }
        });
    }

    // A plain match has exactly one base segment, so it reads as MAIN. Nassau has
    // three, and collapsing them into one "MAIN" would hide two real wagers — so
    // each gets its own short label (F9 / B9 / TOT).
    if (bases.length === 1) {
        matchChip(bases[0], 'MAIN', bases[0].label || 'Main Match');
    } else {
        bases.forEach(m => {
            const short = m.id === 'F9' ? 'F9' : (m.id === 'B9' ? 'B9' : 'TOT');
            matchChip(m, short, m.label || short);
        });
    }
    presses.forEach((m, i) => matchChip(m, `P${i + 1}`, m.label || `Press ${i + 1}`));

    // A press is only possible while at least one base segment is still open and
    // there's a hole left to press onto.
    const t1Group = teamPlayers.filter(p => p.team === Object.keys(distinctTeams)[0]);
    const t2Group = teamPlayers.filter(p => p.team !== Object.keys(distinctTeams)[0]);
    const lastPlayed = lastPlayedHoleFor([t1Group, t2Group], holes, scores);
    const nextPressHole = lastPlayed + 1;

    const pressableBase = bases.find(m => !m.closed && nextPressHole > m.startHole && nextPressHole <= m.endHole);
    const alreadyPressedHere = presses.some(m => m.startHole === nextPressHole);
    const canPress = !!pressableBase && !alreadyPressedHere && nextPressHole <= finalHole;

    return {
        eligible: true, mode: 'match', t1Name: calc.t1Name, t2Name: calc.t2Name, chips,
        canPress, nextPressHole: canPress ? nextPressHole : null,
        pressBaseId: pressableBase ? pressableBase.baseId : null,
        currentStake: holeBet > 0 ? holeBet : stake,
        stakeIsPerHole: holeBet > 0,
        pressCount: presses.length,
        liveCount: chips.filter(c => !c.closed).length,
        lockedCount: chips.filter(c => c.closed).length,
        sideBets: countSideBets(data, players),
        reason: ''
    };
}

// Side matches get one compact "SIDE BETS · N LIVE" indicator, never a full
// breakdown next to score entry — the Matches tab already does that properly.
function countSideBets(data, scopedPlayers) {
    const sideMatches = data.sideMatches || {};
    const scopedIds = (scopedPlayers || []).map(p => String(p.id));
    let total = 0;
    Object.values(sideMatches).forEach(sm => {
        const ids = (sm.teamAIds || []).concat(sm.teamBIds || []).map(String);
        if (ids.some(id => scopedIds.includes(id))) total++;
    });
    return { total, live: total };
}
