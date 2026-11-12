// ============================================================================
// E2 CONTEST HOLES ON THE WEB (approved "as mocked" 2026-11-09)
//
// EVERY TEST ARRIVES THROUGH THE URL A GOLFER OR ORGANIZER OPENS - the team or
// group scoring link (tournament-scorecard.html?tourney=..&team=..&k=..) or
// the organizer's tournament.html?tourney=.. - and the page's OWN listeners
// are fired with a record. Then only TAPS: the onclick text of the element a
// golfer touches, read from the page's static markup or from the markup the
// page itself rendered. No test names a render or save function the page
// defines.
//
// THE DEFAULT STATE FIRST: an event with no contest holes shows exactly the
// card it always showed - no prompt, no Contests tab (A1). Then the state a
// golfer reaches by doing nothing but playing: a card whose next hole is a
// contest hole shows the prompt on arrival (B1).
//
// WHAT mini-dom CANNOT PROVE, said plainly: innerHTML is a string (rendered
// inputs are not parsed, so a test sets the value of the element by id, as a
// golfer's typing would), no layout (a shown prompt may still be 0x0). Those
// are measured in Chrome by tools/tournament-contests-check.js (cold arrival,
// taps and Input.insertText only; exit 0 on this branch; it writes the E2a-E2d
// screenshots).
//
// WEB = TYPED ONLY. No GPS mark is drawn on the web (C3 pins that): the
// tournament record has no link to a HardPan GPS course and the page has no
// sign-in to read one. The rules accept by:'gps' from the app.
//
// BASELINE (final file; tournament-scorecard.html + tournament.html swapped back
// to event-tools cf86caf8, restored by sha from a saved copy):
//   all 19 tests: 0 PASS / 19 FAIL. A1 and A2 fail there only because mini-dom
//   hands back a detached, "shown" element for an id the page lacks; C3 fails
//   on its positive assertion (no contest code to scan).
//   after the build: all 19 tests: 19 PASS / 0 FAIL.
// NEGATIVE CONTROLS (10, each mutated in place, restored by copying a saved
//   file back and printing its sha beside RESTORED-OK): no proof in the update
//   -> B2, B8; prompt ignores lockedAt -> B6; renderAll never draws the prompt
//   -> B1b; the entries listener never redraws -> B6, B7; KP ranked longest
//   first -> C1, C2, D1, D2; 12 inches accepted -> B4; Make winner without
//   lockedAt -> D2; Contests tab not gated -> A2; "nothing is paid" dropped ->
//   C1; a refusal shown as a signal problem -> B5. All caught.
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const CARD = 'tournament-scorecard.html';
const ORG = 'tournament.html';
const CARD_HTML = fs.readFileSync(path.join(REPO_ROOT, CARD), 'utf8');
const ORG_HTML = fs.readFileSync(path.join(REPO_ROOT, ORG), 'utf8');
const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 5, 3, 4, 4, 3, 4, 5];
const COURSE = PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: i + 1 }));
const K4 = 'a'.repeat(32);
const TS = { '.sv': 'timestamp' };
const ORGANIZER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const clone = (o) => JSON.parse(JSON.stringify(o));
const settle = () => new Promise((r) => setImmediate(r));

// Team 4 started on hole 4 (shotgun) and is thru 6: holes 4, 5, 6 scored... no -
// thru 3 holes, its NEXT hole is 7. Team 7 has played 7 too.
function teamEvent(o) {
    const scores = {};
    [4, 5, 6].forEach((h) => { scores['team4_h' + h] = PARS[h - 1]; });
    [7, 8].forEach((h) => { scores['team7_h' + h] = PARS[h - 1]; });
    return Object.assign({ name: 'Rattle Classic', format: 'scramble', courseName: 'Papago', courseData: COURSE, createdAt: 1,
        ownerUid: 'u-org', startType: 'shotgun', scores,
        teams: { team4: { num: 4, name: 'Team 4', players: ['Al Lopez', 'Jo Kim'], startingHole: 4 },
            team7: { num: 7, name: 'Team 7', players: ['Dee Nguyen'], startingHole: 7 } } }, o || {});
}
const CONTESTS = { h7: { kind: 'kp', allowGps: true }, h12: { kind: 'ld', fairwayOnly: true, allowGps: true }, h16: { kind: 'kp', allowGps: true } };

