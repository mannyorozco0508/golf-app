// ============================================================================
// THE REFUSAL CARD SAYS THE UNLOCK IS REMEMBERED (Wave 25)
//
// WHAT WAS ALREADY TRUE, and is not built again here. The organizer gate shipped in
// v189 and was narrowed in Wave 22; the paste-to-claim box on the refusal card
// shipped in v200. A device refused at admin.html?game=CODE already gets a way in:
// "Are you the organizer? Paste your organizer link", an input, and an Unlock setup
// button that validates the pasted link against THIS round's organizerToken and
// stores it locally - no Firebase write, nothing read. organizer_door_test.js (30
// tests) and organizer_link_share_test.js (34) hold all of that, and this wave does
// not touch either mechanism.
//
// WHAT WAS MISSING IS ONE FACT THE GOLFER IS NEVER TOLD: that the unlock PERSISTS.
// The token is written to localStorage golfapp_organizer_<CODE> and held for the
// round from then on - index.html carries a comment saying exactly that - but no
// sentence on the card says it. So the card reads as a per-visit hoop: paste a link
// to get in this time. A golfer who does not know it is remembered either keeps the
// link to hand forever or assumes the app has not really let them in.
//
// THIS IS A COPY DEFECT, WHICH THIS REPO TREATS AS BEHAVIOUR. CLAUDE.md has a
// section on it - twice a screen was reported broken and the SENTENCE was the thing
// that lied - and the rule it gives is to bind the copy to the behaviour rather than
// to a proxy for it. So the assertions below do not merely grep for a word: each one
// that claims persistence is paired with the localStorage key actually being written
// and still honoured on a SECOND arrival with no link at all.
//
// NOTHING IS LOCKED, and the card must not imply otherwise. The gate HIDES doors;
// database.rules.json is untouched and still unpublished, so any client holding the
// six-character code can still write this round. The copy may not say protected,
// secure or locked - the same standing rule the tournament gate carries.
//
// HARNESS, AND THE TRAP I WALKED INTO WRITING IT. admin.html under mini-dom, the
// page answering its own arrival read, which is how organizer_door_test.js reaches
// the same screen. mini-dom decides the SCREEN correctly - style.display on
// #setup-refused-screen is real - but the card's copy is STATIC MARKUP, and mini-dom
// parses no children out of it: document.getElementById('setup-refused-screen')
// .textContent is the EMPTY STRING, not the sentence a golfer reads. My first version
// of this file asserted the copy that way, got three failures, and the fixture
// assertion blamed the gate for letting the device in. CLAUDE.md names this exactly -
// "innerHTML is a string. No child nodes are parsed from it."
//
// SO THE COPY IS READ TWO WAYS, and CLAUDE.md asks for both halves anyway:
//   SOURCE  the #setup-refused-screen markup sliced out of admin.html and run through
//           helpers/decode-escapes.js, because a \uXXXX escape in static markup would
//           otherwise hide a word from a plain regex.
//   RENDERED  a cold Chrome arrival reading innerText off the real screen, which is
//           the only half that can prove the sentence is on screen rather than merely
//           in the file.
// The claim box is different again: renderSetupClaim WRITES it as innerHTML, so
// mini-dom can read that string back, and it is read there.
//
// THE RED BASELINE, measured against the FINAL file per CLAUDE.md's count rule.
// Against main 5f8bc5c (organizer-gate.js and admin.html as they stood), all 13:
//
//     10 PASS / 3 FAIL
//
// THE THREE REDS are the one thing this wave adds, seen three ways: the sentence in
// the claim box, the sentence on the rendered screen, and the words being exported
// from the gate rather than typed into the page.
//
// AND THE TEN GREENS ARE THE FINDING, not the coverage. They are green because the
// organizer gate, the refusal card and the paste-to-claim box were ALREADY BUILT and
// already work: the door refuses the right device, a pasted link is remembered, a
// wrong one is not, a second arrival with no link is let in, and a group link is
// never offered the box. A brief that asked for those to be built was asking for work
// that shipped in v189 and v200. Ten tests saying so is worth more here than ten
// tests going red would have been - but they are not evidence that this wave did
// anything, and should not be read that way.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { decodeEscapes } = require('./helpers/decode-escapes.js');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const run = (sb, e) => vm.runInContext(e, sb);
const tick = (n) => new Promise(r => setTimeout(r, n || 40));

