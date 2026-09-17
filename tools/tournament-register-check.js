#!/usr/bin/env node
// ============================================================================
// TOURNAMENT REGISTRATION, IN A BROWSER: the signup page paints without a tap,
// and the organizer list paints from the record.
//
// tournament_registration_test.js proves the write path under mini-dom. Mini-dom
// has no layout, so it cannot say a golfer SEES the form: display:block and
// 0x0 are the same to it. This arrives cold on ?register=CODE and on
// ?tourney=CODE as the owner, and measures getBoundingClientRect / innerText.
//
// A DEVICE CHECK MAY NOT CALL A FUNCTION THE PAGE DEFINES. Nothing here calls
// one. The page's own arrival is the entry point.
//
//   CHROME_PATH=/usr/bin/google-chrome node tools/tournament-register-check.js
//
//   exit 0   public signup form has a rect; organizer list names the registrant
//            and the signup link; signed-out owned visitor sees no list
//   exit 1   a divergence the JSON names
//   exit 2   could not run. NOTHING PROVEN.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const course = PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: ((i * 7) % 18) + 1 }));
const teams = {
    team1: { num: 1, name: 'Eagles', players: ['Ann Alpha', 'Bo Bravo'], handicap: 0 },
    team2: { num: 2, name: 'Hawks', players: ['Cal Charlie'], handicap: 0 }
};
const owned = {
    name: 'Signup Scramble', format: 'scramble', courseName: 'Tidewater',
    activeCourseKey: 'tidewater', courseData: course, entryFee: 0, teams,
    createdAt: 1, ownerUid: 'u-org', courseIndexSynthetic: false
};
// Wave 2b: a second owned event with switches set - shirt size OFF, hole
// sponsorship ON - to measure that a switch moves the boxes on a real screen.
const switched = Object.assign({}, owned, { name: 'Switched Scramble', registrationFields: { shirtSize: false, holeSponsorship: true } });
const db = {
    tournaments: { OWNED1: owned, SWITCH1: switched },
    registrations: {
        OWNED1: {
            // Wave 2a shape: the three required fields, the optionals the desk lists.
            e1: { fullName: 'Fay Foxtrot', email: 'fay@example.com', phone: '555-0100', shirtSize: 'L', dinnerCount: 2, createdAt: 10, teamPreference: 'Hawks' }
        }
    },
    events: {}, trips: {}, global_courses: {}
};

const rect = `(sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; }`;
const visible = `(sel) => { const r = (${rect})(sel); return !!(r && r.w > 0 && r.h > 0); }`;

const PUBLIC_PROBE = `
(() => {
  const visible = ${visible};
  const screen = (document.getElementById('register-screen') || {}).innerText || '';
  return JSON.stringify({
    registerVisible: visible('#register-screen'),
    nameVisible: visible('#reg-name'),
    emailVisible: visible('#reg-email'),
    phoneVisible: visible('#reg-phone'),
    shirtVisible: visible('#reg-shirt-wrap'),
    dinnerVisible: visible('#reg-dinner-wrap'),
    sponsorVisible: visible('#reg-sponsor-wrap'),
    submitVisible: visible('#reg-submit'),
    formVisible: visible('#reg-form'),
    teamVisible: visible('#reg-team-wrap'),
    hcpVisible: visible('#reg-handicap-wrap'),
    setupVisible: visible('#setup-screen'),
    manageVisible: visible('#manage-screen'),
    screen: screen,
    lockWords: (screen.match(/\\b(Protected|Secure|Locked|Private)\\b/g) || [])
  });
})()`;

