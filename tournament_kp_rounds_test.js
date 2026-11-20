// ============================================================================
// KPs PER ROUND - Starkey settings 12 ("Round 1 / Round 2 / Both"), Manny
// 2026-11-19 "then KPs 12-13 (rules publish later, my OK)", "Preview only".
//
// A two-round event plays every hole twice, so its contest holes live on the
// round: tournaments/<code>/rounds/<rid>/contests/h<N>, entries at
// contestEntries/<code>/r/<rid>/h<N>, proofs at contestProofs/<code>/r/<rid>/...
// A one-round event keeps every path it had (tournament_contests_test.js). The
// round paths need the round blocks of the proposed rules change
// (tools/kp-rules-emulator-check.js: 18 / 18 against the live rules and the
// proposal); nothing is published.
//
// THE USER PATH, in mini-dom: the organizer arrives at tournament.html and taps
// the Contests tab; a golfer arrives on the round's group link. Taps run the
// onclick the page rendered; nothing is called by name.
//
// BASELINE (final file, 6 tests) against c9db9cc5 (KPs per flight, before rounds;
// tournament.html, tournament-contests.js, tournament-prizes.js and
// tournament-scorecard.html swapped in, restored by sha): 1 PASS / 5 FAIL. The 1
// that passes is C2 (no prompt where the round has no KP), true there because
// no round had any prompt. 1 + 5 = 6. After: 6 / 0.
// NEGATIVE CONTROLS (restored by copying the saved files back; contests
// 5df19d2fda2c, tournament.html 6639e2fee246, scorecard 13b9380b6b58 printed
// beside RESTORED-OK):
//   1. the paths ignore the round (event paths)     -> 3 fail, A2 A3 C1
//   2. the view ignores the round's contest holes  -> 3 fail, A3 B1 C1
//   3. the card turns contests off on two rounds   -> 1 fail, C1
//   4. the KPs card reads one round only            -> 1 fail, B1
//   5. the entries ignore the round                 -> 2 fail, A3 B1
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const F = require('./helpers/prize-fixtures.js');

const plain = (v) => JSON.parse(JSON.stringify(v));
const TS = { '.sv': 'timestamp' };
const ORG_HTML = fs.readFileSync(path.join(REPO_ROOT, 'tournament.html'), 'utf8');
const text = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
function fire(sb, re, value) {
    const hs = sb.__dbHandlers.filter((h) => h.event === 'value' && re.test(h.path));
    assert.ok(hs.length > 0, 'no listener on ' + re);
    hs.forEach((h) => h.cb({ val: () => plain(value), exists: () => value != null }));
}
const el = (sb, id) => sb.document.getElementById(id);
const html = (sb, id) => String(el(sb, id).innerHTML || '');
function tapStr(sb, markup, pick) {
    const tags = markup.match(/<(button|span)\b[^>]*>/g) || [];
    const tag = tags.find(pick);
    assert.ok(tag, 'nothing to tap');
    const m = /\bonclick="([^"]*)"/.exec(tag);
    const ds = {};
    tag.replace(/\bdata-([a-z-]+)="([^"]*)"/g, (_, k, v) => { ds[k] = v.replace(/&amp;/g, '&'); });
    sb.__tapEl = { dataset: ds };
    return vm.runInContext('(function () { return ' + m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'") + ' }).call(__tapEl)', sb);
}
const writesUnder = (sb, re) => plain(sb.__dbWrites.filter((w) => re.test(w.path))).map((w) => [w.path, w.op, w.value]);

// The two-round fixture (Cascade r1, Olympic r2). Par 3s: holes 5, 7, 13, 15.
function event(r1contests, r2contests, extra) {
    const r = F.starkey(Object.assign({ prizeSettings: { perContest: 50 } }, extra || {}));
    if (r1contests) r.rounds.r1.contests = r1contests;
    if (r2contests) r.rounds.r2.contests = r2contests;
    return r;
}
function owner(rec, entries) {
    const sb = loadHtmlInlineScript('tournament.html', [], { search: '?tourney=STK' });
    sb.__auth.setUser(F.OWNER);
    fire(sb, /^tournaments\/STK$/, rec);
    fire(sb, /^contestEntries\/STK$/, entries || {});
    tapStr(sb, ORG_HTML, (t) => /\bid="tab-btn-contests"/.test(t));
    return sb;
}

