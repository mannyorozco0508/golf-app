// ============================================================================
// E2 - THE LOCATION GUARD FOR TOURNAMENT CONTESTS (the tournament version of
// gps_kp_test.js part 4, which lives on the consumer GPS branch, not here).
//
// THE GUARANTEE (EVENT-COMMS-PLAN.md section 2): no latitude or longitude is
// ever stored. A contest entry is a distance and a time.
//
//   1  every write the web makes for a whole contest - a team card's KP and long
//      drive, a group card's KP, the organizer's add / Make winner / Remove /
//      GPS switch - is walked value by value: no key that names a position, no
//      [lat, lng] pair, no number shaped like a coordinate; and every entry
//      carries only TournamentContests.ENTRY_FIELDS
//   2  the RULES refuse the rest: the candidate's entry and proof nodes end in
//      $other: false, and every named child is a bounded number or a short
//      string (tournament_contest_rules_emulator_test.js test 7 sends lat, lng,
//      a point and a nested position to the emulator and sees each refused)
//   3  the web never reads a location: no geolocation call in the card, the
//      organizer page or tournament-contests.js (code, comments stripped)
//
// Every page write here is reached through the URL and taps, as in
// tournament_contests_test.js. mini-dom limits are the same and said there.
//
// BASELINE (final file): against event-tools cf86caf8 (tournament-contests.js
// and the rules builder absent): the file does not load ("Cannot find module
// ./tournament-contests.js"), node reports one file-level failure and none of
// the 4 tests runs - red, and it proves nothing per assertion. The controls
// below are the per-assertion proof.
// Against the build: all 4 tests: 4 PASS / 0 FAIL.
// NEGATIVE CONTROLS (restored by copying a saved file back, sha printed with
// RESTORED-OK): a `lat` added to TournamentContests.entryRecord -> tests 1 and
// 4 fail; the entry $other removed from the builder -> test 2 fails; a
// navigator.geolocation call added to the card -> test 3 fails.
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const TC = require('./tournament-contests.js');
const { build } = require('./tools/event-contests-rules-candidate.js');

const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 5, 3, 4, 4, 3, 4, 5];
const COURSE = PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: i + 1 }));
const K = 'e'.repeat(32);
const clone = (o) => JSON.parse(JSON.stringify(o));
const settle = () => new Promise((r) => setImmediate(r));
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

function load(page, search) {
    const sb = loadHtmlInlineScript(page, [], { search });
    const make = sb.document.createElement.bind(sb.document);
    sb.document.createElement = (tag) => { const n = make(tag); if (String(tag).toLowerCase() === 'template') n.content = { querySelectorAll: () => [] }; return n; };
    return sb;
}
function fire(sb, re, value) {
    const hs = sb.__dbHandlers.filter((h) => h.event === 'value' && re.test(h.path));
    assert.ok(hs.length, 'listener ' + re);
    hs.forEach((h) => h.cb({ val: () => clone(value), exists: () => value != null }));
}
function tap(sb, markup, pick) {
    const tag = (markup.match(/<(button|span)\b[^>]*>/g) || []).find(pick);
    assert.ok(tag, 'nothing to tap');
    const ds = {};
    tag.replace(/\bdata-([a-z-]+)="([^"]*)"/g, (_, k, v) => { ds[k] = v; });
    sb.__tapEl = { dataset: ds };
    vm.runInContext('(function () { ' + /\bonclick="([^"]*)"/.exec(tag)[1] + ' }).call(__tapEl)', sb);
}
const html = (sb, id) => String(sb.document.getElementById(id).innerHTML || '');

// A value that could place someone: a named position key, a [lat, lng] pair,
// or a non-integer number in a latitude / longitude range.
const POS_KEY = /^(lat|lng|lon|long|latitude|longitude|pt|pts|pos|position|coords?|location|geo|ball|cup|tee|point)$/i;
function findCoordinates(v, where, out) {
    if (Array.isArray(v)) {
        if (v.length === 2 && v.every((x) => typeof x === 'number')) out.push(where + ' is a number pair');
        v.forEach((x, i) => findCoordinates(x, where + '[' + i + ']', out));
    } else if (v && typeof v === 'object') {
        Object.keys(v).forEach((k) => {
            if (POS_KEY.test(k)) out.push(where + '/' + k + ' names a position');
            k.split('/').forEach((seg) => { if (POS_KEY.test(seg)) out.push(where + ' path segment ' + seg); });
            findCoordinates(v[k], where + '/' + k, out);
        });
    } else if (typeof v === 'number' && v % 1 !== 0 && Math.abs(v) <= 180) {
        out.push(where + ' = ' + v + ' (a fractional number in coordinate range)');
    } else if (typeof v === 'string' && /-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/.test(v)) {
        out.push(where + ' = "' + v + '" (a "lat,lng" string)');
    }
    return out;
}

