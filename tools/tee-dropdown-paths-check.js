#!/usr/bin/env node
// ============================================================================
// A TEE DROPDOWN ON EVERY ROW, ON EVERY PATH INTO PLAYERS (2026-10-08)
//
// Manny found this on a phone twice: build 15 had no Tee dropdown reopening a
// saved round, build 17 had none on a NEW round. Both times the suite was
// green, because the suite's harness has no network and therefore no ORDER -
// and the order is the whole defect. The tees arrive one read after the rows.
//
// WHAT THIS DOES THAT THE SUITE CANNOT: a real course record arriving a real
// moment later, and the capture path, which reads
// document.querySelectorAll('.player-row') - a query mini-dom's document does
// not answer for a static element's subtree.
//
// NO PAGE FUNCTION IS CALLED. Every path is taps and typing; the only thing
// replaced is the data (the `db` fixture), the way cold-arrival always does it.
//
// EXIT: 0 when every path gives every row a dropdown; 2 otherwise.
// ============================================================================

const { arriveCold } = require('./lib/cold-arrival.js');
const fs = require('fs');
const path = require('path');
const http = require('http');

const REPO = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
               '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
function serveRepo(root) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const u = req.url.split('?')[0];
            const f = path.join(root, u === '/' ? 'index.html' : u.replace(/^\/+/, ''));
            if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
                res.writeHead(404); return res.end('no');
            }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
            res.end(fs.readFileSync(f));
        });
        server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
    });
}

// CALEDONIA AS IT REALLY IS: a bundled preset card in course-data.js with NO
// tees, and a shared global_courses record that carries the rated sets. The
// card being "in hand" while the tees are not is the bug.
const TEES = {
    male: [{ name: 'Black', slope: 140, rating: 73.6, parTotal: 72 },
           { name: 'Blue', slope: 133, rating: 71.8, parTotal: 72 },
           { name: 'White', slope: 126, rating: 69.9, parTotal: 72 }],
    female: [{ name: 'Red', slope: 120, rating: 70.4, parTotal: 72 }]
};
const CARD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
// THE KEY THE PICKER ACTUALLY HANDS OVER, which is the bundled preset's own:
// course-data.js carries `caledonia: { name, data }` with 18 holes and NO tees,
// and the shared record under the SAME key carries 6 rated tee sets (measured
// live 2026-10-08). An earlier run of this check filed the fixture under
// 'caledonia-golf-fish-club', so selectCourse asked for 'caledonia', found
// nothing, and the check reported the app broken on three paths when the fault
// was its own fixture.
const COURSE_KEY = 'caledonia';

// A ROUND TO COPY FROM, and a trip to set one up inside. Both carry the preset
// course key, which is the shape every Myrtle round on Manny's phone has.
function roundRecord(name) {
    return { eventName: name, courseName: 'Caledonia Golf & Fish Club',
        activeCourseKey: COURSE_KEY, gameFormat: 'stroke', courseData: CARD, scores: {},
        settlementMode: 'whole-dollar',
        players: [{ id: 101, name: 'Manny', hcp: '8', playingForMoney: true },
                  { id: 102, name: 'Reese', hcp: '12', playingForMoney: true },
                  { id: 103, name: 'Tim', hcp: '5', playingForMoney: true }] };
}

function db(extra) {
    return Object.assign({
        global_courses: { [COURSE_KEY]: { name: 'Caledonia Golf & Fish Club', data: CARD, tees: TEES } },
        events: {}, trips: {}, tournaments: {}
    }, extra || {});
}

