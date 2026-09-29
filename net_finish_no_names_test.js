// ============================================================================
// NET FINISH NAMES NOBODY UNTIL THE ROUND IS FINISHED (Wave 24)
//
// Manny read "1st: Paul · net 21 / T2: Lance / Matt B · net 22" off the Weekly Game
// card with a few holes played. Reproduced from the engine before anything was
// built: eight golfers, $100 over 50/30/20, five holes in, and computeMoneyPool
// returns net.lines [[1,["Avery"],5000],[2,["Blake","Casey"],5000]]. The card was
// printing that faithfully. The money was never wrong; the screen was naming
// winners of a round nobody had finished.
//
// OPTION 2, Manny's decision. Until the round is finished the card shows THE POT AND
// THE SPLIT ONLY - "$100 · 1st $50 · 2nd $30 · 3rd $20" - plus one muted line saying
// when the names arrive. Names, net scores and per-golfer amounts appear unchanged the
// moment it is finished. NO PAYOUT MATH CHANGES ANYWHERE: this file asserts that by
// leaving every finished-view figure exactly as the engine allocated it.
//
// THE SPLIT IS CONSUMED, NEVER RECOMPUTED. r.net.placeCents is "the ALLOCATED value of
// each paid position, exposed additively" (pool-engine.js:572), and it is populated
// from the moment a pool is valid - measured, with ZERO scores posted, as
// [5000,3000,2000]. That is the whole reason Option 2 is cheap: the pot and the split
// already exist before anyone tees off; only the names had to be withheld.
// settlement.html:1472 records what happens if you re-derive instead - the setup path
// returns 3999/3001 where the engine allocated 4000/3000 - so net-finish-line.js reads
// placeCents and nothing else.
//
// ONE RESOLVER FOR "FINISHED" (Manny's answer A). computeRoundSettlement(...).finished
// in settlement-engine.js: verified || scored, where scored means every golfer who TEED
// OFF has every hole and verified is the organizer's "Scores Look Right". Before this
// wave buildLiveNetFinish computed its OWN answer - every pool PARTICIPANT complete,
// with no verified arm at all - so the card and the receipt could disagree about
// whether the round was over. That local rule is deleted, not left beside the resolver.
// State (d) below is the case only the resolver can get right.
//
// WHOLE FIELD, NOT PER GROUP. computeRoundFinish reads data.players with no ?group=
// anywhere in it, so group 1 finishing cannot reveal names while group 6 is on 12.
// That is the multi-group state at the end.
//
// ONE POT, ONE SPLIT - NET IS NOT FLIGHTED. Only skins and birdies have flight scopes
// (admin.html saves scopes for those two and nothing else), and pool-engine's flight
// code lives entirely in the skins bucket. The fixture below has flights ENABLED with
// skins scoped per flight precisely so that is tested rather than asserted: the skins
// bucket splits A $30 / B $30 while the net line stays a single $100 pot.
//
// WHAT THIS FILE DOES NOT TOUCH, deliberately: settlement.html (its receipt already
// short-circuits the whole document on an unfinished round, so it never named anybody
// mid-round), leaderboard.html, and the Finish Round correction diff at index.html,
// which names golfers whose position a correction WOULD change and is Manny's decision
// to leave as-is.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const J = v => JSON.parse(JSON.stringify(v));
const PAGE = 'index.html';
const DEPS = ['action-model.js','match-engine.js','money-engine.js','pool-engine.js','settlement-engine.js',
              'score-marks.js','bet-strip.js','hole-events.js','net-finish-line.js'];

// EIGHT GOLFERS, TWO GROUPS OF FOUR, FLIGHTS A/B WITH SKINS PER FLIGHT.
// No name here can collide with markup or a CSS token - an earlier draft used "Gray".
const NAMES = ['Avery','Blake','Casey','Devon','Ellis','Finley','Harper','Indigo'];
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const PL = NAMES.map((n, i) => ({ id: 101 + i, name: n, hcp: '0', playingForMoney: true, flight: i < 4 ? 'A' : 'B' }));
const IDS = PL.map(p => p.id);
const GROUP_OF = id => Math.floor((Number(id) - 101) / 4) + 1;

