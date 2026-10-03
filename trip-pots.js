// ============================================================================
// TRIP POTS - the trip's own money: one pot on the points race, and a daily pot
// copied into every round.
//
// PURE. No DOM, no database, no page. The page reads the trip, this says what
// the money is, and the page writes. Plain var/function declarations, like
// course-import-rules.js: a `const` here collides fatally with any page that
// re-declares the name.
//
// TWO POTS, AND NEITHER INVENTS A NEW MONEY MODEL:
//
//   THE TRIP POT is the points race played for money. Every golfer in the trip
//   pays one buy-in; the pot is paid out to the finishing order. It is the only
//   money in this app that belongs to the TRIP rather than to a round, which is
//   why it lives here and is added to the trip totals once, at the end.
//
//   THE DAILY POT is not new money at all: it is the round's own Weekly Game
//   (data.moneyPool, pool-engine.js) set once on the trip and copied into every
//   round that has not been played. The engine that settles it, the validator
//   that checks it and the ledger it writes are all the ones already there.
//
// THE ZERO-SUM RULE, stated once and asserted: sum(buy-ins) === sum(prizes),
// to the cent, or the pot is NOT APPLIED AT ALL. A half-applied pot is money
// appearing from nowhere, and there is no third destination for a dollar.
//
// ALL ARITHMETIC IN INTEGER CENTS, for the same reason pool-engine.js works
// that way: a split that is exact in cents is auditable, and a zero-sum check
// in floats is a check that passes "near enough".
// ============================================================================

// ---------------------------------------------------------------------------
// THE TRIP POT'S CONFIG, as stored at trips/<code>/tripPot:
//
//   { on: true, buyIn: 50, places: [600, 360, 240], scoring: 'net' | 'gross' }
//
// `places` are DOLLARS per finishing place, in order, exactly as the organizer
// typed them - never percentages. Golfers say "six hundred, three sixty, two
// forty", and a stored percentage is a second number that can disagree with the
// one on screen.
function tripPotConfig(trip) {
    var raw = (trip && trip.tripPot) || null;
    var places = (raw && Array.isArray(raw.places) ? raw.places : [])
        .map(function (v) { return Number(v) || 0; });
    return {
        on: !!(raw && raw.on),
        buyIn: Math.max(0, Number(raw && raw.buyIn) || 0),
        places: places,
        scoring: (raw && raw.scoring === 'gross') ? 'gross' : 'net'
    };
}

function tripPotPotCents(cfg, fieldSize) {
    return Math.round((cfg.buyIn || 0) * 100) * Math.max(0, fieldSize || 0);
}

// WHAT THE SETUP ROW HAS TO SAY BEFORE ANYBODY TAPS SAVE. Over, under, or level.
function tripPotBalance(cfg, fieldSize) {
    var potCents = tripPotPotCents(cfg, fieldSize);
    var paidCents = (cfg.places || []).reduce(function (a, v) {
        return a + Math.round((Number(v) || 0) * 100);
    }, 0);
    return {
        potCents: potCents, paidCents: paidCents,
        differenceCents: paidCents - potCents,
        balanced: potCents > 0 && paidCents === potCents
    };
}

// EVENLY, WITH THE ODD DOLLAR FIRST. The default split for N places, in whole
// dollars, so the row arrives already adding up.
function tripPotDefaultPlaces(cfg, fieldSize, spots) {
    var n = Math.max(1, Math.min(20, Math.round(Number(spots) || 1)));
    var potDollars = Math.round(tripPotPotCents(cfg, fieldSize) / 100);
    var base = Math.floor(potDollars / n);
    var extra = potDollars - base * n;
    var out = [];
    for (var i = 0; i < n; i++) out.push(base + (i < extra ? 1 : 0));
    return out;
}

// ---------------------------------------------------------------------------
// THE POINTS, ON THE TRIP'S OWN SCALE.
//
// 1st place is worth the WHOLE TRIP'S field size - 24 in a 24-man trip - and
// each place below is worth one less. The day's winner is worth the same on
// Thursday as on Monday, which is what makes a week of them a race; scaling to
// whoever happened to post that day made a thin Thursday worth less than a full
// Monday for the same finish.
//
// DID NOT FINISH, DID NOT SCORE. A golfer who has not completed the round is not
// ranked at all - this function never sees them - and gets nothing for that day.
//
// A TIE SPLITS THE PLACES IT OCCUPIES, evenly: two men tied for 2nd in a 24-man
// trip take (23 + 22) / 2 = 22.5 each, and the next man is 4th on 21. The same
// rule the trip has always used, now on a fixed scale.
//
// `ranked` is already in finishing order: [{ key, name, score }], lowest score
// first. Returns [{ key, name, points }] in the same order.
function tripPointsAward(ranked, tripFieldSize) {
    var list = ranked || [];
    var field = Math.max(list.length, Math.round(Number(tripFieldSize) || 0));
    var out = [];
    var i = 0;
    while (i < list.length) {
        var j = i;
        while (j + 1 < list.length && list[j + 1].score === list[i].score) j++;
        var sum = 0;
        for (var pos = i + 1; pos <= j + 1; pos++) sum += Math.max(0, field - pos + 1);
        var share = sum / (j - i + 1);
        for (var k = i; k <= j; k++) {
            out.push({ key: list[k].key, name: list[k].name, points: share });
        }
        i = j + 1;
    }
    return out;
}

