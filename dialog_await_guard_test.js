// ============================================================================
// NO DIALOG'S ANSWER IS USED WITHOUT AWAITING IT
//
// THIS IS THE ONE TEST THAT CAN SEE THE DEFECT THIS WAVE RISKS.
//
// confirm() and prompt() are synchronous; their replacements return promises.
// Every conversion therefore has to add an `await`, and a MISSED AWAIT DOES NOT
// THROW. It silently inverts the guard:
//
//     if (!confirm(msg)) return;      ->   if (!uiConfirm(o)) return;
//                                     ->   !Promise is ALWAYS false
//                                     ->   the return never runs
//                                     ->   the round is deleted without asking
//
//     if (confirm(msg)) { ... }       ->   always true, same result, inverted
//     const n = Number(prompt(...))   ->   Number(Promise) is NaN, and a press
//                                          is created with a NaN stake
//
// AND NO BEHAVIOURAL TEST CAN CATCH IT. helpers/load-script.js's sandbox
// confirm() returns TRUE, so a site whose await was forgotten behaves in the
// suite exactly as it does in production — it proceeds — and every suite that
// does not stub confirm stays green while the guard is gone. Measured, not
// assumed: see the assertion at the bottom, which fails if that default ever
// changes and this file's reason for existing goes with it.
//
// So this reads SOURCE. It is deliberately a source scan and says so.
//
// SCOPE: the consumer pages. tournament.html is the other product (Rattle Golf)
// with its own release train, and its 69 alerts are out of this wave by
// instruction. It is listed as OUT below rather than omitted, so that "it was
// forgotten" and "it was excluded" cannot be confused later.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

// CONVERTED — must be clean. Every page here has been through the wave.
const CONVERTED = ['sidematches.html', 'skins.html', 'season.html',
                   'leaderboard.html', 'settlement.html', 'game.html'];

// NOT YET CONVERTED, and the count of native decisions each still has.
//
// THIS IS A BACKLOG AS A TEST, not a comment. UI Wave 1 was scoped to one pilot
// page; these three are the sweep. Pinning the COUNT means two things can each
// go wrong loudly: converting a page without moving it to CONVERTED above fails
// here, and adding a FOURTEENTH native decision to a page that still has some
// also fails here. Neither can drift quietly while the guard reports green.
const PENDING = { 'index.html': 3, 'admin.html': 6, 'trip.html': 1 };

const CONSUMER = CONVERTED.concat(Object.keys(PENDING));
const OUT_OF_SCOPE = ['tournament.html', 'tournament-scorecard.html'];

