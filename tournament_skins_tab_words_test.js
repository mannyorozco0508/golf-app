// ============================================================================
// THE PUBLIC SKINS TAB IN PLAIN WORDS (Manny 2026-11-19, ADVISOR-20261119-0905
// item 2). What a golfer sees on the Leaderboard's Skins sub-tab:
//   - one header line: "Skins · Gross · No carryover · 6 won", with
//     " · $20 credit a skin" only when an amount is set (TournamentPrizes.shortText,
//     so the event's prize word, credit or cash, never hard-coded); skins games read
//     "Gross and net" / "Net" from the bases they play;
//   - never an "amount not set" line, never "net skins are not built";
//   - the organizer (canManage) sees a quiet "Set an amount ›" only when none is set;
//   - no duplicated per-round summary lines; with carryover off a tied hole reads
//     "Tied · no skin"; with carryover on the "carried to N" runs stay (true there).
// The organizer's own prize-screen Skins card keeps its sentences and controls.
//
// THE USER PATH, in mini-dom: arrive at tournament.html?tourney=STK, the record
// arrives on the page's own listener, and the Skins sub-tab is tapped by running
// the button's own onclick read from the static markup. Nothing is called by name.
// The organizer's link is tapped from the rendered panel the same way.
// HARNESS LIMITS: mini-dom has no layout and does not scroll, so the link's
// scroll/focus is not proved here, only that it opens the prize screen's Skins card
// with its amount box, opened. FIXTURE helpers/prize-fixtures.js starkey(): two rounds
// (Cascade, Olympic), A and B flights; skins on Cascade 4, 9, 15 and Olympic 3, 11, 16,
// every other hole halved. createdAt after 2026-11-19 16:00 UTC: carryover off by default.
//
// BASELINE (final file, 14 tests) against 4b7da2de (tournament.html sha256
// 53c35248054219d9..., swapped in from git show, restored from a saved copy by sha):
// 4 PASS / 10 FAIL. 4 + 10 = 14. The 4 that pass describe what does NOT change or
// was already true: D2 (a golfer never sees "Set an amount"), D3 (an organizer with
// an amount set sees none), E3 (the carryover-on "carried to" runs) and F1 (the
// prize-screen card keeps its controls and sentence). AFTER (tournament.html sha256
// 02f3b2e783d924f7...): 14 / 0.
// NEGATIVE CONTROLS (measured 2026-11-19, each on a copy of the built page, then
// restored from the saved copy, sha 02f3b2e783d924f7 printed beside RESTORED-OK):
//   1. the no-amount fallback put back ("no amount a skin yet") -> A1, C1, D1 red (11 / 3)
//   2. the organizer link shown to everyone (canManage() dropped) -> D2 red (13 / 1)
//   3. the carryover-off tie line put back to the old count sentence -> E1 red (13 / 1)
//   4. games' bases ignored (always "Gross") -> B1, B2 red (12 / 2)
//   5. the organizer's sub line ("per round · carryover ...") back on the tab -> C1 red (13 / 1)
//   6. the link no longer opens the prize screen's card -> D1 red (13 / 1)
// RE-PIN 2026-11-19, LAYOUT B (Manny's pick "Skins tab B"; the layout moved the
// text, the words did not change): the hole rows now sit behind "Hole by hole ›"
// and show one round at a time, so skinsTab() taps "Hole by hole ›" through the
// onclick the page rendered (first round, the default), and E1 taps the Olympic
// chip before reading Olympic's tie line. No sentence was re-worded. The file as it
// stood (971f1168) against the layout-B page: 10 PASS / 4 FAIL (C1, E1, E2, E3: the
// hole rows collapsed). 10 + 4 = 14. After the re-pin: 14 / 0. Layout B itself:
// tournament_skins_tab_b_test.js.
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');
const F = require('./helpers/prize-fixtures.js');
const SRC = require('fs').readFileSync(require('path').join(__dirname, 'tournament.html'), 'utf8');