// ---------------------------------------------------------------------------
// THE POT, AS MONEY.
//
// `standings` is the points race in finishing order with its competition ranks
// (1, 2, 2, 4) - the shape allocatePlacePayouts already takes. `field` is every
// golfer in the trip: they all pay, including anyone who never posted a card,
// because a buy-in is for the week.
//
// NOT BALANCED, NOT APPLIED. The caller gets entries: [] and applied: false, and
// must show the reason rather than part of a pot.
function tripPotLedger(cfg, field, standings, allocate) {
    var out = { applied: false, reason: '', entries: [], potCents: 0, paidCents: 0 };
    if (!cfg || !cfg.on) { out.reason = 'off'; return out; }
    var people = (field || []).filter(function (f) { return f && f.key; });
    if (people.length < 2) { out.reason = 'A trip pot needs at least two golfers in it.'; return out; }
    var bal = tripPotBalance(cfg, people.length);
    out.potCents = bal.potCents;
    out.paidCents = bal.paidCents;
    if (bal.potCents <= 0) { out.reason = 'Set a buy-in.'; return out; }
    if (!bal.balanced) {
        out.reason = bal.differenceCents > 0
            ? 'The places add up to more than the pot.'
            : 'The places add up to less than the pot.';
        return out;
    }
    if (typeof allocate !== 'function') { out.reason = 'No payout rule available.'; return out; }

    var buyInCents = Math.round((cfg.buyIn || 0) * 100);
    var byKey = {};
    people.forEach(function (p) {
        byKey[p.key] = { key: p.key, name: p.name, buyInCents: buyInCents, prizeCents: 0 };
    });

    // THE PLACE AND TIE RULE IS payouts.js allocatePlacePayouts, injected rather
    // than reimplemented: a tie that straddles the last paid place is exactly the
    // case a second copy gets wrong, and the Trip's prize calculator and the
    // Tournament desk both already answer it with that function.
    var paid = allocate(standings || [], (cfg.places || []).map(function (v) { return Number(v) || 0; }));
    (paid || []).forEach(function (p) {
        var key = p.entry && (p.entry.key || p.entry.name);
        if (!key || !byKey[key]) return;
        byKey[key].prizeCents += Math.round((Number(p.amount) || 0) * 100);
    });

    var entries = Object.keys(byKey).map(function (k) {
        var e = byKey[k];
        e.netCents = e.prizeCents - e.buyInCents;
        return e;
    });
    var sum = entries.reduce(function (a, e) { return a + e.netCents; }, 0);
    if (sum !== 0) {
        // Every dollar in has a dollar out, or nothing is applied. This can only
        // fire if a prize landed on somebody who is not in the field.
        out.reason = 'The pot does not balance to zero - nothing was applied.';
        return out;
    }
    out.applied = true;
    out.entries = entries;
    return out;
}

// ---------------------------------------------------------------------------
// THE DAILY POT, as stored at trips/<code>/dailyPot:
//
//   { on: true, buyIn: 20, kpPct: 25, netPct: 50, netPlaces: [50,30,20],
//     skins: 'remainder', scoring: 'net' }
//
// It turns into a round's OWN moneyPool - the Weekly Game - and nothing else.
//
// THE BUCKETS ARE A SHARE OF THE POT, NOT A FIXED NUMBER OF DOLLARS, and that is
// forced by arithmetic rather than taste. One setting has to fit every round, and
// a round's pot is the buy-in times WHOEVER IS IN THAT ROUND: $20 with twenty-four
// golfers is $480, with four it is $80. Measured against the real validator, a
// fixed "KP $40, Net $60" written into a four-man round is "$20 over budget - the
// pot is $80 but $100 is allocated", and pool-engine.js refuses the whole pool. A
// share is right at every headcount.
//
// SKINS TAKES THE REMAINDER, so the last cent always has a destination.
function dailyPotConfig(trip) {
    var raw = (trip && trip.dailyPot) || null;
    var places = (raw && Array.isArray(raw.netPlaces) && raw.netPlaces.length)
        ? raw.netPlaces.map(function (v) { return Number(v) || 0; })
        : [50, 30, 20];
    var kpPct = Math.max(0, Math.min(100, Number(raw && raw.kpPct) || 0));
    var netPct = Math.max(0, Math.min(100, Number(raw && raw.netPct) || 0));
    // The two shares can never take more than the pot; skins keeps what is left.
    if (kpPct + netPct > 100) netPct = Math.max(0, 100 - kpPct);
    return {
        on: !!(raw && raw.on),
        buyIn: Math.max(0, Number(raw && raw.buyIn) || 0),
        kpPct: kpPct, netPct: netPct,
        netPlaces: places,
        skins: (raw && raw.skins === 'none') ? 'none' : 'remainder',
        scoring: (raw && raw.scoring === 'gross') ? 'gross' : 'net'
    };
}

