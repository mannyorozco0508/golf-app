#!/usr/bin/env node
// ============================================================================
// E4 PHOTO WALL, IN A BROWSER - cold arrival, stubbed callables and Storage.
//
// A DEVICE CHECK MAY NOT CALL A FUNCTION THE PAGE DEFINES. Nothing here does:
// each arm navigates to the URL a golfer, organizer or visitor opens, then taps,
// types, or (choosing a file) sets input.files and fires `change` as the file
// picker does. firebase.functions() and the Storage fetch are stand-ins
// installed before any page script; live Storage is blocked (no request leaves
// this machine), so photo tiles show their placeholder colour.
//
//   node tools/tournament-photos-check.js           measure
//   node tools/tournament-photos-check.js --shots   also write E4a/E4b/E4c 390x844 @2x
//        screenshots to ~/Desktop/claude-mailbox-shared/tournaments/screens-event-tools/
//   exit 0 OK; 1 a divergence; 2 could not run.
//
// The EXIF proof is tournament_photo_exif_chrome_test.js; this tool measures
// the screens. WHAT IT CANNOT PROVE: real Storage, real callables, real rules.
// ============================================================================
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = path.join(os.homedir(), 'Desktop', 'claude-mailbox-shared', 'tournaments', 'screens-event-tools');
if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });
const shot = (name) => SHOTS ? [{ shot: path.join(SHOT_DIR, name), viewportOnly: true }] : [];

const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 5, 3, 4, 4, 3, 4, 5];
const K4 = '4'.repeat(32);
const teams = {};
const NAMES = { 4: ['Al Lopez', 'Jo Kim'], 9: ['Ana Ruiz', 'Kim Park'], 7: ['Dee Nguyen', 'Lee Park'], 12: ['Pat Reyes', 'Sam Ortiz'] };
for (let n = 1; n <= 18; n++) teams['team' + n] = { num: n, name: 'Team ' + n, players: NAMES[n] || ['Golfer ' + n], handicap: 0, startingHole: n };
const scores = {};
for (let h = 1; h <= 18; h++) { scores['team9_h' + h] = PARS[h - 1] - (h % 2); scores['team4_h' + h] = PARS[h - 1] - (h % 3 === 0 ? 1 : 0); scores['team7_h' + h] = PARS[h - 1]; }
const EVENT = { name: 'Rattle Classic', format: 'scramble', courseName: 'Papago', createdAt: 1, ownerUid: 'u-org', eventDate: '2026-11-21', startTime: '08:00',
    startType: 'shotgun', courseData: PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: i + 1 })), teams, scores,
    contests: { h7: { kind: 'kp', allowGps: true, winner: 'team7_p0', lockedAt: 9 }, h16: { kind: 'kp', allowGps: true, winner: 'team12_p1', lockedAt: 9 },
        h12: { kind: 'ld', fairwayOnly: true, allowGps: true, winner: 'team12_p0', lockedAt: 9 } } };
const CARD_EVENT = Object.assign({}, EVENT, { contests: null, scores: { team4_h4: 4, team4_h5: 3, team4_h6: 4 } });
const SHOWN = { '-S1': { team: 'team1', caption: 'Shotgun 8:00', at: 1, w: 1600, h: 1200 }, '-S2': { team: 'team7', at: 2, w: 1600, h: 1200 },
    '-S3': { team: 'team12', caption: 'Hole 12', at: 3, w: 1600, h: 1200 }, '-S4': { team: 'team3', caption: 'Awards', at: 4, w: 1600, h: 1200 } };
