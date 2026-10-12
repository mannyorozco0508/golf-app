#!/usr/bin/env node
// ============================================================================
// "PASTE THE WHOLE ROUND", THE WAY THE ORGANIZER USES IT (gps-paste-fix)
//
//   node tools/paste-round-check.js [<old tree> ...]
//
// Round Setup in cold Chrome, on the Players step: tap "Paste the whole round",
// paste, "Read it", answer the Nassau sides on the review, Confirm. Then, with
// NOTHING else touched: Confirm must land on Review & Save, which lists every
// golfer, the groups and every game; "Save & Start Round" writes them all in one
// update. Cases: Muse's 32-golfer text on a NEW round and on a SAVED round that
// already has one golfer; the same with "Name, 12" handicaps; a 1-group "$5
// Nassau" paste. Each saved round is then opened on every <old tree> (GPS beta
// build 12, the web app): the scorecard, Action and Results load with 0 errors.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const HERE = path.join(__dirname, '..');
const { wizardSavedRound } = require(path.join(HERE, 'helpers/wizard-saved-round.js'));
const T32 = fs.readFileSync(path.join(__dirname, 'fixtures/paste-round-32.txt'), 'utf8');
const T32C = T32.replace(/ \((\d+)\)/g, ', $1');
const T1 = 'GROUP 1 - $5 NASSAU\nManny Orozco (12)\nSean Cameron (8)\nBrian Blake (15)\nJP Peloso (10)\n';
const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+e.lineno)});addEventListener('unhandledrejection',function(e){window.__e.push('rej '+String(e.reason&&e.reason.message||e.reason))});var _ce=console.error;console.error=function(){window.__e.push('console.error '+Array.prototype.join.call(arguments,' '));_ce.apply(console,arguments)};";

