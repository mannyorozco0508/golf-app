// ============================================================================
// A ROUND AS THE WIZARD SAVES IT - the fixture every arrival test should use.
//
// Hand-built rounds carry only the keys a test thinks about. A round the
// wizard actually writes carries EVERY key in saveSettings' payload
// (admin.html, `const payload = {`), including ones no control on the page
// serves any more - nassauPressRule "2down" is written on every round because
// the save falls back to that string when the retired Nassau <select> is
// absent. That one key made loadModeData throw on every reopen of every real
// round from 2026-08-27 until v125, and no fixture in the repo carried it, so
// no test - harness or Chrome - ever tripped it.
//
// This builder writes the same keys the payload writes, in the same shapes
// the save produces (players with team/squad/playingForMoney and a flight when
// flights are on; handicaps as strings; a full 18-hole card; groupSizeOverrides
// as an index-keyed object). Override any key by passing it in `overrides`.
// Keep this list in step with the payload: wizard_saved_round_test.js holds
// every payload key against it.
// ============================================================================
const { makeCourseData, makePlayers } = require('./fixtures.js');

const DEFAULT_NAMES = ['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta', 'Eli Echo', 'Fay Foxtrot', 'Gus Golf', 'Hal Hotel',
    'Ivy India', 'Jon Juliet', 'Kim Kilo', 'Lee Lima', 'Max Mike', 'Ned November', 'Oli Oscar', 'Pat Papa', 'Quy Quebec',
    'Rae Romeo', 'Sal Sierra', 'Tom Tango', 'Uma Uniform', 'Vic Victor', 'Wes Whiskey'];
const DEFAULT_HCPS = [2, 9, 15, 4, 20, 7, 11, 0, 18, 6, 13, 3, 22, 8, 16, 1, 10, 24, 5, 12, 19, 14, 17];

// The payload's keys, in the payload's order, so a test can hold the two lists
// against each other and fail when the save grows a key this builder lacks.
const PAYLOAD_KEYS = ['eventName', 'roundDay', 'settlementMode', 'skinsRounding', 'organizerToken', 'eventCategory', 'categoryIcon',
    'activeCourseKey', 'courseName', 'gameFormat', 'holeBetStake', 'richHoleBet', 'richHoleBetPresses', 'richOverallBetPresses',
    'additionalGames', 'moneyPool', 'flights', 'additionalGameInstances', 'birdieGameEnabled', 'birdieUnitVal', 'matchScoring',
    'matchScoringStyle', 'matchStake', 'matchPressRule', 'nassauType', 'nassauScoring', 'nassauStake', 'nassauPressRule',
    'wolfPointVal', 'wolfLoneMult', 'wolfBlindMult', 'wolfTieRule', 'wolfLastPlaceRule', 'stablefordPointVal', 'groupSizeOverrides',
    'stablefordScoring', 'stablefordPoints', 'dotPointVal', 'greenieCarryover', 'skinsBuyIn', 'skinsPotFormat', 'skinsCarryOver',
    'courseData', 'teeRating', 'players'];

