// ============================================================================
// SCORECARD LOCK: EVERY PATH THAT MAKES A TEAM OR GROUP KEYS IT, IN THE SAME
// WRITE, AND THE KEY ON ITS LINK CAN SCORE (scorecard-lock wave, 2026-10-06)
//
// A team/group link carries &k=. On an event whose keys are on, the rules
// accept a golfer's score only with a same-update proof carrying that key.
// So a team that exists WITHOUT a key on a locked event is a team nobody can
// score - and every writer that can make one is a way to ship that bug.
//
// THE PATHS FOUND (tournament.html), each driven here as the organizer does:
//   create (saveTournament)        team keys + on:true, ONE update with the record
//   Add Another Team (saveNewTeam) the team + t/team<N>, one update
//   Desk approve into a new team   joins the approve's own multi-path update
//   multi-round round create       writes NO key: teams are event-level and a new
//                                  round starts with no groups - proven by
//                                  scoring the new round with the team's key
//   group create                   the group + g/<gid>
//   golfer into / between groups   the move + that golfer's key (p/ or r/<rid>/)
//   group delete, team remove      the key goes in the same write
//   Lock scoring links             backfills every key, then on:true
//
// "CAN SCORE" IS ASKED OF THE REAL RULES. After each path the writes are
// applied to a model database, the page re-renders from it, the key is read
// off the LINK THE PAGE RENDERED (not out of the write), and targaryen
// evaluates database.rules.json for a signed-out golfer sending that score
// with that key - and, as the control, the same score with no key.
// targaryen agrees with the emulator on every arm both run
// (tools/tournament-scorecard-lock-emulator-check.js is the emulator half,
// including the offline-replay proof of `now`).
//
// mini-dom has no crypto; these tests inject Node's webcrypto, as a browser
// has. Without it the page writes NO key (never a guessable one) - asserted
// at the end.
//
// BASELINE over the FINISHED file, all 18 tests: measured against main
// 3f8bb35, tournament.html and tournament-scorecard.html swapped back and
// restored by sha from a saved copy (this branch's rules file in both runs):
//
//   5 PASS / 13 FAIL / 18 tests.   5 + 13 = 18.
//
// FIVE PASS on main by construction. The three targaryen rows are rules-only
// (this branch's rules in both runs, no page involved). Of the other two: "an unlocked event keeps
// working" is a rules-only row (no page involved), and "no key rather than a
// guessable one" holds on a page that never wrote keys at all. Both are kept
// for what they catch later: a rules change that locks every event, and a
// key generator that falls back to Math.random.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const nodeCrypto = require('crypto');
const targaryen = require('targaryen');
const RULES = require('./database.rules.json');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');
const { applyWrites } = require('./helpers/tournament-write-apply.js');

const CODE = 'LK1';
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const TS = { '.sv': 'timestamp' };
const clone = (o) => JSON.parse(JSON.stringify(o));
const key = () => nodeCrypto.randomBytes(16).toString('hex');

function teamEvent() {
    return { name: 'Lock Day', format: 'scramble', courseName: 'C', courseData: COURSE, createdAt: 1, ownerUid: OWNER.uid,
        teams: { team1: { num: 1, name: 'Eagles', players: ['Ann'], handicap: 0 }, team2: { num: 2, name: 'Hawks', players: ['Bo'], handicap: 0 } } };
}
function indEvent(multi) {
    const r = { name: 'Medal', format: 'individual', scoringModel: 'player-v1', courseName: 'C', courseData: COURSE, createdAt: 1, ownerUid: OWNER.uid,
        players: { pann: { id: 'pann', name: 'Ann', handicap: '0' }, pbo: { id: 'pbo', name: 'Bo', handicap: '0' } }, scoringGroups: {} };
    if (multi) { r.eventModel = 'round-v1'; r.rounds = { r1: { id: 'r1', name: 'Sat', status: 'open', format: 'individual', courseData: COURSE, createdAt: 1, scoringGroups: {} } }; }
    return r;
}
const lockedKeys = (rec) => {
    const t = {}; Object.values(rec.teams || {}).forEach((x) => { t['team' + x.num] = key(); });
    return { on: true, t };
};