const SHOWN_LABELS = { '-S2': 'Team 7' };
const db = {
    tournaments: { PH1: EVENT, PHCARD: CARD_EVENT },
    contestEntries: { PH1: { h7: { team7_p0: { name: 'Dee Nguyen', team: 'team7', kind: 'kp', inches: 37, by: 'typed', at: 1 } },
        h16: { team12_p1: { name: 'Sam Ortiz', team: 'team12', kind: 'kp', inches: 144, by: 'gps', at: 2 } },
        h12: { team12_p0: { name: 'Pat Reyes', team: 'team12', kind: 'ld', yards: 301, by: 'gps', at: 3 } } } },
    tournamentPhotoMeta: { PH1: {
        pending: { '-Pa': { team: 'team4', caption: '7th tee', at: 1, w: 1600, h: 1200 }, '-Pb': { team: 'team9', caption: 'hole 12', at: 2, w: 1600, h: 1200 },
            '-Pc': { team: 'team12', caption: 'clubhouse', at: 3, w: 1200, h: 1600 } },
        shown: Object.assign({}, SHOWN, Object.fromEntries([...Array(10)].map((_, i) => ['-Sx' + i, { team: 'team' + (i + 2), at: 10 + i, w: 1, h: 1 }]))),
        hidden: { '-H1': { team: 'team2', at: 1, w: 1, h: 1 }, '-H2': { team: 'team5', at: 1, w: 1, h: 1 } }, reports: {} } },
    events: {}, trips: {}, global_courses: {}
};
const recapDb = JSON.parse(JSON.stringify(db)); recapDb.tournamentPhotoMeta.PH1.shown = SHOWN;
void SHOWN_LABELS;
const svg = (a, b) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/></svg>`);
const LINKS = { '-Pa': svg('#7aab68', '#2f6e4f'), '-Pb': svg('#f1d08f', '#c48a3a'), '-Pc': svg('#9fc3e3', '#3f6fa8') };

function fnStub(plan) {
    return `(function () {
      window.__fnCalls = [];
      var PLAN = ${JSON.stringify(plan)};
      window.firebase.functions = function () { return { httpsCallable: function (name) { return function (data) {
        window.__fnCalls.push({ name: name, data: data });
        return Promise.resolve({ data: JSON.parse(JSON.stringify(PLAN[name] || { ok: true })) }); }; } }; };
      var realAuth = window.firebase.auth;
      window.firebase.auth = function () { var a = realAuth.apply(this, arguments);
        if (a.currentUser && !a.currentUser.getIdToken) a.currentUser.getIdToken = function () { return Promise.resolve('test-token'); }; return a; };
      window.__uploads = [];
      var realFetch = window.fetch;
      window.fetch = function (url, opts) {
        if (String(url).indexOf('firebasestorage.googleapis.com') === -1) return realFetch.apply(this, arguments);
        window.__uploads.push({ url: String(url), size: opts && opts.body && opts.body.size });
        return Promise.resolve(new Response('{}', { status: 200 }));
      };
    })();`;
}
const BLOCK = ['*firebase-functions-compat.js', '*firebasestorage.googleapis.com*'];
const txt = (sel) => `((document.querySelector(${JSON.stringify(sel)}) || {}).innerText || '')`;
const VIS = `(sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }`;
const top = { expression: "window.scrollTo(0, 0); document.activeElement && document.activeElement.blur(); 'top'" };

async function run(name, opts) {
    const r = await arriveCold(Object.assign({ settleMs: 5000, blockUrls: BLOCK }, opts));
    if (!r.ok) return { name, ran: false, reason: r.reason };
    return { name, ran: true, values: (r.value || []).filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v)) };
}

(async () => {
    const out = {}; const failures = [];
    const check = (ok, msg) => { if (!ok) failures.push(msg); };
    const ownerAuth = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };

    // E4a: the golfer picks a photo (a 3000x2250 JPEG), types the caption.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-photo-shot-'));
    const jpg = path.join(dir, 'p.jpg');
    execFileSync('/usr/bin/sips', ['-s', 'format', 'jpeg', '-z', '2250', '3000', path.join(__dirname, '..', 'icon-1024.png'), '--out', jpg], { stdio: 'ignore' });
    const b64 = fs.readFileSync(jpg).toString('base64');
    fs.rmSync(dir, { recursive: true, force: true });
    const choose = `(() => { const bin = atob(${JSON.stringify(b64)}); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const dt = new DataTransfer(); dt.items.add(new File([u8], 'IMG_0412.JPG', { type: 'image/jpeg' }));
        const input = document.getElementById('photo-file'); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); return 'chosen'; })()`;
    const CARD_PROBE = `(() => { const vis = ${VIS}; return JSON.stringify({ tabs: Array.from(document.querySelectorAll('.top-nav-item')).filter(b => b.getBoundingClientRect().width > 0).map(b => b.innerText),
        panel: ${txt('#tab-photos')}, preview: vis('#photo-preview'), tag: vis('#photo-tag'), msg: ${txt('#photo-msg')}, uploads: window.__uploads.length }); })()`;
    const a = await run('E4a', { url: fileUrl('tournament-scorecard.html', `tourney=PHCARD&team=4&k=${K4}`), db, preScript: fnStub({}),
        steps: [{ tap: '#tab-btn-photos' }, { sleep: 200 }, { expression: choose }, { sleep: 2000 }, { tap: '#photo-caption' },
            { cdp: { method: 'Input.insertText', params: { text: 'Team 4 on the 7th tee 🔥' } } }, top, { expression: CARD_PROBE }, ...shot('E4a-photo-post.png'),
            { tap: '#photo-post' }, { sleep: 1500 }, { expression: CARD_PROBE }] });
    out.E4a = a.ran ? a.values : a;
    if (a.ran) { const [v0, v1] = a.values;
        check(JSON.stringify(v0.tabs) === JSON.stringify(['Scorecard', 'Board', 'Photos']), 'E4a: tabs: ' + JSON.stringify(v0.tabs));
        check(/Caption \(optional\)/.test(v0.panel) && /Post to the event wall/.test(v0.panel) && /The organizer approves photos before anyone sees them\./.test(v0.panel) && /Photos of other golfers: ask first\./.test(v0.panel), 'E4a: words: ' + v0.panel);
        check(v0.preview && v0.tag && /Your photo/.test(v0.panel), 'E4a: the chosen photo shows with "Your photo"');
        check(v1.uploads === 1 && /✓ Sent\./.test(v1.msg), 'E4a: posted: ' + JSON.stringify(v1)); }

    // E4b: the organizer's queue.
    const ORG_PROBE = `(() => { const vis = ${VIS}; return JSON.stringify({ tab: vis('#tab-btn-photos'), title: ${txt('#photo-queue-title')}, queue: ${txt('#photo-queue')},
        counts: ${txt('#photo-counts')}, imgs: document.querySelectorAll('#photo-queue img').length, calls: (window.__fnCalls || []).map(c => c.name + ' ' + JSON.stringify(c.data)) }); })()`;
    const b = await run('E4b', { url: fileUrl('tournament.html', 'tourney=PH1'), db, auth: ownerAuth, settleMs: 7000,
        preScript: fnStub({ photoLinks: { links: LINKS }, approvePhoto: { state: 'shown' }, hidePhoto: { state: 'hidden' } }),
        steps: [{ tap: '#tab-btn-photos' }, { sleep: 600 }, top, { expression: ORG_PROBE }, ...shot('E4b-organizer-photo-approve.png'),
            { tap: '#photo-queue button.show[data-photo="-Pb"]' }, { sleep: 400 }, { tap: '#photo-queue button.hide[data-photo="-Pc"]' }, { sleep: 400 }, { expression: ORG_PROBE }] });
    out.E4b = b.ran ? b.values : b;
    if (b.ran) { const [v0, v1] = b.values;
        check(v0.tab && v0.title === 'Photos waiting · 3', 'E4b: title: ' + v0.title);
        check(/Team 4 · 7th tee/.test(v0.queue) && /Team 9 · hole 12/.test(v0.queue) && /Team 12 · clubhouse/.test(v0.queue) && (v0.queue.match(/✓ Show/g) || []).length === 3, 'E4b: queue: ' + v0.queue);
        check(/On the wall: 14 · Hidden: 2/.test(v0.counts) && /every photo is checked/.test(v0.counts), 'E4b: counts: ' + v0.counts);
        check(v0.imgs === 3, 'E4b: three signed-link images drawn: ' + v0.imgs);
        check(JSON.stringify(v1.calls.slice(1)) === JSON.stringify(['approvePhoto {"code":"PH1","photoId":"-Pb"}', 'hidePhoto {"code":"PH1","photoId":"-Pc"}']), 'E4b: calls: ' + JSON.stringify(v1.calls)); }

    // E4c: the recap, as a signed-out visitor.
    const RECAP_PROBE = `(() => { const vis = ${VIS}; return JSON.stringify({ title: ${txt('#recap-title')}, sub: ${txt('#recap-sub')}, winners: ${txt('#recap-winners')},
        photos: ${txt('#recap-photos')}, share: vis('#recap-share'), manage: vis('#manage-screen'), setup: vis('#setup-screen') }); })()`;
    const c = await run('E4c', { url: fileUrl('tournament.html', 'tourney=PH1&recap=1'), db: recapDb, auth: 'signed-out', settleMs: 6000, preScript: fnStub({}),
        steps: [top, { expression: RECAP_PROBE }, ...shot('E4c-photo-recap.png')] });
    out.E4c = c.ran ? c.values[0] : c;
    if (c.ran) { const v = c.values[0];
        check(v.title === 'Rattle Classic recap' && v.sub === 'Sat Nov 21 · Papago · 18 teams', 'E4c: title/sub: ' + v.title + ' / ' + v.sub);
        check(/Winners\s+Team 9 · Ruiz \/ Park -9/.test(v.winners) && /KP 7 \/ 16\s+Dee Nguyen · Sam Ortiz/.test(v.winners) && /Long drive 12\s+Pat Reyes 301 yds/.test(v.winners), 'E4c: winners: ' + v.winners);
        check(/Team 1 · Shotgun 8:00/.test(v.photos) && /Team 7/.test(v.photos) && /Report/.test(v.photos), 'E4c: photos: ' + v.photos);
        check(v.share && !v.manage && !v.setup, 'E4c: share shown, no console'); }

    const notRun = Object.entries(out).filter(([, v]) => v && v.ran === false);
    if (notRun.length) { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', notRun }, null, 2)); process.exit(2); }
    console.log(JSON.stringify({ verdict: failures.length ? 'DIVERGENCE' : 'OK', failures, shots: SHOTS ? SHOT_DIR : null, out }, null, 2));
    process.exit(failures.length ? 1 : 0);
})();
