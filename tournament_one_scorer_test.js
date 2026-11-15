// ============================================================================
// ONE SCORER PER GROUP, option A (ADVISOR-20261114-1527, mockup SC-one-scorer-
// ABC A) - the watch link, "That's me", the viewer card, the scorer's
// "watching" line, the Desk's Scorers card, Switch scorer, the Watch QR.
//
// HOW EACH TEST ARRIVES. Through the URL a person opens: the scorer's keyed
// card (&k=), the keyless card a group already has (no &k=, no &watch), the
// WATCH link (&watch=1, no key), or the organizer's ?tourney=CODE signed in.
// The page's OWN listeners are fired with a record, and every action is a TAP:
// the onclick / onchange text of the element a person touches, read from the
// markup the page rendered, run with `this` bound. No test names a render or
// write function the page defines. Each surface's first test is its DEFAULT.
//
// WHAT mini-dom CANNOT PROVE, said plainly: innerHTML is a string, so the
// holes list's <input>s are not nodes - "the viewer's boxes are disabled" is
// NOT provable here (querySelectorAll finds none). There is no layout, no CSS
// (a display:none from the stylesheet is invisible), static attribute text is
// not parsed, and the <template> the holes render parses through does not
// exist (each card gets an empty one, as tournament_next_hole_test.js does).
// Those were measured in headless Chrome by tools/one-scorer-check.js (cold
// arrival, the page's own init, real taps): the viewer card's boxes disabled
// and its sentence visible, the keyed card's box still typing.
//
// THE RULES ARE NOT IN THIS FILE: tournament_scorer_rules_test.js holds the
// joins candidate (unpublished) and proves Switch scorer's re-key against the
// LIVE rules read-back. Until the candidate is published the join write below
// is refused live; these tests prove what the PAGE asks for.
//
// BASELINE (CLAUDE.md count rule; FINAL file, FINAL run): against preview-batch
// 5033e24b (tournament-scorecard.html sha256 fbefcefe5b2a85bd...,
// tournament.html 0eace6a06eea514a...), run in a detached worktree at 5033e24b
// with this file copied in: 20 tests - 5 pass / 15 fail (5 + 15 = 20). The 5
// that pass are A1, A2, A3 (the keyed card, a keyless card already sent, and
// a keyed link that also says &watch=1 all behave as today) and C6, C7 (a
// visitor's board has no Scorers card; Setup's Send / QR still hand out the
// keyed link) - default-state guards that must STAY green.
// On preview-sc after the build: 20 tests - 20 pass / 0 fail.
//
// NEGATIVE CONTROLS (each a mutation of the built file, saved first and put
// back by cp, sha printed beside RESTORED-OK):
//   1 WATCH_MODE = false (the &watch flag ignored)       -> B1-B9 red
//   2 the score writers' "if (WATCH_MODE) return" gone   -> B5 red
//   3 the join path names the slot by the golfer's name  -> B3, B7, B8 red
//   4 the join record carries an extra field (uid)       -> B3, B7, B8 red
//   5 the scorer line ignores scorers/<entry>            -> B1, B3, B9 red
//   6 the keyed card's "watching" line not drawn         -> A4 red
//   7 renderScorerViews not called from the snapshot     -> A4, B1-B9 red
//   8 Switch scorer (team) writes no new key             -> C4 red
//   9 Switch scorer (group) skips the golfers' p/<pid> keys -> C5 red
//  10 the watch link carries the scorer's &k=            -> C1, C2, C3 red
//  11 Joined does not count the named scorer             -> C3 red
//  12 the Desk's own render does not draw the Scorers card -> C3 red
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { decodeEscapes } = require('./helpers/decode-escapes.js');

const CARD = 'tournament-scorecard.html';
const PAGE = 'tournament.html';
const HTML = fs.readFileSync(path.join(REPO_ROOT, PAGE), 'utf8');
const CODE = 'STK';
const KEY3 = 'a1'.repeat(16);
const ORGANIZER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const clone = (o) => JSON.parse(JSON.stringify(o));
const TS = { '.sv': 'timestamp' };

