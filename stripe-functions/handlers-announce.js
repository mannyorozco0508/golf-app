// ============================================================================
// E1 sendAnnouncement - THE HANDLER, WITH EVERYTHING INJECTED (2026-11-09).
//
// makeAnnounceHandlers({ db, messaging, now, log }) returns
//   sendAnnouncement(data, { uid }) -> { pushed: n }
//
// `db` is a firebase-admin Database (the tests hand it one on the DB emulator);
// `messaging` is anything with sendEachForMulticast (admin.messaging() in
// production, a recording mock in the tests - nothing is ever really sent from
// a test). Refusals are thrown as AnnounceError {code, reason}; index.js turns
// them into HttpsError with details.reason, as the Stripe callables do.
//
// Order, each step a refusal before anything is written or sent:
//   auth -> ref shape -> tournament + announcement -> owner -> well formed ->
//   not already pushed -> the minute (transaction on announcementSends/<code>)
// then followers -> each follower's pushPrefs and pushTokens -> one multicast
// per 500 tokens -> pushed: n on the announcement (n = FCM's success count).
// ============================================================================
'use strict';

const core = require('./announce-core.js');

class AnnounceError extends Error {
    constructor(reason) {
        super(reason);
        this.reason = reason;
        this.code = core.ERROR_CODES[reason] || 'internal';
    }
}

function makeAnnounceHandlers(deps) {
    const db = deps.db, messaging = deps.messaging;
    const now = deps.now || (() => Date.now());
    const log = deps.log || (() => {});
    const val = async (p) => (await db.ref(p).once('value')).val();

    async function sendAnnouncement(data, ctx) {
        const uid = ctx && ctx.uid;
        if (!uid) throw new AnnounceError(core.REASONS.UNAUTHENTICATED);
        const ref = core.parseAnnounceRef(data);
        if (!ref) throw new AnnounceError(core.REASONS.NOT_FOUND);
        const { code, id } = ref;
        const tournament = await val('tournaments/' + code);
        const announcement = tournament && tournament.announcements ? tournament.announcements[id] || null : null;
        const plan = core.planSend({ uid, tournament, announcement });
        if (!plan.ok) throw new AnnounceError(plan.reason);

        const tx = await db.ref('announcementSends/' + code).transaction(core.claimMinute(now()));
        if (!tx.committed) throw new AnnounceError(core.REASONS.RATE_LIMITED);

        const followers = (await val('tournamentFollowers/' + code)) || {};
        const tokens = [];
        for (const fuid of Object.keys(followers)) {
            if (!core.SAFE_KEY.test(fuid)) continue;
            const prefs = await val('pushPrefs/' + fuid);
            if (!core.pushAllowed(prefs)) continue;
            for (const t of core.tokensOf(await val('pushTokens/' + fuid))) if (tokens.indexOf(t) === -1) tokens.push(t);
        }
        let pushed = 0;
        for (const batch of core.chunk(tokens, core.MULTICAST_MAX)) {
            try {
                const res = await messaging.sendEachForMulticast(core.pushMessage(batch, {
                    code, id, tpl: announcement.tpl, text: announcement.text, eventName: tournament.name
                }));
                pushed += (res && typeof res.successCount === 'number') ? res.successCount : 0;
            } catch (e) {
                log('sendAnnouncement multicast failed', code, id, e && e.message);
            }
        }
        await db.ref('tournaments/' + code + '/announcements/' + id + '/pushed').set(pushed);
        return { pushed };
    }

    return { sendAnnouncement };
}

module.exports = { makeAnnounceHandlers, AnnounceError };
