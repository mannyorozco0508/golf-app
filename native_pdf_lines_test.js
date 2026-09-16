// ============================================================================
// THE SHARE-SHEET PDF READS LIKE THE PAGE (2026-09-15, v151)
//
// native-export.js linesFrom() read innerText from a DETACHED clone of each
// export root. An element that is not rendered has no layout, and the spec
// makes innerText return textContent there - so every card came out on one
// line ("Original Bet$50Started Hole 1Carp 2&0Carp +$50MATCH NET · Carp
// +$50") with the source's indentation on the headers. Build 13 to v150.
//
// NOW: the text is assembled from the LIVE tree (renderedText/textOf) - a flex
// or grid box's items joined two spaces apart on ONE line (a ledger row is a
// flex box: "Marty  $310"; a bare text node in one is an item too), blocks on
// their own lines, table rows kept with innerText's tabs turned to spaces,
// nothing that is display:none. Buttons are excluded by their own rendered
// text, line for line. FAIL SOFT: no innerText, no getComputedStyle, a
// detached root, an empty live read, or a throw -> the clone path, verbatim
// what it was, so the PDF is the old PDF rather than no PDF. The trip
// itinerary takes that path today (its root is display:none on screen; its
// print rule lives in @media print) and is byte-identical to before.
//
// WHAT MINI-DOM CAN PROVE: the seams, the fallback (mini-dom has no innerText,
// so _linesFrom here IS the clone path), and the builder's pagination on many
// lines. The rendered lines, the money sequence and the button exclusion are
// measured in Chrome by tools/native-pdf-lines-check.js against
// native_pdf_lines_prev.fixture.json (HEAD 65e5b82's lines).
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha8 = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO_ROOT, f))).digest('hex').slice(0, 8);
const stripComments = s => s.replace(/<!--[\s\S]*?-->|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str !== undefined ? str : '');
const SRC = read('native-export.js');
const code = stripComments(SRC);

function api() {
    const sb = loadJsFile('native-export.js');
    return { sb, x: vm.runInContext('window.RattleExport', sb), run: c => vm.runInContext(c, sb) };
}

describe('THE FIXTURE: what the PDF carried before', () => {
    const prev = JSON.parse(read('native_pdf_lines_prev.fixture.json'));
    test('captured at 65e5b82 from the detached-clone read: 26 receipt lines, one card per line, source indentation kept', () => {
        assert.equal(sha8('native_pdf_lines_prev.fixture.json'), '6b483e5d');
        assert.equal(prev.capturedAt, '65e5b82');
        assert.equal(prev.receipt.length, 26);
        assert.ok(prev.receipt.some(l => /Original Bet\$50Started Hole 1Carp 2&0Carp \+\$50MATCH NET/.test(l)), 'the run-together card is in the fixture');
        assert.equal(prev.receipt.filter(l => /^\s+\S/.test(l)).length, 17, 'seventeen indented lines');
        assert.equal(prev.trip.length, 11);
    });
});