function roundData(scores, extra) {
    return Object.assign({
        eventName: 'NF', courseName: 'Test', players: PL, courseData: CD, gameFormat: 'stroke',
        settlementMode: 'whole-dollar', scores: scores || {},
        flights: { enabled: true, scopes: { skins: 'flight', birdies: 'field' }, skinsSplit: 'even' },
        moneyPool: { enabled: true, buyIn: 25, participantIds: IDS.map(String),
            kp: { amount: 40, holes: [7] }, net: { amount: 100, places: [50, 30, 20] },
            skins: { mode: 'remainder', scoring: 'net', carryOver: false } },
    }, extra || {});
}
// Five holes: Avery 3s, Blake and Casey 4s, the rest 5s -> a clear 1st and a LIVE T2.
// A tie is the case most likely to leak a name, so the partial state carries one.
function scoresThrough(lastHole, ids) {
    const s = {};
    (ids || IDS).forEach((id, i) => {
        const iAll = IDS.indexOf(id);
        for (let h = 1; h <= lastHole; h++) s['p' + id + '_h' + h] = iAll === 0 ? 3 : (iAll < 3 ? 4 : 5);
    });
    return s;
}

function boot(data) {
    const sb = loadHtmlInlineScript(PAGE, DEPS);
    const gm = {}; PL.forEach(p => { gm[String(p.id)] = GROUP_OF(p.id); });
    vm.runInContext(`
        currentMode = 'NF';
        currentData = ${JSON.stringify(data)};
        window.__scPlayerGroupMap = ${JSON.stringify(gm)};
        window.__scFilteredPlayers = currentData.players.slice(0, 4);
        hasGroupLock = true; lockedGroup = 1; actionCenterOpen = true;
        currentViewedHole = 3;
    `, sb);
    return {
        sb,
        banner: () => String(vm.runInContext('buildMoneyPoolBanner()', sb)),
        run: c => vm.runInContext(c, sb),
    };
}
const strip = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// THE FIVE STATES.
const S = {};
before(() => {
    S.a = boot(roundData({}));                                     // no scores at all
    S.b = boot(roundData(scoresThrough(5)));                       // five holes, live T2
    S.c = boot(roundData(scoresThrough(18)));                      // every card in
    S.d = boot(roundData(scoresThrough(17), {                      // 17 holes + VERIFIED
        scoresVerified: { verified: true, verifiedAt: 1, verifiedBy: 'organizer' } }));
    // Group 1 done, group 2 thru 12. Nothing about group 1 may reveal a name.
    S.e = boot(roundData(Object.assign(scoresThrough(18, IDS.slice(0, 4)),
                                       scoresThrough(12, IDS.slice(4)))));
});

const SPLIT = /\$100[^]*?1st \$50[^]*?2nd \$30[^]*?3rd \$20/;
const WAITING = /Winners show once every card is in\./;
// EVERY golfer, not one: a sweep that checked a single name would pass a card that
// leaked the other seven.
function assertNoNames(text, why) {
    NAMES.forEach(n => assert.ok(text.indexOf(n) === -1,
        why + ' - the card names ' + n + ': ' + text.slice(0, 400)));
}

describe('(a) A ROUND WITH NO SCORES: the pot and the split, nobody named', () => {
    test('the split line is there, from the engine, with no names and no net scores', () => {
        const t = strip(S.a.banner());
        assert.match(t, /NET FINISH/i);
        assert.match(t, SPLIT, 'the pot and the three places must be on the card: ' + t);
        assertNoNames(t, 'no scores have been posted');
        assert.ok(!/net \d/.test(t), 'a net score appears on a round nobody has played: ' + t);
        assert.match(t, WAITING, 'the muted line that says when names arrive is missing');
    });
    test('the resolver says the round is not finished, and the card agrees', () => {
        assert.equal(S.a.run('netFinishNamesAllowed()'), false);
    });
});