const NEW = Date.UTC(2026, 10, 19, 17, 0, 0);
const plain = (v) => JSON.parse(JSON.stringify(v));
const text = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const ev = (ps, extra) => F.starkey(Object.assign({ createdAt: NEW }, ps ? { prizeSettings: ps } : {}, extra || {}));
const BOTH = { g1: { name: '', basis: 'both', createdAt: 1 } };

function arrive(rec, user) {
    const sb = loadHtmlInlineScript('tournament.html', [], { search: '?tourney=STK' });
    sb.__dbHandlers.filter((h) => h.event === 'value' && /tournaments\/STK$/.test(h.path)).forEach((h) => h.cb({ val: () => plain(rec), exists: () => true }));
    if (user) sb.__auth.setUser(user);
    return sb;
}
// The tap: the Skins sub-tab button's own onclick, read from the static markup.
function skinsTab(rec, user) {
    const sb = arrive(rec, user);
    const m = /id="lb-sub-skins"[^>]*onclick="([^"]+)"/.exec(SRC);
    assert.ok(m, 'positive: the Skins sub-tab exists in the markup');
    vm.runInContext(m[1], sb);
    // LAYOUT B (2026-11-19): the hole rows sit behind "Hole by hole ›", tapped here
    // through the onclick the page rendered, for the first round (the default filter).
    tapRendered(sb, 'lb-skins-holes');
    const html = String(sb.document.getElementById('lb-skins-panel').innerHTML);
    assert.ok(/id="lb-skins-holes-list"[\s\S]*class="pz-row/.test(html), 'positive: the panel rendered won holes');
    return { sb, html, t: text(html) };
}
function tapRendered(sb, id) {
    const tag = (String(sb.document.getElementById('lb-skins-panel').innerHTML).match(/<button\b[^>]*>/g) || []).find((t) => t.indexOf(`id="${id}"`) !== -1);
    assert.ok(tag, 'nothing rendered with id ' + id);
    vm.runInContext(/\bonclick="([^"]*)"/.exec(tag)[1], sb);
}
// The header: the panel's first block, up to its first closing div.
function head(html) {
    const m = /<div class="lb-skins-head"[^>]*>([\s\S]*?)<\/div>/.exec(html);
    assert.ok(m && text(m[1]), 'positive: the Skins tab has a header line');
    return text(m[1]);
}
const NEVER = /not set|amount a skin yet|not built|no amount|per round|Gross scores only|How prizes go|so far/i;

describe('A. the header line, one round of gross skins', () => {
    test('A1 no amount set: "Skins · Gross · No carryover · 6 won" and nothing more', () => {
        assert.equal(head(skinsTab(ev()).html), 'Skins · Gross · No carryover · 6 won');
    });
    test('A2 an amount set: the event\'s prize word follows, credit here', () => {
        const { html, t } = skinsTab(ev({ perSkin: 20 }));
        assert.equal(head(html), 'Skins · Gross · No carryover · 6 won · $20 credit a skin');
        assert.ok(!/cash/i.test(t), 'a credit event never says cash');
    });
    test('A3 carryover on: the word is "Carryover", and every carried skin counts', () => {
        assert.equal(head(skinsTab(ev({ perSkin: 20, carryover: true })).html), 'Skins · Gross · Carryover · 31 won · $20 credit a skin');
    });
});

describe('B. skins games name their bases', () => {
    test('B1 one game, gross and net: "Gross and net", 12 won', () => {
        assert.equal(head(skinsTab(ev({ perSkin: 20, skins: { games: BOTH } })).html), 'Skins · Gross and net · No carryover · 12 won · $20 credit a skin');
    });
    test('B2 a gross game and a net game: also "Gross and net"; a net-only game reads "Net"', () => {
        const two = { g1: { name: 'A Flight', basis: 'gross', flights: { fA: true }, createdAt: 1 }, g2: { name: 'B Flight', basis: 'net', flights: { fB: true }, createdAt: 2 } };
        assert.match(head(skinsTab(ev({ skins: { games: two } })).html), /^Skins · Gross and net · No carryover · \d+ won$/);
        assert.match(head(skinsTab(ev({ skins: { games: { g1: { name: '', basis: 'net', createdAt: 1 } } } })).html), /^Skins · Net · No carryover · \d+ won$/);
    });
});

