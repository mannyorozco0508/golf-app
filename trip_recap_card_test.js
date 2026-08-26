// ============================================================================
// TRIP RECAP CARD — THE THING SOMEBODY SCREENSHOTS
//
// The text recap pastes into a group chat. This is what gets posted. Both read
// the SAME cached state - cachedPlayerTotals, cachedMoneyTransactions,
// cachedTripSettled, cachedPointsStandings, cachedAwards - so the two can never
// tell different stories about one trip.
//
// NOTHING IS RECOMPUTED. Every figure was already produced by the canonical
// engines when the page rendered; the card arranges them.
//
// IT MUST SURVIVE LEAVING THE APP. A screenshot lands in a chat with no
// surrounding context, so the card carries the trip name, the round count, and -
// when money is unresolved - the caveat. A recap that reads FINAL while a round
// is unconfirmed is worse than no recap at all, because the group settles from
// what they can see.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const DEPS = ['money-engine.js','action-model.js','settlement-engine.js','pool-engine.js','score-marks.js'];

const NAMES = ['Marty','Scott','Carp','Randy','Manny','Matt B','Lance','Kopp',
               'Marcus','Rocco','Matt H','Jeremy'];
const POOL = { enabled:true, buyIn:40,
    kp:{ amount:100, holes:[3,7,12,16] },
    net:{ amount:70, places:[57.142857,42.857143] },
    skins:{ mode:'remainder', scoring:'net', carryOver:false } };

function roundData({ seed = 0, confirmed = true, side = false, pool = true } = {}) {
    const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
    const ps = NAMES.map((n,i)=>({ id:101+i, name:n, hcp:'9', playingForMoney:true }));
    const sc = {};
    ps.forEach((p,pi)=>cd.forEach((h,hi)=>{ sc['p'+p.id+'_h'+h.hole] = 4 + ((pi+hi+seed)%3) - 1; }));
    sc['p101_h2'] = 2;   // a birdie for Marty
    sc['p103_h5'] = 9;   // a blow-up for Carp
    const d = { players: ps, courseData: cd, scores: sc, settlementMode:'whole-dollar' };
    if (pool) d.moneyPool = POOL;
    if (confirmed) { d.kpWinners = { h3:'101', h7:'105', h12:'109', h16:'102' };
                     d.kpConfirmed = { confirmed: true }; }
    if (side) d.sideMatches = { m1:{ format:'match', scoring:'net', stake:50,
        startHole:1, createdAt:1, teamAIds:['101'], teamBIds:['103'] } };
    return d;
}

function recap({ confirmed = true, rounds = 2, name = 'Myrtle Beach 2026',
                 side = true, pool = true, empty = false } = {}) {
    const sb = loadHtmlInlineScript('trip.html', DEPS);
    const linked = [];
    const labels = ['Caledonia','True Blue','Pine Lakes'];
    for (let i = 0; i < rounds; i++) {
        linked.push({ label: labels[i] || ('Round ' + (i+1)), countsTowardTrip: true,
                      data: roundData({ seed:i, confirmed, side: side && i === 0, pool }) });
    }
    vm.runInContext(`
        tripData = { name: ${JSON.stringify(name)} };
        cachedRoundResults = ${empty ? '[]' : JSON.stringify(linked)};
        cachedCountedResults = cachedRoundResults;
        window.__alerts = []; alert = m => window.__alerts.push(String(m));
        if (!${empty}) { renderCumulativeLeaderboard(); renderTripMoneySettlement(); renderTripAwards(); }
    `, sb);
    return {
        sb, run: c => vm.runInContext(c, sb),
        open: () => vm.runInContext('openTripRecap();', sb),
        card: () => sb.document.getElementById('trip-recap-card').innerHTML,
        text: () => strip(sb.document.getElementById('trip-recap-card').innerHTML),
        display: () => sb.document.getElementById('trip-recap-overlay').style.display,
        alerts: () => sb.window.__alerts,
    };
}

// ============================================================================

