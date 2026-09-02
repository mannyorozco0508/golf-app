// ============================================================================
// GolfApp — Hole Events
//
// Answers one question: "what actually just happened because that hole finished?"
//
// NO MONEY MATHEMATICS LIVE HERE. Every figure comes from the canonical engines
// via bet-strip.js and action-model.js. This file only compares two states and
// describes the difference in golf language.
//
// HOW THE DIFF WORKS — and why it is safe
// The state before the hole is not remembered; it is RECONSTRUCTED, by rebuilding
// the whole action model from the same raw scores with that hole's entries removed.
// Everything falls out of that one decision:
//
//   * Multi-device: it does not matter which phone entered which score. Any device
//     looking at the same Firebase state derives the same events.
//   * Firebase re-renders: the listener can fire five times and produce five
//     identical answers, so nothing is counted twice.
//   * Score corrections: correct hole 7 and the hole 7 recap simply recomputes.
//     No outcome is ever stored as historical truth independent of the scores.
//
// The only thing held in memory is which events a golfer has already SEEN, purely
// to decide whether to emphasise them. No money depends on it.
// ============================================================================

// Deterministic ordering, so the same hole never renders its events in a different
// order twice. Lower sorts first.
const EVENT_PRIORITY = {
    WAGER_FINAL: 10,
    PRESS_STARTED: 20,
    SKIN_WON: 30,
    LEAD_CHANGE: 40,
    MATCH_TIED: 45,
    BIRDIE: 50,
    DOTS: 60,
    SKINS_CARRIED: 70
};

// The state as it stood BEFORE this hole: every score on an earlier hole, and
// nothing else.
//
// It has to be earlier holes only, not merely "this hole removed". Stripping just
// hole 5 from a card that also has hole 6 leaves hole 6's tie still building the
// skins carry, so the "before" would already contain a carry that hole 5 caused -
// and the recap would report no change. Cutting at the hole boundary reconstructs
// the moment the group actually stood on that tee.
//
// A copy; the real scores are never mutated.
function scoresBeforeHole(savedScores, hole) {
    const out = {};
    Object.keys(savedScores || {}).forEach(k => {
        const m = /_h(\d+)$/.exec(k);
        if (m && parseInt(m[1], 10) < hole) out[k] = savedScores[k];
    });
    return out;
}

// A hole is complete when every player who is in the round has posted on it. The
// same rule the rest of the app already trusts: a skin cannot be announced before
// everyone in it has a score.
function isHoleComplete(players, hole, savedScores) {
    if (!players || players.length === 0) return false;
    return players.every(p => {
        const v = (savedScores || {})[`p${p.id}_h${hole}`];
        return v && v > 0;
    });
}

// The state as of the END of this hole. Equally important: without it, "now" would
// be the whole card, so replaying hole 5's recap after hole 7 had been entered would
// describe hole 7's world. Both sides of the comparison are cut at the same boundary.
function scoresThroughHole(savedScores, hole) {
    const out = {};
    Object.keys(savedScores || {}).forEach(k => {
        const m = /_h(\d+)$/.exec(k);
        if (m && parseInt(m[1], 10) <= hole) out[k] = savedScores[k];
    });
    return out;
}

function firstName(name) {
    return String(name || '').split(' ')[0];
}

// "You" when it is the golfer holding the phone, otherwise their name. This is what
// turns a correct recap into a personal one.
function nameFor(player, meId) {
    if (!player) return '';
    if (meId && String(player.id) === String(meId)) return 'You';
    return firstName(player.name);
}

// Rewrites a status line the engines produced into second person. Works on whole
// words only, so "Avery/Blake 2 UP" becomes "You/Blake 2 UP" - which keeps the golf
// meaning of a TEAM wager intact. Saying "You 2 UP" there would imply a singles
// match, so the partner's name is deliberately left in place.
function personalize(text, meName) {
    if (!text || !meName) return text;
    return text.replace(new RegExp('(^|[^A-Za-z])' + meName + '(?![A-Za-z])', 'g'), '$1You');
}

function involvesMe(ids, meId) {
    if (!meId) return false;
    return (ids || []).some(id => String(id) === String(meId));
}

