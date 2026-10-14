#!/usr/bin/env node
// ============================================================================
// SHARE + GAME CODE + SPECTATORS + SCOREKEEPER CODES (gps-share, 2026-10-13)
//
//   node tools/share-check.js [<old tree> ...]
//
// Cold Chrome, the app (window.__hardpanDoors), a 4-golfer round (one group - the
// case where a bare link used to be able to type scores).
//   1  Games › Have a game code? › the code -> the round as a SPECTATOR (spectate=1).
//   2  A spectator: no score boxes to type in, a "Spectating" badge, no setup / delete /
//      Add a game; GPS for the course still opens.
//   3  The round's organizer opening it the same way keeps their access.
//   4  The organizer's Round Menu: "Share" (not "Show QR code") -> the game code big +
//      copyable, Spectator QR + link (view-only leaderboard), Scorekeeper: Group 1 ->
//      "Make a scorekeeper code" -> ONE write, events/<code>/scoreKeys/1 = a SHA-256 (never
//      the code), the code "CODE-1-KEY", its link and QR; Revoke makes a new one.
//   5  The scorekeeper link / typed code with the right key: that group's boxes; a wrong or
//      revoked key: view-only + "scorekeeper code not valid".
//   6  Every <old tree> (build 12, the web app) opens the round carrying scoreKeys: 0 errors.
// ============================================================================
'use strict';
const path = require('path');
const crypto = require('crypto');
const HERE = path.join(__dirname, '..');
const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
const { wizardSavedRound } = require(path.join(HERE, 'helpers/wizard-saved-round.js'));
const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});addEventListener('unhandledrejection',function(e){window.__e.push('rej '+String(e.reason&&e.reason.message||e.reason))});";
const APP = 'window.__hardpanDoors = true; window.__freshPhone = true;';
const DB = (ev) => ({ events: ev || {}, global_courses: {}, trips: {}, organizers: {}, tournaments: {} });
function round(owner, extra) {
    const r = wizardSavedRound({ code: 'SHRND1', golfers: 4, names: ['Manny Orozco', 'Joe Russo', 'Mike Dunn', 'Dave Kirk'], hcps: [9, 9, 9, 9], ownerUid: owner, thru: 0, flights: false,
        overrides: { additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club' } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    return Object.assign(r, extra || {});
}
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const go = async (o) => { const r = await arriveCold(Object.assign({ settleMs: 4500, viewport: { width: 390, height: 844 } }, o)); if (!r.ok) throw new Error(r.reason); return r; };
const CARD = "JSON.stringify({ url: document.URL.split('/').pop(), enabled: Array.prototype.filter.call(document.querySelectorAll('.score-input'), function (i) { return !i.disabled && i.offsetParent !== null; }).length, inputs: document.querySelectorAll('.score-input').length, badge: (document.getElementById('hp-spec-badge')||{}).textContent || null, setup: !!(document.getElementById('setup-entry-mount') && document.getElementById('setup-entry-mount').innerText.trim() && getComputedStyle(document.getElementById('setup-entry-mount')).display !== 'none'), addGame: (function(){ try { HardPanDoors.openAddGame(); var s = document.getElementById('fd-addgame'); return !!(s && s.style.display !== 'none'); } catch (e) { return 'err ' + e.message; } })(), gpsBtn: !!document.getElementById('fd-gps-btn'), share: (document.querySelector('#qr-share-mount')||{}).innerText || '', key: typeof window.hpKeyState === 'function' ? window.hpKeyState() : null, writes: (window.__coldWrites||[]).map(function(w){ return w.op + ' ' + w.path; }), e: window.__e })";
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

(async () => {
    const fails = [], report = {};
    const f = (c, m) => { if (!c) fails.push(m); };

    // 1: the game code in the app -> spectator.
    let r = await go({ url: fileUrl('home.html', '') + '#games', db: DB({ SHRND1: round('someone-else') }), preScript: APP + ERR, steps: [{ sleep: 1500 },
        { expression: "(function(){ var i = document.getElementById('hp-code'); i.value = 'shrnd1'; document.querySelector('[data-hp-act=\"join\"]').click(); return 'join'; })()" }, { sleep: 1500 },
        { expression: "JSON.stringify({ url: document.URL.split('/').pop() })" }] });
    const j1 = J(r)[0];
    f(j1.url === 'index.html?game=SHRND1&spectate=1', '1: the game code did not open the round as a spectator: ' + j1.url);
    r = await go({ url: fileUrl('home.html', '') + '#games', db: DB({ SHRND1: round('someone-else') }), preScript: APP + ERR, steps: [{ sleep: 1500 },
        { expression: "(function(){ var i = document.getElementById('hp-code'); i.value = 'SHRND1-2-k7q9xm'; document.querySelector('[data-hp-act=\"join\"]').click(); return 'join'; })()" }, { sleep: 1500 },
        { expression: "JSON.stringify({ url: document.URL.split('/').pop() })" }] });
    const j2 = J(r)[0];
    f(j2.url === 'index.html?game=SHRND1&group=2&sk=K7Q9XM', '5: a typed scorekeeper code did not open its group: ' + j2.url);
    report.join = [j1.url, j2.url];

    // 2: a spectator (not the organizer), one-group round.
    r = await go({ url: fileUrl('index.html', 'game=SHRND1&spectate=1'), db: DB({ SHRND1: round('someone-else') }), preScript: APP + ERR, steps: [{ sleep: 2000 }, { expression: CARD },
        { tap: '#fd-gps-btn' }, { sleep: 2500 }, { expression: "JSON.stringify({ side: window.HardPanGps && HardPanGps.side && HardPanGps.side(), score: (function(){ var b = document.querySelector('#gps-overlay .gps-score'); return b ? getComputedStyle(b).display : null; })(), add: (function(){ var b = document.querySelector('#gps-overlay .gps-door-add'); return b ? getComputedStyle(b).display : null; })() })" }], webgl: true });
    const [s2, s2g] = J(r);
    report.spectator = { card: s2, gps: s2g };
    f(s2.enabled === 0 && s2.inputs > 0, '2: a spectator has score boxes to type in: ' + JSON.stringify(s2));
    f(/Spectating/.test(s2.badge || ''), '2: no "Spectating" badge: ' + JSON.stringify(s2.badge));
    f(!s2.setup && s2.addGame === false, '2: a spectator sees setup or Add a game: ' + JSON.stringify([s2.setup, s2.addGame]));
    f(s2g.side === 'gps' && s2g.score === 'none' && s2g.add === 'none', '2: a spectator\'s GPS (open, with no Enter Score / + Game): ' + JSON.stringify(s2g));
    f(!s2.e.length, '2: errors ' + s2.e.join(' | '));
    // The same round, opened plainly (no spectate): as before - one group, the card is writable.
    r = await go({ url: fileUrl('index.html', 'game=SHRND1'), db: DB({ SHRND1: round('someone-else') }), preScript: APP + ERR, steps: [{ sleep: 2000 }, { expression: CARD }] });
    const s2b = J(r)[0];
    f(s2b.enabled > 0 && !s2b.badge, '2: the plain link changed (it must stay as it was): ' + JSON.stringify(s2b));

    // 3 + 4: the organizer (owner) - spectate=1 keeps access; Share; a scorekeeper code.
    r = await go({ url: fileUrl('index.html', 'game=SHRND1&spectate=1'), db: DB({ SHRND1: round('anon-cold') }), preScript: APP + ERR, steps: [{ sleep: 2000 }, { expression: CARD },
        { expression: "(function(){ var b = document.querySelector('#qr-share-mount [data-hp-share-open]'); if (!b) return 'no share'; b.click(); return 'open'; })()" }, { sleep: 600 },
        { expression: "JSON.stringify({ text: document.getElementById('fd-share').innerText, qrs: document.querySelectorAll('#fd-share svg').length, links: Array.prototype.map.call(document.querySelectorAll('#fd-share [data-url]'), function(b){ return b.getAttribute('data-url').split('/').pop(); }) })" },
        { expression: "(function(){ document.querySelector('#fd-share [data-sh-group=\"1\"]').click(); return 'g1'; })()" }, { sleep: 300 },
        { expression: "(function(){ document.querySelector('#fd-share [data-sh=\"newkey\"]').click(); return 'make'; })()" }, { sleep: 1200 },
        { expression: "JSON.stringify({ text: document.getElementById('fd-share').innerText, qrs: document.querySelectorAll('#fd-share svg').length, links: Array.prototype.map.call(document.querySelectorAll('#fd-share [data-url]'), function(b){ return b.getAttribute('data-url').split('/').pop(); }), writes: (window.__coldWrites||[]).filter(function(w){ return /scoreKeys/.test(w.path); }) })" }] });
    const [o0, o1, o2] = J(r);
    report.organizer = { card: { enabled: o0.enabled, badge: o0.badge, share: o0.share }, sheet: o1.text.slice(0, 400), links: o1.links, made: o2.text.slice(-400), keyWrites: o2.writes.map((w) => w.path + '=' + String(w.value).slice(0, 12) + '…') };
    f(o0.enabled > 0 && !o0.badge, '3: the organizer opening by code lost their access: ' + JSON.stringify(o0));
    f(/Share/.test(o0.share) && !/Show QR code/.test(o0.share), '4: the Round Menu has no "Share" (or still "Show QR code"): ' + o0.share);
    f(/GAME CODE\s*SHRND1/.test(o1.text) && /Have the HardPan app\? Games › Have a game code\? › type this\. You get the round \+ GPS for this course\./.test(o1.text) && /Spectator/.test(o1.text) && /Scorekeeper/.test(o1.text) && o1.qrs >= 1 && o1.links.indexOf('leaderboard.html?game=SHRND1') !== -1, '4: the Share sheet: ' + JSON.stringify(o1));
    const kw = o2.writes[0];
    const typed = (/SHRND1-1-([A-Z0-9]{6})/.exec(o2.text) || [])[1];
    f(o2.writes.length === 1 && kw.path === 'events/SHRND1/scoreKeys/1' && /^[0-9a-f]{64}$/.test(String(kw.value)) && typed && sha(typed) === kw.value, '4: the scorekeeper code is not stored as its hash only: ' + JSON.stringify([o2.writes, typed]));
    f(o2.qrs >= 2 && o2.links.some((u) => u === 'index.html?game=SHRND1&group=1&sk=' + typed) && /Revoke · new code/.test(o2.text), '4: the scorekeeper QR / link / Revoke: ' + JSON.stringify([o2.qrs, o2.links]));
    f(!o2.e || !o2.e.length, '4: errors');

    // 5: the scorekeeper link: right key -> group 1's boxes; wrong / revoked -> view-only.
    const KEY = 'K7Q9XM', keyed = round('someone-else', { scoreKeys: { 1: sha(KEY) } });
    r = await go({ url: fileUrl('index.html', 'game=SHRND1&group=1&sk=' + KEY), db: DB({ SHRND1: keyed }), preScript: APP + ERR, steps: [{ sleep: 2500 }, { expression: CARD }] });
    const k1 = J(r)[0];
    f(k1.key === 'ok' && k1.enabled > 0 && !k1.badge, '5: the right scorekeeper code did not open group 1\'s boxes: ' + JSON.stringify(k1));
    r = await go({ url: fileUrl('index.html', 'game=SHRND1&group=1&sk=WRONG1'), db: DB({ SHRND1: keyed }), preScript: APP + ERR, steps: [{ sleep: 2500 }, { expression: CARD }] });
    const k2 = J(r)[0];
    f(k2.key === 'bad' && k2.enabled === 0 && /scorekeeper code not valid/.test(k2.badge || ''), '5: a wrong / revoked code still writes: ' + JSON.stringify(k2));
    r = await go({ url: fileUrl('index.html', 'game=SHRND1&group=1'), db: DB({ SHRND1: round('someone-else') }), preScript: APP + ERR, steps: [{ sleep: 2500 }, { expression: CARD }] });
    const k3 = J(r)[0];
    f(k3.key === 'none' && k3.enabled > 0, '5: a group with NO code must work as before (?group=1): ' + JSON.stringify(k3));
    report.keys = [k1.key + ':' + k1.enabled, k2.key + ':' + k2.enabled + ':' + k2.badge, k3.key + ':' + k3.enabled];

    // 6: older apps open a round carrying scoreKeys, with the new links.
    for (const tree of process.argv.slice(2).map((t) => path.resolve(t))) {
        const old = require(path.join(tree, 'tools/lib/cold-arrival.js'));
        for (const [page, q] of [['index.html', 'game=SHRND1&spectate=1'], ['index.html', 'game=SHRND1&group=1&sk=' + KEY], ['leaderboard.html', 'game=SHRND1'], ['settlement.html', 'game=SHRND1']]) {
            const o = await old.arriveCold({ url: old.fileUrl(page, q), db: DB({ SHRND1: keyed }), settleMs: 4000, viewport: { width: 390, height: 844 }, preScript: ERR, steps: [{ expression: "JSON.stringify({ e: window.__e, n: document.body.innerText.length })" }] });
            const x = o.ok ? JSON.parse(o.value[0]) : { e: ['did not load: ' + o.reason], n: 0 };
            report[path.basename(tree) + ' ' + page + '?' + q] = x;
            if (x.e.length) fails.push('6: ' + path.basename(tree) + ' ' + page + ': ' + x.e.join(' | '));
            if (x.n < 200) fails.push('6: ' + path.basename(tree) + ' ' + page + ': rendered almost nothing');
        }
    }
    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
