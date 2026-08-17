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

// ============================================================================
// TODAY'S ACTION — the scorecard command center
//
// One compact row per live wager, so a golfer standing over a putt can answer
// "who's winning and what's it worth" without leaving score entry. Like the rest
// of this file it is a PRESENTER: every number comes from an existing engine, and
// nothing here computes money.
//
// It deliberately reports STATUS, not settled dollars, for in-progress games.
// A round in progress has money AT STAKE, not money won - the Results page is the
// only place that talks in final dollars.
// ============================================================================

// Rows for the main game and every additional game stacked on top of it.
function buildActionRows(data, courseData, savedScores, scopedPlayers) {
    const rows = [];
    if (typeof getRoundGames !== 'function') return rows;

    const holes = (courseData || []).slice().sort((a, b) => a.hole - b.hole);
    const scores = savedScores || {};
    // A round-level wager involves the whole money field, not the group on screen.
    // Pricing skins over the visible four in a 12-player round produced both a wrong
    // pot and a wrong winner, and made this row disagree with the hole recap.
    const players = (typeof fieldParticipants === 'function')
        ? fieldParticipants(data)
        : (scopedPlayers && scopedPlayers.length > 0 ? scopedPlayers : (data.players || []))
        .filter(p => p.playingForMoney !== false);

    getRoundGames(data).forEach(game => {
        // A game added mid-round shows its range, so nobody has to remember when it
        // started. A game covering the whole round shows nothing - "H1-18" on every
        // ordinary wager is noise.
        const rangeText = (typeof gameRangeText === 'function') ? gameRangeText(game, holes) : '';
        const row = {
            key: game.key,
            label: game.label,
            icon: game.icon || '',
            role: game.role,
            stake: game.stake,
            rangeText: rangeText,
            stakeText: game.stake > 0 ? `$${game.stake}` : '',
            status: '',
            tone: 'even'
        };
        try {
            // Each game sees only its own holes.
            const gameCourse = (typeof gameHoles === 'function') ? gameHoles(game, holes) : holes;
            const st = gameStatusLine(game, gameCourse, scores, players);
            row.status = st.text;
            row.tone = st.tone;
        } catch (e) {
            // A status line must never be able to take down score entry.
            console.error('Action row failed for ' + game.format, e);
            row.status = '';
        }
        if (row.status) rows.push(row);
    });

    // Extras: wagers that run alongside every format rather than being a format.
    // Birdie previously appeared ONLY in the standings panel, bolted onto Current Group
    // Scores, which is both the wrong home for a wager and the reason that panel could
    // not just be removed. It belongs with the rest of the action.
    // Uses the CANONICAL birdie calculation from settlement-engine.js, not index.html's
    // page-local copy - a shared presenter should not depend on a function that only
    // exists on one page.
    if (data.birdieGameEnabled === true && typeof calculateBirdieGameTotalsForSettle === 'function') {
        try {
            const totals = calculateBirdieGameTotalsForSettle(data, holes, scores);
            const leader = topBy(players, p => totals[p.id] || 0);
            const unit = data.birdieUnitVal || 0;
            rows.push({
                key: 'birdie',
                label: 'Birdie Game',
                icon: '\uD83D\uDC26',
                role: 'extra',
                stake: unit,
                rangeText: '',
                stakeText: unit > 0 ? `$${unit}` : '',
                // Mid-round this is a position, not winnings - the wording stays "up",
                // never a settled dollar total.
                status: (leader && leader.value > 0)
                    ? `${shortName(leader.player.name)} up $${leader.value.toFixed(0)}`
                    : 'No birdies yet',
                tone: (leader && leader.value > 0) ? 'up' : 'idle'
            });
        } catch (e) {
            console.error('Birdie row failed:', e);
        }
    }

    return rows;
}