function loadCard(search) {
    const sb = loadHtmlInlineScript(CARD, [], { search: search || `?tourney=CT1&team=4&k=${K4}` });
    // mini-dom has no <template>; setHolesListPreservingFocus makes one on a
    // re-render (tournament_next_hole_test.js uses the same shim). A first
    // render never reads it.
    const make = sb.document.createElement.bind(sb.document);
    sb.document.createElement = (tag) => {
        const n = make(tag);
        if (String(tag).toLowerCase() === 'template') n.content = { querySelectorAll: () => [] };
        return n;
    };
    return sb;
}
function arriveCard(rec, search, entries) {
    const sb = loadCard(search);
    fire(sb, /^tournaments\/CT1$/, rec);
    if (entries !== undefined) fire(sb, /^contestEntries\/CT1$/, entries);
    return sb;
}
function fire(sb, re, value) {
    const hs = sb.__dbHandlers.filter((h) => h.event === 'value' && re.test(h.path));
    assert.ok(hs.length > 0, 'the page registered no listener on ' + re);
    hs.forEach((h) => h.cb({ val: () => clone(value), exists: () => value != null }));
}
const el = (sb, id) => sb.document.getElementById(id);
const shown = (sb, id) => ((el(sb, id).style || {}).display || '') !== 'none';
const html = (sb, id) => String(el(sb, id).innerHTML || '');
const plain = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