describe('(b) FIVE HOLES PLAYED, A LIVE TIE FOR SECOND: still nobody named', () => {
    test('the engine really does have a named 1st and a T2 here, or this proves nothing', () => {
        // The fixture fault this guards against: a partial state with no places
        // computed would satisfy every absence assertion below for the wrong reason.
        const lines = S.b.run('JSON.parse(JSON.stringify(computeMoneyPool(currentData, currentData.courseData, currentData.scores).net.lines))');
        assert.equal(lines.length, 2, 'the engine did not produce two paid lines: ' + JSON.stringify(lines));
        assert.deepEqual(lines[0].names, ['Avery']);
        assert.deepEqual(lines[1].names, ['Blake', 'Casey'], 'the live tie is missing from the fixture');
    });
    test('the card shows the split and sweeps clean of ALL EIGHT names', () => {
        const t = strip(S.b.banner());
        assert.match(t, SPLIT);
        assertNoNames(t, 'five holes is not a finished round');
        assert.match(t, WAITING);
    });
    test('and no "leads net" line either', () => {
        const t = strip(S.b.banner());
        assert.ok(!/leads net/.test(t), 'the summary line still names the net leader: ' + t);
    });
    test('ONE POT, ONE SPLIT: the net line is not flighted, though the skins bucket is', () => {
        const t = strip(S.b.banner());
        // The round HAS flights with skins scoped per flight - the engine splits that
        // bucket A $30 / B $30 - so if the net line were ever drawn per flight this
        // fixture is where it would show.
        assert.equal((t.match(/1st \$50/g) || []).length, 1, 'the net split is drawn twice: ' + t);
        const flights = S.b.run('JSON.parse(JSON.stringify((computeMoneyPool(currentData, currentData.courseData, currentData.scores).skins || {}).flights || []))');
        assert.deepEqual(flights.map(f => f.flight), ['A', 'B'], 'the fixture is not actually flighted');
    });
});

describe('(c) EVERY CARD IN: names, net scores, amounts and the tie split, unchanged', () => {
    test('the finished card names the places and prices them', () => {
        const t = strip(S.c.banner());
        assert.match(t, /Avery/, 'the finished round still hides the winner');
        assert.match(t, /1 . Avery . net \d+/, 'the finished row lost its place or its net: ' + t);
        assert.match(t, /\$50/);
        assert.ok(!WAITING.test(t), 'the waiting line survived into the finished view: ' + t);
    });
    test('the tie is still a shared place with the per-golfer amount, straight from the engine', () => {
        const t = strip(S.c.banner());
        assert.match(t, /T2 . Blake \/ Casey/, 'the tie stopped rendering as a shared place: ' + t);
        // $30 + $20 consumed by the tie, $25 each - the engine's allocation, not an average.
        assert.match(t, /\$25 each/, 'the tie split changed: ' + t);
    });
    test('the resolver says finished', () => {
        assert.equal(S.c.run('netFinishNamesAllowed()'), true);
    });
});

describe('(d) SEVENTEEN HOLES AND THE ORGANIZER VERIFIED: names appear', () => {
    test('this is the arm the old local rule could not see', () => {
        // buildLiveNetFinish used to require every PARTICIPANT complete. Nobody is
        // complete here - every golfer is on 17 - so the old rule said unfinished
        // forever, while the receipt called the same round FINAL. One resolver now.
        const st = S.d.run('JSON.parse(JSON.stringify(computeRoundSettlement(currentData, currentData.courseData, currentData.scores)))');
        assert.equal(st.scored, false, 'the fixture completed the round, so verified is not being tested');
        assert.equal(st.verified, true);
        assert.equal(st.finished, true);
        assert.equal(S.d.run('netFinishNamesAllowed()'), true);
    });
    test('and the card names the winners', () => {
        const t = strip(S.d.banner());
        assert.match(t, /Avery/);
        assert.ok(!WAITING.test(t));
    });
});

describe('(e) MULTI-GROUP: group 1 is done, group 2 is thru 12 - nobody is named', () => {
    test('the field is not finished, and group 1 finishing does not change that', () => {
        const st = S.e.run('JSON.parse(JSON.stringify(computeRoundSettlement(currentData, currentData.courseData, currentData.scores)))');
        assert.equal(st.finished, false, 'a finished group finished the round');
        assert.equal(st.unfinished.length, 4, 'group 2 is not being counted as outstanding');
        assert.equal(S.e.run('netFinishNamesAllowed()'), false);
    });
    test('the card sweeps clean of all eight names, group 1 included', () => {
        const t = strip(S.e.banner());
        assert.match(t, SPLIT);
        assertNoNames(t, 'group 6 is still on hole 12');
        assert.match(t, WAITING);
    });
});