test('1. every contest write the web makes holds a distance and a time - never a position', async () => {
    const writes = [];
    // A team card: KP for Al, long drive for Jo.
    const scores = {}; [4, 5, 6].forEach((h) => { scores['team4_h' + h] = PARS[h - 1]; });
    const team = { name: 'Rattle Classic', format: 'scramble', courseName: 'Papago', courseData: COURSE, createdAt: 1, ownerUid: 'u-org', scores,
        teams: { team4: { num: 4, name: 'Team 4', players: ['Al Lopez', 'Jo Kim'], startingHole: 4 } },
        contests: { h7: { kind: 'kp', allowGps: true }, h8: { kind: 'ld', fairwayOnly: true, allowGps: true } } };
    let sb = load('tournament-scorecard.html', `?tourney=CT1&team=4&k=${K}`);
    fire(sb, /^tournaments\/CT1$/, team); fire(sb, /^contestEntries\/CT1$/, {});
    tap(sb, html(sb, 'contest-prompt'), (t) => /data-entry="team4_p0"/.test(t));
    sb.document.getElementById('cp-ft').value = '9'; sb.document.getElementById('cp-in').value = '10';
    tap(sb, html(sb, 'contest-prompt'), (t) => /id="cp-save"/.test(t));
    await settle();
    const t2 = clone(team); t2.scores.team4_h7 = 3;
    fire(sb, /^tournaments\/CT1$/, t2);
    tap(sb, html(sb, 'contest-prompt'), (t) => /data-entry="team4_p1"/.test(t));
    sb.document.getElementById('cp-yds').value = '301';
    tap(sb, html(sb, 'contest-prompt'), (t) => /id="cp-save"/.test(t));
    await settle();
    writes.push(...sb.__dbWrites);
    // A group card.
    const ind = { name: 'Medal', format: 'individual', scoringModel: 'player-v1', courseName: 'Papago', courseData: COURSE, createdAt: 1, ownerUid: 'u-org',
        players: { pat: { id: 'pat', name: 'Pat Reyes', handicap: '0' } }, scoringGroups: { g1: { name: 'Group 1', playerIds: ['pat'] } },
        scores: { pat_h1: 4, pat_h2: 4, pat_h3: 3, pat_h4: 5, pat_h5: 4, pat_h6: 4 }, contests: { h7: { kind: 'kp', allowGps: true } } };
    sb = load('tournament-scorecard.html', `?tourney=CT2&group=g1&k=${K}`);
    fire(sb, /^tournaments\/CT2$/, ind); fire(sb, /^contestEntries\/CT2$/, {});
    sb.document.getElementById('cp-ft').value = '0'; sb.document.getElementById('cp-in').value = '7';
    tap(sb, html(sb, 'contest-prompt'), (t) => /id="cp-save"/.test(t));
    await settle();
    writes.push(...sb.__dbWrites);
    // The organizer: add a hole, Make winner, Remove, the GPS switch.
    sb = load('tournament.html', '?tourney=OWN1');
    sb.__auth.setUser({ uid: 'u-org', email: 'org@example.com', isAnonymous: false });
    fire(sb, /^tournaments\/OWN1$/, team);
    fire(sb, /^contestEntries\/OWN1$/, { h7: { team4_p0: { name: 'Al Lopez', team: 'team4', kind: 'kp', inches: 118, by: 'typed', at: 1 }, team4_p1: { name: 'Jo Kim', team: 'team4', kind: 'kp', inches: 200, by: 'gps', accFt: 9, at: 2 } } });
    tap(sb, read('tournament.html'), (t) => /id="tab-btn-contests"/.test(t));
    tap(sb, html(sb, 'contest-entries'), (t) => /data-entry="team4_p0"/.test(t) && /makeContestWinner/.test(t));
    tap(sb, html(sb, 'contest-entries'), (t) => /data-entry="team4_p1"/.test(t) && /removeContestEntry/.test(t));
    tap(sb, html(sb, 'contest-holes-list'), (t) => /id="contest-add-btn"/.test(t));
    sb.document.getElementById('contest-add-hole').value = '12'; sb.document.getElementById('contest-add-kind').value = 'ld';
    tap(sb, html(sb, 'contest-holes-list'), (t) => /id="contest-add-save"/.test(t));
    tap(sb, read('tournament.html'), (t) => /id="contest-gps-toggle"/.test(t));
    await settle();
    writes.push(...sb.__dbWrites.filter((w) => /contest/.test(w.path) || (w.value && Object.keys(w.value).some((k) => /contest/.test(k)))));

    const entries = [];
    writes.forEach((w) => {
        if (w.op === 'update' && !w.path) Object.keys(w.value).forEach((k) => { if (k.startsWith('contestEntries/')) entries.push(clone(w.value[k])); });
    });
    // Positive: the walk had something to walk - three entries, three proofs, the organizer's four writes.
    assert.equal(entries.length, 3, 'three golfer entries were written');
    assert.ok(writes.length >= 7, 'the writes were captured: ' + writes.length);
    entries.forEach((e) => assert.deepEqual(Object.keys(e).filter((k) => TC.ENTRY_FIELDS.indexOf(k) === -1), [], 'only ENTRY_FIELDS: ' + Object.keys(e)));
    const found = [];
    writes.forEach((w, i) => findCoordinates({ [w.path || '(root)']: clone(w.value) }, '#' + i, found));
    assert.deepEqual(found, []);
    // And the walker itself is live: it finds each shape it is looking for.
    assert.equal(findCoordinates({ lat: 33.45001 }, 'x', []).length, 3, 'a named key (twice: as key and path segment) and a fractional value');
    assert.equal(findCoordinates({ a: [33.45, -111.95] }, 'x', []).length >= 1, true);
    assert.equal(findCoordinates({ a: '33.45001,-111.95002' }, 'x', []).length, 1);
});