// THE READ: every row, and whether it has a dropdown. Label-based, never
// positional. String.raw because a single backslash in a template literal is
// eaten, which has produced two confidently wrong results in this repo.
const READ = String.raw`(function () {
  var list = document.getElementById('player-list');
  var rows = list ? list.querySelectorAll('.player-row') : [];
  var out = [], withTee = 0;
  for (var i = 0; i < rows.length; i++) {
    var sel = rows[i].querySelector('.p-tee-input');
    var name = rows[i].querySelector('.p-name-input');
    if (sel) withTee++;
    out.push({ name: name ? String(name.value || '') : '',
               tee: !!sel,
               key: rows[i].getAttribute('data-tee-key') || '',
               shown: sel ? (sel.options && sel.selectedIndex >= 0
                             ? String(sel.options[sel.selectedIndex].textContent || '') : '') : null,
               options: sel && sel.options ? sel.options.length : 0 });
  }
  var round = document.getElementById('tee-rating-select');
  return JSON.stringify({ rows: out.length, withTee: withTee, roundSelect: round && round.options ? round.options.length : 0,
                          detail: out.slice(0, 6), errs: (window.__errs || []).slice(0, 2) });
})()`;

const PRE = "window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message));});";

// Choosing the course the way a golfer does: type into the search box, then tap
// the name in the dropdown that appears.
// THE REAL SEQUENCE, read off the page with a probe rather than guessed:
// arriving on admin.html?game=CODE lands on wizard-step-3, the FORMAT step.
// Course is step 4 and Players is step 5, so the walk is next -> type the
// course -> pick it out of the dropdown -> next.
//
// AN EARLIER VERSION OF THIS CHECK typed into the course box while it was still
// hidden on step 3, found nothing, and reported the app broken on four paths.
// The faults were its own. That is why every tap below names an id the probe
// actually saw, and why the step is asserted before the roster is read.
// CONDITIONAL, for the same reason the Players hop is: the coach path
// ("Help me set this up") opens ON the course step, so an unconditional
// "Next: Course" tap carried it PAST the course box and the walk then measured
// nothing. Asked of the screen - is the course box on it? - rather than of my
// reading of the step numbering, which has now been wrong twice.
function toCourseStep() {
    return [
        { expression: "(function(){var i=document.getElementById('course-search-input');"
            + "if(i&&i.offsetParent!==null)return 'already on the Course step';"
            + "var b=document.getElementById('wizard-next-3');"
            + "if(!b)return 'no wizard-next-3';b.click();return 'tapped Next: Course';})()" },
        { sleep: 700 }
    ];
}
function pickCourse() {
    return toCourseStep().concat([
        // WAIT FOR THE BOX, don't guess at a sleep. The coach path draws its
        // guided step late enough that a fixed 700ms tap missed it, and the walk
        // then reported the app broken on a screen it had never reached. Four
        // looks, 400ms apart, and the state is said out loud either way.
        { sleep: 400 },
        { expression: "(function(){var i=document.getElementById('course-search-input');"
            + "return 'course box visible='+!!(i&&i.offsetParent!==null);})()" },
        { sleep: 400 },
        { expression: "(function(){var i=document.getElementById('course-search-input');"
            + "return 'course box visible='+!!(i&&i.offsetParent!==null);})()" },
        { sleep: 600 },
        { tap: '#course-search-input' }, { sleep: 250 },
        { cdp: { method: 'Input.insertText', params: { text: 'Caledonia' } } },
        { sleep: 900 },
        { expression: "(function(){var d=document.getElementById('course-dropdown');"
            + "if(!d)return 'no course dropdown';var items=d.querySelectorAll('div,li,button');"
            + "for(var i=0;i<items.length;i++){if(/Caledonia/.test(items[i].textContent||'')"
            + "&&items[i].children.length===0){items[i].click();"
            + "return 'tapped '+String(items[i].textContent).trim().slice(0,40);}}"
            + "return 'Caledonia not in the dropdown: '+String(d.textContent||'').slice(0,80);})()" },
        { sleep: 1200 }
    ]);
}
// ONLY IF IT IS NOT ALREADY THERE. Picking a course out of the dropdown
// ADVANCES the wizard on its own, so an unconditional "Next: Players" tap went
// straight past the roster to step 6 - where #player-list still exists and is
// hidden, so the read found a row, called it healthy, and the Paste button was
// simply not on screen. Measured: the active step after the course pick is
// wizard-step-5 already.
// THE STEP IDS ARE NOT IN DISPLAY ORDER, which cost this check four wrong
// readings. Measured with a probe that dumped every .wizard-step after each tap:
//
//   arrival            wizard-step-3 active   the FORMAT cards
//   #wizard-next-3  -> wizard-step-1 active   the COURSE search box
//   #wizard-next-1  -> the Players step
//
// So "Next: Players" is #wizard-next-1, not #wizard-next-4. Tapping next-4 -
// a button belonging to a step this walk never visits - jumped straight to
// wizard-step-6, where #player-list still EXISTS and is hidden. The read found
// a row, found a dropdown on it, and called three paths healthy while standing
// on the wrong screen. That is why the step is now asserted and not assumed.
// THE COACH IS A QUESTIONNAIRE OF UNKNOWN LENGTH, so it is walked rather than
// scripted: tap the first real choice on screen, look again, up to six times,
// and stop as soon as the course box appears. Scripting it question by question
// meant a probe per screen and a wrong guess each time - and a hard-coded script
// would break the day a question is added, reporting the app broken when the
// only thing that changed was the coach.
//
// "A real choice" excludes Back/Home and the nav, so this cannot walk backwards
// out of the flow. Every tap is named in the output.
function coachWalk() {
    const step = { expression: "(function(){"
        + "var i=document.getElementById('course-search-input');"
        + "if(i&&i.offsetParent!==null)return 'already on the Course step';"
        + "var btns=document.querySelectorAll('button');"
        + "for(var k=0;k<btns.length;k++){var b=btns[k];"
        + "if(b.offsetParent===null)continue;"
        + "var t=String(b.textContent||'').trim();"
        + "if(!t||/Home|Back|Dark Mode|Account|Delete/i.test(t))continue;"
        + "if(b.id&&/^fmt-card-/.test(b.id)===false&&/^coach-back$/.test(b.id))continue;"
        + "b.click();return 'tapped coach: '+t.slice(0,34);}"
        + "return 'no coach choice on screen';})()" };
    const out = [];
    for (let i = 0; i < 6; i++) { out.push(step, { sleep: 900 }); }
    return out;
}