describe('THE ONE BUILDER: net-finish-line.js, reading placeCents', () => {
    const NFL = loadJsFile('net-finish-line.js', []);
    const call = (expr) => vm.runInContext(expr, NFL);

    test('the parts come from placeCents and are ordinal-labelled', () => {
        NFL.__net = { amountCents: 10000, placeCents: [5000, 3000, 2000] };
        assert.deepEqual(J(call('netFinishPlaceParts(__net)')), ['1st $50', '2nd $30', '3rd $20']);
    });
    test('the separator belongs to the caller, because the money does not', () => {
        // game.html reads ", " and the scorecard reads " · ". The SPLIT is shared; the
        // punctuation is each page's own, which is what lets game.html's sentence stay
        // byte-identical while the scorecard gains the same figures.
        NFL.__net = { amountCents: 10000, placeCents: [5000, 3000, 2000] };
        assert.equal(call("netFinishSplitText(__net, ', ')"), '1st $50, 2nd $30, 3rd $20');
        assert.equal(call("netFinishSplitText(__net, ' \\u00B7 ')"), '1st $50 · 2nd $30 · 3rd $20');
    });
    test('LEGACY CENTS are printed exactly, never rounded', () => {
        // The failure tools/money-format-check.js exists for: a $3.33 place read "$3".
        NFL.__net = { amountCents: 1000, placeCents: [333, 333, 334] };
        assert.deepEqual(J(call('netFinishPlaceParts(__net)')), ['1st $3.33', '2nd $3.33', '3rd $3.34']);
    });
    test('11th, 12th, 13th: the ordinal rule is not "n + th" and not "1st, 2st"', () => {
        NFL.__net = { placeCents: new Array(13).fill(100) };
        const parts = J(call('netFinishPlaceParts(__net)'));
        assert.equal(parts[10], '11th $1'); assert.equal(parts[11], '12th $1'); assert.equal(parts[12], '13th $1');
        assert.equal(parts[0], '1st $1'); assert.equal(parts[1], '2nd $1'); assert.equal(parts[2], '3rd $1');
    });
    test('it NEVER recomputes: a net with no placeCents yields nothing rather than guessing', () => {
        NFL.__net = { amountCents: 10000, places: [50, 30, 20], amount: 100 };
        assert.deepEqual(J(call('netFinishPlaceParts(__net)')), [],
            'the builder fell back to the setup config, which is the path that returns '
            + '3999/3001 where the engine allocated 4000/3000');
        assert.equal(call('netFinishSplitText(__net)'), '');
    });
});