describe('THE SEAMS (source, comments stripped)', () => {
    test('the live read exists, reads innerText of the LIVE root through getComputedStyle, and falls back to the clone path', () => {
        assert.match(code, /function renderedText\(root\) \{/);
        assert.match(code, /function textOf\(el, view\) \{/);
        assert.match(code, /if \(root\.isConnected === false\) throw new Error\('detached root'\);/);
        assert.match(code, /if \(!text\.trim\(\)\) throw new Error\('nothing rendered'\);/);
        assert.match(code, /return \{ text: cloneText\(root\), drop: \{\}, live: false \};/);
        assert.match(code, /const read = renderedText\(root\);/);
    });
    test('the clone path is the old code, verbatim, kept as the fallback', () => {
        assert.match(code, /function cloneText\(root\) \{\s*const clone = root\.cloneNode\(true\);\s*clone\.querySelectorAll\('button, \.nav-link, \.btn-primary, \.btn-outline, script, style'\)/);
        assert.match(code, /\? clone\.innerText\s*: \(clone\.textContent \|\| ''\);/);
    });
    test('buttons are dropped by their rendered text, and a flex box joins its items on one line', () => {
        assert.match(code, /root\.querySelectorAll\('button, \.nav-link, \.btn-primary, \.btn-outline'\)\.forEach/);
        assert.match(code, /if \(read\.drop\[line\.trim\(\)\]\) return;/);
        assert.match(code, /return items\.join\('  '\);/);
        assert.match(code, /raw\.replace\(\/\\t\/g, '  '\)/);
    });
    test('nothing about the PDF builder or its grid changed', () => {
        const at = code.indexOf('function buildPdf('); const fn = code.slice(at, code.indexOf('\n    function ', at + 30));
        assert.ok(fn.length > 1500, 'the builder was sliced');
        assert.match(code, /const LINES_PER_PAGE = Math\.floor\(\(PAGE_H - MARGIN \* 2\) \/ LEAD\);/);
        assert.match(fn, /BT \/F1 ' \+ SIZE \+ ' Tf ' \+ LEAD \+ ' TL 1 0 0 1 '\s*\+ MARGIN \+ ' ' \+ \(PAGE_H - MARGIN\) \+ ' Tm/);
    });
});

describe('FAIL SOFT: where there is no rendering, the old read runs', () => {
    // The same hand-built root native_export_test.js uses: no innerText, a
    // cloneNode that returns itself, textContent with the source's indentation.
    const fakeRoot = `var root = { isConnected: true, textContent: '   Golf Round\\n   Marty$310', cloneNode: function () { return root; }, querySelectorAll: function () { return []; } };`;
    test('no innerText (mini-dom, or any unrendered node): _renderedText reports live:false and _linesFrom is the old output, indentation and all', () => {
        const a = api();
        a.run(fakeRoot);
        assert.equal(JSON.parse(a.run('JSON.stringify(window.RattleExport._renderedText(root))')).live, false);
        assert.deepEqual(JSON.parse(a.run('JSON.stringify(window.RattleExport._linesFrom([root]))')), ['   Golf Round', '   Marty$310']);
    });
    test('an innerText that is present but not backed by layout (no ownerDocument/getComputedStyle): the clone path too', () => {
        const a = api();
        a.run(fakeRoot + " root.innerText = 'Golf Round\\nMarty\\n$310';");
        assert.equal(JSON.parse(a.run('JSON.stringify(window.RattleExport._renderedText(root))')).live, false);
    });
    test('a live read that renders NOTHING (a display:none root) falls back rather than exporting an empty PDF', () => {
        const a = api();
        // a stand-in view whose getComputedStyle says none for everything
        // a real detached clone has no layout, so its innerText resolves to textContent - modelled here
        a.run(fakeRoot + " root.innerText = ''; root.ownerDocument = { defaultView: { getComputedStyle: function () { return { display: 'none' }; } } }; root.childNodes = []; root.children = []; root.cloneNode = function () { return { textContent: root.textContent, querySelectorAll: function () { return []; } }; };");
        const rt = JSON.parse(a.run('JSON.stringify(window.RattleExport._renderedText(root))'));
        assert.equal(rt.live, false); assert.equal(rt.text, '   Golf Round\n   Marty$310');
    });
    test('a live root with layout: a flex row is one line, a button line is dropped, a display:none child contributes nothing', () => {
        const a = api();
        a.run(`
          function node(tag, display, kids, text) { var n = { nodeType: 1, tagName: tag, display: display, childNodes: kids || [], children: (kids || []).filter(function (k) { return k.nodeType === 1; }), isConnected: true };
            n.innerText = text !== undefined ? text : n.children.map(function (k) { return k.innerText; }).join('\\n'); return n; }
          function txt(t) { return { nodeType: 3, textContent: t }; }
          var view = { getComputedStyle: function (el) { return { display: el.display }; } };
          var btn = node('BUTTON', 'inline-block', [], 'Print / Save Receipt'); btn.className = 'btn-primary';
          var row1 = node('DIV', 'flex', [node('SPAN', 'inline', [], 'Marty'), node('SPAN', 'inline', [], '$310')]);
          var row2 = node('DIV', 'flex', [node('SPAN', 'inline', [], 'Carp'), node('SPAN', 'inline', [], '-$12 NET')]);
          var hidden = node('DIV', 'none', [], 'SHOULD NOT APPEAR');
          var legend = node('DIV', 'flex', [node('SPAN', 'inline-block', [], ''), txt(' Birdie '), node('SPAN', 'inline-block', [], ''), txt(' Eagle or better ')]);
          var head = node('DIV', 'block', [], 'FINAL RESULTS');
          var card = node('DIV', 'block', [btn, head, row1, row2, hidden, legend]);
          card.innerText = 'Print / Save Receipt\\nFINAL RESULTS\\nMarty\\n$310\\nCarp\\n-$12 NET\\nBirdie\\nEagle or better';
          card.ownerDocument = { defaultView: view }; card.querySelectorAll = function (sel) { return sel.indexOf('button') === 0 ? [btn] : []; };
          window.__card = card;`);
        const rt = JSON.parse(a.run('JSON.stringify(window.RattleExport._renderedText(window.__card))'));
        assert.equal(rt.live, true);
        assert.deepEqual(rt.text.split('\n'), ['Print / Save Receipt', 'FINAL RESULTS', 'Marty  $310', 'Carp  -$12 NET', 'Birdie  Eagle or better']);
        assert.deepEqual(Object.keys(rt.drop), ['Print / Save Receipt']);
        assert.deepEqual(JSON.parse(a.run('JSON.stringify(window.RattleExport._linesFrom([window.__card]))')), ['FINAL RESULTS', 'Marty  $310', 'Carp  -$12 NET', 'Birdie  Eagle or better']);
    });
    test('a null root and an empty root produce nothing, and no throw', () => {
        const a = api();
        assert.deepEqual(JSON.parse(a.run('JSON.stringify(window.RattleExport._linesFrom([null, undefined]))')), []);
    });
});

describe('PAGINATION with many lines: nothing runs past the bottom margin', () => {
    test('146 lines -> 3 pages of at most 54 rows, every row above y = 44', () => {
        const a = api();
        const lines = Array.from({ length: 146 }, (_, i) => 'Row ' + i + '  $' + i);
        a.sb.__lines = lines;
        const pdf = String(a.run("window.RattleExport._buildPdf('Many', __lines)"));
        const streams = pdf.split(/\d+ 0 obj\n<< \/Length \d+ >>\nstream\n/).slice(1).map(s => s.split('\nendstream')[0]);
        const rows = streams.map(s => (s.match(/\) Tj/g) || []).length);
        assert.deepEqual(rows, [54, 54, 40], '148 rows (title + blank + 146) over three pages');
        streams.forEach((s, i) => {
            const m = /1 0 0 1 (\d+) (\d+) Tm/.exec(s); assert.ok(m, 'page ' + i + ' has a text origin');
            const top = Number(m[2]); const lastY = top - (rows[i] - 1) * 13;
            assert.equal(top, 792 - 44); assert.ok(lastY >= 44, 'page ' + i + ' last row at y ' + lastY);
        });
        assert.equal((pdf.match(/\/Type \/Page /g) || []).length, 3);
        // the xref points at every object
        const xrefAt = Number(/startxref\n(\d+)/.exec(pdf)[1]); assert.equal(pdf.slice(xrefAt, xrefAt + 4), 'xref');
    });
    test('one line: one page, as before', () => {
        const a = api();
        const pdf = String(a.run("window.RattleExport._buildPdf('One', ['Marty  $310'])"));
        assert.equal((pdf.match(/\/Type \/Page /g) || []).length, 1);
        assert.match(pdf, /\(Marty  \$310\) Tj/);
    });
});

describe('THE DEVICE CHECK exists and measures what this file cannot', () => {
    test('tools/native-pdf-lines-check.js reads the fixture, compares the character stream, and checks the button and the trip', () => {
        const t = read('tools/native-pdf-lines-check.js');
        ['native_pdf_lines_prev.fixture.json', 'squash(r.lines) !== squash(PREV.receipt)', 'a button row leaked', 'trip: lines differ from the fixture', "'Marty  $310'"].forEach(s => assert.ok(t.includes(s), 'missing ' + s));
    });
});