// Comments are not code. The repo has paid twice for a scan that counted prose.
//
// A SINGLE PASS, NOT A CHAIN OF REPLACES, and that is not fastidiousness.
// The first version ran /\/\*[\s\S]*?\*\//g first. trip.html:1104 contains a `/*`
// INSIDE a `//` line comment, so that regex opened a block comment there and ran
// 1,536 lines to the next `*/` in an unrelated inline comment - blanking the
// page's only confirm() on the way. The guard reported trip.html CLEAN. Doing
// line comments first has the mirror failure: a `//` inside a block comment.
// There is no ordering that works, so this walks the source once and knows which
// of {code, line comment, block comment, html comment, string} it is in.
//
// STRINGS ARE KEPT. Only comments are blanked, and always with the same number
// of newlines they contained, so reported line numbers are the file's own. An
// earlier version deleted block comments outright and reported index.html:6672
// for a call that is really at 7084.
function codeOf(file) {
    const src = read(file);
    const out = new Array(src.length);
    let i = 0;
    const NORMAL = 0, LINE = 1, BLOCK = 2, HTML = 3, STR = 4;
    let state = NORMAL, quote = '';
    while (i < src.length) {
        const c = src[i], c2 = src.substr(i, 2), c4 = src.substr(i, 4);
        if (state === NORMAL) {
            if (c2 === '//') { state = LINE; out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
            if (c2 === '/*') { state = BLOCK; out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
            if (c4 === '<!--') { state = HTML; for (let k = 0; k < 4; k++) out[i + k] = ' '; i += 4; continue; }
            if (c === '"' || c === "'" || c === '`') { state = STR; quote = c; out[i] = c; i++; continue; }
            out[i] = c; i++; continue;
        }
        if (state === STR) {
            if (c === '\\') { out[i] = c; out[i + 1] = src[i + 1]; i += 2; continue; }
            if (c === quote) { state = NORMAL; }
            out[i] = c; i++; continue;
        }
        // inside a comment: blank everything but the newlines
        if (state === LINE && c === '\n') { state = NORMAL; out[i] = c; i++; continue; }
        if (state === BLOCK && c2 === '*/') { state = NORMAL; out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
        if (state === HTML && src.substr(i, 3) === '-->') { state = NORMAL; out[i] = ' '; out[i + 1] = ' '; out[i + 2] = ' '; i += 3; continue; }
        out[i] = (c === '\n') ? '\n' : ' ';
        i++;
    }
    return out.join('');
}

// A call whose ANSWER IS USED: assigned, returned, negated, or tested.
// `foo(); ` on its own line is not one - alert() and a discarded prompt() are
// not what this guards.
const USED = /(?:[=(!?:,[]|return|await|&&|\|\||\bof\b)\s*$/;

function sitesUsingAnswer(file, names) {
    const lines = codeOf(file).split('\n');
    const re = new RegExp('(?<![\\w.$])(' + names.join('|') + ')\\s*\\(');
    const hits = [];
    lines.forEach((line, i) => {
        let m;
        const scan = new RegExp(re.source, 'g');
        while ((m = scan.exec(line)) !== null) {
            const before = line.slice(0, m.index).trimEnd();
            if (!USED.test(before + ' ')) {
                // also catch `const x = await foo(` where the value is used but
                // the marker sits further left
                if (!/\b(const|let|var)\s+[\w$]+\s*=\s*$/.test(before)) continue;
            }
            hits.push({ line: i + 1, fn: m[1], text: line.trim(), before });
        }
    });
    return hits;
}

describe('no dialog answer is used without awaiting it', () => {

    test('THE SANDBOX DEFAULT IS WHY THIS FILE IS A SOURCE SCAN', () => {
        // If confirm() ever stops returning true by default, a behavioural test
        // could see a missed await and this file could be reconsidered. Until
        // then it cannot, and pretending otherwise would be the inert guard this
        // repo keeps finding.
        const { loadHtmlInlineScript } = require('./helpers/load-script.js');
        const vm = require('vm');
        const sb = loadHtmlInlineScript('sidematches.html');
        assert.equal(vm.runInContext('confirm("x")', sb), true,
            'the harness confirm() no longer returns true - re-read this file\'s header');
    });

    CONSUMER.forEach(page => {
        test(page + ': every uiConfirm / uiAmount whose answer is used is awaited', () => {
            const hits = sitesUsingAnswer(page, ['uiConfirm', 'uiAmount']);
            const missing = hits.filter(h => !/await\s*$/.test(h.before));
            assert.deepEqual(missing.map(h => page + ':' + h.line + '  ' + h.text.slice(0, 90)), [],
                'a promise is being used as a value. `!uiConfirm(...)` is always false '
                + 'and `Number(uiAmount(...))` is NaN - neither throws.');
        });
    });

    CONVERTED.forEach(page => {
        test(page + ': no native confirm/prompt answer is used', () => {
            // alert() is not here: it returns nothing and nobody branches on it.
            // A prompt() whose result is DISCARDED is also not here - see the
            // clipboard fallback in sidematches.html, which is deliberately left
            // native and asserted as such in dialog_pilot_test.js.
            const hits = sitesUsingAnswer(page, ['confirm', 'prompt']);
            assert.deepEqual(hits.map(h => page + ':' + h.line + '  ' + h.text.slice(0, 90)), [],
                'a browser dialog is still deciding something on this page');
        });
    });

    Object.keys(PENDING).forEach(page => {
        test(page + ': NOT YET CONVERTED, and still has exactly ' + PENDING[page]
            + ' native decision(s)', () => {
            const hits = sitesUsingAnswer(page, ['confirm', 'prompt']);
            assert.equal(hits.length, PENDING[page],
                page + ' has ' + hits.length + ' native decisions, expected '
                + PENDING[page] + '. If you converted it, move it to CONVERTED above; '
                + 'if you added one, that is a fourteenth dialog this wave exists to '
                + 'stop.\n  ' + hits.map(h => page + ':' + h.line + '  ' + h.text.slice(0, 80)).join('\n  '));
        });
    });

    test('tournament.html is OUT OF SCOPE, deliberately, and still uses its own', () => {
        // Held positively so nobody reads its absence above as an oversight, and
        // so that if someone does convert it the exclusion has to be revisited
        // rather than silently outgrown.
        OUT_OF_SCOPE.forEach(f => {
            if (!fs.existsSync(path.join(REPO_ROOT, f))) return;
            assert.ok(!/ui-dialogs\.js/.test(read(f)),
                f + ' has started using the shared dialogs - it is the other '
                + 'product; widen this list deliberately or take it back out');
        });
    });

    test('the scan is not vacuous: it finds a planted unawaited call', () => {
        // A scan that silently matched nothing would pass every assertion above
        // forever. This proves the detector fires.
        const fake = [
            'function a() {',
            '  if (!uiConfirm({ title: "x" })) return;',
            '  const n = Number(uiAmount({ value: 1 }));',
            '  await uiConfirm({ title: "fine" });',
            '  const ok = await uiConfirm({ title: "fine" });',
            '}'
        ].join('\n');
        const tmp = path.join(REPO_ROOT, '.dialog-scan-probe.html');
        fs.writeFileSync(tmp, '<script>\n' + fake + '\n</script>');
        try {
            const hits = sitesUsingAnswer('.dialog-scan-probe.html', ['uiConfirm', 'uiAmount']);
            const missing = hits.filter(h => !/await\s*$/.test(h.before));
            assert.equal(missing.length, 2,
                'the detector should find exactly the two unawaited uses, found '
                + missing.length + ': ' + JSON.stringify(missing.map(h => h.text)));
        } finally {
            fs.unlinkSync(tmp);
        }
    });
});
