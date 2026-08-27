// ============================================================================
// GolfApp — Shared Money Engine
// Used by settlement.html (per-round settlement) and trip.html (trip-wide
// money settlement). Keep this file as the ONLY place round-money math lives —
// both pages load it via <script src="money-engine.js"></script>.
// ============================================================================

function parseHcp(hcpStr) {
    if (!hcpStr) return 0;
    const str = String(hcpStr).trim();
    if (str.startsWith("+")) return -Math.abs(parseFloat(str.substring(1)));
    return parseFloat(str) || 0;
}

function getStrokes(hcpIndex, numericHcp) {
    if (numericHcp >= 0) {
        let strokes = Math.floor(numericHcp / 18);
        if (hcpIndex <= (numericHcp % 18)) strokes += 1;
        return strokes;
    } else {
        const plusVal = Math.abs(numericHcp);
        if (hcpIndex > (18 - plusVal)) return -1;
        return 0;
    }
}

// --- WOLF GAME ENGINE (mirrors index.html) ---
function calcWolfEngine(data, courseData, savedScores) {
    const players = data.players || [];
    const result = { totals: {}, holeLog: {}, carryPending: 0 };
    players.forEach(p => result.totals[p.id] = 0);
    if (players.length !== 4) return result;

    const loneMult = parseFloat(data.wolfLoneMult) || 2;
    const blindMult = parseFloat(data.wolfBlindMult) || 4;
    const tieRule = data.wolfTieRule || 'carry';
    const lastPlaceRule = data.wolfLastPlaceRule === 'on';
    const calls = data.wolfCalls || {};

    let carry = 0;
    const sortedHoles = (courseData || []).slice().sort((a, b) => a.hole - b.hole);

    sortedHoles.forEach(h => {
        const hole = h.hole;
        let wolfPlayer;
        if (lastPlaceRule && (hole === 17 || hole === 18)) {
            let sorted = players.slice().sort((a, b) => (result.totals[a.id] || 0) - (result.totals[b.id] || 0));
            wolfPlayer = sorted[0];
        } else {
            wolfPlayer = players[(hole - 1) % 4];
        }

        const callData = calls[`h${hole}`];
        const allScored = players.every(p => savedScores[`p${p.id}_h${hole}`]);

        let log = { hole, wolfId: wolfPlayer.id, wolfName: wolfPlayer.name, call: callData ? callData.call : null, partnerId: callData ? callData.partnerId : null, resolved: false, winner: null, pts: {} };

        if (!callData || !allScored) {
            result.holeLog[hole] = log;
            return;
        }

        let nets = {};
        players.forEach(p => {
            const gross = parseInt(savedScores[`p${p.id}_h${hole}`], 10);
            const strokes = getStrokes(h.hcpIndex, parseHcp(p.hcp));
            nets[p.id] = gross - strokes;
        });

        const others = players.filter(p => String(p.id) !== String(wolfPlayer.id));
        let winnerSide = null;
        let basePot = 0;

        if (callData.call === 'partner' && callData.partnerId) {
            const partner = others.find(p => String(p.id) === String(callData.partnerId));
            const rest = others.filter(p => String(p.id) !== String(callData.partnerId));
            if (partner && rest.length === 2) {
                basePot = 2;
                const teamScore = Math.min(nets[wolfPlayer.id], nets[partner.id]);
                const oppScore = Math.min(nets[rest[0].id], nets[rest[1].id]);
                if (teamScore < oppScore) {
                    winnerSide = 'wolf';
                    const pot = basePot + carry;
                    log.pts[wolfPlayer.id] = pot / 2;
                    log.pts[partner.id] = pot / 2;
                } else if (oppScore < teamScore) {
                    winnerSide = 'other';
                    const pot = basePot + carry;
                    log.pts[rest[0].id] = pot / 2;
                    log.pts[rest[1].id] = pot / 2;
                } else {
                    winnerSide = 'tie';
                }
            }
        } else if (callData.call === 'lone' || callData.call === 'blind') {
            const mult = callData.call === 'blind' ? blindMult : loneMult;
            basePot = mult;
            const wolfScore = nets[wolfPlayer.id];
            const bestOther = Math.min(...others.map(p => nets[p.id]));
            if (wolfScore < bestOther) {
                winnerSide = 'wolf';
                log.pts[wolfPlayer.id] = basePot + carry;
            } else if (bestOther < wolfScore) {
                winnerSide = 'other';
                basePot = 3;
                const pot = basePot + carry;
                others.forEach(p => log.pts[p.id] = pot / 3);
            } else {
                winnerSide = 'tie';
            }
        }

        if (winnerSide === 'tie') {
            log.winner = 'tie';
            if (tieRule === 'carry') carry += basePot;
        } else if (winnerSide) {
            log.winner = winnerSide;
            carry = 0;
            Object.keys(log.pts).forEach(pid => {
                result.totals[pid] = (result.totals[pid] || 0) + log.pts[pid];
            });
        }

        log.resolved = !!winnerSide;
        result.holeLog[hole] = log;
    });

    result.carryPending = carry;
    return result;
}

// --- STABLEFORD ENGINE (mirrors index.html) ---
function calcStablefordEngine(data, courseData, savedScores) {
    const players = data.players || [];
    const pts = data.stablefordPoints || { other: 0, bogey: 1, par: 2, birdie: 3, eagle: 5, albatross: 10 };
    const scoringType = data.stablefordScoring || 'net';
    let totals = {}, holeLog = {};
    players.forEach(p => totals[p.id] = 0);
    (courseData || []).forEach(h => {
        let log = {};
        players.forEach(p => {
            const v = savedScores[`p${p.id}_h${h.hole}`];
            if (!v) return;
            const gross = parseInt(v, 10);
            const strokes = getStrokes(h.hcpIndex, parseHcp(p.hcp));
            const scoreToUse = scoringType === 'gross' ? gross : (gross - strokes);
            const diff = scoreToUse - parseInt(h.par, 10);
            let awarded, label;
            if (diff <= -3) { awarded = pts.albatross; label = 'Alb'; }
            else if (diff === -2) { awarded = pts.eagle; label = 'Eagle'; }
            else if (diff === -1) { awarded = pts.birdie; label = 'Birdie'; }
            else if (diff === 0) { awarded = pts.par; label = 'Par'; }
            else if (diff === 1) { awarded = pts.bogey; label = 'Bogey'; }
            else { awarded = pts.other; label = 'Dbl+'; }
            totals[p.id] += awarded;
            log[p.id] = { pts: awarded, label };
        });
        holeLog[h.hole] = log;
    });
    return { totals, holeLog };
}

