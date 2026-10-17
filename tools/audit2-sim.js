#!/usr/bin/env node
// ============================================================================
// THE INDEPENDENT AUDIT'S FIXES, IN THE BROWSER (mailbox 002, 2026-10-16)
//
//   node tools/audit2-sim.js
//
// Cold Chrome, the app (window.__hardpanDoors), the stand-in database, test rounds only.
//   B6  a spectator who leaves and taps Resume comes back a spectator (spectate=1 kept).
//   B7  a group scorekeeper (group + key) comes back through the GPS door with both kept.
//   B8  Join takes the scorekeeper code CODE-G-KEY (15 characters), a pasted round link, "CODE 2".
//   10  a location TIMEOUT says "Couldn't get your location ... Tap to retry", not "turn on location";
//       Resume's "thru N" is in play order (off the 10th: thru 2 after 10..18, 1, 2); the GPS hole
//       picker lists 10..18, 1..9; a group's scorekeeper's name tag never shows another group.
// ============================================================================
'use strict';
const path = require('path');
const HERE = path.join(__dirname, '..');
const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
const { wizardSavedRound } = require(path.join(HERE, 'helpers/wizard-saved-round.js'));
const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});addEventListener('unhandledrejection',function(e){window.__e.push('rej '+String(e.reason&&e.reason.message||e.reason))});";
const APP = 'window.__hardpanDoors = true; window.__freshPhone = true;';
const DB = (ev) => ({ events: ev || {}, global_courses: {}, trips: {}, organizers: {}, tournaments: {} });
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const go = async (o) => { const r = await arriveCold(Object.assign({ settleMs: 3000, viewport: { width: 390, height: 844 } }, o)); if (!r.ok) throw new Error(r.reason); return r; };
function round(code, n, owner, extra) {
    const NAMES = ['Ann Able', 'Ben Bravo', 'Cal Cole', 'Dee Dunn', 'Eli Echo', 'Fay Fox'];
    const r = wizardSavedRound({ code, golfers: n, names: NAMES.slice(0, n), hcps: NAMES.slice(0, n).map((_, i) => i + 1), ownerUid: owner || 'someone-else', thru: 0, flights: false,
        overrides: Object.assign({ additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club' }, extra || {}) });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    return r;
}
const URL_NOW = { expression: "JSON.stringify({ url: document.URL.split('/').pop(), e: window.__e })" };
const fails = [], report = {};
const f = (c, m) => { if (!c) fails.push(m); };

(async () => {
    // B6: spectator -> Home -> Resume.
    let r = await go({ url: fileUrl('index.html', 'game=AUD2S1&spectate=1'), db: DB({ AUD2S1: round('AUD2S1', 2) }), preScript: APP + ERR, steps: [{ sleep: 2500 },
        { expression: "(function(){ location.href = 'home.html'; return 'home'; })()" }, { sleep: 3500 },
        { expression: "(function(){ var b = document.querySelector('#hp-resume [data-hp-open]'); if (!b) return 'no resume'; b.click(); return 'resume'; })()" }, { sleep: 2500 }, URL_NOW] });
    let x = J(r)[0];
    report.B6 = x.url;
    f(/spectate=1/.test(x.url), 'B6: a spectator came back without spectate=1: ' + x.url);

    // B7: a group scorekeeper -> Home -> the GPS door.
    r = await go({ url: fileUrl('index.html', 'game=AUD2K1&group=2&sk=KEY123'), db: DB({ AUD2K1: round('AUD2K1', 6) }), preScript: APP + ERR, steps: [{ sleep: 2500 },
        { expression: "(function(){ location.href = 'home.html'; return 'home'; })()" }, { sleep: 3500 },
        { expression: "(function(){ var b = document.querySelector('#v-main .hp-door.gps'); if (b) b.click(); return 'door'; })()" }, { sleep: 3000 }, URL_NOW] });
    x = J(r)[0];
    report.B7 = x.url;
    f(/group=2/.test(x.url) && /sk=KEY123/.test(x.url), 'B7: the scorekeeper lost their group / key: ' + x.url);

    // B8: Join. Three groups of two (URGENT-002: Join checks the group exists, so Groups 2 and 3
    // need a round that has them).
    for (const [typed, want] of [['AUD2J1-2-K7Q9XM', /game=AUD2J1&group=2&sk=K7Q9XM$/], ['https://app.example/index.html?game=AUD2J1&group=3&sk=ABCDEF', /game=AUD2J1&group=3&sk=ABCDEF$/], ['AUD2J1 2', /game=AUD2J1&group=2$/], ['aud2j1', /game=AUD2J1&spectate=1$/]]) {
        r = await go({ url: fileUrl('home.html', '') + '#games', db: DB({ AUD2J1: round('AUD2J1', 6, null, { groupSizeOverrides: { 0: 2, 1: 2 } }) }), preScript: APP + ERR, steps: [{ sleep: 1500 },
            { expression: "(function(){ var i = document.getElementById('hp-code'); i.value = " + JSON.stringify(typed) + "; return i.value.length + ''; })()" },
            { expression: "(function(){ document.querySelector('[data-hp-act=\"join\"]').click(); return 'join'; })()" }, { sleep: 2000 }, URL_NOW] });
        x = J(r)[0];
        f(want.test(x.url), 'B8: Join "' + typed + '" -> ' + x.url);
        (report.B8 = report.B8 || []).push(typed + ' -> ' + x.url);
    }

    // 10a: a location timeout (code 3).
    const TIMEOUT = "try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function () { return 1; }, getCurrentPosition: function (ok, no) { setTimeout(function () { no && no({ code: 3, message: 'Timeout expired' }); }, 10); }, clearWatch: function () {} } }); } catch (e) {}";
    r = await go({ url: fileUrl('home.html', '') + '#gps', db: DB({}), preScript: APP + ERR + TIMEOUT, steps: [{ sleep: 3000 }, { expression: "JSON.stringify({ near: (document.getElementById('hp-near-list')||{}).innerText || '' })" }] });
    x = J(r)[0];
    report.timeout = x.near;
    f(/Couldn.t get your location/.test(x.near) && /retry/i.test(x.near) && !/Turn on location/.test(x.near), '10: a location timeout: ' + JSON.stringify(x.near));

    // 10b: Resume's "thru" in play order, off the 10th: 10..18, 1, 2 scored -> thru 2.
    const t10 = round('AUD2T1', 1, 'anon-cold', { startingHole: 10 });
    const pid = t10.players[0].id; t10.scores = {};
    [10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2].forEach((h) => { t10.scores['p' + pid + '_h' + h] = 4; });
    r = await go({ url: fileUrl('home.html', ''), db: DB({ AUD2T1: t10 }), preScript: APP + ERR + "localStorage.setItem('hardpan_last_round', JSON.stringify({ code: 'AUD2T1', at: Date.now(), course: 'Caledonia' }));", steps: [{ sleep: 3500 },
        { expression: "JSON.stringify({ resume: (document.getElementById('hp-resume')||{}).innerText || '' })" }] });
    x = J(r)[0];
    report.thru = x.resume;
    f(/thru 2\b/.test(x.resume), '10: Resume "thru" not in play order: ' + JSON.stringify(x.resume));

    // 10c: the GPS hole picker in play order; 10d: a group-locked scorekeeper's tag.
    const g = round('AUD2G1', 6, 'someone-else', { startingHole: 10 });
    r = await go({ url: fileUrl('index.html', 'game=AUD2G1&group=2'), db: DB({ AUD2G1: g }), preScript: APP + ERR + "localStorage.setItem('hardpan_round_side', 'gps|AUD2G1'); localStorage.setItem('hardpan_gps_whoasked_AUD2G1', '1'); localStorage.setItem('hardpan_gps_golfer_AUD2G1', '" + g.players[0].id + "');", webgl: true, steps: [{ sleep: 2500 },
        { expression: "(function(){ var b = document.getElementById('fd-gps-btn'); if (HardPanGps.side() !== 'gps' && b) b.click(); return 'gps'; })()" }, { sleep: 2500 },
        { expression: "(function(){ var b = document.querySelector('#gps-overlay .gps-hole-btn'); if (b) b.click(); return b ? 'picker' : 'no picker button'; })()" }, { sleep: 600 },
        { expression: "JSON.stringify({ picker: Array.prototype.map.call(document.querySelectorAll('#gps-overlay .gps-picker-grid button'), function (b) { return b.textContent.trim(); }), tag: (document.querySelector('#gps-overlay .gps-who')||{}).innerText || '', e: window.__e })" }] });
    const pk = J(r)[0];
    report.picker = pk.picker.slice(0, 12).join(','); report.tag = pk.tag;
    if (pk.picker.length) f(pk.picker[0] === '10' && pk.picker[9] === '1', '10: the hole picker is not in play order: ' + report.picker);
    else fails.push('10: no hole picker found to check');
    f(/Group 2/.test(pk.tag) && !/Ann/.test(pk.tag), '10: a Group 2 scorekeeper\'s tag shows another group\'s golfer: ' + pk.tag);

    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
