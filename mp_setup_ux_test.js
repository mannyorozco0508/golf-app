// ============================================================================
// MONEY POOL SETUP UX — rendered, on the real markup
//
// WHY THIS FILE EXISTS
// The Money Pool card's money was right and its LABELS were broken: the setup
// block is raw HTML, but it was written with \uXXXX escapes, which only resolve
// inside JavaScript string literals. Marty opened Step 6 on a tablet and read
// "\uD83C\uDFC6 Money Pool (whole-round pot)" and "Top 3 \u2014 50/30/20".
//
// No existing test could catch it: every other test asserted behaviour, and the
// escapes were syntactically fine. So this file asserts what a HUMAN SEES -
// the literal text of the setup card, and the live allocation summary the
// organizer trusts before saving a pot.
//
// It changes no money rules. Every figure here is read from the same
// validateMoneyPool() the engine and the save gate use.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makePlayers } = require('./helpers/fixtures.js');

const ADMIN = fs.readFileSync(path.join(REPO_ROOT, 'admin.html'), 'utf8');

// The Money Pool setup card as the browser receives it.
function poolCardMarkup() {
    const start = ADMIN.indexOf('<!-- MONEY POOL');
    assert.ok(start > -1, 'the Money Pool setup card must exist');
    const end = ADMIN.indexOf('<div class="wizard-nav-row">', start);
    return ADMIN.slice(start, end);
}