// ---------------------------------------------------------------------------
// buildHoleEvents — the whole point of this file.
// ---------------------------------------------------------------------------
function buildHoleEvents(data, courseData, savedScores, hole, meId, scopedPlayers) {
    const holes = (courseData || []).slice().sort((a, b) => a.hole - b.hole);
    const scores = savedScores || {};
    const players = (scopedPlayers && scopedPlayers.length > 0 ? scopedPlayers : (data.players || []))
        .filter(p => p.playingForMoney !== false);

    if (typeof getRoundGames !== 'function') return [];

    // The field a round-level wager actually depends on - NOT the group on screen.
    const field = (typeof fieldParticipants === 'function')
        ? fieldParticipants(data)
        : players;

    // Nothing at all can be said about a hole this group hasn't finished.
    if (!isHoleComplete(players, hole, scores)) return [];

    const after = scoresThroughHole(scores, hole);
    const before = scoresBeforeHole(scores, hole);
    const events = [];
    const mePlayer = meId ? (data.players || []).find(p => String(p.id) === String(meId)) : null;
    const meName = mePlayer ? firstName(mePlayer.name) : null;

    // One place where every event becomes second person, so no call site can forget.
    const push = (type, icon, rawText, opts) => {
        const text = personalize(rawText, meName);
        events.push(Object.assign({
            type, icon, text,
            priority: EVENT_PRIORITY[type] || 99,
            personal: false,
            key: `${hole}:${type}:${text}`
        }, opts || {}));
    };

    getRoundGames(data).forEach(game => {
        const gameCourse = (typeof gameHoles === 'function') ? gameHoles(game, holes) : holes;
        // A game that hasn't started yet cannot have produced an event on this hole.
        if (!gameCourse.some(h => h.hole === hole)) return;

        // THIS wager's own field, not the round's. A three-golfer skins game inside an
        // eight-golfer round is decided the moment those three post - it must not wait
        // on five golfers who are not in it, and their scores can never change it.
        const gameField = (typeof fieldParticipants === 'function' && game.config)
            ? fieldParticipants(game.config)
            : field;

        // WHOLE-FIELD READINESS. A round-level wager is not knowable until every
        // player in it has posted this hole. Truth beats immediacy: it is better for
        // a skins result to appear a few minutes late than for the app to name a
        // winner while eight golfers are still out on the course.
        if (!participantsCompletedHole(gameField, hole, scores)) {
            // Dots are a record of what a golfer was awarded on this hole, not a
            // contested outcome, so they stay knowable for the players who have posted.
            if (game.format === 'dots') dotsEvents(game, players, hole, meId, push, gameCourse, after);
            return;
        }

        if (game.format === 'skins') {
            skinsEvents(game, gameCourse, after, before, gameField, hole, meId, push);
        } else if (game.format === 'dots') {
            dotsEvents(game, players, hole, meId, push, gameCourse, after);
        } else if (game.format === 'stableford') {
            leaderEvents(game, gameCourse, after, before, gameField, meId, push, 'pts', '\uD83C\uDFAF');
        } else if (game.role === 'main') {
            mainGameEvents(game, gameCourse, after, before, gameField, meId, push);
        }
    });

    birdieEvents(data, holes, scores, players, hole, meId, push);
    sideMatchEvents(data, holes, after, before, players, meId, push, hole);

    // Personal events win ties, so a golfer's own action floats above someone else's
    // at the same priority.
    // A Nassau carries three chips, so a lead flip can produce the same sentence
    // twice. The golfer only needs to be told once.
    const seen = {};
    const unique = events.filter(e => {
        const k = e.type + '|' + e.text;
        if (seen[k]) return false;
        seen[k] = true;
        return true;
    });

    unique.sort((a, b) => (a.priority - b.priority) || (b.personal - a.personal));
    return unique;
}

