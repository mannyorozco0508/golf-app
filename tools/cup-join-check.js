#!/usr/bin/env node
// ============================================================================
// JOINING A CUP BY CODE, FROM A SECOND ROUND
//
// A Ryder Cup lives on ONE round and every other day points at it. The pointer has
// existed since v48; nothing could ever WRITE one at somebody else's round, because
// the only writer set `host: currentMode`. Days 2-5 had no way in.
//
// FOUR THINGS, all driven by typing and tapping. rcJoinLookup, rcJoinConfirm and
// renderRyderCupSetup are never named: the code is typed into the real field and
// the real buttons are pressed.
//
//   1. IT WORKS END TO END. Day 2 joins Day 1's Cup by code and the Cup appears on
//      Day 2's scorecard, expressed in Day 2's own player ids.
//   2. A BAD CODE WRITES NOTHING. A pointer aimed at a Cup that cannot load is a
//      poisoned round - every load afterwards resolves to an error the golfer
//      cannot clear from the screen it appears on. The database is read back and
//      must contain no ryderCupRef at all.
//   3. THE REFUSAL NAMES THE RIGHT ROUND. A duplicate on the JOINING round must
//      send the organizer here, not to the host. Being sent to a round where
//      nothing is wrong is worse than being told nothing.
//   4. A DANGLING SESSION IS REFUSED. It used to render the whole Cup as though
//      everything were fine.
//
// AND SCORING IS NEVER BLOCKED, in any of them. That is the one thing that must not
// change: a Cup that will not load is not a reason a golfer cannot post a score.
//
//   node tools/cup-join-check.js
//
//   exit 0   PASS
//   exit 1   FAIL - the JSON names the case
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });

const roundOf = (label, names, extra) => Object.assign({
    eventName: label, roundDay: label, courseName: 'Caledonia',
    activeCourseKey: 'cup-check', gameFormat: 'stroke', courseData: CD,
    players: names.map((n, i) => ({ id: 101 + i, name: n, hcp: '0' })),
    scores: (() => { const s = {}; names.forEach((_, i) =>
        CD.forEach(h => { s['p' + (101 + i) + '_h' + h.hole] = 4; })); return s; })()
}, extra || {});

const FOUR = ['Marty Sharp', 'Carp Dean', 'Lance Webb', 'Zach Hill'];
const CUP = { ryderCup: {
    name: 'Myrtle Cup', sides: { A: { name: 'Red' }, B: { name: 'Blue' } },
    members: { '101': 'A', '102': 'B', '103': 'A', '104': 'B' },
    sessions: { s1: { name: 'Day 1 Fourball', format: 'fourball', scoring: 'scratch' } },
    matches: { m1: { sessionId: 's1', playersA: ['101'], playersB: ['102'],
                     format: 'singles', scoring: 'scratch' } } } };

// EVERY WRITE THE PAGE MAKES, recorded. A check about "nothing was written" has to
// watch the writes, not infer them from the screen.
const RECORD_WRITES = `
(function () {
  window.__writes = {};
  window.__alerts = [];
  window.alert = function (m) { window.__alerts.push(String(m)); };
  var wrap = function (db) {
    var realRef = db.ref;
    db.ref = function (p) {
      var r = realRef.call(db, p);
      var set = r.set, upd = r.update, rem = r.remove;
      r.set = function (v) { window.__writes[p] = v; return set.apply(r, arguments); };
      r.update = function (v) { window.__writes[p] = v; return upd.apply(r, arguments); };
      r.remove = function () { window.__writes[p] = null; return rem.apply(r, arguments); };
      return r;
    };
  };
  var realDb = null;
  Object.defineProperty(window, '__wrapDb', { value: wrap });
  var t = setInterval(function () {
    try { if (typeof db !== 'undefined' && db && db.ref && !db.__wrapped) {
      db.__wrapped = true; wrap(db); clearInterval(t); } } catch (e) {}
  }, 30);
})();`;

// Type the code and press the two buttons a golfer presses.
const JOIN = (code, session) => `
(() => {
  const out = { alerts: [] };
  const mount = document.getElementById('ryder-cup-setup');
  out.cardText = mount ? (mount.innerText || '').replace(/\\s+/g, ' ').trim() : null;

  const btn = re => Array.from(document.querySelectorAll('button'))
      .filter(b => re.test(b.getAttribute('onclick') || ''))[0];

  const join = btn(/rcOpenJoin/);
  out.joinOffered = !!join;
  if (!join) return JSON.stringify(out);
  join.click();

  const field = document.getElementById('rc-join-code');
  out.fieldOnScreen = !!(field && field.getClientRects().length > 0);
  if (!field) { out.error = 'no code field after tapping Join'; return JSON.stringify(out); }
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(field, ${JSON.stringify(code)});
  field.dispatchEvent(new Event('input', { bubbles: true }));

  const find = btn(/rcJoinLookup/);
  out.findOffered = !!find;
  if (find) find.click();
  return JSON.stringify(out);
})()`;