const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const GROUPS = [['Ana Diaz', 'Joe Fox', 'Sam Ortiz', 'Mia Chen'], ['Tom Reyes', 'Eva Lin', 'Ben Cruz', 'Liz Moore'],
    ['Dana Ruiz', 'Lee Park', 'Kim Vo', 'Ray Diaz'], ['Matt Cole', 'Amy Shaw', 'Dan Ito', 'Pat Webb']];
// A four-ball best ball, Group 3 on hole 5: Dana's card has three holes in.
function teamEvent(extra) {
    const teams = {};
    GROUPS.forEach((p, i) => { teams['team' + (i + 1)] = { num: i + 1, name: 'Group ' + (i + 1), players: p.slice(), startingHole: String(1 + 2 * i), handicap: 0 }; });
    return Object.assign({ name: 'Starkey Classic', ownerUid: 'u-org', courseName: 'Papago Golf Course', format: 'bestball', courseData: COURSE,
        startType: 'shotgun', teams, createdAt: 1,
        scores: { team3_p0_h5: 4, team3_p1_h5: 3, team3_p2_h5: 5, team3_p3_h5: 4, team3_p0_h6: 3, team3_p1_h6: 3, team3_p2_h6: 2, team3_p3_h6: 3 } }, extra || {});
}
function groupEvent(extra) {
    const players = {}, groups = {};
    GROUPS.forEach((names, gi) => {
        const gid = 'g' + (gi + 1);
        groups[gid] = { name: 'Group ' + (gi + 1), playerIds: [], createdAt: gi + 1, startingHole: String(1 + 2 * gi) };
        names.forEach((n, i) => { const pid = 'p' + (gi + 1) + String.fromCharCode(97 + i); players[pid] = { id: pid, name: n, handicap: '10' }; groups[gid].playerIds.push(pid); });
    });
    return Object.assign({ name: 'Starkey Classic', ownerUid: 'u-org', courseName: 'Papago Golf Course', format: 'individual', scoringModel: 'player-v1',
        courseData: COURSE, players, scoringGroups: groups, createdAt: 1, scores: {} }, extra || {});
}

// ---- TAPS AND LISTENERS ------------------------------------------------------
function tagsOf(markup) { return markup.match(/<(button|a|input|span)\b[^>]*>/g) || []; }
function handlerOf(markup, pick, attr) {
    const tag = tagsOf(markup).find(pick);
    if (!tag) return null;
    const m = new RegExp('\\b' + (attr || 'onclick') + '="([^"]*)"').exec(tag);
    return m ? { code: m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'), tag } : null;
}
function attrsOf(tag) {
    const o = {};
    tag.replace(/\b(data-[a-z-]+)="([^"]*)"/g, (_, k, v) => { o[k.slice(5).replace(/-([a-z])/g, (x, c) => c.toUpperCase())] = v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'); });
    return o;
}
function tap(sb, markup, pick, value) {
    const h = handlerOf(markup, pick, value === undefined ? 'onclick' : 'onchange');
    assert.ok(h, 'nothing to tap in that markup');
    sb.__tapEl = { dataset: attrsOf(h.tag), value: value };
    vm.runInContext('(function () { ' + h.code + ' }).call(__tapEl)', sb);
}
const has = (re) => (tag) => re.test(tag);
const byId = (id) => has(new RegExp('\\bid="' + id + '"'));
function fire(sb, re, val) {
    const hs = sb.__dbHandlers.filter((h) => h.event === 'value' && re.test(h.path));
    assert.ok(hs.length > 0, 'no listener on ' + re);
    hs.forEach((h) => h.cb({ val: () => clone(val), exists: () => val !== null && val !== undefined }));
}
const el = (sb, id) => sb.document.getElementById(id);
const shownInline = (sb, id) => ((el(sb, id).style || {}).display || '') !== 'none';
const html = (sb, id) => String(el(sb, id).innerHTML || '');
// A box the build added: on today's page it does not exist, which is "not on
// screen" too - so the default-state guards (A1-A3) run on both pages.
// (mini-dom hands back an empty stub for an unknown id, so "empty" is the test.)
const noneOrHidden = (sb, id) => { const e = el(sb, id); return !e || !String(e.innerHTML || ''); };
const plain = (s) => decodeEscapes(String(s)).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\u2019/g, "'").replace(/\s+/g, ' ').trim();

