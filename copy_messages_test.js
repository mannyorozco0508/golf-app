// ============================================================================
// THE COPY MESSAGES SAY WHAT THEY DID (2026-09-20)
//
// THE BUG, measured by Manny on his phone: tapping Copy Link on the headline
// "The whole round" block on Round Ready alerted "Copied Group 0's scorekeeper
// link! Send this ONLY to that group." THE CAUSE: the headline block (added in
// the group-picker wave, 75033f1) reused the group rows' copier -
// copyGroupLink(url, 0) - with a placeholder for the group number, and that
// function has exactly one message, which prints the number. The same wave
// also gave the headline row the `group-link-row` CLASS, and
// tools/round-share-check.js counts `#rr-links-box .group-link-row` to prove
// the group links cover the field exactly once - measured before this fix:
// FAIL on every roster size, "expected 2 group link(s), found 3", "two links
// can write the same card". Both are mine and both are fixed here: the headline
// has its own copier (copyRoundLink) and its own class (rr-round-link-row).
//
// THE WORDING. The headline link goes into a group text:
//   "Copied. Paste it into your group text — everyone picks their own group when
//    they open it."
// A group's own link names who is in it instead of shouting a rule ("Send this
// ONLY to that group" warned about a friend scoring the wrong foursome, and the
// picker makes the whole-round link the normal path anyway):
//   "Copied Group 3’s link — Marty, Mike, Tanner, Glen."   (the app's curly
//   apostrophe, as in "Can’t check that code")
// The organizer link, on the scorecard's Group Links panel, IS worth a caution -
// it grants the whole-field override - and had none (the button read "✅ Copied"
// and nothing else):
//   "Copied your organizer link. It can correct any score in the round — keep
//    it to yourself."
// Still alerts, deliberately: three of the 213 dialogs in the Part 3 inventory,
// and they go with the rest when the toast exists. The scorecard panel's GROUP
// rows keep their silent "✅ Copied" button (no dialog was there and none is
// added).
//
// HARNESS. mini-dom: the rendered markup is a string; the copier is invoked with
// the arguments the row's own onclick carries (parsed off the markup), alert()
// is captured, navigator.clipboard resolves. The coverage claim is Chrome's
// (tools/round-share-check.js).
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const tick = () => new Promise(r => setImmediate(r));
const NAMES = ['Marty Sharp', 'Mike Dunne', 'Tanner Webb', 'Glen Hill', 'Manny Orozco', 'Matt Bell', 'Lance Webb', 'Kopp Jones', "Rocco O'Ray", 'Matt Hall', 'Jeremy Fox', 'Sam Lee'];
const round = n => ({ players: NAMES.slice(0, n).map((name, i) => ({ id: 101 + i, name, hcp: '9' })), courseData: [], scores: {} });

// The onclick a row carries, decoded the way the HTML parser would (&quot; -> ")
// and run as the tap would run it.
const decode = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
function tapButton(sb, html, buttonRe) {
    const m = buttonRe.exec(html);
    assert.ok(m, 'no such button: ' + buttonRe);
    const call = decode(m[1]);
    vm.runInContext('(function () { ' + call + ' }).call({ innerHTML: "" })', sb);
    return call;
}

function ready(n) {
    const sb = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js', 'code-issuer.js', 'grouping.js']);
    vm.runInContext("window.__alerts = []; alert = m => window.__alerts.push(String(m)); uiRefuse = m => window.__alerts.push(String(m)); uiFail = m => window.__alerts.push(String(m)); uiToast = m => window.__alerts.push(String(m)); document.__mount(document.getElementById('rr-links-box')); currentMode = 'MNDY2A'; location = { href: 'https://golf-app-5a5.pages.dev/admin.html', origin: 'https://golf-app-5a5.pages.dev', pathname: '/admin.html' }; window.location = location;", sb);
    sb.__d = round(n);
    vm.runInContext('renderRoundReadyLinks(__d);', sb);
    return { sb, html: String(vm.runInContext("document.getElementById('rr-links-box').innerHTML", sb)), alerts: () => JSON.parse(vm.runInContext('JSON.stringify(window.__alerts)', sb)) };
}

