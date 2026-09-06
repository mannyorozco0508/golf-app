// ============================================================================
// "SAME AS SEGMENT" NOW SAYS WHAT IT COSTS
//
// The Auto Press Amount dropdown offered "Same as Segment", and nobody could tell
// what that meant - "Segment" is undefined jargon, and it is SINGULAR while a
// Nassau has three. The request was to show the money instead: "$10 (same as
// Front 9)".
//
// THAT EXACT WORDING WOULD BE WRONG, and the wizard's own defaults prove it.
// Front 9 $10, Back 9 $10, Overall $20 with auto-press left on "same" does not
// resolve to one number. money-engine.js:377 resolves it PER SEGMENT at press
// time, so hole 3 fires two presses at once:
//
//     Press 1 (Hole 3)  baseId=F9   stake=$10
//     Press 1 (Hole 3)  baseId=18   stake=$20
//
// Naming a single amount would understate every Overall press by 2x, on money.
// So the label carries every amount it will actually use, and collapses to one
// number only when the three genuinely agree.
//
//     all three equal   ->  Same as Segment ($10)
//     any differ        ->  Same as Segment ($10 / $10 / $20)
//
// with a sub-line that maps the bare numbers back to their segments, because
// "$10 / $10 / $20" alone does not say which is which.
//
// ONE BUILDER, TWO ENTRY POINTS - the rule this file exists to hold. The wizard
// (admin.html) and the side-match form (sidematches.html) both render this
// control, and a hand-written copy in each would drift. This project has already
// paid for that class of bug: a per-press stake landed in money-engine.js and not
// in the page copies, and a $10 Nassau with a $25 press showed $30 live while the
// Receipt correctly paid $45.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ADMIN = read('admin.html');
const SM = read('sidematches.html');
const AM = loadJsFile('action-model.js');
// The builder runs in a vm realm, so its arrays carry that realm's prototypes and a
// strict deepEqual would fail on identity rather than on value. Round-tripping makes
// the comparison mean what it reads as.
const label = input => JSON.parse(JSON.stringify(AM.nassauAutoPressLabel(input)));

const ADMIN_DEPS = ['handicap.js','money-engine.js','action-model.js','settlement-engine.js','pool-engine.js','score-marks.js'];
const SM_DEPS = ['handicap.js','money-engine.js','action-model.js','settlement-engine.js'];

describe('THE SHARED BUILDER — what the label says', () => {

    test('three equal stakes collapse to one number', () => {
        assert.equal(label({ front: 10, back: 10, overall: 10 }).option,
            'Same as Segment ($10)');
    });

    // The wizard ships with exactly these numbers, so this is the DEFAULT state of
    // the control - the one a golfer sees before touching anything.
    test('the wizard defaults show all three, because they differ', () => {
        assert.equal(label({ front: 10, back: 10, overall: 20 }).option,
            'Same as Segment ($10 / $10 / $20)');
    });

    test('the order is Front, Back, Total — not sorted, not deduped', () => {
        assert.equal(label({ front: 5, back: 50, overall: 20 }).option,
            'Same as Segment ($5 / $50 / $20)');
    });

    test('the sub-line maps each number back to its segment', () => {
        const out = label({ front: 10, back: 10, overall: 20 });
        assert.match(out.hint, /Front 9 \$10/);
        assert.match(out.hint, /Back 9 \$10/);
        assert.match(out.hint, /Total \$20/);
        assert.match(out.hint, /each press matches its own segment/i);
    });

    // A skipped bet is still a real answer to "what will a press cost me".
    test('a $0 segment is shown, never omitted', () => {
        const out = label({ front: 0, back: 10, overall: 20 });
        assert.equal(out.option, 'Same as Segment ($0 / $10 / $20)');
        assert.match(out.hint, /Front 9 \$0/);
    });

    test('all-zero collapses like any other equal trio', () => {
        assert.equal(label({ front: 0, back: 0, overall: 0 }).option,
            'Same as Segment ($0)');
    });

    test('a $0 segment does not silently become the fallback', () => {
        // 0 is a real value, not "blank" - it must not fall through to `stake`.
        assert.equal(label({ front: 0, back: 0, overall: 0, stake: 25 }).option,
            'Same as Segment ($0)');
    });

    test('legacy single-stake rounds read as one number', () => {
        assert.equal(label({ stake: 10 }).option, 'Same as Segment ($10)');
    });

    // Mirrors baseStakeFor in money-engine.js: a blank segment falls back to the
    // legacy single stake, and that fallback is what the golfer is actually charged.
    test('a blank segment falls back to the legacy stake, as the engine does', () => {
        assert.equal(label({ front: 10, back: '', overall: 20, stake: 7 }).option,
            'Same as Segment ($10 / $7 / $20)');
    });

    test('with nothing to report it claims no number at all', () => {
        const out = label({});
        assert.equal(out.option, 'Same as Segment');
        assert.equal(out.hint, '');
    });

    test('a half-dollar stake is not rounded away', () => {
        assert.equal(label({ front: 12.5, back: 12.5, overall: 12.5 }).option,
            'Same as Segment ($12.50)');
    });

    test('the builder is pure — no DOM, no database', () => {
        const src = read('action-model.js');
        const fn = src.slice(src.indexOf('function nassauAutoPressLabel'),
                             src.indexOf('function nassauAutoPressLabel') + 2200);
        assert.ok(!/document\.|db\.ref|firebase/.test(fn),
            'the builder must stay callable from both pages and from a test');
    });
});

