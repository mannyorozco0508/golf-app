// ============================================================================
// REAL DOM INTERACTION TESTS
//
// These drive production code through a LIVE element tree - clicking the actual
// handlers, counting the actual rows - rather than asserting on source text or
// calling helpers in isolation.
//
// This is the class of test that was missing. The "+ Add New Player" stack
// overflow passed 1330 tests because the old harness had no rows for the render
// loop to iterate, so the recursion terminated on its first pass. With a real tree
// the same click reproduces the RangeError exactly.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');
const { createDocument, MiniNode } = require('./helpers/mini-dom.js');

// A page whose player-list container is mounted in the live tree, so anything
// production appends is genuinely findable by selector.
function adminPage() {
    const sb = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js']);
    vm.runInContext(`document.__mount(document.getElementById('player-list'));`, sb);
    return sb;
}
const run = (sb, code) => vm.runInContext(code, sb);
const rows = sb => { run(sb, `window.__n = document.querySelectorAll('.player-row').length;`); return sb.window.__n; };

// ---------------------------------------------------------------------------
describe('THE MINI-DOM ITSELF', () => {
    test('appendChild really attaches, and selectors really find', () => {
        const doc = createDocument();
        const box = doc.createElement('div');
        box.id = 'player-list';
        doc.__mount(box);
        const row = doc.createElement('div');
        row.className = 'player-row';
        box.appendChild(row);
        assert.equal(doc.querySelectorAll('.player-row').length, 1);
        assert.equal(doc.querySelectorAll('#player-list .player-row').length, 1);
        assert.equal(row.parentNode, box);
    });

    test('Element.remove() exists and detaches — the method the old stub lacked', () => {
        const doc = createDocument();
        const a = doc.createElement('div'); a.className = 'x'; doc.__mount(a);
        assert.equal(doc.querySelectorAll('.x').length, 1);
        a.remove();
        assert.equal(doc.querySelectorAll('.x').length, 0);
    });

    test('createElement returns a NEW node each time', () => {
        const doc = createDocument();
        assert.notEqual(doc.createElement('div'), doc.createElement('div'),
            'a shared element is why appended rows never accumulated');
    });

    test('innerHTML = "" clears children, which is how production resets the list', () => {
        const doc = createDocument();
        const box = doc.createElement('div'); doc.__mount(box);
        const r = doc.createElement('div'); r.className = 'player-row'; box.appendChild(r);
        assert.equal(doc.querySelectorAll('.player-row').length, 1);
        box.innerHTML = '';
        assert.equal(doc.querySelectorAll('.player-row').length, 0);
    });

    test('classList, dataset, style, value, checked and disabled all behave', () => {
        const doc = createDocument();
        const el = doc.createElement('input'); doc.__mount(el);
        el.classList.add('a'); el.classList.add('b');
        assert.ok(el.classList.contains('a') && el.classList.contains('b'));
        el.classList.toggle('a');
        assert.ok(!el.classList.contains('a'));
        el.classList.remove('b');
        assert.equal(el.className.trim(), '');
        el.dataset.foo = 'bar';
        assert.equal(el.dataset.foo, 'bar');
        el.style.display = 'none';
        assert.equal(el.style.display, 'none');
        el.value = '12'; el.checked = true; el.disabled = true;
        assert.equal(el.value, '12');
        assert.ok(el.checked && el.disabled);
    });

    test('the selector shapes production actually uses', () => {
        const doc = createDocument();
        const det = doc.createElement('details');
        det.className = 'nav-more'; det.setAttribute('open', '');
        doc.__mount(det);
        assert.equal(doc.querySelectorAll('details.nav-more[open]').length, 1,
            'tag + class + attribute');
        det.removeAttribute('open');
        assert.equal(doc.querySelectorAll('details.nav-more[open]').length, 0);

        const wrap = doc.createElement('div'); wrap.id = 'sm-stake-presets'; doc.__mount(wrap);
        const btn = doc.createElement('button'); btn.className = 'preset-btn'; wrap.appendChild(btn);
        assert.equal(doc.querySelectorAll('#sm-stake-presets .preset-btn').length, 1, 'descendant');

        const on = doc.createElement('input'); on.className = 'score-input'; doc.__mount(on);
        const off = doc.createElement('input'); off.className = 'score-input'; off.setAttribute('disabled', ''); doc.__mount(off);
        assert.equal(doc.querySelectorAll('.score-input:not([disabled])').length, 1, ':not([attr])');
    });

    test('click() runs registered listeners, and closest() walks up', () => {
        const doc = createDocument();
        const outer = doc.createElement('div'); outer.className = 'card'; doc.__mount(outer);
        const inner = doc.createElement('button'); outer.appendChild(inner);
        let fired = 0;
        inner.addEventListener('click', () => { fired++; });
        inner.click();
        assert.equal(fired, 1);
        assert.equal(inner.closest('.card'), outer);
    });

    test('getElementById still returns a PERSISTENT element per id', () => {
        // The guarantee existing tests rely on: pre-set a value, production sees it.
        const doc = createDocument();
        doc.getElementById('foo').value = '42';
        assert.equal(doc.getElementById('foo').value, '42');
        assert.equal(doc.getElementById('foo'), doc.getElementById('foo'));
    });
});