const toPlayers = [
    { expression: "(function(){var b=document.getElementById('wizard-next-1');"
        + "if(!b)return 'no wizard-next-1';b.click();return 'tapped Next: Players';})()" },
    { sleep: 900 },
    { expression: "(function(){var pl=document.getElementById('player-list');"
        + "var a=document.querySelector('.wizard-step.active');"
        + "return 'on step '+(a?a.id:'none')+' roster visible='+!!(pl&&pl.offsetParent!==null);})()" }
];

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// A BREATH BETWEEN ARMS. Four sequential cold Chromes timed out on
// Page.navigate twice in this session; the same thing happened to the suite
// earlier when a simulator and a Chrome check ran alongside npm test. It is
// contention, not the app, and it is cheaper to wait than to misread it.
// ONE RETRY, AND IT IS NAMED IN THE OUTPUT. Seven sequential cold Chromes in
// one process produced "CDP timeout on Page.navigate" on two arms, and the same
// contention has made the suite itself report spurious failures in this session.
// A timeout is not a measurement, so it is retried once rather than reported as
// a path with no dropdowns - which would be a false accusation against the app.
async function run(served, name, steps, dbData, extraPre, query) {
    const first = await runOnce(served, name, steps, dbData, extraPre, query);
    if (!first.error) return first;
    await pause(4000);
    const second = await runOnce(served, name, steps, dbData, extraPre, query);
    if (second.error) second.error = second.error + ' (twice, after a retry)';
    else second.retried = true;
    return second;
}

async function runOnce(served, name, steps, dbData, extraPre, query) {
    await pause(1500);
    const r = await arriveCold({
        url: 'http://127.0.0.1:' + served.port + '/admin.html' + (query || '?game=TEEP01'),
        db: dbData || db(), auth: { uid: 'anon-1', isAnonymous: true },
        viewport: { width: 390, height: 844 }, settleMs: 3500,
        preScript: PRE + (extraPre || ''),
        steps: steps.concat([{ expression: READ }])
    });
    if (!r.ok) return { path: name, error: r.reason };
    const vals = (r.value || []).map(String);
    const reads = vals.filter(v => v.charAt(0) === '{').map(v => JSON.parse(v));
    return { path: name, taps: vals.filter(v => /^tapped|^no |not in the|^on step|^paste modal|^already on|^course box/.test(v)).map(v => v.slice(0, 60)),
             result: reads[reads.length - 1] };
}

