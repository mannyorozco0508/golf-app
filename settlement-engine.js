// ============================================================================
// GolfApp — Settlement Engine (CANONICAL)
//
// The complete money picture for ONE finished round: the main game, plus Skins,
// Hi-Lo, the Birdie Pool, KPs, and every Side Match. computeCombinedNetTotals()
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
        const allPlayers = (data.players || []).filter(p => p.playingForMoney !== false);
        const potFormat = data.skinsPotFormat || 'split';
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

        let netByPlayerId = {};
        allPlayers.forEach(p => { netByPlayerId[p.id] = payout[p.id] - buyIn; });
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

    function calculateHoleBetEngine(players, courseData, savedScores, config, presses) {
        if (!config || config.holeEnabled === false || players.length < 2) return null;
        const p1 = players[0], p2 = players[1];
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
                const s1 = getRichHoleBetScore(p1, h.hole, h, config.scoringType, savedScores);
                const s2 = getRichHoleBetScore(p2, h.hole, h, config.scoringType, savedScores);
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

        if (config.overallMode === 'stroke') {
            function segmentTotals(startHole) {
                let p1Total = 0, p2Total = 0, holesCompleted = 0, totalHolesInSeg = 0;
                courseData.forEach(h => {
                    if (h.hole < startHole) return;
                    totalHolesInSeg++;
                    const s1 = getRichHoleBetScore(p1, h.hole, h, config.scoringType, savedScores);
                    const s2 = getRichHoleBetScore(p2, h.hole, h, config.scoringType, savedScores);
                    if (s1 !== null && s2 !== null) {
                        p1Total += s1;
                        p2Total += s2;
                        holesCompleted++;
                    }
                });
                const roundComplete = holesCompleted === totalHolesInSeg && totalHolesInSeg > 0;
                let winner = null, money = 0;
                if (roundComplete) {
                    if (p1Total < p2Total) { winner = p1.name; money = config.overallStake; }
                    else if (p2Total < p1Total) { winner = p2.name; money = config.overallStake; }
                }
                const segP1Money = winner === p1.name ? money : (winner === p2.name ? -money : 0);
                return { startHole, p1Total, p2Total, holesCompleted, totalHoles: totalHolesInSeg, roundComplete, winner, p1Money: segP1Money };
            }

            const base = segmentTotals(courseData.length > 0 ? Math.min(...courseData.map(h => h.hole)) : 1);
            const pressSegs = (presses || []).slice().sort((a, b) => a.startHole - b.startHole).map((pr, i) => Object.assign(segmentTotals(pr.startHole), { pressNum: i + 1 }));

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
                    const s1 = getRichHoleBetScore(p1, h.hole, h, config.scoringType, savedScores);
                    const s2 = getRichHoleBetScore(p2, h.hole, h, config.scoringType, savedScores);
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

    function computeCombinedNetTotals(data, courseData, savedScores) {
        const netByName = {}; // lowercased key -> { name, net }
        function addAmount(player, amount) {
            if (!player || !amount) return;
            const key = player.name.trim().toLowerCase();
            if (!netByName[key]) netByName[key] = { name: player.name, net: 0 };
            netByName[key].net += amount;
        }

        const allPlayers = data.players || [];
        const gameFormat = data.gameFormat || 'stroke';

        // Main game — reuses the same canonical dispatcher every other format in the app relies
        // on, EXCEPT Skins and Hi-Lo, which that dispatcher doesn't handle (confirmed gap, filled
        // above using each format's own already-established formula, not new math).
        if (gameFormat === 'skins') {
            const skinsNet = computeSkinsSettlementNet(data, courseData, savedScores);
            Object.keys(skinsNet).forEach(pid => {
                const p = allPlayers.find(pl => String(pl.id) === String(pid));
                addAmount(p, skinsNet[pid]);
            });
        } else if (gameFormat === 'hilo') {
            const hiloNet = computeHiLoSettlementNet(data, courseData, savedScores);
            Object.keys(hiloNet).forEach(pid => {
                const p = allPlayers.find(pl => String(pl.id) === String(pid));
                addAmount(p, hiloNet[pid]);
            });
        } else {
            const mainResult = computeRoundMoneyByPlayer(data, courseData, savedScores);
            if (mainResult.valid) {
                mainResult.players.forEach(p => addAmount(p, p.net || 0));
            }
        }

        // Birdie pool
        const birdieTotals = calculateBirdieGameTotalsForSettle(data, courseData, savedScores);
        Object.keys(birdieTotals).forEach(pid => {
            const p = allPlayers.find(pl => String(pl.id) === String(pid));
            addAmount(p, birdieTotals[pid]);
        });


        // KP / Dollar Game
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

            if (sm.format === 'stroke') {
                const p1 = teamAPlayers[0], p2 = teamBPlayers[0];
                if (!p1 || !p2) return;
                const holeConfig = { holeEnabled: (sm.holeStake || 0) > 0, holeStake: sm.holeStake || 0, segment: sm.segment || 'full', tieRule: sm.tieRule || 'carry', scoringType: sm.scoring || 'net' };
                const overallConfig = { overallEnabled: (sm.overallStake || 0) > 0, overallStake: sm.overallStake || 0, overallMode: sm.overallMode || 'stroke', scoringType: sm.scoring || 'net' };
                const holePresses = sm.holePresses ? Object.values(sm.holePresses) : [];
                const overallPresses = sm.overallPresses ? Object.values(sm.overallPresses) : [];
                const holeCalc = holeConfig.holeEnabled ? calculateHoleBetEngine([p1, p2], courseData, savedScores, holeConfig, holePresses) : null;
                const overallCalc = overallConfig.overallEnabled ? calculateOverallBetEngine([p1, p2], courseData, savedScores, overallConfig, overallPresses) : null;
                const p1Total = (holeCalc ? holeCalc.p1Money : 0) + (overallCalc ? overallCalc.p1Money : 0);
                addAmount(p1, p1Total);
                addAmount(p2, -p1Total);
            } else {
                const manualPresses = sm.presses ? Object.values(sm.presses) : [];
                const calc = calculateMatchEngine(virtualPlayers, courseData, savedScores, sm.scoring || 'net', sm.format, sm.pressRule || 'none', sm.stake || 0, 0, manualPresses);
                if (!calc) return;
                const t1Share = calc.t1TotalMoney / teamAPlayers.length;
                const t2Share = -calc.t1TotalMoney / teamBPlayers.length;
                teamAPlayers.forEach(p => addAmount(p, t1Share));
                teamBPlayers.forEach(p => addAmount(p, t2Share));
            }
        });

        const netTotals = {};
        Object.values(netByName).forEach(v => { netTotals[v.name] = v.net; });
        return { netByName, transactions: simplifyDebts(netTotals) };
    }