// A TAP: the onclick of the first tag in `markup` that `pick` accepts, run with
// `this` carrying the tag's data-* attributes.
function tap(sb, markup, pick) {
    const tags = markup.match(/<(button|span|a)\b[^>]*>/g) || [];
    const tag = tags.find(pick);
    assert.ok(tag, 'nothing to tap');
    const m = /\bonclick="([^"]*)"/.exec(tag);
    assert.ok(m, 'that tag has no onclick: ' + tag);
    const ds = {};
    tag.replace(/\bdata-([a-z-]+)="([^"]*)"/g, (_, k, v) => { ds[k.replace(/-([a-z])/g, (x, c) => c.toUpperCase())] = v.replace(/&amp;/g, '&'); });
    sb.__tapEl = { dataset: ds };
    return vm.runInContext('(function () { return ' + m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'") + ' }).call(__tapEl)', sb);
}
const byId = (id) => (t) => new RegExp('\\bid="' + id + '"').test(t);
const byText = (sbHtml, text) => (t) => { const i = sbHtml.indexOf(t); return i > -1 && sbHtml.slice(i + t.length).replace(/<[^>]+>[\s\S]*$/, '').trim().startsWith(text); };
// 2026-11-12 (My events by account): the owner's page also writes its own
// organizers/<uid>/tournaments pointer on open; a contests count leaves it out.
const updates = (sb) => sb.__dbWrites.filter((w) => w.op === 'update' && !/^organizers\//.test(w.path));

describe('A. THE DEFAULT STATE: no contest holes, the card and console as they were', () => {
    test('A1 an event with no contests: no prompt, no Contests tab, no entries read beyond the one listener', () => {
        const sb = arriveCard(teamEvent(), undefined, {});
        assert.equal(shown(sb, 'contest-prompt'), false, 'no prompt');
        assert.doesNotMatch(CARD_HTML, /id="tab-btn-contests"/, 'no Contests pill at all (re-pinned 2026-11-11, EC2 A)');
        // A link with no key has no Photos tab either (E4): two tabs, their old words.
        const plainLink = arriveCard(teamEvent(), '?tourney=CT1&team=4', {});
        assert.notEqual(el(plainLink, 'tab-btn-leaderboard').textContent, 'Board', 'two tabs keep their words');
        assert.match(el(sb, 'status-main').textContent, /Next: Hole 7/, 'positive: the card rendered and its next hole is 7');
    });
    test('A2 a visitor who is not the owner sees no Contests tab on the organizer page', () => {
        const sb = loadHtmlInlineScript(ORG, [], { search: '?tourney=OWN1' });
        sb.__auth.setUser(null);
        fire(sb, /^tournaments\/OWN1$/, teamEvent({ contests: CONTESTS }));
        assert.equal((el(sb, 'tab-btn-contests').style || {}).display, 'none', 'the gated tab is hidden');
        assert.equal(shown(sb, 'manage-tab-leaderboard'), true, 'positive: the visitor lands on the leaderboard');
    });
});

describe('B. THE GOLFER: the prompt on the contest hole the card is playing', () => {
    test('B1 arrive on the team link, touch nothing: hole 7 KP prompt with the mockup words and both golfers to pick from', () => {
        const sb = arriveCard(teamEvent({ contests: CONTESTS }), undefined, {});
        assert.equal(shown(sb, 'contest-prompt'), true);
        const t = plain(html(sb, 'contest-prompt'));
        assert.match(t, /Hole 7 · Closest to the pin/);
        assert.match(t, /Par 3/);
        assert.match(t, /On the green in one\? Enter how far from the cup\./);
        assert.match(t, /Save my KP/);
        assert.match(t, /Not on the green/);
        assert.match(t, /\bAl\b/); assert.match(t, /\bJo\b/);
        assert.ok(/id="cp-ft"/.test(html(sb, 'contest-prompt')) && /id="cp-in"/.test(html(sb, 'contest-prompt')), 'feet and inches boxes');
        assert.equal(shown(sb, 'tab-btn-contests'), true, 'the Contests tab appears');
    });
    test('B1b the order the two snapshots land in does not matter: entries first, then the event - the prompt is still drawn', () => {
        const sb = loadCard();
        fire(sb, /^contestEntries\/CT1$/, {});
        fire(sb, /^tournaments\/CT1$/, teamEvent({ contests: CONTESTS }));
        assert.equal(shown(sb, 'contest-prompt'), true);
        assert.match(plain(html(sb, 'contest-prompt')), /Hole 7 · Closest to the pin/);
    });
    test('B2 pick Al, type 8 ft 4 in, Save: ONE update - the entry (distance + time only) and its keyed proof', async () => {
        const sb = arriveCard(teamEvent({ contests: CONTESTS }), undefined, {});
        const ph = html(sb, 'contest-prompt');
        tap(sb, ph, (t) => /data-entry="team4_p0"/.test(t));
        el(sb, 'cp-ft').value = '8'; el(sb, 'cp-in').value = '4';
        tap(sb, html(sb, 'contest-prompt'), byId('cp-save'));
        await settle();
        const u = updates(sb);
        assert.equal(u.length, 1, 'one update');
        assert.deepEqual(clone(u[0].value), {
            'contestEntries/CT1/h7/team4_p0': { name: 'Al Lopez', team: 'team4', kind: 'kp', by: 'typed', at: TS, inches: 100 },
            'contestProofs/CT1/h7/team4_p0': { who: 'team4', k: K4, t: TS }
        });
        assert.match(plain(html(sb, 'contest-prompt')), /✓ Saved: Al 8 ft 4 in/);
    });
    test('B3 the long-drive hole: "Long drive", fairway only, one yards box, Save my drive writes yards', async () => {
        const rec = teamEvent({ contests: CONTESTS });
        [7, 8, 9, 10, 11].forEach((h) => { rec.scores['team4_h' + h] = PARS[h - 1]; });
        const sb = arriveCard(rec, undefined, {});
        const t = plain(html(sb, 'contest-prompt'));
        assert.match(t, /Hole 12 · Long drive/);
        assert.match(t, /Par 5 · fairway only/);
        assert.match(t, /In the fairway\? Enter your drive\./);
        assert.match(t, /Save my drive/);
        assert.doesNotMatch(t, /Not on the green/);
        tap(sb, html(sb, 'contest-prompt'), (x) => /data-entry="team4_p1"/.test(x));
        el(sb, 'cp-yds').value = '287';
        tap(sb, html(sb, 'contest-prompt'), byId('cp-save'));
        await settle();
        const v = updates(sb)[0].value;
        assert.equal(v['contestEntries/CT1/h12/team4_p1'].yards, 287);
        assert.equal(v['contestEntries/CT1/h12/team4_p1'].name, 'Jo Kim');
        assert.ok(!('inches' in v['contestEntries/CT1/h12/team4_p1']));
    });
    test('B4 a distance the rules would refuse is never sent: 12 inches, 101 ft, nothing typed, no golfer picked', async () => {
        const sb = arriveCard(teamEvent({ contests: CONTESTS }), undefined, {});
        tap(sb, html(sb, 'contest-prompt'), byId('cp-save'));
        assert.match(plain(html(sb, 'contest-prompt')), /Tap whose ball it is first\./);
        tap(sb, html(sb, 'contest-prompt'), (t) => /data-entry="team4_p0"/.test(t));
        for (const [ft, inch] of [['8', '12'], ['101', '0'], ['', '']]) {
            el(sb, 'cp-ft').value = ft; el(sb, 'cp-in').value = inch;
            tap(sb, html(sb, 'contest-prompt'), byId('cp-save'));
            assert.match(plain(html(sb, 'contest-prompt')), /Enter feet and inches \(up to 100 ft\)\./, ft + '/' + inch);
        }
        await settle();
        assert.equal(updates(sb).length, 0, 'nothing written');
    });
    test('B5 a refused write (wrong key) says so in red and does not say Saved', async () => {
        const sb = arriveCard(teamEvent({ contests: CONTESTS }), undefined, {});
        sb.__dbRefuse = () => Object.assign(new Error('denied'), { code: 'PERMISSION_DENIED' });
        tap(sb, html(sb, 'contest-prompt'), (t) => /data-entry="team4_p0"/.test(t));
        el(sb, 'cp-ft').value = '3'; el(sb, 'cp-in').value = '1';
        tap(sb, html(sb, 'contest-prompt'), byId('cp-save'));
        await settle(); await settle();
        const t = plain(html(sb, 'contest-prompt'));
        assert.match(t, /Not saved — this link can't enter for this card\. Ask the organizer for your team's link\./);
        assert.doesNotMatch(t, /Saved:/);
    });
    test('B6 the prompt goes: every golfer entered; the hole confirmed (lockedAt); "Not on the green" tapped', () => {
        const both = { h7: { team4_p0: { name: 'Al Lopez', team: 'team4', kind: 'kp', inches: 100, by: 'typed', at: 1 }, team4_p1: { name: 'Jo Kim', team: 'team4', kind: 'kp', inches: 200, by: 'typed', at: 2 } } };
        assert.equal(shown(arriveCard(teamEvent({ contests: CONTESTS }), undefined, both), 'contest-prompt'), false, 'all entered');
        const locked = clone(CONTESTS); locked.h7 = { kind: 'kp', allowGps: true, winner: 'team7_p0', lockedAt: 5 };
        assert.equal(shown(arriveCard(teamEvent({ contests: locked }), undefined, {}), 'contest-prompt'), false, 'locked');
        const sb = arriveCard(teamEvent({ contests: CONTESTS }), undefined, {});
        assert.equal(shown(sb, 'contest-prompt'), true, 'positive: shown before the tap');
        tap(sb, html(sb, 'contest-prompt'), byId('cp-skip'));
        assert.equal(shown(sb, 'contest-prompt'), false, 'Not on the green');
    });
    test('B7 one golfer entered: the other still can, and the entered one shows their distance', () => {
        const one = { h7: { team4_p0: { name: 'Al Lopez', team: 'team4', kind: 'kp', inches: 100, by: 'typed', at: 1 } } };
        const sb = arriveCard(teamEvent({ contests: CONTESTS }), undefined, one);
        const h = html(sb, 'contest-prompt');
        assert.match(plain(h), /Al ✓ 8 ft 4 in/);
        assert.ok(/data-entry="team4_p1"/.test(h) && !/data-entry="team4_p0"/.test(h), 'only Jo is pickable');
    });
    test('B8 a group link on an individual event: each golfer by player id, the group key as the proof', async () => {
        const rec = { name: 'Medal', format: 'individual', scoringModel: 'player-v1', courseName: 'Papago', courseData: COURSE, createdAt: 1, ownerUid: 'u-org',
            players: { pat: { id: 'pat', name: 'Pat Reyes', handicap: '0' } }, scoringGroups: { g1: { name: 'Group 1', playerIds: ['pat'] } },
            scores: { pat_h1: 4, pat_h2: 4, pat_h3: 3, pat_h4: 5, pat_h5: 4, pat_h6: 4 }, contests: { h7: { kind: 'kp', allowGps: true } } };
        const sb = arriveCard(rec, `?tourney=CT1&group=g1&k=${K4}`, {});
        assert.match(plain(html(sb, 'contest-prompt')), /Hole 7 · Closest to the pin/);
        assert.doesNotMatch(html(sb, 'contest-prompt'), /cp-chip/, 'one golfer: no picker');
        el(sb, 'cp-ft').value = '12'; el(sb, 'cp-in').value = '0';
        tap(sb, html(sb, 'contest-prompt'), byId('cp-save'));
        await settle();
        assert.deepEqual(clone(updates(sb)[0].value['contestProofs/CT1/h7/pat']), { who: 'pat', k: K4, t: TS });
        assert.equal(updates(sb)[0].value['contestEntries/CT1/h7/pat'].inches, 144);
    });
    test('B9 a multi-round event shows no contests (one-round events only, for now)', () => {
        const rec = teamEvent({ contests: CONTESTS, eventModel: 'round-v1', rounds: { r1: { id: 'r1', name: 'Sat', status: 'open', format: 'scramble', courseData: COURSE, createdAt: 1, scores: {} } } });
        const sb = arriveCard(rec, `?tourney=CT1&team=4&round=r1&k=${K4}`, {});
        assert.equal(shown(sb, 'contest-prompt'), false);
        assert.doesNotMatch(CARD_HTML, /id="tab-btn-contests"/, 'no pill (EC2 A)');
        assert.ok(shown(sb, 'main-content'), 'positive: the card itself opened');
    });
});

describe('C. THE BOARD (E2c), reached by tapping the Contests tab', () => {
    const ENTRIES = {
        h7: { team7_p0: { name: 'Dee Nguyen', team: 'team7', kind: 'kp', inches: 37, by: 'typed', at: 2 },
            team4_p0: { name: 'Al Lopez', team: 'team4', kind: 'kp', inches: 100, by: 'typed', at: 1 } },
        h12: { team4_p0: { name: 'Al Lopez', team: 'team4', kind: 'ld', yards: 287, by: 'typed', at: 1 },
            team7_p0: { name: 'Pat Reyes', team: 'team7', kind: 'ld', yards: 301, by: 'gps', accFt: 9, at: 3 } }
    };
    // RE-PINNED 2026-11-11 (Manny: EC2 A). The golfer's Contests board (E2c) went
    // with its pill: the prompt on the contest hole is the whole of it for a
    // golfer. The organizer keeps the entries and Make winner (D-tests) and the
    // recap names confirmed winners. C1 and C2 proved the board's rows; what
    // stands here proves there is no board to reach, and the prompt still is.
    test('C1 (EC2 A) no golfer board: no pill, no panel, no board markup; the prompt on 7 still shows', () => {
        const sb = arriveCard(teamEvent({ contests: CONTESTS }), undefined, ENTRIES);
        assert.doesNotMatch(CARD_HTML, /id="tab-btn-contests"/, 'no pill');
        assert.doesNotMatch(CARD_HTML, /id="tab-contests"/, 'no panel');
        assert.doesNotMatch(CARD_HTML, /id="contest-board"/, 'no board');
        assert.doesNotMatch(CARD_HTML, /showTab\('contests'\)/);
        assert.equal(shown(sb, 'contest-prompt'), true, 'positive: the hole-7 prompt is on the card');
        assert.match(plain(html(sb, 'contest-prompt')), /Closest to the pin/);
    });
    test('C3 the web card asks for no location: no geolocation, no GPS mark, nothing named a coordinate in the contest code', () => {
        // Code only: comments may (and do) NAME what the page does not use.
        const strip = (x) => x.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
        const src = strip(CARD_HTML) + strip(fs.readFileSync(path.join(REPO_ROOT, 'tournament-contests.js'), 'utf8'));
        assert.match(src, /function saveContestEntry/, 'positive: the contest code survived the strip');
        assert.ok(src.length > 1000, 'positive: the sources were read');
        assert.doesNotMatch(src, /navigator\.geolocation|getCurrentPosition|watchPosition|HardPanMark|gps-kp\.js|saveKpLeader|pool-engine/);
    });
});

describe('D. THE ORGANIZER (E2d): Contests tab on tournament.html', () => {
    const ENTRIES = { h7: {
        team7_p0: { name: 'Dee Nguyen', team: 'team7', kind: 'kp', inches: 37, by: 'typed', at: 2 },
        team4_p0: { name: 'Al Lopez', team: 'team4', kind: 'kp', inches: 100, by: 'typed', at: 1 },
        team4_p1: { name: 'Jo Kim', team: 'team4', kind: 'kp', inches: 492, by: 'typed', at: 3 } } };
    function arriveOwner(rec, entries) {
        const sb = loadHtmlInlineScript(ORG, [], { search: '?tourney=OWN1' });
        sb.__auth.setUser(ORGANIZER);
        fire(sb, /^tournaments\/OWN1$/, rec);
        if (entries) fire(sb, /^contestEntries\/OWN1$/, entries);
        tap(sb, ORG_HTML, byId('tab-btn-contests'));
        return sb;
    }
    test('D1 the owner taps Contests: the holes with their pills, the first hole\'s entries with Make winner / Remove, the GPS line', () => {
        const sb = arriveOwner(teamEvent({ contests: CONTESTS }), ENTRIES);
        assert.equal(shown(sb, 'manage-tab-contests'), true);
        const list = plain(html(sb, 'contest-holes-list'));
        assert.match(list, /Hole 7 par 3 Closest to the pin Hole 12 par 5 Long drive · fairway only Hole 16 par 3 Closest to the pin \+ Add a contest hole/);
        const e = plain(html(sb, 'contest-entries'));
        assert.match(e, /Hole 7 entries Dee Nguyen 3 ft 1 in Make winner Remove Al Lopez 8 ft 4 in Make winner Remove Jo Kim 41 ft 0 in/);
        assert.match(plain(ORG_HTML.slice(ORG_HTML.indexOf('id="contest-note"'), ORG_HTML.indexOf('</p>', ORG_HTML.indexOf('id="contest-note"')))), /Override: "Make winner" locks the hole; a later entry cannot replace it\. Allow GPS marks:/);
        assert.equal(el(sb, 'contest-gps-toggle').textContent, 'on');
    });
    test('D2 Make winner writes winner + lockedAt (server time) in one update; the row then reads Winner ✓; Remove deletes one entry', async () => {
        const sb = arriveOwner(teamEvent({ contests: CONTESTS }), ENTRIES);
        tap(sb, html(sb, 'contest-entries'), (t) => /data-entry="team7_p0"/.test(t) && /makeContestWinner/.test(t));
        await settle();
        const w = sb.__dbWrites.filter((x) => x.path === 'tournaments/OWN1/contests/h7');
        assert.deepEqual(clone(w.map((x) => [x.op, x.value])), [['update', { winner: 'team7_p0', lockedAt: TS }]]);
        const c = clone(CONTESTS); c.h7 = { kind: 'kp', allowGps: true, winner: 'team7_p0', lockedAt: 9 };
        fire(sb, /^tournaments\/OWN1$/, teamEvent({ contests: c }));
        assert.match(plain(html(sb, 'contest-entries')), /Dee Nguyen 3 ft 1 in Winner ✓ Al Lopez/);
        tap(sb, html(sb, 'contest-entries'), (t) => /data-entry="team4_p1"/.test(t) && /removeContestEntry/.test(t));
        await settle();
        assert.ok(sb.__dbWrites.some((x) => x.op === 'remove' && x.path === 'contestEntries/OWN1/h7/team4_p1'));
    });
    test('D3 + Add a contest hole: par 3 defaults to closest to the pin; Add writes { kind, allowGps: true }', async () => {
        const sb = arriveOwner(teamEvent({ contests: {} }), {});
        // 2026-11-11 (EC2 + C): with no contest holes yet the list offers the course's
        // own suggestion first; "Pick my own" opens the old form.
        tap(sb, html(sb, 'contest-holes-list'), byId('contest-pick-own'));
        assert.match(html(sb, 'contest-holes-list'), /id="contest-add-form"/);
        el(sb, 'contest-add-hole').value = '7';
        el(sb, 'contest-add-kind').value = 'kp';
        tap(sb, html(sb, 'contest-holes-list'), byId('contest-add-save'));
        await settle();
        const w = sb.__dbWrites.filter((x) => x.path === 'tournaments/OWN1/contests/h7');
        assert.deepEqual(clone(w.map((x) => [x.op, x.value])), [['set', { kind: 'kp', allowGps: true }]]);
    });
    test('D3b (EC2 + C, 2026-11-11) Use these: closest to the pin on every par 3, long drive on the last par 5 (no yardage on this card), ONE update', async () => {
        const sb = arriveOwner(teamEvent({ contests: {} }), {});
        assert.match(plain(html(sb, 'contest-holes-list')), /Suggested: closest to the pin on every par 3 \(holes 3, 7, 13, 16\) and long drive on 18\./);
        tap(sb, html(sb, 'contest-holes-list'), byId('contest-use-suggested'));
        await settle();
        const u = updates(sb);
        assert.equal(u.length, 1, 'one multi-path update');
        const exp = {}; [3, 7, 13, 16].forEach((h) => { exp[`tournaments/OWN1/contests/h${h}`] = { kind: 'kp', allowGps: true }; });
        exp['tournaments/OWN1/contests/h18'] = { kind: 'ld', allowGps: true };
        assert.deepEqual(clone(u[0].value), exp);
    });
    test('D4 Allow GPS marks: tapping "on" turns it off on every contest hole in one update', async () => {
        const sb = arriveOwner(teamEvent({ contests: CONTESTS }), {});
        tap(sb, ORG_HTML, byId('contest-gps-toggle'));
        await settle();
        const u = sb.__dbWrites.filter((x) => x.op === 'update' && x.value && 'tournaments/OWN1/contests/h7/allowGps' in x.value);
        assert.equal(u.length, 1);
        assert.deepEqual(clone(u[0].value), { 'tournaments/OWN1/contests/h7/allowGps': false, 'tournaments/OWN1/contests/h12/allowGps': false, 'tournaments/OWN1/contests/h16/allowGps': false });
    });
});
