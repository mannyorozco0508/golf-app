// ============================================================================
// GAME DAY QUICK SETUP WRITES NO ROUND UNTIL SAVE (web-signin-redirect,
// 2026-11-07 - the stray-draft MVPP5Q report)
//
// The report: "stray draft round MVPP5Q created from /admin quick setup" (Advisor,
// TEAM-LOG 07:50). The rule the page documents (createRoom, code-issuer.js): the
// lobby mints a code and NAVIGATES; nothing is written to events/<code> until
// Save & Start Round.
//
// WHAT WAS FOUND (read-only, 2026-11-07): MVPP5Q is NOT in the live database -
// not under /events (290 keys read shallow), /trips, /seasons, /registrations,
// /tournaments, the chat paths, or any organizers/<uid>/rounds. Every write to
// events/ in admin.html (origin/main d2f9ef9f = the live /admin, sha-equal) is
// in one of: saveSettings (the Save button), groupTeeChanged and retireRound
// (Round Ready, after a save), enableWholeDollarSettlement (an existing round
// only) and endAndClearRound (delete). None runs during setup. So no web code
// path was found that writes a round before Save, and nothing here "fixes" one;
// this test PINS the rule so a future one goes red.
//
// HOW: one phone (tools/sim/lib/phone.js - real Chrome, real taps, a stand-in
// database that logs every write with its path). Lobby -> tap Game Day -> the
// wizard on the minted code -> a course through the page's own search, golfers
// typed into the page's own boxes, every Next tapped -> Review. At EVERY step
// the write log must hold nothing under events/. Then Save is tapped, and the
// round write must appear (the positive control: the log is not blind).
//
// COUNTS (final run, 2026-11-07): 1 test, 1 pass on web-signin-redirect AND on
// origin/main d2f9ef9f - it pins behaviour that is already right. CONTROL: a
// write added to goToWizardStep (events/<code>/draftProbe) turned it red at
// "arrived on <code>", restored by sha (RESTORED-OK cefca5ac...). A write added
// to handleFormatChange instead was INERT - that function did not run with a
// code during this walk, so it says nothing either way.
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Phone, Server } = require('./tools/sim/lib/phone.js');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (page, q) => 'file://' + path.join(__dirname, page) + (q ? '?' + q : '');

async function writes(p) {
    return (await p.json('(window.__simLog||[]).map(function(e){ return { op: e.op, path: e.path }; })')) || [];
}
const roundWrites = (log) => log.filter((w) => /^events(\/|$)/.test(String(w.path || '')));

describe('Game Day quick setup writes nothing to events/ before Save', { skip: !fs.existsSync(CHROME) && 'no Chrome' }, () => {
    test('lobby -> Game Day -> course, golfers, every Next -> Review: no round write; Save: the round write', async () => {
        const server = new Server({});
        const p = await Phone.launch({ name: 'organizer', server, auth: { uid: 'anon-quick', isAnonymous: true, email: null } });
        try {
            await p.goto(fileUrl('admin.html'), 3000);
            assert.ok(await p.tap('#hw-quick'), 'no Game Day tile');
            await p.waitFor(`/[?&]game=[A-Z0-9]+/.test(location.search)`, 15000);
            await sleep(2500);
            const code = await p.eval(`new URLSearchParams(location.search).get('game')`);
            assert.match(code, /^[A-Z0-9]{4,8}$/);
            const steps = [];
            steps.push({ at: 'arrived on ' + code, w: roundWrites(await writes(p)) });

            // WALK with the wizard's own Next buttons: a course through the page's own
            // search box and dropdown when the Course step shows, golfers typed into
            // the page's own boxes when the Players step shows (all real taps).
            let picked = null;
            for (let i = 0; i < 12; i++) {
                const atSave = await p.eval(`(function(){ var b=document.getElementById('main-save-btn'); return !!(b && b.offsetParent !== null); })()`);
                if (atSave) break;
                const courseShown = await p.eval(`(function(){ var c=document.getElementById('course-search-input'); return !!(c && c.offsetParent !== null); })()`);
                if (courseShown && !picked) {
                    await p.type('#course-search-input', 'True Blue', { settle: 900 });
                    picked = await p.tap({ sel: '#course-dropdown .custom-select-option', text: /True Blue/ });
                    steps.push({ at: 'course ' + picked, w: roundWrites(await writes(p)) });
                }
                const names = await p.eval(`[].slice.call(document.querySelectorAll('.player-row .p-name-input')).filter(function(i){return i.offsetParent !== null;}).length`);
                if (names) {
                    const filled = await p.eval(`[].slice.call(document.querySelectorAll('.player-row .p-name-input')).filter(function(i){return i.value;}).length`);
                    if (!filled) {
                        for (const [n, name] of [[0, 'Al Test'], [1, 'Bo Test']]) {
                            await p.eval(`(function(){ var i=document.querySelectorAll('.player-row .p-name-input')[${n}]; if(i){ i.id = i.id || 'qs-name-${n}'; } return !!i; })()`);
                            const id = await p.eval(`(function(){ var i=document.querySelectorAll('.player-row .p-name-input')[${n}]; return i ? i.id : null; })()`);
                            if (id) await p.type('#' + id, name, { settle: 200 });
                        }
                    }
                }
                const label = await p.tap({ sel: '.wizard-btn-next' }, { settle: 700 });
                steps.push({ at: 'Next ' + label, w: roundWrites(await writes(p)) });
                if (!label) break;
            }
            const reachedReview = await p.eval(`(function(){ var b=document.getElementById('main-save-btn'); return !!(b && b.offsetParent !== null); })()`);
            assert.ok(picked, 'no course was picked: ' + steps.map((s) => s.at).join(' > '));
            assert.ok(reachedReview, 'never reached Review: ' + steps.map((s) => s.at).join(' > '));
            assert.ok(steps.length >= 3, 'the walk took fewer than three steps: ' + steps.map((s) => s.at).join(' > '));
            for (const s of steps) assert.deepEqual(s.w, [], 'A ROUND WRITE BEFORE SAVE at "' + s.at + '": ' + JSON.stringify(s.w));

            // POSITIVE CONTROL: Save writes the round, so the log can see one.
            await p.tap('#main-save-btn', { settle: 3000 });
            const after = roundWrites(await writes(p));
            assert.ok(after.some((w) => w.path === 'events/' + code), 'Save wrote no round - the write log is blind: ' + JSON.stringify(after));
        } finally { await p.close(); }
    });
});