describe('C. a golfer never reads developer talk', () => {
    test('C1 no amount, ruled games, carryover on: no "not set", no "not built", no per-round summary', () => {
        [ev(), ev({ skins: { games: BOTH } }), ev({ carryover: true })].forEach((rec) => {
            const { t } = skinsTab(rec);
            assert.doesNotMatch(t, NEVER);
            assert.match(t, /Skins total/, 'positive: the total is still there');
        });
    });
    test('C2 the per-round summary lines are gone ("Cascade 3 skins", "(12 carried)")', () => {
        const { t } = skinsTab(ev({ carryover: true, perSkin: 20 }));
        assert.doesNotMatch(t, /Cascade \d+ skins|Olympic \d+ skins|\(\d+ carried\)/);
        assert.match(t, /Ray Diaz/, 'positive: the hole rows are still there');
    });
});

describe('D. the organizer\'s quiet link', () => {
    test('D1 the organizer, no amount set: "Set an amount ›", and the tap opens the prize screen\'s Skins card with its amount box', () => {
        const { sb, html } = skinsTab(ev(), F.OWNER);
        const m = /<(?:a|button)\b[^>]*onclick="([^"]+)"[^>]*>Set an amount ›</.exec(html);
        assert.ok(m, 'the link is on the tab');
        vm.runInContext('(function () { ' + m[1] + ' })()', sb);   // a handler body, as the browser runs it
        const card = String(sb.document.getElementById('prize-card-skins').innerHTML);
        assert.match(card, /id="prize-skin-amount"/);
        assert.match(card, /id="prize-skins-open"[^>]*>Close</, 'the card is opened by the tap');
    });
    test('D2 a golfer never sees it', () => {
        assert.doesNotMatch(skinsTab(ev()).t, /Set an amount/);
    });
    test('D3 the organizer with an amount set does not see it', () => {
        assert.doesNotMatch(skinsTab(ev({ perSkin: 20 }), F.OWNER).t, /Set an amount/);
    });
});

describe('E. tied holes', () => {
    test('E1 carryover off: "Tied · no skin" with the holes, nothing "carried", nothing "carries past"', () => {
        const { sb, t } = skinsTab(ev());
        assert.match(t, /Tied · no skin: holes 1–3, 5–8, 10–14, 16–18/, 'Cascade');
        tapRendered(sb, 'lb-skins-round-1');   // layout B: one round at a time
        assert.match(String(sb.document.getElementById('lb-skins-panel').innerHTML).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), /Tied · no skin: holes 1, 2, 4–10, 12–15, 17, 18/, 'Olympic');
        assert.doesNotMatch(t, /carried to|carries past|other holes? tied/);
    });
    test('E2 carryover on: the last run reads "tied · no skin" too', () => {
        assert.match(skinsTab(ev({ carryover: true })).t, /Holes 16–18 tied · no skin, nothing carries past the last hole/);
    });
    test('E3 carryover on: the "carried to N" runs stay, they are true there', () => {
        const { t } = skinsTab(ev({ carryover: true }));
        assert.match(t, /Holes 1–3 tied · no skin, carried to 4/);
        assert.match(t, /carried from 1–3/);
    });
});

describe('F. the organizer\'s prize-screen card is unchanged', () => {
    test('F1 its amount box, carryover buttons and summary sentence stay', () => {
        const sb = arrive(ev(), F.OWNER);
        const h = String(sb.document.getElementById('prize-card-skins').innerHTML);
        assert.match(h, /id="prize-skin-amount"/);
        assert.match(h, /Carryover off<\/button>/);
        assert.match(text(h), /No amount a skin yet · per round · carryover off/);
    });
});