const OWNER_PROBE = `
(() => {
  const visible = ${visible};
  // 2c: the switches and the link are on Setup (#registration-section); the
  // list is on the Desk tab. The owner arm reads Setup on arrival, then taps
  // the Desk pill for real and reads the desk - two probes, one arrival.
  const section = (document.getElementById('registration-section') || {}).innerText || '';
  const desk = (document.getElementById('manage-tab-desk') || {}).innerText || '';
  const manage = (document.getElementById('manage-screen') || {}).innerText || '';
  return JSON.stringify({
    setupVisible: visible('#tab-btn-setup'),
    deskTabVisible: visible('#tab-btn-desk'),
    sectionVisible: visible('#registration-section'),
    deskVisible: visible('#manage-tab-desk'),
    listVisible: visible('#registration-list'),
    desk: desk,
    switchesVisible: visible('#reg-field-shirtSize') && visible('#reg-field-holeSponsorship'),
    switchesText: ((document.querySelector('.reg-fields') || {}).innerText || ''),
    section: section,
    manage: manage,
    lockWords: (manage.match(/\\b(Protected|Secure|Locked|Private)\\b/g) || [])
  });
})()`;

const PUBLIC_SIGNEDOUT_PROBE = `
(() => {
  const visible = ${visible};
  const manage = (document.getElementById('manage-screen') || {}).innerText || '';
  return JSON.stringify({
    sectionExists: !!document.getElementById('registration-section'),
    deskExists: !!document.getElementById('manage-tab-desk') || !!document.getElementById('tab-btn-desk'),
    sectionVisible: visible('#registration-section'),
    fay: /Fay Foxtrot/.test(manage),
    registerLink: /register=OWNED1/.test(manage)
  });
})()`;

async function look(query, probe, auth) {
    const r = await arriveCold({
        url: fileUrl('tournament.html', query),
        db, expression: probe, settleMs: 7000,
        auth: auth === undefined ? 'anonymous' : auth
    });
    if (!r.ok) return { ran: false, reason: r.reason };
    try { return { ran: true, ...JSON.parse(r.value) }; }
    catch (e) { return { ran: false, reason: 'non-JSON: ' + String(r.value).slice(0, 200) }; }
}

