// ============================================================================
// LIVE ACTION — Net Finish, KP, and the scorecard order contract
//
// WHAT WAS ALREADY THERE, and deliberately not rebuilt: the Action Center
// already renders Group Action, Side Matches, press lines with their stakes and
// start holes, and a Money Pool header. Those are covered by bet-strip.js and
// its own tests. Adding a second surface for them would have been the "another
// dashboard" this work was told not to build.
//
// WHAT WAS MISSING: the two whole-field pool prizes. KP showed only a count
// ("2/4 claimed") with no holes and no money, and Net Finish showed only who led
// with no projected payout at all - so the two prizes worth $170 of a $480 pot
// were the least visible things on the screen.
//
// NO MONEY MATH LIVES IN THE PAGE. Both cards read computeMoneyPool(), which has
// already decided which positions a tie consumed and what each golfer is
// allocated. The tie rule in particular is the least intuitive money rule in the
// app - two tied for 1st take 1st AND 2nd money, and the next golfer gets
// nothing - and a page reimplementing it would drift from the receipt.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const PAGE = 'index.html';
const DEPS = ['action-model.js','money-engine.js','pool-engine.js','settlement-engine.js',
              'score-marks.js','bet-strip.js','hole-events.js'];
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

const NAMES = ['Avery','Blake','Casey','Devon','Ellis','Finley','Gray','Harper','Indigo','Jordan','Kendall','Logan'];

// `nets` optionally forces each golfer's gross (hcp 0) so standings are exact.
function boot({ pool = {}, kpWinners = {}, nets = null, thru = null, mode = 'whole-dollar',
                hcps = null, over = {} } = {}) {
    const sb = loadHtmlInlineScript(PAGE, DEPS);
    const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
    const ps = NAMES.map((n,i)=>({id:101+i,name:n,hcp:String(hcps ? hcps[i] : (nets ? 0 : 4+i)),playingForMoney:true}));
    const groupOf = id => Math.floor((Number(id)-101)/4)+1;
    const sc = {};
    ps.forEach((p,pi)=>cd.forEach((h,hi)=>{
        if (thru && h.hole > (thru[groupOf(p.id)] || 0)) return;
        // Distributes a target total across 18 holes without ever producing a
        // non-positive score. The naive version (round the average, dump the
        // remainder on 18) generated scores like -3, which the completeness check
        // correctly rejects as unposted - so the card said PROJECTED on a round the
        // fixture believed was finished.
        if (nets) {
            const base = Math.floor(nets[pi] / cd.length);
            const extra = nets[pi] - base * cd.length;
            sc['p'+p.id+'_h'+h.hole] = base + (hi < extra ? 1 : 0);
        } else {
            sc['p'+p.id+'_h'+h.hole] = h.par + ((pi*3+hi*5)%4) - 1;
        }
    }));
    const gm = {}; ps.forEach(p => { gm[String(p.id)] = groupOf(p.id); });

    const data = Object.assign({
        players: ps, courseData: cd, gameFormat: 'stroke', scores: sc, settlementMode: mode,
        moneyPool: Object.assign({ enabled:true, buyIn:40,
            kp: { amount:100, holes:[3,7,12,16] },
            net: { amount:70, places:[57.142857,42.857143] },
            skins: { mode:'remainder', scoring:'net', carryOver:false } }, pool),
        kpWinners,
    }, over);

    vm.runInContext(`
        currentMode = 'ABCD';
        currentData = ${JSON.stringify(data)};
        window.__scPlayerGroupMap = ${JSON.stringify(gm)};
        window.__scFilteredPlayers = currentData.players.slice(0, 4);
        hasGroupLock = true; lockedGroup = 1; actionCenterOpen = true;
        currentViewedHole = 3;
    `, sb);

    return {
        sb, data, cd, ps,
        banner: () => vm.runInContext('buildMoneyPoolBanner()', sb),
        run: c => vm.runInContext(c, sb),
    };
}

const strip = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

// ============================================================================