// The owner's page on a model database. Writes are applied to the model and
// fed back through the page's own listeners - the record and the keys.
function ownerPage(model) {
    const sb = loadHtmlInlineScript('tournament.html', [], {
        search: '?tourney=' + CODE,
        beforeRun(s) { s.crypto = nodeCrypto.webcrypto; }
    });
    sb.__model = model;
    sb.__seen = 0;
    sb.__deliver = () => {
        sb.__dbHandlers.filter((x) => x.event === 'value' && x.path === 'tournaments/' + CODE)
            .forEach((x) => x.cb({ val: () => clone(model.tournaments[CODE]), exists: () => true }));
        sb.__dbHandlers.filter((x) => x.event === 'value' && x.path === 'tournamentKeys/' + CODE)
            .forEach((x) => x.cb({ val: () => clone((model.tournamentKeys || {})[CODE] || null), exists: () => !!(model.tournamentKeys || {})[CODE] }));
    };
    sb.__deliver();
    sb.__auth.setUser(OWNER);
    sb.__deliver();
    vm.runInContext('alert = function () {}; confirm = function () { return true; };', sb);
    return sb;
}
// The writes since the last call, applied to the model and echoed.
function settle(sb) {
    const fresh = sb.__dbWrites.slice(sb.__seen);
    sb.__seen = sb.__dbWrites.length;
    applyWrites(sb.__model, fresh, '');
    sb.__deliver();
    return fresh;
}
const run = (sb, js) => vm.runInContext(js, sb);
const linkKeys = (sb, listId) => [...String(sb.document.getElementById(listId).innerHTML)
    .matchAll(/(?:data-share-url|href)="([^"]*tournament-scorecard\.html[^"]*)"/g)]
    .map((m) => m[1].replace(/&amp;/g, '&'))
    .filter((u, i, all) => all.indexOf(u) === i)   // a group row has the url twice: link + Share
    .map((u) => ({ url: u, team: (/[?&]team=(\d+)/.exec(u) || [])[1], group: (/[?&]group=([^&]+)/.exec(u) || [])[1],
                   round: (/[?&]round=([^&]+)/.exec(u) || [])[1], k: (/[?&]k=([0-9a-f]+)/.exec(u) || [])[1] }));

// The real rules, a signed-out golfer, one multi-path update - exactly what
// tournament-scorecard.html keyedScore() sends.
function canScore(model, scoreKey, who, k, rid) {
    const db = targaryen.database(RULES, clone(model)).as(null);
    const base = rid ? `tournaments/${CODE}/rounds/${rid}/scores/` : `tournaments/${CODE}/scores/`;
    const proof = rid ? `scoreProofs/${CODE}/r/${rid}/` : `scoreProofs/${CODE}/`;
    const upd = { [base + scoreKey]: 4 };
    if (k !== undefined) upd[proof + scoreKey] = { who, k, t: TS };
    return db.update('/', upd).allowed;
}
function assertScorable(model, scoreKey, who, k, rid) {
    assert.ok(k, `no key on the link for ${who}`);
    assert.equal(canScore(model, scoreKey, who, k, rid), true, `${who} cannot score ${scoreKey} with the key on its link`);
    assert.equal(canScore(model, scoreKey, who, undefined, rid), false, `CONTROL: ${who} scored ${scoreKey} with NO key - the event is not locked`);
}
const oneWrite = (writes) => { assert.equal(writes.length, 1, 'expected ONE write, got ' + JSON.stringify(writes.map((w) => w.op + ' ' + w.path))); return writes[0].value; };