// One short, human status per format. Golf language only — Stroke Play never says
// "UP", Match Play never says "+3".
function gameStatusLine(game, holes, scores, players) {
    const cfg = game.config;
    const format = game.format;

    if (format === 'skins') {
        return skinsStatus(cfg, holes, scores, players);
    }

    if (format === 'dots') {
        const calc = calcDotsEngine(cfg, holes, scores);
        const leader = topBy(players, p => calc.totals[p.id] || 0);
        if (!leader || leader.value === 0) return { text: 'No dots yet', tone: 'idle' };
        return { text: `${shortName(leader.player.name)} ${leader.value} dot${leader.value === 1 ? '' : 's'}`, tone: 'up' };
    }

    if (format === 'stableford') {
        const calc = calcStablefordEngine(cfg, holes, scores);
        const leader = topBy(players, p => calc.totals[p.id] || 0);
        if (!leader || leader.value === 0) return { text: 'No points yet', tone: 'idle' };
        return { text: `${shortName(leader.player.name)} ${leader.value} pts`, tone: 'up' };
    }

    // The main game reuses the strip that already understands matches, Nassau and
    // Stroke Play 1v1, so those wordings can never drift apart.
    const strip = buildBetStrip(cfg, holes, scores, players);
    if (strip.eligible && strip.chips.length > 0) {
        const live = strip.chips.find(c => !c.closed) || strip.chips[0];
        const extra = strip.pressCount > 0 ? ` \u00B7 ${strip.pressCount}P` : '';
        return { text: live.statusText + extra, tone: live.tone };
    }

    if (format === 'wolf' || format === 'hilo' || format === 'stroke') {
        return { text: 'In progress', tone: 'idle' };
    }
    return { text: '', tone: 'idle' };
}

// Skins reads in skins language: who has how many, and how many are riding.
// The one walk through the holes that decides skins. Both the status line and the
// end-of-hole recap read this, so a golfer can never be told one thing by the row
// and another by the recap.
//
// Returns structured state, not text: who holds how many, what is riding, which hole
// each skin was decided on, and what a skin is worth. Nothing is stored - it is
// rebuilt from raw scores every time, so a correction simply produces a new answer.
function skinsState(cfg, holes, scores, players) {
    const scoringKey = (cfg.skinsScoring === 'net') ? 'net' : 'gross';
    const carryOver = cfg.skinsCarryOver !== false;
    const won = {};
    const awards = [];      // { hole, playerId, units }
    let carry = 1, lastDecidedHole = null;

    holes.forEach(h => {
        const entries = players.map(p => {
            const raw = scores[`p${p.id}_h${h.hole}`];
            if (!raw || raw <= 0) return null;
            const strokes = getStrokes(parseHcp(p.handicap), h.hcp, players.length);
            return { p, gross: raw, net: raw - strokes };
        }).filter(Boolean);
        // A skin cannot be decided until everyone who is in it has posted.
        if (entries.length === 0 || entries.length < players.length) return;

        const min = Math.min(...entries.map(e => e[scoringKey]));
        const winners = entries.filter(e => e[scoringKey] === min);
        if (winners.length === 1) {
            const units = carryOver ? carry : 1;
            won[winners[0].p.id] = (won[winners[0].p.id] || 0) + units;
            awards.push({ hole: h.hole, playerId: winners[0].p.id, units });
            carry = 1;
            lastDecidedHole = h.hole;
        } else if (carryOver) {
            carry += 1;
        }
    });

    // What one skin is worth. Under carry-over the pot is spread across the wager's
    // own hole range, which is what makes "3 riding = $60" an honest number rather
    // than a guess. Mirrors computeSkinsSettlementNet's own arithmetic.
    const buyIn = cfg.skinsBuyIn !== undefined ? cfg.skinsBuyIn : 0;
    const pot = buyIn * players.length;
    const skinValue = carryOver
        ? (holes.length > 0 ? pot / holes.length : 0)
        : (awards.length > 0 ? pot / awards.length : 0);

    return {
        won, awards, carryOver, lastDecidedHole,
        riding: carryOver && carry > 1 ? carry - 1 : 0,
        skinValue
    };
}

function skinsStatus(cfg, holes, scores, players) {
    const st = skinsState(cfg, holes, scores, players);
    const holders = players
        .filter(p => st.won[p.id] > 0)
        .sort((a, b) => st.won[b.id] - st.won[a.id])
        .map(p => `${shortName(p.name)} ${st.won[p.id]}`);

    // "3 riding" tells a golfer nothing. "3 riding \u00B7 $60" changes how the next
    // hole gets played, and the value is real - it comes from the same pot arithmetic
    // settlement uses.
    let riding = '';
    if (st.riding > 0) {
        const val = st.riding * st.skinValue;
        riding = val > 0 ? `${st.riding} riding \u00B7 $${val.toFixed(0)}` : `${st.riding} riding`;
    }

    if (holders.length === 0) {
        return { text: riding ? `All square \u00B7 ${riding}` : 'No skins yet', tone: riding ? 'even' : 'idle' };
    }
    const text = holders.slice(0, 2).join(' \u00B7 ') + (riding ? ` \u00B7 ${riding}` : '');
    return { text, tone: 'up' };
}