// After the lookup has settled: pick the session and confirm.
const CONFIRM = session => `
(() => {
  const out = {};
  const mount = document.getElementById('ryder-cup-setup');
  out.panel = mount ? (mount.innerText || '').replace(/\\s+/g, ' ').trim() : null;
  const sel = document.getElementById('rc-join-session');
  out.sessionOffered = !!sel;
  if (sel && ${JSON.stringify(session)}) {
    const s = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    s.call(sel, ${JSON.stringify(session)});
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const go = Array.from(document.querySelectorAll('button'))
      .filter(b => /rcJoinConfirm/.test(b.getAttribute('onclick') || ''))[0];
  out.confirmOffered = !!go;
  if (go) go.click();
  return JSON.stringify(out);
})()`;

const AFTER = `
(() => JSON.stringify({
   writes: window.__writes || {},
   alerts: window.__alerts || [],
   panel: (document.getElementById('ryder-cup-setup') || {}).innerText || ''
}))()`;

// What the joining round's SCORECARD shows, and that scoring still works.
const SCORECARD = `
(() => {
  const t = el => el ? (el.innerText || '').replace(/\\s+/g, ' ').trim() : null;
  const card = document.querySelector('.rc-card');
  const inputs = Array.from(document.querySelectorAll('input.score-input'));
  return JSON.stringify({
    cup: t(card),
    scoreInputs: inputs.length,
    editable: inputs.filter(i => !i.disabled && !i.readOnly).length
  });
})()`;

