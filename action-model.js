// ============================================================================
// GolfApp — Action Model (composition layer)
//
// Answers one question: "what money games is this round actually playing?"
//
// It contains NO golf mathematics. Not one stroke, not one dollar is computed
// here. Every game it describes is handed straight to the existing, already-tested
// engines. This file only decides WHICH games run and WHAT config each one gets —
// composition changes, golf math does not.
//
// WHY THIS EXISTS
// The app used to carry a single `gameFormat` string, so a round could play a
// Nassau OR skins OR junk, never all three. Real groups stack action: "$20 Nassau,
// $5 skins, $2 junk, and Marty and John have $50 on the side." Every engine needed
// for that already existed and was zero-sum; they simply could not coexist.
//
// THE TRICK THAT MAKES THIS CHEAP
// Every settlement function already reads its own configuration off `data` and
// shares one signature: fn(data, courseData, savedScores). So an additional game is
// just a shallow copy of `data` with a different gameFormat and that game's config
// merged in. No engine is modified, and every existing parity test keeps protecting
// them exactly as before.
//
// BACKWARD COMPATIBILITY
// A legacy round — `gameFormat: 'nassau'` and nothing else — normalises to a
// one-item list. The old shape IS the single-game case of the new shape, so there
// is nothing to migrate and no second architecture to maintain.
//
// Plain global functions, no module system, matching the rest of the codebase.
// ============================================================================

