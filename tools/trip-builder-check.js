#!/usr/bin/env node
// ============================================================================
// THE TRIP BUILDER, THE WAY A GOLFER USES IT (gps-builder)
//
//   node tools/trip-builder-check.js [<old tree> ...] [--text <file>]
//
// PHASE 1 (this tree, cold Chrome, a stand-in database): open trip.html, paste
// the text, tap "Read it", read the ONE review (questions, days, Confirm), tap
// Confirm, and capture the ONE update it writes. Nothing on the page is called.
//
// PHASE 2: the database those writes make is opened on this tree AND on each
// <old tree> (GPS beta build 12, the live web app): the trip page, every round's
// scorecard, Round Setup, Action (where the Cup lives) and settlement. Every
// page must load with 0 errors. This tree must show the Cup and the trip notes;
// an old tree just has to read normally.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const HERE = path.join(__dirname, '..');
const args = process.argv.slice(2);
const ti = args.indexOf('--text');
const textFile = ti >= 0 ? args[ti + 1] : path.join(__dirname, 'fixtures/myrtle-cup-test.txt');
const oldTrees = args.filter((a, i) => ti < 0 || (i !== ti && i !== ti + 1)).map((t) => path.resolve(t));
const TEXT = fs.readFileSync(textFile, 'utf8');

const ERRS = "window.__tbErr = []; addEventListener('error', function (e) { window.__tbErr.push(String(e.message || e)); }); addEventListener('unhandledrejection', function (e) { window.__tbErr.push('rejection: ' + String(e.reason && e.reason.message || e.reason)); });"
    // Every write also goes to localStorage, so it survives Confirm's navigation.
    + "(function () { var t = setInterval(function () { if (!window.__coldWrites) return; clearInterval(t); var p = window.__coldWrites.push; window.__coldWrites.push = function (w) { try { if (w && w.op === 'update' && w.path === '') localStorage.setItem('__tbWrite', JSON.stringify(w.value)); } catch (e) {} return p.apply(this, arguments); }; }, 0); })();";