// ---------------------------------------------------------------------------
describe('ADD NEW PLAYER — driven through the real click handler', () => {
    test('one tap turns one row into two', () => {
        const sb = adminPage();
        run(sb, `addPlayerRow();`);
        assert.equal(rows(sb), 1);
        run(sb, `addNewPlayerAndRefresh();`);
        assert.equal(rows(sb), 2, 'the click must actually produce a row');
    });

    test('repeated taps reach 4, then 5, then 8', () => {
        const sb = adminPage();
        run(sb, `addPlayerRow();`);
        [2, 3, 4, 5, 6, 7, 8].forEach(target => {
            run(sb, `addNewPlayerAndRefresh();`);
            assert.equal(rows(sb), target, `expected ${target} rows`);
        });
    });

    test('THE REGRESSION: the click does not overflow the stack', () => {
        // With the recursion present this throws RangeError inside
        // captureCurrentPlayerInputs, reached via updateCount -> handleFormatChange
        // -> renderPlayerList. It is only reachable when real rows exist.
        const sb = adminPage();
        run(sb, `addPlayerRow();`);
        for (let i = 0; i < 8; i++) {
            assert.doesNotThrow(() => run(sb, `addNewPlayerAndRefresh();`),
                `click ${i + 2} threw`);
        }
    });

    test('the 4 -> 5 transition, where one group becomes two, still adds a row', () => {
        const sb = adminPage();
        run(sb, `addPlayerRow(); addNewPlayerAndRefresh(); addNewPlayerAndRefresh(); addNewPlayerAndRefresh();`);
        assert.equal(rows(sb), 4);
        run(sb, `groupSizeOverrides = {}; window.__g4 = currentGroupCount(); window.__s4 = multiGroupMoneySuppressed();`);
        assert.equal(sb.window.__g4, 1, 'four golfers is one group');
        assert.equal(sb.window.__s4, false, 'and keeps the setup shortcut');

        run(sb, `addNewPlayerAndRefresh();`);
        assert.equal(rows(sb), 5, 'the 5th row must appear');
        run(sb, `window.__g5 = currentGroupCount(); window.__s5 = multiGroupMoneySuppressed();`);
        assert.equal(sb.window.__g5, 2, 'five golfers is two groups');
        assert.equal(sb.window.__s5, true, 'and suppresses the implicit main wager');
    });

    test('the multi-group note and stake box follow the group count', () => {
        const sb = adminPage();
        run(sb, `addPlayerRow(); document.getElementById('game-format-select').value = 'bestball';`);
        run(sb, `refreshMultiGroupMoneyRule();
            window.__box1 = document.getElementById('match-settings').style.display;
            window.__note1 = document.getElementById('multigroup-action-note').style.display;`);
        assert.equal(sb.window.__box1, 'block', 'one group keeps the stake box');
        assert.equal(sb.window.__note1, 'none');

        run(sb, `for (var i = 0; i < 4; i++) addNewPlayerAndRefresh();
            refreshMultiGroupMoneyRule();
            window.__box2 = document.getElementById('match-settings').style.display;
            window.__note2 = document.getElementById('multigroup-action-note').style.display;`);
        assert.equal(rows(sb), 5);
        assert.equal(sb.window.__box2, 'none', 'five golfers hides the stake box');
        assert.equal(sb.window.__note2, 'block', 'and explains why');
    });

    test('delete a player, then add another — no stale count', () => {
        const sb = adminPage();
        run(sb, `addPlayerRow(); addNewPlayerAndRefresh(); addNewPlayerAndRefresh(); addNewPlayerAndRefresh();`);
        assert.equal(rows(sb), 4);
        run(sb, `document.querySelectorAll('.player-row')[1].remove(); updateCount();`);
        assert.equal(rows(sb), 3, 'removing a row must actually remove it');
        run(sb, `addNewPlayerAndRefresh();`);
        assert.equal(rows(sb), 4, 'and the count must not be stale afterwards');
    });

    test('bulk paste still builds every row', () => {
        const sb = adminPage();
        run(sb, `
            var names = [];
            for (var i = 1; i <= 12; i++) names.push('Player ' + i + ', ' + (i % 20));
            document.getElementById('paste-players-textarea').value = names.join('\\n');
            commitPastedPlayers();
        `);
        assert.equal(rows(sb), 12, 'the deferRefresh bulk path must still work');
    });

    test('an existing round loads its players and can still add one', () => {
        const sb = adminPage();
        run(sb, `
            renderPlayerList(true);
            var existing = [
                { name: 'Marty', hcp: '8', team: 'Team 1', squad: 'red', playingForMoney: true },
                { name: 'Manny', hcp: '4', team: 'Team 2', squad: 'blue', playingForMoney: true },
                { name: 'John', hcp: '15', team: 'Team 1', squad: 'red', playingForMoney: true }
            ];
            document.getElementById('player-list').innerHTML = '';
            existing.forEach(function (p) {
                addPlayerRow(p.name, p.hcp, p.team, p.squad, false, true, existing.length, true);
            });
            updateCount();
        `);
        assert.equal(rows(sb), 3, 'existing players render');
        run(sb, `addNewPlayerAndRefresh();`);
        assert.equal(rows(sb), 4, 'and a new one can still be added');
    });
});

