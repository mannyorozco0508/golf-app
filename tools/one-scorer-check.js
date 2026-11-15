#!/usr/bin/env node
// ============================================================================
// ONE SCORER PER GROUP, A - THE CHROME HALF (ADVISOR-20261114-1527)
//
//   node tools/one-scorer-check.js [shotDir] [prefix]
//
// What tournament_one_scorer_test.js cannot prove in mini-dom (its <input>s
// are markup strings, it has no layout and no stylesheet), measured here in
// headless Chrome through tools/lib/cold-arrival.js: the URL a person opens,
// the page's own init and listener, REAL taps and typed keys. Nothing on the
// page is called by name; the expressions below only READ (innerText, the
// disabled flag, a rect) or read the stand-in's write log.
//
//   1 WATCH link, nothing tapped: the name list is on screen (innerText of
//     #sc-join), the holes list is not (0 rendered height).
//   2 tap "That's me" beside Kim Vo: the join write is { name, at } at
//     joins/team3/p2; every box in #holes-list is disabled (count > 0); the
//     line "Dana Ruiz is scoring for your group." is visible (innerText, rect
//     height > 0); typing into a box writes no score.
//   3 KEYED link: the boxes are enabled; typing 5 into one sends the keyed
//     update (score + proof) - the card still types.
//   4 the Desk (owner): the Scorers card row reads "Scorer Dana Ruiz · Joined
//     2 of 4" and Switch scorer opens the name list.
//   5 Setup: the start rows carry Watch QR; tapping it opens the share modal
//     titled "... Watch Link" with a link that has &watch=1 and no &k=.
//
// Exit 0 = every arm held; 1 = an arm failed (printed); 2 = the harness could
// not run. With a shotDir it writes phone (390) PNGs named <prefix>-*.png.
// ============================================================================
'use strict';
const path = require('path');
const TREE = process.env.SC_TREE || path.join(__dirname, '..');
const { arriveCold, fileUrl } = require(path.join(TREE, 'tools/lib/cold-arrival.js'));
const SHOTS = process.argv[2] || null;
const PREFIX = process.argv[3] || 'after';
const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const K3 = 'a1'.repeat(16);
const PHONE = { width: 390, height: 844 };
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: [4, 4, 3, 5, 4, 3, 5, 4, 4][i % 9], hcpIndex: i + 1 }));
const GROUPS = [['Ana Diaz', 'Joe Fox', 'Sam Ortiz', 'Mia Chen'], ['Tom Reyes', 'Eva Lin', 'Ben Cruz', 'Liz Moore'],
    ['Dana Ruiz', 'Lee Park', 'Kim Vo', 'Ray Diaz'], ['Matt Cole', 'Amy Shaw', 'Dan Ito', 'Pat Webb']];
function db() {
    const teams = {};
    GROUPS.forEach((p, i) => { teams['team' + (i + 1)] = { num: i + 1, name: 'Group ' + (i + 1), players: p.slice(), startingHole: String(1 + 2 * i), handicap: 0 }; });
    const t = { name: 'Starkey Classic', ownerUid: 'u-org', courseName: 'Papago Golf Course', format: 'bestball', courseData: COURSE,
        startType: 'shotgun', startTime: '08:00', eventDate: '2026-11-22', teams, createdAt: 1,
        scores: { team3_p0_h5: 4, team3_p1_h5: 3, team3_p2_h5: 5, team3_p3_h5: 4, team3_p0_h6: 3, team3_p1_h6: 3, team3_p2_h6: 2, team3_p3_h6: 3, team3_p0_h7: 5, team3_p1_h7: 6, team3_p2_h7: 5, team3_p3_h7: 4 },
        scorers: { team3: { name: 'Dana Ruiz', at: 1763132100000 } },
        joins: { team3: { p1: { name: 'Lee Park', at: 1763132280000 } } } };
    return { '.info': { connected: true }, tournaments: { STK: t }, registrations: { STK: {} },
        tournamentKeys: { STK: { on: true, t: { team1: 'b1'.repeat(16), team2: 'b2'.repeat(16), team3: K3, team4: 'b4'.repeat(16) } } } };
}
const shot = (name) => (SHOTS ? [{ shot: path.join(SHOTS, PREFIX + '-' + name + '.png'), viewportOnly: true }] : []);
const read = (expr) => ({ expression: expr });
const scrollTo = (sel) => read(`(function(){ var e = document.querySelector(${JSON.stringify(sel)}); if (e) { e.scrollIntoView({block:'start'}); window.scrollBy(0,-8); } return !!e; })()`);
const lastValue = (r) => (Array.isArray(r.value) ? r.value : []);