describe('THE AMOUNTS ARE THE ONES THE ENGINE WILL CHARGE', () => {

    // THE POINT OF THE WHOLE CHANGE. A label that drifts from the engine is worse
    // than the jargon it replaced, so it is checked against the real engine rather
    // than against a second opinion about what the engine does.
    const E = loadJsFile('money-engine.js');
    const cd18 = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
    const P = [{ id: 1, name: 'A', hcp: '0', team: 'Team 1', playingForMoney: true },
               { id: 2, name: 'B', hcp: '0', team: 'Team 2', playingForMoney: true }];
    const losing = () => {
        const s = {};
        cd18.forEach(h => { s['p1_h' + h.hole] = 5; s['p2_h' + h.hole] = 4; });
        return s;
    };
    // Every auto-press stake the engine actually creates, per segment.
    function enginePressStakes(cfg) {
        const r = E.calculateMatchEngine(P, cd18, losing(), 'gross', 'nassau',
            '2down', cfg.front, 0, [], { F9: cfg.front, B9: cfg.back, '18': cfg.overall, autoPress: null });
        const out = {};
        r.activeMatches.filter(m => /^Press/.test(m.label || '')).forEach(m => {
            (out[m.baseId] = out[m.baseId] || new Set()).add(m.stake);
        });
        return Object.keys(out).reduce((o, k) => (o[k] = [...out[k]], o), {});
    }

    test('each segment presses at exactly one stake, and it is that segment’s', () => {
        const cfg = { front: 10, back: 10, overall: 20 };
        const eng = enginePressStakes(cfg);
        assert.deepEqual(eng.F9, [10]);
        assert.deepEqual(eng.B9, [10]);
        assert.deepEqual(eng['18'], [20]);
    });

    test('the label reports those same three amounts', () => {
        const cfg = { front: 10, back: 10, overall: 20 };
        const eng = enginePressStakes(cfg);
        assert.deepEqual(label(cfg).amounts, [eng.F9[0], eng.B9[0], eng['18'][0]]);
    });

    test('and it tracks the engine when the stakes are odd', () => {
        const cfg = { front: 5, back: 50, overall: 20 };
        const eng = enginePressStakes(cfg);
        assert.deepEqual(label(cfg).amounts, [eng.F9[0], eng.B9[0], eng['18'][0]]);
        assert.equal(label(cfg).option, 'Same as Segment ($5 / $50 / $20)');
    });

    test('one press on one hole really can cost two different amounts', () => {
        // The fact that killed "$10 (same as Front 9)".
        const r = E.calculateMatchEngine(P, cd18, losing(), 'gross', 'nassau', '2down',
            10, 0, [], { F9: 10, B9: 10, '18': 20, autoPress: null });
        const h3 = r.activeMatches.filter(m => (m.label || '').includes('Hole 3'));
        assert.equal(h3.length, 2, 'hole 3 fires a Front 9 press and an Overall press');
        assert.deepEqual([...new Set(h3.map(m => m.stake))].sort((a, b) => a - b), [10, 20]);
    });
});

