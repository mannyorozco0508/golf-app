#!/usr/bin/env node
// ============================================================================
// JOIN NEVER HANGS ON "Connecting to game..." (URGENT-002, 2026-10-17)
//
//   node tools/join-stuck-check.js
//
// Manny pasted ABCDEF-2-K7Q9X (no such round) into Join: the card said "Connecting to game..."
// for ever, and the app came back to it. Cold Chrome, the app's front door on.
//   A  Join, checked before it goes anywhere (a message on Home, nothing remembered):
//      the exact paste ABCDEF-2-K7Q9X; a fake code; a fake CODE-G-KEY; a real round with a wrong
//      key; a real round with a group it does not have (CODE-G-KEY and "CODE 7"); and the good
//      ones still open (CODE-G-KEY with the right key, "CODE 2", a pasted link, a bare code).
//   B  index.html?game=X for a round that does not exist: within ~8 s "Round X isn't
//      available" + Go Home (+ Try again), never "Connecting..." for ever; nothing remembered,
//      and a relaunch lands on Home, not back on it.
//   C  a slow first load: the round arrives after the sheet - the sheet goes, the round is
//      remembered then (never before).
// ============================================================================
'use strict';
const path = require('path');
const crypto = require('crypto');
const HERE = path.join(__dirname, '..');
const { openJourney, fileUrl } = require(path.join(HERE, 'tools/lib/journey.js'));
const { arriveCold } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
const { wizardSavedRound } = require(path.join(HERE, 'helpers/wizard-saved-round.js'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// PAID LAUNCH (2026-10-17): v2.0's GPS is the GPS Map subscription. This check tests GPS features
// (and the app around them) as a SUBSCRIBER: the App Store stubbed, entitlement active
// (tools/lib/iap-stub.js). The paywall itself: tools/gps-paywall-check.js.
const { iapStub } = require(path.join(HERE, 'tools/lib/iap-stub.js'));
const PRE = "window.__hardpanDoors = true; window.__e = []; addEventListener('error', function (e) { window.__e.push(String(e.message) + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno); });" + iapStub({ active: true });
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
function real(code) {
    const names = ['Ann Able', 'Ben Bravo', 'Cal Cole', 'Dee Dunn', 'Eli Echo', 'Fay Fox'];
    const r = wizardSavedRound({ code, golfers: 6, names, hcps: [1, 2, 3, 4, 5, 6], ownerUid: 'someone-else', thru: 0, flights: false,
        overrides: { additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club' } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    r.scoreKeys = { 1: sha('GOODK1'), 2: sha('GOODK2') };
    return r;
}
const DB = () => ({ events: { REAL01: real('REAL01') }, trips: {}, global_courses: {}, organizers: {}, tournaments: {} });
const ST = "JSON.stringify({ url: document.URL.split('/').pop(), msg: (document.getElementById('hp-code-msg') || {}).textContent || '', sheet: (function(){ var s = document.getElementById('hp-stuck-round'); return s && s.style.display !== 'none' ? s.innerText.replace(/\\s+/g, ' ').trim() : null; })(), connecting: /Connecting to game/.test(document.body ? document.body.innerText : ''), lr: localStorage.getItem('hardpan_last_round'), side: localStorage.getItem('hardpan_round_side'), e: window.__e || [] })";

(async () => {
    const fails = [], report = { join: {} };
    const f = (c, m) => { if (!c) fails.push(m); };
    const errs = (s, tag) => ((s && s.e) || []).filter((m) => !/reading 'ts'/.test(m)).forEach((m) => fails.push(tag + ' error: ' + m));

    // A: Join.
    const CASES = [
        ['ABCDEF-2-K7Q9X', 'stay', /^No round with the code ABCDEF\. /, 'Manny\'s exact paste'],
        ['ZZQQ77', 'stay', /^No round with the code ZZQQ77\. /, 'a fake code'],
        ['NOPE42-1-ABCDE', 'stay', /^No round with the code NOPE42\. /, 'a fake CODE-G-KEY'],
        ['REAL01-2-BADKEY', 'stay', /scorekeeper key isn.t right for Group 2 of REAL01/, 'a real round, a wrong key'],
        ['REAL01-5-GOODK2', 'stay', /^Round REAL01 has no Group 5 \(it has Groups 1.2\)\./, 'a real round, a group it does not have'],
        ['REAL01 7', 'stay', /^Round REAL01 has no Group 7/, '"CODE 7", no such group'],
        ['REAL01-2-GOODK2', /index\.html\?game=REAL01&group=2&sk=GOODK2$/, null, 'the right key'],
        ['REAL01 2', /index\.html\?game=REAL01&group=2$/, null, '"CODE 2"'],
        ['https://app.example/index.html?game=REAL01&group=1&sk=GOODK1', /index\.html\?game=REAL01&group=1&sk=GOODK1$/, null, 'a pasted link'],
        ['real01', /index\.html\?game=REAL01&spectate=1$/, null, 'a bare code (spectator)'],
    ];
    for (const [typed, want, msgRe, what] of CASES) {
        const j = await openJourney({ db: DB(), preScript: PRE });
        try {
            await j.goto(fileUrl('home.html', '') + '#games', 2500);
            await j.evaluate("(function(){ var i = document.getElementById('hp-code'); i.value = " + JSON.stringify(typed) + "; document.querySelector('[data-hp-act=\"join\"]').click(); return 1; })()");
            await sleep(2500);
            const s = JSON.parse(await j.evaluate(ST));
            report.join[typed] = want === 'stay' ? s.msg : s.url;
            if (want === 'stay') {
                f(/^home\.html/.test(s.url) && msgRe.test(s.msg) && !s.lr, 'A ' + what + ' (' + typed + '): ' + JSON.stringify([s.url, s.msg, s.lr]));
            } else {
                f(want.test(s.url), 'A ' + what + ' (' + typed + ') did not open the round: ' + s.url);
            }
            errs(s, 'A ' + typed);
        } finally { await j.close(); }
    }

    // B: a round that does not exist, opened straight (a link, Resume from an older build).
    {
        const j = await openJourney({ db: DB(), preScript: PRE });
        try {
            await j.goto(fileUrl('index.html', 'game=NOPE99&group=2&sk=K7Q9X'), 1500);
            const s1 = JSON.parse(await j.evaluate(ST));
            await sleep(8500);
            const s2 = JSON.parse(await j.evaluate(ST));
            report.missing = { early: [s1.connecting, s1.sheet, s1.lr], at10s: s2.sheet };
            f(!s1.lr, 'B: remembered as the last round before it loaded: ' + s1.lr);
            f(s2.sheet && /Round NOPE99 isn.t available/.test(s2.sheet) && /Go Home/.test(s2.sheet) && /Try again/.test(s2.sheet), 'B: no "isn\'t available" sheet within ~10 s: ' + JSON.stringify(s2));
            f(!s2.lr && !s2.side, 'B: the round was remembered: ' + JSON.stringify([s2.lr, s2.side]));
            await j.click('#hp-stuck-round [data-hp-home]', null, { settleMs: 2500 });
            const s3 = JSON.parse(await j.evaluate(ST));
            f(/^home\.html/.test(s3.url), 'B: Go Home did not go Home: ' + s3.url);
            // A relaunch: the app opens index.html with no round.
            await j.goto(fileUrl('index.html', ''), 4000);
            const s4 = JSON.parse(await j.evaluate(ST));
            report.missing.relaunch = s4.url;
            f(/^home\.html/.test(s4.url) && !s4.connecting, 'B: a relaunch did not land on Home: ' + JSON.stringify(s4));
            [s1, s2, s3, s4].forEach((s) => errs(s, 'B'));
        } finally { await j.close(); }
    }

    // C: a slow first load - the round arrives at 10 s.
    {
        const late = real('LATE01');
        const r = await arriveCold({ url: fileUrl('index.html', 'game=LATE01'), db: { events: {}, trips: {}, global_courses: {}, organizers: {}, tournaments: {} }, preScript: PRE, settleMs: 1000, viewport: { width: 390, height: 844 },
            steps: [{ sleep: 9000 }, { expression: ST }, { deliver: { path: 'events/LATE01', value: late } }, { sleep: 1500 }, { expression: ST }] });
        if (!r.ok) throw new Error(r.reason);
        const [c1, c2] = r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
        report.slow = [c1.sheet && c1.sheet.slice(0, 40), c2.sheet, !!c2.lr];
        f(c1.sheet && !c1.lr, 'C: before it arrived: no sheet, or remembered: ' + JSON.stringify(c1));
        f(!c2.sheet && c2.lr && JSON.parse(c2.lr).code === 'LATE01', 'C: after it arrived the sheet stayed or it was not remembered: ' + JSON.stringify(c2));
        [c1, c2].forEach((s) => errs(s, 'C'));
    }

    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