function topBy(players, valueFn) {
    let best = null;
    players.forEach(p => {
        const v = valueFn(p);
        if (!best || v > best.value) best = { player: p, value: v };
    });
    return best;
}

// Compact per-golfer view of the side action in this group. Status only — the
// Matches tab remains the place to create or change a side match.
function buildSideActionRows(data, courseData, savedScores, scopedPlayers, meId) {
    const rows = [];
    const sideMatches = data.sideMatches || {};
    const scopedIds = (scopedPlayers || []).map(p => String(p.id));
    const allPlayers = data.players || [];
    const mePlayer = meId ? allPlayers.find(p => String(p.id) === String(meId)) : null;
    const meName = mePlayer ? shortName(mePlayer.name) : null;

    // "You" wherever the golfer appears, so the match row speaks the same way the
    // end-of-hole recap already does. Previously the recap said "You win 3 skins" while
    // the row directly beneath it said "Marty vs John".
    const nameOf = id => {
        const p = allPlayers.find(pl => String(pl.id) === String(id));
        if (!p) return '';
        return (meId && String(p.id) === String(meId)) ? 'You' : shortName(p.name);
    };

    Object.keys(sideMatches).forEach(id => {
        const sm = sideMatches[id];
        const a = (sm.teamAIds || []).map(String);
        const b = (sm.teamBIds || []).map(String);
        // Only side action involving this group - a golfer entering scores should not be
        // shown other foursomes' bets.
        if (!a.concat(b).some(pid => scopedIds.includes(pid))) return;

        const stake = sm.format === 'stroke'
            ? (sm.overallStake || sm.holeStake || 0)
            : (sm.stake || 0);

        const teamA = a.map(pid => allPlayers.find(p => String(p.id) === String(pid))).filter(Boolean);
        const teamB = b.map(pid => allPlayers.find(p => String(p.id) === String(pid))).filter(Boolean);
        const matchPlayers = teamA.concat(teamB);
        const isTeam = teamA.length > 1 || teamB.length > 1;

        // "vs John" when it's Marty's own match; the full pairing otherwise.
        const sideAName = a.map(nameOf).join(' / ');
        const sideBName = b.map(nameOf).join(' / ');
        const iAmInA = meId && a.includes(String(meId));
        const iAmInB = meId && b.includes(String(meId));
        let label;
        if (!isTeam && iAmInA) label = `vs ${sideBName}`;
        else if (!isTeam && iAmInB) label = `vs ${sideAName}`;
        else label = `${sideAName} vs ${sideBName}`;

        const progress = matchProgress(matchPlayers, courseData, savedScores);

        let status = '', sentence = '', tone = 'idle', presses = [];
        let decided = 0, atStake = 0;

        if (sm.format === 'stroke') {
            // ONE path for 1v1 and 2v2. calculateOverallBetEngine takes a side of one or
            // many, and unlike buildBetStrip it reports money per segment - which is what
            // a net position needs. Same engine settlement uses; best ball for a team.
            const calc = teamStrokeStatus(sm, teamA, teamB, courseData, savedScores);
            if (calc) {
                const meSide = iAmInB ? -1 : 1;
                const st = segToStatus(calc.base, sideAName, sideBName);
                status = st.text;
                tone = iAmInB ? flipTone(st.tone) : st.tone;
                sentence = strokeSentence(status, iAmInA ? sideAName : (iAmInB ? sideBName : null));

                const tally = seg => {
                    if (seg.roundComplete) decided += seg.p1Money * meSide;
                    // AT STAKE is not WON. A stroke wager decides nothing until its last
                    // hole, so an undecided segment contributes its stake to the amount
                    // riding - never to a money position.
                    else atStake += seg.stake || 0;
                };
                tally(calc.base);

                presses = (calc.pressSegs || []).map((seg, i) => {
                    tally(seg);
                    const ps = segToStatus(seg, sideAName, sideBName);
                    return {
                        label: `Press #${i + 1}`,
                        startedText: `Started Hole ${seg.startHole}`,
                        status: ps.text,
                        sentence: strokeSentence(ps.text, iAmInA ? sideAName : (iAmInB ? sideBName : null)),
                        tone: iAmInB ? flipTone(ps.tone) : ps.tone,
                        stakeText: seg.stake > 0 ? `$${seg.stake}` : '',
                        live: !seg.roundComplete
                    };
                });
            }
        } else {
            const cfg = sideMatchRoundConfig(sm, matchPlayers);
            if (cfg) {
                try {
                    const strip = buildBetStrip(cfg, courseData, savedScores, cfg.players);
                    if (strip && strip.eligible && strip.chips.length > 0) {
                        const live = strip.chips.find(c => !c.closed) || strip.chips[0];
                        status = live.statusText;
                        tone = live.tone;
                        const speak = strip.mode === 'stroke' ? strokeSentence : matchSentence;
                        sentence = speak(status, meName);
                        strip.chips.forEach(c => {
                            if (c.closed) decided += 0; else atStake += c.stake || 0;
                        });
                        presses = strip.chips.filter(c => c.short && c.short.charAt(0) === 'P').map((c, i) => ({
                            label: `Press #${i + 1}`,
                            startedText: c.detail && c.detail.startHole ? `Started Hole ${c.detail.startHole}` : '',
                            status: c.statusText,
                            sentence: speak(c.statusText, meName),
                            tone: c.tone,
                            stakeText: c.stake > 0 ? `$${c.stake}` : '',
                            live: c.detail ? c.detail.live : !c.closed
                        }));
                    }
                } catch (e) {
                    console.error('Side match status failed:', e);
                }
            }
        }

        // Press eligibility. Start hole comes from the last hole EVERY participant has
        // finished, so a cross-group press can never swallow a hole someone hasn't played.
        let canPress = false, nextPressHole = null;
        if (sm.format === 'stroke') {
            const holes = (courseData || []).slice().sort((x, y) => x.hole - y.hole);
            const finalHole = holes.length ? holes[holes.length - 1].hole : 0;
            const next = progress.thru + 1;
            const existing = sm.overallPresses ? Object.values(sm.overallPresses) : [];
            canPress = next <= finalHole && !existing.some(pr => pr.startHole === next);
            nextPressHole = canPress ? next : null;
        }

        rows.push({
            key: id,
            playerIds: a.concat(b),
            label, isTeam, mine: !!(iAmInA || iAmInB),
            format: sm.format === 'stroke' ? 'Stroke Play' : (sm.format === 'nassau' ? 'Nassau' : 'Match Play'),
            status, sentence, tone, presses,
            // Money DECIDED so far, from this golfer's point of view, and the amount
            // still riding. Kept separate so a headline can never call an unfinished
            // wager won.
            netMoney: decided, atStake,
            netText: decided > 0 ? `You're up $${Math.abs(decided)}`
                : (decided < 0 ? `You're down $${Math.abs(decided)}`
                : (atStake > 0 ? `$${atStake} at stake` : '')),
            thru: progress.thru,
            thruText: progress.thru > 0 ? `Through Hole ${progress.thru}` : 'Not started',
            waitingOn: progress.waitingOn,
            canPress, nextPressHole, pressStake: stake,
            stakeText: stake > 0 ? `$${stake}` : ''
        });
    });

    return rows;
}