describe('ROUND READY (admin.html)', () => {
    test('THE HEADLINE: its own copier, its own message, no group number anywhere in it', async () => {
        const r = ready(12);
        const call = tapButton(r.sb, r.html, /<button class="btn-outline" onclick="(copyRoundLink\([^"]*\))">/);
        assert.match(call, /^copyRoundLink\('https:\/\/golf-app-5a5\.pages\.dev\/index\.html\?game=MNDY2A'\)$/);
        await tick(); await tick();
        assert.deepEqual(r.alerts(), ['Copied. Paste it into your group text — everyone picks their own group when they open it.']);
        assert.doesNotMatch(r.alerts()[0], /Group \d|ONLY/);
    });
    test('THE HEADLINE is not a .group-link-row (tools/round-share-check.js counts those to prove the group links cover the field exactly once)', () => {
        const r = ready(12);
        const head = r.html.slice(r.html.indexOf('rr-round-link'), r.html.indexOf('Or send each group'));
        assert.match(head, /class="rr-round-link-row"/);
        assert.doesNotMatch(head, /group-link-row/, 'the headline row carries the class the coverage tool counts');
        assert.equal((r.html.match(/class="group-link-row"/g) || []).length, 3, 'one counted row per group, and only those');
    });
    test('A GROUP: "Copied Group 3\'s link — <first names>." - the names of THAT group', async () => {
        const r = ready(12);
        const call = tapButton(r.sb, r.html, /<button class="btn-outline" onclick="(copyGroupLink\('[^']*group=3'[^"]*\))">/);
        await tick(); await tick();
        assert.deepEqual(r.alerts(), ['Copied Group 3’s link — Rocco, Matt, Jeremy, Sam.']);
        assert.doesNotMatch(r.alerts()[0], /ONLY|scorekeeper/);
        assert.match(call, /'https:\/\/golf-app-5a5\.pages\.dev\/index\.html\?game=MNDY2A&group=3', 3, /, 'the URL is still the first quoted argument - the coverage tool reads it there');
    });
    test('every group row names its own golfers, in roster order', async () => {
        const r = ready(12);
        for (const [g, names] of [[1, 'Marty, Mike, Tanner, Glen'], [2, 'Manny, Matt, Lance, Kopp'], [3, 'Rocco, Matt, Jeremy, Sam']]) {
            const rr = ready(12);
            tapButton(rr.sb, rr.html, new RegExp('<button class="btn-outline" onclick="(copyGroupLink\\(\'[^\']*group=' + g + '\'[^"]*\\))">'));
            await tick(); await tick();
            assert.deepEqual(rr.alerts(), ['Copied Group ' + g + '’s link — ' + names + '.']);
        }
        assert.ok(r.html);
    });
    test("an apostrophe in a name survives the onclick (Rocco O'Ray)", async () => {
        const r = ready(12);
        tapButton(r.sb, r.html, /<button class="btn-outline" onclick="(copyGroupLink\('[^']*group=3'[^"]*\))">/);
        await tick(); await tick();
        assert.match(r.alerts()[0], /Rocco, Matt/);
    });
    test('a foursome: one group, its link, its four names', async () => {
        const r = ready(4);
        assert.doesNotMatch(r.html, /copyRoundLink/);
        tapButton(r.sb, r.html, /<button class="btn-outline" onclick="(copyGroupLink\([^"]*\))">/);
        await tick(); await tick();
        assert.deepEqual(r.alerts(), ['Copied Group 1’s link — Marty, Mike, Tanner, Glen.']);
    });
    test('the old sentence is gone from the page', () => {
        assert.doesNotMatch(read('admin.html'), /Send this ONLY to that group|scorekeeper link!/);
    });
});

// ---------------------------------------------------------------------------
function scorecard(n, opts) {
    const o = opts || {};
    const sb = loadHtmlInlineScript('index.html', [], { search: '?game=MNDY2A' + (o.organizer ? '&organizer=tok' : '') });
    vm.runInContext("window.__alerts = []; alert = m => window.__alerts.push(String(m)); uiRefuse = m => window.__alerts.push(String(m)); uiFail = m => window.__alerts.push(String(m)); uiToast = m => window.__alerts.push(String(m)); document.__mount(document.getElementById('group-links-panel'));", sb);
    const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/MNDY2A');
    const d = round(n); if (o.organizer) d.organizerToken = 'tok';
    h.cb({ val: () => JSON.parse(JSON.stringify(d)), exists: () => true });
    vm.runInContext('groupLinksPanelOpen = true; renderGroupLinksPanel();', sb);
    return { sb, html: String(vm.runInContext("document.getElementById('group-links-panel').innerHTML", sb)), alerts: () => JSON.parse(vm.runInContext('JSON.stringify(window.__alerts)', sb)) };
}

describe('THE SCORECARD\'S GROUP LINKS PANEL (index.html)', () => {
    test('THE ORGANIZER LINK: its own copier, and a caution - it grants the whole field', async () => {
        const s = scorecard(12, { organizer: true });
        const call = tapButton(s.sb, s.html, /<button class="glr-copy" onclick="(copyOrganizerLinkFromScorecard\([^"]*\))">/);
        assert.match(call, /organizer=tok/);
        await tick(); await tick();
        assert.deepEqual(s.alerts(), ['Copied your organizer link. It can correct any score in the round — keep it to yourself.']);
    });
    test('a group row: the button says Copied and no dialog opens (as before)', async () => {
        const s = scorecard(12);
        const m = /<button class="glr-copy" onclick="(copyGroupLinkFromScorecard\('[^']*group=2', 2, this\))">/.exec(s.html);
        assert.ok(m, 'group 2 has no Copy');
        vm.runInContext("window.__btn = { innerHTML: '🔗 Copy' }; (function () { " + m[1].replace(', this)', ', window.__btn)') + " })();", s.sb);
        await tick(); await tick();
        assert.equal(vm.runInContext('window.__btn.innerHTML', s.sb), '✅ Copied');
        assert.deepEqual(s.alerts(), []);
    });
    test('no organizer token: no organizer row, no organizer copier on the page', () => {
        const s = scorecard(12);
        assert.doesNotMatch(s.html, /copyOrganizerLinkFromScorecard|Organizer Link/);
    });
});
