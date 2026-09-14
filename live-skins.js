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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { liveSkinsLedgerConfigs, liveSkinsLedgerEntries };
}