// ============================================================================
// MARTY MODE — full sentences instead of developer shorthand
//
// Every figure below already existed. What was missing was the sentence: the app
// computed "Marty +4" and left the golfer to work out that + means ahead, that the
// unit is strokes, and that "H6-18" describes a press start hole.
// ============================================================================

// "You lead by 4 strokes" / "John leads by 2 strokes" / "Tied".
// Reads the same status strings the engines already produce, so a wording change in
// an engine can never silently desync this.
function strokeSentence(statusText, meName) {
    if (!statusText) return '';
    if (/^TIED$/i.test(statusText)) return 'Tied';
    if (/NOT STARTED/i.test(statusText)) return 'Not started';
    const m = /^(\S+(?:\s*\/\s*\S+)?)\s+\+(\d+)$/.exec(statusText);
    if (!m) return statusText;
    const who = m[1], by = parseInt(m[2], 10);
    const unit = by === 1 ? 'stroke' : 'strokes';
    if (meName && who === meName) return `You lead by ${by} ${unit}`;
    if (/\//.test(who)) return `${who} lead by ${by} ${unit}`;
    return `${who} leads by ${by} ${unit}`;
}

// "You are 2 up" / "John is 3 up" / "All square". Match Play only.
function matchSentence(statusText, meName) {
    if (!statusText) return '';
    if (/ALL SQUARE/i.test(statusText)) return 'All square';
    const m = /^(\S+(?:\s*\/\s*\S+)?)\s+(\d+)\s+UP$/i.exec(statusText);
    if (!m) return statusText;
    const who = m[1], by = parseInt(m[2], 10);
    if (meName && who === meName) return `You are ${by} up`;
    if (/\//.test(who)) return `${who} are ${by} up`;
    return `${who} is ${by} up`;
}

// The last hole EVERY participant in this match has finished, and whether anyone is
// still out. This number was already being computed for press eligibility and then
// discarded - surfacing it is what makes a cross-group match honest.
function matchProgress(matchPlayers, courseData, savedScores) {
    const holes = (courseData || []).slice().sort((a, b) => a.hole - b.hole);
    const scores = savedScores || {};
    const posted = p => {
        let last = 0;
        holes.forEach(h => { const v = scores[`p${p.id}_h${h.hole}`]; if (v && v > 0) last = h.hole; });
        return last;
    };
    const each = matchPlayers.map(p => ({ p, thru: posted(p) }));
    const thru = each.reduce((m, x) => Math.min(m, x.thru), Infinity);
    const behind = each.filter(x => x.thru < Math.max.apply(null, each.map(y => y.thru)));
    return {
        thru: thru === Infinity ? 0 : thru,
        // Named so the golfer knows WHO to wait on, not just that something is pending.
        waitingOn: behind.length > 0 ? behind.map(x => shortName(x.p.name)).join(', ') : null
    };
}

// 2v2 stroke status, via the SAME engine settlement uses. No new math: the team hole
// score is best ball, exactly as calculateOverallBetEngine computes it.
function teamStrokeStatus(sm, teamA, teamB, courseData, savedScores) {
    if (typeof calculateOverallBetEngine !== 'function') return null;
    const cfg = {
        overallEnabled: true,
        overallStake: sm.overallStake || sm.holeStake || 0,
        overallMode: 'stroke',
        scoringType: sm.scoring || 'net',
        sideA: teamA, sideB: teamB
    };
    const presses = sm.overallPresses ? Object.values(sm.overallPresses) : [];
    try {
        return calculateOverallBetEngine([teamA[0], teamB[0]], courseData, savedScores, cfg, presses);
    } catch (e) {
        console.error('2v2 status failed:', e);
        return null;
    }
}

function segToStatus(seg, nameA, nameB) {
    if (!seg || seg.holesCompleted === 0) return { text: 'NOT STARTED', tone: 'idle' };
    const diff = seg.p1Total - seg.p2Total;
    if (diff === 0) return { text: 'TIED', tone: 'even' };
    const who = diff < 0 ? nameA : nameB;
    return { text: `${who} +${Math.abs(diff)}`, tone: diff < 0 ? 'up' : 'down' };
}

// ---------------------------------------------------------------------------
const ACTION_RANK = {
    JUST_CHANGED: 0,
    CLOSE_TO_DONE: 1,
    BIG_CARRY: 2,
    LIVE: 3,
    IDLE: 4
};

// Maps a stored Side Match onto the round shape buildBetStrip already understands,
// rather than teaching the presenter a second data format. Shared by the scorecard
// rows and the end-of-hole recap so the two can never describe a match differently.
function sideMatchRoundConfig(sm, matchPlayers) {
    if (!sm || !matchPlayers || matchPlayers.length < 2) return null;
    const teamA = (sm.teamAIds || []).map(String);
    const tagged = matchPlayers.map(p => Object.assign({}, p, {
        team: teamA.includes(String(p.id)) ? 'Team 1' : 'Team 2'
    }));

    if (sm.format === 'stroke') {
        if (tagged.length !== 2) return null;
        return {
            gameFormat: 'match',
            matchScoringStyle: 'stroke',
            matchScoring: sm.scoring || 'gross',
            matchStake: sm.overallStake || sm.holeStake || 0,
            // Side match presses are stored as overallPresses and carry no per-press
            // stake, so each inherits the original amount - the existing behaviour.
            strokePresses: (sm.overallPresses ? Object.values(sm.overallPresses) : []).map(pr => ({
                startHole: pr.startHole,
                stake: pr.stake !== undefined ? pr.stake : (sm.overallStake || 0)
            })),
            players: tagged
        };
    }

    return {
        gameFormat: sm.format === 'nassau' ? 'nassau' : 'match',
        matchScoring: sm.scoring || 'gross',
        nassauScoring: sm.scoring || 'gross',
        matchStake: sm.stake || 0,
        nassauStake: sm.stake || 0,
        matchPressRule: sm.pressRule || 'none',
        nassauPressRule: sm.pressRule || 'none',
        matchPresses: sm.presses ? Object.values(sm.presses) : [],
        players: tagged
    };
}

// Wagers inside the main game that have already been decided — a Nassau front nine
// that closed 4&2, a press that ran out of holes. They are reported separately so
// Today's Action can acknowledge them once and then stop giving them space, without
// hiding them from a golfer who wants to check.
//
// Status only. Nothing here settles money; the closed chips come from the same
// engine that produced the live ones.
function buildSettledRows(data, courseData, savedScores, scopedPlayers) {
    const rows = [];
    if (typeof getRoundGames !== 'function') return rows;

    const holes = (courseData || []).slice().sort((a, b) => a.hole - b.hole);
    const scores = savedScores || {};
    // A round-level wager involves the whole money field, not the group on screen.
    // Pricing skins over the visible four in a 12-player round produced both a wrong
    // pot and a wrong winner, and made this row disagree with the hole recap.
    const players = (typeof fieldParticipants === 'function')
        ? fieldParticipants(data)
        : (scopedPlayers && scopedPlayers.length > 0 ? scopedPlayers : (data.players || []))
        .filter(p => p.playingForMoney !== false);

    getRoundGames(data).forEach(game => {
        if (game.role !== 'main') return;
        let strip;
        try {
            const gameCourse = (typeof gameHoles === 'function') ? gameHoles(game, holes) : holes;
            strip = buildBetStrip(game.config, gameCourse, scores, players);
        } catch (e) {
            return;
        }
        if (!strip || !strip.eligible) return;
        strip.chips.filter(c => c.closed).forEach(c => {
            rows.push({
                key: game.key + ':' + c.key,
                label: c.detail && c.detail.title ? c.detail.title : c.short,
                icon: '',
                role: 'settled',
                stake: c.stake,
                rangeText: c.detail ? c.detail.rangeText : '',
                stakeText: c.stake > 0 ? `$${c.stake}` : '',
                status: c.statusText,
                tone: 'final'
            });
        });
    });

    return rows;
}

// "Close to done" only where it means something. A match 2 up with holes running out
// is genuinely on the brink; a stroke total with ten to play is not, and inventing
// closeness for it would be noise dressed as insight.
function isCloseToDone(row) {
    if (!row || !row.status) return false;
    const m = /^\S+(?:\/\S+)?\s+(\d+)\s+UP$/.exec(row.status);
    return !!m && parseInt(m[1], 10) >= 2;
}

function hasBigCarry(row) {
    const m = /(\d+)\s+riding/.exec((row && row.status) || '');
    return !!m && parseInt(m[1], 10) >= 3;
}

// changedKeys: row keys whose state moved on the hole just completed. Ephemeral,
// passed in per render - never stored, never written to Firebase.
function rankActionRow(row, changedKeys) {
    if (changedKeys && changedKeys[row.key]) return ACTION_RANK.JUST_CHANGED;
    if (isCloseToDone(row)) return ACTION_RANK.CLOSE_TO_DONE;
    if (hasBigCarry(row)) return ACTION_RANK.BIG_CARRY;
    if (row.tone === 'idle') return ACTION_RANK.IDLE;
    return ACTION_RANK.LIVE;
}

// Stable sort: equal ranks keep their original order, so the board never jitters
// while a golfer is reading it.
function sortActionRows(rows, changedKeys) {
    return (rows || [])
        .map((row, i) => ({ row, i, rank: rankActionRow(row, changedKeys) }))
        .sort((a, b) => (a.rank - b.rank) || (a.i - b.i))
        .map(x => x.row);
}

// The one extra clause on the collapsed bar. Fixed priority order, so it never
// cycles or becomes a moving headline:
//   1. how much of the action is yours   2. a big carry   3. nothing
//
// It never states a live money position. Mid-round a golfer's total mixes settled and
// unsettled wagers, so "+$23" would break AT STAKE is not WON. A count is honest.
function actionHeadline(rows, myCount) {
    if (myCount > 0) return `${myCount} yours`;
    const carry = (rows || []).find(r => hasBigCarry(r));
    if (carry) return `${/(\d+)\s+riding/.exec(carry.status)[1]} skins riding`;
    return '';
}


// A status is computed from side A's point of view. A golfer on side B is looking at
// the same match from the other end, so the colour has to flip with them.
function flipTone(tone) {
    if (tone === 'up') return 'down';
    if (tone === 'down') return 'up';
    return tone;
}