// Which formats can genuinely run ALONGSIDE a main game.
//
// This is a golf judgement, not a technical one. An engine existing is not a reason
// to allow a combination. Skins and junk are the classic add-ons — every group plays
// them on top of something else. Stableford is a points competition that happily
// coexists. Deliberately EXCLUDED:
//   - wolf     : rotates a wolf through the tee order and defines the whole round;
//                you do not play Wolf "on top of" a Nassau.
//   - hilo     : IS a team-vs-team match. Running it beside a Nassau would be two
//                contradictory team matches over the same holes.
//   - match / nassau / stroke / bestball / scramble / ryder : these ARE the main game.
const ADDITIONAL_GAME_CATALOG = {
    skins: {
        label: 'Skins',
        icon: '\uD83E\uDD69',
        blurb: 'Low score on a hole wins the skin. Ties carry over.',
        stakeField: 'skinsBuyIn',
        stakeLabel: 'Buy-in per player',
        defaults: { skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross', skinsPotFormat: 'split' }
    },
    dots: {
        label: 'Dots / Junk',
        icon: '\uD83D\uDD34',
        blurb: 'Greenies, sandies, birdies, snakes — a dollar a dot.',
        stakeField: 'dotPointVal',
        stakeLabel: 'Per dot',
        defaults: { dotPointVal: 2 }
    },
    stableford: {
        label: 'Stableford',
        icon: '\uD83C\uDFAF',
        blurb: 'Points per hole. Aggressive play pays.',
        stakeField: 'stablefordPointVal',
        stakeLabel: 'Per point',
        defaults: { stablefordPointVal: 1, stablefordScoring: 'net' }
    }
};

const MAIN_GAME_LABELS = {
    stroke: 'Stroke Play',
    match: 'Match Play',
    nassau: 'Nassau',
    bestball: '2-Man Best Ball',
    scramble: 'Scramble',
    ryder: 'Ryder Cup',
    hilo: 'Hi-Lo',
    wolf: 'Wolf',
    stableford: 'Stableford',
    skins: 'Skins',
    dots: 'Dots / Junk'
};

function isAdditionalGameFormat(format) {
    return Object.prototype.hasOwnProperty.call(ADDITIONAL_GAME_CATALOG, format);
}

// The main game's headline stake, in whatever field that format happens to use.
// Purely for display — nothing downstream settles from this number.
function mainGameStake(data) {
    const holeBet = data.holeBetStake || 0;
    switch (data.gameFormat) {
        case 'nassau': return holeBet > 0 ? holeBet : (data.nassauStake || 0);
        case 'match':
        case 'bestball':
        case 'scramble':
        case 'ryder': return holeBet > 0 ? holeBet : (data.matchStake || 0);
        case 'skins': return data.skinsBuyIn || 0;
        case 'dots': return data.dotPointVal || 0;
        case 'wolf': return data.wolfPointVal || 0;
        case 'stableford': return data.stablefordPointVal || 0;
        case 'hilo': return holeBet || 0;
        default: return 0;
    }
}

// ---------------------------------------------------------------------------
// getRoundGames — THE normalized answer to "what are we playing today?"
//
// Returns, in display order: the main game first, then any additional games.
// Every entry carries a ready-to-use `config` that can be passed straight to an
// existing engine. Side Matches, the Birdie Pool and KPs are NOT here — they have
// their own established paths through settlement and are unaffected by this work.
// ---------------------------------------------------------------------------
function getRoundGames(data) {
    if (!data) return [];
    const mainFormat = data.gameFormat || 'stroke';
    const games = [];

    games.push({
        key: 'main',
        format: mainFormat,
        role: 'main',
        label: MAIN_GAME_LABELS[mainFormat] || mainFormat,
        stake: mainGameStake(data),
        // The main game's config is the round data itself, untouched. This is what
        // keeps every legacy round behaving byte-for-byte as it always has.
        config: data,
        startHole: 1
    });

    const additional = data.additionalGames || {};
    Object.keys(ADDITIONAL_GAME_CATALOG).forEach(format => {
        const cfg = additional[format];
        if (!cfg || cfg.enabled === false) return;
        // A round cannot play the same game twice. If skins is already the main game,
        // an additional skins entry is ignored rather than double-counted.
        if (format === mainFormat) return;

        const spec = ADDITIONAL_GAME_CATALOG[format];
        const merged = Object.assign({}, data, spec.defaults, cfg, { gameFormat: format });
        // additionalGames must never leak into a nested game's own view of the round,
        // or a game could recursively re-add its siblings.
        delete merged.additionalGames;
        delete merged.enabled;
        delete merged.startHole;

        games.push({
            key: format,
            format: format,
            role: 'additional',
            label: spec.label,
            icon: spec.icon,
            stake: merged[spec.stakeField] || 0,
            config: merged,
            // Carried from day one so a future "added on hole 5" game has somewhere to
            // live. NOT yet honoured by any scoring path - every game currently covers
            // the whole round - but the field exists so adding ranges later is a change
            // to the engines' inputs rather than a schema migration.
            startHole: cfg.startHole || 1
        });
    });

    return games;
}

// True when this round is playing more than one game — the cheap check UI can use
// before deciding whether to render a stacked view at all.
function roundHasStackedAction(data) {
    return getRoundGames(data).length > 1;
}

// Human summary for Round Ready and the scorecard, e.g. "Skins \u00B7 $5".
function describeGame(game) {
    if (!game) return '';
    if (game.stake > 0) return `${game.label} \u00B7 $${game.stake}`;
    return game.label;
}

// Rejects nonsensical or contradictory setups BEFORE a round is saved, so a bad
// combination can never reach the money engines in the first place.
function validateRoundGames(data) {
    const problems = [];
    const mainFormat = (data && data.gameFormat) || 'stroke';
    const additional = (data && data.additionalGames) || {};

    Object.keys(additional).forEach(format => {
        const cfg = additional[format];
        if (!cfg || cfg.enabled === false) return;
        if (!isAdditionalGameFormat(format)) {
            problems.push(`${MAIN_GAME_LABELS[format] || format} can only be played as the main game.`);
            return;
        }
        if (format === mainFormat) {
            problems.push(`${ADDITIONAL_GAME_CATALOG[format].label} is already the main game.`);
            return;
        }
        const spec = ADDITIONAL_GAME_CATALOG[format];
        const stake = cfg[spec.stakeField];
        if (stake !== undefined && (isNaN(parseFloat(stake)) || parseFloat(stake) < 0)) {
            problems.push(`${spec.label} needs a dollar amount of $0 or more.`);
        }
    });

    return { valid: problems.length === 0, problems };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ADDITIONAL_GAME_CATALOG, MAIN_GAME_LABELS, isAdditionalGameFormat,
        mainGameStake, getRoundGames, roundHasStackedAction, describeGame, validateRoundGames
    };
}