function wizardSavedRound(opts) {
    const o = opts || {};
    const code = o.code || 'WIZSAV';
    const courseData = o.courseData || makeCourseData(18);
    const n = o.golfers || DEFAULT_NAMES.length;
    const names = (o.names || DEFAULT_NAMES).slice(0, n);
    const hcps = (o.hcps || DEFAULT_HCPS).slice(0, n);
    const flightsOn = o.flights !== false;
    const tags = flightsOn ? names.map((_, i) => (i < Math.ceil(n / 2) ? 'A' : 'B')) : undefined;
    const players = makePlayers(names, hcps, 101, tags).map((p, i) => {
        const entry = { id: p.id, name: p.name, hcp: String(p.hcp), team: 'Team ' + (Math.floor(i / 2) + 1), squad: i % 2 ? 'blue' : 'red', playingForMoney: true };
        if (flightsOn) entry.flight = p.flight;
        return entry;
    });
    const scores = {};
    const thru = o.thru === undefined ? 9 : o.thru;
    players.forEach(p => courseData.slice(0, thru).forEach(h => { scores['p' + p.id + '_h' + h.hole] = h.par; }));
    const sizes = []; let left = n; while (left > 0) { sizes.push(Math.min(4, left)); left -= sizes[sizes.length - 1]; }
    const groupSizeOverrides = {}; sizes.forEach((sz, i) => { groupSizeOverrides[i] = sz; });

    const round = {
        eventName: 'Sunday', roundDay: 'Sunday', settlementMode: 'whole-dollar', skinsRounding: 'odd-dollar',
        organizerToken: 'tok-' + code, eventCategory: 'weekend', categoryIcon: '⛳',
        // ownerUid since 2026-09-15 (organizer-gate.js stamp at the first save): the
        // saving realm's anonymous uid - 'anon-stub' is what mini-dom signs a page in
        // as; a Chrome cold arrival is 'anon-cold' (pass ownerUid); null drops the key
        // (a round from before the gate).
        ownerUid: o.ownerUid === undefined ? 'anon-stub' : o.ownerUid,
        activeCourseKey: 'tidewater', courseName: 'Tidewater', gameFormat: 'stroke', holeBetStake: 0,
        richHoleBet: null, richHoleBetPresses: null, richOverallBetPresses: null,
        additionalGames: { skins: { enabled: true, skinsBuyIn: 5, skinsPotFormat: 'gross', skinsScoring: 'gross', skinsCarryOver: false, startHole: 1 } },
        moneyPool: { enabled: true, buyIn: 20, kp: { amount: 40, holes: [3, 7, 12, 16] }, net: { amount: 200, places: [60, 40] },
            skins: { mode: 'remainder', scoring: 'gross', carryOver: false } },
        // skinsSplit 'even' since 2026-09-20: the wizard's default for a new round
        // (admin.html flightsSetting). A round saved before it carries no key.
        flights: flightsOn ? { enabled: true, scopes: { skins: 'flight', birdies: 'field' }, skinsSplit: 'even' } : null,
        additionalGameInstances: {},
        birdieGameEnabled: false, birdieUnitVal: 0,
        matchScoring: 'net', matchScoringStyle: 'match', matchStake: 0, matchPressRule: 'none',
        nassauType: 'team', nassauScoring: 'net', nassauStake: 10,
        // THE KEY THAT BIT. Written by every save since the Nassau <select> left the
        // page; nothing on the page has served it since.
        nassauPressRule: '2down',
        wolfPointVal: 0, wolfLoneMult: 2, wolfBlindMult: 3, wolfTieRule: 'carry', wolfLastPlaceRule: 'off',
        stablefordPointVal: 0, groupSizeOverrides, stablefordScoring: 'net',
        stablefordPoints: { other: 0, bogey: 1, par: 2, birdie: 3, eagle: 4, albatross: 5 },
        dotPointVal: 0, greenieCarryover: true, skinsBuyIn: 0, skinsPotFormat: null, skinsCarryOver: false,
        courseData,
        // teeRating since 2026-09-23: every save writes the Slope / Course Rating /
        // Par the wizard had, including an empty set. Nulls here mean the fields
        // were blank, so a reopen must not invent a conversion.
        teeRating: { teeKey: '', teeName: '', slope: null, courseRating: null, par: null, allowance: 100 },
        players,
        // What the round gains after setup.
        scores, kpWinners: { h3: '101' }, kpConfirmed: { confirmed: false }
    };
    // update() semantics: a null value deletes the key, so a stored round has no
    // skinsPotFormat / rich* / flights(off) keys at all. Mirror that.
    Object.keys(round).forEach(k => { if (round[k] === null) delete round[k]; });
    return Object.assign(round, o.overrides || {});
}

module.exports = { wizardSavedRound, PAYLOAD_KEYS, DEFAULT_NAMES, DEFAULT_HCPS };