describe('ONE BUILDER, TWO ENTRY POINTS', () => {

    test('action-model.js defines it exactly once and exports it', () => {
        const src = read('action-model.js');
        assert.equal((src.match(/function nassauAutoPressLabel/g) || []).length, 1);
        assert.match(src, /module\.exports\.nassauAutoPressLabel = nassauAutoPressLabel;/);
        assert.equal(typeof AM.nassauAutoPressLabel, 'function');
    });

    // The markup keeps an UNPRICED "Same as Segment" so the control is never an empty
    // dropdown before the sync runs - progressive enhancement, not a second copy. What
    // must never appear in a page is a priced sentence, because THAT is the string that
    // drifts. Asserted directly below as well as here.
    test('the shipped markup carries no amounts of its own', () => {
        ['admin.html', 'sidematches.html'].forEach(f => {
            const src = read(f);
            const opt = /<option value="same">([^<]*)<\/option>/.exec(src);
            assert.ok(opt, f + ' lost its fallback option entirely');
            assert.equal(opt[1], 'Same as Segment',
                f + ' hard-codes a priced label instead of letting the builder price it');
            assert.ok(!/\$/.test(opt[1]), f + ' bakes a dollar amount into static markup');
        });
    });

    test('both pages call the shared builder rather than composing their own', () => {
        ['admin.html', 'sidematches.html'].forEach(f => {
            assert.match(read(f), /nassauAutoPressLabel\(/, f + ' does not call the builder');
        });
    });

    test('neither page builds the sentence by hand', () => {
        ['admin.html', 'sidematches.html'].forEach(f => {
            const src = read(f);
            assert.ok(!/Same as Segment \(\$/.test(src),
                f + ' composes the priced label itself - that is the copy that drifts');
        });
    });
});

describe('THE WIZARD — admin.html, driven for real', () => {

    function wizard(front, back, overall, mode) {
        const sb = loadHtmlInlineScript('admin.html', ADMIN_DEPS);
        vm.runInContext(`
            alert=function(){};
            document.getElementById('setup-nassau-front').value='${front}';
            document.getElementById('setup-nassau-back').value='${back}';
            document.getElementById('setup-nassau-overall').value='${overall}';
            ${mode ? `document.getElementById('setup-nassau-autopress-mode').value='${mode}';` : ''}
            syncSetupNassauAutoPressLabel();
        `, sb);
        return {
            select: vm.runInContext(`document.getElementById('setup-nassau-autopress-mode').innerHTML`, sb),
            value: vm.runInContext(`document.getElementById('setup-nassau-autopress-mode').value`, sb),
            hint: vm.runInContext(`document.getElementById('setup-nassau-autopress-hint').textContent`, sb),
            hintShown: vm.runInContext(`document.getElementById('setup-nassau-autopress-hint').style.display`, sb),
        };
    }

    test('the option carries the wizard’s own default stakes', () => {
        assert.match(wizard(10, 10, 20).select, /Same as Segment \(\$10 \/ \$10 \/ \$20\)/);
    });

    test('editing a stake re-prices the option', () => {
        assert.match(wizard(5, 5, 5).select, /Same as Segment \(\$5\)/);
        assert.match(wizard(1, 2, 3).select, /Same as Segment \(\$1 \/ \$2 \/ \$3\)/);
    });

    test('the Custom Amount option survives the rebuild', () => {
        assert.match(wizard(10, 10, 20).select, /<option value="custom">Custom Amount<\/option>/);
    });

    // MINI-DOM CANNOT SEE THIS ONE. Rewriting innerHTML resets a real <select>'s
    // value; mini-dom stores value as a plain property, so it survives and the
    // harness reports success either way. A control that deleted the restore line
    // passed cleanly here. The restore is therefore pinned at the source, and the
    // real behaviour is verified in headless Chrome alongside this suite.
    test('rebuilding the options does not lose the golfer’s selection', () => {
        assert.equal(wizard(10, 10, 20, 'custom').value, 'custom');
        assert.equal(wizard(10, 10, 20, 'same').value, 'same');
    });

    test('the selection is explicitly restored after the rebuild', () => {
        const fn = ADMIN.slice(ADMIN.indexOf('function syncSetupNassauAutoPressLabel'),
                               ADMIN.indexOf('function syncSetupNassauAutoPressLabel') + 1400);
        assert.match(fn, /const keep = sel\.value;/, 'nothing captures the selection');
        assert.match(fn, /sel\.value = keep/,
            'the selection is never restored - a real <select> resets on innerHTML');
        assert.ok(fn.indexOf('sel.innerHTML') < fn.indexOf('sel.value = keep'),
            'the restore must come after the rebuild or it does nothing');
    });

    test('the sub-line shows for "same" and hides for "custom"', () => {
        assert.notEqual(wizard(10, 10, 20, 'same').hintShown, 'none');
        assert.match(wizard(10, 10, 20, 'same').hint, /Front 9 \$10/);
        assert.equal(wizard(10, 10, 20, 'custom').hintShown, 'none');
    });

    test('the three stake inputs actually re-run the label', () => {
        const src = read('admin.html');
        ['setup-nassau-front', 'setup-nassau-back', 'setup-nassau-overall'].forEach(id => {
            const tag = src.slice(src.indexOf('id="' + id + '"') - 200,
                                  src.indexOf('id="' + id + '"') + 200);
            assert.match(tag, /syncSetupNassauAutoPressLabel\(\)/,
                id + ' does not refresh the label when edited');
        });
    });
});

describe('THE SIDE-MATCH FORM — sidematches.html, driven for real', () => {

    function form(front, back, overall, mode) {
        const sb = loadHtmlInlineScript('sidematches.html', SM_DEPS);
        vm.runInContext(`
            alert=function(){};
            document.getElementById('sm-front-stake').value='${front}';
            document.getElementById('sm-back-stake').value='${back}';
            document.getElementById('sm-overall-stake').value='${overall}';
            ${mode ? `document.getElementById('sm-autopress-mode').value='${mode}';` : ''}
            syncSmAutoPressLabel();
        `, sb);
        return {
            select: vm.runInContext(`document.getElementById('sm-autopress-mode').innerHTML`, sb),
            value: vm.runInContext(`document.getElementById('sm-autopress-mode').value`, sb),
            hint: vm.runInContext(`document.getElementById('sm-autopress-hint').textContent`, sb),
        };
    }

    test('it prices the option from the form’s own stakes', () => {
        assert.match(form(10, 10, 20).select, /Same as Segment \(\$10 \/ \$10 \/ \$20\)/);
        assert.match(form(5, 5, 5).select, /Same as Segment \(\$5\)/);
    });

    test('a $0 segment is visible here too', () => {
        assert.match(form(0, 10, 20).select, /Same as Segment \(\$0 \/ \$10 \/ \$20\)/);
    });

    test('the sub-line names the segments', () => {
        assert.match(form(10, 10, 20, 'same').hint, /Front 9 \$10 .* Back 9 \$10 .* Total \$20/);
    });

    test('the selection survives the rebuild', () => {
        assert.equal(form(10, 10, 20, 'custom').value, 'custom');
    });

    test('and is explicitly restored, which mini-dom cannot prove', () => {
        const fn = SM.slice(SM.indexOf('function syncSmAutoPressLabel'),
                            SM.indexOf('function syncSmAutoPressLabel') + 1400);
        assert.match(fn, /const keep = sel\.value;/);
        assert.ok(fn.indexOf('sel.innerHTML') < fn.indexOf('sel.value = keep'));
    });

    // A preset writes all three stakes programmatically, and a programmatic .value
    // assignment fires no oninput - so without an explicit call the label would keep
    // showing the amounts the golfer just replaced.
    test('a stake preset re-prices the label too', () => {
        const fn = SM.slice(SM.indexOf('function setSmStakePreset'),
                            SM.indexOf('function setSmStakePreset') + 900);
        assert.match(fn, /syncSmAutoPressLabel\(\)/,
            'setSmStakePreset leaves the priced label stale');
    });

    test('the three stake inputs re-run the label', () => {
        const src = read('sidematches.html');
        ['sm-front-stake', 'sm-back-stake', 'sm-overall-stake'].forEach(id => {
            const tag = src.slice(src.indexOf('id="' + id + '"') - 200,
                                  src.indexOf('id="' + id + '"') + 200);
            assert.match(tag, /syncSmAutoPressLabel\(\)/, id + ' does not refresh the label');
        });
    });
});

describe('THE MONEY CONTRACT DID NOT MOVE', () => {

    // The label is presentation. What gets written must be byte-for-byte what it
    // was: 'same' still means null, 'custom' still means the typed amount.
    test('"same" still persists as null, not as a number', () => {
        const p = AM.buildNassauWagerPayload({ teamAIds: ['1'], teamBIds: ['2'],
            frontStake: 10, backStake: 10, overallStake: 20, autoPressStake: null });
        assert.equal(p.autoPressStake, null);
    });

    test('"custom" still persists the typed amount', () => {
        const p = AM.buildNassauWagerPayload({ teamAIds: ['1'], teamBIds: ['2'],
            frontStake: 10, backStake: 10, overallStake: 20, autoPressStake: 25 });
        assert.equal(p.autoPressStake, 25);
    });

    test('the engine still resolves null per segment', () => {
        const src = read('money-engine.js');
        assert.match(src, /const autoPressStakeFor = id =>/);
        assert.match(src, /return blank\(ap\) \? baseStakeFor\(id\) : Number\(ap\);/);
    });
});

// ============================================================================
// THE ENTRY POINT, NOT THE FUNCTION
//
// The label shipped correct and invisible. nassauAutoPressLabel() built the right
// sentence, both pages rendered it faithfully, 37 tests passed - and a golfer who
// opened the wizard saw "Same as Segment" with no amounts, because nothing called
// the sync until a stake field was edited. The defaults are 10/10/20, which is
// already what most groups want, so most golfers never fired an oninput and never
// saw a price at all.
//
// Every test in the two describes above calls syncSetupNassauAutoPressLabel() or
// syncSmAutoPressLabel() itself and then asserts the output. They proved the
// builder and the rendering. Not one of them asked whether anything CALLS them.
//
// So these drive the path a user actually arrives through - navigate to the step,
// tick the box, pick the format - and touch neither sync function by name.
//
// HARNESS LIMIT, and it matters here. mini-dom never parses value="10" out of
// static markup, so the stake inputs read '' unless a test seeds them. A reveal
// test that seeded nothing would see an unpriced label and could not tell a
// missing call from an empty input. The stakes are therefore set BEFORE the
// reveal - which is the state a real browser is already in when the panel opens -
// and the browser's own default-attribute behaviour is verified in Chrome.
// ============================================================================

describe('THE LABEL IS PRICED WHEN THE CONTROL APPEARS', () => {

    // The wizard: navigate to the step and tick Nassau. No sync call, no typing.
    function openWizard(front, back, overall) {
        const sb = loadHtmlInlineScript('admin.html', ADMIN_DEPS);
        vm.runInContext(`
            alert=function(){};
            collectWizardPlayers=function(){ return [{id:101,name:'Marty',hcp:'0'},{id:102,name:'Manny',hcp:'0'}]; };
            document.getElementById('setup-nassau-front').value='${front}';
            document.getElementById('setup-nassau-back').value='${back}';
            document.getElementById('setup-nassau-overall').value='${overall}';
            goToWizardStep(5);
            document.getElementById('setup-nassau-enabled').checked = true;
            toggleSetupNassau();
        `, sb);
        return {
            select: vm.runInContext(`document.getElementById('setup-nassau-autopress-mode').innerHTML`, sb),
            hint: vm.runInContext(`document.getElementById('setup-nassau-autopress-hint').textContent`, sb),
        };
    }

    test('opening the wizard to Nassau shows the amounts, untouched', () => {
        const w = openWizard(10, 10, 20);
        assert.match(w.select, /Same as Segment \(\$10 \/ \$10 \/ \$20\)/,
            'the golfer opened the panel and got the unpriced fallback - the label ' +
            'only ever appears for someone who edits a stake they did not need to edit');
    });

    test('the sub-line is there on open too, not just after an edit', () => {
        assert.match(openWizard(10, 10, 20).hint, /Front 9 \$10 .* Back 9 \$10 .* Total \$20/);
    });

    test('it collapses correctly on open when the stakes agree', () => {
        assert.match(openWizard(5, 5, 5).select, /Same as Segment \(\$5\)/);
    });

    // The side-match form: choose Nassau. That reveal is what makes the control
    // visible at all, so it is the moment the label has to be right.
    function openSideMatch(front, back, overall) {
        const sb = loadHtmlInlineScript('sidematches.html', SM_DEPS);
        vm.runInContext(`
            alert=function(){};
            currentData={players:[{id:101,name:'Marty',hcp:'0'},{id:102,name:'Manny',hcp:'0'}],courseData:[],scores:{}};
            document.getElementById('sm-front-stake').value='${front}';
            document.getElementById('sm-back-stake').value='${back}';
            document.getElementById('sm-overall-stake').value='${overall}';
            document.getElementById('sm-format').value='nassau';
            onSideMatchFormatChange();
        `, sb);
        return {
            select: vm.runInContext(`document.getElementById('sm-autopress-mode').innerHTML`, sb),
            hint: vm.runInContext(`document.getElementById('sm-autopress-hint').textContent`, sb),
            groupShown: vm.runInContext(`document.getElementById('sm-autopress-group').style.display`, sb),
        };
    }

    test('choosing Nassau reveals a control that is already priced', () => {
        const f = openSideMatch(10, 10, 20);
        assert.equal(f.groupShown, 'block', 'the control did not even appear');
        assert.match(f.select, /Same as Segment \(\$10 \/ \$10 \/ \$20\)/,
            'the control was revealed still carrying the static fallback');
    });

    test('and its sub-line is populated on reveal', () => {
        assert.match(openSideMatch(0, 10, 20).hint, /Front 9 \$0/);
    });

    // Pinned at the source as well: a reveal that stops calling the sync is the
    // exact regression this describe exists for, and the seeded-input harness
    // cannot distinguish every way that could happen.
    test('each reveal path calls the sync by name', () => {
        const wiz = ADMIN.slice(ADMIN.indexOf('function toggleSetupNassau()'),
                                ADMIN.indexOf('function toggleSetupNassauAutoAmount'));
        assert.match(wiz, /syncSetupNassauAutoPressLabel\(\)/,
            'toggleSetupNassau reveals the panel without pricing it');

        const fmt = SM.slice(SM.indexOf('function onSideMatchFormatChange'),
                             SM.indexOf('function onSideMatchFormatChange') + 4000);
        assert.match(fmt, /syncSmAutoPressLabel\(\)/,
            'onSideMatchFormatChange reveals the control without pricing it');
    });
});