describe('THE SOURCE: ONE RESOLVER, ONE BUILDER, NO ENGINE TOUCHED', () => {
    const IDX = read('index.html');
    const GAME = read('game.html');
    const fn = (name, src) => { const at = (src || IDX).indexOf('function ' + name + '('); return at < 0 ? '' : (src || IDX).slice(at, (src || IDX).indexOf('\n    }', at)); };

    test('buildLiveNetFinish asks the resolver and keeps no local completeness rule', () => {
        const b = fn('buildLiveNetFinish');
        assert.ok(b.length > 80, 'buildLiveNetFinish could not be sliced');
        assert.match(b, /netFinishNamesAllowed\(/, 'it does not ask the resolver');
        assert.ok(!/participants\.every\(/.test(b),
            'the local "every participant complete" rule is back beside the resolver');
        assert.ok(!/PROJECTED|FINAL/.test(b), 'the head still carries the state word');
    });
    test('the resolver is one function and it reads the engine', () => {
        const r = fn('netFinishNamesAllowed');
        assert.ok(r.length > 20, 'netFinishNamesAllowed is gone');
        assert.match(r, /computeRoundSettlement\(/);
        assert.match(r, /\.finished/);
    });
    test('the "leads net" summary is gated, not merely reworded', () => {
        const b = fn('buildMoneyPoolBanner');
        assert.match(b, /netFinishNamesAllowed\(/, 'the summary line names the leader unconditionally');
    });
    test('game.html uses the shared builder and has no private copy', () => {
        assert.ok(!/function placesText\(/.test(GAME), 'placesText survived as a second copy');
        assert.match(GAME, /netFinishSplitText\(/, 'game.html is not using the shared builder');
        assert.match(GAME, /<script src="net-finish-line\.js"><\/script>/, 'game.html does not load it');
        assert.match(IDX, /<script src="net-finish-line\.js"><\/script>/, 'index.html does not load it');
    });
    test('the four protected engines are untouched by this wave', () => {
        ['pool-engine.js', 'money-engine.js', 'settlement-engine.js', 'action-model.js'].forEach(f => {
            const s = read(f);
            assert.ok(!/netFinishPlaceParts|netFinishSplitText|netFinishNamesAllowed/.test(s),
                f + ' now references the display builder - this wave may not change an engine');
        });
    });
    test('settlement.html and leaderboard.html are not involved', () => {
        ['settlement.html', 'leaderboard.html'].forEach(f => {
            assert.ok(!/netFinishSplitText|netFinishNamesAllowed/.test(read(f)),
                f + ' was changed; its receipt already short-circuits on an unfinished round');
        });
    });
});

// ---------------------------------------------------------------------------
// AND ON A REAL DEVICE, COLD. The assertions above read a string a test asked for;
// this one reads what a phone renders, having touched nothing.
// ---------------------------------------------------------------------------
describe('COLD CHROME: a phone arriving mid-round sees no names', () => {
    let v = null;
    before(async () => {
        const LOOK = `(function () {
          var ac = document.getElementById('action-center-mount');
          var t = ac ? (ac.innerText || '') : 'no mount';
          return JSON.stringify({ text: t.replace(/\\s+/g, ' ').trim() });
        })()`;
        const r = await arriveCold({ url: fileUrl('index.html', 'game=NF&group=1'),
            db: { events: { NF: roundData(scoresThrough(5)) }, global_courses: {}, trips: {}, tournaments: {} },
            settleMs: 3200, viewport: { width: 390, height: 844 },
            // .action-toggle, not .action-center-toggle - my first selector matched
            // nothing, so the tap never landed and the assertion read the COLLAPSED
            // card ("My Round 1 live - tap to see") and blamed the feature.
            steps: [{ tap: '.action-toggle' }, { sleep: 600 }, { expression: LOOK }] });
        v = r.ok ? JSON.parse(r.value[r.value.length - 1]) : { error: r.reason };
    });

    test('the Action Center rendered, and it shows the split with no golfer on it', () => {
        assert.ok(v && !v.error, 'cold arrival failed: ' + (v && v.error));
        assert.match(v.text, /NET FINISH/i, 'the Weekly Game card did not render: ' + v.text.slice(0, 300));
        assert.match(v.text, /1st \$50/, 'the split is not on screen: ' + v.text.slice(0, 300));
        assertNoNames(v.text, 'a phone at five holes');
    });
});

// ---------------------------------------------------------------------------
// THE LEGACY CENTS ROUND, RENDERED. tools/money-format-check.js exists for exactly
// this failure - "a $3.33 Net Finish place read $3", and a rounded figure looks
// exactly like an exact one - but its fixtures are FINISHED rounds, so it sweeps the
// named rows and never sees this wave's new line. It passes untouched, which is
// correct and is also a gap: the split is a NEW money surface and it needed its own
// rendered check on a round that settles in cents.
// ---------------------------------------------------------------------------
describe('COLD CHROME: a LEGACY CENTS round prints the split exactly, never rounded', () => {
    let v = null;
    before(async () => {
        // No settlementMode at all is what makes a round legacy: it settles in cents
        // by design. $10 over three places at a third each -> 333 / 333 / 334.
        const legacy = roundData(scoresThrough(5));
        delete legacy.settlementMode;
        legacy.moneyPool = Object.assign({}, legacy.moneyPool, {
            buyIn: 9.99, kp: { amount: 0, holes: [] },
            net: { amount: 10, places: [33.333333, 33.333333, 33.333334] },
            skins: { mode: 'remainder', scoring: 'net', carryOver: false } });
        const LOOK = `(function () {
          var ac = document.getElementById('action-center-mount');
          // \\s, not \s: this is a template literal, so a single backslash is eaten and
          // the regex became /s+/g - which strips the letter s and turns "1st $3.33"
          // into "1 t $3.33". The assertion then blamed the feature for my escaping.
          return JSON.stringify({ text: ((ac && ac.innerText) || 'no mount').replace(/\\s+/g, ' ').trim() });
        })()`;
        const r = await arriveCold({ url: fileUrl('index.html', 'game=NF&group=1'),
            db: { events: { NF: legacy }, global_courses: {}, trips: {}, tournaments: {} },
            settleMs: 3200, viewport: { width: 390, height: 844 },
            steps: [{ tap: '.action-toggle' }, { sleep: 600 }, { expression: LOOK }] });
        v = r.ok ? JSON.parse(r.value[r.value.length - 1]) : { error: r.reason };
    });

    test('the cents are on screen to the cent, and still nobody is named', () => {
        assert.ok(v && !v.error, 'cold arrival failed: ' + (v && v.error));
        assert.match(v.text, /1st \$3\.33/, 'the split rounded a legacy place: ' + v.text.slice(0, 300));
        assert.match(v.text, /3rd \$3\.34/, 'the odd cent is not where the engine put it: ' + v.text.slice(0, 300));
        assert.ok(!/1st \$3 /.test(v.text), 'a $3.33 place printed as $3');
        assertNoNames(v.text, 'a legacy round at five holes');
    });
});