describe('LIVE NET FINISH', () => {

    test('projects the paid places with their money', () => {
        const t = strip(boot({ nets: [70,72,75,78,80,82,84,86,88,90,92,94] }).banner());
        assert.match(t, /NET FINISH · \$70/);
        assert.match(t, /1 · Avery · net 70/);
        assert.match(t, /\$40/);
        assert.match(t, /2 · Blake · net 72/);
        assert.match(t, /\$30/);
    });

    test('says PROJECTED while anyone still has a hole to play', () => {
        const t = strip(boot({ thru: { 1:15, 2:14, 3:13 } }).banner());
        assert.match(t, /PROJECTED/);
        assert.ok(!/FINAL/.test(t), 'nothing is final while a group is still out there');
    });

    test('says FINAL only when every participant has posted every hole', () => {
        const t = strip(boot({ nets: [70,72,75,78,80,82,84,86,88,90,92,94] }).banner());
        assert.match(t, /FINAL/);
    });

    test('a TIE shows the shared place and the per-golfer amount', () => {
        // Two golfers level at the top consume 1st AND 2nd: $70 between them.
        const t = strip(boot({ nets: [70,70,75,78,80,82,84,86,88,90,92,94] }).banner());
        assert.match(t, /T1 · Avery \/ Blake/);
        assert.match(t, /\$35 each/);
        assert.ok(!/Casey · net 75/.test(t), 'the next golfer must not be shown a paid place');
    });

    test('an UNEVEN tie split shows the actual allocated amounts', () => {
        // $100 over three tied golfers is $34/$33/$33 - never an average.
        const t = strip(boot({
            pool: { net: { amount:100, places:[50,30,20] }, skins:{ mode:'remainder', scoring:'net', carryOver:false } },
            nets: [70,70,70,78,80,82,84,86,88,90,92,94],
        }).banner());
        assert.match(t, /T1 · Avery \/ Blake \/ Casey/);
        assert.match(t, /\$34 .* \$33 .* \$33|\$34 \/ \$33 \/ \$33/);
    });

    test('nothing renders when the round has no Net Finish prize', () => {
        const t = strip(boot({ pool: { net: undefined, skins:{ mode:'remainder', scoring:'net', carryOver:false } } }).banner());
        assert.ok(!/NET FINISH/.test(t));
    });
});

describe('LIVE KP', () => {

    test('lists every KP hole with its allocated amount', () => {
        const t = strip(boot({ kpWinners: { h3:'101', h7:'105' } }).banner());
        assert.match(t, /KP · \$100/);
        assert.match(t, /H3 · Avery/);
        assert.match(t, /H7 · Ellis/);
        assert.match(t, /\$25/);
    });

    test('unclaimed holes read Pending, not blank', () => {
        const t = strip(boot({ kpWinners: { h3:'101' } }).banner());
        assert.match(t, /H7 · Pending/);
        assert.match(t, /H12 · Pending/);
        assert.match(t, /H16 · Pending/);
    });

    test('an UNEVEN KP split shows the real allocation, not an assumed equal share', () => {
        // $100 across three holes is $34/$33/$33 in a whole-dollar round.
        const t = strip(boot({
            pool: { kp: { amount:100, holes:[3,7,12] } },
            kpWinners: { h3:'101', h7:'105', h12:'109' },
        }).banner());
        assert.match(t, /\$34/);
        assert.match(t, /\$33/);
        assert.ok(!/\$33\.33/.test(t), 'a whole-dollar round must not print cents');
    });

    test('nothing renders when the round has no KP prize', () => {
        const t = strip(boot({ pool: { kp: undefined } }).banner());
        assert.ok(!/KP · \$/.test(t));
    });
});