(async () => {
    const out = { what: 'a Tee dropdown on every row, on every path into Players', paths: [], faults: [] };
    const served = await serveRepo(REPO);
    try {
        // 1. NEW GAME DAY, then add golfers by hand. Manny's exact report.
        out.paths.push(await run(served, 'new Game Day + add rows',
            pickCourse().concat(toPlayers, [
                { expression: "(function(){var b=null;var btns=document.querySelectorAll('button');"
                    + "for(var i=0;i<btns.length;i++){if(/Add Player|Add Golfer/i.test(btns[i].textContent||'')){b=btns[i];break;}}"
                    + "if(!b)return 'no Add Player button';b.click();b.click();return 'tapped Add Player twice';})()" },
                { sleep: 500 }])));

        // 2. NEW GAME DAY, then PASTE a group - the reported path, with tee names.
        out.paths.push(await run(served, 'new Game Day + paste (with tee names)',
            pickCourse().concat(toPlayers, [
                { expression: "(function(){var b=null;var btns=document.querySelectorAll('button');"
                    + "for(var i=0;i<btns.length;i++){if(/Paste/i.test(btns[i].textContent||'')"
                    + "&&btns[i].offsetParent!==null){b=btns[i];break;}}"
                    + "if(!b)return 'no Paste button';b.click();return 'tapped Paste players';})()" },
                { sleep: 900 },
                { expression: "(function(){var m=document.getElementById('paste-players-modal');"
                    + "var t=document.getElementById('paste-players-textarea');"
                    + "return 'paste modal open='+!!(m&&/open/.test(m.className||''))"
                    + "+' textarea visible='+!!(t&&t.offsetParent!==null);})()" },
                { tap: '#paste-players-textarea' }, { sleep: 250 },
                { cdp: { method: 'Input.insertText', params: {
                    text: 'Zack Carrano 6 blue\nTim Bell 11 white\nRocco Mediate 4 black\nMary Jones 14 red' } } },
                { sleep: 600 },
                { expression: "(function(){var b=document.getElementById('paste-players-commit-btn');"
                    + "if(!b)return 'no commit button';if(b.disabled)return 'commit button still disabled';"
                    + "b.click();return 'tapped Add Players';})()" },
                { sleep: 900 }])));

        // 3. A SAVED ROUND REOPENED - build 16's path, which must not regress.
        out.paths.push(await run(served, 'Edit Round Setup (saved round)', [{ sleep: 1400 }].concat(toCourseStep(), toPlayers),
            db({ events: { TEEP01: { eventName: 'Myrtle Day 1', courseName: 'Caledonia Golf & Fish Club',
                activeCourseKey: COURSE_KEY, gameFormat: 'stroke', courseData: CARD, scores: {},
                players: [{ id: 101, name: 'Manny', hcp: '8', playingForMoney: true },
                          { id: 102, name: 'Reese', hcp: '12', playingForMoney: true },
                          { id: 103, name: 'Tim', hcp: '5', playingForMoney: true }] } } })));

        // 4. THE CAPTURE PATH: switch the format, which rebuilds every row. The
        //    tee a golfer chose has to survive it.
        out.paths.push(await run(served, 'format switch keeps a chosen tee',
            pickCourse().concat(toPlayers, [
                { expression: "(function(){var b=null;var btns=document.querySelectorAll('button');"
                    + "for(var i=0;i<btns.length;i++){if(/Add Player|Add Golfer/i.test(btns[i].textContent||'')){b=btns[i];break;}}"
                    + "if(b){b.click();b.click();}return 'rows added';})()" },
                { sleep: 400 },
                // THE GOLFER'S OWN CHOICE: off the default onto the women's red.
                { expression: "(function(){var list=document.getElementById('player-list');"
                    + "var row=list.querySelectorAll('.player-row')[0];if(!row)return 'no row';"
                    + "var sel=row.querySelector('.p-tee-input');if(!sel)return 'NO TEE DROPDOWN to choose from';"
                    + "var want='';for(var i=0;i<sel.options.length;i++){if(/Red/.test(sel.options[i].textContent)){want=sel.options[i].value;}}"
                    + "if(!want)return 'no Red tee offered';sel.value=want;"
                    + "sel.dispatchEvent(new Event('change',{bubbles:true}));"
                    + "return 'tapped Red on row 1 ('+want+')';})()" },
                { sleep: 300 },
                { expression: "(function(){var s=document.getElementById('game-format-select');"
                    + "if(!s)return 'no format select';s.value='bestball';"
                    + "s.dispatchEvent(new Event('change',{bubbles:true}));return 'tapped format Best Ball';})()" },
                { sleep: 900 }])));
        // 5. SAME AS LAST WEEK - a copy of a previous round, landing on Players.
        //    lastRoomCode in localStorage is what makes the button appear, so the
        //    arrival seeds it the way a phone that set a round up last week has it.
        out.paths.push(await run(served, 'Same as last week', [
            { sleep: 1400 },
            // THE BUTTON LIVES BEHIND "Open something else", which is where the
            // lobby keeps the copy-a-round card. A golfer taps that first.
            { expression: "(function(){var d=document.getElementById('open-else');"
                + "if(!d)return 'no open-else disclosure';d.open=true;return 'tapped Open something else';})()" },
            { sleep: 500 },
            { expression: "(function(){var b=document.getElementById('same-as-last-week');"
                + "if(!b)return 'no Same as last week button';if(b.offsetParent===null)return 'no visible Same as last week button';"
                + "b.click();return 'tapped Same as last week';})()" },
            { sleep: 2600 },
            { expression: "(function(){var pl=document.getElementById('player-list');"
                + "var a=document.querySelector('.wizard-step.active');"
                + "return 'on step '+(a?a.id:'none')+' roster visible='+!!(pl&&pl.offsetParent!==null);})()" }],
            db({ events: { LASTWK: roundRecord('Last week') } }),
            "try{localStorage.setItem('lastRoomCode','LASTWK');}catch(e){}", '?'));

        // 6. HELP ME SET THIS UP - the coach path, which mints its own round.
        out.paths.push(await run(served, 'Help me set this up (coach)', [
            { sleep: 1400 },
            { expression: "(function(){var a=document.getElementById('coach-link');"
                + "if(!a)return 'no coach link';a.click();return 'tapped Help me set this up';})()" },
            { sleep: 2500 },
            // THE COACH ASKS HOW MANY OF US FIRST - "Four of us", "Five to
            // eight", "More than eight" - and nothing else is on the screen
            // until it is answered. Probed, after two wrong guesses at a sleep.
            { expression: "(function(){var btns=document.querySelectorAll('button');"
                + "for(var i=0;i<btns.length;i++){if(/Four of us/.test(btns[i].textContent||'')"
                + "&&btns[i].offsetParent!==null){btns[i].click();return 'tapped Four of us';}}"
                + "return 'no group-size question on the coach screen';})()" },
            { sleep: 2000 }].concat(coachWalk(), pickCourse(), toPlayers, [
            { expression: "(function(){var b=null;var btns=document.querySelectorAll('button');"
                + "for(var i=0;i<btns.length;i++){if(/Add Player|Add Golfer/i.test(btns[i].textContent||'')"
                + "&&btns[i].offsetParent!==null){b=btns[i];break;}}"
                + "if(!b)return 'no Add Player button';b.click();return 'tapped Add Player';})()" },
            { sleep: 600 }]), db(), null, '?'));

        // 7. A TRIP ROUND - set up from inside a trip, which is how all seven
        //    Myrtle rounds were made.
        out.paths.push(await run(served, 'a trip round', [
            { sleep: 1600 },
            { expression: "(function(){var b=document.getElementById('hw-quick');"
                + "if(!b)return 'no Game Day tile';b.click();return 'tapped Game Day (in the trip)';})()" },
            { sleep: 2400 }].concat(toCourseStep(), [
            { tap: '#course-search-input' }, { sleep: 250 },
            { cdp: { method: 'Input.insertText', params: { text: 'Caledonia' } } }, { sleep: 900 },
            { expression: "(function(){var d=document.getElementById('course-dropdown');"
                + "if(!d)return 'no course dropdown';var items=d.querySelectorAll('div,li,button');"
                + "for(var i=0;i<items.length;i++){if(/Caledonia/.test(items[i].textContent||'')"
                + "&&items[i].children.length===0){items[i].click();"
                + "return 'tapped '+String(items[i].textContent).trim().slice(0,40);}}"
                + "return 'Caledonia not in the dropdown';})()" },
            { sleep: 1200 }], toPlayers, [
            { expression: "(function(){var b=null;var btns=document.querySelectorAll('button');"
                + "for(var i=0;i<btns.length;i++){if(/Add Player|Add Golfer/i.test(btns[i].textContent||'')"
                + "&&btns[i].offsetParent!==null){b=btns[i];break;}}"
                + "if(!b)return 'no Add Player button';b.click();return 'tapped Add Player';})()" },
            { sleep: 600 }]),
            db({ trips: { MYRTLE: { name: 'Myrtle', tripCode: 'MYRTLE', rounds: {} } } }),
            null, '?trip=MYRTLE'));
    } catch (e) {
        out.faults.push('check error: ' + String(e && e.message || e));
    } finally {
        try { served.server.close(); } catch (e) {}
    }

    out.paths.forEach((p) => {
        const tag = '[' + p.path + '] ';
        if (p.error) { out.faults.push(tag + 'arrival failed: ' + p.error); return; }
        const r = p.result || {};
        if ((r.errs || []).length) out.faults.push(tag + 'the page threw: ' + JSON.stringify(r.errs));
        if (p.taps && p.taps.some(t => /not in the dropdown|^no [a-z]/.test(t)
                && !/^no element/.test(t))) {
            out.faults.push(tag + 'the walk did not complete, so this path measured nothing: '
                + JSON.stringify(p.taps));
            return;
        }
        // THE ROSTER HAS TO BE ON SCREEN. Asserting a step NUMBER would have been
        // asserting my own reading of the markup, and that reading was wrong
        // twice; "the golfer can see the player list" is the actual claim.
        const step = (p.taps || []).filter(t => t.indexOf('on step ') === 0).pop();
        if (step && step.indexOf('roster visible=true') === -1) {
            out.faults.push(tag + 'the Players step is not on screen (' + step
                + ') - an earlier run of this check read a HIDDEN roster and called three paths healthy');
            return;
        }
        if (!r.rows) { out.faults.push(tag + 'no player rows at all, so this path proves nothing'); return; }
        if (r.roundSelect < 2) {
            out.faults.push(tag + 'the round-level tee select holds ' + r.roundSelect
                + ' options - the tees were never fetched, which is the defect itself');
        }
        if (r.withTee !== r.rows) {
            out.faults.push(tag + r.withTee + ' of ' + r.rows + ' rows have a Tee dropdown');
        }
        if (p.path.indexOf('paste') !== -1) {
            const zack = (r.detail || []).find(d => /Zack/.test(d.name));
            if (!zack) out.faults.push(tag + 'Zack is not on the roster: ' + JSON.stringify(r.detail));
            else if (!/Blue/.test(zack.shown || '')) {
                out.faults.push(tag + '"Zack Carrano 6 blue" is showing "' + zack.shown
                    + '" - the tee name in the paste was thrown away');
            }
        }
        if (p.path.indexOf('format switch') !== -1) {
            const first = (r.detail || [])[0];
            if (!first || !/Red/.test(first.shown || '')) {
                out.faults.push(tag + 'after the format switch row 1 shows "'
                    + (first ? first.shown : '(no row)') + '" instead of the Red tee it was set to');
            }
        }
    });
    out.ok = out.faults.length === 0;
    console.log(JSON.stringify(out, null, 1));
    process.exit(out.ok ? 0 : 2);
})();