describe('create', () => {
    test('a new owned event is born locked: record + every team key in ONE update, and each team link scores', async () => {
        const model = { tournaments: {} };
        const sb = loadHtmlInlineScript('tournament.html', [], { beforeRun(s) { s.crypto = nodeCrypto.webcrypto; } });
        // The create form, mounted as elements (mini-dom parses no innerHTML),
        // the same way tournament_signin_gate_test.js drives saveTournament.
        run(sb, `
            authUser = { uid: 'u-org', email: 'org@example.com' };
            selectedCourseData = ${JSON.stringify(COURSE)};
            var n = document.createElement('input'); n.id = 't-name'; n.value = 'Born Locked'; document.__mount(n);
            var btn = document.createElement('button'); btn.innerHTML = 'Save'; document.__mount(btn); window.__btn = btn;
            var list = document.createElement('div'); list.id = 'teams-list'; document.__mount(list);
            ['Ann', 'Bo'].forEach(function (nm) {
                var card = document.createElement('div'); card.className = 'team-card'; list.appendChild(card);
                var ins = document.createElement('div'); ins.className = 'team-name-inputs'; card.appendChild(ins);
                var pi = document.createElement('input'); pi.value = nm; ins.appendChild(pi);
            });
            alert = function () {};
            saveTournament(btn);`);
        for (let i = 0; i < 10 && !sb.__dbWrites.length; i++) await new Promise((r) => setImmediate(r));
        const v = oneWrite(sb.__dbWrites);
        const code = Object.keys(v).find((k) => /^tournaments\//.test(k)).split('/')[1];
        assert.equal(v[`tournamentKeys/${code}`].on, true);
        const teams = v[`tournaments/${code}`].teams;
        assert.equal(Object.keys(teams).length, 2);
        Object.values(teams).forEach((t) => assert.match(v[`tournamentKeys/${code}`].t['team' + t.num], /^[0-9a-f]{32}$/));
        // Then the owner opens it: the rendered links carry those keys, and they score.
        applyWrites(model, sb.__dbWrites, '');
        model.tournaments[CODE] = model.tournaments[code]; model.tournamentKeys = { [CODE]: model.tournamentKeys[code] };
        const page = ownerPage(model);
        const links = linkKeys(page, 'team-links-list');
        assert.equal(links.length, 2);
        links.forEach((l) => assertScorable(model, `team${l.team}_h1`, 'team' + l.team, l.k));
    });
});

describe('teams on a locked event', () => {
    const lockedTeamModel = () => { const r = teamEvent(); return { tournaments: { [CODE]: r }, tournamentKeys: { [CODE]: lockedKeys(r) } }; };

    test('Add Another Team: team + key in ONE update; its link scores', () => {
        const model = lockedTeamModel();
        const sb = ownerPage(model);
        run(sb, "document.getElementById('new-team-p1').value = 'Cal'; document.getElementById('new-team-name').value = 'Owls'; saveNewTeam();");
        const v = oneWrite(settle(sb));
        assert.ok(v[`tournaments/${CODE}/teams/team3`] && /^[0-9a-f]{32}$/.test(v[`tournamentKeys/${CODE}/t/team3`]));
        const l = linkKeys(sb, 'team-links-list').find((x) => x.team === '3');
        assertScorable(model, 'team3_h1', 'team3', l && l.k);
    });

    test('Desk approve into a NEW team: the key rides the approve write; its link scores', () => {
        const model = lockedTeamModel();
        const sb = ownerPage(model);
        sb.__dbHandlers.filter((x) => x.event === 'value' && x.path === 'registrations/' + CODE)
            .forEach((x) => x.cb({ val: () => ({ e1: { fullName: 'Dee', email: 'd@example.com', phone: '555-0001', createdAt: 1 } }), exists: () => true }));
        sb.document.getElementById('reg-dest-e1').value = 'new';
        run(sb, "approveRegistration('e1')");
        const v = oneWrite(settle(sb));
        assert.ok(v[`tournaments/${CODE}/teams/team3`]);
        assert.match(v[`tournamentKeys/${CODE}/t/team3`], /^[0-9a-f]{32}$/);
        assert.equal(v[`registrations/${CODE}/e1/teamNum`], 3);
        const l = linkKeys(sb, 'team-links-list').find((x) => x.team === '3');
        assertScorable(model, 'team3_h1', 'team3', l && l.k);
    });

    test('multi-round: a NEW round needs no new key - every team scores it with its own link', () => {
        const r = teamEvent(); r.eventModel = 'round-v1';
        r.rounds = { r1: { id: 'r1', name: 'Sat', status: 'open', format: 'scramble', courseData: COURSE, createdAt: 1, scoringGroups: {} } };
        const model = { tournaments: { [CODE]: r }, tournamentKeys: { [CODE]: lockedKeys(r) } };
        const sb = ownerPage(model);
        run(sb, 'createRound()');
        const w = settle(sb);
        const rid = Object.keys(model.tournaments[CODE].rounds).find((x) => x !== 'r1');
        assert.ok(rid, 'no round was created: ' + JSON.stringify(w));
        model.tournaments[CODE].rounds[rid].status = 'open';
        sb.__deliver();
        const links = linkKeys(sb, 'team-links-list').filter((x) => x.round === rid);
        assert.equal(links.length, 2, 'the new round has no team links');
        links.forEach((l) => assertScorable(model, `team${l.team}_h1`, 'team' + l.team, l.k, rid));
    });

    test('Remove team: the team and its key go in ONE update', () => {
        const model = lockedTeamModel();
        const sb = ownerPage(model);
        run(sb, 'removeTeam(2)');
        const v = oneWrite(settle(sb));
        assert.deepEqual(clone(v), { [`tournaments/${CODE}/teams/team2`]: null, [`tournamentKeys/${CODE}/t/team2`]: null });
        assert.equal(model.tournamentKeys[CODE].t.team2, undefined);
    });
});

describe('groups on a locked individual event', () => {
    test('group create keys the group; a golfer assigned to it gets its key in the same write; the group link scores them', () => {
        const r = indEvent(false);
        const model = { tournaments: { [CODE]: r }, tournamentKeys: { [CODE]: { on: true } } };
        const sb = ownerPage(model);
        run(sb, 'createScoringGroup()');
        const v1 = oneWrite(settle(sb));
        const gid = Object.keys(model.tournaments[CODE].scoringGroups)[0];
        assert.match(v1[`tournamentKeys/${CODE}/g/${gid}`], /^[0-9a-f]{32}$/);
        run(sb, `assignPlayerToGroup('pann', '${gid}')`);
        const v2 = oneWrite(settle(sb));
        assert.equal(v2[`tournamentKeys/${CODE}/p/pann`], model.tournamentKeys[CODE].g[gid]);
        const l = linkKeys(sb, 'group-links-list').find((x) => x.group === gid);
        assertScorable(model, 'pann_h1', 'pann', l && l.k);
    });

    test('moving a golfer to another group moves their key: the old group link stops scoring them', () => {
        const r = indEvent(false);
        const model = { tournaments: { [CODE]: r }, tournamentKeys: { [CODE]: { on: true } } };
        const sb = ownerPage(model);
        run(sb, 'createScoringGroup()'); settle(sb);
        run(sb, 'createScoringGroup()'); settle(sb);
        const [g1, g2] = Object.keys(model.tournaments[CODE].scoringGroups);
        run(sb, `assignPlayerToGroup('pann', '${g1}')`); settle(sb);
        run(sb, `assignPlayerToGroup('pann', '${g2}')`);
        oneWrite(settle(sb));
        const links = linkKeys(sb, 'group-links-list');
        const k1 = links.find((x) => x.group === g1).k, k2 = links.find((x) => x.group === g2).k;
        assertScorable(model, 'pann_h1', 'pann', k2);
        assert.equal(canScore(model, 'pann_h1', 'pann', k1), false, 'the old group link still scores a golfer who moved');
    });

    test('multi-round: a golfer’s key is per round (r/<rid>/<pid>)', () => {
        const r = indEvent(true);
        const model = { tournaments: { [CODE]: r }, tournamentKeys: { [CODE]: { on: true } } };
        const sb = ownerPage(model);
        run(sb, "editingRoundId = 'r1'; createScoringGroup()"); settle(sb);
        const gid = Object.keys(model.tournaments[CODE].rounds.r1.scoringGroups)[0];
        run(sb, `assignPlayerToGroup('pbo', '${gid}')`);
        const v = oneWrite(settle(sb));
        assert.equal(v[`tournamentKeys/${CODE}/r/r1/pbo`], model.tournamentKeys[CODE].g[gid]);
        const l = linkKeys(sb, 'group-links-list').find((x) => x.group === gid);
        assert.equal(l.round, 'r1');
        assertScorable(model, 'pbo_h1', 'pbo', l.k, 'r1');
    });

    test('group delete removes its key in the same write', () => {
        const r = indEvent(false);
        const model = { tournaments: { [CODE]: r }, tournamentKeys: { [CODE]: { on: true } } };
        const sb = ownerPage(model);
        run(sb, 'createScoringGroup()'); settle(sb);
        const gid = Object.keys(model.tournaments[CODE].scoringGroups)[0];
        run(sb, `deleteScoringGroup('${gid}')`);
        const v = oneWrite(settle(sb));
        assert.deepEqual(Object.keys(v).sort(), [`tournamentKeys/${CODE}/g/${gid}`, `tournaments/${CODE}/scoringGroups/${gid}`]);
    });
});

describe('Lock scoring links (an existing event, opt-in)', () => {
    test('backfills every team, group and golfer key, turns the lock on, in ONE update; every link then scores and an unkeyed score is refused', () => {
        const r = indEvent(false);
        r.scoringGroups = { gA: { id: 'gA', name: 'A', playerIds: ['pann'] }, gB: { id: 'gB', name: 'B', playerIds: ['pbo'] } };
        const model = { tournaments: { [CODE]: r } };   // no keys at all: an event from before this wave
        const sb = ownerPage(model);
        assert.match(String(sb.document.getElementById('lock-links-state').textContent), /Locking gives every team and group link its own key/);
        run(sb, 'lockScoringLinks()');
        const v = oneWrite(settle(sb));
        assert.equal(v[`tournamentKeys/${CODE}/on`], true);
        const links = linkKeys(sb, 'group-links-list');
        assert.equal(links.length, 2);
        assertScorable(model, 'pann_h1', 'pann', links.find((x) => x.group === 'gA').k);
        assertScorable(model, 'pbo_h1', 'pbo', links.find((x) => x.group === 'gB').k);
    });

    test('refused once any score is posted, in any round: nothing written, and the panel says why', () => {
        const r = teamEvent(); r.scores = { team1_h1: 4 };
        const model = { tournaments: { [CODE]: r } };
        const sb = ownerPage(model);
        assert.match(String(sb.document.getElementById('lock-links-state').textContent), /only before the first score/);
        assert.equal(sb.document.getElementById('lock-links-btn').style.display, 'none');
        run(sb, 'lockScoringLinks()');
        assert.equal(sb.__dbWrites.length, 0);
    });

    test('an unlocked event keeps working with links from before the lock (no key needed)', () => {
        const model = { tournaments: { [CODE]: teamEvent() } };
        assert.equal(canScore(model, 'team1_h1', 'team1', undefined), true);
    });
});

describe('the scorecard', () => {
    function card(query, refuse) {
        const sb = loadHtmlInlineScript('tournament-scorecard.html', [], {
            search: '?' + query,
            beforeRun(s) { if (refuse) s.__dbRefuse = () => Object.assign(new Error('PERMISSION_DENIED'), { code: 'PERMISSION_DENIED' }); }
        });
        sb.__dbHandlers.filter((h) => h.event === 'value' && /tournaments\/LK1$/.test(h.path)).forEach((h) => {
            try { h.cb({ val: () => clone(teamEvent()), exists: () => true }); } catch (e) { if (!/querySelectorAll|content/.test(String(e.message))) throw e; }
        });
        return sb;
    }
    test('with &k= a score and its proof go in ONE update; without, the old single set', async () => {
        const keyed = card('tourney=LK1&team=1&k=' + 'a'.repeat(32));
        keyed.saveHoleScore(3, '5');
        const w = keyed.__dbWrites;
        assert.equal(w.length, 1); assert.equal(w[0].op, 'update');
        assert.equal(w[0].value['tournaments/LK1/scores/team1_h3'], 5);
        const p = w[0].value['scoreProofs/LK1/team1_h3'];
        assert.equal(p.who, 'team1'); assert.equal(p.k, 'a'.repeat(32)); assert.deepEqual(clone(p.t), TS);
        const plain = card('tourney=LK1&team=1');
        plain.saveHoleScore(3, '5');
        assert.deepEqual(plain.__dbWrites.map((x) => [x.op, x.path]), [['set', 'tournaments/LK1/scores/team1_h3']]);
    });
    test('a refused write says NOT SAVED and why, in red, and never "Saved"', async () => {
        const sb = card('tourney=LK1&team=1&k=' + 'b'.repeat(32), true);
        sb.saveHoleScore(3, '5');
        for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
        const el = sb.document.getElementById('save-state');
        assert.equal(el.textContent, "⚠️ Not saved — this link can't score this card. Ask the organizer for your team's link.");
        assert.equal(el.className, 'save-state error');
        await new Promise((r) => setTimeout(r, 2100));
        assert.equal(el.textContent, "⚠️ Not saved — this link can't score this card. Ask the organizer for your team's link.", 'the refusal faded away');
    });
});

describe('no secure random source', () => {
    test('the page writes NO key rather than a guessable one', () => {
        const model = { tournaments: { [CODE]: teamEvent() } };
        const sb = loadHtmlInlineScript('tournament.html', [], { search: '?tourney=' + CODE });   // no crypto
        sb.__dbHandlers.filter((x) => x.event === 'value' && x.path === 'tournaments/' + CODE)
            .forEach((x) => x.cb({ val: () => clone(model.tournaments[CODE]), exists: () => true }));
        sb.__auth.setUser(OWNER);
        run(sb, "document.getElementById('new-team-p1').value = 'Cal'; saveNewTeam();");
        assert.deepEqual(sb.__dbWrites.map((w) => [w.op, w.path]), [['set', `tournaments/${CODE}/teams/team3`]]);
    });
});

describe('the rules, in targaryen (the emulator check runs the full set)', () => {
    const K1 = key(), K2 = key();
    const model = () => ({ tournaments: { [CODE]: teamEvent() }, tournamentKeys: { [CODE]: { on: true, t: { team1: K1, team2: K2 } } } });
    const as = (uid) => targaryen.database(RULES, model()).as(uid ? { uid, provider: 'password', token: { firebase: { sign_in_provider: 'password' } } } : null);
    test('right key OK; wrong key, missing key, client-clock proof refused', () => {
        assert.equal(canScore(model(), 'team1_h1', 'team1', K1), true);
        assert.equal(canScore(model(), 'team1_h1', 'team1', K2), false);
        assert.equal(canScore(model(), 'team1_h1', 'team1', undefined), false);
        assert.equal(as(null).update('/', { [`tournaments/${CODE}/scores/team1_h1`]: 4, [`scoreProofs/${CODE}/team1_h1`]: { who: 'team1', k: K1, t: Date.now() - 5000 } }).allowed, false);
    });
    test('owner OK with no proof; signed-in stranger refused with none', () => {
        assert.equal(as(OWNER.uid).update('/', { [`tournaments/${CODE}/scores/team1_h1`]: 4 }).allowed, true);
        assert.equal(as('u-who').update('/', { [`tournaments/${CODE}/scores/team1_h1`]: 4 }).allowed, false);
    });
    test('keys: owner reads, a stranger and a signed-out visitor do not; the public record carries none', () => {
        assert.equal(as(OWNER.uid).read(`tournamentKeys/${CODE}`).allowed, true);
        assert.equal(as('u-who').read(`tournamentKeys/${CODE}`).allowed, false);
        assert.equal(as(null).read(`tournamentKeys/${CODE}`).allowed, false);
        assert.ok(!('tournamentKeys' in (model().tournaments[CODE])));
    });
});
