// ============================================================================
// E1 ORGANIZER ANNOUNCEMENTS - THE PURE RULES (2026-11-09, plan section 1).
//
// No SDK, no I/O. handlers-announce.js reads the database and calls messaging;
// every decision it makes is one of these functions, so the tests can hold each
// rule without an emulator.
//
// Paths (plan, approved 2026-11-09):
//   tournaments/<code>/announcements/<id> = {text<=200, tpl, at, by, pushed?}
//   tournamentFollowers/<code>/<uid>      = {at, team}   (the app writes its own)
//   pushTokens/<uid>/<deviceId>/token     (live, written by the apps)
//   pushPrefs/<uid>                       (live; see pushAllowed below)
// One server-only path the plan does not name: announcementSends/<code> =
// {lastAt}, the server's own clock for the 1-per-minute limit. Clients can
// neither read nor write it (rules block E1).
// ============================================================================
'use strict';

const SAFE_KEY = /^[A-Za-z0-9_-]{1,64}$/;
const TEMPLATES = Object.freeze(['start', 'weather', 'resume', 'results', 'custom']);
const MAX_TEXT = 200;
const RATE_MS = 60 * 1000;
const MULTICAST_MAX = 500;   // FCM's limit per sendEachForMulticast

const REASONS = Object.freeze({
    UNAUTHENTICATED: 'unauthenticated',
    NOT_FOUND: 'not-found',
    NOT_OWNER: 'not-owner',
    BAD_ANNOUNCEMENT: 'bad-announcement',
    ALREADY_SENT: 'already-sent',
    RATE_LIMITED: 'rate-limited'
});
const ERROR_CODES = Object.freeze({
    'unauthenticated': 'unauthenticated',
    'not-found': 'not-found',
    'not-owner': 'permission-denied',
    'bad-announcement': 'failed-precondition',
    'already-sent': 'already-exists',
    'rate-limited': 'resource-exhausted'
});

function parseAnnounceRef(data) {
    if (!data || typeof data !== 'object') return null;
    const code = data.code, id = data.id;
    if (typeof code !== 'string' || typeof id !== 'string') return null;
    if (!SAFE_KEY.test(code) || !SAFE_KEY.test(id)) return null;
    return { code, id };
}

function validAnnouncement(a) {
    return !!(a && typeof a === 'object'
        && typeof a.text === 'string' && a.text.trim().length > 0 && a.text.length <= MAX_TEXT
        && TEMPLATES.indexOf(a.tpl) !== -1
        && typeof a.at === 'number');
}

// OWNER ONLY, and only an announcement that exists, is well formed and has not
// already been pushed (pushed is the server's mark that it went out).
function planSend(input) {
    const uid = input && input.uid;
    if (!uid) return { ok: false, reason: REASONS.UNAUTHENTICATED };
    const t = input.tournament, a = input.announcement;
    if (!t || !a) return { ok: false, reason: REASONS.NOT_FOUND };
    if (!t.ownerUid || t.ownerUid !== uid) return { ok: false, reason: REASONS.NOT_OWNER };
    if (!validAnnouncement(a)) return { ok: false, reason: REASONS.BAD_ANNOUNCEMENT };
    if (a.pushed !== undefined && a.pushed !== null) return { ok: false, reason: REASONS.ALREADY_SENT };
    return { ok: true };
}

// The transaction body for announcementSends/<code>: claims the minute or
// aborts (undefined). Counted on the server, never trusted from a client.
function claimMinute(now) {
    return (cur) => {
        const last = cur && typeof cur.lastAt === 'number' ? cur.lastAt : 0;
        if (now - last < RATE_MS) return undefined;
        return { lastAt: now };
    };
}

// PUSH PREFS. Live pushPrefs/<uid> holds the consumer channels (essentials,
// bets, hype). An organizer note is an essential: a golfer who has turned
// essentials OFF (essentials === false) gets no notification. Absent prefs are
// not a refusal here: following a tournament card in the app is the opt-in,
// and the phone's own permission is what put a token in pushTokens at all.
// (Decision recorded for Manny in the handoff.)
function pushAllowed(prefs) {
    return !(prefs && typeof prefs === 'object' && prefs.essentials === false);
}

function tokensOf(devices) {
    if (!devices || typeof devices !== 'object') return [];
    return Object.keys(devices).map((d) => devices[d] && devices[d].token)
        .filter((t) => typeof t === 'string' && t.length > 0 && t.length <= 400);
}

function chunk(list, n) {
    const out = [];
    for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
    return out;
}

// THE NOTIFICATION, as E1b shows it: the event name as the title (": play
// suspended" on the weather template), the note itself as the body. The data
// block is what the app routes a tap with.
function pushTitle(eventName, tpl) {
    const name = String(eventName || '').trim() || 'HardPan Tournaments';
    return tpl === 'weather' ? name + ': play suspended' : name;
}
function pushMessage(tokens, ctx) {
    return {
        tokens,
        notification: { title: pushTitle(ctx.eventName, ctx.tpl), body: ctx.text },
        data: { kind: 'tournament-announcement', code: ctx.code, id: ctx.id }
    };
}

module.exports = {
    SAFE_KEY, TEMPLATES, MAX_TEXT, RATE_MS, MULTICAST_MAX, REASONS, ERROR_CODES,
    parseAnnounceRef, validAnnouncement, planSend, claimMinute, pushAllowed,
    tokensOf, chunk, pushTitle, pushMessage
};