function bail(msg) {
    console.error('cup-join-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

(async () => {
    const problems = [];
    const report = {};

    // ---- 1 & 2. the join flow, good code and bad -----------------------------
    const JOIN_CASES = [
        { name: 'a real Cup on another round', code: 'RA', session: 's1',
          db: { events: { RA: roundOf('Day 1', FOUR, CUP), RB: roundOf('Day 2', FOUR) } },
          expectPointer: { host: 'RA', sessionId: 's1' } },
        { name: 'a code that is not a round', code: 'NOPE', session: '',
          db: { events: { RA: roundOf('Day 1', FOUR, CUP), RB: roundOf('Day 2', FOUR) } },
          expectPointer: null, expectSays: /could not find|check it with/i },
        { name: 'a round with no Cup on it', code: 'RA', session: '',
          db: { events: { RA: roundOf('Day 1', FOUR), RB: roundOf('Day 2', FOUR) } },
          expectPointer: null, expectSays: /no Ryder Cup/i },
    ];

    for (const c of JOIN_CASES) {
        const r = await arriveCold({ url: fileUrl('sidematches.html', 'game=RB'), db: c.db,
            preScript: RECORD_WRITES, expression: JOIN(c.code, c.session), settleMs: 4200 });
        if (!r.ok) bail(c.name + ': ' + r.reason);
        const g = JSON.parse(r.value);
        if (g.error) bail(c.name + ': ' + g.error);
        if (!g.joinOffered) {
            problems.push(c.name + ': the Cup card offers no way to join an existing Cup');
            continue;
        }
        if (!g.fieldOnScreen) problems.push(c.name + ': the code field is not on screen');
        if (!g.findOffered) problems.push(c.name + ': there is no control to look the code up');

        // Second arrival, same fixture, driving the whole flow from a timer so the
        // lookup's promise has settled before the confirm.
        const drive = `(function(){
            ${RECORD_WRITES}
            setTimeout(function(){ ${JOIN(c.code, c.session)} }, 1500);
            setTimeout(function(){ ${CONFIRM(c.session)} }, 2600);
        })();`;
        const r2 = await arriveCold({ url: fileUrl('sidematches.html', 'game=RB'), db: c.db,
            preScript: drive, expression: AFTER, settleMs: 5000 });
        if (!r2.ok) bail(c.name + ' (drive): ' + r2.reason);
        const g2 = JSON.parse(r2.value);
        const pointer = (g2.writes || {})['events/RB/ryderCupRef'];
        report[c.name] = { pointer: pointer === undefined ? null : pointer,
                           panel: String(g2.panel || '').replace(/\s+/g, ' ').trim().slice(0, 220) };

        if (c.expectPointer) {
            if (!pointer) {
                problems.push(c.name + ': joining wrote no pointer at all');
            } else {
                if (pointer.host !== c.expectPointer.host) {
                    problems.push(c.name + ': wrote host ' + pointer.host);
                }
                if (pointer.sessionId !== c.expectPointer.sessionId) {
                    problems.push(c.name + ': wrote session ' + pointer.sessionId);
                }
            }
        } else {
            if (pointer) {
                problems.push(c.name + ': A POINTER WAS WRITTEN to a Cup that cannot '
                    + 'load - that round is poisoned: ' + JSON.stringify(pointer));
            }
            if (!c.expectSays.test(report[c.name].panel)) {
                problems.push(c.name + ': it refused without saying why: '
                    + report[c.name].panel);
            }
        }
    }

    // ---- the joined Cup actually appears on Day 2 ----------------------------
    const joined = { events: {
        RA: roundOf('Day 1', FOUR, CUP),
        RB: roundOf('Day 2', FOUR, { ryderCupRef: { host: 'RA', sessionId: 's1' } }) } };
    const s1 = await arriveCold({ url: fileUrl('index.html', 'game=RB'), db: joined,
        expression: SCORECARD, settleMs: 4200 });
    if (!s1.ok) bail('day 2 scorecard: ' + s1.reason);
    const g3 = JSON.parse(s1.value);
    report['day 2 scorecard'] = g3;
    if (g3.scoreInputs === 0) bail('day 2 rendered no scorecard at all - nothing measured');
    if (!g3.cup || !/MYRTLE CUP/i.test(g3.cup)) {
        problems.push('day 2 joined the Cup but does not show it: ' + g3.cup);
    }
    if (g3.editable === 0) problems.push('day 2 cannot enter a score');

    // ---- 3. the refusal names the round the duplicate is actually on ---------
    const dupLocal = { events: {
        RA: roundOf('Day 1', FOUR, CUP),
        RB: roundOf('Day 2', ['Marty Sharp', 'Marty Sharp', 'Lance Webb', 'Zach Hill'],
                    { ryderCupRef: { host: 'RA', sessionId: 's1' } }) } };
    const s2 = await arriveCold({ url: fileUrl('index.html', 'game=RB'), db: dupLocal,
        expression: SCORECARD, settleMs: 4200 });
    if (!s2.ok) bail('duplicate on the joining round: ' + s2.reason);
    const g4 = JSON.parse(s2.value);
    report['duplicate here'] = g4;
    if (g4.scoreInputs === 0) bail('the duplicate case rendered no scorecard - nothing measured');
    if (!/this round/i.test(g4.cup || '')) {
        problems.push('a duplicate on THIS round does not send the organizer here: ' + g4.cup);
    }
    if (/round RA/.test(g4.cup || '')) {
        problems.push('it sends the organizer to round RA, where nothing is wrong: ' + g4.cup);
    }
    if (g4.editable === 0) problems.push('a Cup that will not load blocked scoring');

    const dupHost = { events: {
        RA: roundOf('Day 1', ['Marty Sharp', 'Marty Sharp', 'Lance Webb', 'Zach Hill'], CUP),
        RB: roundOf('Day 2', FOUR, { ryderCupRef: { host: 'RA', sessionId: 's1' } }) } };
    const s3 = await arriveCold({ url: fileUrl('index.html', 'game=RB'), db: dupHost,
        expression: SCORECARD, settleMs: 4200 });
    if (!s3.ok) bail('duplicate on the host round: ' + s3.reason);
    const g5 = JSON.parse(s3.value);
    report['duplicate on host'] = g5;
    if (!/round RA/.test(g5.cup || '')) {
        problems.push('a duplicate on the HOST round does not name it: ' + g5.cup);
    }

    // ---- 4. a dangling session is refused ------------------------------------
    const dangling = { events: {
        RA: roundOf('Day 1', FOUR, CUP),
        RB: roundOf('Day 2', FOUR, { ryderCupRef: { host: 'RA', sessionId: 'GONE' } }) } };
    const s4 = await arriveCold({ url: fileUrl('index.html', 'game=RB'), db: dangling,
        expression: SCORECARD, settleMs: 4200 });
    if (!s4.ok) bail('dangling session: ' + s4.reason);
    const g6 = JSON.parse(s4.value);
    report['dangling session'] = g6;
    if (g6.scoreInputs === 0) bail('the dangling-session case rendered no scorecard');
    if (/Red 0 Blue 0|MYRTLE CUP\s+\d/i.test(g6.cup || '')) {
        problems.push('a Cup rendered while its session points at nothing: ' + g6.cup);
    }
    if (!/session/i.test(g6.cup || '')) {
        problems.push('a dangling session is not explained: ' + g6.cup);
    }
    if (g6.editable === 0) problems.push('a dangling session blocked scoring');

    report.problems = problems;
    report.verdict = problems.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