describe('THE CARD STANDS ALONE', () => {

    test('it names the trip', () => {
        const b = recap(); b.open();
        assert.match(b.text(), /Myrtle Beach 2026/,
            'a screenshot arrives with no surrounding context');
    });

    test('it states how many rounds it covers', () => {
        const one = recap({ rounds: 1 }); one.open();
        assert.match(one.text(), /1 round\b/);
        const two = recap({ rounds: 2 }); two.open();
        assert.match(two.text(), /2 rounds/);
    });

    test('it contains standings, money and awards in one card', () => {
        const b = recap(); b.open();
        const t = b.text();
        assert.match(t, /STANDINGS/);
        assert.match(t, /SETTLEMENT/);
        assert.match(t, /AWARDS/);
    });

    test('it pins its own colours so dark mode cannot ruin the screenshot', () => {
        const rule = /\.recap-card \{([^}]*)\}/.exec(read('trip.html'))[1];
        assert.match(rule, /background:\s*#0f4c3a/);
        assert.match(rule, /color:\s*#fff/);
    });
});

describe('STANDINGS', () => {

    test('the top 5 are shown, best net first', () => {
        const b = recap(); b.open();
        const rows = [...b.card().matchAll(/class="rc-pos">(\d+)<\/span><span class="rc-name">([^<]+)<\/span><span class="rc-val">(-?\d+)/g)]
            .map(m => ({ pos:+m[1], name:m[2], net:+m[3] }));
        assert.ok(rows.length >= 5);
        const top = rows.slice(0, 5);
        for (let i = 1; i < top.length; i++) {
            assert.ok(top[i].net >= top[i-1].net, 'net order broken');
        }
        assert.equal(top[0].pos, 1);
    });

    test('a larger field says how many are not shown', () => {
        const b = recap(); b.open();
        assert.match(b.text(), /\+ 7 more/, '12 golfers, 5 shown');
    });

    test('the values match the cached totals exactly', () => {
        const b = recap(); b.open();
        const cached = JSON.parse(JSON.stringify(b.run('cachedPlayerTotals')))
            .slice().sort((x,y) => x.net - y.net).slice(0,5).map(r => r.net);
        const shown = [...b.card().matchAll(/class="rc-val">(-?\d+)</g)].map(m => +m[1]).slice(0,5);
        assert.deepEqual(shown, cached, 'the card must not re-derive standings');
    });
});

describe('MONEY — AND THE CAVEAT TRAVELS WITH IT', () => {

    test('a settled trip says FINAL SETTLEMENT', () => {
        const b = recap({ confirmed: true }); b.open();
        assert.match(b.text(), /FINAL SETTLEMENT/);
        assert.ok(!/Not final/.test(b.text()));
    });

    test('an unsettled trip does NOT say final', () => {
        const b = recap({ confirmed: false }); b.open();
        const t = b.text();
        assert.match(t, /SETTLEMENT SO FAR/);
        assert.ok(!/FINAL SETTLEMENT/.test(t));
    });

    test('and it carries the warning INTO the screenshot', () => {
        // The whole point: the caveat must not be the one thing that stays behind
        // on the screen when the card is shared.
        const b = recap({ confirmed: false }); b.open();
        assert.match(b.text(), /Not final — some rounds still have unconfirmed results/);
    });

    test('an unsettled trip says so in the subtitle too', () => {
        const b = recap({ confirmed: false }); b.open();
        assert.match(b.text(), /still in progress/);
    });

    test('transactions match the cached list', () => {
        const b = recap(); b.open();
        const cached = JSON.parse(JSON.stringify(b.run('cachedMoneyTransactions')));
        if (cached.length === 0) return;
        assert.match(b.text(), new RegExp(cached[0].from + ' → ' + cached[0].to));
    });

    test('a long settlement list is truncated with a count', () => {
        const b = recap(); b.open();
        const n = b.run('cachedMoneyTransactions.length');
        if (n > 6) assert.match(b.text(), new RegExp('\\+ ' + (n - 6) + ' more'));
    });

    test('an all-square trip says so rather than showing nothing', () => {
        const b = recap();
        b.run('cachedMoneyTransactions = []; renderTripRecapCard();');
        assert.match(strip(b.card()), /settled up/);
    });
});

describe('AWARDS — ONLY WHAT WAS EARNED', () => {

    test('earned awards appear with their detail', () => {
        const b = recap(); b.open();
        const t = b.text();
        assert.match(t, /Most Birdies/);
        assert.match(t, /Biggest Blow-Up/);
        assert.match(t, /9 on a par 4 · Hole 5, Caledonia/, 'the story, not just the name');
    });

    test('the awards block is omitted entirely when none were earned', () => {
        const b = recap();
        b.run('cachedAwards = {}; renderTripRecapCard();');
        assert.ok(!/AWARDS/.test(strip(b.card())),
            'an empty awards heading is worse than no heading');
    });

    test('award names match the cached values', () => {
        const b = recap(); b.open();
        const a = JSON.parse(JSON.stringify(b.run('cachedAwards')));
        if (a.mostBirdies) assert.match(b.text(), new RegExp(a.mostBirdies.name));
        if (a.blowUp) assert.match(b.text(), new RegExp(String(a.blowUp.score)));
    });
});

describe('POINTS RACE IS OPTIONAL', () => {

    test('omitted when the trip is not running one', () => {
        const b = recap(); b.open();
        assert.ok(!/POINTS RACE/.test(b.text()), 'no points configured in this fixture');
    });

    test('shown when it is', () => {
        const b = recap();
        b.run(`cachedPointsStandings = [{ rank:1, name:'Marty', points:12 },
                                        { rank:2, name:'Carp', points:9.5 }];
               renderTripRecapCard();`);
        const t = strip(b.card());
        assert.match(t, /POINTS RACE/);
        assert.match(t, /Marty 12/);
        assert.match(t, /Carp 9\.5/, 'a fractional score keeps its decimal');
    });
});

describe('OPENING AND CLOSING', () => {

    test('it refuses to open with no linked rounds', () => {
        // An unset style.display reads as undefined in the harness and '' in a
        // browser; what matters is that it is not 'flex'.
        const b = recap({ empty: true });
        b.open();
        assert.notEqual(b.display(), 'flex', 'the overlay must stay shut');
        assert.ok(b.alerts().some(a => /Link at least one round/.test(a)),
            'and say why');
    });

    test('open and close are display toggles — no navigation', () => {
        const b = recap();
        b.open();
        assert.equal(b.display(), 'flex');
        b.run('closeTripRecap();');
        assert.equal(b.display(), 'none');
        const src = read('trip.html');
        const at = src.indexOf('function openTripRecap');
        const fn = src.slice(at, src.indexOf('\n    function closeTripRecap', at));
        ['location.href','window.open','.reload(']
            .forEach(t => assert.ok(!fn.includes(t), `opening the recap must not navigate; found ${t}`));
    });

    test('the backdrop closes it', () => {
        assert.match(read('trip.html'), /id="trip-recap-overlay"[^>]*onclick="[^"]*closeTripRecap\(\)/);
    });

    test('the close control is a labelled 44px target', () => {
        const src = read('trip.html');
        assert.match(src, /aria-label="Close recap"/);
        assert.match(src, /&times;/, 'a rendered glyph, not an escape');
        const rule = /\.recap-close \{([^}]*)\}/.exec(src)[1];
        assert.match(rule, /min-width:\s*44px/);
        assert.match(rule, /min-height:\s*44px/);
    });

    test('no literal unicode escapes reached the markup', () => {
        const src = read('trip.html');
        const block = src.slice(src.indexOf('<div class="recap-overlay"'),
                                src.indexOf('</div>', src.indexOf('recap-share')));
        assert.ok(!/\\u[0-9A-Fa-f]{4}/.test(block),
            'escapes only resolve inside a JS string: ' + block.slice(0, 120));
    });

    test('the text share is still offered', () => {
        const src = read('trip.html');
        assert.match(src, /onclick="shareRecap\(\)"/);
        assert.match(src, /Share Trip Recap \(Text\)/);
    });
});

