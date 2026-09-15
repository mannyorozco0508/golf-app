// ============================================================================
// GolfApp — Live skins ledgers (SHARED CORE)
//
// WHICH CONFIG a live skins surface builds its hole ledger FROM. One answer for
// index.html (the scorecard card, the Finish Round list, the hole-by-hole
// mount), leaderboard.html (the live skins board) and settlement.html (LIVE
// RESULTS' SKINS WON cards).
//
// WHY THIS FILE EXISTS. All three surfaces used to call computeSkinsHoleLedger()
// with THE ROUND OBJECT. A round whose only skins money is the Main Pool bucket
// has no skinsPotFormat of its own, so resolveSkinsMode() fell to 'split',
// `net || gross` picked net, and the widget printed NET SKINS with flight
// headers for a pot that is gross and field-wide. A stacked or instance wager
// set to Gross did not change it either: no surface ever read a wager's config.
// Measured on 2026-09-13: a pool-only gross round and a stacked-gross round
// rendered byte-identically on every surface (live_skins_golden_test.js froze
// both), while pool-engine paid Ann H1 and Eli H2 across the field and the
// screen listed Cal 3 / Eli 4 net skins per flight.
//
// THE RULE
//   - One section per skins WAGER the round holds - main format, stacked,
//     instance, the Action-tab field skins (an instance) - built from THAT
//     wager's config: its mode, its carry, its participants, and flights per
//     the round's skins scope (getRoundGames already merges the round under
//     each wager, so `flights` reaches every one).
//   - If the Main Pool skins bucket is on, its own section, from the pool's
//     scoring and carry, over the pool's participants. Flights are kept on it
//     exactly when the round's skins scope is per flight - pool-engine.js
//     splits the bucket into an A pot and a B pot then - and stripped when the
//     bucket is one field-wide pot (flights off, or scope 'field').
//   - Both, when a round has both. Nothing, when a round has no skins money.
//   - The legacy shape - a round with skinsBuyIn > 0 and no wager the game list
//     knows about - keeps rendering from the round, as it always has.
//
// DISPLAY ONLY. Nothing here pays anybody. settlement-engine.js and
// pool-engine.js are untouched by this file; it only decides which config to
// hand the ledger builder, the way the Receipt already did.
//
// NO DEPENDENCIES AT LOAD, NO TOP-LEVEL CODE. Plain globals, read at call time:
// getRoundGames / roundHasSkinsGame / skinsCarriesOver (action-model.js) and
// computeSkinsHoleLedger (settlement-engine.js). Loaded after both.
// ============================================================================

// The configs, in display order: wagers as getRoundGames lists them (main
// first), then the pool bucket. Each: { key, kind: 'wager' | 'pool', label, cfg }.
function liveSkinsLedgerConfigs(data) {
    if (!data) return [];
    const out = [];

    const games = (typeof getRoundGames === 'function') ? getRoundGames(data) : [];
    games.forEach(g => {
        if (!g || g.format !== 'skins' || g.enabled === false || !g.config) return;
        out.push({ key: 'wager:' + g.key, kind: 'wager',
                   label: g.stake > 0 ? '$' + g.stake + ' Skins' : 'Skins', cfg: g.config });
    });

    const mp = data.moneyPool;
    if (mp && mp.enabled && mp.skins && mp.skins.mode && mp.skins.mode !== 'none') {
        // The pool's own participants (pool-engine.js moneyPoolParticipants: its
        // participantIds when narrowed, else every money player - which is what an
        // absent participantIds already means to fieldParticipants).
        const ids = (Array.isArray(mp.participantIds) && mp.participantIds.length > 0) ? mp.participantIds.map(String) : undefined;
        const carry = (typeof skinsCarriesOver === 'function') ? skinsCarriesOver(mp.skins.carryOver) : mp.skins.carryOver === true;
        // THE BUCKET SPLITS BY FLIGHT when the round's skins scope is per flight -
        // pool-engine.js resolves it as two pots then (2026-09-13). The ledger
        // follows the same rule: the round's flights are kept exactly when the
        // resolver says the scope applies, and stripped otherwise, so a field-wide
        // bucket keeps its one ledger and a split one draws A and B.
        const perFlight = (typeof flightScopeApplies === 'function') && flightScopeApplies(data, 'skins');
        out.push({ key: 'pool', kind: 'pool', label: 'Main Pool Skins',
                   cfg: Object.assign({}, data, {
                       participantIds: ids,
                       skinsPotFormat: mp.skins.scoring === 'gross' ? 'gross' : 'net',
                       skinsCarryOver: carry,
                       // The pool's pot is the buy-in's business, not a per-golfer
                       // skins stake; a surface that prices "skinsBuyIn x golfers"
                       // must not invent a number here.
                       skinsBuyIn: 0,
                       flights: perFlight ? data.flights : undefined
                   }) });
    }

    // LEGACY: a round the game list does not see as a skins game but that carries
    // skins money at its root (skinsBuyIn > 0 on a non-skins format - the Bets tab
    // can write that). roundHasSkinsGame() says yes for it; render from the round,
    // as every surface did before this file.
    if (out.length === 0 && typeof roundHasSkinsGame === 'function' && roundHasSkinsGame(data)) {
        out.push({ key: 'legacy', kind: 'wager', label: 'Skins', cfg: data });
    }
    return out;
}