// The par 3s of the card this round is actually on. KP holes are per course, so
// a trip-wide setting cannot name them: each round gets its own.
function dailyPotKpHoles(courseData) {
    var card = courseData || [];
    if (!card.length) return [];
    var trustworthy = card.every(function (h) {
        var par = Number(h && h.par);
        return isFinite(par) && par >= 3 && par <= 6;
    });
    if (!trustworthy) return [];
    return card.filter(function (h) { return Number(h.par) === 3; })
               .map(function (h) { return Number(h.hole); });
}

// WHAT THAT ROUND'S POT IS WORTH, in whole dollars per bucket. Rounded DOWN so
// the buckets can never exceed the pot by a rounding dollar - the one error the
// validator calls over budget and refuses the pool for.
function dailyPotAmounts(cfg, headcount) {
    var pot = Math.max(0, Math.round(Number(cfg.buyIn) || 0) * Math.max(0, headcount || 0));
    var kp = Math.floor(pot * (cfg.kpPct || 0) / 100);
    var net = Math.floor(pot * (cfg.netPct || 0) / 100);
    if (kp + net > pot) net = Math.max(0, pot - kp);
    return { pot: pot, kp: kp, net: net, skins: pot - kp - net };
}

// THE ROUND'S OWN WEEKLY GAME, built from the trip's setting and that round's
// headcount. Returns null when the pot cannot be expressed for that round - no
// card for its KP holes, nobody in it, or a buy-in of nothing - because writing
// a pool the validator will refuse is worse than writing none.
function dailyPotForRound(cfg, courseData, headcount) {
    if (!cfg || !cfg.on || cfg.buyIn <= 0) return null;
    if (!(headcount >= 2)) return null;
    var amounts = dailyPotAmounts(cfg, headcount);
    var pool = { enabled: true, buyIn: cfg.buyIn };
    if (amounts.kp > 0) {
        var holes = dailyPotKpHoles(courseData);
        if (!holes.length) return null;          // no card, no KP: say so, do not guess
        pool.kp = { amount: amounts.kp, holes: holes };
    }
    if (amounts.net > 0) pool.net = { amount: amounts.net, places: cfg.netPlaces.slice() };
    pool.skins = { mode: cfg.skins, scoring: cfg.scoring, carryOver: true };
    return pool;
}

// THE WRITE, AS A PLAIN MAP the page hands to one update(). ONLY ROUNDS WITH NO
// SCORES: a round that has been played has a settled money position, and its
// Weekly Game is part of it.
//
// `plan` is trip-roster.js tripRosterPlan(rounds) - the same open/closed split
// every other trip-wide change uses, so there is one answer to "may this round
// be edited" and not two. `countParticipants` is pool-engine.js
// moneyPoolParticipants, injected: who is in a round's pot is that engine's
// question, and a second opinion here is how two surfaces come to disagree.
function dailyPotUpdates(plan, cfg, countParticipants) {
    var out = { updates: {}, changed: [], skipped: [], noCard: [], amounts: [] };
    if (!cfg || !cfg.on) return out;
    // The engine hands back the participant LIST; a caller with nothing to inject
    // gets the same rule written out. Either way this works in people, not arrays.
    var count = function (data) {
        if (typeof countParticipants === 'function') {
            var r = countParticipants(data);
            return Array.isArray(r) ? r.length : (Number(r) || 0);
        }
        return ((data || {}).players || []).filter(function (p) { return p.playingForMoney !== false; }).length;
    };
    (plan && plan.open ? plan.open : []).forEach(function (r) {
        var data = r.data || {};
        var n = count(data);
        var pool = dailyPotForRound(cfg, data.courseData || [], n);
        if (!pool) { out.noCard.push(r.label); return; }
        out.updates['events/' + r.code + '/moneyPool'] = pool;
        out.changed.push(r.label);
        out.amounts.push(Object.assign({ label: r.label, golfers: n }, dailyPotAmounts(cfg, n)));
    });
    (plan && plan.closed ? plan.closed : []).forEach(function (r) { out.skipped.push(r.label); });
    return out;
}

// The one line the trip page shows about what is switched on. Plain, countable,
// and it says where the money ends up - which is the question a golfer actually
// has when he sees a pot on a screen.
function tripPotsLine(potCfg, dailyCfg, fieldSize) {
    var bits = [];
    if (potCfg && potCfg.on && potCfg.buyIn > 0) {
        bits.push('Trip pot $' + potCfg.buyIn + ' each ($'
            + Math.round(tripPotPotCents(potCfg, fieldSize) / 100) + ' on the points race)');
    }
    if (dailyCfg && dailyCfg.on && dailyCfg.buyIn > 0) {
        bits.push('Daily pot $' + dailyCfg.buyIn + ' a round');
    }
    if (!bits.length) return '';
    return bits.join(' · ') + '. Both are in Trip Money Settlement below.';
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        tripPotConfig, tripPotPotCents, tripPotBalance, tripPotDefaultPlaces,
        tripPointsAward, tripPotLedger,
        dailyPotConfig, dailyPotKpHoles, dailyPotAmounts, dailyPotForRound, dailyPotUpdates, tripPotsLine
    };
}