(async () => {
    const bail = (why, extra) => {
        console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2));
        process.exit(2);
    };
    const pub = await look('register=OWNED1', PUBLIC_PROBE, 'anonymous');
    const ownerRun = await arriveCold({ url: fileUrl('tournament.html', 'tourney=OWNED1'), db, settleMs: 7000,
        auth: { uid: 'u-org', email: 'org@example.com', isAnonymous: false },
        steps: [{ expression: OWNER_PROBE }, { tap: '#tab-btn-desk' }, { sleep: 300 }, { expression: OWNER_PROBE }] });
    const parse = (v) => { try { return { ran: true, ...JSON.parse(v) }; } catch (e) { return { ran: false, reason: 'non-JSON: ' + String(v).slice(0, 200) }; } };
    const owner = ownerRun.ok ? parse(ownerRun.value[0]) : { ran: false, reason: ownerRun.reason };
    const ownerDesk = ownerRun.ok ? parse(ownerRun.value[3]) : { ran: false, reason: ownerRun.reason };
    const switched = await look('register=SWITCH1', PUBLIC_PROBE, 'anonymous');
    const visitor = await look('tourney=OWNED1', PUBLIC_SIGNEDOUT_PROBE, 'signed-out');
    if (!pub.ran) bail('the public signup did not run: ' + pub.reason);
    if (!owner.ran) bail('the organizer list did not run: ' + owner.reason);
    if (!visitor.ran) bail('the signed-out visitor did not run: ' + visitor.reason);

    const failures = [];
    if (!pub.registerVisible) failures.push('public: #register-screen has no rect');
    if (!pub.nameVisible) failures.push('public: the name box has no rect — the golfer cannot type');
    // Wave 2a: email and phone are required boxes; GHIN/handicap, shirt and dinner
    // are asked on every event; hole sponsorship is hidden until 2b's toggle.
    if (!pub.emailVisible) failures.push('public: the email box has no rect');
    if (!pub.phoneVisible) failures.push('public: the phone box has no rect');
    if (!pub.shirtVisible) failures.push('public: the shirt size box has no rect');
    if (!pub.dinnerVisible) failures.push('public: the dinner count box has no rect');
    if (pub.sponsorVisible) failures.push('public: hole sponsorship is on screen before 2b turns it on');
    if (!pub.submitVisible) failures.push('public: Sign up has no rect');
    if (!pub.formVisible) failures.push('public: the form is not on screen');
    if (!pub.teamVisible) failures.push('public: team preference is hidden on a scramble');
    if (!pub.hcpVisible) failures.push('public: the GHIN / handicap box is hidden (2a asks it on every event, optional)');
    if (pub.setupVisible) failures.push('public: the create-tournament form is on screen behind signup');
    if (pub.manageVisible) failures.push('public: the organizer console is on screen behind signup');
    if (!/Signup Scramble/.test(pub.screen)) failures.push('public: the event name is not in innerText: ' + JSON.stringify(pub.screen).slice(0, 200));
    if (pub.lockWords && pub.lockWords.length) failures.push('public: lock words on screen: ' + JSON.stringify(pub.lockWords));

    if (!owner.setupVisible) failures.push('organizer: Setup tab has no rect');
    // Wave 2b: the switches are on the desk, and a switch moves the public form.
    if (!owner.switchesVisible) failures.push('organizer: the "Ask golfers for" switches have no rect');
    if (!/Ask golfers for/.test(owner.switchesText || '')) failures.push('organizer: the switches row is not in innerText');
    if (!switched.ran) bail('the switched signup did not run: ' + switched.reason);
    if (switched.shirtVisible) failures.push('switched: shirt size is OFF on this event and still has a rect');
    if (!switched.sponsorVisible) failures.push('switched: hole sponsorship is ON on this event and has no rect');
    if (!switched.dinnerVisible) failures.push('switched: dinner guests (default ON) lost its rect');
    if (!owner.sectionVisible) failures.push('organizer: the registration section has no rect');
    if (!/register=OWNED1/.test(owner.section)) failures.push('organizer: the signup link is not on screen');
    if (!owner.deskTabVisible) failures.push('organizer: the Desk tab has no rect');
    if (owner.deskVisible) failures.push('organizer: the Desk panel is on screen before its tab is tapped');
    if (!ownerDesk.ran) failures.push('organizer: the desk probe did not run: ' + ownerDesk.reason);
    if (!ownerDesk.deskVisible || !ownerDesk.listVisible) failures.push('organizer: after tapping Desk the panel or the list has no rect');
    if (!/Fay Foxtrot/.test(ownerDesk.desk || '')) failures.push('organizer: the registrant is not in innerText of the desk');
    if (!/fay@example\.com/.test(ownerDesk.desk || '') || !/555-0100/.test(ownerDesk.desk || '')) failures.push('organizer: email and phone are not on the desk');
    if (!/Shirt L/.test(ownerDesk.desk || '') || !/Dinner 2/.test(ownerDesk.desk || '')) failures.push('organizer: the optionals are not on the desk');
    if (!/Paid/.test(ownerDesk.desk || '')) failures.push('organizer: Paid is not labelled');
    if (!/1 signup · 0 paid · 0 in the field/.test(ownerDesk.desk || '')) failures.push('organizer: the counts line is not on the desk: ' + String(ownerDesk.desk).slice(0, 120));
    if (owner.lockWords && owner.lockWords.length) failures.push('organizer: lock words on screen: ' + JSON.stringify(owner.lockWords));

    if (visitor.sectionExists) failures.push('signed-out: #registration-section still exists — it lives in Setup and must go with the gate');
    if (visitor.deskExists) failures.push('signed-out: the Desk tab or panel still exists — it is gated with Setup (2c)');
    if (visitor.sectionVisible) failures.push('signed-out: the registration list has a rect');
    if (visitor.fay) failures.push('signed-out: a registrant name is on the public manage screen');
    if (visitor.registerLink) failures.push('signed-out: the signup admin link is on the public manage screen');

    console.log(JSON.stringify({
        verdict: failures.length ? 'FAIL' : 'PASS', failures,
        measured: { public: pub, organizer: owner, organizerDesk: ownerDesk, signedOut: visitor }
    }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => {
    console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String((e && e.message) || e) }, null, 2));
    process.exit(2);
});