// --- DOT GAME ENGINE (mirrors index.html) ---
function calcDotsEngine(data, courseData, savedScores) {
    const players = data.players || [];
    let totals = {};
    players.forEach(p => totals[p.id] = 0);
    if (data.dots) {
        Object.values(data.dots).forEach(holeDots => {
            Object.keys(holeDots).forEach(pKey => {
                let pid = pKey.replace('p', '');
                if (totals[pid] !== undefined) {
                    holeDots[pKey].forEach(dotType => {
                        if (dotType === 'snake') totals[pid] -= 1;
                        else totals[pid] += 1;
                    });
                }
            });
        });
    }
    return { totals };
}

// Zero-sum $ settlement shared by Wolf and Stableford point totals
function calcPointSettlement(players, totals, dollarPerPoint) {
    let money = {};
    const n = players.length;
    if (n === 0) return money;
    let sumPts = 0;
    players.forEach(p => sumPts += (totals[p.id] || 0));
    players.forEach(p => {
        const myPts = totals[p.id] || 0;
        money[p.id] = dollarPerPoint * (n * myPts - sumPts);
    });
    return money;
}

// --- MATCH / NASSAU ENGINE (mirrors index.html) — team vs team, incl. presses ---
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

    let pressCount = 0;
    let maxThru = 0;
    let holeLog = {};

    courseData.forEach(hole => {
        let hNum = hole.hole;
        let t1Best = 999, t2Best = 999;
        let t1Valid = false, t2Valid = false;

        t1Players.forEach(p => {
            let v = savedScores[`p${p.id}_h${hNum}`];
            if (v && v > 0) {
                let s = parseInt(v, 10) - (scoringType === 'net' ? getStrokes(hole.hcpIndex, parseHcp(p.hcp)) : 0);
                if (s < t1Best) t1Best = s;
                t1Valid = true;
            }
        });

        t2Players.forEach(p => {
            let v = savedScores[`p${p.id}_h${hNum}`];
            if (v && v > 0) {
                let s = parseInt(v, 10) - (scoringType === 'net' ? getStrokes(hole.hcpIndex, parseHcp(p.hcp)) : 0);
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

    return { t1Name, t2Name, t1Players, t2Players, activeMatches, maxThru, holeLog, t1TotalMoney, pressCount };
}

// ============================================================================
// TRIP-MODE ENTRY POINT
// Dispatches to the right engine above and returns one consistent shape:
//   { valid, formatLabel, message, splitNote, players: [{ id, name, net }] }
// "net" is this round's main-format money result per player (positive = won).
// v1 scope: MAIN FORMAT bet only — Side Games, Side Matches, and one-off Side
// Bets are NOT included yet. Everyone still scores normally regardless.
// ============================================================================
// Mirrors Side Matches' stroke-play overall bet — total strokes for the round, low total
// wins the stake. Genuinely simpler than Match Play (no hole-by-hole win/loss, no presses),
// which is exactly the point: some 1v1s are "just play me for the round," not a match.
function calculateStrokeHeadToHead(players, courseData, savedScores, scoringType, stake) {
    if (players.length !== 2) return null;
    const p1 = players[0], p2 = players[1];
    let p1Total = 0, p2Total = 0, holesCompleted = 0;

    courseData.forEach(h => {
        const v1 = savedScores[`p${p1.id}_h${h.hole}`];
        const v2 = savedScores[`p${p2.id}_h${h.hole}`];
        if (v1 > 0 && v2 > 0) {
            const s1 = scoringType === 'net' ? (parseInt(v1, 10) - getStrokes(h.hcpIndex, parseHcp(p1.hcp))) : parseInt(v1, 10);
            const s2 = scoringType === 'net' ? (parseInt(v2, 10) - getStrokes(h.hcpIndex, parseHcp(p2.hcp))) : parseInt(v2, 10);
            p1Total += s1;
            p2Total += s2;
            holesCompleted++;
        }
    });

    const totalHoles = courseData.length;
    const roundComplete = holesCompleted === totalHoles && totalHoles > 0;
    let winner = null, t1TotalMoney = 0;
    if (roundComplete) {
        if (p1Total < p2Total) { winner = p1.id; t1TotalMoney = stake; }
        else if (p2Total < p1Total) { winner = p2.id; t1TotalMoney = -stake; }
    }

    return { p1, p2, p1Total, p2Total, holesCompleted, totalHoles, roundComplete, winner, t1TotalMoney };
}

// A Stroke Play press is a second (third, fourth...) independent Stroke Play wager that starts
// on a later hole and runs through the end of the round, coexisting with the original bet rather
// than replacing it. This is NOT a new scoring formula — it just calls calculateStrokeHeadToHead
// again with courseData filtered down to "hole >= startHole" and that press's own stake. Because
// each call is independently zero-sum and stateless (recomputed from raw savedScores every time),
// the combined result is automatically zero-sum too, and a score correction on any hole correctly
// ripples into exactly the wagers whose hole range includes that hole and no others.
function calculateStrokePressSet(players, courseData, savedScores, scoringType, originalStake, presses) {
    if (players.length !== 2) return null;
    const original = calculateStrokeHeadToHead(players, courseData, savedScores, scoringType, originalStake);
    if (!original) return null;

    const pressResults = (presses || [])
        .slice()
        .sort((a, b) => a.startHole - b.startHole)
        .map((pr, i) => {
            const pressCourseData = courseData.filter(h => h.hole >= pr.startHole);
            const calc = calculateStrokeHeadToHead(players, pressCourseData, savedScores, scoringType, pr.stake);
            return Object.assign({ pressNum: i + 1, startHole: pr.startHole, stake: pr.stake }, calc);
        });

    let combinedT1Money = original.t1TotalMoney;
    pressResults.forEach(pr => { combinedT1Money += pr.t1TotalMoney; });

    return { p1: original.p1, p2: original.p2, original, pressResults, combinedT1Money };
}

function computeRoundMoneyByPlayer(data, courseData, savedScores) {
    const players = data.players || [];
    const gameFormat = data.gameFormat || 'stroke';
    const moneyPlayers = players.filter(p => p.playingForMoney !== false);
    const holeBet = data.holeBetStake || 0;
    const result = { valid: false, formatLabel: gameFormat, message: '', splitNote: '', players: [] };

    if (moneyPlayers.length === 0) {
        result.message = 'No players opted in to money for this round.';
        return result;
    }

    if (gameFormat === 'wolf') {
        if (players.length !== 4) {
            result.message = 'Wolf requires exactly 4 players — skipped.';
            return result;
        }
        const wolfCalc = calcWolfEngine(data, courseData, savedScores);
        const wolfMoney = calcPointSettlement(moneyPlayers, wolfCalc.totals, data.wolfPointVal || 0);
        result.valid = true;
        result.formatLabel = 'Wolf';
        result.players = moneyPlayers.map(p => ({ id: p.id, name: p.name, net: wolfMoney[p.id] || 0 }));
        return result;
    }

    if (gameFormat === 'stableford') {
        const sfCalc = calcStablefordEngine(data, courseData, savedScores);
        const sfMoney = calcPointSettlement(moneyPlayers, sfCalc.totals, data.stablefordPointVal || 0);
        result.valid = true;
        result.formatLabel = 'Stableford';
        result.players = moneyPlayers.map(p => ({ id: p.id, name: p.name, net: sfMoney[p.id] || 0 }));
        return result;
    }

    if (gameFormat === 'dots') {
        // calcDotsEngine's raw per-player unit totals are left completely untouched — they
        // remain the correct source for live status ("Manny: 3 dots"). Only the dollar
        // conversion changes here: each dot unit (positive or negative, e.g. a Snake) is worth
        // its dollar value paid by EVERY OTHER player, matching how junk/garbage games are
        // actually played and how "$X per dot" reads to a golfer — not an isolated credit with
        // no corresponding payer. For player P: net = dotVal * (n * unitsP - totalUnitsAllPlayers).
        // This is provably zero-sum for any combination of units across any number of players.
        const dotsCalc = calcDotsEngine(data, courseData, savedScores);
        const dotVal = data.dotPointVal || 0;
        const n = moneyPlayers.length;
        const totalUnits = moneyPlayers.reduce((s, p) => s + (dotsCalc.totals[p.id] || 0), 0);
        result.valid = true;
        result.formatLabel = 'Dot Game';
        result.players = moneyPlayers.map(p => {
            const units = dotsCalc.totals[p.id] || 0;
            const net = n > 1 ? dotVal * (n * units - totalUnits) : 0;
            return { id: p.id, name: p.name, net };
        });
        return result;
    }

    if (gameFormat === 'stroke') {
        result.valid = true;
        result.formatLabel = 'Stroke Play';
        result.message = 'No main-format money bet for Stroke Play.';
        result.players = moneyPlayers.map(p => ({ id: p.id, name: p.name, net: 0 }));
        return result;
    }

    // A 1v1 set to Stroke Play scoring — total strokes, not hole-by-hole match play. Handled
    // separately from the match-play engine below since the two models aren't compatible
    // (no hole win/loss status, no presses, just a straight total comparison).
    if (gameFormat === 'match' && data.matchScoringStyle === 'stroke') {
        if (moneyPlayers.length !== 2) {
            result.message = 'Stroke Play 1v1 requires exactly 2 players.';
            return result;
        }
        const scoringType = data.matchScoring || 'net';
        const matchStake = data.matchStake || 0;
        const strokePresses = data.strokePresses ? Object.values(data.strokePresses) : [];
        const pressSet = calculateStrokePressSet(moneyPlayers, courseData, savedScores, scoringType, matchStake, strokePresses);
        if (!pressSet) {
            result.message = 'Waiting for players and scores.';
            return result;
        }
        result.valid = true;
        result.formatLabel = '1v1 (Stroke Play)';
        result.players = [
            { id: pressSet.p1.id, name: pressSet.p1.name, net: pressSet.combinedT1Money },
            { id: pressSet.p2.id, name: pressSet.p2.name, net: -pressSet.combinedT1Money }
        ];
        if (!pressSet.original.roundComplete) {
            result.message = `Waiting for both players to finish — thru ${pressSet.original.holesCompleted} of ${pressSet.original.totalHoles}.`;
        }
        return result;
    }

    if (gameFormat === 'nassau' || ['match', 'bestball', 'scramble', 'ryder'].includes(gameFormat)) {
        const scoringType = data.nassauScoring || data.matchScoring || 'net';
        const pressRule = gameFormat === 'nassau' ? (data.nassauPressRule || 'none') : (data.matchPressRule || 'none');
        const nassauStake = data.nassauStake || 10;
        const matchStake = data.matchStake || 0;
        const stakeToUse = gameFormat === 'nassau' ? nassauStake : matchStake;
        const manualMatchPresses = data.matchPresses ? Object.values(data.matchPresses) : [];
        const matchData = calculateMatchEngine(moneyPlayers, courseData, savedScores, scoringType, gameFormat, pressRule, stakeToUse, holeBet, manualMatchPresses, nassauStakeConfig(data));

        if (!matchData) {
            result.message = 'Waiting for players and scores to be entered.';
            return result;
        }

        const t1Players = matchData.t1Players, t2Players = matchData.t2Players;
        const t1Share = t1Players.length > 0 ? matchData.t1TotalMoney / t1Players.length : 0;
        const t2Share = t2Players.length > 0 ? -matchData.t1TotalMoney / t2Players.length : 0;

        result.valid = true;
        result.formatLabel = gameFormat === 'nassau' ? 'Nassau' : 'Match Play';
        result.players = t1Players.map(p => ({ id: p.id, name: p.name, net: t1Share }))
            .concat(t2Players.map(p => ({ id: p.id, name: p.name, net: t2Share })));
        if (t1Players.length > 1 || t2Players.length > 1) {
            result.splitNote = 'Team payout split evenly among teammates.';
        }
        return result;
    }

    result.message = `Money settlement isn't built yet for the "${gameFormat}" format.`;
    return result;
}

// ============================================================================
// DEBT SIMPLIFICATION
// Takes { name: netDollarTotal } (positive = owed money, negative = owes
// money) and returns the minimum set of payments to settle everyone up.
// ============================================================================
function simplifyDebts(netByName) {
    const creditors = [];
    const debtors = [];
    Object.keys(netByName).forEach(name => {
        const amt = Math.round(netByName[name] * 100) / 100;
        if (amt > 0.005) creditors.push({ name, amt });
        else if (amt < -0.005) debtors.push({ name, amt: -amt });
    });
    creditors.sort((a, b) => b.amt - a.amt);
    debtors.sort((a, b) => b.amt - a.amt);

    const transactions = [];
    let ci = 0, di = 0;
    while (ci < creditors.length && di < debtors.length) {
        const c = creditors[ci], d = debtors[di];
        const amt = Math.min(c.amt, d.amt);
        if (amt > 0.005) {
            transactions.push({ from: d.name, to: c.name, amount: Math.round(amt * 100) / 100 });
        }
        c.amt -= amt;
        d.amt -= amt;
        if (c.amt <= 0.005) ci++;
        if (d.amt <= 0.005) di++;
    }
    return transactions;
}

// ============================================================================
// NET-TO-PAR STANDINGS — the one ranking every live surface reads
//
// This lived inside leaderboard.html's renderBoard(), computed and rendered in a
// single pass, so nothing else could reach it. The scorecard needs the same
// answer, and a golfer must never be able to open the Leaderboard and the
// scorecard ticker on the same round and see two different orders.
//
// So it is lifted out verbatim - the same accumulation, the same
// getStrokes/parseHcp pair, the same toPar arithmetic - and both surfaces now
// call it. Extracting rather than copying is the point: a third copy is exactly
// how the two screens would drift.
//
// RELATIVE TO PAR, NOT A CUMULATIVE TOTAL. "Net 19" means nothing at a glance
// after five holes; "-2" means everything. parPlayed only counts holes actually
// posted, so a golfer thru 5 is measured against 5 holes of par, not 18.
//
// TIES SHARE A POSITION AND CONSUME THE SLOTS BENEATH. Two golfers tied at the
// top are both T1 and the next is 3rd - never 1st, 2nd, 3rd as if the tie had
// been broken by nothing.
function computeNetToParStandings(players, courseData, savedScores, opts) {
    const options = opts || {};
    const basis = options.basis === 'gross' ? 'gross' : 'net';
    const rows = (players || []).map(p => {
        let net = 0, gross = 0, thru = 0, parPlayed = 0;
        (courseData || []).forEach(h => {
            const v = savedScores ? savedScores['p' + p.id + '_h' + h.hole] : null;
            if (v && v > 0) {
                const score = parseInt(v, 10);
                gross += score;
                net += (score - getStrokes(h.hcpIndex, parseHcp(p.hcp)));
                parPlayed += parseInt(h.par, 10);
                thru++;
            }
        });
        const toParGross = gross - parPlayed;
        const toParNet = net - parPlayed;
        return {
            id: p.id, name: p.name, hcp: p.hcp,
            gross, net, thru,
            toParGross, toParNet,
            toPar: basis === 'net' ? toParNet : toParGross,
            sortVal: basis === 'net' ? toParNet : toParGross,
            started: thru > 0,
        };
    });

    // Golfers who have not teed off sort last regardless of basis - a score of
    // zero is not level par, it is an absence of information.
    rows.sort((a, b) => {
        if (a.started !== b.started) return a.started ? -1 : 1;
        if (a.sortVal !== b.sortVal) return a.sortVal - b.sortVal;
        return String(a.name).localeCompare(String(b.name));
    });

    let lastVal = null, lastPos = 0;
    rows.forEach((r, i) => {
        if (!r.started) { r.position = null; r.positionLabel = '\u2014'; return; }
        if (lastVal === null || r.sortVal !== lastVal) { lastPos = i + 1; lastVal = r.sortVal; }
        r.position = lastPos;
        const tied = rows.filter(x => x.started && x.sortVal === r.sortVal).length > 1;
        r.positionLabel = (tied ? 'T' : '') + lastPos;
    });
    return rows;
}

// "E" for level, an explicit sign otherwise. Golfers read a scoreboard, not a
// number line.
function formatToPar(v) {
    const n = Number(v) || 0;
    if (n === 0) return 'E';
    return (n > 0 ? '+' : '') + n;
}

// ============================================================================
// LIVE MATCH & PRESS PRESENTER
//
// WHAT THIS EXISTS TO FIX. During a real Nassau — $5/$5/$10, 2-down auto press —
// the engine correctly generated both auto-presses at Hole 3, and the golfer
// could not see any of it. The Live Action dashboard had been deleted during a
// consolidation, and what survived sat behind a collapsed "View All Action ▶".
// The scorecard showed a stroke-play leaderboard for a match-play game.
//
// A PRESENTER, NOT AN ENGINE. This computes no golf and no money. It calls
// calculateMatchEngine — the same function settlement uses, the one the audit
// put through a 25-case torture matrix — and reshapes activeMatches into
// segments with their presses attached, so the scorecard and the leaderboard
// can render one identical answer instead of two hand-rolled ones.
//
// Returns null when the round has no match-play action, so callers can simply
// omit the widget rather than drawing an empty box.
// SIDE-MATCH WAGERS ARE THE SUPPORTED NASSAU PATH.
//
// buildLiveMatchState originally read only d.gameFormat - the ROUND format. But
// Nassau is a wager in this app, created from Action, so a real $5/$5/$10 Nassau
// lives in sideMatches on an otherwise Stroke Play round. The presenter returned
// null and the widget never rendered: the money was right, the Matches tab showed
// it, and the scorecard - the screen a golfer is already holding - showed nothing.
//
// buildLiveMatchStates() returns EVERY match-play wager visible to this viewer:
// the round format if it is one, plus each qualifying side match.
//
// SCOPE MIRRORS THE SCORECARD'S EXISTING RULE - a wager is shown when any
// participant is among the players this viewer can see. That is deliberately not
// "only matches I am in": a caddie or the organizer watching a group needs the
// bets in front of them, and a cross-group wager legitimately appears to both
// sides. visiblePlayerIds is supplied by the caller, which already knows its own
// group lock; when absent, every player counts.
function buildLiveMatchStates(data, courseData, savedScores, visiblePlayerIds) {
    const d = data || {};
    const out = [];

    // 1. The round format itself, when it is a match-play format.
    const roundState = buildLiveMatchState(d, courseData, savedScores);
    if (roundState) out.push(roundState);

    // 2. Every side-match wager the engine can express as a match.
    const sideMatches = d.sideMatches || {};
    const visible = Array.isArray(visiblePlayerIds) && visiblePlayerIds.length > 0
        ? visiblePlayerIds.map(String) : null;

    Object.keys(sideMatches).forEach(key => {
        const sm = sideMatches[key] || {};
        if (!['nassau', 'match'].includes(sm.format)) return;   // stroke/skins/dots are not matches

        const a = (sm.teamAIds || []).map(String);
        const b = (sm.teamBIds || []).map(String);
        if (a.length === 0 || b.length === 0) return;
        if (visible && !a.concat(b).some(id => visible.includes(id))) return;

        // Real player objects, assigned to the two sides the wager named.
        const byId = {};
        (d.players || []).forEach(p => { byId[String(p.id)] = p; });
        const players = a.map(id => byId[id]).filter(Boolean)
            .map(p => Object.assign({}, p, { team: 'Team 1' }))
            .concat(b.map(id => byId[id]).filter(Boolean)
                .map(p => Object.assign({}, p, { team: 'Team 2' })));
        if (players.length < 2) return;

        // A wager struck on the 6th tee does not retroactively own holes 1-5.
        const start = Number(sm.startHole) || 1;
        const holes = (courseData || []).filter(h => h.hole >= start);
        if (holes.length === 0) return;

        const st = buildLiveMatchState(Object.assign({}, d, {
            gameFormat: sm.format,
            players,
            nassauScoring: sm.scoring || 'net',
            matchScoring: sm.scoring || 'net',
            nassauPressRule: sm.pressRule || 'none',
            matchPressRule: sm.pressRule || 'none',
            nassauStake: sm.stake || 0,
            matchStake: sm.stake || 0,
            matchPresses: sm.presses || null,
            // The side-match stake fields, so nassauStakeConfig resolves $5/$5/$10.
            format: sm.format,
            frontStake: sm.frontStake,
            backStake: sm.backStake,
            overallStake: sm.overallStake,
            autoPressStake: sm.autoPressStake,
        }), holes, savedScores);

        if (st) {
            st.wagerId = key;
            st.isSideMatch = true;
            st.startHole = start;
            // CAN THIS STILL BE PRESSED, AND FROM WHICH HOLE?
            //
            // Decided here so the page renders a control without re-deriving press
            // rules - the divergence that class of duplication has already caused.
            // A press begins on the hole AFTER the last one everybody has posted, and
            // only while holes remain. pressRule 'none' means the group agreed not to.
            const lastHole = holes.length ? holes[holes.length - 1].hole : 0;
            const nextHole = (st.thru || start - 1) + 1;
            st.pressRule = sm.pressRule || 'none';
            st.canPress = st.pressRule !== 'none' && nextHole <= lastHole && st.thru > 0;
            st.nextPressHole = st.canPress ? nextHole : null;
            out.push(st);
        }
    });

    return out;
}

function buildLiveMatchState(data, courseData, savedScores) {
    if (typeof calculateMatchEngine !== 'function') return null;
    const d = data || {};
    const gameFormat = d.gameFormat;
    if (!['nassau', 'match', 'bestball', 'scramble', 'ryder'].includes(gameFormat)) return null;

    const holes = courseData || [];
    if (holes.length === 0) return null;

    // Only golfers actually in the money play the match, mirroring renderScorecard.
    const moneyPlayers = (d.players || []).filter(p => p.playingForMoney !== false);
    if (moneyPlayers.length < 2) return null;

    const scoringType = gameFormat === 'nassau'
        ? (d.nassauScoring || 'net')
        : (d.matchScoring || 'net');
    const pressRule = gameFormat === 'nassau'
        ? (d.nassauPressRule || 'none')
        : (d.matchPressRule || 'none');
    const stake = gameFormat === 'nassau'
        ? (d.nassauStake || 10)
        : (d.matchStake || 0);
    const holeBet = Number(d.holeBet) || 0;
    const manualPresses = d.matchPresses ? Object.values(d.matchPresses) : [];

    let calc;
    try {
        calc = calculateMatchEngine(moneyPlayers, holes, savedScores, scoringType,
            gameFormat, pressRule, stake, holeBet, manualPresses, nassauStakeConfig(d));
    } catch (e) { return null; }
    if (!calc || !calc.activeMatches) return null;

    // "2 UP" for the leader, "AS" when level - the language on a scoreboard, not a
    // signed integer. status is positive when team 1 leads.
    const statusText = m => {
        if (m.status === 0) return 'AS';
        const who = m.status > 0 ? calc.t1Name : calc.t2Name;
        return who + ' ' + Math.abs(m.status) + ' UP';
    };

    // A press is MANUAL only when the golfer typed one that matches this segment
    // and start hole; everything else the trigger rule invented.
    const isManual = m => manualPresses.some(mp =>
        mp.baseId === m.baseId && Number(mp.startHole) === Number(m.startHole));

    const order = { F9: 0, B9: 1, '18': 2 };
    const bases = calc.activeMatches.filter(m => m.pressNum === 0)
        .sort((a, b) => (order[a.baseId] === undefined ? 9 : order[a.baseId])
                      - (order[b.baseId] === undefined ? 9 : order[b.baseId]));

    const segments = bases.map(base => {
        // A segment nobody has teed off on yet is "Not Started" rather than a
        // misleading All Square.
        const played = holes.some(h => h.hole >= base.startHole && h.hole <= base.endHole
            && moneyPlayers.some(p => savedScores && savedScores['p' + p.id + '_h' + h.hole] > 0));

        const presses = calc.activeMatches
            .filter(m => m.baseId === base.baseId && m.pressNum > 0)
            .sort((a, b) => a.startHole - b.startHole)
            .map(m => ({
                pressNum: m.pressNum,
                startHole: m.startHole,
                status: m.status,
                statusText: statusText(m),
                closed: !!m.closed,
                auto: !isManual(m),
                stake: (m.stake === undefined || m.stake === null) ? stake : m.stake,
            }));

        return {
            id: base.baseId,
            label: base.label,
            startHole: base.startHole,
            endHole: base.endHole,
            started: played,
            status: base.status,
            statusText: played ? statusText(base) : 'Not Started',
            closed: !!base.closed,
            stake: (base.stake === undefined || base.stake === null) ? stake : base.stake,
            presses,
        };
    });

    if (segments.length === 0) return null;

    return {
        gameFormat,
        formatLabel: gameFormat === 'nassau' ? 'Nassau' : 'Match Play',
        scoring: scoringType,
        t1Name: calc.t1Name,
        t2Name: calc.t2Name,
        thru: calc.maxThru,
        pressCount: calc.pressCount,
        segments,
    };
}

// ============================================================================
// NASSAU STAKE CONFIG — read the persisted fields into the runtime shape
//
// Flat fields, matching every other Nassau setting:
//   nassauFrontStake / nassauBackStake / nassauOverallStake / nassauAutoPressStake
//
// LEGACY IS THE ABSENCE OF THESE FIELDS. A round carrying only nassauStake gets
// undefined for each segment, calculateMatchEngine falls back to the single
// wager, and it settles to the cent exactly as it always has. Nothing is
// migrated; old rounds are simply never asked the new question.
//
// nassauAutoPressStake null/absent means "same as segment" - the default most
// groups play. A number applies to every automatic press. Manual presses are
// untouched either way: whatever the golfer typed at the moment of pressing.
function nassauStakeConfig(data) {
    const d = data || {};
    // TWO SHAPES, ONE CONTRACT.
    //
    //   ROUND FORMAT (legacy, hidden): nassauFrontStake / nassauBackStake / ...
    //   SIDE MATCH   (the supported path today): frontStake / backStake / overallStake
    //
    // Nassau is a WAGER in this app, created from Action, not a round type - the round
    // format lives on only so existing rounds stay readable. Both shapes normalize here
    // so no consumer has to know which one it is holding.
    const isSideMatch = d.format === 'nassau';
    if (isSideMatch) {
        const pickS = v => (v === undefined || v === null || v === '') ? undefined : Number(v);
        const c = {
            F9: pickS(d.frontStake),
            B9: pickS(d.backStake),
            '18': pickS(d.overallStake),
            autoPress: pickS(d.autoPressStake),
        };
        if (c.F9 === undefined && c.B9 === undefined && c['18'] === undefined
            && c.autoPress === undefined) return undefined;   // legacy: single `stake`
        return c;
    }
    if (d.gameFormat !== 'nassau') return undefined;
    const pick = v => (v === undefined || v === null || v === '') ? undefined : Number(v);
    const cfg = {
        F9: pick(d.nassauFrontStake),
        B9: pick(d.nassauBackStake),
        '18': pick(d.nassauOverallStake),
        autoPress: pick(d.nassauAutoPressStake),
    };
    // Nothing configured at all -> behave exactly like a legacy round.
    if (cfg.F9 === undefined && cfg.B9 === undefined && cfg['18'] === undefined
        && cfg.autoPress === undefined) return undefined;
    return cfg;
}

// ============================================================================
// LIVE POINTS/EVENT GAMES — Stableford, Wolf, Dots
//
// WHAT THIS EXISTS TO FIX. A golfer playing Stableford saw only
// "LIVE LEADERBOARD - NET TO PAR". So did a golfer playing Wolf, and one playing
// Dots. Net-to-par is not those games: Stableford is points, Wolf is points won
// per hole, Dots is junk earned and lost. All three engines already computed the
// real answer and nothing rendered it - the same failure that made a real Nassau
// look like stroke play.
//
// A SIBLING OF buildLiveMatchStates, NOT AN EXTENSION. Match games have segments
// and presses; these have a running total per player. Forcing both into one
// presenter would produce a shape that fits neither.
//
// It computes NO game rules. calcStablefordEngine, calcWolfEngine and
// calcDotsEngine are the canonical sources; this reads their `totals` and ranks
// them. That is the whole job.
//
// Returns null when the game is not being played, so a caller can simply omit
// the widget rather than draw an empty one.
function buildLivePointsState(data, courseData, savedScores) {
    const d = data || {};
    const holes = courseData || [];
    const players = (d.players || []);
    if (players.length === 0 || holes.length === 0) return null;

    const fmt = d.gameFormat;
    let totals = null, label = '', icon = '', unit = '', signed = false, extra = null;

    if (fmt === 'stableford' && typeof calcStablefordEngine === 'function') {
        const calc = calcStablefordEngine(d, holes, savedScores);
        totals = calc && calc.totals;
        label = 'STABLEFORD'; icon = '\uD83C\uDFC1'; unit = 'pts';
    } else if (fmt === 'wolf' && typeof calcWolfEngine === 'function') {
        const calc = calcWolfEngine(d, holes, savedScores);
        totals = calc && calc.totals;
        label = 'WOLF'; icon = '\uD83D\uDC3A'; unit = 'pts'; signed = true;
        // Carried points are real Wolf state - a hole that pushed raises the next
        // one's value, and a golfer deciding whether to go lone needs to know.
        if (calc && calc.carryPending > 0) extra = 'Carry: ' + calc.carryPending;
    } else if (typeof calcDotsEngine === 'function' && (fmt === 'dots' || d.dots)) {
        const calc = calcDotsEngine(d, holes, savedScores);
        totals = calc && calc.totals;
        label = 'DOTS'; icon = '\uD83C\uDFAF'; unit = ''; signed = true;
    }
    if (!totals) return null;

    // HOW FAR IN ARE WE. Counted from posted scores, not from configuration, so
    // "thru 6" always describes what has actually been played.
    let thru = 0;
    holes.forEach(h => {
        if (players.some(p => savedScores && savedScores['p' + p.id + '_h' + h.hole] > 0)) {
            thru = Math.max(thru, h.hole);
        }
    });

    // A game with no events yet is "not started" rather than a table of zeros,
    // which would read as though everyone were tied on merit.
    const anyValue = Object.keys(totals).some(k => Number(totals[k]) !== 0);
    const rows = players.map(p => ({
        id: p.id,
        name: p.name,
        value: Number(totals[p.id]) || 0,
    })).sort((a, b) => b.value - a.value);

    // Shared rank on equal totals - "T2" is the honest answer to a tie.
    let lastVal = null, lastRank = 0;
    rows.forEach((r, i) => {
        if (lastVal !== null && r.value === lastVal) { r.rank = lastRank; r.tied = true; }
        else { r.rank = i + 1; lastRank = r.rank; }
        lastVal = r.value;
    });
    rows.forEach(r => { r.tied = rows.filter(x => x.value === r.value).length > 1; });

    return {
        gameFormat: fmt,
        label, icon, unit, signed, extra,
        thru,
        started: thru > 0 && anyValue,
        rows,
    };
}

// ============================================================================
// LIVE HI-LO
//
// Hi-Lo is a complete money game - real settlement, real receipts, zero-sum -
// and during play it showed the golfer only "NET TO PAR". That is not the game:
// Hi-Lo is decided by two contests on every hole, the low ball and the high
// ball, and net-to-par says nothing about either.
//
// A THIRD PRESENTER, DELIBERATELY. buildLiveMatchStates covers segments and
// presses; buildLivePointsState covers a running total per player. Hi-Lo is
// neither: it is two team contests whose results accumulate as half-points.
// Forcing it into "2 UP" match language would describe a game nobody is playing.
//
// IT COMPUTES NO GOLF. calculateHiLoEngine is canonical - it decides every low
// and high winner and both point totals. This reads holeLog and counts. The
// engine lives in settlement-engine.js, which both pages load after this file,
// so it is resolved at call time rather than at definition time.
//
// NO MONEY. Settlement is (t1Points - t2Points) x holeBetStake, and that belongs
// in Results. A running dollar figure mid-round is not final and must not appear.
function buildLiveHiLoState(data, courseData, savedScores) {
    const d = data || {};
    if (d.gameFormat !== 'hilo') return null;
    if (typeof calculateHiLoEngine !== 'function') return null;

    const holes = courseData || [];
    const players = (d.players || []).filter(p => p.playingForMoney !== false);
    if (players.length < 2 || holes.length === 0) return null;

    let calc;
    try { calc = calculateHiLoEngine(players, holes, savedScores); }
    catch (e) { return null; }
    if (!calc || !calc.t1Name || !calc.t2Name) return null;

    // CUMULATIVE LOW AND HIGH, counted only from holes the engine actually
    // resolved. An unplayed hole has no entry in holeLog, so it cannot be
    // mistaken for a halve - "tied" here means both balls matched, which is a
    // real Hi-Lo result and different from "not played yet".
    const log = calc.holeLog || {};
    const tally = { low: { t1: 0, t2: 0, tied: 0 }, high: { t1: 0, t2: 0, tied: 0 } };
    let resolvedHoles = 0;
    Object.keys(log).forEach(k => {
        const h = log[k];
        if (!h) return;
        resolvedHoles++;
        if (h.lowWinner === calc.t1Name) tally.low.t1++;
        else if (h.lowWinner === calc.t2Name) tally.low.t2++;
        else tally.low.tied++;
        if (h.highWinner === calc.t1Name) tally.high.t1++;
        else if (h.highWinner === calc.t2Name) tally.high.t2++;
        else tally.high.tied++;
    });

    let thru = 0;
    holes.forEach(h => {
        if (players.some(p => savedScores && savedScores['p' + p.id + '_h' + h.hole] > 0)) {
            thru = Math.max(thru, h.hole);
        }
    });

    const diff = calc.t1Points - calc.t2Points;
    // "Leading by 1.5 points" is the honest description. Hi-Lo has no UP/DOWN.
    let leadText;
    if (diff > 0) leadText = calc.t1Name + ' by ' + Math.abs(diff);
    else if (diff < 0) leadText = calc.t2Name + ' by ' + Math.abs(diff);
    else leadText = 'All even';

    return {
        gameFormat: 'hilo',
        label: 'HI-LO',
        icon: '\u2696\uFE0F',
        t1Name: calc.t1Name,
        t2Name: calc.t2Name,
        t1Points: calc.t1Points,
        t2Points: calc.t2Points,
        differential: diff,
        leadText,
        low: tally.low,
        high: tally.high,
        thru,
        // Nothing resolved yet means nothing to report - not a 0-0 tie, which
        // would read as though the teams had fought to a standstill.
        started: resolvedHoles > 0,
    };
}

// ============================================================================
// LIVE STROKE BET — $/hole and $/overall side matches
//
// A stroke side match is a real money game: it settles, it pays, it is zero-sum.
// During play the golfer saw only "NET TO PAR", which is the round's standings,
// not the wager. The same failure that hid a real Nassau and then Hi-Lo.
//
// A FOURTH SIBLING, DELIBERATELY. buildLiveMatchStates is segments and presses;
// buildLivePointsState is a running total per player; buildLiveHiLoState is two
// team contests. A stroke bet is TWO INDEPENDENT WAGERS in one record - $/hole
// and $/overall - either of which may be switched off. None of the existing
// shapes fits, and bending one to cover it would describe the wrong game.
//
// IT COMPUTES NO GOLF. calculateHoleBetEngine and calculateStrokeHeadToHead are
// canonical and already parity-guarded across money-engine.js and index.html.
// This reads their output and arranges it.
//
// CARRY BELONGS ON THE HOLE SIDE. A halved hole raises what the NEXT one is
// worth, so a golfer standing on the tee needs it - the same reasoning that put
// Wolf's carry on its card.
//
// NO MONEY TOTALS. Who is ahead, by how much, and what the next hole is worth -
// never a running payout. Settlement is final only in Results.
function buildLiveStrokeBetStates(data, courseData, savedScores, visiblePlayerIds) {
    const d = data || {};
    const holes = courseData || [];
    const out = [];
    if (holes.length === 0) return out;

    const sideMatches = d.sideMatches || {};
    const visible = Array.isArray(visiblePlayerIds) && visiblePlayerIds.length > 0
        ? visiblePlayerIds.map(String) : null;
    const byId = {};
    (d.players || []).forEach(p => { byId[String(p.id)] = p; });

    Object.keys(sideMatches).forEach(key => {
        const sm = sideMatches[key] || {};
        if (sm.format !== 'stroke') return;

        const a = (sm.teamAIds || []).map(String);
        const b = (sm.teamBIds || []).map(String);
        if (a.length === 0 || b.length === 0) return;
        if (visible && !a.concat(b).some(id => visible.includes(id))) return;

        // The engines are 1v1. A 2v2 stroke bet is settled elsewhere by its own
        // path, so this presenter declines rather than describing it wrongly.
        if (a.length !== 1 || b.length !== 1) return;
        const p1 = byId[a[0]], p2 = byId[b[0]];
        if (!p1 || !p2) return;

        // A wager struck on the 6th tee does not own holes 1-5.
        const start = Number(sm.startHole) || 1;
        const range = holes.filter(h => h.hole >= start);
        if (range.length === 0) return;

        const scoring = sm.scoring || 'net';
        const holeStake = Number(sm.holeStake) || 0;
        const overallStake = Number(sm.overallStake) || 0;
        if (holeStake <= 0 && overallStake <= 0) return;   // no wager to report

        let thru = 0;
        range.forEach(h => {
            if (savedScores && savedScores['p' + p1.id + '_h' + h.hole] > 0
                && savedScores['p' + p2.id + '_h' + h.hole] > 0) {
                thru = Math.max(thru, h.hole);
            }
        });

        // ---- $/HOLE ----
        let holeSide = null;
        if (holeStake > 0 && typeof calculateHoleBetEngine === 'function') {
            try {
                const cfg = {
                    holeEnabled: true, holeStake, segment: sm.segment || 'full',
                    tieRule: sm.tieRule || 'carry', scoringType: scoring, p1, p2,
                };
                const hb = calculateHoleBetEngine([p1, p2], range, savedScores, cfg,
                    sm.holePresses ? Object.values(sm.holePresses) : []);
                if (hb) {
                    const log = hb.holeLog || [];
                    holeSide = {
                        stake: holeStake,
                        p1Holes: log.filter(h => h.winner === p1.name).length,
                        p2Holes: log.filter(h => h.winner === p2.name).length,
                        carry: Number(hb.currentCarry) || 0,
                        // What the NEXT hole is actually worth, carry included.
                        currentStake: Number(hb.currentStake) || holeStake,
                        tiedHoles: (hb.tiesCarried || []).length,
                    };
                }
            } catch (e) { holeSide = null; }
        }

        // ---- $/OVERALL ----
        let overallSide = null;
        if (overallStake > 0 && typeof calculateStrokeHeadToHead === 'function') {
            try {
                const ov = calculateStrokeHeadToHead([p1, p2], range, savedScores, scoring, overallStake);
                if (ov) {
                    const lead = ov.p2Total - ov.p1Total;   // lower total wins
                    overallSide = {
                        stake: overallStake,
                        p1Total: ov.p1Total,
                        p2Total: ov.p2Total,
                        leadText: lead > 0 ? p1.name.split(' ')[0] + ' by ' + lead
                                : lead < 0 ? p2.name.split(' ')[0] + ' by ' + Math.abs(lead)
                                : 'All square',
                        closed: !!ov.roundComplete,
                    };
                }
            } catch (e) { overallSide = null; }
        }
        if (!holeSide && !overallSide) return;

        out.push({
            wagerId: key,
            label: 'STROKE BET',
            icon: '\uD83C\uDFAF',
            p1Name: p1.name.split(' ')[0],
            p2Name: p2.name.split(' ')[0],
            scoring,
            startHole: start,
            thru,
            started: thru > 0,
            hole: holeSide,
            overall: overallSide,
        });
    });

    return out;
}