// Visible text only: tags and comments stripped, so a \u inside an explanatory
// code comment is documentation, not something an organizer reads.
function visibleText(markup) {
    return markup
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
describe('NO LITERAL UNICODE ESCAPES REACH THE ORGANIZER', () => {
    const PATTERNS = [
        [/\\u[0-9A-Fa-f]{4}/, 'a \\uXXXX escape'],
        [/uD83[0-9A-Fa-f]/, 'a surrogate-pair fragment (uD83x)'],
        [/u2014/, 'an escaped em dash (u2014)'],
        [/uFE0F|u00B7|u2713|u26A0/, 'another escaped codepoint']
    ];

    test('the setup card contains no escape text at all', () => {
        const text = visibleText(poolCardMarkup());
        PATTERNS.forEach(([re, label]) => {
            assert.ok(!re.test(text), `the Money Pool card still shows ${label}: ${text.match(re)}`);
        });
    });

    test('every <option> label in the card is clean', () => {
        // Options are what a golfer scrolls through on a phone; a broken label here
        // is the hardest kind to notice in code review and the easiest to see live.
        const opts = poolCardMarkup().match(/<option[^>]*>([^<]*)</g) || [];
        assert.ok(opts.length >= 7, 'the card should still offer its payout and skins choices');
        opts.forEach(o => {
            assert.ok(!/\\u|uD83|u2014/.test(o), `broken option label: ${o}`);
        });
    });

    test('real emoji are present, not descriptions of emoji', () => {
        const text = visibleText(poolCardMarkup());
        ['\u{1F3C6}', '\u{1F4CD}', '\u{1F947}', '\u{1F963}'].forEach(e =>
            assert.ok(text.includes(e), `expected the ${e} character itself in the card`));
    });
});

// ---------------------------------------------------------------------------
describe('GOLFER LANGUAGE, NOT SPEC LANGUAGE', () => {
    const text = () => visibleText(poolCardMarkup());

    test('section headings read plainly', () => {
        assert.match(text(), /Money Pool/);
        assert.match(text(), /Buy-in per player/);
        assert.match(text(), /KP Pool/);
        assert.match(text(), /Net Finish Pool/);
        assert.match(text(), /Net Payout/);
        assert.match(text(), /KP Holes/);
    });

    test('the old technical labels are gone', () => {
        const t = text();
        assert.ok(!/Buy-in per golfer \(\$\)/.test(t));
        assert.ok(!/total \$, 0 = none/.test(t), 'the "(total $, 0 = none)" phrasing must be gone');
        assert.ok(!/comma list, e\.g\./.test(t), 'the KP holes label must not read like a spec');
        assert.ok(!/Paid places/.test(t));
    });

    test('net payout choices are scannable', () => {
        const t = text();
        assert.match(t, /Winner Take All\s*—\s*100%/);
        assert.match(t, /Top 2\s*—\s*60 \/ 40/);
        assert.match(t, /Top 3\s*—\s*50 \/ 30 \/ 20/);
        assert.match(t, /Top 4\s*—\s*40 \/ 30 \/ 20 \/ 10/);
    });

    test('the KP holes field guides without jargon', () => {
        const card = poolCardMarkup();
        assert.match(card, /id="mp-kp-holes"[^>]*placeholder="4, 14"/);
        assert.match(visibleText(card), /separated by commas/);
    });

    test('Marty\'s defaults are pre-filled so only KP holes need typing', () => {
        const card = poolCardMarkup();
        assert.match(card, /id="mp-buyin"[^>]*value="40"/);
        assert.match(card, /id="mp-kp-amount"[^>]*value="100"/);
        assert.match(card, /id="mp-net-amount"[^>]*value="100"/);
        assert.match(card, /value="50,30,20" selected/);
        assert.match(card, /value="remainder" selected/);
        assert.match(card, /value="net" selected/);
        assert.match(card, /value="yes" selected/);
        // The pot itself is never hardcoded - it derives from the field.
        assert.ok(!/480/.test(card), 'the card must not hardcode a pot size');
    });
});

// ---------------------------------------------------------------------------
describe('LIVE ALLOCATION SUMMARY — the organizer does no arithmetic', () => {
    const PAGE = ['course-data.js', 'action-model.js', 'money-engine.js', 'settlement-engine.js', 'pool-engine.js'];

    // Boots admin with a real field and drives the actual setup handlers.
    function boot(n, opts) {
        const o = opts || {};
        const players = makePlayers(
            Array.from({ length: n }, (_, i) => 'P' + (i + 1)),
            Array.from({ length: n }, () => 0));
        const sb = loadHtmlInlineScript('admin.html', PAGE);
        // The DOM stub does not parse HTML value= attributes the way a browser does,
        // so the card's own defaults are asserted against the MARKUP above and seeded
        // explicitly here. Anything the caller overrides wins.
        vm.runInContext(`
            captureCurrentPlayerInputs = function () { return ${JSON.stringify(players)}; };
            document.getElementById('mp-enabled').checked = ${o.off ? 'false' : 'true'};
            __setElement('mp-buyin', '40');
            __setElement('mp-kp-amount', '100');
            __setElement('mp-net-amount', '100');
            __setElement('mp-net-places', '50,30,20');
            __setElement('mp-skins-mode', 'remainder');
            __setElement('mp-skins-scoring', 'net');
            __setElement('mp-skins-carry', 'yes');
            ${o.buyIn !== undefined ? `__setElement('mp-buyin', '${o.buyIn}');` : ''}
            ${o.kp !== undefined ? `__setElement('mp-kp-amount', '${o.kp}');` : ''}
            ${o.holes !== undefined ? `__setElement('mp-kp-holes', '${o.holes}');` : ''}
            ${o.net !== undefined ? `__setElement('mp-net-amount', '${o.net}');` : ''}
            ${o.places ? `__setElement('mp-net-places', '${o.places}');` : ''}
            ${o.skinsMode ? `__setElement('mp-skins-mode', '${o.skinsMode}');` : ''}
            ${o.skinsAmount !== undefined ? `__setElement('mp-skins-amount', '${o.skinsAmount}');` : ''}
            mpToggle();
        `, sb);
        return {
            math: () => sb.document.getElementById('mp-math').innerHTML || '',
            mathClass: () => sb.document.getElementById('mp-math').className || '',
            text: id => (sb.document.getElementById(id) || {}).textContent || '',
            noteShown: () => {
                const n2 = sb.document.getElementById('mp-skins-note');
                return !!n2 && n2.style.display === 'block';
            }
        };
    }

    test('12 x $40 shows the $480 pot and the $280 remainder', () => {
        const b = boot(12, { holes: '4,14' });
        assert.match(b.text('mp-pot-line'), /12 players × \$40 = \$480 total pool/);
        assert.match(b.text('mp-skins-line'), /Skins pot: \$280/);
    });

    test('the summary spells out every bucket and balances', () => {
        const m = boot(12, { holes: '4,14' }).math();
        const t = m.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        assert.match(t, /Total pool \$480/);
        assert.match(t, /KP \$100/);
        assert.match(t, /Net finish \$100/);
        assert.match(t, /Skins \$280/);
        assert.match(t, /Allocated \$480 of \$480/);
        assert.match(m, /\u2713/, 'a valid pot ends in a tick');
        assert.ok(!/mp-bad/.test(m));
    });

    test('per-section hints do the division: $50 each, and the net places', () => {
        const b = boot(12, { holes: '4,14' });
        assert.match(b.text('mp-kp-split'), /\$50 each across 2 holes/);
        assert.match(b.text('mp-net-split'), /1st \$50/);
        assert.match(b.text('mp-net-split'), /2nd \$30/);
        assert.match(b.text('mp-net-split'), /3rd \$20/);
    });

    test('1 KP and 4 KPs re-divide live, with no code change', () => {
        assert.match(boot(12, { holes: '14' }).text('mp-kp-split'), /\$100 each across 1 hole/);
        assert.match(boot(12, { holes: '4,8,12,14' }).text('mp-kp-split'), /\$25 each across 4 holes/);
    });

    test('the pot derives from the field: 8 x $50 = $400', () => {
        const b = boot(8, { buyIn: 50, holes: '4' });
        assert.match(b.text('mp-pot-line'), /8 players × \$50 = \$400 total pool/);
        const t = b.math().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        assert.match(t, /Total pool \$400/);
        assert.match(t, /Allocated \$400 of \$400/);
    });

    test('OVER BUDGET says the overage in dollars, not spec language', () => {
        const b = boot(12, { kp: 300, net: 300, holes: '4', skinsMode: 'fixed', skinsAmount: 100 });
        const t = b.math().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        assert.equal(b.mathClass(), 'mp-bad', 'the summary must turn red');
        assert.match(t, /Over by \$220/);
        assert.ok(!/over budget/i.test(t), 'the engine\'s spec phrasing must not reach the organizer');
    });

    test('a missing KP hole reads as an instruction', () => {
        const t = boot(12, { holes: '' }).math().replace(/<[^>]+>/g, ' ');
        assert.match(t, /Choose at least one KP hole/);
        assert.ok(!/has money on it but/.test(t), 'the spec phrasing must not reach the organizer');
    });

    test('unassigned money with no remainder bucket is explained', () => {
        const t = boot(12, { kp: 100, net: 100, holes: '4', skinsMode: 'none' }).math().replace(/<[^>]+>/g, ' ');
        assert.match(t, /\$280 still unassigned/);
    });

    test('no players yet: it asks for players instead of showing a wrong pot', () => {
        const b = boot(0, { holes: '4' });
        assert.match(b.text('mp-pot-line') + b.math().replace(/<[^>]+>/g, ' '), /Step 5/);
    });

    test('THE DOUBLE-SKINS WARNING shows while the pool carries a skins pot', () => {
        assert.equal(boot(12, { holes: '4' }).noteShown(), true);
        assert.equal(boot(12, { holes: '4', kp: 100, net: 380, skinsMode: 'none' }).noteShown(), false,
            'no pool skins, no warning');
    });

    test('unticking the box clears every hint and the summary', () => {
        const b = boot(12, { holes: '4,14', off: true });
        assert.equal(b.math(), '');
        assert.equal(b.text('mp-pot-line'), '');
        assert.equal(b.noteShown(), false);
    });
});

// ---------------------------------------------------------------------------
// CUSTOM NET PAYOUTS — the way golfers actually describe the game.
//
// Marty's real Monday came in over group text as "1st forty, 2nd thirty" on a
// $480 pot with $100 of KPs. That is not a percentage of anything clean: $40 of
// $70 is 57.142857%. Forcing the organizer to reverse-engineer percentages was
// the gap; these tests pin the dollar-native mode and prove the preset mode is
// untouched beside it.
// ---------------------------------------------------------------------------
describe('CUSTOM NET PAYOUTS — setup card', () => {
    const PAGE2 = ['course-data.js', 'action-model.js', 'money-engine.js', 'settlement-engine.js', 'pool-engine.js'];

    function boot2(n, o) {
        o = o || {};
        const players = makePlayers(Array.from({ length: n }, (_, i) => 'P' + (i + 1)),
            Array.from({ length: n }, () => 0));
        const sb = loadHtmlInlineScript('admin.html', PAGE2);
        vm.runInContext(`
            captureCurrentPlayerInputs = function () { return ${JSON.stringify(players)}; };
            document.getElementById('mp-enabled').checked = true;
            __setElement('mp-buyin', '${o.buyIn || 40}');
            __setElement('mp-kp-amount', '${o.kp !== undefined ? o.kp : 100}');
            __setElement('mp-kp-holes', '${o.holes !== undefined ? o.holes : '3,9,13,17'}');
            __setElement('mp-net-amount', '100');
            __setElement('mp-net-places', '50,30,20');
            __setElement('mp-skins-mode', 'remainder');
            __setElement('mp-skins-scoring', 'net');
            __setElement('mp-skins-carry', 'yes');
            __setElement('mp-net-mode', '${o.mode || 'custom'}');
            __setElement('mp-net-c1', '${o.c1 !== undefined ? o.c1 : 40}');
            __setElement('mp-net-c2', '${o.c2 !== undefined ? o.c2 : 30}');
            ${o.addPlaces ? 'mpAddPlace();'.repeat(o.addPlaces) : ''}
            ${o.c3 !== undefined ? `__setElement('mp-net-c3', '${o.c3}');` : ''}
            ${o.c4 !== undefined ? `__setElement('mp-net-c4', '${o.c4}');` : ''}
            ${o.removePlaces ? 'mpRemovePlace();'.repeat(o.removePlaces) : ''}
            mpToggle();
        `, sb);
        const txt = id => (sb.document.getElementById(id) || {}).textContent || '';
        const vis = id => {
            const el = sb.document.getElementById(id);
            return !!el && el.style.display !== 'none';
        };
        return {
            sb,
            summary: () => (sb.document.getElementById('mp-math').innerHTML || '')
                .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
            cls: () => sb.document.getElementById('mp-math').className || '',
            netSplit: () => txt('mp-net-split'),
            skinsLine: () => txt('mp-skins-line'),
            kpSplit: () => txt('mp-kp-split'),
            presetShown: () => vis('mp-net-preset-wrap'),
            customShown: () => vis('mp-net-custom-wrap'),
            rowShown: n => vis('mp-net-c' + n + '-row'),
            captured: () => { vm.runInContext(`window.__cap = captureMoneyPool();`, sb); return sb.window.__cap; }
        };
    }

    test('the card offers both payout modes in plain language', () => {
        const card = poolCardMarkup();
        assert.match(card, /id="mp-net-mode"/);
        assert.match(visibleText(card), /Split a pool by percentage/);
        assert.match(visibleText(card), /Exact dollar amounts/);
        // Comments stripped: the card's own note explaining the escape trap is
        // documentation, not something an organizer reads.
        assert.ok(!/\\u|uD83|u2014/.test(visibleText(card)), 'the new controls carry no escape text');
    });

    test('MARTY TOMORROW: 1st $40 / 2nd $30 renders, total $70, skins $310', () => {
        const b = boot2(12);
        assert.match(b.netSplit(), /1st \$40/);
        assert.match(b.netSplit(), /2nd \$30/);
        assert.match(b.netSplit(), /Net Finish Total: \$70/);
        assert.match(b.skinsLine(), /Skins pot: \$310/);
        assert.match(b.kpSplit(), /\$25 each across 4 holes/);
    });

    test('the summary reads $480 / $100 / $70 / $310 and balances', () => {
        const t = boot2(12).summary();
        assert.match(t, /Total pool \$480/);
        assert.match(t, /KP \$100/);
        assert.match(t, /Net finish \$70/);
        assert.match(t, /Skins \$310/);
        assert.match(t, /Allocated \$480 of \$480/);
        assert.equal(boot2(12).cls(), '', 'a valid pot is not red');
    });

    test('capture stores ONLY the amounts — the total is derived', () => {
        const cap = boot2(12).captured();
        assert.equal(cap.net.payoutMode, 'custom');
        assert.equal(cap.net.amounts.join(','), '40,30');
        assert.equal(cap.net.amount, undefined, 'no stored total that could disagree with its places');
    });

    test('switching custom → preset restores the percentage pool', () => {
        const b = boot2(12, { mode: 'preset' });
        assert.equal(b.presetShown(), true);
        assert.equal(b.customShown(), false);
        assert.match(b.netSplit(), /1st \$50/);
        assert.match(b.summary(), /Net finish \$100/);
        assert.match(b.skinsLine(), /Skins pot: \$280/);
        const cap = b.captured();
        assert.equal(cap.net.amount, 100);
        assert.equal(cap.net.places.join(','), '50,30,20');
    });

    test('switching preset → custom swaps the panes', () => {
        const b = boot2(12, { mode: 'custom' });
        assert.equal(b.customShown(), true);
        assert.equal(b.presetShown(), false);
    });

    test('adding a third place recalculates the remainder', () => {
        const b = boot2(12, { addPlaces: 1, c3: 20 });
        assert.equal(b.rowShown(3), true);
        assert.match(b.netSplit(), /3rd \$20/);
        assert.match(b.summary(), /Net finish \$90/);
        assert.match(b.skinsLine(), /Skins pot: \$290/);
    });

    test('a fourth place works, and the Add button stops at four', () => {
        const b = boot2(12, { addPlaces: 2, c3: 20, c4: 10 });
        assert.equal(b.rowShown(4), true);
        assert.match(b.summary(), /Net finish \$100/);
        assert.match(b.skinsLine(), /Skins pot: \$280/);
    });

    test('removing a place clears its money and recalculates', () => {
        const b = boot2(12, { removePlaces: 1 });
        assert.equal(b.rowShown(2), false);
        assert.match(b.netSplit(), /1st \$40/);
        assert.ok(!/2nd/.test(b.netSplit()), '2nd place is gone, not merely hidden');
        assert.match(b.summary(), /Net finish \$40/);
        assert.match(b.skinsLine(), /Skins pot: \$340/);
    });

    test('custom payouts over the pot are refused with the overage', () => {
        const b = boot2(12, { c1: 400, c2: 300 });
        assert.equal(b.cls(), 'mp-bad');
        assert.match(b.summary(), /Over by \$320/);
    });

    test('a negative payout is named, not silently dropped', () => {
        const b = boot2(12, { c1: -5, c2: '' });
        assert.equal(b.cls(), 'mp-bad');
        assert.match(b.summary(), /\$0 or more/);
    });
});

// ---------------------------------------------------------------------------
describe('CUSTOM NET PAYOUTS — money, ties and receipt', () => {
    const { loadJsFile } = require('./helpers/load-script.js');
    const { makeCourseData } = require('./helpers/fixtures.js');
    const CD18 = makeCourseData(18);
    const E2 = (() => {
        const sb = loadJsFile('money-engine.js');
        ['action-model.js', 'settlement-engine.js', 'pool-engine.js', 'bet-strip.js', 'hole-events.js']
            .forEach(f => vm.runInContext(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'), sb, { filename: f }));
        return sb;
    })();
    const P12 = makePlayers(['Marty', 'Manny', 'John', 'Steve', 'Stan', 'Greg', 'Tony', 'James',
        'Ryan', 'Dalen', 'Nick', 'Paul'], new Array(12).fill(0));
    const ID = i => String(P12[i].id);
    const ladder = () => { const s = {}; P12.forEach((p, i) =>
        CD18.forEach(h => { s[`p${p.id}_h${h.hole}`] = h.par + i; })); return s; };
    const MARTY = () => JSON.parse(JSON.stringify({
        players: P12, courseData: CD18, gameFormat: 'stroke',
        kpWinners: { h3: ID(0), h9: ID(1), h13: ID(2), h17: ID(3) }, kpConfirmed: { confirmed: true },
        moneyPool: { enabled: true, buyIn: 40,
            kp: { amount: 100, holes: [3, 9, 13, 17] },
            net: { payoutMode: 'custom', amounts: [40, 30] },
            skins: { mode: 'remainder', scoring: 'net', carryOver: true } } }));
    const pool2 = (d, sc) => { vm.runInContext(`window.__p2 = computeMoneyPool(${JSON.stringify(d)},
        ${JSON.stringify(CD18)}, ${JSON.stringify(sc)});`, E2); return E2.window.__p2; };

    test('MARTY ACCEPTANCE: $480 = $100 KP + $70 net + $310 skins, ledger $0', () => {
        const r = pool2(MARTY(), ladder());
        assert.equal(r.valid, true, (r.errors || []).join('|'));
        assert.equal(r.totalPoolCents, 48000);
        assert.equal(r.kp.perHoleCents.join(','), '2500,2500,2500,2500');
        assert.equal(r.net.lines.map(l => l.cents).join(','), '4000,3000');
        assert.equal(r.skins.amountCents, 31000);
        const prizes = r.kp.lines.reduce((a, l) => a + (l.winnerId ? l.cents : 0), 0)
            + r.net.lines.reduce((a, l) => a + l.cents, 0)
            + r.skins.lines.reduce((a, l) => a + l.cents, 0);
        assert.equal(prizes + r.refund.cents, 48000, 'every cent of the pot is accounted for');
        assert.equal(Object.values(r.perPlayerCents).reduce((a, b) => a + b, 0), 0);
    });

    test('THE TIE RULE holds on custom amounts: $40 + $30 split $35 each', () => {
        const tied = ladder();
        CD18.forEach(h => { tied[`p${P12[1].id}_h${h.hole}`] = tied[`p${P12[0].id}_h${h.hole}`]; });
        const r = pool2(MARTY(), tied);
        assert.equal(r.net.lines.length, 1, 'the tie consumed both paid places');
        assert.equal(r.net.lines[0].cents, 7000);
        assert.equal(r.net.lines[0].split, true);
        assert.equal(r.net.lines[0].ids.length, 2);
        assert.equal(Object.values(r.perPlayerCents).reduce((a, b) => a + b, 0), 0);
    });

    test('PRESET PARITY: a percentage round is unchanged by this feature', () => {
        const d = { players: P12, moneyPool: { enabled: true, buyIn: 40,
            net: { amount: 100, places: [50, 30, 20] },
            skins: { mode: 'remainder', scoring: 'net' } } };
        const r = pool2(d, ladder());
        assert.equal(r.net.lines.map(l => l.cents).join(','), '5000,3000,2000');
        assert.equal(r.skins.amountCents, 38000);
    });

    test('the RECEIPT prints the custom amounts', () => {
        const sb = loadHtmlInlineScript('settlement.html',
            ['action-model.js', 'money-engine.js', 'settlement-engine.js', 'pool-engine.js', 'bet-strip.js', 'hole-events.js']);
        vm.runInContext(`
            db.ref = function () { return { on: function () {}, set: function () { return Promise.resolve(); } }; };
            currentMode = 'ABCD'; currentData = ${JSON.stringify(MARTY())};
            currentData.scores = ${JSON.stringify(ladder())};
            renderMoneyPoolSection(currentData, currentData.courseData, currentData.scores);
        `, sb);
        const html = sb.document.getElementById('money-pool-section').innerHTML;
        assert.match(html, /Money Pool/);
        assert.match(html, /Hole 3: Marty/);
        assert.match(html, /Hole 17: Steve/);
        assert.match(html, /1st: Marty[\s\S]*\$40/);
        assert.match(html, /2nd: Manny[\s\S]*\$30/);
        assert.match(html, /Skins Pot — \$310/);
    });

    test('adaptability A–F: totals and remainder follow the config, no code change', () => {
        // This case is about NET and SKINS config adaptability, so its KP is decided
        // outright - otherwise the unresolved KP money would make the zero-sum
        // assertion below fail for a reason that has nothing to do with what it tests.
        const mk = net => ({ players: P12,
            kpConfirmed: { confirmed: true },
            kpNoWinner: { h3: true, h9: true, h13: true, h17: true },
            moneyPool: { enabled: true, buyIn: 40,
            kp: { amount: 100, holes: [3, 9, 13, 17] }, net,
            skins: { mode: 'remainder', scoring: 'net' } } });
        const cases = [
            [{ payoutMode: 'custom', amounts: [40, 30] }, 7000, 31000],
            [{ payoutMode: 'custom', amounts: [50, 30, 20] }, 10000, 28000],
            [{ payoutMode: 'custom', amounts: [100] }, 10000, 28000],
            [{ payoutMode: 'custom', amounts: [50, 50] }, 10000, 28000],
            [{ amount: 100, places: [60, 40] }, 10000, 28000],
            [{ amount: 100, places: [50, 30, 20] }, 10000, 28000]
        ];
        cases.forEach(([net, netCents, skinsCents], i) => {
            const r = pool2(mk(net), ladder());
            assert.equal(r.net.lines.reduce((a, l) => a + l.cents, 0), netCents, `case ${i + 1} net`);
            assert.equal(r.skins.amountCents, skinsCents, `case ${i + 1} skins`);
            assert.equal(Object.values(r.perPlayerCents).reduce((a, b) => a + b, 0), 0, `case ${i + 1} zero-sum`);
        });
    });
});