// ---------------------------------------------------------------------------
// A second, unrelated interactive path, so the harness is not tailored to one
// button. The Action modal's player picker is the busiest interactive surface
// outside setup.
describe('SIDE MATCH PLAYER PICKER — a second real interaction', () => {
    function actionPage() {
        const sb = loadHtmlInlineScript('sidematches.html',
            ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js']);
        vm.runInContext(`
            currentData = {
                gameFormat: 'stroke', courseData: [],
                players: [
                    { id: '1', name: 'Marty', hcp: '8', playingForMoney: true },
                    { id: '2', name: 'Manny', hcp: '4', playingForMoney: true },
                    { id: '3', name: 'John', hcp: '15', playingForMoney: true },
                    { id: '4', name: 'Steve', hcp: '0', playingForMoney: true }
                ],
                scores: {}, sideMatches: {}
            };
            document.__mount(document.getElementById('sm-player-picker-a'));
            document.__mount(document.getElementById('sm-player-picker-b'));
        `, sb);
        return sb;
    }

    test('opening the modal renders both side pickers', () => {
        const sb = actionPage();
        assert.doesNotThrow(() => vm.runInContext(`renderSideMatchPicker();`, sb));
        vm.runInContext(`
            window.__a = document.getElementById('sm-player-picker-a').innerHTML;
            window.__b = document.getElementById('sm-player-picker-b').innerHTML;`, sb);
        assert.ok(/Marty/.test(sb.window.__a), 'side 1 lists the field');
        assert.ok(/Marty/.test(sb.window.__b), 'side 2 lists the field');
    });

    test('picking players updates the live state and the feedback line', () => {
        const sb = actionPage();
        vm.runInContext(`
            renderSideMatchPicker();
            pickPlayerForSide('1', 'a');
            pickPlayerForSide('2', 'b');
            window.__state = JSON.stringify(sidematchPickState);
            window.__size = document.getElementById('sm-team-size-indicator').innerHTML;`, sb);
        assert.equal(sb.window.__state, '{"1":"a","2":"b"}');
        assert.match(sb.window.__size, /1v1/, 'the modal should say what is being built');
    });

    test('tapping a chosen golfer again removes them', () => {
        const sb = actionPage();
        vm.runInContext(`
            renderSideMatchPicker();
            pickPlayerForSide('1', 'a');
            pickPlayerForSide('1', 'a');
            window.__state = JSON.stringify(sidematchPickState);`, sb);
        assert.equal(sb.window.__state, '{}');
    });

    test('switching formats does not throw and hides the two-sided picker for Skins', () => {
        const sb = actionPage();
        vm.runInContext(`document.__mount(document.getElementById('sm-picker-box'));`, sb);
        assert.doesNotThrow(() => vm.runInContext(`
            document.getElementById('sm-format').value = 'skins';
            onSideMatchFormatChange();
            window.__picker = document.getElementById('sm-picker-box').style.display;
            window.__field = document.getElementById('sm-field-fields').style.display;`, sb));
        assert.equal(sb.window.__picker, 'none', 'Skins has no sides');
        assert.equal(sb.window.__field, 'block', 'it has participants instead');
    });
});