// The golfer's card: arrive on the link, the record lands.
function card(query, record, opts) {
    opts = opts || {};
    const sb = loadHtmlInlineScript(CARD, [], { search: '?' + query, localStorage: true, beforeRun(s) { if (opts.seed) Object.keys(opts.seed).forEach((k) => s.localStorage.setItem(k, opts.seed[k])); } });
    const make = sb.document.createElement.bind(sb.document);
    sb.document.createElement = (tag) => { const n = make(tag); if (String(tag).toLowerCase() === 'template') n.content = { querySelectorAll: () => [] }; return n; };
    fire(sb, new RegExp('^tournaments/' + CODE + '$'), record);
    return sb;
}
const holes = (sb) => html(sb, 'holes-list');
// Type a score into the box a person would: the box's own onchange, from the rendered row.
const typeBox = (sb, onchangeRe, v) => tap(sb, holes(sb), has(onchangeRe), v);
const scoreWrites = (sb) => sb.__dbWrites.filter((w) => /scores|scoreProofs/.test(w.path) || (w.op === 'update' && Object.keys(w.value || {}).some((k) => /scores/.test(k))));
const SCORER_SET = { scorers: { team3: { name: 'Dana Ruiz', at: 1 } } };
const JOINS_3 = { joins: { team3: { p1: { name: 'Lee Park', at: 1763132280000 }, p2: { name: 'Kim Vo', at: 1763132460000 } } } };

