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
function calculateMatchEngine(players, courseData, savedScores, scoringType, gameFormat, pressRule, stake, holeBet, manualPresses) {
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
                { id: 'F9', baseId: 'F9', startHole: 1, endHole: 9, status: 0, label: 'Front 9', triggers: 0, closed: false, pressNum: 0 },
                { id: 'B9', baseId: 'B9', startHole: 10, endHole: 18, status: 0, label: 'Back 9', triggers: 0, closed: false, pressNum: 0 },
                { id: '18', baseId: '18', startHole: 1, endHole: 18, status: 0, label: 'Total', triggers: 0, closed: false, pressNum: 0 }
            ];
        } else if (hasFront) {
            activeMatches = [
                { id: 'F9', baseId: 'F9', startHole: 1, endHole: 9, status: 0, label: '9-Hole Match', triggers: 0, closed: false, pressNum: 0 }
            ];
        } else if (hasBack) {
            activeMatches = [
                { id: 'B9', baseId: 'B9', startHole: 10, endHole: 18, status: 0, label: '9-Hole Match', triggers: 0, closed: false, pressNum: 0 }
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
                                stake: (manualPress && manualPress.stake !== undefined && manualPress.stake !== null)
                                    ? manualPress.stake : undefined,
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
        const matchData = calculateMatchEngine(moneyPlayers, courseData, savedScores, scoringType, gameFormat, pressRule, stakeToUse, holeBet, manualMatchPresses);

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