// The ledger entries a surface renders, in order: for each config above, one
// entry per flight of its ledger (one entry, flight null, when that config is
// not flighted). Shape per entry:
//   { section: { key, kind, label, index, count, cfg }, flight, flighted, L, bundle }
// `L` is the ledger the surface lists (net when the mode has a net half, as
// before; gross otherwise); `bundle` is that flight's { mode, carryOver, gross,
// net }. `flighted` is per SECTION - a pool section is never flighted even on a
// flighted round. Returns [] when nothing should render; throws nothing.
function liveSkinsLedgerEntries(data, courseData, savedScores, opts) {
    if (typeof computeSkinsHoleLedger !== 'function') return [];
    const configs = liveSkinsLedgerConfigs(data);
    const entries = [];
    configs.forEach((c, index) => {
        let bundle;
        try { bundle = computeSkinsHoleLedger(c.cfg, courseData, savedScores, opts); }
        catch (e) { return; }
        const flights = bundle.flights || [bundle];
        const flighted = flights.length > 1;
        const section = { key: c.key, kind: c.kind, label: c.label, index, count: configs.length, cfg: c.cfg };
        flights.forEach(fl => {
            const L = fl.net || fl.gross;
            if (!L) return;
            entries.push({ section, flight: fl.flight || null, flighted, L, bundle: fl });
        });
    });
    // A single, flightless section with nobody in it is nothing to show.
    if (entries.length === 1 && entries[0].L.participants.length === 0) return [];
    return entries;
}

// ============================================================================
// THE ROWS, IN WORDS. One builder for the three hole-by-hole ledgers - the
// Receipt's Main Pool skins block (settlement.html), the scorecard's live
// skins panel (index.html) and the leaderboard's board (leaderboard.html).
//
// WHY HERE. v136 taught the Receipt to list only the holes that paid and to
// say what a carried run became; v137 taught the other two surfaces the same
// sentences, as two more page-local copies, with a test pinning the literals
// so they could not drift. Three copies of a money-explaining sentence is the
// shape the four calculateMatchEngine copies had. This file already answers
// "which config does each surface build its ledger from" for exactly these
// three pages and is loaded by exactly them, so the words live beside it.
//
// WHAT IS SHARED: the run logic and the sentences.
//   - only the holes that paid are rows; a no-carry tie pays nobody, rolls
//     nothing forward, and is not a row
//   - on a carry round a run of tied holes is ONE row, "carried to" the hole
//     that collected - or, mid-round, the hole still waiting - and "carried,
//     not won" only when no hole remains
//   - the collecting row carries " — collects N skins (Holes a–b)"; a plain
//     skin carries nothing (the page adds its own " — Skin" or not)
//   - every hole is "Hole 7", a run "Holes 5–6"
//   - waiting holes are rows too, with the data a page needs to say who is
//     being waited on
//
// WHAT IS NOT: the markup, the dollars, the waiting-row rule and its wording.
// The Card lists every waiting hole and names its groups, the board lists the
// first only, the Receipt lists them by golfer name (a preview only) - each
// page renders the rows this returns through its own template. Names are
// returned raw; the PAGE escapes them, because the page owns the markup.
//
// L is one ledger from computeSkinsHoleLedger (bundle.gross or bundle.net):
// its holes, in order, each official or not, tied or won, with unitsWon.
// basis is the word the page prints for the scoring basis: 'Gross' or 'Net'.
function buildSkinsLedgerRows(L, basis) {
    const rows = [];
    if (!L || !Array.isArray(L.holes)) return rows;
    const carryOver = !!L.carryOver;
    const run = [];   // consecutive tied holes, carry rounds only
    const span = list => list.length === 1
        ? 'Hole ' + list[0].hole
        : 'Holes ' + list[0].hole + '–' + list[list.length - 1].hole;
    const flush = into => {
        if (run.length === 0) return;
        const tied = run.length === 1 ? 'Tied at ' + basis + ' ' + run[0].low : 'Tied';
        const where = into ? 'carried to Hole ' + into : 'carried, not won';
        rows.push({
            kind: 'carry',
            holes: run.map(r => r.hole),
            label: span(run),
            into: into || null,
            text: span(run) + ' — ' + tied + ' — ' + where
        });
        run.length = 0;
    };
    L.holes.forEach(r => {
        if (!r.official) {
            flush(r.hole);
            rows.push({
                kind: 'waiting', hole: r.hole, label: 'Hole ' + r.hole,
                missing: r.missing || [], missingGroups: r.missingGroups || [],
                requiredCount: r.requiredCount, postedCount: r.postedCount
            });
            return;
        }
        if (r.state === 'tie') {
            if (carryOver) run.push(r);
            return;
        }
        let collected = '';
        if (r.unitsWon !== null && r.unitsWon !== undefined && r.unitsWon > 1) {
            const from = run.length > 0 ? run[0].hole : r.hole;
            collected = ' — collects ' + r.unitsWon + ' skins (Holes ' + from + '–' + r.hole + ')';
        }
        flush(r.hole);
        rows.push({
            kind: 'skin', hole: r.hole, label: 'Hole ' + r.hole,
            winner: r.winner, low: r.low, score: basis + ' ' + r.low,
            units: r.unitsWon, valueKnown: !!r.valueKnown, collected
        });
    });
    flush(null);
    return rows;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { liveSkinsLedgerConfigs, liveSkinsLedgerEntries, buildSkinsLedgerRows };
}