// THE CARD'S OWN MARKUP, not the whole page: a sentence somewhere else in admin.html
// is not on this screen. Sliced from the element and decoded.
const ADMIN_SRC = read('admin.html');
const CARD_SRC = (() => {
    const at = ADMIN_SRC.indexOf('id="setup-refused-screen"');
    const end = ADMIN_SRC.indexOf('<div class="container" id="round-ready-screen"', at);
    return decodeEscapes(ADMIN_SRC.slice(at, end)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
})();

const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const PL = ['Ann', 'Ben', 'Cal', 'Dee'].map((n, i) => ({ id: 101 + i, name: n, hcp: '0', playingForMoney: true }));
const TOKEN = 'tok-wayback-1';
// Owned by SOMEBODY ELSE, with a token: the refused device, which is the only state
// the card is for. A legacy round never meets it and an owned-by-me round never
// meets it either.
const OWNED = { eventName: 'WB', courseName: 'T', players: PL, courseData: CD,
                gameFormat: 'stroke', scores: {}, ownerUid: 'somebody-else', organizerToken: TOKEN };

async function arrive(data, search, opts) {
    const sb = loadHtmlInlineScript('admin.html', [], { search, localStorage: true, beforeRun(sandbox) {
        if (opts && opts.remembered) sandbox.localStorage.setItem('golfapp_organizer_WB', opts.remembered);
        const realDatabase = sandbox.firebase.database;
        sandbox.firebase.database = Object.assign(function () {
            const dbi = realDatabase();
            const origRef = dbi.ref.bind(dbi);
            dbi.ref = (p) => { const r = origRef(p);
                if (p === 'events/WB') r.once = () => Promise.resolve({ val: () => JSON.parse(JSON.stringify(data)), exists: () => !!(data && data.players) });
                return r; };
            return dbi;
        }, realDatabase);
    } });
    // 200ms, not 80. organizerDoor AWAITS the uid before it decides, so a shorter
    // wait reads the screens mid-decision: my first version measured them at 80ms,
    // found the refusal card not yet shown, and the fixture assertion blamed the
    // gate for letting the device in. The screens are read once the door has landed.
    await tick(200);
    const disp = id => run(sb, "document.getElementById('" + id + "').style.display");
    const txt = id => String(run(sb, "(document.getElementById('" + id + "') || {}).innerHTML || ''"));
    return {
        sb,
        refused: disp('setup-refused-screen') === 'block',
        wizard: disp('admin-screen') === 'block',
        // NOT textContent: see the harness note. The card's static copy is read from
        // the decoded source slice, and the screen's own state from style.display.
        card: CARD_SRC,
        claim: txt('setup-claim'),
        stored: () => run(sb, "localStorage.getItem('golfapp_organizer_WB')"),
        claimWith: (v) => { run(sb, "document.getElementById('claim-input').value = " + JSON.stringify(v) + "; submitSetupClaim();"); },
    };
}

const S = {};
before(async () => {
    S.refused = await arrive(OWNED, '?game=WB');
    S.remembered = await arrive(OWNED, '?game=WB', { remembered: TOKEN });
    S.onGroupLink = await arrive(OWNED, '?game=WB&group=1');
});

describe('THE CARD A REFUSED DEVICE SEES', () => {
    test('the fixture really lands on the refusal card, or nothing below proves anything', () => {
        assert.equal(S.refused.refused, true, 'the refusal screen is not shown: the gate let this device in');
        assert.equal(S.refused.wizard, false, 'the wizard is open behind it');
        assert.ok(CARD_SRC.length > 200, 'the card markup could not be sliced');
        assert.match(S.refused.card, /belongs to its organizer/);
    });

    test('IT SAYS THE UNLOCK IS REMEMBERED - the fact the golfer was never told', () => {
        // IN THE CLAIM BOX, not the static paragraph: the sentence answers "and then
        // what?", which is a question you only have once you have seen the box, and
        // rendering it keeps the words in organizer-gate.js where CLAIM_PROMPT lives.
        // Not a word-match dressed up either - the persistence it promises is proved
        // behaviourally two describes down, and this only holds the card to saying it.
        assert.match(S.refused.claim, /remember/i,
            'the card offers a way in but never says it lasts: ' + S.refused.claim);
        assert.match(S.refused.claim, /once/i, 'it does not say you only do this once');
        assert.match(S.refused.claim, /this device/i, 'it does not say WHERE it is remembered');
    });

    test('the way in is still there, and it is still a box you can paste into', () => {
        assert.match(S.refused.claim, /claim-input/, 'the paste box is gone');
        assert.match(S.refused.claim, /Unlock setup/);
        // The prompt is RENDERED by renderSetupClaim, so it is read from the claim box,
        // not from the static slice - it is not in the markup at all.
        assert.match(S.refused.claim, /Are you the organizer\? Paste your organizer link\./);
        assert.match(String(run(S.refused.sb, "document.getElementById('setup-refused-back').href")), /index\.html/,
            'the way back to the scorecard is gone');
    });

    test('and it does NOT claim the round is locked - the gate hides doors, it does not lock them', () => {
        assert.doesNotMatch(S.refused.card, /\b(protected|secure|secured|locked)\b/i,
            'the card claims a protection database.rules.json does not enforce: ' + S.refused.card);
    });
});

describe('THE PERSISTENCE THE SENTENCE PROMISES IS REAL', () => {
    test('pasting the link stores the token for THIS round on THIS device', () => {
        const a = S.refused;
        assert.equal(a.stored(), null, 'something was remembered before the paste');
        a.claimWith('https://golf-app-5a5.pages.dev/index.html?game=WB&organizer=' + TOKEN);
        assert.equal(a.stored(), TOKEN, 'the paste did not remember the token');
    });

    test('a WRONG link remembers nothing, so the promise cannot be got at with any link (CONTROL)', async () => {
        const a = await arrive(OWNED, '?game=WB');
        a.claimWith('https://golf-app-5a5.pages.dev/index.html?game=WB&organizer=not-the-token');
        assert.equal(a.stored(), null, 'a wrong token was remembered');
        assert.equal(a.refused, true);
    });

    test('A SECOND ARRIVAL WITH NO LINK AT ALL is let in - which is what "remembered" means', () => {
        // The assertion that makes the sentence true rather than reassuring. If this
        // failed, the card would be promising something the app does not do.
        assert.equal(S.remembered.refused, false, 'the remembered token did not open the door');
        assert.equal(S.remembered.wizard, true, 'the wizard did not open on the second arrival');
    });
});

describe('WHO DOES NOT GET THE OFFER', () => {
    test('a GROUP LINK gets no claim box - a scorekeeper is not a locked-out organizer', () => {
        // Offering it there invites a golfer to hunt for a secret that is not theirs.
        assert.equal(S.onGroupLink.claim, '', 'the claim box is offered on a group link');
    });
});

// ---------------------------------------------------------------------------
// THE RENDERED HALF. A source slice proves the sentence is in the file; only this
// proves it is on the screen. Cold, and the page decides on its own.
// ---------------------------------------------------------------------------
describe('COLD CHROME: the sentence is on the screen a refused device actually sees', () => {
    let v = null;
    before(async () => {
        const LOOK = `(function () {
          var el = document.getElementById('setup-refused-screen');
          var shown = !!(el && getComputedStyle(el).display !== 'none');
          return JSON.stringify({ shown: shown,
            text: shown ? (el.innerText || '').replace(/\\s+/g, ' ').trim() : '' });
        })()`;
        const r = await arriveCold({ url: fileUrl('admin.html', 'game=WB'),
            db: { events: { WB: OWNED }, global_courses: {}, trips: {}, tournaments: {} },
            settleMs: 3000, viewport: { width: 390, height: 844 },
            steps: [{ expression: LOOK }] });
        v = r.ok ? JSON.parse(r.value[r.value.length - 1]) : { error: r.reason };
    });

    test('the refusal card is on screen and it says the unlock is remembered', () => {
        assert.ok(v && !v.error, 'cold arrival failed: ' + (v && v.error));
        assert.equal(v.shown, true, 'the refusal card is not on screen at all');
        assert.match(v.text, /belongs to its organizer/, 'wrong screen: ' + v.text.slice(0, 200));
        assert.match(v.text, /remember/i, 'the rendered card never says the unlock lasts: ' + v.text.slice(0, 300));
        assert.match(v.text, /Paste your organizer link/, 'the way in is not on screen');
        assert.doesNotMatch(v.text, /\b(protected|secure|secured|locked)\b/i,
            'the rendered card claims a protection nothing enforces');
    });
});

describe('THE SOURCE: ONE SENTENCE, AND NOTHING ELSE MOVED', () => {
    const ADM = read('admin.html');
    const GATE = read('organizer-gate.js');

    test('the gate itself is untouched by this wave', () => {
        // The three arms are v189 and Wave 22 work. This wave adds copy, nothing more.
        // RE-PINNED 2026-10-08: isRoundOrganizer gained the same fourth argument
        // and hands it straight to organizerEvidence. The open-round arm and the
        // token arm are untouched, asserted as controls in
        // trip_organizer_inherits_test.js.
        assert.match(GATE, /function isRoundOrganizer\(data, uid, token, trip\)/);
        // RE-PINNED 2026-10-08 with isRoundOrganizer above: the fourth argument
        // is the round's TRIP record, and a three-argument call still answers
        // exactly as it did.
        assert.match(GATE, /function organizerEvidence\(data, uid, token, trip\)/);
        assert.match(GATE, /function rememberOrganizerToken\(/);
        assert.match(GATE, /var TOKEN_KEY = 'golfapp_organizer_';/);
    });

    test('both sentences come from the gate, not from a second copy in the page', () => {
        assert.match(GATE, /var CLAIM_PROMPT = /);
        assert.match(GATE, /var CLAIM_REMEMBERED = /);
        assert.match(GATE, /CLAIM_REMEMBERED: CLAIM_REMEMBERED/, 'it is not exported');
        assert.match(ADM, /organizerGate\.CLAIM_PROMPT/);
        assert.match(ADM, /organizerGate\.CLAIM_REMEMBERED/);
        [/Are you the organizer\? Paste your organizer link\./, /the link is remembered for this round/]
            .forEach(re => assert.ok(!re.test(ADM),
                'admin.html carries its own copy of ' + re + ', which can drift from the gate'));
    });

    test('the new sentence is TRUE of both routes in, not just the paste box', () => {
        // "once on this device" would be a lie if arriving on the organizer link did
        // not also remember it. Both writers use the same key, which is what makes the
        // sentence safe to say next to the paste box alone.
        // Through the SHARED tokenKey() helper, not by each spelling the prefix out -
        // my first version looked for TOKEN_KEY inside the two bodies and failed on a
        // gate that is better than that: one key builder, two callers.
        assert.match(GATE, /var TOKEN_KEY = 'golfapp_organizer_';/);
        assert.match(GATE, /function tokenKey\(/);
        const kk = GATE.slice(GATE.indexOf('function tokenKey('), GATE.indexOf('function tokenKey(') + 160);
        assert.match(kk, /TOKEN_KEY/, 'tokenKey no longer builds the key from the one prefix');
        ['function claimOrganizerToken', 'function rememberOrganizerToken'].forEach(sig => {
            const at = GATE.indexOf(sig);
            assert.ok(at > -1, sig + ' is gone');
            const body = GATE.slice(at, GATE.indexOf('\n    }', at));
            assert.match(body, /localStorage\.setItem\(tokenKey\(/,
                sig + ' does not write the remembered key, so "once on this device" is not true of it');
        });
    });

    test('database.rules.json is untouched BY THIS WAVE: it hides doors and locks nothing', () => {
        // RE-PINNED 2026-10-05 (was 62ea83f1), and NOT by this wave. The file was
        // replaced with the live ruleset, read out of the database with the
        // service account: the repo copy had drifted 7,675 bytes behind and was
        // missing account exit, My Groups, My Groups sharing and both push nodes.
        // The claim here is about THIS wave, so what it pins is the live sha - a
        // copy-only wave must not move it off production either.
        assert.equal(require('crypto').createHash('sha256').update(read('database.rules.json')).digest('hex').slice(0, 8),
            '31496c1b', 'the rules file moved in a copy-only wave');   // RE-PINNED 2026-10-06 (was db6cecca): the registration-desk wave changes database.rules.json ON PURPOSE and by instruction - registrations/$code/$entryId .write had newData.exists() in BOTH arms, so a delete was refused for everybody including the event owner, and the organizer could not remove a signup. The owner arm now omits it. One line; the create arm, the validate and every other node are untouched. NOT YET PUBLISHED: the repo file was a mirror of production and now diverges from live by exactly this line until Manny approves the deploy, so a live remove still refuses. PUBLISH-THIS and ROLLBACK are on the Desktop.
    });
});