describe('NOTHING IS RECOMPUTED', () => {

    const fn = () => {
        const src = read('trip.html');
        const at = src.indexOf('function renderTripRecapCard');
        return src.slice(at, src.indexOf('\n    function buildShareRecapText', at));
    };

    test('it reads cached state only', () => {
        const f = fn();
        ['cachedPlayerTotals','cachedMoneyTransactions','cachedTripSettled','cachedAwards']
            .forEach(v => assert.ok(f.includes(v), `the card must consume ${v}`));
    });

    test('it runs no engines and settles nothing', () => {
        const f = fn();
        ['computeCombinedNetTotals(','computeMoneyPool(','simplifyDebts(',
         'allocateWholeDollars(','getStrokes(','parseHcp(']
            .forEach(t => assert.ok(!f.includes(t), `the card must not calculate; found ${t}`));
    });

    test('the card and the text recap read the SAME state', () => {
        const src = read('trip.html');
        const cardFn = fn();
        const at = src.indexOf('function buildShareRecapText');
        const textFn = src.slice(at, src.indexOf('\n    function shareRecap', at));
        ['cachedPlayerTotals','cachedMoneyTransactions','cachedTripSettled'].forEach(v => {
            assert.ok(cardFn.includes(v) && textFn.includes(v),
                `${v} must feed both, or the two can disagree about one trip`);
        });
    });

    test('the settled gate is untouched', () => {
        const src = read('trip.html');
        assert.match(src, /hasPlayerToPlayerSettlement\(tripContributions\)/);
        assert.match(src, /Not Settled Yet/);
    });

    test('no engine gained recap markup', () => {
        ['money-engine.js','pool-engine.js','settlement-engine.js','action-model.js']
            .forEach(f => assert.ok(!/rc-block|recap-card/.test(read(f)),
                `${f} must not carry presentation`));
    });
});
