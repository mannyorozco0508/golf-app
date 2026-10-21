// ============================================================================
// URGENT-038 PART 1 - BETS & GAMES CLARITY, THE PURE HALF (#24, #26, #27, #28).
// The Chrome halves: urgent038_bets_chrome_test.js (#24, #26, + Bet's #27) and
// urgent038_gameday_nassau_chrome_test.js (Game Day's #27, #28).
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const GPS = fs.existsSync(path.join(REPO_ROOT, 'gps-bet.js'));

describe('#27 ONE NASSAU DEFAULT: $5 / $5 / $5, presses off - where a new Nassau starts', () => {
    const adm = read('admin.html');
    test('Game Day (Round Setup › Money): the boxes ship at 5 / 5 / 5, "No Press" selected', () => {
        ['front', 'back', 'overall'].forEach((k) => assert.match(adm, new RegExp('id="setup-nassau-' + k + '" value="5"'), k));
        const sel = adm.slice(adm.indexOf('<select id="setup-nassau-press">'), adm.indexOf('</select>', adm.indexOf('<select id="setup-nassau-press">')));
        assert.match(sel, /<option value="none" selected>No Press<\/option>/);
        assert.equal((sel.match(/selected/g) || []).length, 1, 'one default');
    });
    test('the step-1 $5 Nassau shortcut still types $5', () => {
        assert.match(adm, /const v = o && o\.amt \? o\.amt : 5;/);
    });
    test('simple setup (simple-flow.js): Nassau $5 a bet, presses start off', { skip: !fs.existsSync(path.join(REPO_ROOT, 'simple-flow.js')) }, () => {
        const sf = read('simple-flow.js');
        assert.match(sf, /stake: \{[^}]*nassau: 5[^}]*\}/);
        assert.match(sf, /scoring: 'net', press: 'none',/);
    });
    test('+ Bet (gps-bet.js): Nassau\'s chips $2 / $5 / $10, the middle one picked, presses Off', { skip: !GPS }, () => {
        const gb = read('gps-bet.js');
        assert.match(gb, /nassau: \{ label: 'Nassau', sub: 'F9 \/ B9 \/ 18', kind: 'side', stakeWord: '[^']+', chips: \[2, 5, 10\]/);
        assert.match(gb, /if \(st\.stake == null\) st\.stake = g\.chips\[1\];/);
        assert.match(gb, /from: null, press: 'none',/);
    });
    test('NO money engine or settlement file carries a #27 change', () => {
        ['money-engine.js', 'settlement-engine.js', 'match-engine.js', 'pool-engine.js', 'handicap.js', 'challenges.js', 'action-model.js']
            .filter((f) => fs.existsSync(path.join(REPO_ROOT, f)))
            .forEach((f) => assert.ok(!/URGENT-038/.test(read(f)), f + ' was touched'));
    });
});

describe('#28 ROUND READY: Nassau picked -> "Nassau (side bet) · scores kept as stroke play"', () => {
    const sb = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js']);
    const render = (data) => { sb.renderRoundReady(data); return sb.document.getElementById('rr-scoring-text').textContent; };
    const nassau = { format: 'nassau', scoring: 'net', stake: 5, frontStake: 5, backStake: 5, overallStake: 5, pressRule: 'none', teamAIds: ['101'], teamBIds: ['102'], startHole: 1 };
    const players = [{ id: 101, name: 'Test A' }, { id: 102, name: 'Test B' }];
    test('a stroke round with a Nassau side bet says so', () => {
        assert.equal(render({ gameFormat: 'stroke', players, sideMatches: { a: nassau } }), 'Nassau (side bet) · scores kept as stroke play');
        assert.equal(render({ players, sideMatches: { a: nassau } }), 'Nassau (side bet) · scores kept as stroke play', 'no gameFormat = stroke');
    });
    test('a plain stroke round, or a stroke round with only a Match, still reads "Stroke Play"', () => {
        assert.equal(render({ gameFormat: 'stroke', players }), 'Stroke Play');
        assert.equal(render({ gameFormat: 'stroke', players, sideMatches: { a: Object.assign({}, nassau, { format: 'match' }) } }), 'Stroke Play');
    });
    test('another scoring format keeps its own name, Nassau side bet or not', () => {
        const wolf = render({ gameFormat: 'wolf', players, sideMatches: { a: nassau } });
        assert.ok(!/Nassau/.test(wolf), wolf);
        assert.equal(wolf, render({ gameFormat: 'wolf', players }));
    });
    test('the Action line is unchanged: "1 Side Bet"', () => {
        render({ gameFormat: 'stroke', players, sideMatches: { a: nassau } });
        assert.equal(sb.document.getElementById('rr-action-text').innerHTML, '<div>1 Side Bet</div>');
    });
});

describe('#24 / #26 the words, in source', () => {
    test('#24 skins.html: no root inset inside the round\'s Bets sheet (hpsheet=1); one group = no group notes', () => {
        const s = read('skins.html');
        assert.match(s, /html\.hp-in-sheet \{ padding: 0 !important; \}/);
        assert.match(s, /hpsheet=1/);
        assert.match(s, /id="bets-matches-note"/);
        assert.match(s, /if \(hasGroupLock && !oneGroup\) \{/);
    });
    test('#26 gps-bet.js: Match = "Hole by hole"; 1 v 1 hint "Tap the 2 golfers"', { skip: !GPS }, () => {
        const gb = read('gps-bet.js');
        assert.match(gb, /match: +\{ label: 'Match', sub: 'Hole by hole', sub2: 'Best ball'/);
        assert.match(gb, /return 'Tap the 2 golfers';/);
        assert.ok(!/k === 'match' \? '1 v 1'/.test(gb));
    });
});
