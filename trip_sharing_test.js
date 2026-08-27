// ============================================================================
// SHARING A TRIP
//
// trip.html?trip=CODE always worked. It was simply never surfaced, so getting
// eleven friends into a trip meant reading four characters aloud and each of
// them typing it - while a ROUND has had copyable group links for months.
//
// THREE SURFACES, THREE RIGHT ANSWERS:
//
//   Share Trip Link   a full URL on the clipboard. One tap for the recipient.
//   Recap card        the trip CODE only. A URL wraps badly at card width and
//                     is untappable inside a screenshot anyway.
//   Text recap        a full URL, because pasted text IS tappable.
//
// The link is built the same way the scorecard's group links are -
// window.location.href minus any existing query - so a trip opened from a
// shared link produces the same link again rather than compounding params.
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

function roundData(seed, confirmed) {
    const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
    const ps = NAMES.map((n,i)=>({ id:101+i, name:n, hcp:'9', playingForMoney:true }));
    const sc = {};
    ps.forEach((p,pi)=>cd.forEach((h,hi)=>{ sc['p'+p.id+'_h'+h.hole] = 4 + ((pi+hi+seed)%3) - 1; }));
    sc['p101_h2'] = 2; sc['p103_h5'] = 9;
    const d = { players: ps, courseData: cd, scores: sc, settlementMode:'whole-dollar', moneyPool: POOL };
    if (confirmed) { d.kpWinners = { h3:'101', h7:'105', h12:'109', h16:'102' };
                     d.kpConfirmed = { confirmed: true }; }
    return d;
}

function trip({ code = 'MYR1', href = 'https://golf-app-5a5.pages.dev/trip.html',
                confirmed = true, rounds = 2, name = 'Myrtle Beach 2026' } = {}) {
    const sb = loadHtmlInlineScript('trip.html', DEPS);
    const linked = [];
    ['Caledonia','True Blue'].slice(0, rounds).forEach((label, i) =>
        linked.push({ label, countsTowardTrip: true, data: roundData(i, confirmed) }));
    vm.runInContext(`
        window.__copied = []; window.__alerts = [];
        alert = m => window.__alerts.push(String(m));
        navigator.clipboard.writeText = t => { window.__copied.push(t); return Promise.resolve(); };
        window.location.href = ${JSON.stringify(href)};
        currentTripCode = ${code === null ? 'null' : JSON.stringify(code)};
        tripData = { name: ${JSON.stringify(name)} };
        cachedRoundResults = ${JSON.stringify(linked)};
        cachedCountedResults = cachedRoundResults;
        renderCumulativeLeaderboard(); renderTripMoneySettlement(); renderTripAwards();
    `, sb);
    return {
        sb, run: c => vm.runInContext(c, sb),
        copy: () => vm.runInContext('copyTripLink({ innerHTML: "x" });', sb),
        copied: () => JSON.parse(JSON.stringify(vm.runInContext('window.__copied', sb))),
        alerts: () => JSON.parse(JSON.stringify(vm.runInContext('window.__alerts', sb))),
        openCard: () => vm.runInContext('openTripRecap();', sb),
        card: () => strip(sb.document.getElementById('trip-recap-card').innerHTML),
        text: () => vm.runInContext('buildShareRecapText()', sb),
    };
}
const settle = () => new Promise(r => setTimeout(r, 5));

// ============================================================================

