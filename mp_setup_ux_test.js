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