describe('DIFFERENT GROUP PACES', () => {

    test('15 / 14 / 13 keeps every live surface working and honest', () => {
        const b = boot({ thru: { 1:15, 2:14, 3:13 }, kpWinners: { h3:'101', h7:'105' } });
        const t = strip(b.banner());
        assert.match(t, /PROJECTED/, 'standings can still move');
        assert.match(t, /KP · \$100/, 'KP stays visible while groups are out');
        assert.match(t, /H3 · Avery/);
        assert.match(t, /H12 · Pending/);
    });

    test('posting the late scores updates the surfaces', () => {
        const b = boot({ thru: { 1:15, 2:14, 3:13 }, kpWinners: { h3:'101' } });
        assert.match(strip(b.banner()), /H7 · Pending/);
        b.run(`currentData.kpWinners.h7 = '105';`);
        assert.match(strip(b.banner()), /H7 · Ellis/);
    });
});

describe('SCORE CORRECTION', () => {

    test('correcting a score moves the projected Net Finish', () => {
        const b = boot({ nets: [70,72,75,78,80,82,84,86,88,90,92,94] });
        assert.match(strip(b.banner()), /1 · Avery/);
        // Blow Avery out to the back of the field.
        b.run(`currentData.courseData.forEach(function (h) { currentData.scores['p101_h' + h.hole] = 8; });`);
        const after = strip(b.banner());
        assert.match(after, /1 · Blake/, 'the leader must change with the score');
        assert.ok(!/1 · Avery/.test(after), 'no stale leader may survive');
    });

    test('changing a KP winner moves the KP line', () => {
        const b = boot({ kpWinners: { h3:'101' } });
        assert.match(strip(b.banner()), /H3 · Avery/);
        b.run(`currentData.kpWinners.h3 = '102';`);
        const after = strip(b.banner());
        assert.match(after, /H3 · Blake/);
        assert.ok(!/H3 · Avery/.test(after));
    });
});

describe('SCORECARD ORDER CONTRACT', () => {

    const src = read('index.html');

    test('every live mount sits AFTER Prev/Next in the render', () => {
        const nav = src.indexOf('html += navRowHtml;');
        assert.notEqual(nav, -1, 'the nav row must still be rendered');
        ['live-skins-mount', 'action-center-mount', 'bet-strip-mount'].forEach(id => {
            const at = src.indexOf(`html += '<div id="${id}"></div>';`);
            assert.notEqual(at, -1, `${id} is missing`);
            assert.ok(at > nav, `${id} renders before Prev/Next — score entry must stay first`);
        });
    });

    test('score boxes and the hole header come before the nav row IN THE HOLE VIEW', () => {
        // Scoped to renderHoleView. The first `class="score-input"` in the file
        // belongs to the Full Card renderer, which is a different function further
        // down - comparing raw file offsets across two functions proved nothing about
        // the order a golfer actually sees.
        const start = src.indexOf('function renderHoleView');
        assert.notEqual(start, -1, 'renderHoleView was renamed');
        const fn = src.slice(start, src.indexOf('html += buildHolePickerHtml', start));
        const nav = fn.indexOf('html += navRowHtml;');
        const header = fn.indexOf('hole-view-header');
        assert.ok(nav !== -1, 'the hole view must render the nav row');
        assert.ok(header !== -1 && header < nav, 'the hole header must precede Prev/Next');
        const mount = fn.indexOf('live-skins-mount');
        assert.ok(mount > nav, 'live action must come after Prev/Next');
    });

    test('the live cards live inside the existing Money Pool banner, not a new dashboard', () => {
        assert.match(src, /html \+= buildLiveNetFinish\(r\);/);
        assert.match(src, /html \+= buildLiveKpStatus\(r\);/);
        const banner = src.slice(src.indexOf('function buildMoneyPoolBanner'), src.indexOf('function buildLiveNetFinish'));
        assert.match(banner, /action-section-label/, 'it must remain part of the Action Center section');
    });
});