(async () => {
    const fails = [];
    const out = {};
    const card = (q) => fileUrl('tournament-scorecard.html', q);

    // 1 + 2: the watch link, then a tap
    const w = await arriveCold({ url: card('tourney=STK&team=3&watch=1'), db: db(), viewport: PHONE, settleMs: 2500, steps: [
        read(`JSON.stringify({ list: (document.getElementById('sc-join')||{}).innerText || '', holesH: Math.round(document.getElementById('holes-list').getBoundingClientRect().height) })`),
        read('window.scrollTo(0, 0) || true'), { sleep: 200 }, ...shot('watch-namelist-phone'),
        { tap: '#sc-join [data-slot="p2"]' }, { sleep: 500 },
        read(`JSON.stringify((function(){ var ins = document.querySelectorAll('#holes-list input'); var dis = 0; ins.forEach(function(i){ if (i.disabled) dis++; }); var t = document.getElementById('link-truth'); return { inputs: ins.length, disabled: dis, truth: t.innerText, truthH: Math.round(t.getBoundingClientRect().height), forLine: document.getElementById('scoring-for').innerText, gps: (document.getElementById('sc-gps')||{}).innerText || '', writes: window.__coldWrites }; })())`),
        read('window.scrollTo(0, 0) || true'), { sleep: 200 }, ...shot('viewer-card-phone'),
        { tap: '#holes-list input', nth: 8 }, { cdp: { method: 'Input.insertText', params: { text: '4' } } }, { tap: '#event-title' }, { sleep: 400 },
        read(`JSON.stringify(window.__coldWrites.filter(function(w){ return /scores|scoreProofs/.test(w.path) || (w.op === 'update' && Object.keys(w.value||{}).some(function(k){ return /scores/.test(k); })); }).length)`),
        scrollTo('#sc-gps'), { sleep: 200 }, ...shot('viewer-card-gps-phone')
    ] });
    if (!w.ok) { console.error('watch arm could not run:', w.reason); process.exit(2); }
    const wv = lastValue(w).filter((x) => typeof x === 'string' && /^[{\d]/.test(x)).map((x) => JSON.parse(x));
    const [w1, w2, w3] = [wv[0], wv[1], wv[2]];
    out.watch = { list: w1 && w1.list.slice(0, 120), holesH: w1 && w1.holesH, after: w2 && Object.assign({}, w2, { writes: (w2.writes || []).map((x) => x.op + ' ' + x.path + ' ' + JSON.stringify(x.value)) }), scoreWritesAfterTyping: w3 };
    if (!w1 || !/Tap your own name/.test(w1.list)) fails.push('1 the name list is not on screen');
    if (!w1 || w1.holesH !== 0) fails.push('1 the holes list shows before a name is tapped (' + (w1 && w1.holesH) + 'px)');
    if (!w2 || !(w2.inputs > 0 && w2.disabled === w2.inputs)) fails.push('2 viewer boxes: ' + (w2 && w2.disabled) + ' of ' + (w2 && w2.inputs) + ' disabled');
    if (!w2 || w2.truth !== 'Dana Ruiz is scoring for your group.' || !(w2.truthH > 0)) fails.push('2 the scorer sentence is not visible: ' + JSON.stringify(w2 && [w2.truth, w2.truthH]));
    const jw = w2 && (w2.writes || []).filter((x) => /joins/.test(x.path));
    if (!jw || jw.length !== 1 || jw[0].path !== 'tournaments/STK/joins/team3/p2' || JSON.stringify(Object.keys(jw[0].value).sort()) !== '["at","name"]' || jw[0].value.name !== 'Kim Vo') fails.push('2 the join write: ' + JSON.stringify(jw));
    if (w3 !== 0) fails.push('2 typing on the viewer card wrote ' + w3 + ' score(s)');
    if (!w2 || !/Open in HardPan/.test(w2.gps) || /free/i.test(w2.gps)) fails.push('2 the GPS door: ' + JSON.stringify(w2 && w2.gps));

    // 3: the keyed card still types
    const k = await arriveCold({ url: card('tourney=STK&team=3&k=' + K3), db: db(), viewport: PHONE, settleMs: 2500, steps: [
        read(`JSON.stringify((function(){ var ins = document.querySelectorAll('#holes-list input'); var en = 0; ins.forEach(function(i){ if (!i.disabled) en++; }); return { inputs: ins.length, enabled: en, forLine: document.getElementById('scoring-for').innerText, truth: document.getElementById('link-truth').innerText, join: (document.getElementById('sc-join')||{}).innerText || '' }; })())`),
        read('window.scrollTo(0, 0) || true'), { sleep: 200 }, ...shot('keyed-card-phone'),
        { tap: '#holes-list input', nth: 12 }, { cdp: { method: 'Input.insertText', params: { text: '5' } } }, { tap: '#event-title' }, { sleep: 500 },
        read(`JSON.stringify(window.__coldWrites.filter(function(w){ return w.op === 'update'; }).map(function(w){ return Object.keys(w.value).sort(); }))`)
    ] });
    if (!k.ok) { console.error('keyed arm could not run:', k.reason); process.exit(2); }
    const kv = lastValue(k).filter((x) => typeof x === 'string' && /^[{[]/.test(x)).map((x) => JSON.parse(x));
    out.keyed = { before: kv[0], updates: kv[1] };
    if (!kv[0] || !(kv[0].inputs > 0 && kv[0].enabled === kv[0].inputs)) fails.push('3 keyed boxes: ' + JSON.stringify(kv[0]));
    if (!kv[0] || kv[0].forLine !== 'You’re scoring for Group 3 · Lee is watching' && kv[0].forLine !== 'You\'re scoring for Group 3 · Lee is watching') fails.push('3 the scorer line: ' + JSON.stringify(kv[0] && kv[0].forLine));
    if (!kv[1] || kv[1].length !== 1 || !kv[1][0].some((p) => /^scoreProofs\/STK\/team3_p\d_h\d+$/.test(p)) || !kv[1][0].some((p) => /^tournaments\/STK\/scores\/team3_p\d_h\d+$/.test(p))) fails.push('3 the keyed card did not send its keyed update: ' + JSON.stringify(kv[1]));

    // 4: the Desk
    const d = await arriveCold({ url: fileUrl('tournament.html', 'tourney=STK'), db: db(), auth: OWNER, viewport: PHONE, settleMs: 2500, steps: [
        { tap: '#tab-btn-desk' }, { sleep: 600 }, scrollTo('#scorer-desk'), { sleep: 200 },
        read(`JSON.stringify({ desk: (document.getElementById('scorer-desk')||{}).innerText || '' })`),
        ...shot('desk-scorers-phone'),
        { tap: '#scorer-desk .scd-row[data-entry="team3"] .scd-switch' }, { sleep: 300 },
        read(`JSON.stringify({ pick: (document.querySelector('#scorer-desk .scd-pick')||{}).innerText || '' })`),
        ...shot('desk-switch-phone')
    ] });
    if (!d.ok) { console.error('desk arm could not run:', d.reason); process.exit(2); }
    const dv = lastValue(d).filter((x) => typeof x === 'string' && /^{/.test(x)).map((x) => JSON.parse(x));
    out.desk = dv;
    if (!dv[0] || !/Group 3\s*Scorer Dana Ruiz · Joined 2 of 4\s*Switch scorer\s*Watch QR/.test(dv[0].desk)) fails.push('4 the Desk row: ' + JSON.stringify(dv[0] && dv[0].desk.slice(0, 400)));
    if (!dv[1] || !/Who is scoring Group 3 now\?\s*Dana Ruiz\s*Lee Park\s*Kim Vo\s*Ray Diaz\s*Cancel/.test(dv[1].pick)) fails.push('4 Switch scorer list: ' + JSON.stringify(dv[1]));

    // 5: Setup's links, the Watch QR
    const s = await arriveCold({ url: fileUrl('tournament.html', 'tourney=STK'), db: db(), auth: OWNER, viewport: PHONE, settleMs: 2500, steps: [
        { tap: '#tab-btn-setup' }, { sleep: 500 }, scrollTo('#start-links-list'), { sleep: 200 },
        read(`JSON.stringify({ rows: (document.getElementById('start-links-list')||{}).innerText || '' })`),
        ...shot('setup-links-phone'),
        { tap: '#start-links-list .sl-row[data-team="3"] .sl-watch' }, { sleep: 500 },
        read(`JSON.stringify({ title: document.getElementById('share-modal-title').innerText, link: document.getElementById('share-link-text').innerText, qr: !!document.querySelector('#share-qr-box canvas, #share-qr-box img') })`),
        ...shot('setup-watch-qr-phone')
    ] });
    if (!s.ok) { console.error('setup arm could not run:', s.reason); process.exit(2); }
    const sv = lastValue(s).filter((x) => typeof x === 'string' && /^{/.test(x)).map((x) => JSON.parse(x));
    out.setup = sv;
    if (!sv[0] || (sv[0].rows.match(/Watch QR/g) || []).length !== 4) fails.push('5 Watch QR on the Setup rows: ' + JSON.stringify(sv[0]));
    if (!sv[1] || sv[1].title !== 'Group 3 — Watch Link' || !/[?&]team=3&watch=1$/.test(sv[1].link) || /[?&]k=/.test(sv[1].link) || !sv[1].qr) fails.push('5 the Watch QR modal: ' + JSON.stringify(sv[1]));

    console.log(JSON.stringify(out, null, 1));
    if (fails.length) { console.log('FAIL\n- ' + fails.join('\n- ')); process.exit(1); }
    console.log('PASS: 5 arms');
})().catch((e) => { console.error(e); process.exit(2); });