// ---------------------------------------------------------------------------
function skinsEvents(game, gameCourse, scores, before, players, hole, meId, push) {
    if (typeof skinsState !== 'function') return;
    const now = skinsState(game.config, gameCourse, scores, players);
    const prev = skinsState(game.config, gameCourse, before, players);

    const award = now.awards.find(a => a.hole === hole);
    if (award) {
        const p = players.find(pl => String(pl.id) === String(award.playerId));
        const value = award.units * now.skinValue;
        const who = nameFor(p, meId);
        const verb = who === 'You' ? 'win' : 'wins';
        const money = value > 0 ? ` \u00B7 $${value.toFixed(0)}` : '';
        push('SKIN_WON', '\uD83E\uDD69',
            `${who} ${verb} ${award.units} skin${award.units === 1 ? '' : 's'}${money}`,
            { personal: who === 'You' });
        return;
    }

    // Only report a carry when this hole actually added to it — a pot that was
    // already riding is state, not news.
    if (now.riding > prev.riding && now.riding > 0) {
        const value = now.riding * now.skinValue;
        const money = value > 0 ? ` \u00B7 $${value.toFixed(0)}` : '';
        const next = gameCourse.find(h => h.hole > hole);
        const onHole = next ? ` on Hole ${next.hole}` : '';
        push('SKINS_CARRIED', '\uD83E\uDD69', `${now.riding} riding${money}${onHole}`);
    }
}

// ---------------------------------------------------------------------------
// One compact line per golfer, never one card per dot. Three dots on a hole is a
// good hole, not three separate announcements.
function dotsEvents(game, players, hole, meId, push, gameCourse, scores) {
    const dots = (game.config && game.config.dots) || {};
    const cfg = game.config || {};
    const carryOn = cfg.greenieCarryover === true;

    // What a greenie is worth on THIS hole once carries are applied. Mirrors
    // calcDotsEngine; a missing flag means the old flat rule, same as everywhere else.
    let greenieValue = 1;
    if (carryOn && typeof greenieCarryMap === 'function') {
        try {
            const map = greenieCarryMap(cfg, gameCourse, scores || {}, players).byHole;
            if (map[hole] !== undefined) greenieValue = map[hole];
        } catch (e) { greenieValue = 1; }
    }

    const holeDots = dots[`h${hole}`];
    if (!holeDots) {
        greenieCarriedEvent(cfg, gameCourse, scores, players, hole, carryOn, push);
        return;
    }

    players.forEach(p => {
        const raw = holeDots[`p${p.id}`];
        if (!raw || raw.length === 0) return;
        // A legacy birdie+eagle pair is worth 2, not 3 — same guard as the engine.
        const list = (raw.indexOf('eagle') > -1 && raw.indexOf('birdie') > -1)
            ? raw.filter(d => d !== 'birdie')
            : raw;
        let net = 0;
        list.forEach(d => {
            if (d === 'snake') net -= 1;
            else if (d === 'eagle') net += 2;
            else if (d === 'greenie') net += greenieValue;
            else net += 1;
        });
        if (net === 0) return;
        const who = nameFor(p, meId);
        const label = net > 0
            ? `${who} +${net} dot${net === 1 ? '' : 's'}`
            : `${who} ${net} dot${net === -1 ? '' : 's'}`;
        push('DOTS', '\uD83D\uDD34', label, { personal: who === 'You' });
    });

    greenieCarriedEvent(cfg, gameCourse, scores, players, hole, carryOn, push);
}

// ---------------------------------------------------------------------------
// "$2 riding on Hole 16." A pot the group cannot see is a pot they find out about
// at settlement, which is the worst possible moment. Mirrors SKINS_CARRIED: only
// announced on the hole that actually added to it, because a pot already riding is
// state, not news.
function greenieCarriedEvent(cfg, gameCourse, scores, players, hole, carryOn, push) {
    if (!carryOn || typeof greenieCarryMap !== 'function') return;
    const holeMeta = (gameCourse || []).find(h => parseInt(h.hole, 10) === parseInt(hole, 10));
    if (!holeMeta || parseInt(holeMeta.par, 10) !== 3) return;

    const holeDots = ((cfg.dots || {})[`h${hole}`]) || {};
    const claimed = Object.keys(holeDots).some(k => (holeDots[k] || []).indexOf('greenie') > -1);
    if (claimed) return;

    let map;
    try {
        map = greenieCarryMap(cfg, gameCourse, scores || {}, players);
    } catch (e) { return; }

    // Nothing to say until this hole is finished and the pot has actually moved.
    const complete = (players || []).every(p => {
        const v = (scores || {})[`p${p.id}_h${hole}`];
        return v !== undefined && v !== null && v !== '' && parseInt(v, 10) > 0;
    });
    if (!complete) return;

    const next = (gameCourse || [])
        .filter(h => parseInt(h.par, 10) === 3 && parseInt(h.hole, 10) > parseInt(hole, 10))
        .sort((a, b) => parseInt(a.hole, 10) - parseInt(b.hole, 10))[0];

    const riding = (map.byHole[hole] || 1) + 1;
    const dotVal = parseFloat(cfg.dotPointVal) || 0;
    const money = dotVal > 0 ? ` \u00B7 $${(riding * dotVal).toFixed(0)}` : '';

    if (!next) {
        push('GREENIE_CARRIED', '\u26F3', 'KP unwon \u00B7 nothing carries on');
        return;
    }
    push('GREENIE_CARRIED', '\u26F3',
        `KP carries \u00B7 ${riding} riding${money} on Hole ${next.hole}`);
}