describe('NO DUPLICATE MONEY MATH', () => {

    const fnOf = (name, end) => {
        const src = read('index.html');
        return src.slice(src.indexOf(`function ${name}`), src.indexOf(`function ${end}`));
    };

    test('Net Finish consumes canonical pool output', () => {
        const f = fnOf('buildLiveNetFinish', 'buildLiveKpStatus');
        assert.match(f, /r\.net\.lines\.forEach/);
        assert.doesNotMatch(f, /placeCents|standings\.filter/, 'the page must not redo position consumption');
        assert.doesNotMatch(f, /getStrokes\(|parseHcp\(/, 'no second handicap calculator');
    });

    test('KP consumes canonical allocated amounts', () => {
        const f = fnOf('buildLiveKpStatus', 'buildPoolKpEntry');
        assert.match(f, /r\.kp\.lines\.forEach/);
        assert.doesNotMatch(f, /splitCentsEvenly\(/, 'the page must not divide the KP bucket itself');
        assert.doesNotMatch(f, /\/ r\.kp\.lines\.length/, 'an assumed equal split would be wrong on an odd bucket');
    });
});

describe('RECEIPT — NET FINISH TIE EXPLANATION', () => {

    const { loadHtmlInlineScript: loadS } = require('./helpers/load-script.js');
    const SDEPS = ['money-engine.js','action-model.js','pool-engine.js','settlement-engine.js','score-marks.js'];

    function receipt({ amount = 70, places = [57.142857, 42.857143], nets, mode = 'whole-dollar' }) {
        const sb = loadS('settlement.html', SDEPS);
        const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
        const ps = NAMES.slice(0, nets.length).map((n,i)=>({id:101+i,name:n,hcp:'0',playingForMoney:true}));
        const sc = {};
        ps.forEach((p,pi)=>cd.forEach((h,hi)=>{
            const base = Math.floor(nets[pi]/cd.length), extra = nets[pi] - base*cd.length;
            sc['p'+p.id+'_h'+h.hole] = base + (hi < extra ? 1 : 0);
        }));
        const data = { players: ps, courseData: cd, gameFormat: 'stroke', scores: sc, settlementMode: mode,
            moneyPool: { enabled:true, buyIn:40, net:{ amount, places },
                         skins:{ mode:'remainder', scoring:'net', carryOver:false } }, kpWinners: {} };
        vm.runInContext(`currentMode='ABCD'; currentData=${JSON.stringify(data)};`, sb);
        vm.runInContext(`renderMoneyPoolSection(currentData, currentData.courseData, currentData.scores);`, sb);
        return strip(sb.document.getElementById('money-pool-section').innerHTML);
    }

    test('a two-way tie for first explains the positions it consumed', () => {
        const t = receipt({ nets: [70,70,75,78] });
        assert.match(t, /T1: Avery \/ Blake/);
        assert.match(t, /Positions 1–2/);
        assert.match(t, /\$40 \+ \$30 = \$70/, 'the arithmetic must be shown, not inferred');
        assert.match(t, /\$35 each/);
        assert.match(t, /next golfer finishes 3rd/);
    });

    test('a three-way tie shows the uneven whole-dollar split', () => {
        const t = receipt({ amount: 100, places: [50,30,20], nets: [70,70,70,78] });
        assert.match(t, /T1: Avery \/ Blake \/ Casey/);
        assert.match(t, /Positions 1–3/);
        assert.match(t, /\$50 \+ \$30 \+ \$20 = \$100/);
        assert.match(t, /Avery \$34 · Blake \$33 · Casey \$33/,
            'an average would not add up to $100 — the real allocation must be shown');
        assert.match(t, /next golfer finishes 4th/);
    });

    test('an outright winner gets no tie explanation', () => {
        const t = receipt({ nets: [68,72,75,78] });
        assert.match(t, /1st: Avery/);
        assert.ok(!/Positions/.test(t), 'nothing to explain when nobody tied');
    });

    test('the Receipt does not recompute the tie itself', () => {
        const src = read('settlement.html');
        const at = src.indexOf('A TIE IS EXPLAINED, NOT JUST MARKED');
        const block = src.slice(at, at + 3000);
        assert.match(block, /r\.net\.lines\.forEach/, 'it must consume canonical lines');
        assert.match(block, /moneyPoolNetPlaceCents/, 'place values must come from the engine');
        assert.doesNotMatch(block, /standings\.filter/, 'the page must not redo position consumption');
    });
});