async function phase1() {
    const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
    const r = await arriveCold({
        url: fileUrl('trip.html', ''), db: { trips: {}, events: {}, global_courses: {}, organizers: {}, tournaments: {} },
        settleMs: 2500, viewport: { width: 390, height: 844 }, preScript: ERRS,
        steps: [
            { tap: 'button[onclick="showCreateTripForm()"]' }, { sleep: 300 },
            { expression: "(function () { try { localStorage.removeItem('__tbWrite'); } catch (e) {} var b = document.getElementById('tb-box'); b.value = " + JSON.stringify(TEXT) + "; b.dispatchEvent(new Event('input', { bubbles: true })); return 'pasted'; })()" },
            { tap: '#tb-card button.btn-outline' }, { sleep: 800 },
            { expression: `JSON.stringify({ errs: window.__tbErr, review: (document.getElementById('tb-review') || {}).innerText || '',
                questions: document.querySelectorAll('#tb-review .tb-q').length, days: document.querySelectorAll('#tb-review .sp-day').length,
                confirm: !!document.getElementById('tb-confirm') && !document.getElementById('tb-confirm').disabled,
                selects: document.querySelectorAll('#tb-review select').length, money: document.querySelectorAll('#tb-review input[type=number]').length })` },
            // EDITS ON THE REVIEW, the way a golfer makes them: a Nassau amount, a name, an answer.
            { expression: "(function () { var set = function (el, v) { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }; if (process_edits()) {} return 'edited'; function process_edits() {"
                + " var m = document.querySelector('#tb-review input[data-tb=\\'days.0.groups.0.games.0.front\\']'); if (m) set(m, '7');"
                + " var r = Array.prototype.filter.call(document.querySelectorAll('#tb-review input[data-tb-rename]'), function (x) { return x.value === 'Joe'; })[0]; if (r) set(r, 'Joey');"
                + " var k = document.querySelector('#tb-review input[data-tb-q=\\'kp-2\\'][value=perhole]'); if (k) { k.checked = true; k.dispatchEvent(new Event('change', { bubbles: true })); }"
                + " return true; } })()" },
            { sleep: 400 },
            { tap: '#tb-confirm' }, { sleep: 4000 },
            { expression: "JSON.stringify({ url: document.URL, write: localStorage.getItem('__tbWrite'), errs: window.__tbErr })" }
        ]
    });
    if (!r.ok) throw new Error('phase 1 did not run: ' + r.reason);
    if (process.env.TB_DEBUG) console.log(JSON.stringify(r.value).slice(0, 3000));
    r.value = r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{');
    return { review: JSON.parse(r.value[0]), after: JSON.parse(r.value[r.value.length - 1]) };
}

function dbFrom(updates) {
    const db = { trips: {}, events: {}, global_courses: {}, organizers: {}, tournaments: {} };
    Object.keys(updates).forEach((k) => {
        const parts = k.split('/');
        let node = db;
        for (let i = 0; i < parts.length - 1; i++) { node[parts[i]] = node[parts[i]] || {}; node = node[parts[i]]; }
        node[parts[parts.length - 1]] = updates[k];
    });
    return db;
}

async function look(tree, page, query, db) {
    const { arriveCold, fileUrl } = require(path.join(tree, 'tools/lib/cold-arrival.js'));
    const r = await arriveCold({ url: fileUrl(page, query), db, settleMs: 4000, viewport: { width: 390, height: 844 },
        preScript: "window.__tbErr = []; addEventListener('error', function (e) { window.__tbErr.push(String(e.message || e)); }); addEventListener('unhandledrejection', function (e) { window.__tbErr.push('rejection: ' + String(e.reason && e.reason.message || e.reason)); });",
        steps: [{ expression: "JSON.stringify({ errs: window.__tbErr || [], text: document.body ? document.body.innerText : '' })" }] });
    if (!r.ok) return { fail: r.reason, errs: [], text: '' };
    return JSON.parse(r.value[0]);
}

(async () => {
    const fails = [], report = {};
    const p1 = await phase1();
    report.review = { questions: p1.review.questions, days: p1.review.days, confirm: p1.review.confirm, selects: p1.review.selects, money: p1.review.money, errs: p1.review.errs };
    if (p1.review.errs.length) fails.push('review: errors ' + p1.review.errs.join(' | '));
    if (!p1.review.confirm) fails.push('review: Confirm is not available');
    if (!p1.after.write) { fails.push('Confirm wrote nothing (url ' + p1.after.url + ', errors ' + (p1.after.errs || []).join(' | ') + ')'); console.log(JSON.stringify({ report, fails, review: p1.review.review.slice(0, 3000) }, null, 1)); process.exit(1); }
    const updates = JSON.parse(p1.after.write);
    if (/DAY 2/.test(TEXT)) {
        const evs = Object.keys(updates).filter((k) => /^events\/[^/]+$/.test(k)).map((k) => updates[k]);
        const d1 = evs.find((e) => /^Day 1/.test(e.eventName)), d2 = evs.find((e) => /^Day 2/.test(e.eventName));
        const firstNassau = Object.values(d1.sideMatches || {})[0] || {};
        report.edits = { nassauFront: firstNassau.frontStake, joey: d1.players.some((p) => p.name === 'Joey'), kpBuyIn: d2.moneyPool && d2.moneyPool.buyIn };
        if (firstNassau.frontStake !== 7) fails.push('edit not saved: Day 1 Group 1 Nassau front should be $7, is ' + firstNassau.frontStake);
        if (!report.edits.joey || evs.some((e) => e.players.some((p) => p.name === 'Joe'))) fails.push('rename Joe -> Joey not saved everywhere');
        const par3 = (d2.courseData || []).filter((h) => Number(h.par) === 3).length;
        report.edits.kp = d2.moneyPool && d2.moneyPool.kp;
        if (!d2.moneyPool || d2.moneyPool.kp.amount !== 5 * par3 || Math.abs(d2.moneyPool.buyIn - 5 * par3 / d2.players.length) > 1e-9 || d2.moneyPool.kp.holes.length !== par3)
            fails.push('KP answer "per par 3" not saved: ' + JSON.stringify(d2.moneyPool));
        const cupNames = JSON.stringify(evs.find((e) => e.ryderCup) || {});
        if (/"Joe"/.test(cupNames)) fails.push('the Cup still says Joe');
    }
    const db = dbFrom(updates);
    const trip = Object.keys(db.trips)[0];
    const rounds = Object.keys(db.trips[trip].rounds || {}).sort((a, b) => db.trips[trip].rounds[a].addedAt - db.trips[trip].rounds[b].addedAt);
    report.written = { trip, url: p1.after.url, rounds: rounds.map((c) => db.trips[trip].rounds[c].label + ' ' + c), keys: Object.keys(updates).length };
    if (!/trip\.html\?trip=/.test(p1.after.url)) fails.push('Confirm did not open the trip: ' + p1.after.url);
    if (process.env.TB_DUMP) fs.writeFileSync(process.env.TB_DUMP, JSON.stringify(db, null, 1));

    const pages = [['trip.html', 'trip=' + trip]];
    rounds.forEach((c) => pages.push(['index.html', 'game=' + c], ['admin.html', 'game=' + c]));
    pages.push(['sidematches.html', 'game=' + rounds[0]]); if (rounds[1]) pages.push(['sidematches.html', 'game=' + rounds[1]]); pages.push(['settlement.html', 'game=' + rounds[0]], ['leaderboard.html', 'game=' + rounds[0]]);
    for (const tree of [HERE].concat(oldTrees)) {
        const name = tree === HERE ? 'this build' : path.basename(tree);
        report[name] = {};
        for (const [page, q] of pages) {
            if (!fs.existsSync(path.join(tree, page))) continue;
            const r = await look(tree, page, q, db);
            const tag = name + ' ' + page + '?' + q;
            report[name][page + '?' + q] = { chars: r.text.length, errs: r.errs.length };
            if (r.fail) { fails.push(tag + ': did not load: ' + r.fail); continue; }
            if (r.errs.length) fails.push(tag + ': errors: ' + r.errs.join(' | '));
            if (r.text.length < 200) fails.push(tag + ': rendered almost nothing');
            if (/not found/i.test(r.text.slice(0, 400)) && page === 'trip.html') fails.push(tag + ': trip not found');
            if (page === 'trip.html' && rounds.some((c) => r.text.indexOf(db.trips[trip].rounds[c].label.replace(/^Day \d+ \u00b7 /, '')) === -1)) fails.push(tag + ': not every round is listed');
            if (tree === HERE && page === 'trip.html' && /first to 8/i.test(TEXT.replace(/\u00bd/g, '.5')) && !/first to 5½ wins the Cup/.test(r.text)) fails.push(tag + ': the Cup rules card is missing');
            if (tree === HERE && page === 'trip.html' && /Loser team/.test(TEXT) && !/Loser team buys dinner/.test(r.text)) fails.push(tag + ': the notes are missing');
            if (process.env.TB_SHOW === page) console.log('==== ' + tag + '\n' + r.text.slice(0, 2500));
        }
    }
    // PHASE 3: the running Cup across rounds. Day 1: USA wins match 1, match 2 halved;
    // Day 4 (singles): Manny beats Tom, the other three halved. 1 + 1/2 + 1 + 3 x 1/2 = 4 v 2.
    if (rounds.length >= 4) {
        const sc = (round, fn) => { const e = db.events[round]; e.scores = {}; (e.courseData || []).forEach((h) => e.players.forEach((p) => { e.scores['p' + p.id + '_h' + h.hole] = fn(p.id, h); })); };
        sc(rounds[0], (id) => ([105, 106].indexOf(id) !== -1 ? 5 : 4));
        sc(rounds[3], (id) => (id === 101 ? 3 : 4));
        const r = await look(HERE, 'trip.html', 'trip=' + trip, db);
        const line = (r.text.match(/Team USA [0-9\u00bd]+\s*v\s*[0-9\u00bd]+ Team EURO/) || [''])[0].replace(/\s+/g, ' ');
        report.cupAfterScores = line;
        if (line !== 'Team USA 4 v 2 Team EURO') fails.push('running Cup after Day 1 + Day 4 scores reads "' + line + '", expected Team USA 4 v 2 Team EURO');
        if (r.errs.length) fails.push('trip page with scores: errors ' + r.errs.join(' | '));
    }
    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