// ---------------------------------------------------------------------------
// Match Play, Nassau and the team formats. Chips come from buildBetStrip, so the
// wording here can never drift from the wording on the row.
function mainGameEvents(game, gameCourse, scores, before, players, meId, push) {
    if (typeof buildBetStrip !== 'function') return;
    let now, prev;
    try {
        now = buildBetStrip(game.config, gameCourse, scores, players);
        prev = buildBetStrip(game.config, gameCourse, before, players);
    } catch (e) { return; }
    if (!now || !now.eligible) return;

    const prevByKey = {};
    (prev.chips || []).forEach(c => { prevByKey[c.key] = c; });

    (now.chips || []).forEach(chip => {
        const was = prevByKey[chip.key];

        // A press that did not exist before this hole - almost always an automatic
        // one, which nobody tapped and would otherwise appear as a silent new wager.
        if (!was && chip.short && chip.short.charAt(0) === 'P') {
            const stake = chip.stake > 0 ? ` \u00B7 $${chip.stake}` : '';
            push('PRESS_STARTED', '\uD83D\uDD25', `Press started${stake}`);
            return;
        }
        if (!was) return;

        if (chip.closed && !was.closed) {
            const label = (chip.detail && chip.detail.title) || chip.short;
            push('WAGER_FINAL', '\uD83D\uDD12', `${label} \u2014 ${chip.statusText}`);
            return;
        }
        if (chip.closed) return;

        // Only a genuine change of who is ahead. "Still 1 UP" after a halved hole is
        // not news, and announcing it every hole is exactly how this becomes noise.
        if (chip.statusText !== was.statusText) {
            const nowLeader = leaderOf(chip.statusText);
            const wasLeader = leaderOf(was.statusText);
            if (nowLeader !== wasLeader) {
                if (nowLeader === null) {
                    push('MATCH_TIED', '\u2694\uFE0F', `Back to ${chip.statusText}`);
                } else {
                    const mine = meId && isMyChip(game, players, meId);
                    push('LEAD_CHANGE', now.mode === 'stroke' ? '\uD83D\uDCC8' : '\u2694\uFE0F',
                        chip.statusText, { personal: !!mine });
                }
            }
        }
    });
}

// Who is ahead according to a status string, or null when nobody is. Deliberately
// text-based: it reads the same strings the golfer sees, so a wording change can
// never silently break event detection.
function leaderOf(statusText) {
    if (!statusText) return null;
    if (/ALL SQUARE|TIED|NOT STARTED/i.test(statusText)) return null;
    const m = /^(\S+)\s/.exec(statusText);
    return m ? m[1] : null;
}

function isMyChip(game, players, meId) {
    return players.some(p => String(p.id) === String(meId));
}

// ---------------------------------------------------------------------------
// Points games: leader changes only. Announcing "earned 2 points" every hole is
// just restating the score.
function leaderEvents(game, gameCourse, scores, before, players, meId, push, unit, icon) {
    if (typeof calcStablefordEngine !== 'function') return;
    const now = calcStablefordEngine(game.config, gameCourse, scores);
    const prev = calcStablefordEngine(game.config, gameCourse, before);
    const top = totals => {
        let best = null;
        players.forEach(p => {
            const v = totals[p.id] || 0;
            if (!best || v > best.v) best = { p, v };
            else if (v === best.v) best.tied = true;
        });
        return best;
    };
    const a = top(prev.totals), b = top(now.totals);
    if (!a || !b || b.v === 0) return;
    if (String(a.p.id) !== String(b.p.id)) {
        const who = nameFor(b.p, meId);
        push('LEAD_CHANGE', icon, `${who} lead${who === 'You' ? '' : 's'} \u00B7 ${b.v} ${unit}`,
            { personal: who === 'You' });
    }
}

