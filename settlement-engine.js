// ============================================================================
// GolfApp — Settlement Engine (CANONICAL)
//
// The complete money picture for ONE finished round: the main game, plus Skins,
// Hi-Lo, the Birdie Pool and every Side Match. computeCombinedNetTotals()
// is the single source of truth for "what did each golfer win or lose today".
//
// WHY THIS FILE EXISTS
// These functions used to live inline in settlement.html. That meant trip.html
// could not reach them, so Trip settlement fell back to computeRoundMoneyByPlayer
// in money-engine.js — which only covers the MAIN format and explicitly excludes
// Skins and Hi-Lo, and knows nothing about birdie pools, KPs or Side Matches. A
// trip round played as Skins with a birdie pool and three side matches therefore
// contributed $0 to the trip total, and side-match money vanished with no warning.
//
// Both settlement.html and trip.html now load this file, so there is exactly ONE
// definition of what counts as money. Do not copy these functions back into a page.
//
// DEPENDS ON money-engine.js being loaded first (parseHcp, getStrokes,
// calculateMatchEngine, computeRoundMoneyByPlayer). Plain global functions, no
// module system, matching the rest of the codebase.
//
// INVARIANT: every completed wager is zero-sum. SUM(all golfer money) === 0.
// ============================================================================

    function getSkinsHoleScoresForSettle(players, savedScores, h) {
        let holeScores = [];
        players.forEach(p => {
            let v = savedScores[`p${p.id}_h${h.hole}`];
            if (v && v > 0) {
                let gross = parseInt(v, 10);
                let net = gross - getStrokes(h.hcpIndex, parseHcp(p.hcp));
                holeScores.push({ id: p.id, name: p.name, gross, net });
            }
        });
        return holeScores;
    }

    function computeSkinsCarryOverForSettle(players, courseData, savedScores, scoreKey) {
        let skins = [];
        let carryUnits = 1;
        courseData.forEach(h => {
            const holeScores = getSkinsHoleScoresForSettle(players, savedScores, h);
            if (holeScores.length === 0) return;
            const scores = holeScores.map(s => s[scoreKey]);
            const min = Math.min(...scores);
            const winners = holeScores.filter(s => s[scoreKey] === min);
            if (winners.length === 1) { skins.push({ hole: h.hole, player: winners[0], unitsWon: carryUnits }); carryUnits = 1; }
            else { carryUnits += 1; }
        });
        return { skins, pendingUnits: carryUnits > 1 ? carryUnits - 1 : 0 };
    }

    function computeSkinsVoidForSettle(players, courseData, savedScores, scoreKey) {
        let skins = [];
        courseData.forEach(h => {
            const holeScores = getSkinsHoleScoresForSettle(players, savedScores, h);
            if (holeScores.length === 0) return;
            const scores = holeScores.map(s => s[scoreKey]);
            const min = Math.min(...scores);
            const winners = holeScores.filter(s => s[scoreKey] === min);
            if (winners.length === 1) skins.push({ hole: h.hole, player: winners[0], unitsWon: 1 });
        });
        return { skins, pendingUnits: 0 };
    }

    function computeSkinsSettlementNet(data, courseData, savedScores) {
        // The wager's own field. For a round-wide skins game this is everyone playing
        // for money, exactly as before; for a participant-scoped game it is only the
        // golfers named on it. Everyone else is not in this pot at all - they cannot
        // win a skin, cannot break a tie, and neither pay nor receive a cent.
        const allPlayers = (typeof fieldParticipants === 'function')
            ? fieldParticipants(data)
            : (data.players || []).filter(p => p.playingForMoney !== false);
        // ONE resolution rule, shared with the live view. resolveSkinsMode() gives
        // skinsPotFormat precedence, which is exactly what this line has always done -
        // so every saved round settles to the same cent - while also giving a config
        // that only ever carried skinsScoring a defined answer instead of silently
        // falling through to split.
        const potFormat = (typeof resolveSkinsMode === 'function')
            ? resolveSkinsMode(data)
            : (data.skinsPotFormat || 'split');
        const buyIn = data.skinsBuyIn !== undefined ? data.skinsBuyIn : 0;
        const carryOver = data.skinsCarryOver !== false;
        const totalHoles = (courseData || []).length;
        const computeFn = carryOver ? computeSkinsCarryOverForSettle : computeSkinsVoidForSettle;

        const grossResult = (potFormat === 'split' || potFormat === 'gross') ? computeFn(allPlayers, courseData, savedScores, 'gross') : { skins: [], pendingUnits: 0 };
        const netResult = (potFormat === 'split' || potFormat === 'net') ? computeFn(allPlayers, courseData, savedScores, 'net') : { skins: [], pendingUnits: 0 };

        const totalPot = buyIn * allPlayers.length;
        let grossPot = 0, netPot = 0;
        if (potFormat === 'split') { grossPot = totalPot / 2; netPot = totalPot / 2; }
        else if (potFormat === 'gross') { grossPot = totalPot; }
        else if (potFormat === 'net') { netPot = totalPot; }

        const grossSkinValue = carryOver ? (totalHoles > 0 ? grossPot / totalHoles : 0) : (grossResult.skins.length > 0 ? grossPot / grossResult.skins.length : 0);
        const netSkinValue = carryOver ? (totalHoles > 0 ? netPot / totalHoles : 0) : (netResult.skins.length > 0 ? netPot / netResult.skins.length : 0);

        let payout = {};
        allPlayers.forEach(p => payout[p.id] = 0);
        grossResult.skins.forEach(s => { payout[s.player.id] += s.unitsWon * grossSkinValue; });
        netResult.skins.forEach(s => { payout[s.player.id] += s.unitsWon * netSkinValue; });
        if (carryOver && grossResult.pendingUnits > 0 && allPlayers.length > 0) {
            const share = (grossResult.pendingUnits * grossSkinValue) / allPlayers.length;
            allPlayers.forEach(p => payout[p.id] += share);
        }
        if (carryOver && netResult.pendingUnits > 0 && allPlayers.length > 0) {
            const share = (netResult.pendingUnits * netSkinValue) / allPlayers.length;
            allPlayers.forEach(p => payout[p.id] += share);
        }

        // MID-ROUND STAKE PRORATION (carry-over skins only).
        //
        // Each player used to be charged the FULL buy-in from the first score entered,
        // while the pot for holes NOT YET PLAYED had been awarded to nobody. Mid-round
        // the totals therefore summed negative - money looked destroyed - and every
        // golfer showed as already down their share of skins nobody had won yet. That
        // contradicts the app's own rule that money AT STAKE is not money LOST.
        //
        // A player is now charged only for the portion of the pot that is actually in
        // play: the holes that have been played. Under carry-over every played hole
        // contributes exactly one unit, either won outright or carried forward, so
        // (unitsWon + pendingUnits) IS the number of holes played.
        //
        // On a COMPLETED round played === total, the multiplier is 1, and every result
        // is bit-for-bit what it has always been. This changes in-progress display only,
        // never final settlement.
        //
        // Non-carry-over ("void") skins are deliberately untouched: that mode already
        // distributes its whole pot across decided holes and is already zero-sum.
        function playedUnits(result) {
            return result.skins.reduce((sum, s) => sum + s.unitsWon, 0) + (result.pendingUnits || 0);
        }
        const grossInPlay = (carryOver && totalHoles > 0) ? Math.min(playedUnits(grossResult) / totalHoles, 1) : 1;
        const netInPlay = (carryOver && totalHoles > 0) ? Math.min(playedUnits(netResult) / totalHoles, 1) : 1;

        const n = allPlayers.length;
        const grossStake = n > 0 ? (grossPot / n) * grossInPlay : 0;
        const netStake = n > 0 ? (netPot / n) * netInPlay : 0;

        let netByPlayerId = {};
        allPlayers.forEach(p => { netByPlayerId[p.id] = payout[p.id] - grossStake - netStake; });
        return netByPlayerId;
    }

    function calculateHiLoEngine(players, courseData, savedScores) {
        let teams = {};
        players.forEach(p => {
            let key = p.team || "Team 1";
            if (!teams[key]) teams[key] = [];
            teams[key].push(p);
        });
        const teamKeys = Object.keys(teams);
        if (teamKeys.length < 2) return null;
        let t1Key = teamKeys[0], t2Key = teamKeys[1];
        let t1Players = teams[t1Key], t2Players = teams[t2Key];
        let t1Name = t1Players.map(p => p.name.split(" ")[0]).join("/");
        let t2Name = t2Players.map(p => p.name.split(" ")[0]).join("/");
        let t1Points = 0, t2Points = 0;
        let holeLog = {};
        courseData.forEach(hole => {
            let hNum = hole.hole;
            let t1NetScores = [], t2NetScores = [];
            t1Players.forEach(p => {
                let v = savedScores[`p${p.id}_h${hNum}`];
                if (v && v > 0) { let s = parseInt(v, 10) - getStrokes(hole.hcpIndex, parseHcp(p.hcp)); t1NetScores.push(s); }
            });
            t2Players.forEach(p => {
                let v = savedScores[`p${p.id}_h${hNum}`];
                if (v && v > 0) { let s = parseInt(v, 10) - getStrokes(hole.hcpIndex, parseHcp(p.hcp)); t2NetScores.push(s); }
            });
            if (t1NetScores.length > 0 && t2NetScores.length > 0) {
                t1NetScores.sort((a, b) => a - b); t2NetScores.sort((a, b) => a - b);
                let t1Low = t1NetScores[0], t2Low = t2NetScores[0];
                let t1High = t1NetScores[t1NetScores.length - 1], t2High = t2NetScores[t2NetScores.length - 1];
                let h1Won = null;
                if (t1Low < t2Low) { t1Points += 0.5; h1Won = t1Name; }
                else if (t2Low < t1Low) { t2Points += 0.5; h1Won = t2Name; }
                let h2Won = null;
                if (t1High < t2High) { t1Points += 0.5; h2Won = t1Name; }
                else if (t2High < t1High) { t2Points += 0.5; h2Won = t2Name; }
                holeLog[hNum] = { lowWinner: h1Won, highWinner: h2Won };
            }
        });
        return { t1Name, t2Name, t1Points, t2Points, holeLog };
    }

    function computeHiLoSettlementNet(data, courseData, savedScores) {
        const allPlayers = (data.players || []).filter(p => p.playingForMoney !== false);
        const holeBet = data.holeBetStake || 0;
        const calc = calculateHiLoEngine(allPlayers, courseData, savedScores);
        let netByPlayerId = {};
        if (!calc || holeBet <= 0) return netByPlayerId;

        const t1Total = (calc.t1Points - calc.t2Points) * holeBet;
        const teams = {};
        allPlayers.forEach(p => { const k = p.team || 'Team 1'; if (!teams[k]) teams[k] = []; teams[k].push(p); });
        const teamKeys = Object.keys(teams);
        if (teamKeys.length < 2) return netByPlayerId;
        const t1Players = teams[teamKeys[0]], t2Players = teams[teamKeys[1]];
        const t1Share = t1Players.length > 0 ? t1Total / t1Players.length : 0;
        const t2Share = t2Players.length > 0 ? -t1Total / t2Players.length : 0;
        t1Players.forEach(p => netByPlayerId[p.id] = t1Share);
        t2Players.forEach(p => netByPlayerId[p.id] = t2Share);
        return netByPlayerId;
    }

    function calculateBirdieGameTotalsForSettle(data, courseData, savedScores) {
        if (data.birdieGameEnabled !== true) return {};
        const players = (data.players || []).filter(p => p.playingForMoney !== false);
        const unitVal = data.birdieUnitVal !== undefined ? data.birdieUnitVal : 0;
        const scoringType = data.birdieScoringType || 'gross';
        let units = {};
        players.forEach(p => units[p.id] = 0);
        (courseData || []).forEach(h => {
            players.forEach(p => {
                const v = savedScores[`p${p.id}_h${h.hole}`];
                if (!v || v <= 0) return;
                let score = parseInt(v, 10);
                if (scoringType === 'net') score -= getStrokes(h.hcpIndex, parseHcp(p.hcp));
                const under = parseInt(h.par) - score;
                if (under >= 1) units[p.id] += under;
            });
        });
        const n = players.length;
        const totalUnits = players.reduce((s, p) => s + units[p.id], 0);
        let totals = {};
        players.forEach(p => { totals[p.id] = n > 1 ? unitVal * (n * units[p.id] - totalUnits) : 0; });
        return totals;
    }

    // RETIRED FEATURE - LEGACY COMPATIBILITY ONLY.
    //
    // Dollar Game / KP was removed from the product. Every path that could create,
    // edit or display it is gone: setup, the Action tab picker, the scorecard picker,
    // Results, Stats and print.
    //
    // This calculation deliberately remains, because settlement is always recomputed
    // from raw data - no final money is ever stored. Deleting it would silently rewrite
    // the money of every historical round that played KP, so a golfer reopening an old
    // round would see totals the group never actually settled on.
    //
    // It is unreachable for anything new: it returns immediately unless kpGameEnabled
    // is true, and nothing in the product can set that flag any more. Do not add a
    // caller. Do not re-expose it in UI.
    function calculateKPGameTotalsForSettle(data, courseData) {
        if (data.kpGameEnabled !== true) return { money: {}, wins: {} };
        const players = (data.players || []).filter(p => p.playingForMoney !== false);
        if (players.length < 2 || players.length > 4) return { money: {}, wins: {} };
        const kpHoles = (courseData || []).filter(h => parseInt(h.par) === 3);
        const kpWinners = data.kpWinners || {};
        const buyIn = data.kpBuyIn !== undefined ? data.kpBuyIn : 0;
        let money = {}, wins = {};
        players.forEach(p => { money[p.id] = 0; wins[p.id] = 0; });
        kpHoles.forEach(h => {
            const winnerId = kpWinners[`h${h.hole}`];
            if (!winnerId) return;
            const winnerPlayer = players.find(p => String(p.id) === String(winnerId));
            if (!winnerPlayer) return;
            wins[winnerPlayer.id] = (wins[winnerPlayer.id] || 0) + 1;
            money[winnerPlayer.id] += buyIn * (players.length - 1);
            players.forEach(p => { if (String(p.id) !== String(winnerPlayer.id)) money[p.id] -= buyIn; });
        });
        return { money, wins };
    }

    function getRichHoleBetScore(player, holeNum, courseHole, scoringType, savedScores) {
        const v = savedScores[`p${player.id}_h${holeNum}`];
        if (!v || v <= 0) return null;
        const gross = parseInt(v, 10);
        if (scoringType === 'gross') return gross;
        return gross - getStrokes(courseHole.hcpIndex, parseHcp(player.hcp));
    }

    // Team hole score, BEST BALL - the same convention calculateMatchEngine has always
    // used for every 2v2 format in this app (Match Play, Nassau, Best Ball, Ryder). Not a
    // new rule invented for Stroke: the lowest single score on the side counts, net or
    // gross per the match's own scoring setting.
    //
    // Returns null until every player on the side has posted, so a half-scored team can
    // never win or lose a hole - the same participant-readiness principle as Wave 6.
    function sideHoleScore(sidePlayers, hole, holeObj, scoringType, savedScores) {
        let best = null;
        for (let i = 0; i < sidePlayers.length; i++) {
            const s = getRichHoleBetScore(sidePlayers[i], hole, holeObj, scoringType, savedScores);
            if (s === null) return null;
            if (best === null || s < best) best = s;
        }
        return best;
    }

    function calculateHoleBetEngine(players, courseData, savedScores, config, presses) {
        if (!config || config.holeEnabled === false || players.length < 2) return null;
        const p1 = players[0], p2 = players[1];

        // Same side resolution as the overall bet: one player or a whole team.
        const sideA = (config.sideA && config.sideA.length) ? config.sideA : [p1];
        const sideB = (config.sideB && config.sideB.length) ? config.sideB : [p2];
        const sortedPresses = (presses || []).slice().sort((a, b) => a.fromHole - b.fromHole);

        function getStake(holeNum) {
            let stake = config.holeStake;
            sortedPresses.forEach(pr => { if (holeNum >= pr.fromHole) stake = pr.newStake; });
            return stake;
        }

        let segments = [];
        if (config.segment === 'frontback') {
            segments = [
                { holes: courseData.filter(h => h.hole <= 9), label: 'Front 9' },
                { holes: courseData.filter(h => h.hole > 9), label: 'Back 9' }
            ];
        } else {
            segments = [{ holes: courseData, label: 'Full Round' }];
        }

        let p1Money = 0;
        let holeLog = [];
        let currentCarry = 0;
        let lastPlayedHole = 0;

        segments.forEach(seg => {
            let carry = 0;
            seg.holes.forEach(h => {
                const s1 = sideHoleScore(sideA, h.hole, h, config.scoringType, savedScores);
                const s2 = sideHoleScore(sideB, h.hole, h, config.scoringType, savedScores);
                if (s1 === null || s2 === null) return;
                lastPlayedHole = Math.max(lastPlayedHole, h.hole);

                const baseStake = getStake(h.hole);
                const effectiveStake = baseStake + carry;

                if (s1 < s2) {
                    p1Money += effectiveStake;
                    holeLog.push({ hole: h.hole, winner: p1.name, amount: effectiveStake });
                    carry = 0;
                } else if (s2 < s1) {
                    p1Money -= effectiveStake;
                    holeLog.push({ hole: h.hole, winner: p2.name, amount: effectiveStake });
                    carry = 0;
                } else {
                    if (config.tieRule === 'carry') {
                        carry = effectiveStake;
                        holeLog.push({ hole: h.hole, winner: null, amount: 0, carrying: carry });
                    } else {
                        holeLog.push({ hole: h.hole, winner: null, amount: 0, carrying: 0 });
                        carry = 0;
                    }
                }
            });
            currentCarry = carry;
        });

        const startHole = courseData.length > 0 ? Math.min(...courseData.map(h => h.hole)) : 1;
        const rateHistory = [{ stake: config.holeStake, fromHole: startHole, pressNum: 0 }]
            .concat(sortedPresses.map((pr, i) => ({ stake: pr.newStake, fromHole: pr.fromHole, pressNum: i + 1 })));
        const tiesCarried = holeLog.filter(h => h.winner === null && h.carrying > 0).map(h => h.hole);

        return { p1, p2, p1Money, holeLog, currentCarry, currentStake: getStake(lastPlayedHole + 1) || config.holeStake, rateHistory, tiesCarried };
    }

    function calculateOverallBetEngine(players, courseData, savedScores, config, presses) {
        if (!config || config.overallEnabled === false || players.length < 2) return null;
        const p1 = players[0], p2 = players[1];

        // 2v2: config.sideA / sideB carry the full teams. Falling back to the first player
        // of each keeps every existing 1v1 caller working untouched. THIS IS THE FIX for
        // the defect where a 2v2 stroke match settled only two of the four golfers.
        const sideA = (config.sideA && config.sideA.length) ? config.sideA : [p1];
        const sideB = (config.sideB && config.sideB.length) ? config.sideB : [p2];
        const nameA = sideA.map(p => p.name.split(' ')[0]).join(' / ');
        const nameB = sideB.map(p => p.name.split(' ')[0]).join(' / ');

        if (config.overallMode === 'stroke') {
            // PER-PRESS STAKES. Every segment used to settle at config.overallStake, so a
            // side match pressed for $100 still paid the original $50 - a press could
            // change the holes but never the money, which is the whole point of pressing.
            // The stake is now an argument, defaulting to the original for any press
            // stored without one (every press created before this change).
            function segmentTotals(startHole, segStake) {
                let p1Total = 0, p2Total = 0, holesCompleted = 0, totalHolesInSeg = 0;
                courseData.forEach(h => {
                    if (h.hole < startHole) return;
                    totalHolesInSeg++;
                    const s1 = sideHoleScore(sideA, h.hole, h, config.scoringType, savedScores);
                    const s2 = sideHoleScore(sideB, h.hole, h, config.scoringType, savedScores);
                    if (s1 !== null && s2 !== null) {
                        p1Total += s1;
                        p2Total += s2;
                        holesCompleted++;
                    }
                });
                const stake = (segStake === undefined || segStake === null) ? config.overallStake : segStake;
                const roundComplete = holesCompleted === totalHolesInSeg && totalHolesInSeg > 0;
                let winner = null, money = 0;
                if (roundComplete) {
                    if (p1Total < p2Total) { winner = nameA; money = stake; }
                    else if (p2Total < p1Total) { winner = nameB; money = stake; }
                }
                const segP1Money = winner === nameA ? money : (winner === nameB ? -money : 0);
                return { startHole, stake, p1Total, p2Total, holesCompleted, totalHoles: totalHolesInSeg,
                         roundComplete, winner, p1Money: segP1Money, nameA, nameB,
                         endHole: courseData.length ? courseData[courseData.length - 1].hole : startHole };
            }

            const base = segmentTotals(courseData.length > 0 ? Math.min(...courseData.map(h => h.hole)) : 1);
            const pressSegs = (presses || []).slice()
                .sort((a, b) => a.startHole - b.startHole)
                .map((pr, i) => Object.assign(segmentTotals(pr.startHole, pr.stake), { pressNum: i + 1 }));

            let p1Money = base.p1Money;
            pressSegs.forEach(seg => { p1Money += seg.p1Money; });

            return {
                p1, p2, mode: 'stroke', base, pressSegs, p1Money,
                p1Total: base.p1Total, p2Total: base.p2Total, holesCompleted: base.holesCompleted, totalHoles: base.totalHoles, roundComplete: base.roundComplete, winner: base.winner
            };
        } else {
            function matchStatusFromHole(startHole) {
                let status = 0;
                courseData.forEach(h => {
                    if (h.hole < startHole) return;
                    const s1 = sideHoleScore(sideA, h.hole, h, config.scoringType, savedScores);
                    const s2 = sideHoleScore(sideB, h.hole, h, config.scoringType, savedScores);
                    if (s1 !== null && s2 !== null) {
                        if (s1 < s2) status += 1;
                        else if (s2 < s1) status -= 1;
                    }
                });
                return status;
            }

            const baseStatus = matchStatusFromHole(1);
            const pressResults = (presses || []).slice().sort((a, b) => a.startHole - b.startHole).map((pr, i) => ({ startHole: pr.startHole, status: matchStatusFromHole(pr.startHole), pressNum: i + 1 }));

            let p1Money = 0;
            if (baseStatus > 0) p1Money += config.overallStake;
            else if (baseStatus < 0) p1Money -= config.overallStake;
            pressResults.forEach(pr => {
                if (pr.status > 0) p1Money += config.overallStake;
                else if (pr.status < 0) p1Money -= config.overallStake;
            });

            return { p1, p2, mode: 'match', baseStatus, pressResults, p1Money };
        }
    }

    // Settles ONE game from getRoundGames() and returns { playerId: net }.
    //
    // Skins and Hi-Lo are dispatched directly because computeRoundMoneyByPlayer does
    // not handle them (a long-standing, documented gap). Everything else goes through
    // that canonical dispatcher untouched. No new golf math lives here - this function
    // only chooses which existing engine to call.
    function computeGameNetByPlayerId(game, courseData, savedScores) {
        const cfg = game.config;
        const out = {};

        // A game added mid-round only covers holes from its start hole onward. The
        // engines are not taught about ranges - they are simply handed a shorter hole
        // list, exactly as calculateStrokePressSet has always done for presses. For a
        // Skins wager over H5-18 that means 14 holes IS its whole round: units, carries,
        // pot share and the played-hole proration all scale to the wager's own range
        // rather than to an 18-hole round it was never part of.
        const holes = (typeof gameHoles === 'function') ? gameHoles(game, courseData) : courseData;

        if (game.format === 'skins') {
            return computeSkinsSettlementNet(cfg, holes, savedScores);
        }
        if (game.format === 'hilo') {
            return computeHiLoSettlementNet(cfg, holes, savedScores);
        }

        const result = computeRoundMoneyByPlayer(cfg, holes, savedScores);
        if (!result.valid) return out;
        result.players.forEach(p => { out[p.id] = p.net || 0; });
        return out;
    }


    // ========================================================================
    // THE RECEIPT — per-match breakdown
    //
    // Returns the STORY behind each side match: the original wager, every press with
    // its start hole and stake, who won each segment, and the match net. Settlement
    // itself already knew all of this; it just threw it away and kept the total, which
    // is why nobody could answer "why do I owe Marty $200?".
    //
    // NO NEW MATHEMATICS. Every figure comes from calculateOverallBetEngine and
    // calculateHoleBetEngine - the same calls computeCombinedNetTotals makes. If a
    // number here ever disagreed with settlement, it would be a bug in this function,
    // not a second opinion about the money.
    // ========================================================================
    function buildSideMatchReceipts(data, courseData, savedScores) {
        const allPlayers = (data.players || []);
        const sideMatches = data.sideMatches || {};
        const receipts = [];

        Object.keys(sideMatches).forEach(matchId => {
            const sm = sideMatches[matchId];
            const teamA = allPlayers.filter(p => (sm.teamAIds || []).map(String).includes(String(p.id)));
            const teamB = allPlayers.filter(p => (sm.teamBIds || []).map(String).includes(String(p.id)));
            if (teamA.length === 0 || teamB.length === 0) return;

            const nameA = teamA.map(p => p.name.split(' ')[0]).join(' / ');
            const nameB = teamB.map(p => p.name.split(' ')[0]).join(' / ');
            const isTeam = teamA.length > 1 || teamB.length > 1;
            // The Receipt must describe the holes this wager was actually settled over,
            // or a mid-round match would print "Holes 1-18" beside money that only ever
            // came from holes 6 onward.
            const smCourse = (typeof sideMatchHoles === 'function')
                ? sideMatchHoles(sm, courseData)
                : ((sm.startHole || 1) > 1 ? courseData.filter(h => h.hole >= sm.startHole) : courseData);
            const firstHole = smCourse.length ? Math.min.apply(null, smCourse.map(h => h.hole)) : 1;
            const lastHole = smCourse.length ? Math.max.apply(null, smCourse.map(h => h.hole)) : 18;

            const receipt = {
                matchId, nameA, nameB, isTeam,
                teamA: teamA.map(p => p.name), teamB: teamB.map(p => p.name),
                format: sm.format === 'stroke' ? 'Stroke Play' : (sm.format === 'nassau' ? 'Nassau' : 'Match Play'),
                scoring: (sm.scoring || 'net') === 'net' ? 'Net' : 'Gross',
                segments: [], net: 0, netTo: null
            };

            if (sm.format === 'stroke') {
                const sides = { sideA: teamA, sideB: teamB };
                const cfg = Object.assign({
                    overallEnabled: (sm.overallStake || 0) > 0,
                    overallStake: sm.overallStake || 0,
                    overallMode: sm.overallMode || 'stroke',
                    scoringType: sm.scoring || 'net'
                }, sides);
                const presses = sm.overallPresses ? Object.values(sm.overallPresses) : [];
                const calc = cfg.overallEnabled
                    ? calculateOverallBetEngine([teamA[0], teamB[0]], smCourse, savedScores, cfg, presses)
                    : null;
                if (!calc) return;

                const describe = (seg, label) => {
                    const margin = Math.abs(seg.p1Total - seg.p2Total);
                    let result;
                    if (!seg.roundComplete) result = 'Not finished';
                    else if (!seg.winner) result = 'Tied \u2014 push';
                    else result = `${seg.winner} by ${margin} stroke${margin === 1 ? '' : 's'}`;
                    return {
                        label,
                        startHole: seg.startHole,
                        endHole: seg.endHole !== undefined ? seg.endHole : lastHole,
                        stake: seg.stake,
                        result,
                        winner: seg.roundComplete ? seg.winner : null,
                        money: Math.abs(seg.p1Money),
                        toSideA: seg.p1Money > 0
                    };
                };

                receipt.segments.push(describe(calc.base, 'Original'));
                (calc.pressSegs || []).forEach((seg, i) =>
                    receipt.segments.push(describe(seg, `Press ${i + 1}`)));
                receipt.net = calc.p1Money;
            } else {
                // Match Play / Nassau: the engine reports its own segments and presses.
                const virtual = teamA.map(p => Object.assign({}, p, { team: 'Team 1' }))
                    .concat(teamB.map(p => Object.assign({}, p, { team: 'Team 2' })));
                const presses = sm.presses ? Object.values(sm.presses) : [];
                const calc = calculateMatchEngine(virtual, smCourse, savedScores,
                    sm.scoring || 'net', sm.format, sm.pressRule || 'none', sm.stake || 0, 0, presses);
                if (!calc) return;
                (calc.activeMatches || []).forEach(m => {
                    receipt.segments.push({
                        label: m.pressNum > 0 ? `Press ${m.pressNum}` : (m.label || 'Original'),
                        // A Nassau's F9/B9 windows are fixed at 1-9 and 10-18 by the engine -
                        // they are scoring BOUNDS, not the holes played. On a side match that
                        // starts mid-round the two differ: a Nassau struck on the 9th tee has
                        // a "Front 9" consisting of exactly hole 9. The money already reflects
                        // that, because the engine only ever saw the scoped holes; printing
                        // the raw window said "H1-9" beside it and invited an argument about
                        // whether the front nine counted. Clamped to what was actually played.
                        startHole: Math.max(m.startHole, firstHole),
                        endHole: Math.min(m.endHole, lastHole),
                        stake: sm.stake || 0,
                        result: m.closed && m.finalResult ? m.finalResult
                            : (m.status === 0 ? 'All square' : `${m.status > 0 ? calc.t1Name : calc.t2Name} ${Math.abs(m.status)} up`),
                        winner: m.closed ? (m.status > 0 ? calc.t1Name : (m.status < 0 ? calc.t2Name : null)) : null,
                        money: sm.stake || 0,
                        toSideA: m.status > 0
                    });
                });
                receipt.net = calc.t1TotalMoney;
            }

            receipt.netTo = receipt.net > 0 ? nameA : (receipt.net < 0 ? nameB : null);
            receipt.netAmount = Math.abs(receipt.net);
            // Per-player money, so a 2v2 receipt can state what each golfer owes rather
            // than leaving them to divide a team figure.
            receipt.perPlayerA = teamA.length ? receipt.net / teamA.length : 0;
            receipt.perPlayerB = teamB.length ? -receipt.net / teamB.length : 0;
            receipts.push(receipt);
        });

        return receipts;
    }

    function computeCombinedNetTotals(data, courseData, savedScores) {
        const netByName = {}; // lowercased key -> { name, net }
        function addAmount(player, amount) {
            if (!player || !amount) return;
            const key = player.name.trim().toLowerCase();
            if (!netByName[key]) netByName[key] = { name: player.name, net: 0 };
            netByName[key].net += amount;
        }

        const allPlayers = data.players || [];

        // Every game this round is playing — the main game plus any additional games
        // stacked on top of it. getRoundGames() in action-model.js normalises a legacy
        // single-gameFormat round to a one-item list, so this loop settles old and new
        // rounds through exactly the same path.
        //
        // Each game is settled by the SAME engines that have always settled it; only the
        // config handed in differs. Adding a game therefore cannot change what any other
        // game pays, and the zero-sum guarantee of each engine composes: a sum of
        // zero-sum results is itself zero-sum.
        getRoundGames(data).forEach(game => {
            const gameNet = computeGameNetByPlayerId(game, courseData, savedScores);
            Object.keys(gameNet).forEach(pid => {
                const p = allPlayers.find(pl => String(pl.id) === String(pid));
                addAmount(p, gameNet[pid]);
            });
        });

        // Birdie pool
        const birdieTotals = calculateBirdieGameTotalsForSettle(data, courseData, savedScores);
        Object.keys(birdieTotals).forEach(pid => {
            const p = allPlayers.find(pl => String(pl.id) === String(pid));
            addAmount(p, birdieTotals[pid]);
        });


        // Legacy KP money, for historical rounds only (see the note on the function).
        // A round created today has no kpGameEnabled flag, so this contributes nothing.
        const kpResult = calculateKPGameTotalsForSettle(data, courseData);
        Object.keys(kpResult.money || {}).forEach(pid => {
            const p = allPlayers.find(pl => String(pl.id) === String(pid));
            addAmount(p, kpResult.money[pid]);
        });

        // Side matches — same logic buildSideMatchesHtml already uses per match, just summed
        // into the combined total instead of only shown in its own separate card. Team-based
        // (2v2) matches split evenly between teammates, matching the same convention Trip
        // Mode's money settlement already uses for team-level bets.
        const sideMatches = data.sideMatches || {};
        Object.keys(sideMatches).forEach(matchId => {
            const sm = sideMatches[matchId];
            const teamAPlayers = allPlayers.filter(p => (sm.teamAIds || []).includes(String(p.id)) || (sm.teamAIds || []).includes(p.id));
            const teamBPlayers = allPlayers.filter(p => (sm.teamBIds || []).includes(String(p.id)) || (sm.teamBIds || []).includes(p.id));
            const virtualPlayers = teamAPlayers.map(p => ({ ...p, team: "Team 1" })).concat(teamBPlayers.map(p => ({ ...p, team: "Team 2" })));
            if (virtualPlayers.length < 2) return;

            // A side match only counts holes from its own start hole forward. A match
            // with no startHole - every one saved before this existed - covers the whole
            // round, so nothing already settled moves. The engines are untouched: they
            // are simply handed the holes this wager is played over.
            const smCourse = (typeof sideMatchHoles === 'function')
                ? sideMatchHoles(sm, courseData)
                : ((sm.startHole || 1) > 1 ? courseData.filter(h => h.hole >= sm.startHole) : courseData);

            if (sm.format === 'stroke') {
                const p1 = teamAPlayers[0], p2 = teamBPlayers[0];
                if (!p1 || !p2) return;
                // REGRESSION FIX: this used to pass only [p1, p2], so a 2v2 stroke match
                // settled two golfers and silently dropped the other two - money that was
                // not zero-sum. The whole side goes to the engine now.
                const sides = { sideA: teamAPlayers, sideB: teamBPlayers };
                const holeConfig = Object.assign({ holeEnabled: (sm.holeStake || 0) > 0, holeStake: sm.holeStake || 0, segment: sm.segment || 'full', tieRule: sm.tieRule || 'carry', scoringType: sm.scoring || 'net' }, sides);
                const overallConfig = Object.assign({ overallEnabled: (sm.overallStake || 0) > 0, overallStake: sm.overallStake || 0, overallMode: sm.overallMode || 'stroke', scoringType: sm.scoring || 'net' }, sides);
                const holePresses = sm.holePresses ? Object.values(sm.holePresses) : [];
                const overallPresses = sm.overallPresses ? Object.values(sm.overallPresses) : [];
                const holeCalc = holeConfig.holeEnabled ? calculateHoleBetEngine([p1, p2], smCourse, savedScores, holeConfig, holePresses) : null;
                const overallCalc = overallConfig.overallEnabled ? calculateOverallBetEngine([p1, p2], smCourse, savedScores, overallConfig, overallPresses) : null;
                const sideTotal = (holeCalc ? holeCalc.p1Money : 0) + (overallCalc ? overallCalc.p1Money : 0);
                // The stake is PER SIDE, split evenly between teammates - the same
                // convention 2v2 Match Play and Nassau have always used below.
                const aShare = sideTotal / teamAPlayers.length;
                const bShare = -sideTotal / teamBPlayers.length;
                teamAPlayers.forEach(p => addAmount(p, aShare));
                teamBPlayers.forEach(p => addAmount(p, bShare));
            } else {
                const manualPresses = sm.presses ? Object.values(sm.presses) : [];
                const calc = calculateMatchEngine(virtualPlayers, smCourse, savedScores, sm.scoring || 'net', sm.format, sm.pressRule || 'none', sm.stake || 0, 0, manualPresses);
                if (!calc) return;
                const t1Share = calc.t1TotalMoney / teamAPlayers.length;
                const t2Share = -calc.t1TotalMoney / teamBPlayers.length;
                teamAPlayers.forEach(p => addAmount(p, t1Share));
                teamBPlayers.forEach(p => addAmount(p, t2Share));
            }
        });

        // WHOLE-DOLLAR SETTLEMENT.
        //
        // Every engine above keeps full precision - skins pots divide by the field, 2v2
        // stakes halve, presses stack - and that precision is correct. But golfers do not
        // hand each other 74 cents on the 18th green, and "you owe me $50.74" is not a
        // sentence anyone wants to say.
        //
        // Rounding happens exactly once, HERE, after every wager has been combined.
        // Rounding each bet on the way in would change the math; rounding the final
        // position does not - it only decides how the last dollar falls.
        const wholeDollar = roundNetTotalsToWholeDollars(netByName);

        const netTotals = {};
        Object.values(wholeDollar).forEach(v => { netTotals[v.name] = v.net; });
        // Who Pays Who runs from the ROUNDED balances, so a transaction can never carry
        // cents the ledger above it does not show.
        return { netByName: wholeDollar, exact: netByName, transactions: simplifyDebts(netTotals) };
    }

    // Largest-remainder allocation. Rounding each balance independently can leave the
    // table $1 up or $1 down - money invented or destroyed - so any drift is pushed onto
    // the players whose own rounding moved furthest, which is the fairest place for it.
    //
    // Deterministic: ties break on name, so the same round always produces the same
    // answer on every device and every render.
    function roundNetTotalsToWholeDollars(netByName) {
        const keys = Object.keys(netByName);
        if (keys.length === 0) return netByName;

        const rows = keys.map(k => {
            const exact = netByName[k].net;
            const rounded = Math.round(exact);
            return { key: k, name: netByName[k].name, exact, rounded, drift: rounded - exact };
        });

        let total = rows.reduce((s, r) => s + r.rounded, 0);

        // total > 0 means we handed out a dollar nobody won; < 0 means one went missing.
        while (Math.abs(total) > 0.0001) {
            const takeAway = total > 0;
            const candidates = rows.filter(r => {
                if (takeAway) {
                    // Never turn a winner into a loser, or push someone below zero who
                    // did not lose anything.
                    return r.rounded - 1 >= Math.min(0, Math.floor(r.exact));
                }
                return r.rounded + 1 <= Math.max(0, Math.ceil(r.exact));
            });
            const pool = candidates.length > 0 ? candidates : rows;

            // Whoever gained most from rounding gives the dollar back, and vice versa.
            pool.sort((a, b) => takeAway
                ? (b.drift - a.drift) || a.name.localeCompare(b.name)
                : (a.drift - b.drift) || a.name.localeCompare(b.name));

            const target = pool[0];
            target.rounded += takeAway ? -1 : 1;
            target.drift = target.rounded - target.exact;
            total += takeAway ? -1 : 1;
        }

        const out = {};
        rows.forEach(r => { out[r.key] = { name: r.name, net: r.rounded }; });
        return out;
    }