describe('A. THE ORGANIZER: one round at a time', () => {
    test('A1 the Contests tab opens on the first round, with a chip per round and the course\'s own suggestion', () => {
        const sb = owner(event());
        const h = html(sb, 'contest-holes-list');
        assert.match(h, /id="contest-rounds"/);
        assert.match(text(h), /^Cascade Olympic Suggested: closest to the pin on every par 3 \(holes 5, 7, 13, 15\)/);
        assert.match(h, /class="on" aria-pressed="true" data-r="r1"/);
        assert.doesNotMatch(text(h), /one-round events/);
    });
    test('A2 Use these on Cascade writes the round\'s contest holes under rounds/r1, in one update', () => {
        const sb = owner(event());
        tapStr(sb, html(sb, 'contest-holes-list'), (t) => /id="contest-use-suggested"/.test(t));
        // a root update: the harness records no path (undefined)
        const w = plain(sb.__dbWrites.filter((x) => x.path == null && x.op === 'update')).map((x) => [x.path, x.op, x.value]);
        assert.equal(w.length, 1);
        assert.deepEqual(Object.keys(w[0][2]).sort(), ['tournaments/STK/rounds/r1/contests/h13', 'tournaments/STK/rounds/r1/contests/h15', 'tournaments/STK/rounds/r1/contests/h18', 'tournaments/STK/rounds/r1/contests/h5', 'tournaments/STK/rounds/r1/contests/h7']);
    });
    test('A3 tap Olympic: its own list, and Make winner writes under rounds/r2', () => {
        const ent = { r: { r2: { h7: { pS: { name: 'Sam Ortiz', team: 'g1', kind: 'kp', inches: 40, by: 'typed', at: 1 } } } } };
        const sb = owner(event({ h5: { kind: 'kp', allowGps: true } }, { h7: { kind: 'kp', allowGps: true } }), ent);
        assert.match(text(html(sb, 'contest-holes-list')), /Hole 5 par 3 Closest to the pin/, 'positive: Cascade first');
        tapStr(sb, html(sb, 'contest-holes-list'), (t) => /data-r="r2"/.test(t));
        assert.match(text(html(sb, 'contest-holes-list')), /Hole 7 par 3 Closest to the pin/);
        assert.doesNotMatch(text(html(sb, 'contest-holes-list')), /Hole 5 par/);
        assert.match(text(html(sb, 'contest-entries')), /^Hole 7 entries Sam Ortiz 3 ft 4 in Make winner/);
        tapStr(sb, html(sb, 'contest-entries'), (t) => /data-entry="pS"/.test(t) && /makeContestWinner/.test(t));
        assert.deepEqual(writesUnder(sb, /contests\/h7$/), [['tournaments/STK/rounds/r2/contests/h7', 'update', { winner: 'pS', lockedAt: TS }]]);
    });
});

describe('B. THE KPs CARD AND THE RECAP read every round', () => {
    test('B1 a confirmed winner on each round: both on the KPs card, each named with its round', () => {
        const ent = { r: { r1: { h5: { pA: { name: 'Ana Diaz', team: 'g1', kind: 'kp', inches: 30, by: 'typed', at: 1 } } }, r2: { h7: { pS: { name: 'Sam Ortiz', team: 'g1', kind: 'kp', inches: 40, by: 'typed', at: 1 } } } } };
        const sb = owner(event({ h5: { kind: 'kp', allowGps: true, winner: 'pA', lockedAt: 1 } }, { h7: { kind: 'kp', allowGps: true, winner: 'pS', lockedAt: 2 } }), ent);
        const k = text(html(sb, 'prize-card-kps'));
        assert.match(k, /5 Ana Diaz Cascade · closest · 2 ft 6 in \$50 credit/);
        assert.match(k, /7 Sam Ortiz Olympic · closest · 3 ft 4 in \$50 credit/);
    });
});

describe('C. THE GOLFER on the round\'s group link', () => {
    // Cascade open, group g1 (Ana, Sam) has played holes 1-4: the next hole is 5, a par 3.
    function roundEvent(r1contests) {
        const r = event(r1contests);
        r.rounds.r1.status = 'open';
        r.rounds.r1.scoringGroups = { g1: { name: 'Group 1', startingHole: '1', playerIds: ['pA', 'pS'], createdAt: 1 } };
        const sc = {}; ['pA', 'pS'].forEach((p) => [1, 2, 3, 4].forEach((h) => { sc[p + '_h' + h] = F.PAR[h - 1]; }));
        r.rounds.r1.scores = sc;
        return r;
    }
    function card(rec, search) {
        const sb = loadHtmlInlineScript('tournament-scorecard.html', [], { search });
        const make = sb.document.createElement.bind(sb.document);
        sb.document.createElement = (tag) => { const n = make(tag); if (String(tag).toLowerCase() === 'template') n.content = { querySelectorAll: () => [] }; return n; };
        fire(sb, /^tournaments\/STK$/, rec);
        fire(sb, /^contestEntries\/STK$/, {});
        return sb;
    }
    const shown = (sb) => ((el(sb, 'contest-prompt').style || {}).display || '') !== 'none';
    const K = 'a'.repeat(32);
    test('C1 Cascade has a KP on 5: the round link shows the prompt; Save writes the entry and its proof under r/r1', async () => {
        const sb = card(roundEvent({ h5: { kind: 'kp', allowGps: true } }), `?tourney=STK&group=g1&round=r1&k=${K}`);
        assert.equal(shown(sb), true);
        assert.match(text(html(sb, 'contest-prompt')), /Hole 5 · Closest to the pin/);
        tapStr(sb, html(sb, 'contest-prompt'), (t) => /data-entry="pA"/.test(t));
        el(sb, 'cp-ft').value = '2'; el(sb, 'cp-in').value = '6';
        tapStr(sb, html(sb, 'contest-prompt'), (t) => /id="cp-save"/.test(t));
        const w = plain(sb.__dbWrites.filter((x) => x.op === 'update' && x.value && Object.keys(x.value).some((k) => /^contestEntries\//.test(k))));
        assert.equal(w.length, 1);
        assert.deepEqual(Object.keys(w[0].value).sort(), ['contestEntries/STK/r/r1/h5/pA', 'contestProofs/STK/r/r1/h5/pA']);
        assert.equal(w[0].value['contestEntries/STK/r/r1/h5/pA'].inches, 30);
    });
    test('C2 the event\'s other round has the KP, not this one: no prompt on Cascade', () => {
        const r = roundEvent(null); r.rounds.r2.contests = { h5: { kind: 'kp', allowGps: true } };
        assert.equal(shown(card(r, `?tourney=STK&group=g1&round=r1&k=${K}`)), false);
    });
});