describe('A. THE SCORER\'S CARD AND THE CARDS ALREADY SENT (no watch link)', () => {
    test('A1 DEFAULT keyed link, nobody joined: today\'s card - "You\'re scoring for Group 3", no name list, no GPS door, a typed box sends ONE keyed update', () => {
        const sb = card('tourney=STK&team=3&k=' + KEY3, teamEvent());
        assert.equal(plain(html(sb, 'scoring-for')), 'You\'re scoring for Group 3');
        assert.equal(noneOrHidden(sb, 'sc-join'), true, 'no name list');
        assert.ok(!el(sb, 'sc-gps') || html(sb, 'sc-gps') === '', 'no GPS door');
        assert.equal(el(sb, 'link-truth').textContent, 'Anyone with this link can score this card.');
        typeBox(sb, /savePlayerHoleScore\(7, 1,/, '5');
        const w = scoreWrites(sb);
        assert.equal(w.length, 1);
        assert.equal(w[0].op, 'update');
        assert.deepEqual(Object.keys(w[0].value).sort(), ['scoreProofs/STK/team3_p1_h7', 'tournaments/STK/scores/team3_p1_h7']);
        assert.equal(w[0].value['scoreProofs/STK/team3_p1_h7'].k, KEY3);
    });
    test('A2 DEFAULT keyless link with no &watch (a link already sent): the same card that types - a single set, no name list', () => {
        const sb = card('tourney=STK&team=3', teamEvent(JOINS_3));
        assert.equal(noneOrHidden(sb, 'sc-join'), true);
        assert.match(plain(html(sb, 'scoring-for')), /^You're scoring for Group 3/);
        typeBox(sb, /savePlayerHoleScore\(7, 2,/, '4');
        const w = scoreWrites(sb);
        assert.equal(w.length, 1);
        assert.deepEqual(clone([w[0].op, w[0].path, w[0].value]), ['set', 'tournaments/STK/scores/team3_p2_h7', 4]);
    });
    test('A3 a link that carries its key is never a watch link, even with &watch=1: it types', () => {
        const sb = card('tourney=STK&team=3&watch=1&k=' + KEY3, teamEvent(SCORER_SET));
        assert.equal(noneOrHidden(sb, 'sc-join'), true);
        typeBox(sb, /savePlayerHoleScore\(7, 0,/, '4');
        assert.equal(scoreWrites(sb).length, 1);
    });
    test('A4 once golfers have joined, the keyed card says who is watching (the scorer left out): "You\'re scoring for Group 3 · Lee and Kim are watching"', () => {
        const sb = card('tourney=STK&team=3&k=' + KEY3, teamEvent(Object.assign({}, JOINS_3, { scorers: { team3: { name: 'Dana Ruiz', at: 1 } } })));
        assert.equal(plain(html(sb, 'scoring-for')), 'You\'re scoring for Group 3 · Lee and Kim are watching');
        // one watcher reads "is"
        const one = card('tourney=STK&team=3&k=' + KEY3, teamEvent({ joins: { team3: { p3: { name: 'Ray Diaz', at: 1 } } } }));
        assert.equal(plain(html(one, 'scoring-for')), 'You\'re scoring for Group 3 · Ray is watching');
    });
});

describe('B. THE WATCH LINK (&watch=1, no key): tap your name, then the viewer card', () => {
    test('B1 DEFAULT: the name list for Group 3 - Dana "Scoring", Lee "Joined", Kim and Ray "That\'s me" - the scorer sentence, and the card itself held back; nothing written', () => {
        const sb = card('tourney=STK&team=3&watch=1', teamEvent(Object.assign({ joins: { team3: { p1: { name: 'Lee Park', at: 1763132280000 } } } }, SCORER_SET)));
        assert.equal(shownInline(sb, 'sc-join'), true);
        const list = html(sb, 'sc-join');
        const t = plain(list);
        assert.match(t, /^Group 3 · Tap your own name\./);
        assert.match(t, /Dana Ruiz Has the scoring link Scoring/);
        assert.match(t, /Lee Park Joined \d{1,2}:\d\d [AP]M That's me/);
        assert.match(t, /Kim Vo That's me Ray Diaz That's me/);
        assert.match(t, /Dana Ruiz is scoring for your group\. This card shows the live scores; it can't enter them\./);
        assert.equal((list.match(/class="sc-join-me"/g) || []).length, 3, 'three That\'s me buttons: everyone but the scorer');
        ['scoring-for', 'link-truth', 'team-roster', 'status-bar', 'holes-list'].forEach((id) => assert.equal(shownInline(sb, id), false, id + ' held back until a name is tapped'));
        assert.equal(sb.__dbWrites.length, 0);
    });
    test('B2 DEFAULT with no scorer named: the sentence names nobody it does not know; all four can tap', () => {
        const sb = card('tourney=STK&team=3&watch=1', teamEvent());
        const t = plain(html(sb, 'sc-join'));
        assert.match(t, /One phone in your group is scoring; this card shows its scores live\./);
        assert.equal((html(sb, 'sc-join').match(/class="sc-join-me"/g) || []).length, 4);
    });
    test('B3 tapping "That\'s me" beside Kim Vo writes ONE join record - joins/team3/p2 = { name, at } and nothing else - and the card becomes Kim\'s viewer card', () => {
        const sb = card('tourney=STK&team=3&watch=1', teamEvent(SCORER_SET));
        tap(sb, html(sb, 'sc-join'), has(/data-slot="p2"/));
        assert.equal(sb.__dbWrites.length, 1);
        const w = sb.__dbWrites[0];
        assert.deepEqual([w.op, w.path], ['set', 'tournaments/STK/joins/team3/p2']);
        assert.deepEqual(clone(w.value), { name: 'Kim Vo', at: TS });
        assert.equal(shownInline(sb, 'sc-join'), false);
        assert.equal(plain(html(sb, 'scoring-for')), "You're Kim Vo · watching Group 3 Not you?");
        assert.equal(el(sb, 'link-truth').textContent, 'Dana Ruiz is scoring for your group.');
        ['scoring-for', 'link-truth', 'team-roster', 'status-bar', 'holes-list'].forEach((id) => assert.equal(shownInline(sb, id), true, id + ' shown on the viewer card'));
        assert.match(holes(sb), /value="4"/, 'the live scores are on the card');
    });
    test('B4 the viewer card carries the HardPan GPS door: "Open in HardPan" and the store badges - and claims nothing free', () => {
        const sb = card('tourney=STK&team=3&watch=1', teamEvent(SCORER_SET));
        tap(sb, html(sb, 'sc-join'), has(/data-slot="p1"/));
        assert.equal(shownInline(sb, 'sc-gps'), true);
        const g = html(sb, 'sc-gps');
        assert.match(plain(g), /^HardPan GPS Yardages to the front, middle and back of every green, in the HardPan app\. Open in HardPan$/);
        assert.match(g, /id="sc-gps-open" href="https:\/\/hardpangolf\.com\/#get-the-app"/);
        assert.match(g, /app-store-badge\.svg/);
        assert.match(g, /google-play-badge\.png/);
        assert.doesNotMatch(plain(g), /free|today only|unlock/i);
    });
    test('B5 typing into a box on the viewer card writes nothing (the boxes\' own onchange, every shape)', () => {
        const sb = card('tourney=STK&team=3&watch=1', teamEvent(SCORER_SET));
        tap(sb, html(sb, 'sc-join'), has(/data-slot="p1"/));
        const before = sb.__dbWrites.length;
        typeBox(sb, /savePlayerHoleScore\(7, 1,/, '4');
        typeBox(sb, /savePlayerHoleScore\(5, 0,/, '');
        assert.equal(sb.__dbWrites.length, before);
        const g = card('tourney=STK&group=g3&watch=1', groupEvent());
        tap(g, html(g, 'sc-join'), has(/data-slot="p3b"/));
        const gb = g.__dbWrites.length;
        typeBox(g, /saveIndividualScore\('p3a', 5,/, '4');
        assert.equal(g.__dbWrites.length, gb);
    });
    test('B6 the Board tab works from the viewer card', () => {
        const sb = card('tourney=STK&team=3&watch=1', teamEvent(SCORER_SET));
        tap(sb, html(sb, 'sc-join'), has(/data-slot="p1"/));
        const CARD_HTML = fs.readFileSync(path.join(REPO_ROOT, CARD), 'utf8');
        tap(sb, CARD_HTML, byId('tab-btn-leaderboard'));
        assert.equal(shownInline(sb, 'tab-leaderboard'), true);
        assert.equal(shownInline(sb, 'tab-scorecard'), false);
        assert.match(plain(html(sb, 'leaderboard-list')), /Group 3/);
    });
    test('B7 an individual event: the join is keyed by the group and the player id - joins/g3/p3c = { name: "Kim Vo", at }', () => {
        const sb = card('tourney=STK&group=g3&watch=1', groupEvent());
        assert.match(plain(html(sb, 'sc-join')), /^Group 3 · Tap your own name\. Dana Ruiz That's me Lee Park That's me Kim Vo That's me Ray Diaz That's me/);
        tap(sb, html(sb, 'sc-join'), has(/data-slot="p3c"/));
        assert.deepEqual(clone(sb.__dbWrites.map((w) => [w.op, w.path, w.value])), [['set', 'tournaments/STK/joins/g3/p3c', { name: 'Kim Vo', at: TS }]]);
        assert.equal(plain(html(sb, 'scoring-for')), "You're Kim Vo · watching Group 3 Not you?");
    });
    test('B8 a multi-round event: the entry names the round - joins/<rid>_<gid>/<pid>', () => {
        const base = groupEvent();
        const rec = { name: base.name, eventModel: 'round-v1', ownerUid: 'u-org', courseName: base.courseName, format: 'individual', scoringModel: 'player-v1', players: base.players, createdAt: 1,
            rounds: { r1: { name: 'Round 1', status: 'open', createdAt: 1, courseName: base.courseName, courseData: COURSE, scoringGroups: base.scoringGroups, scores: {} },
                r2: { name: 'Round 2', status: 'setup', createdAt: 2, courseName: base.courseName, courseData: COURSE, scoringGroups: {}, scores: {} } } };
        const sb = card('tourney=STK&group=g3&round=r1&watch=1', rec);
        tap(sb, html(sb, 'sc-join'), has(/data-slot="p3d"/));
        assert.deepEqual(clone(sb.__dbWrites.map((w) => [w.path, w.value])), [['tournaments/STK/joins/r1_g3/p3d', { name: 'Ray Diaz', at: TS }]]);
    });
    test('B9 the phone remembers: back on the watch link it opens on the viewer card; "Not you?" brings the list back; "Just watch" writes nothing', () => {
        const seed = { ['hp_join_STK_team3']: JSON.stringify({ slot: 'p3', name: 'Ray Diaz' }) };
        const sb = card('tourney=STK&team=3&watch=1', teamEvent(SCORER_SET), { seed });
        assert.equal(shownInline(sb, 'sc-join'), false);
        assert.equal(plain(html(sb, 'scoring-for')), "You're Ray Diaz · watching Group 3 Not you?");
        tap(sb, html(sb, 'scoring-for'), has(/class="sc-renotice"/));
        assert.equal(shownInline(sb, 'sc-join'), true);
        tap(sb, html(sb, 'sc-join'), has(/class="sc-join-skip"/));
        assert.equal(sb.__dbWrites.length, 0);
        assert.equal(plain(html(sb, 'scoring-for')), 'Watching Group 3 Not you?');
        assert.equal(el(sb, 'link-truth').textContent, 'Dana Ruiz is scoring for your group.');
    });
});

describe('C. THE ORGANIZER: the Watch QR on the links, the Desk\'s Scorers, Switch scorer', () => {
    function owner(record, keys) {
        // mini-dom has no crypto; a browser does (newScoringKey needs it).
        const sb = loadHtmlInlineScript(PAGE, [], { search: '?tourney=' + CODE, beforeRun(s) { s.crypto = require('crypto').webcrypto; } });
        sb.__auth.setUser(ORGANIZER);
        fire(sb, new RegExp('^tournaments/' + CODE + '$'), record);
        if (keys !== undefined) fire(sb, new RegExp('^tournamentKeys/' + CODE + '$'), keys);
        fire(sb, new RegExp('^registrations/' + CODE + '$'), {});
        return sb;
    }
    const KEYS = () => ({ on: true, t: { team1: 'b1'.repeat(16), team2: 'b2'.repeat(16), team3: KEY3, team4: 'b4'.repeat(16) } });
    const deskTab = (sb) => tap(sb, HTML, byId('tab-btn-desk'));
    const row = (markup, entry) => {
        const at = markup.indexOf('<div class="scd-row" data-entry="' + entry + '">');
        assert.ok(at !== -1, 'row ' + entry);
        const next = markup.indexOf('<div class="scd-row"', at + 10);
        return markup.slice(at, next === -1 ? undefined : next);
    };
    test('C1 Setup\'s start-and-links rows: beside Send and QR (the keyed link), a Watch QR whose link has &watch=1 and no &k=', () => {
        const sb = owner(teamEvent(), KEYS());
        const list = html(sb, 'start-links-list');
        const r3 = list.slice(list.indexOf('data-team="3"'), list.indexOf('data-team="4"'));
        assert.match(r3, /class="btn-primary sl-send" data-share-url="[^"]*team=3&amp;k=a1a1/);
        assert.match(plain(r3), /Group 3 Send QR The others in the group: Watch QR\b/);
        const w = attrsOf(tagsOf(r3).find(has(/class="btn-outline sl-watch"/)));
        assert.match(w.watchUrl, /\/tournament-scorecard\.html\?tourney=STK&team=3&watch=1$/);
        assert.doesNotMatch(w.watchUrl, /[?&]k=/);
        tap(sb, r3, has(/class="btn-outline sl-watch"/));
        assert.equal(el(sb, 'share-modal-title').textContent, 'Group 3 — Watch Link');
        assert.equal(el(sb, 'share-link-text').textContent, w.watchUrl);
    });
    test('C2 the board\'s link rows carry the Watch QR too: team rows, and on an individual event the group rows', () => {
        const sb = owner(teamEvent(), KEYS());
        const t = html(sb, 'team-links-list');
        const watch = tagsOf(t).filter(has(/team-watch/)).map((x) => attrsOf(x).watchUrl);
        assert.equal(watch.length, 4);
        watch.forEach((u, i) => { assert.match(u, new RegExp('\\?tourney=STK&team=' + (i + 1) + '&watch=1$')); });
        const g = owner(groupEvent(), { on: true, g: { g1: 'c1'.repeat(16), g2: 'c2'.repeat(16), g3: 'c3'.repeat(16), g4: 'c4'.repeat(16) } });
        const gl = html(g, 'group-links-list');
        const gw = tagsOf(gl).filter(has(/group-watch/)).map((x) => attrsOf(x).watchUrl);
        assert.equal(gw.length, 4);
        assert.match(gw[2], /\?tourney=STK&group=g3&watch=1$/);
        assert.match(gl, /group=g3&k=c3c3/, 'the scorer\'s link is still the keyed one');
    });
    test('C3 DEFAULT Desk: a Scorers card, one row per group - "Scorer scoring link · Joined 0 of 4", Switch scorer, Watch QR; with joins and a named scorer, "Scorer Dana Ruiz · Joined 3 of 4"', () => {
        const sb = owner(teamEvent(), KEYS());
        deskTab(sb);
        assert.equal(shownInline(sb, 'scorer-desk'), true);
        const d = html(sb, 'scorer-desk');
        assert.match(plain(d), /^Scorers One phone scores each team on its scoring link\. The others open the Watch QR, tap their name and follow the scores\./);
        assert.equal(plain(row(d, 'team3')), 'Group 3 Scorer scoring link · Joined 0 of 4 Switch scorer Watch QR');
        assert.equal((d.match(/class="scd-row"/g) || []).length, 4);
        const w = attrsOf(tagsOf(row(d, 'team3')).find(has(/scd-watch/)));
        assert.match(w.watchUrl, /\?tourney=STK&team=3&watch=1$/);
        // the Desk draws it on its own render too, before the keys have arrived
        const nokeys = owner(teamEvent());
        deskTab(nokeys);
        assert.equal(plain(row(html(nokeys, 'scorer-desk'), 'team3')), 'Group 3 Scorer scoring link · Joined 0 of 4 Switch scorer Watch QR');
        const sb2 = owner(teamEvent(Object.assign({}, JOINS_3, SCORER_SET)), KEYS());
        deskTab(sb2);
        assert.equal(plain(row(html(sb2, 'scorer-desk'), 'team3')), 'Group 3 Scorer Dana Ruiz · Joined 3 of 4 Switch scorer Watch QR');
    });
    test('C4 Switch scorer, keys on: pick Lee Park -> ONE update: a NEW key for team3 and scorers/team3 = { name, at }; the new keyed link opens to send', async () => {
        const sb = owner(teamEvent(SCORER_SET), KEYS());
        deskTab(sb);
        tap(sb, row(html(sb, 'scorer-desk'), 'team3'), has(/scd-switch/));
        const pick = row(html(sb, 'scorer-desk'), 'team3');
        assert.match(plain(pick), /Who is scoring Group 3 now\? Dana Ruiz Lee Park Kim Vo Ray Diaz Cancel/);
        const before = sb.__dbWrites.length;
        tap(sb, pick, has(/data-slot="p1"/));
        const ws = sb.__dbWrites.slice(before);
        assert.equal(ws.length, 1);
        assert.equal(ws[0].op, 'update');
        const v = ws[0].value;
        assert.deepEqual(Object.keys(v).sort(), ['tournamentKeys/STK/t/team3', 'tournaments/STK/scorers/team3']);
        assert.match(v['tournamentKeys/STK/t/team3'], /^[0-9a-f]{32}$/);
        assert.notEqual(v['tournamentKeys/STK/t/team3'], KEY3);
        assert.deepEqual(clone(v['tournaments/STK/scorers/team3']), { name: 'Lee Park', at: TS });
        await new Promise((r) => setImmediate(r));
        assert.equal(el(sb, 'share-modal-title').textContent, 'Group 3 — Lee Park — Scorecard Link');
        assert.match(el(sb, 'share-link-text').textContent, new RegExp('\\?tourney=STK&team=3&k=' + v['tournamentKeys/STK/t/team3'] + '$'));
    });
    test('C5 Switch scorer on an individual event re-keys the group AND each golfer\'s key (the shapes the rules check); keys off, it records the name only', () => {
        const keys = { on: true, g: { g3: 'c3'.repeat(16) }, p: { p3a: 'c3'.repeat(16), p3b: 'c3'.repeat(16), p3c: 'c3'.repeat(16), p3d: 'c3'.repeat(16) } };
        const sb = owner(groupEvent(), keys);
        deskTab(sb);
        tap(sb, row(html(sb, 'scorer-desk'), 'g3'), has(/scd-switch/));
        const before = sb.__dbWrites.length;
        tap(sb, row(html(sb, 'scorer-desk'), 'g3'), has(/data-slot="p3c"/));
        const v = sb.__dbWrites.slice(before)[0].value;
        assert.deepEqual(Object.keys(v).sort(), ['tournamentKeys/STK/g/g3', 'tournamentKeys/STK/p/p3a', 'tournamentKeys/STK/p/p3b', 'tournamentKeys/STK/p/p3c', 'tournamentKeys/STK/p/p3d', 'tournaments/STK/scorers/g3']);
        const k = v['tournamentKeys/STK/g/g3'];
        assert.notEqual(k, 'c3'.repeat(16));
        ['p3a', 'p3b', 'p3c', 'p3d'].forEach((p) => assert.equal(v['tournamentKeys/STK/p/' + p], k));
        // keys off: no key to replace
        const off = owner(teamEvent(), {});
        deskTab(off);
        tap(off, row(html(off, 'scorer-desk'), 'team3'), has(/scd-switch/));
        const b2 = off.__dbWrites.length;
        tap(off, row(html(off, 'scorer-desk'), 'team3'), has(/data-slot="p0"/));
        assert.deepEqual(clone(off.__dbWrites.slice(b2).map((w) => Object.keys(w.value))), [['tournaments/STK/scorers/team3']]);
    });
    test('C6 a visitor\'s board (not signed in as the owner) has no Scorers card and no Watch QR rows in view', () => {
        const sb = loadHtmlInlineScript(PAGE, [], { search: '?tourney=' + CODE });
        fire(sb, new RegExp('^tournaments/' + CODE + '$'), teamEvent());
        assert.equal(html(sb, 'scorer-desk'), '');
        assert.equal(shownInline(sb, 'lb-owner-tools'), false);
    });
    test('C7 the scorer\'s Send and QR on the Setup rows still hand out the keyed link, exactly', () => {
        const sb = owner(teamEvent(), KEYS());
        const list = html(sb, 'start-links-list');
        const sends = tagsOf(list).filter(has(/sl-send|sl-qr/)).map((x) => attrsOf(x).shareUrl);
        assert.equal(sends.length, 8);
        sends.forEach((u) => assert.match(u, /&k=[0-9a-f]{32}$/));
    });
});