describe('THE SHARE LINK', () => {

    test('it is a full URL carrying the trip code', () => {
        assert.equal(trip().run('tripShareUrl()'),
            'https://golf-app-5a5.pages.dev/trip.html?trip=MYR1');
    });

    test('an EXISTING query is stripped, not compounded', () => {
        // A trip opened from a shared link must produce the same link again.
        const b = trip({ href: 'https://golf-app-5a5.pages.dev/trip.html?trip=MYR1&foo=1' });
        assert.equal(b.run('tripShareUrl()'),
            'https://golf-app-5a5.pages.dev/trip.html?trip=MYR1');
    });

    test('the code is URL-encoded', () => {
        assert.match(trip({ code: 'A B' }).run('tripShareUrl()'), /trip=A%20B/);
    });

    test('it reaches the clipboard', async () => {
        const b = trip(); b.copy();
        await settle();
        assert.deepEqual(b.copied(), ['https://golf-app-5a5.pages.dev/trip.html?trip=MYR1']);
    });

    test('with no trip open it refuses and says why', async () => {
        const b = trip({ code: null }); b.copy();
        await settle();
        assert.deepEqual(b.copied(), []);
        assert.ok(b.alerts().some(a => /Open a trip first/.test(a)));
    });

    test('the button exists and is a 44px target', () => {
        const src = read('trip.html');
        assert.match(src, /onclick="copyTripLink\(this\)"/);
        assert.match(strip(src), /Share Trip Link/);
        const rule = /\.trip-share-btn \{([^}]*)\}/.exec(src)[1];
        assert.match(rule, /min-height:\s*44px/);
    });

    test('it uses the same base pattern as the scorecard group links', () => {
        const trip_ = read('trip.html');
        const idx = read('index.html');
        assert.match(trip_, /window\.location\.href\.split\('\?'\)\[0\]/);
        assert.match(idx, /window\.location\.href\.split\('\?'\)\[0\]/,
            'one pattern, so the two cannot drift');
    });

    test('the iOS clipboard fallback is present', () => {
        // navigator.clipboard rejects silently in older iOS webviews; without the
        // textarea path the button would appear to do nothing.
        const src = read('trip.html');
        assert.match(src, /function tripFallbackCopy/);
        assert.match(src, /document\.execCommand\('copy'\)/);
        assert.match(src, /catch \(\) => tripFallbackCopy|catch\(\(\) => tripFallbackCopy|\.catch\(\(\) => tripFallbackCopy/);
    });
});

describe('THE RECAP CARD CARRIES THE CODE', () => {

    test('the footer names the trip code', () => {
        const b = trip(); b.openCard();
        assert.match(b.card(), /Join this trip · Trip Code MYR1/);
    });

    test('NOT a URL — it would wrap and is untappable in an image', () => {
        const b = trip(); b.openCard();
        const foot = b.card().slice(b.card().indexOf('Join this trip'));
        assert.ok(!/https?:\/\//.test(foot), 'a link inside a screenshot cannot be tapped');
    });

    test('the footer is omitted when there is no code', () => {
        const b = trip({ code: null });
        b.run('renderTripRecapCard();');
        assert.ok(!/Join this trip/.test(b.card()));
    });

    test('it survives alongside the settled caveat', () => {
        const b = trip({ confirmed: false }); b.openCard();
        const t = b.card();
        assert.match(t, /Not final/, 'the caveat still travels');
        assert.match(t, /Trip Code MYR1/, 'and so does the join code');
    });
});

describe('THE TEXT RECAP CARRIES THE LINK', () => {

    test('pasted text gets a full, tappable URL', () => {
        assert.match(trip().text(), /🔗 Join: https:\/\/golf-app-5a5\.pages\.dev\/trip\.html\?trip=MYR1/);
    });

    test('it is the last line, after the results', () => {
        const lines = trip().text().trim().split('\n');
        assert.match(lines[lines.length - 1], /Join: https/);
    });

    test('omitted with no trip code', () => {
        assert.ok(!/Join: https/.test(trip({ code: null }).text()));
    });

    test('the two share surfaces agree on the destination', () => {
        const b = trip();
        const url = b.run('tripShareUrl()');
        assert.ok(b.text().includes(url), 'text recap and Share button must not differ');
    });
});

describe('NOTHING ELSE MOVED', () => {

    test('the recap card still carries standings, money and awards', () => {
        const b = trip(); b.openCard();
        const t = b.card();
        assert.match(t, /STANDINGS/);
        assert.match(t, /SETTLEMENT/);
        assert.match(t, /AWARDS/);
    });

    test('the settled gate is untouched', () => {
        const b = trip({ confirmed: false }); b.openCard();
        assert.match(b.card(), /SETTLEMENT SO FAR/);
        assert.ok(!/FINAL SETTLEMENT/.test(b.card()));
    });

    test('sharing computes no money', () => {
        const src = read('trip.html');
        const at = src.indexOf('function copyTripLink');
        const fn = src.slice(at, src.indexOf('\n    function joinTrip', at));
        ['computeCombinedNetTotals(','computeMoneyPool(','simplifyDebts(']
            .forEach(t => assert.ok(!fn.includes(t), `sharing must not settle; found ${t}`));
    });

    test('joining by typed code still works', () => {
        const src = read('trip.html');
        assert.match(src, /id="join-trip-input"/);
        assert.match(src, /trip\.html\?trip=\$\{code\}/);
    });

    test('no literal unicode escapes reached the new markup', () => {
        const src = read('trip.html');
        const at = src.indexOf('id="trip-share-btn"');
        const block = src.slice(at - 200, at + 200);
        assert.ok(!/\\u[0-9A-Fa-f]{4}/.test(block.replace(/\\\\u/g, '')),
            'escapes only resolve inside a JS string');
    });
});
