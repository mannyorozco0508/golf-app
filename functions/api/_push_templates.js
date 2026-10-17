// ============================================================================
// THE ONLY THINGS /api/push-send WILL SAY (audit H5, 2026-10-16)
//
// The sender used to post whatever `decided.copy` the caller handed it, to
// whatever tokens the caller listed - an open relay: anyone who could reach the
// URL could put any sentence on any phone whose token they had. Now the caller
// names a TEMPLATE by id, with small parameters that are checked here, and the
// words come from this file. Nothing the caller types reaches a lock screen.
//
// THE SHAPE IS push-notify.js's DECISION ({ send, kind, channel, dedupeKey,
// copy: { title, body } }), so fcmMessage builds the message exactly as before.
// The decider still runs on the phone (it says whether to send); this file is
// only what is sent.
//
// ADDING ONE: an id, `params` (name -> the RegExp a value must match - nothing
// else is accepted, and every value is a short string), and `build(params, ctx)`
// where ctx is { uid, now } from the VERIFIED ID token - never from the body.
// ============================================================================

export const TEMPLATES = {
    // The admin screen's "Send me a test notification" (Wave 39): the same words
    // pushDecide made for it - kind 'youre-in', round 'Test notification', 'right now'.
    test: {
        params: {},
        build: (p, ctx) => ({
            send: true, kind: 'youre-in', channel: 'essentials', roundCode: 'TEST',
            dedupeKey: 'test:' + ctx.uid + ':' + Math.floor(ctx.now / 60000),
            copy: { title: "You're in", body: 'Test notification, right now' },
            extra: { test: '1' }
        })
    }
};

const MAX_PARAM = 40;

// { decided } or { error }. An unknown id, an unknown parameter, a value that is
// not a short string matching its pattern: refused, never trimmed into shape.
export function buildFromTemplate(id, params, ctx) {
    const t = typeof id === 'string' && Object.prototype.hasOwnProperty.call(TEMPLATES, id) ? TEMPLATES[id] : null;
    if (!t) return { error: 'bad_template' };
    const p = params == null ? {} : params;
    if (typeof p !== 'object' || Array.isArray(p)) return { error: 'bad_params' };
    const out = {};
    for (const k of Object.keys(p)) {
        const re = Object.prototype.hasOwnProperty.call(t.params, k) ? t.params[k] : null;
        const v = p[k];
        if (!re || typeof v !== 'string' || v.length > MAX_PARAM || !re.test(v)) return { error: 'bad_params' };
        out[k] = v;
    }
    return { decided: t.build(out, ctx) };
}