function oldRound() {
    const r = wizardSavedRound({ code: 'PSTOLD', golfers: 1, names: ['Muse Tester'], hcps: [9], ownerUid: 'anon-cold', thru: 0, flights: false,
        overrides: { additionalGames: {}, kpWinners: null, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club' } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    return r;
}
async function run(code, db, text, typeFirst) {
    const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
    const steps = [];
    // A new round: the course is picked on Step 1 first, as the organizer does.
    if (!db.events[code]) steps.push({ expression: "(function(){selectCourse('caledonia', 'Caledonia Golf & Fish Club'); return 'course';})()" }, { sleep: 600 });
    if (typeFirst) steps.push({ expression: "(function(){var n=document.querySelector('#player-list .p-name-input'); n.value='Muse Tester'; var h=document.querySelector('#player-list .p-hcp-input'); h.value='9'; return 'typed';})()" });
    steps.push(
        { expression: "(function(){goToWizardStep(5); document.getElementById('sp-round-btn').click(); document.getElementById('sp-round-box').value=" + JSON.stringify(text) + "; return 'opened';})()" },
        { expression: "(function(){var b=Array.prototype.filter.call(document.querySelectorAll('#sp-round-modal button'),function(x){return /^Read it/.test(x.textContent);})[0]; b.click(); return 'read';})()" }, { sleep: 400 },
        { expression: "JSON.stringify({ review: document.getElementById('sp-round-review').innerText, dupes: (document.querySelector('.sp-dupes')||{}).innerText||'', notset: (document.querySelector('.sp-notset')||{}).innerText||'' })" },
        { expression: "(function(){['Manny Orozco','Sean Cameron','Brian Blake','Brian Blake','JP Peloso','JP Peloso'].forEach(function(n){var c=Array.prototype.filter.call(document.querySelectorAll('.sp-chip'),function(x){return x.getAttribute('data-name')===n;})[0]; if(c) c.click();}); var cf=document.querySelector('.sp-confirm'); cf.click(); return 'confirmed';})()" }, { sleep: 800 },
        { expression: "JSON.stringify({ step: currentWizardStep, review: (document.getElementById('wizard-step-7')||{}).innerText||'', status: (document.getElementById('sp-round-status')||{}).innerText||'', e: window.__e })" },
        { expression: "(function(){var b=Array.prototype.filter.call(document.querySelectorAll('#wizard-step-7 button'),function(x){return /Save/.test(x.textContent);})[0]; b.click(); return 'saved';})()" }, { sleep: 2500 },
        { expression: "JSON.stringify({ e: window.__e, w: (window.__coldWrites||[]).filter(function(w){return w.op==='update' && w.path==='events/" + code + "';}).map(function(w){return w.value;}) })" });
    const r = await arriveCold({ url: fileUrl('admin.html', 'game=' + code), db, settleMs: 4000, viewport: { width: 390, height: 844 }, preScript: ERR, steps });
    if (!r.ok) throw new Error(code + ': ' + r.reason);
    const js = r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
    return { read: js[0], after: js[1], saved: js[2] };
}
const BASE_DB = () => ({ events: {}, global_courses: {}, trips: {}, organizers: {}, tournaments: {} });

(async () => {
    const fails = [], report = {};
    const cases = [
        { name: '32 new round', code: 'PSTNEW', text: T32, typeFirst: true, want: 32, kept: ['Muse Tester'] },
        { name: '32 saved round', code: 'PSTOLD', text: T32, old: true, want: 32, kept: ['Muse Tester'] },
        { name: '32 "Name, 12"', code: 'PSTCOM', text: T32C, typeFirst: false, want: 32, kept: [] },
        { name: '1 group $5 Nassau', code: 'PSTONE', text: T1, typeFirst: false, want: 4, kept: [] }
    ];
    const saved = {};
    for (const c of cases) {
        const db = BASE_DB();
        if (c.old) db.events.PSTOLD = oldRound();
        const r = await run(c.code, db, c.text, c.typeFirst);
        const v = (r.saved.w || [])[0];
        const tag = c.name;
        const rep = report[tag] = { step: r.after.step, errs: r.after.e.concat(r.saved.e) };
        if (rep.errs.length) fails.push(tag + ': errors ' + rep.errs.join(' | '));
        if (r.after.step !== 7) fails.push(tag + ': Confirm did not open Review & Save (step ' + r.after.step + ')');
        if (!v) { fails.push(tag + ': Save wrote nothing. Review: ' + r.after.review.slice(0, 300)); continue; }
        saved[c.code] = v;
        const names = (v.players || []).map((p) => p.name);
        rep.players = names.length; rep.groups = v.groupSizeOverrides; rep.hcp = (v.players || []).slice(0, 3).map((p) => p.name + ':' + p.hcp).join(', ');
        const pasted = names.filter((n) => c.kept.indexOf(n) === -1);
        if (pasted.length !== c.want) fails.push(tag + ': ' + pasted.length + ' pasted golfers saved, expected ' + c.want);
        c.kept.forEach((k) => { if (names.indexOf(k) === -1) fails.push(tag + ': ' + k + ' (already on the list) was dropped'); });
        if (c.want === 32) {
            ['Derrick Doncaster', 'Derrick J Doncaster', 'Zach Corrano', 'Zach Carrano'].forEach((n) => { if (names.indexOf(n) === -1) fails.push(tag + ': ' + n + ' missing (near-duplicate merged?)'); });
            if (!/Bill Saley \/ Billy Saley/.test(r.read.dupes) || !/Zach Corrano \/ Zach Carrano/.test(r.read.dupes) || !/Derrick Doncaster \/ Derrick J Doncaster/.test(r.read.dupes)) fails.push(tag + ': the review did not warn about near-duplicates: ' + r.read.dupes);
            if (!/Wolf — Group 2/.test(r.read.notset) || !/Stableford — Group 8/.test(r.read.notset)) fails.push(tag + ': the review did not list the formats not set up: ' + r.read.notset);
            const sizes = Object.values(v.groupSizeOverrides || {});
            if (sizes.slice(0, 8).join() !== '4,4,4,4,4,4,4,4') fails.push(tag + ': groups ' + sizes.join('/'));
            const ids = (list) => list.map((n) => String((v.players.find((p) => p.name === n) || {}).id));
            const sm = Object.keys(v).filter((k) => /^sideMatches\//.test(k)).map((k) => v[k]);
            rep.games = sm.map((x) => x.format + ' ' + x.teamAIds + 'v' + x.teamBIds + ' $' + x.frontStake + '/' + x.backStake + '/' + x.overallStake + ' g' + x.ownerGroup)
                .concat(Object.values(v.additionalGameInstances || {}).map((x) => x.format + ' ' + (x.participantIds || 'all') + (x.skinsBuyIn != null ? ' $' + x.skinsBuyIn : '') + (x.vegasPointVal != null ? ' $' + x.vegasPointVal : '') + (x.bbbPointVal != null ? ' $' + x.bbbPointVal : '')));
            const nas = sm.find((x) => x.format === 'nassau');
            if (!nas || nas.teamAIds.join() !== ids(['Manny Orozco', 'Sean Cameron']).join() || nas.teamBIds.join() !== ids(['Brian Blake', 'JP Peloso']).join() || nas.frontStake !== 5 || nas.overallStake !== 5 || nas.ownerGroup !== 1 || nas.scope !== 'group')
                fails.push(tag + ': the Group 1 Nassau is not as answered: ' + JSON.stringify(nas));
            const inst = Object.values(v.additionalGameInstances || {});
            const sk = inst.find((x) => x.format === 'skins'), vg = inst.find((x) => x.format === 'vegas'), bb = inst.find((x) => x.format === 'bbb');
            if (!sk || sk.skinsBuyIn !== 2 || (sk.participantIds || []).join() !== ids(['James Rahlston', 'John Kelly', 'Bill Saley', 'Derrick Doncaster']).join()) fails.push(tag + ': Group 3 skins ' + JSON.stringify(sk));
            if (!vg || vg.vegasPointVal !== 1 || vg.vegasTeamA.join() !== ids(['Glen Quintiliano', 'Chris Cameron']).join() || vg.vegasTeamB.join() !== ids(['VJ Dumas', 'Vaughn Dumas']).join()) fails.push(tag + ': Group 4 Vegas ' + JSON.stringify(vg));
            if (!bb || bb.bbbPointVal !== 2 || bb.participantIds.join() !== ids(['Billy Saley', 'Zach Carrano', 'James Secondi', 'Mike Costa']).join()) fails.push(tag + ': Group 7 BBB ' + JSON.stringify(bb));
            if (v.gameFormat !== 'stroke') fails.push(tag + ': the round format became ' + v.gameFormat + ' (8 groups on different formats)');
            if (!/33 added|32 added/.test(r.after.review) || !/Nassau/.test(r.after.review) || !/Not set up/.test(r.after.review) || !/8 groups|9 groups/.test(r.after.review)) fails.push(tag + ': Review & Save is missing players / groups / the Nassau / Not set up');
            if (c.text === T32C && (v.players.find((p) => p.name === 'Manny Orozco') || {}).hcp !== '12') fails.push(tag + ': "Manny Orozco, 12" did not keep the handicap');
        } else {
            const sm = Object.keys(v).filter((k) => /^sideMatches\//.test(k)).map((k) => v[k]);
            rep.games = sm.map((x) => x.format + ' ' + x.teamAIds + 'v' + x.teamBIds + ' $' + x.frontStake);
            if (sm.length !== 1 || sm[0].frontStake !== 5 || 'scope' in sm[0]) fails.push(tag + ': one $5 team Nassau expected (no group scope on a 1-group round): ' + JSON.stringify(sm));
            if (v.players.length !== 4) fails.push(tag + ': ' + v.players.length + ' golfers');
        }
    }
    // Older apps open the saved rounds.
    for (const tree of process.argv.slice(2).map((t) => path.resolve(t))) {
        const { arriveCold, fileUrl } = require(path.join(tree, 'tools/lib/cold-arrival.js'));
        for (const code of Object.keys(saved)) {
            const ev = Object.assign({}, oldRound(), {}); Object.keys(ev).forEach((k) => delete ev[k]);
            const data = {};
            Object.keys(saved[code]).forEach((k) => { const parts = k.split('/'); if (parts.length === 1) data[k] = saved[code][k]; else { data[parts[0]] = data[parts[0]] || {}; data[parts[0]][parts[1]] = saved[code][k]; } });
            data.ownerUid = 'anon-cold';
            for (const page of ['index.html', 'sidematches.html', 'settlement.html']) {
                const r = await arriveCold({ url: fileUrl(page, 'game=' + code), db: { events: { [code]: data }, global_courses: {}, trips: {}, tournaments: {} }, settleMs: 3500, viewport: { width: 390, height: 844 }, preScript: ERR,
                    steps: [{ expression: "JSON.stringify({ e: window.__e, n: document.body.innerText.length })" }] });
                const x = r.ok ? JSON.parse(r.value[0]) : { e: ['did not load: ' + r.reason], n: 0 };
                report[path.basename(tree) + ' ' + code + ' ' + page] = x;
                if (x.e.length) fails.push(path.basename(tree) + ' ' + page + ' ' + code + ': ' + x.e.join(' | '));
                if (x.n < 200) fails.push(path.basename(tree) + ' ' + page + ' ' + code + ': rendered almost nothing');
            }
        }
    }
    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