// ---------------------------------------------------------------------------
function birdieEvents(data, holes, scores, players, hole, meId, push) {
    const h = holes.find(x => x.hole === hole);
    if (!h || !h.par) return;
    players.forEach(p => {
        const v = scores[`p${p.id}_h${hole}`];
        if (!v || v <= 0) return;
        const under = parseInt(h.par, 10) - parseInt(v, 10);
        if (under < 1) return;
        const who = nameFor(p, meId);
        const label = under >= 3 ? 'albatross' : (under === 2 ? 'eagle' : 'birdie');
        push('BIRDIE', '\uD83D\uDC26', `${who} \u2014 ${label}`, { personal: who === 'You' });
    });
}

// ---------------------------------------------------------------------------
// Side action, with the golfer's own matches marked personal so they sort first.
function sideMatchEvents(data, holes, scores, before, players, meId, push, hole) {
    if (typeof buildBetStrip !== 'function') return;
    const sideMatches = data.sideMatches || {};
    const all = data.players || [];
    const scopedIds = players.map(p => String(p.id));

    Object.keys(sideMatches).forEach(id => {
        const sm = sideMatches[id];
        const ids = (sm.teamAIds || []).concat(sm.teamBIds || []).map(String);
        if (!ids.some(pid => scopedIds.includes(pid))) return;

        const matchPlayers = ids.map(pid => all.find(p => String(p.id) === String(pid))).filter(Boolean);
        if (matchPlayers.length < 2) return;

        // GROUP-LOCAL READINESS. A side match names its own players, so it becomes
        // knowable the moment THEY finish - it must never wait on unrelated groups.
        if (typeof participantsCompletedHole === 'function' &&
            !participantsCompletedHole(matchPlayers, hole, scores)) return;

        // One shared mapper (bet-strip.js), so the recap and the scorecard row can
        // never describe the same match differently.
        const cfg = (typeof sideMatchRoundConfig === 'function')
            ? sideMatchRoundConfig(sm, matchPlayers)
            : sideMatchConfig(sm, matchPlayers);
        if (!cfg) return;

        let now, prev;
        try {
            // cfg.players are the team-tagged copies; passing the untagged originals
            // leaves a match with only one side and yields no chips at all.
            now = buildBetStrip(cfg, holes, scores, cfg.players);
            prev = buildBetStrip(cfg, holes, before, cfg.players);
        } catch (e) { return; }
        if (!now || !now.eligible || now.chips.length === 0) return;

        const chip = now.chips[0], was = (prev.chips || [])[0];
        if (!was) return;

        const mine = involvesMe(ids, meId);
        if (chip.closed && !was.closed) {
            push('WAGER_FINAL', '\uD83D\uDD12', `${chip.statusText}`, { personal: mine });
            return;
        }
        if (chip.statusText !== was.statusText && leaderOf(chip.statusText) !== leaderOf(was.statusText)) {
            push('LEAD_CHANGE', now.mode === 'stroke' ? '\uD83D\uDCC8' : '\u2694\uFE0F',
                chip.statusText, { personal: mine });
        }
    });
}

// Side matches store their own shape; this maps it onto the round shape buildBetStrip
// already understands rather than teaching the presenter a second format.
function sideMatchConfig(sm, matchPlayers) {
    const tagged = matchPlayers.map((p, i) => Object.assign({}, p, {
        team: (sm.teamAIds || []).map(String).includes(String(p.id)) ? 'Team 1' : 'Team 2'
    }));
    if (sm.format === 'stroke') {
        if (tagged.length !== 2) return null;
        return {
            gameFormat: 'match', matchScoringStyle: 'stroke',
            matchScoring: sm.scoring || 'gross',
            matchStake: sm.overallStake || sm.holeStake || 0,
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
        players: tagged
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        EVENT_PRIORITY, scoresBeforeHole, scoresThroughHole, isHoleComplete, nameFor,
        buildHoleEvents, leaderOf, personalize
    };
}
