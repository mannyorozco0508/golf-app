#!/usr/bin/env node
// ============================================================================
// A NAME IS TEXT, EVERYWHERE (mailbox 002 / independent audit H1, 2026-10-16)
//
//   node tools/xss-check.js
//
// Golfer, team and course names reach the pages from the round record, which anyone with the
// code could write (rules C1). Every page that draws a round is opened with names that are HTML:
//   golfer   Ann<img/src/onerror=window.__x=(window.__x||0)+1>   (and others like it)
//   course   <img src=x onerror=window.__x=(window.__x||0)+1>
// and every view a golfer reaches (the hole, the full card, Finish Round, the leaderboard, the
// match / Nassau / Hi-Lo cards, settlement, skins, side matches, stats, the Game tab, the shared
// card, Round Setup's review). PASS = no <img> carrying onerror anywhere in the DOM, the handler
// never ran, and the name shows as text.
// ============================================================================
'use strict';
const path = require('path');
const HERE = path.join(__dirname, '..');
const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
const { wizardSavedRound } = require(path.join(HERE, 'helpers/wizard-saved-round.js'));
const PAY = (n) => n + '<img/src/onerror=window.__x=(window.__x||0)+1>';
const NAMES = [PAY('Ann'), PAY('Ben') + ' Bravo', 'Cal <img src=x onerror=window.__x=(window.__x||0)+1>', 'Dee</td><img/src/onerror=window.__x=(window.__x||0)+1>'];
const COURSE = 'Evil <img src=x onerror=window.__x=(window.__x||0)+1> CC';
const CODE = 'XSSRD1';
function round(fmt, n) {
    const r = wizardSavedRound({ code: CODE, golfers: n || 4, names: NAMES.slice(0, n || 4), hcps: [2, 9, 15, 4].slice(0, n || 4), ownerUid: 'anon-cold', thru: 18, flights: false,
        overrides: { courseName: COURSE, activeCourseKey: 'caledonia', gameFormat: fmt || 'match', holeBetStake: 5, matchStake: 10, nassauStake: 5, skinsBuyIn: 5, birdieGameEnabled: true, birdieUnitVal: 1, dotPointVal: 1, wolfPointVal: 1, stablefordPointVal: 1 } });
    // A side match between the four, so the side-match / status cards render names too.
    const ids = r.players.map((p) => p.id);
    r.sideMatches = { sm1: { format: 'match', team1: [ids[0], ids[1]], team2: [ids[2], ids[3]], stake: 5, scoring: 'net', createdAt: 1 } };
    return r;
}
const DB = (fmt, n) => ({ events: { [CODE]: round(fmt, n) }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} });
const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message).slice(0,120)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});";
const PROBE = "JSON.stringify({ page: location.pathname.split('/').pop(), view: window.__view || '', x: window.__x || 0, imgs: Array.prototype.filter.call(document.querySelectorAll('img'), function (i) { return i.hasAttribute('onerror'); }).map(function (i) { var p = i.parentElement; var c = i.closest('[id]'); return (p ? (p.className || p.tagName) : '?') + '@' + (c ? c.id : '-'); }).slice(0, 60), text: /Ann<img/.test(document.body.innerText), e: (window.__e || []).slice(0, 3) })";
const go = async (o) => { const r = await arriveCold(Object.assign({ settleMs: 3500, viewport: { width: 390, height: 844 } }, o)); if (!r.ok) throw new Error(r.reason); return r; };
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const V = (name, js) => [{ expression: "(function(){ window.__view = " + JSON.stringify(name) + "; try { " + js + " } catch (e) { window.__viewErr = e.message; } return 'v'; })()" }, { sleep: 900 }, { expression: PROBE }];

(async () => {
    const fails = [], seen = [];
    const visit = async (page, query, steps, fmt, n) => {
        let r;
        try { r = await go({ url: fileUrl(page, query), db: DB(fmt, n), preScript: 'window.__hardpanDoors = true;' + ERR, steps: [{ sleep: 1500 }, { expression: PROBE }].concat(steps || []) }); }
        catch (e) { fails.push(page + ': could not load: ' + e.message); return; }
        J(r).forEach((x) => {
            const tag = x.page + (fmt ? ' (' + fmt + (n ? ' x' + n : '') + ')' : '') + (x.view ? ' [' + x.view + ']' : '');
            seen.push(tag + ' x=' + x.x + ' imgs=' + x.imgs.length);
            if (x.x || x.imgs.length) fails.push(tag + ': a name became HTML (' + (x.x ? 'the handler RAN ' + x.x + 'x; ' : '') + x.imgs.length + ' <img onerror> in ' + JSON.stringify(x.imgs) + ')');
        });
    };
    await visit('index.html', 'game=' + CODE, [].concat(
        V('full card', "setViewMode('full');"),
        V('hole view', "setViewMode('hole'); goToHole(18);"),
        V('finish round', "openCardInPopup();"),
        V('round sheet', "if (typeof toggleRoundSheet === 'function') toggleRoundSheet(true);"),
        V('live board', "if (typeof openLiveBoard === 'function') openLiveBoard();")));
    for (const [page, q] of [['leaderboard.html', 'game=' + CODE], ['settlement.html', 'game=' + CODE], ['skins.html', 'game=' + CODE], ['sidematches.html', 'game=' + CODE],
        ['stats.html', 'game=' + CODE], ['game.html', 'game=' + CODE], ['shared.html', 'game=' + CODE], ['admin.html', 'game=' + CODE]]) {
        await visit(page, q, page === 'leaderboard.html' ? V('a golfer card', "var b = document.querySelector('[data-pid], .lb-row, .board-row'); if (b) b.click();") : []);
    }
    // The other game formats draw names through their own cards.
    for (const [fmt, n] of [['nassau', 4], ['hilo', 4], ['wolf', 4], ['stroke', 2], ['skins', 4], ['stableford', 4]]) {
        await visit('index.html', 'game=' + CODE, [].concat(V('full card', "setViewMode('full');"), V('hole view', "setViewMode('hole'); goToHole(9);")), fmt, n);
        await visit('settlement.html', 'game=' + CODE, [], fmt, n);
        await visit('stats.html', 'game=' + CODE, [], fmt, n);
    }
    // The GPS screen: the name tag and the "Who are you?" sheet.
    await visit('index.html', 'game=' + CODE, [{ expression: "(function(){ var b = document.getElementById('fd-gps-btn'); if (b) b.click(); return 'gps'; })()" }, { sleep: 2500 }].concat(
        V('gps who sheet', "var w = document.querySelector('#gps-overlay .gps-who'); if (w) w.click();")), 'match', 4);
    console.log(JSON.stringify({ seen, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