test('2. the rules hold the line: entry and proof nodes end in $other: false, every child bounded', () => {
    // The builder run on a minimal stand-in for LIVE (the full LIVE file is in the
    // inbox and is used by the emulator test; this needs only the block itself).
    const cand = build({ rules: Object.assign({ $other: { '.read': false, '.write': false }, tournamentKeys: { $code: {} } },
        { tournaments: { $tourneyCode: { '.write': "auth != null && (!data.exists() || (data.hasChild('ownerUid') && data.child('ownerUid').val() === auth.uid))" } } }) });
    assert.ok(cand.rules.contestEntries && cand.rules.contestProofs, 'positive: the block was built');
    const e = cand.rules.contestEntries.$code.$hole.$entryKey;
    const p = cand.rules.contestProofs.$code.$hole.$entryKey;
    assert.deepEqual(e.$other, { '.validate': false });
    assert.deepEqual(p.$other, { '.validate': false });
    const named = Object.keys(e).filter((k) => !k.startsWith('.') && k !== '$other').sort();
    assert.deepEqual(named, TC.ENTRY_FIELDS.slice().sort(), 'the rules name exactly ENTRY_FIELDS');
    assert.match(e.inches['.validate'], /newData\.val\(\) >= 0 && newData\.val\(\) <= 1200/);
    assert.match(e.yards['.validate'], /newData\.val\(\) >= 50 && newData\.val\(\) <= 450/);
    assert.match(e.accFt['.validate'], /<= 300/);
});

test('3. the web never reads a location (code only; comments may name what is not used)', () => {
    const strip = (x) => x.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    const files = ['tournament-scorecard.html', 'tournament.html', 'tournament-contests.js'];
    const src = files.map((f) => strip(read(f))).join('\n');
    assert.match(src, /function saveContestEntry/, 'positive: the card code is in the scan');
    assert.match(src, /function makeContestWinner/, 'positive: the organizer code is in the scan');
    assert.doesNotMatch(src, /navigator\.geolocation|getCurrentPosition|watchPosition|DeviceOrientation/);
});

test('4. the shared builder writes only distance fields, whatever it is handed', () => {
    const u = TC.entryUpdate({ code: 'C', hole: 7, kind: 'kp', entryKey: 'team1_p0', who: 'team1', team: 'team1', name: 'Ann', inches: 12,
        k: K, lat: 33.4, lng: -111.9, pt: [33.4, -111.9] }, { '.sv': 'timestamp' });
    const e = u['contestEntries/C/h7/team1_p0'];
    assert.deepEqual(Object.keys(e).sort(), ['at', 'by', 'inches', 'kind', 'name', 'team']);
    assert.deepEqual(findCoordinates(clone(u), 'u', []), []);
    assert.deepEqual(clone(u['contestProofs/C/h7/team1_p0']), { who: 'team1', k: K, t: { '.sv': 'timestamp' } });
});
